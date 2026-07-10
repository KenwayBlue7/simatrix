// problemLibrary.js — Problem Library controller (a leaf layer).
//
// Ported from the legacy Module1/src/problemLibrary.js (the generic, data-driven controller
// the retired engine.js Points/Lines sims shared) and adapted onto this topic's Module 2
// orchestrator pattern (ADR-007 / ADR-033). It is unchanged in spirit: a quiet practice mode
// that wraps the Guided Stepper WITHOUT touching it. A "Practice problems" entry opens a
// full-viewport, focus-trapped overlay of textbook problems (grouped by tier); picking one
// routes through the single reset path, pins the statement in the wizard panel, jumps the
// learner to the step where the setup can be dialled, and runs a gentle self-check. NOTHING is
// auto-filled — the student dials the setup by hand (the pedagogy is the word-problem → 3D
// translation, ADR-015), and the check lights green only when the live config matches.
//
// Generic by design: it is DATA-DRIVEN through the `problems` config (list / tiers / fieldLabels
// / entryStep), so the same controller that served the legacy Points and Lines sims serves this
// one — main.js passes it src/pointProblems.js. The self-check is driven by `sim.onStateChange`,
// which main.js fires (notifyStateChange) at the end of every rebuild() — the one seam every
// parameter and step change passes through.
//
// ONE adaptation from the legacy file: the "Complete & next problem" affordance is NO LONGER
// owned here (the legacy library drove a `#problem-complete` button in the active-problem
// header). On the Module 2 orchestrator pattern that payoff button lives in the guided
// stepper's final step and routes through simController.completeAndNext() (which calls this
// controller's exit() + open()); so the internal complete-button / showComplete machinery was
// dropped. Everything else — the ±0.5 tolerant OR-array self-check, entryStep routing, the
// scaffolded hints, the focus-trapped overlay + "clears your work" confirm — is verbatim.
//
// Layering (CLAUDE.md / ADR-007): imports nothing from the orchestrator; it speaks only to the
// injected `sim` facade and the passed `problems` data. Uses window.simAPI.pause/resume (via the
// engine) while the overlay covers the live viewport.

const TOL = 0.5; // ±0.5 mm / ° tolerance on every numeric target field (ADR-015)

/**
 * @param {{
 *   state: () => object,
 *   hasWork: () => boolean,
 *   isBusy: () => boolean,
 *   reset: () => void,
 *   goStep: (i: number) => void,
 *   announce: (msg: string) => void,
 *   cueHint?: (msg: string) => void,
 *   firstControl?: () => (HTMLElement | null),
 *   onStateChange: (cb: () => void) => (() => void),
 * }} sim
 * @param {{ list: Array, tiers: Array, fieldLabels: Record<string,string>,
 *           entryStep?: (target: object) => number }} problems
 */
