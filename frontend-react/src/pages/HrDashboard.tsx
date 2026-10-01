import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson } from '../services/api';
import HrLayout from '../components/hr/HrLayout';
import RecruiterCommandCenter from '../components/hr/RecruiterCommandCenter';
import {
  UsersIcon,
  BriefcaseIcon,
  CheckCircleIcon,
  HourglassIcon,
  KeyIcon,
  RefreshIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  AwardIcon,
} from '../components/hr/HrIcons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface DashboardJob {
  job_title: string;
  applicants: number;
}

interface DashboardData {
  active_jobs: number;
  total_applicants: number;
  completed_interviews: number;
  pending_interviews: number;
  jobs: DashboardJob[];
  activities: string[];
  pending_hr: number;
  reissues: number;
  expired: number;
}

interface TopCandidate {
  application_id: number;
  full_name: string;
  job_title: string;
  overall_score: number;
}

interface HiringInsights {
  most_applied_domain?: string;
  total_completed_interviews?: number;
  average_interview_score?: number;
  resume_approval_percentage?: number;
  total_applicants?: number;
}

interface PendingActions {
  pending_approvals: number;
  pending_codes: number;
  pending_reissues: number;
}

interface AnalyticsData {
  top_domains: { domain: string; applications: number }[];
  top_candidates: TopCandidate[];
  insights: HiringInsights;
  pending_actions: PendingActions;
}

interface ApplicantItem {
  application_id: number;
  full_name: string;
  email: string;
  job_title: string;
  status: string;
  applied_at: string;
}

