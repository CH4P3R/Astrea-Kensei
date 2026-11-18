"""Exercise the HTTP contract with real decoding/cache and a local archive fake."""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from io import BytesIO
from threading import Event

from astropy.io import fits
from astropy.wcs import WCS
import httpx
import numpy as np
import pytest

from app.application import create_app
from app.core.config import Settings
from app.integrations.irsa import ArchiveError, ArchiveImage, ArchiveTimeout


QUERY = {"ra_deg": 210.80227, "dec_deg": 54.34895, "size_deg": 0.1}
SOURCE = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/x.fits"


class FakeArchive:
    def __init__(self):
        self.searches = []
        self.downloads = []
        self.search_error = None
        self.download_error = None
        self.rows = [ArchiveImage(
            source_url=SOURCE, observation_id="observation-1", detector=2,
            collection="dr1", observed_start_mjd=60000.0,
            observed_end_mjd=60000.001,
        )]
        self.values = np.array([[0, -2.5, np.nan], [4.25, np.inf, 6]], dtype=np.float32)
        spatial = WCS(naxis=2)
        spatial.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        spatial.wcs.radesys = "ICRS"
        spatial.wcs.crpix = [2, 1.5]
        spatial.wcs.crval = [QUERY["ra_deg"], QUERY["dec_deg"]]
        spatial.wcs.cdelt = [-0.001, 0.001]
        header = spatial.to_header()
        header["BUNIT"] = "MJy/sr"
        header["OBSID"] = "observation-1"
        header["DETECTOR"] = 2
        stream = BytesIO()
        fits.HDUList([
            fits.PrimaryHDU(),
            fits.ImageHDU(self.values, header=header, name="IMAGE"),
        ]).writeto(stream)
        self.content = stream.getvalue()

    def search(self, **kwargs):
        self.searches.append(kwargs)
        if self.search_error:
            raise self.search_error
        return self.rows

    def download_cutout(self, **kwargs):
        self.downloads.append(kwargs)
        if self.download_error:
            raise self.download_error
        return self.content


@pytest.fixture
def backend(tmp_path):
    archive = FakeArchive()
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    app.state.image_service.archive = archive
    return app, archive


def get(app, path, **kwargs):
    async def request():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            return await client.get(path, **kwargs)

    return asyncio.run(request())


def search_one(app, **overrides):
    response = get(app, "/api/v1/images", params={**QUERY, **overrides})
    assert response.status_code == 200, response.text
    return response.json()["images"][0]


def spectral_reader(monkeypatch, archive):
    calls = []

    def sample(**kwargs):
        calls.append(kwargs)
        x, y = kwargs["pixel_x"], kwargs["pixel_y"]
        return {"status": "available", "reason": None,
                "sample": {"detector_x": x + 101, "detector_y": y + 201,
                           "wavelength_um": 1.1 + x * 0.01 + y * 0.001, "bandwidth_um": 0.025},
                "calibration": {"source_url": "https://irsa.ipac.caltech.edu/data/SPHEREx/dr1/cal/spectral_wcs/test.fits",
                                "method": "CWAVE/CBAND"}}

    monkeypatch.setattr(archive, "spectral_sample", sample, raising=False)
    return calls


def spectral_target(app, item, x, y):
    metadata = get(app, item["metadata_url"]).json()
    header = fits.Header()
    for card in metadata["image"]["wcs_header"]:
        header[card["keyword"]] = card["value"]
    ra, dec = WCS(header).pixel_to_world_values(x, y)
    return {"ra_deg": float(ra), "dec_deg": float(dec)}


