/* ------------------------------------------------------------------ */
/*  Build Your Team — interactive team composition with live coverage. */
/*                                                                     */
/*  Role slots come from backend presets; candidates are assigned via  */
/*  accessible click/select controls (no drag required). Coverage,     */
/*  balance, gaps and gap-filling suggestions come from the backend    */
/*  coverage engine, and configurations are persisted.                 */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from 'react';
import HrLayout from '../../components/hr/HrLayout';
import {
  useHrSession,
  TalentArenaPage,
  ArenaSplit,
  ArenaScrollCard,
} from './shared';
import {
  fetchTeamRoles,
  previewTeam,
  saveTeamConfig,
  fetchTeams,
} from '../../services/talentArena';
import type { CandidatesPayload, SavedTeam, TeamSlot } from '../../services/talentArena';
import { fetchTalentCandidates } from '../../services/talentArena';

const MAX_SLOTS = 5;

export default function HrBuildTeam() {
  const session = useHrSession();
  const [data, setData] = useState<CandidatesPayload | null>(null);
  const [roles, setRoles] = useState<Record<string, string[]>>({});
  const [slots, setSlots] = useState<TeamSlot[]>([]);
  const [name, setName] = useState('');
  const [coverage, setCoverage] = useState<Awaited<ReturnType<typeof previewTeam>> | null>(null);
  const [teams, setTeams] = useState<SavedTeam[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = useCallback(() => {
    if (!session) return;
    Promise.all([
      fetchTalentCandidates(session.hrId),
      fetchTeamRoles().catch(() => ({ roles: {} as Record<string, string[]> })),
      fetchTeams(session.hrId).catch(() => ({ teams: [] as SavedTeam[] })),
    ])
      .then(([c, r, t]) => {
        setData(c);
        setRoles(r.roles);
        setTeams(t.teams);
        if (slots.length === 0 && Object.keys(r.roles).length > 0) {
          const defaults = Object.keys(r.roles).slice(0, 3);
          setSlots(defaults.map((role) => ({ role, required_skills: r.roles[role], application_id: null })));
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  /* Live coverage preview whenever slots change (server-computed). */
  useEffect(() => {
    if (!session || slots.length === 0) {
      setCoverage(null);
      return;
    }
    let cancelled = false;
    previewTeam({ hr_id: session.hrId, name: name || 'preview', slots })
      .then((res) => {
        if (!cancelled) setCoverage(res);
      })
      .catch(() => {
        if (!cancelled) setCoverage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session, slots, name]);

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    const remaining = Object.keys(roles).find((r) => !slots.some((s) => s.role === r));
    if (!remaining) return;
    setSlots((prev) => [...prev, { role: remaining, required_skills: roles[remaining], application_id: null }]);
  };

  const removeSlot = (idx: number) => setSlots((prev) => prev.filter((_, i) => i !== idx));

  const changeRole = (idx: number, role: string) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, role, required_skills: roles[role] ?? [] } : s)),
    );
  };

  const assign = (idx: number, applicationId: number | null) => {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, application_id: applicationId } : s)));
  };

  const save = async () => {
    if (!session || !name.trim()) return;
    setSaving(true);
    setSavedMsg('');
    try {
      const res = await saveTeamConfig({ hr_id: session.hrId, name: name.trim(), slots });
      setSavedMsg(`Team saved with ${res.coverage}% skill coverage.`);
      const t = await fetchTeams(session.hrId);
      setTeams(t.teams);
    } catch (err) {
      setSavedMsg(err instanceof Error ? err.message : 'Could not save the team.');
    } finally {
      setSaving(false);
    }
  };

  if (!session) return null;

  /* @@RENDER@@ */
