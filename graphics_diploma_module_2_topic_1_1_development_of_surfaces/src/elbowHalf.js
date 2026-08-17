// Shape generator for the 3D View step's two-piece 90° elbow (ADR-097/ADR-112 addenda,
// 2026-08-05). NEW BUILD — no existing elbow mesh anywhere on the platform (confirmed by
// audit: neither Module2's family nor the KTU-track `graphics_module_3_topic_2_development_
// of_surfaces` 3D-renders an elbow-adjacent shape). Not a copy of anything.
//
// Reuses constructions.js's `cutHeight(theta, legShort, r) = legShort + r + r·cos(theta)`
// MATH ONLY (re-derived below in this file's own local frame), not its code — that
// function lives in the 2D front-view's own local coordinate frame and is not exported;
// this file needs the same plane-intersection relationship in a 3D world frame instead.
//
// --- The 45° mitre plane, derived once here (see file-level comment, not per-call) ---
// Both legs sit in world space with their axes along the X and Y axes respectively (the
// bend lives in the XY plane, matching the front view; Z is the "into the page" depth
// every generator's circular cross-section runs through). Working out where each leg's
// slanted rim must sit so the two pieces meet exactly (no CSG, a real coincident-face butt
// join) reduces to ONE relation for both legs: rim height on the piece's own AXIS equals
// its CROSS-SECTION coordinate at that generator angle — i.e. the plane X=Y (Z free) is
// the mitre for both. That is not a coincidence: X=Y is precisely the 45°-bisector plane
// between the +Y-axis leg and the +X-axis leg, which is what a real mitred round-pipe bend
// cuts to. `buildLegGeometry()` below builds ONE leg (flat cap at `capSign·(radius +
// legShort)` on its own axis, slanted rim at `radius·cos(angle)` on that same axis) and is
// called twice — once per axis — which is what makes the two rims coincide on that shared
// plane with zero extra alignment code, the geometric analogue of `constructions.js`'s
// front-view corner algebra.
//
// Basic pass only (out of scope this pass, per plan): no meshAnalyzer numbering, no
// truncation UI. `material.side = THREE.DoubleSide` is a deliberate safety margin — a
// first-pass hand-derived winding on a genuinely new (not ported) generator is exactly the
// kind of thing CLAUDE.md says to re-verify visually; DoubleSide removes "a wrongly-wound
// face renders black" as a failure mode while that visual check happens, at negligible
// cost for two small meshes.

import * as THREE from 'three';

const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

const SEGMENTS = 24;

/**
 * One mitred cylinder half: axis along 'x' or 'y', a flat circular cap at
 * `capSign · (radius + legShort)` on that axis, and a slanted rim (the 45° mitre) at
 * `radius · cos(angle)` on the SAME axis — see file header for why this single relation is
 * enough to make two legs (one per axis) meet exactly.
 *
 * @param {number} radius
 * @param {number} legShort  the piece's own SHORT-wall leg length (its flat end to the
 *   mitre's nearest point) — matches constructions.js's `legShort` naming.
 * @param {1|-1} capSign  which direction along `axis` the flat cap sits (+ far / − far).
 * @param {'x'|'y'} axis
 * @returns {THREE.BufferGeometry} non-indexed, hard-edged (see cylinder.js for why).
 */
function buildLegGeometry(radius, legShort, capSign, axis) {
  const far = radius + legShort;
  const capVal = capSign * far;
  const rim = (angle) => radius * Math.cos(angle);

  /** World-space point for a given axis coordinate + cross-section angle. */
  const point = (axisVal, angle) => {
    const c = radius * Math.cos(angle);
    const s = radius * Math.sin(angle);
    return axis === 'y' ? [c, axisVal, s] : [axisVal, c, s];
  };
  const center = (axisVal) => (axis === 'y' ? [0, axisVal, 0] : [axisVal, 0, 0]);

  const angleAt = (i) => ((i % SEGMENTS) / SEGMENTS) * Math.PI * 2;

  const positions = [];
  const pushTriangle = (a, b, c) => {
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };

  // Flat cap — fan from centre. Winding follows the SAME +/− convention cylinder.js uses
  // (DoubleSide backstops any first-pass sign miss — see file header).
  const capCenter = center(capVal);
  for (let i = 0; i < SEGMENTS; i++) {
    const a = point(capVal, angleAt(i));
    const b = point(capVal, angleAt(i + 1));
    if (capSign > 0) pushTriangle(capCenter, b, a);
    else pushTriangle(capCenter, a, b);
  }

  // Side wall — one quad per segment between the flat cap ring and the slanted mitre rim,
  // split along the diagonal (cylinder.js's own side-wall pattern).
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = angleAt(i);
    const a1 = angleAt(i + 1);
    const botCur = point(capVal, a0);
    const botNext = point(capVal, a1);
    const topCur = point(rim(a0), a0);
    const topNext = point(rim(a1), a1);
    pushTriangle(botCur, topCur, botNext);
    pushTriangle(topCur, topNext, botNext);
  }

  // Mitre cap — fan closing the slanted rim, from its own (approximate, ring-average)
  // centroid. The rim is planar (see file header), so any interior point works as a fan
  // origin; the average of the ring is a convenient one.
  const ring = [];
  for (let i = 0; i < SEGMENTS; i++) ring.push(point(rim(angleAt(i)), angleAt(i)));
  const centroid = ring.reduce((acc, p) => [acc[0] + p[0] / SEGMENTS, acc[1] + p[1] / SEGMENTS, acc[2] + p[2] / SEGMENTS], [0, 0, 0]);
  for (let i = 0; i < SEGMENTS; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % SEGMENTS];
    if (capSign > 0) pushTriangle(centroid, a, b);
    else pushTriangle(centroid, b, a);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Two-piece 90° elbow — a vertical leg (axis Y, flat end hanging down) mitred into a
 * horizontal leg (axis X, flat end extending right), joined on the shared 45° plane
 * `buildLegGeometry()` guarantees (see file header). Matches constructions.js's
 * `buildElbow()` parametrisation: `diameter`, `legLength` (the SHORT leg).
 *
 * @param {{diameter:number, legLength:number}} data
 * @returns {THREE.Mesh[]} two un-parented meshes; main.js's shapeGroup owns disposal.
 */
export function createElbow(data) {
  const r = data.diameter / 2;
  const legShort = data.legLength;

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    side: THREE.DoubleSide, // see file header — safety margin for a first-pass hand-wound generator
  });

  const vertical = new THREE.Mesh(buildLegGeometry(r, legShort, -1, 'y'), material);
  vertical.name = 'elbow-vertical';
  vertical.castShadow = false;
  vertical.receiveShadow = false;

  const horizontal = new THREE.Mesh(buildLegGeometry(r, legShort, 1, 'x'), material.clone());
  horizontal.name = 'elbow-horizontal';
  horizontal.castShadow = false;
  horizontal.receiveShadow = false;

  return [vertical, horizontal];
}
