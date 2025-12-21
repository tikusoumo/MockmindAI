from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..livekit_client import create_livekit_api

router = APIRouter(prefix="/livekit", tags=["livekit"])


class CreateRoomRequest(BaseModel):
    name: str
    empty_timeout: int | None = None
    max_participants: int | None = None


@router.post("/rooms")
async def create_room(body: CreateRoomRequest) -> dict[str, object]:
    api = create_livekit_api()
    if api is None:
        raise HTTPException(status_code=500, detail="LiveKit is not configured")

    async with api:
        room = await api.room.create_room(
            name=body.name,
            empty_timeout=body.empty_timeout,
            max_participants=body.max_participants,
        )

    return {
        "name": room.name,
        "sid": room.sid,
    }
