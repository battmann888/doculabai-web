from typing import Any, Literal

from pydantic import BaseModel, Field


class ApiError(BaseModel):
    code: str
    message: str
    details: dict[str, Any] | None = None


class Segment(BaseModel):
    id: str
    type: Literal["heading", "paragraph", "table", "image", "list"]
    text: str = ""
    position: int
    meta: dict[str, Any] | None = None


class DocumentSummary(BaseModel):
    document_id: str
    file_name: str
    status: Literal["ready"] = "ready"
    version: int
    segments: list[Segment]
    image_count: int


class TextEdit(BaseModel):
    segmentId: str
    before: str
    after: str
    action: str = "replace_text"
    target: dict[str, int] | None = None


class Operation(BaseModel):
    type: Literal[
        "format_text",
        "format_paragraph",
        "modify_page_layout",
        "modify_heading_style",
        "resize_image",
        "add_page_break",
        "insert_text",
        "delete_text",
        "delete_image",
    ]
    segmentId: str | None = None
    level: int | None = Field(default=None, ge=1, le=9)
    widthCm: float | None = Field(default=None, gt=0, le=50)
    heightCm: float | None = Field(default=None, gt=0, le=80)
    properties: dict[str, Any] | None = None
    text: str | None = Field(default=None, max_length=50_000)
    position: int | None = Field(default=None, ge=0)


class Recommendation(BaseModel):
    id: str
    title: str
    description: str
    operations: list[Operation] | None = None
    edits: list[TextEdit] | None = None


class EditRequest(BaseModel):
    userPrompt: str = Field(min_length=1, max_length=4000)
    documentText: str = Field(default="", max_length=200_000)
    segments: list[Segment] = Field(default_factory=list, max_length=2_000)
    conversationHistory: list[dict[str, Any]] = Field(default_factory=list, max_length=30)
    fileName: str = Field(default="document.docx", max_length=255)
    fontFamily: str | None = Field(default=None, max_length=100)
    operationId: str | None = Field(default=None, max_length=100)


class EditResponse(BaseModel):
    success: bool
    edits: list[TextEdit] = Field(default_factory=list)
    operations: list[Operation] = Field(default_factory=list)
    recommendations: list[Recommendation] = Field(default_factory=list)
    explanation: str
    action: str = "custom"
    version: int


class ApplyEditRequest(EditRequest):
    operations: list[Operation] = Field(default_factory=list)
    edits: list[TextEdit] = Field(default_factory=list)


class ChatRequest(BaseModel):
    """Request body for the document assistant Q&A endpoint."""
    question: str = Field(min_length=1, max_length=4000)
    segments: list[Segment] = Field(default_factory=list, max_length=2_000)
    fileName: str = Field(default="document.docx", max_length=255)
    conversationHistory: list[dict[str, Any]] = Field(default_factory=list, max_length=30)


class ChatResponse(BaseModel):
    """Response from the document assistant Q&A endpoint."""
    answer: str
    recommendations: list[Recommendation] = Field(default_factory=list)
