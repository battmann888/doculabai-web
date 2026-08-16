import json
import shutil
from pathlib import Path
from uuid import uuid4

from app.config import Settings
from app.utils.errors import api_error


class DocumentStore:
    def __init__(self, settings: Settings):
        self.root = settings.storage_dir.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def create(self, file_name: str, content: bytes) -> str:
        document_id = uuid4().hex
        directory = self.root / document_id
        directory.mkdir()
        (directory / "original.docx").write_bytes(content)
        (directory / "current.docx").write_bytes(content)
        self.write_metadata(document_id, {"file_name": file_name, "version": 1})
        return document_id

    def directory(self, document_id: str) -> Path:
        path = self.root / document_id
        if not path.is_dir() or not document_id.isalnum():
            raise api_error(404, "document_not_found", "Document session was not found.")
        return path

    def current_path(self, document_id: str) -> Path:
        return self.directory(document_id) / "current.docx"

    def metadata(self, document_id: str) -> dict:
        path = self.directory(document_id) / "metadata.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def write_metadata(self, document_id: str, metadata: dict) -> None:
        (self.directory(document_id) / "metadata.json").write_text(json.dumps(metadata), encoding="utf-8")

    def increment_version(self, document_id: str) -> int:
        metadata = self.metadata(document_id)
        metadata["version"] = int(metadata["version"]) + 1
        self.write_metadata(document_id, metadata)
        return metadata["version"]

    def delete(self, document_id: str) -> None:
        shutil.rmtree(self.directory(document_id))
