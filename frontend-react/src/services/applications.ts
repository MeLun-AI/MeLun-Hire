/* ------------------------------------------------------------------ */
/*  Applications service (shared between Applicant + HR pages)          */
/*  Single source for real application reads and the HR status action.  */
/* ------------------------------------------------------------------ */

import { getJson, postJson, API_BASE } from './api';
import {
  mapApplicationStatus,
  normalizeBackendStatus,
  type BackendApplicationStatus,
  type MappedApplicationStatus,
} from './applicationStatus';
import { mapInterviewStatus, normalizeInterviewStatus } from './InterviewStatusService';
import { InterviewStatus, type InterviewStatusType } from '../constants/interviewStatus';

/* ------------------------------------------------------------------ */
/*  FINAL POST-INTERVIEW DECISION (backend `final_decision`)           */
/*  One value per application: 'selected' | 'rejected' | null.         */
/*  The backend owns it; the UI only represents it.                    */
/* ------------------------------------------------------------------ */

export type FinalDecision = 'selected' | 'rejected';

/** Normalize the backend `final_decision` value ('selected' | 'rejected'). */
export function normalizeFinalDecision(value?: string | null): FinalDecision | null {
  const v = (value || '').trim().toLowerCase();
  return v === 'selected' || v === 'rejected' ? (v as FinalDecision) : null;
}

/** Badge/tracker type for a decision — reuses the central status vocabulary. */
export function finalDecisionStatus(value?: string | null): InterviewStatusType | null {
  const decision = normalizeFinalDecision(value);
  if (decision === 'selected') return InterviewStatus.SELECTED;
  if (decision === 'rejected') return InterviewStatus.REJECTED;
  return null;
}

/** Applicant-facing wording for a decision (matches the decision email). */
export function finalDecisionLabel(value?: string | null): string {
  const decision = normalizeFinalDecision(value);
  if (decision === 'selected') return 'Selected';
  if (decision === 'rejected') return 'Not Selected';
  return '';
}

/** How the decision was made: 'automatic' (50% rule) | 'manual' (recruiter). */
export function finalDecisionSourceLabel(source?: string | null): string {
  const s = (source || '').trim().toLowerCase();
  if (s === 'automatic') return 'Automatic';
  if (s === 'manual') return 'Manual';
  return '';
}

export interface ApplicantApplication {
  applicationId: number;
  jobId: number | null;
  jobTitle: string;
  company: string;
  appliedOn: string;
  backendStatus: BackendApplicationStatus;
  /** Mapped display status (lifecycle-aware) for StatusBadge / ApplicationTracker. */
  status: InterviewStatusType;
  /** Mapped human label for plain-text status chips. */
  statusLabel: string;
  interviewStatus?: string | null;
  interviewCode?: string | null;
  interviewExpiresAt?: string | null;
  interviewStartedAt?: string | null;
  interviewCompletedAt?: string | null;
  reissueRequested?: boolean;
  hasReport: boolean;
  /** Final post-interview outcome, recorded by the HR (or automatically). */
  finalDecision?: FinalDecision | null;
  finalDecisionAt?: string | null;
}

export interface HrApplication {
  application_id: number;
  applicant_id: string;
  full_name: string;
  email: string;
  job_title: string;
  job_domain: string;
  status: string;
  applied_at: string | null;
  interview_code: string | null;
  interview_status: string | null;
  interview_expires_at: string | null;
  reissue_requested: number;
  reissue_count: number;
  /** Final post-interview outcome + how it was made (additive backend fields). */
  final_decision?: FinalDecision | null;
  final_decision_source?: 'automatic' | 'manual' | null;
  final_decision_score?: number | null;
}

/** True when the backend `interview_status` describes a REAL interview for the
 *  application.
 *
 *  The backend stores its default `'Not Started'` on EVERY application row
 *  (see `db_migrate.py`), so `'Not Started'` only means "an interview exists"
 *  once an access code was actually issued. Every other value is written by the
 *  backend after the interview really started, so it is authoritative alone.
 *
 *  `hasInterviewCode` accepts either the code itself (a non-empty string) or a
 *  boolean so both call styles stay typo-proof.
 */
