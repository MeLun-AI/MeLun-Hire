import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraPreview from './CameraPreview';
import StatusIndicator from './StatusIndicator';
import WarningCounter from './WarningCounter';
import type { ProctoringStatus } from './ProctoringTypes';

interface FloatingWebcamProps {
  stream: MediaStream | null;
  status: ProctoringStatus;
  warnings: number;
  maxWarnings: number;
  visible?: boolean;
  onExpand?: () => void;
  minimized?: boolean;
}

/**
 * Floating webcam preview shown during the interview.
 * Small and unobtrusive — doesn't interfere with typing.
 */
const FloatingWebcam = memo(function FloatingWebcam({
  stream,
  status,
  warnings,
  maxWarnings,
  visible = true,
  minimized = false,
}: FloatingWebcamProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className={`fixed right-4 top-20 z-40 bg-navy-900/90 backdrop-blur-md border border-white/10 rounded-2xl p-2 shadow-2xl ${
            minimized ? 'w-24' : 'w-40'
          }`}
          aria-label="Webcam monitoring"
        >
          <div className="overflow-hidden rounded-xl">
            <CameraPreview
              stream={stream}
              mirrored
              showOverlay={!stream}
              overlayState={stream ? 'none' : 'off'}
              className={minimized ? 'h-16' : 'h-24'}
            />
          </div>

          {!minimized && (
            <div className="px-1.5 pt-2 space-y-2">
              <StatusIndicator status={status} compact />
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-gray-600 uppercase tracking-wider">Warnings</span>
                <WarningCounter warnings={warnings} maxWarnings={maxWarnings} compact />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
});

export default FloatingWebcam;