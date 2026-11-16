/**
 * NOVA — NOVATECH Sentinel's co-presenter voice.
 * Uses the browser's own speechSynthesis (no paid service, no keys). Prefers natural Indian-English
 * voices (Edge "Neerja/Prabhat Online (Natural)", macOS/iOS "Isha/Veena/Rishi", Android Google India),
 * speaks sentence by sentence with captions, can be interrupted instantly, and degrades to timed
 * captions when no voice is available. Names keep their written form in the UI; only speech is respelled.
 */
import { duckSfx } from './sfx.ts';
import { TEAM } from '../data/team.ts';

export type Accent = 'en-IN' | 'en-GB' | 'en-US' | 'hi-IN' | 'mr-IN';
export type VoicePrefs = {
  enabled: boolean; mode: 'auto' | 'manual'; style: 'story' | 'executive'; accent: Accent; voiceURI: string;
  rate: number; pitch: number; volume: number; captions: boolean; lexicon: Record<string, string>;
};
export type CaptionState = { id: number; speaker: string; text: string; progress: number; source: 'voice' | 'timed' } | null;
export type TranscriptLine = { id: number; at: string; speaker: string; text: string; key?: string };
export type VoiceQuality = 'natural' | 'enhanced' | 'standard';
export type NovaState = {
  supported: boolean; speaking: boolean; paused: boolean; caption: CaptionState; transcript: TranscriptLine[];
  voiceName: string; voiceLang: string; indian: boolean; voiceCount: number; fallbackNote: string; lastLine: TranscriptLine | null;
  /** 'needs-click': the browser refused to speak until someone clicks or presses a key in this window. */
  engine: 'ready' | 'needs-click' | 'unsupported';
  quality: VoiceQuality;
  /** How to get a smoother voice on this device, when the best voice here is not a natural one. */
  advice: string;
};

export const ACCENTS: { code: Accent; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' }, { code: 'en-GB', label: 'English (UK)' }, { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'Hindi voice (India)' }, { code: 'mr-IN', label: 'Marathi voice (India)' },
];

/** Speech-only spellings the presenter can tune by ear. Applied to every voice. */
export const DEFAULT_LEXICON: Record<string, string> = {
  NOVATECH: 'Nova-tech',
  'NOVA': 'Nova',
  'Vanessa Mallet': 'Vanessa Mallet',
  'Nadia Vasseur': 'Nadia Vasseur',
  'Pierre Sauvage': 'Pierre Sauvage',
};
/** Built-in respellings for non-Indian voices only (Indian voices already say these names well). */
const NAME_RESPELL: [string, string][] = [
  ...TEAM.map(p => [p.name, p.spoken] as [string, string]),
  ...TEAM.map(p => [p.first, p.spoken.split(' ')[0]] as [string, string]),
];
const TERMS: [RegExp, string][] = [
  [/\bNT-(SEC|OPS|FIN)-0?(\d+)\b/g, 'N T $1 $2'], [/\bRSSI\b/g, 'R S S I'], [/\bCISO\b/g, 'C I S O'], [/\bCFO\b/g, 'C F O'],
  [/\bDAF\b/g, 'D A F'], [/\bCEO\b/g, 'C E O'], [/\bEDR\b/g, 'E D R'], [/\bSOC\b/g, 'sock'], [/\bKRIs?\b/g, 'K R I'],
  [/\bRACI\b/g, 'racy'], [/\bNIS2\b/g, 'NIS 2'], [/\bEBIOS\b/g, 'Ebios'], [/\bFIN-WS-07\b/g, 'finance workstation seven'],
  [/\bRTO\b/g, 'R T O'], [/\bRPO\b/g, 'R P O'], [/\bSLA(s?)\b/g, 'S L A$1'], [/\be\.g\.\s*/gi, 'for example '], [/\bvs\.?\s/gi, 'versus '],
];

const PREFS_KEY = 'novatech-sentinel-voice-v24';
const LEGACY_KEY = 'novatech-v2-voice-preferences';
export const DEFAULT_PREFS: VoicePrefs = {
  enabled: false, mode: 'auto', style: 'story', accent: 'en-IN', voiceURI: '', rate: 0.98, pitch: 1, volume: 1, captions: true,
  lexicon: { ...DEFAULT_LEXICON },
};

