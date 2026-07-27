// Pure geometry for the four tangent-arc constructions. NO DOM here — every function
// returns plain data (points, line segments, arc/circle definitions). renderConstruction.js
// is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 200x140 drawing area (SVG viewBox units), origin top-left, y
// increases downward — same convention as Topic 1.1 (graphics_diploma_module_1_topic_1_1_
// basic_constructions/src/constructions.js), which this file's primitives/step-builders are
// copied from verbatim where the geometry is generic (dist/midpoint/angleOf/pointAt/
// pointAlong/circleIntersect/lineIntersect/sortByY/P/L/arcMark/dim/outwardOffset). New
// primitives this topic needs and Topic 1.1 didn't (line-circle work, not just
// line-line/circle-circle): footOfPerpendicular, offsetLineToward, lineCircleIntersect,
// givenCircle, resultArc, normalizeSpan. givenArc/moveArc (Topic 1.1's own two arc-role
// builders) have no use here — every given element in this topic is a line/circle/point,
// and every compass-mark arc reuses arcMark aimed at the real crossing point.
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass arc/circle or straightedge guide drawn WHILE building (never the answer)
//   'result' — the arc/point the construction was built to produce, INCLUDING the points of
//              tangency — a point of tangency is what the construction proves, not a
//              secondary detail, so it earns the same 'result' token as the arc itself
//              (RULES.md §4.16 — no new colour token invented for it).
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

/** Closest point on the infinite line through (a,b) to point p. */
function footOfPerpendicular(p, a, b) {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (len2 < 1e-9) return a;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
  return pointAlong(a, b, t);
}

/** A line parallel to (a,b), shifted perpendicular by `mag`, on whichever side moves toward
 *  `target` — the standard "offset this given line inward by the arc's radius" step every
 *  tangent-arc construction opens with. */
function offsetLineToward(a, b, target, mag) {
  const px = -(b.y - a.y);
  const py = b.x - a.x;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dot = px * (target.x - mx) + py * (target.y - my);
  const len = Math.hypot(px, py) || 1;
  const sign = dot > 0 ? 1 : -1;
  const ox = (px / len) * mag * sign;
  const oy = (py / len) * mag * sign;
  return { a: { x: a.x + ox, y: a.y + oy }, b: { x: b.x + ox, y: b.y + oy } };
}

/** Both intersections of infinite line (p1,p2) with a circle, or null if it misses. */
function lineCircleIntersect(p1, p2, center, r) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - center.x;
  const fy = p1.y - center.y;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  return [pointAlong(p1, p2, (-b - sq) / (2 * a)), pointAlong(p1, p2, (-b + sq) / (2 * a))];
}

/** Shrink the (startAngle,endAngle) span to whichever coterminal representation is <= 180°
 *  — every tangent arc this topic draws is the minor arc between its two tangency points. */
