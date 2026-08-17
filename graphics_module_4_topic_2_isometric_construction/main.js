// Orchestrator — Simatrix · Module 4, Topic 2: How to Construct an Isometric Drawing.
//
// Topic 1 answered "what IS an isometric drawing?". This topic answers "how is one BUILT?" — and it
// answers it as a PROCESS, not as a set of steps to memorise. The learner picks any of ten solids,
// gives it real dimensions, reads its three orthographic views, then watches the same four-phase
// construction produce it: axes → bounding box → shape → finished drawing. Because the phases are
// identical for every solid and only Phase C's contents change, the transferable idea is the ORDER,
// which is exactly what a student needs to construct a solid they have never seen before.
//
// This file is the conductor. It owns:
//   • the scene, the perspective camera + OrbitControls, and the CSS2D label overlay
//   • the single disposal-safe `rebuild()` pipeline — the ONLY path geometry changes through
//     (RULES.md §3.1/§3.2/§3.3), so a rapid slider drag can never leak a GL resource
//   • the scene controller `enterStep(n)` and the Step-4 phase controller `goPhase(id)`
//   • `window.simAPI`
//
// It owns no linework maths, no solid definitions, no step copy, no label offsets and no timing
// tables — those live in the leaves, which never import each other (RULES.md §3.6). The stateless
// utils `shapeData` and `tokens` are the documented §3.6a carve-out.
//
// Every camera move is an eased flight, never a teleport (cameraRig.js). Everything collapses to
// instant under `prefers-reduced-motion`, but the state still lands (RULES.md §4.13).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { SOLIDS, getSolid, defaultDims, toWorld, ISOMETRIC_SCALE, resolveDims } from './src/shapeData.js';
import {
  buildCombination, defaultCombination, defaultCombinationDims, MIN_PARTS, MAX_PARTS,
} from './src/combinationBuilder.js';
import { DEFAULT_PROBLEM_ID } from './src/problemLibrary.js';
import {
  resolveProblem, problemSubject, problemDims, initialFormMode,
} from './src/problemBuilder.js';
import { checkProblem } from './src/problemCheck.js';
import { buildShape } from './src/shapeFactory.js';
import { buildConstruction } from './src/constructionEngine.js';
import { buildDimensions } from './src/dimensionLayer.js';
import { initOrthoSheet } from './src/orthographicDrawer.js';
import { initIsoAngles } from './src/isoAngles.js';
import { initTransferLayer } from './src/transferLayer.js';
import { initCameraRig } from './src/cameraRig.js';
import { initLabelLayer, PLACEMENT } from './src/labelLayer.js';
import { initUIManager } from './src/uiManager.js';
import { initStepper } from './src/stepper.js';
import { getPhase } from './src/constructionSteps.js';
import { createSequencer, SUMMARY_TIMING, SUMMARY_CHAIN } from './src/summaryAnimator.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeStandard } from './src/anim.js';
import { cssColor } from './src/tokens.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let labelRenderer;
let scene;
let camera;
let controls;
let viewport;

/** The one disposal target. Every piece of per-solid geometry hangs off this group, so `rebuild()`
 *  has a single place to empty (RULES.md §3.3). */
let shapeGroup;

/** Live rigs, all rebuilt together and disposed together. */
let shape = null;          // the finished solid (body + ink edges + silhouettes)
let construction = null;   // axes + bounding box + construction stages + face highlights
let dimensions = null;     // the Type-B dimension assemblies (extension + dimension lines + arrows)

let orthoSheet;
let cameraRig;
let labels;
let ui;
let stepper;
let onboarding;
let sequencer;
let isoAngles;             // Phase A's two 30° arcs
let transfers;             // Phase B's view → axis dimension carrier

/** Learner-owned state. Everything visible is derived from this and the current step. */
const state = {
  /**
   * What the learner is constructing: one solid, a COMBINATION of them (§16.8), or a textbook
   * PROBLEM from the library.
   *
   * All three are source configuration — the composed subject, its bounds and its geometry are all
   * derived from it on demand and none of them is ever stored (RULES.md §3.35's rule, applied to the
   * subject rather than to the dimensions). A problem is not a fourth kind of thing: it resolves to
   * one of the first two (`problemBuilder.js`).
   */
  mode: 'single',
  solidId: SOLIDS[0].id,
  /** The combination, ordered BOTTOM FIRST. Only read while `mode === 'combination'`. */
  combo: defaultCombination(),
  /** The library problem. Only read while `mode === 'problem'`. */
  problemId: DEFAULT_PROBLEM_ID,
  dims: defaultDims(SOLIDS[0]),
  /**
   * Dimensions the learner has declared UNKNOWN, key → true. A problem that gives only a base
   * diameter and a height is the ordinary case, not an edge case, so the sim has to be able to hold
   * "this size is not stated" as a real state (see `resolveDims` in shapeData.js).
   */
  unspecified: {},
  /** Step 4's live phase id, or null when Step 4 is not on screen. */
  phase: null,
  /** Step 5's live form: `view` (true lengths) or `projection` (the isometric scale). */
  formMode: 'view',
  /** Step 6's live chain link, or null. */
  chain: null,
};

/**
 * THE SUBJECT the whole sim is describing — one solid from the registry, or the synthetic solid a
 * combination composes to (`combinationBuilder.js`).
 *
 * Both satisfy the SAME contract `shapeData.js` documents, which is the whole of what makes
 * combination support an extension rather than a second pipeline: every consumer below this line
 * asks for a solid and gets one, and none of them learns which kind it was.
 *
 * Cached on the configuration that produces it, because a subject is asked for several times per
 * rebuild and a combination composes closures each time it is built.
 */
let subjectCache = { key: null, solid: null };

function currentSolid() {
  const key = { combination: `c:${state.combo.map((p) => p.solidId).join('+')}`, problem: `p:${state.problemId}` }[state.mode]
    ?? `s:${state.solidId}`;
  if (subjectCache.key !== key) {
    const solid = {
      combination: () => buildCombination(state.combo),
      // A problem resolves to a solid or to a combination — never to a third kind of subject.
      problem: () => problemSubject(currentProblem()),
    }[state.mode]?.() ?? getSolid(state.solidId);
    subjectCache = { key, solid };
  }
  return subjectCache.solid;
}

/** The library problem on screen, or `null` when the learner is in free practice. */
function currentProblem() {
  return state.mode === 'problem' ? resolveProblem(state.problemId) : null;
}

/** Which free-practice mode to return to when a problem is closed. */
let freeMode = 'single';

// ============================================================================
// The live problem check.
//
// The learner's work is judged by Topic 3's validator, unchanged (`answerValidator.js`), against
// Topic 2's live state adapted into the shape it reads (`problemCheck.js`). It runs on the STATE
// CHANGES it depends on and nowhere else — no polling, no per-frame work, no geometry rebuilt to
// check anything. The whole check is a pure computation over numbers this module already has.
//
// PROGRESS is the one thing the check needs that the drawing does not: which phases have been
// worked, and which construction stages have actually been drawn. Both are recorded as they happen
// and cleared when the subject changes, because they describe THIS attempt at THIS problem.
// ============================================================================

/** Phases reached, in the order they were reached. `checkConstructionOrder` reads the order. */
let phasesDone = [];
/** Construction stage ids actually drawn (Phase C reveals them one at a time). */
let stagesDone = new Set();

function resetProgress() {
  phasesDone = [];
  stagesDone = new Set();
}

/** Re-run the check and hand the result to the dock. Cheap, pure, and safe to call often. */
function runProblemCheck() {
  const problem = currentProblem();
  if (!problem) { ui?.renderCheck?.(null); return; }
  const result = checkProblem(problem, currentSolid(), currentDims(), state.formMode, {
    phasesDone,
    stagesDone: [...stagesDone],
  });
  ui?.renderCheck?.(result);
}

/** Is a library problem on screen? The one test every free-practice control is guarded by. */
function problemLoaded() { return state.mode === 'problem'; }

/** Drop the cached subject. Called whenever the configuration that produced it changes. */
function invalidateSubject() { subjectCache = { key: null, solid: null }; }

/**
 * The dimension set the GEOMETRY is built from: the learner's numbers, with any dimension they left
 * unspecified filled in by its own demonstration value. Everything that touches geometry asks
 * through here, so no consumer has to know a value was withheld.
 */
function currentDims() {
  return resolveDims(currentSolid(), state.dims, state.unspecified);
}

/**
 * Re-key the dimension set onto whatever the subject now is, keeping every value the new subject
 * still has a field for.
 *
 * A combination's keys are namespaced per component (`p0_edge`), so they never collide with a single
 * solid's — which means switching mode back and forth keeps BOTH sets of numbers, and changing one
 * component of a combination leaves the others exactly as the learner set them.
 */
