// Mesh analysis layer. Faithful port of src_csharp/MeshAnalyzer.cs.
//
// Extracts the unique edges and faces of a solid for projection drawing. The
// single innovation carried over from the C# prototype is POSITION-BASED edge
// welding: edges are identified by their world-space endpoint positions, not by
// vertex indices, so two edges that occupy the same physical location collapse
// into one map entry even though the mesh stores them as separate vertices.
// This is what stops a cylinder's cap rim (12 verts) and side wall (12 verts)
// from drawing a doubled line where they meet (CLAUDE.md "Quantized edge welding").
//
// Layering (CLAUDE.md "Cross-cutting rules"): this is the analysis layer. It
// imports only THREE; it does NOT import sibling generators, the data layer, or
// main.js. main.js calls buildEdgeMap() inside the rebuild pipeline and feeds the
// result to the (later) projection-drawing layer.
//
// PORTING NOTE — this analysis is HANDEDNESS-AGNOSTIC. Unlike the rotation code,
// there are no sign conventions to re-derive: welding compares absolute positions
// and face normals are computed fresh from those positions, so nothing here had a
// Unity sign baked in. The one substantive change from C# is the hashing strategy
// (string keys vs struct GetHashCode), forced by JS Map using reference equality
// for object keys.

import * as THREE from 'three';

/**
 * Half-edge weld tolerance in world units. Endpoints closer than this are treated
 * as the same physical point. Mirrors the 0.001 distance threshold in the C#
 * Edge.Equals — large enough to absorb float error from mesh generation and the
 * world transform, small enough never to merge genuinely distinct engineering edges.
 * @type {number}
 */
export const WELD_TOLERANCE = 1e-3;

/**
 * Zero-area-triangle floor. `nLen` (the cross-product magnitude, == twice the triangle
 * area) at or below this is treated as a DEGENERATE triangle and dropped entirely —
 * neither a {@link Face} nor its three edges enter the map.
 *
 * Why drop, not zero-out (chat diagnosis 2026-06-30): earcut triangulating the thin
 * annular caps (bore-in-body, holed foot) emits slivers and collapsed triangles (some
 * with two coincident vertices). A degenerate face carries no real surface, but if it is
 * kept its normal is meaningless; the previous code stored a (0,0,0) normal, which then
 * poisons the consumer's coplanarity test — dot(n, 0) = 0 reads as a 90° crease, so a flat
 * cap seam is misclassified "sharp" and drawn as a phantom "spiderweb" line. Dropping the
 * triangle keeps the welded map a clean manifold. The floor is far below any real triangle
 * on the part (smallest legitimate facet area ≫ 1e-6), so no genuine surface is lost.
 * @type {number}
 */
export const DEGENERATE_NORMAL_EPS = 1e-10;

// Quantization grid: 1 / WELD_TOLERANCE. Rounding each coordinate to the nearest
// 1/1000 and keying on the resulting INTEGER lattice reproduces C#'s GetHashCode
// quantization exactly, with no float-formatting ambiguity ("-0" vs "0", trailing
// digits) that a toFixed()-based string key would introduce.
const QUANT = 1000;

/**
 * An edge of the solid, defined by its two world-space endpoints rather than by
 * vertex indices. Endpoints are stored in a deterministic order (see
 * {@link buildEdgeMap}) so that the edge A→B and the edge B→A are one and the same.
 *
 * Mirrors the C# `Edge` struct, minus its GetHashCode/Equals — equality is handled
 * upstream by the quantized string map key, so the class is a plain data carrier.
 */
export class Edge {
  /**
   * @param {THREE.Vector3} p1 First endpoint (the canonically "lesser" point).
   * @param {THREE.Vector3} p2 Second endpoint (the canonically "greater" point).
   */
  constructor(p1, p2) {
    /** @type {THREE.Vector3} */
    this.p1 = p1;
    /** @type {THREE.Vector3} */
    this.p2 = p2;
  }
}

