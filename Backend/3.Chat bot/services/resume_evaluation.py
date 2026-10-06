"""
Resume evaluation engine for the HR Resume Reports page.

Evaluates an applicant's actual resume text against the *actual* job posting
behind an application, producing a multi-dimension, evidence-based match report.

Design goals
-----------
* NOT simple keyword counting. A single mention of a required skill is never
  treated as proof of proficiency — skills are classified into
  ``demonstrated`` / ``mentioned`` / ``implied`` / ``missing`` using
  context windows (projects, experience, responsibilities, action verbs,
  section type) plus confidence.
* The score is derived from several dimensions (skills evidence, required &
  preferred skill coverage, experience, responsibilities, education, domain
  fit). Missing a critical (required) requirement caps the final score so a
  candidate cannot get a high score by matching secondary keywords.
* Every explanation in the report comes from the actual resume text / job
  posting. No mock data, no fabricated evidence.
* DeepSeek / LLM usage (if an API key is configured) is a *single* structured
  call per job+resume, cached on the ``resume_reports`` row, and only to
  refine / re-phrase insights. If no key is configured everything still works
  from the deterministic engine.
"""

import hashlib
import json
import os
import re
import sqlite3
from datetime import datetime

from config.paths import RESUME_DIR

# ---------------------------------------------------------------------------
# Lexicons
# ---------------------------------------------------------------------------

# Words that indicate an action/evidence (not a bare keyword list).
ACTION_MARKERS = re.compile(
    r"\b(develop(ed)?|build|built|implement(ed)?|deploy(ed)?|design(ed)?|"
    r"optimiz(ed)?|improv(ed)?|engineer(ed)?|creat(ed|ing)?|wrote|code[d]?|"
    r"construct(ed)?|architect(ed)?|train(ed)?|lead|led|own(ed|ing)?|"
    r"maintain(ed)?|automate[d]?|deliver(ed)?|ship(ed|ping)?|refactor(ed)?|"
    r"publish(ed)?|contribute[d]?|integrat(ed)?|compute[d]?|produce[d]?|"
    r"achieved|reduced|increas(ed)?|modell?[ei]d?|scal(ed|ing)?)\b",
    re.IGNORECASE,
)

# Markers that identify a section as the (weak-evidence) "skills list".
SKILLS_SECTION_MARKERS = re.compile(
    r"\b(skills?|technical skills?|technologies|programming languages|"
    r"tooling|toolbox|areas of expertise|core competencies|soft skills)\b",
    re.IGNORECASE,
)

# Markers that identify rich, evidence-based context.
EVIDENCE_SECTION_MARKERS = re.compile(
    r"\b(projec|experience|experties|employer|employment|role|responsibilit|"
    r"intern|work(ed)?|company|achievement|accomplishment|build|develop"
    r"|\bproject\b)\b",
    re.IGNORECASE,
)

