// Orchestrator (Module 1 Topic 1.1 — Dimensioning).
//
// The standalone orchestrator pattern of Topic 1 (Foundations) and Module 2 (ADR-007,
// ADR-029): a thin `main.js` that owns the Three.js environment, the ONE rebuild() pipeline
// and the disposal contract, with pure leaf modules hanging off it in a star. The leaves —
// dimensionRig, dimensionDraw, dimensionLabels, dimensionUI and the pure-data catalogues —
// never import one another (RULES.md §3.6, ADR-078).
//
// WHAT IS DIFFERENT FROM TOPIC 1, AND WHY (ADR-078):
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
import { createLabelLayer } from './dimensionLabels.js';
import { initUI } from './dimensionUI.js';
import { initTerms } from './terms.js';
import { TERMS, SHEET_SETTINGS } from './dimensionSteps.js';
import { MM_PER_UNIT, PLATE, toWorld, HALF_DEPTH } from './dimensionData.js';
import {
  anatomyDrawing, ELEMENTS, ELEMENT_PARTS, methodDrawing, obliqueClock,
  leaderDemo, spaceDemo, ARRANGEMENTS, completeDrawing, MISTAKES, LANE,
} from './dimensionExamples.js';
import { RULES, validatePlacement } from './dimensionRules.js';
import { SYMBOLS } from './dimensionSymbols.js';
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
 * How the sheet is framed, in the plate's own millimetres.
 *
 * The camera is centred on the PART and the frame is measured as a symmetric REACH from
 * there — the same shape as the sibling Foundations topic's `frontViewPose`, which fits its
 * elevation as reaches out from the bore axis rather than as a box around everything drawn.
 *
 * Centring the combined bounding box instead is what produced the old off-centre picture: the
 * dimension lanes fall much further BELOW the part than they rise above it (five stacked lanes
 * under the drawing against one over it), so the box's centre sits ~27 mm under the plate and
 * the plate rides high in the viewport. The lanes are hairlines; the plate is the visual mass,
 * and the visual mass is what has to look centred.
 *
 * The reaches are the furthest ink any step puts on the sheet — Step 4's parallel arrangement
 * and Step 6's finished drawing reach lowest, the leader notes reach furthest right — plus a
 * margin for the value text that rides above each line. Measured, not guessed.
 *
 * The centre is the plate's own middle nudged 13 mm right, because the ink is not symmetric
 * about the part: the leader notes and the spigot's dimensions all sit off the right-hand end
 * and nothing balances them on the left. 13 mm is the measured offset of the drawn ink from
 * the part's centre, and it is the same at every step, so correcting it once here leaves the
 * picture centred throughout instead of re-framing under the learner.
 */
const SHEET_CENTRE_MM = Object.freeze({ x: PLATE.length / 2 + 13, y: PLATE.height / 2 });
const SHEET_REACH_MM = Object.freeze({ x: 152, y: 145 });

/** The sheet in centred world units, as a centre + half-extents. */
const FRAME = (() => {
  const c = toWorld(SHEET_CENTRE_MM.x, SHEET_CENTRE_MM.y);
  return {
    cx: c.x, cy: c.y,
    halfW: SHEET_REACH_MM.x / MM_PER_UNIT,
    halfH: SHEET_REACH_MM.y / MM_PER_UNIT,
  };
})();

/** Gap between the two sheets in the before/after compare (world units). */
const COMPARE_GAP = 3;
/** How far each sheet slides off centre in compare mode. */
const COMPARE_DX = FRAME.halfW + COMPARE_GAP / 2;

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
  hotspots: [],
};

/**
 * The rig's LESSON-level state, held here rather than only inside the rig, because a rebuild
 * hands back a brand-new solid and brand-new batches that remember none of it. Every step
 * writes through `setRig()`, and `rebuild()` replays the whole record — the same contract
 * Foundations' `applyLayers()` + `setXray()` have at the end of its rebuild.
 */
const rigState = { dimmed: false, lineFocus: null, centreLines: false };

/** Write one or more rig wants and push them at the live rigs. */
function setRig(patch) {
  Object.assign(rigState, patch);
  applyRigState();
}

