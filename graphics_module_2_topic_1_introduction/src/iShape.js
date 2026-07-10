// Ported from src_csharp/IShape.cs.
// Defines the shape-generator contract and the one shared helper that bakes
// CLAUDE.md's transform gotchas (Euler order + sign correction) into a
// single canonical call site — individual shape modules do not re-derive.

const DEG2RAD = Math.PI / 180;

/** @typedef {import('./shapeData.js').ShapeData} ShapeData */

/**
 * Strategy-pattern contract every shape generator must satisfy. Mirrors the
 * C# `IShape.Generate(ShapeData)` signature, but typed via JSDoc since JS
 * has no nominal interfaces — duck-typing + this contract is the agreement.
 *
 * @callback IShape
 * @param {ShapeData} data
 * @returns {import('three').Object3D} Fully configured Object3D — NOT yet parented to the scene.
 *
 * Conforming implementations MUST:
 *   1. Build geometry as non-indexed BufferGeometry with vertices duplicated
 *      per face (CLAUDE.md "Hard-edge geometry only"). Smooth-shaded meshes
 *      break edge extraction in meshAnalyzer.js.
 *   2. Use MeshPhongMaterial with `shininess: 0` and `polygonOffset: true`
 *      so EdgesGeometry overlays do not z-fight with mesh faces.
 *   3. Set `position` from per-shape centering rules (see ShapeData.cs notes
 *      on distHP + halfHeight, distVP + halfBase, etc.).
 *   4. Call {@link applyShapeTransform} for rotation. The Euler order and
 *      angleVP sign flip are non-obvious; do not roll your own Euler.
 *   5. Leave scene parenting to the caller — `rebuild()` in main.js owns
 *      the shapeGroup and the disposal contract.
 */

/**
 * Apply the canonical engineering-graphics rotation to a shape.
 *
 * Euler order is `'ZXY'`, matching Unity's intrinsic Z→X→Y so the worked
 * square-pyramid example (baseLength=2, height=3, target=45°) ports cleanly.
 *
 * Sign note — re-derived for Three.js right-handed Y-up, NOT copied from
 * Unity. Validate visually against the worked example if any axis changes:
 *   • angleHP (X-axis tilt): positive = front face tilts down. No flip.
 *   • angleVP (Z-axis lean): NEGATED. Positive `angleVP` means "lean away
 *     from VP toward +X" per engineering convention, but a positive Z
 *     rotation in Three.js moves a top point at (0, h, 0) toward −X.
 *   • rotationY (Y-axis spin): positive = CCW viewed from above, matching
 *     engineering Top View convention. No flip.
 *
 * @param {import('three').Object3D} obj  Mesh or Group to rotate in place.
 * @param {ShapeData} data
 */
export function applyShapeTransform(obj, data) {
  obj.rotation.order = 'ZXY';
  obj.rotation.set(
    data.angleHP * DEG2RAD,
    data.rotationY * DEG2RAD,
    -data.angleVP * DEG2RAD,
  );
}
