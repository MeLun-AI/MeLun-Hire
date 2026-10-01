"""
Talent Arena — the HR/recruiter-side interactive hiring experience.

Follows the same conventions as the Career Quest router (modular APIRouter,
get_conn() with WAL + busy_timeout, Pydantic request models, JSON columns,
ownership scoping by hr_id) and reuses the applicant side of MeLun Hire as the
evidence source:

  - applicants / hr_job_posts / applications   (existing base tables)
  - resume_reports / interview_reports         (existing AI reports)
  - career_quest_skill_signals / attempts      (the real Career Quest
    evidence produced by applicants — never fabricated)

Everything HR sees here is traceable to one of those sources.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import sqlite3
import os
import json
import re
from datetime import datetime

from auth.sessions import (
    current_applicant_id,
    current_hr_id,
    get_current_applicant,
    get_current_hr,
    require_hr_ownership,
)

router = APIRouter(prefix="/talent-arena", tags=["Talent Arena"])

# ------------------------------------------------------------------
# DB helpers (identical pattern to routes/career_quest.py)
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "database", "database.db")


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


def _split_skills(value) -> List[str]:
    """Split a comma/semicolon/newline separated skill string."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [p.strip() for p in re.split(r"[,;\n]", str(value)) if p.strip()]


def _evidence_level(value: Optional[int]) -> str:
    """Map a Career Quest signal value to an explainable level label."""
    if value is None or value <= 0:
        return "No assessment evidence"
    if value >= 85:
        return "Very Strong"
    if value >= 70:
        return "Strong"
    if value >= 55:
        return "Moderate"
    return "Developing"


def _keyword_level(pct: float) -> str:
    if pct >= 80:
        return "Strong"
    if pct >= 50:
        return "Moderate"
    return "Low"


