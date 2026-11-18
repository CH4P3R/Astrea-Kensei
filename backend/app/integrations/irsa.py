"""SPHEREx discovery and bounded cutout downloads from the IRSA archive.

SIA discovery follows notebooks/01-data-overview. Collections are discovered
from IRSA; only compatible
SPHEREx Level 2 FITS products are offered; search never downloads the images.

Cutouts are read by HTTP byte ranges (see irsa_ranges), fetching one plane at
a time. The IBE cutout service remains the fallback for any file that cannot
be read that way. Brief archive failures are retried (see http_retry).
"""

from dataclasses import dataclass
from io import BytesIO
import logging
import math
import re
import time
from threading import Lock
import warnings
from urllib.parse import urlsplit

from astropy.io import fits
from astroquery.ipac.irsa import Irsa
import numpy as np
from pyvo.dal.exceptions import DALAccessError, DALOverflowWarning
from pyvo.dal.sia2 import SIA2Service
import requests

from app.integrations import irsa_ranges
from app.integrations.http_retry import count_retries, is_transient, timeout_until, with_retries


logger = logging.getLogger(__name__)
ARCHIVE_ORIGIN = "https://irsa.ipac.caltech.edu"
MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024
DOWNLOAD_SECONDS = 90
MAX_SEARCH_ROWS = 10000
COLLECTION_TTL_SECONDS = 3600
COLLECTION_RETRY_SECONDS = 60
# Image planes that share IMAGE's grid and can be fetched on demand.
PLANE_EXTENSIONS = ("FLAGS", "ZODI", "VARIANCE")
_IMAGE_PATH = re.compile(r"/ibe/data/spherex/([A-Za-z0-9][A-Za-z0-9_-]*)/level2/[A-Za-z0-9_./-]+\.fits")


class ArchiveError(Exception):
    """IRSA could not supply a usable response."""


class ArchiveTimeout(ArchiveError):
    """IRSA exceeded the network or download deadline."""


class SearchTooBroad(ArchiveError):
    """The archive truncated the search; narrower dates are required."""


@dataclass(frozen=True)
class ArchiveImage:
    source_url: str
    observation_id: str | None
    detector: int | None
    collection: str
    observed_start_mjd: float | None
    observed_end_mjd: float | None


def _image_url(url: str) -> tuple[str, str]:
    """Accept only unmodified archive URLs produced by our SIA search."""
    parts = urlsplit(url)
    match = _IMAGE_PATH.fullmatch(parts.path)
    if (
        parts.scheme != "https"
        or parts.netloc != "irsa.ipac.caltech.edu"
        or parts.query
        or parts.fragment
        or match is None
        or any(part in (".", "..", "") for part in parts.path.split("/")[1:])
    ):
        raise ArchiveError("IRSA returned an unsupported image URL.")
    return url, match.group(1)


def _number(value) -> float | None:
    if value is None or np.ma.is_masked(value):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def _text(value) -> str | None:
    if value is None or np.ma.is_masked(value):
        return None
    return value.decode("utf-8") if isinstance(value, bytes) else str(value)


def _coordinates(ra_deg: float, dec_deg: float) -> None:
    if not (math.isfinite(ra_deg) and 0 <= ra_deg < 360):
        raise ValueError("ra_deg must be finite and within [0, 360).")
    if not (math.isfinite(dec_deg) and -90 <= dec_deg <= 90):
        raise ValueError("dec_deg must be finite and within [-90, 90].")


def _search_transient(error: BaseException) -> bool:
    """The VO client wraps HTTP failures; retry only brief archive hiccups."""
    cause = getattr(error, "cause", None)
    if isinstance(error, DALAccessError) and isinstance(cause, BaseException):
        return is_transient(cause)
    return is_transient(error)


