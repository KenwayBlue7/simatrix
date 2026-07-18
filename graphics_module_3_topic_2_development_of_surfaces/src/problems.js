// Textbook Problem Library — DATA LAYER (Development of Surfaces).
//
// Every problem asks the learner to SET UP the development BY HAND: pick the solid
// (Step 1) and — where the statement truncates it — dial the cutting plane (Step 2).
// The self-check (src/problemLibrary.js) compares the live sim.state() +
// sim.sectionState() against `target` with tolerances — it matches the RAW input the
// student dials and never auto-fills anything. Statements are the user's verbatim
// textbook text; `setup` stamps the quoted solid dimensions on load because this topic
// ships NO size controls (Step 1 is the shape picker only), so the dims are injected
// scenery, never a checked answer.
//
// KTU 2024 syllabus constraint — "Exclude problems with through holes" (module
// CLAUDE.md "Syllabus constraint", ADR-065 layer 2 — DONE here): the exclusion is
// a dedicated `type` axis with a HARD filter in enabledProblems(), not an authoring
// convention. A problem typed 'through-hole' (a pierced solid's development) can never
// reach the library UI regardless of its tier — on top of layer 1, where the generator
// family cannot even represent a pierced solid.
//
// Shortest-path ("string"/"ant") problems carry a `path` spec consumed by
// main.js + src/developmentEngine.js: on a MATCHED self-check (never before — the
// reveal is the reward, ADR-070) the sim draws the geodesic as a straight line
// across the unrolled 2D pattern and wraps the same path onto the 3D solid.
//
// UNITS: dimensions are stored in the engine's world units (1 unit = 10 mm), matching
// ShapeData. `setup` uses the topic-1 bench-scale convention (quoted mm × 0.04 — full
// mm scale overflows the fixed camera framing); every checked/derived quantity is
// ratio-based, so the proportions are what matter.

import { ShapeType } from './shapeData.js';

/**
 * Ordered configuration tiers. `id` is matched against each problem's `tier` and
 * against `ENABLED_TIERS`; `label` heads the group in the library overlay. Display
 * order mirrors the KTU method split the whole topic teaches.
 * @type {ReadonlyArray<{id:string,label:string,blurb:string}>}
 */
export const TIERS = Object.freeze([
  { id: 'parallel', label: 'Parallel-Line method — prisms and cylinders', blurb: 'The stretch-out line is the base perimeter laid flat; heights plot as true lengths.' },
  { id: 'radial',   label: 'Radial-Line method — pyramids and cones',     blurb: 'The pattern swings about the apex at true slant length; a straight line on it is the shortest route on the surface.' },
]);

/**
 * The single clone-scope switch — the tiers this build can actually solve.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_TIERS = Object.freeze(['parallel', 'radial']);

/**
 * Problem TYPES that are structurally banned from the library (ADR-065 layer 2,
 * KTU 2024: "Exclude problems with through holes"). enabledProblems() filters on this
 * list, so a 'through-hole' problem cannot surface even if authored with an enabled
 * tier. Shippable types today: 'shortest-path' (string/ant routing) and 'truncation'
 * (cut-solid developments, reserved for future authoring).
 * @type {ReadonlyArray<string>}
 */
export const EXCLUDED_TYPES = Object.freeze(['through-hole']);

/**
 * Human labels for every field the self-check may report as "still differs". `shape`
 * comes from ShapeData; the rest are SectionState keys, plus the synthetic `cut` guard
 * (when a target wants the plane ON it must actually cut the solid).
 * @type {Readonly<Record<string,string>>}
 */
export const FIELD_LABELS = Object.freeze({
  shape: 'solid',
  enabled: 'cutting plane',
  angleDeg: 'plane angle to the H.P.',
  cutHeight: 'cut height',
  cut: 'the plane must cut the solid',
});

/**
 * @typedef {Object} Problem
 * @property {string} id        Stable unique id.
 * @property {string} tier      One of TIERS[].id.
 * @property {string} type      Problem-type axis (ADR-065 layer 2).
 *                              'shortest-path' | 'truncation' are shippable; anything
 *                              in EXCLUDED_TYPES is banned.
 * @property {string} title     Short card title.
 * @property {string} statement Full word-problem text, VERBATIM from the textbook.
 * @property {string[]} [hints] Ordered reasoning steps, revealed ONE AT A TIME behind
 *                              the banner's "Need a hint?" button (concept →
 *                              clause-mapping → concrete control setting).
 * @property {{baseLength:number, height:number}} setup  The statement's solid
 *                              PROPORTIONS at bench scale (quoted mm × 0.04),
 *                              committed on load. Injected, never checked. For turned
 *                              solids baseLength is the DIAMETER (shapeData contract).
 * @property {Object} target    What the learner must dial. `shape` is the Step-1 pick;
 *                              `section` is a subset of SectionState — only the keys
 *                              present are checked (omission = don't-care). Tolerances:
 *                              angleDeg ±0.5°, cutHeight ±0.05 u (problemLibrary.js).
 * @property {{wrap:number, from:'base'|'top', to:'base'|'top'}} [path]  Shortest-path
 *                              spec: `wrap` is the fraction of the full development the
 *                              route spans (1 = right round the solid, 0.5 = to the
 *                              diametrically opposite point); from/to pick the start and
 *                              end rim. Drawn only after the self-check matches.
 */

/**
 * The four problems. Statements verbatim (user-supplied textbook text). All are
 * type 'shortest-path' — the learner sets the solid up, then the shortest route is
 * revealed as a straight line on the development and wrapped back onto the solid.
 * @type {ReadonlyArray<Problem>}
 */
