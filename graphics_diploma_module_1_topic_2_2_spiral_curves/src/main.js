// Orchestrator — Diploma Engineering Graphics, Module 1 Topic 2.2: Spiral Curves.
//
// No Three.js, no CDN import map (ADR-095): the viewport is inline SVG. Owns `state`
// (the one construction's given params — including `mode`, the growth-law toggle, and the
// live Roll Angle scrub — and how much of it has been drawn), the single rebuild()
// pipeline, window.simAPI, and the boot watchdog.
//
// EXTRACTED from Topic 2.1 with ONE addition this topic needs: `defaultsFor()` also seeds
// `mode: 'archimedean'` — Topic 1.2's own pattern (`mode` rides `state.params`/`commit()`
// like any other value, but is deliberately NOT in `given[]`, since it's a two-state
// choice, not a numeric slider — bending `given[]`'s generic contract to support a
// non-numeric field for the one topic that needs it would complicate every other
// consumer). play()'s two-phase roll animation (playRollAnimation()) is unchanged from
// Topic 2.1 — it only depends on `lastRecipe.animateRoll`, which constructions.js already
// provides in the same shape.
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/
// onboarding/uiManager/problemLibrary/anim) never import each other; they hang off this
// file only.

import { CONSTRUCTIONS, findConstruction } from './constructions.js';
import { clear, renderStatic, playSteps, computeBounds } from './renderConstruction.js';
import { initStepper } from './stepper.js';
import { initTerms } from './terms.js';
import { initOnboarding } from './onboarding.js';
import { initUIManager } from './uiManager.js';
import { initProblemLibrary } from './problemLibrary.js';
import { initViewTransform } from './viewTransform.js';
import { tick as tickTweens, cancelAll as cancelTweens, tween } from './anim.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

/** @type {{ constructionId: string|null, params: Record<string, number|string> }} */
let state = { constructionId: null, params: {} };

/** The last built recipe (constructions.js output) for the active construction+params. */
let lastRecipe = null;
let activePlay = null; // playSteps()/playRollAnimation() handle, so a replay can cancel one

let paused = false;
let lastFrameTime = 0;
let rafId = null;
let solvedAny = false; // a Problem Library problem has matched this page load — gates #btn-finish

// ============================================================================
// DOM references
// ============================================================================

const givenLayer = document.getElementById('given-layer');
const dynamicLayer = document.getElementById('dynamic-layer');
const statusEl = document.getElementById('sim-status');
const svgEl = document.getElementById('construction-svg');
const viewTransform = initViewTransform(svgEl, svgEl);

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
// rebuild() — the single funnel every construction/param change routes through
// ============================================================================

/** Defaults for a construction's own `given` sliders, PLUS the topic-wide `mode` default
 *  (Topic 1.2's pattern) — every `given[]` key across BOTH growth laws is seeded up front,
 *  so switching the toggle never loses a prior tuning (uiManager.js's syncModeToggle()). */
