/**
 * Run-of-show library for Presenter Mode. Each scene opens a real Sentinel screen, spotlights real
 * controls (data-tour targets) and can drive the real incident engine ("Do it for me") through the
 * same owner and separation-of-duties checks as a manual click.
 */
import type { PersonId } from '../data/team.ts';
import type { GateKey, ScenarioId } from '../data/scenarios.ts';
import type { Duration, ShowId } from './model.ts';

export type SceneAct =
  | { kind: 'scenario'; scenario: ScenarioId }
  | { kind: 'start' }
  | { kind: 'gate'; gate: Exclude<GateKey, 'authorize'> }
  | { kind: 'approve'; step: 'security' | 'executive' }
  | { kind: 'return'; step: 'security' | 'executive' }
  | { kind: 'unavailable'; person: PersonId }
  | { kind: 'available'; person: PersonId };

export type Beat = { target: string; caption: string };
export type Scene = {
  id: string; title: string; speaker: PersonId; segment: string; route: string; weight: number;
  say: string; keywords: string[]; show: string; click: string; expected: string; why: string;
  question: { q: string; a: string }; fallback: string; nova?: string; handoff?: string;
  beats: Beat[]; acts?: SceneAct[];
  /** Actions that run as the scene opens (when the incident is exactly where the scene starts). */
  enter?: SceneAct[];
  /** Incident state this scene expects on entry; the console offers a recorded fast-forward when behind. */
  needs?: { scenario: ScenarioId; gate: GateKey | 'ready' | 'closed' };
};

