import { useEffect, useRef } from 'react';

interface CameraPreviewProps {
  stream?: MediaStream | null;
  mirrored?: boolean;
  showOverlay?: boolean;
  overlayState?: 'none' | 'searching' | 'blocked' | 'off';
  className?: string;
  onVideoReady?: (video: HTMLVideoElement) => void;
  label?: string;
}

/**
 * Reusable webcam preview panel. Accepts a MediaStream from the parent.
 * Renders a live video element with optional mirroring and status overlay.
 */
export default function CameraPreview({
  stream,
  mirrored = true,
  showOverlay = true,
  overlayState = 'none',
  className = '',
  onVideoReady,
  label,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        /* autoplay may fail until user interaction */
      });
      onVideoReady?.(video);
    } else {
      video.srcObject = null;
    }
  }, [stream, onVideoReady]);

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-navy-950 border border-white/10 ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''}`}
        aria-label={label || 'Webcam preview'}
      />

      {/* Status overlay */}
      {showOverlay && overlayState !== 'none' && (
        <div className="absolute inset-0 flex items-center justify-center bg-navy-950/70 backdrop-blur-sm">
          <div className="text-center space-y-2 p-4">
            {overlayState === 'searching' && (
              <>
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-xs text-gray-400">Searching for camera...</p>
              </>
            )}
            {overlayState === 'blocked' && (
              <>
                <div className="text-2xl" aria-hidden="true">🚫</div>
                <p className="text-xs text-red-400 font-medium">Camera blocked</p>
              </>
            )}
            {overlayState === 'off' && (
              <>
                <div className="text-2xl" aria-hidden="true">🎥</div>
                <p className="text-xs text-gray-500">Camera off</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top-left status dot */}
      {stream && (
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
          <span className="text-[9px] text-gray-300 font-medium uppercase tracking-wider">Live</span>
        </div>
      )}
    </div>
  );
}