// Projection-drawing layer. Port of src_csharp/ProjectionDrawer.cs.
//
// Consumes the welded edge→faces map produced by meshAnalyzer.buildEdgeMap and
// emits the two orthographic projections of the solid — onto HP (the horizontal
// "floor" plane, Y = 0) and VP (the vertical "wall" plane, X = 0) — plus the
// dotted connector lines that trace each 3D vertex down to its two projections.
//
// Layering (CLAUDE.md "Cross-cutting rules"): this is a leaf layer. It imports
// only THREE + the line addons; it does NOT import meshAnalyzer, the data layer,
// the generators, or main.js. main.js (the orchestrator) calls buildEdgeMap(),
// hands the result here, and adds the returned group to the scene inside the
// single rebuild() pipeline.
//
// THREE PORTING NOTES that matter here:
//
//  1. LINE WEIGHTS (CLAUDE.md, non-negotiable). Unity's LineRenderer gave real
//     world-space line widths for free; the WebGL `LineBasicMaterial` is capped
//     at 1px on most GPUs. So every line in this module is drawn with
//     LineMaterial + LineSegments2 (the addons that fatten lines in a shader).
//     LineMaterial MUST know the drawing-buffer resolution or it renders the
//     wrong thickness — callers update it via the returned setResolution().
//
//  2. PROJECTION MATH IS HANDEDNESS-SAFE. Unlike the rotation code (CLAUDE.md
//     "Right-handed, Y-up vs Unity left-handed"), there are no Unity signs to
//     re-derive here: an orthographic projection onto an axis-aligned plane just
//     ZEROES one world coordinate. HP drops Y, VP drops X — identical to the C#,
//     copied verbatim with confidence. The endpoints arrive already in Three.js
//     world space from meshAnalyzer, so no further transform is applied.
//
//  3. VIEW-DEPENDENT HIDDEN LINES (engineering convention, supersedes the old
//     "VP is always dashed" cue). A real orthographic drawing draws SOLID lines
//     for edges the observer can see and DASHED lines for edges the solid
//     occludes — independently per view. Because our solids are CONVEX, that
//     occlusion is computable from face normals alone, with no depth buffer:
//       • HP (top view, observer looking DOWN −Y): an edge is visible iff any
//         adjacent face points up (worldNormal.y > 0); otherwise it is hidden.
//       • VP (front view, observer looking from +X): an edge is visible iff any
//         adjacent face points right (worldNormal.x > 0); otherwise it is hidden.
//     The SAME edge can be solid in HP and dashed in VP — visibility is decided
//     per plane, not once. HP draws teal, VP draws amber; the hidden variant of
//     each keeps its plane's hue but switches to a dash (so the solid/dashed
//     cue, not hue, carries occlusion). This view-dependent convention takes
//     precedence over the Two-Cue dash-on-VP styling. Colours are read from CSS
//     tokens, never hard-coded. 3D TextMeshPro dimension labels are NOT ported.
//
//  5. COPLANAR SEAMS ARE DISCARDED, not dashed. A flat polygon face arrives as a
//     fan of triangles; the shared diagonals between those triangles are not real
//     edges of the solid. The C# source skipped them outright (dot of adjacent
//     normals ≥ 0.99 ⇒ coplanar ⇒ no line). An earlier port wrongly drew them as
//     dashed grey "hidden" lines, littering every face with false diagonals. We
//     now skip them entirely, matching the C# and the engineering drawing.
//
//  4. BATCHED, NOT ONE-OBJECT-PER-LINE. The C# spawned a GameObject per segment.
//     In the iframe's single WebGL context that risks context exhaustion across
//     rapid rebuilds (CLAUDE.md). Instead, all segments sharing a style are
//     packed into ONE LineSegments2, so a full projection is ~5 draw objects and
//     dispose() is correspondingly cheap.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded.
// Mirrors the cssVar/cssColor helpers in main.js + genericPyramid.js; each leaf
// module reads its own tokens rather than importing a sibling (layering rule).
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/**
 * Resolve a CSS custom property to a THREE.Color. Tokens are authored as sRGB
 * hex (see DESIGN.md / index.html `:root`), which THREE.Color parses directly.
 * @param {string} name CSS variable name, e.g. `'--color-hp-line'`.
 * @returns {THREE.Color}
 */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

