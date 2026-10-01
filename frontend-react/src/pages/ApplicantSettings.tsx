import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import DeleteAccountDialog from '../components/applicant/DeleteAccountDialog';
import { MeLunMark } from '../components/layout/MeLunLogo';
import { staggerContainer, staggerItem } from '../animations/config';
import { endSession } from '../services/api';
import {
  getThemeMode,
  getAccentColor,
  getFontSize,
  setThemeMode,
  setAccentColor,
  setFontSize,
  type ThemeMode,
  type AccentColor,
  type FontSize,
} from '../services/theme';
import {
  usePreferences,
  commitPreferences,
  discardPendingPreferences,
  useHasPendingPreferences,
} from '../services/applicantPreferences';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SettingsTab = 'account' | 'notifications' | 'privacy' | 'security' | 'appearance' | 'applications' | 'interview' | 'accessibility' | 'help' | 'about';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Reusable Toggle                                                    */
/* ------------------------------------------------------------------ */

function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="pr-4">
        <p className="text-sm text-gray-300 font-medium">{label}</p>
        {description && <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-all shrink-0 ${checked ? 'bg-primary' : 'bg-white/10'}`}
        aria-label={label}
      >
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Glass Card Wrapper                                                 */
/* ------------------------------------------------------------------ */

function SettingsCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={`bg-white/5 border border-white/10 rounded-2xl p-4 ${className}`}>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Section Components                                                 */
/* ------------------------------------------------------------------ */

function AccountSettings() {
  const navigate = useNavigate();
  const [session, setSession] = useState<{ applicant_id?: string; full_name?: string; email?: string }>({});

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('quno_applicant_session');
      if (raw) setSession(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const initials =
    (session.full_name || 'A').split(/\s+/).map((p) => p[0] || '').join('').slice(0, 2).toUpperCase() || 'A';

  return (
    <SettingsCard title="Account">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center text-lg font-bold text-primary-light shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-bold text-white">{session.full_name || 'Applicant'}</p>
          <p className="text-xs text-gray-500">Applicant ID: {session.applicant_id || '—'}</p>
          <p className="text-xs text-gray-500">{session.email || 'Email not available'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button onClick={() => navigate('/applicant/profile')} className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 rounded-xl transition-all btn-lift">Edit Profile</button>
        <button onClick={() => navigate('/forgot-password/applicant')} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 rounded-xl transition-all">Change Password</button>
      </div>
    </SettingsCard>
  );
}

function NotificationSettings() {
  const [notifs, { set }] = usePreferences('notifications', {
    emailNotifs: true, interviewReminders: true, applicationUpdates: true,
    resumeAccepted: true, resumeRejected: false, interviewScheduled: true,
    feedbackAvailable: true, recommendedJobs: true, announcements: false, marketing: false,
  });
  const setN = (key: keyof typeof notifs) => (v: boolean) => set({ [key]: v });

  return (
    <SettingsCard title="Notifications">
      <Toggle label="Email Notifications" description="Receive important updates via email" checked={notifs.emailNotifs} onChange={setN('emailNotifs')} />
      <Toggle label="Interview Reminders" description="Reminders before scheduled interviews" checked={notifs.interviewReminders} onChange={setN('interviewReminders')} />
      <Toggle label="Application Updates" description="Updates on your application status" checked={notifs.applicationUpdates} onChange={setN('applicationUpdates')} />
      <Toggle label="Resume Accepted" description="When your resume is accepted by HR" checked={notifs.resumeAccepted} onChange={setN('resumeAccepted')} />
      <Toggle label="Resume Rejected" description="When your resume is rejected" checked={notifs.resumeRejected} onChange={setN('resumeRejected')} />
      <Toggle label="Interview Scheduled" description="When an interview is scheduled for you" checked={notifs.interviewScheduled} onChange={setN('interviewScheduled')} />
      <Toggle label="Interview Feedback Available" description="When your interview feedback is ready" checked={notifs.feedbackAvailable} onChange={setN('feedbackAvailable')} />
      <Toggle label="New Recommended Jobs" description="Jobs matching your profile" checked={notifs.recommendedJobs} onChange={setN('recommendedJobs')} />
      <Toggle label="Platform Announcements" description="News and updates about the platform" checked={notifs.announcements} onChange={setN('announcements')} />
      <Toggle label="Marketing Emails" description="Promotional emails and offers" checked={notifs.marketing} onChange={setN('marketing')} />
      <p className="text-[10px] text-gray-600 italic mt-3">Last notification received: 2 hours ago</p>
    </SettingsCard>
  );
}

function PrivacySettings() {
  const [privacy, { set }] = usePreferences('privacy', {
    visibility: 'recruiters' as 'public' | 'recruiters' | 'private',
    discoverable: true, resumePreview: true, shareSkills: true,
  });

  const options = [
    { value: 'public' as const, label: 'Public' },
    { value: 'recruiters' as const, label: 'Recruiters Only' },
    { value: 'private' as const, label: 'Private' },
  ];

  return (
    <SettingsCard title="Privacy">
      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Profile Visibility</p>
          <div className="flex gap-2">
            {options.map((opt) => (
              <button key={opt.value} onClick={() => set({ visibility: opt.value })}
                className={`text-xs px-3 py-2 rounded-xl border transition-all ${privacy.visibility === opt.value ? 'bg-primary/10 border-primary/30 text-primary-light' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <Toggle label="Allow Companies To Discover Profile" checked={privacy.discoverable} onChange={(v) => set({ discoverable: v })} />
        <Toggle label="Allow Resume Preview" description="Let recruiters preview your resume" checked={privacy.resumePreview} onChange={(v) => set({ resumePreview: v })} />
        <Toggle label="Share Skills Publicly" checked={privacy.shareSkills} onChange={(v) => set({ shareSkills: v })} />
        <div className="flex gap-2 pt-3">
          <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all">Download My Data</button>
          <button className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-medium py-2 px-4 rounded-xl transition-all">Delete Personal Data Request</button>
        </div>
      </div>
    </SettingsCard>
  );
}

