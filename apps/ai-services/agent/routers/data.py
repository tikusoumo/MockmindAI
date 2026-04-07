from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel

from ..data_store import add_scheduled_session, store

router = APIRouter(prefix="/api", tags=["data"])


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
    type: str | None = None
    description: str | None = None
    difficulty: str | None = None
    mode: str | None = None
    persona: str | None = None
    accessType: str | None = None

@router.post("/sessions")
def create_session(body: SessionData) -> dict:
    """Create a mock session."""
    return {"id": "req_" + str(uuid4())}

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
