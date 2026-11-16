/**
 * Public-preview rehearsal of the final act, wired to the shared store: the rules live in engine/macsim.ts; this
 * module applies them, writes each step to the ledger (labelled as simulated) and plays sound and voice once, in the
 * window that owns the speakers. Nothing here talks to a device.
 */
import { useEffect, useRef } from 'react';
import { dispatch, getState, isAudioOwner, setMac, useStore } from './store';
import { macEligibility } from '../engine/incident';
import { macStep } from '../engine/macsim';
import type { MacAction } from '../engine/macsim';
import { play } from '../audio/sfx';
import { say } from '../audio/nova';

export { macCan } from '../engine/macsim';

const NOTE = '[Simulated on the public preview — no device involved]';

function run(a: MacAction) {
  const st = getState();
  const out = macStep(st.mac, a, Date.now(), macEligibility(st.run).ok);
  if (!out) return false;
  setMac(() => out.mac);
  if (out.log) dispatch({ type: 'remote', actor: out.log.actor, title: out.log.title, note: `${out.log.note} ${NOTE}` });
  return true;
}

export const macSim = {
  open: () => run({ type: 'open', code: String(100000 + Math.floor(Math.random() * 900000)) }),
  pair: () => run({ type: 'pair' }),
  request: () => run({ type: 'request' }),
  decide: (decision: 'approved' | 'rejected') => run({ type: 'decide', decision }),
  revoke: () => run({ type: 'revoke' }),
  tick: () => run({ type: 'tick' }),
};

/** Sound, voice and expiry for the rehearsal — mounted once per window; acts only in the audio-owning window. */
export function useMacSimEffects() {
  const mac = useStore(s => s.mac);
  const seen = useRef(mac.seq);
  useEffect(() => {
    if (mac.seq === seen.current) return;
    seen.current = mac.seq;
    if (!isAudioOwner()) return;
    if (mac.phase === 'code') play('approvalRequested');
    else if (mac.phase === 'paired') play('acknowledge');
    else if (mac.phase === 'pending') {
      play('remoteRequest'); window.setTimeout(() => play('consentPending'), 900);
      say('Pierre has requested the power-off from his laptop. Karan, your Mac is asking for your decision. Reject is the default.', { key: `rq-${mac.seq}` });
    } else if (mac.phase === 'result') {
      play(mac.result === 'approved' ? 'powerOff' : 'cancelled');
      say(mac.result === 'approved' ? 'Karan has authorized the power-off. On the real Mac, this is the moment it shuts down. Every step is in the ledger.'
        : mac.result === 'timeout' ? 'No decision within thirty seconds. The request has expired, and the Mac stays on.' : 'Request rejected. The Mac stays on.', { key: `d-${mac.seq}` });
    } else if (mac.phase === 'idle') play('cancelled');
  }, [mac]);
  useEffect(() => {
    const t = window.setInterval(() => { const m = getState().mac; if ((m.phase === 'pending' || m.phase === 'code') && isAudioOwner()) macSim.tick(); }, 500);
    return () => window.clearInterval(t);
  }, []);
}
