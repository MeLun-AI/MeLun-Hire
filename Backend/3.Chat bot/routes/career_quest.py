"""
Career Quest — reusable challenge engine for the applicant MeLun profile.

Follows the existing FastAPI + SQLite conventions used elsewhere in the
backend (modular APIRouter, get_conn() with WAL/busy_timeout, Pydantic
request models, JSON columns for structured payloads, ownership scoping
by applicant_id).

The challenge data model supports several task types:
  - multiple_choice : choose one option (integer index)
  - ranking         : order items by priority (list of item ids)
  - matching        : pair left->right items (list of [left, right])
  - scenario / data / technical : rendered like multiple_choice but tagged
    for richer UI + signal classification. Scenario tasks may carry
    `option_scores` (per-option partial credit, situational judgement).
  - open_text       : free-text answer graded against a transparent
    keyword rubric (`rubric` groups + `min_length`).
  - rule_shift      : classification task played under a stated rule that
    changes between phases (adaptability signal).

Every completed attempt contributes a real, traceable skill signal to the
applicant's MeLun evaluation. Scores are never arbitrarily inflated.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sqlite3
import json
import uuid
import re
from datetime import datetime

from auth.sessions import current_applicant_id, get_current_applicant

router = APIRouter(prefix="/career-quest", tags=["Career Quest"])

# ------------------------------------------------------------------
# DB helpers (match existing routers)
# ------------------------------------------------------------------
from config.paths import DB_PATH


def get_conn():
    conn = sqlite3.connect(
        DB_PATH,
        timeout=30,
        check_same_thread=False,
        isolation_level=None,
    )
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ------------------------------------------------------------------
# Pydantic request models
# ------------------------------------------------------------------
class AttemptStartRequest(BaseModel):
    applicant_id: str
    challenge_id: str


class TaskAnswer(BaseModel):
    task_index: int
    answer: Any
    # Per-question response time in milliseconds (sent by the client engine).
    time_ms: Optional[int] = None


class AttemptSubmitRequest(BaseModel):
    applicant_id: str
    time_taken_seconds: int = 0
    answers: List[TaskAnswer]
    # Optional client telemetry, e.g. {"per_question_ms": [...]}.
    meta: Optional[Dict[str, Any]] = None


class MysteryUnlockRequest(BaseModel):
    applicant_id: str
    challenge_id: str
# ------------------------------------------------------------------
# Schema creation
# ------------------------------------------------------------------
def ensure_career_quest_tables():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS career_quest_challenges (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL,
            skill TEXT NOT NULL,
            domain TEXT NOT NULL,
            difficulty TEXT DEFAULT 'intermediate',
            estimated_time INTEGER DEFAULT 90,
            scoring TEXT NOT NULL,
            explanation TEXT DEFAULT '',
            questions TEXT NOT NULL,
            active INTEGER DEFAULT 1,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS career_quest_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_code TEXT UNIQUE NOT NULL,
            applicant_id TEXT NOT NULL,
            challenge_id TEXT NOT NULL,
            status TEXT DEFAULT 'started',
            started_at TEXT,
            submitted_at TEXT,
            completed_at TEXT,
            answers_json TEXT,
            score INTEGER,
            time_taken INTEGER DEFAULT 0,
            correct_count INTEGER DEFAULT 0,
            total_count INTEGER DEFAULT 0,
            skill_impact TEXT,
            ai_evaluation TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS career_quest_skill_signals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            applicant_id TEXT NOT NULL,
            skill TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            signal_value INTEGER DEFAULT 0,
            source TEXT DEFAULT '',
            updated_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS career_quest_mystery (
            applicant_id TEXT PRIMARY KEY,
            challenge_id TEXT,
            revealed_opportunity TEXT,
            unlocked_at TEXT,
            revealed_at TEXT
        )
    """)

    conn.commit()

    # Idempotent seed of the reusable challenge catalog.
    _seed_challenges(cur)
    conn.commit()
    conn.close()


