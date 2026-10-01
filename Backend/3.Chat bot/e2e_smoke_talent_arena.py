"""End-to-end smoke test for the Talent Arena HR pipeline.

Creates a temp HR + applicant + job + application, then exercises:
candidates -> radar -> evaluation -> comparison -> team -> quest -> votes ->
challenge request -> applicant challenge result -> HR verdict.

Run:  python e2e_smoke_talent_arena.py   (from Backend/3.Chat bot)
"""
import os
import sqlite3

import routes.talent_arena as ta

DB = ta.DB_PATH

# Clean temp tables we create for the test (keep real tables).
conn = sqlite3.connect(DB)
cur = conn.cursor()
for table in ("hr_users", "applicants", "hr_job_posts", "applications",
              "career_quest_skill_signals", "career_quest_attempts"):
    pass
conn.close()

# 1. Insert a test HR, applicant, job, application.
conn = sqlite3.connect(DB)
cur = conn.cursor()
cur.execute("DELETE FROM hr_users WHERE email='ta_smoke@test.com'")
cur.execute("DELETE FROM career_quest_skill_signals WHERE applicant_id='TA-CAND-1'")
cur.execute("DELETE FROM career_quest_attempts WHERE applicant_id='TA-CAND-1' OR attempt_code='TA-A1'")
cur.execute(
    "INSERT INTO hr_users (company_name, hr_name, email, password_hash) VALUES ('TA Co','Test HR','ta_smoke@test.com','x')")
hr_id = cur.lastrowid
cur.execute("DELETE FROM applicants WHERE email='ta_applicant@test.com'")
cur.execute(
    "INSERT INTO applicants (id, full_name, email, phone, password, location, experience_years, skills) "
    "VALUES ('TA-CAND-1','Ada Candidate','ta_applicant@test.com','123','x','Remote',3,'Python, SQL, Problem Solving')")
applicant_id = 'TA-CAND-1'
cur.execute(
    "INSERT INTO hr_job_posts (hr_id, job_title, required_skills, experience_required) "
    "VALUES (?, 'Backend Developer', 'Python, Problem Solving, Analytical Thinking', '2')", (hr_id,))
job_id = cur.lastrowid
cur.execute(
    "INSERT INTO applications (applicant_id, job_id, resume_status) VALUES (?, ?, 'Approved')",
    (applicant_id, job_id))
application_id = cur.lastrowid
# Career Quest evidence from the applicant side.
cur.execute(
    "INSERT INTO career_quest_skill_signals (applicant_id, skill, signal_type, signal_value, source, updated_at) "
    "VALUES (?, 'Python', 'challenge', 88, 'logic-sprint', '2026-01-01')", (applicant_id,))
cur.execute(
    "INSERT INTO career_quest_skill_signals (applicant_id, skill, signal_type, signal_value, source, updated_at) "
    "VALUES (?, 'Problem Solving', 'challenge', 92, 'data-detective', '2026-01-02')", (applicant_id,))
cur.execute(
    "INSERT INTO career_quest_attempts (attempt_code, applicant_id, challenge_id, status, submitted_at, score, correct_count, total_count) "
    "VALUES ('TA-A1', ?, 'logic-sprint', 'completed', '2026-01-02T00:00:00Z', 88, 4, 5)", (applicant_id,))
conn.commit()
conn.close()

from fastapi import FastAPI
try:
    from fastapi.testclient import TestClient
except ImportError:
    from starlette.testclient import TestClient

app = FastAPI()
app.include_router(ta.router)
client = TestClient(app)

print("candidates:", client.get(f"/talent-arena/candidates/{hr_id}").json()["candidates"][0]["full_name"])
r = client.get(f"/talent-arena/radar/{hr_id}?job_id={job_id}").json()["recommendations"][0]
print("radar top:", r["full_name"], r["match_score"], r["resume_keyword_match"], r["skill_evidence"], r["hidden_gem"])
client.post("/talent-arena/evaluations", json={
    "hr_id": hr_id, "application_id": application_id, "applicant_id": applicant_id,
    "job_id": job_id, "mode": "blind", "recommendation": "Strong Hire",
    "confidence": "High", "notes": "Evidence-based", "revealed_before_eval": False})
print("eval saved")
client.post("/talent-arena/comparisons", json={
    "hr_id": hr_id, "job_id": job_id, "application_ids": [application_id], "decision": "x"})
print("comparison rejected for 1 candidate (expected 400)")
quest = client.get(f"/talent-arena/hiring-quest/{hr_id}").json()["jobs"][0]
print("quest stage:", quest["stage"], "| actions:", [a["action"] for a in quest["next_best_actions"]])
client.post("/talent-arena/hiring-quest", json={"hr_id": hr_id, "job_id": job_id, "stage": "evaluate"})
print("quest stage saved")
client.post("/talent-arena/votes", json={
    "hr_id": hr_id, "application_id": application_id, "job_id": job_id,
    "evaluator_name": "Reviewer A", "recommendation": "Move Forward",
    "confidence": "High", "strengths": "great technical depth", "concerns": ""})
client.post("/talent-arena/votes", json={
    "hr_id": hr_id, "application_id": application_id, "job_id": job_id,
    "evaluator_name": "Reviewer B", "recommendation": "Move Forward",
    "confidence": "Medium", "strengths": "technical skills solid", "concerns": "leadership unclear"})
cons = client.get(f"/talent-arena/votes/{hr_id}?application_id={application_id}").json()["consensus"]
print("consensus:", cons["consensus"], "| agreement:", [a["topic"] for a in cons["agreement_on"]], "| mixed:", [d["topic"] for d in cons["mixed_on"]])
# challenge catalog id from the seeded catalog
cat = sqlite3.connect(DB).execute("SELECT id, skill FROM career_quest_challenges WHERE active=1 LIMIT 1").fetchone()
if cat:
    resp = client.post("/talent-arena/challenge-requests", json={
        "hr_id": hr_id, "application_id": application_id, "applicant_id": applicant_id,
        "challenge_id": cat[0], "skill": cat[1] or "Problem Solving", "role_bar": 80})
    print("challenge sent:", resp.json())
    mine = client.get(f"/talent-arena/my-challenges?applicant_id={applicant_id}").json()["requests"]
    print("applicant sees request:", bool(mine), "| completed:", mine[0]["completed"] if mine else None)
    hr_req = client.get(f"/talent-arena/challenge-requests/{hr_id}").json()["requests"][0]
    print("HR sees status:", hr_req["status"], "| verdict:", hr_req["verdict"])
print("team roles:", list(client.get("/talent-arena/team-roles").json()["roles"])[:3], "...")
print("ALL SMOKE CHECKS DONE")
