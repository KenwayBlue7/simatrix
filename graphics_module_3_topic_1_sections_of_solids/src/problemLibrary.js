// Textbook Problem Library controller — a leaf layer, mirroring stepper.js / uiManager.js.
// Adapted from graphics_module_2_topic_2_simple_positions/src/problemLibrary.js for the
// Sections of Solids topic: the checked answer here is the CUTTING-PLANE setup, not a pose.
//
// It wraps the existing Guided Stepper without touching it: a quiet entry opens a
// full-viewport, focus-trapped overlay of problem cards (built from src/problems.js,
// grouped by tier, filtered to ENABLED_TIERS minus EXCLUDED_TYPES — the KTU "true shape
// given" ban, ADR-062); picking one routes through the single reset path, stamps the
// statement's solid dimensions (sim.commit(setup) — this topic has no size controls, so
// dims are injected scenery), pins the statement in the wizard panel, and runs a gentle
// self-check.
//
// The self-check compares the RAW input the student dials — sim.state().shape +
// sim.sectionState() — against the problem's target with per-field tolerances
// (ADR-063): ±0.5° on the plane inclination (the integer slider stop is never more
// than 0.5° from any derived angle, so every target is mechanically reachable), ±0.05
// world units (0.5 mm) on the plane position. `angleDeg: 'generator'` resolves live to
// atan(2·height ÷ baseLength) — the parallel-to-a-generator parabola cut — so nothing is
// ever auto-filled: the learner derives the number, the check merely recognises it.
// A cuts-the-solid guard (sim.section() must be non-null) keeps a plane that matches on
// paper but misses the solid from going green. Driven by sim.onStateChange, which main.js
// fires at the end of every rebuild() (the one seam every parameter change passes through).
//
// Layering (CLAUDE.md): imports only the data layer (src/problems.js) + the injected
// `sim` controller; never reaches into the orchestrator. Uses window.simAPI.pause/resume
// for the rAF loop while the overlay covers the live viewport.

import { PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier } from './problems.js';

/**
 * @param {import('./uiManager.js').SimController & {
 *   hasSolid: () => boolean,
 *   section: () => (object | null),
 *   onStateChange: (cb: () => void) => (() => void),
 * }} sim
 * @returns {{ open: () => void, exit: () => void, isActive: () => boolean, dispose: () => void }}
 */
