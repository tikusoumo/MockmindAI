"""Semantic analyzer for interview answer quality.

Uses LLM to evaluate:
- Answer relevance and completeness
- Technical accuracy
- SWOT analysis generation
- Improvement suggestions
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class QuestionEvaluation:
    """Evaluation of a single interview answer."""
    question: str
    answer_summary: str
    score: float  # 0.0 to 1.0
    strengths: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    feedback: str = ""


@dataclass
class SWOT:
    """SWOT analysis of candidate performance."""
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    opportunities: list[str] = field(default_factory=list)
    threats: list[str] = field(default_factory=list)


@dataclass
class Resource:
    """Recommended learning resource."""
    title: str
    type: str  # 'Article', 'Video', 'Course'
    url: str
    reason: str = ""


@dataclass
class SemanticAnalysisResult:
    """Complete semantic analysis result."""
    question_evaluations: list[QuestionEvaluation]
    overall_score: float
    swot: SWOT
    recommended_resources: list[Resource]
    summary: str


class SemanticAnalyzer:
    """Analyzes interview answers using LLM for semantic evaluation.
    
    In production, this would call an LLM API for detailed analysis.
    For now, it uses rule-based heuristics for demonstration.
    """

    def __init__(self, llm_client: Any = None):
        self.llm_client = llm_client

    def analyze(
        self,
        transcript_entries: list[dict],
        questions: list[str] | None = None,
    ) -> SemanticAnalysisResult:
        """Analyze interview answers semantically.
        
        Args:
            transcript_entries: List of transcript entries
            questions: List of interview questions asked
            
        Returns:
            SemanticAnalysisResult with evaluations and SWOT
        """
        # Extract Q&A pairs from transcript
        qa_pairs = self._extract_qa_pairs(transcript_entries)
        
        # Evaluate each Q&A pair
        evaluations = []
        for question, answer in qa_pairs:
            evaluation = self._evaluate_answer(question, answer)
            evaluations.append(evaluation)
        
        # Calculate overall score
        if evaluations:
            overall_score = sum(e.score for e in evaluations) / len(evaluations)
        else:
            overall_score = 0.5
        
        # Generate SWOT analysis
        swot = self._generate_swot(evaluations)
        
        # Recommend resources based on weaknesses
        resources = self._recommend_resources(swot.weaknesses)
        
        # Generate summary
        summary = self._generate_summary(evaluations, overall_score)
        
        return SemanticAnalysisResult(
            question_evaluations=evaluations,
            overall_score=round(overall_score, 2),
            swot=swot,
            recommended_resources=resources,
            summary=summary,
        )

    def _extract_qa_pairs(
        self,
        entries: list[dict],
    ) -> list[tuple[str, str]]:
        """Extract question-answer pairs from transcript."""
        qa_pairs = []
        current_question = None
        current_answers = []
        
        for entry in entries:
            speaker = entry.get("speaker", "").lower()
            text = entry.get("text", "")
            
            if speaker == "interviewer":
                # If we have a previous Q&A, save it
                if current_question and current_answers:
                    qa_pairs.append((current_question, " ".join(current_answers)))
                
                # Start new question
                if "?" in text or any(kw in text.lower() for kw in ["tell me", "describe", "explain", "how would"]):
                    current_question = text
                    current_answers = []
            elif speaker == "candidate" and current_question:
                current_answers.append(text)
        
        # Save last Q&A pair
        if current_question and current_answers:
            qa_pairs.append((current_question, " ".join(current_answers)))
        
        return qa_pairs

    def _evaluate_answer(self, question: str, answer: str) -> QuestionEvaluation:
        """Evaluate a single answer."""
        # Rule-based scoring (replace with LLM in production)
        score = 0.6  # Base score
        strengths = []
        improvements = []
        
        # Analyze answer length
        word_count = len(answer.split())
        if word_count > 50:
            score += 0.1
            strengths.append("Provided detailed response")
        elif word_count < 20:
            score -= 0.1
            improvements.append("Provide more detail in responses")
        
        # Check for STAR method indicators
        star_keywords = ["situation", "task", "action", "result", "outcome", "achieved"]
        star_count = sum(1 for kw in star_keywords if kw in answer.lower())
        if star_count >= 2:
            score += 0.15
            strengths.append("Good use of structured response format")
        
        # Check for quantifiable metrics
        if any(char.isdigit() for char in answer):
            score += 0.1
            strengths.append("Included specific metrics or numbers")
        else:
            improvements.append("Add quantifiable results when possible")
        
        # Check for confidence indicators
        hesitation_words = ["i think", "maybe", "probably", "i guess", "not sure"]
        if any(word in answer.lower() for word in hesitation_words):
            score -= 0.1
            improvements.append("Express answers with more confidence")
        
        # Cap score
        score = max(0.3, min(1.0, score))
        
        # Generate feedback
        if score >= 0.8:
            feedback = "Excellent answer! Clear and well-structured."
        elif score >= 0.6:
            feedback = "Good answer. Consider adding more specific examples."
        else:
            feedback = "Answer needs more depth. Use the STAR method for better structure."
        
        return QuestionEvaluation(
            question=question,
            answer_summary=answer[:200] + "..." if len(answer) > 200 else answer,
            score=round(score, 2),
            strengths=strengths,
            improvements=improvements,
            feedback=feedback,
        )

    def _generate_swot(self, evaluations: list[QuestionEvaluation]) -> SWOT:
        """Generate SWOT analysis from evaluations."""
        all_strengths = []
        all_weaknesses = []
        
        for eval in evaluations:
            all_strengths.extend(eval.strengths)
            all_weaknesses.extend(eval.improvements)
        
        # Deduplicate and limit
        unique_strengths = list(dict.fromkeys(all_strengths))[:5]
        unique_weaknesses = list(dict.fromkeys(all_weaknesses))[:5]
        
        # Generate opportunities and threats based on weaknesses/strengths
        opportunities = []
        threats = []
        
        for weakness in unique_weaknesses:
            if "detail" in weakness.lower():
                opportunities.append("Practice elaborating with specific examples")
            elif "confidence" in weakness.lower():
                opportunities.append("Build confidence through more mock interviews")
            elif "quantif" in weakness.lower():
                opportunities.append("Prepare metrics and numbers from past projects")
        
        if len(unique_strengths) == 0:
            threats.append("Need more preparation for competitive interviews")
        
        # Ensure we have at least one item in each category
        if not opportunities:
            opportunities = ["Continue practicing to maintain skills"]
        if not threats:
            threats = ["Industry competition may require deeper specialization"]
        
        return SWOT(
            strengths=unique_strengths if unique_strengths else ["Shows willingness to learn"],
            weaknesses=unique_weaknesses if unique_weaknesses else ["Could improve response depth"],
            opportunities=opportunities,
            threats=threats,
        )

    def _recommend_resources(self, weaknesses: list[str]) -> list[Resource]:
        """Recommend learning resources based on weaknesses."""
        resources = []
        
        resource_map = {
            "detail": Resource(
                title="Master the Art of Storytelling in Interviews",
                type="Article",
                url="https://example.com/interview-storytelling",
                reason="Helps with providing detailed, engaging responses"
            ),
            "confidence": Resource(
                title="Building Interview Confidence",
                type="Video",
                url="https://example.com/interview-confidence",
                reason="Techniques for confident communication"
            ),
            "star": Resource(
                title="STAR Method Interview Guide",
                type="Course",
                url="https://example.com/star-method",
                reason="Structured approach to behavioral questions"
            ),
            "quantif": Resource(
                title="Using Metrics in Your Interview Answers",
                type="Article",
                url="https://example.com/interview-metrics",
                reason="How to quantify your achievements"
            ),
        }
        
        for weakness in weaknesses:
            for keyword, resource in resource_map.items():
                if keyword in weakness.lower() and resource not in resources:
                    resources.append(resource)
        
        # Always add a general resource if none matched
        if not resources:
            resources.append(Resource(
                title="Complete Interview Preparation Guide",
                type="Course",
                url="https://example.com/interview-prep",
                reason="Comprehensive interview preparation"
            ))
        
        return resources[:3]  # Max 3 resources

    def _generate_summary(self, evaluations: list[QuestionEvaluation], score: float) -> str:
        """Generate a human-readable summary."""
        if not evaluations:
            return "No responses were analyzed in this interview session."
        
        performance = "excellent" if score >= 0.8 else "good" if score >= 0.6 else "needs improvement"
        
        return (
            f"Overall interview performance: {performance} ({int(score * 100)}%). "
            f"Analyzed {len(evaluations)} question-answer exchanges. "
            f"Focus on the improvement suggestions in each question for better results."
        )
