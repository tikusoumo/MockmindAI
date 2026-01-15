# Backend (FastAPI + LiveKit)

AI Voice Agent backend with TTS (Text-to-Speech) and STT (Speech-to-Text) capabilities using LiveKit and Google APIs.

## Features
- FastAPI REST API
- LiveKit voice agent with Google STT/TTS
- Real-time voice conversations
- Token-based authentication for LiveKit rooms

## Requirements
- Python 3.11+

## Setup (venv)
From repo root:

```powershell
cd apps/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -U pip
pip install -e .
```

## Environment
Create `apps/backend/.env`:

```env
APP_ENV=dev
APP_HOST=0.0.0.0
APP_PORT=8000

# CORS
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:3001

# LiveKit
LIVEKIT_URL=wss://your-livekit-server.livekit.cloud
LIVEKIT_API_KEY=your_api_key_here
LIVEKIT_API_SECRET=your_api_secret_here

# Google API
GOOGLE_API_KEY=your_google_api_key_here

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ai_voice_agent
```

### Getting API Keys

**LiveKit:**
1. Sign up at [LiveKit Cloud](https://cloud.livekit.io)
2. Create a new project
3. Copy the API Key, API Secret, and WebSocket URL

**Google API:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Enable Cloud Speech-to-Text API and Cloud Text-to-Speech API
3. Create an API key in "Credentials"
4. Optionally enable Vertex AI API for Gemini LLM

## Run

### Start the API Server
```powershell
cd apps/backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn agent.main:app --reload --host 0.0.0.0 --port 8000
```

### Start the LiveKit Agent Worker
In a separate terminal:
```powershell
cd apps/backend
.\.venv\Scripts\Activate.ps1
python -m agent.voice_agent
```

Open:
- http://localhost:8000/healthz
- http://localhost:8000/docs

## API Endpoints

### LiveKit Endpoints

**Create Room:**
```
POST /livekit/rooms
Body: {
  "name": "my-room",
  "empty_timeout": 300,
  "max_participants": 10
}
```

**Create Participant Token:**
```
POST /livekit/token
Body: {
  "room_name": "my-room",
  "participant_name": "user-123",
  "metadata": "{\"user_id\": \"123\"}"
}
```

**Create Agent Token:**
```
POST /livekit/agent-token
Body: {
  "room_name": "my-room",
  "participant_name": "voice-agent"
}
```

## How It Works

1. **Create a Room**: Use `/livekit/rooms` to create a new LiveKit room
2. **Generate Token**: Use `/livekit/token` to get a token for participants
3. **Join Room**: Participants connect to the room using the token
4. **Agent Connects**: The LiveKit agent automatically joins and provides voice assistance
5. **Voice Interaction**: 
   - User speaks → Google STT converts to text
   - Text → Google Gemini LLM processes
   - Response → Google TTS converts to speech
   - Speech → Streamed back to user

## Architecture

```
User Browser/Client
    ↓ (WebRTC)
LiveKit Server
    ↓ (WebRTC)
Voice Agent (Python)
    ├─→ Google STT (Speech Recognition)
    ├─→ Google Gemini (LLM)
    └─→ Google TTS (Speech Synthesis)
```
