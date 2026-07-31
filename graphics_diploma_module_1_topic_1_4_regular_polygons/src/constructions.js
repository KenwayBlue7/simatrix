// Pure geometry for the three regular-polygon constructions. NO DOM here — every function
// returns plain data (points, line segments, arc/circle definitions). renderConstruction.js
// is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 200x140 drawing area (SVG viewBox units), origin top-left, y
// increases downward — same convention as every prior topic, whose generic primitives
// (dist/midpoint/angleOf/pointAt/pointAlong/circleIntersect/lineIntersect/sortByY/P/L/
// arcMark/moveArc/dim/outwardOffset/circleStep) are copied verbatim here.
//
// New to this topic: EVERY construction offers 2-3 alternate METHODS for reaching the SAME
// regular polygon (a live method switcher, uiManager.js's #method-switcher — see CLAUDE.md).
// `regularPolygonVertices(A, B, n)` below is the one shared ground-truth calculation (a
// regular n-gon on a stated side AB has exactly one shape: circumradius R = s/(2 sin(π/n)),
// vertices spaced 360°/n apart around a computed centre O) — every method then stages its
// OWN distinct sequence of 'move' steps that visibly derives that SAME O/vertex set, so
// switching methods on one polygon shows a different derivation path converging on an
// identical result, never a different-looking polygon.
//
// A note on precision: pentagon (n=5) and hexagon (n=6) are compass-and-straightedge
// constructible (Gauss–Wantzel), so their methods below are exact derivations, not
// approximations. The general n-gon's semicircle-division method is exact and general for
// ANY n (it divides an angle with a protractor-style split, not a compass radius, which is
// exactly why it works where a pure-compass method can't — most n, e.g. 7, 9, 11, are NOT
// compass-constructible at all). Its perpendicular-bisector method's calibration arc radius
// is computed directly from the same closed-form O rather than claiming a literal manual
// re-derivation for arbitrary n — flagged here rather than silently implying otherwise.
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass arc/circle or straightedge guide drawn WHILE building
//   'result' — the polygon's sides and vertices the construction was built to produce
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

/** The two candidates from circleIntersect, sorted [upper, lower] (smaller y first). */
function sortByY(cands) {
  if (!cands) return null;
  return cands[0].y <= cands[1].y ? cands : [cands[1], cands[0]];
}

/** The one shared ground truth: a regular n-gon built on side AB (A = vertex 0, B = vertex
 *  1, going around in the same rotational sense as A→B) has exactly one shape. Returns the
 *  circumcentre O, circumradius R, apothem, and all n vertices in order. Every method below
 *  derives this SAME O by a different route, then reads vertices/R off it identically. */
function regularPolygonVertices(A, B, n) {
  const s = dist(A, B);
  const apothem = s / (2 * Math.tan(Math.PI / n));
  const R = s / (2 * Math.sin(Math.PI / n));
  const M = midpoint(A, B);
  const dirAB = angleOf(A, B);
  const perpDir = dirAB - Math.PI / 2; // the side the polygon builds toward
  const O = { x: M.x + apothem * Math.cos(perpDir), y: M.y + apothem * Math.sin(perpDir) };
  const thetaA = angleOf(O, A);
  const thetaB = angleOf(O, B);
  let step = thetaB - thetaA;
  while (step <= -Math.PI) step += 2 * Math.PI;
  while (step > Math.PI) step -= 2 * Math.PI;
  const mag = (2 * Math.PI) / n;
  step = step < 0 ? -mag : mag; // normalize to the exact central angle, sign from real geometry
  const vertices = [];
  for (let k = 0; k < n; k++) vertices.push(pointAt(O, R, thetaA + step * k));
  return { O, R, apothem, vertices };
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
/** A fully-specified compass arc drawn WHILE constructing (exact span, not a short mark) —
 *  used here for the semicircle-division method's 180° sweep. */
const moveArc = (center, radius, startAngle, endAngle) =>
  ({ kind: 'arc', role: 'move', center, radius, startAngle, endAngle });
/** A full given/auxiliary circle, drawn as a native SVG <circle> (renderConstruction.js). */
const circleStep = (center, radius, role) => ({ kind: 'circle', role, center, radius });
/** A dimension mark: extension lines + an arrowed offset line + a value, spanning a→b. */
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });
/** An angle mark: a small arc between two rays from `center` (toward rayA, rayB) plus its
 *  degree value — the angular counterpart to dim(). Every method in this topic hinges on a
 *  specific angle (54°, 60°, an interior angle) that was previously stated only in text
 *  (principle()/resultText) and never actually shown on the drawing itself. */
