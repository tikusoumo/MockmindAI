"""Terminal CV Test — Combined Voice + Webcam Interview Scorer

Tests the full CV + Voice scoring pipeline locally using your webcam
and microphone. Mirrors the structure of terminal_chat.py.

Usage:
    # Text input + webcam (no mic required)
    python terminal_cv.py

    # Full voice + webcam
    python terminal_cv.py --voice

    # Text only (no webcam)
    python terminal_cv.py --no-cam
"""

import asyncio
import sys
import os
import io
import re
import wave
import time
import argparse
import threading
from collections import deque
from pathlib import Path
from typing import Any, cast

import numpy as np
from dotenv import load_dotenv

from agent.settings import settings

settings.use_local_ai = True
load_dotenv()


def parse_args():
    parser = argparse.ArgumentParser(description="Terminal CV + Voice Interview Scorer")
    parser.add_argument("--voice", action="store_true", help="Enable microphone input (instead of typing)")
    parser.add_argument("--no-cam", action="store_true", help="Disable webcam (voice/text only)")
    parser.add_argument("--fps", type=int, default=10, help="Webcam capture FPS for analysis (default: 10)")
    parser.add_argument("--cam-id", type=int, default=0, help="Webcam device index (default: 0)")
    parser.add_argument("--visual-debug", action="store_true", help="Draw eye tracking landmarks on the video feed")
    return parser.parse_args()


# ---------------------------------------------------------------------------