// ============================================================================
// Visual-style constants
// ============================================================================

/**
 * Whether an edge is a real edge of the solid at all. This is the GEOMETRIC,
 * orbit-invariant decision (drawn vs discarded) — distinct from the per-plane,
 * view-dependent visible/hidden decision, which is computed separately by
 * {@link visibleInHP} / {@link visibleInVP}. The value strings exist only for
 * debugging; compare against the frozen members, never against raw strings.
 * @readonly
 * @enum {string}
 */
export const EdgeType = Object.freeze({
  /** Boundary edge — shared by exactly 1 face. Always part of the outline; drawn. */
  SILHOUETTE: 'silhouette',
  /** Sharp internal edge — 2 faces meeting at a real crease (or non-manifold). Drawn. */
  REAL: 'real',
  /** Coplanar triangulation seam — 2 nearly-coplanar faces. NOT a real edge; discarded. */
  COPLANAR: 'coplanar',
});

/**
 * Line widths in CSS pixels (LineMaterial.linewidth with worldUnits = false).
 *
 * The C# source used WORLD-UNIT widths (visible 0.03, hidden 0.02, connector
 * 0.01) because Unity's LineRenderer measures in world space. Those values do
 * not translate to a fattened-line shader and would render hair-thin; CLAUDE.md
 * explicitly wants "real pixel width". So the original ratio (≈3:2:1) is
 * preserved but re-expressed in pixels.
 * @type {{ visible: number, hidden: number, connector: number }}
 */
const LINE_WIDTH_PX = Object.freeze({
  visible: 2.5,   // C# VISIBLE_LINE_WIDTH 0.03
  hidden: 1.5,    // C# HIDDEN_LINE_WIDTH  0.02
  connector: 1.0, // C# CONNECTOR_WIDTH    0.01
});

/**
 * Dash geometry for dashed materials, in WORLD units (LineMaterial dash sizes
 * track the world-space line distances, independent of `worldUnits`). Tuned for
 * the worked square-pyramid scale (base 2, height 3) so dashes read as dashes
 * without disintegrating on short edges.
 * @type {{ size: number, gap: number }}
 */
const DASH = Object.freeze({ size: 0.12, gap: 0.08 });

/**
 * Minimum segment length. Below this an edge has effectively projected to a
 * point (e.g. a perfectly vertical edge collapses to a dot on HP) and is
 * dropped — porting the C# EPSILON zero-length filter.
 * @type {number}
 */
const EPSILON = 1e-4;

/**
 * Dot-product threshold separating a sharp, real internal edge from a coplanar
 * triangulation seam. cos(8°) ≈ 0.99 — ported verbatim from the C# constant. Two
 * faces whose normals dot AT OR ABOVE this are treated as coplanar, so the edge
 * between them is a triangulation artifact and is DISCARDED (never drawn), per
 * the C# source and header note 5.
 * @type {number}
 */
const COPLANAR_THRESHOLD = 0.99;

/**
 * Connector-vertex weld tolerance, matching meshAnalyzer's WELD_TOLERANCE. A
 * cube corner has three edges meeting; without dedup it would spawn three
 * identical connector pairs. Quantizing to this grid collapses them to one.
 * @type {number}
 */
const VERTEX_MERGE_TOLERANCE = 1e-3;

/** Quantization grid = 1 / VERTEX_MERGE_TOLERANCE (see meshAnalyzer QUANT). */
const QUANT = 1000;

// ============================================================================
// Edge classification
// ============================================================================

/**
 * Decide whether an edge is a real edge of the solid (and therefore drawn at
 * all). Faithful port of `ProjectionDrawer.DetermineEdgeType`:
 *
 * - **1 face**  → {@link EdgeType.SILHOUETTE} (boundary / outline — always drawn).
 * - **2 faces** → dot of the two world normals; below {@link COPLANAR_THRESHOLD}
 *   it is a real crease ({@link EdgeType.REAL}), at/above it the faces are nearly
 *   coplanar so the edge is a triangulation seam ({@link EdgeType.COPLANAR}) and
 *   is DISCARDED — the C# behaviour we now match (header note 5).
 * - **>2 faces** → non-manifold; treated as {@link EdgeType.REAL}.
 *
 * This is the GEOMETRIC, orbit-invariant decision. The orthogonal, view-dependent
 * solid-vs-dashed decision is made per plane by {@link visibleInHP} /
 * {@link visibleInVP}; an edge that survives here is then independently solid or
 * dashed in each view.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {EdgeType}
 */
