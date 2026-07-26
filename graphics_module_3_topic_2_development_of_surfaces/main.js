// Orchestrator — Simatrix Starter Template.
//
// Boots an EMPTY 3D scene (paper background) with the platform contract wired and NOTHING
// subject-specific: the guided-stepper chrome (src/stepper.js), the inline term popovers
// (src/terms.js), first-run onboarding (src/onboarding.js), window.simAPI, the mobile notice,
// the wizard hide/show toggle, the boot watchdog + WebGL context-loss recovery, and a single
// disposal-safe rebuild() pipeline ready for your domain geometry.
//
// This is the sanitised boilerplate (MODULE-STARTER Case C): the Engineering-Graphics solid
// engine, projections, fold, quick-views, and parameter dock have all been stripped. Build your
// own domain by:
//   1. adding your generated geometry to `shapeGroup` inside rebuild()'s marked build seam, and
//   2. wiring your own controls to `simController` (see the empty state()/commit() seam below).
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/onboarding/anim)
// never import each other; they hang off this file.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tick as tickTweens, cancelAll as cancelTweens } from './src/anim.js';

import { defaultShapeData, ShapeType } from './src/shapeData.js';
import { layoutFor, drawDevelopment, computeCutDistances, computeStringPath, drawStringPath } from './src/developmentEngine.js';
import { polygonVertexAngle, PolygonAlignment } from './src/genericSolid.js';
import { cutGeometryWithPlane } from './src/sectionCut.js';
import { initUIManager } from './src/uiManager.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { createCube } from './src/cube.js';
import { createCone } from './src/cone.js';
import { createCylinder } from './src/cylinder.js';
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

/**
 * Topic default state: a cylinder resting on HP, axis vertical — the canonical first
 * development (its lateral surface unrolls to a plain rectangle). Overrides only the
 * shape field so src/shapeData.js stays byte-identical to Module2 (RULES.md §1.3–§1.4).
 * @returns {import('./src/shapeData.js').ShapeData}
 */
function defaultSolidData() {
  return { ...defaultShapeData(), shape: ShapeType.Cylinder };
}

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
// Cutting-plane state — TOPIC-LOCAL, deliberately outside ShapeData.
// src/shapeData.js is byte-identical to Module2 (RULES.md §1.3–1.4), so the section
// parameters live here and merge at the rebuild() call site instead (ADR-067,
// mirroring topic-1's ADR-059). Mutated only via simController.commitSection(),
// which routes through rebuild(). The plane is ALWAYS ⊥ VP, inclined angleDeg to the
// HP (ADR-068) — the KTU truncation standard the development height-model
// represents exactly; this topic has no orientation axis.
// ============================================================================

/**
 * @typedef {Object} SectionState
 * @property {boolean} enabled   Whether the solid is truncated.
 * @property {number} angleDeg   Inclination to the HP, degrees (0–90; 0 = horizontal cut).
 * @property {number} cutHeight  Height (world units, 1 unit = 10 mm) above the BASE at
 *   which the plane crosses the solid's axis — the dock's "Cut height" slider.
 */

/** @returns {SectionState} fresh defaults (no shared reference with live state). */
function defaultSectionState() {
  return { enabled: false, angleDeg: 30, cutHeight: 1 };
}

/** @type {SectionState} */
let sectionState = defaultSectionState();

/** The CURRENT build's cutting plane in the solid's SEATED local frame (base centre at
 *  the origin, +y up, base at y=0) as {nx,ny,nz,d} with n·p + d = 0 — exactly the
 *  contract computeCutDistances() wants. null while the cut is off or misses the solid,
 *  so drawCompare() falls back to the full pattern. Set only inside rebuild()'s seam. */
let activeCutLocalPlane = null;

/** Last cut status ('cut' | 'no-cut' | 'all-cut' | null), so learner feedback fires only
 *  on a TRANSITION, not on every slider tick (topic-1 precedent). */
let lastSectionStatus = null;

// ============================================================================
// Shortest-path ("string") reveal state — TOPIC-LOCAL, outside ShapeData
// (ADR-067 mirror) and outside the rebuild() pipeline (ADR-070):
// commitStringPath() is a NON-rebuild overlay commit. The problem library asserts
// the spec on a matched self-check and clears it on unmatch/exit; rebuild() wipes
// the 3D string with the rest of shapeGroup, so the library re-asserts it after
// every rebuild while matched (idempotent — no rebuild call, no re-entrancy).
// ============================================================================

