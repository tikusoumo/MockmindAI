import asyncio
import io
import wave
import numpy as np
import sounddevice as sd
from livekit.rtc import AudioFrame

from agent.settings import settings
from agent.voice_agent import create_model_components
from agent.analysis.turn_analyzer import TurnAnalyzer

settings.use_local_ai = True

def generate_audio_file(filename: str, audio_data: np.ndarray, sample_rate: int = 16000):
    """Save audio data to a WAV file to verify audio generation."""
    print(f"\n[Test 1] Saving audio file to {filename}...", end=" ")
    try:
        with wave.open(filename, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2) # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.astype(np.int16).tobytes())
        print("✅ SUCCESS")
    except Exception as e:
        print(f"❌ FAILED: {e}")

async def record_audio(duration=7, sample_rate=16000) -> np.ndarray:
    """Record audio from the microphone."""
    print(f"\n🎙️ Recording {duration} seconds. Please speak... (use some filler words like 'um' or 'like')")
    try:
        recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='int16')
        sd.wait()
        print("✅ Recording finished.")
        return recording.flatten()
    except Exception as e:
        print(f"❌ Recording Error: {e}")
        return np.array([])

async def main():
    print("=" * 60)
    print("🗣️ SPEECH ANALYSIS SYSTEM TEST")
    print("=" * 60)
    
    print("\n[System] Initializing STT Models and Turn Analyzer...")
    try:
        stt, _, _ = create_model_components(settings)
        analyzer = TurnAnalyzer()
        print("✅ Models and Analyzer loaded.")
    except Exception as e:
        print(f"❌ Init failed: {e}")
        return

    # 1. Record Audio
    sample_rate = 16000
    audio_data = await record_audio(duration=10, sample_rate=sample_rate)
    
    if len(audio_data) == 0:
        print("Test aborted due to recording error.")
        return

    # 2. Test Audio File Generation
    filename = "test_candidate_recording.wav"
    generate_audio_file(filename, audio_data, sample_rate)

    # Prepare for STT
    print("\n[Test 2] Running Transcription (STT)...", end=" ", flush=True)
    frame = AudioFrame(
        data=audio_data.tobytes(),
        sample_rate=sample_rate,
        num_channels=1,
        samples_per_channel=len(audio_data)
    )
    
    try:
        stt_res = await stt.recognize(buffer=frame)
        transcript = stt_res.alternatives[0].text if stt_res.alternatives else ""
        print("✅ SUCCESS")
        print(f"📝 Transcript: \"{transcript}\"")
    except Exception as e:
        print(f"❌ STT FAILED: {e}")
        transcript = ""

    # 3 & 4. Test Filler and Pacing (SPA) Analysis
    print("\n[Test 3 & 4] Running Speech Analysis (Fillers & Pacing)...")
    if transcript:
        try:
            metrics = analyzer.analyze_turn(
                audio=audio_data,
                transcript=transcript,
                sample_rate=sample_rate
            )
            print("✅ Analysis SUCCESS\n")
            
            print("-" * 40)
            print("📊 ANALYSIS RESULTS")
            print("-" * 40)
            print(f"1️⃣  Audio Generated: Yes ({filename})")
            print(f"2️⃣  Transcription:   \"{metrics.transcript}\"")
            print(f"3️⃣  Filler Words:    {metrics.filler_count} detected {metrics.filler_words}")
            print(f"4️⃣  Pacing (WPM):    {metrics.wpm:.0f} words per minute")
            print(f"🎭  Turn Emotion:    {metrics.emotion.value.title()}")
            print(f"💯  Fluency Score:   {metrics.fluency_score}%")
            print("-" * 40)
            
            summary = analyzer.get_session_summary()
            print("\n" + analyzer.format_session_display(summary))

        except Exception as e:
            print(f"❌ Analysis FAILED: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("⚠️ Skipped analysis because transcript is empty. Try speaking louder.")

if __name__ == "__main__":
    asyncio.run(main())
