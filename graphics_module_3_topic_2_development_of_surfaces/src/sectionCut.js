// Section-cut engine — analytic single-plane clipper (root DECISIONS.md ADR-058).
//
// Deliberately NOT CSG: the syllabus problem is exactly one cutting plane against one convex,
// faceted solid, so a full boolean evaluator (and the CSG library the topic CLAUDE.md forbids)
// would be the wrong tool size. Instead each triangle of the solid is clipped against the
// plane's kept half-space (Sutherland–Hodgman), the intersection segments are welded on the
// same 1e-3 quantized lattice meshAnalyzer.js uses and chained into ordered closed loops, and
// the loop is fan-triangulated into a solid cap — the "True Shape" face. The ordered loop is
// returned as a first-class result (points2D in the plane's own u,v basis) because it IS the
// true-shape polygon the auxiliary view must draw; a CSG evaluator would return triangle soup
// and force that boundary to be reconstructed afterwards.
//
// Layering (CLAUDE.md "Cross-cutting rules"): analysis-layer sibling of meshAnalyzer.js. It
// imports only THREE; it does NOT import generators, the data layer, or main.js. main.js calls
// cutGeometryWithPlane() inside rebuild()'s DOMAIN BUILD SEAM, between "generate mesh" and
// "analyze edges", and feeds the sliced geometry on to meshAnalyzer.buildEdgeMap() so the cut
// rim welds with the clipped lateral edges instead of double-drawing.
//
// Space contract: geometry AND plane are both in MESH-LOCAL space. The caller transforms the
// world-space cutting plane by the inverse of the mesh's matrix (a THREE.Plane.applyMatrix4
// with the inverted matrix) so the generator/transform pipeline stays untouched and the
// emitted geometry inherits the mesh's existing pose.

import * as THREE from 'three';

/**
 * On-plane snap tolerance for the signed vertex distance. A vertex closer to the plane than
 * this is treated as lying exactly ON it — it becomes a section-loop vertex outright, so the
 * clipper never authors near-zero slivers whose meaningless normals would poison downstream
 * coplanarity tests (the failure mode meshAnalyzer.js's DEGENERATE_NORMAL_EPS absorbs).
 *
 * MUST EXCEED meshAnalyzer.js's WELD_TOLERANCE (1e-3). If the snap were smaller, a plane
 * grazing just past a vertex (e.g. the default 45° centre cut of the cube passes exactly
 * through two cube edges) would emit intersection points inside the SAME 1e-3 weld cell as
 * the original vertex — buildEdgeMap would then weld the sliver fan into one edge with >2
 * incident faces (non-manifold). Verified live: at 1e-6 the 45° centre cuts produced 2–9
 * non-manifold welded edges per solid; at 2e-3 every cut welds to a clean 2-faces-per-edge
 * manifold. 2e-3 is 0.02 mm at dock scale — invisible.
 * @type {number}
 */
export const PLANE_EPS = 2e-3;

/**
 * Zero-area floor for emitted triangles (cross-product magnitude, == twice the area). Mirrors
 * meshAnalyzer.js's DEGENERATE_NORMAL_EPS so a sliver the clipper somehow emits anyway would
 * still be dropped by the analyzer — two independent guards, same contract.
 * @type {number}
 */
const AREA_EPS = 1e-10;

// Quantization lattice for welding segment endpoints while chaining the cut loop —
// intentionally identical to meshAnalyzer.js (WELD_TOLERANCE 1e-3 → integer lattice ×1000),
// so a loop vertex and the clipped lateral vertex it touches weld to the same identity.
const QUANT = 1000;

/** Quantized identity token of one point (the meshAnalyzer vertexToken trick, on raw floats). */
function pointKey(x, y, z) {
  // +0 collapses -0 → 0 so the origin hashes identically regardless of float sign.
  return `${Math.round(x * QUANT) + 0},${Math.round(y * QUANT) + 0},${Math.round(z * QUANT) + 0}`;
}

/**
 * @typedef {Object} SectionLoop
 * @property {THREE.Vector3[]} points3D Ordered closed boundary loop in mesh-local space
 *   (first point NOT repeated at the end). Wound counter-clockwise in the (u,v) basis, so the
 *   cap it caps faces +normal (out of the kept half). NOTE: the loop may contain COLLINEAR
 *   vertices — every triangle-edge crossing contributes one, so a cut across a square face
 *   yields corner + face-diagonal points. They are deliberate: the cap fan and the clipped
 *   lateral walls share those exact vertices, which is what makes the rim weld into a clean
 *   2-faces-per-edge manifold in buildEdgeMap(). Prune collinear points only at DISPLAY time
 *   (true-shape outline, corner labels), never here.
 * @property {THREE.Vector2[]} points2D The same loop in the plane's (u,v) basis — this is the
 *   TRUE SHAPE polygon, ready for the auxiliary-view drawing layer (same collinear-vertex
 *   caveat, index-paired with points3D).
 */

