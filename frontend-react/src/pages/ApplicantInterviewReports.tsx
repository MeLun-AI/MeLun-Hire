import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import {
  fetchMyApplications,
  fetchApplicantInterviewReport,
  type ApplicantInterviewReportData,
} from '../services/applications';
import { requestErrorMessage } from '../services/api';

interface ApplicantSession {
  applicant_id: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function scoreColor(score: number): string {
  return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
}

function CircularScore({ value, size = 48 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-extrabold" style={{ color: scoreColor(value) }}>{value}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({ onDashboard, onBrowse }: { onDashboard: () => void; onBrowse: () => void }) {
  return (
    <motion.div variants={staggerItem} className="bg-white/5 border border-white/10 rounded-2xl p-10 md:p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="text-6xl mb-6">📄</div>
        <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">No Interview Reports Yet</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">
          Once you complete an AI interview, your performance report and feedback will appear here.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={onDashboard} className="inline-flex items-center gap-2 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-6 rounded-xl transition-all btn-lift">
            <span>←</span> Back to Dashboard
          </button>
          <button onClick={onBrowse} className="inline-flex items-center gap-2 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-3 px-6 rounded-xl transition-all">
            View Applications
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Report Card                                                        */
/* ------------------------------------------------------------------ */

function ReportCard({ report, onSelect }: { report: ApplicantInterviewReportData; onSelect: () => void }) {
  const resultColor =
    report.final_result === 'Recommended'
      ? 'bg-green-500/10 text-green-400 border-green-500/20'
      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -2 }}
      onClick={onSelect}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all cursor-pointer card-hover"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <span className="text-lg font-bold text-primary-light">{report.company[0] || 'J'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white truncate">{report.job_title}</h3>
          <p className="text-xs text-gray-400">{report.company}</p>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] text-gray-500">
            <span>📅 {formatDate(report.completed_at)}</span>
            <span>🎯 {report.questions_answered} questions</span>
            <span className={`px-2 py-0.5 rounded-full border font-medium ${resultColor}`}>{report.final_result}</span>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-center">
            <CircularScore value={report.overall_score} />
            <span className="text-[10px] text-gray-500 mt-1">Score</span>
          </div>
          <span className="text-primary-light text-xs font-medium">View Report →</span>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantInterviewReports() {
  const navigate = useNavigate();
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [reports, setReports] = useState<ApplicantInterviewReportData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'score' | 'company'>('newest');

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
      setApplicantId(s.applicant_id);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  const loadReports = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setError('');
    try {
      const apps = await fetchMyApplications(applicantId);
      const completed = apps.filter((a) => a.hasReport && a.applicationId != null);
      const details = await Promise.all(
        completed.map((a) => fetchApplicantInterviewReport(a.applicationId, applicantId).catch(() => null))
      );
      setReports(details.filter((d): d is ApplicantInterviewReportData => d !== null));
      setLoading(false);
    } catch (err) {
      setError(requestErrorMessage(err, 'Failed to load your interview reports.'));
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  /* Refresh on window focus / pageshow (no polling). */
  useEffect(() => {
    const onFocus = () => loadReports();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [loadReports]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = reports.filter(
      (r) => !query || r.job_title.toLowerCase().includes(query) || r.company.toLowerCase().includes(query)
    );
    if (sortBy === 'score') list = [...list].sort((a, b) => b.overall_score - a.overall_score);
    else if (sortBy === 'company') list = [...list].sort((a, b) => a.company.localeCompare(b.company));
    else list = [...list].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    return list;
  }, [reports, search, sortBy]);

  return (
    <ApplicantLayout activePage="interview-reports">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">Interview Reports</motion.h1>
              <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">
                Review your completed AI interview performances, strengths, and personalized feedback.
              </motion.p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Interview..."
                className="text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none w-36 md:w-44 transition-all"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="text-xs bg-white/[0.03] border border-white/10 rounded-xl px-2 py-2 text-gray-400 focus:border-primary/50 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="score">Highest Score</option>
                <option value="company">Company</option>
              </select>
            </div>
          </div>
        </motion.section>

        {error && !loading && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button
              onClick={loadReports}
              className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all"
            >
              Retry
            </button>
          </div>
        )}

        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
                  <div className="h-4 bg-white/10 rounded w-1/3" />
                  <div className="h-3 bg-white/10 rounded w-1/2 mt-2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState onDashboard={() => navigate('/applicant/dashboard')} onBrowse={() => navigate('/applicant/my-applications')} />
          ) : (
            filtered.map((r) => (
              <ReportCard
                key={r.application_id}
                report={r}
                onSelect={() => navigate(`/applicant/interview-reports/${r.application_id}`)}
              />
            ))
          )}
        </motion.section>
      </div>
    </ApplicantLayout>
  );
}