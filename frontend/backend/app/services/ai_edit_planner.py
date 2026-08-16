import json
import re

from app.config import Settings
from app.models.documents import (
    ChatRequest,
    ChatResponse,
    EditRequest,
    EditResponse,
    Operation,
    Recommendation,
    TextEdit,
)
from app.utils.errors import api_error


class AIEditPlanner:
    def __init__(self, settings: Settings):
        self.settings = settings

    def plan(self, request: EditRequest, version: int) -> EditResponse:

        if not self.settings.gemini_api_key:
            raise api_error(
                503,
                "ai_unavailable",
                "Asisten AI belum siap. Tim kami perlu mengaktifkan koneksi AI terlebih dahulu.",
            )

        direct_plan = self._explicit_text_replacement(request, version)
        if direct_plan:
            return direct_plan

        nim_plan = self._nim_ending_replacement(request, version)
        if nim_plan:
            return nim_plan

        last_error: Exception | None = None

        for model in self.settings.gemini_model_list:
            try:
                from google import genai

                client = genai.Client(
                    api_key=self.settings.gemini_api_key,
                    http_options={"timeout": self.settings.ai_timeout_seconds * 1000},
                )
                response = client.models.generate_content(
                    model=model,
                    contents=self._prompt(request),
                    config={
                        "response_mime_type": "application/json",
                        "max_output_tokens": 2_048,
                    },
                )
                return self._validate(self._load_json(response.text), request, version)
            except Exception as exc:
                last_error = exc
                if hasattr(exc, "status_code") and exc.status_code in (401, 403):
                    raise
                continue

        if last_error is not None and hasattr(last_error, "status_code"):
            raise last_error
        raise api_error(
            502,
            "ai_processing_failed",
            "Asisten AI sedang tidak dapat memproses permintaan ini. Silakan coba lagi sebentar lagi.",
        ) from last_error

    def chat(self, request: ChatRequest) -> ChatResponse:
        if not self.settings.gemini_api_key:
            raise api_error(
                503,
                "ai_unavailable",
                "Asisten AI belum siap. Tim kami perlu mengaktifkan koneksi AI terlebih dahulu.",
            )
        last_error: Exception | None = None

        for model in self.settings.gemini_model_list:
            try:
                from google import genai

                client = genai.Client(
                    api_key=self.settings.gemini_api_key,
                    http_options={"timeout": self.settings.ai_timeout_seconds * 1000},
                )
                response = client.models.generate_content(
                    model=model,
                    contents=self._chat_prompt(request),
                    config={"max_output_tokens": 2_048},
                )
                return ChatResponse(
                    answer=response.text
                    or "Maaf, saya belum dapat menjawab pertanyaan ini."
                )
            except Exception as exc:
                last_error = exc
                if hasattr(exc, "status_code") and exc.status_code in (401, 403):
                    raise
                continue

        if last_error is not None and hasattr(last_error, "status_code"):
            raise last_error
        raise api_error(
            502,
            "ai_processing_failed",
            "Asisten AI sedang tidak dapat memproses permintaan ini. Silakan coba lagi sebentar lagi.",
        ) from last_error

    @staticmethod
    def _explicit_text_replacement(
        request: EditRequest, version: int
    ) -> EditResponse | None:
        match = re.search(
            r'(?:edit\s+this\s+text|ubah\s+teks\s+ini|ganti\s+teks\s+ini)\s*:\s*["""](.+?)["""]'
            r'\s*(?:ganti|ubah|replace)?\s*(?:dengan|menjadi|with|to)\s*["""]?(.+?)["""]?\s*$',
            request.userPrompt,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if not match:
            return None
        before, replacement = (part.strip() for part in match.groups())
        if not before or not replacement:
            return None
        matches = [segment for segment in request.segments if before in segment.text]
        if len(matches) != 1:
            return None
        target = matches[0]
        return EditResponse(
            success=True,
            edits=[
                TextEdit(
                    segmentId=target.id,
                    before=before,
                    after=replacement,
                    action="replace_text",
                )
            ],
            explanation="Saya menyiapkan penggantian teks yang dipilih tanpa mengubah format atau elemen lain.",
            action="replace_text",
            version=version,
        )

    _NIM_RE = re.compile(r"\b\d{8,15}\b")

    _NIM_ENDING_RE = re.compile(
        r"(?:akhir|belakang|terakhir|ending|last\s+digit|last\s+digits)"
        r".{0,30}?"
        r"(\d{1,4})"
        r"|"
        r"(?:jadi|menjadi|jadikan|set|to|menjadi)\s+(\d{1,4})",
        flags=re.IGNORECASE,
    )

    @classmethod
    def _nim_ending_replacement(
        cls, request: EditRequest, version: int
    ) -> EditResponse | None:
        prompt = request.userPrompt

        if not re.search(r"nim|n\.i\.m\.|nomor\s+induk", prompt, re.IGNORECASE):
            return None
        if not re.search(r"akhir|belakang|terakhir|ending|last", prompt, re.IGNORECASE):
            return None

        ending_match = cls._NIM_ENDING_RE.search(prompt)

        ending = ""
        if ending_match:
            ending = ending_match.group(1) or ending_match.group(2) or ""
        ending = re.sub(r"\D", "", ending)[-4:] or "30"

        edits: list[TextEdit] = []
        changed_count = 0

        for segment in request.segments:
            if segment.type == "table":
                cells = (segment.meta or {}).get("cells") or []

                for row_idx, row in enumerate(cells):
                    for col_idx, cell_text in enumerate(row):
                        new_cell, n = cls._rewrite_nim_endings(cell_text, ending)
                        if n:
                            edits.append(
                                TextEdit(
                                    segmentId=segment.id,
                                    before=cell_text,
                                    after=new_cell,
                                    action="replace_text",
                                    target={"row": row_idx, "column": col_idx},
                                )
                            )
                            changed_count += n
            elif segment.type in ("paragraph", "heading", "list"):
                new_text, n = cls._rewrite_nim_endings(segment.text, ending)
                if n:
                    edits.append(
                        TextEdit(
                            segmentId=segment.id,
                            before=segment.text,
                            after=new_text,
                            action="replace_text",
                        )
                    )
                    changed_count += n

        if not edits:
            return None

        explanation = (
            f"Saya menemukan {changed_count} angka NIM dan mengubah digit akhirnya "
            f"menjadi '{ending}' di seluruh teks dan tabel dokumen. "
            "Angka NIM yang berada di dalam gambar tidak dapat diubah otomatis "
            "karena itu bagian dari gambar, bukan teks."
        )
        return EditResponse(
            success=True,
            edits=edits,
            explanation=explanation,
            action="replace_text",
            version=version,
        )

    @classmethod
    def _rewrite_nim_endings(cls, text: str, ending: str) -> tuple[str, int]:
        count = 0

        def repl(match: re.Match) -> str:
            nonlocal count
            number = match.group(0)
            if len(number) <= len(ending):
                return number
            count += 1
            return number[: -len(ending)] + ending

        new_text = cls._NIM_RE.sub(repl, text)
        return new_text, count

    @staticmethod
    def _load_json(content: str | None) -> dict:
        text = (content or "").strip()

        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0].strip()
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise api_error(
                502,
                "ai_invalid_response",
                "Asisten AI memberi respons yang belum dapat digunakan. Silakan coba lagi.",
            ) from exc
        if not isinstance(payload, dict):
            raise api_error(
                502,
                "ai_invalid_response",
                "Asisten AI memberi respons yang belum dapat digunakan. Silakan coba lagi.",
            )
        return payload

    @staticmethod
    def _prompt(request: EditRequest) -> str:

        return """You are AIDOCU, a careful AI document editor. Your job is to understand a user's natural-language request in Indonesian or English and turn it into a SMALL, safe, reviewable plan for an existing DOCX document.

AIDOCU is used by many people with many different kinds of documents: reports, letters, theses, resumes/CVs, contracts, proposals, academic papers, meeting notes, invoices, certificates, and more. The DOCUMENT SEGMENTS below are the authoritative source of truth for the current document. Read them carefully and use ONLY the exact segment IDs, text, table cells, and image indexes they contain. Never assume content that is not present.

NON-NEGOTIABLE SAFETY RULES
1. Never recreate, summarize, translate, or rewrite the full document unless the user explicitly asks for the full document. Change only the exact target(s).
2. Preserve all untouched text, runs, font, font size, bold/italic/underline, alignment, paragraph spacing, tables, images, headers, footers, margins, and page layout.
3. Use only exact segment IDs supplied in DOCUMENT SEGMENTS. Do not invent IDs, text, image indexes, table cells, or formatting values.
4. A text edit must use an exact `before` substring that appears in that segment. Preserve punctuation, whitespace, name suffixes, and surrounding text unless the user explicitly requests otherwise.
5. If the target is ambiguous (for example there are multiple matching names, "gambar kedua" but the intended image cannot be determined, or no requested text exists), do not guess. Return success=false and ask one short, friendly clarification in Indonesian.
6. Do not apply a change automatically. Every edit is a proposal for the user to review.
7. If an operation could materially alter layout, prefer a conservative recommendation over an edit. Never silently crop, stretch, delete, or replace an image.

HOW TO INTERPRET COMMON REQUESTS (works for ANY document type)
TEXT EDITS
- "ganti/ubah nama X menjadi Y" or "replace X with Y": one `edits` item action `replace_text`.
- "ganti semua X menjadi Y" (change ALL occurrences): create ONE edit per matching segment/cell. For a paragraph, one edit with the full new paragraph text. For a table, one edit per matching cell with the correct `target`.
- For edits inside a TABLE segment, ALWAYS include `target: {"row": <0-based row>, "column": <0-based column>}` pointing to the exact cell being edited. The `before` must be the exact text of that cell (or a substring of it). This lets the editor apply the change to the correct cell even when several cells share similar text.
- For "ubah/ganti SEMUA X menjadi Y" (change ALL X to Y) inside a table, READ the table cells first, then create ONE edit per matching cell. Each edit must use that cell's exact original text as `before`, the correctly computed new text as `after`, and the correct `target: {"row":..., "column":...}`. Example: if the user says "ganti semua NIM jadi 362556301025 tapi angka akhirnya beda" and the table has NIMs 362556301001, 362556301002, 362556301003, produce three edits: {before:"362556301001", after:"3625563010251", target:{row:1,column:1}}, {before:"362556301002", after:"3625563010252", target:{row:2,column:1}}, {before:"362556301003", after:"3625563010253", target:{row:3,column:1}}. Preserve each cell's unique trailing digit unless the user says otherwise.
- "tambahkan paragraf setelah pendahuluan": `insert_text` with segmentId of the heading "Pendahuluan" and the text to insert.
- "hapus paragraf ini": `delete_text` with the correct segmentId.
- For translation or grammar/style rewriting, create one exact edit per clearly identified segment. Retain proper names, codes, numbers, and citations unless explicitly asked to translate them.

FORMATTING EDITS
- "semua font menjadi Times New Roman": `format_text` for each applicable text segment, properties {"fontFamily":"Times New Roman"}; do not touch font size.
- "judul ... bold 16 pt": target heading segments only, `format_text` with only the requested properties, e.g. {"bold":true,"fontSize":16}.
- "rapikan spacing": use `format_paragraph` only when the user gives a scope or the affected paragraphs are unambiguous. Keep it conservative.
- "ubah margin menjadi 2.5 cm": `modify_page_layout` with marginTopCm, marginBottomCm, marginLeftCm, marginRightCm all set to 2.5.
- "ubah orientasi menjadi landscape": `modify_page_layout` with orientation:"landscape".

IMAGE EDITS
- "perbesar gambar logo menjadi 5 cm": `resize_image` only if a uniquely identifiable image segment is present; set widthCm to 5 and preserve aspect ratio.
- "ubah ukuran gambar menjadi 8 x 6 cm": `resize_image` with widthCm=8 and heightCm=6.
- "hapus gambar kedua": `delete_image` with the correct image segmentId.
- "ganti gambar 'image1.png' dengan teks ...": one `edits` item with `segmentId` of the image, `before` set to the exact image text (e.g. "image1.png"), `action` set to `replace_image_with_text`, and `after` set to the new text. (For tables, use markdown table format in the `after` field).
- If `[USER UPLOADED AN IMAGE]` is in the prompt and the user wants to replace an image: one `edits` item with `segmentId` of the image, `before` set to the image text, `action` set to `replace_image_with_uploaded`.
- Requests to add/replace an image (without upload), move a floating image, or resize tables should be handled only if the requested target and supported operation are present. Otherwise success=false, explain plainly what AIDOCU needs from the user. Never pretend it happened.

EDGE CASES
- For incomplete requests (e.g., "ganti dengan teks" but no text/font size given, or "ganti dengan tabel" without content): return `success: false` and ask exactly what text/size/font or table content they want.
- Questions such as "apa isi dokumen ini?" are allowed: return success=true, no edits/operations, and answer concisely from the provided segments.

ALLOWED OPERATION TYPES ONLY
format_text, format_paragraph, modify_page_layout, modify_heading_style, resize_image, add_page_break, insert_text, delete_text, delete_image. (For edits, `replace_image_with_text` and `replace_image_with_uploaded` are allowed).

OUTPUT CONTRACT
Return valid JSON only—no Markdown, no code fence, no commentary outside JSON:
{
  "success": true,
  "edits": [{"segmentId":"exact id","before":"exact old text","after":"new text","action":"replace_text"}],
  "operations": [{"type":"format_text","segmentId":"exact id","properties":{"bold":true}}],
  "recommendations": [],
  "explanation": "Bahasa Indonesia, singkat, jelaskan tepat perubahan atau jawaban.",
  "action": "replace_text"
}
When no safe action can be proposed, return `success:false`, empty edits/operations, and a clear Indonesian explanation. Recommendations must never contain destructive actions.

USER REQUEST:
%s

DOCUMENT NAME: %s
DOCUMENT SEGMENTS (authoritative source):
%s""" % (
            request.userPrompt,
            request.fileName,
            json.dumps(AIEditPlanner._planning_segments(request), ensure_ascii=False),
        )

    @staticmethod
    def _chat_prompt(request: ChatRequest) -> str:
        segments_summary = json.dumps(
            [
                {
                    "id": s.id,
                    "type": s.type,
                    "text": s.text[:4000],
                    "position": s.position,
                }
                for s in request.segments
            ],
            ensure_ascii=False,
        )
        return f"""You are AIDOCU Assistant, a helpful AI that answers questions about documents. 
Answer in Indonesian unless the user writes in English. Be concise and helpful.
Do NOT suggest or make any changes to the document. Only answer questions and provide information.

DOCUMENT: {request.fileName}
DOCUMENT CONTENT:
{segments_summary}

USER QUESTION:
{request.question}"""

    @staticmethod
    def _planning_segments(request: EditRequest) -> list[dict]:
        allowed_meta = {
            "level",
            "rows",
            "cols",
            "style",
            "location",
            "imagePath",
            "widthCm",
            "heightCm",
        }
        return [
            {
                "id": segment.id,
                "type": segment.type,
                "text": segment.text[:8_000],
                "position": segment.position,
                "meta": {
                    key: value
                    for key, value in (segment.meta or {}).items()
                    if key in allowed_meta
                },
            }
            for segment in request.segments
        ]

    @staticmethod
    def _validate(payload: dict, request: EditRequest, version: int) -> EditResponse:

        ids = {segment.id for segment in request.segments}

        edits = [TextEdit.model_validate(item) for item in payload.get("edits", [])]
        operations = [
            Operation.model_validate(item) for item in payload.get("operations", [])
        ]

        for edit in edits:
            target = next(
                (
                    segment
                    for segment in request.segments
                    if segment.id == edit.segmentId
                ),
                None,
            )
            if not target or not edit.before or edit.before not in target.text:
                raise api_error(
                    422,
                    "invalid_ai_plan",
                    "Rencana perubahan AI belum cukup aman untuk diterapkan. Coba perintah yang lebih spesifik.",
                )
            if edit.target is not None:

                rows = int((target.meta or {}).get("rows", 0))
                cols = int((target.meta or {}).get("cols", 0))
                row = edit.target.get("row", -1)
                column = edit.target.get("column", -1)
                if row < 0 or column < 0 or row >= rows or column >= cols:
                    raise api_error(
                        422,
                        "invalid_ai_plan",
                        "Rencana perubahan AI belum cukup aman untuk diterapkan. Coba perintah yang lebih spesifik.",
                    )

        for operation in operations:
            if operation.segmentId and operation.segmentId not in ids:
                raise api_error(
                    422,
                    "invalid_ai_plan",
                    "Rencana perubahan AI belum cukup aman untuk diterapkan. Coba perintah yang lebih spesifik.",
                )

        recommendations = [
            Recommendation.model_validate(item)
            for item in payload.get("recommendations", [])
        ]

        return EditResponse(
            success=bool(payload.get("success")),
            edits=edits,
            operations=operations,
            recommendations=recommendations,
            explanation=str(
                payload.get("explanation")
                or "Saya belum menemukan perubahan yang aman untuk diterapkan."
            ),
            action=str(payload.get("action") or "custom"),
            version=version,
        )
