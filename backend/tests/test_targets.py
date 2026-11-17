"""Acceptance targets: file validation, proper-motion propagation and the API route."""

from pathlib import Path
import re

import astropy.units as u
from astropy.coordinates import SkyCoord
import pytest

from app.application import create_app
from app.core.config import Settings
from app.services.targets import TargetFileError, TargetService, load_targets
from test_images_api import get

REPO_TARGETS = Path(__file__).resolve().parents[1] / "targets.yaml"
ENTRY = """
  - name: Star
    simbad_id: "* star"
    ra_deg: 10.0
    dec_deg: 20.0
    pmra_mas_yr: 0
    pmdec_mas_yr: 1000
    expected: motion
"""


def write(tmp_path, text):
    path = tmp_path / "targets.yaml"
    path.write_text(text)
    return path


def test_repository_file_lists_the_five_acceptance_targets():
    file = load_targets(REPO_TARGETS)
    assert [t.name for t in file.targets] == [
        "Barnard's Star", "Epsilon Indi B", "WISE 0855-0714", "RW Aurigae", "R Draconis"]
    assert all(t.reference for t in file.targets)
    assert 2025 < file.epoch < 2027 and file.size_deg == 0.1


def test_propagation_moves_each_target_by_its_proper_motion():
    response = TargetService(REPO_TARGETS, "/api/v1").targets()
    by_name = {t.name: t for t in response.targets}
    years = response.epoch - 2000.0
    barnard = by_name["Barnard's Star"]
    # 10.39"/yr over ~26 years: about 4.5 arcminutes, outside a 0.1° box centred on the J2000 position.
    assert barnard.motion_arcsec == pytest.approx(10.393 * years, rel=0.01)
    assert barnard.motion_arcsec / 3600 > response.size_deg / 2
    assert by_name["WISE 0855-0714"].motion_arcsec == pytest.approx(8.151 * years, rel=0.01)
    assert by_name["RW Aurigae"].motion_arcsec < 1
    # Barnard's Star moves almost due north.
    assert barnard.position.dec_deg > barnard.catalog.dec_deg
    assert barnard.position.ra_deg == pytest.approx(barnard.catalog.ra_deg, abs=0.01)


def test_propagated_position_matches_an_independent_calculation(tmp_path):
    target = TargetService(write(tmp_path, "epoch: 2010.0\nsize_deg: 0.2\ntargets:" + ENTRY), "/api/v1").targets().targets[0]
    expected = SkyCoord(ra=10 * u.deg, dec=20 * u.deg).spherical_offsets_by(0 * u.deg, 10 * u.arcsec)
    assert SkyCoord(ra=target.position.ra_deg * u.deg, dec=target.position.dec_deg * u.deg) \
        .separation(expected).arcsec < 0.01
    assert target.search.size_deg == 0.2
    assert target.images_url == (f"/api/v1/images?ra_deg={target.search.ra_deg}"
                                 f"&dec_deg={target.search.dec_deg}&size_deg=0.2")


@pytest.mark.parametrize("text", [
    "epoch: 2025.9\nsize_deg: 0.1\ntargets: []\n",
    "epoch: 2025.9\nsize_deg: 0.1\ntargets:" + ENTRY + ENTRY,
    "epoch: 2025.9\nsize_deg: 0.9\ntargets:" + ENTRY,
    "epoch: 2025.9\nsize_deg: 0.1\ntargets:" + ENTRY.replace("ra_deg: 10.0", "ra_deg: 400"),
    "epoch: 2025.9\nsize_deg: 0.1\ntargets:" + ENTRY.replace("expected: motion", "expected: wobble"),
    "epoch: 2025.9\nsize_deg: 0.1\ntargets:" + ENTRY + "    colour: red\n",
    "epoch: [unclosed\n",
])
def test_invalid_files_fail_with_the_path(tmp_path, text):
    path = write(tmp_path, text)
    with pytest.raises(TargetFileError, match=re.escape(str(path))):
        load_targets(path)


def test_missing_file_stops_the_app(tmp_path):
    with pytest.raises(TargetFileError):
        create_app(Settings(cutout_cache_dir=tmp_path / "c", targets_path=tmp_path / "absent.yaml"))


def test_targets_route(tmp_path):
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    response = get(app, "/api/v1/targets")
    assert response.status_code == 200
    body = response.json()
    assert len(body["targets"]) == 5
    first = body["targets"][0]
    assert set(first) == {"name", "simbad_id", "expected", "detector", "reference", "catalog",
                          "position", "motion_arcsec", "search", "images_url"}
    assert first["images_url"].startswith("/api/v1/images?ra_deg=")
