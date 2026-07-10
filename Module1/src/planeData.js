// planeData.js — pure data layer for Lesson 1 (The two reference planes).
//
// Lesson 1 shows a FIXED two-plane scene (teal HP floor + amber VP wall meeting at
// the xy fold line), so there are no positional parameters to store. This module
// exists for engine-contract parity: the shared engine (src/engine.js) requires a
// defaultData() function — it seeds initSim and is re-applied by simAPI.reset().
// It also leaves a home for any future highlight state. No Three.js, no side effects.

/**
 * Canonical default for the planes lesson. Returns a fresh object every call so
 * reset() never shares a reference (mirrors defaultPointData in pointData.js).
 * @returns {{}}
 */
export function defaultPlaneData() {
  return {};
}

/**
 * Resolve plane data into a render model. There is nothing to resolve for a fixed
 * scene, so this is the identity. Kept for pattern parity with resolvePosition();
 * intro.js may omit it entirely (the engine falls back to identity).
 * @param {{}} data
 * @returns {{}}
 */
export function resolvePlanes(data) {
  return data;
}
