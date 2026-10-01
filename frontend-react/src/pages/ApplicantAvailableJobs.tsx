import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import { getJson, postJson, requestErrorMessage } from '../services/api';
import { BackendJob, computeAiMatch, fetchOpenJobs, formatPostedDate, parseSkillList } from '../services/jobUtils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Job {
  id: number;
  title: string;
  company: string;
  location: string;
  domain: string;
  position: string;
  workType: string;
  experience: string;
  workMode: string;
  salary: string;
  postedDate: string;
  deadline: string;
  createdAt: string;
  skills: string[];
  applicants: number;
  aiMatch: number;
  status: 'Open' | 'Hiring' | 'Urgent';
  description: string;
  responsibilities: string[];
  preferredSkills: string[];
  companyOverview: string;
  benefits: string[];
  hiringProcess: string[];
  recruiterNotes: string;
  matchedSkills: string[];
  missingSkills: string[];
  recommendation: string;
}

/* ------------------------------------------------------------------ */
/*  Mapping                                                            */
/*  Real backend job -> UI Job. Only the data source is real; the     */
/*  UI shape is unchanged.                                             */
/* ------------------------------------------------------------------ */


function mapBackendJob(raw: BackendJob, applicantSkills: string[]): Job {
  const requiredSkills = raw.required_skills ?? [];
  const preferredSkills = raw.preferred_skills ?? [];
  const responsibilities = raw.responsibilities ?? [];
  const match = computeAiMatch(applicantSkills, requiredSkills);

  return {
    id: raw.id,
    title: raw.job_title,
    company: raw.company_name || '',
    location: raw.location || '',
    domain: raw.job_domain || '',
    position: raw.job_title || '',
    workType: mapToDisplay(raw.job_type, WORK_TYPE_DISPLAY) ?? '',
    experience: raw.experience_required || '',
    workMode: raw.job_mode || '',
    salary: raw.salary || '',
    postedDate: formatPostedDate(raw.created_at),
    deadline: raw.deadline || '',
    createdAt: raw.created_at || '',
    skills: requiredSkills,
    applicants: raw.applicants_count ?? 0,
    aiMatch: match.aiMatch,
    status: (raw.status || 'Open') as Job['status'],
    description: raw.description || '',
    responsibilities,
    preferredSkills,
    companyOverview: raw.company_overview || '',
    benefits: raw.benefits ?? [],
    hiringProcess: raw.hiring_process ?? [],
    recruiterNotes: raw.recruiter_notes || '',
    matchedSkills: match.matchedSkills,
    missingSkills: match.missingSkills,
    recommendation: match.recommendation,
  };
}
/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStatusStyle(status: string): string {
  switch (status) {
    case 'Urgent': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'Hiring': return 'bg-green-500/10 text-green-400 border-green-500/20';
    default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }
}

function getMatchColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 80) return '#3b82f6';
  if (score >= 70) return '#f59e0b';
  return '#6b7280';
}

function MatchRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = getMatchColor(score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={4} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold" style={{ color }}>{score}%</span>
      </div>
    </div>
  );
}

function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const dur = 800;
    const step = Math.max(1, Math.floor(value / 30));
    const interval = setInterval(() => {
      start += step;
      if (start >= value) { setDisplay(value); clearInterval(interval); }
      else setDisplay(start);
    }, dur / (value / step));
    return () => clearInterval(interval);
  }, [value]);
  return <span>{display}</span>;
}

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={`bg-white/5 border border-white/10 rounded-2xl p-5 transition-all duration-300 ${className}`}>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Sidebar                                                     */
/* ------------------------------------------------------------------ */

/* Posted + AI Match are computed filters, so their option lists stay static.
   The category filter options connect to the actual job data through clean
   display mappings — backend/internal values are never exposed to the user. */
const POSTED = ['Today', 'Last 3 Days', 'Last Week', 'Last Month'];
const AI_MATCH = ['90%+', '80%+', '70%+'];
const POSTED_DAYS: Record<string, number> = { Today: 1, 'Last 3 Days': 3, 'Last Week': 7, 'Last Month': 30 };

/* ---- Domain: curated user-facing categories + backend -> categories map.
   A backend value can belong to more than one category (e.g. "ML / Data
   Science" is both Machine Learning and Data Science). Unmappable/internal
   values are never shown and never match a domain filter. ---- */
