// Orchestrator — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons.
//
// No Three.js, no CDN import map (ADR-095): the viewport is inline SVG. Owns `state`
// (which construction is active, its given params, and how much of it has been drawn),
// the single rebuild() pipeline, window.simAPI, and the boot watchdog.
//
// Copied from Topic 1.1's main.js. One addition this topic needs: every construction here
// carries a `methods` array (constructions.js) — a live method switcher (uiManager.js) lets
// the student re-derive the SAME polygon by a different classical technique. `method`
// defaults to that construction's own first method id and rides the same `state.params`/
// `commit()` funnel as every numeric param — this file doesn't know or care that one of its
// values happens to be a string, same pattern Topic 1.2 used for its mode toggle.
//
// rebuild()'s shape (re-expressed from ADR-004's 3D-solid pipeline for a 2D SVG
// substrate, per ADR-095's own "no prior ADR tested this" admission):
//   dispose previous construction's SVG children -> resolve the active construction's
//   given parameters -> compute construction geometry as plain data (constructions.js)
//   -> render the GIVEN elements into #given-layer -> place labels -> notify (drives
//   step-gating + the Problem Library self-check). The MOVE/RESULT elements are drawn
//   separately by play() into #dynamic-layer, animated, replayable without re-deriving
//   the given elements.
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/
// onboarding/uiManager/problemLibrary/anim) never import each other; they hang off this
// file only.

import { CONSTRUCTIONS, findConstruction } from './constructions.js';
import { clear, renderStatic, playSteps, computeBounds, assignLabelPositions } from './renderConstruction.js';
import { initStepper } from './stepper.js';
import { initTerms } from './terms.js';
import { initOnboarding } from './onboarding.js';
import { initUIManager } from './uiManager.js';
import { initProblemLibrary } from './problemLibrary.js';
import { initViewTransform } from './viewTransform.js';
import { tick as tickTweens, cancelAll as cancelTweens } from './anim.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

/** @type {{ constructionId: string|null, params: Record<string, number|string> }} */
let state = { constructionId: null, params: {} };

/** The last built recipe (constructions.js output) for the active construction+params. */
let lastRecipe = null;
let activePlay = null; // playSteps() handle, so a replay can cancel an in-flight one

let paused = false;
let lastFrameTime = 0;
let rafId = null;
let solvedAny = false; // a Problem Library problem has matched this page load — gates #btn-finish
// Topic-only deviation from the platform-wide Finish gate (ADR-078 2026-07-31 addendum):
// reaching Verify alone unlocks #btn-finish, no problem-solve required. Kept as a SEPARATE
// flag from solvedAny (not a reuse of onProblemSolved()) so "solved" still means solved and
// this stays honest about what actually happened. See DECISIONS.md for the recorded carve-out.
let verifyReached = false;

// ============================================================================
// DOM references
// ============================================================================

const givenLayer = document.getElementById('given-layer');
const dynamicLayer = document.getElementById('dynamic-layer');
const statusEl = document.getElementById('sim-status');
const svgEl = document.getElementById('construction-svg');
const viewTransform = initViewTransform(svgEl, svgEl);

function announce(msg) { if (statusEl) statusEl.textContent = msg; }

/** Toggles the post-construction de-emphasis state (index.html's `.is-complete` rule fades
 *  every 'move'-role element once true). Cleared at the start of every redraw path (play(),
 *  revealSlide(), showStepsUpTo(), rebuild()) and set only once the FULL construction is
 *  actually on screen — never partway through an animation or a Step Through slide that
 *  isn't the last one. Phase A audit, ADR-145. */
function setComplete(isComplete) {
  dynamicLayer?.classList.toggle('is-complete', isComplete);
}

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

/** Defaults for a construction's own `given` sliders, PLUS its method switcher's default —
 *  always that construction's OWN first method (pentagon/hexagon/n-gon each declare a
 *  different `methods` list, so there is no single fixed default like Topic 1.2's 'external'). */
function defaultsFor(construction) {
  return {
    ...Object.fromEntries(construction.given.map((g) => [g.key, g.default])),
    method: construction.methods[0].id,
  };
}