def test_spectral_uses_requested_native_pixel_and_preserves_original_data(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    original = get(app, item["pixels_url"]).content
    calls = spectral_reader(monkeypatch, archive)
    target = spectral_target(app, item, 2.15, 0.1)
    result = get(app, f"/api/v1/images/{item['id']}/spectral", params=target)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["target"] == {**target, "frame": "ICRS"}
    assert data["sample"] == {"pixel_x": 3, "pixel_y": 1, "detector_x": 103, "detector_y": 201,
                              "wavelength_um": 1.12, "bandwidth_um": 0.025}
    assert calls[0]["pixel_x"] == 2 and calls[0]["pixel_y"] == 0
    assert calls[0]["grid"] == (2.0, 1.5, 3, 2)
    assert calls[0]["source_url"] == SOURCE
    assert get(app, item["pixels_url"]).content == original


def test_spectral_enriches_old_cached_cutout_and_persists_native_pixel_sample(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    first_target = spectral_target(app, item, 0.1, 0.1)
    second_target = spectral_target(app, item, 0.2, 0.2)
    archive.download_error = ArchiveError("Existing image must not be downloaded again")
    calls = spectral_reader(monkeypatch, archive)
    path = f"/api/v1/images/{item['id']}/spectral"
    first = get(app, path, params=first_target)
    assert first.status_code == 200
    # A second sky point in the same native pixel keeps its own requested
    # coordinates while sharing that pixel's calibrated spectral values.
    second = get(app, path, params=second_target).json()
    assert second["sample"] == first.json()["sample"]
    assert second["target"] == {**second_target, "frame": "ICRS"}
    assert len(calls) == 1
    restarted = create_app(Settings(cutout_cache_dir=app.state.image_service.store.root))
    offline = FakeArchive()
    offline.download_error = ArchiveError("Use persistent cache")
    restarted.state.image_service.archive = offline
    assert get(restarted, path, params=first_target).json() == first.json()
    assert offline.downloads == []


def test_spectral_outside_image_does_not_clamp_or_fetch_calibration(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    calls = spectral_reader(monkeypatch, archive)
    target = spectral_target(app, item, -0.6, 0.1)
    result = get(app, f"/api/v1/images/{item['id']}/spectral", params=target).json()
    assert result["status"] == "unavailable" and result["reason"] == "outside_image"
    assert result["sample"] is None and calls == []


def test_spectral_unknown_is_retryable_and_does_not_block_image(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    target = spectral_target(app, item, 1, 0)
    path = f"/api/v1/images/{item['id']}/spectral"
    monkeypatch.setattr(archive, "spectral_sample", lambda **kwargs: {
        "status": "unavailable", "reason": "calibration_unavailable", "sample": None, "calibration": None,
    }, raising=False)
    assert get(app, path, params=target).json()["reason"] == "calibration_unavailable"
    assert get(app, item["pixels_url"]).status_code == 200
    calls = spectral_reader(monkeypatch, archive)
    assert get(app, path, params=target).json()["status"] == "available"
    assert len(calls) == 1


def test_spectral_network_error_is_retryable_without_corrupting_cached_image(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    target = spectral_target(app, item, 1, 0)
    path = f"/api/v1/images/{item['id']}/spectral"

    def timeout(**kwargs):
        raise ArchiveTimeout("temporary failure")

    monkeypatch.setattr(archive, "spectral_sample", timeout, raising=False)
    assert get(app, path, params=target).status_code == 504
    assert get(app, item["pixels_url"]).status_code == 200
    spectral_reader(monkeypatch, archive)
    assert get(app, path, params=target).status_code == 200


def test_slow_spectral_read_does_not_block_cached_image_metadata(backend, monkeypatch):
    app, archive = backend
    item = search_one(app)
    target = spectral_target(app, item, 1, 0)
    entered, release = Event(), Event()

    def pending(**kwargs):
        entered.set()
        assert release.wait(5)
        return {"status": "unavailable", "reason": "calibration_unavailable", "sample": None, "calibration": None}

    monkeypatch.setattr(archive, "spectral_sample", pending, raising=False)
    service = app.state.image_service
    with ThreadPoolExecutor(max_workers=2) as executor:
        spectral = executor.submit(service.spectral, item["id"], **target)
        try:
            assert entered.wait(2)
            # Projection refresh begins by reading this metadata. Its lock
            # must stay independent of a slow optional calibration request.
            metadata = executor.submit(service.metadata, item["id"])
            assert metadata.result(timeout=1).id == item["id"]
        finally:
            release.set()
        assert spectral.result(timeout=2).status == "unavailable"


@pytest.mark.parametrize("params", [{}, {"ra_deg": 1}, {"ra_deg": "nan", "dec_deg": 0},
                                   {"ra_deg": 360, "dec_deg": 0}, {"ra_deg": 0, "dec_deg": 91}])
def test_spectral_requires_valid_explicit_target(backend, params):
    app, _ = backend
    item = search_one(app)
    assert get(app, f"/api/v1/images/{item['id']}/spectral", params=params).status_code == 422


def test_zoom_recrop_keeps_the_observation_and_downloads_a_new_window(backend):
    app, archive = backend
    item = search_one(app)
    response = post(app, f"/api/v1/images/{item['id']}/recrop", json={"size_deg": 0.025})
    assert response.status_code == 200, response.text
    cropped = response.json()
    assert cropped["id"] != item["id"]
    for key in ("observation_id", "detector", "collection", "source_url", "observation"):
        assert cropped[key] == item[key]
    assert cropped["requested"]["size_deg"] == 0.025
    assert len(archive.searches) == 1
    assert [download["size_deg"] for download in archive.downloads] == [0.1, 0.025]
    assert archive.downloads[-1]["source_url"] == SOURCE
    assert post(app, f"/api/v1/images/{item['id']}/recrop", json={"size_deg": 0.025}).json()["id"] == cropped["id"]
    assert len(archive.downloads) == 2


@pytest.mark.parametrize("size", [0, -1, 0.51, "invalid"])
def test_zoom_recrop_rejects_invalid_sizes_without_downloading(backend, size):
    app, archive = backend
    item = search_one(app)
    assert post(app, f"/api/v1/images/{item['id']}/recrop", json={"size_deg": size}).status_code == 422
    assert archive.downloads == []


def test_search_only_returns_discovery_and_exact_cutout_selection(backend):
    app, archive = backend
    response = get(app, "/api/v1/images", params={**QUERY, "detector": 2})

    assert response.status_code == 200
    body = response.json()
    assert body["has_more"] is False
    assert body["order"] == "observation_start_desc"
    item = body["images"][0]
    assert item["source_url"] == SOURCE
    assert item["requested"] == {**QUERY, "frame": "ICRS"}
    assert item["detector"] == 2
    assert item["observation"]["start_utc"] == "2023-02-25T00:00:00.000Z"
    assert item["metadata_url"] == f"/api/v1/images/{item['id']}"
    assert item["pixels_url"] == f"/api/v1/images/{item['id']}/pixels"
    assert "image" not in item
    assert archive.downloads == []
    assert archive.searches[0]["detector"] == 2


def test_selected_cutout_metadata_and_binary_preserve_values_and_download_once(backend):
    app, archive = backend
    item = search_one(app)
    response = get(app, item["metadata_url"])

    assert response.status_code == 200
    metadata = response.json()["image"]
    assert (metadata["height"], metadata["width"]) == archive.values.shape
    assert metadata["dtype"] == "float32"
    assert metadata["byte_order"] == "little"
    assert metadata["array_order"] == "C"
    assert metadata["pixel_origin"] == "lower-left"
    assert metadata["unit"] == "MJy/sr"
    assert metadata["nonfinite_count"] == 2
    assert metadata["finite_min"] == -2.5
    assert metadata["finite_max"] == 6.0
    assert metadata["center"]["ra_deg"] == pytest.approx(QUERY["ra_deg"])
    assert metadata["center"]["dec_deg"] == pytest.approx(QUERY["dec_deg"])
    assert len(metadata["footprint"]) == 4
    assert any(card["keyword"] == "CTYPE1" for card in metadata["wcs_header"])

    pixels = get(app, item["pixels_url"])
    assert pixels.status_code == 200
    assert pixels.headers["content-type"] == "application/octet-stream"
    assert len(pixels.content) == 2 * 3 * 4
    actual = np.frombuffer(pixels.content, dtype="<f4").reshape(2, 3)
    np.testing.assert_array_equal(actual, archive.values)
    assert get(app, item["metadata_url"]).json() == response.json()
    assert archive.downloads == [{"source_url": SOURCE, **QUERY, "label": item["id"]}]


def test_pixels_can_be_requested_first_and_survive_backend_restart(backend):
    app, archive = backend
    item = search_one(app)
    first = get(app, item["pixels_url"])
    assert first.status_code == 200

    restarted = create_app(Settings(cutout_cache_dir=app.state.image_service.store.root))
    unavailable = FakeArchive()
    unavailable.download_error = ArchiveError("must use cached data")
    restarted.state.image_service.archive = unavailable

    assert get(restarted, item["pixels_url"]).content == first.content
    assert get(restarted, item["metadata_url"]).status_code == 200
    assert unavailable.downloads == []


def test_ids_distinguish_cutout_geometry_and_remain_stable(backend):
    app, _ = backend
    original = search_one(app)["id"]
    assert search_one(app)["id"] == original
    assert search_one(app, ra_deg=210.9)["id"] != original
    assert search_one(app, dec_deg=54.4)["id"] != original
    assert search_one(app, size_deg=0.2)["id"] != original


def test_limit_exposes_truncation_without_downloading(backend):
    app, archive = backend
    archive.rows.append(replace(archive.rows[0], source_url=SOURCE.replace("x.fits", "y.fits")))
    response = get(app, "/api/v1/images", params={**QUERY, "limit": 1})
    assert response.status_code == 200
    assert len(response.json()["images"]) == 1
    assert response.json()["has_more"] is True
    assert archive.searches[0]["limit"] == 1
    assert archive.downloads == []


def test_empty_search_is_a_successful_empty_list(backend):
    app, archive = backend
    archive.rows = []
    response = get(app, "/api/v1/images", params=QUERY)
    assert response.status_code == 200
    assert response.json()["images"] == []
    assert response.json()["has_more"] is False


def test_date_filters_are_converted_using_the_supplied_timezone(backend):
    app, archive = backend
    response = get(app, "/api/v1/images", params={
        **QUERY, "start_time": "2023-02-24T18:00:00-06:00",
        "end_time": "2023-02-26T00:00:00Z",
    })
    assert response.status_code == 200
    assert archive.searches[0]["start_mjd"] == pytest.approx(60000)
    assert archive.searches[0]["end_mjd"] == pytest.approx(60001)


@pytest.mark.parametrize("invalid", [
    {"ra_deg": -1}, {"ra_deg": 360}, {"ra_deg": "nan"},
    {"dec_deg": -91}, {"dec_deg": "inf"}, {"size_deg": 0},
    {"size_deg": 0.51}, {"size_deg": "nan"}, {"detector": 0},
    {"detector": 7}, {"limit": 0}, {"limit": 101},
    {"start_time": "2023-02-25T00:00:00"},
    {"start_time": "not-a-date"},
    {"start_time": "2023-02-26T00:00:00Z", "end_time": "2023-02-25T00:00:00Z"},
    {"unknown_parameter": "ignored?"},
])
def test_invalid_queries_are_rejected_before_accessing_archive(backend, invalid):
    app, archive = backend
    response = get(app, "/api/v1/images", params={**QUERY, **invalid})
    assert response.status_code == 422
    assert archive.searches == []
    assert archive.downloads == []


@pytest.mark.parametrize("suffix", ["", "/pixels"])
def test_unknown_well_formed_id_returns_404(backend, suffix):
    app, archive = backend
    response = get(app, f"/api/v1/images/{'a' * 64}{suffix}")
    assert response.status_code == 404
    assert archive.downloads == []


@pytest.mark.parametrize("error,status", [(ArchiveError, 502), (ArchiveTimeout, 504)])
@pytest.mark.parametrize("operation", ["search", "download"])
def test_archive_errors_have_consistent_http_status(backend, error, status, operation):
    app, archive = backend
    if operation == "search":
        archive.search_error = error("internal upstream detail")
        response = get(app, "/api/v1/images", params=QUERY)
    else:
        item = search_one(app)
        archive.download_error = error("internal upstream detail")
        response = get(app, item["metadata_url"])
    assert response.status_code == status
    assert "internal upstream detail" not in response.text


def test_invalid_fits_returns_502_and_is_not_cached(backend):
    app, archive = backend
    item = search_one(app)
    valid_content = archive.content
    archive.content = b"not a FITS image"
    assert get(app, item["pixels_url"]).status_code == 502
    archive.content = valid_content
    assert get(app, item["pixels_url"]).status_code == 200
    assert len(archive.downloads) == 2


def test_openapi_describes_routes_and_binary_response(backend):
    app, _ = backend
    response = get(app, "/openapi.json")
    assert response.status_code == 200
    paths = response.json()["paths"]
    assert set(paths) == {
        "/api/v1/images", "/api/v1/images/availability", "/api/v1/images/{image_id}",
        "/api/v1/images/{image_id}/pixels",
        "/api/v1/images/{image_id}/planes/{plane}",
        "/api/v1/images/{image_id}/planes/{plane}/pixels",
        "/api/v1/images/search", "/api/v1/images/search-box", "/api/v1/images/load/{image_id}",
        "/api/v1/images/{image_id}/projection", "/api/v1/images/{image_id}/recrop",
        "/api/v1/images/{image_id}/spectral",
        "/api/v1/stars", "/api/v1/star-catalog", "/api/v1/sky", "/api/v1/targets",
        "/api/v1/health", "/api/v1/solar-system",
    }
    content = paths["/api/v1/images/{image_id}/pixels"]["get"]["responses"]["200"]["content"]
    assert content["application/octet-stream"]["schema"]["format"] == "binary"


def post(app, path, **kwargs):
    async def request():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            return await client.post(path, **kwargs)
    return asyncio.run(request())


def test_click_load_pixels_and_projection_flow(backend):
    from astropy.utils import iers
    from app.services.sky import calculate_sky
    from datetime import datetime, timezone
    app, archive = backend
    observer = {"latitude_deg": 14, "longitude_deg": -89, "elevation_m": 0}
    at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    star = {"hipparcos_id": 1, "common_name": "test", "right_ascension_deg": QUERY["ra_deg"],
            "declination_deg": QUERY["dec_deg"], "apparent_magnitude": 1, "color_hex": "#ffffff",
            "pm_ra_cosdec_arcsec_yr": 0, "pm_dec_arcsec_yr": 0}
    with iers.conf.set_temp("auto_download", False):
        direction = calculate_sky([star], observer, at, False)["directions"][0]
        request = {"observer": observer, "at": at.isoformat(), "mode": "paused"}
        search = post(app, "/api/v1/images/search", json={**request, "direction": direction, "size_arcmin": 6})
        assert search.status_code == 200, search.text
        assert archive.searches[0]["ra_deg"] == pytest.approx(QUERY["ra_deg"], abs=1e-6)
        assert archive.downloads == []
        item = search.json()["images"][0]
        metadata = post(app, f"/api/v1/images/load/{item['id']}")
        assert metadata.status_code == 200, metadata.text
        assert get(app, item["pixels_url"]).status_code == 200
        projection = post(app, f"/api/v1/images/{item['id']}/projection", json=request)
        assert projection.status_code == 200, projection.text
        geometry = projection.json()
        assert len(geometry["directions"][0]) // 3 == len(geometry["uv"]) // 2
        assert geometry["mesh_error_pixels"] <= 0.15
        assert len(archive.downloads) == 1


def test_unprojectable_wcs_is_a_clear_422(backend, monkeypatch):
    from app.services import image_geometry
    app, _ = backend
    item = search_one(app)

    def too_distorted(*args, **kwargs):
        raise image_geometry.MeshError("This image's distortion requires a finer mesh than the supported limit.")
    monkeypatch.setattr(image_geometry, "build_mesh", too_distorted)
    request = {"observer": {"latitude_deg": 14, "longitude_deg": -89}, "at": "2025-01-01T00:00:00Z", "mode": "paused"}
    response = post(app, f"/api/v1/images/{item['id']}/projection", json=request)
    assert response.status_code == 422
    assert response.json() == {"detail": "This image's WCS cannot be projected accurately. Try a smaller size."}


def test_star_routes_version_and_sky(backend):
    from astropy.utils import iers
    from unittest.mock import Mock
    from test_sky import STAR, OBSERVER
    app, _ = backend
    service = Mock()
    service.selected.return_value = [STAR]
    service.metadata.return_value = {"catalog_version": "test-version", "stars": [STAR]}
    app.state.star_service = service
    assert get(app, "/api/v1/stars?magnitude_limit=3").json() == [STAR]
    service.selected.assert_called_with(3)
    assert get(app, "/api/v1/star-catalog").json()["catalog_version"] == "test-version"
    request = {"observer": OBSERVER, "at": "2025-01-01T00:00:00Z", "mode": "paused"}
    assert post(app, "/api/v1/sky", json={**request, "catalog_version": "old"}).status_code == 409
    with iers.conf.set_temp("auto_download", False):
        response = post(app, "/api/v1/sky", json=request)
    assert response.status_code == 200, response.text
    assert response.json()["star_count"] == 1
    assert len(response.json()["sample_times_ms"]) == 1



# ---- Box selection on the sky ----

def box_request(side_deg, ra=QUERY["ra_deg"], dec=QUERY["dec_deg"], **extra):
    """Corner directions of a box around (ra, dec), as the frontend would send them."""
    from astropy.utils import iers
    from test_box_selection import AT, OBSERVER, scene_directions, square
    with iers.conf.set_temp("auto_download", False):
        corners = scene_directions(square(ra, dec, side_deg))
    return {"observer": OBSERVER, "at": AT.isoformat(), "mode": "paused", "corners": corners, **extra}


def test_box_search_uses_the_box_centre_and_covering_size(backend):
    from astropy.utils import iers
    app, archive = backend
    with iers.conf.set_temp("auto_download", False):
        response = post(app, "/api/v1/images/search-box", json=box_request(0.1, detector=2, limit=5))
    assert response.status_code == 200, response.text
    body = response.json()
    search = archive.searches[0]
    assert search["ra_deg"] == pytest.approx(QUERY["ra_deg"], abs=1e-5)
    assert search["dec_deg"] == pytest.approx(QUERY["dec_deg"], abs=1e-5)
    assert (search["detector"], search["limit"]) == (2, 5)
    selection = body["selection"]
    assert selection["size_deg"] == pytest.approx(0.1, rel=0.01)
    assert selection["center"]["ra_deg"] == pytest.approx(search["ra_deg"])
    assert len(selection["corners"]) == 4
    item = body["images"][0]
    assert item["requested"]["size_deg"] == selection["size_deg"]
    assert archive.downloads == []
    # Same identity as a plain search with the computed geometry, and loadable the same way.
    plain = get(app, "/api/v1/images", params={
        "ra_deg": selection["center"]["ra_deg"], "dec_deg": selection["center"]["dec_deg"],
        "size_deg": selection["size_deg"], "detector": 2, "limit": 5}).json()
    assert plain["images"][0]["id"] == item["id"]
    assert post(app, f"/api/v1/images/load/{item['id']}").status_code == 200


@pytest.mark.parametrize("side,message", [
    (0.6, "The selected box spans 36.0′; the maximum is 30′. Zoom in or drag a smaller box."),
    (1 / 3600, "The selected box is smaller than one pixel. Drag a larger box or click instead."),
])
def test_box_outside_the_size_limits_is_a_clear_422(backend, side, message):
    from astropy.utils import iers
    app, archive = backend
    with iers.conf.set_temp("auto_download", False):
        response = post(app, "/api/v1/images/search-box", json=box_request(side))
    assert response.status_code == 422
    assert response.json() == {"detail": message}
    assert archive.searches == []


@pytest.mark.parametrize("corners", [
    [[0, 1, 0]] * 3,
    [[0, 1, 0]] * 5,
    [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 0, 0]],
    [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1.5, 0]],
    [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1]],
])
def test_malformed_corners_are_rejected_before_any_search(backend, corners):
    app, archive = backend
    request = {"observer": {"latitude_deg": 14, "longitude_deg": -89}, "at": "2025-01-01T00:00:00Z",
               "mode": "paused", "corners": corners}
    assert post(app, "/api/v1/images/search-box", json=request).status_code == 422
    assert archive.searches == []


@pytest.mark.parametrize("path,field", [("/api/v1/images/search-box", "corners"), ("/api/v1/images/search", "direction")])
def test_nonfinite_body_values_are_a_422_not_a_500(backend, path, field):
    app, archive = backend
    vectors = {"corners": [[0, 1, 0]] * 3 + [[float("nan"), 1, 0]], "direction": [float("inf"), 1, 0]}
    body = {"observer": {"latitude_deg": 14, "longitude_deg": -89}, "at": "2025-01-01T00:00:00Z",
            "mode": "paused", field: vectors[field]}
    response = post(app, path, content=json.dumps(body), headers={"Content-Type": "application/json"})
    assert response.status_code == 422
    assert any(error["type"] == "finite_number" for error in response.json()["detail"])
    assert archive.searches == []



# ---- Frontend blink support: independent observations of one region ----

class TwoObservationArchive(FakeArchive):
    """Observations A and B of one region: different dates, sizes, values and WCS rotations."""

    def __init__(self):
        super().__init__()
        self.rows = [
            ArchiveImage(source_url=SOURCE.replace("x.fits", f"{name}.fits"), observation_id=f"obs-{name}",
                         detector=2, collection="dr1", observed_start_mjd=mjd, observed_end_mjd=mjd + 0.001)
            for name, mjd in (("b", 61100.0), ("a", 60900.0))
        ]
        self.contents = {self.rows[1].source_url: self.fits(0.0, (2, 3), 1.0),
                         self.rows[0].source_url: self.fits(30.0, (3, 4), 2.0)}

    @staticmethod
    def fits(rotation_deg, shape, scale):
        spatial = WCS(naxis=2)
        spatial.wcs.ctype = ["RA---TAN", "DEC--TAN"]
        spatial.wcs.crpix = [(shape[1] + 1) / 2, (shape[0] + 1) / 2]
        spatial.wcs.crval = [QUERY["ra_deg"], QUERY["dec_deg"]]
        angle = np.radians(rotation_deg)
        spatial.wcs.cd = 0.001 * np.array([[-np.cos(angle), np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        header = spatial.to_header()
        header["BUNIT"] = "MJy/sr"
        stream = BytesIO()
        values = (np.arange(shape[0] * shape[1], dtype=np.float32).reshape(shape) * scale)
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(values, header=header, name="IMAGE")]).writeto(stream)
        return stream.getvalue()

    def download_cutout(self, **kwargs):
        self.downloads.append(kwargs)
        return self.contents[kwargs["source_url"]]


def test_two_observations_load_and_project_independently(tmp_path):
    from astropy.utils import iers
    archive = TwoObservationArchive()
    app = create_app(Settings(cutout_cache_dir=tmp_path / "cutouts"))
    app.state.image_service.archive = archive
    images = get(app, "/api/v1/images", params=QUERY).json()["images"]
    newest, oldest = images
    assert (newest["observation_id"], oldest["observation_id"]) == ("obs-b", "obs-a")
    assert newest["id"] != oldest["id"]
    assert newest["observation"]["start_mjd"] != oldest["observation"]["start_mjd"]

    a = post(app, f"/api/v1/images/load/{oldest['id']}").json()["image"]
    b = post(app, f"/api/v1/images/load/{newest['id']}").json()["image"]
    assert (a["width"], a["height"]) == (3, 2) and (b["width"], b["height"]) == (4, 3)
    pixels_a = np.frombuffer(get(app, oldest["pixels_url"]).content, dtype="<f4")
    pixels_b = np.frombuffer(get(app, newest["pixels_url"]).content, dtype="<f4")
    np.testing.assert_array_equal(pixels_a, np.arange(6, dtype=np.float32))
    np.testing.assert_array_equal(pixels_b, np.arange(12, dtype=np.float32) * 2)
    cards = lambda image: {card["keyword"]: card["value"] for card in image["wcs_header"]}
    assert cards(a) != cards(b)

    request = {"observer": {"latitude_deg": 14, "longitude_deg": -89, "elevation_m": 0},
               "at": "2025-01-01T00:00:00Z", "mode": "paused"}
    with iers.conf.set_temp("auto_download", False):
        projection_a = post(app, f"/api/v1/images/{oldest['id']}/projection", json=request).json()
        projection_b = post(app, f"/api/v1/images/{newest['id']}/projection", json=request).json()
    assert projection_a["sample_times_ms"] == projection_b["sample_times_ms"]
    assert projection_a["image_id"] == oldest["id"] and projection_b["image_id"] == newest["id"]
    assert projection_a["directions"] != projection_b["directions"]

    # Loading B did not overwrite A, and repeated reads reuse each cache.
    assert len(archive.downloads) == 2
    assert np.array_equal(np.frombuffer(get(app, oldest["pixels_url"]).content, dtype="<f4"), pixels_a)
    post(app, f"/api/v1/images/load/{newest['id']}")
    assert len(archive.downloads) == 2
