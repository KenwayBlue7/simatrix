// UI manager — owns the parameter dock: the Step-1 solid picker and the Step-2 dimension fields.
//
// This is the Module-2 `uiManager.js` role (RULES.md §4.14): one module owns the dock's DOM, and no
// control ever touches the Three.js scene directly — every change is routed back through the
// injected controller, which funnels it into the single `rebuild()` pipeline (RULES.md §3.2). That
// discipline is what keeps a rapid slider drag from exhausting the WebGL context.
//
// The dimension fields are BUILT FROM DATA. `shapeData` declares which dimensions a solid has, so
// choosing a cylinder produces Diameter + Height and choosing a cuboid produces Length + Breadth +
// Height, with no per-solid UI code anywhere (ADR-043). That is also what makes the task brief's
// "architecture must allow adding more solids later" true rather than aspirational: a new solid ships
// its own controls.
//
// Every control here is a platform component used as-is — `.field__select` (DESIGN.md §5.3),
// `.field` slider + numeric pair (§5.2/§5.3). Nothing new is invented.
//
// Layering (CLAUDE.md): leaf module. Imports the solid DATA only; main.js injects `sim`.

import { SOLIDS, getSolid, resolveDims, axisSymbol } from './shapeData.js';
import { combinableSolids, tierLabel, MIN_PARTS, MAX_PARTS } from './combinationBuilder.js';
import { problemsByCategory } from './problemLibrary.js';
import { problemComboParts } from './problemBuilder.js';

/**
 * @param {{
 *   setSolid: (id: string) => void,
 *   setMode: (mode: 'single'|'combination'|'problem') => void,
 *   setComboPart: (index: number, id: string) => void,
 *   addComboPart: () => void,
 *   removeComboPart: (index: number) => void,
 *   setProblem: (id: string) => void,
 *   exitProblem: () => void,
 *   setDim: (key: string, value: number) => void,
 *   setDimSpecified: (key: string, on: boolean) => void,
 *   subject: () => object,
 *   problem: () => object|null,
 *   announce?: (msg: string) => void,
 * }} sim
 */
