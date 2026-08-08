// Orchestrator — Simatrix · Module 4, Topic 1: Introduction to Isometric Drawing.
//
// A conceptual, guided-discovery topic. It builds TWO teaching solids once (src/solidRig.js) — a
// square pyramid for the orthographic half and a cube for the isometric half — then walks the
// learner through six steps that each answer a single question by moving the CAMERA and revealing
// small layers — never by dumping information. Its whole job is to build the mental model that the
// later Isometric Projection / Isometric View topics will teach on. It deliberately teaches NO
// angles, NO isometric scale, and NO construction method.
//
// This file is the conductor: it owns the scene, the camera + OrbitControls, the CSS2D label
// overlay, the cinematic camera flights (via the anim.js tween engine), the ortho "views" sheet,
// the Step-6 transformation demonstration (goFlowStage: views → construction → finished drawing),
// window.simAPI, and the single disposal-safe rebuild() pipeline. The
// scene is built once and the steps toggle visibility / opacity, so rebuild() only ever disposes
// an empty shapeGroup — memory stays flat by construction (RULES.md §3.4).
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (solidRig / stepper / terms /
// onboarding / anim) never import each other; they hang off this file.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { buildSolidRig, SECOND_SOLID_X } from './src/solidRig.js';
import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeCamera, easeStandard } from './src/anim.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded.
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);
function cssVar(name) { return rootStyle.getPropertyValue(name).trim(); }
function cssColor(name) { return new THREE.Color(cssVar(name)); }

// ============================================================================
// Camera poses. Each step flies the camera to one of these, slowly and cinematically
// (never a teleport). The FRONT pose is also the reset default.
// ============================================================================

/** @typedef {{ pos: THREE.Vector3, target: THREE.Vector3 }} Pose */

const HALF_SECOND = SECOND_SOLID_X / 2;

/** The working lens. Every pose uses it unless it says otherwise. */
const BASE_FOV = 45;
/** How much further back the "flattened" isometric pose sits. Higher = closer to a true parallel
 *  projection; 14 lands the receding edges within a fraction of a degree of 30°. */
const FLATTEN_FACTOR = 14;
/** The matching narrow lens, chosen so the object keeps exactly its previous on-screen size:
 *  tan(fov/2) scales with 1/distance. */
const FLAT_FOV = 2 * THREE.MathUtils.radToDeg(
  Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / FLATTEN_FACTOR));

/** @type {Record<string, Pose>} */
const POSES = {
  // Straight down the -Z axis: the pyramid projects as a plain TRIANGLE — the "front view only".
  front: { pos: new THREE.Vector3(0, 0, 7.6), target: new THREE.Vector3(0, 0, 0) },
  // Straight down from above: the same pyramid projects as a SQUARE. The tiny z nudge keeps
  // OrbitControls off its polar singularity (a dead-vertical eye has no defined "up").
  top: { pos: new THREE.Vector3(0, 7.6, 0.02), target: new THREE.Vector3(0, 0, 0) },
  // Straight along -X: a TRIANGLE again, but carrying different information.
  side: { pos: new THREE.Vector3(7.6, 0, 0), target: new THREE.Vector3(0, 0, 0) },
  // A three-quarter pictorial angle for the orthographic + visualization steps.
  threeQuarter: { pos: new THREE.Vector3(5.4, 3.8, 6.6), target: new THREE.Vector3(0, 0, 0) },
  // Equal components → the standard isometric direction (vertical edges stay vertical).
  isometric: { pos: new THREE.Vector3(5.0, 5.0, 5.0), target: new THREE.Vector3(0, 0, 0) },
  // The same direction, but with the PERSPECTIVE FLATTENED OUT: the camera dollies far back while
  // the field of view narrows to match, so the framing is unchanged but the projection becomes
  // effectively parallel. This is not a flourish — a true isometric drawing is a parallel
  // projection, and only in one do the two receding edges actually sit at 30° to the horizontal.
  // Under the normal 45° lens they project at ~36.6°, so the closing "30°" annotation would be
  // labelling something the learner can measure as wrong. Used for the final stage.
  isometricFlat: {
    pos: new THREE.Vector3(5.0, 5.0, 5.0).multiplyScalar(FLATTEN_FACTOR),
    target: new THREE.Vector3(0, 0, 0),
    fov: FLAT_FOV,
    maxD: 400,
  },
  // Framed on BOTH solids for the "two types" split, on the same isometric sight-line but pulled
  // back + raised so the two solids read at a similar size (we do NOT teach a scale difference).
  bothSolids: { pos: new THREE.Vector3(HALF_SECOND + 6.6, 7.2, 8.6), target: new THREE.Vector3(HALF_SECOND, 0.1, 0) },
};

const DEFAULT_POSE = POSES.front;

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let labelRenderer;
let scene;
let camera;
let controls;

/** Persistent teaching geometry (built once). Kept OUT of shapeGroup so rebuild() never disposes
 *  it — the steps only toggle its visibility. */
let rig;

/** Contract-only disposal target (stays empty in this topic). */
let shapeGroup;

let viewport;

/** CSS2D labels, created once and toggled per step. */
const labels = {};

/** Ortho "views" sheet DOM + its per-view groups (Step 2). */
let sheetEl = null;
const sheetViews = {};

/** True only while a camera flight is in progress (blocks orbit + skips damping update). */
let camFlying = false;
let camTween = null;

/** Tracks the on-orbit sheet highlight so we only touch the DOM when the active view changes. */
let activeSheetView = null;

let rafId = null;
let running = false;
let lastFrameTime = 0;

const stateChangeSubs = new Set();
const statusRegion = document.getElementById('sim-status');

let onboarding;
let stepper;

// ============================================================================
// Live-region + viewport-note helpers
// ============================================================================

function announce(message) { if (statusRegion) statusRegion.textContent = message; }

const FLOW_NOTE_HOLD = 4500;
let flowNoteEl = null;
let flowNoteTimer = null;
let flowNoteHideTimer = null;

function flowNote(message) {
  flowNoteEl ??= document.getElementById('vp-flow-note');
  if (!flowNoteEl) return;
  const text = flowNoteEl.querySelector('.vp-note__text');
  if (text) text.textContent = message;
  clearTimeout(flowNoteTimer);
  clearTimeout(flowNoteHideTimer);
  flowNoteEl.hidden = false;
  requestAnimationFrame(() => flowNoteEl.classList.add('is-visible'));
  flowNoteTimer = setTimeout(() => {
    flowNoteEl.classList.remove('is-visible');
    flowNoteHideTimer = setTimeout(() => { flowNoteEl.hidden = true; }, 240);
  }, FLOW_NOTE_HOLD);
}

function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
}

function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) { clearTimeout(window.__simBootTimer); window.__simBootTimer = null; }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
}

// ============================================================================
// rebuild() — the single disposal-safe pipeline (contract-only in this topic).
// The teaching geometry is persistent, so rebuild() disposes an empty shapeGroup and simply
// re-asserts the visible state. This keeps the required single-path + disposal contract intact.
// ============================================================================

