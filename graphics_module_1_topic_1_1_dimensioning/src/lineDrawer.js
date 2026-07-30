// Line-drawing + hidden-line classification layer (Module 1 Topic 1.1 — Dimensioning).
//
// COPIED, essentially unchanged, from the sibling ../graphics_module_1_topic_1_foundations.
// That topic's whole lesson is the visible-vs-hidden edge, so its classifier is the
// reviewed reference implementation; this topic reuses it rather than inventing a second
// one (ADR-081). The only edits are this header and the group name.
//
// WHERE IT IS USED HERE — the 3-D INSPECTION only. The FRONT ELEVATION keeps its
// authored linework: a drawing is a fixed, agreed projection, and its dashed lines are a
// draughting decision, not a live computation. The moment the learner turns the part, the
// question changes from "what does the drawing say?" to "what can I actually see?", and
// that question is camera-dependent — which is exactly what this file answers. main.js
// swaps between the two on the named pose.
//
// Adapted from Module 2's projectionDrawer.js: it keeps that file's fat-line
// plumbing (batched LineSegments2 + LineMaterial, token colours, explicit
// setResolution/dispose lifecycle) but THROWS OUT the orthographic HP/VP/PP
// projection — this is a single pictorial view, not three folded planes — and
// REPLACES the convex `worldNormal.y > 0` visibility shortcut with a genuine
// per-edge LINE-OF-SIGHT (raycast) occlusion test against the live camera.
//
// WHY THE RAYCASTER IS NON-NEGOTIABLE (the lesson, not just a render trick). The
// curriculum is BIS line types: a draughtsman draws an edge the body HIDES as a
// dashed Type E/F line, and a visible edge as a solid Type A line. That solid-vs-
// dashed split is the whole point of the topic, so the classifier MUST decide, per
// edge, "can the camera SEE this, or is solid material in the way?" — exactly what a
// short line-of-sight raycast answers. (A brief Phase-3 experiment dropped this in
// favour of GPU-depth hiding; that made every edge solid and erased the dashed
// Type E/F teaching, so it was reverted — see DECISIONS.md / CLAUDE.md Decision 3.)
//
// Layering (ADR-007 star rule): imports only THREE + the line addons. It does NOT
// import meshAnalyzer, bearingBlock, or main.js. main.js builds the edge map once
// (meshAnalyzer.buildEdgeMap, camera-invariant) and the static mesh, hands both
// here, then calls reclassify(camera) on orbit (rAF-throttled — RULES.md §3.19).
//
// THREE CLASSES OF EDGE (camera-invariant, computed once):
//   • BOUNDARY (1 incident face)  — a true open boundary; always drawn, treated
//     visible (it is outline and cannot self-occlude).
//   • REAL     (2 faces, sharp)   — a genuine crease (block corners, the bore/foot
//     rims): always drawn; solid-vs-dashed decided by the line-of-sight test.
//   • SMOOTH   (2 faces, near-coplanar) — adjacent facets of a curved surface (bore
//     wall, dome, hole walls). Drawn ONLY when it is the live SILHOUETTE (its two
//     facets face opposite ways relative to the camera); otherwise discarded, so a
//     cylinder reads as a clean outline, not a barrel of facet lines. The silhouette
//     decision is camera-dependent → recomputed every reclassify.
//
// X-RAY (Step 2) interaction: main.js sets the block's MATERIAL invisible to reveal
// the wireframe, but the mesh stays in the scene, so the raycaster (which casts
// against GEOMETRY, never the material) keeps classifying — the rear edges still come
// out HIDDEN/dashed. That is what makes the X-ray a true "solid front, dashed rear"
// engineering wireframe rather than a flat tangle of solid lines.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ============================================================================
// Tokens + visual-style constants
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** Resolve a CSS custom property to a THREE.Color (sRGB hex). */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

/**
 * Line widths in CSS pixels (LineMaterial.linewidth, worldUnits = false). Locked to Module 2's
 * master values for strict cross-module parity: Type A wide = 2.5, Type E/F narrow = 1.5. The
 * hidden stroke is now genuinely THINNER than the visible one (not merely dashed at the same
 * weight), so a rear edge reads as a lighter dashed line exactly as in the Module 2 wireframe.
 */
const LINE_WIDTH_PX = Object.freeze({
  visible: 2.5, // Type A — continuous wide
  hidden: 1.5,  // Type E/F — dashed narrow (Module 2 parity)
});

/** Dash geometry for the hidden-line material, in world units (Module 2 parity). */
const DASH = Object.freeze({ size: 0.12, gap: 0.08 });

/**
 * Coplanarity threshold separating a SMOOTH curved-surface seam from a REAL crease.
 * cos(36.9°) ≈ 0.80, chosen to sit in the WIDE EMPTY GAP the cleaned geometry leaves in
 * the adjacent-facet dot histogram: every curved facet (bore, dome AND foot holes are all
 * 24 seg → 15°, dot 0.966) sits ABOVE 0.80 → SMOOTH (silhouette-only); every genuine crease
 * on the block sits at dot < 0.5 (≥ 60°) → REAL. Nothing lives in [0.5, 0.80], so the exact
 * value just needs margin on both sides — 0.80 gives ~22° of slack to the nearest facet and
 * ~23° to the nearest real crease.
 *
 * History (chat 2026-06-30): this was a fragile 0.90 only to keep 16-seg holes (22.5°, dot
 * 0.924) smooth; that band-aid masked a tessellation-resolution issue and left almost no
 * margin. Matching the holes back to 24 seg (bearingBlock.js) plus dropping degenerate
 * triangles (meshAnalyzer.js) removed the reason for 0.90, so the threshold returns to a
 * generous engineering margin.
 */