class _SiaAdapter(requests.adapters.HTTPAdapter):
    """Astroquery's VO client otherwise sends requests without a timeout."""

    def __init__(self, deadline=None):
        super().__init__()
        self.deadline = deadline

    def send(self, request, **kwargs):
        parts = urlsplit(request.url)
        if (parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu"
                or parts.path not in ("/SIA", "/SIA/", "/SIA/capabilities",
                                      "/TAP/sync", "/TAP/capabilities")):
            raise ArchiveError("IRSA attempted an unexpected discovery redirect.")
        if kwargs.get("timeout") is None or self.deadline is not None:
            kwargs["timeout"] = timeout_until(self.deadline, read=60)
        return super().send(request, **kwargs)


def align_plane(content: bytes, extension: str, grid) -> bytes:
    """FITS holding `extension` on the loaded image's grid, cut from a cutout-service response.

    The service may clip its window one pixel differently from the loaded
    image. Samples of the image grid that the service did not return are NaN
    for float planes and the file's MISSING_DATA bit (or 0) for FLAGS.
    """
    width, height = int(grid[2]), int(grid[3])
    try:
        with fits.open(BytesIO(content), memmap=False) as hdus:
            dx, dy = irsa_ranges.grid_origin(hdus["IMAGE"].header, grid)
            hdu = hdus[extension]
            data, source = hdu.data, hdu.header
            if data is None or data.ndim != 2:
                raise ValueError(f"{extension} is not a two-dimensional image.")
            if data.dtype.kind == "f":
                fill = np.nan
            else:
                bit = next((int(key[4:]) for key in source if key.startswith("MSKN") and key[4:].isdigit()
                            and str(source[key]).strip().upper() == "MISSING_DATA"), None)
                fill = 0 if bit is None else 1 << bit
            aligned = np.full((height, width), fill, dtype=data.dtype.newbyteorder("="))
            x0, y0 = max(dx, 0), max(dy, 0)
            x1, y1 = min(dx + width, data.shape[1]), min(dy + height, data.shape[0])
            if x1 > x0 and y1 > y0:
                aligned[y0 - dy:y1 - dy, x0 - dx:x1 - dx] = data[y0:y1, x0:x1]
            header = fits.Header([card for card in source.cards
                                  if card.keyword.startswith(irsa_ranges.PLANE_CARDS)])
        output = BytesIO()
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(aligned, header=header, name=extension)]).writeto(output)
        return output.getvalue()
    except (irsa_ranges.PartialReadError, OSError, ValueError, TypeError, KeyError, IndexError) as exc:
        raise ArchiveError("IRSA returned a cutout that does not match the loaded image.") from exc


