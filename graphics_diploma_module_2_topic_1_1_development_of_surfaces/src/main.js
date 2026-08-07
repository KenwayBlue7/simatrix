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
import { show3D, hide3D, clear3D, rebuild3D, resumeLoop3D } from './view3d.js'; // 3D View, ADR-097/ADR-112 addenda

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

// Default-zoom fix: the Given step's front+top block only, framed with this much drawing-
// space breathing room — same magnitude family as constructions.js's own gap constants
// (CAPTION_GAP=10, dim offsets 12-16). Was the fixed BASE_W×BASE_H box (viewTransform.js),
// sized for the worst-case FULL plate incl. development, so the small Given-step block sat
// lost in a lot of dead space at page load.
const DEFAULT_FIT_MARGIN = 14;
let activePlay = null; // playSteps()/playRollAnimation() handle, so a replay can cancel one

let paused = false;
let lastFrameTime = 0;
let rafId = null;
let solvedAny = false; // a Problem Library problem has matched this page load — gates #btn-finish

// Compare view + docked 50/50 workbench (ADR-012/037/080; roles reversed — see this
// file's own import comment above and ../DECISIONS.md's addendum). simAPI.pause()/resume()
// also gate view3d.js's loop off `compareOpen`.
let compareCard = null;
let compareChip = null;
let compareOpen = false;
let workbenchOpen = false;
/** #given-fields's captured {parent, nextSibling} home inside the Given step-panel, so
 *  exitWorkbench() can put it back exactly where it came from. */
let givenFieldsHome = null;

// ============================================================================
// DOM references — ONE canvas carries the whole plate (ADR-112 §1), not an SVG pair of
// <g> layers. `givenLayer`/`dynamicLayer` are now plain paintable records.
// ============================================================================

const canvas = document.getElementById('construction-canvas');
const viewport3dEl = document.getElementById('viewport-3d'); // 3D View, inside #compare-card's stage
const statusEl = document.getElementById('sim-status');
const givenLayer = createLayer();
const dynamicLayer = createLayer();
// 3rd arg: dblclick routes through resetFit() (defined below), not the leaf's own fixed-box
// resetView() — see that function's own comment. Wrapped in an arrow since resetFit is a
// function DECLARATION further down this file — hoisted, so it's already in scope here.
const viewTransform = initViewTransform(canvas, () => {}, () => resetFit()); // paint() runs every rAF frame regardless — see frame()

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
// builds a `sheet` (Module2 `drawMethodSheet`'s own `projectSheet`/`pxPerUnit` shape,
// `Module2/main.js`) instead of baking pan/zoom into ctx's transform — ctx stays DPR-only
// for this entire paint, and every mark is projected to canvas px inside
// renderConstruction.js's paint* helpers. This is the fix for stroke weights and text
// scaling with zoom (Phase 1 rebuild, see ../DECISIONS.md's ADR for this topic): a
// baked-in `ctx.scale` makes `lineWidth: 1.6` mean 1.6 WORLD units, which is 1.6px only at
// one particular zoom; Module2 never does this — its own `drawMethodSheet` always projects
// points through `projectSheet()` and strokes constant-px widths. ------------------------
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
  const pxPerUnit = Math.min(rect.width / vw, rect.height / vh);
  const offX = (rect.width - vw * pxPerUnit) / 2;
  const offY = (rect.height - vh * pxPerUnit) / 2;
  // Drawing-unit → canvas-px, letterboxed same as before — but this is now a PLAIN
  // FUNCTION renderConstruction.js's paint* helpers call per point, not a ctx transform,
  // so a `strokeWidth: 1.6` line is genuinely 1.6 canvas px at every zoom level.
  const project = (p) => ({ x: (p.x - vx) * pxPerUnit + offX, y: (p.y - vy) * pxPerUnit + offY });

  const sheet = {
    project,
    pxPerUnit,
    // given/move/result — the pedagogical colour axis (DESIGN.md §3), read from their own
    // tokens rather than hard-coded, per RULES.md's "read all colours from CSS tokens" —
    // `given` aliases --color-ink and `move` now aliases --color-ink-secondary in
    // index.html (Phase 1 rebuild retired `move`'s own violet), but this still resolves
    // through the token, not a JS-side alias, so a future token edit stays the one place
    // that changes it.
    given: cssVar('--color-construct-given', '#06070b'),
    move: cssVar('--color-construct-move', '#5a5d66'),
    result: cssVar('--color-construct-result', '#1f8a4c'),
    // ink/inkSecondary — used directly by content that sits OUTSIDE the given/move/result
    // axis (station numerals, leader callouts, region captions: see renderConstruction.js's
    // file header) rather than picking one of the three roles above.
    ink: cssVar('--color-ink', '#06070b'),
    inkSecondary: cssVar('--color-ink-secondary', '#5a5d66'),
    paper: cssVar('--color-paper', '#ffffff'),
    fontSans: cssVar('--font-sans', 'sans-serif'),
    fontMono: cssVar('--font-mono', 'monospace'),
  };
  paintLayer(ctx, givenLayer, sheet);
  paintLayer(ctx, dynamicLayer, sheet);
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

  // Keep the Compare pane's solid in sync with the just-committed params — #given-fields
  // docks into the workbench rail precisely so dimensions stay adjustable WHILE comparing,
  // so (unlike the old sequential 3D View step) the 3D solid can go stale mid-visit if this
  // isn't here.
  if (compareOpen) rebuild3D(state.constructionId, state.params);
  updateCompareChip();

  stepper?.sync();
  problemLibrary?.sync();
}

