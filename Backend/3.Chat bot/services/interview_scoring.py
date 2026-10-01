"""Single implementation of the AI interview score.

The interview score is NOT stored: it is derived from the report the AI wrote
for the interview (``interview_reports.analysis_json``). This module is the one
place that turns that report into the numbers the product shows and decides on:

* ``GET /hr/interview-report/{application_id}`` - the recruiter report + verdict
* the post-interview SELECT / REJECT decision (50% threshold)

Both callers use these functions, so an automatic decision can never disagree
with the score the recruiter sees on the report. The weighting is unchanged:
Technical 50%, Aptitude 30%, Soft Skills 20%, plus the existing technical cap.
"""
from __future__ import annotations

import json
from typing import Any, Dict, Optional, Tuple

ROUND_KEYS = ("technical", "aptitude", "soft_skills")

ROUND_LABELS = {
    "technical": "Technical",
    "aptitude": "Aptitude",
    "soft_skills": "Soft Skills",
}

# Existing weights - never changed by this feature.
ROUND_WEIGHTS = {
    "technical": 0.50,
    "aptitude": 0.30,
    "soft_skills": 0.20,
}

# Do not let a weak technical round look strong overall.
LOW_TECHNICAL_PERCENT = 40
LOW_TECHNICAL_CAP = 50

# A completed interview at or above this final score selects the candidate
# automatically when the HR has automatic decisions switched on.
DECISION_THRESHOLD_PERCENT = 50

# Below this many evaluated questions the score is only an early signal.
RELIABILITY_MIN_QUESTIONS = 5


def build_rounds(answers: Any, analysis: Any) -> Tuple[Dict[str, Any], Dict[str, float]]:
    """Build the per-round detail + averages exactly as the HR report does.

    Returns ``(round_details, round_averages)``. ``round_averages`` holds each
    round's average out of 10 rounded to one decimal (the value the weighted
    overall score uses), while ``round_details[...]["average_percent"]`` keeps
    the existing unrounded percentage (used by the technical cap).
    """
    round_details: Dict[str, Any] = {}
    round_averages: Dict[str, float] = {}

    for round_key in ROUND_KEYS:
        question_answers = (answers or {}).get(round_key, []) if isinstance(answers, dict) else []
        question_analysis = (analysis or {}).get(round_key, []) if isinstance(analysis, dict) else []

        questions = []

        for index, item in enumerate(question_analysis):
            score_out_of_10 = float(item.get("score", 0) or 0)
            answer = (
                question_answers[index]
                if index < len(question_answers)
                else ""
            )

            questions.append({
                "question_number": index + 1,
                "answer": answer,
                "score_out_of_10": round(score_out_of_10, 1),
                "score_percent": int(score_out_of_10 * 10),
                "technical_accuracy": item.get("technical_accuracy", 0),
                "problem_solving": item.get("problem_solving", 0),
                "communication": item.get("communication", 0),
                "confidence": item.get("confidence", 0),
                "strengths": item.get("strengths", []),
                "improvements": item.get("improvements", []),
                "summary": item.get("summary", ""),
                "recommendation": item.get("recommendation", "Needs Review")
            })

        average_out_of_10 = (
            sum(q["score_out_of_10"] for q in questions) / len(questions)
            if questions else 0
        )

        round_averages[round_key] = round(average_out_of_10, 1)

        round_details[round_key] = {
            "label": ROUND_LABELS[round_key],
            "question_count": len(questions),
            "weight_percent": int(ROUND_WEIGHTS[round_key] * 100),
            "average_out_of_10": round(average_out_of_10, 1),
            "average_percent": int(average_out_of_10 * 10),
            "questions": questions
        }

    return round_details, round_averages


def weighted_overall(round_details: Dict[str, Any], round_averages: Dict[str, float]) -> int:
    """Weighted final score (0-100) with the existing technical cap."""
    overall = int(
        (round_averages["technical"] * 10 * ROUND_WEIGHTS["technical"]) +
        (round_averages["aptitude"] * 10 * ROUND_WEIGHTS["aptitude"]) +
        (round_averages["soft_skills"] * 10 * ROUND_WEIGHTS["soft_skills"])
    )

    if round_details["technical"]["average_percent"] < LOW_TECHNICAL_PERCENT:
        overall = min(overall, LOW_TECHNICAL_CAP)

    return overall


def verdict_for(overall: int, round_details: Dict[str, Any]) -> str:
    """Existing verdict wording, unchanged."""
    if overall >= 80 and round_details["technical"]["average_percent"] >= 65:
        return "Recommended for human interview"
    if overall >= 60:
        return "Consider after HR review"
    return "Not recommended at this stage"


def total_questions_for(round_details: Dict[str, Any]) -> int:
    return sum(details["question_count"] for details in round_details.values())


def reliability_note_for(total_questions: int) -> str:
    if total_questions < RELIABILITY_MIN_QUESTIONS:
        return (
            "Limited evidence: fewer than five questions were evaluated. "
            "Use this as an initial screening signal only."
        )
    return (
        "This score is based on five interview questions: "
        "2 technical, 2 aptitude, and 1 soft-skills question. "
        "Use it as a structured screening signal and validate it in a human interview."
    )


def lowest_round_label(round_details: Dict[str, Any]) -> str:
    lowest_round = min(
        round_details.values(),
        key=lambda details: details["average_percent"]
    )
    return lowest_round["label"]


def score_from_analysis(analysis: Any, answers: Any = None) -> Dict[str, Any]:
    """Full score breakdown for one interview report."""
    round_details, round_averages = build_rounds(answers, analysis)
    overall = weighted_overall(round_details, round_averages)
    total_questions = total_questions_for(round_details)

    return {
        "rounds": round_details,
        "round_averages": round_averages,
        "overall_score": overall,
        "total_questions": total_questions,
        "verdict": verdict_for(overall, round_details),
        "reliability_note": reliability_note_for(total_questions),
        "primary_improvement_area": lowest_round_label(round_details),
    }


def has_scored_rounds(analysis: Any) -> bool:
    """True when the stored analysis really contains scored questions."""
    if not isinstance(analysis, dict):
        return False
    return any(analysis.get(round_key) for round_key in ROUND_KEYS)


def final_score_from_analysis_json(analysis_json: Optional[str]) -> Optional[int]:
    """The authoritative final interview score for a stored report.

    Returns ``None`` when no scored report is available, so the caller can never
    decide on an invented score.
    """
    try:
        analysis = json.loads(analysis_json or "{}")
    except (json.JSONDecodeError, TypeError, ValueError):
        return None

    if not has_scored_rounds(analysis):
        return None

    # Answers only carry the question text; the score depends on the AI
    # analysis alone, so the value matches the HR report exactly.
    return score_from_analysis(analysis, {})["overall_score"]

