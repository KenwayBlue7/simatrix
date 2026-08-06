// Conic Sections — DATA LAYER (pure; no DOM, no THREE, no behaviour).
//
// Two independent models live here, because the chapter teaches the subject twice over:
//
//   1. THE CONE (§6.1) — a right circular DOUBLE cone cut by a section plane. The cone
//      itself is a Module2 `ShapeData` (world units, 1 unit = 10 mm) built by the restored
//      `cone.js`; the cutting plane is `SectionState`, kept OUTSIDE ShapeData exactly as
//      topic-1 (ADR-059) and topic-2 (ADR-067) keep theirs. `classifySection()` is the
//      whole of §6.1 expressed as one pure function: it names which of the six conic
//      sections the dialled plane produces by comparing the plane's inclination with the
//      cone's own generator angle.
//
//   2. THE CURVE (§6.3–§6.9) — the conic as a plane locus, drawn on the Compare sheet.
//      `ConicState` carries the eccentricity model (e, focus-to-directrix distance) plus
//      the construction the learner is running. Sheet quantities are stored in
//      MILLIMETRES, not world units: the 2D construction never enters the 3D scene, and
//      every textbook figure in the chapter is quoted in mm ("FA = 50 mm", "major axis
//      150 mm"), so storing mm keeps the dock, the data layer and the exam paper in one
//      unit. See root DECISIONS.md ADR-083.
//
// Layering (CLAUDE.md): a pure-data catalogue — the sibling-importable category RULES.md
// §3.6a defines (ADR-078). `problems.js` imports it for its targets; every behavioural
// leaf receives its values through the injected controller instead.

// ============================================================================
// 1. The cone and its section planes (§6.1)
// ============================================================================

/**
 * The six conic sections of §6.1, keyed by the section-plane letter the chapter's
 * Fig. 6.1 uses.
 *
 * Each entry carries the same idea three times over, in the order a learner should meet it
 * (PRODUCT.md's Orient → Intuition → Problem-solving arc, ADR-086):
 *   `seen`  — what is on screen, in everyday words, with no name attached. This is what
 *             Step 2 reports while the learner is still just tilting the plane.
 *   `name`  — the engineering name, introduced only in Step 3, once the shape has been
 *             observed.
 *   `rule`  — the textbook's own defining condition, shown alongside the name as the
 *             formal statement an exam answer needs.
 * `how` is the plain-English recipe for producing the cut, used on Step 3's chips.
 *
 * @type {Readonly<Record<string, {letter:string, name:string, seen:string, how:string, rule:string}>>}
 */
export const ConicSection = Object.freeze({
  Circle: {
    letter: 'AA',
    name: 'Circle',
    seen: 'A perfect circle — the same shape as the base, only smaller.',
    how: 'Cut straight across, level with the table.',
    rule: 'Section plane perpendicular to the axis of the cone.',
  },
  Ellipse: {
    letter: 'BB',
    name: 'Ellipse',
    seen: 'A closed oval — longer one way than the other, but it still closes up.',
    how: 'Tilt the cut, but keep it flatter than the sloping side.',
    rule: 'Section plane inclined to the axis and cutting all the generators.',
  },
  Parabola: {
    letter: 'CC',
    name: 'Parabola',
    seen: 'The oval has burst open — the curve runs off the cone and never closes.',
    how: 'Tilt the cut until it lies exactly along the sloping side.',
    rule: 'Section plane inclined to the axis and parallel to one of the generators.',
  },
  Hyperbola: {
    letter: 'DD',
    name: 'Hyperbola',
    seen: 'Two separate open curves — the cut has reached the second half of the cone.',
    how: 'Tilt the cut steeper than the sloping side.',
    rule: 'Section plane inclined to the axis by an angle smaller than that the generators make with the axis.',
  },
  RectangularHyperbola: {
    letter: 'EE',
    name: 'Rectangular hyperbola',
    seen: 'Two open curves again, from a cut standing straight up beside the axis.',
    how: 'Stand the cut upright, parallel to the axis but off to one side.',
    rule: 'Section plane parallel to the axis, cutting both parts of the double cone on the same side of the axis.',
  },
  IsoscelesTriangle: {
    letter: 'FF',
    name: 'Isosceles triangle',
    seen: 'No curve at all — two straight lines meeting at the tip.',
    how: 'Send the cut straight through the tip of the cone.',
    rule: 'Section plane passing through the apex of the cone.',
  },
});

/** Step 3's chips, in the order the lesson reveals them — gentlest cut first. */
export const SECTION_TOUR = Object.freeze([
  'Circle', 'Ellipse', 'Parabola', 'Hyperbola', 'RectangularHyperbola', 'IsoscelesTriangle',
]);

/**
 * Where to put the section plane to demonstrate one named cut on THIS cone. Derived from
 * the cone's own generator angle, so a demonstration stays true after the learner has
 * reshaped the cone in Step 1 — the same live-angle principle ADR-063 sets for checked
 * targets.
 *
 * These drive Step 3's "show me" chips, which the sim animates to. They are a teaching
 * demonstration, not an answer shortcut: the learner has already swept the tilt by hand in
 * Step 2, and Step 6 asks them to predict a cut with no chips on screen (ADR-086).
 *
 * @param {string} key            A {@link ConicSection} key.
 * @param {number} generatorDeg   From {@link generatorAngleDeg}.
 * @returns {{angleDeg:number, offset:number}} SectionState fields (offset in world units).
 */
export function sectionPresetFor(key, generatorDeg) {
  switch (key) {
    case 'Circle': return { angleDeg: 0, offset: -1.5 };
    case 'Ellipse': return { angleDeg: Math.round(generatorDeg * 0.5), offset: -1.2 };
    case 'Parabola': return { angleDeg: Math.round(generatorDeg), offset: -1.2 };
    case 'Hyperbola': return { angleDeg: Math.round(generatorDeg + (90 - generatorDeg) * 0.6), offset: -1.0 };
    case 'RectangularHyperbola': return { angleDeg: 90, offset: -0.8 };
    case 'IsoscelesTriangle': return { angleDeg: 70, offset: 0 };
    default: return { angleDeg: 30, offset: -1.2 };
  }
}

/**
 * @typedef {Object} SectionState  The cutting plane, kept beside ShapeData (never inside
 *   it — ADR-059 / ADR-067), because `src/shapeData.js` stays byte-identical to Module2.
 * @property {boolean} enabled     Whether the cone is cut at all.
 * @property {number} angleDeg     Inclination of the plane to the H.P., degrees (0–90).
 *   The plane is ALWAYS perpendicular to the V.P. (the KTU section-plane standard, the
 *   same restriction topic-2 states in ADR-068), so this one angle fixes its slope; the
 *   chapter's "angle to the axis" is its complement, 90° − angleDeg.
 * @property {number} offset       Signed distance of the plane from the APEX along its own
 *   normal, world units (1 unit = 10 mm). Anchoring on the apex is what makes offset 0
 *   exactly section plane FF, "passing through the apex of the cone" (§6.1 item 6), and
 *   what makes the offset at 90° read as the plane's own distance from the axis — the one
 *   quantity that separates that apex cut from the rectangular hyperbola (§6.1 item 5),
 *   the same pair ADR-071 records as needing a checked non-zero offset.
 */

/** Band, world units, inside which the plane counts as passing through the apex (0.05 u =
 *  0.5 mm — one slider step always lands outside it, so the apex cut is deliberate). */
const APEX_EPS = 0.05;

