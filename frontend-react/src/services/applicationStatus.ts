/* ------------------------------------------------------------------ */
/*  Centralized Application Status Mapper                              */
/*  SINGLE authority for mapping the backend application `status`      */
/*  value to the existing beautiful UI labels + badge/tracker types.   */
/*  Never maintain a parallel frontend-only status system.             */
/* ------------------------------------------------------------------ */

import { InterviewStatus, type InterviewStatusType } from '../constants/interviewStatus';

export type BackendApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface MappedApplicationStatus {
  key: BackendApplicationStatus;
  /** Type consumed by StatusBadge / ApplicationTracker. */
  interview: InterviewStatusType;
  /** Human label used in plain-text status chips/tables. */
  label: string;
}

export const APPLICATION_STATUS_MAP: Record<BackendApplicationStatus, MappedApplicationStatus> = {
  pending: {
    key: 'pending',
    interview: InterviewStatus.RESUME_UNDER_REVIEW,
    label: 'Under Review',
  },
  approved: {
    key: 'approved',
    interview: InterviewStatus.RESUME_ACCEPTED,
    label: 'Resume Accepted',
  },
  rejected: {
    key: 'rejected',
    interview: InterviewStatus.REJECTED,
    label: 'Rejected',
  },
};

export function normalizeBackendStatus(status?: string | null): BackendApplicationStatus {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return 'pending';
}

export function mapApplicationStatus(status?: string | null): MappedApplicationStatus {
  return APPLICATION_STATUS_MAP[normalizeBackendStatus(status)];
}