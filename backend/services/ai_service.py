"""AI service — communicates with the AI model to produce document edits."""

import asyncio
import base64
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types

load_dotenv()

logger = logging.getLogger(__name__)

API_KEY = os.getenv("API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
VISION_MODEL = os.getenv("VISION_MODEL", "gemini-2.5-flash")
VISION_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv(
        "VISION_FALLBACK_MODELS", "gemini-2.0-flash,gemini-1.5-flash"
    ).split(",")
    if m.strip()
]

_client: genai.Client | None = None
_vision_unavailable_models: set[str] = set()


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not API_KEY or API_KEY == "your_api_key_here":
            raise RuntimeError("API_KEY is not configured. Set it in backend/.env")
        _client = genai.Client(api_key=API_KEY)
    return _client


def _parse_data_url(data_url: str) -> tuple[bytes, str]:
    if "," not in data_url:
        raise ValueError("Invalid data URL: missing comma separator")
    _, b64_data = data_url.split(",", 1)
    if not b64_data.strip():
        raise ValueError("Invalid data URL: empty base64 data")
    image_bytes = base64.b64decode(b64_data, validate=True)
    if len(image_bytes) > 10 * 1024 * 1024:
        raise ValueError("Reference image must be 10 MB or smaller")
    mime_type = "image/png"
    if ":" in data_url:
        mime_type = data_url.split(":")[1].split(";")[0] or "image/png"
    return image_bytes, mime_type


def _ocr_image(data_url: str, image_id: str = "unknown") -> tuple[str, str | None]:
    try:
        image_bytes, mime_type = _parse_data_url(data_url)
    except Exception as e:
        logger.error("Invalid data URL for %s: %s", image_id, e)
        return "", str(e)

    models_to_try = [
        model
        for model in [VISION_MODEL, *VISION_FALLBACK_MODELS]
        if model not in _vision_unavailable_models
    ]
    if not models_to_try:
        return "", "Vision model tidak tersedia untuk API key ini."

    last_error: str | None = None

    for model in models_to_try:
        try:
            client = _get_client()
            response = client.models.generate_content(
                model=model,
                contents=[
                    "Extract ALL visible text from this image. Preserve line breaks. Return ONLY the extracted text.",
                    genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                ],
            )
            text = (response.text or "").strip()
            if text:
                logger.info("OCR success for %s using model %s", image_id, model)
            return text, None
        except Exception as e:
            error_str = str(e)
            last_error = f"{model}: {error_str}"
            logger.warning("OCR failed for %s with model %s: %s", image_id, model, error_str)
            if "does not support image input" in error_str or "MODEL_NOT_FOUND" in error_str:
                _vision_unavailable_models.add(model)
                continue
            continue

    if last_error:
        logger.error("All OCR models failed for %s. Last error: %s", image_id, last_error)
    return "", last_error


def _collect_image_ocr(
    images: dict[str, str] | None,
    segments: list[dict[str, Any]],
) -> tuple[dict[str, str], list[str]]:
    ocr_map: dict[str, str] = {}
    failed_images: list[str] = []
    seen_payloads: set[str] = set()

    # The frontend sends the image map only for image-aware commands. Avoid
    # expensive OCR for ordinary text/table edits.
    if not images:
        return ocr_map, failed_images

    for path, data_url in images.items():
        if data_url and data_url.startswith("data:"):
            if data_url in seen_payloads:
                continue
            seen_payloads.add(data_url)
            image_name = path.split("/")[-1]
            text, error = _ocr_image(data_url, image_id=image_name)
            if text:
                ocr_map[image_name] = text[:1000]
            if error:
                failed_images.append(image_name)

    for seg in segments:
        if seg.get("type") == "image" and seg.get("meta", {}).get("src"):
            image_id = seg.get("id", "unknown")
            source = seg["meta"]["src"]
            if source in seen_payloads:
                continue
            seen_payloads.add(source)
            text, error = _ocr_image(source, image_id=image_id)
            if text:
                ocr_map[image_id] = text[:1000]
            if error:
                failed_images.append(image_id)

    return ocr_map, failed_images