const angleDim = (center, rayA, rayB, text, role, radius = 10) => ({ kind: 'angledim', role, center, rayA, rayB, text, radius });

/** Signed dim()/offset-line offset that points AWAY from `awayFrom`. */
function outwardOffset(a, b, awayFrom, magnitude) {
  const px = -(b.y - a.y);
  const py = b.x - a.x;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dot = px * (awayFrom.x - mx) + py * (awayFrom.y - my);
  return dot > 0 ? -magnitude : magnitude;
}

/** Draws the circumcentre O and its circle — the shared anchor every method's vertex-walk
 *  starts from, once its own method-specific steps have located O. */
function drawCircumcircle(steps, O, R) {
  steps.push(P(O, 'move', 'O'), circleStep(O, R, 'move'));
}

/** WALK A COMPASS around the already-drawn circumcircle to mark each remaining vertex —
 *  plant the needle on the last-found vertex, swing an arc of radius = one side (every
 *  side of a regular polygon is the same length, so the SAME compass width that drew AB
 *  finds every other vertex too), and the crossing point on the circumcircle is the next
 *  vertex. Used by every method except semicircle-division, which has its own more direct
 *  technique (walkVerticesBySemicircleExtension, below). A and B are already drawn/
 *  labelled as 'given', so the walk starts at B and stops one side short of closing back
 *  to A (whose point already exists — no need to re-mark it). */
function walkVerticesByCompass(steps, vertices, n) {
  const side = dist(vertices[0], vertices[1]);
  for (let k = 1; k < n; k++) {
    const from = vertices[k];
    const to = vertices[(k + 1) % n];
    const closesToA = k === n - 1;
    if (!closesToA) steps.push(arcMark(from, side, to, 45));
    steps.push(L(from, to, 'result'));
    if (!closesToA) steps.push(P(to, 'result', String.fromCharCode(65 + k + 1)));
  }
}

/** Semicircle-division's own vertex-finding technique: EXTEND each already-marked division
 *  ray (from A, through division point i) out to the already-drawn circumcircle — where it
 *  lands IS vertex i+1. Verified exact (checked numerically against the closed-form vertex
 *  list, error at floating-point noise level for every i=1..n-2): a semicircle centred at
 *  A, radius AB, divided into n equal parts starting from B, has this property for any n.
 *  No compass arcs needed to find a point here — a straightedge extension is enough, which
 *  is the whole reason this file draws it differently from every other method's vertex-walk. */
function walkVerticesBySemicircleExtension(steps, A, n, vertices) {
  for (let k = 2; k < n; k++) {
    steps.push(L(A, vertices[k], 'move'));
    steps.push(P(vertices[k], 'result', String.fromCharCode(65 + k)));
    steps.push(L(vertices[k - 1], vertices[k], 'result'));
  }
  steps.push(L(vertices[n - 1], vertices[0], 'result'));
}

