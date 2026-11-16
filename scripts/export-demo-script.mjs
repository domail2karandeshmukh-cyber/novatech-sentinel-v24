// Writes docs/DEMO_SCRIPT.md from the same scene library Presenter Mode uses, so the printed script never drifts.
// Usage: node --experimental-strip-types scripts/export-demo-script.mjs [show] [minutes]
import { writeFileSync } from 'node:fs';
import { buildShow, QUESTIONS, SHOW_IDS, showMeta } from '../src/sentinel/presenter/shows.ts';
import { DEFAULT_RELAY, person } from '../src/sentinel/data/team.ts';

const show = SHOW_IDS.includes(process.argv[2]) ? process.argv[2] : 'full';
const minutes = [2, 5, 8, 12, 20, 30].includes(Number(process.argv[3])) ? Number(process.argv[3]) : 8;
const scenes = buildShow(show, minutes);
const speakerOf = (scene) => {
  const slot = scene.segment === 'Introduction' ? 0 : scene.segment === 'Final demonstration and conclusion' ? 6 : DEFAULT_RELAY.findIndex(r => r.segment === scene.segment);
  return slot >= 0 ? DEFAULT_RELAY[slot].person : scene.speaker;
};
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const meta = showMeta(show);
const out = [];
out.push(`# ${meta.title} — ${minutes}-minute script`, '');
out.push(`${meta.blurb}`, '');
out.push('Generated from the Presenter Mode scene library (`npm run script:export`). The live console shows the same text privately; the projector never does.', '');
out.push('## Before you start', '');
out.push('- Laptop on mains power, projector as an **extended** display (not mirrored).');
out.push('- Use **Microsoft Edge**: its free “Natural” voices (Neerja, Prabhat — Indian English) are the smoothest. In Voice & settings, **Test NOVA** should show the voice as *natural*.');
out.push('- Open Presenter Mode → choose the show and length → **Open audience window + console**. Drag the audience window to the projector and click **Start the projector** on it once: full screen, sound and NOVA’s voice in one click (browsers need one click in every window).');
out.push('- On the console, press **Test projector sound**. Starting the presentation switches NOVA’s voice on (unless narration is set to Off).');
out.push('- Nobody logs in. The app switches to each person’s role in their scene — a presentation convenience, not authentication. Each speaker can follow this script on their own phone (Presenter Mode → Phone script); it never appears on the projector.');
out.push('- Every gate is a real form: severity, indicators, amounts, conditions, change ticket, checklist, residual risk. **Do it for me** on the console fills the form on the projector for the audience to see, then signs it; the next person receives it with a deadline.');
out.push('- Keys in the console: → / Space next · ← back · P pause · Q questions · B next spotlight · M silence NOVA (on the projector too).');
out.push('- On the end card, → opens questions and → again returns to the card — a stray clicker press never discards the run. “Start again” needs a second click.');
out.push('- During questions, **Challenge the controls** lets the professor pick a what-if (CEO unavailable, CEO sends it back, the executor or the requester tries to approve). The engine answers on a private copy; nothing is written to the ledger.', '');
out.push('## The final step: power off for re-imaging', '');
out.push('The story: FIN-WS-07 was **isolated first**, so its memory evidence survived. After verification and closure, the last follow-up powers it off for forensic imaging and re-imaging. For the demonstration, **Karan’s MacBook stands in for FIN-WS-07**. Nothing ever happens automatically: Pierre can only request it, and only Karan’s click on his own Mac authorizes it.', '');
out.push('On the public link it is simulated: the projector ends on a black “Powered off by its owner” screen. For the real one:', '');
out.push('1. On Karan’s Mac, in the project folder: `npm run dev`, then open `http://localhost:5173/present` → **Open audience window + console** (the real request can only reach the Mac from a copy running on that Mac).');
out.push('2. In a second Terminal: `npm run remote:preview` for rehearsals (the projector then shows the ending in preview mode, the Mac stays on); `npm run remote:live` only for the real demonstration (or the installed login agent). Save your work first — a confirmed live request powers the Mac off.');
out.push('3. Both laptops on the same private Wi-Fi. Guest or campus networks with client isolation block pairing: test the classroom network beforehand, or use a phone hotspot.');
out.push('4. Scene “The last follow-up, on a real device”: Karan opens the 5-minute code from **Final step** on his own screen (main window, not the projector). The projector only shows the pairing status — never the code, the link or the fingerprint.');
out.push('5. Pierre opens the controller link on Windows (Edge or Chrome), checks the certificate fingerprint with Karan in person, enters the code, then sends the request.');
out.push('6. The Mac shows its own approval window — Reject is the default. Suggested beat: **reject the first request** (“the Mac stays on — that’s the point”), then authorize the second. The Mac shuts down and the show ends on a dark screen.');
out.push('7. **Questions:** the console reminds you before the final scene — take questions with evidence on screen *before* it; after the power-off, answer from the phone script (every answer is in it, with who answers).');
out.push('8. If pairing fails on the day, use **Mac rehearsal** in the console: the same steps, simulated and labelled, ending on the same power-off screen.', '');
out.push('## Run of show', '');
out.push('| # | Starts | Speaker | Scene | Length |', '|---|---|---|---|---|');
for (const s of scenes) out.push(`| ${s.index + 1} | ${mmss(s.startsAt)} | ${person(speakerOf(s)).name} | ${s.title} | ${s.seconds} s |`);
out.push('');
for (const s of scenes) {
  const who = person(speakerOf(s));
  out.push(`## ${s.index + 1}. ${s.title}`, '');
  out.push(`**${who.name}** — ${who.role} · ${s.segment} · ${s.seconds} s`, '');
  out.push(`> ${s.say}`, '');
  out.push(`**Keywords:** ${s.keywords.join(' · ')}`, '');
  out.push(`- **Show:** ${s.show}`);
  out.push(`- **Click:** ${s.click}`);
  out.push(`- **Expected:** ${s.expected}`);
  out.push(`- **Why it matters:** ${s.why}`);
  out.push(`- **If something fails:** ${s.fallback}`);
  if (s.handoff) out.push(`- **Hand-off:** “${s.handoff}”`);
  out.push('', `**Professor may ask:** ${s.question.q}  `, `**Answer:** ${s.question.a}`, '');
}
out.push('## Professor questions (any time — press Q)', '');
for (const q of QUESTIONS) out.push(`**${q.q}** — *${person(q.who).name} answers*  `, `${q.a}  `, `*Evidence on screen:* ${q.evidence}`, '');
// The 8-minute complete show is the default script; other lengths get their own file (DEMO_SCRIPT_20.md …).
const file = show === 'full' && minutes === 8 ? 'DEMO_SCRIPT.md' : `DEMO_SCRIPT_${show === 'full' ? '' : `${show}_`}${minutes}.md`;
writeFileSync(new URL(`../docs/${file}`, import.meta.url), out.join('\n'));
console.log(`docs/${file} written: ${meta.title}, ${minutes} min, ${scenes.length} scenes.`);
