"""Combined CV + Voice scoring for interview performance.

Merges per-turn CVAnalysisResult and TurnMetrics into a unified
CombinedTurnScore, and aggregates into a SessionFinalScore at the end.

Scoring Formula
---------------
Turn Score  = Voice Score × 0.60  +  CV Score × 0.40

Voice Score = Fluency × 0.35  +  Confidence × 0.35
            + Filler-Free × 0.15  +  Pace × 0.15

CV Score    = Eye Contact × 0.40  +  Confidence × 0.35
            + Posture × 0.15      +  Engagement × 0.10

Final Score = avg(Turn Scores) × 0.70
            + Consistency Bonus  × 0.30   (−10 → +10 based on variance)
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from typing import Any

from .cv_analyzer import CVAnalysisResult, Rating


# ---------------------------------------------------------------------------
# Weight constants — easy to tune without touching logic
# ---------------------------------------------------------------------------
VOICE_WEIGHT = 0.60
CV_WEIGHT = 0.40

VOICE_FLUENCY_W = 0.35
VOICE_CONFIDENCE_W = 0.35
VOICE_FILLER_W = 0.15
VOICE_PACE_W = 0.15

CV_EYE_W = 0.40
CV_CONFIDENCE_W = 0.35
CV_POSTURE_W = 0.15
CV_ENGAGEMENT_W = 0.10


def _rating_to_score(r: Rating) -> float:
    """Convert Rating enum to 0–1 float."""
    return {Rating.EXCELLENT: 1.0, Rating.GOOD: 0.75, Rating.POOR: 0.40}.get(r, 0.6)


def _pace_score(wpm: float) -> float:
    """Good pace = 120–160 WPM."""
    if 120 <= wpm <= 160:
        return 1.0
    elif 100 < wpm < 120 or 160 < wpm <= 180:
        return 0.75
    elif 90 < wpm <= 100 or 180 < wpm <= 200:
        return 0.50
    return 0.30


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class CombinedTurnScore:
    """Per-turn combined score from voice + CV analysis."""
    turn_number: int
    timestamp: float

    # Sub-scores (0–100)
    voice_score: float
    cv_score: float
    combined_score: float        # Final 0–100 turn score

    # Component breakdown
    fluency_score: float         # from TurnMetrics
    voice_confidence: float      # from audio analysis (0–1)
    filler_free_score: float     # 1 - filler_ratio
    pace_score: float

    eye_contact_score: float     # from CVAnalysisResult
    cv_confidence_score: float
    posture_score: float
    engagement_score: float

    face_detected_pct: float     # % of turn where face was visible
    has_cv_data: bool            # False when webcam unavailable

    def to_dict(self) -> dict[str, Any]:
        return {
            "turn_number": self.turn_number,
            "timestamp": self.timestamp,
            "combined_score": round(self.combined_score, 1),
            "voice_score": round(self.voice_score, 1),
            "cv_score": round(self.cv_score, 1),
            "fluency": round(self.fluency_score, 1),
            "voice_confidence": round(self.voice_confidence * 100, 1),
            "pace": round(self.pace_score * 100, 1),
            "eye_contact": round(self.eye_contact_score * 100, 1),
            "cv_confidence": round(self.cv_confidence_score * 100, 1),
            "posture": round(self.posture_score * 100, 1),
            "engagement": round(self.engagement_score * 100, 1),
            "face_detected_pct": round(self.face_detected_pct, 1),
        }


@dataclass
class SessionFinalScore:
    """Aggregated final session score."""
    total_turns: int
    avg_combined_score: float      # 0–100
    avg_voice_score: float
    avg_cv_score: float

    # Component averages
    avg_eye_contact: float
    avg_cv_confidence: float
    avg_posture: float
    avg_engagement: float
    avg_fluency: float
    avg_voice_confidence: float

    # Trend
    score_trend: str               # "improving", "declining", "stable"
    consistency_bonus: float       # –10 to +10

    final_score: float             # The headline number (0–100)
    grade: str                     # "A", "B", "C", "D", "F"
    summary: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_turns": self.total_turns,
            "final_score": round(self.final_score, 1),
            "grade": self.grade,
            "avg_combined_score": round(self.avg_combined_score, 1),
            "avg_voice_score": round(self.avg_voice_score, 1),
            "avg_cv_score": round(self.avg_cv_score, 1),
            "avg_eye_contact": round(self.avg_eye_contact * 100, 1),
            "avg_cv_confidence": round(self.avg_cv_confidence * 100, 1),
            "avg_posture": round(self.avg_posture * 100, 1),
            "avg_engagement": round(self.avg_engagement * 100, 1),
            "avg_fluency": round(self.avg_fluency, 1),
            "avg_voice_confidence": round(self.avg_voice_confidence * 100, 1),
            "score_trend": self.score_trend,
            "consistency_bonus": round(self.consistency_bonus, 1),
            "summary": self.summary,
        }


# ---------------------------------------------------------------------------
# Scorer
# ---------------------------------------------------------------------------

class CombinedScorer:
    """Combines per-turn Voice + CV scores into a unified interview score.

    Usage:
        scorer = CombinedScorer()

        # After each turn:
        combined = scorer.score_turn(turn_metrics, cv_result)
        print(scorer.format_turn_display(combined))

        # At session end:
        final = scorer.finalize_session()
        print(scorer.format_session_display(final))
    """

    def __init__(self):
        self.turn_scores: list[CombinedTurnScore] = []

    def score_turn(
        self,
        turn_metrics,               # TurnMetrics from TurnAnalyzer
        cv_result: CVAnalysisResult | None = None,
    ) -> CombinedTurnScore:
        """Calculate combined score for one turn."""

        # --- Voice sub-scores ---
        fluency_norm = turn_metrics.fluency_score / 100.0           # 0–1
        voice_conf = float(turn_metrics.confidence_score)           # 0–1
        filler_free = max(0.0, 1.0 - turn_metrics.filler_ratio * 5) # heavy penalty
        pace = _pace_score(float(turn_metrics.wpm))

        voice_score = (
            fluency_norm   * VOICE_FLUENCY_W +
            voice_conf     * VOICE_CONFIDENCE_W +
            filler_free    * VOICE_FILLER_W +
            pace           * VOICE_PACE_W
        ) * 100

        # --- CV sub-scores ---
        has_cv = cv_result is not None and cv_result.frame_count > 0

        if has_cv:
            eye = _rating_to_score(cv_result.behavioral.eye_contact)
            cv_conf = float(cv_result.behavioral.confidence_score)
            posture = _rating_to_score(cv_result.behavioral.posture_quality)
            engagement = float(cv_result.behavioral.engagement_score)
            face_pct = float(cv_result.face_detected_percentage)
        else:
            # Fallback: neutral estimates (does not penalise for missing cam)
            eye = cv_conf = posture = engagement = 0.65
            face_pct = 0.0

        cv_score = (
            eye        * CV_EYE_W +
            cv_conf    * CV_CONFIDENCE_W +
            posture    * CV_POSTURE_W +
            engagement * CV_ENGAGEMENT_W
        ) * 100

        combined = voice_score * VOICE_WEIGHT + cv_score * CV_WEIGHT

        result = CombinedTurnScore(
            turn_number=turn_metrics.turn_number,
            timestamp=turn_metrics.timestamp,
            voice_score=round(voice_score, 1),
            cv_score=round(cv_score, 1),
            combined_score=round(combined, 1),
            fluency_score=turn_metrics.fluency_score,
            voice_confidence=voice_conf,
            filler_free_score=filler_free,
            pace_score=pace,
            eye_contact_score=eye,
            cv_confidence_score=cv_conf,
            posture_score=posture,
            engagement_score=engagement,
            face_detected_pct=face_pct,
            has_cv_data=has_cv,
        )
        self.turn_scores.append(result)
        return result

    def finalize_session(self) -> SessionFinalScore:
        """Aggregate all turn scores into the final session report."""
        turns = self.turn_scores
        n = len(turns)

        if n == 0:
            return SessionFinalScore(
                total_turns=0, avg_combined_score=0, avg_voice_score=0,
                avg_cv_score=0, avg_eye_contact=0, avg_cv_confidence=0,
                avg_posture=0, avg_engagement=0, avg_fluency=0,
                avg_voice_confidence=0, score_trend="stable",
                consistency_bonus=0, final_score=0, grade="N/A",
                summary="No turns recorded.",
            )

        avg_combined   = sum(t.combined_score for t in turns) / n
        avg_voice      = sum(t.voice_score for t in turns) / n
        avg_cv         = sum(t.cv_score for t in turns) / n
        avg_eye        = sum(t.eye_contact_score for t in turns) / n
        avg_cv_conf    = sum(t.cv_confidence_score for t in turns) / n
        avg_posture    = sum(t.posture_score for t in turns) / n
        avg_engagement = sum(t.engagement_score for t in turns) / n
        avg_fluency    = sum(t.fluency_score for t in turns) / n
        avg_voice_conf = sum(t.voice_confidence for t in turns) / n

        # Trend (first half vs second half)
        mid = max(1, n // 2)
        first_avg  = sum(t.combined_score for t in turns[:mid]) / mid
        second_avg = sum(t.combined_score for t in turns[mid:]) / max(1, n - mid)
        if second_avg > first_avg + 3:
            trend = "improving"
        elif second_avg < first_avg - 3:
            trend = "declining"
        else:
            trend = "stable"

        # Consistency bonus: low variance → positive bonus
        if n > 1:
            stdev = statistics.stdev(t.combined_score for t in turns)
            consistency_bonus = max(-10.0, min(10.0, 10.0 - stdev))
        else:
            consistency_bonus = 0.0

        final = avg_combined * 0.70 + (50 + consistency_bonus) * 0.30
        final = max(0.0, min(100.0, final))

        grade = self._grade(final)
        summary = self._build_summary(
            avg_combined, avg_eye, avg_posture, avg_fluency,
            avg_voice_conf, trend, n,
        )

        return SessionFinalScore(
            total_turns=n,
            avg_combined_score=round(avg_combined, 1),
            avg_voice_score=round(avg_voice, 1),
            avg_cv_score=round(avg_cv, 1),
            avg_eye_contact=round(avg_eye, 2),
            avg_cv_confidence=round(avg_cv_conf, 2),
            avg_posture=round(avg_posture, 2),
            avg_engagement=round(avg_engagement, 2),
            avg_fluency=round(avg_fluency, 1),
            avg_voice_confidence=round(avg_voice_conf, 2),
            score_trend=trend,
            consistency_bonus=round(consistency_bonus, 1),
            final_score=round(final, 1),
            grade=grade,
            summary=summary,
        )

    # ------------------------------------------------------------------ #
    # Display helpers
    # ------------------------------------------------------------------ #

    def format_turn_display(self, s: CombinedTurnScore) -> str:
        """One-line terminal display after each turn."""
        cam_icon = "📹" if s.has_cv_data else "🚫"
        eye_label = _score_label(s.eye_contact_score)
        conf_label = _score_label(s.cv_confidence_score)
        return (
            f"{cam_icon} [Voice: {s.voice_score:.0f}%]"
            f" [👁 Eye: {eye_label}]"
            f" [😐 Confidence: {s.cv_confidence_score * 100:.0f}%]"
            f" [Posture: {_score_label(s.posture_score)}]"
            f" ➡️  Combined: {s.combined_score:.0f}/100"
        )

    def format_session_display(self, s: SessionFinalScore) -> str:
        """Multi-line terminal session report."""
        lines = [
            "",
            "=" * 60,
            "🎯 FINAL INTERVIEW SCORE REPORT",
            "=" * 60,
            f"  ⭐ Final Score : {s.final_score:.1f}/100  [{s.grade}]",
            f"  🎤 Voice Score : {s.avg_voice_score:.1f}/100",
            f"  📹 CV Score    : {s.avg_cv_score:.1f}/100",
            "",
            "  — Breakdown —",
            f"  👁  Eye Contact  : {s.avg_eye_contact * 100:.0f}%",
            f"  😐 CV Confidence: {s.avg_cv_confidence * 100:.0f}%",
            f"  🧍 Posture      : {s.avg_posture * 100:.0f}%",
            f"  💬 Engagement   : {s.avg_engagement * 100:.0f}%",
            f"  🗣  Fluency      : {s.avg_fluency:.0f}%",
            f"  🔊 Voice Conf   : {s.avg_voice_confidence * 100:.0f}%",
            "",
            f"  📈 Trend       : {s.score_trend.title()}",
            f"  🎯 Consistency : {s.consistency_bonus:+.1f}pts",
            f"  🔄 Turns       : {s.total_turns}",
            "",
            f"  💡 {s.summary}",
            "=" * 60,
        ]
        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    # Private
    # ------------------------------------------------------------------ #

    @staticmethod
    def _grade(score: float) -> str:
        if score >= 85: return "A"
        if score >= 70: return "B"
        if score >= 55: return "C"
        if score >= 40: return "D"
        return "F"

    @staticmethod
    def _build_summary(
        avg: float, eye: float, posture: float,
        fluency: float, conf: float, trend: str, n: int,
    ) -> str:
        parts = []
        if avg >= 75:
            parts.append("Strong overall performance.")
        elif avg >= 55:
            parts.append("Decent performance with room to improve.")
        else:
            parts.append("Needs significant improvement — keep practising!")

        if eye < 0.5:
            parts.append("Maintain eye contact with the camera.")
        if posture < 0.5:
            parts.append("Work on keeping an upright, centered posture.")
        if fluency < 60:
            parts.append("Focus on reducing filler words and improving fluency.")
        if conf < 0.5:
            parts.append("Project more confidence in your delivery.")
        if trend == "improving":
            parts.append("Great — your score improved as the session progressed!")
        elif trend == "declining":
            parts.append("Your score dipped later — stay focused to the end.")

        return " ".join(parts)


def _score_label(score: float) -> str:
    if score >= 0.75: return "Excellent"
    if score >= 0.50: return "Good"
    return "Poor"
