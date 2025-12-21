from __future__ import annotations

from sqlmodel import select

from .data_store import store
from .db import is_db_configured, session_scope
from .models_sql import (
    CommunityPost,
    InterviewTemplate,
    PastInterview,
    ProgressStat,
    QuestionFeedback,
    Report,
    ScheduledSession,
    TranscriptEntry,
    User,
)


def seed_if_empty() -> bool:
    """Seed the database with the mock dataset.

    Idempotent behavior: if a User already exists, seeding is skipped.
    """

    if not is_db_configured():
        return False

    with session_scope() as session:
        existing_user = session.exec(select(User)).first()
        if existing_user is not None:
            return False

        session.add(
            User(
                name=store.user["name"],
                role=store.user["role"],
                avatar=store.user["avatar"],
                level=store.user["level"],
            )
        )

        for template in store.interview_templates:
            session.add(InterviewTemplate(**template))

        for stat in store.progress_stats:
            session.add(ProgressStat(**stat))

        for item in store.schedule:
            session.add(ScheduledSession(**item))

        report = store.report_latest
        report_row = Report(
            id=report["id"],
            date=report["date"],
            overallScore=report["overallScore"],
            duration=report["duration"],
            hardSkillsScore=report["hardSkillsScore"],
            softSkillsScore=report["softSkillsScore"],
            radarData=report.get("radarData", []),
            timelineData=report.get("timelineData", []),
            fillerWordsAnalysis=report.get("fillerWordsAnalysis", []),
            pacingAnalysis=report.get("pacingAnalysis", []),
            behavioralAnalysis=report.get("behavioralAnalysis", {}),
            swot=report.get("swot", {}),
            resources=report.get("resources", []),
        )
        session.add(report_row)
        # Ensure parent exists before inserting FK children.
        session.flush()

        for entry in report.get("transcript", []):
            session.add(
                TranscriptEntry(
                    report_id=report["id"],
                    speaker=entry["speaker"],
                    text=entry["text"],
                    timestamp=entry["timestamp"],
                )
            )

        for q in report.get("questions", []):
            session.add(
                QuestionFeedback(
                    id=q.get("id"),
                    report_id=report["id"],
                    question=q["question"],
                    userAnswerSummary=q["userAnswerSummary"],
                    aiFeedback=q["aiFeedback"],
                    score=q["score"],
                    improvements=q.get("improvements", []),
                    audioUrl=q.get("audioUrl"),
                )
            )

        for post in store.community_posts:
            session.add(CommunityPost(**post))

        for interview in store.past_interviews:
            session.add(PastInterview(**interview))

        return True


def main() -> None:
    seeded = seed_if_empty()
    if seeded:
        print("Seeded database with initial data")


if __name__ == "__main__":
    main()
