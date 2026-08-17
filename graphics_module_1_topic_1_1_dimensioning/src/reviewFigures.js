// The four worked examples of Step 6, as the chapter prints them (Figs. 4.28–4.31).
//
// PURE DATA LEAF (ADR-007 / RULES.md §3.6): imports nothing, owns no DOM, touches no Three.js.
// `reviewFigureSvg.js` strokes it; `dimensionUI.js` paints the prose beside it.
//
// WHY THIS EXISTS. Step 6 used to be a twelve-fault hunt on the Guide Plate, and what it did
// not have was the chapter's own WRONG/CORRECT pairs, which a lecturers' review asked for: a
// student reads a mistake far faster when the corrected drawing is beside it than when they are
// told the rule and left to imagine it. These four are the chapter's Examples 4.1–4.4 and are
// what the class is actually set. A second review then removed the hunt outright, so these
// four ARE Step 6.
//
// ⚠️ `no` IS FOR US, NOT FOR THE LEARNER. It records which figure of the chapter each sheet
// came from, so the geometry stays checkable against the scan — and it must never reach the
// DOM. It briefly did, on the chips and in the board's header, and was taken out again on
// 2026-08-17: this is a standalone learning module, not a viewer for a scanned textbook, and
// CLAUDE.md's no-citations rule has no exceptions. Learner-facing text uses `name`.
//
// ⚠️ THE GEOMETRY AND EVERY VALUE ARE THE CHAPTER'S, read off the scans of pp. 36–37, and
// they are NOT to be tidied. In particular:
//   • Fig. 4.28's holes share the arc's centre — the ø20 hole IS centred on the R20 corner.
//   • Fig. 4.29's chain reads 12 · 8 · 74 · 20 = 114 across and 10 · 14 · 24 = 48 up. If you
//     change one link you must change the overall, and then it is no longer the chapter's.
//   • Fig. 4.30's 60° slope is what fixes the top edge at x = 80: 45 of rise over 45/tan60°.
//   • Fig. 4.31's two horizontal dashed lines are a real hidden feature 14 deep, and the 14
//     on the right measures them. They are not centre lines; do not redraw them as chain.
//
// ⚠️ THE `wrong` SETS ARE DELIBERATELY BAD AND MUST STAY BAD. Every fault in them is one the
// chapter draws on purpose. Nothing here goes near `dimensionLayout.js` — that pass exists to
// tidy a sheet, and tidying these would delete the lesson (same reasoning as ADR-126's note on
// Step 2's ten broken rules).
//
// CO-ORDINATES are millimetres, y UP, origin at the part's bottom-left corner. `box` is the
// sheet the renderer maps to the SVG viewBox and has to contain every lane and every leader.

/** Text height on these sheets, in mm — §4.5 item 3, and the same 3.5 the 3-D sheets use. */
export const TEXT_MM = 3.5;

/**
 * One annotation. The renderer understands six kinds and nothing else:
 *
 *   lin   a linear dimension — two projection lines, a dimension line, an arrow at each end
 *         { axis:'x'|'y', from, to, at, text, outside?, textAt? }
 *   lead  a leader — arrow on the feature, elbow, horizontal bar, value above the bar
 *         { to, elbow, bar, text, dot? }
 *   dia   the two-part diameter — a line THROUGH the circle at 30°–60° with an arrow at each
 *         end, carried out on a leader to a value written clear of the view (Fig. 4.31b)
 *         { c, d, deg, out, bar, text }
 *   rad   a radius — one arrow landing ON the curve, from outside, with a cross at the centre
 *         { c, r, deg, out, bar, text, mark? }
 *   ang   an angle — an arc about the vertex, value along it { v, r, from, to, text }
 *   free  a bare value with NO dimension line at all. A FAULT ONLY: it is what the chapter
 *         draws when it wants to show a size that has been written and not dimensioned.
 *         { at, text, rot? }
 *   stray a lone arrow head pointing at nothing. Also a fault only { at, deg }
 *
 * `bad: true` marks the strokes the explanation is about, so the wrong sheet can flag them
 * without the reader having to hunt (Two-Cue Rule — the flag never travels alone; the prose
 * under the drawing names every one of them).
 * @typedef {object} Ann
 */