return (
    <HrLayout activePage="talent-arena">
      <TalentArenaPage
        title="Build Your Team"
        subtitle="Assign candidates to role slots and watch skill coverage, balance and gaps update live. Teams are persisted."
      >
        <ArenaSplit
          asideWidth="360px"
          aside={
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider">Team configuration</p>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name (e.g. Product Team)"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600" />
              <button onClick={addSlot} disabled={slots.length >= MAX_SLOTS}
                className="text-xs bg-white/10 hover:bg-white/15 disabled:opacity-40 text-gray-300 font-semibold py-2 px-4 rounded-xl transition-colors">
                + Add role slot
              </button>
              {coverage && (
                <div className="grid grid-cols-2 gap-3">
                  <CoverageStat label="Skill coverage" value={`${coverage.coverage}%`} />
                  <CoverageStat label="Balance" value={`${coverage.team_balance}%`} />
                  <CoverageStat label="Filled slots" value={`${coverage.filled_slots}/${coverage.filled_slots + coverage.empty_slots}`} />
                  {(() => {
                    const total = coverage.filled_slots + coverage.empty_slots;
                    const pct = total > 0 ? Math.round((coverage.filled_slots / total) * 100) : 0;
                    return <CoverageStat label="Role coverage" value={`${pct}%`} />;
                  })()}
                </div>
              )}
              {coverage && coverage.missing_capabilities.length > 0 && (
                <div>
                  <p className="text-[11px] text-yellow-300">Missing capabilities</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {coverage.missing_capabilities.map((m) => (
                      <span key={m} className="text-[10px] px-2 py-0.5 rounded-full border text-yellow-300 border-yellow-500/30 bg-yellow-500/10">{m}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button onClick={save} disabled={saving || !name.trim()}
                  className="text-xs bg-primary hover:bg-primary-hover disabled:opacity-50 text-white font-semibold py-2.5 px-5 rounded-xl transition-colors">
                  {saving ? 'Saving…' : 'Save Team'}
                </button>
                {savedMsg && <p className="text-xs text-gray-400">{savedMsg}</p>}
              </div>
            </div>
          }
          main={
            <div className="space-y-4 min-w-0">
              <ArenaScrollCard title="Role slots" count={slots.length} maxHeight={560}>
                {slots.length === 0 && <p className="text-sm text-gray-500">Add a role slot to start building your team.</p>}
                {slots.map((s, idx) => (
                  <div key={idx} className="border border-white/10 rounded-2xl p-3 bg-white/[0.02]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <label className="text-[11px] text-gray-500">Role</label>
                        <select value={s.role} onChange={(e) => changeRole(idx, e.target.value)}
                          className="w-full mt-0.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white">
                          {Object.keys(roles).map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <button onClick={() => removeSlot(idx)} aria-label="Remove slot"
                        className="text-[11px] text-red-400 font-semibold px-2.5 py-1 rounded-lg border border-red-500/30 bg-red-500/10 transition-colors shrink-0">Remove</button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Requires: {s.required_skills.join(', ') || 'any'}</p>
                    <div className="mt-2">
                      <p className="text-[11px] text-gray-500">Assign candidate</p>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        <button onClick={() => assign(idx, null)}
                          className={`text-[11px] px-2.5 py-1 rounded-full border ${s.application_id === null ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10'}`}>(empty)</button>
                        {data?.candidates.map((c) => (
                          <button key={c.application_id} onClick={() => assign(idx, c.application_id)}
                            className={`text-[11px] px-2.5 py-1 rounded-full border ${s.application_id === c.application_id ? 'bg-primary/20 text-primary-light border-primary/40' : 'bg-white/5 text-gray-500 border-white/10'}`}>
                            {c.full_name.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </ArenaScrollCard>

              {teams.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider">Saved team configurations</p>
                  <div className="arena-scroll-list space-y-3 mt-2 pr-1" style={{ maxHeight: 320 }}>
                    {teams.map((t) => (
                      <div key={t.id} className="bg-white/[0.03] border border-white/10 rounded-2xl p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold text-white">{t.name}</h3>
                          <span className="text-primary-light font-semibold tabular-nums">{t.coverage}%</span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">Saved {t.created_at.slice(0, 10)}</p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {t.slots.filter((s) => s.application_id).map((s) => (
                            <span key={s.role} className="text-[10px] px-2 py-0.5 rounded-full border text-gray-300 border-white/10 bg-white/5">{s.role}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          }
        />
      </TalentArenaPage>
    </HrLayout>
  );
}

function CoverageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-3 text-center">
      <p className="text-xl font-extrabold text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-gray-500">{label}</p>
    </div>
  );
}