function safeParse(key: string): unknown { try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; } }
const clamp = (n: unknown, lo: number, hi: number, d: number) => typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;

export function loadPrefs(): VoicePrefs {
  const raw = safeParse(PREFS_KEY) as Partial<VoicePrefs> | null;
  const legacy = raw ? null : safeParse(LEGACY_KEY) as { locale?: string; voiceURI?: string; narrationStyle?: string; rate?: number; lexicon?: Record<string, string> } | null;
  const lexicon: Record<string, string> = { ...DEFAULT_LEXICON };
  const srcLex = raw?.lexicon ?? legacy?.lexicon;
  if (srcLex && typeof srcLex === 'object') for (const [k, v] of Object.entries(srcLex)) if (k.length <= 80 && typeof v === 'string' && v.length <= 120) lexicon[k] = v;
  const accent = (raw?.accent ?? legacy?.locale) as Accent;
  return {
    enabled: raw?.enabled === true,
    mode: raw?.mode === 'manual' ? 'manual' : 'auto',
    style: raw?.style === 'executive' || legacy?.narrationStyle === 'professional' ? 'executive' : 'story',
    accent: ACCENTS.some(a => a.code === accent) ? accent : 'en-IN',
    voiceURI: typeof (raw?.voiceURI ?? legacy?.voiceURI) === 'string' ? String(raw?.voiceURI ?? legacy?.voiceURI) : '',
    rate: clamp(raw?.rate ?? legacy?.rate, 0.8, 1.2, 0.98),
    pitch: clamp(raw?.pitch, 0.8, 1.2, 1),
    volume: clamp(raw?.volume, 0, 1, 1),
    captions: raw?.captions !== false,
    lexicon,
  };
}

let prefs: VoicePrefs = typeof localStorage === 'undefined' ? { ...DEFAULT_PREFS } : loadPrefs();
let voices: SpeechSynthesisVoice[] = [];
const dead = new Set<string>();
let gen = 0;
let lineSeq = 0;
let unlocked = false;
let timers: number[] = [];
let state: NovaState = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
  speaking: false, paused: false, caption: null, transcript: [], voiceName: '', voiceLang: '', indian: false, voiceCount: 0, fallbackNote: '', lastLine: null,
  engine: typeof window !== 'undefined' && 'speechSynthesis' in window ? 'ready' : 'unsupported', quality: 'standard', advice: '',
};
const subs = new Set<() => void>();
const emit = () => subs.forEach(f => f());
const set = (p: Partial<NovaState>) => { state = { ...state, ...p }; emit(); };

export const novaSubscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const novaState = () => state;
export const getPrefs = () => prefs;
export function setPrefs(next: Partial<VoicePrefs>) {
  prefs = { ...prefs, ...next };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* per-viewer convenience only */ }
  refreshVoiceInfo();
  emit();
  post({ type: 'prefs', prefs });
}

/* ---------- Several windows: the projector window speaks, the private console controls it ----------
 * Same browser only (BroadcastChannel). "Silence" and voice settings apply in every window; lines the console asks
 * for are spoken by whichever window owns the speakers. Nothing leaves the device. */
const NOVA_CHANNEL = 'novatech-nova-v24';
let novaChannel: BroadcastChannel | null = null;
try { novaChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(NOVA_CHANNEL) : null; } catch { novaChannel = null; }
function post(msg: object) { try { novaChannel?.postMessage(msg); } catch { /* ignore */ } }
let ownerCheck: () => boolean = () => true;
/** Tells NOVA how to know whether this window owns the speakers (set once by the app). */
export function setNovaOwnerCheck(fn: () => boolean) { ownerCheck = fn; }
let remoteLine: string | null = null;
/** The line another window (the projector) is speaking right now, for the console's "Saying" note. */
export const novaRemoteLine = () => remoteLine;
if (novaChannel) novaChannel.onmessage = (ev: MessageEvent) => {
  const m = ev.data as { type?: string; prefs?: Partial<VoicePrefs>; text?: string | null; opts?: Parameters<typeof say>[1] };
  if (m?.type === 'stop') stopNova();
  else if (m?.type === 'prefs' && m.prefs) { prefs = { ...prefs, ...m.prefs }; refreshVoiceInfo(); if (!prefs.enabled) stopNova(); emit(); }
  else if (m?.type === 'say' && typeof m.text === 'string' && ownerCheck()) say(m.text, m.opts ?? {});
  else if (m?.type === 'replay' && ownerCheck()) replayLast();
  else if (m?.type === 'line') { remoteLine = typeof m.text === 'string' ? m.text : null; emit(); }
};
/** Silence NOVA in every window of this browser (console Silence, M, Pause, questions, narration off). */
export function silenceNova() { stopNova(); post({ type: 'stop' }); }
/** Speak on the window that owns the speakers — the projector when one is open. */
export function sayOnSpeakers(text: string, opts: Parameters<typeof say>[1] = {}) { if (ownerCheck()) say(text, opts); else post({ type: 'say', text, opts }); }
export function replayOnSpeakers() { if (ownerCheck()) replayLast(); else post({ type: 'replay' }); }

