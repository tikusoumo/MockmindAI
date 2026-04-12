"""Cached RAG query lookup helpers for voice agent interview flows."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any

from .settings import settings
from .voice_helpers import _compact_text

logger = logging.getLogger("voice-agent")

_RAG_EXECUTOR = ThreadPoolExecutor(max_workers=4)
_RAG_CACHE_LOCK = threading.Lock()
_RAG_RESULT_CACHE: dict[str, tuple[float, list[str]]] = {}
_RAG_CACHE_TTL_SECONDS = 45.0
_RAG_CACHE_MAX_ENTRIES = 256


def _normalize_rag_query(query: str) -> str:
    return _compact_text(query.lower(), settings.rag_query_max_chars)


def _rag_cache_key(target_id: str, query: str, k: int) -> str:
    return f"{target_id}|{k}|{_normalize_rag_query(query)}"


def _get_cached_rag_results(cache_key: str) -> list[str] | None:
    now = time.time()
    with _RAG_CACHE_LOCK:
        cached = _RAG_RESULT_CACHE.get(cache_key)
        if not cached:
            return None

        saved_at, chunks = cached
        if now - saved_at > _RAG_CACHE_TTL_SECONDS:
            _RAG_RESULT_CACHE.pop(cache_key, None)
            return None
        return list(chunks)


def _set_cached_rag_results(cache_key: str, chunks: list[str]) -> None:
    now = time.time()
    with _RAG_CACHE_LOCK:
        if len(_RAG_RESULT_CACHE) >= _RAG_CACHE_MAX_ENTRIES:
            oldest_key = min(_RAG_RESULT_CACHE, key=lambda key: _RAG_RESULT_CACHE[key][0])
            _RAG_RESULT_CACHE.pop(oldest_key, None)
        _RAG_RESULT_CACHE[cache_key] = (now, list(chunks))


def _lookup_rag_chunks_with_cache(store: Any, target_id: str, query: str, k: int) -> list[str]:
    cache_key = _rag_cache_key(target_id, query, k)
    cached = _get_cached_rag_results(cache_key)
    if cached is not None:
        logger.debug("RAG cache hit for target '%s'", target_id)
        return cached

    future = _RAG_EXECUTOR.submit(
        store.query_for_interview_sync,
        target_id,
        query,
        k,
    )
    try:
        chunks = future.result(timeout=settings.rag_lookup_timeout_seconds)
    except FutureTimeoutError:
        logger.warning(
            "Qdrant RAG lookup timed out for target '%s' after %.1fs",
            target_id,
            settings.rag_lookup_timeout_seconds,
        )
        return []
    except Exception as rag_err:
        logger.warning("Qdrant RAG lookup failed for target '%s': %s", target_id, rag_err)
        return []

    _set_cached_rag_results(cache_key, chunks)
    logger.info("Qdrant RAG: Found %d hits for target '%s'", len(chunks), target_id)
    return chunks
