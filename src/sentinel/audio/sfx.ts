/**
 * NOVATECH Sentinel sound design — every cue is synthesised live with the Web Audio API.
 * No samples, no recordings, nothing borrowed from films: all original.
 * Audio starts only after a user gesture, never loops, and ducks while NOVA speaks.
 */
export type Cue =
  | 'start' | 'critical' | 'acknowledge' | 'approvalRequested' | 'approvalGranted' | 'approvalReturned'
  | 'actionStarted' | 'verified' | 'closed' | 'remoteRequest' | 'consentPending' | 'cancelled'
  | 'tick' | 'scene' | 'select' | 'warning' | 'powerOff' | 'klaxon';

export const CUE_CAPTION: Record<Cue, string> = {
  start: 'Soft rising chime',
  critical: 'Critical alert tone — low pulse',
  warning: 'High-severity alert — two firm tones',
  acknowledge: 'Confirmation click',
  approvalRequested: 'Two-note request tone',
  approvalGranted: 'Rising approval cadence',
  approvalReturned: 'Descending return tone',
  actionStarted: 'Low engage pulse',
  verified: 'Assurance bell',
  closed: 'Closing chord',
  remoteRequest: 'Remote request tone',
  consentPending: 'Waiting pulse',
  cancelled: 'Neutral cancel tone',
  tick: 'Timer tick',
  scene: 'Scene transition',
  select: 'Selection tick',
  powerOff: 'Power-down sweep',
  klaxon: 'Alarm — two-tone klaxon',
};

type Engine = { ctx: AudioContext; master: GainNode; duck: GainNode; verb: ConvolverNode; verbIn: GainNode; noise: AudioBuffer };
let engine: Engine | null = null;
let volume = 0.6;
let muted = false;
let lastPlayed: Partial<Record<Cue, number>> = {};
const listeners = new Set<(cue: Cue) => void>();

export function onCue(fn: (cue: Cue) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setSfxVolume(v: number) { volume = Math.max(0, Math.min(1, v)); if (engine) engine.master.gain.setTargetAtTime(muted ? 0 : volume * 0.9, engine.ctx.currentTime, 0.05); }
export function setSfxMuted(m: boolean) { muted = m; setSfxVolume(volume); }
export const sfxReady = () => !!engine && engine.ctx.state === 'running';

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

/** Create or resume the audio graph. Call from a click/keydown handler (browser autoplay rules). */
export function unlockAudio(): boolean {
  try {
    const AC: typeof AudioContext | undefined = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    if (!engine) {
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
      const master = ctx.createGain(); master.gain.value = muted ? 0 : volume * 0.9;
      const duck = ctx.createGain(); duck.gain.value = 1;
      const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 2.6, 3.2);
      const verbIn = ctx.createGain(); verbIn.gain.value = 0.35;
      const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      verbIn.connect(verb); verb.connect(duck); duck.connect(master); master.connect(comp); comp.connect(ctx.destination);
      engine = { ctx, master, duck, verb, verbIn, noise };
    }
    if (engine.ctx.state === 'suspended') void engine.ctx.resume();
    return true;
  } catch { return false; }
}

/** Lower effects while NOVA speaks so speech stays intelligible. */
export function duckSfx(on: boolean) {
  if (!engine) return;
  engine.duck.gain.setTargetAtTime(on ? 0.35 : 1, engine.ctx.currentTime, on ? 0.04 : 0.3);
}

function out(e: Engine, wet = 0.35) {
  const g = e.ctx.createGain();
  g.connect(e.duck);
  if (wet > 0) { const send = e.ctx.createGain(); send.gain.value = wet; g.connect(send); send.connect(e.verbIn); }
  return g;
}

