import { motion } from 'framer-motion';
import { useState } from 'react';
import { AppIcon } from '../applicant/ApplicantIcons';
import type {
  ChallengeQuestion,
  SubmitResult,
  TaskAnswerInput,
} from '../../services/careerQuest';

/* ------------------------------------------------------------------ */
/*  RankableOrder helper for the ranking interaction                    */
/* ------------------------------------------------------------------ */

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/* ------------------------------------------------------------------ */
/*  QuestionRenderer — one question, any supported type.                */
/* ------------------------------------------------------------------ */

function DataChart({ dataset }: { dataset: NonNullable<ChallengeQuestion['dataset']> }) {
  const max = Math.max(...dataset.values, 1);
  return (
    <div className="rounded-xl bg-navy-900/60 border border-white/10 p-4 mb-1">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">{dataset.title}</p>
      <div className="flex items-end gap-1.5 mt-3 h-28">
        {dataset.values.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <span className="text-[10px] text-gray-400 font-semibold">{v}</span>
            <div
              className="w-full rounded-t-md bg-gradient-to-t from-primary/60 to-primary-light/90"
              style={{ height: `${Math.max(6, (v / max) * 88)}px` }}
              title={`${dataset.columns[i]}: ${v} ${dataset.unit ?? ''}`}
            />
            <span className="text-[9px] text-gray-600">{dataset.columns[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpenTextRenderer({
  question,
  answer,
  onAnswer,
}: {
  question: ChallengeQuestion;
  answer: unknown;
  onAnswer: (answer: unknown) => void;
}) {
  const text = typeof answer === 'string' ? answer : '';
  const min = question.min_length ?? 40;
  return (
    <div className="space-y-3">
      {question.rubric && question.rubric.length > 0 && (
        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">How this is scored (visible rubric)</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {question.rubric.map((r) => (
              <span key={r.label} className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/25">{r.label}</span>
            ))}
          </div>
        </div>
      )}
      <textarea
        value={text}
        onChange={(e) => onAnswer(e.target.value)}
        rows={5}
        placeholder="Write your answer here..."
        className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:outline-none focus:border-primary/50"
      />
      <p className={`text-[11px] ${text.trim().length >= min ? 'text-green-400' : 'text-gray-500'}`}>
        {text.trim().length}/{min} min characters{text.trim().length >= min ? ' - ready' : ' - keep writing'}
      </p>
    </div>
  );
}

function RuleShiftRenderer({
  question,
  answer,
  onAnswer,
}: {
  question: ChallengeQuestion;
  answer: unknown;
  onAnswer: (answer: unknown) => void;
}) {
  const cases = question.cases ?? [];
  const buckets = question.buckets ?? [];
  const chosen: string[] = Array.isArray(answer) ? (answer as string[]) : cases.map(() => '');
  return (
    <div className="space-y-3">
      {question.rule && (
        <div className="rounded-xl bg-amber-400/10 border border-amber-400/30 px-4 py-3 text-sm text-amber-200">
          {question.rule}
        </div>
      )}
      {cases.map((c, i) => (
        <div key={c.item} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
          <span className="text-sm text-white font-medium flex-1 min-w-0">{c.item}</span>
          <div className="flex gap-2">
            {buckets.map((b) => (
              <button
                key={b}
                onClick={() => {
                  const next = [...chosen];
                  while (next.length < cases.length) next.push('');
                  next[i] = b;
                  onAnswer(next);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  chosen[i] === b ? 'bg-primary text-white border-primary' : 'bg-white/5 text-gray-300 border-white/15 hover:border-white/30'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-gray-600">
        Sorted {chosen.filter(Boolean).length} / {cases.length}
      </p>
    </div>
  );
}

function QuestionRenderer({
  question,
  answer,
  onAnswer,
}: {
  question: ChallengeQuestion;
  answer: unknown;
  onAnswer: (answer: unknown) => void;
}) {
  const type = question.type;

  if (type === 'multiple_choice' || type === 'scenario' || type === 'data' || type === 'technical') {
    const chosen = typeof answer === 'number' ? answer : null;
    return (
      <div className="space-y-3">
        {type === 'data' && question.dataset && <DataChart dataset={question.dataset} />}
        {(question.options ?? []).map((opt, i) => (
          <button
            key={i}
            onClick={() => onAnswer(i)}
            className={`w-full text-left px-4 py-3 rounded-xl border text-sm text-gray-200 transition-all ${
              chosen === i ? 'bg-primary/15 border-primary/40 text-white' : 'bg-white/5 border-white/10 hover:border-white/25'
            }`}
          >
            <span className="flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] ${
                chosen === i ? 'bg-primary text-white border-primary' : 'border-white/20 text-gray-500'
              }`}>{String.fromCharCode(65 + i)}</span>
              {opt}
            </span>
          </button>
        ))}
      </div>
    );
  }

  if (type === 'open_text') {
    return <OpenTextRenderer question={question} answer={answer} onAnswer={onAnswer} />;
  }

  if (type === 'rule_shift') {
    return <RuleShiftRenderer question={question} answer={answer} onAnswer={onAnswer} />;
  }

  if (type === 'ranking') {
    const items = question.items ?? [];
    const order = Array.isArray(answer) && answer.length === items.length
      ? (answer as string[])
      : items.map((it) => it.id);
    return (
      <div className="space-y-2">
        <p className="text-[11px] text-gray-600 mb-1">Re-order items with the arrows (top = highest priority).</p>
        {order.map((id, pos) => {
          const label = items.find((it) => it.id === id)?.label ?? id;
          return (
            <div key={id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-200">
              <span className="w-6 h-6 rounded-full bg-primary/15 text-primary-light text-[11px] font-bold flex items-center justify-center shrink-0">{pos + 1}</span>
              <span className="flex-1 min-w-0 truncate">{label}</span>
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  disabled={pos === 0}
                  aria-label="Move up"
                  onClick={() => onAnswer(moveItem(order, pos, pos - 1))}
                  className="w-7 h-6 flex items-center justify-center text-gray-400 hover:text-white bg-white/5 rounded disabled:opacity-40"
                ><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 19L5 6L19 6" /></svg></button>
                <button
                  disabled={pos === order.length - 1}
                  aria-label="Move down"
                  onClick={() => onAnswer(moveItem(order, pos, pos + 1))}
                  className="w-7 h-6 flex items-center justify-center text-gray-400 hover:text-white bg-white/5 rounded disabled:opacity-40"
                ><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 5L19 18L5 18" /></svg></button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (type === 'matching') {
    const pairs = question.pairs ?? [];
    const chosen = (answer && typeof answer === 'object') ? (answer as Record<string, string>) : {};
    const rightOptions = pairs.map((p) => p.right);
    return (
      <div className="space-y-2.5">
        <p className="text-[11px] text-gray-600 mb-1">Select the matching term for each label.</p>
        {pairs.map((p) => (
          <div key={p.left} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <span className="text-sm text-white font-medium flex-1 min-w-0">{p.left}</span>
            <span className="text-gray-600">→</span>
            <select
              value={chosen[p.left] ?? ''}
              onChange={(e) => onAnswer({ ...chosen, [p.left]: e.target.value })}
              className="bg-navy-800 border border-white/10 rounded-lg text-sm text-gray-200 px-2 py-1.5"
            >
              <option value="">Select…</option>
              {rightOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  ChallengeEngine — full gameplay flow (intro handled by caller).     */
/* ------------------------------------------------------------------ */
export function ChallengeEngine({
  title,
  category,
  questions,
  onCancel,
  onSubmit,
}: {
  title: string;
  category: string;
  questions: ChallengeQuestion[];
  onCancel: () => void;
  onSubmit: (answers: TaskAnswerInput[]) => void;
}) {
  const total = questions.length;
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [startedAt] = useState(() => Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState(() => Date.now());
  const [perQuestionMs, setPerQuestionMs] = useState<Record<number, number>>({});

  const question = questions[current];
  const isLast = current === total - 1;

  const isAnswered = (q: ChallengeQuestion, a: unknown): boolean => {
    if (a === undefined || a === null) return false;
    if (q.type === 'open_text') return typeof a === 'string' && a.trim().length > 0;
    if (q.type === 'rule_shift') {
      const cases = q.cases ?? [];
      return Array.isArray(a) && (a as string[]).filter(Boolean).length === cases.length;
    }
    if (q.type === 'matching') {
      const pairs = q.pairs ?? [];
      if (typeof a !== 'object' || Array.isArray(a)) return false;
      return pairs.every((p) => Boolean((a as Record<string, string>)[p.left]));
    }
    if (q.type === 'ranking') return Array.isArray(a) && (a as unknown[]).length === (q.items ?? []).length;
    return true;
  };
  const hasCurrentAnswer = isAnswered(question, answers[current]);
  const answeredCount = questions.filter((q, i) => isAnswered(q, answers[i])).length;

  const stampTime = (idx: number) => {
    const now = Date.now();
    setPerQuestionMs((prev) => ({ ...prev, [idx]: (prev[idx] ?? 0) + (now - questionStartedAt) }));
    setQuestionStartedAt(now);
  };
  const handleAnswer = (answer: unknown) => setAnswers((prev) => ({ ...prev, [current]: answer }));
  const gotoQuestion = (idx: number) => { stampTime(current); setCurrent(idx); setQuestionStartedAt(Date.now()); };
  const handleBack = () => { if (current > 0) gotoQuestion(current - 1); };
  const handleNext = () => { if (current < total - 1) gotoQuestion(current + 1); };

  const handleSubmit = () => {
    stampTime(current);
    const now = Date.now();
    const finalTimes: Record<number, number> = { ...perQuestionMs, [current]: (perQuestionMs[current] ?? 0) + (now - questionStartedAt) };
    const input: TaskAnswerInput[] = Object.keys(answers).map((k) => ({
      task_index: Number(k),
      answer: answers[Number(k)],
      time_ms: finalTimes[Number(k)] ?? undefined,
    }));
    void startedAt;
    onSubmit(input);
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      {/* progress + task navigator share one header band so they read as one unit */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-white/5">
        <span className="text-xs font-bold text-primary-light">{current + 1} / {total}</span>
        <span className="text-[11px] uppercase tracking-wider text-gray-500 truncate">{title}</span>
        <span className="text-[11px] text-gray-600">{category}</span>
      </div>

      {/* progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mx-5 mt-3">
        <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${((current + 1) / total) * 100}%` }} transition={{ duration: 0.3 }} />
      </div>

      {/* question + task navigator share one body band so they read as one unit */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_200px] gap-4 px-5 py-4 items-start">
        <div className="min-w-0">
          {question.kind && (
            <span className="inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20 mb-2">
              {question.kind.replace(/-/g, ' ')}
            </span>
          )}
          <p className="text-sm font-semibold text-white">{question.prompt}</p>
          <p className="text-[11px] text-gray-600 mt-1">
            Task {current + 1} · {question.points} points · Answered {answeredCount}/{total}
          </p>

          <div className="mt-4">
            <QuestionRenderer question={question} answer={answers[current]} onAnswer={handleAnswer} />
          </div>
        </div>

        {/* task navigator rail — beside the question on desktop, below it on mobile */}
        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 self-start lg:sticky lg:top-2">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Tasks · {answeredCount}/{total}</p>
          <div className="flex lg:grid lg:grid-cols-4 flex-wrap gap-1.5 mt-2">
            {questions.map((q, i) => (
              <button
                key={i}
                onClick={() => gotoQuestion(i)}
                aria-label={`Go to task ${i + 1}`}
                title={`Task ${i + 1}${isAnswered(q, answers[i]) ? ' (answered)' : ''}`}
                className={`h-8 rounded-lg text-[11px] font-bold transition-all border ${
                  i === current
                    ? 'bg-primary text-white border-primary'
                    : isAnswered(q, answers[i])
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* nav */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-white/5">
        <button
          onClick={current === 0 ? onCancel : handleBack}
          className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 px-4 rounded-xl transition-all"
        >
          {current === 0 ? 'Cancel' : 'Back'}
        </button>
        <div className="flex-1" />
        {isLast ? (
          <button
            disabled={!hasCurrentAnswer}
            onClick={handleSubmit}
            className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift disabled:opacity-50"
          >
            Submit Challenge
          </button>
        ) : (
          <button
            disabled={!hasCurrentAnswer}
            onClick={handleNext}
            className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift disabled:opacity-50"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
export function ResultsRenderer({
  result,
  skill,
  challengeTitle,
  onRetry,
  onBack,
}: {
  result: SubmitResult;
  skill: string;
  challengeTitle: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const ai = result.ai_evaluation;
  const passed = result.score >= result.pass_mark;
  const tone = result.score >= 80 ? 'text-green-400' : result.score >= 60 ? 'text-blue-400' : 'text-yellow-400';
  const correctCount = result.correct_count;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white/5 border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary-light font-semibold mb-2">
        <AppIcon name="check" className="w-4 h-4" />
        Challenge Complete
      </div>
      <h2 className="text-xl font-extrabold text-white">{challengeTitle}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-4 mt-5 items-start">
        <div className="flex lg:flex-col flex-row items-center gap-3 shrink-0 bg-white/[0.03] border border-white/10 rounded-2xl p-4 lg:sticky lg:top-2 self-start">
          <div className="relative w-24 h-24 shrink-0">
            <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="8" />
              <motion.circle cx="50" cy="50" r="42" fill="none" stroke={result.score >= 80 ? '#22c55e' : result.score >= 60 ? '#3b82f6' : '#facc15'} strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 42} initial={{ strokeDashoffset: 2 * Math.PI * 42 }} animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - result.score / 100) }} transition={{ duration: 0.9 }} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center"><span className={`text-2xl font-extrabold ${tone}`}>{result.score}</span></div>
          </div>
          <span className="text-[11px] text-gray-500">Score / 100</span>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${passed ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'}`}>
            {passed ? 'Passed' : 'Below pass'}
          </span>
        </div>

        <div className="space-y-3 min-w-0">
          {ai && (
            <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">MeLun Insight</p>
              <p className="text-sm text-gray-200 mt-1">{ai.narrative}</p>
            </div>
          )}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Your strongest signals</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-primary/15 text-primary-light border border-primary/25">{skill}</span>
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{correctCount} of {result.total_count} tasks correct</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Impact on your profile</p>
            <p className="text-sm text-primary-light mt-1">Your {skill} signal has been updated based on this attempt.</p>
          </div>
        </div>
      </div>

      <div className="mt-5 bg-white/[0.03] border border-white/10 rounded-2xl p-4">
        <p className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold mb-3">Task breakdown</p>
        <div className="arena-scroll-list space-y-3 pr-1" style={{ maxHeight: 320 }}>
          {result.per_task.map((t) => (
            <div key={t.task_index} className={`p-3.5 rounded-xl border text-sm ${t.correct ? 'border-green-500/30 bg-green-500/[0.05]' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-gray-300 flex-1">{t.prompt}</p>
                <span className="shrink-0 text-xs font-bold">{t.earned}/{t.total} pts</span>
              </div>
              {t.explanation && <p className="text-[11px] text-gray-500 mt-1">{t.explanation}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mt-5">
        <button onClick={onRetry} className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-5 rounded-xl transition-all btn-lift">Try Another Challenge</button>
        <button onClick={onBack} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold py-2.5 px-5 rounded-xl transition-all">Back to Career Quest</button>
      </div>
    </motion.div>
  );
}
