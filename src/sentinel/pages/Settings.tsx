import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioLines, Play, RotateCcw, Square, Volume2 } from 'lucide-react';
import { ACCENTS, DEFAULT_LEXICON, getPrefs, isIndianVoice, previewVoice, rankedVoices, say, setPrefs, silenceNova, stopNova, voiceQuality } from '../audio/nova';
import type { Accent, VoicePrefs } from '../audio/nova';
import { CUE_CAPTION, play, unlockAudio } from '../audio/sfx';
import type { Cue } from '../audio/sfx';
import { resetEverything, setSettings, useStore } from '../state/store';
import { TEAM } from '../data/team';
import { useNova } from '../components/Shell';
import { ConfirmButton, useToast } from '../components/kit';
import { appUrl } from '../env';

const CUES: Cue[] = ['start', 'critical', 'acknowledge', 'approvalRequested', 'approvalGranted', 'approvalReturned', 'actionStarted', 'verified', 'closed', 'remoteRequest', 'consentPending', 'cancelled'];
const CUE_EVENT: Partial<Record<Cue, string>> = {
  start: 'Opening', critical: 'New critical incident', acknowledge: 'Risk acknowledged', approvalRequested: 'Approval requested', approvalGranted: 'Approval granted',
  approvalReturned: 'Approval returned / rejected', actionStarted: 'Technical action started', verified: 'Verification successful', closed: 'Final incident closure',
  remoteRequest: 'Remote request from Pavan', consentPending: 'Mac consent pending', cancelled: 'Request cancelled / timed out',
};