class IrsaClient:
    def __init__(self, ranges: irsa_ranges.RangeReader | None = None, budget_seconds: float = 120.0):
        self.ranges = ranges if ranges is not None else irsa_ranges.RangeReader()
        self.budget_seconds = budget_seconds
        self._collection_names: tuple[str, ...] = ()
        self._collections_refresh_at = 0.0
        self._registry_unavailable_until = 0.0
        self._collections_lock = Lock()

    def _collections(self, client) -> tuple[str, ...]:
        """Refresh IRSA's registry hourly; retain the last good list on outages.

        Astroquery uses TAP for this metadata-only registry query. Image searches
        still use SIA. The lock prevents concurrent searches refreshing together.
        """
        with self._collections_lock:
            if time.monotonic() < self._registry_unavailable_until:
                raise DALAccessError("IRSA collection registry is cooling down after a failure.")
            if self._collection_names and time.monotonic() < self._collections_refresh_at:
                return self._collection_names
            try:
                table = with_retries(
                    lambda: client.list_collections(servicetype="SIA", filter="spherex"),
                    transient=_search_transient,
                )
                names = tuple(sorted({name for value in table["collection"]
                                      if (name := _text(value))
                                      and re.fullmatch(r"spherex(?:_[A-Za-z0-9_-]+)?", name)}))
                if not names:
                    raise ArchiveError("IRSA advertised no SPHEREx image collections.")
            except (ArchiveError, DALAccessError, requests.RequestException,
                    KeyError, TypeError, ValueError) as error:
                if not self._collection_names:
                    if isinstance(error, (DALAccessError, requests.RequestException)):
                        self._registry_unavailable_until = time.monotonic() + COLLECTION_RETRY_SECONDS
                    raise
                logger.warning("IRSA collection refresh failed; using last discovered collections.")
                self._collections_refresh_at = time.monotonic() + COLLECTION_RETRY_SECONDS
                return self._collection_names
            self._collection_names = names
            self._registry_unavailable_until = 0.0
            self._collections_refresh_at = time.monotonic() + COLLECTION_TTL_SECONDS
            return names

    def _deadline(self) -> float:
        return time.monotonic() + self.budget_seconds

    def search(
        self,
        *,
        ra_deg: float,
        dec_deg: float,
        detector: int | None,
        limit: int,
        start_mjd: float | None = None,
        end_mjd: float | None = None,
    ) -> list[ArchiveImage]:
        """Return at most limit + 1 rows, newest first, to detect truncation.

        Date bounds are inclusive and apply to the observation start time.
        Fetch complete metadata before sorting, filtering, and limiting locally.
        """
        if type(limit) is not int or not 1 <= limit <= 100:
            raise ValueError("limit must be an integer from 1 to 100.")
        return self.search_all(
            ra_deg=ra_deg, dec_deg=dec_deg, detector=detector,
            start_mjd=start_mjd, end_mjd=end_mjd,
        )[:limit + 1]

    def search_all(
        self, *, ra_deg: float, dec_deg: float, detector: int | None,
        start_mjd: float | None = None, end_mjd: float | None = None,
        deadline: float | None = None,
    ) -> list[ArchiveImage]:
        """Complete metadata for one interval, or SearchTooBroad on truncation.

        Used by both limited image discovery and the annual availability index.
        The latter supplies a shared deadline while splitting dense intervals.
        """
        _coordinates(ra_deg, dec_deg)
        if detector is not None and (type(detector) is not int or not 1 <= detector <= 6):
            raise ValueError("detector must be an integer from 1 to 6.")
        for value in (start_mjd, end_mjd):
            if value is not None and not math.isfinite(value):
                raise ValueError("Date bounds must be finite MJD values.")
        if start_mjd is not None and end_mjd is not None and start_mjd > end_mjd:
            raise ValueError("The start date must not exceed the end date.")
        # SIA TIME tests interval overlap. Apply start-time semantics locally too.
        constraints = {}
        if start_mjd is not None or end_mjd is not None:
            constraints["TIME"] = f"{start_mjd if start_mjd is not None else '-Inf'} {end_mjd if end_mjd is not None else '+Inf'}"
        client = Irsa()
        client.sia_url = ARCHIVE_ORIGIN + "/SIA"
        try:
            with client._session, warnings.catch_warnings():
                warnings.simplefilter("error", DALOverflowWarning)
                client._session.mount("https://", _SiaAdapter(deadline))
                client._session.mount("http://", _SiaAdapter(deadline))
                # IRSA's query endpoint is already known. Avoid the preliminary
                # /capabilities request, whose HTTP failures PyVO flattens into
                # an unstructured error that our query retries cannot recognize.
                client._sia = SIA2Service(
                    client.sia_url, session=client._session, check_baseurl=False,
                )
                try:
                    selection = {"collection": list(self._collections(client))}
                except (DALAccessError, requests.RequestException):
                    # No cached registry yet: SIA can select the mission directly,
                    # including releases whose names we have never seen.
                    logger.warning("IRSA collection registry unavailable; searching SIA by facility.")
                    selection = {"facility": "SPHEREx"}
                table = with_retries(lambda: client.query_sia(
                    # Follow the official introductory notebook: a one-arcsecond cone.
                    pos=(ra_deg, dec_deg, 1 / 3600),
                    **selection,
                    maxrec=MAX_SEARCH_ROWS,
                    **constraints,
                ), transient=_search_transient, deadline=deadline)
            if len(table) >= MAX_SEARCH_ROWS:
                raise SearchTooBroad("Narrow the observation dates to complete the search.")
            images = {}
            for row in table:
                raw_url = _text(row["access_url"]) or ""
                # New collections may include cubes or other products we cannot render.
                # Skip those, while preserving strict URL validation for Level 2 files.
                if not _IMAGE_PATH.fullmatch(urlsplit(raw_url).path):
                    continue
                source_url, collection = _image_url(raw_url)
                band = re.fullmatch(r"SPHEREx-D([1-6])", _text(row["energy_bandpassname"]) or "")
                row_detector = int(band.group(1)) if band else None
                observed_start = _number(row["t_min"])
                if (observed_start is None
                        or (detector is not None and row_detector != detector)
                        or (start_mjd is not None and observed_start < start_mjd)
                        or (end_mjd is not None and observed_start > end_mjd)):
                    continue
                images[source_url] = ArchiveImage(
                    source_url=source_url,
                    observation_id=_text(row["obs_id"]),
                    detector=row_detector,
                    collection=collection,
                    observed_start_mjd=observed_start,
                    observed_end_mjd=_number(row["t_max"]),
                )
            return sorted(images.values(), key=lambda item: (
                -item.observed_start_mjd, item.source_url,
            ))
        except DALOverflowWarning as exc:
            raise SearchTooBroad("Narrow the observation dates to complete the search.") from exc
        except requests.Timeout as exc:
            raise ArchiveTimeout("IRSA search timed out. Please try again.") from exc
        except DALAccessError as exc:
            if isinstance(getattr(exc, "cause", None), requests.Timeout):
                raise ArchiveTimeout("IRSA search timed out. Please try again.") from exc
            raise ArchiveError("IRSA search is temporarily unavailable.") from exc
        except (requests.RequestException, KeyError, TypeError, ValueError) as exc:
            raise ArchiveError("IRSA returned an invalid search response.") from exc

    def _logged(self, operation: str, label: str | None, run):
        """Run `run(path)` and log one timing line; run sets path[0] to "service" on fallback."""
        started, path, outcome, size = time.monotonic(), ["ranges"], "error", 0
        with count_retries() as retries:
            try:
                content = run(path)
                outcome, size = "ok", len(content)
                return content
            finally:
                logger.info("IRSA %s image=%s path=%s outcome=%s bytes=%d seconds=%.2f retries=%d",
                            operation, label or "-", path[0], outcome, size,
                            time.monotonic() - started, retries[0])

    def download_cutout(
        self, source_url: str, ra_deg: float, dec_deg: float, size_deg: float, label: str | None = None,
    ) -> bytes:
        """FITS bytes for a selected cutout; only IMAGE is guaranteed to be present.

        Reads just the IMAGE window by byte ranges. If the file cannot be read
        that way, the cutout service supplies the cutout with every extension.
        """
        source_url, _ = _image_url(source_url)
        _coordinates(ra_deg, dec_deg)
        if not math.isfinite(size_deg) or size_deg <= 0:
            raise ValueError("size_deg must be positive and finite.")
        deadline = self._deadline()

        def run(path):
            content = self._partial(
                lambda: self.ranges.read_cutout(source_url, ra_deg, dec_deg, size_deg, deadline))
            if content is not None:
                return content
            path[0] = "service"
            return self._service_cutout(source_url, ra_deg, dec_deg, size_deg, deadline)
        return self._logged("cutout", label, run)

    def download_plane(
        self, source_url: str, ra_deg: float, dec_deg: float, size_deg: float,
        extension: str, grid: tuple[float, float, int, int], label: str | None = None,
    ) -> bytes:
        """FITS bytes holding `extension` on exactly the grid of an already loaded image.

        `grid` is (crpix1, crpix2, width, height) of that image. The plane is
        read by byte ranges over that window; otherwise the cutout service's
        plane is aligned to it (see align_plane).
        """
        source_url, _ = _image_url(source_url)
        _coordinates(ra_deg, dec_deg)
        if not math.isfinite(size_deg) or size_deg <= 0:
            raise ValueError("size_deg must be positive and finite.")
        if extension not in PLANE_EXTENSIONS:
            raise ValueError("Unknown image plane.")
        crpix1, crpix2, width, height = grid
        if not (math.isfinite(crpix1) and math.isfinite(crpix2) and int(width) > 0 and int(height) > 0):
            raise ValueError("grid must hold a finite reference pixel and a positive size.")
        deadline = self._deadline()

        def run(path):
            content = self._partial(lambda: self.ranges.read_plane(source_url, extension, grid, deadline))
            if content is not None:
                return content
            path[0] = "service"
            return align_plane(self._service_cutout(source_url, ra_deg, dec_deg, size_deg, deadline), extension, grid)
        return self._logged(f"plane {extension}", label, run)

    @staticmethod
    def _partial(read):
        """Run a byte-range read; None means "use the cutout service instead"."""
        try:
            return read()
        except requests.Timeout as exc:
            raise ArchiveTimeout("IRSA download timed out. Please try again.") from exc
        except requests.RequestException as exc:
            raise ArchiveError("IRSA download is temporarily unavailable.") from exc
        except (irsa_ranges.PartialReadError, OSError, ValueError, TypeError, KeyError, IndexError) as exc:
            logger.warning("Partial download unavailable (%s); using the IRSA cutout service.", exc)
            return None

    def spectral_sample(self, source_url, grid, pixel_x, pixel_y):
        """Calibrated wavelength/bandwidth at a native pixel of a loaded cutout."""
        from app.integrations.spectral_calibration import sample

        source_url, release = _image_url(source_url)
        try:
            return sample(self.ranges, source_url, release, grid, pixel_x, pixel_y, self._deadline())
        except requests.Timeout as error:
            raise ArchiveTimeout("IRSA spectral calibration request timed out.") from error
        except requests.RequestException as error:
            raise ArchiveError("IRSA spectral calibration is temporarily unavailable.") from error

    def _service_cutout(
        self, source_url: str, ra_deg: float, dec_deg: float, size_deg: float, deadline: float | None = None,
    ) -> bytes:
        """Download a cutout from the IBE service, rejecting redirects and oversized data."""
        params = {"center": f"{ra_deg:.12f},{dec_deg:.12f}d", "size": str(size_deg), "gzip": "false"}

        def fetch() -> bytes:
            started = time.monotonic()
            stop = started + DOWNLOAD_SECONDS if deadline is None else min(started + DOWNLOAD_SECONDS, deadline)
            with requests.get(
                source_url, params=params, stream=True,
                timeout=timeout_until(deadline), allow_redirects=False,
            ) as response:
                if 300 <= response.status_code < 400:
                    raise ArchiveError("IRSA returned an unexpected image redirect.")
                response.raise_for_status()
                chunks, total = [], 0
                for chunk in response.iter_content(chunk_size=65536):
                    if time.monotonic() > stop:
                        raise ArchiveTimeout("IRSA cutout download timed out.")
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ArchiveError("IRSA cutout exceeds the download limit. Request a smaller region.")
                    chunks.append(chunk)
                return b"".join(chunks)

        try:
            content = with_retries(fetch, deadline=deadline)
        except requests.Timeout as exc:
            raise ArchiveTimeout("IRSA cutout download timed out. Please try again.") from exc
        except requests.RequestException as exc:
            raise ArchiveError("IRSA cutout download is temporarily unavailable.") from exc
        if not content.startswith(b"SIMPLE  ="):
            raise ArchiveError("IRSA did not return a FITS cutout.")
        return content