/** @returns {SectionState} fresh defaults (no shared reference with the live state). */
export function defaultSectionState() {
  // 30° at 12 mm below the apex: switching the plane on lands on section plane BB, an
  // ellipse — the section every learner should meet first, and one dial away from all five
  // others. (Offset 0 would boot straight into the degenerate apex cut.)
  return { enabled: false, cut: false, angleDeg: 30, offset: -1.2 };
}

/**
 * The eccentricity of the curve THIS cut produces on THIS cone — the identity that ties the
 * 3-D slice to the 2-D sheet.
 *
 *   e = cos β ÷ cos α,  β = the angle between the cutting plane and the AXIS,
 *                       α = the half apex angle (axis to generator).
 *
 * Both are re-expressed in the quantities this topic dials, which are measured from the
 * H.P. rather than from the axis: β = 90° − θ and α = 90° − g, so
 *
 *   e = sin θ ÷ sin g
 *
 * and the chapter's three cases fall straight out — θ = 0 gives 0 (a circle), θ = g gives
 * exactly 1 (the parabola), θ > g gives more than 1 (the hyperbola). This is WHY the same
 * cutting process makes different curves, in one line.
 *
 * @param {number} angleDeg      Tilt of the cutting plane to the H.P.
 * @param {number} generatorDeg  Inclination of the cone's own generator to the H.P.
 * @returns {number} e ≥ 0 (0 only for the circle, which no focal-polar model can draw)
 */
export function eccentricityForSection(angleDeg, generatorDeg) {
  const sinG = Math.sin((generatorDeg * Math.PI) / 180);
  if (sinG <= 1e-6) return 1;
  return Math.sin((angleDeg * Math.PI) / 180) / sinG;
}

/**
 * §6.2 items 1–4, as one pure function: the FOCAL SPHERE inscribed in the cone and touching
 * the section plane, the TANGENT PLANE that holds its circle of contact with the cone, and
 * the two things they produce — the focus (where the sphere touches the cutting plane) and
 * the directrix (where the tangent plane meets the cutting plane).
 *
 * This is the chapter's OWN answer to "where do the focus and the directrix come from", and
 * it is answered on the cone, before the locus definition of §6.3 needs either of them.
 *
 * Everything is solved in the V.P. — the y-z plane through the axis — because the cutting
 * plane is always perpendicular to it (ADR-068's restriction), so the whole construction is
 * symmetric about it: the sphere's centre, the focus and the directrix's crossing point all
 * lie in it, and the directrix itself runs perpendicular to it through that point. THE APEX
 * IS THE ORIGIN, y up along the axis, z across; the caller adds its own apex height.
 *
 *   Sphere centre  C = (t·dir, 0), radius r = t·sin α          (α = the half apex angle)
 *   Tangency       |signed distance of C from the plane| = r   → two roots, nearest wins
 *   Contact circle at axial distance t·cos²α, radius t·sin α·cos α (tangent length from
 *                  the apex is t·cos α, the classical result)
 *
 * @param {{angleDeg:number, offset:number, generatorDeg:number, height:number}} p
 *   `angleDeg` tilt of the cutting plane to the H.P., `offset` signed distance of the APEX
 *   from the plane along its normal (world units), `generatorDeg` from
 *   {@link generatorAngleDeg}, `height` the axis length of ONE nappe (the sphere must fit
 *   inside the nappe actually drawn, or there is nothing on screen for it to touch).
 * @returns {null | {nappe:number, centreY:number, radius:number, focus:{y:number,z:number},
 *   contact:{y:number, r:number}, directrix:{y:number, z:number}|null}}
 *   `null` when no sphere exists (the plane passes through the apex, or clears the cone).
 *   `directrix` is null for the circle — the tangent plane and the cutting plane are then
 *   PARALLEL, which is exactly why a circle has no directrix and e = 0.
 */
export function focalSphereFor({ angleDeg, offset, generatorDeg, height }) {
  if (Math.abs(offset) <= APEX_EPS) return null;      // section plane FF — no inscribed sphere
  const th = (angleDeg * Math.PI) / 180;
  const g = (generatorDeg * Math.PI) / 180;
  const sinA = Math.cos(g);                            // sin of the half apex angle
  const cosA = Math.sin(g);
  const nY = Math.cos(th);
  const nZ = Math.sin(th);

  // |t·dir·nY − offset| = t·sin α, taken both ways round and in both nappes.
  let best = null;
  for (const dir of [-1, 1]) {                         // −1 the nappe below the apex, +1 above
    for (const sgn of [-1, 1]) {
      const den = dir * nY + sgn * sinA;
      if (Math.abs(den) < 1e-9) continue;
      const t = offset / den;
      if (!(t > 1e-6)) continue;
      if (t * cosA * cosA > height + 1e-9) continue;   // its contact circle would miss the solid
      if (!best || t < best.t) best = { t, dir };
    }
  }
  if (!best) return null;

  const { t, dir } = best;
  const radius = t * sinA;
  const centreY = t * dir;
  const signed = centreY * nY - offset;                // n·(C − anchor); |signed| = radius
  const focus = { y: centreY - signed * nY, z: -signed * nZ };
  const contact = { y: dir * t * cosA * cosA, r: t * sinA * cosA };

  // The directrix: where the tangent plane (y = contact.y) meets the cutting plane. Parallel
  // planes never meet — that is the circle, and it is the case worth saying out loud.
  let directrix = null;
  if (Math.abs(nZ) > 1e-6) {
    const anchorY = offset * nY;
    const anchorZ = offset * nZ;
    directrix = { y: contact.y, z: anchorZ - (nY * (contact.y - anchorY)) / nZ };
  }
  return { nappe: dir, centreY, radius, focus, contact, directrix };
}

/**
 * How big to draw the two planes of the proof, and — for the tangent plane — where to START
 * drawing it (ADR-096).
 *
 * The tangent plane is the plane of the circle in which the sphere touches the CONE, so it
 * meets the sphere in exactly that circle: any quad drawn across it passes through the ball and
 * reads as a slice. Drawn instead as an ANNULUS whose inner edge IS that circle, no part of the
 * plane is ever inside the sphere — the ball sits in the hole and touches the rim all the way
 * round, which is what actually happens. The learner cannot read a slice into it because there
 * is nothing drawn inside the silhouette to read.
 *
 * The cutting plane's patch is the opposite case and the honest one-point tangency: the sphere
 * touches it at a single point (the focus), so a small square centred THERE demonstrates it.
 *
 * @param {{radius:number, contact:{r:number}}} focal  From {@link focalSphereFor}.
 * @returns {{inner:number, outer:number, patch:number}} world units.
 */
export function tangentPatchFor(focal) {
  return {
    // Exactly the contact circle: the annulus starts where the sphere's surface is, so the
    // drawn plane and the drawn sphere share a boundary and never overlap.
    inner: focal.contact.r,
    // Only as wide as it needs to be to read as a plane: a washer around the ball, not a
    // sheet running off the viewport. Anything larger starts to read as "infinite plane" again.
    outer: focal.contact.r + 1.35 * focal.radius,
    // Big enough to read as a plane, small enough that the eye takes in the whole of it and
    // the one point where the sphere rests on it.
    patch: 2.6 * focal.radius,
  };
}

/**
 * The inclination of the cone's generators to the H.P., degrees — atan(axis ÷ base
 * radius). This is the hinge of §6.1: a plane flatter than this cuts every generator
 * (ellipse), one exactly as steep is parallel to a generator (parabola), one steeper
 * escapes to the other nappe (hyperbola). Scale-invariant, so it reads the same at bench
 * scale as at the quoted millimetres.
 *
 * @param {{baseLength:number, height:number}} cone  ShapeData (baseLength is the DIAMETER).
 * @returns {number} degrees in (0, 90)
 */
