// Orchestrator — Sections of Solids (graphics_module_3_topic_1_sections_of_solids).
//
// Scaffold stage (MODULE-STARTER Case A): duplicated from template_starter/, with the Module 2
// solid-geometry engine restored byte-identical (cube/cone/cylinder/genericPrism/genericPyramid/
// genericSolid/shapeData/iShape.js — ADR-009). Boots a plain default solid through the platform
// contract: the guided-stepper chrome (src/stepper.js), the inline term popovers (src/terms.js),
// first-run onboarding (src/onboarding.js), window.simAPI, the mobile notice, the wizard hide/show
// toggle, the boot watchdog + WebGL context-loss recovery, and a single disposal-safe rebuild()
// pipeline.
//
// Section-cut engine (root DECISIONS.md ADR-058): src/sectionCut.js slices the
// solid with the learner's cutting plane inside rebuild()'s DOMAIN BUILD SEAM — generate mesh →
// slice → analyze edges — and the restored meshAnalyzer.js welds the cut rim so it draws once.
// Section state lives HERE, outside ShapeData, so src/shapeData.js stays byte-identical to
// Module2.
//
// Drawing layer (ADR-060/061): src/projectionDrawer.js (byte-identical Module2 copy)
// draws the first-angle top/front/side views from the welded edge map; src/sectionView.js
// draws the 45° section hatching + the true-shape auxiliary sheet from the cut loop. Both
// are parented inside shapeGroup (one disposal contract) and revealed by wizard stage
// (steps 4–5). Deliberately NOT yet built: the fold-to-flat-sheet animation, dimensioning,
// and the problem library ("true shape given" problems stay excluded — CLAUDE.md syllabus rule).
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/onboarding/anim)
// never import each other except genericSolid.js (pure math); they hang off this file.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// Fat lines for the hard-edge linework — LineBasicMaterial is capped at 1px on most GPUs
// (CLAUDE.md "3D engineering gotchas").
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { initUIManager } from './src/uiManager.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { tick as tickTweens, cancelAll as cancelTweens, tween, easeCamera } from './src/anim.js';
import { buildEdgeMap } from './src/meshAnalyzer.js';
import { cutGeometryWithPlane } from './src/sectionCut.js';
// Projection-drawing layer — copied BYTE-IDENTICAL from Module2/src/ (ADR-060, same
// doctrine as the geometry engine): fixes land in Module2 first, then re-copy. All
// section-specific drawing lives in src/sectionView.js instead, so this file never drifts.
import { drawProjections } from './src/projectionDrawer.js';
import { buildSectionViews } from './src/sectionView.js';

// Domain geometry — restored byte-identical from Module2/src/ (MODULE-STARTER Case A / ADR-009).
// This scaffold only wires the dispatch switch below; projections, labels, seating, and the
// section-cut engine itself are net-new work for a later pass (see this topic's DECISIONS.md).
import { ShapeType, defaultShapeData } from './src/shapeData.js';
import { createCube } from './src/cube.js';
import { createCylinder } from './src/cylinder.js';
import { createCone } from './src/cone.js';
import { createGenericPrism } from './src/genericPrism.js';
import { createGenericPyramid } from './src/genericPyramid.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded.
// (DESIGN.md is the single source of truth; CLAUDE.md "Cross-cutting rules".)
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** Raw CSS custom-property value, trimmed. */
function cssVar(name) {
  return rootStyle.getPropertyValue(name).trim();
}

/** A design token resolved to a THREE.Color (tokens are sRGB hex, which THREE parses). */
function cssColor(name) {
  return new THREE.Color(cssVar(name));
}

// ============================================================================
// Default camera framing. Restored by simAPI.reset() (CLAUDE.md platform contract).
// ============================================================================

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(6, 5, 7.5);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 1, 0);

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;

/** A fixed CAD ground-reference grid, kept OUT of shapeGroup so rebuild() never disposes it. */
let hpGrid;

/** Holds all per-frame domain geometry. rebuild()'s disposal contract DEEP-traverses this group,
 *  so children MAY be nested Groups — every descendant geometry/material is still freed. Add
 *  everything your rebuild() creates here; nested sub-groups are fine. */
let shapeGroup;

/** The sim viewport element. Held module-wide so handleResize can read the live drawing-buffer
 *  size (e.g. for LineMaterial resolution once you add fat-line linework). */
let viewport;

/**
 * The state currently on screen, or `null` for the empty start. Mutated only via rebuild().
 * The starter template keeps it as an opaque bag — give it a real shape when you build your
 * own data layer.
 * @type {object | null}
 */
let currentShapeData = null;

let rafId = null;
let running = false;

// ============================================================================
// Section-plane state — TOPIC-LOCAL, deliberately outside ShapeData.
// src/shapeData.js is byte-identical to Module2 (RULES.md §1.3–1.4), so the section
// parameters live here and merge at the rebuild() call site instead (ADR-058).
// Mutated only via simController.commitSection(), which routes through rebuild().
// ============================================================================

