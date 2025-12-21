from __future__ import annotations

"""Legacy models module.

This repo migrated to SQLModel models in `agent/models_sql.py`.
This module remains for backward compatibility with any lingering imports.
"""

from .models_sql import ScheduledSession as ScheduledSessionORM
