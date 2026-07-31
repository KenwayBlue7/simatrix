// Guided-stepper controller — the wizard shell that replaces the Live-Sandbox
// dock (PRODUCT.md: "Simatrix sims are Guided Steppers, not free Live Sandboxes").
// It sequences six steps, revealing one step's controls at a time (progressive
// disclosure) and gating each behind the previous one's completion.
//
//   1. Add & rest the solid       4. Draw top & front views (HP + VP)
//   2. Position & incline         5. Add side view (reveal PP)
//   3. Label vertices             6. Flatten to 2D
//
// Layering (CLAUDE.md): leaf module. Like uiManager.js it imports NO other layer;
// main.js injects the same `sim` controller. uiManager owns the low-level
// control↔sim wiring (sliders, toggles, two-way sync); this module owns step flow,
// the rail/card chrome, the step-action buttons, and downstream invalidation. Both
// are leaves on simController, so the one-language layering rule holds.

/**
 * Per-step copy (warm tutor voice — PRODUCT.md brand personality). Titles/leads
 * are set into the card; the rail labels live in the HTML.
 */
const STEPS = [
  {
    n: 1,
    title: 'Add & rest',
    lead: 'Pick a solid and set its size, then add it to the scene. Choose which reference plane its base rests on — the HP keeps the axis upright; the VP lays the solid down with its axis horizontal.',
  },
  {
    n: 2,
    title: 'Position & incline',
    lead: 'Tilt or turn the solid. Incline a face onto a plane, orient it to a corner or edge, or spin it freely. The views you draw next depend on how it sits.',
  },
  {
    n: 3,
    title: 'Label the vertices',
    lead: 'Name each corner so you can follow the very same point from the solid into every view. We letter the base A, B, C… and an apex O, and draw the central axis as a chain line from O down to P at the base centre. Curved solids number their rim 1, 2, 3… with dashed generators running up the surface.',
  },
  {
    n: 4,
    title: 'Draw top & front views',
    lead: 'Cast the solid onto the planes: a top view onto the HP (teal) and a front view onto the VP (amber). Edges the body hides are drawn dashed.',
  },
  {
    n: 5,
    title: 'Add the side view',
    lead: 'Bring in the profile plane (PP, violet) standing at the solid’s side, and cast the third view onto it. Top, front, and side together fix the solid completely.',
  },
  {
    n: 6,
    title: 'Flatten to 2D',
    lead: 'Swing the vertical and profile planes flat: the front view folds down beside the top view, the side view beside the front, and the camera lifts to read the finished first-angle drawing square-on.',
  },
];

const TOTAL = STEPS.length;

/**
 * @param {import('./uiManager.js').SimController & {
 *   hasSolid: () => boolean,
 *   addSolid: (shape?: string) => void,
 *   setLabels: (on: boolean) => void,
 *   setProjections: (on: boolean) => void,
 *   setSideView: (on: boolean) => void,
 *   setDimensions: (on: boolean) => void,
 *   flatten: () => void,
 *   unflatten: () => void,
 *   completeAndNext: () => void,
 *   isProblemActive: () => boolean,
 *   markComplete: () => void,
 * }} sim
 * @returns {{ sync: () => void, reset: () => void, dispose: () => void }}
 */
export function initStepper(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // --- DOM ---
  const card = $('step-card');
  // The scrollable region is now .card__scroll (the .card__nav footer is pinned outside
  // it); fall back to #step-card for older markup that hasn't split the scroller out.
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

  const btnAdd = $('btn-add');
  const btnLabel = $('btn-label');
  const btnProject = $('btn-project');
  const btnSideView = $('btn-sideview');
  const btnFlatten = $('btn-flatten');
  const btnDimensions = $('btn-dimensions');
  const btnUnfold = $('btn-unfold');
  const btnCompleteNext = $('btn-complete-next');
  const doneLabel = $('done-label');
  const doneProject = $('done-project');
  const doneSideView = $('done-sideview');
  const shapeSelect = $('ctl-shape');

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state. Layer flags mirror what the engine is currently showing. ---
  let currentStep = 1;
  const state = { visited2: false, labels: false, projections: false, sideView: false, flattened: false, dimensions: false };

  /** Whether step i counts as complete (drives rail checks + Next gating). */
  function isComplete(i) {
    switch (i) {
      case 1: return sim.hasSolid();
      case 2: return state.visited2;
      case 3: return state.labels;
      case 4: return state.projections;
      case 5: return state.sideView;
      case 6: return state.flattened;
      default: return false;
    }
  }

  /** Whether the learner may advance from the current step. */
  function canAdvance(step) {
    if (step >= TOTAL) return false; // step 6 is terminal
    if (step === 2) return true;     // exploratory — always satisfiable
    return isComplete(step);
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
      // Non-colour cue: check glyph when complete, number otherwise.
      if (marker) marker.textContent = complete ? '✓' : String(i);

      // The rail is a one-way-back map: you may jump to the step you are on or any
      // step you have already completed, but upcoming steps stay locked (disabled),
      // so forward progress is still gated by completion — the same gate as Next.
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

  /** Reflect the current layer flags into the per-step action buttons + badges. */
  function renderActions() {
    if (btnAdd) btnAdd.hidden = sim.hasSolid();
    if (btnLabel) btnLabel.hidden = state.labels;
    doneLabel?.classList.toggle('is-on', state.labels);
    if (btnProject) btnProject.hidden = state.projections;
    doneProject?.classList.toggle('is-on', state.projections);
    if (btnSideView) btnSideView.hidden = state.sideView;
    doneSideView?.classList.toggle('is-on', state.sideView);
    if (btnFlatten) btnFlatten.hidden = state.flattened;
    if (btnUnfold) btnUnfold.hidden = !state.flattened;
    // Dimensions (Step 6, optional): a TRUE on/off toggle — the button stays visible and
    // swaps its label + aria-pressed between "Show dimensions" and "Hide dimensions"; the
    // done badge lights while dimensions are on. It gates nothing (Step 6 is terminal), so
    // it stays out of isComplete/canAdvance.
    if (btnDimensions) {
      btnDimensions.textContent = state.dimensions ? 'Hide dimensions' : 'Show dimensions';
      btnDimensions.setAttribute('aria-pressed', String(state.dimensions));
    }
    // "Try another problem" (Feature 1) appears only once the drawing is flattened.
    // Renamed off "Complete..." wording (Finish-button pilot) so it stops reading as
    // the lesson-completion action now that #btn-finish owns that signal — this stays
    // the repeatable practice-loop action, same label in both problem and free-play
    // modes (still opens the library to choose a challenge either way).
    if (btnCompleteNext) {
      btnCompleteNext.hidden = !state.flattened;
      btnCompleteNext.textContent = 'Try another problem';
    }
  }

  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    if (btnNext) {
      btnNext.hidden = currentStep >= TOTAL; // terminal step: no Next
      btnNext.disabled = !canAdvance(currentStep);
    }
    // Finish lesson: takes over the footer's primary nav slot exactly when Next
    // vacates it (terminal step), same mutual-exclusivity idiom as #btn-flatten/
    // #btn-unfold. Enabled on state.flattened — the same signal isComplete(6)
    // already uses, no new completion concept invented.
    if (btnFinish) {
      btnFinish.hidden = currentStep < TOTAL;
      btnFinish.disabled = !state.flattened;
    }
  }

  /** Show one step's panel (progressive disclosure) and update card copy + chrome. */
  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    if (currentStep === 2) state.visited2 = true;

    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      panel.classList.toggle('is-active', show); // re-triggers the panelIn animation
    }

    // Start each step at the top — a long previous step may have left the card
    // scrolled down, and the new step should read from its title.
    if (cardScroll) cardScroll.scrollTop = 0;

    renderRail();
    renderActions();
    renderNav();

    if (announce) sim.announce(`Step ${currentStep} of ${TOTAL}. ${meta.title}.`);
  }

  // ----------------------------------------------------------------------------
  // Reflow on edit — editing an early step is NON-DESTRUCTIVE. Labels (Step 3),
  // projections (Step 4), and the side view (Step 5) reflow automatically on the
  // next rebuild because their flags stay on, so a slider nudge updates them live
  // instead of discarding them (no confirm dialog, no lost work). Only the flatten
  // (Step 6) reverses: editing geometry while the solid is folded flat and hidden is
  // confusing, so unfold back to 3D so the learner sees their change, then they can
  // re-flatten when ready.
  // ----------------------------------------------------------------------------

  function reflowFrom(step) {
    if (step < 6 && state.flattened) {
      // Show Method (ADR-084) depends on the flatten this branch is about to reverse — tear
      // it down FIRST (before sim.unflatten()), same reasoning as this branch's own existing
      // order: the edit should be visible in 3D, and a running walkthrough pointed at a sheet
      // that's about to stop existing would otherwise be left stranded mid-beat.
      sim.method.abort();
      sim.unflatten();
      state.flattened = false;
      renderRail();
      renderActions();
      renderNav();
      // Two channels, one moment: sr-only narration for screen readers, and a visible
      // viewport note so a sighted learner sees WHY the flat drawing sprang back to 3D
      // (critique P1 — status that was previously announced to screen readers only).
      sim.announce('Unfolded to 3D so you can see your change. Re-flatten when ready.');
      sim.flowNote('Unfolded so you can see your change. Re-flatten when ready.');
    }
  }

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  // Editing on Step 1 or Step 2 reflows later steps' output live (see reflowFrom).
  // The commit itself is handled by uiManager (its listeners fire first); these
  // only reverse a flatten so the edit is visible in 3D. Buttons are excluded.
  for (const panel of panels) {
    const step = Number(panel.dataset.step);
    if (step > 2) continue;
    const onEdit = (e) => {
      if (e.target.matches('input, select')) reflowFrom(step);
    };
    panel.addEventListener('input', onEdit, listen);
    panel.addEventListener('change', onEdit, listen);
  }

  // Step 1 — add the first solid from the empty start.
  btnAdd?.addEventListener('click', () => {
    sim.addSolid(shapeSelect ? shapeSelect.value : undefined);
    sim.announce('Solid added. Set its size and choose which plane its base rests on, then continue.');
    renderRail();
    renderActions();
    renderNav();
  }, listen);

  // Step 3 — labels.
  btnLabel?.addEventListener('click', () => {
    sim.setLabels(true);
    state.labels = true;
    sim.announce('Vertices labelled.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Step 4 — top & front views (HP + VP projections).
  btnProject?.addEventListener('click', () => {
    sim.setProjections(true);
    state.projections = true;
    sim.announce('Top and front views drawn onto the HP and VP.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Step 5 — side view (reveal the profile plane + its projection).
  btnSideView?.addEventListener('click', () => {
    sim.setSideView(true);
    state.sideView = true;
    sim.announce('Profile plane revealed and side view drawn onto the PP.');
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Step 6 — flatten / unfold (terminal; reversible).
  btnFlatten?.addEventListener('click', () => {
    sim.flatten();
    state.flattened = true;
    sim.announce('Planes folded flat into the 2D orthographic drawing.');
    renderRail(); renderActions(); renderNav();
    sim.method.refresh(); // ADR-084: Show Method's trigger becomes available now flattened=true
  }, listen);
  btnUnfold?.addEventListener('click', () => {
    sim.method.abort(); // no-op if it wasn't running — same guard as reflowFrom's own call
    sim.unflatten();
    state.flattened = false;
    sim.announce('Unfolded back to the 3D view.');
    renderRail(); renderActions(); renderNav();
    sim.method.refresh(); // trigger becomes unavailable again now flattened=false
  }, listen);

  // Step 6 — TOGGLE the BIS Type-B dimension layer on the top + front views (ADR-041).
  // Flip the state, drive the engine to match, and let renderActions swap the button
  // label (Show ↔ Hide). Gates nothing, so the rail/nav don't actually change here.
  // Confirmation goes out via flowNote (viewport toast) instead of a panel badge, so
  // the Step 6 panel stays compact — announce() still covers screen readers.
  btnDimensions?.addEventListener('click', () => {
    const next = !state.dimensions;
    sim.setDimensions(next);
    state.dimensions = next;
    const msg = next
      ? 'Dimensions drawn onto the top and front views.'
      : 'Dimensions hidden.';
    sim.announce(msg);
    sim.flowNote(msg);
    renderRail(); renderActions(); renderNav();
  }, listen);

  // Step 6 — try another problem (Feature 1). completeAndNext clears any active problem,
  // resets through the single path, and opens the Problem Library. The reset re-renders
  // this chrome via reset()→goToStep(1), so no manual re-render is needed here.
  btnCompleteNext?.addEventListener('click', () => sim.completeAndNext(), listen);

  // Finish lesson: posts sim:complete to the host (no latch — every click reposts,
  // ADR-078 addendum revised). Button stays as-is afterward (no disable/relabel,
  // locked decision) — announce() is the only feedback, same pattern as the
  // Problem Library's exit flow.
  btnFinish?.addEventListener('click', () => {
    sim.markComplete?.();
    sim.announce?.('Lesson marked complete.');
  }, listen);

  // Navigation.
  btnNext?.addEventListener('click', () => { if (canAdvance(currentStep)) goToStep(currentStep + 1); }, listen);
  btnBack?.addEventListener('click', () => goToStep(currentStep - 1), listen);

  // Rail jump — completed steps (and the current one) are clickable shortcuts back
  // into the flow. Disabled markers can't fire a click, but the completion guard
  // also covers keyboard/programmatic activation, so a forward jump can only ever
  // land on a step the learner has already completed.
  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    btn?.addEventListener('click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep) return; // already here — no-op
      if (!isComplete(target)) return;    // forward stays locked until complete
      goToStep(target);
    }, listen);
  }

  // ----------------------------------------------------------------------------
  // Lifecycle
  // ----------------------------------------------------------------------------

  /** Re-render chrome from current sim/layer state (e.g. after addSolid). */
  function sync() { renderRail(); renderActions(); renderNav(); }

  /** Return to the empty start + Step 1. Called by simAPI.reset() AFTER the engine
   *  has already emptied the scene and dropped the layer flags — so this only
   *  resets the wizard's own state and chrome, never the engine (no second path). */
  function reset() {
    state.visited2 = false;
    state.labels = false;
    state.projections = false;
    state.sideView = false;
    state.flattened = false;
    state.dimensions = false;
    goToStep(1, { announce: false });
  }

  /** Re-sync the flatten latch from an external forced fold change (e.g. Compare's
   *  workbench forcing an unflatten) that bypasses the btnFlatten/btnUnfold handlers,
   *  so Step 6's button + rail check don't go stale against the engine's real state. */
  function setFlattened(flat) {
    state.flattened = flat;
    renderRail();
    renderActions();
    renderNav();
  }

  // Initial render — empty start, Step 1, no announcement (avoids talking over the
  // page load for screen readers).
  goToStep(1, { announce: false });

  return { sync, reset, setFlattened, dispose: () => ac.abort() };
}
