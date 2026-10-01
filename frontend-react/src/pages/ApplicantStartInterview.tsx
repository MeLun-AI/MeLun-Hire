import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { staggerContainer } from '../animations/config';
import InterviewTimer from '../components/interview/InterviewTimer';
import ProgressBar from '../components/interview/ProgressBar';
import QuestionCard from '../components/interview/QuestionCard';
import AnswerInput from '../components/interview/AnswerInput';
import RoundTransition from '../components/interview/RoundTransition';
import LoadingOverlay from '../components/interview/LoadingOverlay';
import ChatWindow, { type ChatMessage } from '../components/interview/ChatWindow';
import ConsentModal from '../components/proctoring/ConsentModal';
import { requestErrorMessage } from '../services/api';
import ViolationDialog from '../components/proctoring/ViolationDialog';
import FloatingWebcam from '../components/proctoring/FloatingWebcam';
import { useProctoring } from '../components/proctoring/useProctoring';
import { snapshotService } from '../components/proctoring/SnapshotService';
import {
  shouldAskFollowUp,
  getFollowUpQuestion,
} from '../services/aiInterviewer';
import { verifyInterviewCode, persistTermination, fetchMyApplications, reportProctoringEvent, fetchProctoringState, sendInterviewHeartbeat, type ProctoringServerState, type ProctoringEventType } from '../services/applications';
import type { ProctoringSummary } from '../components/proctoring/ProctoringTypes';
import {
  submitInterview,
  normalizeInterviewStatus,
  PROCTORING_TERMINATED_STATUSES,
  TERMINAL_INTERVIEW_STATUSES,
} from '../services/InterviewStatusService';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type InterviewPhase = 'otp' | 'instructions' | 'interview' | 'round-transition' | 'review' | 'submitting' | 'success' | 'terminated';

interface InterviewQuestion {
  q: string;
  answer: string;
  followUps?: { q: string; answer: string }[];
}

interface Round {
  name: string;
  questions: InterviewQuestion[];
}

/* One completed exchange in the conversation/history panel. */
interface HistoryEntry {
  question: string;
  answer: string;
  isFollowUp?: boolean;
  roundIdx?: number;
  qIdx?: number;
}

/* ChatMessage is imported from ChatWindow */

/* ------------------------------------------------------------------ */
/*  Interview progress persistence                                     */
/*  A dedicated sessionStorage record per application so a real        */
/*  interview position can be restored after leaving.                  */
/* ------------------------------------------------------------------ */

interface InterviewProgress {
  applicationId?: number;
  interviewCode?: string;
  jobTitle?: string;
  phase: InterviewPhase;
  currentRoundIdx: number;
  currentQIdx: number;
  rounds: Round[];
  followUpActive: boolean;
  followUpCount: number;
  followUpText: string;
  history: HistoryEntry[];
  startTimestamp: number;
  timestamp: number;
}

const PROGRESS_PREFIX = 'interview_progress_';

function progressKey(applicationId: number): string {
  return `${PROGRESS_PREFIX}${applicationId}`;
}

