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


server = AgentServer()


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


def create_model_components(settings):
    """Factory to create LLM, STT, and TTS instances based on settings."""
    
    # --- STT ---
    if settings.stt_provider == "deepgram":
        stt = deepgram.STT(api_key=settings.deepgram_api_key)
    elif settings.stt_provider == "google":
        stt = google.STT(api_key=settings.google_api_key)
    elif settings.stt_provider == "groq":
        stt = groq.STT(api_key=settings.groq_api_key)
    else: # Default to OpenAI / Local
        stt = openai.STT(
            base_url=settings.whisper_base_url,
            model="Systran/faster-whisper-small",
            api_key="no-key-needed"
        )

    # --- LLM ---
    if settings.llm_provider == "google":
        llm = google.LLM(
            model="gemini-2.0-flash-exp", # Default generic model, can be parameterized
            api_key=settings.google_api_key
        )
    elif settings.llm_provider == "groq":
        llm = groq.LLM(
            model="llama3-8b-8192", # Default generic
            api_key=settings.groq_api_key
        )
    elif settings.llm_provider == "openai":
         # Check if it's actually local (no key) or real OpenAI
        if settings.llama_base_url and "localhost" in settings.llama_base_url:
             llm = openai.LLM(
                base_url=settings.llama_base_url,
                model=settings.llama_model,
                api_key="no-key-needed"
            )
        else:
             llm = openai.LLM(model="gpt-4o")

    else: # Default to Local/OpenAI Generic
        llm = openai.LLM(
            base_url=settings.llama_base_url,
            model=settings.llama_model,
            api_key="no-key-needed"
        )
        
    # --- TTS ---
    if settings.tts_provider == "elevenlabs":
        tts = elevenlabs.TTS(api_key=settings.eleven_api_key)
    elif settings.tts_provider == "deepgram":
        tts = deepgram.TTS(api_key=settings.deepgram_api_key)
    elif settings.tts_provider == "google":
        tts = google.TTS(api_key=settings.google_api_key)
    elif settings.tts_provider == "openai": # real openai
         if settings.kokoro_base_url and "localhost" in settings.kokoro_base_url:
             tts = openai.TTS(
                base_url=settings.kokoro_base_url,
                model="kokoro",
                voice="af_nova",
                api_key="no-key-needed"
            )
         else:
             tts = openai.TTS(model="tts-1", voice="alloy")

    else: # Default to Local/Kokoro
        tts = openai.TTS(
            base_url=settings.kokoro_base_url,
            model="kokoro",
            voice="af_nova",
            api_key="no-key-needed"
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
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
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
    
    logger.info(f"Connected to room: {ctx.room.name} in {mode} mode")


if __name__ == "__main__":
    cli.run_app(server)
