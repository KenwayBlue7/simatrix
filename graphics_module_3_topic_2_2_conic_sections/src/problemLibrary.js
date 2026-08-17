// Textbook Problem Library controller — a leaf layer, mirroring stepper.js / uiManager.js.
// Adapted from graphics_module_3_topic_2_development_of_surfaces/src/problemLibrary.js for
// the Conic Sections topic: the checked answer here is the CONSTRUCTION the learner sets
// up — the curve, the method, and the quantities the statement gives.
//
// It wraps the existing Guided Stepper without touching it: a quiet entry opens a
// full-viewport, focus-trapped overlay of problem cards (built from src/problems.js,
// grouped by tier, filtered to ENABLED_TIERS minus EXCLUDED_TYPES), picking one routes
// through the single reset path, pins the statement in the wizard panel, and runs a
// gentle self-check.
//
// The self-check compares the RAW input the student dials — sim.conicState() — against the
// problem's target with per-field tolerances: ±0.02 on the eccentricity (one slider step
// is 0.05, so a dialled 0.65 never passes for 2/3 while the typed 0.67 does) and ±0.5 on
// every millimetre and degree (the sibling topics' ADR-063 value). No MEASURED quantity is
// ever auto-filled — not one of the dimensions the statement quotes: unlike the two sibling
// topics, every quantity here IS dial-able, so injecting any of them would hand over part
// of the answer. The one thing that IS set for the learner is the CONSTRUCTION the statement
// names in words, on first arrival at Step 5 (armMethodForStep5, ADR-213) — and it lands the
// dimension sliders at their floor precisely so that selecting it can never pre-solve a
// figure. Driven by sim.onStateChange, which main.js fires at the end of every commit (the
// one seam every parameter change passes through).
//
// Layering (CLAUDE.md): imports only the data layer (src/problems.js + the pure catalogue
// src/conicData.js, RULES.md §3.6a) plus the injected `sim` controller; never reaches into
// the orchestrator. Uses window.simAPI.pause/resume for the rAF loop while the overlay
// covers the live viewport.

import { PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier } from './problems.js';
import { methodById } from './conicData.js';

