"""Health check router."""

import logging

from fastapi import APIRouter

from services.ai_service import validate_models

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health")
async def health():
    try:
        validation = validate_models()
        return {
            "status": "ok" if validation["status"] == "ok" else "degraded",
            "service": "ai-document-studio",
            "models": validation,
        }
    except Exception as e:
        logger.error("Health check model validation failed: %s", e)
        return {
            "status": "error",
            "service": "ai-document-studio",
            "error": str(e),
        }
