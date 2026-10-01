import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, postJson, endSession } from '../services/api';
import {
  DEPARTMENT_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  EXPERIENCE_OPTIONS,
  ROLE_TEMPLATES,
  WORK_MODE_OPTIONS,
  buildJobTemplate,
  getRoleOption,
} from '../services/jobTemplates';
import HrSidebar from '../components/hr/HrSidebar';
import { BulkActionButton, BulkSelectBar, RowCheckbox } from '../components/hr/BulkSelectBar';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface JobPost {
  id: number;
  job_title: string;
  status: string;
  created_at?: string;
  job_domain?: string;
  location?: string;
  job_type?: string;
  job_mode?: string;
  experience_required?: string;
  description?: string;
}

interface CreateJobPayload {
  hr_id: number;
  job_title: string;
  job_domain: string;
  job_type: string;
  job_mode: string;
  experience_required: string;
  location: string;
  description: string;
  salary: string;
  deadline: string;
  required_skills: string;
  preferred_skills: string;
  responsibilities: string;
  company_overview: string;
  benefits: string;
  hiring_process: string;
  recruiter_notes: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 animate-pulse">
      <div className="h-3 w-20 bg-white/10 rounded mb-3" />
      <div className="h-8 w-12 bg-white/10 rounded" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirm Dialog                                                     */
/* ------------------------------------------------------------------ */

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="bg-navy-800 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-400 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Closing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HrJobPosts() {
  const navigate = useNavigate();

  const [session, setSession] = useState<HrSession | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  const [jobs, setJobs] = useState<JobPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CreateJobPayload>({
    hr_id: 0,
    job_title: '',
    job_domain: 'ML / Data Science',
    job_type: 'Full-time',
    job_mode: 'Remote',
    experience_required: '',
    location: '',
    description: '',
    salary: '',
    deadline: '',
    required_skills: '',
    preferred_skills: '',
    responsibilities: '',
    company_overview: '',
    benefits: '',
    hiring_process: '',
    recruiter_notes: '',
  });

  /* Template quick-start state (pre-fills the same form fields above). */
  const [templateRole, setTemplateRole] = useState(ROLE_TEMPLATES[0]?.value ?? 'software-engineer');
  const [templateDept, setTemplateDept] = useState(ROLE_TEMPLATES[0]?.department ?? 'Engineering');
  const [templateExp, setTemplateExp] = useState(EXPERIENCE_OPTIONS[1] ?? '1-2 years');
  const [templateType, setTemplateType] = useState(EMPLOYMENT_TYPE_OPTIONS[0] ?? 'Full-time');
  const [templateMode, setTemplateMode] = useState(WORK_MODE_OPTIONS[0] ?? 'Remote');
  const [templateLocation, setTemplateLocation] = useState('');
  const [templateMsg, setTemplateMsg] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [closeTarget, setCloseTarget] = useState<JobPost | null>(null);
  const [closing, setClosing] = useState(false);

