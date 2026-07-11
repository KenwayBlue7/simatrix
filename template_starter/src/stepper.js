// Guided-stepper controller — STARTER TEMPLATE stub (3 dummy steps).
//
// A minimal, domain-free version of the Module 2 stepper: it sequences THREE placeholder
// steps, reveals one step's panel at a time (progressive disclosure), and drives the rail +
// card copy + Back/Next nav. Replace STEPS — and the matching #step-rail items and
// .step-panel sections in index.html — with your subject's real steps, then wire per-step
// action buttons the way Module 2's stepper.js does (setLabels, setProjections, …).
//
// The initStepper(sim) signature and the returned { sync, reset, dispose } shape are kept
// so main.js can drive it unchanged.

/** Placeholder per-step copy. Swap for your subject's steps. */
const STEPS = [
  { n: 1, title: 'Step one',   lead: 'First placeholder step. Replace this copy — and the controls in its .step-panel — with your subject’s opening move.' },
  { n: 2, title: 'Step two',   lead: 'Second placeholder step. Add the controls this step teaches into its .step-panel.' },
  { n: 3, title: 'Step three', lead: 'Third placeholder step. Gate it behind the previous ones and wire its completion.' },
];

const TOTAL = STEPS.length;

/**
 * @param {{ announce?: (msg: string) => void }} sim  The injected controller (main.js).
 * @returns {{ sync: () => void, reset: () => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const card = $('step-card');
  // The scrollable region is .card__scroll (the .card__nav footer is pinned outside it);
  // fall back to #step-card for markup that hasn't split the scroller out.
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
  // A dummy step counts "complete" once visited (real topics gate on sim state instead).
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
    if (btnNext) btnNext.hidden = currentStep >= TOTAL; // terminal step has no Next
  }

  /** Show one step's panel (progressive disclosure) and update card copy + chrome. */
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

    if (cardScroll) cardScroll.scrollTop = 0; // start each step at the top
    renderRail();
    renderNav();
    if (announce) sim.announce?.(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — the current step or any already-visited step is a clickable shortcut.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return;
      if (!visited.has(target)) return;
      goToStep(target);
    }, listen);
  }

  /** Re-render chrome from current state. */
  function sync() { renderRail(); renderNav(); }

  /** Return to Step 1 and forget progress (called by simAPI.reset()). */
  function reset() {
    visited.clear();
    visited.add(1);
    goToStep(1, { announce: false });
  }

  goToStep(1, { announce: false });
  return { sync, reset, dispose: () => ac.abort() };
}