/**
 * @typedef {Object} SectionState
 * @property {boolean} enabled       Whether the solid is cut.
 * @property {'HP'|'VP'} orientation 'HP': plane ⊥ VP, inclined angleDeg to the HP (the
 *   textbook default — its normal is (0, cosθ, sinθ), so 0° is a horizontal cut).
 *   'VP': plane ⊥ HP, inclined angleDeg to the VP (normal (cosφ, 0, sinφ)).
 * @property {number} angleDeg  Inclination to the reference plane, degrees (0–90).
 * @property {number} offset    Shift of the plane along its own normal from the solid's
 *   bounding-box centre, world units (1 unit = 10 mm in the dock).
 */

/** @returns {SectionState} fresh defaults (no shared reference with live state). */
function defaultSectionState() {
  return { enabled: false, orientation: 'HP', angleDeg: 45, offset: 0 };
}

/** @type {SectionState} */
let sectionState = defaultSectionState();

/** Result of the latest cut ({loops, basis, capStart}) or null — the future true-shape
 *  auxiliary view and the headless self-check both read this. */
let latestSection = null;

/** Last cut status ('cut' | 'no-cut' | 'all-cut' | null), so learner feedback fires only on
 *  a TRANSITION, not on every slider tick. */
let lastSectionStatus = null;

/** LineMaterial of the current build's edge linework — handleResize keeps its resolution
 *  uniform in sync (fat lines are resolution-dependent). Replaced every rebuild. */
let edgeMaterial = null;

// ============================================================================
// Orthographic-views state (ADR-060/061) — first-angle top/front/side views
// plus the section hatching and the true-shape auxiliary sheet, revealed by stage.
// ============================================================================

/** PP (profile-plane) wall standoff before any solid exists; reseated per rebuild. */
const DEFAULT_PP_STANDOFF = -3;

/** World gap between the solid's far depth face and the PP wall (z0 = bbox.min.z − this). */
const PP_MARGIN = 1.5;

/** Clearance between the removed half's far extent and the true-shape sheet, world units. */
const SHEET_CLEARANCE = 1.4;

/** VP / PP wall grids — persistent instrument chrome like hpGrid (kept OUT of shapeGroup),
 *  revealed at the views stage. */
let vpGrid;
let ppGrid;

/** World bbox of the current UNCUT, seated solid — the stable anchor for the cutting
 *  plane, the PP standoff and the sheet clearance. Null on the empty start. */
let uncutBbox = null;

/** Latest drawProjections / buildSectionViews results, or null. Their groups are parented
 *  INSIDE shapeGroup, so the rebuild disposal contract frees every geometry + material —
 *  these refs exist only for setResolution fan-out and stage gating. Replaced per rebuild. */
let activeProjection = null;
let activeSectionView = null;

/** Wizard stage (1–5). Stage ≥ 4 reveals walls + views + hatching; ≥ 5 the true shape.
 *  Driven by the stepper through simController.setStage() — visibility only, never geometry. */
let stage = 1;

/** In-flight "Face the section" camera tween, cancelled by a newer one. */
let faceTweenHandle = null;

/** Subscribers fired at the end of every rebuild() — the single seam every state change passes
 *  through (a future problem-library self-check can ride this). */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

/** First-run onboarding handle from initOnboarding — { setSolidPresent, spotlight, cue }. */
let onboarding;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

/** Problem-library handle from initProblemLibrary — { open, exit, isActive, dispose }. */
let problemLibrary;

// ============================================================================
// Live-region + viewport-note helpers
// ============================================================================

/** Narrate a state change to assistive tech (PRODUCT.md a11y commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/** ms a reflow note stays up before fading. */
const FLOW_NOTE_HOLD = 4500;
let flowNoteEl = null;
let flowNoteTimer = null;
let flowNoteHideTimer = null;

/**
 * Flash a brief, visible note over the viewport for a state change a sighted learner needs
 * explained. Screen readers get the message through #sim-status via announce(), so this note is
 * aria-hidden and is NOT itself a live region. Auto-dismisses after FLOW_NOTE_HOLD.
 * @param {string} message
 */
function flowNote(message) {
  flowNoteEl ??= document.getElementById('vp-flow-note');
  if (!flowNoteEl) return;
  const text = flowNoteEl.querySelector('.vp-note__text');
  if (text) text.textContent = message;

  clearTimeout(flowNoteTimer);
  clearTimeout(flowNoteHideTimer);
  flowNoteEl.hidden = false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(() => flowNoteEl.classList.add('is-visible'));

  flowNoteTimer = setTimeout(() => {
    flowNoteEl.classList.remove('is-visible');
    flowNoteHideTimer = setTimeout(() => { flowNoteEl.hidden = true; }, 240);
  }, FLOW_NOTE_HOLD);
}