export function initProblemLibrary(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

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
  const hintsWrap = $('active-problem-hints');     // the revealed-steps container
  const hintList = $('active-problem-hint-list');  // <ol> the steps are appended to
  const hintBtn = $('active-problem-hint-btn');    // "Need a hint?" / "Show next hint"
  const statusEl = $('active-problem-status');
  const toggleBtn = $('active-problem-toggle');
  const exitBtn = $('exit-problem');

  // If the markup is missing, fail silent rather than throw (keeps the sim booting).
  if (!entryBtn || !overlayEl || !listEl || !headerEl) {
    return { open: () => {}, exit: () => {}, isActive: () => false, dispose: () => ac.abort() };
  }

  // The entry doubles as the "switch problem" path once one is loaded, so its label is
  // contextual: "Practice problems" when idle, "Change problem" while a problem is active.
  const entryLabelEl = entryBtn.querySelector('span');
  const setEntryLabel = (text) => { if (entryLabelEl) entryLabelEl.textContent = text; };

  const byId = new Map(PROBLEMS.map((p) => [p.id, p]));

  /** @type {import('./problems.js').Problem | null} */
  let activeProblem = null;
  /** @type {import('./problems.js').Problem | null} */
  let pendingProblem = null; // awaiting the "clears your work" confirm
  let matched = false;       // last self-check result, so we announce the match once
  let hintsShown = 0;        // how many scaffolded hint steps are currently revealed

  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  // ----------------------------------------------------------------------------
  // Self-check — compare the live config to the active problem's target.
  // ----------------------------------------------------------------------------

  /** Angular tolerance on the plane inclination, degrees (ADR-063: the integer
   *  slider stop is never more than 0.5° from any derived generator angle). */
  const ANGLE_TOL = 0.5;

  /** Tolerance on the plane position, world units (0.05 u = 0.5 mm — one slider step
   *  always lands inside it). */
  const OFFSET_TOL = 0.05;

  /** A cone generator's inclination to the H.P., degrees: atan(height ÷ radius). */
  function generatorAngleDeg(state) {
    return Math.atan((2 * state.height) / state.baseLength) * (180 / Math.PI);
  }

  /** Build a readable list: ["a","b","c"] → "a, b and c". */
  function humanList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  /** Re-evaluate the match and paint the status line. Cheap; runs on every rebuild. */
  function evaluate() {
    if (!activeProblem) return;
    const target = activeProblem.target;
    const state = sim.state();
    const sec = sim.sectionState();
    const diffs = [];

    if (target.shape && state?.shape !== target.shape) diffs.push(FIELD_LABELS.shape);

    const wantSec = target.section ?? {};
    for (const [key, wantRaw] of Object.entries(wantSec)) {
      let want = wantRaw;
      // 'generator' is the derived parabola target — resolved against the solid actually
      // on the bench, so the check follows the real geometry, never a hard-coded number.
      if (key === 'angleDeg' && want === 'generator') {
        if (!state) { diffs.push(FIELD_LABELS.angleDeg); continue; }
        want = generatorAngleDeg(state);
      }
      const actual = sec[key];
      const ok = typeof want === 'number'
        ? Math.abs(actual - want) <= (key === 'angleDeg' ? ANGLE_TOL : OFFSET_TOL)
        : actual === want;
      if (!ok) diffs.push(FIELD_LABELS[key] ?? key);
    }

    // Cuts-the-solid guard: a plane can match every dialled field yet miss the solid
    // (extreme offset). sim.section() is the cut result — null means no material was cut.
    if (wantSec.enabled && sec.enabled && !sim.section()) diffs.push(FIELD_LABELS.cut);

    if (diffs.length === 0) {
      paintStatus(true, 'Your cut matches the problem.');
      if (!matched) {
        matched = true;
        sim.announce('Your cut matches the problem. Work through the steps — the true shape appears in Step 5.');
      }
    } else {
      matched = false;
      paintStatus(false, `Still to match: ${humanList(diffs)}.`);
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
  // Active-problem header (in the wizard panel — the tutor reading the problem).
  // ----------------------------------------------------------------------------

  /**
   * Reset the scaffolded "Need a hint?" affordance to its pristine state for the
   * active problem: clear any revealed steps, hide the wrapper, and either offer the
   * button ("Need a hint?") when the problem ships hints, or hide it when it has none.
   */
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

  /** Whether every scaffolded hint step for the active problem is already revealed. */
  function allHintsShown() {
    return hintsShown >= (activeProblem?.hints?.length ?? 0);
  }

  /**
   * Reveal the next scaffolded hint step (one per click), announcing it for screen
   * readers. The button advances to "Show next hint (n of N)" while steps remain; once the
   * last is shown it becomes a "Hide hints" toggle (see onHintBtn) so the revealed list can
   * be collapsed to reclaim panel space — the reasoning is scaffolded, never dumped.
   */
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
      ? 'Hide hints' // all shown → the button turns into a collapse toggle (onHintBtn)
      : `Show next hint (${hintsShown + 1} of ${hints.length})`;
  }

  /**
   * The hint button's click behaviour. While steps remain it reveals the next one; once all
   * are shown it toggles the revealed list's visibility (Hide hints / Show hints) so a long
   * breakdown does not hog the wizard panel once the learner has read it.
   */
  function onHintBtn() {
    if (!allHintsShown()) { revealNextHint(); return; }
    if (!hintsWrap || !hintBtn) return;
    const collapse = !hintsWrap.hidden;
    hintsWrap.hidden = collapse;
    hintBtn.textContent = collapse ? 'Show hints' : 'Hide hints';
    sim.announce(collapse ? 'Hints hidden.' : 'Hints shown.');
  }

  function loadProblem(problem) {
    activeProblem = problem;
    matched = false;
    setEntryLabel('Change problem');
    if (statementEl) statementEl.textContent = problem.statement;
    resetHints();
    headerEl.hidden = false;
    setCollapsed(false);

    sim.reset(); // single reset path (CLAUDE.md): default solid + Step 1. Fires onStateChange.
    // Stamp the statement's solid dimensions (no size controls in this topic — dims are
    // injected scenery, never a checked answer). The learner still picks the SOLID in
    // Step 1 and dials the whole cutting plane in Step 2.
    if (problem.setup) sim.commit({ ...problem.setup });
    evaluate();  // ensure the status is painted even if no subscriber ran yet
    sim.announce(`Problem loaded: ${problem.title}. Pick the solid, then set the cutting plane to match.`);
    closeOverlay({ focusSolve: true });
  }

  function exitProblem() {
    activeProblem = null;
    matched = false;
    setEntryLabel('Practice problems');
    resetHints(); // clears revealed steps + hides the button (no active problem now)
    headerEl.hidden = true;
    sim.announce('Exited the problem. Your cut is kept.');
  }

  function setCollapsed(collapsed) {
    headerEl.classList.toggle('is-collapsed', collapsed);
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-expanded', String(!collapsed));
      toggleBtn.textContent = collapsed ? 'Show text' : 'Hide text';
    }
  }

  // ----------------------------------------------------------------------------
  // Overlay — render, open/close, focus trap, the "clears your work" confirm.
  // ----------------------------------------------------------------------------

  function renderList() {
    listEl.replaceChildren();
    for (const { tier, problems } of groupByTier(enabledProblems())) {
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
      for (const problem of problems) {
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
    window.simAPI?.pause(); // overlay hides the live viewport — stop the rAF loop
    closeBtn?.focus();
  }

  function closeOverlay({ focusSolve = false } = {}) {
    if (overlayEl.hidden) return;
    overlayEl.hidden = true;
    hideConfirm();
    window.simAPI?.resume();
    // After loading a problem, send the keyboard user to Step 1's first control; on a
    // plain dismiss, return focus to the entry that opened the overlay.
    if (focusSolve) $('ctl-shape')?.focus();
    else entryBtn.focus();
  }

  function requestLoad(problem) {
    // A card click inside a deliberately-opened modal is intentional, but loading still
    // discards the cut in progress — guard it when there is work on the bench (this topic
    // re-seeds a default solid on reset, so the bench is effectively always occupied).
    if (sim.hasSolid()) {
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
  const unsubscribe = sim.onStateChange(() => evaluate());

  return {
    // Surfaced for main.js's Step-5 "Complete & next problem" flow: open the library,
    // clear the active-problem framing, and report whether a problem is loaded.
    open: openOverlay,
    exit: exitProblem,
    isActive: () => activeProblem !== null,
    dispose: () => {
      unsubscribe?.();
      ac.abort();
    },
  };
}
