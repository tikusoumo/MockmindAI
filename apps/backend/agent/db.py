from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, create_engine

from .settings import settings


_engine = None


def is_db_configured() -> bool:
    return bool(settings.database_url)


def get_engine():
    global _engine

    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is not configured")

    if _engine is None:
        _engine = create_engine(settings.database_url, pool_pre_ping=True)

    return _engine


@contextmanager
def session_scope() -> Iterator[Session]:
    engine = get_engine()
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