/** ms the success toast stays up before fading. */
const TOAST_HOLD = 3500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Show a brief, calm success toast over the viewport (the Step-5 "Complete & next
 * problem" win). Token-driven success styling + a check glyph — NOT a gamified
 * celebration (DESIGN.md rejects confetti/badges/points).
 *
 * Driven by setTimeout, NOT the rAF tween engine, because the Problem Library overlay
 * pauses the loop immediately after this is called (the toast still needs to fade).
 * aria-hidden: #sim-status already narrates the win, so this is not a second live
 * region (would double-announce). Auto-dismisses; a fresh call resets the timer.
 * @param {string} message
 */
function showToast(message) {
  toastEl ??= document.getElementById('sim-toast');
  if (!toastEl) return;
  const text = toastEl.querySelector('.sim-toast__text');
  if (text) text.textContent = message;

  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastEl.hidden = false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, 240);
  }, TOAST_HOLD);
}

/** Fire every state-change subscriber (see stateChangeSubs). Each callback is guarded so one
 *  throwing subscriber can never break the rebuild pipeline. */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/**
 * Show or hide the transient WebGL context-loss recovery chip, and narrate the state change so a
 * screen-reader user knows the paused view is recovering, not broken.
 * @param {boolean} on
 */
function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
}

/**
 * Signal a successful boot to the index.html watchdog: clear its timeout and hide any fallback a
 * slow load may have surfaced. A late-but-successful boot therefore self-heals.
 */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) {
    clearTimeout(window.__simBootTimer);
    window.__simBootTimer = null;
  }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
  // Platform iframe contract (ADR-078): announce a displayable sim to the host loader.
  // Gated on document.fonts.ready so the host never reveals us mid-FOUT.
  document.fonts.ready.then(() => {
    window.parent.postMessage({ type: 'sim:ready' }, '*');
  });
}

/**
 * Signal lesson completion to the host (ADR-078 addendum): the learner has reached this
 * lesson's finished state, so the host can surface its "next topic / stay" overlay.
 * Fires at most once per page load — the latch is deliberately NOT cleared by
 * simAPI.reset(), so replaying a lesson never re-opens the host overlay.
 */
function markComplete() {
  if (window.__simComplete) return;
  window.__simComplete = true;
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}

// ============================================================================
// Domain geometry — shape dispatch (ported verbatim from Module2/main.js).
// ============================================================================

/**
 * Build the mesh for the current shape type. Every shape is backed by a real generator, so an
 * unknown shape is a programming error, not a renderable fallback box.
 * @param {import('./src/shapeData.js').ShapeData} data effective shape data
 * @returns {THREE.Mesh}
 */