SYSTEM_PROMPT = """\
You are an expert document editor AI. Your job is to edit documents based on
user instructions while PRESERVING the original layout, structure, and formatting.

You receive:
1. The full document text
2. A list of segments (each with an id, type, position, and text)
3. The user's edit instruction
4. OCR texts extracted from images in the document
5. An optional reference image attached by the user

You must return precise text replacements as a JSON object with this exact shape:

{
  "edits": [
    {
      "segmentId": "<the segment id from the input>",
      "before": "<exact original text to find>",
      "after": "<the new text to replace it with>",
      "action": "<replace_text|delete_text|replace_table|translate|tone|summarize|custom>",
      "target": {"row": 0, "column": 0}
    }
  ],
  "explanation": "<a short, friendly summary of what you changed>",
  "action": "<the primary action type>",
  "reviewRequired": true
}

CRITICAL RULES:
1. The "before" field MUST be the EXACT text from the segment — copy it verbatim.
   The frontend uses this to find and replace text in the rendered document.
2. Only include edits where the text actually changes.
3. Preserve all structure — headings stay headings, tables stay tables.
4. For tables, edit the exact cell value and keep the table structure intact.
   Never replace the whole table string. Use action `replace_table` and include
   zero-based `target.row` and `target.column` for every table edit.
5. If the user asks to translate, translate all text segments.
6. If the user asks to change tone or style, rewrite text segments accordingly.
7. If the user asks to summarize, replace each section's text with a concise version.
8. Keep "after" text concise and natural — match the original language.
9. Never invent new segments — only edit existing ones.
10. If no edits are needed, return an empty edits array with an explanation.
11. Match the user's language for the explanation.
12. Use the OCR text from images as context. If the user refers to an image, use the OCR text to understand what needs to change.
13. If OCR text is missing for some images, infer from surrounding context or ask the user to be more specific about which image they mean.
14. The original document layout, image position, dimensions, and formatting are locked by default. Only change them when the user explicitly requests a layout or size change.
15. Treat an attached reference image as visual context or a replacement candidate; never invent a layout change from it.
16. When the user asks to turn an image into text, return action `replace_image_with_text` for the matching image segment. Put the OCR text in `after` and use the image segment filename in `before`.
17. Always set "reviewRequired": true to enable the change preview feature. This allows users to review changes before they are applied.
18. AMBIGUITY RULE: If the user asks to change a specific word or phrase, and you find it in MULTIPLE different segments, and the user did NOT specify which one (e.g., they didn't say "paragraf 2" or "semuanya"), DO NOT guess. Return an empty edits array, set action to "custom", and reply exactly in explanation: "Saya menemukan [N] bagian dengan teks tersebut. Pilih bagian yang ingin diubah." (replace [N] with the actual count).

Return ONLY the JSON object, no markdown fences, no extra text."""


