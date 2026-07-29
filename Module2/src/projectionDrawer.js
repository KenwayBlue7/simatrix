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
//     tokens, never hard-coded. The C#'s 3D TextMeshPro dimension labels are not
//     ported AS SUCH, but a separate BIS SP 46:2003 Type-B DIMENSIONING layer is
//     now emitted, SPLIT per view into hpDimensionGroup + vpDimensionGroup so the
//     front-view dims fold with the VP (ADR-041): overall width / height + distances
//     from HP / VP for the top + front views, drawn as continuous narrow lines with FILLED 3:1
//     triangle arrowheads (a MeshBasicMaterial triangle soup, ADR-041) and CSS2D
//     numeric labels (see the DIM_* constants + the dimensioning helpers at the foot).
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
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

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
// Dimensioning constants (BIS SP 46:2003 Type B)
// ============================================================================

/**
 * The dimension layer draws the two textbook orthographic measurements — overall
 * width / height and the distances from the reference planes (HP / VP) — for the
 * top and front views. The extension + dimension LINES are Type B continuous NARROW
 * lines packed into ONE LineSegments2 at 1.0px, tinted --color-ink, with CSS2D
 * --font-mono / --text-xs numeric labels.
 *
 * ARROWHEADS ARE FILLED 3:1 TRIANGLES (ADR-041, overturning the earlier open chevron).
 * SP 46:2003 exam grading wants the solid BIS wedge, not an open "<", so each terminator
 * is a filled isosceles triangle — length LEN along the dimension line, full back width
 * LEN/3 (half-width ±LEN/6) — the recognisable Type-B cue (ADR-018 textbook fidelity). A
 * fill cannot live in a LineSegments2, so the arrowhead triangles accumulate in a SEPARATE
 * arrow buffer (one per view — hpArrowPos / vpArrowPos) and become ONE MeshBasicMaterial({
 * side: DoubleSide }) triangle soup per view (same --color-ink tone, unlit/flat) — the same filled form
 * annotations.js (Bearing Block) and the Points Canvas2D sheet already use. The single-
 * material disposal contract is kept by tearing the mesh's geometry + material down in the
 * same dispose() traversal that walks the line groups.
 */
const DIM_LINE_PX = 1.0;         // Type B continuous narrow line weight, in CSS px
const WORLD_TO_MM = 10;          // ADR-018 declared scale: 1 world unit = 10 mm
const DIM_OFFSET = 0.9;          // world gap from a view to its dimension line
const DIM_EXT_GAP = 0.06;        // world gap: measured feature → start of extension line
const DIM_EXT_OVERSHOOT = 0.12;  // world: extension line past the dimension line
const DIM_ARROW_LEN = 0.22;      // world triangle length; full back width = LEN/3 (half ±LEN/6) → 3:1

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

/**
 * Is this edge on the OUTLINE (silhouette boundary) of the HP (top) view — the ADR-087 "outermost
 * boundary lines, drawn first" beat? Deliberately built as `visibleInHP(faces) &&` (straddle OR
 * single-face) so **outline is a strict SUBSET of visible, by construction** — never a "hidden
 * outline" edge. Straddling means at least one incident face faces up (`worldNormal.y > 0`) AND at
 * least one faces down/edge-on (`<= 0`); a single-incident-face edge straddles trivially (there is
 * nothing on its far side to contradict it).
 *
 * DIFFERENT from `EdgeType.SILHOUETTE` (meshAnalyzer's classification is 3D and orbit-invariant —
 * "how many faces share this edge, at all") and from plain `visibleInHP` (outline is the narrower
 * test: a visible internal crease on a convex solid, e.g. a pyramid's near-side base edge, is
 * visible but not a boundary line). Because outline ⊆ visible, outline edges are redrawn again by
 * the later visible-face / visible-generator beats — accepted deliberately (ADR-087): a learner
 * re-traces the outline before adding interior detail, matching the textbook, rather than the code
 * suppressing the overlap.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function onOutlineHP(faces) {
  if (!visibleInHP(faces)) return false;
  if (faces.length === 1) return true;
  let front = false, back = false;
  for (const f of faces) { if (f.worldNormal.y > 0) front = true; else back = true; }
  return front && back;
}

/**
 * Is this edge on the OUTLINE of the VP (front) view? Same `visibleInVP(faces) &&` straddle test
 * as {@link onOutlineHP}, against the VP observer axis (`worldNormal.x`) — see that function's
 * header for the full rationale (outline ⊆ visible by construction, deliberate beat-1 redraw
 * under ADR-087).
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function onOutlineVP(faces) {
  if (!visibleInVP(faces)) return false;
  if (faces.length === 1) return true;
  let front = false, back = false;
  for (const f of faces) { if (f.worldNormal.x > 0) front = true; else back = true; }
  return front && back;
}

/**
 * Is this edge on the OUTLINE of the PP (side) view? Same `visibleInPP(faces) &&` straddle test as
 * {@link onOutlineHP}, against the PP observer axis (`worldNormal.z`) — see that function's header
 * for the full rationale. Unused while ADR-088 keeps the side view out of the Show Method replay,
 * but kept alongside its HP/VP siblings rather than special-cased away — `drawProjections`
 * classifies all three planes uniformly, and a future consumer (the live 3D pane, or a restored
 * side-view beat) gets it for free.
 *
 * @param {import('./meshAnalyzer.js').Face[]} faces Faces sharing the edge.
 * @returns {boolean}
 */