function createSolidMesh(data) {
  switch (data.shape) {
    case ShapeType.Cube:              return createCube(data);
    case ShapeType.Cylinder:          return createCylinder(data);
    case ShapeType.Cone:              return createCone(data);

    case ShapeType.TriangularPrism:   return createGenericPrism(3)(data);
    case ShapeType.SquarePrism:       return createGenericPrism(4)(data);
    case ShapeType.PentagonalPrism:   return createGenericPrism(5)(data);
    case ShapeType.HexagonalPrism:    return createGenericPrism(6)(data);

    case ShapeType.TriangularPyramid: return createGenericPyramid(3)(data);
    case ShapeType.Pyramid:           return createGenericPyramid(4)(data);
    case ShapeType.PentagonalPyramid: return createGenericPyramid(5)(data);
    case ShapeType.HexagonalPyramid:  return createGenericPyramid(6)(data);

    default:
      throw new Error(`createSolidMesh: unsupported shape "${data.shape}"`);
  }
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (CLAUDE.md, non-negotiable).
// ============================================================================

/**
 * THE ONLY path for geometry changes (CLAUDE.md, non-negotiable). It runs the full disposal
 * contract, then — in your domain build — regenerates the scene. In the starter template the
 * build seam is empty, so the scene stays an empty paper viewport. Passing `null` clears to the
 * empty start.
 *
 * @param {object | null} shapeData
 */
function rebuild(shapeData) {
  currentShapeData = shapeData;

  // --- Disposal contract (verbatim from CLAUDE.md). Prevents WebGL context exhaustion across
  //     rapid regenerations. DEEP traversal: a shallow loop over shapeGroup.children frees only a
  //     direct child's own geometry/material, so any nested sub-group (the common shape of real
  //     domain geometry) would leak — traverse each child so every descendant's geometry +
  //     material(s) + map are released. Verify renderer.info.memory (geometries + textures) stays
  //     flat across 50 rebuilds. (Discovered leaking in the Glass Box build — DECISIONS.md ADR-042.) ---
  for (const child of shapeGroup.children) child.traverse(disposeObj);
  shapeGroup.clear();

  // ── DOMAIN BUILD SEAM ─────────────────────────────────────────────────────────────────────
  // Fixed order (ADR-004 consequence): generate mesh → SLICE (section cut, ADR-058) →
  // analyze edges → draw linework + views. The section stage is a stage IN this pipeline,
  // never a live mutation reacting to a slider. Keep this the single path — no control may
  // mutate the scene directly (CLAUDE.md).
  activeProjection = null;   // previous build's views were just freed by the contract above
  activeSectionView = null;
  uncutBbox = null;
  if (shapeData) {
    const mesh = createSolidMesh(shapeData);
    // The UNCUT seated bbox is the stable anchor: the cutting plane, the PP wall standoff
    // and the true-shape sheet clearance all measure from it, so none of them jump as the
    // plane slider moves.
    uncutBbox = new THREE.Box3().setFromObject(mesh);
    applySectionCut(mesh, uncutBbox); // slices mesh.geometry in place when the plane is on
    shapeGroup.add(mesh);
    if (mesh.visible) { // 'all-cut' leaves nothing to outline or project
      // ONE buildEdgeMap() call feeds BOTH the 3D edge overlay and the 2D views, so the
      // welded cut rim never re-splits between consumers (CLAUDE.md welding rule).
      mesh.updateMatrix();
      const edgeMap = buildEdgeMap(mesh.geometry, mesh.matrix);
      addEdgeOverlay(edgeMap);      // welded hard-edge linework on the solid itself
      addProjectionViews(edgeMap);  // first-angle views + hatching + true-shape sheet
    }
  }
  applyStageVisibility(); // fresh view groups default visible — re-assert the stage gate
  // ───────────────────────────────────────────────────────────────────────────────────────────

  notifyStateChange(); // state change committed — re-run any subscriber (e.g. a self-check)
}

// ============================================================================
// Section-cut stage (ADR-058) — the analytic single-plane clipper.
// ============================================================================

/**
 * The learner's cutting plane in WORLD space, built from sectionState. The plane's normal
 * points at the DISCARDED half — for 'HP' orientation that is upward/behind (the textbook
 * "portion above the cutting plane is removed"); for 'VP' it is toward the observer.
 *
 * @param {THREE.Box3} bbox World bounding box of the UNCUT solid (the stable anchor).
 * @returns {THREE.Plane}
 */
function buildSectionPlaneWorld(bbox) {
  const rad = THREE.MathUtils.degToRad(sectionState.angleDeg);
  const normal = sectionState.orientation === 'HP'
    ? new THREE.Vector3(0, Math.cos(rad), Math.sin(rad)) // ⊥ VP: no X component
    : new THREE.Vector3(Math.cos(rad), 0, Math.sin(rad)); // ⊥ HP: no Y component

  const anchor = bbox.getCenter(new THREE.Vector3()).addScaledVector(normal, sectionState.offset);
  // No epsilon games here: sectionCut.js's PLANE_EPS snap (≥ the weld lattice) makes exact
  // face/vertex grazing resolve cleanly — a grazed vertex becomes a section-loop vertex.
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor);
}

/**
 * Slice the freshly generated solid with the section plane (when enabled). Runs INSIDE
 * rebuild()'s build seam. The cut happens in mesh-LOCAL space — the world plane is transformed
 * by the inverse mesh matrix — so the generator's position/quaternion pipeline is untouched
 * and the sliced geometry inherits the existing pose.
 *
 * On a real cut the mesh's geometry is swapped for the sliced one (old geometry disposed
 * immediately — it never reaches the scene, so the rebuild disposal contract can't see it)
 * and the material becomes [solid fill, section face] matching the geometry's two groups.
 *
 * @param {THREE.Mesh} mesh The just-generated solid (not yet parented).
 * @param {THREE.Box3} bbox World bbox of the UNCUT seated solid (computed in the seam) —
 *   anchors the plane and sizes its visual quad.
 */
function applySectionCut(mesh, bbox) {
  latestSection = null;
  if (!sectionState.enabled) { lastSectionStatus = null; return; }

  const planeWorld = buildSectionPlaneWorld(bbox);

  mesh.updateMatrix(); // parent is shapeGroup at identity, so .matrix IS the world transform
  const planeLocal = planeWorld.clone().applyMatrix4(mesh.matrix.clone().invert());

  const result = cutGeometryWithPlane(mesh.geometry, planeLocal);

  if (result.status === 'cut') {
    mesh.geometry.dispose(); // swap-out happens pre-scene; dispose by hand, not by contract
    mesh.geometry = result.geometry;

    // Group 0 keeps the solid's own fill; group 1 (the cap) gets the section-face token.
    const capMaterial = mesh.material.clone();
    capMaterial.color = cssColor('--color-section-face');
    mesh.material = [mesh.material, capMaterial];

    latestSection = {
      loops: result.loops,
      basis: result.basis,
      capStart: result.capStart,
      // Extras the drawing layer needs (additive — section() consumers keep working):
      // the mesh's rigid local→world matrix (loops/basis are MESH-LOCAL) and the world
      // cutting plane (sheet clearance is measured against it).
      matrixWorld: mesh.matrix.clone(),
      planeWorld,
    };
    mesh.userData.section = latestSection; // the true-shape auxiliary view reads this
  } else if (result.status === 'all-cut') {
    mesh.visible = false; // the plane removes the whole solid — an honest empty result
  }
  // 'no-cut': the plane misses the solid on the kept side — leave it whole.

  // Learner feedback on TRANSITIONS only (never per slider tick).
  if (result.status !== lastSectionStatus) {
    if (result.status === 'all-cut') {
      flowNote('The plane now clears the whole solid — nothing is left. Slide it back.');
      announce('The cutting plane removes the entire solid.');
    } else if (result.status === 'no-cut' && lastSectionStatus !== null) {
      flowNote('The plane misses the solid — bring it closer until it cuts.');
      announce('The cutting plane no longer intersects the solid.');
    }
    lastSectionStatus = result.status;
  }

  addSectionPlaneVisual(planeWorld, bbox);
}