export function generatorAngleDeg(cone) {
  const radius = cone.baseLength / 2;
  if (radius <= 0) return 90;
  return (Math.atan2(cone.height, radius) * 180) / Math.PI;
}

/**
 * Name the conic the dialled plane produces — §6.1 as a pure function. The comparison is
 * made against the cone's OWN generator angle (computed live, ADR-063's precedent), never
 * against a hard-coded 45°, so the classification stays true as the learner reshapes the
 * cone.
 *
 * `tolDeg` is the band inside which the plane counts as parallel to a generator or to the
 * base — the same ±0.5° the self-checks use, so what the readout names is exactly what the
 * Problem Library will accept.
 *
 * @param {SectionState} section
 * @param {number} generatorDeg  From {@link generatorAngleDeg}.
 * @param {number} [tolDeg=0.5]
 * @returns {{key:string, letter:string, name:string, rule:string}}
 */
export function classifySection(section, generatorDeg, tolDeg = 0.5) {
  const key = classifyKey(section, generatorDeg, tolDeg);
  return { key, ...ConicSection[key] };
}

/** @returns {string} a {@link ConicSection} key. */
function classifyKey(section, generatorDeg, tolDeg) {
  // Section plane FF is the plane THROUGH the apex, whatever its slope — and since the
  // offset is measured from the apex, that is simply offset ≈ 0.
  if (Math.abs(section.offset) <= APEX_EPS) return 'IsoscelesTriangle';
  const angle = section.angleDeg;
  if (angle <= tolDeg) return 'Circle';                       // ⊥ axis
  if (angle >= 90 - tolDeg) return 'RectangularHyperbola';    // ∥ axis
  if (Math.abs(angle - generatorDeg) <= tolDeg) return 'Parabola'; // ∥ one generator
  return angle < generatorDeg ? 'Ellipse' : 'Hyperbola';
}

// ============================================================================
// 2. The conic as a locus (§6.3) and the constructions (§6.5, §6.7, §6.9)
// ============================================================================

/**
 * The three curves the chapter constructs. (The circle and the isosceles triangle are
 * section results only — the book gives them no plane construction, so neither is a
 * `CurveType`.)
 */
export const CurveType = Object.freeze({
  Ellipse: 'Ellipse',
  Parabola: 'Parabola',
  Hyperbola: 'Hyperbola',
});

/**
 * Which curve an eccentricity produces (§6.3): e < 1 ellipse, e = 1 parabola, e > 1
 * hyperbola. The ±`tol` band around 1 is what makes the parabola dial-able on a slider.
 * @param {number} e
 * @param {number} [tol=0.02]
 * @returns {string} a {@link CurveType}
 */
export function curveForEccentricity(e, tol = 0.02) {
  if (Math.abs(e - 1) <= tol) return CurveType.Parabola;
  return e < 1 ? CurveType.Ellipse : CurveType.Hyperbola;
}

/**
 * The construction methods, in the chapter's own list order (§6.5 for the ellipse, §6.7
 * for the parabola, §6.9 for the hyperbola). Every method here is one the chapter works
 * through; `example` cites the worked example it comes from, and `dim1`/`dim2` name the
 * two quantities that method is GIVEN — the dock relabels its two dimension fields from
 * these rather than showing ten fields at once.
 *
 * `min`/`max`/`step` are millimetres (or degrees where `unit` says so). `dim3` is present
 * only on the four constructions the chapter gives THREE quantities to (the two
 * parallelogram methods take an included angle as well as their two diameters, and the two
 * remaining hyperbola methods take an ordinate / a second asymptote distance); the dock
 * hides its field entirely for the other seven rather than showing a dead control.
 * @type {ReadonlyArray<{id:string, curve:string, label:string, example:string,
 *   dim1:{label:string, min:number, max:number, step:number, unit:string, value:number},
 *   dim2:{label:string, min:number, max:number, step:number, unit:string, value:number},
 *   dim3?:{label:string, min:number, max:number, step:number, unit:string, value:number}}>}
 */
export const METHODS = Object.freeze([
  // ---- Ellipse (§6.5) ----
  {
    id: 'ellipse-concentric',
    curve: CurveType.Ellipse,
    label: 'Concentric (auxiliary) circles',
    example: 'Example 6.2',
    dim1: { label: 'Major axis', min: 60, max: 200, step: 1, unit: 'mm', value: 120 },
    dim2: { label: 'Minor axis', min: 30, max: 160, step: 1, unit: 'mm', value: 80 },
  },
  {
    id: 'ellipse-oblong',
    curve: CurveType.Ellipse,
    label: 'Rectangular (oblong) method',
    example: 'Example 6.3',
    dim1: { label: 'Major axis', min: 60, max: 200, step: 1, unit: 'mm', value: 150 },
    dim2: { label: 'Minor axis', min: 30, max: 160, step: 1, unit: 'mm', value: 90 },
  },
  {
    id: 'ellipse-parallelogram',
    curve: CurveType.Ellipse,
    label: 'Parallelogram method (conjugate diameters)',
    example: 'Example 6.4',
    dim1: { label: 'Conjugate diameter AB', min: 60, max: 200, step: 1, unit: 'mm', value: 150 },
    dim2: { label: 'Conjugate diameter CD', min: 40, max: 180, step: 1, unit: 'mm', value: 108 },
    dim3: { label: 'Included angle', min: 30, max: 90, step: 1, unit: '°', value: 70 },
  },
  {
    id: 'ellipse-arcs',
    curve: CurveType.Ellipse,
    label: 'Intersecting-arc method (foci)',
    example: 'Example 6.5 / 6.6',
    dim1: { label: 'Distance between foci', min: 40, max: 160, step: 1, unit: 'mm', value: 100 },
    dim2: { label: 'Sum of distances', min: 60, max: 240, step: 1, unit: 'mm', value: 152 },
  },

  {
    id: 'ellipse-four-centre',
    curve: CurveType.Ellipse,
    label: 'Approximate ellipse by four centres',
    // §6.5 item 8. The chapter LISTS this method and works no example of it — the only one of
    // its eight it leaves unworked besides the circle method, whose procedure it does not give
    // at all. This one is a fixed classical construction, so it can be drawn faithfully; the
    // circle method cannot be, and inventing a procedure for it would be adding syllabus.
    example: '§6.5, item 8',
    dim1: { label: 'Major axis', min: 60, max: 200, step: 1, unit: 'mm', value: 120 },
    dim2: { label: 'Minor axis', min: 30, max: 160, step: 1, unit: 'mm', value: 80 },
  },

  // ---- Parabola (§6.7) ----
  {
    id: 'parabola-tangent',
    curve: CurveType.Parabola,
    label: 'Tangent method',
    example: 'Example 6.8',
    // The chapter's terms first, with the names a drawing office actually uses beside them
    // (ADR-113) — a learner meets both on the same control.
    dim1: { label: 'Double ordinate / base', min: 60, max: 200, step: 1, unit: 'mm', value: 120 },
    dim2: { label: 'Abscissa / axis', min: 30, max: 160, step: 1, unit: 'mm', value: 90 },
    // This construction is built from EQUAL DIVISIONS of the two tangents, not from plotted
    // points, so it carries its own division count rather than the shared "points plotted".
    dim3: { label: 'No. of equal divisions', min: 4, max: 12, step: 1, unit: '', value: 7 },
  },
  {
    id: 'parabola-rectangle',
    curve: CurveType.Parabola,
    label: 'Rectangle method',
    example: 'Example 6.9',
    dim1: { label: 'Span (base)', min: 60, max: 200, step: 1, unit: 'mm', value: 100 },
    dim2: { label: 'Rise (axis)', min: 30, max: 160, step: 1, unit: 'mm', value: 80 },
  },
  {
    id: 'parabola-parallelogram',
    curve: CurveType.Parabola,
    label: 'Parallelogram method',
    example: 'Example 6.10',
    dim1: { label: 'Chord KL', min: 60, max: 200, step: 1, unit: 'mm', value: 100 },
    dim2: { label: 'Side KN', min: 30, max: 140, step: 1, unit: 'mm', value: 60 },
    dim3: { label: 'Included angle', min: 60, max: 140, step: 1, unit: '°', value: 110 },
  },
  {
    id: 'parabola-offset',
    curve: CurveType.Parabola,
    label: 'Offset method',
    example: 'Example 6.11',
    dim1: { label: 'Base', min: 60, max: 200, step: 1, unit: 'mm', value: 160 },
    dim2: { label: 'Axis', min: 30, max: 160, step: 1, unit: 'mm', value: 96 },
  },

  // ---- Hyperbola (§6.9) — DELIBERATELY ABSENT (ADR-115) ----------------------------------
  // Course 1003, Module II teaches the hyperbola as a SECTION of the cone and does not ask for
  // its construction, so §6.9's three constructions (Examples 6.13–6.15) are not offered. The
  // hyperbola itself is untouched: it is still one of Step 3's six named cuts, still classified
  // from the live cone, and the sheet still draws it from the focus-and-directrix definition
  // whenever the cutting plane makes one. What is gone is only "how to construct a hyperbola".
]);