function reconcileDims() {
  const solid = currentSolid();
  // A PROBLEM states its own sizes, and those stated sizes ARE the given data — so they replace the
  // set outright rather than inheriting whatever the learner last dialled. Reading them is the
  // second step of the solve, not the sim filling an answer in (RULES.md §6.2's distinction).
  if (state.mode === 'problem') {
    state.dims = problemDims(currentProblem());
    state.unspecified = {};
    return;
  }
  const next = state.mode === 'combination'
    ? defaultCombinationDims(state.combo)
    : defaultDims(solid);
  for (const f of solid.dims) {
    if (state.dims[f.key] != null) next[f.key] = state.dims[f.key];
  }
  state.dims = next;
  // A withheld dimension belongs to a field; drop the flag when the field goes.
  const keys = new Set(solid.dims.map((f) => f.key));
  for (const key of Object.keys(state.unspecified)) {
    if (!keys.has(key)) delete state.unspecified[key];
  }
}

let rafId = null;
let running = false;
let lastFrameTime = 0;

const stateChangeSubs = new Set();
const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Live-region + viewport-note helpers (identical roles to Topic 1)
// ============================================================================

function announce(message) { if (statusRegion) statusRegion.textContent = message; }

const FLOW_NOTE_HOLD = 4500;
let flowNoteEl = null;
let flowNoteTimer = null;
let flowNoteHideTimer = null;

/** A brief accent-wash note floated over the viewport, in step with something the learner just saw
 *  happen. aria-hidden — `#sim-status` already narrates it, so this must not double-announce. */
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

/** Pull the note down now. A note describes something the learner just watched happen, so after a
 *  reset — when none of it happened any more — leaving it up would be describing a scene that is
 *  gone. */
