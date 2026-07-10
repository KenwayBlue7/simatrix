// Shape generator for the cone. Faithful port of src_csharp/Cone.cs.
// A cone is the limiting case of a pyramid as N → ∞; here it is approximated
// with a fixed SEGMENTS-sided circular base converging to a single apex.
//
// Layering (CLAUDE.md "Cross-cutting rules"): a generator may import the pure
// math layer (genericSolid) and the shared transform helper (iShape) — nothing
// else. The cross-section is radius-based, so no genericSolid math is needed;
// this imports only THREE + iShape and returns a fully configured, un-parented
// Object3D per the IShape contract in iShape.js.

import * as THREE from 'three';

import { applyShapeTransform } from './iShape.js';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Number of triangular segments approximating the circular base.
 * 24 matches the C# prototype — a good smooth/cheap balance.
 */
const SEGMENTS = 24;

/**
 * Build the non-indexed, hard-edged geometry of an upright cone centred on the
 * origin: circular base at y = −height/2, apex at y = +height/2.
 *
 * HARD EDGES (CLAUDE.md "Hard-edge geometry only" + IShape contract): the buffer
 * is NON-INDEXED — the base rim is authored separately for the bottom cap (−Y
 * normals) and for each side triangle (outward normals), so the base circle and
 * the slant surface meet at a hard edge. That keeps the circle crisp in HP and
 * the triangle crisp in VP. meshAnalyzer.js welds the coincident rim endpoints
 * back together by world position so the projection draws one rim line.
 *
 * Note the cone apex is genuinely shared geometry (all side triangles meet at the
 * point), but each side triangle still owns its own apex vertex slot in the
 * non-indexed buffer — so flat per-face normals survive.
 *
 * HANDEDNESS — winding ports VERBATIM from the C# (CLAUDE.md: every ported sign is
 * suspect, but re-derive rather than flip blindly). Positions are identical
 * numbers in both systems, and the C# winding under Three.js's right-handed
 * cross(b−a, c−a) already yields outward normals — the same cancellation proven
 * for the pyramid. Re-verify visually if any vertex order below changes.
 *
 * @param {number} radius      Base radius (baseLength / 2), world units.
 * @param {number} height      Base-to-apex height, world units.
 * @returns {THREE.BufferGeometry} Non-indexed, with computed flat normals.
 */
function buildConeGeometry(radius, height) {
  const halfHeight = height / 2;

  // Base rim point at segment i. Modulo wraps the closing seam back to 0.
  const rim = (i) => {
    const angle = ((i % SEGMENTS) / SEGMENTS) * Math.PI * 2;
    return [Math.cos(angle) * radius, -halfHeight, Math.sin(angle) * radius];
  };

  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  const baseCenter = [0, -halfHeight, 0];
  const apex = [0, halfHeight, 0];

  // Bottom cap — fan from centre: (centre, current, next) → −Y normal.
  for (let i = 0; i < SEGMENTS; i++) {
    pushTriangle(baseCenter, rim(i), rim(i + 1));
  }

  // Side faces — one triangle per segment: (apex, right, left) → outward normal.
  for (let i = 0; i < SEGMENTS; i++) {
    pushTriangle(apex, rim(i + 1), rim(i));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * {@link import('./iShape.js').IShape} generator for a cone. Mirrors
 * `Cone.Generate(data)`: baseLength is the base DIAMETER, so the radius is half.
 *
 * Satisfies the IShape contract end to end — hard-edge non-indexed geometry, flat
 * CAD MeshPhongMaterial (shininess 0, polygonOffset against edge z-fighting),
 * upright placement clear of HP/VP, and the single canonical applyShapeTransform.
 * Returned un-parented; main.js's rebuild() owns parenting and disposal.
 *
 * @param {import('./shapeData.js').ShapeData} data
 * @returns {THREE.Mesh}
 */
export function createCone(data) {
  const radius = data.baseLength / 2;
  const geometry = buildConeGeometry(radius, data.height);

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cone';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Upright centring per the IShape contract; main.js's seatOnPlanes() refines it
  // from the rotated extents. baseLength is the diameter, so the X half-extent is
  // the radius.
  mesh.position.set(
    data.distVP + radius,
    data.distHP + data.height / 2,
    0,
  );
  applyShapeTransform(mesh, data);

  return mesh;
}
