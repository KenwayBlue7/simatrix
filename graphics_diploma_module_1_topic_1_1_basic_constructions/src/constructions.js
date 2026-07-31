// Pure geometry for the nine constructions. NO DOM here — every function returns plain
// data (points, line segments, arc definitions). renderConstruction.js is the only file
// that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 200x140 drawing area (SVG viewBox units), origin top-left,
// y increases downward. Every construction places its own "given" element inside that
// area; there is no camera and nothing to orbit (ADR-095 — this topic has no 3D content).
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass arc or straightedge guide drawn WHILE building (never the answer)
//   'result' — the line/point the construction was built to produce
// renderConstruction.js maps role -> the DESIGN.md §2 construction-line token, so meaning
// never rests on which construction is active, only on the role.

// ----------------------------------------------------------------------------
// Geometry primitives
// ----------------------------------------------------------------------------

const deg2rad = (d) => (d * Math.PI) / 180;

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointAt(center, r, angleRad) {
  return { x: center.x + r * Math.cos(angleRad), y: center.y + r * Math.sin(angleRad) };
}

/** Point at parameter t along a->b; t outside [0,1] extrapolates past the endpoints. */
function pointAlong(a, b, t) {
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** Both intersection points of two circles, or null if they don't cross. */
function circleIntersect(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const xm = c1.x + (a * (c2.x - c1.x)) / d;
  const ym = c1.y + (a * (c2.y - c1.y)) / d;
  const dx = (h * (c2.y - c1.y)) / d;
  const dy = (h * (c2.x - c1.x)) / d;
  return [{ x: xm + dx, y: ym - dy }, { x: xm - dx, y: ym + dy }];
}

/** Intersection of infinite lines through (p1,p2) and (p3,p4), or null if parallel. */
function lineIntersect(p1, p2, p3, p4) {
  const d = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / d;
  return pointAlong(p1, p2, t);
}

/** The two candidates from circleIntersect, sorted [upper, lower] (smaller y first). */
function sortByY(cands) {
  if (!cands) return null;
  return cands[0].y <= cands[1].y ? cands : [cands[1], cands[0]];
}

// ----------------------------------------------------------------------------
// Step builders — each returns a plain object renderConstruction.js knows how to draw
// ----------------------------------------------------------------------------

const P = (p, role, label) => ({ kind: 'point', role, p, label });
const L = (a, b, role, label) => ({ kind: 'line', role, a, b, label });
/** A short compass-arc mark: half-span degrees centered on the direction toward aimPoint. */
const arcMark = (center, radius, aimPoint, spanDeg = 60) => {
  const a = angleOf(center, aimPoint);
  const half = deg2rad(spanDeg / 2);
  return { kind: 'arc', role: 'move', center, radius, startAngle: a - half, endAngle: a + half };
};
/** A fully-specified given arc (drawn solid, not a compass mark). */
const givenArc = (center, radius, startAngle, endAngle) =>
  ({ kind: 'arc', role: 'given', center, radius, startAngle, endAngle });
/** A fully-specified compass arc drawn WHILE constructing — same exact-span shape as
 *  givenArc, but role 'move': it plays (with the needle/pencil sweep) during Construct
 *  instead of appearing pre-drawn in the Given step. Use this (not givenArc) for any arc
 *  that marks a radius the student didn't state — e.g. cutting both rays of an angle at a
 *  chosen compass width. */
const moveArc = (center, radius, startAngle, endAngle) =>
  ({ kind: 'arc', role: 'move', center, radius, startAngle, endAngle });
/** A dimension mark: extension lines + an arrowed offset line + a value, spanning a→b.
 *  `offset` is a signed perpendicular distance from a→b (SVG units) — positive rotates the
 *  a→b direction -90° (right-hand perpendicular); sign is chosen per call site to keep the
 *  mark clear of the construction it measures. Colored by `role` like every other mark. */
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });

/** Signed dim() offset that points AWAY from `awayFrom` (e.g. a triangle/square's opposite
 *  vertex or centre) — so the mark sits outside the shape rather than crossing through it. */
