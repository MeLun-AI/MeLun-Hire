interface WarningCounterProps {
  warnings: number;
  maxWarnings: number;
  compact?: boolean;
}

/**
 * Visual indicator for how many proctoring warnings remain.
 * Displays warning dots and a count badge.
 */
export default function WarningCounter({ warnings, maxWarnings, compact = false }: WarningCounterProps) {
  const remaining = Math.max(0, maxWarnings - warnings);
  const critical = remaining <= 1;

  return (
    <div className="flex items-center gap-2">
      {/* Warning dots */}
      <div className="flex items-center gap-1">
        {Array.from({ length: maxWarnings }).map((_, i) => (
          <span
            key={i}
            className={`rounded-full transition-all ${
              compact ? 'w-1.5 h-1.5' : 'w-2 h-2'
            } ${
              i < warnings
                ? 'bg-red-500'
                : 'bg-white/15'
            } ${critical && i >= warnings ? 'animate-pulse' : ''}`}
            aria-hidden="true"
          />
        ))}
      </div>

      {!compact && (
        <span className={`text-[10px] font-medium ${
          critical ? 'text-red-400' : 'text-gray-500'
        }`}>
          {remaining} left
        </span>
      )}
    </div>
  );
}