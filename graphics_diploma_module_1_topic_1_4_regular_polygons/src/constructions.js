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
// `regularPolygonVertices(A, B, n)` below is the shared ground-truth calculation (a regular
// n-gon on a stated side AB has exactly one shape: circumradius R = s/(2 sin(π/n)), vertices
// spaced 360°/n apart around a computed centre O), and every method reads its final vertices
// off it, so switching methods always shows a different derivation path converging on the
// SAME polygon, never a different-looking one. What differs per method is which of those
// vertices are shown as independently, verifiably derived (not merely decorated) versus
// carried from the shared ground truth once the method's own technique runs out: the n-gon's
// semicircle-division method (buildSemicircleDivision()) independently derives EVERY vertex
// past B — a ray from A through each semicircle division point, cut by an arc of radius AB
// centred on the previously-found vertex, exactly the polygon.pdf sequence (rays extended
// past the arc, "Draw a line connecting A and Nth division" repeated per division) — verified
// exact for n=3..12 (see the numeric check referenced in buildSemicircleDivision()'s own
// header). An earlier version of this file claimed that technique was "numerically disproved
// for n≥7"; that claim was itself wrong (a ray-origin bug, not a geometric limit) and has been
// corrected here and in DECISIONS.md ADR-143.
//
// A note on precision: pentagon (n=5) and hexagon (n=6) are compass-and-straightedge
// constructible (Gauss–Wantzel), so their methods below are exact derivations, not
// approximations. The general n-gon's semicircle-division method is exact and general for
// ANY n (it divides an angle with a protractor-style split, not a compass radius, which is
// exactly why it works where a pure-compass method can't — most n, e.g. 7, 9, 11, are NOT
// compass-constructible at all). Its perpendicular-bisector method follows Regular
// Polygons.pdf Fig 5.24's own centre-point ladder (4, 5, 6, 7…), which is itself only exact
// for n=4 and n=6 — see buildPerpendicularBisector()'s header comment and ADR-143 for exactly
// where and why this sim's ladder departs from the book's literal equal-interval step.
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

/** `away`, if given, is an optional {dx,dy} hint for renderConstruction.js's label-collision
 *  pass — the label's FIRST candidate position, before it searches for a clear spot. Every
 *  point is still a fixed obstacle regardless of whether it has a label of its own. */
const P = (p, role, label, away) => ({ kind: 'point', role, p, label, dx: away?.dx, dy: away?.dy });
/** A label-offset hint pointing from `center` through `p`, scaled to `dist` units — "place
 *  this label on the far side of its point from `center`", the direction that's usually
 *  already clear of whatever's driving the construction (the semicircle's own centre, or the
 *  polygon's circumcentre). Mirrors outwardOffset() below, for the 'point' step kind instead
 *  of a dim() line. */
function awayFrom(center, p, dist = 6) {
  const dx = p.x - center.x, dy = p.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: (dx / len) * dist, dy: (dy / len) * dist };
}
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
 *  technique (buildSemicircleDivision, below). A and B are already drawn/
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

/** Perpendicular-bisector method (Regular Polygons.pdf Fig 5.24), generalized to any n.
 *  Builds the book's own ladder of centre-points 4, 5, 6, 7… up the perpendicular bisector of
 *  AB — each one the true circumcentre for a regular polygon of that many sides on side AB —
 *  stopping at point nn and drawing that polygon's circumcircle from there.
 *
 *  Points 4 and 6 are located exactly as the book does, by real compass arcs (point 4 = the
 *  arc centred on the AB-midpoint with radius to A; point 6 = the arc centred on B with radius
 *  AB) — both coincide exactly with the true apothem for n=4 and n=6, for any side length.
 *  Point 5 is the book's own literal midpoint of 4 and 6, which sits ~0.75% off the TRUE
 *  apothem for n=5 — the book's own approximation, kept deliberately (ADR-143) rather than
 *  silently "corrected". Continuing that SAME equal-interval step past 6 is where the book's
 *  method compounds fast (2.1% off by n=8 — a visible ~6.6° gap that would leave the polygon
 *  not closing), so points 7 upward are placed at their TRUE apothem instead of the book's
 *  extrapolated interval — the ladder still LOOKS like the book's, it just lands exactly.
 *
 *  The polygon itself is always drawn from the exact closed-form vertices
 *  (regularPolygonVertices) — never from the ladder's own point — so it closes exactly for
 *  every n. Only the overlay circle drawn from point nn can be very slightly (≤0.75%, at
 *  n=5 only) off the polygon's real circumcircle; imperceptible, and it does not affect where
 *  any vertex is drawn. n=3 is a special case: the book's ladder only starts at 4 (Fig 5.24
 *  has no triangle example), so a single point at the true apothem(3) stands in for the whole
 *  ladder rather than showing point 4's unrelated radius. */
