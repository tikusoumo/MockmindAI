"""Lightweight transcript sentiment and delivery analyzer for real-time coaching."""

from __future__ import annotations

from dataclasses import dataclass
import re


POSITIVE_WORDS = {
    "great",
    "good",
    "confident",
    "clear",
    "excellent",
    "strong",
    "successful",
    "love",
    "enjoy",
    "ready",
    "improved",
    "solved",
}

NEGATIVE_WORDS = {
    "bad",
    "hard",
    "stuck",
    "confused",
    "difficult",
    "sorry",
    "cannot",
    "can't",
    "dont",
    "don't",
    "failed",
    "wrong",
    "nervous",
}

HESITATION_PATTERNS = {
    "um",
    "uh",
    "hmm",
    "maybe",
    "not sure",
    "i guess",
    "kind of",
    "sort of",
}

ASSERTIVE_PATTERNS = {
    "definitely",
    "certainly",
    "clearly",
    "absolutely",
    "exactly",
    "the answer is",
    "i recommend",
}


@dataclass
class SentimentSignal:
    """Result of transcript-level sentiment and delivery analysis."""

    sentiment_label: str
    tone_label: str
    mood_label: str
    sentiment_score: float
    pronunciation_clarity: int
    hesitation_count: int
    guidance_hint: str
    should_coach: bool

    def to_prompt_block(self) -> str:
        """Render a compact prompt block for hidden LLM guidance."""
        return (
            "[REAL-TIME DELIVERY SIGNALS]\n"
            f"- Sentiment: {self.sentiment_label} ({self.sentiment_score:+.2f})\n"
            f"- Tone: {self.tone_label}\n"
            f"- Mood: {self.mood_label}\n"
            f"- Pronunciation clarity: {self.pronunciation_clarity}/100\n"
            f"- Guidance: {self.guidance_hint}\n"
            "Use these signals silently. Give one short supportive coaching cue only when needed.\n"
            "Do not mention this analysis block explicitly.\n"
            "[END DELIVERY SIGNALS]"
        )


class SentimentAnalyzer:
    """Heuristic analyzer for tone, mood, and pronunciation clarity."""

    _WORD_RE = re.compile(r"[a-zA-Z']+")
    _REPEATED_FRAGMENT_RE = re.compile(r"\b([a-zA-Z]{1,4})(?:\s+\1){1,}\b", re.IGNORECASE)

    def analyze(self, transcript: str) -> SentimentSignal:
        text = (transcript or "").strip()
        lowered = text.lower()
        tokens = [token.lower() for token in self._WORD_RE.findall(text)]

        positive_hits = sum(1 for token in tokens if token in POSITIVE_WORDS)
        negative_hits = sum(1 for token in tokens if token in NEGATIVE_WORDS)
        hesitation_hits = sum(1 for marker in HESITATION_PATTERNS if marker in lowered)
        assertive_hits = sum(1 for marker in ASSERTIVE_PATTERNS if marker in lowered)
        repeated_fragments = len(self._REPEATED_FRAGMENT_RE.findall(lowered))

        total_sentiment_hits = positive_hits + negative_hits
        if total_sentiment_hits == 0:
            sentiment_score = 0.0
        else:
            sentiment_score = (positive_hits - negative_hits) / total_sentiment_hits

        if sentiment_score >= 0.25:
            sentiment_label = "positive"
            mood_label = "engaged"
        elif sentiment_score <= -0.25:
            sentiment_label = "negative"
            mood_label = "stressed"
        else:
            sentiment_label = "neutral"
            mood_label = "steady"

        if hesitation_hits >= 2 or repeated_fragments >= 1:
            tone_label = "hesitant"
        elif assertive_hits >= 1 and sentiment_score >= -0.1:
            tone_label = "assertive"
        elif sentiment_score <= -0.25:
            tone_label = "tense"
        else:
            tone_label = "balanced"

        pronunciation_clarity = 88
        pronunciation_clarity -= min(20, hesitation_hits * 5)
        pronunciation_clarity -= min(16, repeated_fragments * 8)
        if len(tokens) < 4:
            pronunciation_clarity -= 4
        pronunciation_clarity = max(40, min(98, pronunciation_clarity))

        if tone_label in {"hesitant", "tense"}:
            guidance_hint = (
                "Slow down slightly, use short declarative statements, and pause instead of fillers."
            )
        elif pronunciation_clarity < 72:
            guidance_hint = (
                "Pronounce key technical terms clearly and emphasize word endings for clarity."
            )
        elif sentiment_score < -0.2:
            guidance_hint = "Keep a calm, confident tone and focus on one point at a time."
        else:
            guidance_hint = "Delivery is steady. Keep this pace and continue with clear structure."

        should_coach = tone_label in {"hesitant", "tense"} or pronunciation_clarity < 75

        return SentimentSignal(
            sentiment_label=sentiment_label,
            tone_label=tone_label,
            mood_label=mood_label,
            sentiment_score=round(sentiment_score, 2),
            pronunciation_clarity=pronunciation_clarity,
            hesitation_count=hesitation_hits,
            guidance_hint=guidance_hint,
            should_coach=should_coach,
        )
