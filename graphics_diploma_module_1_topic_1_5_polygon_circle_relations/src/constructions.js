// Pure geometry for the four polygon/circle-relation constructions. NO DOM here — every
// function returns plain data (points, line segments, arc/circle definitions).
// renderConstruction.js is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: fixed 200x140 SVG viewBox, origin top-left, y increases downward —
// same convention as every prior topic. Generic primitives/step-builders below are copied
// verbatim from Topics 1.1-1.4 (dist/midpoint/angleOf/pointAt/pointAlong/circleIntersect/
// lineIntersect/sortByY/P/L/arcMark/moveArc/circleStep/dim/angleDim/outwardOffset/
// perpendicularBisector). New primitives this topic needs and no prior topic did:
// angleBisectorAt (generalizes Topic 1.1's fixed-ray bisect-angle to any vertex/ray pair —
// needed since a triangle's own vertex angles are never a convenient fixed value),
// perpendicularFootFromAbove (Topic 1.1's perpendicular-off-line technique, pulled into a
// reusable helper), tangentAtPoint (perpendicular to a radius AT a point on a circle,
// extending both directions into a full tangent LINE — none of Topics 1.1-1.4 needed this
// shape), divideSegment (Topic 1.1's divide-line inline logic, pulled into a reusable
// n-part divider), rayCircleFar (extends a ray to its far crossing with a circle — the
// same technique Topic 1.4's n-gon semicircle method used).
//
// PAIRING (this topic's own audit, confirmed before building): four constructions as two
// mirrored pairs, each pair built on the SAME base shape via two separately-selectable
// techniques — Topic 1.3's picker-pair pattern (two distinct picker items, each with its
// own principle text), not Topic 1.2's single-construction toggle, because incircle vs.
// circumcircle (and superscribe vs. inscribe) are genuinely different techniques, not one
// technique read two ways:
//   Pair A (triangle -> circle): incircle-triangle, circumcircle-triangle
//   Pair B (circle -> polygon):  superscribe-polygon, inscribe-polygon
//
// A note on precision (RULES §6.6, textbook fidelity over fudging — the discipline Topic
// 1.4 established for its own semicircle-division method). superscribe-polygon's
// bisection/tangent technique is EXACT for every n it offers (4, 6, 8, 12 — each reachable
// by repeated angle bisection from a perpendicular-diameter or radius-chord-hexagon start).
// inscribe-polygon's general diameter-division method is EXACT only for n = 3, 4, 6; for
// every other n (5, 7, 8, 9...) it is the textbook's own genuinely APPROXIMATE method —
// verified numerically (Node, this session): max angular error is ~0.31° at n=5, ~0.59° at
// n=7, up to ~0.65° at n=9 (error is a pure angle, so it does not shrink or grow with the
// drawing's radius). This construction draws the REAL constructed points, not a silently-
// substituted exact polygon — the small approximation is real, is what a compass and
// straightedge actually produce, and is exactly why the textbook calls this "the general
// method" rather than an exact one. See principle()/resultText.
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass arc/circle or straightedge guide drawn WHILE building
//   'result' — the circle/polygon the construction was built to produce
// renderConstruction.js maps role -> the DESIGN.md §2 construction-line token.

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

/** Far intersection of the ray from P through Q with circle (C,r); null if it misses. */
function rayCircleFar(P0, Q, C, r) {
  const dx = Q.x - P0.x;
  const dy = Q.y - P0.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const fx = P0.x - C.x;
  const fy = P0.y - C.y;
  const b = 2 * (fx * ux + fy * uy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = Math.max((-b - sq) / 2, (-b + sq) / 2);
  return { x: P0.x + ux * t, y: P0.y + uy * t };
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
const moveArc = (center, radius, startAngle, endAngle) =>
  ({ kind: 'arc', role: 'move', center, radius, startAngle, endAngle });
/** A full given/auxiliary circle, drawn as a native SVG <circle> (renderConstruction.js). */
const circleStep = (center, radius, role) => ({ kind: 'circle', role, center, radius });
/** A dimension mark: extension lines + an arrowed offset line + a value, spanning a→b. */
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });
/** An angle mark: a small arc between two rays from `center` plus its degree value. */
const angleDim = (center, rayA, rayB, text, role, radius = 10) =>
  ({ kind: 'angledim', role, center, rayA, rayB, text, radius });

