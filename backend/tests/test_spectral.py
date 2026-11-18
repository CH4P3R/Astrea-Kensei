"""Native-pixel selection checks independent of a WCS forward/inverse round trip."""

import math
from types import SimpleNamespace

from astropy.wcs import NoConvergence

from app.services import spectral


def image():
    # The reference position is deliberately off-center in a rectangular image.
    header = {"CTYPE1": "RA---TAN", "CTYPE2": "DEC--TAN", "RADESYS": "ICRS",
              "CRVAL1": 359.999, "CRVAL2": 0.0, "CRPIX1": 5, "CRPIX2": 2,
              "CDELT1": 0.01, "CDELT2": 0.01, "CUNIT1": "deg", "CUNIT2": "deg"}
    return SimpleNamespace(width=7, height=3,
                           wcs_header=[SimpleNamespace(keyword=key, value=value) for key, value in header.items()])


def test_reference_sky_position_maps_to_fits_reference_pixel_not_image_center():
    assert spectral.target_pixel(image(), 359.999, 0) == ((4, 1), None)


def test_analytic_tangent_plane_offset_crosses_ra_zero_without_axis_flip():
    # Along the equator, TAN x = tan(delta RA). A one-pixel positive x
    # offset is therefore atan(CDELT1 in radians), independently of Astropy.
    offset = math.degrees(math.atan(math.radians(0.01)))
    ra = (359.999 + offset) % 360
    assert spectral.target_pixel(image(), ra, 0) == ((5, 1), None)
    # The y axis follows the same analytic construction at delta RA = 0.
    assert spectral.target_pixel(image(), 359.999, offset) == ((4, 2), None)


def test_failed_sip_inversion_is_explicitly_unavailable(monkeypatch):
    def inverse(*args, **kwargs):
        raise NoConvergence("SIP inversion did not converge")

    fake = SimpleNamespace(celestial=SimpleNamespace(has_celestial=True, world_to_pixel=inverse))
    monkeypatch.setattr(spectral, "WCS", lambda header: fake)
    assert spectral.target_pixel(image(), 359.999, 0) == (None, "invalid_wcs")