/** The active shortest-path spec ({ wrap, from, to } — src/problems.js) or null. */
let stringPathSpec = null;

/** The just-built solid mesh (pose matrix = seated→world), held so the string
 *  overlay can be lifted through the SAME transform. Set in rebuild()'s seam. */
let currentSolidMesh = null;

/** The live string Line2 material — handleResize keeps its px resolution honest. */
let stringLineMaterial = null;

/** Slight radial inflate so the wrapped string sits ON the surface, never inside
 *  it (z-fights the fill without it). */
const STRING_INFLATE = 1.01;

/** ShapeType → prism/pyramid side counts, matching developmentEngine's tables. */
const STRING_PRISM_SIDES = Object.freeze({
  Cube: 4, TriangularPrism: 3, SquarePrism: 4, PentagonalPrism: 5, HexagonalPrism: 6,
});
const STRING_PYRAMID_SIDES = Object.freeze({
  TriangularPyramid: 3, Pyramid: 4, PentagonalPyramid: 5, HexagonalPyramid: 6,
});

/**
 * Lift the 2D string path back onto the 3D solid — the per-face-isometry wrap
 * (ADR-070): a straight line on the development is straight on every flat
 * face, so only the fold-crossing points need mapping; the cone's curved surface
 * uses the engine's fine sample grid instead. Points are built in the SEATED
 * frame (base centre at origin, +y up), shifted to the generators' CENTRED frame
 * (y − h/2), then pushed through the mesh's own pose matrix — the same
 * seated→world path computeCutDistances' plane travels in reverse.
 *
 * @param {import('./src/shapeData.js').ShapeData} data
 * @param {object} layout   From layoutFor(data).
 * @param {ReturnType<typeof computeStringPath>} path
 * @returns {THREE.Vector3[]} world-space polyline (empty when not liftable).
 */
function liftStringPathTo3D(data, layout, path) {
  if (!path?.valid || !currentSolidMesh) return [];
  const h = data.height;
  const pts = [];

  if (path.method === 'parallel') {
    const n = STRING_PRISM_SIDES[data.shape];
    if (n === undefined) return []; // cylinder string problems not authored (fine grid TBD)
    const rad = (data.baseLength / (2 * Math.sin(Math.PI / n))) * STRING_INFLATE;
    for (const c of path.crossings) {
      const a = polygonVertexAngle(n, c.k, PolygonAlignment.PRISM); // the phase the meshes carry
      pts.push(new THREE.Vector3(rad * Math.cos(a), h - c.y, rad * Math.sin(a)));
    }
  } else {
    const isCone = layout.kind === 'cone';
    const apex = new THREE.Vector3(0, h, 0);
    const g0 = -(isCone ? layout.thetaRad : layout.totalRad) / 2;
    if (isCone) {
      // Pattern sweep fraction ↔ base-circle fraction: wrap of the full sector is
      // wrap of the full 2π rim (the arc-length identity that built the sector).
      const baseR = (data.baseLength / 2) * STRING_INFLATE;
      const wrap = stringPathSpec.wrap;
      for (const s of path.samples) {
        const a = s.frac * wrap * 2 * Math.PI; // rim angle from the k=0 seam (plain 2πk/N lattice)
        const basePt = new THREE.Vector3(baseR * Math.cos(a), 0, baseR * Math.sin(a));
        pts.push(apex.clone().lerp(basePt, s.rho / layout.slant));
      }
    } else {
      const n = layout.sides;
      const Rc = (data.baseLength / (2 * Math.sin(Math.PI / n))) * STRING_INFLATE;
      for (const c of path.crossings) {
        const k = Math.round((c.gamma - g0) / layout.phi); // which lateral edge this crossing rides
        const a = polygonVertexAngle(n, k, PolygonAlignment.FLAT_EDGE_FRONT); // pyramid corner phase
        const basePt = new THREE.Vector3(Rc * Math.cos(a), 0, Rc * Math.sin(a));
        pts.push(apex.clone().lerp(basePt, c.rho / layout.slant)); // fraction on the TRUE (uninflated) slant edge

      }
    }
  }

  // Seated → centred (generators build at ±h/2) → world through the mesh's pose.
  // updateMatrix() first: with the cut off, nothing composed the matrix since this
  // rebuild created the mesh (the render loop only does it on the NEXT frame), so
  // .matrix would still be identity and the string would render half a height low.
  currentSolidMesh.updateMatrix();
  for (const p of pts) {
    p.y -= h / 2;
    p.applyMatrix4(currentSolidMesh.matrix);
  }
  return pts;
}

