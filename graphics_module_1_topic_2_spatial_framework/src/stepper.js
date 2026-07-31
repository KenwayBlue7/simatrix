// Guided-stepper controller — the wizard shell for the Spatial Framework topic,
// adapted from Module2/src/stepper.js (the orchestrator-pattern reference). It
// sequences the five "Room & Shadow" steps defined in spatialSteps.js, revealing
// one step's controls at a time (progressive disclosure) and gating Next behind
// the current step's completion.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator or another leaf.
// It imports spatialSteps.js the same way Module 2's problemLibrary.js imports
// problems.js — a pure-data file, not a sibling behaviour leaf.
//
// Unlike Module 2 (whose step copy lives inline here and whose panels carry many
// controls), this topic's steps are data-driven: title/lead/body/hint render from
// STEPS, and each step pushes its viewport flags to the orchestrator through
// sim.applyView(). Term buttons in the body carry only their data-t glossary
// key — the terms.js popover leaf (delegated from #wizard, wired by main.js)
// picks them up on every re-render, so no per-step wiring happens here.

import { STEPS } from './spatialSteps.js';

const TOTAL = STEPS.length;

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   showToast: (msg: string) => void,
 *   getData: () => { distHP: number, distVP: number, quadrant: string },
 *   setQuadrant: (q: string) => void,
 *   applyView: (view: object) => void,
 *   fold: () => void,
 *   unfold: () => void,
 *   isFolded: () => boolean,
 * }} sim  — injected by main.js (the simController contract).
 * @returns {{ sync: () => void, reset: () => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // --- DOM ---
  const card = $('step-card');
  const railItems = [...document.querySelectorAll('#step-rail .rail__item')];
  const panels = [...document.querySelectorAll('.step-panel')];
  const elCurrent = $('step-current');
  const elTotal = $('step-total');
  const elTitle = $('step-title');
  const elLead = $('step-lead');
  const elBody = $('step-body');
  const elHint = $('step-hint');

  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnFinish = $('btn-finish');

  const btnFold = $('btn-fold');
  const btnUnfold = $('btn-unfold');
  const doneFold = $('done-fold');
  const quadButtons = [...document.querySelectorAll('.quad-btn')];

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state ---
  let currentStep = 1;
  let highestVisited = 1; // reading steps count complete once the learner moves past them

  /** Whether step i counts as complete (drives rail checks + Next gating). */
  function isComplete(i) {
    const step = STEPS[i - 1];
    if (step.done) return !!step.done(sim); // gated step (the fold) — live state
    return i < highestVisited;              // reading/exploring step — visited & left
  }

  /** Whether the learner may advance from the current step. */
  function canAdvance(step) {
    if (step >= TOTAL) return false; // the last step is terminal
    const meta = STEPS[step - 1];
    return meta.done ? !!meta.done(sim) : true;
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
      const current = i === currentStep;
      const complete = !current && isComplete(i);
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      item.classList.toggle('is-upcoming', !current && !complete);
      // Non-colour cue: check glyph when complete, number otherwise (Two-Cue Rule).
      if (marker) marker.textContent = complete ? '✓' : String(i);

      // One-way-back map: the current step, any completed step, and any step behind
      // the learner are reachable; upcoming steps stay locked so forward progress is
      // still gated by completion — the same gate as Next. (Backward is always open
      // even if a gated step was un-done, e.g. the fold reversed — matching Back.)
      if (btn) {
        const reachable = current || complete || i < currentStep;
        btn.disabled = !reachable;
        const name = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
        const stateWord = current ? 'current step' : reachable ? 'go to step' : 'locked';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${stateWord}`);
        if (current) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    }
  }

  /** Reflect live sim state into the per-step action controls. */
  function renderActions() {
    const folded = sim.isFolded();
    if (btnFold) btnFold.hidden = folded;
    if (btnUnfold) btnUnfold.hidden = !folded;
    if (doneFold) doneFold.hidden = !folded;

    const q = sim.getData().quadrant;
    for (const btn of quadButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.quadrant === q));
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) {
      btnNext.hidden = currentStep >= TOTAL; // terminal step: no Next
      btnNext.disabled = !canAdvance(currentStep);
    }
    // Finish lesson: takes over the footer's primary slot exactly when Next vacates
    // it (terminal step "Standard" has no gate, so it's enabled as soon as reached).
    if (btnFinish) btnFinish.hidden = currentStep < TOTAL;
  }

  /** Show one step (progressive disclosure): card copy, panel, rail, view flags. */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    // First arrival at the terminal step = the lesson-complete win. Computed
    // BEFORE highestVisited absorbs this visit; reset() re-arms it by dropping
    // highestVisited back to 1 (its own goToStep(1) can never fire — 1 ≠ TOTAL).
    const firstArrival = currentStep === TOTAL && highestVisited < TOTAL;
    highestVisited = Math.max(highestVisited, currentStep);

    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    // Body/hint are authored HTML from spatialSteps.js (trusted copy, no user
    // input). The `.term` buttons inside need no wiring here: terms.js listens
    // on #wizard by delegation, so freshly-rendered buttons work immediately.
    if (elBody) elBody.innerHTML = meta.body.map((p) => `<p>${p}</p>`).join('');
    if (elHint) {
      elHint.hidden = !meta.hint;
      if (meta.hint) elHint.innerHTML = meta.hint;
    }

    for (const panel of panels) {
      panel.hidden = Number(panel.dataset.step) !== currentStep;
    }

    // Push this step's viewport flags to the orchestrator — the ONE channel the
    // wizard drives the scene through (applyView routes into rebuild()).
    sim.applyView(meta.view);

    // Start each step at the top — a long previous step may have left the card
    // scrolled down, and the new step should read from its title.
    if (card) card.scrollTop = 0;

    renderRail();
    renderActions();
    renderNav();

    // The win toast fires exactly once per run-through, after the step renders.
    // The win is MERGED into the one step announcement below (never a second
    // racing #sim-status write; the toast itself is aria-hidden). Lesson completion
    // itself is now the learner's own "Finish lesson" click (Finish-button pilot,
    // ADR-078 addendum revised) — this toast is just the arrival celebration.
    if (firstArrival) {
      sim.showToast?.('Spatial Framework completed!');
    }
    const winWord = firstArrival ? ' Spatial Framework completed!' : '';
    if (announce) sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.${winWord}`);
  }

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  // Step 2 — move P between the four quadrants (the room-to-room walk).
  for (const btn of quadButtons) {
    btn.addEventListener('click', () => {
      sim.setQuadrant(btn.dataset.quadrant);
      sim.announce(`Point P moved to the ${btn.getAttribute('aria-label') || btn.dataset.quadrant}.`);
      renderActions();
    }, listen);
  }

  // Step 4 — the fold (rabatment). Reversible; completing it unlocks Next.
  btnFold?.addEventListener('click', () => {
    sim.fold();
    sim.announce('HP folded down flat. The top view p now sits below the XY line; the front view p′ stays above it.');
    renderRail(); renderActions(); renderNav();
  }, listen);
  btnUnfold?.addEventListener('click', () => {
    sim.unfold();
    sim.announce('Unfolded back to the 3D corner.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Finish lesson: posts sim:complete to the host (no latch — every click reposts,
  // ADR-078 addendum revised). Button stays as-is afterward (no disable/relabel,
  // locked decision) — announce() is the only feedback.
  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);

  // Navigation.
  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — reachable steps (see renderRail) are shortcuts. The guard also
  // covers keyboard/programmatic activation of a disabled-looking marker.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;                    // already here — no-op
      if (target > currentStep && !isComplete(target)) return; // forward stays gated
      goToStep(target);
    }, listen);
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------

  /** Re-render chrome from current sim state (e.g. after an external commit). */
  function sync() { renderRail(); renderActions(); renderNav(); }

  /** Return to Step 1. Called by simAPI.reset() AFTER the orchestrator has already
   *  reset its data/view/fold state — this only resets the wizard's own state and
   *  chrome, never the scene (no second reset path, RULES.md §2.9). */
  function reset() {
    highestVisited = 1;
    goToStep(1, { announce: false });
  }

  // Initial render — Step 1, no announcement (avoids talking over the page load
  // for screen readers). This also pushes Step 1's view flags to the orchestrator.
  goToStep(1, { announce: false });

  return { sync, reset, dispose: () => ac.abort() };
}
