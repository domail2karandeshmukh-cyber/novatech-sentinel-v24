import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BellRing, CheckCircle2, Clock3, LogOut, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { TEAM } from '../data/team';
import type { PersonId } from '../data/team';
import { nextAction, scenarioOf } from '../engine/incident';
import { setPersona, setSettings, useStore } from '../state/store';
import { Avatar } from '../components/kit';

const SESSION_KEY = 'novatech-sentinel-demo-inbox-identity';
const demoEmail = (id: string) => `${id}@novatech.example`;
const readIdentity = (): PersonId | null => {
  try {
    const id = sessionStorage.getItem(SESSION_KEY);
    return TEAM.find(p => p.id === id)?.id ?? null;
  } catch { return null; }
};

/** A role-driven classroom rehearsal. This is intentionally NOT an authentication provider. */
export default function Inbox() {
  const navigate = useNavigate();
  const run = useStore(s => s.run);
  const persona = useStore(s => s.persona);
  const enabled = useStore(s => s.settings.teamInboxMode);
  const [identity, setIdentity] = useState<PersonId | null>(readIdentity);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const next = nextAction(run);
  const scenario = scenarioOf(run);
  const user = TEAM.find(p => p.id === identity);
  const current = identity && persona === identity;
  const assigned = run.status === 'active' && !!identity && next.actor === identity;
  const last = run.ledger[run.ledger.length - 1];
  const history = identity ? run.ledger.filter(e => e.actor === identity).slice(-4).reverse() : [];

  const signIn = (id: PersonId) => {
    setIdentity(id);
    setPersona(id);
    setError('');
    try { sessionStorage.setItem(SESSION_KEY, id); } catch { /* use this tab only */ }
  };
  const signOut = () => {
    setIdentity(null);
    setEmail('');
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };
  const submit = () => {
    const person = TEAM.find(p => demoEmail(p.id) === email.trim().toLowerCase());
    if (!person) {
      setError('Choose one of the six NOVATECH demo addresses below.');
      return;
    }
    signIn(person.id);
  };

  return (
    <div className="s-page s-inbox">
      <div className="s-pagehead">
        <div>
          <h1 className="s-h1">Team Inbox <span className="s-chip">DEMO MODE</span></h1>
          <p className="s-lead" style={{ marginTop: 8 }}>
            A more natural route: the incident assigns a task, the responsible person opens their inbox,
            reviews the request and signs the existing controlled form.
          </p>
        </div>
        <Link to="/incident" className="s-btn"><ArrowRight size={16} /> Incident workspace</Link>
      </div>

      <section className="s-panel s-inbox-mode">
        <div className="s-row between wrap" style={{ gap: 12 }}>
          <div>
            <b>Notification-driven classroom flow</b>
            <p className="s-small" style={{ margin: '4px 0 0' }}>
              This works across pages and windows in the same browser. It does not send actual emails
              or synchronize independent laptops. The existing Presenter Mode remains available.
            </p>
          </div>
          <button className={`s-btn ${enabled ? 'primary' : ''}`} aria-pressed={enabled} onClick={() => setSettings({ teamInboxMode: !enabled, autoPersona: false })}>
            <BellRing size={16} />{enabled ? 'Team mode ON — turn off' : 'Enable Team Inbox mode'}
          </button>
        </div>
      </section>

      {!user ? (
        <section className="s-panel raised s-inbox-signin">
          <div className="s-panel-head">
            <div><h2 className="s-h2"><Mail size={20} /> Demo account sign-in</h2>
              <p className="s-small" style={{ marginTop: 8 }}>
                Pick a fictional @novatech.example address. No password is required because this is
                an openly labelled simulation, not secure authentication.
              </p>
            </div>
          </div>
          <form onSubmit={e => { e.preventDefault(); submit(); }} className="s-inbox-form">
            <label className="s-field"><span>Demo email address</span>
              <input className="s-input" type="email" autoComplete="off" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} placeholder="karan@novatech.example" />
            </label>
            <button className="s-btn primary" type="submit">Enter demo inbox <ArrowRight size={16} /></button>
          </form>
          {error && <p className="s-error" role="alert">{error}</p>}
          <div className="s-inbox-accounts">
            {TEAM.map(p => (
              <button key={p.id} type="button" className="s-inbox-account" onClick={() => { setEmail(demoEmail(p.id)); signIn(p.id); }}>
                <Avatar id={p.id} size="lg" />
                <span><b>{p.name}</b><small>{p.role}</small><em>{demoEmail(p.id)}</em></span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="s-panel raised">
            <div className="s-row between wrap" style={{ gap: 12 }}>
              <div className="s-row" style={{ gap: 12 }}>
                <Avatar id={user.id} size="lg" />
                <div><div className="s-label">Simulated account · {demoEmail(user.id)}</div><h2 className="s-h2" style={{ marginTop: 3 }}>{user.name}</h2><p className="s-small" style={{ margin: '3px 0 0' }}>{user.role}</p></div>
              </div>
              <button className="s-btn" onClick={signOut}><LogOut size={16} />Sign out of demo</button>
            </div>
          </section>
          <section className="s-panel s-inbox-message">
            <div className="s-panel-head">
              <h2 className="s-h2"><BellRing size={20} /> Notifications</h2>
              <span className={`s-chip ${assigned ? 'warn' : ''}`}>{assigned ? '1 action required' : 'No pending actions'}</span>
            </div>
            {assigned ? (
              <div className="s-inbox-task">
                <div className="s-row between wrap" style={{ gap: 8 }}>
                  <span className="s-chip warn"><Clock3 size={14} />ACTION REQUIRED</span>
                  <span className="s-small">{new Date(last?.at ?? Date.now()).toLocaleString('en-GB')}</span>
                </div>
                <h3 className="s-h2" style={{ marginTop: 12 }}>{next.title}</h3>
                <p className="s-small"><b>{scenario.ref}</b> · {scenario.title}</p>
                <p>
                  {last?.actorName ?? 'NOVATECH monitoring'} has routed the next governed
                  decision to <b>{user.name}</b>. Review the supplied evidence and complete your own assigned form.
                </p>
                <div className="s-row wrap" style={{ gap: 10, marginTop: 14 }}>
                  <button className="s-btn primary lg" onClick={() => { if (!current) setPersona(user.id); navigate('/incident'); }}>
                    <ShieldCheck size={17} />Open my decision <ArrowRight size={16} />
                  </button>
                  <Link to="/evidence" className="s-btn"><UserRound size={15} />Review audit record</Link>
                </div>
              </div>
            ) : (
              <div className="s-inbox-empty">
                <CheckCircle2 size={27} />
                <div><b>Nothing needs your signature right now.</b>
                  <p className="s-small" style={{ margin: '5px 0 0' }}>
                    {run.status === 'ready' ? 'The demo incident has not started. Karan can begin it from the incident workspace.'
                      : run.status === 'closed' ? 'The incident is closed and its decisions are recorded.'
                        : `The current action is assigned to ${TEAM.find(p => p.id === next.actor)?.name ?? 'another authorized employee'}.`}
                  </p>
                </div>
              </div>
            )}
          </section>
          <section className="s-panel">
            <div className="s-panel-head"><h2 className="s-h3">My completed activity</h2><span className="s-small">Derived from the incident audit ledger</span></div>
            {history.length ? <ul className="s-inbox-history">{history.map(e => (
              <li key={e.seq}><CheckCircle2 size={16} /><span><b>{e.title}</b><small>{new Date(e.at).toLocaleString('en-GB')} · {e.kind} · audit #{e.seq}</small></span></li>
            ))}</ul> : <p className="s-small">No signed actions from this demo identity yet.</p>}
          </section>
        </>
      )}
      <div className="s-policy info" style={{ marginTop: 18 }}>
        This classroom sign-in only selects a simulated role. It is not a verified account or email service.
        Real multi-device notifications and access control require authenticated accounts and server-side synchronization.
        The separate real Mac shutdown still requires its native helper and owner approval.
      </div>
    </div>
  );
}
