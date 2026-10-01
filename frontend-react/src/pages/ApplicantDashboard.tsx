import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import { getJson, requestErrorMessage } from '../services/api';
import { computeAiMatch, fetchOpenJobs, parseSkillList, type BackendJob } from '../services/jobUtils';
import { deriveApplicantCounters, fetchMyApplications, uploadResume, fetchResumeAnalysis, type ApplicantApplication, type ResumeAnalysis } from '../services/applications';
import { useTheme } from '../services/theme';
import { AppIcon, type ApplicantIconName } from '../components/applicant/ApplicantIcons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
  email: string;
}

interface RecommendedJob {
  id: number;
  title: string;
  company: string;
  location: string;
  type: string;
  salary: string;
  match: number;
  skills: string[];
}

interface ApplicationStage {
  label: string;
  completed: boolean;
  current: boolean;
}

interface Announcement {
  id: number;
  icon: ApplicantIconName;
  text: string;
}

interface SkillItem {
  name: string;
  level: number;
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

function buildLiveStats(apps: ApplicantApplication[]) {
  const counters = deriveApplicantCounters(apps);
  return [
    { label: 'Interviews Scheduled', value: counters.interviewsScheduled, icon: 'calendar' as ApplicantIconName, description: 'Interviews waiting to start' },
    { label: 'In Progress', value: counters.interviewsInProgress, icon: 'mic' as ApplicantIconName, description: 'Interviews currently in progress' },
    { label: 'Completed', value: counters.interviewsCompleted, icon: 'flag' as ApplicantIconName, description: 'Interviews completed with reports' },
    { label: 'Expired', value: counters.interviewsExpired, icon: 'clock' as ApplicantIconName, description: 'Interview codes expired' },
    { label: 'Reissue Requested', value: counters.reissueRequested, icon: 'refresh' as ApplicantIconName, description: 'New interview codes requested' },
  ];
}

/* Format an ISO interview expiry timestamp for the upcoming interviews list. */
function formatInterviewExpiry(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/* Tracker stages are derived from the real application status. Only stages
   supported by current application data are shown (no fake interview steps). */
function buildTrackerStages(backendStatus: string | null): ApplicationStage[] {
  switch (backendStatus) {
    case 'approved':
      return [
        { label: 'Applied', completed: true, current: false },
        { label: 'Resume Reviewed', completed: true, current: false },
        { label: 'Shortlisted', completed: false, current: true },
      ];
    case 'rejected':
      return [
        { label: 'Applied', completed: true, current: false },
        { label: 'Under Review', completed: true, current: false },
        { label: 'Not Selected', completed: false, current: true },
      ];
    case 'pending':
    default:
      return [
        { label: 'Applied', completed: true, current: false },
        { label: 'Under Review', completed: false, current: true },
      ];
  }
}

/* Helper: map a real open job to the dashboard's RecommendedJob shape. */
function toRecommendedJob(raw: BackendJob, applicantSkills: string[]): RecommendedJob {
  return {
    id: raw.id,
    title: raw.job_title,
    company: raw.company_name || '',
    location: raw.location || '',
    type: raw.job_type || '',
    salary: raw.salary || '',
    match: computeAiMatch(applicantSkills, raw.required_skills ?? []).aiMatch,
    skills: raw.required_skills ?? [],
  };
}

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  { id: 1, icon: 'rocket', text: 'We are actively hiring AI Engineers. Apply now!' },
  { id: 2, icon: 'megaphone', text: 'Internship applications close next Friday.' },
  { id: 3, icon: 'target', text: 'Interview results will be published this week.' },
  { id: 4, icon: 'sparkles', text: 'New Graduate Program now open for applications.' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatAppliedDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'Applied': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'Under Review': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    case 'Resume Accepted': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Shortlisted': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
    case 'Interview': return 'bg-green-500/10 text-green-400 border-green-500/20';
    case 'Rejected': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'Offer': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  }
}

function getMatchColor(score: number): string {
  if (score >= 90) return 'text-green-400';
  if (score >= 80) return 'text-blue-400';
  if (score >= 70) return 'text-yellow-400';
  return 'text-gray-400';
}

function getMatchBg(score: number): string {
  if (score >= 90) return 'bg-green-500/10 border-green-500/20';
  if (score >= 80) return 'bg-blue-500/10 border-blue-500/20';
  if (score >= 70) return 'bg-yellow-500/10 border-yellow-500/20';
  return 'bg-gray-500/10 border-gray-500/20';
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

/* ------------------------------------------------------------------ */
/*  Skill Match — merges real resume-analyzed skills with the skills   */
/*  the candidate entered manually on their Profile. Levels are        */
/*  derived from how strongly each skill is evidenced (never fake):    */
/*    resume + profile  -> 92   resume only -> 82   profile only -> 72 */
/* ------------------------------------------------------------------ */
function buildSkillMatch(resumeSkills: string[], profileSkills: string[]): SkillItem[] {
  const merged = new Map<string, { name: string; inResume: boolean; inProfile: boolean }>();

  (resumeSkills ?? []).forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!key) return;
    const existing = merged.get(key);
    if (existing) existing.inResume = true;
    else merged.set(key, { name: s.trim(), inResume: true, inProfile: false });
  });

  (profileSkills ?? []).forEach((s) => {
    const key = s.trim().toLowerCase();
    if (!key) return;
    const existing = merged.get(key);
    if (existing) existing.inProfile = true;
    else merged.set(key, { name: s.trim(), inResume: false, inProfile: true });
  });

  return [...merged.values()]
    .map((s) => ({
      name: s.name,
      level: s.inResume && s.inProfile ? 92 : s.inResume ? 82 : 72,
    }))
    .sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

function formatUploadedDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-blue-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getScoreStroke(score: number): string {
  if (score >= 80) return '#22c55e';
  if (score >= 60) return '#3b82f6';
  if (score >= 40) return '#eab308';
  return '#ef4444';
}

/* ------------------------------------------------------------------ */
/*  Skeleton card                                                      */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-20 bg-white/10 rounded mb-3" />
      <div className="h-8 w-12 bg-white/10 rounded mb-2" />
      <div className="h-3 w-28 bg-white/10 rounded" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated Counter                                                   */
/* ------------------------------------------------------------------ */

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let start = 0;
    const duration = 800;
    const step = Math.max(1, Math.floor(value / 30));
    const interval = setInterval(() => {
      start += step;
      if (start >= value) {
        setDisplay(value);
        clearInterval(interval);
      } else {
        setDisplay(start);
      }
    }, duration / (value / step));
    return () => clearInterval(interval);
  }, [value]);

  return <span ref={ref}>{display}{suffix}</span>;
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantDashboard() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [session, setSession] = useState<ApplicantSession | null>(null);

  /* Real recommended jobs (latest 5 OPEN jobs). */
  const [recJobs, setRecJobs] = useState<RecommendedJob[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recError, setRecError] = useState('');
  const [recReload, setRecReload] = useState(0);

  /* Real applications (counters, tracker, recent). */
  const [apps, setApps] = useState<ApplicantApplication[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState('');
  const [appsReload, setAppsReload] = useState(0);

  /* Real applicant profile (Profile Status + manually entered skills). */
  const [profile, setProfile] = useState<{
    phone: string;
    location: string;
    experience: string;
    skills: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  /* Real resume analysis (Resume Strength + resume-analyzed skills). */
  const [resume, setResume] = useState<ResumeAnalysis | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /* Load latest 5 OPEN jobs from the real backend source. */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setRecLoading(true);
    setRecError('');
    (async () => {
      try {
        const rawJobs = await fetchOpenJobs();
        const applicantSkills: string[] = profile?.skills ? parseSkillList(profile.skills) : [];
        const recent = rawJobs.slice(0, 5).map((raw) => toRecommendedJob(raw, applicantSkills));
        if (!cancelled) {
          setRecJobs(recent);
          setRecLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setRecError(requestErrorMessage(err, 'Could not load recommended jobs.'));
          setRecLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session, recReload, profile]);

  /* Load the applicant's real profile (Profile Status + manual skills). */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      try {
        const p = await getJson<{
          phone?: string;
          location?: string;
          experience?: string;
          skills?: string;
        } | null>(`/applicant/profile/${session.applicant_id}`);
        if (!cancelled) {
          setProfile({
            phone: p?.phone ?? '',
            location: p?.location ?? '',
            experience: p?.experience ?? '',
            skills: p?.skills ?? '',
          });
        }
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  /* Load the applicant's saved resume analysis (Resume Strength + skills). */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setResumeLoading(true);
    (async () => {
      try {
        const analysis = await fetchResumeAnalysis(session.applicant_id);
        if (!cancelled) setResume(analysis);
      } catch {
        if (!cancelled) setResume(null);
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session]);

  /* Load the applicant's real applications. */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setAppsLoading(true);
    setAppsError('');
    (async () => {
      try {
        const list = await fetchMyApplications(session.applicant_id);
        if (!cancelled) {
          setApps(list);
          setAppsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setAppsError(requestErrorMessage(err, 'Could not load your applications.'));
          setAppsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [session, appsReload]);

  const liveStats = useMemo(() => buildLiveStats(apps), [apps]);
  const latestApp = apps.length ? apps[0] : null;
  const trackerStages = useMemo(
    () => buildTrackerStages(latestApp ? latestApp.backendStatus : null),
    [latestApp]
  );
  const recentApps = apps.slice(0, 5);
  /* Upcoming interviews = real applications with 'Not Started' + a valid code. */
  const upcomingInterviews = useMemo(
    () => apps.filter((a) => a.interviewStatus === 'Not Started' && !!a.interviewCode),
    [apps]
  );

  /* ---- Real Skill Match data: resume-analyzed + manually entered skills ---- */
  const profileSkills = useMemo(
    () => (profile?.skills ? parseSkillList(profile.skills) : []),
    [profile]
  );
  const resumeSkills = useMemo(() => (resume?.skills ?? []), [resume]);
  const skillMatch = useMemo(
    () => buildSkillMatch(resumeSkills, profileSkills),
    [resumeSkills, profileSkills]
  );

  /* ---- Profile completion (same source of truth as the Applicant Profile
     page — real persisted fields only; 'Resume Uploaded' uses the actual
     resume analysis instead of a hardcoded true). ---- */
  const completionItems = [
    { label: 'Personal Information', done: !!profile?.phone && !!profile?.location },
    { label: 'Professional Details', done: !!profile?.experience },
    { label: 'Resume Uploaded', done: !!resume?.filename },
    { label: 'Skills Added', done: profileSkills.length >= 3 },
  ];
  const completionPercent = Math.round(
    (completionItems.filter((i) => i.done).length / completionItems.length) * 100
  );

  /* ---- Resume upload handlers ---- */
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !session) return;
    setUploading(true);
    setUploadError('');
    try {
      const analysis = await uploadResume(session.applicant_id, file);
      setResume(analysis);
    } catch (err) {
      setUploadError(requestErrorMessage(err, 'Could not upload resume.'));
    } finally {
      setUploading(false);
    }
  };

  if (!session) return null;

  const { full_name } = session;
  const greeting = getGreeting();

  return (
    <ApplicantLayout activePage="dashboard">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        {/* ============================================================ */}
        {/* SECTION 1: WELCOME HERO                                      */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8"
        >
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">
                {greeting}, {full_name.split(' ')[0]}
              </motion.h1>
              <motion.p variants={staggerItem} className="text-gray-400 mt-2 text-sm md:text-base">
                Ready to take the next step in your career?
              </motion.p>
              <motion.p variants={staggerItem} className="text-gray-500 text-xs md:text-sm mt-1 max-w-xl">
                Your AI-powered career assistant helps you discover opportunities, track applications, and prepare for interviews.
              </motion.p>
            </div>

            {/* Profile Completion */}
            <motion.div variants={staggerItem} className="shrink-0 w-full md:w-64 bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Profile Completion</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:text-primary-light transition-colors"
                  >
                    {theme === 'dark' ? <AppIcon name="sun" className="w-4 h-4" /> : <AppIcon name="moon" className="w-4 h-4" />}
                  </button>
                  <span className={`text-lg font-extrabold ${getScoreColor(completionPercent)}`}>
                    {profileLoading ? '—' : `${completionPercent}%`}
                  </span>
                </span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                  initial={{ width: 0 }}
                  animate={{ width: `${profileLoading ? 0 : completionPercent}%` }}
                  transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
                />
              </div>
              <motion.button
                variants={staggerItem}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/applicant/profile')}
                className="mt-4 w-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift"
              >
                Complete Profile
              </motion.button>
            </motion.div>
          </div>
        </motion.section>

        {/* ============================================================ */}
        {/* CAREER QUEST — quick entry                                    */}
        {/* ============================================================ */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-gradient-to-r from-primary/10 via-navy-800/40 to-navy-900 border border-white/10 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="w-11 h-11 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary-light shrink-0">
            <AppIcon name="rocket" className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Career Quest</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Explore your career map, take quick challenges, unlock mystery opportunities and see your explainable match score.
            </p>
          </div>
          <button
            onClick={() => navigate('/applicant/career-quest')}
            className="shrink-0 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift"
          >
            Start Quest
          </button>
        </motion.div>

        {/* ============================================================ */}
        {/* RESUME UPLOAD — COMPACT TOP BOX                              */}
        {/* ============================================================ */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3"
        >
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center text-primary-light shrink-0">
              {resume ? <AppIcon name="document" className="w-4 h-4" /> : <AppIcon name="upload" className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              {resume ? (
                <>
                  <p className="text-sm font-medium text-gray-200 truncate">{resume.filename}</p>
                  <p className="text-[11px] text-gray-500">
                    Uploaded {formatUploadedDate(resume.created_at)} · Resume Score{' '}
                    <span className="font-bold text-primary-light">{resume.score}%</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-gray-200">Resume Upload</p>
                  <p className="text-[11px] text-gray-500">Upload your resume (PDF or DOCX) for a Resume Strength analysis.</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleUploadClick}
              disabled={uploading}
              className="inline-flex items-center gap-2 text-xs bg-primary hover:bg-primary-hover disabled:opacity-60 text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift shrink-0"
            >
              {uploading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <AppIcon name="upload" className="w-4 h-4" />
                  {resume ? 'Upload New Resume' : 'Upload Resume'}
                </>
              )}
            </button>
            {/* Hidden file input — supports the app's accepted resume formats. */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleFileSelected}
            />
          </div>
          {uploadError && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <AppIcon name="alert" className="w-4 h-4 shrink-0" />
              {uploadError}
            </div>
          )}
        </motion.div>

        {/* ============================================================ */}
        {/* SECTION 2: COMPANY ANNOUNCEMENTS                             */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl p-5"
        >
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Company Announcements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MOCK_ANNOUNCEMENTS.map((ann) => (
              <motion.div
                key={ann.id}
                variants={staggerItem}
                className="flex items-start gap-3 p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.07] transition-all card-hover"
              >
                <AppIcon name={ann.icon} className="w-5 h-5 shrink-0 mt-0.5 text-primary-light" />
                <p className="text-sm text-gray-300">{ann.text}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 3: QUICK STATS                                       */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
        >
          {appsLoading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : appsError ? (
            <div className="col-span-full bg-white/5 border border-red-500/20 rounded-2xl p-6 text-center">
              <p className="text-sm text-red-300">{appsError}</p>
              <button onClick={() => setAppsReload((n) => n + 1)} className="mt-3 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift">
                Retry
              </button>
            </div>
          ) : (
            liveStats.map((stat) => (
              <motion.div
                key={stat.label}
                variants={staggerItem}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all duration-300 group card-hover"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{stat.label}</p>
                    <p className="text-3xl font-extrabold text-white">
                      <AnimatedCounter value={stat.value} />
                    </p>
                  </div>
                  <span className="text-primary-light opacity-60 group-hover:opacity-100 transition-opacity">
                    <AppIcon name={stat.icon} className="w-6 h-6" />
                  </span>
                </div>
                <div className="mt-2 h-px w-full bg-white/5" />
                <p className="text-[11px] text-gray-600 mt-2">{stat.description}</p>
              </motion.div>
            ))
          )}
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 4: RECOMMENDED JOBS                                  */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recommended Jobs</h2>
            <button
              onClick={() => navigate('/applicant/available-jobs')}
              className="text-xs text-primary-light hover:text-primary transition-colors"
            >
              View All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {recLoading ? (
              <>
                <SkeletonCard /><SkeletonCard /><SkeletonCard />
              </>
            ) : recError ? (
              <div className="col-span-full bg-white/5 border border-red-500/20 rounded-2xl p-6 text-center">
                <p className="text-sm text-red-300">Couldn't load recommended jobs.</p>
                <button onClick={() => setRecReload((n) => n + 1)} className="mt-3 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift">
                  Retry
                </button>
              </div>
            ) : recJobs.length === 0 ? (
              <div className="col-span-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                <p className="text-sm text-gray-500">No open jobs are available right now.</p>
              </div>
            ) : (
              recJobs.map((job) => (
                <motion.div
                  key={job.id}
                  variants={staggerItem}
                  className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all duration-300 group card-hover"
                >
                  {/* AI Match Badge */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">{job.title}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">{job.company}</p>
                    </div>
                    <div className={`shrink-0 ml-2 px-2.5 py-1 rounded-lg border text-xs font-bold ${getMatchBg(job.match)} ${getMatchColor(job.match)}`}>
                      {job.match}% Match
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <AppIcon name="location" className="w-4 h-4 shrink-0" /> {job.location}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <AppIcon name="briefcase" className="w-4 h-4 shrink-0" /> {job.type}
                    </div>
                    {job.salary && (
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <AppIcon name="currency" className="w-4 h-4 shrink-0" /> {job.salary}
                      </div>
                    )}
                  </div>

                  {/* Skill tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {job.skills.map((skill) => (
                      <span key={skill} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/applicant/available-jobs')}
                      className="flex-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 rounded-xl transition-all"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => navigate('/applicant/available-jobs')}
                      className="flex-1 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 rounded-xl transition-all btn-lift"
                    >
                      Apply Now
                    </button>
                    <button
                      className="shrink-0 p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-yellow-400 transition-all"
                      title="Save Job"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 5: APPLICATION TRACKER                               */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl p-5"
        >
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Application Tracker</h2>
          {trackerStages.length === 0 ? (
            <div className="text-center py-8">
              <AppIcon name="clipboard" className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-gray-500 text-sm">No applications yet. Your progress will appear here.</p>
            </div>
          ) : (
          <div className="flex items-start justify-between overflow-x-auto pb-2">
            {trackerStages.map((stage, i) => (
              <div key={stage.label} className="flex items-center shrink-0">
                <div className="flex flex-col items-center">
                  <motion.div
                    variants={staggerItem}
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all ${
                      stage.current
                        ? 'bg-primary/20 border-primary text-primary-light shadow-lg shadow-primary/20'
                        : stage.completed
                          ? 'bg-green-500/20 border-green-500 text-green-400'
                          : 'bg-white/5 border-white/10 text-gray-600'
                    }`}
                  >
                    {stage.completed ? <AppIcon name="check" className="w-5 h-5" /> : stage.current ? <span className="w-2 h-2 rounded-full bg-current inline-block" /> : i + 1}
                  </motion.div>
                  <p className={`text-[10px] mt-1.5 whitespace-nowrap ${
                    stage.current ? 'text-primary-light font-semibold' : stage.completed ? 'text-green-400' : 'text-gray-600'
                  }`}>
                    {stage.label}
                  </p>
                </div>
                {i < trackerStages.length - 1 && (
                  <div className={`w-8 md:w-12 h-0.5 mx-1 mt-[-1.5rem] ${
                    stage.completed ? 'bg-green-500/50' : 'bg-white/10'
                  }`} />
                )}
              </div>
            ))}
          </div>
          )}
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 6: UPCOMING INTERVIEWS                               */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl p-5"
        >
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Upcoming Interviews</h2>
          {upcomingInterviews.length === 0 ? (
            <div className="text-center py-8">
              <AppIcon name="calendar" className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-gray-500 text-sm">No interviews scheduled.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingInterviews.map((interview) => (
                <motion.div
                  key={interview.applicationId}
                  variants={staggerItem}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/[0.07] transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{interview.jobTitle}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{interview.company}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1"><AppIcon name="clipboard" className="w-3.5 h-3.5" /> {interview.statusLabel}</span>
                      {interview.interviewExpiresAt && (
                        <span className="flex items-center gap-1"><AppIcon name="clock" className="w-3.5 h-3.5" /> Expires {formatInterviewExpiry(interview.interviewExpiresAt)}</span>
                      )}
                      <span className="flex items-center gap-1"><AppIcon name="video" className="w-3.5 h-3.5" /> AI Interview</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('/applicant/start-interview', {
                      state: {
                        applicationId: interview.applicationId,
                        interviewCode: interview.interviewCode ?? '',
                        jobTitle: interview.jobTitle,
                      },
                    })}
                    className="shrink-0 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift"
                  >
                    Start Interview
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 7: RECENT APPLICATIONS                               */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Recent Applications</h2>
            <button
              onClick={() => navigate('/applicant/my-applications')}
              className="text-xs text-primary-light hover:text-primary transition-colors"
            >
              View All
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {appsLoading ? (
              <div className="p-5 space-y-3">
                <div className="h-5 bg-white/10 rounded animate-pulse" />
                <div className="h-5 bg-white/10 rounded animate-pulse w-3/4" />
              </div>
            ) : appsError ? (
              <div className="p-6 text-center">
                <p className="text-sm text-red-300">{appsError}</p>
                <button onClick={() => setAppsReload((n) => n + 1)} className="mt-3 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all">
                  Retry
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                      <th className="text-left px-5 py-2.5 font-medium">Job</th>
                      <th className="text-left px-5 py-2.5 font-medium">Company</th>
                      <th className="text-left px-5 py-2.5 font-medium">Applied On</th>
                      <th className="text-left px-5 py-2.5 font-medium">Status</th>
                      <th className="text-right px-5 py-2.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentApps.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-gray-500 text-sm">
                          No applications yet.
                        </td>
                      </tr>
                    ) : recentApps.map((app) => (
                      <tr key={app.applicationId} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors table-row-hover">
                        <td className="px-5 py-3 text-white font-medium">{app.jobTitle}</td>
                        <td className="px-5 py-3 text-gray-400">{app.company}</td>
                        <td className="px-5 py-3 text-gray-400">{formatAppliedDate(app.appliedOn)}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${getStatusColor(app.statusLabel)}`}>
                            {app.statusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() =>
                              app.hasReport
                                ? navigate(`/applicant/interview-reports/${app.applicationId}`)
                                : navigate('/applicant/my-applications')
                            }
                            className="text-xs text-primary-light hover:text-primary transition-colors font-medium"
                          >
                            {app.hasReport ? 'View Report' : 'View'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.section>

        {/* ============================================================ */}
        {/* SECTIONS 8+9: RESUME STRENGTH | SKILL MATCH (SIDE BY SIDE)   */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {/* ============================================================ */}
        {/* SECTION 8: RESUME STRENGTH                                   */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col"
        >
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Resume Strength</h2>
            {resume?.filename && (
              <p className="text-[11px] text-gray-600 mt-1 flex items-center gap-1.5">
                <AppIcon name="document" className="w-3.5 h-3.5" />
                {resume.filename}
                {resume.created_at ? ` — uploaded ${formatUploadedDate(resume.created_at)}` : ''}
              </p>
            )}
          </div>

          {resumeLoading ? (
            <div className="flex flex-col gap-6 animate-pulse">
              <div className="w-24 h-24 rounded-full bg-white/10 mx-auto" />
              <div className="flex-1 space-y-3">
                {[1, 2, 3].map((n) => <div key={n} className="h-2 bg-white/10 rounded-full" />)}
              </div>
            </div>
          ) : !resume ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
              <AppIcon name="document" className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-gray-400 text-sm">No resume uploaded yet.</p>
              <p className="text-gray-500 text-xs mt-1">Upload your resume in the box above to see your Resume Strength analysis.</p>
            </div>
          ) : (
          <div className="flex-1 flex flex-col gap-6">
            {/* Main score */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                  <motion.circle
                    cx="50" cy="50" r="42" fill="none" stroke={getScoreStroke(resume.score)} strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                    animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - resume.score / 100) }}
                    transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-2xl font-extrabold ${getScoreColor(resume.score)}`}>{resume.score}%</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Overall Score</p>
            </div>

            {/* Subscores */}
            <div className="flex-1 space-y-3">
              {(resume.subscores ?? []).map((sub) => (
                <div key={sub.label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-400">{sub.label}</span>
                    <span className="text-xs text-gray-500">{sub.score}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                      initial={{ width: 0 }}
                      animate={{ width: `${sub.score}%` }}
                      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Suggestions */}
            <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Suggestions</p>
              <ul className="space-y-2">
                {(resume.suggestions ?? []).map((suggestion, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <AppIcon name="lightbulb" className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          )}
        </motion.section>

        {/* ============================================================ */}
        {/* SECTION 9: SKILL MATCH                                       */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-white/5 border border-white/10 rounded-2xl p-5"
        >
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Skill Match</h2>
          {skillMatch.length === 0 ? (
            <div className="text-center py-10">
              <AppIcon name="briefcase" className="w-10 h-10 mx-auto mb-3 text-gray-500" />
              <p className="text-gray-400 text-sm">No skills found yet.</p>
              <p className="text-gray-500 text-xs mt-1">Add skills on your Profile or upload your resume to see your skill match here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {skillMatch.map((skill) => (
                <div key={skill.name}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm text-gray-300 font-medium">{skill.name}</span>
                    <span className="text-xs font-bold" style={{
                      color: skill.level >= 90 ? '#4ade80' : skill.level >= 80 ? '#60a5fa' : skill.level >= 70 ? '#facc15' : '#9ca3af'
                    }}>
                      {skill.level}%
                    </span>
                  </div>
                  <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, ${
                          skill.level >= 90 ? '#4ade80' : skill.level >= 80 ? '#3b82f6' : skill.level >= 70 ? '#facc15' : '#9ca3af'
                        }, ${
                          skill.level >= 90 ? '#22c55e' : skill.level >= 80 ? '#2563eb' : skill.level >= 70 ? '#eab308' : '#6b7280'
                        })`
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${skill.level}%` }}
                      transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.section>
        </div>
      </div>
    </ApplicantLayout>
  );
}