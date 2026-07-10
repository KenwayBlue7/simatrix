// Ported from src_csharp/ShapeData.cs. Stores raw degree/length values only —
// handedness corrections (e.g. negating angleVP for Three.js right-handed Y-up)
// live in the rotation layer, not here. See CLAUDE.md "3D engineering gotchas".

/**
 * @typedef {Object} ShapeData
 * @property {string} shape       One of the {@link ShapeType} values.
 * @property {number} baseLength  Base edge length (or diameter for Cone/Cylinder), world units.
 * @property {number} height      Vertical extent from base to top/apex, world units.
 * @property {number} distHP      Offset from the Horizontal Plane (HP = XZ plane at Y=0), world units.
 * @property {number} distVP      Offset from the Vertical Plane   (VP = YZ plane at X=0), world units.
 * @property {number} angleHP     Inclination to HP — tilt about X-axis, degrees.
 * @property {number} angleVP     Inclination to VP — lean about Z-axis, degrees (raw; rotation layer applies any sign correction).
 * @property {number} rotationY   Spin about the vertical axis, degrees.
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
    angleHP: 0,
    angleVP: 0,
    rotationY: 0,
  };
}
