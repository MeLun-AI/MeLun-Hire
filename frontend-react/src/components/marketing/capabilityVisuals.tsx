/* ==================================================================== */
/*  capabilityVisuals — the six compact product mock-ups shown in the     */
/*  landing page capability grid (SocialProofSection).                    */
/*                                                                        */
/*  These are POLISHED MOCK visuals in the same spirit as the other       */
/*  landing mocks: built from the existing MeLun Hire design system       */
/*  (qf-glass / qf-pill / qf-bar + the navy/primary/coral tokens) and      */
/*  purely presentational — no hooks, no data, no interaction — so the     */
/*  marketing grid stays a static preview of real product surfaces.        */
/*                                                                        */
/*  Every visual renders inside `VisualFrame`, which is exactly the same   */
/*  height in all six tiles: that keeps the 3 × 2 grid even, keeps the     */
/*  titles below aligned, and guarantees nothing overflows on mobile.      */
/* ==================================================================== */

import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Micro type scale used inside the visuals                           */
/*  (9-11px keeps every row single-line / truncating at 320px width)   */
/* ------------------------------------------------------------------ */

const MICRO_LABEL = 'text-[9px] font-semibold uppercase tracking-[0.16em] text-gray-500';
const ROW_LABEL = 'text-[10px] text-gray-400';
const ROW_VALUE = 'text-[10px] font-semibold text-white tabular-nums';

/* ------------------------------------------------------------------ */
/*  Icons — inline SVG, same stroke style as the landing page          */
/* ------------------------------------------------------------------ */

function IconDocument({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 9h3.75m-3.75 3h3.75m-6-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  );
}

function IconSpark({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
      />
    </svg>
  );
}

function IconMic({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
      />
    </svg>
  );
}

function IconClock({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconCheck({ className = 'w-3 h-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function IconChevronRight({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function IconCompare({ className = 'w-2.5 h-2.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
      />
    </svg>
  );
}


/* ------------------------------------------------------------------ */
/*  Shared primitives                                                  */
/* ------------------------------------------------------------------ */

/** Fixed-height frame: identical in all six tiles so the grid stays even.
 *  Height is set from the measured tallest visual (169px at both the
 *  1440px and 390px reference widths) plus a small safety margin. */
function VisualFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[174px] w-full flex-col justify-between overflow-hidden">{children}</div>
  );
}

/** Micro top strip: label on the left, optional status on the right. */
function VisualTopBar({
  label,
  icon,
  right,
}: {
  label: string;
  icon?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon && <span className="shrink-0 text-primary-light">{icon}</span>}
      <span className={`truncate ${MICRO_LABEL}`}>{label}</span>
      {right && <span className="ml-auto shrink-0">{right}</span>}
    </div>
  );
}

type ChipTone = 'muted' | 'violet' | 'emerald' | 'warm';

const CHIP_TONES: Record<ChipTone, string> = {
  muted: 'border-white/10 bg-white/[0.05] text-gray-400',
  violet: 'border-primary-light/30 bg-primary/15 text-violet-200',
  emerald: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
  warm: 'border-coral-400/30 bg-coral-500/10 text-coral-300',
};

