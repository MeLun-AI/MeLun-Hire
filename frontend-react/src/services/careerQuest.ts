/* ------------------------------------------------------------------ */
/*  Career Quest service (Applicant "Career Quest" experience).        */
/*                                                                     */
/*  Backend-driven. Challenge catalog, attempts, results, skill        */
/*  signals, mystery opportunities and progress all come from the      */
/*  FastAPI career-quest router (no state persisted on the client).    */
/*                                                                     */
/*  Career-map and match-engine helpers are derived from REAL open     */
/*  jobs + the applicant's actual skills.                              */
/* ------------------------------------------------------------------ */

import { getJson, postJson } from './api';
import { computeAiMatch, fetchOpenJobs, type BackendJob } from './jobUtils';

/* ================================================================== */
/*  Real applicant profile fields (mirrors Applicant Profile data)      */
/* ================================================================== */

export interface ApplicantProfileFields {
  phone: string;
  location: string;
  experience: string;
  skills: string;
}

export async function fetchApplicantProfileFields(applicantId: string): Promise<ApplicantProfileFields | null> {
  try {
    const p = await getJson(`/applicant/profile/${encodeURIComponent(applicantId)}`);
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    return {
      phone: typeof o.phone === 'string' ? o.phone : '',
      location: typeof o.location === 'string' ? o.location : '',
      experience: typeof o.experience === 'string' ? o.experience : '',
      skills: typeof o.skills === 'string' ? o.skills : '',
    };
  } catch {
    return null;
  }
}

/* ================================================================== */
/*  Career Map — derive recommended / stretch / future roles from       */
/*  REAL open jobs + the applicant's actual skills.                    */
/* ================================================================== */

export interface CareerRole {
  key: string;
  job: BackendJob;
  title: string;
  company: string;
  salary: string;
  location: string;
  type: string;
  match: number;
  matchedSkills: string[];
  missingSkills: string[];
  stage: 'recommended' | 'stretch' | 'future';
}

export async function fetchOpenJobsForQuest(): Promise<BackendJob[]> {
  return fetchOpenJobs();
}

export function buildCareerMap(skills: string[], jobs: BackendJob[]): CareerRole[] {
  const map: CareerRole[] = [];

  for (const job of jobs) {
    const required = Array.isArray(job.required_skills)
      ? job.required_skills.filter(Boolean)
      : [];
    const match = computeAiMatch(skills, required);

    let stage: CareerRole['stage'];
    if (match.aiMatch >= 70) stage = 'recommended';
    else if (match.aiMatch >= 40) stage = 'stretch';
    else stage = 'future';

    map.push({
      key: `${job.id}-${job.job_title}`,
      job,
      title: job.job_title,
      company: job.company_name ?? 'Open position',
      salary: job.salary ?? 'Competitive',
      location: job.location || job.job_mode || 'Remote',
      type: job.job_type ?? (job.job_mode ?? 'Full-time'),
      match: match.aiMatch,
      matchedSkills: match.matchedSkills,
      missingSkills: match.missingSkills.slice(0, 4),
      stage,
    });
  }

  return map
    .sort((a, b) => (a.stage === b.stage ? b.match - a.match : stageRank(a.stage) - stageRank(b.stage)))
    .slice(0, 12);
}

function stageRank(s: CareerRole['stage']): number {
  return s === 'recommended' ? 0 : s === 'stretch' ? 1 : 2;
}

export function describeStage(stage: CareerRole['stage']): string {
  if (stage === 'recommended') return 'A strong fit based on your current skills.';
  if (stage === 'stretch') return 'Reachable now — you are missing a few required skills.';
  return 'Future potential — build the missing skills to reach this role.';
}
/* ================================================================== */
/*  Quest milestones (derived from REAL backend activity)               */
/* ================================================================== */

export interface QuestMilestone {
  id: string;
  label: string;
  done: boolean;
  hint: string;
}

export interface QuestProgress {
  milestones: QuestMilestone[];
  percent: number;
  done_count: number;
  total: number;
  challenges_completed: number;
  skills_signals: number;
  opportunities_unlocked: number;
  applications: number;
  total_challenges_available: number;
}

