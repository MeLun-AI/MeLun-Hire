# MeLun Hire — Production Deployment Guide

This guide deploys MeLun Hire with the target architecture requested:

| Layer | Platform | What it is |
| --- | --- | --- |
| Frontend | **Vercel** | `frontend-react/` — React 18 + TypeScript, built by Vite 5 (static SPA) |
| Backend / API | **Render** | `Backend/3.Chat bot/` — FastAPI app (`main.py`, ASGI `app`) |
| Database | **Render** (SQLite on a persistent disk) *or* PostgreSQL (see §2) | `config/paths.py` resolves the location from `DATABASE_URL` |
| File storage | **Render persistent disk** | Resumes + profile images under `STORAGE_DIR` |

> **Read §2 and §9 before you start.** Two decisions in this project must be made
> deliberately: the *database engine* and the *file storage volume*. Everything
> else is straightforward configuration.

**Deploy order:** Render database/storage → Render backend → Vercel frontend →
verify. See the final checklist (§14).

Never commit real secrets. `.env` and `.env.*` are git-ignored; provide every
secret through the platform's environment settings.

---

## 1. Deploy the backend to Render

The backend is a standard FastAPI app. Root directory, build and start commands:

| Render setting | Value |
| --- | --- |
| Service type | **Web Service** |
| Environment / Language | **Python 3** |
| Root Directory | `Backend/3.Chat bot` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python -m uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` |
| Instance plan | **Starter or higher** (a persistent disk requires a paid plan) |

Notes:

- `main:app` is the ASGI object (`app = FastAPI(...)` in `Backend/3.Chat bot/main.py`).
  There is no `if __name__ == "__main__"` block, so always start it via `uvicorn`.
- Binding to `0.0.0.0` and `$PORT` is required — Render injects `PORT` and routes
  external traffic to it. Do **not** hardcode 8000 in the start command.
- `/health` returns `{"status": "ok"}` with no authentication and no database
  access, so it is safe to use for platform health checks.
- Set `PYTHON_VERSION` (Render env var) to a `3.11.x` release to match the code
  (`python-dateutil`, `pydantic`, etc. are all 3.11-compatible).

You can create the service by hand in the Render dashboard, or apply the optional
blueprint [`render.yaml`](render.yaml) at the repository root (Render Dashboard →
New → Blueprint). The blueprint creates the web service **and** the persistent
disk described in §9; values marked `sync: false` are entered in the dashboard.

---

## 2. Deploy the database (SQLite now, PostgreSQL decision)

### Current state (read this)

The data layer is written directly against the Python `sqlite3` driver
(`database/db.py`, and an identical `get_conn()` helper in most routers). It uses
SQLite-specific SQL (`PRAGMA`, `AUTOINCREMENT`, `INSERT OR REPLACE`, `?`
placeholders, `sqlite3.Row`). The database is **one file**, currently
`Backend/3.Chat bot/database/database.db`.

As of this change, that file's location is **environment-driven**
(`config/paths.py`, read by every module):

- `DATABASE_URL=sqlite:///database/database.db` → path relative to the backend directory
- `DATABASE_URL=sqlite:////var/data/database.db` → absolute path (production disk)
- `DATABASE_URL` unset → default `<backend>/database/database.db`
- A `postgres://` / `postgresql://` URL is **rejected at startup with a clear
  error** rather than silently falling back to local SQLite.

### PostgreSQL is a manual migration, not a config flip

Because every module uses `sqlite3` directly, switching to PostgreSQL is **not**
just a `DATABASE_URL` change — it requires rewriting the data layer to a
PostgreSQL driver (e.g. `psycopg`) and converting the SQL dialect in ~20 files,
plus a real migration tool. That is a separate, sizeable change and it **cannot
be verified without a running PostgreSQL instance**, so it has deliberately not
been done as part of deployment preparation.

**Recommended path for a production launch, in order of effort:**

