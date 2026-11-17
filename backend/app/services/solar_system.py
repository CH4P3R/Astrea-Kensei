"""Small observer-relative Sun/Moon ephemerides using Astropy's bundled model.

get_body includes light-travel time and the observing EarthLocation. Keeping its
distance through the AltAz transform is essential for lunar parallax.
https://docs.astropy.org/en/stable/api/astropy.coordinates.get_body.html
https://docs.astropy.org/en/stable/coordinates/solarsystem.html
"""

import astropy.units as u
from astropy.constants import R_sun
from astropy.coordinates import get_body
from astropy.utils import iers
import numpy as np

from app.services.sky import horizon_vectors, observation_context


BODY_RADII_KM = {"sun": R_sun.to_value(u.km), "moon": 1737.4}


def calculate_solar_system(observer, at, live):
    """Sample apparent topocentric directions, angular radii and lunar lighting.

    The lighting is a visual Sun/Moon geometry model: it does not simulate
    eclipses, lunar topography or atmospheric effects. It shares the same
    unrefracted east/up/south frame as stars and FITS images.
    """
    milliseconds, times, frame, status = observation_context(observer, at, live)
    bodies = []
    positions = {}
    for identifier, radius in BODY_RADII_KM.items():
        # observation_context uses (samples, 1); preserve that shape to avoid
        # accidentally broadcasting time against itself into an NxN array.
        apparent = get_body(identifier, times[:, None], location=frame.location,
                            ephemeris="builtin")
        horizontal = apparent.transform_to(frame)
        direction = horizon_vectors(horizontal.alt.rad, horizontal.az.rad).reshape(-1, 3)
        distance = horizontal.distance.to_value(u.km).reshape(-1)
        if (not np.all(np.isfinite(direction)) or not np.all(np.isfinite(distance))
                or np.any(distance <= radius)):
            raise ValueError("The solar-system calculation produced invalid positions.")
        positions[identifier] = direction * distance[:, None]
        bodies.append({
            "id": identifier,
            "directions": np.round(direction, 10).tolist(),
            "angular_radius_deg": np.round(np.rad2deg(np.arcsin(radius / distance)), 8).tolist(),
            "distance_km": np.round(distance, 3).tolist(),
            "illumination": np.ones(len(times)).tolist(),
        })

    # The shader needs incoming illumination in local sky axes, not a fixed
    # left/right crescent. This rotates the bright limb correctly with the view.
    moon_to_sun = positions["sun"] - positions["moon"]
    moon_to_sun /= np.linalg.norm(moon_to_sun, axis=1, keepdims=True)
    moon_to_observer = -positions["moon"] / np.linalg.norm(positions["moon"], axis=1, keepdims=True)
    phase_cosine = np.sum(moon_to_sun * moon_to_observer, axis=1)
    moon = bodies[1]
    moon["light_directions"] = np.round(moon_to_sun, 10).tolist()
    moon["illumination"] = np.round(np.clip((1 + phase_cosine) / 2, 0, 1), 8).tolist()

    return {
        "observer": observer,
        "mode": "live" if live else "paused",
        "coordinate_frame": "AltAz",
        "refraction": False,
        "ephemeris": "builtin",
        "earth_orientation": "predicted" if np.any(status == iers.FROM_IERS_A_PREDICTION) else "measured",
        "sample_times_ms": milliseconds.tolist(),
        "bodies": bodies,
        "limitations": "No atmospheric refraction, terrain, daylight visibility, or eclipse model. Lunar lighting is approximate.",
    }
