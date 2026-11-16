import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, Laptop, MonitorPlay, Play, ScrollText, Smartphone, Users } from 'lucide-react';
import { useStore } from '../state/store';
import { DURATIONS } from './model';
import type { Duration, ShowId } from './model';
import { SHOW_IDS, buildShow, showMeta } from './shows';
import { DURATION_LABEL, presenter, speakerFor, RELAY_SEGMENTS } from './controller';
import { TEAM } from '../data/team';
import type { PersonId } from '../data/team';
import { Avatar, Sim, personMeta } from '../components/kit';
import { unlockAudio } from '../audio/sfx';
import { unlockNova } from '../audio/nova';
import { HASH_ROUTING, appUrl } from '../env';

export default function Present() {
  const p = useStore(s => s.presenter);
  const nav = useNavigate();
  const scenes = buildShow(p.showId, p.duration);
  const meta = showMeta(p.showId);
  const [blocked, setBlocked] = useState(false);
  const openAudience = () => {
    unlockAudio(); unlockNova();
    const w = window.open(appUrl('/present/audience'), 'novatech-audience', 'popup=yes,width=1280,height=760');
    if (!w) { setBlocked(true); return; }
    nav('/present/console');
  };
  const setSlot = (i: number, id: PersonId) => presenter.setRelay(p.relay.map((x, j) => j === i ? id : x));
  return (
    <div className="s-page s-present">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Presenter Mode</h1><p className="s-lead" style={{ marginTop: 8 }}>Pick a show and a length. The projector shows the live screens with one spotlight at a time; your console tells each speaker what to say, what to click and what the professor may ask.</p></div>
        <Sim large />
      </div>

      <section className="s-panel" aria-labelledby="h-show">
        <div className="s-panel-head"><h2 id="h-show" className="s-h3">1 · Choose the show</h2>
          <div className="s-seg" role="group" aria-label="Length">{DURATIONS.map((d: Duration) => <button key={d} aria-pressed={p.duration === d} onClick={() => presenter.configure(p.showId, d)}>{DURATION_LABEL[d]}</button>)}</div></div>
        <div className="s-shows">
          {SHOW_IDS.map((id: ShowId) => { const m = showMeta(id); const n = buildShow(id, p.duration).length; return (
            <button key={id} className={`s-show ${p.showId === id ? 'on' : ''}`} aria-pressed={p.showId === id} onClick={() => presenter.configure(id, p.duration)}>
              <b>{m.title}</b><span>{m.blurb}</span><small>{n} scenes · {DURATION_LABEL[p.duration]}{id === 'full' ? ' · recommended' : ''}</small>
            </button>
          ); })}
        </div>
      </section>

      <div className="s-present-grid">
        <section className="s-panel" aria-labelledby="h-outline">
          <div className="s-panel-head"><h2 id="h-outline" className="s-h3">2 · Run of show — {meta.title}</h2><span className="s-small">{scenes.length} scenes</span></div>
          <ol className="s-outline">{scenes.map((s, i) => { const sp = speakerFor(s, p); return (
            <li key={s.id + i}><span className="n s-num">{i + 1}</span><Avatar id={sp} size="sm" /><span className="t"><b>{s.title}</b><small>{personMeta(sp).name} · {s.segment} · {s.seconds} s</small></span></li>
          ); })}</ol>
        </section>
        <section className="s-panel" aria-labelledby="h-relay">
          <div className="s-panel-head"><div><h2 id="h-relay" className="s-h3"><Users size={16} style={{ verticalAlign: -2, marginRight: 6 }} />3 · Speaking order</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Default: the class order. Change a slot if someone is absent — business roles never change.</p></div></div>
          <ol className="s-relay-edit">{RELAY_SEGMENTS.map((r, i) => (
            <li key={i}><span className="n s-num">{i + 1}</span><span className="t"><b>{r.segment}</b><small>{r.focus}</small></span>
              <select className="s-select" aria-label={`Speaker for ${r.segment}`} value={p.relay[i]} onChange={e => setSlot(i, e.target.value as PersonId)}>{TEAM.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></li>
          ))}</ol>
          <button className="s-btn ghost sm" onClick={() => presenter.setRelay(['karan', 'victor', 'nadia', 'sarah', 'vanessa', 'pierre', 'karan'])}>Restore class order</button>
        </section>
      </div>

      <section className="s-panel raised" aria-labelledby="h-go">
        <div className="s-panel-head"><h2 id="h-go" className="s-h3">4 · Start</h2></div>
        <div className="s-launch">
          <div className="s-launch-opt rec">
            <MonitorPlay size={22} /><b>Two windows (recommended)</b>
            <p>Projector as an <b>extended display</b>. The audience window goes to the projector; the private console stays on your laptop. They stay in sync inside this browser.</p>
            <button className="s-btn primary lg" onClick={openAudience}><ExternalLink size={16} />Open audience window + console</button>
            <span className="s-small">Drag the audience window to the projector and click <b>Start the projector</b> on it once: full screen, sound and NOVA’s voice in one click.</span>
            {blocked
              ? <p className="s-policy warn" role="alert" style={{ margin: 0 }}><span>{HASH_ROUTING ? 'This preview host does not allow a second window. Use “One screen” here; two windows work on the Vercel preview.' : 'The browser blocked the audience window. Allow pop-ups for this site and try again, or use “One screen”.'}</span></p>
              : <span className="s-small">If the pop-up is blocked, allow pop-ups for this site, or open <Link to="/present/audience" target="_blank" className="s-linkbtn">the audience view</Link> manually.</span>}
          </div>
          <div className="s-launch-opt">
            <Laptop size={22} /><b>One screen</b>
            <p>For a mirrored projector or rehearsal. The stage fills the screen with a small presenter dock (hide it with N). Notes on a mirrored screen are visible to the room.</p>
            <button className="s-btn lg" onClick={() => { unlockAudio(); unlockNova(); nav('/present/stage'); }}><Play size={16} />Start on this screen</button>
          </div>
          <div className="s-launch-opt">
            <Smartphone size={22} /><b>Phone script</b>
            <p>Each speaker opens it on their own phone: their lines, keywords and the professor questions with who answers. It never appears on the projector. Not synchronised — follow the scene numbers on the projector.</p>
            <Link to={`/present/script?show=${p.showId}&d=${p.duration}`} className="s-btn lg"><ScrollText size={16} />Open the script</Link>
          </div>
        </div>
        <p className="s-small" style={{ marginBottom: 0 }}>Sync works between windows of the same browser on the same computer (BroadcastChannel). Phones and other laptops do not sync — there is no backend in this public demo, by design.</p>
      </section>

      <section className="s-panel" aria-labelledby="h-who-needs">
        <div className="s-panel-head"><div><h2 id="h-who-needs" className="s-h3">Who needs what — nobody logs in</h2><p className="s-small" style={{ margin: '3px 0 0' }}>The app switches to each person’s role in their scene. That switch is a presentation convenience, not authentication — say so if asked.</p></div></div>
        <ul className="s-whoneeds">
          <li><Avatar id="karan" /><span><b>Karan’s Mac</b><small>Runs everything: the private console on the laptop screen and the audience window on the projector.</small></span></li>
          <li><Smartphone size={18} /><span><b>Everyone’s phone (optional)</b><small>The phone script: your lines, your keywords, the professor questions you answer.</small></span></li>
          <li><Avatar id="pierre" /><span><b>Pierre’s Windows laptop</b><small>Only for the final step: pair with the code from Karan’s screen and send the power-off request. It can never command the Mac.</small></span></li>
          <li><MonitorPlay size={18} /><span><b>Projector</b><small>The audience view only: live screens, spotlights, captions. Never notes, codes or the script.</small></span></li>
        </ul>
      </section>
    </div>
  );
}
