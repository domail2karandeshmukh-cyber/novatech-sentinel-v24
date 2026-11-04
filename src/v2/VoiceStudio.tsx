import { useEffect } from 'react';
import { AudioLines, Check, CircleHelp, Headphones, Mic2, Play, RotateCcw, Settings2, SlidersHorizontal, Sparkles, Volume2, X } from 'lucide-react';
import {
  DEFAULT_LEXICON, LANGUAGES, pickVoice,
} from './voiceEngine';
import type { VoicePreferences } from './voiceEngine';
import './voice.css';

export function VoiceStudio({ open, onClose, preferences, onChange, voices, onTest, onTestName, supported }: {
  open: boolean;
  onClose: () => void;
  preferences: VoicePreferences;
  onChange: (next: VoicePreferences) => void;
  voices: SpeechSynthesisVoice[];
  onTest: () => void;
  onTestName: (name: string) => void;
  supported: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  const selected = pickVoice(voices, preferences);
  const exactIndian = voices.some(v => v.lang.toLowerCase().replace('_', '-') === 'en-in');
  const voiceOptions = [...voices].sort((a, b) => {
    const rank = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith('en-in') ? 0 : v.lang.toLowerCase().startsWith('en') ? 1 : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  return <div className="v2-voice-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="v2-voice-dialog" role="dialog" aria-modal="true" aria-label="NOVA voice studio">
      <div className="v2-voice-header"><div className="v2-voice-header-icon"><AudioLines size={22}/></div><div><span>NOVATECH / PRESENTER TOOLS</span><h2>NOVA Voice Studio</h2><p>Give the command centre a more human voice.</p></div><button className="v2-voice-close" onClick={onClose} aria-label="Close voice settings"><X size={19}/></button></div>

      <div className="v2-voice-scroller">
        <div className="v2-voice-current"><div className="v2-voice-wave" aria-hidden="true">{[11,20,30,15,26,38,21,13,28,18,34,20,12,26,16].map((height, i) => <i key={i} style={{ height }} />)}</div><div><b>{selected?.name ?? 'System default voice'}</b><span>{selected?.lang ?? 'Voice chosen by your browser'} · {voices.length} installed voices detected</span></div><button onClick={onTest}><Play size={14} fill="currentColor"/> Test voice</button></div>

        <section className="v2-voice-group"><div className="v2-voice-section-title"><Headphones size={16}/><b>Voice and language</b></div><div className="v2-voice-two">
          <label>Preferred language / accent<select value={preferences.locale} onChange={e => onChange({ ...preferences, locale: e.target.value as VoicePreferences['locale'], voiceURI: '' })}>{LANGUAGES.map(l => <option value={l.code} key={l.code}>{l.label}</option>)}</select></label>
          <label>Installed voice<select value={preferences.voiceURI} disabled={voiceOptions.length === 0} onChange={e => onChange({ ...preferences, voiceURI: e.target.value })}><option value="">Automatic · prefer selected accent</option>{voiceOptions.map((v,i)=><option key={`${v.voiceURI}-${i}`} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label>
        </div>{preferences.locale === 'en-IN' && !exactIndian && <p className="v2-voice-tip"><CircleHelp size={15}/> No Indian English voice was detected. NOVA will use the closest installed English voice; the pronunciation dictionary below can still help.</p>}</section>

        <section className="v2-voice-group"><div className="v2-voice-section-title"><Sparkles size={16}/><b>Narration personality</b></div><div className="v2-voice-styles"><button className={preferences.narrationStyle === 'story' ? 'selected' : ''} onClick={() => onChange({ ...preferences, narrationStyle: 'story' })}><span>✦</span><b>Story mode</b><small>Warm, conversational and engaging for a live audience</small>{preferences.narrationStyle === 'story' && <Check size={16}/>}</button><button className={preferences.narrationStyle === 'professional' ? 'selected' : ''} onClick={() => onChange({ ...preferences, narrationStyle: 'professional' })}><span>▣</span><b>Executive mode</b><small>Brief, focused and formal for decision-making</small>{preferences.narrationStyle === 'professional' && <Check size={16}/>}</button></div>
          <div className="v2-voice-rate"><label htmlFor="v2-voice-speed"><SlidersHorizontal size={15}/> Speaking speed</label><input id="v2-voice-speed" type="range" min="0.8" max="1.15" step="0.01" value={preferences.rate} onChange={e => onChange({ ...preferences, rate: Number(e.target.value) })}/><b>{preferences.rate.toFixed(2)}×</b></div>
        </section>

        <section className="v2-voice-group"><div className="v2-voice-section-title"><Mic2 size={16}/><b>Pronounce Indian names naturally</b><button className="v2-voice-reset" onClick={() => onChange({ ...preferences, lexicon: { ...DEFAULT_LEXICON } })}><RotateCcw size={13}/> Reset</button></div><p className="v2-voice-description">Write each name the way you want it to sound. These spellings affect speech only; names in the interface and evidence remain unchanged.</p><div className="v2-lexicon-list">{Object.entries(preferences.lexicon).map(([name, soundsLike]) => <div className="v2-lexicon-row" key={name}><span>{name}</span><input aria-label={`How NOVA says ${name}`} value={soundsLike} maxLength={120} onChange={e => onChange({ ...preferences, lexicon: { ...preferences.lexicon, [name]: e.target.value } })}/><button aria-label={`Listen to ${name}`} title={`Test ${name}`} onClick={() => onTestName(name)}><Volume2 size={16}/></button></div>)}</div></section>
      </div>

      <div className="v2-voice-footer"><span><Settings2 size={14}/>{supported ? 'Saved automatically in this browser' : 'Speech output is not supported in this browser'}</span><button onClick={onClose}>Done <Check size={15}/></button></div>
    </div>
  </div>;
}
