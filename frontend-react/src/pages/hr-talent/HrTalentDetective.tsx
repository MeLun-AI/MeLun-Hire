/* ------------------------------------------------------------------ */
/*  Talent Detective — progressive candidate investigation.            */
/*                                                                     */
/*  Evidence is revealed category by category; only after HR has       */
/*  investigated can they lock an evaluation, which is persisted.      */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import HrLayout from '../../components/hr/HrLayout';
import { SparklesIcon } from '../../components/hr/HrIcons';
import { useHrSession,
  TalentArenaPage,
  ArenaError,
  ArenaEmpty,
  ArenaSkeleton,
  ArenaSplit,
  ArenaScrollCard,
  QunoEvidenceBlock,
  RoleFitBlock,
  CandidatePicker,
  EVALUATION_OPTIONS,
  CONFIDENCE_OPTIONS,
} from './shared';
import { fetchTalentCandidates, fetchTalentEvaluations, saveTalentEvaluation } from '../../services/talentArena';
import type { CandidatesPayload, Evaluation, TalentCandidate } from '../../services/talentArena';

/* Evidence categories revealed one by one */
const EVIDENCE_STEPS = [
  { key: 'skills', title: 'Declared Skills', blurb: 'What the candidate reports knowing.' },
  { key: 'quno', title: 'MeLun Evidence', blurb: 'Verified Career Quest skill signals.' },
  { key: 'role', title: 'Role Compatibility', blurb: 'Evidence mapped to this job.' },
  { key: 'resume', title: 'Resume Analysis', blurb: 'AI resume-screening outcome.' },
  { key: 'interview', title: 'AI Interview Report', blurb: 'Structured interview scoring.' },
  { key: 'identity', title: 'Identity', blurb: 'Name and contact — reveal last.' },
] as const;

