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

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tick as tickTweens, cancelAll as cancelTweens } from './src/anim.js';

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

/** Subscribers fired at the end of every rebuild() — the single seam every state change passes
 *  through (a future problem-library self-check can ride this). */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

/** First-run onboarding handle from initOnboarding — { setSolidPresent, spotlight, cue }. */
let onboarding;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

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
  // Generate your subject's geometry from `shapeData` and add it to `shapeGroup` here, e.g.:
  //     if (shapeData) shapeGroup.add(buildYourGeometry(shapeData));
  // Nested sub-groups are fine — the deep disposal traversal above reaches every descendant. Keep
  // this the single path — no control may mutate the scene directly (CLAUDE.md).
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
    rebuild(null);     // empty start (grid only) — runs the disposal contract
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
  /** Current on-screen state (null on the empty start). */
  state: () => currentShapeData,

  /** Whether anything is currently on screen (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

  /** Merge params into state and rebuild — the single write path for your controls. */
  commit(partial) { rebuild({ ...(currentShapeData ?? {}), ...partial }); },

  /** Route through the single reset path (re-syncs the wizard + announces). */
  reset() { window.simAPI.reset(); },

  announce,
  flowNote,

  /** Flash an ad-hoc contextual chip over the viewport (the onboarding cue system). */
  cueHint(text) { onboarding?.cue?.(text, 'ink'); },

  /** Fire the once-per-load host completion signal (ADR-078 addendum). */
  markComplete,

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

    // EMPTY START: the scene boots with the reference grid only — no domain geometry. Your first
    // build step is to drive rebuild(...) from a control you add (via simController.commit).
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
