"""Resolve a spectral calibration by provenance and sample its native maps.

IRSA reserves WCS-WAVE for visualization. Science values come from CWAVE and
CBAND; their map grid is the native detector grid represented by their own
WCS-WAVE extension (IRSA SPHEREx Data Products, Spectral WCS). We require an
explicit sky orientation and an exact source identity/table match, never a
"latest" calibration or a version inferred from the exposure filename.

The resolver is deliberately conservative: unsupported provenance, orientation
or ambiguous matches mean unavailable. Real archive interoperability still
requires validation against representative public files.
"""

from html.parser import HTMLParser
from io import BytesIO
import math
import re
import time
from urllib.parse import urljoin, urlsplit

from astropy.io import fits
import astropy.units as u
import numpy as np
import requests

from app.integrations.http_retry import timeout_until, with_retries
from app.integrations.irsa_ranges import PartialReadError, grid_origin


ORIGIN = "https://irsa.ipac.caltech.edu"
MAX_LIST_BYTES = 256 * 1024
MAX_VERSIONS = 16
MAX_TABLE_BYTES = 128 * 1024
VERSION = re.compile(r"cal-wcs-v[0-9]+(?:\.[0-9]+)*-[0-9]{4}-[0-9]{3}/")
IDENTITY = re.compile(r"Calibration source file:\s*([A-Za-z0-9_.-]+\.fits)\s*$")


class Unavailable(ValueError):
    def __init__(self, reason):
        self.reason = reason
        super().__init__(reason)


class _Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "a":
            self.hrefs.extend(value for key, value in attrs if key.lower() == "href" and value is not None)


def _versions(reader, root, deadline):
    def fetch():
        with reader.session.get(root, stream=True, timeout=timeout_until(deadline),
                                allow_redirects=False, headers={"Accept-Encoding": "identity"}) as response:
            if response.status_code == 404:
                raise Unavailable("calibration_unavailable")
            response.raise_for_status()
            if response.status_code != 200:
                raise Unavailable("calibration_unavailable")
            content, size = [], 0
            for chunk in response.iter_content(16384):
                if deadline is not None and time.monotonic() > deadline:
                    raise requests.Timeout("Spectral calibration discovery exceeded its deadline.")
                size += len(chunk)
                if size > MAX_LIST_BYTES:
                    raise Unavailable("calibration_unavailable")
                content.append(chunk)
            return b"".join(content).decode("utf-8", errors="replace")

    parser = _Links()
    parser.feed(with_retries(fetch, deadline=deadline))
    versions = set()
    for href in parser.hrefs:
        url = urljoin(root, href)
        if not url.startswith(root):
            continue
        suffix = url[len(root):]
        if VERSION.fullmatch(suffix):
            versions.add(suffix[:-1])
    if not versions or len(versions) > MAX_VERSIONS:
        raise Unavailable("calibration_unavailable")
    return sorted(versions)


def _detector(headers, required):
    declared = []
    for header in headers:
        if "DETECTOR" in header:
            text = str(header["DETECTOR"]).strip()
            if not re.fullmatch(r"[1-6]", text):
                raise Unavailable("calibration_mismatch")
            declared.append(int(text))
    if not declared or any(value != required for value in declared):
        raise Unavailable("calibration_mismatch")


def _orientation(headers, explicit):
    if str(explicit.get("DETCOORD", "")).strip().lower() != "sky":
        raise Unavailable("calibration_mismatch")
    for header in headers:
        if "DETCOORD" in header and str(header["DETCOORD"]).strip().lower() != "sky":
            raise Unavailable("calibration_mismatch")


def _table(exposure, deadline):
    entry = exposure.find("WCS-WAVE", deadline)
    if entry is None:
        raise Unavailable("calibration_unavailable")
    header = entry["header"]
    identities = {match.group(1) for value in header.get("HISTORY", [])
                  if (match := IDENTITY.fullmatch(str(value).strip()))}
    if len(identities) != 1:
        raise Unavailable("calibration_unavailable")
    if (str(header.get("XTENSION", "")).strip() != "BINTABLE"
            or header.get("NAXIS2") != 1 or header.get("PCOUNT", 0) != 0
            or not 0 < entry["size"] <= MAX_TABLE_BYTES):
        raise Unavailable("invalid_calibration")
    with exposure._guard:
        data = exposure._data(entry, entry["size"], deadline)
    # Preserve the FITS table's shape/endian conventions by using Astropy.
    content = fits.PrimaryHDU().header.tostring().encode("ascii") + header.tostring().encode("ascii")
    content += data + b"\0" * ((-len(data)) % 2880)
    with fits.open(BytesIO(content), memmap=False) as hdus:
        table = hdus[1].data
        if set(table.names) != {"X", "Y", "VALUES"}:
            raise Unavailable("invalid_calibration")
        x, y, values = (np.array(table[name][0], copy=True) for name in ("X", "Y", "VALUES"))
    if (x.ndim != 1 or y.ndim != 1 or len(x) < 2 or len(y) < 2
            or values.shape != (len(y), len(x), 2)
            or not all(np.all(np.isfinite(array)) for array in (x, y, values))
            or np.any(np.diff(x) <= 0) or np.any(np.diff(y) <= 0)):
        raise Unavailable("invalid_calibration")
    return header, next(iter(identities)), (x, y, values)


