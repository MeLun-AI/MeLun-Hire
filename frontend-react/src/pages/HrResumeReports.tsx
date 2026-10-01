import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { getJson } from '../services/api';
import HrLayout from '../components/hr/HrLayout';
import { CheckCircleIcon, CloseIcon, ChevronDownIcon, ChevronRightIcon, ChartIcon, ListIcon, TargetIcon, TrophyIcon, BriefcaseIcon, BellIcon, CheckIcon } from '../components/hr/HrIcons';

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface ResumeReport {
  application_id: number;
  full_name: string;
  email: string;
  job_title: string;
  job_domain: string;
  status: string;
  interview_status: string;
  interview_code: string | null;
  interview_expires_at: string | null;
  reissue_requested: number;
  reissue_count: number;
}

interface SkillEvidence {
  skill: string;
  status: string; // demonstrated | implied | mentioned | missing
  evidence: string;
  source?: string;
  confidence?: string;
}

interface FitBlock {
  rating?: string;
  summary?: string;
  score?: number;
  required?: string;
  candidate?: number | string | null;
}

interface ResponsibilityFit {
  responsibility: string;
  present: boolean;
  evidence: string;
}

interface ResumeReportDetail {
  full_name: string;
  email: string;
  job_title: string;
  job_domain: string;
  resume_status: string;
  interview_status: string | null;
  matched: boolean | null;
  matched_skills: string | null;
  resume_filename: string | null;
  report?: {
    match_score: number;
    recommendation: string;
    recommendation_reasons: string[];
    role_fit: FitBlock;
    required_skills: SkillEvidence[];
    preferred_skills: SkillEvidence[];
    experience_fit: FitBlock;
    responsibilities_fit: ResponsibilityFit[];
    education_fit: FitBlock;
    domain_fit: FitBlock;
    strengths: string[];
    gaps: string[];
    ai_refined?: boolean;
  };
}

function AlertIcon(props: { className?: string }) {
  const { className = 'w-4 h-4' } = props;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function InfoIcon(props: { className?: string }) {
  const { className = 'w-4 h-4' } = props;
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function scoreTone(score: number): string {
  if (score >= 80) return 'bg-green-500/15 text-green-300 border border-green-500/30';
  if (score >= 65) return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
  if (score >= 50) return 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
  if (score >= 35) return 'bg-orange-500/15 text-orange-300 border border-orange-500/30';
  return 'bg-red-500/15 text-red-300 border border-red-500/30';
}

function ratingLabel(rating?: string): string {
  const map: Record<string, string> = {
    strong: 'Strong', moderate: 'Moderate', weak: 'Weak', poor: 'Poor',
    mismatch: 'Mismatch', neutral: 'Neutral', 'n/a': 'Not Applicable',
  };
  return rating ? map[rating] || rating : '—';
}

function ratingTone(rating?: string): string {
  const map: Record<string, string> = {
    strong: 'text-green-400', moderate: 'text-yellow-400', weak: 'text-orange-400',
    poor: 'text-red-400', mismatch: 'text-red-400', neutral: 'text-gray-400', 'n/a': 'text-gray-500',
  };
  return rating ? map[rating] || 'text-gray-400' : 'text-gray-500';
}

function StatusBadge({ status, type }: { status: string; type: 'resume' | 'interview' }) {
  const s = (status || '').toLowerCase();
  let cls = 'bg-white/10 text-gray-300 border border-white/10';
  if (type === 'resume') {
    if (s === 'pending') cls = 'bg-yellow-500/15 text-yellow-300 border border-yellow-500/30';
    else if (s === 'approved') cls = 'bg-green-500/15 text-green-300 border border-green-500/30';
    else if (s === 'rejected') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
  } else {
    if (s === 'not started') cls = 'bg-gray-500/15 text-gray-300 border border-gray-500/30';
    else if (s === 'in progress') cls = 'bg-blue-500/15 text-blue-300 border border-blue-500/30';
    else if (s === 'completed') cls = 'bg-green-500/15 text-green-300 border border-green-500/30';
    else if (s === 'expired') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
    else if (s === 'abandoned') cls = 'bg-gray-500/15 text-gray-300 border border-gray-500/30';
    else if (s === 'violated') cls = 'bg-red-500/15 text-red-300 border border-red-500/30';
  }
  return (
    <span className={`text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full ${cls}`}>{status}</span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="h-4 bg-white/10 rounded w-1/3 mb-3" />
      <div className="h-3 bg-white/10 rounded w-1/2 mb-2" />
      <div className="h-3 bg-white/10 rounded w-2/3" />
    </div>
  );
}

function SectionHeader({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-primary-light">{icon}</span>
      <h3 className="text-sm font-bold text-white uppercase tracking-wider">{children}</h3>
    </div>
  );
}

function SkillStatusIcon({ status, className }: { status: string; className?: string }) {
  if (status === 'demonstrated') return <CheckCircleIcon className={className || 'w-4 h-4 text-green-400'} />;
  if (status === 'implied') return <InfoIcon className={className || 'w-4 h-4 text-sky-400'} />;
  if (status === 'mentioned') return <AlertIcon className={className || 'w-4 h-4 text-yellow-400'} />;
  return <CloseIcon className={className || 'w-4 h-4 text-red-400'} />;
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    demonstrated: 'Demonstrated',
    implied: 'Implied / related',
    mentioned: 'Mentioned only',
    missing: 'No evidence',
  };
  return map[status] || status;
}

function SkillRow({ skill }: { skill: SkillEvidence }) {
  const label = statusLabel(skill.status);
  return (
    <div className="flex items-start gap-3 py-2">
      <div className={`shrink-0 mt-0.5 ${skill.status === 'demonstrated' ? 'text-green-400' : skill.status === 'implied' ? 'text-sky-400' : skill.status === 'mentioned' ? 'text-yellow-400' : 'text-red-400'}`}>
        <SkillStatusIcon status={skill.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-white">{skill.skill}</span>
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">{label}</span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{skill.evidence || 'No evidence found in resume.'}</p>
      </div>
    </div>
  );
}

function ReportSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-navy-900/40 border border-white/10 rounded-2xl p-4">
      <SectionHeader icon={icon}>{title}</SectionHeader>
      {children}
    </section>
  );
}

