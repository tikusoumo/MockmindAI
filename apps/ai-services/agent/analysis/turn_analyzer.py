"""Per-turn speech analysis orchestrator.

Combines AudioAnalyzer (audio features) and SpeechAnalyzer (text features)
into a unified per-turn analysis with real-time terminal display and
session-level accumulation for end-of-session reports.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .audio_analyzer import AudioAnalyzer, AudioAnalysisResult, EmotionState, EMOTION_EMOJI
from .speech_analyzer import SpeechAnalyzer
from .cv_analyzer import CVAnalysisResult
from .combined_scorer import CombinedScorer, CombinedTurnScore
from .turn_scoring import (
    ALL_FILLERS,
    calculate_fluency,
    calculate_overall,
    generate_coaching_summary,
    generate_feedback,
)


@dataclass
class TurnMetrics:
    """Per-turn analysis metrics."""
    turn_number: int
    timestamp: float               # Seconds from session start
    
    # Text metrics
    transcript: str
    word_count: int
    wpm: float
    filler_words: list[str]        # Fillers found in transcript
    filler_count: int
    filler_ratio: float            # Fillers / total words
    
    # Audio metrics
    emotion: EmotionState
    confidence_score: float
    nervousness_score: float
    energy_level: str
    pitch_stability: float         # 1.0 = stable, 0.0 = unstable
    pause_count: int
    speaking_rate: float           # Syllables per second
    
    # Composite scores
    fluency_score: float           # 0-100
    overall_score: float           # 0-100
    combined_score: float          # 0-100 — voice + CV weighted
    
    # Guide mode hint
    feedback_hint: str             # Coaching suggestion for LLM

    def to_dict(self) -> dict[str, Any]:
        return {
            "turn_number": self.turn_number,
            "timestamp": self.timestamp,
            "transcript": self.transcript,
            "word_count": self.word_count,
            "wpm": self.wpm,
            "filler_count": self.filler_count,
            "filler_ratio": round(self.filler_ratio, 2),
            "emotion": self.emotion.value,
            "confidence_score": self.confidence_score,
            "nervousness_score": self.nervousness_score,
            "energy_level": self.energy_level,
            "fluency_score": self.fluency_score,
            "overall_score": self.overall_score,
            "feedback_hint": self.feedback_hint,
        }


@dataclass
class SessionSummary:
    """Aggregated session-level analysis."""
    total_turns: int
    total_duration: float
    avg_fluency: float
    avg_confidence: float
    avg_nervousness: float
    total_fillers: int
    avg_wpm: float
    emotion_timeline: list[dict[str, Any]]
    dominant_emotion: EmotionState
    confidence_trend: str           # "improving", "declining", "stable"
    filler_trend: str               # "improving", "declining", "stable"
    top_fillers: list[tuple[str, int]]
    coaching_summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_turns": self.total_turns,
            "total_duration": round(self.total_duration, 1),
            "avg_fluency": round(self.avg_fluency, 1),
            "avg_confidence": round(self.avg_confidence, 2),
            "avg_nervousness": round(self.avg_nervousness, 2),
            "total_fillers": self.total_fillers,
            "avg_wpm": round(self.avg_wpm, 0),
            "emotion_timeline": self.emotion_timeline,
            "dominant_emotion": self.dominant_emotion.value,
            "confidence_trend": self.confidence_trend,
            "filler_trend": self.filler_trend,
            "top_fillers": self.top_fillers,
            "coaching_summary": self.coaching_summary,
        }


class TurnAnalyzer:
    """Orchestrates per-turn analysis combining audio and text features.
    
    Usage:
        analyzer = TurnAnalyzer()
        
        # After each user turn:
        result = analyzer.analyze_turn(audio_np, transcript, sample_rate=16000)
        print(result.terminal_display())
        
        # At session end:
        summary = analyzer.get_session_summary()
    """

    def __init__(self):
        self.audio_analyzer = AudioAnalyzer()
        self.speech_analyzer = SpeechAnalyzer(filler_words=ALL_FILLERS)
        self.combined_scorer = CombinedScorer()
        self.turn_history: list[TurnMetrics] = []
        self.session_start = time.time()

    def analyze_turn(
        self,
        audio: np.ndarray,
        transcript: str,
        sample_rate: int = 16000,
        cv_result: CVAnalysisResult | None = None,
    ) -> TurnMetrics:
        """Analyze a single user turn (audio + text + optional CV).
        
        Args:
            audio: Raw audio numpy array
            transcript: STT transcript text
            sample_rate: Audio sample rate
            cv_result: Optional CV analysis from this turn's video frames
            
        Returns:
            TurnMetrics with all analysis results
        """
        turn_number = len(self.turn_history) + 1
        timestamp = time.time() - self.session_start

        # --- Audio Analysis ---
        audio_result = self.audio_analyzer.analyze(audio, sample_rate)

        # --- Text Analysis ---
        words = transcript.strip().split()
        word_count = len(words)
        duration = len(audio) / sample_rate if sample_rate > 0 else 0
        wpm = (word_count / (duration / 60)) if duration > 0 else 0

        # Filler detection
        text_lower = transcript.lower()
        found_fillers = []
        for filler in ALL_FILLERS:
            if f" {filler} " in f" {text_lower} ":
                count = text_lower.split().count(filler)
                found_fillers.extend([filler] * count)

        filler_count = len(found_fillers)
        filler_ratio = filler_count / word_count if word_count > 0 else 0

        # --- Pitch Stability ---
        max_variance = 0.01  # Normalize
        pitch_stability = max(0, 1.0 - (audio_result.features.pitch_variance / max_variance))

        # --- Composite Scores ---
        fluency_score = calculate_fluency(
            wpm, filler_ratio, audio_result.features.pause_count, pitch_stability
        )
        overall_score = calculate_overall(
            fluency_score, audio_result.confidence_score, filler_ratio
        )

        # --- Combined CV + Voice score (via CombinedScorer) ---
        # Build a temporary TurnMetrics stub to pass to scorer
        _stub = type('_Stub', (), {
            'turn_number': len(self.turn_history) + 1,
            'timestamp': time.time() - self.session_start,
            'fluency_score': fluency_score,
            'confidence_score': audio_result.confidence_score,
            'filler_ratio': filler_ratio,
            'wpm': wpm,
        })()
        combined_result: CombinedTurnScore = self.combined_scorer.score_turn(_stub, cv_result)
        combined_score = combined_result.combined_score

        # --- Feedback Hint ---
        feedback_hint = generate_feedback(
            audio_result, filler_count, wpm, fluency_score
        )

        metrics = TurnMetrics(
            turn_number=turn_number,
            timestamp=round(timestamp, 1),
            transcript=transcript,
            word_count=word_count,
            wpm=round(wpm, 0),
            filler_words=found_fillers,
            filler_count=filler_count,
            filler_ratio=filler_ratio,
            emotion=audio_result.emotion,
            confidence_score=audio_result.confidence_score,
            nervousness_score=audio_result.nervousness_score,
            energy_level=audio_result.energy_level,
            pitch_stability=round(pitch_stability, 2),
            pause_count=audio_result.features.pause_count,
            speaking_rate=audio_result.features.speaking_rate,
            fluency_score=round(fluency_score, 0),
            overall_score=round(overall_score, 0),
            combined_score=round(combined_score, 1),
            feedback_hint=feedback_hint,
        )

        self.turn_history.append(metrics)
        return metrics

    def format_terminal_display(self, metrics: TurnMetrics) -> str:
        """Format metrics as a terminal status line."""
        emoji = EMOTION_EMOJI.get(metrics.emotion, "")
        parts = [
            f"[Tone: {metrics.emotion.value.title()} {emoji}]",
            f"[Fluency: {metrics.fluency_score:.0f}%]",
            f"[Fillers: {metrics.filler_count}]",
            f"[WPM: {metrics.wpm:.0f}]",
            f"[Energy: {metrics.energy_level.title()}]",
        ]
        return " ".join(parts)

    def get_guide_prompt(self, metrics: TurnMetrics) -> str:
        """Generate a system prompt injection for Guide Mode.
        
        This is appended to the LLM's context so it can adapt
        its response based on the candidate's emotional state.
        """
        lines = [
            f"[CANDIDATE ANALYSIS - Turn {metrics.turn_number}]",
            f"Emotional State: {metrics.emotion.value}",
            f"Confidence: {metrics.confidence_score:.0%}",
            f"Nervousness: {metrics.nervousness_score:.0%}",
            f"Fluency: {metrics.fluency_score:.0f}%",
            f"Filler words used: {metrics.filler_count}",
        ]

        if metrics.emotion == EmotionState.NERVOUS:
            lines.append("ACTION: The candidate seems nervous. Be warm and encouraging. Suggest they take a moment to collect their thoughts.")
        elif metrics.emotion == EmotionState.HESITANT:
            lines.append("ACTION: The candidate seems unsure. Offer gentle prompts to help them elaborate.")
        elif metrics.filler_count > 3:
            lines.append("ACTION: High filler word usage detected. After your response, gently remind them to take their time.")
        elif metrics.emotion == EmotionState.CONFIDENT:
            lines.append("ACTION: The candidate is confident. Proceed normally and challenge them with follow-up questions.")

        return "\n".join(lines)

    def get_session_summary(self) -> SessionSummary:
        """Generate session-level summary from all turns."""
        if not self.turn_history:
            return SessionSummary(
                total_turns=0, total_duration=0, avg_fluency=0,
                avg_confidence=0, avg_nervousness=0, total_fillers=0,
                avg_wpm=0, emotion_timeline=[], dominant_emotion=EmotionState.NEUTRAL,
                confidence_trend="stable", filler_trend="stable",
                top_fillers=[], coaching_summary="No turns analyzed.",
            )

        n = len(self.turn_history)
        total_duration = self.turn_history[-1].timestamp

        # Averages
        avg_fluency = sum(t.fluency_score for t in self.turn_history) / n
        avg_confidence = sum(t.confidence_score for t in self.turn_history) / n
        avg_nervousness = sum(t.nervousness_score for t in self.turn_history) / n
        total_fillers = sum(t.filler_count for t in self.turn_history)
        avg_wpm = sum(t.wpm for t in self.turn_history) / n

        # Emotion timeline
        emotion_timeline = [
            {
                "turn": t.turn_number,
                "time": t.timestamp,
                "emotion": t.emotion.value,
                "confidence": t.confidence_score,
                "nervousness": t.nervousness_score,
                "fluency": t.fluency_score,
            }
            for t in self.turn_history
        ]

        # Dominant emotion
        from collections import Counter
        emotion_counts = Counter(t.emotion for t in self.turn_history)
        dominant_emotion = emotion_counts.most_common(1)[0][0]

        # Trends (compare first half vs second half)
        mid = n // 2 or 1
        first_half = self.turn_history[:mid]
        second_half = self.turn_history[mid:] or first_half  # fallback to first if only 1 turn

        conf_first = sum(t.confidence_score for t in first_half) / len(first_half)
        conf_second = sum(t.confidence_score for t in second_half) / len(second_half)
        confidence_trend = "improving" if conf_second > conf_first + 0.05 else (
            "declining" if conf_second < conf_first - 0.05 else "stable"
        )

        filler_first = sum(t.filler_count for t in first_half) / len(first_half)
        filler_second = sum(t.filler_count for t in second_half) / len(second_half)
        filler_trend = "improving" if filler_second < filler_first - 0.3 else (
            "declining" if filler_second > filler_first + 0.3 else "stable"
        )

        # Top fillers
        all_fillers = []
        for t in self.turn_history:
            all_fillers.extend(t.filler_words)
        filler_counter = Counter(all_fillers)
        top_fillers = filler_counter.most_common(5)

        # Coaching summary
        coaching_summary = generate_coaching_summary(
            avg_fluency, avg_confidence, avg_nervousness,
            total_fillers, confidence_trend, filler_trend, dominant_emotion,
        )

        return SessionSummary(
            total_turns=n,
            total_duration=total_duration,
            avg_fluency=avg_fluency,
            avg_confidence=avg_confidence,
            avg_nervousness=avg_nervousness,
            total_fillers=total_fillers,
            avg_wpm=avg_wpm,
            emotion_timeline=emotion_timeline,
            dominant_emotion=dominant_emotion,
            confidence_trend=confidence_trend,
            filler_trend=filler_trend,
            top_fillers=top_fillers,
            coaching_summary=coaching_summary,
        )

    def format_session_display(self, summary: SessionSummary) -> str:
        """Format session summary for terminal display."""
        lines = [
            "",
            "=" * 55,
            "📊 SESSION ANALYSIS SUMMARY",
            "=" * 55,
            f"  Turns: {summary.total_turns}  |  Duration: {summary.total_duration:.0f}s",
            f"  Avg Fluency: {summary.avg_fluency:.0f}%  |  Avg WPM: {summary.avg_wpm:.0f}",
            f"  Confidence: {summary.avg_confidence:.0%}  |  Nervousness: {summary.avg_nervousness:.0%}",
            f"  Total Fillers: {summary.total_fillers}  |  Dominant: {summary.dominant_emotion.value.title()} {EMOTION_EMOJI.get(summary.dominant_emotion, '')}",
            "",
            f"  📈 Confidence Trend: {summary.confidence_trend.title()}",
            f"  📉 Filler Trend: {summary.filler_trend.title()}",
        ]

        if summary.top_fillers:
            fillers_str = ", ".join(f'"{w}" ({c}x)' for w, c in summary.top_fillers[:3])
            lines.append(f"  🗣️  Top Fillers: {fillers_str}")

        lines.extend([
            "",
            f"  💡 {summary.coaching_summary}",
            "=" * 55,
        ])
        return "\n".join(lines)

