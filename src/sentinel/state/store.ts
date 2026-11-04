/**
 * One store for the Sentinel web app: incident run, demo persona, presentation state and viewer settings.
 * Persisted in this browser and mirrored to other windows of the same browser (BroadcastChannel, with a
 * storage-event fallback) so the projector "Audience" window and the private "Console" stay in sync.
 * Nothing leaves the device; there is no backend for this state.
 */
import { useSyncExternalStore } from 'react';
import { blankRun, nextAction, reduce, sanitizeRun } from '../engine/incident.ts';
import type { Command, Outcome, Run } from '../engine/incident.ts';
import type { ScenarioId } from '../data/scenarios.ts';
import { isScenarioId, scenarioById } from '../data/scenarios.ts';
import type { ActorId } from '../data/team.ts';
import { TEAM, SECONDARY } from '../data/team.ts';
import { blankPresenter, sanitizePresenter } from '../presenter/model.ts';
import { blankMacSim } from '../engine/macsim.ts';
import type { MacSim } from '../engine/macsim.ts';
import type { PresenterState } from '../presenter/model.ts';

export type Settings = {
  muted: boolean; volume: number; motion: 'system' | 'reduce' | 'full'; projector: boolean;
  theme: 'dark' | 'light'; autoPersona: boolean; soundCaptions: boolean; teamInboxMode: boolean;
};
export type AlertState = { open: boolean; runId: string; seq: number };
/** "mac": the public-preview rehearsal of the final act, shared between windows so the console can drive what the
 *  projector shows; never persisted and never connected to a device. */
export type AppState = {
  rev: number; origin: string; run: Run; persona: ActorId; settings: Settings; alert: AlertState; presenter: PresenterState; mac: MacSim;
};
export type WindowRole = 'main' | 'audience' | 'console';

const KEY = 'novatech-sentinel-state-v24';
const CHANNEL = 'novatech-sentinel-v24';
export const WINDOW_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const DEFAULT_SETTINGS: Settings = { muted: false, volume: 0.6, motion: 'system', projector: false, theme: 'dark', autoPersona: false, soundCaptions: true, teamInboxMode: false };

