import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AudioLines, ChevronDown, FileText, Fingerprint, ListChecks, Menu, MonitorPlay, MonitorSmartphone, Radar, ScanEye, Settings2,
  Siren, Users, Volume2, VolumeX, X, Search, Presentation, BookOpen, BellRing,
} from 'lucide-react';
import { useStore, setPersona, setSettings } from '../state/store';
import { nextAction, scenarioOf } from '../engine/incident';
import { TEAM, SECONDARY } from '../data/team';
import type { ActorId } from '../data/team';
import { Avatar, BrandMark, clock, personMeta, Sim, useNow } from './kit';
import { getPrefs, novaState, novaSubscribe, setPrefs, silenceNova, unlockNova } from '../audio/nova';
import { unlockAudio, play } from '../audio/sfx';
import { useSyncExternalStore } from 'react';
import { ENTERPRISE_NAV, RISK_GROUP } from '../enterpriseNav';

/** area 'workspace': a page of the case workspace (the original IRM pages); otherwise part of the incident rehearsal. */
export type NavItem = { to: string; label: string; desc: string; icon: ReactNode; tag?: string; area?: 'workspace' };
export type NavGroup = { key: string; label: string; blurb: string; items: NavItem[] };

export const SENTINEL_NAV: NavGroup[] = [
  { key: 'command', label: 'Command', blurb: 'The live picture and the next authorized decision.', items: [
    { to: '/command', label: 'Command Center', desc: 'Posture, exposure and the next decision', icon: <Radar size={17} /> },
    { to: '/incident', label: 'Live incident', desc: 'Seven gates from signal to closure', icon: <Siren size={17} /> },
    { to: '/soc', label: 'Security operations', desc: 'Alert queue, endpoints and indicators', icon: <ScanEye size={17} /> },
  ] },
  { key: 'response', label: 'Response', blurb: 'Who does what, by when, with which approval.', items: [
    { to: '/response', label: 'Department plans', desc: 'Cyber, Finance, IT, Executive, Risk', icon: <ListChecks size={17} /> },
    { to: '/inbox', label: 'Team Inbox', desc: 'Simulated sign-in, assigned tasks and notifications', icon: <BellRing size={17} /> },
    { to: '/endpoint', label: 'Endpoint action', desc: 'Pierre’s request, Karan’s Mac approval', icon: <MonitorSmartphone size={17} /> },
  ] },
  { key: 'assurance', label: 'Assurance', blurb: 'Evidence the board and the auditor can trust.', items: [
    { to: '/evidence', label: 'Evidence ledger', desc: 'Hash-chained record of every decision', icon: <Fingerprint size={17} /> },
    { to: '/report', label: 'After-action report', desc: 'Causal trace and residual risk', icon: <FileText size={17} /> },
  ] },
  { key: 'team', label: 'Team', blurb: 'Six people, six authorities, one chain of custody.', items: [
    { to: '/team', label: 'Authority map', desc: 'Roles, RACI and separation of duties', icon: <Users size={17} /> },
    { to: '/present', label: 'Presenter Mode', desc: 'Audience view, private console, Q&A', icon: <Presentation size={17} /> },
    { to: '/settings', label: 'Voice & settings', desc: 'NOVA voice, sound, motion, projector', icon: <Settings2 size={17} /> },
    { to: '/guide', label: 'Demo guide', desc: 'How to run the class demonstration', icon: <BookOpen size={17} /> },
  ] },
];

export function navGroups(): NavGroup[] {
  const [command, response, assurance, team] = SENTINEL_NAV;
  const ws = (items: NavItem[]) => items.map(i => ({ ...i, area: 'workspace' as const }));
  return [
    { ...command, items: [...command.items, ...ws(ENTERPRISE_NAV.command)] },
    { ...RISK_GROUP, items: ws(ENTERPRISE_NAV.risk) },
    { ...response, items: [...response.items, ...ws(ENTERPRISE_NAV.response)] },
    { ...assurance, items: [...assurance.items, ...ws(ENTERPRISE_NAV.assurance)] },
    { ...team, items: [...team.items, ...ws(ENTERPRISE_NAV.team)] },
  ];
}

/** Each menu separates the incident rehearsal from the case workspace, so similar names never collide. */
const SECTIONS: { key: 'rehearsal' | 'workspace'; label: string }[] = [
  { key: 'rehearsal', label: 'Incident rehearsal' },
  { key: 'workspace', label: 'Case workspace · simulated case data' },
];
const inSection = (items: NavItem[], key: 'rehearsal' | 'workspace') => items.filter(i => (i.area === 'workspace') === (key === 'workspace'));

export function useNova() { return useSyncExternalStore(novaSubscribe, novaState, novaState); }

