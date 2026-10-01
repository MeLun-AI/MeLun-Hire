# MeLun Hire

**MeLun Hire** is the AI-powered hiring platform developed under MeLun. It pairs a React portal for HR teams and applicants with a FastAPI backend that evaluates resumes against real role requirements, matches candidates to jobs, runs role-aware AI interviews, scores performance, and supports the final hiring decision.

---

## Overview

Hiring teams face two opposite failures: far too many applications to review manually, and qualified candidates that get silently overlooked because screening is rushed or inconsistent. MeLun Hire puts an AI-assisted evaluation pipeline in front of the recruiter rather than in place of them.

The platform serves two separate portals through one shared API and database:

- **HR portal** — sign up, manage a company profile and job posts, review applicants, read resume match reports with concrete missing-skill gaps, send or auto-issue interview codes, monitor AI interviews, read scored interview reports, and record final decisions (manually, or automatically when a candidate clears the decision threshold).
- **Applicant portal** — sign up, maintain a profile, upload a resume, discover and apply to open jobs, take AI interviews with proctoring, review personal interview feedback, and take part in Career Quest skill challenges.

AI output is stored and surfaced as structured, per-candidate evidence — matched skills, real missing-skill gaps, per-answer analysis, derived scores — so recruiters can see *why* a candidate was surfaced or set aside instead of trusting an opaque verdict.

---

## Core Capabilities

### HR workflow

- **HR authentication and account management** — signup, login, logout on server-side sessions carried by an HttpOnly cookie (`auth/routes/hr_auth.py`, `auth/sessions.py`).
- **Company profile** — create and update the company profile (`auth/routes/hr_company_profile.py`).
- **HR settings** — profile update, change password, notification preferences, account deactivation, the automatic interview-code switch, and the automatic-decision switch (`auth/routes/hr_settings.py`).
- **Job posting management** — create/update job posts, list posts for an HR, close a post, bulk close posts, and a jobs listing used for discovery (`auth/routes/hr_job_posts.py`).
- **Applicant tracking** — applicant list per HR, per-applicant resume access, per-application status updates, bulk status updates, interview code issue/regenerate, and interview expiry reset (`auth/routes/hr_applicants.py`, `main.py`).
- **Dashboards and reports** — dashboard summary, active jobs, applicant breakdown, analytics, pending interviews and completed interviews (`main.py` → `/hr/dashboard/*`, `/hr/pending-interviews/*`, `/hr/completed-interviews/*`).
- **Resume reports** — match summary for an applicant on a job, the full report for one application, and the list of all resume reports for the HR (`/hr/resume-reports/{hr_id}`, `/hr/resume-report/{application_id}`).
- **Interview reports** — the AI interview report for a single application (`/hr/interview-report/{application_id}`), plus the HR interview report views in the frontend.
- **Final decision workflow** — record a decision for one application or in bulk, with provenance recorded as manual or automatic (`/hr/applicant/decision`, `/hr/applicant/decision/bulk`, `services/final_decision.py`).
- **Notifications** — notification inbox, mark one read, mark all read; interview and decision events generate notifications (`routes/hr_notifications.py`).

### Applicant workflow

- **Applicant authentication** — signup, login, logout, and applying to a job (`auth/routes/applicant_auth.py`).
- **Profile management** — view and update the profile, upload/update the profile picture (`/applicant/profile/*`, `/applicant/update-profile`, `/applicant/update-profile-pic`).
- **Resume handling** — resume upload, parsed resume retrieval, and submission of the parsed resume report (`routes/applicant.py`, `/applicant/submit-resume-report`).
- **Job discovery and applications** — open job listings, the applicant's applied positions, and the applicant's own interview feedback/report (`jobUtils.ts` → `/hr/jobs`, `/applicant/applied-positions/{applicant_id}`, `/applicant/interview-report/{application_id}`).
- **Taking an AI interview** — interview code verification, start, heartbeat, abandon, submit, and reissue requests (`/applicant/verify-interview-code`, `/applicant/request-reissue`, `/interview/*`).
- **Applicant settings** — account deletion (`auth/routes/applicant_settings.py`).
- **Notifications** — the applicant-side notification inbox (`routes/hr_notifications.py`).