export async function fetchQuestProgress(applicantId: string): Promise<QuestProgress> {
  return getJson(`/career-quest/progress?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<QuestProgress>;
}

export function questPercent(milestones: QuestMilestone[]): number {
  if (!milestones.length) return 0;
  return Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100);
}

/* ================================================================== */
/*  Match Engine — an EXPLAINABLE overall score from real signals       */
/* ================================================================== */

export interface MatchSignal {
  label: string;
  score: number;
  weight: number; // 0..1
  evidence: string;
}

export interface MatchBreakdown {
  overall: number;
  signals: MatchSignal[];
}

export function buildMatchEngine(input: {
  resumeScore: number | null;
  completionPercent: number;
  skillsCount: number;
  roles: CareerRole[];
}): MatchBreakdown {
  const resumeScore = input.resumeScore ?? 0;
  const profile = input.completionPercent;
  const skillsCount = input.skillsCount;

  const skillSignal = skillsCount >= 3
    ? Math.min(100, 60 + skillsCount)
    : skillsCount > 0
      ? 40
      : 0;

  const topRoles = [...input.roles]
    .filter((r) => r.stage === 'recommended')
    .sort((a, b) => b.match - a.match)
    .slice(0, 3);
  const roleSignal = topRoles.length
    ? Math.round(topRoles.reduce((s, r) => s + r.match, 0) / topRoles.length)
    : 0;

  const signals: MatchSignal[] = [
    {
      label: 'Resume Strength',
      score: resumeScore,
      weight: 0.3,
      evidence: resumeScore
        ? `Your uploaded resume has a strength score of ${resumeScore}%.`
        : 'Upload a resume to strengthen this signal.',
    },
    {
      label: 'Profile Completion',
      score: profile,
      weight: 0.15,
      evidence: profile === 100
        ? 'Your profile is fully complete.'
        : `Your profile is ${profile}% complete — finishing it improves match accuracy.`,
    },
    {
      label: 'Skill Signal',
      score: skillSignal,
      weight: 0.25,
      evidence: skillsCount
        ? `Based on ${skillsCount} skills from your profile and resume.`
        : 'Add at least 3 skills to unlock this signal.',
    },
    {
      label: 'Top Role Match',
      score: roleSignal,
      weight: 0.3,
      evidence: topRoles.length
        ? `Across your top ${topRoles.length} roles, average AI match is ${roleSignal}%.`
        : 'No recommended roles yet — explore the career map.',
    },
  ];

  const overall = Math.round(signals.reduce((s, sig) => s + sig.score * sig.weight, 0));
  return { overall, signals };
}

export function matchTone(score: number): { text: string; ring: string; chip: string } {
  if (score >= 80) return { text: 'text-green-400', ring: '#22c55e', chip: 'bg-green-500/10 text-green-400 border border-green-500/30' };
  if (score >= 60) return { text: 'text-blue-400', ring: '#3b82f6', chip: 'bg-blue-500/10 text-blue-400 border border-blue-500/30' };
  if (score >= 40) return { text: 'text-yellow-400', ring: '#facc15', chip: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' };
  return { text: 'text-gray-400', ring: '#9ca3af', chip: 'bg-gray-500/10 text-gray-400 border border-gray-500/30' };
}
/* ================================================================== */
/*  Backend challenge model                                             */
/* ================================================================== */

export type QuestionType = 'multiple_choice' | 'ranking' | 'matching' | 'scenario' | 'data' | 'technical' | 'open_text' | 'rule_shift';

export interface ChallengeQuestion {
  type: QuestionType;
  prompt: string;
  points: number;
  explanation?: string;
  // multiple_choice / scenario / data / technical
  options?: string[];
  correct_index?: number;
  // ranking
  items?: { id: string; label: string }[];
  correct_order?: string[];
  // matching
  pairs?: { left: string; right: string }[];
  // scenario partial credit / coaching
  option_scores?: number[];
  coaching?: string;
  kind?: string;
  difficulty?: string;
  // data tasks
  dataset?: { title: string; columns: string[]; values: number[]; unit?: string };
  // open_text tasks
  rubric?: { label: string; keywords: string[] }[];
  min_length?: number;
  // rule_shift tasks
  rule?: string;
  round?: number;
  buckets?: string[];
  cases?: { item: string; bucket: string }[];
}


export interface ChallengeMeta {
  id: string;
  title: string;
  description: string;
  category: string;
  skill: string;
  domain: string;
  difficulty: string;
  estimated_time: number;
  scoring: { pass: number; max: number };
  explanation: string;
  active: boolean;
  completed?: boolean;
  instructions?: string[];
  skills_tested?: string[];
}

export interface ChallengeDetail extends ChallengeMeta {
  completed_by_me: boolean;
  my_last_score: number | null;
  questions: ChallengeQuestion[];
}

export async function listChallenges(): Promise<ChallengeMeta[]> {
  return getJson('/career-quest/challenges') as Promise<ChallengeMeta[]>;
}

export async function recommendedChallenges(applicantId: string): Promise<ChallengeMeta[]> {
  return getJson(`/career-quest/recommended?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<ChallengeMeta[]>;
}

export async function getChallenge(challengeId: string, applicantId: string): Promise<ChallengeDetail> {
  return getJson(`/career-quest/challenges/${encodeURIComponent(challengeId)}?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<ChallengeDetail>;
}
/* ================================================================== */
/*  Attempts                                                           */
/* ================================================================== */

export interface Attempt {
  id: number;
  attempt_code: string;
  challenge_id: string;
  status: string;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  score: number | null;
  time_taken: number;
  correct_count: number;
  total_count: number;
  skill_impact: { skill: string; signal_type: string; score: number; pass_mark: number } | null;
  ai_evaluation: { strength_label: string; score: number; skill: string; category: string; narrative: string } | null;
  title?: string;
  category?: string;
  skill?: string;
}

export interface SubmitResult {
  score: number;
  per_task: {
    task_index: number;
    type: string;
    prompt: string;
    correct: boolean;
    earned: number;
    total: number;
    explanation: string;
    expected: unknown;
  }[];
  correct_count: number;
  total_count: number;
  ai_evaluation: Attempt['ai_evaluation'];
  pass_mark: number;
}

export interface SubmittedAttempt extends Attempt {
  result: SubmitResult;
}

export interface TaskAnswerInput {
  task_index: number;
  answer: unknown;
  time_ms?: number;
}

export async function startAttempt(applicantId: string, challengeId: string): Promise<Attempt> {
  return postJson('/career-quest/attempts/start', { applicant_id: applicantId, challenge_id: challengeId }) as Promise<Attempt>;
}

export async function submitAttempt(attemptId: number, applicantId: string, timeTakenSeconds: number, answers: TaskAnswerInput[], meta?: Record<string, unknown>): Promise<SubmittedAttempt> {
  return postJson(`/career-quest/attempts/${attemptId}/submit`, {
    applicant_id: applicantId,
    time_taken_seconds: timeTakenSeconds,
    answers,
    ...(meta ? { meta } : {}),
  }) as Promise<SubmittedAttempt>;
}

export async function completeAttempt(attemptId: number, applicantId: string): Promise<Attempt> {
  return postJson(`/career-quest/attempts/${attemptId}/complete`, { applicant_id: applicantId }) as Promise<Attempt>;
}

export async function attemptHistory(applicantId: string): Promise<Attempt[]> {
  return getJson(`/career-quest/attempts?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<Attempt[]>;
}
/* ================================================================== */
/*  Skill signals + mystery                                             */
/* ================================================================== */

export interface SkillSignal {
  skill: string;
  signal_type: string;
  signal_value: number;
  source: string;
  updated_at: string;
}

export interface SkillSignalsPayload {
  signals: SkillSignal[];
  skills: { skill: string; value: number; latest: string; sources: { type: string; value: number }[] }[];
}

export interface MysteryOpportunity {
  job_id: number;
  title: string;
  company: string;
  salary: string;
  location: string;
  type: string;
  match: number;
  matched_skills: string[];
  missing_skills: string[];
}

export interface MysteryState {
  unlocked: boolean;
  revealed: boolean;
  challenge_id: string | null;
  opportunity: MysteryOpportunity | null;
}

export async function fetchSkillSignals(applicantId: string): Promise<SkillSignalsPayload> {
  return getJson(`/career-quest/skill-signals?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<SkillSignalsPayload>;
}

export async function fetchMystery(applicantId: string): Promise<MysteryState> {
  return getJson(`/career-quest/mystery?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<MysteryState>;
}

export async function unlockMystery(applicantId: string, challengeId: string): Promise<{ unlocked: boolean }> {
  return postJson('/career-quest/mystery/unlock', { applicant_id: applicantId, challenge_id: challengeId }) as Promise<{ unlocked: boolean }>;
}

export async function revealMystery(applicantId: string): Promise<{ revealed: boolean; opportunity: MysteryOpportunity | null }> {
  return postJson('/career-quest/mystery/reveal', { applicant_id: applicantId }) as Promise<{ revealed: boolean; opportunity: MysteryOpportunity | null }>;
}