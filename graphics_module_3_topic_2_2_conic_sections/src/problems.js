// Textbook Problem Library — DATA LAYER (Conic Sections).
//
// The chapter's own EXERCISES, verbatim (Chapter 6, questions 1–15). Every problem asks
// the learner to SET UP the construction BY HAND: choose the method (Step 5) or the
// eccentricity model (Steps 3 + 5) and dial the quantities the statement gives. The
// self-check (src/problemLibrary.js) compares the live sim.conicState() against `target`
// with tolerances — it matches the RAW input the student dials and never auto-fills
// anything.
//
// UNITS: sheet quantities are stored in MILLIMETRES (ADR-138), so every target below is
// the number the statement itself quotes. The two exceptions are stated in the problem's
// own hints: exercise 5 quotes the minor axis where the intersecting-arc construction is
// given the SUM of the focal distances (the learner derives it), and exercise 9 quotes a
// 1200 mm span drawn to the chapter's own 1:10 scale (Fig. 6.14).
//
// Syllabus exclusion axis (RULES.md §6.21): the `type` field and the `EXCLUDED_TYPES`
// filter are wired exactly as the two sibling Module-3 topics wire theirs, so a future
// syllabus ban is a one-line data change rather than an authoring convention (§6.22).
// Chapter 6 declares no banned KIND of conics problem, so the list ships empty — an empty
// filter is an honest "nothing excluded", not a missing mechanism.
//
// The axis that DOES cut here is the METHOD (ENABLED_METHODS, ADR-212): Course 1003 names
// three constructions and says "only" twice, and neither the tier axis (which cuts by curve)
// nor the type axis (which straddles the line) can express that. Everything the three cannot
// answer — the focus-and-directrix exercises, the parallelogram, arc, rectangle and offset
// methods — stays in this file verbatim and is filtered out of the deal.

import { CurveType } from './conicData.js';

/**
 * Ordered configuration tiers — the chapter's own three curves, in its own order
 * (§6.5 ellipse, §6.7 parabola, §6.9 hyperbola).
 * @type {ReadonlyArray<{id:string,label:string,blurb:string}>}
 */
export const TIERS = Object.freeze([
  { id: 'ellipse',   label: 'Ellipse',   blurb: 'e < 1. The section plane cuts every generator of the cone; the curve closes on itself.' },
  { id: 'parabola',  label: 'Parabola',  blurb: 'e = 1. The section plane is parallel to one generator, so the curve never returns.' },
  { id: 'hyperbola', label: 'Hyperbola', blurb: 'e > 1. The plane is steeper than the generators and meets both nappes — two branches, two foci, two directrices.' },
]);

/**
 * The single clone-scope switch — the tiers this build can actually solve.
 *
 * 'hyperbola' is OFF (ADR-192). Exercises 12–15 stay in PROBLEMS below, verbatim, because the
 * chapter has them; three of them are answered with §6.9's constructions, and this module no
 * longer offers those, so dealing them would set a problem the dock cannot express. This is the
 * one-line lever the tier mechanism exists for — putting 'hyperbola' back restores all four.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_TIERS = Object.freeze(['ellipse', 'parabola']);

/**
 * Problem TYPES that are structurally banned from the library (the ADR-062 / ADR-069
 * mechanism). `enabledProblems()` filters on this list, so a banned kind cannot surface
 * even if authored with an enabled tier. Shippable types: 'eccentricity-method' (focus,
 * directrix and e given) and 'given-dimensions' (axes, a rectangle, foci or asymptotes
 * given). EMPTY by design — Chapter 6 excludes no kind of conics problem; the axis is
 * here so a later syllabus restriction lands as data, never as authoring discipline.
 * @type {ReadonlyArray<string>}
 */
export const EXCLUDED_TYPES = Object.freeze([]);

