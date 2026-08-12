"""Edit router — receive prompts and return AI-powered document edits."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ValidationError

from middleware.auth import AuthUser, get_current_user
from middleware.rate_limit import enforce_rate_limit
from services.ai_service import process_edit_request

logger = logging.getLogger(__name__)

router = APIRouter()


class SegmentMeta(BaseModel, extra="allow"):
    level: int | None = None
    rows: int | None = None
    cols: int | None = None
    src: str | None = None
    style: str | None = None
    formatting: str | None = None
    cellFormatting: list[list[str]] | None = None


class Segment(BaseModel):
    id: str
    type: str
    text: str
    position: int
    meta: SegmentMeta | None = None


class HistoryMessage(BaseModel, extra="allow"):
    id: str
    role: str
    content: str
    timestamp: int


class EditRequest(BaseModel):
    documentText: str
    segments: list[Segment]
    userPrompt: str
    conversationHistory: list[HistoryMessage] = []
    fileName: str
    fontFamily: str | None = None
    images: dict[str, str] | None = None
    referenceImage: str | None = None


class SegmentDiff(BaseModel):
    segmentId: str
    before: str
    after: str
    action: str
    target: dict[str, int] | None = None


class EditResponse(BaseModel):
    success: bool
    edits: list[SegmentDiff]
    explanation: str
    action: str


@router.post("/edit", response_model=EditResponse)
async def edit_document(
    req: EditRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
):
    enforce_rate_limit(request, user.id)
    try:
        result = await process_edit_request(
            document_text=req.documentText,
            segments=[s.model_dump() for s in req.segments],
            user_prompt=req.userPrompt,
            history=[m.model_dump() for m in req.conversationHistory],
            file_name=req.fileName,
            font_family=req.fontFamily,
            images=req.images,
            reference_image=req.referenceImage,
        )
        return result
    except ValidationError as e:
        logger.error("Request validation error: %s", e)
        raise HTTPException(
            status_code=422,
            detail="Format permintaan tidak valid. Periksa data yang dikirim.",
        ) from e
    except RuntimeError as e:
        logger.error("AI processing error: %s", e)
        raise HTTPException(
            status_code=500,
            detail=str(e),
        ) from e
    except Exception as e:
        logger.error("Unexpected error in edit_document: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Perintah tidak dapat diproses sekarang. Periksa koneksi AI lalu coba lagi.",
        ) from e
