// Guided-stepper controller — the wizard shell for the Projection of Points
// topic, adapted from the Topic 2 sibling's stepper (itself adapted from
// Module2/src/stepper.js, the orchestrator-pattern reference). It sequences the
// five legacy Points steps defined in pointSteps.js — Quadrants → From HP →
// From VP → From PP → Unfold — revealing one step's control at a time
// (progressive disclosure) and gating Next behind the current step's completion.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator or another leaf.
// It imports pointSteps.js the same way terms.js does — a pure-data file, not a
// sibling behaviour leaf.
//
// The steps are data-driven: title/lead/body/hint render from STEPS, and each
// step pushes its viewport flags to the orchestrator through sim.applyView().
// Term buttons in the body carry only their data-t glossary key — the terms.js
// popover leaf (delegated from #wizard, wired by main.js) picks them up on every
// re-render, so no per-step wiring happens here.
//
// Controls (the legacy points.html pattern): index.html holds ONE static
// #controls block of [data-ctrl] wrappers — quad, hp, vp, pp, anim — and each
// step's `controls` list says which wrappers are visible. uiManager.js owns the
// value wiring (two-way slider sync, the quadrant select); this module owns only
// which control the current step reveals, plus the step-5 fold buttons.

import { STEPS } from './pointSteps.js';

const TOTAL = STEPS.length;

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   showToast: (msg: string) => void,
 *   applyView: (view: object) => void,
 *   fold: () => void,
 *   unfold: () => void,
 *   isFolded: () => boolean,
 *   spotlight?: (id: string) => void,
 *   orbitHint?: () => void,
 *   completeAndNext?: () => void,
 *   isProblemActive?: () => boolean,
 * }} sim  — injected by main.js (the simController contract).
 * @returns {{ sync: () => void, reset: () => void, goStep: (n: number) => void, dispose: () => void }}
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
  const btnUnfold = $('btn-unfold');
  const doneFold = $('done-fold');
  const btnCompleteNext = $('btn-complete-next');

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state ---
  let currentStep = 1;
  let highestVisited = 1; // exploring steps count complete once the learner moves past them
  let celebrated = false; // the "lesson complete" toast fires once per run-through

  /** Whether step i counts as complete (drives rail checks + Next gating). */
  function isComplete(i) {
    const step = STEPS[i - 1];
    if (step.done) return !!step.done(sim); // gated step (the fold) — live state
    return i < highestVisited;              // exploring step — visited & left
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

  /** Reflect live sim state into the per-step action controls (the fold pair +
   *  its done badge — the legacy foldLabels idle/refold copy lives in the HTML). */
  function renderActions() {
    const folded = sim.isFolded();
    if (btnFold) btnFold.hidden = folded;
    if (btnUnfold) btnUnfold.hidden = !folded;
    if (doneFold) doneFold.hidden = !folded;
    // "Complete & next problem" (Module 2 payoff pattern) appears only once the drawing is
    // folded flat — the lesson's finish line, on the terminal step. Its label adapts to
    // whether a textbook problem is loaded; in free-play it reads "Pick a problem" (which
    // still opens the Problem Library to choose a challenge).
    if (btnCompleteNext) {
      btnCompleteNext.hidden = !folded;
      btnCompleteNext.textContent = sim.isProblemActive?.()
        ? 'Complete & next problem'
        : 'Pick a problem';
    }
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
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    // Body/hint are authored HTML from pointSteps.js (trusted copy, no user
    // input). The `.term` buttons inside need no wiring here: terms.js listens
    // on #wizard by delegation, so freshly-rendered buttons work immediately.
    if (elBody) elBody.innerHTML = meta.body.map((p) => `<p>${p}</p>`).join('');
    if (elHint) {
      elHint.hidden = !meta.hint;
      if (elHintText && meta.hint) elHintText.textContent = meta.hint;
    }

    // Reveal only the control wrappers this step declares (legacy points.html:
    // one control per step — Quadrant → HP → VP → PP → the fold button).
    for (const wrap of ctrlWraps) {
      wrap.hidden = !meta.controls.includes(wrap.dataset.ctrl);
    }

    // Push this step's viewport flags to the orchestrator — the ONE channel the
    // wizard drives the scene through (applyView routes into rebuild()).
    sim.applyView(meta.view);

    // First-seen contextual chips: the step's spotlight (one at a time, queued
    // by onboarding.js) and the step-1 orbit-discovery hint.
    if (meta.orbitHint) sim.orbitHint?.();
    if (meta.spotlight) sim.spotlight?.(meta.spotlight);

    // Start each step at the top — a long previous step may have left the card
    // scrolled down, and the new step should read from its title. The scroller
    // is the inner .card__scroll region (the card itself never scrolls — its
    // nav footer is pinned outside the scroll region, Foundations layout).
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

  // Step 5 — the fold (rabatment). Reversible; completing it is the lesson's win.
  btnFold?.addEventListener('click', () => {
    sim.fold();
    // The win fires exactly once per run-through, on the FIRST fold — the moment
    // the finished first-angle drawing exists (merged into the one announcement
    // below; the toast itself is aria-hidden, so no double narration).
    const firstWin = !celebrated;
    celebrated = true;
    if (firstWin) {
      sim.showToast?.('Projection of Points completed!');
      sim.markComplete?.();
    }
    sim.announce(`Horizontal plane unfolded onto the vertical plane — the 2D drawing is complete.${firstWin ? ' Projection of Points completed!' : ''}`);
    renderRail(); renderActions(); renderNav();
  }, listen);
  btnUnfold?.addEventListener('click', () => {
    sim.unfold();
    sim.announce('Folded back into the 3D view — the point is restored in space.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // "Complete & next problem" — routes through the orchestrator (simController.completeAndNext):
  // clear any active problem, reset to defaults + Step 1, then reopen the Problem Library so the
  // learner picks their next challenge. In free-play (no problem loaded) it just opens the
  // library. The button only exists once folded (renderActions), so this is a terminal-step win.
  btnCompleteNext?.addEventListener('click', () => sim.completeAndNext?.(), listen);

  // Navigation.
  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — reachable steps (see renderRail) are shortcuts. The guard also
  // covers keyboard/programmatic activation of a disabled-looking marker.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;                       // already here — no-op
      if (target > currentStep && !isComplete(target)) return;  // forward stays gated
      goToStep(target);
    }, listen);
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------

  /** Re-render chrome from current sim state (e.g. after an external commit). */
  function sync() { renderRail(); renderActions(); renderNav(); }

  /** Re-apply the CURRENT step's progressive-disclosure control reveal + chrome,
   *  without re-announcing, re-flying the camera, or re-firing spotlights. The
   *  compare-split workbench (ADR-037) borrows the driver [data-ctrl] wrappers into
   *  its docked rail; on close it hands them back to #controls and calls this so
   *  per-step disclosure owns them again. `ctrlWraps` was cached by node reference,
   *  so it still points at the same wrappers after the round-trip. */
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
    goToStep(1, { announce: false });
  }

  // Initial render — Step 1, no announcement (avoids talking over the page load
  // for screen readers). This also pushes Step 1's view flags to the orchestrator.
  goToStep(1, { announce: false });

  // goStep (1-indexed) is surfaced for the Problem Library: loading a problem routes the
  // learner to its dial-able entry step. announce:false — the library provides its own
  // "Problem loaded…" narration, so a competing "Step N of M" line is suppressed.
  return { sync, refresh, reset, goStep: (n) => goToStep(n, { announce: false }), dispose: () => ac.abort() };
}