/**
 * THE SYLLABUS SCOPE, and the methodology card each construction opens with (ADR-098).
 *
 * Course 1003, Module II names three constructions and says "only" twice:
 *   *"Ellipse - Rectangular Method & Concentric Circle Method only, Parabola- Tangent method
 *   only"*.
 * Everything else this topic ships is from the textbook chapter and is enrichment. Neither is
 * hidden and neither is apologised for — the learner is simply told which is which, because a
 * student revising for the ESE needs to know where to spend the evening.
 *
 * `purpose` / `instruments` / `output` are the syllabus's own word "Methodology" made concrete,
 * and are deliberately one line each: this is a card to glance at before drawing, not a preface
 * to read.
 */
export const METHOD_INFO = Object.freeze({
  eccentricity: {
    syllabus: false, ref: '§6.5.1 / §6.7.1 / §6.9.1',
    purpose: 'Draw any of the three curves from a focus, a directrix and a ratio.',
    instruments: ['Scale', 'Compass', 'Set square', 'Pencil'],
    output: 'The curve, with its vertex, focus and directrix marked.',
    principle: 'Every point keeps the same ratio of its distance from a fixed point to its distance from a fixed line.',
    steps: 8,
  },
  'ellipse-concentric': {
    syllabus: true, ref: 'Example 6.2',
    purpose: 'Construct an ellipse from its two axes, using circles drawn on each as diameter.',
    instruments: ['Scale', 'Compass', 'Set square', 'Pencil'],
    output: 'Engineering drawing of an ellipse.',
    principle: 'Two circles on the two axes; each point takes its x from the big circle and its y from the small one.',
    steps: 7,
  },
  'ellipse-oblong': {
    syllabus: true, ref: 'Example 6.3',
    purpose: 'Construct an ellipse from its two axes, using a circumscribing rectangle and projection lines.',
    instruments: ['Scale', 'Set square', 'Pencil'],
    output: 'Engineering drawing of an ellipse.',
    principle: 'Divide the box and the axis into the same number of parts; the joins cross on the curve.',
    steps: 7,
  },
  'ellipse-parallelogram': {
    syllabus: false, ref: 'Example 6.4',
    purpose: 'Construct an ellipse from a pair of conjugate diameters rather than its axes.',
    instruments: ['Scale', 'Protractor', 'Set square', 'Pencil'],
    output: 'An ellipse, and the true axes it turns out to have.',
    principle: 'The rectangle method run in a leaning frame — the divisions are the same, only the box is skewed.',
    steps: 6,
  },
  'ellipse-arcs': {
    syllabus: false, ref: 'Example 6.5 / 6.6',
    purpose: 'Construct an ellipse from its two foci and the constant sum of the focal distances.',
    instruments: ['Scale', 'Compass', 'Pencil'],
    output: 'An ellipse, every point of which satisfies PF + PF′ = the given sum.',
    principle: 'Every point keeps the same TOTAL distance to the two foci, so pairs of arcs cross on the curve.',
    steps: 6,
  },
  'ellipse-four-centre': {
    syllabus: false, ref: '§6.5, item 8',
    purpose: 'Approximate an ellipse with four compass arcs, when the figure only has to look right.',
    instruments: ['Scale', 'Compass', 'Set square', 'Pencil'],
    output: 'Four arcs that read as an ellipse — not a true one.',
    principle: 'Four compass arcs, meeting where their centre lines cross, standing in for a true ellipse.',
    steps: 6,
  },
  'parabola-tangent': {
    syllabus: true, ref: 'Example 6.8',
    purpose: 'Construct a parabola from its double ordinate and abscissa, as the envelope of a set of tangents.',
    instruments: ['Scale', 'Set square', 'Pencil'],
    output: 'Engineering drawing of a parabola, with its focus and directrix located.',
    principle: 'Each chord joining the two divided tangents touches the curve; the parabola is their envelope.',
    steps: 7,
  },
  'parabola-rectangle': {
    syllabus: false, ref: 'Example 6.9',
    purpose: 'Construct a parabola from its span and rise, inside a rectangle.',
    instruments: ['Scale', 'Set square', 'Pencil'],
    output: 'A parabolic arc to a given span and rise.',
    principle: 'Divide the half-base and the height into the same number of parts; the joins cross on the curve.',
    steps: 6,
  },
  'parabola-parallelogram': {
    syllabus: false, ref: 'Example 6.10',
    purpose: 'Construct a parabola inside a leaning frame, when the chord is not square to the axis.',
    instruments: ['Scale', 'Protractor', 'Set square', 'Pencil'],
    output: 'A parabola, and the axis, focus and directrix it produces.',
    principle: 'The rectangle method in a leaning frame, for a chord that is not square to the axis.',
    steps: 6,
  },
  'parabola-offset': {
    syllabus: false, ref: 'Example 6.11',
    purpose: 'Construct a parabola by offsets, stepping the drop as the square of the division.',
    instruments: ['Scale', 'Set square', 'Pencil'],
    output: 'A parabola to a given base and axis.',
    principle: 'The drop from the tangent goes as the SQUARE of the division — 1, 4, 9, 16.',
    steps: 6,
  },
  // §6.9's three methodology cards go with the constructions they described (ADR-115).
});

/**
 * CHANGE 3 / CHANGE 8 — the constructions of one curve, split into the tier the syllabus names
 * and everything else (ADR-100). Within the two curves the module TEACHES nothing is removed: a
 * Diploma student needs to know which one to practise, and a B.Tech student or a self-learner
 * needs the rest of §6.5 and §6.7 to still be there. §6.9's three are a different matter — they
 * construct a curve this module does not ask to be constructed, and are gone (ADR-115).
 *
 * `eccentricity` belongs to every curve — the focus-directrix construction draws all three, the
 * hyperbola included — so it appears in each list rather than being owned by one.
 *
 * @param {string} curve  A {@link CurveType}.
 * @returns {{syllabus: Array<object>, additional: Array<object>}} METHODS entries, in chapter order.
 */
