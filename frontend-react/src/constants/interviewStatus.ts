/* ------------------------------------------------------------------ */
/*  Centralized Interview Status Constants                             */
/*  Single source of truth for all interview lifecycle states.        */
/* ------------------------------------------------------------------ */

export const InterviewStatus = {
  APPLICATION_SUBMITTED: 'Application Submitted',
  RESUME_UNDER_REVIEW: 'Resume Under Review',
  RESUME_ACCEPTED: 'Resume Accepted',
  INTERVIEW_SCHEDULED: 'Interview Scheduled',
  INTERVIEW_READY: 'Interview Ready',
  INTERVIEW_STARTED: 'Interview Started',
  INTERVIEW_IN_PROGRESS: 'Interview In Progress',
  INTERVIEW_SUBMITTED: 'Interview Submitted',
  AI_REPORT_GENERATED: 'AI Report Generated',
  INTERVIEW_COMPLETED: 'Interview Completed',
  INTERVIEW_EXPIRED: 'Interview Expired',
  INTERVIEW_ABANDONED: 'Interview Abandoned',
  INTERVIEW_VIOLATED: 'Interview Violated',
  INTERVIEW_TERMINATED: 'Interview Terminated',
  HR_REVIEWING: 'HR Reviewing',
  DECISION_PENDING: 'Decision Pending',
  SELECTED: 'Selected',
  REJECTED: 'Rejected',
} as const;

export type InterviewStatusType = typeof InterviewStatus[keyof typeof InterviewStatus];

/* ------------------------------------------------------------------ */
/*  Status Lifecycle Order                                             */
/* ------------------------------------------------------------------ */

export const INTERVIEW_STATUS_ORDER: InterviewStatusType[] = [
  InterviewStatus.APPLICATION_SUBMITTED,
  InterviewStatus.RESUME_UNDER_REVIEW,
  InterviewStatus.RESUME_ACCEPTED,
  InterviewStatus.INTERVIEW_SCHEDULED,
  InterviewStatus.INTERVIEW_READY,
  InterviewStatus.INTERVIEW_STARTED,
  InterviewStatus.INTERVIEW_IN_PROGRESS,
  InterviewStatus.INTERVIEW_SUBMITTED,
  InterviewStatus.AI_REPORT_GENERATED,
  InterviewStatus.INTERVIEW_COMPLETED,
  InterviewStatus.INTERVIEW_EXPIRED,
  InterviewStatus.INTERVIEW_ABANDONED,
  InterviewStatus.INTERVIEW_VIOLATED,
  InterviewStatus.INTERVIEW_TERMINATED,

  InterviewStatus.HR_REVIEWING,
  InterviewStatus.DECISION_PENDING,
  InterviewStatus.SELECTED,
  InterviewStatus.REJECTED,
];

/* ------------------------------------------------------------------ */
/*  Status Badge Styles                                                */
/* ------------------------------------------------------------------ */

export const INTERVIEW_STATUS_STYLES: Record<InterviewStatusType, string> = {
  [InterviewStatus.APPLICATION_SUBMITTED]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  [InterviewStatus.RESUME_UNDER_REVIEW]: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  [InterviewStatus.RESUME_ACCEPTED]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  [InterviewStatus.INTERVIEW_SCHEDULED]: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  [InterviewStatus.INTERVIEW_READY]: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  [InterviewStatus.INTERVIEW_STARTED]: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  [InterviewStatus.INTERVIEW_IN_PROGRESS]: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  [InterviewStatus.INTERVIEW_SUBMITTED]: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  [InterviewStatus.AI_REPORT_GENERATED]: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  [InterviewStatus.INTERVIEW_COMPLETED]: 'bg-green-500/10 text-green-400 border-green-500/20',
  [InterviewStatus.INTERVIEW_EXPIRED]: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  [InterviewStatus.INTERVIEW_ABANDONED]: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  [InterviewStatus.INTERVIEW_VIOLATED]: 'bg-red-600/10 text-red-500 border-red-600/20',
  [InterviewStatus.INTERVIEW_TERMINATED]: 'bg-red-700/10 text-red-400 border-red-700/20',
  [InterviewStatus.HR_REVIEWING]: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  [InterviewStatus.DECISION_PENDING]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  [InterviewStatus.SELECTED]: 'bg-green-600/10 text-green-500 border-green-600/20',
  [InterviewStatus.REJECTED]: 'bg-red-500/10 text-red-400 border-red-500/20',
};