/** Replay the whole record onto both sheets. Idempotent, so it is safe after any rebuild. */
function applyRigState() {
  const mode = poseName === 'rear' ? 'rear' : poseName === 'front' ? 'front' : 'free';
  rigA?.applyState({ ...rigState, viewMode: mode, authored: mode === 'front' });
  // Sheet B is only ever a second elevation beside the first, so it keeps its authored set.
  rigB?.applyState({ ...rigState, viewMode: mode, authored: true });
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

/** Step-6 progress: solved faults, innocent dimensions already accused, and the marker most
 *  recently judged (ringed on the drawing so it can be found beside its explanation). */
const found = new Set();
const missed = new Set();
const visited = new Set();
/** @type {string|null} */
let lastPicked = null;

let rafId = null;
let running = false;
let lastFrameTime = 0;

/** In-flight camera pose tween handle. */
let cameraTween = null;
/** Current camera pose (degrees). */
let pose = { az: VIEWS.front.azimuthDeg, el: VIEWS.front.elevationDeg };
let poseName = 'front';

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

  rigA = createRig({ width, height });
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
  labelsA = createLabelLayer(contentA, { width, height, onDrag: onValueDrag, onPick: onHotspotPick });

  // Sheet B carries the "before" drawing of a Step-4 / Step-6 comparison. It is built with
  // the sheet so a compare never has to touch geometry outside rebuild().
  rigB = createRig({ width, height });
  contentB.add(rigB.group);
  layerB = createDimensionLayer({ width, height });
  contentB.add(layerB.group);
  labelsB = createLabelLayer(contentB, { width, height });

  setCompareOffsets(false);
  applyViewMode(); // fresh rigs start in whatever pose the camera is already in
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
  const labels = layerA.draw(specs, { ...opts, progress: resolveProgress(specs) });
  for (const l of labels) l.text = inUnits(l.text);
  labelsA.setLabels(labels);
  labelsA.setFocus(drawing.focusElement
    ? new Set(labels.filter((l) => l.tone !== 'muted').map((l) => l.id))
    : null);

  if (compareSpecs && layerB && labelsB) {
    const b = layerB.draw(compareSpecs, opts);
    for (const l of b) l.text = inUnits(l.text);
    labelsB.setLabels(b);
  }
}

/** Replace the clickable review markers. Kept OUT of redraw(): the markers are real DOM
 *  buttons, and rebuilding them on every animation frame would throw away keyboard focus. */
function setHotspots(list) {
  drawing.hotspots = list;
  labelsA?.setHotspots(list);
}

/** Where the callout pill sits: the empty band above the sheet, clear of the topmost
 *  dimension lane (§4.3's 5–6 mm clearance puts nothing up here). */
const CALLOUT_AT = (() => {
  const w = toWorld(PLATE.length / 2, PLATE.height + 26);
  return new THREE.Vector3(w.x, w.y, HALF_DEPTH + 0.8);
})();

/** Name, ON the drawing, whatever the step is currently pointing at. Null takes it off.
 *  Kept OUT of redraw(): the callout tracks the learner's selection, not the spec list, and
 *  rebuilding a DOM node every animation frame would make it flicker. */
function setCallout(text) {
  labelsA?.setCallout(text ? { text, position: CALLOUT_AT } : null);
}

/** Slide the two sheets apart for a before/after compare — the BEFORE drawing on the left
 *  (sheet B) and the AFTER on the right (sheet A) — or bring sheet A back to centre. */
/**
 * Where each sheet's caption sits: centred on the drawing and clear below its lowest lane, in
 * the sheet's OWN space, so it travels with the sheet instead of floating at the top of the
 * viewport with nothing to attach it to.
 */
const CAPTION_AT = (() => {
  // Centred on the DRAWING's own centre of ink (SHEET_CENTRE_MM), not on the part's midpoint —
  // the frame is nudged right to balance the leader notes, and a caption hung off the part
  // instead would sit 13 mm left of the drawing it names, breaking the pair's symmetry.
  const w = toWorld(SHEET_CENTRE_MM.x, -88);
  return new THREE.Vector3(w.x, w.y, HALF_DEPTH + 0.8);
})();

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

