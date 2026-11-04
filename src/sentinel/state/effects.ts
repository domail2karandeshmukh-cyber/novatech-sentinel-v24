import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getState, isAudioOwner, onSoundCheck, setSoundProbe, setWindowRole, subscribe, subscribePeers, useStore } from './store';
import type { WindowRole } from './store';
import { play, setSfxMuted, setSfxVolume, sfxReady, unlockAudio } from '../audio/sfx';
import type { Cue } from '../audio/sfx';
import { getPrefs, initNova, novaState, say, setNovaOwnerCheck, stopNova, unlockNova } from '../audio/nova';
import { lineForEvent } from '../audio/lines';
import { scenarioOf } from '../engine/incident';
import type { LedgerKind } from '../engine/incident';
import { HASH_ROUTING } from '../env';
import { useMacSimEffects } from './macsim';

const CUE_BY_KIND: Partial<Record<LedgerKind, Cue>> = {
  signal: 'critical', ownership: 'acknowledge', assessment: 'acknowledge', impact: 'acknowledge', approval_requested: 'approvalRequested',
  approved: 'approvalGranted', returned: 'approvalReturned', delegated: 'approvalRequested', sod_blocked: 'approvalReturned',
  executed: 'actionStarted', verified: 'verified', closed: 'closed',
};
const PRIORITY: LedgerKind[] = ['signal', 'closed', 'returned', 'sod_blocked', 'verified', 'executed', 'approved', 'delegated', 'impact', 'assessment', 'ownership', 'approval_requested', 'remote', 'availability'];

let novaReady = false;

/** Window-level side effects: theme attributes, audio unlock, and sound/voice for new ledger events. */
export function useSentinelEffects(role: WindowRole) {
  const settings = useStore(s => s.settings);
  const run = useStore(s => s.run);
  const presenterNarration = useStore(s => s.presenter.narration);
  const seen = useRef<{ runId: string; seq: number } | null>(null);

  useEffect(() => { setWindowRole(role); }, [role]);
  useMacSimEffects();
  useEffect(() => {
    if (novaReady) return;
    novaReady = true;
    setNovaOwnerCheck(isAudioOwner);
    setSoundProbe(() => sfxReady() && novaState().engine !== 'needs-click');
    onSoundCheck(() => { play('acknowledge'); say('Sound check. NOVA is ready on this screen.', { force: true }); });
    initNova();
  }, []);

  useEffect(() => {
    const d = document.documentElement;
    d.classList.add('s-root');
    d.dataset.sTheme = settings.theme;
    // The original enterprise pages key their light palette on data-theme; keep both in step (not on single-URL hosts, which own data-theme).
    if (!HASH_ROUTING) d.dataset.theme = settings.theme;
    if (settings.motion === 'system') delete d.dataset.sMotion; else d.dataset.sMotion = settings.motion;
    d.dataset.sProjector = settings.projector ? 'on' : 'off';
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', settings.theme === 'light' ? '#EEF2F7' : '#080D17');
  }, [settings.theme, settings.motion, settings.projector]);

  useEffect(() => { setSfxVolume(settings.volume); setSfxMuted(settings.muted); }, [settings.volume, settings.muted]);

  // Browsers only allow sound after a user gesture: unlock on the first interaction.
  useEffect(() => {
    const unlock = () => { unlockAudio(); unlockNova(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => { window.removeEventListener('pointerdown', unlock, { capture: true }); window.removeEventListener('keydown', unlock, { capture: true }); };
  }, []);

  useEffect(() => {
    const prev = seen.current;
    if (!prev || prev.runId !== run.id) {
      if (prev && prev.runId !== run.id) stopNova();
      seen.current = { runId: run.id, seq: run.ledger.length };
      return;
    }
    if (run.ledger.length <= prev.seq) { seen.current = { runId: run.id, seq: run.ledger.length }; return; }
    const fresh = run.ledger.slice(prev.seq);
    seen.current = { runId: run.id, seq: run.ledger.length };
    if (!isAudioOwner()) return;
    const top = [...fresh].sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind))[0];
    // The alarm matches the severity: critical incidents get the low pulse, high-severity ones a lighter warning.
    const critical = scenarioOf(run).severity === 'Critical';
    const cue = top.kind === 'signal' && !critical ? 'warning' : CUE_BY_KIND[top.kind];
    if (cue) play(cue);
    // The critical alarm: the low impact first, then an original two-tone klaxon; NOVA speaks after it.
    if (top.kind === 'signal' && critical) window.setTimeout(() => play('klaxon'), 320);
    const prefs = getPrefs();
    const narrationOff = presenterNarration === 'off' && getState().presenter.status !== 'idle';
    if (prefs.mode === 'auto' && !narrationOff && (prefs.enabled || prefs.captions)) {
      const line = lineForEvent(run, top, prefs.style);
      if (line) window.setTimeout(() => say(line.text, { key: line.key }), top.kind === 'signal' ? (critical ? 2500 : 1200) : 350);
    }
  }, [run, presenterNarration]);
}

/** Re-render when other windows of this browser come and go (audio ownership, presenter status). */
export function usePeers() {
  return useSyncExternalStore(subscribePeers, () => peersVersion(), () => 0);
}
let ver = 0;
subscribePeers(() => { ver++; });
const peersVersion = () => ver;
void subscribe;
