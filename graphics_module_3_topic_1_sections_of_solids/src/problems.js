// Textbook Problem Library — DATA LAYER (Sections of Solids).
//
// Every problem asks the learner to SET UP the cut BY HAND: pick the solid (Step 1) and
// dial the cutting plane (Step 2). The self-check (src/problemLibrary.js) compares the
// live sim.state() + sim.sectionState() against `target` with tolerances — it matches the
// RAW input the student dials and never auto-fills anything. Statements are the user's
// verbatim textbook text (N.D. Bhatt); `setup` stamps the quoted solid dimensions on load
// because this topic ships NO size controls (Step 1 is the shape picker only), so the
// dims are injected scenery, never a checked answer.
//
// KTU 2024 syllabus constraint — "Exclude true shape given problems" (module CLAUDE.md
// "Section-cut engine", ADR-062): the exclusion is a dedicated `type` axis with a
// HARD filter in enabledProblems(), not an authoring convention. A problem typed
// 'true-shape-given' (the true shape handed to the learner, to be reverse-engineered)
// can never reach the library UI regardless of its tier.
//
// UNITS: dimensions are stored in the engine's world units (1 unit = 10 mm), matching
// ShapeData. Section targets use the STORED units too: angleDeg raw degrees, offset in
// world units (the dock shows mm; uiManager owns the ×10 display scale).

import { ShapeType } from './shapeData.js';

/**
 * Ordered configuration tiers. `id` is matched against each problem's `tier` and against
 * `ENABLED_TIERS`; `label` heads the group in the library overlay. Display order mirrors
 * the topic progression: plane-faced sections first, then the conic sections.
 * @type {ReadonlyArray<{id:string,label:string,blurb:string}>}
 */
export const TIERS = Object.freeze([
  { id: 'flat',  label: 'Plane-faced solids',                          blurb: 'Prisms and pyramids — the section is a straight-edged polygon.' },
  { id: 'conic', label: 'Conic sections — cutting the cylinder and cone', blurb: 'An inclined plane through a curved solid cuts an ellipse, a parabola or a hyperbola, depending on its slope.' },
]);

/**
 * The single clone-scope switch — the tiers this build can actually solve.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_TIERS = Object.freeze(['flat', 'conic']);

/**
 * Problem TYPES that are structurally banned from the library (ADR-062, KTU 2024:
 * "Exclude true shape given problems"). enabledProblems() filters on this list, so a
 * 'true-shape-given' problem cannot surface even if authored with an enabled tier.
 * @type {ReadonlyArray<string>}
 */
export const EXCLUDED_TYPES = Object.freeze(['true-shape-given']);

/**
 * Human labels for every field the self-check may report as "still differs". `shape`
 * comes from ShapeData; the rest are SectionState keys, plus the synthetic `cut` guard
 * (the plane must actually intersect the solid — reported when everything else matches
 * but the dialled plane misses it entirely).
 * @type {Readonly<Record<string,string>>}
 */
export const FIELD_LABELS = Object.freeze({
  shape: 'solid',
  enabled: 'section plane on',
  orientation: 'plane orientation',
  angleDeg: 'plane inclination',
  offset: 'plane position',
  cut: 'the plane must cut the solid',
});