/** Frame the CURRENT Given-step content tightly (front+top block, role:'given' steps only
 *  — everything else is dynamicLayer, not drawn until Play) instead of viewTransform.js's
 *  fixed worst-case box. Falls back to a plain resetView() when nothing's selected (no
 *  bounds to fit). Call AFTER rebuild() so lastRecipe is fresh. */
function defaultFit() {
  if (!lastRecipe) { viewTransform.resetView(); return; }
  const givenSteps = lastRecipe.steps.filter((s) => s.role === 'given');
  viewTransform.fitToBounds(computeBounds(givenSteps), DEFAULT_FIT_MARGIN);
}

/** Double-click-reset target (viewTransform.js's onResetRequest hook) — content-aware, unlike
 *  a plain defaultFit(): before Play (dynamicLayer empty), double-click should reproduce
 *  EXACTLY the fresh-page-load framing, so it just calls defaultFit(). Once Play has drawn
 *  into dynamicLayer, the given-only block no longer contains everything on screen — the
 *  green development pattern would sit clipped outside that tight frame — so this widens the
 *  fit to the WHOLE recipe (every step, not just role:'given') instead. No lastRecipe falls
 *  through to defaultFit()'s own resetView() fallback, same as every other call site here. */
function resetFit() {
  if (!lastRecipe || dynamicLayer.entries.length === 0) { defaultFit(); return; }
  viewTransform.fitToBounds(computeBounds(lastRecipe.steps), DEFAULT_FIT_MARGIN);
}

// ============================================================================
// Compare view + docked 50/50 workbench (ADR-012 / ADR-037, narrowed by ADR-080 — ported
// from graphics_module_3_topic_2_development_of_surfaces, roles REVERSED: this topic's
// construction canvas is already the primary pane, so Compare docks the 3D solid instead
// of a 2D drawing. See ../DECISIONS.md's addendum for why this replaced the original
// sequential "3D View step" build the same day. Compare has exactly one shape platform-
// wide (ADR-080): the docked split, never a floating card.
// ============================================================================

/** Collapse the wizard, split the viewport 50/50, and dock #given-fields into the rail so
 *  dimensions stay adjustable while comparing. Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;

  const rail = document.getElementById('workbench-rail');
  const givenFields = document.getElementById('given-fields');
  if (rail && givenFields) {
    if (!givenFieldsHome) givenFieldsHome = { parent: givenFields.parentElement, next: givenFields.nextSibling };
    rail.appendChild(givenFields);
  }

  // Re-parent the card out to <body> so the grid can place it as the right pane (ADR-080 —
  // a plain grid cell, not absolutely positioned, but it still needs to leave #sim-viewport
  // to become a body-level sibling of it, since CSS grid-area only applies to direct
  // children of the grid container).
  if (compareCard && compareCard.parentElement !== document.body) {
    document.body.appendChild(compareCard);
  }
  document.body.classList.add('compare-split');
  // The rail toggle always defaults to shown on entry — a prior collapse from an earlier
  // split visit must not carry over.
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
}

/** Restore the floating layout: hand #given-fields back to its captured home slot and
 *  re-nest the card in #sim-viewport. Idempotent. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);

  const simViewport = document.getElementById('sim-viewport');
  if (compareCard && simViewport && compareCard.parentElement !== simViewport) {
    simViewport.appendChild(compareCard);
  }
  if (givenFieldsHome?.parent) {
    const givenFields = document.getElementById('given-fields');
    if (givenFields) givenFieldsHome.parent.insertBefore(givenFields, givenFieldsHome.next);
  }
}

/** Hidden until a construction is chosen (nothing to compare before then); aria-pressed
 *  mirrors the card's open state (CSS fills the pill solid accent while pressed). */
