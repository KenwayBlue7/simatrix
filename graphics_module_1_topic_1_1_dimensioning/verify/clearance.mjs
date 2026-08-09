// ANNOTATION CLEARANCE AUDIT — every drawing in the lesson, measured, with no browser.
//
//   node verify/clearance.mjs            list only what is still tight
//   node verify/clearance.mjs --all      list every drawing and every move the pass made
//
// `dimensionLayout.js` and the three spec catalogues are pure data leaves (ADR-007/078), so the
// whole lesson can be laid out and measured in Node. For each drawing this prints:
//   • what was touching or too close BEFORE the annotation layout pass ran;
//   • every nudge the pass made, and which contact provoked it;
//   • anything still inside the clearance AFTER it, which is what a reviewer has to justify.
//
// Exit status is 1 if any drawing the lesson is meant to keep clean is still tight.
//
// The Guide Plate (Step 6) is the one drawing allowed a budget: it carries every feature the
// chapter has on one part, and a few of its notes have to cross a projection line to reach clear
// paper at all. The budget is a ratchet — it may be lowered, never raised.

import { planLayout, auditClearance, CLEARANCE_MM } from '../src/dimensionLayout.js';
import { RULES } from '../src/dimensionRules.js';
import { SYMBOLS } from '../src/dimensionSymbols.js';
import {
  anatomyDrawing, leaderDemo, methodDrawing, obliqueClock, ARRANGEMENTS, completeDrawing,
} from '../src/dimensionExamples.js';

const ALL = process.argv.includes('--all');

/** Drawings that must come out of the pass with nothing inside the clearance. */
const drawings = [];
const add = (name, specs, budget = 0) => drawings.push({ name, specs, budget });

add('step 1 · anatomy', anatomyDrawing());
for (const h of ['dot', 'arrow', 'none']) add(`step 1 · leader head "${h}"`, leaderDemo(h));
add('step 3 · the two methods', methodDrawing());
add('step 3 · same value, eight directions', obliqueClock());
for (const a of ARRANGEMENTS) {
  for (const v of (a.variants ?? [a])) {
    add(`step 4 · ${a.name}${a.variants ? ` / ${v.label}` : ''}`, v.build());
  }
}
for (const r of RULES) add(`step 2 · ${r.id}`, r.correct);
for (const s of SYMBOLS) {
  for (const v of (s.variants ?? [])) {
    if (!v.specs) continue;
    // THE ONE STEP-5 BUDGET. "Length and angle" states a 10 mm chamfer's length AND its angle
    // in the corner of the step, and the corner the chamfer cut is 10 mm square. The length's
    // two projection lines rise out of that corner, and the angle's value has to be lettered
    // somewhere between them. Fig. 4.26 prints the same pair on a figure drawn large enough for
    // both. Two contacts survive: the 45° value 0.3 mm off a projection line, and the arc's
    // arrow head 3.0 mm off it. Tight geometry, reported rather than papered over.
    add(`step 5 · ${s.id} / ${v.id}`, v.specs, s.id === 'chamfer' && v.id === 'separate' ? 2 : 0);
  }
}
// See the header: the Guide Plate's own budget, and a ratchet.
add('step 6 · the complete Guide Plate', completeDrawing(), 5);

let over = 0;
let moves = 0;
for (const d of drawings) {
  const before = auditClearance(d.specs);
  const plan = planLayout(d.specs);
  const after = auditClearance(plan.specs);
  moves += plan.moves.length;
  const bad = after.length > d.budget;
  if (bad) over++;
  if (!ALL && !bad && !after.length) continue;

  const verdict = bad ? `OVER BUDGET (${after.length} > ${d.budget})`
    : after.length ? `within budget (${after.length} / ${d.budget})` : 'clear';
  console.log(`\n${d.name} — ${before.length} tight before, ${plan.moves.length} move(s), ${verdict}`);
  if (ALL) {
    for (const b of before) console.log(`   was    ${b.a} ${b.roles} ${b.b}   ${b.gapMm} mm`);
    for (const m of plan.moves) {
      console.log(`   moved  ${m.id}.${m.field} ${m.from} -> ${m.to}   (${m.knob}; ${m.because})`);
    }
  }
  for (const a of after) console.log(`   TIGHT  ${a.a} ${a.roles} ${a.b}   ${a.gapMm} mm`);
}

console.log(`\n${drawings.length} drawings · ${moves} nudges · clearance ${CLEARANCE_MM} mm`);
console.log(over ? `FAIL — ${over} drawing(s) over budget` : 'PASS — every drawing within budget');
process.exit(over ? 1 : 0);
