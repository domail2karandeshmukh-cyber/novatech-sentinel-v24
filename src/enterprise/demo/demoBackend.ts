/**
 * The public-demo backend: an in-memory copy of the NOVATECH (NT) production snapshot that answers
 * the same `grc_*` RPCs as Supabase, for whichever persona the visitor acts as.
 *
 * - Reads are computed from the data (not replayed), so they reflect every simulated write.
 * - Writes follow the production rules (permissions, separation of duties, dual control, routing)
 *   and append hash-chained ledger entries marked `simulated: true`.
 * - Changes persist in localStorage under a versioned key; without storage the demo still works
 *   in memory. `resetDemoData()` restores the snapshot.
 * - The fixtures are loaded lazily on the first call, so pages that never call the demo backend
 *   never download them.
 *
 * Extension points for other demo layers: `registerDemoOverlay` (post-process a result),
 * `registerDemoHandler` (answer an RPC yourself), `emitDemoChange` (tell the app to refresh).
 */
import type { DemoDb, DemoPersona, Seed } from './types.ts';
import { DENIED_IN_DEMO, RPC, callRpc, timeShift, worldFromSeed, type World } from './engine.ts';
import { getDemoPersona, publish, setDemoPersonaSource } from './demoSession.ts';
import { BASELINE_PERSONAS } from './personaBaseline.ts';

export { demoPersonas, getDemoPersona, setDemoPersona, subscribeDemo } from './demoSession.ts';
export type { DemoEvent, DemoEventType, DemoListener } from './demoSession.ts';
export type { DemoPersona };

/** localStorage key of the visitor's simulated changes (bump the version when the stored shape changes). */
export const DEMO_STORAGE_KEY = 'novatech.enterprise-demo.data.v1';
const STORAGE_VERSION = 1;

export type DemoContext = {
  /** The RPC being answered. */
  fn: string;
  /** Who the visitor is acting as. */
  persona: DemoPersona;
  /** The visitor's clock. */
  now: Date;
  /** When the production snapshot was taken (ISO). */
  snapshotAt: string;
  /** Milliseconds added to stored (snapshot-time) timestamps to show them on the visitor's clock. */
  offsetMs: number;
  /** Calls a built-in simulated RPC as the current persona (no handlers or overlays). */
  call: (fn: string, args?: Record<string, unknown>) => Promise<unknown>;
  /** Asks the app to refresh (same as emitDemoChange). */
  emitChange: () => void;
};
/** Post-processes the result of an RPC (built-in or handled) before the page receives it. */
export type DemoOverlay = (result: unknown, args: Record<string, unknown>, ctx: DemoContext) => unknown | Promise<unknown>;
/** Answers an RPC instead of the built-in simulation (also for RPC names the backend does not know). */
export type DemoHandler = (args: Record<string, unknown>, ctx: DemoContext) => unknown | Promise<unknown>;
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };
export type DemoBackendOptions = {
  /** The snapshot to serve (default: the bundled fixture, loaded on first use). */
  seed?: Seed | (() => Seed | Promise<Seed>);
  /** Clock in ms since the epoch (default Date.now). */
  now?: () => number;
  /** Storage for the visitor's changes; null disables persistence (default: localStorage when available). */
  storage?: StorageLike | null;
  uuid?: () => string;
  random?: () => number;
};
export type DemoSnapshotInfo = { version: string; snapshotAt: string; captured: string; excluded: string; pristine: boolean; offsetMs: number };

type Persisted = { v: number; snapshot: string; offsetMs: number | null; dayShift: number | null; savedAt: string; db: DemoDb };

const overlays = new Map<string, DemoOverlay[]>();
const handlers = new Map<string, DemoHandler>();
let options: DemoBackendOptions = {};
let world: World | null = null;
let seedLoaded: Seed | null = null;
let loading: Promise<World> | null = null;
let storageWarned = false;
let syncAttached = false;