/**
 * THE SYLLABUS METHOD FILTER (ADR-212) — the constructions a dealt problem may be answered with.
 *
 * Course 1003, Module II names three and says "only" twice: *"Ellipse - Rectangular Method &
 * Concentric Circle Method only, Parabola- Tangent method only"*. The tier axis above cannot
 * express that, because it cuts by CURVE: the ellipse tier holds the two syllabus constructions
 * and four beyond it, and the type axis cannot either, because "eccentricity-method" and
 * "given-dimensions" both straddle the line. So the third axis is the METHOD the answer uses,
 * read off the problem's own `target`.
 *
 * A problem with no `target.method` is answered with the focus-and-directrix construction (its
 * givens are `e` and `fa`), and that is not one of the three — so an absent method is excluded,
 * not waved through.
 *
 * The excluded exercises STAY in PROBLEMS below, verbatim, exactly as the four hyperbola ones do
 * (ADR-192): the chapter has fifteen and this file is the chapter. Widening this list is the
 * one-line lever that brings any of them back.
 * @type {ReadonlyArray<string>}
 */
export const ENABLED_METHODS = Object.freeze([
  'ellipse-concentric',
  'ellipse-oblong',
  'parabola-tangent',
]);

/**
 * Human labels for every field the self-check may report as "still differs". The three
 * `dim` entries are fallbacks: the checker prefers the CURRENT method's own dimension
 * label ("Major axis", "Span (base)", …) from src/conicData.js, so the report names the
 * quantity the statement named.
 * @type {Readonly<Record<string,string>>}
 */
export const FIELD_LABELS = Object.freeze({
  curve: 'curve',
  method: 'construction method',
  e: 'eccentricity',
  fa: 'distance of the focus from the directrix',
  dim1: 'first given dimension',
  dim2: 'second given dimension',
  dim3: 'third given dimension',
  showTangent: 'the tangent and normal at P',
});

/**
 * @typedef {Object} Problem
 * @property {string} id        Stable unique id.
 * @property {string} tier      One of TIERS[].id.
 * @property {string} type      Problem-type axis: 'eccentricity-method' | 'given-dimensions'.
 *                              Anything in EXCLUDED_TYPES is banned.
 * @property {string} title     Short card title.
 * @property {string} statement Full word-problem text, VERBATIM from the chapter's exercises.
 * @property {string[]} [hints] Ordered reasoning steps, revealed ONE AT A TIME behind the
 *                              banner's "Need a hint?" button (concept → which method →
 *                              the concrete control setting). Scaffolds the translation
 *                              without dumping the answer.
 * @property {Object} target    What the learner must dial, as a subset of ConicState.
 *                              ONLY the keys present are checked — omission is the
 *                              "don't-care" mechanism. Tolerances: e ±0.02, every
 *                              millimetre/degree ±0.5 (src/problemLibrary.js).
 */

/**
 * The fifteen exercises of Chapter 6, verbatim, followed by the syllabus practice set (ADR-212).
 * `enabledProblems()` decides which of them are dealt; nothing is deleted from here.
 * @type {ReadonlyArray<Problem>}
 */