/**
 * @typedef {Object} Problem
 * @property {string} id        Stable unique id.
 * @property {string} tier      One of TIERS[].id.
 * @property {string} type      Problem-type axis (ADR-062). 'find-true-shape' is the
 *                              only shippable type; anything in EXCLUDED_TYPES is banned.
 * @property {string} title     Short card title.
 * @property {string} statement Full word-problem text, VERBATIM from the textbook.
 * @property {string[]} [hints] Ordered reasoning steps, revealed ONE AT A TIME behind the
 *                              banner's "Need a hint?" button (concept → clause-mapping →
 *                              concrete control setting). Scaffolds the translation
 *                              without dumping the answer.
 * @property {{baseLength:number, height:number}} setup  The statement's solid PROPORTIONS
 *                              at bench scale (quoted mm × 0.04, i.e. a uniform ×0.4 on
 *                              world units), committed on load. Injected, never checked:
 *                              this topic has no size controls or mm readouts, so only the
 *                              proportions are visible — and every checked quantity is
 *                              ratio-derived (the generator angle atan(2·height ÷
 *                              baseLength) is scale-invariant; checked offsets are 0).
 *                              Full-scale dims (e.g. a Ø 75 mm cone = 7.5 u) overflow the
 *                              topic's fixed camera framing, verified live.
 * @property {Object} target    What the learner must dial. `shape` is the Step-1 pick;
 *                              `section` is a subset of SectionState. ONLY the keys
 *                              present are checked — omission is the "don't-care"
 *                              mechanism. `angleDeg: 'generator'` is a derived target,
 *                              resolved live as atan(2·height ÷ baseLength) so a plane
 *                              parallel to a cone's end generator checks against the
 *                              actual solid on the bench (ADR-063). `offset` is
 *                              checked only where the statement maps 1:1 onto the control
 *                              ("bisecting the axis" → 0); a quoted axis point that would
 *                              need the learner to derive a normal-offset is left free,
 *                              and the cuts-the-solid guard keeps a missed plane red.
 */

/**
 * The four problems. Statements verbatim (user-supplied textbook text). All are
 * type 'find-true-shape' — the learner derives the true shape; none hand it over.
 * @type {ReadonlyArray<Problem>}
 */