# ------------------------------------------------------------------
# Schema creation (new tables only — existing schema untouched)
# ------------------------------------------------------------------
def ensure_talent_arena_tables():
    conn = get_conn()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            application_id INTEGER NOT NULL,
            applicant_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            mode TEXT DEFAULT 'detective',
            recommendation TEXT NOT NULL,
            confidence TEXT,
            notes TEXT DEFAULT '',
            evidence_json TEXT,
            revealed_before_eval INTEGER DEFAULT 0,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_comparisons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            application_ids TEXT NOT NULL,
            decision TEXT DEFAULT '',
            tradeoffs_json TEXT,
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            slots_json TEXT NOT NULL,
            coverage INTEGER DEFAULT 0,
            gaps_json TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_hiring_quest (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            stage TEXT NOT NULL,
            updated_at TEXT,
            UNIQUE(hr_id, job_id)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_team_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            application_id INTEGER NOT NULL,
            job_id INTEGER NOT NULL,
            evaluator_name TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            confidence TEXT,
            strengths TEXT DEFAULT '',
            concerns TEXT DEFAULT '',
            created_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS ta_challenge_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hr_id INTEGER NOT NULL,
            application_id INTEGER NOT NULL,
            applicant_id TEXT NOT NULL,
            challenge_id TEXT NOT NULL,
            skill TEXT DEFAULT '',
            role_bar INTEGER DEFAULT 80,
            status TEXT DEFAULT 'sent',
            created_at TEXT,
            completed_at TEXT
        )
    """)

    conn.commit()
    conn.close()


# Run schema creation at import time so tables exist before serving routes.
ensure_talent_arena_tables()


# ------------------------------------------------------------------
# Data access helpers (shared by the candidate pool / radar / quest)
# ------------------------------------------------------------------
def _hr_exists(cur, hr_id: int) -> bool:
    try:
        return (
            cur.execute("SELECT 1 FROM hr_users WHERE id = ?", (hr_id,)).fetchone()
            is not None
        )
    except sqlite3.OperationalError:
        return True


def _load_hr_jobs(cur, hr_id: int) -> List[Dict[str, Any]]:
    jobs = []
    try:
        rows = cur.execute(
            """SELECT id, job_title, job_domain, experience_required, location,
                      required_skills, preferred_skills, status
                 FROM hr_job_posts WHERE hr_id = ?
                 ORDER BY id DESC""",
            (hr_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return jobs
    for r in rows:
        jobs.append(
            {
                "id": r[0],
                "job_title": r[1],
                "job_domain": r[2],
                "experience_required": r[3],
                "location": r[4],
                "required_skills": _split_skills(r[5]),
                "preferred_skills": _split_skills(r[6]),
                "status": r[7],
            }
        )
    return jobs


def _load_signals(cur) -> Dict[str, Dict[str, Dict[str, Any]]]:
    """applicant_id -> skill -> {value, sources:[{type, value}]}."""
    out: Dict[str, Dict[str, Dict[str, Any]]] = {}
    try:
        rows = cur.execute(
            """SELECT applicant_id, skill, signal_type, signal_value, source
                 FROM career_quest_skill_signals"""
        ).fetchall()
    except sqlite3.OperationalError:
        return out
    for r in rows:
        applicant, skill, stype, sval, source = r[0], r[1], r[2], r[3] or 0, r[4] or ""
        per = out.setdefault(applicant, {}).setdefault(
            skill, {"value": 0, "sources": []}
        )
        per["sources"].append({"type": stype, "value": sval, "source": source})
        per["value"] = max(per["value"], sval)
    return out


def _load_attempts(cur) -> Dict[str, Dict[str, Any]]:
    """applicant_id -> {completed, avg_score, recent: [{challenge_id, score, at}]}"""
    out: Dict[str, Dict[str, Any]] = {}
    try:
        rows = cur.execute(
            """SELECT applicant_id, challenge_id, score, submitted_at
                 FROM career_quest_attempts
                WHERE status = 'completed'
                ORDER BY submitted_at DESC"""
        ).fetchall()
    except sqlite3.OperationalError:
        return out
    for r in rows:
        entry = out.setdefault(
            r[0], {"completed": 0, "avg_score": 0, "scores": [], "recent": []}
        )
        entry["completed"] += 1
        if r[2] is not None:
            entry["scores"].append(r[2])
        entry["recent"].append({"challenge_id": r[1], "score": r[2], "at": r[3]})
        entry["recent"] = entry["recent"][:10]
    for entry in out.values():
        entry["avg_score"] = (
            round(sum(entry["scores"]) / len(entry["scores"]))
            if entry["scores"]
            else 0
        )
        entry.pop("scores", None)
    return out


def _load_resume_reports(cur) -> Dict[int, Dict[str, Any]]:
    out: Dict[int, Dict[str, Any]] = {}
    try:
        rows = cur.execute(
            "SELECT application_id, matched, matched_skills FROM resume_reports"
        ).fetchall()
    except sqlite3.OperationalError:
        return out
    for r in rows:
        matched_skills: List[str] = []
        try:
            parsed = json.loads(r[2]) if r[2] else []
            if isinstance(parsed, list):
                matched_skills = [
                    s.get("skill", "") if isinstance(s, dict) else str(s)
                    for s in parsed
                ]
            elif isinstance(parsed, dict):
                matched_skills = _split_skills(parsed.get("matched_skills"))
        except (ValueError, TypeError):
            matched_skills = _split_skills(r[2])
        out[r[0]] = {"matched": r[1], "matched_skills": matched_skills}
    return out


def _load_interview_scores(cur) -> Dict[int, int]:
    out: Dict[int, int] = {}
    try:
        rows = cur.execute(
            "SELECT application_id, analysis_json FROM interview_reports"
        ).fetchall()
    except sqlite3.OperationalError:
        return out
    for r in rows:
        try:
            analysis = json.loads(r[1]) if r[1] else {}
        except (ValueError, TypeError):
            continue
        if isinstance(analysis, dict):
            for key in ("overall_score", "total_score", "score", "overall"):
                v = analysis.get(key)
                if isinstance(v, (int, float)):
                    out[r[0]] = int(v)
                    break
    return out


def _fit_for_job(
    skills: List[str],
    signals: Dict[str, Dict[str, Any]],
    required: List[str],
) -> Dict[str, Any]:
    """Job-specific fit: declared skills + Career Quest evidence per requirement."""
    skill_lower = {s.lower() for s in skills}
    matched: List[str] = []
    missing: List[str] = []
    per_skill: List[Dict[str, Any]] = []
    for req in required:
        req_l = req.lower()
        declared = req_l in skill_lower
        best_signal = 0
        # Evidence may live under a related signal name (e.g. "Problem Solving").
        for sig_skill, data in signals.items():
            sig_l = sig_skill.lower()
            if sig_l == req_l or req_l in sig_l or sig_l in req_l:
                best_signal = max(best_signal, data.get("value", 0))
        if declared or best_signal >= 55:
            matched.append(req)
        else:
            missing.append(req)
        per_skill.append(
            {
                "skill": req,
                "declared": declared,
                "signal": best_signal or None,
                "level": _evidence_level(best_signal or None),
            }
        )
    pct = round(len(matched) / len(required) * 100) if required else 0
    return {
        "score": pct,
        "matched_skills": matched,
        "missing_skills": missing,
        "per_skill": per_skill,
    }


def _load_pool(cur, hr_id: int) -> List[Dict[str, Any]]:
    """Build the full candidate pool for one HR account, evidence included."""
    jobs = _load_hr_jobs(cur, hr_id)
    job_by_id = {j["id"]: j for j in jobs}
    if not jobs:
        return []

    signals_all = _load_signals(cur)
    attempts_all = _load_attempts(cur)
    resumes = _load_resume_reports(cur)
    interviews = _load_interview_scores(cur)

    pool: List[Dict[str, Any]] = []
    rows = cur.execute(
        """SELECT a.id AS application_id, a.applicant_id, a.job_id, a.resume_status,
                  ap.full_name, ap.email, ap.phone, ap.location,
                  ap.experience_years, ap.skills
             FROM applications a
             JOIN applicants ap ON ap.id = a.applicant_id
            WHERE a.job_id IN (%s)
            ORDER BY a.applied_at DESC"""
        % ",".join("?" * len(jobs)),
        tuple(j["id"] for j in jobs),
    ).fetchall()

    for r in rows:
        job = job_by_id.get(r[2], {})
        skills = _split_skills(r[9])
        signals = signals_all.get(r[1], {})
        evidence = [
            {
                "skill": s,
                "value": d.get("value", 0),
                "level": _evidence_level(d.get("value")),
                "sources": d.get("sources", []),
            }
            for s, d in sorted(
                signals.items(), key=lambda kv: -kv[1].get("value", 0)
            )
        ]
        attempts = attempts_all.get(
            r[1], {"completed": 0, "avg_score": 0, "recent": []}
        )
        pool.append(
            {
                "application_id": r[0],
                "applicant_id": r[1],
                "job_id": r[2],
                "job_title": job.get("job_title", ""),
                "resume_status": r[3],
                "full_name": r[4],
                "email": r[5],
                "phone": r[6],
                "location": r[7],
                "experience_years": r[8],
                "skills": skills,
                "required_skills": job.get("required_skills", []),
                "resume": resumes.get(r[0]),
                "interview_score": interviews.get(r[0]),
                "quno_evidence": evidence,
                "assessment": {
                    "completed": attempts.get("completed", 0),
                    "avg_score": attempts.get("avg_score", 0),
                    "recent": attempts.get("recent", []),
                },
                "fit": _fit_for_job(
                    skills, signals, job.get("required_skills", [])
                ),
            }
        )
    return pool


# ------------------------------------------------------------------
# Pydantic request models
# ------------------------------------------------------------------
class EvaluationRequest(BaseModel):
    hr_id: int
    application_id: int
    applicant_id: str
    job_id: int
    mode: str = "detective"  # 'detective' | 'blind'
    recommendation: str  # Strong Hire / Consider / Weak Fit / Need More Evidence
    confidence: Optional[str] = None
    notes: str = ""
    evidence: Optional[Dict[str, Any]] = None
    revealed_before_eval: bool = False


class ComparisonRequest(BaseModel):
    hr_id: int
    job_id: int
    application_ids: List[int]
    decision: str = ""
    tradeoffs: Optional[Dict[str, Any]] = None


class TeamSlot(BaseModel):
    role: str
    required_skills: List[str] = []
    application_id: Optional[int] = None


class TeamRequest(BaseModel):
    hr_id: int
    name: str
    slots: List[TeamSlot]
    persist: bool = True


class HiringQuestRequest(BaseModel):
    hr_id: int
    job_id: int
    stage: str  # define-role | discover | evaluate | challenge | interview | decide | hire


class TeamVoteRequest(BaseModel):
    hr_id: int
    application_id: int
    job_id: int
    evaluator_name: str
    recommendation: str  # Move Forward / Hold / Reject / Need More Evidence
    confidence: Optional[str] = None
    strengths: str = ""
    concerns: str = ""


class ChallengeRequestModel(BaseModel):
    hr_id: int
    application_id: int
    applicant_id: str
    challenge_id: str
    skill: str = ""
    role_bar: int = 80


# ------------------------------------------------------------------
# Candidate pool endpoint (the shared evidence base for every experience)
# ------------------------------------------------------------------
@router.get("/candidates/{hr_id}")
def talent_candidates(hr_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own candidate pool.
    hr_id = require_hr_ownership(hr_id, sess)
    """All candidates across the jobs of this HR account, with MeLun evidence."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        if not _hr_exists(cur, hr_id):
            raise HTTPException(status_code=404, detail="HR account not found.")
        pool = _load_pool(cur, hr_id)
        jobs = _load_hr_jobs(cur, hr_id)
        return {
            "jobs": [
                {
                    "id": j["id"],
                    "job_title": j["job_title"],
                    "required_skills": j["required_skills"],
                    "experience_required": j["experience_required"],
                    "status": j["status"],
                    "candidates": sum(1 for c in pool if c["job_id"] == j["id"]),
                }
                for j in jobs
            ],
            "candidates": pool,
        }
    finally:
        conn.close()