1. **Launch on Render with SQLite on a persistent disk (zero code changes).**
   Suitable for a single application instance (which is how Render web services
   run by default). Data survives deploys because it lives on the disk, not in
   the container. This is the fastest safe path and is fully supported today.
2. **Migrate to PostgreSQL later** when you need multiple writers / horizontal
   scaling. Do this as a dedicated task with a live staging database to verify
   against. `database/db.py` is intentionally the single connection module, so it
   is the natural place to introduce a driver abstraction.

If you do not attach a persistent disk, the SQLite file (and all data) is lost on
every redeploy — see §9.

---

## 3. Environment variables to add on Render

Add these in **Render → your service → Environment**. Secrets should be entered
as secret values; placeholders only are shown here.

| Variable | Required | Value / notes |
| --- | --- | --- |
| `APP_ENV` | yes | `production` (enables `Secure` session cookies; disables the SMTP test endpoint) |
| `APP_DEBUG` | yes | `false` |
| `SECRET_KEY` | yes | long random secret. **Production refuses to boot without it.** Generate with `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `DATABASE_URL` | yes | `sqlite:////var/data/database.db` (absolute path on the disk — see §9) |
| `STORAGE_DIR` | yes | `/var/data` (upload root on the disk — see §9) |
| `FRONTEND_URL` | yes | the Vercel frontend origin, e.g. `https://your-app.vercel.app` (used to build password-reset links) |
| `ALLOWED_ORIGINS` | yes | comma-separated CORS origins, e.g. `https://your-app.vercel.app` (see §7; `*` is rejected) |
| `SESSION_COOKIE_SECURE` | yes | `true` (required with `SameSite=None` — see §8) |
| `SESSION_COOKIE_SAMESITE` | yes | `none` for the default Vercel/Render domains; `lax` if frontend + API share a registrable domain (see §8) |
| `SESSION_TTL_HOURS` | optional | session lifetime in hours (default `12`) |
| `SESSION_COOKIE_NAME` | optional | cookie name (default `quno_session`) |
| `OPENAI_API_KEY` | yes (for AI features) | LLM key used by `ai_engine/llm_client.py` |
| `LLM_MODEL`, `LLM_TEMPERATURE`, `LLM_MAX_TOKENS` | optional | tune the LLM calls |
| `SMTP_SERVER` | yes (for email) | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | yes (for email) | e.g. `587` (STARTTLS) |
| `SMTP_USERNAME` | yes (for email) | SMTP login |
| `SMTP_PASSWORD` | yes (for email) | SMTP password / app password |
| `SMTP_FROM` | yes (for email) | From address |
| `SENDER_EMAIL` / `SENDER_PASSWORD` | optional | legacy aliases; `main.py` accepts either pair for interview-code mail |
| `PYTHON_VERSION` | recommended | `3.11.9` |

`INTERVIEW_*`, `OUTPUT_FORMAT`, `SAVE_REPORTS`, `REPORTS_DIR`, `GD_*`, weights and
thresholds have working defaults; set them only to change behaviour. (`INTERVIEW_BASE_URL`
is currently not consumed by the code.)

The full template lives in [`Backend/3.Chat bot/.env.example`](Backend/3.Chat%20bot/.env.example).

---

## 4. Deploy the frontend to Vercel

The frontend is a Vite SPA (`frontend-react/`). Two ways to set it up:

**Dashboard import (recommended)**

| Vercel setting | Value |
| --- | --- |
| Framework Preset | **Vite** |
| Root Directory | `frontend-react` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |
| Node.js Version | 18+ (Vite 5 requires Node 18+) |

A [`frontend-react/vercel.json`](frontend-react/vercel.json) is included. It sets
the build/output paths and, importantly, rewrites all unknown paths to
`/index.html` so client-side routes (e.g. `/interview/<code>`, `/hr/...`,
`/reset-password/...`) work on refresh and on direct links. Without that rewrite,
deep links return a 404 from the CDN.

---

## 5. Environment variables to add on Vercel

Add these in **Vercel → Project → Settings → Environment Variables** (Production,
and Preview if you want preview builds to work). Vite only exposes `VITE_`-prefixed
variables to the bundle — never put secrets here.

