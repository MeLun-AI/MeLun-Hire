import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchHrNotifications } from '../../services/applications';
import { BuildingIcon, SettingsIcon, UserIcon, LogoutIcon } from './HrIcons';
import MeLunLogo from '../layout/MeLunLogo';

/* ------------------------------------------------------------------ */
/*  Route config                                                       */
/* ------------------------------------------------------------------ */

interface RouteConfig {
  title: string;
  breadcrumb: string;
}

const routeMap: Record<string, RouteConfig> = {
  '/hr/dashboard': { title: 'HR Dashboard', breadcrumb: 'Home / Dashboard' },
  '/hr/job-posts': { title: 'Job Posts', breadcrumb: 'Home / Job Posts' },
  '/hr/applicants': { title: 'Applicants', breadcrumb: 'Home / Applicants' },
  '/hr/resume-reports': { title: 'Resume Reports', breadcrumb: 'Home / Resume Reports' },
  '/hr/interview-results': { title: 'Interview Results', breadcrumb: 'Home / Interview Results' },
  '/hr/interview-report': { title: 'AI Evaluation Report', breadcrumb: 'Home / Interview Results / Report' },
  '/hr/notifications': { title: 'Notifications', breadcrumb: 'Home / Notifications' },
  '/hr/settings': { title: 'Settings', breadcrumb: 'Home / Settings' },
  '/hr/talent-arena': { title: 'Talent Arena', breadcrumb: 'Home / Talent Arena' },
  '/hr/talent-arena/detective': { title: 'Talent Detective', breadcrumb: 'Home / Talent Arena / Detective' },
  '/hr/talent-arena/blind-evaluation': { title: 'Blind Evaluation', breadcrumb: 'Home / Talent Arena / Blind Evaluation' },
  '/hr/talent-arena/face-off': { title: 'Candidate Face-Off', breadcrumb: 'Home / Talent Arena / Face-Off' },
  '/hr/talent-arena/build-team': { title: 'Build Your Team', breadcrumb: 'Home / Talent Arena / Build Your Team' },
  '/hr/talent-arena/radar': { title: 'AI Talent Radar', breadcrumb: 'Home / Talent Arena / Radar' },
  '/hr/talent-arena/challenges': { title: 'Candidate Challenges', breadcrumb: 'Home / Talent Arena / Challenges' },
  '/hr/talent-arena/team-vote': { title: 'Team Vote', breadcrumb: 'Home / Talent Arena / Team Vote' },
  '/hr/talent-arena/hiring-quest': { title: 'Hiring Quest', breadcrumb: 'Home / Talent Arena / Hiring Quest' },
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
/*  HrTopBar                                                           */
/* ------------------------------------------------------------------ */

export default function HrTopBar({
  hrName,
  companyName,
  hrId,
  onLogout,
}: {
  hrName: string;
  companyName: string;
  hrId: number;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* The Settings page hosts the HR account tabs; its ?tab= URL keeps the
     breadcrumb and the sidebar highlight in sync with the visible section. */
  const tabParam =
    location.pathname === '/hr/settings'
      ? new URLSearchParams(location.search).get('tab')
      : null;

  const settingsTabTitles: Record<string, { title: string; breadcrumb: string }> = {
    company: { title: 'Company Profile', breadcrumb: 'Home / Company Profile' },
    account: { title: 'Account Settings', breadcrumb: 'Home / Settings / Account' },
    notifications: { title: 'Notification Preferences', breadcrumb: 'Home / Settings / Notifications' },
    appearance: { title: 'Appearance', breadcrumb: 'Home / Settings / Appearance' },
    hiring: { title: 'Hiring Preferences', breadcrumb: 'Home / Settings / Hiring' },
    security: { title: 'Security Settings', breadcrumb: 'Home / Settings / Security' },
    system: { title: 'System Health', breadcrumb: 'Home / Settings / System Health' },
    help: { title: 'Help & Support', breadcrumb: 'Home / Settings / Help' },
    about: { title: 'About MeLun Hire', breadcrumb: 'Home / Settings / About' },
  };

  const routeConfig =
    tabParam && settingsTabTitles[tabParam]
      ? settingsTabTitles[tabParam]
      : location.pathname.startsWith('/hr/interview-report')
        ? routeMap['/hr/interview-report'] || { title: 'AI Evaluation Report', breadcrumb: 'Home / Interview Results / Report' }
        : routeMap[location.pathname] || { title: 'HR Dashboard', breadcrumb: 'Home' };

  /* Fetch unread notification count (mount + focus/pageshow refresh). */
  const loadUnreadCount = useCallback(() => {
    if (!hrId) return;
    fetchHrNotifications(hrId)
      .then((data) => {
        const unread = (Array.isArray(data) ? data : []).filter((n) => !n.is_read).length;
        setUnreadCount(unread);
      })
      .catch(() => {});
  }, [hrId]);

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

  return (
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

        {/* Right side: Date + Notifications + Profile */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Date */}
          <span className="text-[11px] text-gray-500 hidden md:block">{todayStr}</span>

          {/* Notification Bell */}
          <button
            onClick={() => navigate('/hr/notifications')}
            className="relative p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"
            aria-label="Notifications"
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
                {getInitials(hrName) || '?'}
              </div>
              <span className="text-sm text-white font-medium hidden md:block max-w-[120px] truncate">
                {hrName}
              </span>
              <svg className={`w-4 h-4 text-gray-500 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-navy-800 border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-semibold text-white truncate">{hrName}</p>
                  <p className="text-[11px] text-gray-500 truncate">{companyName}</p>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/hr/settings?tab=company'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <BuildingIcon className="w-4 h-4" /> Company Profile
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/hr/settings?tab=account'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <UserIcon className="w-4 h-4" /> Account
                  </button>
                  <button
                    onClick={() => { setShowDropdown(false); navigate('/hr/settings'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    <SettingsIcon className="w-4 h-4" /> Settings
                  </button>
                </div>
                <div className="border-t border-white/5 py-1">
                  <button
                    onClick={() => { setShowDropdown(false); onLogout(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/5 transition-colors flex items-center gap-2"
                  >
                    <LogoutIcon className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}