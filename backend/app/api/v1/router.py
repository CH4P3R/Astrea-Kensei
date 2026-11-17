"""Register feature routers here as endpoints are implemented."""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.images import router as images_router

from app.api.v1.endpoints.stars import router as stars_router
from app.api.v1.endpoints.solar_system import router as solar_system_router
from app.api.v1.endpoints.targets import router as targets_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(images_router)

api_router.include_router(stars_router)
api_router.include_router(solar_system_router)
api_router.include_router(targets_router)
