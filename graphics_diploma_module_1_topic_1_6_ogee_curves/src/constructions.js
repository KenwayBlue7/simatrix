// Pure geometry for the two ogee (reverse) curve constructions. NO DOM here — every
// function returns plain data (points, line segments, arc definitions, plus this topic's
// new `handle` descriptor). renderConstruction.js is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe (steps + handle) to renderConstruction.js.
//
// Coordinate system: fixed 200x140 SVG viewBox, origin top-left, y increases downward —
// same convention as every prior topic. Generic primitives/step-builders are copied
// verbatim (dist/angleOf/pointAt/P/L/arcMark/moveArc/circleStep/dim/angleDim/
// outwardOffset/normalizeSpan — the last from Topic 1.2, needed here because both ogee
// arcs must draw as their MINOR arc, same reasoning Topic 1.2 had for tangent arcs).
//
// THE CORE GEOMETRY (verified numerically this session, Node, before writing this file —
// see the session's own audit). An ogee curve is two arcs, arc1 tangent to line1 at A and
// arc2 tangent to line2 at B, tangent to EACH OTHER at a reversal point M. The textbook's
// "assume the curves reverse at the midpoint of AB" is only true in the SYMMETRIC case
// (R1 = R2) — for any other split the reversal point M does NOT sit on the straight
// segment AB at all; it sits on the segment O1-O2 (the two arc centres), which only
// coincides with AB when R1 = R2. This directly contradicts a first-pass derivation this
// session tried and discarded (perpendicular-to-AB-at-a-chosen-M) after a numeric
// self-consistency check failed it — flagged here because it is the kind of thing that
// LOOKS right (it is exactly the shape of the diagram in some texts) but silently
// produces two circles that are not actually tangent to each other for R1 != R2.
//
// The one genuinely free parameter is R1 (radius of the FIRST arc, at A) — everything
// else derives from it: O1 = A + R1*n1 (n1 = the curve's bulge direction, fixed once A and
// its line are known); R2 solves the tangent-circles equation |O1-O2| = R1+R2 where
// O2 = B + R2*n2 (a linear-in-R2 equation after squaring, solved in closed form, no
// iteration — see solveR2()); M is the point on segment O1-O2 at distance R1 from O1.
// Verified (Node): |O1-O2| = R1+R2 to floating-point precision for both this topic's
// cases, across a wide sweep of R1/geometry combinations.
//
// This topic's SEED problem states the parallel-lines case as "curves reverse at the
// midpoint" and the non-parallel case as "radius R1 given" — two different-sounding
// framings of the exact same one-parameter family. Both constructions here store the
// free parameter as R1 internally; the parallel construction's own given `reversalPos`
// (%, matching the textbook's position-based framing) converts to R1 via
// R1 = (reversalPos/100) * (R1+R2) — since R1+R2 is a FIXED constant for two given
// parallel lines regardless of where the curve reverses (also verified numerically) —
// while the non-parallel construction's `radius1` (mm) IS R1 directly, matching its own
// source framing. Both then feed the identical solveR2()/handle mechanism.
//
// THE DRAGGABLE HANDLE (this topic's own new interaction, no precedent in Topics 1.1-1.5
// — see CLAUDE.md). The handle is rendered at O1 and constrained to slide along the FIXED
// ray from A in direction n1 (fixed once A/line1/params other than R1 are known) — dragging
// it changes R1 directly, which is why it also visibly resizes arc2/R2 (a single shared
// derivation), matching the CONTEXT's "watch both curve radii resize live" requirement.
// Each build() return value carries a `handle` descriptor consumed by renderConstruction.js
// / main.js — never by uiManager.js, which does not touch the SVG (RULES.md §3.2).

