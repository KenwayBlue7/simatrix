// Guided-stepper controller — the wizard shell for "Types of Lines".
//
// Six independent mini-lessons, one per standard line position (lineTypesData.js STEPS):
//   1 Parallel to both · 2 ⟂ HP · 3 ⟂ VP · 4 Inclined to HP · 5 Inclined to VP · 6 Inclined to both.
// Entering a step hands its whole descriptor to the orchestrator (sim.applyStep), which LOCKS the
// line's case + the angles the step does not teach, shows the line already correctly positioned,
// and gently glides the free-orbit camera to the step's vantage. Only the control(s) meaningful
// for that line type are revealed (dynamic parameter panel — never disabled controls).
//
// This is a conceptual TOUR, not a problem solver: there are no answer gates. Every step is
// reachable and Next always advances; a step counts complete once visited so the rail shows
// progress. The fold (Generate Orthographic Projection) and — on Step 6 — the Rotation Method are
// exposed through per-step `controls`; main.js owns their wiring.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim` controller; this
// module never reaches into the orchestrator or another leaf. It imports lineTypesData.js the
// same pure-data way terms.js does.

import { STEPS } from './lineTypesData.js';

const TOTAL = STEPS.length;

const FOLD_IDLE = '▶ Generate Orthographic Projection';
const FOLD_REFOLD = '↩ Fold back to 3D';

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   applyStep: (meta: object) => void,
 *   fold: () => void,
 *   unfold: () => void,
 *   isFolded: () => boolean,
 *   spotlight?: (id: string) => void,
 *   orbitHint?: () => void,
 * }} sim
 * @returns {{ sync: () => void, refresh: () => void, reset: () => void, goStep: (n:number)=>void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

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
  const btnFinish = $('btn-finish');
  const btnFold = $('btn-fold');
  const doneFold = $('done-fold');

  if (elTotal) elTotal.textContent = String(TOTAL);

  let currentStep = 1;
  let highestVisited = 1;

  /** A step counts complete once the learner has moved past it (a visited tour, no answer gates). */
  function isComplete(i) { return i < highestVisited; }

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
        // Every visited step (and the next one) is reachable; a not-yet-seen step stays locked so
        // the tour is walked in order the first time through.
        const reachable = i <= highestVisited;
        btn.disabled = !reachable;
        // Spell the ⟂ glyph for the accessible name — screen readers announce it
        // inconsistently (often silent / "up tack"). The visible label stays compact.
        const name = (labelEl ? labelEl.textContent.trim() : `Step ${i}`).replace(/⟂/g, 'Perpendicular to');
        const stateWord = current ? 'current step' : reachable ? 'go to step' : 'locked';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${stateWord}`);
        if (current) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    }
  }

  /** Reflect the live fold state into the step's fold toggle + its done badge. */
  function renderActions() {
    const folded = sim.isFolded();
    if (btnFold) btnFold.textContent = folded ? FOLD_REFOLD : FOLD_IDLE;
    if (doneFold) doneFold.hidden = !folded;
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) btnNext.hidden = currentStep >= TOTAL; // terminal step: no Next
    // Finish lesson: takes over the footer's primary slot exactly when Next vacates
    // it (terminal step has no gate, so it's enabled as soon as reached).
    if (btnFinish) btnFinish.hidden = currentStep < TOTAL;
  }

  /** Show one step (progressive disclosure): card copy, the meaningful controls, rail, and hand the
   *  descriptor to the orchestrator (which locks the case + angles, positions the line, frames the
   *  camera). */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    highestVisited = Math.max(highestVisited, currentStep);

    const meta = STEPS[currentStep - 1];

    // Leaving a folded sheet by moving to another step reverses the fold, so a learner never edits
    // a line with the sheet stuck flat.
    if (sim.isFolded()) sim.unfold();

    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;
    if (elBody) elBody.innerHTML = meta.body.map((p) => `<p>${p}</p>`).join('');
    if (elHint) {
      elHint.hidden = !meta.hint;
      if (elHintText && meta.hint) elHintText.textContent = meta.hint;
    }

    // Reveal only the control wrappers this line type declares (dynamic panel — never disabled).
    for (const wrap of ctrlWraps) {
      wrap.hidden = !meta.controls.includes(wrap.dataset.ctrl);
    }

    // Hand the whole descriptor to the orchestrator: lock case + angles, position the line, frame
    // the camera — the ONE channel the wizard drives the scene through.
    sim.applyStep(meta);

    if (meta.orbitHint) sim.orbitHint?.();
    if (meta.spotlight) sim.spotlight?.(meta.spotlight);

    const scroller = card && (card.querySelector('.card__scroll') || card);
    if (scroller) scroller.scrollTop = 0;

    renderRail();
    renderActions();
    renderNav();

    if (announce) sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  // Fold toggle (Generate Orthographic Projection) — present on every step.
  btnFold?.addEventListener('click', () => {
    if (sim.isFolded()) {
      sim.unfold();
      sim.announce('Folded back into the 3D view — the line is restored in space.');
    } else {
      sim.fold();
      sim.announce('The horizontal plane folds down — both views now lie flat on one orthographic sheet.');
    }
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Finish lesson: posts sim:complete to the host (no latch — every click reposts,
  // ADR-078 addendum revised). Button stays as-is afterward (no disable/relabel,
  // locked decision) — announce() is the only feedback.
  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep || target > highestVisited) return;
      goToStep(target);
    }, listen);
  }

  function sync() { renderRail(); renderActions(); renderNav(); }

  function refresh() {
    const meta = STEPS[currentStep - 1];
    for (const wrap of ctrlWraps) wrap.hidden = !meta.controls.includes(wrap.dataset.ctrl);
    renderRail(); renderActions(); renderNav();
  }

  function reset() {
    highestVisited = 1;
    goToStep(1, { announce: false });
  }

  goToStep(1, { announce: false });

  return { sync, refresh, reset, goStep: (n) => goToStep(n, { announce: false }), dispose: () => ac.abort() };
}