export default function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [mega, setMega] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const groups = navGroups();
  const closeT = useRef<number | null>(null);
  useEffect(() => { setMega(null); setMobile(false); }, [loc.pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMega(null); setMobile(false); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, []);
  const flat = groups.flatMap(g => g.items.map(i => ({ ...i, g: g.key })));
  const here = flat.filter(i => loc.pathname === i.to || loc.pathname.startsWith(`${i.to}/`)).sort((a, b) => b.to.length - a.to.length)[0];
  const open = (k: string) => { if (closeT.current) window.clearTimeout(closeT.current); setMega(k); };
  const leave = () => { if (closeT.current) window.clearTimeout(closeT.current); closeT.current = window.setTimeout(() => setMega(null), 180); };
  const mg = groups.find(g => g.key === mega);

  return (
    <>
      <a href="#s-main" className="s-skip">Skip to content</a>
      <header className="s-header" onMouseLeave={leave}>
        <button className="s-iconbtn s-show-md" onClick={() => setMobile(true)} aria-label="Open menu"><Menu size={20} /></button>
        <Link to="/" className="s-brand" aria-label="NOVATECH Sentinel — home"><BrandMark /><span className="s-brand-name">NOVATECH<span>Sentinel</span></span></Link>
        <nav className="s-nav" aria-label="Main">
          {groups.map(g => (
            <button key={g.key} className={`s-nav-btn ${here?.g === g.key ? 'on' : ''}`} aria-expanded={mega === g.key} aria-haspopup="true"
              onMouseEnter={() => open(g.key)} onFocus={() => open(g.key)} onClick={() => setMega(m => m === g.key ? null : g.key)}>
              {g.label}<ChevronDown size={14} />
            </button>
          ))}
        </nav>
        <div className="s-spacer" />
        <div className="s-header-tools">
          <IncidentChip />
          <TeamInboxIndicator />
          <span className="s-hide-sm"><Sim /></span>
          <PersonaSwitcher />
          <SoundToggle />
          <VoiceToggle />
          <Link to="/present" className="s-btn primary sm s-hide-sm s-present-btn" aria-label="Present" title="Presenter Mode"><MonitorPlay size={16} /><span className="lbl">Present</span></Link>
          <Link to="/settings" className="s-iconbtn s-hide-lg" aria-label="Voice and settings" title="Voice and settings"><Settings2 size={18} /></Link>
        </div>
        {mg && (
          <div className="s-mega" onMouseEnter={() => open(mg.key)}>
            <div className="s-mega-side"><div className="s-h3">{mg.label}</div><p>{mg.blurb}</p></div>
            <div className="s-mega-secs">
              {SECTIONS.map(sec => { const items = inSection(mg.items, sec.key); return items.length ? (
                <div className="s-mega-sec" key={sec.key}>
                  <span className="s-label">{sec.label}</span>
                  <div className="s-mega-grid">
                    {items.map(i => (
                      <NavLink key={i.to} to={i.to} className={({ isActive }) => `s-mega-item ${isActive ? 'on' : ''}`}>
                        <span className="ic">{i.icon}</span><b>{i.label}{i.tag && <span className="tag">{i.tag}</span>}</b><span>{i.desc}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ) : null; })}
            </div>
          </div>
        )}
      </header>
      {mega && <div className="s-scrim" onMouseEnter={leave} onClick={() => setMega(null)} />}
      {mobile && (
        <div className="s-menu-mobile" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="s-row between"><Link to="/" className="s-brand"><BrandMark /><span className="s-brand-name">NOVATECH<span>Sentinel</span></span></Link><button className="s-iconbtn" onClick={() => setMobile(false)} aria-label="Close menu"><X size={20} /></button></div>
          <div style={{ marginTop: 14 }} className="s-row wrap"><Sim large /><Link to="/present" className="s-btn primary"><MonitorPlay size={16} />Present</Link></div>
          {groups.map(g => (
            <div className="grp" key={g.key}>
              <span className="s-label">{g.label}</span>
              {SECTIONS.map(sec => { const items = inSection(g.items, sec.key); return items.length ? (
                <div key={sec.key}>
                  {sec.key === 'workspace' && <span className="s-mm-sub">Case workspace</span>}
                  {items.map(i => <NavLink key={i.to} to={i.to} className={({ isActive }) => isActive ? 'on' : ''}>{i.icon}{i.label}</NavLink>)}
                </div>
              ) : null; })}
            </div>
          ))}
        </div>
      )}
      <main id="s-main" tabIndex={-1}>{children}</main>
      <footer className="s-footer">
        <span>NOVATECH Services is the fictional ESAIP case company. Telemetry, incidents and money figures are simulated and labelled.</span>
        <span>ESAIP MSc · Risk Management · Group 1 · NOVATECH Sentinel V2.4</span>
      </footer>
    </>
  );
}

function IncidentChip() {
  const run = useStore(s => s.run);
  const now = useNow();
  if (run.status === 'ready') return <Link to="/incident" className="s-incident-chip s-hide-sm"><span className="dot" />No incident running</Link>;
  const s = scenarioOf(run);
  const t = clock((run.closedAt ? Date.parse(run.closedAt) : now) - Date.parse(run.startedAt!));
  return <Link to="/incident" className={`s-incident-chip ${run.status === 'active' ? 'live' : 'closed'}`} title={s.title} aria-label={`${s.ref} ${run.status === 'active' ? 'live' : 'closed'} — open the incident`}><span className="dot" /><span className="s-mono s-hide-xs">{s.ref}</span><span className="s-num s-hide-sm">{t}</span></Link>;
}

function TeamInboxIndicator() {
  const run = useStore(s => s.run);
  const persona = useStore(s => s.persona);
  const enabled = useStore(s => s.settings.teamInboxMode);
  if (!enabled) return null;
  const mine = run.status === 'active' && nextAction(run).actor === persona;
  return <Link to="/inbox" className="s-iconbtn s-inbox-indicator" title={mine ? 'Action waiting in your demo inbox' : 'Open team inbox'} aria-label={mine ? 'Open team inbox: one action required' : 'Open team inbox'}>
    <BellRing size={18} />{mine && <span className="s-inbox-badge">1</span>}
  </Link>;
}

export function PersonaSwitcher({ compact }: { compact?: boolean }) {
  const persona = useStore(s => s.persona);
  const run = useStore(s => s.run);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const need = nextAction(run).actor;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close); return () => window.removeEventListener('mousedown', close);
  }, [open]);
  const m = personMeta(persona);
  const pick = (id: ActorId) => { setPersona(id); setOpen(false); play('select'); };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="s-persona" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} title="Demo persona — not authentication">
        <Avatar id={persona} size="sm" />
        {!compact && <span className="who s-hide-sm"><b>{m.first}</b><small>Demo persona</small></span>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="s-pop" role="menu">
          <div className="s-pop-head"><b>Act as</b><p>A presentation convenience to play each role — not authentication. The enterprise workspace uses personal accounts.</p></div>
          {TEAM.map(p => (
            <button key={p.id} role="menuitemradio" aria-checked={persona === p.id} className="s-pop-item" onClick={() => pick(p.id)}>
              <Avatar id={p.id} /><span className="meta"><b>{p.name}</b><small>{p.role}</small></span>{need === p.id && <span className="need">Needed now</span>}
            </button>
          ))}
          <div className="s-pop-sep" />
          <details>
            <summary className="s-pop-item" style={{ listStyle: 'none' }}><span className="meta"><b>Fictional NOVATECH employees</b><small>Deputies and consulted staff — not Group 1</small></span></summary>
            {SECONDARY.filter(p => p.id === 'thomas' || p.id === 'auditor' || p.id === 'lea').map(p => (
              <button key={p.id} role="menuitemradio" aria-checked={persona === p.id} className="s-pop-item" onClick={() => pick(p.id)}>
                <Avatar id={p.id} /><span className="meta"><b>{p.name}</b><small>{p.role}</small></span>{need === p.id && <span className="need">Needed now</span>}
              </button>
            ))}
          </details>
        </div>
      )}
    </div>
  );
}

function SoundToggle() {
  const muted = useStore(s => s.settings.muted);
  return (
    <button className="s-iconbtn" aria-pressed={!muted} title={muted ? 'Sound effects off' : 'Sound effects on'} aria-label={muted ? 'Turn sound effects on' : 'Turn sound effects off'}
      onClick={() => { unlockAudio(); setSettings({ muted: !muted }); if (muted) window.setTimeout(() => play('select'), 60); }}>
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}

function VoiceToggle() {
  const nova = useNova();
  const enabled = getPrefs().enabled;
  void nova;
  return (
    <button className="s-iconbtn s-hide-xs" aria-pressed={enabled} title={enabled ? 'NOVA voice on' : 'NOVA voice off'} aria-label={enabled ? 'Turn NOVA voice off' : 'Turn NOVA voice on'}
      onClick={() => { unlockNova(); unlockAudio(); if (enabled) silenceNova(); setPrefs({ enabled: !enabled }); }}>
      <AudioLines size={18} />
    </button>
  );
}

export function useGoto() { const nav = useNavigate(); return (to: string) => nav(to); }
export { Search };
