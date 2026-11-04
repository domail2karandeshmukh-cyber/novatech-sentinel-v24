/**
 * The original NOVATECH IRM enterprise pages, hosted in the Sentinel shell. Paths are the originals, except
 * the three that Sentinel now owns: Home moved from / to /home, Guide from /guide to /handbook and the
 * original present mode from /present to /present/classic.
 */
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

type Page = LazyExoticComponent<ComponentType>;
const named = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, key: K): Page => lazy(() => loader().then(m => ({ default: m[key] })));

export const EnterpriseFrame = lazy(() => import('../enterprise/ui/EnterpriseFrame'));
export const EnterpriseLogin = named(() => import('../enterprise/ui/EnterpriseFrame'), 'EnterpriseLogin');
export const EnterpriseClassicPresent = named(() => import('../enterprise/ui/EnterpriseFrame'), 'EnterpriseClassicPresent');

export const ENTERPRISE_PAGES: { path: string; title: string; Page: Page }[] = [
  { path: '/home', title: 'Workspace home', Page: lazy(() => import('../pages/Home')) },
  { path: '/workspace', title: 'My work', Page: lazy(() => import('../pages/Workspace')) },
  { path: '/live', title: 'Decision flow', Page: lazy(() => import('../pages/Situation')) },
  { path: '/briefing', title: 'Executive briefing', Page: lazy(() => import('../pages/Overview')) },
  { path: '/risks', title: 'Risk register', Page: lazy(() => import('../pages/Risks')) },
  { path: '/ebios', title: 'EBIOS RM study', Page: lazy(() => import('../pages/Ebios')) },
  { path: '/quant', title: 'Risk quantification', Page: lazy(() => import('../pages/Quant')) },
  { path: '/compliance', title: 'Frameworks', Page: lazy(() => import('../pages/Compliance')) },
  { path: '/controls', title: 'Controls', Page: lazy(() => import('../pages/Controls')) },
  { path: '/policies', title: 'Policies', Page: lazy(() => import('../pages/Policies')) },
  { path: '/incidents', title: 'Incidents', Page: named(() => import('../pages/Incidents'), 'Incidents') },
  { path: '/incidents/:id', title: 'Incident', Page: named(() => import('../pages/Incidents'), 'IncidentDetail') },
  { path: '/actions', title: 'Action plans', Page: lazy(() => import('../pages/Actions')) },
  { path: '/actions/:id', title: 'Action', Page: lazy(() => import('../pages/ActionDetail')) },
  { path: '/approvals', title: 'Approvals', Page: lazy(() => import('../pages/Approvals')) },
  { path: '/vendors', title: 'Third parties', Page: lazy(() => import('../pages/Vendors')) },
  { path: '/continuity', title: 'Continuity', Page: lazy(() => import('../pages/Continuity')) },
  { path: '/board', title: 'Board pack', Page: lazy(() => import('../pages/Board')) },
  { path: '/audit', title: 'Audit ledger', Page: lazy(() => import('../pages/Audit')) },
  { path: '/reports', title: 'Reports', Page: named(() => import('../pages/Misc'), 'Reports') },
  { path: '/scenarios', title: 'Scenario center', Page: lazy(() => import('../pages/Scenarios')) },
  { path: '/access', title: 'Team & access', Page: lazy(() => import('../pages/Access')) },
  { path: '/organisation', title: 'Organisation', Page: lazy(() => import('../pages/Organisation')) },
  { path: '/assets', title: 'Assets', Page: named(() => import('../pages/Misc'), 'Assets') },
  { path: '/departments', title: 'Departments', Page: named(() => import('../pages/Misc'), 'Departments') },
  { path: '/handbook', title: 'Handbook', Page: named(() => import('../pages/Misc'), 'Guide') },
];
