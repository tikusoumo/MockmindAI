"""
Voice Agent for LiveKit - Interview Coach Assistant

This module implements a voice AI agent using LiveKit's AgentSession API.
It connects to local models (Kokoro TTS, Whisper STT, LLaMA LLM) running
in the local-voice-ai docker-compose network.

Features:
- Mode-aware behavior (Learning vs Strict)
- RAG integration for document-based questions
- Session data collection for post-interview reports
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterable
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import io
import json
import logging
import os
import re
import threading
import time
import urllib.request
import uuid
import wave
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
import httpx
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    APIConnectOptions,
    DEFAULT_API_CONNECT_OPTIONS,
    JobContext,
    JobProcess,
    cli,
    function_tool,
    RunContext,
)
from livekit.agents import llm as lk_llm
from livekit.agents import tts as lk_tts
from livekit.plugins import silero, openai, deepgram, google, groq, elevenlabs
import requests

from .settings import settings
from .session_collector import SessionCollector

logger = logging.getLogger("voice-agent")

load_dotenv()


def _install_livekit_room_destructor_guard() -> None:
    """Guard older LiveKit Room.__del__ against partially initialized instances."""
    try:
        from livekit.rtc.room import Room
    except Exception:
        return

    original_del = getattr(Room, "__del__", None)
    if not callable(original_del):
        return
    if getattr(Room, "_safe_destructor_patched", False):
        return

    def _safe_del(self):
        # Some older rtc builds can call __del__ on a Room that failed before
        # _ffi_handle was created, which raises AttributeError during GC.
        if getattr(self, "_ffi_handle", None) is None:
            return
        try:
            original_del(self)
        except AttributeError:
            return

    Room.__del__ = _safe_del
    setattr(Room, "_safe_destructor_patched", True)


_install_livekit_room_destructor_guard()

_RAG_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_RAG_CACHE_LOCK = threading.Lock()
_RAG_RESULT_CACHE: dict[str, tuple[float, list[str]]] = {}
_RAG_CACHE_TTL_SECONDS = 45.0
_RAG_CACHE_MAX_ENTRIES = 256


def _normalize_rag_query(query: str) -> str:
    return _compact_text(query.lower(), settings.rag_query_max_chars)


def _rag_cache_key(target_id: str, query: str, k: int) -> str:
    return f"{target_id}|{k}|{_normalize_rag_query(query)}"


def _get_cached_rag_results(cache_key: str) -> list[str] | None:
    now = time.time()
    with _RAG_CACHE_LOCK:
        cached = _RAG_RESULT_CACHE.get(cache_key)
        if not cached:
            return None

        saved_at, chunks = cached
        if now - saved_at > _RAG_CACHE_TTL_SECONDS:
            _RAG_RESULT_CACHE.pop(cache_key, None)
            return None
        return list(chunks)


def _set_cached_rag_results(cache_key: str, chunks: list[str]) -> None:
    now = time.time()
    with _RAG_CACHE_LOCK:
        if len(_RAG_RESULT_CACHE) >= _RAG_CACHE_MAX_ENTRIES:
            oldest_key = min(_RAG_RESULT_CACHE, key=lambda key: _RAG_RESULT_CACHE[key][0])
            _RAG_RESULT_CACHE.pop(oldest_key, None)
        _RAG_RESULT_CACHE[cache_key] = (now, list(chunks))


def _lookup_rag_chunks_with_cache(store: Any, target_id: str, query: str, k: int) -> list[str]:
    cache_key = _rag_cache_key(target_id, query, k)
    cached = _get_cached_rag_results(cache_key)
    if cached is not None:
        logger.debug("RAG cache hit for target '%s'", target_id)
        return cached

    future = _RAG_EXECUTOR.submit(
        store.query_for_interview_sync,
        target_id,
        query,
        k,
    )
    try:
        chunks = future.result(timeout=settings.rag_lookup_timeout_seconds)
    except FutureTimeoutError:
        logger.warning(
            "Qdrant RAG lookup timed out for target '%s' after %.1fs",
            target_id,
            settings.rag_lookup_timeout_seconds,
        )
        return []
    except Exception as rag_err:
        logger.warning("Qdrant RAG lookup failed for target '%s': %s", target_id, rag_err)
        return []

    _set_cached_rag_results(cache_key, chunks)
    logger.info("Qdrant RAG: Found %d hits for target '%s'", len(chunks), target_id)
    return chunks


def _collect_text_content(content: Any) -> str:
    """Extract plain text from SDK message content variants."""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts)

    return str(content or "")


def _compact_text(value: str, max_chars: int) -> str:
    """Normalize whitespace and cap text length conservatively."""
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    clipped = normalized[:max_chars].rsplit(" ", 1)[0]
    return (clipped or normalized[:max_chars]) + " ..."


_TOOL_CALL_BLOCK_RE = re.compile(
    r"<\s*tool_call\s*>.*?<\s*/\s*tool_call\s*>",
    flags=re.IGNORECASE | re.DOTALL,
)
_TOOL_CALL_TAG_RE = re.compile(r"<\s*/?\s*tool_call\s*>", flags=re.IGNORECASE)
_INTERNAL_TOOL_NAME_RE = re.compile(
    r"\b(read_candidates_code|update_candidate_code|request_document_context|provide_feedback|get_interview_tip)\b",
    flags=re.IGNORECASE,
)

_EDITOR_SURFACE_HINTS = (
    "editor",
    "ide",
    "code tab",
    "coding tab",
)

_EDITOR_WRITE_ACTION_HINTS = (
    "type",
    "write",
    "put",
    "paste",
    "insert",
    "edit",
    "update",
    "add",
)


def _sanitize_assistant_text_for_speech(text: str) -> str:
    cleaned = _TOOL_CALL_BLOCK_RE.sub(" ", text or "")
    cleaned = _TOOL_CALL_TAG_RE.sub(" ", cleaned)
    cleaned = _INTERNAL_TOOL_NAME_RE.sub(" ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _looks_like_editor_write_request(text: str) -> bool:
    lowered = (text or "").lower()
    if not lowered:
        return False

    has_editor_hint = any(token in lowered for token in _EDITOR_SURFACE_HINTS)
    has_write_hint = any(token in lowered for token in _EDITOR_WRITE_ACTION_HINTS)
    return has_editor_hint and has_write_hint


async def _filter_internal_tool_markup(text: AsyncIterable[str]) -> AsyncIterable[str]:
    """Strip leaked tool-call tags/names from streamed assistant text before TTS."""
    buffer = ""
    # Keep a small tail so patterns split across chunks can be matched safely.
    safety_tail = 256

    async for chunk in text:
        buffer += chunk
        if len(buffer) <= safety_tail * 2:
            continue

        emit_text = buffer[:-safety_tail]
        sanitized = _sanitize_assistant_text_for_speech(emit_text)
        if sanitized:
            yield sanitized
        buffer = buffer[-safety_tail:]

    tail = _sanitize_assistant_text_for_speech(buffer)
    if tail:
        yield tail


def _cap_context_chunks(
    chunks: list[str],
    *,
    max_chunks: int,
    chunk_max_chars: int,
    total_max_chars: int,
) -> list[str]:
    """Bound context size before injecting into prompts."""
    limited: list[str] = []
    current_size = 0

    for raw in chunks:
        if len(limited) >= max_chunks:
            break

        compact = _compact_text(raw, chunk_max_chars)
        if not compact:
            continue

        projected = current_size + len(compact)
        if limited:
            projected += len("\n---\n")

        if projected > total_max_chars:
            break

        limited.append(compact)
        current_size = projected

    return limited


_DOC_CONTEXT_BLOCK_RE = re.compile(
    r"\[DOCUMENTS / CONTEXT PROVIDED\].*?\[END CONTEXT\]\s*",
    flags=re.DOTALL,
)


def _clone_chat_item(item: Any) -> Any:
    """Create a deep clone when supported to avoid mutating persistent chat history."""
    if hasattr(item, "model_copy"):
        try:
            return item.model_copy(deep=True)
        except Exception:
            pass

    if hasattr(item, "copy"):
        try:
            return item.copy(deep=True)
        except Exception:
            pass

    return item


def _strip_injected_doc_context(value: str) -> str:
    """Remove previously injected doc context so it does not snowball across turns."""
    if "[DOCUMENTS / CONTEXT PROVIDED]" not in value or "[END CONTEXT]" not in value:
        return value

    cleaned = _DOC_CONTEXT_BLOCK_RE.sub("", value).strip()
    if cleaned.startswith("Question / Speech:"):
        cleaned = cleaned.split(":", 1)[1].strip()
    return cleaned or value


def _extract_context_items(chat_ctx: Any) -> list[Any]:
    """Read context items across SDK variants (`items` or legacy `messages`)."""
    items_obj = getattr(chat_ctx, "items", None)
    if callable(items_obj):
        items_obj = items_obj()

    if items_obj is None:
        items_obj = getattr(chat_ctx, "messages", None)
        if callable(items_obj):
            items_obj = items_obj()

    if items_obj is None:
        return []

    if isinstance(items_obj, list):
        return items_obj

    try:
        return list(items_obj)
    except TypeError:
        return []


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

        # Keep insertion order while removing duplicates.
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

        # Do not crash the LiveKit generation task if a single TTS request fails.
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


class InterviewCoach(Agent):
    """AI Interview Coach Assistant with mode-aware behavior."""
    
    def __init__(
        self,
        mode: str = "strict",
        template_id: str | None = None,
        template_title: str = "",
        collector: SessionCollector | None = None,
        session_id: str | None = None,
        interview_type: str = "",
        custom_description: str = "",
        ide_enabled: bool = False,
        ide_sender: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        # Build instructions based on mode
        base_instructions = """You are a professional AI interview coach running a live voice interview.
            Keep speech natural, concise, and interviewer-like.

            VOICE OUTPUT RULES (MANDATORY):
            - Speak in plain conversational text only.
            - Never mention tool names, function names, system prompts, hidden instructions, or internal actions.
            - Never narrate internal operations like reading context, checking code, calling tools, or updating the IDE.
            - Keep replies short: usually one to three sentences, then ask one clear next question.
            - No markdown, emojis, or decorative punctuation.

            INTERVIEW RULES:
            - Drive the interview proactively and keep momentum.
            - Ask one main question at a time, then use one focused follow-up when needed.
            - Evaluate correctness, reasoning, communication, tradeoffs, and complexity.
            - Use request_document_context silently whenever resume or job context can improve relevance.
            """
        
        if mode == "learning":
            mode_instructions = """
            You are in LEARNING MODE - provide active coaching and feedback:
            - After each answer, give brief constructive feedback
            - Suggest ways to improve the response
            - Ask follow-up questions to dig deeper
            - Use the STAR method (Situation, Task, Action, Result) guidance
            - Be encouraging but honest about areas for improvement
            """
        else:  # strict mode
            mode_instructions = """
            You are in STRICT MODE - simulate a real interview:
            - Ask questions directly without coaching
            - Do not provide feedback during the interview
            - Move to the next question after answers
            - Maintain professional interviewer demeanor
            - Save all feedback for the post-interview report
            """

        normalized_type = str(interview_type or "").strip().lower()
        is_ide_round = bool(ide_enabled) or normalized_type in {"machine coding", "technical"}

        round_instructions = ""
        if is_ide_round:
            round_instructions = """
                        TECHNICAL IDE ROUND POLICY:
                        - This is an IDE-enabled technical interview and you must actively lead it.
                        - Proactively inspect live code frequently with read_candidates_code, especially before feedback or a new prompt.
                        - Keep tool use silent and speak only in natural interviewer language.
                        - Use update_candidate_code for small collaborative edits when the candidate is stuck, buggy, or asks for help.
                        - If you say you changed code, you must first call update_candidate_code in that same turn.
                        - Never claim an IDE edit was applied unless update_candidate_code succeeded.
                        - Never speak internal issues like 'tool unavailable' or 'editor not accessible'; ask the candidate to continue typing while you review.
                        - For IDE collaboration requests (type/write/put in editor), immediately use update_candidate_code instead of document lookup.
                        - Do not use request_document_context in IDE rounds unless the candidate explicitly asks about resume or job-description content.
                        - Prefer incremental patches over full rewrites and explain the intent of each change briefly.
                        - Always ask for a brute-force idea first, then an optimized approach.
                        - Always check edge cases, test coverage, and time/space complexity.
                        - If code is empty, ask for a clear function signature and a short implementation plan first.

                        DSA COVERAGE REQUIREMENTS:
                        - Cover these topics naturally across the round as time permits:
                            arrays and strings, hashing, two pointers, sliding window,
                            stacks and queues, trees and binary trees, BST,
                            graphs, binary search, greedy, and dynamic programming.
                        - Move from medium to harder variants when the candidate performs well.
                        - After each meaningful code step, ask exactly one concise next-step question.
            """

        custom_prompt_instructions = ""
        safe_custom_description = _compact_text(custom_description, 1600)
        if safe_custom_description:
            custom_prompt_instructions = (
                "\nCUSTOM INTERVIEW BRIEF (SESSION-SPECIFIC, HIGHEST PRIORITY):\n"
                f"{safe_custom_description}\n"
                "Treat the brief above as interview context and instruction for this session."
            )
        
        super().__init__(
            instructions=base_instructions + mode_instructions + round_instructions + custom_prompt_instructions,
        )
        
        self.mode = mode
        self.template_id = template_id
        self.session_id = session_id
        self.template_title = template_title
        self.interview_type = interview_type
        self.custom_description = safe_custom_description
        self.ide_enabled = is_ide_round
        self._ide_sender = ide_sender
        self.collector = collector
        self.current_question_idx = 0
        self.questions: list[str] = []
        self.current_ide_content: str = ""
        self.current_ide_language: str = "javascript"
        self._doc_query_last_seen: dict[str, float] = {}

    @function_tool()
    async def read_candidates_code(
        self,
        context: RunContext,
    ) -> str:
        """Read the live code from the candidate's IDE. Use this frequently in technical rounds to evaluate progress, correctness, and next steps."""
        logger.info(
            "read_candidates_code invoked (ide_enabled=%s, chars=%d, language=%s)",
            self.ide_enabled,
            len(self.current_ide_content or ""),
            self.current_ide_language,
        )
        if not self.current_ide_content.strip():
            return "The IDE is currently empty or the candidate hasn't typed anything yet."
        return f"Here is the candidate's current code:\n\n{self.current_ide_content}"

    @function_tool()
    async def update_candidate_code(
        self,
        context: RunContext,
        code: str,
        explanation: str = "",
        intent: str = "replace",
        typing_ms: int = 1400,
    ) -> str:
        """Apply collaborative code edits in the candidate's live IDE.

        Args:
            code: Code content to apply. For intent=replace this becomes full editor content; for intent=append this is appended.
            explanation: Short note that explains why this edit is being made.
            intent: Either 'replace' (default) or 'append'.
            typing_ms: Optional typing animation duration in milliseconds (0 to disable).
        """
        logger.info(
            "update_candidate_code invoked (ide_enabled=%s, intent=%s, chars=%d, language=%s)",
            self.ide_enabled,
            intent,
            len(code or ""),
            self.current_ide_language,
        )
        if not self.ide_enabled:
            return "IDE collaboration is disabled for this interview round."

        if not self._ide_sender:
            return "IDE collaboration channel is not available right now."

        sanitized_code = code or ""
        if not sanitized_code.strip():
            return "No code content was provided for IDE update."

        if len(sanitized_code) > 20000:
            sanitized_code = sanitized_code[:20000]

        normalized_intent = "append" if str(intent or "").strip().lower() == "append" else "replace"
        clamped_typing_ms = max(0, min(int(typing_ms or 0), 5000))
        note = _compact_text(explanation or "", 220) if explanation else ""

        payload = {
            "type": "ide_apply",
            "intent": normalized_intent,
            "code": sanitized_code,
            "language": self.current_ide_language or "javascript",
            "explanation": note,
            "typing_ms": clamped_typing_ms,
            "timestamp": int(time.time() * 1000),
        }

        try:
            await self._ide_sender(payload)
            logger.info(
                "Published IDE apply event (intent=%s, chars=%d, lang=%s)",
                normalized_intent,
                len(sanitized_code),
                payload["language"],
            )
        except Exception as e:
            logger.warning("Failed to publish collaborative IDE edit: %s", e)
            return "Unable to apply IDE update right now due to a channel issue."

        if normalized_intent == "append":
            self.current_ide_content = f"{self.current_ide_content}{sanitized_code}"
        else:
            self.current_ide_content = sanitized_code

        return "IDE update applied."

    @function_tool()
    async def get_interview_tip(
        self,
        context: RunContext,
        topic: str,
    ) -> str:
        """Get an interview tip for a specific topic.
        
        Args:
            topic: The interview topic to get a tip about (e.g., behavioral, technical, salary negotiation).
        """
        # Only provide tips in learning mode
        if self.mode == "strict":
            return "Tips are not available during the interview. Focus on your answers."
        
        tips = {
            "behavioral": "Use the STAR method: Situation, Task, Action, Result. This helps structure your answers clearly.",
            "technical": "Think out loud! Interviewers want to see your problem-solving process, not just the final answer.",
            "salary": "Research market rates beforehand. When asked, give a range based on your research and qualifications.",
            "general": "Prepare 3-5 stories from your experience that demonstrate key skills. You can adapt them to various questions.",
        }
        
        if self.collector:
            self.collector.add_interviewer_message(f"[Tip: {topic}]")
        
        return tips.get(topic.lower(), tips["general"])

    @function_tool()
    async def provide_feedback(
        self,
        context: RunContext,
        answer_summary: str,
        score: int,
        suggestion: str,
    ) -> str:
        """Provide feedback on the candidate's answer (Learning mode only).
        
        Args:
            answer_summary: Brief summary of what the candidate said
            score: Score from 1-10 for the answer quality
            suggestion: One specific improvement suggestion
        """
        if self.mode == "strict":
            return "Feedback is provided after the interview."
        
        if self.collector:
            self.collector.add_score(score / 10.0)
        
        return f"Based on your answer: {suggestion}. You scored {score}/10 on this question."

    @function_tool()
    async def request_document_context(
        self,
        context: RunContext,
        query: str,
    ) -> str:
        """Get contextual information from the candidate's uploaded resume or provided job documentation.
        
        Args:
            query: The specific topic or detail you need to find in their document (e.g., 'Python experience', 'education').
        """
        from .rag.vector_store import get_vector_store

        query_key = _normalize_rag_query(query)
        now = time.monotonic()
        last_seen = self._doc_query_last_seen.get(query_key)
        if last_seen is not None and (now - last_seen) < 10.0:
            logger.info("Skipping duplicate request_document_context call for query: %s", query_key)
            return "No additional document context for the same query right now. Continue the interview naturally."

        self._doc_query_last_seen[query_key] = now
        if len(self._doc_query_last_seen) > 64:
            oldest_key = min(self._doc_query_last_seen, key=self._doc_query_last_seen.get)
            self._doc_query_last_seen.pop(oldest_key, None)

        store = get_vector_store()
        try:
            # Query both the template (if applicable) and this specific session's uploaded docs.
            results: list[str] = []
            targets: list[str] = []
            if self.template_id:
                targets.append(self.template_id)
            if self.session_id:
                targets.append(self.session_id)
                targets.append(f"session_{self.session_id}")

            for target_id in list(dict.fromkeys(targets)):
                hits = _lookup_rag_chunks_with_cache(
                    store,
                    target_id,
                    query,
                    settings.rag_lookup_k,
                )
                if hits:
                    results.extend(hits)

            if not results:
                return "I couldn't find any relevant information about that in the uploaded documents."

            limited_results = _cap_context_chunks(
                results,
                max_chunks=settings.rag_injected_chunks,
                chunk_max_chars=settings.rag_chunk_max_chars,
                total_max_chars=settings.rag_context_max_chars,
            )
            if not limited_results:
                return "I found relevant documents but they were too large to include directly. Please ask a more specific question."

            return "\n\n".join(limited_results)
        except Exception as e:
            logger.error(f"Failed to query RAG: {e}")
            return "Failed to retrieve document context at this moment."

