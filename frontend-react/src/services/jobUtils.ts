/* ------------------------------------------------------------------ */
/*  Job utilities (shared between applicant pages)                      */
/*  Single place for mapping backend jobs and a lightweight match that  */
/*  can later be swapped for the real AI matching service.              */
/* ------------------------------------------------------------------ */

import { getJson } from './api';

export interface BackendJob {
  id: number;
  job_title: string;
  job_domain?: string | null;
  job_type?: string | null;
  job_mode?: string | null;
  experience_required?: string | null;
  location?: string | null;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  salary?: string | null;
  deadline?: string | null;
  required_skills?: string[] | null;
  preferred_skills?: string[] | null;
  responsibilities?: string[] | null;
  company_overview?: string | null;
  benefits?: string[] | null;
  hiring_process?: string[] | null;
  recruiter_notes?: string | null;
  company_name?: string | null;
  applicants_count?: number;
}

export function parseSkillList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shared fetch for the applicant-facing OPEN jobs list.
 *  Both Available Jobs and the Applicant Dashboard use this same source.
 *  Deduplicates by the backend's stable job ID so a position is never
 *  rendered more than once, while distinct jobs that share a title remain. */
export async function fetchOpenJobs(): Promise<BackendJob[]> {
  const res = await getJson('/hr/jobs');
  const list = Array.isArray(res) ? (res as BackendJob[]) : [];

  const seen = new Set<number>();
  const deduped: BackendJob[] = [];
  for (const job of list) {
    if (job && typeof job.id === 'number') {
      if (seen.has(job.id)) continue;
      seen.add(job.id);
    }
    deduped.push(job);
  }
  return deduped;
}

export interface JobMatch {
  aiMatch: number;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: string;
}

/** Lightweight, real-data skills overlap used to feed the existing AI Match UI.
 *  Replace the internals with the real ML matching service once connected.
 *  Never returns fabricated scores — with no required skills the score is 0. */
export function computeAiMatch(
  applicantSkills: string[],
  requiredSkills: string[]
): JobMatch {
  const reqLower = requiredSkills.map((s) => s.toLowerCase());
  const applicantLower = new Set(applicantSkills.map((s) => s.toLowerCase()));

  if (!reqLower.length) {
    return {
      aiMatch: 0,
      matchedSkills: [],
      missingSkills: [],
      recommendation: 'AI match will be available once the job lists required skills.',
    };
  }

  const matchedSet = new Set(reqLower.filter((s) => applicantLower.has(s)));
  const matchedSkills = requiredSkills.filter((s) => matchedSet.has(s.toLowerCase()));
  const missingSkills = requiredSkills.filter((s) => !matchedSet.has(s.toLowerCase()));
  const aiMatch = Math.min(100, Math.round((matchedSkills.length / reqLower.length) * 100));

  const recommendation =
    aiMatch >= 80
      ? 'Excellent match based on your skills.'
      : aiMatch >= 60
        ? 'Good match. Consider strengthening a few required skills.'
        : 'Limited overlap with the required skills for this role.';

  return { aiMatch, matchedSkills, missingSkills, recommendation };
}

export function formatPostedDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}