| Variable | Required | Value |
| --- | --- | --- |
| `VITE_API_URL` | yes | your Render API base URL, e.g. `https://melun-hire-api.onrender.com` (no trailing slash) |
| `VITE_APP_URL` | optional | your Vercel origin, e.g. `https://your-app.vercel.app`. Used only to build interview links shared with applicants; if unset the browser origin is used automatically |

`VITE_API_BASE_URL` is still accepted as a fallback for backwards compatibility,
but `VITE_API_URL` takes precedence. A template is in
[`frontend-react/.env.example`](frontend-react/.env.example).

> Environment variables are baked in at **build time**. After changing a `VITE_`
> variable you must **redeploy** (a new build), not just restart.

---

## 6. How the frontend and backend communicate

1. The SPA calls the API through one module, `src/services/api.ts`, which sets
   the base URL from `VITE_API_URL`. All request helpers (`getJson`, `postJson`)
   go through it, so there are no scattered API hosts to keep in sync.
2. Every request is sent with `credentials: 'include'`, so the browser attaches
   the session cookie.
3. The API answers with CORS headers for the configured origin (§7) and sets the
   session cookie with the attributes in §8.
4. File uploads (`multipart/form-data`) use the same base URL and cookie.

Because the two apps are on different hosts, three things must agree or
authentication will silently fail: the **CORS origin** (§7), the **cookie
attributes** (§8), and that the frontend sends **credentials** (already handled).

---

## 7. Configure CORS

CORS is already allow-list based (`main.py`) and reads `ALLOWED_ORIGINS`:

- `ALLOWED_ORIGINS` is a comma-separated list of exact origins, e.g.
  `https://your-app.vercel.app`.
- `FRONTEND_URL` is automatically appended to the list.
- `*` is intentionally filtered out, because the API uses credentialed requests
  and browsers reject `Access-Control-Allow-Origin: *` together with credentials.
- `allow_credentials=True` is set, so an exact origin (not a wildcard) is required.
- If `ALLOWED_ORIGINS` is empty, the backend falls back to local development
  origins (`http://localhost:3000`, `http://localhost:5173`, and the `127.0.0.1`
  equivalents). **Always set it explicitly in production.**

If you add a custom domain or a Vercel preview URL you want to allow, add each
origin to `ALLOWED_ORIGINS` (comma-separated) and redeploy the backend.

---

## 8. Configure production authentication (cookies)

Authentication is **server-side sessions** (`auth/sessions.py`): a random opaque
token is stored hashed in the `auth_sessions` table and handed to the browser as
an **HttpOnly** cookie. There is no JWT to configure; the relevant settings are
the cookie attributes.

The one thing that bites when frontend and backend are on **different sites**
(the default `*.vercel.app` + `*.onrender.com`) is the cookie's `SameSite`:

- Two different registrable domains (e.g. `app.vercel.app` and `api.onrender.com`)
  are **cross-site**. A `SameSite=Lax` cookie is **not** sent on those requests,
  so the user appears logged out on every call. Set:

  ```text
  SESSION_COOKIE_SAMESITE=none
  SESSION_COOKIE_SECURE=true     # browsers REQUIRE Secure with SameSite=None
  APP_ENV=production             # also makes cookies Secure automatically
  ```

- **Better (recommended): serve both from one registrable domain** using custom
  domains, e.g. `app.example.com` (Vercel) + `api.example.com` (Render). Subdomains
  of the same registrable domain are **same-site**, so `SameSite=Lax` works, and
  you avoid third-party-cookie blocking (Safari blocks `SameSite=None` cookies by
  default, which would break logins there). In that case:

  ```text
  SESSION_COOKIE_SAMESITE=lax
  SESSION_COOKIE_SECURE=true
  ALLOWED_ORIGINS=https://app.example.com
  FRONTEND_URL=https://app.example.com
  ```

