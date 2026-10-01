import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AppIcon, type ApplicantIconName } from './ApplicantIcons';
import LogoutConfirmModal from './LogoutConfirmModal';
import MeLunLogo, { MeLunMark } from '../layout/MeLunLogo';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ApplicantActivePage =
  | 'dashboard'
  | 'career-quest'
  | 'career-quest-challenges'
  | 'career-quest-skills'
  | 'career-quest-history'
  | 'available-jobs'
  | 'my-applications'
  | 'start-interview'
  | 'interview-reports'
  | 'notifications'
  | 'profile'
  | 'settings';

interface ApplicantSidebarProps {
  applicantName: string;
  activePage: ApplicantActivePage;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

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

/* ------------------------------------------------------------------ */
/*  Navigation items                                                   */
/* ------------------------------------------------------------------ */

interface NavItem {
  label: string;
  icon: ApplicantIconName;
  page: ApplicantActivePage;
  route: string | null;
}

const workspaceNav: NavItem[] = [
  { label: 'Dashboard',          icon: 'dashboard',      page: 'dashboard',         route: '/applicant/dashboard' },
  { label: 'Career Quest',       icon: 'rocket',         page: 'career-quest',            route: '/applicant/career-quest' },
  { label: '· Challenges',       icon: 'target',         page: 'career-quest-challenges',  route: '/applicant/career-quest/challenges' },
  { label: '· Skills',           icon: 'sparkles',       page: 'career-quest-skills',      route: '/applicant/career-quest/skills' },
  { label: '· History',          icon: 'document',       page: 'career-quest-history',     route: '/applicant/career-quest/history' },
  { label: 'Available Jobs',     icon: 'briefcase',      page: 'available-jobs',    route: '/applicant/available-jobs' },
  { label: 'My Applications',    icon: 'clipboard',      page: 'my-applications',   route: '/applicant/my-applications' },
  { label: 'Start Interview',    icon: 'mic',            page: 'start-interview',   route: '/applicant/start-interview' },
  { label: 'Interview Feedback', icon: 'doc-text',       page: 'interview-reports', route: '/applicant/interview-reports' },
];

const accountNav: NavItem[] = [
  { label: 'Profile',            icon: 'user',           page: 'profile',           route: '/applicant/profile' },
  { label: 'Settings',           icon: 'settings',       page: 'settings',          route: '/applicant/settings' },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ProfileAvatar({ name, size }: { name: string; size?: number }) {
  const s = size ?? 40;
  const r = s / 2;
  const initials = getInitials(name) || '?';
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-coral-500/20 border border-coral-500/30"
      style={{ width: s, height: s }}
    >
      <svg viewBox={`0 0 ${s} ${s}`} className="w-full h-full" aria-hidden="true">
        <circle cx={r} cy={r} r={r} fill="#ff6b4a" opacity="0.15" />
        <text
          x={r}
          y={r + 5}
          textAnchor="middle"
          fill="#ff6b4a"
          fontSize={s * 0.35}
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {initials}
        </text>
      </svg>
    </div>
  );
}

/* ================================================================== */
/*  Navigation button                                                  */
/* ================================================================== */

function NavButton({
  item,
  isActive,
  collapsed,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const isDisabled = !item.route;
  return (
    <motion.button
      disabled={isDisabled}
      onClick={onClick}
      title={
        collapsed
          ? `${item.label}${isDisabled ? ' — Coming soon' : ''}`
          : undefined
      }
      whileHover={!isDisabled ? { scale: 1.02 } : undefined}
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
        ${collapsed ? 'justify-center' : ''}
        ${
          isActive
            ? 'bg-primary/15 text-primary-light border border-primary/25'
            : isDisabled
              ? 'text-gray-600 cursor-not-allowed'
              : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
        }
      `}
    >
      <AppIcon name={item.icon} className="w-5 h-5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate text-[13px]">{item.label}</span>
          {isDisabled && (
            <span className="ml-auto text-[10px] text-gray-600 italic font-medium">
              Soon
            </span>
          )}
        </>
      )}
    </motion.button>
  );
}

/* ================================================================== */
/*  ApplicantSidebar                                                   */
/* ================================================================== */

export default function ApplicantSidebar({
  applicantName,
  activePage,
  collapsed,
  onToggle,
  onLogout,
}: ApplicantSidebarProps) {
  const navigate = useNavigate();
  const SIDEBAR_EXPANDED = 280;
  const SIDEBAR_COLLAPSED = 76;

  /* Restore sidebar state from sessionStorage on mount */
  useEffect(() => {
    const restored = sessionStorage.getItem('quno_applicant_sidebar_expanded');
    if (restored === 'false' && !collapsed) {
      onToggle();
    } else if (restored === 'true' && collapsed) {
      onToggle();
    }
  }, []);

  /* Persist sidebar state across page navigation */
  useEffect(() => {
    sessionStorage.setItem('quno_applicant_sidebar_expanded', collapsed ? 'false' : 'true');
  }, [collapsed]);

  const handleNav = (route: string | null) => {
    if (route) navigate(route);
  };

  /* ---- Logout confirmation (do not log out immediately) ---- */
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    onLogout(); // existing logout logic (clears session + navigates to login)
  };

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <motion.div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={onToggle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
        />
      )}

      <motion.aside
        className="fixed md:sticky top-0 left-0 z-40 h-screen bg-navy-900 border-r border-white/5 flex flex-col overflow-hidden"
        style={{
          width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
        }}
        animate={{
          width: collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED,
        }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Desktop transform override */}
        <style>{`
          @media (min-width: 768px) {
            aside {
              transform: translateX(0) !important;
            }
          }
        `}</style>

        {/* Top spacing + logo */}
        <div className="pt-5 px-4 shrink-0">
          <div className={`flex items-center ${collapsed ? 'justify-center' : ''}`}>
            {collapsed ? (
              /* 03. Icon-only brand mark for the collapsed rail */
              <MeLunMark size={30} variant="auto" title="MeLun" />
            ) : (
              <MeLunLogo
                size={30}
                variant="auto"
                subtitle="AI Hiring Platform"
                wordmarkVisibility="always"
              />
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 mt-4 border-t border-white/5 shrink-0" />

        {/* Applicant profile section */}
        <div className="px-4 pt-4 shrink-0">
          {collapsed ? (
            <div className="flex justify-center" title={`${applicantName} — Applicant`}>
              <ProfileAvatar name={applicantName} size={40} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <ProfileAvatar name={applicantName} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{applicantName}</p>
                <p className="text-[11px] text-gray-500">Applicant</p>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 mt-4 border-t border-white/5 shrink-0" />

        {/* Workspace navigation — scrollable if needed */}
        <div className="flex-1 overflow-y-auto px-3 pt-4">
          {!collapsed && (
            <p className="px-2 mb-2 text-[10px] text-gray-600 uppercase tracking-[0.12em] font-semibold">
              Workspace
            </p>
          )}

          <div className="space-y-0.5">
            {workspaceNav.map((item) => {
              const isActive = item.page === activePage;
              return (
                <NavButton
                  key={item.label}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNav(item.route);
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom — account + logout */}
        <div className="shrink-0">
          <div className="mx-4 border-t border-white/5" />

          <div className="px-3 pt-3 pb-4">
            {!collapsed && (
              <p className="px-2 mb-2 text-[10px] text-gray-600 uppercase tracking-[0.12em] font-semibold">
                Account
              </p>
            )}

            <div className="space-y-0.5">
              {accountNav.map((item) => {
                const isActive = item.page === activePage;
                return (
                  <NavButton
                    key={item.label}
                    item={item}
                    isActive={isActive}
                    collapsed={collapsed}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNav(item.route);
                    }}
                  />
                );
              })}
            </div>

            {/* Logout */}
            <div className={`mt-2 ${collapsed ? 'flex justify-center' : ''}`}>
              <motion.button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLogoutConfirm(true); // open confirmation — never log out directly
                }}
                title={collapsed ? 'Logout' : undefined}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                  ${collapsed ? 'justify-center' : ''}
                  text-gray-500 hover:text-red-400 hover:bg-red-500/[0.07]
                `}
              >
                <AppIcon name="logout" className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="text-[13px]">Logout</span>}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* Logout confirmation — opens over the current page; does not log out until confirmed */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
      />
    </>
  );
}