function onOutlinePP(faces) {
  if (!visibleInPP(faces)) return false;
  if (faces.length === 1) return true;
  let front = false, back = false;
  for (const f of faces) { if (f.worldNormal.z > 0) front = true; else back = true; }
  return front && back;
}

/**
 * Axis-alignment threshold for the base/generator edge split (ADR-087). Compared against the
 * ABSOLUTE VALUE of the dot product of a (unit) edge direction and the solid's (unit) axis
 * direction — a base/cap edge is perpendicular to the axis (dot ≈ 0), a generator (a prism's
 * lateral edge, a pyramid/cone's slant edge) is not. Same order of magnitude as
 * {@link WELD_TOLERANCE}-style epsilons elsewhere in this codebase (meshAnalyzer.js `1e-3`): far
 * below the smallest real slant angle on any generated solid, so it only ever absorbs float error
 * from the matrix transform, never mis-splits a genuine edge.
 * @type {number}
 */
const AXIS_ALIGN_EPS = 1e-3;

/**
 * Classify an edge as a solid's BASE/cap edge or a GENERATOR (longitudinal/slant edge) — the
 * ADR-087 split `strokeMethodLines`'s beats key off, alongside the existing visible/hidden split.
 * Every Module 2 solid is generated upright about its own LOCAL +Y axis (CLAUDE.md); `axisDir` is
 * that axis rotated into WORLD space by the pose's own rotation (the caller's job — see
 * `drawProjections`'s `options.axis`). Because a pose's transform is always rigid (rotation +
 * translation, uniform scale), a base/cap edge — perpendicular to the local axis by construction —
 * stays perpendicular to `axisDir` in world space, and a generator — which has a component along
 * the axis — keeps a non-zero dot product regardless of the pose. A zero-length edge (should not
 * occur; addSegment's own EPSILON guard drops it from the drawn batches downstream regardless)
 * defaults to `'base'` rather than dividing by zero.
 * @param {THREE.Vector3} p1 Edge start (world).
 * @param {THREE.Vector3} p2 Edge end (world).
 * @param {THREE.Vector3} axisDir Unit world-space solid axis.
 * @returns {'base' | 'generator'}
 */
function edgeKindOf(p1, p2, axisDir) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < EPSILON) return 'base';
  const dot = (dx * axisDir.x + dy * axisDir.y + dz * axisDir.z) / len;
  return Math.abs(dot) > AXIS_ALIGN_EPS ? 'generator' : 'base';
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
 * @param {'base' | 'generator' | 'outline' | undefined} [kind] ADR-087 edge-feature tag, stamped
 *   onto `userData.kind` beside the existing `userData.hidden` — undefined for batches this
 *   classification doesn't apply to (connectors, dimensions).
 * @returns {LineSegments2 | null}
 */
