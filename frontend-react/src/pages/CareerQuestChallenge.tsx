import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { AppIcon } from '../components/applicant/ApplicantIcons';
import { requestErrorMessage } from '../services/api';
import { staggerContainer, staggerItem } from '../animations/config';
import {
  completeAttempt,
  getChallenge,
  revealMystery,
  startAttempt,
  submitAttempt,
  unlockMystery,
  type ChallengeDetail,
  type MysteryOpportunity,
  type SubmitResult,
  type TaskAnswerInput,
} from '../services/careerQuest';
import { ChallengeEngine, ResultsRenderer } from '../components/career-quest/ChallengeEngine';

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
}

type Phase = 'intro' | 'playing' | 'results';

export default function CareerQuestChallenge() {
  const navigate = useNavigate();
  const { challengeId = '' } = useParams();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('intro');
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [mysteryRevealed, setMysteryRevealed] = useState(false);
  const [mysteryOpportunity, setMysteryOpportunity] = useState<MysteryOpportunity | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!session || !challengeId) return;
    let cancelled = false;
    setLoading(true);
    getChallenge(challengeId, session.applicant_id)
      .then((data) => { if (!cancelled) setChallenge(data); })
      .catch((err) => { if (!cancelled) setError(requestErrorMessage(err, 'Could not load challenge.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, challengeId]);

  const handleStart = () => {
    if (!session || !challenge) return;
    startAttempt(session.applicant_id, challenge.id)
      .then((a) => { setAttemptId(a.id); setStartedAt(Date.now()); setPhase('playing'); })
      .catch((err) => setError(requestErrorMessage(err, 'Could not start challenge.')));
  };

  const handleSubmit = (answers: TaskAnswerInput[]) => {
    if (!session || attemptId === null) return;
    setSubmitting(true);
    const timeTaken = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    submitAttempt(attemptId, session.applicant_id, timeTaken, answers)
      .then((sub) => {
        setResult(sub.result);
        setPhase('results');
        // Mark complete (best effort).
        completeAttempt(attemptId, session.applicant_id).catch(() => {});
        // Mystery reveal: unlock + reveal the opportunity.
        if (sub.challenge_id === 'mystery') {
          unlockMystery(session.applicant_id, 'mystery')
            .then(() => revealMystery(session.applicant_id))
            .then((r) => { setMysteryRevealed(r.revealed); setMysteryOpportunity(r.opportunity); })
            .catch(() => {});
        }
      })
      .catch((err) => setError(requestErrorMessage(err, 'Could not submit answers.')))
      .finally(() => setSubmitting(false));
  };

  const handleRetry = () => {
    setResult(null);
    setAttemptId(null);
    setPhase('intro');
    // refresh completion state not needed here; reusing challenge object is fine.
  };

  if (!session) return null;

return (
    <ApplicantLayout activePage="career-quest-challenges">
      <div className="max-w-5xl mx-auto px-6 py-4 md:py-6 space-y-6">
        <button
          type="button"
          onClick={() => navigate('/applicant/career-quest/challenges')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-primary-light bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-2 transition-colors"
          aria-label="Back to challenge catalog"
        >
          <span aria-hidden="true">←</span> Back to Challenges
        </button>
        {error ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
            <AppIcon name="alert" className="w-8 h-8 mx-auto text-red-400" />
            <p className="text-sm text-red-300 mt-2">{error}</p>
            <button onClick={() => navigate('/applicant/career-quest')} className="mt-3 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all">Back to Career Quest</button>
          </div>
        ) : loading || !challenge ? (
          <div className="space-y-3">
            <div className="h-6 bg-white/5 rounded animate-pulse" />
            <div className="h-40 bg-white/5 rounded-2xl animate-pulse" />
          </div>
        ) : phase === 'intro' ? (
          <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary-light font-semibold mb-2">
              <AppIcon name="target" className="w-4 h-4" />
              Quick Challenge
            </div>
            <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">{challenge.title}</motion.h1>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] gap-4 items-start">
              <motion.div variants={staggerItem} className="space-y-4 min-w-0">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase">Time</p>
                    <p className="text-lg font-bold text-white">{Math.max(1, Math.round(challenge.estimated_time / 60))} min</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase">Skill</p>
                    <p className="text-sm font-bold text-primary-light">{challenge.skill}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase">Difficulty</p>
                    <p className="text-sm font-bold capitalize text-white">{challenge.difficulty}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 uppercase">Tasks</p>
                    <p className="text-lg font-bold text-white">{challenge.questions.length}</p>
                  </div>
                </div>

                <p className="text-gray-300 text-sm leading-relaxed">{challenge.description}</p>

                {challenge.completed_by_me && (
                  <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-sm flex items-center gap-2">
                    <AppIcon name="check" className="w-4 h-4" /> Completed — last score {challenge.my_last_score ?? '—'}/100. Retry to improve your signal.
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStart}
                  className="w-full bg-primary hover:bg-primary-hover text-white text-base font-bold py-3 rounded-xl transition-all btn-lift"
                >
                  Start Challenge
                </motion.button>
              </motion.div>

              <motion.div variants={staggerItem} className="space-y-4 min-w-0">
                {challenge.skills_tested && challenge.skills_tested.length > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-2">What this tests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {challenge.skills_tested.map((s) => (
                        <span key={s} className="text-[11px] px-2.5 py-1 rounded-full bg-primary/10 text-primary-light border border-primary/25 font-semibold">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {challenge.instructions && challenge.instructions.length > 0 && (
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <AppIcon name="list" className="w-3.5 h-3.5" /> How to play
                    </p>
                    <div className="arena-scroll-list space-y-1.5 mt-2 pr-1" style={{ maxHeight: 220 }}>
                      <ol className="space-y-1.5">
                        {challenge.instructions.map((step, i) => (
                          <li key={i} className="text-sm text-gray-200 flex gap-2.5">
                            <span className="w-5 h-5 rounded-full bg-primary/15 text-primary-light text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                )}

                {challenge.explanation && (
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                      <AppIcon name="lightbulb" className="w-3.5 h-3.5" /> Why MeLun Hire is asking this
                    </p>
                    <p className="text-sm text-gray-200 mt-1">{challenge.explanation}</p>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.section>
        ) : phase === 'playing' ? (
          <div>
            {submitting ? (
              <div className="p-10 text-center">
                <div className="w-10 h-10 border-4 border-white/20 border-t-primary rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-400 mt-4">Scoring your answers…</p>
              </div>
            ) : (
              <ChallengeEngine
                title={challenge.title}
                category={challenge.category}
                questions={challenge.questions}
                onCancel={() => setPhase('intro')}
                onSubmit={handleSubmit}
              />
            )}
          </div>
        ) : result ? (
<div className="space-y-6">
            <ResultsRenderer
              result={result}
              skill={challenge.skill}
              challengeTitle={challenge.title}
              onRetry={handleRetry}
              onBack={() => navigate('/applicant/career-quest')}
            />

            {challenge.domain === 'mystery' && mysteryRevealed && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-purple-500/10 via-navy-800/40 to-navy-900 border border-white/10 rounded-2xl p-6">
                <p className="text-[11px] uppercase tracking-wider text-green-400 font-semibold flex items-center gap-1.5"><AppIcon name="check" className="w-3.5 h-3.5" /> Opportunity Unlocked</p>
                {mysteryOpportunity ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mt-3">
                    <div className="flex-1">
                      <p className="text-lg font-bold text-white">{mysteryOpportunity.title}</p>
                      <p className="text-xs text-gray-400">{mysteryOpportunity.company} · {mysteryOpportunity.location}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {mysteryOpportunity.matched_skills.length
                          ? `MeLun Hire matched you because you align on ${mysteryOpportunity.matched_skills.slice(0, 3).join(', ')}.`
                          : 'MeLun Hire found strong underlying compatibility evidence.'}
                      </p>
                    </div>
                    <div className="text-center shrink-0">
                      <span className={`text-2xl font-extrabold ${mysteryOpportunity.match >= 80 ? 'text-green-400' : mysteryOpportunity.match >= 60 ? 'text-blue-400' : 'text-yellow-400'}`}>{mysteryOpportunity.match}%</span>
                      <p className="text-[10px] text-gray-500">match</p>
                    </div>
                    <button onClick={() => navigate('/applicant/available-jobs', { state: { openJobId: mysteryOpportunity.job_id } })} className="shrink-0 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift">Apply</button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 mt-3">You've unlocked a hidden opportunity. Open the Career Map to discover your recommended roles.</p>
                )}
              </motion.div>
            )}

            <div className="flex flex-wrap gap-3">
              <button onClick={() => navigate('/applicant/career-quest/challenges')} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 px-5 rounded-xl transition-all">All Challenges</button>
              <button onClick={() => navigate('/applicant/career-quest/history')} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 px-5 rounded-xl transition-all">View History</button>
            </div>
          </div>
        ) : null}
      </div>
    </ApplicantLayout>
  );
}