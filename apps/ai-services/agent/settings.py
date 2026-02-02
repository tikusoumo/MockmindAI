from __future__ import annotations

from pydantic import AnyHttpUrl
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    # Local Model Configuration - defaults for container-to-container networking
    kokoro_base_url: str = "http://kokoro:8880/v1"
    whisper_base_url: str = "http://whisper:80/v1"
    llama_base_url: str = "http://llama_cpp:11434/v1"
    llama_model: str = "qwen3-4b"  # Default model matching local-voice-ai
    

    livekit_url: str | None = None
    livekit_public_url: str = "ws://localhost:7880"
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None

    google_api_key: str | None = None



    cors_allow_origins: str = "http://localhost:3000,http://localhost:3001"

    @field_validator(
        "livekit_url",
        "livekit_api_key",
        "livekit_api_secret",
        "google_api_key",
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
