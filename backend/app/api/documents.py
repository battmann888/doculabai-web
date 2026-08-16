from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse

from app.config import Settings, get_settings
from app.models.documents import (
    ApplyEditRequest,
    ChatRequest,
    ChatResponse,
    DocumentSummary,
    EditRequest,
    EditResponse,
)
from app.services.ai_edit_planner import AIEditPlanner
from app.services.document_editor import DocumentEditor
from app.services.document_exporter import DocumentExporter
from app.services.document_parser import DocumentParser
from app.services.document_store import DocumentStore
from app.utils.errors import api_error

router = APIRouter(prefix="/api/documents", tags=["documents"])


def store(settings: Settings = Depends(get_settings)) -> DocumentStore:
    return DocumentStore(settings)


@router.post("/upload", response_model=DocumentSummary, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    document_store: DocumentStore = Depends(store),
):
    if not file.filename or not file.filename.lower().endswith(".docx"):
        raise api_error(415, "unsupported_file", "Only .docx files are supported.")
    if file.content_type and file.content_type not in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    }:
        raise api_error(
            415, "unsupported_file", "The uploaded file does not have a DOCX MIME type."
        )

    content = await file.read(settings.max_upload_size_bytes + 1)
    if len(content) > settings.max_upload_size_bytes:
        raise api_error(
            413,
            "file_too_large",
            f"DOCX files must be {settings.max_upload_size_mb} MB or smaller.",
        )

    parser = DocumentParser()
    parser.validate(content)
    document_id = document_store.create(file.filename, content)
    segments, image_count = parser.parse_bytes(content)

    return DocumentSummary(
        document_id=document_id,
        file_name=file.filename,
        version=1,
        segments=segments,
        image_count=image_count,
    )


@router.get("/{document_id}", response_model=DocumentSummary)
def get_document(document_id: str, document_store: DocumentStore = Depends(store)):
    meta = document_store.metadata(document_id)
    segments, images = DocumentParser().parse_file(
        document_store.current_path(document_id)
    )
    return DocumentSummary(
        document_id=document_id,
        file_name=meta["file_name"],
        version=meta["version"],
        segments=segments,
        image_count=images,
    )


@router.post("/{document_id}/edit", response_model=EditResponse)
def plan_edit(
    document_id: str,
    request: EditRequest,
    settings: Settings = Depends(get_settings),
    document_store: DocumentStore = Depends(store),
):
    document_store.metadata(document_id)
    return AIEditPlanner(settings).plan(
        request, document_store.metadata(document_id)["version"]
    )


@router.post("/{document_id}/apply", response_model=DocumentSummary)
def apply_edit(
    document_id: str,
    request: ApplyEditRequest,
    document_store: DocumentStore = Depends(store),
):
    path = document_store.current_path(document_id)
    DocumentEditor().apply(path, request.edits, request.operations)
    DocumentExporter().validate(path)
    version = document_store.increment_version(document_id)
    meta = document_store.metadata(document_id)
    segments, images = DocumentParser().parse_file(path)
    return DocumentSummary(
        document_id=document_id,
        file_name=meta["file_name"],
        version=version,
        segments=segments,
        image_count=images,
    )


@router.post("/{document_id}/chat", response_model=ChatResponse)
def chat_about_document(
    document_id: str,
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
    document_store: DocumentStore = Depends(store),
):
    document_store.metadata(document_id)
    return AIEditPlanner(settings).chat(request)


@router.post("/{document_id}/export")
def export_document(document_id: str, document_store: DocumentStore = Depends(store)):
    path = document_store.current_path(document_id)
    DocumentExporter().validate(path)
    name = (
        document_store.metadata(document_id)["file_name"].removesuffix(".docx")
        + "-edited.docx"
    )
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=name,
    )


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: str, document_store: DocumentStore = Depends(store)):
    document_store.delete(document_id)
