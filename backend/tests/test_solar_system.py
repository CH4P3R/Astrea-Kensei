"""Physical and HTTP checks for the lightweight topocentric ephemerides."""

from datetime import datetime, timezone
import json
from unittest.mock import patch

import astropy.units as u
from astropy.coordinates import AltAz, EarthLocation, GCRS, SkyCoord, get_body, get_sun
from astropy.time import Time
from astropy.utils import iers
import numpy as np
import pytest

from app.application import create_app
from app.services.sky import EarthOrientationUnavailable, horizon_vectors
from app.services.solar_system import calculate_solar_system
from test_images_api import post


OBSERVER = {"latitude_deg": 0., "longitude_deg": 0., "elevation_m": 0.}
AT = datetime(2025, 3, 20, 12, 7, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def offline_iers():
    with iers.conf.set_temp("auto_download", False):
        yield


def body(snapshot, identifier):
    return next(item for item in snapshot["bodies"] if item["id"] == identifier)


def test_sun_is_near_zenith_at_equatorial_equinox_noon_and_below_opposite_horizon():
    sun = body(calculate_solar_system(OBSERVER, AT, False), "sun")
    assert sun["directions"][0][1] > np.sin(np.deg2rad(89))
    opposite = body(calculate_solar_system(OBSERVER | {"longitude_deg": 180.}, AT, False), "sun")
    assert opposite["directions"][0][1] < -np.sin(np.deg2rad(89))

    # get_sun uses a separate geocentric polynomial path from get_body. Its
    # full-distance AltAz transform should agree to well below one arcsecond.
    time = Time(AT)
    frame = AltAz(obstime=time, location=EarthLocation.from_geodetic(0*u.deg, 0*u.deg), pressure=0*u.hPa)
    reference = get_sun(time).transform_to(frame)
    np.testing.assert_allclose(sun["directions"][0],
                               horizon_vectors(reference.alt.rad, reference.az.rad), atol=1e-6)


def test_moon_has_topocentric_parallax_not_an_infinite_distance_star_direction():
    actual = body(calculate_solar_system(OBSERVER, AT, False), "moon")
    time = Time(AT)
    geocentric = get_body("moon", time, ephemeris="builtin")
    # Dropping distance deliberately reproduces the common incorrect treatment
    # of the nearby Moon as a distant catalog star.
    distant = SkyCoord(ra=geocentric.ra, dec=geocentric.dec, frame=GCRS(obstime=time))
    horizontal = distant.transform_to(AltAz(obstime=time,
        location=EarthLocation.from_geodetic(0*u.deg, 0*u.deg), pressure=0*u.hPa))
    incorrect_direction = horizon_vectors(horizontal.alt.rad, horizontal.az.rad)
    separation = np.rad2deg(np.arccos(np.clip(np.dot(actual["directions"][0], incorrect_direction), -1, 1)))
    assert 0.7 < separation < 1.1
    assert 350000 < actual["distance_km"][0] < 420000


def test_live_samples_are_small_finite_normalized_and_match_the_paused_instant():
    live = calculate_solar_system(OBSERVER, AT, True)
    paused = calculate_solar_system(OBSERVER, AT, False)
    assert live["coordinate_frame"] == "AltAz"
    assert live["refraction"] is False
    assert live["ephemeris"] == "builtin"
    assert live["mode"] == "live" and paused["mode"] == "paused"
    times = live["sample_times_ms"]
    assert len(times) == 13
    assert np.diff(times).tolist() == [10000] * 12
    assert paused["sample_times_ms"] == times[:1]
    assert times[0] == round(AT.timestamp() * 1000)
    assert len(json.dumps(live, allow_nan=False).encode()) < 8192
    for sample, fixed in zip(live["bodies"], paused["bodies"], strict=True):
        assert len(sample["directions"]) == len(times)
        np.testing.assert_allclose(np.linalg.norm(sample["directions"], axis=1), 1, atol=2e-10)
        assert sample["directions"][0] == fixed["directions"][0]
        assert not np.allclose(sample["directions"][0], sample["directions"][-1])
        assert len(sample["angular_radius_deg"]) == len(times)
        assert all(0.23 < radius < 0.30 for radius in sample["angular_radius_deg"])
        assert all(0 <= fraction <= 1 for fraction in sample["illumination"])
    moon = body(live, "moon")
    np.testing.assert_allclose(np.linalg.norm(moon["light_directions"], axis=1), 1, atol=2e-10)


@pytest.mark.parametrize(("date", "illuminated"), [
    (datetime(2025, 3, 14, 6, 55, tzinfo=timezone.utc), True),
    (datetime(2025, 3, 29, 10, 58, tzinfo=timezone.utc), False),
])
def test_lunar_lighting_points_toward_sun_and_distinguishes_full_from_new(date, illuminated):
    snapshot = calculate_solar_system(OBSERVER, date, False)
    moon = body(snapshot, "moon")
    sun = body(snapshot, "sun")
    light = np.asarray(moon["light_directions"][0])
    geometry = np.asarray(sun["directions"][0]) * sun["distance_km"][0]
    geometry -= np.asarray(moon["directions"][0]) * moon["distance_km"][0]
    geometry /= np.linalg.norm(geometry)
    np.testing.assert_allclose(light, geometry, atol=1e-9)
    assert moon["illumination"][0] > 0.999 if illuminated else moon["illumination"][0] < 0.001


def test_api_solar_system_does_not_load_the_star_catalog():
    app = create_app()
    with patch.object(app.state.star_service, "selected", side_effect=AssertionError("Unexpected star catalog access")):
        response = post(app, "/api/v1/solar-system", json={
            "observer": OBSERVER, "at": AT.isoformat(), "mode": "paused",
        })
    assert response.status_code == 200, response.text
    payload = response.json()
    assert [item["id"] for item in payload["bodies"]] == ["sun", "moon"]
    assert payload["observer"] == OBSERVER
    assert len(payload["sample_times_ms"]) == 1


@pytest.mark.parametrize("changes", [
    {"observer": OBSERVER | {"latitude_deg": 91}},
    {"observer": OBSERVER | {"longitude_deg": -181}},
    {"at": "2025-03-20T12:07:00"},
    {"mode": "unknown"},
    {"bodies": ["pluto"]},
])
def test_api_rejects_invalid_observer_time_and_unsupported_options(changes):
    response = post(create_app(), "/api/v1/solar-system", json={
        "observer": OBSERVER, "at": AT.isoformat(), "mode": "paused",
    } | changes)
    assert response.status_code == 422


def test_api_reuses_the_earth_orientation_error_contract():
    with patch("app.services.solar_system.observation_context", side_effect=EarthOrientationUnavailable("No IERS coverage")):
        response = post(create_app(), "/api/v1/solar-system", json={
            "observer": OBSERVER, "at": AT.isoformat(), "mode": "paused",
        })
    assert response.status_code == 422
    assert "Earth-orientation" in response.json()["detail"]
