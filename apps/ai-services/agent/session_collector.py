"""Session data collector for interview recordings.

Collects transcript, audio timestamps, and session metadata for
post-interview analysis and report generation.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

logger = logging.getLogger(__name__)


class SpeakerRole(str, Enum):
    """Speaker role in the conversation."""
    INTERVIEWER = "interviewer"
    CANDIDATE = "candidate"


@dataclass
class TranscriptEntry:
    """A single transcript entry."""
    speaker: SpeakerRole
    text: str
    timestamp: float  # Seconds from session start
    duration: float = 0.0


@dataclass
class SessionMetadata:
    """Metadata for an interview session."""
    room_name: str
    template_id: str | None = None
    template_title: str = ""
    mode: str = "strict"  # 'learning' or 'strict'
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: datetime | None = None
    participant_name: str = ""


@dataclass
class SessionData:
    """Complete session data for analysis."""
    metadata: SessionMetadata
    transcript: list[TranscriptEntry] = field(default_factory=list)
    scores: list[float] = field(default_factory=list)
    question_count: int = 0
    follow_up_count: int = 0
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "metadata": {
                "room_name": self.metadata.room_name,
                "template_id": self.metadata.template_id,
                "template_title": self.metadata.template_title,
                "mode": self.metadata.mode,
                "started_at": self.metadata.started_at.isoformat(),
                "ended_at": self.metadata.ended_at.isoformat() if self.metadata.ended_at else None,
                "participant_name": self.metadata.participant_name,
            },
            "transcript": [
                {
                    "speaker": entry.speaker.value,
                    "text": entry.text,
                    "timestamp": entry.timestamp,
                    "duration": entry.duration,
                }
                for entry in self.transcript
            ],
            "scores": self.scores,
            "question_count": self.question_count,
            "follow_up_count": self.follow_up_count,
        }


class SessionCollector:
    """Collects data during an interview session.
    
    Used by the voice agent to record transcript and events
    for post-session analysis and report generation.
    """

    def __init__(
        self,
        room_name: str,
        template_id: str | None = None,
        template_title: str = "",
        mode: str = "strict",
        participant_name: str = "",
    ):
        self.session_start = datetime.now()
        self.data = SessionData(
            metadata=SessionMetadata(
                room_name=room_name,
                template_id=template_id,
                template_title=template_title,
                mode=mode,
                started_at=self.session_start,
                participant_name=participant_name,
            )
        )
        logger.info(f"SessionCollector initialized for room: {room_name}, mode: {mode}")

    def add_interviewer_message(self, text: str, is_question: bool = False, is_followup: bool = False):
        """Record an interviewer message."""
        timestamp = (datetime.now() - self.session_start).total_seconds()
        self.data.transcript.append(
            TranscriptEntry(
                speaker=SpeakerRole.INTERVIEWER,
                text=text,
                timestamp=timestamp,
            )
        )
        if is_question:
            self.data.question_count += 1
        if is_followup:
            self.data.follow_up_count += 1

    def add_candidate_message(self, text: str, duration: float = 0.0):
        """Record a candidate's response."""
        timestamp = (datetime.now() - self.session_start).total_seconds()
        self.data.transcript.append(
            TranscriptEntry(
                speaker=SpeakerRole.CANDIDATE,
                text=text,
                timestamp=timestamp,
                duration=duration,
            )
        )

    def add_score(self, score: float):
        """Record a score for the current question."""
        self.data.scores.append(score)

    def end_session(self) -> SessionData:
        """Mark session as ended and return collected data."""
        self.data.metadata.ended_at = datetime.now()
        logger.info(
            f"Session ended: {self.data.question_count} questions, "
            f"{len(self.data.transcript)} transcript entries"
        )
        return self.data

    def get_transcript_text(self) -> str:
        """Get full transcript as formatted text."""
        lines = []
        for entry in self.data.transcript:
            speaker = "Interviewer" if entry.speaker == SpeakerRole.INTERVIEWER else "Candidate"
            lines.append(f"[{entry.timestamp:.1f}s] {speaker}: {entry.text}")
        return "\n".join(lines)

    def is_learning_mode(self) -> bool:
        """Check if session is in learning mode."""
        return self.data.metadata.mode == "learning"