### Matching, evaluation and AI

- **Resume parsing** — PDF and DOCX resume text extraction (`services/resume_parser.py`).
- **Resume evaluation and candidate↔job matching** — each application is classified as matched or unmatched, storing matched skills and the actual missing-skill gaps (`services/resume_evaluation.py`, `resume_reports` table).
- **Automatic interview codes** — when an HR turns on the automatic interview-code switch, newly matched candidates receive their interview code automatically, with duplicate prevention, honest reporting of delivery failures, and preserved sent state when the switch is turned off (`services/auto_interview.py`, `auth/routes/hr_settings.py`).
- **AI interview engine** — role-aware question generation and answer analysis through the isolated LLM client (`ai_engine/llm_client.py`), driven by the interview configuration in `config/settings.py` (rounds, questions per round, time limit).
- **Interview scoring** — analysis is converted into per-answer and final scores (`services/interview_scoring.py`).
- **Final decision automation** — automatic decisions when a candidate's score clears the platform decision threshold, plus decision emails and applicant notifications (`services/final_decision.py`, `services/decision_email.py`).
- **Interview proctoring** — integrity/proctoring events, violation reporting, and per-application proctoring state (`routes/proctoring.py` → `/interview/proctoring-event`, `/interview/violate`, `/interview/proctoring-state/{application_id}`).
- **Career Quest** — applicant skill game: challenges by domain, recommended challenges, attempts (start / submit / complete), skill signals, progress, and mystery challenges (unlock / reveal) (`routes/career_quest.py`).
- **Talent Arena** — HR talent pipeline: candidate pool, talent radar, blind evaluations, comparisons, team preview and team building, team roles, hiring quest, team votes, challenge requests, plus the applicant-side challenge list (`routes/talent_arena.py`, `frontend-react/src/pages/hr-talent/*`).

### Platform services

- **Password reset** — forgot-password, OTP verification and reset for both portals; reset codes are stored hashed, time-limited and single-use (`main.py` → `/auth/*`, `routes/password_reset.py` → `/api/auth/*`).
- **Rate limiting** — throttling for interview submission, password reset and code verification (`utils/rate_limit.py`).
- **Email delivery** — SMTP is used for reset codes, interview codes and decision notices (`main.py`, `services/password_reset_email.py`, `services/auto_interview.py`, `services/decision_email.py`).
- **Security controls** — password hashing (`utils/security.py`), server-side sessions, resource-ownership authorization checks (`auth/authorization.py`), a CORS allow-list, and generic error responses that never leak internal exception text to clients.

---

## Architecture

MeLun Hire is a two-tier application: a single-page React frontend and a FastAPI backend over a SQLite database, with the LLM reachable only from the backend.

```
frontend-react/                     Backend/3.Chat bot/
React + TypeScript + Vite           FastAPI application (main.py)
        │                                   │
        │  JSON over HTTP                   ├── auth/       sessions, authorization, auth routes
        │  fetch(credentials: include)      ├── routes/     applicant, career quest, talent arena,
        │  HttpOnly session cookie          │               proctoring, notifications, password reset
        ▼                                   ├── services/   resume parsing + evaluation, scoring,
  Browser (HR / applicant UI)               │               final decision, auto interview, emails
        │                                   ├── ai_engine/  LLM client (questions, analysis)
        └──────────► API ◄─────────────────► ├── database/  SQLite file + connection helpers
                                            ├── data/      uploaded resumes, profile images
                                            └── config/    settings loaded from .env
```

**Request flow**

