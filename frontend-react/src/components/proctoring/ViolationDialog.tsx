import { motion } from 'framer-motion';
import type { ProctoringViolation } from './ProctoringTypes';

interface ViolationDialogProps {
  violation: ProctoringViolation | null;
  warningsRemaining: number;
  maxWarnings: number;
  onDismiss: () => void;
  onReturnToFullscreen?: () => void;
  onTerminate?: () => void;
}

const VIOLATION_META: Record<string, { icon: string; title: string; color: string; message: string }> = {
  browser_minimized: {
    icon: '📉',
    title: 'Browser Minimized',
    color: 'text-red-400',
    message: 'The browser window was minimized. Please keep the interview window visible at all times.',
  },
  tab_switch: {
    icon: '🔄',
    title: 'Tab Switch Detected',
    color: 'text-red-400',
    message: 'You switched to another tab or window. This is not allowed during the interview.',
  },
  window_blur: {
    icon: '👁️',
    title: 'Window Focus Lost',
    color: 'text-yellow-400',
    message: 'The interview window lost focus. Please keep this window active.',
  },
  fullscreen_exit: {
    icon: '⛶',
    title: 'Fullscreen Exited',
    color: 'text-yellow-400',
    message: 'You exited fullscreen mode. Fullscreen is required during the interview.',
  },
  multiple_faces: {
    icon: '👥',
    title: 'Multiple Faces Detected',
    color: 'text-red-400',
    message: 'Multiple faces detected in the camera view. Only one person should be visible.',
  },
  face_missing: {
    icon: '🙈',
    title: 'Face Not Detected',
    color: 'text-yellow-400',
    message: 'Face not detected for several seconds. Please stay in view of the camera.',
  },
  camera_blocked: {
    icon: '🚫',
    title: 'Camera Blocked',
    color: 'text-red-400',
    message: 'Camera stream is not producing frames. This may indicate the camera is blocked.',
  },
};

/**
 * Premium warning dialog shown when a proctoring violation occurs.
 * Provides "Continue Interview" and "Return to Fullscreen" actions.
 */
export default function ViolationDialog({
  violation,
  warningsRemaining,
  maxWarnings,
  onDismiss,
  onReturnToFullscreen,
  onTerminate,
}: ViolationDialogProps) {
  if (!violation) return null;

  const meta = VIOLATION_META[violation.type] ?? {
    icon: '⚠️',
    title: 'Proctoring Warning',
    color: 'text-yellow-400',
    message: violation.message,
  };
  const isLast = warningsRemaining <= 1;
  const isFullscreenViolation = violation.type === 'fullscreen_exit';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="bg-navy-900 border border-white/10 rounded-2xl p-6 md:p-8 max-w-md w-full text-center space-y-5 shadow-2xl"
      >
        <div className="text-5xl" aria-hidden="true">{meta.icon}</div>
        <div>
          <h2 className={`text-xl font-extrabold ${meta.color}`}>{meta.title}</h2>
          <p className="text-sm text-gray-400 mt-2">{meta.message}</p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 space-y-2">
          <p className="text-xs text-gray-500">
            Warning {violation.warningCount} of {maxWarnings} —{' '}
            {isLast ? (
              <span className="text-red-400 font-semibold">after this warning the interview will be terminated.</span>
            ) : (
              `you have ${warningsRemaining} warning${warningsRemaining === 1 ? '' : 's'} remaining.`
            )}
          </p>
          {/* Warning dots */}
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: maxWarnings }).map((_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${i < violation.warningCount ? 'bg-red-500' : 'bg-white/15'}`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {isFullscreenViolation && onReturnToFullscreen && (
            <button
              onClick={onReturnToFullscreen}
              className="w-full text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            >
              ⛶ Return to Fullscreen
            </button>
          )}
          <button
            onClick={onDismiss}
            className={`w-full text-sm font-semibold py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${
              isFullscreenViolation && onReturnToFullscreen
                ? 'bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300'
                : 'bg-primary hover:bg-primary-hover text-white btn-lift'
            }`}
          >
            Continue Interview
          </button>
          {isLast && onTerminate && (
            <button
              onClick={onTerminate}
              className="w-full text-sm bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-3 rounded-xl transition-all"
            >
              End Interview
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}