/**
 * @param {import('./uiManager.js').SimController & {
 *   hasSolid: () => boolean,
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
  let methodArmed = false;   // the problem names a construction and Step 5 has not been reached

  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  // ----------------------------------------------------------------------------
  // Self-check — compare the live construction to the active problem's target.
  // ----------------------------------------------------------------------------

  /** Tolerance on the eccentricity — tighter than a slider step (0.05), so 2/3 has to be
   *  dialled or typed deliberately rather than landed on by accident. */
  const ECC_TOL = 0.02;

  /** Tolerance on every millimetre and degree (the sibling topics' ADR-063 value: an
   *  integer slider stop is never more than 0.5 from a quoted dimension). */
  const SIZE_TOL = 0.5;

  /** Build a readable list: ["a","b","c"] → "a, b and c". */
  function humanList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  /**
   * The name to report for a still-differing field. For the three dimension slots that is
   * the CURRENT method's own label ("Major axis", "Span (base)", …), so the report names
   * the quantity the statement named rather than "first given dimension".
   */
  function fieldLabel(key, target) {
    if (key === 'dim1' || key === 'dim2' || key === 'dim3') {
      const method = methodById(target.method ?? sim.conicState().method);
      const spec = method?.[key];
      if (spec) return spec.label.toLowerCase();
    }
    return FIELD_LABELS[key] ?? key;
  }

  /**
   * Select the construction the statement NAMES, once, on the learner's first arrival at Step 5
   * (ADR-213).
   *
   * Every statement in the syllabus practice set says which method to use in words — "using
   * concentric circle method", "by rectangular method" — so hunting for it in the picker is
   * transcription, not drawing. What is NOT selected is any measured quantity: the dimension
   * fields are set to the bottom of their own sliders, deliberately away from whatever the
   * statement quotes, so the self-check still has real work to report. That is the line RULES.md
   * §6.2 draws, and the `ellipse-concentric` defaults show why it matters — they are 120 × 80,
   * which is one of the practice problems' answers exactly.
   *
   * It fires at Step 5 rather than on load because Steps 1–4 re-derive the sheet's CURVE from the
   * live cut (`syncSheetToCut`, ADR-194), which would leave a curve and a method that disagree.
   * And it fires ONCE: after it, the picker is the learner's.
   */
  function armMethodForStep5() {
    if (!methodArmed || !activeProblem || sim.stage() !== 5) return;
    const want = activeProblem.target.method;
    const method = methodById(want);
    if (!method) { methodArmed = false; return; }
    methodArmed = false;   // before the commit — this runs off the bus the commit fires
    sim.commitConic({
      curve: method.curve,
      method: want,
      dim1: method.dim1.min,
      dim2: method.dim2.min,
      ...(method.dim3 ? { dim3: method.dim3.min } : {}),
    });
    sim.announce(`${method.label} is selected for you — the statement names it. Now dial the sizes it gives.`);
  }

  /** Re-evaluate the match and paint the status line. Cheap; runs on every commit. */
  function evaluate() {
    if (!activeProblem) return;
    const target = activeProblem.target;
    const conic = sim.conicState();
    const diffs = [];

    for (const [key, want] of Object.entries(target)) {
      const actual = conic[key];
      const ok = typeof want === 'number'
        ? Math.abs(actual - want) <= (key === 'e' ? ECC_TOL : SIZE_TOL)
        : actual === want;
      if (!ok) diffs.push(fieldLabel(key, target));
    }

    if (diffs.length === 0) {
      paintStatus(true, 'Your construction matches the problem.');
      if (!matched) {
        matched = true;
        sim.announce('Your construction matches the problem. Read the finished curve on the drawing sheet.');
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
   * Reset the scaffolded "Need a hint?" affordance to its pristine state for the active
   * problem: clear any revealed steps, hide the wrapper, and either offer the button when
   * the problem ships hints, or hide it when it has none.
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
   * last is shown it becomes a "Hide hints" toggle (see onHintBtn) so the revealed list
   * can be collapsed — the reasoning is scaffolded, never dumped.
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
   * The hint button's click behaviour. While steps remain it reveals the next one; once
   * all are shown it toggles the revealed list's visibility so a long breakdown does not
   * hog the wizard panel once the learner has read it.
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

    // Single reset path (CLAUDE.md): defaults + Step 1. No MEASURED quantity from the
    // statement is stamped in — every one of them is dial-able, so injecting any would
    // pre-solve part of the answer (RULES.md §6.2). The named CONSTRUCTION is a different
    // thing and is selected on arrival at Step 5 (armMethodForStep5, ADR-213).
    sim.reset();
    methodArmed = !!problem.target.method;
    evaluate();  // ensure the status is painted even if no subscriber ran yet
    sim.announce(problem.type === 'eccentricity-method'
      ? `Problem loaded: ${problem.title}. Work through to Step 3 and set the eccentricity model.`
      : `Problem loaded: ${problem.title}. Work through to Step 5 — the construction it names is already chosen; dial the sizes it gives.`);
    closeOverlay({ focusSolve: true });
  }

  function exitProblem() {
    activeProblem = null;
    matched = false;
    methodArmed = false;
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
    // After loading a problem the wizard is back at Step 1, and the controls the learner
    // needs live in later panels — so send the keyboard user to the step nav rather than
    // to a control that is not on screen yet. A plain dismiss returns focus to the entry.
    if (focusSolve) $('btn-next')?.focus();
    else entryBtn.focus();
  }

  function requestLoad(problem) {
    // A card click inside a deliberately-opened modal is intentional, but loading still
    // discards the construction in progress — guard it when there is work on the bench.
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

  // Drive the self-check off the single state-change seam. The step change is a state change
  // too, which is what lets the construction be selected on arrival at Step 5 (ADR-213) without
  // this leaf reaching into the orchestrator's stepper.
  const unsubscribe = sim.onStateChange(() => {
    armMethodForStep5();
    evaluate();
  });

  return {
    // Surfaced for main.js's terminal-step "Complete & next problem" flow.
    open: openOverlay,
    exit: exitProblem,
    isActive: () => activeProblem !== null,
    dispose: () => {
      unsubscribe?.();
      ac.abort();
    },
  };
}
