import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { staggerContainer, staggerItem } from '../animations/config';
import { getJson, postJson, API_BASE, requestErrorMessage } from '../services/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProfileData {
  applicantId: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  experience: string;
  primaryRole: string;
  currentStatus: string;
  preferredRole: string;
  employmentType: string;
  expectedSalary: string;
  professionalSummary: string;
  degree: string;
  university: string;
  graduationYear: string;
  cgpa: string;
  linkedin: string;
  github: string;
  portfolio: string;
  leetcode: string;
  hackerrank: string;
  preferredLocation: string;
  workMode: string;
  noticePeriod: string;
  openToRelocation: boolean;
  registrationDate: string;
  verifiedEmail: boolean;
  accountStatus: string;
  lastProfileUpdate: string;
}

interface Skill {
  id: string;
  name: string;
}

interface Education {
  degree: string;
  university: string;
  graduationYear: string;
  cgpa: string;
}

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const EMPTY_PROFILE: ProfileData = {
  applicantId: '',
  fullName: '',
  email: '',
  phone: '',
  location: '',
  experience: '',
  primaryRole: '',
  currentStatus: '',
  preferredRole: '',
  employmentType: '',
  expectedSalary: '',
  professionalSummary: '',
  degree: '',
  university: '',
  graduationYear: '',
  cgpa: '',
  linkedin: '',
  github: '',
  portfolio: '',
  leetcode: '',
  hackerrank: '',
  preferredLocation: '',
  workMode: '',
  noticePeriod: '',
  openToRelocation: false,
  registrationDate: '',
  verifiedEmail: false,
  accountStatus: '',
  lastProfileUpdate: '',
};

const MOCK_EDUCATION: Education = {
  degree: '',
  university: '',
  graduationYear: '',
  cgpa: '',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/* ------------------------------------------------------------------ */
/*  Profile Avatar                                                     */
/* ------------------------------------------------------------------ */

function ProfileAvatar({
  name,
  hasPhoto,
  imageUrl,
  size = 80,
}: {
  name: string;
  hasPhoto: boolean;
  imageUrl?: string;
  size?: number;
}) {
  const initials = getInitials(name) || '?';
  const r = size / 2;

  if (hasPhoto && imageUrl) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-full border-2 border-primary/30"
        style={{ width: size, height: size }}
      >
        <img src={imageUrl} alt={name || 'Profile picture'} className="w-full h-full object-cover" />
      </div>
    );
  }

  if (hasPhoto) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-full border-2 border-primary/30"
        style={{ width: size, height: size }}
      >
        {/* Placeholder for actual photo - shows initials */}
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" aria-hidden="true">
          <circle cx={r} cy={r} r={r} fill="#2563eb" opacity="0.2" />
          <text
            x={r}
            y={r + size * 0.12}
            textAnchor="middle"
            fill="#60a5fa"
            fontSize={size * 0.35}
            fontWeight="700"
            fontFamily="Inter, system-ui, sans-serif"
          >
            {initials}
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 overflow-hidden rounded-full border-2 border-dashed border-white/20 bg-white/5"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" aria-hidden="true">
        <circle cx={r} cy={r} r={r} fill="rgba(255,255,255,0.03)" />
        <text
          x={r}
          y={r + size * 0.12}
          textAnchor="middle"
          fill="#6b7280"
          fontSize={size * 0.35}
          fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif"
        >
          {initials}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Progress                                                  */
/* ------------------------------------------------------------------ */

