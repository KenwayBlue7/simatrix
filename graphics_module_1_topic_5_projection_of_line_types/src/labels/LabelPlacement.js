// LabelPlacement.js — computes label POSITIONS. Nothing else.
//
// Single responsibility: given camera-independent geometry (endpoints in the owner group's LOCAL
// frame, plus which role the label plays), return a position `[x, y, z]`. It creates no DOM, no CSS,
// no CSS2DObject, touches no scene and no camera. The caller (LabelManager) is the sole writer of
// `label.position` — this module only returns numbers.
//
// STEP 6 — NO MAGIC NUMBERS: every spacing value is a named, documented constant below.
// STEP 9 — compute for a LINE, do not copy Points' point offsets. A vertex/projected label is pushed
// OUTBOARD past its OWN endpoint, along the rod's own axis away from the far end (DESIGN.md §5.9
// "nudge the label outward off the linework"): mirror-symmetric for the two ends, always into the
// empty space beyond the tip, never onto the rod. Points labels a single point (a fixed up-nudge
// works there); a line needs this direction-aware push, so it is derived here, not borrowed.
//
// Units: world units, 1u = 10 mm (ADR-018). Coordinates are LOCAL to the owning group.

// ── CONSTANTS ────────────────────────────────────────────────────────────────
/** How far past its own tip a vertex/projected chip (A/B, a/b, a′/b′) sits, along the rod axis. */
export const ENDPOINT_OFFSET = 0.7;
/** HP plane callout anchor — on the floor, front-left, inside the default camera frame.
 *  Must track lineTypeRig.js's SHEET (32) / SHEET_LIFT (38) / PLANE_LIFT (7): HP spans
 *  z ∈ [-12, +26] (ADR-079, rectangle addendum). */
export const PLANE_HP_ANCHOR = [-12, 0.1, 19];
/** VP plane callout anchor — high on the wall, left, inside the default frame.
 *  Must track lineTypeRig.js's SHEET (32) / SHEET_LIFT (38) / PLANE_LIFT (7): VP spans
 *  y ∈ [-12, +26] (ADR-079, rectangle addendum). */
export const PLANE_VP_ANCHOR = [-12, 19, 0.05];
/** 'x' end mark — just past the LEFT end of the visible XY fold line (±SHEET/2, SHEET=32). */
export const AXIS_X_ANCHOR = [-16, 0.5, 0];
/** 'y' end mark — just past the RIGHT end of the visible XY fold line (±SHEET/2, SHEET=32). */
export const AXIS_Y_ANCHOR = [16, 0.5, 0];
/** θ/φ standoff off the rod mid-point: `lateral` mirrored ±x (θ toward HP, φ toward VP), `lift` up. */
export const ANGLE_OFFSET = { lateral: 0.7, lift: 0.3 };
/** TL dimension-line perpendicular standoff off the rod (passed to the untouched dimensions.js). */
export const DIMENSION_OFFSET = 0.95;

// ── PLACEMENT FUNCTIONS (pure) ───────────────────────────────────────────────
/**
 * Outboard placement: the point ENDPOINT_OFFSET past `end`, along the axis from `far` → `end`.
 * Coincident ends (a point-view rod) fall back to a small vertical lift.
 * @param {number[]} end  the endpoint being labelled ([x,y,z], owner-local)
 * @param {number[]} far  the OTHER endpoint (sets the outward direction)
 * @returns {[number, number, number]}
 */
export function endpoint(end, far) {
  const k = ENDPOINT_OFFSET;
  const dx = end[0] - far[0], dy = end[1] - far[1], dz = end[2] - far[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-3) return [end[0], end[1] + k, end[2]];
  const s = k / len;
  return [end[0] + dx * s, end[1] + dy * s, end[2] + dz * s];
}

/** θ (inclination with HP): off the A-end toward the HP side (−x), lifted, at the rod mid-depth. */
export function angleHP(aEnd, midY, midZ) {
  return [aEnd[0] - ANGLE_OFFSET.lateral, midY + ANGLE_OFFSET.lift, midZ];
}

/** φ (inclination with VP): off the B-end toward the VP side (+x), lifted, at the rod mid-depth. */
export function angleVP(bEnd, midY, midZ) {
  return [bEnd[0] + ANGLE_OFFSET.lateral, midY + ANGLE_OFFSET.lift, midZ];
}