export function hasRealInterviewState(
  interviewStatus: string | null | undefined,
  hasInterviewCode: string | boolean | null | undefined
): boolean {
  const state = normalizeInterviewStatus(interviewStatus);
  if (!state) return false;
  return state !== 'Not Started' || Boolean(hasInterviewCode);
}

/** Derive the full display lifecycle status from BOTH the application
 *  `status` AND the backend `interview_status`.
 *  The application `status` is authoritative; the interview state only refines
 *  it when the backend really has an interview (see `hasRealInterviewState`).
 *
 *  pending                        -> Under Review
 *  rejected                       -> Rejected
 *  approved + no code             -> Resume Accepted (Shortlisted)
 *  approved + code (Not Started)  -> Interview Scheduled
 *  interview In Progress          -> Interview In Progress
 *  interview Completed            -> Interview Completed
 *  interview Expired/Abandoned/... -> mapped terminal state
 */
export function deriveApplicationStatus(
  baseStatus: string | null | undefined,
  interviewStatus: string | null | undefined,
  hasInterviewCode: boolean | null | undefined,
  finalDecision?: string | null
): MappedApplicationStatus {
  /* A recorded final decision is the OUTCOME of the completed interview, so it
   * wins over the interview lifecycle state (the interview stays 'Completed').
   * The backend value is authoritative — the UI never guesses a decision. */
  const decided = finalDecisionStatus(finalDecision);
  if (decided) {
    return { key: normalizeBackendStatus(baseStatus), interview: decided, label: decided };
  }

  const mappedApp = mapApplicationStatus(baseStatus);

  // Interview state refines the application status only when the backend
  // really has an interview for this application.
  if (hasRealInterviewState(interviewStatus, hasInterviewCode)) {
    const m = mapInterviewStatus(interviewStatus);
    return { key: mappedApp.key, interview: m.interview, label: m.label };
  }

  // No interview started yet: approved + code present => Scheduled.
  if (mappedApp.key === 'approved' && hasInterviewCode) {
    return {
      key: 'approved',
      interview: InterviewStatus.INTERVIEW_SCHEDULED,
      label: 'Interview Scheduled',
    };
  }

  return mappedApp;
}

/** Fetch the applications that belong ONLY to this applicant. */
export async function fetchMyApplications(applicantId: string): Promise<ApplicantApplication[]> {
  const data = await getJson(`/applicant/applied-positions/${applicantId}`);
  if (!Array.isArray(data)) return [];

  const apps: ApplicantApplication[] = data.map((r: Record<string, unknown>) => {
    const interviewStatus = (r.interview_status as string) ?? null;
    const finalDecision = normalizeFinalDecision(r.final_decision as string | null);
    const derived = deriveApplicationStatus(
      r.status as string,
      interviewStatus,
      Boolean(r.interview_code as string | null),
      finalDecision
    );
    return {
      applicationId: Number(r.application_id),
      jobId: typeof r.job_id === 'number' ? r.job_id : null,
      jobTitle: (r.job_title as string) || 'Position',
      company: (r.company as string) || '',
      appliedOn: (r.applied_date as string) || '',
      backendStatus: normalizeBackendStatus(r.status as string),
      status: derived.interview,
      statusLabel: derived.label,
      interviewStatus,
      interviewCode: (r.interview_code as string) ?? null,
      interviewExpiresAt: (r.interview_expires_at as string) ?? null,
      interviewStartedAt: (r.interview_started_at as string) ?? null,
      interviewCompletedAt: (r.interview_completed_at as string) ?? null,
      reissueRequested: Boolean(r.reissue_requested),
      hasReport: Boolean(r.has_report),
      finalDecision,
      finalDecisionAt: (r.final_decision_at as string) ?? null,
    };
  });

  return apps.sort((a, b) => {
    const byDate = new Date(b.appliedOn).getTime() - new Date(a.appliedOn).getTime();
    return byDate || b.applicationId - a.applicationId;
  });
}