server = AgentServer(
    # Keep the process pool small in containerized runs.
    num_idle_processes=settings.livekit_num_idle_processes,
    initialize_process_timeout=settings.livekit_initialize_process_timeout,
    job_memory_warn_mb=settings.livekit_job_memory_warn_mb,
    job_memory_limit_mb=settings.livekit_job_memory_limit_mb,
    ws_url=settings.livekit_url,
    api_key=settings.livekit_api_key,
    api_secret=settings.livekit_api_secret,
)


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()

    def _prewarm_rag_embedder() -> None:
        try:
            from .rag.vector_store import get_vector_store

            _ = get_vector_store().embedder
            logger.info("Prewarmed RAG embedder")
        except Exception as e:
            logger.warning("Failed to prewarm RAG embedder: %s", e)

    if settings.rag_prewarm_embedder:
        threading.Thread(target=_prewarm_rag_embedder, name="rag-prewarm", daemon=True).start()

    def _prewarm_report_analyzers() -> None:
        if not settings.analysis_enabled:
            return
        try:
            from .analysis import ReportGenerator

            _ = ReportGenerator()
            logger.info("Prewarmed report analyzers")
        except Exception as e:
            logger.warning("Failed to prewarm report analyzers: %s", e)

    threading.Thread(
        target=_prewarm_report_analyzers,
        name="report-prewarm",
        daemon=True,
    ).start()