function normalizeSpan(startAngle, endAngle) {
  let diff = endAngle - startAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return { startAngle, endAngle: startAngle + diff };
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
/** The finished tangent arc — role 'result'. Always built through normalizeSpan so it draws
 *  as the minor arc between its two tangency points. */
const resultArc = (center, radius, startAngle, endAngle) => {
  const n = normalizeSpan(startAngle, endAngle);
  return { kind: 'arc', role: 'result', center, radius, startAngle: n.startAngle, endAngle: n.endAngle };
};
/** A full given circle (the "circle" every line+circle / circle+circle construction starts
 *  from) — always role 'given', drawn as a native SVG <circle> (renderConstruction.js), never
 *  animated as a compass sweep since it only ever appears pre-stated, not constructed. */
const givenCircle = (center, radius) => ({ kind: 'circle', role: 'given', center, radius });
/** A dimension mark: extension lines + an arrowed offset line + a value, spanning a→b. */
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });

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
// The four constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} principle
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number|string>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'tangent-two-lines',
    label: 'Tangent Arc to Two Straight Lines',
    shortLabel: 'Tangent (2 Lines)',
    principle: "Offsetting both given lines inward by the arc's radius shifts each one by the same distance, so where the two offsets cross is equidistant R from both original lines — that crossing point is the only place a radius-R arc can touch both.",
    given: [
      { key: 'radius', label: 'Arc radius', unit: 'mm', min: 12, max: 32, step: 1, default: 20 },
      { key: 'angle', label: 'Angle between lines', unit: '°', min: 40, max: 140, step: 5, default: 90 },
    ],
    build({ radius, angle }) {
      const V = { x: 60, y: 110 };
      // The tangent length (V to each tangency point) is R/tan(angle/2) — size the drawn
      // rays to that plus a margin so the tangency points always land inside the segment,
      // never past its drawn end (the transfer-angle/bisect-angle off-canvas bug from
      // Topic 1.1's own feedback round taught this: size to the geometry, don't guess a
      // fixed length).
      const tangentLen = radius / Math.tan(deg2rad(angle / 2));
      const rayLen = Math.min(Math.max(tangentLen + 15, 40), 100);
      const A = pointAt(V, rayLen, 0);
      const B = pointAt(V, rayLen, deg2rad(-angle));
      const bisectorRef = pointAt(V, rayLen, deg2rad(-angle / 2));
      const steps = [
        L(V, A, 'given'), L(V, B, 'given'), P(V, 'given', 'V'), P(A, 'given', 'A'), P(B, 'given', 'B'),
      ];
      const off1 = offsetLineToward(V, A, bisectorRef, radius);
      const off2 = offsetLineToward(V, B, bisectorRef, radius);
      steps.push(
        L(off1.a, off1.b, 'move'), L(off2.a, off2.b, 'move'),
        // How far each parallel guide line sits from the given line it was offset from —
        // otherwise the offset distance (= radius) is invisible until the result dim later.
        dim(A, off1.b, `${radius} mm`, 'move', 12), dim(B, off2.b, `${radius} mm`, 'move', 12),
      );
      const O = lineIntersect(off1.a, off1.b, off2.a, off2.b);
      if (!O) return { steps, resultText: 'Widen the angle to construct.', invalid: 'degenerate' };
      const T1 = footOfPerpendicular(O, V, A);
      const T2 = footOfPerpendicular(O, V, B);
      steps.push(P(O, 'move', 'O'), L(O, T1, 'move'), L(O, T2, 'move'));
      steps.push(resultArc(O, radius, angleOf(O, T1), angleOf(O, T2)));
      steps.push(
        P(T1, 'result', 'T1'), P(T2, 'result', 'T2'),
        dim(O, T1, `${radius} mm`, 'result', 13),
      );
      return { steps, resultText: `Arc radius = ${radius} mm, tangent to both lines at T1 and T2` };
    },
  },

  {
    id: 'tangent-line-circle-ext',
    label: 'Tangent Arc to a Line and a Circle — External',
    shortLabel: 'Tangent (Line+Circle, Ext)',
    principle: "The arc's centre must sit exactly `radius` from the line and `circleRadius + radius` from the circle's centre — the circles bulge apart at the point of tangency, so the distance between centres is the SUM of the two radii.",
    given: [
      { key: 'radius', label: 'Arc radius', unit: 'mm', min: 12, max: 28, step: 1, default: 18 },
      { key: 'circleRadius', label: "Circle's radius", unit: 'mm', min: 22, max: 45, step: 1, default: 30 },
      { key: 'distance', label: "Distance to circle's centre", unit: 'mm', min: 40, max: 70, step: 1, default: 48 },
    ],
    build({ radius, circleRadius, distance }) {
      const Y0 = 125;
      const cx = 100;
      const A = { x: cx - 55, y: Y0 };
      const B = { x: cx + 55, y: Y0 };
      const C = { x: cx, y: Y0 - distance };
      const foot = { x: C.x, y: Y0 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        givenCircle(C, circleRadius), P(C, 'given', 'C'),
        dim(C, { x: C.x + circleRadius, y: C.y }, `${circleRadius} mm`, 'given', -13),
        dim(C, foot, `${distance} mm`, 'given', 16),
      ];
      const offLine = offsetLineToward(A, B, C, radius);
      steps.push(
        L(offLine.a, offLine.b, 'move'),
        dim(A, offLine.a, `${radius} mm`, 'move', 12),
      );
      const lociR = circleRadius + radius;
      const cands = lineCircleIntersect(offLine.a, offLine.b, C, lociR);
      if (!cands) return { steps, resultText: 'Move the circle closer to the line to construct.', invalid: 'degenerate' };
      const O = dist(cands[0], foot) <= dist(cands[1], foot) ? cands[0] : cands[1];
      steps.push(arcMark(C, lociR, O, 50));
      const T1 = footOfPerpendicular(O, A, B);
      const T2 = pointAt(C, circleRadius, angleOf(C, O));
      steps.push(P(O, 'move', 'O'), L(O, T1, 'move'), L(O, C, 'move'));
      steps.push(resultArc(O, radius, angleOf(O, T1), angleOf(O, T2)));
      steps.push(
        P(T1, 'result', 'T1'), P(T2, 'result', 'T2'),
        dim(O, T1, `${radius} mm`, 'result', 13),
      );
      return { steps, resultText: `Arc radius = ${radius} mm, tangent to the line at T1 and externally to the circle at T2` };
    },
  },

  {
    id: 'tangent-line-circle-int',
    label: 'Tangent Arc to a Line and a Circle — Internal',
    shortLabel: 'Tangent (Line+Circle, Int)',
    principle: "Internal tangency nests the arc against the circle's own curve instead of bulging away from it — the centre distance is the DIFFERENCE of the two radii (|circleRadius − radius|), not the sum, which is exactly the reversal that makes this case the one students mix up.",
    given: [
      { key: 'radius', label: 'Arc radius', unit: 'mm', min: 12, max: 28, step: 1, default: 18 },
      { key: 'circleRadius', label: "Circle's radius", unit: 'mm', min: 40, max: 52, step: 1, default: 44 },
      { key: 'distance', label: "Distance to circle's centre", unit: 'mm', min: 28, max: 40, step: 1, default: 31 },
    ],
    build({ radius, circleRadius, distance }) {
      const Y0 = 104;
      const cx = 100;
      const A = { x: cx - 55, y: Y0 };
      const B = { x: cx + 55, y: Y0 };
      const C = { x: cx, y: Y0 - distance };
      const foot = { x: C.x, y: Y0 };
      const steps = [
        L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        givenCircle(C, circleRadius), P(C, 'given', 'C'),
        dim(C, { x: C.x + circleRadius, y: C.y }, `${circleRadius} mm`, 'given', -13),
        dim(C, foot, `${distance} mm`, 'given', 16),
      ];
      if (Math.abs(circleRadius - radius) < 1e-6) {
        return { steps, resultText: 'Change the arc radius so it differs from the circle radius.', invalid: 'degenerate' };
      }
      const offLine = offsetLineToward(A, B, C, radius);
      steps.push(
        L(offLine.a, offLine.b, 'move'),
        dim(A, offLine.a, `${radius} mm`, 'move', 12),
      );
      const lociR = Math.abs(circleRadius - radius);
      const cands = lineCircleIntersect(offLine.a, offLine.b, C, lociR);
      if (!cands) return { steps, resultText: 'Adjust the values to construct.', invalid: 'degenerate' };
      const O = dist(cands[0], foot) <= dist(cands[1], foot) ? cands[0] : cands[1];
      steps.push(arcMark(C, lociR, O, 50));
      const T1 = footOfPerpendicular(O, A, B);
      const T2 = pointAt(C, circleRadius, angleOf(C, O));
      steps.push(P(O, 'move', 'O'), L(O, T1, 'move'), L(O, C, 'move'));
      steps.push(resultArc(O, radius, angleOf(O, T1), angleOf(O, T2)));
      steps.push(
        P(T1, 'result', 'T1'), P(T2, 'result', 'T2'),
        dim(O, T1, `${radius} mm`, 'result', 13),
      );
      return { steps, resultText: `Arc radius = ${radius} mm, tangent to the line at T1 and internally to the circle at T2` };
    },
  },

  {
    id: 'tangent-two-circles',
    label: 'Tangent Arc Between Two Circles',
    shortLabel: 'Tangent (2 Circles)',
    principle: "Externally, the arc's centre sits `radius + each circle's radius` from each centre (the circles bulge apart). Toggle to internal and the same arc instead WRAPS AROUND both circles, so the distances flip to `radius − each circle's radius` — same two circles, same arc radius, the sign is the only thing that changes.",
    given: [
      { key: 'radius', label: 'Arc radius', unit: 'mm', min: 40, max: 90, step: 1, default: 70 },
      { key: 'r1', label: 'Circle 1 radius', unit: 'mm', min: 15, max: 36, step: 1, default: 20 },
      { key: 'r2', label: 'Circle 2 radius', unit: 'mm', min: 12, max: 32, step: 1, default: 18 },
      { key: 'distance', label: 'Distance between centres', unit: 'mm', min: 30, max: 110, step: 1, default: 45 },
    ],
    build({ radius, r1, r2, distance, mode }) {
      const internal = mode === 'internal';
      // Scale the whole drawing down to fit the fixed 200x140 canvas (same technique as
      // Topic 1.1's triangle-three-sides) — tangency is scale-invariant, so this only
      // affects pixel placement; every dim/resultText label still shows the real mm value.
      const scale = Math.min(0.85, 120 / (distance + 2 * Math.max(radius, r1, r2)));
      const R = radius * scale;
      const R1 = r1 * scale;
      const R2 = r2 * scale;
      const D = distance * scale;
      const C1 = { x: 60, y: 85 };
      const C2 = { x: 60 + D, y: 85 };
      const steps = [
        givenCircle(C1, R1), P(C1, 'given', 'C1'),
        givenCircle(C2, R2), P(C2, 'given', 'C2'),
        dim(C1, C2, `${distance} mm`, 'given', 18),
        dim(C1, { x: C1.x, y: C1.y - R1 }, `${r1} mm`, 'given', -13),
        dim(C2, { x: C2.x, y: C2.y - R2 }, `${r2} mm`, 'given', -13),
      ];
      if (internal && (radius <= r1 || radius <= r2)) {
        return { steps, resultText: 'The arc must be larger than both circles to wrap around them — increase the arc radius.', invalid: 'degenerate' };
      }
      const lociR1 = internal ? Math.abs(R - R1) : R1 + R;
      const lociR2 = internal ? Math.abs(R - R2) : R2 + R;
      const cands = sortByY(circleIntersect(C1, lociR1, C2, lociR2));
      if (!cands) {
        return {
          steps,
          resultText: internal
            ? 'This arc cannot wrap around circles this far apart — increase the radius or move the circles closer.'
            : 'Adjust the values to construct.',
          invalid: 'degenerate',
        };
      }
      const O = cands[0];
      steps.push(arcMark(C1, lociR1, O, 50), arcMark(C2, lociR2, O, 50));
      const T1 = pointAt(C1, R1, internal ? angleOf(O, C1) : angleOf(C1, O));
      const T2 = pointAt(C2, R2, internal ? angleOf(O, C2) : angleOf(C2, O));
      steps.push(P(O, 'move', 'O'), L(O, C1, 'move'), L(O, C2, 'move'));
      steps.push(resultArc(O, R, angleOf(O, T1), angleOf(O, T2)));
      steps.push(
        P(T1, 'result', 'T1'), P(T2, 'result', 'T2'),
        dim(O, T1, `${radius} mm`, 'result', 13),
      );
      return {
        steps,
        resultText: `Arc radius = ${radius} mm, tangent ${internal ? 'internally (enclosing both circles)' : 'externally'} at T1 and T2`,
      };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