/**
 * (Re)build the 3D string overlay for the current spec: a fat plum Line2 polyline
 * parented into shapeGroup, so the ADR-042 deep-disposal contract frees it with
 * everything else on the next rebuild. Removes any previous string first, making
 * the call idempotent (the library re-asserts after every rebuild while matched).
 */
function rebuildStringPath3D() {
  const old = shapeGroup?.getObjectByName('string-path');
  if (old) {
    old.traverse(disposeObj);
    shapeGroup.remove(old);
  }
  stringLineMaterial = null;
  if (!stringPathSpec || !currentShapeData || !currentSolidMesh) return;

  const layout = layoutFor(currentShapeData);
  const path = computeStringPath(layout, stringPathSpec);
  const pts = liftStringPathTo3D(currentShapeData, layout, path);
  if (pts.length < 2) return;

  const geometry = new LineGeometry();
  geometry.setPositions(pts.flatMap((p) => [p.x, p.y, p.z]));
  stringLineMaterial = new LineMaterial({
    color: cssColor('--color-dev-path'),
    linewidth: 2.5, // px — engineering answer weight (LineMaterial, CLAUDE.md gotchas)
  });
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  stringLineMaterial.resolution.copy(size);

  const line = new Line2(geometry, stringLineMaterial);
  line.computeLineDistances();
  line.name = 'string-path';
  shapeGroup.add(line);
}

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
 * Show a brief, calm success toast over the viewport (the terminal-step "Complete &
 * next problem" win). Token-driven success styling + a check glyph — NOT a gamified
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
  currentSolidMesh = null;   // the disposal wipe above just freed it
  stringLineMaterial = null; // ditto — the string overlay rides shapeGroup

  // ── DOMAIN BUILD SEAM ─────────────────────────────────────────────────────────────────────
  // ShapeType → generator dispatch builds the seated solid; its edge overlay rides as a
  // transform-copying SIBLING per the Module2 pattern. `rebuild(null)` clears to the empty start.
  if (shapeData) {
    const mesh = createSolidMesh(shapeData);
    applySectionCut(mesh, shapeData); // truncation stage — swaps in sliced geometry on a cut
    const edgeOverlay = createEdgeOverlay(mesh.geometry);
    edgeOverlay.position.copy(mesh.position);
    edgeOverlay.quaternion.copy(mesh.quaternion);
    edgeOverlay.scale.copy(mesh.scale);
    edgeOverlay.visible = mesh.visible; // 'all-cut' hides the solid — hide its edges too
    shapeGroup.add(mesh, edgeOverlay);
    currentSolidMesh = mesh; // pose handle for the string-path overlay (commitStringPath)
  }
  onboarding?.setSolidPresent(shapeData !== null);
  // ───────────────────────────────────────────────────────────────────────────────────────────

  notifyStateChange(); // state change committed — re-run any subscriber (e.g. a self-check)
}

/** Dispose one object's GPU resources — geometry + every material (+ any texture map). The single
 *  teardown primitive the deep disposal traversal in rebuild() applies to every descendant of
 *  shapeGroup. */
function disposeObj(obj) {
  obj.geometry?.dispose();
  const mat = obj.material;
  if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => { m?.map?.dispose(); m?.dispose(); });
}

/**
 * ShapeType → generator dispatch, ported verbatim from Module2/main.js (the reference solids
 * implementation). Called ONLY from inside rebuild()'s DOMAIN BUILD SEAM.
 *
 * @param {import('./src/shapeData.js').ShapeData} data
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

/**
 * Visible-edge overlay for the solid: solid dark ink lines (CLAUDE.md visual style). Placeholder
 * uses LineBasicMaterial (1px cap is acceptable for the solid's own silhouette); the development /
 * projection layer will use LineSegments2 + LineMaterial for real engineering line weights.
 *
 * @param {THREE.BufferGeometry} sourceGeometry
 * @returns {THREE.LineSegments}
 */
function createEdgeOverlay(sourceGeometry) {
  const edges = new THREE.EdgesGeometry(sourceGeometry);
  const material = new THREE.LineBasicMaterial({ color: cssColor('--color-ink') });
  return new THREE.LineSegments(edges, material);
}