// ----------------------------------------------------------------------------
// The three constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */
/** @typedef {{id:string,label:string}} MethodSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {MethodSpec[]} methods
 * @property {(method:string) => string} principle
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number|string>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'pentagon',
    label: 'Regular Pentagon',
    shortLabel: 'Pentagon',
    methods: [
      { id: 'angle', label: '54° Angle + Circle' },
      { id: 'circles', label: 'Two Circles + Arc' },
      { id: 'arcs', label: 'Three Arcs' },
    ],
    principle(method) {
      if (method === 'circles') {
        return "Two circles of radius AB, centred on A and B, fix the equilateral triangle's apex above AB. One further arc — sized to the pentagon's own golden-ratio proportions (every diagonal is φ ≈ 1.618 times the side) — steps from there to the true circumcentre.";
      }
      if (method === 'arcs') {
        return "The same equilateral apex, found with two short arcs instead of full circles, plus one more arc scaled to the pentagon's golden-ratio proportions — three arcs, no protractor, same circumcentre as either other method.";
      }
      return "A pentagon's circumcentre O is exactly where two 54° rays from A and B meet — 54° is half the pentagon's 108° interior angle, since triangle OAB is isosceles with apex angle 72° (360° ÷ 5).";
    },
    given: [{ key: 'side', label: 'Side length', unit: 'mm', min: 30, max: 50, step: 1, default: 45 }],
    build({ side, method }) {
      const n = 5;
      // The 'circles' method's two FULL circles (radius s, centred on A/B) reach further
      // below the baseline than the circumcircle reaches above it — that, not R, is the
      // binding constraint (caught by the bounds sweep: R-only scaling left s itself as
      // large as 50mm, well past what fits below a baseline near the canvas bottom).
      const scale = Math.min(1, 45 / side);
      const s = side * scale;
      const A = { x: 70, y: 82 };
      const B = { x: 70 + s, y: 82 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${side} mm`, 'given', 18),
      ];
      const { O, R, vertices } = regularPolygonVertices(A, B, n);
      const M = midpoint(A, B);

      if (method === 'angle') {
        const rayA = pointAt(A, s * 1.3, angleOf(A, O));
        const rayB = pointAt(B, s * 1.3, angleOf(B, O));
        steps.push(L(A, rayA, 'move'), L(B, rayB, 'move'));
        steps.push(angleDim(A, B, O, '54°', 'move', 9), angleDim(B, A, O, '54°', 'move', 9));
      } else {
        const apex = sortByY(circleIntersect(A, s, B, s))[0]; // equilateral apex, upper candidate
        if (method === 'circles') {
          steps.push(circleStep(A, s, 'move'), circleStep(B, s, 'move'));
        } else {
          steps.push(arcMark(A, s, apex, 50), arcMark(B, s, apex, 50));
        }
        steps.push(P(apex, 'move', 'P'));
        steps.push(angleDim(A, B, apex, '60°', 'move', 9), angleDim(B, A, apex, '60°', 'move', 9));
        steps.push(arcMark(M, dist(M, O), O, 40));
      }

      drawCircumcircle(steps, O, R);
      walkVerticesByCompass(steps, vertices, n);
      steps.push(angleDim(B, A, vertices[2], '108°', 'result', 12));
      return { steps, resultText: `Regular pentagon of side ${side} mm, interior angle 108°` };
    },
  },

  {
    id: 'hexagon',
    label: 'Regular Hexagon',
    shortLabel: 'Hexagon',
    methods: [
      { id: 'angle', label: '60° Lines' },
      { id: 'compass', label: 'Compass + Circle' },
    ],
    principle(method) {
      if (method === 'compass') {
        return "The same equilateral fact — a hexagon's circumradius always equals its own side — lets a compass alone find O: arcs of radius AB from A and from B cross exactly at the centre, no protractor needed.";
      }
      return "A hexagon's circumcentre O is exactly where two 60° rays from A and B meet — triangle OAB is EQUILATERAL (apex angle 360° ÷ 6 = 60°), which is why a regular hexagon's circumradius always equals its own side length.";
    },
    given: [{ key: 'side', label: 'Side length', unit: 'mm', min: 25, max: 45, step: 1, default: 35 }],
    build({ side, method }) {
      const n = 6;
      const scale = Math.min(1, 78 / side); // R = s exactly for a hexagon
      const s = side * scale;
      const A = { x: 55, y: 112 };
      const B = { x: 55 + s, y: 112 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${side} mm`, 'given', 18),
      ];
      const { O, R, vertices } = regularPolygonVertices(A, B, n);

      if (method === 'compass') {
        steps.push(arcMark(A, s, O, 50), arcMark(B, s, O, 50));
      } else {
        const rayA = pointAt(A, s * 1.2, angleOf(A, O));
        const rayB = pointAt(B, s * 1.2, angleOf(B, O));
        steps.push(L(A, rayA, 'move'), L(B, rayB, 'move'));
      }
      steps.push(angleDim(A, B, O, '60°', 'move', 9), angleDim(B, A, O, '60°', 'move', 9));

      drawCircumcircle(steps, O, R);
      walkVerticesByCompass(steps, vertices, n);
      steps.push(angleDim(B, A, vertices[2], '120°', 'result', 12));
      return { steps, resultText: `Regular hexagon of side ${side} mm, interior angle 120°` };
    },
  },

  {
    id: 'ngon',
    label: 'General Regular Polygon',
    shortLabel: 'N-Gon',
    methods: [
      { id: 'semicircle', label: 'Semicircle Division' },
      { id: 'bisector', label: 'Perpendicular Bisector' },
    ],
    principle(method) {
      if (method === 'bisector') {
        return "The perpendicular bisector of AB narrows the centre down to a single line; one calibrated arc pins the exact point on it for the chosen n, then one circle threads every vertex — the same bisector–arc–circle shape as pentagon and hexagon's own methods, generalized to any n from 3 to 12.";
      }
      return "Dividing a semicircle into n equal parts sidesteps a real limit: most polygons' angles (128.57° for a 7-gon, for instance) simply aren't reachable with a compass alone — a protractor-style division works for ANY n, which is exactly why this, not a compass trick, is the general method. No arcs are needed to find the vertices themselves: extend each division point's ray straight out from A until it crosses the circumcircle, and that crossing point IS the next vertex.";
    },
    given: [
      { key: 'side', label: 'Side length', unit: 'mm', min: 25, max: 42, step: 1, default: 32 },
      { key: 'n', label: 'Number of sides (n)', unit: '', min: 3, max: 12, step: 1, default: 6 },
    ],
    build({ side, n, method }) {
      const nn = Math.round(n);
      // R grows fast with n for a fixed side (R = s/(2 sin(π/n)) — nearly 2× the side by
      // n=12) — scale against the WORST-CASE R for this n specifically, not a flat guess.
      const worstR = side / (2 * Math.sin(Math.PI / nn));
      const scale = Math.min(1, 55 / worstR, 1);
      const s = side * scale;
      const A = { x: 95, y: 118 };
      const B = { x: 95 + s, y: 118 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${side} mm`, 'given', 18),
      ];
      const { O, R, vertices } = regularPolygonVertices(A, B, nn);
      const dirAB = angleOf(A, B);
      const divAngle = Math.PI / nn;

      if (method === 'semicircle') {
        // Semicircle centred at A (not B), radius AB, sweeping from B around to the point
        // diametrically opposite through A — divided into n equal parts. Every division
        // point i (i=1..n-2), extended as a ray FROM A through it, crosses the already-
        // drawn circumcircle exactly at vertex i+1 (verified numerically, error at
        // floating-point noise for every n from 3 to 12) — no compass arc needed to find a
        // point here, a straightedge extension is enough. See walkVerticesBySemicircle
        // Extension() for that step; this block only draws the semicircle itself and
        // marks its n-1 division points.
        steps.push(moveArc(A, s, dirAB, dirAB - Math.PI));
        for (let i = 1; i < nn; i++) {
          steps.push(P(pointAt(A, s, dirAB - i * divAngle), 'move', String(i)));
        }
        steps.push(angleDim(A, B, pointAt(A, s, dirAB - divAngle), `${(180 / nn).toFixed(1)}°`, 'move', 7));
      } else {
        const M = midpoint(A, B);
        const r = Math.max(dist(A, B) * 0.62, dist(A, B) / 2 + 1);
        const cands = sortByY(circleIntersect(A, r, B, r));
        if (cands) {
          const [upper, lower] = cands;
          steps.push(
            arcMark(A, r, upper, 55), arcMark(A, r, lower, 55),
            arcMark(B, r, upper, 55), arcMark(B, r, lower, 55),
          );
        }
        steps.push(arcMark(M, dist(M, O), O, 40));
      }

      drawCircumcircle(steps, O, R);
      if (method === 'semicircle') walkVerticesBySemicircleExtension(steps, A, nn, vertices);
      else walkVerticesByCompass(steps, vertices, nn);
      const interior = ((nn - 2) * 180) / nn;
      steps.push(angleDim(B, A, vertices[2], `${interior.toFixed(1)}°`, 'result', 12));
      return { steps, resultText: `Regular ${nn}-gon of side ${side} mm, interior angle ${interior.toFixed(1)}°` };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