/**
 * The construction a curve should OPEN on (ADR-102). Every curve used to open on the general
 * focus-directrix construction, which is not what a Diploma student is examined on: the ellipse
 * and the parabola each have a syllabus method, and landing anywhere else makes the learner hunt
 * for the one that matters. The hyperbola is not offered for construction at all (ADR-115), but
 * it still ARRIVES here from Steps 1–4 whenever the cut makes one, and the general method is what
 * draws it — it works for all three curves and needs no extra given.
 *
 * @param {string} curve  A {@link CurveType}.
 * @returns {string} A METHODS id, or the `eccentricity` sentinel.
 */
/**
 * The constructions that actually draw a tangent and normal at the marked point. The others
 * ignore `showTangent` and `pointT` entirely, so offering those controls beside them is
 * offering a control that does nothing (ADR-102).
 */
const TANGENT_METHODS = Object.freeze(['eccentricity', 'ellipse-concentric', 'ellipse-oblong',
  'ellipse-arcs', 'parabola-tangent']);

/**
 * Which of Step 5's shared controls a construction actually reads. The dimension sliders are
 * already described by METHODS itself; these are the ones that live outside it.
 *
 * @param {string} method  A METHODS id, or the `eccentricity` sentinel.
 * @returns {{eccentricity: boolean, tangent: boolean}}
 */
/**
 * The constructions that actually read the shared `points` slider. The rest fix their own
 * division count — the oblong and parallelogram methods at the textbook's "say 4", the
 * concentric method at twelve, the offset method at 4² — and the tangent method carries its own
 * (ADR-113). A slider that moves nothing is worse than an absent one.
 */
const DIVISION_METHODS = Object.freeze(['eccentricity', 'ellipse-arcs', 'parabola-rectangle',
  'parabola-parallelogram']);

export function controlsFor(method) {
  return {
    points: DIVISION_METHODS.includes(method),
    // e and the focal distance ARE the focus-directrix construction's two givens. Every other
    // method is dimensioned by its own sliders and never reads them.
    eccentricity: method === 'eccentricity',
    tangent: TANGENT_METHODS.includes(method),
  };
}


export function methodsByTier(curve) {
  const mine = METHODS.filter((m) => m.curve === curve);
  const general = { id: 'eccentricity', curve, label: 'Focus & directrix', example: '§6.5.1' };
  const all = [...mine, general];
  return {
    syllabus: all.filter((m) => METHOD_INFO[m.id]?.syllabus),
    additional: all.filter((m) => !METHOD_INFO[m.id]?.syllabus),
  };
}

/** The methodology card for one construction, or `null` if it has none. */
export function methodInfo(method) {
  return METHOD_INFO[method] ?? null;
}

/** Method descriptor by id (or `undefined`). */
export function methodById(id) {
  return METHODS.find((m) => m.id === id);
}

/** The methods belonging to one {@link CurveType}, in chapter order. */
function methodsForCurve(curve) {
  return METHODS.filter((m) => m.curve === curve);
}

/**
 * The construction a curve should OPEN on — the one the dock falls back to on a curve change.
 *
 * It used to be whichever method happened to be listed first, and the sim itself opened on the
 * general focus-directrix construction for every curve. Neither is what a Diploma student is
 * examined on: the ellipse and the parabola each have a construction the syllabus NAMES, and
 * landing anywhere else makes the learner hunt for the one that matters (ADR-102). The
 * hyperbola has no syllabus construction at all, so it keeps the general one — the method that
 * works for all three and needs no extra given.
 *
 * @param {string} curve  A {@link CurveType}.
 * @returns {string} A METHODS id, or the `eccentricity` sentinel.
 */
export function defaultMethodFor(curve) {
  if (curve === CurveType.Ellipse) return 'ellipse-concentric';
  if (curve === CurveType.Parabola) return 'parabola-tangent';
  if (curve === CurveType.Hyperbola) return 'eccentricity';
  return methodsForCurve(curve)[0]?.id ?? METHODS[0].id;
}

/**
 * An eccentricity that BELONGS to a curve. The general focus-directrix construction has no
 * curve of its own — which curve it draws is read back off `e` — so asking for a curve and the
 * general method together is only coherent if `e` moves with it. Without this, choosing
 * "Hyperbola" while e = 2/3 re-derives the curve as an ellipse and snaps straight back.
 *
 * @param {string} curve  A {@link CurveType}.
 * @returns {number}
 */
export function defaultEccentricityFor(curve) {
  if (curve === CurveType.Parabola) return 1;
  if (curve === CurveType.Hyperbola) return 1.25;
  return 2 / 3;
}

/**
 * @typedef {Object} ConicState  The 2D sheet's state. Millimetres and degrees throughout
 *   (ADR-083). Lives in main.js beside ShapeData, like {@link SectionState}.
 * @property {number} e         Eccentricity (§6.3). Drives the curve in the locus and
 *   eccentricity-method modes.
 * @property {number} fa        Distance of the focus from the directrix, mm (the "FA" of
 *   Examples 6.1 / 6.7 / 6.12).
 * @property {string} curve     A {@link CurveType} — which curve the terminology and
 *   construction sheets draw.
 * @property {string} method    A {@link METHODS} id.
 * @property {number} dim1      First given dimension of the current method (its unit).
 * @property {number} dim2      Second given dimension of the current method.
 * @property {number} dim3      Third given dimension, where the method declares one
 *   (otherwise carried unused — the dock hides the field, never a dead control).
 * @property {number} points    Number of construction points plotted per side (§6.5's
 *   "mark any point 1 on the axis … similarly mark 2, 3, 4").
 * @property {number} pointT    Where the marked point P sits, 0–1 along the drawn curve —
 *   the point every worked example draws its tangent and normal at.
 * @property {boolean} showAll  Locus mode: draw all three curves together (Fig. 6.3).
 * @property {boolean} showTangent  Draw the tangent and normal at P.
 * @property {boolean} showNames    Step 4: swap the locus sheet for the terminology figure.
 *   Off by default — the phenomenon first, its vocabulary on request (ADR-086).
 * @property {number} buildStage    How far the eccentricity construction has been drawn,
 *   0–{@link BUILD_STAGES}. Step 5 plays it through one stage at a time, so the learner
 *   watches the construction happen instead of meeting it finished.
 */

/**
 * The stages of the eccentricity construction, in the chapter's own order (Examples 6.1 /
 * 6.7 / 6.12). Stage 0 is the bare frame; the last stage is the finished answer.
 * @type {ReadonlyArray<{label:string, say:string}>}
 */
export const BUILD_STAGES = Object.freeze([
  { label: 'The centre line', say: 'Draw one straight line across the page. This is the axis — every measurement starts from it.' },
  { label: 'The fixed line', say: 'Now a line straight down, crossing it. This is the directrix. Every point on the curve gets measured across to this line.' },
  { label: 'The fixed point', say: 'Mark a point F on the axis. This is the focus. Every point on the curve also gets measured back to this point.' },
  { label: 'Where the curve starts', say: 'Split the gap between the line and the point in the given ratio. That marks V — where the curve crosses the axis.' },
  { label: 'The measuring line', say: 'Draw this helper line up from V and across to A. It measures the ratio out for you, so you never have to work it out again.' },
  { label: 'Finding one point', say: 'Pick a spot along the axis. Draw a vertical line there, then swing an arc from F. Where they cross is one point on the curve.' },
  { label: 'The whole curve', say: 'Do the same at a few more spots, then join all the points in one smooth curve.' },
  { label: 'Tangent and normal', say: 'The tangent just touches the curve at P. The normal crosses it there at a right angle.' },
]);