/** Signed dim()/offset-line offset that points AWAY from `awayFrom`. */
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

/** The classic "equal arcs from both ends" perpendicular-bisector technique (Topic 1.1),
 *  applied here to a triangle SIDE (circumcircle) instead of a lone given segment. */
function perpendicularBisector(A, B, { radius, extendFactor = 0.65, labels = ['c', 'd'] } = {}) {
  const r = radius ?? dist(A, B) * extendFactor;
  if (r <= dist(A, B) / 2) return null;
  const sorted = sortByY(circleIntersect(A, r, B, r));
  if (!sorted) return null;
  const [upper, lower] = sorted;
  const steps = [
    arcMark(A, r, upper, 64), arcMark(A, r, lower, 64),
    arcMark(B, r, upper, 64), arcMark(B, r, lower, 64),
  ];
  const [labelUpper, labelLower] = labels;
  steps.push(P(upper, 'move', labelUpper), P(lower, 'move', labelLower));
  return { steps, upper, lower };
}

/** Bisects the angle at vertex V between rays toward P1 and P2 (Topic 1.1's bisect-angle
 *  technique, generalized to an arbitrary vertex/ray pair rather than a fixed origin with a
 *  fixed ray length — a triangle's vertex angles are never a convenient fixed value). E is
 *  a point on the true bisector ray from V, at whatever distance the construction lands it;
 *  callers extend a drawn ray from V through a further point (e.g. an already-known
 *  intersection) rather than relying on V-E alone to look long enough. */
function angleBisectorAt(V, P1, P2, r1, labels = ['c', 'd', 'e']) {
  const a1 = angleOf(V, P1);
  const a2 = angleOf(V, P2);
  const C = pointAt(V, r1, a1);
  const D = pointAt(V, r1, a2);
  const steps = [moveArc(V, r1, a1, a2), P(C, 'move', labels[0]), P(D, 'move', labels[1])];
  const chordCD = dist(C, D);
  const r2 = chordCD * 0.65;
  if (r2 * 2 <= chordCD) return null;
  const cands = circleIntersect(C, r2, D, r2);
  if (!cands) return null;
  // the bisector point is the crossing FARTHER from V (the near one sits between V and CD)
  const E = dist(cands[0], V) > dist(cands[1], V) ? cands[0] : cands[1];
  steps.push(arcMark(C, r2, E, 64), arcMark(D, r2, E, 64), P(E, 'move', labels[2]));
  return { steps, E };
}

/** Drops a perpendicular from P0 down to line AB, where P0 sits ABOVE the horizontal
 *  baseline at y=baselineY (true of every triangle this topic draws — the incentre always
 *  sits inside the triangle, whose apex is placed above AB). Topic 1.1's
 *  perpendicular-off-line technique, pulled into a reusable helper (used here for the
 *  incircle's inradius; no prior topic needed it as a shared function). */
function perpendicularFootFromAbove(P0, A, B, baselineY, labels = ['c', 'd', 'q']) {
  const height = baselineY - P0.y;
  if (height <= 1e-6) return null;
  const r1 = Math.max(height * 1.1, 18);
  const dxr = Math.sqrt(Math.max(r1 * r1 - height * height, 1e-6));
  const C = { x: P0.x - dxr, y: baselineY };
  const D = { x: P0.x + dxr, y: baselineY };
  const r2 = dxr * 1.15;
  const cands = circleIntersect(C, r2, D, r2);
  if (!cands) return null;
  const Q = cands[0].y >= cands[1].y ? cands[0] : cands[1]; // lower candidate (below the baseline)
  const F = lineIntersect(P0, Q, A, B) ?? midpoint(C, D);
  const steps = [
    P(C, 'move', labels[0]), P(D, 'move', labels[1]),
    arcMark(P0, r1, C, 64), arcMark(P0, r1, D, 64),
    arcMark(C, r2, Q, 64), arcMark(D, r2, Q, 64),
    P(Q, 'move', labels[2]),
  ];
  return { steps, F };
}

/** Erects the tangent to a circle at point T (on it, at radius from centre O) — a
 *  perpendicular to the radius OT, extended `length`/2 on both sides of T so it reads as a
 *  full tangent LINE, not a one-sided ray. Generalizes Topic 1.1's perpendicular-at-point
 *  technique (which only ever built toward one fixed "up" side) to any orientation around a
 *  circle — none of Topics 1.1-1.4 needed a tangent to a full circle from a point ON it. */