export function initUIManager(sim) {
  const $ = (id) => document.getElementById(id);

  const select = $('solid-select');
  const dimsHost = $('dim-fields');
  const blurbEl = $('solid-blurb');
  const summaryEl = $('dim-summary');

  const modeHost = $('subject-modes');
  const singleDock = $('single-dock');
  const comboDock = $('combo-dock');
  const comboHost = $('combo-parts');
  const comboAdd = $('combo-add');
  const comboBlurb = $('combo-blurb');

  // The Problem Library surface — Topic 3's, element for element: an entry in the card's eyebrow
  // row, a card above the stepper for the loaded problem, and a full-viewport browser overlay.
  const entryBtn = $('open-problem-library');
  const overlayEl = $('problem-library');
  const closeBtn = $('problem-library-close');
  const listEl = $('problem-library-list');

  const headerEl = $('active-problem');
  const statementEl = $('active-problem-statement');
  const limitationEl = $('active-problem-limitation');
  const hintsWrap = $('active-problem-hints');
  const hintList = $('active-problem-hint-list');
  const hintBtn = $('active-problem-hint-btn');
  const hideBtn = $('active-problem-hide-btn');
  const exitBtn = $('active-problem-exit-btn');
  const exitConfirm = $('active-problem-exit-confirm');
  const exitYes = $('active-problem-exit-yes');
  const exitNo = $('active-problem-exit-no');
  const statusEl = $('active-problem-status');

  /** How many of the current problem's hints the learner has asked for. Scaffolded, never dumped. */
  let hintsShown = 0;
  /** Whether the statement is collapsed. Survives a rebuild, resets with a new problem. */
  let statementHidden = false;

  /** Live field controls, keyed by dimension key, so `sync()` can push values without rebuilding. */
  const fields = new Map();

  // ---- Step 1: the solid picker -------------------------------------------------------------
  if (select) {
    select.innerHTML = '';
    for (const s of SOLIDS) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => sim.setSolid(select.value));
  }

  // ---- Step 1: single solid or combination ---------------------------------------------------
  // The platform segmented control, used exactly as Step 5's form toggle uses it: two buttons that
  // share a seam and cannot both be off, the live one carrying `aria-pressed` AND the accent fill.
  // Nothing new is invented, and the single-solid dock below it is untouched by the addition.
  modeHost?.querySelectorAll('.segmented__btn').forEach((btn) => {
    btn.addEventListener('click', () => sim.setMode(btn.dataset.mode));
  });
  comboAdd?.addEventListener('click', () => sim.addComboPart());

  /**
   * One row of the combination builder: which position it occupies, which solid sits there, and —
   * for anything above the base — the way to take it off again.
   *
   * The rows are ordered BOTTOM FIRST, the order the object is really built in and the order Phase C
   * constructs it in, so the list the learner edits reads the same way as the drawing they get.
   */
  function buildComboRow(part, index, total, locked = false) {
    const row = document.createElement('div');
    row.className = 'combo-row';

    const tier = document.createElement('span');
    tier.className = 'combo-row__tier';
    tier.textContent = tierLabel(index, total);
    tier.setAttribute('aria-hidden', 'true'); // the select's own label already says it in words

    const sel = document.createElement('select');
    sel.className = 'field__select combo-row__select';
    sel.id = `combo-part-${index}`;
    sel.setAttribute('aria-label', `${tierLabel(index, total)} solid, position ${index + 1} of ${total}`);
    for (const s of combinableSolids()) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    }
    sel.value = part.solidId;
    // A QUESTION names its own solids, so while one is loaded the rows READ the combination rather
    // than edit it — the same lock Topic 3 puts on its picker while a textbook problem is open.
    sel.disabled = locked;
    sel.addEventListener('change', () => sim.setComboPart(index, sel.value));

    row.append(tier, sel);

    // The base is what everything else stands on, so it is never removable — a combination with
    // nothing under it is not a combination. Below the minimum, removal is closed for the same reason.
    if (!locked && index > 0 && total > MIN_PARTS) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn--ghost combo-row__remove';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove the ${getSolid(part.solidId).name} from the combination`);
      remove.addEventListener('click', () => sim.removeComboPart(index));
      row.appendChild(remove);
    }
    return row;
  }

  /**
   * Repaint the builder and the mode toggle from state.
   *
   * WHILE A PROBLEM IS LOADED the two controls are LOCKED rather than replaced: the question names
   * its own solids, so Step 1 reads them instead of offering them. This is Topic 3's behaviour —
   * its picker is disabled for the duration of a textbook problem — and it is why the Problem
   * Library needed no third tab. The docks themselves are untouched; only `disabled` changes.
   */
  function renderCombination(state) {
    const problem = sim.problem?.();
    const locked = Boolean(problem);
    // A problem is shown through whichever dock matches its own shape.
    const parts = locked ? problemComboParts(problem) : (state.combo ?? []);
    const combination = locked ? parts.length > 1 : state.mode === 'combination';

    modeHost?.querySelectorAll('.segmented__btn').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === (combination ? 'combination' : 'single')));
      btn.disabled = locked;
    });
    if (singleDock) singleDock.hidden = combination;
    if (comboDock) comboDock.hidden = !combination;
    if (select) select.disabled = locked;
    if (!combination || !comboHost) return;

    comboHost.replaceChildren();
    parts.forEach((part, i) => comboHost.appendChild(buildComboRow(part, i, parts.length, locked)));
    if (comboAdd) {
      comboAdd.hidden = locked;
      comboAdd.disabled = parts.length >= MAX_PARTS;
      comboAdd.textContent = parts.length >= MAX_PARTS
        ? `Four solids is the most this drawing holds`
        : '+ Add solid';
    }
  }

  // ---- The Problem Library ---------------------------------------------------------------------
  //
  // TOPIC 3'S SURFACE, ADOPTED WHOLE. The entry is the platform `.library-entry` in the card's
  // eyebrow row, the browser is the platform `.problem-library` overlay, and the loaded problem
  // sits in a paper card above the stepper. None of it is invented here and none of it is a new
  // component — the two topics are meant to be indistinguishable at this surface.
  //
  // Nothing in this section knows what any individual problem IS. The list, the categories, the
  // statements, the hints and the difficulty all come from data (ADR-053).

  /** Small element factory, so the list below reads as structure rather than as DOM plumbing. */
  const el = (tag, cls) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    return node;
  };

  /**
   * The whole library, grouped by category. No search, no filters, no result count — the list is
   * short enough to read, and the grouping IS the navigation (ADR-057).
   */
  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren();
    for (const { category, problems } of problemsByCategory()) {
      const section = el('section', 'problem-group');
      const title = el('h2', 'problem-group__title');
      title.textContent = category.label;
      section.appendChild(title);
      if (category.blurb) {
        const blurb = el('p', 'problem-group__blurb');
        blurb.textContent = category.blurb;
        section.appendChild(blurb);
      }
      const grid = el('div', 'problem-grid');
      for (const problem of problems) {
        const card = el('button', 'problem-card');
        card.type = 'button';
        card.dataset.problemId = problem.id;

        // Title · description · difficulty, and nothing else. The description is the QUESTION, not
        // a paraphrase — a learner should recognise the problem they want by its own words.
        const t = el('span', 'problem-card__title');
        t.textContent = problem.title;
        const hint = el('span', 'problem-card__hint');
        hint.textContent = problem.question;
        card.append(t, hint);

        if (problem.difficulty) {
          const level = el('span', 'problem-card__difficulty');
          level.textContent = problem.difficulty;
          card.appendChild(level);
        }
        grid.appendChild(card);
      }
      section.appendChild(grid);
      listEl.appendChild(section);
    }
  }

  /**
   * The overlay is a SELECTOR, not a second application. Opening pauses the rAF loop (it covers the
   * live viewport) and nothing else — the camera, the current step, the dimensions and the whole
   * scene graph are exactly as they were when it closes again.
   */
  function openBrowser() {
    if (!overlayEl) return;
    renderList();
    overlayEl.hidden = false;
    window.simAPI?.pause();
    closeBtn?.focus();
  }

  function closeBrowser() {
    if (!overlayEl || overlayEl.hidden) return;
    overlayEl.hidden = true;
    window.simAPI?.resume();
    entryBtn?.focus();
  }

  /** Focus trap + Escape, scoped to the overlay (harmless while it is hidden). */
  function onOverlayKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeBrowser(); return; }
    if (e.key !== 'Tab') return;
    const f = [...overlayEl.querySelectorAll('button, input')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  entryBtn?.addEventListener('click', openBrowser);
  closeBtn?.addEventListener('click', closeBrowser);
  overlayEl?.addEventListener('keydown', onOverlayKeydown);
  listEl?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-problem-id]');
    if (!card) return;
    sim.setProblem(card.dataset.problemId);
    closeBrowser();
  });

  // ---- The loaded problem ----------------------------------------------------------------------

  /** The problem the card currently belongs to, so a new one starts its hints and its text over. */
  let shownProblemId = null;

  /**
   * The card sits ABOVE the stepper and becomes the context for the lesson. It appears only while a
   * problem is loaded; in free practice it stays out and the column below it is the ordinary
   * Topic 2 wizard, unchanged.
   */
  function renderProblem() {
    const problem = sim.problem?.();
    if (!headerEl) return;
    if (!problem) {
      headerEl.hidden = true;
      shownProblemId = null;
      return;
    }
    headerEl.hidden = false;
    // A fresh subject re-arms the exit confirm closed — without focusing, since a render is not a
    // click (`armExit` focuses; this must not steal focus on every rebuild).
    if (exitBtn) exitBtn.hidden = false;
    if (exitConfirm) exitConfirm.hidden = true;
    // VERBATIM, as printed — `textContent`, so nothing can reformat it.
    if (statementEl) statementEl.textContent = problem.question;
    // What the question asks for that this topic does not draw. Two problems carry one, and it is
    // shown rather than hidden: a learner comparing this against the paper must not have to guess.
    if (limitationEl) {
      limitationEl.hidden = !problem.limitation;
      limitationEl.textContent = problem.limitation ?? '';
    }
    if (problem.id !== shownProblemId) {
      shownProblemId = problem.id;
      statementHidden = false;
      resetHints(problem);
    }
    syncStatementVisibility();
  }

  /**
   * Hide Text collapses the STATEMENT only — the label and the controls stay, so the card never
   * vanishes out from under the button that operates it. Hiding it also folds any revealed hints
   * away: they are the statement's scaffolding, and leaving them showing over a hidden question
   * reads as the answer with the question torn off.
   */
  function syncStatementVisibility() {
    if (statementEl) statementEl.hidden = statementHidden;
    if (limitationEl && statementHidden) limitationEl.hidden = true;
    if (hintsWrap && statementHidden) hintsWrap.hidden = true;
    if (hideBtn) {
      hideBtn.textContent = statementHidden ? 'Show Text' : 'Hide Text';
      hideBtn.setAttribute('aria-expanded', String(!statementHidden));
    }
  }

  hideBtn?.addEventListener('click', () => {
    statementHidden = !statementHidden;
    syncStatementVisibility();
    sim.announce?.(statementHidden ? 'Problem text hidden.' : 'Problem text shown.');
  });

  /**
   * Leaving a problem discards the work done in it, so it asks first — the two-state confirm the
   * Reset control uses (RULES.md §4.19). Arming swaps the button for a "Leave this problem?" prompt;
   * only "Yes" exits.
   */
  function armExit(on) {
    if (exitBtn) exitBtn.hidden = on;
    if (exitConfirm) exitConfirm.hidden = !on;
    (on ? exitYes : exitBtn)?.focus();
  }
  exitBtn?.addEventListener('click', () => armExit(true));
  exitNo?.addEventListener('click', () => armExit(false));
  exitYes?.addEventListener('click', () => { armExit(false); sim.exitProblem(); });

  function resetHints(problem) {
    hintsShown = 0;
    if (hintList) hintList.replaceChildren();
    if (hintsWrap) hintsWrap.hidden = true;
    if (!hintBtn) return;
    hintBtn.hidden = (problem?.hints?.length ?? 0) === 0;
    hintBtn.textContent = 'Need a hint?';
  }

  /** Reveal one step at a time — the reasoning is scaffolded, never dumped. */
  function revealNextHint() {
    const hints = sim.problem?.()?.hints ?? [];
    if (hintsShown >= hints.length) {
      if (!hintsWrap || !hintBtn) return;
      const collapse = !hintsWrap.hidden;
      hintsWrap.hidden = collapse;
      hintBtn.textContent = collapse ? 'Show hints' : 'Hide hints';
      return;
    }
    if (hintsWrap) hintsWrap.hidden = false;
    const li = el('li');
    li.textContent = hints[hintsShown];
    hintList?.appendChild(li);
    hintsShown += 1;
    sim.announce?.(`Hint ${hintsShown} of ${hints.length}. ${hints[hintsShown - 1]}`);
    hintBtn.textContent = hintsShown >= hints.length
      ? 'Hide hints'
      : `Show next hint (${hintsShown + 1} of ${hints.length})`;
  }

  hintBtn?.addEventListener('click', revealNextHint);

  // ---- The live self-check ----------------------------------------------------------------------

  const CHECK_SVG =
    '<svg class="match-status__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
    + '<path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /** The last status announced, so a drag that keeps the same verdict does not keep saying it. */
  let lastAnnounced = null;

  /**
   * Paint what the validator returned. `main.js` calls this whenever the state the check depends on
   * changes — a dimension, the subject, the form, a phase, a stage — and never on a timer.
   *
   * Success is the ONE place colour is spent in this card, and it is spent with two cues (the green
   * wash AND the check glyph). A mismatch is never red: it names what is still to match.
   *
   * @param {{status:'pass'|'pending'|'fail', text:string}|null} result  null in free practice.
   */
  function renderCheck(result) {
    if (!statusEl) return;
    if (!result) {
      statusEl.hidden = true;
      statusEl.replaceChildren();
      lastAnnounced = null;
      return;
    }
    const ok = result.status === 'pass';
    statusEl.hidden = false;
    statusEl.classList.toggle('match-status--ok', ok);
    // Built as nodes rather than markup: the text is data, and the glyph is the only element.
    statusEl.replaceChildren();
    if (ok) {
      const icon = document.createElement('span');
      icon.innerHTML = CHECK_SVG;
      statusEl.appendChild(icon.firstChild);
    }
    const text = document.createElement('span');
    text.textContent = result.text;
    statusEl.appendChild(text);

    // The line is its own live region, so the reader already gets it; the announcement is only for
    // the moment it FLIPS to matched, which is the payoff worth interrupting for.
    if (ok && lastAnnounced !== 'pass') {
      sim.announce?.('Your construction matches the problem.');
    }
    lastAnnounced = result.status;
  }

  // ---- Step 2: the dimension fields ----------------------------------------------------------

  /**
   * Build one slider + numeric-input pair. The two are two-way bound: dragging updates the number,
   * typing updates the slider, and an invalid entry quietly reverts to the last valid value rather
   * than turning alarming red (DESIGN.md §5.3).
   */
  function buildField(spec, value, { unspecified = false, autoValue = null } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const id = `dim-${spec.key}`;
    const label = document.createElement('label');
    label.className = 'field__label';
    label.setAttribute('for', id);
    // Engineering notation first, the plain-English name after it — the notation is what the
    // drawing, the transfer tokens and the comparison table all use, so it leads here too.
    const sym = document.createElement('span');
    sym.className = 'field__symbol';
    sym.textContent = spec.symbol;
    sym.setAttribute('aria-hidden', 'true');   // the name beside it already says it in words
    const name = document.createElement('span');
    name.className = 'field__name';
    name.textContent = spec.label;
    label.append(sym, name);
    wrap.appendChild(label);

    // ---- An optional dimension: the learner may declare it UNSPECIFIED ------------------------
    // Nothing here knows which solid this is; the field declared itself optional (ADR-043).
    if (spec.optional) {
      const opt = document.createElement('div');
      opt.className = 'field__optional';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'field__check';
      box.id = `${id}-specify`;
      box.checked = !unspecified;
      const optLabel = document.createElement('label');
      optLabel.className = 'field__check-label';
      optLabel.setAttribute('for', box.id);
      optLabel.textContent = `Specify ${spec.label}`;
      opt.append(box, optLabel);
      wrap.appendChild(opt);
      box.addEventListener('change', () => sim.setDimSpecified(spec.key, box.checked));

      if (unspecified) {
        // No slider: the value is not the learner's to set. The drawing still needs A number, so
        // the sim uses a demonstration value and says so plainly.
        const auto = document.createElement('p');
        auto.className = 'field__auto';
        auto.textContent = spec.autoLabel ?? 'Auto / Unknown';
        wrap.appendChild(auto);
        if (autoValue != null) {
          const shown = document.createElement('p');
          shown.className = 'field__auto-value';
          shown.textContent = `Drawn at ${autoValue} ${spec.unit} for the demonstration.`;
          wrap.appendChild(shown);
        }
        if (spec.autoNote) {
          const note = document.createElement('p');
          note.className = 'dock__note field__auto-note';
          note.textContent = spec.autoNote;
          wrap.appendChild(note);
        }
        return wrap;
      }
    }

    const row = document.createElement('div');
    row.className = 'field__row';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'field__range';
    range.id = id;
    range.min = String(spec.min);
    range.max = String(spec.max);
    range.step = String(spec.step);
    range.value = String(value);
    range.setAttribute('aria-valuetext', `${value} ${spec.unit}`);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'field__num';
    num.min = String(spec.min);
    num.max = String(spec.max);
    num.step = String(spec.step);
    num.value = String(value);
    num.setAttribute('aria-label', `${spec.label} in millimetres`);

    const unit = document.createElement('span');
    unit.className = 'field__unit';
    unit.textContent = spec.unit;

    row.append(range, num, unit);
    wrap.appendChild(row);

    const clamp = (v) => Math.min(Math.max(v, spec.min), spec.max);

    const commit = (raw, { fromText = false } = {}) => {
      const parsed = Number(String(raw).replace(',', '.')); // tolerate a decimal comma
      if (!Number.isFinite(parsed)) {           // invalid text: revert, never scold
        num.value = range.value;
        return;
      }
      const v = clamp(Math.round(parsed / spec.step) * spec.step);
      range.value = String(v);
      num.value = String(v);
      range.setAttribute('aria-valuetext', `${v} ${spec.unit}`);
      sim.setDim(spec.key, v);
      if (fromText && v !== parsed) {
        sim.announce?.(`${spec.label} kept at ${v} ${spec.unit}, the nearest allowed value.`);
      }
    };

    range.addEventListener('input', () => commit(range.value));
    num.addEventListener('change', () => commit(num.value, { fromText: true }));

    fields.set(spec.key, { range, num, spec });
    return wrap;
  }

  /**
   * Rebuild the dock for a solid. Called whenever the selected solid changes — the field SET is
   * per-solid, so it must be re-created, not merely re-valued.
   */
  function render(state) {
    const solid = sim.subject();
    if (select && !solid.isCombination && select.value !== solid.id) select.value = solid.id;
    if (blurbEl && !solid.isCombination) blurbEl.textContent = solid.blurb;
    if (comboBlurb && solid.isCombination && state.mode === 'combination') comboBlurb.textContent = solid.blurb;
    renderCombination(state);
    renderProblem();

    fields.clear();
    if (dimsHost) {
      dimsHost.innerHTML = '';
      // A combination's fields are grouped under the component they belong to — two cones in one
      // object both declare a diameter, and a dock that listed them flat would give the learner two
      // identical labels. A single solid declares no group, so its fields are emitted exactly as
      // before, with no wrapper and no heading.
      let group = null;
      let groupKey = null;
      for (const spec of solid.dims) {
        const unspecified = Boolean(state.unspecified?.[spec.key]);
        const autoValue = unspecified && typeof spec.auto === 'function'
          ? Math.round(spec.auto(state.dims) * 10) / 10
          : null;
        const field = buildField(spec, state.dims[spec.key], { unspecified, autoValue });
        if (!spec.part) { dimsHost.appendChild(field); continue; }
        const key = `${spec.partIndex}:${spec.part}`;
        if (key !== groupKey) {
          groupKey = key;
          group = document.createElement('div');
          group.className = 'field-group';
          const title = document.createElement('h4');
          title.className = 'dock__group-title';
          title.textContent = spec.part;
          group.appendChild(title);
          dimsHost.appendChild(group);
        }
        group.appendChild(field);
      }
    }
    syncSummary(state);
  }

  /**
   * Push current values into existing controls without rebuilding them (used after a reset, and
   * whenever the scene changes a value the dock did not originate).
   */
  function sync(state) {
    for (const [key, f] of fields) {
      const v = state.dims[key];
      if (v == null) continue;
      f.range.value = String(v);
      f.num.value = String(v);
      f.range.setAttribute('aria-valuetext', `${v} ${f.spec.unit}`);
    }
    syncSummary(state);
  }

  /**
   * The live overall-size readout. It exists because Step 4 Phase B transfers exactly these three
   * numbers onto the three axes — seeing them here first is what makes that transfer legible rather
   * than magical. Real values in real units (PRODUCT.md principle 4), set in the tabular mono face.
   */
  function syncSummary(state) {
    if (!summaryEl) return;
    const solid = sim.subject();
    const b = solid.bounds(resolveDims(solid, state.dims, state.unspecified));
    const fmt = (v) => `${Math.round(v * 10) / 10}`;
    summaryEl.innerHTML = '';
    // Named by the SAME symbol Phase B writes against that box edge, so the readout and the
    // drawing are one notation rather than two vocabularies.
    const rows = [
      [`Overall width · ${axisSymbol(solid, 'width')}`, fmt(b.width)],
      [`Overall depth · ${axisSymbol(solid, 'depth')}`, fmt(b.depth)],
      [`Overall height · ${axisSymbol(solid, 'height')}`, fmt(b.height)],
    ];
    for (const [name, value] of rows) {
      const row = document.createElement('div');
      row.className = 'bounds-row';
      const n = document.createElement('span');
      n.className = 'bounds-row__name';
      n.textContent = name;
      const v = document.createElement('span');
      v.className = 'bounds-row__value';
      v.textContent = `${value} mm`;
      row.append(n, v);
      summaryEl.appendChild(row);
    }
  }

  return {
    render,
    sync,
    renderCheck,
    openBrowser,
    closeBrowser,
    isBrowserOpen: () => Boolean(overlayEl) && !overlayEl.hidden,
  };
}