export const isIndianVoice = (v?: { lang: string; name: string } | null) => !!v && (/-IN$/i.test(v.lang.replace('_', '-')) || /India/i.test(v.name));
const NOVELTY = /^(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|pipe organ|superstar|trinoids|whisper|wobble|zarvox|hysterical|deranged|junior|ralph|fred|kathy|princess|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley)\b/i;
const INDIAN_RANK = [/Neerja/i, /Prabhat/i, /(Aarav|Aashi|Ananya|Kavya|Kunal|Rehaan)/i, /Isha/i, /Heera/i, /Ravi/i, /Veena/i, /Rishi/i, /Google.*(India|हिन्दी)/i, /Lekha/i];
const NATURAL_RANK = [/(Ava|Emma|Jenny|Aria|Sonia|Libby|Andrew|Brian|Ryan).*(Multilingual|Natural)/i, /Natural/i, /Online/i, /^Google UK English Female/i, /^Google UK English Male/i, /^Google US English/i, /Premium|Enhanced/i, /Samantha|Serena|Karen|Moira|Tessa|Daniel/i];

/** Neural voices (Edge "Natural/Online", Chrome's network Google voices) sound human; macOS Premium/Enhanced are close. */
export function voiceQuality(v?: SpeechSynthesisVoice | null): VoiceQuality {
  if (!v) return 'standard';
  if (/Natural|Neural|Online/i.test(v.name) || (/^Google/i.test(v.name) && v.localService === false)) return 'natural';
  if (/Premium|Enhanced/i.test(v.name)) return 'enhanced';
  return 'standard';
}
export function browserName(): 'edge' | 'chrome' | 'safari' | 'firefox' | 'other' {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return /Edg\//.test(ua) ? 'edge' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other';
}

/** Smoothness first, then accent: a natural voice beats a robotic one of the right accent. */
function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  const q = voiceQuality(v);
  s += q === 'natural' ? 600 : q === 'enhanced' ? 300 : 0;
  const lang = v.lang.toLowerCase().replace('_', '-');
  const want = prefs.accent.toLowerCase();
  const wantEnglish = want.startsWith('en');
  if (lang === want) s += 200; else if (lang.split('-')[0] === want.split('-')[0]) s += 90;
  if (wantEnglish && !lang.startsWith('en')) s -= 500; // never read English text with a non-English voice
  if (want.endsWith('-in') && isIndianVoice(v)) s += 70;
  const ii = INDIAN_RANK.findIndex(r => r.test(v.name)); if (ii >= 0 && isIndianVoice(v)) s += 40 - ii;
  const ni = NATURAL_RANK.findIndex(r => r.test(v.name)); if (ni >= 0) s += 30 - ni * 3;
  if (dead.has(v.voiceURI)) s -= 2000;
  return s;
}