# ------------------------------------------------------------------
# Talent Radar — explainable, evidence-based recommendations
# ------------------------------------------------------------------
def _parse_experience_years(value) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(str(value).strip().split()[0])
    except (ValueError, IndexError):
        return None


@router.get("/radar/{hr_id}")
def talent_radar(hr_id: int, job_id: Optional[int] = Query(default=None), sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own candidate pool.
    hr_id = require_hr_ownership(hr_id, sess)
    """Ranked candidates for a job with a full 'why surfaced' breakdown."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        if not _hr_exists(cur, hr_id):
            raise HTTPException(status_code=404, detail="HR account not found.")
        pool = _load_pool(cur, hr_id)
        if job_id is not None:
            pool = [c for c in pool if c["job_id"] == job_id]

        jobs = {j["id"]: j for j in _load_hr_jobs(cur, hr_id)}
        recs = []
        for c in pool:
            keyword_pct = c["fit"]["score"]

            # Skill evidence: strongest Career Quest signal per matched requirement.
            evidence_values = [
                ps["signal"] for ps in c["fit"]["per_skill"] if ps["signal"]
            ]
            skill_evidence = (
                round(sum(evidence_values) / len(evidence_values))
                if evidence_values
                else 0
            )

            assessment = c["assessment"]
            assessment_score = assessment.get("avg_score", 0)

            job = jobs.get(c["job_id"], {})
            required_years = _parse_experience_years(job.get("experience_required"))
            has_years = c["experience_years"] is not None
            if required_years is not None and has_years:
                exp_pct = min(
                    100, round(c["experience_years"] / max(required_years, 1) * 100)
                )
            elif has_years:
                exp_pct = 60  # known experience, no stated requirement — neutral
            else:
                exp_pct = 0

            overall = (
                0.40 * keyword_pct
                + 0.35 * skill_evidence
                + 0.15 * assessment_score
                + 0.10 * exp_pct
            )
            hidden_gem = keyword_pct < 50 and assessment_score >= 70

            recs.append(
                {
                    "application_id": c["application_id"],
                    "applicant_id": c["applicant_id"],
                    "job_id": c["job_id"],
                    "job_title": c["job_title"],
                    "full_name": c["full_name"],
                    "skills": c["skills"],
                    "missing_skills": c["fit"]["missing_skills"],
                    "experience_years": c["experience_years"],
                    "assessment_completed": assessment.get("completed", 0),
                    "quno_evidence": c["quno_evidence"][:5],
                    "resume_keyword_match": _keyword_level(keyword_pct),
                    "skill_evidence": _evidence_level(skill_evidence or None),
                    "assessment_evidence": (
                        _evidence_level(assessment_score or None)
                        if assessment.get("completed")
                        else "No challenges completed yet"
                    ),
                    "overall_potential": _evidence_level(round(overall) or None),
                    "match_score": round(overall),
                    "hidden_gem": hidden_gem,
                    "why": [
                        {
                            "label": "Resume keyword match",
                            "detail": _keyword_level(keyword_pct),
                            "value": keyword_pct,
                        },
                        {
                            "label": "Skill evidence",
                            "detail": _evidence_level(skill_evidence or None),
                            "value": skill_evidence,
                        },
                        {
                            "label": "Assessment evidence",
                            "detail": (
                                _evidence_level(assessment_score or None)
                                if assessment.get("completed")
                                else "No challenges completed yet"
                            ),
                            "value": assessment_score,
                        },
                        {
                            "label": "Overall potential fit",
                            "detail": _evidence_level(round(overall) or None),
                            "value": round(overall),
                        },
                    ],
                }
            )

        recs.sort(key=lambda r: -r["match_score"])
        return {"recommendations": recs, "job_id": job_id}
    finally:
        conn.close()


# ------------------------------------------------------------------
# HR Evaluations (Talent Detective + Blind Evaluation)
# ------------------------------------------------------------------
@router.post("/evaluations")
def save_evaluation(data: EvaluationRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the evaluation is always stored for the authenticated HR.
    data.hr_id = current_hr_id(sess)
    if data.recommendation not in (
        "Strong Hire", "Consider", "Weak Fit", "Need More Evidence",
    ):
        raise HTTPException(status_code=400, detail="Invalid recommendation value.")
    conn = get_conn()
    try:
        conn.execute(
            """INSERT INTO ta_evaluations
                   (hr_id, application_id, applicant_id, job_id, mode,
                    recommendation, confidence, notes, evidence_json,
                    revealed_before_eval, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.hr_id,
                data.application_id,
                data.applicant_id,
                data.job_id,
                data.mode if data.mode in ("detective", "blind") else "detective",
                data.recommendation,
                data.confidence,
                data.notes,
                json.dumps(data.evidence) if data.evidence else None,
                1 if data.revealed_before_eval else 0,
                _now(),
            ),
        )
        return {"success": True, "message": "Evaluation saved."}
    finally:
        conn.close()


