/**
 * Canonical NOVATECH Group 1 roster — the single source of truth for names, roles and authority.
 * Verified against the original application (Landing, Login, Present, ChainHero) and the
 * production NOVATECH database (grc.employees, org NT). Do not rename or re-role anyone here.
 */
export type PersonId = 'karan' | 'vijay' | 'vandana' | 'nandini' | 'srija' | 'pavan';
export type SecondaryId = 'thomas' | 'lea' | 'camille' | 'julie' | 'sophie' | 'marc' | 'auditor';
export type ActorId = PersonId | SecondaryId;

export type Person = {
  id: PersonId;
  name: string;
  first: string;
  initials: string;
  role: string;            // exact company role, as in the original app
  short: string;           // compact label for chips and graphs
  department: string;
  authority: number;       // authority level 1–5 from the original role model
  employeeId: string;      // grc.employees.id (NT) — used to align with the enterprise workspace
  hue: string;             // identity accent (avatars only; never used to encode risk state)
  owns: string[];          // what this person is accountable for at NOVATECH
  stage: string;           // what they do in the live classroom demonstration
  slides: string;          // earlier presentation split
  spoken: string;          // default spelling for non-Indian voices (speech only)
};

export type SecondaryPerson = {
  id: SecondaryId; name: string; initials: string; role: string; department: string; note: string;
  /** grc.employees.id when this person has a sign-in account in the enterprise workspace. */
  employeeId?: string;
};

export const TEAM: Person[] = [
  {
    id: 'karan', name: 'Karan Deshmukh', first: 'Karan', initials: 'KD',
    role: 'Project Manager / Risk Coordinator', short: 'Risk Coordinator', department: 'Risk Management & PMO', authority: 3,
    employeeId: 'f0eb01ac-356b-417c-8aae-05b7c13615dd', hue: '#7FB2FF',
    owns: ['Risk programme and register', 'Incident ownership and closure', 'Coordination of every handoff', 'Owner of the demonstration MacBook'],
    stage: 'Opens the case, acknowledges the alert, closes the risk and gives the final demonstration.',
    slides: 'Slides 1 and 8–9', spoken: 'Curran Desh-mookh',
  },
  {
    id: 'vijay', name: 'Vijay Bhosale', first: 'Vijay', initials: 'VB',
    role: 'RSSI / CISO', short: 'CISO', department: 'Cybersecurity (RSSI office)', authority: 4,
    employeeId: '95718b0b-2b78-475c-bb62-ae8c261df445', hue: '#35D6C1',
    owns: ['Security policy and risk appetite for cyber risk', 'Security authorisation of disruptive actions', 'Independent technical verification (never of his own execution)'],
    stage: 'Explains security governance, authorises the security side of the response and verifies the evidence.',
    slides: 'Slides 2–3', spoken: 'Vee-jay Bho-saa-lay',
  },
  {
    id: 'vandana', name: 'Vandana Madem', first: 'Vandana', initials: 'VM',
    role: 'Chief Executive Officer', short: 'CEO', department: 'Executive Management', authority: 5,
    employeeId: '01164889-61d4-4853-9b70-ae0653666e58', hue: '#E0B8FF',
    owns: ['Company-level decisions', 'Executive authorisation of high-impact actions (≥ €100,000)', 'Dual control with the CISO or CFO'],
    stage: 'Takes the executive decision: approve the treatment or return it for revision.',
    slides: 'Slide 6', spoken: 'Van-da-naa Ma-dem',
  },
  {
    id: 'nandini', name: 'Nandini Vadlamudi', first: 'Nandini', initials: 'NV',
    role: 'Cybersecurity Analyst', short: 'Cyber Analyst', department: 'Security Operations (SOC)', authority: 2,
    employeeId: '9bbce94b-f06a-44fe-8474-ac82a441153e', hue: '#5FD3F3',
    owns: ['Detection and triage', 'Incident investigation', 'Cybersecurity action plan'],
    stage: 'Investigates the alert, establishes technical reality and proposes the treatment.',
    slides: 'Slide 4', spoken: 'Nan-di-nee Vad-la-mu-dee',
  },
  {
    id: 'srija', name: 'Srija Poudapally', first: 'Srija', initials: 'SP',
    role: 'Finance Director (CFO / DAF)', short: 'CFO', department: 'Finance', authority: 4,
    employeeId: 'ee54158e-d9a8-4c34-bcfb-4d58ebf19e60', hue: '#FFCA70',
    owns: ['Financial impact assessment', 'Payment controls and dual control on payments', 'Finance action plan'],
    stage: 'Puts a number on the exposure and decides how financial loss is contained.',
    slides: 'Slide 5', spoken: 'Shree-jaa Pow-duh-pul-lee',
  },
  {
    id: 'pavan', name: 'Pavan Sanam', first: 'Pavan', initials: 'PS',
    role: 'IT Operations Manager', short: 'IT Ops Manager', department: 'IT Operations', authority: 3,
    employeeId: '5eaf3b6d-ea45-4fbb-97c2-435c726772c0', hue: '#9FE6A0',
    owns: ['Authorised technical execution only', 'Infrastructure, endpoints and failover', 'The final remote request from his Windows laptop to Karan’s Mac'],
    stage: 'Executes only what was authorised, then requests the final power-off for re-imaging from his Windows laptop.',
    slides: 'Slide 7', spoken: 'Pa-van Sa-num',
  },
];

