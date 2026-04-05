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

import json
import logging
import asyncio
import io
import wave
import uuid
from typing import Any
import importlib

import requests

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
from livekit.agents import tts as lk_tts
from livekit.plugins import silero, openai

from .settings import settings
from .session_collector import SessionCollector
try:
    from .rag.vector_store import get_vector_store
except Exception:
    class _FallbackVectorStore:
        async def query_for_interview(self, interview_id: str, query: str):
            return []

    def get_vector_store():
        logger.warning("RAG module unavailable. Using fallback empty vector store.")
        return _FallbackVectorStore()

logger = logging.getLogger("voice-agent")

load_dotenv()


class InterviewCoach(Agent):
    """AI Interview Coach Assistant with mode-aware behavior."""
    
    def __init__(
        self,
        mode: str = "strict",
        template_id: str | None = None,
        template_title: str = "",
        collector: SessionCollector | None = None,
    ) -> None:
        # Build instructions based on mode
        base_instructions = """You are a professional AI interview coach assistant. You help users practice for job interviews.
            Your responses should be without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            Keep your responses concise and natural for voice conversation."""
        
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
        self.session_id = None
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
        if not self.template_id and not self.session_id:
            return "No document context is available in this session."

        store = get_vector_store()
        try:
            all_results = []
            
            if self.session_id:
                try:
                    session_results = await store.query_for_interview(f"session_{self.session_id}", query)
                    if session_results:
                        all_results.extend(session_results)
                except Exception as e:
                    logger.error(f"Failed to query session documents: {e}")
                    
            if self.template_id:
                try:
                    template_results = await store.query_for_interview(self.template_id, query)
                    if template_results:
                        all_results.extend(template_results)
                except Exception as e:
                    logger.error(f"Failed to query template documents: {e}")

            if not all_results:
                return "I couldn't find any relevant information about that in the uploaded documents."
            return "\n\n".join(all_results)
        except Exception as e:
            logger.error(f"Failed to query RAG: {e}")
            return "Failed to retrieve document context at this moment."

server = AgentServer(
    num_idle_processes=settings.livekit_num_idle_processes,
    initialize_process_timeout=settings.livekit_initialize_process_timeout,
    job_memory_warn_mb=settings.livekit_job_memory_warn_mb,
    job_memory_limit_mb=settings.livekit_job_memory_limit_mb,
)


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


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
        text = self.input_text.strip()
        if not text:
            return

        payload = {
            "model": self._kokoro_tts.model,
            "input": text,
            "voice": self._kokoro_tts.voice,
            "response_format": "wav",
        }

        # Use a thread to avoid blocking the event loop on HTTP I/O.
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