// ============================================================================
// Truncation stage — topic-1's ADR-058 analytic clipper, ported. Runs INSIDE
// rebuild()'s build seam, never as a live mutation reacting directly to a slider.
// ============================================================================

/**
 * The learner's cutting plane in WORLD space, built from sectionState. Normal
 * (0, cosθ, sinθ) — ⊥ VP, inclined θ to the HP — points at the DISCARDED upper half
 * (the textbook "portion above the cutting plane is removed", so the development shows
 * the remaining lower portion). Anchored on the solid's own axis at cutHeight above its
 * base: generator geometry is CENTRED (base at −h/2 — see cylinder.js/cone.js), so the
 * centred-frame axis point (0, cutHeight − h/2, 0) maps through mesh.matrix to the world
 * anchor, which keeps the anchor honest under any pose.
 *
 * @param {THREE.Mesh} mesh  The just-generated solid, .matrix up to date.
 * @param {number} height    ShapeData height (world units).
 * @returns {THREE.Plane}
 */
function buildSectionPlaneWorld(mesh, height) {
  const rad = THREE.MathUtils.degToRad(sectionState.angleDeg);
  const normal = new THREE.Vector3(0, Math.cos(rad), Math.sin(rad));
  const anchor = new THREE.Vector3(0, sectionState.cutHeight - height / 2, 0)
    .applyMatrix4(mesh.matrix);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor);
}

/**
 * Slice the freshly generated solid with the cutting plane (when enabled), and derive the
 * SEATED-frame plane the 2D development engine consumes. The cut happens in mesh-LOCAL
 * space — the world plane is pulled through the inverse mesh matrix — so the generator's
 * position/quaternion pipeline is untouched and the sliced geometry inherits the existing
 * pose. That single matrix inversion IS the ADR-005 "ZXY inverse": the Euler order was
 * baked into mesh.quaternion at compose time, so inverting the COMPOSED matrix is exact
 * and no Euler is ever decomposed. The engine's frame then differs from the generators'
 * centred frame by the base-centring shift only: d_seated = d_local − n_y·(h/2).
 *
 * On a real cut the mesh's geometry is swapped for the sliced one (old geometry disposed
 * immediately — it never reaches the scene, so the rebuild disposal contract can't see it)
 * and the material becomes [solid fill, section face] matching the geometry's two groups.
 *
 * @param {THREE.Mesh} mesh The just-generated solid (not yet parented).
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function applySectionCut(mesh, data) {
  activeCutLocalPlane = null;
  if (!sectionState.enabled) { lastSectionStatus = null; return; }

  mesh.updateMatrix(); // parent is shapeGroup at identity, so .matrix IS the world transform
  const planeWorld = buildSectionPlaneWorld(mesh, data.height);
  const planeLocal = planeWorld.clone().applyMatrix4(mesh.matrix.clone().invert());

  // World bbox of the UNCUT solid — sizes and centres the plane's visual quad. Taken
  // BEFORE the slice so the quad never shrinks with the remaining portion.
  mesh.geometry.computeBoundingBox();
  const bboxWorld = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix);

  const result = cutGeometryWithPlane(mesh.geometry, planeLocal);

  if (result.status !== 'no-cut') {
    // Seated frame for computeCutDistances(): base centre at the origin, base at y=0
    // (the generators centre their geometry at ±h/2, hence the constant shift).
    activeCutLocalPlane = {
      nx: planeLocal.normal.x,
      ny: planeLocal.normal.y,
      nz: planeLocal.normal.z,
      d: planeLocal.constant - planeLocal.normal.y * (data.height / 2),
    };
  }

  if (result.status === 'cut') {
    mesh.geometry.dispose(); // swap-out happens pre-scene; dispose by hand, not by contract
    mesh.geometry = result.geometry;

    // Group 0 keeps the solid's own fill; group 1 (the cap) gets the section-face token.
    const capMaterial = mesh.material.clone();
    capMaterial.color = cssColor('--color-section-face');
    mesh.material = [mesh.material, capMaterial];
  } else if (result.status === 'all-cut') {
    mesh.visible = false; // the plane removes the whole solid — an honest empty result
  }
  // 'no-cut': the plane misses the solid on the kept side — leave it whole.

  // Learner feedback on TRANSITIONS only (never per slider tick).
  if (result.status !== lastSectionStatus) {
    if (result.status === 'all-cut') {
      flowNote('The plane now clears the whole solid — nothing is left. Bring the cut height down.');
      announce('The cutting plane removes the entire solid.');
    } else if (result.status === 'no-cut' && lastSectionStatus !== null) {
      flowNote('The plane misses the solid — lower the cut height until it cuts.');
      announce('The cutting plane no longer intersects the solid.');
    }
    lastSectionStatus = result.status;
  }

  addSectionPlaneVisual(planeWorld, bboxWorld);
}

/**
 * Translucent quad + outline showing WHERE the cutting plane lies. Parented into shapeGroup
 * so the rebuild disposal contract frees it like everything else. (Topic-1 port, verbatim.)
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
  // this is instrument chrome, not engineering linework.
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(quadGeo),
    new THREE.LineBasicMaterial({ color: cssColor('--color-section-face'), transparent: true, opacity: 0.55 }),
  );
  quad.add(border); // inherits pose; deep disposal frees both

  shapeGroup.add(quad);
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
  scene.add(hpGrid);

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
  // LineMaterial renders in screen px — its resolution must track the drawing buffer
  // or the fat string line stretches (CLAUDE.md LineMaterial gotcha).
  if (stringLineMaterial) {
    stringLineMaterial.resolution.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
  }
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
// Compare view + 50/50 workbench (ADR-012 / ADR-037, ported from the Module 2
// master 2026-07-18). The right pane is the 2D development sheet: drawCompare()
// below sizes the canvas and delegates the flat-pattern math + Canvas2D paths to
// src/developmentEngine.js (ADR-066). Pan (ADR-054) and wheel zoom (ADR-055)
// are pure post-multipliers over the fixed intrinsic frame (ADR-053 pattern).
// ============================================================================

/** ADR-018 declared scale: 1 world unit = 10 mm. The development sheet's fixed
 *  intrinsic frame (ADR-053 pattern) is defined in mm, so the engine's world-unit
 *  layout extents convert through this before the px-per-mm scale is derived. */
