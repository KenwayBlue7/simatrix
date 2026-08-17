// Textbook Problem Library controller — TEMPLATE STARTER SKELETON.
//
// Conforms to RULES.md §6.24 / §6.26 (ADR-083): the platform-wide problem-library interface
// contract. Fill in the self-check logic in evaluate() against your own topic's problems.js
// `target` shape — this skeleton wires the DOM contract and returns the required shape, but
// does no actual comparison work yet.
//
// Layering: imports only the data layer (src/problems.js) + the injected `sim` controller;
// never reach into the orchestrator directly.

import { PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier } from './problems.js';

/**
 * @param {{
 *   hasSolid: () => boolean,
 *   onStateChange: (cb: () => void) => (() => void),
 *   state: () => any,
 *   reset: () => void,
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
  // Self-check — FILL IN per your topic's target shape. This stub does no comparison.
  // ----------------------------------------------------------------------------

  /**
   * Re-evaluate the match and paint the status line. Cheap; runs on every rebuild.
   * TODO: compare sim.state() (and whatever else your topic's target needs) against
   * activeProblem.target, using FIELD_LABELS for readable diff text. Keep tolerances at
   * ±0.5° for angles and ±0.05 world units for lengths/offsets; never auto-fill the answer
   * (ADR-015, RULES.md §6.1–§6.2).
   */
  function evaluate() {
    if (!activeProblem || !statusEl) return;
    statusEl.innerHTML = '<span>Self-check not yet implemented for this topic.</span>';
  }

  // ----------------------------------------------------------------------------
  // Active-problem header (in the wizard panel — the tutor reading the problem).
  // ----------------------------------------------------------------------------

  function loadProblem(problem) {
    activeProblem = problem;
    if (statementEl) statementEl.textContent = problem.statement;
    headerEl.hidden = false;

    sim.reset();   // single reset path (CLAUDE.md): empty scene + Step 1. Fires onStateChange.
    evaluate();    // ensure the status is painted even if no subscriber ran yet
    sim.announce(`Problem loaded: ${problem.title}. Set up the solid to match, then draw its views.`);
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
