// Textbook Problem Library controller — a leaf layer, mirroring stepper.js /
// uiManager.js. It wraps the existing Guided Stepper without touching it: a quiet
// entry opens a full-viewport, focus-trapped overlay of problem cards (built from
// src/problems.js, grouped by tier, filtered to the build's ENABLED_TIERS); picking
// one routes through the single reset path (sim.reset → Step 1), pins the problem
// statement in the wizard panel, and runs a gentle self-check.
//
// The self-check compares the RAW input the student dials — sim.state() + sim.modes()
// — against the problem's target with tolerances, so it needs no rotation math (the
// resting plane and turn compare as plain fields). It is driven by sim.onStateChange, which
// main.js fires at the end of every rebuild() (the one seam every parameter/mode change
// passes through).
//
// Layering (CLAUDE.md): imports only the data layer (src/problems.js) + the injected
// `sim` controller; never reaches into the orchestrator. Uses window.simAPI.pause/resume
// for the rAF loop while the overlay covers the live viewport.

import { PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier } from './problems.js';

/**
 * @param {import('./uiManager.js').SimController & {
 *   hasSolid: () => boolean,
 *   onStateChange: (cb: () => void) => (() => void),
 *   orientAngle: (shape: string) => number,
 *   orientPeriod: (shape: string) => number,
 *   cueHint: (text: string) => void,
 * }} sim
 * @returns {{ dispose: () => void }}
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
  let placementCued = false; // placement chip already flashed for this problem load?

  // Round solids whose TARGET lies on the VP quote the AXIS height, but the tool seats the
  // LOWEST point — so the learner must subtract the radius. Those are the "concerned"
  // problems that get the floating placement reminder (chip), keyed off the target shape.
  const ROUND_SHAPES = new Set(['Cylinder', 'Cone']);
  const PLACEMENT_HINT_TEXT =
    'Distance from HP is measured to the lowest point, not the axis — subtract the radius from the quoted axis height.';

  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  // ----------------------------------------------------------------------------
  // Self-check — compare the live config to the active problem's target.
  // ----------------------------------------------------------------------------

  /** Angular tolerance for the turn-about-axis, in degrees. */
  const TURN_TOL = 0.5;

  /** Tolerant field compare for the NON-angular fields: strings (shape / resting plane /
   *  VP ref) by identity, lengths/dists to 0.05 unit (0.5 mm). The turn goes through
   *  turnCongruent instead, because it is symmetry-aware (see below). */
  function fieldMatches(actual, want) {
    if (typeof want !== 'number' || typeof actual !== 'number') return actual === want;
    return Math.abs(actual - want) <= 0.05;
  }

  /**
   * True when two turns produce the SAME pose, i.e. they differ by a whole multiple of
   * the base's rotational-symmetry period (within TURN_TOL). A regular base maps onto
   * itself every 360/n°, so e.g. a cube at 45° and at 135° draw identically — accepting
   * only one would mark a correct hand-dialled turn wrong. (distVP, nearest-point and
   * axis alike, is symmetry-invariant, so this never admits a different drawing.) Mirror
   * images are NOT congruent and are correctly excluded.
   */
  function turnCongruent(actual, want, period) {
    let d = (((actual - want) % period) + period) % period;
    if (d > period / 2) d = period - d; // circular distance to the nearest congruent multiple
    return d <= TURN_TOL;
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
    const modes = sim.modes();

    if (!state) {
      // Empty start (just loaded / reset): the solid isn't on the bench yet.
      matched = false;
      paintStatus(false, 'Add the solid in Step 1, then set it to match the problem.');
      return;
    }

    const diffs = [];
    for (const [key, want] of Object.entries(target)) {
      if (key === 'modes') continue;
      // Orient-to-corner overrides the manual turn (see computeEffectiveAngles): while the
      // preset is ON, the last-dialed rotationY no longer drives the solid, so skip it —
      // the modes check below reports any orient mismatch instead of a confusing second diff.
      if (key === 'rotationY' && modes.orientToCorner) continue;
      // The turn is symmetry-aware (a congruent turn draws identically); every other field
      // uses the plain tolerant compare.
      const ok = key === 'rotationY'
        ? turnCongruent(state.rotationY, want, sim.orientPeriod(state.shape))
        : fieldMatches(state[key], want);
      if (!ok) diffs.push(FIELD_LABELS[key] ?? key);
    }
    if (target.modes) {
      for (const [mode, want] of Object.entries(target.modes)) {
        // Base orientation accepts EITHER path: the orient-to-corner preset, OR a manual
        // turn dialled to the same pose. When a problem wants the preset ON, treat it as
        // satisfied if the toggle is on, OR the live turn lands on the preset angle (modulo
        // the base's symmetry). want === false stays strict — those problems' preset is a
        // DIFFERENT pose, so the toggle must remain rejected.
        if (mode === 'orientToCorner' && want === true) {
          const manualOk = !modes.orientToCorner &&
            turnCongruent(state.rotationY, sim.orientAngle(state.shape), sim.orientPeriod(state.shape));
          if (modes.orientToCorner || manualOk) continue;
          diffs.push('base orientation'); // path-neutral: a manual-route student isn't told to use the toggle
          continue;
        }
        if (Boolean(modes[mode]) !== Boolean(want)) diffs.push(FIELD_LABELS[mode] ?? mode);
      }
    }

    if (diffs.length === 0) {
      paintStatus(true, 'Your setup matches the problem.');
      if (!matched) {
        matched = true;
        sim.announce('Your setup matches the problem. Work through the steps to draw and check it.');
      }
    } else {
      matched = false;
      paintStatus(false, `Still to match: ${humanList(diffs)}.`);
    }
  }

  /** Whether the active problem needs the lowest-point / radius reminder: its target is a
   *  round solid resting on the VP (axis horizontal), where distHP is the lowest point but
   *  the statement quotes the axis height. */
  function needsPlacementHint(p) {
    return p?.target?.restingPlane === 'VP' && ROUND_SHAPES.has(p?.target?.shape);
  }

  /** Flash the placement reminder ONCE per problem load, as soon as a solid is on the bench
   *  (so the chip floats over the viewport like the orbit hint rather than over the empty
   *  start). Driven off the rebuild seam alongside the self-check. */
  function maybeCuePlacement() {
    if (placementCued || !needsPlacementHint(activeProblem) || !sim.hasSolid()) return;
    sim.cueHint?.(PLACEMENT_HINT_TEXT);
    placementCued = true;
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
    placementCued = false; // re-arm the placement chip for this fresh load
    setEntryLabel('Change problem');
    if (statementEl) statementEl.textContent = problem.statement;
    resetHints();
    headerEl.hidden = false;
    setCollapsed(false);

    sim.reset();   // single reset path (CLAUDE.md): empty scene + Step 1. Fires onStateChange.
    evaluate();    // ensure the status is painted even if no subscriber ran yet
    sim.announce(`Problem loaded: ${problem.title}. Set up the solid to match, then draw its views.`);
    closeOverlay({ focusSolve: true });
  }

  function exitProblem() {
    activeProblem = null;
    matched = false;
    placementCued = false;
    setEntryLabel('Practice problems');
    resetHints(); // clears revealed steps + hides the button (no active problem now)
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
    // A card click inside a deliberately-opened modal is intentional, but loading
    // still discards in-progress work — guard it when there is work on the bench
    // (mirrors the Reset confirm rationale).
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

  // Drive the self-check AND the per-problem placement chip off the single rebuild() seam.
  const unsubscribe = sim.onStateChange(() => { evaluate(); maybeCuePlacement(); });

  return {
    // Surfaced for main.js's Step-6 "Complete & next problem" flow: open the library,
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
