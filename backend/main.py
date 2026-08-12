"""
DoculabAI — Backend
Edit documents with AI while preserving layout.
"""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import edit, export, health
from services.ai_service import validate_models

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        validation = validate_models()
        if validation["status"] == "degraded":
            logger.warning(
                "AI model validation issues detected: %s", validation["errors"]
            )
        else:
            logger.info("AI models validated successfully")
    except Exception as exc:
        logger.warning("AI model validation skipped: %s", exc)
    yield
    # Shutdown


app = FastAPI(
    title="DoculabAI API",
    description="Edit documents with AI — layout preserved.",
    version="1.0.0",
    lifespan=lifespan,
)

_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(edit.router, prefix="/api", tags=["edit"])
app.include_router(export.router, prefix="/api", tags=["export"])


@app.get("/")
async def root():
    return {"name": "DoculabAI API", "status": "running"}
