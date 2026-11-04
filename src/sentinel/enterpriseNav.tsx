/** Navigation for the original NOVATECH IRM enterprise pages, merged into Sentinel's groups (one product, one menu). */
import {
  Building2, Calculator, FileBarChart2, FileText, Home, Inbox, KeyRound, LifeBuoy, ListChecks, Network, Newspaper,
  Presentation, Radar, Scale, ScrollText, Server, ShieldAlert, ShieldCheck, Siren, Stamp, Truck, Waypoints, BookOpen, PlayCircle,
} from 'lucide-react';
import type { NavItem } from './components/Shell';

export type EnterpriseGroup = 'command' | 'risk' | 'response' | 'assurance' | 'team';

export const RISK_GROUP = { key: 'risk', label: 'Risk', blurb: 'Identify, analyse and price risk — one control set for every framework.' };

export const ENTERPRISE_NAV: Record<EnterpriseGroup, NavItem[]> = {
  command: [
    { to: '/home', label: 'Workspace home', desc: 'Your priorities and the posture at a glance', icon: <Home size={17} /> },
    { to: '/workspace', label: 'My work', desc: 'Decisions and tasks routed to you', icon: <Inbox size={17} /> },
    { to: '/live', label: 'Decision flow', desc: 'Who holds each workspace decision now', icon: <Waypoints size={17} /> },
    { to: '/briefing', label: 'Executive briefing', desc: 'The one-page view for the CEO', icon: <Newspaper size={17} /> },
  ],
  risk: [
    { to: '/risks', label: 'Risk register', desc: 'Scores, owners, KRIs and treatment', icon: <ShieldAlert size={17} /> },
    { to: '/ebios', label: 'EBIOS RM study', desc: 'The five ANSSI workshops, end to end', icon: <Radar size={17} /> },
    { to: '/quant', label: 'Quantification', desc: 'Monte Carlo loss in euros, value of controls', icon: <Calculator size={17} /> },
    { to: '/compliance', label: 'Frameworks', desc: 'ISO 27001, NIS2, GDPR, DORA coverage', icon: <Scale size={17} /> },
    { to: '/controls', label: 'Controls', desc: 'Library and continuous monitoring', icon: <ShieldCheck size={17} /> },
    { to: '/policies', label: 'Policies', desc: 'Approved rules and acknowledgements', icon: <FileText size={17} /> },
  ],
  response: [
    { to: '/incidents', label: 'Incident register', desc: 'Investigation and regulatory clocks', icon: <Siren size={17} /> },
    { to: '/actions', label: 'Action plans', desc: 'Treatment and response, owner to proof', icon: <ListChecks size={17} /> },
    { to: '/approvals', label: 'Approvals', desc: 'Policy-routed decisions, dual control', icon: <Stamp size={17} /> },
    { to: '/vendors', label: 'Third parties', desc: 'Supplier tiers and the DORA register', icon: <Truck size={17} /> },
    { to: '/continuity', label: 'Continuity', desc: 'BIA, recovery targets, dependencies', icon: <LifeBuoy size={17} /> },
  ],
  assurance: [
    { to: '/board', label: 'Board pack', desc: 'Print-ready report from the data', icon: <Presentation size={17} /> },
    { to: '/audit', label: 'Audit ledger', desc: 'Workspace history, hash-chained', icon: <ScrollText size={17} /> },
    { to: '/reports', label: 'Reports', desc: 'Register and treatment reports', icon: <FileBarChart2 size={17} /> },
    { to: '/scenarios', label: 'Scenario center', desc: 'Workspace rehearsals A–C', icon: <PlayCircle size={17} /> },
  ],
  team: [
    { to: '/access', label: 'Team & access', desc: 'Owner, admins and members', icon: <KeyRound size={17} /> },
    { to: '/organisation', label: 'Organisation', desc: 'Roles, reporting lines, approval policy', icon: <Network size={17} /> },
    { to: '/assets', label: 'Assets', desc: 'Supporting systems and devices', icon: <Server size={17} /> },
    { to: '/departments', label: 'Departments', desc: 'Who owns which risks', icon: <Building2 size={17} /> },
    { to: '/handbook', label: 'Handbook', desc: 'Presenter notes and answers', icon: <BookOpen size={17} /> },
  ],
};
