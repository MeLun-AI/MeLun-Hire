import { useMemo, useState } from 'react';
import type { HrInterviewReportData, HrRoundDetail } from '../../services/applications';

/* ------------------------------------------------------------------ */
/*  Shared HR interview-report insights                                */
/*  Used by BOTH the Interview Report page and the Interview Results    */
/*  candidate modal so the brief insights and the collapsible           */
/*  "View Interview Answers" section behave consistently.               */
/*                                                                      */
/*  Only the candidate's REAL report data is shown — no questions or     */
/*  answers are invented. Missing data is labelled clearly.             */
/* ------------------------------------------------------------------ */

/** One answerable item, flattened from the report's rounds. */
export interface InterviewAnswerItem {
  round: string;
  questionNumber: number;
  answer: string;
  scorePercent: number;
  technical: number;
  problemSolving: number;
  communication: number;
  confidence: number;
  summary: string;
  strengths: string[];
  improvements: string[];
}

/* The stored answer is normally a plain string. Newer submissions may store
   an object ({ question, answer }); read the real value in that case. An
   answer is never fabricated — unknown shapes fall back to an empty string. */
function answerText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'answer' in value) {
    const inner = (value as { answer?: unknown }).answer;
    if (typeof inner === 'string') return inner;
  }
  return '';
}

export function collectAnswerItems(rounds?: Record<string, HrRoundDetail> | null): InterviewAnswerItem[] {
  return Object.values(rounds || {}).flatMap((round) =>
    (round.questions || []).map((q) => ({
      round: round.label,
      questionNumber: q.question_number,
      answer: answerText(q.answer),
      scorePercent: q.score_percent,
      technical: q.technical_accuracy,
      problemSolving: q.problem_solving,
      communication: q.communication,
      confidence: q.confidence,
      summary: q.summary || '',
      strengths: q.strengths || [],
      improvements: q.improvements || [],
    }))
  );
}

function uniqueStrings(lists: string[][], limit = 6): string[] {
  const out: string[] = [];
  lists.forEach((list) => {
    (list || []).forEach((raw) => {
      const text = (raw || '').trim();
      if (text && !out.includes(text)) out.push(text);
    });
  });
  return out.slice(0, limit);
}

export function collectStrengths(items: InterviewAnswerItem[]): string[] {
  return uniqueStrings(items.map((item) => item.strengths));
}

export function collectWeaknesses(items: InterviewAnswerItem[], fallback?: string): string[] {
  const weaknesses = uniqueStrings(items.map((item) => item.improvements));
  if (weaknesses.length === 0 && fallback) return [fallback];
  return weaknesses;
}

function scoreColor(percent: number): string {
  return percent >= 80 ? '#22c55e' : percent >= 60 ? '#f59e0b' : '#ef4444';
}

const NOT_AVAILABLE = 'Not available for this interview';


/* ------------------------------------------------------------------ */
/*  Small building blocks                                              */
/* ------------------------------------------------------------------ */

function InsightCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ChipList({ items, tone }: { items: string[]; tone: 'green' | 'orange' }) {
  const toneClass =
    tone === 'green'
      ? 'bg-green-500/10 border-green-500/20 text-green-400'
      : 'bg-orange-500/10 border-orange-500/20 text-orange-300';
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((text) => (
        <span key={text} className={`text-[11px] px-2 py-0.5 rounded-full border ${toneClass}`}>
          {text}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Brief insights — shown by default, before any answers are opened    */
/* ------------------------------------------------------------------ */

export function InterviewBriefInsights({ report }: { report: HrInterviewReportData }) {
  const items = useMemo(() => collectAnswerItems(report.rounds), [report.rounds]);
  const strengths = useMemo(() => collectStrengths(items), [items]);
  const weaknesses = useMemo(
    () => collectWeaknesses(items, report.primary_improvement_area),
    [items, report.primary_improvement_area]
  );
  const summary = report.reliability_note;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <InsightCard title="Performance Summary">
        <p className="text-sm text-gray-300">{summary || NOT_AVAILABLE}</p>
      </InsightCard>
      <InsightCard title="Key Strengths">
        {strengths.length > 0 ? (
          <ChipList items={strengths} tone="green" />
        ) : (
          <p className="text-sm text-gray-500">{NOT_AVAILABLE}</p>
        )}
      </InsightCard>
      <InsightCard title="Key Weaknesses">
        {weaknesses.length > 0 ? (
          <ChipList items={weaknesses} tone="orange" />
        ) : (
          <p className="text-sm text-gray-500">{NOT_AVAILABLE}</p>
        )}
      </InsightCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Collapsible interview answers                                      */
/*  The Q&A is only rendered when HR opens it — nothing is dumped by    */
/*  default and no extra API call is made (the data is already loaded). */
/* ------------------------------------------------------------------ */

export function InterviewAnswersToggle({ report }: { report: HrInterviewReportData }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => collectAnswerItems(report.rounds), [report.rounds]);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left text-sm font-semibold text-white hover:bg-white/[0.03] transition-colors"
      >
        {open ? 'Hide Interview Answers' : 'View Interview Answers'}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-gray-500">No interview questions and answers are available for this report.</p>
          ) : (
            items.map((item) => (
              <div key={`${item.round}-${item.questionNumber}`} className="bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">
                    {item.round} · Question {item.questionNumber}
                  </p>
                  <span className="text-xs font-bold" style={{ color: scoreColor(item.scorePercent) }}>
                    {item.scorePercent}%
                  </span>
                </div>
                <p className="text-[11px] text-gray-500 uppercase tracking-wider mt-3 mb-1">Answer</p>
                <p className="text-sm text-white">{item.answer || 'No answer'}</p>
                {item.summary && <p className="text-sm text-gray-400 mt-2">{item.summary}</p>}
                {(item.technical > 0 || item.problemSolving > 0 || item.communication > 0 || item.confidence > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {[
                      { label: 'Technical', value: item.technical },
                      { label: 'Problem Solving', value: item.problemSolving },
                      { label: 'Communication', value: item.communication },
                      { label: 'Confidence', value: item.confidence },
                    ].map((dim) => (
                      <div key={dim.label} className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-gray-500 uppercase">{dim.label}</p>
                        <p className="text-sm font-bold text-white">{dim.value}/10</p>
                      </div>
                    ))}
                  </div>
                )}
                {(item.strengths.length > 0 || item.improvements.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.strengths.map((text) => (
                      <span key={text} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                        {text}
                      </span>
                    ))}
                    {item.improvements.map((text) => (
                      <span key={text} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300">
                        {text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

