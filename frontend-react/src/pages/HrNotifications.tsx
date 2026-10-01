import { useEffect, useState, useMemo, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import HrLayout from '../components/hr/HrLayout';
import {
  fetchHrNotifications,
  markHrNotificationRead,
  markAllHrNotificationsRead,
} from '../services/applications';
import {
  BellIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentIcon,
  BriefcaseIcon,
  MicIcon,
  KeyIcon,
  RefreshIcon,
  CheckCircleIcon,
  AlertIcon,
} from '../components/hr/HrIcons';

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface ApiNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  application_id?: number | null;
}

/* Friendly category labels derived from the real `type` field. Unknown
   types fall back to the raw value and are never fabricated. */
const TYPE_LABELS: Record<string, string> = {
  interview_status: 'Interview Status',
  interview_code: 'Interview Code',
  reissue: 'Reissue Request',
  job: 'Job Update',
};

const TYPE_ICONS: Record<string, ReactNode> = {
  interview_status: <MicIcon className="w-4 h-4" />,
  interview_code: <KeyIcon className="w-4 h-4" />,
  reissue: <RefreshIcon className="w-4 h-4" />,
  job: <BriefcaseIcon className="w-4 h-4" />,
};

function getNotificationIcon(type: string): ReactNode {
  return TYPE_ICONS[type] ?? <BellIcon className="w-4 h-4" />;
}

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? (type ? type.replace(/_/g, ' ') : 'General');
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

/* Small labeled detail row used inside the expanded panel. */
function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="shrink-0 mt-0.5 text-primary-light">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
        <dd className="text-xs text-gray-300 mt-0.5">{value}</dd>
      </div>
    </div>
  );
}
export default function HrNotifications() {
  const navigate = useNavigate();
  const [session, setSession] = useState<HrSession | null>(null);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('All');
  /* Multiple notifications may be expanded at once. */
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) {
      navigate('/hr/login', { replace: true });
      return;
    }
    try {
      const s: HrSession = JSON.parse(raw);
      if (!s.hr_id) {
        navigate('/hr/login', { replace: true });
        return;
      }
      setSession(s);
    } catch {
      navigate('/hr/login', { replace: true });
    }
  }, [navigate]);

  const loadNotifications = useCallback(() => {
    if (!session?.hr_id) return;
    setLoading(true);
    setError('');
    fetchHrNotifications(session.hr_id)
      .then((data) => {
        setNotifications(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load notifications.');
        setLoading(false);
      });
  }, [session?.hr_id]);

  /* Initial load + reload whenever the signed-in HR changes. */
  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  /* Refresh when the tab regains focus so the badge and list stay in sync. */
  useEffect(() => {
    const onFocus = () => loadNotifications();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [loadNotifications]);

  /* Mark read on the backend (never frontend-only), preserving existing behavior. */
  const markRead = useCallback(async (n: ApiNotification) => {
    if (!n.is_read) {
      try {
        await markHrNotificationRead(n.id);
      } catch { /* backend remains source of truth */ }
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    }
  }, []);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCardClick = useCallback((n: ApiNotification) => {
    markRead(n);
    toggleExpand(n.id);
  }, [markRead, toggleExpand]);

  const handleMarkAllRead = useCallback(async () => {
    if (!session?.hr_id) return;
    try {
      await markAllHrNotificationsRead(session.hr_id);
    } catch { /* backend remains source of truth */ }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  }, [session?.hr_id]);

  const types = useMemo(() => {
    const set = new Set(notifications.map((n) => n.type));
    return ['All', ...Array.from(set)];
  }, [notifications]);

  const filtered = useMemo(() => {
    if (filter === 'All') return notifications;
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  if (!session) return null;

  return (
    <HrLayout activePage="notifications">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-10">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white">Notifications</h1>
            <p className="text-gray-500 text-sm mt-1">Stay updated with hiring activity</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/50"
            >
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all"
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {error && !loading && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button
              onClick={loadNotifications}
              className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                <div className="h-4 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-3 bg-white/10 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <BellIcon className="w-12 h-12 mx-auto text-gray-600 mb-5" />
            <h2 className="text-xl font-extrabold text-white mb-2">
              {notifications.length === 0 ? 'No Notifications Yet' : 'No Matching Notifications'}
            </h2>
            <p className="text-sm text-gray-400">
              {notifications.length === 0
                ? 'Hiring activity, new applicants and interview updates will appear here.'
                : 'Try a different category filter to see your notifications.'}
            </p>
          </div>
        ) : (
<div className="space-y-3">
            {filtered.map((n) => {
              const isOpen = expandedIds.has(n.id);
              return (
                <div
                  key={n.id}
                  className={`bg-white/5 border ${
                    n.is_read ? 'border-white/5' : 'border-primary/20'
                  } rounded-2xl overflow-hidden transition-colors ${
                    isOpen ? 'ring-1 ring-primary/20' : ''
                  }`}
                >
                  {/* Summary (always visible, click toggles expand) */}
                  <button
                    type="button"
                    onClick={() => handleCardClick(n)}
                    className="w-full text-left p-5 flex items-start gap-4 transition-colors hover:bg-white/[0.07] cursor-pointer"
                  >
                    <span className={`shrink-0 ${n.is_read ? 'text-gray-400' : 'text-primary-light'}`}>
                      {getNotificationIcon(n.type)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${n.is_read ? 'text-gray-300' : 'text-white'}`}>{n.title}</span>
                        {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                      </span>
                      {n.message && (
                        <span className="block text-sm text-gray-400 mt-1 truncate">{n.message}</span>
                      )}
                      <span className="block text-xs text-gray-600 mt-2">{getRelativeTime(n.created_at)}</span>
                    </span>
                    <ChevronDownIcon
                      className={`w-4 h-4 shrink-0 mt-1 text-gray-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="details"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5">
                          <div className="border-t border-white/10 pt-4">
                            <p className="text-sm text-gray-300 leading-relaxed">{n.message}</p>
                            <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                              <DetailRow
                                icon={<ClockIcon className="w-4 h-4" />}
                                label="Date & Time"
                                value={formatFullDate(n.created_at)}
                              />
                              <DetailRow
                                icon={getNotificationIcon(n.type)}
                                label="Category"
                                value={getTypeLabel(n.type)}
                              />
                              {n.application_id != null && n.application_id !== 0 && (
                                <DetailRow
                                  icon={<DocumentIcon className="w-4 h-4" />}
                                  label="Related Application"
                                  value={`#${n.application_id}`}
                                />
                              )}
                              <DetailRow
                                icon={
                                  n.is_read
                                    ? <CheckCircleIcon className="w-4 h-4 text-green-400" />
                                    : <AlertIcon className="w-4 h-4 text-yellow-400" />
                                }
                                label="Status"
                                value={<span className={n.is_read ? 'text-green-400' : 'text-yellow-400'}>{n.is_read ? 'Read' : 'Unread'}</span>}
                              />
                            </dl>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}

        {!loading && notifications.length > 0 && (
          <p className="text-xs text-gray-500 text-center mt-6">
            {notifications.filter((n) => !n.is_read).length} unread
          </p>
        )}
      </div>
    </HrLayout>
  );
}