def _seed_challenges(cur):
    existing = {row[0] for row in cur.execute("SELECT id FROM career_quest_challenges")}
    for ch in SEED_CHALLENGES:
        if ch["id"] in existing:
            # Refresh catalog content for existing rows so upgraded games
            # (more rounds / new mechanics) reach players without a reset.
            # Attempt history is never touched — only the catalog definition.
            cur.execute(
                """
                UPDATE career_quest_challenges
                   SET title = ?, description = ?, category = ?, skill = ?,
                       domain = ?, difficulty = ?, estimated_time = ?,
                       scoring = ?, explanation = ?, questions = ?, active = 1
                 WHERE id = ?
                """,
                (
                    ch["title"],
                    ch["description"],
                    ch["category"],
                    ch["skill"],
                    ch["domain"],
                    ch["difficulty"],
                    ch["estimated_time"],
                    json.dumps(ch["scoring"]),
                    ch.get("explanation", ""),
                    json.dumps(ch["questions"]),
                    ch["id"],
                ),
            )
            continue
        cur.execute(
            """
            INSERT INTO career_quest_challenges
                (id, title, description, category, skill, domain, difficulty,
                 estimated_time, scoring, explanation, questions, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            (
                ch["id"],
                ch["title"],
                ch["description"],
                ch["category"],
                ch["skill"],
                ch["domain"],
                ch["difficulty"],
                ch["estimated_time"],
                json.dumps(ch["scoring"]),
                ch.get("explanation", ""),
                json.dumps(ch["questions"]),
                _now(),
            ),
        )
# ------------------------------------------------------------------
# Seed challenge catalog (part 1)
# ------------------------------------------------------------------
SEED_CHALLENGES = [
    {
        "id": "logic-sprint",
        "title": "Logic Sprint",
        "description": "Tight, transferable reasoning puzzles. Test how you approach constraints and deduction.",
        "category": "Problem Solving",
        "skill": "Logical Reasoning",
        "domain": "general",
        "difficulty": "easy",
        "estimated_time": 240,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Reasoning speed and accuracy tell MeLun Hire how nimbly you can break down unfamiliar problems.",
        "instructions": ["6 rounds, one puzzle at a time.", "Pick the single best answer for each round.", "Harder rounds are worth more points.", "Your per-round time is tracked."],
        "skills_tested": ["Problem Solving", "Logical Reasoning", "Pattern Recognition", "Speed"],
        "questions": [
            {"type": "multiple_choice", "kind": "number-pattern", "difficulty": "easy", "prompt": "2, 4, 8, 16, ?", "options": ["24", "32", "36", "42"], "correct_index": 1, "points": 12, "explanation": "Each term doubles: 16 x 2 = 32."},
            {"type": "multiple_choice", "kind": "number-pattern", "difficulty": "easy", "prompt": "3, 6, 11, 18, 27, ?", "options": ["36", "38", "39", "48"], "correct_index": 1, "points": 14, "explanation": "Gaps grow by 2 each step (+3,+5,+7,+9), so 27 + 11 = 38."},
            {"type": "multiple_choice", "kind": "sequence", "difficulty": "medium", "prompt": "A, C, F, J, O, ?", "options": ["T", "U", "V", "S"], "correct_index": 1, "points": 18, "explanation": "Gaps are +2,+3,+4,+5, so next gap is +6: O to U."},
            {"type": "multiple_choice", "kind": "deduction", "difficulty": "medium", "prompt": "All URGENT tickets go to on-call. Ticket #418 is URGENT. Who handles it?", "options": ["Anyone available", "The on-call engineer", "The product manager", "Nobody until triage"], "correct_index": 1, "points": 18, "explanation": "The rule routes every URGENT ticket to on-call."},
            {"type": "multiple_choice", "kind": "constraint", "difficulty": "hard", "prompt": "Builds A,B,C,D in some order. B before C. A immediately after D. C last. Which order works?", "options": ["D, A, B, C", "B, D, A, C", "D, B, A, C", "A, D, B, C"], "correct_index": 0, "points": 20, "explanation": "Only D,A,B,C keeps D immediately before A, B before C, C last."},
            {"type": "multiple_choice", "kind": "pattern", "difficulty": "hard", "prompt": "1 triangle, 2 triangles, 4 triangles, ? (doubling each step)", "options": ["5 triangles", "6 triangles", "8 triangles", "7 triangles"], "correct_index": 2, "points": 18, "explanation": "1,2,4 doubles to 8 next."},
        ],
    },
    {
        "id": "data-detective",
        "title": "Data Detective",
        "description": "Investigate an 8-week signup dataset: read the chart, spot the outlier, defend a recommendation.",
        "category": "Analytical Thinking",
        "skill": "Data Interpretation",
        "domain": "analytics",
        "difficulty": "intermediate",
        "estimated_time": 300,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Data storytelling reveals how you separate signal from noise before making decisions.",
        "instructions": ["Study the weekly-signups chart first.", "Answer 5 questions: highs, trends, outliers, averages, recommendation.", "Each answer shows what a strong analyst checks next."],
        "skills_tested": ["Analytical Thinking", "Data Interpretation", "Attention to Detail"],
        "questions": [
            {"type": "data", "kind": "chart-read", "dataset": {"title": "Weekly new signups (8 weeks)", "columns": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "values": [120, 135, 128, 150, 148, 210, 155, 162], "unit": "signups"}, "prompt": "Which week had the HIGHEST signups?", "options": ["Week 4 (150)", "Week 6 (210)", "Week 8 (162)", "Week 2 (135)"], "correct_index": 1, "points": 16, "explanation": "Week 6 peaks at 210, above every other bar."},
            {"type": "data", "kind": "trend", "dataset": {"title": "Weekly new signups (8 weeks)", "columns": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "values": [120, 135, 128, 150, 148, 210, 155, 162], "unit": "signups"}, "prompt": "Ignoring the spike, what is the overall trend from Week 1 to Week 8?", "options": ["Steady decline", "Roughly flat with a one-off spike", "Gradual upward trend", "No direction"], "correct_index": 2, "points": 18, "explanation": "Values climb from ~120 to ~160: gradual upward trend plus one spike."},
            {"type": "data", "kind": "outlier", "dataset": {"title": "Weekly new signups (8 weeks)", "columns": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "values": [120, 135, 128, 150, 148, 210, 155, 162], "unit": "signups"}, "prompt": "Week 6 jumps to 210, then Week 7 falls to 155. What should an analyst conclude FIRST?", "options": ["Growth permanently doubled", "Treat Week 6 as a one-off and investigate its cause", "Delete Week 6 from the report", "Stop all marketing spend"], "correct_index": 1, "points": 22, "explanation": "A spike that reverts is a classic one-off: verify before replanning."},
            {"type": "data", "kind": "comparison", "dataset": {"title": "Weekly new signups (8 weeks)", "columns": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "values": [120, 135, 128, 150, 148, 210, 155, 162], "unit": "signups"}, "prompt": "Average of Weeks 1-4 vs Weeks 5-8: which half is higher?", "options": ["Weeks 1-4", "Weeks 5-8", "Exactly equal", "Cannot tell"], "correct_index": 1, "points": 20, "explanation": "Weeks 1-4 avg ~133; Weeks 5-8 avg ~169."},
            {"type": "data", "kind": "conclusion", "dataset": {"title": "Weekly new signups (8 weeks)", "columns": ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"], "values": [120, 135, 128, 150, 148, 210, 155, 162], "unit": "signups"}, "prompt": "Leadership asks: double next quarter target based on Week 6? Best recommendation?", "options": ["Yes, lock in 400/week", "No: hold the trend target and explain the spike first", "Yes, but only for anniversaries", "No, cut targets instead"], "correct_index": 1, "points": 24, "explanation": "Never re-target on one unexplained spike."},
        ],
    },
    {
        "id": "priority-lab",
        "title": "Priority Lab",
        "description": "Run a product launch under pressure: rank 6 competing tasks with time for only 3, across 3 rounds.",
        "category": "Decision Making",
        "skill": "Prioritization",
        "domain": "general",
        "difficulty": "intermediate",
        "estimated_time": 300,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Trade-off reasoning under constraints predicts real launch performance.",
        "instructions": ["3 launch rounds, each with 6 tasks but capacity for 3.", "Drag or use arrows to rank: top 3 = what you DO.", "Each round reveals the consequence of your ranking.", "Severity ordering matters: safety and launch-blockers outrank nice-to-haves."],
        "skills_tested": ["Prioritization", "Decision Making", "Trade-off Reasoning", "Consistency"],
        "questions": [
            {"type": "ranking", "kind": "prioritize", "prompt": "Round 1 - Launch morning. You can only do 3. Rank all 6 (top = do first).", "items": [{"id": "sec", "label": "Security issue: checkout leaks partial card data"}, {"id": "bug", "label": "Critical production bug: payments failing"}, {"id": "complaint", "label": "Enterprise customer escalation: outage workaround"}, {"id": "feature", "label": "Feature request: dark mode"}, {"id": "meeting", "label": "Optional team lunch planning"}, {"id": "marketing", "label": "Marketing request: tweet wording"}], "correct_order": ["sec", "bug", "complaint", "feature", "marketing", "meeting"], "points": 34, "explanation": "Safety first (card leak), then revenue (payments), then the escalated customer. Feature/marketing/meeting wait."},
            {"type": "ranking", "kind": "prioritize", "prompt": "Round 2 - 2 hours to launch. Rank all 6 again.", "items": [{"id": "rollback", "label": "Rollback plan untested for the release"}, {"id": "perf", "label": "Checkout 3x slower under load test"}, {"id": "docs", "label": "Launch announcement draft"}, {"id": "logo", "label": "Logo tweak request"}, {"id": "survey", "label": "Optional post-launch survey design"}, {"id": "party", "label": "Launch party playlist"}], "correct_order": ["rollback", "perf", "docs", "logo", "survey", "party"], "points": 33, "explanation": "An untested rollback can sink the launch; performance is next. Comms matter; polish can wait."},
            {"type": "ranking", "kind": "prioritize", "prompt": "Round 3 - Launch slipped one day. Rank the recovery plan.", "items": [{"id": "postmortem", "label": "Blameless postmortem of the slip"}, {"id": "fix", "label": "Fix the root-cause defect"}, {"id": "notify", "label": "Notify affected customers honestly"}, {"id": "bonus", "label": "New bonus feature pitch"}, {"id": "rebrand", "label": "Rebrand the launch name"}, {"id": "swag", "label": "Order extra swag"}], "correct_order": ["fix", "notify", "postmortem", "bonus", "rebrand", "swag"], "points": 33, "explanation": "Fix, communicate, learn — in that order.Extras wait until trust is restored."},
        ],
    },
    {
        "id": "ui-judgment",
        "title": "UI Judgment",
        "description": "Choose the strongest interface hierarchy for a real pricing page. Target audience: end users.",
        "category": "Design",
        "skill": "Visual Hierarchy",
        "domain": "design",
        "difficulty": "intermediate",
        "estimated_time": 120,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "MeLun Hire maps this to your product and design-thinking signal.",
        "questions": [
            {"type": "scenario", "prompt": "For a pricing page, the 'Most Popular' plan should draw the most attention without misleading users. Best treatment?", "options": ["Make every card identical", "Highlighted border, slight scale and a badge", "Hide competing plan prices", "Loud animation on every card"], "correct_index": 1, "points": 50, "explanation": "A highlighted border, subtle scale and a clear badge focuses attention while keeping plans comparable."},
            {"type": "multiple_choice", "prompt": "Which hierarchy is clearest for a job posting?", "options": ["All text same size", "Title bold, key meta below, details further down", "Most content hidden", "Everything in one paragraph"], "correct_index": 1, "points": 50, "explanation": "Progressive disclosure with clear levels keeps scanning fast and scannable."},
        ],
    },
    {
        "id": "people-scenarios",
        "title": "People Scenarios",
        "description": "Five realistic workplace situations: conflict, missed deadlines, feedback, customers and leadership.",
        "category": "Communication",
        "skill": "Workplace Communication",
        "domain": "general",
        "difficulty": "intermediate",
        "estimated_time": 300,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Situational responses reveal communication and collaboration signals, not personality labels.",
        "instructions": ["5 scenarios, each with 4 possible actions.", "Choose the action you would most likely take.", "Stronger responses earn more credit; every choice shows coaching.", "Signals only: no answer labels you as a personality type."],
        "skills_tested": ["Communication", "Teamwork", "Conflict Resolution", "Customer Empathy"],
        "questions": [
            {"type": "scenario", "kind": "conflict", "prompt": "A teammate repeatedly misses deadlines and it is affecting your project. What do you do?", "options": ["Call them out in the group channel", "Talk privately: share impact, ask what is blocking them, agree a plan", "Quietly redo all their work yourself", "Escalate to the manager without talking to them"], "correct_index": 1, "option_scores": [0.1, 1.0, 0.4, 0.3], "points": 20, "explanation": "Private, impact-focused conversation with a joint plan is the strongest move.", "coaching": "Going public or silent hurts trust. Start private: name the impact, ask about blockers, agree a check-in."},
            {"type": "scenario", "kind": "feedback", "prompt": "Your manager gives blunt critical feedback in front of others. How do you respond?", "options": ["Argue back on the spot", "Stay calm, ask for specifics, request a 1:1 to discuss", "Shut down and ignore the feedback", "Complain about the manager to peers"], "correct_index": 1, "option_scores": [0.2, 1.0, 0.3, 0.1], "points": 20, "explanation": "Staying calm, seeking specifics and moving to a private forum shows maturity.", "coaching": "Defensiveness or gossip loses signal. Ask for one concrete example and a private follow-up."},
            {"type": "scenario", "kind": "customer", "prompt": "A customer writes an angry message about a delayed order. Best first response?", "options": ["Explain why it is not your fault", "Apologize for the delay, share the current status and a fix date", "Offer a discount and close the chat", "Ask them to calm down"], "correct_index": 1, "option_scores": [0.1, 1.0, 0.5, 0.0], "points": 20, "explanation": "Acknowledge, inform, commit: empathy plus a concrete next step.", "coaching": "Defensiveness escalates. Lead with ownership, status and a date."},
            {"type": "scenario", "kind": "teamwork", "prompt": "Two teammates disagree loudly about the approach in a standup. You facilitate. Best move?", "options": ["Let them argue until one wins", "Pause, restate both positions, timebox a test for each", "Pick your favourite side immediately", "Cancel the standup"], "correct_index": 1, "option_scores": [0.1, 1.0, 0.4, 0.2], "points": 20, "explanation": "Neutral facilitation with a timeboxed test keeps momentum and respect.", "coaching": "Avoid picking winners live. Make both views explicit, then test."},
            {"type": "scenario", "kind": "leadership", "prompt": "You must tell the team a deadline moved earlier by a week. Strongest approach?", "options": ["Announce it with no context", "Share the reason, the new plan, what drops, and invite concerns", "Hide it and hope the team speeds up", "Blame leadership"], "correct_index": 1, "option_scores": [0.2, 1.0, 0.1, 0.1], "points": 20, "explanation": "Transparent framing with trade-offs named builds trust under pressure.", "coaching": "Context plus trade-offs beats surprise. Name what drops and listen."},
        ],
    },
    {
        "id": "sales-scenario",
        "title": "Customer Scenario",
        "description": "Respond to a realistic sales objection with empathy and skill.",
        "category": "Communication",
        "skill": "Objection Handling",
        "domain": "sales",
        "difficulty": "intermediate",
        "estimated_time": 120,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "MeLun Hire evaluates how you handle customer concerns and uncover the real need.",
        "questions": [
            {"type": "scenario", "prompt": "A prospect says 'It looks great but it's too expensive right now.' Strongest response?", "options": ["\"Price is fair, just buy it.\"", "\"I hear that. What budget are you working with so we can find a fit?\"", "\"We can talk again later.\"", "\"Competitors cost more.\""], "correct_index": 1, "points": 50, "explanation": "Acknowledge the concern and explore the underlying need — respectful and effective."},
            {"type": "ranking", "prompt": "Prioritize these sales discovery actions.", "items": [{"id": "need", "label": "Understand the customer's core need"}, {"id": "stake", "label": "Identify the decision maker"}, {"id": "demo", "label": "Deliver a tailored demo"}, {"id": "close", "label": "Propose next steps"}], "correct_order": ["need", "stake", "demo", "close"], "points": 50, "explanation": "Discover need, confirm authority, demonstrate value, then move toward a close."},
        ],
    },
    {
        "id": "creative-lab",
        "title": "Creative Lab",
        "description": "Design a feature that makes a food-delivery app more useful for elderly users. Open response, transparent rubric.",
        "category": "Creativity",
        "skill": "Creativity",
        "domain": "general",
        "difficulty": "intermediate",
        "estimated_time": 300,
        "scoring": {"pass": 60, "max": 100},
        "explanation": "Problem framing, user empathy and practicality are scored against a visible rubric.",
        "instructions": ["Write 2-4 sentences (min 40 characters).", "Cover: the elderly user's problem, your idea, why it is practical.", "The rubric below shows exactly what earns credit.", "There is no single right answer: originality plus feasibility wins."],
        "skills_tested": ["Creativity", "Problem Framing", "User Empathy", "Practicality"],
        "questions": [
            {"type": "open_text", "kind": "brief", "prompt": "Design a feature that would make a food-delivery app more useful for elderly users. Describe the problem, your idea, and why it would work.", "min_length": 40, "points": 50, "rubric": [{"label": "User need", "keywords": ["elderly", "older", "senior", "vision", "hearing", "arthritis", "confus", "difficult", "lonely", "alone"]}, {"label": "Concrete feature", "keywords": ["button", "voice", "call", "large", "simple", "mode", "reminder", "schedule", "favourite", "favorite", "helper", "assistant"]}, {"label": "Practicality", "keywords": ["practical", "feasible", "cheap", "existing", "driver", "partner", "test", "pilot", "cost", "simple"]}, {"label": "Original angle", "keywords": ["family", "caregiver", "community", "volunteer", "nutrition", "medication", "weekly", "subscription", "check-in", "checkin"]}], "explanation": "Strong answers name a real elderly-user barrier, propose one concrete feature, and explain why it is feasible."},
            {"type": "open_text", "kind": "pitch", "prompt": "Pitch it in one line plus one risk: what is the headline benefit, and what could go wrong?", "min_length": 30, "points": 50, "rubric": [{"label": "Benefit", "keywords": ["easier", "safer", "faster", "independent", "confidence", "save", "benefit", "help"]}, {"label": "Risk named", "keywords": ["risk", "downside", "cost", "abuse", "confus", "wrong", "fail", "concern", "trade"]}, {"label": "Mitigation", "keywords": ["mitigat", "test", "limit", "opt", "confirm", "support", "fallback", "trial"]}], "explanation": "A good pitch pairs the benefit with an honest risk and a mitigation."},
        ],
    },
    {
        "id": "adaptability-game",
        "title": "Adaptability Game",
        "description": "The sorting rule changes mid-game across 3 rounds. Re-learn fast and stay accurate.",
        "category": "Adaptability",
        "skill": "Adaptability",
        "domain": "general",
        "difficulty": "intermediate",
        "estimated_time": 240,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Accuracy after rule changes measures learning speed and flexibility.",
        "instructions": ["Round 1: sort each item by the rule shown.", "Round 2: the rule CHANGES - read carefully.", "Round 3: a new twist applies on top.", "Tap a bucket for each item; accuracy after each change is the signal."],
        "skills_tested": ["Adaptability", "Learning Speed", "Attention to Detail"],
        "questions": [
            {"type": "rule_shift", "kind": "sort", "round": 1, "rule": "Round 1 rule: sort by SIZE. Small items go LEFT, large items go RIGHT.", "buckets": ["Small", "Large"], "cases": [{"item": "Ant", "bucket": "Small"}, {"item": "Mouse", "bucket": "Small"}, {"item": "Car", "bucket": "Large"}, {"item": "House", "bucket": "Large"}], "points": 30, "explanation": "Round 1 sorted by size: ant/mouse small, car/house large."},
            {"type": "rule_shift", "kind": "sort", "round": 2, "rule": "RULE CHANGE - Round 2: forget size. Sort by MATERIAL: made of METAL goes LEFT, made of WOOD goes RIGHT.", "buckets": ["Metal", "Wood"], "cases": [{"item": "Nail", "bucket": "Metal"}, {"item": "Chair", "bucket": "Wood"}, {"item": "Key", "bucket": "Metal"}, {"item": "Pencil", "bucket": "Wood"}], "points": 35, "explanation": "Round 2 switched to material: nail/key metal, chair/pencil wood. Sticking with size fails here."},
            {"type": "rule_shift", "kind": "sort", "round": 3, "rule": "TWIST - Round 3: sort by USE. Things you EAT go LEFT, things you WEAR go RIGHT.", "buckets": ["Eat", "Wear"], "cases": [{"item": "Apple", "bucket": "Eat"}, {"item": "Hat", "bucket": "Wear"}, {"item": "Bread", "bucket": "Eat"}, {"item": "Gloves", "bucket": "Wear"}], "points": 35, "explanation": "Round 3 twisted to use: apple/bread eaten, hat/gloves worn."},
        ],
    },
    {
        "id": "python-skills",
        "title": "Python Essentials",
        "description": "A short technical check on core Python fundamentals.",
        "category": "Technical",
        "skill": "Python",
        "domain": "developer",
        "difficulty": "intermediate",
        "estimated_time": 150,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "MeLun Hire maps this to your technical signal for developer roles.",
        "questions": [
            {"type": "technical", "prompt": "What does this return?  len([x for x in [1,2,2,3] if x == 2])", "options": ["1", "2", "3", "4"], "correct_index": 1, "points": 50, "explanation": "The comprehension keeps the two '2' values, so the length is 2."},
            {"type": "matching", "prompt": "Match the Python label to its purpose.", "pairs": [{"left": "dict", "right": "key/value mapping"}, {"left": "list", "right": "ordered sequence"}, {"left": "set", "right": "unique items"}, {"left": "tuple", "right": "immutable sequence"}], "points": 50, "explanation": "dict maps keys, list is ordered, set is unique, tuple is immutable."},
        ],
    },
    {
        "id": "mystery",
        "title": "Compat Check",
        "description": "A short analytical self-direction check that unlocks a hidden, high-compatibility opportunity.",
        "category": "Analytical Thinking",
        "skill": "Self-Direction",
        "domain": "mystery",
        "difficulty": "intermediate",
        "estimated_time": 90,
        "scoring": {"pass": 70, "max": 100},
        "explanation": "Completing this reveals a role MeLun Hire thinks you are highly compatible with.",
        "questions": [
            {"type": "multiple_choice", "prompt": "Which statement best fits how you approach your work?", "options": ["I prefer one clear, predefined task list", "I thrive when I can own a problem end-to-end and decide the approach", "I avoid working without constant supervision", "I only feel productive when told exactly what to do"], "correct_index": 1, "points": 100, "explanation": "Ownership and self-direction are strong signals for high-compatibility roles."},
        ],
    },
]
# ------------------------------------------------------------------
# Serialization helpers
# ------------------------------------------------------------------
def _challenge_public(row) -> dict:
    """Summary form (no questions) used for list/recommended endpoints."""
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "skill": row["skill"],
        "domain": row["domain"],
        "difficulty": row["difficulty"],
        "estimated_time": row["estimated_time"],
        "scoring": json.loads(row["scoring"]) if isinstance(row["scoring"], str) else row["scoring"],
        "explanation": row["explanation"],
        "active": bool(row["active"]),
    }


def _attempt_public(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "attempt_code": row["attempt_code"],
        "challenge_id": row["challenge_id"],
        "status": row["status"],
        "started_at": row["started_at"],
        "submitted_at": row["submitted_at"],
        "completed_at": row["completed_at"],
        "score": row["score"],
        "time_taken": row["time_taken"],
        "correct_count": row["correct_count"],
        "total_count": row["total_count"],
        "skill_impact": json.loads(row["skill_impact"]) if row["skill_impact"] else None,
        "ai_evaluation": json.loads(row["ai_evaluation"]) if row["ai_evaluation"] else None,
    }
# ------------------------------------------------------------------
# Grading engine (reusable)
# ------------------------------------------------------------------
def _grade_answer(question: dict, answer) -> dict:
    """Grade one question; returns {correct, earned, total, explanation, expected}."""
    points = question.get("points", 1)
    qtype = question.get("type", "multiple_choice")

    if qtype in ("multiple_choice", "scenario", "data", "technical"):
        expected = question.get("correct_index")
        # Situational judgement: optional per-option partial credit.
        option_scores = question.get("option_scores")
        if qtype == "scenario" and isinstance(option_scores, list) and isinstance(answer, int):
            try:
                frac = option_scores[answer] if 0 <= answer < len(option_scores) else 0
            except Exception:
                frac = 0
            try:
                frac = max(0.0, min(1.0, float(frac)))
            except Exception:
                frac = 0.0
            earned = round(points * frac)
            opts = question.get("options", [])
            exp_label = None
            try:
                best = max(range(len(option_scores)), key=lambda i: float(option_scores[i]))
                exp_label = opts[best] if best < len(opts) else None
            except Exception:
                exp_label = None
            coaching = question.get("coaching", "") or question.get("explanation", "")
            return {
                "correct": bool(frac >= 0.99),
                "earned": earned,
                "total": points,
                "explanation": question.get("explanation", "") if frac >= 0.99 else coaching,
                "expected": exp_label,
            }
        correct = answer == expected
        exp_label = None
        if isinstance(expected, int):
            opts = question.get("options", [])
            exp_label = opts[expected] if expected < len(opts) else None
        coaching = question.get("coaching", "") or question.get("explanation", "")
        return {
            "correct": bool(correct),
            "earned": points if correct else 0,
            "total": points,
            "explanation": question.get("explanation", "") if correct else coaching,
            "expected": exp_label,
        }

    if qtype == "ranking":
        items = question.get("items", [])
        correct_order = question.get("correct_order", [])
        chosen = answer if isinstance(answer, list) else []
        total = len(correct_order) or 1
        matches = 0
        for i, item_id in enumerate(correct_order):
            if i < len(chosen) and chosen[i] == item_id:
                matches += 1
        ratio = matches / total
        return {
            "correct": matches == total,
            "earned": round(points * ratio),
            "total": points,
            "explanation": question.get("explanation", ""),
            "expected": [item.get("label") for item in items],
        }

    if qtype == "matching":
        pairs = question.get("pairs", [])
        expected = {p["left"]: p["right"] for p in pairs}
        chosen = answer if isinstance(answer, dict) else {}
        total = len(expected) or 1
        matches = sum(1 for left, right in expected.items() if chosen.get(left) == right)
        ratio = matches / total
        return {
            "correct": matches == total,
            "earned": round(points * ratio),
            "total": points,
            "explanation": question.get("explanation", ""),
            "expected": expected,
        }

    if qtype == "rule_shift":
        # Classification under a stated rule. `cases` is a list of
        # {"item": str, "bucket": str}; the answer is a list of buckets
        # aligned to `cases`. Partial credit = fraction correct.
        cases = question.get("cases", []) or []
        expected = [str(c.get("bucket", "")) for c in cases]
        if not isinstance(answer, list) or not expected:
            return {"correct": False, "earned": 0, "total": points, "explanation": question.get("explanation", ""), "expected": expected or None}
        hits = sum(1 for i, exp in enumerate(expected) if i < len(answer) and str(answer[i]).strip().lower() == exp.strip().lower())
        ratio = hits / max(1, len(expected))
        return {
            "correct": bool(hits == len(expected)),
            "earned": round(points * ratio),
            "total": points,
            "explanation": question.get("explanation", ""),
            "expected": expected,
        }

    if qtype == "open_text":
        # Transparent keyword-rubric grading: `rubric` is a list of
        # {"label": str, "keywords": [str]}. Each matched group earns an
        # equal share of the points; text shorter than `min_length` chars
        # is capped at half credit. Nothing is hidden from the candidate.
        text = str(answer or "")
        lowered = text.lower()
        rubric = question.get("rubric", []) or []
        try:
            min_len = int(question.get("min_length", 40) or 40)
        except Exception:
            min_len = 40
        if not rubric:
            ok = len(text.strip()) >= min_len
            return {
                "correct": bool(ok),
                "earned": points if ok else 0,
                "total": points,
                "explanation": question.get("explanation", ""),
                "expected": None,
            }
        matched = [g.get("label", "criterion") for g in rubric if isinstance(g, dict) and any(str(kw).lower() in lowered for kw in (g.get("keywords", []) or []))]
        ratio = len(matched) / max(1, len(rubric))
        if len(text.strip()) < min_len:
            ratio = min(ratio, 0.5)
        detail = ("Matched: " + ", ".join(matched) + ". ") if matched else "No rubric criteria matched yet. "
        return {
            "correct": bool(ratio >= 0.99),
            "earned": round(points * ratio),
            "total": points,
            "explanation": (question.get("explanation", "") + " " + detail).strip(),
            "expected": [g.get("label") for g in rubric if isinstance(g, dict)],
        }

    return {"correct": False, "earned": 0, "total": points, "explanation": "", "expected": None}
def _grade_attempt(challenge, answers_map: Dict[int, Any]) -> dict:
    """Grade all questions; returns result summary consumed by endpoints."""
    questions = challenge["questions"]
    per_task = []
    earned_total = 0
    possible_total = 0
    correct_count = 0

    for idx, q in enumerate(questions):
        gr = _grade_answer(q, answers_map.get(idx))
        per_task.append({"task_index": idx, "type": q.get("type"), "prompt": q.get("prompt"), **gr})
        earned_total += gr["earned"]
        possible_total += gr["total"]
        if gr["correct"]:
            correct_count += 1

    score = round((earned_total / possible_total) * 100) if possible_total else 0

    if score >= 80:
        strength = "Strong"
    elif score >= 60:
        strength = "Good"
    else:
        strength = "Developing"

    ai = {
        "strength_label": strength,
        "score": score,
        "skill": challenge["skill"],
        "category": challenge["category"],
        "narrative": (
            f"You performed {strength.lower()} on {challenge['title']}, "
            f"scoring {score}/100 across {len(questions)} task(s) ({correct_count} fully correct). "
            f"This reinforces your {challenge['skill']} signal."
        ),
    }

    return {
        "score": score,
        "per_task": per_task,
        "correct_count": correct_count,
        "total_count": len(questions),
        "ai_evaluation": ai,
        "pass_mark": challenge.get("scoring", {}).get("pass", 70),
    }


def _record_skill_signal(conn, applicant_id: str, skill: str, signal_type: str, value: int, source: str):
    """Touch a traceable skill signal for the applicant."""
    cur = conn.cursor()
    cur.execute(
        """SELECT id FROM career_quest_skill_signals
           WHERE applicant_id = ? AND skill = ? AND signal_type = ?""",
        (applicant_id, skill, signal_type),
    )
    row = cur.fetchone()
    if row:
        cur.execute(
            """UPDATE career_quest_skill_signals
               SET signal_value = ?, source = ?, updated_at = ? WHERE id = ?""",
            (value, source, _now(), row["id"]),
        )
    else:
        cur.execute(
            """INSERT INTO career_quest_skill_signals
               (applicant_id, skill, signal_type, signal_value, source, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (applicant_id, skill, signal_type, value, source, _now()),
        )


def _load_challenge(challenge_id: str) -> Optional[dict]:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM career_quest_challenges WHERE id = ?", (challenge_id,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    data = dict(row)
    data["questions"] = json.loads(data["questions"])
    data["scoring"] = json.loads(data["scoring"])
    return data
# ------------------------------------------------------------------
# Challenge endpoints
# ------------------------------------------------------------------
@router.get("/challenges", dependencies=[Depends(get_current_applicant)])
def list_challenges():
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM career_quest_challenges WHERE active = 1 ORDER BY domain, title"
        ).fetchall()
    finally:
        conn.close()
    return [_challenge_public(r) for r in rows]