function SecuritySettings() {
  const navigate = useNavigate();
  const [security, { set }] = usePreferences('security', { twoFactor: false });

  return (
    <SettingsCard title="Security">
      <div className="space-y-1 mb-3">
        {[
          { label: 'Email Verified', value: 'Yes', color: 'text-green-400' },
          { label: 'Phone Verified', value: 'Yes', color: 'text-green-400' },
          { label: 'Password Last Changed', value: 'July 28, 2026', color: 'text-gray-300' },
          { label: 'Active Sessions', value: '2 devices', color: 'text-gray-300' },
          { label: 'Trusted Devices', value: 'This device', color: 'text-gray-300' },
          { label: 'Recent Login', value: 'Bangalore, IN · 2 hours ago', color: 'text-gray-300' },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
            <span className="text-xs text-gray-500">{row.label}</span>
            <span className={`text-xs font-medium ${row.color}`}>{row.value}</span>
          </div>
        ))}
      </div>
      <Toggle label="Two Factor Authentication" description="Coming Soon" checked={security.twoFactor} onChange={(v) => set({ twoFactor: v })} />
      <div className="flex flex-wrap gap-2 pt-3">
        <button onClick={() => navigate('/forgot-password/applicant')} className="text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2.5 px-4 rounded-xl transition-all btn-lift">Change Password</button>
        <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all">Logout All Devices</button>
        <button className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2.5 px-4 rounded-xl transition-all">Manage Devices</button>
      </div>
    </SettingsCard>
  );
}

interface AppearanceDraft {
  mode: ThemeMode;
  accent: AccentColor;
  fontSize: FontSize;
}