const WORLD_TO_MM = 10;

let compareCard = null;
let compareCanvas = null;
let compareChip = null;
let compareOpen = false;      // the card is shown at all
let workbenchOpen = false;
/** Drag-to-pan offset (CSS px, ADR-054) applied on top of the fixed intrinsic frame in
 *  drawCompare's project(). User-driven only; zeroed on every fresh open, dblclick, reset. */
let comparePanX = 0;
let comparePanY = 0;
/** Scroll-wheel zoom multiplier (ADR-055) — post-multiplies the intrinsic scale, never
 *  replaces it. Same reset contract as comparePanX/Y. */
let compareZoom = 1;
const COMPARE_ZOOM_MIN = 0.4;
const COMPARE_ZOOM_MAX = 5;

/** Driver wrappers docked into #workbench-rail during the split (Module 2 pattern):
 *  the solid picker and the cutting-plane group ride into the rail so both stay usable
 *  while the wizard is collapsed behind the 50/50 split. */
const WORKBENCH_CONTROLS = ['shape', 'section'];
/** @type {Map<string, {parent: Element, next: Node|null}>} Each docked wrapper's original
 *  {parent, nextSibling}, captured on first re-parent so exitWorkbench restores it. */
const driverHomes = new Map();

/** Collapse the wizard, split the viewport 50/50, and dock the driver wrappers (none yet —
 *  see WORKBENCH_CONTROLS) under both panes. Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;

  const rail = document.getElementById('workbench-rail'); // static markup in this topic
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = document.querySelector(`[data-ctrl="${key}"]`);
    if (!wrap || !rail) continue;
    if (!driverHomes.has(key)) {
      driverHomes.set(key, { parent: wrap.parentElement, next: wrap.nextSibling });
    }
    rail.appendChild(wrap);
  }

  // Re-parent the drawing card out to <body> so the grid can place it as the right pane
  // (the card is a plain grid cell in the split — ADR-080 — not absolutely positioned,
  // but it still needs to leave #sim-viewport to become a body-level sibling).
  if (compareCard && compareCard.parentElement !== document.body) {
    document.body.appendChild(compareCard);
  }
  document.body.classList.add('compare-split');
  // The rail toggle always defaults to shown on entry — a prior collapse from an earlier
  // split visit must not carry over, and the button's own facets need the same reset.
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
}

/** Restore the floating layout: hand any docked wrappers back to their captured home
 *  slots and re-nest the card in #sim-viewport. Idempotent. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);

  // Card back inside the viewport, its normal-flow parent outside the split.
  if (compareCard && viewport && compareCard.parentElement !== viewport) {
    viewport.appendChild(compareCard);
  }

  const rail = document.getElementById('workbench-rail');
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = rail?.querySelector(`[data-ctrl="${key}"]`);
    const home = driverHomes.get(key);
    if (wrap && home?.parent) home.parent.insertBefore(wrap, home.next);
  }
}

/** Re-measure the viewport AFTER a layout-changing reflow has actually been laid out
 *  (entering/leaving the split flips the body between a flex row and a CSS grid — a
 *  heavy reflow not committed by the first requestAnimationFrame). */
