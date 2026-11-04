/**
 * NOVATECH SERVICES — fictional ESAIP case company. Case facts come from the Group 1 brief;
 * the office split, client clusters and asset names are illustrative demo data and are labelled so in the UI.
 */
export const COMPANY = {
  name: 'NOVATECH SERVICES',
  product: 'NOVATECH Sentinel',
  employees: 85,
  turnoverEur: 12_000_000,
  clients: 230,
  recurringShare: 0.7,
  teleworkShare: 0.4,
  revenueGrowth: 0.35,
  plannedHires: 25,
  offices: ['Angers', 'Nantes', 'Rennes'],
  industry: 'IT & digital services',
};

export type NodeKind = 'office' | 'cloud' | 'bank' | 'saas' | 'supplier' | 'clients' | 'internet';
export type AtlasNode = {
  id: string; kind: NodeKind; label: string; sub: string; lon: number; lat: number;
  people?: number; clients?: number; scope: 'region' | 'europe';
  /** Which side of the marker its label sits on, so neighbouring labels never collide. */
  lab?: 'e' | 'w' | 'n' | 's';
};
export type EdgeKind = 'wan' | 'cloud' | 'finance' | 'supplier' | 'service' | 'replication' | 'threat';
export type AtlasEdge = { id: string; from: string; to: string; kind: EdgeKind; label: string };

export const NODES: AtlasNode[] = [
  { id: 'angers', kind: 'office', label: 'Angers', sub: 'Head office · Finance, Risk, IT', lon: -0.5632, lat: 47.4784, people: 38, scope: 'region', lab: 'e' },
  { id: 'nantes', kind: 'office', label: 'Nantes', sub: 'Delivery & development', lon: -1.5536, lat: 47.2184, people: 29, scope: 'region', lab: 'w' },
  { id: 'rennes', kind: 'office', label: 'Rennes', sub: 'Delivery & support', lon: -1.6778, lat: 48.1173, people: 18, scope: 'region', lab: 'w' },
  { id: 'cloud-paris', kind: 'cloud', label: 'EU cloud · primary', sub: 'Client portal, API gateway, file services', lon: 2.3522, lat: 48.8566, scope: 'europe', lab: 'e' },
  { id: 'cloud-fra', kind: 'cloud', label: 'EU cloud · standby', sub: 'Warm standby and backups', lon: 8.6821, lat: 50.1109, scope: 'europe' },
  { id: 'bank', kind: 'bank', label: 'Primary bank', sub: 'SEPA payment batches', lon: 2.238, lat: 48.892, scope: 'europe', lab: 'n' },
  { id: 'erp', kind: 'saas', label: 'ERP & payroll SaaS', sub: 'Accounting, payables, payroll', lon: -6.2603, lat: 53.3498, scope: 'europe' },
  { id: 'devpartner', kind: 'supplier', label: 'Subcontracted developers', sub: 'Privileged access to code repositories', lon: 4.8357, lat: 45.764, scope: 'europe', lab: 's' },
  { id: 'c-west', kind: 'clients', label: 'Regional clients', sub: 'Pays de la Loire & Brittany', lon: -1.05, lat: 47.78, clients: 95, scope: 'region', lab: 'n' },
  { id: 'c-paris', kind: 'clients', label: 'Paris clients', sub: 'Île-de-France', lon: 2.62, lat: 48.62, clients: 48, scope: 'europe', lab: 's' },
  { id: 'c-lyon', kind: 'clients', label: 'Lyon clients', sub: 'Auvergne-Rhône-Alpes', lon: 4.55, lat: 45.95, clients: 14, scope: 'europe', lab: 'n' },
  { id: 'c-bordeaux', kind: 'clients', label: 'Bordeaux clients', sub: 'Nouvelle-Aquitaine', lon: -0.58, lat: 44.84, clients: 12, scope: 'europe' },
  { id: 'c-lille', kind: 'clients', label: 'Lille clients', sub: 'Hauts-de-France', lon: 3.06, lat: 50.63, clients: 9, scope: 'europe' },
  { id: 'c-brussels', kind: 'clients', label: 'Brussels clients', sub: 'Belgium', lon: 4.35, lat: 50.85, clients: 11, scope: 'europe' },
  { id: 'c-amsterdam', kind: 'clients', label: 'Amsterdam clients', sub: 'Netherlands', lon: 4.9, lat: 52.37, clients: 8, scope: 'europe' },
  { id: 'c-munich', kind: 'clients', label: 'Munich clients', sub: 'Germany', lon: 11.58, lat: 48.14, clients: 10, scope: 'europe' },
  { id: 'c-milan', kind: 'clients', label: 'Milan clients', sub: 'Italy', lon: 9.19, lat: 45.46, clients: 8, scope: 'europe' },
  { id: 'c-madrid', kind: 'clients', label: 'Madrid clients', sub: 'Spain', lon: -3.7, lat: 40.42, clients: 9, scope: 'europe' },
  { id: 'c-barcelona', kind: 'clients', label: 'Barcelona clients', sub: 'Spain', lon: 2.17, lat: 41.39, clients: 6, scope: 'europe' },
  { id: 'internet', kind: 'internet', label: 'Untrusted internet', sub: 'Synthetic threat source — no real attribution', lon: -9.6, lat: 45.2, scope: 'europe', lab: 's' },
];

