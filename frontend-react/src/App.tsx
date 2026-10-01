import { Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import PageTransition from './animations/PageTransition';
import LandingPage from './pages/LandingPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import RoleSelection from './pages/RoleSelection';
import ApplicantLogin from './pages/ApplicantLogin';
import ApplicantSignup from './pages/ApplicantSignup';
import ApplicantDashboard from './pages/ApplicantDashboard';
import ApplicantCareerQuest from './pages/ApplicantCareerQuest';
import CareerQuestChallenges from './pages/CareerQuestChallenges';
import CareerQuestChallenge from './pages/CareerQuestChallenge';
import CareerQuestSkills from './pages/CareerQuestSkills';
import CareerQuestHistory from './pages/CareerQuestHistory';
import ApplicantMyApplications from './pages/ApplicantMyApplications';
import ApplicantProfile from './pages/ApplicantProfile';
import ApplicantStartInterview from './pages/ApplicantStartInterview';
import ApplicantInterviewFeedback from './pages/ApplicantInterviewFeedback';
import ApplicantInterviewReports from './pages/ApplicantInterviewReports';
import ApplicantNotifications from './pages/ApplicantNotifications';
import ApplicantAvailableJobs from './pages/ApplicantAvailableJobs';
import ApplicantSettings from './pages/ApplicantSettings';
import HrInterviewReport from './pages/HrInterviewReport';
import HrLogin from './pages/HrLogin';
import HrSignup from './pages/HrSignup';
import HrDashboard from './pages/HrDashboard';
import HrJobPosts from './pages/HrJobPosts';
import HrApplicants from './pages/HrApplicants';
import HrResumeReports from './pages/HrResumeReports';
import HrNotifications from './pages/HrNotifications';
import HrInterviewResults from './pages/HrInterviewResults';
import HrSettings from './pages/HrSettings';
import HrTalentArena from './pages/HrTalentArena';
import HrTalentDetective from './pages/hr-talent/HrTalentDetective';
import HrBlindEvaluation from './pages/hr-talent/HrBlindEvaluation';
import HrCandidateFaceOff from './pages/hr-talent/HrCandidateFaceOff';
import HrBuildTeam from './pages/hr-talent/HrBuildTeam';
import HrTalentRadar from './pages/hr-talent/HrTalentRadar';
import HrCandidateChallenges from './pages/hr-talent/HrCandidateChallenges';
import HrTeamVote from './pages/hr-talent/HrTeamVote';
import HrHiringQuest from './pages/hr-talent/HrHiringQuest';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import EmailSentPage from './pages/EmailSentPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import PasswordResetSuccessPage from './pages/PasswordResetSuccessPage';

export default function App() {
  const location = useLocation();

  // Legal pages (Terms / Privacy) render in their own, non-blocking Routes
  // branch so a client-side navigation to or between them never lands on a
  // blank screen. They render directly (no PageTransition motion wrapper) so
  // they always mount at full opacity, and everything stays under the single
  // <BrowserRouter> from main.tsx.
  const path = location.pathname.replace(/\/+$/, '');
  const isLegalPage = path === '/terms' || path === '/privacy';

  if (isLegalPage) {
    // Legal pages render directly (no PageTransition motion wrapper) so their
    // content never mounts stuck at opacity 0 and never waits on AnimatePresence.
    // They still require the router context (for useNavigate in LegalPageShell
    // and SiteFooter) provided by the single <BrowserRouter> from main.tsx.
    return (
      <Routes location={location}>
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
      </Routes>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<PageTransition><LandingPage /></PageTransition>} />
        <Route path="/login" element={<PageTransition><RoleSelection mode="login" /></PageTransition>} />
        <Route path="/signup" element={<PageTransition><RoleSelection mode="signup" /></PageTransition>} />
        <Route path="/applicant/login" element={<PageTransition><ApplicantLogin /></PageTransition>} />
        <Route path="/applicant/signup" element={<PageTransition><ApplicantSignup /></PageTransition>} />
        <Route path="/applicant/dashboard" element={<PageTransition><ApplicantDashboard /></PageTransition>} />
        <Route path="/applicant/career-quest" element={<PageTransition><ApplicantCareerQuest /></PageTransition>} />
        <Route path="/applicant/career-quest/challenges" element={<PageTransition><CareerQuestChallenges /></PageTransition>} />
        <Route path="/applicant/career-quest/challenges/:challengeId" element={<PageTransition><CareerQuestChallenge /></PageTransition>} />
        <Route path="/applicant/career-quest/skills" element={<PageTransition><CareerQuestSkills /></PageTransition>} />
        <Route path="/applicant/career-quest/history" element={<PageTransition><CareerQuestHistory /></PageTransition>} />
        <Route path="/applicant/my-applications" element={<PageTransition><ApplicantMyApplications /></PageTransition>} />
        <Route path="/applicant/profile" element={<PageTransition><ApplicantProfile /></PageTransition>} />
        <Route path="/applicant/start-interview" element={<PageTransition><ApplicantStartInterview /></PageTransition>} />
        <Route path="/applicant/interview-reports" element={<PageTransition><ApplicantInterviewReports /></PageTransition>} />
        <Route path="/applicant/interview-reports/:applicationId" element={<PageTransition><ApplicantInterviewFeedback /></PageTransition>} />
        <Route path="/applicant/notifications" element={<PageTransition><ApplicantNotifications /></PageTransition>} />
        <Route path="/applicant/available-jobs" element={<PageTransition><ApplicantAvailableJobs /></PageTransition>} />
        <Route path="/applicant/settings" element={<PageTransition><ApplicantSettings /></PageTransition>} />
        <Route path="/hr/interview-report/:applicationId" element={<HrInterviewReport />} />
        <Route path="/hr/login" element={<PageTransition><HrLogin /></PageTransition>} />
        <Route path="/hr/signup" element={<PageTransition><HrSignup /></PageTransition>} />

        {/* Forgot Password Flow */}
        <Route path="/forgot-password/:role" element={<PageTransition><ForgotPasswordPage /></PageTransition>} />
        <Route path="/email-sent/:role" element={<PageTransition><EmailSentPage /></PageTransition>} />
        <Route path="/reset-password/:role" element={<PageTransition><ResetPasswordPage /></PageTransition>} />
        <Route path="/password-reset-success/:role" element={<PageTransition><PasswordResetSuccessPage /></PageTransition>} />

        {/*
          HR dashboard pages are wrapped inside HrLayout which
          itself renders PageTransition around the page content.
        */}
        <Route path="/hr/dashboard" element={<HrDashboard />} />
        <Route path="/hr/job-posts" element={<HrJobPosts />} />
        <Route path="/hr/applicants" element={<HrApplicants />} />
        <Route path="/hr/resume-reports" element={<HrResumeReports />} />
        <Route path="/hr/notifications" element={<HrNotifications />} />
        <Route path="/hr/interview-results" element={<HrInterviewResults />} />
        <Route path="/hr/settings" element={<HrSettings />} />

        {/* HR Talent Arena experiences */}
        <Route path="/hr/talent-arena" element={<HrTalentArena />} />
        <Route path="/hr/talent-arena/detective" element={<HrTalentDetective />} />
        <Route path="/hr/talent-arena/blind-evaluation" element={<HrBlindEvaluation />} />
        <Route path="/hr/talent-arena/face-off" element={<HrCandidateFaceOff />} />
        <Route path="/hr/talent-arena/build-team" element={<HrBuildTeam />} />
        <Route path="/hr/talent-arena/radar" element={<HrTalentRadar />} />
        <Route path="/hr/talent-arena/challenges" element={<HrCandidateChallenges />} />
        <Route path="/hr/talent-arena/team-vote" element={<HrTeamVote />} />
        <Route path="/hr/talent-arena/hiring-quest" element={<HrHiringQuest />} />
      </Routes>
    </AnimatePresence>
  );
}