function tone(e: Engine, t: number, freq: number, dur: number, peak: number, opts: { type?: OscillatorType; attack?: number; glideTo?: number; wet?: number; filter?: number; detune?: number } = {}) {
  const o = e.ctx.createOscillator();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.detune) o.detune.value = opts.detune;
  if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur);
  const g = e.ctx.createGain();
  const a = opts.attack ?? 0.012;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = o;
  if (opts.filter) { const f = e.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; f.Q.value = 0.7; o.connect(f); node = f; }
  node.connect(g); g.connect(out(e, opts.wet ?? 0.35));
  o.start(t); o.stop(t + dur + 0.05);
}

function bell(e: Engine, t: number, freq: number, dur: number, peak: number, ratio = 3.5) {
  // Two-operator FM bell: a quiet modulator gives a glassy, assured partial.
  const car = e.ctx.createOscillator(), mod = e.ctx.createOscillator(), mg = e.ctx.createGain(), g = e.ctx.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * 1.2, t); mg.gain.exponentialRampToValueAtTime(freq * 0.02, t + dur);
  mod.connect(mg); mg.connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g); g.connect(out(e, 0.55));
  car.start(t); mod.start(t); car.stop(t + dur + 0.05); mod.stop(t + dur + 0.05);
}

function noiseSweep(e: Engine, t: number, dur: number, from: number, to: number, peak: number, q = 1.2) {
  const src = e.ctx.createBufferSource(); src.buffer = e.noise;
  const f = e.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(out(e, 0.25));
  src.start(t); src.stop(t + dur + 0.05);
}

