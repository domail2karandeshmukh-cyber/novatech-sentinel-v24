/**
 * Hosts the original NOVATECH IRM pages inside the Sentinel shell: their providers (session, toasts,
 * authority stamps, guided tour), their stylesheet scoped under .ent-root and bridged to Sentinel's tokens,
 * and one honest banner that says where the data comes from and who the visitor is acting as.
 */
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Database, RotateCcw, UserRound } from 'lucide-react';
import './legacy-scoped.css';
import './bridge.css';
import { SessionProvider, useSession } from '../../lib/session';
import { ToastProvider } from '../../components/ui';
import { StampProvider } from '../../components/Authority';
import { TourProvider } from '../../components/Tour';
import Login from '../../pages/Login';
import { useStore } from '../../sentinel/state/store';
import { SECONDARY, TEAM } from '../../sentinel/data/team';
import type { ActorId } from '../../sentinel/data/team';
import { ConfirmButton } from '../../sentinel/components/kit';

/** grc.employees.id for a Sentinel persona, when that person has an account in the enterprise workspace. */
export function employeeIdFor(actor: ActorId): string | null {
  return TEAM.find(p => p.id === actor)?.employeeId ?? SECONDARY.find(p => p.id === actor)?.employeeId ?? null;
}

/** One persona for the whole app: the Sentinel switcher also decides who the visitor acts as in the workspace. */
function PersonaSync() {
  const actor = useStore(s => s.persona);
  const { demo, persona, personas, setPersona } = useSession();
  useEffect(() => {
    if (!demo) return;
    const id = employeeIdFor(actor);
    if (!id || persona?.employee_id === id) return;
    if (personas.some(p => p.employee_id === id && p.active)) setPersona(id);
  }, [actor, demo, persona?.employee_id, personas, setPersona]);
  return null;
}

function DataBanner() {
  const { demo, persona, current, refreshKey } = useSession();
  const actor = useStore(s => s.persona);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [pristine, setPristine] = useState(true);
  useEffect(() => {
    if (!demo) return;
    let live = true;
    void import('../demo/demoBackend.ts').then(m => m.getDemoSnapshotInfo()).then(info => {
      if (!live) return;
      setAsOf(new Date(info.snapshotAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }));
      setPristine(info.pristine);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [demo, refreshKey]);
  if (!demo) {
    return (
      <div className="ent-banner live" role="note">
        <span><Database size={15} aria-hidden="true" /> <b>Live workspace</b>{current ? ` · signed in as ${current.full_name} — ${current.role}` : ''}. Changes are written to the database.</span>
      </div>
    );
  }
  const unmapped = !employeeIdFor(actor);
  return (
    <div className="ent-banner" role="note">
      <div className="ent-banner-text">
        <span><Database size={15} aria-hidden="true" /> <b>Case workspace — simulated copy of the NOVATECH case data</b>{asOf ? ` (snapshot of ${asOf})` : ''}, separate from the incident rehearsal. Changes stay in this browser{pristine ? '' : ' (you have local changes)'}.</span>
        <span><UserRound size={15} aria-hidden="true" /> Acting as <b>{persona?.full_name ?? '—'}</b>{persona ? `, ${persona.role}` : ''}.{unmapped && ' The current Sentinel persona has no workspace account, so the previous person is kept.'}</span>
      </div>
      <ConfirmButton className="s-btn sm" confirmLabel="Click again to restore the snapshot" onConfirm={() => { void import('../demo/demoBackend.ts').then(m => m.resetDemoData()); }}>
        <RotateCcw size={14} />Reset workspace data
      </ConfirmButton>
    </div>
  );
}

function Guard() {
  const { demo, session, loading, memberships } = useSession();
  const loc = useLocation();
  if (!demo && loading) return <div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>;
  if (!demo && !session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!demo && memberships.length === 0) {
    return <div className="app2 ent-app"><main className="page"><div className="content"><div className="ent-banner" role="alert"><span>This account is signed in but is not an active member of any organisation. Access is granted by an administrator.</span></div></div></main></div>;
  }
  const bleed = loc.pathname === '/live';
  return (
    <div className="app2 ent-app">
      <main className={`page ${bleed ? 'bleed' : ''}`}>
        <div className={bleed ? '' : 'content'}>
          {!bleed && <DataBanner />}
          <Suspense fallback={<div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>}><Outlet /></Suspense>
        </div>
      </main>
    </div>
  );
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <div className="ent-root">
      <SessionProvider>
        <ToastProvider>
          <StampProvider>
            <TourProvider>{children}</TourProvider>
          </StampProvider>
        </ToastProvider>
      </SessionProvider>
    </div>
  );
}

export default function EnterpriseFrame() {
  return <Providers><PersonaSync /><Guard /></Providers>;
}

/** Presenter Mode: one original page on the projector, with the same providers and the honest data banner. */
export function EnterpriseOnStage({ children }: { children: ReactNode }) {
  return (
    <Providers><PersonaSync />
      <div className="app2 ent-app ent-stage">
        <main className="page"><div className="content"><DataBanner /><Suspense fallback={<div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>}>{children}</Suspense></div></main>
      </div>
    </Providers>
  );
}

/** /login: only meaningful when the build is connected to Supabase. The public demo goes straight to the workspace. */
function LoginGate() {
  const { demo, session, loading } = useSession();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from ?? '/home';
  if (demo) return <Navigate to="/home" replace />;
  if (!loading && session) return <Navigate to={from} replace />;
  return <Login />;
}
export function EnterpriseLogin() {
  return <Providers><LoginGate /></Providers>;
}

const ClassicPresentPage = lazy(() => import('../../pages/Present'));
function ClassicGate() {
  const { demo, session, loading } = useSession();
  const loc = useLocation();
  if (!demo && loading) return <div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>;
  if (!demo && !session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <Suspense fallback={<div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>}><ClassicPresentPage /></Suspense>;
}
/** /present/classic: the original projector view of the enterprise scenario center, kept as it was. */
export function EnterpriseClassicPresent() {
  return <Providers><PersonaSync /><ClassicGate /></Providers>;
}
