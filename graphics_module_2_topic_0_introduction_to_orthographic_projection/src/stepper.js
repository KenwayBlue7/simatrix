// Guided-stepper controller — Module 2, Topic 0: Introduction to Orthographic Projection.
//
// Sequences the two steps (orthoSteps.js), reveals one step's `.step-panel` at a time
// (progressive disclosure, PRODUCT.md §4 principle 2), drives the numbered rail + card header +
// Back/Next nav, and asks main.js to move the SCENE into each step's state through
// `sim.enterStep(n)`. The stepper owns the wizard chrome; main.js owns the camera and the geometry.
//
// A step is reachable once it has been visited, so the learner can go back to the object and turn
// it again while the drawing is half built, without being able to skip ahead past a locked one.
// That is deliberate here: Step 2 draws the views in the order Step 1 taught them, so arriving at
// the drawing without having looked at the object teaches the wrong thing.
//
// The topic-family instrument, unchanged except for the data module it imports and the per-step
// Next LABEL below — the platform wizard is the same in every topic (RULES.md §2.20).
//
// Layering (CLAUDE.md): leaf module, imports the step DATA only. main.js injects `sim`.

import { STEPS } from './orthoSteps.js';

const TOTAL = STEPS.length;

/**
 * @param {{ announce?: (msg: string) => void, enterStep?: (n: number) => void }} sim
 * @returns {{ sync: () => void, reset: () => void, step: () => number, goTo: (n:number) => void, dispose: () => void }}
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

  if (elTotal) elTotal.textContent = String(TOTAL);

  let currentStep = 1;
  const visited = new Set([1]);

  function renderRail() {
    for (const item of railItems) {
      const i = Number(item.dataset.step);
      const marker = item.querySelector('.rail__marker');
      const btn = item.querySelector('.rail__btn');
      const labelEl = item.querySelector('.rail__label');
      const current = i === currentStep;
      const complete = !current && visited.has(i);
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      item.classList.toggle('is-upcoming', !current && !complete);
      if (marker) marker.textContent = complete ? '✓' : String(i);
      if (btn) {
        btn.disabled = !(current || complete);
        const name = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
        const stateWord = current ? 'current step' : complete ? 'completed, go to step' : 'locked';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${stateWord}`);
        if (current) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) {
      btnNext.hidden = currentStep >= TOTAL; // terminal step has no Next
      // A step may NAME its forward action. Step 1's is "Start Projection" — the brief's own
      // wording — and it is the same button, relabelled, not a second primary sitting beside the
      // generic one (RULES.md §3.61: one loud action per step).
      btnNext.textContent = STEPS[currentStep - 1]?.nextLabel ?? 'Next';
    }
  }

  /** Show one step's panel + copy, drive the scene into that step, update chrome. */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    visited.add(currentStep);

    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      panel.classList.toggle('is-active', show); // re-triggers the panelIn animation
    }

    if (cardScroll) cardScroll.scrollTop = 0;
    sim.enterStep?.(currentStep); // move the camera + reveal this step's scene
    renderRail();
    renderNav();
    if (announce) sim.announce?.(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;
      if (!visited.has(target)) return; // upcoming steps stay locked
      goToStep(target);
    }, listen);
  }

  function sync() { renderRail(); renderNav(); }

  /** Return to Step 1 and forget progress (called by simAPI.reset()). */
  function reset() {
    visited.clear();
    visited.add(1);
    goToStep(1, { announce: false });
  }

  goToStep(1, { announce: false });
  return {
    sync,
    reset,
    step: () => currentStep,
    goTo: (n) => goToStep(n),
    dispose: () => ac.abort(),
  };
}
