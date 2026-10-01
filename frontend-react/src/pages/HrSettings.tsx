import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import HrLayout from '../components/hr/HrLayout';
import LogoutConfirmModal from '../components/applicant/LogoutConfirmModal';
import DeleteAccountDialog from '../components/applicant/DeleteAccountDialog';
import LegalContentDialog, { LegalDocType } from '../components/common/LegalContentDialog';
import { getJson, postJson, endSession } from '../services/api';
import { useTheme, ThemeMode } from '../services/theme';
import { staggerContainer, staggerItem } from '../animations/config';
import {
  ChartIcon,
  CheckCircleIcon,
  AlertIcon,
  UserIcon,
  BuildingIcon,
  BellIcon,
  SparklesIcon,
  ShieldIcon,
  LightbulbIcon,
  StarIcon,
  LogoutIcon,
  MailIcon,
  BriefcaseIcon,
  PaletteIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
} from '../components/hr/HrIcons';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HrSession {
  success: boolean;
  hr_id: number;
  hr_name: string;
  company_name: string;
}

interface HrProfile {
  hr_id: number;
  hr_name: string;
  email: string;
  company_name: string;
  member_since: string;
}

/* Every field below is persisted by /hr/company-profile (existing backend). */
interface CompanyForm {
  company_name: string;
  hr_name: string;
  company_email: string;
  company_location: string;
  company_website: string;
  company_linkedin: string;
  company_instagram: string;
  company_size: string;
  about_company: string;
}

interface NotificationPrefs {
  new_applicant: boolean;
  interview: boolean;
  reissue: boolean;
  job: boolean;
}

type SettingsTab =
  | 'account'
  | 'company'
  | 'notifications'
  | 'appearance'
  | 'hiring'
  | 'security'
  | 'system'
  | 'help'
  | 'about';

const TAB_IDS: SettingsTab[] = [
  'account',
  'company',
  'notifications',
  'appearance',
  'hiring',
  'security',
  'system',
  'help',
  'about',
];

const EMPTY_COMPANY: CompanyForm = {
  company_name: '',
  hr_name: '',
  company_email: '',
  company_location: '',
  company_website: '',
  company_linkedin: '',
  company_instagram: '',
  company_size: '',
  about_company: '',
};

const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  new_applicant: true,
  interview: true,
  reissue: true,
  job: true,
};

const SUPPORT_EMAIL = 'hello@melun.ai';
const APP_VERSION = '1.0.0';

const inputCls =
  'w-full bg-navy-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50';
const labelCls = 'block text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1.5';

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }); }
  catch { return dateStr; }
}

