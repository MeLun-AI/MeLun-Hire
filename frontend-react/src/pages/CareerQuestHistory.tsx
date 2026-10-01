import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { AppIcon } from '../components/applicant/ApplicantIcons';
import { staggerContainer } from '../animations/config';
import { attemptHistory, type Attempt } from '../services/careerQuest';
import { requestErrorMessage } from '../services/api';

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function scoreChip(score: number | null): string {
  if (score === null) return 'bg-gray-500/10 text-gray-400 border border-gray-500/30';
  if (score >= 80) return 'bg-green-500/10 text-green-400 border border-green-500/30';
  if (score >= 60) return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30';
}

export default function CareerQuestHistory() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
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
      setSession(s);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    attemptHistory(session.applicant_id)
      .then((data) => { if (!cancelled) setAttempts(data); })
      .catch((err) => { if (!cancelled) setError(requestErrorMessage(err, 'Could not load history.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) return null;

  const retry = () => setLoading(true);
return (
    <ApplicantLayout activePage="career-quest-history">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AppIcon name="document" className="w-4 h-4 text-primary-light" />
            <h1 className="text-xl font-extrabold text-white">Challenge History</h1>
          </div>
          <p className="text-sm text-gray-400">Completed challenges, scores, skills tested, dates — and how your signal improves over time.</p>
        </motion.section>

        {error ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <AppIcon name="alert" className="w-8 h-8 mx-auto text-red-400" />
            <p className="text-sm text-red-300 mt-2">{error}</p>
            <button onClick={retry} className="mt-3 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all">Retry</button>
          </motion.div>
        ) : loading ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />)}
          </motion.div>
        ) : attempts.length === 0 ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <AppIcon name="target" className="w-12 h-12 mx-auto text-gray-500" />
            <p className="text-gray-400 text-base mt-3 font-semibold">No challenges completed yet.</p>
            <p className="text-gray-500 text-sm mt-1">Complete a challenge to see your results and skill signals here.</p>
            <button onClick={() => navigate('/applicant/career-quest')} className="mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift">Back to Career Quest</button>
          </motion.div>
        ) : (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-white/5 border border-white/10 rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-5 py-2.5 font-medium">Challenge</th>
                  <th className="text-left px-5 py-2.5 font-medium">Skill</th>
                  <th className="text-left px-5 py-2.5 font-medium">Date</th>
                  <th className="text-right px-5 py-2.5 font-medium">Score</th>
                  <th className="text-right px-5 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition-colors table-row-hover">
                    <td className="px-5 py-3 text-white font-medium">{a.title ?? a.challenge_id}</td>
                    <td className="px-5 py-3 text-gray-400">{a.skill ?? a.category}</td>
                    <td className="px-5 py-3 text-gray-400">{formatDate(a.completed_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${scoreChip(a.score)}`}>{a.score ?? '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">Completed</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {attempts.length >= 2 && (
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500">
                  Improvement over time: compare your latest scores with earlier attempts on the same challenge to see signal growth.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </ApplicantLayout>
  );
}