@router.get("/evaluations/{hr_id}")
def list_evaluations(hr_id: int, application_id: Optional[int] = Query(default=None), sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own evaluations.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    try:
        sql = "SELECT * FROM ta_evaluations WHERE hr_id = ?"
        params: List[Any] = [hr_id]
        if application_id is not None:
            sql += " AND application_id = ?"
            params.append(application_id)
        rows = conn.execute(sql + " ORDER BY created_at DESC", params).fetchall()
        return {
            "evaluations": [
                {
                    "id": r[0],
                    "hr_id": r[1],
                    "application_id": r[2],
                    "applicant_id": r[3],
                    "job_id": r[4],
                    "mode": r[5],
                    "recommendation": r[6],
                    "confidence": r[7],
                    "notes": r[8],
                    "evidence": json.loads(r[9]) if r[9] else None,
                    "revealed_before_eval": bool(r[10]),
                    "created_at": r[11],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


# ------------------------------------------------------------------
# Candidate Face-Off (comparison sessions)
# ------------------------------------------------------------------
@router.post("/comparisons")
def save_comparison(data: ComparisonRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the comparison is always stored for the authenticated HR.
    data.hr_id = current_hr_id(sess)
    if not (2 <= len(data.application_ids) <= 3):
        raise HTTPException(
            status_code=400, detail="Select between 2 and 3 candidates to compare."
        )
    conn = get_conn()
    try:
        cur = conn.cursor()
        pool = _load_pool(cur, data.hr_id)
        selected = {
            c["application_id"]: c
            for c in pool
            if c["application_id"] in data.application_ids
        }
        if len(selected) != len(data.application_ids):
            raise HTTPException(
                status_code=404,
                detail="One or more candidates were not found for this HR account.",
            )
        # Server-side dimension snapshot so the session stays auditable later.
        dims: Dict[str, Dict[str, Any]] = {}
        for app_id, c in selected.items():
            dims[str(app_id)] = {
                "full_name": c["full_name"],
                "fit_score": c["fit"]["score"],
                "matched_skills": c["fit"]["matched_skills"],
                "missing_skills": c["fit"]["missing_skills"],
                "skill_evidence": {
                    e["skill"]: e["value"] for e in c["quno_evidence"]
                },
                "assessment_completed": c["assessment"]["completed"],
                "assessment_avg": c["assessment"]["avg_score"],
                "interview_score": c["interview_score"],
                "experience_years": c["experience_years"],
            }
        conn.execute(
            """INSERT INTO ta_comparisons
                   (hr_id, job_id, application_ids, decision, tradeoffs_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                data.hr_id,
                data.job_id,
                json.dumps(data.application_ids),
                data.decision,
                json.dumps({"dimensions": dims, "notes": data.tradeoffs}),
                _now(),
            ),
        )
        return {"success": True, "dimensions": dims}
    finally:
        conn.close()


@router.get("/comparisons/{hr_id}")
def list_comparisons(hr_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own comparisons.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM ta_comparisons WHERE hr_id = ? ORDER BY created_at DESC",
            (hr_id,),
        ).fetchall()
        return {
            "comparisons": [
                {
                    "id": r[0],
                    "job_id": r[2],
                    "application_ids": json.loads(r[3]),
                    "decision": r[4],
                    "tradeoffs": json.loads(r[5]) if r[5] else None,
                    "created_at": r[6],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


# ------------------------------------------------------------------
# Build Your Team — coverage engine + persistence
# ------------------------------------------------------------------
TEAM_ROLE_PRESETS: Dict[str, List[str]] = {
    "Product Manager": ["Communication", "Decision Making", "Analytical Thinking", "Leadership"],
    "Designer": ["Creativity", "UI/UX", "Communication", "Problem Solving"],
    "Developer": ["Python", "Problem Solving", "Analytical Thinking", "SQL"],
    "Backend Developer": ["Python", "Problem Solving", "SQL", "Analytical Thinking"],
    "Frontend Developer": ["JavaScript", "React", "Problem Solving", "Attention to Detail"],
    "Data Analyst": ["SQL", "Data Analysis", "Analytical Thinking", "Statistics"],
    "Data Scientist": ["Python", "Machine Learning", "Statistics", "Analytical Thinking"],
    "QA Engineer": ["Test Automation", "Attention to Detail", "Problem Solving", "SQL"],
    "DevOps Engineer": ["Docker", "Linux", "CI/CD", "Problem Solving"],
}


def _candidate_capability(c: Dict[str, Any]) -> Dict[str, int]:
    """Union of declared skills (implicit 60) and Career Quest signals."""
    cap: Dict[str, int] = {}
    for s in c["skills"]:
        cap[s.lower()] = max(cap.get(s.lower(), 0), 60)
    for e in c["quno_evidence"]:
        key = e["skill"].lower()
        cap[key] = max(cap.get(key, 0), e["value"])
    return cap


def _compute_team_coverage(
    slots: List[TeamSlot], pool: List[Dict[str, Any]]
) -> Dict[str, Any]:
    by_app = {c["application_id"]: c for c in pool}
    required_all: List[str] = []
    covered: set = set()
    filled, empty = 0, 0
    for slot in slots:
        if slot.application_id and slot.application_id in by_app:
            filled += 1
            cap = _candidate_capability(by_app[slot.application_id])
            for req in slot.required_skills:
                if req.lower() in cap:
                    covered.add(req.lower())
        else:
            empty += 1
        required_all.extend(slot.required_skills)
    unique_req = {r.lower() for r in required_all}
    missing_unique = sorted(unique_req - covered)
    coverage = (
        round(len(unique_req - set(missing_unique)) / len(unique_req) * 100)
        if unique_req
        else 0
    )
    balance = round(filled / len(slots) * 100) if slots else 0

    suggestions: List[Dict[str, Any]] = []
    if missing_unique:
        for c in pool:
            cap = _candidate_capability(c)
            hit = [m for m in missing_unique if m in cap]
            if hit:
                suggestions.append(
                    {
                        "application_id": c["application_id"],
                        "full_name": c["full_name"],
                        "job_title": c["job_title"],
                        "fills": hit,
                        "evidence": [
                            {"skill": e["skill"], "value": e["value"]}
                            for e in c["quno_evidence"]
                            if e["skill"].lower() in hit
                        ],
                    }
                )
        suggestions.sort(key=lambda s: -len(s["fills"]))
        suggestions = suggestions[:4]

    return {
        "coverage": coverage,
        "filled_slots": filled,
        "empty_slots": empty,
        "team_balance": balance,
        "missing_capabilities": missing_unique,
        "suggestions": suggestions,
    }


@router.post("/teams/preview")
def preview_team(data: TeamRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the preview is computed from the authenticated HR's pool.
    data.hr_id = current_hr_id(sess)
    """Compute coverage live without persisting."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        pool = _load_pool(cur, data.hr_id)
        return _compute_team_coverage(data.slots, pool)
    finally:
        conn.close()


@router.post("/teams")
def save_team(data: TeamRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the team is always stored for the authenticated HR.
    data.hr_id = current_hr_id(sess)
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Team name is required.")
    conn = get_conn()
    try:
        cur = conn.cursor()
        pool = _load_pool(cur, data.hr_id)
        result = _compute_team_coverage(data.slots, pool)
        cur.execute(
            """INSERT INTO ta_teams
                   (hr_id, name, slots_json, coverage, gaps_json, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                data.hr_id,
                data.name.strip(),
                json.dumps([s.model_dump() for s in data.slots]),
                result["coverage"],
                json.dumps(result["missing_capabilities"]),
                _now(),
                _now(),
            ),
        )
        return {"success": True, "team_id": cur.lastrowid, **result}
    finally:
        conn.close()


@router.get("/teams/{hr_id}")
def list_teams(hr_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own teams.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM ta_teams WHERE hr_id = ? ORDER BY updated_at DESC",
            (hr_id,),
        ).fetchall()
        return {
            "teams": [
                {
                    "id": r[0],
                    "name": r[2],
                    "slots": json.loads(r[3]),
                    "coverage": r[4],
                    "missing_capabilities": json.loads(r[5]) if r[5] else [],
                    "created_at": r[6],
                    "updated_at": r[7],
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.get("/team-roles", dependencies=[Depends(get_current_hr)])
def team_role_presets():
    """Role presets for the Build Your Team experience."""
    return {"roles": TEAM_ROLE_PRESETS}


# ------------------------------------------------------------------
# Hiring Quest — persisted stage progress + real next-best-actions
# ------------------------------------------------------------------
QUEST_STAGES = [
    "define-role", "discover", "evaluate", "challenge",
    "interview", "decide", "hire",
]


@router.post("/hiring-quest")
def save_quest_stage(data: HiringQuestRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the stage is always stored for the authenticated HR.
    data.hr_id = current_hr_id(sess)
    if data.stage not in QUEST_STAGES:
        raise HTTPException(status_code=400, detail="Unknown hiring stage.")
    conn = get_conn()
    try:
        cur = conn.cursor()
        if not _hr_exists(cur, data.hr_id):
            raise HTTPException(status_code=404, detail="HR account not found.")
        cur.execute(
            """INSERT INTO ta_hiring_quest (hr_id, job_id, stage, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(hr_id, job_id) DO UPDATE SET
                   stage = excluded.stage, updated_at = excluded.updated_at""",
            (data.hr_id, data.job_id, data.stage, _now()),
        )
        return {"success": True, "stage": data.stage}
    finally:
        conn.close()


@router.get("/hiring-quest/{hr_id}")
def hiring_quest(hr_id: int, job_id: Optional[int] = Query(default=None), sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own hiring quest.
    hr_id = require_hr_ownership(hr_id, sess)
    """Stage progress per job + next best actions computed from live data."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        if not _hr_exists(cur, hr_id):
            raise HTTPException(status_code=404, detail="HR account not found.")
        pool = _load_pool(cur, hr_id)
        jobs = _load_hr_jobs(cur, hr_id)
        if job_id is not None:
            pool = [c for c in pool if c["job_id"] == job_id]
            jobs = [j for j in jobs if j["id"] == job_id]

        stages_rows = conn.execute(
            "SELECT job_id, stage, updated_at FROM ta_hiring_quest WHERE hr_id = ?",
            (hr_id,),
        ).fetchall()
        stages = {r[0]: {"stage": r[1], "updated_at": r[2]} for r in stages_rows}
        evals = {
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT application_id FROM ta_evaluations WHERE hr_id = ?",
                (hr_id,),
            ).fetchall()
        }
        votes = {
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT application_id FROM ta_team_votes WHERE hr_id = ?",
                (hr_id,),
            ).fetchall()
        }
        challenges = {
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT application_id FROM ta_challenge_requests WHERE hr_id = ?",
                (hr_id,),
            ).fetchall()
        }

        result = []
        for job in jobs:
            cands = [c for c in pool if c["job_id"] == job["id"]]
            actions = []
            unassessed = [c for c in cands if c["assessment"]["completed"] == 0]
            if unassessed:
                actions.append(
                    {
                        "type": "send-assessment",
                        "priority": 1,
                        "message": f"{len(unassessed)} candidate(s) have no Career Quest evidence yet.",
                        "action": "Send Assessment",
                        "application_ids": [c["application_id"] for c in unassessed],
                    }
                )
            weak_skills: Dict[str, int] = {}
            for c in cands:
                for ps in c["fit"]["per_skill"]:
                    if not ps["signal"] and not ps["declared"]:
                        weak_skills[ps["skill"]] = weak_skills.get(ps["skill"], 0) + 1
            for skill, count in list(weak_skills.items())[:2]:
                actions.append(
                    {
                        "type": "collect-evidence",
                        "priority": 2,
                        "message": f"{count} candidate(s) need additional evidence in {skill}.",
                        "action": "Send Challenge",
                        "skill": skill,
                    }
                )
            unevaluated = [c for c in cands if c["application_id"] not in evals]
            if unevaluated:
                actions.append(
                    {
                        "type": "evaluate",
                        "priority": 3,
                        "message": f"{len(unevaluated)} candidate(s) have not been evaluated yet.",
                        "action": "Evaluate Candidates",
                    }
                )
            if evals and not votes:
                actions.append(
                    {
                        "type": "team-consensus",
                        "priority": 4,
                        "message": "Evaluations exist but no team votes have been collected.",
                        "action": "Request Team Vote",
                    }
                )
            pending_interviews = [c for c in cands if c["interview_score"] is None]
            if pending_interviews and stages.get(job["id"], {}).get("stage") in ("interview", "decide"):
                actions.append(
                    {
                        "type": "interview",
                        "priority": 5,
                        "message": f"{len(pending_interviews)} candidate(s) have no interview report yet.",
                        "action": "Review Interviews",
                    }
                )
            actions.sort(key=lambda a: a["priority"])
            result.append(
                {
                    "job_id": job["id"],
                    "job_title": job["job_title"],
                    "required_skills": job["required_skills"],
                    "candidate_count": len(cands),
                    "stage": stages.get(job["id"], {}).get("stage", "define-role"),
                    "stage_updated_at": stages.get(job["id"], {}).get("updated_at"),
                    "next_best_actions": actions,
                    "stats": {
                        "evaluated": sum(1 for c in cands if c["application_id"] in evals),
                        "assessed": sum(1 for c in cands if c["assessment"]["completed"] > 0),
                        "challenged": sum(1 for c in cands if c["application_id"] in challenges),
                        "interviewed": sum(1 for c in cands if c["interview_score"] is not None),
                    },
                }
            )
        return {"jobs": result, "stages": QUEST_STAGES}
    finally:
        conn.close()


# ------------------------------------------------------------------
# Team Vote — individual evaluations + consensus aggregation
# ------------------------------------------------------------------
@router.post("/votes")
def save_team_vote(data: TeamVoteRequest, sess: dict = Depends(get_current_hr)):
    # Authorization: the vote is always recorded for the authenticated HR.
    data.hr_id = current_hr_id(sess)
    if data.recommendation not in (
        "Move Forward", "Hold", "Reject", "Need More Evidence",
    ):
        raise HTTPException(status_code=400, detail="Invalid recommendation value.")
    if not data.evaluator_name.strip():
        raise HTTPException(status_code=400, detail="Evaluator name is required.")
    conn = get_conn()
    try:
        conn.execute(
            """INSERT INTO ta_team_votes
                   (hr_id, application_id, job_id, evaluator_name, recommendation,
                    confidence, strengths, concerns, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.hr_id,
                data.application_id,
                data.job_id,
                data.evaluator_name.strip(),
                data.recommendation,
                data.confidence,
                data.strengths,
                data.concerns,
                _now(),
            ),
        )
        return {"success": True}
    finally:
        conn.close()


def _aggregate_votes(votes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Consensus, agreement and mixed-opinion signals from real votes."""
    total = len(votes)
    forward = sum(1 for v in votes if v["recommendation"] == "Move Forward")
    recommendations: Dict[str, int] = {}
    for v in votes:
        recommendations[v["recommendation"]] = recommendations.get(v["recommendation"], 0) + 1

    STOP = {"and", "the", "with", "for", "good", "very", "strong", "skills", "skill", "experience"}

    def _tokens(field: str) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for v in votes:
            text = (v.get(field) or "").lower()
            for word in re.findall(r"[a-z][a-z+-]{2,}", text):
                if word in STOP:
                    continue
                counts[word] = counts.get(word, 0) + 1
        return counts

    agreement = [
        {"topic": w, "mentions": n}
        for w, n in sorted(_tokens("strengths").items(), key=lambda kv: -kv[1])[:3]
        if n >= 2
    ]
    differences = [
        {"topic": w, "mentions": n}
        for w, n in sorted(_tokens("concerns").items(), key=lambda kv: -kv[1])[:3]
        if n >= 2
    ]

    suggestion = None
    if differences:
        suggestion = (
            f"Collect additional evidence on '{differences[0]['topic']}' before "
            "making the final decision — the team has mixed opinions there."
        )
    elif total and forward == total:
        suggestion = "The team is fully aligned. Proceed to the interview/decision stage."
    elif total:
        suggestion = "The team has not reached full alignment. Discuss the differing recommendations."

    return {
        "total_votes": total,
        "forward_votes": forward,
        "consensus": f"{forward} / {total} recommend moving forward." if total else "No votes yet.",
        "recommendations": recommendations,
        "agreement_on": agreement,
        "mixed_on": differences,
        "quno_suggestion": suggestion,
    }


@router.get("/votes/{hr_id}")
def list_votes(hr_id: int, application_id: Optional[int] = Query(default=None), sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own vote board.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    try:
        sql = "SELECT * FROM ta_team_votes WHERE hr_id = ?"
        params: List[Any] = [hr_id]
        if application_id is not None:
            sql += " AND application_id = ?"
            params.append(application_id)
        rows = conn.execute(sql + " ORDER BY created_at DESC", params).fetchall()
        votes = [
            {
                "id": r[0],
                "application_id": r[2],
                "job_id": r[3],
                "evaluator_name": r[4],
                "recommendation": r[5],
                "confidence": r[6],
                "strengths": r[7],
                "concerns": r[8],
                "created_at": r[9],
            }
            for r in rows
        ]
        return {"votes": votes, "consensus": _aggregate_votes(votes)}
    finally:
        conn.close()


# ------------------------------------------------------------------
# Candidate Challenges — HR sends, candidate completes, HR sees result
# ------------------------------------------------------------------
@router.post("/challenge-requests")
def send_challenge(data: ChallengeRequestModel, sess: dict = Depends(get_current_hr)):
    # Authorization: the challenge is always sent on behalf of the
    # authenticated HR (the applicant is validated against their pool below).
    data.hr_id = current_hr_id(sess)
    conn = get_conn()
    try:
        cur = conn.cursor()
        if not cur.execute(
            "SELECT 1 FROM career_quest_challenges WHERE id = ? AND active = 1",
            (data.challenge_id,),
        ).fetchone():
            raise HTTPException(status_code=404, detail="Challenge not found in the Career Quest catalog.")
        if not cur.execute(
            """SELECT 1 FROM applications a JOIN hr_job_posts j ON j.id = a.job_id
                WHERE a.id = ? AND j.hr_id = ?""",
            (data.application_id, data.hr_id),
        ).fetchone():
            raise HTTPException(status_code=404, detail="Candidate application not found for this HR account.")
        cur.execute(
            """INSERT INTO ta_challenge_requests
                   (hr_id, application_id, applicant_id, challenge_id, skill,
                    role_bar, status, created_at)
               VALUES (?, ?, ?, ?, ?, ?, 'sent', ?)""",
            (
                data.hr_id,
                data.application_id,
                data.applicant_id,
                data.challenge_id,
                data.skill,
                max(0, min(100, data.role_bar)),
                _now(),
            ),
        )
        return {"success": True, "request_id": cur.lastrowid}
    finally:
        conn.close()


def _challenge_result(cur, req) -> Optional[Dict[str, Any]]:
    """Match a completed Career Quest attempt to this request (existing workflow)."""
    row = cur.execute(
        """SELECT id, score, completed_at, submitted_at, correct_count, total_count
             FROM career_quest_attempts
            WHERE applicant_id = ? AND challenge_id = ? AND status = 'completed'
              AND submitted_at >= ?
            ORDER BY submitted_at DESC LIMIT 1""",
        (req["applicant_id"], req["challenge_id"], req["created_at"]),
    ).fetchone()
    if not row:
        return None
    signals = cur.execute(
        """SELECT skill, signal_value FROM career_quest_skill_signals
            WHERE applicant_id = ? AND (skill = ? OR source LIKE '%' || ? || '%')
            ORDER BY signal_value DESC LIMIT 6""",
        (req["applicant_id"], req["skill"], req["challenge_id"]),
    ).fetchall()
    return {
        "attempt_id": row[0],
        "score": row[1],
        "completed_at": row[2] or row[3],
        "correct_count": row[4],
        "total_count": row[5],
        "skill_signals": [{"skill": s[0], "value": s[1]} for s in signals],
    }


@router.get("/challenge-requests/{hr_id}")
def list_challenge_requests(hr_id: int, sess: dict = Depends(get_current_hr)):
    # Authorization: an HR may only read their own challenge requests.
    hr_id = require_hr_ownership(hr_id, sess)
    conn = get_conn()
    try:
        cur = conn.cursor()
        rows = cur.execute(
            "SELECT * FROM ta_challenge_requests WHERE hr_id = ? ORDER BY created_at DESC",
            (hr_id,),
        ).fetchall()
        out = []
        for r in rows:
            result = _challenge_result(cur, r)
            if result and r["status"] != "completed":
                cur.execute(
                    "UPDATE ta_challenge_requests SET status = 'completed', completed_at = ? WHERE id = ?",
                    (result["completed_at"], r[0]),
                )
            out.append(
                {
                    "id": r[0],
                    "application_id": r[2],
                    "applicant_id": r[3],
                    "challenge_id": r[4],
                    "skill": r[5],
                    "role_bar": r[6],
                    "status": "completed" if result else r["status"],
                    "created_at": r[8],
                    "result": result,
                    "verdict": (
                        {
                            "candidate": result["score"],
                            "role_requirement": r[6],
                            "meets_bar": (result["score"] or 0) >= r[6],
                            "evidence_confidence": (
                                "High"
                                if result["total_count"]
                                and (result["correct_count"] or 0) / result["total_count"] >= 0.7
                                else "Moderate"
                            ),
                        }
                        if result
                        else None
                    ),
                }
            )
        conn.commit()
        return {"requests": out}
    finally:
        conn.close()


@router.get("/my-challenges")
def my_challenges(sess: dict = Depends(get_current_applicant)):
    # Authorization: challenges are always resolved for the authenticated
    # applicant, never for a client-supplied id.
    applicant_id = current_applicant_id(sess)
    """Applicant side: challenges requested by HR, surfaced in Career Quest."""
    conn = get_conn()
    try:
        cur = conn.cursor()
        rows = cur.execute(
            """SELECT r.id, r.challenge_id, r.skill, r.role_bar, r.created_at,
                      c.title, c.description, c.difficulty, c.estimated_time,
                      (SELECT COUNT(*) FROM career_quest_attempts a
                        WHERE a.applicant_id = r.applicant_id
                          AND a.challenge_id = r.challenge_id
                          AND a.status = 'completed'
                          AND a.submitted_at >= r.created_at) AS done
                 FROM ta_challenge_requests r
                 JOIN career_quest_challenges c ON c.id = r.challenge_id
                WHERE r.applicant_id = ?
                ORDER BY r.created_at DESC""",
            (applicant_id,),
        ).fetchall()
        return {
            "requests": [
                {
                    "id": r[0],
                    "challenge_id": r[1],
                    "skill": r[2],
                    "role_bar": r[3],
                    "requested_at": r[4],
                    "title": r[5],
                    "description": r[6],
                    "difficulty": r[7],
                    "estimated_time": r[8],
                    "completed": bool(r[9]),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()