function remeasureAfterReflow() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    handleResize(viewport);
    if (compareOpen) drawCompare();
  }));
}

/** State-aware Compare chip: aria-pressed mirrors open/closed (the CSS fills the pill
 *  solid accent while pressed). Always visible — the sim always has a solid on screen,
 *  so there is no projection gate in this topic. */
function updateCompareChip() {
  compareChip?.setAttribute('aria-pressed', String(compareOpen));
}

/** Single reset point for the sheet's user-driven view state (ADR-054 pan + ADR-055
 *  zoom) — called on fresh open, dblclick recenter, and sim reset. */
function resetCompareView() {
  comparePanX = 0;
  comparePanY = 0;
  compareZoom = 1;
}

const compare = {
  show() {
    compareOpen = true;
    resetCompareView(); // every fresh open starts centred and unzoomed
    if (compareCard) compareCard.hidden = false;
    // Compare has exactly one shape now (ADR-080) — always the docked split, at every
    // viewport width.
    enterWorkbench();
    remeasureAfterReflow(); // the grid reflow isn't laid out on frame 1 — measure after 2 frames
    updateCompareChip();
    announce('Compare view opened — 2D development drawing.');
  },
  hide() {
    if (!compareOpen) return;
    compareOpen = false;
    const wasSplit = workbenchOpen;
    if (wasSplit) exitWorkbench(); // tear the split down before the card vanishes
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Compare view closed.');
    if (wasSplit) remeasureAfterReflow(); // hand the width back, resize the renderer
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

/** One-source-of-truth sync for the #rail-toggle button's 4 state facets (aria-expanded,
 *  aria-label, title, the visible .rail-toggle__text span). Called from the click handler
 *  AND from enter/exitWorkbench, which force-reset it on every split transition — without
 *  those second call sites the button reads stale "Show"/"Hide" text (the Points topic's
 *  2026-07-15 rail-toggle desync fix, re-fixed on forced re-entry 2026-07-17). */
function syncRailToggleState(collapsed) {
  const btn = document.getElementById('rail-toggle');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
  btn.title = collapsed ? 'Show controls' : 'Hide controls';
  const txt = btn.querySelector('.rail-toggle__text');
  if (txt) txt.textContent = collapsed ? 'Show' : 'Hide';
}

function setupRailToggle() {
  const btn = document.getElementById('rail-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('rail-collapsed');
    syncRailToggleState(collapsed);
    announce(collapsed ? 'Controls rail hidden.' : 'Controls rail shown.');
    // The rail's grid row (and its gap) drops out on collapse, so the viewport and 2D
    // drawing card grow into the reclaimed height — reuse the double-rAF reflow wait.
    remeasureAfterReflow();
  });
}

/** Bind + wire the Compare chrome once at boot: the chip is Compare's only open/close
 *  control (ADR-080) — there is no separate expand/close head chrome and no breakpoint
 *  fallback to a floating card. */
function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
  compareCanvas = document.getElementById('compare-canvas');

  compareChip?.addEventListener('click', () => compare.toggle());

  setupRailToggle();
  setupComparePan();
}

/** Drag-to-pan (ADR-054) + scroll-wheel zoom (ADR-055) on the 2D sheet — standard
 *  pointer-capture drag, coalesced to one redraw per animation frame. Neither touches the
 *  intrinsic scale/anchor, so both compose with the ADR-053 scale-lock instead of fighting
 *  it. Double-click recenters AND un-zooms. */