/**
 * STEP 4 — the six stages of the proof (ADR-095).
 *
 * The chapter derives the focus and the directrix ON THE SOLID (§6.2 items 1-4) and only then
 * measures with them (§6.3). This list is that derivation, cut into the seven moments a learner
 * can take one at a time.
 *
 * TWO SEPARATE TANGENCIES, TWO SEPARATE STAGES (ADR-097). The sphere touches the CONE along a
 * circle and the CUTTING PLANE at a single point, and those are different facts about different
 * pairs of objects. Shown together they read as one muddled claim, and the name "tangent plane"
 * makes it worse — that plane is named for the cone it touches, not for the ball. So the ring
 * gets a stage of its own with the reason it is a ring (the cone is rotationally symmetric), the
 * one-point contact gets the next, and only then does the plane through the ring appear. It does not play: the learner presses Next, and each press reveals
 * exactly one idea (the manual stepper Step 5 already uses for its construction).
 *
 * `say` answers "what just happened", never "what is the definition" — 2-4 short lines.
 * `sheet` is how far the drawing sheet may be revealed at that stage: nothing appears on paper
 * before it has been explained in 3-D. `hold` is the ms the stage's own animation runs, during
 * which Next is disabled.
 *
 * Indexes are the values of `conicState.proofStage`.
 */
/**
 * THE THREE CONSTRUCTIONS THE SYLLABUS NAMES, staged the way a teacher draws them (ADR-098).
 *
 * Course 1003, Module II scopes Conic Sections to exactly these: *"Ellipse - Rectangular Method
 * & Concentric Circle Method only, Parabola- Tangent method only"*. Every one of them was already
 * drawn correctly; what they lacked was the thing that makes a construction teachable, which is
 * watching it happen. Each list below is its own textbook example, cut at the points where a
 * teacher would stop and let the class catch up.
 *
 * The stage index is `conicState.buildStage`, the SAME field the focus-directrix construction
 * already uses — there is one playback system, not two (the brief's own constraint). An absent
 * `buildStage` still means "draw the finished figure", which is what the Problem Library and the
 * oracles read.
 *
 * The point numbering is bounded by each BUILDER, in conicEngine.js — it is a property of the
 * drawing, and the engine imports nothing (CLAUDE.md). It appears with the divisions it labels
 * and leaves once the curve is joined, so the finished figure is clean.
 */
// Twelve stages (ADR-116). Each of the construction's two families is taught the same way: the
// part a learner has to understand arrives one line per press, and the part that is only its
// reflection arrives whole. The rays from C split UPPER / lower — C sits at the top, so the upper
// fan is the one it draws — and the connecting lines split LEFT / right. Seventeen presses of it
// was thorough and repetitive; this is the same lesson in twelve.
const ELLIPSE_OBLONG_STAGES = Object.freeze([
  { label: 'The two axes', say: 'Draw the major axis AB and the minor axis CD, bisecting each other at O.' },
  { label: 'The rectangle', say: 'Box the curve in: a rectangle EGKL with one side through each end of the two axes.' },
  { label: 'Divide the sides', say: 'Divide AO and AE into the same number of equal parts — four here — and number them, above the axis and below it.' },

  { label: 'C to point 1', say: 'Now the rays from C, one numbered point at a time. Join C to the first point on each upper side.' },
  { label: 'C to point 2', say: 'Join C to the second numbered point on each upper side.' },
  { label: 'C to point 3', say: 'And C to the third. That is the whole upper fan.' },
  { label: 'Mirror the fan downward', say: 'The lower half is that fan reflected in the major axis — the same rays, drawn from D instead of C. Nothing new to learn in it, so take it in one step.' },

  { label: 'The first connection, left', say: 'Now the connecting lines, one at a time, on the left half. Through the first numbered point on AO — solid as far as the centre line, thin dashed beyond it, stopping at the crossing it makes. Each crossing is a point of the ellipse.' },
  { label: 'The second connection, left', say: 'The same through the second numbered point on AO, above the axis and below it.' },
  { label: 'The third connection, left', say: 'And through the third. The left half is complete — six points of the curve.' },
  { label: 'Mirror the other half', say: 'The right half is those same connections reflected in the minor axis. Take it in one step rather than drawing it again line by line.' },

  { label: 'Join the curve', say: 'Join the points freehand, through A, C, B and D — watch the curve traced on against the construction that found it.' },
]);

const ELLIPSE_CONCENTRIC_STAGES = Object.freeze([
  { label: 'The two axes', say: 'Draw the major axis AB and the minor axis CD, crossing at the centre O.' },
  { label: 'The major circle', say: 'With O as centre and the major axis as diameter, draw the outer circle.' },
  { label: 'The minor circle', say: 'With the same centre and the minor axis as diameter, draw the inner circle.' },
  { label: 'Equal divisions', say: 'Divide the circles into any number of equal parts — twelve here — and number them.' },
  { label: 'The projections', say: 'From each point on the OUTER circle drop a parallel to CD; from the matching point on the INNER circle draw a parallel to AB.' },
  { label: 'The crossings', say: 'Each pair meets at a point on the ellipse.' },
  { label: 'Join the curve', say: 'Join them freehand for the required ellipse.' },
]);

/**
 * The tangent method's stages (ADR-116) — the only list in the topic that is a FUNCTION of the
 * drawing rather than a constant, because the only thing that varies is how many chords there
 * are, and the learner sets that on a slider (4–12 divisions, so 3–11 chords).
 *
 * The first half of the chords arrives one per press, so each one is seen to land; the second
 * half is the reflection of the first about the axis and arrives whole. Fixing the number of
 * individually-drawn chords instead would either dead-press at four divisions (three chords
 * cannot be split into "three by hand, then the rest") or bunch them at twelve.
 *
 * @param {number} divisions  `dim3` of the parabola-tangent method.
 * @returns {ReadonlyArray<{label: string, say: string}>}
 */
function parabolaTangentStages(divisions = 7) {
  const half = tangentFirstHalf(divisions);
  const chords = [];
  for (let i = 1; i <= half; i++) {
    chords.push({
      label: `Chord ${i}`,
      say: i === 1
        ? 'Now the chords, one at a time. Join 1 to 1′ — it just touches the curve without crossing it.'
        : `Join ${i} to ${i}′. Each chord touches the parabola at one point and nowhere else.`,
    });
  }
  return Object.freeze([
    { label: 'The given sizes', say: 'Draw the double ordinate AB — the base — and the abscissa CV along the axis.' },
    { label: 'Produce the axis', say: 'Produce the axis past the vertex to E, making VE equal to CV.' },
    { label: 'The two tangents', say: 'Join AE and BE. These two lines are tangents to the parabola, at A and at B.' },
    { label: 'Divide them', say: 'Divide AE and BE into the same number of equal parts, numbered from each end.' },
    ...chords,
    { label: 'Mirror the rest', say: 'The remaining chords are the reflection of the ones just drawn. Take them in one step rather than repeating the same join.' },
    { label: 'The envelope', say: 'Every chord just touches the curve. The parabola is the envelope they all touch — watch it traced on freehand against them, the same way every other construction here finishes.' },
    { label: 'Focus and directrix', say: 'Mark the focus on the axis and the directrix square across it, the same distance the other side of the vertex.' },
  ]);
}

