import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, postJson, API_BASE } from '../services/api';
import HrLayout from '../components/hr/HrLayout';
import { bulkUpdateApplicationStatus, finalDecisionLabel } from '../services/applications';
import {
  CalendarIcon,
  ChartIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  DocumentIcon,
  DownloadIcon,
  SearchIcon,
  SendIcon,
  TargetIcon,
} from '../components/hr/HrIcons';
import { BulkActionButton, BulkSelectBar, RowCheckbox } from '../components/hr/BulkSelectBar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface Applicant {
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
  code_email_sent: number;
  /**
   * How the delivered interview code went out. 'automatic' = the backend sent
   * it when this newly matched candidate applied (HR had automatic interview
   * codes on), 'manual' = HR clicked Send Interview Code. null = not delivered.
   */
  code_send_method: 'automatic' | 'manual' | null;
  resume_filename: string | null;
  /** Authoritative match status of this attempt, for THIS job (backend value). */
  match_status: 'matched' | 'unmatched';
  /** Apply-time match score; null when the evaluation could not run. */
  match_score: number | null;
  /** Comma-separated required skills the candidate did not evidence. */
  match_missing_skills: string;
  /** Final post-interview decision: 'selected' | 'rejected' | null (undecided). */
  final_decision?: 'selected' | 'rejected' | null;
  /** How it was made: 'automatic' (50% rule) | 'manual' (this HR decided). */
  final_decision_source?: 'automatic' | 'manual' | null;
  /** The interview score the decision was made on (null when no scored report). */
  final_decision_score?: number | null;
}

interface ApplicantProfile {
  full_name: string;
  email: string;
  phone: string | null;
  experience: string | null;
  skills: string | null;
  location: string | null;
  profile_pic: string | null;
}

interface ResumeReport {
  full_name: string;
  email: string;
  job_title: string;
  job_domain: string;
  resume_status: string;
  interview_status: string | null;
  matched: boolean | null;
  matched_skills: string | null;
  resume_filename: string | null;
  /** Full evaluation produced by the existing resume-matching engine. */
  report?: {
    match_score?: number;
    gaps?: string[];
  } | null;
}

