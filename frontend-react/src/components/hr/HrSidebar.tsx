import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ChartIcon,
  BellIcon,
  BriefcaseIcon,
  UsersIcon,
  DocumentIcon,
  ClipboardIcon,
  SettingsIcon,
  LogoutIcon,
  RadarIcon,
  BuildingIcon,
} from './HrIcons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type HrActivePage =
  | 'dashboard'
  | 'notifications'
  | 'job-posts'
  | 'applicants'
  | 'interview-results'
  | 'interview-report'
  | 'resume-reports'
  | 'talent-arena'
  | 'company-profile'
  | 'settings';

interface HrSidebarProps {
  hrName: string;
  companyName: string;
  activePage: HrActivePage;
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
  icon: React.ReactNode;
  page: HrActivePage;
  route: string | null;
}

const workspaceNav: NavItem[] = [
  { label: 'Dashboard',         icon: <ChartIcon className="w-5 h-5" />, page: 'dashboard',         route: '/hr/dashboard' },
  { label: 'Notifications',     icon: <BellIcon className="w-5 h-5" />, page: 'notifications',     route: '/hr/notifications' },
  { label: 'Job Posts',         icon: <BriefcaseIcon className="w-5 h-5" />, page: 'job-posts',         route: '/hr/job-posts' },
  { label: 'Applicants',        icon: <UsersIcon className="w-5 h-5" />, page: 'applicants',        route: '/hr/applicants' },
  { label: 'Talent Arena',      icon: <RadarIcon className="w-5 h-5" />, page: 'talent-arena',      route: '/hr/talent-arena' },
  { label: 'Resume Reports',    icon: <DocumentIcon className="w-5 h-5" />, page: 'resume-reports',    route: '/hr/resume-reports' },
  { label: 'Interview Results', icon: <ClipboardIcon className="w-5 h-5" />, page: 'interview-results', route: '/hr/interview-results' },
];

const accountNav: NavItem[] = [
  { label: 'Company Profile', icon: <BuildingIcon className="w-5 h-5" />, page: 'company-profile', route: '/hr/settings?tab=company' },
  { label: 'Settings',        icon: <SettingsIcon className="w-5 h-5" />, page: 'settings',        route: '/hr/settings' },
];

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CompanyLogoMark({ companyName, size }: { companyName: string; size?: number }) {
  const s = size ?? 36;
  const initials = getInitials(companyName) || 'C';
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 36 36"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="8" fill="#2563eb" />
      <text
        x="18"
        y="23"
        textAnchor="middle"
        fill="#fff"
        fontSize="14"
        fontWeight="700"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {initials}
      </text>
    </svg>
  );
}

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
/*  Navigation button - wrapped with motion for consistent animation   */
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
          ? `${item.label}${isDisabled ? ' - Coming soon' : ''}`
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
      <span className="shrink-0 leading-none">{item.icon}</span>
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
/*  HrSidebar                                                          */
/* ================================================================== */

export default function HrSidebar({
  hrName,
  companyName,
  activePage,
  collapsed,
  onToggle,
  onLogout,
}: HrSidebarProps) {
  const navigate = useNavigate();
  const SIDEBAR_EXPANDED = 280;
  const SIDEBAR_COLLAPSED = 76;

   /* Restore sidebar state from sessionStorage on mount */
   useEffect(() => {
     const restored = sessionStorage.getItem('quno_hr_sidebar_expanded');
     if (restored === 'false' && !collapsed) {
       onToggle();
     } else if (restored === 'true' && collapsed) {
       onToggle();
     }
   }, []);

   /* Persist sidebar state across page navigation */
   useEffect(() => {
     sessionStorage.setItem('quno_hr_sidebar_expanded', collapsed ? 'false' : 'true');
   }, [collapsed]);

  const handleSidebarClick = () => {
    if (collapsed) {
      setTimeout(() => onToggle(), 0);
    }
  };

  const handleNav = (route: string | null) => {
    if (route) navigate(route);
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
        onClick={handleSidebarClick}
      >
        {/* Desktop transform override */}
        <style>{`
          @media (min-width: 768px) {
            aside {
              transform: translateX(0) !important;
            }
          }
        `}</style>

        {/* Top spacing + company logo */}
        <div className="pt-5 px-4 shrink-0">
          <div className={`flex items-center ${collapsed ? 'justify-center' : ''}`}>
            {collapsed ? (
              <CompanyLogoMark companyName={companyName} size={36} />
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <CompanyLogoMark companyName={companyName} size={36} />
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">{companyName}</div>
                  <div className="text-[9px] text-gray-500 tracking-tight">
                    Powered by MeLun
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 mt-4 border-t border-white/5 shrink-0" />

        {/* HR profile section */}
        <div className="px-4 pt-4 shrink-0">
          {collapsed ? (
            <div className="flex justify-center" title={`${hrName} - HR Manager`}>
              <ProfileAvatar name={hrName} size={40} />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <ProfileAvatar name={hrName} size={44} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white truncate">{hrName}</p>
                <p className="text-[11px] text-gray-500">HR Manager</p>
                <p className="text-[10px] text-gray-600 truncate">{companyName}</p>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-4 mt-4 border-t border-white/5 shrink-0" />

        {/* Workspace navigation - scrollable if needed */}
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

        {/* Bottom - account + logout */}
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
                  onLogout();
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
                <span className="shrink-0 leading-none">
                  <LogoutIcon className="w-5 h-5" />
                </span>
                {!collapsed && <span className="text-[13px]">Logout</span>}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.aside>
    </>
  );
}