function tangentAtPoint(T, O, length, labels = ['c', 'd']) {
  const dirAngle = angleOf(O, T); // outward radius direction
  const r1 = Math.max(Math.min(length * 0.3, 16), 7);
  const C = pointAt(T, r1, dirAngle);
  const D = pointAt(T, r1, dirAngle + Math.PI);
  const r2 = r1 * 1.6;
  const cands = circleIntersect(C, r2, D, r2);
  if (!cands) return null;
  const [E1, E2] = cands; // both lie on the perpendicular through T, one on each side
  const endA = pointAt(T, length / 2, angleOf(T, E1));
  const endB = pointAt(T, length / 2, angleOf(T, E2));
  const steps = [
    P(C, 'move', labels[0]), P(D, 'move', labels[1]),
    arcMark(C, r2, E1, 60), arcMark(D, r2, E1, 60),
    arcMark(C, r2, E2, 60), arcMark(D, r2, E2, 60),
  ];
  return { steps, a: endA, b: endB };
}

/** Divides segment AB into n equal parts via the auxiliary-ray + parallels technique
 *  (Topic 1.1's divide-line, pulled into a reusable helper returning the division points
 *  instead of building a full standalone construction). */
function divideSegment(A, B, n, rayAngleDeg = 28) {
  const steps = [];
  const rayAngle = deg2rad(rayAngleDeg);
  const abLen = dist(A, B);
  const tick = Math.min(12, (abLen * 0.85) / (n + 0.6));
  const auxEnd = pointAt(A, tick * (n + 0.6), rayAngle);
  steps.push(L(A, auxEnd, 'move'));
  const ticks = [];
  for (let i = 1; i <= n; i++) {
    const pt = pointAt(A, tick * i, rayAngle);
    ticks.push(pt);
    steps.push(P(pt, 'move', String(i)));
  }
  const lastTick = ticks[n - 1];
  steps.push(L(lastTick, B, 'move'));
  const dir = { x: B.x - lastTick.x, y: B.y - lastTick.y };
  const divisions = [];
  for (let i = 1; i < n; i++) {
    const from = ticks[i - 1];
    const far = { x: from.x + dir.x, y: from.y + dir.y };
    const onAB = lineIntersect(from, far, A, B);
    if (onAB) {
      divisions.push(onAB);
      steps.push(L(from, onAB, 'move'));
    }
  }
  return { steps, divisions };
}

// ----------------------------------------------------------------------------
// Superscribe-polygon's discrete n choices (bisection-constructible shapes only — see
// principle() for why the set doesn't generalize to every n the way inscribe-polygon's
// slider does).
// ----------------------------------------------------------------------------

const SUPERSCRIBE_N_CHOICES = [
  { id: '4', n: 4, label: 'Square (n=4)' },
  { id: '6', n: 6, label: 'Hexagon (n=6)' },
  { id: '8', n: 8, label: 'Octagon (n=8)' },
  { id: '12', n: 12, label: '12-gon (n=12)' },
];

