// labelPlacement.js — the label-placement policy for the 2D orthographic SHEET (and its constructions).
//
// The 3D scene labels moved to their own dedicated system in src/labels/ (LabelManager + LabelFactory
// + LabelStyles + LabelPlacement). THIS file now owns only the 2D-sheet placement policy, consumed by
// the (unmodified) sheet leaves: compareSheet.js (chips + axis + view-dimension standoff), traces.js
// (trace-marker labels), and trueLength.js (marker letter + angle bisector + TL-value lift).
//
// The governing rule is DESIGN.md §5.9: a vertex / geometry label is "a small paper pill nudged
// outward off the linework so it never sits on top of it." On the sheet, the views are axis-aligned
// segments, so "off the linework" means a PERPENDICULAR lift off the view line (front view above XY
// up, top view below XY down) plus a small lateral spread (a left, b right); construction markers ride
// their dot with a fixed child offset; an angle sits along its own bisector.
//
// Units: `sheet2D` is orthographic sheet-space units (sheet2DLayout.js).
//
// Layering (ADR-007 / §3.6): a STATELESS shared math utility (the sheet2DLayout.js / dimensions.js /
// labels.js family exception) — holds no state, imports no sibling behaviour leaf.

/** The 2D-sheet placement table. Named by ROLE (grouped under `sheet2D` for import-stability). */
export const PLACEMENT = {
  // ── 2D orthographic sheet (sheet-space units) ──
  sheet2D: {
    /** VERTEX + PROJECTED chips (a/b, a′/b′): lateral spread `out` (a left, b right) + a
     *  perpendicular `plane` lift off the view line (front view up, top view down); a coincident
     *  point-view collapses to a single chip nudged out by `pointOut`. */
    chip: { out: 0.32, plane: 0.30, pointOut: 0.40 },
    /** AXIS end marks (x/y): lift above the XY line (lateral sits at the frame edge, kept by caller). */
    axisLift: 0.38,
    /** DIMENSION line standoff off a view length (perpendicular, away from XY). */
    dimOffset: 0.55,
    /** TRACE construction labels (h/v feet + HT/VT circles), each riding its marker group. */
    trace: { h: [0, -0.34, 0], v: [0, 0.34, 0], ht: [0.46, -0.02, 0], vt: [0.5, 0.04, 0] },
    /** A rotating-line construction MARKER's letter (b₁ / b₁′), riding its dot. */
    marker: [0.32, 0, 0],
    /** ANGLE labels along the bisector (θ/φ true angles): elliptical radius from the pivot. */
    angleRadius: { x: 1.1, y: 0.9 },
    /** Recovered True-Length VALUE lift above/below its line. */
    tlValueLift: 0.4,
  },
};

/**
 * BISECTOR anchor for an angle label: a point out along the angle's bisector from `pivot`, at the
 * elliptical radius `{x,y}` (a wider x than y keeps the two-digit °-label clear of both arms).
 * @param {number[]} pivot   the angle vertex ([x,y] or [x,y,z])
 * @param {number}   bisAng  the bisector direction (radians)
 * @param {{x:number,y:number}} radius
 * @returns {[number, number, number]}
 */
export function bisectorAnchor(pivot, bisAng, radius) {
  return [pivot[0] + Math.cos(bisAng) * radius.x, pivot[1] + Math.sin(bisAng) * radius.y, pivot[2] ?? 0];
}
