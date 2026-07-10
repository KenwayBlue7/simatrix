// spatialData.js — the Spatial Framework data layer (Quadrants + First-angle).
// Adapted from Module1/src/pointData.js for the orchestrator pattern (ADR-033):
// stores raw distance values only — no Three.js, no DOM, no side effects, and no
// dependency on the retired shared engine.js frame.
// Every rebuild() call gets a fresh object from defaultSpatialData().

/**
 * @typedef {Object} SpatialData
 * @property {number} distHP   Unsigned distance from the Horizontal Plane. Stored
 *                             magnitudes are unit-agnostic; this topic's lessons label
 *                             them mm (ADR-018 — sibling lessons may label the same
 *                             magnitude differently). World scaling is main.js's concern.
 * @property {number} distVP   Unsigned distance from the Vertical Plane. Same units.
 * @property {string} quadrant One of the QuadrantType values — drives sign application.
 */

/**
 * The four dihedral quadrants formed by HP ∩ VP.
 *
 *  Q1 — above HP, in front of VP  (+Y, +X)
 *  Q2 — above HP, behind  VP      (+Y, −X)
 *  Q3 — below HP, behind  VP      (−Y, −X)
 *  Q4 — below HP, in front of VP  (−Y, +X)
 *
 * Engineering convention: HP is the XZ plane (Y = 0); VP is the YZ plane (X = 0).
 */
export const QuadrantType = Object.freeze({
  Q1: 'Q1',
  Q2: 'Q2',
  Q3: 'Q3',
  Q4: 'Q4',
});

/**
 * Single source of truth for what each quadrant means: the sign each unsigned
 * distance takes (signX applies to distVP, signY to distHP) and the human-readable
 * wording the quadrant read-out shows. resolvePosition() and quadrantAt() both
 * derive from this table so the two directions can never disagree.
 */
export const QUADRANT_INFO = Object.freeze({
  Q1: Object.freeze({ signX:  1, signY:  1, label: 'First Quadrant',  description: 'above HP, in front of VP' }),
  Q2: Object.freeze({ signX: -1, signY:  1, label: 'Second Quadrant', description: 'above HP, behind VP' }),
  Q3: Object.freeze({ signX: -1, signY: -1, label: 'Third Quadrant',  description: 'below HP, behind VP' }),
  Q4: Object.freeze({ signX:  1, signY: -1, label: 'Fourth Quadrant', description: 'below HP, in front of VP' }),
});

/**
 * Canonical defaults — point in the First Quadrant, equidistant from both planes
 * (same magnitudes as the legacy lessons' defaults, so existing textbook problems
 * keep their expected starting state).
 * Returns a fresh object every call so reset() never shares a reference.
 * @returns {SpatialData}
 */
export function defaultSpatialData() {
  return {
    distHP: 20,
    distVP: 20,
    quadrant: QuadrantType.Q1,
  };
}

/**
 * Resolve a SpatialData into the actual signed (x, y, z) position.
 *
 * Sign convention (right-handed, Y-up Three.js):
 *   HP = XZ plane at Y = 0  →  distHP drives Y (positive = above HP)
 *   VP = YZ plane at X = 0  →  distVP drives X (positive = in front of VP / toward viewer)
 *
 * z is always 0 — the point sits on the profile mid-plane; lateral position is not
 * a taught parameter in this topic.
 *
 * @param {SpatialData} data
 * @returns {{ x: number, y: number, z: number }}
 */
export function resolvePosition(data) {
  const { distHP, distVP, quadrant } = data;
  const info = QUADRANT_INFO[quadrant] || QUADRANT_INFO.Q1;
  return {
    x: info.signX * distVP,
    y: info.signY * distHP,
    z: 0,
  };
}

/**
 * The reverse read-out: which quadrant contains a signed position.
 * Returns null when the point lies ON a plane (x = 0 or y = 0) — the read-out
 * should then say "in VP" / "in HP" rather than name a quadrant.
 *
 * @param {number} x Signed distance from VP (positive = in front).
 * @param {number} y Signed distance from HP (positive = above).
 * @returns {string|null} A QuadrantType value, or null when on a plane.
 */
export function quadrantAt(x, y) {
  if (x === 0 || y === 0) return null;
  for (const q of Object.keys(QUADRANT_INFO)) {
    const info = QUADRANT_INFO[q];
    if (Math.sign(x) === info.signX && Math.sign(y) === info.signY) return q;
  }
  return null;
}
