import type { ProctoringStatus } from './ProctoringTypes';

interface StatusItem {
  label: string;
  active: boolean;
  color: string;
  pulse?: boolean;
}

interface StatusIndicatorProps {
  status: ProctoringStatus;
  compact?: boolean;
}

/**
 * Compact status strip showing camera, face, recording, and warning state.
 */
export default function StatusIndicator({ status, compact = false }: StatusIndicatorProps) {
  const items: StatusItem[] = [
    {
      label: 'Camera Active',
      active: status.cameraActive,
      color: status.cameraBlocked ? 'text-red-400' : 'text-green-400',
      pulse: status.cameraActive,
    },
    {
      label: 'Face Detected',
      active: status.faceDetected,
      color: status.faceMissing ? 'text-yellow-400' : 'text-green-400',
    },
    {
      label: 'Recording',
      active: status.recording,
      color: 'text-red-400',
      pulse: status.recording,
    },
    {
      label: 'Warnings',
      active: true,
      color: status.warningsRemaining <= 1 ? 'text-red-400' : 'text-yellow-400',
    },
  ];

  return (
    <div className={`flex items-center gap-3 ${compact ? 'flex-wrap' : ''}`}>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              item.active ? (item.pulse ? `${item.color} bg-current animate-pulse` : `${item.color} bg-current`) : 'bg-white/15'
            }`}
            aria-hidden="true"
          />
          <span className={`text-[10px] ${item.active ? item.color : 'text-gray-600'}`}>
            {item.label}
            {item.label === 'Warnings' && ` (${status.warningsRemaining})`}
          </span>
        </div>
      ))}
    </div>
  );
}