/**
 * A triangular face with the geometric properties projection analysis needs:
 * world-space normal (for front/back-facing visibility tests), centroid (for depth
 * sorting and label placement), the original vertex indices (kept for parity with
 * the C# source and any index-based consumer), and the signed plane distance.
 *
 * Mirrors the C# `Face` class.
 */
export class Face {
  /**
   * @param {THREE.Vector3} worldNormal   Outward unit normal in world space.
   * @param {THREE.Vector3} center        Centroid (average of the three vertices).
   * @param {number[]}      vertices      The triangle's three source vertex indices.
   * @param {number}        distanceToOrigin Signed distance origin→plane: n · v.
   */
  constructor(worldNormal, center, vertices, distanceToOrigin) {
    /** @type {THREE.Vector3} */
    this.worldNormal = worldNormal;
    /** @type {THREE.Vector3} */
    this.center = center;
    /** @type {number[]} */
    this.vertices = vertices;
    /** @type {number} */
    this.distanceToOrigin = distanceToOrigin;
  }
}

/**
 * One entry of the edge map: a welded {@link Edge} and every {@link Face} that
 * shares it. The face count is the classification the projection layer keys off:
 *
 * - **1 face**  → boundary / silhouette edge (always drawn).
 * - **2 faces** → internal edge (drawn only when one face is front-facing and the
 *   other back-facing, re-evaluated on orbit against the view direction).
 * - **>2 faces** → non-manifold geometry (rare in clean solid modelling).
 *
 * @typedef {Object} EdgeRecord
 * @property {Edge}   edge  The welded edge with its world-space endpoints.
 * @property {Face[]} faces The faces incident to this edge.
 */

/**
 * Build the welded edge→faces map for a mesh.
 *
 * Faithful port of `MeshAnalyzer.BuildEdgeMap`. Each triangle contributes a
 * {@link Face} and its three edges; edges that resolve to the same quantized
 * world position merge into a single {@link EdgeRecord} whose `faces` array
 * accumulates every incident face.
 *
 * The returned key is the welded edge's identity string —
 * `"qx,qy,qz|qx,qy,qz"` of the two integer-quantized endpoints in canonical
 * order — so iteration order is stable and callers can look an edge up directly.
 *
 * PERFORMANCE — this runs in the rebuild pipeline, so it is written allocation-light:
 *   • Every source vertex is transformed to world space exactly ONCE, via an inline
 *     4×4 multiply against `matrixWorld.elements`, into flat typed arrays. No
 *     per-vertex THREE.Vector3 is created (indexed meshes reuse shared verts for free).
 *   • Quantization is integer (millimetre lattice); face-loop edge keys are built by
 *     string concatenation of pre-computed per-vertex tokens — three tokens per
 *     triangle, not per edge.
 *   • THREE.Vector3 / Face objects are allocated only for surviving, unique results.
 *
 * Note this analysis depends on the model's world matrix but NOT on the camera, so
 * topology is invariant under orbit — call it on geometry/transform change (rebuild),
 * and re-run only the camera-dependent visibility classification on orbit.
 *
 * @param {THREE.BufferGeometry} geometry    Mesh geometry. Hard-edged non-indexed
 *   geometry (per the IShape contract) welds cleanly; indexed geometry is supported too.
 * @param {THREE.Matrix4} [matrixWorld]      Local→world transform. Omit (or pass an
 *   identity matrix) to analyse in local space — welding is rotation-invariant, so
 *   this is valid when only adjacency, not world position, is needed.
 * @returns {Map<string, EdgeRecord>} Welded edges keyed by identity string.
 */
