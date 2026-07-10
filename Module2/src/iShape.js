// Ported from src_csharp/IShape.cs.
// Defines the shape-generator contract and the one shared helper that bakes
// CLAUDE.md's transform gotchas (Euler order + sign correction) into a
// single canonical call site — individual shape modules do not re-derive.

import * as THREE from 'three';

const DEG2RAD = Math.PI / 180;

// Scratch objects for the restingPlane = 'VP' re-composition (avoid per-rebuild allocation).
// The lay-down is a fixed −90° roll about Z, so it is built once.
const _euler = new THREE.Euler(0, 0, 0, 'ZXY');
const _spin = new THREE.Quaternion();
const _tilt = new THREE.Quaternion();
const _layDownVP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);

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
 * restingPlane FOUNDATION (added for the dual-inclination template):
 *   • 'HP' (default) — the canonical pose above, applied VERBATIM. Zero change to
 *     every existing solid, the worked example, and all projection math.
 *   • 'VP' — lay the base onto the VP as a foundation the inclination tilts FROM
 *     ("lay down first, then tilt from there"). Re-compose the SAME spin + tilt with a
 *     fixed 90° lay-down inserted between them:
 *         Q = tilt(world X/Z) · layDown(−90° about Z) · spin(own +Y axis)
 *     so "turn about the axis" still spins about the solid's OWN axis (applied to the
 *     canonical geometry first), the lay-down carries axis +Y → +X (axis horizontal, ⟂ VP)
 *     and the base (XZ) into the VP (YZ), and angleHP/angleVP then incline the laid-down
 *     solid about the world axes. Folding the 90° into angleVP instead would tilt THEN lay
 *     down (the wrong order). CLAUDE.md: signs/order re-derived visually (square pyramid +
 *     a VP-laid prism), never copied.
 *
 * @param {import('three').Object3D} obj  Mesh or Group to rotate in place.
 * @param {ShapeData} data
 */
export function applyShapeTransform(obj, data) {
  obj.rotation.order = 'ZXY';

  // HP (default): the canonical single-Euler pose, untouched.
  if (data.restingPlane !== 'VP') {
    obj.rotation.set(
      data.angleHP * DEG2RAD,
      data.rotationY * DEG2RAD,
      -data.angleVP * DEG2RAD,
    );
    return;
  }

  // VP: spin about the solid's own axis, lay the base onto the VP, then tilt from there.
  // Setting obj.quaternion keeps obj.rotation in sync (Three.js onChange), so downstream
  // mesh.quaternion reads (seating, edge overlay) stay correct.
  _spin.setFromEuler(_euler.set(0, data.rotationY * DEG2RAD, 0));
  _tilt.setFromEuler(_euler.set(data.angleHP * DEG2RAD, 0, -data.angleVP * DEG2RAD));
  obj.quaternion.copy(_tilt).multiply(_layDownVP).multiply(_spin);
}
