from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.documents import router as documents_router
from app.config import get_settings

settings = get_settings()
app = FastAPI(title="AIDOCU API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=False, allow_methods=["GET", "POST", "DELETE", "OPTIONS"], allow_headers=["Content-Type", "X-Requested-With"])


@app.exception_handler(Exception)
async def unhandled_error(_: Request, __: Exception):
    return JSONResponse(status_code=500, content={"detail": {"code": "internal_error", "message": "An unexpected server error occurred."}})


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "aidocu-api"}


app.include_router(documents_router)
