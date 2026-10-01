/* ------------------------------------------------------------------ */
/*  Shared helpers for the HR Talent Arena experience pages.           */
/*                                                                     */
/*  Keeps session handling, evidence rendering and common UI blocks    */
/*  in one place so each experience page stays focused on its flow.    */
/* ------------------------------------------------------------------ */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertIcon } from '../../components/hr/HrIcons';
import type { QunoEvidence, SkillFit, TalentCandidate } from '../../services/talentArena';

/* ================================================================== */
/*  HR session                                                         */
/* ================================================================== */

export interface HrSessionInfo {
  hrId: number;
  hrName: string;
  companyName: string;
}

/** Reads the existing `quno_hr_session` and redirects when missing. */
export function useHrSession(): HrSessionInfo | null {
  const navigate = useNavigate();
  const [session, setSession] = useState<HrSessionInfo | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) {
      navigate('/hr/login', { replace: true });
      return;
    }
    try {
      const s = JSON.parse(raw) as { hr_id?: number; hr_name?: string; company_name?: string };
      if (!s.hr_id) {
        navigate('/hr/login', { replace: true });
        return;
      }
      setSession({
        hrId: s.hr_id,
        hrName: s.hr_name ?? 'HR',
        companyName: s.company_name ?? '',
      });
    } catch {
      navigate('/hr/login', { replace: true });
    }
  }, [navigate]);

  return session;
}

/* ================================================================== */
/*  Page shell                                                         */
/* ================================================================== */

export function TalentArenaPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-5">
      {/* Every individual experience links back to the Talent Arena catalog. */}
      <button
        type="button"
        onClick={() => navigate('/hr/talent-arena')}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-primary-light bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-3.5 py-2 transition-colors"
        aria-label="Back to Talent Arena"
      >
        <span aria-hidden="true">←</span> Back to Talent Arena
      </button>
      <header>
        <p className="text-[11px] uppercase tracking-widest text-primary-light font-semibold">Talent Arena</p>
        <h1 className="text-xl md:text-2xl font-extrabold text-white mt-1">{title}</h1>
        <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

/* ================================================================== */
/*  Balanced two-column game layout                                    */
/* ================================================================== */

/** Balanced two-column shell for game pages.
 *
 *  - `items-start` so a short column never stretches to the tall one.
 *  - Stacks to one column below `lg`.
 *  - Optional `aside` mode renders a narrower sticky rail (picker /
 *    summary) beside a wider main column — use when one side is a long
 *    list and the other holds actions/results.
 */
export function ArenaSplit({
  aside,
  main,
  asidePosition = 'left',
  asideWidth = '320px',
}: {
  aside: React.ReactNode;
  main: React.ReactNode;
  asidePosition?: 'left' | 'right';
  asideWidth?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 gap-4 lg:gap-5 items-start w-full ${
        asidePosition === 'left'
          ? 'lg:grid-cols-[var(--arena-aside)_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_var(--arena-aside)]'
      }`}
      style={{ ['--arena-aside' as never]: asideWidth }}
    >
      {asidePosition === 'left' ? (
        <>
          <div className="min-w-0 lg:sticky lg:top-4 self-start space-y-4">{aside}</div>
          <div className="min-w-0 space-y-4">{main}</div>
        </>
      ) : (
        <>
          <div className="min-w-0 space-y-4">{main}</div>
          <div className="min-w-0 lg:sticky lg:top-4 self-start space-y-4">{aside}</div>
        </>
      )}
    </div>
  );
}

/** Scroll-bounded card list — keeps very long pickers/evidence lists from
 *  unbalancing the page. Renders its children in a card with an internal
 *  scroll once content exceeds `maxHeight`. */
export function ArenaScrollCard({
  title,
  count,
  children,
  maxHeight = 520,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  maxHeight?: number;
}) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">{title}</p>
        {typeof count === 'number' && (
          <span className="text-[11px] text-gray-500 tabular-nums">{count}</span>
        )}
      </div>
      <div className="arena-scroll-list space-y-2 pr-1" style={{ maxHeight }}>
        {children}
      </div>
    </section>
  );
}

/* ================================================================== */
/*  Error / empty / loading states                                     */
/* ================================================================== */

export function ArenaError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 text-center">
      <AlertIcon className="w-8 h-8 mx-auto text-red-400" />
      <p className="text-sm text-red-300 mt-2">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2 px-4 rounded-xl transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function ArenaEmpty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
      <p className="text-gray-300 font-semibold">{title}</p>
      {hint && <p className="text-gray-500 text-sm mt-1">{hint}</p>}
    </div>
  );
}

export function ArenaSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-44 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
      ))}
    </div>
  );
}

/* ================================================================== */
/*  Evidence rendering (shared by Detective / Blind / Face-Off)        */
/* ================================================================== */

const LEVEL_STYLES: Record<string, string> = {
  'Very Strong': 'bg-green-500/15 text-green-300 border-green-500/30',
  Strong: 'bg-primary/15 text-primary-light border-primary/40',
  Moderate: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30',
  Developing: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  'No assessment evidence': 'bg-white/5 text-gray-400 border-white/10',
};

export function LevelBadge({ level }: { level: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${LEVEL_STYLES[level] ?? LEVEL_STYLES['No assessment evidence']}`}>
      {level}
    </span>
  );
}

