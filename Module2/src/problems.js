// Textbook Problem Library — pure data + tiny helpers (a leaf layer).
//
// Each problem stores a TARGET configuration the student must reproduce BY HAND:
// the feature teaches the translation skill (word problem → 3D setup), so nothing
// is ever auto-filled. The self-check (src/problemLibrary.js) compares the live
// `sim.state()` + `sim.modes()` against `target` with tolerances — i.e. it matches
// the RAW input the student dials, not the rendered pose, so face-inclination
// problems compare cleanly and no rotation/effective-angle math is involved.
//
// Targets are stored in the engine's world units (1 unit = 10 mm); the dock DISPLAYS
// lengths in millimetres (see uiManager SLIDERS `scale`), so statements/hints quote mm.
// Stored targets stay inside the slider ranges: length 0.5–7 (5–70 mm), dist 0–5
// (0–50 mm), angle −90–90, rotationY 0–360.
//
// TIERS double as the clone-filter axis: the four tiers map 1:1 onto the Module 2
// topic split, and `ENABLED_TIERS` is the SINGLE switch a clone flips (a Topic 2
// clone drops 'both-planes'; Topic 3 keeps everything). No other per-clone edits.

import { ShapeType } from './shapeData.js';

/**
 * Ordered configuration tiers. `id` is matched against each problem's `tier` and
 * against `ENABLED_TIERS`; `label` heads the group in the library overlay. Order
 * here is the display order (easiest → hardest), mirroring the topic progression.
 * @type {ReadonlyArray<{id:string,label:string,blurb:string}>}
 */
export const TIERS = Object.freeze([
  { id: 'base',        label: 'Resting on its base',        blurb: 'Axis vertical, solid sitting flat on the HP.' },
  { id: 'corner-edge', label: 'Resting on an edge or corner', blurb: 'Turned about the vertical axis to a corner or edge.' },
  { id: 'one-plane',   label: 'Inclined to one plane',      blurb: 'A face or the axis tilted toward the HP or the VP.' },
  { id: 'both-planes', label: 'Inclined to both planes',    blurb: 'Tilted toward the HP and leaning across the VP at once.' },
]);

/**
 * The SINGLE clone flag. Master enables every tier; a topic clone narrows this to
 * the tiers its locked-down UI can actually solve. Any problem whose tier is absent
 * here is filtered out of the library (so it never hands the learner an unsolvable
 * setup). Topic 2 clone → drop 'both-planes'; Topic 3 clone → keep all.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_TIERS = Object.freeze(['base', 'corner-edge', 'one-plane', 'both-planes']);

/**
 * Human labels for every field the self-check may report as "still differs". Keyed
 * by ShapeData field, plus the three mode flags. Lives here beside the target keys so
 * a new target field has one obvious place to gain a label.
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
  angleHP: 'angle ∠HP',
  angleVP: 'angle ∠VP',
  rotationY: 'rotation',
  faceInclinationHP: 'face inclination to HP',
  faceInclinationVP: 'face inclination to VP',
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
 *                              the textbook does not specify is left OUT, never pinned to an
 *                              arbitrary value, so the student may set it freely.
 */

/**
 * The problem set. `target.modes` carries the rotation-hierarchy flags; face-inclination
 * problems put the target angle on the SAME raw slider the student uses (∠HP for an HP
 * face mode, ∠VP for a VP face mode — see computeEffectiveAngles in main.js). Orient
 * problems check only the `orientToCorner` flag (the preset owns rotationY, so raw
 * rotationY is left unchecked).
 *
 * Each problem also ships a `hints` array — three ordered steps (concept → which clause maps
 * to which control → the concrete control setting) revealed one at a time. `restingPlane: 'HP'`
 * is pinned on every problem (the master solids all rest on the HP foundation; switching to VP
 * is flagged). `orientToCorner: false` is pinned where the answer is a SPECIFIC fixed turn that
 * the shape's orient preset would otherwise override (so the preset can't pass on a stale turn).
 * @type {ReadonlyArray<Problem>}
 */
