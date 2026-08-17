// Guided-stepper controller — Sections of Solids (5 steps).
//
// A minimal version of the Module 2 stepper: it sequences the topic's three steps, reveals
// one step's panel at a time (progressive disclosure), and drives the rail + card copy +
// Back/Next nav. Control wiring lives in src/uiManager.js; this file owns only the step
// sequencing and copy.
//
// The initStepper(sim) signature and the returned { sync, reset, dispose } shape are kept
// so main.js can drive it unchanged.

/** Per-step copy. */
const STEPS = [
  { n: 1, title: 'Choose the solid', lead: 'Pick the solid you are going to cut. It stands on the horizontal plane, just as the textbook problems pose it.' },
  { n: 2, title: 'Position the cutting plane', lead: 'Switch the section plane on, then set its tilt and height. The solid is re-cut live as you drag — the part in front of the plane is removed.' },
  { n: 3, title: 'Read the section', lead: 'The tinted flat face where the plane sliced the solid is the section. Because you are looking at it in 3D, you can orbit until you face it square-on — that view is its true shape.' },
  { n: 4, title: 'Project the views', lead: 'The three orthographic views appear on their reference planes — top view on the floor, front view on the back wall, side view on the profile wall. Where the section shows as an area, it is hatched at 45 degrees; where it is edge-on, it reads as a line.' },
  { n: 5, title: 'The true shape', lead: 'The views foreshorten the section — its apparent shape. The floating sheet is drawn parallel to the cutting plane, so it shows the section at full size: the true shape. Use "Face the section" to look at it square-on.' },
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
  const btnFinish = $('btn-finish');
  const btnCompleteNext = $('btn-complete-next');

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
    // Finish lesson: takes over the footer's primary slot exactly when Next vacates
    // it (terminal step has no gate, so it's enabled as soon as reached).
    if (btnFinish) btnFinish.hidden = currentStep < TOTAL;
    // "Try another problem" (Finish-button pilot): renamed off "Complete..." wording so
    // it stops reading as the lesson-completion action now that #btn-finish owns that
    // signal — this stays the repeatable practice-loop action, same label in both problem
    // and free-play modes (still opens the library to choose a challenge either way).
    if (btnCompleteNext) {
      btnCompleteNext.hidden = currentStep !== TOTAL;
      btnCompleteNext.textContent = 'Try another problem';
    }
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
    sim.setStage?.(currentStep); // progressive scene reveal (views at 4, true shape at 5)
    renderRail();
    renderNav();
    if (announce) sim.announce?.(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);
  // Finish lesson: posts sim:complete to the host (no latch — every click reposts,
  // ADR-078 addendum revised). Button stays as-is afterward (no disable/relabel,
  // locked decision) — announce() is the only feedback.
  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);
  // "Try another problem" — completeAndNext (main.js) clears any active problem, resets
  // through the single path, and opens the Problem Library. The reset re-renders this
  // chrome via reset()→goToStep(1), so no manual re-render is needed here.
  btnCompleteNext?.addEventListener('click', () => sim.completeAndNext?.(), listen);

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
