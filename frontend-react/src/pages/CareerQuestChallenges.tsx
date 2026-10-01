import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { AppIcon } from '../components/applicant/ApplicantIcons';
import { staggerContainer, staggerItem } from '../animations/config';
import { listChallenges, type ChallengeMeta } from '../services/careerQuest';
import { requestErrorMessage } from '../services/api';
import { ChallengeCard } from '../components/career-quest/ChallengeCard';

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
}

export default function CareerQuestChallenges() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  const [challenges, setChallenges] = useState<ChallengeMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

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
    listChallenges()
      .then((data) => { if (!cancelled) setChallenges(data); })
      .catch((err) => { if (!cancelled) setError(requestErrorMessage(err, 'Could not load challenges.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session]);

  if (!session) return null;

  const domains = Array.from(new Set(challenges.map((c) => c.domain))).filter((d) => d !== 'mystery');
  const view = filter === 'all' ? challenges : challenges.filter((c) => c.domain === filter);
  const nonMystery = view.filter((c) => c.domain !== 'mystery');
return (
    <ApplicantLayout activePage="career-quest-challenges">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AppIcon name="target" className="w-4 h-4 text-primary-light" />
            <h1 className="text-xl font-extrabold text-white">Challenges</h1>
          </div>
          <p className="text-sm text-gray-400">Short, role-specific challenges that demonstrate real skills and feed your MeLun profile. Pick one and play.</p>
        </motion.section>

        {error ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <AppIcon name="alert" className="w-8 h-8 mx-auto text-red-400" />
            <p className="text-sm text-red-300 mt-2">{error}</p>
          </motion.div>
        ) : loading ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => <motion.div key={i} variants={staggerItem} className="h-40 bg-white/5 rounded-2xl animate-pulse" />)}
          </motion.div>
        ) : challenges.length === 0 ? (
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <AppIcon name="target" className="w-12 h-12 mx-auto text-gray-500" />
            <p className="text-gray-400 text-base mt-3">No challenges available yet.</p>
          </motion.div>
        ) : (
          <>
            {/* Domain filter */}
            <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex flex-wrap gap-2">
              <button onClick={() => setFilter('all')} className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${filter === 'all' ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-400 border-white/10'}`}>All</button>
              {domains.map((d) => (
                <button key={d} onClick={() => setFilter(d)} className={`text-xs px-3 py-1.5 rounded-full border font-semibold capitalize ${filter === d ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-400 border-white/10'}`}>{d}</button>
              ))}
            </motion.div>

            <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nonMystery.map((c) => (
                <motion.div key={c.id} variants={staggerItem}>
                  <ChallengeCard challenge={c} onOpen={() => navigate(`/applicant/career-quest/challenges/${c.id}`)} />
                </motion.div>
              ))}
            </motion.section>
          </>
        )}
      </div>
    </ApplicantLayout>
  );
}