export function rankedVoices(): SpeechSynthesisVoice[] {
  return voices.filter(v => !NOVELTY.test(v.name)).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function pickVoice(): SpeechSynthesisVoice | null {
  if (prefs.voiceURI) { const chosen = voices.find(v => v.voiceURI === prefs.voiceURI && !dead.has(v.voiceURI)); if (chosen) return chosen; }
  return rankedVoices()[0] ?? null;
}

function refreshVoiceInfo() {
  const v = pickVoice();
  const wantIndian = prefs.accent.endsWith('-IN');
  const q = voiceQuality(v);
  const browser = browserName();
  const note = !state.supported ? 'Speech is not available in this browser. Captions still show every line.'
    : !voices.length ? 'No voices reported yet by this browser. NOVA will show captions until a voice is available.'
      : '';
  const advice = !state.supported || !voices.length || q === 'natural' ? ''
    : browser === 'edge' ? 'Edge’s natural voices (Neerja, Prabhat) need an internet connection; NOVA is using a standard voice for now.'
      : browser === 'safari' ? 'For a smoother voice: open this page in Microsoft Edge (free “Natural” voices such as Neerja), or download a Premium voice in macOS Settings → Accessibility → Spoken Content.'
        : `For the smoothest voice, open this page in Microsoft Edge — its free “Natural” voices (Neerja, Prabhat${wantIndian ? ', Indian English' : ''}) sound human.`;
  set({ voiceName: v?.name ?? '', voiceLang: v?.lang ?? '', indian: isIndianVoice(v), voiceCount: voices.length, fallbackNote: state.fallbackNote && voices.length ? state.fallbackNote : note, quality: q, advice });
}

export function initNova() {
  if (!state.supported) { refreshVoiceInfo(); return; }
  const load = () => { voices = window.speechSynthesis.getVoices(); refreshVoiceInfo(); };
  load();
  window.speechSynthesis.addEventListener?.('voiceschanged', load);
  // Some browsers populate voices late without firing the event.
  window.setTimeout(load, 600); window.setTimeout(load, 2000);
}

/** Browsers need the first speak() inside a user gesture (Chrome refuses with "not-allowed" before it). Call from
 *  click and key handlers: it unlocks speech once and replays the line that was refused, if it is still current. */
let needsGesture = false;
let refused: { line: TranscriptLine; at: number } | null = null;
export function unlockNova() {
  if (!state.supported) return;
  if (!unlocked) {
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch { /* ignore */ }
  }
  if (needsGesture) {
    needsGesture = false;
    set({ engine: 'ready', fallbackNote: '' });
    const r = refused; refused = null;
    if (r && Date.now() - r.at < 20_000 && state.lastLine?.id === r.line.id) window.setTimeout(() => say(r.line.text, { key: r.line.key, speaker: r.line.speaker, force: true }), 250);
  }
}

/** Speech-only transformation: lexicon (always), acronyms (always), name respellings (non-Indian voices only). */
export function speechText(text: string, voice: SpeechSynthesisVoice | null = pickVoice()): string {
  let s = text;
  const lex = Object.entries(prefs.lexicon).filter(([k, v]) => k.trim() && v.trim()).sort((a, b) => b[0].length - a[0].length);
  for (const [k, v] of lex) s = s.replace(new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), v.trim());
  if (!isIndianVoice(voice) && !/^(hi|mr)/.test(prefs.accent)) {
    for (const [n, say] of [...NAME_RESPELL].sort((a, b) => b[0].length - a[0].length)) {
      if (prefs.lexicon[n]) continue;
      s = s.replace(new RegExp(`\\b${n}\\b`, 'g'), say);
    }
  }
  for (const [re, to] of TERMS) s = s.replace(re, to);
  return s;
}

