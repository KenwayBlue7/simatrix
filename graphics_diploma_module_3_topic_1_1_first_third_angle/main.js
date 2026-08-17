// Orchestrator — Diploma Engineering Graphics, Module 3 Topic 1.1: First and Third
// Angle Projection.
//
// Cut from template_starter/ (MODULE-STARTER.md Case A discipline — this topic needs
// a real 3D scene, unlike Diploma Module 1's 2D SVG orchestrator, ADR-095). Patterns
// ported from two siblings, used as TECHNICAL REFERENCE only (not curriculum
// lineage — see ../graphics_diploma_module_3_topic_1_1_first_third_angle/CLAUDE.md):
//   - graphics_module_1_topic_2_spatial_framework: the pivot-hinged rabatment fold,
//     CSS2D label layer, and the BIS first-angle symbol badge pattern.
//   - graphics_module_1_topic_3_points: the generic, data-driven Problem Library
//     controller + problems.js contract.
//
// Owns `state` (the one real parameter — projectionSystem — plus fold/step flags),
// the single rebuild() pipeline (full disposal contract), window.simAPI, and the
// boot watchdog. rebuild() disposes the previous planes/solid/labels, then rebuilds
// all three from current state — planes.js + solidViews.js + labelLayer.js.
//
// Layering (CLAUDE.md / ADR-007): main.js is the orchestrator. Leaf modules
// (stepper/terms/anim/planes/solidViews/labelLayer) never import each other; they
// hang off this file only.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { tick as tickTweens, cancelAll as cancelTweens, tween, easeFold, easeCamera } from './src/anim.js';
import { ProjectionSystem, defaultSystemData, systemSign, PP_OFFSET } from './src/systemData.js';
import { createPlanes, HP_FOLD_ANGLE, PP_FOLD_ANGLE } from './src/planes.js';
import { createSolidAndViews, objectCenter, ppOffsetFor } from './src/solidViews.js';
import { createLabelLayer } from './src/labelLayer.js';
import { DEFAULT_VIEW } from './src/systemSteps.js';

const rootStyle = getComputedStyle(document.documentElement);
const cssVar = (name) => rootStyle.getPropertyValue(name).trim();
const cssColor = (name) => new THREE.Color(cssVar(name));

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Camera poses
// ============================================================================

// Pulled back from the original (7, 5.5, 8.5) / side-pose-at-9 now that PP_OFFSET
// (systemData.js) is 6.5 — PP's own sheet can reach ±(PP_OFFSET+HALF) = ±9.5 in X, so
// both the default orbit start and the 'side' quick-view need enough standoff to keep
// PP in frame (whichever system's sign it's currently offset toward) without the
// camera sitting inside or right against its plane.
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(9, 6.5, 10.5);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0.5, 0);
const CAMERA_MOVE_MS = 700;

/** Quick-view poses: square-on to each plane (Top looks down at HP, Front looks at
 *  VP, Side looks along X at PP). Distances chosen to frame the SHEET (6 world
 *  units) comfortably; 'side' additionally clears PP's own reach (see above). */
const QUICK_VIEW_POSE = {
  top: { position: new THREE.Vector3(0, 9, 0.01), target: new THREE.Vector3(0, 0, 0) },
  front: { position: new THREE.Vector3(0, 0.5, 9), target: new THREE.Vector3(0, 0.5, 0) },
  side: { position: new THREE.Vector3(13, 0.5, 0), target: new THREE.Vector3(0, 0.5, 0) },
};

const FOLD_MS = 1400;

// ============================================================================
// Module state
// ============================================================================

let renderer, scene, camera, controls, labelRenderer, viewport;
let contentGroup; // disposal-contract target: planes + solid + labels, rebuilt every rebuild()

let currentData = defaultSystemData();
/** The active step's merged view flags (systemSteps.DEFAULT_VIEW shape). */
let currentView = { ...DEFAULT_VIEW };