export function buildEdgeMap(geometry, matrixWorld) {
  /** @type {Map<string, EdgeRecord>} */
  const edgeMap = new Map();

  const posAttr = geometry?.getAttribute('position');
  if (!posAttr) return edgeMap;

  const vertexCount = posAttr.count;

  // --- Pass 1: transform every source vertex to world space, ONCE. ----------
  // World coords kept as float (drawing needs the real positions); a parallel
  // integer lattice drives hashing. Reading the raw backing array is the fast
  // path; getX/Y/Z is the fallback for interleaved attributes.
  const world = new Float64Array(vertexCount * 3);
  const quant = new Int32Array(vertexCount * 3);

  const e = matrixWorld ? matrixWorld.elements : IDENTITY_ELEMENTS;
  const e0 = e[0], e4 = e[4], e8 = e[8], e12 = e[12];
  const e1 = e[1], e5 = e[5], e9 = e[9], e13 = e[13];
  const e2 = e[2], e6 = e[6], e10 = e[10], e14 = e[14];

  const interleaved = posAttr.isInterleavedBufferAttribute === true;
  const rawArray = interleaved ? null : posAttr.array;

  for (let i = 0; i < vertexCount; i++) {
    let lx, ly, lz;
    if (rawArray) {
      const o = i * 3;
      lx = rawArray[o];
      ly = rawArray[o + 1];
      lz = rawArray[o + 2];
    } else {
      lx = posAttr.getX(i);
      ly = posAttr.getY(i);
      lz = posAttr.getZ(i);
    }

    // Inline affine transform (w == 1; model matrices carry no perspective term).
    const wx = e0 * lx + e4 * ly + e8 * lz + e12;
    const wy = e1 * lx + e5 * ly + e9 * lz + e13;
    const wz = e2 * lx + e6 * ly + e10 * lz + e14;

    const o = i * 3;
    world[o] = wx;
    world[o + 1] = wy;
    world[o + 2] = wz;
    // | 0 truncates the rounded value to int32; +0 collapses -0 → 0 so the
    // quantized origin hashes identically regardless of float sign.
    quant[o] = Math.round(wx * QUANT) + 0;
    quant[o + 1] = Math.round(wy * QUANT) + 0;
    quant[o + 2] = Math.round(wz * QUANT) + 0;
  }

  // --- Pass 2: walk triangles, build faces, weld edges. ---------------------
  const index = geometry.getIndex();
  const indexArray = index ? index.array : null;
  const triIndexCount = indexArray ? indexArray.length : vertexCount;

  for (let t = 0; t < triIndexCount; t += 3) {
    const i1 = indexArray ? indexArray[t] : t;
    const i2 = indexArray ? indexArray[t + 1] : t + 1;
    const i3 = indexArray ? indexArray[t + 2] : t + 2;

    const a = i1 * 3, b = i2 * 3, c = i3 * 3;

    const v1x = world[a], v1y = world[a + 1], v1z = world[a + 2];
    const v2x = world[b], v2y = world[b + 1], v2z = world[b + 2];
    const v3x = world[c], v3y = world[c + 1], v3z = world[c + 2];

    // Face normal = (v2 − v1) × (v3 − v1), normalized. Computed inline to avoid
    // three temp Vector3s per triangle.
    const ux = v2x - v1x, uy = v2y - v1y, uz = v2z - v1z;
    const vx = v3x - v1x, vy = v3y - v1y, vz = v3z - v1z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    // DROP degenerate (zero-area) triangles outright — no Face, no edges (see
    // DEGENERATE_NORMAL_EPS). A kept zero-normal face would poison the consumer's
    // coplanarity dot test and draw phantom "spiderweb" seams across flat caps; a sliver
    // carries no real surface, so removing it also leaves the manifold intact.
    if (nLen <= DEGENERATE_NORMAL_EPS) continue;
    const inv = 1 / nLen;
    nx *= inv; ny *= inv; nz *= inv;

    const cx = (v1x + v2x + v3x) / 3;
    const cy = (v1y + v2y + v3y) / 3;
    const cz = (v1z + v2z + v3z) / 3;

    // Plane equation n · p = d, evaluated at v1 (any point on the plane works).
    const distanceToOrigin = nx * v1x + ny * v1y + nz * v1z;

    const face = new Face(
      new THREE.Vector3(nx, ny, nz),
      new THREE.Vector3(cx, cy, cz),
      [i1, i2, i3],
      distanceToOrigin,
    );

    // Per-vertex identity tokens, built once and reused across this triangle's
    // three edges (vs building six endpoint tokens).
    const tok1 = vertexToken(quant, a);
    const tok2 = vertexToken(quant, b);
    const tok3 = vertexToken(quant, c);

    addEdge(edgeMap, world, quant, i1, i2, tok1, tok2, face);
    addEdge(edgeMap, world, quant, i2, i3, tok2, tok3, face);
    addEdge(edgeMap, world, quant, i3, i1, tok3, tok1, face);
  }

  return edgeMap;
}

