import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ApplicantSidebar from './ApplicantSidebar';
import ApplicantTopBar from './ApplicantTopBar';
import HrFooter from '../hr/HrFooter';
import PageTransition from '../../animations/PageTransition';
import { useTheme } from '../../services/theme';
import { endSession } from '../../services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
  email: string;
}

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

/* ------------------------------------------------------------------ */
/*  ApplicantLayout                                                    */
/* ------------------------------------------------------------------ */

export default function ApplicantLayout({
  activePage,
  children,
  fixedShell = false,
}: {
  activePage: ApplicantActivePage;
  children: React.ReactNode;
  /** Fixed app-shell mode: viewport-height shell, no page scroll.
   *  Used by Settings so only the center content region scrolls. */
  fixedShell?: boolean;
}) {
  const navigate = useNavigate();
  const { theme, accent, fontSize } = useTheme();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  /* `false` = drawer-style sidebar visible on desktop, hidden on mobile.
   * `true`  = desktop sidebar narrowed to an icon rail; mobile drawer open.
   * (Kept the existing prop name so every caller keeps working.) */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /* Auth check */
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
      setSession(s);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    // Revoke the server-side session so the HttpOnly cookie cannot be reused.
    void endSession('applicant');
    sessionStorage.removeItem('quno_applicant_session');
    navigate('/'); // redirect to website home page
  };

  const handleMainClick = () => {
    if (mobileNavOpen) {
      setMobileNavOpen(false);
    }
    if (!sidebarCollapsed) {
      setSidebarCollapsed(true);
    }
  };

  if (!session) return null;

  const { full_name } = session;

  return (
    <div
      data-accent={accent}
      data-font-size={fontSize}
      className={`${fixedShell ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-navy-950 flex ${theme === 'light' ? 'theme-light' : ''}`}
    >
      {/* Sidebar — desktop rail/drawer; mobile overlay drawer (see ApplicantSidebar) */}
      <ApplicantSidebar
        applicantName={full_name}
        activePage={activePage}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onLogout={handleLogout}
      />

      {/* Main content area */}
      <div className={`flex-1 min-w-0 w-full flex flex-col ${fixedShell ? 'min-h-0 h-full overflow-hidden' : 'min-h-screen'}`}>
        {/* Top Bar — owns the mobile hamburger so it never overlaps content */}
        <ApplicantTopBar
          applicantName={full_name}
          applicantId={session.applicant_id}
          onLogout={handleLogout}
          onOpenMobileNav={() => setMobileNavOpen(true)}
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
  );
}