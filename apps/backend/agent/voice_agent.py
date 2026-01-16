from __future__ import annotations

import logging
import sys
from livekit import agents
from livekit.agents import JobContext, WorkerOptions, cli, JobProcess
from livekit.plugins import openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from .settings import settings

logger = logging.getLogger("voice-agent")


class VoiceAgent(agents.Agent):
    """
    Voice Agent implementation matching the reference agent.py.
    Uses local models via OpenAI plugin interface.
    """
    def __init__(self) -> None:
        super().__init__(
            instructions="""You are a helpful voice AI assistant. The user is interacting with you via voice, even if you perceive the conversation as text.
            You eagerly assist users with their questions by providing information from your extensive knowledge.
            Your responses are concise, to the point, and without any complex formatting or punctuation including emojis, asterisks, or other symbols.
            You are curious, friendly, and have a sense of humor."""
        )

    @agents.function_tool()
    async def multiply_numbers(
        self,
        context: agents.RunContext,
        number1: int,
        number2: int,
    ) -> str:
        """Multiply two numbers.
        
        Args:
            number1: The first number to multiply.
            number2: The second number to multiply.
        """
        return f"The product of {number1} and {number2} is {number1 * number2}."


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    proc.userdata["vad"] = silero.VAD.load()


async def entrypoint(ctx: JobContext):
    """Main entrypoint for the voice agent."""
    logger.info(f"Starting voice agent for room: {ctx.room.name}")

    ctx.log_context_fields = {
        "room": ctx.room.name,
    }

    # Connect to the room
    await ctx.connect()
    
    # Configure models from settings
    # Note: Using host.docker.internal URLs from settings by default for Docker execution
    
    session = agents.AgentSession(
        stt=openai.STT(
            base_url=settings.whisper_base_url,
            model="Systran/faster-whisper-small", 
            api_key="no-key-needed"
        ),
        llm=openai.LLM(
            base_url=settings.llama_base_url,
            model=settings.llama_model,
            api_key="no-key-needed"
        ),
        tts=openai.TTS(
            base_url=settings.kokoro_base_url,
            model="kokoro",
            voice="af_nova",
            api_key="no-key-needed"
        ),
        turn_detection=MultilingualModel(),
        vad=ctx.proc.userdata["vad"],
        preemptive_generation=True,
    )

    @session.on("user_speech_committed")
    def on_speech_committed(msg):
        logger.info(f"USER SPEECH COMMITTED: {msg}")

    @session.on("agent_speech_committed")
    def on_agent_speech(msg):
        logger.info(f"AGENT SPEECH GENERATED: {msg}")

    await session.start(
        agent=VoiceAgent(),
        room=ctx.room,
    )


def create_worker_options() -> WorkerOptions:
    """Create worker options for the LiveKit agent."""
    return WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
    )


def run_worker():
    """Run the LiveKit worker."""
    if "download-files" not in sys.argv:
        if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
            logger.error("LiveKit credentials not configured")
            return

    cli.run_app(create_worker_options())


if __name__ == "__main__":
    run_worker()