/**
 * Translucent quad + outline showing WHERE the cutting plane lies. Parented into shapeGroup so
 * the rebuild disposal contract frees it like everything else.
 *
 * @param {THREE.Plane} plane World-space cutting plane.
 * @param {THREE.Box3} bbox   World bbox of the uncut solid — sizes and centres the quad.
 */
function addSectionPlaneVisual(plane, bbox) {
  const size = bbox.getSize(new THREE.Vector3()).length() * 1.25;
  const center = plane.projectPoint(bbox.getCenter(new THREE.Vector3()), new THREE.Vector3());

  const quadGeo = new THREE.PlaneGeometry(size, size);
  const quad = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
    color: cssColor('--color-section-face'),
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false, // never occludes the solid behind it
  }));
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal); // PlaneGeometry faces +Z
  quad.position.copy(center);
  quad.name = 'section-plane';

  // Crisp border so the plane reads as a drafting instrument, not a fog. 1px is fine here —
  // this is instrument chrome, not engineering linework (which uses fat lines below).
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(quadGeo),
    new THREE.LineBasicMaterial({ color: cssColor('--color-section-face'), transparent: true, opacity: 0.55 }),
  );
  quad.add(border); // inherits pose; deep disposal frees both

  shapeGroup.add(quad);
}

// ============================================================================
// Hard-edge linework — welded crease edges via the restored meshAnalyzer.js.
// ============================================================================

/** Crease threshold: dihedral angles sharper than this draw as ink. 24-segment facet seams
 *  (15°) stay silent so the cone/cylinder read as smooth; cap rims (≥ the cut angle) draw. */
const CREASE_COS = Math.cos(THREE.MathUtils.degToRad(20));

/**
 * Draw the solid's engineering edges: every welded edge whose two faces meet sharper than the
 * crease threshold (plus any boundary/non-manifold edge). Because the SLICED geometry feeds
 * one single buildEdgeMap() call — built once in the seam and shared with the projection
 * layer — the cut rim, where a cap edge and a clipped wall edge coincide, welds into ONE
 * record and draws once (CLAUDE.md: section edges must pass through welding or they
 * double-draw).
 *
 * @param {Map<string, import('./src/meshAnalyzer.js').EdgeRecord>} edgeMap
 */
function addEdgeOverlay(edgeMap) {
  const positions = [];
  for (const { edge, faces } of edgeMap.values()) {
    const crease = faces.length !== 2
      || faces[0].worldNormal.dot(faces[1].worldNormal) < CREASE_COS;
    if (crease) {
      positions.push(edge.p1.x, edge.p1.y, edge.p1.z, edge.p2.x, edge.p2.y, edge.p2.z);
    }
  }
  if (positions.length === 0) return;

  edgeMaterial = new LineMaterial({
    color: cssColor('--color-ink').getHex(),
    linewidth: 1.75, // px — real line weight (CLAUDE.md: LineBasicMaterial caps at 1px)
  });
  edgeMaterial.resolution.set(viewport?.clientWidth || 1, viewport?.clientHeight || 1);

  const lines = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), edgeMaterial);
  lines.computeLineDistances(); // required before any dashed material variant renders dashes
  lines.name = 'edge-overlay';
  shapeGroup.add(lines); // disposal contract frees geometry + material every rebuild
}

// ============================================================================
// Orthographic views + section drawing (ADR-060/061) — first-angle top /
// front / side views from the byte-identical Module2 drawer, plus the hatching
// and true-shape sheet from src/sectionView.js.
// ============================================================================

