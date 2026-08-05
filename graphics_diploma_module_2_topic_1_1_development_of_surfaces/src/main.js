// Orchestrator — Diploma Engineering Graphics, Module 2 Topic 1.1: Development of
// Surfaces (ADR-112).
//
// No Three.js, no CDN import map (ADR-095, invoked): the viewport is ONE `<canvas>`
// (ADR-112 §1 — a deliberate deviation from this track's usual SVG orchestrator), drawing
// the front view, top view/auxiliary circle, and stretch-out development together as a
// single continuous plate, transfer lines crossing freely between them exactly as Bhatt
// Fig. 15-8/15-10 and K.C. John Fig. 15.4/15.7/15.12 draw it.
//
// Owns `state` (which construction is active, its given params), the single rebuild()
// pipeline, window.simAPI, and the boot watchdog — same shape as every other Diploma
// topic's main.js, with the SVG group refs (`givenLayer`/`dynamicLayer` as DOM nodes)
// replaced by `createLayer()` records (ADR-112 §1) and a per-frame `paint()` that resolves
// CSS custom properties to real colour strings (canvas cannot read a raw `var(--token)`
// string the way SVG presentation attributes can) and sets ctx's transform from the
// current pan/zoom view-state before delegating to renderConstruction.js's paintLayer().
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/
// onboarding/uiManager/problemLibrary/anim) never import each other; they hang off this
// file only.

import { CONSTRUCTIONS, findConstruction } from './constructions.js';
import { createLayer, clear, renderStatic, playSteps, computeBounds, paintLayer } from './renderConstruction.js';
import { initStepper } from './stepper.js';
import { initTerms } from './terms.js';
import { initOnboarding } from './onboarding.js';
import { initUIManager } from './uiManager.js';
import { initProblemLibrary } from './problemLibrary.js';
import { initViewTransform } from './viewTransform.js';
import { tick as tickTweens, cancelAll as cancelTweens, tween } from './anim.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function cssVar(name, fallback = '') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// ============================================================================
// Module state
// ============================================================================

/** @type {{ constructionId: string|null, params: Record<string, number> }} */
let state = { constructionId: null, params: {} };

/** The last built recipe (constructions.js output) for the active construction+params. */
let lastRecipe = null;
let activePlay = null; // playSteps()/playRollAnimation() handle, so a replay can cancel one

let paused = false;
let lastFrameTime = 0;
let rafId = null;
let solvedAny = false; // a Problem Library problem has matched this page load — gates #btn-finish

// ============================================================================
// DOM references — ONE canvas carries the whole plate (ADR-112 §1), not an SVG pair of
// <g> layers. `givenLayer`/`dynamicLayer` are now plain paintable records.
// ============================================================================

const canvas = document.getElementById('construction-canvas');
const statusEl = document.getElementById('sim-status');
const givenLayer = createLayer();
const dynamicLayer = createLayer();
const viewTransform = initViewTransform(canvas, () => {}); // paint() runs every rAF frame regardless — see frame()

function announce(msg) { if (statusEl) statusEl.textContent = msg; }

let flowNoteTimer = null;
function flowNote(msg) {
  const el = document.getElementById('flow-note');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-visible'));
  clearTimeout(flowNoteTimer);
  flowNoteTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => { el.hidden = true; }, prefersReducedMotion ? 0 : 200);
  }, 1800);
}

// ============================================================================
// paint() — the one function that touches the canvas. Resolves the current theme's
// tokens fresh every call (cheap for this simple 2D scene, and correct across a live
// light/dark toggle with no extra listener), sizes the DPR-scaled backing store, then
// sets ctx's transform from viewTransform's current view-state (letterboxed, uniform
// scale — same "meet" semantics as SVG's preserveAspectRatio) before delegating to
// renderConstruction.js's paintLayer() for both layers, in z-order (given, then dynamic).
// ============================================================================

function paint() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.round(rect.width * dpr);
  const targetH = Math.round(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const ctx = canvas.getContext('2d');

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = cssVar('--color-paper', '#ffffff');
  ctx.fillRect(0, 0, rect.width, rect.height);

  const { vx, vy, vw, vh } = viewTransform.getView();
  const scale = Math.min(rect.width / vw, rect.height / vh);
  const offX = (rect.width - vw * scale) / 2;
  const offY = (rect.height - vh * scale) / 2;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (offX - vx * scale), dpr * (offY - vy * scale));

  const palette = {
    given: cssVar('--color-construct-given', '#5a5d66'),
    move: cssVar('--color-construct-move', '#7b4fb5'),
    result: cssVar('--color-construct-result', '#1f8a4c'),
    tool: cssVar('--color-ink-secondary', '#5a5d66'),
    inkSecondary: cssVar('--color-ink-secondary', '#5a5d66'),
    paper: cssVar('--color-paper', '#ffffff'),
    fontSans: cssVar('--font-sans', 'sans-serif'),
    fontMono: cssVar('--font-mono', 'monospace'),
  };
  paintLayer(ctx, givenLayer, palette);
  paintLayer(ctx, dynamicLayer, palette);
}

// ============================================================================
// rebuild() — the single funnel every construction/param change routes through
// ============================================================================

function defaultsFor(construction) {
  return Object.fromEntries(construction.given.map((g) => [g.key, g.default]));
}

