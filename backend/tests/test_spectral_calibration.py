"""Strict spectral provenance and native-pixel reads using synthetic FITS only."""

from io import BytesIO
from unittest.mock import MagicMock

from astropy.io import fits
import numpy as np
import pytest
import requests

from app.integrations import irsa_ranges, spectral_calibration as spectral
from app.integrations.irsa import ArchiveError, ArchiveTimeout, IrsaClient


ROOT = "https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/"
SOURCE = ROOT + "level2/week/run/4/image.fits"
VERSION = "cal-wcs-v7-2026-191"
CALIBRATION = ROOT + f"spectral_wcs/{VERSION}/4/spectral_wcs_D4_spx_{VERSION}.fits"
WIDTH, HEIGHT = 20, 16
GRID = (5.5, 5.5, 5, 4)  # Native origin x=5, y=3 for CRPIX=(10.5,8.5).


def table(identity="spectral_wcs_4_v2.2.fits", orientation="sky", offset=0):
    x, y = np.array([1, WIDTH], dtype=np.int32), np.array([1, HEIGHT], dtype=np.int32)
    values = np.array([[[3.0, .04], [3.01, .04]], [[3.1, .05], [3.11, .05]]], dtype=np.float32) + offset
    hdu = fits.BinTableHDU.from_columns([
        fits.Column(name="X", format="2J", dim="(2)", array=[x]),
        fits.Column(name="Y", format="2J", dim="(2)", array=[y]),
        fits.Column(name="VALUES", format="8E", dim="(2,2,2)", array=[values]),
    ], name="WCS-WAVE")
    hdu.header["DETECTOR"] = 4
    if orientation is not None:
        hdu.header["DETCOORD"] = orientation
    if identity:
        hdu.header.add_history(f"Calibration source file: {identity}")
    return hdu


def write(hdus):
    output = BytesIO()
    fits.HDUList(hdus).writeto(output)
    return output.getvalue()


def exposure(**kwargs):
    header = fits.Header({"CRPIX1": 10.5, "CRPIX2": 8.5, "DETECTOR": 4})
    return write([fits.PrimaryHDU(), fits.ImageHDU(np.zeros((HEIGHT, WIDTH), dtype=np.float32),
                                                header=header, name="IMAGE"), table(**kwargs)])


def calibration(*, unit="um", map_orientation=None, map_detector=4,
                bad_value=None, wrong_shape=False, **kwargs):
    # Distinct native values detect x/y swaps, flips and zero/one-based errors.
    waves = 3.0 + np.arange(HEIGHT * WIDTH, dtype=np.float32).reshape(HEIGHT, WIDTH) / 1000
    if bad_value is not None:
        waves[4, 7] = bad_value
    band = np.full((HEIGHT, WIDTH), .04, dtype=np.float32)
    header = fits.Header({"DETECTOR": map_detector})
    if unit is not None:
        header["BUNIT"] = unit
    if map_orientation is not None:
        header["DETCOORD"] = map_orientation
    if wrong_shape:
        waves = waves[:-1]
    return write([fits.PrimaryHDU(), fits.ImageHDU(waves, header=header, name="CWAVE"),
                  fits.ImageHDU(band, header=header, name="CBAND"), table(**kwargs)])


@pytest.fixture
def harness(monkeypatch):
    files = {SOURCE: exposure(), CALIBRATION: calibration()}
    requests_seen = []

    def ranges(reader, url, spec, limit, deadline=None):
        content = files[url]
        parts = []
        for part in spec.split(","):
            first, last = map(int, part.split("-"))
            parts.append((first, content[first:last + 1]))
        requests_seen.append((url, spec, deadline))
        return parts, len(content)

    monkeypatch.setattr(irsa_ranges.RangeReader, "_request", ranges)
    monkeypatch.setattr(irsa_ranges, "HEADER_GUESS", 2880)
    response = MagicMock()
    response.__enter__.return_value = response
    response.status_code = 200
    response.iter_content.side_effect = lambda _: iter([f'<a href="{VERSION}/">calibration</a>'.encode()])
    session = MagicMock()
    session.get.return_value = response
    client = IrsaClient()
    client.ranges = irsa_ranges.RangeReader(session=session)
    return client, files, response, requests_seen


def read(harness):
    return harness[0].spectral_sample(SOURCE, GRID, 2, 1)


def test_exact_calibration_returns_native_pixel_with_shifted_cutout(harness):
    result = read(harness)
    assert result["status"] == "available"
    assert result["sample"]["detector_x"] == 8
    assert result["sample"]["detector_y"] == 5
    assert result["sample"]["wavelength_um"] == pytest.approx(3.087)
    assert result["sample"]["bandwidth_um"] == pytest.approx(.04)
    assert result["calibration"] == {"source_url": CALIBRATION, "method": "CWAVE/CBAND"}
    assert len({deadline for _, _, deadline in harness[3]}) == 1
    assert harness[0].ranges.session.get.call_args.kwargs["allow_redirects"] is False