/** Micro chip (self-contained, so the visuals never restyle qf-pill). */
function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-[2px] text-[9px] font-semibold leading-none ${CHIP_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Live/status dot — reuses the site's existing pulse rhythm. */
function Dot({ tone = 'emerald' }: { tone?: 'emerald' | 'violet' }) {
  const colors = { emerald: 'bg-emerald-400', violet: 'bg-primary-light' } as const;
  return (
    <span
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${colors[tone]}`}
      style={{ animation: 'qfPulse 2s ease-in-out infinite' }}
    />
  );
}

type MeterTone = 'violet' | 'blue' | 'emerald' | 'warm';

const METER_TONES: Record<MeterTone, string> = {
  violet: '',
  blue: 'qf-blue',
  emerald: 'qf-emerald',
  warm: 'qf-warm',
};

/** Compact meter — the design-system bar (qf-bar), small variant. */
function Meter({
  pct,
  tone = 'violet',
  className = '',
}: {
  pct: number;
  tone?: MeterTone;
  className?: string;
}) {
  return (
    <div className={`qf-bar qf-sm ${METER_TONES[tone]} ${className}`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ==================================================================== */
/*  1 — UNDERSTAND THE ROLE                                             */
/*  Job requirements → AI understanding → evaluation criteria            */
/* ==================================================================== */

const ROLE_CRITERIA = [
  { label: 'Technical Skills', pct: 94 },
  { label: 'Experience Match', pct: 88 },
  { label: 'Domain Knowledge', pct: 81 },
  { label: 'Behavioral Indicators', pct: 86 },
];

export function RoleAnalysisVisual() {
  return (
    <VisualFrame>
      {/* the role being evaluated + headline fit */}
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/15 text-primary-light">
          <IconDocument />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold leading-tight text-white">ML Engineer</p>
          <p className="truncate text-[9px] leading-tight text-gray-500">Job requirements · 6 signals</p>
        </div>
        <div className="ml-auto shrink-0 text-right">
          <p className="text-[9px] uppercase tracking-[0.14em] text-gray-500">Role fit</p>
          <p className="text-sm font-extrabold leading-tight qf-grad-text">91%</p>
        </div>
      </div>

      {/* how the role becomes criteria */}
      <div className="flex items-center gap-1.5">
        <Chip>
          <IconDocument className="h-2.5 w-2.5" />
          Requirements
        </Chip>
        <IconChevronRight className="h-2.5 w-2.5 shrink-0 text-gray-600" />
        <Chip tone="violet">
          <IconSpark className="h-2.5 w-2.5" />
          AI criteria
        </Chip>
      </div>

      {/* the criteria derived for this role */}
      <div className="space-y-[5px]">
        {ROLE_CRITERIA.map((c) => (
          <div key={c.label} className="flex items-center gap-2">
            <IconCheck className="h-3 w-3 shrink-0 text-emerald-400" />
            <span className={`min-w-0 flex-1 truncate ${ROW_LABEL}`}>{c.label}</span>
            <Meter pct={c.pct} tone="emerald" className="w-10 shrink-0 sm:w-14" />
            <span className={`w-5 shrink-0 text-right ${ROW_VALUE}`}>{c.pct}</span>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ==================================================================== */
/*  2 — INTERVIEW WITH CONTEXT                                          */
/*  AI interviewer + candidate exchange, captured live                   */
/* ==================================================================== */

export function InterviewContextVisual() {
  return (
    <VisualFrame>
      {/* session strip: AI interviewer + timer */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-[9px] font-bold text-white">
          AI
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold leading-tight text-white">AI Interviewer</p>
          <p className="flex items-center gap-1 text-[9px] leading-tight text-gray-500">
            <Dot />
            Role-aware · ML Engineer
          </p>
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-1.5 py-[3px]">
          <IconClock className="h-2.5 w-2.5 text-gray-400" />
          <span className="text-[9px] font-semibold text-gray-300 tabular-nums">04:12</span>
        </span>
      </div>

      {/* the exchange itself */}
      <div className="space-y-1.5">
        <div className="max-w-[92%] rounded-lg rounded-tl-sm border border-white/10 bg-white/[0.05] px-2 py-1.5">
          <p className="text-[10px] leading-snug text-gray-300">
            Tell me about a challenging project you worked on.
          </p>
        </div>
        <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-sm border border-primary/25 bg-primary/15 px-2 py-1.5">
          <p className="text-[10px] leading-snug text-gray-200">
            I led a team of 4 to build a scalable backend…
          </p>
        </div>
      </div>

      {/* answer capture: mic + waveform + live indicator */}
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary-light/30 bg-primary/15 text-primary-light">
          <IconMic />
        </span>
        <div className="flex flex-1 items-end gap-[3px]" aria-hidden="true">
          {[8, 14, 6, 12, 9, 15, 7, 11].map((h, i) => (
            <span
              key={i}
              className="w-[3px] flex-1 rounded-full bg-gradient-to-t from-primary/40 to-primary-light"
              style={{ height: `${h}px`, animation: `qfPulse ${1.6 + i * 0.12}s ease-in-out infinite` }}
            />
          ))}
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[9px] font-semibold text-emerald-300">
          <Dot />
          Capturing
        </span>
      </div>
    </VisualFrame>
  );
}

/* ==================================================================== */
/*  3 — SURFACE STRONG FITS                                             */
/*  AI-ranked shortlist (fictional candidates)                          */
/* ==================================================================== */

const SHORTLIST = [
  { initials: 'AM', name: 'Arjun Mehta', role: 'Frontend Developer', match: 96, label: 'Strong match' },
  { initials: 'PS', name: 'Priya Sharma', role: 'Frontend Developer', match: 88, label: 'Good match' },
  { initials: 'RV', name: 'Rohan Verma', role: 'Frontend Developer', match: 82, label: 'Good match' },
];

export function CandidateMatchVisual() {
  return (
    <VisualFrame>
      <VisualTopBar
        label="AI ranked shortlist"
        icon={<IconSpark />}
        right={<Chip tone="violet">3 candidates</Chip>}
      />

      <div className="space-y-[5px]">
        {SHORTLIST.map((c, i) => {
          const strong = c.match >= 90;
          return (
            <div key={c.name} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 shrink-0 text-[9px] font-bold text-gray-500 tabular-nums">
                  {i + 1}
                </span>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-[9px] font-bold text-white">
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold leading-tight text-white">
                    {c.name}
                  </span>
                  <span className="block truncate text-[9px] leading-tight text-gray-500">{c.role}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span
                    className={`block text-[11px] font-bold leading-tight tabular-nums ${
                      strong ? 'qf-grad-text' : 'text-gray-200'
                    }`}
                  >
                    {c.match}%
                  </span>
                  <span
                    className={`block text-[9px] leading-tight ${
                      strong ? 'text-emerald-300/90' : 'text-gray-500'
                    }`}
                  >
                    {c.label}
                  </span>
                </span>
              </div>
              <Meter pct={c.match} tone="emerald" className="mt-[3px]" />
            </div>
          );
        })}
      </div>
    </VisualFrame>
  );
}
/* ==================================================================== */
/*  4 — EVALUATE CANDIDATES                                             */
/*  Structured skill / experience breakdown                             */
/* ==================================================================== */

const EVALUATION_TABS = ['Skills', 'Experience', 'Domain'];

const EVALUATION_METRICS = [
  { label: 'Problem Solving', value: 9.2 },
  { label: 'Communication', value: 8.1 },
  { label: 'System Design', value: 7.8 },
  { label: 'Team Collaboration', value: 8.5 },
];

export function CandidateEvaluationVisual() {
  return (
    <VisualFrame>
      <VisualTopBar
        label="Candidate evaluation"
        icon={<IconCheck />}
        right={<Chip>ML Engineer</Chip>}
      />

      {/* scored dimensions */}
      <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.04] p-[3px]">
        {EVALUATION_TABS.map((t) => (
          <span
            key={t}
            className={`flex-1 rounded-md px-1.5 py-1 text-center text-[9px] font-semibold ${
              t === 'Skills'
                ? 'border border-primary-light/30 bg-primary/25 text-white'
                : 'text-gray-500'
            }`}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="space-y-[6px]">
        {EVALUATION_METRICS.map((m) => (
          <div key={m.label}>
            <div className="flex items-center justify-between gap-2">
              <span className={`truncate ${ROW_LABEL}`}>{m.label}</span>
              <span className={`shrink-0 ${ROW_VALUE}`}>{m.value.toFixed(1)}</span>
            </div>
            <Meter pct={m.value * 10} className="mt-1" />
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}

/* ==================================================================== */
/*  5 — EMPOWER APPLICANTS                                              */
/*  The candidate's own application journey (vertical progress)          */
/* ==================================================================== */

type JourneyState = 'done' | 'current' | 'todo';

const JOURNEY: { mark: string; label: string; hint: string; state: JourneyState }[] = [
  { mark: '✓', label: 'Apply for Job', hint: 'Application submitted', state: 'done' },
  { mark: '✓', label: 'AI Evaluation', hint: 'Profile under review', state: 'done' },
  { mark: '●', label: 'Interview', hint: 'Complete your interview', state: 'current' },
  { mark: '○', label: 'Results', hint: 'Get your personalized feedback', state: 'todo' },
];

const JOURNEY_MARKS: Record<JourneyState, string> = {
  done: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300',
  current: 'border-primary-light/50 bg-primary/25 text-white',
  todo: 'border-white/15 bg-white/[0.03] text-gray-500',
};

export function ApplicantJourneyVisual() {
  return (
    <VisualFrame>
      <VisualTopBar
        label="Application journey"
        icon={<IconDocument />}
        right={
          <Chip tone="violet">
            <Dot tone="violet" />
            In progress
          </Chip>
        }
      />

      <div>
        {JOURNEY.map((s, i) => (
          <div key={s.label} className="relative flex gap-2.5">
            {/* connector to the next step */}
            {i < JOURNEY.length - 1 && (
              <span className="absolute left-[7px] top-[15px] h-[calc(100%-15px)] w-px bg-white/10" />
            )}
            <span
              className={`relative z-10 mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border text-[9px] font-bold leading-none ${JOURNEY_MARKS[s.state]}`}
            >
              {s.mark}
            </span>
            <div className="min-w-0 flex-1 pb-2.5">
              <p
                className={`truncate text-[10px] font-semibold leading-tight ${
                  s.state === 'todo' ? 'text-gray-400' : 'text-white'
                }`}
              >
                {s.label}
              </p>
              <p className="truncate text-[9px] leading-tight text-gray-500">{s.hint}</p>
            </div>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}


/* ==================================================================== */
/*  6 — MAKE BETTER DECISIONS                                           */
/*  Evidence-based side-by-side candidate comparison                     */
/* ==================================================================== */

type ComparisonTone = Extract<MeterTone, 'blue' | 'violet' | 'emerald'>;

const COMPARISON_CANDIDATES: { key: string; tone: ComparisonTone }[] = [
  { key: 'A', tone: 'blue' },
  { key: 'B', tone: 'violet' },
  { key: 'C', tone: 'emerald' },
];

const COMPARISON_DOTS: Record<ComparisonTone, string> = {
  blue: 'bg-[#3b82f6]',
  violet: 'bg-[#a78bfa]',
  emerald: 'bg-emerald-400',
};

const COMPARISON_METRICS: { label: string; values: number[] }[] = [
  { label: 'Technical Fit', values: [92, 84, 76] },
  { label: 'Cultural Fit', values: [86, 90, 72] },
  { label: 'Growth Potential', values: [88, 94, 70] },
  { label: 'Overall Match', values: [91, 88, 74] },
];

export function DecisionComparisonVisual() {
  return (
    <VisualFrame>
      <div className="flex items-center gap-1.5">
        <span className={`truncate ${MICRO_LABEL}`}>Candidate comparison</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-primary-light/30 bg-primary/15 px-1.5 py-[2px] text-[9px] font-semibold leading-none text-violet-200">
          <IconCompare />
          Compare
        </span>
      </div>

      {/* legend — which bar belongs to which candidate */}
      <div className="flex items-center gap-3">
        {COMPARISON_CANDIDATES.map((c) => (
          <span key={c.key} className="flex items-center gap-1 text-[9px] font-semibold text-gray-400">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COMPARISON_DOTS[c.tone]}`} />
            Candidate {c.key}
          </span>
        ))}
      </div>

      {/* evidence lines across the shortlist */}
      <div className="space-y-[6px]">
        {COMPARISON_METRICS.map((m) => (
          <div key={m.label} className="flex items-center gap-2">
            <span className="w-[72px] shrink-0 truncate text-[9px] text-gray-500 sm:w-[88px]">
              {m.label}
            </span>
            <div className="min-w-0 flex-1 space-y-[2px]">
              {m.values.map((v, i) => (
                <Meter key={i} pct={v} tone={COMPARISON_CANDIDATES[i].tone} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </VisualFrame>
  );
}


