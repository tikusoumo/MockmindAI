from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..data_store import (
    add_interview_session,
    add_scheduled_session,
    get_interview_session,
    store,
)

router = APIRouter(prefix="/api", tags=["data"])

MAX_AI_INTERVIEWERS = 4
MIN_HISTORY_INTERVAL_SECONDS = 5
MAX_HISTORY_INTERVAL_SECONDS = 300

PERSONA_DISPLAY_NAME_MAP = {
    "sarah": "Sarah",
    "david": "David",
    "alex": "Alex",
    "maya": "Maya",
}


class User(BaseModel):
    name: str
    role: str
    avatar: str
    level: str


class InterviewTemplate(BaseModel):
    id: str
    title: str
    description: str
    duration: str
    difficulty: str
    icon: str
    color: str
    type: str | None = None
    questions: list[dict] | None = None
    mode: str | None = None
    persona: str | None = None


class ProgressStat(BaseModel):
    label: str
    value: int
    change: int
    history: list[int]


class ScheduledSession(BaseModel):
    id: str
    title: str
    date: str
    time: str
    interviewer: str


class CreateScheduledSession(BaseModel):
    title: str
    date: str
    time: str
    interviewer: str


@router.get("/user", response_model=User)
def get_user() -> dict:
    """Get current user from in-memory store."""
    return store.user


@router.put("/user", response_model=User)
def update_user(body: User) -> dict:
    """Update user in in-memory store."""
    store.user = body.model_dump()
    return store.user


@router.get("/interview-templates", response_model=list[InterviewTemplate])
def get_interview_templates() -> list[dict]:
    """Get interview templates from in-memory store."""
    return store.interview_templates


@router.get("/progress-stats", response_model=list[ProgressStat])
def get_progress_stats() -> list[dict]:
    """Get progress stats from in-memory store."""
    return store.progress_stats


@router.get("/schedule", response_model=list[ScheduledSession])
def get_schedule() -> list[dict]:
    """Get schedule from in-memory store."""
    return store.schedule


@router.post("/schedule", response_model=ScheduledSession)
def create_schedule(body: CreateScheduledSession) -> dict:
    """Create a scheduled session in in-memory store."""
    return add_scheduled_session(body.model_dump())


@router.get("/report/latest")
def get_latest_report() -> dict:
    """Get latest report from in-memory store."""
    return store.report_latest


@router.get("/community/posts")
def get_community_posts() -> list[dict]:
    """Get community posts from in-memory store."""
    return store.community_posts


@router.get("/interviews/past")
def get_past_interviews() -> list[dict]:
    """Get past interviews from in-memory store."""
    return store.past_interviews

class SessionData(BaseModel):
    title: str | None = None
    topic: str | None = None
    type: str | None = None
    description: str | None = None
    focusAreas: str | None = None
    difficulty: str | None = None
    mode: str | None = None
    aiBehavior: str | None = None
    persona: str | None = None
    accessType: str | None = None
    interviewerCount: int | str | None = None
    invites: list[dict[str, Any]] | None = None
    aiAgents: list[dict[str, Any]] | None = None
    files: list[dict[str, Any]] | None = None
    historySnapshotIntervalSec: int | None = None
    systemPrompt: str | None = None


def _normalize_persona_key(raw: str | None) -> str:
    normalized = str(raw or "sarah").strip().lower()
    return normalized or "sarah"


def _persona_display_name(persona_key: str) -> str:
    if persona_key in PERSONA_DISPLAY_NAME_MAP:
        return PERSONA_DISPLAY_NAME_MAP[persona_key]
    cleaned = "".join(ch for ch in persona_key if ch.isalnum() or ch in {"-", "_", " "}).strip()
    if not cleaned:
        return "Sarah"
    return cleaned[:1].upper() + cleaned[1:]


def _normalize_designation(raw: str | None, index: int) -> str:
    designation = str(raw or "").strip()
    if designation:
        return designation
    return "Technical Head" if index == 0 else "Panel Interviewer"


def _normalize_history_interval(raw: int | None) -> int:
    parsed = int(raw or 30)
    return max(MIN_HISTORY_INTERVAL_SECONDS, min(MAX_HISTORY_INTERVAL_SECONDS, parsed))


def _parse_ai_agents_from_system_prompt(raw_system_prompt: str | None) -> list[dict[str, Any]]:
    if not raw_system_prompt:
        return []

    try:
        parsed = json.loads(raw_system_prompt)
        if not isinstance(parsed, dict):
            return []
        raw_agents = parsed.get("aiAgents")
        if isinstance(raw_agents, list):
            return [entry for entry in raw_agents if isinstance(entry, dict)]
    except Exception:
        return []

    return []


