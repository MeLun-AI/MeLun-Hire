import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import {
  fetchApplicantNotifications,
  markApplicantNotificationRead,
  markAllApplicantNotificationsRead,
  type NotificationItem,
} from '../services/applications';
import { requestErrorMessage } from '../services/api';

interface ApplicantSession {
  applicant_id: string;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getNotificationIcon(type: string): string {
  switch (type) {
    case 'application': return '📝';
    case 'interview_code': return '🔑';
    case 'report_available': return '📊';
    case 'interview_status': return '🎤';
    default: return '🔔';
  }
}

/* Friendly category labels derived from the real `type` values the backend
   stores. Unknown types fall back to the humanized raw value (nothing is
   fabricated). */
const TYPE_LABELS: Record<string, string> = {
  application: 'Application Update',
  interview_code: 'Interview Code',
  interview_status: 'Interview Status',
  report_available: 'Feedback Report',
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? (type ? type.replace(/_/g, ' ') : 'General');
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ------------------------------------------------------------------ */
/*  Notification details modal                                         */
/*  Shows the clicked notification's own content. Reuses the app's      */
/*  existing dialog pattern (portal on <body>, Escape, backdrop click,  */
/*  body-scroll lock) so it always paints above the dimmed backdrop.    */
/* ------------------------------------------------------------------ */

/* Small labeled detail row (same grouping pattern as HrNotifications). */
function DetailRow({ icon, label, value }: { icon: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="shrink-0 mt-0.5 text-base">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="text-xs text-gray-300 mt-0.5 break-words">{value}</dd>
      </div>
    </div>
  );
}

function NotificationDetailsModal({
  notification,
  onClose,
}: {
  notification: NotificationItem;
  onClose: () => void;
}) {
  /* Close on Escape + lock body scroll while open (✕ and backdrop also work). */
  useEffect(() => {
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
  }, [onClose]);

  /* Rendered through a portal on <body>: the animated page wrapper sets
     `will-change: transform`, which makes it the containing block for
     position: fixed — the overlay would otherwise be sized/positioned
     against the page wrapper instead of the viewport. */
  return createPortal(
    <motion.div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:items-center overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Notification details"
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        className="relative w-full max-w-lg bg-navy-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-10 my-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 p-5 pb-4 border-b border-white/10">
          <h2 className="text-base md:text-lg font-bold text-white flex items-center gap-2 min-w-0">
            <span className="text-lg shrink-0">{getNotificationIcon(notification.type)}</span>
            <span className="truncate">{notification.title}</span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close notification details"
            className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-sm font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Body — only fields the backend actually stores */}
        <div className="p-5 space-y-4">
          {notification.message && (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{notification.message}</p>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 border-t border-white/10 pt-4">
            <DetailRow
              icon={getNotificationIcon(notification.type)}
              label="Category"
              value={getTypeLabel(notification.type)}
            />
            <DetailRow icon="🕒" label="Date & Time" value={formatFullDate(notification.created_at)} />
            {notification.application_id != null && notification.application_id !== 0 && (
              <DetailRow icon="📄" label="Related Application" value={`#${notification.application_id}`} />
            )}
            <DetailRow
              icon={notification.is_read ? '✅' : '🔵'}
              label="Status"
              value={
                <span className={notification.is_read ? 'text-green-400' : 'text-yellow-400'}>
                  {notification.is_read ? 'Read' : 'Unread'}
                </span>
              }
            />
          </dl>
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}

export default function ApplicantNotifications() {
  const navigate = useNavigate();
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* The notification whose details are open (null = modal closed). */
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) {
      navigate('/applicant/login', { replace: true });
      return;
    }
    try {
      const s: ApplicantSession = JSON.parse(raw);
      if (!s.applicant_id) {
        navigate('/applicant/login', { replace: true });
        return;
      }
      setApplicantId(s.applicant_id);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  const loadNotifications = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchApplicantNotifications(applicantId);
      setNotifications(Array.isArray(data) ? data : []);
      setLoading(false);
    } catch (err) {
      setError(requestErrorMessage(err, 'Failed to load notifications.'));
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [loadNotifications]);

  /* Clicking a card opens that notification's details in-page (no navigation),
     so the clicked notification object is passed straight to the modal. */
  const handleOpen = useCallback(async (n: NotificationItem) => {
    setSelected(n);
    if (n.is_read) return;
    try {
      await markApplicantNotificationRead(n.id);
    } catch { /* backend remains source of truth */ }
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    setSelected((prev) => (prev && prev.id === n.id ? { ...prev, is_read: true } : prev));
  }, []);

  const handleMarkAllRead = useCallback(async () => {
    if (!applicantId) return;
    try {
      await markAllApplicantNotificationsRead(applicantId);
    } catch { /* backend remains source of truth */ }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [applicantId]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <ApplicantLayout activePage="notifications">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-10 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">Notifications</motion.h1>
              <motion.p variants={staggerItem} className="text-gray-500 text-sm mt-1">Stay updated on your applications and interviews</motion.p>
            </div>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all"
              >
                Mark all as read
              </button>
            )}
          </div>
        </motion.section>

        {error && !loading && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button onClick={loadNotifications} className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-3 bg-white/10 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <motion.div variants={staggerItem} className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <div className="text-6xl mb-5">🔔</div>
            <h2 className="text-xl font-extrabold text-white mb-2">No Notifications Yet</h2>
            <p className="text-sm text-gray-400">You will be notified here about application updates, interview invites, and reports.</p>
          </motion.div>
        ) : (
          <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                variants={staggerItem}
                onClick={() => handleOpen(n)}
                className={`cursor-pointer bg-white/5 border ${n.is_read ? 'border-white/5' : 'border-primary/20'} rounded-2xl p-5 transition-colors hover:bg-white/[0.07]`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl shrink-0">{getNotificationIcon(n.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{n.title}</p>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {n.message && <p className="text-sm text-gray-400 mt-1">{n.message}</p>}
                    <p className="text-xs text-gray-600 mt-2">{getRelativeTime(n.created_at)}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.section>
        )}

        {unreadCount > 0 && !loading && (
          <p className="text-xs text-gray-500 text-center">{unreadCount} unread</p>
        )}

        {/* Details for the clicked notification (portaled above the backdrop) */}
        <AnimatePresence>
          {selected && (
            <NotificationDetailsModal
              notification={selected}
              onClose={() => setSelected(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </ApplicantLayout>
  );
}
