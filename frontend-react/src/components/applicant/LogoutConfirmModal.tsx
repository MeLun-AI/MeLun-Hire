
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from './ApplicantIcons';

/* ------------------------------------------------------------------ */
/* Logout confirmation modal                                          */
/* Rendered directly into document.body so it cannot be trapped by    */
/* sidebar/layout stacking contexts, transforms, overflow, etc.       */
/* ------------------------------------------------------------------ */

interface LogoutConfirmModalProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmModal({
  open,
  onCancel,
  onConfirm,
}: LogoutConfirmModalProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 999999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close logout confirmation"
        className="modal-backdrop-in absolute inset-0 w-full h-full bg-black/70 backdrop-blur-sm cursor-default"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          cursor: 'default',
        }}
        onClick={onCancel}
      />

      {/* Confirmation panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="logout-confirm-title"
        className="
          modal-panel-in
          relative
          w-full
          max-w-sm
          overflow-hidden
        "
        style={{
          position: 'relative',
          zIndex: 1000000,
          width: '100%',
          maxWidth: 384,
          overflow: 'hidden',
          backgroundColor: '#181B25',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 18,
          boxShadow:
            '0 30px 70px -12px rgba(0, 0, 0, 0.8), 0 12px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center justify-center w-9 h-9 shrink-0 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <AppIcon name="logout" className="w-5 h-5" />
            </span>
            <h3
              id="logout-confirm-title"
              className="text-base font-bold text-white truncate"
            >
              Logout
            </h3>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="
              flex
              items-center
              justify-center
              w-8
              h-8
              shrink-0
              rounded-full
              bg-white/5
              hover:bg-white/10
              border
              border-white/10
              text-gray-400
              hover:text-white
              transition-colors
            "
          >
            ×
          </button>
        </div>

        {/* Message */}
        <div className="px-5 py-5">
          <p className="text-sm text-gray-400">
            Are you sure you want to logout?
          </p>
          <p className="text-sm text-gray-500 mt-1">
            You will need to sign in again to access your dashboard.
          </p>

          {/* Actions */}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="
                flex-1
                text-sm
                bg-white/5
                hover:bg-white/10
                border
                border-white/10
                text-gray-300
                font-medium
                py-2.5
                rounded-xl
                transition-colors
              "
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirm}
              className="
                flex-1
                text-sm
                bg-red-500/10
                hover:bg-red-500/20
                border
                border-red-500/30
                text-red-400
                font-semibold
                py-2.5
                rounded-xl
                transition-colors
              "
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}