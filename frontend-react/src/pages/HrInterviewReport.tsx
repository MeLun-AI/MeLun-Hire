import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import HrLayout from '../components/hr/HrLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import { fetchHrInterviewReport, type HrInterviewReportData, type HrRoundDetail } from '../services/applications';
import { InterviewAnswersToggle, InterviewBriefInsights } from '../components/hr/InterviewReportInsights';

interface HrSession {
  hr_id: number;
  hr_name: string;
  company_name: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function scoreColor(score: number): string {
  return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Not available';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

function CircularScore({ value, size = 110 }: { value: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={scoreColor(value)} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold" style={{ color: scoreColor(value) }}>{value}%</span>
      </div>
    </div>
  );
}

function GlassCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={`bg-white/5 border border-white/10 rounded-2xl p-5 ${className}`}>
      {title && <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>}
      {children}
    </motion.div>
  );
}

function NotAvailable({ label }: { label: string }) {
  return (
    <div className="bg-white/5 border border-dashed border-white/10 rounded-2xl p-5 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-[11px] text-gray-600 mt-1">Not available for this interview</p>
    </div>
  );
}

function RoundBreakdown({ rounds }: { rounds: Record<string, HrRoundDetail> }) {
  const entries = Object.values(rounds || {});
  return (
    <GlassCard title="Round Breakdown">
      {entries.length === 0 ? (
        <p className="text-sm text-gray-500">Round scores are not available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {entries.map((round) => (
            <div key={round.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{round.label}</p>
              <p className="text-2xl font-extrabold mt-1" style={{ color: scoreColor(round.average_percent) }}>{round.average_percent}%</p>
              <p className="text-[10px] text-gray-600">Avg {round.average_out_of_10}/10 · {round.question_count} questions</p>
              <p className="text-[10px] text-gray-600">Weight {round.weight_percent}%</p>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function HrInterviewReport() {
  const navigate = useNavigate();
  const { applicationId } = useParams<{ applicationId: string }>();
  const [session, setSession] = useState<HrSession | null>(null);
  const [report, setReport] = useState<HrInterviewReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!session?.hr_id || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchHrInterviewReport(Number(applicationId), session.hr_id)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load the interview report.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applicationId, session?.hr_id]);

  if (!session) return null;

  return (
    <HrLayout activePage="interview-results">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <button
            onClick={() => navigate('/hr/interview-results')}
            className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            ← Back to Interview Results
          </button>
          <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white mt-3">Interview Report</motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">Complete AI evaluation report for the candidate.</motion.p>
        </motion.section>

        {error && !loading && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button
              onClick={() => window.location.reload()}
              className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="h-40 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            <div className="h-32 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
            <div className="h-32 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
          </div>
        ) : !report ? (
          <motion.div variants={staggerItem} className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center">
            <div className="text-6xl mb-5">📋</div>
            <h2 className="text-xl font-extrabold text-white mb-2">Report Not Found</h2>
            <p className="text-sm text-gray-400">This interview report is not available, or you do not have access to it.</p>
          </motion.div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
            {/* Hero */}
            <motion.div variants={staggerItem} className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="flex-1">
                  <h2 className="text-xl md:text-2xl font-extrabold text-white">{report.candidate_name || 'Candidate'}</h2>
                  <p className="text-sm text-gray-400">{report.candidate_email}</p>
                  <div className="flex flex-wrap gap-3 mt-3 text-[11px] text-gray-500">
                    <span>💼 {report.job_title}</span>
                    <span>🧭 {report.job_domain}</span>
                    <span>🏁 Completed {formatDate(report.completed_at)}</span>
                    {report.interview_started_at && <span>▶️ Started {formatDate(report.interview_started_at)}</span>}
                    {report.interview_completed_at && <span>✅ Finished {formatDate(report.interview_completed_at)}</span>}
                    <span>❓ {report.total_questions} questions</span>
                  </div>
                  <div className="mt-4">
                    <span className="text-xs px-2.5 py-1 rounded-full border font-medium bg-primary/10 text-primary-light border-primary/30">
                      {report.verdict}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center shrink-0">
                  <CircularScore value={report.overall_score} />
                  <span className="text-xs text-gray-500 mt-2">Overall Score</span>
                </div>
              </div>
            </motion.div>

            <RoundBreakdown rounds={report.rounds} />

            {/* Brief insights stay visible; the full Q&A below is collapsed by default. */}
            <InterviewBriefInsights report={report} />

            <InterviewAnswersToggle report={report} />

            <GlassCard title="Evaluation Details">
              <p className="text-sm text-gray-400">{report.scoring_scale || 'Not available'}</p>
              <p className="text-sm text-gray-300 mt-3">
                <span className="text-gray-500">Primary improvement area:</span> {report.primary_improvement_area || 'Not available'}
              </p>
            </GlassCard>

            {/* Backend does not persist proctoring/termination data — show Not available. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <NotAvailable label="Proctoring Summary" />
              <NotAvailable label="Violation / Integrity Details" />
            </div>
          </motion.div>
        )}
      </div>
    </HrLayout>
  );
}