/**
 * How many of the tangent method's chords are drawn one at a time (ADR-116).
 *
 * `conicEngine.js` gates the DRAWING on the same rule. The two modules cannot import each other
 * — both are pure leaves that import nothing (CLAUDE.md) — so the rule is stated in both and the
 * oracle proves they agree at every division count the slider offers. That is a stronger check
 * than a shared symbol would be: it compares this list against what is actually drawn.
 *
 * @param {number} n  the division count.
 */
export function tangentFirstHalf(n) {
  return Math.ceil((tangentDivisions(n) - 1) / 2);
}

/**
 * The division count the tangent method will actually draw at — clamped to its own slider range,
 * because `dim3` is one field shared by every construction that takes a third given and it holds
 * the parallelogram method's included ANGLE by default. `conicEngine.js` clamps identically.
 */
function tangentDivisions(dim3) {
  return Math.min(12, Math.max(4, Math.round(dim3 ?? 7)));
}

/**
 * Which stage list a construction plays, and where its numbering lives. `null` for the nine
 * constructions that have no staged playback — they are beyond the syllabus and draw whole.
 */
// ---- The ten constructions beyond the syllabus, staged the same way (ADR-100) -------------
// Every method animates its OWN procedure. A learner who picks the four-centre method and is
// shown the concentric-circle animation has been told something false about what they drew.

const ELLIPSE_PARALLELOGRAM_STAGES = Object.freeze([
  { label: 'The two diameters', say: 'Draw the conjugate diameters AB and CD, crossing at O at the given angle.' },
  { label: 'The parallelogram', say: 'Box the curve in — a parallelogram with one side through each end of the two diameters.' },
  { label: 'Divide the sides', say: 'Divide the half diameter AO and the side above it into the same number of equal parts.' },
  { label: 'The two sets of lines', say: 'Join C to each point on the side, then draw D through each point on the diameter.' },
  { label: 'The crossings', say: 'Every place a pair of those lines crosses is a point on the ellipse.' },
  { label: 'The curve, and its true axes', say: 'Join the points freehand. The conjugate diameters are NOT the axes — those are found from them, and marked.' },
]);

const ELLIPSE_ARCS_STAGES = Object.freeze([
  { label: 'The axis and the foci', say: 'Draw the axis and mark the two foci, F and F′, the given distance apart.' },
  { label: 'The vertices', say: 'Mark A and B so that AB is the given constant sum — that sum IS the major axis.' },
  { label: 'Points along FO', say: 'Mark points 1, 2, 3 … anywhere between F and the centre. Any spacing will do.' },
  { label: 'The first pair of arcs', say: 'About F swing an arc of radius A-1; about F′ swing one of radius B-1. They cross on the curve.' },
  { label: 'All the crossings', say: 'Repeat for every numbered point, above and below the axis. The two radii always add up to AB.' },
  { label: 'Join the curve', say: 'Join the crossings freehand through A and B for the required ellipse.' },
]);

const ELLIPSE_FOUR_CENTRE_STAGES = Object.freeze([
  { label: 'The two axes', say: 'Draw the major axis AB and the minor axis CD, crossing at O.' },
  { label: 'Swing OA to E', say: 'With O as centre and OA as radius, swing an arc onto the minor axis produced, at E. Now CE is a − b.' },
  { label: 'Carry it to F', say: 'With C as centre and CE as radius, swing an arc onto the line AC, at F.' },
  { label: 'Bisect AF', say: 'Bisect AF. Where the bisector cuts the two axes gives the centres G and H.' },
  { label: 'The four centres', say: 'Mirror G and H across the centre. Those four points are the centres of the four arcs.' },
  { label: 'Strike the arcs', say: 'Swing each arc from its own centre. They meet ON the lines GH, so the joins do not show.' },
]);

const PARABOLA_RECTANGLE_STAGES = Object.freeze([
  { label: 'The given sizes', say: 'Draw the base AB and the axis, with the height from the base to the vertex V.' },
  { label: 'The rectangle', say: 'Box it in: a rectangle on AB, as tall as the vertex.' },
  { label: 'Divide the half base', say: 'Divide each half of the base into the same number of equal parts, and number them.' },
  { label: 'Divide the height', say: 'Divide each upright side into the SAME number of parts, numbered from the top.' },
  { label: 'The two sets of lines', say: 'From V draw a line to each point on the side. From each point on the base draw a parallel to the axis.' },
  { label: 'Join the curve', say: 'Each matching pair crosses on the parabola. Join them freehand through V.' },
]);

const PARABOLA_PARALLELOGRAM_STAGES = Object.freeze([
  { label: 'The given sizes', say: 'Draw the base AB, and the axis to the vertex — but leaning, at the given angle.' },
  { label: 'The parallelogram', say: 'Box it in with a parallelogram instead of a rectangle. Everything else is unchanged.' },
  { label: 'Divide the half base', say: 'Divide each half of the base into equal parts and number them.' },
  { label: 'Divide the sides', say: 'Divide each sloping side into the same number of parts, numbered from the top.' },
  { label: 'The two sets of lines', say: 'From V draw to each point on the side; from each base point draw a parallel to the AXIS, not to the page.' },
  { label: 'Join the curve', say: 'The pairs cross on the parabola. Join them freehand through V.' },
]);

const PARABOLA_OFFSET_STAGES = Object.freeze([
  { label: 'The axis and the vertex', say: 'Draw the axis and mark the vertex V, with the base AB across it.' },
  { label: 'The tangent at the vertex', say: 'Draw the tangent at V — square to the axis — and the two lines up from A and B.' },
  { label: 'Divide the half base', say: 'Divide the half base into equal parts and number them from the vertex.' },
  { label: 'The first offset', say: 'The drop from the tangent goes as the SQUARE of the division. At 1 of 4 the drop is 1 part in 16.' },
  { label: 'All the offsets', say: 'Set off 1, 4, 9, 16 … parts in turn. That square law is the whole method.' },
  { label: 'Join the curve', say: 'Join the offset ends freehand through V for the required parabola.' },
]);

// §6.9's three stage lists left with the constructions they narrated (ADR-115).

// An entry is a stage list, or a FUNCTION of the conic state returning one (ADR-116). Only the
// tangent method needs the second form: how many chords it draws is on a slider.
export const METHOD_PLAYBACK = Object.freeze({
  'ellipse-oblong': ELLIPSE_OBLONG_STAGES,
  'ellipse-concentric': ELLIPSE_CONCENTRIC_STAGES,
  'parabola-tangent': (conic) => parabolaTangentStages(conic?.dim3 ?? 7),
  'ellipse-parallelogram': ELLIPSE_PARALLELOGRAM_STAGES,
  'ellipse-arcs': ELLIPSE_ARCS_STAGES,
  'ellipse-four-centre': ELLIPSE_FOUR_CENTRE_STAGES,
  'parabola-rectangle': PARABOLA_RECTANGLE_STAGES,
  'parabola-parallelogram': PARABOLA_PARALLELOGRAM_STAGES,
  'parabola-offset': PARABOLA_OFFSET_STAGES,
});

