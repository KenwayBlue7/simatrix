// Orchestrator (Module 1 Topic 1.1 — Dimensioning).
//
// The standalone orchestrator pattern of Topic 1 (Foundations) and Module 2 (ADR-007,
// ADR-029): a thin `main.js` that owns the Three.js environment, the ONE rebuild() pipeline
// and the disposal contract, with pure leaf modules hanging off it in a star. The leaves —
// dimensionRig, dimensionDraw, dimensionLabels, dimensionUI and the pure-data catalogues —
// never import one another (RULES.md §3.6, ADR-133).
//
// WHAT IS DIFFERENT FROM TOPIC 1, AND WHY (ADR-133):
//   • ONE ORTHOGRAPHIC CAMERA, no perspective camera and therefore no projection morph.
//     This topic IS a drawing: a dimension only measures truly under parallel projection, so
//     the sim never renders the part in perspective. RULES.md §5.18's dual-camera morph
//     governs moving BETWEEN a perspective view and an ortho quick-view; with no perspective
//     camera in the scene there is no such hand-off to make. Orbit is still live — the same
//     parallel camera simply swings around the part, which is a pictorial parallel view.
//   • NO OCCLUSION RAYCASTER and no three-mesh-bvh. Topic 1's lesson was visible-vs-hidden
//     edges, which is camera-dependent. Here the linework is authored from the very outline
//     the solid is extruded from, and the single genuinely hidden outline in the front
//     elevation (the far-side countersink) is authored dashed. Nothing is camera-dependent,
//     so nothing is re-classified on orbit.
//
// The dimension apparatus is rebuilt declaratively: every step hands main.js a list of SPECS
// and a reveal progress, and `redraw()` is the single funnel that turns them into linework
// plus CSS2D values. Geometry (the plate) still changes only inside `rebuild()`.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

import { buildEdgeMap } from './meshAnalyzer.js';
import { createLineDrawer } from './lineDrawer.js';
import { createRig } from './dimensionRig.js';
import { createDimensionLayer, SPACING, fitDecision } from './dimensionDraw.js';
import { needsCentreLines } from './dimensionLayout.js';
import { createLabelLayer } from './dimensionLabels.js';
import { initUI } from './dimensionUI.js';
import { initTerms } from './terms.js';
import { TERMS, SHEET_SETTINGS, METHODS } from './dimensionSteps.js';
import { MM_PER_UNIT, FIGURES, DEFAULT_FIGURE, toWorld, HALF_DEPTH } from './dimensionData.js';
import {
  anatomyDrawing, ELEMENTS, ELEMENT_PARTS, methodDrawing, obliqueClock,
  leaderDemo, spaceDemo, ARRANGEMENTS, completeDrawing,
} from './dimensionExamples.js';
import { RULES, dragDemo, validatePlacement } from './dimensionRules.js';
import { SYMBOLS } from './dimensionSymbols.js';
import { REVIEW_FIGURES, reviewFigure } from './reviewFigures.js';
import { figureSvg } from './reviewFigureSvg.js';
import { TIMING, VIEWS, staggered, uniform } from './dimensionAnimations.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeStandard, easeCamera, easeDraw } from './anim.js';

const DEG2RAD = Math.PI / 180;

// ============================================================================
// BVH raycast acceleration (three-mesh-bvh) — global, one-time prototype patch.
//
// Installed exactly as the sibling Foundations topic installs it. The hidden-line test in
// lineDrawer.js fires hundreds of short line-of-sight rays at the plate on every moved frame
// of an orbit; the native raycaster brute-forces every triangle per ray. three-mesh-bvh walks
// a precomputed hierarchy instead, turning per-ray cost from linear to ~logarithmic in the
// triangle count — the difference between a live classification and a slideshow.
//
// acceleratedRaycast falls back to the stock raycast for any mesh without a boundsTree, so the
// global patch never breaks anything else in the scene; only the plate (equipped with a tree in
// rebuild()) takes the fast path, and LineSegments2 keeps its own raycast override.
// ============================================================================
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

/**
 * HOW THE SHEET IS FRAMED. Each figure carries its own `frame` — a centre and a symmetric
 * REACH out from it, both in that figure's own millimetres — and this file turns it into the
 * ortho frustum. It is the shape of the sibling Foundations topic's `frontViewPose`, which
 * fits its elevation as reaches from the bore axis rather than as a box around everything drawn.
 *
 * WHY NOT A BOUNDING BOX. Centring the combined bounding box is what produced the old
 * off-centre picture: the dimension lanes fall much further BELOW the part than they rise above
 * it (five stacked lanes under the drawing against one over it), so the box's centre sits well
 * under the plate and the plate rides high in the viewport. The lanes are hairlines; the part is
 * the visual mass, and the visual mass is what has to look centred. So every figure's centre is
 * its PART's middle, nudged only where the ink is genuinely one-sided.
 *
 * The reaches are the furthest ink any step puts on that figure — Step 4's parallel arrangement
 * reaches lowest, the leader notes reach furthest right — plus a margin for the value text that
 * rides above each line. Measured, not guessed; re-measure before changing one.
 */
/**
 * The figure now on the sheet. The lesson runs through five of them, simplest first, and every
 * step asks for the simplest one that can carry what it teaches (see `FIGURES` in
 * dimensionData.js). `setFigure()` is the ONLY way this changes, because a new figure is new
 * geometry and geometry changes only inside `rebuild()` (RULES.md §3.1).
 */
let currentFigure = DEFAULT_FIGURE;

/** One figure's sheet in centred world units, as a centre + half-extents. */
function frameOf(figure) {
  const c = toWorld(figure.frame.centre.x, figure.frame.centre.y);
  return {
    cx: c.x, cy: c.y,
    halfW: figure.frame.reach.x / MM_PER_UNIT,
    halfH: figure.frame.reach.y / MM_PER_UNIT,
  };
}

/** Gap between the two sheets in the before/after compare (world units). */
const COMPARE_GAP = 3;

/** The live frame, and how far each sheet slides off centre in compare mode. Both are
 *  re-derived by `setFigure()` and by nothing else. */
let FRAME = frameOf(currentFigure);
let COMPARE_DX = FRAME.halfW + COMPARE_GAP / 2;

/** Camera standoff. Irrelevant to framing under parallel projection — it only has to clear
 *  the near plane and keep the whole part inside the depth range. */
const CAM_DISTANCE = 60;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;        // OrthographicCamera — the only camera in this topic
let controls;
let labelRenderer;
let viewport;

/** The two sheets. B exists only for the before/after compare and is hidden otherwise. */
let contentA;
let contentB;

let rigA = null;
let rigB = null;
/**
 * The LIVE edge classifier for sheet A — the 3-D inspection's linework. Sheet B never gets
 * one: it exists only to hold a second FRONT ELEVATION beside the first in a compare, and a
 * compare is a drawing-to-drawing comparison, so its linework is always the authored set.
 */
let lineDrawer = null;
/** Force one classification pass next frame even if the camera held still — after a rebuild,
 *  a reset, or a switch into the 3-D view. */
let forceReclassify = false;
/** "Reveal hidden lines": the solid's faces come off so the whole wireframe shows through. */
let revealHidden = false;
let layerA = null;   // dimension apparatus for sheet A
let layerB = null;   // …and for sheet B
let labelsA = null;  // CSS2D values for sheet A (parented to contentA, so it inherits its transform)
let labelsB = null;
let ui = null;

/** The live drawing on sheet A. */
const drawing = {
  /** @type {object[]} */ specs: [],
  /** @type {Record<string, number>|null} */ progress: null,
  method: 1,
  termination: 'open',
  terminationAngleDeg: 15,
  angularStyle: 'a',
  /** @type {string|null} */ focusElement: null,
  /** @type {string|null} */ lineTypeFocus: null,
  /** Scales every VALUE on the sheet without touching the drawing (§4.5 item 4). */
  unitFactor: 1,
};

/**
 * The method sheet B is drawn in while a comparison is up. Null means "whatever sheet A is
 * using".
 *
 * TWO STEPS SET THIS, for two different questions.
 *   • Step 3 holds ONE drawing in BOTH value systems — the layout is fixed, the method is the
 *     variable, and `setMethodCompare()` always puts the system the learner did NOT pick on the
 *     left. That is a demonstration: the learner does not choose sheet B, the step does.
 *   • Step 4 holds any layout+method pair beside any other. Both axes are the learner's to set,
 *     and the interesting comparison is usually one axis held still while the other moves —
 *     same layout, two methods, or the reverse.
 * They are mutually exclusive, and `compareKind` is what says which is live: inferring it from
 * `compareMethod !== null` cannot distinguish "Step 4, both sheets in Method 1" from "no
 * comparison at all", and a Step-4 method change would then repaint the wrong sheet.
 */