1. The React app calls the API through one helper layer (`src/services/api.ts`) that always sends the session cookie. The base URL comes from `VITE_API_BASE_URL` and falls back to `http://localhost:8000` for local development.
2. FastAPI resolves the request against the routers registered in `main.py`. Authentication uses a server-side session table plus an HttpOnly cookie (`auth/sessions.py`); resource ownership is verified separately (`auth/authorization.py`), so one HR can never read another company's applicants.
3. Business logic lives in `routes/` and `services/`. Everything AI-related goes through `ai_engine/llm_client.py`, the only module that talks to the LLM provider.
4. Persistence is plain SQL through the `sqlite3` driver (`database/db.py`, WAL mode). Uploaded resumes and profile images are written to `data/` and referenced by path in the database.
5. Responses are JSON; React pages render reports, dashboards and applicant-facing views from that data.

**Frontend** (`frontend-react/`) — React 18 + TypeScript, bundled by Vite 5, styled with Tailwind CSS, animated with Framer Motion. Client-side routing (`react-router-dom`) keeps separate HR and applicant route trees.

**Backend** (`Backend/3.Chat bot/`) — FastAPI with modular routers (`auth/routes/`, `routes/`), service modules for evaluation, scoring and decisions, a thin LLM client, and a `sqlite3` data layer. CORS is restricted to an allow-list of frontend origins.

## Project Structure

```
.
├── frontend-react/                 React + TypeScript + Vite frontend
│   ├── index.html                  SPA entry, branding and metadata
│   ├── package.json                scripts and dependencies
│   ├── vite.config.ts              dev/preview server configuration
│   ├── tsconfig*.json              TypeScript configuration
│   ├── public/assets/images/       static branding, favicons, social images
│   └── src/
│       ├── main.tsx / App.tsx      app bootstrap and routing
│       ├── pages/                  landing, legal, HR pages, applicant pages
│       ├── pages/hr-talent/        Talent Arena screens (radar, blind evaluation, teams, …)
│       ├── components/             shared UI: HR, applicant, interview, proctoring, career quest
│       ├── services/               API layer and feature helpers (api.ts, applications.ts, …)
│       ├── constants/              shared constants (interview statuses)
│       ├── animations/             motion helpers
│       └── assests/images/         images used by the UI (existing folder name)
│
├── Backend/3.Chat bot/             FastAPI backend
│   ├── main.py                     app setup, core endpoints, safe startup migrations
│   ├── requirements.txt            Python dependencies
│   ├── db_migrate.py               additive database migration script
│   ├── config/settings.py          .env loading and typed settings
│   ├── auth/                       sessions, authorization, auth routes
│   ├── routes/                     applicant, career quest, talent arena, proctoring,
│   │                               notifications, password reset
│   ├── services/                   resume parsing/evaluation, interview scoring,
│   │                               final decision, auto interview, emails
│   ├── ai_engine/llm_client.py     LLM access layer
│   ├── utils/                      password hashing and rate limiting
│   ├── database/                   db.py (connection + DB path), init_db.py, database.db
│   ├── data/                       uploaded resumes and profile images
│   └── e2e_smoke_*.py,             runnable smoke and security harnesses
│       security_matrix_test.py
│
├── _brandzip/                      brand source assets (README + brand/brand.json)
├── testenv/                        local Python virtual environment (not committed)
├── AGENTS.md                       working rules for contributors/AI agents in this repo
└── .gitignore
```

---

## Prerequisites

| Requirement | Version used by this project | Notes |
| --- | --- | --- |
| Node.js | 18 or newer (verified on v24) | Vite 5 requires Node 18+ |
| npm | Ships with Node (verified on 11.x) | used for install and build |
| Python | 3.10+ (verified on 3.11) | FastAPI + `sqlite3` backend |
| pip | Ships with Python | installs `requirements.txt` |
| SQLite | none to install | `sqlite3` is part of the Python standard library |

Optional, for full functionality: access to an OpenAI-compatible API key (AI question generation and analysis) and an SMTP account (interview codes, password resets, decision emails). The application starts without them, but those flows will not complete.

---

## Local Development

### Frontend

```bash
cd frontend-react
npm install
npm run dev
```