def _build_user_prompt(
    document_text: str,
    segments: list[dict[str, Any]],
    user_prompt: str,
    history: list[dict[str, Any]],
    file_name: str,
    font_family: str | None,
    image_ocr_map: dict[str, str] | None = None,
    failed_image_ids: list[str] | None = None,
    has_reference_image: bool = False,
) -> str:
    seg_lines = []
    for seg in segments:
        meta_str = ""
        if seg.get("meta"):
            m = seg["meta"]
            parts = []
            if m.get("level"):
                parts.append(f"level={m['level']}")
            if m.get("rows"):
                parts.append(f"rows={m['rows']}")
            if m.get("cols"):
                parts.append(f"cols={m['cols']}")
            if m.get("cells"):
                parts.append(f"cells={m['cells']}")
            if m.get("formatting"):
                parts.append(f"formatting={m['formatting']}")
            if m.get("cellFormatting"):
                parts.append(f"cellFormatting={m['cellFormatting']}")
            meta_str = f" [{', '.join(parts)}]" if parts else ""
        seg_lines.append(
            f"ID: {seg['id']} | TYPE: {seg['type']}{meta_str} | TEXT: {seg['text']}"
        )

    segments_str = "\n".join(seg_lines)

    history_str = ""
    if history:
        hist_lines = []
        for msg in history[-6:]:
            hist_lines.append(f"{msg['role']}: {msg['content']}")
        history_str = f"\n\nPREVIOUS CONVERSATION:\n{chr(10).join(hist_lines)}"

    font_instruction = (
        f"Use {font_family} for the edited text. Preserve bold, italic, underline, "
        "size, alignment, and other formatting from the original document."
        if font_family
        else "Use the original document font and preserve bold, italic, underline, size, alignment, and other formatting."
    )

    image_ocr_str = ""
    if image_ocr_map:
        ocr_lines = []
        for key, text in image_ocr_map.items():
            if text:
                ocr_lines.append(f"[{key}]: {text}")
        if ocr_lines:
            image_ocr_str = (
                "\n\nIMAGE TEXTS (extracted via OCR from images in this document):\n"
                + "\n".join(ocr_lines)
            )

    failed_images_str = ""
    if failed_image_ids:
        failed_images_str = (
            "\n\nNOTE: The following images could not be OCR'd: "
            + ", ".join(failed_image_ids)
            + ". If the user refers to these images, use surrounding text context."
        )

    reference_image_str = (
        "\n\nREFERENCE IMAGE: An image uploaded with this prompt is available as visual context. "
        "Use it only for the requested edit and preserve the document image's original position and size unless the user explicitly asks otherwise."
        if has_reference_image
        else ""
    )

    return f"""\
FILE: {file_name}

FONT INSTRUCTION:
{font_instruction}

DOCUMENT FULL TEXT:
{document_text}

DOCUMENT SEGMENTS (these are the editable units — use their IDs):
{segments_str}
{history_str}
{image_ocr_str}{failed_images_str}{reference_image_str}

USER INSTRUCTION:
{user_prompt}

Return the JSON object with edits now."""


async def process_edit_request(
    document_text: str,
    segments: list[dict[str, Any]],
    user_prompt: str,
    history: list[dict[str, Any]],
    file_name: str,
    font_family: str | None = None,
    images: dict[str, str] | None = None,
    reference_image: str | None = None,
) -> dict[str, Any]:
    client = _get_client()

    reference_part = None
    if reference_image:
        try:
            image_bytes, mime_type = _parse_data_url(reference_image)
            if not mime_type.startswith("image/"):
                raise ValueError("Reference file must be an image")
            reference_part = genai_types.Part.from_bytes(
                data=image_bytes,
                mime_type=mime_type,
            )
        except (ValueError, base64.binascii.Error) as exc:
            raise RuntimeError(f"Invalid reference image: {exc}") from exc

    image_ocr_map, failed_image_ids = await asyncio.to_thread(
        _collect_image_ocr, images, segments
    )

    full_prompt = _build_user_prompt(
        document_text,
        segments,
        user_prompt,
        history,
        file_name,
        font_family,
        image_ocr_map,
        failed_image_ids,
        bool(reference_image),
    )

    try:
        model_contents: str | list[Any] = full_prompt
        if reference_part:
            model_contents = [full_prompt, reference_part]

        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=model_contents,
                config=genai_types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.4,
                    response_mime_type="application/json",
                    max_output_tokens=8192,
                ),
            ),
            timeout=55,
        )

        raw_text = response.text or ""
        parsed = _parse_json_response(raw_text)

        edits = _validate_edits(parsed.get("edits", []), segments)

        return {
            "success": True,
            "edits": edits,
            "explanation": parsed.get("explanation", "Done."),
            "action": parsed.get("action", "custom"),
        }

    except asyncio.TimeoutError:
        raise RuntimeError("AI request timed out after 55 seconds. Please try again.")
    except json.JSONDecodeError:
        return {
            "success": False,
            "edits": [],
            "explanation": "Perintah belum bisa diproses. Coba lagi.",
            "action": "custom",
        }
    except Exception as e:
        raise RuntimeError("AI request failed") from e


