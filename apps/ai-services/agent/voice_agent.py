"""
Voice Agent for LiveKit - Interview Coach Assistant

This module implements a voice AI agent using LiveKit's AgentSession API.
It connects to local models (Kokoro TTS, Whisper STT, LLaMA LLM) running
in the local-voice-ai docker-compose network.
"""
from __future__ import annotations

import logging
import os
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
from livekit.plugins import silero, openai
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from .settings import settings

logger = logging.getLogger("voice-agent")

load_dotenv()


class InterviewCoach(Agent):
    """AI Interview Coach Assistant."""
    
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful AI interview coach assistant. You help users practice for job interviews.
            Be friendly, professional, and provide constructive feedback. Ask follow-up questions to help the user improve their answers.
            Keep your responses concise and natural for voice conversation.
            Your responses should be without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor.""",
        )

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
        tips = {
            "behavioral": "Use the STAR method: Situation, Task, Action, Result. This helps structure your answers clearly.",
            "technical": "Think out loud! Interviewers want to see your problem-solving process, not just the final answer.",
            "salary": "Research market rates beforehand. When asked, give a range based on your research and qualifications.",
            "general": "Prepare 3-5 stories from your experience that demonstrate key skills. You can adapt them to various questions.",
        }
        return tips.get(topic.lower(), tips["general"])


server = AgentServer()


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session()
async def voice_agent(ctx: JobContext):
    """Main entrypoint for the voice agent RTC session."""
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }
    
    logger.info(f"Starting voice agent for room: {ctx.room.name}")

    # Get model configuration from settings
    llama_model = settings.llama_model
    llama_base_url = settings.llama_base_url
    kokoro_base_url = settings.kokoro_base_url
    whisper_base_url = settings.whisper_base_url

    logger.info(f"Using LLM: {llama_base_url} model={llama_model}")
    logger.info(f"Using TTS: {kokoro_base_url}")
    logger.info(f"Using STT: {whisper_base_url}")

    session = AgentSession(
        stt=openai.STT(
            base_url=whisper_base_url,
            model="Systran/faster-whisper-small",
            api_key="no-key-needed"
        ),
        llm=openai.LLM(
            base_url=llama_base_url,
            model=llama_model,
            api_key="no-key-needed"
        ),
        tts=openai.TTS(
            base_url=kokoro_base_url,
            model="kokoro",
            voice="af_nova",
            api_key="no-key-needed"
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    await session.start(
        agent=InterviewCoach(),
        room=ctx.room,
    )

    await ctx.connect()
    
    logger.info(f"Connected to room: {ctx.room.name}")


if __name__ == "__main__":
    cli.run_app(server)