function defaultsFor(construction) {
  return { ...Object.fromEntries(construction.given.map((g) => [g.key, g.default])), mode: 'archimedean' };
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
// playRollAnimation() — the spiral's two-phase Play: (1) the radius vector actually
// SWEEPS from the pole, tracing the curve live instead of the curve simply appearing;
// (2) once the sweep finishes, the tangent/normal construction draws on top via the
// platform's normal per-step reveal. Byte-identical in shape to Topic 2.1's own
// playRollAnimation() — it only depends on `animateRoll.{toDeg,rollStepsAt,tangentStepsAt}`,
// which this topic's constructions.js provides in the same shape.
// ============================================================================

/** @param {{toDeg:number, rollStepsAt:(deg:number)=>Array, tangentStepsAt:(deg:number)=>Array}} animateRoll */
function playRollAnimation(animateRoll) {
  const { toDeg, rollStepsAt, tangentStepsAt } = animateRoll;
  let cancelled = false;
  let activeTween = null;
  let activeSteps = null;

  // Constant angular speed — a radius vector sweeping at a steady rate, not easing in/out.
  const linear = (x) => x;
  const duration = Math.max(900, toDeg * 6.5);

  activeTween = tween({
    from: 0, to: toDeg, duration, ease: linear,
    onUpdate: (deg) => {
      clear(dynamicLayer);
      renderStatic(dynamicLayer, rollStepsAt(deg));
    },
    onComplete: () => {
      if (cancelled) return;
      activeSteps = playSteps(dynamicLayer, tangentStepsAt(toDeg), {
        onComplete: () => { activeSteps = null; },
      });
    },
  });

  return {
    cancel: () => {
      cancelled = true;
      activeTween?.cancel();
      activeSteps?.cancel();
    },
  };
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
    announce(`${construction.label} selected. Pick a growth law, then adjust its measurements.`);
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
    if (!lastRecipe || !dynamicLayer) return;
    activePlay?.cancel();
    clear(dynamicLayer);
    // A zoomed-in/panned view (viewTransform.js) may not contain the whole construction
    // the animation is about to draw — zoom/pan out just enough to bring it into frame,
    // but only if it isn't already visible (a comfortable manual zoom is left alone).
    viewTransform.ensureVisible(computeBounds(lastRecipe.steps));

    if (lastRecipe.animateRoll) {
      activePlay = playRollAnimation(lastRecipe.animateRoll);
    } else {
      const moveAndResult = lastRecipe.steps.filter((s) => s.role !== 'given');
      activePlay = playSteps(dynamicLayer, moveAndResult, {
        onComplete: () => { activePlay = null; },
      });
    }
  },
  reset() {
    state = { constructionId: null, params: {} };
    cancelTweens();
    rebuild();
    stepper.reset();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    announce('Reset. Choose a curve to begin.');
    // solvedAny is deliberately NOT cleared here — #btn-finish's gate is page-load
    // scoped, not session-scoped, same reset-immunity the retired completeSent latch had.
  },
  flowNote,
  getResultText: () => lastRecipe?.resultText ?? '',
  getInvalidReason: () => lastRecipe?.invalid ?? null,

  // problemLibrary.js — RULES §6.2: "loading a problem resets to defaults and routes to
  // the dial-able step" (the Given step), never the picker and never the target values —
  // that includes `mode`: a problem's target growth law is something the student sets by
  // clicking the toggle themselves, same as dialing any slider, not preset here.
  getConstructionId: () => state.constructionId,
  loadProblem(constructionId) {
    const construction = findConstruction(constructionId);
    state = { constructionId: construction.id, params: defaultsFor(construction) };
    rebuild();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    stepper.goToGivenStep();
    announce(`${construction.label} selected for this problem. Pick the growth law and adjust the measurements to match, then continue.`);
  },
  hasSolvedProblem: () => solvedAny,
  onProblemSolved() {
    solvedAny = true;
    stepper.sync(); // re-render the footer so #btn-finish enables at the Verify step
  },
  markComplete() {
    // Host signal (ADR-078 addendum, revised): no latch — every Finish click reposts.
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
// Render loop — drives anim.js's tween queue during play(). Nothing else needs a
// continuous loop (no camera, no orbit), but the tween engine is ticked from one place
// so simAPI.pause() can freeze an in-flight construction animation.
// ============================================================================

function frame(now) {
  rafId = requestAnimationFrame(frame);
  if (paused) { lastFrameTime = now; return; }
  const delta = lastFrameTime ? now - lastFrameTime : 16;
  lastFrameTime = now;
  tickTweens(delta);
}

// ============================================================================
// Wizard hide/show — collapse the guided-steps panel for a larger viewport.
// Toggles a body class; #sim-viewport is flex:1 so it reflows to fill the space.
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
// Verify step actions — "Choose another curve" returns to the picker without a full
// reset (stepper.js's restart(), scaffolded for exactly this); "Try it as a problem"
// opens the same Problem Library as the persistent eyebrow entry, offered again here
// since Verify is the natural end of the un-prompted flow.
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