const S: Record<string, Scene> = {
  welcome: {
    id: 'welcome', title: 'NOVATECH Sentinel — the enterprise nervous system', speaker: 'karan', segment: 'Introduction', route: '/', weight: 1,
    say: 'Good morning. NOVATECH Services has 85 people in Angers, Nantes and Rennes, 230 clients and 35 % growth, with 25 more hires coming. Growth like that creates risk faster than a spreadsheet can follow. Sentinel connects every signal to an owner, an authority and a proof.',
    keywords: ['85 people · 3 offices', '230 clients', 'cloud dependence', 'growth creates exposure', 'owner · authority · proof'],
    show: 'The atlas: three offices, the cloud regions, the bank, suppliers and client clusters.',
    click: 'Point at Angers, Nantes and Rennes, then click “Enter Command Center”.',
    expected: 'The Command Center opens with today’s posture.',
    why: 'In ten seconds the audience knows the company and why governance matters.',
    question: { q: 'Is this real company data?', a: 'NOVATECH is the fictional ESAIP case. The register R1–R8 comes from our Group 1 analysis; incidents, telemetry and money figures are simulated and labelled as such.' },
    fallback: 'If the animation is slow, click “Skip intro” under the map (or set Motion to Reduced in Settings) — the static map tells the same story.',
    nova: 'Welcome to NOVATECH Sentinel. Your organization, its people and its risks, connected.',
    handoff: 'Vijay will show you how we decide what is acceptable.',
    beats: [{ target: 'atlas', caption: 'Three offices on the Loire, one cloud dependency, 230 clients' }, { target: 'landing-facts', caption: 'The case facts that drive our risk profile' }, { target: 'enter-cta', caption: 'Enter Command Center' }],
  },
  team: {
    id: 'team', title: 'Six people, six authorities, one chain of custody', speaker: 'karan', segment: 'Introduction', route: '/team', weight: 0.8,
    say: 'Each of us plays our real NOVATECH role, and the platform enforces what that role may do. Vijay is our CISO, Vandana our CEO, Nandini our cybersecurity analyst, Srija our CFO and Pavan runs IT operations. Nobody approves their own request, and nobody verifies their own work.',
    keywords: ['RSSI / CISO', 'CEO', 'Cybersecurity analyst', 'CFO / DAF', 'IT Ops executes only'],
    show: 'The authority map: who detects, assesses, approves, executes and verifies.',
    click: 'Select a person on the map to show their gates.', expected: 'Their gates and limits light up.',
    why: 'Separation of duties is the control the professor will test first.',
    question: { q: 'Is the persona switch real authentication?', a: 'No. In the public demo it is a presentation convenience and is labelled as such. The enterprise workspace uses personal accounts and permissions enforced by the database.' },
    fallback: 'Name the six roles from the team strip on the landing page.', handoff: 'Vijay, over to you.',
    beats: [{ target: 'team-map', caption: 'Authority grouped by decision, not by job title' }, { target: 'team-rules', caption: 'Four rules the system enforces' }],
  },
  appetite: {
    id: 'appetite', title: 'Four risks sit outside the board’s appetite', speaker: 'vijay', segment: 'Security leadership', route: '/command', weight: 1.3,
    say: 'As CISO I start from appetite. We score likelihood times impact on a four-by-four scale; twelve or more is outside tolerance. Today that is cloud outage, account compromise, SLA capacity and supplier payment fraud — each with one accountable owner and a live indicator.',
    keywords: ['4 × 4 scale', 'appetite: 12+', 'top five exposures', 'KRIs', 'one owner per risk'],
    show: 'Top-five exposures and the heatmap.', click: 'Click R1 in the top-five list.', expected: 'R1: score 16, cloud availability 99.7 % (warning), owner Pavan Sanam.',
    why: 'Governance starts from an agreed tolerance, not from the crisis.',
    question: { q: 'Who owns R2?', a: 'Vijay Bhosale, as CISO, owns account compromise. Every risk has exactly one accountable owner, shown in the register and the RACI.' },
    fallback: 'Read the four red cells of the heatmap.', nova: 'Vijay, the board set the appetite. Show us where we stand.',
    beats: [{ target: 'cmd-top5', caption: 'Top five exposures, scored 1–16' }, { target: 'cmd-heatmap', caption: 'Likelihood × impact heatmap' }, { target: 'cmd-kri', caption: 'Key risk indicators against thresholds' }],
  },
  sod: {
    id: 'sod', title: 'Why segregation of duties matters', speaker: 'vijay', segment: 'Security leadership', route: '/team', weight: 0.9,
    say: 'The rule is simple and the system enforces it: the requester cannot approve, an approver cannot execute, and the executor cannot verify. From one hundred thousand euros, two different people must approve. If someone is away, delegation is recorded — and the same rules still apply to the deputy.',
    keywords: ['requester ≠ approver', 'approver ≠ executor', 'executor ≠ verifier', 'dual control from €100k', 'recorded delegation'],
    show: 'The rules panel and the RACI matrix.', click: 'Open the RACI view.', expected: 'One Accountable per activity.',
    why: 'It stops both fraud and honest mistakes.',
    question: { q: 'Is Vijay independent if he approved?', a: 'Independent of the execution, yes: Pavan executed, Vijay did not, and the gate enforces it. Not of the approval — the verification gate discloses that openly instead of hiding it, and the CEO’s separate authorization limits the risk. For full independence the gate can go to internal audit: the route changes, the rule stays.' },
    fallback: 'State the four rules verbally.', handoff: 'Now, what happens when an alert lands? Nandini.',
    beats: [{ target: 'team-rules', caption: 'Enforced, not decorative' }, { target: 'team-raci', caption: 'Responsible, Accountable, Consulted, Informed' }],
  },
  execView: {
    id: 'execView', title: 'What the CEO needs on one screen', speaker: 'vandana', segment: 'Executive approval', route: '/command', weight: 1,
    say: 'As CEO I do not read logs. I need three things: what is exposed in euros, what is waiting for my decision, and who is accountable. Sentinel puts the next authorized decision in one place, so nothing waits in someone’s inbox.',
    keywords: ['exposure in euros', 'decision waiting for me', 'accountable owner', 'one screen', 'no inbox delays'],
    show: 'The decision dock and the exposure panel.', click: 'Point at “Next authorized decision”.', expected: 'The dock names the person and the evidence needed.',
    why: 'Executives approve faster when the evidence is already assembled.',
    question: { q: 'What decisions need the CEO?', a: 'Any action with modelled exposure of €100,000 or more, any client-facing change, and any approval where the normal approver is also the requester.' },
    fallback: 'Describe the approval thresholds verbally.',
    beats: [{ target: 'cmd-decision', caption: 'One next decision, one owner' }, { target: 'cmd-top5', caption: 'Exposure ranked against the appetite' }],
  },
  alert: {
    id: 'alert', title: 'Attention — a critical ransomware signal', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 1.2,
    say: 'This is a synthetic EDR alert: twelve hundred files renamed in ninety seconds on a finance workstation in Angers. The alert tells us the asset, the modelled exposure and who must act first. The response clock is now running.',
    keywords: ['synthetic EDR alert', 'FIN-WS-07 · Angers', '€240,000 modelled', 'response clock', 'owner first'],
    show: 'The ATTENTION overlay: incident ID, asset, severity, exposure, responsible person, deadline.',
    click: 'The alert opens by itself when this scene starts. Read it out, then “Acknowledge” (or press Next).', expected: 'NT-SEC-041 is live; Angers turns red on the atlas; Karan is the required owner.',
    why: 'Detection without ownership is just noise.',
    question: { q: 'Is this a real EDR?', a: 'No — the feed is synthetic and labelled. Everything after the alert follows the platform’s real governance rules.' },
    fallback: 'If sound is blocked, read the caption — the overlay works silently.',
    beats: [{ target: 'inc-start', caption: 'Inject the synthetic signal' }, { target: 'inc-gates', caption: 'Seven accountable gates' }],
    acts: [{ kind: 'scenario', scenario: 'ransomware' }, { kind: 'start' }], needs: { scenario: 'ransomware', gate: 'ready' },
    enter: [{ kind: 'scenario', scenario: 'ransomware' }, { kind: 'start' }],
  },
  own: {
    id: 'own', title: 'A signal becomes an owned incident', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 0.7,
    say: 'Karan, as Risk Coordinator, takes ownership — that is gate one. Then the technical assessment comes to me. I preserve the evidence first, then check whether anything else is infected.',
    keywords: ['gate 1 · ownership', 'evidence first', 'memory capture', 'lateral movement', 'no spread yet'],
    show: 'The decision dock: next authorized person and the playbook note.', click: 'Hand over to Karan → Fill from playbook (triage, severity, category) → Take ownership and send to Nandini.',
    expected: 'Gate 1 sealed under Karan’s name; Nandini sees “From Karan” with the severity and her deadline.', why: 'Every incident needs one owner from minute one.',
    question: { q: 'Who owns the incident?', a: 'Karan Deshmukh, Risk Coordinator. Risk owners stay accountable for their risks; the incident owner coordinates the response.' },
    fallback: 'Use the “Do it for me” button in the console.',
    beats: [{ target: 'inc-handoff', caption: 'The alert arrives with its severity and a deadline' }, { target: 'inc-form', caption: 'Triage, severity and category — signed by the owner' }, { target: 'inc-ledger', caption: 'Sealed in the ledger' }],
    acts: [{ kind: 'gate', gate: 'detect' }], needs: { scenario: 'ransomware', gate: 'detect' },
  },
  assess: {
    id: 'assess', title: 'Establish technical reality', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 1.1,
    say: 'Indicators are confirmed on this one workstation; no other host shows them yet. I recommend isolating it from the network while keeping it powered on, because shutting it down would destroy the evidence in memory. That proposal is my request — so I can never approve it myself.',
    keywords: ['indicators confirmed', 'isolate, do not shut down', 'memory evidence', 'proposal = request', 'I cannot approve it'],
    show: 'Treatment options: isolate (chosen) versus shut down, wait or pay — with the reasons.', click: 'Hand over to Nandini → Fill from playbook (severity, spread, techniques, evidence, treatment) → Sign and send to Srija.',
    expected: 'Gate 2 sealed with the full form; Srija receives it with a 45-minute deadline.', why: 'The safest effective treatment, not the most dramatic one.',
    question: { q: 'Why not just shut the workstation down?', a: 'Shutting down destroys volatile memory — attacker processes, sometimes keys — and does nothing about other infected hosts. Isolation contains the spread and keeps the evidence.' },
    fallback: 'Read the “Options considered” panel aloud.', handoff: 'Srija, what does this cost us?',
    beats: [{ target: 'inc-form', caption: 'Severity, spread, techniques and evidence' }, { target: 'inc-options', caption: 'Options rejected — and why' }, { target: 'inc-route', caption: 'Signed and sent to Srija, with a deadline' }],
    acts: [{ kind: 'gate', gate: 'assess' }], needs: { scenario: 'ransomware', gate: 'assess' },
  },
  impact: {
    id: 'impact', title: '€240,000 of modelled exposure', speaker: 'srija', segment: 'Financial analysis', route: '/incident', weight: 1.6,
    say: 'I translate the incident into money. The modelled maximum is two hundred and forty thousand euros: payroll delay, supplier penalties and recovery effort. Payroll runs in two days, so Finance switches to the offline backup file — that is in our finance action plan, with owners and deadlines.',
    keywords: ['€240k maximum', 'payroll in 2 days', 'backup payment file', 'finance action plan', '≈ €90k after treatment'],
    show: 'The exposure panel and the finance plan.', click: 'Hand over to Srija → Fill from playbook (low / likely / maximum, what makes up the €240k) → Sign and request approval.',
    expected: 'Gate 3 sealed; the approval route appears: Vijay, then Vandana.', why: 'Executives decide on money and continuity, not on file counts.',
    question: { q: 'What is the financial impact?', a: '€240,000 modelled maximum. After the approved isolation the residual score falls from 16 to 6, so the modelled exposure falls to about €90,000 — and only after execution.' },
    fallback: 'Quote the figures from the incident header.', handoff: 'Because it is above one hundred thousand euros, Vijay and Vandana must both decide.',
    beats: [{ target: 'inc-form', caption: 'Low, most likely, maximum — and what the €240k is made of' }, { target: 'inc-exposure', caption: 'Exposure before and after treatment' }, { target: 'inc-route', caption: 'Above €100k: Vijay, then Vandana' }],
    acts: [{ kind: 'gate', gate: 'impact' }], needs: { scenario: 'ransomware', gate: 'impact' },
  },
  authorize: {
    id: 'authorize', title: 'Authority before disruption', speaker: 'vandana', segment: 'Executive approval', route: '/incident', weight: 2.2,
    say: 'Two signatures are required. Vijay authorizes the security side of a disruptive action; then, because the exposure is above one hundred thousand euros, I decide as CEO. I can approve this scope, or send it back for revision — and if I do, nothing disruptive is allowed.',
    keywords: ['dual control', 'CISO, then CEO', 'scope: one workstation', 'approve or return', 'no ransom'],
    show: 'The approval route with its separation-of-duties checks.', click: 'Hand over to Vijay → Fill from playbook (his conditions) → Approve; then Vandana → Fill → Approve with her conditions.',
    expected: 'Gate 4 sealed by two different people; Pavan is next.', why: 'Disruption needs authority, and authority needs two keys.',
    question: { q: 'What happens if the CEO rejects it?', a: 'The treatment returns to Cybersecurity, approvals are cleared and execution stays blocked. The ledger shows who returned it and why — we can show it live.' },
    fallback: 'Use “Do it for me” twice in the console.', handoff: 'Pavan, you may execute — the authorized scope only.',
    beats: [{ target: 'inc-approvals', caption: 'Policy-routed approvals' }, { target: 'inc-conditions', caption: 'Each approval carries its conditions' }, { target: 'inc-sod', caption: 'Separation-of-duties checks, live' }],
    acts: [{ kind: 'approve', step: 'security' }, { kind: 'approve', step: 'executive' }], needs: { scenario: 'ransomware', gate: 'authorize' },
  },
  revision: {
    id: 'revision', title: 'Returned for revision — nothing moves', speaker: 'vandana', segment: 'Executive approval', route: '/incident', weight: 1,
    say: 'Let me show the other path. I return the treatment and ask for a narrower scope. Watch: the approvals are cleared, execution is blocked, and the proposal goes back to Nandini. Then the team resubmits and we approve the revised version.',
    keywords: ['return for revision', 'approvals cleared', 'execution blocked', 'back to assessment', 'resubmitted'],
    show: 'The gate rail moving back to “Cyber assessment”.', click: '“Return for revision” with a reason, then re-run gates 2 to 4.',
    expected: 'Revision count 1; ledger shows the return and the new approvals.', why: 'A “no” must be as well governed as a “yes”.',
    question: { q: 'Is the rejection recorded?', a: 'Yes — who returned it, when and why, in the chained ledger. The revision counter and the new approvals are visible too.' },
    fallback: 'Explain the path with the gate rail.',
    beats: [{ target: 'inc-gates', caption: 'Back to cybersecurity assessment' }, { target: 'inc-ledger', caption: 'The return is part of the record' }],
    acts: [{ kind: 'return', step: 'executive' }, { kind: 'gate', gate: 'assess' }, { kind: 'gate', gate: 'impact' }, { kind: 'approve', step: 'security' }, { kind: 'approve', step: 'executive' }],
    needs: { scenario: 'ransomware', gate: 'authorize' },
  },
  delegation: {
    id: 'delegation', title: 'If the CEO is unavailable', speaker: 'vandana', segment: 'Executive approval', route: '/incident', weight: 1,
    say: 'What if I am on a plane? My authority passes to Srija as acting CEO — recorded, time-boxed, and still checked: she did not request this action, so she may approve it. In the payment-fraud case she did request the hold, so the system refuses and the action stays blocked.',
    keywords: ['recorded delegation', 'acting CEO: CFO', 'same rules for deputies', 'blocked if conflicted', 'no silent bypass'],
    show: 'The approval card after marking Vandana unavailable.', click: '“Mark unavailable” on the CEO step, then mark her available again.',
    expected: 'The executive step shows “delegated to Srija Poudapally”.', why: 'Availability problems must not become control gaps.',
    question: { q: 'What happens if the responsible person is unavailable?', a: 'The policy names a deputy. The deputy inherits the authority, not an exemption: if the deputy requested, executes or already approved, the step is blocked instead.' },
    fallback: 'Explain the delegation rule from the team page.',
    beats: [{ target: 'inc-approvals', caption: 'Delegation recorded, checks re-run' }],
    acts: [{ kind: 'unavailable', person: 'vandana' }, { kind: 'available', person: 'vandana' }], needs: { scenario: 'ransomware', gate: 'authorize' },
  },
  execute: {
    id: 'execute', title: 'Execute exactly what was approved', speaker: 'pavan', segment: 'IT execution', route: '/incident', weight: 1.4,
    say: 'I execute only the authorized scope, under change ticket 0412: isolate this one workstation and suspend its privileged session — and I keep it powered on, as the CISO’s condition says, so the memory evidence survives. Here the execution is simulated. I approved nothing, so I may execute; because I executed, I may not verify.',
    keywords: ['authorized scope only', 'simulated execution', 'explicit consent', 'executor ≠ approver', 'executor ≠ verifier'],
    show: 'The execution card with its consent checkbox.', click: 'Hand over to Pavan → Fill from playbook (change ticket, steps, the approvers’ conditions) → Execute (simulated) and send to Vijay.',
    expected: 'Gate 5 sealed; exposure drops to about €90,000; Vijay is the verifier.', why: 'Execution is where good decisions usually go wrong.',
    question: { q: 'Could Pavan do more than approved?', a: 'Not in this workflow: the execution record states the approved scope and the verifier checks against it. In the enterprise workspace, execution is refused by the database before approval.' },
    fallback: 'Use “Do it for me” in the console.', handoff: 'Vijay verifies — he did not touch it.',
    beats: [{ target: 'inc-conditions', caption: 'The approvers’ conditions bind the execution' }, { target: 'inc-form', caption: 'Change ticket and the authorised steps (simulated)' }, { target: 'inc-exposure', caption: 'Exposure falls after execution' }],
    acts: [{ kind: 'gate', gate: 'execute' }], needs: { scenario: 'ransomware', gate: 'execute' },
  },
  verify: {
    id: 'verify', title: 'Separate execution from proof', speaker: 'vijay', segment: 'Security leadership', route: '/incident', weight: 0.8,
    say: 'I now check the evidence against my checklist: isolation confirmed, no new encryption for fifteen minutes, privileged session revoked, memory image verified. I did not execute this action, so my check is independent of the execution — and the screen discloses that I also gave the security authorization; Vandana approved separately. Only then can Karan close the risk.',
    keywords: ['independent check', 'evidence checklist', 'verifier ≠ executor', 'sealed', 'then closure'],
    show: 'The verification checklist.', click: 'Hand over to Vijay → Fill from playbook (checklist, method, result) → Sign and send to Karan.',
    expected: 'Gate 6 sealed by Vijay.', why: 'Trust needs proof from someone else.',
    question: { q: 'Can Pavan verify his own work?', a: 'No — the system refuses it. Try it: switch to Pavan and the verify button explains the rule.' },
    fallback: 'Read the checklist aloud.', handoff: 'Karan, the last gate is yours.',
    beats: [{ target: 'inc-form', caption: 'Checklist, method and result' }, { target: 'inc-sod', caption: 'Verifier ≠ executor' }],
    acts: [{ kind: 'gate', gate: 'verify' }], needs: { scenario: 'ransomware', gate: 'verify' },
  },
  close: {
    id: 'close', title: 'Close the loop, keep the risk visible', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/incident', weight: 0.8,
    say: 'I close the incident with the residual risk and the follow-up owners. The first follow-up is physical: power off the isolated laptop for imaging and re-imaging — now that its memory evidence is verified. Then restore from snapshot, a fourteen-day re-infection watch, and the overdue Finance phishing simulation. The ledger holds every decision, chained so that any edit would be detected.',
    keywords: ['residual score 6', 'power-off for re-imaging next', 'follow-up owners', 'overdue stays visible', 'chained ledger'],
    show: 'The closure record and the completed gate rail.', click: 'Hand over to Karan → Fill from playbook (residual risk, decision, follow-ups) → Sign and close.',
    expected: 'All seven gates sealed; the after-action report is ready.', why: 'Closing is a decision about remaining risk, not a celebration.',
    question: { q: 'Where is the audit history?', a: 'In the evidence ledger: every entry carries the fingerprint of the previous one, and we can recompute the chain live.' },
    fallback: 'Open the evidence ledger instead.',
    beats: [{ target: 'inc-form', caption: 'Residual risk, decision and follow-ups' }, { target: 'inc-gates', caption: 'Seven gates, seven owners' }, { target: 'inc-ledger', caption: 'The complete record' }],
    acts: [{ kind: 'gate', gate: 'close' }], needs: { scenario: 'ransomware', gate: 'close' },
  },
  ledger: {
    id: 'ledger', title: 'Where is the audit history?', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/evidence', weight: 0.7,
    say: 'Every entry carries the fingerprint of the one before it. I can recompute the chain now; if anyone edited a single word, verification would fail at that entry. In the public demo this ledger is local; in the enterprise workspace the database refuses edits and deletions.',
    keywords: ['SHA-256 chain', 'verify now', 'tamper-evident', 'export JSON', 'demo vs enterprise'],
    show: 'The ledger and its verification result.', click: '“Verify chain”, then “Export JSON”.', expected: 'Chain intact — N entries checked.',
    why: 'An audit trail you cannot recompute is just a log.',
    question: { q: 'Can someone edit the ledger?', a: 'Editing any entry breaks its hash and every hash after it; verification shows exactly where. In the enterprise database, updates and deletes are refused outright.' },
    fallback: 'Show the hashes on the incident page.',
    beats: [{ target: 'ledger-verify', caption: 'Recompute the chain' }, { target: 'ledger-list', caption: 'Actor, time, decision, fingerprint' }],
  },
  plans: {
    id: 'plans', title: 'Every department knows its next task', speaker: 'srija', segment: 'Financial analysis', route: '/response', weight: 0.9,
    say: 'Each department has its own plan for this incident — person, task, due time, evidence and rollback. The chart shows open, completed and overdue work across the company, including the backlog that existed before the incident. Nothing is “someone’s job”.',
    keywords: ['five department plans', 'owner + due time', 'evidence + rollback', 'open · done · overdue', 'scenario-specific'],
    show: 'Department plans and the task chart.', click: 'Open the Finance plan, then the chart.', expected: 'Tasks change status as gates complete.',
    why: 'Coordination fails in the gaps between departments.',
    question: { q: 'Are the plans the same for every incident?', a: 'No. Ransomware isolates an endpoint, a cloud outage fails over, payment fraud holds a payment — each with different owners, tasks and approvers.' },
    fallback: 'Describe one plan from memory.',
    beats: [{ target: 'plans-chart', caption: 'Open, completed and overdue' }, { target: 'plans-grid', caption: 'One plan per department' }],
  },
  macIntro: {
    id: 'macIntro', title: 'The last follow-up, on a real device', speaker: 'pavan', segment: 'IT execution', route: '/endpoint', weight: 1.4,
    say: 'One closure follow-up is physical: power off FIN-WS-07 for forensic imaging and re-imaging. We waited on purpose — the memory evidence had to be captured and verified first. For this demonstration Karan’s MacBook stands in for FIN-WS-07. From my Windows laptop I can only request it: Karan opens a five-minute pairing code on his Mac, I pair over our private Wi-Fi, and I send the request.',
    keywords: ['power-off for re-imaging', 'only after evidence is verified', 'Mac = stand-in for FIN-WS-07', 'request, never command', 'private Wi-Fi only'],
    show: 'Eligibility checks and the pairing card.',
    click: 'Real devices: Karan opens pairing on his own screen (the code never shows on the projector); Pavan pairs from Windows and sends the request. Rehearsal: console → Mac rehearsal → Open pairing → Pair → Send the request.',
    expected: 'The request reaches the Mac and its approval window opens there.', why: 'Physical actions need stronger controls than clicks.',
    question: { q: 'Why is shutdown necessary?', a: 'Not to stop the attack — isolation did that at gate 5 and kept the memory evidence. Once the memory image is verified, powering the laptop off stops anything still running on its disk and starts re-imaging. It is the last recovery step, and only the device owner can authorize it, on the device.' },
    fallback: 'If the classroom Wi-Fi blocks pairing, use the Mac rehearsal in the console — it is labelled simulated.',
    handoff: 'Karan, your Mac is asking you.',
    beats: [{ target: 'ep-eligibility', caption: 'Unlocked only after all seven gates' }, { target: 'ep-pairing', caption: 'Owner-opened pairing · request only' }],
    needs: { scenario: 'ransomware', gate: 'closed' },
  },
  macApprove: {
    id: 'macApprove', title: 'Final step: the owner decides', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/endpoint', weight: 1.2,
    say: 'My Mac shows its own window: who is asking, for which incident, why, and a thirty-second countdown. Reject is the default — if I ignore it or close it, nothing happens, and that is the safe outcome. Now I authorize it. That is NOVATECH Sentinel: see the threat, own the decision, prove the response. Thank you.',
    keywords: ['native window on the Mac', 'Reject is the default', '30-second timeout', 'the owner authorizes', 'see · own · prove'],
    show: 'The approval window, then the power-off.',
    click: 'Real devices: Karan clicks Authorize on the Mac — it shuts down and the show ends there. Rehearsal: Authorize in the console Mac rehearsal; the projector plays the power-off.',
    expected: 'The screen goes dark: powered off by its owner.', why: 'Final control stays with the device owner.',
    question: { q: 'Can Pavan shut down Karan’s Mac?', a: 'No. He can only send a request, inside a paired 30-minute session on the private Wi-Fi. The Mac’s own window decides: Reject is the default, 30 seconds without an answer is a rejection, and every failure keeps the Mac on. Nothing happens automatically.' },
    fallback: 'If the real window does not appear within 30 seconds, say so and finish with the rehearsal on the projector.',
    beats: [{ target: 'ep-native|ep-pairing', caption: 'Reject is the default' }, { target: 'ep-safety', caption: 'Every failure keeps the Mac on' }],
    needs: { scenario: 'ransomware', gate: 'closed' },
  },
  report: {
    id: 'report', title: 'Who did what — and what remains', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/report', weight: 1,
    say: 'The after-action report traces who detected, assessed, approved, executed, verified and closed — with the evidence and the residual risk. It is the page we would give the board on Monday morning.',
    keywords: ['causal trace', 'six names', 'residual risk', 'lessons learned', 'board-ready'],
    show: 'The causal trace and the residual-risk panel.', click: 'Scroll from the trace to the lessons.', expected: 'A sober report, not a celebration.',
    why: 'The record is the deliverable.',
    question: { q: 'What risk remains?', a: 'Residual score 6 for this scenario, plus open follow-ups with named owners and dates. They stay visible on the Command Center.' },
    fallback: 'Read the summary block.',
    beats: [{ target: 'rep-trace', caption: 'Detect → assess → approve → execute → verify → close' }, { target: 'rep-residual', caption: 'What remains, and who owns it' }],
  },
  thanks: {
    id: 'thanks', title: 'See the threat. Own the decision. Prove the response.', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/command', weight: 0.5,
    say: 'That is NOVATECH Sentinel: one platform where every signal finds its owner, every decision its authority and every action its proof. Thank you — we are happy to take your questions.',
    keywords: ['one platform', 'owner', 'authority', 'proof', 'questions'],
    show: 'The closed incident on the Command Center.', click: 'Press Q for professor questions.', expected: 'Questions open without losing your place.',
    why: 'End on the promise, then prove it under questioning.',
    question: { q: 'What would you build next?', a: 'Real identity integration, connectors to an actual EDR and cloud monitor, and push notifications to owners’ phones — all with the same governance rules.' },
    fallback: 'Stay on this screen for questions.', nova: 'Thank you. The team is ready for your questions.',
    beats: [{ target: 'cmd-proofbar', caption: 'Seven gates, seven signatures' }],
  },
  register: {
    id: 'register', title: 'Eight risks, eight accountable owners', speaker: 'karan', segment: 'Introduction', route: '/risks', weight: 1,
    say: 'Our analysis produced a register of eight risks. R1 to R6 come from the case; we added R7 and R8 for Finance. Each risk has a likelihood and an impact on a four-by-four scale, exactly one accountable owner, a key indicator and a target. Four of them are critical today, led by the cloud outage at sixteen.',
    keywords: ['R1–R8', 'likelihood × impact, 1–4', 'one accountable owner', 'KRI and target', '4 critical'],
    show: 'The register: score, owner, indicator and treatment for each risk.', click: 'Point at R1 (16, Pavan), R2 (12, Vijay) and R7 (12, Srija).',
    expected: 'The audience sees owners from our six roles and from the case’s fictional managers.', why: 'Ownership is the foundation of every later decision.',
    question: { q: 'Who owns this risk?', a: 'Every risk has exactly one accountable owner: R1 Pavan Sanam, R2 Vijay Bhosale, R7 and R8 Srija Poudapally; R3 to R6 belong to the case’s HR, Delivery, Procurement and Compliance managers.' },
    fallback: 'Read the top five from the Command Center instead.',
    beats: [{ target: 'sel:.ent-root .card', caption: 'Eight risks · one accountable owner each' }],
  },
  ebios: {
    id: 'ebios', title: 'EBIOS Risk Manager: what we expected', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/ebios', weight: 1.1,
    say: 'Before any alert, our EBIOS Risk Manager study — the ANSSI method, in five workshops — told us what to fear. The worst feared event is rated critical, G4: theft of client personal data. Three operational scenarios came out of it, including an attack through a finance workstation. That is exactly the kind of signal I am about to receive.',
    keywords: ['ANSSI · EBIOS RM', 'five workshops', 'worst feared event: G4', '3 operational scenarios', '2 residual risks to accept'],
    show: 'Workshop 1: business values, supporting assets, feared events, security baseline.', click: 'Point at the five workshops, then the feared-events table.',
    expected: 'Gravity G4 to G2, with the assets behind each business value.', why: 'A recognised method, applied to our own case.',
    question: { q: 'Why EBIOS RM?', a: 'It is the ANSSI method French organisations use. It starts from business values and attacker scenarios and is consistent with ISO 31000 and ISO 27005 risk treatment.' },
    fallback: 'Describe the five workshops from the stepper.',
    beats: [{ target: 'stats', caption: 'Gravity, scenarios and residual risks at a glance' }, { target: 'card:Feared events', caption: 'Feared events rated G1 to G4' }],
  },
  compliance: {
    id: 'compliance', title: 'One control set, four frameworks', speaker: 'vijay', segment: 'Security leadership', route: '/compliance', weight: 1.1,
    say: 'Compliance is where security meets the law and our clients. We trace every requirement of ISO 27001, NIS2, GDPR and DORA to the controls that satisfy it: seventy percent overall, NIS2 the strongest. One control, one test, and the evidence is reused everywhere it applies.',
    keywords: ['ISO 27001 · NIS2 · GDPR · DORA', '70 % overall', 'test once, comply many', 'evidence reused', '3 controls failing'],
    show: 'Coverage per framework, then the crosswalk.', click: 'Point at the four framework cards, then scroll to the crosswalk.',
    expected: 'Met, partial and gap counts per framework.', why: 'Clients ask for proof, not promises.',
    question: { q: 'Is NOVATECH subject to NIS2?', a: 'Likely, as a managed ICT service provider, once France transposes the directive — so we prepare now. DORA applies indirectly through our financial-sector clients, and GDPR applies already.' },
    fallback: 'Quote the coverage figures from the cards.',
    beats: [{ target: 'stats', caption: 'Coverage · effective controls · monitoring' }, { target: 'sel:.cx-fw-grid', caption: 'ISO 27001 · NIS2 · GDPR · DORA' }],
  },
  controls: {
    id: 'controls', title: 'Controls that prove themselves', speaker: 'vijay', segment: 'Security leadership', route: '/controls', weight: 1,
    say: 'Twenty-five controls, each with an owner, a test schedule and a measured effect on the risks it reduces. Eleven operate effectively and three are failing or warning right now. Monitoring reads real records — every approval is checked for segregation of duties, and the ledger chain is recomputed.',
    keywords: ['25 controls', '11 effective', '3 failing or warning', 'owner and test date', 'monitoring reads records'],
    show: 'The controls library with owners and latest results.', click: 'Point at the three failing controls, then at C-02 segregation of duties.',
    expected: 'Each control shows its owner, its last result and its next test.', why: 'A control nobody tests is a hope, not a control.',
    question: { q: 'How do you know a control works?', a: 'Each control has a test; ten are monitored continuously from the platform’s own records — segregation of duties, for example, is checked against every approval.' },
    fallback: 'Read the four figures at the top.',
    beats: [{ target: 'stats', caption: '25 controls · 11 effective · 3 failing' }, { target: 'sel:.ent-root .card', caption: 'Owner, latest result and next test' }],
  },
  quant: {
    id: 'quant', title: 'The register in euros', speaker: 'srija', segment: 'Financial analysis', route: '/quant', weight: 1.6,
    say: 'As CFO I translate risk into money. Each risk’s frequency and loss range is simulated ten thousand times. We expect about six hundred thousand euros of loss a year, and a one-in-ten-year loss of one point one million — inside our combined appetite of one point four million, but three categories are over their own limits. Our controls already avoid nearly six hundred thousand euros a year.',
    keywords: ['FAIR · 10,000 simulations', '≈ €606k expected per year', '1-in-10-year: €1.1M', 'appetite €1.4M', 'controls avoid ≈ €594k'],
    show: 'Expected loss, the loss-exceedance curve and appetite by category.', click: 'Point at the curve, then the three categories marked “Outside”.',
    expected: 'Cyber and data, financial fraud and operational resilience are over their limits.', why: 'Boards decide in euros, not in colours.',
    question: { q: 'Where do the loss ranges come from?', a: 'Calibrated expert ranges for the fictional case (Beta-PERT), not historical loss data — the page says so. The method is FAIR-style: frequency times magnitude, simulated 10,000 times.' },
    fallback: 'Quote the four figures at the top.',
    beats: [{ target: 'stats', caption: 'Expected loss · 1-in-10-year loss · value of controls' }, { target: 'card:Loss exceedance curve', caption: 'Probability that annual loss exceeds each amount' }, { target: 'card:Appetite by category', caption: 'Three categories over their limit' }],
  },
  board: {
    id: 'board', title: 'What the board must decide', speaker: 'vandana', segment: 'Executive approval', route: '/board', weight: 1,
    say: 'This is the pack I take to the board: the risk profile, the exposure in euros, compliance, controls, incidents and continuity — generated from the same records, with the audit ledger recomputed at the moment it was produced. It ends with the decisions we need from the board.',
    keywords: ['board pack, Q4', 'same records', 'ledger verified at generation', 'exposure in euros', 'decisions requested'],
    show: 'The executive summary and the decisions requested.', click: 'Point at the executive summary, then scroll to “Decisions requested from the Board”.',
    expected: 'One report, built from live records, ending in decisions.', why: 'Governance ends in decisions with names and dates.',
    question: { q: 'Is the board report written by hand?', a: 'No — it is generated from the workspace records when opened, and the audit chain is recomputed at generation; the result is printed on the cover.' },
    fallback: 'Summarise the executive summary verbally.',
    beats: [{ target: 'h:Executive summary', caption: 'Executive summary' }, { target: 'h:Decisions requested from the Board', caption: 'Decisions requested from the board' }],
  },
  vendors: {
    id: 'vendors', title: 'What our suppliers can cost us', speaker: 'srija', segment: 'Financial analysis', route: '/vendors', weight: 1,
    say: 'We spend about one point three million euros a year with ten suppliers, and three of them are critical. Two contracts have expired and two critical or high-tier suppliers have no exit plan — including our finance ERP. Each supplier is tiered, scored and linked to the processes it can stop, and the DORA register exports from here.',
    keywords: ['10 suppliers · €1.3M a year', '3 critical', '2 contracts expired', '2 without exit plan', 'DORA register'],
    show: 'Exposure by tier and the suppliers that need attention.', click: 'Point at the critical tier, then at “Needs attention”.',
    expected: 'Supplier risk is measured like any other risk.', why: 'Our weakest supplier is part of our attack surface.',
    question: { q: 'Why does Finance care about suppliers?', a: 'Because supplier failure and supplier fraud both end in money: a stopped ERP stops payments, and a fake bank-detail change is how R7 happens. Contracts, exit plans and callbacks are financial controls.' },
    fallback: 'Read the figures at the top of the page.',
    beats: [{ target: 'stats', caption: '10 suppliers · 3 critical · 2 without exit plan' }, { target: 'card:Exposure by tier', caption: 'Inherent → residual risk per supplier' }],
  },
  continuity: {
    id: 'continuity', title: 'If the cloud stops: continuity', speaker: 'pavan', segment: 'IT execution', route: '/continuity', weight: 1.4,
    say: 'I own R1, the cloud outage. Our business impact analysis gives every process a recovery time and a data-loss objective. Two processes are tier one: identity, and client hosting. Our last client-hosting test took six hours against a four-hour objective, and the identity provider is a single point of failure for four processes.',
    keywords: ['BIA · RTO / RPO', 'tier 1: identity + client hosting', 'last test: 6 h vs 4 h', 'single point of failure', 'ERP supplier: no exit plan'],
    show: 'The dependency map and the impact analysis.', click: 'Point at the red dashed links, then at the missed 6 h vs 4 h bar.',
    expected: 'The weak points are visible before an incident finds them.', why: 'Recovery you have not tested is a guess.',
    question: { q: 'What is your weakest point?', a: 'The identity provider: four processes depend on it, including both tier-1 processes. And the ERP supplier has no exit plan behind supplier payments.' },
    fallback: 'Read the five figures at the top.',
    beats: [{ target: 'stats', caption: 'Tiers, missed objectives, single points of failure' }, { target: 'card:Dependency map', caption: 'Red dashed links: single points of failure' }, { target: 'card:Business impact analysis', caption: 'Recovery achieved against the objective' }],
  },
  // Cloud outage
  cloudAlert: {
    id: 'cloudAlert', title: 'The client portal is failing', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 1.2,
    say: 'The API error rate just jumped to over seven percent and sixty-one client accounts see failures. Before anyone touches the infrastructure, my job is to rule out an attack.',
    keywords: ['error rate 7.4 %', '61 clients', 'recurring revenue', 'rule out an attack', 'response clock'],
    show: 'The alert overlay and the cloud node on the atlas.', click: 'The alert opens by itself when this scene starts. Read it out, then Acknowledge.', expected: 'NT-OPS-018 live; the primary cloud region turns red.',
    why: '70 % of revenue is recurring service.', question: { q: 'Is this a cyberattack?', a: 'That is exactly gate two: traffic analysis shows no attack pattern and the provider reports a regional fault.' },
    fallback: 'Read the overlay.', beats: [{ target: 'inc-start', caption: 'Synthetic availability alert' }],
    acts: [{ kind: 'scenario', scenario: 'cloud' }, { kind: 'start' }, { kind: 'gate', gate: 'detect' }], needs: { scenario: 'cloud', gate: 'ready' },
    enter: [{ kind: 'scenario', scenario: 'cloud' }, { kind: 'start' }],
  },
  cloudAssess: {
    id: 'cloudAssess', title: 'Not an attack — a regional fault', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 1,
    say: 'No volumetric spike and a normal source mix: this is not a DDoS. The provider reports a storage fault, and our standby region is in sync. I propose a controlled failover of the client portal only.',
    keywords: ['no DDoS pattern', 'provider fault', 'standby in sync', 'failover proposed', 'logs preserved'],
    show: 'Treatment and rejected options.', click: 'Record cyber assessment.', expected: 'Gate 2 sealed.', why: 'Failing over during an attack can spread it.',
    question: { q: 'Why not roll back?', a: 'No release in 48 hours — the fault is on the provider side.' }, fallback: 'Read the options panel.',
    beats: [{ target: 'inc-options', caption: 'Why failover and not shutdown' }], acts: [{ kind: 'gate', gate: 'assess' }], needs: { scenario: 'cloud', gate: 'assess' },
  },
  cloudImpact: {
    id: 'cloudImpact', title: '€110,000 of SLA exposure', speaker: 'srija', segment: 'Financial analysis', route: '/incident', weight: 1,
    say: 'Service credits for sixty-one clients plus revenue at risk: one hundred and ten thousand euros. The standby uplift costs about two thousand euros a day — cheap compared with a breached SLA.',
    keywords: ['€110k exposure', 'service credits', 'recurring revenue', 'standby cost', 'inside the 4 h RTO'],
    show: 'Exposure panel.', click: 'Record financial impact.', expected: 'Route: Vijay, then Vandana.', why: 'The cheapest fix is the one inside the SLA.',
    question: { q: 'Why does the CEO decide?', a: 'Client-facing change with exposure above €100,000.' }, fallback: 'Quote the figures.',
    beats: [{ target: 'inc-exposure', caption: 'Credits and revenue at risk' }], acts: [{ kind: 'gate', gate: 'impact' }], needs: { scenario: 'cloud', gate: 'impact' },
  },
  cloudAuthorize: {
    id: 'cloudAuthorize', title: 'Security sign-off, then the CEO', speaker: 'vandana', segment: 'Executive approval', route: '/incident', weight: 1.2,
    say: 'Vijay confirms the failover does not hide an attack and that logs are preserved. Then I authorize the client-facing switch and the client communication within thirty minutes.',
    keywords: ['CISO sign-off', 'logs preserved', 'CEO authorizes', 'client communication', 'scoped failover'],
    show: 'Approval route.', click: 'Approve as Vijay, then as Vandana.', expected: 'Gate 4 sealed; Pavan executes.', why: 'Client-facing change is a business decision.',
    question: { q: 'Who informs clients?', a: 'Julie Martin, Service Delivery, informs key accounts; the CEO is accountable for the message.' }, fallback: 'Use “Do it for me”.',
    beats: [{ target: 'inc-approvals', caption: 'Two decisions, two people' }], acts: [{ kind: 'approve', step: 'security' }, { kind: 'approve', step: 'executive' }], needs: { scenario: 'cloud', gate: 'authorize' },
  },
  cloudExecute: {
    id: 'cloudExecute', title: 'Controlled failover, then proof', speaker: 'pavan', segment: 'IT execution', route: '/incident', weight: 1.1,
    say: 'I switch the client portal to the standby region — simulated here. Vijay then verifies independently: error rate back under half a percent, latency normal, data consistent with the last replication point.',
    keywords: ['simulated failover', 'health checks green', 'independent verification', 'data consistency', 'fail-back plan'],
    show: 'Execution then verification.', click: 'Execute as Pavan; verify as Vijay.', expected: 'Gates 5 and 6 sealed.', why: 'Recovery is only real once someone else confirms it.',
    question: { q: 'What if the failover fails?', a: 'Rollback is documented: stay on primary in degraded mode and escalate to the provider.' }, fallback: 'Use “Do it for me”.',
    beats: [{ target: 'inc-workbench', caption: 'Execute, then verify' }], acts: [{ kind: 'gate', gate: 'execute' }, { kind: 'gate', gate: 'verify' }], needs: { scenario: 'cloud', gate: 'execute' },
  },
  cloudClose: {
    id: 'cloudClose', title: 'Fail back, review the provider', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/incident', weight: 0.9,
    say: 'I close with residual risk six and three follow-ups: fail back after the provider fix, a provider review with Procurement, and a quarterly failover test so that next time it is rehearsed, not discovered.',
    keywords: ['residual 6', 'fail back', 'provider review', 'quarterly test', 'R1 and R4 updated'],
    show: 'Closure and follow-ups.', click: 'Close as Karan.', expected: 'All gates sealed.', why: 'Lessons only count if they become tasks.',
    question: { q: 'Which register risks move?', a: 'R1 cloud outage and R4 SLA capacity.' }, fallback: 'Read the lessons.',
    beats: [{ target: 'inc-gates', caption: 'Closed with owners for every follow-up' }], acts: [{ kind: 'gate', gate: 'close' }], needs: { scenario: 'cloud', gate: 'close' },
  },
  // Payment fraud
  fraudAlert: {
    id: 'fraudAlert', title: 'New bank details, one day before payment', speaker: 'srija', segment: 'Financial analysis', route: '/incident', weight: 1.2,
    say: 'A “supplier” asked Accounts Payable to change their bank details the day before an eighty-five-thousand-euro payment. Our payment rule caught it. Karan takes ownership and Nandini checks the mailbox.',
    keywords: ['IBAN changed < 24 h', '€85,000 line', 'payment rule', 'business email compromise', 'owner first'],
    show: 'The alert overlay; the bank node on the atlas.', click: 'The alert opens by itself when this scene starts. Read it out, then Acknowledge.', expected: 'NT-FIN-027 live.',
    why: 'Fraud is fastest just before money moves.', question: { q: 'Is this cyber or finance?', a: 'Both — that is why Cybersecurity assesses the mailbox and Finance owns the payment decision.' },
    fallback: 'Read the overlay.', beats: [{ target: 'inc-start', caption: 'Synthetic payment-rule alert' }],
    acts: [{ kind: 'scenario', scenario: 'payments' }, { kind: 'start' }, { kind: 'gate', gate: 'detect' }], needs: { scenario: 'payments', gate: 'ready' },
    enter: [{ kind: 'scenario', scenario: 'payments' }, { kind: 'start' }],
  },
  fraudAssess: {
    id: 'fraudAssess', title: 'A look-alike domain and a hidden rule', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/incident', weight: 1,
    say: 'The email comes from a look-alike domain, and the Accounts Payable mailbox has a new forwarding rule created from an unusual sign-in. These are the signs of business email compromise. I recommend holding the payment and resetting the mailbox.',
    keywords: ['look-alike domain', 'forwarding rule', 'unusual sign-in', 'BEC', 'hold + reset'],
    show: 'Assessment and options.', click: 'Record cyber assessment.', expected: 'Gate 2 sealed; Srija next.', why: 'Evidence before money decisions.',
    question: { q: 'Why not cancel the whole batch?', a: 'That penalises 40 legitimate suppliers; we hold one line only.' }, fallback: 'Read the options.',
    beats: [{ target: 'inc-options', caption: 'Hold one line, not the whole batch' }], acts: [{ kind: 'gate', gate: 'assess' }], needs: { scenario: 'payments', gate: 'assess' },
  },
  fraudImpact: {
    id: 'fraudImpact', title: 'I request the hold — so I cannot approve it', speaker: 'srija', segment: 'Financial analysis', route: '/incident', weight: 1.1,
    say: 'I request a hold on this one line and a callback to the supplier on the number in our contract. Because I am the requester, the policy will not let me approve my own request — it routes the decision to Vandana.',
    keywords: ['€85,000 exposure', 'hold one line', 'callback on known number', 'requester ≠ approver', 'routed to CEO'],
    show: 'The approval route naming Vandana.', click: 'Record financial impact.', expected: 'Route: Vandana Madem (CEO).', why: 'Self-approval is the classic control failure in payment fraud.',
    question: { q: 'Below €100,000, why not the CFO?', a: 'Normally the CFO approves payment holds, but here she is the requester, so the next authority decides.' }, fallback: 'Explain the rule.',
    beats: [{ target: 'inc-approvals', caption: 'Requester cannot approve' }], acts: [{ kind: 'gate', gate: 'impact' }], needs: { scenario: 'payments', gate: 'impact' },
  },
  fraudAuthorize: {
    id: 'fraudAuthorize', title: 'Independent approval — or nothing', speaker: 'vandana', segment: 'Executive approval', route: '/incident', weight: 1.2,
    say: 'I approve the hold. And here is the test: if I were unavailable, my deputy would be Srija — but she requested this hold, so the system blocks rather than letting her approve herself. Watch it refuse.',
    keywords: ['CEO approves', 'deputy = requester', 'system blocks', 'no self-approval', 'recorded'],
    show: 'The blocked state after marking the CEO unavailable.', click: 'Mark Vandana unavailable → see “blocked”; mark available → Approve.',
    expected: 'Blocked, then approved by Vandana.', why: 'Controls must hold when people are away.',
    question: { q: 'What happens if the responsible person is unavailable?', a: 'Delegation is recorded, but the deputy is checked like anyone else; here the deputy is the requester, so the step is blocked.' },
    fallback: 'Explain with the team page.', beats: [{ target: 'inc-approvals', caption: 'Blocked: deputy is the requester' }],
    acts: [{ kind: 'unavailable', person: 'vandana' }, { kind: 'available', person: 'vandana' }, { kind: 'approve', step: 'executive' }], needs: { scenario: 'payments', gate: 'authorize' },
  },
  fraudExecute: {
    id: 'fraudExecute', title: 'Hold, clean, verify', speaker: 'pavan', segment: 'IT execution', route: '/incident', weight: 1.1,
    say: 'I flag the line as held in the ERP, remove the forwarding rule and reset the credentials — simulated here. Vijay then verifies: hold active, rule gone, sign-ins clean, callback evidence attached.',
    keywords: ['ERP hold flag', 'rule removed', 'credentials reset', 'independent verification', 'callback evidence'],
    show: 'Execution then verification.', click: 'Execute as Pavan; verify as Vijay.', expected: 'Gates 5 and 6 sealed.', why: 'Money and mailbox, contained together.',
    question: { q: 'Who calls the supplier?', a: 'Léa Moreau, Accounts Payable, on the number in the contract — never the one in the email.' }, fallback: 'Use “Do it for me”.',
    beats: [{ target: 'inc-workbench', caption: 'Execute, then verify' }], acts: [{ kind: 'gate', gate: 'execute' }, { kind: 'gate', gate: 'verify' }], needs: { scenario: 'payments', gate: 'execute' },
  },
  fraudClose: {
    id: 'fraudClose', title: 'Turn the lesson into a control', speaker: 'karan', segment: 'Final demonstration and conclusion', route: '/incident', weight: 0.9,
    say: 'Closed with residual risk three. The callback procedure becomes mandatory, mailbox forwarding rules now raise an alert, and Accounts Payable gets targeted awareness. R7 in our register reflects all of it.',
    keywords: ['residual 3', 'mandatory callback', 'mailbox-rule alert', 'awareness', 'R7 updated'],
    show: 'Closure and follow-ups.', click: 'Close as Karan.', expected: 'All gates sealed.', why: 'Fraud attempts come back; controls should too.',
    question: { q: 'Was any money lost?', a: 'No — the line never left. That is the value of a hold decided in minutes.' }, fallback: 'Read the lessons.',
    beats: [{ target: 'inc-gates', caption: 'Closed, controls updated' }], acts: [{ kind: 'gate', gate: 'close' }], needs: { scenario: 'payments', gate: 'close' },
  },
  soc: {
    id: 'soc', title: 'Inside the security operations view', speaker: 'nandini', segment: 'Cybersecurity investigation', route: '/soc', weight: 1,
    say: 'This is my view: the alert queue, the affected endpoint, the indicator timeline and the assets that depend on it. I can see at once whether the problem stays on one machine or starts to move.',
    keywords: ['alert queue', 'endpoint detail', 'indicator timeline', 'dependencies', 'spread or contained'],
    show: 'The SOC panels.', click: 'Open the FIN-WS-07 endpoint card.', expected: 'Endpoint details with criticality 4.', why: 'Analysts need context, not just alarms.',
    question: { q: 'How many endpoints are monitored?', a: 'The case fleet is 85 laptops; 34 are used mostly from home. The telemetry here is synthetic.' }, fallback: 'Describe the timeline.',
    beats: [{ target: 'soc-queue', caption: 'Alert queue' }, { target: 'soc-timeline', caption: 'What happened, in order' }],
  },
};