const deg2rad = (d) => (d * Math.PI) / 180;

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function angleOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointAt(center, r, angleRad) {
  return { x: center.x + r * Math.cos(angleRad), y: center.y + r * Math.sin(angleRad) };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

/** Rotate a unit vector 90 degrees (CCW in standard math; the specific sense doesn't
 *  matter here as long as callers stay consistent — SVG's y-down flips the visual sense
 *  but not the algebra). */
function rot90(v) {
  return { x: -v.y, y: v.x };
}
function rotNeg90(v) {
  return { x: v.y, y: -v.x };
}

/** Solve the tangent-circles equation |O1-O2| = R1+R2 for R2, given O1 (already fixed by
 *  A/n1/R1), B, and n2 (the second arc's own bulge direction). Closed form: squaring
 *  |O1-B-R2*n2|^2 = (R1+R2)^2 cancels the R2^2 term, leaving one LINEAR equation in R2 —
 *  no iteration. Returns null if the configuration is degenerate (denominator ~0). */
function solveR2(O1, R1, B, n2) {
  const V = { x: O1.x - B.x, y: O1.y - B.y };
  const Vn2 = dot(V, n2);
  const V2 = dot(V, V);
  const denom = 2 * (Vn2 + R1);
  if (Math.abs(denom) < 1e-9) return null;
  return (V2 - R1 * R1) / denom;
}

/** Shrink the (startAngle,endAngle) span to whichever coterminal representation is <= 180°
 *  — both ogee arcs are always the minor arc between their two endpoints (Topic 1.2's
 *  identical technique for tangent arcs, reused verbatim). */
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
const arcMark = (center, radius, aimPoint, spanDeg = 60) => {
  const a = angleOf(center, aimPoint);
  const half = deg2rad(spanDeg / 2);
  return { kind: 'arc', role: 'move', center, radius, startAngle: a - half, endAngle: a + half };
};
/** The finished ogee arc segment — role 'result'. Always the minor arc between endpoints. */
const resultArc = (center, radius, startAngle, endAngle) => {
  const n = normalizeSpan(startAngle, endAngle);
  return { kind: 'arc', role: 'result', center, radius, startAngle: n.startAngle, endAngle: n.endAngle };
};
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });
const angleDim = (center, rayA, rayB, text, role, radius = 10) =>
  ({ kind: 'angledim', role, center, rayA, rayB, text, radius });

function outwardOffset(a, b, awayFrom, magnitude) {
  const px = -(b.y - a.y);
  const py = b.x - a.x;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dot2 = px * (awayFrom.x - mx) + py * (awayFrom.y - my);
  return dot2 > 0 ? -magnitude : magnitude;
}

