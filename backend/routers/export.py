"""Export router — convert edited HTML back to .docx."""

import io

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middleware.auth import AuthUser, get_current_user
from middleware.rate_limit import enforce_rate_limit
from services.docx_builder import html_to_docx_bytes

router = APIRouter()


class ExportRequest(BaseModel):
    html: str
    fileName: str


@router.post("/export")
async def export_docx(
    req: ExportRequest,
    request: Request,
    user: AuthUser = Depends(get_current_user),
):
    """Convert edited HTML content to a downloadable .docx file."""
    enforce_rate_limit(request, user.id)
    full_html = f"<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>{req.html}</body></html>"
    docx_bytes = html_to_docx_bytes(full_html)

    safe_name = req.fileName.replace(".docx", "").replace(" ", "_")
    download_name = f"{safe_name}-edited.docx"

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )
