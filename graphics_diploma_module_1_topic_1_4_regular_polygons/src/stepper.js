// Guided-stepper controller — the four-step shape every construction in this topic (and,
// by the same pattern, every topic in this syllabus track) shares:
//   1. Choose  — pick one of the three polygons (a picker, not a wall of controls).
//   2. Given   — the construction's starting element(s), tied to a live numeric value.
//   3. Construct — pick a method, then Press Play to watch it resolve (replayable).
//   4. Verify  — the result, and a route into the Problem Library.
// Steps 2-4's title/lead are suffixed with the active construction's name once chosen.
//
// Mechanics copied verbatim from Topic 1.1/1.2/1.3 — only STEPS[0]'s and STEPS[2]'s lead
// text (construction count; the new method switcher) are this topic's own.
//
// Layering (CLAUDE.md): leaf module. Imports nothing; main.js injects `sim`.

const STEPS = [
  { n: 1, title: 'Learn a Construction', lead: 'Pick one of the three polygons to build.' },
  { n: 2, title: 'Given', lead: 'This is what the construction starts from — adjust its value below.' },
  { n: 3, title: 'Construct', lead: 'Choose a method, then press Play to watch it resolve, one step at a time.' },
  { n: 4, title: 'Verify', lead: 'Check the result, then try it as a stated problem.' },
];
const TOTAL = STEPS.length;

/**
 * @param {{
 *   announce: (msg: string) => void,
 *   selectConstruction: (id: string) => void,
 *   getConstructionLabel: () => string | null,
 *   hasConstruction: () => boolean,
 *   onEnterConstructStep: () => void,
 * }} sim
 * @returns {{ sync: () => void, reset: () => void, restart: () => void, dispose: () => void }}
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
  const pickerButtons = [...document.querySelectorAll('.construction-picker__item')];

  if (elTotal) elTotal.textContent = String(TOTAL);

  let currentStep = 1;
  let maxReached = 1;

  function renderRail() {
    for (const item of railItems) {
      const i = Number(item.dataset.step);
      const marker = item.querySelector('.rail__marker');
      const btn = item.querySelector('.rail__btn');
      const labelEl = item.querySelector('.rail__label');
      const current = i === currentStep;
      const complete = !current && i < maxReached;
      const reachable = i <= maxReached;
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      item.classList.toggle('is-upcoming', !current && !reachable);
      if (marker) marker.textContent = complete ? '✓' : String(i);
      if (btn) {
        btn.disabled = !reachable;
        const name = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
        const stateWord = current ? 'current step' : reachable ? 'completed, go to step' : 'locked';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${stateWord}`);
        if (current) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
      }
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) {
      btnNext.hidden = currentStep >= TOTAL;
      // Step 1 gates Next until a construction is chosen (progressive disclosure —
      // there is nothing to move on to otherwise).
      btnNext.disabled = currentStep === 1 && !sim.hasConstruction();
    }
  }

  function goToStep(n, { announce = true } = {}) {
    if (n > 1 && !sim.hasConstruction()) return; // can't leave the picker with nothing chosen
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    maxReached = Math.max(maxReached, currentStep);

    const meta = STEPS[currentStep - 1];
    const label = sim.getConstructionLabel();
    const suffix = currentStep > 1 && label ? ` — ${label}` : '';
    if (elTitle) elTitle.textContent = meta.title + suffix;
    if (elLead) elLead.textContent = meta.lead;

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      panel.classList.toggle('is-active', show);
    }

    if (cardScroll) cardScroll.scrollTop = 0;
    renderRail();
    renderNav();
    if (currentStep === 3) sim.onEnterConstructStep();
    if (announce) sim.announce?.(`Step ${currentStep} of ${TOTAL}. ${meta.title}${suffix}.`);
  }

  btnNext?.addEventListener('click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep || target > maxReached) return;
      goToStep(target);
    }, listen);
  }

  for (const btn of pickerButtons) {
    btn.addEventListener('click', () => {
      sim.selectConstruction(btn.dataset.constructionId);
      for (const b of pickerButtons) b.setAttribute('aria-pressed', String(b === btn));
      renderNav();
      goToStep(2);
    }, listen);
  }

  function sync() { renderRail(); renderNav(); }

  function reset() {
    maxReached = 1;
    for (const b of pickerButtons) b.setAttribute('aria-pressed', 'false');
    goToStep(1, { announce: false });
  }

  /** Return to the picker without a full platform reset (Verify step's "Try another"). */
  function restart() { goToStep(1); }

  /** Jump straight to the Given step (step 2) — used when a Problem Library problem is
   *  loaded, so the student lands on the dial-able step, never the picker (RULES §6.2). */
  function goToGivenStep() { goToStep(2); }

  goToStep(1, { announce: false });
  return { sync, reset, restart, goToGivenStep, dispose: () => ac.abort() };
}
