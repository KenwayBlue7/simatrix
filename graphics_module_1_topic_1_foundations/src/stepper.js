// Guided-stepper controller (Module 1 Topic 1). The wizard shell that sequences the
// four-step line-type lesson, revealing one BIS line layer at a time (progressive
// disclosure) and gating each step behind the previous one's reveal.
//
//   1. Type A — Visible      — visible solid edges (+ the near bore circle)
//   2. Type E/F — Hidden     — hidden dashed edges
//   3. Type G — Centre lines — chain centre lines
//   4. Type B — Dimensions   — dimensions (L, H, bore Ø)
//
// The Bearing Block is PRESENT and orbitable from Step 1 (Decision 2 / plan §7); the
// steps do not build the part, they switch on successive line layers, cumulatively.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. It imports NO other layer; main.js
// injects the `sim` controller. This module owns step flow, the rail/card chrome, the
// reveal buttons, and nothing in the 3D scene directly.

// Per-step copy — title, one-line lead, and the textbook-grade `body` prose (with its
// inline glossary term-buttons) — is the single source of truth in foundationSteps.js;
// the stepper only paints it. (A terse copy of just the leads used to live here.)
import { STEPS } from './foundationSteps.js';

const TOTAL = STEPS.length;

/**
 * @param {{
 *   setXray: (on: boolean) => void,
 *   showCentreLines: (on: boolean) => void,
 *   showDimensions: (on: boolean) => void,
 *   setDimMode: (mode: 'aligned'|'uni') => void,
 *   frontView: () => void,
 *   completeLesson: () => void,
 *   reset: () => void,
 *   announce: (msg: string) => void,
 *   markComplete: () => void,
 * }} sim
 * @returns {{ sync: () => void, reset: () => void, dimensionsRevealed: () => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // --- DOM ---
  const card = $('step-card');
  const scrollRegion = card?.querySelector('.card__scroll'); // the inner region that scrolls
  const railItems = [...document.querySelectorAll('#step-rail .rail__item')];
  const panels = [...document.querySelectorAll('.step-panel')];
  const elCurrent = $('step-current');
  const elTotal = $('step-total');
  const elTitle = $('step-title');
  const elLead = $('step-lead');
  const elBody = $('step-body');
  const elPostBody = $('step-post-body'); // "How it is drawn" prose, painted below the controls

  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnFinish = $('btn-finish');
  const btnReset = $('btn-reset');

  const btnHidden = $('btn-hidden');
  const btnCentre = $('btn-centre');
  const btnDim = $('btn-dim');
  const btnZoom = $('btn-zoom-arrow'); // wired in main.js; referenced here only to catch focus
  const doneHidden = $('done-hidden');
  const doneCentre = $('done-centre');
  const doneDim = $('done-dim');

  // Step-4 dimensioning-system toggle. (Completion feedback is the one-shot success toast
  // fired by main.js — there is no inline "Lesson Completed!" footer note any more.)
  const dimModeGroup = $('dim-mode');
  const dimModeBtns = [...document.querySelectorAll('#dim-mode .seg__btn')];

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state. Layer flags mirror what the engine is currently showing.
  //     `state.hidden` LATCHES once the learner has X-rayed the solid even once (it gates
  //     Step 2's Next + rail check); `xrayOn` is the LIVE toggle — whether the solid is
  //     currently see-through. `completed` latches when the Step-4 dimensions are revealed
  //     (the lesson's final action) — it fires the success toast once and turns the rail
  //     terminal-green. ---
  let currentStep = 1;
  let xrayOn = false; // live Step-2 X-ray state (solid faces hidden)
  let dimMode = 'aligned'; // Step-4 dimensioning system: 'aligned' (BIS default) | 'uni'
  const state = { hidden: false, centre: false, dimensions: false, completed: false };

  /** Whether step i counts as complete (drives rail checks + Next gating). */
  function isComplete(i) {
    switch (i) {
      case 1: return true; // the block is present and visible from the start
      case 2: return state.hidden;
      case 3: return state.centre;
      case 4: return state.dimensions;
      default: return false;
    }
  }

  /** Whether the learner may advance from the current step. */
  function canAdvance(step) {
    if (step >= TOTAL) return false; // step 4 is terminal
    return isComplete(step);
  }

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  function renderRail() {
    for (const item of railItems) {
      const i = Number(item.dataset.step);
      const marker = item.querySelector('.rail__marker');
      const btn = item.querySelector('.rail__btn');
      const labelEl = item.querySelector('.rail__label');
      // Terminal step flips from "current" (accent) to "complete" (green ✓) once the
      // learner reveals the Step-4 dimensions — the lesson's finished payoff, even though
      // Step 4 is still the step on screen.
      const terminal = i === TOTAL && state.completed;
      const current = i === currentStep && !terminal;
      const complete = terminal || (!current && isComplete(i));
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      item.classList.toggle('is-upcoming', !current && !complete);
      // Non-colour cue (Two-Cue Rule): check glyph when complete, number otherwise.
      if (marker) marker.textContent = complete ? '✓' : String(i);

      if (btn) {
        // One-way-back map: jump to the current step or any completed step; upcoming
        // steps stay locked, so forward progress is still gated by completion.
        btn.disabled = !(current || complete);
        const name = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
        const stateWord = current ? 'current step' : complete ? 'completed, go to step' : 'locked';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${stateWord}`);
        if (current) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    }
  }

  /** Reflect the layer flags into the per-step reveal buttons + done badges. */
  function renderActions() {
    // Step 2 is a persistent X-ray TOGGLE (not a one-shot reveal), so the button stays put
    // and just relabels; the done badge latches once the wireframe has been revealed.
    if (btnHidden) {
      btnHidden.textContent = xrayOn ? 'Show the solid again' : 'Reveal hidden lines';
      btnHidden.setAttribute('aria-pressed', xrayOn ? 'true' : 'false');
    }
    doneHidden?.classList.toggle('is-on', state.hidden);
    if (btnCentre) btnCentre.hidden = state.centre;
    doneCentre?.classList.toggle('is-on', state.centre);
    if (btnDim) btnDim.hidden = state.dimensions;
    doneDim?.classList.toggle('is-on', state.dimensions);
    // Aligned/Unidirectional toggle surfaces once the dimensions (and their values) exist.
    if (dimModeGroup) dimModeGroup.hidden = !state.dimensions;
    renderDimMode();
  }

  /** Reflect the current dimMode onto the segmented control (active fill + aria-pressed). */
  function renderDimMode() {
    for (const btn of dimModeBtns) {
      const on = btn.dataset.mode === dimMode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    // Back button parity with Module 2: hidden only on Step 1, so it stays visible and
    // functional on the terminal step.
    if (btnBack) btnBack.hidden = currentStep === 1;
    const onLast = currentStep >= TOTAL;
    if (btnNext) {
      btnNext.hidden = onLast; // terminal step: no Next (completion is signalled by the toast)
      btnNext.disabled = !canAdvance(currentStep);
    }
    // Finish lesson: takes over the footer's primary nav slot exactly when Next vacates it
    // (terminal step), same mutual-exclusivity idiom as Module2's #btn-finish. Enabled once the
    // Step-4 dimensions are revealed — the same signal state.completed/onDimensionsShown already
    // gates on, no new completion concept invented.
    if (btnFinish) {
      btnFinish.hidden = !onLast;
      btnFinish.disabled = !state.dimensions;
    }
  }

  /** Show one step's panel (progressive disclosure) and update card copy + chrome. */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);

    // Any navigation (Back / Next / rail) pulls the camera out of a micro-zoom back to
    // the frame the learner was in. No-op unless currently zoomed, so boot's goToStep(1)
    // is safe.
    sim.restoreView?.();

    // X-ray is a PERSISTENT toggle, not a Step-2-only mode: stepping away (either
    // direction) deliberately leaves the solid see-through so the wireframe carries the
    // centre lines (Step 3) and dimensions (Step 4). It clears only when the learner
    // toggles it back on Step 2 (btnHidden) or presses Reset — never on navigation.

    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;
    // body is HTML (bold subheadings + inline glossary term-buttons) → innerHTML, not text.
    // Split so the reveal controls aren't buried below the (hidden) scrollbar: `open`
    // ("What it is" + "Why we use it") paints in #step-body ABOVE the controls; `postBody`
    // ("How it is drawn") paints in #step-post-body BELOW them. Steps without a postBody
    // (e.g. Step 1) yield '' and clear the container. Both render inline and fully visible.
    if (elBody) {
      const body = meta.body || {};
      const toParas = (arr) => (arr || []).map((p) => `<p>${p}</p>`).join('');
      elBody.innerHTML = toParas(body.open);
      if (elPostBody) elPostBody.innerHTML = toParas(body.postBody);
    }

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      panel.classList.toggle('is-active', show); // re-triggers the panelIn animation
    }

    if (scrollRegion) scrollRegion.scrollTop = 0; // start each step from its title

    renderRail();
    renderActions();
    renderNav();

    if (announce) {
      sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
      // Move focus to the step heading so keyboard/SR users land on the new step (and never
      // on a control that a step change may have hidden). preventScroll: the region is already
      // reset to the top. Skipped on the silent boot/reset render (announce:false).
      elTitle?.focus?.({ preventScroll: true });
    }
  }

  /** Keep keyboard focus inside the card after a reveal button hides itself. Prefer the given
   *  next control; fall back to the step heading so focus never drops to <body>. */
  function refocus(preferred) {
    const el = preferred && !preferred.hidden && !preferred.disabled ? preferred : elTitle;
    el?.focus?.({ preventScroll: true });
  }

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  // Step 2 — X-ray toggle: make the solid see-through to reveal the hidden edges, or
  // bring the faces back. The first reveal latches state.hidden so Step 2 counts complete.
  // (The button relabels rather than hides, so focus stays on it; no refocus needed.)
  btnHidden?.addEventListener('click', () => {
    xrayOn = !xrayOn;
    sim.setXray(xrayOn);
    state.hidden = true;
    sim.announce(xrayOn
      ? 'Solid hidden. The hidden edges (Type E/F) now show through the body.'
      : 'Solid shown again.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Step 3 — reveal centre lines. The button hides on reveal, so move focus to Next (now
  // enabled) instead of letting it fall to <body>.
  btnCentre?.addEventListener('click', () => {
    sim.showCentreLines(true);
    state.centre = true;
    sim.announce('Centre lines revealed. Chain Type G axes.');
    renderRail(); renderActions(); renderNav();
    refocus(btnNext);
  }, listen);

  // Step 4 — reveal dimensions. This is the lesson's FINAL action, so onDimensionsShown
  // latches completion and fires the success toast (there is no separate "Complete" button).
  // The button hides on reveal; move focus to the still-visible "Inspect arrowhead" control.
  btnDim?.addEventListener('click', () => {
    sim.showDimensions(true);
    onDimensionsShown();
    refocus(btnZoom);
  }, listen);

  // Step 4 — dimensioning-system toggle: Aligned (value reads along the dim line) vs
  // Unidirectional (every value horizontal). Updates the segmented control and hands the
  // choice to main.js, which re-rotates the height value pill.
  for (const btn of dimModeBtns) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode === 'uni' ? 'uni' : 'aligned';
      if (mode === dimMode) return;
      dimMode = mode;
      sim.setDimMode(dimMode);
      renderDimMode();
      sim.announce(dimMode === 'aligned'
        ? 'Aligned dimensioning — the height value reads up the right edge.'
        : 'Unidirectional dimensioning — every value reads horizontally.');
    }, listen);
  }

  // (The "Front View" quick-view button lives in the viewport chrome and is wired by
  //  main.js — the owner of the viewport — so it is not re-wired here.)

  // Reset routes through the single simAPI.reset() path (RULES.md §2.9).
  btnReset?.addEventListener('click', () => sim.reset(), listen);

  // Finish lesson: posts sim:complete to the host (no latch — every click reposts, ADR-078
  // addendum revised). Button stays as-is afterward (no disable/relabel) — announce() is the
  // only feedback, same pattern as Module2.
  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);

  // Navigation.
  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — completed steps (and the current one) are clickable shortcuts. The
  // completion guard also covers keyboard/programmatic activation.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;
      if (!isComplete(target)) return;
      goToStep(target);
    }, listen);
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------

  /** Re-render chrome from current state. */
  function sync() { renderRail(); renderActions(); renderNav(); }

  /** The Step-4 final action landed: the Type B dimensions are on screen (reached via
   *  "Reveal dimensions" OR the "Inspect arrowhead" shortcut). This is the lesson's
   *  completion point — latch it, fire the calm success toast EXACTLY ONCE, and refresh the
   *  chrome so the rail turns terminal-green, the done-badge ticks and the dim-mode toggle
   *  surfaces. Idempotent (the `completed` latch guards re-entry). */
  function onDimensionsShown() {
    state.dimensions = true;
    if (!state.completed) {
      state.completed = true;
      sim.completeLesson(); // success toast + narration, once
    }
    renderRail(); renderActions(); renderNav();
  }

  /** Sync the wizard when a NON-stepper path force-reveals the dimensions — today that is
   *  main.js's "Inspect arrowhead" micro-zoom, which turns dimensions on directly. Without
   *  this the engine would show dimensions while state.dimensions stayed false, so the
   *  done-badge, rail check, footer note and toast would all lag. Idempotent. */
  function dimensionsRevealed() {
    if (state.dimensions) return;
    onDimensionsShown();
  }

  /** Return to Step 1. Called by simAPI.reset() AFTER the engine has dropped the
   *  layer flags — so this only resets the wizard's own state + chrome (no second
   *  engine path). */
  function reset() {
    state.hidden = false;
    state.centre = false;
    state.dimensions = false;
    state.completed = false;
    xrayOn = false; // main.js already restored the solid faces on rebuild
    dimMode = 'aligned'; // main.js already reset the engine dimMode to the BIS default
    goToStep(1, { announce: false });
  }

  // Initial render — Step 1, no announcement (avoids talking over page load for SRs).
  goToStep(1, { announce: false });

  return { sync, reset, dimensionsRevealed, dispose: () => ac.abort() };
}
