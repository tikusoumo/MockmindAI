from livekit.plugins import silero
try:
    print("Loading VAD...")
    vad = silero.VAD.load()
    print("VAD Loaded successfully")
except Exception as e:
    print(f"VAD Load failed: {e}")