function clearFlowNote() {
  clearTimeout(flowNoteTimer);
  clearTimeout(flowNoteHideTimer);
  flowNoteEl ??= document.getElementById('vp-flow-note');
  if (!flowNoteEl) return;
  flowNoteEl.classList.remove('is-visible');
  flowNoteEl.hidden = true;
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
// Tween bookkeeping — one live tween per animated target, cancelled before it is replaced.
// ============================================================================

/** @type {Map<object, {cancel:()=>void}>} */
const liveTweens = new Map();

function animateValue(key, from, to, duration, onUpdate, onComplete) {
  liveTweens.get(key)?.cancel();
  const handle = tween({
    from,
    to,
    duration: prefersReducedMotion ? 0 : duration,
    ease: easeStandard,
    onUpdate,
    onComplete: () => { liveTweens.delete(key); onComplete?.(); },
  });
  liveTweens.set(key, handle);
  return handle;
}

function cancelAllTweens() {
  for (const h of liveTweens.values()) h.cancel();
  liveTweens.clear();
}

/** Fade a `LineMaterial` / `MeshBasicMaterial` opacity, dropping the object out of the draw at 0. */
function fadeMaterial(material, object, to, duration = 480) {
  if (to > 0 && object) object.visible = true;
  animateValue(material, material.opacity, to, duration,
    (v) => { material.opacity = v; },
    () => { if (to <= 0 && object) object.visible = false; });
}

/**
 * Show or hide ONE dimension — its linework, its arrowheads and its value together.
 *
 * They are three objects but one statement, so nothing may reveal a value without the dimension
 * line that gives it a span, or leave linework standing with no value on it.
 */
function setDim(key, on, { animate = false } = {}) {
  labels.set(key, on, { animate });
  const item = dimensions?.items.find((i) => i.key === key);
  if (!item) return;
  // Tracked because the figure title has to hang clear of the DRAWING, and a dimension written
  // above the solid (a frustum's top diameter) is part of the drawing while it is on screen.
  if (on) visibleDims.add(key);
  else visibleDims.delete(key);
  item.materials.forEach((m, i) => fadeMaterial(m, item.objects[i], on ? 1 : 0, animate ? 420 : 0));
}

/** Every dimension on the drawing at once — box edges plus whatever extras the solid declared. */
function setAllDims(on, opts) {
  for (const key of allDimKeys()) setDim(key, on, opts);
}

/** Grow (or retract) a group that is anchored at the construction origin — the "drawing out of the
 *  corner" motion Phase A and Phase B are both built on (see constructionEngine's growth trick). */
function growGroup(group, to, duration = 620) {
  const from = group.scale.x;
  animateValue(group, from, Math.max(to, 0.0001), duration, (v) => group.scale.setScalar(v));
}

// ============================================================================
// rebuild() — THE single geometry pipeline.
//
// Fixed order: dispose → resolve data → generate solid → generate construction → place labels →
// draw the orthographic sheet → reframe the camera → re-assert the current step → notify.
// Every control routes here; nothing else touches the scene graph (RULES.md §3.1/§3.2).
// ============================================================================

function resolution() {
  return new THREE.Vector2(renderer.domElement.width, renderer.domElement.height);
}

function disposeScene() {
  // Rigs own their own geometries, materials and CSS2D DOM nodes and free them here — the full
  // disposal contract (RULES.md §3.3/§3.5). `renderer.info.memory` must stay flat across repeated
  // rebuilds (§3.4).
  dimensions?.dispose(); dimensions = null;
  construction?.dispose(); construction = null;
  shape?.dispose(); shape = null;
  labels?.clearAll();
  for (const obj of [...shapeGroup.children]) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
}

/**
 * The three overall-size labels, written against the three box edges that spring from the origin
 * corner — the exact edges Phase B transfers the sizes onto.
 *
 * They are written in ENGINEERING NOTATION (`L 70 mm`, `ØD 60 mm`), the symbol coming from the
 * solid's own data via the axis it belongs to. A drawing does not say "Width"; neither does this.
 * The world anchors are kept in `dimAnchors` so Phase B's transfer can fly a token to exactly the
 * point the callout is about to appear at, rather than to an independently-derived guess.
 */
const dimAnchors = new Map();

/** Dimension keys currently on screen. Maintained by `setDim`, read by the figure-title placement. */
const visibleDims = new Set();

/** Box-edge key → the key of the dimension that actually carries it (see the dedup in
 *  `buildDimensionAnnotations`). A size that repeats is drawn once and pointed at from both edges. */
const dimAlias = new Map();

/**
 * Which box edge each dimension measures, which orthographic view its size is read FROM, and which
 * way it is pushed clear of the drawing.
 *
 * Every push is along an isometric direction, so the three land in three different planes — width
 * out the front, depth out the side, height off the near vertical corner. That is both the drafting
 * convention for a pictorial and the reason they can never overlap each other or the solid.
 */
const DIM_SOURCES = [
  {
    labelKey: 'dimWidth', axisKey: 'width', view: 'front',
    edge: (hw, hd) => [new THREE.Vector3(hw, 0, hd), new THREE.Vector3(-hw, 0, hd)],
    push: new THREE.Vector3(0, 0, 1),
  },
  {
    labelKey: 'dimDepth', axisKey: 'depth', view: 'top',
    edge: (hw, hd) => [new THREE.Vector3(hw, 0, hd), new THREE.Vector3(hw, 0, -hd)],
    push: new THREE.Vector3(1, 0, 0),
  },
  {
    // NOT the near corner the axes spring from. That corner is the closest point of the solid, so
    // no horizontal push moves a dimension off it — every direction slides ALONG the silhouette
    // instead of away from it, and the dimension lands on the face. The LEFT silhouette edge is
    // the outermost vertical from both the three-quarter and the isometric viewpoint, so a push
    // straight out along −x clears the drawing in either one. It is the same height either way.
    labelKey: 'dimHeight', axisKey: 'height', view: 'side',
    edge: (hw, hd, h) => [new THREE.Vector3(-hw, 0, hd), new THREE.Vector3(-hw, h, hd)],
    push: new THREE.Vector3(-1, 0, 0),
  },
];

const DIM_KEYS = DIM_SOURCES.map((s) => s.labelKey);

/** Every dimension currently on the drawing, box edges and any extras the solid declared. */
function allDimKeys() {
  return dimensions ? dimensions.items.map((i) => i.key) : DIM_KEYS;
}

/**
 * Build the dimensioned drawing: the three box-edge dimensions, any extra size the solid declares
 * that the box cannot carry (a frustum's top diameter), the figure title, and the Step-3 view names.
 *
 * The dimension LINEWORK is built by `dimensionLayer.js` and the value labels by `labelLayer.js`,
 * from the same anchors — so a value can never drift off the dimension line it belongs to.
 */
function buildDimensionAnnotations(solid) {
  const { bounds } = construction;
  const hw = toWorld(bounds.width) / 2;
  const hd = toWorld(bounds.depth) / 2;
  const h = toWorld(bounds.height);

  // ONE dimension per distinct size. A cylinder's box is square in plan, so its width and its depth
  // are the same diameter — and a drawing states a diameter once, not twice on facing edges. Where
  // a size repeats, the later edge is not drawn and is ALIASED to the one that carries it, so
  // Phase B can still transfer all three overall sizes and simply land two of them on the same
  // annotation. That is not a fudge: it is the fact that the width and the depth ARE one diameter.
  const specs = [];
  const seen = new Map();
  dimAlias.clear();
  for (const src of DIM_SOURCES) {
    const axis = construction.axes.find((a) => a.key === src.axisKey);
    if (!axis) continue;
    const value = round(bounds[src.axisKey]);
    const signature = `${axis.symbol}|${value}`;
    const existing = seen.get(signature);
    if (existing) { dimAlias.set(src.labelKey, existing); continue; }

    seen.set(signature, src.labelKey);
    dimAlias.set(src.labelKey, src.labelKey);
    const [a, b] = src.edge(hw, hd, h);
    specs.push({
      key: src.labelKey,
      symbol: axis.symbol,
      text: `${axis.symbol} ${value} mm`,
      a,
      b,
      push: src.push,
    });
  }

  // Extras are DATA on the solid, so this loop never learns which solid it is dimensioning.
  const extras = solid.extraDims?.(currentDims()) ?? [];
  extras.forEach((ex, i) => {
    const mm = (p) => new THREE.Vector3(toWorld(p[0]), toWorld(p[1]), toWorld(p[2]));
    const a = mm(ex.from); const b = mm(ex.to);
    specs.push({
      key: `dimExtra${i}`,
      symbol: ex.symbol,
      text: `${ex.symbol} ${round(a.distanceTo(b) * 10)} mm`,
      a,
      b,
      push: new THREE.Vector3(...ex.push),
    });
  });

  dimensions = buildDimensions({ specs, resolution: resolution() });
  shapeGroup.add(dimensions.group);

  dimAnchors.clear();
  for (const item of dimensions.items) {
    dimAnchors.set(item.key, item.anchor);
    labels.make(item.key, item.text, 'vp-label--dim', item.anchor);
  }

  // The solid's own name — a FIGURE TITLE, hung clear of the whole drawing rather than perched on
  // the nearest edge, at a clearance derived from what this solid actually projects (labelLayer).
  labels.make('title', solid.name, 'vp-label--title',
    labels.placeFigureTitle(h));

  // View names, pinned on the face each one looks at (Step 3).
  for (const [key, faceKey, text] of [
    ['viewFront', 'front', 'Front View'],
    ['viewTop', 'top', 'Top View'],
    ['viewSide', 'side', 'Side View'],
  ]) {
    const face = construction.faces[faceKey];
    if (face) labels.make(key, text, 'vp-label--face', face.center.clone());
  }
}

function round(v) { return Math.round(v * 10) / 10; }

/** Half-diagonal of the current solid, used to frame the camera without an auto-zoom chasing it. */
function contentFocus() {
  const b = construction.bounds;
  const w = toWorld(b.width); const d = toWorld(b.depth); const h = toWorld(b.height);
  return {
    center: new THREE.Vector3(0, h / 2, 0),
    radius: 0.5 * Math.sqrt(w * w + d * d + h * h),
  };
}

function rebuild() {
  disposeScene();

  const solid = currentSolid();
  const res = resolution();
  const dims = currentDims();

  shape = buildShape(solid.body(dims), res, {
    trueSize: Boolean(solid.trueDiameterInProjection),
    height: solid.bounds(dims).height,
  });
  shapeGroup.add(shape.group);

  construction = buildConstruction({ solid, dims, resolution: res });
  shapeGroup.add(construction.group);

  buildDimensionAnnotations(solid);

  orthoSheet.draw(solid, dims);

  const focus = contentFocus();
  cameraRig.focusOn(focus.center, focus.radius);

  notifyStateChange();
  // Dimensions or the subject just changed — the two things a size check is about.
  runProblemCheck();
}

// ============================================================================
// Construction layers — ONE set of controllers, driving both Step 4's phases and Step 6's replay.
//
// Keeping these shared is what guarantees the summary shows the learner the same construction they
// just performed, rather than a second, subtly different animation of it.
// ============================================================================

const AXIS_STAGGER = 300;
const AXIS_GROW = 520;

/** Phase A: draw the three axes out of the shared origin corner, one after another. */
function showAxes({ animate = true } = {}) {
  construction.axes.forEach((axis, i) => {
    const delay = animate && !prefersReducedMotion ? i * AXIS_STAGGER : 0;
    const run = () => {
      axis.line.visible = true;
      growGroup(axis.group, 1, animate ? AXIS_GROW : 0);
      fadeMaterial(axis.material, axis.line, 1, animate ? AXIS_GROW : 0);
    };
    if (delay) sequencerBeats.push(setTimeout(run, delay));
    else run();
  });
}

function hideAxes({ animate = false } = {}) {
  construction.axes.forEach((axis) => {
    fadeMaterial(axis.material, axis.line, 0, animate ? 320 : 0);
    if (!animate) { axis.group.scale.setScalar(0.0001); axis.line.visible = false; }
    else growGroup(axis.group, 0.0001, 320);
  });
}

/**
 * Phase B: grow the enclosing box out along those axes.
 *
 * A combination gets ONE BOX PER COMPONENT, each standing on the finished top face of the one below,
 * and they arrive BOTTOM UP — which is how the drawing is really blocked out. A single solid has
 * exactly one box and no stagger, so its timing is unchanged.
 */
const BOX_STAGGER = 320;

function showBox({ animate = true, opacity = 1 } = {}) {
  const many = construction.boxes.length > 1;
  construction.boxes.forEach((box, i) => {
    const run = () => {
      box.line.visible = true;
      growGroup(box.group, 1, animate ? 700 : 0);
      fadeMaterial(box.material, box.line, opacity, animate ? 700 : 0);
    };
    const delay = animate && many && !prefersReducedMotion ? i * BOX_STAGGER : 0;
    if (delay) sequencerBeats.push(setTimeout(run, delay));
    else run();
  });
}

function hideBox({ animate = false } = {}) {
  for (const box of construction.boxes) {
    fadeMaterial(box.material, box.line, 0, animate ? 380 : 0);
    if (!animate) box.group.scale.setScalar(0.0001);
    else growGroup(box.group, 0.0001, 380);
  }
}

/** Phase C: reveal the per-solid construction stages in the order the data lists them. */
function showStage(index, { animate = true } = {}) {
  const st = construction.stages[index];
  if (!st) return;
  stagesDone.add(st.id);
  runProblemCheck();
  st.materials.forEach((m, i) => {
    const obj = st.objects[i];
    fadeMaterial(m, obj, 1, animate ? 520 : 0);
  });
}

function hideStages({ animate = false } = {}) {
  for (const st of construction.stages) {
    st.materials.forEach((m, i) => fadeMaterial(m, st.objects[i], 0, animate ? 320 : 0));
  }
}

/** Phase D: the finished drawing. The construction recedes and the visible edges darken in. */
function showFinishedSolid({ animate = true } = {}) {
  shape.setEdgesVisible(true);
  const from = animate ? 0 : 1;
  shape.setOpacity(from);
  animateValue(shape, from, 1, animate ? 760 : 0, (v) => shape.setOpacity(v));
}

function hideFinishedSolid() {
  liveTweens.get(shape)?.cancel();
  liveTweens.delete(shape);
  shape.setOpacity(0);
  shape.setEdgesVisible(false);
}

// ============================================================================
// Screen-space bridges — the two overlays that connect the chrome to the 3D scene.
//
// Both the 30° annotation and the dimension transfer have one foot in the DOM and one in the scene,
// so both are drawn in the only space that holds both: CSS pixels over the viewport. These two
// helpers are the whole boundary between the worlds.
// ============================================================================

/** A world point, projected into viewport-local CSS pixels. */
function worldToViewport(v3) {
  const p = v3.clone().project(camera);
  const r = viewport.getBoundingClientRect();
  return { x: (p.x * 0.5 + 0.5) * r.width, y: (-p.y * 0.5 + 0.5) * r.height };
}

/** A client-space point (what `getBoundingClientRect` returns), in viewport-local CSS pixels. */
function clientToViewport(pt) {
  const r = viewport.getBoundingClientRect();
  return { x: pt.x - r.left, y: pt.y - r.top };
}

/** The isometric sight-line: the direction the 30° statement is true from. */
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();
/**
 * Fully shown within this angle of the sight-line, gone by `ISO_FADE_END` (degrees).
 *
 * The start band is deliberately tight. Measured off-axis, the receding axes drift about a degree
 * for every three degrees of orbit, so a generous band would let the label read "30°" over an angle
 * a student could measure off a screenshot as 32°. At 2.5° the drift is inside half a degree, and
 * everything past that is already visibly fading — the annotation weakens exactly as its claim does.
 */
const ISO_FADE_START = 2.5;
const ISO_FADE_END = 12;

/**
 * How true the "30°" claim currently is, 1 → 0.
 *
 * The receding axes only measure 30° from the isometric direction; from anywhere else the arcs
 * would annotate an angle the learner could measure as something else. So the annotation is tied to
 * the sight-line and fades out as the camera leaves it — which teaches the dependency rather than
 * hiding it.
 */
function isoAlignment() {
  const dir = camera.position.clone().sub(controls.target).normalize();
  const deg = (Math.acos(Math.max(-1, Math.min(1, dir.dot(ISO_DIR)))) * 180) / Math.PI;
  if (deg <= ISO_FADE_START) return 1;
  if (deg >= ISO_FADE_END) return 0;
  return 1 - (deg - ISO_FADE_START) / (ISO_FADE_END - ISO_FADE_START);
}

/**
 * Keep the figure titles clear of the drawing, live.
 *
 * A title has to sit above the HIGHEST thing the solid throws on screen, and which top corner that
 * is — and how far above the centre it lands — depends on where the camera is. Rather than assume a
 * pose, this measures it: each top corner's offset is resolved against the camera's own up axis to
 * get its screen rise, and the tallest is converted back into the world lift that matches it. One
 * clearance is then added on top (labelLayer's `figureClear`), so the gap reads the same on every
 * solid, at every size, from every angle.
 *
 * Cheap enough for the render loop: four dot products and no allocation beyond two vectors.
 */
const probe = new THREE.Vector3();

/** Screen height of a world point, in NDC (+1 top of frame, −1 bottom). */
function ndcHeight(x, y, z) {
  return probe.set(x, y, z).project(camera).y;
}

function updateFigureTitles() {
  if (!construction || !labels || !shape) return;

  // The DRAWN top of the figure, and how far it still spreads there — not the enclosing box's
  // half-width. A sphere's highest point is its pole, directly over the centre, so it needs no
  // clearance at all while a cuboid does; and for a COMBINATION the answer is whatever the topmost
  // component throws, at the height the stack actually puts it. The shape rig owns both, because it
  // is the only thing that knows the live per-component scales.
  const top = shape.drawnTop();
  const topY = top.y;
  const hw = top.hw;
  const hd = top.hd;

  // Measure, don't model. An earlier version resolved the corner offsets against the camera's up
  // axis, which is only right for a parallel projection — under perspective the FAR top corner is
  // further away and therefore projects lower than that predicts, so boxes were lifted about half
  // a clearance too high. Projecting the candidates is exact and costs four transforms.
  const base = ndcHeight(0, topY, 0);
  const perUnit = ndcHeight(0, topY + 1, 0) - base;
  if (!Number.isFinite(perUnit) || Math.abs(perUnit) < 1e-6) return;

  const candidates = top.round
    // Four points around the top circle: whichever way the camera sits, one of them is within a
    // few per cent of the true silhouette high point.
    ? [[hw, 0], [-hw, 0], [0, hd], [0, -hd]]
    : [[hw, hd], [hw, -hd], [-hw, hd], [-hw, -hd]];

  let highest = base;
  for (const [dx, dz] of candidates) {
    highest = Math.max(highest, ndcHeight(dx, topY, dz));
  }
  // A dimension written ABOVE the solid — a frustum's top diameter is taken up clear of the top
  // circle — is part of the drawing too, and the caption goes above the whole drawing. Only the
  // ones actually on screen count, so Step 5 (which shows none) is not lifted for nothing.
  for (const key of visibleDims) {
    const a = dimAnchors.get(key);
    if (a) highest = Math.max(highest, ndcHeight(a.x, a.y, a.z));
  }

  const rise = (highest - base + PLACEMENT.figureClearScreen) / perUnit;
  const anchor = labels.placeFigureTitle(topY, rise);
  labels.moveTo('title', anchor);
  labels.moveTo('formTitle', anchor);
}

/** Feed the angle layer one frame of projected geometry. Called from the render loop. */
function updateIsoAngles() {
  if (!isoAngles?.visible() || !construction) return;
  const origin = worldToViewport(construction.origin);
  // The two RECEDING axes — the vertical one is the datum's partner, not one of the 30° pair.
  const rays = construction.axes
    .filter((a) => a.key !== 'height')
    .map((a) => {
      const tip = worldToViewport(construction.origin.clone().addScaledVector(a.dir, 1));
      return { x: tip.x - origin.x, y: tip.y - origin.y };
    });
  isoAngles.update({ origin, rays, alignment: isoAlignment() });
}

/** Face highlight for Step 3 — the face the selected orthographic view is looking at. */
function highlightFace(key) {
  for (const [k, face] of Object.entries(construction.faces)) {
    const on = k === key;
    fadeMaterial(face.material, face.mesh, on ? 0.26 : 0, 280);
  }
  for (const [k, labelKey] of [['front', 'viewFront'], ['top', 'viewTop'], ['side', 'viewSide']]) {
    labels.set(labelKey, k === key, { animate: true });
  }
}

/**
 * Carry ONE overall size out of the orthographic view it is read from and onto the box edge it is
 * set off along, then hand over to that edge's callout.
 *
 * The fallback matters: if the sheet is not laid out (hidden, or mid-resize) there is no honest
 * screen anchor to fly from, so the callout simply appears — a missing anchor must degrade to the
 * old behaviour, never to a token flying out of the viewport's top-left corner.
 */
function transferDimension(src) {
  orthoSheet.highlight(src.view);
  const axis = construction.axes.find((a) => a.key === src.axisKey);
  // A size that repeats has no dimension of its own; it lands on the one that carries it.
  const target = dimAlias.get(src.labelKey) ?? src.labelKey;
  const anchor = dimAnchors.get(target);
  const land = () => setDim(target, true, { animate: true });
  if (!axis) return;

  announce(`${axis.symbol}, ${round(construction.bounds[src.axisKey])} millimetres, `
    + `from the ${src.view} view onto the ${axis.label.toLowerCase()} axis.`);

  const from = orthoSheet.viewCenter(src.view);
  if (!from || !anchor) { land(); return; }
  transfers.fly({
    from: clientToViewport(from),
    to: worldToViewport(anchor),
    symbol: axis.symbol,
    onLand: land,
  });
}

/** Clear every construction layer instantly — the base state each phase adds onto. */
function clearConstruction() {
  clearScheduled();
  hideAxes();
  hideBox();
  hideStages();
  highlightFace(null);
  isoAngles?.set(false);
  transfers?.clear();
}

/**
 * Timers owned by the SCENE layer controllers (the axis stagger, the Phase-C fan-out). Kept apart
 * from the chrome timers below on purpose: a phase change must abandon scene beats without also
 * killing the strip's own reveal, which is what would otherwise leave the phase buttons stuck at
 * opacity 0 the moment Step 4 opened.
 */
const sequencerBeats = [];
function clearScheduled() {
  sequencerBeats.forEach(clearTimeout);
  sequencerBeats.length = 0;
}

/** Timers owned by the CHROME (the strip node reveal). Cleared only on a step change. */
const chromeBeats = [];
function clearChromeScheduled() {
  chromeBeats.forEach(clearTimeout);
  chromeBeats.length = 0;
}

// ============================================================================
// Step 4 — the four construction phases.
// ============================================================================

let phaseNoteEl = null;
let phaseStageEl = null;

function markPhase(id) {
  state.phase = id;
  // Reaching a phase is progress the check reads (order, and how much is drawn).
  if (id && phasesDone[phasesDone.length - 1] !== id) phasesDone.push(id);
  runProblemCheck();
  document.querySelectorAll('#phase-strip .flow-strip__node').forEach((btn) => {
    if (btn.dataset.phase === id) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
  phaseNoteEl ??= document.getElementById('phase-note');
  if (phaseNoteEl) {
    // `null` means Step 4 is not on screen — blank the note rather than leaving Phase A's copy
    // stranded under a different step.
    phaseNoteEl.hidden = !id;
    const phase = id ? getPhase(id) : null;
    const title = phaseNoteEl.querySelector('.phase-note__title');
    const body = phaseNoteEl.querySelector('.phase-note__body');
    if (title) title.textContent = phase ? phase.title : '';
    if (body) body.textContent = phase ? phase.note : '';
  }
  setStageNote('');
}

function setStageNote(text) {
  phaseStageEl ??= document.getElementById('phase-stage-note');
  if (!phaseStageEl) return;
  phaseStageEl.hidden = !text;
  const body = phaseStageEl.querySelector('.hint__text');
  if (body) body.textContent = text;
}

/**
 * Drive the viewport to one construction phase. Phases are CUMULATIVE — Phase C still shows the
 * axes and the box, because a construction that threw away its guides at each step would teach the
 * opposite of the lesson. Re-selecting an earlier phase rewinds to exactly that state.
 *
 * `animate: false` lands the same end state with no motion and no camera move — used when a
 * dimension edit rebuilds the geometry underneath a phase the learner is already looking at.
 *
 * @param {'a'|'b'|'c'|'d'} id
 * @param {{ animate?: boolean }} [opts]
 */
function goPhase(id, { animate = true } = {}) {
  sequencer.stop();
  clearScheduled();
  cancelAllTweens();
  transfers?.clear();
  markPhase(id);

  const phase = getPhase(id);
  orthoSheet.setDrawn(true);
  hideFinishedSolid();
  labels.set('title', false);
  setAllDims(false);
  hideStages();
  highlightFace(null);
  // The 30° arcs belong to Phase A and nowhere else. Even there they are not shown yet: they
  // annotate axes that have not been drawn, and the camera is still flying — an annotation that
  // reads "30°" while the flight has it projecting 27° is worse than no annotation at all.
  isoAngles?.set(false);

  if (!animate) {
    // Rewind-and-restore: land the cumulative end state of this phase with no motion at all.
    hideAxes(); hideBox();
    if (id === 'd') { showFinishedSolid({ animate: false }); return; }
    showAxes({ animate: false });
    if (id === 'a') {
      // A dimension edit moved the origin corner out from under the camera. Slide the aim back
      // onto it — without a flight, and without discarding an orbit the learner set — so the
      // arcs keep measuring a true 30°.
      cameraRig.retarget(construction.origin);
      isoAngles?.set(true);
      return;
    }
    showBox({ animate: false, opacity: id === 'b' ? 1 : 0.55 });
    setAllDims(true);
    if (id === 'c') construction.stages.forEach((_, i) => showStage(i, { animate: false }));
    return;
  }

  if (id === 'a') {
    hideBox();
    hideAxes();
    // Aimed at the ORIGIN CORNER, not at the solid's centre. That is what puts the corner on the
    // principal axis, where a perspective projection preserves angles — so the arcs the annotation
    // draws measure a true 30° instead of the ~36° an off-centre corner would project (see
    // isoAngles.js). The framing is opened up because the axes spread from that corner rather than
    // surrounding it.
    const focus = contentFocus();
    cameraRig.flyTo(
      cameraRig.pose('isometric', { center: construction.origin, radius: focus.radius * 1.5 }),
      { duration: 1400 },
    );
    sequencer.play([
      { at: 500, run: () => showAxes({ animate: true }) },
      // Only once the flight has landed and all three axes are standing: the arcs are drawn ONTO
      // the axes, so they must arrive after them, the way an annotation follows its linework.
      { at: 1900, run: () => isoAngles?.set(true) },
    ]);
    flowNote('One vertical axis, two receding at 30° — measured off the horizontal, on the drawing itself.');
    announce(phase.announce);
    return;
  }

  if (id === 'b') {
    hideAxes(); showAxes({ animate: false });
    cameraRig.flyTo(cameraRig.pose('isometric'), { duration: 900 });
    // THE teaching moment of this phase: each size does not merely appear on its axis, it LEAVES
    // the view it is read from and travels there, one at a time. Assertion becomes demonstration.
    const beats = [{ at: 200, run: () => showBox({ animate: true }) }];
    DIM_SOURCES.forEach((src, i) => {
      beats.push({ at: 1000 + i * 1250, run: () => transferDimension(src) });
    });
    beats.push({
      at: 1000 + DIM_SOURCES.length * 1250,
      run: () => {
        orthoSheet.highlight(null);
        // Any size the BOX cannot carry (a frustum's top diameter) is not transferred — it is not
        // an overall size — but it belongs on the finished dimensioned drawing, so it arrives once
        // the three box dimensions have landed.
        setAllDims(true, { animate: true });
      },
    });
    sequencer.play(beats);
    flowNote('Each overall size leaves the view it is read from and lands on the axis it is measured along.');
    announce(phase.announce);
    return;
  }

  if (id === 'c') {
    hideAxes(); showAxes({ animate: false });
    hideBox(); showBox({ animate: false, opacity: 0.55 });
    setAllDims(true);
    cameraRig.flyTo(cameraRig.pose('isometric'), { duration: 900 });
    const beats = [];
    construction.stages.forEach((st, i) => {
      beats.push({
        at: 500 + i * 1600,
        run: () => { showStage(i); setStageNote(`${st.label} — ${st.note}`); announce(st.note); },
      });
    });
    sequencer.play(beats);
    announce(phase.announce);
    return;
  }

  // Phase D — the guides go, the drawing stays.
  hideAxes(); showAxes({ animate: false });
  hideBox(); showBox({ animate: false, opacity: 0.55 });
  construction.stages.forEach((_, i) => showStage(i, { animate: false }));
  cameraRig.flyTo(cameraRig.pose('isometric'), { duration: 800 });
  sequencer.play([
    { at: 260, run: () => { hideAxes({ animate: true }); hideBox({ animate: true }); hideStages({ animate: true }); } },
    { at: 640, run: () => showFinishedSolid({ animate: true }) },
    { at: 1200, run: () => setStageNote('The finished isometric drawing of exactly the solid the three views described.') },
  ]);
  flowNote('Construction lines fade, visible edges darken — the finished isometric drawing.');
  announce(phase.announce);
}

// ============================================================================
// Step 5 — Isometric Projection or Isometric View.
//
// The ONLY difference between the two forms is the scale the lengths are measured at. Showing them
// side by side made that easy to miss: two objects on screen invite the reading "two DIFFERENT
// drawings", which is the misconception the step exists to kill. So there is now ONE drawing and a
// toggle. The same construction stays on screen and visibly re-scales under the switch, while the
// numbers beside it change — construction method the same, measurement system different.
// ============================================================================

/** Scale factor for a form. For almost every solid this is the entire difference between them. */
const FORM_SCALE = { projection: ISOMETRIC_SCALE, view: 1 };
const FORM_TITLE = { projection: 'Isometric Projection', view: 'Isometric View' };

/**
 * The scale THIS solid is drawn at in this form.
 *
 * The isometric scale reduces lengths measured ALONG THE AXES, and a sphere has no such length —
 * it has no linear edge at all. From any direction it projects as a circle of its TRUE radius, so
 * an isometric projection of a sphere is drawn full size while everything around it is reduced.
 * A solid says so itself with `trueDiameterInProjection`, and the Step-5 note explains it; nothing
 * here knows which solids those are (ADR-043, ADR-051).
 */
function formScaleFor(solid, mode) {
  if (solid.trueDiameterInProjection) return 1;
  return FORM_SCALE[mode] ?? 1;
}

/** Enter Step 5 with whichever form is currently selected, and frame it. */
function enterFormComparison() {
  showFinishedSolid({ animate: false });
  applyFormMode(state.formMode, { animate: false });

  // Framed for the LARGER of the two forms, so switching never crops the drawing or makes the
  // camera lurch — the scale change has to be the only thing that moves.
  const b = construction.bounds;
  const h = toWorld(b.height);
  const focus = contentFocus();
  const center = new THREE.Vector3(0, h / 2, 0);
  cameraRig.focusOn(center, focus.radius * 1.06);
  cameraRig.flyTo(cameraRig.pose('isometric', { center, radius: focus.radius * 1.06 }),
    { duration: 1400 });
}

/**
 * Drive the viewport and the chrome to one form.
 *
 * The solid is not rebuilt — it is the SAME geometry, scaled. That is the claim being made, so it
 * would be dishonest to make it any other way: if the two forms needed different geometry, the
 * method really would differ.
 */
function applyFormMode(mode, { animate = true } = {}) {
  state.formMode = FORM_SCALE[mode] ? mode : 'view';
  runProblemCheck();   // which form is drawn is one of the things the question fixes
  // The ISOMETRIC SCALE for the form, handed whole to the shape rig. The rig applies it per
  // component — reduced size for anything with an axial length, reduced SEATING HEIGHT for
  // everything including the parts drawn at true size. That pair is the sphere rule, and expressing
  // it once here is what keeps it true of a sphere standing alone and of a sphere on a slab.
  const axial = FORM_SCALE[state.formMode] ?? 1;

  if (shape) {
    const from = shape.formScale();
    if (animate && !prefersReducedMotion) {
      animateValue('formScale', from, axial, 620, (v) => shape.setFormScale(v));
    } else {
      liveTweens.get('formScale')?.cancel();
      liveTweens.delete('formScale');
      shape.setFormScale(axial);
    }
  }

  // One FIGURE TITLE. This anchor is only the starting point — `updateFigureTitles()` re-derives it
  // against the live camera every frame, which is what keeps the clearance identical whichever form
  // is on screen and however the learner has orbited.
  labels.make('formTitle', FORM_TITLE[state.formMode], 'vp-label--title',
    labels.placeFigureTitle(shape ? shape.drawnTop().y : toWorld(construction.bounds.height)));
  labels.set('formTitle', true, { animate });

  syncFormChrome();
}

/** Push the live form into the segmented buttons, the two cards and the table. */
function syncFormChrome() {
  const mode = state.formMode;
  document.querySelectorAll('#form-modes .segmented__btn').forEach((btn) => {
    const on = btn.dataset.form === mode;
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-active', on);
  });
  document.querySelectorAll('.form-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.form === mode);
  });
  const solid = currentSolid();
  const exempt = Boolean(solid.trueDiameterInProjection);
  const head = document.getElementById('form-drawn-head');
  if (head) {
    // A solid drawn at true size in BOTH forms must not carry a ×0.816 header over a column of
    // unreduced numbers — the header names what actually happened to this solid.
    head.textContent = mode === 'projection' && !exempt ? 'Drawn · ×0.816' : 'Drawn · 1:1';
  }
  renderSolidFormNote(solid);
  renderFormRows();
}

/**
 * The per-solid Step-5 note — shown only for a solid that declares one, hidden for every other.
 *
 * The sphere is the case that needs it: the isometric scale reduces lengths measured along the
 * axes, and a sphere has none, so it is drawn at its true diameter in both forms. Without the note
 * the toggle would look broken on a sphere; with it, the toggle doing nothing IS the lesson.
 */
function renderSolidFormNote(solid) {
  const host = document.getElementById('form-note');
  if (!host) return;
  const note = solid.formNote;
  host.hidden = !note;
  host.innerHTML = '';
  if (!note) return;

  const title = document.createElement('span');
  title.className = 'form-card__title';
  title.textContent = note.title;
  host.appendChild(title);
  for (const para of note.body) {
    const p = document.createElement('p');
    p.className = 'form-card__note';
    p.textContent = para;
    host.appendChild(p);
  }
}

/**
 * The per-dimension numbers, in engineering notation: the size the object really is, and the size it
 * is SET OFF at in the form now on screen. Keeping both columns is what lets the learner check the
 * 0.816 rather than be told it — while the header above the second column names which form produced
 * it, so the table can never disagree with the drawing.
 */
function renderFormRows() {
  const solid = currentSolid();
  const host = document.getElementById('form-table');
  if (!host) return;
  const dims = currentDims();
  const axial = FORM_SCALE[state.formMode] ?? 1;
  // A field belonging to a component drawn at TRUE size is not reduced, whatever the rest of the
  // drawing does. For a single solid that is the solid's own flag and the column is uniform, exactly
  // as before; for a combination it is per component, which is what makes a sphere on a reduced slab
  // readable as the two facts it is.
  const solidTrue = Boolean(solid.trueDiameterInProjection);
  host.innerHTML = '';
  for (const spec of solid.dims) {
    const trueLen = dims[spec.key];
    const scale = (spec.trueSize ?? solidTrue) ? 1 : axial;
    const row = document.createElement('div');
    row.className = 'form-row';

    const name = document.createElement('span');
    name.className = 'form-row__name';
    // Inside a combination the same symbol can appear twice, so the component names the row.
    name.textContent = spec.part
      ? `${spec.symbol} · ${spec.part} ${spec.label.toLowerCase()}`
      : `${spec.symbol} · ${spec.label}`;

    const trueVal = document.createElement('span');
    trueVal.className = 'form-row__value';
    trueVal.textContent = `${round(trueLen)} mm`;

    const drawn = document.createElement('span');
    drawn.className = 'form-row__value form-row__value--drawn';
    drawn.textContent = `${round(trueLen * scale)} mm`;

    row.append(name, trueVal, drawn);
    host.appendChild(row);
  }
}

/** The segmented control's handler. Only fires real work when the form actually changes. */
function setFormMode(mode) {
  if (mode === state.formMode) return;
  applyFormMode(mode, { animate: true });

  const solid = currentSolid();
  if (solid.trueDiameterInProjection) {
    // Saying "reduced to 0.816" here would be false, and the learner can see it is false — the
    // drawing did not move. Name the exception instead.
    announce(`${FORM_TITLE[state.formMode]}. A ${solid.name.toLowerCase()} has no length measured `
      + 'along an axis, so it is drawn at its true diameter in both forms. '
      + 'See the sphere special case beside the table.');
    flowNote('The drawing does not change size — a sphere is drawn at its true diameter in both forms.');
    return;
  }

  announce(state.formMode === 'projection'
    ? 'Isometric Projection. Every length is set off at about 0.816 of its true value. '
      + 'The construction is unchanged.'
    : 'Isometric View. Every length is set off at its true value, one to one. '
      + 'The construction is unchanged.');
  flowNote(state.formMode === 'projection'
    ? 'Same drawing, same order of construction — every length now reduced to the isometric scale.'
    : 'Same drawing, same order of construction — every length back at its true size.');
}

// ============================================================================
// Step 6 — the end-to-end replay.
// ============================================================================

function markChain(id) {
  state.chain = id;
  document.querySelectorAll('#chain-strip .flow-strip__node').forEach((btn) => {
    if (btn.dataset.link === id) btn.setAttribute('aria-current', 'step');
    else btn.removeAttribute('aria-current');
  });
  const link = SUMMARY_CHAIN.find((l) => l.id === id);
  const noteEl = document.getElementById('chain-note');
  if (noteEl && link) {
    noteEl.textContent = link.note;
    noteEl.hidden = false;
  }
}

/**
 * Play the whole chain. `from` lets a learner jump into a link: everything before it is applied
 * INSTANTLY (so the state is honest) and the animation resumes from there.
 * @param {'views'|'axes'|'box'|'shape'|'finish'} [from='views']
 */
function playSummary(from = 'views') {
  sequencer.stop();
  clearScheduled();
  cancelAllTweens();

  const order = SUMMARY_CHAIN.map((l) => l.id);
  const startIndex = Math.max(order.indexOf(from), 0);

  // --- Base state: nothing drawn, sheet up, solid away.
  clearConstruction();
  hideFinishedSolid();
  labels.hideAll();
  orthoSheet.setDrawn(true);
  orthoSheet.highlight(null);

  // --- Apply every earlier link instantly, so jumping in mid-chain still shows an honest state.
  if (startIndex > 0) showAxes({ animate: false });
  if (startIndex > 1) showBox({ animate: false, opacity: 0.55 });
  if (startIndex > 2) construction.stages.forEach((_, i) => showStage(i, { animate: false }));

  const t0 = SUMMARY_TIMING[order[startIndex]];
  const at = (key) => Math.max(SUMMARY_TIMING[key] - t0, 0);
  const beats = [];

  if (startIndex <= 0) {
    beats.push({ at: at('views'), run: () => {
      markChain('views');
      cameraRig.flyTo(cameraRig.pose('threeQuarter'), { duration: 1100 });
      orthoSheet.highlight('front');
    } });
    beats.push({ at: at('views') + 700, run: () => orthoSheet.highlight('top') });
    beats.push({ at: at('views') + 1400, run: () => orthoSheet.highlight('side') });
    beats.push({ at: at('views') + 2000, run: () => orthoSheet.highlight(null) });
  }
  if (startIndex <= 1) {
    beats.push({ at: at('axes'), run: () => {
      markChain('axes');
      cameraRig.flyTo(cameraRig.pose('isometric'), { duration: 1200 });
      showAxes({ animate: true });
    } });
  }
  if (startIndex <= 2) {
    beats.push({ at: at('box'), run: () => {
      markChain('box');
      showBox({ animate: true });
      setAllDims(true, { animate: true });
    } });
  }
  if (startIndex <= 3) {
    beats.push({ at: at('shape'), run: () => {
      markChain('shape');
      for (const box of construction.boxes) fadeMaterial(box.material, box.line, 0.55, 320);
      construction.stages.forEach((_, i) => {
        sequencerBeats.push(setTimeout(() => showStage(i), prefersReducedMotion ? 0 : i * 520));
      });
    } });
  }
  beats.push({ at: at('finish'), run: () => {
    markChain('finish');
    hideAxes({ animate: true });
    hideBox({ animate: true });
    hideStages({ animate: true });
    setAllDims(false, { animate: true });
    showFinishedSolid({ animate: true });
  } });
  beats.push({ at: at('close'), run: () => {
    const closing = document.getElementById('summary-closing');
    if (closing) closing.classList.add('is-in');
    flowNote('You are now ready to solve isometric drawing problems.');
    announce('Orthographic views, axes, bounding box, construction, finished isometric drawing. '
      + 'You are now ready to solve isometric drawing problems.');
  } });

  sequencer.play(beats);
}

// ============================================================================
// Scene controller — enterStep(n) drives the scene into each step's state.
// Idempotent: rail jumps, Back/Next and rebuilds all route here.
// ============================================================================

function resetSceneLayers() {
  sequencer.stop();
  clearScheduled();
  clearChromeScheduled();
  cancelAllTweens();
  clearConstruction();
  labels.hideAll();
  state.phase = null;
  state.chain = null;
  markPhase(null);
  setStageNote('');
  // Step 5 leaves the solid scaled to whichever form was on screen. Every other step draws it at
  // true size, so the scale is part of what a step change resets.
  if (shape) {
    liveTweens.get('formScale')?.cancel();
    liveTweens.delete('formScale');
    shape.setFormScale(1);
  }
  labels.remove('formTitle');
  const closing = document.getElementById('summary-closing');
  closing?.classList.remove('is-in');
  const chainNote = document.getElementById('chain-note');
  if (chainNote) chainNote.hidden = true;
  document.querySelectorAll('#chain-strip .flow-strip__node, #phase-strip .flow-strip__node')
    .forEach((b) => b.removeAttribute('aria-current'));
  showSheet(false);
  showStrip('phase-strip', false);
  showStrip('chain-strip', false);
}

function showSheet(on) {
  const host = document.getElementById('ortho-sheet');
  if (host) host.hidden = !on;
  if (on) orthoSheet.setDrawn(true);
  else orthoSheet.highlight(null);
}

function showStrip(id, on) {
  const el = document.getElementById(id);
  if (!el) return;
  el.hidden = !on;
  if (!on) return;
  // Reveal one node at a time, so the chain reads as a sequence before it is used (Topic 1 pattern).
  const nodes = [...el.querySelectorAll('.flow-strip__node, .flow-strip__arrow')];
  nodes.forEach((n) => n.classList.remove('is-in'));
  const stepMs = prefersReducedMotion ? 0 : 220;
  nodes.forEach((n, i) => chromeBeats.push(setTimeout(() => n.classList.add('is-in'), i * stepMs)));
}

/** The Step-3 view selection, shared by a click on the sheet and by the keyboard. */
let selectedView = null;

function selectView(key) {
  if (selectedView === key) {           // click again to step back out to the pictorial view
    selectedView = null;
    orthoSheet.highlight(null);
    highlightFace(null);
    cameraRig.flyTo(cameraRig.pose('threeQuarter'), { duration: 1100 });
    announce('Back to the pictorial view.');
    return;
  }
  selectedView = key;
  orthoSheet.highlight(key);
  highlightFace(key);
  cameraRig.flyTo(cameraRig.pose(key), { duration: 1400 });
  const solid = currentSolid();
  const words = {
    front: `Front view — the ${solid.name} seen straight from the front, projected on the VP.`,
    top: `Top view — the ${solid.name} seen from directly above, projected on the HP.`,
    side: `Side view — the ${solid.name} seen from the side, projected on the PP.`,
  };
  flowNote(words[key]);
  announce(words[key]);
}

function enterStep(n) {
  resetSceneLayers();
  selectedView = null;

  // Every step but the Step-5 split frames the solid itself; Step 5 widens it for two.
  const focus = contentFocus();
  cameraRig.focusOn(focus.center, focus.radius);

  switch (n) {
    case 1: // Choose a solid — meet it, nothing else.
      showFinishedSolid({ animate: false });
      labels.set('title', true, { animate: true });
      cameraRig.flyTo(cameraRig.pose('threeQuarter'), { duration: 1100 });
      announce(`${currentSolid().name} selected. Drag to rotate it.`);
      break;

    case 2: // Set dimensions — the same solid, now with its overall sizes named.
      showFinishedSolid({ animate: false });
      labels.set('title', true);
      setAllDims(true, { animate: true });
      cameraRig.flyTo(cameraRig.pose('threeQuarter'), { duration: 900 });
      announce('Set the dimensions. The solid, its labels and its overall size update as you change them.');
      break;

    case 3: // Orthographic views — the source of every dimension.
      showFinishedSolid({ animate: false });
      showSheet(true);
      cameraRig.flyTo(cameraRig.pose('threeQuarter'), { duration: 1000 });
      announce('Three orthographic views describe this solid completely. '
        + 'Select a view to look along that direction and light the matching face.');
      break;

    case 4: // Construct — the four phases.
      showSheet(true);
      showStrip('phase-strip', true);
      hideFinishedSolid();
      goPhase('a');
      break;

    case 5: // Projection vs View.
      showSheet(false);
      enterFormComparison();
      announce('Isometric Projection uses the isometric scale, about 0.816 of true size. '
        + 'Isometric View uses true dimensions, 1 to 1. The construction is identical. '
        + 'Use the two buttons to switch the drawing between them.');
      break;

    case 6: // The whole process, replayed.
      showSheet(true);
      showStrip('chain-strip', true);
      playSummary('views');
      break;
  }
}

/**
 * Re-assert the CURRENT step's scene after a rebuild triggered by a dimension edit.
 *
 * A dimension edit must not restart the step: replaying the camera flight and the reveal
 * animations on every slider tick would strobe the viewport and, worse, would make a slow drag feel
 * broken. So this lands the same visual state instantly and leaves the camera exactly where the
 * learner put it.
 */
function applyStepState() {
  const n = stepper?.step() ?? 1;
  labels.hideAll();

  if (n === 1 || n === 2) {
    showFinishedSolid({ animate: false });
    labels.set('title', true);
    if (n === 2) setAllDims(true);
    return;
  }
  if (n === 3) {
    showFinishedSolid({ animate: false });
    showSheet(true);
    if (selectedView) { orthoSheet.highlight(selectedView); highlightFace(selectedView); }
    return;
  }
  if (n === 4) {
    showSheet(true);
    goPhase(state.phase ?? 'a', { animate: false });
    return;
  }
  if (n === 5) {
    enterFormComparison();
    return;
  }
  // Step 6 exposes no dimension controls; a rebuild there can only come from a reset, which
  // re-enters Step 1 anyway.
  enterStep(6);
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 200);
  camera.position.set(6, 6, 6);

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
    enterStep(stepper?.step() ?? 1);
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

  // CSS2D label overlay — a transparent DOM layer sized to the canvas; pointer-events off so a
  // drag-to-orbit passes straight through it.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 60;
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
  if (!cameraRig.isFlying()) controls.update();

  // Curved solids have no fixed outline edges: their silhouettes and the sphere's outline ring must
  // be re-aimed at the live camera every frame (see shapeFactory's silhouette note).
  shape?.update(camera);
  construction?.update(camera);

  // The 30° arcs are screen-space and LIVE: re-derived every frame from the projected axes, so an
  // orbit, a dolly or a resize can never leave them describing a pose the camera has left.
  updateIsoAngles();
  updateFigureTitles();

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
  // Fat lines are screen-space: their resolution must track the drawing buffer (RULES.md §3.16).
  const bw = renderer.domElement.width;
  const bh = renderer.domElement.height;
  shape?.setResolution(bw, bh);
  construction?.setResolution(bw, bh);
  dimensions?.setResolution(bw, bh);
  // The two screen-space overlays are sized in CSS pixels, not drawing-buffer pixels — they draw
  // over the canvas, they do not draw INTO it.
  isoAngles?.resize(w, h);
  transfers?.resize(w, h);
  // A resize moves both ends of any transfer in flight; there is no honest way to re-aim one
  // mid-journey, so they are abandoned rather than left pointing at stale anchors.
  transfers?.clear();
}

// ============================================================================
// Chrome: mobile advisory, wizard toggle, reset confirm
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

/** The ghost Reset is guarded by an inline two-state confirm (RULES.md §4.19); only "Yes" wipes,
 *  and it wipes through `simAPI.reset()` — the single reset path (§2.9). */
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
// Per-step controls
// ============================================================================

function setupStepControls() {
  // Step 4 — the phase sub-buttons.
  document.querySelectorAll('#phase-strip .flow-strip__node').forEach((btn) => {
    btn.addEventListener('click', () => goPhase(btn.dataset.phase));
  });
  document.getElementById('act-replay-phases')?.addEventListener('click', () => goPhase('a'));

  // Step 5 — the form toggle. Exactly one form is live at a time (`aria-pressed` carries which),
  // so the learner cannot end up looking at a drawing whose numbers describe the other form.
  document.querySelectorAll('#form-modes .segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => setFormMode(btn.dataset.form));
  });

  // Step 6 — the chain strip and the replay button.
  document.querySelectorAll('#chain-strip .flow-strip__node').forEach((btn) => {
    btn.addEventListener('click', () => playSummary(btn.dataset.link));
  });
  document.getElementById('act-replay-summary')?.addEventListener('click', () => playSummary('views'));
}