let folded = false;
let hpFoldAngle = 0;
let ppFoldAngle = 0;
let hpFoldTarget = 0;
let ppFoldTarget = 0;
let foldTween = null;
let cameraTween = null;

let planesHandle = null;
let solidHandle = null;
let labelHandle = null;

let rafId = null;
let running = false;
let lastFrameTime = 0;

const stateChangeSubs = new Set();
const statusRegion = document.getElementById('sim-status');

let stepper = null;
let problemLibrary = null;

// ============================================================================
// Helpers
// ============================================================================

function announce(message) { if (statusRegion) statusRegion.textContent = message; }

function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

function viewportSize() { return { width: viewport?.clientWidth || 1, height: viewport?.clientHeight || 1 }; }

function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) { clearTimeout(window.__simBootTimer); window.__simBootTimer = null; }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
  document.fonts.ready.then(() => { window.parent.postMessage({ type: 'sim:ready' }, '*'); });
}

/** Latchless — every click reposts (current platform Finish-button contract,
 *  MODULE-STARTER.md §3.11 / PLATFORM-RULES.md §1.10). */
function markComplete() { window.parent.postMessage({ type: 'sim:complete' }, '*'); }

// ============================================================================
// BIS symbol badge — plain fixed DOM, not scene-anchored (title-block metaphor).
// Two mirrored SVG variants swapped by data-system; main.js owns visibility +
// which variant, driven from rebuild().
// ============================================================================

// BIS SP46:2003 symbol: a truncated cone (frustum) drawn front-view (trapezoid) beside
// its two concentric circles — the same figure frustums.js draws as real 3D geometry.
// First-angle: trapezoid (narrow end innermost) on the left, circles on the right.
// Third-angle is the BIS-standard horizontal mirror of the WHOLE composition (not just
// the trapezoid) — the circles swap sides too, so both elements move as one unit.
const FA_SYMBOL = {
  first: {
    inner: '<path d="M8 8 L8 32 L40 26 L40 14 Z"/><circle cx="66" cy="20" r="12"/><circle cx="66" cy="20" r="6"/>',
    label: 'FIRST ANGLE PROJECTION',
  },
  third: {
    inner: '<path d="M88 8 L88 32 L56 26 L56 14 Z"/><circle cx="30" cy="20" r="12"/><circle cx="30" cy="20" r="6"/>',
    label: 'THIRD ANGLE PROJECTION',
  },
};