export const EDGES: AtlasEdge[] = [
  { id: 'e-an-na', from: 'angers', to: 'nantes', kind: 'wan', label: 'Site-to-site VPN' },
  { id: 'e-an-re', from: 'angers', to: 'rennes', kind: 'wan', label: 'Site-to-site VPN' },
  { id: 'e-na-re', from: 'nantes', to: 'rennes', kind: 'wan', label: 'Site-to-site VPN' },
  { id: 'e-an-cp', from: 'angers', to: 'cloud-paris', kind: 'cloud', label: 'Cloud workloads' },
  { id: 'e-na-cp', from: 'nantes', to: 'cloud-paris', kind: 'cloud', label: 'Cloud workloads' },
  { id: 'e-re-cp', from: 'rennes', to: 'cloud-paris', kind: 'cloud', label: 'Cloud workloads' },
  { id: 'e-cp-cf', from: 'cloud-paris', to: 'cloud-fra', kind: 'replication', label: 'Replication & backups' },
  { id: 'e-an-bk', from: 'angers', to: 'bank', kind: 'finance', label: 'SEPA payment batches' },
  { id: 'e-an-erp', from: 'angers', to: 'erp', kind: 'finance', label: 'Payables & payroll' },
  { id: 'e-dev-cp', from: 'devpartner', to: 'cloud-paris', kind: 'supplier', label: 'Supplier repository access' },
  { id: 'e-cp-cw', from: 'cloud-paris', to: 'c-west', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cpa', from: 'cloud-paris', to: 'c-paris', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cly', from: 'cloud-paris', to: 'c-lyon', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cbx', from: 'cloud-paris', to: 'c-bordeaux', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cli', from: 'cloud-paris', to: 'c-lille', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cbr', from: 'cloud-paris', to: 'c-brussels', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cam', from: 'cloud-paris', to: 'c-amsterdam', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cmu', from: 'cloud-paris', to: 'c-munich', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cmi', from: 'cloud-paris', to: 'c-milan', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cma', from: 'cloud-paris', to: 'c-madrid', kind: 'service', label: 'Client portal' },
  { id: 'e-cp-cba', from: 'cloud-paris', to: 'c-barcelona', kind: 'service', label: 'Client portal' },
];

/** Deterministic pseudo-random teleworker positions (40% of 85 ≈ 34) around the three offices. */
export function teleworkers(): { lon: number; lat: number; office: string }[] {
  let seed = 85_034;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const homes: { lon: number; lat: number; office: string }[] = [];
  const split: [string, number][] = [['angers', 15], ['nantes', 12], ['rennes', 7]];
  for (const [id, n] of split) {
    const o = NODES.find(x => x.id === id)!;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2, r = 0.12 + rand() * 0.55;
      homes.push({ lon: o.lon + Math.cos(a) * r * 1.35, lat: o.lat + Math.sin(a) * r * 0.85, office: id });
    }
  }
  return homes;
}

export type Asset = {
  id: string; name: string; kind: 'endpoint' | 'server' | 'cloud' | 'saas' | 'network' | 'fleet' | 'demo-device';
  site: string; owner: string; criticality: 1 | 2 | 3 | 4; status: string; note: string; node: string;
};

export const ASSETS: Asset[] = [
  { id: 'FIN-WS-07', name: 'Finance workstation (privileged)', kind: 'endpoint', site: 'Angers', owner: 'Finance', criticality: 4, status: 'EDR enrolled', note: 'Used for payment preparation; maps the finance shared drive.', node: 'angers' },
  { id: 'FS-ANG-01', name: 'Finance shared drive', kind: 'server', site: 'Angers', owner: 'Finance', criticality: 4, status: 'Snapshots every 4 h', note: 'Invoices, payroll exports, supplier banking details.', node: 'angers' },
  { id: 'VPN-GW-01', name: 'Remote-access VPN gateway', kind: 'network', site: 'Angers', owner: 'IT Operations', criticality: 4, status: 'MFA enforced', note: 'Serves the 40% of staff who telework.', node: 'angers' },
  { id: 'API-GW-EU', name: 'Client portal & API gateway', kind: 'cloud', site: 'EU cloud · primary', owner: 'IT Operations', criticality: 4, status: 'SLA 99.9%', note: 'Recurring-revenue services for 230 clients.', node: 'cloud-paris' },
  { id: 'STBY-EU', name: 'Standby environment & backups', kind: 'cloud', site: 'EU cloud · standby', owner: 'IT Operations', criticality: 3, status: 'Warm standby', note: 'RTO 4 h · RPO 1 h (case targets).', node: 'cloud-fra' },
  { id: 'ERP-SAAS', name: 'ERP, payables & payroll', kind: 'saas', site: 'SaaS · EU', owner: 'Finance', criticality: 4, status: 'SSO + MFA', note: 'Payment batches are prepared here and released to the bank.', node: 'erp' },
  { id: 'M365-TEN', name: 'Mail & collaboration tenant', kind: 'saas', site: 'SaaS · EU', owner: 'IT Operations', criticality: 3, status: 'Mail rules monitored', note: 'Business email — the usual entry point for payment fraud.', node: 'cloud-paris' },
  { id: 'FLEET-85', name: 'Laptop fleet (85 devices)', kind: 'fleet', site: 'All sites + home', owner: 'IT Operations', criticality: 3, status: '92% patched', note: '34 devices are used mostly from home.', node: 'angers' },
  { id: 'KD-MBA-M4', name: 'Karan’s MacBook Air M4', kind: 'demo-device', site: 'Classroom', owner: 'Karan Deshmukh', criticality: 2, status: 'Owner-approved demo endpoint', note: 'Stands in for FIN-WS-07 in the final step, the power-off for re-imaging. The only device that can receive it, and only with Karan’s approval on the device.', node: 'angers' },
  { id: 'PS-WIN-LT', name: 'Pavan’s Windows laptop', kind: 'demo-device', site: 'Classroom', owner: 'Pavan Sanam', criticality: 1, status: 'Controller only', note: 'Can send a request over the private LAN; cannot approve or run commands on the Mac.', node: 'angers' },
];
