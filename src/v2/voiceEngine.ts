import type { DemoRun, Scenario, Stage } from './demoEngine';

export type NarrationStyle = 'story' | 'professional';
export type VoiceLocale = 'en-IN' | 'en-GB' | 'en-US' | 'hi-IN' | 'mr-IN';

export type VoicePreferences = {
  locale: VoiceLocale;
  voiceURI: string;
  narrationStyle: NarrationStyle;
  rate: number;
  lexicon: Record<string, string>;
};

export const VOICE_STORAGE_KEY = 'novatech-v2-voice-preferences';
export const LANGUAGES: { code: VoiceLocale; label: string }[] = [
  { code: 'en-IN', label: 'English (India)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'hi-IN', label: 'Hindi (India)' },
  { code: 'mr-IN', label: 'Marathi (India)' },
];

export const DEFAULT_LEXICON: Record<string, string> = {
  'Karan Deshmukh': 'Kuh-run Desh-mookh',
  Nandini: 'Nun-di-nee',
  Srija: 'Sree-jah',
  Vijay: 'Vee-jay',
  Pavan: 'Puh-vun',
  NOVATECH: 'Nova-tech',
};

export const DEFAULT_VOICE_PREFERENCES: VoicePreferences = {
  locale: 'en-IN', voiceURI: '', narrationStyle: 'story', rate: 0.94,
  lexicon: { ...DEFAULT_LEXICON },
};

export function loadVoicePreferences(): VoicePreferences {
  try {
    const stored = JSON.parse(localStorage.getItem(VOICE_STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_VOICE_PREFERENCES, lexicon: { ...DEFAULT_LEXICON } };
    const lexicon: Record<string, string> = { ...DEFAULT_LEXICON };
    if (stored.lexicon && typeof stored.lexicon === 'object') {
      for (const [name, spoken] of Object.entries(stored.lexicon)) {
        if (name.length <= 80 && typeof spoken === 'string' && spoken.length <= 120) lexicon[name] = spoken;
      }
    }
    return {
      locale: LANGUAGES.some(l => l.code === stored.locale) ? stored.locale : 'en-IN',
      voiceURI: typeof stored.voiceURI === 'string' ? stored.voiceURI : '',
      narrationStyle: stored.narrationStyle === 'professional' ? 'professional' : 'story',
      rate: typeof stored.rate === 'number' && Number.isFinite(stored.rate) ? Math.min(1.15, Math.max(0.8, stored.rate)) : 0.94,
      lexicon,
    };
  } catch { return { ...DEFAULT_VOICE_PREFERENCES, lexicon: { ...DEFAULT_LEXICON } }; }
}

export function saveVoicePreferences(preferences: VoicePreferences) {
  try { localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(preferences)); } catch { /* Session-only fallback */ }
}

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Only pronunciation text changes; the visible actor's name and the audit record stay correct. */
export function applyPronunciations(text: string, lexicon: Record<string, string>) {
  return Object.entries(lexicon)
    .filter(([name, pronunciation]) => name.trim() && pronunciation.trim())
    .sort(([a], [b]) => b.length - a.length)
    .reduce((spoken, [name, pronunciation]) => spoken.replace(new RegExp(`\\b${escapeRegex(name)}\\b`, 'gi'), () => pronunciation.trim()), text);
}

export type BrowserVoice = { name: string; lang: string; voiceURI: string; localService?: boolean };

/** Prefer the selected voice, then the exact regional accent, then another English voice. */
export function pickVoice<T extends BrowserVoice>(voices: T[], preferences: VoicePreferences): T | null {
  if (preferences.voiceURI) {
    const selected = voices.find(v => v.voiceURI === preferences.voiceURI);
    if (selected) return selected;
  }
  const sameLocale = voices.filter(v => v.lang.toLowerCase().replace('_', '-') === preferences.locale.toLowerCase());
  const natural = (v: T) => /enhanced|premium|natural|neural|google|siri/i.test(v.name);
  if (sameLocale.length) return sameLocale.find(natural) ?? sameLocale[0];
  const language = preferences.locale.split('-')[0];
  const sameLanguage = voices.filter(v => v.lang.toLowerCase().startsWith(language));
  if (sameLanguage.length) return sameLanguage.find(natural) ?? sameLanguage[0];
  const english = voices.filter(v => v.lang.toLowerCase().startsWith('en'));
  return english.find(natural) ?? english[0] ?? voices[0] ?? null;
}

export function stageNarration(run: DemoRun, stage: Stage | null, scenario: Scenario, style: NarrationStyle): string {
  if (run.status === 'closed') return style === 'story'
    ? 'That is a wrap. Every decision gate is complete, from the first alert to independent verification. The incident is now closed. Nice work, team.'
    : 'Incident closed. Seven decision stages completed. Evidence is ready for export.';
  if (run.status !== 'active' || !stage) return 'Command centre ready. Choose a scenario to begin the exercise.';
  if (style === 'professional') return `Stage ${run.step + 1} of seven. ${stage.name}. ${stage.person} is the assigned owner. ${stage.prompt}`;
  const conversational: Record<Stage['key'], string> = {
    detect: `Heads up, team. We've detected a ${scenario.name.toLowerCase()} signal. Karan Deshmukh, let's acknowledge it and get the right people involved.`,
    assess: `Nandini, over to you. Let's understand what is happening technically, what is affected, and which containment action is safe to propose.`,
    finance: `Srija, your view matters here. We need to translate the incident into a business decision. The modelled exposure is ${scenario.exposure.toLocaleString('en-IN')} euros.`,
    authorise: `We have both assessments. Director, it's your call. Please review the reasoning before approving anything disruptive. You can also send it back for revision.`,
    contain: `Approval is recorded. IT Operations, you're up. The next step is a safe simulation of the approved response. No real device is switched off.`,
    verify: `Good progress. Now an independent reviewer checks the evidence. Execution and verification stay separate, because trust needs proof.`,
    close: `Karan Deshmukh, we're at the final gate. Check the remaining risk, document the result, and close the rehearsal when you're satisfied.`,
  };
  return conversational[stage.key];
}
