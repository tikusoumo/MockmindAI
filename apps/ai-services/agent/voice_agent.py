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
from typing import Any

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    function_tool,
    RunContext,
)
from livekit.plugins import silero, openai, deepgram, google, groq, elevenlabs
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from .settings import settings
from .session_collector import SessionCollector
from .rag.vector_store import get_vector_store

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
        if not self.template_id:
            return "No document context is available in this session."
        
        store = get_vector_store()
        try:
            results = await store.query_for_interview(self.template_id, query)
            if not results:
                return "I couldn't find any relevant information about that in the uploaded documents."
            return "\n\n".join(results)
        except Exception as e:
            logger.error(f"Failed to query RAG: {e}")
            return "Failed to retrieve document context at this moment."

server = AgentServer()


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


def create_model_components(settings):
    """Factory to create LLM, STT, and TTS instances with support for mixing local and online providers."""
    
    # --- STT ---
    if settings.stt_provider == "deepgram":
        stt = deepgram.STT(api_key=settings.deepgram_api_key)
    elif settings.stt_provider == "google":
        # Google STT requires service account for gRPC; pass file if we have it
        stt = google.STT(credentials_file=settings.google_credentials_file) if settings.google_credentials_file else google.STT()
    elif settings.stt_provider == "groq":
        stt = groq.STT(api_key=settings.groq_api_key)
    elif settings.stt_provider == "openai":
        # Check if local or real OpenAI
        if settings.use_local_ai or (settings.whisper_base_url and ("localhost" in settings.whisper_base_url or "whisper" in settings.whisper_base_url)):
            stt = openai.STT(base_url=settings.whisper_base_url, model="Systran/faster-whisper-small", api_key="no-key-needed")
        else:
            stt = openai.STT(model="whisper-1")
    else: # Default
        stt = google.STT() if settings.google_api_key or settings.google_credentials_file else openai.STT()

    # --- LLM ---
    if settings.llm_provider == "google":
        # Gemini LLM supports direct API Key
        llm = google.LLM(model="gemini-2.0-flash-exp", api_key=settings.google_api_key)
    elif settings.llm_provider == "groq":
        llm = groq.LLM(model="llama3-8b-8192", api_key=settings.groq_api_key)
    elif settings.llm_provider == "openai":
        if settings.use_local_ai or (settings.llama_base_url and ("localhost" in settings.llama_base_url or "llama" in settings.llama_base_url)):
             llm = openai.LLM(base_url=settings.llama_base_url, model=settings.llama_model, api_key="no-key-needed")
        else:
             llm = openai.LLM(model="gpt-4o")
    else:
        llm = google.LLM(model="gemini-2.0-flash-exp", api_key=settings.google_api_key)

    # --- TTS ---
    if settings.tts_provider == "elevenlabs":
        tts = elevenlabs.TTS(api_key=settings.eleven_api_key)
    elif settings.tts_provider == "deepgram":
        tts = deepgram.TTS(api_key=settings.deepgram_api_key)
    elif settings.tts_provider == "google":
        # Google TTS also requires service account for gRPC
        tts = google.TTS(credentials_file=settings.google_credentials_file) if settings.google_credentials_file else google.TTS()
    elif settings.tts_provider == "openai":
         if settings.use_local_ai or (settings.kokoro_base_url and ("localhost" in settings.kokoro_base_url or "kokoro" in settings.kokoro_base_url)):
             tts = openai.TTS(base_url=settings.kokoro_base_url, model="kokoro", voice="af_sky", api_key="no-key-needed")
         else:
             tts = openai.TTS(model="tts-1", voice="alloy")
    else:
        tts = google.TTS()

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

    logger.info(f"Using Providers -> LLM: {settings.llm_provider}, STT: {settings.stt_provider}, TTS: {settings.tts_provider}")

    stt, llm, tts = create_model_components(settings)

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        turn_detection=MultilingualModel(
            detect_endpointing_duration=1.5 # Wait a bit longer before interrupting the person/assistant
        ),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=False, # Disable to prevent premature "speaking" UI state while LLM generates
    )

    # Create mode-aware agent
    agent = InterviewCoach(
        mode=mode,
        template_id=template_id,
        template_title=template_title,
        collector=collector,
    )

    await session.start(
        agent=agent,
        room=ctx.room,
    )

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
