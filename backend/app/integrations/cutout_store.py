"""Local cutout cache. JSON becomes visible only after an atomic write."""

import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile


class UnknownImageError(Exception):
    """The image was not registered by a search on this backend."""


class CacheError(Exception):
    """Local storage is unavailable or a saved selection is unreadable."""


class CutoutStore:
    def __init__(self, root: Path):
        self.root = root

    def _path(self, identifier: str, suffix: str) -> Path:
        if not re.fullmatch(r"[0-9a-f]{64}", identifier):
            raise UnknownImageError("Unknown image. Run an image search first.")
        return self.root / f"{identifier}.{suffix}"

    def _write(self, path: Path, content: bytes) -> None:
        temporary = None
        try:
            self.root.mkdir(parents=True, exist_ok=True)
            with NamedTemporaryFile(dir=self.root, suffix=".tmp", delete=False) as handle:
                temporary = Path(handle.name)
                handle.write(content)
            os.replace(temporary, path)
        except OSError as error:
            raise CacheError("Could not write the local cache") from error
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass

    def _write_json(self, path: Path, data: dict) -> None:
        self._write(path, json.dumps(data, allow_nan=False).encode("utf-8"))

    def register(self, identifier: str, selection: dict) -> None:
        self._write_json(self._path(identifier, "selection.json"), selection)

    def selection(self, identifier: str) -> dict:
        try:
            return json.loads(self._path(identifier, "selection.json").read_text())
        except FileNotFoundError as error:
            raise UnknownImageError("Unknown image. Run an image search first.") from error
        except (OSError, ValueError) as error:
            raise CacheError("Could not read a saved selection") from error

    def _completed(self, binary: Path, description: Path) -> dict | None:
        """JSON written after its binary; absent or unreadable means "not cached"."""
        if not binary.is_file():
            return None
        try:
            return json.loads(description.read_text())
        except FileNotFoundError:
            return None
        except json.JSONDecodeError:
            return None
        except OSError as error:
            raise CacheError("Could not read cached image metadata") from error

    def metadata(self, identifier: str) -> dict | None:
        return self._completed(self.pixels_path(identifier), self._path(identifier, "metadata.json"))

    def pixels_path(self, identifier: str) -> Path:
        return self._path(identifier, "pixels.bin")

    def save_image(self, identifier: str, metadata: dict, pixels: bytes) -> None:
        self._write(self.pixels_path(identifier), pixels)
        # Metadata is the completion marker: readers never use a partial binary.
        self._write_json(self._path(identifier, "metadata.json"), metadata)

    # Extra planes (flags, zodi, variance) sit next to pixels.bin, on the same grid.
    def plane_path(self, identifier: str, plane: str) -> Path:
        return self._path(identifier, f"{plane}.bin")

    def plane_metadata(self, identifier: str, plane: str) -> dict | None:
        return self._completed(self.plane_path(identifier, plane), self._path(identifier, f"{plane}.json"))

    def save_plane(self, identifier: str, plane: str, metadata: dict, pixels: bytes) -> None:
        self._write(self.plane_path(identifier, plane), pixels)
        self._write_json(self._path(identifier, f"{plane}.json"), metadata)

    def spectral_metadata(self, identifier: str, column: int, row: int) -> dict | None:
        """A separate versioned cache also enriches already cached IMAGE cutouts."""
        try:
            return json.loads(self._path(identifier, f"spectral-v1-{column}-{row}.json").read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            return None
        except OSError as error:
            raise CacheError("Could not read cached spectral metadata") from error

    def save_spectral(self, identifier: str, column: int, row: int, metadata: dict) -> None:
        self._write_json(self._path(identifier, f"spectral-v1-{column}-{row}.json"), metadata)
