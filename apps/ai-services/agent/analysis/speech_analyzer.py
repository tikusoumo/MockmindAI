"""Speech analyzer for interview audio.

Analyzes speech patterns including:
- Filler word detection
- Words per minute (WPM) calculation
- Fluency and clarity scoring
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from collections import Counter


@dataclass
class FillerWordAnalysis:
    """Filler word analysis results."""
    word: str
    count: int


@dataclass  
class PacingData:
    """Pacing data at a point in time."""
    time: str  # MM:SS format
    wpm: int


@dataclass
class SpeechAnalysisResult:
    """Complete speech analysis result."""
    total_words: int
    total_duration_seconds: float
    average_wpm: int
    filler_words: list[FillerWordAnalysis]
    filler_word_percentage: float
    pacing_data: list[PacingData]
    clarity_score: float  # 0.0 to 1.0
    fluency_score: float  # 0.0 to 1.0


# Common English filler words
FILLER_WORDS = {
    "um", "uh", "like", "you know", "basically", "actually", 
    "literally", "honestly", "right", "so", "well", "i mean",
    "kind of", "sort of", "stuff", "things"
}


class SpeechAnalyzer:
    """Analyzes speech patterns from transcripts."""

    def __init__(self, filler_words: set[str] | None = None):
        self.filler_words = filler_words or FILLER_WORDS

    def analyze(
        self,
        transcript_entries: list[dict],
        total_duration_seconds: float,
    ) -> SpeechAnalysisResult:
        """Analyze speech from transcript entries.
        
        Args:
            transcript_entries: List of transcript entries with 'text' and 'timestamp' keys
            total_duration_seconds: Total session duration in seconds
            
        Returns:
            SpeechAnalysisResult with all metrics
        """
        # Combine all candidate speech
        candidate_texts = [
            entry["text"] 
            for entry in transcript_entries 
            if entry.get("speaker") == "candidate"
        ]
        full_text = " ".join(candidate_texts)
        
        # Word count
        words = full_text.lower().split()
        total_words = len(words)
        
        # Calculate WPM
        duration_minutes = total_duration_seconds / 60
        average_wpm = int(total_words / duration_minutes) if duration_minutes > 0 else 0
        
        # Filler word analysis
        filler_counts = self._count_filler_words(full_text)
        total_fillers = sum(fw.count for fw in filler_counts)
        filler_percentage = (total_fillers / total_words * 100) if total_words > 0 else 0
        
        # Calculate pacing over time
        pacing_data = self._calculate_pacing(transcript_entries, total_duration_seconds)
        
        # Calculate scores
        clarity_score = self._calculate_clarity_score(filler_percentage, average_wpm)
        fluency_score = self._calculate_fluency_score(pacing_data, filler_percentage)
        
        return SpeechAnalysisResult(
            total_words=total_words,
            total_duration_seconds=total_duration_seconds,
            average_wpm=average_wpm,
            filler_words=filler_counts,
            filler_word_percentage=round(filler_percentage, 2),
            pacing_data=pacing_data,
            clarity_score=round(clarity_score, 2),
            fluency_score=round(fluency_score, 2),
        )

    def _count_filler_words(self, text: str) -> list[FillerWordAnalysis]:
        """Count occurrences of filler words."""
        text_lower = text.lower()
        counts = []
        
        for filler in self.filler_words:
            # Match word boundaries for single words, flexible for phrases
            if " " in filler:
                count = text_lower.count(filler)
            else:
                pattern = rf'\b{re.escape(filler)}\b'
                count = len(re.findall(pattern, text_lower))
            
            if count > 0:
                counts.append(FillerWordAnalysis(word=filler, count=count))
        
        # Sort by count descending
        return sorted(counts, key=lambda x: x.count, reverse=True)

    def _calculate_pacing(
        self,
        entries: list[dict],
        total_seconds: float,
    ) -> list[PacingData]:
        """Calculate WPM at different time intervals."""
        if total_seconds <= 0:
            return []
        
        # Calculate pacing in 5-minute intervals
        interval = 300  # 5 minutes in seconds
        pacing = []
        
        for start in range(0, int(total_seconds), interval):
            end = start + interval
            
            # Get entries in this interval
            interval_texts = [
                entry["text"]
                for entry in entries
                if entry.get("speaker") == "candidate"
                and start <= entry.get("timestamp", 0) < end
            ]
            
            word_count = sum(len(text.split()) for text in interval_texts)
            interval_minutes = min(interval, total_seconds - start) / 60
            wpm = int(word_count / interval_minutes) if interval_minutes > 0 else 0
            
            mins = start // 60
            secs = start % 60
            pacing.append(PacingData(time=f"{mins:02d}:{secs:02d}", wpm=wpm))
        
        return pacing

    def _calculate_clarity_score(self, filler_percentage: float, wpm: int) -> float:
        """Calculate clarity score based on filler words and pacing."""
        # Penalize high filler word usage
        filler_penalty = min(filler_percentage / 10, 0.5)  # Max 50% penalty
        
        # Penalize too fast or too slow speech
        optimal_wpm = 140
        wpm_deviation = abs(wpm - optimal_wpm) / optimal_wpm
        wpm_penalty = min(wpm_deviation * 0.3, 0.3)  # Max 30% penalty
        
        score = 1.0 - filler_penalty - wpm_penalty
        return max(0.0, min(1.0, score))

    def _calculate_fluency_score(self, pacing: list[PacingData], filler_percentage: float) -> float:
        """Calculate fluency based on pacing consistency."""
        if len(pacing) < 2:
            return 0.7  # Default for short sessions
        
        # Calculate variance in WPM
        wpms = [p.wpm for p in pacing if p.wpm > 0]
        if not wpms:
            return 0.5
        
        avg_wpm = sum(wpms) / len(wpms)
        variance = sum((w - avg_wpm) ** 2 for w in wpms) / len(wpms)
        std_dev = variance ** 0.5
        
        # Lower std dev = more consistent = higher fluency
        consistency_score = max(0, 1 - (std_dev / 50))
        
        # Factor in filler words
        filler_impact = max(0, 1 - (filler_percentage / 20))
        
        return (consistency_score * 0.6 + filler_impact * 0.4)
