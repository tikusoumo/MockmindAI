"""
Voice Agent for LiveKit - Interview Coach Assistant

This module implements a voice AI agent using LiveKit's AgentSession API.
It connects to local models (Kokoro TTS, Whisper STT, LLaMA LLM) running
in the local-voice-ai docker-compose network.

Features:
- Mode-aware behavior (Learning vs Strict)
- RAG integration for document-based questions
- Session data collection for post-interview reports
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import urllib.request
import uuid
from typing import Any, Awaitable, Callable

from dotenv import load_dotenv
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    JobProcess,
    cli,
    function_tool,
    RunContext,
)
from livekit.agents import llm as lk_llm
from livekit.plugins import silero

from .analysis.sentiment_analyzer import SentimentAnalyzer
from .model_factory import create_model_components
from .rag_cache import _lookup_rag_chunks_with_cache, _normalize_rag_query
from .room_metadata import parse_room_metadata
from .settings import settings
from .session_collector import SessionCollector
from .voice_helpers import (
    _cap_context_chunks,
    _clone_chat_item,
    _collect_text_content,
    _compact_text,
    _extract_context_items,
    _filter_internal_tool_markup,
    _install_asyncio_loop_destructor_guard,
    _install_livekit_room_destructor_guard,
    _looks_like_editor_write_request,
    _sanitize_assistant_text_for_speech,
    _strip_injected_doc_context,
)

logger = logging.getLogger("voice-agent")

load_dotenv()


_install_livekit_room_destructor_guard()
_install_asyncio_loop_destructor_guard()

class InterviewCoach(Agent):
    """AI Interview Coach Assistant with mode-aware behavior."""
    
    def __init__(
        self,
        mode: str = "strict",
        template_id: str | None = None,
        template_title: str = "",
        collector: SessionCollector | None = None,
        session_id: str | None = None,
        interview_type: str = "",
        custom_description: str = "",
        ide_enabled: bool = False,
        ide_sender: Callable[[dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        # Build instructions based on mode
        base_instructions = """You are a professional AI interview coach running a live voice interview.
            Keep speech natural, concise, and interviewer-like.

            VOICE OUTPUT RULES (MANDATORY):
            - Speak in plain conversational text only.
            - Never mention tool names, function names, system prompts, hidden instructions, or internal actions.
            - Never narrate internal operations like reading context, checking code, calling tools, or updating the IDE.
            - Keep replies short: usually one to three sentences, then ask one clear next question.
            - No markdown, emojis, or decorative punctuation.

            INTERVIEW RULES:
            - Drive the interview proactively and keep momentum.
            - Ask one main question at a time, then use one focused follow-up when needed.
            - Evaluate correctness, reasoning, communication, tradeoffs, and complexity.
            - Use request_document_context silently whenever resume or job context can improve relevance.
            """
        
        if mode == "learning":
            mode_instructions = """
            You are in LEARNING MODE - provide active coaching and feedback:
            - After each answer, give brief constructive feedback
            - Suggest ways to improve the response
            - Ask follow-up questions to dig deeper
            - Use the STAR method (Situation, Task, Action, Result) guidance
            - Be encouraging but honest about areas for improvement
            """
        else:  # strict mode
            mode_instructions = """
            You are in STRICT MODE - simulate a real interview:
            - Ask questions directly without coaching
            - Do not provide feedback during the interview
            - Move to the next question after answers
            - Maintain professional interviewer demeanor
            - Save all feedback for the post-interview report
            """

        normalized_type = str(interview_type or "").strip().lower()
        is_ide_round = bool(ide_enabled) or normalized_type in {"machine coding", "technical"}

        round_instructions = ""
        if is_ide_round:
            round_instructions = """
                        TECHNICAL IDE ROUND POLICY:
                        - This is an IDE-enabled technical interview and you must actively lead it.
                        - Proactively inspect live code frequently with read_candidates_code, especially before feedback or a new prompt.
                        - Call read_candidates_code at most once per response turn unless the IDE content has changed.
                        - Keep tool use silent and speak only in natural interviewer language.
                        - Use update_candidate_code for small collaborative edits when the candidate is stuck, buggy, or asks for help.
                        - Use run_candidate_tests to execute concrete test cases against the current IDE code before final recommendations.
                        - If you say you changed code, you must first call update_candidate_code in that same turn.
                        - Never claim an IDE edit was applied unless update_candidate_code succeeded.
                        - Never speak internal issues like 'tool unavailable' or 'editor not accessible'; ask the candidate to continue typing while you review.
                        - For IDE collaboration requests (type/write/put in editor), immediately use update_candidate_code instead of document lookup.
                        - Do not use request_document_context in IDE rounds unless the candidate explicitly asks about resume or job-description content.
                        - Prefer incremental patches over full rewrites and explain the intent of each change briefly.
                        - Always ask for a brute-force idea first, then an optimized approach.
                        - Always check edge cases, test coverage, and time/space complexity.
                        - If code is empty, ask for a clear function signature and a short implementation plan first.

                        DSA COVERAGE REQUIREMENTS:
                        - Cover these topics naturally across the round as time permits:
                            arrays and strings, hashing, two pointers, sliding window,
                            stacks and queues, trees and binary trees, BST,
                            graphs, binary search, greedy, and dynamic programming.
                        - Move from medium to harder variants when the candidate performs well.
                        - After each meaningful code step, ask exactly one concise next-step question.
            """

        custom_prompt_instructions = ""
        safe_custom_description = _compact_text(custom_description, 1600)
        if safe_custom_description:
            custom_prompt_instructions = (
                "\nCUSTOM INTERVIEW BRIEF (SESSION-SPECIFIC, HIGHEST PRIORITY):\n"
                f"{safe_custom_description}\n"
                "Treat the brief above as interview context and instruction for this session."
            )
        
        super().__init__(
            instructions=base_instructions + mode_instructions + round_instructions + custom_prompt_instructions,
        )
        
        self.mode = mode
        self.template_id = template_id
        self.session_id = session_id
        self.template_title = template_title
        self.interview_type = interview_type
        self.custom_description = safe_custom_description
        self.ide_enabled = is_ide_round
        self._ide_sender = ide_sender
        self.collector = collector
        self.current_question_idx = 0
        self.questions: list[str] = []
        self.current_ide_content: str = ""
        self.current_ide_language: str = "javascript"
        self._last_nonempty_ide_content: str = ""
        self._last_nonempty_ide_language: str = "javascript"
        self._last_nonempty_ide_at: float = 0.0
        self._doc_query_last_seen: dict[str, float] = {}
        self.sentiment_analyzer = SentimentAnalyzer()
        self.latest_sentiment_signal = None
        self._last_code_read_signature: str = ""
        self._last_code_read_at: float = 0.0
        self._duplicate_code_read_count: int = 0
        self._read_code_tool_cooldown_until: float = 0.0

    @function_tool()
    async def read_candidates_code(
        self,
        context: RunContext,
    ) -> str:
        """Read the live code from the candidate's IDE. Use this frequently in technical rounds to evaluate progress, correctness, and next steps."""
        code = self.current_ide_content or ""
        now = time.monotonic()
        snapshot_signature = f"{self.current_ide_language}|{len(code)}|{hash(code[:4000])}"
        is_duplicate_read = (
            snapshot_signature == self._last_code_read_signature
            and (now - self._last_code_read_at) <= 2.5
        )

        if is_duplicate_read:
            self._duplicate_code_read_count += 1
        else:
            self._duplicate_code_read_count = 0

        self._last_code_read_signature = snapshot_signature
        self._last_code_read_at = now

        logger.info(
            "read_candidates_code invoked (ide_enabled=%s, chars=%d, language=%s)",
            self.ide_enabled,
            len(code),
            self.current_ide_language,
        )

        if now < self._read_code_tool_cooldown_until:
            remaining = max(0, int(self._read_code_tool_cooldown_until - now))
            return (
                "[READ_CODE_COOLDOWN] IDE snapshot unchanged. "
                f"Skip read_candidates_code for about {remaining}s and continue the interview naturally."
            )

        if self._duplicate_code_read_count >= 1:
            self._read_code_tool_cooldown_until = now + 9.0
            return (
                "No new IDE edits since the last code read. "
                "Do not call read_candidates_code again until the candidate updates code; "
                "continue with feedback, a focused follow-up, or one update_candidate_code action."
            )

        if not code.strip():
            if self._last_nonempty_ide_content and (now - self._last_nonempty_ide_at) <= 180.0:
                preview = self._last_nonempty_ide_content
                if len(preview) > 7000:
                    preview = f"{preview[:7000]}\n\n# ... truncated for brevity ..."

                age_seconds = max(1, int(now - self._last_nonempty_ide_at))
                return (
                    "Current editor snapshot is empty, but the latest non-empty snapshot is shown below "
                    f"({age_seconds}s old, {self._last_nonempty_ide_language}).\n\n"
                    f"{preview}"
                )
            return "The IDE is currently empty or the candidate hasn't typed anything yet."

        truncated_code = code
        if len(truncated_code) > 7000:
            truncated_code = f"{truncated_code[:7000]}\n\n# ... truncated for brevity ..."

        return (
            f"Here is the candidate's current code ({self.current_ide_language}, {len(code)} chars):\n\n"
            f"{truncated_code}"
        )

    @function_tool()
    async def update_candidate_code(
        self,
        context: RunContext,
        code: str,
        explanation: str = "",
        intent: str = "replace",
        typing_ms: int = 1400,
    ) -> str:
        """Apply collaborative code edits in the candidate's live IDE.

        Args:
            code: Code content to apply. For intent=replace this becomes full editor content; for intent=append this is appended.
            explanation: Short note that explains why this edit is being made.
            intent: Either 'replace' (default) or 'append'.
            typing_ms: Optional typing animation duration in milliseconds (0 to disable).
        """
        logger.info(
            "update_candidate_code invoked (ide_enabled=%s, intent=%s, chars=%d, language=%s)",
            self.ide_enabled,
            intent,
            len(code or ""),
            self.current_ide_language,
        )
        if not self.ide_enabled:
            return "IDE collaboration is disabled for this interview round."

        if not self._ide_sender:
            return "IDE collaboration channel is not available right now."

        sanitized_code = code or ""
        if not sanitized_code.strip():
            return "No code content was provided for IDE update."

        if len(sanitized_code) > 20000:
            sanitized_code = sanitized_code[:20000]

        normalized_intent = "append" if str(intent or "").strip().lower() == "append" else "replace"
        clamped_typing_ms = max(0, min(int(typing_ms or 0), 5000))
        note = _compact_text(explanation or "", 220) if explanation else ""

        payload = {
            "type": "ide_apply",
            "intent": normalized_intent,
            "code": sanitized_code,
            "language": self.current_ide_language or "javascript",
            "explanation": note,
            "typing_ms": clamped_typing_ms,
            "timestamp": int(time.time() * 1000),
        }

        try:
            await self._ide_sender(payload)
            logger.info(
                "Published IDE apply event (intent=%s, chars=%d, lang=%s)",
                normalized_intent,
                len(sanitized_code),
                payload["language"],
            )
        except Exception as e:
            logger.warning("Failed to publish collaborative IDE edit: %s", e)
            return "Unable to apply IDE update right now due to a channel issue."

        if normalized_intent == "append":
            self.current_ide_content = f"{self.current_ide_content}{sanitized_code}"
        else:
            self.current_ide_content = sanitized_code

        if self.collector:
            self.collector.add_code_history_event(
                actor="ai",
                event_type="code_apply",
                summary=(
                    note
                    or (
                        "Appended assistant code in IDE."
                        if normalized_intent == "append"
                        else "Applied assistant code update in IDE."
                    )
                ),
                language=self.current_ide_language,
                details={
                    "intent": normalized_intent,
                    "charCount": len(sanitized_code),
                    "codeSnapshot": self.current_ide_content,
                },
            )

        return "IDE update applied."

    @function_tool()
    async def run_candidate_tests(
        self,
        context: RunContext,
        test_cases: list[str] | None = None,
        stdin: str = "",
        note: str = "",
    ) -> str:
        """Request execution of current IDE code with optional test cases.

        Args:
            test_cases: Optional list of stdin payloads. Each entry runs as an isolated test case.
            stdin: Optional single stdin payload when no explicit test_cases are provided.
            note: Short explanation shown in UI before executing test cases.
        """
        if not self.ide_enabled:
            return "IDE collaboration is disabled for this interview round."

        if not self._ide_sender:
            return "IDE collaboration channel is not available right now."

        normalized_cases: list[dict[str, str]] = []
        if isinstance(test_cases, list):
            for idx, item in enumerate(test_cases[:8]):
                case_value = str(item or "")
                if not case_value.strip():
                    continue
                normalized_cases.append(
                    {
                        "label": f"Case {idx + 1}",
                        "stdin": case_value[:1000],
                    }
                )

        fallback_stdin = str(stdin or "")[:1000]
        if not normalized_cases and not fallback_stdin.strip():
            return "Provide at least one test case or stdin input to run tests."

        request_id = f"ide-exec-{uuid.uuid4().hex[:10]}"
        payload: dict[str, Any] = {
            "type": "ide_execute_request",
            "requestId": request_id,
            "source": "ai",
            "timestamp": int(time.time() * 1000),
            "note": _compact_text(
                note or "Running requested test cases against the current code.",
                220,
            ),
        }

        if normalized_cases:
            payload["testCases"] = normalized_cases
        else:
            payload["stdin"] = fallback_stdin

        try:
            await self._ide_sender(payload)
        except Exception as e:
            logger.warning("Failed to publish IDE execute request: %s", e)
            return "Unable to trigger IDE test execution right now due to a channel issue."

        if self.collector:
            self.collector.add_code_history_event(
                actor="ai",
                event_type="test_case",
                summary=(
                    f"Queued {len(normalized_cases)} AI test case(s) for execution."
                    if normalized_cases
                    else "Queued AI stdin test execution."
                ),
                language=self.current_ide_language,
                details={
                    "source": "ai",
                    "requestId": request_id,
                    "caseCount": len(normalized_cases),
                    "codeSnapshot": self.current_ide_content,
                },
            )

        return "Requested IDE test execution."

    @function_tool()
    async def get_interview_tip(
        self,
        context: RunContext,
        topic: str,
    ) -> str:
        """Get an interview tip for a specific topic.
        
        Args:
            topic: The interview topic to get a tip about (e.g., behavioral, technical, salary negotiation).
        """
        # Only provide tips in learning mode
        if self.mode == "strict":
            return "Tips are not available during the interview. Focus on your answers."
        
        tips = {
            "behavioral": "Use the STAR method: Situation, Task, Action, Result. This helps structure your answers clearly.",
            "technical": "Think out loud! Interviewers want to see your problem-solving process, not just the final answer.",
            "salary": "Research market rates beforehand. When asked, give a range based on your research and qualifications.",
            "general": "Prepare 3-5 stories from your experience that demonstrate key skills. You can adapt them to various questions.",
        }
        
        if self.collector:
            self.collector.add_interviewer_message(f"[Tip: {topic}]")
        
        return tips.get(topic.lower(), tips["general"])

    @function_tool()
    async def provide_feedback(
        self,
        context: RunContext,
        answer_summary: str,
        score: int,
        suggestion: str,
    ) -> str:
        """Provide feedback on the candidate's answer (Learning mode only).
        
        Args:
            answer_summary: Brief summary of what the candidate said
            score: Score from 1-10 for the answer quality
            suggestion: One specific improvement suggestion
        """
        if self.mode == "strict":
            return "Feedback is provided after the interview."
        
        if self.collector:
            self.collector.add_score(score / 10.0)
        
        return f"Based on your answer: {suggestion}. You scored {score}/10 on this question."

    @function_tool()
    async def request_document_context(
        self,
        context: RunContext,
        query: str,
    ) -> str:
        """Get contextual information from the candidate's uploaded resume or provided job documentation.
        
        Args:
            query: The specific topic or detail you need to find in their document (e.g., 'Python experience', 'education').
        """
        from .rag.vector_store import get_vector_store

        query_key = _normalize_rag_query(query)
        now = time.monotonic()
        last_seen = self._doc_query_last_seen.get(query_key)
        if last_seen is not None and (now - last_seen) < 10.0:
            logger.info("Skipping duplicate request_document_context call for query: %s", query_key)
            return "No additional document context for the same query right now. Continue the interview naturally."

        self._doc_query_last_seen[query_key] = now
        if len(self._doc_query_last_seen) > 64:
            oldest_key = min(self._doc_query_last_seen, key=self._doc_query_last_seen.get)
            self._doc_query_last_seen.pop(oldest_key, None)

        store = get_vector_store()
        try:
            # Query both the template (if applicable) and this specific session's uploaded docs.
            results: list[str] = []
            targets: list[str] = []
            if self.template_id:
                targets.append(self.template_id)
            if self.session_id:
                targets.append(self.session_id)
                targets.append(f"session_{self.session_id}")

            for target_id in list(dict.fromkeys(targets)):
                hits = _lookup_rag_chunks_with_cache(
                    store,
                    target_id,
                    query,
                    settings.rag_lookup_k,
                )
                if hits:
                    results.extend(hits)

            if not results:
                return "I couldn't find any relevant information about that in the uploaded documents."

            limited_results = _cap_context_chunks(
                results,
                max_chunks=settings.rag_injected_chunks,
                chunk_max_chars=settings.rag_chunk_max_chars,
                total_max_chars=settings.rag_context_max_chars,
            )
            if not limited_results:
                return "I found relevant documents but they were too large to include directly. Please ask a more specific question."

            return "\n\n".join(limited_results)
        except Exception as e:
            logger.error(f"Failed to query RAG: {e}")
            return "Failed to retrieve document context at this moment."

