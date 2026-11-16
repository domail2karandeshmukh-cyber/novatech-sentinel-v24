/**
 * The structured case form of a gate: role-specific fields, a playbook fill that types itself in,
 * where the case came from and where it goes next — so a decision looks and works like a real one.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Inbox, Send } from 'lucide-react';
import type { Field, FormValues } from '../data/forms';
import { formFor, keyFactsOfRecord } from '../data/forms';
import type { GateKey } from '../data/scenarios';
import { GATES } from '../data/scenarios';
import type { Run } from '../engine/incident';
import { gateActor, scenarioOf } from '../engine/incident';
import type { ActorId } from '../data/team';
import { Avatar, personMeta, useNow } from './kit';

const reduced = () => {
  const m = document.documentElement.dataset.sMotion;
  return m === 'reduce' || (m !== 'full' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
};
const digits = (s: string) => s.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
const grouped = (s: string) => (s ? new Intl.NumberFormat('en-IE').format(Number(s)) : '');

/** Fill a form field by field (a short, visible "typing in"), then the rationale. Instant under reduced motion. */
export function usePlaybookFill(fields: Field[], target: FormValues, setValues: (fn: (v: FormValues) => FormValues) => void, onDone?: () => void) {
  const timers = useRef<number[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);
  const fill = useCallback(() => {
    timers.current.forEach(t => window.clearTimeout(t)); timers.current = [];
    if (reduced()) { setValues(() => ({ ...target })); onDone?.(); return; }
    fields.forEach((f, i) => timers.current.push(window.setTimeout(() => { setValues(v => ({ ...v, [f.id]: target[f.id] })); setFlash(f.id); }, i * 110)));
    timers.current.push(window.setTimeout(() => { setFlash(null); onDone?.(); }, fields.length * 110 + 60));
  }, [fields, target, setValues, onDone]);
  return { fill, flash };
}

export function FieldGrid({ fields, values, set, disabled, flash, idPrefix }: { fields: Field[]; values: FormValues; set: (id: string, v: string | string[]) => void; disabled?: boolean; flash?: string | null; idPrefix: string }) {
  return (
    <div className="s-form-grid" data-tour="inc-form">
      {fields.map(f => <FieldView key={f.id} f={f} v={values[f.id]} set={v => set(f.id, v)} disabled={disabled} flash={flash === f.id} id={`${idPrefix}-${f.id}`} />)}
    </div>
  );
}

function FieldView({ f, v, set, disabled, flash, id }: { f: Field; v: string | string[] | undefined; set: (v: string | string[]) => void; disabled?: boolean; flash: boolean; id: string }) {
  const cls = `s-ff ${f.wide ? 'wide' : ''} ${flash ? 'flash' : ''}`;
  const hint = f.hint ? <small className="s-ff-hint" id={`${id}-hint`}>{f.hint}</small> : null;
  const described = f.hint ? `${id}-hint` : undefined;
  switch (f.kind) {
    case 'select':
      return (
        <label className={cls} htmlFor={id}><span className="s-ff-label">{f.label}</span>
          <select id={id} className="s-select" value={typeof v === 'string' ? v : ''} disabled={disabled} aria-describedby={described} onChange={e => set(e.target.value)}>
            <option value="">Choose…</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>{hint}
        </label>
      );
    case 'text':
      return (
        <label className={cls} htmlFor={id}><span className="s-ff-label">{f.label}</span>
          <input id={id} className={`s-input ${f.mono ? 's-mono' : ''}`} value={typeof v === 'string' ? v : ''} disabled={disabled} aria-describedby={described} onChange={e => set(e.target.value)} maxLength={300} />{hint}
        </label>
      );
    case 'money':
      return (
        <label className={cls} htmlFor={id}><span className="s-ff-label">{f.label}</span>
          <span className="s-money"><span aria-hidden="true">€</span><input id={id} className="s-input s-num" inputMode="numeric" value={grouped(typeof v === 'string' ? v : '')} disabled={disabled} aria-describedby={described} onChange={e => set(digits(e.target.value).slice(0, 9))} /></span>{hint}
        </label>
      );
    case 'readonly':
      return <div className={cls}><span className="s-ff-label">{f.label}</span><div className={`s-ro ${f.mono ? 's-mono' : ''}`}>{f.value}</div>{hint}</div>;
    case 'segmented':
      return (
        <fieldset className={cls} aria-describedby={described}><legend className="s-ff-label">{f.label}</legend>
          <div className="s-seg s-ff-seg" role="radiogroup" aria-label={f.label} onKeyDown={e => {
            // Radio-group keyboard pattern: arrows move the choice, one tab stop for the group.
            const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
            if (!step || disabled) return;
            e.preventDefault();
            const i = Math.max(0, f.options.indexOf(typeof v === 'string' ? v : ''));
            const next = f.options[(i + step + f.options.length) % f.options.length];
            set(next);
            const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button');
            btns[f.options.indexOf(next)]?.focus();
          }}>
            {f.options.map((o, i) => <button key={o} type="button" role="radio" aria-checked={v === o} tabIndex={v === o || (!f.options.includes(v as string) && i === 0) ? 0 : -1} disabled={disabled} onClick={() => set(o)}>{o}</button>)}
          </div>{hint}
        </fieldset>
      );
    case 'tags': {
      const on = Array.isArray(v) ? v : [];
      return (
        <fieldset className={cls} aria-describedby={described}><legend className="s-ff-label">{f.label}</legend>
          <div className="s-tags">{f.options.map(o => <button key={o} type="button" aria-pressed={on.includes(o)} disabled={disabled} onClick={() => set(on.includes(o) ? on.filter(x => x !== o) : [...on, o])}>{o}</button>)}</div>{hint}
        </fieldset>
      );
    }
    case 'checks': {
      const on = Array.isArray(v) ? v : [];
      return (
        <fieldset className={`${cls} s-ff-checks`} aria-describedby={described}><legend className="s-ff-label">{f.label}{f.all && <small> · all required</small>}</legend>
          {f.options.map(o => (
            <label key={o} className="s-check"><input type="checkbox" checked={on.includes(o)} disabled={disabled} onChange={e => set(e.target.checked ? [...on, o] : on.filter(x => x !== o))} /><span>{o}</span></label>
          ))}{hint}
        </fieldset>
      );
    }
  }
}

