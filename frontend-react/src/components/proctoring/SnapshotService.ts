import type { ProctoringSnapshot } from './ProctoringTypes';

interface SnapshotServiceOptions {
  endpoint?: string;
  onUpload?: (snapshot: ProctoringSnapshot) => Promise<void>;
}

/**
 * Handles snapshot capture, batching, and upload to the backend.
 * Designed to be ready for backend synchronization.
 */
export class SnapshotService {
  private snapshots: ProctoringSnapshot[] = [];
  private endpoint: string | null = null;
  private onUpload: ((snapshot: ProctoringSnapshot) => Promise<void>) | null = null;
  private uploadQueue: ProctoringSnapshot[] = [];
  private uploading = false;

  constructor(options: SnapshotServiceOptions = {}) {
    this.endpoint = options.endpoint ?? null;
    this.onUpload = options.onUpload ?? null;
  }

  /** Add a snapshot to local store */
  add(snapshot: ProctoringSnapshot): void {
    this.snapshots.push(snapshot);
    this.uploadQueue.push(snapshot);
    this.flush().catch(() => {
      /* network errors are retried lazily */
    });
  }

  /** Return all snapshots stored locally */
  getAll(): ProctoringSnapshot[] {
    return [...this.snapshots];
  }

  /** Attempt to upload queued snapshots to the backend */
  async flush(): Promise<void> {
    if (this.uploading || this.uploadQueue.length === 0) return;
    this.uploading = true;

    try {
      while (this.uploadQueue.length > 0) {
        const snap = this.uploadQueue[0];
        if (this.onUpload) {
          await this.onUpload(snap);
        } else if (this.endpoint) {
          await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(snap),
          });
        }
        this.uploadQueue.shift();
      }
    } catch {
      /* keep remaining in queue for retry; non-fatal */
    } finally {
      this.uploading = false;
    }
  }

  /** Clear all local snapshots (e.g., on interview end) */
  clear(): void {
    this.snapshots = [];
    this.uploadQueue = [];
  }
}

/** Convenience singleton for global use */
export const snapshotService = new SnapshotService();