let compareMethod = null;

/** @type {'method'|'layout'|null} Which comparison is on screen; null when none. */
let compareKind = null;

/** Step 4 only: which LAYOUT sheet B is showing, so a method change can rename it. */
let compareLayoutId = null;

/**
 * The rig's LESSON-level state, held here rather than only inside the rig, because a rebuild
 * hands back a brand-new solid and brand-new batches that remember none of it. Every step
 * writes through `setRig()`, and `rebuild()` replays the whole record — the same contract
 * Foundations' `applyLayers()` + `setXray()` have at the end of its rebuild.
 */
const rigState = { dimmed: false, lineFocus: null, centreLines: false };
/** Whether the centre lines are actually on screen — the step's wish OR'd with what the specs
 *  demand. Remembered so `redraw()` can re-apply the rig only when the answer changes. */
let centreLinesShown = false;

/** Write one or more rig wants and push them at the live rigs. */
function setRig(patch) {
  Object.assign(rigState, patch);
  applyRigState();
}

/** Replay the whole record onto both sheets. Idempotent, so it is safe after any rebuild.
 *
 *  CENTRE LINES ARE NOT PURELY A STEP'S CHOICE. A diameter written on a leader is ambiguous on
 *  its own — an arrow head on a circle does not say whether the number spans the full width or
 *  half of it. The feature's centre cross is what says "right across", so any drawing that
 *  states a ø or Sø on a leader turns them on whatever the step asked for
 *  (dimensionLayout.js `needsCentreLines`). A step may switch them ON; it cannot switch them
 *  off under a diameter. */
function applyRigState() {
  const mode = poseName === 'rear' ? 'rear' : poseName === 'front' ? 'front' : 'free';
  centreLinesShown = rigState.centreLines
    || needsCentreLines(drawing.specs) || needsCentreLines(compareSpecs);
  const shown = { ...rigState, centreLines: centreLinesShown };
  rigA?.applyState({ ...shown, viewMode: mode, authored: mode === 'front' });
  // Sheet B is only ever a second elevation beside the first, so it keeps its authored set.
  rigB?.applyState({ ...shown, viewMode: mode, authored: true });
}

/** Step 1 has three studies on one drawing surface; this is which one is live. */
const step1 = {
  study: 'anatomy',
  leaderHead: 'arrow',
  spanMm: 60,
  /** @type {object|null} */ decision: null,
};

/** Step 3's Fig. 4.10 study, held apart from the plate's own dimensions. */
let obliqueOn = false;

/** The drawing on sheet B (the "before" of a compare), or null. */
let compareSpecs = null;

/** Which Step-4 arrangement sheet A is currently showing. */
let currentArrangementId = ARRANGEMENTS[0].id;

/** Latches once Step 1's dimensions have been added, so coming BACK to Step 1 does not
 *  wipe the drawing the learner already built. */
let dimensionsRevealed = false;

/** The in-flight reveal tween, so a new one never fights an old one. */
let revealTween = null;

/** Step-2 drag state: how far the learner has pulled the value off its legal position (mm). */
let dragNudge = [0, 0];

let rafId = null;
let running = false;
let lastFrameTime = 0;

/** In-flight camera pose tween handle. */
let cameraTween = null;
/** Current camera pose (degrees). The sim OPENS ON THE ISOMETRIC — `VIEWS.pictorial` is
 *  `camera.position.set(1, 1, 1)` normalised, scaled by `CAM_DISTANCE` and aimed at the part's
 *  centre by `applyPose()`. Still the one orthographic camera; orbit, zoom and pan unchanged. */
let pose = { az: VIEWS.pictorial.azimuthDeg, el: VIEWS.pictorial.elevationDeg };
let poseName = 'pictorial';

const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Small helpers
// ============================================================================

function viewportSize() {
  return { width: viewport?.clientWidth || 1, height: viewport?.clientHeight || 1 };
}

/** Narrate a state change to assistive tech (PRODUCT.md a11y commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

const TOAST_HOLD = 3800;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/** Calm success toast — the lesson's one win confirmation, never gamified fanfare. */
function showToast(message) {
  toastEl ??= document.getElementById('sim-toast');
  if (!toastEl) return;
  const text = toastEl.querySelector('.sim-toast__text');
  if (text) text.textContent = message;
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, 240);
  }, TOAST_HOLD);
}

function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
}