function buildSegments(batch, color, linewidth, dashed, resolution, kind) {
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
  // Drafting line precedence: a visible continuous line MUST fully occlude a
  // coincident hidden dashed line (e.g. the Cube's front/back faces project to
  // the identical square). LineSegments2 renders fat lines as triangle fills, so
  // equal-depth solid/dashed quads z-fight and the fat-line triangle jitter lets
  // dashed fragments leak through unpredictably. Bias the DASHED material away
  // from camera so the solid always wins the depth test regardless of draw order.
  if (dashed) {
    material.polygonOffset = true;
    material.polygonOffsetFactor = 1;
    material.polygonOffsetUnits = 1;
  }

  const segments = new LineSegments2(geometry, material);
  // LineDashedMaterial / dashed LineMaterial render solid unless per-vertex line
  // distances exist (CLAUDE.md). For LineSegments2 the distance resets each
  // segment, so dashes stay phase-consistent across disjoint edges.
  if (dashed) segments.computeLineDistances();
  segments.frustumCulled = false; // tiny geometry, avoids cull pop during orbit
  // Belt-and-suspenders paint order: solid after dashed, so even a depth-test
  // edge case still resolves to the correct drafting precedence.
  segments.renderOrder = dashed ? 0 : 1;
  // Tag solid-vs-dashed on the object itself (not just the material) so a consumer
  // reading these LineSegments2 back out of the group (main.js drawCompare, the 2D
  // Compare canvas) can tell visible from occluded without relying on undocumented
  // LineMaterial getter behaviour.
  segments.userData.hidden = dashed;
  // ADR-087: base/generator/outline tag, same reasoning as userData.hidden above — read back
  // by harvestLineGroup (main.js) so Show Method's beat gates can filter without re-deriving
  // face normals from data that's already been discarded by this point.
  if (kind) segments.userData.kind = kind;
  return segments;
}

/**
 * Build the filled-arrowhead mesh from a flat triangle-vertex buffer (ADR-041), or
 * `null` for an empty buffer. ONE unlit MeshBasicMaterial triangle soup, DoubleSide so
 * the wedge stays solid from either orbit side, tinted the dimension ink. A fill cannot
 * live in a LineSegments2, so the Type-B arrowheads ride here instead of in the line
 * batch; dispose() tears its geometry + material down with the rest of the layer.
 *
 * @param {number[]}    positions Flat XYZ triangle vertices (9 floats per arrowhead).
 * @param {THREE.Color} color     Fill colour (the dimension ink).
 * @returns {THREE.Mesh | null}
 */