function rebuild() {
  for (const obj of shapeGroup.children) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
  notifyStateChange();
}

// ============================================================================
// CSS2D labels
// ============================================================================

/** Build a label DOM node wrapped in a CSS2DObject, placed at a world anchor, hidden by default. */
function makeLabel(text, className, anchor) {
  const el = document.createElement('div');
  el.className = `vp-label ${className}`;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.position.copy(anchor);
  obj.visible = false;
  obj.center.set(0.5, 0.5);
  scene.add(obj);
  return obj;
}

function buildLabels() {
  labels.front = makeLabel('Front', 'vp-label--face', rig.faceAnchors.front);
  labels.top = makeLabel('Top', 'vp-label--face', rig.faceAnchors.top);
  labels.side = makeLabel('Side', 'vp-label--face', rig.faceAnchors.side);
  labels.projection = makeLabel('Isometric Projection', 'vp-label--title', rig.labelAnchors.projection);
  labels.view = makeLabel('Isometric View', 'vp-label--title', rig.labelAnchors.view);
  // Step-6 dimension callouts, pinned at the tips of the three isometric axes (height / width /
  // depth, in the order solidRig builds them). They name the sizes being carried across from the
  // orthographic views — they never state a measurement, so no scale is implied.
  labels.dimH = makeLabel('Height', 'vp-label--dim', rig.axes[0].tip);
  labels.dimW = makeLabel('Width', 'vp-label--dim', rig.axes[1].tip);
  labels.dimD = makeLabel('Depth', 'vp-label--dim', rig.axes[2].tip);
}

const LABEL_KEYS = ['front', 'top', 'side', 'projection', 'view', 'dimH', 'dimW', 'dimD'];

/** How long .vp-label's fade runs — must match --dur-base, after which we drop `visible`. */
const LABEL_FADE_MS = 220;
const labelTimers = {};

/**
 * Show or hide a viewport label. With `animate`, it fades and lifts in/out (the CSS `.is-in`
 * class); the CSS2DObject's `visible` flag is only dropped once the fade-out has finished, so a
 * label can be toggled back and forth without ever snapping.
 * @param {string} key
 * @param {boolean} on
 * @param {{ animate?: boolean }} [opts]
 */
function setLabel(key, on, { animate = false } = {}) {
  const obj = labels[key];
  if (!obj) return;
  const el = obj.element;
  clearTimeout(labelTimers[key]);

  if (on) {
    if (obj.visible && el.classList.contains('is-in')) return; // already shown — don't re-flash
    obj.visible = true;
    if (animate && !prefersReducedMotion) {
      el.classList.remove('is-in');
      // Two frames so the browser has a start value to transition from.
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    } else {
      el.classList.add('is-in');
    }
    return;
  }

  el.classList.remove('is-in');
  if (animate && !prefersReducedMotion) {
    labelTimers[key] = setTimeout(() => { obj.visible = false; }, LABEL_FADE_MS);
  } else {
    obj.visible = false;
  }
}

// ============================================================================
// Ortho "views" sheet (Step 2) + Step-6 flow strip
// ============================================================================

/** Per-solid captions under each view name. Each pairs the direction with the shape it yields. */
const SHEET_HINTS = {
  pyramid: {
    front: 'from the front — a triangle',
    top: 'from above — a square',
    side: 'from the side — a triangle',
  },
  cube: {
    front: 'looking from the front',
    top: 'looking down',
    side: 'looking from the side',
  },
};

function initSheet() {
  sheetEl = document.getElementById('views-sheet');
  if (!sheetEl) return;
  for (const key of ['front', 'top', 'side']) {
    sheetViews[key] = sheetEl.querySelector(`.views-sheet__view[data-view="${key}"]`);
  }
}

/**
 * Show or hide the whole sheet; showing re-triggers its draw-on animation.
 * `layout: true` re-lays the same three squares into a real orthographic arrangement (top above
 * front, side beside it) — used by Step 6, where the sheet is the source of the dimensions.
 * Calling it again for a sheet that is already on screen in the same mode is a no-op, so the
 * draw-on never re-flashes when a stage re-asserts its scene.
 * `solid` picks which shape set the sheet draws — the pyramid's views for Steps 1–3, the cube's
 * for Step 6 — so the drawing sheet always describes the solid actually on screen.
 * @param {boolean} on
 * @param {{ layout?: boolean, solid?: 'pyramid'|'cube' }} [opts]
 */
function showSheet(on, { layout = false, solid = 'pyramid' } = {}) {
  if (!sheetEl) return;
  if (on) {
    const isCube = solid === 'cube';
    if (!sheetEl.hidden
      && sheetEl.classList.contains('is-layout') === layout
      && sheetEl.classList.contains('is-cube') === isCube) return;
    sheetEl.hidden = false;
    sheetEl.classList.toggle('is-layout', layout);
    sheetEl.classList.toggle('is-cube', isCube);
    for (const [key, el] of Object.entries(sheetViews)) {
      const hint = el?.querySelector('.views-sheet__hint');
      if (hint) hint.textContent = SHEET_HINTS[solid][key];
    }
    sheetEl.classList.remove('is-drawn');
    requestAnimationFrame(() => sheetEl.classList.add('is-drawn'));
  } else {
    sheetEl.classList.remove('is-drawn');
    sheetEl.classList.remove('is-layout');
    sheetEl.hidden = true;
    highlightSheetView(null);
  }
}

/** Light up the sheet view the camera currently faces (Two-Cue: the square is boxed AND labelled). */
function highlightSheetView(key) {
  if (key === activeSheetView) return;
  activeSheetView = key;
  for (const [k, el] of Object.entries(sheetViews)) {
    el?.classList.toggle('is-active', k === key);
  }
}

/** Which principal view the camera currently looks along (for the Step-2 highlight). */
function facingView() {
  const dir = new THREE.Vector3().subVectors(controls.target, camera.position);
  const ax = Math.abs(dir.x); const ay = Math.abs(dir.y); const az = Math.abs(dir.z);
  if (ay >= ax && ay >= az) return 'top';   // looking up/down → top view
  if (az >= ax) return 'front';             // looking along Z → front view
  return 'side';                            // looking along X → side view
}

// ============================================================================
// Step 2 — the Front / Top / Side quick views, as a TEACHING instrument.
//
// These are not viewport utilities here. Step 2's whole job is the realisation that "the same
// object looks completely different depending on the direction you look from", and the only
// honest way to reach it is to let the learner LOOK. Each chip flies the camera (slowly, never a
// jump) to that principal direction, lights the matching view on the sheet, and says what the
// pyramid has just become. Clicking the latched chip returns to the pictorial three-quarter
// view; dragging to orbit unlatches too, so the controls never fight the learner.
// ============================================================================

