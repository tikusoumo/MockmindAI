import asyncio
import os
import sys
import numpy as np
import sounddevice as sd
import requests
import io
import wave
import re
from dotenv import load_dotenv
from agent.settings import settings
from agent.voice_agent import create_model_components
from agent.analysis.turn_analyzer import TurnAnalyzer
from livekit.agents.llm import ChatContext, ChatMessage
from livekit.rtc import AudioFrame

# Force USE_LOCAL_AI since this is specifically a local models test
settings.use_local_ai = True

# CLI flags
GUIDE_MODE = "--guide" in sys.argv
if GUIDE_MODE:
    settings.guide_mode = True

# Load environment variables (pulls in the new BASE_URL overrides)
load_dotenv()

def play_audio(audio_data, sample_rate=24000):
    """Play a numpy array as audio (non-blocking)."""
    try:
        sd.play(audio_data, sample_rate)
    except Exception as e:
        print(f"\n[System] Playback Error: {e}")

async def record_audio(duration=5, sample_rate=16000):
    """Record audio from the microphone and return as a numpy array."""
    print(f"[System] Recording for {duration} seconds...")
    try:
        recording = sd.rec(int(duration * sample_rate), samplerate=sample_rate, channels=1, dtype='float32')
        sd.wait()
        return recording.flatten()
    except Exception as e:
        print(f"\n[System] Recording Error: {e}")
        return None