export const PROBLEMS = Object.freeze([
  // ---- Plane-faced solids ----
  {
    id: 'sqpyr-45-bisect',
    tier: 'flat',
    type: 'find-true-shape',
    title: 'Square pyramid, plane at 45° bisecting the axis',
    statement: 'A square pyramid, base 40 mm side and axis 65 mm long, has its base on the H.P. and all the edges of the base equally inclined to the V.P. It is cut by a section plane, perpendicular to the V.P., inclined at 45° to the H.P. and bisecting the axis.',
    hints: [
      'Base on the H.P., axis upright. This tool poses the pyramid with its base edges parallel to the V.P. — the “equally inclined” turn is not dialled here, and the sectioning method is unchanged.',
      '“Perpendicular to the V.P., inclined at 45° to the H.P.” is Step 2: switch the section plane on, keep the orientation on HP, and set the inclination to 45°.',
      '“Bisecting the axis” means the plane passes through the middle of the axis — set the plane position to 0 mm.',
    ],
    // The "edges equally inclined to the V.P." clause is a base turn this topic cannot
    // dial (no turn-about-axis control); the sim shows its default pose instead. The cut
    // and true-shape method are identical either way — the deviation is stated in hint 1.
    setup: { baseLength: 1.6, height: 2.6 },
    target: { shape: ShapeType.Pyramid, section: { enabled: true, orientation: 'HP', angleDeg: 45, offset: 0 } },
  },

  // ---- Conic sections ----
  {
    id: 'cyl-ellipse-45',
    tier: 'conic',
    type: 'find-true-shape',
    title: 'Cylinder cut at 45° — ellipse',
    statement: 'A cylinder of 40 mm diameter, 60 mm height and having its axis vertical, is cut by a section plane, perpendicular to the V.P., inclined at 45° to the H.P. and intersecting the axis 32 mm above the base.',
    hints: [
      'An inclined plane through a circular cylinder cuts every element of the curved surface once — the section is an ellipse.',
      '“Perpendicular to the V.P., inclined at 45° to the H.P.” is Step 2: section plane on, orientation HP, inclination 45°.',
      '“Intersecting the axis 32 mm above the base” is just above the middle of the 60 mm axis — slide the plane position until the tinted sheet crosses the axis there. The check accepts any position where the plane still cuts the cylinder.',
    ],
    // offset deliberately unchecked: "32 mm above the base" would require the learner to
    // derive the plane's normal-offset (Δy·cos45° ≈ 1.4 mm) — not a dockable quantity.
    // The cuts-the-solid guard keeps a plane that misses the cylinder from passing.
    setup: { baseLength: 1.6, height: 2.4 },
    target: { shape: ShapeType.Cylinder, section: { enabled: true, orientation: 'HP', angleDeg: 45 } },
  },
  {
    id: 'cone-ellipse-45',
    tier: 'conic',
    type: 'find-true-shape',
    title: 'Cone cut at 45° — ellipse (Fig. 14-20)',
    statement: 'A cone, base 75 mm diameter and axis 80 mm long is resting on its base on the H.P. It is cut by a section plane perpendicular to the V.P., inclined at 45° to the H.P. and cutting the axis at a point 35 mm from the apex.',
    hints: [
      'A plane steeper than the base but flatter than the slant surface crosses every generator once — the section is an ellipse.',
      'This cone’s generators rise at atan(80 ÷ 37.5) ≈ 65° to the H.P., so a 45° plane is flatter than all of them: orientation HP, inclination 45°.',
      '“Cutting the axis at a point 35 mm from the apex”: slide the plane position until the sheet crosses the axis a little less than halfway down from the apex. The check accepts any position where the plane still cuts the cone.',
    ],
    // 45° < the 64.9° generator inclination, and the plane's descending trace clears the
    // 37.5 mm base circle before reaching the base plane — a complete ellipse, no
    // truncation. offset unchecked (quoted axis point, see cyl-ellipse-45 note).
    setup: { baseLength: 3, height: 3.2 },
    target: { shape: ShapeType.Cone, section: { enabled: true, orientation: 'HP', angleDeg: 45 } },
  },
  {
    id: 'cone-parabola',
    tier: 'conic',
    type: 'find-true-shape',
    title: 'Cone cut parallel to a generator — parabola (Fig. 14-28)',
    statement: 'A cone, base 75 mm diameter and axis 100 mm long, has its base on the H.P. A section plane, parallel to one of the end generators and perpendicular to the V.P., cuts the cone intersecting the axis at a point 75 mm from the base.',
    hints: [
      '“Parallel to one of the end generators” is the parabola cut: the plane slopes exactly as steeply as the cone’s slant edge, so it can never cross to the far side of the cone.',
      'A generator’s inclination to the H.P. is atan(axis ÷ base radius) = atan(100 ÷ 37.5) ≈ 69°. Set the orientation to HP and dial the inclination to 69° — or type the exact value.',
      '“Intersecting the axis at a point 75 mm from the base”: slide the plane position until the sheet crosses the axis in the upper quarter. The check accepts any position where the plane still cuts the cone.',
    ],
    // angleDeg 'generator' resolves live to atan(2·height ÷ baseLength) = 69.44° for this
    // cone (scale-invariant: 2·4 ÷ 3 ≡ 2·100 ÷ 75). The ±0.5° self-check tolerance means
    // the integer slider stop (69°) passes — the nearest stop is never more than 0.5° from
    // any derived generator angle — while the numeric field accepts the exact decimal
    // (ADR-063; no "parallel to generator" preset, which would pre-solve the one
    // discovery this problem teaches).
    setup: { baseLength: 3, height: 4 },
    target: { shape: ShapeType.Cone, section: { enabled: true, orientation: 'HP', angleDeg: 'generator' } },
  },
]);

/** Problems whose tier is enabled AND whose type is not banned (ADR-062). */
export function enabledProblems() {
  return PROBLEMS.filter(
    (p) => ENABLED_TIERS.includes(p.tier) && !EXCLUDED_TYPES.includes(p.type),
  );
}

/**
 * Group a problem list into `[{ tier, problems }]` in TIERS order, skipping tiers with no
 * problems. Used to render the overlay's grouped sections.
 * @param {ReadonlyArray<Problem>} list
 * @returns {Array<{ tier: {id:string,label:string,blurb:string}, problems: Problem[] }>}
 */
export function groupByTier(list) {
  return TIERS
    .filter((tier) => ENABLED_TIERS.includes(tier.id))
    .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
    .filter((group) => group.problems.length > 0);
}