/** Fictional NOVATECH employees from the original application. Not Group 1 members — always labelled as such. */
export const SECONDARY: SecondaryPerson[] = [
  { id: 'thomas', employeeId: 'b60c0017-ff26-4f13-8072-345b06a4a542', name: 'Thomas Bernard', initials: 'TB', role: 'Systems Administrator', department: 'IT Operations', note: 'Deputy executor when the IT Operations Manager is unavailable' },
  { id: 'lea', employeeId: 'ac24d122-e6bf-4c2f-a39d-accd18990b15', name: 'Léa Moreau', initials: 'LM', role: 'Accounts Payable Officer', department: 'Finance', note: 'Executes payment holds in the ERP in the original enterprise scenarios' },
  { id: 'camille', employeeId: '93389048-d7f2-4d6a-bba9-176a8f260376', name: 'Camille Laurent', initials: 'CL', role: 'HR Manager', department: 'Human Resources', note: 'Consulted on hiring and awareness actions' },
  { id: 'julie', employeeId: '45510b93-3dc6-48ff-8362-70f1020b0f6d', name: 'Julie Martin', initials: 'JM', role: 'Service Delivery Manager', department: 'Delivery', note: 'Informed when client service levels are affected' },
  { id: 'sophie', name: 'Sophie Girard', initials: 'SG', role: 'Compliance Manager', department: 'Legal & Compliance', note: 'Consulted on GDPR / NIS2 notification clocks' },
  { id: 'marc', name: 'Marc Dubois', initials: 'MD', role: 'Procurement / Vendor Manager', department: 'Procurement', note: 'Consulted on supplier and cloud-provider contracts' },
  { id: 'auditor', employeeId: 'd6bd929e-5ceb-450e-b7dc-c6ad2ca18ab3', name: 'Internal Auditor', initials: 'IA', role: 'Internal Auditor (read-only)', department: 'Audit', note: 'Professor access: can read everything, can sign nothing' },
];

export const TEAM_IDS = TEAM.map(p => p.id);
export const person = (id: PersonId): Person => TEAM.find(p => p.id === id)!;
export const isPersonId = (v: unknown): v is PersonId => typeof v === 'string' && (TEAM_IDS as string[]).includes(v);
export function actorName(id: ActorId | 'system'): string {
  if (id === 'system') return 'Synthetic monitoring feed';
  const p = TEAM.find(x => x.id === id) ?? SECONDARY.find(x => x.id === id);
  return p ? p.name : String(id);
}
export function actorRole(id: ActorId | 'system'): string {
  if (id === 'system') return 'System';
  const p = TEAM.find(x => x.id === id) ?? SECONDARY.find(x => x.id === id);
  return p ? p.role : '';
}

/** Default classroom speaking order (editable in Presenter Mode). */
export const DEFAULT_RELAY: { person: PersonId; segment: string; focus: string }[] = [
  { person: 'karan', segment: 'Introduction', focus: 'NOVATECH’s growth, the new risks it creates and why Sentinel exists.' },
  { person: 'vijay', segment: 'Security leadership', focus: 'Risk scoring, appetite thresholds and why segregation of duties matters.' },
  { person: 'nandini', segment: 'Cybersecurity investigation', focus: 'The alert, the affected endpoint and the technical evidence.' },
  { person: 'srija', segment: 'Financial analysis', focus: 'The modelled exposure, payment continuity and the finance action plan.' },
  { person: 'vandana', segment: 'Executive approval', focus: 'Approve the treatment or return it for revision; scope and authority.' },
  { person: 'pavan', segment: 'IT execution', focus: 'Execute only what was authorised; the remote request from Windows.' },
  { person: 'karan', segment: 'Final demonstration and conclusion', focus: 'Verification, closure, the Mac owner’s decision and the after-action report.' },
];
