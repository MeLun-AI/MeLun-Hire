/* ------------------------------------------------------------------ */
/*  Blind Evaluation — skills-first, less-biased evaluation.           */
/*                                                                     */
/*  Identity stays masked while HR evaluates only the evidence.        */
/*  The evaluation is persisted (with a revealed_before_eval flag)     */
/*  and only then is identity revealed.                                */
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
  ArenaScrollCard,
  QunoEvidenceBlock,
  RoleFitBlock,
  EVALUATION_OPTIONS,
  CONFIDENCE_OPTIONS,
} from './shared';
import { fetchTalentCandidates, fetchTalentEvaluations, saveTalentEvaluation } from '../../services/talentArena';
import type { CandidatesPayload, Evaluation, TalentCandidate } from '../../services/talentArena';

export default function HrBlindEvaluation() {
  const session = useHrSession();
  const [data, setData] = useState<CandidatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [recommendation, setRecommendation] = useState('');
  const [confidence, setConfidence] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);

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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!session || !selectedId) return;
    setEvaluations([]);
    fetchTalentEvaluations(session.hrId, selectedId)
      .then((r) => setEvaluations(r.evaluations))
      .catch(() => setEvaluations([]));
  }, [session, selectedId]);

  const selected = useMemo(
    () => data?.candidates.find((c) => c.application_id === selectedId) ?? null,
    [data, selectedId],
  );

  const maskedIndex = useMemo(() => {
    if (!data || !selected) return 0;
    return data.candidates.findIndex((c) => c.application_id === selected.application_id) + 1;
  }, [data, selected]);

  const pick = (c: TalentCandidate) => {
    setSelectedId(c.application_id);
    setRecommendation('');
    setConfidence('');
    setNotes('');
    setRevealed(false);
    setSavedMsg('');
  };

  const submit = async () => {
    if (!session || !selected || !recommendation) return;
    setSaving(true);
    setSavedMsg('');
    try {
      await saveTalentEvaluation({
        hr_id: session.hrId,
        application_id: selected.application_id,
        applicant_id: selected.applicant_id,
        job_id: selected.job_id,
        mode: 'blind',
        recommendation,
        confidence: confidence || null,
        notes,
        evidence: { quno_evidence: selected.quno_evidence, role_fit: selected.fit },
        revealed_before_eval: revealed,
      });
      setSavedMsg('Blind evaluation saved — identity can now be compared against your evidence-based read.');
      const r = await fetchTalentEvaluations(session.hrId, selected.application_id);
      setEvaluations(r.evaluations);
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Could not save the evaluation.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Blind Evaluation"
        subtitle="Based only on the evidence — how strong is this candidate for the role? Identity is revealed only after your evaluation."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton />
        ) : !data || data.candidates.length === 0 ? (
          <ArenaEmpty title="No candidates to evaluate yet" hint="Blind Evaluation activates as soon as applicants apply." />
        ) : (
          <ArenaSplit
            asideWidth="300px"
            aside={
              <ArenaScrollCard title="Blind Pool" count={data.candidates.length} maxHeight={520}>
                {data.candidates.map((c) => {
                  const idx = data.candidates.findIndex((x) => x.application_id === c.application_id) + 1;
                  const active = c.application_id === selectedId;
                  return (
                    <button
                      key={c.application_id}
                      onClick={() => pick(c)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
                        active ? 'bg-primary/15 border-primary/50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">Candidate #{String(idx).padStart(2, '0')}</p>
                        <p className="text-[11px] text-gray-500 truncate">{c.job_title}</p>
                      </div>
                      <span className="text-[11px] text-gray-500 shrink-0">fit {c.fit.score}%</span>
                    </button>
                  );
                })}
              </ArenaScrollCard>
            }
            main={(
              <>
                {!selected ? (
                  <ArenaEmpty title="Select a candidate" />
                ) : (
                  <>
                    {/* Masked header */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-white">Candidate #{String(maskedIndex).padStart(2, '0')}</p>
                        <p className="text-[11px] text-gray-500">Applying for {selected.job_title}</p>
                      </div>
                      {revealed ? (
                        <span className="text-xs text-green-300 font-semibold">Identity: {selected.full_name}</span>
                      ) : (
                        <span className="text-xs text-gray-500 border border-white/10 px-2 py-0.5 rounded-full">Identity hidden</span>
                      )}
                    </div>

                    {/* Evidence only */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <QunoEvidenceBlock candidate={selected} />
                      <RoleFitBlock candidate={selected} />
                    </div>
                    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-sm text-gray-300 space-y-1">
                      <p>Declared skills: {selected.skills.join(', ') || 'none'}</p>
                      <p>Experience: {selected.experience_years ?? '?'} years</p>
                      <p>
                        Resume screening:{' '}
                        {selected.resume
                          ? Number(selected.resume.matched) === 1 || selected.resume.matched === true
                            ? 'Matched'
                            : Number(selected.resume.matched) === 0 || selected.resume.matched === false
                              ? 'Not matched'
                              : 'Partial'
                          : 'not submitted yet'}
                      </p>
                    </div>

                    {/* Task + options */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                        Based only on the evidence, how strong is this candidate for the role?
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {EVALUATION_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setRecommendation(opt)}
                            className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                              recommendation === opt
                                ? 'bg-primary/25 text-primary-light border-primary/50'
                                : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {CONFIDENCE_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setConfidence(opt)}
                            className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                              confidence === opt
                                ? 'bg-primary/20 text-primary-light border-primary/40'
                                : 'bg-white/5 text-gray-500 border-white/10'
                            }`}
                          >
                            Confidence: {opt}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What evidence drove this call?"
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={submit}
                          disabled={saving || !recommendation}
                          className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
                        >
                          {saving ? 'Saving…' : 'Lock In Evaluation'}
                        </button>
                        <button
                          onClick={() => setRevealed(true)}
                          disabled={!recommendation}
                          className="text-xs bg-white/5 hover:bg-white/10 disabled:opacity-50 border border-white/10 text-gray-300 font-semibold py-2.5 px-4 rounded-xl transition-colors"
                        >
                          Reveal Identity
                        </button>
                        {savedMsg && <p className="text-xs text-gray-400">{savedMsg}</p>}
                      </div>
                    </div>

                    {/* History */}
                    {evaluations.length > 0 && (
                      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2">
                        <p className="text-[11px] text-gray-500 uppercase tracking-wider">Saved evaluations</p>
                        {evaluations.map((e) => (
                          <div key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <span className="text-white font-semibold">{e.recommendation}</span>
                            <span>· {e.mode}</span>
                            <span>· {e.revealed_before_eval ? 'identity was known before evaluating' : 'evaluated blind'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          />
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}
