// Guided-stepper controller — adapted from
// graphics_module_1_topic_2_spatial_framework/src/stepper.js for this topic's
// 7-step sequence (systemSteps.js) and its two per-step actions: the fold
// (shared by steps 3 and 5) and the projection-system toggle (steps 6 and 7).
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator or another leaf.

import { STEPS } from './systemSteps.js';

const TOTAL = STEPS.length;

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   getSystem: () => string,
 *   setSystem: (system: string) => void,
 *   applyView: (view: object) => void,
 *   fold: () => void,
 *   unfold: () => void,
 *   isFolded: () => boolean,
 *   markComplete?: () => void,
 * }} sim
 * @returns {{ sync: () => void, reset: () => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const card = $('step-card');
  const cardScroll = card?.querySelector('.card__scroll') || card;
  const railItems = [...document.querySelectorAll('#step-rail .rail__item')];
  const panels = [...document.querySelectorAll('.step-panel')];
  const elCurrent = $('step-current');
  const elTotal = $('step-total');
  const elTitle = $('step-title');
  const elLead = $('step-lead');

  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnFinish = $('btn-finish');

  const foldControls = $('fold-controls');
  const btnFold = $('btn-fold');
  const btnUnfold = $('btn-unfold');
  const doneFold = $('done-fold');
  const systemButtons = [...document.querySelectorAll('.system-btn')];

  if (elTotal) elTotal.textContent = String(TOTAL);

  let currentStep = 1;
  let highestVisited = 1;

  /** Steps whose `done` gate was observed true WHILE they were the active step —
   *  latched permanently (until reset()). A `done`-gated step's live check
   *  (sim.isFolded() etc.) is necessarily a SHARED, mutable flag across every step
   *  that gates on it (both fold steps read the same `folded` boolean) — the moment
   *  the learner leaves a completed fold step, the NEXT step's own setup (e.g. the
   *  auto-unfold on step 4's arrival) flips that shared flag back, which would
   *  un-complete the step just left if the rail re-checked done() live. This set
   *  is the durable record that it really did happen once. */
  const completedSteps = new Set();

  /** A step counting box for the step's own reading copy, injected above the
   *  existing .step-panel controls (title/lead already have dedicated elements;
   *  body paragraphs + hint need a home stepper.js owns and re-renders). */
  function ensureCopyHost(panel) {
    let host = panel.querySelector('.step-copy');
    if (!host) {
      host = document.createElement('div');
      host.className = 'step-copy';
      panel.prepend(host);
    }
    return host;
  }

  function isComplete(i) {
    if (completedSteps.has(i)) return true;
    const step = STEPS[i - 1];
    if (step.done) return !!step.done(sim);
    return i < highestVisited;
  }

  function canAdvance(step) {
    if (step >= TOTAL) return false;
    const meta = STEPS[step - 1];
    return meta.done ? !!meta.done(sim) : true;
  }

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

  /** Reflect live sim state into the fold buttons + system-toggle buttons. The fold
   *  block is NOT nested inside any .step-panel (see index.html) — it's a single
   *  shared node, so its own visibility is gated here on the CURRENT step's own
   *  `controls` list rather than by which panel happens to be showing. */
  function renderActions() {
    if (foldControls) foldControls.hidden = !(STEPS[currentStep - 1].controls || []).includes('fold');

    const folded = sim.isFolded();
    if (btnFold) btnFold.hidden = folded;
    if (btnUnfold) btnUnfold.hidden = !folded;
    if (doneFold) doneFold.hidden = !folded;

    const system = sim.getSystem();
    for (const btn of systemButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.system === system));
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) { btnNext.hidden = currentStep >= TOTAL; btnNext.disabled = !canAdvance(currentStep); }
    if (btnFinish) btnFinish.hidden = currentStep < TOTAL;
  }

  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    highestVisited = Math.max(highestVisited, currentStep);

    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      if (show) {
        const host = ensureCopyHost(panel);
        host.innerHTML = meta.body.map((p) => `<p>${p}</p>`).join('')
          + (meta.hint ? `<p class="card__hint">${meta.hint}</p>` : '');
      }
    }

    // Pin the step's own system, if it declares one (steps 2/3 = first, 4/5 = third);
    // otherwise leave the learner's own toggle choice untouched.
    if (meta.view.system && meta.view.system !== sim.getSystem()) sim.setSystem(meta.view.system);
    sim.applyView(meta.view);

    if (cardScroll) cardScroll.scrollTop = 0;
    renderRail();
    renderActions();
    renderNav();
    if (announce) sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  btnFold?.addEventListener('click', () => {
    sim.fold();
    completedSteps.add(currentStep); // durable — survives the next step's auto-unfold
    sim.announce('Planes folded flat. Read the resulting view layout and the BIS symbol.');
    renderRail(); renderActions(); renderNav();
  }, listen);
  btnUnfold?.addEventListener('click', () => {
    sim.unfold();
    sim.announce('Unfolded back to the 3D corner.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  for (const btn of systemButtons) {
    btn.addEventListener('click', () => {
      sim.setSystem(btn.dataset.system);
      sim.announce(`Projection system set to ${btn.textContent.trim()}.`);
      renderActions();
    }, listen);
  }

  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);

  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;
      if (target > currentStep && !isComplete(target)) return;
      goToStep(target);
    }, listen);
  }

  function sync() { renderRail(); renderActions(); renderNav(); }

  /** Route to a specific step (used by problemLibrary.js's loadProblem entry-step). */
  function goStep(n) { goToStep(n, { announce: false }); }

  function reset() {
    highestVisited = 1;
    completedSteps.clear();
    goToStep(1, { announce: false });
  }

  goToStep(1, { announce: false });
  return { sync, reset, goStep, dispose: () => ac.abort() };
}