/* ============================================================================
 * Fig. 4.28 — L-plate (parallel dimensioning). Example 4.1.
 * 60 × 70 overall, stepped 40 × 32 out of the bottom-right corner, R20 top-left,
 * ø20 and ø16 on one centre line 20 in from the left edge.
 * ========================================================================== */

const L_PLATE = {
  id: 'l-plate',
  no: '4.28',
  name: 'L-plate',
  arrangement: 'Parallel dimensioning',
  caption: 'L-PLATE',
  box: { x: -46, y: -34, w: 152, h: 132 },
  outline: [
    ['M', 0, 0], ['L', 40, 0], ['L', 40, 32], ['L', 60, 32],
    ['L', 60, 70], ['L', 20, 70], ['A', 20, 0, 0, 50], ['Z'],
  ],
  circles: [{ c: [20, 50], d: 20 }, { c: [20, 20], d: 16 }],
  // The two holes sit on one vertical centre line; each gets its own horizontal one.
  centres: [[20, 8, 20, 62], [8, 50, 32, 50], [8, 20, 32, 20]],
};

L_PLATE.correct = [
  // Across — every size from the SAME left-hand edge. That is what parallel means.
  { k: 'lin', axis: 'x', from: [0, 0], to: [20, 0], at: -12, text: '20' },
  { k: 'lin', axis: 'x', from: [0, 0], to: [40, 0], at: -24, text: '40' },
  // The overall springs from the TOP of the left edge, not from the corner the R20 removed.
  { k: 'lin', axis: 'x', from: [0, 50], to: [60, 70], at: 82, text: '60' },
  // Up — every size from the same bottom edge.
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 20], at: -12, text: '20' },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 50], at: -26, text: '50' },
  // …and on the right, from the bottom edge the step left behind at x = 40.
  { k: 'lin', axis: 'y', from: [40, 0], to: [60, 32], at: 72, text: '32' },
  { k: 'lin', axis: 'y', from: [40, 0], to: [60, 70], at: 86, text: '70' },
  // The curve is a radius, the holes are diameters, and all three are written outside.
  { k: 'rad', c: [20, 50], r: 20, deg: 143, out: 16, bar: -13, text: 'R20', mark: true },
  { k: 'dia', c: [20, 50], d: 20, deg: 200, out: 20, bar: -13, text: 'ø20' },
  { k: 'dia', c: [20, 20], d: 16, deg: -35, out: 22, bar: 13, text: 'ø16' },
];

L_PLATE.wrong = [
  // Sizes written across the part instead of outside it.
  { k: 'lin', axis: 'x', from: [0, 50], to: [60, 50], at: 50, text: '60', bad: true },
  { k: 'lin', axis: 'y', from: [46, 32], to: [46, 70], at: 46, text: '38', bad: true },
  // Hole to hole, not edge to hole: the two centres are chained off one another.
  { k: 'lin', axis: 'y', from: [20, 20], to: [20, 50], at: 26, text: '30', bad: true },
  { k: 'lin', axis: 'x', from: [0, 20], to: [20, 20], at: 26, text: '20', bad: true },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 20], at: 9, text: '20', bad: true },
  { k: 'lin', axis: 'y', from: [60, 0], to: [60, 32], at: 55, text: '32', bad: true },
  { k: 'lin', axis: 'x', from: [40, 0], to: [60, 0], at: 5, text: '20', bad: true },
  // The symbol written AFTER the value, and a drilled hole called a radius.
  { k: 'lead', to: [12.5, 42.5], elbow: [-16, 22], bar: -9, text: '20ø', bad: true },
  { k: 'lead', to: [27, 26.5], elbow: [50, 40], bar: 11, text: '8R', bad: true },
  // The arc's value laid along a sloping leader that runs across the hole and stops on its
  // centre — so it is written on the metal and has to be read sideways.
  { k: 'free', at: [11, 58], text: 'R20', rot: -45, bad: true },
  { k: 'aim', from: [5.9, 64.1], to: [20, 50], bad: true },
];

L_PLATE.faults = [
  'Sizes are written across the part instead of outside it.',
  'The symbol comes after the number — 20ø and 8R.',
  'The lower hole is called a radius. It is drilled, so it is a diameter.',
  'The two hole centres are measured from each other, not from the edges.',
  'The overall height is never stated; the reader has to add 38 and 32.',
  'The corner radius is written along a sloping leader, over the hole.',
];