function updateCompareChip() {
  if (!compareChip) return;
  compareChip.hidden = !state.constructionId;
  compareChip.setAttribute('aria-pressed', String(compareOpen));
}

const compare = {
  show() {
    if (!state.constructionId) return; // nothing to compare before a construction exists
    compareOpen = true;
    if (compareCard) compareCard.hidden = false;
    enterWorkbench(); // Compare has exactly one shape now (ADR-080) — always the docked split
    const ok = show3D(viewport3dEl, state.constructionId, state.params);
    if (!ok) window.__showSimFallback?.('webgl');
    updateCompareChip();
    announce('Compare view opened — the solid itself.');
  },
  hide() {
    if (!compareOpen) return;
    compareOpen = false;
    hide3D();
    const wasSplit = workbenchOpen;
    if (wasSplit) exitWorkbench(); // tear the split down before the card vanishes
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Compare view closed.');
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen: () => compareOpen,
};

/** One-source-of-truth sync for #rail-toggle's state facets — called from its own click
 *  handler AND from enter/exitWorkbench, which force-reset it on every split transition. */
function syncRailToggleState(collapsed) {
  const btn = document.getElementById('rail-toggle');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
  btn.title = collapsed ? 'Show controls' : 'Hide controls';
  const txt = btn.querySelector('.rail-toggle__text');
  if (txt) txt.textContent = collapsed ? 'Show' : 'Hide';
}

function setupRailToggle() {
  const btn = document.getElementById('rail-toggle');
  btn?.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('rail-collapsed');
    syncRailToggleState(collapsed);
    announce(collapsed ? 'Controls rail hidden.' : 'Controls rail shown.');
  });
}

/** Bind + wire the Compare chrome once at boot: the chip is Compare's only open/close
 *  control (ADR-080) — there is no separate expand/close head chrome and no breakpoint
 *  fallback to a floating card. */
function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
  compareChip?.addEventListener('click', () => compare.toggle());
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
    defaultFit();
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
    // Clip guard: defaultFit()'s tighter initial frame is sized for the DEFAULT params —
    // a slider dragged toward its max can grow the Given-step block past that frame. Same
    // "zoom out only if it doesn't already fit, leave a manual zoom alone otherwise"
    // contract play() already trusts below.
    if (lastRecipe) {
      viewTransform.ensureVisible(computeBounds(lastRecipe.steps.filter((s) => s.role === 'given')));
    }
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
    compare.hide(); // no-op when closed; also tears the workbench split down first
    state = { constructionId: null, params: {} };
    cancelTweens();
    rebuild();
    clear3D(); // 3D View, ADR-097/ADR-112 addenda — dispose the solid, not the renderer
    stepper.reset();
    uiManager.sync({ rebuildFields: true });
    defaultFit(); // lastRecipe is null post-reset — falls back to plain resetView()
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
    defaultFit();
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
  pause() { paused = true; if (compareOpen) hide3D(); },
  resume() { paused = false; lastFrameTime = 0; if (compareOpen) resumeLoop3D(); },
  reset() { simController.reset(); },
};

// ============================================================================
// Boot
// ============================================================================

function init() {
  rebuild();
  setupWizardToggle();
  setupCompareCard();
  setupRailToggle();
  setupVerifyActions();
  rafId = requestAnimationFrame(frame);
  window.__simBooted = true; // clears the boot watchdog fallback (index.html inline script)
  window.parent.postMessage({ type: 'sim:ready' }, '*'); // host signal (ADR-078) — fires once, init() runs once
}

init();
