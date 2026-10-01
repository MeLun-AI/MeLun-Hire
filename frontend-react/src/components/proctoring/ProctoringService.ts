import type {
  ProctoringEvents,
  ProctoringOptions,
  ProctoringPhase,
  ProctoringSnapshot,
  ProctoringStatus,
  ProctoringViolation,
  ViolationType,
  ProctoringSummary,
} from './ProctoringTypes';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_OPTIONS: Required<ProctoringOptions> = {
  maxWarnings: 3,
  snapshotIntervalMs: 60000,
  frameSampleMs: 500,
  faceLossGraceMs: 3000,
  mirrorPreview: true,
  fullscreenRequired: true,
  getProgressContext: () => ({ question: 1, round: 'Technical' }),
};

/* ------------------------------------------------------------------ */
/*  Canvas-based face detection (YCbCr skin surface cascade)           */
/* ------------------------------------------------------------------ */

interface DetectedFace {
  x: number;
  y: number;
  width: number;
  height: number;
}

function detectFaces(imageData: ImageData, sampleStep = 4): DetectedFace[] {
  const { data, width, height } = imageData;
  const candidates: number[] = [];
  const mask = new Uint8Array(width * height);

  for (let y = 0; y < height; y += sampleStep) {
    const row = y * width;
    for (let x = 0; x < width; x += sampleStep) {
      const i = (row + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin =
        r > 95 && g > 40 && b > 20 &&
        r > g && r > b &&
        r - g > 15 &&
        cb >= 77 && cb <= 127 &&
        cr >= 133 && cr <= 173;

      if (isSkin) {
        mask[y * width + x] = 1;
        candidates.push(x, y);
      }
    }
  }

  if (candidates.length < 30) return [];

  const boxes: DetectedFace[] = [];
  const visited = new Set<number>();
  const stride = width;

  for (let i = 0; i < candidates.length; i += 2) {
    const sx = candidates[i];
    const sy = candidates[i + 1];
    const key = sy * stride + sx;
    if (visited.has(key)) continue;

    const queue: [number, number][] = [[sx, sy]];
    visited.add(key);
    let minX = sx, maxX = sx, minY = sy, maxY = sy, count = 0;

    while (queue.length > 0) {
      const [cx, cy] = queue.pop()!;
      count++;
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);

      for (const [dx, dy] of [[-sampleStep, 0], [sampleStep, 0], [0, -sampleStep], [0, sampleStep]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nk = ny * stride + nx;
          if (mask[nk] === 1 && !visited.has(nk)) {
            visited.add(nk);
            queue.push([nx, ny]);
          }
        }
      }
    }

    const minFaceSize = Math.min(width, height) * 0.12;
    if (count >= 20 && (maxX - minX) >= minFaceSize && (maxY - minY) >= minFaceSize) {
      boxes.push({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
  }

  // Merge overlapping boxes
  const merged: DetectedFace[] = [];
  for (const box of boxes) {
    let mergedInto = false;
    for (const m of merged) {
      const overlapX = Math.max(0, Math.min(box.x + box.width, m.x + m.width) - Math.max(box.x, m.x));
      const overlapY = Math.max(0, Math.min(box.y + box.height, m.y + m.height) - Math.max(box.y, m.y));
      const inters = overlapX * overlapY;
      const minArea = Math.min(box.width * box.height, m.width * m.height);
      if (minArea > 0 && inters / minArea > 0.3) {
        m.x = Math.min(m.x, box.x);
        m.y = Math.min(m.y, box.y);
        m.width = Math.max(m.x + m.width, box.x + box.width) - m.x;
        m.height = Math.max(m.y + m.height, box.y + box.height) - m.y;
        mergedInto = true;
        break;
      }
    }
    if (!mergedInto) merged.push({ ...box });
  }

  return merged;
}

/* ------------------------------------------------------------------ */
/*  ProctoringService                                                  */
/* ------------------------------------------------------------------ */

export class ProctoringService {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId = 0;
  private frameTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  /** True while start() is awaiting the camera, so `running` cannot be used yet. */
  private starting = false;

  readonly opts: Required<ProctoringOptions>;
  private eventsRef: ProctoringEvents;

  get events(): ProctoringEvents {
    return this.eventsRef;
  }

  phase: ProctoringPhase = 'idle';
  private warningCount = 0;
  private tabSwitchCount = 0;
  private windowBlurCount = 0;
  private fullscreenExitCount = 0;
  private multipleFaceCount = 0;
  private faceMissingCount = 0;
  private cameraStatus: 'active' | 'blocked' | 'denied' | 'unavailable' = 'unavailable';

  private faceDetected = false;
  private multipleFacesDetected = false;
  /** Live "multiple faces" episode latch (edge detector). True while the
   *  current 2+-face episode is still ongoing; it clears as soon as only
   *  0/1 face is visible again so the NEXT 2+-face episode can raise another
   *  violation. Deliberately separate from `multipleFaceCount` (violation
   *  history) — a recorded violation must never permanently disable face
   *  detection. */
  private multipleFacesActive = false;
  private lastFacePresentAt = 0;
  private facePresentTrackTotal = 0;
  private totalTrackTime = 0;

  private windowBlurredRef = false;
  private fullscreenActiveRef = false;
  private cameraBlockedRef = false;
  private terminated = false;

  private snapshots: ProctoringSnapshot[] = [];
  private violations: ProctoringViolation[] = [];
  private violationLog: import('./ProctoringTypes').ViolationLogEntry[] = [];
  private terminationReason?: string;
  private terminatedAt?: string;
  private progressAtTermination?: string;
  private lastViolationType: ViolationType | null = null;
  private lastViolationAt = 0;
  private dedupeCooldown = 2000; // ms

  constructor(options: ProctoringOptions = {}, events: ProctoringEvents = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.eventsRef = events;
  }

  /** Update event callbacks at runtime (e.g. from a React hook) */
  setEvents(events: ProctoringEvents): void {
    this.eventsRef = events;
  }

  /* ------------------------------------------------------------------ */
  /*  Public API                                                         */
  /* ------------------------------------------------------------------ */

  get isRunning() { return this.running; }
  get warnings() { return this.warningCount; }
  get maxWarnings() { return this.opts.maxWarnings; }

  get summary(): ProctoringSummary {
    const rate = this.totalTrackTime > 0
      ? Math.round((this.facePresentTrackTotal / this.totalTrackTime) * 100)
      : 100;
    return {
      cameraStatus: this.cameraStatus,
      totalWarnings: this.warningCount,
      tabSwitches: this.tabSwitchCount,
      windowBlurs: this.windowBlurCount,
      fullscreenExits: this.fullscreenExitCount,
      multipleFaceEvents: this.multipleFaceCount,
      faceMissingEvents: this.faceMissingCount,
      faceDetectionRate: rate,
      integrityScore: this.computeIntegrityScore(),
      terminatedEarly: this.terminated,
      terminationReason: this.terminationReason,
      terminatedAt: this.terminatedAt,
      progressAtTermination: this.progressAtTermination,
      violationTimeline: [...this.violationLog],
      snapshots: [...this.snapshots],
    };
  }

  async start(container?: HTMLVideoElement | HTMLElement): Promise<void> {
    // `running` is only set once getUserMedia resolves, so without this guard a
    // double click (or any duplicate call) would open a SECOND camera and leak
    // the first MediaStream.
    if (this.running || this.starting) return;
    this.starting = true;
    this.phase = 'requesting-permission';
    this.notifyStatus();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (err) {
      this.starting = false;
      this.handleCameraError(err);
      return;
    }

    // The service was stopped while the permission prompt was open (unmount /
    // navigation away): release the fresh stream instead of starting a
    // detection loop nobody can stop.
    if (!this.starting) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      return;
    }

    if (container instanceof HTMLVideoElement) {
      this.videoEl = container;
    } else {
      this.videoEl = document.createElement('video');
      if (container) container.appendChild(this.videoEl);
      this.videoEl.setAttribute('playsinline', 'true');
      this.videoEl.setAttribute('muted', 'true');
    }
    this.videoEl.srcObject = this.stream;
    this.videoEl.muted = true;
    await this.videoEl.play().catch(() => {
      /* autoplay may be blocked */
    });

    this.canvasEl = document.createElement('canvas');
    this.ctx = this.canvasEl.getContext('2d', { willReadFrequently: true });

    this.phase = 'camera-active';
    this.cameraStatus = 'active';
    this.running = true;

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    this.fullscreenActiveRef = !!document.fullscreenElement;

    this.captureSnapshot('start', this.warningCount);

    this.frameTimer = setInterval(() => this.analyzeFrame(), this.opts.frameSampleMs);

    if (this.opts.snapshotIntervalMs > 0) {
      this.snapshotTimer = setInterval(() => {
        if (this.running && !this.terminated) {
          this.captureSnapshot('interval', this.warningCount);
        }
      }, this.opts.snapshotIntervalMs);
    }

    this.cameraBlockedRef = false;
    // Re-arm the multiple-face episode latch for this monitoring lifecycle so
    // a previous episode (or a previous run of the service) never suppresses
    // the first violation after starting/resuming the interview.
    this.multipleFacesActive = false;
    this.starting = false;
    this.notifyStatus();
    this.events.onCameraStateChange?.('active');
  }

  /** Adopt the server's authoritative warning count for display continuity.
   *  Only ever RAISES the local counter, so a refresh (or a tampered value)
   *  can never erase warnings the server already recorded. */
  syncWarningCount(count: number): void {
    const n = Math.max(0, Math.floor(Number(count)) || 0);
    if (n > this.warningCount) {
      this.warningCount = n;
      this.events.onWarningCountChange?.(this.warningCount);
      this.notifyStatus();
    }
  }

  stop(): void {
    this.running = false;
    this.starting = false;
    this.phase = 'idle';

    if (this.frameTimer) { clearInterval(this.frameTimer); this.frameTimer = null; }
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = 0; }

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.ctx = null;
    this.canvasEl = null;

    this.notifyStatus();
  }

  captureSnapshot(type: ProctoringSnapshot['violationType'], warningCount: number): string | null {
    if (!this.videoEl || !this.ctx || !this.canvasEl) return null;
    const { videoWidth, videoHeight } = this.videoEl;
    if (videoWidth === 0 || videoHeight === 0) return null;

    this.canvasEl.width = videoWidth;
    this.canvasEl.height = videoHeight;
    this.ctx.drawImage(this.videoEl, 0, 0, videoWidth, videoHeight);

    let ref = `snapshot-${Date.now()}.png`;
    try {
      ref = this.canvasEl.toDataURL('image/png');
    } catch {
      /* dataURL may be suppressed */
    }

    const snap: ProctoringSnapshot = {
      timestamp: new Date().toISOString(),
      violationType: type,
      snapshotRef: ref,
      warningCount,
    };
    this.snapshots.push(snap);
    return ref;
  }

  /* ------------------------------------------------------------------ */
  /*  Violation / Warning Logic                                          */
  /* ------------------------------------------------------------------ */

  private triggerViolation(type: ViolationType, message: string): void {
    if (!this.running || this.terminated) return;

    // Deduplicate: don't fire twice for the same event type within cooldown window
    const now = Date.now();
    if (this.lastViolationType === type && now - this.lastViolationAt < this.dedupeCooldown) {
      return;
    }
    this.lastViolationType = type;
    this.lastViolationAt = now;

    this.warningCount++;
    const snapRef = this.captureSnapshot(type, this.warningCount);

    // Record detailed violation log entry
    const ctx = this.opts.getProgressContext();
    this.violationLog.push({
      timestamp: new Date().toISOString(),
      violationType: type,
      warningNumber: this.warningCount,
      currentQuestion: ctx.question,
      currentRound: ctx.round,
    });

    const violation: ProctoringViolation = {
      type,
      timestamp: new Date().toISOString(),
      warningCount: this.warningCount,
      message,
      screenshotRef: snapRef ?? undefined,
    };
    this.violations.push(violation);
    this.events.onViolation?.(violation);
    this.events.onWarningCountChange?.(this.warningCount);

    switch (type) {
      case 'browser_minimized': this.windowBlurCount++; break;
      case 'tab_switch': this.tabSwitchCount++; break;
      case 'window_blur': this.windowBlurCount++; break;
      case 'fullscreen_exit': this.fullscreenExitCount++; break;
      case 'multiple_faces': this.multipleFaceCount++; break;
      case 'face_missing': this.faceMissingCount++; break;
      case 'camera_blocked': this.cameraBlockedRef = true; this.cameraStatus = 'blocked'; break;
    }

    this.notifyStatus();

    if (this.warningCount >= this.opts.maxWarnings) {
      this.terminated = true;
      this.terminationReason = message;
      this.terminatedAt = new Date().toISOString();
      const ctx = this.opts.getProgressContext();
      this.progressAtTermination = `Round: ${ctx.round}, Question: ${ctx.question}`;
      this.captureSnapshot('end', this.warningCount);
      const summary = this.summary;
      this.events.onTerminate?.(type, summary);
      this.stop();
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Monitoring loop                                                    */
  /* ------------------------------------------------------------------ */

  private analyzeFrame(): void {
    if (!this.running || this.terminated) return;

    const video = this.videoEl!;
    const ctx = this.ctx;
    const canvas = this.canvasEl!;
    if (!video || !ctx || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) {
      if (!this.cameraBlockedRef) {
        this.cameraBlockedRef = true;
        if (this.cameraStatus !== 'denied') {
          this.triggerViolation('camera_blocked', 'Camera stream is not producing frames. This may indicate the camera is blocked.');
        }
      }
      this.notifyStatus();
      return;
    }

    this.totalTrackTime += this.opts.frameSampleMs;

    const sampleW = Math.min(w, 320);
    const sampleH = Math.round((h / w) * sampleW);
    canvas.width = sampleW;
    canvas.height = sampleH;
    ctx.drawImage(video, 0, 0, sampleW, sampleH);

    let imageData: ImageData | null = null;
    try {
      imageData = ctx.getImageData(0, 0, sampleW, sampleH);
    } catch {
      return;
    }

    const faces = detectFaces(imageData);
    const hasFace = faces.length > 0;
    const now = Date.now();

    if (hasFace) {
      this.facePresentTrackTotal += this.opts.frameSampleMs;
      this.lastFacePresentAt = now;
    }

    this.faceDetected = hasFace;

    const isMultiple = faces.length > 1;
    this.multipleFacesDetected = isMultiple; // live detection state (what the camera sees now)
    // Rising-edge detection: raise ONE violation per continuous multiple-face
    // episode, then re-arm as soon as the view returns to 0/1 face. Using the
    // episode latch (not the cumulative `multipleFaceCount`) means an earlier
    // violation can never switch detection off for the rest of the interview.
    // triggerViolation() keeps its own per-type cooldown, which additionally
    // guards against spam if the condition flaps between 1 and 2+ faces.
    if (isMultiple && !this.multipleFacesActive) {
      this.triggerViolation('multiple_faces', 'Multiple faces detected in the camera view.');
    }
    this.multipleFacesActive = isMultiple;

    if (!hasFace && now - this.lastFacePresentAt > this.opts.faceLossGraceMs && this.lastFacePresentAt > 0) {
      this.triggerViolation('face_missing', 'Face not detected for several seconds. Please stay in view of the camera.');
      this.lastFacePresentAt = now;
    }

    this.notifyStatus();
  }

  /* ------------------------------------------------------------------ */
  /*  Event handlers                                                     */
  /* ------------------------------------------------------------------ */

  private handleVisibilityChange = (): void => {
    if (document.hidden && this.running && !this.terminated) {
      // Browser minimized, tab changed, or browser hidden → all lose visibility
      if (document.visibilityState === 'hidden') {
        this.triggerViolation('browser_minimized', 'The browser window is not visible. Please keep the interview window focused.');
      } else {
        this.triggerViolation('tab_switch', 'You switched to another tab or window. This is not allowed during the interview.');
      }
    }
  };

  private handleWindowBlur = (): void => {
    if (this.running && !this.terminated && !this.windowBlurredRef) {
      this.windowBlurredRef = true;
      // This fires for window blur AND app switching — don't double with visibility
      if (!document.hidden) {
        this.triggerViolation('window_blur', 'The interview window lost focus. Please keep this window active.');
      }
    }
  };

  private handleWindowFocus = (): void => {
    this.windowBlurredRef = false;
  };

  private handleFullscreenChange = (): void => {
    if (!this.running || this.terminated || !this.opts.fullscreenRequired) return;
    if (!document.fullscreenElement && this.fullscreenActiveRef) {
      this.triggerViolation('fullscreen_exit', 'You exited fullscreen mode. Fullscreen is required during the interview.');
    }
    this.fullscreenActiveRef = !!document.fullscreenElement;
  };

  private handleBeforeUnload = (): void => {
    this.captureSnapshot('end', this.warningCount);
  };

  private handleCameraError(err: unknown): void {
    const error = err as DOMException;
    let state: 'denied' | 'blocked' | 'unavailable' = 'unavailable';
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      state = 'denied';
    } else if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
      state = 'unavailable';
    } else if (error?.name === 'NotReadableError' || error?.name === 'TrackStartError' || error?.name === 'AbortError') {
      state = 'blocked';
    }
    this.cameraStatus = state;
    this.phase = state === 'denied' ? 'camera-denied' : state === 'blocked' ? 'camera-blocked' : 'camera-unavailable';
    this.notifyStatus();
    this.events.onCameraStateChange?.(state);
  }

  /* ------------------------------------------------------------------ */
  /*  Status notification                                                */
  /* ------------------------------------------------------------------ */

  private notifyStatus(): void {
    if (!this.events.onStatusChange) return;
    const status: ProctoringStatus = {
      cameraActive: this.running && this.cameraStatus === 'active',
      faceDetected: this.faceDetected,
      multipleFacesDetected: this.multipleFacesDetected,
      faceMissing: !this.faceDetected && this.running,
      recording: this.running,
      warningsRemaining: Math.max(0, this.opts.maxWarnings - this.warningCount),
      cameraBlocked: this.cameraBlockedRef,
      isFullscreen: !!document.fullscreenElement,
      dialogOpen: false,
    };
    this.events.onStatusChange(status);
  }

  /* ------------------------------------------------------------------ */
  /*  Integrity score                                                    */
  /* ------------------------------------------------------------------ */

  private computeIntegrityScore(): number {
    let score = 100;
    score -= Math.min(30, this.tabSwitchCount * 10);
    score -= Math.min(20, this.windowBlurCount * 7);
    score -= Math.min(20, this.fullscreenExitCount * 8);
    score -= Math.min(25, this.multipleFaceCount * 15);
    score -= Math.min(25, this.faceMissingCount * 10);

    if (this.cameraStatus === 'blocked') score -= 20;
    if (this.cameraStatus === 'denied') score -= 40;

    const rate = this.faceDetectionRatePercent();
    if (rate < 100) {
      score -= Math.min(20, Math.round((100 - rate) / 5));
    }

    return Math.max(0, Math.min(100, score));
  }

  private faceDetectionRatePercent(): number {
    if (this.totalTrackTime <= 0) return 100;
    return Math.min(100, Math.round((this.facePresentTrackTotal / this.totalTrackTime) * 100));
  }

  /* ------------------------------------------------------------------ */
  /*  Fullscreen helper                                                  */
  /* ------------------------------------------------------------------ */

  async requestFullscreen(el: HTMLElement = document.documentElement): Promise<void> {
    try {
      await el.requestFullscreen({ navigationUI: 'hide' });
      this.fullscreenActiveRef = true;
    } catch {
      /* not supported or rejected — will be enforced via warnings */
    }
  }

  exitFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
  }
}