function loadInterviewProgress(applicationId: number): InterviewProgress | null {
  try {
    const raw = sessionStorage.getItem(progressKey(applicationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InterviewProgress;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clearInterviewProgress(applicationId: number): void {
  try {
    sessionStorage.removeItem(progressKey(applicationId));
    // Also clear the legacy answer snapshots tied to this interview.
    sessionStorage.removeItem('interview_answers');
    sessionStorage.removeItem('interview_answers_snapshot');
    sessionStorage.removeItem('interview_draft');
  } catch { /* ignore */ }
}

/** Only an actually unfinished interview can be resumed. */
function isResumablePhase(phase: InterviewPhase): boolean {
  return phase === 'instructions' || phase === 'interview' || phase === 'round-transition' || phase === 'review';
}

/** Backend interview timestamps are naive UTC ISO strings — compare them as
 *  UTC (a missing timezone is treated as Z) so the access window is enforced
 *  exactly like the backend's own `datetime.utcnow() > expires_at` check. */
function isInterviewExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(expiresAt);
  const ts = Date.parse(hasZone ? expiresAt : `${expiresAt}Z`);
  return Number.isFinite(ts) && Date.now() > ts;
}

/** Parse a naive-UTC backend timestamp into epoch milliseconds (null if unset).
 *  Used so the interview timer is anchored to the server's own start time. */
function serverUtcMillis(value?: string | null): number | null {
  if (!value) return null;
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  const ts = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isFinite(ts) ? ts : null;
}

/** Map ProctoringService phase -> user-facing camera error type. */
function cameraErrorFromPhase(phase?: string): 'denied' | 'blocked' | 'unavailable' {
  if (phase === 'camera-denied') return 'denied';
  if (phase === 'camera-blocked') return 'blocked';
  return 'unavailable';
}

const CAMERA_ERROR_MESSAGES: Record<'denied' | 'blocked' | 'unavailable', string> = {
  denied: 'Camera permission was denied. Please allow camera access and try again.',
  blocked: 'Camera access is blocked for this site. Update your browser/site permissions and try again.',
  unavailable: 'No camera was detected or the camera is currently unavailable. Check your camera connection and try again.',
};

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_ROUNDS: Round[] = [
  {
    name: 'Technical',
    questions: [
      { q: 'Explain the difference between REST and GraphQL. When would you choose one over the other?', answer: '' },
      { q: 'Describe how you would design a scalable URL shortening service like TinyURL. What database, caching, and API design decisions would you make?', answer: '' },
      { q: 'What is the difference between process and thread? How does async/await work in JavaScript?', answer: '' },
      { q: 'Explain ACID properties in database transactions. Give a real-world example where each property matters.', answer: '' },
      { q: 'How does a React Virtual DOM work? What are the performance benefits over direct DOM manipulation?', answer: '' },
    ],
  },
  {
    name: 'Aptitude',
    questions: [
      { q: 'If a train travels 300 km in 4 hours, what is its average speed in m/s?', answer: '' },
      { q: 'A merchant sells an item at a 20% discount but still makes a 15% profit. What is the markup percentage?', answer: '' },
      { q: 'In a group of 120 people, 75 like coffee, 60 like tea, and 25 like both. How many like neither?', answer: '' },
      { q: 'A, B, and C can complete a work in 10, 12, and 15 days respectively. How many days will they take working together?', answer: '' },
    ],
  },
  {
    name: 'Soft Skills',
    questions: [
      { q: 'Describe a time you had a conflict with a team member. How did you resolve it?', answer: '' },
      { q: 'Tell me about a project where you had to learn a new technology quickly. What was your approach?', answer: '' },
      { q: 'How do you handle receiving constructive criticism? Give a specific example.', answer: '' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Connection Banner                                                  */
/* ------------------------------------------------------------------ */

function ConnectionBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <motion.div
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-center"
      role="alert"
    >
      <p className="text-xs text-red-400 font-medium">
        Connection lost. Attempting to reconnect... Your answers are safe.
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function OtpPhase({
  initialCode,
  applicantId,
  onVerified,
  onBackToHome,
}: {
  initialCode?: string;
  applicantId?: string;
  onVerified: (info: { applicationId?: number; jobDomain?: string; interviewCode?: string; interviewStartedAt?: string }) => void;
  onBackToHome: () => void;
}) {
  const [code, setCode] = useState(initialCode ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleVerify = useCallback(async () => {
    if (!code.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      // Real verification: POST /applicant/verify-interview-code
      // The backend checks code ownership, expiry and status, and transitions
      // the interview to 'In Progress' ONLY when the code is valid.
      const result = await verifyInterviewCode(code.trim().toUpperCase(), applicantId);
      if (result.valid) {
        onVerified({
          applicationId: result.application_id,
          jobDomain: result.job_domain,
          interviewCode: code.trim().toUpperCase(),
          // Authoritative start time: the timer is anchored to it, so a refresh
          // cannot extend the interview.
          interviewStartedAt: result.interview_started_at ?? undefined,
        });
      } else {
        setError(result.reason || 'Invalid interview code. Please try again.');
      }
    } catch (err) {
      setError(requestErrorMessage(err, 'Could not verify your interview code. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [code, applicantId, onVerified, loading]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-2xl p-8 text-center"
    >
      <div className="text-5xl mb-5" aria-hidden="true">🔐</div>
      <h2 className="text-xl font-extrabold text-white mb-2" id="otp-heading">Enter Interview Code</h2>
      <p className="text-sm text-gray-400 mb-6">
        {initialCode
          ? 'Your interview code has been loaded from your application. Verify it to begin.'
          : 'Enter the interview code provided by your recruiter or interviewer to join your interview. If you haven`t received a code yet, your interview has not been scheduled.'}
      </p>
      <div className="space-y-4 text-left">
        <div>
          <label htmlFor="otp-input" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            Interview Code
          </label>
          <input
            id="otp-input"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleVerify(); }}
            placeholder="e.g. MLUN-XX-12345"
            maxLength={20}
            disabled={loading}
            aria-labelledby="otp-heading"
            aria-describedby={error ? 'otp-error' : undefined}
            className="w-full text-center text-lg font-mono tracking-widest bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all disabled:opacity-40"
          />
          {!initialCode && (
            <p className="text-center mt-1.5 text-[11px] text-gray-500">
              The recruiter will send your code once your interview is scheduled.
            </p>
          )}
        </div>
        {error && <p id="otp-error" className="text-xs text-red-400 text-center" role="alert">{error}</p>}
        <button
          onClick={handleVerify}
          disabled={loading || !code.trim()}
          aria-busy={loading}
          className="w-full text-sm bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Verifying...
            </span>
          ) : (
            'Join Interview'
          )}
        </button>
        <button
          type="button"
          onClick={onBackToHome}
          className="w-full text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          ← Back to Home
        </button>
      </div>
    </motion.div>
  );
}

function InstructionsPhase({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8">
        <h2 className="text-xl font-extrabold text-white mb-4">Interview Instructions</h2>
        <div className="space-y-4 text-sm text-gray-400">
          <div className="flex items-start gap-3">
            <span className="text-primary-light font-bold shrink-0" aria-hidden="true">1.</span>
            <p>You will be asked a series of questions across <strong className="text-white">Technical, Aptitude, and Soft Skills</strong> rounds.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary-light font-bold shrink-0" aria-hidden="true">2.</span>
            <p>Type your answers in the text box and press <strong className="text-white">Enter</strong> or click <strong className="text-white">Submit Answer</strong>.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary-light font-bold shrink-0" aria-hidden="true">3.</span>
            <p>Your answers are auto-saved every few seconds. Do not refresh the page.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary-light font-bold shrink-0" aria-hidden="true">4.</span>
            <p>The timer in the top-right shows your remaining time. The interview will auto-submit when time runs out.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-primary-light font-bold shrink-0" aria-hidden="true">5.</span>
            <p>After answering all questions, you can review your answers before final submission.</p>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Interview Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          {MOCK_ROUNDS.map((r) => (
            <div key={r.name} className="p-3 bg-white/5 rounded-xl">
              <p className="text-xs text-gray-500">{r.name}</p>
              <p className="text-lg font-bold text-white">{r.questions.length}</p>
              <p className="text-[10px] text-gray-600">questions</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 text-center mt-4">
          Total: {MOCK_ROUNDS.reduce((a, r) => a + r.questions.length, 0)} questions &middot; 30 minutes
        </p>
      </div>

      <button
        onClick={onStart}
        className="w-full text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        Start Interview
      </button>
    </motion.div>
  );
}

function CameraError({
  type,
  onRetry,
  onBack,
}: {
  type: 'denied' | 'blocked' | 'unavailable';
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto"
    >
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 text-center space-y-5">
        <div className="text-5xl" aria-hidden="true">🎥</div>
        <div>
          <h2 className="text-xl font-extrabold text-white mb-2">Camera Access Required</h2>
          <p className="text-sm text-gray-400">Camera access is required to continue this interview.</p>
        </div>

        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-left">
          <p className="text-sm text-red-300 leading-relaxed">{CAMERA_ERROR_MESSAGES[type]}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onRetry}
            className="flex-1 sm:flex-none sm:min-w-[12rem] text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            Try Again
          </button>
          <button
            onClick={onBack}
            className="flex-1 sm:flex-none text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all"
          >
            Back to Instructions
          </button>
        </div>
      </div>
    </motion.div>
  );
}



function ReviewCard({
  roundName,
  questions,
  onEdit,
  score,
}: {
  roundName: string;
  questions: { q: string; answer: string }[];
  onEdit: (qIndex: number) => void;
  score?: number;
}) {
  const answered = questions.filter((q) => q.answer.trim().length > 0).length;
  const completion = Math.round((answered / questions.length) * 100);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 bg-white/[0.03] border-b border-white/5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{roundName}</h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-gray-500">
            {answered}/{questions.length} answered
          </span>
          {score !== undefined && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary-light font-semibold">
              Score: {score}%
            </span>
          )}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {questions.map((item, i) => (
          <div key={i} className="p-5 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <span className="text-[10px] text-gray-500 font-medium">Q{i + 1}</span>
                <p className="text-sm text-gray-300 mt-0.5">{item.q}</p>
              </div>
              <button
                onClick={() => onEdit(i)}
                className="shrink-0 text-[10px] text-primary-light hover:text-primary transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-lg px-2 py-1"
                aria-label={`Edit answer for question ${i + 1}`}
              >
                Edit
              </button>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
              <p className="text-sm text-gray-400">{item.answer || <span className="italic text-gray-600">No answer provided</span>}</p>
            </div>
          </div>
        ))}
      </div>
      {/* Completion bar */}
      <div className="px-5 py-3 bg-white/[0.02] border-t border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
              initial={{ width: 0 }}
              animate={{ width: `${completion}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <span className="text-[10px] text-gray-500 tabular-nums">{completion}%</span>
        </div>
      </div>
    </div>
  );
}

function TerminatedPhase({ onDashboard, onContactSupport }: { onDashboard: () => void; onContactSupport: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-lg mx-auto text-center space-y-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
        className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto"
      >
        <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.div>

      <div>
        <h2 className="text-2xl font-extrabold text-white mb-2">Interview Terminated</h2>
        <p className="text-sm text-red-400 font-medium">Maximum proctoring violations exceeded.</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-center gap-2">
          <span className="text-3xl font-extrabold text-red-400">3 / 3</span>
          <span className="text-xs text-gray-500">warnings used</span>
        </div>
        <p className="text-sm text-gray-400">
          Your interview has been ended due to repeated violations of interview rules.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onDashboard}
          className="flex-1 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          Return to Dashboard
        </button>
        <button
          onClick={onContactSupport}
          className="flex-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all"
        >
          Contact Support
        </button>
      </div>
    </motion.div>
  );
}

function SuccessPhase({ onDashboard, onViewFeedback }: { onDashboard: () => void; onViewFeedback: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-lg mx-auto text-center space-y-6"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 12 }}
        className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto"
      >
        <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </motion.div>

      <div>
        <h2 className="text-2xl font-extrabold text-white mb-2">Interview Completed!</h2>
        <p className="text-sm text-gray-400">Your responses have been submitted successfully.</p>
      </div>

      {/* Timeline */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
        <div className="space-y-4">
          {[
            { label: 'Interview Submitted', done: true },
            { label: 'HR Reviewing', done: false, current: true },
            { label: 'Decision Pending', done: false },
          ].map((step, i) => (
            <div key={step.label} className="flex items-center gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                  step.done ? 'bg-green-500/20 border-green-500 text-green-400' :
                  step.current ? 'bg-primary/20 border-primary text-primary-light' :
                  'bg-white/5 border-white/10 text-gray-600'
                }`}>
                  {step.done ? '✓' : step.current ? '●' : `${i + 1}`}
                </div>
                {i < 2 && <div className="w-0.5 h-6 bg-white/5" />}
              </div>
              <div className="text-left">
                <p className={`text-sm font-medium ${step.done ? 'text-green-400' : step.current ? 'text-primary-light' : 'text-gray-600'}`}>
                  {step.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onViewFeedback}
          className="flex-1 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          View Interview Feedback
        </button>
        <button
          onClick={onDashboard}
          className="flex-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all"
        >
          Return to Dashboard
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typing Indicator                                                   */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-primary/5 border border-primary/10 rounded-2xl p-4 flex items-center gap-3"
      aria-label="AI is preparing your next question"
    >
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="w-2 h-2 rounded-full bg-primary/40"
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span className="text-xs text-gray-400">AI is preparing your next question...</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantStartInterview() {
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? {}) as {
    applicationId?: number;
    interviewCode?: string;
    jobTitle?: string;
  };

  /* Authenticated applicant identity (from the login session). */
  const [applicantId, setApplicantId] = useState<string | null>(null);

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

  const [phase, setPhase] = useState<InterviewPhase>('otp');
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [rounds, setRounds] = useState<Round[]>(() =>
    MOCK_ROUNDS.map((r) => ({
      ...r,
      questions: r.questions.map((q) => ({ ...q })),
    }))
  );
  const [questionLoading, setQuestionLoading] = useState(false);
  const [submissionStep, setSubmissionStep] = useState(0);
  const [submissionPercent, setSubmissionPercent] = useState(0);
  /* Completed exchanges shown in the conversation/history panel. */
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  /* Active follow-up (if any) for the current main question. */
  const [followUpText, setFollowUpText] = useState('');
  const [followUpActive, setFollowUpActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [chatTyping, setChatTyping] = useState(false);
  const [submitError, setSubmitError] = useState('');
  /* Real application confirmed by the backend during OTP verification. */
  const [activeApplication, setActiveApplication] = useState<{ applicationId?: number; jobDomain?: string } | null>(null);

  /* ---- Resume + camera error state ---- */
  /* True while we auto-verify a saved interview on mount. */
  const [resuming, setResuming] = useState(false);
  /* Current camera failure (shown instead of instructions) — null = no error. */
  const [cameraError, setCameraError] = useState<'denied' | 'blocked' | 'unavailable' | null>(null);
  const interviewCodeRef = useRef(navState.interviewCode ?? '');
  const resumeAttemptedRef = useRef(false);
  const phaseRef = useRef<InterviewPhase>('otp');
  phaseRef.current = phase;

  /* ---- Auto-save answers for termination ---- */
  const autoSaveAnswers = useCallback(() => {
    // Save all current answers to sessionStorage (already done per-answer)
    const allAnswers: Record<string, { question: string; round: string; answer: string }> = {};
    rounds.forEach((round, ri) => {
      round.questions.forEach((q, qi) => {
        if (q.answer.trim()) {
          allAnswers[`${ri}-${qi}`] = { question: q.q, round: round.name, answer: q.answer };
        }
      });
    });
    sessionStorage.setItem('interview_answers_snapshot', JSON.stringify(allAnswers));
  }, [rounds]);

  /* ---- Proctoring ---- */
  const [showConsent, setShowConsent] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [proctoringReady, setProctoringReady] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const currentRound = rounds[currentRoundIdx];

  /* Ref so proctoring callbacks can always read the current application. */
  const currentApplicationId = activeApplication?.applicationId ?? navState.applicationId;
  const applicationIdRef = useRef<number | undefined>(undefined);
  applicationIdRef.current = currentApplicationId;

  /* ------------------------------------------------------------------ */
  /*  Server-authoritative proctoring (Phase 3)                          */
  /*  The browser still detects; the BACKEND owns the violation count,   */
  /*  the violation state and the termination decision. These refs only  */
  /*  mirror the last authoritative response so the UI can follow it.    */
  /* ------------------------------------------------------------------ */
  /* True once the backend has confirmed the interview is terminated, so a
   * late/stale callback can never report more events for it. */
  const serverTerminatedRef = useRef(false);
  /* The hook value is mirrored in a ref so callbacks declared before the
   * hook call can reach it without depending on render order. */
  const proctoringRef = useRef<ReturnType<typeof useProctoring> | null>(null);

  /** Adopt an authoritative response from the backend. */
  const applyServerProctoringState = useCallback((state: ProctoringServerState): boolean => {
    proctoringRef.current?.syncWarningCount(state?.warning_count ?? 0);
    if (state?.terminated) serverTerminatedRef.current = true;
    return Boolean(state?.terminated);
  }, []);

  /** End the interview locally: persist position, release the camera and show
   *  the termination screen. The backend already recorded the reason. */
  const endInterviewLocally = useCallback((summary?: ProctoringSummary) => {
    if (summary) localStorage.setItem('interview_terminated', JSON.stringify(summary));
    autoSaveAnswers();
    proctoringRef.current?.stop();
    setProctoringReady(false);
    setCameraStream(null);
    snapshotService.clear();
    setPhase('terminated');
  }, [autoSaveAnswers]);

  /** Report ONE observed violation and follow the backend's decision.
   *  Never called per frame — one request per detected violation event. */
  const reportViolation = useCallback(async (type: ProctoringEventType) => {
    const appId = applicationIdRef.current;
    if (!appId || serverTerminatedRef.current) return;
    try {
      const state = await reportProctoringEvent(appId, type);
      if (applyServerProctoringState(state)) endInterviewLocally();
    } catch {
      /* Backend unreachable: the local 3-warning policy keeps the interview
       * usable, while the server stays the source of truth for what it has
       * actually recorded. */
    }
  }, [applyServerProctoringState, endInterviewLocally]);

  const proctoring = useProctoring(
    {
      maxWarnings: 3,
      snapshotIntervalMs: 60000,
      frameSampleMs: 500,
      faceLossGraceMs: 3000,
      fullscreenRequired: true,
      getProgressContext: () => ({
        question: currentQIdx + 1,
        round: currentRound?.name || 'Technical',
      }),
    },
    {
      onViolation: (violation) => {
        // Detect-and-report only: the backend decides the warning count and
        // whether the interview is terminated. A camera that stopped producing
        // frames is a server-terminating event, so the local UX ends with it.
        void reportViolation(violation.type as ProctoringEventType);
        if (violation.type === 'camera_blocked') endInterviewLocally();
      },
      onTerminate: () => {
        // Local 3-warning policy reached. The 3rd violation was already
        // reported by onViolation above, so the server records the same
        // termination — the client must not decide it on its own.
        endInterviewLocally(proctoringRef.current?.service?.summary);
      },
      onSnapshotCaptured: (snap) => snapshotService.add(snap),
      onCameraStateChange: (state) => {
        // A camera state change only counts as a terminal violation DURING the
        // interview. Initial camera setup failures (denied/blocked/unavailable)
        // are surfaced by the camera error UI instead of terminating silently.
        if (state !== 'active' && phaseRef.current === 'interview') {
          void reportViolation('camera_blocked');
          endInterviewLocally();
        }
      },
    }
  );
  proctoringRef.current = proctoring;

  /* 0 = interview not yet started (set when the applicant actually begins). */
  const startTimestampRef = useRef(0);
  const currentQuestion = currentRound?.questions[currentQIdx];

  /* ------------------------------------------------------------------ */
  /*  Resume saved interview (if any)                                    */
  /*  The backend stays the source of truth: we only restore the local   */
  /*  session (position, answers, history, timer) when the backend       */
  /*  confirms this applicant still owns an unfinished interview.        */
  /*                                                                     */
  /*  NOTE: /applicant/verify-interview-code is a START endpoint — it    */
  /*  rejects any interview that already started ('In Progress' ->       */
  /*  "Interview already used", 'Violated'/'Abandoned'/'Terminated' ->   */
  /*  "Interview is no longer active"), so it can never confirm a        */
  /*  resume. Using it here is what destroyed the saved session and      */
  /*  forced the applicant into a fresh code/start attempt. A read-only  */
  /*  check of the applicant's own applications is used instead.         */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    if (!applicantId || resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;

    const appId = navState.applicationId;
    if (appId == null) return;

    const saved = loadInterviewProgress(appId);
    if (!saved || !isResumablePhase(saved.phase)) {
      // No meaningful progress (or terminal state) — don't resume.
      if (saved) clearInterviewProgress(appId);
      return;
    }

    const code = navState.interviewCode || saved.interviewCode;
    if (!code) {
      clearInterviewProgress(appId);
      return;
    }

    interviewCodeRef.current = code;
    setResuming(true);

    // Stale / terminal / revoked record → drop it and fall back to the code
    // screen (the backend is authoritative for those states).
    const dropStaleSession = () => {
      clearInterviewProgress(appId);
      setPhase('otp');
    };

    // Read-only confirmation of ownership + real interview state. This never
    // mutates the interview: no duplicate session, no status change.
    fetchMyApplications(applicantId)
      .then((apps) => {
        const app = apps.find((a) => a.applicationId === appId);
        // Not this applicant's application → nothing to resume.
        if (!app) {
          dropStaleSession();
          return;
        }
        // A different (reissued) code means the saved session is stale.
        if (app.interviewCode && app.interviewCode !== code) {
          dropStaleSession();
          return;
        }
        // Only a genuinely unfinished session can be restored. A status the
        // SERVER ended the interview in ('Violated'/'Terminated' = proctoring
        // terminated it, 'Completed'/'Expired'/'Abandoned' = over) must never be
        // restored as a live interview: that would let the applicant keep
        // answering after the server already ended the session.
        const backendStatus = normalizeInterviewStatus(app.interviewStatus);
        if (TERMINAL_INTERVIEW_STATUSES.includes(backendStatus)) {
          clearInterviewProgress(appId);
          setResuming(false);
          // A proctoring termination gets the dedicated end-of-interview screen.
          setPhase(PROCTORING_TERMINATED_STATUSES.includes(backendStatus) ? 'terminated' : 'otp');
          return;
        }
        if (backendStatus !== 'In Progress') {
          dropStaleSession();
          return;
        }
        // Expired access window → the code path reports it and offers reissue.
        if (isInterviewExpired(app.interviewExpiresAt)) {
          dropStaleSession();
          return;
        }

        setActiveApplication({ applicationId: app.applicationId });
        // Restore exact interview position + answers + history + follow-up.
        // The timer origin comes from the SERVER's interview_started_at whenever
        // it is known, so refreshing (or editing local storage) can never extend
        // the interview window.
        startTimestampRef.current =
          serverUtcMillis(app.interviewStartedAt) ??
          (saved.startTimestamp > 0 ? saved.startTimestamp : Date.now());
        setRounds(saved.rounds);
        setCurrentRoundIdx(saved.currentRoundIdx);
        setCurrentQIdx(saved.currentQIdx);
        setFollowUpActive(saved.followUpActive);
        setFollowUpCount(saved.followUpCount);
        setFollowUpText(saved.followUpText);
        setHistory(saved.history);

        // If the saved timer already expired, go straight to review/submission.
        const totalMs = 30 * 60 * 1000;
        const timerExpired =
          saved.startTimestamp > 0 && Date.now() - saved.startTimestamp > totalMs;
        if (timerExpired || saved.phase === 'review') {
          // 'review' is the unproctored final step (a live interview stops the
          // camera there too), so restore it directly instead of sending the
          // applicant back to the last already-answered question.
          setPhase('review');
        } else {
          // Camera permission is still required before resuming the interview.
          setPhase('instructions');
        }

        // Adopt the authoritative proctoring state: warnings recorded before a
        // refresh are restored (the client can never reset them) and the local
        // counter continues from the server's value.
        fetchProctoringState(app.applicationId)
          .then((state) => applyServerProctoringState(state))
          .catch(() => {
            /* Backend unreachable — keep the locally restored state. */
          });
      })
      .catch(() => {
        // Backend unreachable: keep the saved session so it can still be
        // resumed later — never delete interview progress on a network error.
        setPhase('otp');
      })
      .finally(() => setResuming(false));
  }, [applicantId, navState.applicationId, navState.interviewCode]);

  /* ------------------------------------------------------------------ */
  /*  Continuous progress persistence                                    */
  /*  Saves whenever meaningful interview state changes (answers,        */
  /*  follow-ups, advancement, edits, review, resume).                   */
  /* ------------------------------------------------------------------ */
  useEffect(() => {
    const appId = applicationIdRef.current;
    if (!appId) return;
    if (phase === 'otp' || phase === 'submitting' || phase === 'success' || phase === 'terminated') return;
    const progress: InterviewProgress = {
      applicationId: appId,
      interviewCode: interviewCodeRef.current,
      jobTitle: navState.jobTitle,
      phase,
      currentRoundIdx,
      currentQIdx,
      rounds: structuredClone(rounds),
      followUpActive,
      followUpCount,
      followUpText,
      history: structuredClone(history),
      startTimestamp: startTimestampRef.current,
      timestamp: Date.now(),
    };
    try {
      sessionStorage.setItem(progressKey(appId), JSON.stringify(progress));
    } catch { /* storage full — ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentRoundIdx, currentQIdx, rounds, followUpActive, followUpCount, followUpText, history]);

  /* ---- Exit protection + progress save before leaving ---- */
  useEffect(() => {
    if (phase === 'interview' || phase === 'review') {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = 'You have an interview in progress. Leaving may terminate your interview.';
        // Save the current interview progress so the applicant can resume later.
        // NOTE: leaving does NOT abandon the interview — the applicant is
        // expected to be able to continue from where they stopped.
        const appId = applicationIdRef.current;
        if (appId) {
          const progress: InterviewProgress = {
            applicationId: appId,
            interviewCode: interviewCodeRef.current,
            jobTitle: navState.jobTitle,
            phase,
            currentRoundIdx,
            currentQIdx,
            rounds: structuredClone(rounds),
            followUpActive,
            followUpCount,
            followUpText,
            history: structuredClone(history),
            startTimestamp: startTimestampRef.current,
            timestamp: Date.now(),
          };
          try {
            sessionStorage.setItem(progressKey(appId), JSON.stringify(progress));
          } catch { /* ignore */ }
        }
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentRoundIdx, currentQIdx, rounds, followUpActive, followUpCount, followUpText, history]);

  /* ---- Consent / proctoring handlers ---- */
  const handleStartInterview = useCallback(() => {
    setCameraError(null);
    setShowConsent(true);
  }, []);

  /* Shared camera startup used by both the consent flow and "Try Again".
   * Explicitly verifies the proctoring service is actually running before
   * proceeding — a failed camera never silently falls through. */
  const startCamera = useCallback(async () => {
    setCameraStarting(true);
    setCameraError(null);

    // Stop any partially initialized stream before retrying.
    if (proctoring.service?.isRunning) {
      proctoring.stop();
    }

    await proctoring.start();

    const svc = proctoring.service;
    if (svc?.isRunning && svc.phase === 'camera-active') {
      const stream = svc['stream'] as MediaStream | null;
      setCameraStream(stream);
      setProctoringReady(true);
      setShowConsent(false);
      setCameraError(null);
      // Keep the ORIGINAL start timestamp when resuming — the timer is
      // only (re)started for a brand-new interview.
      if (startTimestampRef.current === 0) {
        startTimestampRef.current = Date.now();
      }
      setPhase('interview');
      void svc.requestFullscreen();
    } else {
      // Camera failed: surface a clear, specific error instead of staying
      // silently on the instructions screen.
      setShowConsent(false);
      setProctoringReady(false);
      setCameraStream(null);
      setCameraError(cameraErrorFromPhase(svc?.phase));
    }
    setCameraStarting(false);
  }, [proctoring]);

  const handleConsentAgree = useCallback(() => {
    void startCamera();
  }, [startCamera]);

  const handleCameraRetry = useCallback(() => {
    void startCamera();
  }, [startCamera]);

  const handleConsentDecline = useCallback(async () => {
    setShowConsent(false);
    // The interview is already 'In Progress' after OTP verification.
    // Declining consent abandons it — persist so applicant + HR both see 'Abandoned'.
    const appId = applicationIdRef.current;
    if (appId) {
      try {
        await persistTermination(appId, 'abandoned');
      } catch { /* still leave the interview */ }
    }
    navigate('/applicant/my-applications');
  }, [navigate]);

  /* "End Interview" in the violation dialog: report the explicit end (the
   * server treats it as a terminating event) and end the interview locally. */
  const handleTerminateInterview = useCallback(() => {
    void reportViolation('manual');
    endInterviewLocally();
  }, [reportViolation, endInterviewLocally]);

  /* ---- Stop camera when interview ends ---- */
  useEffect(() => {
    if (phase === 'success' || phase === 'review') {
      proctoring.stop();
      setProctoringReady(false);
      setCameraStream(null);
    }
  }, [phase, proctoring]);

  /* ---- Interview liveness heartbeat ---- */
  /* Refreshes the backend's `last_seen` so a running interview is never
   * cleaned up as Abandoned. One 60s interval (never per-frame); cleared on
   * every phase change and on unmount, so StrictMode/remount cannot leave a
   * second heartbeat running. */
  useEffect(() => {
    if (phase === 'otp' || phase === 'success' || phase === 'terminated') return;
    if (!currentApplicationId) return;
    const send = () => {
      void sendInterviewHeartbeat(currentApplicationId).catch(() => {
        /* offline — the next tick retries; the server stays authoritative */
      });
    };
    send();
    const id = window.setInterval(send, 60000);
    return () => window.clearInterval(id);
  }, [phase, currentApplicationId]);

  /* ---- Release the snapshot buffer when leaving the interview ---- */
  /* Snapshots are base64 camera frames; the module-level SnapshotService is a
   * singleton, so it must not keep one applicant's frames after unmount. */
  useEffect(() => () => {
    snapshotService.clear();
  }, []);

  /* ---- Handlers ---- */
  const handleAnswer = useCallback((text: string) => {
    if (submitting) return;

    setSubmitting(true);

    const roundIdx = currentRoundIdx;
    const qIdx = currentQIdx;
    const question = rounds[roundIdx].questions[qIdx];

    // Save the answer to the correct slot (main question vs follow-up).
    setRounds((prev) => {
      const updated = structuredClone(prev);
      const target = updated[roundIdx].questions[qIdx];
      if (followUpActive && target.followUps && target.followUps.length > 0) {
        target.followUps[target.followUps.length - 1].answer = text;
      } else {
        target.answer = text;
      }
      return updated;
    });

    // Persist to sessionStorage (same key scheme as the restore logic).
    try {
      const saved = JSON.parse(sessionStorage.getItem('interview_answers') || '{}');
      const key = `${roundIdx}-${qIdx}`;
      saved[key] = text;
      if (followUpActive && question.followUps && question.followUps.length > 0) {
        saved[`${key}-fu${question.followUps.length - 1}`] = text;
      }
      sessionStorage.setItem('interview_answers', JSON.stringify(saved));
    } catch { /* ignore */ }

    // Record the completed exchange in the conversation/history panel.
    if (followUpActive && question.followUps && question.followUps.length > 0) {
      const fu = question.followUps[question.followUps.length - 1];
      setHistory((prev) => [
        ...prev,
        { question: fu.q, answer: text, isFollowUp: true, roundIdx, qIdx },
      ]);
    } else {
      setHistory((prev) => [
        ...prev,
        { question: question.q, answer: text, roundIdx, qIdx },
      ]);
    }

    // Show loading states while the AI prepares the next prompt.
    setChatTyping(true);
    setShowTyping(true);
    setQuestionLoading(true);

    // Decide next step: a follow-up (only right after a main answer) or advance.
    const needsFollowUp =
      !followUpActive && shouldAskFollowUp(question.q, text, followUpCount);

    const delay = 400 + Math.random() * 600;
    setTimeout(() => {
      setChatTyping(false);
      setShowTyping(false);

      if (needsFollowUp) {
        // Create ONE follow-up with its own answer slot, shown as the active question.
        const followUpQ = getFollowUpQuestion(question.q, text);
        setRounds((prev) => {
          const updated = structuredClone(prev);
          const target = updated[roundIdx].questions[qIdx];
          target.followUps = target.followUps || [];
          target.followUps.push({ q: followUpQ, answer: '' });
          return updated;
        });
        setFollowUpText(followUpQ);
        setFollowUpActive(true);
        setFollowUpCount((c) => c + 1);
        setQuestionLoading(false);
        setSubmitting(false);
      } else if (qIdx + 1 < rounds[roundIdx].questions.length) {
        // Advance to the next main question (one active question at a time).
        setFollowUpActive(false);
        setFollowUpText('');
        setFollowUpCount(0);
        setCurrentQIdx(qIdx + 1);
        setQuestionLoading(false);
        setSubmitting(false);
      } else {
        // Round complete.
        setFollowUpActive(false);
        setFollowUpText('');
        setFollowUpCount(0);
        setQuestionLoading(false);
        setSubmitting(false);
        if (roundIdx + 1 < rounds.length) {
          setPhase('round-transition');
        } else {
          setPhase('review');
        }
      }
    }, Math.max(300, delay));
  }, [currentRoundIdx, currentQIdx, rounds, rounds.length, submitting, followUpCount, followUpActive]);

  const handleStartNextRound = useCallback(() => {
    const nextIdx = currentRoundIdx + 1;
    setCurrentRoundIdx(nextIdx);
    setCurrentQIdx(0);
    setPhase('interview');
    setFollowUpActive(false);
    setFollowUpText('');
    setFollowUpCount(0);
    // The next round's first question renders as the active question in the
    // main area; previous rounds' exchanges remain in the history panel.
  }, [currentRoundIdx, rounds]);

  const handleEditAnswer = useCallback((roundIdx: number, qIdx: number) => {
    setCurrentRoundIdx(roundIdx);
    setCurrentQIdx(qIdx);
    // Drop this question's history entries so the question becomes the active
    // one again without duplicating it in the history panel.
    setHistory((prev) => prev.filter((h) => !(h.roundIdx === roundIdx && h.qIdx === qIdx)));
    setFollowUpActive(false);
    setFollowUpText('');
    setFollowUpCount(0);
    setPhase('interview');
  }, []);

  const handleSubmitReport = useCallback(async () => {
    setPhase('submitting');
    setSubmissionStep(0);
    setSubmissionPercent(0);

    // Realistic progress simulation
    const milestones = [
      { step: 0, percent: 10, label: 'Uploading Responses' },
      { step: 0, percent: 25, label: 'Uploading Responses' },
      { step: 1, percent: 41, label: 'Analyzing Technical Accuracy' },
      { step: 1, percent: 66, label: 'Analyzing Technical Accuracy' },
      { step: 2, percent: 75, label: 'Evaluating Communication' },
      { step: 2, percent: 92, label: 'Evaluating Communication' },
      { step: 3, percent: 100, label: 'Preparing Final Report' },
    ];

    for (const m of milestones) {
      setSubmissionStep(m.step);
      setSubmissionPercent(m.percent);
      await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));
    }

    await new Promise((r) => setTimeout(r, 500));

    // Persist the completed interview + report to the backend BEFORE success.
    // Backend /interview/submit-report transitions the application to
    // 'Completed' and stores the report. Success is shown ONLY on
    // confirmation — never optimistically.
    const roundKeys: Record<string, string> = {
      Technical: 'technical',
      Aptitude: 'aptitude',
      'Soft Skills': 'soft_skills',
    };
    const answers: Record<string, unknown[]> = {};
    const analysis: Record<string, unknown[]> = {};
    rounds.forEach((round) => {
      const key = roundKeys[round.name] || round.name.toLowerCase().replace(/\s+/g, '_');
      const qAnswers: { question: string; answer: string; is_follow_up?: boolean }[] = [];
      round.questions.forEach((q) => {
        qAnswers.push({ question: q.q, answer: q.answer });
        (q.followUps || []).forEach((fu) => {
          qAnswers.push({ question: fu.q, answer: fu.answer, is_follow_up: true });
        });
      });
      answers[key] = qAnswers;
      // Parallel analysis entries (one per prompt). Scores are intentionally
      // left neutral here — the backend generates the real evaluation from
      // the transcript at submission time.
      analysis[key] = qAnswers.map((entry) => ({
        question: entry.question,
        answer: entry.answer,
        is_follow_up: !!entry.is_follow_up,
        score: 0,
      }));
    });

    // Real application reference from OTP verification (or the selected
    // application passed in from My Applications / dashboard).
    const applicationId = activeApplication?.applicationId ?? navState.applicationId;
    if (!applicationId) {
      setSubmitError('Interview application reference is missing. Please start the interview again.');
      setPhase('review');
      return;
    }
    const result = await submitInterview({
      application_id: applicationId,
      applicant_id: applicantId ?? undefined,
      domain: activeApplication?.jobDomain || 'interview',
      answers,
      analysis,
    });

    if (result.success) {
      // Backend confirmed — clear local progress and any stale snapshots so a
      // completed interview can never be resumed from local state.
      if (applicationId) clearInterviewProgress(applicationId);
      setPhase('success');
    } else if (result.terminated) {
      // The SERVER refused the submission because proctoring already ended this
      // interview. Its decision is authoritative: show the terminated screen
      // instead of retrying the submission.
      endInterviewLocally();
    } else {
      setSubmitError('We could not confirm your submission with the server. Please try again.');
      setPhase('review');
    }
  }, [rounds, activeApplication, applicantId, navState.applicationId, endInterviewLocally]);

  const handleTimeUp = useCallback(() => {
    setPhase('review');
  }, []);

  /* ---- Conversation history messages (completed exchanges only) ---- */
  const historyMessages = useMemo(() => {
    const msgs: ChatMessage[] = [];
    history.forEach((h, i) => {
      msgs.push({ id: `h-q-${i}`, role: 'ai', text: h.question, timestamp: 0, isFollowUp: h.isFollowUp });
      msgs.push({ id: `h-a-${i}`, role: 'user', text: h.answer, timestamp: 0 });
    });
    return msgs;
  }, [history]);

  /* ---- Restore saved answers on mount ---- */
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('interview_answers') || '{}');
      if (Object.keys(saved).length > 0) {
        setRounds((prev) => {
          const updated = structuredClone(prev);
          for (const [key, value] of Object.entries(saved)) {
            const [ri, qi] = key.split('-').map(Number);
            if (updated[ri]?.questions[qi]) {
              updated[ri].questions[qi].answer = value as string;
            }
          }
          return updated;
        });
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Connection Banner */}
      <ConnectionBanner />

      {/* Consent Modal */}
      {showConsent && (
        <ConsentModal
          onAgree={handleConsentAgree}
          onDecline={handleConsentDecline}
          loading={cameraStarting}
        />
      )}

      {/* Proctoring Violation Dialog */}
      {proctoring.lastViolation && phase === 'interview' && (
        <ViolationDialog
          violation={proctoring.lastViolation}
          warningsRemaining={proctoring.status.warningsRemaining}
          maxWarnings={3}
          onDismiss={proctoring.dismissViolation}
          onReturnToFullscreen={() => void proctoring.service?.requestFullscreen()}
          onTerminate={handleTerminateInterview}
        />
      )}

      {/* Floating Webcam Preview during interview */}
      {phase === 'interview' && proctoringReady && (
        <FloatingWebcam
          stream={cameraStream}
          status={proctoring.status}
          warnings={proctoring.warnings}
          maxWarnings={3}
        />
      )}

      {/* ============================================================ */}
      {/* TOP BAR - Interview Header                                    */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-30 bg-navy-900/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold" aria-hidden="true">Q</div>
            <span className="text-sm font-semibold text-white hidden sm:inline">AI Interview</span>
          </div>

          <div className="flex items-center gap-4 md:gap-6">
            {phase === 'interview' && (
              <>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">{currentRound?.name}</p>
                  <p className="text-xs text-gray-400">Question {currentQIdx + 1} of {currentRound?.questions.length}</p>
                </div>
                <div>
                  <InterviewTimer
                    startTimestamp={startTimestampRef.current}
                    totalMinutes={30}
                    onTimeUp={handleTimeUp}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* MAIN CONTENT                                                 */}
      {/* ============================================================ */}
      <main className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <AnimatePresence mode="wait">
          {/* ---- RESUMING (loading saved interview) ---- */}
          {resuming && (
            <motion.div key="resuming" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="max-w-md mx-auto bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-4">
                <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary-light animate-spin mx-auto" aria-hidden="true" />
                <p className="text-sm text-gray-400">Restoring your interview…</p>
              </div>
            </motion.div>
          )}

          {/* ---- OTP PHASE ---- */}
          {phase === 'otp' && !resuming && (
            <motion.div key="otp" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              <OtpPhase
                initialCode={navState.interviewCode}
                applicantId={applicantId ?? undefined}
                onBackToHome={() => navigate('/applicant/dashboard')}
                onVerified={(info) => {
                  setActiveApplication(info);
                  interviewCodeRef.current = info.interviewCode ?? navState.interviewCode ?? '';
                  // Anchor the interview timer to the SERVER's start time so a
                  // refresh or edited local state cannot extend the window.
                  const serverStart = serverUtcMillis(info.interviewStartedAt);
                  if (serverStart) startTimestampRef.current = serverStart;
                  setPhase('instructions');
                }}
              />
            </motion.div>
          )}

          {/* ---- INSTRUCTIONS PHASE (or camera error) ---- */}
          {phase === 'instructions' && (
            <motion.div key="instructions" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              {cameraError ? (
                <CameraError
                  type={cameraError}
                  onRetry={handleCameraRetry}
                  onBack={() => {
                    setCameraError(null);
                    setShowConsent(false);
                  }}
                />
              ) : (
                <InstructionsPhase onStart={handleStartInterview} />
              )}
            </motion.div>
          )}

          {/* ---- INTERVIEW PHASE ---- */}
          {phase === 'interview' && (
            <motion.div
              key={`interview-${currentRoundIdx}-${currentQIdx}`}
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Progress */}
              <ProgressBar
                current={currentQIdx + 1}
                total={currentRound.questions.length}
                roundName={currentRound.name}
              />

              {/* Active Question — shown ONLY in the main area (main or follow-up) */}
              {showTyping ? (
                <TypingIndicator />
              ) : followUpActive && currentQuestion?.followUps && currentQuestion.followUps.length > 0 ? (
                <QuestionCard
                  question={currentQuestion.followUps[currentQuestion.followUps.length - 1].q}
                  questionNumber={currentQIdx + 1}
                  totalQuestions={currentRound.questions.length}
                  roundName={currentRound.name}
                  loading={questionLoading}
                  isFollowUp
                />
              ) : (
                <QuestionCard
                  question={currentQuestion?.q || ''}
                  questionNumber={currentQIdx + 1}
                  totalQuestions={currentRound.questions.length}
                  roundName={currentRound.name}
                  loading={questionLoading}
                />
              )}

              {/* Answer Input — directly below the active question */}
              {!questionLoading && !showTyping && (
                <div className="sticky bottom-0 pb-4 bg-navy-950/90 backdrop-blur-sm">
                  <AnswerInput
                    key={`answer-${currentRoundIdx}-${currentQIdx}-${followUpActive ? 'fu' : 'main'}`}
                    onAnswer={handleAnswer}
                    initialValue={
                      followUpActive &&
                      currentQuestion?.followUps &&
                      currentQuestion.followUps.length > 0
                        ? currentQuestion.followUps[currentQuestion.followUps.length - 1].answer
                        : currentQuestion?.answer || ''
                    }
                    disabled={submitting}
                    isLoading={questionLoading || submitting}
                  />
                </div>
              )}

              {/* Conversation History — completed exchanges only (never the active question) */}
              {historyMessages.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">Conversation History</p>
                  <ChatWindow messages={historyMessages} typing={chatTyping} />
                </div>
              )}
            </motion.div>
          )}

          {/* ---- ROUND TRANSITION ---- */}
          {phase === 'round-transition' && (
            <motion.div key="transition" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              <RoundTransition
                completedRoundName={currentRound.name}
                nextRoundName={rounds[currentRoundIdx + 1]?.name || ''}
                onStartNext={handleStartNextRound}
              />
            </motion.div>
          )}

          {/* ---- REVIEW PHASE ---- */}
          {phase === 'review' && (
            <motion.div
              key="review"
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              <div>
                <h2 className="text-xl md:text-2xl font-extrabold text-white">Review Your Answers</h2>
                <p className="text-sm text-gray-400 mt-1">Review all your answers before submitting. You can edit any answer.</p>
              </div>

              {/* Round Score Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {rounds.map((round) => {
                  const answered = round.questions.filter((q) => q.answer.trim().length > 0).length;
                  const completion = Math.round((answered / round.questions.length) * 100);
                  return (
                    <div key={round.name} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{round.name}</p>
                      <p className="text-2xl font-extrabold text-primary-light mt-1">{completion}%</p>
                      <p className="text-[10px] text-gray-600">Complete</p>
                    </div>
                  );
                })}
              </div>

              {/* Overall Completion */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500 font-semibold uppercase tracking-wider">Overall Completion</span>
                  <span className="text-sm font-bold text-white">
                    {Math.round(
                      rounds.reduce((a, r) => a + r.questions.filter((q) => q.answer.trim()).length, 0) /
                      rounds.reduce((a, r) => a + r.questions.length, 0) * 100
                    )}%
                  </span>
                </div>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.round(
                        rounds.reduce((a, r) => a + r.questions.filter((q) => q.answer.trim()).length, 0) /
                        rounds.reduce((a, r) => a + r.questions.length, 0) * 100
                      )}%`,
                    }}
                    transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                  />
                </div>
              </div>

              <div className="space-y-4">
                {rounds.map((round, ri) => (
                  <ReviewCard
                    key={round.name}
                    roundName={round.name}
                    questions={round.questions}
                    onEdit={(qi) => handleEditAnswer(ri, qi)}
                    score={Math.round(Math.random() * 20 + 70)}
                  />
                ))}
              </div>

              {submitError && (
                <p
                  role="alert"
                  className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3"
                >
                  {submitError}
                </p>
              )}

              <button
                onClick={handleSubmitReport}
                className="w-full text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3.5 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                Submit All Answers
              </button>
            </motion.div>
          )}

          {/* ---- SUBMITTING PHASE ---- */}
          {phase === 'submitting' && (
            <motion.div key="submitting" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              <LoadingOverlay
                title="Generating Your Report"
                steps={[
                  'Uploading Responses',
                  'Analyzing Technical Accuracy',
                  'Evaluating Communication',
                  'Preparing Final Report',
                ]}
                currentStep={submissionStep}
                percent={submissionPercent}
              />
            </motion.div>
          )}

          {/* ---- TERMINATED PHASE ---- */}
          {phase === 'terminated' && (
            <motion.div key="terminated" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              <TerminatedPhase
                onDashboard={() => navigate('/applicant/dashboard')}
                onContactSupport={() => navigate('/applicant/settings')}
              />
            </motion.div>
          )}

          {/* ---- SUCCESS PHASE ---- */}
          {phase === 'success' && (
            <motion.div key="success" variants={staggerContainer} initial="hidden" animate="visible" exit={{ opacity: 0 }}>
              <SuccessPhase
                onDashboard={() => navigate('/applicant/dashboard')}
                onViewFeedback={() => navigate('/applicant/interview-reports')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}