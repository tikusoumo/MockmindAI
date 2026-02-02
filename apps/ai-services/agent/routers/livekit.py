from __future__ import annotations

from fastapi import APIRouter, HTTPException
from livekit.api import AccessToken, VideoGrants
from pydantic import BaseModel

from ..livekit_client import create_livekit_api
from ..settings import settings

router = APIRouter(prefix="/livekit", tags=["livekit"])


class CreateRoomRequest(BaseModel):
    name: str
    empty_timeout: int | None = None
    max_participants: int | None = None


class CreateTokenRequest(BaseModel):
    room_name: str
    participant_name: str
    metadata: str | None = None


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


@router.post("/token")
async def create_token(body: CreateTokenRequest) -> dict[str, str]:
    """Generate an access token for a participant to join a room."""
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=500, detail="LiveKit is not configured")

    token = AccessToken(
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )

    # Set video grants for the participant
    token.with_grants(
        VideoGrants(
            room_join=True,
            room=body.room_name,
            can_publish=True,
            can_subscribe=True,
        )
    ).with_identity(body.participant_name)

    if body.metadata:
        token.with_metadata(body.metadata)

    return {
        "token": token.to_jwt(),
        "url": settings.livekit_public_url,
    }


@router.post("/agent-token")
async def create_agent_token(body: CreateTokenRequest) -> dict[str, str]:
    """Generate an access token specifically for an agent to join a room."""
    if not settings.livekit_api_key or not settings.livekit_api_secret:
        raise HTTPException(status_code=500, detail="LiveKit is not configured")

    token = AccessToken(
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )

    # Agents need special permissions
    token.with_grants(
        VideoGrants(
            room_join=True,
            room=body.room_name,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
        )
    ).with_identity(f"agent-{body.participant_name}")

    if body.metadata:
        token.with_metadata(body.metadata)

    return {
        "token": token.to_jwt(),
        "url": settings.livekit_public_url,
    }
