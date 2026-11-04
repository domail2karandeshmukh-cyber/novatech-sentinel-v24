import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * True when the build carries both Supabase settings: the app is the authenticated workspace.
 * Without them it runs as the public demo, answered by the simulated backend in src/enterprise/demo.
 */
export function isSupabaseConfigured(): boolean {
  return !!(url && url.trim() && key && key.trim());
}

let client: SupabaseClient | null = null;
/** The Supabase client, created on first use (never at import time, and never without configuration). */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured: this build is the public demo.');
  if (!client) {
    client = createClient(url as string, key as string, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'novatech-grc-auth' },
    });
  }
  return client;
}

const DEMO_SIGN_IN = 'Sign-in is not available in the public demo: there is no authentication backend. Choose a person from the demo persona switcher instead.';
/** The part of the client API the app touches, answered locally in the public demo. */
const demoClient: Record<string, unknown> = {
  auth: {
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { name: 'AuthApiError', status: 400, message: DEMO_SIGN_IN } }),
    signOut: async () => ({ error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { id: 'public-demo', callback: () => undefined, unsubscribe: () => undefined } } }),
  },
  rpc: async (fn: string, args: Record<string, unknown> = {}) => {
    try { return { data: await rpc(fn, args), error: null }; } catch (e) { return { data: null, error: { message: e instanceof Error ? e.message : String(e) } }; }
  },
};

/** Supabase client (created lazily). In the public demo only `auth` and `rpc` exist, answered locally. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (typeof prop === 'symbol' || prop === 'then') return undefined;
    if (!isSupabaseConfigured()) {
      if (prop in demoClient) return demoClient[prop];
      throw new Error(`supabase.${prop} is not available in the public demo (Supabase is not configured).`);
    }
    const c = getSupabase() as unknown as Record<string, unknown>;
    const v = c[prop];
    return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});

export class RpcError extends Error {
  kind: 'DENIED' | 'VALIDATION' | 'AUTH' | 'NOT_FOUND' | 'ERROR';
  constructor(message: string) {
    const m = message.match(/^(DENIED|VALIDATION|AUTH|NOT_FOUND):\s*(.*)$/s);
    super(m ? m[2] : message);
    this.kind = (m ? m[1] : 'ERROR') as RpcError['kind'];
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- callers rely on the untyped default
export async function rpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isSupabaseConfigured()) {
    // Public demo: the simulated backend (and its fixtures) load on the first call only.
    const { demoRpc } = await import('../enterprise/demo/demoBackend.ts');
    try {
      return (await demoRpc(fn, args)) as T;
    } catch (e) {
      throw e instanceof RpcError ? e : new RpcError(e instanceof Error ? e.message : String(e));
    }
  }
  const { data, error } = await getSupabase().rpc(fn, args);
  if (error) throw new RpcError(error.message);
  return data as T;
}
