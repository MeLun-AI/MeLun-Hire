/* ------------------------------------------------------------------ */
/*  Talent Arena service (HR-side interactive hiring experiences).     */
/*                                                                     */
/*  Backend-driven. Candidate pool + MeLun evidence, radar, evaluations, */
/*  comparisons, teams, hiring quest, votes and challenges all come    */
/*  from the FastAPI talent-arena router. No state kept on the client. */
/* ------------------------------------------------------------------ */

import { getJson, postJson } from './api';

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface EvidenceSource {
  type: string;
  value: number;
  source: string;
}

export interface QunoEvidence {
  skill: string;
  value: number;
  level: string;
  sources: EvidenceSource[];
}

export interface SkillFit {
  skill: string;
  declared: boolean;
  signal: number | null;
  level: string;
}

export interface JobFit {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  per_skill: SkillFit[];
}

export interface ResumeEvidence {
  matched: number | boolean | null;
  matched_skills: string[];
}

export interface AssessmentSummary {
  completed: number;
  avg_score: number;
  recent: { challenge_id: string; score: number | null; at: string | null }[];
}

export interface TalentCandidate {
  application_id: number;
  applicant_id: string;
  job_id: number;
  job_title: string;
  resume_status: string;
  full_name: string;
  email: string;
  phone: string;
  location: string;
  experience_years: number | null;
  skills: string[];
  required_skills: string[];
  resume: ResumeEvidence | null;
  interview_score: number | null;
  quno_evidence: QunoEvidence[];
  assessment: AssessmentSummary;
  fit: JobFit;
}

export interface TalentJob {
  id: number;
  job_title: string;
  required_skills: string[];
  experience_required: string | null;
  status: string;
  candidates: number;
}

export interface CandidatesPayload {
  jobs: TalentJob[];
  candidates: TalentCandidate[];
}

export interface RadarWhy {
  label: string;
  detail: string;
  value: number;
}

export interface RadarRecommendation {
  application_id: number;
  applicant_id: string;
  job_id: number;
  job_title: string;
  full_name: string;
  skills: string[];
  missing_skills: string[];
  experience_years: number | null;
  assessment_completed: number;
  quno_evidence: QunoEvidence[];
  resume_keyword_match: string;
  skill_evidence: string;
  assessment_evidence: string;
  overall_potential: string;
  match_score: number;
  hidden_gem: boolean;
  why: RadarWhy[];
}

export interface Evaluation {
  id: number;
  application_id: number;
  job_id: number;
  mode: string;
  recommendation: string;
  confidence: string | null;
  notes: string;
  evidence: Record<string, unknown> | null;
  revealed_before_eval: boolean;
  created_at: string;
}

export interface ComparisonRecord {
  id: number;
  job_id: number;
  application_ids: number[];
  decision: string;
  tradeoffs: { dimensions?: Record<string, Record<string, unknown>>; notes?: unknown } | null;
  created_at: string;
}

export interface TeamCoverage {
  coverage: number;
  filled_slots: number;
  empty_slots: number;
  team_balance: number;
  missing_capabilities: string[];
  suggestions: {
    application_id: number;
    full_name: string;
    job_title: string;
    fills: string[];
    evidence: { skill: string; value: number }[];
  }[];
}

export interface TeamSlot {
  role: string;
  required_skills: string[];
  application_id: number | null;
}

export interface SavedTeam extends TeamCoverage {
  id: number;
  name: string;
  slots: TeamSlot[];
  created_at: string;
  updated_at: string;
}

export interface HiringQuestJob {
  job_id: number;
  job_title: string;
  required_skills: string[];
  candidate_count: number;
  stage: string;
  stage_updated_at: string | null;
  next_best_actions: {
    type: string;
    priority: number;
    message: string;
    action: string;
    skill?: string;
    application_ids?: number[];
  }[];
  stats: {
    evaluated: number;
    assessed: number;
    challenged: number;
    interviewed: number;
  };
}

export interface VoteRecord {
  id: number;
  application_id: number;
  job_id: number;
  evaluator_name: string;
  recommendation: string;
  confidence: string | null;
  strengths: string;
  concerns: string;
  created_at: string;
}

export interface VoteConsensus {
  total_votes: number;
  forward_votes: number;
  consensus: string;
  recommendations: Record<string, number>;
  agreement_on: { topic: string; mentions: number }[];
  mixed_on: { topic: string; mentions: number }[];
  quno_suggestion: string | null;
}

export interface ChallengeRequestRecord {
  id: number;
  application_id: number;
  applicant_id: string;
  challenge_id: string;
  skill: string;
  role_bar: number;
  status: string;
  created_at: string;
  result: {
    attempt_id: number;
    score: number | null;
    completed_at: string | null;
    correct_count: number;
    total_count: number;
    skill_signals: { skill: string; value: number }[];
  } | null;
  verdict: {
    candidate: number | null;
    role_requirement: number;
    meets_bar: boolean;
    evidence_confidence: string;
  } | null;
}

/* ================================================================== */
/*  Candidate pool                                                     */
/* ================================================================== */

export function fetchTalentCandidates(hrId: number): Promise<CandidatesPayload> {
  return getJson(`/talent-arena/candidates/${hrId}`) as Promise<CandidatesPayload>;
}

/* ================================================================== */
/*  Talent Radar                                                       */
/* ================================================================== */

export function fetchTalentRadar(hrId: number, jobId?: number | null): Promise<{ recommendations: RadarRecommendation[] }> {
  const q = jobId ? `?job_id=${jobId}` : '';
  return getJson(`/talent-arena/radar/${hrId}${q}`) as Promise<{ recommendations: RadarRecommendation[] }>;
}