/**
 * Draw the three orthographic views (with per-view visible/dashed classification — exact
 * for this roster because a single-plane cut of a convex solid stays convex) and, when the
 * solid is cut, the apparent-section hatching + the true-shape auxiliary sheet.
 *
 * EVERY output group is parented INSIDE shapeGroup, so rebuild()'s deep disposal contract
 * frees all geometry + materials next build — no second dispose path. The held refs
 * (activeProjection / activeSectionView) serve only setResolution and stage gating.
 *
 * @param {Map<string, import('./src/meshAnalyzer.js').EdgeRecord>} edgeMap
 */
function addProjectionViews(edgeMap) {
  const w = viewport?.clientWidth || 1;
  const h = viewport?.clientHeight || 1;
  const z0 = uncutBbox ? uncutBbox.min.z - PP_MARGIN : DEFAULT_PP_STANDOFF;
  if (ppGrid) ppGrid.position.z = z0 - 0.01; // wall a step behind the side view's linework

  // Dimension layer OFF this phase (it carries CSS2D labels and this topic mounts no
  // CSS2DRenderer yet); connectors ON — the 3D→2D projector rays are the teaching cue.
  activeProjection = drawProjections(edgeMap, { width: w, height: h, drawDimensions: false, z0 });
  shapeGroup.add(activeProjection.group); // top + front views + 3D connectors (world frame)

  // The side view is drawn at local z = 0 by the drawer; its holder carries it to the PP
  // wall at z0 (the drawer's consumer contract — Module2's hinge pattern, minus the fold).
  const ppHolder = new THREE.Group();
  ppHolder.name = 'PP holder';
  ppHolder.position.z = z0;
  ppHolder.add(activeProjection.ppGroup);
  shapeGroup.add(ppHolder);
  activeProjection.ppHolder = ppHolder; // stage-gating handle
  shapeGroup.add(activeProjection.ppConnectorGroup);

  // Folded-sheet projectors belong to a later (fold) phase — parked hidden INSIDE
  // shapeGroup so the disposal contract still frees their line batch.
  activeProjection.flatConnectorGroup.visible = false;
  shapeGroup.add(activeProjection.flatConnectorGroup);

  if (latestSection) {
    // Sheet clearance: just past the far extent of the REMOVED half along the plane normal
    // (the normal points at the discarded side), measured on the stable uncut bbox.
    let maxD = 0;
    const corner = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      corner.set(
        i & 1 ? uncutBbox.max.x : uncutBbox.min.x,
        i & 2 ? uncutBbox.max.y : uncutBbox.min.y,
        i & 4 ? uncutBbox.max.z : uncutBbox.min.z,
      );
      maxD = Math.max(maxD, latestSection.planeWorld.distanceToPoint(corner));
    }
    activeSectionView = buildSectionViews(latestSection, latestSection.matrixWorld, {
      width: w, height: h, z0, sheetOffset: maxD + SHEET_CLEARANCE,
    });
    shapeGroup.add(
      activeSectionView.trueShapeGroup,
      activeSectionView.hpHatchGroup,
      activeSectionView.vpHatchGroup,
      activeSectionView.ppHatchGroup,
    );
  }
}

/**
 * Progressive reveal — the SINGLE writer of view visibility (ADR-044 lineage: gate in one
 * place, never per control). Stage ≥ 4 shows the reference walls + views + hatching;
 * stage ≥ 5 the true-shape sheet. View groups are re-created visible on every rebuild, so
 * this runs at the end of rebuild() AND on every stage change.
 */
function applyStageVisibility() {
  const views = stage >= 4;
  const trueShape = stage >= 5;
  if (vpGrid) vpGrid.visible = views;
  if (ppGrid) ppGrid.visible = views;
  if (activeProjection) {
    activeProjection.group.visible = views;
    activeProjection.ppHolder.visible = views;
    activeProjection.ppConnectorGroup.visible = views;
  }
  if (activeSectionView) {
    activeSectionView.hpHatchGroup.visible = views;
    activeSectionView.vpHatchGroup.visible = views;
    activeSectionView.ppHatchGroup.visible = views;
    activeSectionView.trueShapeGroup.visible = trueShape;
  }
}

/** Dispose one object's GPU resources — geometry + every material (+ any texture map). The single
 *  teardown primitive the deep disposal traversal in rebuild() applies to every descendant of
 *  shapeGroup. */