server = AgentServer(
    # Keep the process pool small in containerized runs.
    num_idle_processes=settings.livekit_num_idle_processes,
    initialize_process_timeout=settings.livekit_initialize_process_timeout,
    job_memory_warn_mb=settings.livekit_job_memory_warn_mb,
    job_memory_limit_mb=settings.livekit_job_memory_limit_mb,
    ws_url=settings.livekit_url,
    api_key=settings.livekit_api_key,
    api_secret=settings.livekit_api_secret,
)


def prewarm(proc: JobProcess):
    """Prewarm function to initialize resources before job starts."""
    logger.info("Prewarming agent resources...")
    proc.userdata["vad"] = silero.VAD.load()

    def _prewarm_rag_embedder() -> None:
        try:
            from .rag.vector_store import get_vector_store

            _ = get_vector_store().embedder
            logger.info("Prewarmed RAG embedder")
        except Exception as e:
            logger.warning("Failed to prewarm RAG embedder: %s", e)

    if settings.rag_prewarm_embedder:
        # Keep prewarm in the worker process thread.
        # Some third-party libraries used by the embedder can create asyncio loops
        # during initialization and are noisy when started from daemon threads.
        _prewarm_rag_embedder()

    def _prewarm_report_analyzers() -> None:
        if not settings.analysis_enabled:
            return
        try:
            from .analysis import ReportGenerator

            _ = ReportGenerator()
            logger.info("Prewarmed report analyzers")
        except Exception as e:
            logger.warning("Failed to prewarm report analyzers: %s", e)

    _prewarm_report_analyzers()