Vite serves the app on **http://localhost:3000** (configured in `vite.config.ts`, which also opens the browser). Other scripts:

```bash
npm run build     # production build into dist/
npm run preview   # serve the built output locally
```

### Backend

The backend lives in `Backend/3.Chat bot`. A virtual environment named `testenv` already exists at the repository root and is used for local development (it is not committed — create your own if it is missing).

```bash
# 1. activate the environment (from the repository root)
testenv\Scripts\activate          # Windows
source testenv/bin/activate       # macOS / Linux

# if it does not exist yet:
# python -m venv testenv

# 2. install dependencies
cd "Backend/3.Chat bot"
pip install -r requirements.txt

# 3. prepare the database
python db_migrate.py

# 4. run the API
python -m uvicorn main:app --reload --port 8000
```

The API then serves on **http://localhost:8000**, with interactive documentation at **http://localhost:8000/docs** and the OpenAPI schema at **http://localhost:8000/openapi.json**.

- Port 8000 matches the frontend's local fallback API base URL (`src/services/api.ts`).
- The backend must be started **from inside `Backend/3.Chat bot`**, because it imports its packages by module name (`main`, `routes`, `auth`, …).
- `config/settings.py` loads `.env` from the backend directory using an absolute path, so the working directory does not affect configuration.
- Startup performs additive column/schema checks on the SQLite database; they are safe to run repeatedly.

## Environment Configuration

The backend reads configuration from a **`.env` file placed in the backend directory** (`Backend/3.Chat bot/.env`). `config/settings.py` loads it explicitly by absolute path on import and prints a startup diagnostic listing which keys are set — it never prints secret values. The frontend reads build-time variables from Vite's own env files (for example `frontend-react/.env.local`).

Both `.env` and `.env.*` are ignored by git. Never commit real values.

Example backend `.env` (names and placeholders only):

```ini
# ---- App / deployment ----
APP_ENV=development                  # "production" enables secure cookies automatically
APP_DEBUG=false
FRONTEND_URL=<your-frontend-origin>  # e.g. the origin URL of the running frontend
ALLOWED_ORIGINS=<origin-1>,<origin-2>   # comma separated; "*" is rejected by design

# ---- Security / sessions ----
SECRET_KEY=<your-secret>
TOKEN_EXPIRY_HOURS=<hours>
TOKEN_LENGTH=<bytes>
SESSION_COOKIE_NAME=<cookie-name>
SESSION_TTL_HOURS=<hours>
SESSION_COOKIE_SECURE=<true|false>
SESSION_COOKIE_SAMESITE=<lax|strict|none>

# ---- LLM / AI ----
OPENAI_API_KEY=<your-key>
LLM_MODEL=<model-name>
LLM_TEMPERATURE=<0.0-1.0>
LLM_MAX_TOKENS=<tokens>

# ---- Email (SMTP) ----
SMTP_SERVER=<smtp-host>
SMTP_PORT=<port>
SMTP_USERNAME=<smtp-user>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM=<from-address>
SENDER_EMAIL=<sender-address>
SENDER_PASSWORD=<sender-password>

# ---- Interview ----
INTERVIEW_ROUNDS=<count>
INTERVIEW_QUESTIONS_PER_ROUND=<count>
INTERVIEW_TIME_LIMIT=<seconds>
INTERVIEW_BASE_URL=<deployment-interview-base-url>

# ---- Reports / output ----
OUTPUT_FORMAT=json
SAVE_REPORTS=true
REPORTS_DIR=<output-directory>
```

Notes on how these are actually used:

- **CORS / frontend origin** — `ALLOWED_ORIGINS` (comma-separated) is the CORS allow-list. If it is empty, the backend falls back to local development origins; `FRONTEND_URL` is additionally appended to the list. The auth flow uses cookies, so `*` is deliberately filtered out and `allow_credentials` is enabled.
- **Sessions** — `APP_ENV=production` makes session cookies `Secure` unless `SESSION_COOKIE_SECURE` overrides it; `SESSION_TTL_HOURS` and `SESSION_COOKIE_NAME` control session lifetime and cookie naming.
- **LLM** — `OPENAI_API_KEY` is required for AI question generation and answer analysis; `LLM_MODEL`, `LLM_TEMPERATURE` and `LLM_MAX_TOKENS` tune the calls made in `ai_engine/llm_client.py`.
- **Database** — the SQLite file location is resolved in code (`database/db.py`, `main.py`), not through environment variables, so there is no database variable to set for the current implementation.
- **Interview and reporting values** — `INTERVIEW_*`, `OUTPUT_FORMAT`, `SAVE_REPORTS` and `REPORTS_DIR` are exposed through `config/settings.py`. The same file also defines `RESUME_WEIGHT`, `TECHNICAL_WEIGHT`, `BEHAVIORAL_WEIGHT`, `GD_WEIGHT`, `GD_DURATION`, `GD_MIN_PARTICIPANTS`, `RESUME_PASS_THRESHOLD` and `FINAL_PASS_THRESHOLD`; these are configuration values only — check the consuming code before assuming they change scoring behaviour.

Frontend variable:

```ini
# frontend-react/.env.local
VITE_API_BASE_URL=<your-api-base-url>   # production builds must point at the deployed API
```

---

## Database

The current implementation uses a single **SQLite** database file, resolved in code as `Backend/3.Chat bot/database/database.db` (`database/db.py` and `main.py` compute this path from the application directory). Connections are opened through `database/db.py` with WAL journal mode and a busy timeout, and rows are returned as `sqlite3.Row`.

- The database file, its journal sidecars (`-wal`, `-shm`) and backups are **not committed** — see `.gitignore`.
- Core tables include `hr_users`, `applicants`, `hr_job_posts`, `applications`, `resume_reports`, `interview_reports`, `hr_company_profile`, plus tables created by feature routers (notifications, sessions, password reset, proctoring, Career Quest, Talent Arena).
- Uploaded documents live on disk under `Backend/3.Chat bot/data/resumes` and `Backend/3.Chat bot/data/profile_images`; the database stores references, not file contents. Both directories are git-ignored.

**Initializing a fresh database**

```bash
cd "Backend/3.Chat bot"

python database/init_db.py    # creates the base tables (commits them)
python db_migrate.py          # ensures `applications` and adds newer columns
```

Verified behaviour of these scripts:

- `python db_migrate.py` completes cleanly (exit code 0) and is safe to re-run.
- `python database/init_db.py` creates and commits all base tables, then raises `sqlite3.ProgrammingError: Cannot operate on a closed database` in its trailing optimization-index block — a pre-existing issue (the script reuses a cursor after closing the connection). Because the base tables are committed before that point, the schema is created correctly despite the traceback.
- Starting the API also performs additive schema checks on import (`ensure_application_columns`, `ensure_decision_columns`, `ensure_interview_report_columns`, `ensure_proctoring_schema` in `main.py`), so missing columns are added automatically on startup.

## API

The FastAPI application registers its routers in `main.py` and exposes a generated OpenAPI schema (105 documented paths in the current build). Interactive documentation is available at `/docs` and the raw schema at `/openapi.json`.

Main API areas:

| Area | Purpose |
| --- | --- |
| `/hr` | HR accounts (`/hr/signup`, `/hr/login`, `/hr/logout`), company profile, HR settings, job posts, applicant list and resume access, dashboards and analytics, resume and interview reports, interview-code and expiry management, applicant status/decision endpoints, notifications |
| `/applicant` | Applicant accounts, profile and profile picture, resume upload/download, applying to jobs, applied positions, interview code verification, interview report/feedback, reissue requests, notifications, account deletion |
| `/auth` and `/api/auth` | Password reset: request a code, verify it, set a new password (plus the reset-token flow) |
| `/interview` | Interview lifecycle and proctoring: heartbeat, abandon, cleanup of abandoned interviews, report submission, violation reporting, and proctoring events/state per application |
| `/career-quest` | Career Quest challenges, attempts, skill signals, progress and recommendations |
| `/talent-arena` | Talent Arena: candidate pool, radar, evaluations, comparisons, teams, team roles, hiring quest, votes and challenge requests |

