"""
Resume parsing + analysis for the Applicant Dashboard.

Extracts text from PDF / DOCX uploads (the formats this app accepts) and
computes a real Resume Strength score from the extracted content.

Dependencies (pdfplumber / python-docx) are imported lazily so this module
never crashes an upload when they are not installed — the parser degrades
gracefully and the score simply reflects what could be extracted.
"""

import re

# ------------------------------------------------------------------
# Skill lexicon — the domain vocabulary the app recognises in resumes.
# Matching is case-insensitive; longer terms are matched first.
# ------------------------------------------------------------------
SKILL_LEXICON = [
    "python", "sql", "machine learning", "deep learning", "tensorflow",
    "pytorch", "keras", "natural language processing", "nlp", "computer vision",
    "data analysis", "data science", "pandas", "numpy", "scikit-learn",
    "scikit learn", "flask", "django", "fastapi", "react", "react.js",
    "reactjs", "javascript", "typescript", "html", "css", "node.js", "nodejs",
    "java", "c++", "c#", "golang", "go", "rust", "git", "github", "docker",
    "kubernetes", "aws", "azure", "gcp", "linux", "rest api", "restful api",
    "mongodb", "postgresql", "mysql", "redis", "graphql", "excel", "tableau",
    "power bi", "communication", "leadership", "teamwork", "problem solving",
    "agile", "scrum", "jira", "ci/cd", "mlops", "llm", "openai", "langchain",
    "spacy", "nltk", "pyspark", "hadoop", "kafka", "apache spark", "spark",
    "statistics", "probability", "linear algebra", "calculus", "c", "r",
    "matlab", "bash", "shell scripting", "api development", "unit testing",
    "automation", "data structures", "algorithms", "oop", "system design",
]

# ------------------------------------------------------------------
# Section detection — used to reward resumes that cover the basics.
# ------------------------------------------------------------------
SECTION_PATTERNS = {
    "contact": [r"email", r"phone", r"linkedin", r"github", r"contact"],
    "experience": [r"experience", r"work history", r"employment", r"internship", r"intern"],
    "education": [r"education", r"university", r"college", r"degree", r"b\.?tech", r"m\.?tech", r"bachelor", r"master", r"cgpa", r"gpa"],
    "projects": [r"projects?", r"project work"],
    "skills": [r"skills?", r"technical skills", r"technologies"],
}

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{8,}\d)")
YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*years?")


def _extract_pdf_text(data: bytes) -> str:
    try:
        import io
        import pdfplumber

        with pdfplumber.open(io.BytesIO(data)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages)
    except Exception:
        return ""


def _extract_docx_text(data: bytes) -> str:
    try:
        import io
        import docx

        document = docx.Document(io.BytesIO(data))
        parts = [p.text for p in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                for cell in row.cells:
                    parts.append(cell.text)
        return "\n".join(parts)
    except Exception:
        return ""


def extract_resume_text(filename: str, data: bytes) -> str:
    """Extract plain text from a PDF or DOCX byte payload."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        return _extract_pdf_text(data)
    if ext == "docx":
        return _extract_docx_text(data)
    return ""


def _detect_skills(text: str, profile_skills: list) -> list:
    """Return the skills found in the resume (deduped, case-insensitive)."""
    lowered = text.lower()
    found = []
    seen = set()
    for skill in SKILL_LEXICON:
        # Only count a skill once and ignore single-letter/ambiguous hits.
        if skill in ("c", "r", "go") and not re.search(rf"\b{skill}\b", lowered):
            continue
        if skill in seen:
            continue
        pattern = skill.replace(" ", r"\s+")
        if re.search(rf"(?<![a-z0-9]){pattern}(?![a-z0-9])", lowered):
            found.append(skill)
            seen.add(skill)

    # Profile skills the candidate typed manually are also real signals.
    for skill in profile_skills:
        key = skill.lower()
        if key not in seen:
            found.append(key)
            seen.add(key)

    # Capitalise nicely for display.
    display = []
    for s in found:
        if s in ("c++", "c#", "node.js", "react.js", "scikit-learn"):
            display.append(s)
        else:
            display.append(s.title())
    return display



def analyze_resume(text: str, profile_skills: list) -> dict:
    """
    Compute a real Resume Strength score from extracted resume content.

    Returns: { score, subscores, skills, suggestions }
    """
    text = text or ""
    lowered = text.lower()
    word_count = len(re.findall(r"\S+", text))

    # ---- Subscores (each 0-100) -------------------------------------
    contact = 0
    if EMAIL_RE.search(text):
        contact += 40
    if PHONE_RE.search(text):
        contact += 40
    if any(term in lowered for term in ("linkedin", "github", "location")):
        contact += 20

    experience = 0
    has_exp_section = any(re.search(p, lowered) for p in SECTION_PATTERNS["experience"])
    years = YEARS_RE.findall(lowered)
    if has_exp_section:
        experience += 50
    if years:
        experience += 30
    if re.search(r"(bullets|achievements|responsibilities|accomplishments)", lowered):
        experience += 20

    education = 0
    if any(re.search(p, lowered) for p in SECTION_PATTERNS["education"]):
        education += 70
    if re.search(r"(cgpa|gpa)", lowered):
        education += 30

    skills_found = _detect_skills(text, profile_skills)
    skill_hits = min(len(skills_found), 12)
    skills_score = min(100, skill_hits * 9)

    content = min(100, word_count // 30)  # 30+ words -> 100

    subscores = [
        {"label": "Contact & Profiles", "score": contact},
        {"label": "Experience", "score": experience},
        {"label": "Education", "score": education},
        {"label": "Skills Coverage", "score": skills_score},
        {"label": "Content Depth", "score": content},
    ]

    # ---- Overall weighted score --------------------------------------
    weights = {"Contact & Profiles": 0.10, "Experience": 0.30, "Education": 0.15,
               "Skills Coverage": 0.30, "Content Depth": 0.15}
    score = int(round(sum(sub["score"] * weights[sub["label"]] for sub in subscores)))

    # ---- Suggestions (driven by what is actually missing) ------------
    suggestions = []
    if contact < 60:
        suggestions.append("Add your email, phone and LinkedIn/GitHub links at the top of the resume.")
    if experience < 60:
        suggestions.append("Add a Work Experience / Internship section with your responsibilities and achievements.")
    if education < 60:
        suggestions.append("Include an Education section with your degree, university and CGPA/GPA.")
    if skills_score < 60:
        suggestions.append("Add a Technical Skills section listing your programming languages, frameworks and tools.")
    if content < 60:
        suggestions.append("Expand your resume with more detail — add project descriptions and measurable outcomes.")
    if not suggestions:
        suggestions.append("Your resume looks well-structured. Keep it up to date as you gain new skills.")

    return {
        "score": score,
        "subscores": subscores,
        "skills": skills_found,
        "suggestions": suggestions,
    }
