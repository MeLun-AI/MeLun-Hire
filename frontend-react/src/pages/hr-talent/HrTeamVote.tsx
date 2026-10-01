/* Team Vote - independent evaluation by multiple reviewers, aggregated
   into consensus with agreement / mixed-opinion analysis. Votes persist. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HrLayout from '../../components/hr/HrLayout';
import { VoteIcon } from '../../components/hr/HrIcons';
import { useHrSession, TalentArenaPage, ArenaError, ArenaSkeleton, ArenaSplit, ArenaScrollCard, CandidatePicker } from './shared';
import { fetchTalentCandidates, fetchTeamVotes, saveTeamVote } from '../../services/talentArena';
import type { CandidatesPayload, TalentCandidate, VoteConsensus, VoteRecord } from '../../services/talentArena';

const RECS = ['Move Forward', 'Hold', 'Reject', 'Need More Evidence'] as const;
const COI = ['High', 'Medium', 'Low'] as const;

export default function HrTeamVote() {
  const session = useHrSession();
  const [data, setData] = useState<CandidatesPayload | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [consensus, setConsensus] = useState<VoteConsensus | null>(null);
  const [name, setName] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [confidence, setConfidence] = useState('');
  const [strengths, setStrengths] = useState('');
  const [concerns, setConcerns] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    fetchTalentCandidates(session.hrId)
      .then((d) => {
        setData(d);
        setSelectedId((prev) => prev ?? d.candidates[0]?.application_id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load candidates.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session || !selectedId) return;
    setVotes([]);
    setConsensus(null);
    fetchTeamVotes(session.hrId, selectedId)
      .then((r) => {
        setVotes(r.votes);
        setConsensus(r.consensus);
      })
      .catch(() => { setVotes([]); setConsensus(null); });
  }, [session, selectedId]);

  if (!session) return null;

  const selected = data?.candidates.find((c) => c.application_id === selectedId) ?? null;

  const submit = async () => {
    if (!session || !selected || !recommendation || !name.trim()) return;
    setSaving(true);
    setMsg('');
    try {
      await saveTeamVote({
        hr_id: session.hrId,
        application_id: selected.application_id,
        job_id: selected.job_id,
        evaluator_name: name.trim(),
        recommendation,
        confidence: confidence || null,
        strengths,
        concerns,
      });
      setMsg(`Vote recorded for ${selected.full_name}.`);
      const r = await fetchTeamVotes(session.hrId, selected.application_id);
      setVotes(r.votes);
      setConsensus(r.consensus);
      setRecommendation('');
      setConfidence('');
      setStrengths('');
      setConcerns('');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not save the vote.');
    } finally {
      setSaving(false);
    }
  };

  const pick = (c: TalentCandidate) => {
    setSelectedId(c.application_id);
    setMsg('');
    setRecommendation('');
  };
return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Team Vote"
        subtitle="Collect independent evaluations from the team. MeLun Hire aggregates consensus, agreement and mixed opinions — it never decides for you."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton count={3} />
        ) : !data || data.candidates.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <VoteIcon className="w-10 h-10 mx-auto text-primary-light" />
            <p className="text-gray-300 font-semibold mt-3">No candidates to vote on yet.</p>
            <Link to="/hr/applicants" className="inline-block mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">Go to Applicants</Link>
          </div>
        ) : (
          <ArenaSplit
            asideWidth="320px"
            aside={
              <ArenaScrollCard title="Select a candidate" count={data.candidates.length} maxHeight={520}>
                <CandidatePicker candidates={data.candidates} selectedId={selected?.application_id ?? null} onSelect={pick} />
              </ArenaScrollCard>
            }
            main={(
              <>
                {selected && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Add a team evaluation</p>
                    <h2 className="text-lg font-bold text-white mt-1">{selected.full_name}</h2>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                    className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600" />
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {RECS.map((r) => (
                        <button key={r} onClick={() => setRecommendation(r)}
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${recommendation === r ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {COI.map((c) => (
                        <button key={c} onClick={() => setConfidence(c)}
                          className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${confidence === c ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                          Confidence: {c}
                        </button>
                      ))}
                    </div>
                    <textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Strengths observed" rows={2}
                      className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none" />
                    <textarea value={concerns} onChange={(e) => setConcerns(e.target.value)} placeholder="Concerns / missing evidence" rows={2}
                      className="w-full mt-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 resize-none" />
                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={submit} disabled={saving || !recommendation || !name.trim()}
                        className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                        {saving ? 'Saving…' : 'Record Vote'}
                      </button>
                      {msg && <p className="text-xs text-gray-400">{msg}</p>}
                    </div>
                  </div>
                )}
                {selected && (
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider">Team consensus</p>
                    {consensus && consensus.total_votes > 0 ? (
                      <>
                        <p className="text-xl font-extrabold text-primary-light mt-1">{consensus.consensus}</p>
                        <div className="mt-3 space-y-2">
                          {Object.entries(consensus.recommendations).map(([rec, n]) => (
                            <div key={rec} className="flex items-center justify-between text-xs">
                              <span className="text-gray-300">{rec}</span>
                              <span className="text-white font-semibold tabular-nums">{n}</span>
                            </div>
                          ))}
                        </div>
                        {consensus.agreement_on.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] text-green-300">Strong agreement on</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {consensus.agreement_on.map((a) => (
                                <span key={a.topic} className="text-[10px] px-2 py-0.5 rounded-full border text-green-300 border-green-500/30 bg-green-500/10">
                                  {a.topic} ×{a.mentions}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {consensus.mixed_on.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[11px] text-yellow-300">Mixed opinions on</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {consensus.mixed_on.map((d) => (
                                <span key={d.topic} className="text-[10px] px-2 py-0.5 rounded-full border text-yellow-300 border-yellow-500/30 bg-yellow-500/10">
                                  {d.topic} ×{d.mentions}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {consensus.quno_suggestion && (
                          <p className="text-xs text-primary-light mt-3">
                            <span className="font-semibold">MeLun Suggestion:</span> {consensus.quno_suggestion}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 mt-1">No votes yet for this candidate.</p>
                    )}

                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-4">Individual evaluations</p>
                    {votes.length === 0 ? (
                      <p className="text-xs text-gray-500 mt-1">None recorded.</p>
                    ) : (
                      votes.map((v) => (
                        <div key={v.id} className="border-t border-white/10 pt-3 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-white font-semibold">{v.evaluator_name}</span>
                            <span className={`font-semibold px-2 py-0.5 rounded-full border ${v.recommendation === 'Move Forward' ? 'text-green-300 border-green-500/30 bg-green-500/10' : v.recommendation === 'Reject' ? 'text-red-300 border-red-500/30 bg-red-500/10' : v.recommendation === 'Need More Evidence' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>
                              {v.recommendation}
                            </span>
                          </div>
                          {v.confidence && <p className="text-gray-500">confidence {v.confidence}</p>}
                          {v.strengths && <p className="text-gray-400">Strengths: {v.strengths}</p>}
                          {v.concerns && <p className="text-gray-400">Concerns: {v.concerns}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          />
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}
