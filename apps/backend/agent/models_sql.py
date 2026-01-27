from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: Optional[str] = Field(default=None, index=True)
    password_hash: Optional[str] = None
    role: str
    avatar: str
    level: str


class InterviewTemplate(SQLModel, table=True):
    __tablename__ = "interview_templates"

    id: str = Field(primary_key=True)
    title: str
    description: str
    duration: str
    difficulty: str
    icon: str
    color: str


class ProgressStat(SQLModel, table=True):
    __tablename__ = "progress_stats"

    id: Optional[int] = Field(default=None, primary_key=True)
    label: str
    value: int
    change: int
    history: list[int] = Field(sa_column=Column(JSONB), default_factory=list)


class ScheduledSession(SQLModel, table=True):
    __tablename__ = "scheduled_sessions"

    id: str = Field(primary_key=True)
    title: str
    date: str
    time: str
    interviewer: str


class Report(SQLModel, table=True):
    __tablename__ = "reports"

    id: str = Field(primary_key=True)
    date: str
    overallScore: int
    duration: str
    hardSkillsScore: int
    softSkillsScore: int
    radarData: list[dict[str, Any]] = Field(sa_column=Column(JSONB), default_factory=list)
    timelineData: list[dict[str, Any]] = Field(sa_column=Column(JSONB), default_factory=list)
    fillerWordsAnalysis: list[dict[str, Any]] = Field(sa_column=Column(JSONB), default_factory=list)
    pacingAnalysis: list[dict[str, Any]] = Field(sa_column=Column(JSONB), default_factory=list)
    behavioralAnalysis: dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    swot: dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    resources: list[dict[str, Any]] = Field(sa_column=Column(JSONB), default_factory=list)


class QuestionFeedback(SQLModel, table=True):
    __tablename__ = "question_feedback"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id")
    question: str
    userAnswerSummary: str
    aiFeedback: str
    score: int
    improvements: list[str] = Field(sa_column=Column(JSONB), default_factory=list)
    audioUrl: Optional[str] = None


class TranscriptEntry(SQLModel, table=True):
    __tablename__ = "transcript_entries"

    id: Optional[int] = Field(default=None, primary_key=True)
    report_id: str = Field(foreign_key="reports.id")
    speaker: str
    text: str
    timestamp: str


class CommunityPost(SQLModel, table=True):
    __tablename__ = "community_posts"

    id: str = Field(primary_key=True)
    author: dict[str, Any] = Field(sa_column=Column(JSONB), default_factory=dict)
    content: str
    likes: int
    comments: int
    timestamp: str
    tags: list[str] = Field(sa_column=Column(JSONB), default_factory=list)


class PastInterview(SQLModel, table=True):
    __tablename__ = "past_interviews"

    id: str = Field(primary_key=True)
    title: str
    date: str
    duration: str
    score: int
    type: str