export default function HrTalentDetective() {
  const session = useHrSession();
  const [data, setData] = useState<CandidatesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [recommendation, setRecommendation] = useState('');
  const [confidence, setConfidence] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
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

  /* Reload saved evaluations whenever the selected candidate changes. */
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

  const pick = (c: TalentCandidate) => {
    setSelectedId(c.application_id);
    setRevealed(new Set());
    setRecommendation('');
    setConfidence('');
    setNotes('');
    setSavedMsg('');
  };

  const reveal = (key: string) => setRevealed((prev) => new Set(prev).add(key));

  const allCoreRevealed = ['skills', 'quno', 'role'].every((k) => revealed.has(k));

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
        mode: 'detective',
        recommendation,
        confidence: confidence || null,
        notes,
        evidence: {
          skills: selected.skills,
          quno_evidence: selected.quno_evidence,
          role_fit: selected.fit,
        },
        revealed_before_eval: revealed.has('identity'),
      });
      setSavedMsg('Investigation evaluation saved. It will feed the Hiring Quest.');
      setRecommendation('');
      setNotes('');
      setConfidence('');
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
        title="Talent Detective"
        subtitle="Investigate evidence step by step. Nothing here is a guess — every signal traces to the candidate's real profile, assessments or reports."
      >
        {error ? (
          <ArenaError message={error} onRetry={load} />
        ) : loading ? (
          <ArenaSkeleton />
        ) : !data || data.candidates.length === 0 ? (
          <ArenaEmpty title="No candidates to investigate yet" hint="Talent Detective activates as soon as applicants apply to your jobs." />
        ) : (
          <ArenaSplit
            asideWidth="320px"
            aside={
              <ArenaScrollCard title="Case Files" count={data.candidates.length} maxHeight={520}>
                <CandidatePicker candidates={data.candidates} selectedId={selectedId} onSelect={pick} label="Select a case file" />
              </ArenaScrollCard>
            }
            main={(
              <>
                {!selected ? (
                  <ArenaEmpty title="Select a case file" />
                ) : (
                  <>
                    {/* Candidate signal banner */}
                    <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 flex items-start gap-3">
                      <SparklesIcon className="w-5 h-5 text-primary-light shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {selected.quno_evidence.length > 0
                            ? `Strong analytical signal detected — ${selected.quno_evidence[0].skill} at ${selected.quno_evidence[0].value}.`
                            : 'No assessment evidence detected yet — send a challenge to collect signals.'}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {selected.job_title} · {selected.experience_years ?? '?'} yrs experience · resume {selected.resume_status || 'pending'}
                        </p>
                      </div>
                    </div>

                    {/* Progressive evidence */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {EVIDENCE_STEPS.map((step) => {
                        const open = revealed.has(step.key);
                        return (
                          <div key={step.key} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-white">{step.title}</p>
                                <p className="text-[11px] text-gray-500">{step.blurb}</p>
                              </div>
                              {!open && (
                                <button
                                  onClick={() => reveal(step.key)}
                                  className="text-xs bg-primary/20 hover:bg-primary/30 text-primary-light border border-primary/40 font-semibold px-3 py-1.5 rounded-xl transition-colors shrink-0"
                                >
                                  Investigate
                                </button>
                              )}
                            </div>
                            {open && (
                              <div className="mt-3 text-sm text-gray-300 space-y-1">
                                {step.key === 'skills' && (
                                  selected.skills.length ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      {selected.skills.map((s) => (
                                        <span key={s} className="text-xs bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">{s}</span>
                                      ))}
                                    </div>
                                  ) : <p className="text-gray-500">No skills declared on the profile.</p>
                                )}
                                {step.key === 'quno' && <QunoEvidenceBlock candidate={selected} />}
                                {step.key === 'role' && <RoleFitBlock candidate={selected} />}
                                {step.key === 'resume' && (
                                  selected.resume ? (
                                    <p>
                                      AI screening:{' '}
                                      <span className={Number(selected.resume.matched) === 1 || selected.resume.matched === true ? 'text-green-300' : 'text-yellow-300'}>
                                        {Number(selected.resume.matched) === 1 || selected.resume.matched === true
                                          ? 'Matched'
                                          : Number(selected.resume.matched) === 0 || selected.resume.matched === false
                                            ? 'Not matched'
                                            : 'Partial'}
                                      </span>
                                      {selected.resume.matched_skills.length > 0 && (
                                        <span className="text-gray-500"> · {selected.resume.matched_skills.slice(0, 5).join(', ')}</span>
                                      )}
                                    </p>
                                  ) : <p className="text-gray-500">No resume report submitted yet.</p>
                                )}
                                {step.key === 'interview' && (
                                  selected.interview_score != null ? (
                                    <p>AI interview score: <span className="font-bold text-primary-light">{selected.interview_score}/100</span></p>
                                  ) : <p className="text-gray-500">No completed interview report yet.</p>
                                )}
                                {step.key === 'identity' && (
                                  <p>{selected.full_name} · {selected.email} · {selected.location || '—'}</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Evaluation — unlocked after core evidence */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Case Evaluation</h3>
                      {!allCoreRevealed ? (
                        <p className="text-sm text-gray-500">
                          Investigate at least <span className="text-gray-300">Declared Skills</span>,{' '}
                          <span className="text-gray-300">MeLun Evidence</span> and <span className="text-gray-300">Role Compatibility</span>{' '}
                          before evaluating — decisions need evidence.
                        </p>
                      ) : (
                        <div className="space-y-3">
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
                            placeholder="Evidence notes — what did you find, what is missing?"
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary/50 resize-none"
                          />
                          <div className="flex items-center gap-3">
                            <button
                              onClick={submit}
                              disabled={saving || !recommendation}
                              className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors"
                            >
                              {saving ? 'Saving…' : 'Save Investigation Evaluation'}
                            </button>
                            {savedMsg && <p className="text-xs text-gray-400">{savedMsg}</p>}
                          </div>
                        </div>
                      )}

                      {/* Saved evaluations */}
                      {evaluations.length > 0 && (
                        <div className="mt-4 border-t border-white/10 pt-4 space-y-2">
                          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Saved evaluations for this candidate</p>
                          {evaluations.map((e) => (
                            <div key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <span
                                className={`font-semibold px-2 py-0.5 rounded-full border ${
                                  e.recommendation === 'Strong Hire'
                                    ? 'text-green-300 border-green-500/30 bg-green-500/10'
                                    : e.recommendation === 'Consider'
                                      ? 'text-primary-light border-primary/40 bg-primary/10'
                                      : e.recommendation === 'Weak Fit'
                                        ? 'text-red-300 border-red-500/30 bg-red-500/10'
                                        : 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
                                }`}
                              >
                                {e.recommendation}
                              </span>
                              <span className="text-gray-500">{e.mode}</span>
                              {e.confidence && <span className="text-gray-500">· confidence {e.confidence}</span>}
                              {e.notes && <span className="text-gray-500 truncate max-w-xs">· {e.notes}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
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