def validate_models() -> dict[str, Any]:
    client = _get_client()
    results: dict[str, Any] = {
        "text_model": GEMINI_MODEL,
        "vision_model": VISION_MODEL,
        "status": "ok",
        "errors": [],
    }

    try:
        client.models.get(model=GEMINI_MODEL)
        logger.info("Text model %s is accessible", GEMINI_MODEL)
    except Exception as e:
        msg = f"Text model {GEMINI_MODEL} is not accessible: {e}"
        logger.error(msg)
        results["errors"].append(msg)
        results["status"] = "degraded"

    try:
        client.models.get(model=VISION_MODEL)
        logger.info("Vision model %s is accessible", VISION_MODEL)
    except Exception as e:
        msg = f"Vision model {VISION_MODEL} is not accessible: {e}"
        logger.warning(msg)
        results["errors"].append(msg)
        results["status"] = "degraded"

    for fallback in VISION_FALLBACK_MODELS:
        try:
            client.models.get(model=fallback)
            logger.info("Fallback vision model %s is accessible", fallback)
        except Exception as e:
            logger.warning(
                "Fallback vision model %s is not accessible: %s", fallback, e
            )

    return results


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _validate_edits(
    candidate_edits: Any, segments: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Reject hallucinated/mis-targeted edits before they reach the DOCX package.

    A model is allowed to suggest only replacements anchored to the exact segment
    supplied by the client. This prevents a valid-looking response from changing
    the first repeated string elsewhere in a document.
    
    Enhanced to check for ambiguous matches and require precise context targeting.
    """
    if not isinstance(candidate_edits, list):
        return []
    by_id = {str(segment.get("id", "")): segment for segment in segments}
    valid_actions = {
        "replace_text",
        "delete_text",
        "replace_table",
        "translate",
        "tone",
        "summarize",
        "restyle",
        "custom",
        "insert_text",
        "replace_image_with_text",
    }
    accepted: list[dict[str, Any]] = []
    
    # Build a map of text to segment IDs to detect ambiguous matches
    text_to_segments: dict[str, list[str]] = {}
    for segment in segments:
        text = _normalize_text(str(segment.get("text", "")))
        if text:
            if text not in text_to_segments:
                text_to_segments[text] = []
            text_to_segments[text].append(str(segment.get("id", "")))
    
    for edit in candidate_edits:
        if not isinstance(edit, dict):
            continue
        segment_id = str(edit.get("segmentId", ""))
        before = edit.get("before")
        after = edit.get("after", "")
        action = str(edit.get("action", "replace_text"))
        segment = by_id.get(segment_id)
        if not segment or not isinstance(before, str) or not isinstance(after, str):
            continue
        if action not in valid_actions or (not after and action != "delete_text"):
            continue
        target = edit.get("target")
        haystack = str(segment.get("text", ""))
        if segment.get("type") == "table":
            if action != "replace_table" or not isinstance(target, dict):
                continue
            row, column = target.get("row"), target.get("column")
            cells = segment.get("meta", {}).get("cells", [])
            if not isinstance(row, int) or not isinstance(column, int):
                continue
            if row < 0 or column < 0 or row >= len(cells) or column >= len(cells[row]):
                continue
            haystack = str(cells[row][column])
        
        # Check if the "before" text is actually in the target segment
        if _normalize_text(before) not in _normalize_text(haystack):
            logger.warning("Discarded an edit not anchored to segment %s", segment_id)
            continue
        
        # Check for ambiguous matches - if the same text appears in multiple segments
        # and the edit doesn't specify enough context, reject it
        normalized_before = _normalize_text(before)
        matching_segments = text_to_segments.get(normalized_before, [])
        if len(matching_segments) > 1 and segment_id not in matching_segments:
            logger.warning(
                "Ambiguous edit: text '%s' appears in %d segments but targets %s",
                before[:50],
                len(matching_segments),
                segment_id
            )
            continue
        
        safe_edit: dict[str, Any] = {
            "segmentId": segment_id,
            "before": before,
            "after": after,
            "action": action,
        }
        if isinstance(target, dict):
            safe_edit["target"] = {
                "row": target.get("row"),
                "column": target.get("column"),
            }
        accepted.append(safe_edit)
    return accepted


def _parse_json_response(raw_text: str) -> dict[str, Any]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = (
            cleaned.removeprefix("```").removeprefix("json").removesuffix("```").strip()
        )
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start >= 0 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise
