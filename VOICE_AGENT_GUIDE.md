# Voice Agent Quick Start Guide

## What You Get

This setup provides a complete AI voice assistant that:
- Listens to user speech (Google Speech-to-Text)
- Understands and responds (Google Gemini LLM)
- Speaks back naturally (Google Text-to-Speech)
- All in real-time through LiveKit

## Setup Steps

### 1. Configure Environment Variables

Edit the `.env` file in the project root:

```env
# LiveKit Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=secretxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google API (already configured)
GOOGLE_API_KEY=AIzaSyA6jRUocmIvFsTZCXATW9URsDYHbgTmHt0
```

### 2. Start the VM & Services

```bash
# On Windows host
vagrant up
vagrant ssh

# Inside VM
cd /vagrant
docker compose up --build
```

This starts:
- ✅ PostgreSQL database
- ✅ Backend API (port 8000)
- ✅ Frontend (port 3000)
- ✅ Agent Worker (background)

### 3. Create a Voice Session

**Option A: Using the API**

```bash
# Create a room
curl -X POST http://localhost:8000/livekit/rooms \
  -H "Content-Type: application/json" \
  -d '{"name": "my-voice-room"}'

# Get a token for a user
curl -X POST http://localhost:8000/livekit/token \
  -H "Content-Type: application/json" \
  -d '{
    "room_name": "my-voice-room",
    "participant_name": "user-123"
  }'
```

**Option B: Using the Frontend**

Navigate to http://localhost:3000 and use the UI to create and join rooms.

## How It Works

```
┌─────────────┐
│    User     │
│  (Browser)  │
└──────┬──────┘
       │ WebRTC
       ↓
┌─────────────────┐
│  LiveKit Server │
└──────┬──────────┘
       │ WebRTC
       ↓
┌──────────────────────────┐
│   Voice Agent Worker     │
│  ┌────────────────────┐  │
│  │  1. User speaks    │  │
│  │  2. Google STT     │  │
│  │  3. Gemini LLM     │  │
│  │  4. Google TTS     │  │
│  │  5. Stream audio   │  │
│  └────────────────────┘  │
└──────────────────────────┘
```

## Customization

### Change TTS Voice

Edit `apps/backend/agent/voice_agent.py`:

```python
tts = google.TTS(
    credentials_info={"api_key": settings.google_api_key},
    voice="en-US-Neural2-C",  # Try different voices:
    # en-US-Neural2-A (Female)
    # en-US-Neural2-C (Female) 
    # en-US-Neural2-D (Male)
    # en-US-Neural2-F (Female)
)
```

### Change LLM Model

```python
return google.LLM(
    credentials_info={"api_key": settings.google_api_key},
    model="gemini-1.5-pro",  # or "gemini-1.5-flash" for faster responses
)
```

### Add Custom Instructions

Modify the assistant's initial context:

```python
self._chat_context = [
    {
        "role": "system",
        "content": "You are a helpful AI assistant specialized in [your domain]. "
                   "Keep responses concise and friendly."
    }
]
```

## Troubleshooting

### Agent Not Connecting
- Check `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env`
- View logs: `docker compose logs agent-worker`

### No Speech Recognition
- Verify `GOOGLE_API_KEY` is set
- Ensure Cloud Speech-to-Text API is enabled in Google Cloud Console
- Check browser microphone permissions

### No Voice Output
- Verify Cloud Text-to-Speech API is enabled
- Check browser audio output settings
- View logs for errors

### Check Service Status
```bash
# Inside VM
docker compose ps
docker compose logs -f agent-worker
docker compose logs -f backend
```

## Testing Without Frontend

Use the LiveKit example clients:
- [LiveKit React Example](https://github.com/livekit-examples/meet)
- [LiveKit Web Components](https://github.com/livekit/components-js)

Or build a simple HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/livekit-client/dist/livekit-client.umd.min.js"></script>
</head>
<body>
  <button onclick="joinRoom()">Join Voice Room</button>
  <script>
    async function joinRoom() {
      // Get token from your backend
      const response = await fetch('http://localhost:8000/livekit/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          room_name: 'my-voice-room',
          participant_name: 'user-' + Date.now()
        })
      });
      const {token, url} = await response.json();
      
      // Connect to room
      const room = new LivekitClient.Room();
      await room.connect(url, token);
      
      // Enable microphone
      await room.localParticipant.enableMicrophone();
      console.log('Connected to voice room!');
    }
  </script>
</body>
</html>
```

## Next Steps

1. **Integrate with Frontend**: Add voice chat UI in `apps/platform`
2. **Customize Agent**: Modify `voice_agent.py` for your use case
3. **Add Persistence**: Store conversations in PostgreSQL
4. **Multi-language**: Add language detection and multi-language support
5. **Analytics**: Track usage and conversation quality

## Resources

- [LiveKit Docs](https://docs.livekit.io)
- [LiveKit Agents Guide](https://docs.livekit.io/agents/)
- [Google Cloud Speech-to-Text](https://cloud.google.com/speech-to-text)
- [Google Cloud Text-to-Speech](https://cloud.google.com/text-to-speech)
- [Gemini API](https://ai.google.dev/)