export function classifyEdge(faces) {
  if (faces.length === 1) return EdgeType.SILHOUETTE;

  if (faces.length === 2) {
    const dot = faces[0].worldNormal.dot(faces[1].worldNormal);
    return dot >= COPLANAR_THRESHOLD ? EdgeType.COPLANAR : EdgeType.REAL;
  }

  return EdgeType.REAL;
}

/**
 * Is this edge VISIBLE in the HP (top) view, where the observer looks straight
 * down the −Y axis? For a convex solid an edge is visible iff at least one of its
 * incident faces points up toward the observer (`worldNormal.y > 0`). If every
 * incident face points down or is exactly edge-on (`<= 0`), the solid's own body
 * occludes the edge and it is drawn dashed. No depth buffer needed — convexity
 * makes the normal test exact (CLAUDE.md "Edge classification is camera-dependent",
 * resolved analytically here rather than per-pixel).
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function visibleInHP(faces) {
  for (const f of faces) if (f.worldNormal.y > 0) return true;
  return false;
}

/**
 * Is this edge VISIBLE in the VP (front) view, where the observer looks from +X
 * (matching the camera setup)? An edge is visible iff at least one incident face
 * points right toward the observer (`worldNormal.x > 0`); if all incident faces
 * point left or are edge-on (`<= 0`), the edge is occluded and drawn dashed.
 * Convexity again makes the normal test exact.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function visibleInVP(faces) {
  for (const f of faces) if (f.worldNormal.x > 0) return true;
  return false;
}

/**
 * Is this edge VISIBLE in the PP (side / profile) view? The profile observer looks
 * along the Z axis; an edge is visible iff at least one incident face points toward
 * that observer (`worldNormal.z > 0`), otherwise the body occludes it and it is
 * drawn dashed. Convexity makes the normal test exact, as for HP/VP.
 *
 * SIGN (CLAUDE.md): the `> 0` here pairs with the PP_FOLD_TARGET (−90° about local X)
 * fold in main.js. The observer direction is unchanged by the fold, so this `> 0` test
 * is retained; only the side view's PLACEMENT changed (now beside the top view). Re-derive
 * VISUALLY against the worked square pyramid if the fold sign changes — do not flip blindly.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function visibleInPP(faces) {
  for (const f of faces) if (f.worldNormal.z > 0) return true;
  return false;
}

// ============================================================================
// Orthographic projection (handedness-safe — see header note 2)
// ============================================================================

/**
 * Project a world point onto HP, the horizontal plane at Y = 0 — the "drop to
 * the floor" view. Zeroes Y, keeps X and Z. (C#: `new Vector3(p.x, 0, p.z)`.)
 * @param {THREE.Vector3} p
 * @returns {THREE.Vector3}
 */
function projectHP(p) {
  return new THREE.Vector3(p.x, 0, p.z);
}

/**
 * Project a world point onto VP, the vertical plane at X = 0 — the "cast to the
 * wall" view. Zeroes X, keeps Y and Z. (C#: `new Vector3(0, p.y, p.z)`.)
 * @param {THREE.Vector3} p
 * @returns {THREE.Vector3}
 */
function projectVP(p) {
  return new THREE.Vector3(0, p.y, p.z);
}

/**
 * Project a world point onto PP, the profile (side) plane — the "cast to the side
 * wall" view. Zeroes Z, keeps X and Y. The plane's standoff from the solid (its z0
 * offset, and the flatten hinge about the HP∩PP line) is owned by the CONSUMER:
 * main.js parents the returned ppGroup under a hinge group translated to (0, 0, z0)
 * in WORLD space and rotated about its local X (folding the plane down onto the HP),
 * so here we draw the bare side view at z = 0 in that group's local frame. (The third
 * orthographic view — there is no Unity sign to re-derive; like HP/VP it just zeroes
 * one world coordinate.)
 * @param {THREE.Vector3} p
 * @returns {THREE.Vector3}
 */