function disposeObj(obj) {
  obj.geometry?.dispose();
  const mat = obj.material;
  if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => { m?.map?.dispose(); m?.dispose(); });
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  // Renderer. Antialias for crisp technical edges; cap DPR so retina iframes don't overdraw.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows (CLAUDE.md visual style)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (CLAUDE.md flags context exhaustion as the most likely late-stage
  // bug). Without preventDefault() the browser will NOT restore the context and the canvas freezes
  // blank. So stop the loop + show a quiet chip on loss, then rebuild the current state on restore.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // REQUIRED — opts in to a restorable context
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild(currentShapeData); // re-upload GPU state (rebuild(null) is a no-op clear when empty)
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Lighting: flat ambient fill + ONE low directional, no shadows (CLAUDE.md visual style).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  // Subtle ground-reference grid — a neutral CAD orientation aid so the empty viewport reads as a
  // bench, not a void. Kept OUT of shapeGroup so rebuild() never disposes it. Remove it or replace
  // it with your subject's own reference frame.
  hpGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  hpGrid.material.opacity = 0.35;
  hpGrid.material.transparent = true;
  hpGrid.position.y = -0.01; // a step below the top view's linework — no coplanar z-fight
  scene.add(hpGrid);

  // VP / PP wall grids — the vertical reference planes the front and side views draw on.
  // Persistent instrument chrome like hpGrid (kept OUT of shapeGroup so rebuild() never
  // disposes them); hidden until the views stage (applyStageVisibility). Each sits a step
  // behind its view's linework on the observer axis, mirroring hpGrid's −0.01 lift.
  vpGrid = new THREE.GridHelper(8, 8, cssVar('--color-bench-grey'), cssVar('--color-border'));
  vpGrid.material.opacity = 0.35;
  vpGrid.material.transparent = true;
  vpGrid.rotation.z = Math.PI / 2;   // XZ floor grid → YZ wall (normal along X)
  vpGrid.position.set(-0.01, 4, 0);  // spans y 0..8, z −4..4
  vpGrid.visible = false;
  scene.add(vpGrid);

  ppGrid = new THREE.GridHelper(8, 8, cssVar('--color-bench-grey'), cssVar('--color-border'));
  ppGrid.material.opacity = 0.35;
  ppGrid.material.transparent = true;
  ppGrid.rotation.x = Math.PI / 2;   // XZ floor grid → XY wall (normal along Z)
  ppGrid.position.set(2, 4, DEFAULT_PP_STANDOFF - 0.01); // z reseated per rebuild from z0
  ppGrid.visible = false;
  scene.add(ppGrid);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // Orbit controls (free-orbit perspective view).
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();
}

// ============================================================================
// Render loop
// ============================================================================

let lastFrameTime = 0;

function animate(now) {
  rafId = requestAnimationFrame(animate);
  // Delta in ms (cap to avoid a huge jump after a pause/tab-switch resumes).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);  // advance any domain animations (pauses with the loop)
  controls.update();  // applies damping inertia
  renderer.render(scene, camera);
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0; // reset delta clock so resume() doesn't see a stale gap
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize — track the container, not just window (the host can resize the iframe
// without a window resize event).
// ============================================================================

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  // Fat lines are resolution-dependent — keep every current linework layer in sync.
  edgeMaterial?.resolution.set(w, h);
  activeProjection?.setResolution(w, h);
  activeSectionView?.setResolution(w, h);
}

// ============================================================================
// Mobile advisory — banner only, never blocks the sim (platform contract).
// ============================================================================

function setupMobileNotice() {
  const notice = document.getElementById('mobile-notice');
  const dismiss = document.getElementById('mobile-notice-dismiss');
  if (!notice || !dismiss) return;

  const mq = window.matchMedia('(max-width: 767px)');
  let dismissed = false;

  const sync = () => { notice.hidden = !mq.matches || dismissed; };
  dismiss.addEventListener('click', () => { dismissed = true; sync(); });
  mq.addEventListener('change', sync);
  sync();
}

// ============================================================================
// Wizard hide/show — collapse the guided-steps panel for a larger 3D view.
// Toggles a body class; the viewport reflows to full width via flex, and the
// ResizeObserver below keeps the renderer in sync.
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');

    // The viewport just changed size (flex reflow). Sync the renderer to the new box on the next
    // frame, once the layout has settled.
    requestAnimationFrame(() => handleResize(viewport));
  });
}

// ============================================================================
// Platform API (CLAUDE.md "Platform contract")
// ============================================================================