/** MeLun Evidence block — the applicant's real Career Quest signals. */
export function QunoEvidenceBlock({ candidate }: { candidate: TalentCandidate }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-4">
        MeLun Evidence — Career Quest signals
      </h3>
      {candidate.quno_evidence.length === 0 ? (
        <p className="text-sm text-gray-500">
          No Career Quest evidence yet. Send this candidate a challenge to collect real skill signals.
        </p>
      ) : (
        <div className="space-y-3">
          {candidate.quno_evidence.map((e: QunoEvidence) => (
            <div key={e.skill} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{e.skill}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {e.sources.map((s) => s.source || s.type).filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-primary-light tabular-nums">{e.value}</span>
                <LevelBadge level={e.level} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-gray-600 mt-4">
        Completed challenges: {candidate.assessment.completed} · Average score: {candidate.assessment.avg_score || '—'}
      </p>
    </div>
  );
}

/** Role-compatibility block — evidence mapped to the job requirements. */
export function RoleFitBlock({ candidate }: { candidate: TalentCandidate }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Role Fit — {candidate.job_title}</h3>
        <span className="text-sm font-bold text-primary-light">{candidate.fit.score}%</span>
      </div>
      <div className="space-y-3">
        {candidate.fit.per_skill.length === 0 ? (
          <p className="text-sm text-gray-500">This job has no required skills defined yet.</p>
        ) : (
          candidate.fit.per_skill.map((s: SkillFit) => (
            <div key={s.skill} className="flex items-center justify-between gap-3">
              <p className="text-sm text-white">{s.skill}</p>
              <div className="flex items-center gap-2">
                {s.declared && <span className="text-[11px] text-gray-500 border border-white/10 px-2 py-0.5 rounded-full">declared</span>}
                <LevelBadge level={s.level} />
                {s.signal ? (
                  <span className="text-xs text-primary-light font-bold tabular-nums w-7 text-right">{s.signal}</span>
                ) : (
                  <span className="text-xs text-gray-600 w-7 text-right">—</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Candidate picker (accessible list, keyboard-friendly)              */
/* ================================================================== */

export function CandidatePicker({
  candidates,
  selectedId,
  onSelect,
  label = 'Select a candidate',
}: {
  candidates: TalentCandidate[];
  selectedId: number | null;
  onSelect: (c: TalentCandidate) => void;
  label?: string;
}) {
  if (candidates.length === 0) {
    return <ArenaEmpty title="No candidates yet" hint="Candidates appear here once applicants apply to your job posts." />;
  }
  return (
    <div className="space-y-2" role="listbox" aria-label={label}>
      {candidates.map((c) => {
        const active = c.application_id === selectedId;
        return (
          <button
            key={c.application_id}
            onClick={() => onSelect(c)}
            aria-selected={active}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
              active ? 'bg-primary/15 border-primary/50' : 'bg-white/[0.03] border-white/10 hover:bg-white/[0.06]'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{c.full_name}</p>
              <p className="text-[11px] text-gray-500 truncate">
                {c.job_title} · {c.skills.slice(0, 3).join(', ') || 'No skills listed'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-gray-500">fit {c.fit.score}%</span>
              {c.assessment.completed > 0 && (
                <span className="text-[11px] text-primary-light">
                  {c.assessment.completed} challenge{c.assessment.completed > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Shared option lists                                                */
/* ================================================================== */

export const EVALUATION_OPTIONS = ['Strong Hire', 'Consider', 'Weak Fit', 'Need More Evidence'] as const;
export const CONFIDENCE_OPTIONS = ['High', 'Medium', 'Low'] as const;
export const VOTE_OPTIONS = ['Move Forward', 'Hold', 'Reject', 'Need More Evidence'] as const;