@router.get("/challenges/{challenge_id}")
def get_challenge_detail(challenge_id: str, sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    ch = _load_challenge(challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    # Include completion state (per-applicant) if an applicant is provided.
    completed = False
    last_score = None
    if applicant_id:
        conn = get_conn()
        try:
            row = conn.execute(
                """SELECT score, completed_at FROM career_quest_attempts
                   WHERE applicant_id = ? AND challenge_id = ? AND status = 'completed'
                   ORDER BY completed_at DESC LIMIT 1""",
                (applicant_id, challenge_id),
            ).fetchone()
            if row:
                completed = True
                last_score = row["score"]
        finally:
            conn.close()

    return {
        **{k: ch[k] for k in _challenge_public(ch)},
        "completed_by_me": completed,
        "my_last_score": last_score,
        "questions": ch["questions"],
    }


@router.get("/recommended")
def recommended_challenges(sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    """Challenges most relevant to the applicant based on domain + skills."""
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM career_quest_challenges WHERE active = 1 ORDER BY domain, title"
        ).fetchall()
        # Include completed state for the list view.
        completed_ids = set()
        if applicant_id:
            for r in conn.execute(
                """SELECT challenge_id FROM career_quest_attempts
                   WHERE applicant_id = ? AND status = 'completed'""",
                (applicant_id,),
            ):
                completed_ids.add(r[0])
    finally:
        conn.close()

    result = []
    for r in rows:
        pub = _challenge_public(r)
        pub["completed"] = r["id"] in completed_ids
        result.append(pub)
    return result


@router.get("/roles/{domain}", dependencies=[Depends(get_current_applicant)])
def challenges_for_role(domain: str):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM career_quest_challenges WHERE active = 1 AND domain = ?",
            (domain,),
        ).fetchall()
    finally:
        conn.close()
    return [_challenge_public(r) for r in rows]
# ------------------------------------------------------------------
# Attempts endpoints
# ------------------------------------------------------------------
@router.post("/attempts/start")
def start_attempt(data: AttemptStartRequest, sess: dict = Depends(get_current_applicant)):
    # The attempt is always created for the authenticated applicant.
    data.applicant_id = current_applicant_id(sess)
    ch = _load_challenge(data.challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Challenge not found")

    code = f"CQ-{uuid.uuid4().hex[:8].upper()}"
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO career_quest_attempts
               (attempt_code, applicant_id, challenge_id, status, started_at)
               VALUES (?, ?, ?, 'started', ?)""",
            (code, data.applicant_id, data.challenge_id, _now()),
        )
        attempt_id = cur.lastrowid
        row = cur.execute(
            "SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)
        ).fetchone()
    finally:
        conn.close()

    return _attempt_public(row)


@router.post("/attempts/{attempt_id}/submit")
def submit_attempt(attempt_id: int, data: AttemptSubmitRequest, sess: dict = Depends(get_current_applicant)):
    # Submitting is bound to the authenticated applicant.
    data.applicant_id = current_applicant_id(sess)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if row["applicant_id"] != data.applicant_id:
            raise HTTPException(status_code=403, detail="Not your attempt")
        ch = _load_challenge(row["challenge_id"])
        if not ch:
            raise HTTPException(status_code=404, detail="Challenge not found")
    finally:
        pass

    answers_map = {a.task_index: a.answer for a in data.answers}
    result = _grade_attempt(ch, answers_map)
    answered = len(answers_map)
    total = result["total_count"]

    # Require all questions answered before scoring (encourage full attempt).
    if answered < total:
        raise HTTPException(
            status_code=400,
            detail=f"Please answer all {total} questions before submitting.",
        )

    impact = {
        "skill": ch["skill"],
        "signal_type": "challenge",
        "score": result["score"],
        "pass_mark": result["pass_mark"],
    }

    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            """UPDATE career_quest_attempts
               SET status = 'submitted', submitted_at = ?, answers_json = ?,
                   score = ?, time_taken = ?, correct_count = ?, total_count = ?,
                   skill_impact = ?, ai_evaluation = ?
               WHERE id = ?""",
            (
                _now(),
                json.dumps(answers_map),
                result["score"],
                data.time_taken_seconds,
                result["correct_count"],
                result["total_count"],
                json.dumps(impact),
                json.dumps(result["ai_evaluation"]),
                attempt_id,
            ),
        )
        _record_skill_signal(
            conn, data.applicant_id, ch["skill"], "challenge", result["score"], row["challenge_id"]
        )
    finally:
        conn.close()

    return {**_attempt_public(row), "result": result}


@router.post("/attempts/{attempt_id}/complete")
def complete_attempt(attempt_id: int, data: dict, sess: dict = Depends(get_current_applicant)):
    # Completion is bound to the authenticated applicant.
    data = dict(data or {})
    data["applicant_id"] = current_applicant_id(sess)
    applicant_id = data["applicant_id"]
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Attempt not found")
        if row["applicant_id"] != applicant_id:
            raise HTTPException(status_code=403, detail="Not your attempt")
        conn.execute(
            """UPDATE career_quest_attempts SET status = 'completed', completed_at = ?
               WHERE id = ?""",
            (_now(), attempt_id),
        )
        row = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)
        ).fetchone()
    finally:
        conn.close()

    return _attempt_public(row)
@router.get("/attempts")
def attempt_history(sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    """Completed/submitted attempt history for an applicant (newest first)."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT * FROM career_quest_attempts
               WHERE applicant_id = ? AND status = 'completed'
               ORDER BY completed_at DESC""",
            (applicant_id,),
        ).fetchall()
    finally:
        conn.close()
    out = []
    for r in rows:
        item = _attempt_public(r)
        ch = _load_challenge(r["challenge_id"])
        item["title"] = ch["title"] if ch else r["challenge_id"]
        item["category"] = ch["category"] if ch else ""
        item["skill"] = ch["skill"] if ch else ""
        out.append(item)
    return out


@router.get("/attempts/{attempt_id}")
def get_attempt(attempt_id: int, sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM career_quest_attempts WHERE id = ?", (attempt_id,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Attempt not found")
    if row["applicant_id"] != applicant_id:
        raise HTTPException(status_code=403, detail="Not your attempt")
    item = _attempt_public(row)
    item["answers"] = json.loads(row["answers_json"]) if row["answers_json"] else None
    return item


# ------------------------------------------------------------------
# Skill signals (aggregate, transparent)
# ------------------------------------------------------------------
@router.get("/skill-signals")
def skill_signals(sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT skill, signal_type, signal_value, source, updated_at
               FROM career_quest_skill_signals WHERE applicant_id = ?
               ORDER BY signal_value DESC""",
            (applicant_id,),
        ).fetchall()
    finally:
        conn.close()

    # Also surfaced as a merged per-skill view for the Skill page.
    merged = {}
    for r in rows:
        skill = r["skill"]
        merged.setdefault(skill, {"skill": skill, "value": r["signal_value"], "latest": r["updated_at"], "sources": []})
        merged[skill]["sources"].append({"type": r["signal_type"], "value": r["signal_value"]})

    return {"signals": [dict(r) for r in rows], "skills": list(merged.values())}


# ------------------------------------------------------------------
# Real progress (backed by actual user activity)
# ------------------------------------------------------------------
@router.get("/progress")
def career_quest_progress(sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    conn = get_conn()
    try:
        challenges_done = conn.execute(
            """SELECT COUNT(*) FROM career_quest_attempts
               WHERE applicant_id = ? AND status = 'completed'""",
            (applicant_id,),
        ).fetchone()[0]
        skills_signals = conn.execute(
            """SELECT COUNT(DISTINCT skill) FROM career_quest_skill_signals
               WHERE applicant_id = ?""",
            (applicant_id,),
        ).fetchone()[0]
        total_questions = conn.execute("SELECT COUNT(*) FROM career_quest_challenges WHERE active = 1").fetchone()[0]
        mystery_row = conn.execute(
            "SELECT revealed_opportunity FROM career_quest_mystery WHERE applicant_id = ?",
            (applicant_id,),
        ).fetchone()
        applications = conn.execute(
            "SELECT COUNT(*) FROM applications WHERE applicant_id = ?", (applicant_id,)
        ).fetchone()[0]
        has_resume = False
        resume_row = conn.execute("SELECT full_name FROM applicants WHERE id = ?", (applicant_id,)).fetchone()
        # resume detection is based on stored analysis file; approximate via profile presence.
        prof = conn.execute(
            "SELECT phone, location, experience_years FROM applicants WHERE id = ?",
            (applicant_id,),
        ).fetchone()
    finally:
        conn.close()

    profile_done = bool(prof and prof["phone"] and prof["location"] and prof["experience_years"])
    skills_done = bool(resume_row)  # a profile exists
    mystery_done = bool(mystery_row and mystery_row["revealed_opportunity"])

    milestones = [
        {"id": "profile", "label": "Complete your profile", "done": profile_done, "hint": "Add contact details and professional experience."},
        {"id": "skills", "label": "Verify your skills", "done": skills_done, "hint": "Add skills on your profile."},
        {"id": "challenge", "label": "Complete your first challenge", "done": challenges_done >= 1, "hint": "Try a role-specific quick challenge."},
        {"id": "discover", "label": "Discover 5 opportunities", "done": False, "hint": "Explore the career map."},
        {"id": "apply", "label": "Apply to a strong match", "done": applications > 0, "hint": "Apply to a high-match role."},
        {"id": "skill-signal", "label": "Build a skill signal", "done": skills_signals >= 1, "hint": "Complete your first skill challenge."},
        {"id": "mystery", "label": "Unlock a mystery opportunity", "done": mystery_done, "hint": "Complete the Compat Check challenge."},
    ]
    done_count = sum(1 for m in milestones if m["done"])
    total = len(milestones)
    percent = round((done_count / total) * 100) if total else 0

    return {
        "milestones": milestones,
        "percent": percent,
        "done_count": done_count,
        "total": total,
        "challenges_completed": challenges_done,
        "skills_signals": skills_signals,
        "opportunities_unlocked": 1 if mystery_done else 0,
        "applications": applications,
        "total_challenges_available": total_questions,
    }
# ------------------------------------------------------------------
# Mystery opportunity (persisted so refresh does not reset it)
# ------------------------------------------------------------------
def _applicant_skill_set(applicant_id: str) -> set:
    conn = get_conn()
    try:
        row = conn.execute("SELECT skills FROM applicants WHERE id = ?", (applicant_id,)).fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        return set()
    return {
        s.strip().lower()
        for s in re.split(r"[,;\n]", str(row[0]))
        if s.strip()
    }


def _compute_best_opportunity(applicant_id: str) -> Optional[dict]:
    """Pick the highest-match OPEN role for the applicant from real job posts."""
    skills = _applicant_skill_set(applicant_id)

    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT j.id, j.job_title, j.job_domain, j.salary, j.location, j.job_mode,
                   j.job_type, j.required_skills, u.company_name
            FROM hr_job_posts j
            JOIN hr_users u ON j.hr_id = u.id
            WHERE j.status = 'open' OR j.status IS NULL
            """
        ).fetchall()
    finally:
        conn.close()

    best = None
    for r in rows:
        try:
            required = json.loads(r["required_skills"]) if r["required_skills"] else []
        except Exception:
            required = []
        if not required:
            continue
        req = [s.lower() for s in required if s]
        matched = sum(1 for s in req if s in skills)
        score = round((matched / len(req)) * 100) if req else 0
        if best is None or score > best["match"]:
            best = {
                "job_id": r["id"],
                "title": r["job_title"],
                "company": r["company_name"] or "Open position",
                "salary": r["salary"] or "Competitive",
                "location": r["location"] or r["job_mode"] or "Remote",
                "type": r["job_type"] or (r["job_mode"] or "Full-time"),
                "match": score,
                "matched_skills": [s for s in required if s.lower() in skills][:4],
                "missing_skills": [s for s in required if s.lower() not in skills][:4],
            }
    return best


@router.get("/mystery")
def get_mystery(sess: dict = Depends(get_current_applicant)):
    # Identity comes from the session, never from the query string.
    applicant_id = current_applicant_id(sess)
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM career_quest_mystery WHERE applicant_id = ?", (applicant_id,)
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return {"unlocked": False, "revealed": False, "opportunity": None}
    return {
        "unlocked": True,
        "revealed": bool(row["revealed_opportunity"]),
        "challenge_id": row["challenge_id"],
        "opportunity": json.loads(row["revealed_opportunity"]) if row["revealed_opportunity"] else None,
    }


@router.post("/mystery/unlock")
def mystery_unlock(data: MysteryUnlockRequest, sess: dict = Depends(get_current_applicant)):
    # Unlocking is bound to the authenticated applicant.
    data.applicant_id = current_applicant_id(sess)
    # Only unlock after the applicant has actually completed the mystery challenge.
    conn = get_conn()
    try:
        done = conn.execute(
            """SELECT COUNT(*) FROM career_quest_attempts
               WHERE applicant_id = ? AND challenge_id = ? AND status = 'completed'""",
            (data.applicant_id, data.challenge_id),
        ).fetchone()[0]
    finally:
        conn.close()
    if done == 0:
        raise HTTPException(status_code=403, detail="Complete the Compat Check challenge first.")
    conn = get_conn()
    try:
        conn.execute(
            """INSERT INTO career_quest_mystery (applicant_id, challenge_id, unlocked_at)
               VALUES (?, ?, ?)
               ON CONFLICT(applicant_id) DO UPDATE SET challenge_id = excluded.challenge_id""",
            (data.applicant_id, data.challenge_id, _now()),
        )
        conn.commit()
    finally:
        conn.close()
    return {"unlocked": True}


@router.post("/mystery/reveal")
def mystery_reveal(data: dict, sess: dict = Depends(get_current_applicant)):
    # Revealing is bound to the authenticated applicant.
    data = dict(data or {})
    data["applicant_id"] = current_applicant_id(sess)
    applicant_id = data["applicant_id"]
    conn = get_conn()
    try:
        done = conn.execute(
            """SELECT COUNT(*) FROM career_quest_attempts
               WHERE applicant_id = ? AND challenge_id = 'mystery' AND status = 'completed'""",
            (applicant_id,),
        ).fetchone()[0]
    finally:
        conn.close()
    if done == 0:
        raise HTTPException(status_code=403, detail="Complete the Compat Check challenge first.")

    opp = _compute_best_opportunity(applicant_id)

    conn = get_conn()
    try:
        conn.execute(
            """INSERT INTO career_quest_mystery (applicant_id, challenge_id, revealed_opportunity, unlocked_at, revealed_at)
               VALUES (?, 'mystery', ?, ?, ?)
               ON CONFLICT(applicant_id) DO UPDATE SET
                 revealed_opportunity = excluded.revealed_opportunity, revealed_at = excluded.revealed_at""",
            (applicant_id, json.dumps(opp) if opp else None, _now(), _now()),
        )
        conn.commit()
    finally:
        conn.close()

    return {"revealed": True, "opportunity": opp}


# Run schema creation at import time so tables exist before the app serves routes.
ensure_career_quest_tables()