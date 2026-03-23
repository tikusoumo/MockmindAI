import asyncio
import os
import sys
import numpy as np
import sounddevice as sd
import requests
import io
import wave
from dotenv import load_dotenv
from agent.settings import settings
from agent.voice_agent import create_model_components
from livekit.agents.llm import ChatContext, ChatMessage

# Force USE_LOCAL_AI since this is specifically a local models test
settings.use_local_ai = True

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
    print("=" * 50)
    print("🤖 TERMINAL INTERFACE: Continuous Local AI Assistant")
    print("=" * 50)
    print("\n[System] Initializing VAD and Model connections...")
    
    try:
        from livekit.plugins import silero
        vad_plugin = silero.VAD.load()
        # Silero VAD is designed for streaming, but we can use its internal model for synchronous processing
        from livekit.plugins.silero import onnx_model
        model = onnx_model.OnnxModel(onnx_session=vad_plugin._onnx_session, sample_rate=16000)
        
        stt, llm, _ = create_model_components(settings)
        chat_ctx = ChatContext()
        chat_ctx.add_message(role="system", content="You are a helpful local AI assistant.")
        print("✅ Continuous mode ready! Just speak to the agent.")
        print("[System] Commands: Speak naturally, or press Ctrl+C to quit.")
    except Exception as e:
        print(f"❌ Initialization Failed: {e}")
        return

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
        nonlocal is_speaking, speech_frames, silence_counter, playing, interrupt_counter
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
                if playing:
                    interrupt_counter += 1
                    if interrupt_counter > 2: # ~64ms sustained
                        sd.stop() # Interrupt!
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
        except Exception as ve:
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
                    
                    print("[System] Processing turn...   ")
                    
                    # 1. Transcribe
                    from livekit.rtc import AudioFrame
                    int_data = recorded_audio.astype(np.int16)
                    frame = AudioFrame(
                        data=int_data.tobytes(),
                        sample_rate=16000,
                        num_channels=1,
                        samples_per_channel=len(int_data)
                    )
                    
                    print(f"[Debug] Turn finished. Frames captured: {len(recorded_audio)}")
                    print(f"[Debug] Sending to STT: {settings.whisper_base_url}")
                    
                    try:
                        stt_res = await stt.recognize(buffer=frame)
                        print(f"[Debug] STT Response Received. Type: {stt_res.type}", flush=True)
                        
                        user_text = ""
                        if stt_res.alternatives:
                            user_text = stt_res.alternatives[0].text
                            print(f"[Debug] Extracted text: '{user_text}'", flush=True)

                        if not user_text.strip():
                            print("[Debug] STT returned empty text.", flush=True)
                            continue
                            
                    except Exception as stt_err:
                        print(f"\n❌ STT Error: {stt_err}", flush=True)
                        continue

                    print(f"\n👤 You: {user_text}", flush=True)
                        
                    # 2. LLM Respond
                    full_response = "" 
                    try:
                        chat_ctx.add_message(role="user", content=user_text)
                        print(f"[Debug] Message added to context. Total messages: {len(chat_ctx.messages())}", flush=True)
                        
                        print("🤖 Agent: ", end="", flush=True)
                        
                        print(f"[Debug] Contacting LLM: {settings.llama_base_url} (model: {settings.llama_model})", flush=True)
                        
                        # Use a timeout or simple check
                        stream = llm.chat(chat_ctx=chat_ctx)
                        if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                            stream = await stream

                        print("[Debug] Stream opened, waiting for first chunk...", flush=True)
                        async for chunk in stream:
                            print(".", end="", flush=True) # Progress dot
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
                        
                        print("\n[Debug] Stream finished.", flush=True)
                    except Exception as turn_err:
                        print(f"\n❌ Turn Error: {turn_err}", flush=True)
                        import traceback
                        traceback.print_exc()
                    
                    print() # Newline after response

                    # 3. TTS Synthesis & Playback
                    if full_response.strip():
                        import re
                        clean_text = re.sub(r'[^\x00-\x7F]+', '', full_response)
                        clean_text = clean_text.replace("*", "").replace("#", "").strip()
                        
                        if clean_text:
                            url = f"{settings.kokoro_base_url}/audio/speech"
                            payload = {
                                "model": "kokoro",
                                "input": clean_text,
                                "voice": "af_sky",
                                "response_format": "wav"
                            }
                            
                            print(f"[Debug] TTS Request to: {url}")
                            try:
                                resp = requests.post(url, json=payload, timeout=30)
                                print(f"[Debug] TTS HTTP Status: {resp.status_code}")
                                if resp.status_code == 200:
                                    with wave.open(io.BytesIO(resp.content), 'rb') as wav:
                                        params = wav.getparams()
                                        frames = wav.readframes(params.nframes)
                                        audio_arr = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32767.0
                                        print(f"[Debug] Audio array size: {len(audio_arr)}")
                                        print("[System] Speaking...")
                                        playing = True
                                        sd.play(audio_arr, samplerate=params.framerate)
                                else:
                                    print(f"[System] TTS Error: {resp.status_code} - {resp.text}")
                            except Exception as te:
                                print(f"[System] TTS Exception: {te}")
                    
                    # Save context
                    chat_ctx.add_message(role="assistant", content=full_response)
                    print("\n[System] Ready for input...")

                await asyncio.sleep(0.1) # Main loop idle
                
                # Check for playback completion (crude but works for sd.play)
                # sd.get_stream() isn't standard; we'll assume it finished if 
                # we don't have a better way, or just let VAD interrupt it.
                # In most cases sd.play is enough for this simple script.

        except KeyboardInterrupt:
            print("\n[System] Exiting conversational loop...")

if __name__ == "__main__":
    print("\n[Debug] Available Audio Devices:")
    print(sd.query_devices())
    print(f"[Debug] Default Input Device: {sd.default.device[0]}")
    print(f"[Debug] Default Output Device: {sd.default.device[1]}")
    asyncio.run(main())