L_PLATE.fixes = [
  'Every dimension line sits outside the view, on its own lane.',
  'ø and R come first, tight against the number — ø20, ø16, R20.',
  'Both holes are stated as diameters: ø20 and ø16.',
  'Both centres are measured from the same two edges — 20 across, 20 and 50 up.',
  'The overall 60 × 70 is stated once, with 40 and 32 fixing the step.',
  'The radius arrow lands on the curve, and a cross marks its centre.',
];

/* ============================================================================
 * Fig. 4.29 — Lock plate (chain dimensioning). Example 4.2.
 * 114 × 48, a 12 × 10 notch out of the bottom-left, R10 top-left,
 * ø12 and ø20 on the centre line 24 up.
 * ========================================================================== */

const LOCK_PLATE = {
  id: 'lock-plate',
  no: '4.29',
  name: 'Lock plate',
  arrangement: 'Chain dimensioning',
  caption: 'LOCK PLATE',
  box: { x: -44, y: -32, w: 190, h: 106 },
  outline: [
    ['M', 0, 10], ['L', 12, 10], ['L', 12, 0], ['L', 114, 0],
    ['L', 114, 48], ['L', 10, 48], ['A', 10, 0, 0, 38], ['Z'],
  ],
  circles: [{ c: [20, 24], d: 12 }, { c: [94, 24], d: 20 }],
  centres: [[4, 24, 110, 24], [20, 15, 20, 33], [94, 9, 94, 39]],
};

LOCK_PLATE.correct = [
  // ONE lane, link after link, each starting where the last ended. 12+8+74+20 = 114.
  // Each projection line springs from a real point of the part — the notch's own two faces,
  // then the hole centre lines carried down, then the right-hand edge.
  { k: 'lin', axis: 'x', from: [0, 10], to: [12, 0], at: -14, text: '12', outside: true },
  { k: 'lin', axis: 'x', from: [12, 0], to: [20, 24], at: -14, text: '8', outside: true },
  { k: 'lin', axis: 'x', from: [20, 24], to: [94, 24], at: -14, text: '74' },
  { k: 'lin', axis: 'x', from: [94, 24], to: [114, 0], at: -14, text: '20' },
  // …and the same up the left-hand side. 10+14+24 = 48.
  { k: 'lin', axis: 'y', from: [12, 0], to: [0, 10], at: -14, text: '10', outside: true },
  { k: 'lin', axis: 'y', from: [0, 10], to: [0, 24], at: -14, text: '14', outside: true },
  { k: 'lin', axis: 'y', from: [0, 24], to: [10, 48], at: -14, text: '24' },
  { k: 'rad', c: [10, 38], r: 10, deg: 135, out: 15, bar: -11, text: 'R10', mark: true },
  { k: 'dia', c: [20, 24], d: 12, deg: 55, out: 26, bar: 11, text: 'ø12' },
  { k: 'dia', c: [94, 24], d: 20, deg: -40, out: 22, bar: 11, text: 'ø20' },
];

LOCK_PLATE.wrong = [
  // Two different datums in one direction: 20 from the left edge, 102 from the notch face.
  { k: 'lin', axis: 'x', from: [20, 24], to: [94, 24], at: 41, text: '74', bad: true },
  { k: 'lin', axis: 'x', from: [0, 24], to: [20, 24], at: 33, text: '20', bad: true },
  { k: 'lin', axis: 'x', from: [12, 0], to: [114, 0], at: -14, text: '102', bad: true },
  { k: 'lin', axis: 'x', from: [0, 10], to: [12, 10], at: -14, text: '12', bad: true },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 10], at: -14, text: '10', bad: true },
  // Halves given, overall withheld — twice.
  { k: 'lin', axis: 'y', from: [114, 0], to: [114, 24], at: 126, text: '24', bad: true },
  { k: 'lin', axis: 'y', from: [114, 24], to: [114, 48], at: 126, text: '24', bad: true },
  // A diameter symbol on a corner radius, and the symbol written after the value.
  { k: 'lead', to: [3.5, 46], elbow: [-14, 58], bar: -11, text: '10ø', bad: true },
  { k: 'lead', to: [23, 20], elbow: [36, 15], bar: 11, text: '12ø', bad: true },
  // The value laid along a leader that lies right across the hole.
  { k: 'free', at: [88, 18], text: 'ø20', rot: -45, bad: true },
  { k: 'aim', from: [83, 33], to: [105, 15], bad: true },
];