export default function Settings() {
  const nova = useNova();
  const settings = useStore(s => s.settings);
  const toast = useToast();
  const [prefs, set] = useState<VoicePrefs>(getPrefs());
  const [voices, setVoices] = useState(() => rankedVoices());
  useEffect(() => { const t = window.setInterval(() => setVoices(rankedVoices()), 1500); return () => window.clearInterval(t); }, []);
  const update = (p: Partial<VoicePrefs>) => { setPrefs(p); set(getPrefs()); };
  const names = [...TEAM.map(p => p.name), 'NOVATECH'];
  return (
    <div className="s-page s-settings">
      <div className="s-pagehead"><div><h1 className="s-h1">Voice &amp; settings</h1><p className="s-lead" style={{ marginTop: 8 }}>NOVA uses your browser’s own voices — no paid service and no key in the code. The smoothest are the free “Natural” voices in Microsoft Edge (Indian English: “Neerja”, “Prabhat”); NOVA picks them automatically when they are available.</p></div></div>

      <section className="s-panel raised" aria-labelledby="h-nova">
        <div className="s-panel-head"><div><h2 id="h-nova" className="s-h2"><AudioLines size={20} style={{ verticalAlign: -3, marginRight: 8 }} />NOVA voice lab</h2><p className="s-small s-voice-q" style={{ margin: '4px 0 0' }}>{nova.voiceName ? <>Selected: <b>{nova.voiceName}</b> ({nova.voiceLang})<span className={`q ${nova.quality}`}>{nova.quality}</span>{nova.indian ? 'Indian English' : ''} · {nova.voiceCount} voices on this device</> : 'No voice selected yet'}</p></div>
          <div className="s-row wrap"><button className="s-btn primary" onClick={() => { unlockAudio(); update({ enabled: true }); previewVoice(); }}><Play size={15} />Test NOVA</button><button className="s-btn" onClick={stopNova}><Square size={13} />Silence</button></div></div>
        {nova.fallbackNote && <p className="s-policy warn">{nova.fallbackNote}</p>}
        {nova.advice && <p className="s-policy info"><AudioLines size={16} /><span>{nova.advice}</span></p>}
        <div className="s-set-grid">
          <label className="s-field"><span>Voice on</span><div className="s-seg"><button aria-pressed={prefs.enabled} onClick={() => update({ enabled: true })}>On</button><button aria-pressed={!prefs.enabled} onClick={() => { silenceNova(); update({ enabled: false }); }}>Off</button></div></label>
          <label className="s-field"><span>Narration</span><div className="s-seg"><button aria-pressed={prefs.mode === 'auto'} onClick={() => update({ mode: 'auto' })}>Automatic</button><button aria-pressed={prefs.mode === 'manual'} onClick={() => update({ mode: 'manual' })}>Manual cue only</button></div></label>
          <label className="s-field"><span>Style</span><div className="s-seg"><button aria-pressed={prefs.style === 'story'} onClick={() => update({ style: 'story' })}>Conversational</button><button aria-pressed={prefs.style === 'executive'} onClick={() => update({ style: 'executive' })}>Executive</button></div></label>
          <label className="s-field"><span>Captions</span><div className="s-seg"><button aria-pressed={prefs.captions} onClick={() => update({ captions: true })}>Show</button><button aria-pressed={!prefs.captions} onClick={() => update({ captions: false })}>Hide</button></div></label>
          <label className="s-field"><span>Preferred accent</span><select className="s-select" value={prefs.accent} onChange={e => update({ accent: e.target.value as Accent, voiceURI: '' })}>{ACCENTS.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}</select></label>
          <label className="s-field"><span>Voice</span><select className="s-select" value={prefs.voiceURI} onChange={e => update({ voiceURI: e.target.value })}><option value="">Best available for the accent</option>{voices.map((v, i) => <option key={`${v.voiceURI}-${i}`} value={v.voiceURI}>{isIndianVoice(v) ? '★ ' : ''}{v.name} · {v.lang} · {voiceQuality(v)}</option>)}</select></label>
          <label className="s-field"><span>Speed {prefs.rate.toFixed(2)}×</span><input className="s-range" type="range" min="0.8" max="1.2" step="0.01" value={prefs.rate} onChange={e => update({ rate: Number(e.target.value) })} /></label>
          <label className="s-field"><span>Pitch {prefs.pitch.toFixed(2)}</span><input className="s-range" type="range" min="0.8" max="1.2" step="0.01" value={prefs.pitch} onChange={e => update({ pitch: Number(e.target.value) })} /></label>
          <label className="s-field"><span>Voice volume {Math.round(prefs.volume * 100)}%</span><input className="s-range" type="range" min="0" max="1" step="0.05" value={prefs.volume} onChange={e => update({ volume: Number(e.target.value) })} /></label>
        </div>
        <h3 className="s-h3" style={{ margin: '22px 0 6px' }}>How NOVA says names</h3>
        <p className="s-small" style={{ marginTop: 0 }}>Type a name the way it should sound, then press play. Spellings change speech only — the screen, ledger and reports keep the correct written names. Indian voices already say these names well; the built-in respellings are used only for other voices unless you set your own here.</p>
        <div className="s-lexicon">
          {names.map(n => (
            <div key={n} className="s-lex-row">
              <span>{n}</span>
              <input className="s-input" aria-label={`How NOVA says ${n}`} value={prefs.lexicon[n] ?? ''} placeholder={n === 'NOVATECH' ? 'Nova-tech' : 'Automatic'} maxLength={120} onChange={e => update({ lexicon: { ...prefs.lexicon, [n]: e.target.value } })} />
              <button className="s-iconbtn" aria-label={`Listen to ${n}`} onClick={() => { unlockAudio(); update({ enabled: true }); say(`${n}. Does this sound right?`, { force: true }); }}><Volume2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="s-row wrap" style={{ marginTop: 10 }}><button className="s-btn ghost sm" onClick={() => update({ lexicon: { ...DEFAULT_LEXICON } })}><RotateCcw size={14} />Reset pronunciations</button></div>
        <details className="s-tableview" style={{ marginTop: 16 }}><summary>Transcript of what NOVA said ({nova.transcript.length})</summary>
          <ol className="s-transcript">{[...nova.transcript].reverse().map(l => <li key={l.id}><span className="s-num s-small">{new Date(l.at).toLocaleTimeString('en-GB')}</span> {l.text}</li>)}</ol>
        </details>
        <details className="s-tableview"><summary>Higher-fidelity cloud voice (optional, not enabled)</summary>
          <p className="s-small">A cloud voice (for example Google Neural2 or Azure “en-IN-NeerjaNeural”) would sound the same on every device. It needs a small server-side function that keeps the provider key out of the public code, and the spoken text would leave the browser. A full 8-minute show speaks about 1,600 characters (about 5,000 if NOVA reads every script), which stays inside the providers’ monthly free tiers (Google: 1 million characters for Neural2; Azure: 0.5 million). Beyond that, Google lists US$16 per million characters for Neural2. This build stays on free, on-device voices. The design is in docs/VOICE.md in the source package.</p>
        </details>
      </section>

      <div className="s-set-cols">
        <section className="s-panel" aria-labelledby="h-sound">
          <div className="s-panel-head"><div><h2 id="h-sound" className="s-h3">Sound design</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Original, synthesised live — no recordings or film effects</p></div></div>
          <div className="s-set-grid one">
            <label className="s-field"><span>Effects</span><div className="s-seg"><button aria-pressed={!settings.muted} onClick={() => { unlockAudio(); setSettings({ muted: false }); }}>On</button><button aria-pressed={settings.muted} onClick={() => setSettings({ muted: true })}>Muted</button></div></label>
            <label className="s-field"><span>Effects volume {Math.round(settings.volume * 100)}%</span><input className="s-range" type="range" min="0" max="1" step="0.05" value={settings.volume} onChange={e => setSettings({ volume: Number(e.target.value) })} /></label>
            <label className="s-field"><span>Captions for sounds</span><div className="s-seg"><button aria-pressed={settings.soundCaptions} onClick={() => setSettings({ soundCaptions: true })}>Show</button><button aria-pressed={!settings.soundCaptions} onClick={() => setSettings({ soundCaptions: false })}>Hide</button></div></label>
          </div>
          <ul className="s-cues">{CUES.map(c => <li key={c}><button className="s-btn sm" onClick={() => { unlockAudio(); window.setTimeout(() => play(c), 30); }}><Play size={13} />{CUE_EVENT[c]}</button><small>{CUE_CAPTION[c]}</small></li>)}</ul>
        </section>
        <section className="s-panel" aria-labelledby="h-display">
          <div className="s-panel-head"><h2 id="h-display" className="s-h3">Display</h2></div>
          <div className="s-set-grid one">
            <label className="s-field"><span>Theme</span><div className="s-seg"><button aria-pressed={settings.theme === 'dark'} onClick={() => setSettings({ theme: 'dark' })}>Night</button><button aria-pressed={settings.theme === 'light'} onClick={() => setSettings({ theme: 'light' })}>Daylight</button></div></label>
            <label className="s-field"><span>Projector contrast (larger text, firmer lines)</span><div className="s-seg"><button aria-pressed={settings.projector} onClick={() => setSettings({ projector: true })}>On</button><button aria-pressed={!settings.projector} onClick={() => setSettings({ projector: false })}>Off</button></div></label>
            <label className="s-field"><span>Motion</span><div className="s-seg"><button aria-pressed={settings.motion === 'system'} onClick={() => setSettings({ motion: 'system' })}>Follow system</button><button aria-pressed={settings.motion === 'reduce'} onClick={() => setSettings({ motion: 'reduce' })}>Reduced</button><button aria-pressed={settings.motion === 'full'} onClick={() => setSettings({ motion: 'full' })}>Full</button></div></label>
            <label className="s-field"><span>Persona follows the workflow</span><div className="s-seg"><button aria-pressed={settings.autoPersona} onClick={() => setSettings({ autoPersona: true })}>Automatic hand-over</button><button aria-pressed={!settings.autoPersona} onClick={() => setSettings({ autoPersona: false })}>Manual</button></div></label>
            <label className="s-field"><span>Team notification workflow</span><div className="s-seg"><button aria-pressed={settings.teamInboxMode} onClick={() => setSettings({ teamInboxMode: true, autoPersona: false })}>Team Inbox</button><button aria-pressed={!settings.teamInboxMode} onClick={() => setSettings({ teamInboxMode: false })}>Presenter handover</button></div></label>
          </div>
          <h3 className="s-h3" style={{ margin: '20px 0 8px' }}>Demo data</h3>
          <p className="s-small" style={{ marginTop: 0 }}>The incident, persona and presentation state live only in this browser.</p>
          <div className="s-row wrap"><ConfirmButton confirmLabel="Click again to reset the demo" onConfirm={() => { resetEverything(); void import('../../enterprise/demo/demoBackend.ts').then(m => m.resetDemoData()).catch(() => undefined); toast('ok', 'Demo reset: incident, presentation and workspace data. Your voice and display settings were kept.'); }}><RotateCcw size={15} />Reset demo</ConfirmButton>
            <a className="s-btn ghost" href={appUrl('/v2-demo')}>Open the V2.3 rehearsal (fallback)</a></div>
          <p className="s-small" style={{ marginBottom: 0 }}>Need help? <Link to="/guide" className="s-linkbtn">Demo guide</Link></p>
        </section>
      </div>
    </div>
  );
}