function setupComparePan() {
  if (!compareCanvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let redrawQueued = false;

  const queueRedraw = () => {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      if (compareOpen) drawCompare();
    });
  };

  compareCanvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    compareCanvas.setPointerCapture(e.pointerId);
    compareCanvas.style.cursor = 'grabbing';
  });
  compareCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    comparePanX += e.clientX - lastX;
    comparePanY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    queueRedraw();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (compareCanvas.hasPointerCapture?.(e.pointerId)) {
      compareCanvas.releasePointerCapture(e.pointerId);
    }
    compareCanvas.style.cursor = 'grab';
  };
  compareCanvas.addEventListener('pointerup', endDrag);
  compareCanvas.addEventListener('pointerleave', endDrag);
  compareCanvas.addEventListener('pointercancel', endDrag);
  compareCanvas.addEventListener('dblclick', () => {
    resetCompareView();
    if (compareOpen) drawCompare();
  });

  // Scroll-wheel zoom (ADR-055), zeroed-in on the pointer: solve for the pan shift that
  // keeps the point under the cursor fixed on screen as compareZoom changes, using the
  // same (w/2, h/2) centre drawCompare's project() anchors to. preventDefault +
  // non-passive stops the page from scrolling under the card.
  compareCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = compareCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, compareZoom * factor));
    if (nextZoom === compareZoom) return; // clamped — nothing to do
    const k = nextZoom / compareZoom;
    comparePanX = (mx - midX) * (1 - k) + comparePanX * k;
    comparePanY = (my - midY) * (1 - k) + comparePanY * k;
    compareZoom = nextZoom;
    queueRedraw();
  }, { passive: false });
}

/**
 * Repaint the 2D development sheet — a live rebuild on every commit, never a snapshot.
 * Thin orchestrator: sizes the DPR-scaled backing store, paints the paper, derives the
 * fixed intrinsic frame (ADR-053 pattern: px-per-mm from the ANALYTIC nominal footprint
 * the engine computes out of ShapeData intrinsics — never the live drawn extents, so the
 * pattern can never bleed off the card and pan/zoom/cuts can never rescale it), then
 * delegates every flat-pattern decision to src/developmentEngine.js (ADR-066).
 */