LOCK_PLATE.faults = [
  'Neither the overall length nor the overall height is given.',
  '102 is measured from the notch face, 20 from the left edge — two datums, one direction.',
  'The corner radius is labelled 10ø: a diameter symbol on a curve.',
  '12ø writes the symbol after the number.',
  'ø20 lies along a leader drawn across the hole, so it reads sideways on the metal.',
  'Two sizes are drawn inside the outline.',
];

LOCK_PLATE.fixes = [
  'One chain across — 12, 8, 74, 20 — and one up the side: 10, 14, 24.',
  'Each link starts where the last one ended, so nothing is measured from two places.',
  'The corner is a radius: R10, its arrow on the curve, a cross at its centre.',
  'ø12 and ø20 — symbol first, value written clear of the part.',
  'Every lane sits outside the view; nothing is written on the metal.',
  'Chain suits a lock plate, but the errors add up along it — never use it where they matter.',
];

/* ============================================================================
 * Fig. 4.30 — Template (combined dimensioning). Example 4.3.
 * 106 long, 50 high, R8 top-left, ø20 at (20, 30), a 10 wide × 5 high land with a
 * 3 wide groove in it, and a 60° cut across the right-hand end.
 * ========================================================================== */

const TEMPLATE = {
  id: 'template',
  no: '4.30',
  name: 'Template',
  arrangement: 'Combined dimensioning',
  caption: 'TEMPLATE',
  box: { x: -40, y: -42, w: 178, h: 116 },
  outline: [
    ['M', 0, 0], ['L', 30, 0], ['L', 30, 5], ['L', 40, 5], ['L', 40, 0],
    ['L', 43, 0], ['L', 43, 5], ['L', 106, 5], ['L', 80, 50], ['L', 8, 50],
    ['A', 8, 0, 0, 42], ['Z'],
  ],
  circles: [{ c: [20, 30], d: 20 }],
  centres: [[20, 16, 20, 44], [6, 30, 34, 30]],
};

TEMPLATE.correct = [
  // Across the hole from the left edge, and up it from both edges: 20 + 30 = the full 50.
  { k: 'lin', axis: 'x', from: [0, 42], to: [20, 50], at: 60, text: '20' },
  { k: 'lin', axis: 'y', from: [0, 30], to: [8, 50], at: -14, text: '20' },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 30], at: -14, text: '30' },
  // Along the bottom: parallel where it matters, chain where it does not.
  { k: 'lin', axis: 'x', from: [0, 0], to: [30, 0], at: -14, text: '30' },
  { k: 'lin', axis: 'x', from: [0, 0], to: [40, 0], at: -28, text: '40' },
  // The 5 is taken into the middle of the clear space the land leaves, not squeezed against
  // the riser: the chapter draws it tight, and at screen size the value lands on the line.
  { k: 'lin', axis: 'y', from: [30, 0], to: [30, 5], at: 37, text: '5', outside: true },
  { k: 'lin', axis: 'x', from: [40, 0], to: [43, 0], at: -7, text: '3', outside: true },
  { k: 'lin', axis: 'x', from: [43, 5], to: [106, 5], at: -14, text: '63' },
  { k: 'ang', v: [106, 5], r: 26, from: 120, to: 180, text: '60°' },
  { k: 'dia', c: [20, 30], d: 20, deg: 52, out: 24, bar: 11, text: 'ø20' },
  { k: 'rad', c: [8, 42], r: 8, deg: 138, out: 15, bar: -9, text: 'R8', mark: true },
];

