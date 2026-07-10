// Textbook Problem Library — pure data + tiny helpers (a leaf layer).
//
// SIMPLE-POSITIONS build: every problem is a "simple position" from N.D. Bhatt
// Ch. 13 — the solid's axis is PERPENDICULAR to one reference plane and parallel
// to the other (never inclined). The two families are axis ⟂ HP (base on the HP)
// and axis ⟂ VP (base on the VP); base ORIENTATION (turn about the axis / orient
// to a corner) varies within each.
//
// Each problem stores a TARGET the student must reproduce BY HAND: the feature
// teaches the translation skill (word problem → 3D setup), so nothing is auto-
// filled. The self-check (src/problemLibrary.js) compares the live `sim.state()`
// + `sim.modes()` against `target` with tolerances — i.e. it matches the RAW input
// the student dials.
//
// UNITS: dimensions are stored in the engine's world units (1 unit = 10 mm). The
// dock shows lengths in millimetres, so the verbatim textbook figures (e.g. "axis
// 65 mm") are what the learner dials. Targets stay inside the slider ranges:
// length 5–70 mm, dist 0–50 mm, rotationY 0–360°.

import { ShapeType } from './shapeData.js';

/**
 * Ordered configuration tiers. `id` is matched against each problem's `tier` and
 * against `ENABLED_TIERS`; `label` heads the group in the library overlay. Order
 * here is the display order (easiest → hardest), mirroring the topic progression.
 * @type {ReadonlyArray<{id:string,label:string,blurb:string}>}
 */
export const TIERS = Object.freeze([
  { id: 'base',        label: 'Axis perpendicular to the HP',       blurb: 'Base on the HP, axis upright; a side or edge square to the VP.' },
  { id: 'corner-edge', label: 'Axis ⟂ HP — base turned',           blurb: 'Base on the HP, turned about the vertical axis to a corner or an angle.' },
  { id: 'axis-vp',     label: 'Axis perpendicular to the VP',       blurb: 'Base on the VP, axis horizontal; turned about the axis as the problem states.' },
]);

/**
 * The SINGLE clone flag. This Simple-Positions build enables only the two
 * simple-position families (axis ⟂ HP, with or without a base turn, and axis ⟂ VP).
 * Any problem whose tier is absent here is filtered out of the library.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_TIERS = Object.freeze(['base', 'corner-edge', 'axis-vp']);

/**
 * Human labels for every field the self-check may report as "still differs". Keyed
 * by ShapeData field, plus the orient mode flag. Lives here beside the target keys
 * so a new target field has one obvious place to gain a label.
 * @type {Readonly<Record<string,string>>}
 */
export const FIELD_LABELS = Object.freeze({
  shape: 'shape',
  baseLength: 'base length',
  height: 'height',
  distHP: 'distance from HP',
  distVP: 'distance from VP',
  restingPlane: 'resting plane',
  distVPRef: 'VP distance reference',
  rotationY: 'turn about the axis',
  orientToCorner: 'orient to corner / edge',
});

/**
 * @typedef {Object} Problem
 * @property {string} id        Stable unique id.
 * @property {string} tier      One of TIERS[].id.
 * @property {string} title     Short card title.
 * @property {string} statement Full word-problem text (shown in the panel header).
 * @property {string[]} [hints] Optional ordered reasoning steps, revealed ONE AT A TIME
 *                              behind the banner's "Need a hint?" button (concept →
 *                              clause-mapping → concrete control setting). Scaffolds the
 *                              word-problem → 3D-setup translation without dumping the
 *                              answer (textbook-fidelity preference).
 * @property {Object} target    Subset of ShapeData fields to match, plus an optional
 *                              `modes` object. ONLY the keys present are checked — a field
 *                              the textbook does not specify (e.g. an unstated V.P. distance
 *                              that affects neither the true shape nor the inclination) is
 *                              left OUT, never pinned to an arbitrary value, so the student
 *                              may set it freely. Omission is the "don't-care" mechanism.
 */

