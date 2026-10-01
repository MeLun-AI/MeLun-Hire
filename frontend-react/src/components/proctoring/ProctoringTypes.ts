/* ------------------------------------------------------------------ */
/*  Proctoring Shared Types                                             */
/* ------------------------------------------------------------------ */

export type ProctoringPhase =
  | 'idle'
  | 'requesting-permission'
  | 'permission-granted'
  | 'camera-active'
  | 'camera-denied'
  | 'camera-blocked'
  | 'camera-unavailable'
  | 'terminated';

export type ViolationType =
  | 'browser_minimized'
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'multiple_faces'
  | 'face_missing'
  | 'camera_blocked';

export interface ProctoringSnapshot {
  timestamp: string;
  violationType: ViolationType | 'start' | 'interval' | 'end';
  snapshotRef: string;
  warningCount: number;
}

export interface ProctoringViolation {
  type: ViolationType;
  timestamp: string;
  warningCount: number;
  message: string;
  screenshotRef?: string;
}

export interface ViolationLogEntry {
  timestamp: string;
  violationType: ViolationType;
  warningNumber: number;
  currentQuestion: number;
  currentRound: string;
}

export interface ProctoringStatus {
  cameraActive: boolean;
  faceDetected: boolean;
  multipleFacesDetected: boolean;
  faceMissing: boolean;
  recording: boolean;
  warningsRemaining: number;
  cameraBlocked: boolean;
  isFullscreen: boolean;
  dialogOpen: boolean;
}

export interface ProctoringSummary {
  cameraStatus: 'active' | 'blocked' | 'denied' | 'unavailable';
  totalWarnings: number;
  tabSwitches: number;
  windowBlurs: number;
  fullscreenExits: number;
  multipleFaceEvents: number;
  faceMissingEvents: number;
  faceDetectionRate: number;
  integrityScore: number;
  terminatedEarly: boolean;
  terminationReason?: string;
  terminatedAt?: string;
  violationTimeline: ViolationLogEntry[];
  progressAtTermination?: string;
  snapshots: ProctoringSnapshot[];
}

export interface ProctoringEvents {
  onViolation?: (violation: ProctoringViolation) => void;
  onWarningCountChange?: (count: number) => void;
  onTerminate?: (reason: ViolationType, summary: ProctoringSummary) => void;
  onStatusChange?: (status: ProctoringStatus) => void;
  onSnapshotCaptured?: (snapshot: ProctoringSnapshot) => void;
  onCameraStateChange?: (state: 'active' | 'denied' | 'blocked' | 'unavailable') => void;
}

export interface ProctoringOptions {
  maxWarnings?: number;
  snapshotIntervalMs?: number;
  frameSampleMs?: number;
  faceLossGraceMs?: number;
  mirrorPreview?: boolean;
  fullscreenRequired?: boolean;
  /** Callback to get current progress context for violation logs */
  getProgressContext?: () => { question: number; round: string };
}