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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

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
      {/* Sidebar */}
      <ApplicantSidebar
        applicantName={full_name}
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
        <ApplicantTopBar
          applicantName={full_name}
          applicantId={session.applicant_id}
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
  );
}