const DOMAIN_OPTIONS = ['Python', 'C', 'Machine Learning', 'Artificial Intelligence', 'Data Science'];
const DOMAIN_DISPLAY_MAP: Record<string, string[]> = {
  'ml / data science': ['Data Science', 'Machine Learning'],
  'data science': ['Data Science', 'Machine Learning'],
  'machine learning': ['Machine Learning'],
  'artificial intelligence': ['Artificial Intelligence'],
  'ai': ['Artificial Intelligence'],
  'nlp / ai': ['Artificial Intelligence'],
  'web development': ['Web Development'],
  python: ['Python'],
  c: ['C'],
};

/* ---- Work Type: maps the backend job_type field to clean labels. ---- */
const WORK_TYPE_OPTIONS = ['Full Time', 'Part Time', 'Shift Basis'];
const WORK_TYPE_DISPLAY: Record<string, string> = {
  'full-time': 'Full Time',
  'fulltime': 'Full Time',
  'part-time': 'Part Time',
  'parttime': 'Part Time',
  'shift basis': 'Shift Basis',
  shift: 'Shift Basis',
  'rotational shift': 'Shift Basis',
  internship: 'Internship',
  contract: 'Contract',
};

/* ---- Work Mode: maps the backend job_mode field to clean labels. ---- */
const WORK_MODE_OPTIONS = ['Remote', 'Hybrid', 'On Site'];
const WORK_MODE_DISPLAY: Record<string, string> = {
  remote: 'Remote',
  'work from home': 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On Site',
  'on site': 'On Site',
  'on-site': 'On Site',
  office: 'On Site',
  'in office': 'On Site',
};

/* ---- Experience: user-facing ranges compared against the numeric years
   stored/implied by the backend experience_required field. ---- */
const EXPERIENCE_RANGES = [
  { label: '1–2 Years', min: 1, max: 2 },
  { label: '3–5 Years', min: 3, max: 5 },
  { label: '6+ Years', min: 6, max: Number.POSITIVE_INFINITY },
];

/* ---- Position: broad ROLE CATEGORIES. The backend stores only a free-form
   job title, so titles are classified deterministically into the curated
   categories below (no DeepSeek, no per-title filter options). ---- */
const POSITION_CATEGORIES = [
  'HR', 'Trainee', 'Intern', 'Manager', 'Software Developer', 'Product Developer',
  'Data Scientist', 'Machine Learning Engineer', 'AI Engineer', 'UI/UX Designer',
  'Business Analyst', 'Marketing', 'Sales', 'Finance', 'Other',
];

const POSITION_CLASSIFIERS: { category: string; patterns: RegExp[] }[] = [
  { category: 'Intern', patterns: [/\bintern/i] },
  { category: 'Trainee', patterns: [/\btrainee/i] },
  { category: 'HR', patterns: [/\bhr\b/i, /human resource/i, /recruit/i, /talent/i, /people ops/i] },
  { category: 'Manager', patterns: [/\bmanager\b/i, /\bmanagement\b/i, /head of/i, /\bdirector\b/i] },
  { category: 'Machine Learning Engineer', patterns: [/machine learning/i, /\bml\b/i, /mlops/i, /deep learning/i, /ai\/ml/i] },
  { category: 'AI Engineer', patterns: [/artificial intelligence/i, /\bai\b/i, /\bnlp\b/i, /computer vision/i, /\bllm\b/i, /chatbot/i, /generative/i] },
  { category: 'Data Scientist', patterns: [/data scientist/i, /data science/i, /data analyst/i, /analytics/i, /\bds\b/i] },
  { category: 'UI/UX Designer', patterns: [/\bui\b/i, /\bux\b/i, /designer/i, /product design/i, /graphic design/i] },
  { category: 'Business Analyst', patterns: [/business analyst/i, /\bba\b/i] },
  { category: 'Product Developer', patterns: [/product developer/i, /product engineer/i, /product development/i] },
  { category: 'Finance', patterns: [/finance/i, /accountant/i, /accounting/i, /financial/i] },
  { category: 'Marketing', patterns: [/marketing/i, /\bseo\b/i, /content writer/i, /social media/i, /brand/i] },
  { category: 'Sales', patterns: [/sales/i, /business development/i, /account executive/i] },
  { category: 'Software Developer', patterns: [/developer/i, /engineer/i, /programmer/i, /full ?stack/i, /frontend/i, /front-end/i, /backend/i, /back-end/i, /software/i, /\bweb\b/i, /react/i, /java/i, /python/i, /node/i, /\bdev\b/i] },
];

