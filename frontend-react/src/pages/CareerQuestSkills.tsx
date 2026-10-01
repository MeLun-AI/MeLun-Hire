import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { AppIcon } from '../components/applicant/ApplicantIcons';
import { staggerContainer, staggerItem } from '../animations/config';
import { fetchSkillSignals, listChallenges, type ChallengeMeta, type SkillSignalsPayload } from '../services/careerQuest';
import { requestErrorMessage } from '../services/api';
import { ChallengeCard } from '../components/career-quest/ChallengeCard';

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
}

function signalTone(value: number): string {
  if (value >= 80) return 'text-green-400';
  if (value >= 60) return 'text-blue-400';
  return 'text-yellow-400';
}

export default function CareerQuestSkills() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  const [payload, setPayload] = useState<SkillSignalsPayload | null>(null);
  const [challenges, setChallenges] = useState<ChallengeMeta[]>([]);
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
    Promise.all([fetchSkillSignals(session.applicant_id), listChallenges()])
      .then(([sig, chs]) => { if (!cancelled) { setPayload(sig); setChallenges(chs); } })
      .catch((err) => { if (!cancelled) setError(requestErrorMessage(err, 'Could not load skills.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) return null;

  const signals = payload?.signals ?? [];
  const skillSummary = payload?.skills ?? [];
return (
    <ApplicantLayout activePage="career-quest-skills">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AppIcon name="sparkles" className="w-4 h-4 text-primary-light" />
            <h1 className="text-xl font-extrabold text-white">Skill Signals</h1>
          </div>
          <p className="text-sm text-gray-400">Skill → Current Signal → Challenge → Improved Signal. Transparent, evidence-based skills from your challenges.</p>
        </motion.section>

        {error ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <AppIcon name="alert" className="w-8 h-8 mx-auto text-red-400" />
            <p className="text-sm text-red-300 mt-2">{error}</p>
          </motion.div>
        ) : loading ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}
          </motion.div>
        ) : (
          <>
            {/* Signals summary */}
            <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Your Skill Signals</p>
              {signals.length === 0 ? (
                <div className="text-center py-8">
                  <AppIcon name="sparkles" className="w-10 h-10 mx-auto text-gray-500 mb-2" />
                  <p className="text-gray-400 text-sm">No skill signals yet.</p>
                  <p className="text-gray-500 text-xs mt-1">Complete a challenge to build your first skill signal.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {signals.map((s) => (
                    <div key={`${s.skill}-${s.signal_type}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{s.skill}<span className="text-[10px] text-gray-600 ml-2">via {s.signal_type}</span></span>
                        <span className={`text-sm font-bold ${signalTone(s.signal_value)}`}>{s.signal_value}</span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <motion.div className="h-full rounded-full" style={{ backgroundColor: s.signal_value >= 80 ? '#22c55e' : s.signal_value >= 60 ? '#3b82f6' : '#facc15' }} initial={{ width: 0 }} animate={{ width: `${s.signal_value}%` }} transition={{ duration: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.section>

            {/* Skill challenge cards */}
            <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="p-4">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Challenge a Skill</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {challenges.filter((c) => c.domain !== 'mystery').map((c) => (
                  <motion.div key={c.id} variants={staggerItem}>
                    <ChallengeCard challenge={c} onOpen={() => navigate(`/applicant/career-quest/challenges/${c.id}`)} />
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Aggregate per-skill view */}
            {skillSummary.length > 0 && (
              <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-4">Merged signals by skill</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {skillSummary.map((s) => (
                    <div key={s.skill} className="bg-white/5 border border-white/10 rounded-xl p-4">
                      <p className="text-sm font-bold text-white">{s.skill}</p>
                      <p className={`text-2xl font-extrabold ${signalTone(s.value)}`}>{s.value}</p>
                      <p className="text-[11px] text-gray-500 mt-1">{s.sources.length} challenge signal(s)</p>
                    </div>
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}
      </div>
    </ApplicantLayout>
  );
}