/**
 * The eight problems. Statements are N.D. Bhatt verbatim (or his universal five-part
 * exercise: base 40 mm side / 50 mm dia, axis 65 mm). `restingPlane` fixes the
 * axis-⟂ family; the base-orientation clause is encoded EITHER as a manual `rotationY`
 * with `modes.orientToCorner: false` (a turned-by-hand answer) OR as `modes.orientToCorner:
 * true` with no `rotationY` (the preset IS the answer — e.g. "edge/side parallel to the
 * V.P."). Pin `orientToCorner: false` only when the shape's preset angle differs from the
 * intended manual turn; where they coincide (the pentagonal prism's 180°) or the solid is
 * rotationally symmetric (cylinder), leave orientation unpinned so both paths pass.
 * `distVPRef: 'axis'` is used where Bhatt quotes the axis/apex distance for a turned solid.
 * A distance the statement does NOT give (e.g. "an edge parallel to the V.P." with no V.P.
 * figure) is OMITTED from `target` so it stays free — see the `target` @property note above.
 * @type {ReadonlyArray<Problem>}
 */
export const PROBLEMS = Object.freeze([
  // ---- Axis ⟂ HP (base on the HP, a side/edge square to the VP) ----
  {
    id: 'pentpyr-base-edge',
    tier: 'base',
    title: 'Pentagonal pyramid on its base',
    statement: 'Draw the projections of a pentagonal pyramid, base 30 mm edge and axis 50 mm long, having its base on the H.P. and an edge of the base parallel to the V.P. Also draw its side view.',
    hints: [
      'Base on the H.P. with the axis upright — a simple position (the axis is never tilted).',
      'An edge of the base parallel to the V.P. is a base orientation, not the rest pose. Achieve it either way: turn on “Orient to corner / edge”, or manually adjust “Rotation Y” (turn about the axis) until a base edge runs parallel to the V.P.',
      'The problem fixes no V.P. distance, so it is free — any convenient distance in front of the V.P. works; the top view and true shape are unaffected.',
    ],
    // "An edge parallel to the V.P." is the orient-to-corner preset, NOT the default
    // pose: rotationY 0 sits the pentagon with a flat edge PERPENDICULAR to the V.P.,
    // so the preset (−54°, see orientationAngle) is what swings the opposite edge
    // parallel to the V.P. with the base corner pointing toward it. distVP intentionally
    // omitted — the statement gives no V.P. distance, so it is left free.
    target: { shape: ShapeType.PentagonalPyramid, baseLength: 3, height: 5, restingPlane: 'HP', distHP: 0, modes: { orientToCorner: true } },
  },
  {
    id: 'hexpyr-side-vp',
    tier: 'base',
    title: 'Hexagonal pyramid, side parallel to the VP',
    statement: 'A hexagonal pyramid, base 40 mm side and axis 65 mm long, has its base on the H.P. and a side of the base parallel to and 25 mm in front of the V.P. Draw its projections.',
    hints: [
      'Base on the H.P., axis upright — a simple position.',
      'A side of the base parallel to the V.P. is a base orientation. Achieve it either way: turn on “Orient to corner / edge”, or manually adjust “Rotation Y” (turn about the axis) until a base side runs parallel to the V.P.',
      '“25 mm in front of the V.P.” sets the nearest side: Distance from VP = 25 mm (measured to the nearest point).',
    ],
    // "A side parallel to the V.P." is the orient-to-edge preset (30° for the hexagon),
    // NOT the default pose: rotationY 0 sits a flat edge PERPENDICULAR to the V.P.; the
    // preset turns a side parallel to the V.P. at ±X. distVP 2.5 seats the near (−X) side
    // 25 mm in front of the V.P., per the statement.
    target: { shape: ShapeType.HexagonalPyramid, baseLength: 4, height: 6.5, restingPlane: 'HP', distHP: 0, distVP: 2.5, modes: { orientToCorner: true } },
  },

  // ---- Axis ⟂ HP, base turned about the vertical axis ----
  {
    id: 'cube-equal-vp',
    tier: 'corner-edge',
    title: 'Cube, faces equally inclined to the VP',
    statement: 'A cube of 50 mm long edges is resting on the H.P. with its vertical faces equally inclined to the V.P. Draw its projections.',
    hints: [
      'Resting on the H.P., axis upright — a simple position.',
      'Vertical faces equally inclined to the V.P. means a corner faces the V.P. Achieve it either way: turn on “Orient to corner / edge”, or manually adjust “Rotation Y” (turn about the axis) until the vertical faces are equally inclined (a corner toward the V.P.).',
      'No V.P. distance is given, so it is free — any convenient distance in front of the V.P. works; only the equal inclination matters.',
    ],
    // distVP intentionally omitted: the statement specifies no V.P. distance (see doc block).
    target: { shape: ShapeType.Cube, baseLength: 5, height: 5, restingPlane: 'HP', distHP: 0, modes: { orientToCorner: true } },
  },
  {
    id: 'sqprism-side30',
    tier: 'corner-edge',
    title: 'Square prism, side 30° to the VP',
    statement: 'A square prism, base 40 mm side and axis 65 mm long, has its base on the H.P., a side of the base inclined at 30° to the V.P. and the axis 50 mm in front of the V.P. Draw its projections.',
    hints: [
      'A simple position keeps the axis perpendicular to its resting plane — base on the H.P., axis upright (no tilt).',
      '“A side inclined at 30° to the V.P.” is a manual turn about the vertical axis: set the turn to 30° and leave “Orient to corner” off.',
      '“Axis 50 mm in front of the V.P.” is measured to the central axis, not the nearest corner. Set “VP distance measured to → Axis”, then Distance from VP = 50 mm.',
    ],
    // orientToCorner pinned false: the answer is the manual 30° turn, and the square
    // preset (45°) is a different pose — without the pin a student could enable it and
    // pass on a stale rotationY. (Pin false only where preset ≠ the intended turn.)
    target: { shape: ShapeType.SquarePrism, baseLength: 4, height: 6.5, restingPlane: 'HP', distHP: 0, rotationY: 30, distVPRef: 'axis', distVP: 5, modes: { orientToCorner: false } },
  },
  {
    id: 'tripyr-edge45',
    tier: 'corner-edge',
    title: 'Triangular pyramid, edge 45° to the VP',
    statement: 'A triangular pyramid, base 40 mm side and axis 65 mm long, has its base on the H.P. and an edge of the base inclined at 45° to the V.P.; the apex is 40 mm in front of the V.P. Draw its projections.',
    hints: [
      'Base on the H.P., axis upright — a simple position.',
      '“An edge of the base inclined at 45° to the V.P.” is a manual turn about the vertical axis: set the turn to 45° with “Orient to corner” off.',
      '“The apex 40 mm in front of the V.P.” is the axis distance (the apex sits on the axis). Set “VP distance measured to → Axis”, then Distance from VP = 40 mm.',
    ],
    // orientToCorner pinned false: the answer is the manual 45° turn; the triangular
    // preset (30°) is a different pose.
    target: { shape: ShapeType.TriangularPyramid, baseLength: 4, height: 6.5, restingPlane: 'HP', distHP: 0, rotationY: 45, distVPRef: 'axis', distVP: 4, modes: { orientToCorner: false } },
  },

  // ---- Axis ⟂ VP (base on the VP, axis horizontal) ----
  {
    id: 'sqpyr-base-vp',
    tier: 'axis-vp',
    title: 'Square pyramid, base in the VP',
    statement: 'A square pyramid, base 40 mm side and axis 65 mm long, has its base in the V.P. One edge of the base is inclined at 30° to the H.P. and a corner contained by that edge is on the H.P. Draw its projections.',
    hints: [
      '“Base in the V.P.” lays the solid down — choose the V.P. as the resting plane (the axis becomes horizontal). Distance from VP = 0 puts the base exactly in the plane.',
      '“One edge of the base inclined at 30° to the H.P.” is a turn about the axis: set the turn to 30° with “Orient to corner” off.',
      '“A corner on the H.P.” then follows from that turn — the lowest base corner rests on the floor, so Distance from HP = 0.',
    ],
    // orientToCorner pinned false: the answer is the manual 30° turn (one base edge
    // inclined 30° to the H.P.); the square-pyramid preset (45°) is a different pose.
    target: { shape: ShapeType.Pyramid, baseLength: 4, height: 6.5, restingPlane: 'VP', distVP: 0, distHP: 0, rotationY: 30, modes: { orientToCorner: false } },
  },
  {
    id: 'cyl-axis-vp',
    tier: 'axis-vp',
    title: 'Cylinder, axis ⟂ to the VP',
    statement: 'A cylinder, base 50 mm diameter and axis 65 mm long, has its axis perpendicular to the V.P. and 40 mm above the H.P., with one end 20 mm in front of the V.P. Draw its projections.',
    hints: [
      '“Axis perpendicular to the V.P.” lays the cylinder down — choose the V.P. as the resting plane.',
      'Distance from HP is the lowest point, not the axis. The axis is 40 mm up on a 50 mm-dia (25 mm radius) cylinder, so the lowest point is 40 − 25 = 15 mm → Distance from HP = 15 mm.',
      '“One end 20 mm in front of the V.P.” → Distance from VP = 20 mm.',
    ],
    // distHP is the LOWEST-point clearance (seatOnPlanes seats minY at distHP), not the
    // axis. The axis 40 mm above the H.P. on a 50 mm-dia cylinder (r = 25 mm) leaves the
    // lowest point at 40 − 25 = 15 mm → distHP 1.5. Orientation is don't-care (the cylinder
    // is rotationally symmetric, so no rotationY / orientToCorner pin).
    target: { shape: ShapeType.Cylinder, baseLength: 5, height: 6.5, restingPlane: 'VP', distHP: 1.5, distVP: 2 },
  },
  {
    id: 'pentprism-axis-vp',
    tier: 'axis-vp',
    title: 'Pentagonal prism, axis ⟂ to the VP',
    statement: 'A pentagonal prism, base 40 mm side and axis 65 mm long, has a rectangular face parallel to and 10 mm above the H.P., its axis perpendicular to the V.P. and one base in the V.P. Draw its projections.',
    hints: [
      '“Axis perpendicular to the V.P.”, “one base in the V.P.” — lay the prism down: resting plane V.P., Distance from VP = 0.',
      '“A rectangular face parallel to the H.P.” needs a flat face at the bottom: turn it a half-turn — set the turn to 180° (a vertex points up, not a corner down).',
      '“10 mm above the H.P.” is the gap under that resting face → Distance from HP = 10 mm.',
    ],
    // rotationY: 180 lays a rectangular face flat-down. The pentagon's vertices sit at
    // 0/72/144/216/288°; after the VP lay-down a vertex's height ∝ −cos(θ − rotationY),
    // so rotationY 0 puts a CORNER at the bottom (wrong) while 180 (an edge midpoint) seats
    // a FACE at the bottom — matching "a rectangular face parallel to the H.P.".
    // orientToCorner deliberately NOT pinned: the pentagonal-prism preset is ALSO 180°
    // (identical pose), so either the manual half-turn or the preset matches ("accept both").
    target: { shape: ShapeType.PentagonalPrism, baseLength: 4, height: 6.5, restingPlane: 'VP', distVP: 0, distHP: 1, rotationY: 180 },
  },
]);

/** Problems whose tier is enabled in this build (the clone-filter). */
export function enabledProblems() {
  return PROBLEMS.filter((p) => ENABLED_TIERS.includes(p.tier));
}

/**
 * Group a problem list into `[{ tier, problems }]` in TIERS order, skipping tiers
 * with no problems. Used to render the overlay's grouped sections.
 * @param {ReadonlyArray<Problem>} list
 * @returns {Array<{ tier: {id:string,label:string,blurb:string}, problems: Problem[] }>}
 */
export function groupByTier(list) {
  return TIERS
    .filter((tier) => ENABLED_TIERS.includes(tier.id))
    .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
    .filter((group) => group.problems.length > 0);
}
