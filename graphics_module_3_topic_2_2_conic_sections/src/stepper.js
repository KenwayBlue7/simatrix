// Guided-stepper controller — Conic Sections (SIX steps).
//
// Sequences the topic's six steps, reveals one step's panel at a time (progressive
// disclosure), and drives the rail + card copy + Back/Next nav. Control wiring lives in
// src/uiManager.js; this file owns only the step sequencing and copy.
//
// The six steps walk Chapter 6 end to end: the solid the curves come from (§6.1), the
// six section planes that cut them (§6.1), the plane definition that replaces the cone
// (§6.3), the vocabulary an exam answer must use (§6.2 / §6.4 / §6.8), the one
// construction that draws all three curves (§6.5.1 / §6.7.1 / §6.9.1), and the remaining
// methods with the tangent and normal every worked example ends on (§6.5–§6.9).
//
// The initStepper(sim) signature and the returned { sync, reset, dispose } shape are kept
// so main.js can drive it unchanged.

/**
 * Per-step copy. Two sentences at most, everyday words first (ADR-086): the learner should
 * be able to start doing the step from the lead alone, and meet the engineering name for
 * what they did afterwards — in the panel's own note, or in a term popover.
 */
const STEPS = [
  { n: 1, title: 'Meet the cone', lead: 'Picture an ice-cream cone. Spin it, stretch it, squash it — and notice one thing: how steeply its side slopes. That single angle decides everything that follows.' },
  { n: 2, title: 'Cut it', lead: 'Now slice through it with a flat sheet, like a knife through the cone. The red face left behind is the shape we are here to study.' },
  { n: 3, title: 'Different cuts, different curves', lead: 'Six ways to cut, six shapes — and one turning point between them: the slope of the cone’s own side. Press each name and watch the plane travel there.' },
  { n: 4, title: 'Why they differ', lead: 'Where do the focus and the directrix actually come from? They are already inside the cone — a ball dropped in finds both. Walk the proof one press at a time; the drawing sheet follows it.' },
  // The why → how hand-over is made ONCE, by the note at the head of the dock. This lead used
  // to say the same thing again in different words, and the two together pushed the playback
  // control off the foot of the panel (ADR-102).
  { n: 5, title: 'Engineering drawing', lead: 'Watch each construction draw itself line by line, then step it at your own pace.' },
  { n: 6, title: 'Your turn', lead: 'The plane moves somewhere you did not choose. Look at the cut, decide which curve it is, then check yourself — and take on the chapter’s own exercises when you are ready.' },
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
  const btnCompleteNext = $('btn-complete-next');

  if (elTotal) elTotal.textContent = String(TOTAL);

  let currentStep = 1;
  // A step counts "complete" once visited — every step here is a reading of the same
  // live model, so there is no half-finished state to gate the next one behind.
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
    // "Complete & next problem" replaces Next on the terminal step — the payoff moment.
    // Label adapts to whether a textbook problem is loaded (free-play gets "Pick a
    // problem", which still opens the library to choose a challenge).
    if (btnCompleteNext) {
      btnCompleteNext.hidden = currentStep !== TOTAL;
      const solving = !!sim.isProblemActive?.();
      btnCompleteNext.textContent = solving ? 'Complete & next problem' : 'Pick a problem';
      // ONE loud action per step (DESIGN.md §5.1). On the last step "Set up a cut" is the
      // exercise, so it owns the accent; this control is loud only when it COMPLETES something.
      // Mid-problem it is the payoff and takes the accent back. In free play it is one of three
      // routes to the same library (the card header and the body copy are the others), and three
      // full-width blue buttons on one panel means none of them is the primary.
      btnCompleteNext.classList.toggle('btn--primary', solving);
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
    sim.setStage?.(currentStep); // progressive reveal: anatomy at 1, the sheet from 3
    renderRail();
    renderNav();
    if (announce) sim.announce?.(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);
  // Step 6 — complete & move on. completeAndNext (main.js) celebrates, clears any active
  // problem, resets through the single path, and opens the Problem Library. The reset
  // re-renders this chrome via reset()→goToStep(1), so no manual re-render is needed here.
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