function FitBlock({ block }: { block?: FitBlock }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-gray-300 flex-1 min-w-0">{block?.summary || 'Not specified.'}</p>
      {block?.rating && (
        <span className={`shrink-0 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 ${ratingTone(block.rating)}`}>
          {ratingLabel(block.rating)}
        </span>
      )}
    </div>
  );
}

function ReportDetail({ applicationId }: { applicationId: number }) {
  const [detail, setDetail] = useState<ResumeReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getJson<ResumeReportDetail>(`/hr/resume-report/${applicationId}`)
      .then((d) => {
        if (cancelled) return;
        if (d && !(d as { error?: string }).error && d.report) {
          setDetail(d);
        } else {
          setError('Resume report not available.');
        }
        setLoading(false);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load resume report.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [applicationId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard /><SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
        <p className="text-red-300 text-sm">{error}</p>
      </div>
    );
  }

  const report = detail?.report;
  if (!report) {
    return (
      <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
        <p className="text-gray-400 text-sm">Resume report not available.</p>
      </div>
    );
  }

  const score = report.match_score ?? 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-5 ${scoreTone(score)}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider opacity-80">Overall Match</p>
            <p className="text-3xl font-extrabold mt-1">{score}%</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold">{report.recommendation || 'Review'}</p>
            <p className="text-xs opacity-80 mt-1">Based on full multi-dimension evaluation</p>
          </div>
        </div>
        {report.recommendation_reasons && report.recommendation_reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-white/10 pt-3">
            {report.recommendation_reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs opacity-90">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-current shrink-0" />
                <span className="leading-snug">{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReportSection title="Role Fit" icon={<TargetIcon />}>
        <FitBlock block={report.role_fit} />
      </ReportSection>

      <ReportSection title="Required Skills" icon={<ListIcon />}>
        {report.required_skills && report.required_skills.length ? (
          <div className="divide-y divide-white/5">
            {report.required_skills.map((s) => <SkillRow key={s.skill} skill={s} />)}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No required skills specified in the job posting.</p>
        )}
      </ReportSection>

      <ReportSection title="Preferred Skills" icon={<TargetIcon />}>
        {report.preferred_skills && report.preferred_skills.length ? (
          <div className="divide-y divide-white/5">
            {report.preferred_skills.map((s) => <SkillRow key={s.skill} skill={s} />)}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No preferred skills specified in the job posting.</p>
        )}
      </ReportSection>

      <ReportSection title="Experience Fit" icon={<BriefcaseIcon />}>
        <FitBlock block={report.experience_fit} />
      </ReportSection>
      <ReportSection title="Responsibilities Fit" icon={<CheckIcon />}>
        {report.responsibilities_fit && report.responsibilities_fit.length ? (
          <div className="divide-y divide-white/5">
            {report.responsibilities_fit.map((r, i) => (
              <div key={i} className="flex items-start gap-3 py-2">
                {r.present
                  ? <CheckCircleIcon className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  : <CloseIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-300">{r.responsibility}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.evidence || 'Not evidenced in resume.'}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No responsibilities specified in the job posting.</p>
        )}
      </ReportSection>

      <ReportSection title="Domain Fit" icon={<ChartIcon />}>
        <FitBlock block={report.domain_fit} />
      </ReportSection>

      <ReportSection title="Education Fit" icon={<TrophyIcon />}>
        <FitBlock block={report.education_fit} />
      </ReportSection>

      <ReportSection title="Strengths" icon={<CheckCircleIcon />}>
        {report.strengths && report.strengths.length ? (
          <ul className="space-y-2">
            {report.strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <CheckIcon className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No notable strengths identified.</p>
        )}
      </ReportSection>

      <ReportSection title="Gaps / Risks" icon={<BellIcon />}>
        {report.gaps && report.gaps.length ? (
          <ul className="space-y-2">
            {report.gaps.map((g, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <AlertIcon className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{g}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No significant gaps identified.</p>
        )}
        {report.ai_refined && (
          <p className="text-[10px] text-gray-500 mt-3">Insights refined with AI. Skill evidence comes from actual resume/job data.</p>
        )}
      </ReportSection>
    </div>
  );
}

function ReportCard({ report }: { report: ResumeReport }) {
  const [expanded, setExpanded] = useState(false);
  const initials = getInitials(report.full_name);
  const toggle = useCallback(() => setExpanded((e) => !e), []);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <button type="button" onClick={toggle} aria-expanded={expanded} className="w-full text-left flex items-center gap-4 p-5 hover:bg-white/[0.03] transition-colors">
        <div className="shrink-0 h-11 w-11 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center text-coral-400 font-bold text-sm">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{report.full_name}</p>
          <p className="text-xs text-gray-400 truncate">{report.email}</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-400">
            <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">{report.job_title}</span>
            <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1">{report.job_domain}</span>
            <StatusBadge status={report.status} type="resume" />
            {report.interview_status && <StatusBadge status={report.interview_status} type="interview" />}
          </div>
        </div>
        <div className={`shrink-0 text-gray-500 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}>
          {expanded ? <ChevronDownIcon className="w-5 h-5" /> : <ChevronRightIcon className="w-5 h-5" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.section
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-white/5">
              <ReportDetail applicationId={report.application_id} />
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HrResumeReports() {
  const navigate = useNavigate();

  const [session, setSession] = useState<HrSession | null>(null);
  const [reports, setReports] = useState<ResumeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState('All Domains');
  const [statusFilter, setStatusFilter] = useState('All');
  const [interviewFilter, setInterviewFilter] = useState('All');

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

  const fetchReports = () => {
    if (!session?.hr_id) return;
    setLoading(true);
    setError('');
    getJson<ResumeReport[]>(`/hr/resume-reports/${session.hr_id}`)
      .then((d) => {
        setReports(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load resume reports.');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (session?.hr_id) fetchReports();
  }, [session?.hr_id]);

  const handleRetry = () => { fetchReports(); };

  const domains = useMemo(() => {
    const set = new Set<string>();
    reports.forEach((r) => { if (r.job_domain) set.add(r.job_domain); });
    return ['All Domains', ...Array.from(set)];
  }, [reports]);

  const STATUS_OPTIONS = ['All', 'Pending', 'Approved', 'Rejected'];
  const INTERVIEW_STATUS_OPTIONS = ['All', 'Not Started', 'In Progress', 'Completed', 'Expired', 'Abandoned', 'Violated', 'Reissue Requested'];

  const filteredReports = useMemo(() => {
    let list = reports;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.job_title.toLowerCase().includes(q) ||
        (r.job_domain && r.job_domain.toLowerCase().includes(q))
      );
    }
    if (domainFilter !== 'All Domains') list = list.filter((r) => r.job_domain === domainFilter);
    if (statusFilter !== 'All') list = list.filter((r) => r.status.toLowerCase() === statusFilter.toLowerCase());
    if (interviewFilter === 'Reissue Requested') list = list.filter((r) => r.reissue_requested === 1);
    else if (interviewFilter !== 'All') list = list.filter((r) => r.interview_status?.toLowerCase() === interviewFilter.toLowerCase());
    return list;
  }, [reports, search, domainFilter, statusFilter, interviewFilter]);

  if (!session) return null;

  const selectCls = 'w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors';

  return (
    <HrLayout activePage="resume-reports">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-10">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">Resume Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Review candidate resumes and track screening results. Click a report to expand the full evaluation.</p>
          {!loading && <p className="text-xs text-gray-400 mt-1">{reports.length} Report{reports.length === 1 ? '' : 's'}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Search</label>
            <input type="text" placeholder="Name, email, job title" value={search} onChange={(e) => setSearch(e.target.value)} className={selectCls} />
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Job Domain</label>
            <select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)} className={selectCls}>
              {domains.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Resume Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
              {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Interview Status</label>
            <select value={interviewFilter} onChange={(e) => setInterviewFilter(e.target.value)} className={selectCls}>
              {INTERVIEW_STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        </div>

        {error && !loading && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={handleRetry} className="mt-3 text-sm font-semibold text-white bg-primary hover:bg-primary-hover px-4 py-2 rounded-xl transition-colors">Retry</button>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {!loading && !error && filteredReports.length === 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <p className="text-gray-500 text-sm">No resume reports match the selected filters.</p>
          </div>
        )}

        {!loading && filteredReports.length > 0 && (
          <div className="space-y-4">
            {filteredReports.map((r) => (
              <ReportCard key={r.application_id} report={r} />
            ))}
          </div>
        )}
      </div>
    </HrLayout>
  );
}