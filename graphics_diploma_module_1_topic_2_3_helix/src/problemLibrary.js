// The textbook Problem Library: a full-viewport picker (ADR-015 pattern, matching the
// platform family's shape — see graphics_module_1_topic_3_points) plus the persistent
// #active-problem header pinned above the wizard's step card while a problem is loaded.
// Hints are revealed one at a time; the self-check compares the student's dialed-in
// construction parameters against the problem's target — never auto-fills (RULES.md §6.2).
// Loading a problem selects its construction and resets to that construction's own
// defaults, not the target values, then routes to the Given step (main.js's loadProblem).
//
// EXTRACTED from Topic 2.1 with ONE addition this topic needs: matches() gains a
// string-equality branch. Every prior topic's problem targets are pure numbers, so the
// numeric-tolerance diff was the only case; this topic's problems also target `mode`
// (which growth law) — a string, so `Math.abs(string - string)` would silently always be
// NaN (never matching). The numeric branch is untouched, so every other topic's problems
// still work exactly as before.
//
// Layering (CLAUDE.md): imports the pure data problems.js + the injected sim controller.
// Never reaches into constructions.js or renderConstruction.js directly.

import { PROBLEMS, enabledProblems, groupByTier } from './problems.js';

/** @param {Record<string,number|string>} target @param {Record<string,number>} tolerance
 *  @param {Record<string,number|string>} params */
function matches(target, tolerance, params) {
  return Object.keys(target).every((key) => {
    if (typeof target[key] === 'string') return params[key] === target[key];
    const tol = tolerance[key] ?? 0.5;
    return Math.abs((params[key] ?? NaN) - target[key]) <= tol;
  });
}

/**
 * @param {{
 *   getConstructionId: () => string | null,
 *   getParams: () => Record<string, number>,
 *   loadProblem: (constructionId: string) => void,
 *   announce: (msg: string) => void,
 * }} sim
 */
export function initProblemLibrary(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const overlay = $('problem-library');
  const list = $('problem-library-list');
  const openBtn = $('btn-open-problems');
  const closeBtn = $('problem-library-close');

  const header = $('active-problem');
  const statement = $('active-problem-statement');
  const toggleBtn = $('active-problem-toggle');
  const hintBtn = $('active-problem-hint-btn');
  const hintsBox = $('active-problem-hints');
  const hintList = $('active-problem-hint-list');
  const status = $('active-problem-status');
  const exitBtn = $('exit-problem');

  const ready = overlay && list && header && statement;
  if (!ready) return { open: () => {}, exit: () => {}, isActive: () => false, sync: () => {}, dispose: () => ac.abort() };

  let activeProblemId = null;
  let revealedHints = 0;
  let solvedFired = false; // sim:complete trigger latch — first problem solved this page load only

  function activeProblem() { return PROBLEMS.find((p) => p.id === activeProblemId) ?? null; }

  // --- Full-viewport picker -------------------------------------------------
  function renderList() {
    list.innerHTML = '';
    for (const { tier, problems } of groupByTier(enabledProblems())) {
      const group = document.createElement('div');
      group.className = 'problem-group';
      const heading = document.createElement('h2');
      heading.className = 'problem-group__title';
      heading.textContent = tier.label;
      group.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'problem-grid';
      for (const problem of problems) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'problem-card';
        card.classList.toggle('is-active', activeProblemId === problem.id);
        const statementEl = document.createElement('span');
        statementEl.className = 'problem-card__statement';
        statementEl.textContent = problem.statement;
        card.appendChild(statementEl);
        card.addEventListener('click', () => selectProblem(problem.id), listen);
        grid.appendChild(card);
      }
      group.appendChild(grid);
      list.appendChild(group);
    }
  }

  function selectProblem(id) {
    const problem = PROBLEMS.find((p) => p.id === id);
    if (!problem) return;
    activeProblemId = id;
    revealedHints = 0;
    sim.loadProblem(problem.constructionId); // resets to the construction's OWN defaults, not the target
    close();
    renderActive();
    sim.announce(`Problem loaded: ${problem.statement} Dial the sliders to match, then check.`);
  }

  // --- Persistent active-problem header --------------------------------------
  function renderActive() {
    const problem = activeProblem();
    header.hidden = !problem;
    if (!problem) return;

    statement.textContent = problem.statement;

    const hasMoreHints = revealedHints < problem.hints.length;
    hintBtn.hidden = false;
    hintBtn.disabled = !hasMoreHints;
    hintBtn.textContent = hasMoreHints ? 'Need a hint?' : 'No more hints';

    hintList.innerHTML = '';
    for (let i = 0; i < revealedHints; i++) {
      const li = document.createElement('li');
      li.textContent = problem.hints[i];
      hintList.appendChild(li);
    }
    hintsBox.hidden = revealedHints === 0;

    const onConstruction = sim.getConstructionId() === problem.constructionId;
    const ok = onConstruction && matches(problem.target, problem.tolerance, sim.getParams());
    status.textContent = ok ? '✓ Matches the stated problem' : 'Not yet — keep adjusting the sliders';
    status.classList.toggle('match-status--ok', ok);
    if (ok && !solvedFired) { solvedFired = true; sim.reportComplete(); }
  }

  hintBtn?.addEventListener('click', () => {
    const problem = activeProblem();
    if (!problem || revealedHints >= problem.hints.length) return;
    revealedHints++;
    renderActive();
    sim.announce(problem.hints[revealedHints - 1]);
  }, listen);

  toggleBtn?.addEventListener('click', () => {
    const collapsed = header.classList.toggle('is-collapsed');
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.textContent = collapsed ? 'Show text' : 'Hide text';
  }, listen);

  function exitProblem() {
    activeProblemId = null;
    revealedHints = 0;
    renderActive();
    sim.announce('Problem exited. Your construction is unchanged.');
  }
  exitBtn?.addEventListener('click', exitProblem, listen);

  // --- Overlay open/close + focus trap ---------------------------------------
  let lastFocused = null;
  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll('button, [href], input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    trapFocus(e);
  }
  function open() {
    lastFocused = document.activeElement;
    renderList();
    overlay.hidden = false;
    closeBtn?.focus();
    document.addEventListener('keydown', onKeydown, listen);
  }
  function close() {
    overlay.hidden = true;
    document.removeEventListener('keydown', onKeydown);
    lastFocused?.focus?.();
  }

  openBtn?.addEventListener('click', open, listen);
  closeBtn?.addEventListener('click', close, listen);

  /** Re-render the live self-check status. main.js calls this after every rebuild. */
  function sync() {
    renderActive();
    if (!overlay.hidden) renderList();
  }

  renderActive();
  return { open, exit: exitProblem, isActive: () => activeProblemId !== null, sync, dispose: () => ac.abort() };
}