// ============================================================================
// Platform API — exactly pause / resume / reset (RULES.md §2.8).
// ============================================================================

window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    cancelAllTweens();
    sequencer.stop();
    clearScheduled();
    cameraRig.cancel();
    transfers?.clear();
    isoAngles?.set(false);
    clearFlowNote();

    state.mode = 'single';       // reset returns to the single-solid teaching state
    state.solidId = SOLIDS[0].id;
    state.combo = defaultCombination();
    state.problemId = DEFAULT_PROBLEM_ID;
    freeMode = 'single';
    resetProgress();
    ui.closeBrowser?.();     // the browser is a selector over the sim; a reset closes it
    invalidateSubject();
    state.dims = defaultDims(SOLIDS[0]);
    state.unspecified = {};      // every dimension specified again — the default teaching state
    state.phase = null;
    state.formMode = 'view';     // true dimensions, the form Steps 1–4 draw at
    state.chain = null;
    selectedView = null;

    rebuild();
    ui.render(state);
    cameraRig.snapTo(cameraRig.pose('threeQuarter'));
    stepper?.reset();   // wizard + scene back to Step 1 (which re-enters the scene state)
    announce('Simulation reset.');
  },
};

// ============================================================================
// The controller injected into the leaf modules.
// ============================================================================

const simController = {
  enterStep,
  announce,
  flowNote,

  /** The active subject, for the dock. Derived on demand — never stored (RULES.md §3.35's rule). */
  subject: currentSolid,

  /** The library problem on screen, or null in free practice. Derived on demand, like the subject. */
  problem: currentProblem,

  /** Step 1: choosing a solid replaces the whole geometry set, so it goes through rebuild(). */
  setSolid(id) {
    // While a problem is loaded the QUESTION names the solid, and Step 1's controls are locked to
    // say so. The guard is here as well as in the dock because a control that is merely disabled can
    // still be driven programmatically, and half-applying a subject change — new dimension keys
    // against the old subject — is what produces geometry built from undefined numbers.
    if (problemLoaded()) return;
    if (id === state.solidId && state.mode === 'single') return;
    const solid = getSolid(id);
    state.solidId = solid.id;
    invalidateSubject();
    state.dims = defaultDims(solid);
    state.unspecified = {};   // a new solid brings its own fields; none of them start withheld
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`${solid.name} selected. ${solid.blurb}`);
  },

  // ==========================================================================
  // Step 1 — combination of solids (§16.8).
  //
  // Every one of these is a SUBJECT change, so every one goes through the same single `rebuild()`
  // the solid picker goes through. None of them touches the scene, and none of them knows what a
  // combination is beyond "an ordered list of solid ids".
  // ==========================================================================

  /** Switch between constructing one solid and constructing a combination of them. */
  setMode(mode) {
    if (problemLoaded()) return;   // the question fixes the subject; Step 1 is locked to say so
    const next = mode === 'combination' ? 'combination' : 'single';
    if (next === state.mode) return;
    state.mode = next;
    invalidateSubject();
    // Combination keys are namespaced per component, so they never collide with a single solid's —
    // which means both sets of numbers survive a switch and switching back finds them intact.
    reconcileDims();
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    const solid = currentSolid();
    announce(next === 'combination'
      ? `Combination of solids. ${solid.name}. Choose the solids that make it up, from the base upward.`
      : `Single solid. ${solid.name} selected.`);
  },

  /**
   * Load a problem from the library (Practice Problems).
   *
   * A problem is a SUBJECT change like choosing a solid, so it takes the identical path — one
   * `rebuild()`, one dock render, one re-entry into the step the learner is standing on. Nothing
   * about the six steps, the four phases or the construction pipeline knows this happened.
   */
  setProblem(id) {
    const problem = resolveProblem(id);
    resetProgress();   // a new problem is a new attempt: its own phases, its own stages
    if (state.mode === 'problem' && problem.id === state.problemId) return;
    // Where free practice was left, so leaving the problem puts the learner back where they were.
    if (state.mode !== 'problem') freeMode = state.mode;
    state.problemId = problem.id;
    state.mode = 'problem';
    invalidateSubject();
    reconcileDims();
    // The question decides which of the two forms Step 5 opens in; the toggle stays live.
    state.formMode = initialFormMode(problem);
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`${problem.title}. ${problem.question}`);
  },

  /** Leave the problem and go back to free practice, where the learner left it. */
  exitProblem() {
    if (state.mode !== 'problem') return;
    resetProgress();
    state.mode = freeMode;
    invalidateSubject();
    reconcileDims();
    state.formMode = 'view';   // free practice starts at true lengths, as it always has
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`Problem closed. ${currentSolid().name}.`);
  },

  /** Change which solid sits at one position in the stack. */
  setComboPart(index, id) {
    if (problemLoaded()) return;
    const part = state.combo[index];
    if (!part || part.solidId === id) return;
    state.combo = state.combo.map((p, i) => (i === index ? { solidId: getSolid(id).id } : p));
    invalidateSubject();
    reconcileDims();
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`${getSolid(id).name} placed. ${currentSolid().name}.`);
  },

  /** Seat one more solid on top of the stack. */
  addComboPart() {
    if (problemLoaded()) return;
    if (state.combo.length >= MAX_PARTS) return;
    // Default to something that reads clearly ON something else rather than to the first entry in
    // the registry, so the first press produces a drawing worth looking at.
    const used = new Set(state.combo.map((p) => p.solidId));
    const preferred = ['cone', 'sphere', 'hemisphere', 'square-pyramid', 'cylinder']
      .find((id) => !used.has(id)) ?? SOLIDS[0].id;
    state.combo = [...state.combo, { solidId: preferred }];
    invalidateSubject();
    reconcileDims();
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`${getSolid(preferred).name} added on top. ${currentSolid().name}.`);
  },

  /** Take one solid back off. The base stays: a combination needs something to stand on. */
  removeComboPart(index) {
    if (problemLoaded()) return;
    if (index <= 0 || state.combo.length <= MIN_PARTS) return;
    const gone = getSolid(state.combo[index].solidId).name;
    state.combo = state.combo.filter((_, i) => i !== index);
    invalidateSubject();
    reconcileDims();
    rebuild();
    ui.render(state);
    enterStep(stepper?.step() ?? 1);
    announce(`${gone} removed. ${currentSolid().name}.`);
  },

  /** Step 2: a dimension edit is still a geometry change, so it also goes through rebuild() — the
   *  single pipeline is what keeps the disposal contract honest under a fast slider drag. */
  setDim(key, value) {
    if (state.dims[key] === value) return;
    state.dims[key] = value;
    rebuild();
    ui.sync(state);
    applyStepState(); // re-assert, don't restart — a slider drag must not strobe the viewport
  },

  /**
   * Step 2: declare a dimension stated or UNKNOWN.
   *
   * This is a geometry change like any other — the unknown value is replaced by the field's own
   * demonstration value — so it goes through the same single `rebuild()` pipeline. The dock is
   * re-rendered rather than merely synced, because the field SET changes shape: a withheld
   * dimension has no slider to drag.
   */
  setDimSpecified(key, on) {
    const solid = currentSolid();
    const spec = solid.dims.find((f) => f.key === key);
    if (!spec?.optional) return;
    const unspecified = !on;
    if (Boolean(state.unspecified[key]) === unspecified) return;
    if (unspecified) state.unspecified[key] = true;
    else delete state.unspecified[key];

    rebuild();
    ui.render(state);
    applyStepState();
    announce(unspecified
      ? `${spec.label} is now unknown. ${spec.autoNote ?? ''}`.trim()
      : `${spec.label} is specified again, at ${state.dims[key]} ${spec.unit}.`);
  },

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
    labels = initLabelLayer(scene, { prefersReducedMotion });
    cameraRig = initCameraRig({ camera, controls, prefersReducedMotion });
    sequencer = createSequencer({ prefersReducedMotion });

    const sheetHost = document.getElementById('ortho-sheet');
    orthoSheet = initOrthoSheet(sheetHost);
    orthoSheet.onSelect(selectView);

    // The two screen-space overlays. Both are `pointer-events: none` and `aria-hidden`, so they
    // never intercept a drag and never become a second announcement channel.
    isoAngles = initIsoAngles(document.getElementById('vp-angles'));
    transfers = initTransferLayer(document.getElementById('vp-transfer'), { prefersReducedMotion });
    isoAngles.resize(container.clientWidth, container.clientHeight);
    transfers.resize(container.clientWidth, container.clientHeight);

    ui = initUIManager(simController);

    rebuild();
    ui.render(state);
    cameraRig.snapTo(cameraRig.pose('threeQuarter'));

    setupMobileNotice();
    setupWizardToggle();
    setupResetControl();
    setupStepControls();
    initTerms();
    onboarding = initOnboarding(controls);
    onboarding.setSolidPresent(true); // a solid exists from the very first step

    stepper = initStepper(simController); // drives enterStep(1) on init

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Re-render once fonts are ready so CSS2D labels never paint in a fallback face (RULES.md §3.26).
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => { if (labelRenderer) labelRenderer.render(scene, camera); });
  }

  markBooted();
}

init();
