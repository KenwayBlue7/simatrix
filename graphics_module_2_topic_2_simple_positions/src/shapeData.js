// Ported from src_csharp/ShapeData.cs. Stores raw length/degree values only.
//
// SIMPLE-POSITIONS BUILD: this clone enforces the engineering definition of a
// "simple position" — the solid's axis is always PERPENDICULAR to one reference
// plane and PARALLEL to the other, so it is never inclined. The master build's
// `angleHP`/`angleVP` tilt fields are therefore removed; the only "lay-down" is the
// discrete `restingPlane` choice (HP ⇒ axis vertical, VP ⇒ axis horizontal), which
// the rotation layer derives into a fixed pose. Base ORIENTATION (turn about the
// axis + orient-to-corner) is retained. See CLAUDE.md "3D engineering gotchas".

/**
 * @typedef {Object} ShapeData
 * @property {string} shape       One of the {@link ShapeType} values.
 * @property {number} baseLength  Base edge length (or diameter for Cone/Cylinder), world units.
 * @property {number} height      Vertical extent from base to top/apex, world units.
 * @property {number} distHP      Offset from the Horizontal Plane (HP = XZ plane at Y=0), world units.
 * @property {number} distVP      Offset from the Vertical Plane   (VP = YZ plane at X=0), world units.
 * @property {'HP'|'VP'} restingPlane  Which plane the base rests on. HP ⇒ axis vertical
 *                                (⟂ HP); VP ⇒ axis horizontal (⟂ VP). No free tilt.
 * @property {'nearest'|'axis'} distVPRef  How `distVP` is measured: to the solid's
 *                                nearest point (default) or to its central axis. Only
 *                                differs for a turned solid; see seatOnPlanes() in main.js.
 * @property {number} rotationY   Spin about the solid's own axis (base orientation), degrees.
 */

export const ShapeType = Object.freeze({
  Cube: 'Cube',
  Pyramid: 'Pyramid',
  Cylinder: 'Cylinder',
  Cone: 'Cone',
  TriangularPrism: 'TriangularPrism',
  SquarePrism: 'SquarePrism',
  PentagonalPrism: 'PentagonalPrism',
  HexagonalPrism: 'HexagonalPrism',
  TriangularPyramid: 'TriangularPyramid',
  PentagonalPyramid: 'PentagonalPyramid',
  HexagonalPyramid: 'HexagonalPyramid',
});

/**
 * Canonical default shape state — a 2×2×2 cube positioned 1 unit clear of each plane.
 * Returns a fresh object every call so slider mutations and `simAPI.reset()` never
 * share a reference with the canonical defaults.
 * @returns {ShapeData}
 */
export function defaultShapeData() {
  return {
    shape: ShapeType.Cube,
    baseLength: 2.0,
    height: 2.0,
    distHP: 1.0,
    distVP: 1.0,
    restingPlane: 'HP',
    distVPRef: 'nearest',
    rotationY: 0,
  };
}
