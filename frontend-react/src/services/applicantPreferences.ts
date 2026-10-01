/* ------------------------------------------------------------------ */
/*  Applicant settings preference store (frontend-local).              */
/*  Persists per-applicant preference toggles to localStorage, scoped   */
/*  by namespace so each settings section keeps its own slice. Reuses   */
/*  the existing localStorage persistence mechanism.                    */
/*                                                                      */
/*  STAGED SAVE: `set()` only updates an in-memory PENDING overlay so   */
/*  the UI reflects the selection immediately without persisting. The   */
/*  SETTINGS page calls `commitPreferences()` on "Save Changes" to      */
/*  persist all pending slices, or `discardPendingPreferences()` to     */
/*  abandon them (Cancel/Reset/unsaved refresh).                        */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from 'react';

function getApplicantId(): string {
  try {
    const raw = sessionStorage.getItem('quno_applicant_session');
    if (!raw) return 'guest';
    return (JSON.parse(raw) as { applicant_id?: string }).applicant_id || 'guest';
  } catch {
    return 'guest';
  }
}

function storageKey(namespace: string): string {
  return `quno_applicant_prefs_${getApplicantId()}_${namespace}`;
}

const snapshots = new Map<string, unknown>();
const subscriptions = new Map<string, Set<() => void>>();
const pendingMap = new Map<string, object>();
const dirtyNamespaces = new Set<string>();
const dirtySubscriptions = new Set<() => void>();
/* Persisted base per namespace, captured on first read/after commit.  */
const baseMap = new Map<string, object>();

function readStored<T>(namespace: string, defaults: T): T {
  try {
    const raw = localStorage.getItem(storageKey(namespace));
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as T) };
  } catch {
    return defaults;
  }
}

function captureBase<T extends Record<string, unknown>>(namespace: string, defaults: T): T {
  if (!baseMap.has(namespace)) baseMap.set(namespace, readStored(namespace, defaults));
  return baseMap.get(namespace) as T;
}

function currentValue<T extends Record<string, unknown>>(namespace: string, defaults: T): T {
  const base = captureBase(namespace, defaults);
  const pending = pendingMap.get(namespace) as T | undefined;
  return pending ? { ...base, ...pending } : base;
}

function ensureSnapshot<T extends Record<string, unknown>>(namespace: string, defaults: T): T {
  if (!snapshots.has(namespace)) {
    snapshots.set(namespace, currentValue(namespace, defaults));
  }
  return snapshots.get(namespace) as T;
}

function persist<T>(namespace: string, value: T): void {
  try {
    localStorage.setItem(storageKey(namespace), JSON.stringify(value));
  } catch {
    /* storage unavailable — preference still applies for this session */
  }
}

function subscribeTo(ns: string, listener: () => void) {
  let set = subscriptions.get(ns);
  if (!set) {
    set = new Set();
    subscriptions.set(ns, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

function notify(ns: string): void {
  subscriptions.get(ns)?.forEach((fn) => fn());
}

function subscribeDirtyList(listener: () => void) {
  dirtySubscriptions.add(listener);
  return () => {
    dirtySubscriptions.delete(listener);
  };
}

function readDirty(): boolean {
  return dirtyNamespaces.size > 0;
}

function notifyDirtyChange(): void {
  dirtySubscriptions.forEach((fn) => fn());
}

/**
 * Reactive, per-user preference namespace with STAGED writes.
 *
 *   const [notifs, { set, reset }] = usePreferences('notifications', DEFAULTS);
 *   set({ emailNotifs: false });   // pending — not persisted until commit
 *   commitPreferences();           // called on Save Changes
 */
export function usePreferences<T extends Record<string, unknown>>(
  namespace: string,
  defaults: T
): [T, { set: (patch: Partial<T>) => void; reset: () => void }] {
  const value = useSyncExternalStore(
    (cb) => subscribeTo(namespace, cb),
    () => ensureSnapshot(namespace, defaults),
    () => defaults
  ) as T;

  const set = (patch: Partial<T>): void => {
    const base = captureBase(namespace, defaults);
    const merged = { ...base, ...(pendingMap.get(namespace) as object), ...patch };
    pendingMap.set(namespace, merged);
    dirtyNamespaces.add(namespace);
    snapshots.set(namespace, { ...base, ...merged });
    notifyDirtyChange();
    notify(namespace);
  };

  const reset = (): void => {
    pendingMap.delete(namespace);
    dirtyNamespaces.delete(namespace);
    snapshots.set(namespace, captureBase(namespace, defaults));
    notifyDirtyChange();
    notify(namespace);
  };

  return [value, { set, reset }];
}

/**
 * Persist all pending preference changes to localStorage and clear the
 * pending overlay. Called by the Settings "Save Changes" action.
 */
export function commitPreferences(): void {
  for (const ns of dirtyNamespaces) {
    const pending = pendingMap.get(ns);
    if (!pending) continue;
    persist(ns, pending);
    baseMap.set(ns, pending);
  }
  pendingMap.clear();
  dirtyNamespaces.clear();
  notifyDirtyChange();
  for (const ns of subscriptions.keys()) notify(ns);
}

/**
 * Discard all unsaved (pending) preference changes and revert to the
 * persisted base. Called by Cancel / Reset.
 */
export function discardPendingPreferences(): void {
  pendingMap.clear();
  dirtyNamespaces.clear();
  for (const ns of subscriptions.keys()) {
    snapshots.set(ns, baseMap.get(ns) ?? {});
  }
  for (const ns of subscriptions.keys()) notify(ns);
  notifyDirtyChange();
}

/** Whether there are any unsaved preference changes. */
export function hasPendingPreferences(): boolean {
  return readDirty();
}

/** Live "there are unsaved preference changes" flag for the settings page. */
export function useHasPendingPreferences(): boolean {
  return useSyncExternalStore(subscribeDirtyList, readDirty, () => false);
}