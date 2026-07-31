// Pure geometry for the three tangent-line constructions. NO DOM here — every function
// returns plain data (points, line segments, circle definitions). renderConstruction.js
// is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 200x140 drawing area (SVG viewBox units), origin top-left, y
// increases downward — same convention as Topic 1.1 (graphics_diploma_module_1_topic_1_1_
// basic_constructions/src/constructions.js) and Topic 1.2 (…topic_1_2_tangent_arcs/src/
// constructions.js), which this file's generic primitives/step-builders are copied from
// verbatim (dist/midpoint/angleOf/pointAt/circleIntersect/P/L/dim/outwardOffset/givenCircle,
// the last renamed circleStep here since 'given' and 'move' circles both need it). New
// primitive this topic needs and neither prior topic did: tangentPointsFromExternalPoint —
// the Thales/semicircle construction (draw a circle on diameter [point, centre]; where it
// crosses the given circle are the two tangent points), a thin wrapper around the existing
// circleIntersect primitive, not a new geometric idea.
//
// Unlike Topic 1.2 (which drew tangent ARCS, one construction per case with a live
// internal/external toggle on the two-circle case), this topic draws tangent LINES and
// keeps external/internal common tangents as two separate picker items — each earns its
// own principle text carrying the sum-vs-difference contrast, rather than a shared toggle
// control (there is no single "same two circles, flip the mode" scenario here the way
// Topic 1.2's tangent arc had; the two tangent-line families are genuinely different
// constructions sharing only the auxiliary-circle technique).
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass/auxiliary-circle or straightedge guide drawn WHILE building
//   'result' — the tangent line(s) the construction was built to produce, INCLUDING the
//              points of tangency (RULES.md §4.16 — no new colour token invented for them)
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

/** Unit vector from a toward b. */
function unitVec(a, b) {
  const d = dist(a, b) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
}

/** The Thales/semicircle construction: both tangent points from external point P to a
 *  circle (center, r). A circle drawn on diameter [P, center] crosses the given circle at
 *  exactly the two tangent points (the angle in a semicircle is 90°, so each crossing point
 *  sees P-center as a right angle — the defining property of a tangent). Returns null if P
 *  is inside or on the circle (no tangent exists). Also returns the auxiliary circle's own
 *  center/radius so callers can draw it as a 'move' step. */
function tangentPointsFromExternalPoint(P, center, r) {
  const d = dist(P, center);
  if (d <= r) return null;
  const auxCenter = midpoint(P, center);
  const auxR = d / 2;
  const pts = circleIntersect(center, r, auxCenter, auxR);
  if (!pts) return null;
  return { points: pts, auxCenter, auxR };
}

// ----------------------------------------------------------------------------
// Step builders — each returns a plain object renderConstruction.js knows how to draw
// ----------------------------------------------------------------------------

