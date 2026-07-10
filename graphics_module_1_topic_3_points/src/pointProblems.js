// pointProblems.js — Problem Library data for the Projection of Points sim (a leaf layer).
//
// Ported VERBATIM from the legacy Module1/src/pointProblems.js (the retired engine.js-based
// Points lesson) so the textbook problem set + tutor voice stay identical across the Module-1
// family. Pure data + no imports — main.js hands { list, tiers, fieldLabels } to
// initProblemLibrary(sim, config) (src/problemLibrary.js), the same generic controller the
// legacy Points/Lines sims shared.
//
// Each problem stores a TARGET the student must reproduce BY HAND — the skill being taught
// is the translation word-problem → 3D setup, so nothing is ever auto-filled. The self-check
// (src/problemLibrary.js) compares the live `sim.state()` (the raw dialled data) against
// `target` with a ±0.5 mm tolerance (ADR-015); ONLY the keys present in `target` are checked,
// so a distance the textbook does not pin is left free.
//
// Values are in millimetres (the Points sim's display unit; 1 world unit = 10 mm, ADR-018,
// harmonised with Module 2; the mm → world remap lives in main.js). Sliders read 0–40 mm, so
// targets stay inside that range. `tier` groups the cards in the library overlay and orders the
// difficulty ramp: first-quadrant basics → the other three quadrants → points lying on a plane.
//
// Problem set: authentic textbook cases (N.D. Bhatt, Engineering Drawing; K.C. John, Engineering
// Graphics). Each statement's "above/below the HP" and "in front of/behind the VP" wording fixes
// the quadrant; the two distances map straight to the distHP / distVP sliders.

/** Ordered tiers (easiest → hardest); `id` matches each problem's `tier`. */
export const TIERS = Object.freeze([
  { id: 'q1',        label: 'First-quadrant basics', blurb: 'Above the HP and in front of the VP — the everyday case.' },
  { id: 'quadrants', label: 'Across the four quadrants', blurb: 'Name the quadrant from “above/below” and “front/behind”, then place the point.' },
  { id: 'on-plane',  label: 'Points lying on a plane', blurb: 'A zero distance puts the point in the HP or the VP itself.' },
]);

/** Human labels for every target field the self-check may report as “still to match”. */
export const FIELD_LABELS = Object.freeze({
  quadrant: 'quadrant',
  distHP:   'distance from the HP',
  distVP:   'distance from the VP',
  distRP:   'distance from the profile plane',
});

/**
 * @typedef {Object} Problem
 * @property {string}   id        Stable unique id.
 * @property {string}   tier      One of TIERS[].id.
 * @property {string}   title     Short card title.
 * @property {string}   statement Full word-problem text (shown in the panel header).
 * @property {string[]} hints     Three ordered scaffolds: concept → which clause maps to which
 *                                 control → the concrete control setting.
 * @property {Object|Object[]} target  Subset of { quadrant, distHP, distVP, distRP } to match.
 *                                 May be an ARRAY of equally-valid alternatives (an "OR") —
 *                                 matching any one passes. Used for on-plane points, where a
 *                                 zero distance makes two (or, at the origin, all four)
 *                                 quadrants coincide, so each is an equally-correct answer.
 */

