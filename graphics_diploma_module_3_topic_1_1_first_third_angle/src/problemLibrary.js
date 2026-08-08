// Textbook Problem Library controller — filled in from the template starter
// skeleton (RULES.md §6.24/§6.26, ADR-083) against this topic's one-field target
// shape ({ system: 'first'|'third' }, problems.js). The self-check compares
// sim.state().system to the loaded problem's target with plain equality (no
// numeric tolerance needed — it's a two-value categorical field) — never
// auto-fills; the learner sets the toggle themselves (ADR-015, RULES.md §6.1–§6.2).
//
// Layering: imports only the data layer (src/problems.js) + the injected `sim` controller;
// never reach into the orchestrator directly.

import { PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier } from './problems.js';

/**
 * @param {{
 *   hasSolid: () => boolean,
 *   onStateChange: (cb: () => void) => (() => void),
 *   state: () => { system: string },
 *   reset: () => void,
 *   goStep: (n: number) => void,
 *   announce: (text: string) => void,
 * }} sim
 * @returns {{ open: () => void, exit: () => void, isActive: () => boolean, dispose: () => void }}
 */
export function initProblemLibrary(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // --- DOM (same id contract across every shipped pair; RULES.md §6.24) ---
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
  const hintsWrap = $('active-problem-hints');     // optional: revealed-hints container
  const hintList = $('active-problem-hint-list');  // optional: <ol> hint steps append to
  const hintBtn = $('active-problem-hint-btn');    // optional: "Need a hint?" control
  const statusEl = $('active-problem-status');
  const toggleBtn = $('active-problem-toggle');    // optional: collapse/expand header
  const exitBtn = $('exit-problem');

  // If the markup is missing, fail silent rather than throw (keeps the sim booting).
  if (!entryBtn || !overlayEl || !listEl || !headerEl) {
    return { open: () => {}, exit: () => {}, isActive: () => false, dispose: () => ac.abort() };
  }

  const byId = new Map(PROBLEMS.map((p) => [p.id, p]));

  /** @type {import('./problems.js').Problem | null} */
  let activeProblem = null;
  /** @type {import('./problems.js').Problem | null} */
  let pendingProblem = null; // awaiting the "clears your work" confirm

  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  // ----------------------------------------------------------------------------
  // Self-check — one categorical field (system), plain equality. Cheap; runs on
  // every rebuild via sim.onStateChange.
  // ----------------------------------------------------------------------------

  const CHECK_SVG =
    '<svg class="match-status__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
    + '<path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function evaluate() {
    if (!activeProblem || !statusEl) return;
    const state = sim.state();
    const ok = !!state && state.system === activeProblem.target.system;
    statusEl.classList.toggle('match-status--ok', ok);
    statusEl.innerHTML = ok
      ? `${CHECK_SVG}<span>Matches — ${activeProblem.target.system === 'first' ? 'first' : 'third'}-angle confirmed.</span>`
      : `<span>Still to match: ${FIELD_LABELS.system}.</span>`;
  }

  // ----------------------------------------------------------------------------
  // Active-problem header (in the wizard panel — the tutor reading the problem).
  // ----------------------------------------------------------------------------

  function loadProblem(problem) {
    activeProblem = problem;
    if (statementEl) statementEl.textContent = problem.statement;
    headerEl.hidden = false;

    sim.reset();     // single reset path (CLAUDE.md): defaults + Step 1. Fires onStateChange.
    sim.goStep(6);   // route to Compare — the step with the system toggle live.
    evaluate();      // ensure the status is painted even if no subscriber ran yet
    sim.announce(`Problem loaded: ${problem.title}. Set the toggle to match, then confirm.`);
    closeOverlay();
  }

  function exitProblem() {
    activeProblem = null;
    headerEl.hidden = true;
    sim.announce('Exited the problem. Your drawing is kept.');
  }

  // ----------------------------------------------------------------------------
  // Overlay — render, open/close, the "clears your work" confirm.
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

  function closeOverlay() {
    if (overlayEl.hidden) return;
    overlayEl.hidden = true;
    hideConfirm();
    window.simAPI?.resume();
    entryBtn.focus();
  }

  function requestLoad(problem) {
    if (sim.hasSolid()) {
      pendingProblem = problem;
      if (confirmTextEl) confirmTextEl.textContent = `Loading "${problem.title}" clears your current work.`;
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

  // ----------------------------------------------------------------------------
  // Wiring
  // ----------------------------------------------------------------------------

  entryBtn.addEventListener('click', openOverlay, listen);
  closeBtn?.addEventListener('click', () => closeOverlay(), listen);

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

  exitBtn?.addEventListener('click', exitProblem, listen);

  // Drive the self-check off the single rebuild() seam.
  const unsubscribe = sim.onStateChange(evaluate);

  return {
    open: openOverlay,
    exit: exitProblem,
    isActive: () => activeProblem !== null,
    dispose: () => {
      unsubscribe?.();
      ac.abort();
    },
  };
}
