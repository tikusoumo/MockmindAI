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
class CodeHistoryEntry:
    """A single coding activity event captured during the session."""

    event_id: str
    actor: str
    event_type: str
    summary: str
    timestamp: float
    language: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


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
    code_history: list[CodeHistoryEntry] = field(default_factory=list)
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
            "code_history": [
                {
                    "event_id": entry.event_id,
                    "actor": entry.actor,
                    "event_type": entry.event_type,
                    "summary": entry.summary,
                    "timestamp": entry.timestamp,
                    "language": entry.language,
                    "details": entry.details,
                }
                for entry in self.code_history
            ],
            "scores": self.scores,
            "question_count": self.question_count,
            "follow_up_count": self.follow_up_count,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SessionData:
        """Create from dictionary."""
        from datetime import datetime
        metadata_data = data.get("metadata", {})
        metadata = SessionMetadata(
            room_name=metadata_data.get("room_name", ""),
            template_id=metadata_data.get("template_id"),
            template_title=metadata_data.get("template_title", ""),
            mode=metadata_data.get("mode", "strict"),
            started_at=datetime.fromisoformat(metadata_data["started_at"]) if metadata_data.get("started_at") else datetime.now(),
            ended_at=datetime.fromisoformat(metadata_data["ended_at"]) if metadata_data.get("ended_at") else None,
            participant_name=metadata_data.get("participant_name", ""),
        )
        transcript = []
        for entry in data.get("transcript", []):
            transcript.append(TranscriptEntry(
                speaker=SpeakerRole(entry["speaker"]),
                text=entry["text"],
                timestamp=entry["timestamp"],
                duration=entry.get("duration", 0.0),
            ))

        code_history: list[CodeHistoryEntry] = []
        for index, event in enumerate(data.get("code_history", []), start=1):
            details = event.get("details", {})
            event_id = event.get("event_id") or event.get("id") or f"SNAP-{index:04d}"
            code_history.append(
                CodeHistoryEntry(
                    event_id=str(event_id),
                    actor=str(event.get("actor", "system") or "system"),
                    event_type=str(event.get("event_type", "note") or "note"),
                    summary=str(event.get("summary", "") or ""),
                    timestamp=float(event.get("timestamp", 0.0) or 0.0),
                    language=(
                        str(event.get("language")).strip()
                        if isinstance(event.get("language"), str)
                        and str(event.get("language")).strip()
                        else None
                    ),
                    details=details if isinstance(details, dict) else {},
                )
            )

        return cls(
            metadata=metadata,
            transcript=transcript,
            code_history=code_history,
            scores=data.get("scores", []),
            question_count=data.get("question_count", 0),
            follow_up_count=data.get("follow_up_count", 0)
        )


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

    def add_code_history_event(
        self,
        actor: str,
        event_type: str,
        summary: str,
        language: str | None = None,
        details: dict[str, Any] | None = None,
    ):
        """Record a coding event for machine-coding and technical rounds."""
        safe_summary = (summary or "").strip()
        if not safe_summary:
            return

        if len(safe_summary) > 320:
            safe_summary = f"{safe_summary[:317]}..."

        safe_actor = (actor or "system").strip().lower()
        if safe_actor not in {"ai", "user", "candidate", "system"}:
            safe_actor = "system"
        if safe_actor == "candidate":
            safe_actor = "user"

        safe_event_type = (event_type or "note").strip().lower() or "note"
        safe_language = (language or "").strip().lower() or None

        normalized_details: dict[str, Any] = {}
        if isinstance(details, dict):
            for key, value in details.items():
                if len(normalized_details) >= 12:
                    break

                safe_key = str(key)[:64]
                is_code_snapshot_key = safe_key in {
                    "codeSnapshot",
                    "code",
                    "snapshotCode",
                    "fullCode",
                }
                if isinstance(value, (str, int, float, bool)) or value is None:
                    safe_value: Any = value
                else:
                    try:
                        safe_value = json.dumps(value, ensure_ascii=True)[:500]
                    except Exception:
                        safe_value = str(value)[:500]

                if isinstance(safe_value, str):
                    max_chars = 20000 if is_code_snapshot_key else 500
                    if len(safe_value) > max_chars:
                        safe_value = safe_value[:max_chars]
                normalized_details[safe_key] = safe_value

        timestamp = (datetime.now() - self.session_start).total_seconds()
        event_id = f"SNAP-{len(self.data.code_history) + 1:04d}"
        normalized_details.setdefault("snapshotId", event_id)
        self.data.code_history.append(
            CodeHistoryEntry(
                event_id=event_id,
                actor=safe_actor,
                event_type=safe_event_type,
                summary=safe_summary,
                timestamp=timestamp,
                language=safe_language,
                details=normalized_details,
            )
        )

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
