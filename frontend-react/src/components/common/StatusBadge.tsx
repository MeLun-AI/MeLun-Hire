import { memo } from 'react';
import {
  INTERVIEW_STATUS_STYLES,
  INTERVIEW_STATUS_ICONS,
  type InterviewStatusType,
} from '../../constants/interviewStatus';

interface StatusBadgeProps {
  status: InterviewStatusType;
}

const StatusBadge = memo(function StatusBadge({ status }: StatusBadgeProps) {
  const style = INTERVIEW_STATUS_STYLES[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  const icon = INTERVIEW_STATUS_ICONS[status] || '📋';

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-medium whitespace-nowrap ${style}`}>
      <span className="text-xs" aria-hidden="true">{icon}</span>
      {status}
    </span>
  );
});

export default StatusBadge;