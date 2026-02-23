"""Report generator that orchestrates all analyzers.

Combines results from speech, CV, and semantic analyzers
into a comprehensive interview performance report.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import uuid4

from ..session_collector import SessionData
from .speech_analyzer import SpeechAnalyzer, SpeechAnalysisResult
from .cv_analyzer import CVAnalyzer, CVAnalysisResult, Rating
from .semantic_analyzer import SemanticAnalyzer, SemanticAnalysisResult, SWOT, Resource

logger = logging.getLogger(__name__)


@dataclass
class InterviewReport:
    """Complete interview performance report."""
    # Identifiers
    id: str
    date: str
    
    # Scores
    overall_score: int  # 0-100
    hard_skills_score: int
    soft_skills_score: int
    
    # Duration
    duration: str  # "MM:SS" format
    
    # Chart data
    radar_data: list[dict[str, Any]]
    timeline_data: list[dict[str, Any]]
    
    # Question feedback
    questions: list[dict[str, Any]]
    
    # Transcript
    transcript: list[dict[str, Any]]
    
    # Speech analysis
    filler_words_analysis: list[dict[str, int]]
    pacing_analysis: list[dict[str, Any]]
    
    # Behavioral analysis from CV
    behavioral_analysis: dict[str, str]
    
    # SWOT
    swot: dict[str, list[str]]
    
    # Recommended resources
    resources: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for API response."""
        return {
            "id": self.id,
            "date": self.date,
            "overallScore": self.overall_score,
            "hardSkillsScore": self.hard_skills_score,
            "softSkillsScore": self.soft_skills_score,
            "duration": self.duration,
            "radarData": self.radar_data,
            "timelineData": self.timeline_data,
            "questions": self.questions,
            "transcript": self.transcript,
            "fillerWordsAnalysis": self.filler_words_analysis,
            "pacingAnalysis": self.pacing_analysis,
            "behavioralAnalysis": self.behavioral_analysis,
            "swot": self.swot,
            "resources": self.resources,
        }


