/* ------------------------------------------------------------------ */
/*  Centralized Interview Status Service                               */
/*  SINGLE source of truth mapping the backend interview_status        */
/*  value to the existing beautiful UI labels & lifecycle types.       */
/*  Backend values are authoritative; the UI is only a representation. */
/*  There is NO frontend-only interview state here.                    */
/* ------------------------------------------------------------------ */

import { InterviewStatus, type InterviewStatusType } from '../constants/interviewStatus';
import { verifyInterviewCode, submitInterviewReport } from './applications';

/* ------------------------------------------------------------------ */
/*  Backend interview_status values actually used by the backend       */
/* ------------------------------------------------------------------ */

export type BackendInterviewStatus =
  | 'Not Started'
  | 'In Progress'
  | 'Completed'
  | 'Expired'
  | 'Abandoned'
  | 'Violated'
  | 'Terminated'
  | null;

export interface MappedInterviewStatus {
  key: BackendInterviewStatus;
  /** Type consumed by StatusBadge / ApplicationTracker. */
  interview: InterviewStatusType;
  /** Human label used in plain-text status chips/tables. */
  label: string;
}

/* ------------------------------------------------------------------ */
/*  Central mapping (backend value -> UI)                              */
/* ------------------------------------------------------------------ */

export const INTERVIEW_STATUS_MAP: Record<string, MappedInterviewStatus> = {
  'Not Started': {
    key: 'Not Started',
    interview: InterviewStatus.INTERVIEW_SCHEDULED,
    label: 'Interview Scheduled',
  },
  'In Progress': {
    key: 'In Progress',
    interview: InterviewStatus.INTERVIEW_IN_PROGRESS,
    label: 'Interview In Progress',
  },
  Completed: {
    key: 'Completed',
    interview: InterviewStatus.INTERVIEW_COMPLETED,
    label: 'Interview Completed',
  },
  Expired: {
    key: 'Expired',
    interview: InterviewStatus.INTERVIEW_EXPIRED,
    label: 'Interview Expired',
  },
  Abandoned: {
    key: 'Abandoned',
    interview: InterviewStatus.INTERVIEW_ABANDONED,
    label: 'Interview Abandoned',
  },
  Violated: {
    key: 'Violated',
    interview: InterviewStatus.INTERVIEW_VIOLATED,
    label: 'Interview Violated',
  },
  Terminated: {
    key: 'Terminated',
    interview: InterviewStatus.INTERVIEW_TERMINATED,
    label: 'Interview Terminated',
  },
};

/** Strictly normalize a raw backend value to the known set (or null). */
export function normalizeInterviewStatus(status?: string | null): BackendInterviewStatus {
  const s = (status || '').trim();
  return (INTERVIEW_STATUS_MAP[s] ? s : null) as BackendInterviewStatus;
}

/* ------------------------------------------------------------------ */
/*  Terminal states (server-owned)                                     */
/*  An interview in one of these states is OVER server-side: it must   */
/*  never be resumed as a live interview or completed by submitting a  */
/*  report (the backend refuses that for 'Violated'/'Terminated').      */
/* ------------------------------------------------------------------ */

/** Proctoring-terminated by the server (3-warning / terminating event). */
export const PROCTORING_TERMINATED_STATUSES: BackendInterviewStatus[] = ['Violated', 'Terminated'];

export const TERMINAL_INTERVIEW_STATUSES: BackendInterviewStatus[] = [
  'Completed',
  'Expired',
  'Abandoned',
  ...PROCTORING_TERMINATED_STATUSES,
];

/** Map a backend interview_status value to a UI type + label. */
export function mapInterviewStatus(status?: string | null): MappedInterviewStatus {
  const s = normalizeInterviewStatus(status);
  if (s && INTERVIEW_STATUS_MAP[s]) return INTERVIEW_STATUS_MAP[s];
  // Fallback: no/unknown interview state -> treat like a shortlisted application.
  return {
    key: null,
    interview: InterviewStatus.RESUME_ACCEPTED,
    label: 'Resume Accepted',
  };
}


/* ------------------------------------------------------------------ */
/*  Persistence actions                                                */
/*  Backend is authoritative — these only persist real state changes.  */
/* ------------------------------------------------------------------ */

/** Persist interview START. The backend transitions the application to
 *  'In Progress' and stores interview_started_at (verify-interview-code).
 *  Errors are swallowed so a live/demo interview is never blocked. */
export async function markInterviewStarted(codeOrApplicationId: string, applicantId?: string): Promise<void> {
  try {
    await verifyInterviewCode(codeOrApplicationId, applicantId);
  } catch {
    /* demo fallback — backend remains the source of truth */
  }
}

/** 'In Progress' is persisted by the same verify endpoint; this is an
 *  idempotent re-confirmation for call sites that track the phase. */
export async function markInterviewInProgress(codeOrApplicationId: string, applicantId?: string): Promise<void> {
  try {
    await verifyInterviewCode(codeOrApplicationId, applicantId);
  } catch {
    /* demo fallback — backend remains the source of truth */
  }
}

export interface SubmitInterviewPayload {
  application_id: number;
  domain: string;
  answers: Record<string, unknown[]>;
  analysis: Record<string, unknown[]>;
  applicant_id?: string;
}

/** Persist the completed interview + report. Resolves `{ success: true }`
 *  ONLY after the backend confirms (`{"success": true}`). The UI must gate
 *  its 'Completed'/success transition on this result.
 *
 *  `terminated: true` means the SERVER refused the submission because
 *  proctoring already ended the interview — the caller must show the
 *  terminated state instead of retrying. */
export async function submitInterview(
  payload: SubmitInterviewPayload
): Promise<{ success: boolean; terminated?: boolean; reason?: string }> {
  try {
    const res = (await submitInterviewReport(payload)) as {
      success?: boolean;
      terminated?: boolean;
      reason?: string;
      error?: string;
    };
    return {
      success: res.success === true,
      terminated: res.terminated === true,
      reason: res.reason,
    };
  } catch {
    return { success: false };
  }
}