TEMPLATE.wrong = [
  // A leader that lands on nothing, with the symbol written after the value.
  { k: 'stray', at: [2.5, 58], deg: 90, bad: true },
  { k: 'free', at: [-2, 61], text: '8R', bad: true },
  // The word spelled out, and put after the number.
  { k: 'lead', to: [27, 37], elbow: [46, 56], bar: 11, text: '20Dia', bad: true },
  // Two positions of the hole written on the metal, with no dimension line at all.
  { k: 'free', at: [35, 38], text: '20', rot: -90, bad: true },
  { k: 'free', at: [10, 17], text: '20', bad: true },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 30], at: -12, text: '30', bad: true },
  { k: 'lin', axis: 'x', from: [0, 0], to: [30, 0], at: -14, text: '30', bad: true },
  { k: 'lin', axis: 'x', from: [0, 0], to: [40, 0], at: -26, text: '40', bad: true },
  { k: 'lin', axis: 'y', from: [30, 0], to: [30, 5], at: 27, text: '5', outside: true, bad: true },
  { k: 'lin', axis: 'x', from: [40, 0], to: [43, 0], at: -14, text: '3', outside: true, bad: true },
  // The dimension line drawn ON the part's own bottom edge.
  { k: 'lin', axis: 'x', from: [43, 5], to: [106, 5], at: 5, text: '63', bad: true },
  { k: 'ang', v: [106, 5], r: 26, from: 120, to: 180, text: '60°' },
];

TEMPLATE.faults = [
  '20Dia and 8R spell the symbol out and write it after the number.',
  'The 8R leader is a bare arrow pointing into space; it never reaches the curve.',
  'Both of the hole positions are bare numbers on the metal, with no dimension line.',
  'The 63 dimension line is drawn along the part\'s own bottom edge.',
  'The overall height is never given — only the 30 below the hole.',
  'Values are written on the part instead of outside the view.',
];

TEMPLATE.fixes = [
  'ø20 and R8 — five symbols exist, and each goes first, tight against the value.',
  'The R8 arrow lands on the arc, with a cross marking the centre it was struck from.',
  'The hole is located by real dimension lines: 20 across, 20 and 30 up.',
  'Every dimension line is a thin line of its own, outside the view.',
  '20 + 30 states the full 50; 30, 40, 3 and 63 lay the length out along one edge.',
  'Combined: parallel from the left edge where it matters, chain where it does not.',
];

/* ============================================================================
 * Fig. 4.31 — Rod support (combined dimensioning). Example 4.4.
 * 80 × 52 plate, R4 corners, a ø40 boss with a ø24 bore at the middle, four ø8 holes on
 * a 60 × 32 pitch, and a hidden feature 14 deep across the middle.
 * ========================================================================== */

const ROD_SUPPORT = {
  id: 'rod-support',
  no: '4.31',
  name: 'Rod support',
  arrangement: 'Combined dimensioning',
  caption: 'ROD SUPPORT',
  box: { x: -44, y: -34, w: 168, h: 108 },
  outline: [
    ['M', 4, 0], ['L', 76, 0], ['A', 4, 0, 80, 4], ['L', 80, 48], ['A', 4, 0, 76, 52],
    ['L', 4, 52], ['A', 4, 0, 0, 48], ['L', 0, 4], ['A', 4, 0, 4, 0], ['Z'],
  ],
  circles: [
    { c: [40, 26], d: 40 }, { c: [40, 26], d: 24 },
    { c: [10, 10], d: 8 }, { c: [70, 10], d: 8 },
    { c: [10, 42], d: 8 }, { c: [70, 42], d: 8 },
  ],
  // The rod bore's own centre lines, plus a short cross on each of the four fixing holes.
  centres: [
    [40, 2, 40, 50], [16, 26, 64, 26],
    [4, 10, 16, 10], [10, 4, 10, 16], [64, 10, 76, 10], [70, 4, 70, 16],
    [4, 42, 16, 42], [10, 36, 10, 48], [64, 42, 76, 42], [70, 36, 70, 48],
  ],
  // A real hidden feature 14 deep, read across the middle of the plate — §4.6 rule 5's
  // example on this sheet, and what the 14 on the right measures.
  hidden: [[0, 19, 80, 19], [0, 33, 80, 33]],
};

