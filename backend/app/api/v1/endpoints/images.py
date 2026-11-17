"""Image discovery and access; scientific work stays in the service layer."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from fastapi.responses import FileResponse

from app.api.dependencies import get_image_service
from app.schemas.images import (
    BoxSearchResponse, BoxSelection, ImageAvailabilityQuery, ImageAvailabilityResponse,
    ImageMetadata, ImageRecropRequest, ImageSearchQuery, ImageSearchResponse, PlaneMetadata, PlaneName,
)
from app.services.images import ImageService
from app.schemas.sky import BoxSearchRequest, ClickSearchRequest, ProjectionRequest
from app.services.image_geometry import box_selection, click_to_icrs, directions_to_icrs, project_image

router = APIRouter(prefix="/images", tags=["images"])
Service = Annotated[ImageService, Depends(get_image_service)]
ImageId = Annotated[str, Path(pattern=r"^[0-9a-f]{64}$", description="Cutout ID returned by image search.")]


@router.get("", response_model=ImageSearchResponse)
def search_images(query: Annotated[ImageSearchQuery, Query()], service: Service):
    """Search DR1 and QR3 observations, newest first, without downloading FITS."""
    return service.search(query)


@router.get("/availability", response_model=ImageAvailabilityResponse)
def image_availability(query: Annotated[ImageAvailabilityQuery, Query()], service: Service):
    """List every available observation day in a UTC year without downloading FITS."""
    return service.availability(query)


@router.get("/{image_id}", response_model=ImageMetadata)
def image_metadata(image_id: ImageId, service: Service):
    """Load a selected cutout and return its dimensions, WCS and provenance."""
    return service.metadata(image_id)


@router.get(
    "/{image_id}/pixels", response_class=FileResponse,
    responses={200: {"content": {"application/octet-stream": {
        "schema": {"type": "string", "format": "binary"}}},
        "description": "IMAGE values, unmodified unless a correction is requested. Decode with the dtype, byte order and shape from the metadata endpoint."}},
)
def image_pixels(
    image_id: ImageId, service: Service,
    subtract_zodi: Annotated[bool, Query(description="Subtract the zodiacal-light model (IMAGE - ZODI).")] = False,
    mask_flags: Annotated[bool, Query(description="Replace samples carrying a bad quality flag with NaN.")] = False,
    signal_to_noise: Annotated[bool, Query(description="Divide by the per-pixel standard deviation (sqrt of VARIANCE).")] = False,
):
    """Return contiguous little-endian floats; preserve NaN, infinity and negatives.

    Without options the IMAGE plane is returned untouched. Each option fetches
    its plane from the archive the first time it is used for an image.
    """
    if not (subtract_zodi or mask_flags or signal_to_noise):
        return FileResponse(service.pixels(image_id), media_type="application/octet-stream")
    return Response(service.corrected_pixels(
        image_id, subtract_zodi=subtract_zodi, mask_flags=mask_flags, signal_to_noise=signal_to_noise,
    ), media_type="application/octet-stream")


@router.get("/{image_id}/planes/{plane}", response_model=PlaneMetadata)
def plane_metadata(image_id: ImageId, plane: PlaneName, service: Service):
    """Load an extra plane (flags, zodi or variance) and describe how to decode it."""
    return service.plane(image_id, plane)


@router.get(
    "/{image_id}/planes/{plane}/pixels", response_class=FileResponse,
    responses={200: {"content": {"application/octet-stream": {
        "schema": {"type": "string", "format": "binary"}}},
        "description": "Unmodified plane values on the image's grid: int32 for flags, float32 for zodi and variance."}},
)
def plane_pixels(image_id: ImageId, plane: PlaneName, service: Service):
    """Return the plane as contiguous little-endian values, row zero at the bottom."""
    return FileResponse(service.plane_pixels(image_id, plane), media_type="application/octet-stream")


@router.post("/search", response_model=ImageSearchResponse)
def search_from_click(request: ClickSearchRequest, service: Service):
    """Convert the local-sky click to ICRS and discover available FITS observations."""
    ra, dec = click_to_icrs(request.direction, request.observer.model_dump(), request.at)
    return service.search(ImageSearchQuery(
        ra_deg=ra, dec_deg=dec, size_deg=request.size_arcmin / 60,
        detector=request.detector, limit=request.limit,
        start_time=request.start_time, end_time=request.end_time,
    ))


@router.post("/search-box", response_model=BoxSearchResponse)
def search_from_box(request: BoxSearchRequest, service: Service):
    """Convert a box dragged on the local sky to an ICRS centre and cutout size, then search."""
    box = box_selection(directions_to_icrs(request.corners, request.observer.model_dump(), request.at))
    result = service.search(ImageSearchQuery(
        ra_deg=box.ra_deg, dec_deg=box.dec_deg, size_deg=box.size_deg,
        detector=request.detector, limit=request.limit,
        start_time=request.start_time, end_time=request.end_time,
    ))
    return BoxSearchResponse(**result.model_dump(), selection=BoxSelection(
        center={"ra_deg": box.ra_deg, "dec_deg": box.dec_deg},
        size_deg=box.size_deg,
        corners=[{"ra_deg": ra, "dec_deg": dec} for ra, dec in box.corners],
    ))


@router.post("/load/{image_id}", response_model=ImageMetadata)
def load_image(image_id: ImageId, service: Service):
    """Download/decode the selected FITS cutout, or reuse its cache."""
    return service.metadata(image_id)


@router.post("/{image_id}/projection")
def image_projection(image_id: ImageId, request: ProjectionRequest, service: Service):
    """Project the image WCS mesh into the same local frame as the stars."""
    return project_image(service.metadata(image_id), request.observer.model_dump(),
                         request.at, request.mode == "live")


@router.post("/{image_id}/recrop", response_model=ImageMetadata)
def recrop_image(image_id: ImageId, request: ImageRecropRequest, service: Service):
    """Request a new native-resolution window from the same observation."""
    return service.recrop(image_id, request.size_deg)
