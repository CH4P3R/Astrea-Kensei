"""Locate the native image pixel for an ICRS target without resampling intensity."""

import math

import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.wcs import NoConvergence, WCS


def target_pixel(image, ra_deg: float, dec_deg: float):
    """Return ((column, row), None) or (None, unavailable reason).

    Integer zero-based pixel centers have edges at +/- 0.5. Use the pixel
    containing the requested sky position, never the cutout center or a pixel
    index copied from another observation. The right/top outer edges are
    excluded. Out-of-field coordinates are not clamped to an unrelated pixel.
    """
    try:
        header = fits.Header()
        for card in image.wcs_header:
            header[card.keyword] = card.value
        spatial = WCS(header).celestial
        if not spatial.has_celestial:
            return None, "invalid_wcs"
        x, y = (float(value) for value in spatial.world_to_pixel(
            SkyCoord(ra=ra_deg * u.deg, dec=dec_deg * u.deg, frame="icrs")))
        if not all(math.isfinite(value) for value in (x, y)):
            return None, "outside_image"
        if not (-0.5 <= x < image.width - 0.5 and -0.5 <= y < image.height - 0.5):
            return None, "outside_image"
        return (math.floor(x + 0.5), math.floor(y + 0.5)), None
    except (NoConvergence, ValueError, TypeError, KeyError, IndexError, AttributeError):
        return None, "invalid_wcs"
