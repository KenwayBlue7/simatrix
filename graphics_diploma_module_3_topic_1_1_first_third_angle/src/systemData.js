// systemData.js — pure data layer (leaf, no THREE, no DOM): the projection-system
// state and the fixed solid's dimensions. Adapted from the Module-1-family pattern
// (spatialData.js) for this topic's one real parameter: which projection system is
// active. Every rebuild() call gets a fresh object from defaultSystemData().

/** The two systems this topic teaches. Third-angle must be explicitly chosen —
 *  BIS/India defaults to first-angle (CONTENT SPEC default-rule bullet). */
export const ProjectionSystem = Object.freeze({
  FIRST: 'first',
  THIRD: 'third',
});

/**
 * Sign convention shared by every geometry leaf: +1 for first-angle (object in
 * Quadrant I: above HP, in front of VP; PP offset to the object's right), -1 for
 * third-angle (object in Quadrant III: below HP, behind VP; PP offset to the
 * object's left). Verified numerically (scratchpad/verify_projection_geom.mjs)
 * that a SINGLE constant fold rotation on each plane, combined only with this sign
 * on the object's quadrant placement and PP's offset side, reproduces the correct
 * flattened layout for both systems — no per-system fold-direction branching needed.
 * @param {string} system
 * @returns {1|-1}
 */
export function systemSign(system) {
  return system === ProjectionSystem.THIRD ? -1 : 1;
}

/**
 * @typedef {Object} SystemData
 * @property {string} system  One of ProjectionSystem's values.
 */

/** Canonical default: first-angle (the BIS/India default). Fresh object every call. */
export function defaultSystemData() {
  return { system: ProjectionSystem.FIRST };
}

// ── The one solid (world units). A plain rectangular block: its three views are
// three visibly-different rectangles (L×H front, L×W top, W×H side), which is all
// that's needed to teach VIEW POSITION — first vs third angle changes where each
// view lands on the sheet, not what any single view looks like (a box has no
// asymmetry that would make its views themselves differ between the two systems).
export const SOLID = Object.freeze({
  L: 1.6,  // along X — width in the front/top views
  H: 1.0,  // along Y — height in the front/side views
  W: 0.7,  // along Z — depth in the top/side views
});

/** Object-centre offset from the HP∩VP∩PP corner, before the quadrant sign is
 *  applied (matches the frustums.js Q1/Q3 point-reflection precedent). */
export const CENTER_OFFSET = Object.freeze({ y: 1.6, z: 1.6 });

/** PP's fixed hinge-line offset from VP's centre (world X). Must clear TWICE
 *  planes.js's HALF (3) — not just the drawn view's own extent — because HP and VP's
 *  sheet RECTANGLES themselves span the full ±HALF in X regardless of fold (HP's fold
 *  only rotates Y/Z; VP is stationary), so anything less than 2×HALF leaves PP's own
 *  folded sheet border overlapping HP/VP's sheet border, not just the object's drawn
 *  views on top of it. 6.5 clears with a visible gap. */
export const PP_OFFSET = 6.5;