/* ------------------------------------------------------------------ */
/*  Status Icons                                                       */
/* ------------------------------------------------------------------ */

export const INTERVIEW_STATUS_ICONS: Record<InterviewStatusType, string> = {
  [InterviewStatus.APPLICATION_SUBMITTED]: '📝',
  [InterviewStatus.RESUME_UNDER_REVIEW]: '📄',
  [InterviewStatus.RESUME_ACCEPTED]: '✅',
  [InterviewStatus.INTERVIEW_SCHEDULED]: '📅',
  [InterviewStatus.INTERVIEW_READY]: '🎤',
  [InterviewStatus.INTERVIEW_STARTED]: '▶️',
  [InterviewStatus.INTERVIEW_IN_PROGRESS]: '🔄',
  [InterviewStatus.INTERVIEW_SUBMITTED]: '📤',
  [InterviewStatus.AI_REPORT_GENERATED]: '🤖',
  [InterviewStatus.INTERVIEW_COMPLETED]: '🏁',
  [InterviewStatus.INTERVIEW_EXPIRED]: '⏰',
  [InterviewStatus.INTERVIEW_ABANDONED]: '🚪',
  [InterviewStatus.INTERVIEW_VIOLATED]: '🚫',
  [InterviewStatus.INTERVIEW_TERMINATED]: '⛔',
  [InterviewStatus.HR_REVIEWING]: '👥',
  [InterviewStatus.DECISION_PENDING]: '⏳',
  [InterviewStatus.SELECTED]: '🎉',
  [InterviewStatus.REJECTED]: '❌',
};

/* ------------------------------------------------------------------ */
/*  Reissue Eligibility                                                */
/* ------------------------------------------------------------------ */

export const REISSUE_ALLOWED_STATUSES: InterviewStatusType[] = [
  InterviewStatus.INTERVIEW_EXPIRED,
];

export const REISSUE_BLOCKED_STATUSES: InterviewStatusType[] = [
  InterviewStatus.INTERVIEW_STARTED,
  InterviewStatus.INTERVIEW_IN_PROGRESS,
  InterviewStatus.INTERVIEW_SUBMITTED,
  InterviewStatus.AI_REPORT_GENERATED,
  InterviewStatus.INTERVIEW_COMPLETED,
  InterviewStatus.HR_REVIEWING,
  InterviewStatus.DECISION_PENDING,
  InterviewStatus.SELECTED,
  InterviewStatus.REJECTED,
];

/* ------------------------------------------------------------------ */
/*  Status Helpers                                                     */
/* ------------------------------------------------------------------ */

export function isReissueAllowed(status: InterviewStatusType): boolean {
  return REISSUE_ALLOWED_STATUSES.includes(status);
}

export function isInterviewActive(status: InterviewStatusType): boolean {
  return (
    status === InterviewStatus.INTERVIEW_STARTED ||
    status === InterviewStatus.INTERVIEW_IN_PROGRESS
  );
}

export function isInterviewCompleted(status: InterviewStatusType): boolean {
  return (
    status === InterviewStatus.INTERVIEW_COMPLETED ||
    status === InterviewStatus.HR_REVIEWING ||
    status === InterviewStatus.DECISION_PENDING ||
    status === InterviewStatus.SELECTED ||
    status === InterviewStatus.REJECTED
  );
}

export function getStatusIndex(status: InterviewStatusType): number {
  return INTERVIEW_STATUS_ORDER.indexOf(status);
}

export function getStatusProgress(status: InterviewStatusType): number {
  const idx = getStatusIndex(status);
  if (idx === -1) return 0;
  return Math.round((idx / (INTERVIEW_STATUS_ORDER.length - 1)) * 100);
}