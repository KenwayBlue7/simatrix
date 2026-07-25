// Guided-stepper controller — the wizard shell for Projection of Straight Lines
// (ADR-017). It sequences the five Lines steps defined in lineSteps.js — True
// Length → Distance from HP/VP → Inclinations (θ & φ) → Generate Orthographic
// Projections → Draw Traces — revealing exactly the control(s) each step teaches
// (progressive disclosure, dedicated per step and NON-cumulative, §6.14) and
// gating Next behind the current step's completion.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator or another leaf.
// It imports lineSteps.js the same pure-data way terms.js does — not a sibling
// behaviour leaf.
//
// Controls (the legacy lines.html pattern): index.html holds ONE static #controls
// block of [data-ctrl] wrappers — tl, disthp, distvp, theta, phi, fold — and each
// step's `controls` list says which wrappers are visible. uiManager.js owns the
// value wiring; this module owns only which control the current step reveals, plus
// the step-4 fold toggle. A step whose `controls` names a not-yet-built wrapper
// (step 3's `truelength`, step 5's `traces` — later-phase constructions) simply
// reveals nothing for it, no error.

import { STEPS } from './lineSteps.js';

const TOTAL = STEPS.length;

// The step-4 fold toggle copy (the legacy foldLabels idle/refold). Icon + text are
// split so the button uses the shared .btn--icon / .btn__icon layout (glyph optically
// centred against the label, not baseline-prefixed) and the aria-hidden icon glyph is
// kept out of the button's accessible name.
const FOLD_IDLE_ICON = '▶',   FOLD_IDLE_TEXT = 'Generate Orthographic Projection';
const FOLD_REFOLD_ICON = '↩', FOLD_REFOLD_TEXT = 'Fold back to 3D';

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   showToast?: (msg: string) => void,
 *   getData: () => object,
 *   getView: () => object,
 *   applyView: (view: object) => void,
 *   fold: () => void,
 *   unfold: () => void,
 *   isFolded: () => boolean,
 *   spotlight?: (id: string) => void,
 *   orbitHint?: () => void,
 * }} sim  — injected by main.js (the simController contract).
 * @returns {{ sync: () => void, refresh: () => void, reset: () => void, goStep: (n: number) => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // --- DOM ---
  const card = $('step-card');
  const railItems = [...document.querySelectorAll('#step-rail .rail__item')];
  const ctrlWraps = [...document.querySelectorAll('#controls [data-ctrl]')];
  const elCurrent = $('step-current');
  const elTotal = $('step-total');
  const elTitle = $('step-title');
  const elLead = $('step-lead');
  const elBody = $('step-body');
  const elHint = $('step-hint');
  const elHintText = $('step-hint-text');

  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnFold = $('btn-fold');
  const doneFold = $('done-fold');

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state ---
  let currentStep = 1;
  let highestVisited = 1; // exploring steps count complete once the learner moves past them
  let celebrated = false; // the "projection generated" toast fires once per run-through
  const satisfied = new Set(); // gated steps (the fold) whose gate was met at least once — sticky

  /** Evaluate a gated step's live gate and LATCH it: once the learner generates the projection,
   *  step 4 counts as done even after they move on (advancing to step 5 unfolds the sheet — Issue 3:
   *  without latching, step 4 reverted to incomplete on revisit). A single latch, no duplicate
   *  state path; reset() clears it. Returns null for a non-gated step. */
  function gateMet(i) {
    const step = STEPS[i - 1];
    if (!step.done) return null;
    if (step.done(sim.getData(), sim.getView())) satisfied.add(i);
    return satisfied.has(i);
  }

  /** Whether step i counts as complete (drives rail checks + Next gating). */
  function isComplete(i) {
    const step = STEPS[i - 1];
    if (step.done) return gateMet(i);
    return i < highestVisited; // exploring step — visited & left
  }

  /** Whether the learner may advance from the current step. */
  function canAdvance(step) {
    if (step >= TOTAL) return false; // the last step is terminal
    const meta = STEPS[step - 1];
    return meta.done ? gateMet(step) : true;
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

  /** Reflect the live fold state into the step-4 toggle + its done badge. */
  function renderActions() {
    const folded = sim.isFolded();
    if (btnFold) {
      const icon = btnFold.querySelector('.btn__icon');
      const label = btnFold.querySelector('#fold-label');
      if (icon) icon.textContent = folded ? FOLD_REFOLD_ICON : FOLD_IDLE_ICON;
      if (label) label.textContent = folded ? FOLD_REFOLD_TEXT : FOLD_IDLE_TEXT;
    }
    if (doneFold) doneFold.hidden = !folded;
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) {
      btnNext.hidden = currentStep >= TOTAL; // terminal step: no Next
      btnNext.disabled = !canAdvance(currentStep);
    }
  }

  /** Show one step (progressive disclosure): card copy, control wrappers, rail,
   *  view flags, first-seen spotlight. */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    highestVisited = Math.max(highestVisited, currentStep);

    const meta = STEPS[currentStep - 1];

    // Leaving the folded sheet by navigating to a non-fold step reverses the fold,
    // so the learner never edits an earlier step with the sheet stuck flat.
    if (sim.isFolded() && !meta.controls.includes('fold')) sim.unfold();

    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    // Body/hint are authored HTML from lineSteps.js (trusted copy, no user input).
    // The `.term` buttons need no wiring here: terms.js listens on #wizard by
    // delegation, so freshly-rendered buttons work immediately.
    if (elBody) elBody.innerHTML = meta.body.map((p) => `<p>${p}</p>`).join('');
    if (elHint) {
      elHint.hidden = !meta.hint;
      if (elHintText && meta.hint) elHintText.textContent = meta.hint;
    }

    // Reveal only the control wrappers this step declares (dedicated per step).
    for (const wrap of ctrlWraps) {
      wrap.hidden = !meta.controls.includes(wrap.dataset.ctrl);
    }

    // Push this step's viewport flags to the orchestrator — the ONE channel the
    // wizard drives the scene through (applyView routes into rebuild()).
    sim.applyView(meta.view);

    // First-seen contextual chips + the step-1 orbit-discovery hint.
    if (meta.orbitHint) sim.orbitHint?.();
    if (meta.spotlight) sim.spotlight?.(meta.spotlight);

    // Start each step at the top of the scroller.
    const scroller = card && (card.querySelector('.card__scroll') || card);
    if (scroller) scroller.scrollTop = 0;

    renderRail();
    renderActions();
    renderNav();

    if (announce) sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  // Step 4 — the reversible fold (Generate Orthographic Projections). One toggle.
  btnFold?.addEventListener('click', () => {
    if (sim.isFolded()) {
      sim.unfold();
      sim.announce('Folded back into the 3D view — the line is restored in space.');
    } else {
      sim.fold();
      const firstWin = !celebrated;
      celebrated = true;
      if (firstWin) sim.showToast?.('Orthographic projection generated');
      sim.announce('Top view unfolded onto the vertical plane — the orthographic projection is complete.');
    }
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Navigation.
  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — reachable steps are shortcuts; forward stays gated by completion.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;
      if (target > currentStep && !isComplete(target)) return;
      goToStep(target);
    }, listen);
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------

  /** Re-render chrome from current sim state (e.g. after an external commit). */
  function sync() { renderRail(); renderActions(); renderNav(); }

  /** Re-apply the CURRENT step's control reveal + chrome without re-announcing or
   *  re-firing spotlights (reserved for a future workbench round-trip, ADR-021). */
  function refresh() {
    const meta = STEPS[currentStep - 1];
    for (const wrap of ctrlWraps) {
      wrap.hidden = !meta.controls.includes(wrap.dataset.ctrl);
    }
    renderRail(); renderActions(); renderNav();
  }

  /** Return to Step 1. Called by simAPI.reset() AFTER the orchestrator has already
   *  reset its data/view/fold state — this only resets the wizard's own state and
   *  chrome, never the scene (no second reset path, RULES.md §2.9). */
  function reset() {
    highestVisited = 1;
    celebrated = false;
    satisfied.clear(); // the fold-completion latch clears with the run
    goToStep(1, { announce: false });
  }

  // Initial render — Step 1, no announcement (avoids talking over page load for
  // screen readers). This also pushes Step 1's view flags to the orchestrator.
  goToStep(1, { announce: false });

  return { sync, refresh, reset, goStep: (n) => goToStep(n, { announce: false }), dispose: () => ac.abort() };
}