/** Signal a successful boot to the index.html watchdog. */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) {
    clearTimeout(window.__simBootTimer);
    window.__simBootTimer = null;
  }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  const aspect = (w || 1) / (h || 1);

  // ORTHOGRAPHIC ONLY. A dimension states a true length; under perspective the drawing
  // would be foreshortened and every value on screen would be a lie about its own line.
  const f = frustum(aspect, false);
  camera = new THREE.OrthographicCamera(-f.halfW, f.halfW, f.halfH, -f.halfH, 0.1, 400);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  appliedPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(appliedPixelRatio);
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows (RULES.md §3.24)
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    // A restored context comes back with no buffers and, in effect, a fresh renderer state.
    // Re-size before rebuilding so the new batches are handed the right resolution, then put
    // the camera back where it was and force one classification pass.
    appliedPixelRatio = 0;      // make the next handleResize re-apply the ratio unconditionally
    handleResize(viewport);
    rebuild();
    applyPose(true);
    redraw();
    forceReclassify = true;
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Flat CAD light: ambient fill + one low directional, no shadows (RULES.md §3.24).
  // Three.js has used PHYSICAL light units since r155 (the old `useLegacyLights` scaling is
  // gone), so the familiar 0.9/0.45 pair now lands about π× too dark — which on a drawing
  // turns the paper-toned face fill into a muddy grey and kills the ink-on-paper contrast
  // the linework depends on. These are the same ratios, scaled into the current units.
  scene.add(new THREE.AmbientLight(0xffffff, 2.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.position.set(4, 7, 9);
  key.castShadow = false;
  scene.add(key);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  // A free orbit is a genuine check ("is this drawing really describing that solid?"), so it
  // stays enabled — but the moment the learner turns the part, the latched "Front view" chip
  // un-latches, because what is on screen is no longer the elevation the drawing states.
  //
  // The in-flight glide is dropped in the same breath. Without that, a drag DURING a
  // "Front view" transition fights it: `applyPose()` rewrites the camera from the tween every
  // frame, so the part snaps back under the pointer for the rest of the glide. The learner's
  // hand wins.
  controls.addEventListener('start', () => {
    cameraTween?.cancel();
    cameraTween = null;
    if (poseName !== 'free') setPoseName('free');
  });

  contentA = new THREE.Group();
  contentA.name = 'Sheet A';
  contentB = new THREE.Group();
  contentB.name = 'Sheet B (before)';
  contentB.visible = false;
  scene.add(contentA);
  scene.add(contentB);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none'; // individual labels opt back in
  container.appendChild(overlay);

  applyPose(true);
}

/** Symmetric orthographic frustum that frames the whole SHEET (part + dimension lanes). */
/**
 * Margin around the fitted sheet. A comparison gets more, because the reach constants measure
 * WORLD-space ink and the notes are CSS2D pills: "ø24 × 90° CSK" is a fixed-width DOM node that
 * spills further past its anchor the smaller the drawing is scaled, and two sheets side by side
 * are scaled small. Four per cent was enough for one sheet and clipped the left one of a pair.
 */
const FRAME_PAD = 1.04;
const FRAME_PAD_COMPARE = 1.12;

function frustum(aspect, compare) {
  const needW = compare ? FRAME.halfW + COMPARE_DX : FRAME.halfW;
  const halfH = Math.max(FRAME.halfH, needW / aspect) * (compare ? FRAME_PAD_COMPARE : FRAME_PAD);
  return { halfW: halfH * aspect, halfH };
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (RULES.md §3.1)
// ============================================================================

/** Full disposal contract: free every per-build WebGL resource + CSS2D DOM node, then
 *  empty both sheets (RULES.md §3.3, §3.5). */
function disposeContent() {
  for (const l of [labelsA, labelsB]) l?.dispose();
  labelsA = labelsB = null;
  for (const l of [layerA, layerB]) l?.dispose();
  layerA = layerB = null;
  if (lineDrawer) { lineDrawer.dispose(); lineDrawer = null; }
  // Free the BVH BEFORE the geometry: computeBoundsTree() parks large CPU-side typed arrays
  // on geometry.boundsTree, and dropping the geometry alone would orphan them until GC.
  rigA?.mesh?.geometry?.disposeBoundsTree?.();
  for (const r of [rigA, rigB]) r?.dispose();
  rigA = rigB = null;
  // Deep traversal, not a shallow child loop — the rig is a nested Group (RULES.md §3.3).
  for (const group of [contentA, contentB]) {
    for (const child of [...group.children]) {
      child.traverse((obj) => {
        obj.geometry?.dispose?.();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) { m?.map?.dispose?.(); m?.dispose?.(); }
      });
      group.remove(child);
    }
  }
}

function rebuild() {
  disposeContent();
  const { width, height } = viewportSize();

  // The sheet must be square-on and centred while the edge map is welded: the map stores
  // WORLD-space endpoints, and the raycaster casts in world space, so a rotated or offset
  // sheet would poison both. `applyViewMode` keeps it that way for as long as the classifier
  // is the one drawing.
  contentA.position.x = 0;
  contentA.updateMatrixWorld(true);

  rigA = createRig({ figure: currentFigure, width, height });
  contentA.add(rigA.group);

  // --- The live classifier: edge topology once, BVH once, both camera-invariant. ---
  rigA.mesh.updateWorldMatrix(true, false);
  const edgeMap = buildEdgeMap(rigA.mesh.geometry, rigA.mesh.matrixWorld);
  // Built AFTER the weld so the analyzer reads the original non-indexed geometry;
  // computeBoundsTree then adds a sequential index, which renders identically.
  rigA.mesh.geometry.computeBoundsTree();
  lineDrawer = createLineDrawer(edgeMap, rigA.mesh, { width, height });
  contentA.add(lineDrawer.group);

  layerA = createDimensionLayer({ width, height });
  contentA.add(layerA.group);
  labelsA = createLabelLayer(contentA, { width, height, onDrag: onValueDrag });

  // Sheet B carries the "before" drawing of a Step-4 / Step-6 comparison. It is built with
  // the sheet so a compare never has to touch geometry outside rebuild().
  rigB = createRig({ figure: currentFigure, width, height });
  contentB.add(rigB.group);
  layerB = createDimensionLayer({ width, height });
  contentB.add(layerB.group);
  labelsB = createLabelLayer(contentB, { width, height });

  setCompareOffsets(false);
  applyViewMode(); // fresh rigs start in whatever pose the camera is already in
}

/**
 * Put a different FIGURE on the sheet.
 *
 * The lesson's teaching order is a geometry order: a plain plate for the elements, a plate with
 * one hole for the placement rules, a chamfered plate for the two value systems, a slotted plate
 * for the layouts, the Guide Plate for the symbols and the review. Swapping between them is a
 * geometry change and therefore goes through `rebuild()` — the one path — and re-derives the
 * frame, because a 130 mm plate framed like a 200 mm one would sit adrift in the viewport.
 *
 * No-op when the figure is already up, so a step that re-enters costs nothing.
 *
 * @param {string} id A key of `FIGURES`.
 * @returns {boolean} Whether the sheet actually changed.
 */
function setFigure(id) {
  const next = FIGURES[id] || DEFAULT_FIGURE;
  if (next === currentFigure) return false;
  currentFigure = next;
  FRAME = frameOf(next);
  COMPARE_DX = FRAME.halfW + COMPARE_GAP / 2;
  rebuild();                // the single geometry path
  handleResize(viewport);   // the frustum is a function of the frame, which just moved
  applyPose(true);          // …and so is the camera target
  updateCaption();
  updateFigureBadge();
  return true;
}

/** Name the live figure on the drawing, and say in four words what it is here to teach. The
 *  progression is the lesson's spine, so the learner is told where on it they are. */
function updateFigureBadge() {
  const name = document.getElementById('vp-figure-name');
  const teaches = document.getElementById('vp-figure-teaches');
  if (name) name.textContent = currentFigure.name;
  if (teaches) teaches.textContent = currentFigure.teaches;
}

// ============================================================================
// redraw() — the single funnel from SPECS to linework + values
// ============================================================================

/**
 * Expand the live spec list for the current view state. Step 1's element inspector splits
 * each dimension into its named parts so one element can be isolated while the rest of the
 * drawing fades back — the same renderer, driven by `only`.
 */
function resolveSpecs() {
  const base = drawing.specs;
  // The line-type legend holds ONE weight of line and fades the rest. Everything the
  // dimension layer draws is Type B apparatus (plus the thick arrow heads), so focusing a
  // line type of the PART is expressed by muting the whole apparatus, and focusing the
  // apparatus by dimming the part — the rig does its own half.
  if (drawing.lineTypeFocus && drawing.lineTypeFocus !== 'apparatus') {
    return base.map((s) => ({ ...s, tone: 'muted' }));
  }
  if (!drawing.focusElement) return base;

  const entry = ELEMENTS.find((e) => e.id === drawing.focusElement);
  const wanted = new Set((entry?.parts || []).map((p) => `${p.specId}::${p.only}`));
  const out = [];
  for (const spec of base) {
    for (const part of ELEMENT_PARTS) {
      const id = `${spec.id}::${part}`;
      out.push({ ...spec, id, only: part, tone: wanted.has(id) ? 'ink' : 'muted' });
    }
  }
  return out;
}

/** Map the live progress table onto the (possibly expanded) spec list. */
function resolveProgress(specs) {
  if (!drawing.progress) return null;
  const out = {};
  for (const spec of specs) {
    const baseId = spec.id.includes('::') ? spec.id.slice(0, spec.id.indexOf('::')) : spec.id;
    out[spec.id] = drawing.progress[baseId] ?? 1;
  }
  return out;
}

/**
 * Re-express every VALUE in the sheet's chosen unit. §4.5 item 4: millimetre is the BIS unit
 * and a bare value IS millimetres; any other unit must be indicated — and the chapter's own
 * recommendation is to indicate it ONCE, near the title block, rather than after every
 * number. So the values change and no suffix appears; the caption band carries the note.
 * Angles are never converted: a 45° chamfer is 45° in any unit of length.
 */
function inUnits(text) {
  if (drawing.unitFactor === 1 || typeof text !== 'string') return text;
  return text.replace(/(\d+(?:\.\d+)?)(?!\s*°)/g, (m) => {
    const v = Number(m) * drawing.unitFactor;
    return String(Number(v.toFixed(2)));
  });
}

/** Render sheet A (and sheet B when a compare is live). The ONE path from specs to pixels. */
function redraw() {
  if (!layerA || !labelsA) return;
  const opts = {
    method: drawing.method,
    termination: drawing.termination,
    terminationAngleDeg: drawing.terminationAngleDeg,
    angularStyle: drawing.angularStyle,
  };
  const specs = resolveSpecs();
  // A step may set its specs AFTER it set the rig, so the centre-line demand is re-checked from
  // the live list here. Only re-applied when the answer actually changes — this runs per frame.
  if ((rigState.centreLines || needsCentreLines(specs) || needsCentreLines(compareSpecs))
    !== centreLinesShown) applyRigState();
  const labels = layerA.draw(specs, { ...opts, progress: resolveProgress(specs) });
  for (const l of labels) l.text = inUnits(l.text);
  labelsA.setLabels(labels);
  labelsA.setFocus(drawing.focusElement
    ? new Set(labels.filter((l) => l.tone !== 'muted').map((l) => l.id))
    : null);

  if (compareSpecs && layerB && labelsB) {
    const b = layerB.draw(compareSpecs, { ...opts, method: compareMethod ?? opts.method });
    for (const l of b) l.text = inUnits(l.text);
    labelsB.setLabels(b);
  }
}

/** Where the callout pill sits: the empty band above the live figure, clear of the topmost
 *  dimension lane (§4.3's 5–6 mm clearance puts nothing up here). */
function calloutAt() {
  const w = toWorld(currentFigure.plate.length / 2, currentFigure.plate.height + 26);
  return new THREE.Vector3(w.x, w.y, HALF_DEPTH + 0.8);
}

/** Name, ON the drawing, whatever the step is currently pointing at. Null takes it off.
 *  Kept OUT of redraw(): the callout tracks the learner's selection, not the spec list, and
 *  rebuilding a DOM node every animation frame would make it flicker. */
function setCallout(text) {
  labelsA?.setCallout(text ? { text, position: calloutAt() } : null);
}

/** Slide the two sheets apart for a before/after compare — the BEFORE drawing on the left
 *  (sheet B) and the AFTER on the right (sheet A) — or bring sheet A back to centre. */
/**
 * Where each sheet's caption sits: centred on the drawing and clear below its lowest lane, in
 * the sheet's OWN space, so it travels with the sheet instead of floating at the top of the
 * viewport with nothing to attach it to.
 */
function captionAt() {
  // Centred on the DRAWING's own centre of ink (the figure's frame centre), not on the part's
  // midpoint — a frame nudged right to balance leader notes would otherwise hang the caption
  // left of the drawing it names, breaking the pair's symmetry in a comparison. The 10 mm lifts
  // it just inside the bottom of the frame, under the lowest lane whatever that figure's is.
  const { centre, reach } = currentFigure.frame;
  const w = toWorld(centre.x, centre.y - reach.y + 10);
  return new THREE.Vector3(w.x, w.y, HALF_DEPTH + 0.8);
}

function setCompareOffsets(on) {
  const changed = contentB.visible !== on;
  // Each sheet's INK sits `FRAME.cx` right of its own origin (the frame is nudged right to
  // balance the leader notes — see SHEET_CENTRE_MM). Offsetting the GROUPS by ±COMPARE_DX
  // therefore lands the two drawings symmetrically about the camera; adding cx here as well
  // would push both the same way and leave the pair 26 mm off centre.
  contentA.position.x = on ? COMPARE_DX : 0;
  contentB.position.x = -COMPARE_DX;
  contentB.visible = on;
  // Two sheets side by side are drawn at about half scale, so their annotation is scaled with
  // them — a CSS2D pill is a fixed number of PIXELS wide however small the drawing gets, and
  // the longest note otherwise runs off the left edge of the narrower viewports. Both sheets
  // are scaled identically, so the comparison is still like for like.
  viewport?.classList.toggle('is-compare', on);
  // CSS2DRenderer positions a label from its OWN `visible` flag and never consults its
  // ancestors, so hiding sheet B's group would leave its value pills painted over sheet A.
  // Emptying the layer is what actually takes them off the sheet.
  if (!on) {
    labelsB?.setLabels([]);
    labelsB?.setSheetCaption(null);
    labelsA?.setSheetCaption(null);
  }
  // Only when the compare actually opens or closes: the frustum widens to hold two sheets, and
  // a resize reallocates every fat-line resolution. Swapping which layout sheet B shows must
  // not pay that — it is a spec change, nothing more.
  if (changed) handleResize(viewport);
}

/**
 * Name the two drawings, each under its own sheet. Null on either side takes that name off.
 * A name is either a plain string or `{ text, sub }` — the second form for a sheet that is
 * told apart by two things at once (Step 4's method AND layout), which stacks in the pill.
 * @param {string|{text:string,sub?:string}|null} nameB
 * @param {string|{text:string,sub?:string}|null} nameA
 */
function setSheetNames(nameB, nameA) {
  const at = captionAt();
  const desc = (n) => {
    if (!n) return null;
    return typeof n === 'string' ? { text: n, position: at } : { ...n, position: at };
  };
  labelsA?.setSheetCaption(desc(nameA));
  labelsB?.setSheetCaption(desc(nameB));
}

/**
 * Step 4's sheet captions: the METHOD on top, the layout under it. Both sheets are named from
 * one function so the pair can never be labelled by two different rules, and so a change to
 * either axis on either sheet repaints both — which is what makes "only the method changed"
 * legible at a glance.
 */
function setLayoutSheetNames() {
  const nameOf = (layoutId, method) => {
    const a = ARRANGEMENTS.find((x) => x.id === layoutId);
    return a ? { text: `Method ${method}`, sub: a.name } : null;
  };
  setSheetNames(
    nameOf(compareLayoutId, compareMethod ?? drawing.method),
    nameOf(currentArrangementId, drawing.method),
  );
}

/**
 * Animate a spec set on. `ids` are revealed in list order; a `stagger` of 0 cross-fades the
 * whole set together (a rule flip or an arrangement swap, where the comparison is the point).
 */
function animateIn(ids, duration, { stagger = true } = {}) {
  revealTween?.cancel();
  drawing.progress = stagger ? staggered(ids, 0) : uniform(ids, 0);
  redraw();
  revealTween = tween({
    from: 0, to: 1, duration, ease: easeDraw,
    onUpdate: (t) => {
      drawing.progress = stagger ? staggered(ids, t) : uniform(ids, t);
      redraw();
    },
    onComplete: () => { revealTween = null; drawing.progress = null; redraw(); },
  });
}

// ============================================================================
// Camera poses
// ============================================================================

/** The camera always looks at the middle of the sheet. In a compare the two sheets sit
 *  symmetrically either side of that same point, so the target never moves. */
function poseTarget() {
  return new THREE.Vector3(FRAME.cx, FRAME.cy, 0);
}

/**
 * Read the pose BACK off the live camera. A manual orbit moves the camera without touching
 * `pose`, so a glide that started from the stored value would jump to a stale azimuth on its
 * first frame and only then ease. Every transition starts from where the part actually is.
 */
function poseFromCamera() {
  const v = camera.position.clone().sub(controls.target);
  const r = v.length() || 1;
  return {
    az: Math.atan2(v.x, v.z) / DEG2RAD,
    el: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG2RAD,
  };
}

/** Place the camera from the current azimuth/elevation. */
function applyPose(immediate = false) {
  const target = poseTarget();
  const az = pose.az * DEG2RAD;
  const el = pose.el * DEG2RAD;
  const dir = new THREE.Vector3(
    Math.sin(az) * Math.cos(el),
    Math.sin(el),
    Math.cos(az) * Math.cos(el),
  );
  camera.position.copy(target).add(dir.multiplyScalar(CAM_DISTANCE));
  camera.up.set(0, 1, 0);
  controls.target.copy(target);
  controls.update();
  if (immediate) camera.updateProjectionMatrix();
}

/**
 * Hand the linework between the two systems, on the named pose.
 *
 * FRONT ELEVATION — the authored drawing, exactly as it has always been. A drawing is a
 * fixed, agreed projection: which of its lines are dashed is a draughting decision that the
 * whole lesson is built on, and it must not shift under the learner.
 *
 * ANY OTHER DIRECTION — the live classifier. Once the part is turned, the question stops
 * being "what does the drawing say?" and becomes "what can I actually see from here?", and
 * that has a different answer every frame. `lineDrawer.reclassify()` re-tests every edge
 * against the camera, so silhouettes appear and vanish, and an edge that passes behind the
 * boss goes dashed for exactly the stretch that is buried.
 *
 * Turning over is an inspection too, so it is dynamic as well — and because it is an exact
 * axial view, what the classifier draws there should agree with the authored elevation. That
 * agreement is the best self-check the topic has.
 *
 * This is the ONE place a viewport mode is entered, so it is also where the whole graphics
 * state is re-stated: which linework is on, which pose the authored batches are posed for,
 * whether the study dim applies, and whether "reveal hidden lines" is even available. Nothing
 * carries over from the mode before it.
 */
function applyViewMode() {
  const authored = poseName === 'front';

  // The rig's pose + the lesson's study wants, in one replay (applyRigState suppresses the
  // study dim whenever the classifier is the one drawing).
  applyRigState();

  if (lineDrawer) {
    lineDrawer.group.visible = !authored;
    if (!authored) forceReclassify = true;
  }

  if (!authored && compareSpecs) {
    // The classifier works in world space off a weld taken with the sheet square-on, so the
    // two-sheet compare — which slides both sheets off centre — cannot survive a dynamic view.
    // It comes down, and the wizard is told, so its control does not stay latched over a
    // viewport showing one sheet.
    compareSpecs = null;
    compareMethod = null;
    compareKind = null;
    compareLayoutId = null;
    setCompareOffsets(false);
    ui?.compareDropped?.();
  }

  setRevealHidden(revealHidden); // re-apply, and enable/disable the chip for this mode
}

/**
 * "Reveal hidden lines" — the inspection mode. The solid's MATERIAL is switched off while the
 * mesh stays in the scene, so the raycaster (which reads geometry, never material) keeps
 * classifying and the buried edges come out dashed rather than solid. The result is a true
 * engineering wireframe — solid where you can see it, dashed where the metal is in the way —
 * instead of a flat tangle of lines. Same mechanism as the sibling Foundations topic's X-ray.
 *
 * @param {boolean} on
 */
function setRevealHidden(on) {
  const dynamic = poseName !== 'front';
  revealHidden = on && dynamic;
  rigA?.setSolidVisible(!revealHidden);
  lineDrawer?.setHiddenVisible(revealHidden);

  const btn = document.getElementById('btn-hidden');
  if (btn) {
    // In the elevation there is nothing to reveal: the drawing already states its hidden
    // detail dashed, and that is the lesson. The chip says so rather than doing nothing.
    btn.disabled = !dynamic;
    btn.setAttribute('aria-pressed', String(revealHidden));
    btn.textContent = revealHidden ? 'Show the solid' : 'Reveal hidden lines';
    btn.title = dynamic
      ? 'Take the faces off and see every edge — dashed where the metal is in the way'
      : 'Turn the plate first — the flat drawing already shows its hidden detail dashed';
  }
  if (dynamic) forceReclassify = true;
}

function setPoseName(name) {
  poseName = name;
  // Leaving a named elevation takes effect at once — the moment the part starts turning, its
  // silhouette stops being an edge. ARRIVING at one waits for the tween to land, so the
  // drawing does not change while the plate is still swinging.
  if (name === 'free') applyViewMode();
  for (const [id, key] of [['btn-front', 'front'], ['btn-pictorial', 'pictorial'], ['btn-rear', 'rear']]) {
    document.getElementById(id)?.setAttribute('aria-pressed', String(name === key));
  }
  const hint = document.getElementById('vp-hint');
  if (hint) {
    hint.textContent = name === 'front'
      ? 'This is the drawing — a true orthographic front view. Drag to orbit.'
      : 'Drag to orbit · scroll to zoom · “Front view” returns to the drawing';
  }
}

/**
 * Glide to a named view. Reduced motion snaps (anim.js jumps the tween to its end).
 * @param {'front'|'pictorial'|'rear'} name
 * @param {Object} [options]
 * @param {boolean} [options.announce=true] Silent for housekeeping moves the learner did not ask for.
 */
function setView(name, { announce: speak = true } = {}) {
  const target = VIEWS[name] || VIEWS.front;
  cameraTween?.cancel();
  // Start from where the camera IS, not from where the last glide left `pose` — a manual orbit
  // moves one and not the other.
  const from = poseFromCamera();
  pose = { ...from };
  // Take the short way round the azimuth circle.
  let delta = target.azimuthDeg - from.az;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  cameraTween = tween({
    from: 0, to: 1, duration: TIMING.camera, ease: easeCamera,
    onUpdate: (t) => {
      pose.az = from.az + delta * t;
      pose.el = from.el + (target.elevationDeg - from.el) * t;
      applyPose();
    },
    onComplete: () => { cameraTween = null; applyViewMode(); },
  });
  setPoseName(name);
  // Leaving the elevation hands over to the classifier AT ONCE, so the linework is already
  // live as the plate starts to turn. Arriving at it waits for `onComplete`, so the authored
  // drawing snaps in only once the part is square-on and the two agree.
  if (name !== 'front') applyViewMode();
  if (!speak) return;
  announce({
    front: 'Front view — the true orthographic elevation the dimensions describe.',
    pictorial: `Three-quarter view of the ${currentFigure.name.toLowerCase()}. It is ${currentFigure.plate.thickness} thick, and every feature on the drawing is real geometry.`,
    rear: 'The plate is turned over. You are looking at the back face.',
  }[name] || '');
}

/**
 * Put the camera back on the drawing. Called on every step navigation (Back / Next / rail
 * jump), exactly as the sibling Foundations topic does — but it matters more here: that
 * topic's subject IS a pictorial, while this one's is a flat elevation, so a step arrived at
 * mid-orbit would show a skewed sheet and, in Step 3, values whose readability cannot be
 * judged. Orbit, scroll-zoom and pan all stay live; this only undoes them at a step boundary.
 *
 * Zoom returns to whatever the SHEET's chosen scale asks for (§4.5 item 5), which is 1:1
 * everywhere except a Step-6 scale the learner has deliberately picked — so this never fights
 * that control. No-op when the camera is already there, so the boot render costs nothing.
 */
function restoreView() {
  const wantZoom = SHEET_SETTINGS.scales.find((s) => s.id === sheet.scale)?.zoom ?? 1;
  const atFront = poseName === 'front'
    && Math.abs(pose.az - VIEWS.front.azimuthDeg) < 0.5
    && Math.abs(pose.el - VIEWS.front.elevationDeg) < 0.5;
  if (atFront && Math.abs(camera.zoom - wantZoom) < 1e-3) return;
  setView('front', { announce: false });
  camera.zoom = wantZoom;
  camera.updateProjectionMatrix();
}

// ============================================================================
// Step drawings
// ============================================================================

/** Ids of a spec list, in order. */
const idsOf = (specs) => specs.map((s) => s.id);

/**
 * Step 1's drawing surface. The step teaches how a dimension is DRAWN, which is several
 * separate studies: the anatomy itself, the space between the projection lines (Figs. 4.7–4.8),
 * where a leader may put its head (Fig. 4.4), and the line alphabet.
 *
 * TWO FIGURES, chosen by what is being studied. The anatomy and the space study are set on the
 * PLAIN PLATE, because the first dimension a student ever reads should be the only thing on the
 * sheet. Two of the studies cannot be done there and say so honestly: a leader head is a choice
 * between a dot on a face and an arrow on an edge, which needs a feature with an edge; and the
 * line alphabet's third and fourth entries are the hidden line and the centre line, which need a
 * figure that HAS one of each. Both borrow the plate-with-a-hole.
 *
 * @param {Object} [options]
 * @param {boolean} [options.revealed=true] Whether Step 1's dimensions are already on.
 * @param {boolean} [options.animate=false] Redraw the study from nothing.
 */
function showStudy({ revealed = true, animate = false } = {}) {
  setFigure(step1.study === 'leader' || drawing.lineTypeFocus ? 'hole' : 'plate');
  setCallout(null);
  drawing.focusElement = null;
  // Every Step-1 study reads against the bare outline: a leader that ends in a DOT points at
  // a surface, so the surface has to be legible.
  setRig({ dimmed: false, centreLines: false });

  if (step1.study === 'leader') {
    drawing.specs = leaderDemo(step1.leaderHead);
  } else if (step1.study === 'space') {
    const decision = step1.decision || fitDecision(step1.spanMm, drawing.termination);
    drawing.specs = spaceDemo(step1.spanMm, decision);
  } else {
    drawing.specs = anatomyDrawing();
  }

  if (!revealed) {
    // Undimensioned to start with: the point of Step 1 is that a view alone cannot state size.
    drawing.progress = uniform(idsOf(drawing.specs), 0);
    redraw();
    return;
  }
  if (animate) {
    animateIn(idsOf(drawing.specs), TIMING.morph, { stagger: false });
    return;
  }
  drawing.progress = null;
  redraw();
}

function showRule(ruleId, variant) {
  // Every placement rule is legible on the plate with one hole — it has an outline, a centre
  // line and one dashed circle, which between them are everything the ten rules argue about.
  setFigure('hole');
  const rule = RULES.find((r) => r.id === ruleId) || RULES[0];
  const set = variant === 'wrong' ? rule.wrong : rule.correct;
  // The drag exercise rides alongside the rule demo on a dimension no rule uses, so the two
  // never interfere.
  const dragSpec = { ...dragDemo(), textNudgeMm: dragNudge.slice() };
  drawing.specs = [...set.map((s) => ({ ...s })), dragSpec];
  drawing.focusElement = null;
  // Some rules are only legible against the part's own centre lines — "never dimension ON a
  // centre line", and Fig. 4.2's opposite permission that a centre line may BE a projection
  // line. The rule catalogue says which.
  setRig({ centreLines: !!rule.centreLines, dimmed: false });
  animateIn(idsOf(drawing.specs), TIMING.morph, { stagger: false });
}

/**
 * Step 3's drawing. The CHAMFERED plate, and the chamfer is the reason: aligned and
 * unidirectional values are identical on a horizontal dimension line, so a figure that can only
 * be measured across and up cannot show the difference at all. A 45° chamfer supplies both cases
 * the two systems disagree about — a sloping dimension line and an angular one.
 */
function showMethods() {
  setFigure('chamfer');
  drawing.specs = obliqueOn ? obliqueClock() : methodDrawing();
  drawing.focusElement = null;
  // The clock is about the VALUES, so the part steps back behind them.
  setRig({ centreLines: false, dimmed: obliqueOn });
  animateIn(idsOf(drawing.specs), TIMING.morph, { stagger: false });
  // Re-state the comparison on the new spec list, so switching study or method keeps it.
  if (compareKind === 'method') setMethodCompare(true);
}

/**
 * Hold the two value systems side by side: the method the learner has NOT selected on the left
 * sheet, the one they have on the right. Same figure, same layout, same sizes — the ONLY
 * difference between the two drawings is the thing the step is about, which is what makes the
 * comparison worth looking at rather than a second drawing to decode.
 *
 * It follows Step 4's rule exactly: switching either side never re-runs the main drawing's
 * reveal animation, because that would throw away the comparison the learner is reading.
 *
 * @param {boolean} on
 */
function setMethodCompare(on) {
  if (!on) {
    compareKind = null;
    compareMethod = null;
    compareSpecs = null;
    setCompareOffsets(false);
    redraw();
    return;
  }
  compareKind = 'method';
  compareLayoutId = null;
  compareMethod = drawing.method === 1 ? 2 : 1;
  compareSpecs = (obliqueOn ? obliqueClock() : methodDrawing()).map((s) => ({ ...s }));
  setCompareOffsets(true);
  setSheetNames(METHODS[compareMethod].name, METHODS[drawing.method].name);
  redraw();
}

function showArrangement(id, variantId) {
  // Five layouts of the same sizes, on the SLOTTED plate: a layout question needs several
  // features strung along one edge before chain, parallel and running mean anything, and three
  // features plus two faces is the fewest that shows all five apart.
  setFigure('slot');
  const a = ARRANGEMENTS.find((x) => x.id === id) || ARRANGEMENTS[0];
  currentArrangementId = a.id;
  const variant = a.variants
    ? (a.variants.find((v) => v.id === variantId) ?? a.variants[0])
    : null;
  drawing.specs = (variant ?? a).build();
  drawing.focusElement = null;
  // The arrangement is the subject; the part steps back behind it.
  setRig({ centreLines: false, dimmed: true });
  animateIn(idsOf(drawing.specs), TIMING.rearrange, { stagger: true });
}

function showSymbol(id, variantId) {
  // The Guide Plate, and only here does the lesson need it: the five symbols exist BECAUSE the
  // features differ — a ball is not a hole is not a square — and no simpler figure carries one
  // clean instance of each. By this point every element, rule, value system and layout has
  // already been met somewhere with nothing else on the sheet.
  setFigure('guide');
  const sym = SYMBOLS.find((s) => s.id === id);
  const variant = sym
    ? (sym.variants.find((v) => v.id === variantId) ?? sym.variants[0])
    : null;
  drawing.specs = variant ? variant.specs.map((s) => ({ ...s })) : [];
  setCallout(sym ? sym.name : null);
  drawing.focusElement = null;
  // A circular feature is read against its centre lines.
  setRig({ centreLines: true, dimmed: false });
  animateIn(idsOf(drawing.specs), TIMING.symbol, { stagger: true });
  if (sym && sym.rear && poseName !== 'rear') {
    // The countersink is on the far face; say so rather than silently drawing it dashed.
    announce('This feature is machined on the far face, so it reads dashed here. Use “Turn the plate over” to see it.');
  }
}

/**
 * Step 6's 3-D sheet: the Guide Plate, fully and correctly dimensioned.
 *
 * It is the only drawing this step has, and it exists for one control — the scale and unit
 * study inside "The sheet itself". The worked examples are flat SVG on a board over the top
 * (see `setExamples`), so this is what the viewport shows whenever that board is down.
 *
 * There is no faulty variant any more. The twelve seeded faults and the marker hunt they drove
 * were removed at the lecturers' review of 2026-08-16: the chapter's four wrong/correct pairs
 * teach the same mistakes by showing them, and a second assessment on top buried the pairs.
 */
function showSheet() {
  setFigure('guide');
  compareMethod = null;
  compareKind = null;
  compareLayoutId = null;
  compareSpecs = null;
  drawing.focusElement = null;
  setRig({ centreLines: false, dimmed: false });
  setCompareOffsets(false);
  drawing.specs = completeDrawing();
  drawing.progress = null;
  redraw();
}

// ============================================================================
// Step 6's worked examples — the chapter's own wrong/correct pairs (Figs. 4.28–4.31)
// ============================================================================

/** Which example is on the board, or null when the 3-D drawing is showing instead. */
let exampleId = null;

/**
 * Put one of the chapter's worked examples on the board, or take the board down and give the
 * viewport back to the 3-D drawing.
 *
 * WHY IT IS PAINTED HERE. The board lives inside `#sim-viewport`, and the viewport belongs to
 * `main.js` — `dimensionUI.js` owns the wizard panel and reaches the scene only through this
 * controller. The board is flat SVG with no scene object in it, so nothing about it goes near
 * `rebuild()`; the ONLY thing it shares with the 3-D sheet is the viewport it covers.
 *
 * The render loop keeps running underneath. That is deliberate and it is cheap: the board is
 * opaque, the frames cost one draw of a static scene, and stopping the loop would mean the
 * camera arrives cold — with a stale `LineMaterial.resolution` after any resize — the moment
 * the learner switches back.
 *
 * @param {string|null} id  a figure id from REVIEW_FIGURES, or null to take the board down
 */
function setExamples(id) {
  const board = document.getElementById('review-sheet');
  if (!board) return;
  const fig = id ? reviewFigure(id) : null;
  exampleId = fig ? fig.id : null;
  viewport?.classList.toggle('is-examples', !!fig);
  board.hidden = !fig;
  // THE LABEL LAYER GOES DOWN WITH IT, and an opaque board is not enough on its own. CSS2D
  // labels are real DOM, so leaving the layer up paints every one of the Guide Plate's values
  // over the examples — and any focusable one is left in the tab order behind a panel nobody
  // can see. Closing "The sheet itself" is the path that would do it.
  if (labelRenderer) labelRenderer.domElement.style.display = fig ? 'none' : '';
  if (!fig) { board.innerHTML = ''; return; }

  const li = (items) => items.map((t) => `<li>${t}</li>`).join('');
  const i = REVIEW_FIGURES.indexOf(fig) + 1;
  board.innerHTML = `
    <div class="rf-board__head">
      <span class="rf-board__name">${fig.name}</span>
      <span class="rf-board__mode">${fig.arrangement}</span>
      <span class="rf-board__count">Example ${i} of ${REVIEW_FIGURES.length}</span>
    </div>
    <div class="rf-pair">
      <figure class="rf-cell rf-cell--wrong">
        <figcaption class="rf-cell__cap"><span class="rf-cell__flag" aria-hidden="true">✗</span>Wrong dimensioning</figcaption>
        <div class="rf-cell__art">${figureSvg(fig, 'wrong')}</div>
      </figure>
      <figure class="rf-cell rf-cell--right">
        <figcaption class="rf-cell__cap"><span class="rf-cell__flag" aria-hidden="true">✓</span>Correct dimensioning</figcaption>
        <div class="rf-cell__art">${figureSvg(fig, 'correct')}</div>
      </figure>
    </div>
    <div class="rf-why">
      <section class="rf-why--wrong"><h3>What is wrong?</h3><ul>${li(fig.faults)}</ul></section>
      <section class="rf-why--right"><h3>Why the corrected version is better</h3><ul>${li(fig.fixes)}</ul></section>
    </div>`;
  board.scrollTop = 0;
}

// ============================================================================
// The sheet itself — caption, scale and units (§4.5 items 4–6)
// ============================================================================

/** The sheet's own state, which is not part of any dimension. */
const sheet = { scale: '1:1', units: 'mm', captionOn: false };

/**
 * Paint the caption band. §4.5 item 6: the name of the object and the views are written
 * below the drawing in capitals, and the question number goes at the left top enclosed in a
 * circle. Item 5 puts the scale below the drawing; item 4 puts a unit note near the title
 * block whenever the unit is not the millimetre.
 */
function updateCaption() {
  const band = document.getElementById('vp-caption');
  if (!band) return;
  band.hidden = !sheet.captionOn;
  const unit = SHEET_SETTINGS.units.find((u) => u.id === sheet.units);
  const name = document.getElementById('vp-caption-name');
  const scaleEl = document.getElementById('vp-caption-scale');
  const noteEl = document.getElementById('vp-caption-note');
  if (name) name.textContent = currentFigure.caption;
  if (scaleEl) scaleEl.textContent = `SCALE ${sheet.scale}`;
  if (noteEl) {
    noteEl.textContent = unit?.titleNote || '';
    noteEl.hidden = !unit?.titleNote;
  }
}

/** §4.5 item 5 — the scale changes the DRAWING and never a single value on it. */
function setSheetScale(id) {
  const s = SHEET_SETTINGS.scales.find((x) => x.id === id) || SHEET_SETTINGS.scales[0];
  sheet.scale = s.id;
  camera.zoom = s.zoom;
  camera.updateProjectionMatrix();
  updateCaption();
}

/** §4.5 item 4 — any unit other than the millimetre has to be stated. */
function setSheetUnits(id) {
  const u = SHEET_SETTINGS.units.find((x) => x.id === id) || SHEET_SETTINGS.units[0];
  sheet.units = u.id;
  drawing.unitFactor = u.factor;
  updateCaption();
  redraw();
}

// ============================================================================
// Interaction — dragging a value (Step 2)
// ============================================================================

/** Millimetres of drawing per screen pixel, at the current ortho zoom. */
function mmPerPixel() {
  const { height } = viewportSize();
  const worldPerPx = ((camera.top - camera.bottom) / camera.zoom) / (height || 1);
  return worldPerPx * MM_PER_UNIT;
}

/**
 * The learner drags the dimensional value off its legal position. §4.2's Method-1 conditions
 * are then checked against where it landed, and — this is the teaching part — an illegal
 * placement is explained and the value slides back to where the rule puts it.
 */
function onValueDrag(id, dxPx, dyPx, phaseName) {
  if (id !== 'drag') return;
  if (phaseName === 'start') return;
  if (phaseName === 'move') {
    const k = mmPerPixel();
    dragNudge = [dragNudge[0] + dxPx * k, dragNudge[1] - dyPx * k]; // screen y is inverted
    const spec = drawing.specs.find((s) => s.id === 'drag');
    if (spec) spec.textNudgeMm = dragNudge.slice();
    redraw();
    return;
  }

  // Released: judge it. The base offset is where the rule puts the value — §4.5 item 3's
  // 0.5–1 mm above the line, plus half the 3–4 mm text height.
  const baseOut = SPACING.textGap + SPACING.textHeight / 2;
  const result = validatePlacement(dragNudge[0], baseOut + dragNudge[1], 95);
  ui?.reportPlacement(result);
  if (result.ok) return;

  // Slide it back to the legal spot, so the last thing the learner sees is the rule obeyed.
  const from = dragNudge.slice();
  tween({
    from: 1, to: 0, duration: TIMING.morph, ease: easeStandard,
    onUpdate: (t) => {
      dragNudge = [from[0] * t, from[1] * t];
      const spec = drawing.specs.find((s) => s.id === 'drag');
      if (spec) spec.textNudgeMm = dragNudge.slice();
      redraw();
    },
    onComplete: () => { dragNudge = [0, 0]; },
  });
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  // Backstop for the pixel ratio. `watchPixelRatio()` is the proper event-driven signal, but
  // it depends on the `(resolution: …dppx)` media query firing, and that is not guaranteed in
  // every environment (an emulated device-scale change, for one, moves devicePixelRatio
  // without dispatching it). One float comparison a frame closes the gap for good; the
  // expensive part only runs when the ratio has actually moved.
  if ((Math.min(window.devicePixelRatio || 1, 2)) !== appliedPixelRatio) handleResize(viewport);
  // Capture BEFORE ticking: a camera tween clears its own handle in onComplete, and that last
  // frame still has to classify.
  const tweening = cameraTween !== null;
  tickTweens(delta);   // reveal + camera tweens pause with the loop (simAPI.pause)
  // controls.update() returns true when the camera transform actually changed this frame
  // (a drag, or damping inertia) — the canonical "camera moved" signal.
  const camChanged = controls.update();

  // ONE rAF-throttled classification pass, and only while the live linework is the one on
  // show. reclassify() diffs every edge and rebuilds its batches only when something flipped,
  // so a still frame costs the raycasts and nothing else.
  if (lineDrawer && lineDrawer.group.visible && (forceReclassify || camChanged || tweening)) {
    lineDrawer.reclassify(camera);
    forceReclassify = false;
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize
// ============================================================================

/** The device pixel ratio the renderer was last sized for, so a change is detectable. */
let appliedPixelRatio = 0;
/** The live `(resolution: …dppx)` query whose change tells us the pixel ratio moved. */
let dprQuery = null;

/**
 * Watch for a change in device pixel ratio — browser zoom, a drag to a monitor with different
 * scaling, or an OS display-scale change.
 *
 * A ResizeObserver is NOT enough on its own: zooming can leave the viewport the same size in
 * CSS pixels while devicePixelRatio moves underneath it, so the observer never fires and the
 * drawing buffer silently keeps the old ratio — a soft picture and fat lines measured against
 * the wrong buffer. `(resolution: Xdppx)` stops matching the moment the ratio changes, which
 * is the one reliable signal; it is re-armed at the new ratio each time it fires.
 */
function watchPixelRatio() {
  dprQuery?.removeEventListener?.('change', onPixelRatioChange);
  dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  dprQuery.addEventListener('change', onPixelRatioChange, { once: true });
}

function onPixelRatioChange() {
  handleResize(viewport);
  watchPixelRatio(); // re-arm at the ratio we just moved to
}

function handleResize(container) {
  if (!container || !renderer) return;
  const w = container.clientWidth;
  const h = container.clientHeight;
  // A collapsing panel or a hidden tab can report 0 for a frame. Sizing to it would zero the
  // drawing buffer and hand LineMaterial a degenerate resolution, so skip and wait for the
  // next observation.
  if (!w || !h) return;

  // Browser zoom, a move to another monitor, or an OS scaling change all alter
  // devicePixelRatio AFTER boot. Without re-applying it the drawing buffer keeps the old
  // ratio: the picture goes soft and every fat line is scaled against the wrong buffer.
  // Re-apply only on a real change — setPixelRatio forces a buffer reallocation.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (dpr !== appliedPixelRatio) {
    renderer.setPixelRatio(dpr);
    appliedPixelRatio = dpr;
  }

  const f = frustum(w / h, contentB.visible);
  camera.left = -f.halfW;
  camera.right = f.halfW;
  camera.top = f.halfH;
  camera.bottom = -f.halfH;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);

  // Fat lines render the wrong thickness if LineMaterial.resolution drifts from the drawing
  // buffer — keep every batch in sync (RULES.md §3.16). The live classifier rebuilds its
  // batches from the same Vector2, so new batches inherit the corrected size too.
  for (const l of [rigA, rigB, layerA, layerB, labelsA, labelsB, lineDrawer]) l?.setResolution(w, h);

  // A resize changes nothing about the geometry, but the classifier's batches were just
  // handed a new resolution; re-run once so the next frame is drawn at the right weight even
  // if the camera is still.
  if (lineDrawer && lineDrawer.group.visible) forceReclassify = true;
}

// ============================================================================
// Mobile advisory — banner only, never blocks the sim (RULES.md §2.13)
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
// Platform contract — window.simAPI (RULES.md §2.8–§2.9)
// ============================================================================

window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    cameraTween = null;
    drawing.method = 1;
    drawing.termination = 'open';
    drawing.terminationAngleDeg = 15;
    drawing.angularStyle = 'a';
    drawing.focusElement = null;
    drawing.lineTypeFocus = null;
    drawing.unitFactor = 1;
    drawing.progress = null;
    compareSpecs = null;
    compareMethod = null;
    compareKind = null;
    compareLayoutId = null;
    dragNudge = [0, 0];
    dimensionsRevealed = false;
    currentArrangementId = ARRANGEMENTS[0].id;
    revealTween = null;
    obliqueOn = false;
    revealHidden = false;
    forceReclassify = true;
    step1.study = 'anatomy';
    step1.leaderHead = 'arrow';
    step1.spanMm = 60;
    step1.decision = null;
    sheet.scale = '1:1';
    sheet.units = 'mm';
    sheet.captionOn = false;
    updateCaption();
    setExamples(null);
    // A reset puts back the view the sim OPENS on, which is the isometric.
    pose = { az: VIEWS.pictorial.azimuthDeg, el: VIEWS.pictorial.elevationDeg };
    camera.zoom = 1;
    setPoseName('pictorial');
    setCompareOffsets(false);
    // Back to the figure the lesson opens on, and to its frame, before the one geometry path.
    currentFigure = DEFAULT_FIGURE;
    FRAME = frameOf(currentFigure);
    COMPARE_DX = FRAME.halfW + COMPARE_GAP / 2;
    rebuild();          // the single geometry path
    handleResize(viewport);
    applyPose(true);
    updateFigureBadge();
    ui?.reset();        // wizard chrome back to Step 1 (no second engine path)
    announce('Simulation reset. The plain plate is drawn but undimensioned, at Step 1.');
  },
};