Conventions worth knowing:

- Authentication is cookie-based. Clients must send credentials with every request; the browser frontend does this globally in `src/services/api.ts`.
- Authorization is enforced per resource on the server: HR endpoints check that the requesting HR owns the job/application, and applicant endpoints check that the applicant owns the application.
- Error responses use standard FastAPI `{"detail": ...}` shapes; unexpected server errors return a generic message rather than internal exception text.
- The backend does not host the frontend build — `dist/` is served by a separate static host or CDN.

---

## Testing

Backend test harnesses live in `Backend/3.Chat bot` and are plain Python scripts (no pytest required). Run them from inside that directory:

```bash
cd "Backend/3.Chat bot"

python security_matrix_test.py            # synthetic authorization matrix
python e2e_smoke_application_matching.py  # matched/unmatched application tracking
python e2e_smoke_auto_interview_codes.py  # automatic interview codes for matched candidates
python e2e_smoke_career_quest.py          # Career Quest game pipeline
python e2e_smoke_talent_arena.py          # Talent Arena HR pipeline
```

What they cover:

- **`security_matrix_test.py`** — an authorization matrix for the API, run against a **copy** of the SQLite database with synthetic accounts, so development data is not modified. Exit code 0 means every expectation held, 1 means at least one failure.
- **`e2e_smoke_application_matching.py`** — matched and unmatched applications, independent statuses per job, duplicate-apply rules, HR applicant listings, resume reports for unmatched applications, and tenant isolation between HR accounts (uses a database copy and a temporary resume directory).
- **`e2e_smoke_auto_interview_codes.py`** — the automatic interview-code scenarios: switch off/on, unmatched candidates, toggling, duplicate prevention, delivery failures and persistence (uses synthetic HR/applicants/jobs in a temporary resume directory).
- **`e2e_smoke_career_quest.py`** — the Career Quest pipeline: challenge detail, attempt start, submit, skill signals and persistence.
- **`e2e_smoke_talent_arena.py`** — the Talent Arena pipeline: candidates → radar → evaluation → comparison → team → quest → votes → challenge request → applicant result → HR verdict.

**Current status (verified):** these harnesses use `fastapi.testclient`, which requires the `httpx` test dependency. `httpx` is **not** listed in `requirements.txt` and is not installed in the current local environment, so the suites abort at import with `RuntimeError: the starlette.testclient module requires the httpx2 package`. They were therefore **not** executed successfully here — install the test dependency before relying on them. This is an environment gap, not a code defect.

**Caution:** `e2e_smoke_talent_arena.py` points at the live database (`routes.talent_arena.DB_PATH`) and inserts its synthetic fixtures before running, unlike the other harnesses which work on copies or temporary data. Run it only against a disposable/test database.

There is currently no automated test configuration in `package.json` for the frontend; verify UI changes manually with `npm run dev` and `npm run build`.

## Production Deployment

### Frontend

```bash
cd frontend-react
npm ci                                  # reproducible install from package-lock.json

# point the build at the deployed API (build-time variable)
# frontend-react/.env.production
# VITE_API_BASE_URL=<your-api-base-url>

npm run build                           # outputs static assets to dist/
```

Deploy the generated `dist/` directory to a static host, CDN, or the web server that serves your domain. Because this is a client-side-routed SPA, configure the host to fall back to `index.html` for unknown paths. Never deploy `node_modules/` or `src/` — only the built output.

### Backend

```bash
cd "Backend/3.Chat bot"

python -m venv .venv
source .venv/bin/activate               # .venv\Scripts\activate on Windows
pip install -r requirements.txt

python db_migrate.py                    # prepare/migrate the database

python -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
# Linux alternative: gunicorn -k uvicorn.workers.UvicornWorker main:app
```