def _matches(candidate, identity, arrays, detector, deadline):
    header, candidate_id, candidate_arrays = _table(candidate, deadline)
    if candidate_id != identity:
        return False
    _detector([entry["header"] for entry in candidate.hdus], detector)
    _orientation([entry["header"] for entry in candidate.hdus], header)
    return all(np.array_equal(first, second) for first, second in zip(arrays, candidate_arrays))


def _map_value(calibration, extension, x, y, width, height, deadline):
    entry = calibration.find(extension, deadline)
    if entry is None:
        raise Unavailable("invalid_calibration")
    header = entry["header"]
    if header.get("NAXIS1") != width or header.get("NAXIS2") != height:
        raise Unavailable("calibration_mismatch")
    # The published map units are microns. A declared incompatible unit is an
    # error; convertible declared length units are explicitly converted.
    try:
        factor = u.Unit(header.get("BUNIT", "um")).to(u.um)
    except (ValueError, TypeError) as error:
        raise Unavailable("invalid_calibration") from error
    value = float(calibration.window(extension, x, y, 1, 1, deadline)[0, 0]) * factor
    if not math.isfinite(value) or value <= 0:
        raise Unavailable("invalid_calibration")
    return value


def sample(reader, source_url, release, grid, pixel_x, pixel_y, deadline):
    """Return a native-pixel scalar sample, or a reason it cannot be resolved.

    Transport errors deliberately propagate to the client's ArchiveError path.
    No WCS-WAVE approximate value substitutes for a missing calibrated map.
    """
    try:
        parts = urlsplit(source_url)
        if parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu":
            raise Unavailable("calibration_unavailable")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", release):
            raise Unavailable("calibration_unavailable")
        if (not isinstance(pixel_x, int) or not isinstance(pixel_y, int)
                or isinstance(pixel_x, bool) or isinstance(pixel_y, bool)
                or not 0 <= pixel_x < grid[2] or not 0 <= pixel_y < grid[3]):
            raise Unavailable("invalid_calibration")
        source = reader.open(source_url, deadline)
        science = source.find("IMAGE", deadline)
        if science is None:
            raise Unavailable("invalid_calibration")
        science_header = science["header"]
        table_header, identity, arrays = _table(source, deadline)
        detector_text = str(table_header.get("DETECTOR", "")).strip()
        if not re.fullmatch(r"[1-6]", detector_text):
            raise Unavailable("calibration_mismatch")
        detector = int(detector_text)
        _detector([entry["header"] for entry in source.hdus], detector)
        _orientation([entry["header"] for entry in source.hdus], table_header)
        x0, y0 = grid_origin(science_header, grid)
        width, height = science_header["NAXIS1"], science_header["NAXIS2"]
        x, y = x0 + pixel_x, y0 + pixel_y
        if not (0 <= x0 and 0 <= y0 and x0 + grid[2] <= width and y0 + grid[3] <= height):
            raise Unavailable("calibration_mismatch")
        root = f"{ORIGIN}/ibe/data/spherex/{release}/spectral_wcs/"
        matches = []
        for version in _versions(reader, root, deadline):
            url = f"{root}{version}/{detector}/spectral_wcs_D{detector}_spx_{version}.fits"
            # Any unreadable candidate (including an absent file / unsupported
            # range response) prevents establishing a unique matching artifact.
            calibration = reader.open(url, deadline)
            if _matches(calibration, identity, arrays, detector, deadline):
                matches.append((url, calibration))
        if len(matches) != 1:
            raise Unavailable("calibration_mismatch" if matches else "calibration_unavailable")
        url, calibration = matches[0]
        wavelength = _map_value(calibration, "CWAVE", x, y, width, height, deadline)
        bandwidth = _map_value(calibration, "CBAND", x, y, width, height, deadline)
        _detector([entry["header"] for entry in calibration.hdus], detector)
        _orientation([entry["header"] for entry in calibration.hdus], calibration.find("WCS-WAVE", deadline)["header"])
        return {"status": "available", "reason": None,
                "sample": {"detector_x": x + 1, "detector_y": y + 1,
                           "wavelength_um": wavelength, "bandwidth_um": bandwidth},
                "calibration": {"source_url": url, "method": "CWAVE/CBAND"}}
    except Unavailable as error:
        reason = error.reason
    except requests.RequestException:
        raise
    except (PartialReadError, OSError, ValueError, TypeError, KeyError, IndexError, AttributeError):
        reason = "invalid_calibration"
    return {"status": "unavailable", "reason": reason, "sample": None, "calibration": None}