export const PROBLEMS = Object.freeze([
  // ---- Ellipse (exercises 1–6) ----
  {
    id: 'ellipse-ecc-50-2by3',
    tier: 'ellipse',
    type: 'eccentricity-method',
    title: 'Focus 50 mm from the directrix, e = 2/3',
    statement: 'The focus of an ellipse is 50 mm away from its directrix. If the eccentricity is 2/3, draw the curve and measure its major and minor axes. A point P is located 45 mm from the second vertex. Draw tangent and normal to the curve at that point.',
    hints: [
      'An eccentricity less than 1 means the curve is an ellipse, and a focus with a directrix is the eccentricity method — Step 5.',
      'Set the eccentricity to 0.67 and the focus-to-directrix distance to 50 mm in Step 5; the construction then divides FA into 2 + 3 = 5 parts for you to read.',
      'Switch the tangent and normal on. The construction reports the major axis as VV′ — with e = 2/3 and FA = 50 it comes out at 120 mm.',
    ],
    target: { e: 2 / 3, fa: 50, showTangent: true },
  },
  {
    id: 'ellipse-auxiliary-100-70',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Auxiliary circles, axes 100 mm and 70 mm',
    statement: 'The major and minor axes of an ellipse are 100 mm and 70 mm respectively. Construct the curve using the method of auxiliary circles. Draw a tangent and normal at a point P on the curve located at 35 mm from the top end of the minor axis.',
    hints: [
      'Two axes given and "auxiliary circles" named: this is the concentric-circles construction of §6.5, Example 6.2.',
      'In Step 5 choose “Concentric (auxiliary) circles”; the two dimension fields relabel themselves to Major axis and Minor axis.',
      'Dial 100 mm and 70 mm, then switch the tangent and normal on and slide P to the point the question asks for.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-concentric', dim1: 100, dim2: 70, showTangent: true },
  },
  {
    id: 'ellipse-oblong-120-80',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Largest ellipse in a 120 × 80 rectangle (oblong method)',
    statement: 'Draw the largest possible ellipse in a rectangle of 120 × 80 mm and mark its focus and axes using the oblong method. A point P on the lower half of the curve is at a distance of 20 mm from the left end of the major axis. Mark the point and draw tangent to the curve at that point.',
    hints: [
      'The largest ellipse inside a rectangle touches all four sides, so the rectangle’s sides ARE the major and minor axes.',
      'In Step 5 choose “Rectangular (oblong) method” — Example 6.3 — and dial 120 mm and 80 mm.',
      'The construction divides half the major axis and half the side into the same number of parts; the joins from C and D cross on the curve. Switch the tangent on for the marked point.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-oblong', dim1: 120, dim2: 80 },
  },
  {
    id: 'ellipse-parallelogram-130-90-65',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Conjugate diameters 130 and 90 at 65°',
    statement: 'The conjugate diameters of the ellipse are 130 mm and 90 mm with an included angle 65°. Draw the ellipse by parallelogram method and determine its axes.',
    hints: [
      'Conjugate diameters are not the axes — they are a pair of diameters each parallel to the tangents at the ends of the other (§6.4, item 8).',
      'In Step 5 choose “Parallelogram method (conjugate diameters)” — Example 6.4. Three fields appear: the two diameters and the angle between them.',
      'Dial 130 mm, 90 mm and 65°. The construction draws the circumscribing parallelogram and then reports the true major and minor axes it produces.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-parallelogram', dim1: 130, dim2: 90, dim3: 65 },
  },
  {
    id: 'ellipse-arcs-100-minor70',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Foci 100 mm apart, minor axis 70 mm (intersecting arcs)',
    statement: 'The foci of an ellipse are 100 mm apart and the minor axis is 70 mm long. Draw an ellipse by intersecting arc method. A point P is located outside the curve at a distance of 80 mm from the bottom end of the minor axis and 20 mm from the right end of the major axis. Draw tangents to the curve from the point P.',
    hints: [
      'The intersecting-arc construction is given the distance between the foci and the SUM of the two focal distances — and that sum is the major axis (§6.4).',
      'The minor semi-axis is 35 and half the focal distance is 50, so the semi-major axis is √(50² + 35²) ≈ 61 mm: the sum is about 122 mm.',
      'In Step 5 choose “Intersecting-arc method (foci)” and dial 100 mm and 122 mm. Every plotted point then satisfies P F + P F′ = 122.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-arcs', dim1: 100, dim2: 122 },
  },
  {
    id: 'ellipse-arcs-110-sum150',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Sum of distances 150 mm from two points 110 mm apart',
    statement: 'The distance between two coplanar fixed points is 110 mm. Trace the complete path of a point P moving in the same plane in such a way that the sum of the distances from the fixed point is always 150 mm. Draw the curve and a tangent at any point on the curve located at the right top quarter.',
    hints: [
      '"The sum of the distances from two fixed points is constant" is the ellipse’s second definition (§6.4) — the fixed points are its foci.',
      'That is exactly what the intersecting-arc method is given, so no eccentricity is needed here.',
      'In Step 5 choose “Intersecting-arc method (foci)”, dial 110 mm and 150 mm, then switch the tangent on and slide P into the top-right quarter.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-arcs', dim1: 110, dim2: 150, showTangent: true },
  },

  // ---- Parabola (exercises 7–11) ----
  {
    id: 'parabola-ecc-40',
    tier: 'parabola',
    type: 'eccentricity-method',
    title: 'Focus 40 mm from the directrix, e = 1',
    statement: 'Construct a conic when the distance between its focus and directrix is equal to 40 mm and its eccentricity is one. Draw a tangent at a point on the upper half of the curve located 60 mm from the focus.',
    hints: [
      'Eccentricity exactly one is the parabola (§6.3) — the curve whose every point is as far from the focus as from the directrix.',
      'In Step 5 set the eccentricity to 1.00 and the focus-to-directrix distance to 40 mm; the vertex then falls at the midpoint of AF, 20 mm from each.',
      'Then plot the points, switch the tangent and normal on, and slide P onto the upper half of the curve.',
    ],
    target: { e: 1, fa: 40, showTangent: true },
  },
  {
    id: 'parabola-tangent-110-80',
    tier: 'parabola',
    type: 'given-dimensions',
    title: 'Double ordinate 110 mm, abscissa 80 mm',
    statement: 'The double ordinate of a parabola is 110 mm and abscissa is 80 mm. Draw the parabola and locate its focus and directrix.',
    hints: [
      'A double ordinate is a chord perpendicular to the axis (§6.2, item 10); the abscissa is the distance from the vertex to it (item 12).',
      'Given a double ordinate and an abscissa, the chapter reaches for the tangent method — Example 6.8: extend the axis to E with VE = CV, join AE and BE, then divide and join.',
      'In Step 5 choose “Tangent method” and dial 110 mm and 80 mm. The construction marks the focus and draws the directrix for you to read off.',
    ],
    target: { curve: CurveType.Parabola, method: 'parabola-tangent', dim1: 110, dim2: 80 },
  },
  {
    id: 'parabola-rectangle-1200-880',
    tier: 'parabola',
    type: 'given-dimensions',
    title: 'Span 1200 mm, rise 880 mm (rectangle method)',
    statement: 'The span and rise of a parabola are 1200 mm and 880 mm respectively. Using rectangle method, construct the parabola and draw tangent and normal to the curve at a point on it, located 30 mm from the vertex on the right side.',
    hints: [
      'A 1200 mm span will not fit a drawing sheet, so it is drawn to a suitable scale — the chapter’s own Fig. 6.14 uses 1:10.',
      'At 1:10 the span becomes 120 mm and the rise 88 mm; the shape of the curve is unchanged, which is the whole point of a scale.',
      'In Step 5 choose “Rectangle method”, dial 120 mm and 88 mm, and switch the tangent and normal on.',
    ],
    target: { curve: CurveType.Parabola, method: 'parabola-rectangle', dim1: 120, dim2: 88, showTangent: true },
  },
  {
    id: 'parabola-parallelogram-100-60-120',
    tier: 'parabola',
    type: 'given-dimensions',
    title: 'Parabola in a parallelogram, 100 × 60 at 120°',
    statement: 'Construct a parabola in a parallelogram of side 100 mm (chord) × 60 mm and with an inclined angle of 120°. Find the axis, focus and directrix of the curve.',
    hints: [
      'The parallelogram method is the rectangle method run in a leaning frame — the divisions are the same, only the enclosing figure is skewed (Example 6.10).',
      'In Step 5 choose “Parallelogram method” under the parabola; three fields appear — the chord, the side, and the angle between them.',
      'Dial 100 mm, 60 mm and 120°. The construction then draws the axis through the vertex and marks the focus and directrix.',
    ],
    target: { curve: CurveType.Parabola, method: 'parabola-parallelogram', dim1: 100, dim2: 60, dim3: 120 },
  },
  {
    id: 'parabola-offset-120-112',
    tier: 'parabola',
    type: 'given-dimensions',
    title: 'Offset method, base 120 mm and axis 112 mm',
    statement: 'By offset method, construct a parabola having base equal to 120 mm and axis 112 mm. Draw the tangents to the curve from a point P outside the curve such that the point P is located 20 mm towards the left of the axis and 5 mm below the directrix.',
    hints: [
      'The offset method plots the curve from the SQUARES of the divisions: divide the half base into 4 and the axis into 4² = 16 parts (Example 6.11).',
      'In Step 5 choose “Offset method” and dial 120 mm and 112 mm.',
      'Read the offsets on the sheet: at 1, 2, 3 and 4 divisions along the base the curve has dropped 1, 4, 9 and 16 of those sixteenths.',
    ],
    target: { curve: CurveType.Parabola, method: 'parabola-offset', dim1: 120, dim2: 112 },
  },

  // ---- Hyperbola (exercises 12–15) ----
  {
    id: 'hyperbola-ecc-54-5by4',
    tier: 'hyperbola',
    type: 'eccentricity-method',
    title: 'e = 5/4, focus 54 mm from the directrix',
    statement: 'Construct a conic when the eccentricity is 5/4 and the distance between directrix and the focus is 54 mm. Draw tangent and normal to the curve at a point on the lower half of the curve measuring 45 mm from the focus.',
    hints: [
      'An eccentricity greater than 1 is a hyperbola (§6.3) — the same construction as the ellipse and the parabola, only the ratio changes.',
      'In Step 5 set the eccentricity to 1.25 and the focus-to-directrix distance to 54 mm. FA then divides into 5 + 4 = 9 parts, with the vertex 4 of them from A.',
      'Switch the tangent and normal on, and slide P down to the lower half of the branch.',
    ],
    target: { e: 1.25, fa: 54, showTangent: true },
  },
  {
    id: 'hyperbola-foci-80-40',
    tier: 'hyperbola',
    type: 'given-dimensions',
    title: 'Foci 80 mm apart, difference of distances 40 mm',
    statement: 'The foci of the two branches of a hyperbola are located at a distance of 80 mm. A point P on the curve moves such that the difference of its distances from the foci always remain 40 mm. Find the focus of the two branches of the curve, mark the asymptotes and measure the angle between them.',
    hints: [
      '"The difference of the distances from two fixed points is constant" is the hyperbola’s own definition (§6.8), and that difference IS the transverse axis V₁V₂.',
      'In Step 5 choose “Foci and the difference of the distances” — Example 6.13 — and dial 80 mm and 40 mm.',
      'The construction draws the circle of radius equal to half the focal distance; the asymptotes are the lines from the centre through where the tangents at V₁ and V₂ meet it.',
    ],
    target: { curve: CurveType.Hyperbola, method: 'hyperbola-foci', dim1: 80, dim2: 40 },
  },
  {
    id: 'hyperbola-ordinate-90-144-48',
    tier: 'hyperbola',
    type: 'given-dimensions',
    title: 'Transverse axis 90, double ordinate 144, abscissa 48',
    statement: 'Draw a hyperbola when the transverse axis is equal to 90 mm, double ordinate = 144 mm and abscissa is equal to 48 mm.',
    hints: [
      'A double ordinate is twice the ordinate (§6.2, item 10), so a 144 mm double ordinate means a 72 mm ordinate.',
      'In Step 5 choose “Ordinate, abscissa and transverse axis” — Example 6.14 — and three fields appear.',
      'Dial the transverse axis 90 mm, the abscissa 48 mm and the ordinate 72 mm; the joins from V₁ and V₂ then cross on the curve.',
    ],
    target: { curve: CurveType.Hyperbola, method: 'hyperbola-ordinate', dim1: 90, dim2: 48, dim3: 72 },
  },
  {
    id: 'hyperbola-asymptotes-75-25-40',
    tier: 'hyperbola',
    type: 'given-dimensions',
    title: 'Asymptotes at 75° with a point on the curve',
    statement: 'The asymptotes of a hyperbola are at an angle of 75°. A point P on the curve is 25 mm away from the horizontal asymptote and 40 mm away from the inclined asymptote, when measured horizontally. Construct the curve and draw tangent and normal at a point M on the curve, 50 mm above the horizontal asymptote.',
    hints: [
      'An asymptote is a tangent to the curve at infinity (§6.8, item 5); the product of a point’s distances from the two asymptotes is constant.',
      'In Step 5 choose “Asymptotes and a point on the curve” — Example 6.15 — and dial the angle 75°.',
      'Then dial P’s two distances: 25 mm from the horizontal asymptote and 40 mm from the inclined one. Every other point on the curve keeps the same product, 25 × 40.',
    ],
    target: { curve: CurveType.Hyperbola, method: 'hyperbola-asymptotes', dim1: 75, dim2: 25, dim3: 40 },
  },

  // ---- Syllabus practice set (ADR-212) --------------------------------------------------
  // NOT chapter exercises — these are the plain drill questions for the three constructions
  // Course 1003, Module II names, added verbatim as set. Each one states its METHOD and both
  // AXES in the statement itself, so the learner never has to infer which construction is
  // wanted; the chapter's own exercises above ask for a tangent, a normal or a located point
  // on top of the same figure, which is what keeps both sets worth having.
  {
    id: 'practice-concentric-100-70',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Concentric circle method, axes 100 mm and 70 mm',
    statement: 'Draw an ellipse having a Major Axis of 100mm and Minor Axis of 70mm using concentric circle method.',
    hints: [
      'The concentric circle method is §6.5’s Example 6.2 — two circles on the two axes, sharing one centre.',
      'In Step 5 the construction is already chosen for you; the two dimension fields read Major axis and Minor axis.',
      'Dial the major axis to 100 mm and the minor axis to 70 mm, then play the construction through.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-concentric', dim1: 100, dim2: 70 },
  },
  {
    id: 'practice-concentric-120-80',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Concentric circle method, axes 120 mm and 80 mm',
    statement: 'Draw an ellipse having a Major Axis of 120mm and Minor Axis of 80mm using concentric circle method.',
    hints: [
      'The concentric circle method is §6.5’s Example 6.2 — two circles on the two axes, sharing one centre.',
      'Each point takes its x from the outer circle and its y from the inner one, so both axes have to be set before the crossings mean anything.',
      'Dial the major axis to 120 mm and the minor axis to 80 mm, then play the construction through.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-concentric', dim1: 120, dim2: 80 },
  },
  {
    id: 'practice-oblong-100-70',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Rectangular method, axes 100 mm and 70 mm',
    statement: 'Draw an ellipse by rectangular method, given the major and minor axes as 100mm and 70mm respectively.',
    hints: [
      'The rectangular (oblong) method is §6.5’s Example 6.3 — the ellipse is boxed in a rectangle whose sides ARE the two axes.',
      'Divide half the major axis and the side above it into the same number of parts; the joins from C and D cross on the curve.',
      'Dial the major axis to 100 mm and the minor axis to 70 mm, then play the construction through.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-oblong', dim1: 100, dim2: 70 },
  },
  {
    id: 'practice-oblong-120-80',
    tier: 'ellipse',
    type: 'given-dimensions',
    title: 'Rectangular method, axes 120 mm and 80 mm',
    statement: 'Draw an ellipse by rectangular method, given the major and minor axes as 120mm and 80mm respectively.',
    hints: [
      'The rectangular (oblong) method is §6.5’s Example 6.3 — the ellipse is boxed in a rectangle whose sides ARE the two axes.',
      'The rectangle is 120 mm across and 80 mm high, because the largest ellipse in it touches all four sides.',
      'Dial the major axis to 120 mm and the minor axis to 80 mm, then play the construction through.',
    ],
    target: { curve: CurveType.Ellipse, method: 'ellipse-oblong', dim1: 120, dim2: 80 },
  },
]);

/**
 * Problems whose tier is enabled, whose type is not banned (the ADR-062 filter), and whose answer
 * uses one of the syllabus constructions (ADR-212).
 */
export function enabledProblems() {
  return PROBLEMS.filter(
    (p) => ENABLED_TIERS.includes(p.tier)
      && !EXCLUDED_TYPES.includes(p.type)
      && ENABLED_METHODS.includes(p.target.method),
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