Run the ASGI server under a process manager (systemd, supervisor, container runtime) and put a reverse proxy in front of it for TLS termination. Production checklist:

- Provide every secret and environment variable through the environment or a secret manager — not through a committed file.
- Set `ALLOWED_ORIGINS` (and `FRONTEND_URL`) to the real production frontend origin, and set `APP_ENV=production` so session cookies are issued as `Secure`.
- Serve the frontend over HTTPS. The session cookie is `SameSite=Lax` by default, so frontend and API should share a site (or be configured deliberately otherwise) for cookies to be sent.
- Keep `Backend/3.Chat bot/data/` (uploaded resumes and profile images) on a persistent, backed-up volume.
- Do not deploy `node_modules/` or any local Python environment (`testenv/`, `venv/`, `.venv/`) from the repository.

Scaling note: the current database is a single SQLite file with WAL journaling, which is well suited to a single application instance. Before running many writers across multiple hosts, migrate to a client/server database (the `sqlite3` access is isolated in `database/db.py`, which is the natural place to change this).

---

## Important Security Notes

- **`.env` must never be committed.** Both `.env` and `.env.*` are git-ignored. Real API keys, SMTP credentials and the session secret belong in the deployment environment only.
- **Applicant data is sensitive.** Resumes and profile images live in `Backend/3.Chat bot/data/` and are git-ignored; interview reports, decisions and recruiter-facing analysis are equally sensitive. Expose them only to the owning HR applicant/company through the existing authorization checks, and avoid logging them.
- **Provision production secrets securely** (secret manager or platform environment variables). Rotate anything that was ever committed or shared.
- **Database files must not be committed.** `*.db`, `*.sqlite*`, journal sidecars (`-wal`, `-shm`) and backups are git-ignored; `database.db` holds account and application data.
- **Never deploy `node_modules/` or Python virtual environments** (`testenv/`, `venv/`, `.venv/`) from the repository — they contain machine-specific binaries and are not reproducible deployments.
- **Configure production CORS/frontend origin correctly.** `ALLOWED_ORIGINS` is an explicit allow-list; the wildcard `*` is intentionally rejected because the auth flow uses credentialed cookies.
- **Run behind HTTPS** in production. Session cookies are only set `Secure` when `APP_ENV=production` (or `SESSION_COOKIE_SECURE=true`) is configured.
- **Validate uploaded files.** Resumes and images are untrusted input: keep the existing extension/size validation paths intact if you extend upload handling.

---

## Current Architecture Notes

- **Frontend:** React 18 + TypeScript, built with Vite 5, styled with Tailwind CSS, animated with Framer Motion, routed with `react-router-dom`. HR and applicant flows are separate route trees sharing one API layer (`src/services/api.ts`).
- **Backend:** Python + FastAPI with modular routers (`auth/routes/`, `routes/`), service modules for resume evaluation, interview scoring and final decisions, and a single LLM access layer (`ai_engine/llm_client.py`).
- **Database:** one SQLite file accessed through the `sqlite3` standard library (`database/db.py`, WAL mode). Schema changes are applied additively by `db_migrate.py` and by the safe startup checks in `main.py`.
- **Auth model:** server-side sessions with an HttpOnly cookie, plus explicit per-resource ownership checks. HR accounts and applicant accounts are distinct identities with separate login endpoints.
- **AI usage:** the LLM is used for role-aware interview question generation and answer analysis; resume parsing is local (`pdfplumber` / `python-docx`). AI output is stored as structured data (matched/missing skills, per-answer analysis, scores) so it remains inspectable alongside the factual application data.
- **Static frontend hosting:** the backend serves only the API and its generated docs; the built SPA is hosted separately.

---

## License / Ownership

MeLun Hire is a **proprietary, internal product developed under MeLun**. The repository contains no license file, and no open-source license is granted for this codebase; all rights are reserved by MeLun. Do not redistribute, publish, or reuse it outside MeLun without explicit written authorisation.





