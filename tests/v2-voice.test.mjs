import test from 'node:test';
import assert from 'node:assert/strict';
import { blankRun, SCENARIOS, STAGES, startRun } from '../src/v2/demoEngine.ts';
import { applyPronunciations, DEFAULT_VOICE_PREFERENCES, loadVoicePreferences, pickVoice, saveVoicePreferences, stageNarration, VOICE_STORAGE_KEY } from '../src/v2/voiceEngine.ts';

test('pronunciation dictionary changes only spoken names, including longest matches first', () => {
  const changed = applyPronunciations('Karan Deshmukh asked Nandini to contact Srija. Karan Deshmukh agreed.', {
    Karan: 'Kuh-run', 'Karan Deshmukh': 'Kuh-run Desh-mookh', Nandini: 'Nun-di-nee', Srija: 'Sree-jah',
  });
  assert.equal(changed, 'Kuh-run Desh-mookh asked Nun-di-nee to contact Sree-jah. Kuh-run Desh-mookh agreed.');
});

test('voice preference prioritises Indian English and respects a manually selected voice', () => {
  const voices = [
    { name: 'Daniel', lang: 'en-GB', voiceURI: 'gb' },
    { name: 'Aditi Natural', lang: 'en-IN', voiceURI: 'in' },
    { name: 'Samantha', lang: 'en-US', voiceURI: 'us' },
  ];
  assert.equal(pickVoice(voices, DEFAULT_VOICE_PREFERENCES).voiceURI, 'in');
  assert.equal(pickVoice(voices, { ...DEFAULT_VOICE_PREFERENCES, voiceURI: 'us' }).voiceURI, 'us');
  assert.equal(pickVoice(voices, { ...DEFAULT_VOICE_PREFERENCES, locale: 'mr-IN' }).voiceURI, 'in');
});

test('voice settings are validated and persisted in local storage', () => {
  const memory = new Map();
  globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v) };
  saveVoicePreferences({ ...DEFAULT_VOICE_PREFERENCES, rate: .86 });
  assert.equal(loadVoicePreferences().rate, .86);
  memory.set(VOICE_STORAGE_KEY, JSON.stringify({ rate: 300, locale: 'invalid', lexicon: { Nandini: 'Nun-dee-nee' } }));
  const safe = loadVoicePreferences();
  assert.equal(safe.rate, 1.15);
  assert.equal(safe.locale, 'en-IN');
  assert.equal(safe.lexicon.Nandini, 'Nun-dee-nee');
  delete globalThis.localStorage;
});

test('narration includes owners, contextual impact and style differences', () => {
  const run = { ...startRun(blankRun('ransomware')), step: 2 };
  const story = stageNarration(run, STAGES[2], SCENARIOS[0], 'story');
  const executive = stageNarration(run, STAGES[2], SCENARIOS[0], 'professional');
  assert.match(story, /Srija/);
  assert.match(story, /2,40,000 euros/);
  assert.match(executive, /Stage 3 of seven/);
  assert.notEqual(story, executive);
});