/* ================================================================== */
/*  Evaluations (Talent Detective + Blind Evaluation)                  */
/* ================================================================== */

export interface EvaluationInput {
  hr_id: number;
  application_id: number;
  applicant_id: string;
  job_id: number;
  mode: 'detective' | 'blind';
  recommendation: string;
  confidence?: string | null;
  notes?: string;
  evidence?: Record<string, unknown> | null;
  revealed_before_eval?: boolean;
}

export function saveTalentEvaluation(data: EvaluationInput): Promise<{ success: boolean }> {
  return postJson('/talent-arena/evaluations', data as unknown as Record<string, unknown>) as Promise<{ success: boolean }>;
}

export function fetchTalentEvaluations(hrId: number, applicationId?: number): Promise<{ evaluations: Evaluation[] }> {
  const q = applicationId ? `?application_id=${applicationId}` : '';
  return getJson(`/talent-arena/evaluations/${hrId}${q}`) as Promise<{ evaluations: Evaluation[] }>;
}

/* ================================================================== */
/*  Candidate Face-Off comparisons                                     */
/* ================================================================== */

export function saveTalentComparison(data: {
  hr_id: number;
  job_id: number;
  application_ids: number[];
  decision?: string;
  tradeoffs?: Record<string, unknown> | null;
}): Promise<{ success: boolean }> {
  return postJson('/talent-arena/comparisons', data as unknown as Record<string, unknown>) as Promise<{ success: boolean }>;
}

export function fetchTalentComparisons(hrId: number): Promise<{ comparisons: ComparisonRecord[] }> {
  return getJson(`/talent-arena/comparisons/${hrId}`) as Promise<{ comparisons: ComparisonRecord[] }>;
}

/* ================================================================== */
/*  Build Your Team                                                    */
/* ================================================================== */

export function fetchTeamRoles(): Promise<{ roles: Record<string, string[]> }> {
  return getJson('/talent-arena/team-roles') as Promise<{ roles: Record<string, string[]> }>;
}

export function previewTeam(data: { hr_id: number; name: string; slots: TeamSlot[] }): Promise<TeamCoverage> {
  return postJson('/talent-arena/teams/preview', { ...data, persist: false } as unknown as Record<string, unknown>) as Promise<TeamCoverage>;
}

export function saveTeamConfig(data: { hr_id: number; name: string; slots: TeamSlot[] }): Promise<{ success: boolean; team_id: number } & TeamCoverage> {
  return postJson('/talent-arena/teams', data as unknown as Record<string, unknown>) as Promise<{ success: boolean; team_id: number } & TeamCoverage>;
}

export function fetchTeams(hrId: number): Promise<{ teams: SavedTeam[] }> {
  return getJson(`/talent-arena/teams/${hrId}`) as Promise<{ teams: SavedTeam[] }>;
}

/* ================================================================== */
/*  Hiring Quest                                                       */
/* ================================================================== */

export function saveQuestStage(data: { hr_id: number; job_id: number; stage: string }): Promise<{ success: boolean }> {
  return postJson('/talent-arena/hiring-quest', data as unknown as Record<string, unknown>) as Promise<{ success: boolean }>;
}

export function fetchHiringQuest(hrId: number, jobId?: number | null): Promise<{ jobs: HiringQuestJob[]; stages: string[] }> {
  const q = jobId ? `?job_id=${jobId}` : '';
  return getJson(`/talent-arena/hiring-quest/${hrId}${q}`) as Promise<{ jobs: HiringQuestJob[]; stages: string[] }>;
}

/* ================================================================== */
/*  Team Votes                                                         */
/* ================================================================== */

export function saveTeamVote(data: {
  hr_id: number;
  application_id: number;
  job_id: number;
  evaluator_name: string;
  recommendation: string;
  confidence?: string | null;
  strengths?: string;
  concerns?: string;
}): Promise<{ success: boolean }> {
  return postJson('/talent-arena/votes', data as unknown as Record<string, unknown>) as Promise<{ success: boolean }>;
}

export function fetchTeamVotes(hrId: number, applicationId?: number): Promise<{ votes: VoteRecord[]; consensus: VoteConsensus }> {
  const q = applicationId ? `?application_id=${applicationId}` : '';
  return getJson(`/talent-arena/votes/${hrId}${q}`) as Promise<{ votes: VoteRecord[]; consensus: VoteConsensus }>;
}

/* ================================================================== */
/*  Candidate Challenges                                               */
/* ================================================================== */

export function sendTalentChallenge(data: {
  hr_id: number;
  application_id: number;
  applicant_id: string;
  challenge_id: string;
  skill?: string;
  role_bar?: number;
}): Promise<{ success: boolean; request_id: number }> {
  return postJson('/talent-arena/challenge-requests', data as unknown as Record<string, unknown>) as Promise<{ success: boolean; request_id: number }>;
}

export function fetchChallengeRequests(hrId: number): Promise<{ requests: ChallengeRequestRecord[] }> {
  return getJson(`/talent-arena/challenge-requests/${hrId}`) as Promise<{ requests: ChallengeRequestRecord[] }>;
}

export function fetchMyChallenges(applicantId: string): Promise<{ requests: unknown[] }> {
  return getJson(`/talent-arena/my-challenges?applicant_id=${encodeURIComponent(applicantId)}`) as Promise<{ requests: unknown[] }>;
}
