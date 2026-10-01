import { memo } from 'react';
import { motion } from 'framer-motion';

interface ProgressBarProps {
  current: number;    // 1-based
  total: number;
  roundName: string;
}

const ProgressBar = memo(function ProgressBar({ current, total, roundName }: ProgressBarProps) {
  const percent = Math.round((current / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400 font-medium">{roundName}</span>
        <span className="text-gray-500 tabular-nums">
          Question {current} / {total}
        </span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        />
      </div>
      {/* Dot indicators */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < current ? 'bg-primary w-4' : i === current ? 'bg-primary/40 w-3' : 'bg-white/10 w-2'
            }`}
          />
        ))}
      </div>
    </div>
  );
});

export default ProgressBar;