interface InterviewItem {
  application_id: number;
  full_name: string;
  job_title: string;
  status: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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
/*  Analytics Card Wrapper                                             */
/* ------------------------------------------------------------------ */

function AnalyticsCard({ title, children, className = '' }: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white/5 border border-white/10 rounded-2xl p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Interactive Metric Card with Dropdown                              */
/* ------------------------------------------------------------------ */

function InteractiveMetricCard({
  label,
  value,
  icon,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all duration-300 group cursor-pointer"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
            <p className="text-3xl font-extrabold text-white">{value}</p>
          </div>
          <span className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity text-primary-light">
            {icon}
          </span>
        </div>
        <div className="mt-2 h-px w-full bg-white/5" />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          expanded ? 'max-h-96 opacity-100 mt-2' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export default function HrDashboard() {
  const navigate = useNavigate();

  const [session, setSession] = useState<HrSession | null>(null);

  const [data, setData] = useState<DashboardData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Dropdown states */
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  /* Dropdown data */
  const [applicants, setApplicants] = useState<ApplicantItem[]>([]);
  const [completedInterviews, setCompletedInterviews] = useState<InterviewItem[]>([]);
  const [pendingInterviews, setPendingInterviews] = useState<InterviewItem[]>([]);

  /* Open Positions expand */
  const [showAllPositions, setShowAllPositions] = useState(false);

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

  /* Fetch dashboard data */
  const fetchData = useCallback(async (hrId: number) => {
    setLoading(true);
    setError('');

    try {
      const [dashData, analyticsData] = await Promise.all([
        getJson(`/hr/dashboard/${hrId}`) as Promise<DashboardData>,
        getJson(`/hr/dashboard/analytics/${hrId}`) as Promise<AnalyticsData>,
      ]);

      setData(dashData);
      setAnalytics(analyticsData);
      setLoading(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load dashboard data.';
      setError(msg);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session?.hr_id) return;
    fetchData(session.hr_id);
  }, [session?.hr_id, fetchData]);

  /* Fetch dropdown data on demand */
  const fetchDropdownData = useCallback(async (hrId: number, metric: string) => {
    try {
      switch (metric) {
        case 'Total Applicants': {
          const res = await getJson(`/hr/dashboard/applicants/${hrId}`) as ApplicantItem[];
          setApplicants(res);
          break;
        }
        case 'Interviews Completed': {
          const res = await getJson(`/hr/completed-interviews/${hrId}`) as InterviewItem[];
          setCompletedInterviews(res);
          break;
        }
        case 'Interviews Pending': {
          const res = await getJson(`/hr/pending-interviews/${hrId}`) as InterviewItem[];
          setPendingInterviews(res);
          break;
        }
      }
    } catch {
      // Silently fail
    }
  }, []);

  const handleMetricToggle = useCallback((metric: string) => {
    if (expandedMetric === metric) {
      setExpandedMetric(null);
      return;
    }
    setExpandedMetric(metric);
    if (session?.hr_id) {
      fetchDropdownData(session.hr_id, metric);
    }
  }, [expandedMetric, session?.hr_id, fetchDropdownData]);

  if (!session) return null;

  const { hr_name } = session;

  const { top_candidates = [], insights = {}, pending_actions = { pending_approvals: 0, pending_codes: 0, pending_reissues: 0 } } = analytics || {};
  const { pending_approvals, pending_codes, pending_reissues } = pending_actions;

  const pendingItems = [
    { label: 'Pending Applicant Approvals', count: pending_approvals, route: '/hr/applicants', icon: <HourglassIcon className="w-4 h-4" />, color: 'text-yellow-400' },
    { label: 'Pending Interview Code Generation', count: pending_codes, route: '/hr/job-posts', icon: <KeyIcon className="w-4 h-4" />, color: 'text-orange-400' },
    { label: 'Pending Reissue Requests', count: pending_reissues, route: '/hr/applicants', icon: <RefreshIcon className="w-4 h-4" />, color: 'text-red-400' },
  ];

  /* Open Positions */
  const allJobs = data?.jobs ?? [];
  const displayedJobs = showAllPositions ? allJobs : allJobs.slice(0, 5);
  const totalJobs = allJobs.length;

  /* Dropdown renderers */
  const renderDropdownContent = (metric: string) => {
    switch (metric) {
      case 'Total Applicants':
        if (applicants.length === 0) {
          return <p className="text-gray-500 text-sm text-center py-2">No applicants found.</p>;
        }
        return (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {applicants.map((app) => (
              <div key={app.application_id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{app.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{app.job_title}</p>
                </div>
                <span className={`text-xs shrink-0 ml-2 ${
                  app.status === 'approved' ? 'text-green-400' :
                  app.status === 'rejected' ? 'text-red-400' :
                  'text-yellow-400'
                }`}>
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        );

      case 'Interviews Completed':
        if (completedInterviews.length === 0) {
          return <p className="text-gray-500 text-sm text-center py-2">No completed interviews.</p>;
        }
        return (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {completedInterviews.map((item) => (
              <button
                key={item.application_id}
                onClick={() => navigate(`/hr/interview-report/${item.application_id}`)}
                className="w-full flex items-center justify-between p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{item.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{item.job_title}</p>
                </div>
                <span className="text-xs text-green-400 shrink-0 ml-2">Completed <ChevronRightIcon className="w-3.5 h-3.5 inline" /></span>
              </button>
            ))}
          </div>
        );

      case 'Interviews Pending':
        if (pendingInterviews.length === 0) {
          return <p className="text-gray-500 text-sm text-center py-2">No pending interviews.</p>;
        }
        return (
          <div className="max-h-60 overflow-y-auto space-y-2">
            {pendingInterviews.map((item) => (
              <div key={item.application_id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate">{item.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{item.job_title}</p>
                </div>
                <span className="text-xs text-yellow-400 shrink-0 ml-2">In Progress</span>
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <HrLayout activePage="dashboard">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6">
        {/* Welcome panel */}
        {!loading && !error && (
          <div className="mb-6">
            <RecruiterCommandCenter hrName={hr_name} />
          </div>
        )}
        {/* Error banner */}
        {error && !loading && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            Could not load dashboard data from the server.
            <br />
            <span className="text-red-400/60 text-xs">Error: {error}</span>
          </div>
        )}

        {/* 4 compact metric cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {loading ? (
            <>
              <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
            </>
          ) : (
            <>
              <InteractiveMetricCard
                label="Total Applicants"
                value={data?.total_applicants ?? 0}
                icon={<UsersIcon className="w-6 h-6" />}
                expanded={expandedMetric === 'Total Applicants'}
                onToggle={() => handleMetricToggle('Total Applicants')}
              >
                {renderDropdownContent('Total Applicants')}
              </InteractiveMetricCard>

              <div className="w-full text-left bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Open Positions</p>
                    <p className="text-3xl font-extrabold text-white">{totalJobs}</p>
                  </div>
                  <span className="shrink-0 opacity-70 text-primary-light">
                    <BriefcaseIcon className="w-6 h-6" />
                  </span>
                </div>
                <div className="mt-2 h-px w-full bg-white/5" />
              </div>

              <InteractiveMetricCard
                label="Interviews Completed"
                value={data?.completed_interviews ?? 0}
                icon={<CheckCircleIcon className="w-6 h-6" />}
                expanded={expandedMetric === 'Interviews Completed'}
                onToggle={() => handleMetricToggle('Interviews Completed')}
              >
                {renderDropdownContent('Interviews Completed')}
              </InteractiveMetricCard>

              <InteractiveMetricCard
                label="Interviews Pending"
                value={data?.pending_interviews ?? 0}
                icon={<HourglassIcon className="w-6 h-6" />}
                expanded={expandedMetric === 'Interviews Pending'}
                onToggle={() => handleMetricToggle('Interviews Pending')}
              >
                {renderDropdownContent('Interviews Pending')}
              </InteractiveMetricCard>
            </>
          )}
        </section>

        {/* Compact Top Performers + Pending Actions (side by side) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {!loading && !error && (
            <AnalyticsCard title="Top Performers" className="h-full">
              {top_candidates.length === 0 ? (
                <p className="text-gray-500 text-sm">No completed interviews yet.</p>
              ) : (
                <div className="space-y-2">
                  {top_candidates.map((c, i) => {
                    const medalIconColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
                    const medalColors = ['from-yellow-400/20 to-yellow-500/10 border-yellow-500/30', 'from-gray-300/20 to-gray-400/10 border-gray-400/30', 'from-amber-600/20 to-amber-700/10 border-amber-600/30'];
                    const scoreColors = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];
                    return (
                      <div key={c.application_id} className={`flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-r ${medalColors[i]} border ${medalColors[i].split(' ').pop()}`}>
                        <span className={`shrink-0 ${medalIconColors[i]}`}><AwardIcon className="w-5 h-5" /></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate">{c.full_name}</p>
                          <p className="text-xs text-gray-400 truncate">{c.job_title}</p>
                        </div>
                        <span className={`text-base font-extrabold ${scoreColors[i]}`}>{c.overall_score}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </AnalyticsCard>
          )}
          {!loading && !error && (
            <AnalyticsCard title="Pending Actions" className="h-full">
              <div className="space-y-2">
                {pendingItems.map((item, i) => (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); navigate(item.route); }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all hover:bg-white/10 ${
                      item.count > 0
                        ? i === 0 ? 'bg-yellow-500/10 border-yellow-500/30'
                        : i === 1 ? 'bg-orange-500/10 border-orange-500/30'
                        : 'bg-red-500/10 border-red-500/30'
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">{item.icon}</span>
                      <span className="text-sm text-white font-medium">{item.label}</span>
                    </div>
                    <span className={`text-base font-bold ${item.count > 0 ? item.color : 'text-gray-500'}`}>
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            </AnalyticsCard>
          )}
        </div>

        {/* Open Positions with expandable control */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              Open Positions ({totalJobs})
            </h2>
            {totalJobs > 5 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowAllPositions((v) => !v); }}
                className="text-xs text-primary-light hover:text-primary transition-colors flex items-center gap-1"
              >
                <span>{showAllPositions ? 'Show Less' : 'View All'}</span>
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAllPositions ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden transition-all duration-300">
            {loading ? (
              <div className="p-5 space-y-3">
                <div className="h-5 bg-white/10 rounded animate-pulse" />
                <div className="h-5 bg-white/10 rounded animate-pulse w-3/4" />
              </div>
            ) : !data?.jobs || data.jobs.length === 0 ? (
              <div className="p-5 text-center">
                <p className="text-gray-500 text-sm">No open positions yet.</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-2.5 font-medium">Job Title</th>
                    <th className="text-right px-5 py-2.5 font-medium">Applicants</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedJobs.map((job, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors">
                      <td className="px-5 py-3 text-white font-medium">{job.job_title}</td>
                      <td className="px-5 py-3 text-right text-gray-400">{job.applicants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* AI Hiring Insights */}
        <div className="mb-6">
          <AnalyticsCard title="AI Hiring Insights">
            {loading ? (
              <div className="space-y-2">
                <div className="h-4 bg-white/10 rounded animate-pulse" />
                <div className="h-4 bg-white/10 rounded animate-pulse w-3/4" />
              </div>
            ) : Object.keys(insights).length === 0 ? (
              <p className="text-gray-500 text-sm">No insights available yet.</p>
            ) : (
              <div className="space-y-2">
                {insights.total_applicants !== undefined && (
                  <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl">
                    <span className="text-sm text-gray-300">Total Applicants</span>
                    <span className="text-lg font-bold text-white">{insights.total_applicants}</span>
                  </div>
                )}
                {insights.most_applied_domain && (
                  <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl">
                    <span className="text-sm text-gray-300">Most Applied Domain</span>
                    <span className="text-sm font-bold text-primary-light">{insights.most_applied_domain}</span>
                  </div>
                )}
                {insights.total_completed_interviews !== undefined && (
                  <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl">
                    <span className="text-sm text-gray-300">Completed Interviews</span>
                    <span className="text-lg font-bold text-white">{insights.total_completed_interviews}</span>
                  </div>
                )}
                {insights.average_interview_score !== undefined && (
                  <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl">
                    <span className="text-sm text-gray-300">Avg Interview Score</span>
                    <span className="text-lg font-bold text-green-400">{insights.average_interview_score}%</span>
                  </div>
                )}
                {insights.resume_approval_percentage !== undefined && (
                  <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl">
                    <span className="text-sm text-gray-300">Resume Approval Rate</span>
                    <span className="text-lg font-bold text-blue-400">{insights.resume_approval_percentage}%</span>
                  </div>
                )}
              </div>
            )}
          </AnalyticsCard>

        </div>
      </div>
    </HrLayout>
  );
}