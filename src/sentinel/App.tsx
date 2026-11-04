import { Suspense, lazy, useEffect } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { HASH_ROUTING } from './env';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/views.css';
import Shell from './components/Shell';
import { ToastProvider } from './components/kit';
import { CaptionBar, CriticalAlert } from './components/Overlays';
import { useSentinelEffects } from './state/effects';
import type { WindowRole } from './state/store';
import { Command, Endpoint, Evidence, Guide, Inbox, Incident, Landing, Report, Response, Settings, Soc, Team } from './routes';
import { ENTERPRISE_PAGES, EnterpriseClassicPresent, EnterpriseFrame, EnterpriseLogin } from './enterprise';

const Present = lazy(() => import('./presenter/Present'));
const Stage = lazy(() => import('./presenter/Stage'));
const Console = lazy(() => import('./presenter/Console'));
const Script = lazy(() => import('./presenter/Script'));

const TITLES: [string, string][] = [
  ...ENTERPRISE_PAGES.filter(p => !p.path.includes(':')).map(p => [p.path, p.title] as [string, string]),
  ['/present/classic', 'Classic present mode'], ['/login', 'Sign in'],
  ['/command', 'Command Center'], ['/incident', 'Live incident'], ['/inbox', 'Team Inbox'], ['/soc', 'Security operations'], ['/response', 'Department plans'],
  ['/endpoint', 'Endpoint action'], ['/evidence', 'Evidence ledger'], ['/report', 'After-action report'], ['/team', 'Authority map'],
  ['/settings', 'Voice & settings'], ['/guide', 'Demo guide'], ['/present/audience', 'Audience view'], ['/present/console', 'Presenter console'], ['/present', 'Presenter Mode'],
];

function roleFor(path: string): WindowRole { return path.startsWith('/present/audience') ? 'audience' : path.startsWith('/present/console') ? 'console' : 'main'; }

function Effects() {
  const loc = useLocation();
  useSentinelEffects(roleFor(loc.pathname));
  useEffect(() => {
    const t = TITLES.find(([p]) => loc.pathname === p || loc.pathname.startsWith(`${p}/`))?.[1];
    document.title = t ? `${t} · NOVATECH Sentinel` : 'NOVATECH Sentinel — the enterprise nervous system';
  }, [loc.pathname]);
  return null;
}

function Loading() { return <div className="s-loading" role="status"><span className="s-spinner" aria-hidden="true" />Loading…</div>; }

function WithShell({ children }: { children: ReactNode }) {
  return <Shell><Suspense fallback={<Loading />}>{children}</Suspense><CriticalAlert /><CaptionBar /></Shell>;
}

function NotFound() {
  return <div className="s-page"><div className="s-empty" style={{ padding: '80px 16px' }}><b>This page does not exist</b>It may have moved in V2.4. <Link to="/command" className="s-linkbtn">Go to the Command Center</Link></div></div>;
}

const Router = HASH_ROUTING ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <div className="s-app">
          <Effects />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/" element={<><Landing /><CaptionBar /><CriticalAlert /></>} />
              <Route path="/present/audience" element={<Stage />} />
              <Route path="/present/stage" element={<Stage single />} />
              <Route path="/present/console" element={<Console />} />
              <Route path="/present/script" element={<Script />} />
              <Route path="/present" element={<WithShell><Present /></WithShell>} />
              <Route path="/command" element={<WithShell><Command /></WithShell>} />
              <Route path="/incident" element={<WithShell><Incident /></WithShell>} />
              <Route path="/inbox" element={<WithShell><Inbox /></WithShell>} />
              <Route path="/soc" element={<WithShell><Soc /></WithShell>} />
              <Route path="/response" element={<WithShell><Response /></WithShell>} />
              <Route path="/endpoint" element={<WithShell><Endpoint /></WithShell>} />
              <Route path="/evidence" element={<WithShell><Evidence /></WithShell>} />
              <Route path="/report" element={<WithShell><Report /></WithShell>} />
              <Route path="/team" element={<WithShell><Team /></WithShell>} />
              <Route path="/settings" element={<WithShell><Settings /></WithShell>} />
              <Route path="/guide" element={<WithShell><Guide /></WithShell>} />
              <Route path="/present/classic" element={<EnterpriseClassicPresent />} />
              <Route path="/login" element={<EnterpriseLogin />} />
              <Route element={<WithShell><EnterpriseFrame /></WithShell>}>
                {ENTERPRISE_PAGES.map(({ path, Page }) => <Route key={path} path={path} element={<Page />} />)}
              </Route>
              <Route path="*" element={<WithShell><NotFound /></WithShell>} />
            </Routes>
          </Suspense>
        </div>
      </ToastProvider>
    </Router>
  );
}
