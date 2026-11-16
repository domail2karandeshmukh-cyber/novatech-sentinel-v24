import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MonitorPlay, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
import Atlas from '../components/Atlas';
import { BrandMark, Avatar, Sim } from '../components/kit';
import { COMPANY } from '../data/company';
import { GATES } from '../data/scenarios';
import { TEAM } from '../data/team';
import { REGISTER, APPETITE_LIMIT, scoreOf } from '../data/register';
import { setSettings, useStore } from '../state/store';
import { scenarioOf } from '../engine/incident';
import { play, unlockAudio } from '../audio/sfx';

const GATE_OWNER: Record<string, string> = {
  detect: 'Karan takes ownership', assess: 'Nadia investigates', impact: 'Sarah prices the exposure',
  authorize: 'Victor and Vanessa authorise', execute: 'Pierre executes the approved scope', verify: 'Victor verifies — never the executor', close: 'Karan closes with residual risk',
};
const SIGNS: Record<string, { signs: string; never: string }> = {
  karan: { signs: 'Ownership and closure of incidents', never: 'Approvals of actions he coordinates' },
  victor: { signs: 'Security authorization, verification independent of execution', never: 'Verification of anything he executed' },
  vanessa: { signs: 'Executive authorization — from €100,000, or when the usual approver requested the action', never: 'Execution' },
  nadia: { signs: 'Detection, investigation, treatment proposals', never: 'Approval of her own proposal' },
  sarah: { signs: 'Financial impact and payment-hold requests', never: 'Approval of a hold she requested' },
  pierre: { signs: 'Execution of authorised actions only', never: 'Approval or verification of his own work' },
};