ROD_SUPPORT.correct = [
  // Up the left: the hole pitch first, the overall outside it. Lanes grow OUTWARDS.
  { k: 'lin', axis: 'y', from: [0, 42], to: [0, 52], at: -13, text: '10', outside: true },
  { k: 'lin', axis: 'y', from: [0, 10], to: [0, 42], at: -13, text: '32' },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 52], at: -27, text: '52' },
  // The hidden feature, taken out to the right where there is clear paper.
  { k: 'lin', axis: 'y', from: [80, 19], to: [80, 33], at: 93, text: '14', outside: true },
  // Along the bottom: pitch first, overall outside it.
  { k: 'lin', axis: 'x', from: [0, 0], to: [10, 0], at: -13, text: '10', outside: true },
  { k: 'lin', axis: 'x', from: [10, 0], to: [70, 0], at: -13, text: '60' },
  { k: 'lin', axis: 'x', from: [0, 0], to: [80, 0], at: -27, text: '80' },
  // Each circle gets its own line THROUGH it, carried out to a value on clear paper.
  { k: 'dia', c: [40, 26], d: 24, deg: 132, out: 28, bar: -11, text: 'ø24' },
  { k: 'dia', c: [40, 26], d: 40, deg: 48, out: 20, bar: 11, text: 'ø40' },
  { k: 'rad', c: [76, 48], r: 4, deg: 45, out: 16, bar: 9, text: 'R4', mark: false },
  { k: 'dia', c: [70, 10], d: 8, deg: -30, out: 20, bar: 11, text: 'ø8' },
];

ROD_SUPPORT.wrong = [
  // The symbol spelled out — before the value, after the value, and with a unit that a
  // drawing in millimetres never writes.
  { k: 'lead', to: [40, 38], elbow: [58, 60], bar: -13, text: '24 Dia', bad: true },
  { k: 'lead', to: [78.5, 50.5], elbow: [92, 62], bar: 11, text: 'Rad 4 mm', bad: true },
  { k: 'lead', to: [73, 7], elbow: [92, -6], bar: 11, text: 'Dia 8', bad: true },
  // The boss size measured and written inside the part, straight across the metal.
  { k: 'lin', axis: 'x', from: [20, 40], to: [60, 40], at: 40, text: '40', bad: true },
  // Bare numbers on the part, with no dimension line and no arrows.
  { k: 'free', at: [16, 6], text: '10', bad: true },
  { k: 'stray', at: [20, 12], deg: 90, bad: true },
  // The overall HAS a dimension line — its value has simply been written on the metal,
  // nowhere near it, which is the same as not dimensioning it at all.
  { k: 'lin', axis: 'x', from: [0, 0], to: [80, 0], at: -8, text: '80', textAt: [40, 3], bad: true },
  { k: 'stray', at: [24, -3], deg: 90, bad: true },
  // The hidden feature measured from inside the view, its projection lines never reaching it.
  { k: 'lin', axis: 'y', from: [62, 19], to: [62, 33], at: 62, text: '14', bad: true },
  { k: 'lin', axis: 'y', from: [0, 10], to: [0, 42], at: -16, text: '32', bad: true },
  { k: 'lin', axis: 'y', from: [0, 0], to: [0, 52], at: -30, text: '52', bad: true },
  // The overall drawn INSIDE the sizes it contains: the lane order is inverted.
  { k: 'lin', axis: 'x', from: [0, 0], to: [10, 0], at: -18, text: '10', outside: true, bad: true },
  { k: 'lin', axis: 'x', from: [10, 0], to: [70, 0], at: -18, text: '60', bad: true },
];

ROD_SUPPORT.faults = [
  '24 Dia, Dia 8 and Rad 4 mm spell the symbol out — and write mm on a drawing already in mm.',
  'The boss size 40 is measured and written straight across the metal.',
  '80 and 10 are bare numbers on the part, with no dimension line and no arrows.',
  'The overall 80 is drawn inside the 10 and 60 it contains; the lanes run the wrong way.',
  '14 is measured inside the view, and its projection lines never reach the feature.',
  'Nothing tells the bore and the boss apart.',
];

ROD_SUPPORT.fixes = [
  'ø24, ø40, ø8 and R4 — symbol first, no words, no units.',
  'Each circle carries a diameter line through its own centre, out to a value on clear paper.',
  'Every size has a dimension line with an arrow at each end.',
  'Lanes grow outwards: 10 and 60 nearest the part, the overall 80 outside them.',
  '14 is taken out to the right, its projection lines springing from the hidden edges.',
  'Combined: the four holes are located parallel from the datum edges, the length in one chain.',
];

/**
 * The four examples, in the chapter's own order — simplest arrangement first.
 * @type {ReadonlyArray<object>}
 */
export const REVIEW_FIGURES = Object.freeze([L_PLATE, LOCK_PLATE, TEMPLATE, ROD_SUPPORT]
  .map((f) => Object.freeze(f)));

/** @param {string} id @returns {object|undefined} */
export const reviewFigure = (id) => REVIEW_FIGURES.find((f) => f.id === id);
