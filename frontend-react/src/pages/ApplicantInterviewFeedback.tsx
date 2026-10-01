import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import {
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

function scoreColor(score: number): string {
  return score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Not available';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function CircularScore({ value, size = 120 }: { value: number; size?: number }) {
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

function ListCard({ title, icon, items, emptyLabel }: { title: string; icon: string; items: string[]; emptyLabel: string }) {
  return (
    <GlassCard title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item} className="flex items-center gap-2.5">
              <span className="text-primary-light text-xs shrink-0">{icon}</span>
              <span className="text-sm text-gray-300">{item}</span>
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

export default function ApplicantInterviewFeedback() {
  const navigate = useNavigate();
  const { applicationId } = useParams<{ applicationId: string }>();
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [report, setReport] = useState<ApplicantInterviewReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    if (!applicantId || !applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchApplicantInterviewReport(Number(applicationId), applicantId)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(requestErrorMessage(err, 'Failed to load your interview report.'));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [applicationId, applicantId]);

  const rounds = report ? Object.values(report.rounds || {}) : [];

  return (
    <ApplicantLayout activePage="interview-reports">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <button
            onClick={() => navigate('/applicant/interview-reports')}
            className="text-xs text-gray-400 hover:text-white transition-colors inline-flex items-center gap-1"
          >
            ← Back to Reports
          </button>
          <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white mt-3">Interview Feedback</motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">
            How did you perform? Review your strengths, improvement areas, and AI feedback.
          </motion.p>
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
            <div className="text-6xl mb-5">📄</div>
            <h2 className="text-xl font-extrabold text-white mb-2">Report Not Available</h2>
            <p className="text-sm text-gray-400">This interview report is not available. It appears only after the interview has been completed.</p>
          </motion.div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
            {/* Overall performance */}
            <motion.div variants={staggerItem} className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="flex flex-col items-center shrink-0">
                  <CircularScore value={report.overall_score} />
                  <span className="text-xs text-gray-500 mt-2">Overall Performance</span>
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-extrabold text-white">{report.job_title}</h2>
                  <p className="text-sm text-gray-400 mt-1">{report.company} · {report.job_domain || 'General'}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-4">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                      report.final_result === 'Recommended'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}>
                      {report.final_result}
                    </span>
                    <span className="text-[11px] text-gray-500">📅 Completed {formatDate(report.completed_at)}</span>
                    <span className="text-[11px] text-gray-500">🎯 {report.questions_answered} questions answered</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Round performance */}
            <GlassCard title="Round Performance">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {rounds.length === 0 ? (
                  <p className="text-sm text-gray-500 col-span-full">Round performance is not available.</p>
                ) : rounds.map((round) => (
                  <div key={round.label} className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{round.label}</p>
                    <p className="text-2xl font-extrabold mt-1" style={{ color: scoreColor(round.average_percent) }}>
                      {round.average_percent}%
                    </p>
                    <p className="text-[10px] text-gray-600">{round.question_count} question{round.question_count === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* Skill observations */}
            <GlassCard title="Skill Observations">
              {report.skills.length === 0 ? (
                <p className="text-sm text-gray-500">Skill observations are not available.</p>
              ) : (
                <div className="space-y-3">
                  {report.skills.map((skill) => (
                    <div key={skill.name} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-28 shrink-0">{skill.name}</span>
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light"
                          initial={{ width: 0 }}
                          animate={{ width: `${skill.score}%` }}
                          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                        />
                      </div>
                      <span className="text-xs font-bold text-white w-10 text-right">{skill.score}%</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ListCard title="Strengths" icon="✓" items={report.strengths} emptyLabel="Strengths will appear here once available." />
              <ListCard title="Areas to Improve" icon="○" items={report.improvements} emptyLabel="Improvement areas will appear here once available." />
            </div>

            {/* AI feedback per question */}
            <GlassCard title="AI Feedback">
              {report.feedback.length === 0 ? (
                <p className="text-sm text-gray-500">Detailed AI feedback is not available for this interview.</p>
              ) : (
                <div className="space-y-3">
                  {report.feedback.map((item, i) => (
                    <div key={i} className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                      <p className="text-xs text-gray-500 uppercase tracking-wider">{item.round}</p>
                      {item.question && <p className="text-sm text-white mt-1">{item.question}</p>}
                      {item.summary ? (
                        <p className="text-sm text-gray-400 mt-1">{item.summary}</p>
                      ) : item.answer ? (
                        <p className="text-xs text-gray-500 mt-1">Your answer: {item.answer}</p>
                      ) : (
                        <p className="text-xs text-gray-600 mt-1">Feedback not available for this question.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>
    </ApplicantLayout>
  );
}