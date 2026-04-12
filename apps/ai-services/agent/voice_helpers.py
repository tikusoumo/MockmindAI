"""Shared helper utilities for the voice agent runtime."""

from __future__ import annotations

import asyncio
import re
from collections.abc import AsyncIterable
from typing import Any


def _install_livekit_room_destructor_guard() -> None:
    """Guard older LiveKit Room.__del__ against partially initialized instances."""
    try:
        from livekit.rtc.room import Room
    except Exception:
        return

    original_del = getattr(Room, "__del__", None)
    if not callable(original_del):
        return
    if getattr(Room, "_safe_destructor_patched", False):
        return

    def _safe_del(self):
        if getattr(self, "_ffi_handle", None) is None:
            return
        try:
            original_del(self)
        except AttributeError:
            return

    Room.__del__ = _safe_del
    setattr(Room, "_safe_destructor_patched", True)


def _install_asyncio_loop_destructor_guard() -> None:
    """Guard asyncio loop destructor for partially initialized loop objects."""
    original_del = getattr(asyncio.BaseEventLoop, "__del__", None)
    if not callable(original_del):
        return
    if getattr(asyncio.BaseEventLoop, "_safe_loop_destructor_patched", False):
        return

    def _safe_del(self):
        if not hasattr(self, "_closed"):
            return
        try:
            original_del(self)
        except AttributeError:
            return

    asyncio.BaseEventLoop.__del__ = _safe_del
    setattr(asyncio.BaseEventLoop, "_safe_loop_destructor_patched", True)


def _collect_text_content(content: Any) -> str:
    """Extract plain text from SDK message content variants."""
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
            else:
                text = getattr(item, "text", None)
                if isinstance(text, str):
                    parts.append(text)
        return " ".join(parts)

    return str(content or "")


def _compact_text(value: str, max_chars: int) -> str:
    """Normalize whitespace and cap text length conservatively."""
    normalized = re.sub(r"\s+", " ", value).strip()
    if len(normalized) <= max_chars:
        return normalized
    clipped = normalized[:max_chars].rsplit(" ", 1)[0]
    return (clipped or normalized[:max_chars]) + " ..."


_TOOL_CALL_BLOCK_RE = re.compile(
    r"<\s*tool_call\s*>.*?<\s*/\s*tool_call\s*>",
    flags=re.IGNORECASE | re.DOTALL,
)
_TOOL_CALL_TAG_RE = re.compile(r"<\s*/?\s*tool_call\s*>", flags=re.IGNORECASE)
_INTERNAL_TOOL_NAME_RE = re.compile(
    r"\b(read_candidates_code|update_candidate_code|run_candidate_tests|request_document_context|provide_feedback|get_interview_tip)\b",
    flags=re.IGNORECASE,
)

_EDITOR_SURFACE_HINTS = (
    "editor",
    "ide",
    "code tab",
    "coding tab",
)

_EDITOR_WRITE_ACTION_HINTS = (
    "type",
    "write",
    "put",
    "paste",
    "insert",
    "edit",
    "update",
    "add",
)


def _sanitize_assistant_text_for_speech(text: str) -> str:
    cleaned = _TOOL_CALL_BLOCK_RE.sub(" ", text or "")
    cleaned = _TOOL_CALL_TAG_RE.sub(" ", cleaned)
    cleaned = _INTERNAL_TOOL_NAME_RE.sub(" ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def _looks_like_editor_write_request(text: str) -> bool:
    lowered = (text or "").lower()
    if not lowered:
        return False

    has_editor_hint = any(token in lowered for token in _EDITOR_SURFACE_HINTS)
    has_write_hint = any(token in lowered for token in _EDITOR_WRITE_ACTION_HINTS)
    return has_editor_hint and has_write_hint


async def _filter_internal_tool_markup(text: AsyncIterable[str]) -> AsyncIterable[str]:
    """Strip leaked tool-call tags/names from streamed assistant text before TTS."""
    buffer = ""
    safety_tail = 256

    async for chunk in text:
        buffer += chunk
        if len(buffer) <= safety_tail * 2:
            continue

        emit_text = buffer[:-safety_tail]
        sanitized = _sanitize_assistant_text_for_speech(emit_text)
        if sanitized:
            yield sanitized
        buffer = buffer[-safety_tail:]

    tail = _sanitize_assistant_text_for_speech(buffer)
    if tail:
        yield tail


def _cap_context_chunks(
    chunks: list[str],
    *,
    max_chunks: int,
    chunk_max_chars: int,
    total_max_chars: int,
) -> list[str]:
    """Bound context size before injecting into prompts."""
    limited: list[str] = []
    current_size = 0

    for raw in chunks:
        if len(limited) >= max_chunks:
            break

        compact = _compact_text(raw, chunk_max_chars)
        if not compact:
            continue

        projected = current_size + len(compact)
        if limited:
            projected += len("\n---\n")

        if projected > total_max_chars:
            break

        limited.append(compact)
        current_size = projected

    return limited


_DOC_CONTEXT_BLOCK_RE = re.compile(
    r"\[DOCUMENTS / CONTEXT PROVIDED\].*?\[END CONTEXT\]\s*",
    flags=re.DOTALL,
)

_DELIVERY_SIGNAL_BLOCK_RE = re.compile(
    r"\[REAL-TIME DELIVERY SIGNALS\].*?\[END DELIVERY SIGNALS\]\s*",
    flags=re.DOTALL,
)

_TOOL_USAGE_GUARD_RE = re.compile(
    r"\[TOOL USAGE GUARD\].*?\[END TOOL USAGE GUARD\]\s*",
    flags=re.DOTALL,
)


def _clone_chat_item(item: Any) -> Any:
    """Create a deep clone when supported to avoid mutating persistent chat history."""
    if hasattr(item, "model_copy"):
        try:
            return item.model_copy(deep=True)
        except Exception:
            pass

    if hasattr(item, "copy"):
        try:
            return item.copy(deep=True)
        except Exception:
            pass

    return item


def _strip_injected_doc_context(value: str) -> str:
    """Remove previously injected context blocks so they do not snowball across turns."""
    cleaned = value
    if "[DOCUMENTS / CONTEXT PROVIDED]" in cleaned and "[END CONTEXT]" in cleaned:
        cleaned = _DOC_CONTEXT_BLOCK_RE.sub("", cleaned)
    if "[REAL-TIME DELIVERY SIGNALS]" in cleaned and "[END DELIVERY SIGNALS]" in cleaned:
        cleaned = _DELIVERY_SIGNAL_BLOCK_RE.sub("", cleaned)
    if "[TOOL USAGE GUARD]" in cleaned and "[END TOOL USAGE GUARD]" in cleaned:
        cleaned = _TOOL_USAGE_GUARD_RE.sub("", cleaned)

    cleaned = cleaned.strip()
    if cleaned.startswith("Question / Speech:"):
        cleaned = cleaned.split(":", 1)[1].strip()
    return cleaned or value


def _extract_context_items(chat_ctx: Any) -> list[Any]:
    """Read context items across SDK variants (`items` or legacy `messages`)."""
    items_obj = getattr(chat_ctx, "items", None)
    if callable(items_obj):
        items_obj = items_obj()

    if items_obj is None:
        items_obj = getattr(chat_ctx, "messages", None)
        if callable(items_obj):
            items_obj = items_obj()

    if items_obj is None:
        return []

    if isinstance(items_obj, list):
        return items_obj

    try:
        return list(items_obj)
    except TypeError:
        return []