/**
 * @typedef {Object} SectionCutResult
 * @property {'cut'|'no-cut'|'all-cut'} status  'no-cut': the plane removes nothing (solid
 *   entirely on the kept side) — caller should keep the original geometry. 'all-cut': the
 *   plane removes everything. 'cut': a real section; the fields below are populated.
 * @property {THREE.BufferGeometry} [geometry] Non-indexed, hard-edged sliced solid.
 *   Group 0 = clipped lateral faces (original material), group 1 = the section cap.
 * @property {number} [capStart]   First vertex index of the cap triangles (== group 1 start).
 * @property {SectionLoop[]} [loops] The chained section boundary loop(s). One loop for every
 *   solid in the current (convex) roster; multiple only for future hollow profiles.
 * @property {{origin: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, normal: THREE.Vector3}} [basis]
 *   The plane frame the 2D loop coordinates are measured in (origin = section centroid).
 */

/**
 * Slice a non-indexed triangle mesh with a plane, keeping the half-space where the signed
 * distance is ≤ 0 (i.e. the plane's normal points at the DISCARDED half), and cap the cut.
 *
 * @param {THREE.BufferGeometry} geometry Non-indexed, hard-edged solid (IShape contract).
 * @param {THREE.Plane} plane             Cutting plane in the SAME (mesh-local) space.
 * @returns {SectionCutResult}
 */