/** Fetch applications submitted to the jobs owned by this HR. */
export async function fetchHrApplications(hrId: number): Promise<HrApplication[]> {
  const data = await getJson(`/hr/applicants/${hrId}`);
  return Array.isArray(data) ? (data as HrApplication[]) : [];
}

/** Approve or reject an application — persisted by the backend. */
export async function updateApplicationStatus(
  applicationId: number,
  status: 'approved' | 'rejected'
): Promise<void> {
  await postJson('/hr/applicant/status', { application_id: applicationId, status });
}

/** Outcome of a bulk approve/reject request. `skipped` lists the applications
 *  that could not be changed (unknown id, or a job post of another company). */
export interface BulkApplicationStatusResult {
  updated: number[];
  skipped: number[];
}

/** Approve or reject SEVERAL applications in ONE authorized request.
 *
 *  The backend validates every id against the signed-in HR, so an unknown or
 *  foreign application is reported in `skipped` instead of being modified. */
export async function bulkUpdateApplicationStatus(
  applicationIds: number[],
  status: 'approved' | 'rejected'
): Promise<BulkApplicationStatusResult> {
  return postJson<BulkApplicationStatusResult>('/hr/applicant/status/bulk', {
    application_ids: applicationIds,
    status,
  });
}

/* ------------------------------------------------------------------ */
/*  FINAL POST-INTERVIEW DECISION (HR)                                 */
/*  One decision per completed interview, recorded ONCE by the backend. */
/* ------------------------------------------------------------------ */

export interface RecordFinalDecisionResult {
  /** 'recorded' | 'already_decided' (both = stored and safe to show). */
  status: string;
  application_id: number;
  final_decision: FinalDecision | null;
  final_decision_source: 'automatic' | 'manual' | null;
  final_decision_score: number | null;
  already_decided: boolean;
  /** False = the decision IS stored but the candidate email could not be sent. */
  email_sent: boolean;
  message?: string;
}

/** Record the FINAL decision for a completed interview (SELECT / REJECT).
 *
 *  Idempotent server-side: refreshing or retrying never creates a second
 *  decision and never sends a second email. A 409 means the interview is not
 *  completed yet or the opposite decision already exists — the caller shows
 *  `err.message` (the backend's own explanation). */
export async function recordFinalDecision(
  applicationId: number,
  decision: FinalDecision
): Promise<RecordFinalDecisionResult> {
  return postJson('/hr/applicant/decision', {
    application_id: applicationId,
    decision,
  });
}

/** One candidate of a bulk decision request that could NOT be decided. */
export interface BulkDecisionSkipped {
  application_id: number;
  /** Backend reason: 'not_completed' | 'not_found' | 'conflict' | 'invalid'. */
  reason: string;
}

/** Outcome of a bulk final-decision request. */
export interface BulkRecordFinalDecisionResult {
  /** Applications whose decision is stored (including already-decided rows). */
  recorded: number[];
  skipped: BulkDecisionSkipped[];
  /** How many of the recorded decisions produced a real candidate email. */
  email_sent: number;
}

/** Record the FINAL decision for SEVERAL completed interviews in ONE request.
 *
 *  Every candidate passes through the same server-side rules as the
 *  single-record action (ownership, interview completed, write-once, one
 *  email); a candidate that cannot be decided is reported in `skipped` with
 *  its reason instead of failing the whole request. */
export async function bulkRecordFinalDecision(
  applicationIds: number[],
  decision: FinalDecision
): Promise<BulkRecordFinalDecisionResult> {
  return postJson<BulkRecordFinalDecisionResult>('/hr/applicant/decision/bulk', {
    application_ids: applicationIds,
    decision,
  });
}