# --- Conversational Voice Loop ---
async def main():
    print("=" * 55)
    print("\U0001f916 TERMINAL INTERFACE: AI Interview Coach")
    if GUIDE_MODE:
        print("\U0001f9ed GUIDE MODE: Agent will coach you in real-time")
    print("=" * 55)
    print("\n[System] Initializing VAD, Models, and Analysis...")
    
    # Initialize turn analyzer
    turn_analyzer = TurnAnalyzer()
    
    try:
        from livekit.plugins import silero
        vad_plugin = silero.VAD.load()
        # Silero VAD is designed for streaming, but we can use its internal model for synchronous processing
        from livekit.plugins.silero import onnx_model
        model = onnx_model.OnnxModel(onnx_session=vad_plugin._onnx_session, sample_rate=16000)
        
        stt, llm, _ = create_model_components(settings)
        chat_ctx = ChatContext()
        
        system_prompt = """You are a professional AI interview coach. Help candidates practice interviews.
Keep responses concise and natural for voice conversation.
Do not use emojis, asterisks, or complex formatting."""
        if GUIDE_MODE:
            system_prompt += """\nYou are in GUIDE MODE. You will receive candidate analysis data.
Adapt your tone and responses based on their emotional state.
If they seem nervous, be encouraging. If they use many fillers, gently suggest pausing."""
        
        chat_ctx.add_message(role="system", content=system_prompt)
        print("\u2705 Ready! Speak naturally. Press Ctrl+C for session summary.")
    except Exception as e:
        print(f"❌ Initialization Failed: {e}")
        return
    
    # Multi-sentence playback queue
    playback_queue = asyncio.Queue()
    current_playback_task = None
    
    async def playback_worker():
        nonlocal playing, current_playback_task
        while True:
            try:
                item = await playback_queue.get()
                if not item: 
                    playback_queue.task_done()
                    continue
                audio_array, sample_rate = item
                
                async def _play():
                    nonlocal playing
                    playing = True
                    sd.play(audio_array, sample_rate)
                    duration = len(audio_array) / sample_rate
                    await asyncio.sleep(duration)
                    playing = False

                current_playback_task = asyncio.create_task(_play())
                try:
                    await current_playback_task
                except asyncio.CancelledError:
                    sd.stop()
                    playing = False
                finally:
                    current_playback_task = None
                    playback_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"❌ Playback Worker Error: {e}")
                playing = False

    # Start worker
    worker_task = asyncio.create_task(playback_worker())

    async def synthesize_and_enqueue(text):
        """Synthesize a single sentence and add to queue."""
        if not text.strip(): return
        clean_text = re.sub(r'[^\x00-\x7F]+', '', text)
        clean_text = clean_text.replace("*", "").replace("#", "").strip()
        if not clean_text: return

        url = f"{settings.kokoro_base_url}/audio/speech"
        payload = {
            "model": "kokoro",
            "input": clean_text,
            "voice": "af_sky",
            "response_format": "wav"
        }
        try:
            print(f"\n[Debug] TTS Request: '{clean_text[:40]}...'", flush=True)
            res = requests.post(url, json=payload, timeout=12)
            if res.status_code == 200:
                with io.BytesIO(res.content) as wav_io:
                    with wave.open(wav_io, 'rb') as wav_file:
                        sr = wav_file.getframerate()
                        audio_bytes = wav_file.readframes(wav_file.getnframes())
                        arr = np.frombuffer(audio_bytes, dtype=np.int16)
                        await playback_queue.put((arr, sr))
                        print(f" [Debug] Enqueued: {len(arr)} samples", flush=True)
            else:
                print(f"❌ TTS Error: {res.status_code}")
        except Exception as e:
            print(f"❌ TTS Failed: {e}")

    # Tracking states
    is_speaking = False
    speech_frames = []
    silence_counter = 0
    interrupt_counter = 0 # Track sustained speech to avoid harsh cuts
    SILENCE_THRESHOLD = 20  # ~640ms at 16kHz with 512 chunk (32ms per chunk)
    
    # Pre-allocate buffer for VAD
    inference_f32 = np.empty(512, dtype=np.float32)
    
    # Non-blocking audio queue for playback
    playing = False

    def audio_callback(indata, frames, time, status):
        nonlocal is_speaking, speech_frames, silence_counter, playing, interrupt_counter, current_playback_task
        if status:
            print(status, file=sys.stderr)
        
        chunk = indata.copy()
        try:
            # Normalize int16 to float32 [-1, 1] for Silero
            np.divide(chunk.flatten(), 32768.0, out=inference_f32, dtype=np.float32)
            
            # Run inference synchronously
            prob = model(inference_f32)
            
            # Diagnostic: show activity if significant
            if prob > 0.2:
                print(f"[Debug] VAD Prob: {prob:.2f} ", end="\r")

            # Speech likelihood
            if prob > 0.4: 
                # Hysteresis for interruption: must be sustained
                if playing or not playback_queue.empty():
                    interrupt_counter += 1
                    if interrupt_counter > 2: # ~64ms sustained
                        if current_playback_task:
                            current_playback_task.cancel()
                        
                        sd.stop() # Interrupt!
                        # Clear queue
                        while not playback_queue.empty():
                            try: playback_queue.get_nowait()
                            except: break
                        playing = False
                        print("\n[System] Interrupted!")
                        interrupt_counter = 0
                
                if not is_speaking:
                    is_speaking = True
                    print("\n[System] Listening...")
                
                speech_frames.append(chunk)
                silence_counter = 0
            else:
                interrupt_counter = 0
                if is_speaking:
                    speech_frames.append(chunk)
                    silence_counter += 1
        except Exception:
            # Avoid printing every frame error to not flood console
            pass

    # Open stream
    with sd.InputStream(samplerate=16000, channels=1, dtype=np.int16, 
                        blocksize=512, callback=audio_callback):
        try:
            while True:
                # Check if speech has finished
                if is_speaking and silence_counter > SILENCE_THRESHOLD:
                    # Capture state and reset
                    is_speaking = False
                    recorded_audio = np.concatenate(speech_frames)
                    speech_frames = []
                    silence_counter = 0
                    
                    print("[System] Processing turn...")
                    
                    # 1. Transcribe
                    int_data = recorded_audio.astype(np.int16)
                    frame = AudioFrame(
                        data=int_data.tobytes(),
                        sample_rate=16000,
                        num_channels=1,
                        samples_per_channel=len(int_data)
                    )
                    
                    try:
                        stt_res = await stt.recognize(buffer=frame)
                        user_text = stt_res.alternatives[0].text if stt_res.alternatives else ""
                        if not user_text.strip(): continue
                            
                    except Exception as stt_err:
                        print(f"\n\u274c STT Error: {stt_err}", flush=True)
                        continue

                    print(f"\n\U0001f464 You: {user_text}", flush=True)
                    
                    # 1.5 Speech Analysis (hybrid: audio + text)
                    turn_metrics = turn_analyzer.analyze_turn(
                        audio=recorded_audio,
                        transcript=user_text,
                        sample_rate=16000,
                    )
                    display = turn_analyzer.format_terminal_display(turn_metrics)
                    print(f"\U0001f4ca {display}", flush=True)
                        
                    # 2. LLM Respond
                    full_response = "" 
                    sentence_buffer = ""
                    try:
                        chat_ctx.add_message(role="user", content=user_text)
                        
                        # Guide Mode: inject candidate analysis into LLM context
                        if GUIDE_MODE:
                            guide_prompt = turn_analyzer.get_guide_prompt(turn_metrics)
                            chat_ctx.add_message(role="system", content=guide_prompt)
                        
                        print("\U0001f916 Agent: ", end="", flush=True)
                        
                        stream = llm.chat(chat_ctx=chat_ctx)
                        if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                            stream = await stream

                        async for chunk in stream:
                            content = ""
                            if hasattr(chunk, 'choices') and chunk.choices:
                                delta = chunk.choices[0].delta
                                content = getattr(delta, 'content', getattr(delta, 'text', ""))
                            elif hasattr(chunk, 'text'):
                                content = chunk.text
                            elif hasattr(chunk, 'delta') and hasattr(chunk.delta, 'content'):
                                content = chunk.delta.content

                            if content:
                                print(content, end="", flush=True)
                                full_response += content
                                sentence_buffer += content
                                
                                # Split by punctuation for streaming TTS
                                if any(p in sentence_buffer for p in ".!?\n"):
                                    # Split and take the first part
                                    import re
                                    parts = re.split(r'([.!?\n])', sentence_buffer)
                                    if len(parts) > 2:
                                        to_speak = "".join(parts[:2])
                                        sentence_buffer = "".join(parts[2:])
                                        asyncio.create_task(synthesize_and_enqueue(to_speak))
                        
                        # Final bit
                        if sentence_buffer.strip():
                            asyncio.create_task(synthesize_and_enqueue(sentence_buffer))
                        
                        chat_ctx.add_message(role="assistant", content=full_response)
                        print("\n[Debug] turn finished.", flush=True)
                    except Exception as turn_err:
                        print(f"\n\u274c Turn Error: {turn_err}")
                        import traceback
                        traceback.print_exc()
                    
                    print(flush=True) # Newline after response
                    print("\n[System] Ready for input...")

                await asyncio.sleep(0.01)
        except KeyboardInterrupt:
            # Print session summary on exit
            summary = turn_analyzer.get_session_summary()
            print(turn_analyzer.format_session_display(summary))
            worker_task.cancel()
            print("\n[System] Session ended.")

if __name__ == "__main__":
    print("\n[Debug] Available Audio Devices:")
    print(sd.query_devices())
    print(f"[Debug] Default Input Device: {sd.default.device[0]}")
    print(f"[Debug] Default Output Device: {sd.default.device[1]}")
    asyncio.run(main())