async function loadSeed(): Promise<Seed> {
  const s = options.seed;
  if (typeof s === 'function') return await s();
  if (s) return s;
  const mod = await import('./fixtures/seed.json?raw');
  return JSON.parse(mod.default) as Seed;
}
const now = () => (options.now ? options.now() : Date.now());
function storage(): StorageLike | null {
  if (options.storage !== undefined) return options.storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
function readPersisted(seed: Seed): Persisted | null {
  try {
    const raw = storage()?.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (!p || p.v !== STORAGE_VERSION || p.snapshot !== seed.meta.version || !p.db || !Array.isArray(p.db.audit) || !p.db.counters) return null;
    return p;
  } catch { return null; }
}
function persist(w: World): void {
  if (!seedLoaded) return;
  const data: Persisted = { v: STORAGE_VERSION, snapshot: seedLoaded.meta.version, offsetMs: w.offsetMs, dayShift: w.dayShift, savedAt: new Date(now()).toISOString(), db: w.db };
  try {
    storage()?.setItem(DEMO_STORAGE_KEY, JSON.stringify(data));
  } catch {
    if (!storageWarned) { storageWarned = true; console.warn('NOVATECH public demo: browser storage is unavailable, changes are kept for this page only.'); }
  }
}
function applyPersisted(w: World, seed: Seed): void {
  const saved = readPersisted(seed);
  if (saved) { w.db = saved.db; w.offsetMs = saved.offsetMs; w.dayShift = saved.dayShift; return; }
  const fresh = worldFromSeed(seed);
  w.db = fresh.db; w.offsetMs = null; w.dayShift = null;
}

/** The live directory of people with a sign-in account (role edits and deactivations included). */
function livePersonas(w: World): DemoPersona[] {
  const rank = (id: string) => { const i = BASELINE_PERSONAS.findIndex(p => p.employee_id === id); return i < 0 ? 1000 : i; };
  return w.db.employees.filter(e => e.has_login && e.org_id === w.db.org.id)
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map(e => {
      const role = w.db.roles.find(r => r.id === e.role_id);
      return {
        employee_id: e.id, full_name: e.full_name, role: role?.name ?? e.role_id, role_id: e.role_id,
        department: w.db.departments.find(d => d.id === e.department_id)?.name ?? null, is_student: e.is_student,
        permissions: [...(role?.permissions ?? [])].filter(p => !p.includes('#')), authority_level: role?.authority_level ?? 0, email: e.email, active: e.active,
      };
    });
}

function attachStorageSync(): void {
  if (syncAttached || typeof window === 'undefined' || typeof window.addEventListener !== 'function' || options.storage !== undefined) return;
  syncAttached = true;
  window.addEventListener('storage', ev => {
    if (ev.key !== DEMO_STORAGE_KEY || !world || !seedLoaded) return;
    applyPersisted(world, seedLoaded); // another tab changed (or reset) the demo
    publish({ type: ev.newValue ? 'data' : 'reset', personaId: getDemoPersona().employee_id });
  });
}

async function ensureWorld(): Promise<World> {
  if (world) return world;
  if (!loading) {
    loading = (async () => {
      const seed = await loadSeed();
      const w = worldFromSeed(seed);
      seedLoaded = seed;
      applyPersisted(w, seed);
      world = w;
      setDemoPersonaSource(() => livePersonas(w));
      attachStorageSync();
      return w;
    })();
  }
  try { return await loading; } catch (e) { loading = null; throw e; }
}

function builtIn(w: World, fn: string, args: Record<string, unknown>, persona: DemoPersona): unknown {
  const { value, wrote } = callRpc(w, fn, args, { userEmployeeId: persona.employee_id, now: now(), uuid: options.uuid, random: options.random });
  if (wrote && !(fn === 'grc_notifications_mark' && value === 0)) {
    persist(w);
    publish({ type: 'data', personaId: persona.employee_id, fn });
  }
  return value;
}

function contextFor(fn: string, persona: DemoPersona, w: World): DemoContext {
  return {
    fn, persona, now: new Date(now()), snapshotAt: new Date(w.snapshotAtMs).toISOString(), offsetMs: timeShift(w, now()).offsetMs,
    call: async (name, args = {}) => builtIn(await ensureWorld(), name, args, getDemoPersona()),
    emitChange: emitDemoChange,
  };
}

/**
 * Answers an RPC like `supabase.rpc(fn, args)` would, as the current persona. Errors follow the
 * RpcError convention (`DENIED: …`, `VALIDATION: …`, `NOT_FOUND: …`, `AUTH: …`).
 */
export async function demoRpc(fn: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const w = await ensureWorld();
  const persona = getDemoPersona();
  const a = args ?? {};
  const handler = handlers.get(fn);
  const ctx = handler || overlays.has(fn) ? contextFor(fn, persona, w) : null;
  let result = handler ? await handler(a, ctx as DemoContext) : builtIn(w, fn, a, persona);
  for (const overlay of overlays.get(fn) ?? []) result = await overlay(result, a, ctx as DemoContext);
  return result;
}

/** Restores the production snapshot: forgets every simulated change (all personas) and refreshes the app. */
export async function resetDemoData(): Promise<void> {
  try { storage()?.removeItem(DEMO_STORAGE_KEY); } catch { /* storage blocked: nothing persisted */ }
  if (world && seedLoaded) {
    const fresh = worldFromSeed(seedLoaded);
    world.db = fresh.db; world.offsetMs = null; world.dayShift = null;
  }
  publish({ type: 'reset', personaId: getDemoPersona().employee_id });
}

/** Tells every subscriber (the session provider, hence every useRpc) that demo data changed. */
export function emitDemoChange(): void {
  publish({ type: 'data', personaId: getDemoPersona().employee_id });
}

/** Adds a post-processor for an RPC's result. Returns a function that removes it. */
export function registerDemoOverlay(fn: string, overlay: DemoOverlay): () => void {
  const list = overlays.get(fn) ?? [];
  list.push(overlay);
  overlays.set(fn, list);
  return () => {
    const cur = overlays.get(fn) ?? [];
    const next = cur.filter(x => x !== overlay);
    if (next.length) overlays.set(fn, next); else overlays.delete(fn);
  };
}

/** Answers an RPC with your own function instead of the built-in simulation. Returns a function that removes it. */
export function registerDemoHandler(fn: string, handler: DemoHandler): () => void {
  handlers.set(fn, handler);
  return () => { if (handlers.get(fn) === handler) handlers.delete(fn); };
}

/** Every RPC the simulated backend answers (writers that are not simulated are listed by demoDeniedRpcs). */
export const demoRpcNames = (): string[] => Object.keys(RPC).sort();
/** Writers that exist in production but are refused in the demo with an explanation. */
export const demoDeniedRpcs = (): string[] => [...DENIED_IN_DEMO];

/** Snapshot metadata, e.g. for a "data as of" note. Loads the fixtures if needed. */
export async function getDemoSnapshotInfo(): Promise<DemoSnapshotInfo> {
  const w = await ensureWorld();
  const meta = (seedLoaded as Seed).meta;
  return { version: meta.version, snapshotAt: meta.snapshot_at, captured: meta.captured, excluded: meta.excluded, pristine: w.offsetMs === null, offsetMs: timeShift(w, now()).offsetMs };
}

/**
 * Replaces the data source, clock or storage (tests and tools). The world is reloaded on the next call,
 * from storage when it holds changes for the same snapshot.
 */
export function configureDemoBackend(next: DemoBackendOptions = {}): void {
  options = { ...next };
  world = null; seedLoaded = null; loading = null;
  setDemoPersonaSource(null);
}
