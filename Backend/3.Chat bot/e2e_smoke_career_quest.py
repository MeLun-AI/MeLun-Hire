"""End-to-end smoke test for the Career Quest game pipeline.

Simulates: detail -> start attempt -> submit answers -> skill signals ->
persistence check, then a full-game pass for every seeded challenge.
Run:  python e2e_smoke_career_quest.py   (from Backend/3.Chat bot)
"""
import json
import sys

sys.path.insert(0, ".")
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

c = TestClient(app)
APPLICANT = "e2e-test-1"

# --- 1. Challenge detail (intro data) ---
ch = c.get("/career-quest/challenges/logic-sprint").json()
print("logic-sprint questions:", len(ch["questions"]))
print("first prompt:", ch["questions"][0]["prompt"][:40])

# --- 2. Start + submit Logic Sprint ---
answers = [
    {"task_index": i, "answer": ch["questions"][i].get("correct_index", 0), "time_ms": 8000 + i * 1000}
    for i in range(len(ch["questions"]))
]
st = c.post("/career-quest/attempts/start", json={"applicant_id": APPLICANT, "challenge_id": "logic-sprint"}).json()
print("attempt id:", st["id"])
res = c.post(
    f"/career-quest/attempts/{st['id']}/submit",
    json={
        "applicant_id": APPLICANT,
        "time_taken_seconds": 95,
        "answers": answers,
        "meta": {"per_question_ms": [8000, 9000, 10000, 11000, 12000, 13000]},
    },
).json()
print("score:", res["result"]["score"], "| correct:", res["result"]["correct_count"], "/", res["result"]["total_count"])
print("ai:", res["result"]["ai_evaluation"]["narrative"][:90])

# --- 3. Skill signals updated ---
sig = c.get("/career-quest/skill-signals", params={"applicant_id": APPLICANT}).json()
print("signals:", [(s["skill"], s["signal_value"]) for s in sig["signals"]])

# --- 4. Persistence ---
att = c.get(f"/career-quest/attempts/{st['id']}", params={"applicant_id": APPLICANT}).json()
print("persisted:", att["status"], "| score:", att["score"], "| answers saved:", len(att["answers"] or {}))

# --- 5. All other games: correct-answer full pass ---
catalog = c.get("/career-quest/challenges").json()
for pub in catalog:
    cid = pub["id"]
    if cid == "logic-sprint":
        continue
    det = c.get(f"/career-quest/challenges/{cid}").json()
    qs = det["questions"]
    ans = []
    for i, q in enumerate(qs):
        if q["type"] == "ranking":
            ans.append({"task_index": i, "answer": q.get("correct_order", []), "time_ms": 20000})
        elif q["type"] == "matching":
            ans.append({"task_index": i, "answer": {p["left"]: p["right"] for p in q.get("pairs", [])}, "time_ms": 20000})
        elif q["type"] == "rule_shift":
            ans.append({"task_index": i, "answer": [cs["bucket"] for cs in q.get("cases", [])], "time_ms": 20000})
        elif q["type"] == "open_text":
            ans.append({"task_index": i, "answer": "Elderly users find small buttons and complex menus confusing, so I propose a simple Large Text voice ordering mode with a weekly favourite-meals reminder; it is practical because it reuses existing driver-partner infrastructure and could be piloted cheaply. Risk: family caregiver subscription abuse, mitigated by opt-in confirmation and a trial limit.", "time_ms": 30000})
        else:
            ans.append({"task_index": i, "answer": q.get("correct_index", 0), "time_ms": 10000})
    st2 = c.post("/career-quest/attempts/start", json={"applicant_id": APPLICANT, "challenge_id": cid}).json()
    r2 = c.post(f"/career-quest/attempts/{st2['id']}/submit", json={"applicant_id": APPLICANT, "time_taken_seconds": 120, "answers": ans}).json()
    rr = r2.get("result", {})
    print(f"{cid:20s} score={rr.get('score')} correct={rr.get('correct_count')}/{rr.get('total_count')}")

sig2 = c.get("/career-quest/skill-signals", params={"applicant_id": APPLICANT}).json()
print("final skill profile:")
for s in sig2["skills"]:
    print("  -", s["skill"], "=", s["value"])
print("E2E_SMOKE_OK")