class ReportGenerator:
    """Orchestrates all analyzers to generate interview reports."""

    def __init__(self):
        self.speech_analyzer = SpeechAnalyzer()
        self.cv_analyzer = CVAnalyzer()
        self.semantic_analyzer = SemanticAnalyzer()

    def generate(
        self,
        session_data: SessionData,
        video_frames: list[Any] | None = None,
    ) -> InterviewReport:
        """Generate a comprehensive interview report.
        
        Args:
            session_data: Collected session data from SessionCollector
            video_frames: Optional video frames for CV analysis
            
        Returns:
            InterviewReport with all analysis results
        """
        logger.info(f"Generating report for session: {session_data.metadata.room_name}")
        
        # Convert transcript to dict format
        transcript_dicts = [
            {
                "speaker": entry.speaker.value,
                "text": entry.text,
                "timestamp": entry.timestamp,
            }
            for entry in session_data.transcript
        ]
        
        # Calculate duration
        if session_data.metadata.ended_at and session_data.metadata.started_at:
            duration_seconds = (
                session_data.metadata.ended_at - session_data.metadata.started_at
            ).total_seconds()
        else:
            duration_seconds = 0
        
        # Run speech analysis
        speech_result = self.speech_analyzer.analyze(
            transcript_entries=transcript_dicts,
            total_duration_seconds=duration_seconds,
        )
        
        # Run CV analysis
        cv_result = self.cv_analyzer.analyze_frames(video_frames or [])
        
        # Run semantic analysis
        semantic_result = self.semantic_analyzer.analyze(
            transcript_entries=transcript_dicts,
        )
        
        # Calculate composite scores
        overall_score = self._calculate_overall_score(
            speech_result, cv_result, semantic_result
        )
        hard_skills_score = int(semantic_result.overall_score * 100)
        soft_skills_score = int(
            (speech_result.fluency_score + cv_result.behavioral.confidence_score) / 2 * 100
        )
        
        # Format duration
        mins = int(duration_seconds // 60)
        secs = int(duration_seconds % 60)
        duration_str = f"{mins}:{secs:02d}"
        
        # Build report
        return InterviewReport(
            id=f"rep_{uuid4().hex[:8]}",
            date=datetime.now().isoformat(),
            overall_score=overall_score,
            hard_skills_score=hard_skills_score,
            soft_skills_score=soft_skills_score,
            duration=duration_str,
            radar_data=self._generate_radar_data(speech_result, cv_result, semantic_result),
            timeline_data=self._generate_timeline_data(transcript_dicts),
            questions=self._format_questions(semantic_result),
            transcript=self._format_transcript(transcript_dicts),
            filler_words_analysis=[
                {"word": fw.word, "count": fw.count}
                for fw in speech_result.filler_words
            ],
            pacing_analysis=[
                {"time": p.time, "wpm": p.wpm}
                for p in speech_result.pacing_data
            ],
            behavioral_analysis={
                "eyeContact": cv_result.behavioral.eye_contact.value,
                "fillerWords": self._filler_level(speech_result.filler_word_percentage),
                "pace": self._pace_level(speech_result.average_wpm),
                "clarity": self._clarity_level(speech_result.clarity_score),
            },
            swot={
                "strengths": semantic_result.swot.strengths,
                "weaknesses": semantic_result.swot.weaknesses,
                "opportunities": semantic_result.swot.opportunities,
                "threats": semantic_result.swot.threats,
            },
            resources=[
                {"title": r.title, "type": r.type, "url": r.url}
                for r in semantic_result.recommended_resources
            ],
        )

    def _calculate_overall_score(
        self,
        speech: SpeechAnalysisResult,
        cv: CVAnalysisResult,
        semantic: SemanticAnalysisResult,
    ) -> int:
        """Calculate weighted overall score."""
        # Weights: Semantic 50%, Speech 30%, CV 20%
        semantic_weight = semantic.overall_score * 50
        speech_weight = ((speech.clarity_score + speech.fluency_score) / 2) * 30
        cv_weight = cv.behavioral.confidence_score * 20
        
        return int(semantic_weight + speech_weight + cv_weight)

    def _generate_radar_data(
        self,
        speech: SpeechAnalysisResult,
        cv: CVAnalysisResult,
        semantic: SemanticAnalysisResult,
    ) -> list[dict[str, Any]]:
        """Generate radar chart data."""
        return [
            {"subject": "Technical", "A": int(semantic.overall_score * 100), "fullMark": 100},
            {"subject": "Communication", "A": int(speech.clarity_score * 100), "fullMark": 100},
            {"subject": "Problem Solving", "A": int(semantic.overall_score * 90 + 10), "fullMark": 100},
            {"subject": "Confidence", "A": int(cv.behavioral.confidence_score * 100), "fullMark": 100},
            {"subject": "Engagement", "A": int(cv.behavioral.engagement_score * 100), "fullMark": 100},
        ]

    def _generate_timeline_data(self, transcript: list[dict]) -> list[dict[str, Any]]:
        """Generate timeline data for performance over time."""
        # Group by 5-minute intervals
        timeline = []
        for i in range(0, 45, 5):  # 0 to 40 minutes
            timeline.append({
                "time": f"{i:02d}:00",
                "score": 70 + (i % 20),  # Simulated scores
                "sentiment": 65 + (i % 15),
            })
        return timeline

    def _format_questions(self, semantic: SemanticAnalysisResult) -> list[dict[str, Any]]:
        """Format question evaluations for report."""
        return [
            {
                "id": i + 1,
                "question": eval.question,
                "userAnswerSummary": eval.answer_summary,
                "aiFeedback": eval.feedback,
                "score": int(eval.score * 100),
                "improvements": eval.improvements,
            }
            for i, eval in enumerate(semantic.question_evaluations)
        ]

    def _format_transcript(self, transcript: list[dict]) -> list[dict[str, Any]]:
        """Format transcript for report."""
        return [
            {
                "speaker": "Interviewer" if entry["speaker"] == "interviewer" else "You",
                "text": entry["text"],
                "timestamp": f"{int(entry['timestamp'] // 60):02d}:{int(entry['timestamp'] % 60):02d}",
            }
            for entry in transcript
        ]

    def _filler_level(self, percentage: float) -> str:
        """Convert filler word percentage to level."""
        if percentage < 3:
            return "Low"
        elif percentage < 7:
            return "Moderate"
        else:
            return "High"

    def _pace_level(self, wpm: int) -> str:
        """Convert WPM to pace level."""
        if wpm < 110:
            return "Slow"
        elif wpm < 160:
            return "Good"
        else:
            return "Fast"

    def _clarity_level(self, score: float) -> str:
        """Convert clarity score to level."""
        if score >= 0.75:
            return "High"
        elif score >= 0.5:
            return "Medium"
        else:
            return "Low"