/**
 * The stage a construction OPENS on — its given data set out, and nothing constructed from it
 * (ADR-118).
 *
 * Step 5 used to open on the finished figure, which put the answer on the paper before the
 * question and made "Draw it step by step" look like it was starting from the middle. It now
 * opens on the drawing a learner would have in front of them before the first construction step:
 * the axes and the centre, the rectangle to be filled, the two tangents that make the tangent
 * method's triangle, the focus and the directrix.
 *
 * It is NOT uniformly stage 0. What counts as "given" differs by method, and this is the one
 * place that judgement is written down:
 *
 *   the concentric method's two circles ARE its auxiliary circles, so they wait   → 0
 *   the four-centre method starts swinging arcs at stage 1                        → 0
 *   the rectangle, oblong and parallelogram methods are given their frame         → 1
 *   the arc method is given both foci AND the constant sum                        → 1
 *   the offset method is given the frame its offsets drop from                    → 1
 *   the tangent method is GIVEN a base and an abscissa; E and the two tangents
 *   it produces are its first two construction steps, not its frame               → 0
 *   the focus-directrix construction is given an axis, a directrix and a focus    → 2
 *
 * @param {string} method  A METHODS id, or the `eccentricity` sentinel.
 * @returns {number} A stage index into that construction's own list.
 */
const SETUP_STAGE = Object.freeze({
  eccentricity: 2,
  'ellipse-concentric': 0,
  'ellipse-four-centre': 0,
  'ellipse-oblong': 1,
  'ellipse-parallelogram': 1,
  'ellipse-arcs': 1,
  'parabola-rectangle': 1,
  'parabola-parallelogram': 1,
  'parabola-offset': 1,
  // Not 2 (ADR-119). Opening on the joined tangents looked like a frame, because a triangle
  // reads as one — but AE and BE are the first thing this construction DOES, and E is produced
  // by the step before them. Its givens are the double ordinate and the abscissa, nothing else.
  'parabola-tangent': 0,
});

export function setupStageFor(method) {
  return SETUP_STAGE[method] ?? 0;
}

/**
 * The stages for one construction, or `null` where it has none.
 *
 * `conic` is optional and only the tangent method reads it — its chord count is on a slider, so
 * its stage list has to be sized to the drawing (ADR-116). Omitting it gives that method's list
 * at the default division count, which is what a caller asking "is this method staged at all?"
 * wants; a caller that indexes the list must pass the state.
 *
 * @param {string} method  A METHODS id, or the `eccentricity` sentinel.
 * @param {object} [conic] The conic state the stages will be walked against.
 */
export function buildStagesFor(method, conic) {
  if (method === 'eccentricity') return BUILD_STAGES;
  const entry = METHOD_PLAYBACK[method];
  if (!entry) return null;
  return typeof entry === 'function' ? entry(conic) : entry;
}

export const PROOF_STAGES = Object.freeze([
  {
    label: 'The cutting plane',
    say: 'A flat plane slices the cone. The shape it leaves is the section we are here to study — and nothing else is on screen yet.',
    sheet: 0,
    hold: 0,
  },
  {
    label: 'A ball that fits',
    say: 'Drop a ball into the cone and let it swell until it jams. It is now wedged: it cannot grow, and it cannot move. Where does it actually touch anything?',
    sheet: 0,
    hold: 900,
  },
  {
    // TANGENCY ONE — sphere against CONE. A circle, and the reason is the cone's own symmetry.
    label: 'Against the cone: a whole ring',
    say: 'Against the cone it touches along an entire circle. A cone is the same all the way round its axis, so if the ball touches it at one place it must touch at every place that far down — a ring, not a point. This circle is where the cone and the ball meet.',
    sheet: 0,
    hold: 1200,
  },
  {
    // TANGENCY TWO — sphere against the CUTTING plane. One point, and it is the focus.
    label: 'Against the cut: one point',
    say: 'Against the flat cut it is different. A ball can rest on a flat plane at exactly ONE point, the way it rests on a table. That single point is the FOCUS of the section.',
    sheet: 1,
    hold: 1000,
  },
  {
    label: 'The plane through the ring',
    say: 'Go back to that ring, and lay a flat plane through that ring — square to the axis. The chapter calls this the tangent plane, and the name is about the CONE it touches, not the ball.',
    sheet: 1,
    hold: 1100,
  },
  {
    label: 'Where the two planes cross',
    say: 'Two flat planes cross in a straight line. That line is the DIRECTRIX. Watch it being drawn out from where the two planes meet.',
    sheet: 2,
    hold: 1100,
    sayFlat: 'This cut is square across the cone, so the two planes are parallel — they never cross, and there is no line. That is the circle: no directrix at all.',
  },
  {
    label: 'The same two, on paper',
    say: 'Take the cone away. The point and the line stay behind with the curve — and they are the same focus and directrix the drawing sheet uses. That is how a solid becomes a drawing.',
    sheet: 4,
    hold: 900,
  },
]);

/**
 * §6.6's three properties of the parabola — "some of the important properties mentioned below
 * will be useful in the construction of a parabola" — each drawn rather than written, one at a
 * time (ADR-093). The sub-tangent and sub-normal (properties 4 and 5) are already captioned on
 * the terminology sheet, where they belong to a point P; these three are about the curve as a
 * whole and need a figure of their own.
 *
 * Indexes are the values of `conicState.propStage`.
 */
export const PARABOLA_PROPS = Object.freeze([
  {
    label: 'Two thirds of the box',
    say: 'Box the curve in. The parabola fills exactly two thirds of that box — always, whatever its shape.',
  },
  {
    label: 'Tangents on the directrix',
    say: 'Take any chord through the focus and draw the tangents at its two ends. They always meet ON the directrix, and always at a right angle.',
  },
  {
    label: 'Tangents on the diameter',
    say: 'Take any other chord. Its two tangents meet on the line that bisects it — and that line is the diameter, parallel to the axis.',
  },
]);

/** @returns {ConicState} fresh defaults — Example 6.1's own data (FA = 50 mm, e = 2/3). */
export function defaultConicState() {
  return {
    e: 2 / 3,
    fa: 50,
    curve: CurveType.Ellipse,
    // The curve's own recommended construction — for the ellipse, the one the syllabus names
    // (ADR-102). The other twelve are one select away.
    method: 'ellipse-concentric',
    dim1: 120,
    dim2: 80,
    dim3: 70,
    points: 4,
    // Well off the axis on every curve, so the marked point's PF / PQ measurements (and
    // its tangent and normal) never stack on the axis line with the focus and vertex.
    pointT: 0.33,
    showAll: false,
    showTangent: true,
    showNames: false,
    buildStage: BUILD_STAGES.length - 1, // Step 5's "Draw it step by step" rewinds to 0
    // Step 4 opens on the CURVE ALONE and reveals the apparatus from there, so the sheet's
    // first frame is recognisably the slice the learner just made (ADR-088).
    locusStage: 0,
    // Which of Step 4's six proof stages the learner has walked to (ADR-095). It never
    // advances by itself: Back and Next are the only things that move it.
    proofStage: 0,
    // WHAT THE LIVE CUT IS, as the sheet must draw it (ADR-090): 'conic' | 'circle' |
    // 'triangle' | 'none'. Three of §6.1's six sections are not plane conics, and the sheet
    // draws each of them as itself rather than substituting a curve the cone does not have.
    // `cutA`/`cutB` carry that section's own dimensions in mm — the circle's radius; the
    // triangle's base and its two equal sides. Derived from the scene, never dialled.
    cutKind: 'conic',
    cutA: 0,
    cutB: 0,
    // §6.6's three properties, shown on request and one at a time (ADR-093). `propsOpen` swaps
    // the sheet for their figure; `propStage` is which of the three is drawn.
    propsOpen: false,
    propStage: 0,
    // Auxiliary construction linework on the sheet — the thin lines that found the answer.
    // On by default: hiding them is the learner's choice to read the finished figure alone.
    showConstruction: true,
  };
}
