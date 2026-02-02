import asyncio
import os
from livekit import rtc, api
from dotenv import load_dotenv

# Load env vars
load_dotenv()

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

if not LIVEKIT_URL or not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
    print("Error: LiveKit credentials not found in environment.")
    exit(1)

async def test_connection():
    room_name = "terminal-test-room"
    identity = "terminal-tester"
    
    print(f"Connecting to room '{room_name}' as '{identity}'...")

    # Generate token
    token = api.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET) \
        .with_identity(identity) \
        .with_name(identity) \
        .with_grants(api.VideoGrants(room_join=True, room=room_name)) \
        .to_jwt()

    room = rtc.Room()

    # Event to wait for agent
    agent_joined_event = asyncio.Event()

    @room.on("participant_connected")
    def on_participant_connected(participant: rtc.RemoteParticipant):
        print(f"Participant connected: {participant.identity}")
        if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or "agent" in participant.identity.lower():
            print("✅ Voice Agent has joined the room!")
            agent_joined_event.set()

    try:
        await room.connect(LIVEKIT_URL, token)
        print("Connected to LiveKit room.")
        
        # Check if agent is already there
        for p in room.remote_participants.values():
            if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_AGENT or "agent" in p.identity.lower():
                 print(f"✅ Voice Agent is already in the room: {p.identity}")
                 agent_joined_event.set()
        
        print("Waiting for agent to join (timeout 15s)...")
        try:
             await asyncio.wait_for(agent_joined_event.wait(), timeout=15)
             print("\nSUCCESS: The Voice Agent is active and connected to the room.")
        except asyncio.TimeoutError:
             print("\nFAILED: Voice Agent did not join within 15 seconds.")
             print("Check 'docker compose logs agent-worker' for errors.")

    except Exception as e:
        print(f"Connection failed: {e}")
    finally:
        await room.disconnect()

if __name__ == "__main__":
    asyncio.run(test_connection())
