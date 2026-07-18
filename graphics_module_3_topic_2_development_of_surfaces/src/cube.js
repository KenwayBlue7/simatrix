// Shape generator for the cube (and, with height ≠ baseLength, a rectangular
// box). Port of src_csharp/Cube.cs.
//
// The C# leaned on Unity's primitive cube + transform.localScale. The Three.js
// equivalent is BoxGeometry sized directly — no post-scale needed. BUT Unity's
// primitive has SMOOTH (shared) vertex normals, which would violate CLAUDE.md's
// hard-edge rule; THREE.BoxGeometry is indexed and per-face for normals yet still
// shares position indices, so we call .toNonIndexed() to expand it into 36
// independent vertices. That gives the clean per-face normals and crisp edge
// extraction (meshAnalyzer.js) the IShape contract requires — the deliberate
// departure flagged in the C# "When to Use Custom Mesh Instead: need hard-edge
// control" note.
//
// Layering (CLAUDE.md "Cross-cutting rules"): imports only THREE + the shared
// transform helper. Returns a fully configured, un-parented Object3D.

import * as THREE from 'three';

import { applyShapeTransform } from './iShape.js';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * {@link import('./iShape.js').IShape} generator for a cube.
 *
 * Dimensions match the C# scale vector (baseLength, height, baseLength): the
 * square base lies in the XZ plane, height extends along Y. For a true cube the
 * UI locks height to baseLength; an unequal height yields a rectangular box,
 * which the generator allows (the constraint is a UI concern, per Cube.cs).
 *
 * Satisfies the IShape contract end to end — hard-edge non-indexed geometry, flat
 * CAD MeshPhongMaterial (shininess 0, polygonOffset against edge z-fighting),
 * upright placement clear of HP/VP, and the single canonical applyShapeTransform.
 * Returned un-parented; main.js's rebuild() owns parenting and disposal.
 *
 * @param {import('./shapeData.js').ShapeData} data
 * @returns {THREE.Mesh}
 */
export function createCube(data) {
  // BoxGeometry is centred on the origin like every other generator. toNonIndexed
  // expands the 24 indexed verts into 36 independent ones → hard edges.
  const geometry = new THREE.BoxGeometry(
    data.baseLength,
    data.height,
    data.baseLength,
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
  mesh.name = 'cube';
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  // Upright centring per the IShape contract; main.js's seatOnPlanes() refines it
  // from the rotated extents.
  mesh.position.set(
    data.distVP + data.baseLength / 2,
    data.distHP + data.height / 2,
    0,
  );
  applyShapeTransform(mesh, data);

  return mesh;
}
