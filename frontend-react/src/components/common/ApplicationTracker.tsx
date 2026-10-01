import { memo } from 'react';
import { motion } from 'framer-motion';
import { InterviewStatus, type InterviewStatusType } from '../../constants/interviewStatus';

interface ApplicationTrackerProps {
  status: InterviewStatusType;
}

type StageState = 'done' | 'current';

interface ApplicationStage {
  label: string;
  state: StageState;
}

/* Application-level tracker.
   Stages are derived from the REAL application lifecycle status
   (pending / approved / rejected) plus the interview lifecycle the backend
   actually reports. Interview stages only appear when the backend really has
   an interview for the application (an access code was issued or the
   interview_status moved past its default 'Not Started'), so no interview
   step is ever invented. */
const APPLICATION_STAGES: Partial<Record<InterviewStatusType, ApplicationStage[]>> = {
  [InterviewStatus.RESUME_UNDER_REVIEW]: [
    { label: 'Applied', state: 'done' },
    { label: 'Under Review', state: 'current' },
  ],
  [InterviewStatus.RESUME_ACCEPTED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'current' },
  ],
  /* Post-interview outcome: SELECTED. The decision is the interview's outcome,
     so the interview steps are shown as completed before it. */
  [InterviewStatus.SELECTED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Interview Completed', state: 'done' },
    { label: 'Selected', state: 'current' },
  ],
  [InterviewStatus.REJECTED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Under Review', state: 'done' },
    { label: 'Not Selected', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_SCHEDULED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Scheduled', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_IN_PROGRESS]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Scheduled', state: 'done' },
    { label: 'Interview In Progress', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_COMPLETED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Scheduled', state: 'done' },
    { label: 'Interview Completed', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_EXPIRED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Scheduled', state: 'done' },
    { label: 'Interview Expired', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_ABANDONED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Abandoned', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_VIOLATED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Violated', state: 'current' },
  ],
  [InterviewStatus.INTERVIEW_TERMINATED]: [
    { label: 'Applied', state: 'done' },
    { label: 'Resume Reviewed', state: 'done' },
    { label: 'Shortlisted', state: 'done' },
    { label: 'Interview Terminated', state: 'current' },
  ],
};

const ApplicationTracker = memo(function ApplicationTracker({ status }: ApplicationTrackerProps) {
  const stages = APPLICATION_STAGES[status];
  if (!stages || stages.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {stages.map((stage, i) => {
        const isDone = stage.state === 'done';
        const isCurrent = stage.state === 'current';
        return (
          <div key={stage.label} className="flex items-center shrink-0">
            <div className="flex flex-col items-center">
              <motion.div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                  isCurrent
                    ? 'bg-primary/20 border-primary text-primary-light'
                    : isDone
                      ? 'bg-green-500/20 border-green-500 text-green-400'
                      : 'bg-white/5 border-white/10 text-gray-600'
                }`}
              >
                {isDone ? '✓' : isCurrent ? '●' : i + 1}
              </motion.div>
              <span className={`text-[8px] mt-1 whitespace-nowrap ${
                isCurrent ? 'text-primary-light font-semibold' : isDone ? 'text-green-400' : 'text-gray-600'
              }`}>
                {stage.label.length > 14 ? stage.label.slice(0, 14) + '…' : stage.label}
              </span>
            </div>
            {i < stages.length - 1 && (
              <div className={`w-6 h-0.5 mx-0.5 mt-[-1rem] ${isDone ? 'bg-green-500/50' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
});

export default ApplicationTracker;