// pointData.js — Ported pattern from src/shapeData.js (Module 2).
// Stores raw coordinate / distance values only — no Three.js, no side effects.
// Every rebuild() call gets a fresh object from defaultPointData().

/**
 * @typedef {Object} PointData
 * @property {number} distHP   Distance above the Horizontal Plane (Y ≥ 0 means above HP). World units.
 * @property {number} distVP   Distance in front of the Vertical Plane (X ≥ 0 means in front of VP). World units.
 * @property {number} distRP   Signed lateral distance from the Profile Plane along the fold line (Z ≥ 0 = right of PP, Z < 0 = left of PP). World units. Negatives are valid — the point may sit either side of PP.
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
 * Canonical defaults — point in the First Quadrant, 2 units from each plane.
 * Returns a fresh object every call so reset() never shares a reference.
 * @returns {PointData}
 */
export function defaultPointData() {
  return {
    distHP: 20,   // cm — distance above HP
    distVP: 20,   // cm — distance in front of VP
    distRP: 0,    // cm — distance from PP
    quadrant: QuadrantType.Q1,
  };
}

/**
 * Resolve a PointData into the actual signed (x, y, z) world position.
 *
 * Sign convention (right-handed, Y-up Three.js):
 *   HP = XZ plane at Y = 0  →  distHP drives Y (positive = above HP)
 *   VP = YZ plane at X = 0  →  distVP drives X (positive = in front of VP / toward viewer)
 *   RP = XY plane at Z = 0  →  distRP drives Z (positive = right of PP, NEGATIVE = left of PP)
 *
 * distRP is passed straight through with its sign (it is the lateral position
 * along the fold line, not a magnitude), so a negative distRP simply places the
 * point on the far side of the profile plane. The quadrant only flips the HP/VP
 * signs (Y and X); it never touches the lateral Z.
 *
 * @param {PointData} data
 * @returns {{ x: number, y: number, z: number }}
 */
export function resolvePosition(data) {
  const { distHP, distVP, distRP, quadrant } = data;
  switch (quadrant) {
    case QuadrantType.Q1: return {  x:  distVP,  y:  distHP,  z:  distRP };
    case QuadrantType.Q2: return {  x: -distVP,  y:  distHP,  z:  distRP };
    case QuadrantType.Q3: return {  x: -distVP,  y: -distHP,  z:  distRP };
    case QuadrantType.Q4: return {  x:  distVP,  y: -distHP,  z:  distRP };
    default:              return {  x:  distVP,  y:  distHP,  z:  distRP };
  }
}