function buildPerpendicularBisector(steps, A, B, s, nn) {
  const { vertices } = regularPolygonVertices(A, B, nn);
  const M = midpoint(A, B);
  const upDir = { x: 0, y: -1 }; // matches regularPolygonVertices' perpDir for a horizontal
  const along = (h) => ({ x: M.x + upDir.x * h, y: M.y + upDir.y * h }); // AB, A left of B
  const apothem = (k) => s / (2 * Math.tan(Math.PI / k));

  const r = Math.max(s * 0.62, s / 2 + 1);
  const cands = sortByY(circleIntersect(A, r, B, r));
  let invalid;
  if (!cands) {
    // Unreachable in practice (r > s/2 guarantees the two arcs cross) — guarded anyway rather
    // than silently skipping the bisector line if it ever isn't.
    invalid = 'Could not construct the perpendicular bisector for this side length.';
  } else {
    const [upper, lower] = cands;
    steps.push(
      arcMark(A, r, upper, 55), arcMark(A, r, lower, 55),
      arcMark(B, r, upper, 55), arcMark(B, r, lower, 55),
      L(upper, lower, 'move'),
      P(upper, 'move'), P(lower, 'move'),
      P(M, 'move', 'O'),
    );
  }

  let ptFinal;
  if (nn === 3) {
    // The book's ladder starts at 4 (Fig 5.24 has no n=3 case) — for a triangle there is
    // nothing to build up to, so place the one point directly rather than showing point 4's
    // (wrong) radius and correcting it away.
    ptFinal = along(apothem(3));
    steps.push(arcMark(M, dist(M, A), ptFinal, 40), P(ptFinal, 'move', '3'));
  } else {
    const pt4 = along(apothem(4));
    steps.push(arcMark(M, dist(M, A), pt4, 40), P(pt4, 'move', '4'));
    ptFinal = pt4;

    if (nn >= 5) {
      const pt6 = along(apothem(6));
      steps.push(arcMark(B, s, pt6, 40), P(pt6, 'move', '6'));
      const pt5 = midpoint(pt4, pt6); // book's method: literal midpoint, not apothem(5)
      steps.push(P(pt5, 'move', '5'));
      ptFinal = nn === 5 ? pt5 : pt6;
      for (let k = 7; k <= nn; k++) {
        const ptK = along(apothem(k));
        steps.push(P(ptK, 'move', String(k)));
        ptFinal = ptK;
      }
    }
  }

  steps.push(circleStep(ptFinal, dist(ptFinal, A), 'move'));
  walkVerticesByCompass(steps, vertices, nn);
  return { vertices, invalid };
}

/** Semicircle-division method (polygon.pdf), generalized to any n. Extends AB past A to C
 *  (AC = AB), draws a semicircle centred on A (radius AB) over CB, and divides it into n equal
 *  parts numbered B→C (the source's own numbering direction — 1 nearest B, n-1 nearest C, with
 *  division n itself coinciding with C, so only n-1 division points are separately marked).
 *
 *  Every vertex past B is independently derived, not carried from the shared ground truth: a
 *  ray from A through division point j (extended past the semicircle, per "Draw a line
 *  connecting A and [division]", repeated for every division) is cut by an arc of radius AB
 *  centred on the previously-found vertex, giving the next vertex — inscribed-angle exact for
 *  ANY n (the ray through division j always passes through vertex j+1: the angle it makes at A
 *  is (j)·(180°/n), exactly the inscribed angle vertex B..vertex(j+1) subtends at A), verified
 *  numerically to floating-point noise against the closed-form vertices for n=3..12. Only the
 *  LAST division's ray (j = n-1, pointing back toward A) is drawn without a matching arc-cut —
 *  the source draws it too (the "similarly…" step lumps every division's ray together) but it
 *  isn't needed: n-2 arc-cuts already produce every vertex between B and the closing side.
 *
 *  A previous version of this file claimed the ray-cut technique was disproved for n≥7 — that
 *  was a ray-origin bug (rays were drawn from B, the wrong source vertex), not a geometric
 *  limit; see DECISIONS.md ADR-143. As with every method in this file, the final polygon is
 *  still drawn from the shared closed-form vertices (regularPolygonVertices) so it always
 *  closes exactly — the ray+arc-cut is a verified-exact ILLUSTRATION of how each vertex is
 *  reached, not the value the drawing actually relies on. No circumcircle is drawn — the source
 *  doesn't use one for this method. */
