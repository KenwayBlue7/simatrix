// Shape generator for N-sided regular pyramids (triangular, square, pentagonal,
// hexagonal, …). Faithful port of src_csharp/GenericPyramid.cs.
//
// Layering (CLAUDE.md "Cross-cutting rules"): a generator may import the pure
// math layer (genericSolid) and the shared transform helper (iShape) — nothing
// else. It does NOT import sibling generators, the analyser, or main.js. main.js
// owns the scene graph and the disposal contract; this module just hands back a
// fully configured, un-parented Object3D per the IShape contract in iShape.js.

import * as THREE from 'three';

import {
  circumradius,
  polygonVertexAngle,
  PolygonAlignment,
} from './genericSolid.js';
import { applyShapeTransform } from './iShape.js';

// Colours come from CSS custom properties, never hard-coded — DESIGN.md is the
// single source of truth (CLAUDE.md "Cross-cutting rules"). Same helper shape as
// main.js: cache the live root declaration once, resolve tokens at build time so
// a runtime theme swap is reflected on the next rebuild.
const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Build the non-indexed, hard-edged geometry of an upright N-gon pyramid centred
 * on the origin: base at y = −height/2, apex at y = +height/2.
 *
 * HARD EDGES (CLAUDE.md "Hard-edge geometry only" + IShape contract):
 * the buffer is NON-INDEXED — every triangle carries its own three vertices, so
 * no position is shared across faces. computeVertexNormals() then yields exact
 * per-face normals (base points straight down, each slant face points outward),
 * which is what gives clean edge extraction in meshAnalyzer.js and the crisp
 * technical look. An indexed mesh would weld the rim and smooth-shade it.
 *
 * FLAT EDGE FRONT (PolygonAlignment.FLAT_EDGE_FRONT): corners are placed with the
 * pyramid's per-N offset so a flat base EDGE — never a corner — faces the viewer.
 * This is load-bearing for the rotation hierarchy: angleHP pivots about that front
 * edge, so the front slant FACE tilts toward HP. With a corner at front, angleHP
 * would tip a single vertex, which is wrong for "Face Inclination HP" (CLAUDE.md).
 *
 * Odd-N handedness note: genericSolid's FLAT_EDGE_FRONT offset for N=3 and N=5 is
 * −π/2, NOT the +π/2 of the C# source. Unity's camera sits at −Z, this sim's at
 * +Z, so the sign flips (CLAUDE.md: "every negative sign in the Unity code is
 * suspect"); +π/2 would put a VERTEX at +Z (corner-front). Verified against the
 * rendered pyramids. N=4/6 are Z-symmetric. The offset lives in
 * genericSolid.alignmentOffset — revisit it there, not here, if the camera ever
 * moves to the −Z side.
 *
 * HANDEDNESS — winding ports VERBATIM, no sign flips. The C# was authored for
 * Unity (left-handed); Three.js is right-handed (CLAUDE.md: treat every ported
 * sign as suspect). Here the vertex POSITIONS are identical numbers in both
 * systems, and the triangle winding was re-derived (not copied) against the
 * right-hand rule: for the worked square pyramid the base triangle (c0,c1,c2)
 * gives normal (0,−2,0) → −Y (down ✓) and the front slant triangle
 * (apex,c1,c0) gives (0,+1,+4.2) → outward + up ✓. So Unity's winding already
 * produces correct outward normals under Three.js's convention — the two flips
 * (handedness AND front-face winding) cancel. Re-verify visually if anything in
 * the corner/apex order changes.
 *
 * @param {number} sides       N ≥ 3.
 * @param {number} baseLength  Polygon edge length, world units.
 * @param {number} height      Base-to-apex height, world units.
 * @returns {THREE.BufferGeometry} Non-indexed, with computed flat normals.
 */
function buildPyramidGeometry(sides, baseLength, height) {
  const radius = circumradius(sides, baseLength);
  const halfHeight = height / 2;

  // Base corners on the lower polygon, CCW with the flat-edge-front offset baked
  // in by polygonVertexAngle. Computed once and reused; copying a corner into
  // several triangles does not violate the hard-edge rule (the BUFFER stays
  // non-indexed — each triangle still owns its own vertex slots).
  const corners = Array.from({ length: sides }, (_, i) => {
    const angle = polygonVertexAngle(sides, i, PolygonAlignment.FLAT_EDGE_FRONT);
    return [Math.cos(angle) * radius, -halfHeight, Math.sin(angle) * radius];
  });
  const apex = [0, halfHeight, 0];

  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Base face — fan from corner 0: (0,1,2), (0,2,3), … → N−2 triangles, −Y normal.
  for (let i = 1; i < sides - 1; i++) {
    pushTriangle(corners[0], corners[i], corners[i + 1]);
  }

  // Side faces — one triangle per base edge: apex + the edge's two corners.
  // Order (apex, next, current) gives the outward normal derived above; the
  // modulo wraps the last edge's far corner back to corner 0.
  for (let i = 0; i < sides; i++) {
    pushTriangle(apex, corners[(i + 1) % sides], corners[i]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create an {@link import('./iShape.js').IShape} generator for an N-sided
 * pyramid. Mirrors the C# `new GenericPyramid(numberOfSides)` constructor: bind
 * the side count once, then call the returned function with ShapeData on every
 * rebuild (the closure is the equivalent of `GenericPyramid.Generate(data)`).
 *
 * The returned generator satisfies the IShape contract end to end: builds
 * hard-edge non-indexed geometry, applies the flat CAD MeshPhongMaterial
 * (shininess 0, polygonOffset so the edge overlay does not z-fight), positions
 * the solid clear of the HP/VP planes, and routes rotation through the single
 * canonical applyShapeTransform call. It returns the mesh un-parented — main.js's
 * rebuild() owns adding it to shapeGroup and the disposal contract.
 *
 * @param {number} sides  Base side count, integer ≥ 3 (3=triangular … 6=hexagonal).
 * @returns {import('./iShape.js').IShape}
 */
export function createGenericPyramid(sides) {
  return function generate(data) {
    const geometry = buildPyramidGeometry(sides, data.baseLength, data.height);

    const material = new THREE.MeshPhongMaterial({
      color: cssColor('--color-solid-fill'),
      shininess: 0,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${sides}-sided pyramid`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // Position + rotation = the C# PostProcessShape step. Centre the solid so its
    // bottom sits distHP clear of HP (XZ) and its near face distVP clear of VP
    // (YZ); geometry is origin-centred, hence the half-extent offsets. Rotation
    // (Euler order + angleVP sign flip) lives entirely in applyShapeTransform.
    mesh.position.set(
      data.distVP + data.baseLength / 2,
      data.distHP + data.height / 2,
      0,
    );
    applyShapeTransform(mesh, data);

    return mesh;
  };
}