function drawCompare() {
  if (!compareCanvas) return;
  const stage = compareCanvas.parentElement;
  const w = stage?.clientWidth || 0;
  const h = stage?.clientHeight || 0;
  if (!w || !h) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  compareCanvas.width = Math.round(w * dpr);
  compareCanvas.height = Math.round(h * dpr);
  const ctx = compareCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = cssVar('--color-paper');
  ctx.fillRect(0, 0, w, h);

  if (!currentShapeData) return; // empty start — nothing to develop

  const layout = layoutFor(currentShapeData);

  // Fixed intrinsic frame (ADR-053 pattern): scale from the analytic nominal bbox in mm.
  const marginPx = 40;
  const nomWmm = Math.max((layout.bbox.maxX - layout.bbox.minX) * WORLD_TO_MM, 1e-6);
  const nomHmm = Math.max((layout.bbox.maxY - layout.bbox.minY) * WORLD_TO_MM, 1e-6);
  const scale = Math.min((w - 2 * marginPx) / nomWmm, (h - 2 * marginPx) / nomHmm); // px per mm

  const cx = w / 2;
  const cy = h / 2;
  const anchorX = (layout.bbox.minX + layout.bbox.maxX) / 2;
  const anchorY = (layout.bbox.minY + layout.bbox.maxY) / 2;
  const pxPerWorld = WORLD_TO_MM * scale * compareZoom;

  // Pattern space is world units with y DOWN (the engine's convention, matching canvas),
  // so no y flip here — just scale, centre, and layer the user's pan.
  const view = {
    project: (p) => ({
      x: cx + (p.x - anchorX) * pxPerWorld + comparePanX,
      y: cy + (p.y - anchorY) * pxPerWorld + comparePanY,
    }),
    pxPerWorld,
  };

  const palette = {
    ink: cssVar('--color-ink'),
    construction: cssVar('--color-ink-secondary'),
  };

  // Truncation feed: the seated-frame plane computed in rebuild()'s seam. Falls back to
  // the full pattern when the cut is off or the plane misses the solid. The sheet scale
  // above stays locked to the UNCUT analytic bbox (ADR-053) — a cut never rescales it.
  const cutData = activeCutLocalPlane
    ? computeCutDistances(currentShapeData, activeCutLocalPlane)
    : null;
  drawDevelopment(ctx, view, layout, palette, cutData);

  // Shortest-path reveal (ADR-070): drawn ON TOP of the pattern, only while the
  // problem library holds a matched string problem (commitStringPath gates the spec).
  if (stringPathSpec) {
    const path = computeStringPath(layout, stringPathSpec);
    drawStringPath(ctx, view, layout, { path: cssVar('--color-dev-path') }, path);
  }
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
    compare.hide();     // no-op when closed; also tears the workbench split down first
    resetCompareView(); // hide() doesn't touch pan/zoom — reset returns the sheet to 1×/centred
    cancelTweens();
    resetCamera();
    sectionState = defaultSectionState(); // cutting plane off + defaults (topic-local state)
    stringPathSpec = null; // reveal state is problem-scoped — never survives a reset
    rebuild(defaultSolidData()); // canonical default solid — runs the disposal contract
    stepper?.reset();            // wizard back to Step 1
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
  /** ShapeType enum for the dock (uiManager depends only on this controller). */
  ShapeType,

  /** Current on-screen state (null on the empty start). */
  state: () => currentShapeData,

  /** Whether anything is currently on screen (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

  /** Merge params into state and rebuild — the single write path for your controls. */
  commit(partial) { rebuild({ ...(currentShapeData ?? {}), ...partial }); },

  /** Copy of the topic-local cutting-plane state (never the live reference). */
  sectionState: () => ({ ...sectionState }),

  /** Merge params into the cutting-plane state and rebuild — the single write path for
   *  the section controls. State lives OUTSIDE ShapeData (ADR-067). */
  commitSection(partial) {
    Object.assign(sectionState, partial);
    rebuild(currentShapeData);
  },

  /** Whether the current build actually cut the solid — the problem library's
   *  cuts-the-solid guard (a dialled plane can match on paper yet miss the solid). */
  hasCut: () => activeCutLocalPlane !== null,

  /**
   * Set or clear the shortest-path reveal — a NON-rebuild overlay commit
   * (ADR-070): stores the spec, (re)builds the 3D string onto shapeGroup, and
   * repaints the open sheet. No rebuild() call, so the problem library can safely
   * re-assert it from inside its onStateChange evaluation (no re-entrancy).
   * Idempotent; a null→null call is a no-op.
   */
  commitStringPath(spec) {
    if (spec === null && stringPathSpec === null) return;
    stringPathSpec = spec ? { ...spec } : null;
    rebuildStringPath3D();
    if (compareOpen) drawCompare();
  },

  /** Route through the single reset path (re-syncs the wizard + announces). */
  reset() { window.simAPI.reset(); },

  /** Whether a textbook problem is loaded — drives the terminal-step CTA label (stepper.js). */
  isProblemActive() { return problemLibrary?.isActive() ?? false; },

  /**
   * Terminal-step "Complete & next problem": close out the finished development and
   * send the learner back to the library for the next one. Celebrate (calm toast),
   * clear the active-problem framing, reset through the single path, then open the
   * library — so picking the next problem starts from the clean Step-1 default.
   */
  completeAndNext() {
    const hadProblem = problemLibrary?.isActive() ?? false;
    const message = hadProblem
      ? 'Development complete — well done. Choose your next problem to continue.'
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
    setupCompareCard();                    // Compare chrome + workbench split (ADR-037 port)
    stepper = initStepper(simController);
    const dock = initUIManager(simController); // parameter dock (ADR-048 rule: wire it or delete it)
    simController.onStateChange(() => dock.sync()); // reset/commit re-syncs the dock's controls
    initTerms();                           // wire inline term-definition popovers (static markup)
    onboarding = initOnboarding(controls); // first-run hints (empty-state overlay was removed)
    problemLibrary = initProblemLibrary(simController); // textbook problems + self-check + string reveal

    // Every rebuild() repaints the open development sheet — the sheet is a live view of
    // the current solid, never a snapshot (rides the scaffold's onStateChange seam).
    simController.onStateChange(() => { if (compareOpen) drawCompare(); });

    new ResizeObserver(() => {
      handleResize(container);
      if (compareOpen) drawCompare(); // the split resizes the stage with the viewport
    }).observe(container);

    // Boot with the topic default solid (route through rebuild(), the single geometry path).
    rebuild(defaultSolidData());
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