@pytest.mark.parametrize("change", [
    {"identity": "spectral_wcs_4_v1.0.fits"}, {"offset": .001},
    {"orientation": "instrument"}, {"orientation": None},
    {"map_orientation": "instrument"}, {"map_detector": 5},
    {"wrong_shape": True}, {"unit": "MJy/sr"},
    {"bad_value": float("nan")}, {"bad_value": float("inf")}, {"bad_value": -1.0},
])
def test_uncertified_maps_are_unavailable(harness, change):
    harness[1][CALIBRATION] = calibration(**change)
    result = read(harness)
    assert result["status"] == "unavailable"
    assert result["sample"] is None and result["calibration"] is None


@pytest.mark.parametrize("change", [{"identity": None}, {"orientation": None}, {"orientation": "instrument"}])
def test_missing_source_provenance_or_orientation_never_guesses(harness, change):
    harness[1][SOURCE] = exposure(**change)
    assert read(harness)["status"] == "unavailable"
    harness[0].ranges.session.get.assert_not_called()


def test_duplicate_identity_table_matches_are_ambiguous(harness):
    other = "cal-wcs-v8-2026-192"
    url = ROOT + f"spectral_wcs/{other}/4/spectral_wcs_D4_spx_{other}.fits"
    harness[1][url] = calibration()
    harness[2].iter_content.side_effect = lambda _: iter([f'<a href="{VERSION}/"></a><a href="{other}/"></a>'.encode()])
    assert read(harness)["reason"] == "calibration_mismatch"


def test_missing_units_use_documented_microns(harness):
    harness[1][CALIBRATION] = calibration(unit=None)
    assert read(harness)["sample"]["wavelength_um"] == pytest.approx(3.087)


def test_declared_convertible_units_are_converted(harness):
    harness[1][CALIBRATION] = calibration(unit="nm")
    assert read(harness)["sample"]["wavelength_um"] == pytest.approx(.003087)


def test_directory_ignores_external_parent_nested_and_query_links(harness):
    links = [f"https://evil.example/{VERSION}/", f"../{VERSION}/", f"{VERSION}/?x=1", f"nested/{VERSION}/"]
    harness[2].iter_content.side_effect = lambda _: iter(["".join(f'<a href="{url}"></a>' for url in links).encode()])
    assert read(harness)["reason"] == "calibration_unavailable"
    assert all(url == SOURCE for url, _, _ in harness[3])


def test_directory_version_and_size_budgets(harness, monkeypatch):
    monkeypatch.setattr(spectral, "MAX_LIST_BYTES", 3)
    assert read(harness)["reason"] == "calibration_unavailable"
    monkeypatch.setattr(spectral, "MAX_LIST_BYTES", 4096)
    monkeypatch.setattr(spectral, "MAX_VERSIONS", 0)
    assert read(harness)["reason"] == "calibration_unavailable"


@pytest.mark.parametrize("error, expected", [(requests.Timeout("slow"), ArchiveTimeout),
                                              (requests.ConnectionError("offline"), ArchiveError)])
def test_network_failures_are_not_cached_as_missing_calibrations(harness, monkeypatch, error, expected):
    monkeypatch.setattr(harness[0].ranges, "open", MagicMock(side_effect=error))
    with pytest.raises(expected):
        read(harness)


def test_invalid_target_or_grid_is_unavailable(harness):
    client = harness[0]
    assert client.spectral_sample(SOURCE, GRID, 5, 0)["status"] == "unavailable"
    assert client.spectral_sample(SOURCE, (5.25, 5.5, 5, 4), 2, 1)["status"] == "unavailable"


def test_invalid_untrusted_source_url_is_rejected_before_request(harness):
    with pytest.raises(ArchiveError):
        harness[0].spectral_sample("https://evil.example/image.fits", GRID, 2, 1)
    assert not harness[3]


def test_partial_read_404_leaves_candidate_unresolved(harness, monkeypatch):
    mocked_ranges = irsa_ranges.RangeReader._request
    missing = MagicMock()
    missing.__enter__.return_value = missing
    missing.status_code = 404
    missing_session = MagicMock()
    missing_session.get.return_value = missing

    def ranges(reader, url, spec, limit, deadline=None):
        if url == CALIBRATION:
            # Exercise real transport semantics: a 404 is PartialReadError,
            # not HTTPError. An unreadable candidate cannot prove uniqueness.
            return irsa_ranges._request_once(missing_session, url, spec, limit, deadline)
        return mocked_ranges(reader, url, spec, limit, deadline)

    monkeypatch.setattr(irsa_ranges.RangeReader, "_request", ranges)
    assert read(harness)["reason"] == "invalid_calibration"
    missing.iter_content.assert_not_called()


def test_http_failure_propagates(harness, monkeypatch):
    response = requests.Response()
    response.status_code = 503
    error = requests.HTTPError("server busy", response=response)
    monkeypatch.setattr(harness[0].ranges, "open", MagicMock(side_effect=error))
    with pytest.raises(ArchiveError):
        read(harness)


def test_ambiguous_history_identity_is_unavailable(harness):
    hdu = table()
    hdu.header.add_history("Calibration source file: spectral_wcs_4_v3.0.fits")
    harness[1][SOURCE] = write([fits.PrimaryHDU(), fits.ImageHDU(np.zeros((HEIGHT, WIDTH)),
        header=fits.Header({"CRPIX1": 10.5, "CRPIX2": 8.5, "DETECTOR": 4}), name="IMAGE"), hdu])
    assert read(harness)["reason"] == "calibration_unavailable"
    harness[0].ranges.session.get.assert_not_called()
