import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Sim } from '../components/kit';

export default function Guide() {
  return (
    <div className="s-page s-guide">
      <div className="s-pagehead"><div><h1 className="s-h1">Demo guide</h1><p className="s-lead" style={{ marginTop: 8 }}>How to run the class demonstration, from the public link — no Terminal needed for anything except the real Mac action.</p></div><Sim large /></div>
      <div className="s-guide-grid">
        <section className="s-panel raised">
          <h2 className="s-h3">Before class (5 minutes)</h2>
          <ol className="s-steps">
            <li>Open this site in <b>Microsoft Edge</b> on the presenting laptop — its free “Natural” voices (Neerja, Prabhat) are the smoothest — and connect the projector as an <b>extended display</b>.</li>
            <li>Go to <Link to="/settings">Voice &amp; settings</Link> and press <b>Test NOVA</b>: the voice should be marked <b>natural</b>. Turn on <b>Projector contrast</b> if the room is bright.</li>
            <li>Open <Link to="/present">Presenter Mode</Link>, pick <b>Complete end-to-end</b> and the length you were given (2 to 30 minutes), check the speaking order.</li>
            <li>Press <b>Open audience window + console</b>, drag the audience window to the projector and click <b>Start the projector</b> on it once: full screen, sound and voice together. Keep the console on the laptop.</li>
            <li>On the console, press <b>Test projector sound</b>. <b>Start presentation</b> always begins with a fresh incident.</li>
          </ol>
        </section>
        <section className="s-panel">
          <h2 className="s-h3">During the presentation</h2>
          <ol className="s-steps">
            <li>The console tells the current speaker what to say, what to click and what the professor may ask.</li>
            <li><b>→ / Space</b> next scene, <b>←</b> back, <b>P</b> pause, <b>Q</b> questions, <b>M</b> silence NOVA.</li>
            <li>Each scene can drive the real workflow with <b>Do it for me</b> — the same owner and separation-of-duties rules apply.</li>
            <li>If you run late, use <b>Skip</b>; skipped gates can be recorded with a labelled fast-forward.</li>
          </ol>
        </section>
        <section className="s-panel">
          <h2 className="s-h3">The final step: power off for re-imaging</h2>
          <ol className="s-steps">
            <li>The story: FIN-WS-07 was isolated first so its memory evidence survived. After verification and closure, the last follow-up powers it off for imaging and re-imaging. Karan’s MacBook stands in for FIN-WS-07.</li>
            <li>The public link only <b>simulates</b> it and ends on a black “powered off” screen. Nothing ever shuts down automatically.</li>
            <li>For the real one, present from the local copy on Karan’s Mac (<code>npm run dev</code> → <code>localhost:5173/present</code>) with the helper running; after the incident is closed, Karan opens pairing on his own screen.</li>
            <li>Pavan opens the HTTPS link on his Windows laptop (same Wi-Fi), checks the fingerprint with Karan, enters the 6-digit code, then requests.</li>
            <li>Karan’s Mac asks. <b>Reject is the default.</b> If he authorizes, the Mac shuts down and the show ends there — take questions with evidence before that scene, then answer from the phone script.</li>
          </ol>
          <p className="s-small">Untested so far: Pavan’s physical Windows laptop on the classroom Wi-Fi (rehearse once before class). School Wi-Fi with client isolation can block it — use a phone hotspot.</p>
        </section>
        <section className="s-panel">
          <h2 className="s-h3">What is real and what is simulated</h2>
          <ul className="s-steps">
            <li><b>Real:</b> the governance rules (owners, approvals, separation of duties, revision path, delegation), the hash-chained local ledger, voice and sound.</li>
            <li><b>Simulated and labelled:</b> alerts and telemetry, money figures, executions (no device, network, payment or account is touched).</li>
            <li><b>Demo persona switch:</b> a presentation convenience, not authentication.</li>
          </ul>
          <Link to="/present" className="s-btn primary" style={{ marginTop: 8 }}>Open Presenter Mode<ArrowRight size={15} /></Link>
        </section>
      </div>
    </div>
  );
}
