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
  return { enabled: false, angleDeg: 30, offset: -1.2 };
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

  // ---- Parabola (§6.7) ----
  {
    id: 'parabola-tangent',
    curve: CurveType.Parabola,
    label: 'Tangent method',
    example: 'Example 6.8',
    dim1: { label: 'Double ordinate', min: 60, max: 200, step: 1, unit: 'mm', value: 120 },
    dim2: { label: 'Abscissa', min: 30, max: 160, step: 1, unit: 'mm', value: 90 },
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

  // ---- Hyperbola (§6.9) ----
  {
    id: 'hyperbola-foci',
    curve: CurveType.Hyperbola,
    label: 'Foci and the difference of the distances',
    example: 'Example 6.13',
    dim1: { label: 'Distance between foci', min: 40, max: 160, step: 1, unit: 'mm', value: 100 },
    dim2: { label: 'Difference of distances', min: 20, max: 120, step: 1, unit: 'mm', value: 50 },
  },
  {
    id: 'hyperbola-ordinate',
    curve: CurveType.Hyperbola,
    label: 'Ordinate, abscissa and transverse axis',
    example: 'Example 6.14',
    dim1: { label: 'Transverse axis', min: 40, max: 160, step: 1, unit: 'mm', value: 80 },
    dim2: { label: 'Abscissa', min: 20, max: 120, step: 1, unit: 'mm', value: 48 },
    dim3: { label: 'Ordinate', min: 20, max: 140, step: 1, unit: 'mm', value: 60 },
  },
  {
    id: 'hyperbola-asymptotes',
    curve: CurveType.Hyperbola,
    label: 'Asymptotes and a point on the curve',
    example: 'Example 6.15',
    dim1: { label: 'Angle between asymptotes', min: 30, max: 120, step: 1, unit: '°', value: 80 },
    dim2: { label: 'P from the horizontal asymptote', min: 10, max: 80, step: 1, unit: 'mm', value: 30 },
    dim3: { label: 'P from the inclined asymptote', min: 15, max: 100, step: 1, unit: 'mm', value: 45 },
  },
]);

/** Method descriptor by id (or `undefined`). */
export function methodById(id) {
  return METHODS.find((m) => m.id === id);
}

/** The methods belonging to one {@link CurveType}, in chapter order. */
function methodsForCurve(curve) {
  return METHODS.filter((m) => m.curve === curve);
}

/** The first method listed for a curve — the one the dock falls back to on a curve change. */
export function defaultMethodFor(curve) {
  return methodsForCurve(curve)[0]?.id ?? METHODS[0].id;
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
  { label: 'The frame', say: 'Draw the directrix, the axis, and mark the focus F on it.' },
  { label: 'The vertex', say: 'Divide FA in the ratio to find the vertex V — the curve starts here.' },
  { label: 'The scale', say: 'Stand VE = VF up at V and join A to E. That sloping line measures out e for you.' },
  { label: 'The points', say: 'At each point 1, 2, 3 … swing an arc from F equal to the scale height. Where it cuts, the curve passes.' },
  { label: 'The curve', say: 'Join V, P₁, P₂, P₃ … freehand. That is the conic.' },
  { label: 'Tangent', say: 'Join P to F, turn a right angle at F to meet the directrix at T; TP is the tangent, and the normal crosses it at P.' },
]);

/** @returns {ConicState} fresh defaults — Example 6.1's own data (FA = 50 mm, e = 2/3). */
export function defaultConicState() {
  return {
    e: 2 / 3,
    fa: 50,
    curve: CurveType.Ellipse,
    // The general construction (a sheet MODE, not one of METHODS) — Step 5 opens here and
    // the other eleven are one select away.
    method: 'eccentricity',
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
  };
}
