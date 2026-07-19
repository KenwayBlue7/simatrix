// lineProblems.js — Problem Library data for the Projection of Straight Lines sim (a leaf layer).
//
// Each problem stores a TARGET the student dials BY HAND. The self-check (src/problemLibrary.js)
// compares the live `sim.state()` (the raw dialled data) against `target` with a ±0.5 tolerance;
// ONLY the keys present are checked.
//
// The Lines sim is a single-case problem-solving stepper: the line is always the GENERAL case
// (LineCase.INCL_BOTH) and the learner dials its true length, position, and inclinations. Controls
// are DEDICATED per step (True Length on step 1, distance from HP/VP on step 2, θ/φ on step 3), so a
// problem routes to the FIRST step (lines.js supplies entryStep → the 'true-length' step) and the
// learner walks the steps setting each value; the self-check fires on every change, so it lights
// green once all match. The old fixed orientation is therefore expressed as explicit angles — the
// square-to-a-plane cases simply pin θ or φ at 0 / 90:
//   parallel to both        → theta 0,  phi 0
//   perpendicular to the HP → theta 90, phi 0      (vertical: top view is a point)
//   perpendicular to the VP → theta 0,  phi 90     (end-on: front view is a point)
//   inclined to one plane   → that plane's angle, the other 0
//   inclined to both        → both angles
// The sim always anchors the line at "end A" (B = A + the line's Δ), so whatever end the statement
// fixes (its lower end, near end, …) is end A → aHP / aVP. Values are in millimetres / degrees and
// stay inside the slider ranges (TL 20–150, aHP/aVP 0–100, angles 0–90, and θ + φ ≤ 90).
//
// Problem set: authentic textbook cases (N.D. Bhatt, Engineering Drawing; K.C. John, Engineering
// Graphics), ramping parallel/perpendicular → inclined to one plane → inclined to both.

/** Ordered tiers (easiest → hardest); `id` matches each problem's `tier`. */
export const TIERS = Object.freeze([
  { id: 'parallel',    label: 'Parallel or perpendicular to a plane', blurb: 'One or both views stay true length — the line is square to the planes.' },
  { id: 'one-incline', label: 'Inclined to one plane',                blurb: 'Tilt to a single plane: one view keeps true length, the other foreshortens.' },
  { id: 'both',        label: 'Inclined to both planes',              blurb: 'The general case — both views are shorter than the true length.' },
]);

/** Human labels for every target field the self-check may report as “still to match”. */
export const FIELD_LABELS = Object.freeze({
  TL:    'true length',
  theta: 'angle with the HP (θ)',
  phi:   'angle with the VP (φ)',
  aHP:   'distance of end A from the HP',
  aVP:   'distance of end A from the VP',
});

/**
 * @typedef {Object} Problem
 * @property {string}   id        Stable unique id.
 * @property {string}   tier      One of TIERS[].id.
 * @property {string}   title     Short card title.
 * @property {string}   statement Full word-problem text (shown in the panel header).
 * @property {string[]} hints     Three ordered scaffolds: concept → which clause maps to which
 *                                 control → the concrete control setting.
 * @property {Object|Object[]} target  Subset of { TL, theta, phi, aHP, aVP } to match — the fields
 *                                 the student dials on the Inclinations step. May also be an ARRAY
 *                                 of equally-valid alternatives (an "OR"); the Lines set currently
 *                                 uses single objects (no degenerate cases here).
 */