// ============================================================================
// Controller injected into the wizard (the narrow surface it depends on)
// ============================================================================

const simController = {
  addDimensions() {
    dimensionsRevealed = true;
    setFigure('plate');
    drawing.specs = anatomyDrawing();
    animateIn(idsOf(drawing.specs), TIMING.reveal, { stagger: true });
  },

  focusElement(id) {
    drawing.focusElement = id;
    setCallout(ELEMENTS.find((e) => e.id === id)?.name ?? null);
    redraw();
  },

  /** The wizard is navigating between steps — put the camera back on the drawing. */
  restoreView() { restoreView(); },

  /** Step 1's line-type legend: hold one weight of line, fade everything else. */
  focusLineType(id) {
    drawing.lineTypeFocus = id;
    // The alphabet's third and fourth entries are the hidden line and the centre line, so the
    // legend borrows the plate WITH a hole — which has one of each. Both figures share the same
    // 130 × 80 envelope, so not one dimension on the sheet moves as it swaps.
    setFigure(step1.study === 'leader' || id ? 'hole' : 'plate');
    // Holding the APPARATUS means dimming the part; holding a line type of the part means
    // holding that one batch. The rig resolves both wants together, so order does not matter.
    setRig({ dimmed: id === 'apparatus', lineFocus: id === 'apparatus' ? null : id });
    redraw();
  },

  /** Step 1 has three studies on one plate; switch between them. */
  setStudy(name) {
    step1.study = name;
    showStudy({ animate: true });
  },

  /** Fig. 4.4 — take the same note to a surface, an edge, or a dimension line. */
  showLeaderHead(head) {
    step1.leaderHead = head;
    step1.study = 'leader';
    showStudy({ animate: true });
  },

  /** Figs. 4.7–4.8 — squeeze the projection lines together and watch the head give way. */
  showSpaceDemo(spanMm, decision) {
    step1.spanMm = spanMm;
    step1.decision = decision;
    step1.study = 'space';
    showStudy({ animate: false });   // a slider must track the pointer, never re-animate
  },

  showRule(ruleId, variant) { showRule(ruleId, variant); },

  setTermination(styleId) {
    drawing.termination = styleId;
    if (step1.study === 'space') step1.decision = fitDecision(step1.spanMm, styleId);
    redraw();
  },

  /** §4.1 — the included angle of an arrow head may be 15° to 90°. */
  setTerminationAngle(deg) {
    drawing.terminationAngleDeg = deg;
    redraw();
  },

  setAngularStyle(style) {
    drawing.angularStyle = style;
    redraw();
  },

  /** Fig. 4.10 — the same value on eight dimension lines pointing every way round. */
  showObliqueClock(on) {
    obliqueOn = on;
    showMethods();
  },

  setSheetScale(id) { setSheetScale(id); },
  setSheetUnits(id) { setSheetUnits(id); },

  setMethod(method) {
    drawing.method = method === 2 ? 2 : 1;
    // Step 3's comparison always holds the OTHER system beside the chosen one, so picking a
    // method while the two sheets are up swaps them over rather than leaving both the same.
    if (compareKind === 'method') { setMethodCompare(true); return; }
    // Step 4's is not a swap: the two sheets carry independent methods, and changing sheet A's
    // only renames and redraws sheet A. Sheet B stays exactly where the learner put it.
    if (compareKind === 'layout') setLayoutSheetNames();
    redraw();
  },

  /** Step 3 — hold aligned and unidirectional side by side. */
  setMethodCompare(on) { setMethodCompare(on); },

  setArrangement(id, variantId) { showArrangement(id, variantId); },

  /**
   * Hold ANY arrangement, in EITHER method, beside the current one — `otherId` is whichever
   * layout the learner picked from the "compare with" list and `otherMethod` whichever method,
   * or null for a single sheet. Only sheet B is rebuilt, and only from its spec list: sheet A's
   * drawing, its reveal animation and the camera are all left exactly as they are, so switching
   * either side is instant and nothing re-animates.
   *
   * THE TWO SHEETS CARRY INDEPENDENT METHODS. `method` is already a per-draw option, and a spec
   * may override it, so this needed no change to the renderer: sheet B is simply drawn with its
   * own value. The geometry, the sizes and the values themselves are untouched — only the
   * drafting convention the values are written under differs, which is exactly what the two
   * methods are.
   *
   * @param {string|null} otherId
   * @param {1|2} [otherMethod] Defaults to sheet A's method, i.e. a pure layout comparison.
   */
  setCompare(otherId, otherMethod) {
    const other = otherId ? ARRANGEMENTS.find((a) => a.id === otherId) : null;
    if (!other) {
      compareKind = null;
      compareLayoutId = null;
      compareMethod = null;
      compareSpecs = null;
      setCompareOffsets(false);
      return;
    }
    compareKind = 'layout';
    compareLayoutId = other.id;
    compareMethod = otherMethod === 2 ? 2 : otherMethod === 1 ? 1 : drawing.method;
    compareSpecs = other.build();
    setCompareOffsets(true);
    setLayoutSheetNames();
    redraw();
  },

  showSymbol(id, variantId) { showSymbol(id, variantId); },

  setView(name) { setView(name); },

  /** Step 6 — take the examples board down and give the viewport back to the finished sheet.
   *  Called when "The sheet itself" opens, so the scale and unit study has something to act on. */
  setSheetView() { setExamples(null); showSheet(); },

  /** Step 6 — put one of the chapter's worked examples up, or `null` for the 3-D drawing. */
  setExamples(id) { setExamples(id); },

  /** The wizard has moved to step `n`: hand it its drawing. */
  enterStep(n) {
    compareSpecs = null;
    compareMethod = null;
    compareKind = null;
    compareLayoutId = null;
    setCompareOffsets(false);
    setCallout(null);
    // The worked examples belong to Step 6 alone; leaving it always gives the viewport back.
    if (n !== 6) setExamples(null);
    // The caption band belongs to the finished sheet, which is what Step 6 is about.
    sheet.captionOn = n === 6;
    updateCaption();
    // Only Step 1 studies the line alphabet, and only Step 3 studies the oblique clock.
    if (n !== 1) {
      drawing.lineTypeFocus = null;
      setRig({ lineFocus: null });
      step1.study = 'anatomy';
    }
    if (n !== 3) obliqueOn = false;
    switch (n) {
      case 1: showStudy({ revealed: dimensionsRevealed }); break;
      case 2: /* painted by the wizard's own showRule call */ break;
      case 3: showMethods(); break;
      case 4: /* painted by the wizard's own setArrangement call */ break;
      case 5: showSymbol(null); break;
      // Step 6 opens on the worked examples, and the board covers the viewport — but the sheet
      // has to be UNDER it, ready for the moment "The sheet itself" is opened.
      case 6: showSheet(); break;
      default: break;
    }
  },

  completeLesson() {
    showToast('All four worked examples read. That is the lesson.');
    announce('Lesson complete. You have read all four worked examples.');
  },

  reset() { window.simAPI.reset(); },

  announce,
};