function resetCamera() {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

/**
 * The platform calls pause() when overlays/whiteboard open and resume() on close. reset() restores
 * defaults and routes through rebuild() — the one reset path the in-sim Reset must also use
 * (CLAUDE.md: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    resetCamera();
    sectionState = defaultSectionState(); // section plane off + defaults (topic-local state)
    lastSectionStatus = null;
    rebuild(defaultShapeData()); // back to the default solid — runs the disposal contract
    stepper?.reset();  // wizard back to Step 1
    announce('Simulation reset.');
  },
};

// ============================================================================
// UI controller — the narrow surface the leaf modules depend on. State + the
// rebuild pipeline stay owned here; controls read through getters and write
// through commit/reset, so the layering rule holds (leaves import no other layer).
// Extend this with your own domain methods as you build controls.
// ============================================================================

const simController = {
  /** ShapeType enum, injected so uiManager imports no other layer (CLAUDE.md layering). */
  ShapeType,

  /** Fire the once-per-load host completion signal (ADR-078 addendum). */
  markComplete,

  /** Current on-screen state (null on the empty start). */
  state: () => currentShapeData,

  /** Whether anything is currently on screen (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

  /** Merge params into state and rebuild — the single write path for your controls. */
  commit(partial) { rebuild({ ...(currentShapeData ?? {}), ...partial }); },

  /** Copy of the topic-local section-plane state (see the SectionState block above). */
  sectionState: () => ({ ...sectionState }),

  /** Merge params into the section state and rebuild — the single write path for the
   *  section controls. Lives beside commit(), NOT inside ShapeData (ADR-058). */
  commitSection(partial) {
    Object.assign(sectionState, partial);
    rebuild(currentShapeData);
  },

  /** Latest cut result ({loops, basis, capStart}) or null — the seam the true-shape
   *  auxiliary view and the headless self-check read. */
  section: () => latestSection,

  /** Wizard stage (1–5), driven by the stepper. Progressive reveal only — geometry is
   *  built once per rebuild regardless of stage (applyStageVisibility is the one writer). */
  setStage(n) {
    stage = n;
    applyStageVisibility();
    if (n >= 5 && !latestSection) {
      flowNote('Turn the section plane on (Step 2) — the true shape needs a cut to show.');
    }
  },

  /** Swing the camera square-on to the section face (Step 5). The orbit DISTANCE is
   *  preserved, so this is pure navigation — the drawing scale never changes (ADR-061). */
  faceSection() {
    if (!latestSection || !activeSectionView) {
      flowNote('Cut the solid first — enable the section plane in Step 2.');
      return;
    }
    const { centroid, normal } = activeSectionView.worldFrame;
    const dist = camera.position.distanceTo(controls.target);
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    const toPos = centroid.clone().addScaledVector(normal, dist);
    faceTweenHandle?.cancel();
    faceTweenHandle = tween({
      from: 0,
      to: 1,
      duration: 900,
      ease: easeCamera,
      onUpdate(t) {
        camera.position.lerpVectors(fromPos, toPos, t);
        controls.target.lerpVectors(fromTarget, centroid, t);
        controls.update();
      },
      onComplete() { faceTweenHandle = null; },
    });
    announce('Camera moved square-on to the section — you are looking at its true shape.');
  },

  /** Route through the single reset path (re-syncs the wizard + announces). */
  reset() { window.simAPI.reset(); },

  /** Whether a textbook problem is loaded — drives the Step-5 CTA label (stepper.js). */
  isProblemActive() { return problemLibrary?.isActive() ?? false; },

  /**
   * Step-5 "Complete & next problem": close out the finished cut and send the learner
   * back to the library for the next one. Celebrate (calm toast), clear the active-problem
   * framing, reset through the single path, then open the library — so picking the next
   * problem starts from the clean Step-1 default, not a half-dismantled scene.
   */
  completeAndNext() {
    const hadProblem = problemLibrary?.isActive() ?? false;
    const message = hadProblem
      ? 'Section complete — well done. Choose your next problem to continue.'
      : 'Choose a problem to try your skills on.';
    showToast(message);
    problemLibrary?.exit();     // clear the pinned statement + self-check framing
    window.simAPI.reset();      // the one reset path (default solid, Step 1)
    problemLibrary?.open();     // pick the next problem (pauses the loop while open)
    announce(message);          // last write wins in the live region — the win narrates
  },

  announce,
  flowNote,

  /** Flash an ad-hoc contextual chip over the viewport (the onboarding cue system). */
  cueHint(text) { onboarding?.cue?.(text, 'ink'); },

  /** Register a callback fired at the end of every rebuild(). Returns an unsubscribe fn. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
};

// ============================================================================
// Self-start (CLAUDE.md: sim runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container; // module-wide handle for live resize

  // The one operation that can hard-fail is WebGL context creation (hardware acceleration off,
  // GPU blocklisted, ancient browser). Catch it, surface the on-brand WebGL fallback instead of a
  // blank iframe, and bail cleanly.
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  // Chrome + control wiring. Wrapped too so an unexpected wiring failure shows the generic
  // fallback rather than half-booting into a confusing partial UI.
  try {
    setupMobileNotice();
    setupWizardToggle();
    stepper = initStepper(simController);
    initTerms();                           // wire inline term-definition popovers (static markup)
    onboarding = initOnboarding(controls); // first-run hints (empty-state overlay was removed)

    new ResizeObserver(() => handleResize(container)).observe(container);

    // Seed the default solid on boot (unseated, no projections yet — see the DOMAIN BUILD
    // SEAM in rebuild() above), THEN wire the dock so its initial sync reads real state.
    rebuild(defaultShapeData());
    const ui = initUIManager(simController);
    stateChangeSubs.add(() => ui.sync()); // reset/commit keep the dock honest automatically
    problemLibrary = initProblemLibrary(simController); // after the dock: its self-check rides the same seam
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Tell the watchdog the sim is live (clears its timer, hides any slow-load fallback). Last, so it
  // only fires on a fully successful boot.
  markBooted();
}

init();
