from __future__ import annotations

import logging
from typing import Annotated

from livekit import agents, rtc
from livekit.agents import JobContext, WorkerOptions, cli
from livekit.plugins import google, silero

from .settings import settings

logger = logging.getLogger("voice-agent")


class VoiceAgent:
    """LiveKit voice agent with Google STT/TTS capabilities."""

    def __init__(self, ctx: JobContext):
        self.ctx = ctx
        self._chat_context = []

    async def entrypoint(self):
        """Main entrypoint for the voice agent."""
        logger.info(f"Starting voice agent for room: {self.ctx.room.name}")

        # Initialize STT (Speech-to-Text) with Google
        if not settings.google_api_key:
            logger.error("Google API key not configured")
            return

        stt = google.STT(
            credentials_info={"api_key": settings.google_api_key},
            languages=["en-US"],
        )

        # Initialize TTS (Text-to-Speech) with Google
        tts = google.TTS(
            credentials_info={"api_key": settings.google_api_key},
            voice="en-US-Neural2-A",  # You can customize the voice
        )

        # Initialize Voice Activity Detection (VAD)
        vad = silero.VAD.load()

        # Connect to the room
        await self.ctx.connect()
        logger.info(f"Connected to room: {self.ctx.room.name}")

        # Create an assistant with the configured plugins
        assistant = agents.VoiceAssistant(
            vad=vad,
            stt=stt,
            llm=self._create_llm(),
            tts=tts,
            chat_ctx=self._chat_context,
        )

        # Set up event handlers
        assistant.on("user_speech_committed", self._on_user_speech_committed)
        assistant.on("agent_speech_committed", self._on_agent_speech_committed)

        # Start the assistant
        assistant.start(self.ctx.room)

        # Greet the user
        await assistant.say("Hello! I'm your AI voice assistant. How can I help you today?")

    def _create_llm(self):
        """Create and configure the LLM for the assistant."""
        # Using Google's LLM with the API key
        return google.LLM(
            credentials_info={"api_key": settings.google_api_key},
            model="gemini-1.5-flash",  # or "gemini-pro"
        )

    def _on_user_speech_committed(self, msg: agents.llm.ChatMessage):
        """Handle user speech events."""
        logger.info(f"User said: {msg.content}")

    def _on_agent_speech_committed(self, msg: agents.llm.ChatMessage):
        """Handle agent speech events."""
        logger.info(f"Agent said: {msg.content}")


def create_worker_options() -> WorkerOptions:
    """Create worker options for the LiveKit agent."""
    return WorkerOptions(
        entrypoint_fnc=prewarm_entrypoint,
        prewarm_fnc=prewarm,
    )


def prewarm(proc: agents.JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    # You can preload models or initialize resources here
    pass


async def prewarm_entrypoint(ctx: JobContext):
    """Entrypoint that uses prewarmed resources."""
    agent = VoiceAgent(ctx)
    await agent.entrypoint()


def run_worker():
    """Run the LiveKit worker."""
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        logger.error("LiveKit credentials not configured")
        return

    cli.run_app(create_worker_options())


if __name__ == "__main__":
    run_worker()
