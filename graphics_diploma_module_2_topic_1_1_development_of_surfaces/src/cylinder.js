// Shape generator for the 3D View step's cylinder (ADR-097/ADR-112 addenda, 2026-08-05) —
// copied fresh from Module2/src/cylinder.js, NOT byte-identical-shared under RULES §7.2
// (scoped to the Module-2 family, ARCHITECTURE.md §7 — this Diploma track sits outside
// it). Same precedent as this topic's own developmentEngine.js/genericSolid.js copies
// (ADR-112 §2): free to drift.
//
// Departures from the Module2 original: parameter is `diameter` (matching this topic's own
// constructions.js `buildCylinder()`), not `baseLength`; no `iShape.js` import /
// `applyShapeTransform` / `distVP`/`distHP` seating — this topic has no HP/VP glass-box
// mechanics, so the mesh is simply centred on the origin for orbiting (see cube.js's own
// header for the fuller version of this reasoning).
//
// Geometry-building logic (buildCylinderGeometry) ported unchanged — hard-edge non-indexed
// triple-authored rim (top cap / bottom cap / side wall), same reasoning as the original:
// a shared/welded rim would smooth-shade across the cap/wall seam and blur both silhouette
// edges.

import * as THREE from 'three';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/** Number of triangular segments approximating the circular cross-section. */
const SEGMENTS = 24;

/**
 * Non-indexed, hard-edged geometry of an upright cylinder centred on the origin: bottom
 * cap at y = -height/2, top cap at y = +height/2, radius from the Y-axis in the XZ plane.
 *
 * @param {number} radius
 * @param {number} height
 * @returns {THREE.BufferGeometry}
 */
function buildCylinderGeometry(radius, height) {
  const halfHeight = height / 2;

  const rim = (i, y) => {
    const angle = ((i % SEGMENTS) / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  };

  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  const topCenter = [0, halfHeight, 0];
  const bottomCenter = [0, -halfHeight, 0];

  // Top cap — fan from centre: (centre, next, current) → +Y normal.
  for (let i = 0; i < SEGMENTS; i++) {
    pushTriangle(topCenter, rim(i + 1, halfHeight), rim(i, halfHeight));
  }

  // Bottom cap — fan from centre with reversed winding: (centre, current, next) → -Y.
  for (let i = 0; i < SEGMENTS; i++) {
    pushTriangle(bottomCenter, rim(i, -halfHeight), rim(i + 1, -halfHeight));
  }

  // Side wall — one quad per segment, split along the diagonal, radially outward.
  for (let i = 0; i < SEGMENTS; i++) {
    const topCur = rim(i, halfHeight);
    const topNext = rim(i + 1, halfHeight);
    const botCur = rim(i, -halfHeight);
    const botNext = rim(i + 1, -halfHeight);
    pushTriangle(botCur, topCur, botNext);
    pushTriangle(topCur, topNext, botNext);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * @param {{diameter:number, height:number}} data
 * @returns {THREE.Mesh}
 */
export function createCylinder(data) {
  const radius = data.diameter / 2;
  const geometry = buildCylinderGeometry(radius, data.height);

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cylinder';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Centred at the origin — no HP/VP seating in this topic (see file header).
  mesh.position.set(0, 0, 0);

  return mesh;
}
