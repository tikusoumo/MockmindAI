from __future__ import annotations

from dataclasses import dataclass

from livekit.api import LiveKitAPI

from .settings import settings


@dataclass(frozen=True)
class LiveKitConfig:
    url: str
    api_key: str
    api_secret: str


def get_livekit_config() -> LiveKitConfig | None:
    if not settings.livekit_url or not settings.livekit_api_key or not settings.livekit_api_secret:
        return None

    return LiveKitConfig(
        url=str(settings.livekit_url),
        api_key=settings.livekit_api_key,
        api_secret=settings.livekit_api_secret,
    )


def create_livekit_api() -> LiveKitAPI | None:
    cfg = get_livekit_config()
    if cfg is None:
        return None
    return LiveKitAPI(url=cfg.url, api_key=cfg.api_key, api_secret=cfg.api_secret)
