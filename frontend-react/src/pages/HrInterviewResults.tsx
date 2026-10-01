import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HrLayout from '../components/hr/HrLayout';
import StatusBadge from '../components/common/StatusBadge';
import { getJson, requestErrorMessage } from '../services/api';
import {
  bulkRecordFinalDecision,
  finalDecisionSourceLabel,
  finalDecisionStatus,
  normalizeFinalDecision,
  recordFinalDecision,
  fetchAutoDecideCandidates,
  saveAutoDecideCandidates,
  fetchHrInterviewReport,
  type FinalDecision,
  type HrInterviewReportData,
} from '../services/applications';
import { InterviewAnswersToggle, InterviewBriefInsights } from '../components/hr/InterviewReportInsights';
import { BulkActionButton, BulkSelectBar, RowCheckbox } from '../components/hr/BulkSelectBar';

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface InterviewResult {
  application_id: number;
  full_name: string;
  job_title: string;
  status: string;
  /** Final post-interview decision, if it was already made (additive field). */
  final_decision?: string | null;
  final_decision_source?: string | null;
  final_decision_score?: number | null;
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function InterviewDetailModal({
  applicationId,
  hrId,
  decision,
  onDecide,
  onClose,
}: {
  applicationId: number;
  hrId: number;
  /** The decision stored in the backend (null = still undecided). */
  decision: string | null;
  /** Record the decision — the page owns the API call, the refresh and the toast. */
  onDecide: (applicationId: number, decision: FinalDecision) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [report, setReport] = useState<HrInterviewReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHrInterviewReport(applicationId, hrId)
      .then((d) => { if (!cancelled) { setReport(d); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [applicationId, hrId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8 overflow-y-auto">
      <div className="bg-navy-800 border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-navy-800 border-b border-white/10 px-6 py-4 flex items-center justify-between z-10 rounded-t-2xl">
          <h2 className="text-lg font-bold text-white">Interview Report</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/hr/interview-report/${applicationId}`)}
              className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-1.5 px-3 rounded-lg transition-all"
            >
              Open Full Report
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading && <div className="space-y-4 animate-pulse"><div className="h-5 bg-white/10 rounded w-1/3" /><div className="h-4 bg-white/10 rounded w-1/2" /></div>}
          {error && <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">{error}</div>}
          {!loading && !error && report && (
            <>
              <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><p className="text-xs text-gray-500">Candidate</p><p className="text-sm font-bold text-white">{report.candidate_name}</p></div>
                  <div><p className="text-xs text-gray-500">Job Title</p><p className="text-sm font-bold text-white">{report.job_title}</p></div>
                  <div><p className="text-xs text-gray-500">Score</p><p className={`text-sm font-bold ${report.overall_score >= 80 ? 'text-green-400' : report.overall_score >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>{report.overall_score}%</p></div>
                  <div><p className="text-xs text-gray-500">Verdict</p><p className="text-sm font-bold text-white">{report.verdict}</p></div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Object.entries(report.rounds).map(([key, round]) => (
                  <div key={key} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-sm font-semibold text-white">{round.label}</p>
                    <p className={`text-2xl font-extrabold mt-1 ${round.average_percent >= 70 ? 'text-green-400' : round.average_percent >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>{round.average_percent}%</p>
                    <div className="mt-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${round.average_percent >= 70 ? 'bg-green-500' : round.average_percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${round.average_percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              {/* Brief insights stay visible; the full Q&A below is collapsed by default. */}
              <InterviewBriefInsights report={report} />

              <InterviewAnswersToggle report={report} />
            </>
          )}
        </div>
        {/* Decision footer — only while the interview is still undecided. The
            decision is a ONE-TIME record: once stored it is final, so the
            buttons disappear instead of inviting a change that the backend
            would reject anyway. */}
        {!loading && !error && !normalizeFinalDecision(decision) && (
          <div className="border-t border-white/10 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-gray-400">
              Record the final decision for this interview. The candidate is emailed once and the
              decision cannot be changed afterwards.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => onDecide(applicationId, 'selected')}
                className="text-xs font-semibold text-white bg-green-600 hover:bg-green-500 px-4 py-2 rounded-xl transition-colors"
              >
                Approve &amp; Select
              </button>
              <button
                onClick={() => onDecide(applicationId, 'rejected')}
                className="text-xs font-semibold text-white bg-red-600 hover:bg-red-500 px-4 py-2 rounded-xl transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HrInterviewResults() {
  const navigate = useNavigate();
  const [session, setSession] = useState<HrSession | null>(null);
  const [results, setResults] = useState<InterviewResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /* Automatic decisions (persisted per HR, same pattern as automatic codes). */
  const [autoDecide, setAutoDecide] = useState(false);
  const [autoDecideSaving, setAutoDecideSaving] = useState(false);
  /* The decision currently being recorded (disables the buttons of that row). */
  const [savingId, setSavingId] = useState<number | null>(null);
  /* Row awaiting confirmation: a hiring decision is never one accidental click. */
  const [confirming, setConfirming] = useState<{ id: number; decision: FinalDecision } | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  /* Multi-select for bulk decisions. Only interviews WITHOUT a stored decision
     are selectable, because a decision is written once and cannot be redone. */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDecision, setBulkDecision] = useState<FinalDecision | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) { navigate('/hr/login', { replace: true }); return; }
    try {
      const s: HrSession = JSON.parse(raw);
      if (!s.hr_id) { navigate('/hr/login', { replace: true }); return; }
      setSession(s);
    } catch { navigate('/hr/login', { replace: true }); }
  }, [navigate]);

  /* The completed interviews + their stored decisions (backend = source of truth). */
  const loadResults = useCallback(() => {
    if (!session?.hr_id) return;
    setLoading(true);
    getJson<InterviewResult[]>(`/hr/completed-interviews/${session.hr_id}`)
      .then((d) => { setResults(Array.isArray(d) ? d : []); setLoading(false); })
      .catch((err: Error) => {
        setError(requestErrorMessage(err, 'Failed to load completed interviews.'));
        setLoading(false);
      });
  }, [session?.hr_id]);

  useEffect(() => { loadResults(); }, [loadResults]);

  /* Automatic decisions switch (stored in the database, so it survives a reload). */
  const loadAutoDecide = useCallback(() => {
    if (!session?.hr_id) return;
    fetchAutoDecideCandidates(session.hr_id)
      .then(setAutoDecide)
      /* Safe default when the setting cannot be read: OFF (manual decisions). */
      .catch(() => setAutoDecide(false));
  }, [session?.hr_id]);

  useEffect(() => { loadAutoDecide(); }, [loadAutoDecide]);

  const handleToggleAutoDecide = async () => {
    if (!session?.hr_id || autoDecideSaving) return;
    setAutoDecideSaving(true);
    try {
      const stored = await saveAutoDecideCandidates(session.hr_id, !autoDecide);
      setAutoDecide(stored);
      setToast({
        kind: 'success',
        text: stored
          ? 'Automatic decisions enabled. Interviews completed from now on are selected at 50% or higher and rejected below that, and the candidate is emailed.'
          : 'Automatic decisions disabled. You decide each candidate manually.',
      });
    } catch (err) {
      /* The backend value stays authoritative — re-read instead of guessing. */
      loadAutoDecide();
      setToast({ kind: 'error', text: requestErrorMessage(err, 'Failed to update automatic decisions.') });
    } finally {
      setAutoDecideSaving(false);
    }
  };

  /* Record ONE final decision. The backend is idempotent: a retry or a refresh
   * can never create a second decision nor a second candidate email. */
  const handleDecide = async (applicationId: number, decision: FinalDecision) => {
    if (savingId !== null) return;
    setConfirming(null);
    setSavingId(applicationId);
    try {
      const res = await recordFinalDecision(applicationId, decision);
      /* Close the modal (when the decision was made inside it): the refreshed
       * row and the feedback message are behind the overlay, so the recruiter
       * must see them. */
      setSelectedId(null);
      loadResults();
      setToast({
        kind: res.email_sent ? 'success' : 'error',
        text: res.email_sent
          ? `Decision saved: ${decision === 'selected' ? 'candidate selected' : 'candidate not selected'}. The candidate has been emailed.`
          : 'Decision saved, but the notification email could not be sent. Re-approving the same decision retries the email.',
      });
    } catch (err) {
      setToast({ kind: 'error', text: requestErrorMessage(err, 'Failed to record the decision.') });
    } finally {
      setSavingId(null);
    }
  };

  /* ---------- Multi-select for bulk decisions ---------- */
  /* A stored decision is final and write-once, so only undecided interviews can
     be selected — a decided row keeps its stored outcome. */
  const selectableResults = useMemo(
    () => results.filter((r) => !normalizeFinalDecision(r.final_decision)),
    [results]
  );

  const selectableIds = useMemo(
    () => selectableResults.map((r) => r.application_id),
    [selectableResults]
  );

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  };

  const toggleSelected = (applicationId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(applicationId);
      else next.delete(applicationId);
      return next;
    });
  };

  /* Drop rows that stopped being selectable (after a refresh, or once another
     action decided them) so the bulk action can never target a stale row. */
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => selectableIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  /* Record the SAME final decision for every selected candidate in ONE request.
   * The backend applies the single-record rules to each candidate (ownership,
   * completed interview, write-once, one email) and reports what it skipped. */
  const handleBulkDecide = async () => {
    if (!bulkDecision || selectedIds.size === 0 || bulkSaving) return;
    const decision = bulkDecision;
    setBulkSaving(true);
    try {
      const res = await bulkRecordFinalDecision([...selectedIds], decision);
      setSelectedIds(new Set());
      setBulkDecision(null);
      loadResults();

      const recorded = res.recorded.length;
      const skipped = res.skipped.length;
      const failedEmails = Math.max(recorded - res.email_sent, 0);

      let text = `${recorded} candidate${recorded === 1 ? '' : 's'} ${
        decision === 'selected' ? 'selected' : 'rejected'
      }.`;
      if (recorded === 0) text = 'None of the selected candidates could be decided.';
      if (skipped) text += ` ${skipped} skipped (not eligible for a decision).`;
      if (failedEmails) {
        text += ` ${failedEmails} notification email${failedEmails === 1 ? '' : 's'} could not be sent.`;
      }

      setToast({
        kind: recorded > 0 && skipped === 0 && failedEmails === 0 ? 'success' : 'error',
        text,
      });
    } catch (err) {
      setBulkDecision(null);
      setToast({ kind: 'error', text: requestErrorMessage(err, 'Failed to record the decisions.') });
    } finally {
      setBulkSaving(false);
    }
  };

  if (!session) return null;

  const decidedId = selectedId != null
    ? results.find((r) => r.application_id === selectedId)?.final_decision ?? null
    : null;

  return (
    <>
    <HrLayout activePage="interview-results">
      <div className="max-w-7xl mx-auto px-6 py-6 md:py-10">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">Interview Results</h1>
          <p className="text-gray-500 text-sm mt-1">Review completed AI interviews and candidate scores</p>
        </div>

        {/* Automatic candidate decisions — the switch lives in the database
            (per HR) exactly like the automatic interview codes, so it survives a
            refresh and a re-login. It applies to interviews completed from the
            moment it is switched on; already completed interviews stay as they
            are until you decide them here. */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 mb-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Automatic Candidate Decisions</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Decide every completed interview automatically: 50% or higher is selected, below 50% is
              rejected. The candidate is emailed once, and a manual decision always wins.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoDecide}
            aria-label="Automatic candidate decisions"
            onClick={handleToggleAutoDecide}
            disabled={autoDecideSaving}
            className={`shrink-0 inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors disabled:opacity-50 ${
              autoDecide
                ? 'bg-green-500/15 text-green-300 border-green-500/40'
                : 'bg-white/5 text-gray-400 border-white/10'
            }`}
          >
            <span
              className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
                autoDecide ? 'bg-green-500/70' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  autoDecide ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </span>
            {autoDecide ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Decision feedback (success, or a failed decision email the recruiter
            must know about). Errors are never silently swallowed. */}
        {toast && (
          <div
            className={`mb-6 p-3 rounded-2xl text-sm border ${
              toast.kind === 'success'
                ? 'bg-green-500/10 border-green-500/30 text-green-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {toast.text}
          </div>
        )}

        {error && !loading && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">{error}</div>}

        {/* Bulk decisions: only undecided interviews are selectable, and the
            action asks for confirmation because it is final (one email each). */}
        {!loading && selectableResults.length > 0 && (
          <div className="mb-6 space-y-3">
            <BulkSelectBar
              selectedCount={selectedIds.size}
              selectableCount={selectableResults.length}
              allSelected={allSelected}
              onToggleAll={toggleSelectAll}
              onClear={() => setSelectedIds(new Set())}
            >
              <BulkActionButton
                tone="approve"
                disabled={bulkSaving}
                onClick={() => setBulkDecision('selected')}
              >
                Approve Selected
              </BulkActionButton>
              <BulkActionButton
                tone="reject"
                disabled={bulkSaving}
                onClick={() => setBulkDecision('rejected')}
              >
                Reject Selected
              </BulkActionButton>
            </BulkSelectBar>

            {bulkDecision && selectedIds.size > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <span
                  className={`text-xs font-medium ${
                    bulkDecision === 'selected' ? 'text-green-300' : 'text-red-300'
                  }`}
                >
                  {bulkDecision === 'selected'
                    ? `Select all ${selectedIds.size} selected candidate${selectedIds.size === 1 ? '' : 's'}?`
                    : `Reject all ${selectedIds.size} selected candidate${selectedIds.size === 1 ? '' : 's'}?`}
                </span>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <button
                    onClick={handleBulkDecide}
                    disabled={bulkSaving}
                    className={`text-[11px] font-semibold text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                      bulkDecision === 'selected'
                        ? 'bg-green-600 hover:bg-green-500'
                        : 'bg-red-600 hover:bg-red-500'
                    }`}
                  >
                    {bulkSaving ? 'Saving…' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setBulkDecision(null)}
                    disabled={bulkSaving}
                    className="text-[11px] font-medium text-gray-300 border border-white/15 hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[1,2,3].map((i) => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse"><div className="h-4 bg-white/10 rounded w-1/3 mb-2" /><div className="h-3 bg-white/10 rounded w-1/2" /></div>)}
          </div>
        ) : results.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center"><p className="text-gray-500 text-sm">No completed interviews yet.</p></div>
        ) : (
          <div className="space-y-4">
            {results.map((r) => {
              const decision = normalizeFinalDecision(r.final_decision);
              const badge = finalDecisionStatus(r.final_decision);
              const isSaving = savingId === r.application_id;
              const isConfirming = confirming?.id === r.application_id;
              return (
                <div key={r.application_id} className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {!decision ? (
                      <RowCheckbox
                        checked={selectedIds.has(r.application_id)}
                        onChange={(checked) => toggleSelected(r.application_id, checked)}
                        label={`Select ${r.full_name}`}
                      />
                    ) : (
                      /* Decided rows keep the same indentation without a checkbox. */
                      <span className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <div className="h-10 w-10 rounded-full bg-coral-500/20 border border-coral-500/30 flex items-center justify-center text-coral-400 font-bold text-sm shrink-0">
                      {getInitials(r.full_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{r.job_title}</p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2 shrink-0">
                    {/* Stored outcome — the backend value, never a frontend guess. */}
                    {decision && badge && (
                      <div className="flex items-center gap-2">
                        <StatusBadge status={badge} />
                        <span className="text-[11px] text-gray-500">
                          {finalDecisionSourceLabel(r.final_decision_source)}
                          {typeof r.final_decision_score === 'number' && ` · ${r.final_decision_score}%`}
                        </span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setSelectedId(r.application_id)}
                        className="shrink-0 text-[11px] font-medium text-primary-light hover:text-white border border-primary/30 hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors"
                      >
                        View Report
                      </button>

                      {/* Undecided: offer the decision, but only after an explicit
                          confirmation (the candidate is emailed and it is final). */}
                      {!decision && !isConfirming && (
                        <>
                          <button
                            onClick={() => setConfirming({ id: r.application_id, decision: 'selected' })}
                            disabled={isSaving}
                            className="text-[11px] font-semibold text-white bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setConfirming({ id: r.application_id, decision: 'rejected' })}
                            disabled={isSaving}
                            className="text-[11px] font-semibold text-white bg-red-600 hover:bg-red-500 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}

                      {!decision && isConfirming && confirming && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-[11px] font-medium ${
                              confirming.decision === 'selected' ? 'text-green-300' : 'text-red-300'
                            }`}
                          >
                            {confirming.decision === 'selected' ? 'Select this candidate?' : 'Reject this candidate?'}
                          </span>
                          <button
                            onClick={() => handleDecide(r.application_id, confirming.decision)}
                            disabled={isSaving}
                            className={`text-[11px] font-semibold text-white px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 ${
                              confirming.decision === 'selected'
                                ? 'bg-green-600 hover:bg-green-500'
                                : 'bg-red-600 hover:bg-red-500'
                            }`}
                          >
                            {isSaving ? 'Saving…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirming(null)}
                            disabled={isSaving}
                            className="text-[11px] font-medium text-gray-300 border border-white/15 hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </HrLayout>

    {selectedId && session && (
      <InterviewDetailModal
        applicationId={selectedId}
        hrId={session.hr_id}
        decision={decidedId}
        onDecide={handleDecide}
        onClose={() => setSelectedId(null)}
      />
    )}
    </>
  );
}