function outwardOffset(a, b, awayFrom, magnitude) {
  const px = -(b.y - a.y);
  const py = b.x - a.x;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dot = px * (awayFrom.x - mx) + py * (awayFrom.y - my);
  return dot > 0 ? -magnitude : magnitude;
}

// ----------------------------------------------------------------------------
// Reusable sub-constructions
// ----------------------------------------------------------------------------

/**
 * The classic "equal arcs from both ends" perpendicular-bisector technique. Works for
 * bisecting a line (radius = extendFactor * |AB|) or, with an explicit fixed radius, for
 * finding a point equidistant from two other points (angle bisector, arc bisector).
 * Returns null if the two circles cannot be drawn distinct (degenerate input).
 */
function perpendicularBisector(A, B, { radius, extendFactor = 0.65, labels = ['c', 'd'] } = {}) {
  const r = radius ?? dist(A, B) * extendFactor;
  if (r <= dist(A, B) / 2) return null; // circles must actually cross
  const sorted = sortByY(circleIntersect(A, r, B, r));
  if (!sorted) return null;
  const [upper, lower] = sorted;
  // Aim each mark straight at the real crossing point (not an approximate up/down
  // direction) so the arc from A and the arc from B visibly overshoot past each other
  // right where they meet, the way a real compass stroke does.
  const steps = [
    arcMark(A, r, upper, 64),
    arcMark(A, r, lower, 64),
    arcMark(B, r, upper, 64),
    arcMark(B, r, lower, 64),
  ];
  const [labelUpper, labelLower] = labels;
  steps.push(P(upper, 'move', labelUpper), P(lower, 'move', labelLower));
  return { steps, upper, lower };
}

/**
 * Erects a perpendicular to the line through (P, refPoint) at P, of the given length, on
 * the side away from the line (assumes the line is roughly horizontal — every construction
 * below that uses this keeps its base line horizontal, so "away" reliably means "upward").
 * Shared by construction 3 (perpendicular from a point ON a line) and construction 8
 * (erecting a square's sides).
 */
function perpendicularAtPoint(P0, refPoint, length, labels = ['c', 'd', 'e']) {
  const dirAngle = angleOf(P0, refPoint);
  const r1 = Math.max(Math.min(length * 0.35, 22), 8);
  const C = pointAt(P0, r1, dirAngle);
  const D = pointAt(P0, r1, dirAngle + Math.PI);
  const r2 = r1 * 1.6;
  const sorted = sortByY(circleIntersect(C, r2, D, r2));
  if (!sorted) return null;
  const apexDir = sorted[0]; // upper candidate — aim both marks at it so they overshoot the crossing
  const [labelC, labelD, labelCross] = labels;
  const steps = [
    P(C, 'move', labelC), P(D, 'move', labelD),
    arcMark(C, r2, apexDir, 64),
    arcMark(D, r2, apexDir, 64),
  ];
  steps.push(P(apexDir, 'move', labelCross));
  const apex = pointAt(P0, length, angleOf(P0, apexDir));
  return { steps, apex };
}