server.setup_fnc = prewarm


def create_model_components(settings):
    """Factory to create LLM, STT, and TTS instances with support for mixing local and online providers."""
    def _normalize_local_url(url: str) -> str:
        # Inside Docker, localhost points to the current container; use host gateway instead.
        if url and os.path.exists("/.dockerenv") and "localhost" in url:
            return url.replace("localhost", "host.docker.internal")
        return url

    def _has_google_credentials() -> bool:
        if settings.google_credentials_file:
            return True

        # Detect ADC availability for environments where GOOGLE_APPLICATION_CREDENTIALS is not explicitly set.
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

        # Fast preflight to avoid runtime job crashes on expired/invalid Gemini API keys.
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

    # --- STT ---
    try:
        if stt_provider == "deepgram":
            stt = deepgram.STT(api_key=settings.deepgram_api_key)
        elif stt_provider == "google":
            # Google STT needs service account credentials or ADC.
            if not _has_google_credentials():
                raise ValueError("Google STT requires credentials_file or ADC")
            stt = google.STT(credentials_file=settings.google_credentials_file) if settings.google_credentials_file else google.STT()
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

    # --- LLM ---
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

    # --- TTS ---
    try:
        if tts_provider == "elevenlabs":
            tts = elevenlabs.TTS(api_key=settings.eleven_api_key)
        elif tts_provider == "deepgram":
            tts = deepgram.TTS(api_key=settings.deepgram_api_key)
        elif tts_provider == "google":
            # Google TTS needs service account credentials or ADC.
            if not _has_google_credentials():
                raise ValueError("Google TTS requires credentials_file or ADC")
            tts = google.TTS(credentials_file=settings.google_credentials_file) if settings.google_credentials_file else google.TTS()
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


