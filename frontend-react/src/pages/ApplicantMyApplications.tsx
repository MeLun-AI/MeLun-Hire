import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import { fetchMyApplications, hasRealInterviewState, requestReissue, finalDecisionLabel, type ApplicantApplication } from '../services/applications';
import { InterviewStatus } from '../constants/interviewStatus';
import { mapInterviewStatus, normalizeInterviewStatus } from '../services/InterviewStatusService';
import StatusBadge from '../components/common/StatusBadge';
import ApplicationTracker from '../components/common/ApplicationTracker';
import { requestErrorMessage } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  return (
    <motion.div variants={staggerItem} className="bg-white/5 border border-white/10 rounded-2xl p-10 md:p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="text-6xl mb-6">📄</div>
        <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">No Applications Yet</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">
          You haven't applied for any jobs yet.
          <br />
          Explore opportunities from your dashboard and submit your first application.
        </p>
        <button
          onClick={onBackToDashboard}
          className="inline-flex items-center gap-2 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-6 rounded-xl transition-all btn-lift"
        >
          <span>←</span>
          Back to Dashboard
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared Modal                                                        */
/*  Reusable in-page dialog used by both the Interview and Details      */
/*  popups. Rendered over the page (no navigation) and theme-aware.     */
/* ------------------------------------------------------------------ */

function Modal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  /* Close on Escape + lock body scroll while open (X and backdrop also work). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /* Rendered through a portal on <body>: the animated page wrapper sets
     `will-change: transform`, which makes it the containing block for
     position: fixed — the overlay would otherwise be sized/positioned
     against the page wrapper instead of the viewport. */
  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:items-center overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="relative w-full max-w-lg bg-navy-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-10 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 pb-4 border-b border-white/10">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
            {icon && <span className="text-lg">{icon}</span>}
            <span className="truncate">{title}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/*  Details helpers                                                    */
/* ------------------------------------------------------------------ */

function formatDateTime(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** True only when the backend actually has interview state / an access code.
 *  The backend's default 'Not Started' is stored on EVERY application, so on
 *  its own it does NOT mean an interview exists (single rule:
 *  hasRealInterviewState). */
function hasInterviewScheduled(app: ApplicantApplication): boolean {
  return Boolean(
    app.interviewCode ||
      app.interviewExpiresAt ||
      hasRealInterviewState(app.interviewStatus, app.interviewCode)
  );
}

interface StageInfo {
  stage: string;
  message: string;
  nextStep?: string;
}

/**
 * Derive the current stage + a plain-language message from the REAL backend
 * application status (pending/approved/rejected) and interview_status.
 * No stage or message is invented beyond what the backend actually reports.
 */
function getStageInfo(app: ApplicantApplication): StageInfo {
  const bs = app.backendStatus;
  /* The backend default 'Not Started' is ignored unless an interview code was
     actually issued, so the stage always agrees with the status badge shown
     next to it (same rule: hasRealInterviewState). */
  const iv = hasRealInterviewState(app.interviewStatus, app.interviewCode)
    ? normalizeInterviewStatus(app.interviewStatus)
    : null;

  if (bs === 'rejected') {
    return {
      stage: InterviewStatus.REJECTED,
      message: 'Your application was not selected at this time. Thank you for applying.',
    };
  }

  if (bs === 'approved') {
    switch (iv) {
      case 'Completed':
        return {
          stage: InterviewStatus.INTERVIEW_COMPLETED,
          message: 'You have completed your interview. Our team is reviewing your performance and will update you soon.',
          nextStep: 'Await the final hiring decision.',
        };
      case 'In Progress':
        return {
          stage: InterviewStatus.INTERVIEW_IN_PROGRESS,
          message: 'You are currently taking your interview.',
          nextStep: 'Complete your interview to receive your feedback.',
        };
      case 'Expired':
        return {
          stage: InterviewStatus.INTERVIEW_EXPIRED,
          message: 'Your interview access has expired.',
          nextStep: 'Request a reissue to continue your interview.',
        };
      case 'Abandoned':
        return {
          stage: InterviewStatus.INTERVIEW_ABANDONED,
          message: 'Your interview was left unfinished and marked as abandoned.',
          nextStep: 'Contact the recruiter to discuss next steps.',
        };
      case 'Violated':
        return {
          stage: InterviewStatus.INTERVIEW_VIOLATED,
          message: 'Your interview was flagged for a policy violation.',
          nextStep: 'Contact the recruiter for more information.',
        };
      case 'Terminated':
        return {
          stage: InterviewStatus.INTERVIEW_TERMINATED,
          message: 'Your interview was terminated.',
          nextStep: 'Contact the recruiter for more information.',
        };
      case 'Not Started':
        return {
          stage: InterviewStatus.INTERVIEW_SCHEDULED,
          message: 'An interview has been scheduled for this application.',
          nextStep: 'Start your interview when you are ready.',
        };
      default:
        if (app.interviewCode) {
          return {
            stage: InterviewStatus.INTERVIEW_SCHEDULED,
            message: 'An interview has been scheduled for this application.',
            nextStep: 'Start your interview when you are ready.',
          };
        }
        return {
          stage: InterviewStatus.RESUME_ACCEPTED,
          message: 'Your resume has been shortlisted by the recruiter.',
          nextStep: 'Your interview will be scheduled soon.',
        };
    }
  }

  // pending (default)
  return {
    stage: InterviewStatus.RESUME_UNDER_REVIEW,
    message: 'Your application has been submitted and is currently being reviewed.',
  };
}

/* ------------------------------------------------------------------ */
/*  Interview information                                              */
/* ------------------------------------------------------------------ */

/**
 * Interview block shown inside the View Details modal.
 * Renders ONLY real backend fields (interview_status / interview_code /
 * interview_*_at). Nothing here is invented or hardcoded.
 */
function InterviewInfoSection({ application }: { application: ApplicantApplication }) {
  const scheduled = hasInterviewScheduled(application);
  const interviewLabel =
    application.interviewStatus && normalizeInterviewStatus(application.interviewStatus)
      ? mapInterviewStatus(application.interviewStatus).label
      : application.statusLabel;

  const expiresAt = formatDateTime(application.interviewExpiresAt);
  const startedAt = formatDateTime(application.interviewStartedAt);
  const completedAt = formatDateTime(application.interviewCompletedAt);

  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Interview</p>

      {!scheduled ? (
        /* Real backend state: no interview has been created for this application. */
        <p className="text-sm text-gray-400">
          The recruiter has not scheduled an interview for this application yet.
        </p>
      ) : (
        <>
          {/* Interview status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Interview status</span>
            <span className="font-medium text-white">{interviewLabel}</span>
          </div>

          {/* Interview access code (real) */}
          {application.interviewCode && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Interview access code</span>
              <span className="font-mono font-semibold text-primary-light">{application.interviewCode}</span>
            </div>
          )}

          {/* Dates — only real backend timestamps, never fabricated */}
          {expiresAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Interview access expires</span>
              <span className="font-medium text-white">{expiresAt}</span>
            </div>
          )}
          {startedAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Interview started</span>
              <span className="font-medium text-white">{startedAt}</span>
            </div>
          )}
          {completedAt && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Interview completed</span>
              <span className="font-medium text-white">{completedAt}</span>
            </div>
          )}
          {/* Final decision — the REAL backend outcome, present only once the
              interview is completed and was decided (by the recruiter or by the
              automatic rule). Never invented in the UI. */}
          {application.finalDecision && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Final decision</span>
              <span
                className={`font-semibold ${
                  application.finalDecision === 'selected' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                {finalDecisionLabel(application.finalDecision)}
              </span>
            </div>
          )}
          {!expiresAt && !startedAt && !completedAt && (
            <p className="text-sm text-gray-400">No interview date or time has been set yet.</p>
          )}

          {/* Type / meeting details are not part of the current backend model */}
          <p className="text-xs text-gray-500">
            Your recruiter will share the interview type and meeting details here once they are available.
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  View Details Modal                                                 */
/* ------------------------------------------------------------------ */

function ViewDetailsModal({ application, onClose }: { application: ApplicantApplication; onClose: () => void }) {
  const info = getStageInfo(application);
  const applied = formatDateTime(application.appliedOn);

  return (
    <Modal title={application.jobTitle || 'Application'} icon="📋" onClose={onClose}>
      <div className="space-y-5">
        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Job title</p>
            <p className="text-sm font-semibold text-white">{application.jobTitle || 'Position'}</p>
            {application.company && <p className="text-xs text-gray-400 mt-0.5">{application.company}</p>}
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Applied date</p>
            <p className="text-sm font-semibold text-white">{applied || '—'}</p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Current status</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={application.status} />
              <span className="text-sm font-semibold text-white">{application.statusLabel}</span>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3.5">
            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Current stage</p>
            <p className="text-sm font-semibold text-primary-light">{info.stage}</p>
          </div>
        </div>

        {/* Progress (reuses the shared ApplicationTracker, driven by real status) */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">Your progress</p>
          <ApplicationTracker status={application.status} />
        </div>

        {/* Interview information — real backend fields only */}
        <InterviewInfoSection application={application} />

        {/* Message */}
        <div className="rounded-xl bg-white/5 border border-white/10 p-4">
          <p className="text-sm text-gray-300 leading-relaxed">{info.message}</p>
          {info.nextStep && (
            <div className="mt-3 pt-3 border-t border-white/10 flex items-start gap-2">
              <span className="text-sm mt-0.5">➜</span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Next step</p>
                <p className="text-sm font-medium text-white">{info.nextStep}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Application Card                                                   */
/* ------------------------------------------------------------------ */

function ApplicationCard({
  application,
  onViewDetails,
  onStartInterview,
  onViewReport,
  onRequestReissue,
  reissueLoading,
}: {
  application: ApplicantApplication;
  onViewDetails: () => void;
  onStartInterview: () => void;
  onViewReport: () => void;
  onRequestReissue: () => void;
  reissueLoading: boolean;
}) {
  const { jobTitle, company, appliedOn, status, hasReport } = application;

  const renderActionButton = () => {
    // Real backend state: 'Not Started' + a valid interview code = ready to start.
    if (application.interviewStatus === 'Not Started' && application.interviewCode) {
      return (
        <button
          onClick={onStartInterview}
          className="w-full sm:w-auto text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift"
        >
          Start Interview
        </button>
      );
    }
    // Real backend state: 'In Progress' (non-terminal) → the applicant can resume.
    if (application.interviewStatus === 'In Progress') {
      return (
        <button
          onClick={onStartInterview}
          className="w-full sm:w-auto text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift"
        >
          Continue Interview
        </button>
      );
    }
    // Real backend state: 'Expired' → applicant can request a reissue.
    if (application.interviewStatus === 'Expired' && application.reissueRequested) {
      return (
        <span className="inline-flex items-center gap-1.5 w-full sm:w-auto text-xs bg-orange-500/10 text-orange-300 border border-orange-500/30 font-semibold py-2.5 px-5 rounded-xl">
          <span className="w-3 h-3 rounded-full border border-orange-400 border-t-transparent animate-spin" aria-hidden="true" />
          Reissue Requested
        </span>
      );
    }
    if (application.interviewStatus === 'Expired' && !application.reissueRequested) {
      return (
        <button
          onClick={onRequestReissue}
          disabled={reissueLoading}
          className="w-full sm:w-auto text-xs bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 border border-orange-500/30 font-semibold py-2.5 px-5 rounded-xl transition-all disabled:opacity-50"
        >
          {reissueLoading ? 'Requesting…' : 'Request Reissue'}
        </button>
      );
    }
    if (hasReport) {
      return (
        <button
          onClick={onViewReport}
          className="w-full sm:w-auto text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift"
        >
          View Interview Report
        </button>
      );
    }
    return null;
  };

  return (
    <motion.div
      variants={staggerItem}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all duration-300 card-hover"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base md:text-lg font-bold text-white truncate">{jobTitle}</h3>
          <p className="text-sm text-gray-400 mt-0.5">{company}</p>
          <p className="text-xs text-gray-500 mt-1.5">
            Applied: {appliedOn}
          </p>
          <p className="text-[11px] text-gray-600 mt-1">
            Application ID: #{application.applicationId}
            {application.jobId != null && <> · Job ID: #{application.jobId}</>}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-3 shrink-0">
          <StatusBadge status={status} />
          {renderActionButton()}
          {/* Always-available action — opens this application's details (never disabled). */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onViewDetails}
              className="w-full sm:w-auto text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all"
            >
              View Details
            </button>
          </div>
        </div>
      </div>
      {/* Live tracker */}
      <div className="mt-4 pt-3 border-t border-white/5">
        <ApplicationTracker status={status} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantMyApplications() {
  const navigate = useNavigate();
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [applications, setApplications] = useState<ApplicantApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reissueLoadingId, setReissueLoadingId] = useState<number | null>(null);
  /* Details modal state — the application whose details are open (null = closed). */
  const [detailsModalApp, setDetailsModalApp] = useState<ApplicantApplication | null>(null);

  /* Auth check — identity comes from the authenticated applicant session. */
  useEffect(() => {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) {
      navigate('/applicant/login', { replace: true });
      return;
    }
    try {
      const s: { applicant_id?: string } = JSON.parse(raw);
      if (!s.applicant_id) {
        navigate('/applicant/login', { replace: true });
        return;
      }
      setApplicantId(s.applicant_id);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  const loadApplications = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setError('');
    try {
      const apps = await fetchMyApplications(applicantId);
      setApplications(apps);
      setLoading(false);
    } catch (err) {
      setError(requestErrorMessage(err, 'Failed to load your applications.'));
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  /* Request a reissue for an expired interview (backend sets reissue_requested = 1). */
  const handleRequestReissue = useCallback(async (applicationId: number) => {
    setReissueLoadingId(applicationId);
    setError('');
    try {
      const res = await requestReissue(applicationId);
      if (!res.success) {
        setError(res.reason || 'Reissue could not be requested.');
        return;
      }
      await loadApplications();
    } catch (err) {
      setError(requestErrorMessage(err, 'Reissue request failed.'));
    } finally {
      setReissueLoadingId(null);
    }
  }, [loadApplications]);

  /* Refresh on window focus / pageshow (no polling). */
  useEffect(() => {
    const onFocus = () => loadApplications();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [loadApplications]);

  return (
    <ApplicantLayout activePage="my-applications">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        {/* Header */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">
            My Applications
          </motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">
            Track all the jobs you've applied for and monitor your application progress.
          </motion.p>
        </motion.section>

        {/* Error state */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button
              onClick={loadApplications}
              className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Application cards / loading / empty state */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-1/2 mt-2" />
                </div>
              ))}
            </div>
          ) : applications.length === 0 ? (
            <EmptyState onBackToDashboard={() => navigate('/applicant/dashboard')} />
          ) : (
            applications.map((app) => (
              <ApplicationCard
                key={app.applicationId}
                application={app}
                onViewDetails={() => setDetailsModalApp(app)}
                onStartInterview={() => navigate('/applicant/start-interview', {
                  state: {
                    applicationId: app.applicationId,
                    interviewCode: app.interviewCode,
                    jobTitle: app.jobTitle,
                  },
                })}
                onViewReport={() => navigate('/applicant/interview-reports')}
                onRequestReissue={() => handleRequestReissue(app.applicationId)}
                reissueLoading={reissueLoadingId === app.applicationId}
              />
            ))
          )}
        </motion.section>
      </div>

      {/* In-page details modal — appears over this page without navigating away. */}
      <AnimatePresence>
        {detailsModalApp && (
          <ViewDetailsModal
            application={detailsModalApp}
            onClose={() => setDetailsModalApp(null)}
          />
        )}
      </AnimatePresence>
    </ApplicantLayout>
  );
}