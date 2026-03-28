"""Audio-level feature extraction and emotion detection.

Extracts acoustic features from raw audio to determine:
- Pitch (via zero-crossing rate as lightweight proxy)
- Energy (RMS amplitude)
- Speaking rate and pause patterns
- Tremor index (pitch instability)
- Emotional state classification

Uses only numpy — no heavy ML dependencies required.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import numpy as np


class EmotionState(str, Enum):
    CONFIDENT = "confident"
    NEUTRAL = "neutral"
    NERVOUS = "nervous"
    HESITANT = "hesitant"
    EXCITED = "excited"


EMOTION_EMOJI = {
    EmotionState.CONFIDENT: "💪",
    EmotionState.NEUTRAL: "😐",
    EmotionState.NERVOUS: "😰",
    EmotionState.HESITANT: "🤔",
    EmotionState.EXCITED: "🔥",
}


@dataclass
class AudioFeatures:
    """Extracted audio features from a speech segment."""
    pitch_mean: float          # Average zero-crossing rate (proxy for pitch)
    pitch_variance: float      # Variance in pitch — high = unstable voice
    energy_rms: float          # Root mean square energy
    energy_variance: float     # Energy consistency
    speaking_rate: float       # Estimated syllables per second
    pause_count: int           # Number of silence gaps detected
    pause_ratio: float         # Fraction of audio that is silence
    tremor_index: float        # Pitch instability metric (0-1)
    duration_seconds: float    # Total duration of the segment


@dataclass
class AudioAnalysisResult:
    """Complete audio analysis result for a speech segment."""
    features: AudioFeatures
    emotion: EmotionState
    confidence_score: float    # 0.0 to 1.0 — how confident the speaker sounds
    nervousness_score: float   # 0.0 to 1.0 — nervousness indicator
    energy_level: str          # "low", "normal", "high"


class AudioAnalyzer:
    """Analyzes raw audio for emotional and vocal features.
    
    Uses lightweight numpy-based signal processing:
    - Zero-crossing rate as pitch proxy
    - RMS for energy
    - Silence detection for pause analysis
    - Variance metrics for tremor/stability
    """

    def __init__(
        self,
        silence_threshold: float = 0.02,
        min_pause_duration: float = 0.3,
        frame_size: int = 1024,
    ):
        self.silence_threshold = silence_threshold
        self.min_pause_duration = min_pause_duration
        self.frame_size = frame_size

    def analyze(
        self,
        audio: np.ndarray,
        sample_rate: int = 16000,
    ) -> AudioAnalysisResult:
        """Analyze a speech segment for vocal features and emotion.
        
        Args:
            audio: Raw audio as numpy array (int16 or float32)
            sample_rate: Sample rate of the audio
            
        Returns:
            AudioAnalysisResult with features and emotion classification
        """
        # Normalize to float32 [-1, 1]
        if audio.dtype == np.int16:
            audio_f32 = audio.astype(np.float32) / 32768.0
        elif audio.dtype == np.float32:
            audio_f32 = audio.copy()
        else:
            audio_f32 = audio.astype(np.float32)

        # Flatten if multi-channel
        if audio_f32.ndim > 1:
            audio_f32 = audio_f32.flatten()

        duration = len(audio_f32) / sample_rate
        if duration < 0.1:
            return self._empty_result(duration)

        # Extract features
        features = self._extract_features(audio_f32, sample_rate, duration)

        # Classify emotion
        emotion, confidence, nervousness = self._classify_emotion(features)

        # Energy level
        if features.energy_rms < 0.03:
            energy_level = "low"
        elif features.energy_rms > 0.15:
            energy_level = "high"
        else:
            energy_level = "normal"

        return AudioAnalysisResult(
            features=features,
            emotion=emotion,
            confidence_score=round(confidence, 2),
            nervousness_score=round(nervousness, 2),
            energy_level=energy_level,
        )

    def _extract_features(
        self,
        audio: np.ndarray,
        sample_rate: int,
        duration: float,
    ) -> AudioFeatures:
        """Extract all audio features."""
        n_frames = max(1, len(audio) // self.frame_size)

        # --- Zero-Crossing Rate (pitch proxy) ---
        zcr_per_frame = []
        for i in range(n_frames):
            start = i * self.frame_size
            end = start + self.frame_size
            frame = audio[start:end]
            if len(frame) < 2:
                continue
            crossings = np.sum(np.abs(np.diff(np.sign(frame))) > 0)
            zcr = crossings / (2 * len(frame))
            zcr_per_frame.append(zcr)

        zcr_arr = np.array(zcr_per_frame) if zcr_per_frame else np.array([0.0])
        pitch_mean = float(np.mean(zcr_arr))
        pitch_variance = float(np.var(zcr_arr))

        # --- Energy (RMS) per frame ---
        rms_per_frame = []
        for i in range(n_frames):
            start = i * self.frame_size
            end = start + self.frame_size
            frame = audio[start:end]
            if len(frame) == 0:
                continue
            rms = float(np.sqrt(np.mean(frame ** 2)))
            rms_per_frame.append(rms)

        rms_arr = np.array(rms_per_frame) if rms_per_frame else np.array([0.0])
        energy_rms = float(np.mean(rms_arr))
        energy_variance = float(np.var(rms_arr))

        # --- Pause Detection ---
        pause_count, pause_ratio = self._detect_pauses(audio, sample_rate)

        # --- Speaking Rate (syllable estimation) ---
        # Approximate syllables by counting energy peaks above threshold
        speaking_rate = self._estimate_speaking_rate(audio, sample_rate)

        # --- Tremor Index ---
        # High-frequency variation in pitch = tremor
        if len(zcr_arr) > 4:
            zcr_diff = np.diff(zcr_arr)
            tremor_index = float(np.std(zcr_diff)) * 10  # Scale to 0-1 range
            tremor_index = min(1.0, tremor_index)
        else:
            tremor_index = 0.0

        return AudioFeatures(
            pitch_mean=round(pitch_mean, 4),
            pitch_variance=round(pitch_variance, 6),
            energy_rms=round(energy_rms, 4),
            energy_variance=round(energy_variance, 6),
            speaking_rate=round(speaking_rate, 1),
            pause_count=pause_count,
            pause_ratio=round(pause_ratio, 2),
            tremor_index=round(tremor_index, 3),
            duration_seconds=round(duration, 2),
        )

    def _detect_pauses(
        self,
        audio: np.ndarray,
        sample_rate: int,
    ) -> tuple[int, float]:
        """Detect silence pauses in the audio."""
        min_samples = int(self.min_pause_duration * sample_rate)
        is_silent = np.abs(audio) < self.silence_threshold

        # Find contiguous silence regions
        pause_count = 0
        total_pause_samples = 0
        current_silence = 0

        for silent in is_silent:
            if silent:
                current_silence += 1
            else:
                if current_silence >= min_samples:
                    pause_count += 1
                    total_pause_samples += current_silence
                current_silence = 0

        # Check trailing silence
        if current_silence >= min_samples:
            pause_count += 1
            total_pause_samples += current_silence

        pause_ratio = total_pause_samples / len(audio) if len(audio) > 0 else 0
        return pause_count, pause_ratio

    def _estimate_speaking_rate(
        self,
        audio: np.ndarray,
        sample_rate: int,
    ) -> float:
        """Estimate speaking rate in syllables per second."""
        # Use energy envelope peaks as syllable proxy
        hop = sample_rate // 20  # 50ms frames
        n_frames = max(1, len(audio) // hop)

        energy = []
        for i in range(n_frames):
            start = i * hop
            end = start + hop
            frame = audio[start:end]
            if len(frame) == 0:
                continue
            energy.append(np.sqrt(np.mean(frame ** 2)))

        if len(energy) < 3:
            return 0.0

        energy = np.array(energy)
        threshold = np.mean(energy) * 0.5

        # Count peaks (rising above threshold)
        peaks = 0
        above = False
        for e in energy:
            if e > threshold and not above:
                peaks += 1
                above = True
            elif e <= threshold:
                above = False

        duration = len(audio) / sample_rate
        return peaks / duration if duration > 0 else 0.0

    def _classify_emotion(
        self,
        features: AudioFeatures,
    ) -> tuple[EmotionState, float, float]:
        """Classify emotional state from audio features.
        
        Returns:
            (emotion, confidence_score, nervousness_score)
        """
        nervousness = 0.0
        confidence = 0.5

        # High pitch variance → nervous
        if features.pitch_variance > 0.005:
            nervousness += 0.3
        elif features.pitch_variance < 0.001:
            confidence += 0.1

        # High tremor → nervous
        nervousness += features.tremor_index * 0.3

        # Many pauses → hesitant
        if features.pause_count > 3:
            nervousness += 0.15
        elif features.pause_count <= 1:
            confidence += 0.1

        # High pause ratio → hesitant
        if features.pause_ratio > 0.3:
            nervousness += 0.1

        # Speaking rate extremes
        if features.speaking_rate > 5.0:  # Very fast
            nervousness += 0.15
        elif 2.5 <= features.speaking_rate <= 4.5:  # Normal range
            confidence += 0.15

        # High energy variance → unstable
        if features.energy_variance > 0.002:
            nervousness += 0.1

        # Strong, consistent energy → confident
        if features.energy_rms > 0.08 and features.energy_variance < 0.001:
            confidence += 0.2

        # Clamp
        nervousness = min(1.0, max(0.0, nervousness))
        confidence = min(1.0, max(0.0, confidence))

        # Determine emotion
        if nervousness > 0.6:
            emotion = EmotionState.NERVOUS
        elif nervousness > 0.35 and features.pause_count > 2:
            emotion = EmotionState.HESITANT
        elif confidence > 0.7 and features.speaking_rate > 4.0:
            emotion = EmotionState.EXCITED
        elif confidence > 0.6:
            emotion = EmotionState.CONFIDENT
        else:
            emotion = EmotionState.NEUTRAL

        return emotion, confidence, nervousness

    def _empty_result(self, duration: float) -> AudioAnalysisResult:
        """Return empty result for very short audio."""
        features = AudioFeatures(
            pitch_mean=0, pitch_variance=0, energy_rms=0, energy_variance=0,
            speaking_rate=0, pause_count=0, pause_ratio=0, tremor_index=0,
            duration_seconds=duration,
        )
        return AudioAnalysisResult(
            features=features,
            emotion=EmotionState.NEUTRAL,
            confidence_score=0.5,
            nervousness_score=0.0,
            energy_level="low",
        )
