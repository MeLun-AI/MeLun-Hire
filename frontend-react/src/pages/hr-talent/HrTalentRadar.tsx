/* AI Talent Radar - evidence-ranked candidate discovery. */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HrLayout from '../../components/hr/HrLayout';
import { RadarIcon } from '../../components/hr/HrIcons';
import { useHrSession, TalentArenaPage, ArenaError, ArenaSkeleton, ArenaScrollCard, QunoEvidenceBlock } from './shared';
import { fetchTalentRadar, fetchTalentCandidates } from '../../services/talentArena';
import type { CandidatesPayload, QunoEvidence, RadarRecommendation } from '../../services/talentArena';

function levelColor(level: string): string {
  if (level.includes('Very Strong') || level === 'Strong') return 'text-green-300';
  if (level === 'Moderate') return 'text-yellow-300';
  return 'text-gray-400';
}

function Pill({ label, tone }: { label: string; tone: 'ok' | 'mid' | 'low' | 'gem' }) {
  const cls =
    tone === 'gem' ? 'text-purple-300 border-purple-500/30 bg-purple-500/10'
    : tone === 'ok' ? 'text-green-300 border-green-500/30 bg-green-500/10'
    : tone === 'mid' ? 'text-yellow-300 border-yellow-500/30 bg-yellow-500/10'
    : 'text-gray-400 border-white/10 bg-white/5';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

export default function HrTalentRadar() {
  const session = useHrSession();
  const [candidatesData, setCandidatesData] = useState<CandidatesPayload | null>(null);
  const [recommendations, setRecommendations] = useState<RadarRecommendation[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingRadar, setLoadingRadar] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    setLoading(true);
    setError('');
    fetchTalentCandidates(session.hrId)
      .then((d) => {
        setCandidatesData(d);
        const firstJob = d.jobs.find((j) => j.status !== 'Closed');
        setJobId((prev) => prev ?? firstJob?.id ?? d.jobs[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the talent radar.'))
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!session || !jobId) return;
    setLoadingRadar(true);
    fetchTalentRadar(session.hrId, jobId)
      .then((r) => {
        setRecommendations(r.recommendations);
        setSelectedAppId((prev) => prev ?? r.recommendations[0]?.application_id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load recommendations.'))
      .finally(() => setLoadingRadar(false));
  }, [session, jobId]);

  if (!session) return null;

  const selected = recommendations.find((r) => r.application_id === selectedAppId) ?? null;
  const candidate = candidatesData?.candidates.find((c) => c.application_id === (selected?.application_id ?? -1)) ?? null;
  const qunoForSelected: QunoEvidence[] =
    candidate && candidate.quno_evidence.length ? candidate.quno_evidence : (selected?.quno_evidence ?? []);
const emptyRadar = !candidatesData || candidatesData.jobs.length === 0;
  if (emptyRadar) {
    return (
      <HrLayout activePage="talent-arena">
        <TalentArenaPage title="AI Talent Radar" subtitle="Evidence-ranked talent discovery. Every recommendation is explained — including candidates keyword filters would have overlooked.">
          {error ? <ArenaError message={error} onRetry={load} />
          : loading ? <ArenaSkeleton count={3} />
          : (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
              <RadarIcon className="w-10 h-10 mx-auto text-primary-light" />
              <p className="text-gray-300 font-semibold mt-3">No job posts to scan yet.</p>
              <p className="text-gray-500 text-sm mt-1">Post a job with required skills and the radar will rank every applicant against it.</p>
              <Link to="/hr/job-posts" className="inline-block mt-4 text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">Go to Job Posts</Link>
            </div>
          )}
        </TalentArenaPage>
      </HrLayout>
    );
  }

  return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage title="AI Talent Radar" subtitle="Evidence-ranked talent discovery. Every recommendation is explained — including candidates keyword filters would have overlooked.">
        {error ? <ArenaError message={error} onRetry={load} />
        : loading ? <ArenaSkeleton count={3} />
        : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Select a job to scan">
              {candidatesData.jobs.map((j) => (
                <button key={j.id} onClick={() => setJobId(j.id)}
                  className={`px-3 py-1.5 rounded-full border text-[12px] transition-colors ${j.id === jobId ? 'bg-primary/15 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'}`}>
                  {j.job_title} <span className="text-[10px] text-gray-500 tabular-nums">({j.candidates})</span>
                </button>
              ))}
            </div>

            {loadingRadar ? <ArenaSkeleton count={3} />
            : recommendations.length === 0 ? <p className="text-sm text-gray-500 mt-6">No candidates to scan for this role yet.</p>
            : (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5 items-start">
                <ArenaScrollCard title="Ranked candidates" count={recommendations.length} maxHeight={560}>
                  {recommendations.map((r) => {
                    const active = r.application_id === selectedAppId;
                    return (
                      <button key={r.application_id} onClick={() => setSelectedAppId(r.application_id)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${active ? 'bg-primary/15 border-primary/50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{r.full_name}</p>
                            <p className="text-[11px] text-gray-500 truncate">{r.job_title} · {r.skills.slice(0, 3).join(', ') || 'No skills listed'}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-extrabold text-primary-light tabular-nums">{r.match_score}%</p>
                            <p className="text-[10px] text-gray-500">match</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <Pill label={`Resume: ${r.resume_keyword_match}`} tone={r.resume_keyword_match === 'Strong' ? 'ok' : r.resume_keyword_match === 'Moderate' ? 'mid' : 'low'} />
                          <Pill label={`Skills: ${r.skill_evidence}`} tone="ok" />
                          <Pill label={`Assessment: ${r.assessment_evidence}`} tone="ok" />
                          {r.hidden_gem && <Pill label="Hidden gem" tone="gem" />}
                        </div>
                      </button>
                    );
                  })}
                </ArenaScrollCard>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5 lg:sticky lg:top-4 self-start min-w-0">
                  {!selected ? <p className="text-sm text-gray-500">Select a candidate to inspect.</p>
                  : (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Why MeLun surfaced this candidate</p>
                          <h2 className="text-lg font-bold text-white">{selected.full_name}</h2>
                          <p className="text-[11px] text-gray-500">{selected.job_title} · {selected.experience_years ?? '—'} yrs</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-extrabold text-primary-light tabular-nums">{selected.match_score}%</p>
                          <p className="text-[10px] text-gray-500">overall fit</p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        {selected.why.map((w) => (
                          <div key={w.label} className="flex items-center justify-between gap-3">
                            <span className="text-xs text-gray-300">{w.label}</span>
                            <span className={`text-xs font-semibold ${levelColor(w.detail)}`}>
                              {w.detail}{w.value > 0 ? <span className="text-gray-500 tabular-nums"> ({w.value})</span> : null}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selected.missing_skills.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[11px] text-red-300">Missing capability keywords</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {selected.missing_skills.map((s) => <Pill key={s} label={s} tone="low" />)}
                          </div>
                        </div>
                      )}
                      {qunoForSelected.length > 0 && (
                        <div className="mt-4 border-t border-white/10 pt-4">
                          <p className="text-[11px] text-gray-500 uppercase tracking-wider">MeLun Evidence</p>
                          <QunoEvidenceBlock candidate={candidate ?? { quno_evidence: qunoForSelected } as never} />
                        </div>
                      )}
                      <Link to="/hr/talent-arena/detective" className="mt-4 inline-block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                        Investigate in Talent Detective →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </TalentArenaPage>
    </HrLayout>
  );
}