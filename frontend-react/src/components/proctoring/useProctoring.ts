import { useEffect, useRef, useState, useCallback } from 'react';
import { ProctoringService } from './ProctoringService';
import type {
  ProctoringEvents,
  ProctoringOptions,
  ProctoringPhase,
  ProctoringStatus,
  ProctoringSummary,
  ProctoringViolation,
  ViolationType,
} from './ProctoringTypes';

/**
 * React hook that wraps ProctoringService for declarative use.
 * Provides status, violation tracking, and lifecycle management.
 */
export function useProctoring(options: ProctoringOptions = {}, events: ProctoringEvents = {}) {
  const serviceRef = useRef<ProctoringService | null>(null);
  if (!serviceRef.current) {
    serviceRef.current = new ProctoringService(options, events);
  }

  const [status, setStatus] = useState<ProctoringStatus>({
    cameraActive: false,
    faceDetected: false,
    multipleFacesDetected: false,
    faceMissing: false,
    recording: false,
    warningsRemaining: options.maxWarnings ?? 3,
    cameraBlocked: false,
    isFullscreen: false,
    dialogOpen: false,
  });
  const [phase, setPhase] = useState<ProctoringPhase>('idle');
  const [warnings, setWarnings] = useState(0);
  const [summary, setSummary] = useState<ProctoringSummary | null>(null);
  const [lastViolation, setLastViolation] = useState<ProctoringViolation | null>(null);

  /* Auto-destroy on unmount */
  useEffect(() => {
    // StrictMode (dev) double-invokes effects: mount -> cleanup (nulls the
    // ref) -> mount. Recreate the service if the previous cleanup cleared it,
    // otherwise `serviceRef.current` is null here and the component crashes
    // with a blank screen. The render-phase lazy-init above only runs once.
    if (!serviceRef.current) {
      serviceRef.current = new ProctoringService(options, events);
    }
    const service = serviceRef.current!;
    const wiredEvents: ProctoringEvents = {
      onStatusChange: (s: ProctoringStatus) => setStatus(s),
      onViolation: (v: ProctoringViolation) => {
        setLastViolation(v);
        setWarnings(v.warningCount);
        events.onViolation?.(v);
      },
      onWarningCountChange: (n: number) => {
        setWarnings(n);
        events.onWarningCountChange?.(n);
      },
      onTerminate: (reason: ViolationType, s: ProctoringSummary) => {
        setSummary(s);
        events.onTerminate?.(reason, s);
      },
      onSnapshotCaptured: events.onSnapshotCaptured,
      onCameraStateChange: (state: 'active' | 'denied' | 'blocked' | 'unavailable') => {
        events.onCameraStateChange?.(state);
        setPhase(
          state === 'denied' ? 'camera-denied' :
          state === 'blocked' ? 'camera-blocked' :
          state === 'unavailable' ? 'camera-unavailable' : 'camera-active'
        );
      },
    };
    service.setEvents(wiredEvents);

    return () => {
      service.stop();
      serviceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async (container?: HTMLVideoElement | HTMLElement) => {
    const service = serviceRef.current!;
    await service.start(container);
    setPhase(service.phase);
  }, []);

  const stop = useCallback(() => {
    const service = serviceRef.current!;
    service.stop();
    setPhase('idle');
  }, []);

  const captureSnapshot = useCallback((type: 'start' | 'interval' | 'end') => {
    const service = serviceRef.current!;
    return service.captureSnapshot(type, service.warnings);
  }, []);

  /** Acknowledge the currently displayed violation ("Continue Interview").
   *  The violation itself stays recorded — warnings, snapshots, the violation
   *  log and the proctoring summary are untouched; only the dialog is cleared
   *  so the interview can continue at the exact position it was interrupted. */
  const dismissViolation = useCallback(() => {
    setLastViolation(null);
  }, []);

  const refreshSummary = useCallback(() => {
    const service = serviceRef.current!;
    setSummary(service.summary);
  }, []);

  /** Adopt the server's authoritative warning count (never lowers it). */
  const syncWarningCount = useCallback((count: number) => {
    serviceRef.current?.syncWarningCount(count);
    setWarnings((prev) => Math.max(prev, Math.floor(Number(count)) || 0));
  }, []);

  return {
    service: serviceRef.current,
    status,
    phase,
    warnings,
    summary,
    lastViolation,
    start,
    stop,
    captureSnapshot,
    refreshSummary,
    dismissViolation,
    syncWarningCount,
  };
}

/**
 * Alias export matching the requested component name.
 */
export { useProctoring as FaceDetectionHook };