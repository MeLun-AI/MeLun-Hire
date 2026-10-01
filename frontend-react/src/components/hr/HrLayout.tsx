import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import HrSidebar from './HrSidebar';
import HrTopBar from './HrTopBar';
import HrFooter from './HrFooter';
import LogoutConfirmModal from '../applicant/LogoutConfirmModal';
import PageTransition from '../../animations/PageTransition';
import { endSession } from '../../services/api';
import { useTheme } from '../../services/theme';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

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

/* ------------------------------------------------------------------ */
/*  HrLayout                                                           */
/* ------------------------------------------------------------------ */

export default function HrLayout({
  activePage,
  children,
  fixedShell = false,
}: {
  activePage: HrActivePage;
  children: React.ReactNode;
  /** Fixed app-shell mode: viewport-height shell, no page scroll.
   *  Used by Settings so only the center content region scrolls. */
  fixedShell?: boolean;
}) {
  const navigate = useNavigate();
  const [session, setSession] = useState<HrSession | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme } = useTheme();

  /* Auth check */
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

  const handleLogout = () => {
    setShowLogoutConfirm(true); // open confirmation — never log out directly
  };

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    // Revoke the server-side session so the HttpOnly cookie cannot be reused.
    void endSession('hr');
    sessionStorage.removeItem('quno_hr_session');
    navigate('/'); // redirect to website home page
  };

  const handleMainClick = () => {
    if (!sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  };

  if (!session) return null;

  const { hr_name, company_name, hr_id } = session;

  return (
    <>
      <div
        className={`${fixedShell ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-navy-950 flex ${
          theme === 'light' ? 'theme-light' : ''
        }`}
      >
        {/* Sidebar */}
        <HrSidebar
          hrName={hr_name}
          companyName={company_name}
          activePage={activePage}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onLogout={handleLogout}
        />

        {/* Mobile hamburger */}
        {sidebarCollapsed && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="fixed top-4 left-4 z-20 md:hidden bg-navy-800 border border-white/10 rounded-xl p-2 text-white shadow-lg"
            aria-label="Open sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        {/* Main content area */}
        <div className={`flex-1 min-w-0 flex flex-col ${fixedShell ? 'min-h-0 h-full overflow-hidden' : 'min-h-screen'}`}>
          {/* Top Bar */}
          <HrTopBar
            hrName={hr_name}
            companyName={company_name}
            hrId={hr_id}
            onLogout={handleLogout}
          />

          {/* Page content with animated transitions */}
          <main
            className={fixedShell ? 'flex-1 min-h-0 overflow-hidden flex flex-col' : 'flex-1 overflow-y-auto'}
            onClick={handleMainClick}
          >
            <PageTransition className={fixedShell ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : ''}>
              {children}
            </PageTransition>
          </main>

          {/* Footer — hidden in fixed-shell mode to maximize content viewport */}
          {!fixedShell && <HrFooter />}
        </div>
      </div>

      {/* Logout confirmation — opens over the current page; does not log out until confirmed */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
      />
    </>
  );
}