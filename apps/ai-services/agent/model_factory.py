"""Model factory and local TTS adapters for the voice agent."""

from __future__ import annotations

import asyncio
import io
import logging
import os
import re
import urllib.request
import uuid
import wave

from typing import Any

import httpx
import requests
from livekit.agents import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents import tts as lk_tts
from livekit.plugins import deepgram, elevenlabs, google, groq, openai

logger = logging.getLogger("voice-agent")


def _compact_text(value: str, max_chars: int) -> str:
    """Normalize whitespace and cap text length conservatively."""
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    clipped = normalized[:max_chars].rsplit(" ", 1)[0]
    return (clipped or normalized[:max_chars]) + " ..."


class _KokoroChunkedStream(lk_tts.ChunkedStream):
    def __init__(
        self,
        *,
        tts: "LocalKokoroTTS",
        input_text: str,
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._kokoro_tts = tts

    async def _run(self, output_emitter: lk_tts.AudioEmitter) -> None:
        text = _compact_text(self.input_text.strip(), 1000)
        if not text:
            return

        payload = {
            "model": self._kokoro_tts.model,
            "input": text,
            "voice": self._kokoro_tts.voice,
            "response_format": "wav",
        }

        candidate_base_urls = [self._kokoro_tts.base_url]
        if "host.docker.internal" in self._kokoro_tts.base_url:
            candidate_base_urls.append(self._kokoro_tts.base_url.replace("host.docker.internal", "kokoro"))
        elif "localhost" in self._kokoro_tts.base_url:
            candidate_base_urls.append(self._kokoro_tts.base_url.replace("localhost", "kokoro"))
            if os.path.exists("/.dockerenv"):
                candidate_base_urls.append(
                    self._kokoro_tts.base_url.replace("localhost", "host.docker.internal")
                )
        elif "kokoro" in self._kokoro_tts.base_url:
            if os.path.exists("/.dockerenv"):
                candidate_base_urls.append(
                    self._kokoro_tts.base_url.replace("kokoro", "host.docker.internal")
                )
            candidate_base_urls.append(self._kokoro_tts.base_url.replace("kokoro", "localhost"))

        candidate_base_urls = list(dict.fromkeys(candidate_base_urls))

        last_error: Exception | None = None
        attempts_per_endpoint = 2
        for endpoint in candidate_base_urls:
            for attempt in range(1, attempts_per_endpoint + 1):
                try:
                    response = await asyncio.to_thread(
                        requests.post,
                        f"{endpoint}/audio/speech",
                        json=payload,
                        timeout=(5, 45),
                    )
                    response.raise_for_status()

                    with io.BytesIO(response.content) as wav_io:
                        with wave.open(wav_io, "rb") as wav_file:
                            sample_rate = wav_file.getframerate()
                            num_channels = wav_file.getnchannels()
                            pcm_bytes = wav_file.readframes(wav_file.getnframes())

                    output_emitter.initialize(
                        request_id=f"kokoro-{uuid.uuid4().hex[:8]}",
                        sample_rate=sample_rate,
                        num_channels=num_channels,
                        mime_type="audio/pcm",
                    )
                    output_emitter.push(pcm_bytes)
                    return
                except (requests.RequestException, wave.Error, ValueError) as exc:
                    last_error = exc
                    logger.warning(
                        "Kokoro TTS request failed (endpoint=%s, attempt=%s/%s): %s",
                        endpoint,
                        attempt,
                        attempts_per_endpoint,
                        exc,
                    )
                    if attempt < attempts_per_endpoint:
                        await asyncio.sleep(0.25 * attempt)

        logger.error(
            "Kokoro TTS failed for current utterance after retrying endpoints %s: %s",
            candidate_base_urls,
            last_error,
        )
        return


class LocalKokoroTTS(lk_tts.TTS):
    def __init__(
        self,
        *,
        base_url: str,
        model: str = "kokoro",
        voice: str = "af_sky",
        sample_rate: int = 24000,
        num_channels: int = 1,
    ) -> None:
        super().__init__(
            capabilities=lk_tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=num_channels,
        )
        self.base_url = base_url.rstrip("/")
        self._model = model
        self.voice = voice

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "kokoro-local"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> lk_tts.ChunkedStream:
        return _KokoroChunkedStream(tts=self, input_text=text, conn_options=conn_options)

    async def aclose(self) -> None:
        return


def create_model_components(settings: Any):
    """Create LLM, STT, and TTS instances with local/online provider fallback."""

    def _normalize_local_url(url: str) -> str:
        if url and os.path.exists("/.dockerenv") and "localhost" in url:
            return url.replace("localhost", "host.docker.internal")
        return url

    def _has_google_credentials() -> bool:
        if settings.google_credentials_file:
            return True

        try:
            import importlib

            google_auth = importlib.import_module("google.auth")
            google_auth.default()
            return True
        except Exception:
            return False

    def _openai_stt_fallback():
        whisper_url = _normalize_local_url(settings.whisper_base_url)
        if settings.use_local_ai or (
            whisper_url
            and (
                "localhost" in whisper_url
                or "whisper" in whisper_url
                or "host.docker.internal" in whisper_url
            )
        ):
            return openai.STT(
                base_url=whisper_url,
                model="Systran/faster-whisper-small",
                api_key="no-key-needed",
            )
        return openai.STT(model="whisper-1")

    def _openai_llm_fallback():
        llm_timeout = httpx.Timeout(
            connect=settings.llm_timeout_connect_seconds,
            read=settings.llm_timeout_read_seconds,
            write=settings.llm_timeout_write_seconds,
            pool=settings.llm_timeout_pool_seconds,
        )
        llama_url = _normalize_local_url(settings.llama_base_url)
        if settings.use_local_ai or (
            llama_url
            and (
                "localhost" in llama_url
                or "llama" in llama_url
                or "host.docker.internal" in llama_url
            )
        ):
            return openai.LLM(
                base_url=llama_url,
                model=settings.llama_model,
                api_key="no-key-needed",
                timeout=llm_timeout,
            )
        return openai.LLM(model="gpt-4o", timeout=llm_timeout)

    def _openai_tts_fallback():
        kokoro_url = _normalize_local_url(settings.kokoro_base_url)
        if settings.use_local_ai or (
            kokoro_url
            and (
                "localhost" in kokoro_url
                or "kokoro" in kokoro_url
                or "host.docker.internal" in kokoro_url
            )
        ):
            return LocalKokoroTTS(base_url=kokoro_url, model="kokoro", voice="af_sky")
        return openai.TTS(model="tts-1", voice="alloy")

    def _google_api_key_looks_usable(api_key: str | None) -> bool:
        if not api_key:
            return False

        try:
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                return 200 <= response.status < 300
        except Exception:
            return False

    stt_provider = settings.stt_provider
    llm_provider = settings.llm_provider
    tts_provider = settings.tts_provider

    if settings.use_local_ai:
        stt_provider = "openai"
        llm_provider = "openai"
        tts_provider = "openai"
        logger.info(
            "USE_LOCAL_AI is enabled. Routing STT/LLM/TTS to OpenAI-compatible local endpoints."
        )

    try:
        if stt_provider == "deepgram":
            stt = deepgram.STT(api_key=settings.deepgram_api_key)
        elif stt_provider == "google":
            if not _has_google_credentials():
                raise ValueError("Google STT requires credentials_file or ADC")
            stt = (
                google.STT(credentials_file=settings.google_credentials_file)
                if settings.google_credentials_file
                else google.STT()
            )
        elif stt_provider == "groq":
            stt = groq.STT(api_key=settings.groq_api_key)
        else:
            stt = _openai_stt_fallback()
    except Exception as e:
        logger.warning(
            "Failed to initialize STT provider '%s' (%s). Falling back to OpenAI-compatible STT.",
            stt_provider,
            e,
        )
        stt = _openai_stt_fallback()

    try:
        if llm_provider == "google":
            if not _google_api_key_looks_usable(settings.google_api_key):
                raise ValueError("Google LLM API key is missing, invalid, or expired")
            llm = google.LLM(model="gemini-2.0-flash-exp", api_key=settings.google_api_key)
        elif llm_provider == "groq":
            llm = groq.LLM(model="llama3-8b-8192", api_key=settings.groq_api_key)
        else:
            llm = _openai_llm_fallback()
    except Exception as e:
        logger.warning(
            "Failed to initialize LLM provider '%s' (%s). Falling back to OpenAI-compatible LLM.",
            llm_provider,
            e,
        )
        llm = _openai_llm_fallback()

    try:
        if tts_provider == "elevenlabs":
            tts = elevenlabs.TTS(api_key=settings.eleven_api_key)
        elif tts_provider == "deepgram":
            tts = deepgram.TTS(api_key=settings.deepgram_api_key)
        elif tts_provider == "google":
            if not _has_google_credentials():
                raise ValueError("Google TTS requires credentials_file or ADC")
            tts = (
                google.TTS(credentials_file=settings.google_credentials_file)
                if settings.google_credentials_file
                else google.TTS()
            )
        else:
            tts = _openai_tts_fallback()
    except Exception as e:
        logger.warning(
            "Failed to initialize TTS provider '%s' (%s). Falling back to OpenAI-compatible TTS.",
            tts_provider,
            e,
        )
        tts = _openai_tts_fallback()

    return stt, llm, tts