function CircularProgress({ value, size = 100 }: { value: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.05)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-extrabold text-primary-light">{value}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Form Field                                                         */
/* ------------------------------------------------------------------ */

function FormField({
  label,
  value,
  editable,
  onChange,
  readOnly = false,
  textarea = false,
  placeholder = '',
}: {
  label: string;
  value: string;
  editable: boolean;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  textarea?: boolean;
  placeholder?: string;
}) {
  const isReadOnly = readOnly || !editable;

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={isReadOnly}
          placeholder={placeholder}
          rows={4}
          className={`w-full text-sm bg-transparent border rounded-xl px-3.5 py-2.5 transition-all resize-none ${
            isReadOnly
              ? 'border-transparent text-gray-300 cursor-default'
              : 'border-white/10 text-white focus:border-primary/50 focus:outline-none bg-white/[0.03]'
          }`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          readOnly={isReadOnly}
          placeholder={placeholder}
          className={`w-full text-sm bg-transparent border rounded-xl px-3.5 py-2.5 transition-all ${
            isReadOnly
              ? 'border-transparent text-gray-300 cursor-default'
              : 'border-white/10 text-white focus:border-primary/50 focus:outline-none bg-white/[0.03]'
          }`}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Glass Card Wrapper                                                 */
/* ------------------------------------------------------------------ */

function GlassCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerItem}
      className={`bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] transition-all duration-300 ${className}`}
    >
      {title && (
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>
      )}
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill Chip                                                         */
/* ------------------------------------------------------------------ */

function SkillChip({
  name,
  removable = false,
  onRemove,
}: {
  name: string;
  removable?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary-light text-xs font-medium">
      {name}
      {removable && (
        <button
          onClick={onRemove}
          className="ml-0.5 text-primary-light/60 hover:text-primary-light transition-colors"
          aria-label={`Remove ${name}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantProfile() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- Edit mode ---- */
  const [editing, setEditing] = useState(false);

  /* ---- Profile data ---- */
  const [profile, setProfile] = useState<ProfileData>({ ...EMPTY_PROFILE });
  const [skills, setSkills] = useState<Skill[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [profilePic, setProfilePic] = useState(''); // base64 data URL of the saved profile picture
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const hasPhoto = !!profilePic;
  const [applicantId, setApplicantId] = useState('');
  const [savedProfile, setSavedProfile] = useState<ProfileData>({ ...EMPTY_PROFILE });
  const [savedSkills, setSavedSkills] = useState<Skill[]>([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  /* Load the REAL applicant profile from the backend (authenticated session). */
  useEffect(() => {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) {
      navigate('/applicant/login', { replace: true });
      return;
    }
    let cancelled = false;
    try {
      const s: { applicant_id?: string; full_name?: string; email?: string } = JSON.parse(raw);
      if (!s.applicant_id) {
        navigate('/applicant/login', { replace: true });
        return;
      }
      setApplicantId(s.applicant_id);
      getJson<Record<string, unknown>>(`/applicant/profile/${encodeURIComponent(s.applicant_id)}`)
        .then((data) => {
          if (cancelled) return;
          const skillNames = typeof data.skills === 'string'
            ? data.skills.split(',').map((x: string) => x.trim()).filter(Boolean)
            : Array.isArray(data.skills)
              ? (data.skills as string[])
              : [];
          const next = {
            ...EMPTY_PROFILE,
            applicantId: s.applicant_id as string,
            fullName: (data.full_name as string) || s.full_name || '',
            email: (data.email as string) || s.email || '',
            phone: (data.phone as string) || '',
            experience: data.experience != null ? String(data.experience) : '',
            location: (data.location as string) || '',
          };
          setProfile(next);
          setSavedProfile(next);
          setSkills(skillNames.map((name, i) => ({ id: `skill-${i}`, name })));
          setSavedSkills(skillNames.map((name, i) => ({ id: `skill-${i}`, name })));
          // Restore the saved profile picture (served by the backend) if one exists.
          const hasPic = typeof data.profile_pic === 'string' && data.profile_pic;
          setProfilePic(
            hasPic ? `${API_BASE}/applicant/profile-pic/${encodeURIComponent(s.applicant_id as string)}` : ''
          );
        })
        .catch(() => {
          // Backend unavailable: fall back to the authenticated session identity only.
          setProfile((prev) => ({
            ...prev,
            applicantId: s.applicant_id as string,
            fullName: s.full_name || '',
            email: s.email || '',
          }));
        });
    } catch {
      navigate('/applicant/login', { replace: true });
    }
    return () => { cancelled = true; };
  }, [navigate]);

  /* ---- Computed completion ---- */
  const completionItems = [
    { label: 'Personal Information', done: !!profile.phone && !!profile.location },
    { label: 'Professional Details', done: !!profile.experience && !!profile.primaryRole },
    { label: 'Resume Uploaded', done: true },
    { label: 'Skills Added', done: skills.length >= 3 },
  ];
  const completionPercent = Math.round(
    (completionItems.filter((i) => i.done).length / completionItems.length) * 100
  );

  /* ---- Handlers ---- */
  const updateProfile = (key: keyof ProfileData, value: string | boolean) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddSkill = () => {
    const trimmed = newSkill.trim();
    if (trimmed && !skills.find((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setSkills((prev) => [...prev, { id: Date.now().toString(), name: trimmed }]);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (id: string) => {
    setSkills((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSave = async () => {
    if (!applicantId) return;
    try {
      await postJson('/applicant/update-profile', {
        applicant_id: applicantId,
        full_name: profile.fullName,
        phone: profile.phone,
        experience: profile.experience,
        skills: skills.map((s) => s.name).join(', '),
        location: profile.location,
      });
      setSavedProfile(profile);
      setSavedSkills(skills);
      setSaveMsg('Profile saved successfully.');
      setSaveError('');
      setEditing(false);
    } catch (err) {
      setSaveError(requestErrorMessage(err, 'Failed to save your profile. Please try again.'));
    }
  };

  const handleCancel = () => {
    setProfile(savedProfile);
    setSkills(savedSkills);
    setEditing(false);
  };

  /* ---- Profile picture upload ---- */
  const handlePhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow selecting the same file again after an upload attempt.
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file (JPG, PNG, WEBP, etc.).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image is too large. Please choose an image under 5 MB.');
      return;
    }
    if (!applicantId) {
      setPhotoError('Your session could not be identified. Please sign in again.');
      return;
    }

    setPhotoUploading(true);
    setPhotoError('');
    try {
      // Upload the file to the existing profile-picture storage via the backend.
      const form = new FormData();
      form.append('applicant_id', applicantId);
      form.append('file', file);
      const res = await fetch(`${API_BASE}/applicant/upload-profile-pic`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      const data = (await res.json()) as { detail?: unknown; message?: unknown };
      if (!res.ok) {
        const message =
          typeof data.detail === 'string' ? data.detail :
          typeof data.message === 'string' ? data.message :
          `Upload failed with status ${res.status}`;
        throw new Error(message);
      }
      // Update the displayed picture immediately (no page refresh needed).
      setProfilePic(`${API_BASE}/applicant/profile-pic/${encodeURIComponent(applicantId)}`);
    } catch (err) {
      setPhotoError(requestErrorMessage(err, 'Failed to upload your profile picture. Please try again.'));
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!applicantId) return;
    setPhotoUploading(true);
    setPhotoError('');
    try {
      await postJson('/applicant/update-profile-pic', {
        applicant_id: applicantId,
        profile_pic: '',
      });
      setProfilePic('');
    } catch (err) {
      setPhotoError(requestErrorMessage(err, 'Failed to remove your profile picture. Please try again.'));
    } finally {
      setPhotoUploading(false);
    }
  };

  /* ---- Resume ---- */
  // Resume upload is not wired to the backend from this page yet — neutral state.
  const resumeFileName = 'No resume uploaded';
  const resumeUploadedDate = '';
  const resumeFileSize = '';

  return (
    <ApplicantLayout activePage="profile">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        {/* ============================================================ */}
        {/* SECTION 1: PAGE HEADER                                       */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
        >
          <div>
            <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">
              Applicant Profile
            </motion.h1>
            <motion.p variants={staggerItem} className="text-gray-400 mt-1.5 text-sm md:text-base">
              Manage your personal information, resume, career preferences and account settings.
            </motion.p>
          </div>

          {/* Top Right Buttons */}
          <motion.div variants={staggerItem} className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={handleCancel}
                  className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift"
                >
                  Save Changes
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift inline-flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Profile
              </button>
            )}
          </motion.div>
        </motion.section>

        {saveMsg && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-2xl text-green-300 text-sm">
            {saveMsg}
          </div>
        )}
        {saveError && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {saveError}
          </div>
        )}

        {/* ============================================================ */}
        {/* SECTION 2: TOP PROFILE SECTION                               */}
        {/* ============================================================ */}
        <motion.section
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8"
        >
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Left: Avatar + Photo Buttons */}
            <motion.div variants={staggerItem} className="flex flex-col items-center gap-3 shrink-0">
              <ProfileAvatar name={profile.fullName} hasPhoto={hasPhoto} imageUrl={profilePic} size={80} />
              {editing && (
                <div className="flex flex-col items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={photoUploading}
                    className="text-[10px] bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary-light font-medium py-1.5 px-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {photoUploading ? 'Uploading…' : 'Upload Photo'}
                  </button>
                  {photoError && (
                    <p className="text-[10px] text-red-400 max-w-[160px] text-center" role="alert">{photoError}</p>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { if (profilePic) window.open(profilePic, '_blank', 'noopener,noreferrer'); }}
                      disabled={!profilePic}
                      className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 font-medium py-1 px-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      View
                    </button>
                    <button
                      onClick={handleRemovePhoto}
                      disabled={!hasPhoto || photoUploading}
                      className="text-[10px] bg-white/5 hover:bg-red-500/10 border border-white/10 text-gray-400 hover:text-red-400 font-medium py-1 px-2.5 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Center: Name, Email, ID */}
            <motion.div variants={staggerItem} className="flex-1 min-w-0">
              <h2 className="text-xl md:text-2xl font-extrabold text-white">{profile.fullName}</h2>
              <p className="text-sm text-gray-400 mt-1">{profile.email}</p>
              <p className="text-xs text-gray-500 mt-1 font-mono">{profile.applicantId}</p>
            </motion.div>

            {/* Right: Profile Completion */}
            <motion.div variants={staggerItem} className="shrink-0 w-full md:w-64 bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex flex-col items-center">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">
                  Profile Completion
                </p>
                <CircularProgress value={completionPercent} size={90} />
                <div className="mt-3 space-y-1.5 w-full">
                  {completionItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 text-[11px]">
                      <span className={item.done ? 'text-green-400' : 'text-gray-600'}>
                        {item.done ? '✔' : '○'}
                      </span>
                      <span className={item.done ? 'text-gray-400' : 'text-gray-600'}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.section>

        {/* ============================================================ */}
        {/* TWO-COLUMN LAYOUT                                            */}
        {/* ============================================================ */}
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        >
          {/* ========================================================== */}
          {/* LEFT COLUMN                                                */}
          {/* ========================================================== */}

          <div className="space-y-6">
            {/* ---- BASIC INFORMATION ---- */}
            <GlassCard title="Basic Information">
              <div className="space-y-3.5">
                <FormField label="Applicant ID" value={profile.applicantId} editable={false} readOnly />
                <FormField
                  label="Full Name"
                  value={profile.fullName}
                  editable={editing}
                  onChange={(v) => updateProfile('fullName', v)}
                />
                <FormField label="Email" value={profile.email} editable={false} readOnly />
                <FormField
                  label="Phone Number"
                  value={profile.phone}
                  editable={editing}
                  onChange={(v) => updateProfile('phone', v)}
                  placeholder="+91 98765 43210"
                />
                <FormField
                  label="Location"
                  value={profile.location}
                  editable={editing}
                  onChange={(v) => updateProfile('location', v)}
                  placeholder="City, Country"
                />
              </div>
            </GlassCard>

            {/* ---- PROFESSIONAL INFORMATION ---- */}
            <GlassCard title="Professional Information">
              <div className="space-y-3.5">
                <FormField
                  label="Experience"
                  value={profile.experience}
                  editable={editing}
                  onChange={(v) => updateProfile('experience', v)}
                />
                <FormField
                  label="Primary Role"
                  value={profile.primaryRole}
                  editable={editing}
                  onChange={(v) => updateProfile('primaryRole', v)}
                />
                <FormField
                  label="Current Status"
                  value={profile.currentStatus}
                  editable={editing}
                  onChange={(v) => updateProfile('currentStatus', v)}
                />
                <FormField
                  label="Preferred Job Role"
                  value={profile.preferredRole}
                  editable={editing}
                  onChange={(v) => updateProfile('preferredRole', v)}
                />
                <FormField
                  label="Employment Type"
                  value={profile.employmentType}
                  editable={editing}
                  onChange={(v) => updateProfile('employmentType', v)}
                />
                <FormField
                  label="Expected Salary"
                  value={profile.expectedSalary}
                  editable={editing}
                  onChange={(v) => updateProfile('expectedSalary', v)}
                />
                <FormField
                  label="Professional Summary"
                  value={profile.professionalSummary}
                  editable={editing}
                  onChange={(v) => updateProfile('professionalSummary', v)}
                  textarea
                  placeholder="Write a brief summary about yourself..."
                />
              </div>
            </GlassCard>

            {/* ---- EDUCATION ---- */}
            <GlassCard title="Education">
              <div className="space-y-3.5">
                <FormField
                  label="Degree"
                  value={MOCK_EDUCATION.degree}
                  editable={editing}
                  onChange={() => {}}
                />
                <FormField
                  label="University"
                  value={MOCK_EDUCATION.university}
                  editable={editing}
                  onChange={() => {}}
                />
                <div className="grid grid-cols-2 gap-3.5">
                  <FormField
                    label="Graduation Year"
                    value={MOCK_EDUCATION.graduationYear}
                    editable={editing}
                    onChange={() => {}}
                  />
                  <FormField
                    label="CGPA"
                    value={MOCK_EDUCATION.cgpa}
                    editable={editing}
                    onChange={() => {}}
                  />
                </div>
              </div>
            </GlassCard>

            {/* ---- SOCIAL LINKS ---- */}
            <GlassCard title="Social Links">
              <div className="space-y-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">🔗</span>
                  <FormField
                    label="LinkedIn"
                    value={profile.linkedin}
                    editable={editing}
                    onChange={(v) => updateProfile('linkedin', v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">💻</span>
                  <FormField
                    label="GitHub"
                    value={profile.github}
                    editable={editing}
                    onChange={(v) => updateProfile('github', v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">🌐</span>
                  <FormField
                    label="Portfolio"
                    value={profile.portfolio}
                    editable={editing}
                    onChange={(v) => updateProfile('portfolio', v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">🏆</span>
                  <FormField
                    label="LeetCode"
                    value={profile.leetcode}
                    editable={editing}
                    onChange={(v) => updateProfile('leetcode', v)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">⭐</span>
                  <FormField
                    label="HackerRank"
                    value={profile.hackerrank}
                    editable={editing}
                    onChange={(v) => updateProfile('hackerrank', v)}
                  />
                </div>
              </div>
            </GlassCard>
          </div>

          {/* ========================================================== */}
          {/* RIGHT COLUMN                                               */}
          {/* ========================================================== */}

          <div className="space-y-6">
            {/* ---- SKILLS ---- */}
            <GlassCard title="Skills">
              <div className="flex flex-wrap gap-2 mb-4">
                {skills.map((skill) => (
                  <SkillChip
                    key={skill.id}
                    name={skill.name}
                    removable={editing}
                    onRemove={() => handleRemoveSkill(skill.id)}
                  />
                ))}
              </div>
              {editing && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSkill();
                      }
                    }}
                    placeholder="Add a skill..."
                    className="flex-1 text-sm bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2 text-white placeholder-gray-600 focus:border-primary/50 focus:outline-none transition-all"
                  />
                  <button
                    onClick={handleAddSkill}
                    disabled={!newSkill.trim()}
                    className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2 px-3.5 rounded-xl transition-all"
                  >
                    Add
                  </button>
                </div>
              )}
            </GlassCard>

            {/* ---- RESUME ---- */}
            <GlassCard title="Resume">
              <div className="flex items-start gap-4">
                <div className="w-12 h-14 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{resumeFileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {resumeUploadedDate ? `Uploaded: ${resumeUploadedDate} · ${resumeFileSize}` : 'Resume upload is coming soon.'}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-1.5 px-3 rounded-lg transition-all">
                      Preview Resume
                    </button>
                    <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-1.5 px-3 rounded-lg transition-all">
                      Replace Resume
                    </button>
                    <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-1.5 px-3 rounded-lg transition-all">
                      Download
                    </button>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* ---- AI RESUME SCORE ---- */}
            <GlassCard title="AI Resume Score">
              <p className="text-[10px] text-gray-500 mb-3 -mt-2">
                AI resume scoring is coming soon.
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-6">
                {/* Score Circle */}
                <div className="flex flex-col items-center shrink-0">
                  <CircularProgress value={0} size={110} />
                  <div className="flex items-center gap-1 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} className="text-sm">{star <= 4 ? '⭐' : '☆'}</span>
                    ))}
                  </div>
                </div>

                {/* Strengths & Areas */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                  <div>
                    <p className="text-xs text-green-400 font-semibold uppercase tracking-wider mb-2">Strengths</p>
                    <ul className="space-y-1.5">
                      {['Strong Python', 'Good Backend Skills', 'AI'].map((s) => (
                        <li key={s} className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="text-green-400">✓</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-2">Areas to Improve</p>
                    <ul className="space-y-1.5">
                      {['Add more React projects', 'Improve testing experience'].map((s) => (
                        <li key={s} className="flex items-center gap-2 text-xs text-gray-400">
                          <span className="text-yellow-400">○</span> {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* ---- CAREER PREFERENCES ---- */}
            <GlassCard title="Career Preferences">
              <div className="space-y-3.5">
                <FormField
                  label="Preferred Location"
                  value={profile.preferredLocation}
                  editable={editing}
                  onChange={(v) => updateProfile('preferredLocation', v)}
                />
                <FormField
                  label="Work Mode"
                  value={profile.workMode}
                  editable={editing}
                  onChange={(v) => updateProfile('workMode', v)}
                />
                <FormField
                  label="Preferred Role"
                  value={profile.preferredRole}
                  editable={editing}
                  onChange={(v) => updateProfile('preferredRole', v)}
                />
                <FormField
                  label="Expected Salary"
                  value={profile.expectedSalary}
                  editable={editing}
                  onChange={(v) => updateProfile('expectedSalary', v)}
                />
                <FormField
                  label="Notice Period"
                  value={profile.noticePeriod}
                  editable={editing}
                  onChange={(v) => updateProfile('noticePeriod', v)}
                />
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">
                    Open To Relocation
                  </span>
                  <button
                    onClick={() => {
                      if (editing) updateProfile('openToRelocation', !profile.openToRelocation);
                    }}
                    disabled={!editing}
                    className={`relative w-10 h-5 rounded-full transition-all ${
                      profile.openToRelocation ? 'bg-primary' : 'bg-white/10'
                    } ${editing ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        profile.openToRelocation ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </GlassCard>

            {/* ---- ACCOUNT INFORMATION ---- */}
            <GlassCard title="Account Information">
              <div className="space-y-3">
                {[
                  { label: 'Applicant ID', value: profile.applicantId },
                  { label: 'Registration Date', value: profile.registrationDate },
                  {
                    label: 'Verified Email',
                    value: profile.verifiedEmail ? 'Yes' : 'No',
                    color: profile.verifiedEmail ? 'text-green-400' : 'text-red-400',
                  },
                  { label: 'Account Status', value: profile.accountStatus },
                  { label: 'Last Profile Update', value: profile.lastProfileUpdate },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-[11px] text-gray-500 uppercase tracking-wider font-semibold">{row.label}</span>
                    <span className={`text-xs font-medium ${row.color || 'text-gray-300'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {/* ---- SECURITY ---- */}
            <GlassCard title="Security">
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/forgot-password/applicant')}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
                >
                  <span className="text-sm text-gray-300 font-medium">Change Password</span>
                  <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {['Manage Sessions', 'Two Factor Authentication', 'Delete Account'].map((item) => (
                  <div
                    key={item}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 text-left cursor-not-allowed"
                  >
                    <span className="text-sm text-gray-600 font-medium">{item}</span>
                    <span className="text-[10px] text-gray-600 italic">Coming Soon</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </motion.div>
      </div>
    </ApplicantLayout>
  );
}