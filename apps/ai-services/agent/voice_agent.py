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
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
import io
import json
import logging
import os
import re
import threading
import urllib.request
import uuid
import wave
from typing import Any

from dotenv import load_dotenv
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

_RAG_EXECUTOR = ThreadPoolExecutor(max_workers=2)


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

        response = await asyncio.to_thread(
            requests.post,
            f"{self._kokoro_tts.base_url}/audio/speech",
            json=payload,
            timeout=20,
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
    ) -> None:
        # Build instructions based on mode
        base_instructions = """You are a professional AI interview coach assistant. You help users practice for job interviews.
            Your responses should be without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            Keep your responses concise and natural for voice conversation.
            
            IMPORTANT: You have access to a tool called `request_document_context`. 
            ALWAYS use this tool to fetch the candidate's uploaded resume or provided job documentation to tailor your questions and evaluation. 
            When the candidate mentions their experience or you want to ask relevant questions, explicitly call `request_document_context` with a relevant query to look up details from their uploaded documents."""
        
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
        
        super().__init__(
            instructions=base_instructions + mode_instructions,
        )
        
        self.mode = mode
        self.template_id = template_id
        self.session_id = session_id
        self.template_title = template_title
        self.collector = collector
        self.current_question_idx = 0
        self.questions: list[str] = []
        self.current_ide_content: str = ""

    @function_tool()
    async def read_candidates_code(
        self,
        context: RunContext,
    ) -> str:
        """Read the live code from the candidate's IDE. Use this when the user asks you to look at their code or when you need to evaluate their progress in a machine coding round."""
        if not self.current_ide_content.strip():
            return "The IDE is currently empty or the candidate hasn't typed anything yet."
        return f"Here is the candidate's current code:\n\n{self.current_ide_content}"

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

        store = get_vector_store()
        try:
            # Query both the template (if applicable) and this specific session's uploaded docs
            results = []
            if self.template_id:
                template_results = await store.query_for_interview(self.template_id, query)
                if template_results:
                   results.extend(template_results)
                   
            # Also check user uploads bound strictly to this session
            if self.session_id:
               session_results = await store.query_for_interview(self.session_id, query)
               # Fallback legacy lookup just in case
               session_legacy_results = await store.query_for_interview(f"session_{self.session_id}", query)
               if session_results:
                   results.extend(session_results)
               if session_legacy_results:
                   results.extend(session_legacy_results)
                   
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
            )
        return openai.LLM(model="gpt-4o")

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
    
    mode = metadata.get("mode", "strict")
    template_id = metadata.get("templateId")
    session_id = template_id # Using template_id as session id to match the FE assignment logic
    if ctx.room.name.startswith("interview-"):
       session_id = ctx.room.name.replace("interview-", "")
    template_title = metadata.get("templateTitle", "Interview")
    participant_name = metadata.get("participantName", "Candidate")
    
    logger.info(f"Interview mode: {mode}, session/template: {session_id}, template title: {template_title}")

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
    
    def intercepted_chat(_bound_llm, *args, **kwargs):
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
                        return original_chat(**kwargs)
                    
                    # We need to reach into the vector store
                    from .rag.vector_store import get_vector_store
                    
                    store = get_vector_store()
                    
                    results = []
                    
                    def lookup(tid):
                        future = _RAG_EXECUTOR.submit(
                            store.query_for_interview_sync,
                            tid,
                            query,
                            settings.rag_lookup_k,
                        )
                        try:
                            chunks = future.result(timeout=settings.rag_lookup_timeout_seconds)
                        except FutureTimeoutError:
                            logger.warning(
                                "Qdrant RAG lookup timed out for target '%s' after %.1fs",
                                tid,
                                settings.rag_lookup_timeout_seconds,
                            )
                            return []
                        except Exception as rag_err:
                            logger.warning("Qdrant RAG lookup failed for target '%s': %s", tid, rag_err)
                            return []

                        logger.info("Qdrant RAG: Found %d hits for target '%s'", len(chunks), tid)
                        return chunks
                        
                    # Check templates and sessions
                    logger.info("Proactive RAG intercept triggered. Query: %s", query)
                    found_context = False
                    
                    if template_id:
                        res = lookup(template_id)
                        if res:
                            results.extend(res)
                            found_context = True
                            
                    if session_id and session_id != template_id:
                        res = lookup(session_id)
                        if res:
                            results.extend(res)
                            found_context = True
                        
                    if not found_context and session_id:
                        res = lookup(f"session_{session_id}")
                        if res:
                            results.extend(res)
                    
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
        preemptive_generation=False, # Disable to prevent premature "speaking" UI state while LLM generates
    )

    # Create mode-aware agent
    agent = InterviewCoach(
        mode=mode,
        template_id=template_id,
        session_id=session_id,
        template_title=template_title,
        collector=collector,
    )

    await session.start(
        agent=agent,
        room=ctx.room,
    )

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev):
        transcript = getattr(ev, "transcript", "")
        is_final = getattr(ev, "is_final", True)
        if is_final and transcript:
            collector.add_candidate_message(transcript)

    @session.on("conversation_item_added")
    def on_conversation_item_added(ev):
        item = getattr(ev, "item", None)
        if not item:
            return

        if getattr(item, "role", "") != "assistant":
            return

        text = _collect_text_content(getattr(item, "content", "")).strip()
        if text:
            collector.add_interviewer_message(text, is_question="?" in text)

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        try:
            payload = json.loads(data_packet.data.decode("utf-8"))
            if payload.get("type") == "ide_change":
                agent.current_ide_content = payload.get("code", "")
                logger.debug("Received updated IDE content from data channel.")
        except Exception as e:
            logger.error(f"Error parsing data channel message: {e}")

    @ctx.room.on("disconnected")
    def on_disconnected(*args):
        logger.info("Room disconnected, generating final report via webhook...")
        session_data = collector.end_session()
        
        # Store it locally just in case
        try:
            from .routers.reports import store_session
            store_session(session_data)
        except ImportError:
            pass
            
        import asyncio
        import urllib.request
        
        async def push_webhook():
            try:
                from .analysis import ReportGenerator
                generator = ReportGenerator()
                report = generator.generate(session_data)
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
                loop = asyncio.get_event_loop()
                def make_req():
                    with urllib.request.urlopen(req, timeout=30) as response:
                        return response.status
                
                status = await loop.run_in_executor(None, make_req)
                logger.info(f"Webhook pushed successfully: {status}")
            except Exception as e:
                logger.error(f"Failed to push webhook: {e}")
                
        # Fire and forget
        asyncio.create_task(push_webhook())

    logger.info(f"Connected to room: {ctx.room.name} in {mode} mode")


if __name__ == "__main__":
    cli.run_app(server)
