/**
 * Rules of the public-preview rehearsal of the final act — pure functions, no device, no timers.
 * Karan (Mac owner) opens a 5-minute pairing code after the seven gates; Pavan pairs from Windows for a 30-minute
 * session and can only send a request; the owner has 30 seconds to decide. Anything late, missing or revoked fails
 * safe: the (simulated) Mac stays on.
 */
export type MacPhase = 'idle' | 'code' | 'paired' | 'pending' | 'result';
export type MacResult = 'approved' | 'rejected' | 'timeout';
export type MacSim = { phase: MacPhase; code: string; codeUntil: number; sessionUntil: number; deadline: number; result: MacResult | null; seq: number };
export type MacAction =
  | { type: 'open'; code: string } | { type: 'pair' } | { type: 'request' }
  | { type: 'decide'; decision: 'approved' | 'rejected' } | { type: 'revoke' } | { type: 'tick' };
export type MacLog = { actor: 'karan' | 'pavan' | 'system'; title: string; note: string };

export const PAIRING_MS = 5 * 60_000;
export const SESSION_MS = 30 * 60_000;
export const DECISION_MS = 30_000;

export const blankMacSim = (seq = 0): MacSim => ({ phase: 'idle', code: '', codeUntil: 0, sessionUntil: 0, deadline: 0, result: null, seq });

/** What the rehearsal allows next, given its state and whether the seven gates are closed. */
export function macCan(m: MacSim, eligible: boolean, now: number) {
  const session = m.sessionUntil > now;
  return {
    open: eligible && m.phase === 'idle',
    pair: m.phase === 'code' && m.codeUntil > now,
    request: eligible && session && (m.phase === 'paired' || m.phase === 'result'),
    decide: m.phase === 'pending' && now <= m.deadline,
    revoke: m.phase !== 'idle',
  };
}

/** One step of the rehearsal. Returns null when the step is not allowed (nothing changes, nothing is logged). */
export function macStep(m: MacSim, a: MacAction, now: number, eligible: boolean): { mac: MacSim; log: MacLog | null } | null {
  const can = macCan(m, eligible, now);
  switch (a.type) {
    case 'open':
      if (!can.open || !/^\d{6}$/.test(a.code)) return null;
      return { mac: { ...blankMacSim(m.seq), phase: 'code', code: a.code, codeUntil: now + PAIRING_MS }, log: { actor: 'karan', title: 'Karan opened a 5-minute pairing window', note: 'Pairing opened by the Mac owner after the seven gates.' } };
    case 'pair':
      if (!can.pair) return null;
      return { mac: { ...m, phase: 'paired', sessionUntil: now + SESSION_MS }, log: { actor: 'pavan', title: 'Pavan paired from his Windows laptop', note: '30-minute session started.' } };
    case 'request':
      if (!can.request) return null;
      return { mac: { ...m, phase: 'pending', deadline: now + DECISION_MS, result: null }, log: { actor: 'pavan', title: 'Pavan requested the power-off of FIN-WS-07 (stand-in Mac)', note: 'Request only, for forensic imaging and re-imaging — the Mac owner must decide locally.' } };
    case 'decide':
      // A decision that arrives after the deadline is too late: the timeout already applies.
      if (!can.decide) return null;
      return {
        mac: { ...m, phase: 'result', result: a.decision },
        log: a.decision === 'approved'
          ? { actor: 'karan', title: 'Karan authorized the power-off on the device (simulated)', note: 'On the real Mac the helper would now ask macOS to shut down.' }
          : { actor: 'karan', title: 'Karan rejected the request — Mac stays on', note: 'Rejected by the owner.' },
      };
    case 'revoke':
      if (!can.revoke) return null;
      return { mac: blankMacSim(m.seq), log: { actor: 'karan', title: 'Karan revoked the remote session', note: 'Pavan’s access ended immediately.' } };
    case 'tick':
      if (m.phase === 'pending' && now > m.deadline) return { mac: { ...m, phase: 'result', result: 'timeout' }, log: { actor: 'system', title: 'Mac owner did not answer — request timed out', note: 'Thirty seconds passed without a decision; the Mac stays on.' } };
      if (m.phase === 'code' && now > m.codeUntil) return { mac: blankMacSim(m.seq), log: null };
      return null;
  }
}