export const PROBLEMS = Object.freeze([
  // ---- Parallel-Line method ----
  {
    id: 'hexprism-ant-diagonal',
    tier: 'parallel',
    type: 'shortest-path',
    title: 'Hexagonal prism — ant to the diametrically opposite top corner',
    statement: 'Draw the development of the lateral surface of a right regular hexagonal prism of 24 mm base edge and 56 mm height. An ant moves on its surface from a corner on the base to the diametrically opposite corner on the top face, by the shortest route along the front side.',
    hints: [
      'A prism unrolls by the Parallel-Line method into a plain rectangle, so the shortest route on the surface is simply a straight line on that flat sheet.',
      '“Diametrically opposite corner on the top face … along the front side” means the ant crosses three of the six faces — half the stretch-out line — while climbing the full 56 mm height.',
      'Pick the Hexagonal Prism in Step 1 and leave the cutting plane off. Once matched, the sheet draws the diagonal: √((3×24)² + 56²) ≈ 91 mm.',
    ],
    setup: { baseLength: 0.96, height: 2.24 },
    target: { shape: ShapeType.HexagonalPrism, section: { enabled: false } },
    path: { wrap: 0.5, from: 'base', to: 'top' },
  },

  // ---- Radial-Line method ----
  {
    id: 'pentpyr-string-round',
    tier: 'radial',
    type: 'shortest-path',
    title: 'Pentagonal pyramid — string round and back',
    statement: 'Draw the development of a pentagonal pyramid of base side 30mm and height 50mm. A string is wound from a corner of the base round the pyramid and back to the same point through the shortest distance.',
    hints: [
      'A pyramid develops as a fan of true-size triangles about the apex. A string pulled tight on the surface becomes a STRAIGHT line on that development.',
      'The string starts and ends at the same base corner after going right round, so on the development it joins the pattern’s two seam corners — both at the true slant-edge length from the apex.',
      'Pick the Pentagonal Pyramid in Step 1 and leave the cutting plane off. Once matched, the chord appears: slant edge ≈ 56 mm, whole fan ≈ 155°, shortest string ≈ 110 mm.',
    ],
    setup: { baseLength: 1.2, height: 2 },
    target: { shape: ShapeType.PentagonalPyramid, section: { enabled: false } },
    path: { wrap: 1, from: 'base', to: 'base' },
  },
  {
    id: 'cone61-string-round',
    tier: 'radial',
    type: 'shortest-path',
    title: 'Cone — point B round the cone and back',
    statement: 'Draw the projections of a cone resting on the ground on its base and show on them, the shortest path by which a point B starting from a point on the circumference of the base and moving around the cone will return to the same point. Base of cone 61 mm diameter; axis 75 mm long.',
    hints: [
      'A cone unrolls into a sector of radius equal to the slant length, with sector angle θ = 360° × r ÷ L. The shortest route round the cone is the straight chord between the sector’s two seam edges.',
      'Here L = √(30.5² + 75²) ≈ 81 mm, so θ = 360 × 30.5 ÷ 81 ≈ 136°. (The statement’s projections construction is the classroom step — this sim shows the path on the development and wrapped on the solid.)',
      'Pick the Cone in Step 1 and leave the cutting plane off. Once matched, the chord appears across the sector — that straight line IS point B’s shortest path.',
    ],
    setup: { baseLength: 2.44, height: 3 },
    target: { shape: ShapeType.Cone, section: { enabled: false } },
    path: { wrap: 1, from: 'base', to: 'base' },
  },
  {
    id: 'cone60-insect-opposite',
    tier: 'radial',
    type: 'shortest-path',
    title: 'Cone — insect to the diametrically opposite base point',
    statement: 'A right circular cone of base diameter 60 mm and height 64 mm resting upon HP on its base. An insect moves from a point on the base edge to the diametrically opposite point on the same edge through a shortest path along the curved surface on front side.',
    hints: [
      'On the unrolled sector, half-way round the base circle is HALF the sector angle — the insect’s route spans θ ÷ 2 of the development, not 180°.',
      'Here L = √(30² + 64²) ≈ 71 mm and θ = 360 × 30 ÷ 71 ≈ 153°, so the chord spans ≈ 76° of the sector between two points on its arc.',
      'Pick the Cone in Step 1 and leave the cutting plane off. Once matched, the chord appears — notice it rises well above the base arc: the tight path climbs toward the apex.',
    ],
    setup: { baseLength: 2.4, height: 2.56 },
    target: { shape: ShapeType.Cone, section: { enabled: false } },
    path: { wrap: 0.5, from: 'base', to: 'base' },
  },
]);

/** Problems whose tier is enabled AND whose type is not banned (ADR-065 layer 2). */
export function enabledProblems() {
  return PROBLEMS.filter(
    (p) => ENABLED_TIERS.includes(p.tier) && !EXCLUDED_TYPES.includes(p.type),
  );
}

/**
 * Group a problem list into `[{ tier, problems }]` in TIERS order, skipping tiers with
 * no problems. Used to render the overlay's grouped sections.
 * @param {ReadonlyArray<Problem>} list
 * @returns {Array<{ tier: {id:string,label:string,blurb:string}, problems: Problem[] }>}
 */
export function groupByTier(list) {
  return TIERS
    .filter((tier) => ENABLED_TIERS.includes(tier.id))
    .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
    .filter((group) => group.problems.length > 0);
}