/** Whether completed interviews are decided automatically for this HR. */
export async function fetchAutoDecideCandidates(hrId: number): Promise<boolean> {
  const data = await getJson<{ auto_decide_candidates?: boolean }>(
    `/hr/auto-decide-candidates/${hrId}`
  );
  return Boolean(data?.auto_decide_candidates);
}

/** Persist the automatic-decisions switch (returns the stored value). */
export async function saveAutoDecideCandidates(hrId: number, enabled: boolean): Promise<boolean> {
  const data = (await postJson('/hr/auto-decide-candidates', {
    enabled,
    hr_id: hrId,
  })) as { auto_decide_candidates?: boolean };
  return Boolean(data?.auto_decide_candidates);
}

/* ------------------------------------------------------------------ */
/*  Real counters derived from the applicant's applications            */
/* ------------------------------------------------------------------ */

export interface ApplicantCounters {
  totalApplications: number;
  shortlisted: number;
  underReview: number;
  rejected: number;
  currentStatusLabel: string;
  /* ---- Real interview lifecycle counters (STEP 17) ---- */
  interviewsScheduled: number;
  interviewsInProgress: number;
  interviewsCompleted: number;
  interviewsExpired: number;
  reissueRequested: number;
}

export function deriveApplicantCounters(apps: ApplicantApplication[]): ApplicantCounters {
  /* Interview counters use the derived lifecycle status — the same value the
     status badge shows — so applications that never had an interview (the
     backend default 'Not Started' without a code) are never counted. */
  const hasStatus = (a: ApplicantApplication, status: InterviewStatusType) => a.status === status;

  return {
    totalApplications: apps.length,
    shortlisted: apps.filter((a) => a.backendStatus === 'approved').length,
    underReview: apps.filter((a) => a.backendStatus === 'pending').length,
    rejected: apps.filter((a) => a.backendStatus === 'rejected').length,
    currentStatusLabel: apps.length ? apps[0].statusLabel : 'No applications yet',
    interviewsScheduled: apps.filter((a) => hasStatus(a, InterviewStatus.INTERVIEW_SCHEDULED)).length,
    interviewsInProgress: apps.filter((a) => hasStatus(a, InterviewStatus.INTERVIEW_IN_PROGRESS)).length,
    interviewsCompleted: apps.filter((a) => hasStatus(a, InterviewStatus.INTERVIEW_COMPLETED) && a.hasReport).length,
    interviewsExpired: apps.filter((a) => hasStatus(a, InterviewStatus.INTERVIEW_EXPIRED)).length,
    reissueRequested: apps.filter((a) => a.reissueRequested).length,
  };
}

/* ------------------------------------------------------------------ */
/*  Real interview lifecycle API (persisted by the backend)            */
/* ------------------------------------------------------------------ */

export interface VerifyInterviewResult {
  valid: boolean;
  reason?: string;
  application_id?: number;
  job_domain?: string;
  can_request_reissue?: boolean;
  /** Authoritative UTC start time of THIS interview (set once by the backend). */
  interview_started_at?: string | null;
}

/** Verify the applicant's interview code against the backend. The backend
 *  transitions the interview to In Progress and stores interview_started_at.
 *  Pass the authenticated applicant_id so the backend can verify ownership. */
export async function verifyInterviewCode(code: string, applicantId?: string): Promise<VerifyInterviewResult> {
  return postJson('/applicant/verify-interview-code', {
    interview_code: code,
    ...(applicantId ? { applicant_id: applicantId } : {}),
  });
}

/** Applicant requests a reissue (allowed by backend only when Expired). */
export async function requestReissue(applicationId: number): Promise<{ success: boolean; reason?: string }> {
  return postJson('/applicant/request-reissue', { application_id: applicationId });
}