/** Name the two drawings, each under its own sheet. Null on either side takes that name off. */
function setSheetNames(nameB, nameA) {
  labelsA?.setSheetCaption(nameA ? { text: nameA, position: CAPTION_AT } : null);
  labelsB?.setSheetCaption(nameB ? { text: nameB, position: CAPTION_AT } : null);
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
    pictorial: 'Three-quarter view. The plate is 30 thick, and the spherical seat is a real bowl sunk into the front face.',
    rear: 'The plate is turned over. You are looking at the back face, where the countersink is machined.',
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
 * Step 1's drawing surface. The step teaches how a dimension is DRAWN, which is three
 * separate studies on the same plate: the anatomy itself, the space between the projection
 * lines (Figs. 4.7–4.8), and where a leader may put its head (Fig. 4.4).
 *
 * @param {Object} [options]
 * @param {boolean} [options.revealed=true] Whether Step 1's dimensions are already on.
 * @param {boolean} [options.animate=false] Redraw the study from nothing.
 */
function showStudy({ revealed = true, animate = false } = {}) {
  setHotspots([]);
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
  const rule = RULES.find((r) => r.id === ruleId) || RULES[0];
  const set = variant === 'wrong' ? rule.wrong : rule.correct;
  // The drag exercise rides alongside the rule demo on a dimension no rule uses, so the two
  // never interfere.
  const dragSpec = {
    id: 'drag', kind: 'linear', axis: 'x',
    from: [0, 88], to: [95, 100], at: LANE.above1, text: '95',
    draggable: true, textNudgeMm: dragNudge.slice(),
    title: 'Drag me, or focus me and use the arrow keys',
  };
  drawing.specs = [...set.map((s) => ({ ...s })), dragSpec];
  setHotspots([]);
  drawing.focusElement = null;
  // Some rules are only legible against the part's own centre lines — "never dimension ON a
  // centre line", and Fig. 4.2's opposite permission that a centre line may BE a projection
  // line. The rule catalogue says which.
  setRig({ centreLines: !!rule.centreLines, dimmed: false });
  animateIn(idsOf(drawing.specs), TIMING.morph, { stagger: false });
}

function showMethods() {
  drawing.specs = obliqueOn ? obliqueClock() : methodDrawing();
  setHotspots([]);
  drawing.focusElement = null;
  // The clock is about the VALUES, so the part steps back behind them.
  setRig({ centreLines: false, dimmed: obliqueOn });
  animateIn(idsOf(drawing.specs), TIMING.morph, { stagger: false });
}

function showArrangement(id, variantId) {
  const a = ARRANGEMENTS.find((x) => x.id === id) || ARRANGEMENTS[0];
  currentArrangementId = a.id;
  const variant = a.variants
    ? (a.variants.find((v) => v.id === variantId) ?? a.variants[0])
    : null;
  drawing.specs = (variant ?? a).build();
  setHotspots([]);
  drawing.focusElement = null;
  // The arrangement is the subject; the part steps back behind it.
  setRig({ centreLines: false, dimmed: true });
  animateIn(idsOf(drawing.specs), TIMING.rearrange, { stagger: true });
}

function showSymbol(id, variantId) {
  const sym = SYMBOLS.find((s) => s.id === id);
  const variant = sym
    ? (sym.variants.find((v) => v.id === variantId) ?? sym.variants[0])
    : null;
  drawing.specs = variant ? variant.specs.map((s) => ({ ...s })) : [];
  setCallout(sym ? sym.name : null);
  setHotspots([]);
  drawing.focusElement = null;
  // A circular feature is read against its centre lines.
  setRig({ centreLines: true, dimmed: false });
  animateIn(idsOf(drawing.specs), TIMING.symbol, { stagger: true });
  if (sym && sym.rear && poseName !== 'rear') {
    // The countersink is on the far face; say so rather than silently drawing it dashed.
    announce('This feature is machined on the far face, so it reads dashed here. Use “Turn the plate over” to see it.');
  }
}

/** The Step-6 drawing: the complete dimensioning with every un-found fault still in place. */
function faultyDrawing() {
  const byId = new Map(completeDrawing().map((s) => [s.id, { ...s }]));
  for (const m of MISTAKES) {
    if (found.has(m.id)) continue;
    if (m.add) byId.set(m.target, { id: m.target, ...m.wrong });
    else byId.set(m.target, { ...byId.get(m.target), ...m.wrong });
  }
  return [...byId.values()];
}

/**
 * The twelve review markers, each in one of four states. Twelve is enough that a learner will
 * lose their place without them: an untouched marker looks different from one they have already
 * tried and cleared, from one they wrongly accused, and from one they have solved — and the one
 * just judged is ringed, so the explanation card and the drawing point at each other.
 */
function reviewHotspots() {
  return MISTAKES.map((m) => {
    const w = toWorld(m.at[0], m.at[1]);
    const state = found.has(m.id) ? 'found'
      : missed.has(m.id) ? 'missed'
      : visited.has(m.id) ? 'visited'
      : null;
    return {
      id: m.id,
      label: {
        found: `${m.title} — solved`,
        missed: 'You checked this one: it is drawn correctly',
        visited: 'Already checked — correct',
      }[state] || 'Check this dimension',
      position: new THREE.Vector3(w.x, w.y, HALF_DEPTH + 0.8),
      state,
      current: m.id === lastPicked,
    };
  });
}

function showReview(view) {
  drawing.focusElement = null;
  setRig({ centreLines: false, dimmed: false });

  if (view === 'compare') {
    // Sheet B (left) holds the faulty drawing, sheet A (right) the corrected one.
    drawing.specs = completeDrawing();
    compareSpecs = faultyDrawing();
    setHotspots([]);
    setCompareOffsets(true);
    setSheetNames('With faults', 'Corrected');
  } else {
    compareSpecs = null;
    setCompareOffsets(false);
    drawing.specs = view === 'correct' ? completeDrawing() : faultyDrawing();
    setHotspots(view === 'faults' ? reviewHotspots() : []);
  }
  drawing.progress = null;
  redraw();
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
  if (name) name.textContent = 'GUIDE PLATE — FRONT ELEVATION';
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
// Interaction — dragging a value (Step 2) and picking a fault (Step 6)
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

/** A Step-6 marker was clicked. A correct accusation morphs the faulty dimension back into
 *  its BIS-compliant form in front of the learner. */
function onHotspotPick(id) {
  const mistake = MISTAKES.find((m) => m.id === id);
  const correct = !!mistake && !found.has(id);
  lastPicked = id;
  if (!correct) { missed.add(id); visited.add(id); }
  if (correct) {
    found.add(id);
    drawing.specs = faultyDrawing();
    setHotspots(reviewHotspots());
    // Redraw the one corrected dimension from nothing, so the fix is visible as a change.
    const target = mistake.add ? null : mistake.target;
    if (target) {
      drawing.progress = Object.fromEntries(drawing.specs.map((s) => [s.id, s.id === target ? 0 : 1]));
      redraw();
      tween({
        from: 0, to: 1, duration: TIMING.morph, ease: easeDraw,
        onUpdate: (t) => {
          drawing.progress = Object.fromEntries(drawing.specs.map((s) => [s.id, s.id === target ? t : 1]));
          redraw();
        },
        onComplete: () => { drawing.progress = null; redraw(); },
      });
    } else {
      drawing.progress = null;
      redraw();
    }
  } else {
    setHotspots(reviewHotspots()); // repaint so the wrong accusation shows on the marker
  }
  ui?.reportFault([...found], id, correct);
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
    drawing.hotspots = [];
    drawing.progress = null;
    compareSpecs = null;
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
    found.clear();
    missed.clear();
    visited.clear();
    lastPicked = null;
    pose = { az: VIEWS.front.azimuthDeg, el: VIEWS.front.elevationDeg };
    camera.zoom = 1;
    setPoseName('front');
    setCompareOffsets(false);
    rebuild();          // the single geometry path
    applyPose(true);
    ui?.reset();        // wizard chrome back to Step 1 (no second engine path)
    announce('Simulation reset. The Guide Plate is drawn but undimensioned, at Step 1.');
  },
};

// ============================================================================
// Controller injected into the wizard (the narrow surface it depends on)
// ============================================================================

const simController = {
  addDimensions() {
    dimensionsRevealed = true;
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
    redraw();
  },

  setArrangement(id, variantId) { showArrangement(id, variantId); },

  /**
   * Hold ANY arrangement beside the current one — `otherId` is whichever the learner picked
   * from the "compare with" list, or null for a single sheet. Only sheet B is rebuilt, and
   * only from its spec list: sheet A's drawing, its reveal animation and the camera are all
   * left exactly as they are, so switching either side is instant and nothing re-animates.
   */
  setCompare(otherId) {
    const other = otherId ? ARRANGEMENTS.find((a) => a.id === otherId) : null;
    if (!other) {
      compareSpecs = null;
      setCompareOffsets(false);
      return;
    }
    compareSpecs = other.build();
    setCompareOffsets(true);
    setSheetNames(other.name, ARRANGEMENTS.find((a) => a.id === currentArrangementId)?.name || null);
    redraw();
  },

  showSymbol(id, variantId) { showSymbol(id, variantId); },

  setView(name) { setView(name); },

  setReviewView(view) { showReview(view); },

  /** The wizard has moved to step `n`: hand it its drawing. */
  enterStep(n) {
    compareSpecs = null;
    setCompareOffsets(false);
    setCallout(null);
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
      case 6: /* painted by the wizard's own setReviewView call */ break;
      default: break;
    }
  },

  completeLesson() {
    showToast('Every fault found — the drawing reads correctly now.');
    announce('Lesson complete. Every fault has been found and corrected.');
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
    setPoseName('front');
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
