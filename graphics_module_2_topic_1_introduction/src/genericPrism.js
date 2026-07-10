// Shape generator for N-sided regular prisms (triangular, square, pentagonal,
// hexagonal, …). Faithful port of src_csharp/GenericPrism.cs.
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
// genericPyramid.js: cache the live root declaration once, resolve tokens at
// build time so a runtime theme swap is reflected on the next rebuild.
const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Build the non-indexed, hard-edged geometry of an upright N-gon prism centred
 * on the origin: bottom face at y = −height/2, top face at y = +height/2.
 *
 * HARD EDGES (CLAUDE.md "Hard-edge geometry only" + IShape contract): the buffer
 * is NON-INDEXED — every triangle carries its own three vertices, so no position
 * is shared across faces even where the top cap, bottom cap, and a side wall meet
 * at the same rim corner. The C# source spends three separate vertex sets to get
 * this; here the equivalent is simply never welding positions into a shared index.
 * computeVertexNormals() then yields exact per-face normals (top +Y, bottom −Y,
 * each side radially outward), the basis for clean edge extraction in
 * meshAnalyzer.js and the crisp technical look. meshAnalyzer welds the doubled rim
 * back together by world position for projection drawing — the mesh stays hard.
 *
 * ALIGNMENT (PolygonAlignment.PRISM): faithful port of GenericPrism.cs::GetAngle —
 * N=4 → π/4 (diamond, edges along all four axes); other even N → π/N; odd N → 0.
 * Unlike pyramids this is NOT flat-edge-front, but it matches the prototype and is
 * acceptable: a prism's HP/VP projections are dominated by its top/bottom polygon
 * faces, not the side rim (see genericSolid.PolygonAlignment).
 *
 * HANDEDNESS — winding ports VERBATIM, no sign flips (CLAUDE.md: treat every
 * ported sign as suspect, but re-derive rather than assume). Vertex POSITIONS are
 * identical numbers in both systems, and the C# winding, evaluated under Three.js's
 * right-handed cross(b−a, c−a), already yields outward normals. Worked check —
 * square prism, baseLength=2: the top-cap fan triangle (v0, v2, v1) gives a normal
 * of (0, +2R², 0) → +Y (up ✓). The same cancellation that holds for the pyramid
 * base holds here. Re-verify visually if the cap/side vertex order ever changes.
 *
 * @param {number} sides       N ≥ 3.
 * @param {number} baseLength  Polygon edge length, world units.
 * @param {number} height      Bottom-to-top height, world units.
 * @returns {THREE.BufferGeometry} Non-indexed, with computed flat normals.
 */
function buildPrismGeometry(sides, baseLength, height) {
  const radius = circumradius(sides, baseLength);
  const halfHeight = height / 2;

  // Corner of the N-gon at vertex index i (wraps past N cleanly — see
  // polygonVertexAngle) lifted to the given y level. PRISM alignment baked in.
  const cornerAt = (i, y) => {
    const angle = polygonVertexAngle(sides, i, PolygonAlignment.PRISM);
    return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
  };

  const top = Array.from({ length: sides }, (_, i) => cornerAt(i, halfHeight));
  const bottom = Array.from({ length: sides }, (_, i) => cornerAt(i, -halfHeight));

  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Top cap — fan from corner 0: (0, i+1, i) → N−2 triangles, +Y normal.
  for (let i = 1; i < sides - 1; i++) {
    pushTriangle(top[0], top[i + 1], top[i]);
  }

  // Bottom cap — fan from corner 0 with reversed winding: (0, i, i+1) → −Y normal.
  for (let i = 1; i < sides - 1; i++) {
    pushTriangle(bottom[0], bottom[i], bottom[i + 1]);
  }

  // Side walls — one rectangular face per base edge, split along the BL→TR
  // diagonal. cornerAt(i+1) wraps the last edge's far corner back to corner 0.
  for (let i = 0; i < sides; i++) {
    const bl = cornerAt(i, -halfHeight);
    const tl = cornerAt(i, halfHeight);
    const tr = cornerAt(i + 1, halfHeight);
    const br = cornerAt(i + 1, -halfHeight);
    pushTriangle(bl, tl, tr); // lower-left triangle
    pushTriangle(bl, tr, br); // upper-right triangle
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create an {@link import('./iShape.js').IShape} generator for an N-sided prism.
 * Mirrors the C# `new GenericPrism(numberOfSides)` constructor: bind the side
 * count once, then call the returned function with ShapeData on every rebuild
 * (the closure is the equivalent of `GenericPrism.Generate(data)`).
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
export function createGenericPrism(sides) {
  return function generate(data) {
    const geometry = buildPrismGeometry(sides, data.baseLength, data.height);

    const material = new THREE.MeshPhongMaterial({
      color: cssColor('--color-solid-fill'),
      shininess: 0,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${sides}-sided prism`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;

    // Position + rotation = the C# PostProcessShape step. Centre the solid so its
    // bottom sits distHP clear of HP (XZ) and its near face distVP clear of VP
    // (YZ); geometry is origin-centred, hence the half-extent offsets. main.js's
    // seatOnPlanes() refines this from the rotated extents, but the upright
    // placement is the IShape contract's responsibility.
    mesh.position.set(
      data.distVP + data.baseLength / 2,
      data.distHP + data.height / 2,
      0,
    );
    applyShapeTransform(mesh, data);

    return mesh;
  };
}