/* ------------------------------------------------------------------ */
/*  Reusable Toggle (same control used by the applicant settings)       */
/* ------------------------------------------------------------------ */

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="pr-4">
        <p className="text-sm text-gray-300 font-medium">{label}</p>
        {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative w-10 h-5 rounded-full transition-all shrink-0 ${checked ? 'bg-primary' : 'bg-white/10'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={label}
        aria-pressed={checked}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Glass card wrapper                                                 */
/* ------------------------------------------------------------------ */

function SettingsCard({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={`bg-white/5 border border-white/10 rounded-2xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}

/* Read-only key/value row used by the account + security cards. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-300 text-right break-words">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  System Health                                                      */
/*                                                                     */
/*  Moved here from the HR Dashboard. Reuses the same static services  */
/*  data/visual style previously shown on the dashboard.               */
/* ------------------------------------------------------------------ */

function SystemHealth() {
  const services = [
    { name: 'API Server', uptime: '99.9%', value: 99, status: 'Operational' },
    { name: 'Database', uptime: '99.9%', value: 99, status: 'Operational' },
    { name: 'AI Interview Engine', uptime: '98.5%', value: 98, status: 'Operational' },
    { name: 'Email Service', uptime: '99.2%', value: 99, status: 'Operational' },
  ];
  return (
    <div className="space-y-3">
      {services.map((s) => (
        <div key={s.name} className="p-3 rounded-xl bg-white/5 border border-white/10">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <ChartIcon className="w-4 h-4 shrink-0 text-primary-light" />
              <span className="text-xs text-gray-300 truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-500">{s.uptime} uptime</span>
              <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 font-medium">
                <CheckCircleIcon className="w-3 h-3" />
                {s.status}
              </span>
            </div>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400"
              style={{ width: `${s.value}%` }}
            />
          </div>
        </div>
      ))}
      <p className="flex items-start gap-2 text-[11px] text-gray-500">
        <AlertIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        All critical systems are operational. Last checked just now.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account                                                            */
/* ------------------------------------------------------------------ */

function AccountSection({
  session,
  profile,
  loading,
  onOpenCompany,
  onOpenSecurity,
}: {
  session: HrSession;
  profile: HrProfile | null;
  loading: boolean;
  onOpenCompany: () => void;
  onOpenSecurity: () => void;
}) {
  const name = profile?.hr_name || session.hr_name || 'HR Manager';
  const initials =
    name.split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase() || 'H';

  return (
    <SettingsCard title="Account">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-lg font-bold text-primary-light shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white truncate">{loading ? 'Loading…' : name}</p>
          <p className="text-xs text-gray-500">HR ID: {session.hr_id}</p>
          <p className="text-xs text-gray-500 truncate">{profile?.email || '—'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenCompany}
          className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 rounded-xl transition-all btn-lift"
        >
          Edit Company Profile
        </button>
        <button
          type="button"
          onClick={onOpenSecurity}
          className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 rounded-xl transition-all"
        >
          Change Password
        </button>
      </div>
      <div className="mt-3">
        <InfoRow label="Role" value="HR Manager" />
        <InfoRow label="Company" value={profile?.company_name || session.company_name || '—'} />
        <InfoRow label="Member Since" value={loading ? '—' : formatDate(profile?.member_since)} />
      </div>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Company profile                                                    */
/* ------------------------------------------------------------------ */

function CompanyField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}

function CompanyProfileSection({
  form,
  onChange,
  disabled,
}: {
  form: CompanyForm;
  onChange: (patch: Partial<CompanyForm>) => void;
  disabled: boolean;
}) {
  const textField = (key: keyof CompanyForm, id: string, placeholder: string) => (
    <input
      id={id}
      type="text"
      value={form[key]}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange({ [key]: e.target.value } as Partial<CompanyForm>)}
      className={inputCls}
    />
  );

  return (
    <SettingsCard title="Company Profile">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompanyField id="hr-company-name" label="Company Name">
            {textField('company_name', 'hr-company-name', 'Acme Corp')}
          </CompanyField>
          <CompanyField id="hr-company-hr-name" label="HR Contact Name">
            {textField('hr_name', 'hr-company-hr-name', 'Your full name')}
          </CompanyField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompanyField id="hr-company-email" label="Company Email">
            {textField('company_email', 'hr-company-email', 'hiring@company.com')}
          </CompanyField>
          <CompanyField id="hr-company-size" label="Company Size">
            {textField('company_size', 'hr-company-size', 'e.g. 51-200 employees')}
          </CompanyField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompanyField id="hr-company-website" label="Website">
            {textField('company_website', 'hr-company-website', 'https://company.com')}
          </CompanyField>
          <CompanyField id="hr-company-location" label="Location">
            {textField('company_location', 'hr-company-location', 'Bengaluru, India')}
          </CompanyField>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CompanyField id="hr-company-linkedin" label="LinkedIn">
            {textField('company_linkedin', 'hr-company-linkedin', 'linkedin.com/company/...')}
          </CompanyField>
          <CompanyField id="hr-company-instagram" label="Instagram">
            {textField('company_instagram', 'hr-company-instagram', 'instagram.com/...')}
          </CompanyField>
        </div>
        <CompanyField id="hr-company-about" label="About">
          <textarea
            id="hr-company-about"
            rows={4}
            value={form.about_company}
            disabled={disabled}
            placeholder="What your company builds, culture and hiring focus"
            onChange={(e) => onChange({ about_company: e.target.value })}
            className={`${inputCls} resize-y`}
          />
        </CompanyField>
        <p className="text-[11px] text-gray-500">
          Company details are stored on your HR account and used across your hiring workspace. Save
          them with <span className="text-gray-300 font-medium">Save Changes</span>.
        </p>
      </div>
    </SettingsCard>
  );
}


/* ------------------------------------------------------------------ */
/*  Notifications                                                      */
/* ------------------------------------------------------------------ */

function NotificationsSection({
  prefs,
  onChange,
  disabled,
}: {
  prefs: NotificationPrefs;
  onChange: (patch: Partial<NotificationPrefs>) => void;
  disabled: boolean;
}) {
  return (
    <SettingsCard title="Notifications">
      <Toggle
        label="New Applicant Alerts"
        description="Candidates applying to the jobs you manage"
        checked={prefs.new_applicant}
        onChange={(v) => onChange({ new_applicant: v })}
        disabled={disabled}
      />
      <Toggle
        label="Interview Updates"
        description="Interview status changes for your candidates"
        checked={prefs.interview}
        onChange={(v) => onChange({ interview: v })}
        disabled={disabled}
      />
      <Toggle
        label="Reissue Requests"
        description="Candidates asking for a new interview code"
        checked={prefs.reissue}
        onChange={(v) => onChange({ reissue: v })}
        disabled={disabled}
      />
      <Toggle
        label="Job Post Updates"
        description="Activity on the job posts you manage"
        checked={prefs.job}
        onChange={(v) => onChange({ job: v })}
        disabled={disabled}
      />
      <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-3">
        <AlertIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        These categories are saved on your HR account. Your Notifications page always lists
        every hiring activity item that was recorded for you.
      </p>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Appearance                                                         */
/* ------------------------------------------------------------------ */

function AppearanceSection({
  mode,
  onChangeMode,
  committedMode,
}: {
  mode: ThemeMode;
  onChangeMode: (mode: ThemeMode) => void;
  committedMode: ThemeMode;
}) {
  const options: {
    id: ThemeMode;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'dark',
      label: 'Dark Mode',
      description: 'Default high-contrast slate & navy workspace designed for reduced eye strain.',
      icon: MoonIcon,
    },
    {
      id: 'light',
      label: 'Light Mode',
      description: 'Clean bright layout with crisp borders and high-readability text surfaces.',
      icon: SunIcon,
    },
    {
      id: 'system',
      label: 'System Match',
      description: 'Automatically adjust according to your operating system preference.',
      icon: MonitorIcon,
    },
  ];

  return (
    <SettingsCard title="Appearance & Theme">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-white mb-1">Theme Preference</p>
          <p className="text-xs text-gray-400 mb-3">
            Choose your preferred color mode for the HR dashboard and recruiter workspace.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeMode(opt.id)}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-primary/10 border-primary/50 text-white shadow-sm shadow-primary/20 ring-1 ring-primary/30'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
                  }`}
                  aria-pressed={isSelected}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`p-2 rounded-lg ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'bg-white/10 text-gray-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary-light bg-primary/20 px-2 py-0.5 rounded-full">
                        Selected
                      </span>
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-white">{opt.label}</h4>
                    <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl flex items-center justify-between text-xs text-gray-400">
          <span>Currently applied:</span>
          <span className="font-semibold text-primary-light capitalize">
            {committedMode === 'system' ? 'System (Automatic)' : `${committedMode} Mode`}
          </span>
        </div>
      </div>
    </SettingsCard>
  );
}


/* ------------------------------------------------------------------ */
/*  Hiring preferences                                                 */
/* ------------------------------------------------------------------ */

function HiringSection({
  autoInterviewCodes,
  onChange,
  disabled,
}: {
  autoInterviewCodes: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  const navigate = useNavigate();
  return (
    <SettingsCard title="Hiring Preferences">
      <Toggle
        label="Automatic Interview Codes"
        description="Send an interview code as soon as a candidate is matched to one of your jobs"
        checked={autoInterviewCodes}
        onChange={onChange}
        disabled={disabled}
      />
      <p className="flex items-start gap-2 text-[11px] text-gray-500 mt-3">
        <AlertIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        When this is off, no interview code is issued automatically — you can still send one manually
        from the Applicants page. This switch is stored on your HR account and survives a new login.
      </p>
      <div className="flex flex-wrap gap-2 pt-3">
        <button
          type="button"
          onClick={() => navigate('/hr/job-posts')}
          className="inline-flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all"
        >
          <BriefcaseIcon className="w-3.5 h-3.5" /> Manage Job Posts
        </button>
        <button
          type="button"
          onClick={() => navigate('/hr/applicants')}
          className="inline-flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all"
        >
          Review Applicants
        </button>
      </div>
    </SettingsCard>
  );
}


/* ------------------------------------------------------------------ */
/*  Security                                                           */
/* ------------------------------------------------------------------ */

type SecurityMessage = { type: 'ok' | 'error'; text: string } | null;

function SecuritySection({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<SecurityMessage>(null);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit =
    !saving && currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  const handleChangePassword = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setMessage(null);
    try {
      await postJson('/hr/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'ok', text: 'Password updated successfully.' });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not update your password. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard title="Security">
      <div className="mb-4">
        <InfoRow label="Account Email" value={email || '—'} />
        <InfoRow label="Role" value="HR Manager" />
        <InfoRow label="Session" value="Active on this device" />
      </div>

      <div className="space-y-3">
        <div>
          <label className={labelCls} htmlFor="hr-current-password">Current Password</label>
          <input
            id="hr-current-password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            disabled={saving}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter your current password"
            className={inputCls}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="hr-new-password">New Password</label>
            <input
              id="hr-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              disabled={saving}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="hr-confirm-password">Confirm New Password</label>
            <input
              id="hr-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              disabled={saving}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat the new password"
              className={inputCls}
            />
          </div>
        </div>

        {mismatch && <p className="text-[11px] text-amber-400">Passwords do not match.</p>}
        {message && (
          <p
            role="status"
            className={`text-xs ${message.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}
          >
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleChangePassword()}
            disabled={!canSubmit}
            className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Updating…' : 'Update Password'}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}


/* ------------------------------------------------------------------ */
/*  Help & Support                                                     */
/* ------------------------------------------------------------------ */

function HelpSupport({
  onOpenLegal,
}: {
  onOpenLegal: (type: LegalDocType) => void;
}) {
  const navigate = useNavigate();
  const rows: { label: string; hint?: string; onClick: () => void }[] = [
    { label: 'Contact Support', hint: SUPPORT_EMAIL, onClick: () => { window.location.href = `mailto:${SUPPORT_EMAIL}`; } },
    { label: 'Privacy Policy', hint: 'In-app legal viewer', onClick: () => onOpenLegal('privacy') },
    { label: 'Terms of Service', hint: 'In-app legal viewer', onClick: () => onOpenLegal('terms') },
    { label: 'Back to Website', onClick: () => navigate('/') },
  ];
  return (
    <SettingsCard title="Help & Support">
      <div className="space-y-2">
        {rows.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={row.onClick}
            className="w-full flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm text-gray-300 font-medium truncate">{row.label}</span>
              {row.hint && <span className="block text-[11px] text-gray-500 truncate">{row.hint}</span>}
            </span>
            <MailIcon className="w-4 h-4 shrink-0 text-gray-500" />
          </button>
        ))}
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center mt-3">
          <p className="text-[10px] text-gray-500">
            Version: <span className="text-gray-300 font-medium">{APP_VERSION}</span>
          </p>
        </div>
      </div>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                              */
/* ------------------------------------------------------------------ */

function AboutCard() {
  return (
    <SettingsCard title="About">
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center">
          <StarIcon className="w-10 h-10 text-primary-light" />
        </div>
        <div>
          <h4 className="text-base font-bold text-white">MeLun Hire</h4>
          <p className="text-xs text-gray-500 mt-1">AI-powered recruitment for modern teams</p>
        </div>
        <div className="space-y-1.5 text-xs text-gray-500">
          <p><span className="text-gray-300">Version:</span> {APP_VERSION}</p>
          <p><span className="text-gray-300">Console:</span> HR Workspace</p>
          <p><span className="text-gray-300">Powered By:</span> MeLun</p>
        </div>
      </div>
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Danger Zone                                                        */
/* ------------------------------------------------------------------ */

function DangerZone({
  hrId,
  deleted,
  onLogout,
  onDeleted,
}: {
  hrId: number;
  deleted: boolean;
  onLogout: () => void;
  onDeleted: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <SettingsCard title="Danger Zone" className="border-red-500/20">
      <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-red-500/10">
        <div>
          <p className="text-sm text-gray-300 font-medium">Logout</p>
          <p className="text-[11px] text-gray-500">Sign out of your HR account on this device</p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-2 px-4 rounded-xl transition-all"
        >
          <LogoutIcon className="w-3.5 h-3.5" /> Logout
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
        <div>
          <p className="text-sm text-gray-300 font-medium">Delete Account</p>
          <p className="text-[11px] text-gray-500">
            Deactivate this HR account, close its job posts and revoke every session
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-2 px-4 rounded-xl transition-all"
        >
          Delete Account
        </button>
      </div>
      {deleted && (
        <p role="status" className="text-xs text-green-400 mt-3">
          Your account has been deleted and every session was revoked. Redirecting to sign in…
        </p>
      )}
      <DeleteAccountDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onDeleted={() => {
          setConfirmOpen(false);
          onDeleted();
        }}
        endpoint="/hr/deactivate-account"
        buildBody={(password, confirmation) => ({ hr_id: hrId, password, confirmation })}
        title="Delete your HR account?"
        description="This permanently deactivates your HR account, closes all of your open job posts and signs you out of every device. This action cannot be undone."
        incorrectPasswordMessage="Your current password is incorrect."
      />
    </SettingsCard>
  );
}


export default function HrSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [session, setSession] = useState<HrSession | null>(null);
  const [profile, setProfile] = useState<HrProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* Drafts stay local; the Actions card commits them through the existing
     HR APIs (company profile, notification preferences, auto interview codes). */
  const [companyForm, setCompanyForm] = useState<CompanyForm>(EMPTY_COMPANY);
  const [companyBase, setCompanyBase] = useState<CompanyForm>(EMPTY_COMPANY);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [notifBase, setNotifBase] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [autoCodes, setAutoCodes] = useState(true);
  const [autoCodesBase, setAutoCodesBase] = useState(true);

  /* Theme mode state: reactive theme hook + draft mode staged before saving */
  const { mode: committedThemeMode, setMode: setCommittedThemeMode } = useTheme();
  const [themeModeDraft, setThemeModeDraft] = useState<ThemeMode>(committedThemeMode);

  /* Legal modal state */
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalDocType, setLegalDocType] = useState<LegalDocType>('privacy');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [toast, setToast] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [deleted, setDeleted] = useState(false);

  /* The active section lives in the URL (?tab=) so the sidebar highlight, the
     top-bar breadcrumb and browser back/forward stay in sync with the view. */
  const tabParam = searchParams.get('tab');
  const activeTab: SettingsTab = useMemo(
    () => (TAB_IDS.includes(tabParam as SettingsTab) ? (tabParam as SettingsTab) : 'account'),
    [tabParam]
  );
  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      setSearchParams(tab === 'account' ? {} : { tab }, { replace: false });
    },
    [setSearchParams]
  );

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_hr_session');
    if (!raw) { navigate('/hr/login', { replace: true }); return; }
    try {
      const s: HrSession = JSON.parse(raw);
      if (!s.hr_id) { navigate('/hr/login', { replace: true }); return; }
      setSession(s);
    } catch { navigate('/hr/login', { replace: true }); }
  }, [navigate]);

  const loadSettings = useCallback(async () => {
    if (!session?.hr_id) return;
    setLoading(true);
    setError('');
    try {
      const [prof, company, prefs, codes] = await Promise.all([
        getJson(`/hr/profile/${session.hr_id}`) as Promise<HrProfile>,
        getJson(`/hr/company-profile/${session.hr_id}`) as Promise<Partial<CompanyForm>>,
        getJson(`/hr/notification-preferences/${session.hr_id}`) as Promise<Partial<NotificationPrefs>>,
        getJson(`/hr/auto-interview-codes/${session.hr_id}`) as Promise<{ auto_interview_codes?: boolean }>,
      ]);
      setProfile(prof);

      const loadedCompany: CompanyForm = {
        company_name: company.company_name || prof.company_name || '',
        hr_name: company.hr_name || prof.hr_name || '',
        company_email: company.company_email || prof.email || '',
        company_location: company.company_location || '',
        company_website: company.company_website || '',
        company_linkedin: company.company_linkedin || '',
        company_instagram: company.company_instagram || '',
        company_size: company.company_size || '',
        about_company: company.about_company || '',
      };
      setCompanyForm(loadedCompany);
      setCompanyBase(loadedCompany);

      const loadedPrefs: NotificationPrefs = {
        new_applicant: prefs.new_applicant ?? true,
        interview: prefs.interview ?? true,
        reissue: prefs.reissue ?? true,
        job: prefs.job ?? true,
      };
      setNotifPrefs(loadedPrefs);
      setNotifBase(loadedPrefs);

      const loadedAutoCodes = codes?.auto_interview_codes !== false;
      setAutoCodes(loadedAutoCodes);
      setAutoCodesBase(loadedAutoCodes);

      setLoading(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load settings.');
      setLoading(false);
    }
  }, [session?.hr_id]);

  useEffect(() => {
    if (session?.hr_id) void loadSettings();
  }, [session?.hr_id, loadSettings]);

  const companyDirty = (Object.keys(companyForm) as Array<keyof CompanyForm>)
    .some((key) => companyForm[key] !== companyBase[key]);
  const notifDirty = (Object.keys(notifPrefs) as Array<keyof NotificationPrefs>)
    .some((key) => notifPrefs[key] !== notifBase[key]);
  const hiringDirty = autoCodes !== autoCodesBase;
  const themeDirty = themeModeDraft !== committedThemeMode;
  const hasUnsavedChanges = companyDirty || notifDirty || hiringDirty || themeDirty;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2500);
  }, []);

  const handleSave = useCallback(async () => {
    if (!session?.hr_id || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      if (companyDirty) {
        await postJson('/hr/company-profile', { hr_id: session.hr_id, ...companyForm });
        setCompanyBase(companyForm);
      }
      if (notifDirty) {
        await postJson('/hr/notification-preferences', { hr_id: session.hr_id, ...notifPrefs });
        setNotifBase(notifPrefs);
      }
      if (hiringDirty) {
        await postJson('/hr/auto-interview-codes', { hr_id: session.hr_id, enabled: autoCodes });
        setAutoCodesBase(autoCodes);
      }
      if (themeDirty) {
        setCommittedThemeMode(themeModeDraft);
      }
      showToast('✓ Settings saved');
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : 'Could not save your settings. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }, [
    session?.hr_id,
    saving,
    companyDirty,
    companyForm,
    notifDirty,
    notifPrefs,
    hiringDirty,
    autoCodes,
    themeDirty,
    themeModeDraft,
    setCommittedThemeMode,
    showToast,
  ]);

  const handleReset = useCallback(() => {
    setCompanyForm(companyBase);
    setNotifPrefs(notifBase);
    setAutoCodes(autoCodesBase);
    setThemeModeDraft(committedThemeMode);
    setSaveError('');
    showToast('↺ Restored your last saved settings');
  }, [companyBase, notifBase, autoCodesBase, committedThemeMode, showToast]);

  const handleCancel = useCallback(() => {
    setCompanyForm(companyBase);
    setNotifPrefs(notifBase);
    setAutoCodes(autoCodesBase);
    setThemeModeDraft(committedThemeMode);
    setSaveError('');
    setActiveTab('account');
  }, [companyBase, notifBase, autoCodesBase, committedThemeMode, setActiveTab]);

  const confirmLogout = () => {
    setShowLogoutConfirm(false);
    // Revoke the server-side session so the HttpOnly cookie cannot be reused.
    void endSession('hr');
    sessionStorage.removeItem('quno_hr_session');
    navigate('/hr/login');
  };

  /* The backend deactivation closes the account's job posts, blocks future
     logins and revokes every session; the client clears its own state too. */
  const finishDeletion = () => {
    try {
      sessionStorage.removeItem('quno_hr_session');
    } catch {
      /* storage cleanup is best effort */
    }
    setDeleted(true);
    void endSession('hr');
    window.setTimeout(() => navigate('/hr/login'), 1200);
  };

  if (!session) return null;

  const hrId = session.hr_id;

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'account', label: 'Account', icon: UserIcon },
    { id: 'company', label: 'Company Profile', icon: BuildingIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    { id: 'appearance', label: 'Appearance', icon: PaletteIcon },
    { id: 'hiring', label: 'Hiring Preferences', icon: SparklesIcon },
    { id: 'security', label: 'Security', icon: ShieldIcon },
    { id: 'system', label: 'System Health', icon: ChartIcon },
    { id: 'help', label: 'Help & Support', icon: LightbulbIcon },
    { id: 'about', label: 'About', icon: StarIcon },
  ];

  /* Save / Reset only make sense for the sections that hold editable settings. */
  const showActionsCard =
    activeTab === 'account' ||
    activeTab === 'company' ||
    activeTab === 'notifications' ||
    activeTab === 'appearance' ||
    activeTab === 'hiring' ||
    activeTab === 'security';

  const renderContent = () => {
    switch (activeTab) {
      case 'account':
        return (
          <AccountSection
            session={session}
            profile={profile}
            loading={loading}
            onOpenCompany={() => setActiveTab('company')}
            onOpenSecurity={() => setActiveTab('security')}
          />
        );
      case 'company':
        return (
          <CompanyProfileSection
            form={companyForm}
            onChange={(patch) => setCompanyForm((prev) => ({ ...prev, ...patch }))}
            disabled={loading || saving}
          />
        );
      case 'notifications':
        return (
          <NotificationsSection
            prefs={notifPrefs}
            onChange={(patch) => setNotifPrefs((prev) => ({ ...prev, ...patch }))}
            disabled={loading || saving}
          />
        );
      case 'appearance':
        return (
          <AppearanceSection
            mode={themeModeDraft}
            onChangeMode={setThemeModeDraft}
            committedMode={committedThemeMode}
          />
        );
      case 'hiring':
        return (
          <HiringSection
            autoInterviewCodes={autoCodes}
            onChange={setAutoCodes}
            disabled={loading || saving}
          />
        );
      case 'security':
        return (
          <SecuritySection
            email={profile?.email || ''}
            onSignOut={() => setShowLogoutConfirm(true)}
          />
        );
      case 'system':
        return (
          <SettingsCard title="System Health">
            <SystemHealth />
          </SettingsCard>
        );
      case 'help':
        return (
          <HelpSupport
            onOpenLegal={(type) => {
              setLegalDocType(type);
              setLegalModalOpen(true);
            }}
          />
        );
      case 'about':
        return <AboutCard />;
      default:
        return null;
    }
  };

  return (
    <HrLayout activePage={activeTab === 'company' ? 'company-profile' : 'settings'} fixedShell>
      {/* Fixed settings shell: the outer region never scrolls — only the centre
          content column below does, so the sidebar and danger zone stay put. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full max-w-7xl mx-auto px-4 md:px-6 py-3 gap-3">
        {/* Header — fixed */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0">
          <motion.h1 variants={staggerItem} className="text-xl md:text-2xl font-extrabold text-white">
            Settings
          </motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-0.5 text-xs md:text-sm">
            Manage your company profile, account, notifications and hiring preferences.
          </motion.p>
        </motion.section>

        <div className="shrink-0 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] text-gray-500">
          Company profile, notification and hiring changes are staged here and only applied once you
          click Save Changes. Password and account actions take effect immediately.
        </div>

        {error && !loading && (
          <div className="shrink-0 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-300 text-sm">
            {error}
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="mt-3 block text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 px-4 rounded-xl transition-all"
            >
              Retry
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 overflow-hidden">
          {/* Left section menu — fixed, never scrolls with the content */}
          <motion.nav variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0 md:w-56">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto md:max-h-full">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex md:w-full items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all shrink-0 md:shrink ${isActive ? 'bg-primary/15 text-primary-light border border-primary/25' : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-transparent'}`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate text-[13px] whitespace-nowrap md:whitespace-normal">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.nav>

          {/* Right content — the ONLY scrollable region */}
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-0.5">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-32 bg-white/10 rounded-2xl" />
                <div className="h-64 bg-white/10 rounded-2xl" />
              </div>
            ) : (
              <div className="space-y-4 pb-2">
                <div key={activeTab}>{renderContent()}</div>

                {showActionsCard && (
                  <SettingsCard title="Actions">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasUnsavedChanges && (
                        <span className="text-[11px] text-amber-400 font-medium">You have unsaved changes</span>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={!hasUnsavedChanges || saving}
                        className={`text-xs ${hasUnsavedChanges && !saving ? 'bg-primary hover:bg-primary-hover' : 'bg-white/5 border border-white/10 text-gray-400 cursor-not-allowed'} text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift`}
                      >
                        {saving ? 'Saving…' : 'Save Changes'}
                      </button>
                      <button type="button" onClick={handleReset} disabled={saving} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all disabled:opacity-50">Reset Settings</button>
                      <button type="button" onClick={handleCancel} disabled={saving} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all disabled:opacity-50">Cancel</button>
                    </div>
                    {saveError && <p role="alert" className="text-xs text-red-400 mt-3">{saveError}</p>}
                  </SettingsCard>
                )}

                <DangerZone
                  hrId={hrId}
                  deleted={deleted}
                  onLogout={() => setShowLogoutConfirm(true)}
                  onDeleted={finishDeletion}
                />
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm px-5 py-3 rounded-xl backdrop-blur"
            role="status"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Logout confirmation — opens over the page; the session is only revoked
          after the user confirms. */}
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={confirmLogout}
      />
      {/* In-dashboard legal viewer modal (Terms & Privacy) */}
      <LegalContentDialog
        open={legalModalOpen}
        onClose={() => setLegalModalOpen(false)}
        type={legalDocType}
      />

    </HrLayout>
  );
}
