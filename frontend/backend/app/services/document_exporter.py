from pathlib import Path
from zipfile import BadZipFile, ZipFile

from app.utils.errors import api_error


class DocumentExporter:
    def validate(self, path: Path) -> None:
        try:
            with ZipFile(path) as archive:
                if "word/document.xml" not in archive.namelist():
                    raise ValueError("document.xml missing")
                invalid = archive.testzip()
                if invalid:
                    raise ValueError(f"corrupt archive member {invalid}")
        except (BadZipFile, ValueError) as exc:
            raise api_error(500, "export_validation_failed", "The edited document failed integrity validation.") from exc