type Line = [sceneId: keyof typeof S, formats: Duration[]];
const ALL: Duration[] = [2, 5, 8, 12, 20, 30];
const LONG: Duration[] = [20, 30];
const SHOW_LINES: Record<ShowId, { title: string; blurb: string; scenario?: ScenarioId; lines: Line[] }> = {
  full: { title: 'Complete end-to-end NOVATECH workflow', blurb: 'The six-person relay: company, appetite, ransomware response through all seven gates, the report — and the power-off decided by the device owner.', scenario: 'ransomware',
    // Balanced for a graded six-person relay; the 20- and 30-minute versions add the case workspace (register, EBIOS,
    // compliance, controls, quantification, board pack, continuity) so each person presents a full part.
    lines: [['welcome', ALL], ['register', LONG], ['team', [8, 12, 20, 30]],
      ['appetite', [5, 8, 12, 20, 30]], ['compliance', LONG], ['controls', [30]], ['sod', [8, 12, 20, 30]],
      ['ebios', [30]], ['soc', LONG], ['alert', ALL], ['own', [8, 12, 20, 30]], ['assess', [5, 8, 12, 20, 30]],
      ['quant', LONG], ['impact', [5, 8, 12, 20, 30]], ['vendors', [30]], ['plans', [8, 12, 30]],
      ['execView', [30]], ['delegation', [30]], ['authorize', ALL], ['revision', [12]], ['board', LONG],
      ['continuity', LONG], ['execute', [5, 8, 12, 20, 30]],
      ['verify', [8, 12, 20, 30]], ['close', ALL], ['ledger', [12, 30]], ['report', [12, 20, 30]], ['thanks', [2]],
      ['macIntro', [8, 12, 20, 30]], ['macApprove', [5, 8, 12, 20, 30]]] },
  executive: { title: 'Executive risk overview', blurb: 'Posture, appetite, accountability and what the CEO needs on one screen.',
    lines: [['welcome', ALL], ['register', LONG], ['appetite', ALL], ['quant', LONG], ['execView', [5, 8, 12, 20, 30]], ['compliance', [30]], ['team', [8, 12, 20, 30]], ['sod', [12, 20, 30]], ['plans', [12, 20, 30]], ['board', LONG], ['thanks', ALL]] },
  cyber: { title: 'Cybersecurity incident', blurb: 'From synthetic EDR alert to an evidence-preserving treatment proposal.', scenario: 'ransomware',
    lines: [['ebios', [30]], ['alert', ALL], ['own', [5, 8, 12, 20, 30]], ['soc', [8, 12, 20, 30]], ['assess', ALL], ['controls', LONG], ['compliance', [30]], ['ledger', [12, 20, 30]], ['thanks', [5, 8, 12, 20, 30]]] },
  ransomware: { title: 'Ransomware response', blurb: 'All seven gates on NT-SEC-041 with dual control.', scenario: 'ransomware',
    lines: [['soc', LONG], ['alert', ALL], ['own', [8, 12, 20, 30]], ['assess', [5, 8, 12, 20, 30]], ['quant', [30]], ['impact', [5, 8, 12, 20, 30]], ['delegation', LONG], ['authorize', ALL], ['revision', [12]], ['execute', [5, 8, 12, 20, 30]], ['verify', [8, 12, 20, 30]], ['close', ALL], ['ledger', LONG], ['report', [8, 12, 20, 30]]] },
  fraud: { title: 'Financial fraud', blurb: 'Business email compromise on an €85,000 payment — requester cannot approve.', scenario: 'payments',
    lines: [['register', [30]], ['fraudAlert', ALL], ['fraudAssess', [5, 8, 12, 20, 30]], ['quant', LONG], ['fraudImpact', ALL], ['fraudAuthorize', ALL], ['fraudExecute', [5, 8, 12, 20, 30]], ['fraudClose', [5, 8, 12, 20, 30]], ['controls', [30]], ['plans', [12, 20, 30]], ['ledger', LONG], ['thanks', [8, 12, 20, 30]]] },
  cloud: { title: 'Cloud outage', blurb: 'Rule out an attack, then a controlled, approved failover.', scenario: 'cloud',
    lines: [['continuity', LONG], ['cloudAlert', ALL], ['cloudAssess', [5, 8, 12, 20, 30]], ['cloudImpact', ALL], ['quant', [30]], ['cloudAuthorize', ALL], ['cloudExecute', [5, 8, 12, 20, 30]], ['cloudClose', [5, 8, 12, 20, 30]], ['plans', [12, 20, 30]], ['ledger', [30]], ['thanks', [8, 12, 20, 30]]] },
  plans: { title: 'Department action plans', blurb: 'Who does what, by when, with which evidence — per department.', scenario: 'ransomware',
    lines: [['register', LONG], ['alert', [8, 12, 20, 30]], ['plans', ALL], ['team', [5, 8, 12, 20, 30]], ['continuity', LONG], ['sod', [12, 20, 30]], ['controls', [30]], ['thanks', ALL]] },
  approval: { title: 'Executive approval', blurb: 'Policy routing, dual control, return for revision and delegation.', scenario: 'ransomware',
    lines: [['execView', [5, 8, 12, 20, 30]], ['quant', [30]], ['authorize', ALL], ['revision', [8, 12, 20, 30]], ['delegation', ALL], ['sod', [12, 20, 30]], ['board', LONG], ['thanks', [5, 8, 12, 20, 30]]] },
  mac: { title: 'Secure remote Mac shutdown', blurb: 'The last follow-up: Pavan’s Windows request, Karan’s decision on the Mac, Reject by default.', scenario: 'ransomware',
    lines: [['close', [8, 12, 20, 30]], ['continuity', [30]], ['ledger', [12, 20, 30]], ['report', LONG], ['macIntro', ALL], ['macApprove', ALL]] },
};