function buildArrowMesh(positions, color) {
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.MeshBasicMaterial({ color: color.getHex(), side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // tiny geometry, avoids cull pop during orbit
  return mesh;
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
 * @property {THREE.Group} hpDimensionGroup BIS SP 46:2003 Type-B dimensions for the TOP
 *   view only (depth X + distance from VP): one 1.0px --color-ink LineSegments2, a
 *   --color-ink MeshBasicMaterial filled-3:1-triangle arrowhead soup (ADR-041), plus
 *   CSS2D --font-mono / --text-xs labels. Built in the upright world frame; NOT added
 *   to `group` — the consumer parents it under the HP (world space, stays flat). Suppress
 *   the whole dimension layer with `options.drawDimensions = false`.
 * @property {THREE.Group} vpDimensionGroup BIS SP 46:2003 Type-B dimensions for the FRONT
 *   view only (height Y, width Z + clearance above HP): same three sub-objects as
 *   hpDimensionGroup, built in the same upright X = 0 frame as vpGroup. Kept SEPARATE so the
 *   consumer parents it under the VP FOLD PIVOT — then the front-view dimensions fold down
 *   flat WITH the VP instead of standing upright after the flatten (the split's whole point).
 * @property {THREE.Group} hpOutlineGroup ADR-087 — the HP view's outline-only edges (see
 *   `onOutlineHP`), same style as `hpGroup`'s visible batch. A redundant COPY, not a subset
 *   carved out of `hpGroup`: those edges are still present in `hpGroup` too (a beat-gated
 *   consumer needs both "outline alone" and "every visible edge including the outline" as
 *   independently selectable sets). NOT added to `group` or to `hpGroup` — the live 3D pane
 *   has no use for a redundant duplicate layer and simply never reads this property; Show
 *   Method's headless harvest is the only consumer. Held by `dispose()`/`setResolution()`
 *   regardless of whether anything ever parents it.
 * @property {THREE.Group} vpOutlineGroup Same as `hpOutlineGroup`, for the VP view.
 * @property {THREE.Group} ppOutlineGroup Same as `hpOutlineGroup`, for the PP view.
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
 * @param {THREE.Vector3} [options.axis=(0,1,0)] ADR-087 — the solid's WORLD-space axis
 *   direction (unit vector), used only to split each plane's visible/hidden batch further into
 *   base/generator sub-batches (see `edgeKindOf`). Every Module 2 solid is generated upright
 *   about LOCAL +Y (CLAUDE.md); pass local +Y rotated by the pose's own rotation — e.g.
 *   `new THREE.Vector3(0, 1, 0).transformDirection(matrixWorld)` for the live mesh, or the same
 *   against a headless stage's pose matrix. Defaults to world +Y (correct for an upright,
 *   unrotated solid) so existing callers that never pass it still classify sensibly.
 * @returns {ProjectionResult}
 */
export function drawProjections(edgeMap, options = {}) {
  const {
    width = window.innerWidth,
    height = window.innerHeight,
    drawHidden = true,
    drawConnectors = true,
    drawDimensions = true,
    z0 = 0,
    axis = new THREE.Vector3(0, 1, 0),
  } = options;

  const resolution = new THREE.Vector2(width, height);

  // Resolved tokens (read once per build). Each plane owns a hue — HP teal, VP
  // orange — and carries occlusion by SOLID-vs-DASH within that hue, not by a
  // separate colour (header note 3 / DESIGN.md). Connectors are bench-grey.
  const hpColor = cssColor('--color-hp-line');
  const vpColor = cssColor('--color-vp-line');
  const ppColor = cssColor('--color-pp-line');
  const connectorColor = cssColor('--color-bench-grey');
  const inkColor = cssColor('--color-ink'); // dimension linework (Type B, Flat-Ink)

  // ADR-087: FOUR batches per plane now, not two — visible/hidden (unchanged) crossed with
  // base/generator (new, via edgeKindOf). Plus one more OUTLINE batch per plane (visible-only,
  // a deliberate redundant copy — see onOutlineHP's header and hpOutlineGroup's JSDoc above).
  const hpVisibleBase = newBatch();
  const hpVisibleGenerator = newBatch();
  const hpHiddenBase = newBatch();
  const hpHiddenGenerator = newBatch();
  const hpOutline = newBatch();
  const vpVisibleBase = newBatch();
  const vpVisibleGenerator = newBatch();
  const vpHiddenBase = newBatch();
  const vpHiddenGenerator = newBatch();
  const vpOutline = newBatch();
  const ppVisibleBase = newBatch();
  const ppVisibleGenerator = newBatch();
  const ppHiddenBase = newBatch();
  const ppHiddenGenerator = newBatch();
  const ppOutline = newBatch();
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

    // ADR-087: base-vs-generator is a single, plane-independent classification (it depends only
    // on the edge's own 3D direction against the solid's axis, not on any observer), computed
    // once and reused for all three planes below.
    const kind = edgeKindOf(edge.p1, edge.p2, axis);

    // Decide solid vs dashed INDEPENDENTLY for each plane. A silhouette/boundary
    // edge (1 face) and a real internal crease run through the same convex normal
    // test; if drawHidden is off, an edge occluded in a given view is dropped from
    // that view only (it may still be visible — solid — in the other).
    if (visibleInHP(faces)) {
      addSegment(kind === 'generator' ? hpVisibleGenerator : hpVisibleBase, hp1, hp2);
      if (onOutlineHP(faces)) addSegment(hpOutline, hp1, hp2); // deliberate redundant copy
    } else if (drawHidden) {
      addSegment(kind === 'generator' ? hpHiddenGenerator : hpHiddenBase, hp1, hp2);
    }

    if (visibleInVP(faces)) {
      addSegment(kind === 'generator' ? vpVisibleGenerator : vpVisibleBase, vp1, vp2);
      if (onOutlineVP(faces)) addSegment(vpOutline, vp1, vp2);
    } else if (drawHidden) {
      addSegment(kind === 'generator' ? vpHiddenGenerator : vpHiddenBase, vp1, vp2);
    }

    const pp1 = projectPP(edge.p1);
    const pp2 = projectPP(edge.p2);
    if (visibleInPP(faces)) {
      addSegment(kind === 'generator' ? ppVisibleGenerator : ppVisibleBase, pp1, pp2);
      if (onOutlinePP(faces)) addSegment(ppOutline, pp1, pp2);
    } else if (drawHidden) {
      addSegment(kind === 'generator' ? ppHiddenGenerator : ppHiddenBase, pp1, pp2);
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

  // --- Dimensioning layer (BIS SP 46:2003 Type B) ---------------------------
  // Overall width / height + the distances from HP / VP for the top and front views.
  // Built in the UPRIGHT world frame — the front view lies in the X = 0 plane (screen
  // axes: Z horizontal, Y vertical) and the top view in the Y = 0 plane (Z horizontal,
  // X the depth) — the same frame hpGroup / vpGroup draw in, so the consumer folds and
  // parents this group alongside them. Every measurement is world-extent × WORLD_TO_MM.
  // SPLIT per view (ADR-041 fold fix): the front-view (VP) dimensions must fold with the
  // VP, the top-view (HP) dimensions must stay flat under the HP — so each view gets its
  // own line batch + filled-arrowhead buffer + label list, realised as its own group below.
  const vpDimBatch = newBatch();
  const hpDimBatch = newBatch();
  // Filled 3:1 arrowhead triangles (ADR-041) — flat triangle-vertex buffers, each realised as
  // ONE MeshBasicMaterial soup below (a fill cannot live in a LineSegments2 line batch).
  const vpArrowPos = [];
  const hpArrowPos = [];
  /** @type {{ pos: THREE.Vector3, text: string }[]} */
  const vpDimLabels = [];
  /** @type {{ pos: THREE.Vector3, text: string }[]} */
  const hpDimLabels = [];
  if (drawDimensions && edgeMap.size > 0) {
    const box = new THREE.Box3();
    for (const { edge } of edgeMap.values()) {
      box.expandByPoint(edge.p1);
      box.expandByPoint(edge.p2);
    }
    const { min, max } = box;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const EXTENT_EPS = 1e-3;

    // Front view (VP, X = 0) → vpDim* (folds with the VP). Height (Y), width (Z, shared with
    // the top view), and the clearance above the ground line (Y = 0 = HP∩VP) when the solid
    // stands off HP. Built in the X = 0 plane, the same frame vpGroup draws in, so parenting
    // this group under the VP fold pivot folds these dims down flat with the front view.
    if (max.y - min.y > EXTENT_EPS) {
      pushLinearDim(vpDimBatch, vpArrowPos, vpDimLabels, V(0, min.y, max.z), V(0, max.y, max.z),
        V(0, 0, DIM_OFFSET), (max.y - min.y) * WORLD_TO_MM);
    }
    if (max.z - min.z > EXTENT_EPS) {
      pushLinearDim(vpDimBatch, vpArrowPos, vpDimLabels, V(0, max.y, min.z), V(0, max.y, max.z),
        V(0, DIM_OFFSET, 0), (max.z - min.z) * WORLD_TO_MM);
    }
    if (min.y > EXTENT_EPS) {
      pushLinearDim(vpDimBatch, vpArrowPos, vpDimLabels, V(0, 0, min.z), V(0, min.y, min.z),
        V(0, 0, -DIM_OFFSET), min.y * WORLD_TO_MM);
    }

    // Top view (HP, Y = 0) → hpDim* (stays flat under the HP). Depth (X) and the distance
    // from VP (the top view's clearance from the ground line X = 0) when the solid stands off VP.
    if (max.x - min.x > EXTENT_EPS) {
      pushLinearDim(hpDimBatch, hpArrowPos, hpDimLabels, V(min.x, 0, min.z), V(max.x, 0, min.z),
        V(0, 0, -DIM_OFFSET), (max.x - min.x) * WORLD_TO_MM);
    }
    if (min.x > EXTENT_EPS) {
      pushLinearDim(hpDimBatch, hpArrowPos, hpDimLabels, V(0, 0, max.z), V(min.x, 0, max.z),
        V(0, 0, DIM_OFFSET), min.x * WORLD_TO_MM);
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
  const hpDimensionGroup = new THREE.Group();
  hpDimensionGroup.name = 'HP Dimensions';
  const vpDimensionGroup = new THREE.Group();
  vpDimensionGroup.name = 'VP Dimensions';
  // ADR-087 — redundant-copy outline layers (see hpOutlineGroup's JSDoc above). NOT added to
  // `group`/`hpGroup`/etc.; only Show Method's headless harvest reads these.
  const hpOutlineGroup = new THREE.Group();
  hpOutlineGroup.name = 'HP Outline';
  const vpOutlineGroup = new THREE.Group();
  vpOutlineGroup.name = 'VP Outline';
  const ppOutlineGroup = new THREE.Group();
  ppOutlineGroup.name = 'PP Outline';

  // Per plane: visible = solid + full weight, occluded = dashed + lighter weight, both in the
  // plane's own hue. VP visible is now SOLID (was wrongly dashed). ADR-087: each of visible/
  // hidden now splits further into base/generator (4 children per plane instead of 2) — same
  // pixels as before, just reorganized into more, smaller batches so a consumer can tell them
  // apart; `kind` never affects colour or width.
  addIfPresent(hpGroup, buildSegments(hpVisibleBase, hpColor, LINE_WIDTH_PX.visible, false, resolution, 'base'));
  addIfPresent(hpGroup, buildSegments(hpVisibleGenerator, hpColor, LINE_WIDTH_PX.visible, false, resolution, 'generator'));
  addIfPresent(hpGroup, buildSegments(hpHiddenBase, hpColor, LINE_WIDTH_PX.hidden, true, resolution, 'base'));
  addIfPresent(hpGroup, buildSegments(hpHiddenGenerator, hpColor, LINE_WIDTH_PX.hidden, true, resolution, 'generator'));
  addIfPresent(hpOutlineGroup, buildSegments(hpOutline, hpColor, LINE_WIDTH_PX.visible, false, resolution, 'outline'));
  addIfPresent(vpGroup, buildSegments(vpVisibleBase, vpColor, LINE_WIDTH_PX.visible, false, resolution, 'base'));
  addIfPresent(vpGroup, buildSegments(vpVisibleGenerator, vpColor, LINE_WIDTH_PX.visible, false, resolution, 'generator'));
  addIfPresent(vpGroup, buildSegments(vpHiddenBase, vpColor, LINE_WIDTH_PX.hidden, true, resolution, 'base'));
  addIfPresent(vpGroup, buildSegments(vpHiddenGenerator, vpColor, LINE_WIDTH_PX.hidden, true, resolution, 'generator'));
  addIfPresent(vpOutlineGroup, buildSegments(vpOutline, vpColor, LINE_WIDTH_PX.visible, false, resolution, 'outline'));
  addIfPresent(ppGroup, buildSegments(ppVisibleBase, ppColor, LINE_WIDTH_PX.visible, false, resolution, 'base'));
  addIfPresent(ppGroup, buildSegments(ppVisibleGenerator, ppColor, LINE_WIDTH_PX.visible, false, resolution, 'generator'));
  addIfPresent(ppGroup, buildSegments(ppHiddenBase, ppColor, LINE_WIDTH_PX.hidden, true, resolution, 'base'));
  addIfPresent(ppGroup, buildSegments(ppHiddenGenerator, ppColor, LINE_WIDTH_PX.hidden, true, resolution, 'generator'));
  addIfPresent(ppOutlineGroup, buildSegments(ppOutline, ppColor, LINE_WIDTH_PX.visible, false, resolution, 'outline'));
  addIfPresent(connectorGroup, buildSegments(connectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));
  addIfPresent(ppConnectorGroup, buildSegments(ppConnectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));
  addIfPresent(flatConnectorGroup, buildSegments(flatConnectors, connectorColor, LINE_WIDTH_PX.connector, true, resolution));

  // The dimension layer, per view: one SOLID Type-B narrow line in --color-ink (extension +
  // dimension lines), the FILLED 3:1 arrowheads as one --color-ink MeshBasicMaterial triangle
  // soup (ADR-041), plus one CSS2D --font-mono / --text-xs label per measurement. Built into
  // TWO groups so the consumer can fold the front-view dims with the VP and leave the top-view
  // dims flat under the HP.
  addIfPresent(hpDimensionGroup, buildSegments(hpDimBatch, inkColor, DIM_LINE_PX, false, resolution));
  addIfPresent(hpDimensionGroup, buildArrowMesh(hpArrowPos, inkColor));
  for (const { pos, text } of hpDimLabels) {
    const label = makeDimLabel(text);
    label.position.copy(pos);
    hpDimensionGroup.add(label);
  }
  addIfPresent(vpDimensionGroup, buildSegments(vpDimBatch, inkColor, DIM_LINE_PX, false, resolution));
  addIfPresent(vpDimensionGroup, buildArrowMesh(vpArrowPos, inkColor));
  for (const { pos, text } of vpDimLabels) {
    const label = makeDimLabel(text);
    label.position.copy(pos);
    vpDimensionGroup.add(label);
  }

  const group = new THREE.Group();
  group.name = 'Projections';
  // flatConnectorGroup, ppGroup, ppConnectorGroup and the two dimension groups are NOT added
  // here: the consumer parents them directly (ppGroup under the PP hinge inside the fold pivot;
  // flatConnectorGroup + ppConnectorGroup in world space, the latter gated on the side-view
  // step; hpDimensionGroup under the HP in world space, vpDimensionGroup under the VP fold pivot
  // so the front dims fold flat — both gated on the dimensioning step so the sheet is not
  // measured before it is drawn) so they sit at the right place. setResolution + dispose below
  // reach them by held reference regardless.
  group.add(hpGroup, vpGroup, connectorGroup);

  return {
    group,
    hpGroup,
    vpGroup,
    ppGroup,
    connectorGroup,
    ppConnectorGroup,
    flatConnectorGroup,
    hpDimensionGroup,
    vpDimensionGroup,
    hpOutlineGroup,
    vpOutlineGroup,
    ppOutlineGroup,
    setResolution(w, h) {
      resolution.set(w, h);
      const applyResolution = (root) => root.traverse((obj) => {
        const mat = /** @type {LineSegments2} */ (obj).material;
        if (mat instanceof LineMaterial) mat.resolution.copy(resolution);
      });
      // Walk every held sub-group: vpGroup, ppGroup and the two dimension groups get reparented
      // OUT of `group` into the fold pivot / view frame by the consumer, so `group.traverse`
      // alone would miss them. The three ADR-087 outline groups are never parented anywhere by
      // anyone, but still hold LineMaterials that need the current resolution.
      for (const sub of [group, ppGroup, ppConnectorGroup, flatConnectorGroup, hpDimensionGroup, vpDimensionGroup, hpOutlineGroup, vpOutlineGroup, ppOutlineGroup]) applyResolution(sub);
    },
    dispose() {
      // Full WebGL disposal contract (CLAUDE.md): geometry + material per object,
      // then detach. No textures on LineMaterial, so none to dispose.
      //
      // Dispose by HELD REFERENCE to the sub-groups rather than traversing `group`:
      // the consumer (main.js flatten) reparents vpGroup and ppGroup OUT of `group`
      // into the fold pivot, so a `group.traverse` would miss them and leak their
      // LineMaterials. Walking the sub-groups directly disposes everything we
      // created regardless of who currently parents it. The three ADR-087 outline groups are
      // NEVER parented anywhere (hpOutlineGroup's own JSDoc) — walking them directly is the
      // only way they get disposed at all.
      for (const sub of [hpGroup, vpGroup, ppGroup, connectorGroup, ppConnectorGroup, flatConnectorGroup, hpDimensionGroup, vpDimensionGroup, hpOutlineGroup, vpOutlineGroup, ppOutlineGroup]) {
        sub.traverse((obj) => {
          obj.geometry?.dispose();
          // Dispose ANY material — the LineMaterial of the projection/dimension lines OR
          // the dimension layer's filled-arrowhead MeshBasicMaterial (ADR-041). Both leak
          // if the teardown only special-cases LineMaterial.
          const mat = obj.material;
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => m?.dispose());
          // The dimension labels are live CSS2D DOM nodes — pull them out of the document
          // as part of the disposal traversal (RULES.md §3.5), or they accumulate.
          if (obj.isCSS2DObject) obj.element?.remove();
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

// ============================================================================
// Dimensioning helpers (BIS SP 46:2003 Type B) — all linework routes into a
// SegmentBatch so the whole layer is one LineSegments2 (single-material dispose).
// ============================================================================

/**
 * Push ONE filled 3:1 triangle arrowhead into a flat triangle-vertex buffer (ADR-041,
 * overturning the earlier open chevron). `along` is the unit direction the tip points
 * along; the back edge sits {@link DIM_ARROW_LEN} behind the tip and spans ±LEN/6 along
 * `perp`, so length : full back width = 3 : 1 (the BIS Type-B wedge). Emits the three
 * triangle vertices as 9 flat floats (tip, +back, −back) for the MeshBasicMaterial soup
 * built by {@link buildArrowMesh} — the same technique as annotations.js `pushArrowTriangle`.
 * @param {number[]}       out   Flat triangle-vertex buffer to append to (3 verts / 9 floats).
 * @param {THREE.Vector3}  tip   Terminator point (a view corner / ground line).
 * @param {THREE.Vector3}  along Unit direction the arrow points along.
 * @param {THREE.Vector3}  perp  Unit in-plane direction ⟂ to the dimension line.
 */
function pushArrowTriangle(out, tip, along, perp) {
  const base = tip.clone().addScaledVector(along, -DIM_ARROW_LEN);
  const hw = DIM_ARROW_LEN / 6; // half the full 3:1 back width (LEN/3)
  const a = base.clone().addScaledVector(perp, hw);
  const b = base.clone().addScaledVector(perp, -hw);
  out.push(tip.x, tip.y, tip.z, a.x, a.y, a.z, b.x, b.y, b.z);
}

/**
 * Push one linear dimension between features `A` and `B`, its dimension line stood off
 * perpendicular by `off`. Emits the two extension lines (a {@link DIM_EXT_GAP} gap off
 * each feature, running to a {@link DIM_EXT_OVERSHOOT} overshoot past the dimension
 * line), the dimension line itself, and an outward-pointing FILLED 3:1 triangle at each end
 * (routed into the separate `arrows` triangle buffer, ADR-041); the numeric label is collected
 * (centered on the dim line, nudged onto the paper break) for the caller to realise as a
 * CSS2DObject. A zero-length measure emits no label.
 * @param {SegmentBatch} batch
 * @param {number[]}     arrows  Flat triangle-vertex buffer for the filled arrowheads.
 * @param {{ pos: THREE.Vector3, text: string }[]} labels  Collected label placements.
 * @param {THREE.Vector3} A        First measured feature (world space).
 * @param {THREE.Vector3} B        Second measured feature (world space).
 * @param {THREE.Vector3} off      Perpendicular offset to the dimension line (world).
 * @param {number}        valueMM  The true measurement in millimetres.
 */
function pushLinearDim(batch, arrows, labels, A, B, off, valueMM) {
  const dir = off.clone().normalize();            // extension-line direction (unit)
  const Ad = A.clone().add(off);                  // A projected onto the dimension line
  const Bd = B.clone().add(off);                  // B projected onto the dimension line
  // extension lines: gap off the feature → overshoot past the dimension line
  addSegment(batch, A.clone().addScaledVector(dir, DIM_EXT_GAP), Ad.clone().addScaledVector(dir, DIM_EXT_OVERSHOOT));
  addSegment(batch, B.clone().addScaledVector(dir, DIM_EXT_GAP), Bd.clone().addScaledVector(dir, DIM_EXT_OVERSHOOT));
  // the dimension line
  addSegment(batch, Ad, Bd);
  // outward filled 3:1 triangle arrowheads (back-spread splays in the extension-line
  // direction, which is in-plane and ⟂ to the dimension line)
  const t = Bd.clone().sub(Ad).normalize();
  pushArrowTriangle(arrows, Ad, t.clone().negate(), dir);
  pushArrowTriangle(arrows, Bd, t, dir);
  const value = Math.round(valueMM);
  if (value === 0) return;
  const mid = Ad.clone().add(Bd).multiplyScalar(0.5).addScaledVector(dir, DIM_EXT_GAP);
  labels.push({ pos: mid, text: String(Math.abs(value)) });
}

/**
 * Build a dimension value as a live CSS2DObject. The DOM node consumes the design
 * tokens directly — --font-mono / --text-xs / --color-ink, on a --color-paper break so
 * the dimension line never crosses the digits — never a hard-coded value (RULES.md §4.1).
 * Disposed by the drawProjections dispose() traversal (element pulled from the document).
 * @param {string} text
 * @returns {CSS2DObject}
 */
function makeDimLabel(text) {
  const el = document.createElement('div');
  el.className = 'dim-label';
  el.textContent = text;
  el.style.fontFamily = 'var(--font-mono)';
  el.style.fontSize = 'var(--text-xs)';
  el.style.color = 'var(--color-ink)';
  el.style.background = 'var(--color-paper)';
  el.style.padding = '0 2px';
  el.style.lineHeight = '1';
  el.style.whiteSpace = 'nowrap';
  el.style.pointerEvents = 'none';
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 0.5);
  return obj;
}