const SMOOTH_DOT = 0.80;

/**
 * Adaptive edge subdivision for PARTIAL occlusion. The old classifier sampled each edge at
 * three fixed parameters and took a MAJORITY vote, so it could only ever brand a WHOLE edge
 * solid OR dashed. That breaks on a long arris whose MIDDLE is blocked by the boss while its
 * ENDS stay visible (the base-slab edges): the two visible ends out-vote the one hidden
 * middle, so the entire arris draws solid — a phantom solid line where the drawing should go
 * dashed behind the body (and, symmetrically, missing dashes).
 *
 * Fix: cut every edge into N sub-segments of ≈ SEG_TARGET_LEN world units (capped at SEG_MAX)
 * and run the line-of-sight test PER sub-segment, so a single geometric edge can render partly
 * solid and partly dashed — exactly how a draughtsman draws an edge that disappears behind a
 * boss. Unlike a fixed geometric split of the mesh, this tracks the occlusion boundary as it
 * SLIDES along the edge while the camera orbits, and adds no flush seams. Adjacent sub-segments
 * of the same state are merged back into one stroke at draw time (clean dash phase, few verts).
 *
 * Performance: a sub-segment costs ONE ray (vs the old up-to-three per edge). The part is
 * overwhelmingly SHORT edges (bore/dome/hole-rim facet chords) → 1 segment, 1 ray each — FEWER
 * rays than before. Only the ~dozen long arrises subdivide, so the per-pass ray count stays
 * at/below the old count and the BVH-accelerated pass stays inside the frame budget.
 */
const SEG_TARGET_LEN = 0.5; // world units per sub-segment on long edges
const SEG_MAX = 24;         // hard cap on sub-segments per edge (perf guard)

/**
 * Distance (world units) trimmed off the ray's far plane so a sample does not
 * collide with the edge's OWN adjacent faces (which sit right at the sample). Block
 * is ~9 units across, so ~0.05 is a safe, tight standoff.
 */
const SURFACE_EPS = 0.05;

/**
 * Distance (world units) each interior sample is nudged OFF the surface(s) the edge lies in,
 * along the summed incident-face normal (the exterior bisector). An edge sits exactly IN its
 * own faces, and a body↔foot junction corner sits directly under the front face's silhouette
 * boundary; a grazing line-of-sight ray then clips those coplanar faces and reports a false
 * hit, mis-filing a VISIBLE (Type A) edge into the hidden batch — where it then VANISHES in
 * Step 1 (the hidden layer is off there). Lifting the sample a hair into free space lets the
 * ray reach it cleanly. At a junction corner the internal ±Y contact normals cancel in the
 * sum, leaving the exterior side normal (±X) so the sample lifts just clear of the front face.
 * Kept tiny (block ~9 units across) so it never un-occludes a genuinely hidden rear edge.
 */
const SAMPLE_BIAS = 0.02;

/**
 * Quantization lattice for grouping faces by PLANE. Same millimetre lattice meshAnalyzer welds
 * vertices to (1 / WELD_TOLERANCE), so two triangles that lie in the same physical plane and face
 * the same way collapse to one key. Used by the flush-seam filter (Fix 1) to ask "does a coplanar
 * partner surface run through this edge?" and by the buried-face test (Fix 2) to spot an internal
 * body↔foot contact face (a face whose OPPOSITE-facing twin shares its exact plane).
 * @type {number}
 */
const PLANE_QUANT = 1000;

/**
 * Distance (world units) a coverage probe is stepped ACROSS an edge, off into the neighbouring
 * surface, when testing whether the far side is coplanar-continuous. Small enough to stay on the
 * adjacent facet, large enough to clear the edge itself. Tuned against the block (~9 units across).
 * @type {number}
 */
const COVERAGE_STEP = 0.05;

/**
 * Precise flush-seam boundary refinement (the intersection-overshoot fix).
 *
 * THE BUG. The flush-seam mask was sampled at each sub-segment MIDPOINT and applied to the WHOLE
 * sub-segment, so a sub-segment that STRADDLES the boss/foot coverage boundary (e.g. the foot's
 * top-front arris right where the body rises off it at x = ±BODY_WIDTH/2) is drawn or dropped as a
 * unit — leaving a ≤ ½-slice fragment poking PAST the corner (an overshoot) or a notch short of it.
 *
 * THE FIX. Find the EXACT parameter(s) where coverage flips by a coarse scan + bisection
 * (camera-invariant, computed once), then INJECT those crossovers as extra sub-segment boundaries
 * so no sub-segment straddles a coverage edge. Every sub-segment is then wholly covered or wholly
 * exposed, its midpoint sample is representative, and the drawn run ends EXACTLY at the corner.
 *
 *   • SEAM_SCAN_LEN — detection step (world units), finer than SEG_TARGET_LEN so a covered span is
 *     never scanned over. SEAM_SCAN_MAX caps the samples per edge (build-time perf guard).
 *   • SEAM_CLIP_EPS — world-unit tolerance the bisection refines each crossover to (matches the
 *     weld lattice, so the clip lands sub-pixel on-screen).
 *   • SEAM_MERGE_EPS — parameter-space epsilon for de-duping a uniform division point that nearly
 *     coincides with an injected crossover (avoids a zero-length sub-segment).
 */