interface InterviewReport {
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  job_domain: string;
  completed_at: string;
  total_questions: number;
  scoring_scale: string;
  overall_score: number;
  verdict: string;
  reliability_note: string;
  primary_improvement_area: string;
  rounds: Record<string, {
    label: string;
    question_count: number;
    weight_percent: number;
    average_out_of_10: number;
    average_percent: number;
    questions: Array<{
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
    }>;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Split a stored comma-separated skill list into clean chips. */
function parseSkillChips(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status, type }: { status: string; type: 'hr' | 'interview' | 'decision' }) {
  const s = status.toLowerCase();
  let cls = 'bg-white/10 text-gray-300 border border-white/10';

  if (type === 'hr') {
    if (s === 'pending') cls = 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
    else if (s === 'approved') cls = 'bg-green-500/15 text-green-300 border border-green-500/30';
    else if (s === 'rejected') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
  } else if (type === 'decision') {
    /* Final post-interview outcome (backend `final_decision`). */
    if (s === 'selected') cls = 'bg-green-500/15 text-green-300 border border-green-500/30';
    else if (s === 'rejected' || s === 'not selected') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
  } else {
    if (s === 'not started') cls = 'bg-gray-500/15 text-gray-300 border border-gray-500/30';
    else if (s === 'in progress') cls = 'bg-blue-500/15 text-blue-300 border border-blue-500/30';
    else if (s === 'completed') cls = 'bg-green-500/15 text-green-300 border border-green-500/30';
    else if (s === 'expired') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
    else if (s === 'abandoned') cls = 'bg-gray-500/15 text-gray-300 border border-gray-500/30';
    else if (s === 'violated') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
  }

  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-3 bg-white/10 rounded w-1/2" />
          <div className="h-3 bg-white/10 rounded w-1/4" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirm Dialog                                                     */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-navy-800 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible Question Section                                       */
/* ------------------------------------------------------------------ */

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white hover:bg-white/[0.03] transition-colors"
      >
        {title}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  View Applicant Modal — Professional HR Review Panel               */
/* ------------------------------------------------------------------ */

function ViewApplicantModal({
  applicant,
  hrId,
  onClose,
}: {
  applicant: Applicant;
  hrId?: number;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [resumeReport, setResumeReport] = useState<ResumeReport | null>(null);
  const [interviewReport, setInterviewReport] = useState<InterviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const [prof, resume, interview] = await Promise.all([
          getJson<ApplicantProfile | null>(`/applicant/profile/${applicant.applicant_id}`),
          getJson<(ResumeReport & { error?: string }) | null>(`/hr/resume-report/${applicant.application_id}`).catch(() => null),
          getJson<(InterviewReport & { error?: string }) | null>(`/hr/interview-report/${applicant.application_id}`).catch(() => null),
        ]);
        if (!cancelled) {
          setProfile(prof);
          if (resume && !resume.error) setResumeReport(resume);
          if (interview && !interview.error) setInterviewReport(interview);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile.');
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [applicant.applicant_id, applicant.application_id]);

  /* Helper to color the resume match card */
  const resumeCardCls = (matched: boolean | null) => {
    if (matched === true) return 'bg-green-500/10 border-green-500/30';
    if (matched === false) return 'bg-red-500/10 border-red-500/30';
    return 'bg-yellow-500/10 border-yellow-500/30';
  };

  const resumeLabel = (matched: boolean | null) => {
    if (matched === true) return { text: 'Matched', cls: 'text-green-300' };
    if (matched === false) return { text: 'Not Matched', cls: 'text-red-300' };
    return { text: 'Partial Match', cls: 'text-yellow-300' };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
      <div className="bg-navy-800 border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Sticky header */}
        <div className="sticky top-0 bg-navy-800 border-b border-white/10 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <h2 className="text-lg font-bold text-white">Applicant Details</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-6 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-white/10 rounded w-1/3" />
                  <div className="h-4 bg-white/10 rounded w-1/2" />
                  <div className="h-4 bg-white/10 rounded w-1/4" />
                </div>
              </div>
              <div className="h-32 bg-white/10 rounded-xl" />
              <div className="h-48 bg-white/10 rounded-xl" />
              <div className="h-64 bg-white/10 rounded-xl" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Application status for this attempt (authoritative backend value) */}
          {!loading && !error && (
            <section>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">Application Status</span>
                  {applicant.match_status === 'unmatched' ? (
                    <span className="text-yellow-200 font-semibold">Unmatched</span>
                  ) : (
                    <span className="text-green-300 font-semibold">Matched</span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-gray-500">Applied for</span>
                  <span className="text-gray-200 font-medium">{applicant.job_title}</span>
                </span>
                {typeof applicant.match_score === 'number' && (
                  <span className="flex items-center gap-2">
                    <span className="text-gray-500">Match Score</span>
                    <span className={`font-bold ${applicant.match_status === 'unmatched' ? 'text-yellow-200' : 'text-green-300'}`}>
                      {applicant.match_score}%
                    </span>
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Profile loaded */}
          {!loading && !error && profile && (
            <>
              {/* ─── SECTION 1: Applicant Information ─── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-primary-light"><ClipboardIcon className="w-4 h-4" /></span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Applicant Information</h3>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-start gap-5">
                    {profile.profile_pic ? (
                      <img
                        src={profile.profile_pic}
                        alt={profile.full_name}
                        className="h-16 w-16 rounded-full object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center text-coral-400 font-bold text-lg shrink-0">
                        {getInitials(profile.full_name)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-bold text-white">{profile.full_name}</p>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500 w-20 shrink-0">Email</span>
                          <span className="text-gray-300 truncate">{profile.email}</span>
                        </div>
                        {profile.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-20 shrink-0">Phone</span>
                            <span className="text-gray-300">{profile.phone}</span>
                          </div>
                        )}
                        {profile.experience !== null && profile.experience !== undefined && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-20 shrink-0">Experience</span>
                            <span className="text-gray-300">{profile.experience} years</span>
                          </div>
                        )}
                        {profile.location && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500 w-20 shrink-0">Location</span>
                            <span className="text-gray-300">{profile.location}</span>
                          </div>
                        )}
                      </div>
                      {profile.skills && (
                        <div className="mt-3">
                          <span className="text-xs text-gray-500">Skills</span>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {profile.skills.split(',').map((s, i) => (
                              <span key={i} className="bg-primary/10 text-primary-light border border-primary/20 rounded-full px-3 py-1 text-xs font-medium">
                                {s.trim()}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* ─── SECTION 2: Resume Evaluation ─── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-primary-light"><DocumentIcon className="w-4 h-4" /></span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Resume Evaluation</h3>
                </div>
                {resumeReport && resumeReport.resume_filename ? (
                  <div className={`border rounded-xl p-5 ${resumeCardCls(resumeReport.matched)}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">Resume Status</p>
                        <p className="text-xs text-gray-400 mt-0.5">Uploaded and analysed</p>
                      </div>
                      <span className={`text-sm font-bold ${resumeLabel(resumeReport.matched).cls}`}>
                        {resumeLabel(resumeReport.matched).text}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <span className="text-gray-400">
                        Filename: <span className="text-gray-300 font-medium">{resumeReport.resume_filename}</span>
                      </span>
                      {hrId && (
                        <button
                          onClick={() =>
                            window.open(
                              `${API_BASE}/hr/applicant-resume/${hrId}/${encodeURIComponent(applicant.applicant_id)}`,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                          className="text-[11px] font-medium text-teal-300 hover:text-white border border-teal-400/30 hover:bg-teal-400/20 px-3 py-1.5 rounded-full transition-colors"
                        >
                          View Resume
                        </button>
                      )}
                    </div>
                    {resumeReport.matched_skills && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-500 mb-2">Matched Skills</p>
                        <div className="flex flex-wrap gap-1.5">
                          {resumeReport.matched_skills.split(',').map((s, i) => (
                            <span key={i} className="bg-green-500/15 text-green-300 border border-green-500/30 rounded-full px-3 py-1 text-xs font-medium">
                              {s.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {typeof resumeReport.report?.match_score === 'number' && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-400">Match Score</span>
                          <div className="flex-1 max-w-[200px] h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${resumeReport.matched === true ? 'bg-green-500' : 'bg-yellow-500'}`}
                              style={{ width: `${Math.max(0, Math.min(100, resumeReport.report.match_score))}%` }}
                            />
                          </div>
                          <span className={`font-bold ${resumeReport.matched === true ? 'text-green-300' : 'text-yellow-300'}`}>
                            {resumeReport.report.match_score}%
                          </span>
                        </div>
                      </div>
                    )}
                    {resumeReport.report?.gaps && resumeReport.report.gaps.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        <p className="text-xs text-gray-500 mb-2">Requirement Gaps</p>
                        <ul className="space-y-1.5">
                          {resumeReport.report.gaps.slice(0, 8).map((gap, i) => (
                            <li key={i} className="text-xs text-gray-300 flex gap-2">
                              <span className="text-yellow-400">•</span>
                              <span>{gap}</span>
                            </li>
                          ))}
                        </ul>
                        {resumeReport.report.gaps.length > 8 && (
                          <p className="text-[11px] text-gray-500 mt-1.5">
                            +{resumeReport.report.gaps.length - 8} more in the full report
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <p className="text-gray-500 text-sm">Resume report not available.</p>
                  </div>
                )}
              </section>

              {/* ─── SECTION 3: Interview Summary ─── */}
              {interviewReport && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-primary-light"><TargetIcon className="w-4 h-4" /></span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Interview Summary</h3>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <div className="bg-navy-900/50 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Overall Score</p>
                        <p className={`text-3xl font-extrabold ${interviewReport.overall_score >= 80 ? 'text-green-400' : interviewReport.overall_score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {interviewReport.overall_score}%
                        </p>
                      </div>
                      <div className="bg-navy-900/50 border border-white/10 rounded-xl p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Verdict</p>
                        <p className={`text-sm font-bold mt-1 ${
                          interviewReport.verdict.toLowerCase().includes('recommend') || interviewReport.verdict.toLowerCase().includes('recommended')
                            ? 'text-green-400' : interviewReport.verdict.toLowerCase().includes('consider')
                            ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          {interviewReport.verdict}
                        </p>
                      </div>
                      <div className="bg-navy-900/50 border border-white/10 rounded-xl p-4">
                        <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Primary Improvement</p>
                        <p className="text-sm font-bold text-white mt-1">{interviewReport.primary_improvement_area}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 italic">{interviewReport.reliability_note}</p>
                  </div>
                </section>
              )}

              {/* ─── SECTION 4: Round Performance ─── */}
              {interviewReport && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-primary-light"><ChartIcon className="w-4 h-4" /></span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Round Performance</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {Object.entries(interviewReport.rounds).map(([key, round]) => (
                      <div key={key} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col">
                        <p className="text-sm font-semibold text-white">{round.label}</p>
                        <div className="mt-2 flex items-baseline gap-1">
                          <span className={`text-2xl font-extrabold ${
                            round.average_percent >= 70 ? 'text-green-400' : round.average_percent >= 50 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {round.average_percent}%
                          </span>
                          <span className="text-xs text-gray-500">avg</span>
                        </div>
                        <div className="mt-1 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              round.average_percent >= 70 ? 'bg-green-500' : round.average_percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${round.average_percent}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                          <span>Weight: {round.weight_percent}%</span>
                          <span>·</span>
                          <span>{round.question_count} questions</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ─── SECTION 5: Question Analysis ─── */}
              {interviewReport && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-primary-light text-sm">❓</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Question Analysis</h3>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(interviewReport.rounds).map(([roundKey, round]) => (
                      round.questions.map((q) => (
                        <CollapsibleSection
                          key={`${roundKey}-${q.question_number}`}
                          title={`${round.label} · Q${q.question_number} — Score ${q.score_out_of_10}/10`}
                        >
                          <div className="space-y-3 text-sm">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Candidate Answer</p>
                              <p className="text-gray-300 bg-navy-900/50 rounded-lg p-3 border border-white/5">{q.answer || 'No answer provided'}</p>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="bg-navy-900/50 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase">Score</p>
                                <p className="text-lg font-bold text-white">{q.score_out_of_10}/10</p>
                              </div>
                              <div className="bg-navy-900/50 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase">Technical Acc.</p>
                                <p className="text-lg font-bold text-white">{q.technical_accuracy}/10</p>
                              </div>
                              <div className="bg-navy-900/50 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase">Problem Solving</p>
                                <p className="text-lg font-bold text-white">{q.problem_solving}/10</p>
                              </div>
                              <div className="bg-navy-900/50 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase">Communication</p>
                                <p className="text-lg font-bold text-white">{q.communication}/10</p>
                              </div>
                              <div className="bg-navy-900/50 rounded-lg p-3 border border-white/5">
                                <p className="text-[10px] text-gray-500 uppercase">Confidence</p>
                                <p className="text-lg font-bold text-white">{q.confidence}/10</p>
                              </div>
                            </div>

                            {q.strengths && q.strengths.length > 0 && (
                              <div>
                                <p className="text-xs text-green-400 mb-1.5">Strengths</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {q.strengths.map((s, i) => (
                                    <span key={i} className="bg-green-500/10 text-green-300 border border-green-500/20 rounded-full px-3 py-1 text-xs">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {q.improvements && q.improvements.length > 0 && (
                              <div>
                                <p className="text-xs text-orange-400 mb-1.5">Improvements</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {q.improvements.map((s, i) => (
                                    <span key={i} className="bg-orange-500/10 text-orange-300 border border-orange-500/20 rounded-full px-3 py-1 text-xs">
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {q.summary && (
                              <div>
                                <p className="text-xs text-gray-500 mb-1">AI Summary</p>
                                <p className="text-gray-400 text-xs leading-relaxed">{q.summary}</p>
                              </div>
                            )}

                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-xs text-gray-500">Recommendation:</span>
                              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                                q.recommendation?.toLowerCase() === 'strong hire' ? 'bg-green-500/15 text-green-300 border border-green-500/30' :
                                q.recommendation?.toLowerCase() === 'hire' ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30' :
                                q.recommendation?.toLowerCase() === 'consider' ? 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30' :
                                'bg-red-500/15 text-red-300 border border-red-500/30'
                              }`}>
                                {q.recommendation}
                              </span>
                            </div>
                          </div>
                        </CollapsibleSection>
                      ))
                    ))}
                  </div>
                </section>
              )}

              {/* Interview not completed message */}
              {!interviewReport && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <p className="text-gray-500 text-sm">Interview not completed yet.</p>
                </div>
              )}

              {/* No profile fallback */}
              {!profile && (
                <p className="text-gray-500 text-sm">No profile data available.</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Resume Viewer Modal (inline preview; download only on click)        */
/* ------------------------------------------------------------------ */

function ResumeViewerModal({
  applicant,
  hrId,
  onClose,
}: {
  applicant: Applicant;
  hrId: number;
  onClose: () => void;
}) {
  const base = `${API_BASE}/hr/applicant-resume/${hrId}/${encodeURIComponent(applicant.applicant_id)}`;
  const previewUrl = `${base}?preview=1`;
  const downloadUrl = `${base}?download=1`;
  const isPdf = applicant.resume_filename?.toLowerCase().endsWith('.pdf');
  const isDocx = applicant.resume_filename?.toLowerCase().endsWith('.docx');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-navy-900 border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">Resume — {applicant.full_name}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{applicant.resume_filename}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close resume viewer"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden px-5 py-4">
          {isPdf ? (
            <iframe
              src={previewUrl}
              title={`Resume for ${applicant.full_name}`}
              className="w-full h-[62vh] rounded-xl border border-white/10 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-12 px-4">
              <DocumentIcon className="w-12 h-12 text-gray-500 mb-4" />
              <p className="text-sm text-gray-300 font-medium">Resume preview not available in the browser.</p>
              <p className="text-xs text-gray-500 mt-1">
                {isDocx
                  ? 'DOCX files cannot be rendered inline. Use Download Resume to open the file locally.'
                  : 'Use Download Resume to open this file.'}
              </p>
              <a
                href={downloadUrl}
                download
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover px-4 py-2.5 rounded-xl transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                Download Resume
              </a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="text-xs font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl transition-colors"
          >
            Close
          </button>
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-xl transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Download Resume
          </a>
        </div>
      </div>
    </div>
  );
}

export default function HrApplicants() {
  const navigate = useNavigate();

  const [session, setSession] = useState<HrSession | null>(null);

  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedDomain, setSelectedDomain] = useState<string>('All Domains');
  const [selectedJobTitle, setSelectedJobTitle] = useState<string>('All Jobs');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  /* Match section: matched vs unmatched attempts. The backend supplies the
     authoritative match_status for every row, so no guessing happens here. */
  const [matchTab, setMatchTab] = useState<'matched' | 'unmatched'>('matched');

  /* Automatic interview codes: the switch is persisted server-side per HR, so
     this state is only a mirror of the backend value (never the source of
     truth) and is re-read on every page load. */
  const [autoInterviewCodes, setAutoInterviewCodes] = useState(false);
  const [autoCodesSaving, setAutoCodesSaving] = useState(false);

  /* Per-card action loading */
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  /* Toasts */
  const [successMsg, setSuccessMsg] = useState('');
  const [warnMsg, setWarnMsg] = useState('');

  /* Confirm dialogs */
  const [confirmApprove, setConfirmApprove] = useState<Applicant | null>(null);
  const [confirmReject, setConfirmReject] = useState<Applicant | null>(null);
  const [confirmSendCode, setConfirmSendCode] = useState<Applicant | null>(null);
  const [confirmRegenerateCode, setConfirmRegenerateCode] = useState<Applicant | null>(null);

  /* Multi-select for bulk approve/reject. Only pending applications can be
     selected, because approve/reject is only valid while a decision is open. */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'approved' | 'rejected' | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  /* View modal */
  const [viewApplicant, setViewApplicant] = useState<Applicant | null>(null);

  /* Interview link popup */
  const [viewLinkApplicant, setViewLinkApplicant] = useState<Applicant | null>(null);

  /* Resume viewer modal */
  const [resumeApplicant, setResumeApplicant] = useState<{ applicant: Applicant; hrId: number } | null>(null);

  /* ---------- Auth check ---------- */
  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) {
      navigate('/hr/login', { replace: true });
      return;
    }
    try {
      const s: HrSession = JSON.parse(raw);
      if (!s.hr_id) {
        navigate('/hr/login', { replace: true });
        return;
      }
      setSession(s);
    } catch {
      navigate('/hr/login', { replace: true });
    }
  }, [navigate]);

  /* ---------- Fetch applicants ---------- */
  const fetchApplicants = useCallback(() => {
    if (!session?.hr_id) return;
    setLoading(true);
    setError('');
    getJson<Applicant[]>(`/hr/applicants/${session.hr_id}`)
      .then((d) => {
        setApplicants(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load applicants.');
        setLoading(false);
      });
  }, [session?.hr_id]);

  useEffect(() => {
    if (session?.hr_id) fetchApplicants();
  }, [session?.hr_id, fetchApplicants]);

  /* ---------- Automatic interview codes (persisted server-side) ---------- */
  const loadAutoInterviewCodes = useCallback(() => {
    if (!session?.hr_id) return;
    getJson<{ auto_interview_codes?: boolean }>(`/hr/auto-interview-codes/${session.hr_id}`)
      .then((d) => {
        setAutoInterviewCodes(Boolean(d?.auto_interview_codes));
      })
      .catch(() => {
        /* Safe default when the setting cannot be read: OFF. */
        setAutoInterviewCodes(false);
      });
  }, [session?.hr_id]);

  useEffect(() => {
    if (session?.hr_id) loadAutoInterviewCodes();
  }, [session?.hr_id, loadAutoInterviewCodes]);

  const handleToggleAutoInterviewCodes = async () => {
    if (!session?.hr_id || autoCodesSaving) return;
    const next = !autoInterviewCodes;
    setAutoCodesSaving(true);
    try {
      const res = (await postJson('/hr/auto-interview-codes', {
        enabled: next,
        hr_id: session.hr_id,
      })) as { auto_interview_codes?: boolean };
      setAutoInterviewCodes(Boolean(res?.auto_interview_codes));
      if (res?.auto_interview_codes) {
        showSuccess(
          'Automatic interview codes enabled. New matched candidates will receive an interview code automatically.'
        );
      } else {
        showSuccess(
          'Automatic interview codes disabled. Interview codes will need to be sent manually.'
        );
      }
    } catch (err: unknown) {
      /* The backend value stays authoritative - re-read instead of guessing. */
      loadAutoInterviewCodes();
      showError(
        err instanceof Error ? err.message : 'Failed to update automatic interview codes.'
      );
    } finally {
      setAutoCodesSaving(false);
    }
  };

  /* ---------- Handlers ---------- */

  const handleRetry = () => {
    fetchApplicants();
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => setError(''), 4000);
  };

  const showWarn = (msg: string) => {
    setWarnMsg(msg);
    setTimeout(() => setWarnMsg(''), 5000);
  };

  /* ---------- Domains from real data ---------- */
  const domains = useMemo(() => {
    const set = new Set<string>();
    applicants.forEach((a) => {
      if (a.job_domain) set.add(a.job_domain);
    });
    return ['All Domains', ...Array.from(set)];
  }, [applicants]);

  /* ---------- Job titles from real data ---------- */
  const jobTitles = useMemo(() => {
    const set = new Set<string>();
    applicants.forEach((a) => {
      if (a.job_title) set.add(a.job_title);
    });
    return ['All Jobs', ...Array.from(set)];
  }, [applicants]);

  /* ---------- Match groups (real rows, real counts) ---------- */
  /* Rows without an explicit "unmatched" status are the matched/attempted-ok
     group, which is exactly how the backend resolves legacy and pending rows. */
  const matchedApplicants = useMemo(
    () => applicants.filter((a) => a.match_status !== 'unmatched'),
    [applicants]
  );

  const unmatchedApplicants = useMemo(
    () => applicants.filter((a) => a.match_status === 'unmatched'),
    [applicants]
  );

  const tabApplicants = matchTab === 'unmatched' ? unmatchedApplicants : matchedApplicants;

  /* ---------- Filtered list (search + sort + date + domain/job filters) ---------- */
  const visibleApplicants = useMemo(() => {
    let list = tabApplicants;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((a) => a.full_name.toLowerCase().includes(q));
    }

    if (selectedDomain !== 'All Domains') {
      list = list.filter((a) => a.job_domain === selectedDomain);
    }

    if (selectedJobTitle !== 'All Jobs') {
      list = list.filter((a) => a.job_title === selectedJobTitle);
    }

    if (fromDate) {
      const start = new Date(`${fromDate}T00:00:00`);
      list = list.filter((a) => a.applied_at && new Date(a.applied_at) >= start);
    }
    if (toDate) {
      const end = new Date(`${toDate}T23:59:59`);
      list = list.filter((a) => a.applied_at && new Date(a.applied_at) <= end);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      const ta = a.applied_at ? new Date(a.applied_at).getTime() : 0;
      const tb = b.applied_at ? new Date(b.applied_at).getTime() : 0;
      return sortOrder === 'newest' ? tb - ta : ta - tb;
    });
    return sorted;
  }, [tabApplicants, searchQuery, selectedDomain, selectedJobTitle, fromDate, toDate, sortOrder]);

  /* ---------- Multi-select ---------- */
  /* Approve/reject only makes sense while the decision is still open, so
     pending applications are the only rows that offer a checkbox. */
  const selectableApplicants = useMemo(
    () => visibleApplicants.filter((a) => a.status.toLowerCase() === 'pending'),
    [visibleApplicants]
  );

  const selectableIds = useMemo(
    () => selectableApplicants.map((a) => a.application_id),
    [selectableApplicants]
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  };

  const toggleSelected = (applicationId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  };

  /* Drop rows that stopped being selectable (a refresh, a filter/tab change or
     an action that already decided them) so the bulk bar can never act on a
     stale selection. The same Set is returned when nothing changed. */
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => selectableIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  /* ---------- Actions ---------- */

  const handleApprove = async () => {
    if (!confirmApprove) return;
    const app = confirmApprove;
    setActionLoadingId(app.application_id);
    try {
      await postJson('/hr/applicant/status', { application_id: app.application_id, status: 'approved' });
      setConfirmApprove(null);
      fetchApplicants();
      showSuccess('Applicant approved.');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to approve.');
      setConfirmApprove(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async () => {
    if (!confirmReject) return;
    const app = confirmReject;
    setActionLoadingId(app.application_id);
    try {
      await postJson('/hr/applicant/status', { application_id: app.application_id, status: 'rejected' });
      setConfirmReject(null);
      fetchApplicants();
      showSuccess('Applicant rejected.');
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to reject.');
      setConfirmReject(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSendCode = async () => {
    if (!confirmSendCode) return;
    const app = confirmSendCode;
    setActionLoadingId(app.application_id);
    try {
      const res = (await postJson('/hr/applicant/interview-code', {
        application_id: app.application_id,
        job_domain: app.job_domain,
        hr_id: session?.hr_id,
      })) as {
        code_email_sent?: number;
        code_send_method?: 'automatic' | 'manual' | null;
        warning?: string;
      };
      setConfirmSendCode(null);
      // Refresh to sync the newly generated code box and persisted state.
      fetchApplicants();

      // Backend reports whether the interview-code email was actually
      // submitted through SMTP (res.code_email_sent). Update local state so
      // the button reflects the true outcome immediately.
      const sent = res?.code_email_sent ? 1 : 0;
      setApplicants((prev) =>
        prev.map((x) =>
          x.application_id === app.application_id
            ? {
                ...x,
                code_email_sent: sent,
                // Provenance comes from the backend (it never overwrites the
                // original method on a re-send).
                code_send_method: res?.code_send_method ?? x.code_send_method,
              }
            : x
        )
      );

      if (sent) {
        showSuccess('Interview code email sent to applicant.');
      } else if (res?.warning) {
        showWarn(res.warning);
        showError('Interview code email could not be sent.');
      } else {
        showError('Failed to send interview code email.');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to send interview code.');
      setConfirmSendCode(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegenerateCode = async () => {
    if (!confirmRegenerateCode) return;
    const app = confirmRegenerateCode;
    setActionLoadingId(app.application_id);
    try {
      const res = (await postJson('/hr/applicant/regenerate-interview-code', {
        application_id: app.application_id,
      })) as { code_email_sent?: number; warning?: string };
      setConfirmRegenerateCode(null);

      // Reflect the true email outcome for the new code. A reissue is always a
      // manual HR action, and the backend keeps the original method when the
      // code had already been delivered (COALESCE), so mirror that here.
      const sent = res?.code_email_sent ? 1 : 0;
      setApplicants((prev) =>
        prev.map((x) =>
          x.application_id === app.application_id
            ? {
                ...x,
                code_email_sent: sent,
                code_send_method: sent ? (x.code_send_method ?? 'manual') : x.code_send_method,
              }
            : x
        )
      );

      if (sent) {
        showSuccess('Interview code regenerated and emailed.');
      } else if (res?.warning) {
        showWarn(res.warning);
        showError('Interview code regenerated, but email could not be sent.');
      } else {
        showSuccess('Interview code regenerated.');
      }
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to regenerate code.');
      setConfirmRegenerateCode(null);
    } finally {
      setActionLoadingId(null);
    }
  };

  /* Bulk approve/reject — ONE authorized request for the whole selection.
     The backend skips any id it cannot change (never a partial silent write). */
  const handleBulkStatus = async () => {
    if (!bulkStatus || selectedIds.size === 0 || bulkLoading) return;
    setBulkLoading(true);
    const decision = bulkStatus;
    try {
      const res = await bulkUpdateApplicationStatus([...selectedIds], decision);
      setSelectedIds(new Set());
      setBulkStatus(null);
      fetchApplicants();

      const done = res.updated.length;
      const skipped = res.skipped.length;
      if (done === 0) {
        showError('None of the selected applicants could be updated.');
      } else {
        showSuccess(
          `${done} applicant${done === 1 ? '' : 's'} ${
            decision === 'approved' ? 'approved' : 'rejected'
          }.` + (skipped ? ` ${skipped} skipped.` : '')
        );
      }
    } catch (err: unknown) {
      setBulkStatus(null);
      showError(err instanceof Error ? err.message : 'Failed to update the selected applicants.');
    } finally {
      setBulkLoading(false);
    }
  };

  const buildInterviewLink = (code: string) => `http://localhost:5173/interview/${code}`;

  /* ---------- Guard ---------- */
  if (!session) return null;

  return (
    <>
    <HrLayout activePage="applicants">
        <div className="max-w-7xl mx-auto px-6 py-6 md:py-10">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">Applicants</h1>
              <p className="text-gray-500 text-sm mt-1">
                View and manage applicants across job domains
              </p>
              {!loading && applicants.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  {applicants.length} Applicant{applicants.length === 1 ? '' : 's'}
                </p>
              )}
            </div>

            {/* Filters: search, job, domain, sort, date */}
            <div className="flex flex-wrap items-end gap-3">
              {/* Search by name */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Search by name
                </label>
                <div className="relative">
                  <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search applicants..."
                    className="bg-navy-800 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors w-52"
                  />
                </div>
              </div>

              {/* Job filter */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Filter by job
                </label>
                <select
                  value={selectedJobTitle}
                  onChange={(e) => setSelectedJobTitle(e.target.value)}
                  className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                >
                  {jobTitles.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Domain filter */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Filter by domain
                </label>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                >
                  {domains.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Sort by date */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Sort by date
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                  className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                >
                  <option value="newest">Newest to Oldest</option>
                  <option value="oldest">Oldest to Newest</option>
                </select>
              </div>

              {/* From date */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Applied from
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
                />
              </div>

              {/* To date */}
              <div className="shrink-0">
                <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  Applied to
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
          </div>

          {/* Match sections: real counts from the applicant rows */}
          <div
            role="tablist"
            aria-label="Applicant match status"
            className="flex flex-wrap items-center gap-2 mb-6"
          >
            <button
              role="tab"
              aria-selected={matchTab === 'matched'}
              onClick={() => setMatchTab('matched')}
              className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
                matchTab === 'matched'
                  ? 'bg-primary/15 text-primary-light border-primary/40'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              Matched ({matchedApplicants.length})
            </button>
            <button
              role="tab"
              aria-selected={matchTab === 'unmatched'}
              onClick={() => setMatchTab('unmatched')}
              className={`text-sm font-semibold px-4 py-2 rounded-xl border transition-colors ${
                matchTab === 'unmatched'
                  ? 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
              }`}
            >
              Unmatched / Attempted ({unmatchedApplicants.length})
            </button>
          </div>

          {/* Automatic interview codes - shown on the Matched section only.
              The switch lives in the database (per HR), so it survives a
              refresh, a new tab and a re-login. Turning it ON only affects
              candidates matched from that moment on; already matched
              candidates keep their current interview-code status. */}
          {matchTab === 'matched' && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 mb-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">Automatic Interview Codes</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Automatically send an interview code when a new candidate matches this job.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoInterviewCodes}
                aria-label="Automatic interview codes"
                onClick={handleToggleAutoInterviewCodes}
                disabled={autoCodesSaving}
                className={`shrink-0 inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
                  autoInterviewCodes
                    ? 'bg-green-500/15 text-green-300 border-green-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}
              >
                <span
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                    autoInterviewCodes ? 'bg-green-500/70' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      autoInterviewCodes ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </span>
                {autoInterviewCodes ? 'ON' : 'OFF'}
              </button>
            </div>
          )}

          {/* Success toast */}
          {successMsg && (
            <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-2xl text-green-300 text-sm">
              {successMsg}
            </div>
          )}

          {/* Warning toast */}
          {warnMsg && (
            <div className="mb-6 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl text-yellow-200 text-sm">
              {warnMsg}
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <p className="text-red-300 text-sm">{error}</p>
              <button
                onClick={handleRetry}
                className="mt-3 text-sm font-semibold text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-xl transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Loading skeletons */}
          {loading && (
            <div className="space-y-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && visibleApplicants.length === 0 && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <p className="text-gray-500 text-sm">
                {matchTab === 'unmatched'
                  ? 'No unmatched attempts. Every candidate who applies without meeting the job requirements will appear here.'
                  : 'No applicants have applied yet.'}
              </p>
              {selectedDomain !== 'All Domains' && (
                <p className="text-gray-600 text-xs mt-1">No applicants found for this domain.</p>
              )}
            </div>
          )}

          {/* Bulk selection (pending applications only) */}
          {!loading && selectableApplicants.length > 0 && (
            <div className="mb-4">
              <BulkSelectBar
                selectedCount={selectedIds.size}
                selectableCount={selectableApplicants.length}
                allSelected={allSelected}
                onToggleAll={toggleSelectAll}
                onClear={() => setSelectedIds(new Set())}
              >
                <BulkActionButton
                  tone="approve"
                  disabled={bulkLoading}
                  onClick={() => setBulkStatus('approved')}
                >
                  Approve Selected
                </BulkActionButton>
                <BulkActionButton
                  tone="reject"
                  disabled={bulkLoading}
                  onClick={() => setBulkStatus('rejected')}
                >
                  Reject Selected
                </BulkActionButton>
              </BulkSelectBar>
            </div>
          )}

          {/* Applicant cards */}
          {!loading && visibleApplicants.length > 0 && (
            <div className="space-y-4">
              {visibleApplicants.map((a) => {
                const initials = getInitials(a.full_name);
                const hasInterviewCode = !!a.interview_code;
                const isPending = a.status.toLowerCase() === 'pending';
                const isApproved = a.status.toLowerCase() === 'approved';
                const isRejected = a.status.toLowerCase() === 'rejected';
                const isActionLoading = actionLoadingId === a.application_id;

                return (
                  <div
                    key={a.application_id}
                    className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-4"
                  >
                    {/* Top row: checkbox + avatar + name/email */}
                    <div className="flex items-start gap-4">
                      {isPending ? (
                        <RowCheckbox
                          checked={selectedIds.has(a.application_id)}
                          onChange={(checked) => toggleSelected(a.application_id, checked)}
                          label={`Select ${a.full_name}`}
                          className="mt-3.5"
                        />
                      ) : (
                        /* Keeps rows that cannot be selected aligned with the others. */
                        <span className="w-3.5 h-3.5 shrink-0 mt-3.5" aria-hidden="true" />
                      )}
                      <div className="shrink-0 h-11 w-11 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center text-coral-400 font-bold text-sm">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{a.full_name}</p>
                        <p className="text-xs text-gray-400 truncate">{a.email}</p>
                      </div>
                    </div>

                    {/* Badge row */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                      <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">{a.job_title}</span>
                      <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">{a.job_domain}</span>
                      <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
                        <CalendarIcon className="w-3.5 h-3.5" /> Applied {formatDateTime(a.applied_at)}
                      </span>
                      <StatusBadge status={a.status} type="hr" />
                      {a.match_status === 'unmatched' && (
                        <span className="bg-yellow-500/15 text-yellow-200 border border-yellow-500/30 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
                          Unmatched
                        </span>
                      )}
                      {a.interview_status && <StatusBadge status={a.interview_status} type="interview" />}
                      {/* Final post-interview decision (backend value; only present
                          once the interview was decided). */}
                      {a.final_decision && (
                        <StatusBadge status={finalDecisionLabel(a.final_decision)} type="decision" />
                      )}
                      {a.reissue_requested === 1 && (
                        <span className="bg-orange-500/15 text-orange-300 border border-orange-500/30 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
                          Reissue Requested
                        </span>
                      )}
                    </div>

                    {/* Unmatched attempt: real score + requirement gaps from the existing engine */}
                    {a.match_status === 'unmatched' && (
                      <div className="bg-yellow-500/[0.06] border border-yellow-500/20 rounded-xl px-4 py-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-400">
                          <span>
                            Applied for: <span className="text-gray-200 font-medium">{a.job_title}</span>
                          </span>
                          {typeof a.match_score === 'number' && (
                            <span>
                              Match Score: <span className="text-yellow-200 font-bold">{a.match_score}%</span>
                            </span>
                          )}
                        </div>
                        {parseSkillChips(a.match_missing_skills).length > 0 && (
                          <div>
                            <p className="text-[11px] text-gray-500 mb-1.5">Missing Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                              {parseSkillChips(a.match_missing_skills).map((skill, i) => (
                                <span
                                  key={i}
                                  className="bg-red-500/10 text-red-300 border border-red-500/25 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Interview code box */}
                    {hasInterviewCode && (
                      <div className="text-xs text-gray-400 space-y-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3">
                        <p>
                          Interview Code: <span className="text-white font-mono font-semibold">{a.interview_code}</span>
                        </p>
                        {a.interview_expires_at && (
                          <p>Expires: {formatDateTime(a.interview_expires_at)}</p>
                        )}
                        {a.reissue_requested === 1 && (
                          <p className="text-orange-300">Reissue requested · Extensions: {a.reissue_count}</p>
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {/* View Applicant */}
                      <button
                        onClick={() => setViewApplicant(a)}
                        className="text-[11px] font-medium text-primary-light hover:text-white border border-primary/30 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors"
                      >
                        View Applicant
                      </button>

                      {/* View Submitted Resume (opens in-page viewer, no auto-download) */}
                      {a.resume_filename && session?.hr_id ? (
                        <button
                          onClick={() => setResumeApplicant({ applicant: a, hrId: session.hr_id })}
                          className="text-[11px] font-medium text-teal-300 hover:text-white border border-teal-400/30 hover:bg-teal-400/20 px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5"
                        >
                          <DocumentIcon className="w-3.5 h-3.5" />
                          View Resume
                        </button>
                      ) : null}

                      {/* Pending: Approve / Reject */}
                      {isPending && (
                        <>
                          <button
                            onClick={() => setConfirmApprove(a)}
                            disabled={isActionLoading}
                            className="text-[11px] font-semibold text-white bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isActionLoading && (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            Approve
                          </button>
                          <button
                            onClick={() => setConfirmReject(a)}
                            disabled={isActionLoading}
                            className="text-[11px] font-semibold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isActionLoading && (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            Reject
                          </button>
                        </>
                      )}

                      {/* Decision locked */}
                      {(isApproved || isRejected) && (
                        <span className="text-[11px] text-gray-500">Decision locked</span>
                      )}

                      {/* Approved: interview code email already delivered.
                          The badge states how it went out when the backend
                          recorded it, so HR never has to open the candidate. */}
                      {isApproved && a.code_email_sent === 1 && (
                        <button
                          disabled
                          title="Interview code email already sent"
                          className="text-[11px] font-semibold text-green-300 bg-green-500/15 border border-green-500/40 px-3 py-1.5 rounded-full cursor-not-allowed flex items-center gap-1.5"
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                          Interview Code Sent
                          {a.code_send_method === 'automatic' && (
                            <span className="font-normal text-green-200/70">· Automatically</span>
                          )}
                          {a.code_send_method === 'manual' && (
                            <span className="font-normal text-green-200/70">· Manually</span>
                          )}
                        </button>
                      )}

                      {/* Approved: Send Interview Code (generates if needed, emails + notifies).
                          Always available, whether automatic sending is ON or OFF. */}
                      {isApproved && a.code_email_sent !== 1 && (
                        <>
                          {autoInterviewCodes && (
                            <span className="text-[11px] font-medium text-yellow-200/80 flex items-center gap-1">
                              ⚠ Not sent automatically
                            </span>
                          )}
                          <button
                            onClick={() => setConfirmSendCode(a)}
                            disabled={isActionLoading}
                            className="text-[11px] font-semibold text-white bg-primary/20 hover:bg-primary/30 border border-primary/40 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {isActionLoading && (
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            )}
                            <SendIcon className="w-3.5 h-3.5" />
                            Send Interview Code
                          </button>
                        </>
                      )}

                      {/* Approved + has code: View Link */}
                      {isApproved && hasInterviewCode && (
                        <button
                          onClick={() => setViewLinkApplicant(a)}
                          disabled={isActionLoading}
                          className="text-[11px] font-semibold text-white bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                        >
                          View Interview Link
                        </button>
                      )}

                      {/* Reissue requested */}
                      {a.reissue_requested === 1 && (
                        <button
                          onClick={() => setConfirmRegenerateCode(a)}
                          disabled={isActionLoading}
                          className="text-[11px] font-semibold text-white bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isActionLoading && (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          )}
                          Reissue Interview Code
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </HrLayout>

      {/* Confirm Approve */}
      {confirmApprove && (
        <ConfirmDialog
          title="Approve Applicant"
          message={`Approve this applicant?`}
          confirmLabel="Approve"
          loading={actionLoadingId === confirmApprove.application_id}
          onConfirm={handleApprove}
          onCancel={() => setConfirmApprove(null)}
        />
      )}

      {/* Confirm Reject */}
      {confirmReject && (
        <ConfirmDialog
          title="Reject Applicant"
          message={`Reject this applicant?`}
          confirmLabel="Reject"
          loading={actionLoadingId === confirmReject.application_id}
          onConfirm={handleReject}
          onCancel={() => setConfirmReject(null)}
        />
      )}

      {/* Confirm Send Interview Code */}
      {confirmSendCode && (
        <ConfirmDialog
          title="Send Interview Code"
          message={`Send an interview code email to ${confirmSendCode.full_name}? A code will be generated if one does not exist, and an email with the interview instructions will be sent.`}
          confirmLabel="Send Code"
          loading={actionLoadingId === confirmSendCode.application_id}
          onConfirm={handleSendCode}
          onCancel={() => setConfirmSendCode(null)}
        />
      )}

      {/* Confirm Regenerate Code */}
      {confirmRegenerateCode && (
        <ConfirmDialog
          title="Regenerate Interview Code"
          message={`Generate a new interview code?`}
          confirmLabel="Regenerate Code"
          loading={actionLoadingId === confirmRegenerateCode.application_id}
          onConfirm={handleRegenerateCode}
          onCancel={() => setConfirmRegenerateCode(null)}
        />
      )}

      {/* Confirm bulk approve / reject */}
      {bulkStatus && (
        <ConfirmDialog
          title={bulkStatus === 'approved' ? 'Approve Selected Applicants' : 'Reject Selected Applicants'}
          message={`${selectedIds.size} selected applicant${selectedIds.size === 1 ? '' : 's'} will be ${
            bulkStatus === 'approved' ? 'approved' : 'rejected'
          }. Continue?`}
          confirmLabel={bulkStatus === 'approved' ? 'Approve Selected' : 'Reject Selected'}
          loading={bulkLoading}
          onConfirm={handleBulkStatus}
          onCancel={() => setBulkStatus(null)}
        />
      )}

      {/* View Applicant Modal */}
      {viewApplicant && (
        <ViewApplicantModal
          applicant={viewApplicant}
          hrId={session?.hr_id}
          onClose={() => setViewApplicant(null)}
        />
      )}

      {/* Resume Viewer Modal */}
      {resumeApplicant && (
        <ResumeViewerModal
          applicant={resumeApplicant.applicant}
          hrId={resumeApplicant.hrId}
          onClose={() => setResumeApplicant(null)}
        />
      )}

      {/* View Interview Link Popup */}
      {viewLinkApplicant && viewLinkApplicant.interview_code && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setViewLinkApplicant(null)}
        >
          <div
            className="bg-navy-800 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">Interview Link</h3>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{viewLinkApplicant.full_name}</p>
              </div>
              <button
                onClick={() => setViewLinkApplicant(null)}
                aria-label="Close interview link popup"
                className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition-colors"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <p className="text-sm text-white font-mono break-all bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 mb-6">
              {buildInterviewLink(viewLinkApplicant.interview_code)}
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setViewLinkApplicant(null)}
                className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() =>
                  window.open(buildInterviewLink(viewLinkApplicant.interview_code!), '_blank', 'noopener,noreferrer')
                }
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover transition-colors flex items-center gap-2"
              >
                <TargetIcon className="w-4 h-4" />
                Open Interview
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}