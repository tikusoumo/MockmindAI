"""Reports API router for the AI service.

Provides endpoints for report generation from session data.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..session_collector import SessionData, SessionMetadata
from ..analysis import ReportGenerator

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reports", tags=["reports"])


class GenerateReportRequest(BaseModel):
    """Request to generate an interview report."""
    session_id: str
    template_id: str | None = None


class ReportResponse(BaseModel):
    """Report generation response (minimal)."""
    id: str
    date: str
    overallScore: int
    duration: str
    hardSkillsScore: int
    softSkillsScore: int
    radarData: list[dict[str, Any]]
    timelineData: list[dict[str, Any]]
    questions: list[dict[str, Any]]
    transcript: list[dict[str, Any]]
    fillerWordsAnalysis: list[dict[str, int]]
    pacingAnalysis: list[dict[str, Any]]
    behavioralAnalysis: dict[str, str]
    swot: dict[str, list[str]]
    resources: list[dict[str, str]]


# In-memory session storage (for demo - use Redis/DB in production)
_session_cache: dict[str, SessionData] = {}


def store_session(session_data: SessionData) -> None:
    """Store session data for later report generation."""
    _session_cache[session_data.metadata.room_name] = session_data


def get_session(session_id: str) -> SessionData | None:
    """Retrieve stored session data."""
    return _session_cache.get(session_id)


@router.post("/generate", response_model=ReportResponse)
async def generate_report(request: GenerateReportRequest) -> dict[str, Any]:
    """Generate an interview performance report.
    
    This endpoint is called by the NestJS backend after an interview ends.
    It uses the analysis modules to process the session data.
    """
    logger.info(f"Generating report for session: {request.session_id}")
    
    # Try to find session data
    session_data = get_session(request.session_id)
    
    if not session_data:
        # Create mock session data for development
        from datetime import datetime
        session_data = SessionData(
            metadata=SessionMetadata(
                room_name=request.session_id,
                template_id=request.template_id,
                template_title="Interview Session",
                mode="strict",
                started_at=datetime.now(),
            )
        )
        # Add some mock transcript
        from ..session_collector import TranscriptEntry, SpeakerRole
        session_data.transcript = [
            TranscriptEntry(SpeakerRole.INTERVIEWER, "Tell me about yourself.", 15.0),
            TranscriptEntry(SpeakerRole.CANDIDATE, "I am a software developer with 5 years of experience.", 30.0),
            TranscriptEntry(SpeakerRole.INTERVIEWER, "What are your strengths?", 60.0),
            TranscriptEntry(SpeakerRole.CANDIDATE, "I am good at problem solving and teamwork.", 90.0),
        ]
        session_data.metadata.ended_at = datetime.now()
    
    # Generate report
    generator = ReportGenerator()
    report = generator.generate(session_data)
    
    return report.to_dict()


@router.get("/{report_id}")
async def get_report(report_id: str) -> dict[str, Any]:
    """Get a previously generated report."""
    # In production, fetch from database
    # For now, return a mock
    logger.info(f"Fetching report: {report_id}")
    
    if not report_id.startswith("rep_"):
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Return mock data (would fetch from DB in production)
    from datetime import datetime
    return {
        "id": report_id,
        "date": datetime.now().isoformat(),
        "overallScore": 82,
        "duration": "42:15",
        "status": "completed",
    }
