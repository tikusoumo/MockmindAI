from __future__ import annotations

from fastapi import APIRouter

from ..livekit_client import get_livekit_config

router = APIRouter()


@router.get("/healthz")
def healthz() -> dict[str, object]:
    """Health check endpoint."""
    lk = get_livekit_config()
    return {
        "ok": True,
        "livekit_configured": lk is not None,
    }
