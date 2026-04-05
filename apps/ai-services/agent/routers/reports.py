"""Reports API router for the AI service.

Provides endpoints for report generation from session data.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
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

REPORT_GENERATION_TIMEOUT_SECONDS = int(
    os.getenv("REPORT_GENERATION_TIMEOUT_SECONDS", "180")
)
REPORT_WEBHOOK_MAX_ATTEMPTS = int(os.getenv("REPORT_WEBHOOK_MAX_ATTEMPTS", "3"))
REPORT_WEBHOOK_RETRY_BASE_DELAY_SECONDS = float(
    os.getenv("REPORT_WEBHOOK_RETRY_BASE_DELAY_SECONDS", "1.0")
)
REPORT_WEBHOOK_URL = os.getenv(
    "REPORT_WEBHOOK_URL", "http://api:8000/api/reports/webhook"
)


def store_session(session_data: SessionData, session_id: str | None = None) -> None:
    """Store session data for later report generation."""
    _session_cache[session_data.metadata.room_name] = session_data
    if session_id:
        _session_cache[session_id] = session_data


def get_session(session_id: str) -> SessionData | None:
    """Retrieve stored session data."""
    return _session_cache.get(session_id)


class ProcessSessionRequest(BaseModel):
    session_id: str
    session_data: dict[str, Any]


def _format_mmss(total_seconds: int) -> str:
    minutes = max(0, total_seconds) // 60
    seconds = max(0, total_seconds) % 60
    return f"{minutes:02d}:{seconds:02d}"


def _safe_duration_seconds(session_data: SessionData) -> int:
    started = session_data.metadata.started_at
    ended = session_data.metadata.ended_at
    if started and ended:
        return max(0, int((ended - started).total_seconds()))
    if session_data.transcript:
        return max(0, int(session_data.transcript[-1].timestamp))
    return 0


def _transcript_payload(session_data: SessionData) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for entry in session_data.transcript:
        speaker = "Interviewer" if entry.speaker.value == "interviewer" else "You"
        timestamp = _format_mmss(int(entry.timestamp))
        entries.append(
            {
                "speaker": speaker,
                "text": entry.text,
                "timestamp": timestamp,
            }
        )
    return entries


def _build_fallback_payload(
    session_id: str,
    session_data: SessionData,
    reason: str,
) -> dict[str, Any]:
    transcript = _transcript_payload(session_data)
    if not transcript:
        transcript = [
            {
                "speaker": "Interviewer",
                "text": (
                    "Report content is unavailable because automated generation "
                    f"failed ({reason})."
                ),
                "timestamp": "00:00",
            }
        ]

    return {
        "id": f"rep_{session_id[:8]}",
        "session_id": session_id,
        "date": datetime.now(timezone.utc).isoformat(),
        "overallScore": 0,
        "duration": _format_mmss(_safe_duration_seconds(session_data)),
        "hardSkillsScore": 0,
        "softSkillsScore": 0,
        "radarData": [],
        "timelineData": [],
        "questions": [],
        "transcript": transcript,
        "fillerWordsAnalysis": [],
        "pacingAnalysis": [],
        "behavioralAnalysis": {
            "eyeContact": "Good",
            "fillerWords": "Low",
            "pace": "Good",
            "clarity": "Medium",
        },
        "swot": {
            "strengths": [],
            "weaknesses": [],
            "opportunities": [],
            "threats": [],
        },
        "resources": [],
    }


@router.post("/process")
async def process_session_endpoint(request: ProcessSessionRequest) -> dict[str, Any]:
    """Process a completed session and push the webhook in background."""
    logger.info(f"Received session data for fast background processing: {request.session_id}")
    try:
        if not request.session_id:
            raise HTTPException(status_code=400, detail="session_id is required")
        session_data = SessionData.from_dict(request.session_data)
        store_session(session_data, request.session_id)
        asyncio.create_task(run_and_push_webhook(request.session_id, session_data))
        return {"status": "accepted"}
    except Exception as e:
        logger.error(f"Error processing session data: {e}")
        raise HTTPException(status_code=400, detail=str(e))


async def run_and_push_webhook(session_id: str, session_data: SessionData) -> None:
    """Generates the report from LLM and sends webhook."""
    import aiohttp

    payload: dict[str, Any]

    try:
        generator = ReportGenerator()
        report = await asyncio.wait_for(
            asyncio.to_thread(generator.generate, session_data),
            timeout=REPORT_GENERATION_TIMEOUT_SECONDS,
        )
        payload = report.to_dict()
        payload["session_id"] = session_id
    except asyncio.TimeoutError:
        logger.error(
            "Report generation timed out after %ss for session_id=%s",
            REPORT_GENERATION_TIMEOUT_SECONDS,
            session_id,
        )
        payload = _build_fallback_payload(session_id, session_data, "generation_timeout")
    except Exception as e:
        logger.error(f"Failed to generate report for session_id={session_id}: {e}")
        payload = _build_fallback_payload(session_id, session_data, "generation_error")

    timeout = aiohttp.ClientTimeout(total=15)

    for attempt in range(1, REPORT_WEBHOOK_MAX_ATTEMPTS + 1):
        try:
            async with aiohttp.ClientSession(timeout=timeout) as http_session:
                async with http_session.post(REPORT_WEBHOOK_URL, json=payload) as response:
                    if response.status >= 400:
                        body = await response.text()
                        raise RuntimeError(f"{response.status} - {body}")

                    logger.info(
                        "Webhook pushed successfully from background task: status=%s, session_id=%s",
                        response.status,
                        session_id,
                    )
                    return
        except Exception as e:
            if attempt >= REPORT_WEBHOOK_MAX_ATTEMPTS:
                logger.error(
                    "Failed to push report webhook after %s attempts for session_id=%s: %s",
                    REPORT_WEBHOOK_MAX_ATTEMPTS,
                    session_id,
                    e,
                )
                return

            backoff = REPORT_WEBHOOK_RETRY_BASE_DELAY_SECONDS * attempt
            logger.warning(
                "Webhook push attempt %s/%s failed for session_id=%s; retrying in %.1fs: %s",
                attempt,
                REPORT_WEBHOOK_MAX_ATTEMPTS,
                session_id,
                backoff,
                e,
            )
            await asyncio.sleep(backoff)


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


@router.get("/latest")
async def get_latest_report() -> dict[str, Any]:
    """Get the most recently generated report or generate a mock from the latest session.
    
    This is called by the Next.js frontend to display the final interview summary.
    """
    logger.info("Fetching latest report")
    if not _session_cache:
        # Fallback to mock report if no live sessions exist yet
        request = GenerateReportRequest(session_id="latest_mock")
        # Reuse the mock generation block from generate_report
        return await generate_report(request)
        
    # Get the most recently stored session
    latest_session_id = list(_session_cache.keys())[-1]
    latest_session = _session_cache[latest_session_id]
    
    generator = ReportGenerator()
    report = generator.generate(latest_session)
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