/** Copy for each direction. Each names the projected shape, and the third closes the idea. */
const QUICK_VIEW_TEACH = {
  front: 'From the front, the pyramid appears as a triangle.',
  top: 'From above, the same pyramid appears as a square — the base, with its four sloping edges running to the apex in the middle. Change the direction you look from, and the shape changes completely.',
  side: 'From the side, the pyramid again appears as a triangle — but it is a different view, carrying its own information. Only together do the three views describe the whole object.',
};

let quickViewsEl = null;
/** Which principal view is currently latched (null = free pictorial orbit). */
let latchedView = null;

function initQuickViews() {
  quickViewsEl = document.getElementById('quick-views');
  quickViewsEl?.querySelectorAll('.quick-view').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.view;
      if (latchedView === key) { setLatchedView(null); return; } // click again to step back out
      setLatchedView(key);
    });
  });
}

/** Reflect the latched chip in the DOM (filled chip + aria-pressed — state is never colour alone). */
function markQuickView(key) {
  latchedView = key;
  quickViewsEl?.querySelectorAll('.quick-view').forEach((btn) => {
    const on = btn.dataset.view === key;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

/**
 * Latch a principal view: fly there, light the sheet, and teach what just happened.
 * @param {'front'|'top'|'side'|null} key  null returns to the free pictorial view.
 */
function setLatchedView(key) {
  markQuickView(key);
  if (!key) {
    flyCamera(POSES.threeQuarter, { duration: 1100 });
    announce('Back to the pictorial view. Pick Front, Top or Side to project the pyramid again.');
    return;
  }
  flyCamera(POSES[key], { duration: 1400 });
  highlightSheetView(key);
  flowNote(QUICK_VIEW_TEACH[key]);
  announce(QUICK_VIEW_TEACH[key]);
}

function showQuickViews(on) {
  const cluster = document.getElementById('vp-cluster');
  if (cluster) cluster.hidden = !on;
  if (quickViewsEl) quickViewsEl.hidden = !on;
  if (!on) markQuickView(null);
}

let flowStripEl = null;

function initFlowStrip() {
  flowStripEl = document.getElementById('flow-strip');
  // Each node drives the viewport to its stage — the strip is the learner's transport through
  // the demonstration, not a caption of it.
  flowStripEl?.querySelectorAll('.flow-strip__node').forEach((btn) => {
    btn.addEventListener('click', () => goFlowStage(Number(btn.dataset.stage)));
  });
}

/** Reveal the ortho → construction → isometric chain one node at a time (Step 6). */
function playFlow() {
  if (!flowStripEl) return;
  const nodes = [...flowStripEl.querySelectorAll('.flow-strip__node, .flow-strip__arrow')];
  nodes.forEach((n) => n.classList.remove('is-in'));
  const stepMs = prefersReducedMotion ? 0 : 260;
  nodes.forEach((n, i) => {
    setTimeout(() => n.classList.add('is-in'), i * stepMs);
  });
}

function showFlowStrip(on) {
  if (!flowStripEl) return;
  flowStripEl.hidden = !on;
  if (on) playFlow();
}

// ============================================================================
// Step 6 — the transformation demonstration.
//
// Three stages, driven by the flow-strip buttons:
//   1  Orthographic views   the three flat views, laid out as they sit on a drawing sheet,
//                           beside the 3D cube — "these describe the cube".
//   2  Construction         the solid steps back, the isometric axes are blocked out, and each
//                           dimension callout lights up alongside the view it is read from —
//                           "the orthographic views provide the sizes". Conceptual only: no
//                           construction rules, no measurements, no scale.
//   3  Isometric drawing    the guides and the views fade away; the finished drawing remains.
//
// Every stage is a scheduled sequence, so switching stages mid-flight must abort the one in
// progress. `flowToken` is bumped on entry and every deferred callback checks it — a stale
// timer that survives the clear simply does nothing.
// ============================================================================

let flowStage = 0;
let flowToken = 0;
const flowTimers = [];

/** Live opacity of the main solid (the tween target — three's materials are the source of truth,
 *  this just gives a fade somewhere to start from). */
let cubeOpacity = 1;
let cubeTween = null;

function clearFlowTimers() {
  flowTimers.forEach(clearTimeout);
  flowTimers.length = 0;
}

/** Schedule a beat of the current stage. Ignored if the stage has moved on since. */
function flowBeat(ms, fn) {
  const token = flowToken;
  flowTimers.push(setTimeout(() => { if (token === flowToken) fn(); },
    prefersReducedMotion ? 0 : ms));
}

/** Mark which stage is live on the strip (weight + wash + aria-current — never colour alone). */
function markFlowStage(n) {
  flowStage = n;
  flowStripEl?.querySelectorAll('.flow-strip__node').forEach((btn) => {
    if (Number(btn.dataset.stage) === n) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
}

// ----------------------------------------------------------------------------
// Construction linework. Each guide line and face outline is its own object, so the construction
// can be DRAWN — one line as each measurement lands, then the box closing, then the solid coming
// up one face at a time. Revealing the whole box at once is what made the old version read as a
// morph rather than as someone drawing.
// ----------------------------------------------------------------------------

/** Opacity a construction line settles back to once it is no longer the line being drawn. */
const GUIDE_SETTLED = 0.42;
const guideTweens = new Map();

/** Fade one construction segment to `to`. Cancels any fade already running on it. */
function fadeSeg(seg, to, duration = 520) {
  if (!seg) return;
  guideTweens.get(seg)?.cancel();
  if (to > 0) seg.line.visible = true;
  const handle = tween({
    from: seg.material.opacity, to, duration: prefersReducedMotion ? 0 : duration,
    ease: easeStandard,
    onUpdate: (v) => { seg.material.opacity = v; },
    onComplete: () => {
      if (to <= 0) seg.line.visible = false;
      guideTweens.delete(seg);
    },
  });
  guideTweens.set(seg, handle);
}

/** The three transferred measurements. They settle higher than the box-closing edges, because they
 *  are the answer to "where did this edge come from?" and must stay readable. */
function measuredGuides() { return [rig.guides.width, rig.guides.depth, rig.guides.height]; }
const MEASURED_SETTLED = 0.72;

/** Draw one construction line at full strength, settling every line already on the board back —
 *  so at any moment it is unambiguous which line was just drawn (emphasis by weight, not colour:
 *  the viewport stays ink-only, DESIGN.md Chrome-Only Blue). */
function drawGuide(seg, duration = 620) {
  const measured = measuredGuides();
  rig.guides.all.forEach((other) => {
    if (other === seg || !other.line.visible) return;
    fadeSeg(other, measured.includes(other) ? MEASURED_SETTLED : GUIDE_SETTLED, 400);
  });
  fadeSeg(seg, 1, duration);
}

/** Bring the three isometric axes to `to`. They arrive at full strength to be named, then dim to
 *  faint direction guides so the measured lines drawn ALONG them are what the eye lands on. */
function fadeAxesTo(to, duration = 700) {
  rig.axes.forEach((axis) => {
    if (axis.line.visible) tweenAxisOpacity(axis, to, duration);
  });
}

/** Every construction line and face outline back to nothing. */
function clearConstruction() {
  guideTweens.forEach((t) => t.cancel());
  guideTweens.clear();
  rig.guides.all.forEach((seg) => { seg.line.visible = false; seg.material.opacity = 0; });
  Object.values(rig.faceOutlines).forEach((f) => { f.line.visible = false; f.material.opacity = 0; });
}

/** Fade the finished solid (body + ink edges) toward `to`. */
function fadeCube(to, duration = 640) {
  cubeTween?.cancel();
  cubeTween = tween({
    from: cubeOpacity, to, duration: prefersReducedMotion ? 0 : duration,
    ease: easeStandard,
    onUpdate: (v) => { cubeOpacity = v; rig.setCubeOpacity(v); },
    onComplete: () => { cubeTween = null; },
  });
}

// ----------------------------------------------------------------------------
// Dimension transfer — the screen-space layer that carries a measurement out of a view on the
// drawing sheet and onto an isometric axis.
//
// This is the part of Step 6 that text cannot do. The sheet is DOM and the axes are 3D, so the
// bridge between them is screen space: project the axis midpoint through the camera, measure the
// source view's rect, then fly a small ruled token along a dashed leader from one to the other.
// The camera is parked by the time any transfer runs, so each flight's endpoints are computed
// once at launch and stay true for its duration.
//
// Which view each size is read from is drafting practice, not decoration: the TOP view carries
// width and depth, the FRONT view carries height.
// ----------------------------------------------------------------------------

let transferEl = null;
let leaderEl = null;
let tokenEl = null;
let tokenTextEl = null;
let tokenTween = null;

function initTransferLayer() {
  transferEl = document.getElementById('vp-transfer');
  leaderEl = document.getElementById('vp-leader');
  tokenEl = document.getElementById('vp-token');
  tokenTextEl = tokenEl?.querySelector('.vp-token__text') ?? null;
}

/** Project a world point to viewport pixels. */
function worldToScreen(v) {
  const p = v.clone().project(camera);
  return {
    x: (p.x * 0.5 + 0.5) * viewport.clientWidth,
    y: (-p.y * 0.5 + 0.5) * viewport.clientHeight,
  };
}

/** Centre of a sheet view's drawn shape, in viewport pixels. */
function sheetViewCenter(key) {
  const view = sheetViews[key];
  if (!view || !viewport) return null;
  // Two shape sets live in the markup; measure whichever one is actually laid out. NOTE: test the
  // rect, not `offsetParent` — that property is on HTMLElement, so on an <svg> it reads `undefined`
  // and an `!== null` check would happily pick the display:none shape and measure a zero rect.
  const svg = [...view.querySelectorAll('.views-sheet__svg')]
    .find((s) => s.getBoundingClientRect().width > 0) ?? view;
  const r = svg.getBoundingClientRect();
  const vp = viewport.getBoundingClientRect();
  return { x: r.left - vp.left + r.width / 2, y: r.top - vp.top + r.height / 2 };
}

function showTransferLayer(on) {
  if (!transferEl) return;
  transferEl.hidden = !on;
  if (!on) {
    tokenTween?.cancel(); tokenTween = null;
    if (tokenEl) tokenEl.style.opacity = '0';
    leaderEl?.classList.remove('is-in');
  }
}

/** Draw the dashed leader between two viewport points (a gentle arc, not a hard straight line). */
function drawLeader(from, to, { show = true } = {}) {
  if (!leaderEl) return;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 - Math.abs(to.x - from.x) * 0.12; // slight lift
  leaderEl.setAttribute('d', `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`);
  leaderEl.classList.toggle('is-in', show);
}

/**
 * Fly one measurement from a sheet view onto an isometric axis.
 * @param {'front'|'top'|'side'} fromView   The view the size is read from.
 * @param {number} axisIndex                Which isometric axis it lands on.
 * @param {string} label                    "Width" / "Depth" / "Height".
 * @param {string} dimKey                   The CSS2D label revealed once it lands.
 */
function transferDimension(fromView, axisIndex, label, dimKey) {
  const axis = rig.axes[axisIndex];
  const from = sheetViewCenter(fromView);
  if (!axis || !from || !tokenEl) return;

  showTransferLayer(true);
  highlightSheetView(fromView);

  const mid = rig.axisOrigin.clone().lerp(axis.tip, 0.5);
  const to = worldToScreen(mid);

  drawLeader(from, to);
  if (tokenTextEl) tokenTextEl.textContent = label;

  const place = (k) => {
    const x = from.x + (to.x - from.x) * k;
    const y = from.y + (to.y - from.y) * k;
    tokenEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    // Fade in as it leaves the sheet, fade out as it arrives and hands over to the axis label.
    tokenEl.style.opacity = String(k < 0.12 ? k / 0.12 : k > 0.88 ? (1 - k) / 0.12 : 1);
  };

  place(0);
  tokenTween?.cancel();
  tokenTween = tween({
    from: 0, to: 1, duration: prefersReducedMotion ? 0 : 900, ease: easeStandard,
    onUpdate: place,
    onComplete: () => {
      tokenTween = null;
      tokenEl.style.opacity = '0';
      leaderEl?.classList.remove('is-in');
      // The size has arrived: the axis carries it from here.
      setLabel(dimKey, true, { animate: true });
    },
  });
}

// ----------------------------------------------------------------------------
// The closing annotation: what a standard isometric drawing LOOKS like.
//
// The last thing Step 6 does is name the orientation the learner has been looking at all along —
// one vertical direction, two receding at 30° to the horizontal. It is drawn as drafting
// annotation (thin arcs, small mono callouts, neutral ink), never as UI.
//
// It lives in screen space on purpose: the 30° is an angle in the PROJECTED image, not in 3D.
// Geometry is recomputed each frame from the projected cube corners, so the arcs sit on the real
// edges — and if the learner orbits off the isometric direction the whole group fades out, because
// the 30° is only true from here. That fade is itself the lesson.
//
// Deliberately NOT taught here: isometric scale, foreshortening, the 0.816 factor, construction
// rules, the box method. Those are the next topic.
// ----------------------------------------------------------------------------

/** World corners of the cube the annotation hangs off. */
const ISO_CORNER = new THREE.Vector3(1, -1, 1);   // the near-bottom corner the axes spring from
const ISO_LEFT_END = new THREE.Vector3(-1, -1, 1); // along the left receding edge
const ISO_RIGHT_END = new THREE.Vector3(1, -1, -1); // along the right receding edge
const ISO_TOP_END = new THREE.Vector3(1, 1, 1);   // up the vertical edge

const ISO_ARC_R = 52;      // arc radius, px
const ISO_LABEL_R = 74;    // where the "30°" sits, px from the corner
const ISO_DATUM_HALF = 132; // half-length of the horizontal reference, px

/** How far off the isometric sight-line the camera may drift before the annotation retires. */
const ISO_VIEW_TOLERANCE = Math.cos(THREE.MathUtils.degToRad(14));

const isoEls = {};
let isoAnnotationOn = false;

function initIsoAnnotation() {
  isoEls.group = document.getElementById('iso-annotation');
  isoEls.datum = document.getElementById('iso-datum');
  isoEls.vert = document.getElementById('iso-vert');
  isoEls.arcL = document.getElementById('iso-arc-l');
  isoEls.arcR = document.getElementById('iso-arc-r');
  isoEls.angL = document.getElementById('iso-ang-l');
  isoEls.angR = document.getElementById('iso-ang-r');
}

/** Build the SVG arc between the horizontal ray and an edge ray, both springing from `origin`. */
function isoArcPath(origin, horizontal, edge) {
  const a = { x: origin.x + horizontal.x * ISO_ARC_R, y: origin.y + horizontal.y * ISO_ARC_R };
  const b = { x: origin.x + edge.x * ISO_ARC_R, y: origin.y + edge.y * ISO_ARC_R };
  // Screen y runs down, so a positive cross product means the sweep runs clockwise on screen.
  const cross = horizontal.x * edge.y - horizontal.y * edge.x;
  const sweep = cross > 0 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${ISO_ARC_R} ${ISO_ARC_R} 0 0 ${sweep} ${b.x} ${b.y}`;
}

function unit(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Re-place every piece of the annotation from the live camera. Cheap: four projections. */
function updateIsoAnnotation() {
  if (!isoAnnotationOn || !isoEls.group) return;

  // Retire the annotation if the learner has orbited off the isometric direction — 30° is a
  // property of THIS view, so it must not keep claiming to be true from anywhere else.
  const sight = camera.position.clone().sub(controls.target).normalize();
  const isoDir = new THREE.Vector3(1, 1, 1).normalize();
  isoEls.group.classList.toggle('is-in', sight.dot(isoDir) >= ISO_VIEW_TOLERANCE);

  const o = worldToScreen(ISO_CORNER);
  const l = unit(o, worldToScreen(ISO_LEFT_END));
  const r = unit(o, worldToScreen(ISO_RIGHT_END));
  const v = worldToScreen(ISO_TOP_END);

  // Horizontal reference through the near corner — the datum both angles are measured from.
  isoEls.datum.setAttribute('x1', o.x - ISO_DATUM_HALF);
  isoEls.datum.setAttribute('y1', o.y);
  isoEls.datum.setAttribute('x2', o.x + ISO_DATUM_HALF);
  isoEls.datum.setAttribute('y2', o.y);

  isoEls.vert.setAttribute('x1', o.x); isoEls.vert.setAttribute('y1', o.y);
  isoEls.vert.setAttribute('x2', v.x); isoEls.vert.setAttribute('y2', v.y);

  const hLeft = { x: -1, y: 0 };
  const hRight = { x: 1, y: 0 };
  isoEls.arcL.setAttribute('d', isoArcPath(o, hLeft, l));
  isoEls.arcR.setAttribute('d', isoArcPath(o, hRight, r));

  // Each label sits on the bisector of its arc, just outside it.
  const place = (el, h, e) => {
    const bx = h.x + e.x;
    const by = h.y + e.y;
    const len = Math.hypot(bx, by) || 1;
    el.setAttribute('x', o.x + (bx / len) * ISO_LABEL_R);
    el.setAttribute('y', o.y + (by / len) * ISO_LABEL_R);
  };
  place(isoEls.angL, hLeft, l);
  place(isoEls.angR, hRight, r);
}

/** Reset every piece back to hidden. */
function clearIsoAnnotation() {
  isoAnnotationOn = false;
  isoEls.group?.classList.remove('is-in');
  isoEls.datum?.classList.remove('is-in');
  isoEls.vert?.classList.remove('is-in');
  isoEls.arcL?.classList.remove('is-in');
  isoEls.arcR?.classList.remove('is-in');
  isoEls.angL?.classList.remove('is-in');
  isoEls.angR?.classList.remove('is-in');
}

/**
 * Play the closing annotation, one idea at a time: the horizontal reference, then each angle and
 * its callout, then the vertical edge and the sentence that ties them together.
 */
function playIsoAnnotation() {
  if (!isoEls.group) return;
  clearIsoAnnotation();
  isoAnnotationOn = true;
  showTransferLayer(true);
  updateIsoAnnotation();       // place everything before the group fades in
  isoEls.group.classList.add('is-in');

  flowBeat(300, () => isoEls.datum.classList.add('is-in'));
  flowBeat(1100, () => isoEls.arcL.classList.add('is-in'));
  flowBeat(1800, () => isoEls.angL.classList.add('is-in'));
  flowBeat(2400, () => isoEls.arcR.classList.add('is-in'));
  flowBeat(3100, () => isoEls.angR.classList.add('is-in'));
  flowBeat(3800, () => isoEls.vert.classList.add('is-in'));
  flowBeat(4200, () => {
    flowNote('Vertical edges stay vertical. The other two directions are drawn at 30° to the horizontal.');
    announce('These three directions are the isometric axes: one vertical, and two drawn at 30 '
      + 'degrees to the horizontal. The dimensions taken from the orthographic views are '
      + 'transferred along them to construct the isometric drawing.');
  });
}

/** Take every Step-6 layer back to nothing, so a stage only has to add what it needs. */
function clearFlowScene() {
  cubeTween?.cancel(); cubeTween = null;
  hideAxes();
  ['dimH', 'dimW', 'dimD'].forEach((k) => setLabel(k, false));
  clearConstruction();
  cubeOpacity = 1;
  rig.setCubeOpacity(1);
  highlightSheetView(null);
  showTransferLayer(false);
  clearIsoAnnotation();
  sheetEl?.classList.remove('is-recessed');
}

/**
 * Drive the viewport to one stage of the transformation.
 * @param {1|2|3} n
 */
function goFlowStage(n) {
  flowToken += 1;
  clearFlowTimers();
  clearFlowScene();
  markFlowStage(n);

  if (n === 1) {
    // The three views, laid out as a drawing sheet, beside the solid they describe. Each one
    // lights up in turn with a leader drawn from the solid, so the sheet reads as a record OF
    // this object rather than as decoration beside it.
    showSheet(true, { layout: true, solid: 'cube' });
    flyCamera(POSES.threeQuarter, { duration: 1200 });
    const linkView = (key, anchor) => {
      highlightSheetView(key);
      const to = sheetViewCenter(key);
      if (!to) return;
      showTransferLayer(true);
      drawLeader(worldToScreen(anchor), to);
    };
    flowBeat(1300, () => linkView('front', new THREE.Vector3(0, 0, 1)));
    flowBeat(2200, () => linkView('top', new THREE.Vector3(0, 1, 0)));
    flowBeat(3100, () => linkView('side', new THREE.Vector3(1, 0, 0)));
    flowBeat(4000, () => { highlightSheetView(null); showTransferLayer(false); });
    announce('Stage 1 of 3. Three orthographic views describe the cube: front, top and side. '
      + 'Between them they hold the exact dimensions of the object.');
    return;
  }

  if (n === 2) {
    // The heart of the step, and the one place pace matters more than anything else. The board is
    // cleared to nothing but the axes, then ONE measurement moves at a time, each landing as a
    // construction line the learner can point at:
    //
    //   axes → width (top view) → depth (top view) → height (front view)
    //        → the box closes → front face → top face → side face → the solid
    //
    // The views stay FULLY visible throughout — they are the source being read from, so hiding
    // them would defeat the whole demonstration. Only the non-source views mute, and only while a
    // transfer is running. Nothing else moves during a transfer, and every beat is separated by a
    // real pause. Conceptual throughout: no construction rules, no numbers, no scale.
    showSheet(true, { layout: true, solid: 'cube' });
    flyCamera(POSES.isometric, { duration: 1800 });
    fadeCube(0, 700);   // clear the board: the finished drawing is BUILT, never revealed

    // — the directions we will measure along
    flowBeat(1900, () => {
      revealAxes();
      flowNote('Three isometric axes. Every measurement will be laid off along these.');
    });
    // Once named, the axes step back to faint guides — otherwise their ink weight would hide the
    // measured lines that get drawn along them.
    flowBeat(3500, () => fadeAxesTo(0.26, 800));

    // — one transfer per beat, each followed by its construction line, each followed by a pause
    const transfer = (at, view, axis, label, dimKey, seg, note) => {
      flowBeat(at, () => {
        sheetEl?.classList.add('is-recessed');       // mute the views that are not the source
        transferDimension(view, axis, label, dimKey);
        flowNote(note);
      });
      flowBeat(at + 1250, () => drawGuide(seg));     // it arrives → the construction line is drawn
      flowBeat(at + 2000, () => {                    // pause: the board settles, views come back up
        sheetEl?.classList.remove('is-recessed');
        highlightSheetView(null);
        showTransferLayer(false);
      });
    };
    transfer(4000, 'top', 1, 'Width', 'dimW', rig.guides.width,
      'Width — read from the TOP view.');
    transfer(7000, 'top', 2, 'Depth', 'dimD', rig.guides.depth,
      'Depth — also read from the TOP view.');
    transfer(10000, 'front', 0, 'Height', 'dimH', rig.guides.height,
      'Height — read from the FRONT view.');

    // — the three sizes are on the board, so the guide box can close around them
    flowBeat(13200, () => flowNote('All three sizes are on the board. The guide box closes around them.'));
    rig.guides.rest.forEach((seg, i) => flowBeat(13600 + i * 170, () => fadeSeg(seg, GUIDE_SETTLED, 520)));
    flowBeat(15300, () => {
      rig.guides.rest.forEach((seg) => fadeSeg(seg, GUIDE_SETTLED, 400));
      measuredGuides().forEach((seg) => fadeSeg(seg, MEASURED_SETTLED, 400));
    });

    // — pause, then the object is drawn onto the guides, one face at a time
    flowBeat(16400, () => {
      flowNote('Now the object itself, one face at a time.');
      fadeSeg(rig.faceOutlines.front, 1, 700);
    });
    flowBeat(17600, () => fadeSeg(rig.faceOutlines.top, 1, 700));
    flowBeat(18800, () => fadeSeg(rig.faceOutlines.side, 1, 700));
    flowBeat(20000, () => fadeCube(1, 1100));   // the solid fills in behind its own outline

    announce('Stage 2 of 3. One measurement at a time: width and depth are read from the top view '
      + 'and height from the front view, each drawn as a construction line along its isometric '
      + 'axis. The guide box then closes around them, and the object is drawn one face at a time.');
    return;
  }

  // Stage 3 — the guides go, the drawing stays. The views linger a moment first, so the learner
  // sees the finished drawing standing beside the views it came from before they clear.
  showSheet(true, { layout: true, solid: 'cube' });
  sheetEl?.classList.add('is-recessed');
  // Flattened isometric: a slow dolly back with the lens narrowing to match, so the finished
  // drawing is a genuinely parallel projection — which is what makes its 30° annotation true.
  flyCamera(POSES.isometricFlat, { duration: 1600 });
  // Re-assert the finished construction, so arriving here from Stage 1 still shows what dissolves.
  rig.guides.rest.forEach((seg) => { seg.line.visible = true; seg.material.opacity = GUIDE_SETTLED; });
  measuredGuides().forEach((seg) => { seg.line.visible = true; seg.material.opacity = MEASURED_SETTLED; });
  Object.values(rig.faceOutlines).forEach((f) => { f.line.visible = true; f.material.opacity = 1; });
  rig.axes.forEach((axis) => { axis.line.visible = true; axis.material.opacity = 0.26; });
  ['dimW', 'dimD', 'dimH'].forEach((k) => setLabel(k, true));
  cubeOpacity = 1;
  rig.setCubeOpacity(1);

  flowBeat(600, () => {
    fadeAxesOut(900);
    // The construction lines go, but the face outlines stay — they ARE the finished drawing's
    // linework, and the solid is already behind them.
    rig.guides.all.forEach((seg) => fadeSeg(seg, 0, 900));
    ['dimH', 'dimW', 'dimD'].forEach((k) => setLabel(k, false, { animate: true }));
  });
  flowBeat(1700, () => Object.values(rig.faceOutlines).forEach((f) => fadeSeg(f, 0, 700)));
  flowBeat(2200, () => showSheet(false));
  // With the drawing standing clean, name the orientation it is drawn in — the last idea of the
  // topic, and the one that lets the learner recognise an isometric drawing on sight.
  flowBeat(3000, playIsoAnnotation);
  announce('Stage 3 of 3. The construction fades away and the finished isometric drawing remains. '
    + 'Its dimensions came from the orthographic views; the result is a single three-dimensional '
    + 'pictorial representation of the same object.');
}

// ============================================================================
// Camera flight — slow, cinematic, never a teleport (task requirement).
// ============================================================================

/**
 * Fly the camera from its live pose to `pose` over `duration` ms.
 * @param {Pose} pose
 * @param {{ duration?: number, ease?: (x:number)=>number, onDone?: () => void }} [opts]
 */
function flyCamera(pose, { duration = 1300, ease = easeCamera, onDone } = {}) {
  camTween?.cancel();
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const fromFov = camera.fov;
  const toFov = pose.fov ?? BASE_FOV;
  camFlying = true;
  controls.enabled = false;

  // The orbit distance clamp travels with the pose — the flattened isometric pose sits far outside
  // the normal range, and controls.update() would otherwise yank the camera straight back in.
  controls.minDistance = pose.minD ?? 4;
  controls.maxDistance = pose.maxD ?? 22;

  camTween = tween({
    from: 0, to: 1, duration, ease,
    onUpdate: (k) => {
      camera.position.lerpVectors(fromPos, pose.pos, k);
      controls.target.lerpVectors(fromTarget, pose.target, k);
      camera.lookAt(controls.target);
      // Dolly and lens move together, so the framing holds while the perspective flattens.
      if (fromFov !== toFov) {
        camera.fov = fromFov + (toFov - fromFov) * k;
        camera.updateProjectionMatrix();
      }
    },
    onComplete: () => {
      camera.position.copy(pose.pos);
      controls.target.copy(pose.target);
      camera.fov = toFov;
      camera.updateProjectionMatrix();
      controls.update();
      controls.enabled = true;
      camFlying = false;
      camTween = null;
      onDone?.();
    },
  });
}

// The axes are staggered in and faded out from several places (Step 4, and Step 6's construction
// stage), so each axis owns at most one live tween and one live timer. `axisToken` invalidates
// timers that a stage change has outrun — without it a stale stagger would fade an axis back up
// after the scene had already been cleared.
const axisTweens = new Map();
const axisTimers = [];
let axisToken = 0;

function tweenAxisOpacity(axis, to, duration) {
  axisTweens.get(axis)?.cancel();
  const handle = tween({
    from: axis.material.opacity, to,
    duration: prefersReducedMotion ? 0 : duration, ease: easeStandard,
    onUpdate: (o) => { axis.material.opacity = o; },
    onComplete: () => {
      if (to <= 0) axis.line.visible = false;
      axisTweens.delete(axis);
    },
  });
  axisTweens.set(axis, handle);
}

/** Fade the three isometric axes in, one after another (Step 4, and Step 6's construction). */
function revealAxes() {
  const token = ++axisToken;
  const stagger = prefersReducedMotion ? 0 : 320;
  rig.axes.forEach((axis, i) => {
    axis.line.visible = true;
    axisTimers.push(setTimeout(() => {
      if (token !== axisToken) return; // the scene moved on
      tweenAxisOpacity(axis, 1, 460);
    }, i * stagger));
  });
}

/** Fade the three axes away together — they arrive one at a time, they leave as one (Step 6). */
function fadeAxesOut(duration = 420) {
  axisToken += 1;
  rig.axes.forEach((axis) => {
    if (axis.line.visible) tweenAxisOpacity(axis, 0, duration);
  });
}

function hideAxes() {
  axisToken += 1;
  axisTimers.forEach(clearTimeout);
  axisTimers.length = 0;
  rig.axes.forEach((axis) => {
    axisTweens.get(axis)?.cancel();
    axisTweens.delete(axis);
    axis.line.visible = false;
    axis.material.opacity = 0;
  });
}

// ============================================================================
// The two teaching solids.
//
// Steps 1–3 teach on a SQUARE PYRAMID (its three views are unmistakably different, which is the
// whole point of those steps); Steps 4–6 teach on a CUBE (its principal edges lie along the three
// isometric axes, so the isometric position needs no explaining). The handover at Step 4 is a
// taught moment, so it CROSS-FADES rather than swapping: the pyramid dissolves out while the cube
// dissolves in, with a short overlap, and the learner is told why in the same beat. Under reduced
// motion the state still lands — instantly, as everywhere else.
// ============================================================================

/** @type {'pyramid'|'cube'} */
let activeSolid = 'pyramid';
let pyramidFade = null;
let cubeFade = null;
let solidSwapTimer = null;

const SOLID_FADE_MS = 620;
/** How long the cube waits before dissolving in — a short overlap reads as one exchange. */
const SOLID_SWAP_OVERLAP_MS = 300;

/**
 * Put one of the two solids on stage.
 * @param {'pyramid'|'cube'} which
 * @param {{ animate?: boolean }} [opts]  animate cross-fades; otherwise the state snaps.
 */
function setActiveSolid(which, { animate = false } = {}) {
  pyramidFade?.cancel(); pyramidFade = null;
  cubeFade?.cancel(); cubeFade = null;
  clearTimeout(solidSwapTimer);

  const wasPyramid = activeSolid === 'pyramid';
  activeSolid = which;
  const toPyramid = which === 'pyramid' ? 1 : 0;
  const toCube = which === 'cube' ? 1 : 0;

  if (!animate || prefersReducedMotion || wasPyramid === (which === 'pyramid')) {
    rig.setPyramidOpacity(toPyramid);
    rig.setCubeOpacity(toCube);
    cubeOpacity = toCube;
    return;
  }

  // Outgoing solid dissolves first…
  pyramidFade = tween({
    from: wasPyramid ? 1 : 0, to: toPyramid, duration: SOLID_FADE_MS, ease: easeStandard,
    onUpdate: (v) => rig.setPyramidOpacity(v),
    onComplete: () => { pyramidFade = null; },
  });
  // …and the incoming one arrives just before it has fully gone.
  solidSwapTimer = setTimeout(() => {
    cubeFade = tween({
      from: wasPyramid ? 0 : 1, to: toCube, duration: SOLID_FADE_MS, ease: easeStandard,
      onUpdate: (v) => { cubeOpacity = v; rig.setCubeOpacity(v); },
      onComplete: () => { cubeFade = null; },
    });
  }, SOLID_SWAP_OVERLAP_MS);
}

// ============================================================================
// Scene controller — enterStep(n) drives the scene into each step's state.
// Idempotent: rail jumps and Back/Next all route here, so calling it twice is safe.
// ============================================================================

function resetSceneLayers() {
  flowToken += 1;      // abandon any Step-6 sequence still in flight
  clearFlowTimers();
  clearFlowScene();
  markFlowStage(0);
  LABEL_KEYS.forEach((k) => setLabel(k, false));
  setFacesShown(false, { animate: false });
  rig.cubeB.visible = false;
  hideAxes();
  showSheet(false);
  showQuickViews(false);
  showFlowStrip(false);
}

function enterStep(n) {
  const cameFromOrthoHalf = activeSolid === 'pyramid';
  resetSceneLayers();

  // Steps 1–3 teach on the pyramid, 4–6 on the cube. Moving forward across that seam cross-fades
  // (a taught handover); arriving any other way just lands on the right solid.
  const wantSolid = n <= 3 ? 'pyramid' : 'cube';
  const isTaughtHandover = n === 4 && cameFromOrthoHalf;
  setActiveSolid(wantSolid, { animate: isTaughtHandover });

  switch (n) {
    case 1: // Why another method — the pyramid reads as a single flat triangle, front-on.
      flyCamera(POSES.front, { duration: 1100 });
      setLabel('front', true, { animate: true }); // the one view we start with
      announce('A square pyramid seen straight from the front looks like a plain triangle. '
        + 'Drag to rotate it.');
      break;

    case 2: // Orthographic projection — the solid, the three views, and the chips to LOOK with.
      flyCamera(POSES.threeQuarter, { duration: 1200, onDone: () => showSheet(true) });
      if (prefersReducedMotion) showSheet(true);
      showQuickViews(true);
      announce('Use the Front, Top and Side buttons to look at the pyramid from each direction '
        + 'and watch what it projects as.');
      break;

    case 3: // Visualizing — hide the views, keep the single 3D picture.
      flyCamera(POSES.threeQuarter, { duration: 900 });
      break;

    case 4: // Isometric position — hand over to the cube, swing to isometric, axes fade in.
      flyCamera(POSES.isometric, {
        duration: prefersReducedMotion ? 0 : 1700,
        onDone: revealAxes,
      });
      if (prefersReducedMotion) revealAxes();
      if (isTaughtHandover) {
        flowNote('We switch to a cube here: its edges run along the three isometric axes, '
          + 'so the isometric position is easy to see.');
        announce('The pyramid gives way to a cube. Its three principal edges run along the three '
          + 'isometric axes, which makes the isometric position easy to see.');
      }
      break;

    case 5: // Two types — two labelled cubes side by side.
      rig.cubeB.visible = true;
      setLabel('projection', true, { animate: true });
      setLabel('view', true, { animate: true });
      flyCamera(POSES.bothSolids, { duration: 1300 });
      break;

    case 6: // Connecting — the transformation, watched rather than read (goFlowStage owns it).
      showFlowStrip(true);
      goFlowStage(1);
      break;
  }
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  // near lifted off 0.1 and far pushed out: the flattened isometric pose sits ~120 units back,
  // and a tighter near/far ratio keeps depth precision good enough to avoid z-fighting there.
  camera = new THREE.PerspectiveCamera(BASE_FOV, (w || 1) / (h || 1), 0.5, 400);
  camera.position.copy(DEFAULT_POSE.pos);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild();
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Flat CAD lighting — ambient fill + one low directional, no shadows (RULES.md §3.24).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  scene.add(key);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // The teaching solids, built once. Line materials need the live drawing-buffer size.
  const bufferW = renderer.domElement.width;
  const bufferH = renderer.domElement.height;
  rig = buildSolidRig(bufferW, bufferH);
  scene.add(rig.group);

  // CSS2D label overlay — a transparent DOM layer sized to the canvas; pointer-events off so
  // drag-to-orbit passes through (RULES.md §3.27: labels are live DOM, not baked sprites).
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);
  buildLabels();

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_POSE.target);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 22;
  // A manual drag means the learner has taken the camera back, so drop the latched chip rather
  // than leaving it claiming a view they have already orbited away from. (Camera flights disable
  // the controls, so this never fires from our own motion.)
  controls.addEventListener('start', () => { if (latchedView) markQuickView(null); });
  controls.update();
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);
  if (!camFlying) controls.update();


  // The closing 30° annotation is screen-space, so it re-places itself as the camera moves.
  if (isoAnnotationOn) updateIsoAnnotation();

  // Step 2: as the learner orbits, light up the ortho view they are looking along.
  if (stepper && stepper.step() === 2 && !sheetEl?.hidden) {
    highlightSheetView(facingView());
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

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);
  rig?.setResolution(renderer.domElement.width, renderer.domElement.height);
}

// ============================================================================
// Mobile advisory — banner only, never blocks the sim.
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
// Wizard hide/show
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');
    requestAnimationFrame(() => handleResize(viewport));
  });
}

// ============================================================================
// Reset two-state confirm (guards the ghost Reset — RULES.md §4.19)
// ============================================================================

function setupResetControl() {
  const control = document.getElementById('reset-control');
  const btnReset = document.getElementById('btn-reset');
  const confirm = document.getElementById('reset-confirm');
  const btnYes = document.getElementById('btn-reset-yes');
  const btnCancel = document.getElementById('btn-reset-cancel');
  const nav = document.querySelector('.card__nav');
  if (!btnReset || !confirm) return;

  const arm = (on) => {
    btnReset.hidden = on;
    confirm.hidden = !on;
    nav?.classList.toggle('is-reset-armed', on);
    control?.classList.toggle('is-armed', on);
  };
  btnReset.addEventListener('click', () => arm(true));
  btnCancel?.addEventListener('click', () => arm(false));
  btnYes?.addEventListener('click', () => { arm(false); window.simAPI.reset(); });
}

// ============================================================================
// Per-step action buttons (each step's single reveal control)
// ============================================================================

/** Step 1's single toggle: "front view only" ⇄ "front + top + side". Repeatable on purpose —
 *  the comparison is what teaches, so the learner can flip back and forth as often as they like. */
let facesShown = false;

function setFacesShown(on, { animate = true } = {}) {
  facesShown = on;
  setLabel('top', on, { animate });
  setLabel('side', on, { animate });
  const btn = document.getElementById('act-toggle-faces');
  if (btn) {
    btn.textContent = on ? 'Hide top & side' : 'Show top & side';
    btn.setAttribute('aria-pressed', String(on));
  }
}

function setupStepActions() {
  // Step 1: one button, both directions.
  document.getElementById('act-toggle-faces')?.addEventListener('click', () => {
    setFacesShown(!facesShown);
    if (facesShown) {
      onboarding?.cue?.('One view cannot show the top and side — that is why more views exist.', 'ink');
      announce('Top and side faces labelled. A single front view cannot describe them.');
    } else {
      announce('Top and side hidden. Back to the front view alone.');
    }
  });

  // Step 6: run the transformation from the beginning.
  document.getElementById('act-play-flow')?.addEventListener('click', () => {
    showFlowStrip(true);
    goFlowStage(1);
  });
}

// ============================================================================
// Platform API
// ============================================================================

window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    camTween = null;
    camFlying = false;
    controls.enabled = true;
    camera.position.copy(DEFAULT_POSE.pos);
    controls.target.copy(DEFAULT_POSE.target);
    controls.update();
    resetSceneLayers(); // also re-arms the Step-1 toggle and abandons any Step-6 sequence
    rebuild();
    stepper?.reset();  // wizard + scene back to Step 1
    announce('Simulation reset.');
  },
};

// ============================================================================
// UI controller injected into the leaf modules.
// ============================================================================

const simController = {
  enterStep,
  announce,
  flowNote,
  cueHint(text) { onboarding?.cue?.(text, 'ink'); },
  reset() { window.simAPI.reset(); },
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
};

// ============================================================================
// Self-start
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
    initSheet();
    initQuickViews();
    initTransferLayer();
    initIsoAnnotation();
    initFlowStrip();
    setupMobileNotice();
    setupWizardToggle();
    setupResetControl();
    setupStepActions();
    initTerms();
    onboarding = initOnboarding(controls);
    onboarding.setSolidPresent(true); // the solid is present from the first step

    stepper = initStepper(simController); // drives enterStep(1) on init

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Re-render once fonts are ready so CSS2D labels don't paint in a fallback face (RULES.md §3.26).
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => { if (labelRenderer) labelRenderer.render(scene, camera); });
  }

  markBooted();
}

init();