/** @type {ReadonlyArray<Problem>} */
export const PROBLEMS = Object.freeze([
  // ── First-quadrant basics ──────────────────────────────────────────────────
  {
    id: 'pt-p',
    tier: 'q1',
    title: 'Point P — 30 above HP, 40 in front of VP',
    statement: 'Point P is 30 mm above the HP and 40 mm in front of the VP. Draw its front and top views.',
    hints: [
      'Above the HP and in front of the VP is the everyday first quadrant — both distances are positive, so leave the quadrant selector on Q1.',
      '“Above the HP” is the distance-from-HP control; “in front of the VP” is the distance-from-VP control.',
      'Set Quadrant = Q1, distance from HP = 30, distance from VP = 40.',
    ],
    target: { quadrant: 'Q1', distHP: 30, distVP: 40 },
  },

  // ── Across the four quadrants ───────────────────────────────────────────────
  {
    id: 'pt-c',
    tier: 'quadrants',
    title: 'Point P — 25 above HP, 35 behind VP',
    statement: 'Point P is 25 mm above the HP and 35 mm behind the VP. Name its quadrant and draw its projections.',
    hints: [
      'Above the HP but behind the VP is the second quadrant.',
      'The quadrant comes from the two phrases — “above” + “behind” → Q2 — while the distances are still just height and depth.',
      'Set Quadrant = Q2, distance from HP = 25, distance from VP = 35.',
    ],
    target: { quadrant: 'Q2', distHP: 25, distVP: 35 },
  },
  {
    id: 'pt-a',
    tier: 'quadrants',
    title: 'Point P — 20 below HP, 30 behind VP',
    statement: 'Point P is 20 mm below the HP and 30 mm behind the VP. Name its quadrant and draw its projections.',
    hints: [
      'Below the HP and behind the VP is the third quadrant.',
      'Both phrases are on the “negative” side, so the views land on the opposite sides of the XY line — that is Q3.',
      'Set Quadrant = Q3, distance from HP = 20, distance from VP = 30.',
    ],
    target: { quadrant: 'Q3', distHP: 20, distVP: 30 },
  },
  {
    id: 'pt-d',
    tier: 'quadrants',
    title: 'Point P — 40 below HP, 20 in front of VP',
    statement: 'Point P is 40 mm below the HP and 20 mm in front of the VP. Name its quadrant and draw its projections.',
    hints: [
      'Below the HP but in front of the VP is the fourth quadrant.',
      '“Below” + “in front” → Q4; the numbers are still the height below and the depth in front.',
      'Set Quadrant = Q4, distance from HP = 40, distance from VP = 20.',
    ],
    target: { quadrant: 'Q4', distHP: 40, distVP: 20 },
  },

  // ── Points lying on a plane (a zero distance) ───────────────────────────────
  {
    id: 'pt-m',
    tier: 'on-plane',
    title: 'Point P — in the HP, 30 in front of VP',
    statement: 'Point P is in the HP and 30 mm in front of the VP. Draw its projections and note where the front view falls.',
    hints: [
      'Lying in the HP means its height above the HP is zero — the point sits right on the floor. With it in front of the VP, keep the quadrant on Q1.',
      'A zero height puts the front view p′ on the XY line; the depth still sets the top view.',
      'Set Quadrant = Q1, distance from HP = 0, distance from VP = 30.',
    ],
    // On the HP, in front of the VP → distHP = 0 makes Q1 and Q4 the identical point.
    target: [
      { quadrant: 'Q1', distHP: 0, distVP: 30 },
      { quadrant: 'Q4', distHP: 0, distVP: 30 },
    ],
  },
  {
    id: 'pt-n',
    tier: 'on-plane',
    title: 'Point P — in the VP, 40 above HP',
    statement: 'Point P is in the VP and 40 mm above the HP. Draw its projections and note where the top view falls.',
    hints: [
      'Lying in the VP means its distance in front of the VP is zero — the point sits right on the wall. With it above the HP, keep the quadrant on Q1.',
      'A zero depth puts the top view p on the XY line; the height still sets the front view.',
      'Set Quadrant = Q1, distance from HP = 40, distance from VP = 0.',
    ],
    // On the VP, above the HP → distVP = 0 makes Q1 and Q2 the identical point.
    target: [
      { quadrant: 'Q1', distHP: 40, distVP: 0 },
      { quadrant: 'Q2', distHP: 40, distVP: 0 },
    ],
  },

  // ══ Batch 2 — K.C. John textbook problems ═══════════════════════════════════
  // ── First-quadrant basics ──────────────────────────────────────────────────
  {
    id: 'pt-k',
    tier: 'q1',
    title: 'Point P — 35 above HP, 25 in front of VP',
    statement: 'Point P is 35 mm above the HP and 25 mm in front of the VP. Draw its front and top views.',
    hints: [
      'Above the HP and in front of the VP is the everyday first quadrant — both distances are positive, so leave the quadrant selector on Q1.',
      '“Above the HP” is the distance-from-HP control; “in front of the VP” is the distance-from-VP control.',
      'Set Quadrant = Q1, distance from HP = 35, distance from VP = 25.',
    ],
    target: { quadrant: 'Q1', distHP: 35, distVP: 25 },
  },

  // ── Across the four quadrants ───────────────────────────────────────────────
  {
    id: 'pt-m2',
    tier: 'quadrants',
    title: 'Point P — 22 above HP, 32 behind VP',
    statement: 'Point P is 22 mm above the HP and 32 mm behind the VP. Name its quadrant and draw its projections.',
    hints: [
      'Above the HP but behind the VP is the second quadrant.',
      'The quadrant comes from the two phrases — “above” + “behind” → Q2 — while the distances are still just height and depth.',
      'Set Quadrant = Q2, distance from HP = 22, distance from VP = 32.',
    ],
    target: { quadrant: 'Q2', distHP: 22, distVP: 32 },
  },
  {
    id: 'pt-r',
    tier: 'quadrants',
    title: 'Point P — 32 below HP, 38 behind VP',
    statement: 'Point P is 32 mm below the HP and 38 mm behind the VP. Name its quadrant and draw its projections.',
    hints: [
      'Below the HP and behind the VP is the third quadrant.',
      'Both phrases are on the “negative” side, so the views land on the opposite sides of the XY line — that is Q3.',
      'Set Quadrant = Q3, distance from HP = 32, distance from VP = 38.',
    ],
    target: { quadrant: 'Q3', distHP: 32, distVP: 38 },
  },
  {
    id: 'pt-s',
    tier: 'quadrants',
    title: 'Point P — 36 below HP, 15 in front of VP',
    statement: 'Point P is 36 mm below the HP and 15 mm in front of the VP. Name its quadrant and draw its projections.',
    hints: [
      'Below the HP but in front of the VP is the fourth quadrant.',
      '“Below” + “in front” → Q4; the numbers are still the height below and the depth in front.',
      'Set Quadrant = Q4, distance from HP = 36, distance from VP = 15.',
    ],
    target: { quadrant: 'Q4', distHP: 36, distVP: 15 },
  },

  // ── Points lying on a plane (a zero distance) ───────────────────────────────
  {
    id: 'pt-o',
    tier: 'on-plane',
    title: 'Point P — in the HP, 26 behind VP',
    statement: 'Point P lies in the HP and is 26 mm behind the VP. Draw its projections and note where the top view falls.',
    hints: [
      'Lying in the HP means its height above the HP is zero — the point sits right on the floor. Because it is behind the VP, it belongs to the second quadrant.',
      'A zero height puts the front view p′ on the XY line; “behind the VP” fixes the quadrant as Q2, and the depth sets the top view.',
      'Set Quadrant = Q2, distance from HP = 0, distance from VP = 26.',
    ],
    // On the HP, behind the VP → distHP = 0 makes Q2 and Q3 the identical point.
    target: [
      { quadrant: 'Q2', distHP: 0, distVP: 26 },
      { quadrant: 'Q3', distHP: 0, distVP: 26 },
    ],
  },
  {
    id: 'pt-p2',
    tier: 'on-plane',
    title: 'Point P — in both the HP and the VP',
    statement: 'Point P lies in both the HP and the VP. Draw its projections.',
    hints: [
      'A point on both planes has nowhere left to sit but their meeting line — it lands on the XY line at the origin, so both its distances are zero.',
      'In the HP means zero height; in the VP means zero depth. With both distances zero the quadrant no longer matters — leave it on the default Q1.',
      'Set Quadrant = Q1, distance from HP = 0, distance from VP = 0 — both views fall on the XY line.',
    ],
    // At the origin (both distances 0) all four quadrants collapse to the same point.
    target: [
      { quadrant: 'Q1', distHP: 0, distVP: 0 },
      { quadrant: 'Q2', distHP: 0, distVP: 0 },
      { quadrant: 'Q3', distHP: 0, distVP: 0 },
      { quadrant: 'Q4', distHP: 0, distVP: 0 },
    ],
  },
]);