YEARS_RE = re.compile(r"(\d{1,2})\s*[-–]?\s*(\d{1,2})?\s*(?:\+)?\s*years?")
# Related / alias terms for a given required skill. Used to recognise a skill
# that appears through a genuinely related form (e.g. SQL <-> PostgreSQL), and
# to mark "implied/related" evidence rather than a false keyword hit.
RELATED_TERMS = {
    "python": ["python", "python3", "pandas", "numpy", "scikit-learn", "scikit learn", "flask", "django", "fastapi"],
    "sql": ["sql", "mysql", "postgresql", "postgres", "sqlite", "sql server", "tsql", "pl/sql", "oracle", "database"],
    "c++": ["c++", "cpp", ".net", "qt", "opencv", "boost"],
    "c": ["c", "c11"],
    "javascript": ["javascript", "ecmascript", "js", "typescript", "es6"],
    "typescript": ["typescript", "ts", "javascript"],
    "html": ["html", "html5", "jsx", "markup"],
    "css": ["css", "css3", "sass", "scss", "tailwind", "bootstrap", "styled-components"],
    "react": ["react", "react.js", "reactjs", "next.js", "nextjs", "hooks"],
    "node.js": ["node.js", "nodejs", "node"],
    "django": ["django", "django rest"],
    "flask": ["flask", "flask restful"],
    "machine learning": ["machine learning", "ml", "deep learning", "tensorflow", "pytorch", "keras", "scikit-learn", "scikit learn", "neural network", "regression", "classification", "random forest", "xgboost", "model training", "ml model"],
    "deep learning": ["deep learning", "deep neural", "cnn", "rnn", "lstm", "transformers", "tensorflow", "pytorch", "keras", "neural network"],
    "natural language processing": ["natural language processing", "nlp", "nltk", "spacy", "text classification", "sentiment", "tokenization", "embeddings", "llm"],
    "nlp": ["natural language processing", "nlp", "nltk", "spacy", "llm", "langchain", "text classification"],
    "computer vision": ["computer vision", "opencv", "object detection", "image classification", "yolo", "cnn", "image segmentation"],
    "data analysis": ["data analysis", "data analytics", "eda", "exploratory data analysis", "pandas", "sql", "statistics", "insights"],
    "data science": ["data science", "machine learning", "data analysis", "statistics", "predictive modeling", "eda"],
    "statistics": ["statistics", "statistical", "hypothesis", "anova", "p-value", "probability", "regression"],
    "docker": ["docker", "containerization", "containers", "dockerfile", "docker-compose", "docker compose"],
    "kubernetes": ["kubernetes", "k8s", "kubectl", "helm"],
    "aws": ["aws", "amazon web services", "s3", "ec2", "lambda", "sagemaker", "cloudfront"],
    "azure": ["azure", "microsoft azure", "azure function"],
    "gcp": ["gcp", "google cloud", "google cloud platform", "gke", "bigquery"],
    "git": ["git", "github", "gitlab", "version control"],
    "ci/cd": ["ci/cd", "ci cd", "jenkins", "github actions", "gitlab ci", "pipeline"],
    "mlops": ["mlops", "mlflow", "airflow", "model deployment", "monitoring"],
    "linux": ["linux", "unix", "bash", "shell"],
    "bash": ["bash", "shell scripting", "shell", "unix"],
    "rest api": ["rest api", "restful", "rest", "api design", "web api", "http"],
    "mongodb": ["mongodb", "mongo"],
    "postgresql": ["postgresql", "postgres", "sql"],
    "mysql": ["mysql", "sql"],
    "redis": ["redis", "cache"],
    "excel": ["excel", "spreadsheet", "vba"],
    "tableau": ["tableau", "data visualization"],
    "power bi": ["power bi", "powerbi", "dax"],
    "pyspark": ["pyspark", "apache spark", "spark"],
    "kafka": ["kafka", "streaming", "event"],
    "java": ["java", "spring", "spring boot"],
    "golang": ["golang", "go "],
    "r": ["r ", "rstudio", "ggplot"],
    "c#": ["c#", "csharp", ".net"],
    "scikit-learn": ["scikit-learn", "scikit learn", "sklearn"],
    "llm": ["llm", "large language model", "gpt", "openai", "langchain", "prompt", "rag"],
    "langchain": ["langchain", "llm", "chain", "agent"],
    "fastapi": ["fastapi", "fast api"],
    "communication": ["communication", "presented", "presentation"],
    "leadership": ["leadership", "led", "lead", "managed", "mentored", "mentoring"],
    "teamwork": ["teamwork", "collaboration", "collaborated", "cross-functional"],
    "problem solving": ["problem solving", "problem-solving", "analytical", "debugging", "troubleshooting"],
    "agile": ["agile", "scrum", "sprint", "kanban"],
}

# Words that indicate a professional/production context for experience.
PROFESSIONAL_MARKERS = re.compile(
    r"\b(engineer|developer|scientist|analyst|full-?time|part-?time|"
    r"worked (?:as|at)|professional|corporate|production|industry|freelance)\b",
    re.IGNORECASE,
)
INTERN_SCHOOL_MARKERS = re.compile(
    r"\b(intern(?:ship)?|trainee|student|academic|course|thesis|project(?:s)?|"
    r"self-?taught|bootcamp|university|college)\b",
    re.IGNORECASE,
)

STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "your", "have",
    "has", "our", "all", "are", "you", "their", "them", "they", "was", "were",
    "will", "shall", "into", "onto", "over", "under", "about", "across",
}

# Domain keyword sets — judge whether the candidate's background actually fits
# the role's domain (not just whether a keyword appears).
DOMAIN_KEYWORDS = {
    "ml / data science": [
        "machine learning", "data science", "deep learning", "model", "pandas",
        "numpy", "tensorflow", "pytorch", "statistics", "regression",
        "classification", "data analysis", "eda", "dataset", "feature",
    ],
    "data science": [
        "data science", "machine learning", "python", "statistics", "sql",
        "pandas", "numpy", "data analysis", "eda", "visualization", "model",
        "regression", "classification",
    ],
    "machine learning": [
        "machine learning", "deep learning", "model", "tensorflow", "pytorch",
        "scikit", "regression", "classification", "neural", "feature", "dataset",
    ],
    "artificial intelligence": [
        "ai", "artificial intelligence", "machine learning", "deep learning",
        "nlp", "neural", "model", "computer vision", "agent",
    ],
    "nlp / ai": [
        "nlp", "natural language", "ai", "llm", "langchain", "model",
        "text", "token", "chatbot", "sentiment", "transformer",
    ],
    "web development": [
        "web", "frontend", "backend", "react", "html", "css", "javascript",
        "node", "api", "database", "responsive", "web app",
    ],
    "backend": [
        "backend", "api", "database", "server", "sql", "node", "go", "java",
        "microservice", "rest", "architecture",
    ],
    "devops / cloud": [
        "devops", "cloud", "docker", "kubernetes", "ci/cd", "aws", "azure",
        "terraform", "linux", "pipeline", "deployment",
    ],
    "qa / testing": [
        "qa", "testing", "test", "selenium", "automation", "test cases",
        "quality", "manual testing",
    ],
}


