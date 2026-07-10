// Geometry generator for the teaching Bearing Block (Module 1 Topic 1).
//
// Layering (ADR-007 star rule): a leaf generator may import THREE and the THREE
// addon BufferGeometryUtils (pure math) — nothing else. It does NOT import the
// analyser (meshAnalyzer.js), the line drawer, the annotations, or main.js.
// main.js's rebuild() owns parenting and the disposal contract; this module just
// hands back a fully configured, un-parented THREE.Mesh.
//
// WHAT THIS IS. A simplified, one-piece pillow-block housing — the cleanest shape
// that shows all four BIS line types at once on a single orbitable part:
//   • a wide rectangular BASE/FOOT with two plain round VERTICAL mounting holes,
//   • a central BODY + semicircular BOSS carrying a clean empty HORIZONTAL THROUGH-BORE.
// No split cap, no cap-bolt holes (CLAUDE.md "simplified teaching version").
//
// AXES (CLAUDE.md geometry answers): the bore axis runs along +Z, the feet spread
// along X, height is Y. The default "Front View" looks straight down −Z so the bore
// reads as a clean circle.
//
// HOW IT IS BUILT (no CSG library — no build step, ADR-001). Two THREE.Shape
// extrusions, then welded into one geometry:
//   1. BODY+BOSS = the end-elevation profile (foot-less: body rectangle + dome) with
//      the bore as a Shape hole, extruded along Z. ExtrudeGeometry triangulates the
//      annular front/back caps and the curved bore/dome walls for us — a clean empty
//      through-bore with no hand-rolled triangulation.
//   2. BASE = a rectangle (X × Z footprint) with two circular holes, extruded along Y
//      → a slab with two clean vertical through-holes.
// mergeGeometries() concatenates them into ONE non-indexed BufferGeometry → ONE Mesh.
// meshAnalyzer.js later welds the coincident base/body interface by world position.
//
// HARD EDGES (RULES.md §3.14). ExtrudeGeometry is non-indexed (duplicated vertices
// per face); computeVertexNormals() on the merged result yields per-face flat
// normals. The material uses flatShading, and meshAnalyzer recomputes face normals
// from positions, so edge extraction stays crisp regardless of the stored normals.
//
// CURVE TESSELLATION. The bore, dome AND foot holes all use 24 segments → a uniform 15°
// facet angle (dot 0.966 between adjacent facets). That sits well above lineDrawer.js's
// SMOOTH_DOT (0.80 ≈ 37°), so every curved surface reads as SMOOTH and the classifier
// draws only the rims + the live silhouette, never a barrel of longitudinal facet lines.
// (The holes were briefly cut to 16 seg / 22.5° to cheapen raycasts, which forced
// SMOOTH_DOT down to a fragile 0.90; matching them back to 24 seg restores the margin.)

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Colours come from CSS custom properties, never hard-coded (RULES.md §4.1 /
// DESIGN.md). Cache the live root declaration once; resolve at build time so a
// runtime theme swap is reflected on the next rebuild. Same helper shape as
// Module 2's cylinder.js / genericPrism.js (each leaf reads its own tokens).
const rootStyle = getComputedStyle(document.documentElement);

/** A design token (sRGB hex) resolved to a THREE.Color. */
function cssColor(name) {
  return new THREE.Color(rootStyle.getPropertyValue(name).trim());
}

// ============================================================================
// Dimensions — world units. Textbook plummer-block ratio (L≈120 / H≈50 / bore Ø≈40
// mm) scaled so the longest dimension (base length) ≈ 9 units to frame in the
// standard viewport. Builder-chosen and easily tuned; the bore-clears-base and
// boss-encloses-bore relationships are the only hard constraints (see below).
// ============================================================================

const BASE_LENGTH = 9.0;        // X, across the feet  (≈120 mm)
const BASE_THICK = 0.9;         // Y, foot slab thickness
const DEPTH = 4.5;              // Z, block depth (base + body share it)
const BODY_WIDTH = 4.2;         // X, central body — equals the boss diameter (sides tangent to dome)
const BORE_RADIUS = 1.5;        // bore Ø 3.0 (≈40 mm)
const BOSS_RADIUS = 2.1;        // boss Ø 4.2 (≈56 mm), 0.6 wall around the bore
const AXIS_Y = 2.5;             // bore / boss centre height (pre-centring). bore bottom = 2.5 − 1.5 = 1.0 ≥ base top 0.9 → bore clears the foot
const OVERALL_HEIGHT = AXIS_Y + BOSS_RADIUS; // 4.6 — foot bottom (0) to top of dome
const MOUNT_RADIUS = 0.6;       // vertical mounting hole Ø 1.2 (≈16 mm)
const MOUNT_X = 3.6;            // ± mounting-hole centres from the middle (in the foot, clear of the body)

const BORE_SEGMENTS = 24;       // bore + dome tessellation (15° facets)
const MOUNT_SEGMENTS = 24;      // foot-hole tessellation (15° facets; matched to the bore)

// The merged geometry is built with its foot bottom at y = 0; we lift it by this so
// the whole block straddles the origin (y ∈ [−2.3, +2.3]) for a balanced orbit.
const CENTRE_OFFSET_Y = -OVERALL_HEIGHT / 2;

/**
 * Public dimension table, in FINAL (centred, world) coordinates. Exported so the
 * orchestrator can hand it to the annotation + label layers (which must not import
 * this generator directly — ADR-007 star rule) for placing centre lines, dimension
 * lines, and the "Front View" camera target on the real bore axis.
 *
 * @readonly
 */
export const BEARING_BLOCK_DIMS = Object.freeze({
  baseLength: BASE_LENGTH,
  height: OVERALL_HEIGHT,
  depth: DEPTH,
  halfDepth: DEPTH / 2,
  boreRadius: BORE_RADIUS,
  boreDiameter: BORE_RADIUS * 2,
  bossRadius: BOSS_RADIUS,
  mountRadius: MOUNT_RADIUS,
  mountX: [-MOUNT_X, MOUNT_X],
  // Centred world Y of the key horizontal features:
  axisY: AXIS_Y + CENTRE_OFFSET_Y,        // bore / boss axis (≈ +0.2)
  baseTopY: BASE_THICK + CENTRE_OFFSET_Y, // top of the foot slab (≈ −1.4)
  baseBottomY: CENTRE_OFFSET_Y,           // foot underside (≈ −2.3)
  topY: OVERALL_HEIGHT + CENTRE_OFFSET_Y, // top of the dome (≈ +2.3)
  halfLength: BASE_LENGTH / 2,
});

/**
 * Build the end-elevation profile of the body + boss — FOOT-LESS, the base slab is the
 * separately extruded foot — as a THREE.Shape, with the bore as a circular hole.
 *
 * The outer contour is wound counter-clockwise (THREE's convention for a filled Shape)
 * starting at the body's bottom-left, which rests on the foot's top face (y = BASE_THICK);
 * the bore hole is wound clockwise (THREE's convention for a Path hole). ExtrudeGeometry
 * then emits outward face normals and a correctly triangulated annular cap.
 *
 * WHY FOOT-LESS (chat diagnosis 2026-06-30): the previous profile ALSO drew the full-width
 * base slab (y = 0 → BASE_THICK across BASE_LENGTH), duplicating the foot's volume. The two
 * coincident slabs welded into 3–6-face non-manifold edges — drawn as phantom REAL
 * "spiderweb" seams — and the body's solid slab filled the mounting-hole volume, so the
 * occlusion test saw material that is not there (visible edges wrongly classed hidden →
 * vanishing in Step 1). Building the body from the slab top UP removes both: the body and
 * foot now butt at a single clean interface (y = BASE_THICK) instead of overlapping.
 *
 * @returns {THREE.Shape}
 */
function buildBodyProfile() {
  const halfB = BODY_WIDTH / 2;       // 2.1  (=== BOSS_RADIUS → dome springs tangentially)

  const shape = new THREE.Shape();
  // Body sides + dome only, CCW from the body's bottom-left (resting on the slab top):
  shape.moveTo(-halfB, BASE_THICK);
  shape.lineTo(halfB, BASE_THICK);    // bottom edge across the body (→ +X)
  shape.lineTo(halfB, AXIS_Y);        // up the right body side to the dome spring line
  // Semicircular dome over the top: centre (0, AXIS_Y), from (+halfB, AXIS_Y) CCW
  // over (0, top) to (−halfB, AXIS_Y). halfB === BOSS_RADIUS, so the dome springs
  // tangentially off the vertical body sides (a smooth, clean pillow-block top).
  shape.absarc(0, AXIS_Y, BOSS_RADIUS, 0, Math.PI, false);
  shape.closePath();                  // straight down the left side → (−halfB, BASE_THICK)

  // Bore — a clean circular hole centred on the axis (CW for a THREE hole).
  const bore = new THREE.Path();
  bore.absarc(0, AXIS_Y, BORE_RADIUS, 0, Math.PI * 2, true);
  shape.holes.push(bore);

  return shape;
}

/**
 * Build the foot footprint (X × Z) as a THREE.Shape with two circular holes, ready
 * to extrude along its local Z (which we then rotate onto world Y).
 *
 * @returns {THREE.Shape}
 */
function buildFootProfile() {
  const halfL = BASE_LENGTH / 2;   // 4.5
  const halfD = DEPTH / 2;         // 2.25

  // Shape coords are (sx = world X, sy = world Z). CCW rectangle.
  const shape = new THREE.Shape();
  shape.moveTo(-halfL, -halfD);
  shape.lineTo(halfL, -halfD);
  shape.lineTo(halfL, halfD);
  shape.lineTo(-halfL, halfD);
  shape.closePath();

  // Two vertical mounting holes (CW holes), centred in the feet at z = 0.
  for (const cx of [-MOUNT_X, MOUNT_X]) {
    const hole = new THREE.Path();
    hole.absarc(cx, 0, MOUNT_RADIUS, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

/**
 * Build the bearing-block geometry: a single, hard-edged, non-indexed
 * BufferGeometry centred on the origin (bore axis along +Z).
 *
 * @returns {THREE.BufferGeometry}
 */
function buildBearingBlockGeometry() {
  // --- Body + boss: extrude the end elevation along Z, then centre in Z. -------
  const bodyGeo = new THREE.ExtrudeGeometry(buildBodyProfile(), {
    depth: DEPTH,
    bevelEnabled: false,
    steps: 1,
    curveSegments: BORE_SEGMENTS,
  });
  bodyGeo.translate(0, 0, -DEPTH / 2);

  // --- Foot: extrude the footprint along its local Z, then lay it flat so the
  // extrude axis becomes world Y. rotateX(−90°) maps a shape point (sx, sy, sz) to
  // world (sx, sz, −sy): world X = sx (block X), world Y = sz (0…BASE_THICK), world
  // Z = −sy (block Z, sign-flipped — harmless, the foot is symmetric in Z).
  const footGeo = new THREE.ExtrudeGeometry(buildFootProfile(), {
    depth: BASE_THICK,
    bevelEnabled: false,
    steps: 1,
    curveSegments: MOUNT_SEGMENTS,
  });
  footGeo.rotateX(-Math.PI / 2);

  // --- Weld into one geometry, centre on the origin, flatten normals. ----------
  // Both inputs are non-indexed ExtrudeGeometry with identical attributes
  // (position, normal, uv), so mergeGeometries concatenates cleanly.
  const merged = mergeGeometries([bodyGeo, footGeo], false);
  bodyGeo.dispose();
  footGeo.dispose();

  merged.translate(0, CENTRE_OFFSET_Y, 0);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Create the bearing-block mesh. Mirrors the Module 2 IShape material/flag contract
 * exactly (flat CAD MeshPhongMaterial, polygonOffset against edge z-fighting, no
 * shadows). Returned un-parented; main.js's rebuild() owns adding it to the scene
 * group and the disposal contract.
 *
 * The mesh stays at the origin with identity rotation — the CAMERA orbits, not the
 * part — so the world-space edge map built once by meshAnalyzer stays valid for the
 * life of the rebuild, and lineDrawer.js raycasts against this same static mesh.
 *
 * @returns {THREE.Mesh} with `userData.dims` set to {@link BEARING_BLOCK_DIMS}.
 */
export function createBearingBlock() {
  const geometry = buildBearingBlockGeometry();

  const material = new THREE.MeshPhongMaterial({
    color: cssColor('--color-solid-fill'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'bearing-block';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.dims = BEARING_BLOCK_DIMS;
  return mesh;
}
