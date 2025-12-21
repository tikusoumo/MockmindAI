from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import select

from ..data_store import add_scheduled_session, store
from ..db import is_db_configured, session_scope
from ..models_sql import (
    CommunityPost,
    InterviewTemplate as InterviewTemplateRow,
    PastInterview,
    ProgressStat as ProgressStatRow,
    QuestionFeedback,
    Report,
    ScheduledSession as ScheduledSessionRow,
    TranscriptEntry,
    User as UserRow,
)

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
    if not is_db_configured():
        return store.user

    with session_scope() as session:
        row = session.exec(select(UserRow)).first()
        if row is None:
            return store.user
        return {"name": row.name, "role": row.role, "avatar": row.avatar, "level": row.level}


@router.put("/user", response_model=User)
def update_user(body: User) -> dict:
    if not is_db_configured():
        store.user = body.model_dump()
        return store.user

    with session_scope() as session:
        row = session.exec(select(UserRow)).first()
        if row is None:
            row = UserRow(**body.model_dump())
            session.add(row)
        else:
            row.name = body.name
            row.role = body.role
            row.avatar = body.avatar
            row.level = body.level
            session.add(row)

        return {"name": row.name, "role": row.role, "avatar": row.avatar, "level": row.level}


@router.get("/interview-templates", response_model=list[InterviewTemplate])
def get_interview_templates() -> list[dict]:
    if not is_db_configured():
        return store.interview_templates

    with session_scope() as session:
        rows = session.exec(select(InterviewTemplateRow)).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "description": r.description,
                "duration": r.duration,
                "difficulty": r.difficulty,
                "icon": r.icon,
                "color": r.color,
            }
            for r in rows
        ]


@router.get("/progress-stats", response_model=list[ProgressStat])
def get_progress_stats() -> list[dict]:
    if not is_db_configured():
        return store.progress_stats

    with session_scope() as session:
        rows = session.exec(select(ProgressStatRow)).all()
        return [
            {
                "label": r.label,
                "value": r.value,
                "change": r.change,
                "history": r.history,
            }
            for r in rows
        ]


@router.get("/schedule", response_model=list[ScheduledSession])
def get_schedule() -> list[dict]:
    if not is_db_configured():
        return store.schedule

    with session_scope() as session:
        rows = session.exec(
            select(ScheduledSessionRow).order_by(ScheduledSessionRow.date, ScheduledSessionRow.time)
        ).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "date": r.date,
                "time": r.time,
                "interviewer": r.interviewer,
            }
            for r in rows
        ]


@router.post("/schedule", response_model=ScheduledSession)
def create_schedule(body: CreateScheduledSession) -> dict:
    if not is_db_configured():
        return add_scheduled_session(body.model_dump())

    created = {
        "id": str(uuid4()),
        "title": body.title,
        "date": body.date,
        "time": body.time,
        "interviewer": body.interviewer,
    }

    with session_scope() as session:
        session.add(ScheduledSessionRow(**created))

    return created


@router.get("/report/latest")
def get_latest_report() -> dict:
    if not is_db_configured():
        return store.report_latest

    with session_scope() as session:
        report = session.exec(select(Report).order_by(Report.date.desc())).first()
        if report is None:
            return store.report_latest

        transcript = session.exec(
            select(TranscriptEntry)
            .where(TranscriptEntry.report_id == report.id)
            .order_by(TranscriptEntry.id)
        ).all()
        questions = session.exec(
            select(QuestionFeedback)
            .where(QuestionFeedback.report_id == report.id)
            .order_by(QuestionFeedback.id)
        ).all()

        return {
            "id": report.id,
            "date": report.date,
            "overallScore": report.overallScore,
            "duration": report.duration,
            "hardSkillsScore": report.hardSkillsScore,
            "softSkillsScore": report.softSkillsScore,
            "radarData": report.radarData,
            "timelineData": report.timelineData,
            "transcript": [
                {"speaker": t.speaker, "text": t.text, "timestamp": t.timestamp}
                for t in transcript
            ],
            "fillerWordsAnalysis": report.fillerWordsAnalysis,
            "pacingAnalysis": report.pacingAnalysis,
            "questions": [
                {
                    "id": q.id,
                    "question": q.question,
                    "userAnswerSummary": q.userAnswerSummary,
                    "aiFeedback": q.aiFeedback,
                    "score": q.score,
                    "improvements": q.improvements,
                    "audioUrl": q.audioUrl,
                }
                for q in questions
            ],
            "behavioralAnalysis": report.behavioralAnalysis,
            "swot": report.swot,
            "resources": report.resources,
        }


@router.get("/community/posts")
def get_community_posts() -> list[dict]:
    if not is_db_configured():
        return store.community_posts

    with session_scope() as session:
        rows = session.exec(select(CommunityPost)).all()
        return [
            {
                "id": r.id,
                "author": r.author,
                "content": r.content,
                "likes": r.likes,
                "comments": r.comments,
                "timestamp": r.timestamp,
                "tags": r.tags,
            }
            for r in rows
        ]


@router.get("/interviews/past")
def get_past_interviews() -> list[dict]:
    if not is_db_configured():
        return store.past_interviews

    with session_scope() as session:
        rows = session.exec(select(PastInterview)).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "date": r.date,
                "duration": r.duration,
                "score": r.score,
                "type": r.type,
            }
            for r in rows
        ]
