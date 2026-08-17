// Shape generator for the 3D View step's rectangular prism (ADR-097/ADR-112 addenda,
// 2026-08-05) — copied fresh from Module2/src/cube.js, NOT byte-identical-shared under
// RULES §7.2 (that guarantee is scoped to the Module-2 family: Module2, Topic 1, Topic 2 —
// ARCHITECTURE.md §7 — which this Diploma track sits outside of). Same precedent as this
// topic's own developmentEngine.js/genericSolid.js copies (ADR-112 §2): free to drift.
//
// Two deliberate departures from the Module2 original:
//  1. Genuinely RECTANGULAR, not square-locked — this topic's prism has an independent
//     `baseWidth` (constructions.js's own Bhatt/K.C. John parametrisation), so the box's
//     depth is no longer forced equal to its width the way Module2's cube-or-box toggle
//     does it.
//  2. No `iShape.js` import / `applyShapeTransform` / `distVP`/`distHP` seating. This
//     topic has no HP/VP glass-box mechanics (that is Module 2's own pedagogy, not this
//     one's) — the 3D View step is a plain "look at the solid" preview, so the mesh is
//     simply centred on the origin for orbiting, with no fold-plane positioning system to
//     satisfy.

import * as THREE from 'three';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Rectangular prism generator — `baseLength` × `baseWidth` in plan, `height` tall,
 * matching constructions.js's `buildPrism()` parametrisation exactly (front-view edge /
 * plan depth / height), NOT Module2's square-base convention.
 *
 * Hard-edge geometry (toNonIndexed) for clean flat-shaded faces, same reasoning as the
 * Module2 original — this topic has no meshAnalyzer.js edge classifier to need it for, but
 * the visual flat-CAD look (RULES-inherited "no smooth shading") is worth keeping anyway.
 *
 * @param {{baseLength:number, baseWidth:number, height:number}} data
 * @returns {THREE.Mesh}
 */
export function createCube(data) {
  const geometry = new THREE.BoxGeometry(
    data.baseLength,
    data.height,
    data.baseWidth,
  ).toNonIndexed();

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'prism';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Centred at the origin — no HP/VP seating in this topic (see file header).
  mesh.position.set(0, 0, 0);

  return mesh;
}
