import { useState, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  InterviewTimer                                                     */
/*  Uses a fixed start timestamp so it never resets on re-render.     */
/* ------------------------------------------------------------------ */

interface InterviewTimerProps {
  startTimestamp: number;       // Date.now() when interview started
  totalMinutes: number;         // e.g. 30
  onTimeUp: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const InterviewTimer = memo(function InterviewTimer({
  startTimestamp,
  totalMinutes,
  onTimeUp,
}: InterviewTimerProps) {
  const totalSeconds = totalMinutes * 60;
  const [remaining, setRemaining] = useState(() => {
    const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
    return Math.max(0, totalSeconds - elapsed);
  });
  const warned = useRef(false);

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startTimestamp) / 1000);
      const left = Math.max(0, totalSeconds - elapsed);
      setRemaining(left);

      if (left <= 0) {
        onTimeUp();
      }

      // Warning at 1 minute
      if (left <= 60 && !warned.current) {
        warned.current = true;
      }
    };

    tick(); // immediate
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTimestamp, totalSeconds, onTimeUp]);

  const percent = (remaining / totalSeconds) * 100;
  const isLow = remaining <= 60;
  const isCritical = remaining <= 30;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5"
    >
      <div className="relative w-20 h-20">
        <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="5" />
          <motion.circle
            cx="40" cy="40" r="34"
            fill="none"
            stroke={isCritical ? '#ef4444' : isLow ? '#f59e0b' : '#3b82f6'}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 34}`}
            animate={{ strokeDashoffset: (2 * Math.PI * 34) * (1 - percent / 100) }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            className={`text-lg font-extrabold tabular-nums ${
              isCritical ? 'text-red-400' : isLow ? 'text-yellow-400' : 'text-white'
            }`}
            key={remaining}
            initial={{ scale: 1.1, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
          >
            {formatTime(remaining)}
          </motion.span>
        </div>
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold leading-tight">
        Remaining
        <br />
        Time
      </div>
    </motion.div>
  );
});

export default InterviewTimer;