const SEAM_SCAN_LEN = 0.25;
const SEAM_SCAN_MAX = 96;
const SEAM_CLIP_EPS = 1e-3;
const SEAM_MERGE_EPS = 1e-4;

/** Edge classes (frozen; compare against the members, never raw numbers). */
const EdgeClass = Object.freeze({ BOUNDARY: 0, REAL: 1, SMOOTH: 2 });

// ============================================================================
// Fat-line batch builder (same shape as projectionDrawer.buildSegments)
// ============================================================================

/**
 * Build one fattened-line object from a flat `[x,y,z, x,y,z, …]` positions array
 * (consecutive pairs = disjoint segments), or `null` for an empty batch.
 *
 * @param {number[]} positions
 * @param {THREE.Color} color
 * @param {number} linewidth   CSS pixels.
 * @param {boolean} dashed
 * @param {THREE.Vector2} resolution Drawing-buffer size; required by LineMaterial.
 * @returns {LineSegments2 | null}
 */
function buildSegments(positions, color, linewidth, dashed, resolution) {
  if (positions.length === 0) return null;

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: color.getHex(),
    linewidth,
    dashed,
    dashSize: DASH.size,
    gapSize: DASH.gap,
  });
  material.resolution.copy(resolution);

  const segments = new LineSegments2(geometry, material);
  // Dashed LineMaterial renders solid without per-vertex line distances (RULES.md
  // §3.17). For LineSegments2 the distance resets each segment, keeping dash phase
  // consistent across disjoint edges.
  if (dashed) segments.computeLineDistances();
  segments.frustumCulled = false; // tiny geometry; avoids cull pop during orbit
  return segments;
}

/**
 * Find the first pair of incident faces that are coplanar AND face the SAME way
 * (normal dot ≥ SMOOTH_DOT) — i.e. a continuous flat surface passing through a
 * non-manifold edge. Returns `[faceI, faceJ]` or `null`. Used to spot a flush seam
 * (body front coplanar with foot front) so it is treated SMOOTH, not a drawn crease.
 * The antiparallel internal contact pair (dot ≈ −1) never matches, so true creases
 * are left REAL.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces
 * @returns {[import('./meshAnalyzer.js').Face, import('./meshAnalyzer.js').Face] | null}
 */
function findCoplanarPair(faces) {
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      if (faces[i].worldNormal.dot(faces[j].worldNormal) >= SMOOTH_DOT) {
        return [faces[i], faces[j]];
      }
    }
  }
  return null;
}

// ============================================================================
// Coplanar-surface geometry (flush-seam filter + buried-face test)
// ============================================================================
//
// WHY THIS EXISTS. The block is TWO extrusions welded face-to-face: the body/boss butts onto the
// base slab at y = baseTopY. Their front (and back) faces are perfectly COPLANAR there, so the
// arris the mesh draws along that flush interface is a FALSE seam — the part is one casting, not
// two stacked blocks. But the seam edges are ordinary 2-face edges (the coplanar partner face is
// NOT incident to the edge — it is a separate face on the far side), so no test on an edge's own
// two faces can catch it. Instead we index every face by its PLANE and ask, per sub-segment,
// "is the far side of this edge covered by a coplanar partner?" — true only where a continuous flat
// surface runs through the seam. This drops the flush seams and the stretch of the base's top arris
// that passes behind the boss, while leaving genuine creases, rims and silhouettes (whose far side
// is air or a hole) fully drawn.

/**
 * Quantized plane identity key `"qnx,qny,qnz|qd"` for a unit normal and its plane offset
 * `d = n·p`, on the same millimetre lattice meshAnalyzer welds to. Same-facing coplanar triangles
 * share a key; an opposite-facing coincident face gets a DISTINCT key (its normal flips), which is
 * exactly what lets us detect the internal body↔foot contact. `+0` folds `-0 → 0` so a sign never
 * splits a key.
 *
 * @param {number} nx @param {number} ny @param {number} nz @param {number} d
 * @returns {string}
 */
function planeKey(nx, ny, nz, d) {
  const q = PLANE_QUANT;
  return `${Math.round(nx * q) + 0},${Math.round(ny * q) + 0},${Math.round(nz * q) + 0}|${Math.round(d * q) + 0}`;
}

/**
 * Point-in-triangle test for a point already known to be (near) coplanar with the triangle:
 * project out the triangle's dominant-normal axis to 2D and use the three half-plane signs.
 * `face` carries its unit normal `n` and world-space vertices `a`, `b`, `c`.
 *
 * @param {THREE.Vector3} p
 * @param {{n:THREE.Vector3, a:THREE.Vector3, b:THREE.Vector3, c:THREE.Vector3}} face
 * @returns {boolean}
 */