/** Persist the completed interview + report BEFORE showing success (STEP 6). */
export async function submitInterviewReport(payload: {
  application_id: number;
  domain: string;
  answers: Record<string, unknown[]>;
  analysis: Record<string, unknown[]>;
  applicant_id?: string;
}): Promise<{ success: boolean }> {
  return postJson('/interview/submit-report', payload);
}

/** Persist a terminated / abandoned interview to the backend (STEP 14/15).
 *  Note: 'violated' is authority-limited — the server records the event and
 *  decides termination (see reportProctoringEvent). It is kept only for
 *  backwards compatibility. */
export async function persistTermination(
  applicationId: number,
  kind: 'violated' | 'abandoned'
): Promise<{ success: boolean }> {
  const endpoint = kind === 'violated' ? '/interview/violate' : '/interview/abandon';
  return postJson(endpoint, { application_id: applicationId });
}

/* ------------------------------------------------------------------ */
/*  Server-authoritative proctoring (Phase 3)                          */
/*  The browser detects signals and REPORTS them; the backend owns the  */
/*  warning count, the violation state and performance termination.     */
/* ------------------------------------------------------------------ */

/** Event types the backend accepts. */
export type ProctoringEventType =
  | 'browser_minimized'
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'multiple_faces'
  | 'face_missing'
  | 'camera_blocked'
  | 'manual';

export interface ProctoringServerState {
  success?: boolean;
  accepted?: boolean;
  duplicate?: boolean;
  event_type?: ProctoringEventType;
  application_id?: number;
  warning_count: number;
  warnings_remaining: number;
  max_warnings: number;
  terminated: boolean;
  can_continue: boolean;
  interview_status?: string | null;
  violations?: { event_type: string; warning_number: number; created_at: string }[];
}

/** Report ONE observed proctoring violation. The response is the authoritative
 *  server state — the UI must follow it rather than its own local counter. */
export async function reportProctoringEvent(
  applicationId: number,
  eventType: ProctoringEventType,
  clientTimestamp?: string
): Promise<ProctoringServerState> {
  return postJson('/interview/proctoring-event', {
    application_id: applicationId,
    event_type: eventType,
    ...(clientTimestamp ? { client_timestamp: clientTimestamp } : {}),
  });
}

/** Re-read the authoritative proctoring state (used when resuming). */
export async function fetchProctoringState(applicationId: number): Promise<ProctoringServerState> {
  return getJson(`/interview/proctoring-state/${applicationId}`);
}

/** Low-frequency liveness ping so the backend knows this interview is still
 *  running (the abandoned-interview cleanup uses `last_seen`). Sent every
 *  60s while an interview is open — never per frame. */
export async function sendInterviewHeartbeat(applicationId: number): Promise<{ ok: boolean }> {
  return postJson('/interview/heartbeat', { application_id: applicationId });
}

/** HR generates a NEW interview code (reissue approval) — persisted by backend. */
export async function regenerateInterviewCode(
  applicationId: number
): Promise<{ interview_code: string; expires_at: string }> {
  return postJson('/hr/applicant/regenerate-interview-code', { application_id: applicationId });
}

/** HR resets the interview expiry (reissue approval) — persisted by backend. */
export async function resetInterviewExpiry(applicationId: number): Promise<Record<string, unknown>> {
  return postJson('/hr/applicant/reset-expiry', { application_id: applicationId });
}

/* ------------------------------------------------------------------ */
/*  Reports (HR + applicant, backend-verified ownership)               */
/* ------------------------------------------------------------------ */

export interface HrRoundDetail {
  label: string;
  question_count: number;
  weight_percent: number;
  average_out_of_10: number;
  average_percent: number;
  questions: {
    question_number: number;
    answer: string;
    score_out_of_10: number;
    score_percent: number;
    technical_accuracy: number;
    problem_solving: number;
    communication: number;
    confidence: number;
    strengths: string[];
    improvements: string[];
    summary: string;
    recommendation: string;
  }[];
}

