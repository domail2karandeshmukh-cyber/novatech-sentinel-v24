import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const PAIRING_WINDOW_MS = 5 * 60 * 1000;
export const SESSION_DURATION_MS = 30 * 60 * 1000;
export const REMOTE_CONFIRMATION = 'REQUEST MAC SHUTDOWN';

function safeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// V2.4 (optional): classroom governance record shown in the owner-approval window.
export const GOVERNANCE_TEXT_LIMIT = 120;
export const GOVERNANCE_MAX_APPROVALS = 10;

// '' for an absent value, null for an invalid one (not a string, or longer than the limit).
function governanceText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\p{Cf}\p{Cs}]/gu, '').replace(/[\p{Cc}\p{Zl}\p{Zp}\s]+/gu, ' ').trim();
  return Array.from(text).length <= GOVERNANCE_TEXT_LIMIT ? text : null;
}

/**
 * Validate the optional governance object { incidentId, scenario, reason, approvals: [{ gate,
 * person, role, decision }] }. Invalid fields and approvals are dropped (an approval needs a gate
 * and a person; every field it has must be a string of at most 120 characters); at most 10
 * approvals are kept. Returns a frozen record, or null when nothing usable remains. Never throws.
 */
export function validateGovernance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const approvals = [];
  if (Array.isArray(input.approvals)) {
    for (const entry of input.approvals.slice(0, 100)) {
      if (approvals.length >= GOVERNANCE_MAX_APPROVALS) break;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const row = { gate: governanceText(entry.gate), person: governanceText(entry.person), role: governanceText(entry.role), decision: governanceText(entry.decision) };
      if (Object.values(row).includes(null) || !row.gate || !row.person) continue;
      approvals.push(Object.freeze(row));
    }
  }
  const field = value => governanceText(value) || null;
  const record = { incidentId: field(input.incidentId), scenario: field(input.scenario), reason: field(input.reason), approvals: Object.freeze(approvals) };
  if (!record.incidentId && !record.scenario && !record.reason && approvals.length === 0) return null;
  return Object.freeze(record);
}

export class RemotePairing {
  constructor({ clock = Date.now, getCode = () => String(randomInt(100000, 1000000)), getToken = () => randomBytes(32).toString('hex') } = {}) {
    this.clock = clock;
    this.getCode = getCode;
    this.getToken = getToken;
    this.pairing = null;
    this.session = null;
    this.busy = false;
    this.pendingController = null;
    this.lastRequestAt = -Infinity;
    this.audit = [];
  }

  activate({ workflowClosed, approved, scenarioId, controllerName = 'Pavan', governance }) {
    if (workflowClosed !== true || approved !== true || scenarioId !== 'ransomware') throw new Error('Finish the director-approved ransomware workflow before pairing.');
    const name = String(controllerName).trim();
    if (!/^[\p{L}\p{N} .'-]{1,48}$/u.test(name)) throw new Error('Enter a valid presenter name (1–48 characters).');
    this.session = null;
    this.pairing = { code: this.getCode(), name, expiresAt: this.clock() + PAIRING_WINDOW_MS, attempts: 0 };
    // V2.4: optional governance record, carried into the session on redeem(). Absent → unchanged.
    const record = validateGovernance(governance);
    if (record) this.pairing.governance = record;
    this.audit.push({ at: new Date(this.clock()).toISOString(), event: 'Pairing started', actor: 'Mac owner' });
    return this.localStatus();
  }

  localStatus() {
    const now = this.clock();
    if (this.pairing && this.pairing.expiresAt <= now) this.pairing = null;
    if (this.session && this.session.expiresAt <= now) this.session = null;
    const governance = this.session?.governance ?? this.pairing?.governance ?? null;
    return {
      pairingCode: this.pairing?.code ?? null,
      pairingExpiresAt: this.pairing?.expiresAt ?? null,
      controllerName: this.session?.name ?? this.pairing?.name ?? null,
      pairedUntil: this.session?.expiresAt ?? null,
      connected: Boolean(this.session),
      busy: this.busy,
      recentActions: this.audit.slice(-5),
      // V2.4: only present when a governance record was attached, so the legacy shape is unchanged.
      ...(governance ? { governance } : {}),
    };
  }

  // V2.4: governance record of the ACTIVE paired session (null when absent, expired or revoked).
  activeGovernance() {
    this.localStatus();
    return this.session?.governance ?? null;
  }

  redeem(code) {
    this.localStatus();
    if (!this.pairing) throw new Error('Pairing is closed or expired. Ask the Mac owner to open a new pairing window.');
    this.pairing.attempts++;
    if (this.pairing.attempts > 5) {
      this.pairing = null;
      throw new Error('Too many pairing attempts. The Mac owner must create a new code.');
    }
    if (!safeEquals(code, this.pairing.code)) throw new Error('Incorrect pairing code.');
    const token = this.getToken();
    const name = this.pairing.name;
    const governance = this.pairing.governance;
    this.session = { token, name, expiresAt: this.clock() + SESSION_DURATION_MS, ...(governance ? { governance } : {}) };
    this.pairing = null;
    this.audit.push({ at: new Date(this.clock()).toISOString(), event: 'Presenter paired', actor: name });
    return { token, name, expiresAt: this.session.expiresAt };
  }

  authorize(bearer) {
    this.localStatus();
    if (!this.session || !safeEquals(bearer, this.session.token)) throw new Error('Your pairing has expired or been revoked.');
    return { name: this.session.name, expiresAt: this.session.expiresAt, busy: this.busy };
  }

  async request(bearer, body, { live, executor, platform = process.platform }) {
    const { name } = this.authorize(bearer);
    if (body?.confirmation !== REMOTE_CONFIRMATION) throw new Error('Request confirmation is missing.');
    if (this.busy || this.clock() - this.lastRequestAt < 10000) throw new Error('A request was just made. Please wait.');
    if (live && platform !== 'darwin') throw new Error('Real shutdown is only supported on the Mac.');
    this.busy = true;
    const controller = new AbortController();
    this.pendingController = controller;
    this.lastRequestAt = this.clock();
    this.audit.push({ at: new Date(this.clock()).toISOString(), event: live ? 'Shutdown request received' : 'Preview requested', actor: name });
    try {
      const result = live ? await executor(name, controller.signal) : { status: 'preview' };
      this.audit.push({ at: new Date(this.clock()).toISOString(), event: result.status === 'cancelled' ? 'Mac owner rejected request' : result.status === 'preview' ? 'Preview completed' : 'macOS shutdown requested', actor: 'Mac owner' });
      return result;
    } finally { this.busy = false; this.pendingController = null; }
  }

  revoke() {
    this.pendingController?.abort();
    this.pairing = null;
    this.session = null;
    this.audit.push({ at: new Date(this.clock()).toISOString(), event: 'Remote access revoked', actor: 'Mac owner' });
    return this.localStatus();
  }
}
