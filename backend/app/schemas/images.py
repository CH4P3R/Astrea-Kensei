"""Public contracts for searching and reading SPHEREx image cutouts."""

from typing import Any, Literal
from datetime import date

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator


class ImageSearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ra_deg: float = Field(ge=0, lt=360, description="ICRS right ascension in degrees.")
    dec_deg: float = Field(ge=-90, le=90, description="ICRS declination in degrees.")
    size_deg: float = Field(gt=0, le=0.5, description="Requested square cutout side in degrees; maximum 0.5.")
    detector: int | None = Field(default=None, ge=1, le=6)
    limit: int = Field(default=20, ge=1, le=100)
    start_time: AwareDatetime | None = Field(default=None, description="Inclusive observation-start lower bound, ISO 8601 with timezone.")
    end_time: AwareDatetime | None = Field(default=None, description="Inclusive observation-start upper bound, ISO 8601 with timezone.")

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_time and self.end_time and self.start_time > self.end_time:
            raise ValueError("start_time must not be later than end_time")
        return self


class SkyPosition(BaseModel):
    ra_deg: float
    dec_deg: float
    frame: Literal["ICRS"] = "ICRS"


class CutoutRequest(SkyPosition):
    size_deg: float


class ImageRecropRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    size_deg: float = Field(gt=0, le=0.5)


class ObservationTime(BaseModel):
    start_mjd: float | None
    end_mjd: float | None
    start_utc: str | None
    end_utc: str | None
    time_scale: Literal["UTC"] = "UTC"


class ImageSummary(BaseModel):
    id: str
    observation_id: str | None
    detector: int | None
    collection: str = Field(description="Archive release identifier from the FITS path, not a SIA survey collection name.")
    observation: ObservationTime
    requested: CutoutRequest
    source_url: str = Field(description="Original full FITS URL for provenance; use pixels_url to render the cutout.")
    metadata_url: str
    pixels_url: str


class ImageSearchResponse(BaseModel):
    query: ImageSearchQuery
    images: list[ImageSummary]
    has_more: bool
    order: Literal["observation_start_desc"] = "observation_start_desc"


class ImageAvailabilityQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ra_deg: float = Field(ge=0, lt=360, description="ICRS right ascension in degrees.")
    dec_deg: float = Field(ge=-90, le=90, description="ICRS declination in degrees.")
    year: int = Field(ge=1, le=9998, description="UTC calendar year to index, January 1 through December 31.")
    detector: int | None = Field(default=None, ge=1, le=6)


class ObservationDay(BaseModel):
    date: date
    count: int = Field(gt=0, description="Distinct supported FITS URLs with an exposure starting on this UTC day.")


class ImageAvailabilityResponse(BaseModel):
    year: int
    days: list[ObservationDay]
    complete: Literal[True] = True
    time_scale: Literal["UTC"] = "UTC"


class BoxSelection(BaseModel):
    center: SkyPosition = Field(description="ICRS centre used for the search.")
    size_deg: float = Field(description="Side of the north-aligned square cutout that covers the box.")
    corners: list[SkyPosition] = Field(description="The dragged corners in ICRS, in the order they were sent.")


class BoxSearchResponse(ImageSearchResponse):
    selection: BoxSelection


class HeaderCard(BaseModel):
    keyword: str
    value: str | int | float | bool | None
    comment: str


class ImageDataMetadata(BaseModel):
    width: int
    height: int
    dtype: Literal["float32", "float64"]
    byte_order: Literal["little"]
    array_order: Literal["C"]
    pixel_origin: Literal["lower-left"]
    unit: str | None
    finite_min: float | None
    finite_max: float | None
    nonfinite_count: int
    center: SkyPosition
    footprint: list[list[float]]
    wcs_header: list[HeaderCard]
    fits_metadata: dict[str, Any]


class ImageMetadata(ImageSummary):
    image: ImageDataMetadata


class SpectralQuery(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    ra_deg: float = Field(ge=0, lt=360)
    dec_deg: float = Field(ge=-90, le=90)


class SpectralSample(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)

    pixel_x: int = Field(ge=1, description="One-based column in the loaded cutout.")
    pixel_y: int = Field(ge=1, description="One-based row in the loaded cutout, from the bottom.")
    detector_x: int = Field(ge=1, description="One-based column in the full original IMAGE, in sky orientation, not electronics coordinates.")
    detector_y: int = Field(ge=1, description="One-based row in the full original IMAGE, in sky orientation.")
    wavelength_um: float = Field(gt=0, description="CWAVE value at the native pixel containing the target, in micrometers.")
    bandwidth_um: float = Field(gt=0, description="CBAND bandwidth in micrometers; not a measurement uncertainty.")


class SpectralCalibration(BaseModel):
    source_url: str
    method: Literal["CWAVE/CBAND"] = "CWAVE/CBAND"


class SpectralMetadata(BaseModel):
    """One native pixel's calibrated spectral sampling, not a compatibility certificate."""

    image_id: str
    target: SkyPosition
    status: Literal["available", "unavailable"]
    reason: Literal["outside_image", "invalid_wcs", "calibration_unavailable",
                    "calibration_mismatch", "invalid_calibration"] | None = None
    sample: SpectralSample | None = None
    calibration: SpectralCalibration | None = None

    @model_validator(mode="after")
    def consistent_status(self):
        if self.status == "available":
            if self.sample is None or self.calibration is None or self.reason is not None:
                raise ValueError("Available spectral data require a sample and calibration provenance.")
        elif self.reason is None or self.sample is not None:
            raise ValueError("Unavailable spectral data require a reason and no sample.")
        return self


PlaneName = Literal["flags", "zodi", "variance"]


class FlagBit(BaseModel):
    bit: int = Field(description="Bit position: a sample carries the flag when (value >> bit) & 1 is 1.")
    name: str
    description: str | None


class PlaneMetadata(BaseModel):
    """An extra plane on exactly the same pixel grid as the image's pixels."""

    image_id: str
    plane: PlaneName
    extension: str = Field(description="FITS extension the plane was read from.")
    width: int
    height: int
    dtype: Literal["int32", "float32"]
    byte_order: Literal["little"]
    array_order: Literal["C"]
    pixel_origin: Literal["lower-left"]
    unit: str | None = Field(description="BUNIT of the extension when it states one.")
    flag_bits: list[FlagBit] = Field(description="Bit definitions from the file; empty except for flags.")
    masked_flags: list[str] = Field(description="Flag names that mask_flags=true rejects in this file; empty except for flags.")
    masked_bits: int = Field(description="Bitmask of masked_flags: a sample is rejected when (value & masked_bits) != 0.")
    pixels_url: str