function updateSymbolBadge(system, visible) {
  const el = document.getElementById('fa-symbol');
  const svg = document.getElementById('fa-symbol-svg');
  const label = document.getElementById('fa-symbol-label');
  if (!el) return;
  const spec = FA_SYMBOL[system] || FA_SYMBOL.first;
  if (svg) svg.innerHTML = spec.inner;
  if (label) label.textContent = spec.label;
  if (visible) {
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-visible'));
  } else {
    el.classList.remove('is-visible');
    el.hidden = true;
  }
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (RULES.md §3.1).
// ============================================================================

function disposeContent() {
  planesHandle?.dispose();
  planesHandle = null;
  solidHandle?.dispose();
  solidHandle = null;
  labelHandle?.dispose();
  labelHandle = null;
  contentGroup.clear();
}

function rebuild() {
  disposeContent();
  const { width, height } = viewportSize();
  const system = currentData.system;
  const ppOffset = ppOffsetFor(system);

  planesHandle = createPlanes({ ppOffset, hpFoldAngle, ppFoldAngle, width, height });
  contentGroup.add(planesHandle.group);

  if (currentView.showSolid) {
    solidHandle = createSolidAndViews({ system, shape: currentView.shape || 'box', width, height });
    contentGroup.add(solidHandle.worldGroup);
    if (currentView.showViews) {
      planesHandle.hp.group.add(solidHandle.topView);
      planesHandle.vp.group.add(solidHandle.frontView);
      planesHandle.pp.group.add(solidHandle.sideView);
    }
    solidHandle.setProjectorsVisible(!!currentView.showProjectors);
  }

  const c = objectCenter(system);
  labelHandle = createLabelLayer({
    hpGroup: planesHandle.hp.group,
    ppGroup: planesHandle.pp.group,
    hpAnchorLocal: { x: -2.6, y: 0, z: 0.3 },
    ppAnchorLocal: { x: 0, y: 2.6, z: 0.3 },
    vpAnchorWorld: { x: -2.6, y: 2.6, z: 0 },
    quadrant: currentView.showHP || currentView.showVP ? (system === ProjectionSystem.THIRD ? 'Q3' : 'Q1') : null,
    fAnchorWorld: currentView.showSolid ? solidHandle?.fLabelAnchor : null,
  });
  contentGroup.add(labelHandle.group);

  planesHandle.group.visible = currentView.showHP || currentView.showVP || currentView.showPP;
  planesHandle.hp.group.visible = currentView.showHP;
  planesHandle.vp.group.visible = currentView.showVP;
  planesHandle.ppPivotGroup.visible = currentView.showPP;

  updateSymbolBadge(system, !!currentView.showSymbol);

  notifyStateChange();
}

// ============================================================================
// simController — the injected contract every leaf module receives (ADR-007).
// ============================================================================

const simController = {
  announce,
  markComplete,

  state: () => ({ ...currentData }),
  hasSolid: () => false, // toggling the system is trivially reversible — never gate the confirm dialog

  getSystem: () => currentData.system,
  setSystem(system) {
    if (!Object.values(ProjectionSystem).includes(system) || system === currentData.system) return;
    currentData = { ...currentData, system };
    rebuild();
  },

  applyView(stepView) {
    currentView = { ...DEFAULT_VIEW, ...stepView };
    if (currentView.foldPose === 'open' && folded) {
      folded = false;
      driveFold(0, 0);
    }
    rebuild();
  },

  fold() {
    if (folded) return;
    folded = true;
    driveFold(HP_FOLD_ANGLE, PP_FOLD_ANGLE);
  },
  unfold() {
    if (!folded) return;
    folded = false;
    driveFold(0, 0);
  },
  isFolded: () => folded,

  reset() { window.simAPI.reset(); },
  goStep(n) { stepper?.goStep(n); },

  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
};

/** Tween both hinges toward their targets together on one easeFold curve — HP and
 *  PP always fold in lockstep (they represent one physical "flatten the sheet"
 *  action), duration scaled by the larger remaining arc so a reversal from
 *  mid-swing takes proportionally less time. */
function driveFold(hpTo, ppTo) {
  foldTween?.cancel();
  hpFoldTarget = hpTo;
  ppFoldTarget = ppTo;
  const arc = Math.max(Math.abs(hpTo - hpFoldAngle) / Math.abs(HP_FOLD_ANGLE || 1), Math.abs(ppTo - ppFoldAngle) / Math.abs(PP_FOLD_ANGLE || 1));
  const fromHp = hpFoldAngle, fromPp = ppFoldAngle;
  foldTween = tween({
    from: 0, to: 1, duration: FOLD_MS * Math.max(arc, 0.001), ease: easeFold,
    onUpdate: (t) => {
      hpFoldAngle = fromHp + (hpTo - fromHp) * t;
      ppFoldAngle = fromPp + (ppTo - fromPp) * t;
      planesHandle?.setFoldAngles(hpFoldAngle, ppFoldAngle);
    },
    onComplete: () => { foldTween = null; },
  });
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

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    const el = document.getElementById('sim-context-lost');
    if (el) el.hidden = false;
    announce('The 3D view paused while your device reset its graphics. Restoring.');
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild();
    const el = document.getElementById('sim-context-lost');
    if (el) el.hidden = true;
    announce('3D view restored.');
    startLoop();
  }, false);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  contentGroup = new THREE.Group();
  scene.add(contentGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();
  controls.addEventListener('start', () => { cameraTween?.cancel(); cameraTween = null; });

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);
}

// ============================================================================
// Quick-view camera flights
// ============================================================================