export function cutGeometryWithPlane(geometry, plane) {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr || geometry.getIndex()) {
    // Indexed geometry violates the IShape hard-edge contract; refuse loudly rather than
    // silently welding smooth-shaded edges.
    throw new Error('cutGeometryWithPlane: expected non-indexed hard-edge BufferGeometry.');
  }

  const pos = posAttr.array;
  const nX = plane.normal.x, nY = plane.normal.y, nZ = plane.normal.z;
  const pC = plane.constant;

  /** Clipped lateral triangles, flat xyz. @type {number[]} */
  const kept = [];
  /** Cut segments, flat xyz — 6 numbers (two endpoints) per segment. @type {number[]} */
  const segs = [];
  let anyDropped = false;

  // Scratch: the clipped polygon (max 4 points) and its per-vertex "on plane" flags.
  const polyX = [0, 0, 0, 0], polyY = [0, 0, 0, 0], polyZ = [0, 0, 0, 0];
  const boundary = [0, 0, 0, 0, 0, 0]; // up to 2 boundary points, flat xyz

  for (let t = 0; t < pos.length; t += 9) {
    const ax = pos[t],     ay = pos[t + 1], az = pos[t + 2];
    const bx = pos[t + 3], by = pos[t + 4], bz = pos[t + 5];
    const cx = pos[t + 6], cy = pos[t + 7], cz = pos[t + 8];

    // Signed distances, snapped to exactly 0 inside PLANE_EPS so on-plane vertices are
    // classified consistently (kept) and no near-zero sliver is ever authored.
    let dA = nX * ax + nY * ay + nZ * az + pC; if (Math.abs(dA) < PLANE_EPS) dA = 0;
    let dB = nX * bx + nY * by + nZ * bz + pC; if (Math.abs(dB) < PLANE_EPS) dB = 0;
    let dC = nX * cx + nY * cy + nZ * cz + pC; if (Math.abs(dC) < PLANE_EPS) dC = 0;

    // Fast paths: fully kept (on-plane counts as kept) / fully dropped.
    if (dA <= 0 && dB <= 0 && dC <= 0) {
      kept.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      continue;
    }
    if (dA > 0 && dB > 0 && dC > 0) {
      anyDropped = true;
      continue;
    }
    anyDropped = true;

    // Split triangle — Sutherland–Hodgman against the kept half-space. Output order follows
    // input order, so the emitted fan preserves the source winding (outward normals survive).
    const vx = [ax, bx, cx], vy = [ay, by, cy], vz = [az, bz, cz];
    const d = [dA, dB, dC];
    let outN = 0;
    let boundaryN = 0;

    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const di = d[i], dj = d[j];

      if (di <= 0) { // vertex i is kept — emit it
        polyX[outN] = vx[i]; polyY[outN] = vy[i]; polyZ[outN] = vz[i];
        outN++;
        if (di === 0 && boundaryN < 2) { // an on-plane source vertex is a boundary point
          boundary[boundaryN * 3] = vx[i];
          boundary[boundaryN * 3 + 1] = vy[i];
          boundary[boundaryN * 3 + 2] = vz[i];
          boundaryN++;
        }
      }
      if (di * dj < 0) { // strict crossing — emit the intersection point
        const s = di / (di - dj);
        const ix = vx[i] + s * (vx[j] - vx[i]);
        const iy = vy[i] + s * (vy[j] - vy[i]);
        const iz = vz[i] + s * (vz[j] - vz[i]);
        polyX[outN] = ix; polyY[outN] = iy; polyZ[outN] = iz;
        outN++;
        if (boundaryN < 2) {
          boundary[boundaryN * 3] = ix;
          boundary[boundaryN * 3 + 1] = iy;
          boundary[boundaryN * 3 + 2] = iz;
          boundaryN++;
        }
      }
    }

    // A genuinely crossing triangle contributes exactly one chord of the section loop.
    if (boundaryN === 2) {
      segs.push(boundary[0], boundary[1], boundary[2], boundary[3], boundary[4], boundary[5]);
    }

    // Fan-triangulate the clipped polygon (3 or 4 vertices), culling degenerate slivers.
    for (let i = 1; i + 1 < outN; i++) {
      const ux = polyX[i] - polyX[0], uy = polyY[i] - polyY[0], uz = polyZ[i] - polyZ[0];
      const wx = polyX[i + 1] - polyX[0], wy = polyY[i + 1] - polyY[0], wz = polyZ[i + 1] - polyZ[0];
      const crx = uy * wz - uz * wy, cry = uz * wx - ux * wz, crz = ux * wy - uy * wx;
      if (Math.sqrt(crx * crx + cry * cry + crz * crz) <= AREA_EPS) continue;
      kept.push(
        polyX[0], polyY[0], polyZ[0],
        polyX[i], polyY[i], polyZ[i],
        polyX[i + 1], polyY[i + 1], polyZ[i + 1],
      );
    }
  }

  if (!anyDropped) return { status: 'no-cut' };
  if (kept.length === 0) return { status: 'all-cut' };

  // ── Chain the cut segments into ordered closed loops ────────────────────────────────────
  const loopsRaw = chainSegments(segs);
  if (loopsRaw.length === 0) {
    // The plane shaved the solid without producing a closed section (should not happen on a
    // watertight convex mesh; guard so a numeric edge case degrades to "no cut", not a crash).
    console.warn('sectionCut: cut produced no closed loop; keeping the uncut solid.');
    return { status: 'no-cut' };
  }

  // ── Plane (u,v) basis — the true-shape frame ────────────────────────────────────────────
  const normal = plane.normal.clone().normalize();
  const helper = Math.abs(normal.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(helper, normal).normalize();
  const v = new THREE.Vector3().crossVectors(normal, u); // (u, v, normal) right-handed

  // Origin: centroid of every boundary point, so the 2D loop sits centred for drawing.
  const origin = new THREE.Vector3();
  let originCount = 0;
  for (const loop of loopsRaw) for (const p of loop) { origin.add(p); originCount++; }
  origin.divideScalar(originCount);

  /** @type {SectionLoop[]} */
  const loops = loopsRaw.map((pts3) => {
    const points2D = pts3.map((p) => new THREE.Vector2(
      (p.x - origin.x) * u.x + (p.y - origin.y) * u.y + (p.z - origin.z) * u.z,
      (p.x - origin.x) * v.x + (p.y - origin.y) * v.y + (p.z - origin.z) * v.z,
    ));
    // Normalize winding to CCW in (u,v) so a fan over it faces +normal.
    if (signedArea2(points2D) < 0) { pts3.reverse(); points2D.reverse(); }
    return { points3D: pts3, points2D };
  });

  // ── Cap triangulation ───────────────────────────────────────────────────────────────────
  /** @type {number[]} */
  const cap = [];
  if (loops.length === 1) {
    // The whole current roster is convex: one convex loop, centroid fan.
    const pts = loops[0].points3D;
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.divideScalar(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      cap.push(c.x, c.y, c.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  } else {
    // Future-proof multi-loop profile (e.g. a hollow solid's annular section): the largest
    // loop is the contour, the rest are holes. ShapeUtils.triangulateShape is three's own
    // bundled earcut — no external dependency (topic CLAUDE.md: no CSG/boolean library).
    let outerIdx = 0, outerArea = -Infinity;
    loops.forEach((loop, i) => {
      const a = Math.abs(signedArea2(loop.points2D));
      if (a > outerArea) { outerArea = a; outerIdx = i; }
    });
    const outer = loops[outerIdx];
    const holes = loops.filter((_, i) => i !== outerIdx);
    // Holes must wind opposite to the contour for earcut.
    for (const h of holes) { h.points3D.reverse(); h.points2D.reverse(); }

    const all3 = [...outer.points3D, ...holes.flatMap((h) => h.points3D)];
    const tris = THREE.ShapeUtils.triangulateShape(
      outer.points2D,
      holes.map((h) => h.points2D),
    );
    for (const [a, b, c] of tris) {
      cap.push(
        all3[a].x, all3[a].y, all3[a].z,
        all3[b].x, all3[b].y, all3[b].z,
        all3[c].x, all3[c].y, all3[c].z,
      );
    }
  }

  // ── Emit: one non-indexed geometry, lateral group + cap group ──────────────────────────
  const capStart = kept.length / 3; // vertex index where the cap begins
  const positions = new Float32Array(kept.length + cap.length);
  positions.set(kept, 0);
  positions.set(cap, kept.length);

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.addGroup(0, capStart, 0);                 // material 0 — the solid's own fill
  out.addGroup(capStart, cap.length / 3, 1);    // material 1 — the section face
  out.computeVertexNormals();                   // flat normals (non-indexed ⇒ per-face)

  return { status: 'cut', geometry: out, capStart, loops, basis: { origin, u, v, normal } };
}

/**
 * Weld segment endpoints on the quantized lattice and chain them into closed loops.
 * Open chains (impossible on a watertight solid, possible under extreme float stress) are
 * discarded with a console warning rather than capped wrongly.
 *
 * @param {number[]} segs Flat xyz, 6 numbers per segment.
 * @returns {THREE.Vector3[][]} Closed loops; first point not repeated at the end.
 */
function chainSegments(segs) {
  const count = segs.length / 6;

  /** @type {{ax:number,ay:number,az:number,bx:number,by:number,bz:number,aKey:string,bKey:string,used:boolean}[]} */
  const items = [];
  /** endpoint key → indices into items. @type {Map<string, number[]>} */
  const byKey = new Map();

  for (let i = 0; i < count; i++) {
    const o = i * 6;
    const aKey = pointKey(segs[o], segs[o + 1], segs[o + 2]);
    const bKey = pointKey(segs[o + 3], segs[o + 4], segs[o + 5]);
    if (aKey === bKey) continue; // zero-length chord (plane grazing a vertex) — nothing to chain
    const idx = items.length;
    items.push({
      ax: segs[o], ay: segs[o + 1], az: segs[o + 2],
      bx: segs[o + 3], by: segs[o + 4], bz: segs[o + 5],
      aKey, bKey, used: false,
    });
    (byKey.get(aKey) ?? byKey.set(aKey, []).get(aKey)).push(idx);
    (byKey.get(bKey) ?? byKey.set(bKey, []).get(bKey)).push(idx);
  }

  /** @type {THREE.Vector3[][]} */
  const loops = [];

  for (let s = 0; s < items.length; s++) {
    if (items[s].used) continue;
    const first = items[s];
    first.used = true;

    const pts = [new THREE.Vector3(first.ax, first.ay, first.az)];
    const startKey = first.aKey;
    let curKey = first.bKey;
    let curPt = new THREE.Vector3(first.bx, first.by, first.bz);
    let closed = false;

    // Each iteration consumes one segment, so items.length bounds the walk.
    for (let guard = 0; guard < items.length; guard++) {
      if (curKey === startKey) { closed = true; break; }
      pts.push(curPt);

      const nextIdx = (byKey.get(curKey) ?? []).find((i) => !items[i].used);
      if (nextIdx === undefined) break; // open chain — bail, discarded below

      const seg = items[nextIdx];
      seg.used = true;
      if (seg.aKey === curKey) {
        curKey = seg.bKey;
        curPt = new THREE.Vector3(seg.bx, seg.by, seg.bz);
      } else {
        curKey = seg.aKey;
        curPt = new THREE.Vector3(seg.ax, seg.ay, seg.az);
      }
    }

    if (closed && pts.length >= 3) loops.push(pts);
    else if (!closed) console.warn('sectionCut: discarded an open cut chain (non-watertight input?).');
  }

  return loops;
}

/**
 * Signed area of a 2D polygon (shoelace). Positive = counter-clockwise.
 * @param {THREE.Vector2[]} pts
 * @returns {number}
 */
function signedArea2(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}
