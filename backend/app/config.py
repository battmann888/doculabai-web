import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_storage_dir() -> Path:
    if os.environ.get("VERCEL"):
        return Path("/tmp/data")
    try:
        probe = Path("./.write_probe")
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        return Path("./data")
    except OSError:
        return Path("/tmp/data")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    gemini_models: str = (
        "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.7-flash,gemini-flash-lite-latest"
    )

    storage_dir: Path = _default_storage_dir()

    max_upload_size_mb: int = 25
    ai_timeout_seconds: int = 90
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,https://doculabai.my.id"
    )

    @property
    def max_upload_size_bytes(self) -> int:
        return self.max_upload_size_mb * 1024 * 1024

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]

    @property
    def gemini_model_list(self) -> list[str]:
        models = [m.strip() for m in self.gemini_models.split(",") if m.strip()]
        if self.gemini_model and self.gemini_model not in models:
            models.insert(0, self.gemini_model)
        return models or [self.gemini_model or "gemini-1.5-flash"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
