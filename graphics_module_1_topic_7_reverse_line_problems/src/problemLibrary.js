// problemLibrary.js — Problem Library controller for the REVERSE Lines topic (a leaf layer).
//
// Forked from Topic 6's problemLibrary.js (ADR-009 clone-and-simplify). The overlay / focus-trap /
// hints / "clears your work" confirm machinery is UNCHANGED — the fork is entirely in what
// "loading" and "checking" a problem mean:
//
//   Topic 6 (forward):  sim.reset() → learner DIALS shapeData by hand → self-check compares the
//                        live DIALLED shapeData to a target subset. Nothing is ever written for
//                        the learner.
//   Topic 7 (reverse):  sim.reset() → sim.commit(problem.shapeData) LOCKS the drawing to the
//                        correct geometry (that's the point — the learner reads a finished
//                        drawing, they don't build one) → sim.setAskFields(problem.askFields)
//                        tells main.js which on-screen dimension labels to hide (lineRig.js /
//                        compareSheet.js hiddenFields) and which guess inputs to show → the
//                        learner types numbers into those guess inputs (a SEPARATE state space,
//                        sim.getGuesses(), never shapeData) → self-check compares guesses to
//                        problem.target, ±0.5 tolerance, ONLY over problem.askFields. A guessed
//                        field is never auto-filled (guesses start empty); a given field is never
//                        guessable (it isn't in askFields, so diffsFor never looks at it).
//
// Layering (CLAUDE.md / ADR-007): imports nothing from the orchestrator; it speaks only to the
// injected `sim` facade and the passed `problems` data. Uses window.simAPI.pause/resume (via the
// engine) while the overlay covers the live viewport.

const TOL = 0.5; // ±0.5 mm / ° tolerance on every numeric guess (ADR-015, unchanged from Topic 6)

/**
 * @param {{
 *   hasWork: () => boolean,
 *   isBusy: () => boolean,
 *   reset: () => void,
 *   commit: (partial: object) => void,
 *   setFieldGating: (given: string[], ask: string[], givenValues?: Record<string, number>) => void,
 *   getGuesses: () => Record<string, number|undefined>,
 *   clearGuesses: () => void,
 *   announce: (msg: string) => void,
 *   cueHint?: (msg: string) => void,
 *   firstControl?: () => (HTMLElement | null),
 *   onStateChange: (cb: () => void) => (() => void),
 * }} sim
 * @param {{ list: Array, tiers: Array, fieldLabels: Record<string,string> }} problems
 */
export function initProblemLibrary(sim, problems) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const list = problems.list || [];
  const tiers = problems.tiers || [];
  const fieldLabels = problems.fieldLabels || {};

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

  /** Tolerant compare: an unanswered guess (undefined/NaN) never matches. */
  function fieldMatches(guess, want) {
    if (typeof guess !== 'number' || !Number.isFinite(guess)) return false;
    return Math.abs(guess - want) <= TOL;
  }

  /** Build a readable list: ["a","b","c"] → "a, b and c". */
  function humanList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  /** The unmatched field labels for the active problem's askFields (empty array = full match). */
  function diffsFor(problem, guesses) {
    const diffs = [];
    for (const key of problem.askFields) {
      if (!fieldMatches(guesses[key], problem.target[key])) diffs.push(fieldLabels[key] ?? key);
    }
    return diffs;
  }

  /** Re-evaluate the match and paint the status line. Cheap; runs on every guess-input change. */
  function evaluate() {
    if (!activeProblem) return;
    const guesses = sim.getGuesses ? sim.getGuesses() : {};
    const diffs = diffsFor(activeProblem, guesses);

    if (diffs.length === 0) {
      paintStatus(true, 'Your guess matches — read the drawing to see how it was found.');
      if (!matched) {
        matched = true;
        sim.announce('Your guess matches. Read the drawing to confirm.');
      }
    } else {
      matched = false;
      paintStatus(false, `Still to guess: ${humanList(diffs)}.`);
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

    sim.reset();                       // clean slate → defaults (fires onStateChange)
    sim.commit(problem.shapeData);     // LOCK the drawing to the correct geometry — this topic
                                        // shows a finished drawing, the learner never dials it
    sim.setFieldGating(problem.givenFields, problem.askFields, problem.givenValues); // which labels to hide + which guess inputs to show
    sim.clearGuesses();                // never pre-fill a guess
    evaluate();                        // paint status even before a subscriber runs
    sim.announce(`Problem loaded: ${problem.title}. Study the drawing, then enter your guess.`);
    closeOverlay({ focusSolve: true });
  }

  function exitProblem() {
    activeProblem = null;
    matched = false;
    setEntryLabel('Practice problems');
    resetHints();
    headerEl.hidden = true;
    sim.setFieldGating([], []);
    sim.announce('Exited the problem. Your drawing is kept.');
  }

  function setCollapsed(collapsed) {
    headerEl.classList.toggle('is-collapsed', collapsed);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      toggleBtn.textContent = collapsed ? 'Show text' : 'Hide text';
    }
  }

  // This topic's problems carry ONE hint string (`problem.hint`) rather than Topic 6's scaffolded
  // `hints[]` array — reverse problems don't need a control-by-control walkthrough, just a nudge
  // toward the right construction. Normalised to an array here so the reveal/count logic below is
  // unchanged from Topic 6.
  function hintsFor() {
    return activeProblem?.hints ?? (activeProblem?.hint ? [activeProblem.hint] : []);
  }

  /** Reset the scaffolded "Need a hint?" affordance to pristine for the active problem. */
  function resetHints() {
    hintsShown = 0;
    if (hintList) hintList.replaceChildren();
    if (hintsWrap) hintsWrap.hidden = true;
    if (!hintBtn) return;
    const count = hintsFor().length;
    hintBtn.hidden = count === 0;
    hintBtn.disabled = false;
    hintBtn.textContent = 'Need a hint?';
  }

  function allHintsShown() {
    return hintsShown >= hintsFor().length;
  }

  /** Reveal the next scaffolded hint (one per click), announced for screen readers. */
  function revealNextHint() {
    const hints = hintsFor();
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
