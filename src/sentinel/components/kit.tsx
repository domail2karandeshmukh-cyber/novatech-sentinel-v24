import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { SECONDARY, TEAM } from '../data/team';
import type { ActorId } from '../data/team';

export function personMeta(id: ActorId | 'system') {
  const t = TEAM.find(p => p.id === id);
  if (t) return { name: t.name, first: t.first, initials: t.initials, role: t.role, short: t.short, hue: t.hue, group1: true };
  const s = SECONDARY.find(p => p.id === id);
  if (s) return { name: s.name, first: s.name.split(' ')[0], initials: s.initials, role: s.role, short: s.role, hue: '', group1: false };
  return { name: 'Synthetic monitoring', first: 'System', initials: 'SY', role: 'System', short: 'System', hue: '', group1: false };
}

export function Avatar({ id, size }: { id: ActorId | 'system'; size?: 'sm' | 'lg' | 'xl' }) {
  const m = personMeta(id);
  return <span className={`s-avatar ${size ?? ''} ${m.group1 ? '' : 'secondary'}`} style={m.hue ? { ['--hue' as string]: m.hue } : undefined} aria-hidden="true">{m.initials}</span>;
}

export function PersonTag({ id, sub, size }: { id: ActorId | 'system'; sub?: ReactNode; size?: 'sm' | 'lg' }) {
  const m = personMeta(id);
  return (
    <span className="s-person">
      <Avatar id={id} size={size} />
      <span className="s-person-t"><b>{m.name}</b><small>{sub ?? m.role}{!m.group1 && id !== 'system' ? ' · fictional employee' : ''}</small></span>
    </span>
  );
}

/** Keeps asset codes such as FIN-WS-07 on one line inside wrapping text. */
export function Codes({ text }: { text: string }) {
  const parts = text.split(/([A-Z0-9]+(?:-[A-Z0-9]+)+)/g);
  return <>{parts.map((p, i) => i % 2 ? <span key={i} className="s-nowrap">{p}</span> : p)}</>;
}

export function Sim({ large, children }: { large?: boolean; children?: ReactNode }) {
  return <span className={`s-sim ${large ? 'lg' : ''}`} title="Simulated classroom data — not production telemetry">{children ?? 'SIMULATED'}</span>;
}

type Toast = { id: number; kind: 'ok' | 'error'; text: string };
const ToastCtx = createContext<(kind: 'ok' | 'error', text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((kind: 'ok' | 'error', text: string) => {
    const id = ++seq.current;
    setList(l => [...l.slice(-2), { id, kind, text }]);
    window.setTimeout(() => setList(l => l.filter(t => t.id !== id)), kind === 'error' ? 7000 : 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="s-toasts" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={`s-toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span className="ic">{t.kind === 'ok' ? <CircleCheck size={18} /> : <CircleAlert size={18} />}</span>
            <p>{t.text}</p>
            <button onClick={() => setList(l => l.filter(x => x.id !== t.id))} aria-label="Dismiss"><X size={16} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Two-step button for actions that discard work: the first click arms it, the second confirms.
 * Used instead of native confirm() dialogs, which some hosts suppress and which block presenter windows.
 */
export function ConfirmButton({ className = 's-btn', confirmLabel, onConfirm, children, title }: { className?: string; confirmLabel: string; onConfirm: () => void; children: ReactNode; title?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = window.setTimeout(() => setArmed(false), 4000); return () => window.clearTimeout(t); }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? 'danger s-armed' : ''}`} title={title} aria-live="polite"
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }} onBlur={() => setArmed(false)}>
      {armed ? confirmLabel : children}
    </button>
  );
}

export function Drawer({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="s-drawer-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="s-drawer" style={wide ? { width: 'min(760px, 100vw)' } : undefined} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Details'} tabIndex={-1} ref={ref}>
        <div className="s-row between" style={{ marginBottom: 16, alignItems: 'flex-start' }}>
          <div className="s-h2">{title}</div>
          <button className="s-iconbtn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Modal({ label, onClose, children, width }: { label: string; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    ref.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="s-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="s-modal" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref} style={width ? { width: `min(${width}px, 100%)` } : undefined}>{children}</div>
    </div>
  );
}

/** Live clock hook (1 s), paused when the tab is hidden. */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, interval);
    return () => window.clearInterval(t);
  }, [interval]);
  return now;
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function timeOf(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
}

export function BrandMark({ size = 30 }: { size?: number }) {
  // The three offices at their real relative positions: Rennes (north), Nantes (south-west), Angers (east, head office).
  return (
    <svg className="s-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--s-bg-3)" stroke="var(--s-line-2)" />
      <path d="M10.6 8.4 L9.6 21.6 L22.6 17.6 Z" fill="none" stroke="var(--s-teal)" strokeWidth="1.4" strokeLinejoin="round" opacity=".9" />
      <circle cx="10.6" cy="8.4" r="2.1" fill="var(--s-text)" />
      <circle cx="9.6" cy="21.6" r="2.1" fill="var(--s-text)" />
      <circle cx="22.6" cy="17.6" r="3" fill="var(--s-teal)" />
      <circle cx="22.6" cy="17.6" r="5.6" fill="none" stroke="var(--s-teal)" strokeOpacity=".35" />
    </svg>
  );
}
