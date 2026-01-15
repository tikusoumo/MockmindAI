from __future__ import annotations

from pydantic import AnyHttpUrl
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None

    # Local Model Configuration
    llama_base_url: str = "http://localhost:11434/v1"
    llama_model: str = "qwen3-4b"
    whisper_base_url: str = "http://localhost:11435/v1"
    kokoro_base_url: str = "http://localhost:8880/v1"
    
    database_url: str | None = None

    cors_allow_origins: str = "http://localhost:3000,http://localhost:3001"

    @field_validator(
        "livekit_url",
        "livekit_api_key",
        "livekit_api_secret",
        "database_url",
        "llama_base_url",
        "whisper_base_url",
        "kokoro_base_url",
        mode="before",
    )
    @classmethod
    def _empty_str_to_none(cls, v):
        if v is None:
            return None
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


settings = Settings()