/* Deterministically classify a free-form job title into one role category. */
function classifyPosition(title: string | null | undefined): string {
  const t = title || '';
  for (const cls of POSITION_CLASSIFIERS) {
    if (cls.patterns.some((p) => p.test(t))) return cls.category;
  }
  return 'Other';
}

/* Normalize a value for robust filter comparisons (trim, case, whitespace). */
function normalizeFilterValue(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/* Map a raw/internal backend value to a user-facing label via a lookup. */
function mapToDisplay(value: string | null | undefined, map: Record<string, string>): string | null {
  const key = normalizeFilterValue(value);
  if (!key) return null;
  return map[key] ?? null;
}

/* The clean domain categories a job belongs to (possibly several). */
function displayDomains(value: string | null | undefined): string[] {
  const key = normalizeFilterValue(value);
  if (!key) return [];
  return DOMAIN_DISPLAY_MAP[key] ?? [];
}

function displayWorkMode(value: string | null | undefined): string | null {
  return mapToDisplay(value, WORK_MODE_DISPLAY);
}

function workModeLabel(value: string | null | undefined): string {
  return displayWorkMode(value) ?? value ?? '';
}

/* Parse the numeric years from a free-text experience requirement. */
function parseExperienceYears(exp: string | null | undefined): number {
  if (!exp) return 0;
  const m = exp.match(/(\d+(?:\.\d+)?)/);
  const n = m ? parseFloat(m[1]) : 0;
  return Number.isFinite(n) ? n : 0;
}

/* Curated base options (user-facing) + clean options derived from real jobs. */
function domainOptions(jobs: Job[]): string[] {
  const opts = new Set<string>(DOMAIN_OPTIONS);
  jobs.forEach((job) => displayDomains(job.domain).forEach((d) => opts.add(d)));
  return [...opts].sort((a, b) => a.localeCompare(b));
}

function workTypeOptions(jobs: Job[]): string[] {
  const opts = new Set<string>(WORK_TYPE_OPTIONS);
  jobs.forEach((job) => {
    if (job.workType) opts.add(job.workType);
  });
  return [...opts].sort((a, b) => a.localeCompare(b));
}

function workModeOptions(jobs: Job[]): string[] {
  const opts = new Set<string>(WORK_MODE_OPTIONS);
  jobs.forEach((job) => {
    const l = displayWorkMode(job.workMode);
    if (l) opts.add(l);
  });
  return [...opts].sort((a, b) => a.localeCompare(b));
}

function parseSalaryNumber(salary: string | null | undefined): number {
  if (!salary) return 0;
  const n = parseInt(salary.replace(/[^0-9]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function createdAtTimestamp(createdAt: string | null | undefined): number {
  if (!createdAt) return 0;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? t : 0;
}

interface Filters {
  search: string;
  domains: string[];
  positions: string[];
  workTypes: string[];
  experience: string[];
  workModes: string[];
  location: string;
  salaryMin: number;
  posted: string[];
  aiMatch: string[];
}

const DEFAULT_FILTERS: Filters = {
  search: '', domains: [], positions: [], workTypes: [], experience: [], workModes: [],
  location: '', salaryMin: 0, posted: [], aiMatch: [],
};

function FilterSidebar({ filters, onChange, onReset, options }: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onReset: () => void;
  options: { domains: string[]; positions: string[]; workTypes: string[]; experience: string[]; workModes: string[] };
}) {
  const toggle = (key: keyof Filters, value: string) => {
    const arr = filters[key] as string[];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    onChange({ ...filters, [key]: next });
  };

  const renderCheckboxGroup = (label: string, key: keyof Filters, options: string[]) => (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      {options.length === 0 ? (
        <p className="text-[10px] text-gray-600">None available</p>
      ) : (
        options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={(filters[key] as string[]).includes(opt)}
              onChange={() => toggle(key, opt)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-transparent accent-blue-500"
            />
            <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">{opt}</span>
          </label>
        ))
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Filters</h3>
        <button onClick={onReset} className="text-[10px] text-primary-light hover:text-primary transition-colors">
          Reset Filters
        </button>
      </div>

      {renderCheckboxGroup('Domain', 'domains', options.domains)}
      {renderCheckboxGroup('Position', 'positions', options.positions)}
      {renderCheckboxGroup('Work Type', 'workTypes', options.workTypes)}
      {renderCheckboxGroup('Experience', 'experience', options.experience)}
      {renderCheckboxGroup('Work Mode', 'workModes', options.workModes)}

      {/* Location */}
      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Location</p>
        <input
          type="text"
          value={filters.location}
          onChange={(e) => onChange({ ...filters, location: e.target.value })}
          placeholder="Search location..."
          className="w-full text-xs bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none"
        />
      </div>

      {/* Salary Range */}
      <div className="space-y-2">
        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Salary Range</p>
        <input
          type="range"
          min={0} max={50} step={5}
          value={filters.salaryMin}
          onChange={(e) => onChange({ ...filters, salaryMin: Number(e.target.value) })}
          className="w-full accent-blue-500"
        />
        <p className="text-[10px] text-gray-500">₹{filters.salaryMin}K/mo minimum</p>
      </div>

      {renderCheckboxGroup('Posted', 'posted', POSTED)}
      {renderCheckboxGroup('AI Match', 'aiMatch', AI_MATCH)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job Card                                                           */
/* ------------------------------------------------------------------ */

function JobCard({ job, onViewDetails, onApply, onSave, saved, applied }: {
  job: Job;
  onViewDetails: () => void;
  onApply: () => void;
  onSave: () => void;
  saved: boolean;
  applied: boolean;
}) {
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ y: -3 }}
      className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:shadow-lg hover:shadow-black/20 transition-all duration-300 card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-primary-light">{job.company[0]}</span>
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{job.title}</h3>
            <p className="text-xs text-gray-400 truncate">{job.company}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${getStatusStyle(job.status)}`}>{job.status}</span>
          <MatchRing score={job.aiMatch} size={44} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-3 text-[10px] text-gray-500">
        <span>📍 {job.location}</span>
        {job.workType && <span>💼 {job.workType}</span>}
        <span>🎯 {job.experience}</span>
        <span>💰 {job.salary}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3">
        {job.skills.map((s) => (
          <span key={s} className="text-[9px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">{s}</span>
        ))}
      </div>

      <div className="flex items-center justify-between mt-3 text-[10px] text-gray-600">
        <span>Posted {job.postedDate}</span>
        <span>Deadline: {job.deadline}</span>
        <span>{job.applicants} applicants</span>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={onSave}
          className={`shrink-0 p-2 rounded-xl border transition-all ${
            saved ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-yellow-400'
          }`}
          title={saved ? 'Saved' : 'Save Job'}
        >
          <svg className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
          </svg>
        </button>
        <button
          onClick={onViewDetails}
          className="flex-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 rounded-xl transition-all"
        >
          View Details
        </button>
        <button
          onClick={onApply}
          disabled={applied}
          className={`flex-1 text-xs font-semibold py-2 rounded-xl transition-all ${
            applied
              ? 'bg-green-500/10 border border-green-500/20 text-green-400 cursor-not-allowed'
              : 'bg-primary hover:bg-primary-hover text-white btn-lift'
          }`}
        >
          {applied ? 'Already Applied' : 'Apply Now'}
        </button>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Match Modal                                                        */
/* ------------------------------------------------------------------ */

function MatchModal({ job, onClose }: { job: Job; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-navy-900 border border-white/10 rounded-2xl p-6 max-w-md w-full space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Why this Match?</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-4">
          <MatchRing score={job.aiMatch} size={64} />
          <div>
            <p className="text-sm font-bold text-white">{job.aiMatch}% AI Match</p>
            <p className="text-xs text-gray-500">{job.title} at {job.company}</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] text-green-400 uppercase tracking-wider font-semibold mb-2">Matched Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {job.matchedSkills.map((s) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">✓ {s}</span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] text-yellow-400 uppercase tracking-wider font-semibold mb-2">Missing Skills</p>
          <div className="flex flex-wrap gap-1.5">
            {job.missingSkills.map((s) => (
              <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">○ {s}</span>
            ))}
          </div>
        </div>

        <div className="bg-primary/5 border border-primary/10 rounded-xl p-3">
          <p className="text-xs text-gray-300">{job.recommendation}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Job Details Modal                                                  */
/* ------------------------------------------------------------------ */

function JobDetailsModal({ job, onClose, onApply, onSave, saved, applied }: {
  job: Job;
  onClose: () => void;
  onApply: () => void;
  onSave: () => void;
  saved: boolean;
  applied: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-navy-900 border border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-navy-900/95 backdrop-blur border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-light">{job.company[0]}</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{job.title}</h3>
              <p className="text-xs text-gray-400">{job.company} · {job.location}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-white/10">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap gap-2 text-[10px] text-gray-500">
            {job.workType && <span>💼 {job.workType}</span>}<span>🎯 {job.experience}</span><span>💰 {job.salary}</span>
            <span>🏢 {workModeLabel(job.workMode)}</span><span>📅 Deadline: {job.deadline}</span>
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Job Description</p>
            {job.description ? (
              <p className="text-sm text-gray-300">{job.description}</p>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Responsibilities</p>
            {job.responsibilities.length > 0 ? (
              <ul className="space-y-1.5">
                {job.responsibilities.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="text-primary-light shrink-0 mt-0.5">•</span> {r}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Required Skills</p>
            {job.skills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary-light border border-primary/20">{s}</span>)}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Preferred Skills</p>
            {job.preferredSkills.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {job.preferredSkills.map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">{s}</span>)}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Company Overview</p>
            {job.companyOverview ? (
              <p className="text-sm text-gray-300">{job.companyOverview}</p>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Benefits</p>
            {job.benefits.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {job.benefits.map((b) => <span key={b} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">✓ {b}</span>)}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Hiring Process</p>
            {job.hiringProcess.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                {job.hiringProcess.map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">{i + 1}. {step}</span>
                    {i < job.hiringProcess.length - 1 && <span className="text-gray-600 text-xs">→</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3">
            <p className="text-[10px] text-yellow-400 uppercase tracking-wider font-semibold mb-1">Recruiter Notes</p>
            {job.recruiterNotes ? (
              <p className="text-xs text-gray-400">{job.recruiterNotes}</p>
            ) : (
              <p className="text-xs text-gray-600 italic">Not specified</p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={onSave} className={`shrink-0 p-2.5 rounded-xl border transition-all ${saved ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' : 'bg-white/5 border-white/10 text-gray-400 hover:text-yellow-400'}`}>
              <svg className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
            </button>
            <button onClick={onApply} disabled={applied}
              className={`flex-1 text-sm font-semibold py-2.5 rounded-xl transition-all ${applied ? 'bg-green-500/10 border border-green-500/20 text-green-400 cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white btn-lift'}`}>
              {applied ? 'Already Applied' : 'Apply Now'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Apply Confirmation Modal                                           */
/* ------------------------------------------------------------------ */

function ApplyModal({ job, onClose, onConfirm, submitting = false }: { job: Job; onClose: () => void; onConfirm: () => void; submitting?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-navy-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full text-center space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-4xl">📝</div>
        <h3 className="text-lg font-bold text-white">Apply for {job.title}?</h3>
        <p className="text-sm text-gray-400">Your application will be submitted to {job.company}.</p>
        <div className="flex gap-3">
          <button onClick={onClose} disabled={submitting} className="flex-1 text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 rounded-xl transition-all disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={submitting} className="flex-1 text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 rounded-xl transition-all btn-lift disabled:opacity-50">
            {submitting ? 'Submitting…' : 'Confirm Apply'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState({
  resetLabel = 'Reset Filters',
  title = 'No Jobs Found',
  message = 'Try adjusting your search or filters to find more opportunities.',
  onReset,
  onDashboard,
}: {
  resetLabel?: string;
  title?: string;
  message?: string;
  onReset: () => void;
  onDashboard: () => void;
}) {
  return (
    <motion.div variants={staggerItem} className="bg-white/5 border border-white/10 rounded-2xl p-10 md:p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="text-6xl mb-6">🔍</div>
        <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">{title}</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">{message}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={onReset} className="text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-6 rounded-xl transition-all btn-lift">{resetLabel}</button>
          <button onClick={onDashboard} className="text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 px-6 rounded-xl transition-all">Back to Dashboard</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/3 bg-white/10 rounded" />
              <div className="h-2 w-1/3 bg-white/10 rounded" />
            </div>
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-2 w-full bg-white/10 rounded" />
            <div className="h-2 w-3/4 bg-white/10 rounded" />
          </div>
          <div className="flex gap-2 mt-4">
            <div className="h-8 flex-1 bg-white/10 rounded-xl" />
            <div className="h-8 flex-1 bg-white/10 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error State                                                        */
/* ------------------------------------------------------------------ */

function ErrorState({ message, onRetry, onDashboard }: { message: string; onRetry: () => void; onDashboard: () => void }) {
  return (
    <motion.div variants={staggerItem} className="bg-white/5 border border-red-500/20 rounded-2xl p-10 md:p-16 text-center">
      <div className="max-w-md mx-auto">
        <div className="text-6xl mb-6">⚠️</div>
        <h2 className="text-xl md:text-2xl font-extrabold text-white mb-3">Couldn't Load Jobs</h2>
        <p className="text-sm text-gray-400 leading-relaxed mb-8">{message}</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={onRetry} className="text-sm bg-primary hover:bg-primary-hover text-white font-semibold py-3 px-6 rounded-xl transition-all btn-lift">Retry</button>
          <button onClick={onDashboard} className="text-sm bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-3 px-6 rounded-xl transition-all">Back to Dashboard</button>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantAvailableJobs() {
  const navigate = useNavigate();
  const [applicantId, setApplicantId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [appliedJobIds, setAppliedJobIds] = useState<Set<number>>(new Set());
  const [successMsg, setSuccessMsg] = useState('');
  /* Non-matching attempts are still recorded; they get an informational
     message instead of a plain success one. */
  const [noticeMsg, setNoticeMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState('newest');
  const [savedJobs, setSavedJobs] = useState<Set<number>>(new Set());
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [matchJob, setMatchJob] = useState<Job | null>(null);
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  /* Auth check — identity comes from the authenticated applicant session. */
  useEffect(() => {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) {
      navigate('/applicant/login', { replace: true });
      return;
    }
    try {
      const s: { applicant_id?: string } = JSON.parse(raw);
      if (!s.applicant_id) {
        navigate('/applicant/login', { replace: true });
        return;
      }
      setApplicantId(s.applicant_id);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  /* Load real OPEN jobs + the jobs this applicant has already applied to.
     The backend is the source of truth; appliedJobIds is derived from it. */
  const loadJobs = useCallback(async () => {
    if (!applicantId) return;
    setLoading(true);
    setError('');
    try {
      const [rawJobs, appliedRes, profile] = await Promise.all([
        fetchOpenJobs(),
        getJson(`/applicant/applied-positions/${applicantId}`).catch(() => [] as unknown[]),
        getJson<{ skills?: string } | null>(`/applicant/profile/${applicantId}`).catch(() => null),
      ]);

      const applicantSkills: string[] = profile?.skills ? parseSkillList(profile.skills) : [];
      const jobList = rawJobs.map((raw) => mapBackendJob(raw, applicantSkills));
      const applied = new Set<number>(
        (Array.isArray(appliedRes) ? appliedRes : [])
          .map((a) => (a as { job_id?: number }).job_id)
          .filter((jid): jid is number => typeof jid === 'number' && jid > 0)
      );

      setJobs(jobList);
      setAppliedJobIds(applied);
      setLoading(false);
    } catch (err) {
      setError(requestErrorMessage(err, 'Failed to load jobs. Please try again.'));
      setLoading(false);
    }
  }, [applicantId]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  /* Refresh when the tab/window regains focus. Returning to this page in the
     SPA remounts the component, which re-runs the effect above. Avoids
     continuous polling / unnecessary requests. */
  useEffect(() => {
    const onWindowFocus = () => loadJobs();
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('pageshow', onWindowFocus);
    return () => {
      window.removeEventListener('focus', onWindowFocus);
      window.removeEventListener('pageshow', onWindowFocus);
    };
  }, [loadJobs]);

  /* Filter option lists: curated user-facing categories + options derived
     from the actual fetched jobs (always through the clean display maps). */
  const filterOptions = useMemo(
    () => ({
      domains: domainOptions(jobs),
      positions: POSITION_CATEGORIES,
      workTypes: workTypeOptions(jobs),
      experience: EXPERIENCE_RANGES.map((r) => r.label),
      workModes: workModeOptions(jobs),
    }),
    [jobs]
  );

  /* ONE final job-processing pipeline: dedup (done at fetch) -> search ->
     domain -> position -> work type -> experience -> work mode -> extras ->
     sort. No competing filtered arrays exist; this list is what renders. */
  const filteredJobs = useMemo(() => {
    let list = [...jobs];

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter((j) =>
        j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q) ||
        j.skills.some((s) => s.toLowerCase().includes(q)) || j.location.toLowerCase().includes(q)
      );
    }
    if (filters.domains.length) {
      list = list.filter((j) =>
        filters.domains.some((d) =>
          displayDomains(j.domain).some((dd) => normalizeFilterValue(dd) === normalizeFilterValue(d))
        )
      );
    }
    if (filters.positions.length) {
      list = list.filter((j) =>
        filters.positions.some((p) => normalizeFilterValue(p) === normalizeFilterValue(classifyPosition(j.position)))
      );
    }
    if (filters.workTypes.length) {
      list = list.filter((j) => filters.workTypes.some((w) => normalizeFilterValue(w) === normalizeFilterValue(j.workType)));
    }
    if (filters.experience.length) {
      list = list.filter((j) => {
        const years = parseExperienceYears(j.experience);
        return filters.experience.some((label) => {
          const range = EXPERIENCE_RANGES.find((r) => r.label === label);
          return !!range && years >= range.min && years <= range.max;
        });
      });
    }
    if (filters.workModes.length) {
      list = list.filter((j) =>
        filters.workModes.some((w) => normalizeFilterValue(w) === normalizeFilterValue(displayWorkMode(j.workMode) ?? ''))
      );
    }
    if (filters.location.trim()) list = list.filter((j) => j.location.toLowerCase().includes(filters.location.toLowerCase()));
    if (filters.salaryMin > 0) {
      const min = filters.salaryMin * 1000;
      list = list.filter((j) => parseSalaryNumber(j.salary) >= min);
    }
    if (filters.posted.length) {
      const maxDays = Math.max(...filters.posted.map((p) => POSTED_DAYS[p] ?? 0));
      const cutoff = Date.now() - maxDays * 86400000;
      list = list.filter((j) => createdAtTimestamp(j.createdAt) >= cutoff);
    }
    if (filters.aiMatch.length) {
      const minMatch = Math.min(...filters.aiMatch.map((m) => parseInt(m, 10)));
      list = list.filter((j) => j.aiMatch >= minMatch);
    }

    switch (sortBy) {
      case 'match': list.sort((a, b) => b.aiMatch - a.aiMatch); break;
      case 'salary': list.sort((a, b) => parseSalaryNumber(b.salary) - parseSalaryNumber(a.salary)); break;
      case 'applicants': list.sort((a, b) => b.applicants - a.applicants); break;
      default: list.sort((a, b) => createdAtTimestamp(b.createdAt) - createdAtTimestamp(a.createdAt)); break;
    }
    return list;
  }, [jobs, filters, sortBy]);

  /* Single reset for the left-side filters AND the right-side sort control. */
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSortBy('newest');
  }, []);

  const handleApply = useCallback((job: Job) => {
    setApplyJob(job);
  }, []);

  const confirmApply = useCallback(async () => {
    if (!applyJob) return;
    if (!applicantId) {
      setError('You must be logged in to apply.');
      return;
    }
    /* Prevent duplicate applications before hitting the API. */
    if (appliedJobIds.has(applyJob.id)) {
      setSuccessMsg('You have already applied for this job.');
      setApplyJob(null);
      setTimeout(() => setSuccessMsg(''), 4000);
      return;
    }

    setSubmitting(true);
    setError('');
    setNoticeMsg('');
    try {
      const res = (await postJson('/applicant/apply', {
        applicant_id: applicantId,
        job_id: applyJob.id,
      })) as { match_status?: string | null } | null;
      /* Backend confirmed — update local set for immediate UI feedback only. */
      setAppliedJobIds((prev) => new Set(prev).add(applyJob.id));
      setApplyJob(null);
      if (res?.match_status === 'unmatched') {
        /* The attempt is recorded; only the role fit is missing. */
        setNoticeMsg(
          "Your skills and experience don't currently match the requirements for this role. Your application attempt has been recorded."
        );
      } else {
        setSuccessMsg(
          'Application submitted successfully. Your skills and experience match this role.'
        );
      }
      setTimeout(() => { setSuccessMsg(''); setNoticeMsg(''); }, 6000);
    } catch (err) {
      const message = requestErrorMessage(err, 'Failed to submit application.');
      if (/already applied/i.test(message)) {
        setAppliedJobIds((prev) => new Set(prev).add(applyJob.id));
        setSuccessMsg('You have already applied for this job.');
      } else {
        setError(message);
      }
      setApplyJob(null);
      setTimeout(() => { setSuccessMsg(''); setError(''); setNoticeMsg(''); }, 5000);
    } finally {
      setSubmitting(false);
    }
  }, [applyJob, applicantId, appliedJobIds]);

  const handleSave = useCallback((jobId: number) => {
    setSavedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  }, []);

  return (
    <ApplicantLayout activePage="available-jobs">
      {/* Fixed-height page shell: header/search/filters stay put, only the
          job list scrolls. Topbar (70px) + footer (67px) + small safety
          margin so the surrounding app never scrolls. The ref applies the
          vh fallback first, then upgrades to dvh where supported so mobile
          browser chrome is accounted for without a duplicate object key. */}
      <div
        className="max-w-7xl mx-auto w-full px-6 pt-4 md:pt-6 flex flex-col overflow-hidden space-y-6"
        ref={(el) => {
          if (el) {
            el.style.height = 'calc(100vh - 152px)';
            if (typeof CSS !== 'undefined' && CSS.supports('height', '100dvh')) {
              el.style.height = 'calc(100dvh - 152px)';
            }
          }
        }}
      >
        {successMsg && (
          <div className="shrink-0 p-3 bg-green-500/10 border border-green-500/30 rounded-2xl text-green-300 text-sm">
            {successMsg}
          </div>
        )}

        {noticeMsg && (
          <div className="shrink-0 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl text-yellow-200 text-sm">
            {noticeMsg}
          </div>
        )}

        {/* Header */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">Available Jobs</motion.h1>
              <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">
                Explore all active opportunities posted by companies and find the role that best matches your skills.
              </motion.p>
            </div>
            <motion.div variants={staggerItem} className="shrink-0 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center">
              <p className="text-2xl font-extrabold text-primary-light"><AnimatedCounter value={filteredJobs.length} /></p>
              <p className="text-[10px] text-gray-500">Open Positions</p>
            </motion.div>
          </div>
        </motion.section>

        {/* Search + Sort */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0 flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search by Job Title, Company, Skills, Technology, Location, Role..."
              className="w-full text-sm bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className="md:hidden text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium px-4 py-3 rounded-xl transition-all">
              Filters
            </button>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
              className="text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-3 text-gray-400 focus:border-primary/50 focus:outline-none">
              <option value="newest">Newest</option>
              <option value="match">Highest AI Match</option>
              <option value="salary">Highest Salary</option>
              <option value="applicants">Most Applicants</option>
            </select>
          </div>
        </motion.section>

        {/* Content */}
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Filter Sidebar - Desktop (fixed; scrolls internally only if needed) */}
          <motion.aside variants={staggerContainer} initial="hidden" animate="visible"
            className="hidden md:block w-56 shrink-0 min-h-0 overflow-y-auto">
            <GlassCard>
              <FilterSidebar filters={filters} onChange={setFilters} onReset={resetFilters} options={filterOptions} />
            </GlassCard>
          </motion.aside>

          {/* Filter Drawer - Mobile */}
          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setShowFilters(false)}>
                <motion.div initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
                  className="absolute left-0 top-0 bottom-0 w-72 bg-navy-900 border-r border-white/10 p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <FilterSidebar filters={filters} onChange={setFilters} onReset={resetFilters} options={filterOptions} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Job Grid - the ONLY vertical scroll area on the page */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pr-1 pb-4">
            {loading ? (
              <LoadingSkeleton />
            ) : error ? (
              <ErrorState message={error} onRetry={loadJobs} onDashboard={() => navigate('/applicant/dashboard')} />
            ) : jobs.length === 0 ? (
              <EmptyState
                title="No Jobs Available Right Now"
                message="New opportunities will appear here when they are published."
                resetLabel="Refresh"
                onReset={loadJobs}
                onDashboard={() => navigate('/applicant/dashboard')}
              />
            ) : filteredJobs.length === 0 ? (
              <EmptyState onReset={resetFilters} onDashboard={() => navigate('/applicant/dashboard')} />
            ) : (
              <>
                <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {filteredJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      saved={savedJobs.has(job.id)}
                      applied={appliedJobIds.has(job.id)}
                      onViewDetails={() => setSelectedJob(job)}
                      onApply={() => handleApply(job)}
                      onSave={() => handleSave(job.id)}
                    />
                  ))}
                </motion.div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {matchJob && <MatchModal job={matchJob} onClose={() => setMatchJob(null)} />}
        {selectedJob && (
          <JobDetailsModal
            job={selectedJob}
            saved={savedJobs.has(selectedJob.id)}
            applied={appliedJobIds.has(selectedJob.id)}
            onClose={() => setSelectedJob(null)}
            onApply={() => handleApply(selectedJob)}
            onSave={() => handleSave(selectedJob.id)}
          />
        )}
        {applyJob && <ApplyModal job={applyJob} onClose={() => setApplyJob(null)} onConfirm={confirmApply} submitting={submitting} />}
      </AnimatePresence>
    </ApplicantLayout>
  );
}