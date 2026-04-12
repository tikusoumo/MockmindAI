"""Room metadata parsing helpers for LiveKit sessions."""

from __future__ import annotations

import json
from typing import Any


def parse_room_metadata(metadata_str: str | None) -> dict[str, Any]:
    """Parse room metadata JSON string."""
    if not metadata_str:
        return {}
    try:
        return json.loads(metadata_str)
    except json.JSONDecodeError:
        return {}
