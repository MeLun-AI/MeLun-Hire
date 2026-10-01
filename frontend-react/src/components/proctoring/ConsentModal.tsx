import { useState } from 'react';
import { motion } from 'framer-motion';

interface ConsentModalProps {
  onAgree: () => void;
  onDecline: () => void;
  loading?: boolean;
}

/**
 * Privacy consent dialog shown before the webcam is enabled.
 * Explains clearly that monitoring is used only for interview integrity.
 */
export default function ConsentModal({ onAgree, onDecline, loading = false }: ConsentModalProps) {
  const [understood, setUnderstood] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Camera consent"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-navy-900 border border-white/10 rounded-2xl p-6 md:p-8 max-w-lg w-full space-y-5"
      >
        <div className="text-center">
          <div className="text-4xl mb-3" aria-hidden="true">🎥</div>
          <h2 className="text-xl font-extrabold text-white">Camera Monitoring Consent</h2>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3 text-sm text-gray-400">
          <p>
            To maintain interview integrity, your webcam will be used for <strong className="text-white">real-time monitoring</strong> during this interview.
          </p>
          <ul className="space-y-2 text-xs">
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>Your webcam feed is processed <strong className="text-white">locally in your browser</strong>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>Monitoring is used <strong className="text-white">only</strong> for detecting tab-switching, focus loss, and face presence.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>Sparse snapshots are captured for the HR report and are <strong className="text-white">never shared publicly</strong>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>You must remain in view of the camera. <strong className="text-white">3 warnings</strong> will terminate the interview.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-green-400 shrink-0">✓</span>
              <span>The camera turns off <strong className="text-white">immediately</strong> when the interview ends.</span>
            </li>
          </ul>
        </div>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-primary shrink-0"
            aria-label="I understand and consent"
          />
          <span className="text-gray-400">
            I understand and consent to the use of my webcam for interview integrity monitoring.
          </span>
        </label>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onDecline}
            disabled={loading}
            className="flex-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 rounded-xl transition-all disabled:opacity-40"
          >
            No, I decline
          </button>
          <button
            onClick={onAgree}
            disabled={!understood || loading}
            className="flex-1 text-sm bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-all btn-lift focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Starting camera...
              </span>
            ) : (
              'Agree & Continue'
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}