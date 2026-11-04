import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { DURATIONS } from './model';
import type { Duration, ShowId } from './model';
import { SHOW_IDS, buildShow, showMeta, QUESTIONS } from './shows';
import { speakerFor, DURATION_LABEL } from './controller';
import { useStore } from '../state/store';
import { HASH_ROUTING } from '../env';
import { Avatar, personMeta } from '../components/kit';

/** Phone / print script. Deliberately not synchronised: it follows the scene numbers on the projector. */
export default function Script() {
  const [sp, setSp] = useSearchParams();
  const p = useStore(s => s.presenter);
  const show = (SHOW_IDS as string[]).includes(sp.get('show') ?? '') ? sp.get('show') as ShowId : p.showId;
  const d = Number(sp.get('d'));
  const duration: Duration = (DURATIONS as number[]).includes(d) ? d as Duration : p.duration;
  const scenes = useMemo(() => buildShow(show, duration), [show, duration]);
  const [current, setCurrent] = useState(0);
  return (
    <div className="s-script">
      <header className="s-script-head">
        <Link to="/present" className="s-iconbtn" aria-label="Back"><ArrowLeft size={18} /></Link>
        <div><b>{showMeta(show).title}</b><small>{DURATION_LABEL[duration]} · {scenes.length} scenes · not synchronised</small></div>
        {!HASH_ROUTING && <button className="s-iconbtn" onClick={() => window.print()} aria-label="Print"><Printer size={18} /></button>}
      </header>
      <div className="s-script-pick">
        <select className="s-select" value={show} onChange={e => setSp({ show: e.target.value, d: String(duration) })} aria-label="Show">{SHOW_IDS.map(id => <option key={id} value={id}>{showMeta(id).title}</option>)}</select>
        <select className="s-select" value={duration} onChange={e => setSp({ show, d: e.target.value })} aria-label="Length">{DURATIONS.map(x => <option key={x} value={x}>{DURATION_LABEL[x]}</option>)}</select>
      </div>
      <ol className="s-script-list">
        {scenes.map((s, i) => { const who = speakerFor(s, p); return (
          <li key={s.id + i} className={i === current ? 'now' : ''} onClick={() => setCurrent(i)}>
            <div className="s-row" style={{ gap: 10 }}><span className="n s-num">{i + 1}</span><Avatar id={who} /><div><b>{s.title}</b><small>{personMeta(who).name} · {s.seconds} s</small></div></div>
            <p className="say">{s.say}</p>
            <p className="kw">{s.keywords.join(' · ')}</p>
            <p><b>Click:</b> {s.click}</p>
            <p><b>Expect:</b> {s.expected}</p>
            <p><b>Q:</b> {s.question.q} <br /><b>A:</b> {s.question.a}</p>
          </li>
        ); })}
      </ol>
      <section className="s-script-qa"><h2>Professor questions</h2>{QUESTIONS.map(q => <details key={q.id}><summary>{q.q} <small>— {personMeta(q.who).first} answers</small></summary><p>{q.a}</p><small>Show: {q.evidence}</small></details>)}</section>
    </div>
  );
}
