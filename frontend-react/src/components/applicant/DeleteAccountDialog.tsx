import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE, ApiError } from '../../services/api';

interface DeleteAccountDialogProps {
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
  /** Account-type specific deletion endpoint (defaults to the applicant one). */
  endpoint?: string;
  /** Account-type specific request body (defaults to { password, confirmation }). */
  buildBody?: (password: string, confirmation: string) => Record<string, unknown>;
  /** Optional copy overrides so each account type explains its own outcome. */
  title?: string;
  description?: string;
  incorrectPasswordMessage?: string;
}

/* Confirmation dialog for permanent account deletion. Requires the current
   password plus typing DELETE so accidental clicks can never delete.
   Used by the applicant settings and the HR settings (deactivation) flows. */
export default function DeleteAccountDialog({
  open,
  onClose,
  onDeleted,
  endpoint = '/applicant/delete-account',
  buildBody = (password, confirmation) => ({ password, confirmation }),
  title = 'Delete your account?',
  description =
    'This will permanently delete your account and associated data. This action cannot be undone.',
  incorrectPasswordMessage = 'Your password is incorrect.',
}: DeleteAccountDialogProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setConfirmation('');
    setError('');
    setLoading(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const canSubmit =
    !loading && password.length > 0 && confirmation.trim() === 'DELETE';

  const handleDelete = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildBody(password, confirmation.trim())),
      });
      if (!res.ok) {
        let message = 'Unable to delete your account. Please try again.';
        try {
          const data = (await res.json()) as { detail?: unknown };
          if (res.status === 401) message = incorrectPasswordMessage;
          else if (typeof data?.detail === 'string' && data.detail.trim()) {
            message =
              res.status >= 500
                ? 'Unable to delete your account. Please try again.'
                : data.detail;
          }
        } catch {
          /* keep the safe default message */
        }
        throw new ApiError(res.status, message);
      }
      onDeleted();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Unable to delete your account. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close delete account confirmation"
        onClick={() => {
          if (!loading) onClose();
        }}
        className="absolute inset-0 w-full h-full bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative w-full max-w-sm rounded-[18px] border border-red-500/20 bg-[#181B25] shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-white/[0.07]">
          <h3 id="delete-account-title" className="text-base font-bold text-white">
            {title}
          </h3>
          <p className="text-sm text-gray-400 mt-1">{description}</p>
        </div>
        <div className="px-5 py-5">
          <label className="block text-xs font-medium text-gray-400 mb-1.5">
            Current password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={loading}
            autoComplete="current-password"
            className="w-full text-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-gray-600 outline-none focus:border-red-500/50 disabled:opacity-50"
          />
          <label className="block text-xs font-medium text-gray-400 mt-4 mb-1.5">
            Type <span className="font-bold text-white">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            disabled={loading}
            autoComplete="off"
            className="w-full text-sm bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white placeholder:text-gray-600 outline-none focus:border-red-500/50 disabled:opacity-50"
          />
          {error && (
            <p role="alert" className="text-xs text-red-400 mt-3">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={!canSubmit}
              className="flex-1 text-sm bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Deleting account…' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