export const PROBLEMS = Object.freeze([
  // ---- Resting on its base (axis ⟂ HP) ----
  {
    id: 'sqprism-base',
    tier: 'base',
    title: 'Square prism on its base',
    statement: 'A square prism with a base edge of 25 mm and a height of 35 mm rests on the HP on its base, with a rectangular face parallel to and 15 mm in front of the VP. Set it up and draw its three views.',
    hints: [
      'Resting on its base on the HP keeps the axis upright — a square prism standing straight, with no inclination either way.',
      '“A rectangular face parallel to the VP” means it is NOT turned: leave Turn about the axis at 0° and Orient to corner off, so a flat face squares up to the VP.',
      '“15 mm in front of the VP” is measured to that face: set Distance from HP = 0 (on the floor) and Distance from VP = 15 mm.',
    ],
    target: { shape: ShapeType.SquarePrism, baseLength: 2.5, height: 3.5, restingPlane: 'HP', distHP: 0, distVP: 1.5, angleHP: 0, angleVP: 0, rotationY: 0, modes: { orientToCorner: false } },
  },
  {
    id: 'cyl-base',
    tier: 'base',
    title: 'Cylinder on its base',
    statement: 'A cylinder of diameter 30 mm and height 40 mm stands on the HP on its base, its axis 15 mm in front of the VP. Draw its projections.',
    hints: [
      'A cylinder standing on its base on the HP — axis vertical, no inclination.',
      'A cylinder is round, so there is no corner to turn to: its base orientation does not matter here.',
      '“Axis 15 mm in front of the VP” is measured to the centre line, not the nearest rim. Set VP distance measured to → Axis, then Distance from VP = 15 mm and Distance from HP = 0.',
    ],
    // distVPRef 'axis': the statement quotes the AXIS distance, and for a 3-unit-dia cylinder
    // (r = 1.5) the nearest rim sits 1.5 in front of the axis — so a nearest-point pin of 1.5
    // would place the axis at 3.0 (wrong). rotationY omitted (rotationally symmetric).
    target: { shape: ShapeType.Cylinder, baseLength: 3, height: 4, restingPlane: 'HP', distHP: 0, distVPRef: 'axis', distVP: 1.5, angleHP: 0, angleVP: 0 },
  },
  {
    id: 'hexprism-base',
    tier: 'base',
    title: 'Hexagonal prism on its base',
    statement: 'A hexagonal prism with a base edge of 15 mm and a height of 40 mm rests on the HP on its base, with one rectangular face parallel to the VP and 20 mm in front of it. Draw its three views.',
    hints: [
      'A hexagonal prism resting on its base — axis upright, standing on the HP.',
      '“A rectangular face parallel to the VP” fixes the turn: leave Turn about the axis at 0° (a flat face faces the VP) and Orient to corner off.',
      '“20 mm in front of the VP” is measured to that face: Distance from VP = 20 mm, Distance from HP = 0.',
    ],
    target: { shape: ShapeType.HexagonalPrism, baseLength: 1.5, height: 4, restingPlane: 'HP', distHP: 0, distVP: 2, angleHP: 0, angleVP: 0, rotationY: 0, modes: { orientToCorner: false } },
  },

  // ---- Resting on an edge or corner (orient-to-corner preset; axis still vertical) ----
  {
    id: 'pentpyr-corner',
    tier: 'corner-edge',
    title: 'Pentagonal pyramid, corner forward',
    statement: 'A pentagonal pyramid with a base edge of 20 mm and an axis 35 mm long rests on the HP on its base, turned so that a base corner points toward the observer (toward the VP), 15 mm in front of the VP. Draw its projections.',
    hints: [
      'Resting on its base on the HP — axis vertical. The only twist is how it is turned about that axis.',
      '“A base corner points toward the VP” is the orient preset: turn on Orient to corner (or hand-dial Turn about the axis until a base corner faces the VP).',
      '“15 mm in front of the VP” is measured to that nearest corner: Distance from VP = 15 mm, Distance from HP = 0.',
    ],
    target: { shape: ShapeType.PentagonalPyramid, baseLength: 2, height: 3.5, restingPlane: 'HP', distHP: 0, distVP: 1.5, modes: { orientToCorner: true } },
  },
  {
    id: 'cube-edge',
    tier: 'corner-edge',
    title: 'Cube turned 45° to the VP',
    statement: 'A cube of edge 20 mm rests on the HP, turned about its vertical axis so that its vertical faces are equally inclined (45°) to the VP, 10 mm in front of the VP. Draw its three views.',
    hints: [
      'A cube on the HP — axis vertical; the question is only about its turn.',
      '“Vertical faces equally inclined to the VP” means a vertical edge faces the VP — the 45° orient preset: turn on Orient to corner (or set Turn about the axis to 45°).',
      '“10 mm in front of the VP” is measured to that nearest edge: Distance from VP = 10 mm, Distance from HP = 0.',
    ],
    target: { shape: ShapeType.Cube, baseLength: 2, height: 2, restingPlane: 'HP', distHP: 0, distVP: 1, modes: { orientToCorner: true } },
  },

  // ---- Inclined to ONE plane (face inclination HP or VP) ----
  {
    id: 'sqpyr-face-hp',
    tier: 'one-plane',
    title: 'Square pyramid, face 45° to HP',
    statement: 'A square pyramid with a base edge of 20 mm and an axis 30 mm long is tilted until one of its triangular faces is inclined at 45° to the HP. Set that face toward the HP, 15 mm in front of the VP, and draw its projections.',
    hints: [
      'This is a face-inclination problem: the solid tips onto a slanted face until that face makes the set angle with the HP — the engine works out the exact tilt for you.',
      '“One triangular face inclined at 45° to the HP” → turn on Face inclination → HP, then set Angle ∠HP to 45°.',
      'Seat it on that face and place it: Distance from HP = 0, Distance from VP = 15 mm.',
    ],
    target: { shape: ShapeType.Pyramid, baseLength: 2, height: 3, restingPlane: 'HP', distHP: 0, distVP: 1.5, angleHP: 45, modes: { faceInclinationHP: true } },
  },
  {
    id: 'cone-face-hp',
    tier: 'one-plane',
    title: 'Cone, generator 30° to HP',
    statement: 'A cone of base diameter 30 mm and axis 40 mm is tilted so that its slant surface is inclined at 30° to the HP. Rest it toward the HP, 20 mm in front of the VP, and draw its three views.',
    hints: [
      'A cone’s slant surface plays the role of a face: tip the cone until that slant meets the HP at the set angle.',
      '“Slant surface inclined at 30° to the HP” → turn on Face inclination → HP, then Angle ∠HP = 30°.',
      'Rest it on that slant line and place it: Distance from HP = 0, Distance from VP = 20 mm.',
    ],
    target: { shape: ShapeType.Cone, baseLength: 3, height: 4, restingPlane: 'HP', distHP: 0, distVP: 2, angleHP: 30, modes: { faceInclinationHP: true } },
  },
  {
    id: 'tripyr-face-vp',
    tier: 'one-plane',
    title: 'Triangular pyramid, face 30° to VP',
    statement: 'A triangular pyramid with a base edge of 25 mm and an axis 30 mm long is tilted until one of its faces is inclined at 30° to the VP. Set that face toward the VP, 15 mm above the HP, and draw its projections.',
    hints: [
      'Face inclination to the VP: the solid leans onto a slant face until that face lies at the set angle to the VP (the wall).',
      '“One face inclined at 30° to the VP” → turn on Face inclination → VP, then Angle ∠VP = 30°.',
      'Set that face against the VP and lift it clear of the floor: Distance from VP = 0, Distance from HP = 15 mm.',
    ],
    target: { shape: ShapeType.TriangularPyramid, baseLength: 2.5, height: 3, restingPlane: 'HP', distHP: 1.5, distVP: 0, angleVP: 30, modes: { faceInclinationVP: true } },
  },

  // ---- Inclined to BOTH planes (dual manual inclination — filtered out in the Topic 2 clone) ----
  {
    id: 'sqpyr-both',
    tier: 'both-planes',
    title: 'Square pyramid, inclined both ways',
    statement: 'A square pyramid with a base edge of 20 mm and an axis 30 mm long has its axis inclined 30° to the HP and 30° to the VP at the same time, standing 5 mm clear of each plane. Draw its three views.',
    hints: [
      'Inclined to BOTH planes: the axis itself leans toward the HP and across the VP at once — use the two angle sliders together, not face inclination.',
      '“30° to the HP and 30° to the VP” → Angle ∠HP = 30 and Angle ∠VP = 30 (leave the orient preset and face inclination off).',
      '“5 mm clear of each plane” → Distance from HP = 5 mm and Distance from VP = 5 mm.',
    ],
    target: { shape: ShapeType.Pyramid, baseLength: 2, height: 3, restingPlane: 'HP', distHP: 0.5, distVP: 0.5, angleHP: 30, angleVP: 30, rotationY: 0, modes: { orientToCorner: false } },
  },
  {
    id: 'hexprism-both',
    tier: 'both-planes',
    title: 'Hexagonal prism, inclined both ways',
    statement: 'A hexagonal prism with a base edge of 15 mm and a height of 35 mm is tilted 20° to the HP and leaned 30° to the VP, standing 5 mm clear of each plane. Draw its projections.',
    hints: [
      'Both-plane inclination: tilt the axis toward the HP and lean it across the VP at the same time, with the two angle sliders.',
      '“20° to the HP and 30° to the VP” → Angle ∠HP = 20, Angle ∠VP = 30 (no orient preset, no face inclination).',
      '“5 mm clear of each plane” → Distance from HP = 5 mm, Distance from VP = 5 mm.',
    ],
    target: { shape: ShapeType.HexagonalPrism, baseLength: 1.5, height: 3.5, restingPlane: 'HP', distHP: 0.5, distVP: 0.5, angleHP: 20, angleVP: 30, rotationY: 0, modes: { orientToCorner: false } },
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