def norm(value) -> str:
    """Lowercase, trimmed string for comparison."""
    return str(value or "").strip().lower()


def split_list(value) -> list:
    """Split a stored text list into a clean array."""
    if not value:
        return []
    return [x.strip() for x in re.split(r"[,\n;]", str(value)) if x.strip()]


def norm_text(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _sentences(text: str) -> list:
    """Return non-empty cleaned lines/sentences."""
    raw = re.split(r"[\n.;]", text or "")
    return [s.strip() for s in raw if s.strip()]


def _load_analysis(applicant_id: str) -> dict:
    safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
    if not safe_id:
        return {}
    path = os.path.join(RESUME_DIR, safe_id, "analysis.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def load_resume_text(applicant_id: str) -> str:
    """Return the resume text for evaluation, preferring the stored extract."""
    record = _load_analysis(applicant_id)
    text = norm_text(record.get("resume_text"))
    if text:
        return text
    # Fallback: extract text from the stored file if the record lacks it.
    try:
        from services.resume_parser import extract_resume_text

        stored = record.get("stored_name")
        filename = record.get("filename") or stored
        if stored:
            safe_id = re.sub(r"[^A-Za-z0-9_-]", "", applicant_id or "")
            file_path = os.path.join(RESUME_DIR, safe_id, stored) if safe_id else ""
            if not safe_id:
                for root, _dirs, files in os.walk(RESUME_DIR):
                    if stored in files:
                        file_path = os.path.join(root, stored)
                        break
            if file_path and os.path.exists(file_path):
                with open(file_path, "rb") as f:
                    return norm_text(extract_resume_text(filename or stored, f.read()))
    except Exception:
        return ""
    return ""


def _source_hash(job: dict, resume_text: str, applicant: dict) -> str:
    payload = {
        "job": job,
        "resume": resume_text,
        "applicant": {
            "experience_years": applicant.get("experience_years"),
            "skills": applicant.get("skills"),
        },
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Skill evidence classification
# ---------------------------------------------------------------------------
def _line_sections(lines: list) -> dict:
    """Tag each line index as inside a 'skills' list or 'general' context."""
    tags = {}
    in_skills = False
    for i, line in enumerate(lines):
        if SKILLS_SECTION_MARKERS.search(line):
            in_skills = True
        elif EVIDENCE_SECTION_MARKERS.search(line) and len(line) <= 48:
            in_skills = False
        tags[i] = "skills" if in_skills else "general"
    return tags


def _window_kind(lines: list, idx: int) -> str:
    """Classify the evidence strength of the context around an occurrence."""
    lo = max(0, idx - 2)
    hi = min(len(lines), idx + 3)
    window = " ".join(lines[lo:hi])
    if ACTION_MARKERS.search(window):
        return "strong"
    for j in range(lo, hi):
        if j != idx and EVIDENCE_SECTION_MARKERS.search(lines[j]):
            return "evidence_context"
    return "plain"


def _word_boundary_regex(term: str) -> "re.Pattern":
    """A regex that matches a term at a word boundary (safe for +, #, /, .)."""
    escaped = re.escape(term)
    # Terms ending with punctuation (js, np., c++, c#, r ) need open-boundary only.
    trailing_punct = re.search(r"[\+\#\./]$", term)
    if trailing_punct:
        return re.compile(r"(?<![a-z0-9])" + escaped, re.IGNORECASE)
    return re.compile(r"(?<![a-z0-9])" + escaped + r"(?![a-z0-9])", re.IGNORECASE)


def _classify_skill_evidence(skill: str, lines: list, resume_lower: str) -> dict:
    """Classify a single skill's evidence in the resume."""
    name = _display_skill(skill)
    aliases = list(RELATED_TERMS.get(norm(skill), []))
    if not aliases:
        aliases = [norm(skill)]
    aliases = list(dict.fromkeys([norm(skill)] + aliases))  # primary first

    sections = _line_sections(lines)
    best = None       # best (kind, line_text, source)
    core_found = False
    any_found = False

    for alias in aliases:
        rx = _word_boundary_regex(alias)
        for i, line in enumerate(lines):
            if not rx.search(line):
                continue
            any_found = True
            if alias == norm(skill):
                core_found = True
            kind = _window_kind(lines, i)
            source = "skills section" if sections.get(i) == "skills" else "project/experience"
            score = 3 if kind == "strong" else (2 if kind == "evidence_context" else 1)
            if best is None or score > best[0]:
                best = (score, kind, line.strip(), source)
    if best is None:
        return {
            "skill": name,
            "status": "missing",
            "evidence": "no evidence found in resume",
            "context": "",
            "confidence": "none",
        }

    score, kind, line, source = best
    if kind in ("strong", "evidence_context") and any_found:
        status = "demonstrated"
        confidence = "high" if kind == "strong" else "medium"
    elif core_found:
        status = "mentioned"
        confidence = "low"
    elif any_found:
        status = "implied"
        confidence = "low"
    else:
        status = "missing"
        confidence = "none"

    return {
        "skill": name,
        "status": status,
        "evidence": _clip(line) or "mentioned in resume",
        "source": source,
        "confidence": confidence,
    }


def _section_kind(sections: dict, i: int, _unused) -> str:
    # Kept as a thin wrapper so _classify_skill_evidence stays readable.
    return sections.get(i, "general")


def _clip(line: str, limit: int = 220) -> str:
    line = re.sub(r"^\s*[-•▪◦*]\s*", "", norm_text(line))
    return line if len(line) <= limit else line[: limit - 1].rstrip() + "…"


def _display_skill(name: str) -> str:
    """Prettify a skill name (SQL, C++, API, ...) instead of naive .title()."""
    n = norm(name)
    return {
        "sql": "SQL", "c++": "C++", "c#": "C#", "html": "HTML", "css": "CSS",
        "aws": "AWS", "azure": "Azure", "gcp": "GCP", "api": "API", "nlp": "NLP",
        "llm": "LLM", "ml": "ML", "ci/cd": "CI/CD", "mlops": "MLOps",
        "rest api": "REST API", "power bi": "Power BI", "ai": "AI",
        "react.js": "React", "node.js": "Node.js", "go": "Go", "r": "R",
        "jwt": "JWT", "grafana": "Grafana",
    }.get(n, name.title())


# ---------------------------------------------------------------------------
# Dimension evaluators
# ---------------------------------------------------------------------------
def _evaluate_skills(skill_terms: list, resume_text: str) -> dict:
    """Evaluate a list of skills against the resume, returning evidence entries."""
    lines = _sentences(resume_text)
    entries = [_classify_skill_evidence(s, lines, resume_text.lower()) for s in skill_terms or []]
    scores = {"demonstrated": 1.0, "implied": 0.6, "mentioned": 0.35, "missing": 0.0}
    if entries:
        avg = sum(scores.get(e["status"], 0) for e in entries) / len(entries)
        dim_score = int(round(avg * 100))
    else:
        dim_score = None
    return {"entries": entries, "score": dim_score}


def _parse_required_years(exp_value) -> int:
    """Parse a job's required experience like '3-5 years', '5+ years', '0-1'."""
    try:
        text = str(exp_value or "").lower()
        m = re.search(r"(\d{1,2})\s*[-–]\s*(\d{1,2})\s*years?", text)
        if m:
            return int(m.group(1))
        m = re.search(r"(\d{1,2})\s*\+?\s*years?", text)
        if m:
            return int(m.group(1))
        m = re.search(r"\b(\d{1,2})\b\s*years?", text)
        if m:
            return int(m.group(1))
        if re.search(r"fresher|entry|0[-–]?\s*1|no professional", text):
            return 0
    except Exception:
        pass
    return 0


def _candidate_years(applicant: dict, resume_text: str):
    """Candidate's years of experience (profile value, else parsed from resume)."""
    try:
        val = applicant.get("experience_years")
        if val is not None and str(val).strip() and int(val) > 0:
            return int(val)
    except Exception:
        pass
    matches = YEARS_RE.findall(resume_text or "")
    nums = []
    for m in matches:
        try:
            nums.append(int(m[0]))
        except Exception:
            pass
    return max(nums) if nums else None


def _evaluate_experience(job: dict, applicant: dict, resume_text: str) -> dict:
    required_raw = job.get("experience_required")
    required = _parse_required_years(required_raw)
    candidate = _candidate_years(applicant, resume_text)
    lower = (resume_text or "").lower()

    pro_hits = len(PROFESSIONAL_MARKERS.findall(lower))
    school_hits = len(INTERN_SCHOOL_MARKERS.findall(lower))
    internship_dominated = school_hits > 0 and school_hits >= (pro_hits - 1)

    if not required_raw:
        score, rating = 100, "n/a"
        summary = "The job posting does not specify a required-experience threshold."
    elif candidate is None:
        score, rating = 30, "weak"
        summary = "The resume/applicant does not state years of experience for evaluation."
    else:
        ratio = candidate / required if required else 1.0
        score = int(round(min(100, ratio * 100)))
        if internship_dominated and required >= 2:
            score = max(20, score - 25)
        rating = "strong" if score >= 80 else ("moderate" if score >= 60 else ("weak" if score >= 40 else "poor"))
        context = ""
        if internship_dominated:
            context = " Evidence appears to be dominated by internships/projects rather than professional production experience."
        summary = (
            f"Job asks for {required_raw}; candidate has {candidate} "
            f"year{'' if candidate == 1 else 's'}.{context}"
        )
    return {
        "score": score,
        "rating": rating,
        "summary": summary,
        "required": required_raw or "Not specified",
        "candidate": candidate,
    }


def _find_line_with(rx, lines):
    for line in lines:
        if rx.search(line):
            return line
    return ""


def _evaluate_responsibilities(job: dict, resume_text: str) -> dict:
    """Check each job responsibility against demonstrated evidence in the resume."""
    lines = _sentences(resume_text)
    resume_lower = (resume_text or "").lower()
    responsibilities = job.get("responsibilities") or []
    out = []
    for r in responsibilities:
        words = [w for w in re.findall(r"[a-z]{4,}", r.lower()) if w not in STOPWORDS]
        present = False
        evidence = ""
        if words:
            for w in words:
                rx = _word_boundary_regex(w)
                if rx.search(resume_lower):
                    present = True
                    evidence = _clip(_find_line_with(rx, lines))
                    break
        out.append({"responsibility": r, "present": present, "evidence": evidence or ""})
    present_count = sum(1 for o in out if o["present"])
    total = len(out)
    score = int(round((present_count / total) * 100)) if total else 100
    return {"entries": out, "score": score}


def _evaluate_education(resume_text: str) -> dict:
    t = (resume_text or "").lower()
    levels = []
    if re.search(r"\b(ph\.?d|doctorate)\b", t):
        levels.append("Doctorate")
    if re.search(r"\bmaster|m\.?tech|m\.?s\.?|mba\b", t):
        levels.append("Masters")
    if re.search(r"\bbachelor|b\.?tech|b\.?s\.?|b\.?e\.?|bca\b", t):
        levels.append("Bachelors")
    highest = levels[0] if levels else "Not stated in resume"
    return {
        "required": "Not specified in the job posting",
        "candidate": highest,
        "rating": "neutral",
        "summary": ("The job posting does not set an education requirement. "
                    "Candidate education is shown for reference."),
    }


def _evaluate_domain(job_domain: str, resume_text: str) -> dict:
    key = norm(job_domain)
    keywords = DOMAIN_KEYWORDS.get(key) or []
    if not keywords:
        return {"summary": "Domain not mapped for automated evaluation.", "rating": "neutral", "score": 100}
    lower = (resume_text or "").lower()
    hits = sum(1 for k in keywords if k and k in lower)
    denom = max(1, min(len(keywords), 8))
    score = int(round((hits / denom) * 100))
    if score >= 55:
        rating, summary = "strong", f"Candidate shows solid evidence aligned with {job_domain}."
    elif score >= 28:
        rating, summary = "moderate", f"Candidate has partial alignment with the {job_domain} domain."
    elif score >= 12:
        rating, summary = "weak", f"Candidate background shows limited alignment with {job_domain}."
    else:
        rating, summary = "mismatch", f"Candidate profile appears focused on a different domain than {job_domain}."
    return {"score": score, "rating": rating, "summary": summary}


def _recommendation(score: int) -> str:
    if score >= 80:
        return "Strong Match"
    if score >= 65:
        return "Good Match"
    if score >= 50:
        return "Moderate Match"
    if score >= 35:
        return "Weak Match"
    return "Not Recommended"


def build_report(job: dict, resume_text: str, applicant: dict) -> dict:
    """Produce the complete evidence-based resume evaluation report."""
    req = _evaluate_skills(job.get("required_skills") or [], resume_text)
    pref = _evaluate_skills(job.get("preferred_skills") or [], resume_text)
    exp = _evaluate_experience(job, applicant, resume_text)
    resp = _evaluate_responsibilities(job, resume_text)
    edu = _evaluate_education(resume_text)
    dom = _evaluate_domain(job.get("job_domain", ""), resume_text)

    req_entries = req["entries"]
    missing = [e for e in req_entries if e["status"] == "missing"]
    mentioned = [e for e in req_entries if e["status"] == "mentioned"]
    implied = [e for e in req_entries if e["status"] == "implied"]
    demonstrated = [e for e in req_entries if e["status"] == "demonstrated"]

    # ---- multi-dimension scoring (renormalised when a dimension has no data)
    dims = {
        "required": req["score"],
        "experience": exp["score"],
        "responsibilities": resp["score"],
        "domain": dom["score"],
        "preferred": pref["score"],
        "education": 100,  # neutral: job posting sets no education requirement
    }
    base_weights = {
        "required": 0.40,
        "experience": 0.20,
        "responsibilities": 0.15,
        "domain": 0.12,
        "preferred": 0.10,
        "education": 0.03,
    }
    active = {k: w for k, w in base_weights.items() if dims[k] is not None}
    total_w = sum(active.values()) or 1.0
    score = int(round(sum(dims[k] * (w / total_w) for k, w in active.items())))

    # ---- Critical-requirement cap: missing a required skill must tank the score
    cap = 100
    if missing:
        cap = min(cap, 55)
    elif mentioned:
        cap = min(cap, 72)
    elif implied:
        cap = min(cap, 80)
    score = min(score, cap)

    # ---- Strengths (evidence-based, never "has X because X appears")
    strengths = []
    for e in demonstrated:
        if e["confidence"] in ("high", "medium"):
            strengths.append(f"{e['skill']} demonstrated — {e['evidence']}")
    if not strengths:
        strengths.append("No strongly demonstrated required skills in the resume.")

    # ---- Gaps
    gaps = []
    if not (resume_text or "").strip():
        gaps.insert(0, "No resume text available for evidence evaluation — only applicant profile fields could be checked.")
    for e in missing:
        gaps.append(f"Missing required skill: {e['skill']} — no evidence found.")
    for e in mentioned:
        gaps.append(f"{e['skill']} is only mentioned — limited evidence of proficiency.")
    for e in implied:
        gaps.append(f"{e['skill']} is only implied via related technologies.")
    if exp["rating"] in ("weak", "poor"):
        gaps.append(f"Experience: {exp['summary']}")
    if dom["rating"] in ("weak", "mismatch"):
        gaps.append(dom["summary"])
    not_present = [o for o in resp["entries"] if not o["present"]]
    if not_present:
        gaps.append(f"Responsibilities not evidenced: {', '.join(o['responsibility'] for o in not_present[:3])}.")

    # ---- Reasons behind the recommendation
    reasons = []
    reasons.append(f"Overall evidence score is {score} / 100 across skills, experience, responsibilities, domain fit.")
    if demonstrated:
        reasons.append(f"{len(demonstrated)} required skill(s) are demonstrated in the resume.")
    if missing:
        reasons.append(f"{len(missing)} required skill(s) have no evidence ({', '.join(e['skill'] for e in missing)}).")
    if exp["rating"] in ("n/a", "strong"):
        pass
    elif exp["rating"] in ("weak", "poor"):
        reasons.append("Experience falls short of the job requirement.")
    if dom["rating"] in ("weak", "mismatch"):
        reasons.append("The candidate's background is modestly aligned with the job domain.")
    if not reasons:
        reasons.append("Evaluation completed based on the available job requirements and resume.")

    # ---- Role fit (broad role-level alignment combining skills + domain)
    role_fit_rating = "strong" if len(demonstrated) >= 3 and dom["rating"] in ("strong", "moderate") else (
        "moderate" if demonstrated else "weak"
    )
    role_fit_summary = (
        f"Resume demonstrates {len(demonstrated)} of {len(req_entries)} required skills "
        f"with {'solid' if dom['rating'] == 'strong' else 'partial'} alignment to the {job.get('job_domain')} domain."
    ) if req_entries else f"Role fit based on {job.get('job_domain', 'the role')} domain evidence."

    return {
        "match_score": score,
        "recommendation": _recommendation(score),
        "recommendation_reasons": reasons,
        "role_fit": {"rating": role_fit_rating, "summary": role_fit_summary},
        "required_skills": req_entries,
        "preferred_skills": pref["entries"],
        "experience_fit": exp,
        "responsibilities_fit": resp["entries"],
        "education_fit": edu,
        "domain_fit": dom,
        "strengths": strengths,
        "gaps": gaps,
        "job_snapshot": {
            "job_title": job.get("job_title"),
            "job_domain": job.get("job_domain"),
            "experience_required": job.get("experience_required"),
            "description": job.get("description"),
            "required_skills": job.get("required_skills") or [],
            "preferred_skills": job.get("preferred_skills") or [],
            "responsibilities": job.get("responsibilities") or [],
        },
        "candidate": {
            "full_name": applicant.get("full_name"),
            "experience_years": applicant.get("experience_years"),
            "profile_skills": (applicant.get("skills") or ""),
        },
        "evidence_basis": "Deterministic evidence engine on actual resume + job data.",
    }


# ---------------------------------------------------------------------------
# Optional DeepSeek / LLM refinement (single structured call, cached)
# ---------------------------------------------------------------------------
def refine_with_llm(report: dict, job: dict, resume_text: str, applicant: dict) -> dict:
    """Optionally refine narrative insights with one structured LLM call.

    Only runs when an API key is configured. It never fabricates skill
    evidence (the deterministic skill classification is kept) — it improves the
    wording of strengths / gaps / reasons. Any failure returns the report
    unchanged, so the deterministic engine is always the source of truth.
    """
    try:
        from config.settings import settings

        if not settings.OPENAI_API_KEY:
            return report
        from ai_engine.llm_client import LLMClient

        client = LLMClient()
    except Exception:
        return report

    snapshot = {
        "job_title": job.get("job_title"),
        "job_domain": job.get("job_domain"),
        "experience_required": job.get("experience_required"),
        "description": (job.get("description") or "")[:400],
        "required_skills": job.get("required_skills") or [],
        "preferred_skills": job.get("preferred_skills") or [],
        "responsibilities": job.get("responsibilities") or [],
    }
    prompt = (
        "You are an expert technical recruiter. Evaluate the candidate resume "
        "against the job below and return STRICT JSON (no markdown) with keys:\n"
        "{'strengths': [string], 'gaps': [string], 'role_fit_summary': string, "
        "'experience_fit_summary': string, 'recommendation_reasons': [string]}\n"
        "Only use the provided resume text and job data. Never invent skills "
        "or claims. Keep each item concise and factual.\n\n"
        "JOB:\n" + json.dumps(snapshot, ensure_ascii=False) +
        "\n\nCANDIDATE:\n" + json.dumps({
            "full_name": applicant.get("full_name"),
            "experience_years": applicant.get("experience_years"),
            "profile_skills": (applicant.get("skills") or ""),
        }, ensure_ascii=False) +
        "\n\nRESUME TEXT:\n" + (resume_text or "")[:10000]
    )
    try:
        data = client.send_json_prompt(prompt, system_message="You output JSON only.")
    except Exception:
        return report

    try:
        out = dict(data or {})
        merged = json.loads(json.dumps(report))
        if isinstance(out.get("strengths"), list) and out["strengths"]:
            merged["strengths"] = [str(s) for s in out["strengths"]]
        if isinstance(out.get("gaps"), list) and out["gaps"]:
            merged["gaps"] = [str(s) for s in out["gaps"]]
        if isinstance(out.get("recommendation_reasons"), list) and out["recommendation_reasons"]:
            merged["recommendation_reasons"] = [str(s) for s in out["recommendation_reasons"]]
        if isinstance(out.get("role_fit_summary"), str) and out["role_fit_summary"].strip():
            merged["role_fit"]["summary"] = out["role_fit_summary"].strip()
        if isinstance(out.get("experience_fit_summary"), str) and out["experience_fit_summary"].strip():
            merged["experience_fit"]["summary"] = out["experience_fit_summary"].strip()
        merged["ai_refined"] = True
        return merged
    except Exception:
        return report


# ---------------------------------------------------------------------------
# Storage + caching
# ---------------------------------------------------------------------------
RESUME_PASS = 60


def ensure_resume_report_columns(db_path: str):
    conn = sqlite3.connect(db_path, timeout=30)
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(resume_reports)")
    cols = [c[1] for c in cur.fetchall()]
    for column, definition in {
        "evaluation_json": "TEXT",
        "source_hash": "TEXT",
        "last_evaluated_at": "TEXT",
    }.items():
        if column not in cols:
            cur.execute(f"ALTER TABLE resume_reports ADD COLUMN {column} {definition}")
    conn.commit()
    conn.close()


# One application -> its applicant, job posting and resume text. Used by both
# the cached HR report and the deterministic apply-time outcome so the two can
# never disagree about the inputs they evaluated.
_APPLICATION_CONTEXT_SQL = """
    SELECT
        a.id AS applicant_id,
        a.full_name,
        a.email,
        a.experience_years,
        a.skills,
        app.status,
        app.interview_status,
        app.job_id,
        j.job_title,
        j.job_domain,
        j.experience_required,
        j.description,
        j.required_skills,
        j.preferred_skills,
        j.responsibilities
    FROM applications app
    JOIN applicants a ON app.applicant_id = a.id
    JOIN hr_job_posts j ON app.job_id = j.id
    WHERE app.id = ?
"""


def _load_application_context(db_path: str, application_id: int):
    """Load the real job + applicant + resume text behind one application.

    Returns ``None`` when the application does not exist. The resume text is
    read from the applicant's already-uploaded resume (empty string when the
    applicant has none, exactly as the HR report treats it).
    """
    conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False, isolation_level=None)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    try:
        row = conn.execute(_APPLICATION_CONTEXT_SQL, (application_id,)).fetchone()
    finally:
        conn.close()

    if not row:
        return None

    applicant_id, full_name, email = row[0], row[1], row[2]
    job = {
        "job_title": row[8],
        "job_domain": row[9],
        "experience_required": row[10],
        "description": row[11],
        "required_skills": split_list(row[12]),
        "preferred_skills": split_list(row[13]),
        "responsibilities": split_list(row[14]),
    }
    applicant = {
        "full_name": full_name,
        "experience_years": row[3],
        "skills": row[4],
    }
    resume_text = load_resume_text(applicant_id)

    return {
        "applicant_id": applicant_id,
        "full_name": full_name,
        "email": email,
        "app_status": row[5],
        "interview_status": row[6],
        "job": job,
        "applicant": applicant,
        "resume_text": resume_text,
        "source_hash": _source_hash(job, resume_text, applicant),
    }


def get_or_build_evaluation(db_path: str, application_id: int) -> dict:
    """Return the full resume report for an application, computing and caching it."""
    ensure_resume_report_columns(db_path)

    def connect():
        conn = sqlite3.connect(db_path, timeout=30, check_same_thread=False, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA busy_timeout=30000;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        return conn

    ctx = _load_application_context(db_path, application_id)
    if not ctx:
        return {"error": "Resume report not found"}

    full_name = ctx["full_name"]
    email = ctx["email"]
    app_status = ctx["app_status"]
    interview_status = ctx["interview_status"]
    job = ctx["job"]
    applicant = ctx["applicant"]
    resume_text = ctx["resume_text"]
    source_hash = ctx["source_hash"]
    analysis = _load_analysis(ctx["applicant_id"])
    resume_filename = analysis.get("filename") or analysis.get("stored_name")

    conn = connect()
    cur = conn.cursor()
    cur.execute(
        "SELECT evaluation_json, source_hash FROM resume_reports WHERE application_id = ?",
        (application_id,),
    )
    cached = cur.fetchone()
    report = None
    if cached and cached[1] == source_hash and cached[0]:
        try:
            report = json.loads(cached[0])
        except Exception:
            report = None

    if report is None:
        report = build_report(job, resume_text, applicant)
        report = refine_with_llm(report, job, resume_text, applicant)
        matched_skills = _derive_matched_skills(report)
        matched = bool(report.get("match_score", 0) >= RESUME_PASS)
        now_ts = datetime.utcnow().isoformat()
        if conn.execute("SELECT id FROM resume_reports WHERE application_id = ?", (application_id,)).fetchone():
            conn.execute(
                """UPDATE resume_reports
                   SET evaluation_json = ?, source_hash = ?, matched = ?,
                       matched_skills = ?, last_evaluated_at = ?
                   WHERE application_id = ?""",
                (json.dumps(report, ensure_ascii=False), source_hash,
                 int(matched), ",".join(matched_skills), now_ts, application_id),
            )
        else:
            conn.execute(
                """INSERT INTO resume_reports
                   (application_id, matched, matched_skills, evaluation_json,
                    source_hash, last_evaluated_at, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (application_id, int(matched), ",".join(matched_skills),
                 json.dumps(report, ensure_ascii=False), source_hash, now_ts, now_ts),
            )
        conn.commit()
    conn.close()

    matched_score = int(report.get("match_score", 0))
    matched_skills = _derive_matched_skills(report)
    return {
        "full_name": full_name,
        "email": email,
        "job_title": job["job_title"],
        "job_domain": job["job_domain"],
        "resume_status": app_status,
        "interview_status": interview_status,
        "matched": bool(matched_score >= RESUME_PASS),
        "matched_skills": ",".join(matched_skills),
        "resume_filename": resume_filename,
        "report": report,
    }


def evaluate_application_match(db_path: str, application_id: int) -> dict:
    """Deterministically evaluate ONE application against its own job posting.

    Used at apply time so every attempt (matched or not) gets an explicit,
    stored outcome immediately. It uses the exact same engine, inputs and
    pass threshold (``RESUME_PASS``) as ``get_or_build_evaluation`` — only the
    optional LLM wording refinement is skipped, because a candidate must not
    wait on (or be billed for) an LLM call while applying. Nothing is cached
    here: the HR resume report is still built and cached on demand.

    Returns ``{}`` when the application does not exist.
    """
    ctx = _load_application_context(db_path, application_id)
    if not ctx:
        return {}

    report = build_report(ctx["job"], ctx["resume_text"], ctx["applicant"])
    score = int(report.get("match_score", 0))
    missing_skills = [
        entry["skill"]
        for entry in report.get("required_skills", [])
        if entry.get("status") == "missing"
    ]

    return {
        "matched": score >= RESUME_PASS,
        "match_score": score,
        "missing_skills": missing_skills,
    }


def _derive_matched_skills(report: dict) -> list:
    out = [e["skill"] for e in report.get("required_skills", []) if e.get("status") in ("demonstrated", "implied")]
    out += [e["skill"] for e in report.get("preferred_skills", []) if e.get("status") == "demonstrated"]
    return list(dict.fromkeys(out))