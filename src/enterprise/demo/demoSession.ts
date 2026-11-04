/**
 * Who the visitor is acting as in the public demo, and the demo event bus. This module is small and
 * never loads the fixtures: the persona list starts from the snapshot baseline and switches to the
 * live (possibly edited) directory once the simulated backend has loaded.
 */
import type { DemoPersona } from './types.ts';
import { BASELINE_PERSONAS, DEFAULT_PERSONA_ID } from './personaBaseline.ts';

export type { DemoPersona };
/** `persona`: the visitor switched persona. `data`: a simulated write changed the data. `reset`: the demo data was restored. */
export type DemoEventType = 'persona' | 'data' | 'reset';
export type DemoEvent = { type: DemoEventType; personaId: string; fn?: string };
export type DemoListener = (event: DemoEvent) => void;

export const DEMO_PERSONA_KEY = 'novatech.enterprise-demo.persona.v1';

const listeners = new Set<DemoListener>();
let liveSource: (() => DemoPersona[]) | null = null;
let currentId: string | null = null;

function readStored(): string | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(DEMO_PERSONA_KEY); } catch { return null; }
}
function writeStored(id: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(DEMO_PERSONA_KEY, id); } catch { /* storage blocked: the choice lives in memory */ }
}
const copy = (p: DemoPersona): DemoPersona => ({ ...p, permissions: [...p.permissions] });

/** The people a visitor can act as (everyone in NT with a sign-in account), in the order of the login directory. */
export function demoPersonas(): DemoPersona[] {
  let live: DemoPersona[] | null = null;
  try { live = liveSource ? liveSource() : null; } catch { live = null; }
  return (live && live.length ? live : BASELINE_PERSONAS).map(copy);
}

/** The current persona (default: Karan Deshmukh, Project Manager / Risk Coordinator). */
export function getDemoPersona(): DemoPersona {
  if (currentId === null) currentId = readStored() ?? DEFAULT_PERSONA_ID;
  const list = demoPersonas();
  return list.find(p => p.employee_id === currentId) ?? list.find(p => p.employee_id === DEFAULT_PERSONA_ID) ?? list[0];
}

/** Acts as another persona from now on (persisted when storage is available); subscribers hear about actual switches. */
export function setDemoPersona(employeeId: string): DemoPersona {
  const p = demoPersonas().find(x => x.employee_id === employeeId);
  if (!p) throw new Error('NOT_FOUND: no demo persona with employee id ' + employeeId);
  const changed = getDemoPersona().employee_id !== p.employee_id;
  currentId = p.employee_id;
  writeStored(currentId);
  if (changed) publish({ type: 'persona', personaId: currentId });
  return p;
}

/** Subscribes to persona switches, simulated data changes and resets. Returns the unsubscribe function. */
export function subscribeDemo(listener: DemoListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Internal: lets the simulated backend supply the live directory (role edits, deactivations). */
export function setDemoPersonaSource(source: (() => DemoPersona[]) | null): void {
  liveSource = source;
}

/** Internal: broadcast a demo event (demoBackend.emitDemoChange is the public entry point). */
export function publish(event: DemoEvent): void {
  for (const listener of [...listeners]) {
    try { listener(event); } catch (e) { console.error('Demo listener failed', e); }
  }
}

/** Test hook: forget the in-memory persona choice (storage is read again on next use). */
export function resetDemoPersonaMemory(): void {
  currentId = null;
}
