"""init sqlmodel tables

Revision ID: 20251221_000001
Revises: 
Create Date: 2025-12-21

"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20251221_000001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("avatar", sa.String(), nullable=False),
        sa.Column("level", sa.String(), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "interview_templates",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("duration", sa.String(), nullable=False),
        sa.Column("difficulty", sa.String(), nullable=False),
        sa.Column("icon", sa.String(), nullable=False),
        sa.Column("color", sa.String(), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "progress_stats",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("value", sa.Integer(), nullable=False),
        sa.Column("change", sa.Integer(), nullable=False),
        sa.Column("history", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "scheduled_sessions",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("time", sa.String(), nullable=False),
        sa.Column("interviewer", sa.String(), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "reports",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("overallScore", sa.Integer(), nullable=False),
        sa.Column("duration", sa.String(), nullable=False),
        sa.Column("hardSkillsScore", sa.Integer(), nullable=False),
        sa.Column("softSkillsScore", sa.Integer(), nullable=False),
        sa.Column("radarData", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("timelineData", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "fillerWordsAnalysis", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("pacingAnalysis", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "behavioralAnalysis", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("swot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("resources", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "question_feedback",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("report_id", sa.String(), nullable=False),
        sa.Column("question", sa.String(), nullable=False),
        sa.Column("userAnswerSummary", sa.String(), nullable=False),
        sa.Column("aiFeedback", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("improvements", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("audioUrl", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        if_not_exists=True,
    )

    op.create_table(
        "transcript_entries",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column("report_id", sa.String(), nullable=False),
        sa.Column("speaker", sa.String(), nullable=False),
        sa.Column("text", sa.String(), nullable=False),
        sa.Column("timestamp", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["report_id"], ["reports.id"], ondelete="CASCADE"),
        if_not_exists=True,
    )

    op.create_table(
        "community_posts",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("author", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("content", sa.String(), nullable=False),
        sa.Column("likes", sa.Integer(), nullable=False),
        sa.Column("comments", sa.Integer(), nullable=False),
        sa.Column("timestamp", sa.String(), nullable=False),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        if_not_exists=True,
    )

    op.create_table(
        "past_interviews",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("date", sa.String(), nullable=False),
        sa.Column("duration", sa.String(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("past_interviews")
    op.drop_table("community_posts")
    op.drop_table("transcript_entries")
    op.drop_table("question_feedback")
    op.drop_table("reports")
    op.drop_table("scheduled_sessions")
    op.drop_table("progress_stats")
    op.drop_table("interview_templates")
    op.drop_table("users")
