/* ------------------------------------------------------------------ */
/*  AI Interviewer Engine                                              */
/*  Simulates a Senior Software Engineer conducting the interview.    */
/*  Handles follow-ups, context memory, adaptive difficulty.          */
/* ------------------------------------------------------------------ */

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface InterviewContext {
  roundName: string;
  roundIdx: number;
  questionIdx: number;
  difficulty: DifficultyLevel;
  previousAnswers: string[];
  candidateRole: string;
  conversationHistory: { role: 'ai' | 'user'; text: string }[];
}

interface FollowUpMapping {
  questionPattern: string;
  followUps: string[];
}

/* ------------------------------------------------------------------ */
/*  Follow-up question patterns                                        */
/* ------------------------------------------------------------------ */

const FOLLOW_UPS: FollowUpMapping[] = [
  {
    questionPattern: 'FastAPI|REST|GraphQL|API',
    followUps: [
      "That's interesting. Could you explain how you would handle authentication and rate limiting in that context?",
      "Good. Can you walk me through how you'd debug a performance issue in that scenario?",
      "I see. How would you ensure reliability and handle failures in that design?",
    ],
  },
  {
    questionPattern: 'CNN|model|training|machine learning',
    followUps: [
      "How did you prevent overfitting while training that model?",
      "What evaluation metrics did you use, and why did you choose them?",
      "How would you handle imbalanced data in that scenario?",
    ],
  },
  {
    questionPattern: 'database|SQL|PostgreSQL|query',
    followUps: [
      "How would you optimize that query for a large dataset?",
      "What indexing strategy would you recommend and why?",
      "How would you handle database migrations in a production environment?",
    ],
  },
  {
    questionPattern: 'Docker|deploy|container|devops',
    followUps: [
      "How would you handle container security in a production deployment?",
      "What's your approach to zero-downtime deployments?",
      "How do you debug issues in a running container?",
    ],
  },
  {
    questionPattern: 'conflict|team|communication|collaboration',
    followUps: [
      "That's a good approach. How would you handle that situation differently if the team member was senior to you?",
      "What did you learn from that experience that you apply today?",
      "How do you ensure clear communication in a remote team setting?",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Follow-up detection                                                */
/* ------------------------------------------------------------------ */

export function shouldAskFollowUp(
  _question: string,
  answer: string,
  followUpCount: number
): boolean {
  // Max 1 follow-up per main question
  if (followUpCount >= 1) return false;
  // Short answers need clarification
  if (answer.length < 80) return true;
  // Otherwise generate follow-up ~35% of the time
  return Math.random() < 0.35;
}

export function getFollowUpQuestion(_question: string, _answer: string): string {
  const match = FOLLOW_UPS.find((f) => _question.match(new RegExp(f.questionPattern, 'i')));
  if (match) {
    return match.followUps[Math.floor(Math.random() * match.followUps.length)];
  }
  return "That's helpful. Can you expand on how you approached the technical trade-offs in that answer?";
}

/* ------------------------------------------------------------------ */
/*  Adaptive difficulty                                                */
/* ------------------------------------------------------------------ */

export function getNextDifficulty(
  current: DifficultyLevel,
  answer: string,
  avgAnswerLength: number
): DifficultyLevel {
  const wordCount = answer.split(/\s+/).filter(Boolean).length;

  // Strong answers: increase difficulty
  if (wordCount > avgAnswerLength * 1.5 || answer.length > 400) {
    if (current === 'easy') return 'medium';
    if (current === 'medium') return 'hard';
    return 'hard';
  }
  // Weak answers: stay at medium or drop to easy
  if (wordCount < avgAnswerLength * 0.5 || answer.length < 50) {
    if (current === 'hard') return 'medium';
    return 'easy';
  }
  return current;
}

/* ------------------------------------------------------------------ */
/*  AI Interviewer persona responses                                   */
/* ------------------------------------------------------------------ */

export const AI_PERSONA = {
  greeting: "Good day! I'll be conducting your interview today. I'm a senior software engineer with 15+ years of experience. Let's begin with a few technical questions to understand your expertise better. Take your time with each answer.",
  encouraging: [
    "Good, that gives me a clear picture.",
    "I see. That's a solid approach.",
    "Understood. Let me dig a little deeper.",
    "Excellent. That's what I was looking for.",
  ],
  roundIntro: (round: string, topics: string[]) =>
    `Now we move to the ${round} round. Today we'll focus on ${topics.join(', ')}. Take your time with each question.`,
  reviewing: "AI is reviewing your response...",
};

/* ------------------------------------------------------------------ */
/*  Session recovery                                                   */
/* ------------------------------------------------------------------ */

export interface InterviewSessionState {
  startTimestamp: number;
  roundIdx: number;
  questionIdx: number;
  followUpCount: number;
  difficulty: DifficultyLevel;
  answers: Record<string, string>;
  chatHistory: { role: 'ai' | 'user'; text: string; timestamp: number }[];
}

const SESSION_KEY = 'quno_interview_session_v2';

export function saveSession(state: InterviewSessionState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

export function loadSession(): InterviewSessionState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as InterviewSessionState;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

export const ROUND_TOPICS: Record<string, string[]> = {
  Technical: ['System Design', 'Data Structures', 'APIs', 'Databases'],
  Aptitude: ['Logical Reasoning', 'Problem Solving', 'Numerical Ability'],
  'Soft Skills': ['Communication', 'Teamwork', 'Leadership', 'Conflict Resolution'],
};