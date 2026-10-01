import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { fetchApplicantNotifications } from '../../services/applications';
import { AppIcon } from './ApplicantIcons';
import LogoutConfirmModal from './LogoutConfirmModal';
import MeLunLogo from '../layout/MeLunLogo';

/* ------------------------------------------------------------------ */
/*  Route config                                                       */
/* ------------------------------------------------------------------ */

interface RouteConfig {
  title: string;
  breadcrumb: string;
}

const routeMap: Record<string, RouteConfig> = {
  '/applicant/dashboard': { title: 'Applicant Dashboard', breadcrumb: 'Home / Dashboard' },
  '/applicant/career-quest': { title: 'Career Quest', breadcrumb: 'Home / Career Quest' },
  '/applicant/career-quest/challenges': { title: 'Challenges', breadcrumb: 'Home / Career Quest / Challenges' },
  '/applicant/career-quest/skills': { title: 'Skill Signals', breadcrumb: 'Home / Career Quest / Skills' },
  '/applicant/career-quest/history': { title: 'Challenge History', breadcrumb: 'Home / Career Quest / History' },
  '/applicant/available-jobs': { title: 'Available Jobs', breadcrumb: 'Home / Available Jobs' },
  '/applicant/my-applications': { title: 'My Applications', breadcrumb: 'Home / My Applications' },
  '/applicant/start-interview': { title: 'Start Interview', breadcrumb: 'Home / Start Interview' },
  '/applicant/interview-reports': { title: 'Interview Feedback', breadcrumb: 'Home / Interview Feedback' },
  '/applicant/notifications': { title: 'Notifications', breadcrumb: 'Home / Notifications' },
  '/applicant/profile': { title: 'Applicant Profile', breadcrumb: 'Home / Profile' },
  '/applicant/settings': { title: 'Settings', breadcrumb: 'Home / Settings' },
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

const todayStr = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/* ------------------------------------------------------------------ */
/*  ApplicantTopBar                                                    */
/* ------------------------------------------------------------------ */

export default function ApplicantTopBar({
  applicantName,
  applicantId,
  onLogout,
}: {
  applicantName: string;
  applicantId: string;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const pathname = location.pathname;
  const isInterviewFeedback = pathname.startsWith('/applicant/interview-reports/');
  const isChallenge = pathname.startsWith('/applicant/career-quest/challenges/');
  const routeConfig = isInterviewFeedback
    ? routeMap['/applicant/interview-reports'] || { title: 'Interview Feedback', breadcrumb: 'Home / Interview Feedback' }
    : isChallenge
      ? routeMap['/applicant/career-quest/challenges'] || { title: 'Challenge', breadcrumb: 'Home / Career Quest / Challenge' }
      : routeMap[pathname] || { title: 'Career Quest', breadcrumb: 'Home / Career Quest' };

  /* Real unread notification count (mount + focus/pageshow refresh). */
  const loadUnreadCount = useCallback(() => {
    if (!applicantId) return;
    fetchApplicantNotifications(applicantId)
      .then((data) => {
        const unread = (Array.isArray(data) ? data : []).filter((n) => !n.is_read).length;
        setUnreadCount(unread);
      })
      .catch(() => { /* keep previous count */ });
  }, [applicantId]);

  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  useEffect(() => {
    const onFocus = () => loadUnreadCount();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [loadUnreadCount]);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = getInitials(applicantName) || 'A';

  return (
    <>
      <header className="sticky top-0 z-30 bg-navy-950/80 backdrop-blur-md border-b border-white/5">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left side: Logo + Title + Breadcrumb */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Logo — the shared MeLun lockup. The bar keeps its dark surface in
              both themes (bg-navy-950/80), so the dark-background variant is used. */}
          <div className="shrink-0">
            <MeLunLogo size={28} variant="onDark" />
          </div>

          <div className="h-6 w-px bg-white/10 hidden sm:block" />

          {/* Title + Breadcrumb */}
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold text-white truncate">
              {routeConfig.title}
            </h1>
            <p className="text-[11px] text-gray-500 truncate">
              {routeConfig.breadcrumb}
            </p>
          </div>
        </div>

        {/* Right side: Date + Notifications (placeholder) + Profile */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Date */}
          <span className="text-[11px] text-gray-500 hidden md:block">{todayStr}</span>

          {/* Notification Bell */}
          <button
            onClick={() => navigate('/applicant/notifications')}
            className="relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            aria-label="View notifications"
            title="View notifications"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-navy-950">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {/* Profile Avatar + Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown((v) => !v)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white/5 transition-all"
              aria-label="Profile menu"
            >
              <div className="h-8 w-8 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center text-coral-400 font-bold text-xs">
                {initials}
              </div>
              <span className="text-sm text-white font-medium hidden md:block max-w-[120px] truncate">
                {applicantName}
              </span>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-navy-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-semibold text-white truncate">{applicantName}</p>
                  <p className="text-[11px] text-gray-500">Applicant</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/applicant/profile'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <AppIcon name="user" className="w-4 h-4" /> Profile
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/applicant/settings'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <AppIcon name="settings" className="w-4 h-4" /> Settings
                  </button>
                </div>
                <div className="border-t border-white/5 py-1">
                  <button
                    onClick={() => {
                      setShowDropdown(false);
                      setShowLogoutConfirm(true); // open confirmation — never log out directly
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors flex items-center gap-2"
                  >
                    <AppIcon name="logout" className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>

    {/* Logout confirmation — opens over the current page; does not log out until confirmed */}
    <LogoutConfirmModal
      open={showLogoutConfirm}
      onCancel={() => setShowLogoutConfirm(false)}
      onConfirm={() => {
        setShowLogoutConfirm(false);
        onLogout(); // existing logout logic (clears session + navigates to login)
      }}
    />
    </>
  );
}