// ----------------------------------------------------------------------------
// The two constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */
/** @typedef {{point:{x:number,y:number}, axisFrom:{x:number,y:number}, axisDir:{x:number,y:number}, min:number, max:number, key:string, toParam:(distanceAlongAxis:number)=>number, valueToDistance:(value:number)=>number}} HandleSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} principle
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number>) => {steps:Array, resultText:string, invalid?:string, handle?:HandleSpec}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'ogee-parallel',
    label: 'Ogee Curve — Parallel Lines',
    shortLabel: 'Ogee (Parallel)',
    principle: "R1+R2 is FIXED once the two parallel lines and their connection points are set — only where the curve reverses along that fixed total changes as you drag. Each arc's centre sits on the perpendicular to its own line at its own tangent point, and the two centres, the reversal point, and the tangent lengths all move together as one linked system, not two independent circles.",
    given: [
      { key: 'offset', label: 'Vertical offset', unit: 'mm', min: 40, max: 90, step: 5, default: 60 },
      { key: 'distance', label: 'Horizontal distance', unit: 'mm', min: 50, max: 100, step: 5, default: 70 },
      { key: 'reversalPos', label: 'Reversal point position', unit: '%', min: 10, max: 90, step: 5, default: 50 },
    ],
    build({ offset, distance, reversalPos }) {
      // Work in a LOCAL unscaled (real-mm) frame first, then transform every point through
      // T() once a canvas-fitting scale is known — keeps the geometry itself scale-free and
      // easy to verify independently of placement.
      const A0 = { x: 0, y: 0 };
      const B0 = { x: distance, y: offset };
      const n1 = { x: 0, y: 1 }; // bulge down from line1, into the gap toward line2
      const n2 = { x: 0, y: -1 }; // bulge up from line2, into the gap toward line1
      const k = (distance * distance + offset * offset) / (2 * offset); // R1+R2, constant
      const R1 = (reversalPos / 100) * k;
      const O1_0 = { x: A0.x + R1 * n1.x, y: A0.y + R1 * n1.y };
      const R2 = solveR2(O1_0, R1, B0, n2);
      if (R2 === null || R2 <= 0 || R1 <= 0) {
        return { steps: [], resultText: 'Move the reversal point to construct.', invalid: 'degenerate' };
      }
      const O2_0 = { x: B0.x + R2 * n2.x, y: B0.y + R2 * n2.y };
      const O1O2dist = dist(O1_0, O2_0);
      const M0 = {
        x: O1_0.x + (R1 / O1O2dist) * (O2_0.x - O1_0.x),
        y: O1_0.y + (R1 / O1O2dist) * (O2_0.y - O1_0.y),
      };

      // Fit to canvas: bbox of every drawn point + arc reach, then a scale + origin. The
      // arcs never extend further than each centre's own radius in either axis, so the
      // centre+radius bounding box is a safe, exact reach estimate (no arc-angle sampling
      // needed — unlike a short compass-mark arc, these can sweep close to a half-circle).
      // MARGIN is a fixed SVG-unit budget (not proportional to the drawing's own span —
      // that was this build's first-draft bug: a guide line "0.9x the span past the point"
      // overshoots badly once the span already fills most of the canvas). It has to cover
      // the given-line overhang past A/B, the perpendicular guide overhang past O1/O2, AND
      // dimension label reach all at once, so every one of those is capped at or under it.
      const MARGIN = 18;
      const minX = Math.min(A0.x, B0.x, O1_0.x - R1, O2_0.x - R2);
      const maxX = Math.max(A0.x, B0.x, O1_0.x + R1, O2_0.x + R2);
      const minY = Math.min(A0.y, B0.y, O1_0.y - R1, O2_0.y - R2);
      const maxY = Math.max(A0.y, B0.y, O1_0.y + R1, O2_0.y + R2);
      const scale = Math.min(1.2, (200 - 2 * MARGIN) / (maxX - minX), (140 - 2 * MARGIN) / (maxY - minY));
      const originX = MARGIN - minX * scale;
      const originY = MARGIN - minY * scale;
      const T = (p) => ({ x: originX + p.x * scale, y: originY + p.y * scale });

      const A = T(A0), B = T(B0), O1 = T(O1_0), O2 = T(O2_0), M = T(M0);
      const OVERHANG = MARGIN * 0.6;
      const steps = [
        L({ x: A.x - OVERHANG, y: A.y }, { x: A.x + (B.x - A.x) + OVERHANG, y: A.y }, 'given'),
        L({ x: B.x - (B.x - A.x) - OVERHANG, y: B.y }, { x: B.x + OVERHANG, y: B.y }, 'given'),
        P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(A, B, `${distance} mm`, 'given', -12),
        dim(A, { x: A.x, y: B.y }, `${offset} mm`, 'given', -14),
      ];
      // Perpendicular guide + compass mark locating O1 at distance R1 from A.
      steps.push(
        L(A, { x: A.x, y: O1.y + OVERHANG * 0.5 }, 'move'),
        arcMark(A, dist(A, O1), O1, 40), P(O1, 'move', 'O1'),
        dim(A, O1, `R1 = ${R1.toFixed(1)} mm`, 'move', 12),
      );
      // Perpendicular guide + compass mark locating O2 at distance R2 from B.
      steps.push(
        L(B, { x: B.x, y: O2.y - OVERHANG * 0.5 }, 'move'),
        arcMark(B, dist(B, O2), O2, 40), P(O2, 'move', 'O2'),
        dim(B, O2, `R2 = ${R2.toFixed(1)} mm`, 'move', 12),
      );
      // O1-O2 line, marking the reversal point M along it.
      steps.push(L(O1, O2, 'move'), P(M, 'move', 'M'));
      // The two result arcs, opposite curvature (the "S").
      steps.push(resultArc(O1, dist(O1, A), angleOf(O1, A), angleOf(O1, M)));
      steps.push(resultArc(O2, dist(O2, M), angleOf(O2, M), angleOf(O2, B)));

      const axisDirSvg = { x: 0, y: 1 }; // A -> O1 direction after transform (still vertical)
      const handle = {
        point: O1,
        axisFrom: A,
        axisDir: axisDirSvg,
        min: 0.02 * k,
        max: 0.98 * k,
        key: 'reversalPos',
        // distanceAlongAxis is in SVG units; convert back to real mm (divide by scale),
        // that IS R1, then convert R1 -> reversalPos%.
        toParam: (svgDist) => {
          const r1 = Math.max(0, svgDist / scale);
          return Math.max(2, Math.min(98, (r1 / k) * 100));
        },
        valueToDistance: (reversalPosValue) => ((reversalPosValue / 100) * k) * scale,
      };

      return {
        steps,
        resultText: `R1 = ${R1.toFixed(1)} mm, R2 = ${R2.toFixed(1)} mm (R1+R2 = ${k.toFixed(1)} mm, fixed)`,
        handle,
      };
    },
  },

  {
    id: 'ogee-nonparallel',
    label: 'Ogee Curve — Non-Parallel Lines',
    shortLabel: 'Ogee (Non-Parallel)',
    principle: "Fixing R1 pins the first arc's centre O1 completely — the second centre O2 then has only ONE remaining freedom (how far along its own line's perpendicular it sits), and the tangent-circle condition (centre distance = R1+R2) is exactly one equation, so O2 — and with it R2 and the reversal point — is fully determined, not independently chosen.",
    given: [
      { key: 'angle', label: 'Angle between lines', unit: '°', min: 30, max: 120, step: 5, default: 60 },
      { key: 'len1', label: 'Length of first line', unit: 'mm', min: 40, max: 80, step: 5, default: 60 },
      { key: 'distance2', label: 'Distance to second point', unit: 'mm', min: 50, max: 120, step: 5, default: 86 },
      { key: 'radius1', label: 'Radius at first end', unit: 'mm', min: 15, max: 45, step: 1, default: 30 },
    ],
    build({ angle, len1, distance2, radius1 }) {
      const theta = deg2rad(angle);
      const V0 = { x: 0, y: 0 };
      const dir1 = { x: Math.cos(Math.PI - theta), y: -Math.sin(Math.PI - theta) };
      const dir2 = { x: 1, y: 0 };
      const A0 = { x: V0.x + len1 * dir1.x, y: V0.y + len1 * dir1.y };
      const B0 = { x: V0.x + distance2 * dir2.x, y: V0.y + distance2 * dir2.y };
      const n1 = rot90(dir1);
      const n2 = rotNeg90(dir2);

      const R1 = radius1;
      const O1_0 = { x: A0.x + R1 * n1.x, y: A0.y + R1 * n1.y };
      const R2 = solveR2(O1_0, R1, B0, n2);
      if (R2 === null || R2 <= 0) {
        return { steps: [], resultText: 'Adjust the radius to construct.', invalid: 'degenerate' };
      }
      const O2_0 = { x: B0.x + R2 * n2.x, y: B0.y + R2 * n2.y };
      const O1O2dist = dist(O1_0, O2_0);
      const M0 = {
        x: O1_0.x + (R1 / O1O2dist) * (O2_0.x - O1_0.x),
        y: O1_0.y + (R1 / O1O2dist) * (O2_0.y - O1_0.y),
      };
      const lineEnd2_0 = { x: V0.x + (distance2 + 25) * dir2.x, y: V0.y + (distance2 + 25) * dir2.y };

      // MARGIN is a fixed SVG-unit budget (not proportional to the drawing's own span — see
      // ogee-parallel's identical fix above, found first and ported here). Covers the
      // guide-line overshoot past O1/O2 and every dimension label's reach.
      const MARGIN = 32;
      const pts0 = [V0, A0, B0, lineEnd2_0, O1_0, O2_0];
      const minX = Math.min(...pts0.map((p) => p.x), O1_0.x - R1, O2_0.x - R2);
      const maxX = Math.max(...pts0.map((p) => p.x), O1_0.x + R1, O2_0.x + R2);
      const minY = Math.min(...pts0.map((p) => p.y), O1_0.y - R1, O2_0.y - R2);
      const maxY = Math.max(...pts0.map((p) => p.y), O1_0.y + R1, O2_0.y + R2);
      const scale = Math.min(1.2, (200 - 2 * MARGIN) / (maxX - minX), (140 - 2 * MARGIN) / (maxY - minY));
      const originX = MARGIN - minX * scale;
      const originY = MARGIN - minY * scale;
      const T = (p) => ({ x: originX + p.x * scale, y: originY + p.y * scale });

      const V = T(V0), A = T(A0), B = T(B0), lineEnd2 = T(lineEnd2_0);
      const O1 = T(O1_0), O2 = T(O2_0), M = T(M0);

      const steps = [
        L(V, A, 'given'), L(V, lineEnd2, 'given'),
        P(V, 'given', 'V'), P(A, 'given', 'A'), P(B, 'given', 'B'),
        dim(V, A, `${len1} mm`, 'given', outwardOffset(V, A, B, 12)),
        dim(V, B, `${distance2} mm`, 'given', 14),
        angleDim(V, A, B, `${angle}°`, 'given', 16),
      ];
      steps.push(
        L(A, { x: A.x + (O1.x - A.x) * 1.15, y: A.y + (O1.y - A.y) * 1.15 }, 'move'),
        arcMark(A, dist(A, O1), O1, 40), P(O1, 'move', 'O1'),
        dim(A, O1, `R1 = ${R1.toFixed(1)} mm`, 'move', 12),
      );
      steps.push(
        L(B, { x: B.x + (O2.x - B.x) * 1.15, y: B.y + (O2.y - B.y) * 1.15 }, 'move'),
        arcMark(B, dist(B, O2), O2, 40), P(O2, 'move', 'O2'),
        dim(B, O2, `R2 = ${R2.toFixed(1)} mm`, 'move', 12),
      );
      steps.push(L(O1, O2, 'move'), P(M, 'move', 'M'));
      steps.push(resultArc(O1, dist(O1, A), angleOf(O1, A), angleOf(O1, M)));
      steps.push(resultArc(O2, dist(O2, M), angleOf(O2, M), angleOf(O2, B)));

      const axisVecSvg = { x: O1.x - A.x, y: O1.y - A.y };
      const axisLenSvg = Math.hypot(axisVecSvg.x, axisVecSvg.y) || 1;
      const axisDirSvg = { x: axisVecSvg.x / axisLenSvg, y: axisVecSvg.y / axisLenSvg };
      const handle = {
        point: O1,
        axisFrom: A,
        axisDir: axisDirSvg,
        min: 15,
        max: 45,
        key: 'radius1',
        toParam: (svgDist) => Math.max(15, Math.min(45, svgDist / scale)),
        valueToDistance: (value) => value * scale,
      };

      return {
        steps,
        resultText: `R1 = ${R1.toFixed(1)} mm (given), R2 = ${R2.toFixed(1)} mm (derived)`,
        handle,
      };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
