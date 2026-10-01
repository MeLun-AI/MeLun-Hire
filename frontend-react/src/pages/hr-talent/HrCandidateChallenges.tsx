/* Candidate Challenges - send real Career Quest challenges to candidates and
   see results compared against the role requirement bar. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HrLayout from '../../components/hr/HrLayout';
import { SendIcon } from '../../components/hr/HrIcons';
import { useHrSession, TalentArenaPage, ArenaError, ArenaSkeleton, ArenaSplit, ArenaScrollCard } from './shared';
import {
  fetchTalentCandidates,
  sendTalentChallenge,
  fetchChallengeRequests,
} from '../../services/talentArena';
import { listChallenges } from '../../services/careerQuest';
import type { CandidatesPayload, ChallengeRequestRecord } from '../../services/talentArena';
import type { ChallengeMeta } from '../../services/careerQuest';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-bold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}

export default function HrCandidateChallenges() {
  const session = useHrSession();
  const [candidatesData, setCandidatesData] = useState<CandidatesPayload | null>(null);
  const [catalog, setCatalog] = useState<ChallengeMeta[]>([]);
  const [requests, setRequests] = useState<ChallengeRequestRecord[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [challengeId, setChallengeId] = useState('');
  const [roleBar, setRoleBar] = useState(80);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    Promise.all([
      fetchTalentCandidates(session.hrId),
      listChallenges().catch(() => [] as ChallengeMeta[]),
      fetchChallengeRequests(session.hrId).catch(() => ({ requests: [] as ChallengeRequestRecord[] })),
    ])
      .then(([c, cat, r]) => {
        setCandidatesData(c);
        setCatalog(cat);
        setRequests(r.requests);
        setSelectedAppId((prev) => prev ?? c.candidates[0]?.application_id ?? null);
        if (!challengeId && cat.length > 0) setChallengeId(cat[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load challenges.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  if (!session) return null;

  const selected = candidatesData?.candidates.find((c) => c.application_id === selectedAppId) ?? null;
  const selectedChallenge = catalog.find((ch) => ch.id === challengeId);

  const send = async () => {
    if (!session || !selected || !challengeId) return;
    setSending(true);
    setMsg('');
    try {
      await sendTalentChallenge({
        hr_id: session.hrId,
        application_id: selected.application_id,
        applicant_id: selected.applicant_id,
        challenge_id: challengeId,
        skill: selectedChallenge?.skill ?? selectedChallenge?.category ?? 'Problem Solving',
        role_bar: roleBar,
      });
      setMsg(`Challenge sent to ${selected.full_name}. They'll see it in their Career Quest.`);
      const r = await fetchChallengeRequests(session.hrId);
      setRequests(r.requests);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Could not send the challenge.');
    } finally {
      setSending(false);
    }
  };
return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Candidate Challenges"
        subtitle="Send real Career Quest challenges to candidates. Results flow back and are compared against the role requirement bar."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton count={3} />
        ) : !candidatesData || candidatesData.candidates.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
            <SendIcon className="w-10 h-10 mx-auto text-primary-light" />
            <p className="text-gray-300 font-semibold mt-3">No candidates to challenge yet.</p>
            <Link to="/hr/applicants" className="inline-block mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">Go to Applicants</Link>
          </div>
        ) : (
          <ArenaSplit
            asideWidth="360px"
            aside={
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
                <p className="text-[11px] text-gray-500 uppercase tracking-wider">Send a challenge</p>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Candidate</span>
                  <select value={selectedAppId ?? ''} onChange={(e) => setSelectedAppId(Number(e.target.value))}
                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
                    {candidatesData.candidates.map((c) => (
                      <option key={c.application_id} value={c.application_id}>{c.full_name} — {c.job_title}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Challenge</span>
                  <select value={challengeId} onChange={(e) => setChallengeId(e.target.value)}
                    className="w-full mt-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white">
                    {catalog.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.title} · {ch.skill}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Role bar: {roleBar}</span>
                  <input type="range" min={0} max={100} value={roleBar} onChange={(e) => setRoleBar(Number(e.target.value))}
                    className="w-full mt-2 accent-blue-600" />
                </label>
                {selectedChallenge && (
                  <p className="text-xs text-gray-400">
                    <span className="text-gray-500">Assesses:</span> <span className="text-white">{selectedChallenge.skill}</span>
                    <span className="text-gray-500"> · difficulty:</span> <span className="text-white">{selectedChallenge.difficulty}</span>
                    <span className="text-gray-500"> · ~{selectedChallenge.estimated_time} min</span>
                  </p>
                )}
                <div className="flex items-center gap-3">
                  {selected && (
                    <button onClick={send} disabled={sending || !challengeId}
                      className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                      {sending ? 'Sending…' : 'Send Challenge'}
                    </button>
                  )}
                  {msg && <p className="text-xs text-gray-400">{msg}</p>}
                </div>
              </div>
            }
            main={
              <ArenaScrollCard title={`${requests.length} challenge request${requests.length === 1 ? '' : 's'}`} maxHeight={600}>
                {requests.length === 0 ? (
                  <p className="text-sm text-gray-500">No challenges sent yet.</p>
                ) : (
                  requests.map((r) => {
                    const c = candidatesData.candidates.find((x) => x.application_id === r.application_id);
                    const verdict = r.verdict;
                    return (
                        <div key={r.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">{c?.full_name ?? `#${r.application_id}`}</p>
                              <p className="text-[11px] text-gray-500">{r.skill} · {r.challenge_id} · sent {r.created_at.slice(0, 10)}</p>
                            </div>
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${r.status === 'completed' ? 'text-green-300 border-green-500/30 bg-green-500/10' : r.status === 'sent' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10' : 'text-gray-400 border-white/10 bg-white/5'}`}>
                              {r.status}
                            </span>
                          </div>
                          {verdict ? (
                            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                              <Stat label="Candidate" value={String(verdict.candidate)} />
                              <Stat label="Role bar" value={String(verdict.role_requirement)} />
                              <Stat label="Confidence" value={verdict.evidence_confidence} />
                              <Stat label="Result" value={verdict.meets_bar ? 'Meets' : 'Below'} />
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 mt-2">Awaiting the candidate's completion of this challenge.</p>
                          )}
                        </div>
                    );
                  })
                )}
              </ArenaScrollCard>
            }
          />
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}
