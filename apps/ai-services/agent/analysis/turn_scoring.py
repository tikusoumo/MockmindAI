"""Shared scoring, filler, and coaching helpers for per-turn analysis."""

from __future__ import annotations

from .audio_analyzer import AudioAnalysisResult, EmotionState
from .speech_analyzer import FILLER_WORDS

# Filler sounds that STT might transcribe differently.
FILLER_SOUNDS = {
    "umm",
    "um",
    "uh",
    "uhh",
    "hmm",
    "hm",
    "mmm",
    "mm",
    "ahh",
    "ah",
    "err",
    "er",
    "ehh",
    "eh",
    "aah",
}

# Merge with text-based fillers for comprehensive detection.
ALL_FILLERS = FILLER_WORDS | FILLER_SOUNDS


def calculate_fluency(
    wpm: float,
    filler_ratio: float,
    pause_count: int,
    pitch_stability: float,
) -> float:
    """Compute a turn-level fluency score on a 0-100 scale."""
    score = 70.0
    if wpm < 80 or wpm > 200:
        score -= 15
    elif wpm < 100 or wpm > 170:
        score -= 5

    score -= filler_ratio * 100

    if pause_count > 4:
        score -= 10

    score += pitch_stability * 15
    return max(0, min(100, score))


def calculate_overall(
    fluency: float,
    confidence: float,
    filler_ratio: float,
) -> float:
    """Compute weighted overall score from fluency/confidence/filler ratio."""
    filler_free = max(0, 100 - filler_ratio * 200)
    return fluency * 0.4 + confidence * 100 * 0.4 + filler_free * 0.2


def generate_feedback(
    audio: AudioAnalysisResult,
    filler_count: int,
    wpm: float,
    fluency: float,
) -> str:
    """Generate concise turn-level coaching feedback."""
    hints: list[str] = []
    if audio.emotion == EmotionState.NERVOUS:
        hints.append("Take a deep breath, you're doing great")
    if filler_count > 3:
        hints.append("Try pausing instead of using filler words")
    if wpm > 180:
        hints.append("Slow down a bit for clarity")
    elif wpm < 90:
        hints.append("Try to speak a bit more naturally")
    if audio.energy_level == "low":
        hints.append("Project your voice with more energy")
    if not hints:
        hints.append("Good pace and clarity, keep it up!")
    return ". ".join(hints) + "."


def generate_coaching_summary(
    fluency: float,
    confidence: float,
    nervousness: float,
    fillers: int,
    conf_trend: str,
    filler_trend: str,
    dominant: EmotionState,
) -> str:
    """Generate session-level coaching summary text."""
    parts: list[str] = []
    if dominant == EmotionState.NERVOUS:
        parts.append(
            "You showed signs of nervousness. Practice deep breathing before answers."
        )
    elif dominant == EmotionState.CONFIDENT:
        parts.append("Great confidence throughout! Your delivery was strong.")

    if conf_trend == "improving":
        parts.append(
            "Your confidence grew as the interview progressed - great job warming up!"
        )
    elif conf_trend == "declining":
        parts.append(
            "Your confidence dipped towards the end. Stay focused and trust your preparation."
        )

    if filler_trend == "improving":
        parts.append("Filler word usage decreased over time - excellent self-correction!")
    elif fillers > 10:
        parts.append(f"You used {fillers} filler words. Try replacing them with brief pauses.")

    if not parts:
        parts.append("Solid performance overall. Keep practicing to build consistency.")

    return " ".join(parts)