/** Identity matrix elements, reused when no transform is supplied. @type {number[]} */
const IDENTITY_ELEMENTS = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * The quantized identity token of one vertex: `"qx,qy,qz"` of its integer lattice
 * coordinates. Edges concatenate two of these into a canonical key.
 *
 * @param {Int32Array} quant Flat integer lattice (3 per vertex).
 * @param {number}      o    Pre-multiplied offset (vertexIndex * 3).
 * @returns {string}
 */
function vertexToken(quant, o) {
  return `${quant[o]},${quant[o + 1]},${quant[o + 2]}`;
}

/**
 * Add one triangle edge to the map, welding by quantized position. The endpoints
 * are ordered canonically on the integer lattice (x, then y, then z — the JS
 * equivalent of C#'s CompareVectors) so that edge (A,B) and edge (B,A) produce an
 * identical key and a single record. On first sight the welded {@link Edge} is
 * materialized from world coordinates; on a repeat the incident face is appended.
 *
 * @param {Map<string, EdgeRecord>} map
 * @param {Float64Array} world  Flat world coordinates (3 per vertex).
 * @param {Int32Array}   quant  Flat integer lattice (3 per vertex).
 * @param {number} ia           First endpoint vertex index.
 * @param {number} ib           Second endpoint vertex index.
 * @param {string} tokA         Pre-computed token for ia.
 * @param {string} tokB         Pre-computed token for ib.
 * @param {Face}   face         The face contributing this edge.
 */
function addEdge(map, world, quant, ia, ib, tokA, tokB, face) {
  const oa = ia * 3;
  const ob = ib * 3;

  // Canonical order on the lattice so the key is direction-independent.
  const aFirst = compareLattice(quant, oa, ob) <= 0;
  const key = aFirst ? `${tokA}|${tokB}` : `${tokB}|${tokA}`;

  const existing = map.get(key);
  if (existing) {
    existing.faces.push(face);
    return;
  }

  // First occurrence: store the real world endpoints in canonical order.
  const lo = aFirst ? oa : ob;
  const hi = aFirst ? ob : oa;
  const edge = new Edge(
    new THREE.Vector3(world[lo], world[lo + 1], world[lo + 2]),
    new THREE.Vector3(world[hi], world[hi + 1], world[hi + 2]),
  );
  map.set(key, { edge, faces: [face] });
}

/**
 * Lexicographic comparison of two lattice points (x, then y, then z) — the integer
 * counterpart of the C# Edge.CompareVectors, used only to canonicalize endpoint
 * order. Tolerance is already baked into the lattice by quantization, so this is an
 * exact integer compare.
 *
 * @param {Int32Array} quant
 * @param {number} oa Offset of point A (vertexIndex * 3).
 * @param {number} ob Offset of point B (vertexIndex * 3).
 * @returns {number} -1 if A < B, 1 if A > B, 0 if coincident.
 */
function compareLattice(quant, oa, ob) {
  let d = quant[oa] - quant[ob];
  if (d !== 0) return d < 0 ? -1 : 1;
  d = quant[oa + 1] - quant[ob + 1];
  if (d !== 0) return d < 0 ? -1 : 1;
  d = quant[oa + 2] - quant[ob + 2];
  if (d !== 0) return d < 0 ? -1 : 1;
  return 0;
}
