/* ------------------------------------------------------------------ */
/*  HR Talent Arena — the interactive hub of hiring experiences.       */
/*                                                                     */
/*  Every card opens a real, backend-driven experience (no visual-only */
/*  placeholders). Counts are computed from live data.                 */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HrLayout from '../components/hr/HrLayout';
import { useHrSession, ArenaError, ArenaSkeleton } from './hr-talent/shared';
import { fetchTalentCandidates, fetchHiringQuest } from '../services/talentArena';
import type { CandidatesPayload, HiringQuestJob } from '../services/talentArena';

interface ArenaCard {
  key: string;
  title: string;
  description: string;
  route: string;
  stat: string;
  statLabel: string;
  enabled: boolean;
}


export default function HrTalentArena() {
  const session = useHrSession();
  const [candidates, setCandidates] = useState<CandidatesPayload | null>(null);
  const [quest, setQuest] = useState<HiringQuestJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    Promise.all([
      fetchTalentCandidates(session.hrId),
      fetchHiringQuest(session.hrId).catch(() => ({ jobs: [] as HiringQuestJob[], stages: [] })),
    ])
      .then(([c, q]) => {
        setCandidates(c);
        setQuest(q.jobs);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the Talent Arena.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  if (!session) return null;

  const candidateCount = candidates?.candidates.length ?? 0;
  const assessedCount = candidates?.candidates.filter((c) => c.assessment.completed > 0).length ?? 0;
  const challengeCount = quest.reduce((n, j) => n + j.stats.challenged, 0);
  const actionCount = quest.reduce((n, j) => n + j.next_best_actions.length, 0);

  const cards: ArenaCard[] = [
    {
      key: 'detective',
      title: 'Talent Detective',
      description: 'Investigate a candidate through progressive evidence — skills, projects, assessments and AI insights — before judging.',
      route: '/hr/talent-arena/detective',
      stat: String(candidateCount),
      statLabel: 'candidates to investigate',
      enabled: candidateCount > 0,
    },
    {
      key: 'blind',
      title: 'Blind Evaluation',
      description: 'Evaluate purely on evidence first. Identity stays hidden until your evaluation is locked in — less bias, more signal.',
      route: '/hr/talent-arena/blind-evaluation',
      stat: String(assessedCount),
      statLabel: 'with assessment evidence',
      enabled: candidateCount > 0,
    },
    {
      key: 'faceoff',
      title: 'Candidate Face-Off',
      description: 'Compare 2–3 candidates side by side across evidence dimensions and get an explainable trade-off read-out.',
      route: '/hr/talent-arena/face-off',
      stat: String(candidateCount),
      statLabel: 'candidates in the pool',
      enabled: candidateCount >= 2,
    },
    {
      key: 'team',
      title: 'Build Your Team',
      description: 'Assign candidates to role slots and see live skill coverage, balance and gaps — with candidates who can fill them.',
      route: '/hr/talent-arena/build-team',
      stat: '—',
      statLabel: 'saved team configurations',
      enabled: candidateCount > 0,
    },
    {
      key: 'radar',
      title: 'AI Talent Radar',
      description: 'Evidence-ranked recommendations for each role — including candidates keyword filters would have overlooked.',
      route: '/hr/talent-arena/radar',
      stat: String(candidateCount),
      statLabel: 'profiles scanned',
      enabled: candidateCount > 0,
    },
    {
      key: 'challenges',
      title: 'Candidate Challenges',
      description: 'Send real Career Quest challenges to candidates and see the results compared against the role bar.',
      route: '/hr/talent-arena/challenges',
      stat: String(challengeCount),
      statLabel: 'challenges in flight',
      enabled: candidateCount > 0,
    },
    {
      key: 'vote',
      title: 'Team Vote',
      description: 'Collect independent evaluations from the team and get consensus, agreement and mixed-opinion analysis.',
      route: '/hr/talent-arena/team-vote',
      stat: '—',
      statLabel: 'consensus tracking',
      enabled: candidateCount > 0,
    },
    {
      key: 'quest',
      title: 'Hiring Quest',
      description: 'A guided, data-driven workflow per job: Discover → Evaluate → Challenge → Interview → Decide → Hire.',
      route: '/hr/talent-arena/hiring-quest',
      stat: String(actionCount),
      statLabel: 'next best actions',
      enabled: quest.length > 0,
    },
  ];

  return (
    <HrLayout activePage="talent-arena">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-6">
        {/* Header */}
        <header>
          <p className="text-[11px] uppercase tracking-widest text-primary-light font-semibold">Talent Arena</p>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1">
            Discover → Investigate → Evaluate → Decide
          </h1>
          <p className="text-sm md:text-base text-gray-400 mt-2">
            An evidence-first hiring workspace. Every score traces back to real resumes, real interviews and the
            candidate's own Career Quest signals.
          </p>
        </header>

        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton count={6} />
        ) : !candidates || candidates.jobs.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <p className="text-gray-300 font-semibold">No active jobs with applicants yet.</p>
            <p className="text-gray-500 text-sm mt-1">Post a job and let candidates apply — the arena activates automatically.</p>
            <Link to="/hr/job-posts" className="inline-block mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
              Go to Job Posts
            </Link>
          </div>
        ) : (
          <>
            {/* Live overview strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Open jobs', value: candidates.jobs.filter((j) => j.status !== 'Closed').length },
                { label: 'Candidates', value: candidateCount },
                { label: 'With MeLun evidence', value: assessedCount },
                { label: 'Open jobs in quest', value: quest.filter((j) => j.stage !== 'hire').length },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-2xl font-extrabold text-white tabular-nums">{s.value}</p>
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Experience cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cards.map((card) => (
                <Link
                  key={card.key}
                  to={card.route}
                  className={`group bg-white/5 border border-white/10 rounded-2xl p-5 transition-all hover:bg-white/[0.07] hover:border-primary/40 ${
                    card.enabled ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-bold text-white group-hover:text-primary-light transition-colors">{card.title}</h2>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-extrabold text-primary-light tabular-nums">{card.stat}</p>
                      <p className="text-[10px] text-gray-500">{card.statLabel}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-gray-400 mt-2 leading-relaxed">{card.description}</p>
                  <p className="text-[11px] font-semibold text-primary-light mt-3 opacity-70 group-hover:opacity-100 transition-opacity">
                    {card.enabled ? 'Open experience →' : 'Needs candidates to activate'}
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </HrLayout>
  );
}