  /* Multi-select for bulk close. Only open job posts can be selected, because
     closing is the only bulk action a job post supports. */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkClosing, setBulkClosing] = useState(false);

  const [successMsg, setSuccessMsg] = useState('');

  /* ---------- Auth check ---------- */
  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) {
      navigate('/hr/login', { replace: true });
      return;
    }
    try {
      const s: HrSession = JSON.parse(raw);
      if (!s.hr_id) {
        navigate('/hr/login', { replace: true });
        return;
      }
      setSession(s);
      setFormData((prev) => ({ ...prev, hr_id: s.hr_id }));
    } catch {
      navigate('/hr/login', { replace: true });
    }
  }, [navigate]);

  /* ---------- Fetch jobs ---------- */
  const fetchJobs = () => {
    if (!session?.hr_id) return;
    setLoading(true);
    setError('');
    getJson<JobPost[]>(`/hr/job-posts/${session.hr_id}`)
      .then((d) => {
        setJobs(Array.isArray(d) ? d : []);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load job posts.');
        setLoading(false);
      });
  };

  useEffect(() => {
    if (session?.hr_id) fetchJobs();
  }, [session?.hr_id]);

  /* ---------- Handlers ---------- */
  const handleLogout = () => {
    // Revoke the server-side session so the HttpOnly cookie cannot be reused.
    void endSession('hr');
    sessionStorage.removeItem('quno_hr_session');
    navigate('/hr/login');
  };

  const handleMainClick = () => {
    if (!sidebarCollapsed) setSidebarCollapsed(true);
  };

  /* ---------- Template quick-start ---------- */
  const handleTemplateRoleChange = (roleValue: string) => {
    setTemplateRole(roleValue);
    const option = getRoleOption(roleValue);
    if (option) setTemplateDept(option.department);
  };

  const handleApplyTemplate = () => {
    const template = buildJobTemplate({
      roleValue: templateRole,
      department: templateDept,
      experience: templateExp,
      employmentType: templateType,
      workMode: templateMode,
      location: templateLocation.trim(),
    });
    setFormData((prev) => ({ ...prev, ...template }));
    setFormError('');
    setTemplateMsg(
      `Pre-filled the form with the ${getRoleOption(templateRole)?.label ?? 'role'} template. Review and edit before publishing.`,
    );
  };

  /* ---------- Create job ---------- */
  const handleCreate = async () => {
    setFormError('');
    if (!formData.job_title.trim()) {
      setFormError('Job Title is required.');
      return;
    }
    setSubmitting(true);
    try {
      await postJson('/hr/job-post', { ...formData, job_title: formData.job_title.trim() });
      setSuccessMsg('Job post created successfully!');
      setShowForm(false);
      setFormData((prev) => ({
        ...prev,
        job_title: '',
        job_domain: 'ML / Data Science',
        job_type: 'Full-time',
        job_mode: 'Remote',
        experience_required: '',
        location: '',
        description: '',
        salary: '',
        deadline: '',
        required_skills: '',
        preferred_skills: '',
        responsibilities: '',
        company_overview: '',
        benefits: '',
        hiring_process: '',
        recruiter_notes: '',
      }));
      setTemplateLocation('');
      fetchJobs();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setFormError('Server is busy. Please try again in a moment.');
      } else {
        setFormError(err instanceof Error ? err.message : 'Failed to create job post.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Close job ---------- */
  const handleCloseJob = async () => {
    if (!closeTarget) return;
    setClosing(true);
    try {
      await postJson(`/hr/job-post/${closeTarget.id}/close`, {});
      setSuccessMsg('Job closed successfully!');
      setCloseTarget(null);
      fetchJobs();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Failed to close job.';
      setError(msg);
      setCloseTarget(null);
    } finally {
      setClosing(false);
    }
  };

  /* ---------- Multi-select (open job posts only) ---------- */
  const selectableJobs = useMemo(
    () => jobs.filter((j) => j.status?.toLowerCase() === 'open'),
    [jobs]
  );

  const selectableIds = useMemo(() => selectableJobs.map((j) => j.id), [selectableJobs]);

  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  };

  const toggleSelected = (jobId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  };

  /* Drop posts that are no longer open (a refresh, or a close already applied)
     so the bulk action can never target a stale selection. */
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => selectableIds.includes(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [selectableIds]);

  /* ---------- Bulk close ---------- */
  const handleBulkClose = async () => {
    if (selectedIds.size === 0 || bulkClosing) return;
    setBulkClosing(true);
    try {
      const res = await postJson<{ closed?: number[]; skipped?: number[] }>(
        '/hr/job-posts/bulk-close',
        { job_ids: [...selectedIds] }
      );
      const closed = Array.isArray(res?.closed) ? res.closed.length : 0;
      const skipped = Array.isArray(res?.skipped) ? res.skipped.length : 0;

      setSelectedIds(new Set());
      setBulkConfirm(false);
      fetchJobs();

      if (closed === 0) {
        setError('None of the selected job posts could be closed.');
        return;
      }
      setSuccessMsg(
        `${closed} job post${closed === 1 ? '' : 's'} closed.` +
          (skipped ? ` ${skipped} skipped.` : '')
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: unknown) {
      setBulkConfirm(false);
      setError(err instanceof Error ? err.message : 'Failed to close the selected job posts.');
    } finally {
      setBulkClosing(false);
    }
  };

  /* ---------- Guard ---------- */
  if (!session) return null;

  const { hr_name, company_name } = session;
  const activeJobs = jobs.filter((j) => j.status?.toLowerCase() === 'open').length;
  const closedJobs = jobs.filter((j) => j.status?.toLowerCase() === 'closed').length;

  /* ---------- Form field helper ---------- */
  const updateField = (field: keyof CreateJobPayload, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const inputCls =
    'w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors';
  const labelCls = 'block text-xs text-gray-500 uppercase tracking-wider mb-1.5';
  const selectCls = inputCls;

  return (
    <div className="min-h-screen bg-navy-950 flex">
      {/* Sidebar */}
      <HrSidebar
        hrName={hr_name}
        companyName={company_name}
        activePage="job-posts"
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((v) => !v)}
        onLogout={handleLogout}
      />

      {/* Mobile hamburger */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed top-4 left-4 z-20 md:hidden bg-navy-800 border border-white/10 rounded-xl p-2 text-white shadow-lg"
          aria-label="Open sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* Main content */}
      <main
        className="flex-1 min-w-0 min-h-screen overflow-y-auto"
        onClick={handleMainClick}
      >
        <div className="max-w-7xl mx-auto px-6 py-6 md:py-10">
          {/* Success toast */}
          {successMsg && (
            <div className="mb-6 p-3 bg-green-500/10 border border-green-500/30 rounded-2xl text-green-300 text-sm">
              {successMsg}
            </div>
          )}

          {/* Error toast */}
          {error && !loading && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white">Job Posts</h1>
              <p className="text-gray-500 text-sm mt-1">
                Manage your open positions, track applications, and monitor hiring progress
              </p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="shrink-0 bg-primary hover:bg-primary-hover text-white font-semibold rounded-xl px-5 py-2.5 text-sm transition-colors"
            >
              + New Job Post
            </button>
          </div>

          {/* Overview cards */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : (
              <>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Jobs Posted</p>
                  <p className="text-3xl font-extrabold text-white">{jobs.length}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Active Jobs</p>
                  <p className="text-3xl font-extrabold text-green-400">{activeJobs}</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Closed Jobs</p>
                  <p className="text-3xl font-extrabold text-gray-400">{closedJobs}</p>
                </div>
              </>
            )}
          </section>

          {/* Create Job Form Panel */}
          {showForm && (
            <div className="mb-8 bg-navy-800/60 border border-white/10 rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4">Create New Job Post</h2>

              {/* Template quick-start (pre-fills the editable fields below) */}
              <div className="mb-5 bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                  Start from a template (optional)
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Job role / position</label>
                    <select
                      value={templateRole}
                      onChange={(e) => handleTemplateRoleChange(e.target.value)}
                      className={selectCls}
                    >
                      {ROLE_TEMPLATES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Department</label>
                    <select
                      value={templateDept}
                      onChange={(e) => setTemplateDept(e.target.value)}
                      className={selectCls}
                    >
                      {DEPARTMENT_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Experience level</label>
                    <select
                      value={templateExp}
                      onChange={(e) => setTemplateExp(e.target.value)}
                      className={selectCls}
                    >
                      {EXPERIENCE_OPTIONS.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Employment type</label>
                    <select
                      value={templateType}
                      onChange={(e) => setTemplateType(e.target.value)}
                      className={selectCls}
                    >
                      {EMPLOYMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Work mode</label>
                    <select
                      value={templateMode}
                      onChange={(e) => setTemplateMode(e.target.value)}
                      className={selectCls}
                    >
                      {WORK_MODE_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Location</label>
                    <input
                      type="text"
                      placeholder="e.g. Remote, New York"
                      value={templateLocation}
                      onChange={(e) => setTemplateLocation(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleApplyTemplate}
                    disabled={submitting}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-white/10 hover:bg-white/15 disabled:opacity-50 transition-colors"
                  >
                    Use Template
                  </button>
                  {templateMsg && (
                    <p className="text-xs text-gray-400">{templateMsg}</p>
                  )}
                </div>
              </div>

              {formError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Job Title */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Job Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Senior ML Engineer"
                    value={formData.job_title}
                    onChange={(e) => updateField('job_title', e.target.value)}
                    className={inputCls}
                    required
                  />
                </div>

                {/* Job Domain */}
                <div>
                  <label className={labelCls}>Job Domain *</label>
                  <select
                    value={formData.job_domain}
                    onChange={(e) => updateField('job_domain', e.target.value)}
                    className={selectCls}
                  >
                    {DEPARTMENT_OPTIONS.includes(formData.job_domain) ? null : (
                      <option value={formData.job_domain}>{formData.job_domain}</option>
                    )}
                    {DEPARTMENT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location */}
                <div>
                  <label className={labelCls}>Location</label>
                  <input
                    type="text"
                    placeholder="e.g. Remote, New York"
                    value={formData.location}
                    onChange={(e) => updateField('location', e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Job Type */}
                <div>
                  <label className={labelCls}>Job Type</label>
                  <select
                    value={formData.job_type}
                    onChange={(e) => updateField('job_type', e.target.value)}
                    className={selectCls}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Internship">Internship</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>

                {/* Job Mode */}
                <div>
                  <label className={labelCls}>Job Mode</label>
                  <select
                    value={formData.job_mode}
                    onChange={(e) => updateField('job_mode', e.target.value)}
                    className={selectCls}
                  >
                    <option value="Remote">Remote</option>
                    <option value="Onsite">Onsite</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>

                {/* Experience Required */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Experience Required</label>
                  <input
                    type="text"
                    placeholder="e.g. 3-5 years"
                    value={formData.experience_required}
                    onChange={(e) => updateField('experience_required', e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Job Description</label>
                  <textarea
                    rows={4}
                    placeholder="Describe the role, responsibilities, and qualifications..."
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Salary */}
                <div>
                  <label className={labelCls}>Salary</label>
                  <input
                    type="text"
                    placeholder="e.g. Competitive, $80k-$120k"
                    value={formData.salary}
                    onChange={(e) => updateField('salary', e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Deadline */}
                <div>
                  <label className={labelCls}>Application Deadline</label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-12-31"
                    value={formData.deadline}
                    onChange={(e) => updateField('deadline', e.target.value)}
                    className={inputCls}
                  />
                </div>

                {/* Required Skills */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Required Skills</label>
                  <textarea
                    rows={2}
                    placeholder="Comma or line separated, e.g. Python, SQL, React"
                    value={formData.required_skills}
                    onChange={(e) => updateField('required_skills', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Preferred Skills */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Preferred Skills</label>
                  <textarea
                    rows={2}
                    placeholder="Comma or line separated, e.g. Docker, AWS"
                    value={formData.preferred_skills}
                    onChange={(e) => updateField('preferred_skills', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Responsibilities */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Responsibilities</label>
                  <textarea
                    rows={3}
                    placeholder="One per line, e.g. Own feature delivery..."
                    value={formData.responsibilities}
                    onChange={(e) => updateField('responsibilities', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Company Overview */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Company Overview</label>
                  <textarea
                    rows={3}
                    placeholder="Brief overview of the company, culture, and mission"
                    value={formData.company_overview}
                    onChange={(e) => updateField('company_overview', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Benefits */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Benefits</label>
                  <textarea
                    rows={3}
                    placeholder="Comma or line separated, e.g. Health insurance, Flexible hours"
                    value={formData.benefits}
                    onChange={(e) => updateField('benefits', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Hiring Process */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Hiring Process</label>
                  <textarea
                    rows={3}
                    placeholder="Comma or line separated, e.g. Resume screening, Technical round, HR discussion"
                    value={formData.hiring_process}
                    onChange={(e) => updateField('hiring_process', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>

                {/* Recruiter Notes */}
                <div className="md:col-span-2">
                  <label className={labelCls}>Recruiter Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Any additional notes for applicants"
                    value={formData.recruiter_notes}
                    onChange={(e) => updateField('recruiter_notes', e.target.value)}
                    className={`${inputCls} resize-y`}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setFormError('');
                    setTemplateMsg('');
                  }}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'Publishing…' : 'Publish Job'}
                </button>
              </div>
            </div>
          )}

          {/* Posted Jobs */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Posted Jobs
            </h2>

            {/* Bulk selection (open job posts only) */}
            {!loading && selectableJobs.length > 0 && (
              <div className="mb-3">
                <BulkSelectBar
                  selectedCount={selectedIds.size}
                  selectableCount={selectableJobs.length}
                  allSelected={allSelected}
                  onToggleAll={toggleSelectAll}
                  onClear={() => setSelectedIds(new Set())}
                >
                  <BulkActionButton
                    tone="reject"
                    disabled={bulkClosing}
                    onClick={() => setBulkConfirm(true)}
                  >
                    Close Selected
                  </BulkActionButton>
                </BulkSelectBar>
              </div>
            )}

            {loading ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-3">
                <div className="h-5 bg-white/10 rounded animate-pulse" />
                <div className="h-5 bg-white/10 rounded animate-pulse w-3/4" />
                <div className="h-5 bg-white/10 rounded animate-pulse w-2/3" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-gray-500 text-sm">No job posts created yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {jobs.map((job) => {
                  const isOpen = job.status?.toLowerCase() === 'open';
                  return (
                    <div
                      key={job.id}
                      className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                    >
                      {isOpen ? (
                        <RowCheckbox
                          checked={selectedIds.has(job.id)}
                          onChange={(checked) => toggleSelected(job.id, checked)}
                          label={`Select ${job.job_title}`}
                        />
                      ) : (
                        /* Closed posts keep the same spacing without a checkbox. */
                        <span className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{job.job_title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {company_name} · Created {formatDate(job.created_at)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Status badge */}
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${
                            isOpen
                              ? 'bg-green-500/15 text-green-400 border border-green-500/30'
                              : 'bg-gray-500/15 text-gray-400 border border-gray-500/30'
                          }`}
                        >
                          {isOpen ? 'Open' : 'Closed'}
                        </span>

                        {/* View Applicants */}
                        <button
                          onClick={() => {
                            sessionStorage.setItem('quno_hr_selected_job_id', String(job.id));
                            navigate('/hr/applicants');
                          }}
                          className="text-[11px] font-medium text-primary-light hover:text-white border border-primary/30 hover:bg-primary/20 px-3 py-1 rounded-full transition-colors"
                        >
                          View Applicants
                        </button>

                        {/* Close Job */}
                        {isOpen && (
                          <button
                            onClick={() => setCloseTarget(job)}
                            className="text-[11px] font-medium text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1 rounded-full transition-colors"
                          >
                            Close Job
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Close confirm dialog */}
      {closeTarget && (
        <ConfirmDialog
          title="Close Job Post"
          message={`Are you sure you want to close "${closeTarget.job_title}"? This action cannot be undone.`}
          confirmLabel="Close Job"
          loading={closing}
          onConfirm={handleCloseJob}
          onCancel={() => setCloseTarget(null)}
        />
      )}

      {/* Bulk close confirm dialog */}
      {bulkConfirm && (
        <ConfirmDialog
          title="Close Selected Job Posts"
          message={`${selectedIds.size} selected job post${
            selectedIds.size === 1 ? '' : 's'
          } will be closed. This action cannot be undone.`}
          confirmLabel="Close Selected"
          loading={bulkClosing}
          onConfirm={handleBulkClose}
          onCancel={() => setBulkConfirm(false)}
        />
      )}
    </div>
  );
}