/** Minutes after the incident started by which each gate is due (from the scenario's own task plan). */
export function gateDue(run: Run, gate: GateKey): number | null {
  const s = scenarioOf(run);
  const t = s.tasks.find(x => x.doneAt === gate);
  if (!t || !run.startedAt) return null;
  return Date.parse(run.startedAt) + t.dueMin * 60_000;
}
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
function dueLabel(due: number | null, now: number) {
  if (due === null) return '';
  const m = Math.round((due - now) / 60_000);
  return `due ${hhmm(due)} · ${m >= 0 ? `in ${Math.max(1, m)} min` : `${-m} min overdue`}`;
}

/** Who receives the case after this gate, and by when. */
export function nextHop(run: Run, gate: GateKey): { actors: ActorId[]; title: string; key: GateKey | 'report' } {
  const s = scenarioOf(run);
  const i = GATES.findIndex(g => g.key === gate);
  const next = GATES[i + 1];
  if (!next) return { actors: ['vanessa'], title: 'After-action report and board pack', key: 'report' };
  if (next.key === 'authorize') return { actors: s.approvals.map(a => a.approver), title: next.title, key: next.key };
  return { actors: [gateActor(run, next.key as Exclude<GateKey, 'authorize'>)], title: next.title, key: next.key };
}

export function RoutingFooter({ run, gate }: { run: Run; gate: GateKey }) {
  const now = useNow(15_000);
  const hop = nextHop(run, gate);
  const due = hop.key === 'report' ? null : gateDue(run, hop.key);
  return (
    <div className="s-route-next" data-tour="inc-route" aria-label="Where this goes next">
      <Send size={16} aria-hidden="true" />
      <span className="s-route-next-t">
        <span className="s-label">On signing, sent to</span>
        <span className="s-row wrap" style={{ gap: 8 }}>
          {hop.actors.map((a, i) => <span key={a} className="s-row" style={{ gap: 6 }}>{i > 0 && <ArrowRight size={13} className="s-faint" aria-hidden="true" />}<Avatar id={a} size="sm" /><b>{personMeta(a).name}</b></span>)}
          <span className="s-small">· {hop.title}{due ? ` · ${dueLabel(due, now)}` : ''}</span>
        </span>
        <small className="s-faint">Sentinel inbox · e-mail · mobile push (simulated) · the whole form is sealed in the ledger</small>
      </span>
    </div>
  );
}

/** The case as it arrived: who sent it, when, and the key facts of their form. */
export function Received({ run, gate }: { run: Run; gate: GateKey }) {
  const now = useNow(15_000);
  const s = scenarioOf(run);
  const i = GATES.findIndex(g => g.key === gate);
  if (i < 0) return null;
  if (i === 0) {
    // Gate 1 receives the synthetic monitoring signal itself.
    const sig = run.ledger.find(e => e.kind === 'signal');
    if (!sig) return null;
    const due0 = gateDue(run, gate);
    return (
      <div className="s-received" data-tour="inc-handoff">
        <Inbox size={16} aria-hidden="true" />
        <span className="s-received-t">
          <span className="s-row wrap" style={{ gap: 8 }}><Avatar id="system" size="sm" /><span><b>From Sentinel monitoring</b> <span className="s-small">· {s.ref} · {hhmm(Date.parse(sig.at))}</span></span>{due0 && <span className={`s-chip ${due0 < now ? 'crit' : 'active'}`}>Your part {dueLabel(due0, now)}</span>}</span>
          <span className="s-received-facts"><span>{s.severity === 'Critical' ? 'Critical — P1' : 'High — P2'}</span><span>{sig.note}</span></span>
        </span>
      </div>
    );
  }
  const prev = GATES[i - 1].key;
  let by: ActorId | null = null, at: string | null = null, facts: string[] = [];
  if (prev === 'authorize') {
    const last = [...run.approvals].filter(a => a.status === 'approved').pop();
    if (last) { by = last.acting; at = last.decidedAt ?? null; facts = run.approvals.filter(a => a.status === 'approved').flatMap(a => (a.fields?.Conditions ?? '').split('; ').filter(Boolean)).slice(0, 3); }
  } else {
    const rec = run.records[prev as Exclude<GateKey, 'authorize'>];
    if (rec) {
      by = rec.by; at = rec.at;
      facts = keyFactsOfRecord(formFor(s.id, prev as Exclude<GateKey, 'authorize'>), rec.fields);
    }
  }
  if (!by || !at) return null;
  const due = gateDue(run, gate);
  return (
    <div className="s-received" data-tour="inc-handoff">
      <Inbox size={16} aria-hidden="true" />
      <span className="s-received-t">
        <span className="s-row wrap" style={{ gap: 8 }}><Avatar id={by} size="sm" /><span><b>From {personMeta(by).name}</b> <span className="s-small">· {GATES[i - 1].name} · {hhmm(Date.parse(at))}</span></span>{due && <span className={`s-chip ${due < now ? 'crit' : 'active'}`}>Your part {dueLabel(due, now)}</span>}</span>
        {facts.length > 0 && <span className="s-received-facts">{facts.map(f => <span key={f}>{f}</span>)}</span>}
      </span>
    </div>
  );
}