def create_model_components(settings):
    """Factory to create LLM, STT, and TTS instances with support for mixing local and online providers."""
    def s(name: str, default=None):
        return getattr(settings, name, default)

    stt_provider = s("stt_provider", "openai")
    llm_provider = s("llm_provider", "openai")
    tts_provider = s("tts_provider", "openai")
    use_local_ai = s("use_local_ai", True)

    whisper_base_url = s("whisper_base_url", "http://whisper:80/v1")
    llama_base_url = s("llama_base_url", "http://llama_cpp:11434/v1")
    llama_model = s("llama_model", "qwen3-4b")
    kokoro_base_url = s("kokoro_base_url", "http://kokoro:8880/v1")

    google_api_key = s("google_api_key")
    google_credentials_file = s("google_credentials_file")
    groq_api_key = s("groq_api_key")
    deepgram_api_key = s("deepgram_api_key")
    eleven_api_key = s("eleven_api_key")

    def is_local_target(base_url: str | None, host_hint: str) -> bool:
        return bool(use_local_ai or (base_url and ("localhost" in base_url or host_hint in base_url)))

    def openai_stt_fallback():
        if is_local_target(whisper_base_url, "whisper"):
            return openai.STT(
                base_url=whisper_base_url,
                model="Systran/faster-whisper-small",
                api_key="no-key-needed",
            )
        return openai.STT(model="whisper-1")

    def openai_llm_fallback():
        if is_local_target(llama_base_url, "llama"):
            return openai.LLM(base_url=llama_base_url, model=llama_model, api_key="no-key-needed")
        return openai.LLM(model="gpt-4o")

    def openai_tts_fallback():
        if is_local_target(kokoro_base_url, "kokoro"):
            return LocalKokoroTTS(base_url=kokoro_base_url, model="kokoro", voice="af_sky")
        return openai.TTS(model="tts-1", voice="alloy")

    def load_optional_plugin(module_name: str):
        try:
            return importlib.import_module(module_name)
        except Exception:
            logger.warning(f"Optional LiveKit plugin unavailable: {module_name}. Falling back.")
            return None

    google = load_optional_plugin("livekit.plugins.google")
    deepgram = load_optional_plugin("livekit.plugins.deepgram")
    groq = load_optional_plugin("livekit.plugins.groq")
    elevenlabs = load_optional_plugin("livekit.plugins.elevenlabs")
    
    # --- STT ---
    if stt_provider == "deepgram" and deepgram:
        stt = deepgram.STT(api_key=deepgram_api_key)
    elif stt_provider == "google" and google:
        # Google STT requires service-account credentials for gRPC.
        if google_credentials_file:
            stt = google.STT(credentials_file=google_credentials_file)
        else:
            logger.warning(
                "Google STT selected but GOOGLE_CREDENTIALS_FILE is missing. Falling back to OpenAI-compatible STT."
            )
            stt = openai_stt_fallback()
    elif stt_provider == "groq" and groq:
        stt = groq.STT(api_key=groq_api_key)
    elif stt_provider == "openai":
        stt = openai_stt_fallback()
    else: # Default
        stt = (
            google.STT(credentials_file=google_credentials_file)
            if (google and google_credentials_file)
            else openai_stt_fallback()
        )

    # --- LLM ---
    if llm_provider == "google" and google:
        if google_api_key:
            llm = google.LLM(model="gemini-2.0-flash-exp", api_key=google_api_key)
        else:
            logger.warning(
                "Google LLM selected but GOOGLE_API_KEY is missing. Falling back to OpenAI-compatible LLM."
            )
            llm = openai_llm_fallback()
    elif llm_provider == "groq" and groq:
        llm = groq.LLM(model="llama3-8b-8192", api_key=groq_api_key)
    elif llm_provider == "openai":
        llm = openai_llm_fallback()
    else:
        llm = (
            google.LLM(model="gemini-2.0-flash-exp", api_key=google_api_key)
            if (google and google_api_key)
            else openai_llm_fallback()
        )

    # --- TTS ---
    if tts_provider == "elevenlabs" and elevenlabs:
        tts = elevenlabs.TTS(api_key=eleven_api_key)
    elif tts_provider == "deepgram" and deepgram:
        tts = deepgram.TTS(api_key=deepgram_api_key)
    elif tts_provider == "google" and google:
        # Google TTS also requires service-account credentials for gRPC.
        if google_credentials_file:
            tts = google.TTS(credentials_file=google_credentials_file)
        else:
            logger.warning(
                "Google TTS selected but GOOGLE_CREDENTIALS_FILE is missing. Falling back to OpenAI-compatible TTS."
            )
            tts = openai_tts_fallback()
    elif tts_provider == "openai":
         tts = openai_tts_fallback()
    else:
        tts = (
            google.TTS(credentials_file=google_credentials_file)
            if (google and google_credentials_file)
            else openai_tts_fallback()
        )

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
    session_id = metadata.get("sessionId")
    if not session_id and ctx.room.name.startswith("interview-"):
        session_id = ctx.room.name.replace("interview-", "", 1)
    template_title = metadata.get("templateTitle", "Interview")
    participant_name = metadata.get("participantName", "Candidate")

    logger.info(f"Interview mode: {mode}, template: {template_title}")

    # Initialize session collector
    collector = SessionCollector(
        room_name=ctx.room.name,
        template_id=template_id,
        template_title=template_title,
        mode=mode,
        participant_name=participant_name,
    )

    logger.info(
        f"Using Providers -> LLM: {getattr(settings, 'llm_provider', 'openai')}, "
        f"STT: {getattr(settings, 'stt_provider', 'openai')}, "
        f"TTS: {getattr(settings, 'tts_provider', 'openai')}"
    )

    stt, llm, tts = create_model_components(settings)

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        # Keep endpointing lightweight in containerized deployments where
        # turn-detector model assets may not be present.
        preemptive_generation=False, # Disable to prevent premature "speaking" UI state while LLM generates
    )

    # Create mode-aware agent
    agent = InterviewCoach(
        mode=mode,
        template_id=template_id,
        template_title=template_title,
        collector=collector,
    )

    agent.session_id = session_id

    @session.on("user_input_transcribed")
    def on_transcribed(ev):
        if getattr(ev, "is_final", False) and ev.transcript:
            collector.add_candidate_message(ev.transcript)
            logger.info(f"Recorded candidate: {ev.transcript}")

    @session.on("conversation_item_added")
    def on_chat_added(ev):
        msg = ev.item
        if getattr(msg, "role", "") == "assistant":
            text_val = msg.content if isinstance(msg.content, str) else "".join([getattr(m, "text", "") for m in (msg.content or []) if getattr(m, "type", "") == "text"])
            if text_val:
                is_q = "?" in text_val
                collector.add_interviewer_message(text_val, is_question=is_q)
                logger.info(f"Recorded interviewer: {text_val}")

    await session.start(

        agent=agent,
        room=ctx.room,
    )

    finalization_started = False

    async def push_session_to_background(trigger: str) -> None:
        nonlocal finalization_started

        if finalization_started:
            logger.debug(f"Session finalization already started, skipping trigger={trigger}")
            return

        finalization_started = True
        logger.info(f"Finalizing session via trigger={trigger}")

        session_data = collector.end_session()
        resolved_session_id = session_id or agent.session_id or ctx.room.name

        import aiohttp

        api_url = "http://agent-api:8001/reports/process"
        payload = {
            "session_id": resolved_session_id,
            "session_data": session_data.to_dict(),
        }

        timeout = aiohttp.ClientTimeout(total=8)
        max_attempts = 3

        for attempt in range(1, max_attempts + 1):
            try:
                async with aiohttp.ClientSession(timeout=timeout) as http_session:
                    async with http_session.post(api_url, json=payload) as response:
                        if response.status >= 400:
                            error_text = await response.text()
                            raise RuntimeError(f"{response.status} - {error_text}")

                        logger.info(
                            f"Session data pushed to background processor: status={response.status}, "
                            f"session_id={resolved_session_id}"
                        )
                        return
            except Exception as e:
                if attempt >= max_attempts:
                    logger.error(
                        f"Failed to push session to background after {max_attempts} attempts: {e}"
                    )
                    return

                backoff = 0.5 * attempt
                logger.warning(
                    f"Push attempt {attempt}/{max_attempts} failed, retrying in {backoff:.1f}s: {e}"
                )
                await asyncio.sleep(backoff)

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        try:
            payload = json.loads(data_packet.data.decode("utf-8"))
            if payload.get("type") == "ide_change":
                agent.current_ide_content = payload.get("code", "")
                logger.debug("Received updated IDE content from data channel.")
        except Exception as e:
            logger.error(f"Error parsing data channel message: {e}")

    @ctx.room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        identity = getattr(participant, "identity", "unknown")
        logger.info(
            f"Participant {identity} disconnected. Scheduling background finalization push."
        )
        asyncio.create_task(
            push_session_to_background(f"participant_disconnected:{identity}")
        )

    @ctx.room.on("disconnected")
    def on_room_disconnected(*_args):
        logger.info("Room disconnected. Scheduling background finalization push.")
        asyncio.create_task(push_session_to_background("room_disconnected"))


if __name__ == "__main__":
    cli.run_app(server)