// ----------------------------------------------------------------------------
// The four constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string|((choiceId:string)=>string)} principle
 * @property {ParamSpec[]} given
 * @property {Array<{id:string,n:number,label:string}>} [nChoices]
 * @property {string} [defaultNId]
 * @property {(params:Record<string,number|string>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  // -- Pair A: triangle -> circle -------------------------------------------------------
  {
    id: 'incircle-triangle',
    label: 'Inscribe a Circle in a Triangle',
    shortLabel: 'Incircle',
    principle: "Every point on an angle's bisector is equidistant from both of its arms — so where two of a triangle's angle bisectors cross, that point I is equidistant from all three SIDES at once. A circle centred there, with that common distance as its radius, touches all three sides without crossing any of them.",
    given: [
      { key: 'a', label: 'Side a (BC)', unit: 'mm', min: 40, max: 110, step: 5, default: 70 },
      { key: 'b', label: 'Side b (CA)', unit: 'mm', min: 40, max: 110, step: 5, default: 60 },
      { key: 'c', label: 'Side c (AB)', unit: 'mm', min: 40, max: 110, step: 5, default: 80 },
    ],
    build({ a, b, c }) {
      if (a + b <= c || b + c <= a || c + a <= b) {
        return { steps: [], resultText: 'No triangle: each side must be shorter than the sum of the other two.', invalid: 'triangle-inequality' };
      }
      const scale = Math.min(0.85, 130 / (a + b + c));
      const Y0 = 100;
      const A0 = { x: 52, y: Y0 };
      const B0 = { x: 52 + c * scale, y: Y0 };
      const rb = b * scale;
      const ra = a * scale;
      const cands = sortByY(circleIntersect(A0, rb, B0, ra));
      if (!cands) return { steps: [], resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      const C0 = cands[0];
      const steps = [
        L(A0, B0, 'given'), L(B0, C0, 'given'), L(C0, A0, 'given'),
        P(A0, 'given', 'A'), P(B0, 'given', 'B'), P(C0, 'given', 'C'),
        dim(A0, B0, `${c} mm`, 'given', 16),
        dim(B0, C0, `${a} mm`, 'given', outwardOffset(B0, C0, A0, 14)),
        dim(C0, A0, `${b} mm`, 'given', outwardOffset(C0, A0, B0, 14)),
      ];
      const r1a = Math.min(dist(A0, B0), dist(A0, C0)) * 0.5;
      const bisA = angleBisectorAt(A0, B0, C0, r1a, ['p', 'q', 'r']);
      if (!bisA) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      steps.push(...bisA.steps);
      const r1b = Math.min(dist(B0, A0), dist(B0, C0)) * 0.5;
      const bisB = angleBisectorAt(B0, A0, C0, r1b, ["p'", "q'", "r'"]);
      if (!bisB) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      steps.push(...bisB.steps);
      const I = lineIntersect(A0, bisA.E, B0, bisB.E);
      if (!I) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      const extA = dist(A0, I) + 8;
      const extB = dist(B0, I) + 8;
      steps.push(
        L(A0, pointAt(A0, extA, angleOf(A0, I)), 'move'),
        L(B0, pointAt(B0, extB, angleOf(B0, I)), 'move'),
        P(I, 'move', 'I'),
      );
      const foot = perpendicularFootFromAbove(I, A0, B0, Y0, ['s', 't', 'u']);
      if (!foot) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      steps.push(...foot.steps);
      const r = dist(I, foot.F);
      steps.push(L(I, foot.F, 'move'), P(foot.F, 'move', 'F'), circleStep(I, r, 'result'));
      steps.push(dim(I, foot.F, `${r.toFixed(1)} mm`, 'result', 12));
      return { steps, resultText: `Incircle radius r = ${r.toFixed(1)} mm, centred at I, touching all three sides` };
    },
  },

  {
    id: 'circumcircle-triangle',
    label: 'Circumscribe a Circle about a Triangle',
    shortLabel: 'Circumcircle',
    principle: "Every point on a segment's perpendicular bisector is equidistant from both its ends — so where two of a triangle's side-bisectors cross, that point O is equidistant from all three VERTICES at once. A circle centred there, through any one vertex, passes through all three — the mirror of the incircle's own logic, sides swapped for vertices.",
    given: [
      { key: 'a', label: 'Side a (BC)', unit: 'mm', min: 40, max: 100, step: 5, default: 60 },
      { key: 'b', label: 'Side b (CA)', unit: 'mm', min: 40, max: 100, step: 5, default: 70 },
      { key: 'c', label: 'Side c (AB)', unit: 'mm', min: 40, max: 100, step: 5, default: 55 },
    ],
    build({ a, b, c }) {
      if (a + b <= c || b + c <= a || c + a <= b) {
        return { steps: [], resultText: 'No triangle: each side must be shorter than the sum of the other two.', invalid: 'triangle-inequality' };
      }
      // The circumcentre O sits at distance R from EVERY vertex — for a thin/obtuse
      // triangle R grows large and O lands well outside the triangle itself, so bounding
      // the triangle's own perimeter (as every other topic's SSS placement does) is not
      // enough here: R must be bounded too. R scales linearly with the given sides exactly
      // like the sides themselves (Heron's Area scales as k², so R=(abc)/(4*Area) scales
      // as k), so computing it once from the RAW a/b/c values gives a correctly-scaling cap.
      const s = (a + b + c) / 2;
      const areaRaw = Math.sqrt(Math.max(s * (s - a) * (s - b) * (s - c), 1e-9));
      const Rraw = (a * b * c) / (4 * areaRaw);
      const scale = Math.min(0.75, 100 / (a + b + c), 25 / Rraw);
      const Y0 = 76;
      const A0 = { x: 100 - (c * scale) / 2, y: Y0 };
      const B0 = { x: 100 + (c * scale) / 2, y: Y0 };
      const rb = b * scale;
      const ra = a * scale;
      const cands = sortByY(circleIntersect(A0, rb, B0, ra));
      if (!cands) return { steps: [], resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      const C0 = cands[0];
      const steps = [
        L(A0, B0, 'given'), L(B0, C0, 'given'), L(C0, A0, 'given'),
        P(A0, 'given', 'A'), P(B0, 'given', 'B'), P(C0, 'given', 'C'),
        dim(A0, B0, `${c} mm`, 'given', 16),
        dim(B0, C0, `${a} mm`, 'given', outwardOffset(B0, C0, A0, 14)),
        dim(C0, A0, `${b} mm`, 'given', outwardOffset(C0, A0, B0, 14)),
      ];
      const bis1 = perpendicularBisector(A0, B0, { extendFactor: 0.62, labels: ['p', 'q'] });
      const bis2 = perpendicularBisector(B0, C0, { extendFactor: 0.62, labels: ["p'", "q'"] });
      if (!bis1 || !bis2) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      steps.push(...bis1.steps, ...bis2.steps);
      const O = lineIntersect(bis1.upper, bis1.lower, bis2.upper, bis2.lower);
      if (!O) return { steps, resultText: 'Adjust the sides to construct.', invalid: 'degenerate' };
      const dir1 = angleOf(bis1.upper, bis1.lower);
      const ext1 = Math.max(dist(O, bis1.upper), dist(O, bis1.lower)) + 8;
      const dir2 = angleOf(bis2.upper, bis2.lower);
      const ext2 = Math.max(dist(O, bis2.upper), dist(O, bis2.lower)) + 8;
      steps.push(
        L(pointAt(O, ext1, dir1), pointAt(O, ext1, dir1 + Math.PI), 'move'),
        L(pointAt(O, ext2, dir2), pointAt(O, ext2, dir2 + Math.PI), 'move'),
        P(O, 'move', 'O'),
      );
      const R = dist(O, A0);
      steps.push(circleStep(O, R, 'result'));
      steps.push(dim(O, A0, `${R.toFixed(1)} mm`, 'result', 12));
      return { steps, resultText: `Circumradius R = ${R.toFixed(1)} mm, centred at O, passing through A, B, and C` };
    },
  },

  // -- Pair B: circle -> polygon --------------------------------------------------------
  {
    id: 'superscribe-polygon',
    label: 'Superscribe a Regular Polygon about a Circle',
    shortLabel: 'Superscribe Polygon',
    nChoices: SUPERSCRIBE_N_CHOICES,
    defaultNId: '8',
    principle(nId) {
      const n = Number(nId ?? 8);
      const hexFamily = n === 6 || n === 12;
      const base = hexFamily
        ? "Stepping the circle's own radius around it six times lands exactly back where it started (radius = chord at 60°, since that radius and chord form an equilateral triangle) — six equally-spaced points, no protractor at all."
        : 'Two perpendicular diameters split the circle into four 90° sectors exactly — no protractor needed, just two crossed lines.';
      const bisected = n === 8 ? ' Bisecting each 90° sector doubles it to 8.' : n === 12 ? ' Bisecting each 60° sector doubles it to 12.' : '';
      return `${base}${bisected} A tangent line, perpendicular to the radius, drawn at each point, encloses the circle with straight sides that touch it there and nowhere else — this technique is EXACT for every n offered here, unlike its mirror construction's general method.`;
    },
    given: [{ key: 'diameter', label: 'Circle diameter', unit: 'mm', min: 50, max: 100, step: 2, default: 70 }],
    build({ diameter, n: nId }) {
      const nSpec = SUPERSCRIBE_N_CHOICES.find((c) => c.id === String(nId)) ?? SUPERSCRIBE_N_CHOICES[2];
      const n = nSpec.n;
      const r = diameter / 2;
      const scale = Math.min(1, 42 / r);
      const R = r * scale;
      const O = { x: 100, y: 72 };
      const steps = [
        circleStep(O, R, 'given'), P(O, 'given', 'O'),
        dim(O, { x: O.x + R, y: O.y }, `⌀${diameter} mm`, 'given', -13),
      ];

      let basePts;
      if (n === 4 || n === 8) {
        const p0 = pointAt(O, R, 0);
        const p90 = pointAt(O, R, Math.PI / 2);
        const p180 = pointAt(O, R, Math.PI);
        const p270 = pointAt(O, R, -Math.PI / 2);
        steps.push(L(p0, p180, 'move'), L(p90, p270, 'move'));
        basePts = [p0, p90, p180, p270];
      } else {
        basePts = [];
        for (let k = 0; k < 6; k++) basePts.push(pointAt(O, R, (k * Math.PI) / 3));
        steps.push(P(basePts[0], 'move', '1'));
        for (let k = 1; k < 6; k++) {
          steps.push(arcMark(basePts[k - 1], R, basePts[k], 45), P(basePts[k], 'move', String(k + 1)));
        }
      }

      let circlePts = basePts;
      if (n === 8 || n === 12) {
        const full = n === 8 ? Math.PI / 2 : Math.PI / 3;
        const bis = angleBisectorAt(O, basePts[0], basePts[1], Math.min(R * 0.7, 26), ['m', 'k', 'j']);
        if (!bis) return { steps, resultText: 'Adjust the diameter to construct.', invalid: 'degenerate' };
        steps.push(...bis.steps);
        const bisAngle0 = angleOf(O, bis.E);
        const firstBisected = pointAt(O, R, bisAngle0);
        steps.push(P(firstBisected, 'move', 'x1'));
        const chordHalf = dist(basePts[0], firstBisected);
        const bisectedPts = [firstBisected];
        for (let k = 1; k < basePts.length; k++) {
          const nextPt = pointAt(O, R, bisAngle0 + k * full);
          steps.push(arcMark(bisectedPts[k - 1], chordHalf, nextPt, 45), P(nextPt, 'move', `x${k + 1}`));
          bisectedPts.push(nextPt);
        }
        circlePts = [];
        for (let k = 0; k < basePts.length; k++) circlePts.push(basePts[k], bisectedPts[k]);
      }

      const tangentLen = R * 0.95;
      const first = tangentAtPoint(circlePts[0], O, tangentLen, ['g', 'h']);
      if (!first) return { steps, resultText: 'Adjust the diameter to construct.', invalid: 'degenerate' };
      steps.push(...first.steps, L(first.a, first.b, 'move'));
      const tangentLines = [{ a: first.a, b: first.b }];
      for (let k = 1; k < circlePts.length; k++) {
        const T = circlePts[k];
        const perp = angleOf(O, T) + Math.PI / 2;
        const a = pointAt(T, tangentLen / 2, perp);
        const b = pointAt(T, tangentLen / 2, perp + Math.PI);
        tangentLines.push({ a, b });
        steps.push(L(a, b, 'move'));
      }

      const vertices = [];
      for (let k = 0; k < tangentLines.length; k++) {
        const t1 = tangentLines[k];
        const t2 = tangentLines[(k + 1) % tangentLines.length];
        const v = lineIntersect(t1.a, t1.b, t2.a, t2.b);
        if (!v) return { steps, resultText: 'Adjust the diameter to construct.', invalid: 'degenerate' };
        vertices.push(v);
      }
      for (let k = 0; k < vertices.length; k++) {
        steps.push(L(vertices[k], vertices[(k + 1) % vertices.length], 'result'));
      }
      vertices.forEach((v, k) => steps.push(P(v, 'result', String.fromCharCode(65 + k))));
      const side = dist(vertices[0], vertices[1]);
      steps.push(dim(vertices[0], vertices[1], `${side.toFixed(1)} mm`, 'result', outwardOffset(vertices[0], vertices[1], O, 12)));
      const interior = ((n - 2) * 180) / n;
      steps.push(angleDim(vertices[1], vertices[0], vertices[2], `${interior.toFixed(1)}°`, 'result', 10));
      return { steps, resultText: `Regular ${n}-gon superscribed about the circle, side ${side.toFixed(1)} mm, interior angle ${interior.toFixed(1)}°` };
    },
  },

  {
    id: 'inscribe-polygon',
    label: 'Inscribe a Regular Polygon in a Circle',
    shortLabel: 'Inscribe Polygon',
    principle() {
      return "Dividing the diameter into n equal parts, then swinging two arcs of the diameter's own length from its ends to fix an apex P above and P' below, gives two fixed reference points: a ray from either apex through a division point, extended to the circle, lands close to a true vertex position. This general method works for ANY n — even n where the polygon (a heptagon, for instance) is not buildable with a compass alone — but it is only mathematically EXACT for n = 3, 4, and 6; for every other n it is a close practical approximation (within a fraction of a degree here), which is exactly why textbooks call this the general method rather than an exact one — the mirror of its partner construction, which IS exact for every n it offers, at the cost of only offering a few.";
    },
    given: [
      { key: 'diameter', label: 'Circle diameter', unit: 'mm', min: 50, max: 100, step: 2, default: 70 },
      { key: 'n', label: 'Number of sides (n)', unit: '', min: 5, max: 9, step: 1, default: 5 },
    ],
    build({ diameter, n }) {
      const nn = Math.round(n);
      const r = diameter / 2;
      // Both apex points sit at h = R*sqrt(3) ABOVE and BELOW centre O (the two arcs, each
      // of radius = the diameter itself, meet an equilateral-triangle apex away — a much
      // longer reach than R alone) — cap against that reach, not the circle's own radius.
      const scale = Math.min(1, 30 / r);
      const R = r * scale;
      const O = { x: 100, y: 70 };
      const A = { x: O.x - R, y: O.y };
      const B = { x: O.x + R, y: O.y };
      const steps = [
        circleStep(O, R, 'given'), P(O, 'given', 'O'),
        dim(O, { x: O.x + R, y: O.y }, `⌀${diameter} mm`, 'given', -13),
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
      ];
      const div = divideSegment(A, B, nn);
      steps.push(...div.steps);

      const AB = dist(A, B);
      const h = Math.sqrt(Math.max(AB * AB - (AB / 2) * (AB / 2), 0));
      const apexAbove = { x: O.x, y: O.y - h };
      const apexBelow = { x: O.x, y: O.y + h };
      steps.push(
        arcMark(A, AB, apexAbove, 40), arcMark(B, AB, apexAbove, 40), P(apexAbove, 'move', 'P'),
        arcMark(A, AB, apexBelow, 40), arcMark(B, AB, apexBelow, 40), P(apexBelow, 'move', "P'"),
      );

      const foundVerts = [];
      for (let i = 2; i < nn; i += 2) {
        const dpt = div.divisions[i - 1];
        const vBelow = rayCircleFar(apexAbove, dpt, O, R);
        const vAbove = rayCircleFar(apexBelow, dpt, O, R);
        if (vBelow) { steps.push(L(apexAbove, vBelow, 'move')); foundVerts.push(vBelow); }
        if (vAbove) { steps.push(L(apexBelow, vAbove, 'move')); foundVerts.push(vAbove); }
      }
      if (foundVerts.length < nn - 1 - (nn % 2 === 0 ? 1 : 0)) {
        return { steps, resultText: 'Adjust the diameter to construct.', invalid: 'degenerate' };
      }

      const allVerts = [A, ...foundVerts];
      if (nn % 2 === 0) allVerts.push(B);
      const withAngle = allVerts.map((v) => ({ v, ang: (Math.atan2(v.y - O.y, v.x - O.x) + 2 * Math.PI) % (2 * Math.PI) }));
      withAngle.sort((p, q) => p.ang - q.ang);
      const ordered = withAngle.map((w) => w.v);

      for (let k = 0; k < ordered.length; k++) {
        steps.push(L(ordered[k], ordered[(k + 1) % ordered.length], 'result'));
      }
      let letterCode = 67; // 'C' — A and B already labelled via their 'given' points
      for (const v of ordered) {
        if (v === A || (nn % 2 === 0 && v === B)) continue;
        steps.push(P(v, 'result', String.fromCharCode(letterCode)));
        letterCode++;
      }
      const side = dist(ordered[0], ordered[1]);
      steps.push(dim(ordered[0], ordered[1], `${side.toFixed(1)} mm`, 'result', outwardOffset(ordered[0], ordered[1], O, 12)));
      const interior = ((nn - 2) * 180) / nn;
      steps.push(angleDim(ordered[1], ordered[0], ordered[2], `${interior.toFixed(1)}°`, 'result', 10));
      const exact = nn === 3 || nn === 4 || nn === 6;
      return {
        steps,
        resultText: `Regular ${nn}-gon inscribed, side ≈ ${side.toFixed(1)} mm, interior angle ≈ ${interior.toFixed(1)}°${exact ? ' (exact)' : ' (general method — a close approximation)'}`,
      };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