export const splitSentences = (t: string) => (t.replace(/\s+/g, ' ').match(/(?:[^.!?…]|\.(?=\d))+[.!?…]*["”’)]?\s*/g) ?? [t]).map(x => x.trim()).filter(Boolean);
const wordsPerSecond = () => 2.5 * prefs.rate;
const lineSeconds = (l: string) => Math.max(1.4, l.split(/\s+/).length / wordsPerSecond()) + 0.25;

function clearTimers() { timers.forEach(t => window.clearTimeout(t)); timers = []; }

/** Stop speaking immediately (presenter "silence" button). */
export function stopNova() {
  gen++; clearTimers();
  if (state.supported) { try { window.speechSynthesis.cancel(); } catch { /* ignore */ } }
  duckSfx(false);
  if (state.speaking || state.caption) post({ type: 'line', text: null });
  set({ speaking: false, paused: false, caption: null });
}

export function pauseNova() {
  if (!state.supported || !state.speaking) return;
  try { window.speechSynthesis.pause(); } catch { /* ignore */ }
  set({ paused: true });
}
export function resumeNova() {
  if (!state.supported) return;
  try { window.speechSynthesis.resume(); } catch { /* ignore */ }
  set({ paused: false });
}

/** A short breath between sentences: speech sounds less mechanical than one long utterance. */
const SENTENCE_GAP_MS = 140;

function utterance(sentence: string, voice: SpeechSynthesisVoice | null): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(speechText(sentence, voice));
  if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = prefs.accent;
  const natural = voiceQuality(voice) === 'natural';
  // Natural voices sound best near their own pace and pitch; standard voices get a slightly calmer pace.
  const base = (prefs.style === 'story' ? 0.99 : 1.04) * (natural ? 1 : 0.97);
  u.rate = Math.min(1.25, Math.max(0.7, prefs.rate * base));
  u.pitch = Math.min(1.3, Math.max(0.7, prefs.pitch * (!natural && /\?["”’]?$/.test(sentence) ? 1.04 : 1)));
  u.volume = prefs.volume;
  return u;
}

/**
 * Say a line. By default the newest line interrupts the previous one, so narration always matches
 * the current screen. `key` prevents the same automatic line from being spoken twice in a row.
 * Sentences are spoken one at a time: a sentence that never starts is retried once, one that stalls is skipped,
 * and if the browser refuses (no click yet in this window) captions carry the line and it replays on the first click.
 */
export function say(text: string, opts: { key?: string; speaker?: string; force?: boolean; captionOnly?: boolean } = {}) {
  const clean = text.trim();
  if (!clean) return;
  if (opts.key && !opts.force && state.lastLine?.key === opts.key) return;
  const line: TranscriptLine = { id: ++lineSeq, at: new Date().toISOString(), speaker: opts.speaker ?? 'NOVA', text: clean, key: opts.key };
  set({ transcript: [...state.transcript.slice(-79), line], lastLine: line });
  const busy = state.supported && (() => { try { return window.speechSynthesis.speaking || window.speechSynthesis.pending; } catch { return false; } })();
  stopNova();
  post({ type: 'line', text: clean });
  const id = gen;
  const sentences = splitSentences(clean);
  // Timed captions run under their own generation: the speech fallbacks bump `gen` to silence the voice first,
  // so the captions must check the generation they were started with, not the line's original one.
  const timed = (from: number, run: number = id) => {
    let delay = 0;
    sentences.slice(from).forEach((sentence, j) => {
      const k = from + j;
      timers.push(window.setTimeout(() => {
        if (run !== gen) return;
        set({ caption: { id: k, speaker: line.speaker, text: sentence, progress: 0, source: 'timed' } });
        const words = sentence.split(/\s+/); let pos = 0;
        words.forEach((w, wi) => { const at = (lineSeconds(sentence) * 1000 * wi) / words.length; const p = pos; timers.push(window.setTimeout(() => { if (run === gen && state.caption?.id === k) set({ caption: { ...state.caption, progress: p + w.length } }); }, at)); pos += w.length + 1; });
      }, delay));
      delay += lineSeconds(sentence) * 1000;
    });
    timers.push(window.setTimeout(() => { if (run === gen) { set({ caption: null, speaking: false }); post({ type: 'line', text: null }); } }, delay + 400));
  };
  if (opts.captionOnly || !prefs.enabled || !state.supported) { timed(0); return; }
  if (needsGesture) { refused = { line, at: Date.now() }; timed(0); return; }
  /** Give up on the voice for the rest of this line and let captions carry it. */
  const fallback = (k: number, note?: string) => {
    gen++; const run = gen; clearTimers();
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    duckSfx(false); set({ speaking: false, ...(note ? { fallbackNote: note } : {}) });
    timed(k, run);
  };
  const finish = () => {
    duckSfx(false);
    set({ speaking: false, caption: state.caption ? { ...state.caption, progress: state.caption.text.length } : null });
    timers.push(window.setTimeout(() => { if (id === gen) { set({ caption: null }); post({ type: 'line', text: null }); } }, 900));
  };
  const begin = () => {
    if (id !== gen) return;
    const voice = pickVoice();
    set({ speaking: true });
    duckSfx(true);
    const speakSentence = (k: number, attempt: number) => {
      if (id !== gen) return;
      if (k >= sentences.length) { finish(); return; }
      const sentence = sentences[k];
      const u = utterance(sentence, voice);
      let startedThis = false, done = false, bounded = false;
      // A sentence that never starts is retried once; then captions take over (blocked or unavailable voice).
      timers.push(window.setTimeout(() => {
        if (id !== gen || startedThis || done) return;
        done = true;
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
        if (attempt === 0) { timers.push(window.setTimeout(() => speakSentence(k, 1), 160)); return; }
        fallback(k, 'The voice did not start (blocked or unavailable). Showing captions instead — click the projector once, then press Replay.');
      }, k === 0 ? (voiceQuality(voice) === 'natural' ? 4500 : 3000) : 2500));
      u.onstart = () => {
        if (id !== gen || done) return;
        startedThis = true;
        set({ caption: { id: k, speaker: line.speaker, text: sentence, progress: 0, source: 'voice' }, speaking: true, engine: 'ready' });
        // A stalled engine (Chrome sometimes never fires "end"): move on to the next sentence.
        const expected = (lineSeconds(sentence) * 1000) / Math.max(0.7, u.rate);
        timers.push(window.setTimeout(() => { if (id !== gen || done) return; done = true; try { window.speechSynthesis.cancel(); } catch { /* ignore */ } timers.push(window.setTimeout(() => speakSentence(k + 1, 0), 160)); }, expected + 6000));
        // If the engine never reports word boundaries, advance the highlight on a timer.
        timers.push(window.setTimeout(() => {
          if (bounded || id !== gen) return;
          const words = sentence.split(/\s+/); let pos = 0;
          words.forEach((w, wi) => { const p = pos; timers.push(window.setTimeout(() => { if (id === gen && state.caption?.id === k && !bounded) set({ caption: { ...state.caption!, progress: p + w.length } }); }, (expected * 0.92 * wi) / words.length)); pos += w.length + 1; });
        }, 300));
      };
      u.onboundary = (e: SpeechSynthesisEvent) => {
        if (id !== gen || state.caption?.id !== k) return;
        bounded = true;
        // charIndex refers to the spoken (respelled) text; map proportionally onto the written sentence.
        const spoken = u.text.length || 1;
        set({ caption: { ...state.caption, progress: Math.round((e.charIndex / spoken) * sentence.length) + 1 } });
      };
      u.onend = () => {
        if (id !== gen || done) return;
        done = true;
        timers.push(window.setTimeout(() => speakSentence(k + 1, 0), k === sentences.length - 1 ? 0 : SENTENCE_GAP_MS));
      };
      u.onerror = (e: SpeechSynthesisErrorEvent) => {
        if (id !== gen || done || /interrupted|canceled/.test(e.error ?? '')) return;
        done = true;
        if (e.error === 'not-allowed') {
          // No click in this window yet: captions now, the line replays on the first click or key press.
          needsGesture = true; refused = { line, at: Date.now() };
          set({ engine: 'needs-click' });
          fallback(k, 'This window has not been clicked yet, so the browser blocks the voice. Captions are showing; the line replays on the first click.');
          return;
        }
        if (voice && /network|synthesis-unavailable|voice-unavailable|language-unavailable|synthesis-failed|audio-hardware/.test(e.error ?? '')) { dead.add(voice.voiceURI); refreshVoiceInfo(); }
        fallback(k, `The voice failed (${e.error}). Showing captions; the next line uses another voice if one is available.`);
      };
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        window.speechSynthesis.speak(u);
      } catch { done = true; fallback(k); }
    };
    speakSentence(0, 0);
  };
  // Chrome can drop a speak() issued in the same tick as cancel(); voices may also still be loading.
  const wait = !voices.length ? 700 : busy ? 140 : 0;
  if (!voices.length) { try { voices = window.speechSynthesis.getVoices(); } catch { /* ignore */ } }
  if (wait) timers.push(window.setTimeout(() => { if (!voices.length) { try { voices = window.speechSynthesis.getVoices(); refreshVoiceInfo(); } catch { /* ignore */ } } begin(); }, wait));
  else begin();
}

export function replayLast() { if (state.lastLine) say(state.lastLine.text, { key: state.lastLine.key, speaker: state.lastLine.speaker, force: true }); }
export function previewVoice(sample?: string) { say(sample ?? 'Hello, I am NOVA. Karan Deshmukh, Victor Bonnet, Vanessa Mallet, Nadia Vasseur, Sarah Perrin and Pierre Sauvage are ready.', { force: true }); }
export function clearTranscript() { set({ transcript: [] }); }