export const SHOW_IDS: ShowId[] = ['full', 'executive', 'cyber', 'ransomware', 'fraud', 'cloud', 'plans', 'approval', 'mac'];
export const showMeta = (id: ShowId) => ({ id, title: SHOW_LINES[id].title, blurb: SHOW_LINES[id].blurb, scenario: SHOW_LINES[id].scenario });

export type TimedScene = Scene & { index: number; seconds: number; startsAt: number };
export function buildShow(id: ShowId, duration: Duration): TimedScene[] {
  const lines = SHOW_LINES[id].lines.filter(([, f]) => f.includes(duration));
  const total = duration * 60;
  const weights = lines.reduce((a, [sid]) => a + S[sid].weight, 0);
  let t = 0;
  return lines.map(([sid], index) => {
    const seconds = Math.max(15, Math.round((S[sid].weight / weights) * total));
    const scene = { ...S[sid], index, seconds, startsAt: t };
    t += seconds;
    return scene;
  });
}

/** Professor Q&A bank: who answers, a short answer, and the screen that proves it. */
export type Question = { id: string; q: string; who: PersonId; a: string; route: string; evidence: string };
export const QUESTIONS: Question[] = [
  { id: 'who-approves', q: 'Who can approve this action?', who: 'vandana', a: 'Two layers. The standing rule per action type: endpoint isolation needs the CISO, a failover the CEO, a payment hold the CFO. On top, the incident rule: from €100,000 of modelled exposure the CEO approves as well (dual control), and a requester never approves their own request — so a hold requested by the CFO goes to the CEO.', route: '/incident', evidence: 'Approval route, conditions and separation-of-duties checks' },
  { id: 'ceo-rejects', q: 'What happens if the CEO rejects it?', who: 'vandana', a: 'It is returned for revision: the approvals are cleared, execution stays blocked and the proposal goes back to Cybersecurity. The ledger records who returned it and why. We can show it live with “Challenge the controls”.', route: '/incident', evidence: '“Return for revision” and the ledger' },
  { id: 'risk-owner', q: 'Who owns this risk?', who: 'karan', a: 'Every risk has exactly one accountable owner: R1 Pavan Sanam, R2 Vijay Bhosale, R7 and R8 Srija Poudapally. The incident itself is owned by Karan Deshmukh as Risk Coordinator, from the first minute to closure.', route: '/team', evidence: 'RACI matrix and register owners' },
  { id: 'why-shutdown', q: 'Why is shutdown necessary?', who: 'pavan', a: 'Not to stop the attack — isolation did that at gate 5 and kept the memory evidence. Once the memory image is verified, we power the laptop off for forensic imaging and re-imaging: it stops anything still running on its disk and starts recovery. I request it; only the device owner can authorize it, on the device.', route: '/endpoint', evidence: 'Final step: power off for re-imaging' },
  { id: 'why-not-isolate', q: 'Why not isolate the endpoint instead?', who: 'nandini', a: 'We did isolate first. Shutting down at the start would have destroyed the memory evidence — attacker processes, sometimes keys — and done nothing about other hosts. Isolation contained the spread; the power-off came only after the evidence was verified, as a recovery step.', route: '/incident', evidence: '“Options considered” panel and the CISO’s condition' },
  { id: 'financial-impact', q: 'What is the financial impact?', who: 'srija', a: 'For the ransomware case: €60,000 low, €150,000 most likely, €240,000 modelled maximum — payroll delay, supplier penalties, recovery effort and possible GDPR exposure. After the approved isolation the residual score falls from 16 to 6, about €90,000.', route: '/incident', evidence: 'The CFO’s signed form and the exposure panel' },
  { id: 'audit', q: 'Where is the audit history?', who: 'karan', a: 'In the evidence ledger: every decision, with the full signed form, is chained to the previous one with SHA-256, and we can recompute the chain live. In the enterprise workspace the database refuses edits and deletions.', route: '/evidence', evidence: 'Verify chain · signed forms' },
  { id: 'unavailable', q: 'What happens if the responsible person is unavailable?', who: 'vandana', a: 'A named deputy receives recorded, time-boxed authority — and the same rules apply. If the deputy requested, executes or already approved, the step is blocked instead of letting the control lapse.', route: '/incident', evidence: '“Unavailable?” on an approval step' },
  { id: 'auth', q: 'Is the role switch real authentication?', who: 'vijay', a: 'No. In this demo the role switch is a presentation convenience, and it is labelled as such. The original NOVATECH workspace uses personal accounts with permissions enforced by the database; in production we would add single sign-on with MFA.', route: '/team', evidence: 'Persona badge: demo persona, not authentication' },
  { id: 'pavan-mac', q: 'Can Pavan shut down Karan’s Mac?', who: 'pavan', a: 'No. I can only send a request, after all seven gates, inside a 30-minute paired session on the private Wi-Fi. Karan’s Mac shows its own window: Reject is the default, 30 seconds without an answer is a rejection, and every failure keeps the Mac on. Nothing happens automatically.', route: '/endpoint', evidence: 'Pairing card and the owner’s approval window' },
  { id: 'real-data', q: 'Is this real data?', who: 'karan', a: 'No. NOVATECH is the fictional ESAIP case. Our register R1–R8 comes from our Group 1 analysis; telemetry, incidents and money figures are simulated and labelled SIMULATED on every screen.', route: '/command', evidence: 'SIMULATED badges' },
];
