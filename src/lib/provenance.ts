import { isSupabaseConfigured } from './supabase';

/**
 * Wording that depends on where the workspace data comes from. The public demo runs on a simulated copy of the case
 * data kept in the browser; only a build connected to the NOVATECH database may describe records as live or real.
 */
export const SIMULATED_WORKSPACE = !isSupabaseConfigured();
/** "computed from …" */
export const DATA_SOURCE = SIMULATED_WORKSPACE ? 'the simulated workspace records' : 'live platform data';
/** Where approvals, permissions and the audit trail live. */
export const RECORDS_NOTE = SIMULATED_WORKSPACE
  ? 'everything here — decisions, approvals, permissions and the audit trail — is a simulated copy kept in this browser'
  : 'decisions, permissions and audit records are real platform data';