const isActor = (v: unknown): v is ActorId => typeof v === 'string' && ([...TEAM.map(p => p.id), ...SECONDARY.map(p => p.id)] as string[]).includes(v);
const newRunId = () => `run-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

function fresh(scenarioId: ScenarioId = 'ransomware'): AppState {
  return { rev: 0, origin: WINDOW_ID, run: blankRun(scenarioId, newRunId()), persona: 'karan', settings: { ...DEFAULT_SETTINGS }, alert: { open: false, runId: '', seq: 0 }, presenter: blankPresenter(), mac: blankMacSim() };
}

function load(): AppState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return fresh();
    const run = sanitizeRun(raw.run) ?? blankRun('ransomware', newRunId());
    const s = raw.settings ?? {};
    const settings: Settings = {
      muted: s.muted === true, volume: typeof s.volume === 'number' ? Math.min(1, Math.max(0, s.volume)) : DEFAULT_SETTINGS.volume,
      motion: ['system', 'reduce', 'full'].includes(s.motion) ? s.motion : 'system', projector: s.projector === true,
      theme: s.theme === 'light' ? 'light' : 'dark', autoPersona: s.autoPersona === true, soundCaptions: s.soundCaptions !== false,
      teamInboxMode: s.teamInboxMode === true,
    };
    return { rev: Number.isInteger(raw.rev) ? raw.rev : 0, origin: WINDOW_ID, run, persona: isActor(raw.persona) ? raw.persona : 'karan', settings, alert: { open: false, runId: '', seq: 0 }, presenter: sanitizePresenter(raw.presenter), mac: blankMacSim() };
  } catch { return fresh(); }
}

let state: AppState = typeof window === 'undefined' ? fresh() : load();
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());

let channel: BroadcastChannel | null = null;
try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, alert: undefined, mac: undefined })); } catch { /* storage unavailable: in-memory only */ }
}

function adopt(next: AppState) {
  if (next.rev < state.rev || (next.rev === state.rev && next.origin <= state.origin)) return;
  state = { ...next, origin: next.origin };
  emit();
}

if (channel) channel.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  // A reply to this window's own request (it was just opened or reloaded) wins a tie: the reloaded copy from storage
  // has the same revision but a newer window id, and it marks a running show as paused.
  if (msg?.type === 'state' && msg.state) { if (msg.to === WINDOW_ID) adoptReply(msg.state as AppState); else adopt(msg.state as AppState); }
  if (msg?.type === 'hello' || msg?.type === 'bye') onPeer(msg);
  if (msg?.type === 'sound-check' && msg.from !== WINDOW_ID && isAudioOwner()) soundCheckHandler?.();
  if (msg?.type === 'request-state' && msg.from !== WINDOW_ID) channel?.postMessage({ type: 'state', state, to: msg.from });
};
function adoptReply(next: AppState) {
  if (next.rev < state.rev) return;
  state = { ...next, origin: next.origin };
  emit();
}
// The storage event is only a fallback for browsers without BroadcastChannel. Using both would let a
// persisted copy (which deliberately omits the transient alert state) win the race against the full message.
if (typeof window !== 'undefined' && !channel) {
  window.addEventListener('storage', e => {
    if (e.key !== KEY || !e.newValue) return;
    try { const parsed = JSON.parse(e.newValue); if (parsed?.rev > state.rev) adopt({ ...state, ...parsed, alert: state.alert, mac: state.mac }); } catch { /* ignore */ }
  });
}

export function getState() { return state; }
export function subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; }
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function update(fn: (s: AppState) => AppState) {
  const next = fn(state);
  if (next === state) return;
  state = { ...next, rev: Math.max(state.rev, next.rev) + 1, origin: WINDOW_ID };
  persist();
  emit();
  try { channel?.postMessage({ type: 'state', state }); } catch { /* ignore */ }
}

/* ---------- commands ---------- */
export function dispatch(cmd: Command): Outcome {
  const outcome = reduce(state.run, cmd);
  if (outcome.error) return outcome;
  const s = scenarioById(outcome.run.scenarioId);
  update(st => {
    let persona = st.persona;
    if (st.settings.autoPersona && outcome.run.status === 'active') {
      const nx = nextActor(outcome.run);
      if (nx) persona = nx;
    }
    const alert = cmd.type === 'start' ? { open: true, runId: outcome.run.id, seq: outcome.run.ledger.length } : st.alert;
    return { ...st, run: outcome.run, persona, alert };
  });
  void s;
  return outcome;
}

function nextActor(run: Run): ActorId | null { return nextAction(run).actor; }

export function setPersona(p: ActorId) { if (state.persona !== p) update(s => ({ ...s, persona: p })); }
export function setScenario(id: ScenarioId) {
  if (!isScenarioId(id)) return;
  update(s => ({ ...s, run: blankRun(id, newRunId()), alert: { open: false, runId: '', seq: 0 }, persona: 'karan', mac: blankMacSim(s.mac.seq + 1) }));
}
export function resetRun() { update(s => ({ ...s, run: blankRun(s.run.scenarioId, newRunId()), alert: { open: false, runId: '', seq: 0 }, persona: 'karan', mac: blankMacSim(s.mac.seq + 1) })); }
export function closeAlert() { if (state.alert.open) update(s => ({ ...s, alert: { ...s.alert, open: false } })); }
export function reopenAlert() { update(s => ({ ...s, alert: { open: true, runId: s.run.id, seq: s.run.ledger.length } })); }
export function setSettings(p: Partial<Settings>) { update(s => ({ ...s, settings: { ...s.settings, ...p } })); }
export function setPresenter(fn: (p: PresenterState) => PresenterState) { update(s => ({ ...s, presenter: fn(s.presenter) })); }
export function resetEverything() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  update(s => ({ ...fresh(s.run.scenarioId), settings: s.settings, rev: s.rev, mac: blankMacSim(s.mac.seq + 1) }));
}
export function setMac(fn: (m: MacSim) => MacSim) { update(s => ({ ...s, mac: { ...fn(s.mac), seq: s.mac.seq + 1 } })); }

/* ---------- window roles: decide which window owns the speakers ---------- */
type Peer = { id: string; role: WindowRole; seen: number; sound?: boolean };
let soundProbe: () => boolean = () => false;
/** How this window reports whether it can play sound (browsers need one click or key press per window). */
export function setSoundProbe(fn: () => boolean) { soundProbe = fn; }
const peers = new Map<string, Peer>();
let myRole: WindowRole = 'main';
const roleSubs = new Set<() => void>();
function onPeer(msg: { type: string; id: string; role: WindowRole; sound?: boolean }) {
  if (!msg?.id || msg.id === WINDOW_ID) return;
  if (msg.type === 'bye') peers.delete(msg.id); else peers.set(msg.id, { id: msg.id, role: msg.role, seen: Date.now(), sound: msg.sound === true });
  roleSubs.forEach(f => f());
}
export function setWindowRole(role: WindowRole) {
  myRole = role;
  try { channel?.postMessage({ type: 'hello', id: WINDOW_ID, role, sound: soundProbe() }); } catch { /* ignore */ }
  roleSubs.forEach(f => f());
}
/** Ask the window that owns the speakers to play a short check (console "Test sound"). */
export function requestSoundCheck() { try { channel?.postMessage({ type: 'sound-check', from: WINDOW_ID }); } catch { /* ignore */ } }
let soundCheckHandler: (() => void) | null = null;
export function onSoundCheck(fn: () => void) { soundCheckHandler = fn; }
export const windowRole = () => myRole;
export function livePeers(): Peer[] { const now = Date.now(); return [...peers.values()].filter(p => now - p.seen < 5000); }
export function subscribePeers(f: () => void) { roleSubs.add(f); return () => { roleSubs.delete(f); }; }
/** Audience window plays sound when one is open; otherwise the main window; a lone console also plays. */
export function isAudioOwner(): boolean {
  const live = livePeers();
  const rank = (r: WindowRole) => r === 'audience' ? 0 : r === 'main' ? 1 : 2;
  const all = [...live, { id: WINDOW_ID, role: myRole, seen: Date.now() }];
  all.sort((a, b) => rank(a.role) - rank(b.role) || a.id.localeCompare(b.id));
  return all[0].id === WINDOW_ID;
}
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    try { channel?.postMessage({ type: 'hello', id: WINDOW_ID, role: myRole, sound: soundProbe() }); } catch { /* ignore */ }
    const before = peers.size;
    const now = Date.now();
    for (const [id, p] of peers) if (now - p.seen > 6000) peers.delete(id);
    if (peers.size !== before) roleSubs.forEach(f => f());
  }, 1500);
  window.addEventListener('beforeunload', () => { try { channel?.postMessage({ type: 'bye', id: WINDOW_ID, role: myRole }); } catch { /* ignore */ } });
  try { channel?.postMessage({ type: 'request-state', from: WINDOW_ID }); } catch { /* ignore */ }
}
