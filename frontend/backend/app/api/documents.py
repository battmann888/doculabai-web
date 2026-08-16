from fastapi import APIRouter, Depends, File, UploadFile

from app.config import Settings, get_settings
from app.models.documents import (
    ChatRequest,
    ChatResponse,
    DocumentSummary,
    EditRequest,
    EditResponse,
)
from app.services.ai_edit_planner import AIEditPlanner
from app.services.document_parser import DocumentParser
from app.utils.errors import api_error

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentSummary, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
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
    segments, image_count = parser.parse_bytes(content)

    return DocumentSummary(
        document_id="",
        file_name=file.filename,
        version=1,
        segments=segments,
        image_count=image_count,
    )


@router.post("/plan", response_model=EditResponse)
def plan_edit(
    request: EditRequest,
    settings: Settings = Depends(get_settings),
):
    return AIEditPlanner(settings).plan(request, version=1)


@router.post("/chat", response_model=ChatResponse)
def chat_about_document(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
):
    return AIEditPlanner(settings).chat(request)