// ============================================================================
// Self-start (RULES.md §2.14)
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container;

  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  try {
    setupMobileNotice();

    document.getElementById('btn-hidden')?.addEventListener('click', () => {
      setRevealHidden(!revealHidden);
      announce(revealHidden
        ? 'Faces off. Every edge now shows — solid where you can see it, dashed where the metal is in the way.'
        : 'The solid is back.');
    });
    document.getElementById('btn-front')?.addEventListener('click', () => setView('front'));
    document.getElementById('btn-pictorial')?.addEventListener('click', () => setView('pictorial'));
    document.getElementById('btn-rear')?.addEventListener('click', () => setView('rear'));

    rebuild();
    setPoseName('pictorial');   // the sim opens on the isometric — see `pose`, above
    updateFigureBadge();
    ui = initUI(simController);          // paints Step 1 and calls enterStep(1)
    initTerms({ terms: TERMS, root: '#wizard' });

    new ResizeObserver(() => handleResize(container)).observe(container);
    watchPixelRatio(); // zoom / monitor-scaling changes that the observer cannot see
    handleResize(container);
    startLoop();

    // Re-render once the bundled fonts are in, so CSS2D values never measure or paint in a
    // fallback face (RULES.md §3.26).
    document.fonts?.ready?.then(() => redraw());
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  markBooted(); // last — only on a fully successful boot
}

init();