const SCORE: Record<Cue, (e: Engine, t: number) => void> = {
  start: (e, t) => { [1318.5, 1568, 1975.5, 2637].forEach((f, i) => tone(e, t + i * 0.075, f, 1.1 - i * 0.12, 0.05, { wet: 0.7 })); tone(e, t + 0.34, 659.3, 1.6, 0.045, { wet: 0.6 }); },
  critical: (e, t) => {
    // Filtered sub-bass drop, then two restrained, slightly dissonant pulses. No siren, no loop.
    tone(e, t, 58, 1.7, 0.42, { glideTo: 44, attack: 0.03, wet: 0.2 });
    tone(e, t, 116, 1.2, 0.08, { glideTo: 88, attack: 0.03, wet: 0.2, filter: 400 });
    for (const p of [0.38, 0.9]) {
      tone(e, t + p, 311.1, 0.42, 0.11, { type: 'sawtooth', filter: 1400, wet: 0.45 });
      tone(e, t + p, 329.6, 0.42, 0.09, { type: 'sawtooth', filter: 1200, wet: 0.45 });
    }
    noiseSweep(e, t + 0.05, 1.3, 220, 1600, 0.035, 0.8);
  },
  warning: (e, t) => {
    // High severity: firm but lighter than the critical drop — two mid tones, no sub-bass.
    for (const p of [0, 0.34]) { tone(e, t + p, 392, 0.36, 0.1, { type: 'triangle', filter: 1800, wet: 0.4 }); tone(e, t + p, 587.3, 0.3, 0.045, { wet: 0.4 }); }
    noiseSweep(e, t, 0.6, 400, 1500, 0.02, 0.9);
  },
  acknowledge: (e, t) => { noiseSweep(e, t, 0.06, 1800, 2400, 0.08, 6); tone(e, t, 880, 0.09, 0.07, { wet: 0.1 }); },
  approvalRequested: (e, t) => { tone(e, t, 659.3, 0.42, 0.07, { type: 'triangle', wet: 0.5 }); tone(e, t + 0.2, 880, 0.6, 0.06, { type: 'triangle', wet: 0.5 }); },
  approvalGranted: (e, t) => { bell(e, t, 440, 0.9, 0.09, 2); bell(e, t + 0.16, 659.3, 1.5, 0.1, 2); },
  approvalReturned: (e, t) => { tone(e, t, 523.3, 0.5, 0.07, { filter: 1500, wet: 0.4 }); tone(e, t + 0.22, 415.3, 0.9, 0.065, { filter: 1200, wet: 0.45 }); },
  actionStarted: (e, t) => { tone(e, t, 196, 0.7, 0.14, { type: 'triangle', filter: 900, wet: 0.3 }); noiseSweep(e, t, 0.5, 300, 1200, 0.03); },
  verified: (e, t) => { bell(e, t, 1046.5, 2.2, 0.08, 3.5); bell(e, t + 0.11, 1568, 1.8, 0.04, 3.5); },
  closed: (e, t) => {
    // Layered uplift — a warm open chord, no fanfare.
    [261.6, 392, 587.3, 659.3].forEach((f, i) => tone(e, t + i * 0.06, f, 2.8, 0.045, { attack: 0.45, wet: 0.7, type: i % 2 ? 'sine' : 'triangle', filter: 2400 }));
    bell(e, t + 0.5, 1318.5, 2.4, 0.03, 3.5);
  },
  remoteRequest: (e, t) => { for (const [d, f] of [[0, 987.8], [0.24, 1318.5]] as const) tone(e, t + d, f, 0.5, 0.06, { wet: 0.5 }); },
  consentPending: (e, t) => { [0, 0.42, 0.84].forEach(d => tone(e, t + d, 98, 0.32, 0.18, { attack: 0.02, filter: 300, wet: 0.15 })); },
  cancelled: (e, t) => { tone(e, t, 392, 0.55, 0.06, { wet: 0.4 }); },
  tick: (e, t) => { noiseSweep(e, t, 0.04, 2600, 3200, 0.05, 8); },
  scene: (e, t) => { noiseSweep(e, t, 0.7, 380, 2800, 0.028, 0.9); },
  select: (e, t) => { tone(e, t, 1200, 0.05, 0.03, { wet: 0 }); },
  powerOff: (e, t) => {
    // A monitor switching off: a falling whine, a soft low thump, then air.
    tone(e, t, 1800, 0.9, 0.05, { glideTo: 90, wet: 0.25, filter: 3000 });
    tone(e, t + 0.05, 220, 1.4, 0.16, { glideTo: 38, type: 'triangle', filter: 600, wet: 0.2 });
    tone(e, t + 0.55, 60, 0.9, 0.3, { glideTo: 34, attack: 0.01, wet: 0.35 });
    noiseSweep(e, t + 0.5, 1.4, 900, 120, 0.03, 0.7);
  },
  klaxon: (e, t) => {
    // Original two-tone alarm (no samples): three firm cycles, filtered so it never shrieks.
    for (let i = 0; i < 3; i++) {
      const p = t + i * 0.62;
      tone(e, p, 523.3, 0.3, 0.12, { type: 'sawtooth', filter: 2200, wet: 0.3, attack: 0.015 });
      tone(e, p, 261.6, 0.3, 0.06, { type: 'square', filter: 900, wet: 0.2, attack: 0.015 });
      tone(e, p + 0.31, 392, 0.3, 0.12, { type: 'sawtooth', filter: 2000, wet: 0.3, attack: 0.015 });
      tone(e, p + 0.31, 196, 0.3, 0.06, { type: 'square', filter: 800, wet: 0.2, attack: 0.015 });
    }
  },
};

/** Play a cue. Repeats of the same cue within 700 ms are ignored (no stacking on re-renders). */
export function play(cue: Cue) {
  const now = Date.now();
  if ((lastPlayed[cue] ?? 0) > now - 700) return;
  lastPlayed[cue] = now;
  listeners.forEach(l => l(cue));
  if (muted || volume <= 0 || !engine) return;
  const e = engine;
  const fire = () => { try { SCORE[cue](e, e.ctx.currentTime + 0.02); } catch { /* audio is best-effort */ } };
  if (e.ctx.state === 'running') { fire(); return; }
  // A context the browser suspended after it was unlocked (sleep, device change, Safari "interrupted") resumes
  // without a new click once this window has had one; the cue plays as soon as it is running again.
  try { void e.ctx.resume().then(() => { if (e.ctx.state === 'running' && Date.now() - now < 1500) fire(); }).catch(() => undefined); } catch { /* ignore */ }
}

export function resetCueMemory() { lastPlayed = {}; }