export default function Landing() {
  const run = useStore(s => s.run);
  const muted = useStore(s => s.settings.muted);
  const [introKey, setIntroKey] = useState(0);
  const [intro, setIntro] = useState(true);
  const [playing, setPlaying] = useState(true);
  useEffect(() => {
    const reduced = document.documentElement.dataset.sMotion === 'reduce' || (document.documentElement.dataset.sMotion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    if (!intro || reduced) { setPlaying(false); return; }
    setPlaying(true); const t = window.setTimeout(() => setPlaying(false), 2400); return () => window.clearTimeout(t);
  }, [introKey, intro]);
  const outside = REGISTER.filter(r => scoreOf(r) > APPETITE_LIMIT).length;
  const live = run.status === 'active' ? scenarioOf(run) : null;
  return (
    <div className="s-landing">
      <header className="s-landing-head">
        <Link to="/" className="s-brand"><BrandMark /><span className="s-brand-name">NOVATECH<span>Sentinel</span></span></Link>
        <nav className="s-landing-nav s-hide-sm" aria-label="Page sections"><a href="#how">How it works</a><a href="#team">Team</a><Link to="/present">Presenter Mode</Link></nav>
        <div className="s-spacer" />
        <button className="s-iconbtn" aria-pressed={!muted} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} onClick={() => { unlockAudio(); setSettings({ muted: !muted }); if (muted) window.setTimeout(() => play('start'), 80); }}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        <Link to="/command" className="s-btn primary s-hide-sm">Enter Command Center<ArrowRight size={16} /></Link>
      </header>

      <section className="s-hero" aria-labelledby="s-hero-title">
        <Atlas key={introKey} mode="landing" intro={intro} run={run} className="s-hero-atlas" tour="atlas" />
        <div className="s-hero-veil" aria-hidden="true" />
        <div className="s-hero-copy">
          <p className="s-hero-kicker">NOVATECH Sentinel — the enterprise nervous system</p>
          <h1 id="s-hero-title" className="s-display s-hero-title"><span>See the threat.</span> <span>Own the decision.</span> <span>Prove the response.</span></h1>
          <p className="s-lead">Offices, cloud, money and people — every signal wired to an owner, an authority and a proof. Built for NOVATECH Services by ESAIP Group 1.</p>
          <div className="s-row wrap" style={{ gap: 12, marginTop: 26 }}>
            <Link to="/command" className="s-btn primary lg s-cta" data-tour="enter-cta" onClick={() => { unlockAudio(); play('start'); }}>Enter Command Center<ArrowRight size={18} /></Link>
            <Link to="/present" className="s-btn lg"><MonitorPlay size={18} />Present with NOVA</Link>
          </div>
          <dl className="s-hero-facts" data-tour="landing-facts">
            <div><dt>People</dt><dd>{COMPANY.employees}<small>+{COMPANY.plannedHires} hires planned</small></dd></div>
            <div><dt>Clients</dt><dd>{COMPANY.clients}<small>{Math.round(COMPANY.recurringShare * 100)}% recurring revenue</small></dd></div>
            <div><dt>Turnover</dt><dd>€12M<small>+{Math.round(COMPANY.revenueGrowth * 100)}% growth</small></dd></div>
            <div><dt>Telework</dt><dd>{Math.round(COMPANY.teleworkShare * 100)}%<small>3 offices, 1 cloud</small></dd></div>
          </dl>
          <p className="s-hero-status" role="status">
            {live ? <><span className="s-dot s-crimson" /> Live: <span className="s-mono">{live.ref}</span> {live.title.toLowerCase()} — <Link to="/incident">open the incident</Link></>
              : <><span className="s-dot s-amber" /> {outside} register risks sit outside the board’s appetite · no incident running</>}
            <Sim />
          </p>
        </div>
        {playing
          ? <button className="s-hero-replay" onClick={() => { setIntro(false); setIntroKey(k => k + 1); }}><SkipForward size={14} />Skip intro</button>
          : <button className="s-hero-replay" onClick={() => { setIntro(true); setIntroKey(k => k + 1); }}><RotateCcw size={14} />Replay arrival</button>}
        <div className="s-hero-legend" aria-hidden="true">
          <span><i className="g office" />Office</span><span><i className="g cloud" />Cloud</span><span><i className="g fin" />Finance &amp; SaaS</span><span><i className="g clients" />Clients</span><span><i className="g home" />Teleworkers</span>
        </div>
      </section>

      <section className="s-band" id="how" aria-labelledby="s-how">
        <div className="s-band-in">
          <div className="s-band-head"><h2 id="s-how" className="s-h1">From signal to sovereign decision</h2><p className="s-lead">One incident, seven gates, and a named person at every gate. Nothing disruptive happens without authority, and nothing is closed without proof from someone who did not do the work.</p></div>
          <ol className="s-seq">
            {GATES.map(g => <li key={g.key}><span className="n">{g.n}</span><b>{g.name}</b><span>{GATE_OWNER[g.key]}</span></li>)}
          </ol>
        </div>
      </section>

      <section className="s-band alt" id="team" aria-labelledby="s-team">
        <div className="s-band-in">
          <div className="s-band-head"><h2 id="s-team" className="s-h1">Six people. Six authorities.</h2><p className="s-lead">Each member of Group 1 plays their real NOVATECH role. Their role decides what they may sign — and what they may never sign.</p></div>
          <div className="s-teamgrid">
            {TEAM.map(p => (
              <article key={p.id} className="s-teamcard">
                <div className="s-row" style={{ gap: 12 }}><Avatar id={p.id} size="lg" /><div><b>{p.name}</b><span>{p.role}</span></div></div>
                <p><span className="s-label">Signs</span>{SIGNS[p.id].signs}</p>
                <p><span className="s-label">Never signs</span>{SIGNS[p.id].never}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="s-band" aria-labelledby="s-present">
        <div className="s-band-in s-present-invite">
          <div><h2 id="s-present" className="s-h1">Built to be presented</h2>
            <p className="s-lead">A projector view the room can read from the back, a private console that tells each speaker what to say and click, a six-person relay with handoffs, and NOVA — a co-presenter voice that speaks Indian English and knows whose turn it is.</p>
            <div className="s-row wrap" style={{ gap: 12, marginTop: 20 }}><Link to="/present" className="s-btn primary lg"><MonitorPlay size={18} />Open Presenter Mode</Link><Link to="/settings" className="s-btn lg">Tune NOVA’s voice</Link></div>
          </div>
          <ul className="s-invite-list">
            <li><b>Audience view</b><span>Large type, one message per scene, the live screens with spotlights.</span></li>
            <li><b>Presenter console</b><span>Now speaking, up next, timer, script, keywords, teacher questions.</span></li>
            <li><b>2, 5, 8 or 12 minutes</b><span>Nine ready-made shows, from executive overview to the full workflow.</span></li>
            <li><b>Professor Q&amp;A</b><span>Pause anywhere, open the evidence, resume exactly where you were.</span></li>
          </ul>
        </div>
      </section>
      <footer className="s-footer">
        <span>NOVATECH Services is the fictional ESAIP case company. Telemetry, incidents and money figures are simulated and labelled.</span>
        <span>ESAIP MSc · Risk Management · Group 1 · NOVATECH Sentinel V2.4</span>
      </footer>
    </div>
  );
}