/** @type {ReadonlyArray<Problem>} */
export const PROBLEMS = Object.freeze([
  // ── Parallel / perpendicular ────────────────────────────────────────────────
  {
    id: 'ln-parallel-both',
    tier: 'parallel',
    title: 'Parallel to both planes',
    statement: 'A line AB 100 mm long is parallel to both the HP and the VP. It is 40 mm above the HP and 25 mm in front of the VP. Draw its front and top views.',
    hints: [
      'Parallel to both planes is the simplest case — neither view foreshortens, so both equal the true length. The whole line stays at one height and one depth.',
      'There is no tilt to set (θ = 0 and φ = 0); the length is the True Length, and the two distances place end A above the HP and in front of the VP.',
      'Step 1 — True Length = 100; step 2 — distance from HP = 40, from VP = 25; step 3 — θ = 0, φ = 0.',
    ],
    target: { TL: 100, theta: 0, phi: 0, aHP: 40, aVP: 25 },
  },
  {
    id: 'ln-perp-hp',
    tier: 'parallel',
    title: 'Perpendicular to the HP',
    statement: 'A line AB is 36 mm long and perpendicular to the HP. Its lower end A is 12 mm above the HP and 24 mm in front of the VP. Draw its projections — the top view collapses to a point.',
    hints: [
      'Standing straight up off the floor (HP) stacks the line into one spot seen from above — the top view becomes a point. The lower end is end A.',
      'Perpendicular to the HP means θ = 90° (straight up) with no tilt to the VP (φ = 0°); the two distances place that lower end above the HP and in front of the VP.',
      'Step 1 — True Length = 36; step 2 — distance from HP = 12, from VP = 24; step 3 — θ = 90, φ = 0.',
    ],
    target: { TL: 36, theta: 90, phi: 0, aHP: 12, aVP: 24 },
  },

  // ── Inclined to one plane ───────────────────────────────────────────────────
  {
    id: 'ln-incl-hp',
    tier: 'one-incline',
    title: 'Inclined 30° to the HP',
    statement: 'A line AB is 60 mm long, parallel to the VP and inclined at 30° to the HP. Its end A is 20 mm above the HP and 40 mm in front of the VP. Draw its projections and note the foreshortened top view.',
    hints: [
      'Tilted to the HP but parallel to the VP: the front view keeps true length and shows the real angle; the top view shrinks. End A is the lower, near end.',
      'Set the length, then the tilt to the HP (θ = 30°) with no tilt to the VP (φ = 0°), then place end A with the two distance sliders.',
      'Step 1 — True Length = 60; step 2 — distance from HP = 20, from VP = 40; step 3 — θ = 30, φ = 0.',
    ],
    target: { TL: 60, theta: 30, phi: 0, aHP: 20, aVP: 40 },
  },
  {
    id: 'ln-incl-vp',
    tier: 'one-incline',
    title: 'Inclined 45° to the VP',
    statement: 'A line AB is 80 mm long, parallel to the HP and inclined at 45° to the VP. Its end A is 10 mm above the HP and 35 mm in front of the VP. Draw its projections and note the foreshortened front view.',
    hints: [
      'Tilted to the VP but parallel to the HP: now the top view keeps true length and the real angle; the front view shrinks. End A is the near end.',
      'Set the length, then the tilt to the VP (φ = 45°) with no tilt to the HP (θ = 0°), then place end A with the two distance sliders.',
      'Step 1 — True Length = 80; step 2 — distance from HP = 10, from VP = 35; step 3 — θ = 0, φ = 45.',
    ],
    target: { TL: 80, theta: 0, phi: 45, aHP: 10, aVP: 35 },
  },

  // ── Inclined to both planes ─────────────────────────────────────────────────
  {
    id: 'ln-incl-both-simple',
    tier: 'both',
    title: 'Inclined to both planes (simple)',
    statement: 'A line AB, 75 mm long, is inclined at 45° to the HP and 30° to the VP. Its end A is in the HP and 40 mm in front of the VP. Draw its projections; both views come out shorter than the true length.',
    hints: [
      'The general case — tilted away from both planes, so neither view shows true length. “In the HP” means end A’s distance above the HP is zero.',
      'Set the length, then both true inclinations together (valid while θ + φ ≤ 90°), then place end A on the HP and in front of the VP.',
      'Step 1 — True Length = 75; step 2 — distance from HP = 0, from VP = 40; step 3 — θ = 45, φ = 30.',
    ],
    target: { TL: 75, theta: 45, phi: 30, aHP: 0, aVP: 40 },
  },
  {
    id: 'ln-incl-both-extreme',
    tier: 'both',
    title: 'Inclined to both planes (extreme)',
    statement: 'A line AB is 130 mm long. Its end A is 20 mm above the HP and 55 mm in front of the VP. It is inclined at 30° to the HP and 40° to the VP. Draw its projections.',
    hints: [
      'A long line, leaning away from both planes — both views are foreshortened and the apparent angles read larger than the true ones. End A is the near end.',
      'Set the long true length, then both true inclinations (θ + φ = 70° ≤ 90°, so it is a valid line), then place end A with the two distance sliders.',
      'Step 1 — True Length = 130; step 2 — distance from HP = 20, from VP = 55; step 3 — θ = 30, φ = 40.',
    ],
    target: { TL: 130, theta: 30, phi: 40, aHP: 20, aVP: 55 },
  },

  // ══ Batch 2 — K.C. John textbook problems ═══════════════════════════════════
  // ── Parallel / perpendicular ────────────────────────────────────────────────
  {
    id: 'ln-parallel-both-2',
    tier: 'parallel',
    title: 'Parallel to both planes — 70 mm',
    statement: 'A line AB 70 mm long is parallel to both the HP and the VP. Its end A is 30 mm above the HP and 50 mm in front of the VP. Draw its front and top views.',
    hints: [
      'Parallel to both planes is the simplest case — neither view foreshortens, so both equal the true length. The whole line stays at one height and one depth.',
      'There is no tilt to set (θ = 0 and φ = 0); the length is the True Length, and the two distances place end A above the HP and in front of the VP.',
      'Step 1 — True Length = 70; step 2 — distance from HP = 30, from VP = 50; step 3 — θ = 0, φ = 0.',
    ],
    target: { TL: 70, theta: 0, phi: 0, aHP: 30, aVP: 50 },
  },
  {
    id: 'ln-perp-vp',
    tier: 'parallel',
    title: 'Perpendicular to the VP',
    statement: 'A line AB is 50 mm long and perpendicular to the VP. Its end A is 40 mm above the HP and 15 mm in front of the VP. Draw its projections — the front view collapses to a point.',
    hints: [
      'Pointing the line straight at the wall (VP) makes it stack into one spot seen head-on, so the front view becomes a point. End A is the near end.',
      'Perpendicular to the VP means φ = 90° (straight out from the wall) with no tilt to the HP (θ = 0°); the two distances place end A above the HP and in front of the VP.',
      'Step 1 — True Length = 50; step 2 — distance from HP = 40, from VP = 15; step 3 — θ = 0, φ = 90.',
    ],
    target: { TL: 50, theta: 0, phi: 90, aHP: 40, aVP: 15 },
  },

  // ── Inclined to one plane ───────────────────────────────────────────────────
  {
    id: 'ln-incl-hp-2',
    tier: 'one-incline',
    title: 'Inclined 45° to the HP',
    statement: 'A line AB is 80 mm long, parallel to the VP and inclined at 45° to the HP. Its end A is 10 mm above the HP and 35 mm in front of the VP. Draw its projections and note the foreshortened top view.',
    hints: [
      'Tilted to the HP but parallel to the VP: the front view keeps true length and shows the real angle; the top view shrinks. End A is the lower, near end.',
      'Set the length, then the tilt to the HP (θ = 45°) with no tilt to the VP (φ = 0°), then place end A with the two distance sliders.',
      'Step 1 — True Length = 80; step 2 — distance from HP = 10, from VP = 35; step 3 — θ = 45, φ = 0.',
    ],
    target: { TL: 80, theta: 45, phi: 0, aHP: 10, aVP: 35 },
  },
  {
    id: 'ln-incl-vp-2',
    tier: 'one-incline',
    title: 'Inclined 30° to the VP',
    statement: 'A line AB is 70 mm long, parallel to the HP and inclined at 30° to the VP. Its end A is in the HP and 20 mm in front of the VP. Draw its projections and note the foreshortened front view.',
    hints: [
      'Tilted to the VP but parallel to the HP: the top view keeps true length and the real angle; the front view shrinks. “In the HP” means end A’s height above the HP is zero.',
      'Set the length, then the tilt to the VP (φ = 30°) with no tilt to the HP (θ = 0°), then place end A on the HP and in front of the VP.',
      'Step 1 — True Length = 70; step 2 — distance from HP = 0, from VP = 20; step 3 — θ = 0, φ = 30.',
    ],
    target: { TL: 70, theta: 0, phi: 30, aHP: 0, aVP: 20 },
  },

  // ── Inclined to both planes ─────────────────────────────────────────────────
  {
    id: 'ln-incl-both-2',
    tier: 'both',
    title: 'Inclined to both planes — 85 mm',
    statement: 'A line AB is 85 mm long. Its end A is 25 mm above the HP and 30 mm in front of the VP. The line is inclined at 40° to the HP and 30° to the VP. Draw its projections.',
    hints: [
      'The general case — tilted away from both planes, so neither view shows true length. End A is the near end.',
      'Set the length, then both true inclinations together (θ + φ = 70° ≤ 90°, so it is a valid line), then place end A with the two distance sliders.',
      'Step 1 — True Length = 85; step 2 — distance from HP = 25, from VP = 30; step 3 — θ = 40, φ = 30.',
    ],
    target: { TL: 85, theta: 40, phi: 30, aHP: 25, aVP: 30 },
  },
  {
    id: 'ln-incl-both-extreme-2',
    tier: 'both',
    title: 'Inclined to both planes — 120 mm',
    statement: 'A line AB is 120 mm long, inclined at 45° to the HP and 30° to the VP. Its end A is 10 mm above the HP and 40 mm in front of the VP. Draw its projections; both views come out shorter than the true length.',
    hints: [
      'A long line, leaning away from both planes — both views are foreshortened and the apparent angles read larger than the true ones. End A is the near end.',
      'Set the long true length, then both true inclinations (θ + φ = 75° ≤ 90°, so it is a valid line), then place end A with the two distance sliders.',
      'Step 1 — True Length = 120; step 2 — distance from HP = 10, from VP = 40; step 3 — θ = 45, φ = 30.',
    ],
    target: { TL: 120, theta: 45, phi: 30, aHP: 10, aVP: 40 },
  },
]);
