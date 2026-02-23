"""LangGraph-based interview agent for RAG-powered interviews.

Implements a state machine for conducting interviews with:
- Question generation from template context
- Answer evaluation
- Follow-up question generation
- Mode-aware behavior (learning vs strict)
"""

from __future__ import annotations

import logging
from typing import Literal, TypedDict

from langgraph.graph import StateGraph, END

from .schemas import InterviewMode, InterviewState, TemplateContext

logger = logging.getLogger(__name__)


class GraphState(TypedDict):
    """Internal state for LangGraph."""
    messages: list[dict]
    current_question_idx: int
    template_context: TemplateContext | None
    candidate_profile: str
    mode: InterviewMode
    scores: list[float]
    current_question: str
    last_answer: str
    should_provide_feedback: bool


def generate_question_node(state: GraphState) -> GraphState:
    """Generate the next interview question from template context."""
    context = state.get("template_context")
    idx = state.get("current_question_idx", 0)
    
    if context and idx < len(context.questions):
        # Use pre-defined question from template
        question = context.questions[idx]
    else:
        # Fallback to generic question
        question = "Tell me about a challenging project you've worked on."
    
    state["current_question"] = question
    state["messages"].append({
        "role": "assistant",
        "content": question,
    })
    
    return state


def evaluate_answer_node(state: GraphState) -> GraphState:
    """Evaluate the candidate's answer.
    
    In production, this would call the LLM to evaluate.
    For now, we do simple heuristic scoring.
    """
    answer = state.get("last_answer", "")
    
    # Simple heuristic scoring (replace with LLM eval)
    score = 0.5  # Base score
    
    # Length bonus
    word_count = len(answer.split())
    if word_count > 50:
        score += 0.2
    elif word_count > 20:
        score += 0.1
    
    # Keyword presence (simplified)
    keywords = ["experience", "project", "team", "result", "learned"]
    for keyword in keywords:
        if keyword.lower() in answer.lower():
            score += 0.05
    
    score = min(1.0, max(0.0, score))
    state["scores"].append(score)
    
    # Determine if feedback should be given
    state["should_provide_feedback"] = (
        state["mode"] == InterviewMode.LEARNING and score < 0.6
    )
    
    return state


def provide_feedback_node(state: GraphState) -> GraphState:
    """Provide coaching feedback (Learning mode only)."""
    if not state.get("should_provide_feedback"):
        return state
    
    scores = state.get("scores", [])
    last_score = scores[-1] if scores else 0.5
    
    if last_score < 0.4:
        feedback = (
            "I noticed your answer was a bit brief. Try using the STAR method: "
            "Situation, Task, Action, Result. This helps structure your response."
        )
    elif last_score < 0.6:
        feedback = (
            "Good start! Consider adding more specific examples or metrics "
            "to make your answer more impactful."
        )
    else:
        feedback = "Nice answer! Let's move to the next question."
    
    state["messages"].append({
        "role": "assistant",
        "content": feedback,
        "type": "feedback",
    })
    
    return state


def generate_followup_node(state: GraphState) -> GraphState:
    """Generate a follow-up question or move to next topic."""
    scores = state.get("scores", [])
    last_score = scores[-1] if scores else 0.5
    
    # In strict mode or if answer was good, move to next question
    if state["mode"] == InterviewMode.STRICT or last_score >= 0.6:
        state["current_question_idx"] += 1
    # In learning mode with poor answer, ask follow-up
    else:
        followup = "Can you elaborate more on that? Maybe share a specific example?"
        state["messages"].append({
            "role": "assistant",
            "content": followup,
            "type": "followup",
        })
    
    return state


def should_end(state: GraphState) -> Literal["continue", "end"]:
    """Determine if interview should continue."""
    context = state.get("template_context")
    idx = state.get("current_question_idx", 0)
    
    # End if we've asked all questions
    if context and idx >= len(context.questions):
        return "end"
    
    # End after 10 questions max
    if idx >= 10:
        return "end"
    
    return "continue"


def create_interview_graph(
    template_id: str,
    mode: InterviewMode = InterviewMode.STRICT,
) -> StateGraph:
    """Build LangGraph workflow for interview session.
    
    Args:
        template_id: Template ID for context retrieval
        mode: Interview mode (learning or strict)
        
    Returns:
        Compiled StateGraph
    """
    graph = StateGraph(GraphState)
    
    # Add nodes
    graph.add_node("generate_question", generate_question_node)
    graph.add_node("evaluate_answer", evaluate_answer_node)
    graph.add_node("provide_feedback", provide_feedback_node)
    graph.add_node("generate_followup", generate_followup_node)
    
    # Set entry point
    graph.set_entry_point("generate_question")
    
    # Add edges based on mode
    graph.add_edge("generate_question", "evaluate_answer")
    
    if mode == InterviewMode.LEARNING:
        graph.add_edge("evaluate_answer", "provide_feedback")
        graph.add_edge("provide_feedback", "generate_followup")
    else:
        graph.add_edge("evaluate_answer", "generate_followup")
    
    # Conditional edge for continuing or ending
    graph.add_conditional_edges(
        "generate_followup",
        should_end,
        {
            "continue": "generate_question",
            "end": END,
        },
    )
    
    return graph.compile()


def create_initial_state(
    template_context: TemplateContext | None = None,
    mode: InterviewMode = InterviewMode.STRICT,
    candidate_profile: str = "",
) -> GraphState:
    """Create initial state for interview graph.
    
    Args:
        template_context: Context from vector store
        mode: Interview mode
        candidate_profile: Optional candidate profile
        
    Returns:
        Initial GraphState
    """
    return GraphState(
        messages=[],
        current_question_idx=0,
        template_context=template_context,
        candidate_profile=candidate_profile,
        mode=mode,
        scores=[],
        current_question="",
        last_answer="",
        should_provide_feedback=False,
    )
