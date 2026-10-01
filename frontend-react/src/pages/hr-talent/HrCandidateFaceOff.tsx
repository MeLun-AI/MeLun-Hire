/* ------------------------------------------------------------------ */
/*  Candidate Face-Off — evidence-based comparison of 2–3 candidates.  */
/*                                                                     */
/*  Shows a dimension table, produces an explainable trade-off         */
/*  read-out (evidence, not a "winner"), and persists the session.     */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import HrLayout from '../../components/hr/HrLayout';
import {
  useHrSession,
  TalentArenaPage,
  ArenaError,
  ArenaEmpty,
  ArenaSkeleton,
  ArenaSplit,
} from './shared';
import { fetchTalentCandidates, saveTalentComparison } from '../../services/talentArena';
import type { CandidatesPayload, TalentCandidate } from '../../services/talentArena';

/* Decision options for the hiring read */
const DECISIONS = ['Advance Candidate 1', 'Advance Candidate 2', 'Advance Candidate 3', 'Need More Evidence', 'Hold All'] as const;

export default function HrCandidateFaceOff() {
  const session = useHrSession();
  const [data, setData] = useState<CandidatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [decision, setDecision] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    fetchTalentCandidates(session.hrId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load candidates.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const candidates = useMemo(
    () => (data?.candidates ?? []).filter((c) => picked.includes(c.application_id)),
    [data, picked],
  );

  const toggle = (id: number) => {
    setPicked((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length >= 3 ? prev : [...prev, id],
    );
    setSavedMsg('');
  };

  /* Evidence-based trade-off read-out — never a declared "winner". */
  const readout: string[] = useMemo(() => {
    if (candidates.length < 2) return [];
    const lines: string[] = [];
    const bestFit = [...candidates].sort((a, b) => b.fit.score - a.fit.score)[0];
    const bestAssessed = [...candidates].sort((a, b) => b.assessment.avg_score - a.assessment.avg_score)[0];
    const bestExp = [...candidates].sort(
      (a, b) => (b.experience_years ?? 0) - (a.experience_years ?? 0),
    )[0];

    lines.push(
      `${bestFit.full_name} shows the strongest role fit (${bestFit.fit.score}% of required skills with declared skills or assessment evidence).`,
    );
    if (bestAssessed.assessment.completed > 0) {
      lines.push(
        `${bestAssessed.full_name} has the strongest assessment evidence (${bestAssessed.assessment.completed} challenge(s), average ${bestAssessed.assessment.avg_score}).`,
      );
    } else {
      lines.push('None of the compared candidates has Career Quest assessment evidence yet — a challenge would sharpen this comparison.');
    }
    if (bestExp.experience_years && bestExp.experience_years > 0) {
      lines.push(`${bestExp.full_name} brings the most experience (${bestExp.experience_years} yrs).`);
    }
    const gaps = candidates.map((c) => ({ name: c.full_name, missing: c.fit.missing_skills }));
    const withGaps = gaps.filter((g) => g.missing.length > 0);
    if (withGaps.length === candidates.length && withGaps.length > 0) {
      const common = gaps[0].missing.filter((m) => gaps.every((g) => g.missing.includes(m)));
      lines.push(
        common.length
          ? `Every compared candidate lacks evidence for: ${common.join(', ')} — collect this evidence before deciding.`
          : `Gaps differ per candidate: ${gaps.map((g) => `${g.name}: ${g.missing.join(', ') || 'none'}`).join(' · ')}.`,
      );
    } else if (withGaps.length > 0) {
      lines.push(
        withGaps.map((g) => `${g.name} still needs evidence for ${g.missing.join(', ')}`).join(' · '),
      );
    }
    const distinctSkills = new Set(candidates.flatMap((c) => c.quno_evidence.map((e) => e.skill)));
    if (distinctSkills.size > 0) {
      lines.push(
        `Verified MeLun Hire signals in play: ${[...distinctSkills].join(', ')}. Weight these against the role requirements rather than raw resume keywords.`,
      );
    }
    return lines;
  }, [candidates]);

  const submit = async () => {
    if (!session || candidates.length < 2 || !decision) return;
    setSaving(true);
    setSavedMsg('');
    try {
      await saveTalentComparison({
        hr_id: session.hrId,
        job_id: candidates[0].job_id,
        application_ids: candidates.map((c) => c.application_id),
        decision,
        tradeoffs: { readout, note },
      });
      setSavedMsg('Face-off session saved. The decision context stays auditable in the Hiring Quest.');
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Could not save the comparison.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Candidate Face-Off"
        subtitle="Pick 2–3 candidates and compare them across evidence dimensions. MeLun Hire shows trade-offs — the decision stays yours."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton />
        ) : !data || data.candidates.length < 2 ? (
          <ArenaEmpty title="Need at least 2 candidates" hint="The face-off activates once two or more applicants apply." />
        ) : (
          <div className="space-y-5">
            {/* Selection */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Select 2–3 candidates ({picked.length}/3 selected)
              </p>
              <div className="flex flex-wrap gap-2">
                {data.candidates.map((c) => {
                  const active = picked.includes(c.application_id);
                  return (
                    <button
                      key={c.application_id}
                      onClick={() => toggle(c.application_id)}
                      className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                        active ? 'bg-primary/25 text-primary-light border-primary/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {c.full_name}
                    </button>
                  );
                })}
              </div>
            </div>

            {candidates.length >= 2 && (
              <ArenaSplit
                asideWidth="340px"
                asidePosition="right"
                aside={
                  <div className="space-y-4">
                    <div className="bg-primary/10 border border-primary/30 rounded-2xl p-5">
                      <h3 className="text-sm font-bold text-white mb-3">Why MeLun sees it this way</h3>
                      <ul className="arena-scroll-list space-y-2 pr-1" style={{ maxHeight: 320 }}>
                        {readout.map((line, i) => (
                          <li key={i} className="text-[13px] text-gray-300 flex gap-2">
                            <span className="text-primary-light shrink-0">•</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Your decision</h3>
                      <div className="flex flex-wrap gap-2">
                        {DECISIONS.slice(0, candidates.length + 2).map((d) => (
                          <button
                            key={d}
                            onClick={() => setDecision(d)}
                            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                              decision === d ? 'bg-primary/25 text-primary-light border-primary/50' : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Decision context (optional)"
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={submit}
                          disabled={saving || !decision}
                          className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
                        >
                          {saving ? 'Saving…' : 'Save Face-Off Session'}
                        </button>
                        {savedMsg && <p className="text-xs text-gray-400">{savedMsg}</p>}
                      </div>
                    </div>
                  </div>
                }
                main={
                  <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[520px]">
                      <thead>
                        <tr className="border-b border-white/10 text-left">
                          <th className="px-4 py-3 text-[11px] text-gray-500 uppercase tracking-wider font-semibold">Dimension</th>
                          {candidates.map((c) => (
                            <th key={c.application_id} className="px-4 py-3 text-white font-bold">{c.full_name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {[
                          { label: 'Required skills', render: (c: TalentCandidate) => `${c.fit.matched_skills.length}/${c.fit.per_skill.length} covered (${c.fit.score}%)` },
                          { label: 'Relevant experience', render: (c: TalentCandidate) => `${c.experience_years ?? '?'} yrs` },
                          {
                            label: 'Assessment signals',
                            render: (c: TalentCandidate) =>
                              c.assessment.completed > 0 ? `${c.assessment.completed} challenges · avg ${c.assessment.avg_score}` : 'No challenges yet',
                          },
                          {
                            label: 'Problem solving / analytical',
                            render: (c: TalentCandidate) => {
                              const ps = c.quno_evidence.find((e) => /problem|analytic/i.test(e.skill));
                              return ps ? `${ps.skill} — ${ps.value}` : 'no signal yet';
                            },
                          },
                          {
                            label: 'Communication',
                            render: (c: TalentCandidate) => {
                              const cm = c.quno_evidence.find((e) => /communic/i.test(e.skill));
                              return cm ? `${cm.value}` : 'no signal yet';
                            },
                          },
                          { label: 'AI interview score', render: (c: TalentCandidate) => (c.interview_score != null ? `${c.interview_score}/100` : 'not interviewed') },
                          { label: 'Strengths', render: (c: TalentCandidate) => c.fit.matched_skills.join(', ') || '—' },
                          { label: 'Potential gaps', render: (c: TalentCandidate) => c.fit.missing_skills.join(', ') || 'none' },
                        ].map((row) => (
                          <tr key={row.label}>
                            <td className="px-4 py-3 text-[12px] text-gray-500 font-semibold">{row.label}</td>
                            {candidates.map((c) => (
                              <td key={c.application_id} className="px-4 py-3 text-gray-300">{row.render(c)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
              />
            )}

          </div>
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}
