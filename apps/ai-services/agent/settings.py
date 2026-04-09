from __future__ import annotations

from pydantic import AnyHttpUrl
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "dev"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    use_local_ai: bool = False

    # Speech Analysis
    analysis_enabled: bool = True
    guide_mode: bool = False  # When True, agent adapts to candidate's emotional state

    # Local Model Configuration - defaults for container-to-container networking
    kokoro_base_url: str = "http://kokoro:8880/v1"
    whisper_base_url: str = "http://whisper:80/v1"
    llama_base_url: str = "http://llama_cpp:11434/v1"
    llama_model: str = "qwen3-4b"  # Default model matching local-voice-ai
    

    livekit_url: str | None = None
    livekit_public_url: str = "ws://localhost:7880"
    livekit_api_key: str | None = None
    livekit_api_secret: str | None = None

    # LiveKit worker process tuning
    # Defaults are conservative for memory-constrained containers.
    livekit_num_idle_processes: int = 1
    livekit_initialize_process_timeout: float = 60.0
    livekit_job_memory_warn_mb: float = 1200.0
    livekit_job_memory_limit_mb: float = 0.0

    google_api_key: str | None = None
    google_credentials_file: str | None = None

    # Qdrant Vector Store for RAG
    qdrant_url: str = "http://qdrant:6333"
    qdrant_timeout_seconds: float = 3.0
    rag_lookup_timeout_seconds: float = 2.0
    rag_prewarm_embedder: bool = True
    rag_lookup_k: int = 3
    rag_injected_chunks: int = 2
    rag_chunk_max_chars: int = 900
    rag_context_max_chars: int = 2500
    rag_query_max_chars: int = 500
    llm_chat_max_items: int = 12
    llm_timeout_connect_seconds: float = 15.0
    llm_timeout_read_seconds: float = 45.0
    llm_timeout_write_seconds: float = 20.0
    llm_timeout_pool_seconds: float = 20.0

    # --- Modular Provider Configuration ---
    llm_provider: str = "openai"
    stt_provider: str = "openai"
    tts_provider: str = "openai"

    groq_api_key: str | None = None
    deepgram_api_key: str | None = None
    eleven_api_key: str | None = None



    cors_allow_origins: str = "http://localhost:3000,http://localhost:3001"

    @field_validator(
        "livekit_url",
        "livekit_api_key",
        "livekit_api_secret",
        "google_api_key",
        "groq_api_key",
        "deepgram_api_key",
        "eleven_api_key",
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