def _build_ai_agents(body: SessionData) -> list[dict[str, str]]:
    raw_agents = [entry for entry in (body.aiAgents or []) if isinstance(entry, dict)]
    if not raw_agents:
        raw_agents = _parse_ai_agents_from_system_prompt(body.systemPrompt)

    if raw_agents:
        normalized = []
        for index, agent in enumerate(raw_agents[:MAX_AI_INTERVIEWERS]):
            persona = _normalize_persona_key(str(agent.get("persona") or body.persona or "sarah"))
            normalized.append(
                {
                    "persona": persona,
                    "displayName": _persona_display_name(persona),
                    "designation": _normalize_designation(str(agent.get("designation") or ""), index),
                }
            )
        return normalized

    try:
        requested_count = int(body.interviewerCount or 1)
    except (TypeError, ValueError):
        requested_count = 1

    panel_size = max(1, min(MAX_AI_INTERVIEWERS, requested_count))
    primary_persona = _normalize_persona_key(body.persona)
    persona_pool = [primary_persona, "david", "alex", "maya"]

    normalized = []
    for index in range(panel_size):
        persona = _normalize_persona_key(persona_pool[index] if index < len(persona_pool) else primary_persona)
        normalized.append(
            {
                "persona": persona,
                "displayName": _persona_display_name(persona),
                "designation": _normalize_designation(None, index),
            }
        )
    return normalized


def _merge_system_prompt(base_prompt: str | None, ai_agents: list[dict[str, str]], history_interval_sec: int) -> str:
    payload: dict[str, Any] = {}
    normalized_base = (base_prompt or "").strip()

    if normalized_base:
        try:
            parsed = json.loads(normalized_base)
            if isinstance(parsed, dict):
                payload = dict(parsed)
            else:
                payload = {"prompt": normalized_base}
        except Exception:
            payload = {"prompt": normalized_base}

    payload["aiAgents"] = [
        {"persona": agent["persona"], "designation": agent["designation"]}
        for agent in ai_agents
    ]
    payload["historySnapshotIntervalSec"] = history_interval_sec
    return json.dumps(payload)

@router.post("/sessions")
def create_session(body: SessionData) -> dict:
    """Create and persist a mock session with participants for interview UI."""
    session_id = "req_" + str(uuid4())
    ai_agents = _build_ai_agents(body)
    history_interval_sec = _normalize_history_interval(body.historySnapshotIntervalSec)

    participants: list[dict[str, Any]] = []

    current_user_name = str(store.user.get("name") or "You")
    current_user_email = str(store.user.get("email") or "candidate@example.com")
    participants.append(
        {
            "id": "self",
            "email": current_user_email,
            "name": current_user_name,
            "role": "Candidate",
            "status": "joined",
        }
    )

    for index, agent in enumerate(ai_agents):
        persona_key = _normalize_persona_key(agent["persona"])
        participants.append(
            {
                "id": f"ai-{index + 1}",
                "email": f"ai-agent+{index + 1}-{persona_key}@virtual.interview.local",
                "name": f"{agent['displayName']} ({agent['designation']})",
                "role": "Interviewer",
                "status": "joined",
            }
        )

    for index, invite in enumerate(body.invites or []):
        email = str((invite or {}).get("email") or "").strip()
        if not email:
            continue

        role_raw = str((invite or {}).get("role") or "observer").strip().lower()
        role = {
            "candidate": "Candidate",
            "interviewer": "Interviewer",
            "observer": "Observer",
        }.get(role_raw, "Observer")

        participants.append(
            {
                "id": f"inv-{index + 1}",
                "email": email,
                "name": email.split("@")[0],
                "role": role,
                "status": "invited",
            }
        )

    primary_ai_name = ai_agents[0]["displayName"] if ai_agents else _persona_display_name(_normalize_persona_key(body.persona))
    merged_system_prompt = _merge_system_prompt(body.systemPrompt, ai_agents, history_interval_sec)

    add_interview_session(
        {
            "id": session_id,
            "title": body.topic or body.title or "Custom Interview Session",
            "type": body.type or "Technical",
            "focusAreas": body.description or body.focusAreas or "",
            "difficulty": body.difficulty or "Medium",
            "aiBehavior": body.mode or body.aiBehavior or "learning",
            "persona": primary_ai_name,
            "accessType": body.accessType or "link",
            "historySnapshotIntervalSec": history_interval_sec,
            "systemPrompt": merged_system_prompt,
            "files": body.files or [],
            "participants": participants,
        }
    )

    return {"id": session_id}


@router.get("/sessions/{session_id}")
def get_session(session_id: str) -> dict:
    session = get_interview_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session

@router.post("/interview-templates")
def create_template(body: InterviewTemplate) -> dict:
    """Create interview template."""
    store.interview_templates.append(body.model_dump())
    return body.model_dump()

@router.patch("/interview-templates/{template_id}")
def update_template(template_id: str, body: dict) -> dict:
    """Update interview template."""
    for t in store.interview_templates:
        if t["id"] == template_id:
            t.update(body)
            return t
    return body