function rebuild() {
  clear(givenLayer);
  clear(dynamicLayer);
  setComplete(false);
  activePlay?.cancel();
  activePlay = null;

  const construction = state.constructionId ? findConstruction(state.constructionId) : null;
  onboarding?.setConstructionPresent(!!construction);

  if (!construction) {
    lastRecipe = null;
  } else {
    lastRecipe = construction.build(state.params);
    const givenSteps = lastRecipe.steps.filter((s) => s.role === 'given');
    renderStatic(givenLayer, givenSteps, lastRecipe.chromeScale);
    // Resolved ONCE here (not per Play/Step-Through click) over the FULL move/result array —
    // Step Through reveals it in slide slices, and a slice-local label-collision pass could
    // only see that slide's own points, so a later slide's label could land on an earlier
    // one's. See renderConstruction.js's assignLabelPositions() header for why calling it
    // again per-slice afterward (inside playSteps()/renderStatic()) is safe and idempotent.
    lastRecipe.resolvedMoveResult = assignLabelPositions(
      lastRecipe.steps.filter((s) => s.role !== 'given'),
      lastRecipe.chromeScale,
    );
  }

  // Keep the SVG's own accessible name in sync with what's actually drawn (RULES §4.12 —
  // a screen-reader user gets the same "what is this" a sighted student reads off the
  // dimension label, not a static "drawing area" that never changes). Phase A audit, ADR-145.
  svgEl?.setAttribute(
    'aria-label',
    construction ? `${construction.label} construction drawing. ${lastRecipe.resultText}.`
      : 'Construction drawing area. Choose a construction to begin.',
  );

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
    announce(`${construction.label} selected. Adjust the given value, then continue.`);
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
    setComplete(false);
    // A zoomed-in/panned view (viewTransform.js) may not contain the whole construction
    // the animation is about to draw — zoom/pan out just enough to bring it into frame,
    // but only if it isn't already visible (a comfortable manual zoom is left alone).
    viewTransform.ensureVisible(computeBounds(lastRecipe.steps));
    activePlay = playSteps(dynamicLayer, lastRecipe.resolvedMoveResult, {
      onComplete: () => { activePlay = null; setComplete(true); },
      chromeScale: lastRecipe.chromeScale,
    });
  },

  // Step Through (N-Gon construction only — hasSlides()/getSlides() are empty/false for
  // every other construction, which is the feature flag uiManager.js branches on, not a
  // construction-id check). revealSlide() mirrors play()'s own shape but over a slide's
  // own index RANGE — the "watch it get built" tween mechanism plays for the NEW slide
  // only, the same reason renderConstruction.js's own header gives for the whole tween
  // mechanism. showStepsUpTo() is what Back uses instead: an instant, unanimated redraw of
  // everything through a given point — a state jump, not a construction move.
  hasSlides: () => !!lastRecipe?.slides?.length,
  getSlides: () => lastRecipe?.slides ?? [],
  revealSlide(range, { onComplete } = {}) {
    if (!lastRecipe?.resolvedMoveResult || !dynamicLayer) return;
    activePlay?.cancel();
    activePlay = null;
    // A Next click can land before the PREVIOUS slide's own draw-on animation finished —
    // cancel() above stops that tween mid-flight with no way back to its t=1 end state, so
    // a rushed click would otherwise leave a permanently stuck partial arc/line behind.
    // Snapping everything before this slide to its finished state first (instant, no
    // animation) makes revealSlide() correct regardless of click timing; only the NEW
    // slide itself gets the animated tween.
    clear(dynamicLayer);
    setComplete(false);
    if (range.startIdx > 0) {
      renderStatic(dynamicLayer, lastRecipe.resolvedMoveResult.slice(0, range.startIdx), lastRecipe.chromeScale);
    }
    viewTransform.ensureVisible(computeBounds(lastRecipe.steps));
    const stepsSlice = lastRecipe.resolvedMoveResult.slice(range.startIdx, range.endIdx);
    const isLastSlide = range.endIdx >= lastRecipe.resolvedMoveResult.length;
    activePlay = playSteps(dynamicLayer, stepsSlice, {
      onComplete: () => {
        activePlay = null;
        if (isLastSlide) setComplete(true);
        onComplete?.();
      },
      chromeScale: lastRecipe.chromeScale,
    });
  },
  showStepsUpTo(endIdx) {
    if (!dynamicLayer) return;
    activePlay?.cancel();
    activePlay = null;
    clear(dynamicLayer);
    if (endIdx > 0 && lastRecipe?.resolvedMoveResult) {
      renderStatic(dynamicLayer, lastRecipe.resolvedMoveResult.slice(0, endIdx), lastRecipe.chromeScale);
    }
    setComplete(!!lastRecipe?.resolvedMoveResult && endIdx >= lastRecipe.resolvedMoveResult.length);
  },
  reset() {
    state = { constructionId: null, params: {} };
    cancelTweens();
    rebuild();
    stepper.reset();
    uiManager.sync({ rebuildFields: true });
    viewTransform.resetView();
    announce('Reset. Choose a construction to begin.');
    // solvedAny is deliberately NOT cleared here — #btn-finish's gate is page-load
    // scoped, not session-scoped, same reset-immunity the retired completeSent latch had.
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
    announce(`${construction.label} selected for this problem. Adjust the given value to match, then continue.`);
  },
  hasSolvedProblem: () => solvedAny || verifyReached,
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
// Verify step actions — "Choose another construction" returns to the picker without
// a full reset (stepper.js's restart(), scaffolded for exactly this); "Try it as a
// problem" opens the same Problem Library as the persistent eyebrow entry, offered
// again here since Verify is the natural end of the un-prompted flow.
// ============================================================================

function setupVerifyActions() {
  document.getElementById('btn-verify-restart')?.addEventListener('click', () => stepper.restart());
  document.getElementById('btn-verify-problems')?.addEventListener('click', () => problemLibrary.open());
}

// Topic-only Finish-gate deviation (ADR-078 2026-07-31 addendum carve-out — see DECISIONS.md).
// Watches the Verify panel's `hidden` attribute rather than editing stepper.js's per-topic-
// copied goToStep() — stepper.js stays byte-identical to sibling Diploma topics (CLAUDE.md's
// EXTRACTED/unchanged audit note). Fires once; harmless if it fires again (idempotent flag).
function setupVerifyGate() {
  const panel = document.querySelector('.step-panel[data-step="4"]');
  if (!panel) return;
  const mo = new MutationObserver(() => {
    if (verifyReached || panel.hidden) return;
    verifyReached = true;
    stepper.sync(); // re-render footer so #btn-finish enables
  });
  mo.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
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
  setupVerifyGate();
  rafId = requestAnimationFrame(frame);
  window.__simBooted = true; // clears the boot watchdog fallback (index.html inline script)
  window.parent.postMessage({ type: 'sim:ready' }, '*'); // host signal (ADR-078) — fires once, init() runs once
}

init();