function pointInFace(p, face) {
  const n = face.n;
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  let u, v;
  if (ax >= ay && ax >= az) { u = 'y'; v = 'z'; }
  else if (ay >= az) { u = 'x'; v = 'z'; }
  else { u = 'x'; v = 'y'; }
  const a = face.a, b = face.b, c = face.c;
  const px = p[u], py = p[v];
  const d1 = (px - b[u]) * (a[v] - b[v]) - (a[u] - b[u]) * (py - b[v]);
  const d2 = (px - c[u]) * (b[v] - c[v]) - (b[u] - c[u]) * (py - c[v]);
  const d3 = (px - a[u]) * (c[v] - a[v]) - (c[u] - a[u]) * (py - a[v]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Is `p` inside any triangle of a coplanar bucket — i.e. covered by that flat surface? */
function bucketCovers(p, bucket) {
  if (!bucket) return false;
  for (let i = 0; i < bucket.length; i++) if (pointInFace(p, bucket[i])) return true;
  return false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Per-edge record. The geometry (`p1`/`p2`, `samples`, `cls`, face normals +
 * centroids) is camera-invariant and built once; `drawn`/`hidden` are the live
 * state recomputed each reclassify and diffed to avoid per-frame rebuilds.
 *
 * @typedef {Object} EdgeRec
 * @property {THREE.Vector3} p1
 * @property {THREE.Vector3} p2
 * @property {number} nSeg Sub-segment count (1 for short / BOUNDARY edges); equals segT.length − 1.
 * @property {number[]} segT Sub-segment boundary parameters in [0,1], length nSeg+1 (segT[0] = 0,
 *   segT[nSeg] = 1). Non-uniform on REAL edges: the uniform division points UNIONed with the exact
 *   flush-seam crossovers, so no sub-segment straddles a coverage boundary (the overshoot fix).
 * @property {THREE.Vector3[]} samples Per-sub-segment MIDPOINT world-space sample points
 *   (one per sub-segment), nudged off-surface; empty for BOUNDARY edges (never raycast).
 * @property {Uint8Array} segHidden Live per-sub-segment hidden flag (0 visible / 1 hidden);
 *   allocated once, overwritten each reclassify and diffed to gate batch rebuilds.
 * @property {Uint8Array|null} segFalse Camera-invariant per-sub-segment FALSE-SEAM mask, built
 *   once (0 draw / 1 flush-seam → never emitted, never raycast). `null` for edges that fully draw.
 * @property {number} cls One of {@link EdgeClass}.
 * @property {THREE.Vector3} n1 Face-0 world normal.
 * @property {THREE.Vector3} c1 Face-0 centroid.
 * @property {THREE.Vector3} [n2] Face-1 world normal (2-face edges).
 * @property {THREE.Vector3} [c2] Face-1 centroid (2-face edges).
 * @property {boolean} drawn Whether the edge participates in the drawing this frame.
 */

/**
 * Create the live line classifier for a static mesh.
 *
 * @param {Map<string, import('./meshAnalyzer.js').EdgeRecord>} edgeMap
 *   Welded edge→faces map (world-space endpoints), from meshAnalyzer.buildEdgeMap.
 * @param {THREE.Mesh} mesh  The SAME static solid the edge map was built from; the
 *   raycaster casts against it (and only it — never the lines). It keeps classifying
 *   even when its material is hidden (X-ray), because raycasting reads geometry.
 * @param {Object} [options]
 * @param {number} [options.width=window.innerWidth]
 * @param {number} [options.height=window.innerHeight]
 * @returns {{
 *   group: THREE.Group,
 *   reclassify: (camera: THREE.Camera) => void,
 *   setResolution: (w: number, h: number) => void,
 *   setVisible: (v: boolean) => void,
 *   setHiddenVisible: (v: boolean) => void,
 *   dispose: () => void,
 * }}
 */
export function createLineDrawer(edgeMap, mesh, options = {}) {
  const {
    width = window.innerWidth,
    height = window.innerHeight,
  } = options;

  const resolution = new THREE.Vector2(width, height);
  const visibleColor = cssColor('--color-ink');        // Type A
  const hiddenColor = cssColor('--color-bench-grey');  // Type E/F

  // --- Coplanar-surface index (flush-seam filter + buried-face bias). ---------
  // Reconstruct the static mesh's world-space triangles ONCE and bucket them by quantized plane.
  // Camera-invariant (topology, not view), built here alongside the edge records and never per
  // frame. Read below by isFaceBuried() and the flush-seam helpers (coveredAt / sampleSeamMask /
  // computeSeamCuts). f.vertices from meshAnalyzer are
  // POSITION-attribute indices, so the same posAttr + world matrix reproduce the exact triangles.
  const meshGeo = mesh.geometry;
  const posAttr = meshGeo.getAttribute('position');
  const meshMatrix = mesh.matrixWorld;
  /** @type {Map<string, Array<{n:THREE.Vector3, a:THREE.Vector3, b:THREE.Vector3, c:THREE.Vector3}>>} */
  const planeIndex = new Map();
  {
    const index = meshGeo.getIndex();
    const idx = index ? index.array : null;
    const triCount = idx ? idx.length : posAttr.count;
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const u1 = new THREE.Vector3(), u2 = new THREE.Vector3();
    for (let t = 0; t < triCount; t += 3) {
      const i1 = idx ? idx[t] : t, i2 = idx ? idx[t + 1] : t + 1, i3 = idx ? idx[t + 2] : t + 2;
      va.fromBufferAttribute(posAttr, i1).applyMatrix4(meshMatrix);
      vb.fromBufferAttribute(posAttr, i2).applyMatrix4(meshMatrix);
      vc.fromBufferAttribute(posAttr, i3).applyMatrix4(meshMatrix);
      const n = new THREE.Vector3().crossVectors(u1.subVectors(vb, va), u2.subVectors(vc, va));
      const len = n.length();
      if (len <= 1e-10) continue; // drop degenerate slivers — mirrors meshAnalyzer.DEGENERATE_NORMAL_EPS
      n.multiplyScalar(1 / len);
      const key = planeKey(n.x, n.y, n.z, n.dot(va));
      let bucket = planeIndex.get(key);
      if (!bucket) { bucket = []; planeIndex.set(key, bucket); }
      bucket.push({ n, a: va.clone(), b: vb.clone(), c: vc.clone() });
    }
  }

  // Buried-face test + its scratch. A face is BURIED (an internal body↔foot contact face) when a
  // face sharing its EXACT plane but facing the opposite way covers all of it — true for the
  // body-bottom pressed onto the foot-top, but NOT the foot-top itself (only partly covered by the
  // smaller body footprint, so it stays exterior). Buried faces are skipped as flush-seam
  // references and have their normal NEGATED in the sample-bias sum, so a crease sample nudges into
  // free air instead of down into the slab it rests on (the self-occlusion flicker fix).
  const buriedCache = new Map(); // meshAnalyzer Face -> boolean
  const fVa = new THREE.Vector3(), fVb = new THREE.Vector3(), fVc = new THREE.Vector3();
  function isFaceBuried(f) {
    const cached = buriedCache.get(f);
    if (cached !== undefined) return cached;
    const n = f.worldNormal;
    const opp = planeIndex.get(planeKey(-n.x, -n.y, -n.z, -f.distanceToOrigin));
    let buried = false;
    if (opp) {
      const [ia, ib, ic] = f.vertices;
      fVa.fromBufferAttribute(posAttr, ia).applyMatrix4(meshMatrix);
      fVb.fromBufferAttribute(posAttr, ib).applyMatrix4(meshMatrix);
      fVc.fromBufferAttribute(posAttr, ic).applyMatrix4(meshMatrix);
      buried = bucketCovers(fVa, opp) && bucketCovers(fVb, opp) &&
               bucketCovers(fVc, opp) && bucketCovers(f.center, opp);
    }
    buriedCache.set(f, buried);
    return buried;
  }

  // Flush-seam mask for a REAL edge, or null if it fully draws. A sub-segment is a false seam where
  // the far side of the edge — stepped across it, staying in an exterior incident face's plane — is
  // covered by a COPLANAR partner face (a continuous flat surface runs through the seam). Per
  // sub-segment so the base's top arris drops only where it passes behind the boss and survives at
  // its exposed ends.
  const csEdgeDir = new THREE.Vector3(), csMid = new THREE.Vector3(), csTmp = new THREE.Vector3();
  const csPt = new THREE.Vector3(), csProbe = new THREE.Vector3();

  // Build the coplanar-partner references for a REAL edge: one {perp, bucket} per exterior incident
  // face whose plane also carries a coplanar partner face, with `perp` oriented ACROSS the edge AWAY
  // from that face's own interior (toward the potential partner). Returns null when the edge can
  // carry no flush seam (degenerate, or no incident face has a coplanar partner).
  function buildSeamRefs(edge, faces) {
    csEdgeDir.subVectors(edge.p2, edge.p1);
    if (csEdgeDir.lengthSq() < 1e-12) return null;
    csEdgeDir.normalize();
    csMid.addVectors(edge.p1, edge.p2).multiplyScalar(0.5);
    const refs = [];
    for (const f of faces) {
      if (isFaceBuried(f)) continue; // an interior contact face is never an exterior surface
      const n = f.worldNormal;
      const bucket = planeIndex.get(planeKey(n.x, n.y, n.z, f.distanceToOrigin));
      if (!bucket || bucket.length < 2) continue; // no coplanar partner → cannot be a flush seam
      const perp = new THREE.Vector3().crossVectors(csEdgeDir, n);
      if (perp.lengthSq() < 1e-9) continue;
      perp.normalize();
      if (perp.dot(csTmp.subVectors(f.center, csMid)) > 0) perp.negate();
      refs.push({ perp, bucket });
    }
    return refs.length ? refs : null;
  }

  // Is the point at parameter t on the edge a flush seam — i.e. stepped a hair ACROSS the edge into
  // a partner plane, is it covered by a coplanar face? True where a continuous flat surface runs
  // through the seam (body front coplanar with foot front).
  function coveredAt(edge, refs, t) {
    csPt.lerpVectors(edge.p1, edge.p2, t);
    for (const rf of refs) {
      csProbe.copy(csPt).addScaledVector(rf.perp, COVERAGE_STEP);
      if (bucketCovers(csProbe, rf.bucket)) return true;
    }
    return false;
  }

  // Exact parameters in (0,1) where coverage FLIPS along the edge, found by a coarse scan then
  // bisection to SEAM_CLIP_EPS. These are injected as extra sub-segment boundaries so a drawn run
  // ends precisely at the boss/foot corner instead of at a ½-slice sub-segment edge (overshoot fix).
  function computeSeamCuts(edge, refs, len) {
    const N = Math.min(SEAM_SCAN_MAX, Math.max(2, Math.ceil(len / SEAM_SCAN_LEN)));
    const tolT = Math.min(0.25, SEAM_CLIP_EPS / Math.max(len, 1e-6));
    const cuts = [];
    let prevT = 0, prevC = coveredAt(edge, refs, 0);
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const c = coveredAt(edge, refs, t);
      if (c !== prevC) {
        // Bisect [prevT, t] to the crossover; loC is the coverage state held by the `lo` bound.
        let lo = prevT, hi = t;
        const loC = prevC;
        while (hi - lo > tolT) {
          const mid = (lo + hi) * 0.5;
          if (coveredAt(edge, refs, mid) === loC) lo = mid; else hi = mid;
        }
        cuts.push((lo + hi) * 0.5);
      }
      prevT = t; prevC = c;
    }
    return cuts;
  }

  // Merge the uniform sub-segment division points with the injected seam crossovers into one sorted,
  // de-duped boundary array [0, …, 1]. The `nUniform` uniform slices set the occlusion resolution;
  // the cuts guarantee no slice straddles a coverage boundary (so midpoint sampling is exact).
  function buildSegT(nUniform, cuts) {
    const ts = [0, 1];
    for (let k = 1; k < nUniform; k++) ts.push(k / nUniform);
    if (cuts) for (const c of cuts) if (c > SEAM_MERGE_EPS && c < 1 - SEAM_MERGE_EPS) ts.push(c);
    ts.sort((a, b) => a - b);
    const out = [0];
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] - out[out.length - 1] > SEAM_MERGE_EPS) out.push(ts[i]);
    }
    out[out.length - 1] = 1; // clamp the far boundary exactly to the endpoint
    return out;
  }

  // Per-sub-segment flush-seam mask, sampled at each sub-segment MIDPOINT. Because the seam
  // crossovers are injected into segT, every sub-segment is wholly covered or wholly exposed, so the
  // midpoint test is exact — no straddling slice. Returns null when nothing is covered (fully drawn).
  function sampleSeamMask(edge, refs, segT) {
    const n = segT.length - 1;
    let any = false;
    const seg = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      const tMid = (segT[k] + segT[k + 1]) * 0.5;
      if (coveredAt(edge, refs, tMid)) { seg[k] = 1; any = true; }
    }
    return any ? seg : null;
  }

  // --- Build the camera-invariant edge records once. -------------------------
  /** @type {EdgeRec[]} */
  const edges = [];
  const bias = new THREE.Vector3(); // scratch: per-edge off-surface sample offset
  for (const { edge, faces } of edgeMap.values()) {
    /** @type {EdgeRec} */
    const rec = {
      p1: edge.p1,
      p2: edge.p2,
      nSeg: 1,        // set below from segT length (1 for short / BOUNDARY edges)
      segT: null,     // sub-segment boundaries in [0,1]; built below (uniform ∪ seam crossovers)
      samples: null,  // built below, once the bias direction (face normals) is known
      segHidden: null,
      segFalse: null, // camera-invariant flush-seam mask (REAL edges only); built below
      cls: EdgeClass.REAL,
      n1: null, c1: null, n2: null, c2: null,
      drawn: false,
    };

    if (faces.length === 1) {
      rec.cls = EdgeClass.BOUNDARY;
      rec.n1 = faces[0].worldNormal;
      rec.c1 = faces[0].center;
    } else if (faces.length === 2) {
      rec.n1 = faces[0].worldNormal;
      rec.c1 = faces[0].center;
      rec.n2 = faces[1].worldNormal;
      rec.c2 = faces[1].center;
      // Near-coplanar adjacent facets → SMOOTH (silhouette-only); a sharp crease →
      // REAL. ExtrudeGeometry winds each curved surface consistently, so adjacent
      // facets give dot ≈ +cos(facet angle) (e.g. +0.966 for the 24-seg bore) — we
      // test the SIGNED dot so a genuine antiparallel fold (dot ≈ −1) stays REAL and
      // is drawn, never swallowed as "smooth". (The downstream visible/hidden test
      // is normal-orientation-free anyway: silhouette uses a facing SIGN-CHANGE and
      // occlusion is a pure raycast.)
      const dot = rec.n1.dot(rec.n2);
      rec.cls = dot >= SMOOTH_DOT ? EdgeClass.SMOOTH : EdgeClass.REAL;
    } else {
      // Non-manifold (>2 incident faces): two solids butting. The body sitting flush on
      // the foot welds the coincident interface into 3–4-face edges. A line belongs here
      // only if the VISIBLE exterior surface genuinely creases — but where a continuous
      // flat surface runs straight THROUGH the seam (the body's front face is perfectly
      // flush + coplanar with the foot's front face, both +Z at z = +halfDepth), two of
      // the incident faces share a normal direction (dot ≥ SMOOTH_DOT). That pair is ONE
      // surface, so the seam is not a crease: classify it SMOOTH off the coplanar pair, and
      // its near-parallel normals make the silhouette test all-but-never fire → the phantom
      // seam stops drawing. Fall back to REAL only when no coplanar pair exists — a true
      // multi-face crease, e.g. the concave corner where a body side rises off the foot top.
      // (The internal contact pair — body-bottom −Y vs foot-top +Y, dot ≈ −1 — is correctly
      // NOT matched, so genuine corners are never swallowed.)
      const pair = findCoplanarPair(faces);
      if (pair) {
        rec.cls = EdgeClass.SMOOTH;
        rec.n1 = pair[0].worldNormal; rec.c1 = pair[0].center;
        rec.n2 = pair[1].worldNormal; rec.c2 = pair[1].center;
      } else {
        rec.cls = EdgeClass.REAL;
        rec.n1 = faces[0].worldNormal;
        rec.c1 = faces[0].center;
      }
    }

    // Subdivide the edge into sub-segments of ≈ SEG_TARGET_LEN (capped at SEG_MAX) so a long arris
    // can be classified — and drawn — partly solid, partly dashed (see SEG_TARGET_LEN). Only REAL
    // edges can carry a flush seam; for them we ALSO find the exact coverage crossovers and inject
    // them as extra sub-segment boundaries, so no slice straddles the boss/foot corner and the
    // drawn run clips exactly there (the intersection-overshoot fix — see SEAM_SCAN_LEN). BOUNDARY
    // edges are outline: always solid, never raycast → one segment, no samples.
    const len = edge.p1.distanceTo(edge.p2);
    const nUniform = rec.cls === EdgeClass.BOUNDARY
      ? 1
      : Math.min(SEG_MAX, Math.max(1, Math.ceil(len / SEG_TARGET_LEN)));

    let seamRefs = null;
    let seamCuts = null;
    if (rec.cls === EdgeClass.REAL) {
      seamRefs = buildSeamRefs(edge, faces);
      if (seamRefs) seamCuts = computeSeamCuts(edge, seamRefs, len);
    }

    rec.segT = buildSegT(nUniform, seamCuts);
    rec.nSeg = rec.segT.length - 1;
    rec.segHidden = new Uint8Array(rec.nSeg); // 0 = visible; refilled each reclassify

    // One interior sample at the MIDPOINT of each sub-segment, nudged a hair OFF the surface(s) the
    // edge lies in along the summed incident-face normal (the exterior bisector) — see SAMPLE_BIAS.
    // A BURIED contact face (body-bottom pressed onto the foot-top) has its normal NEGATED in the
    // sum so it points OUT OF the contact into free air: at a body↔foot crease the incident faces
    // are {side wall, buried body-bottom}, and negating the buried −Y gives an up-and-outward bias
    // (e.g. −X+Y for the left crease) instead of one that drives the sample DOWN into the slab — the
    // fix for the crease flicker (grazing rays that used to self-occlude on the foot top).
    // Non-junction edges have no buried face, so this is a no-op and the exterior bisector is
    // unchanged.
    bias.set(0, 0, 0);
    for (const f of faces) {
      if (isFaceBuried(f)) bias.addScaledVector(f.worldNormal, -1);
      else bias.add(f.worldNormal);
    }
    if (bias.lengthSq() > 1e-12) bias.normalize().multiplyScalar(SAMPLE_BIAS);
    else bias.set(0, 0, 0);
    rec.samples = rec.cls === EdgeClass.BOUNDARY
      ? []
      : Array.from({ length: rec.nSeg }, (_, k) =>
          new THREE.Vector3()
            .lerpVectors(edge.p1, edge.p2, (rec.segT[k] + rec.segT[k + 1]) * 0.5)
            .add(bias),
        );

    // Flush-seam mask, sampled at each (non-straddling) sub-segment midpoint. Only REAL edges have
    // seamRefs; BOUNDARY/SMOOTH stay null (fully drawn).
    rec.segFalse = seamRefs ? sampleSeamMask(edge, seamRefs, rec.segT) : null;

    edges.push(rec);
  }

  // --- Scene group + the two live batches. -----------------------------------
  const group = new THREE.Group();
  group.name = 'Guide Plate live linework';
  /** @type {LineSegments2 | null} */
  let visibleLines = null;
  /** @type {LineSegments2 | null} */
  let hiddenLines = null;
  let showHidden = false; // Step 2 reveals the hidden layer; start with Type A only

  // --- Reusable scratch (allocation-light per the rebuild-pipeline budget). ---
  const raycaster = new THREE.Raycaster();
  // three-mesh-bvh honours firstHitOnly: stop BVH traversal at the FIRST triangle the
  // ray meets instead of collecting every hit. The occlusion test only asks "is anything
  // in the way?" (length > 0), so the first hit is all we need — this lets the accelerated
  // raycast bail out of the hierarchy as early as possible. (The stock raycaster ignores
  // the flag and still returns all hits, which our length>0 check handles correctly too.)
  raycaster.firstHitOnly = true;
  const camPos = new THREE.Vector3();
  const dir = new THREE.Vector3();

  /** Rays cast during the current reclassify — read by the opt-in occlusion profiler
   *  (window.__simProfile). A single integer add per ray, dwarfed by the raycast itself. */
  let rayCount = 0;

  /**
   * Is a sample point hidden from the camera by solid material? Cast camera→sample
   * and stop the ray just short of the sample (far = dist − SURFACE_EPS) so the
   * edge's own faces never count; ANY hit in between means the body occludes it.
   *
   * @param {THREE.Vector3} sample
   * @returns {boolean}
   */
  function sampleOccluded(sample) {
    dir.copy(sample).sub(camPos);
    const dist = dir.length();
    if (dist <= SURFACE_EPS) return false;
    dir.multiplyScalar(1 / dist);
    raycaster.set(camPos, dir);
    raycaster.near = 0;
    raycaster.far = dist - SURFACE_EPS;
    rayCount++;
    return raycaster.intersectObject(mesh, false).length > 0;
  }

  /** Is the face (normal n, centroid c) turned toward the camera? */
  function frontFacing(n, c) {
    return (
      n.x * (camPos.x - c.x) +
      n.y * (camPos.y - c.y) +
      n.z * (camPos.z - c.z)
    ) > 0;
  }

  /**
   * Recompute each edge's drawn flag AND its per-sub-segment hidden state against the live
   * camera, then rebuild the two fat-line batches ONLY if some edge or sub-segment actually
   * flipped (no per-frame alloc on a still frame). Cheap to call every rAF; main.js still
   * gates it on real camera movement.
   *
   * @param {THREE.Camera} camera
   */
  function reclassify(camera) {
    // Opt-in occlusion profiler: set window.__simProfile = true in the console to log the
    // raycast pass cost (time + ray count) on each pass. Off by default → zero overhead.
    const profile = typeof window !== 'undefined' && window.__simProfile === true;
    const t0 = profile ? performance.now() : 0;
    if (profile) rayCount = 0;

    camera.getWorldPosition(camPos);

    let changed = false;
    for (const rec of edges) {
      let drawn;
      if (rec.cls === EdgeClass.SMOOTH) {
        // Drawn only when this seam is the live silhouette (facets disagree on facing).
        drawn = frontFacing(rec.n1, rec.c1) !== frontFacing(rec.n2, rec.c2);
      } else {
        drawn = true; // BOUNDARY + REAL are always part of the drawing
      }

      if (drawn !== rec.drawn) changed = true;
      rec.drawn = drawn;

      // Per-sub-segment line-of-sight occlusion: each sub-segment is solid or dashed on its
      // own, so one long arris can pass behind the boss in the middle yet stay visible at the
      // ends (the partial-occlusion fix). BOUNDARY edges are outline and never self-occlude →
      // always solid (skip). A SMOOTH seam that is not the live silhouette is not drawn → skip
      // its rays entirely (its stale segHidden is never emitted).
      if (drawn && rec.cls !== EdgeClass.BOUNDARY) {
        const seg = rec.segHidden;
        const sf = rec.segFalse;
        for (let k = 0; k < rec.nSeg; k++) {
          if (sf && sf[k]) continue; // flush seam: never emitted → no ray needed
          const h = sampleOccluded(rec.samples[k]) ? 1 : 0;
          if (h !== seg[k]) { seg[k] = h; changed = true; }
        }
      }
    }

    if (profile) {
      const ms = performance.now() - t0;
      // eslint-disable-next-line no-console
      console.log(
        `[occlusion] reclassify ${ms.toFixed(2)} ms · ${rayCount} rays · ${edges.length} edges`,
      );
    }

    if (changed || (!visibleLines && !hiddenLines)) rebuildBatches();
  }

  /**
   * Emit one edge's sub-segments into the solid/dashed position arrays, MERGING runs of
   * consecutive same-state sub-segments into a single stroke. Three states per sub-segment:
   * FALSE (a flush seam — emitted to neither batch, so the stroke has a gap there), HIDDEN
   * (dashed), or VISIBLE (solid). Merging keeps the vertex count low and the dash phase continuous
   * along each run: a fully-visible edge emits as ONE solid p1→p2 segment; the base's top arris
   * emits solid · GAP · solid (drawn ends, dropped middle behind the boss); an arris that dips
   * behind the boss emits solid · dashed · solid.
   *
   * @param {EdgeRec} rec
   * @param {number[]} visPos Solid (Type A) positions to append to.
   * @param {number[]} hidPos Dashed (Type E/F) positions to append to.
   */
  function pushEdgeRuns(rec, visPos, hidPos) {
    const { p1, p2, nSeg, segHidden, segFalse, segT } = rec;
    const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
    // State per sub-segment: -2 = false seam (undrawn gap), 1 = hidden (dashed), 0 = visible.
    const stateOf = (k) => (segFalse && segFalse[k]) ? -2 : (segHidden[k] ? 1 : 0);
    let runStart = 0;
    let runState = stateOf(0);
    for (let k = 1; k <= nSeg; k++) {
      // Sentinel (-1) at k === nSeg forces the final run to flush (never equals a real state).
      const state = k < nSeg ? stateOf(k) : -1;
      if (state === runState) continue;
      if (runState !== -2) { // a false-seam run draws nothing (leaves a gap)
        // Run boundaries ride the exact segT parameters, so a run that ends at a seam crossover
        // clips precisely at the boss/foot corner — no ½-slice overshoot past it.
        const tA = segT[runStart];
        const tB = segT[k];
        const target = runState === 1 ? hidPos : visPos;
        target.push(
          p1.x + dx * tA, p1.y + dy * tA, p1.z + dz * tA,
          p1.x + dx * tB, p1.y + dy * tB, p1.z + dz * tB,
        );
      }
      runStart = k;
      runState = state;
    }
  }

  /** Rebuild both LineSegments2 from the current per-edge state. */
  function rebuildBatches() {
    disposeBatches();

    const visPos = [];
    const hidPos = [];
    for (const rec of edges) {
      if (rec.drawn) pushEdgeRuns(rec, visPos, hidPos);
    }

    visibleLines = buildSegments(visPos, visibleColor, LINE_WIDTH_PX.visible, false, resolution);
    hiddenLines = buildSegments(hidPos, hiddenColor, LINE_WIDTH_PX.hidden, true, resolution);
    if (visibleLines) group.add(visibleLines);
    if (hiddenLines) {
      hiddenLines.visible = showHidden;
      group.add(hiddenLines);
    }
  }

  /** Dispose the two batches (geometry + material) and detach them. */
  function disposeBatches() {
    for (const lines of [visibleLines, hiddenLines]) {
      if (!lines) continue;
      lines.geometry?.dispose();
      lines.material?.dispose();
      group.remove(lines);
    }
    visibleLines = null;
    hiddenLines = null;
  }

  return {
    group,
    reclassify,
    setResolution(w, h) {
      resolution.set(w, h);
      for (const lines of [visibleLines, hiddenLines]) {
        if (lines && lines.material instanceof LineMaterial) {
          lines.material.resolution.copy(resolution);
        }
      }
    },
    /** Toggle the whole linework group (e.g. the visible-edge layer for Step 1). */
    setVisible(v) {
      if (visibleLines) visibleLines.visible = v;
    },
    /** Reveal/hide the Type E/F dashed layer (Step 2 X-ray). */
    setHiddenVisible(v) {
      showHidden = v;
      if (hiddenLines) hiddenLines.visible = v;
    },
    dispose() {
      disposeBatches();
      group.parent?.remove(group);
    },
  };
}