export interface HrInterviewReportData {
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  job_domain: string;
  completed_at: string;
  interview_started_at?: string | null;
  interview_completed_at?: string | null;
  total_questions: number;
  scoring_scale: string;
  overall_score: number;
  verdict: string;
  reliability_note: string;
  primary_improvement_area: string;
  rounds: Record<string, HrRoundDetail>;
}

export interface ApplicantInterviewReportData {
  application_id: number;
  job_title: string;
  company: string;
  job_domain: string;
  completed_at: string;
  overall_score: number;
  final_result: string;
  rounds: Record<string, { label: string; question_count: number; average_out_of_10: number; average_percent: number }>;
  skills: { name: string; score: number }[];
  strengths: string[];
  improvements: string[];
  feedback: { round: string; question: string; answer: string; summary: string }[];
  questions_answered: number;
}

/** HR report — the backend verifies the job belongs to hr_id. */
export async function fetchHrInterviewReport(
  applicationId: number,
  hrId: number
): Promise<HrInterviewReportData> {
  return getJson(`/hr/interview-report/${applicationId}?hr_id=${hrId}`);
}

/** Applicant report — the backend verifies the application belongs to applicant_id. */
export async function fetchApplicantInterviewReport(
  applicationId: number,
  applicantId: string
): Promise<ApplicantInterviewReportData> {
  return getJson(`/applicant/interview-report/${applicationId}?applicant_id=${encodeURIComponent(applicantId)}`);
}

/* ------------------------------------------------------------------ */
/*  Notifications (real backend data; read/unread persisted server-side) */
/* ------------------------------------------------------------------ */

export interface NotificationItem {
  id: number;
  application_id?: number | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function fetchApplicantNotifications(applicantId: string): Promise<NotificationItem[]> {
  return getJson(`/applicant/notifications/${encodeURIComponent(applicantId)}`);
}

export async function markApplicantNotificationRead(id: number): Promise<{ success: boolean }> {
  return postJson(`/applicant/notifications/read/${id}`, {});
}

export async function markAllApplicantNotificationsRead(applicantId: string): Promise<{ success: boolean }> {
  return postJson(`/applicant/notifications/read-all/${encodeURIComponent(applicantId)}`, {});
}

export async function fetchHrNotifications(hrId: number): Promise<NotificationItem[]> {
  return getJson(`/hr/notifications/${hrId}`);
}

export async function markHrNotificationRead(id: number): Promise<{ success: boolean }> {
  return postJson(`/hr/notifications/read/${id}`, {});
}

export async function markAllHrNotificationsRead(hrId: number): Promise<{ success: boolean }> {
  return postJson(`/hr/notifications/read-all/${hrId}`, {});
}

/* ------------------------------------------------------------------ */
/*  Resume upload + analysis (real backend data)                       */
/*  Connected to the existing /applicant/upload-resume flow.           */
/* ------------------------------------------------------------------ */

export interface ResumeSubscore {
  label: string;
  score: number;
}

export interface ResumeAnalysis {
  filename: string;
  stored_name: string;
  score: number;
  subscores: ResumeSubscore[];
  skills: string[];
  suggestions: string[];
  created_at: string;
}

/** Upload a resume (PDF/DOCX) for the applicant and return the analysis. */
export async function uploadResume(applicantId: string, file: File): Promise<ResumeAnalysis> {
  const form = new FormData();
  form.append('applicant_id', applicantId);
  form.append('file', file);

  const res = await fetch(`${API_BASE}/applicant/upload-resume`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });

  const data = await res.json();

  if (!res.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `Upload failed with status ${res.status}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data as ResumeAnalysis;
}

/** Fetch the applicant's saved resume analysis, or null if none exists. */
export async function fetchResumeAnalysis(applicantId: string): Promise<ResumeAnalysis | null> {
  const data = await getJson(`/applicant/resume/${encodeURIComponent(applicantId)}`);
  if (!data || typeof data !== 'object' || !('score' in data)) return null;
  return data as ResumeAnalysis;
}