const P = (p, role, label) => ({ kind: 'point', role, p, label });
const L = (a, b, role, label) => ({ kind: 'line', role, a, b, label });
/** A full given/auxiliary circle, drawn as a native SVG <circle> (renderConstruction.js). */
const circleStep = (center, radius, role) => ({ kind: 'circle', role, center, radius });
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
// The three constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} principle
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'tangent-from-point',
    label: 'Tangent Lines from an External Point',
    shortLabel: 'Tangent (From Point)',
    principle: "A circle drawn on the point-to-centre line as its diameter crosses the given circle at exactly the two points a tangent can touch — because any angle inscribed in a semicircle is 90°, and a right angle to the radius is the one property every tangent line has.",
    given: [
      { key: 'circleDiameter', label: 'Circle diameter', unit: 'mm', min: 40, max: 110, step: 2, default: 100 },
      { key: 'distance', label: 'Distance from point to centre', unit: 'mm', min: 55, max: 110, step: 1, default: 100 },
      { key: 'angle', label: 'Angle of point from horizontal', unit: '°', min: -45, max: 45, step: 5, default: 30 },
    ],
    build({ circleDiameter, distance, angle }) {
      const r = circleDiameter / 2;
      // The circle (radius r, any direction) and the point P (up to `distance` away, but
      // angle-limited to ±45°) both need full clearance around a fixed centre — scale down
      // once either gets large enough to risk running off the fixed 200×140 canvas, same
      // technique the two-circle constructions use. Small values (near the old unscaled
      // range) stay at 1x, so this only kicks in for the wider problem-seed range.
      const reach = Math.max(r, distance);
      const scale = Math.min(1, 55 / reach);
      const R = r * scale;
      const C = { x: 100, y: 70 };
      const P0 = pointAt(C, distance * scale, deg2rad(angle));
      const steps = [
        circleStep(C, R, 'given'), P(C, 'given', 'C'),
        dim(C, { x: C.x + R, y: C.y }, `⌀${circleDiameter} mm`, 'given', -13),
        P(P0, 'given', 'P'),
        dim(C, P0, `${distance} mm`, 'given', 16),
      ];
      if (distance <= r) {
        return { steps, resultText: 'Move the point further from the circle to construct a tangent.', invalid: 'degenerate' };
      }
      const tan = tangentPointsFromExternalPoint(P0, C, R);
      if (!tan) return { steps, resultText: 'Adjust the values to construct.', invalid: 'degenerate' };
      const { points, auxCenter, auxR } = tan;
      const [T1, T2] = points;
      steps.push(circleStep(auxCenter, auxR, 'move'), P(auxCenter, 'move', 'M'));
      steps.push(L(P0, T1, 'result'), L(P0, T2, 'result'));
      const tangentLen = Math.sqrt(distance * distance - r * r);
      steps.push(
        P(T1, 'result', 'T1'), P(T2, 'result', 'T2'),
        dim(P0, T1, `${tangentLen.toFixed(1)} mm`, 'result', outwardOffset(P0, T1, C, 13)),
      );
      return { steps, resultText: `Tangent length = ${tangentLen.toFixed(1)} mm, touching the circle at T1 and T2` };
    },
  },

  {
    id: 'tangent-two-circles-ext',
    label: 'Common External Tangents to Two Circles',
    shortLabel: 'Tangent (2 Circles, Ext)',
    principle: "Shrink circle 1 by circle 2's radius and the problem becomes 'find the tangent from centre 2 to this smaller circle' — the real tangent line is that same line, shifted back out by circle 2's radius on both circles at once. The auxiliary circle's radius is the DIFFERENCE of the two given radii, because the tangent line stays the same distance from both original circles' edges.",
    given: [
      { key: 'diameter1', label: 'Circle 1 diameter', unit: 'mm', min: 60, max: 90, step: 2, default: 80 },
      { key: 'diameter2', label: 'Circle 2 diameter', unit: 'mm', min: 30, max: 55, step: 2, default: 50 },
      { key: 'centreDistance', label: 'Distance between centres', unit: 'mm', min: 90, max: 130, step: 1, default: 120 },
    ],
    build({ diameter1, diameter2, centreDistance }) {
      const r1 = diameter1 / 2;
      const r2 = diameter2 / 2;
      // Every radial point (A on circle 1, B on circle 2, and the auxiliary circle itself)
      // can land anywhere on its own full circle — not just toward the centre line — so the
      // margin has to clear each circle's OWN radius on every side, not just the tangent
      // segment's footprint (the internal-tangent case caught this the hard way: A could
      // land behind C1 and go negative-x before this fix).
      const scale = Math.min(1, 160 / (centreDistance + r1 + r2), 50 / Math.max(r1, r2));
      const R1 = r1 * scale;
      const R2 = r2 * scale;
      const D = centreDistance * scale;
      const C1 = { x: 20 + R1, y: 70 };
      const C2 = { x: C1.x + D, y: 70 };
      const steps = [
        circleStep(C1, R1, 'given'), P(C1, 'given', 'C1'),
        circleStep(C2, R2, 'given'), P(C2, 'given', 'C2'),
        dim(C1, C2, `${centreDistance} mm`, 'given', 18),
        dim(C1, { x: C1.x, y: C1.y - R1 }, `⌀${diameter1} mm`, 'given', -13),
        dim(C2, { x: C2.x, y: C2.y - R2 }, `⌀${diameter2} mm`, 'given', -13),
      ];
      const auxR = Math.abs(R1 - R2);
      if (auxR < 1e-6) {
        return { steps, resultText: 'Equal-diameter circles have parallel external tangents — change one diameter to construct the usual case.', invalid: 'degenerate' };
      }
      const tan = tangentPointsFromExternalPoint(C2, C1, auxR);
      if (!tan) return { steps, resultText: 'Move the circles further apart to construct.', invalid: 'degenerate' };
      const { auxCenter, auxR: halfAux, points } = tan;
      steps.push(circleStep(C1, auxR, 'move'), circleStep(auxCenter, halfAux, 'move'), P(auxCenter, 'move', 'M'));
      const results = points.map((T) => {
        const u = unitVec(C1, T);
        return {
          A: { x: C1.x + R1 * u.x, y: C1.y + R1 * u.y },
          B: { x: C2.x + R2 * u.x, y: C2.y + R2 * u.y },
        };
      });
      results.forEach(({ A, B }, i) => {
        steps.push(L(C1, A, 'move'));
        steps.push(L(A, B, 'result'));
        steps.push(P(A, 'result', i === 0 ? 'T1' : 'T3'), P(B, 'result', i === 0 ? 'T2' : 'T4'));
      });
      return { steps, resultText: `Two external tangent lines, touching at T1/T2 and T3/T4 (diameters ${diameter1} mm and ${diameter2} mm)` };
    },
  },

  {
    id: 'tangent-two-circles-int',
    label: 'Common Internal Tangents to Two Circles',
    shortLabel: 'Tangent (2 Circles, Int)',
    principle: "Internal tangents cross BETWEEN the two circles, so the auxiliary circle now has to be grown, not shrunk — its radius is the SUM of the two given radii, the reverse of the external case, because the tangent line has to reach past centre 1 to arrive at circle 2 from the far side.",
    given: [
      { key: 'diameter1', label: 'Circle 1 diameter', unit: 'mm', min: 40, max: 60, step: 2, default: 50 },
      { key: 'diameter2', label: 'Circle 2 diameter', unit: 'mm', min: 20, max: 40, step: 2, default: 30 },
      { key: 'centreDistance', label: 'Distance between centres', unit: 'mm', min: 70, max: 100, step: 1, default: 90 },
    ],
    build({ diameter1, diameter2, centreDistance }) {
      const r1 = diameter1 / 2;
      const r2 = diameter2 / 2;
      // The auxiliary circle drawn at C1 has radius r1+r2 (bigger than either given circle),
      // so IT sets the binding radial-clearance constraint here, not r1/r2 individually —
      // same "own full circle, every side" reasoning as the external case, just against the
      // larger of the three circles actually drawn at C1.
      const auxRUnscaled = r1 + r2;
      const scale = Math.min(1, 160 / (centreDistance + r1 + r2), 50 / auxRUnscaled);
      const R1 = r1 * scale;
      const R2 = r2 * scale;
      const D = centreDistance * scale;
      const C1 = { x: 20 + auxRUnscaled * scale, y: 70 };
      const C2 = { x: C1.x + D, y: 70 };
      const steps = [
        circleStep(C1, R1, 'given'), P(C1, 'given', 'C1'),
        circleStep(C2, R2, 'given'), P(C2, 'given', 'C2'),
        dim(C1, C2, `${centreDistance} mm`, 'given', 18),
        dim(C1, { x: C1.x, y: C1.y - R1 }, `⌀${diameter1} mm`, 'given', -13),
        dim(C2, { x: C2.x, y: C2.y - R2 }, `⌀${diameter2} mm`, 'given', -13),
      ];
      const auxR = R1 + R2;
      if (centreDistance <= r1 + r2 || auxR >= dist(C1, C2)) {
        return { steps, resultText: 'The circles overlap — move them further apart to construct internal tangents.', invalid: 'degenerate' };
      }
      const tan = tangentPointsFromExternalPoint(C2, C1, auxR);
      if (!tan) return { steps, resultText: 'Move the circles further apart to construct.', invalid: 'degenerate' };
      const { auxCenter, auxR: halfAux, points } = tan;
      steps.push(circleStep(C1, auxR, 'move'), circleStep(auxCenter, halfAux, 'move'), P(auxCenter, 'move', 'M'));
      const results = points.map((T) => {
        const u = unitVec(C1, T);
        return {
          A: { x: C1.x + R1 * u.x, y: C1.y + R1 * u.y },
          B: { x: C2.x - R2 * u.x, y: C2.y - R2 * u.y },
        };
      });
      results.forEach(({ A, B }, i) => {
        steps.push(L(C1, A, 'move'));
        steps.push(L(A, B, 'result'));
        steps.push(P(A, 'result', i === 0 ? 'T1' : 'T3'), P(B, 'result', i === 0 ? 'T2' : 'T4'));
      });
      return { steps, resultText: `Two internal tangent lines, crossing between the circles and touching at T1/T2 and T3/T4 (diameters ${diameter1} mm and ${diameter2} mm)` };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
