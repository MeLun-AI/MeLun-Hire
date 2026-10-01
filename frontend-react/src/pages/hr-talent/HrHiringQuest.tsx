/* Hiring Quest - a guided, data-driven hiring workflow per job.
   Stages: define-role → discover → evaluate → challenge → interview → decide → hire.
   Progress is persisted via the backend hiring-quest endpoint. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HrLayout from '../../components/hr/HrLayout';
import { QuestIcon, SendIcon } from '../../components/hr/HrIcons';
import { useHrSession, TalentArenaPage, ArenaError, ArenaSkeleton } from './shared';
import { fetchHiringQuest, saveQuestStage } from '../../services/talentArena';
import type { HiringQuestJob } from '../../services/talentArena';

const ALL_STAGES = ['define-role', 'discover', 'evaluate', 'challenge', 'interview', 'decide', 'hire'];

function stageLabel(s: string): string {
  return s === 'define-role' ? 'Define Role' : s === 'discover' ? 'Discover' : s === 'evaluate' ? 'Evaluate'
    : s === 'challenge' ? 'Challenge' : s === 'interview' ? 'Interview' : s === 'decide' ? 'Decide' : 'Hire';
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-extrabold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

export default function HrHiringQuest() {
  const session = useHrSession();
  const [jobs, setJobs] = useState<HiringQuestJob[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    fetchHiringQuest(session.hrId)
      .then((r) => {
        setJobs(r.jobs);
        setSelectedJobId((prev) => prev ?? r.jobs[0]?.job_id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the hiring quest.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  if (!session) return null;

  const selected = jobs.find((j) => j.job_id === selectedJobId) ?? jobs[0];

  const advance = async (next: string) => {
    if (!session || !selected) return;
    setSaving(true);
    setMsg('');
    try {
      await saveQuestStage({ hr_id: session.hrId, job_id: selected.job_id, stage: next });
      setMsg(`Moved to ${stageLabel(next)}. Progress persisted.`);
      const r = await fetchHiringQuest(session.hrId);
      setJobs(r.jobs);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not update the stage.');
    } finally {
      setSaving(false);
    }
  };
return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Hiring Quest"
        subtitle="A guided, data-driven workflow per job. Each stage reads live candidate/job state and progress is persisted."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton count={3} />
        ) : jobs.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <QuestIcon className="w-10 h-10 mx-auto text-primary-light" />
            <p className="text-gray-300 font-semibold mt-3">No active jobs in a quest yet.</p>
            <Link to="/hr/job-posts" className="inline-block mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">Go to Job Posts</Link>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Select a job">
              {jobs.map((j) => (
                <button key={j.job_id} onClick={() => { setSelectedJobId(j.job_id); setMsg(''); }}
                  className={`px-3 py-1.5 rounded-full border text-[12px] ${j.job_id === selected?.job_id ? 'bg-primary/15 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'}`}>
                  {j.job_title}
                </button>
              ))}
            </div>

            {selected && (
              <>
                <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Quest stages">
                  {ALL_STAGES.map((s, i) => {
                    const current = s === selected.stage;
                    const passed = ALL_STAGES.indexOf(s) < ALL_STAGES.indexOf(selected.stage);
                    return (
                      <span key={s} className="flex items-center gap-1">
                        {i > 0 && <span className="text-gray-600">→</span>}
                        <button onClick={() => advance(s)} disabled={saving}
                          className={`px-2.5 py-1 rounded-full border text-[11px] transition-colors ${current ? 'bg-primary/25 text-primary-light border-primary/50' : passed ? 'text-green-300 border-green-500/30 bg-green-500/10' : 'text-gray-500 border-white/10 bg-white/5'}`}>
                          {stageLabel(s)}
                        </button>
                      </span>
                    );
                  })}
                </div>

                <p className="text-sm text-gray-400 mt-2">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider">Current stage: </span>
                  <span className="text-primary-light font-bold">{stageLabel(selected.stage)}</span>
                  <span className="text-gray-500"> · updated {selected.stage_updated_at?.slice(0, 16) ?? '—'}</span>
                </p>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 self-start">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Job state</p>
                    <h2 className="text-lg font-bold text-white mt-1">{selected.job_title}</h2>
                    <p className="text-[13px] text-gray-400 mt-2">Required skills: {selected.required_skills.join(', ') || 'None defined'}</p>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Metric label="Candidates" value={String(selected.candidate_count)} />
                      <Metric label="Evaluated" value={String(selected.stats.evaluated)} />
                      <Metric label="Assessed" value={String(selected.stats.assessed)} />
                      <Metric label="Challenged" value={String(selected.stats.challenged)} />
                    </div>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5 self-start">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Next best actions</p>
                    <div className="arena-scroll-list space-y-0 mt-1 pr-1" style={{ maxHeight: 320 }}>
                      {selected.next_best_actions.length === 0 ? (
                        <p className="text-sm text-gray-500">No pending actions. This job's pipeline is healthy.</p>
                      ) : (
                        selected.next_best_actions.map((a) => (
                          <div key={`${a.type}-${a.skill ?? a.message.slice(0, 12)}`} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-2">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-white flex-1">{a.message}</span>
                              <span className="text-[10px] text-gray-500 uppercase">{a.action}</span>
                            </div>
                            {a.action === 'Send Assessment' ? (
                              <Link to="/hr/talent-arena/challenges" className="mt-1 inline-flex items-center gap-1 text-[11px] bg-primary hover:bg-primary-hover text-white font-semibold py-1.5 px-3 rounded-lg transition-colors">
                                <SendIcon className="w-3.5 h-3.5" /> Send Assessment
                              </Link>
                            ) : a.action === 'Decide' ? (
                              <Link to="/hr/talent-arena/face-off" className="mt-1 inline-block text-[11px] bg-white/10 hover:bg-white/15 text-gray-300 font-semibold py-1.5 px-3 rounded-lg transition-colors">Compare →</Link>
                            ) : a.action === 'Evaluate Candidates' ? (
                              <Link to="/hr/talent-arena/blind-evaluation" className="mt-1 inline-block text-[11px] bg-white/10 hover:bg-white/15 text-gray-300 font-semibold py-1.5 px-3 rounded-lg transition-colors">Evaluate →</Link>
                            ) : a.action === 'Request Team Vote' ? (
                              <Link to="/hr/talent-arena/team-vote" className="mt-1 inline-block text-[11px] bg-white/10 hover:bg-white/15 text-gray-300 font-semibold py-1.5 px-3 rounded-lg transition-colors">Vote →</Link>
                            ) : a.action === 'Send Challenge' ? (
                              <Link to="/hr/talent-arena/challenges" className="mt-1 inline-block text-[11px] bg-white/10 hover:bg-white/15 text-gray-300 font-semibold py-1.5 px-3 rounded-lg transition-colors">Challenge →</Link>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                {msg && <p className="text-xs text-gray-400 mt-3">{msg}</p>}
              </>
            )}
          </>
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}
