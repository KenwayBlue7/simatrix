// Guided-stepper controller — the Glass Box Visualizer's 5-step sequence.
//
// Sequences the FIVE guided steps (object → planes → lines of sight → glass box → 2D drawing),
// reveals one step's panel at a time (progressive disclosure), and drives the rail + card copy +
// Back/Next nav. Every transition (Next / Back / a rail jump to an already-visited step) calls
// `sim.onStepChange(currentStep)` — main.js's renderStep() is the ONLY thing that decides which
// domain layers are on screen for that step; this module owns the wizard chrome only.
//
// The initStepper(sim) signature and the returned { sync, reset, dispose } shape are kept
// so main.js can drive it unchanged.

/** Per-step tutor copy (the card header). Each step's own hands-on content lives in its
 *  .step-panel in index.html. */
const STEPS = [
  { n: 1, title: 'The Object', lead: 'Meet the part we’ll draw — a bearing block — and the Observer who’ll look at it from three sides.' },
  { n: 2, title: 'The Reference Planes', lead: 'Three transparent planes explode outward around the object, ready to catch its silhouette.' },
  { n: 3, title: 'Lines of Sight', lead: 'Move the Observer to each principal view and watch its sight lines reach out to the object.' },
  { n: 4, title: 'The Glass Box', lead: 'All three views cast at once, held together by dashed projector lines — the complete glass box.' },
  { n: 5, title: 'The 2D Drawing', lead: 'Unfold the box flat into the first-angle multiview — the drawing you’d hand in.' },
];

const TOTAL = STEPS.length;

/**
 * @param {{ announce?: (msg: string) => void, onStepChange?: (n: number) => void }} sim
 *   The injected controller (main.js's simController).
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
    sim.onStepChange?.(currentStep); // main.js's renderStep() owns all per-layer 3D visibility
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
  return {
    sync,
    reset,
    /** Step back one (used by #workbench-rail's Back button — the wizard chrome, including the
     *  normal Back button, is hidden while Step 5's Compare split is open, CSS body.compare-split
     *  #wizard — so that's the only other route back to Step 4). */
    back: () => goToStep(Math.max(currentStep - 1, 1)),
    dispose: () => ac.abort(),
  };
}
