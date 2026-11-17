"""Lightweight Sun/Moon positions, independent of the star catalog."""

from fastapi import APIRouter

from app.schemas.sky import ProjectionRequest
from app.services.solar_system import calculate_solar_system

router = APIRouter(tags=["solar-system"])


@router.post("/solar-system")
def solar_system(request: ProjectionRequest):
    """Apparent topocentric Sun/Moon positions for the shared observer clock."""
    return calculate_solar_system(request.observer.model_dump(), request.at,
                                  request.mode == "live")