function AppearanceSettings({
  appearance,
  onAppearance,
}: {
  appearance: AppearanceDraft;
  onAppearance: (patch: Partial<AppearanceDraft>) => void;
}) {
  // Compact / Reduce animations remain staged preferences persisted on Save.
  const [appearanceLocal, { set: setLocal }] = usePreferences('appearance', {
    compact: false, reduceAnimations: false,
  } as { fontSize?: never; compact: boolean; reduceAnimations: boolean });

  const compact = appearanceLocal.compact;
  const reduceAnimations = appearanceLocal.reduceAnimations;

  // The currently COMMITTED (applied) values — unchanged until Save Changes.
  const committedMode = getThemeMode();
  const committedFontSize = getFontSize();

  const themeSelections = ['dark', 'light', 'system'] as const;

  return (
    <SettingsCard title="Appearance">
      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Theme</p>
          <div className="flex gap-2">
            {themeSelections.map((t) => (
              <button key={t} onClick={() => onAppearance({ mode: t })}
                className={`text-xs px-3 py-2 rounded-xl border capitalize transition-all ${appearance.mode === t ? 'bg-primary/10 border-primary/30 text-primary-light' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                {t}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">Currently applied: {committedMode === 'system' ? 'System (auto)' : committedMode === 'light' ? 'Light' : 'Dark'}</p>
        </div>
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Accent Color</p>
          <div className="flex gap-2">
            {['orange', 'blue', 'green', 'purple'].map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`${c} accent`}
                onClick={() => onAppearance({ accent: c as AccentColor })}
                className={`w-8 h-8 rounded-full transition-all ${c === 'orange' ? 'bg-orange-500' : c === 'blue' ? 'bg-blue-500' : c === 'green' ? 'bg-green-500' : 'bg-purple-500'} ${appearance.accent === c ? 'ring-2 ring-white/30 scale-110' : 'opacity-60 hover:opacity-100'}`}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Font Size</p>
          <div className="flex gap-2">
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button key={s} onClick={() => onAppearance({ fontSize: s })}
                className={`text-xs px-3 py-2 rounded-xl border capitalize transition-all ${appearance.fontSize === s ? 'bg-primary/10 border-primary/30 text-primary-light' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                aria-pressed={appearance.fontSize === s}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-1.5">Currently applied: {committedFontSize[0].toUpperCase() + committedFontSize.slice(1)}</p>
        </div>
        <Toggle label="Compact Mode" checked={compact} onChange={(v) => setLocal({ compact: v })} />
        <Toggle label="Reduce Animations" checked={reduceAnimations} onChange={(v) => setLocal({ reduceAnimations: v })} />
      </div>
    </SettingsCard>
  );
}

function ApplicationPreferences() {
  const [prefs, { set }] = usePreferences('application', {
    domains: ['Backend', 'AI', 'Data Science'], workMode: 'hybrid',
    salary: '₹20,000 - ₹40,000/mo', locations: 'Bangalore, Remote',
    alertFrequency: 'daily',
  } as {
    domains: string[]; workMode: string; salary: string; locations: string; alertFrequency: string;
  });

  const domains = ['Backend', 'Frontend', 'AI', 'ML', 'Cloud', 'Cyber Security'];
  const toggleDomain = (d: string) => {
    const has = prefs.domains.includes(d);
    set({ domains: has ? prefs.domains.filter((x) => x !== d) : [...prefs.domains, d] });
  };

  return (
    <SettingsCard title="Application Preferences">
      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Preferred Domains</p>
          <div className="flex flex-wrap gap-2">
            {domains.map((d) => (
              <button key={d} onClick={() => toggleDomain(d)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${prefs.domains.includes(d) ? 'bg-primary/10 border-primary/30 text-primary-light' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                {d}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-300 font-medium mb-2">Preferred Work Mode</p>
          <div className="flex gap-2">
            {['remote', 'hybrid', 'onsite'].map((m) => (
              <button key={m} onClick={() => set({ workMode: m })}
                className={`text-xs px-3 py-2 rounded-xl border capitalize transition-all ${prefs.workMode === m ? 'bg-primary/10 border-primary/30 text-primary-light' : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Salary Range</label>
            <select value={prefs.salary} onChange={(e) => set({ salary: e.target.value })} className="w-full text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-gray-300 focus:border-primary/50 focus:outline-none">
              <option>₹10,000 - ₹20,000/mo</option>
              <option>₹20,000 - ₹40,000/mo</option>
              <option>₹40,000 - ₹60,000/mo</option>
              <option>₹60,000+</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Preferred Locations</label>
            <input value={prefs.locations} onChange={(e) => set({ locations: e.target.value })}
              className="w-full text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white focus:border-primary/50 focus:outline-none" />
          </div>
        </div>
        <Toggle label="Job Alert Frequency" description="Send job recommendations immediately" checked={prefs.alertFrequency === 'immediately'} onChange={() => set({ alertFrequency: 'immediately' })} />
      </div>
    </SettingsCard>
  );
}

function InterviewPreferences() {
  const [prefs, { set }] = usePreferences('interview', {
    language: 'english', autoSave: true, micCheck: true, cameraCheck: true,
    fullscreenReminder: true, practiceTips: false, mockNotifs: true,
  });
  const setI = (key: keyof typeof prefs) => (v: boolean) => set({ [key]: v });

  return (
    <SettingsCard title="Interview Preferences">
      <div className="space-y-2">
        <div className="py-2 border-b border-white/5">
          <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold block mb-1">Preferred Language</label>
          <select value={prefs.language} onChange={(e) => set({ language: e.target.value })}
            className="text-xs bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-gray-300 focus:border-primary/50 focus:outline-none">
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
            <option value="tamil">Tamil</option>
            <option value="telugu">Telugu</option>
          </select>
        </div>
        <Toggle label="Auto Save Enabled" description="Answers auto-saved every 3 seconds" checked={prefs.autoSave} onChange={setI('autoSave')} />
        <Toggle label="Microphone Check Reminder" checked={prefs.micCheck} onChange={setI('micCheck')} />
        <Toggle label="Camera Check Reminder" checked={prefs.cameraCheck} onChange={setI('cameraCheck')} />
        <Toggle label="Fullscreen Reminder" checked={prefs.fullscreenReminder} onChange={setI('fullscreenReminder')} />
        <Toggle label="Interview Practice Tips" checked={prefs.practiceTips} onChange={setI('practiceTips')} />
        <Toggle label="Mock Interview Notifications" checked={prefs.mockNotifs} onChange={setI('mockNotifs')} />
      </div>
    </SettingsCard>
  );
}

function AccessibilitySettings() {
  const [a11y, { set }] = usePreferences('accessibility', {
    highContrast: false, reduceMotion: false, keyboardNav: true, screenReader: true, largeButtons: false,
  });
  const setA = (key: keyof typeof a11y) => (v: boolean) => set({ [key]: v });

  return (
    <SettingsCard title="Accessibility">
      <Toggle label="High Contrast Mode" checked={a11y.highContrast} onChange={setA('highContrast')} />
      <Toggle label="Reduce Motion" description="Minimize animations across the app" checked={a11y.reduceMotion} onChange={setA('reduceMotion')} />
      <Toggle label="Keyboard Navigation" checked={a11y.keyboardNav} onChange={setA('keyboardNav')} />
      <Toggle label="Screen Reader Support" checked={a11y.screenReader} onChange={setA('screenReader')} />
      <Toggle label="Large Buttons" checked={a11y.largeButtons} onChange={setA('largeButtons')} />
    </SettingsCard>
  );
}

function HelpSupport() {
  const items = ['FAQ', 'Contact Support', 'Report Bug', 'Suggest Feature', 'Privacy Policy', 'Terms & Conditions', 'Community Forum'];
  return (
    <SettingsCard title="Help & Support">
      <div className="space-y-2">
        {items.map((item) => (
          <button key={item} className="w-full flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-left">
            <span className="text-sm text-gray-300 font-medium">{item}</span>
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ))}
        <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-center mt-3">
          <p className="text-[10px] text-gray-500">Version: <span className="text-gray-300 font-medium">2.1.0</span></p>
        </div>
      </div>
    </SettingsCard>
  );
}

function AboutCard() {
  return (
    <SettingsCard title="About">
      <div className="text-center space-y-3">
        <MeLunMark size={44} variant="auto" className="mx-auto" />
        <div>
          <h4 className="text-base font-bold text-white">MeLun Hire</h4>
          <p className="text-xs text-gray-500 mt-1">AI-powered recruitment for modern teams</p>
        </div>
        <div className="space-y-1.5 text-xs text-gray-500">
          <p><span className="text-gray-300">Version:</span> 2.1.0</p>
          <p><span className="text-gray-300">Build:</span> ML-2026.08.04</p>
          <p><span className="text-gray-300">Release Date:</span> August 4, 2026</p>
          <p><span className="text-gray-300">Powered By:</span> MeLun</p>
        </div>
      </div>
    </SettingsCard>
  );
}

function DangerZone() {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const finishDeletion = () => {
    try {
      sessionStorage.removeItem('quno_applicant_session');
      const stale: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith('quno_applicant_prefs_')) stale.push(key);
      }
      stale.forEach((key) => localStorage.removeItem(key));
    } catch {
      /* storage cleanup is best effort */
    }
    setConfirmOpen(false);
    setDeleted(true);
    window.setTimeout(() => navigate('/applicant/login'), 1200);
  };
  return (
    <SettingsCard title="Danger Zone" className="border-red-500/20">
      <div className="flex items-center justify-between py-2 border-b border-red-500/10">
        <div>
          <p className="text-sm text-gray-300 font-medium">Logout</p>
          <p className="text-[11px] text-gray-500">Sign out of your account</p>
        </div>
        <button onClick={() => { void endSession('applicant'); sessionStorage.removeItem('quno_applicant_session'); navigate('/applicant/login'); }}
          className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-2 px-4 rounded-xl transition-all">
          Logout
        </button>
      </div>
      <div className="flex items-center justify-between pt-3">
        <div>
          <p className="text-sm text-gray-300 font-medium">Delete Account</p>
          <p className="text-[11px] text-gray-500">Permanently delete your account</p>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          className="text-xs bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 font-semibold py-2 px-4 rounded-xl transition-all">
          Delete Account
        </button>
      </div>
      {deleted && (
        <p role="status" className="text-xs text-green-400 mt-3">
          Your account has been deleted. Redirecting to sign in…
        </p>
      )}
      <DeleteAccountDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onDeleted={finishDeletion}
      />
    </SettingsCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ApplicantSettings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const [showToast, setShowToast] = useState(false);
  const prefsDirty = useHasPendingPreferences();
  const [appearanceDraft, setAppearanceDraft] = useState<AppearanceDraft>({
    mode: getThemeMode(),
    accent: getAccentColor(),
    fontSize: getFontSize(),
  });

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'account', label: 'Account', icon: '👤' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'privacy', label: 'Privacy', icon: '🔒' },
    { id: 'security', label: 'Security', icon: '🛡️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'applications', label: 'Application Preferences', icon: '💼' },
    { id: 'interview', label: 'Interview Preferences', icon: '🎤' },
    { id: 'accessibility', label: 'Accessibility', icon: '♿' },
    { id: 'help', label: 'Help & Support', icon: '❓' },
    { id: 'about', label: 'About', icon: 'ℹ️' },
  ];

  const appearanceDirty =
    appearanceDraft.mode !== getThemeMode() ||
    appearanceDraft.accent !== getAccentColor() ||
    appearanceDraft.fontSize !== getFontSize();

  const hasUnsavedChanges = appearanceDirty || prefsDirty;

  const applyAppearanceDraft = useCallback(() => {
    setThemeMode(appearanceDraft.mode);
    setAccentColor(appearanceDraft.accent);
    setFontSize(appearanceDraft.fontSize);
  }, [appearanceDraft]);

  const syncDraftToCommitted = () =>
    setAppearanceDraft({ mode: getThemeMode(), accent: getAccentColor(), fontSize: getFontSize() });

  const handleSave = useCallback(() => {
    applyAppearanceDraft();
    commitPreferences();
    syncDraftToCommitted();
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, [applyAppearanceDraft]);

  const handleReset = useCallback(() => {
    // Restore saved settings — discard any unsaved/pending changes.
    syncDraftToCommitted();
    discardPendingPreferences();
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  }, []);

  const handleCancel = useCallback(() => {
    syncDraftToCommitted();
    discardPendingPreferences();
    setActiveTab('account');
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'account': return <AccountSettings />;
      case 'notifications': return <NotificationSettings />;
      case 'privacy': return <PrivacySettings />;
      case 'security': return <SecuritySettings />;
      case 'appearance':
        return (
          <AppearanceSettings
            appearance={appearanceDraft}
            onAppearance={(patch) => setAppearanceDraft((prev) => ({ ...prev, ...patch }))}
          />
        );
      case 'applications': return <ApplicationPreferences />;
      case 'interview': return <InterviewPreferences />;
      case 'accessibility': return <AccessibilitySettings />;
      case 'help': return <HelpSupport />;
      case 'about': return <AboutCard />;
      default: return <AccountSettings />;
    }
  };

  return (
    <ApplicantLayout activePage="settings" fixedShell>
      {/* Fixed settings shell: outer region never scrolls (overflow-hidden).
          Only the center content column below scrolls (overflow-y-auto). */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden w-full max-w-7xl mx-auto px-4 md:px-6 py-3 gap-3">
        {/* Header — fixed */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0">
          <motion.h1 variants={staggerItem} className="text-xl md:text-2xl font-extrabold text-white">Settings</motion.h1>
          <motion.p variants={staggerItem} className="text-gray-400 mt-0.5 text-xs md:text-sm">
            Manage your account preferences, privacy, security and application experience.
          </motion.p>
        </motion.section>

        {/* Honest banner: most preference toggles are UI previews (no backend yet). */}
        <div className="shrink-0 px-3 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-[11px] text-gray-500">
          Changes to appearance and preferences are staged here and only applied once you click Save Changes.
          Account, Profile and Password actions take effect immediately.
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 overflow-hidden">
          {/* Left Settings Menu — fixed, never scrolls */}
          <motion.nav variants={staggerContainer} initial="hidden" animate="visible" className="shrink-0 md:w-56">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2 flex md:flex-col gap-1 overflow-x-auto md:overflow-hidden">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex md:w-full items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all shrink-0 md:shrink ${
                    activeTab === tab.id
                      ? 'bg-primary/15 text-primary-light border border-primary/25'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <span className="text-base shrink-0">{tab.icon}</span>
                  <span className="truncate text-[13px] whitespace-nowrap md:whitespace-normal">{tab.label}</span>
                </button>
              ))}
            </div>
          </motion.nav>

          {/* Right Settings Content — the ONLY scrollable region */}
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="flex-1 min-h-0 min-w-0 overflow-y-auto pr-0.5">
            <div className="space-y-4 pb-2">
              {/* Right content — render the selected tab immediately and
                  visibly (no entry animation that can leave it at opacity 0). */}
              <div key={activeTab}>
                {renderContent()}
              </div>

              {activeTab !== 'about' && activeTab !== 'help' && (
                <SettingsCard title="Actions">
                  <div className="flex flex-wrap items-center gap-2">
                    {hasUnsavedChanges && (
                      <span className="text-[11px] text-amber-400 font-medium">You have unsaved changes</span>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges}
                      className={`text-xs ${hasUnsavedChanges ? 'bg-primary hover:bg-primary-hover' : 'bg-white/5 border border-white/10 text-gray-400 cursor-not-allowed'} text-white font-semibold py-2 px-4 rounded-xl transition-all btn-lift ${hasUnsavedChanges ? '' : 'opacity-70'}`}
                    >Save Changes</button>
                    <button onClick={handleReset} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all">Reset Settings</button>
                    <button onClick={handleCancel} className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-medium py-2 px-4 rounded-xl transition-all">Cancel</button>
                  </div>
                </SettingsCard>
              )}

              <DangerZone />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Success Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50 bg-green-500/10 border border-green-500/30 text-green-400 font-medium text-sm px-5 py-3 rounded-xl backdrop-blur"
            role="status"
          >
            ✓ Settings applied and saved
          </motion.div>
        )}
      </AnimatePresence>
    </ApplicantLayout>
  );
}