Other cookie settings: `SESSION_TTL_HOURS` (default 12) and `SESSION_COOKIE_NAME`
(default `quno_session`). Always run over HTTPS. `SECRET_KEY` must be set in
production (the app refuses to start without it) and is used to derive the reset
token and other server-side security material.

---

## 9. Configure persistent file storage

Uploaded files (resumes and profile images) are written to disk under a single
root, resolved by `config/paths.py` from `STORAGE_DIR` (default `<backend>/data`):

```
STORAGE_DIR/
├── resumes/<applicant_id>/...         # uploaded resumes (PDF / DOCX)
└── profile_images/<applicant_id>.png  # applicant profile pictures
```

The database stores these as **relative** paths (`data/profile_images/<id>.png`),
and the code maps them onto `STORAGE_DIR` at read time, so moving the storage
root does not invalidate existing rows.

**On Render's default filesystem the disk is ephemeral** — files (and, for SQLite,
the database) are wiped on every deploy/restart. For production you must attach a
persistent disk:

1. Render → your service → **Disks → Add Disk**.
2. Name it (e.g. `melun-data`) and mount it at **`/var/data`**.
3. Set the environment variables:

   ```text
   STORAGE_DIR=/var/data
   DATABASE_URL=sqlite:////var/data/database.db
   ```

4. A persistent disk requires a **paid instance plan**; changing a disk restarts
   the service (expected).

The optional `render.yaml` blueprint wires this up for you. Uploads are validated
by the existing code (extension + magic-byte sniffing, size caps), so keep those
checks if you extend upload handling.

---

## 10. Configure email

Email is sent over SMTP (interview-code mails in `main.py`, password-reset mails in
`services/password_reset_email.py`, decision mails in `services/decision_email.py`).
Everything is read from the environment — there is **no hardcoded sender or
password**. Set on Render:

```text
SMTP_SERVER=<smtp-host>        # e.g. smtp.gmail.com
SMTP_PORT=<port>               # e.g. 587 (STARTTLS)
SMTP_USERNAME=<smtp-login>
SMTP_PASSWORD=<app-password>   # for Gmail, an App Password, not the account password
SMTP_FROM=<from-address>
FRONTEND_URL=<vercel-origin>   # password-reset links point here
```

Notes:

- If SMTP values are missing, sends fail clearly (`RuntimeError` from
  `send_interview_email`) instead of silently doing nothing; the rest of the app
  keeps working.
- The diagnostic endpoint `GET /api/test-email` (in `routes/password_reset.py`)
  **returns 404 when `APP_ENV=production`**, and is never called on startup — so no
  test emails are sent automatically. Use it only against a non-production
  environment if you need to debug SMTP.
- Startup never sends mail; emails are only sent in response to a real action.

---

## 11. Run database migrations

There is no migration framework; schema changes are applied by idempotent scripts
and by additive startup checks. Run these **once** against a fresh production
database (e.g. Render → Shell), using the same `DATABASE_URL` the service uses:

```bash
cd "Backend/3.Chat bot"
python database/init_db.py     # creates the base tables (commits them)
python db_migrate.py           # ensures the `applications` table + newer columns
```

Then start the service. On every startup `main.py` also runs idempotent, additive
checks (`ensure_application_columns`, `ensure_interview_report_columns`,
`ensure_proctoring_schema`), and other feature tables (sessions, notifications,
Career Quest, Talent Arena) are created lazily on first use — all safe to repeat.

Known quirk: `database/init_db.py` prints a `sqlite3.ProgrammingError: Cannot
operate on a closed database` **after** it has committed the base tables (it
reuses a cursor after `conn.close()`). The tables are created correctly; the
trailing traceback is expected and non-fatal.

To apply migrations automatically on each deploy, add a Render **Pre-Deploy
Command**:

```bash
python database/init_db.py && python db_migrate.py
```

(Pre-Deploy Commands require a paid plan; otherwise run the two commands once via
the Render Shell.)

---

## 12. Test the deployed application

In order:

1. **Health check** — `GET https://<render-service>.onrender.com/health` returns
   `{"status": "ok"}`. (Render's own health check uses this path.)
2. **API docs** — open `https://<render-service>.onrender.com/docs`; routes should
   be listed.
3. **CORS** — from a browser on the Vercel URL, open DevTools → Network and confirm
   the API responses carry `Access-Control-Allow-Origin: https://<vercel-origin>`
   (your exact origin) and `Access-Control-Allow-Credentials: true`.
4. **Auth round-trip** — sign up / log in. In DevTools → Application → Cookies you
   should see the session cookie set on the API domain with the expected `Secure`
   / `SameSite` flags; subsequent API calls should return your profile (not 401).
5. **Uploads** — upload a resume and a profile picture; they should persist across a
   redeploy (proving the disk is mounted) and be readable by HR.
6. **Email** — trigger an interview-code or password-reset email and confirm
   delivery.
7. **Deep link** — open a route such as `/interview/<code>` directly (or refresh on
   it); it should load the app, not a 404 (proves the SPA rewrite).

---

## 13. Common deployment errors and how to diagnose them

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `RuntimeError: SECRET_KEY is not set` at boot | `SECRET_KEY` missing while `APP_ENV=production` | set `SECRET_KEY` on Render |
| `RuntimeError: DATABASE_URL points at PostgreSQL...` at boot | you set a `postgres://`/`postgresql://` URL | use a `sqlite:///...` URL (SQLite is the current engine) or complete the Postgres migration (§2) |
| Frontend shows "Could not connect to server" | `VITE_API_URL` wrong/missing, or backend asleep (free-plan cold start) | set `VITE_API_URL` to the Render URL and **redeploy** the frontend; the first request after idle can take ~30s |
| API calls blocked, `No 'Access-Control-Allow-Origin'` | `ALLOWED_ORIGINS` does not include the exact frontend origin | add the origin (comma-separated) and redeploy the backend |
| Logged out on every request (401) | cookie not sent: cross-site + `SameSite=Lax`, or missing `Secure` | set `SESSION_COOKIE_SAMESITE=none` + `SESSION_COOKIE_SECURE=true`, or move to same-site subdomains (§8) |
| Deep link 404 / refresh breaks | missing SPA rewrite | keep `frontend-react/vercel.json` rewrites (§4) |
| Data disappears after each deploy | SQLite + uploads on the ephemeral filesystem | attach a persistent disk and set `STORAGE_DIR` / `DATABASE_URL` (§9) |
| `no such table: hr_users` | fresh DB not initialized | run `python database/init_db.py` then `python db_migrate.py` (§11) |
| Env change had no effect on the frontend | `VITE_` vars are build-time | trigger a new Vercel deployment |
| Emails not sending | SMTP env vars missing/incorrect | set `SMTP_*` (§10); check logs for the explicit error |

---

## 14. Deploy order (checklist)

1. [ ] Attach a **persistent disk** to the Render service at `/var/data` (paid plan).
2. [ ] Create the Render **web service** (`Backend/3.Chat bot`, build/start as in §1).
3. [ ] Add all **Render environment variables** (§3), including `SECRET_KEY` and the
       `DATABASE_URL` / `STORAGE_DIR` disk paths.
4. [ ] Deploy the backend; confirm `GET /health` returns `{"status":"ok"}`.
5. [ ] Run **migrations** once in the Render Shell (§11): `init_db.py`, then `db_migrate.py`.
6. [ ] Deploy the **frontend** to Vercel (`frontend-react`, §4), keeping `vercel.json`.
7. [ ] Add `VITE_API_URL` (and optional `VITE_APP_URL`) on Vercel, then **redeploy** (§5).
8. [ ] Set `ALLOWED_ORIGINS` (and `FRONTEND_URL`) on Render to the exact Vercel origin
       and redeploy the backend (§7).
9. [ ] Verify the cookie/`SameSite` behaviour per §8 and run the tests in §12.
10. [ ] (Later, optional) plan the PostgreSQL migration as a separate task (§2).