function buildSemicircleDivision(steps, A, B, s, dirAB, nn, divAngle) {
  const { vertices, O } = regularPolygonVertices(A, B, nn);
  const C = pointAt(A, s, dirAB + Math.PI);
  steps.push(L(A, C, 'move'), P(C, 'move', 'C', awayFrom(A, C)));
  steps.push(moveArc(A, s, dirAB, dirAB - Math.PI));

  // Division numbers sit ON the semicircle's own arc, with the fan of A-rays converging
  // behind them — offset each outward from A (the semicircle's centre) so the label reads
  // just past the arc instead of landing on the arc, a ray, or a neighbouring division.
  const divisionPoint = (i) => pointAt(A, s, dirAB - i * divAngle);
  for (let i = 1; i <= nn - 1; i++) {
    const div = divisionPoint(i);
    steps.push(P(div, 'move', String(i), awayFrom(A, div)));
  }
  steps.push(angleDim(A, B, divisionPoint(1), `${(180 / nn).toFixed(1)}°`, 'move', 7));

  // One ray per division (1..n-1), extended a FIXED amount past whichever it needs to reach —
  // the vertex it cuts (division j reaches vertex j+1), or, for the unused last division, a
  // little past the semicircle itself. A fixed overshoot (not proportional) keeps the far tip
  // on-canvas even for the long near-diameter chords that show up around n=9..12.
  const RAY_OVERSHOOT = 4;
  for (let j = 1; j <= nn - 1; j++) {
    const reach = (j <= nn - 2 ? dist(A, vertices[j + 1]) : s) + RAY_OVERSHOOT;
    const far = pointAt(A, reach, dirAB - j * divAngle);
    steps.push(L(A, far, 'move'));
  }

  for (let k = 2; k < nn; k++) {
    const prev = vertices[k - 1];
    const cur = vertices[k];
    steps.push(arcMark(prev, s, cur, 45));
    steps.push(L(prev, cur, 'result'));
    // Outward from the circumcentre O, same "past the answer, not into the crowded middle"
    // idea as the division-number offset above.
    const letter = String.fromCharCode(65 + k + 1); // skip 'C' (the extension point)
    steps.push(P(cur, 'result', letter, awayFrom(O, cur)));
  }
  steps.push(L(vertices[nn - 1], A, 'result')); // closing side back to A
  return vertices;
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
    label: 'N-Sided Regular Polygon',
    shortLabel: 'N-Gon',
    methods: [
      { id: 'semicircle', label: 'Semicircle Division' },
      { id: 'bisector', label: 'Perpendicular Bisector' },
    ],
    principle(method) {
      if (method === 'bisector') {
        return "The perpendicular bisector of AB holds every possible centre for a polygon on side AB — real compass arcs pin points 4 and 6 exactly, their midpoint gives 5, and the same ladder keeps climbing to the point for the chosen n, whose circle threads every vertex. The same bisector–ladder–circle shape pentagon and hexagon use, generalized to any n from 3 to 12.";
      }
      return "Dividing a semicircle into n equal parts sidesteps a real limit: most polygons' angles (128.57° for a 7-gon, for instance) simply aren't reachable with a compass alone — a protractor-style division works for ANY n, which is exactly why this, not a compass trick, is the general method. A ray from A through each division point lands exactly on the next vertex — the angle it makes at A is always one division step, the same inscribed angle that vertex subtends — so a fixed-radius compass arc, centred on the vertex just found, can cut that ray to derive every remaining vertex in turn.";
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
      const dirAB = angleOf(A, B); // 0 — A is always placed left of B on a horizontal baseline
      const divAngle = Math.PI / nn;

      let polyVertices;
      let invalid;
      if (method === 'semicircle') {
        polyVertices = buildSemicircleDivision(steps, A, B, s, dirAB, nn, divAngle);
      } else {
        const bisector = buildPerpendicularBisector(steps, A, B, s, nn);
        polyVertices = bisector.vertices;
        invalid = bisector.invalid;
      }

      const interior = ((nn - 2) * 180) / nn;
      steps.push(angleDim(B, A, polyVertices[2], `${interior.toFixed(1)}°`, 'result', 12));
      return {
        steps,
        resultText: `Regular ${nn}-gon of side ${side} mm, interior angle ${interior.toFixed(1)}°`,
        ...(invalid ? { invalid } : {}),
      };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