server.setup_fnc = prewarm


@server.rtc_session()
async def voice_agent(ctx: JobContext):
    """Main entrypoint for the voice agent RTC session."""
    ctx.log_context_fields = {
        "room": ctx.room.name,
    }
    
    logger.info(f"Starting voice agent for room: {ctx.room.name}")
    
    # Parse room metadata for mode and template info
    # Note: In production, this would come from the room's actual metadata
    # For now we'll use defaults - the frontend passes this via the token request
    metadata = {}
    
    # Get from participant metadata if available
    await ctx.connect()
    
    for participant in ctx.room.remote_participants.values():
        if participant.metadata:
            metadata = parse_room_metadata(participant.metadata)
            break

    if not metadata:
        for _ in range(10):
            await asyncio.sleep(0.3)
            for participant in ctx.room.remote_participants.values():
                if participant.metadata:
                    metadata = parse_room_metadata(participant.metadata)
                    break
            if metadata:
                break
    
    mode = metadata.get("mode", "strict")
    template_id = metadata.get("templateId")
    session_id = metadata.get("sessionId") or template_id
    if not session_id and ctx.room.name.startswith("interview-"):
        session_id = ctx.room.name.replace("interview-", "")
    template_title = metadata.get("templateTitle", "Interview")
    participant_name = metadata.get("participantName", "Candidate")
    interview_type = metadata.get("interviewType", "")
    custom_description = metadata.get("customDescription", "")
    ide_enabled = bool(metadata.get("ideEnabled", False))
    
    logger.info(
        "Interview mode: %s, session/template: %s, template title: %s, type: %s, ide_enabled: %s",
        mode,
        session_id,
        template_title,
        interview_type or "(unspecified)",
        ide_enabled,
    )

    # Initialize session collector
    collector = SessionCollector(
        room_name=ctx.room.name,
        template_id=session_id,  # Bind collector tightly to session output
        template_title=template_title,
        mode=mode,
        participant_name=participant_name,
    )

    logger.info(f"Using Providers -> LLM: {settings.llm_provider}, STT: {settings.stt_provider}, TTS: {settings.tts_provider}")

    stt, llm, tts = create_model_components(settings)
    logger.info(
        "Resolved Runtime Providers -> LLM: %s.%s, STT: %s.%s, TTS: %s.%s",
        type(llm).__module__,
        type(llm).__name__,
        type(stt).__module__,
        type(stt).__name__,
        type(tts).__module__,
        type(tts).__name__,
    )

    # --- PROACTIVE RAG INTERCEPTOR ---
    # Intercept LLM chat requests to inject uploaded documents directly into context.
    # This bypasses the need for the LLM backend (e.g. Local LLM / Gemini) to correctly invoke the function calling tool API.
    
    # Define a wrapper for the chat method that handles the async nature of LLMStream
    original_chat = llm.chat
    last_proactive_rag_query = ""
    last_proactive_rag_at = 0.0
    
    def intercepted_chat(_bound_llm, *args, **kwargs):
        nonlocal last_proactive_rag_query, last_proactive_rag_at
        chat_ctx = kwargs.get("chat_ctx")
        args_list = list(args)
        chat_ctx_in_args = False

        if chat_ctx is None and args_list:
            maybe_ctx = args_list[0]
            if hasattr(maybe_ctx, "items") or hasattr(maybe_ctx, "messages"):
                chat_ctx = maybe_ctx
                chat_ctx_in_args = True

        if chat_ctx:
            try:
                # Keep only relevant recent message items and skip bulky tool-call traces.
                working_ctx = chat_ctx.copy(
                    exclude_empty_message=True,
                    exclude_function_call=True,
                )
                working_ctx.truncate(max_items=settings.llm_chat_max_items)

                raw_items = _extract_context_items(working_ctx)
                if not raw_items:
                    return original_chat(*args, **kwargs)

                # Deep-clone message items. ChatContext.copy() is shallow and shares item objects.
                cloned_items = [_clone_chat_item(item) for item in raw_items]
                sanitized_context_items = 0

                for item in cloned_items:
                    if getattr(item, "type", "message") != "message":
                        continue
                    if getattr(item, "role", None) != "user":
                        continue

                    original_content = _collect_text_content(getattr(item, "content", ""))
                    cleaned_content = _strip_injected_doc_context(original_content)
                    if cleaned_content != original_content:
                        item.content = cleaned_content
                        sanitized_context_items += 1

                # Rebuild context from cloned items so downstream edits never touch persistent state.
                working_ctx = lk_llm.ChatContext(cloned_items)

                if chat_ctx_in_args:
                    args_list[0] = working_ctx
                    args = tuple(args_list)
                else:
                    kwargs["chat_ctx"] = working_ctx

                messages = [
                    item
                    for item in cloned_items
                    if getattr(item, "type", "message") == "message"
                ]

                # Find the actual user message (not just the last one, which might be a tool response)
                user_msg = None
                for msg in reversed(messages):
                    if getattr(msg, "role", None) == "user" and getattr(msg, "content", None):
                        user_msg = msg
                        break
                
                if user_msg:
                    query = _collect_text_content(user_msg.content)
                    query = _compact_text(query, settings.rag_query_max_chars)
                    if not query:
                        return original_chat(*args, **kwargs)

                    delivery_signal_block = ""
                    if agent.mode == "learning" or settings.guide_mode:
                        sentiment_signal = agent.sentiment_analyzer.analyze(query)
                        agent.latest_sentiment_signal = sentiment_signal
                        if sentiment_signal.should_coach:
                            delivery_signal_block = sentiment_signal.to_prompt_block()

                    def _compose_augmented_prompt(
                        question_text: str,
                        doc_context: str | None = None,
                        extra_guard: str | None = None,
                    ) -> str:
                        sections: list[str] = []
                        if delivery_signal_block:
                            sections.append(delivery_signal_block)
                        if doc_context:
                            sections.append(
                                f"[DOCUMENTS / CONTEXT PROVIDED]\n{doc_context}\n[END CONTEXT]"
                            )
                        if extra_guard:
                            sections.append(
                                f"[TOOL USAGE GUARD]\n{extra_guard}\n[END TOOL USAGE GUARD]"
                            )
                        sections.append(f"Question / Speech: {question_text}")
                        return "\n\n".join(sections)

                    if ide_enabled:
                        if time.monotonic() < agent._read_code_tool_cooldown_until:
                            remaining_s = max(
                                1,
                                int(agent._read_code_tool_cooldown_until - time.monotonic()),
                            )
                            user_msg.content = _compose_augmented_prompt(
                                query,
                                extra_guard=(
                                    "IDE snapshot has not changed recently. "
                                    f"Do not call read_candidates_code for ~{remaining_s}s. "
                                    "Ask one concise follow-up or provide targeted feedback using the latest known code state."
                                ),
                            )
                        elif delivery_signal_block:
                            user_msg.content = _compose_augmented_prompt(query)
                        logger.debug("Skipping proactive RAG for IDE-enabled round.")
                        return original_chat(*args, **kwargs)

                    if _looks_like_editor_write_request(query):
                        if delivery_signal_block:
                            user_msg.content = _compose_augmented_prompt(query)
                        logger.debug("Skipping proactive RAG for editor-write intent query.")
                        return original_chat(*args, **kwargs)

                    now_monotonic = time.monotonic()
                    query_key = query.lower()
                    if query_key == last_proactive_rag_query and (now_monotonic - last_proactive_rag_at) < 2.5:
                        if delivery_signal_block:
                            user_msg.content = _compose_augmented_prompt(query)
                        logger.debug("Skipping duplicate proactive RAG lookup for repeated query.")
                        return original_chat(*args, **kwargs)

                    last_proactive_rag_query = query_key
                    last_proactive_rag_at = now_monotonic
                    
                    # We need to reach into the vector store
                    from .rag.vector_store import get_vector_store
                    
                    store = get_vector_store()

                    results: list[str] = []
                    targets: list[str] = []
                    if template_id:
                        targets.append(template_id)
                    if session_id and session_id != template_id:
                        targets.append(session_id)
                    if session_id:
                        targets.append(f"session_{session_id}")
                    targets = list(dict.fromkeys(targets))

                    logger.info("Proactive RAG intercept triggered. Query: %s", query)
                    for target_id in targets:
                        chunks = _lookup_rag_chunks_with_cache(
                            store,
                            target_id,
                            query,
                            settings.rag_lookup_k,
                        )
                        if chunks:
                            results.extend(chunks)
                    
                    # Deduplicate
                    unique_results = []
                    for r in results:
                        if r not in unique_results:
                            unique_results.append(r)
                            
                    if unique_results:
                        limited_results = _cap_context_chunks(
                            unique_results,
                            max_chunks=settings.rag_injected_chunks,
                            chunk_max_chars=settings.rag_chunk_max_chars,
                            total_max_chars=settings.rag_context_max_chars,
                        )
                        if limited_results:
                            context_str = "\n---\n".join(limited_results)
                            user_msg.content = _compose_augmented_prompt(query, context_str)
                            logger.info("Injected %d proactive RAG chunks into prompt.", len(limited_results))
                        else:
                            logger.info("Proactive RAG skipped injection due to prompt budget limits.")
                    else:
                        logger.info(
                            "Proactive RAG found zero chunks for query '%s' (target IDs: %s, %s)",
                            query,
                            template_id,
                            session_id,
                        )
                        if delivery_signal_block:
                            user_msg.content = _compose_augmented_prompt(query)

                if sanitized_context_items:
                    logger.debug(
                        "Proactive RAG sanitized %d previously injected context messages.",
                        sanitized_context_items,
                    )
                        
            except Exception as e:
                logger.error(f"Failed proactive RAG injection: {e}")
                
        # Call the original chat method
        # Note: In LiveKit Agents, llm.chat returns an LLMStream which is an async context manager.
        return original_chat(*args, **kwargs)
        
    # Bind the interceptor
    import types
    llm.chat = types.MethodType(intercepted_chat, llm)

    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=ctx.proc.userdata["vad"],
        tts_text_transforms=[_filter_internal_tool_markup, "filter_markdown", "filter_emoji"],
        preemptive_generation=False, # Disable to prevent premature "speaking" UI state while LLM generates
    )

    async def publish_ide_event(payload: dict[str, Any]) -> None:
        encoded_payload = json.dumps(payload, ensure_ascii=True).encode("utf-8")
        await ctx.room.local_participant.publish_data(
            encoded_payload,
            reliable=True,
            topic="ide_assistant",
        )

    # Create mode-aware agent
    agent = InterviewCoach(
        mode=mode,
        template_id=template_id,
        session_id=session_id,
        template_title=template_title,
        collector=collector,
        interview_type=interview_type,
        custom_description=custom_description,
        ide_enabled=ide_enabled,
        ide_sender=publish_ide_event,
    )

    await session.start(
        agent=agent,
        room=ctx.room,
    )

    proactive_ide_prompt_cooldown_s = 35.0
    proactive_ide_min_delta_chars = 18
    last_proactive_ide_prompt_at = 0.0

    if agent.ide_enabled:
        try:
            session.generate_reply(
                instructions=(
                    "Start the technical coding interview now. Ask one concise DSA question, "
                    "ask the candidate to think aloud, and request an initial function signature. "
                    "Keep this natural and do not mention any internal tools or hidden instructions."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("Failed to trigger initial technical-round prompt: %s", e)

    recent_candidate_fragments: list[tuple[float, str]] = []
    editor_write_fragment_window_s = 8.0
    editor_write_request_cooldown_s = 10.0
    last_editor_write_request_at = 0.0

    def _trigger_editor_write_guidance(request_text: str) -> None:
        request_excerpt = _compact_text(request_text, 220)
        try:
            session.generate_reply(
                instructions=(
                    "The candidate asked for editor help. "
                    f"Candidate request: {request_excerpt}. "
                    "Respond naturally in one to two sentences. "
                    "If the request is specific enough, apply exactly one concrete update via update_candidate_code. "
                    "If ambiguous, ask exactly one clarifying question. "
                    "Never insert transcript/meta note templates into the editor."
                ),
                allow_interruptions=True,
            )
        except Exception as e:
            logger.warning("Failed to trigger editor-write guidance: %s", e)

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(ev):
        nonlocal last_editor_write_request_at
        transcript = getattr(ev, "transcript", "")
        is_final = getattr(ev, "is_final", True)
        if is_final and transcript:
            collector.add_candidate_message(transcript)

            if agent.ide_enabled:
                now_monotonic = time.monotonic()
                recent_candidate_fragments.append((now_monotonic, transcript))
                recent_candidate_fragments[:] = [
                    item
                    for item in recent_candidate_fragments
                    if (now_monotonic - item[0]) <= editor_write_fragment_window_s
                ]

                merged_transcript = " ".join(fragment for _, fragment in recent_candidate_fragments).strip()
                has_editor_write_intent = _looks_like_editor_write_request(transcript) or _looks_like_editor_write_request(merged_transcript)

                if has_editor_write_intent:
                    if (now_monotonic - last_editor_write_request_at) >= editor_write_request_cooldown_s:
                        last_editor_write_request_at = now_monotonic
                        _trigger_editor_write_guidance(merged_transcript or transcript)
                    else:
                        logger.debug("Skipped direct IDE fallback write due to cooldown.")

    @session.on("conversation_item_added")
    def on_conversation_item_added(ev):
        item = getattr(ev, "item", None)
        if not item:
            return

        if getattr(item, "role", "") != "assistant":
            return

        text = _collect_text_content(getattr(item, "content", "")).strip()
        text = _sanitize_assistant_text_for_speech(text)
        if text:
            collector.add_interviewer_message(text, is_question="?" in text)

    report_generation_started = False

    def ensure_final_code_snapshot_for_report() -> None:
        if not agent.ide_enabled:
            return

        current_code = agent.current_ide_content or ""
        if not current_code.strip():
            return

        has_existing_snapshot = any(
            isinstance(getattr(event, "details", None), dict)
            and isinstance(event.details.get("codeSnapshot"), str)
            and bool(event.details.get("codeSnapshot", "").strip())
            for event in collector.data.code_history
        )
        if has_existing_snapshot:
            return

        collector.add_code_history_event(
            actor="user",
            event_type="code_snapshot",
            summary="Captured final IDE snapshot before report generation.",
            language=agent.current_ide_language,
            details={
                "source": "report_finalization_fallback",
                "charCount": len(current_code),
                "codeSnapshot": current_code,
            },
        )
        logger.info(
            "Added fallback final IDE snapshot for report generation (chars=%d, language=%s)",
            len(current_code),
            agent.current_ide_language,
        )

    def trigger_report_generation(reason: str) -> None:
        nonlocal report_generation_started
        if report_generation_started:
            logger.debug("Skipping duplicate report generation trigger (%s)", reason)
            return

        report_generation_started = True
        logger.info("Finalizing interview report (%s)...", reason)
        ensure_final_code_snapshot_for_report()
        session_data = collector.end_session()

        # Store it locally just in case
        try:
            from .routers.reports import store_session

            store_session(session_data)
        except ImportError:
            pass

        async def push_webhook():
            try:
                from .analysis import ReportGenerator

                generator = ReportGenerator()
                report = await asyncio.to_thread(generator.generate, session_data)
                payload = report.to_dict()
                payload["session_id"] = session_id
                payload["sessionId"] = session_id

                # Use standard library to avoid missing httpx/aiohttp in worker
                api_url = "http://api:8000/api/reports/webhook"
                req = urllib.request.Request(
                    api_url,
                    data=json.dumps(payload).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )

                # Run in thread so it doesn't block
                def make_req():
                    with urllib.request.urlopen(req, timeout=30) as response:
                        return response.status

                status = await asyncio.to_thread(make_req)
                logger.info("Webhook pushed successfully: %s", status)
            except Exception as e:
                logger.error("Failed to push webhook: %s", e)

        # Fire and forget
        asyncio.create_task(push_webhook())

    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        nonlocal last_proactive_ide_prompt_at
        try:
            raw_data = data_packet.data
            if isinstance(raw_data, (bytes, bytearray)):
                payload_text = raw_data.decode("utf-8")
            elif isinstance(raw_data, str):
                payload_text = raw_data
            else:
                logger.debug("Ignored unsupported data packet payload type: %s", type(raw_data).__name__)
                return

            payload = json.loads(payload_text)
            payload_type = str(payload.get("type", "")).strip().lower()

            if payload_type == "ide_change":
                previous_code = agent.current_ide_content
                previous_language = agent.current_ide_language
                source = str(payload.get("source", "")).strip().lower()
                incoming_code_raw = payload.get("code", "")
                incoming_code = (
                    incoming_code_raw
                    if isinstance(incoming_code_raw, str)
                    else str(incoming_code_raw or "")
                )
                agent.current_ide_content = incoming_code
                incoming_language = payload.get("language")
                if isinstance(incoming_language, str) and incoming_language.strip():
                    agent.current_ide_language = incoming_language.strip().lower()

                if incoming_code.strip():
                    agent._last_nonempty_ide_content = incoming_code
                    agent._last_nonempty_ide_language = agent.current_ide_language
                    agent._last_nonempty_ide_at = time.monotonic()

                agent._duplicate_code_read_count = 0
                agent._read_code_tool_cooldown_until = 0.0

                delta_chars = abs(len(incoming_code or "") - len(previous_code or ""))
                language_changed = previous_language != agent.current_ide_language
                logger.info(
                    "Received IDE change event (source=%s, chars=%d, language=%s, language_changed=%s)",
                    source or "unknown",
                    len(incoming_code or ""),
                    agent.current_ide_language,
                    language_changed,
                )

                if agent.ide_enabled and source in {"", "candidate", "user"}:
                    has_substantive_code_change = (
                        delta_chars >= 8
                        or (
                            bool(incoming_code and incoming_code.strip())
                            and not bool(previous_code and previous_code.strip())
                        )
                    )
                    has_meaningful_change = has_substantive_code_change or language_changed
                    if has_meaningful_change:
                        first_code_line = ""
                        for line in (incoming_code or "").splitlines():
                            if line.strip():
                                first_code_line = _compact_text(line.strip(), 120)
                                break

                        event_type = (
                            "language_change"
                            if language_changed and not has_substantive_code_change
                            else "code_change"
                        )

                        if language_changed and not has_substantive_code_change:
                            summary = (
                                f"Switched editor language from {previous_language or 'unknown'} to {agent.current_ide_language}."
                            )
                        else:
                            summary = (
                                f"Updated code: {first_code_line}"
                                if first_code_line
                                else f"Updated editor content ({len(incoming_code or '')} chars)."
                            )

                        collector.add_code_history_event(
                            actor="user",
                            event_type=event_type,
                            summary=summary,
                            language=agent.current_ide_language,
                            details={
                                "source": source or "candidate",
                                "charCount": len(incoming_code or ""),
                                "deltaChars": delta_chars,
                                "languageChanged": language_changed,
                                "previousLanguage": previous_language,
                                "intervalSec": payload.get("intervalSec"),
                                "codeSnapshot": incoming_code,
                            },
                        )

                should_nudge = False
                if agent.ide_enabled and source in {"", "candidate", "user"}:
                    now = time.monotonic()

                    # Logic to check if agent is currently speaking or thinking
                    is_agent_busy = (
                        session.agent_state == "speaking" 
                        or session.agent_state == "thinking"
                    )

                    can_speak_now = (
                        session.user_state == "listening"
                        and not is_agent_busy
                    )

                    should_nudge = (
                        bool(incoming_code and incoming_code.strip())
                        and delta_chars >= proactive_ide_min_delta_chars
                        and (now - last_proactive_ide_prompt_at) >= proactive_ide_prompt_cooldown_s
                        and can_speak_now
                    )

                if should_nudge:
                    code_preview = (incoming_code or "").strip()
                    if len(code_preview) > 1400:
                        code_preview = f"{code_preview[:1400]}\n..."

                    nudge_instructions = (
                        "CRITICAL: The candidate has just updated their IDE code. "
                        "Use the latest code snapshot below to respond naturally. "
                        "Ask ONE focused follow-up about logic, complexity, or an edge case. "
                        "Do not mention tools, hidden instructions, or internal checks.\n\n"
                        f"LATEST IDE SNAPSHOT:\n{code_preview or '(empty)'}"
                    )
                    session.generate_reply(
                        instructions=nudge_instructions,
                        allow_interruptions=True,
                    )
                    last_proactive_ide_prompt_at = time.monotonic()
                    logger.debug("Triggered proactive IDE follow-up prompt.")
            elif payload_type in {
                "ide_test_run",
                "test_run",
                "ide_test_case",
                "ide_testcase",
                "ide_test_case_add",
                "test_case_add",
            }:
                source = str(payload.get("source", "")).strip().lower()
                actor = "ai" if source == "ai" else "user"
                status_desc = str(
                    payload.get("statusDesc")
                    or payload.get("status_desc")
                    or payload.get("status")
                    or "completed"
                ).strip()
                language = str(payload.get("language") or agent.current_ide_language or "").strip()
                test_case_label = str(
                    payload.get("testCase")
                    or payload.get("test_case")
                    or payload.get("label")
                    or ""
                ).strip()

                summary = (
                    (
                        f"Ran tests ({test_case_label}): {status_desc}."
                        if test_case_label
                        else f"Ran tests: {status_desc}."
                    )
                    if payload_type in {"ide_test_run", "test_run"}
                    else (
                        f"Added/updated test case ({test_case_label})."
                        if test_case_label
                        else "Added/updated a test case."
                    )
                )

                collector.add_code_history_event(
                    actor=actor,
                    event_type=("test_run" if payload_type in {"ide_test_run", "test_run"} else "test_case"),
                    summary=summary,
                    language=language or None,
                    details={
                        "source": source or actor,
                        "status": status_desc,
                        "time": payload.get("time") or payload.get("executionTime"),
                        "memory": payload.get("memory"),
                        "stdinPreview": str(payload.get("stdin") or payload.get("testCase") or "")[:180],
                        "stdoutPreview": str(payload.get("stdoutPreview") or payload.get("stdout") or "")[:220],
                        "stderrPreview": str(payload.get("stderrPreview") or payload.get("stderr") or "")[:220],
                        "codeSnapshot": agent.current_ide_content,
                    },
                )

                logger.info(
                    "Captured coding test event (type=%s, source=%s, status=%s)",
                    payload_type,
                    source or "unknown",
                    status_desc,
                )
            elif payload_type in {"finalize_interview", "interview_end"}:
                trigger_report_generation("data_channel_finalize")
        except Exception as e:
            logger.error(f"Error parsing data channel message: {e}")

    @ctx.room.on("disconnected")
    def on_disconnected(*args):
        trigger_report_generation("room_disconnected")

    logger.info(f"Connected to room: {ctx.room.name} in {mode} mode")


if __name__ == "__main__":
    cli.run_app(server)
