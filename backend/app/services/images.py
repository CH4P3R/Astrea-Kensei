"""Search orchestration and lazy decoding of selected cutouts."""

from dataclasses import asdict
from hashlib import sha256
import json
from pathlib import Path
from threading import Lock

from astropy.time import Time
import numpy as np

from app.integrations.cutout_store import CacheError, CutoutStore
from app.integrations.irsa import IrsaClient
from app.schemas.images import (
    ImageAvailabilityQuery, ImageAvailabilityResponse, ImageMetadata,
    ImageSearchQuery, ImageSearchResponse, ImageSummary, PlaneMetadata,
)
from app.services.image_availability import ObservationAvailability
from app.services.fits_image import PLANES, decode_cutout, decode_plane
from app.core.config import DEFAULT_BAD_FLAGS
from app.services.quality import bad_bits, corrected


def _utc(mjd: float | None) -> str | None:
    return None if mjd is None else f"{Time(mjd, format='mjd', scale='utc').isot}Z"


class ImageService:
    def __init__(self, archive: IrsaClient, store: CutoutStore, api_prefix: str,
                 bad_flags: tuple[str, ...] = DEFAULT_BAD_FLAGS):
        self.archive = archive
        self.store = store
        self.api_prefix = api_prefix
        self.bad_flags = bad_flags
        # A fixed-size lock pool avoids duplicate downloads within a worker.
        self._locks = [Lock() for _ in range(32)]
        self._availability = ObservationAvailability()

    def availability(self, query: ImageAvailabilityQuery) -> ImageAvailabilityResponse:
        return self._availability.get(query, self.archive)

    def _summary(self, identifier: str, selection: dict) -> ImageSummary:
        archive = selection["archive"]
        start, end = archive["observed_start_mjd"], archive["observed_end_mjd"]
        return ImageSummary(
            id=identifier, observation_id=archive["observation_id"],
            detector=archive["detector"], collection=archive["collection"],
            source_url=archive["source_url"], requested=selection["requested"],
            observation={"start_mjd": start, "end_mjd": end,
                         "start_utc": _utc(start), "end_utc": _utc(end)},
            metadata_url=f"{self.api_prefix}/images/{identifier}",
            pixels_url=f"{self.api_prefix}/images/{identifier}/pixels",
        )

    def search(self, query: ImageSearchQuery) -> ImageSearchResponse:
        candidates = self.archive.search(
            ra_deg=query.ra_deg, dec_deg=query.dec_deg, detector=query.detector,
            limit=query.limit,
            start_mjd=float(Time(query.start_time).mjd) if query.start_time else None,
            end_mjd=float(Time(query.end_time).mjd) if query.end_time else None,
        )
        requested = {"ra_deg": query.ra_deg, "dec_deg": query.dec_deg,
                     "size_deg": query.size_deg, "frame": "ICRS"}
        images = []
        for candidate in candidates[:query.limit]:
            selection = {"archive": asdict(candidate), "requested": requested}
            # Include the format version, source and exact cutout geometry.
            identity = {"format_version": 1, "source_url": candidate.source_url,
                        "requested": requested}
            identifier = sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
            self.store.register(identifier, selection)
            images.append(self._summary(identifier, selection))
        return ImageSearchResponse(query=query, images=images, has_more=len(candidates) > query.limit)

    def metadata(self, identifier: str) -> ImageMetadata:
        selection = self.store.selection(identifier)
        lock = self._locks[int(identifier[:8], 16) % len(self._locks)]
        with lock:
            metadata = self.store.metadata(identifier)
            if metadata is None:
                request = selection["requested"]
                content = self.archive.download_cutout(
                    source_url=selection["archive"]["source_url"],
                    ra_deg=request["ra_deg"], dec_deg=request["dec_deg"], size_deg=request["size_deg"],
                    label=identifier,
                )
                decoded = decode_cutout(content)
                # Validate the public contract before caching a completed image.
                metadata = ImageMetadata(**self._summary(identifier, selection).model_dump(),
                                         image=decoded.metadata).model_dump(mode="json")
                self.store.save_image(identifier, metadata, decoded.pixels)
            result = ImageMetadata.model_validate(metadata)
            # Route configuration can change without invalidating scientific data.
            result.metadata_url = f"{self.api_prefix}/images/{identifier}"
            result.pixels_url = f"{self.api_prefix}/images/{identifier}/pixels"
            return result

    def recrop(self, identifier: str, size_deg: float) -> ImageMetadata:
        selection = self.store.selection(identifier)
        center = self.metadata(identifier).image.center
        requested = {**center.model_dump(), "size_deg": size_deg}
        identity = {"format_version": 1, "source_url": selection["archive"]["source_url"],
                    "requested": requested}
        cropped_id = sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        self.store.register(cropped_id, {"archive": selection["archive"], "requested": requested})
        return self.metadata(cropped_id)

    def pixels(self, identifier: str) -> Path:
        self.metadata(identifier)
        return self.store.pixels_path(identifier)

    def plane(self, identifier: str, plane: str) -> PlaneMetadata:
        """Describe an extra plane, downloading it the first time it is asked for."""
        image = self.metadata(identifier).image
        selection = self.store.selection(identifier)
        with self._locks[int(identifier[:8], 16) % len(self._locks)]:
            metadata = self.store.plane_metadata(identifier, plane)
            if metadata is None:
                request = selection["requested"]
                crpix = {card.keyword: card.value for card in image.wcs_header}
                content = self.archive.download_plane(
                    source_url=selection["archive"]["source_url"],
                    ra_deg=request["ra_deg"], dec_deg=request["dec_deg"], size_deg=request["size_deg"],
                    extension=PLANES[plane][0],
                    grid=(float(crpix["CRPIX1"]), float(crpix["CRPIX2"]), image.width, image.height),
                    label=identifier,
                )
                decoded = decode_plane(content, plane, image.width, image.height)
                metadata = decoded.metadata
                self.store.save_plane(identifier, plane, metadata, decoded.pixels)
        # Masking policy and routes are configuration, so they are not cached.
        names, bits = bad_bits(metadata["flag_bits"], self.bad_flags)
        return PlaneMetadata(
            **metadata, image_id=identifier, masked_flags=names, masked_bits=bits,
            pixels_url=f"{self.api_prefix}/images/{identifier}/planes/{plane}/pixels",
        )

    def plane_pixels(self, identifier: str, plane: str) -> Path:
        self.plane(identifier, plane)
        return self.store.plane_path(identifier, plane)

    def corrected_pixels(self, identifier: str, *, subtract_zodi: bool = False,
                         mask_flags: bool = False, signal_to_noise: bool = False) -> bytes:
        """The image's pixels with the requested corrections; same dtype and layout.

        Each correction downloads its plane on first use. Rejected or
        undefined samples are NaN, like nonfinite samples in the raw pixels.
        """
        image = self.metadata(identifier).image
        shape = (image.height, image.width)

        def load(path: Path, dtype: str) -> np.ndarray:
            try:
                return np.fromfile(path, dtype=dtype).reshape(shape)
            except (OSError, ValueError) as error:
                raise CacheError("Could not read cached pixels") from error

        pixels = load(self.store.pixels_path(identifier), "<f4" if image.dtype == "float32" else "<f8")
        zodi = load(self.plane_pixels(identifier, "zodi"), "<f4") if subtract_zodi else None
        variance = load(self.plane_pixels(identifier, "variance"), "<f4") if signal_to_noise else None
        flags, mask = None, 0
        if mask_flags:
            mask = self.plane(identifier, "flags").masked_bits
            flags = load(self.store.plane_path(identifier, "flags"), "<i4")
        return corrected(pixels, zodi=zodi, variance=variance, flags=flags, bad_mask=mask).tobytes(order="C")
