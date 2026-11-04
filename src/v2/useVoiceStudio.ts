import { useCallback, useEffect, useState } from 'react';
import { applyPronunciations, loadVoicePreferences, pickVoice, saveVoicePreferences } from './voiceEngine';
import type { VoicePreferences } from './voiceEngine';

export function useVoiceStudio() {
  const [preferences, setPreferences] = useState<VoicePreferences>(loadVoicePreferences);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => saveVoicePreferences(preferences), [preferences]);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const refresh = () => setVoices(window.speechSynthesis.getVoices());
    refresh();
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh);
    return () => { window.speechSynthesis.removeEventListener?.('voiceschanged', refresh); window.speechSynthesis.cancel(); };
  }, []);

  const speak = useCallback((message: string) => {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
    window.speechSynthesis.cancel();
    const voice = pickVoice(voices, preferences);
    const utterance = new SpeechSynthesisUtterance(applyPronunciations(message, preferences.lexicon));
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? preferences.locale;
    utterance.rate = preferences.rate * (preferences.narrationStyle === 'story' ? 0.98 : 1.03);
    utterance.pitch = preferences.narrationStyle === 'story' ? 1.04 : 0.98;
    utterance.volume = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    return true;
  }, [preferences, voices]);

  const stop = useCallback(() => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); setSpeaking(false); }, []);
  return { preferences, setPreferences, voices, speak, stop, speaking, supported: typeof window !== 'undefined' && 'speechSynthesis' in window };
}