class WebcamCapture:
    """Captures frames from webcam.

    Two background threads:
    1. _capture_loop    — reads camera at native fps, displays the HUD window
    2. _live_analysis_loop — runs CVAnalyzer every _analysis_interval seconds
                             on recent frames, updating live_cv_data for the HUD
    """

    def __init__(self, device_id: int = 0, fps: int = 10, analysis_interval: float = 1.5, visual_debug: bool = False):
        self.device_id = device_id
        self.fps = fps
        self._analysis_interval = analysis_interval   # seconds between live CV runs
        self.visual_debug = visual_debug
        self._frames: deque = deque(maxlen=fps * 30)  # rolling buffer
        self._running = False
        self._thread: threading.Thread | None = None
        self._analysis_thread: threading.Thread | None = None
        self.available = False

        # Updated by _live_analysis_loop continuously
        self.live_cv_data: dict = {}

        # Updated after each scored turn
        self.last_debug: dict = {}
        self.last_score: float | None = None

    def update_debug(self, combined_score_obj):
        """Call after each scored turn to update voice/combined metrics."""
        s = combined_score_obj
        self.last_score = s.combined_score
        self.last_debug = {
            "combined":  s.combined_score,
            "voice":     s.voice_score,
            "cv":        s.cv_score,
            "fluency":   s.fluency_score,
            "v_conf":    s.voice_confidence,
            "filler_ok": s.filler_free_score,
            "pace":      s.pace_score,
            "turn":      s.turn_number,
        }

    def start(self):
        try:
            import cv2
            cap = cv2.VideoCapture(self.device_id)
            if not cap.isOpened():
                print("⚠️  Webcam not found — running in voice-only mode")
                return False
            cap.release()
            self.available = True
            self._running = True

            self._thread = threading.Thread(target=self._capture_loop, daemon=True)
            self._thread.start()

            self._analysis_thread = threading.Thread(target=self._live_analysis_loop, daemon=True)
            self._analysis_thread.start()

            print(f"📹 Webcam started (device {self.device_id}) — live CV analysis every {self._analysis_interval}s")
            return True
        except ImportError:
            print("⚠️  OpenCV not installed — running in voice-only mode")
            return False

    def _live_analysis_loop(self):
        """Background thread: continuously runs CVAnalyzer on recent frames.

        Creates the analyzer ONCE at thread start to avoid MediaPipe thread-safety
        issues (re-creating mp.solutions objects in daemon threads is not supported).
        """
        from agent.analysis.cv_analyzer import CVAnalyzer, Rating

        def rating_to_pct(r: Rating) -> float:
            return {Rating.EXCELLENT: 1.0, Rating.GOOD: 0.75, Rating.POOR: 0.40}.get(r, 0.6)

        # Create once — reuse for all cycles
        try:
            analyzer = CVAnalyzer()
        except Exception as e:
            print(f"⚠️  CV live analysis could not start: {e}")
            return

        while self._running:
            frames = list(self._frames)
            if not frames:
                time.sleep(0.5)   # brief pause when buffer empty, try again soon
                continue

            # Analyse last 2s worth of frames
            recent = frames[-max(1, int(self.fps * 2)):]
            try:
                result = analyzer.analyze_frames(recent)
                b = result.behavioral
                face_pct = float(result.face_detected_percentage)
                
                if face_pct == 0.0:
                    self.live_cv_data = {
                        "eye":      0.0,
                        "cv_conf":  0.0,
                        "posture":  0.0,
                        "engage":   0.0,
                        "face_pct": 0.0,
                        "eye_raw":  b.eye_contact.value,
                        "pos_raw":  b.posture_quality.value,
                    }
                else:
                    self.live_cv_data = {
                        "eye":      rating_to_pct(b.eye_contact),
                        "cv_conf":  float(b.confidence_score),
                        "posture":  rating_to_pct(b.posture_quality),
                        "engage":   float(b.engagement_score),
                        "face_pct": face_pct,
                        "eye_raw":  b.eye_contact.value,
                        "pos_raw":  b.posture_quality.value,
                    }
            except Exception as e:
                self.live_cv_data.setdefault("_error", str(e))

            # Wait before next analysis cycle
            time.sleep(self._analysis_interval)

        # Clean up analyzer when thread exits
        try:
            analyzer.close()
        except Exception:
            pass


    def _capture_loop(self):
        import cv2
        cap = cv2.VideoCapture(self.device_id)

        face_mesh = None
        if self.visual_debug:
            try:
                # MediaPipe 0.10.10 on Windows often requires explicit python solutions import
                from mediapipe.python.solutions import face_mesh as mp_face_mesh
                face_mesh = mp_face_mesh.FaceMesh(
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5
                )
            except (ImportError, AttributeError) as e:
                try:
                    import mediapipe.solutions.face_mesh as mp_face_mesh
                    face_mesh = mp_face_mesh.FaceMesh(
                        max_num_faces=1,
                        refine_landmarks=True,
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5
                    )
                except Exception:
                    print(f"⚠️ MediaPipe visual debugging init failed: {e}")
            except Exception as e:
                print(f"⚠️ MediaPipe visual debugging unexpected error: {e}")

        # Display always runs at native camera speed (~30fps)
        # Analysis buffer is sampled at self.fps rate
        cam_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        sample_every = max(1, int(cam_fps / self.fps))  # e.g. every 3rd frame @ 30fps → 10fps analysis
        frame_count: int = 0

        while self._running:
            ret, frame = cap.read()
            if not ret:
                continue

            frame_count = cast(int, frame_count) + 1

            # Only add to analysis buffer at analysis FPS
            if frame_count % sample_every == 0:
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                self._frames.append(frame_rgb)

            h, w = frame.shape[:2]
            preview = frame.copy()

            if face_mesh:
                rgb_for_debug = cv2.cvtColor(preview, cv2.COLOR_BGR2RGB)
                res = face_mesh.process(rgb_for_debug)
                if res.multi_face_landmarks:
                    for face_landmarks in res.multi_face_landmarks:
                        for idx in [468, 473]:  # Left and right iris
                            lm = face_landmarks.landmark[idx]
                            cx, cy = int(lm.x * w), int(lm.y * h)
                            cv2.circle(preview, (cx, cy), 3, (0, 255, 0), -1)
                            cv2.circle(preview, (cx, cy), 7, (0, 255, 0), 2)
                        # Add a text indicator that tracking is active
                        cv2.putText(preview, "EYE TRACKING ACTIVE", (10, 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

            # --- Semi-transparent dark panel on the right side ---
            panel_w = 270
            overlay = preview.copy()
            cv2.rectangle(overlay, (w - panel_w, 0), (w, h), (20, 20, 20), -1)
            cv2.addWeighted(overlay, 0.65, preview, 0.35, 0, preview)

            # --- Helper to draw a metric row ---
            def row(label, value_0_1, y, weight_str=""):
                pct = int(value_0_1 * 100)
                # Color: green ≥70, yellow ≥50, red <50
                if pct >= 70:
                    color = (0, 220, 80)
                elif pct >= 50:
                    color = (0, 200, 255)
                else:
                    color = (50, 50, 255)

                deduction = ""
                if pct < 50:
                    deduction = "  ▼ LOW"
                elif pct < 70:
                    deduction = "  ~ OK"

                cv2.putText(preview, f"{label:<12} {pct:>3}% {weight_str}{deduction}",
                            (w - panel_w + 6, y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1)

            def bar(value_0_1, y, bar_w=170):
                """Draw a thin colored progress bar."""
                filled = int(value_0_1 * bar_w)
                pct = value_0_1
                color = (0, 220, 80) if pct >= 0.7 else ((0, 200, 255) if pct >= 0.5 else (50, 50, 255))
                cv2.rectangle(preview, (w - panel_w + 6, y), (w - panel_w + 6 + bar_w, y + 5), (60, 60, 60), -1)
                cv2.rectangle(preview, (w - panel_w + 6, y), (w - panel_w + 6 + filled, y + 5), color, -1)

            # --- Title ---
            d = self.last_debug        # voice + combined (per-turn)
            cv = self.live_cv_data     # CV metrics (live, updates every ~1.5s)

            turn_txt = f"Turn {d.get('turn', '-')}" if d else "Waiting..."
            cv2.putText(preview, "SCORE DEBUG HUD", (w - panel_w + 6, 20),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)
            cv2.putText(preview, turn_txt, (w - panel_w + 6, 38),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (180, 180, 180), 1)
            cv2.line(preview, (w - panel_w, 45), (w, 45), (80, 80, 80), 1)

            # --- Combined headline (only after first turn) ---
            if d:
                cv2.putText(preview, f"COMBINED: {d['combined']:.0f}/100",
                            (w - panel_w + 6, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                            (0, 220, 255), 2)
                bar(d['combined'] / 100, 70)
                cv2.putText(preview, f"Voice({int(60)}%) {d['voice']:.0f}  CV({int(40)}%) {d['cv']:.0f}",
                            (w - panel_w + 6, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (200, 200, 200), 1)
            else:
                cv2.putText(preview, "COMBINED: ---/100", (w - panel_w + 6, 65),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.65, (100, 100, 100), 1)
                cv2.putText(preview, "Answer first question to start", (w - panel_w + 6, 88),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.35, (120, 120, 120), 1)
            cv2.line(preview, (w - panel_w, 95), (w, 95), (60, 60, 60), 1)

            # --- CV Block (LIVE — always updating) ---
            live_tag = " [LIVE]" if cv else " [waiting]"
            cv2.putText(preview, f"COMPUTER VISION  (40%){live_tag}",
                        (w - panel_w + 6, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.40,
                        (0, 220, 140) if cv else (120, 120, 120), 1)

            if cv:
                row("Eye Contact",   cv['eye'],     125, "w:40%")
                bar(cv['eye'], 130)
                row("CV Confidence", cv['cv_conf'], 148, "w:35%")
                bar(cv['cv_conf'], 153)
                row("Posture",       cv['posture'], 171, "w:15%")
                bar(cv['posture'], 176)
                row("Engagement",    cv['engage'],  194, "w:10%")
                bar(cv['engage'], 199)
                face_color = (0, 200, 0) if cv['face_pct'] > 70 else (50, 50, 255)
                cv2.putText(preview, f"  Face visible: {cv['face_pct']:.0f}%",
                            (w - panel_w + 6, 215), cv2.FONT_HERSHEY_SIMPLEX, 0.38, face_color, 1)
            else:
                for yi, msg in enumerate(["Analysing your face...", "(updates every 1.5s)"], start=0):
                    cv2.putText(preview, msg, (w - panel_w + 6, 130 + yi * 18),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (120, 120, 120), 1)

            cv2.line(preview, (w - panel_w, 222), (w, 222), (60, 60, 60), 1)

            # --- Voice Block (PER-TURN) ---
            cv2.putText(preview, "VOICE ANALYSIS   (60%)",
                        (w - panel_w + 6, 237), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (100, 255, 160), 1)
            if d:
                row("Fluency",     d['fluency'] / 100, 252, "w:35%")
                bar(d['fluency'] / 100, 257)
                row("Confidence",  d['v_conf'],         270, "w:35%")
                bar(d['v_conf'], 275)
                row("Filler-Free", d['filler_ok'],      288, "w:15%")
                bar(d['filler_ok'], 293)
                row("Pace",        d['pace'],            306, "w:15%")
                bar(d['pace'], 311)
            else:
                cv2.putText(preview, "  (after first answer)", (w - panel_w + 6, 260),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.40, (100, 100, 100), 1)
            cv2.line(preview, (w - panel_w, 320), (w, 320), (60, 60, 60), 1)

            # --- Deductions (combines both live CV + last voice) ---
            cv2.putText(preview, "DEDUCTIONS:", (w - panel_w + 6, 335),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 150, 50), 1)
            deductions = []
            if cv:
                if cv['eye'] < 0.5:     deductions.append(f"Eye contact  -{(0.5-cv['eye'])*40*0.4:.0f}pts")
                if cv['cv_conf'] < 0.5: deductions.append(f"CV Confidence -{(0.5-cv['cv_conf'])*35*0.4:.0f}pts")
                if cv['posture'] < 0.5: deductions.append(f"Posture      -{(0.5-cv['posture'])*15*0.4:.0f}pts")
            if d:
                if d['fluency'] < 50:   deductions.append(f"Fluency      -{(50-d['fluency'])*0.35:.0f}pts")
                if d['filler_ok'] < 0.5: deductions.append(f"Fillers      -{(0.5-d['filler_ok'])*15*0.6:.0f}pts")
                if d['pace'] < 0.5:     deductions.append(f"Pace         -{(0.5-d['pace'])*15*0.6:.0f}pts")
            if not deductions:
                deductions = ["None so far!" if (cv or d) else "Waiting for data..."]
            for i, ded in enumerate(deductions[:4]):
                is_ok = ded.startswith("None")
                cv2.putText(preview, f"  {ded}", (w - panel_w + 6, 352 + i * 16),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.37,
                            (60, 200, 100) if is_ok else (80, 80, 255), 1)

            # --- Footer ---
            cv2.putText(preview, "Q = quit", (w - panel_w + 6, h - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (120, 120, 120), 1)
            cv2.putText(preview, f"Buf: {len(self._frames)}fr", (w - 80, h - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (100, 100, 100), 1)

            cv2.imshow("Interview CV Monitor", preview)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                self._running = False
                break

        if face_mesh is not None:
            try:
                face_mesh.close()
            except Exception:
                pass
            
        cap.release()
        cv2.destroyAllWindows()

    def pop_frames(self) -> list:
        """Return and clear buffered frames for this turn."""
        frames = list(self._frames)
        self._frames.clear()
        return frames

    def stop(self):
        self._running = False


# ---------------------------------------------------------------------------
# CV analysis helper (runs synchronously — called between turns)
# ---------------------------------------------------------------------------

def analyze_cv(frames: list):
    """Analyze webcam frames and return CVAnalysisResult or None."""
    if not frames:
        return None
    try:
        from agent.analysis.cv_analyzer import CVAnalyzer
        analyzer = CVAnalyzer()
        result = analyzer.analyze_frames(frames)
        analyzer.close()
        return result
    except Exception as e:
        print(f"⚠️  CV analysis error: {e}")
        return None


# ---------------------------------------------------------------------------
# Main text loop (typed input)
# ---------------------------------------------------------------------------

async def run_text_mode(webcam: WebcamCapture, args):
    from agent.voice_agent import create_model_components
    from agent.analysis.turn_analyzer import TurnAnalyzer
    from agent.analysis.combined_scorer import CombinedScorer
    from livekit.agents.llm import ChatContext

    _, llm, _ = create_model_components(settings)
    chat_ctx = ChatContext()
    chat_ctx.add_message(role="system", content=(
        "You are a professional interview coach. Ask interview questions, "
        "listen to answers, and give constructive feedback. Keep answers concise."
    ))

    turn_analyzer = TurnAnalyzer()
    scorer = turn_analyzer.combined_scorer  # reuse the same scorer instance

    from datetime import datetime
    started_at = datetime.now()

    print("\n" + "=" * 60)
    print("💬 CV + Voice Text Mode — Type your answers")
    print("    (Webcam analysis runs after each turn)")
    print("    Type 'quit' to exit and see final report")
    print("=" * 60)

    # Kick off with first question
    chat_ctx.add_message(role="user", content="Please start the interview.")
    print("\n🤖 Interviewer: ", end="", flush=True)
    full_q: str = ""
    try:
        stream = llm.chat(chat_ctx=chat_ctx)
        if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
            stream = await stream
        async for chunk in stream:
            content: str = _extract_content(chunk)
            if content:
                print(content, end="", flush=True)
                full_q = cast(str, full_q) + content
        print()
        chat_ctx.add_message(role="assistant", content=full_q)
    except Exception as e:
        print(f"\n❌ LLM error: {e}")

    while True:
        try:
            user_input = input("\n👤 You: ").strip()
        except (KeyboardInterrupt, EOFError):
            break

        if not user_input or user_input.lower() in ("quit", "exit", "q"):
            break

        # --- CV: grab frames captured during this answer ---
        frames = webcam.pop_frames() if webcam.available else []
        cv_result = analyze_cv(frames) if frames else None

        # --- Voice metrics: use dummy silent audio for text mode ---
        # We analyse the text only (no real audio in text mode)
        dummy_audio = np.zeros(16000, dtype=np.float32)
        turn_metrics = turn_analyzer.analyze_turn(dummy_audio, user_input, 16000, cv_result)

        combined_score = turn_analyzer.combined_scorer.turn_scores[-1]
        webcam.update_debug(combined_score)  # refresh debug HUD
        print(f"\n  {turn_analyzer.combined_scorer.format_turn_display(combined_score)}")

        # --- LLM reply ---
        chat_ctx.add_message(role="user", content=user_input)
        print("\n🤖 Interviewer: ", end="", flush=True)
        full_resp: str = ""
        try:
            stream = llm.chat(chat_ctx=chat_ctx)
            if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                stream = await stream
            async for chunk in stream:
                content: str = _extract_content(chunk)
                if content:
                    print(content, end="", flush=True)
                    full_resp = cast(str, full_resp) + content
            print()
            chat_ctx.add_message(role="assistant", content=full_resp)
        except Exception as e:
            print(f"\n❌ LLM error: {e}")

    _print_final_report(turn_analyzer, chat_ctx, started_at)


# ---------------------------------------------------------------------------
# Main voice loop (microphone input)
# ---------------------------------------------------------------------------

async def run_voice_mode(webcam: WebcamCapture, args):
    import sounddevice as sd
    import requests
    from agent.voice_agent import create_model_components
    from agent.analysis.turn_analyzer import TurnAnalyzer
    from livekit.agents.llm import ChatContext
    from livekit.rtc import AudioFrame
    from livekit.plugins import silero
    from livekit.plugins.silero import onnx_model

    stt, llm, _ = create_model_components(settings)
    turn_analyzer = TurnAnalyzer()

    chat_ctx = ChatContext()
    chat_ctx.add_message(role="system", content=(
        "You are a professional interview coach. Ask interview questions and give "
        "constructive feedback. Keep responses short and natural for voice."
    ))

    vad_plugin = silero.VAD.load()
    model = onnx_model.OnnxModel(
        onnx_session=vad_plugin._onnx_session, sample_rate=16000
    )

    playback_queue = asyncio.Queue()
    playing = False
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
                    await asyncio.sleep(len(audio_array) / sample_rate)
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
                print(f"❌ Playback error: {e}")
                playing = False

    worker_task = asyncio.create_task(playback_worker())

    async def speak(text: str):
        clean = re.sub(r'[^\x00-\x7F]+', '', text).replace("*", "").replace("#", "").strip()
        if not clean:
            return
        url = f"{settings.kokoro_base_url}/audio/speech"
        try:
            res = __import__('requests').post(
                url,
                json={"model": "kokoro", "input": clean, "voice": "af_sky", "response_format": "wav"},
                timeout=12,
            )
            if res.status_code == 200:
                with io.BytesIO(res.content) as wav_io:
                    with wave.open(wav_io, 'rb') as wf:
                        sr = wf.getframerate()
                        arr = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
                        await playback_queue.put((arr, sr))
        except Exception as e:
            print(f"❌ TTS error: {e}")

    # VAD state
    is_speaking = False
    speech_frames = []
    silence_counter = 0
    interrupt_counter = 0
    SILENCE_THRESHOLD = 20
    inference_f32 = np.empty(512, dtype=np.float32)

    from datetime import datetime
    started_at = datetime.now()

    def audio_callback(indata, frames, time_info, status):
        nonlocal is_speaking, speech_frames, silence_counter, playing
        nonlocal interrupt_counter, current_playback_task
        chunk = indata.copy()
        try:
            np.divide(chunk.flatten(), 32768.0, out=inference_f32, dtype=np.float32)
            prob = model(inference_f32)
            if prob > 0.4:
                if playing or not playback_queue.empty():
                    interrupt_counter += 1
                    if interrupt_counter > 2:
                        if current_playback_task:
                            current_playback_task.cancel()
                        sd.stop()
                        while not playback_queue.empty():
                            try: playback_queue.get_nowait()
                            except: break
                        playing = False
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
            pass

    print("\n" + "=" * 60)
    print("🎙️  CV + Voice Mode — Speak your answers")
    print("    Press Ctrl+C to end and see final report")
    print("=" * 60)

    with sd.InputStream(samplerate=16000, channels=1, dtype=np.int16,
                        blocksize=512, callback=audio_callback):
        try:
            while True:
                if is_speaking and silence_counter > SILENCE_THRESHOLD:
                    is_speaking = False
                    recorded = np.concatenate(speech_frames)
                    speech_frames.clear()
                    silence_counter = 0

                    print("[System] Processing...")

                    int_data = recorded.astype(np.int16)
                    frame = AudioFrame(
                        data=int_data.tobytes(),
                        sample_rate=16000,
                        num_channels=1,
                        samples_per_channel=len(int_data),
                    )

                    try:
                        stt_res = await stt.recognize(buffer=frame)
                        user_text = stt_res.alternatives[0].text if stt_res.alternatives else ""
                        if not user_text.strip():
                            continue
                    except Exception as e:
                        print(f"❌ STT error: {e}")
                        continue

                    print(f"\n👤 You: {user_text}", flush=True)

                    # CV analysis
                    frames = webcam.pop_frames() if webcam.available else []
                    cv_result = analyze_cv(frames) if frames else None

                    # Combined turn analysis
                    turn_metrics = turn_analyzer.analyze_turn(
                        recorded.astype(np.float32) / 32768.0,
                        user_text,
                        16000,
                        cv_result,
                    )
                    combined_score = turn_analyzer.combined_scorer.turn_scores[-1]
                    webcam.update_debug(combined_score)  # refresh debug HUD
                    print(f"  {turn_analyzer.combined_scorer.format_turn_display(combined_score)}")


                    # LLM
                    chat_ctx.add_message(role="user", content=user_text)
                    print("🤖 Interviewer: ", end="", flush=True)
                    full_resp: str = ""
                    sentence_buf: str = ""
                    try:
                        stream = llm.chat(chat_ctx=chat_ctx)
                        if asyncio.iscoroutine(stream) or hasattr(stream, '__await__'):
                            stream = await stream
                        async for chunk in stream:
                            content: str = _extract_content(chunk)
                            if content:
                                print(content, end="", flush=True)
                                full_resp = cast(str, full_resp) + content
                                sentence_buf = cast(str, sentence_buf) + content
                                if any(p in sentence_buf for p in ".!?\n"):
                                    parts = re.split(r'([.!?\n])', sentence_buf)
                                    if len(parts) > 2:
                                        asyncio.create_task(speak("".join(parts[:2])))
                                        sentence_buf = "".join(parts[2:])
                        if sentence_buf.strip():
                            asyncio.create_task(speak(sentence_buf))
                        chat_ctx.add_message(role="assistant", content=full_resp)
                    except Exception as e:
                        print(f"\n❌ LLM error: {e}")
                    print()

                await asyncio.sleep(0.01)

        except KeyboardInterrupt:
            worker_task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(worker_task), timeout=1.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            _print_final_report(turn_analyzer, chat_ctx, started_at)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _extract_content(chunk: Any) -> str:
    if hasattr(chunk, 'choices') and chunk.choices:
        delta = chunk.choices[0].delta
        return str(getattr(delta, 'content', getattr(delta, 'text', "")) or "")
    if hasattr(chunk, 'text'):
        return str(chunk.text or "")
    if hasattr(chunk, 'delta') and hasattr(chunk.delta, 'content'):
        return str(chunk.delta.content or "")
    return ""


def _print_final_report(turn_analyzer, chat_ctx=None, start_time=None):
    scorer = turn_analyzer.combined_scorer
    if not scorer.turn_scores:
        print("\n[No turns recorded — no report to show]")
        return

    # Voice summary
    voice_summary = turn_analyzer.get_session_summary()
    print(turn_analyzer.format_session_display(voice_summary))

    # Combined final score
    final = scorer.finalize_session()
    print(scorer.format_session_display(final))

    # Database Persistence
    if chat_ctx:
        print("\n[System] Generating comprehensive LLM Report and Saving to Database...")
        try:
            import httpx
            from datetime import datetime
            from agent.session_collector import SessionData, SessionMetadata, TranscriptEntry, SpeakerRole
            from agent.analysis.report_generator import ReportGenerator

            transcript = []
            current_time = 0.0
            
            for msg in chat_ctx.messages:
                if msg.role == "system":
                    continue
                speaker = SpeakerRole.INTERVIEWER if msg.role == "assistant" else SpeakerRole.CANDIDATE
                text = msg.content if isinstance(msg.content, str) else str(msg.content)
                transcript.append(TranscriptEntry(speaker, text, current_time))
                current_time += 15.0  # approximate time spacing
                
            session = SessionData(
                metadata=SessionMetadata(
                    room_name="terminal_session",
                    template_id="terminal_cv",
                    template_title="Terminal CV Analysis",
                    mode="strict",
                    started_at=start_time or datetime.now(),
                    ended_at=datetime.now()
                ),
                transcript=transcript
            )
            
            generator = ReportGenerator()
            report = generator.generate(session)
            report_dict = report.to_dict()
            
            # Post to NestJS API
            print("  -> Pushing report to NestJS Database (http://localhost:8000/api/report)...")
            res = httpx.post("http://localhost:8000/api/report", json=report_dict, timeout=10.0)
            if res.status_code in (200, 201):
                print("  ✅ Report successfully saved! You can now view it on the Next.js Dashboard.")
            else:
                print(f"  ❌ Failed to save report (HTTP {res.status_code})")
                
        except Exception as e:
            print(f"  ❌ Error generating/saving report: {e}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def main():
    args = parse_args()

    print("=" * 60)
    print("🎯 TERMINAL CV — Combined Interview Scorer")
    print("   Voice + Computer Vision + Scoring Formula")
    print("=" * 60)

    # Start webcam
    webcam = WebcamCapture(device_id=args.cam_id, fps=args.fps, visual_debug=args.visual_debug)
    if not args.no_cam:
        webcam.start()
    else:
        print("🚫 Webcam disabled (--no-cam)")

    try:
        if args.voice:
            await run_voice_mode(webcam, args)
        else:
            await run_text_mode(webcam, args)
    finally:
        webcam.stop()


if __name__ == "__main__":
    asyncio.run(main())