def parse_room_metadata(metadata_str: str | None) -> dict[str, Any]:
    """Parse room metadata JSON string."""
    if not metadata_str:
        return {}
    try:
        return json.loads(metadata_str)
    except json.JSONDecodeError:
        return {}


@server.rtc_session()
async def voice_agent(ctx: JobContext):
    """Main entrypoint for the voice agent RTC session."""
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }
    
    logger.info(f"Starting voice agent for room: {ctx.room.name}")
    
    # Parse room metadata for mode and template info
    # Note: In production, this would come from the room's actual metadata
    # For now we'll use defaults - the frontend passes this via the token request
    metadata = {}
    
    # Get from participant metadata if available
    await ctx.connect()
    
    for participant in ctx.room.remote_participants.values():
        if participant.metadata:
            metadata = parse_room_metadata(participant.metadata)
            break

    if not metadata:
        for _ in range(10):
            await asyncio.sleep(0.3)
            for participant in ctx.room.remote_participants.values():
                if participant.metadata:
                    metadata = parse_room_metadata(participant.metadata)
                    break
            if metadata:
                break
    
    mode = metadata.get("mode", "strict")
    template_id = metadata.get("templateId")
    session_id = metadata.get("sessionId") or template_id
    if not session_id and ctx.room.name.startswith("interview-"):
        session_id = ctx.room.name.replace("interview-", "")
    template_title = metadata.get("templateTitle", "Interview")
    participant_name = metadata.get("participantName", "Candidate")
    interview_type = metadata.get("interviewType", "")
    custom_description = metadata.get("customDescription", "")
    ide_enabled = bool(metadata.get("ideEnabled", False))
    
    logger.info(
        "Interview mode: %s, session/template: %s, template title: %s, type: %s, ide_enabled: %s",
        mode,
        session_id,
        template_title,
        interview_type or "(unspecified)",
        ide_enabled,
    )

    # Initialize session collector
    collector = SessionCollector(
        room_name=ctx.room.name,
        template_id=session_id,  # Bind collector tightly to session output
        template_title=template_title,
        mode=mode,
        participant_name=participant_name,
    )

    logger.info(f"Using Providers -> LLM: {settings.llm_provider}, STT: {settings.stt_provider}, TTS: {settings.tts_provider}")

    stt, llm, tts = create_model_components(settings)
    logger.info(
        "Resolved Runtime Providers -> LLM: %s.%s, STT: %s.%s, TTS: %s.%s",
        type(llm).__module__,
        type(llm).__name__,
        type(stt).__module__,
        type(stt).__name__,
        type(tts).__module__,
        type(tts).__name__,
    )

    # --- PROACTIVE RAG INTERCEPTOR ---
    # Intercept LLM chat requests to inject uploaded documents directly into context.
    # This bypasses the need for the LLM backend (e.g. Local LLM / Gemini) to correctly invoke the function calling tool API.
    
    # Define a wrapper for the chat method that handles the async nature of LLMStream
    original_chat = llm.chat
    last_proactive_rag_query = ""
    last_proactive_rag_at = 0.0
    
    def intercepted_chat(_bound_llm, *args, **kwargs):
        nonlocal last_proactive_rag_query, last_proactive_rag_at
        chat_ctx = kwargs.get("chat_ctx")
        args_list = list(args)
        chat_ctx_in_args = False

        if chat_ctx is None and args_list:
            maybe_ctx = args_list[0]
            if hasattr(maybe_ctx, "items") or hasattr(maybe_ctx, "messages"):
                chat_ctx = maybe_ctx
                chat_ctx_in_args = True

        if chat_ctx:
            try:
                # Keep only relevant recent message items and skip bulky tool-call traces.
                working_ctx = chat_ctx.copy(
                    exclude_empty_message=True,
                    exclude_function_call=True,
                )
                working_ctx.truncate(max_items=settings.llm_chat_max_items)

                raw_items = _extract_context_items(working_ctx)
                if not raw_items:
                    return original_chat(*args, **kwargs)

                # Deep-clone message items. ChatContext.copy() is shallow and shares item objects.
                cloned_items = [_clone_chat_item(item) for item in raw_items]
                sanitized_context_items = 0

                for item in cloned_items:
                    if getattr(item, "type", "message") != "message":
                        continue
                    if getattr(item, "role", None) != "user":
                        continue

                    original_content = _collect_text_content(getattr(item, "content", ""))
                    cleaned_content = _strip_injected_doc_context(original_content)
                    if cleaned_content != original_content:
                        item.content = cleaned_content
                        sanitized_context_items += 1

                # Rebuild context from cloned items so downstream edits never touch persistent state.
                working_ctx = lk_llm.ChatContext(cloned_items)

                if chat_ctx_in_args:
                    args_list[0] = working_ctx
                    args = tuple(args_list)
                else:
                    kwargs["chat_ctx"] = working_ctx

                messages = [
                    item
                    for item in cloned_items
                    if getattr(item, "type", "message") == "message"
                ]

                # Find the actual user message (not just the last one, which might be a tool response)
                user_msg = None
                for msg in reversed(messages):
                    if getattr(msg, "role", None) == "user" and getattr(msg, "content", None):
                        user_msg = msg
                        break
                
                if user_msg:
                    query = _collect_text_content(user_msg.content)
                    query = _compact_text(query, settings.rag_query_max_chars)
                    if not query:
                        return original_chat(*args, **kwargs)

                    if ide_enabled:
                        logger.debug("Skipping proactive RAG for IDE-enabled round.")
                        return original_chat(*args, **kwargs)

                    if _looks_like_editor_write_request(query):
                        logger.debug("Skipping proactive RAG for editor-write intent query.")
                        return original_chat(*args, **kwargs)

                    now_monotonic = time.monotonic()
                    query_key = query.lower()
                    if query_key == last_proactive_rag_query and (now_monotonic - last_proactive_rag_at) < 2.5:
                        logger.debug("Skipping duplicate proactive RAG lookup for repeated query.")
                        return original_chat(*args, **kwargs)

                    last_proactive_rag_query = query_key
                    last_proactive_rag_at = now_monotonic
                    
                    # We need to reach into the vector store
                    from .rag.vector_store import get_vector_store
                    
                    store = get_vector_store()

                    results: list[str] = []
                    targets: list[str] = []
                    if template_id:
                        targets.append(template_id)
                    if session_id and session_id != template_id:
                        targets.append(session_id)
                    if session_id:
                        targets.append(f"session_{session_id}")
                    targets = list(dict.fromkeys(targets))

                    logger.info("Proactive RAG intercept triggered. Query: %s", query)
                    for target_id in targets:
                        chunks = _lookup_rag_chunks_with_cache(
                            store,
                            target_id,
                            query,
                            settings.rag_lookup_k,
                        )
                        if chunks:
                            results.extend(chunks)
                    
                    # Deduplicate
                    unique_results = []
                    for r in results:
                        if r not in unique_results:
                            unique_results.append(r)
                            
                    if unique_results:
                        limited_results = _cap_context_chunks(
                            unique_results,
                            max_chunks=settings.rag_injected_chunks,
                            chunk_max_chars=settings.rag_chunk_max_chars,
                            total_max_chars=settings.rag_context_max_chars,
                        )
                        if limited_results:
                            context_str = "\n---\n".join(limited_results)
                            augmented_prompt = (
                                f"[DOCUMENTS / CONTEXT PROVIDED]\n{context_str}\n[END CONTEXT]\n\n"
                                f"Question / Speech: {query}"
                            )
                            user_msg.content = augmented_prompt
                            logger.info("Injected %d proactive RAG chunks into prompt.", len(limited_results))
                        else:
                            logger.info("Proactive RAG skipped injection due to prompt budget limits.")
                    else:
                        logger.info(
                            "Proactive RAG found zero chunks for query '%s' (target IDs: %s, %s)",
                            query,
                            template_id,
                            session_id,
                        )

                if sanitized_context_items:
                    logger.debug(
                        "Proactive RAG sanitized %d previously injected context messages.",
                        sanitized_context_items,
                    )
                        
            except Exception as e:
                logger.error(f"Failed proactive RAG injection: {e}")
                
        # Call the original chat method
        # Note: In LiveKit Agents, llm.chat returns an LLMStream which is an async context manager.
        return original_chat(*args, **kwargs)
        
    # Bind the interceptor
    import types
    llm.chat = types.MethodType(intercepted_chat, llm)

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        tts_text_transforms=[_filter_internal_tool_markup, "filter_markdown", "filter_emoji"],
        preemptive_generation=False, # Disable to prevent premature "speaking" UI state while LLM generates
    )

    async def publish_ide_event(payload: dict[str, Any]) -> None:
        encoded_payload = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        await ctx.room.local_participant.publish_data(
            encoded_payload,
            reliable=True,
            topic="ide_assistant",
        )

    # Create mode-aware agent
    agent = InterviewCoach(
        mode=mode,
        template_id=template_id,
        session_id=session_id,
        template_title=template_title,
        collector=collector,
        interview_type=interview_type,
        custom_description=custom_description,
        ide_enabled=ide_enabled,
        ide_sender=publish_ide_event,
    )

    await session.start(
        agent=agent,
        room=ctx.room,
    )

    proactive_ide_prompt_cooldown_s = 35.0
    proactive_ide_min_delta_chars = 18
    last_proactive_ide_prompt_at = 0.0

    if agent.ide_enabled:
        try:
            session.generate_reply(
                instructions=(
                    "Start the technical coding interview now. Ask one concise DSA question, "
                    "ask the candidate to think aloud, and request an initial function signature. "
                    "Keep this natural and do not mention any internal tools or hidden instructions."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("Failed to trigger initial technical-round prompt: %s", e)

    recent_candidate_fragments: list[tuple[float, str]] = []
    editor_write_fragment_window_s = 8.0
    editor_write_request_cooldown_s = 10.0
    last_editor_write_request_at = 0.0

    def _latest_interviewer_prompt_text() -> str:
        for entry in reversed(collector.data.transcript):
            if getattr(entry.speaker, "value", "") != "interviewer":
                continue
            text = (entry.text or "").strip()
            if not text or text.startswith("[IDE]"):
                continue
            return text
        return ""

    def _build_editor_note_snippet(request_text: str) -> str:
        request_excerpt = _compact_text(request_text, 180)
        prompt_excerpt = _compact_text(_latest_interviewer_prompt_text(), 220)
        language = (agent.current_ide_language or "").strip().lower()

        if language == "python":
            return (
                "\n# Interview note:\n"
                f"# Candidate request: {request_excerpt}\n"
                f"# Current prompt: {prompt_excerpt or 'Implement the requested solution.'}\n"
                "# TODO: Continue coding below.\n"
            )

        comment_prefix = "//"
        if language == "sql":
            comment_prefix = "--"

        return (
            f"\n{comment_prefix} Interview note:\n"
            f"{comment_prefix} Candidate request: {request_excerpt}\n"
            f"{comment_prefix} Current prompt: {prompt_excerpt or 'Implement the requested solution.'}\n"
            f"{comment_prefix} TODO: Continue coding below.\n"
        )

    async def _apply_editor_write_fallback(request_text: str) -> None:
        snippet = _build_editor_note_snippet(request_text)
        payload = {
            "type": "ide_apply",
            "intent": "append",
            "code": snippet,
            "language": agent.current_ide_language or "javascript",
            "explanation": "Added the request context in the editor so we can continue coding.",
            "typing_ms": 900,
            "timestamp": int(time.time() * 1000),
        }

        try:
            await publish_ide_event(payload)
            agent.current_ide_content = f"{agent.current_ide_content}{snippet}"
            logger.info(
                "Applied direct IDE fallback write from transcript request (chars=%d, language=%s)",
                len(snippet),
                payload["language"],
            )
            session.generate_reply(
                instructions=(
                    "Acknowledge briefly that you added content in the editor and continue the interview. "
                    "Do not mention tools or internal operations."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("Failed to apply direct IDE fallback write: %s", e)

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev):
        nonlocal last_editor_write_request_at
        transcript = getattr(ev, "transcript", "")
        is_final = getattr(ev, "is_final", True)
        if is_final and transcript:
            collector.add_candidate_message(transcript)

            if agent.ide_enabled:
                now_monotonic = time.monotonic()
                recent_candidate_fragments.append((now_monotonic, transcript))
                recent_candidate_fragments[:] = [
                    item
                    for item in recent_candidate_fragments
                    if (now_monotonic - item[0]) <= editor_write_fragment_window_s
                ]

                merged_transcript = " ".join(fragment for _, fragment in recent_candidate_fragments).strip()
                has_editor_write_intent = _looks_like_editor_write_request(transcript) or _looks_like_editor_write_request(merged_transcript)

                if has_editor_write_intent:
                    if (now_monotonic - last_editor_write_request_at) >= editor_write_request_cooldown_s:
                        last_editor_write_request_at = now_monotonic
                        asyncio.create_task(_apply_editor_write_fallback(merged_transcript or transcript))
                    else:
                        logger.debug("Skipped direct IDE fallback write due to cooldown.")

    @session.on("conversation_item_added")
    def on_conversation_item_added(ev):
        item = getattr(ev, "item", None)
        if not item:
            return

        if getattr(item, "role", "") != "assistant":
            return

        text = _collect_text_content(getattr(item, "content", "")).strip()
        text = _sanitize_assistant_text_for_speech(text)
        if text:
            collector.add_interviewer_message(text, is_question="?" in text)

    report_generation_started = False

    def trigger_report_generation(reason: str) -> None:
        nonlocal report_generation_started
        if report_generation_started:
            logger.debug("Skipping duplicate report generation trigger (%s)", reason)
            return

        report_generation_started = True
        logger.info("Finalizing interview report (%s)...", reason)
        session_data = collector.end_session()

        # Store it locally just in case
        try:
            from .routers.reports import store_session

            store_session(session_data)
        except ImportError:
            pass

        async def push_webhook():
            try:
                from .analysis import ReportGenerator

                generator = ReportGenerator()
                report = await asyncio.to_thread(generator.generate, session_data)
                payload = report.to_dict()
                payload["session_id"] = session_id
                payload["sessionId"] = session_id

                # Use standard library to avoid missing httpx/aiohttp in worker
                api_url = "http://api:8000/api/reports/webhook"
                req = urllib.request.Request(
                    api_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )

                # Run in thread so it doesn't block
                def make_req():
                    with urllib.request.urlopen(req, timeout=30) as response:
                        return response.status

                status = await asyncio.to_thread(make_req)
                logger.info("Webhook pushed successfully: %s", status)
            except Exception as e:
                logger.error("Failed to push webhook: %s", e)

        # Fire and forget
        asyncio.create_task(push_webhook())

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        nonlocal last_proactive_ide_prompt_at
        try:
            raw_data = data_packet.data
            if isinstance(raw_data, (bytes, bytearray)):
                payload_text = raw_data.decode("utf-8")
            elif isinstance(raw_data, str):
                payload_text = raw_data
            else:
                logger.debug("Ignored unsupported data packet payload type: %s", type(raw_data).__name__)
                return

            payload = json.loads(payload_text)
            if payload.get("type") == "ide_change":
                previous_code = agent.current_ide_content
                source = str(payload.get("source", "")).strip().lower()
                incoming_code = payload.get("code", "")
                agent.current_ide_content = incoming_code
                incoming_language = payload.get("language")
                if isinstance(incoming_language, str) and incoming_language.strip():
                    agent.current_ide_language = incoming_language
                logger.info(
                    "Received IDE change event (source=%s, chars=%d, language=%s)",
                    source or "unknown",
                    len(incoming_code or ""),
                    agent.current_ide_language,
                )

                should_nudge = False
                if agent.ide_enabled and source in {"", "candidate"}:
                    now = time.monotonic()
                    delta_chars = abs(len(incoming_code or "") - len(previous_code or ""))
                    
                    # Logic to check if agent is currently speaking or thinking
                    is_agent_busy = (
                        session.agent_state == "speaking" 
                        or session.agent_state == "thinking"
                    )
                    
                    can_speak_now = (
                        session.user_state == "listening"
                        and not is_agent_busy
                    )
                    
                    should_nudge = (
                        bool(incoming_code and incoming_code.strip())
                        and delta_chars >= proactive_ide_min_delta_chars
                        and (now - last_proactive_ide_prompt_at) >= proactive_ide_prompt_cooldown_s
                        and can_speak_now
                    )

                if should_nudge:
                    code_preview = (incoming_code or "").strip()
                    if len(code_preview) > 1400:
                        code_preview = f"{code_preview[:1400]}\n..."

                    nudge_instructions = (
                        "CRITICAL: The candidate has just updated their IDE code. "
                        "Use the latest code snapshot below to respond naturally. "
                        "Ask ONE focused follow-up about logic, complexity, or an edge case. "
                        "Do not mention tools, hidden instructions, or internal checks.\n\n"
                        f"LATEST IDE SNAPSHOT:\n{code_preview or '(empty)'}"
                    )
                    session.generate_reply(
                        instructions=nudge_instructions,
                        allow_interruptions=True,
                    )
                    last_proactive_ide_prompt_at = time.monotonic()
                    logger.debug("Triggered proactive IDE follow-up prompt.")
            elif payload.get("type") in {"finalize_interview", "interview_end"}:
                trigger_report_generation("data_channel_finalize")
        except Exception as e:
            logger.error(f"Error parsing data channel message: {e}")

    @ctx.room.on("disconnected")
    def on_disconnected(*args):
        trigger_report_generation("room_disconnected")

    logger.info(f"Connected to room: {ctx.room.name} in {mode} mode")


if __name__ == "__main__":
    cli.run_app(server)