export function initProblemLibrary(sim, problems) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // A problem's `target` is normally one object whose every field must match; it may also be
  // an ARRAY of equally-valid alternatives (an "OR") — matching any one of them passes. Used
  // for genuinely-degenerate cases (e.g. a point on a plane, where several quadrants coincide).
  const list = problems.list || [];
  const tiers = problems.tiers || [];
  const fieldLabels = problems.fieldLabels || {};
  const entryStepFor = problems.entryStep || (() => -1);

  // --- DOM ---
  const entryBtn = $('open-problem-library');
  const overlayEl = $('problem-library');
  const closeBtn = $('problem-library-close');
  const listEl = $('problem-library-list');
  const confirmEl = $('problem-library-confirm');
  const confirmTextEl = $('problem-library-confirm-text');
  const confirmLoadBtn = $('problem-confirm-load');
  const confirmCancelBtn = $('problem-confirm-cancel');

  const headerEl = $('active-problem');
  const statementEl = $('active-problem-statement');
  const hintsWrap = $('active-problem-hints');
  const hintList = $('active-problem-hint-list');
  const hintBtn = $('active-problem-hint-btn');
  const statusEl = $('active-problem-status');
  const toggleBtn = $('active-problem-toggle');
  const exitBtn = $('exit-problem');

  // Fail silent if the markup is missing (keeps the sim booting).
  if (!entryBtn || !overlayEl || !listEl || !headerEl) {
    return { open() {}, exit() {}, isActive: () => false, dispose: () => ac.abort() };
  }

  const entryLabelEl = entryBtn.querySelector('span');
  const setEntryLabel = (text) => { if (entryLabelEl) entryLabelEl.textContent = text; };

  const byId = new Map(list.map((p) => [p.id, p]));

  let activeProblem = null;
  let pendingProblem = null; // awaiting the "clears your work" confirm
  let matched = false;       // last self-check result, so the match is announced once
  let hintsShown = 0;        // revealed scaffolded hint steps

  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  // ----------------------------------------------------------------------------
  // Self-check — compare the live dialled config to the active problem's target.
  // ----------------------------------------------------------------------------

  /** Tolerant compare: numbers to ±TOL, everything else by identity. */
  function fieldMatches(actual, want) {
    if (typeof want === 'number' && typeof actual === 'number') return Math.abs(actual - want) <= TOL;
    return actual === want;
  }

  /** Build a readable list: ["a","b","c"] → "a, b and c". */
  function humanList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  /** The unmatched field labels for ONE target object (empty array = full match). */
  function diffsFor(target, state) {
    const diffs = [];
    for (const [key, want] of Object.entries(target)) {
      if (!fieldMatches(state[key], want)) diffs.push(fieldLabels[key] ?? key);
    }
    return diffs;
  }

  /** Re-evaluate the match and paint the status line. Cheap; runs on every rebuild. */
  function evaluate() {
    if (!activeProblem) return;
    const state = sim.state();
    if (!state) { matched = false; paintStatus(false, 'Set up the view to match the problem.'); return; }

    // `target` may be a single object OR an array of equally-valid alternatives (an "OR"):
    // a full match against ANY alternative passes; otherwise we report the CLOSEST one
    // (fewest diffs) so the learner is guided toward the nearest valid configuration.
    const candidates = Array.isArray(activeProblem.target) ? activeProblem.target : [activeProblem.target];
    let best = null;
    for (const cand of candidates) {
      const d = diffsFor(cand, state);
      if (d.length === 0) { best = d; break; }       // any full match wins immediately
      if (!best || d.length < best.length) best = d; // else track the closest alternative
    }
    best = best ?? []; // defensive: an empty target array means "no constraints" → matched

    if (best.length === 0) {
      paintStatus(true, 'Your setup matches the problem.');
      if (!matched) {
        matched = true;
        sim.announce('Your setup matches the problem. Read your drawing to confirm the views.');
      }
    } else {
      matched = false;
      paintStatus(false, `Still to match: ${humanList(best)}.`);
    }
  }

  const CHECK_SVG =
    '<svg class="match-status__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">' +
    '<path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** Paint the self-check line. ok=true uses success colour + a check (never red). */
  function paintStatus(ok, text) {
    if (!statusEl) return;
    statusEl.classList.toggle('match-status--ok', ok);
    statusEl.innerHTML = (ok ? CHECK_SVG : '') + `<span>${text}</span>`;
  }

  // ----------------------------------------------------------------------------
  // Active-problem header (the tutor reading the problem in the wizard panel).
  // ----------------------------------------------------------------------------

  function loadProblem(problem) {
    // Loading reaches reset() + a step jump, both of which route through rebuild() — refused
    // while a fold is animating. Hold off rather than silently strand the load.
    if (sim.isBusy && sim.isBusy()) {
      sim.announce('Please wait for the animation to finish, then load the problem.');
      return;
    }
    activeProblem = problem;
    matched = false;
    setEntryLabel('Change problem');
    if (statementEl) statementEl.textContent = problem.statement;
    resetHints();
    headerEl.hidden = false;
    setCollapsed(false);

    sim.reset();                              // clean slate → defaults (fires onStateChange)
    // entryStepFor reads a single target, so hand it one representative object — the first
    // alternative when the target is an OR-array.
    const repr = Array.isArray(problem.target) ? problem.target[0] : problem.target;
    const entry = entryStepFor(repr);
    if (typeof entry === 'number' && entry >= 0) sim.goStep(entry); // route to the dial-able step
    evaluate();                               // paint status even before a subscriber runs
    if (problem.cue) sim.cueHint?.(problem.cue);
    sim.announce(`Problem loaded: ${problem.title}. Dial the setup to match, then check your drawing.`);
    closeOverlay({ focusSolve: true });
  }

  function exitProblem() {
    activeProblem = null;
    matched = false;
    setEntryLabel('Practice problems');
    resetHints();
    headerEl.hidden = true;
    sim.announce('Exited the problem. Your drawing is kept.');
  }

  function setCollapsed(collapsed) {
    headerEl.classList.toggle('is-collapsed', collapsed);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      toggleBtn.textContent = collapsed ? 'Show text' : 'Hide text';
    }
  }

  /** Reset the scaffolded "Need a hint?" affordance to pristine for the active problem. */
  function resetHints() {
    hintsShown = 0;
    if (hintList) hintList.replaceChildren();
    if (hintsWrap) hintsWrap.hidden = true;
    if (!hintBtn) return;
    const count = activeProblem?.hints?.length ?? 0;
    hintBtn.hidden = count === 0;
    hintBtn.disabled = false;
    hintBtn.textContent = 'Need a hint?';
  }

  function allHintsShown() {
    return hintsShown >= (activeProblem?.hints?.length ?? 0);
  }

  /** Reveal the next scaffolded hint (one per click), announced for screen readers. */
  function revealNextHint() {
    const hints = activeProblem?.hints ?? [];
    if (hintsShown >= hints.length) return;
    if (hintsWrap) hintsWrap.hidden = false;
    const li = el('li');
    li.textContent = hints[hintsShown];
    hintList?.appendChild(li);
    hintsShown++;
    sim.announce(`Hint ${hintsShown} of ${hints.length}. ${hints[hintsShown - 1]}`);
    if (!hintBtn) return;
    hintBtn.textContent = hintsShown >= hints.length
      ? 'Hide hints'
      : `Show next hint (${hintsShown + 1} of ${hints.length})`;
  }

  /** Reveal the next hint while steps remain; once all are shown, toggle the list's visibility. */
  function onHintBtn() {
    if (!allHintsShown()) { revealNextHint(); return; }
    if (!hintsWrap || !hintBtn) return;
    const collapse = !hintsWrap.hidden;
    hintsWrap.hidden = collapse;
    hintBtn.textContent = collapse ? 'Show hints' : 'Hide hints';
    sim.announce(collapse ? 'Hints hidden.' : 'Hints shown.');
  }

  // ----------------------------------------------------------------------------
  // Overlay — render, open/close, focus trap, the "clears your work" confirm.
  // ----------------------------------------------------------------------------

  function groupByTier() {
    return tiers
      .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
      .filter((group) => group.problems.length > 0);
  }

  function renderList() {
    listEl.replaceChildren();
    for (const { tier, problems: group } of groupByTier()) {
      const section = el('section', 'problem-group');
      const title = el('h2', 'problem-group__title');
      title.textContent = tier.label;
      section.appendChild(title);
      if (tier.blurb) {
        const blurb = el('p', 'problem-group__blurb');
        blurb.textContent = tier.blurb;
        section.appendChild(blurb);
      }
      const grid = el('div', 'problem-grid');
      for (const problem of group) {
        const card = el('button', 'problem-card');
        card.type = 'button';
        card.dataset.problemId = problem.id;
        const t = el('span', 'problem-card__title');
        t.textContent = problem.title;
        const hint = el('span', 'problem-card__hint');
        hint.textContent = problem.statement;
        card.append(t, hint);
        grid.appendChild(card);
      }
      section.appendChild(grid);
      listEl.appendChild(section);
    }
  }

  function openOverlay() {
    renderList();
    hideConfirm();
    overlayEl.hidden = false;
    window.simAPI?.pause(); // the overlay hides the live viewport — stop the rAF loop
    closeBtn?.focus();
  }

  function closeOverlay({ focusSolve = false } = {}) {
    if (overlayEl.hidden) return;
    overlayEl.hidden = true;
    hideConfirm();
    window.simAPI?.resume();
    // After loading, send the keyboard user to the first dial-able control; on a plain
    // dismiss, return focus to the entry that opened the overlay.
    if (focusSolve) (sim.firstControl?.() ?? entryBtn).focus();
    else entryBtn.focus();
  }

  function requestLoad(problem) {
    // A card click is intentional, but loading still discards in-progress work — guard it
    // when the student has dialled away from defaults (mirrors the Reset confirm rationale).
    if (sim.hasWork && sim.hasWork()) {
      pendingProblem = problem;
      if (confirmTextEl) confirmTextEl.textContent = `Loading “${problem.title}” clears your current work.`;
      confirmEl.hidden = false;
      confirmLoadBtn?.focus();
    } else {
      loadProblem(problem);
    }
  }

  function hideConfirm() {
    if (confirmEl) confirmEl.hidden = true;
    pendingProblem = null;
  }

  // --- Focus trap + Escape (scoped to the overlay; harmless while it is hidden) ---
  function focusables() {
    return [...overlayEl.querySelectorAll('button')].filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );
  }

  function onOverlayKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (!confirmEl.hidden) hideConfirm();
      else closeOverlay();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  entryBtn.addEventListener('click', openOverlay, listen);
  closeBtn?.addEventListener('click', () => closeOverlay(), listen);
  overlayEl.addEventListener('keydown', onOverlayKeydown, listen);

  listEl.addEventListener('click', (e) => {
    const card = e.target.closest('[data-problem-id]');
    if (!card) return;
    const problem = byId.get(card.dataset.problemId);
    if (problem) requestLoad(problem);
  }, listen);

  confirmLoadBtn?.addEventListener('click', () => {
    const problem = pendingProblem;
    hideConfirm();
    if (problem) loadProblem(problem);
  }, listen);
  confirmCancelBtn?.addEventListener('click', () => {
    hideConfirm();
    closeBtn?.focus();
  }, listen);

  toggleBtn?.addEventListener('click', () => setCollapsed(!headerEl.classList.contains('is-collapsed')), listen);
  exitBtn?.addEventListener('click', exitProblem, listen);
  hintBtn?.setAttribute('aria-controls', 'active-problem-hint-list');
  hintBtn?.addEventListener('click', onHintBtn, listen);

  // Drive the self-check off the single rebuild() seam.
  const unsubscribe = sim.onStateChange(evaluate);

  return {
    // open / exit / isActive are surfaced for the orchestrator's "Complete & next problem"
    // flow (simController.completeAndNext → exit() then open()) and for the stepper's
    // button label (isActive).
    open: openOverlay,
    exit: exitProblem,
    isActive: () => activeProblem !== null,
    dispose: () => { unsubscribe?.(); ac.abort(); },
  };
}
