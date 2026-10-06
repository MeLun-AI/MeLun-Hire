/**
 * API base URL. Configurable per environment via VITE_API_URL (preferred) or
 * VITE_API_BASE_URL (kept for backwards compatibility); falls back to local dev.
 *
 * NOTE: the fallback uses `localhost` (not 127.0.0.1) so the browser treats it
 * as the same site as the Vite dev server — the session is carried by an
 * HttpOnly cookie sent only on same-site requests unless SameSite=None is set.
 */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:8000';

/**
 * Public base URL of the deployed frontend, used to build links that are shared
 * with applicants (for example interview access links). Falling back to
 * `window.location.origin` means local development and production both produce
 * valid links without hardcoding a host.
 */
export const APP_BASE_URL =
  (import.meta.env.VITE_APP_URL as string | undefined)?.replace(/\/$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/** All API calls must send the session cookie. */
const CREDENTIALS: RequestCredentials = 'include';

/**
 * Revoke the server-side session and clear the session cookie.
 * The browser session object is cleared by the caller; this makes sure the
 * HttpOnly cookie cannot be reused after signing out.
 */
export async function endSession(role: 'applicant' | 'hr'): Promise<void> {
  try {
    await fetch(`${API_BASE}/${role}/logout`, {
      method: 'POST',
      credentials: CREDENTIALS,
    });
  } catch {
    /* Best effort: local sign-out already happened on the caller side. */
  }
}

/** API error carrying the HTTP status so callers can react to 4xx/5xx. */
export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/** Shown when `fetch` never reached the API (backend not running, network
 *  down, request blocked). A `TypeError: Failed to fetch` is a CONNECTION
 *  failure — NOT an API answer — so the raw browser error must never be shown
 *  to the user. */
export const BACKEND_UNREACHABLE_MESSAGE =
  'Could not connect to server. Make sure the backend is running.';

/** Resolve the message to show for a failed request:
 *  - backend unreachable -> clear connection guidance (see above)
 *  - real API error      -> the backend's own message (e.g. "Invalid code")
 *  - anything else       -> the caller's `fallback`.
 *  Single source of truth so every page reports connection failures the same
 *  way instead of leaking "Failed to fetch". */
export function requestErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return BACKEND_UNREACHABLE_MESSAGE;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Turn a FastAPI validation `msg` into a clean, user-facing message. */
function cleanValidationMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('field required') || m.includes('missing') || m.includes('cannot be empty')) {
    return 'Please fill in all required fields.';
  }
  if (m.includes('valid email')) {
    return 'Please enter a valid email address.';
  }
  if (m.includes('str type') || m.includes('not a valid string')) {
    return 'Please enter a valid value.';
  }
  return msg;
}

/** Extract a readable message from a FastAPI error body (detail can be a
 *  string or an array of validation errors). */
function extractErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const first = detail.find((d) => d && typeof d === 'object');
      const msg =
        first && typeof (first as { msg?: unknown }).msg === 'string'
          ? (first as { msg: string }).msg
          : '';
      if (msg) return cleanValidationMessage(msg);
    }
  }
  return `Request failed with status ${status}`;
}

export async function postJson<T = unknown>(endpoint: string, body: Record<string, unknown>): Promise<T> {
  // A rejected fetch (TypeError: Failed to fetch) means the server is
  // unreachable or the response was blocked — the caller handles it as a
  // connection error, NOT as an API validation failure.
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: CREDENTIALS,
  });

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractErrorMessage(res.status, data), data);
  }

  // Body shape is defined by the caller's generic parameter.
  return data as T;
}

export async function getJson<T = unknown>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, { credentials: CREDENTIALS });

  const data: unknown = await res.json();

  if (!res.ok) {
    const detail =
      data && typeof data === 'object'
        ? (data as { detail?: unknown; message?: unknown }).detail ??
          (data as { message?: unknown }).message
        : undefined;
    const message =
      detail || `Request failed with status ${res.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  // Body shape is defined by the caller's generic parameter.
  return data as T;
}