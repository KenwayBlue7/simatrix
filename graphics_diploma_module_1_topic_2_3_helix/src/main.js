// Orchestrator — Diploma Engineering Graphics, Module 1 Topic 2.3: Helix.
//
// No Three.js, no CDN import map (ADR-078/ADR-080): the viewport is inline SVG, drawing
// two linked first-angle views of a genuinely 3D helix rather than a 3D orbit scene — see
// ADR-080 for the full reasoning. Owns `state` (which construction is active, its given
// params — including `hand`, the right/left-hand toggle, and the live Sweep Angle scrub —
// and how much of it has been drawn), the single rebuild() pipeline, window.simAPI, and
// the boot watchdog.
//
// EXTRACTED from Topic 2.1/2.2 with ONE addition this topic needs: `defaultsFor()` also
// seeds `hand: 'right'` — Topic 1.2's pattern (rides state.params/commit(), not
// `given[]`). play()'s two-phase playRollAnimation() is unchanged from Topic 2.1/2.2 — it
// only depends on `lastRecipe.animateRoll`; this topic's constructions.js always returns
// an empty `tangentStepsAt()` (there is no tangent/normal phase for a helix construction),
// so phase 2 completes instantly with nothing to draw — a harmless no-op, not a special
// case main.js needs to know about.
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
let completeSent = false; // sim:complete postMessage latch — fires at most once per page load (ADR-081)

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

/** Defaults for a construction's own `given` sliders, PLUS the topic-wide `hand` default
 *  (Topic 1.2's pattern). */
function defaultsFor(construction) {
  return { ...Object.fromEntries(construction.given.map((g) => [g.key, g.default])), hand: 'right' };
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
// playRollAnimation() — sweeps the construction from 0deg to the dialed Sweep Angle,
// live-redrawing both views every frame (division points + projectors + curve-so-far),
// then runs an (always-empty, for this topic) second phase. Byte-identical in shape to
// Topic 2.1/2.2's own playRollAnimation() — it only depends on
// `animateRoll.{toDeg,rollStepsAt,tangentStepsAt}`, which this topic's constructions.js
// provides in the same shape.
// ============================================================================

/** @param {{toDeg:number, rollStepsAt:(deg:number)=>Array, tangentStepsAt:(deg:number)=>Array}} animateRoll */
function playRollAnimation(animateRoll) {
  const { toDeg, rollStepsAt, tangentStepsAt } = animateRoll;
  let cancelled = false;
  let activeTween = null;
  let activeSteps = null;

  // Constant angular speed — the point advances around the cylinder/cone at a steady
  // rate, not easing in/out.
  const linear = (x) => x;
  const duration = Math.max(900, toDeg * 4.5);

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
  },
  flowNote,
  getResultText: () => lastRecipe?.resultText ?? '',
  getInvalidReason: () => lastRecipe?.invalid ?? null,

  // problemLibrary.js — RULES §6.2: "loading a problem resets to defaults and routes to
  // the dial-able step" (the Given step), never the picker and never the target values —
  // that includes `hand`: the student sets it themselves by clicking the toggle, same as
  // dialing any slider, not preset here.
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
  reportComplete() {
    if (completeSent) return;
    completeSent = true;
    window.parent.postMessage({ type: 'sim:complete' }, '*'); // host signal (ADR-081), one-shot
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
  window.parent.postMessage({ type: 'sim:ready' }, '*'); // host signal (ADR-081) — fires once, init() runs once
}

init();