function projectPP(p) {
  return new THREE.Vector3(p.x, p.y, 0);
}

// ============================================================================
// Segment accumulation — one flat array per visual style, packed into one
// LineSegments2 at the end (header note 4).
// ============================================================================

/**
 * A growing list of line segments sharing one visual style. `positions` is the
 * flat `[x,y,z, x,y,z, …]` buffer LineSegmentsGeometry.setPositions expects,
 * where each consecutive pair of points is one disjoint segment.
 * @typedef {Object} SegmentBatch
 * @property {number[]} positions Flat XYZ pairs; two points (6 floats) per edge.
 */

/** @returns {SegmentBatch} A fresh empty batch. */
function newBatch() {
  return { positions: [] };
}

/**
 * Append one segment to a batch, dropping it if shorter than {@link EPSILON}
 * (the projected-to-a-point case). Ported from the C# CreateLine length guard.
 * @param {SegmentBatch} batch
 * @param {THREE.Vector3} a Segment start.
 * @param {THREE.Vector3} b Segment end.
 */
function addSegment(batch, a, b) {
  if (a.distanceTo(b) < EPSILON) return;
  batch.positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Build a fattened-line object from a batch, or `null` if the batch is empty
 * (so callers never add a degenerate zero-segment object to the scene).
 *
 * @param {SegmentBatch} batch    Accumulated segments.
 * @param {THREE.Color}  color    Line colour.
 * @param {number}       linewidth Width in CSS pixels.
 * @param {boolean}      dashed   Dashed (true) or solid (false).
 * @param {THREE.Vector2} resolution Drawing-buffer size; required by LineMaterial.
 * @returns {LineSegments2 | null}
 */
function buildSegments(batch, color, linewidth, dashed, resolution) {
  if (batch.positions.length === 0) return null;

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(batch.positions);

  const material = new LineMaterial({
    color: color.getHex(),
    linewidth,
    dashed,
    dashSize: DASH.size,
    gapSize: DASH.gap,
    // No cast/receive shadows on technical linework (CLAUDE.md visual style);
    // LineMaterial is unlit already, so nothing else to disable.
  });
  material.resolution.copy(resolution);

  const segments = new LineSegments2(geometry, material);
  // LineDashedMaterial / dashed LineMaterial render solid unless per-vertex line
  // distances exist (CLAUDE.md). For LineSegments2 the distance resets each
  // segment, so dashes stay phase-consistent across disjoint edges.
  if (dashed) segments.computeLineDistances();
  segments.frustumCulled = false; // tiny geometry, avoids cull pop during orbit
  return segments;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * The drawn projection set plus its lifecycle hooks. Mirrors the C#
 * `ProjectionParents` (the three plane sub-groups) and adds the two things a
 * Three.js consumer needs that Unity handled implicitly: a resolution updater
 * for the fattened-line shader, and an explicit dispose() for the WebGL
 * disposal contract (CLAUDE.md — geometry/texture counts must stay flat).
 *
 * @typedef {Object} ProjectionResult
 * @property {THREE.Group} group          Parent — add THIS to the scene.
 * @property {THREE.Group} hpGroup        HP (top-view) lines; toggle `.visible`.
 * @property {THREE.Group} vpGroup        VP (front-view) lines; toggle `.visible`.
 * @property {THREE.Group} connectorGroup Dotted 3D→2D connector lines to HP + VP (upright view).
 * @property {THREE.Group} ppConnectorGroup Dotted 3D→PP connector lines (upright view) — the
 *   side-view counterpart of connectorGroup. Kept SEPARATE so the consumer can reveal it only
 *   once the side view (Step 5) is shown, rather than with the top + front views (Step 4).
 * @property {THREE.Group} flatConnectorGroup Dashed 2D projectors linking the top
 *   view to the FOLDED front view across the ground line — the connector lines of
 *   the flattened drawing. Positioned at the folded layout; the consumer fades them
 *   in as the fold completes (kept out of the fold pivot so they stay static).
 * @property {(width: number, height: number) => void} setResolution
 *   Push a new drawing-buffer size to every LineMaterial. Call once after
 *   creation and again on every resize, or line widths render wrong.
 * @property {() => void} dispose
 *   Dispose every geometry + material and detach the group. Call before
 *   discarding, and inside rebuild() before drawing the next projection.
 */

/**
 * Render the HP/VP orthographic projections and 3D→2D connectors for a solid.
 *
 * Faithful port of `ProjectionDrawer.DrawProjections`, restructured for Three.js
 * (batched fattened lines, token colours, explicit lifecycle) per the header
 * notes. Algorithm:
 *
 *   1. For each welded edge: classify it. DISCARD coplanar triangulation seams
 *      (header note 5). For every surviving edge, project both endpoints to HP
 *      and to VP, then route each projected segment into the SOLID batch for its
 *      plane if the edge is visible in that view, or the DASHED batch if the
 *      solid occludes it there — decided independently per plane (header note 3).
 *   2. Collect every unique 3D endpoint (tolerance-deduped) and, for each, draw
 *      dotted connectors down to its HP point and across to its VP point.
 *   3. Pack each batch into one LineSegments2 and group by plane.
 *
 * Visibility is VIEW-DEPENDENT and per-plane: the same edge may be solid in HP
 * and dashed in VP. This replaces the earlier "VP always dashed" cue, which mixed
 * up the Two-Cue styling with true occlusion. `drawHidden: false` suppresses the
 * dashed occluded edges entirely (the bare C# outline); endpoints are still
 * collected so connectors stay complete.
 *
 * @param {Map<string, import('./meshAnalyzer.js').EdgeRecord>} edgeMap
 *   Welded edge→faces map from meshAnalyzer.buildEdgeMap (world-space endpoints).
 * @param {Object} [options]
 * @param {number} [options.width=window.innerWidth]   Initial drawing-buffer width.
 * @param {number} [options.height=window.innerHeight] Initial drawing-buffer height.
 * @param {boolean} [options.drawHidden=true] Draw occluded edges as dashed lines.
 * @param {boolean} [options.drawConnectors=true] Draw the dotted 3D→2D connectors.
 * @param {number} [options.z0=0] PP standoff (ppHingeGroup.position.z, owned by the
 *   consumer). Needed only to place the folded side-view flat connectors at z0 − x;
 *   harmless at 0 when no profile plane has been seated yet.
 * @returns {ProjectionResult}
 */
export function drawProjections(edgeMap, options = {}) {
  const {
    width = window.innerWidth,
    height = window.innerHeight,
    drawHidden = true,
    drawConnectors = true,
    z0 = 0,
  } = options;

  const resolution = new THREE.Vector2(width, height);

  // Resolved tokens (read once per build). Each plane owns a hue — HP teal, VP
  // orange — and carries occlusion by SOLID-vs-DASH within that hue, not by a
  // separate colour (header note 3 / DESIGN.md). Connectors are bench-grey.
  const hpColor = cssColor('--color-hp-line');
  const vpColor = cssColor('--color-vp-line');
  const ppColor = cssColor('--color-pp-line');
  const connectorColor = cssColor('--color-bench-grey');

  // Two batches per plane: visible (solid) and occluded (dashed). An edge lands
  // in each plane's visible/occluded batch independently of the other two planes.
  const hpVisible = newBatch();
  const hpHidden = newBatch();
  const vpVisible = newBatch();
  const vpHidden = newBatch();
  const ppVisible = newBatch();
  const ppHidden = newBatch();
  const connectors = newBatch();
  const ppConnectors = newBatch();
  const flatConnectors = newBatch();

  // Unique 3D endpoints for connector generation, keyed by quantized position
  // (O(1) dedup, vs the C# O(n²) distance scan over a HashSet).
  /** @type {Map<string, THREE.Vector3>} */
  const uniqueVertices = new Map();

  for (const { edge, faces } of edgeMap.values()) {
    const type = classifyEdge(faces);

    // Coplanar triangulation seams are not real edges — discard the line, but
    // still register endpoints so connectors stay complete (the C# vertex step
    // ran regardless of whether a line was drawn).
    if (type === EdgeType.COPLANAR) {
      registerVertex(uniqueVertices, edge.p1);
      registerVertex(uniqueVertices, edge.p2);
      continue;
    }

    const hp1 = projectHP(edge.p1);
    const hp2 = projectHP(edge.p2);
    const vp1 = projectVP(edge.p1);
    const vp2 = projectVP(edge.p2);

    // Decide solid vs dashed INDEPENDENTLY for each plane. A silhouette/boundary
    // edge (1 face) and a real internal crease run through the same convex normal
    // test; if drawHidden is off, an edge occluded in a given view is dropped from
    // that view only (it may still be visible — solid — in the other).
    if (visibleInHP(faces)) {
      addSegment(hpVisible, hp1, hp2);
    } else if (drawHidden) {
      addSegment(hpHidden, hp1, hp2);
    }

    if (visibleInVP(faces)) {
      addSegment(vpVisible, vp1, vp2);
    } else if (drawHidden) {
      addSegment(vpHidden, vp1, vp2);
    }

    const pp1 = projectPP(edge.p1);
    const pp2 = projectPP(edge.p2);
    if (visibleInPP(faces)) {
      addSegment(ppVisible, pp1, pp2);
    } else if (drawHidden) {
      addSegment(ppHidden, pp1, pp2);
    }

    registerVertex(uniqueVertices, edge.p1);
    registerVertex(uniqueVertices, edge.p2);
  }

  // Connector lines: drop each unique vertex to HP and cast it to VP.
  if (drawConnectors) {
    for (const vertex of uniqueVertices.values()) {
      addSegment(connectors, vertex, projectHP(vertex));
      addSegment(connectors, vertex, projectVP(vertex));

      // Side-view (PP) connector, upright 3D view: trace the vertex straight back to the
      // profile plane along +Z. The PP sits at the standoff z0, drawing the side view at
      // world z = z0 (its hinge's local z = 0), so the connector runs from (x, y, z) to
      // (x, y, z0) — the Z-axis analogue of the HP drop (−Y) and VP cast (−X). Routed into
      // its OWN batch so the consumer can hold it hidden until the side-view step.
      addSegment(ppConnectors, vertex, new THREE.Vector3(vertex.x, vertex.y, z0));

      // Flattened-drawing projector: link the top-view point to the FOLDED front-
      // view point. The consumer folds the VP +90° about the ground line (the Z
      // axis), which carries a VP point (0, y, z) to (−y, 0, z) on the floor; the
      // HP point is (x, 0, z). The two share z, so this is the standard projector
      // crossing the ground line that aligns the front and top views on one sheet.
      const foldedFront = new THREE.Vector3(-vertex.y, 0, vertex.z);
      addSegment(flatConnectors, projectHP(vertex), foldedFront);

      // Side-view projector: link the TOP-view point to the folded SIDE-view point.
      // The PP now hinges DOWN onto the HP about the HP∩PP line (−90° about local X, in
      // world space), carrying a PP point (x, y, 0) at standoff z0 to (x, 0, z0 − y) —
      // beside the TOP view. Top and side share world X (= the solid's x), so this
      // projector runs along Z at constant x, tying the side view to the top view.
      const foldedSide = new THREE.Vector3(vertex.x, 0, z0 - vertex.y);
      addSegment(flatConnectors, projectHP(vertex), foldedSide);
    }
  }

  // --- Assemble the scene graph ---------------------------------------------
  const hpGroup = new THREE.Group();
  hpGroup.name = 'HP Projection';
  const vpGroup = new THREE.Group();
  vpGroup.name = 'VP Projection';
  const connectorGroup = new THREE.Group();
  connectorGroup.name = 'Connector Lines';
  const ppConnectorGroup = new THREE.Group();
  ppConnectorGroup.name = 'PP Connector Lines';
  const flatConnectorGroup = new THREE.Group();
  flatConnectorGroup.name = 'Flat Projectors';
  const ppGroup = new THREE.Group();
  ppGroup.name = 'PP Projection';

  // Per plane: visible = solid + full weight, occluded = dashed + lighter weight,
  // both in the plane's own hue. VP visible is now SOLID (was wrongly dashed).
  addIfPresent(hpGroup, buildSegments(hpVisible, hpColor, LINE_WIDTH_PX.visible, false, resolution));
  addIfPresent(hpGroup, buildSegments(hpHidden, hpColor, LINE_WIDTH_PX.hidden, true, resolution));
  addIfPresent(vpGroup, buildSegments(vpVisible, vpColor, LINE_WIDTH_PX.visible, false, resolution));
  addIfPresent(vpGroup, buildSegments(vpHidden, vpColor, LINE_WIDTH_PX.hidden, true, resolution));
  addIfPresent(ppGroup, buildSegments(ppVisible, ppColor, LINE_WIDTH_PX.visible, false, resolution));
  addIfPresent(ppGroup, buildSegments(ppHidden, ppColor, LINE_WIDTH_PX.hidden, true, resolution));
  addIfPresent(connectorGroup, buildSegments(connectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));
  addIfPresent(ppConnectorGroup, buildSegments(ppConnectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));
  addIfPresent(flatConnectorGroup, buildSegments(flatConnectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));

  const group = new THREE.Group();
  group.name = 'Projections';
  // flatConnectorGroup, ppGroup and ppConnectorGroup are NOT added here: the consumer
  // parents them directly (ppGroup under the PP hinge inside the fold pivot;
  // flatConnectorGroup + ppConnectorGroup in world space, the latter gated on the side-view
  // step) so they sit at the right place. setResolution + dispose below reach them by held
  // reference regardless.
  group.add(hpGroup, vpGroup, connectorGroup);

  return {
    group,
    hpGroup,
    vpGroup,
    ppGroup,
    connectorGroup,
    ppConnectorGroup,
    flatConnectorGroup,
    setResolution(w, h) {
      resolution.set(w, h);
      const applyResolution = (root) => root.traverse((obj) => {
        const mat = /** @type {LineSegments2} */ (obj).material;
        if (mat instanceof LineMaterial) mat.resolution.copy(resolution);
      });
      // Walk every held sub-group: vpGroup and ppGroup get reparented OUT of `group`
      // into the fold pivot by the consumer, so `group.traverse` alone would miss them.
      for (const sub of [group, ppGroup, ppConnectorGroup, flatConnectorGroup]) applyResolution(sub);
    },
    dispose() {
      // Full WebGL disposal contract (CLAUDE.md): geometry + material per object,
      // then detach. No textures on LineMaterial, so none to dispose.
      //
      // Dispose by HELD REFERENCE to the sub-groups rather than traversing `group`:
      // the consumer (main.js flatten) reparents vpGroup and ppGroup OUT of `group`
      // into the fold pivot, so a `group.traverse` would miss them and leak their
      // LineMaterials. Walking the sub-groups directly disposes everything we
      // created regardless of who currently parents it.
      for (const sub of [hpGroup, vpGroup, ppGroup, connectorGroup, ppConnectorGroup, flatConnectorGroup]) {
        sub.traverse((obj) => {
          const line = /** @type {LineSegments2} */ (obj);
          line.geometry?.dispose();
          const mat = line.material;
          if (mat instanceof LineMaterial) mat.dispose();
        });
        sub.clear();
        sub.parent?.remove(sub); // detach from `group` OR from the fold pivot
      }
      group.clear();
      group.parent?.remove(group);
    },
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Record a vertex for connector generation, deduping by quantized position so
 * that the several edges meeting at a corner contribute a single connector pair
 * (the C# AddVertexIfNew, done by lattice key instead of distance scan).
 * @param {Map<string, THREE.Vector3>} map
 * @param {THREE.Vector3} v
 */
function registerVertex(map, v) {
  const key =
    `${Math.round(v.x * QUANT)},${Math.round(v.y * QUANT)},${Math.round(v.z * QUANT)}`;
  if (!map.has(key)) map.set(key, v.clone());
}

/**
 * Add a child to a group only when present (buildSegments returns null for an
 * empty batch). Keeps empty objects out of the scene graph and dispose loop.
 * @param {THREE.Group} group
 * @param {THREE.Object3D | null} child
 */
function addIfPresent(group, child) {
  if (child) group.add(child);
}
