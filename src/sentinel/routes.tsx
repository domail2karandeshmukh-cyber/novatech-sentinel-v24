import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

export const Landing = lazy(() => import('./pages/Landing'));
export const Command = lazy(() => import('./pages/Command'));
export const Incident = lazy(() => import('./pages/Incident'));
export const Soc = lazy(() => import('./pages/Soc'));
export const Response = lazy(() => import('./pages/Response'));
export const Endpoint = lazy(() => import('./pages/Endpoint'));
export const Evidence = lazy(() => import('./pages/Evidence'));
export const Report = lazy(() => import('./pages/Report'));
export const Team = lazy(() => import('./pages/Team'));
export const Settings = lazy(() => import('./pages/Settings'));
export const Guide = lazy(() => import('./pages/Guide'));
export const Inbox = lazy(() => import('./pages/Inbox'));

/** An original enterprise page wrapped for the stage (its providers and data banner come with it). */
const onStage = (load: () => Promise<{ default: ComponentType }>): LazyExoticComponent<ComponentType> => lazy(async () => {
  const [{ EnterpriseOnStage }, page] = await Promise.all([import('../enterprise/ui/EnterpriseFrame'), load()]);
  const Page = page.default;
  return { default: () => <EnterpriseOnStage><Page /></EnterpriseOnStage> };
});

/** Pages the presenter stage can show for a scene route. */
export const STAGE_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/': Landing, '/command': Command, '/incident': Incident, '/soc': Soc, '/response': Response,
  '/endpoint': Endpoint, '/evidence': Evidence, '/report': Report, '/team': Team,
  '/risks': onStage(() => import('../pages/Risks')), '/ebios': onStage(() => import('../pages/Ebios')),
  '/quant': onStage(() => import('../pages/Quant')), '/compliance': onStage(() => import('../pages/Compliance')),
  '/controls': onStage(() => import('../pages/Controls')), '/continuity': onStage(() => import('../pages/Continuity')),
  '/board': onStage(() => import('../pages/Board')), '/vendors': onStage(() => import('../pages/Vendors')),
};
