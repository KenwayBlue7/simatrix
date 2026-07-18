// Shape generator for the cylinder. Faithful port of src_csharp/Cylinder.cs.
// A cylinder is the limiting case of a prism as N → ∞; here it is approximated
// with a fixed SEGMENTS-sided circular cross-section.
//
// Layering (CLAUDE.md "Cross-cutting rules"): a generator may import the pure
// math layer (genericSolid) and the shared transform helper (iShape) — nothing
// else. This one needs no genericSolid math (the cross-section is radius-based,
// not edge-length-based), so it imports only THREE + iShape. It returns a fully
// configured, un-parented Object3D per the IShape contract in iShape.js.

import * as THREE from 'three';

import { applyShapeTransform } from './iShape.js';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Number of triangular segments approximating the circular cross-section.
 * 24 matches the C# prototype — a good smooth/cheap balance.
 */
const SEGMENTS = 24;

/**
 * Build the non-indexed, hard-edged geometry of an upright cylinder centred on
 * the origin: bottom cap at y = −height/2, top cap at y = +height/2, radius from
 * the Y-axis in the XZ plane.
 *
 * HARD EDGES (CLAUDE.md "Hard-edge geometry only" + IShape contract): the buffer
 * is NON-INDEXED — the rim is authored THREE times (top cap, bottom cap, side
 * wall) with identical positions but never welded, so the top/bottom caps keep
 * ±Y normals while the wall keeps radially-outward normals. That separation is
 * what gives a clean circle in HP and a clean rectangle in VP; sharing the rim
 * would smooth-shade it and blur both projections. meshAnalyzer.js welds the
 * coincident rim endpoints back together by world position (CLAUDE.md "Quantized
 * edge welding") so the projection draws a single rim line, not a doubled one.
 *
 * HANDEDNESS — winding ports VERBATIM from the C# (CLAUDE.md: every ported sign
 * is suspect, but re-derive rather than flip blindly). Positions are identical
 * numbers in both systems, and the C# winding under Three.js's right-handed
 * cross(b−a, c−a) already yields outward normals — the same cancellation proven
 * for the prism caps. Re-verify visually if any vertex order below changes.
 *
 * @param {number} radius      Cross-section radius (baseLength / 2), world units.
 * @param {number} height      Cap-to-cap height, world units.
 * @returns {THREE.BufferGeometry} Non-indexed, with computed flat normals.
 */
function buildCylinderGeometry(radius, height) {
  const halfHeight = height / 2;

  // Rim point at segment i, lifted to y. Modulo wraps the closing seam back to 0.
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

  // Bottom cap — fan from centre with reversed winding: (centre, current, next) → −Y.
  for (let i = 0; i < SEGMENTS; i++) {
    pushTriangle(bottomCenter, rim(i, -halfHeight), rim(i + 1, -halfHeight));
  }

  // Side wall — one quad per segment, split along the diagonal, radially outward.
  for (let i = 0; i < SEGMENTS; i++) {
    const topCur = rim(i, halfHeight);
    const topNext = rim(i + 1, halfHeight);
    const botCur = rim(i, -halfHeight);
    const botNext = rim(i + 1, -halfHeight);
    pushTriangle(botCur, topCur, botNext); // lower-left triangle
    pushTriangle(topCur, topNext, botNext); // upper-right triangle
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * {@link import('./iShape.js').IShape} generator for a cylinder. Mirrors
 * `Cylinder.Generate(data)`: baseLength is the DIAMETER, so the radius is half.
 *
 * Satisfies the IShape contract end to end — hard-edge non-indexed geometry, flat
 * CAD MeshPhongMaterial (shininess 0, polygonOffset against edge z-fighting),
 * upright placement clear of HP/VP, and the single canonical applyShapeTransform.
 * Returned un-parented; main.js's rebuild() owns parenting and disposal.
 *
 * @param {import('./shapeData.js').ShapeData} data
 * @returns {THREE.Mesh}
 */
export function createCylinder(data) {
  const radius = data.baseLength / 2;
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

  // Upright centring per the IShape contract; main.js's seatOnPlanes() refines it
  // from the rotated extents. baseLength is the diameter, so the X half-extent is
  // the radius — same value as baseLength / 2.
  mesh.position.set(
    data.distVP + radius,
    data.distHP + data.height / 2,
    0,
  );
  applyShapeTransform(mesh, data);

  return mesh;
}