// ----------------------------------------------------------------------------
// The nine constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} principle  One-sentence "why it works" — shown on the Verify step.
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'bisect-line',
    label: 'Bisect a Straight Line',
    shortLabel: 'Bisect Line',
    principle: "Two equal-radius arcs centred on A and B cross at two points that are equidistant from both — so both points lie on AB's perpendicular bisector, which must cross AB exactly at its midpoint.",
    given: [{ key: 'length', label: 'Length AB', unit: 'mm', min: 40, max: 160, step: 5, default: 100 }],
    build({ length }) {
      // The bisector arcs' own radius (extendFactor * |AB|) grows with |AB|, and their
      // drawn 64°-wide compass-mark sweep can reach further than the crossing point
      // itself — at the slider's full 40-160mm range this ran off both top and bottom.
      // Cap the DRAWN length (dim() still shows the real mm value) so the arcs' radius
      // never outgrows the canvas, and use a shallower extendFactor for more headroom.
      const scale = Math.min(1, 120 / (length * 0.9));
      const A = { x: 30, y: 70 };
      const B = { x: 30 + length * 0.9 * scale, y: 70 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${length} mm`, 'given', 24),
      ];
      const bis = perpendicularBisector(A, B, { extendFactor: 0.55 });
      steps.push(...bis.steps);
      const M = lineIntersect(bis.upper, bis.lower, A, B) ?? midpoint(A, B);
      const half = `${(length / 2).toFixed(1)} mm`;
      steps.push(
        L(bis.upper, bis.lower, 'result'), P(M, 'result', 'M'),
        dim(A, M, half, 'result', -15), dim(M, B, half, 'result', -15),
      );
      return { steps, resultText: `AM = MB = ${(length / 2).toFixed(1)} mm` };
    },
  },

  {
    id: 'bisect-arc',
    label: 'Bisect an Arc',
    shortLabel: 'Bisect Arc',
    principle: "The arc's centre O is equidistant from every point on it, so the chord AB shares its perpendicular bisector with the arc itself — bisecting the chord bisects the arc.",
    given: [
      { key: 'radius', label: 'Arc radius', unit: 'mm', min: 30, max: 70, step: 5, default: 50 },
      { key: 'span', label: 'Arc span', unit: '°', min: 60, max: 160, step: 10, default: 100 },
    ],
    build({ radius, span }) {
      // A wide span at the max 70mm radius puts the chord's bisector arcs (64°-wide
      // compass sweeps) well past the canvas — draw at a capped radius (dim() still
      // shows the real mm value) so the whole construction always fits.
      const drawR = Math.min(radius, 45);
      const O = { x: 100, y: 85 };
      const start = deg2rad(-90 - span / 2);
      const end = deg2rad(-90 + span / 2);
      const A = pointAt(O, drawR, start);
      const B = pointAt(O, drawR, end);
      const steps = [
        givenArc(O, drawR, start, end), P(A, 'given', 'A'), P(B, 'given', 'B'), P(O, 'given', 'O'),
        dim(O, A, `${radius} mm`, 'given', outwardOffset(O, A, B, 15)),
      ];
      const chordMid = midpoint(A, B);
      const bis = perpendicularBisector(A, B, { extendFactor: 0.65 });
      if (!bis) return { steps, resultText: 'Span too small to bisect at this radius.', invalid: 'span-too-small' };
      steps.push(...bis.steps);
      const dir = { x: chordMid.x - O.x, y: chordMid.y - O.y };
      const dirLen = Math.hypot(dir.x, dir.y) || 1;
      const M = { x: O.x + (drawR * dir.x) / dirLen, y: O.y + (drawR * dir.y) / dirLen };
      steps.push(L(chordMid, M, 'result'), P(chordMid, 'result', 'N'), P(M, 'result', 'M'));
      return { steps, resultText: `Arc AM = arc MB (each ${(span / 2).toFixed(1)}°)` };
    },
  },

  {
    id: 'perpendicular-on-line',
    label: 'Perpendicular to a Line — Point ON the Line',
    shortLabel: 'Perpendicular (on line)',
    principle: 'C and D are equidistant from P along AB; the point where two equal arcs centred on C and D cross is equidistant from both, and that can only happen directly above P — so the line to it is perpendicular to AB.',
    given: [
      { key: 'length', label: 'Length AB', unit: 'mm', min: 60, max: 160, step: 5, default: 120 },
      { key: 'position', label: 'Position of P', unit: '%', min: 15, max: 85, step: 5, default: 50 },
    ],
    build({ length, position }) {
      const A = { x: 25, y: 80 };
      const B = { x: 25 + length * 0.9, y: 80 };
      const Pt = pointAlong(A, B, position / 100);
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'), P(Pt, 'given', 'P'),
        dim(A, B, `${length} mm`, 'given', 24),
      ];
      const armLen = Math.min(dist(A, Pt), dist(B, Pt)) * 0.7;
      const perp = perpendicularAtPoint(Pt, B, Math.max(armLen * 1.6, 25));
      if (!perp) return { steps, resultText: 'Move P away from the ends to construct.', invalid: 'degenerate' };
      steps.push(...perp.steps, L(Pt, perp.apex, 'result'), P(perp.apex, 'result', 'E'));
      return { steps, resultText: '∠ perpendicular at P = 90.0°' };
    },
  },

  {
    id: 'perpendicular-off-line',
    label: 'Perpendicular to a Line — Point NOT on the Line',
    shortLabel: 'Perpendicular (off line)',
    principle: 'C and D are the two points on AB equidistant from P; a second pair of equal arcs from C and D crosses again at Q, and PQ — the perpendicular bisector of CD — is exactly the perpendicular dropped from P to the line.',
    given: [
      { key: 'length', label: 'Length AB', unit: 'mm', min: 60, max: 160, step: 5, default: 120 },
      { key: 'height', label: 'Height of P above AB', unit: 'mm', min: 20, max: 45, step: 5, default: 40 },
      { key: 'position', label: 'P horizontal position', unit: '%', min: 25, max: 75, step: 5, default: 45 },
    ],
    build({ length, height, position }) {
      // A.y sits higher (smaller y) than the other horizontal-line constructions so P —
      // up to 45mm above AB — and the two compass circles below it both have headroom;
      // the compass-width multipliers are shallower (1.1x, not 1.4x/1.3x) so those
      // circles stay tight to the line instead of ballooning past the canvas edges.
      const A = { x: 40, y: 90 };
      const B = { x: 40 + length * 0.9, y: 90 };
      const Pt = { x: A.x + (B.x - A.x) * (position / 100), y: 90 - height };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'), P(Pt, 'given', 'P'),
        dim(A, B, `${length} mm`, 'given', 24),
      ];
      const r1 = Math.max(height * 1.1, 30);
      if (r1 <= height) return { steps, resultText: 'Raise P higher to construct.', invalid: 'degenerate' };
      const dx = Math.sqrt(r1 * r1 - height * height);
      const C = { x: Pt.x - dx, y: 90 };
      const D = { x: Pt.x + dx, y: 90 };
      steps.push(P(C, 'move', 'C'), P(D, 'move', 'D'),
        arcMark(Pt, r1, C, 64), arcMark(Pt, r1, D, 64));
      const r2 = dx * 1.1;
      const cands = circleIntersect(C, r2, D, r2);
      if (!cands) return { steps, resultText: 'Adjust P to construct.', invalid: 'degenerate' };
      const Q = cands[0].y >= cands[1].y ? cands[0] : cands[1]; // lower one (below the line)
      steps.push(arcMark(C, r2, Q, 64), arcMark(D, r2, Q, 64), P(Q, 'move', 'Q'));
      const F = lineIntersect(Pt, Q, A, B) ?? midpoint(C, D);
      steps.push(
        L(Pt, Q, 'result'), P(F, 'result', 'F'),
        dim(Pt, F, `${dist(Pt, F).toFixed(1)} mm`, 'result', 15),
      );
      return { steps, resultText: `PF = ${dist(Pt, F).toFixed(1)} mm, foot F is the perpendicular` };
    },
  },

  {
    id: 'bisect-angle',
    label: 'Bisect a Given Angle',
    shortLabel: 'Bisect Angle',
    principle: 'C and D are equidistant from O along each ray; the point where two equal arcs from C and D cross is equidistant from both, so the line OE splits ∠AOB into two equal halves.',
    given: [{ key: 'angle', label: 'Angle AOB', unit: '°', min: 30, max: 150, step: 5, default: 70 }],
    build({ angle }) {
      // O sits far enough right, and rayLen short enough, that OB stays on-canvas across
      // the slider's full 30–150° range (B swings up-and-left as angle grows).
      const O = { x: 58, y: 110 };
      const rayLen = 52;
      const A = pointAt(O, rayLen, 0);
      const B = pointAt(O, rayLen, deg2rad(-angle));
      const steps = [L(O, A, 'given'), L(O, B, 'given'), P(O, 'given', 'O'), P(A, 'given', 'A'), P(B, 'given', 'B')];
      const r1 = 34;
      const C = pointAt(O, r1, 0);
      const D = pointAt(O, r1, deg2rad(-angle));
      // moveArc (not givenArc): this radius isn't stated by the problem, the constructor
      // CHOSE it — it must play with the compass sweep during Construct, not appear
      // pre-drawn back in the Given step.
      steps.push(
        moveArc(O, r1, deg2rad(-angle), 0), P(C, 'move', 'C'), P(D, 'move', 'D'),
        dim(O, C, `${r1} mm`, 'move', 13),
      );
      // r2 is sized off the ACTUAL chord CD (like perpendicularBisector's extendFactor),
      // not a fixed fraction of r1 — that fixed fraction made wide angles (e.g. 140°)
      // unbuildable, since a long chord needs a wider compass than a short one to still
      // cross itself. 0.65 guarantees r2*2 > CD for every angle in the slider's range.
      const chordCD = dist(C, D);
      const r2 = chordCD * 0.65;
      if (r2 * 2 <= chordCD) return { steps, resultText: 'Widen the angle to construct.', invalid: 'degenerate' };
      const cands = circleIntersect(C, r2, D, r2);
      const target = deg2rad(-angle / 2);
      const E = cands.reduce((best, c) => {
        const da = Math.abs(angleOf(O, c) - target);
        const db = Math.abs(angleOf(O, best) - target);
        return da < db ? c : best;
      });
      // Aim both marks at the real crossing point E so they overshoot past each other.
      steps.push(arcMark(C, r2, E, 64), arcMark(D, r2, E, 64));
      const Eext = pointAt(O, rayLen * 0.95, angleOf(O, E));
      steps.push(P(E, 'move', 'E'), L(O, Eext, 'result'));
      return { steps, resultText: `∠AOE = ∠EOB = ${(angle / 2).toFixed(1)}°` };
    },
  },

  {
    id: 'transfer-angle',
    label: 'Transfer a Given Angle',
    shortLabel: 'Transfer Angle',
    principle: "The chord CD has a fixed length for a given angle and radius; reproducing that same radius and chord length at O' rebuilds an identical triangle, so ∠A'O'D' matches ∠AOB exactly.",
    given: [{ key: 'angle', label: 'Angle AOB', unit: '°', min: 30, max: 150, step: 5, default: 60 }],
    build({ angle }) {
      // O sits far enough right, and rayLen is short enough, that the swept ray OB stays
      // on-canvas for every angle up to the slider's 150° max (B swings up-and-left as
      // angle grows — at 150° it reaches its leftmost point). O' is placed with matching
      // clearance so the transferred ray never runs off the right edge either.
      const O = { x: 45, y: 100 };
      const rayLen = 40;
      const A = pointAt(O, rayLen, 0);
      const B = pointAt(O, rayLen, deg2rad(-angle));
      const Op = { x: 150, y: 100 };
      const Rp = pointAt(Op, rayLen, 0);
      const steps = [
        L(O, A, 'given'), L(O, B, 'given'), P(O, 'given', 'O'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        L(Op, Rp, 'given'), P(Op, 'given', "O'"), P(Rp, 'given', "R'"),
      ];
      const r1 = 30;
      const C = pointAt(O, r1, 0);
      const D = pointAt(O, r1, deg2rad(-angle));
      const chord = dist(C, D);
      const chordText = `${chord.toFixed(1)} mm`;
      // moveArc (not givenArc): this radius isn't stated by the problem, the constructor
      // CHOSE it — it must play with the compass sweep during Construct, not appear
      // pre-drawn back in the Given step (that was the actual "confusing" bug: the arc
      // used to render instantly, mis-classified as part of the given angle).
      steps.push(
        moveArc(O, r1, deg2rad(-angle), 0), P(C, 'move', 'C'), P(D, 'move', 'D'),
        dim(O, C, `${r1} mm`, 'move', 13),
        dim(C, D, chordText, 'move', outwardOffset(C, D, O, 13)),
      );
      const Cp = pointAt(Op, r1, 0); // lies on ray O'R' itself — aim the mark there so it overshoots past the ray
      steps.push(arcMark(Op, r1, Cp, 64), P(Cp, 'move', "C'"));
      const cands = circleIntersect(Cp, chord, Op, r1);
      if (!cands) return { steps, resultText: 'Adjust the angle to construct.', invalid: 'degenerate' };
      const Dp = cands[0].y <= cands[1].y ? cands[0] : cands[1]; // upper (matches the -angle opening)
      // Same compass width (chord) reused here, unchanged — the dim shows the identical
      // value as the C–D mark above, making the "transfer" visually obvious.
      steps.push(
        arcMark(Cp, chord, Dp, 64), P(Dp, 'move', "D'"),
        dim(Cp, Dp, chordText, 'move', outwardOffset(Cp, Dp, Op, 13)),
      );
      const Dext = pointAt(Op, rayLen * 0.95, angleOf(Op, Dp));
      steps.push(L(Op, Dext, 'result'));
      return { steps, resultText: `∠A'O'D' = ${angle.toFixed(1)}° (transferred from ∠AOB)` };
    },
  },

  {
    id: 'triangle-three-sides',
    label: 'Triangle Given Three Sides',
    shortLabel: 'Triangle (SSS)',
    principle: 'C is the one point at distance b from A and distance a from B — the intersection of two arcs of those radii — so triangle ABC has exactly the three given side lengths (SSS fixes a triangle uniquely).',
    given: [
      { key: 'a', label: 'Side a (BC)', unit: 'mm', min: 30, max: 150, step: 5, default: 70 },
      { key: 'b', label: 'Side b (CA)', unit: 'mm', min: 30, max: 150, step: 5, default: 90 },
      { key: 'c', label: 'Side c (AB)', unit: 'mm', min: 30, max: 150, step: 5, default: 100 },
    ],
    build({ a, b, c }) {
      if (a + b <= c || b + c <= a || c + a <= b) {
        return { steps: [], resultText: 'No triangle: each side must be shorter than the sum of the other two.', invalid: 'triangle-inequality' };
      }
      // A thin/tall triangle (one short side, two long near-equal ones) apexes close to
      // A or B despite a modest perimeter, sometimes to the LEFT of A — 150 wasn't a
      // tight enough perimeter cap, 115 too low a baseline, and 30 too little left
      // margin. Tighter cap, higher baseline, A shifted right for headroom on both sides.
      const scale = Math.min(0.85, 130 / (a + b + c));
      const A = { x: 60, y: 90 };
      const B = { x: 60 + c * scale, y: 90 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${c} mm`, 'given', 18),
      ];
      const rb = b * scale;
      const ra = a * scale;
      const cands = sortByY(circleIntersect(A, rb, B, ra));
      if (!cands) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      const C = cands[0];
      // Aim both marks at the real crossing point C so they overshoot past each other.
      steps.push(arcMark(A, rb, C, 70), arcMark(B, ra, C, 70));
      steps.push(
        P(C, 'move'), L(A, C, 'result'), L(B, C, 'result'), P(C, 'result', 'C'),
        dim(A, C, `${b} mm`, 'result', outwardOffset(A, C, B, 14)),
        dim(B, C, `${a} mm`, 'result', outwardOffset(B, C, A, 14)),
      );
      return { steps, resultText: `Triangle ABC: a=${a} mm, b=${b} mm, c=${c} mm` };
    },
  },

  {
    id: 'square-one-side',
    label: 'Square Given One Side',
    shortLabel: 'Square',
    principle: 'Erecting equal perpendiculars (length = side) at both A and B, then closing the top edge DC, gives four equal sides and four right angles — the definition of a square.',
    given: [{ key: 'side', label: 'Side length', unit: 'mm', min: 30, max: 100, step: 5, default: 60 }],
    build({ side }) {
      // A.y moved down from 110 to 115 — at the 100mm max side length the square's top
      // edge (+ the compass-mark arcs' own overshoot past it) crept above y=0. The given
      // AB dim below the line is pulled in from 20 to 14 so it doesn't in turn push past
      // y=140 with A this low.
      const A = { x: 40, y: 115 };
      const B = { x: 40 + side, y: 115 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${side} mm`, 'given', 14),
      ];
      // Distinct helper-point labels per corner (c/d/e vs c'/d'/e') so the two
      // perpendicularAtPoint calls don't stamp duplicate letters onto the same drawing.
      const perpA = perpendicularAtPoint(A, B, side, ['c', 'd', 'e']);
      const perpB = perpendicularAtPoint(B, A, side, ["c'", "d'", "e'"]);
      if (!perpA || !perpB) return { steps, resultText: 'Adjust the side length to construct.', invalid: 'degenerate' };
      steps.push(...perpA.steps, ...perpB.steps);
      const D = perpA.apex; // corner above A
      const C = perpB.apex; // corner above B
      const center = { x: (A.x + B.x + C.x + D.x) / 4, y: (A.y + B.y + C.y + D.y) / 4 };
      const sideText = `${side.toFixed(1)} mm`;
      steps.push(
        L(A, D, 'result'), L(B, C, 'result'), L(D, C, 'result'), P(D, 'result', 'D'), P(C, 'result', 'C'),
        dim(A, D, sideText, 'result', outwardOffset(A, D, center, 14)),
        dim(B, C, sideText, 'result', outwardOffset(B, C, center, 14)),
        // The top edge DC's outward offset points UP, off the top of the canvas at large
        // side lengths (D/C already sit close to y=0 there) — kept tighter than the two
        // side edges' dims.
        dim(D, C, sideText, 'result', outwardOffset(D, C, center, 8)),
      );
      return { steps, resultText: `Square ABCD, side = ${side.toFixed(1)} mm` };
    },
  },

  {
    id: 'divide-line',
    label: 'Divide a Line into n Equal Parts',
    shortLabel: 'Divide Line',
    principle: "By the basic proportionality theorem, lines drawn parallel to the last-tick-to-B segment cut AB in the same ratio as they cut the auxiliary ray — since the ray's ticks are equally spaced, so are AB's.",
    given: [
      { key: 'length', label: 'Length AB', unit: 'mm', min: 40, max: 160, step: 5, default: 120 },
      { key: 'n', label: 'Number of parts (n)', unit: '', min: 2, max: 12, step: 1, default: 5 },
    ],
    build({ length, n }) {
      const parts = Math.round(n);
      const A = { x: 20, y: 95 };
      const B = { x: 20 + length * 0.85, y: 95 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${length} mm`, 'given', -20), // above AB — the auxiliary ray occupies below
      ];
      // Auxiliary ray AC at a shallow angle below AB. Tick spacing shrinks as n grows so
      // the ray's total length stays bounded — a fixed 12mm tick at n=12 ran the ray
      // well past the bottom of the canvas.
      const rayAngle = deg2rad(28);
      const tick = Math.min(12, 85 / (parts + 0.6));
      const C = pointAt(A, tick * (parts + 0.6), rayAngle);
      steps.push(L(A, C, 'move'));
      // n equal tick marks along AC (a fixed compass width stepped off n times).
      const ticks = [];
      for (let i = 1; i <= parts; i++) {
        const pt = pointAt(A, tick * i, rayAngle);
        ticks.push(pt);
        steps.push(P(pt, 'move', String(i)));
      }
      const lastTick = ticks[parts - 1];
      steps.push(L(lastTick, B, 'move'));
      // Lines through each earlier tick, parallel to (lastTick -> B), meeting AB — by
      // similar triangles this lands exactly at the i/n division point of AB.
      const dir = { x: B.x - lastTick.x, y: B.y - lastTick.y };
      const divisions = [];
      for (let i = 1; i < parts; i++) {
        const from = ticks[i - 1];
        const far = { x: from.x + dir.x, y: from.y + dir.y };
        const onAB = lineIntersect(from, far, A, B);
        if (onAB) {
          divisions.push({ point: onAB, label: `${i}'` }); // i' — the AB point matching tick i
          steps.push(L(from, onAB, 'result'));
        }
      }
      for (const d of divisions) steps.push(P(d.point, 'result', d.label));
      return { steps, resultText: `AB divided into ${parts} equal parts of ${(length / parts).toFixed(1)} mm each` };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