function flyCamera(pose) {
  cameraTween?.cancel();
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  cameraTween = tween({
    from: 0, to: 1, duration: CAMERA_MOVE_MS, ease: easeCamera,
    onUpdate: (t) => {
      camera.position.lerpVectors(fromPos, pose.position, t);
      controls.target.lerpVectors(fromTarget, pose.target, t);
    },
    onComplete: () => { cameraTween = null; },
  });
}

function setupQuickViews() {
  const buttons = [...document.querySelectorAll('[data-quick-view]')];
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.quickView;
      const alreadyActive = btn.classList.contains('is-active');
      for (const b of buttons) { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); }
      if (alreadyActive) {
        flyCamera({ position: DEFAULT_CAMERA_POSITION, target: DEFAULT_CAMERA_TARGET });
        return;
      }
      btn.classList.add('is-active');
      btn.setAttribute('aria-pressed', 'true');
      const pose = QUICK_VIEW_POSE[key];
      if (pose) flyCamera(pose);
    });
  }
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;
  tickTweens(delta);
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function startLoop() { if (running) return; running = true; lastFrameTime = 0; rafId = requestAnimationFrame(animate); }
function stopLoop() { if (!running) return; running = false; cancelAnimationFrame(rafId); rafId = null; }

function handleResize(container) {
  const w = container.clientWidth, h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  planesHandle?.setResolution(w, h);
  solidHandle?.setResolution(w, h);
}

// ============================================================================
// Mobile advisory + wizard toggle (unchanged platform chrome)
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

// ============================================================================
// Reset — guarded by an inline two-state confirm (RULES.md §2.9/§4.19): the
// confirm guards the BUTTON only, window.simAPI.reset() stays the single reset
// path, fired solely by a deliberate "Yes". Ported inline from the platform's
// standard uiManager.js reset-confirm block (kept self-contained here since this
// topic has no other dock content to justify a whole uiManager.js leaf).
// ============================================================================

function setupResetConfirm() {
  const btnReset = document.getElementById('btn-reset');
  const resetConfirm = document.getElementById('reset-confirm');
  const btnResetYes = document.getElementById('btn-reset-yes');
  const btnResetCancel = document.getElementById('btn-reset-cancel');
  if (!btnReset || !resetConfirm || !btnResetYes || !btnResetCancel) return;

  let resetArmed = false;

  function armReset() {
    if (resetArmed) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    btnResetCancel.focus();
    announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }
  function disarmReset({ returnFocus = false } = {}) {
    if (!resetArmed) return;
    resetArmed = false;
    resetConfirm.hidden = true;
    btnReset.hidden = false;
    if (returnFocus) btnReset.focus();
  }

  btnReset.addEventListener('click', armReset);
  btnResetYes.addEventListener('click', () => {
    disarmReset({ returnFocus: true });
    window.simAPI.reset();
  });
  btnResetCancel.addEventListener('click', () => {
    disarmReset({ returnFocus: true });
    announce('Reset cancelled.');
  });
  resetConfirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      disarmReset({ returnFocus: true });
      announce('Reset cancelled.');
    }
  });
  resetConfirm.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  });
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && !resetConfirm.contains(e.target)) disarmReset();
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
    foldTween = null;
    cameraTween = null;
    folded = false;
    hpFoldAngle = 0; ppFoldAngle = 0; hpFoldTarget = 0; ppFoldTarget = 0;
    currentData = defaultSystemData();
    currentView = { ...DEFAULT_VIEW };
    camera.position.copy(DEFAULT_CAMERA_POSITION);
    controls.target.copy(DEFAULT_CAMERA_TARGET);
    controls.update();
    for (const b of document.querySelectorAll('[data-quick-view]')) { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); }
    rebuild();
    stepper?.reset();
    announce('Simulation reset.');
  },
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
    setupMobileNotice();
    setupWizardToggle();
    setupQuickViews();
    setupResetConfirm();
    rebuild();

    stepper = initStepper(simController);
    initTerms();
    problemLibrary = initProblemLibrary(simController);

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  markBooted();
}

init();