function rebuild() {
  clear(givenLayer);
  clear(dynamicLayer);
  activePlay?.cancel();
  activePlay = null;

  const construction = state.constructionId ? findConstruction(state.constructionId) : null;
  onboarding?.setConstructionPresent(!!construction);

  if (!construction) {
    lastRecipe = null;
  } else {
    lastRecipe = construction.build(state.params);
    const givenSteps = lastRecipe.steps.filter((s) => s.role === 'given');
    renderStatic(givenLayer, givenSteps);
  }

  stepper?.sync();
  problemLibrary?.sync();
}

// ============================================================================
// simController — the small object every leaf module receives, never reaching back
// into the DOM/state directly (RULES.md §3.2, re-expressed for this substrate)
// ============================================================================

const simController = {
  // stepper.js
  announce,
  hasConstruction: () => !!state.constructionId,
  getConstructionLabel: () => (state.constructionId ? findConstruction(state.constructionId).label : null),
  selectConstruction(id) {
    const construction = findConstruction(id);
    state = { constructionId: construction.id, params: defaultsFor(construction) };
    rebuild();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    announce(`${construction.label} selected. Adjust the given values, then continue.`);
  },
  onEnterConstructStep() { onboarding?.playHint(); },

  // uiManager.js
  getActiveConstruction: () => (state.constructionId ? findConstruction(state.constructionId) : null),
  getParams: () => state.params,
  commit(partial) {
    state.params = { ...state.params, ...partial };
    rebuild();
    uiManager.sync({ rebuildFields: false });
  },
  play() {
    if (!lastRecipe) return;
    activePlay?.cancel();
    clear(dynamicLayer);
    // A zoomed-in/panned view (viewTransform.js) may not contain the whole construction
    // the animation is about to draw — zoom/pan out just enough to bring it into frame,
    // but only if it isn't already visible (a comfortable manual zoom is left alone).
    viewTransform.ensureVisible(computeBounds(lastRecipe.steps));

    const moveAndResult = lastRecipe.steps.filter((s) => s.role !== 'given');
    activePlay = playSteps(dynamicLayer, moveAndResult, {
      onComplete: () => { activePlay = null; },
    });
  },
  reset() {
    state = { constructionId: null, params: {} };
    cancelTweens();
    rebuild();
    stepper.reset();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    announce('Reset. Choose a solid to begin.');
    // solvedAny is deliberately NOT cleared here — #btn-finish's gate is page-load
    // scoped, not session-scoped, same reset-immunity the platform's own retired
    // completeSent latch had.
  },
  flowNote,
  getResultText: () => lastRecipe?.resultText ?? '',
  getInvalidReason: () => lastRecipe?.invalid ?? null,

  // problemLibrary.js — RULES §6.2: "loading a problem resets to defaults and routes to
  // the dial-able step" (the Given step), never the picker and never the target values.
  getConstructionId: () => state.constructionId,
  loadProblem(constructionId) {
    const construction = findConstruction(constructionId);
    state = { constructionId: construction.id, params: defaultsFor(construction) };
    rebuild();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    stepper.goToGivenStep();
    announce(`${construction.label} selected for this problem. Adjust the given values to match, then continue.`);
  },
  hasSolvedProblem: () => solvedAny,
  onProblemSolved() {
    solvedAny = true;
    stepper.sync(); // re-render the footer so #btn-finish enables at the Verify step
  },
  markComplete() {
    // Host signal (ADR-078 addendum): no latch — every Finish click reposts.
    window.parent.postMessage({ type: 'sim:complete' }, '*');
  },
};

// ============================================================================
// Leaf modules
// ============================================================================

const stepper = initStepper(simController);
const terms = initTerms();
const onboarding = initOnboarding();
const uiManager = initUIManager(simController);
const problemLibrary = initProblemLibrary(simController);

// ============================================================================
// Render loop — ticks anim.js's tween queue AND repaints the canvas every frame
// (unconditionally; this is a simple 2D scene, so there is no dirty-flag bookkeeping to
// get wrong — the same reasoning the KTU-track Compare sheet's drawCompare() uses). This
// is the ONE place simAPI.pause() needs to freeze to stop everything (an in-flight
// construction animation AND the live pan/zoom redraw).
// ============================================================================

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (paused) { lastFrameTime = now; return; }
  const delta = lastFrameTime ? now - lastFrameTime : 16;
  lastFrameTime = now;
  tickTweens(delta);
  paint();
}

// ============================================================================
// Wizard hide/show — collapse the guided-steps panel for a larger viewport.
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');
  });
}

// ============================================================================
// Verify step actions
// ============================================================================

function setupVerifyActions() {
  document.getElementById('btn-verify-restart')?.addEventListener('click', () => stepper.restart());
  document.getElementById('btn-verify-problems')?.addEventListener('click', () => problemLibrary.open());
}

// ============================================================================
// window.simAPI — the platform contract (ADR-002). No second reset path.
// ============================================================================

window.simAPI = {
  pause() { paused = true; },
  resume() { paused = false; lastFrameTime = 0; },
  reset() { simController.reset(); },
};

// ============================================================================
// Boot
// ============================================================================

function init() {
  rebuild();
  setupWizardToggle();
  setupVerifyActions();
  rafId = requestAnimationFrame(frame);
  window.__simBooted = true; // clears the boot watchdog fallback (index.html inline script)
  window.parent.postMessage({ type: 'sim:ready' }, '*'); // host signal (ADR-078) — fires once, init() runs once
}

init();
