import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import ApplicantLayout from '../components/applicant/ApplicantLayout';
import { AppIcon } from '../components/applicant/ApplicantIcons';
import { staggerContainer, staggerItem } from '../animations/config';
import { fetchResumeAnalysis } from '../services/applications';
import {
  buildCareerMap,
  buildMatchEngine,
  fetchApplicantProfileFields,
  fetchMystery,
  fetchOpenJobsForQuest,
  fetchQuestProgress,
  matchTone,
  type ApplicantProfileFields,
  type CareerRole,
  type MysteryState,
  type QuestProgress,
} from '../services/careerQuest';
import { parseSkillList, type BackendJob } from '../services/jobUtils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ApplicantSession {
  applicant_id: string;
  full_name: string;
  email: string;
}

/* ------------------------------------------------------------------ */
/*  MatchRing — animated circular match indicator                       */
/* ------------------------------------------------------------------ */

function MatchRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const tone = matchTone(score);
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={6} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone.ring}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (pct / 100) * c }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-extrabold ${tone.text}`} style={{ fontSize: size * 0.24 }}>{score}%</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StageRoleCard — interactive card for a career-map role              */
/* ------------------------------------------------------------------ */

function StageRoleCard({ role, onOpen }: { role: CareerRole; onOpen: () => void }) {
  const tone = matchTone(role.match);
  return (
    <motion.div variants={staggerItem} whileHover={{ y: -2 }} className="h-full bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.07] transition-all card-hover flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">{role.title}</p>
          <p className="text-xs text-gray-500 truncate">{role.company}</p>
        </div>
        <span className={`text-sm font-extrabold ${tone.text}`}>{role.match}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><AppIcon name="currency" className="w-3.5 h-3.5" /> {role.salary}</span>
        <span className="flex items-center gap-1"><AppIcon name="location" className="w-3.5 h-3.5" /> {role.location}</span>
        <span className="flex items-center gap-1"><AppIcon name="briefcase" className="w-3.5 h-3.5" /> {role.type}</span>
      </div>
      <div className="mt-2 mb-3 flex flex-wrap gap-1.5">
        {role.matchedSkills.slice(0, 2).map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">{s}</span>)}
        {role.missingSkills.slice(0, 2).map((s) => <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 border border-gray-500/20">+{s}</span>)}
      </div>
      <button onClick={onOpen} className="mt-auto w-full text-xs bg-primary hover:bg-primary-hover text-white font-semibold py-2 rounded-lg transition-all btn-lift">Explore Role</button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */
export default function ApplicantCareerQuest() {
  const navigate = useNavigate();
  const [session, setSession] = useState<ApplicantSession | null>(null);
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<ApplicantProfileFields | null>(null);
  const [resume, setResume] = useState<{ filename?: string; score?: number; skills?: string[] } | null>(null);
  const [jobs, setJobs] = useState<BackendJob[]>([]);
  const [progress, setProgress] = useState<QuestProgress | null>(null);
  const [mystery, setMystery] = useState<MysteryState | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) {
      navigate('/applicant/login', { replace: true });
      return;
    }
    try {
      const s: ApplicantSession = JSON.parse(raw);
      if (!s.applicant_id) {
        navigate('/applicant/login', { replace: true });
        return;
      }
      setSession(s);
    } catch {
      navigate('/applicant/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const id = session.applicant_id;
    (async () => {
      const [prof, res, jobList, prog, my] = await Promise.all([
        fetchApplicantProfileFields(id),
        fetchResumeAnalysis(id).catch(() => null),
        fetchOpenJobsForQuest().catch(() => [] as BackendJob[]),
        fetchQuestProgress(id).catch(() => null),
        fetchMystery(id).catch(() => null),
      ]);
      if (cancelled) return;
      setProfile(prof);
      setResume(res);
      setJobs(jobList);
      setProgress(prog);
      setMystery(my);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [session]);

  /* ---- Real-data derived views ---- */
  const profileSkills = useMemo(() => (profile?.skills ? parseSkillList(profile.skills) : []), [profile]);
  const resumeSkills = useMemo(() => (resume?.skills ?? []), [resume]);
  const allSkills = useMemo(() => {
    const m = new Map<string, string>();
    [...profileSkills, ...resumeSkills].forEach((s) => {
      const k = s.trim().toLowerCase();
      if (k) m.set(k, s.trim());
    });
    return [...m.values()];
  }, [profileSkills, resumeSkills]);

  const roles = useMemo(() => buildCareerMap(allSkills, jobs), [allSkills, jobs]);

  const completion = useMemo(() => {
    const items = [!!profile?.phone && !!profile?.location, !!profile?.experience, !!resume?.filename, profileSkills.length >= 3];
    return Math.round((items.filter(Boolean).length / items.length) * 100);
  }, [profile, resume, profileSkills]);

  const breakdown = useMemo(
    () => buildMatchEngine({ resumeScore: resume?.score ?? null, completionPercent: completion, skillsCount: allSkills.length, roles }),
    [resume, completion, allSkills, roles]
  );

  const milestones = progress?.milestones ?? [];
  const progressPercent = progress?.percent ?? 0;
  const mysteryDone = mystery?.revealed ?? false;

  const openJob = (job: BackendJob) => navigate('/applicant/available-jobs', { state: { openJobId: job.id } });

  if (!session) return null;
return (
    <ApplicantLayout activePage="career-quest">
      <div className="max-w-7xl mx-auto px-6 py-4 md:py-6 space-y-6">
        {/* HERO + PROGRESS */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="bg-gradient-to-br from-primary/10 via-navy-800/50 to-navy-900 border border-white/10 rounded-2xl p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-primary-light font-semibold mb-2">
                <AppIcon name="rocket" className="w-4 h-4" />
                Career Quest
              </div>
              <motion.h1 variants={staggerItem} className="text-2xl md:text-3xl font-extrabold text-white">Explore → Discover → Challenge → Match → Apply → Track</motion.h1>
              <motion.p variants={staggerItem} className="text-gray-400 mt-2 text-sm md:text-base">
                {loading ? 'Loading your career quest…' : 'Real opportunities, real challenges, real progress — every signal traced to evidence.'}
              </motion.p>
            </div>

            <motion.div variants={staggerItem} className="shrink-0 w-full md:w-80 bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Quest Progress</span>
                <span className={`text-lg font-extrabold ${progressPercent >= 60 ? 'text-green-400' : 'text-primary-light'}`}>{progressPercent}%</span>
              </div>
              <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-primary to-primary-light" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                {progress ? `${progress.done_count} / ${progress.total} milestones` : '—'}
              </p>
            </motion.div>
          </div>

          <motion.div variants={staggerContainer} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Challenges Completed', value: progress?.challenges_completed ?? 0 },
              { label: 'Skill Signals', value: progress?.skills_signals ?? 0 },
              { label: 'Opportunities Unlocked', value: progress?.opportunities_unlocked ?? 0 },
              { label: 'Applications', value: progress?.applications ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                <p className="text-2xl font-extrabold text-white">{s.value}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </motion.section>

        {/* QUEST NAVIGATION CARDS */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            { icon: 'target', label: 'Challenges', desc: 'Play role-specific challenges that prove real skills.', route: '/applicant/career-quest/challenges' },
            { icon: 'sparkles', label: 'Skill Signals', desc: 'See your evidence-backed skill signals and improve them.', route: '/applicant/career-quest/skills' },
            { icon: 'document', label: 'History', desc: 'Review your scores, skills tested and improvement over time.', route: '/applicant/career-quest/history' },
          ] as const).map((c) => (
            <motion.button
              key={c.label}
              variants={staggerItem}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(c.route)}
              className="text-left bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/[0.07] hover:border-white/20 transition-all card-hover btn-lift"
            >
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary-light"><AppIcon name={c.icon} className="w-5 h-5" /></span>
                <p className="text-base font-bold text-white">{c.label}</p>
              </div>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed">{c.desc}</p>
            </motion.button>
          ))}
        </motion.section>

        {/* MATCH BREAKDOWN */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <div className="flex items-center gap-2 mb-4">
            <AppIcon name="sparkles" className="w-4 h-4 text-primary-light" />
            <h2 className="text-sm font-bold text-white">How Your Match Score Is Built</h2>
            <span className="ml-auto text-[11px] text-gray-500">Explainable AI — no black box</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {breakdown.signals.map((sig) => (
              <div key={sig.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-400">{sig.label}</span>
                  <span className={`text-sm font-extrabold ${matchTone(breakdown.overall).text}`}>{sig.score}%</span>
                </div>
                <p className="text-[11px] text-gray-500 leading-relaxed">{sig.evidence}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-4">
            <span className="text-sm font-bold text-white">Overall Match</span>
            <MatchRing score={breakdown.overall} size={56} />
            <span className="text-[11px] text-gray-500">weighted from the signals above</span>
          </div>
        </motion.section>

        {/* CAREER MAP */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AppIcon name="briefcase" className="w-4 h-4 text-primary-light" />
              <h2 className="text-sm font-bold text-white">Career Map — Real Open Roles</h2>
            </div>
            <span className="text-[11px] text-gray-500">{jobs.length} open jobs · {allSkills.length} skills matched</span>
          </div>
          {roles.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
              <AppIcon name="briefcase" className="w-10 h-10 mx-auto text-gray-600" />
              <p className="text-sm text-gray-400 mt-3">No roles matched yet.</p>
              <p className="text-[11px] text-gray-600 mt-1">Add more skills to your profile or resume to see recommendations.</p>
            </div>
          ) : (
            /* Each stage is a full-width band: label on top, cards flow in a
               responsive grid so they use the real available width instead of
               stacking inside one narrow column. */
            <div className="space-y-6">
              {(['recommended', 'stretch', 'future'] as const).map((stage) => {
                const stageRoles = roles.filter((r) => r.stage === stage);
                if (stageRoles.length === 0) return null;
                const label = stage === 'recommended' ? 'Recommended' : stage === 'stretch' ? 'Stretch' : 'Future';
                const tone = stage === 'recommended' ? 'text-green-400' : stage === 'stretch' ? 'text-blue-400' : 'text-gray-400';
                const icon = stage === 'recommended' ? 'target' : stage === 'stretch' ? 'flag' : 'clock';
                return (
                  <div key={stage}>
                    <div className={`flex items-center gap-2 mb-3 text-[11px] uppercase tracking-wider font-semibold ${tone}`}>
                      <AppIcon name={icon} className="w-3.5 h-3.5" /> {label}
                      <span className="ml-auto text-gray-600">{stageRoles.length}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {stageRoles.map((role) => (
                        <StageRoleCard key={role.key} role={role} onOpen={() => openJob(role.job)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.section>

        {/* MILESTONES + MYSTERY */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AppIcon name="flag" className="w-4 h-4 text-primary-light" />
              <h2 className="text-sm font-bold text-white">Quest Milestones</h2>
            </div>
            {milestones.length === 0 ? (
              <p className="text-sm text-gray-500">No milestones yet — start a challenge to build your quest.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {milestones.map((m) => (
                  <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${m.done ? 'border-green-500/20 bg-green-500/5' : 'border-white/10 bg-white/5'}`}>
                    <AppIcon name={m.done ? 'check' : 'clock'} className={`w-5 h-5 shrink-0 ${m.done ? 'text-green-400' : 'text-gray-600'}`} />
                    <div className="min-w-0">
                      <p className={`font-semibold ${m.done ? 'text-white' : 'text-gray-300'}`}>{m.label}</p>
                      <p className="text-[11px] text-gray-500 truncate">{m.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <AppIcon name="sparkles" className="w-4 h-4 text-yellow-400" />
              <h2 className="text-sm font-bold text-white">Mystery Opportunity</h2>
            </div>
            {mysteryDone ? (
              <div className="text-center py-4">
                <AppIcon name="megaphone" className="w-10 h-10 mx-auto text-yellow-400" />
                <p className="text-sm font-bold text-white mt-2">Opportunity Revealed!</p>
                <p className="text-[11px] text-gray-500 mt-1">Check your career map to apply.</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <AppIcon name="alert" className="w-10 h-10 mx-auto text-gray-500" />
                <p className="text-sm text-gray-400 mt-2">Locked</p>
                <p className="text-[11px] text-gray-500 mt-1">Complete challenges to unlock.</p>
              </div>
            )}
          </div>
        </motion.section>

        {/* SKILLS SNAPSHOT */}
        <motion.section variants={staggerContainer} initial="hidden" animate="visible">
          <div className="flex items-center gap-2 mb-4">
            <AppIcon name="lightbulb" className="w-4 h-4 text-primary-light" />
            <h2 className="text-sm font-bold text-white">Skills Snapshot</h2>
            <span className="ml-auto text-[11px] text-gray-500">from profile + resume</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allSkills.length === 0 ? (
              <span className="text-sm text-gray-500">No skills detected yet — add them to your profile or upload a resume.</span>
            ) : (
              allSkills.map((skill) => (
                <span key={skill} className="text-[11px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-gray-300">{skill}</span>
              ))
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
            <span>From profile: <strong className="text-white">{profileSkills.length}</strong></span>
            <span>From resume: <strong className="text-white">{resumeSkills.length}</strong></span>
            <span>Total unique: <strong className="text-white">{allSkills.length}</strong></span>
          </div>
        </motion.section>
      </div>
    </ApplicantLayout>
  );
}