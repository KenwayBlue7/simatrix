// Guided stepper + dock controls (Module 1 Topic 1.1 — Dimensioning).
//
// The wizard shell: it sequences the six steps, paints every step's controls from the pure
// data catalogues, gates each step behind the previous one's key interactions, and narrates
// state to assistive tech. It owns NOTHING in the 3-D scene — main.js injects a narrow
// `sim` controller and this module only calls through it (ADR-007 star rule /
// RULES.md §3.6).
//
// Layering: leaf module. It imports the topic's PURE DATA catalogues (ADR-133) and no
// behavioural sibling — not the rig, not the label layer, not main.js. The one exception is
// `fitDecision` from dimensionDraw: it is a pure function of a number, not a renderer, and
// it exists so the control and the drawing can never disagree about which termination the
// available space allows.
//
// PROGRESSIVE DISCLOSURE (PRODUCT.md): one idea per step, and nothing painted until the step
// that needs it. Step 1's element inspector does not exist until the dimensions are on the
// drawing; Step 5's variant chips do not exist until a symbol is chosen.
//
// WHERE THE WEIGHT SITS. Step 1 owns everything about how a dimension is DRAWN — its parts,
// its line weights, its terminations, its leader heads. Step 2 owns the RULES about where
// those parts may go. That split is §4.1's own, it keeps either step from carrying three
// unrelated control clusters, and it puts the termination controls in the step that names
// the termination as one of the five elements.

import {
  STEPS, BIS_CHECKLIST, CLASSWORK_SYSTEM, LINE_TYPES, SHEET_SETTINGS, METHODS, METHOD_CHOICE,
} from './dimensionSteps.js';
import {
  ELEMENTS, ARRANGEMENTS, METHOD_SHOWING_LAYOUTS, COORDINATE_TABLE,
} from './dimensionExamples.js';
import { RULES, TERMINATIONS, LEADER_HEADS } from './dimensionRules.js';
import { SYMBOLS, BIS_SYMBOL_IDS } from './dimensionSymbols.js';
import { REVIEW_FIGURES, reviewFigure } from './reviewFigures.js';
import { fitDecision } from './dimensionDraw.js';

const TOTAL = STEPS.length;

/**
 * How much of each step counts as "worked through": it drives the rail's ✓ marks, the
 * closing summary card and the footer's remaining-work hint. It does NOT gate Next — the
 * learner can always move on (see `renderNav`).
 */
const GATE = Object.freeze({
  elements: 4,        // of 6 elements inspected
  rules: 5,           // of 10 rule cards switched to their second drawing
  methods: 2,         // both methods
  arrangements: 5,    // of 6 arrangements
  bisSymbols: BIS_SYMBOL_IDS.length, // all five shape symbols
});

/**
 * @param {object} sim The narrow controller main.js injects.
 * @returns {{
 *   sync: () => void,
 *   reset: () => void,
 *   reportPlacement: (res: { ok: boolean, rule?: string, message: string }) => void,
 *   dispose: () => void,
 * }}
 */
export function initUI(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);
  const on = (el, type, fn) => el?.addEventListener(type, fn, listen);

  /** Paint one <button class="chip"> into a container. */
  function chip(host, { key, value, glyph, label, onPick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset[key] = value;
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = glyph
      ? `<span class="chip__glyph" aria-hidden="true">${glyph}</span><span>${label}</span>`
      : `<span>${label}</span>`;
    on(b, 'click', onPick);
    host.appendChild(b);
    return b;
  }

  /** Paint one <button class="opt"> (a full-width option row) into a container. */
  function opt(host, { key, value, label, ref, onPick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.dataset[key] = value;
    b.innerHTML = `<span>${label}</span><span class="opt__ref">${ref}</span>`;
    on(b, 'click', onPick);
    host.appendChild(b);
    return b;
  }

  /**
   * The module's ONE collapsing picker, shared by Step 2's rules and Step 4's layouts.
   *
   * Both steps ask the same kind of question — "which of these do you want to look at?" — and
   * both had grown past the point where an open list was readable: ten rules and six layouts
   * filled the panel and pushed the verdict that answers the question below the fold. Collapsed,
   * the step shows the one thing currently selected and the drawing keeps the learner's eye.
   *
   * Keyboard: the trigger opens on Enter, Space or ↓; inside the list ↑/↓/Home/End move the
   * cursor, Enter or Space picks, Escape closes and returns focus to the trigger, and Tab or a
   * click outside closes it. `aria-activedescendant` carries the cursor, so the trigger keeps
   * real focus the whole time and screen readers announce each option as it is reached.
   *
   * @param {HTMLElement} host
   * @param {Object} config
   * @param {string} config.id          Prefix for the generated element ids.
   * @param {string} config.label       Accessible name for the listbox.
   * @param {{value: string, label: string, ref?: string}[]} config.items
   * @param {(value: string) => void} config.onPick
   * @returns {{ setValue: (v: string) => void, setItems: (items: object[]) => void, close: () => void }}
   */
  function createSelect(host, { id, label, items, onPick }) {
    host.className = 'select';
    host.innerHTML = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'select__btn';
    btn.id = `${id}-btn`;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', `${id}-list`);
    btn.innerHTML = `<span class="select__value"></span>
      <svg class="select__caret" width="14" height="14" viewBox="0 0 14 14" fill="none"
           stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"
           aria-hidden="true"><path d="M3 5.5 7 9.5 11 5.5" /></svg>`;
    const valueEl = btn.querySelector('.select__value');

    const list = document.createElement('div');
    list.className = 'select__list';
    list.id = `${id}-list`;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label);
    list.hidden = true;

    let options = [];

    /**
     * (Re)paint the option list. The TRIGGER is never replaced, so a list that changes while
     * the learner is using it — Step 4's "compare with", which drops whichever layout is
     * currently on the main drawing — never steals their focus.
     */
    function setItems(next) {
      items = next;
      list.innerHTML = '';
      options = items.map((item, i) => {
        const o = document.createElement('button');
        o.type = 'button';
        o.className = 'select__opt';
        o.id = `${id}-opt-${i}`;
        o.tabIndex = -1;
        o.setAttribute('role', 'option');
        o.setAttribute('aria-selected', String(item.value === value));
        o.dataset.value = item.value;
        o.innerHTML = item.ref
          ? `<span>${item.label}</span><span class="opt__ref">${item.ref}</span>`
          : `<span>${item.label}</span>`;
        on(o, 'click', () => { pick(item.value); });
        list.appendChild(o);
        return o;
      });
      cursor = Math.max(0, items.findIndex((x) => x.value === value));
    }

    host.append(btn, list);

    let open = false;
    let cursor = 0;
    let value = items[0]?.value ?? null;

    const moveCursor = (i) => {
      cursor = Math.min(Math.max(i, 0), options.length - 1);
      options.forEach((o, k) => o.classList.toggle('is-cursor', k === cursor));
      btn.setAttribute('aria-activedescendant', options[cursor]?.id ?? '');
      options[cursor]?.scrollIntoView({ block: 'nearest' });
    };

    function setOpen(next) {
      if (open === next) return;
      open = next;
      list.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      if (open) moveCursor(Math.max(0, items.findIndex((x) => x.value === value)));
      else btn.removeAttribute('aria-activedescendant');
    }

    function pick(v) {
      setOpen(false);
      btn.focus();
      if (v === value) return;
      setValue(v);
      onPick(v);
    }

    function setValue(v) {
      const item = items.find((x) => x.value === v) ?? items[0];
      value = item ? item.value : null;
      valueEl.textContent = item ? item.label : '';
      options.forEach((o) => o.setAttribute('aria-selected', String(o.dataset.value === value)));
    }

    on(btn, 'click', () => setOpen(!open));
    on(btn, 'keydown', (e) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); setOpen(true);
        }
        return;
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); moveCursor(cursor + 1); break;
        case 'ArrowUp': e.preventDefault(); moveCursor(cursor - 1); break;
        case 'Home': e.preventDefault(); moveCursor(0); break;
        case 'End': e.preventDefault(); moveCursor(options.length - 1); break;
        case 'Enter':
        case ' ': e.preventDefault(); pick(items[cursor].value); break;
        case 'Escape': e.preventDefault(); setOpen(false); break;
        case 'Tab': setOpen(false); break;
        default: break;
      }
    });
    // A click anywhere else is a dismissal, and so is scrolling the panel away under it.
    on(document, 'pointerdown', (e) => { if (open && !host.contains(e.target)) setOpen(false); });

    setItems(items);
    setValue(value);
    return { setValue, setItems, close: () => setOpen(false) };
  }

  /**
   * The module's ONE two-state control, used for the before/after compare in Steps 4 and 6 and
   * for Step 3's eight-directions study. The label is fixed; the switch carries the state. A
   * button that rewrites its own text on press forces the learner to re-read it to work out
   * what just happened, and the compare in particular has to look the same wherever it appears.
   *
   * @param {HTMLElement} host
   * @param {{ label: string, note?: string, onToggle: (on: boolean) => void }} config
   * @returns {{ set: (on: boolean, opts?: { disabled?: boolean, note?: string }) => void }}
   */
  function createToggle(host, { label, note = '', onToggle }) {
    host.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toggle';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = `<span class="toggle__label">${label}<span class="toggle__note"></span></span>
      <span class="toggle__switch" aria-hidden="true"></span>`;
    const noteEl = b.querySelector('.toggle__note');
    noteEl.textContent = note;
    on(b, 'click', () => { if (!b.disabled) onToggle(b.getAttribute('aria-pressed') !== 'true'); });
    host.appendChild(b);
    return {
      set(onState, { disabled = false, note: n } = {}) {
        b.setAttribute('aria-pressed', String(onState));
        b.disabled = disabled;
        if (n !== undefined) noteEl.textContent = n;
      },
    };
  }

  /** Latch exactly one child of `host` by its dataset value. */
  function latch(host, key, value) {
    for (const b of host?.children ?? []) {
      const active = b.dataset[key] === String(value);
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    }
  }

  // --- DOM ------------------------------------------------------------------
  const card = $('step-card');
  const scrollRegion = card?.querySelector('.card__scroll');
  const railItems = [...document.querySelectorAll('#step-rail .rail__item')];
  const panels = [...document.querySelectorAll('.step-panel')];
  const elCurrent = $('step-current');
  const elTotal = $('step-total');
  const elTitle = $('step-title');
  const elLead = $('step-lead');
  const elBody = $('step-body');
  const elPostBody = $('step-post-body');
  const elSummary = $('step-summary');

  const btnBack = $('btn-back');
  const btnNext = $('btn-next');
  const btnReset = $('btn-reset');

  if (elTotal) elTotal.textContent = String(TOTAL);

  // --- Wizard state ---------------------------------------------------------
  let currentStep = 1;
  const state = {
    dimensionsAdded: false,
    elementsSeen: new Set(),
    lineType: null,
    termination: 'open',
    terminationAngle: 15,
    leaderHead: null,
    leaderHeadsSeen: new Set(),
    spaceMm: 60,
    study: 'anatomy',

    ruleId: RULES[0].id,
    ruleVariant: 'ok',
    rulesExplored: new Set(),

    method: 1,
    methodsSeen: new Set([1]),
    angularStyle: 'a',
    oblique: false,

    arrangementId: ARRANGEMENTS[0].id,
    arrangementVariant: null,
    /**
     * What is held BESIDE the current drawing: its own layout AND its own method. Any layout,
     * INCLUDING the one already on screen — "same layout, other method" is the comparison that
     * shows the two methods apart, and excluding it would make that impossible to ask for. The
     * one pair that is forbidden is same layout AND same method, because that is two identical
     * sheets; `keepPairDistinct()` moves whichever axis the learner did not just touch.
     *
     * It OPENS on a layout comparison, in one method, exactly as it did before the method axis
     * existed. Opening on a method pair instead would be the wrong first impression: four of the
     * six layouts measure only across the part, and the two methods draw a horizontal value
     * identically, so the compare would open on two indistinguishable sheets.
     */
    compareId: ARRANGEMENTS[1].id,
    compareMethodId: 1,
    arrangementsSeen: new Set([ARRANGEMENTS[0].id]),
    compare: false,

    symbolId: null,
    symbolVariant: null,
    symbolsSeen: new Set(),

    // Step 6 IS the worked examples. The lecturers' review of 2026-08-16 removed the
    // twelve-fault hunt that used to share the step with them.
    exampleId: REVIEW_FIGURES[0].id,
    examplesSeen: new Set([REVIEW_FIGURES[0].id]),
    sheetScale: '1:1',
    sheetUnits: 'mm',
    completed: false,
  };

  /** Whether step i counts as complete (drives the rail checks and Next gating). */
  function isComplete(i) {
    switch (i) {
      case 1: return state.dimensionsAdded && state.elementsSeen.size >= GATE.elements;
      case 2: return state.rulesExplored.size >= GATE.rules;
      case 3: return state.methodsSeen.size >= GATE.methods;
      case 4: return state.arrangementsSeen.size >= GATE.arrangements;
      case 5: return BIS_SYMBOL_IDS.every((id) => state.symbolsSeen.has(id));
      // All four of the chapter's wrong/correct pairs read. Reading them IS the review — there
      // is nothing here to get right or wrong, and this does not block Next; it drives the
      // rail's ✓ and the closing summary only.
      case 6: return state.examplesSeen.size >= REVIEW_FIGURES.length;
      default: return false;
    }
  }
  /**
   * The furthest step the learner has reached. Next is never blocked, so the rail unlocks
   * behind them rather than only where a step is finished — a learner who skipped ahead must
   * still be able to come back to where they were.
   */
  let maxReached = 1;
  /** False until Step 1 has been entered once, so the opening isometric survives boot. */
  let booted = false;
  /**
   * What is left in this step, short enough to sit on the footer's one row beside the buttons.
   * It is a NUDGE, not a barrier: Next is never disabled, so this says what the learner has
   * not looked at yet, and they decide whether to. The full sentence goes on the button's own
   * tooltip and to assistive tech, where there is room for it.
   */
  function gateHint(i) {
    if (i === 1 && !state.dimensionsAdded) return 'Add the sizes';
    const left = {
      1: GATE.elements - state.elementsSeen.size,
      2: GATE.rules - state.rulesExplored.size,
      3: GATE.methods - state.methodsSeen.size,
      4: GATE.arrangements - state.arrangementsSeen.size,
      5: BIS_SYMBOL_IDS.filter((id) => !state.symbolsSeen.has(id)).length,
      // No entry for 6: renderNav suppresses the gate on the LAST step, where there is no
      // Next to nudge towards. What is left of the review is said by the closing summary and
      // by the "How to review" control, which shows both halves whichever one is open.
    }[i];
    return left > 0 ? `${left} left` : '';
  }

  /** The same thing said in full, for the Next button's tooltip and for screen readers. */
  function gateHintLong(i) {
    switch (i) {
      case 1: return state.dimensionsAdded
        ? `You have looked at ${state.elementsSeen.size} of the ${GATE.elements} parts this step covers.`
        : 'Add the dimensions to see what a dimension is made of.';
      case 2: return `You have flipped ${state.rulesExplored.size} of ${GATE.rules} rules to see what breaks.`;
      case 3: return 'Try both ways of writing the values before moving on.';
      case 4: return `You have tried ${state.arrangementsSeen.size} of ${GATE.arrangements} layouts.`;
      case 5: return 'All five shape symbols are worth a look before moving on.';
      default: return '';
    }
  }

  // ==========================================================================
  // Step 1 — the elements, the line alphabet, terminations, leader heads
  // ==========================================================================
  const btnAddDims = $('btn-add-dims');
  const doneAdd = $('done-add');
  const elementGroup = $('element-group');
  const elementChips = $('element-chips');
  const elementDetail = $('element-detail');
  const lineTypeList = $('linetype-list');
  const lineTypeDetail = $('linetype-detail');
  const termChips = $('term-chips');
  const termDetail = $('term-detail');
  const termAngle = $('termangle-range');
  const termAngleOut = $('termangle-out');
  const spaceRange = $('space-range');
  const spaceOut = $('space-out');
  const spaceDetail = $('space-detail');
  const leaderChips = $('leader-chips');
  const leaderDetail = $('leader-detail');
  let pinnedElement = null;

  /** Switch which of Step 1's studies the viewport is showing. */
  function setStudy(name) {
    if (state.study === name) return;
    state.study = name;
    sim.setStudy(name);
  }

  function paintStep1() {
    if (elementChips && !elementChips.childElementCount) {
      for (const el of ELEMENTS) {
        const b = chip(elementChips, {
          key: 'el', value: el.id, label: el.name,
          onPick: () => {
            pinnedElement = pinnedElement === el.id ? null : el.id;
            showElement(pinnedElement ?? el.id, true);
          },
        });
        const enter = () => { if (!pinnedElement) showElement(el.id, false); };
        const leave = () => { if (!pinnedElement) showElement(null, false); };
        on(b, 'pointerenter', enter);
        on(b, 'pointerleave', leave);
        on(b, 'focus', enter);
        on(b, 'blur', leave);
      }
    }
    if (lineTypeList && !lineTypeList.childElementCount) {
      for (const lt of LINE_TYPES) {
        opt(lineTypeList, {
          key: 'lt', value: lt.id, label: lt.name, ref: lt.type,
          onPick: () => selectLineType(lt.id),
        });
      }
    }
    if (termChips && !termChips.childElementCount) {
      for (const t of TERMINATIONS) {
        chip(termChips, {
          key: 'term', value: t.id, glyph: t.glyph, label: t.name,
          onPick: () => selectTermination(t.id),
        });
      }
    }
    if (leaderChips && !leaderChips.childElementCount) {
      for (const h of LEADER_HEADS) {
        chip(leaderChips, {
          key: 'lh', value: h.id, label: h.name,
          onPick: () => selectLeaderHead(h.id),
        });
      }
    }
  }

  /** Isolate one element on the drawing and explain it. `pin` latches it for touch users. */
  function showElement(id, pin) {
    setStudy('anatomy');
    sim.focusElement(id);
    if (id) state.elementsSeen.add(id);
    for (const b of elementChips?.children ?? []) {
      const active = b.dataset.el === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(pin && active));
    }
    const entry = ELEMENTS.find((e) => e.id === id);
    if (elementDetail) {
      elementDetail.innerHTML = entry
        ? `<h3>${entry.name}</h3><p class="detail__meta">${entry.type}</p><p>${entry.blurb}</p>`
        : 'Point at an element to isolate it on the drawing.';
    }
    if (entry) sim.announce(`${entry.name}. ${entry.type}. ${entry.blurb}`);
    sync();
  }

  function selectLineType(id) {
    state.lineType = state.lineType === id ? null : id;
    setStudy('anatomy');
    latch(lineTypeList, 'lt', state.lineType);
    const lt = LINE_TYPES.find((x) => x.id === state.lineType);
    if (lineTypeDetail) {
      lineTypeDetail.className = lt ? 'detail detail--verdict' : 'detail';
      lineTypeDetail.innerHTML = lt
        ? `<h3>${lt.name}</h3><p class="detail__meta">${lt.type}</p><p>${lt.use}</p>`
        : 'Pick a line type to hold it on the drawing and fade the rest.';
    }
    sim.focusLineType(state.lineType);
    if (lt) sim.announce(`${lt.name}. ${lt.type}. ${lt.use}`);
  }

  function selectTermination(id) {
    state.termination = id;
    setStudy(state.study === 'leader' ? 'anatomy' : state.study);
    latch(termChips, 'term', id);
    const t = TERMINATIONS.find((x) => x.id === id);
    if (termDetail) {
      termDetail.className = 'detail detail--verdict';
      termDetail.innerHTML = `<h3>${t.name}</h3><p>${t.detail}</p>
        <p>One style per drawing — which is why changing it here changes every arrow on the sheet.</p>`;
    }
    if (termAngle) termAngle.disabled = !t.angled;
    sim.setTermination(id);
    refreshSpace(false);
    sim.announce(`${t.name} terminations. ${t.detail}`);
  }

  function setTerminationAngle(deg) {
    state.terminationAngle = deg;
    if (termAngleOut) termAngleOut.textContent = `${deg}°`;
    termAngle?.setAttribute('aria-valuetext', `${deg} degrees included angle`);
    sim.setTerminationAngle(deg);
  }

  /** Figs. 4.7 and 4.8 — the space between the projection lines decides the termination. */
  function refreshSpace(switchStudy = true) {
    const span = state.spaceMm;
    const decision = fitDecision(span, state.termination);
    if (spaceOut) spaceOut.textContent = `${Math.round(span)} mm`;
    spaceRange?.setAttribute('aria-valuetext', `${Math.round(span)} millimetres between the projection lines`);
    if (spaceDetail) {
      const heading = {
        plenty: 'Arrows inside',
        tight: 'Arrows outside',
        none: 'Dots instead',
      }[decision.fit];
      spaceDetail.className = 'detail detail--verdict';
      spaceDetail.innerHTML = `<h3>${heading}</h3>
        <p class="detail__meta">${decision.rule}</p>
        <p>${decision.why}</p>`;
    }
    // Only take over the viewport when the learner actually touched the slider. Called with
    // `false` — from a termination change, or from the step opening — this must recompute the
    // verdict text and NOTHING else, or it would replace the anatomy drawing behind them.
    if (switchStudy) {
      setStudy('space');
      sim.showSpaceDemo(span, decision);
    } else if (state.study === 'space') {
      sim.showSpaceDemo(span, decision);
    }
    return decision;
  }

  function selectLeaderHead(id) {
    state.leaderHead = state.leaderHead === id ? null : id;
    if (state.leaderHead) state.leaderHeadsSeen.add(state.leaderHead);
    latch(leaderChips, 'lh', state.leaderHead);
    const h = LEADER_HEADS.find((x) => x.id === state.leaderHead);
    if (leaderDetail) {
      leaderDetail.className = h ? 'detail detail--verdict' : 'detail';
      leaderDetail.innerHTML = h
        ? `<h3>${h.name}</h3><p class="detail__meta">Points ${h.points}</p><p>${h.detail}</p>`
        : 'Pick a head to take the same note to a different kind of thing.';
    }
    if (state.leaderHead) { setStudy('leader'); sim.showLeaderHead(h.head); } else setStudy('anatomy');
    if (h) sim.announce(`${h.name}. ${h.detail}`);
  }

  on(btnAddDims, 'click', () => {
    state.dimensionsAdded = true;
    setStudy('anatomy');
    sim.addDimensions();
    btnAddDims.hidden = true;
    doneAdd?.classList.add('is-on');
    if (elementGroup) elementGroup.hidden = false;
    paintStep1();
    selectTermination(state.termination);
    setTerminationAngle(state.terminationAngle);
    refreshSpace(false);
    // The prose that describes these controls was withheld while they did not exist; now
    // that they do, repaint it alongside them.
    renderCopy();
    sim.announce('Dimensions added. Four dimensions now describe the plate: an overall length, an overall height, the bore diameter, and a chamfer note.');
    sync();
    refocus(elementChips?.firstElementChild);
  });

  on(termAngle, 'input', () => setTerminationAngle(Number(termAngle.value)));
  on(spaceRange, 'input', () => { state.spaceMm = Number(spaceRange.value); refreshSpace(true); });

  // Closing a study's fold puts the drawing back to the plain anatomy. Otherwise the viewport
  // would keep showing the leader demo or the squeezed-gap demo with nothing on screen to
  // explain it — the learner shut the control and the drawing did not follow.
  for (const fold of elementGroup?.querySelectorAll('.fold') ?? []) {
    on(fold, 'toggle', () => { if (!fold.open) setStudy('anatomy'); });
  }

  // ==========================================================================
  // Step 2 — the rules, correct vs violation
  // ==========================================================================
  const ruleSelectHost = $('rule-select');
  const ruleDetail = $('rule-detail');
  const btnRuleOk = $('rule-ok');
  const btnRuleBad = $('rule-bad');
  const placeDetail = $('place-detail');
  let ruleSelect = null;

  function paintRules() {
    if (!ruleSelectHost || ruleSelect) return;
    ruleSelect = createSelect(ruleSelectHost, {
      id: 'rule', label: 'Dimensioning rules',
      items: RULES.map((r) => ({ value: r.id, label: r.title, ref: r.ref })),
      onPick: (id) => selectRule(id),
    });
  }

  function selectRule(id) {
    state.ruleId = id;
    state.ruleVariant = 'ok';
    renderRule();
    const rule = RULES.find((r) => r.id === id);
    sim.announce(`${rule.title}. ${rule.rule}`);
  }

  function setRuleVariant(variant) {
    state.ruleVariant = variant;
    if (variant === 'wrong') state.rulesExplored.add(state.ruleId);
    renderRule();
    const rule = RULES.find((r) => r.id === state.ruleId);
    if (rule.permission) {
      sim.announce(variant === 'wrong'
        ? `${rule.altLabel}. ${rule.breaks}`
        : `${rule.okLabel}. ${rule.okNote}`);
    } else {
      sim.announce(variant === 'wrong' ? `Violation shown. ${rule.breaks}` : `Correct drawing shown. ${rule.rule}`);
    }
    sync();
  }

  function renderRule() {
    const rule = RULES.find((r) => r.id === state.ruleId) || RULES[0];
    ruleSelect?.setValue(rule.id);
    const alt = state.ruleVariant === 'wrong';

    // A permission is not a violation. Fig. 4.2 shows an alternative the chapter ALLOWS, so
    // its switch reads as two lawful drawings and neither side is flagged wrong.
    if (btnRuleOk) btnRuleOk.textContent = rule.permission ? rule.okLabel : 'Correct';
    if (btnRuleBad) btnRuleBad.textContent = rule.permission ? rule.altLabel : 'Violation';
    btnRuleOk?.classList.toggle('is-active', !alt);
    btnRuleBad?.classList.toggle('is-active', alt);
    btnRuleOk?.setAttribute('aria-pressed', String(!alt));
    btnRuleBad?.setAttribute('aria-pressed', String(alt));

    if (ruleDetail) {
      const wrong = alt && !rule.permission;
      ruleDetail.className = `detail ${wrong ? 'detail--wrong' : 'detail--verdict'}`;
      const flag = rule.permission
        ? (alt ? '✓ Also correct' : '✓ The long way round')
        : (alt ? '✗ What breaks' : '✓ Why it works');
      const bodyText = rule.permission
        ? (alt ? rule.breaks : rule.okNote)
        : (alt ? rule.breaks : 'The drawing above obeys it. Switch to Violation to see what the rule is protecting you from.');
      ruleDetail.innerHTML = `
        <h3>${rule.title}</h3>
        <p><b>The rule (${rule.ref}):</b> ${rule.rule}</p>
        <p><span class="detail__flag">${flag}</span><br>${bodyText}</p>`;
    }
    sim.showRule(rule.id, state.ruleVariant);
  }

  on(btnRuleOk, 'click', () => setRuleVariant('ok'));
  on(btnRuleBad, 'click', () => setRuleVariant('wrong'));

  // ==========================================================================
  // Step 3 — Method-1 vs Method-2
  // ==========================================================================
  const methodBtns = [...document.querySelectorAll('[data-method]')];
  const angularBtns = [...document.querySelectorAll('[data-angular]')];
  const methodDetail = $('method-detail');
  const btnOblique = $('btn-oblique');
  const angularGroup = $('angular-group');
  const angularNote = $('angular-note');

  /**
   * The card under the control. On its own it describes the ONE system the learner has picked;
   * with the comparison up it puts the two side by side on the three questions that actually
   * separate them, in the same left-to-right order as the two sheets on screen.
   *
   * WHY A TABLE AND NOT PROSE. The difference between the two systems is visual, and the drawing
   * is where it should be read. Three short rows say what to look FOR; they do not describe what
   * the learner can already see. The old card could only ever describe one system at a time, so
   * the comparison had to be done from memory.
   */
  function renderMethodDetail() {
    if (!methodDetail) return;
    const c = METHODS[state.method];
    methodDetail.className = 'detail detail--verdict';

    if (state.compare && currentStep === 3) {
      const other = METHODS[state.method === 1 ? 2 : 1];
      methodDetail.innerHTML = `
        <h3>${other.name} <span class="detail__vs">vs</span> ${c.name}</h3>
        <table class="data data--diff">
          <thead><tr><th><span class="sr-only">Judged on</span></th><th>${other.name}</th><th>${c.name}</th></tr></thead>
          <tbody>
            <tr><th scope="row">Across and up</th><td>${other.across}</td><td>${c.across}</td></tr>
            <tr><th scope="row">Sloping and angles</th><td>${other.sloping}</td><td>${c.sloping}</td></tr>
            <tr><th scope="row">Read from</th><td>${other.read}</td><td>${c.read}</td></tr>
          </tbody>
        </table>
        <p>${METHOD_CHOICE.note}</p>`;
      return;
    }

    const alias = c.alias ? ` <span class="detail__alias">(${c.alias})</span>` : '';
    methodDetail.innerHTML = `<h3>${c.name}${alias}</h3><p>${c.body}</p>
      <dl><dt>Why</dt><dd>${c.why}</dd><dt>Where</dt><dd>${c.where}</dd></dl>
      <p>Aligned and unidirectional are the two accepted systems for writing dimensions. Never mix them on one drawing.</p>`;
  }

  /**
   * The value system the drawing is in. ONE piece of state with TWO controls on it — Step 3's
   * segmented control and Step 4's method selector — because there is one drawing and one method
   * on it, and two controls that could disagree would be two answers to one question. Both are
   * repainted here whichever one was pressed, so moving between the steps never shows a control
   * that has gone stale.
   */
  function setMethod(m) {
    state.method = m;
    state.methodsSeen.add(m);
    for (const b of methodBtns) {
      const active = Number(b.dataset.method) === m;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    methodSelect?.setValue(String(m));
    renderMethodNote();
    renderMethodDetail();
    // Fig. 4.11's a/b choice is a Method-1 question; Method-2 is unidirectional — level — by
    // definition, so there is nothing to pick. The group stays put and explains itself instead
    // of disappearing.
    const angles = m === 1;
    for (const b of angularBtns) b.disabled = !angles;
    if (angularNote) angularNote.hidden = angles;
    angularGroup?.classList.toggle('is-off', !angles);
    sim.setMethod(m);
    // Step 3's comparison SWAPS the two sheets over, so the control chooses which side is which
    // and saying only the name would leave a screen-reader user unable to tell what moved. Step
    // 4's does not: the two sheets carry independent methods, so only the right-hand one changed
    // and `announceCompare()` (from the caller) says what the pair now holds.
    if (!(currentStep === 4 && state.compare)) {
      sim.announce(state.compare && currentStep === 3
        ? `${METHODS[m === 1 ? 2 : 1].name} on the left, ${METHODS[m].name} on the right.`
        : `${METHODS[m].label}.`);
    }
    sync();
  }

  function setAngularStyle(style) {
    state.angularStyle = style;
    for (const b of angularBtns) {
      const active = b.dataset.angular === style;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    sim.setAngularStyle(style);
    sim.announce(style === 'a'
      ? 'Angles now follow their own curve, like every other aligned value.'
      : 'Angles now written level. Simpler to draw, and easier to read.');
  }

  for (const b of methodBtns) on(b, 'click', () => setMethod(Number(b.dataset.method)));
  for (const b of angularBtns) on(b, 'click', () => setAngularStyle(b.dataset.angular));

  // One fixed label, one switch. The eight-directions study is the whole demonstration of WHY
  // aligned values flip: eight identical values on lines pointing every way round, half of them
  // turned over so they still read from the bottom or the right. It says in one press what the
  // old rotate-the-drawing slider took a two-handed gesture to say.
  on(btnOblique, 'click', () => {
    state.oblique = !state.oblique;
    btnOblique.setAttribute('aria-pressed', String(state.oblique));
    sim.showObliqueClock(state.oblique);
    sim.announce(state.oblique
      ? 'The same value on eight lines pointing every way round. The ones past the vertical are turned over so they still read from the bottom or the right.'
      : 'Back to the plate\'s own sizes.');
  });

  // ==========================================================================
  // Step 4 — arrangement of dimension lines
  // ==========================================================================
  const arrangementSelectHost = $('arrangement-select');
  const methodSelectHost = $('method-select');
  const methodNote = $('method-note');
  const compareSelectHost = $('compare-select');
  const compareMethodSelectHost = $('compare-method-select');
  const compareWithGroup = $('compare-with-group');
  const arrangementVariants = $('arrangement-variants');
  const arrangementDetail = $('arrangement-detail');
  const coordinateTable = $('coordinate-table');
  let arrangementSelect = null;
  let methodSelect = null;
  let compareSelect = null;
  let compareMethodSelect = null;

  const arrangementItems = () => ARRANGEMENTS
    .map((a) => ({ value: a.id, label: a.name, ref: a.fig }));

  /**
   * The two methods, as a selector.
   *
   * BOTH NAMES, ALWAYS. The chapter numbers them and a lecturer says "Method 1" out loud, so
   * the number has to be on the control; but the number alone says nothing about what changes
   * on the paper, and the word is what an exam answer must contain. "Recommended" rides in the
   * option list's `ref` column rather than in the label, so the trigger stays short and the
   * marker still appears at the moment the learner is choosing.
   */
  const methodItems = () => [1, 2].map((n) => ({
    value: String(n),
    label: METHODS[n].label,
    ref: n === METHOD_CHOICE.preferred ? 'Recommended' : undefined,
  }));

  function paintArrangements() {
    if (!arrangementSelectHost || arrangementSelect) return;
    arrangementSelect = createSelect(arrangementSelectHost, {
      id: 'arr', label: 'Layout of the dimensions',
      items: arrangementItems(),
      onPick: (id) => selectArrangement(id),
    });
    if (methodSelectHost) {
      methodSelect = createSelect(methodSelectHost, {
        id: 'meth', label: 'Method the values are written in',
        items: methodItems(),
        onPick: (v) => selectStepMethod(Number(v)),
      });
    }
    if (compareSelectHost) {
      compareSelect = createSelect(compareSelectHost, {
        id: 'cmp', label: 'Layout to compare with',
        items: arrangementItems(),
        // Only sheet B changes. The main drawing, its reveal animation and the camera are
        // untouched, so switching the comparison is instant and nothing re-animates.
        onPick: (id) => selectCompareWith(id),
      });
    }
    if (compareMethodSelectHost) {
      compareMethodSelect = createSelect(compareMethodSelectHost, {
        id: 'cmpm', label: 'Method to compare with',
        items: methodItems(),
        onPick: (v) => selectCompareMethod(Number(v)),
      });
    }
  }

  /**
   * Keep the two sheets from being the same drawing twice.
   *
   * A pair is (layout, method) on each side, and only the pair being identical is forbidden —
   * same layout with different methods, and same method with different layouts, are both real
   * comparisons and are the two the step is for. Whichever axis the learner did NOT just touch
   * is the one that moves, so a deliberate choice is never overwritten under their hand.
   *
   * @param {'layout'|'method'} justChanged Which axis the learner set.
   */
  function keepPairDistinct(justChanged) {
    if (state.compareId !== state.arrangementId || state.compareMethodId !== state.method) return;
    if (justChanged === 'method') {
      state.compareId = ARRANGEMENTS.find((a) => a.id !== state.arrangementId).id;
    } else {
      state.compareMethodId = state.method === 1 ? 2 : 1;
    }
  }

  function selectArrangement(id) {
    state.arrangementId = id;
    state.arrangementVariant = null;
    state.arrangementsSeen.add(id);
    keepPairDistinct('layout');
    renderArrangement();
    const a = ARRANGEMENTS.find((x) => x.id === id);
    sim.announce(`${a.name} dimensioning. ${a.use}`);
    sync();
  }

  /** Step 4's own method control. It writes the SAME state Step 3's segmented control does —
   *  there is one drawing and one value system on it, and two controls that disagreed about
   *  which method the sheet is in would be two answers to one question. */
  function selectStepMethod(m) {
    state.method = m;              // set before the guard, so it judges the pair AFTER the change
    keepPairDistinct('method');
    setMethod(m);
    const { a, variant } = currentArrangement();
    renderArrangementDetail(a, variant);
    if (state.compare) {
      sim.setCompare(state.compareId, state.compareMethodId);
      announceCompare();
    }
  }

  function selectCompareWith(id) {
    state.compareId = id;
    keepPairDistinct('layout');
    const { a, variant } = currentArrangement();
    renderArrangementDetail(a, variant);
    sim.setCompare(id, state.compareMethodId);   // sheet B only — sheet A and the camera untouched
    announceCompare();
  }

  function selectCompareMethod(m) {
    state.compareMethodId = m;
    state.methodsSeen.add(m);
    keepPairDistinct('method');
    const { a, variant } = currentArrangement();
    renderArrangementDetail(a, variant);
    sim.setCompare(state.compareId, m);
    announceCompare();
    sync();
  }

  /** What the two sheets now hold, said once, in the order they appear on screen. */
  function announceCompare() {
    const { a } = currentArrangement();
    const other = ARRANGEMENTS.find((x) => x.id === state.compareId);
    const sameLayout = other.id === a.id;
    sim.announce(sameLayout
      // The point of a same-layout pair is that ONLY the method moved. Say so, or a
      // screen-reader user hears two drawing names and no reason they are together — and where
      // nothing moved at all, say THAT, because a blind learner cannot see two identical sheets.
      ? (a.showsMethod
        ? `Method ${state.compareMethodId} on the left, Method ${state.method} on the right. The same ${a.name.toLowerCase()} layout on both — only the way the values are written differs.`
        : `The same ${a.name.toLowerCase()} layout in both methods, and the two drawings are identical: every dimension line here is horizontal, and both methods write a horizontal value the same way.`)
      : `Method ${state.compareMethodId} ${other.name} on the left, Method ${state.method} ${a.name} on the right. ${other.use}`);
  }

  function selectArrangementVariant(vid) {
    state.arrangementVariant = vid;
    renderArrangement();
    const a = ARRANGEMENTS.find((x) => x.id === state.arrangementId);
    const v = a.variants?.find((x) => x.id === vid);
    if (v) sim.announce(`${v.label}. ${v.fig}. ${v.note}`);
  }

  /**
   * The verdict card, plus the state of the "compare with" list.
   *
   * Split out of `renderArrangement` so that toggling the compare, or switching which layout
   * is held beside the current one, repaints the CARD without going back through
   * `sim.setArrangement` — which would re-run the main drawing's reveal animation and undo
   * the very comparison the learner is looking at.
   *
   * WHAT ACTUALLY CHANGED: on its own the card describes one layout; in a comparison it puts
   * the two side by side on the three axes the chapter judges them by, so the learner reads
   * the trade-off instead of inferring it from two drawings. No drawing is altered to say it.
   */
  /**
   * The concise "which method do I use?" card that sits under Step 4's method selector.
   *
   * TWO LINES, ALWAYS BOTH. Showing only the selected one would make the choice look like a
   * preference setting; the learner has to be able to see, without touching the control, that
   * there are two accepted methods and which of them this course draws in. The selected one is
   * flagged, the recommendation is stated once, and nothing else is said here — the full
   * argument is Step 3's, and repeating it would bury the layout question this step is about.
   */
  function renderMethodNote() {
    if (!methodNote) return;
    methodNote.className = 'detail';
    const rows = [METHOD_CHOICE.preferred, METHOD_CHOICE.preferred === 1 ? 2 : 1].map((n) => {
      const m = METHODS[n];
      // TWO CUES on the live one, never colour alone: it is the row at full ink strength AND
      // the row carrying the flag (§4.6 of the platform's own design rules).
      const flag = n === state.method ? ' <span class="detail__flag">On the drawing</span>' : '';
      return `<dt${n === state.method ? ' class="is-on"' : ''}>${m.label}${flag}</dt><dd>${m.use}</dd>`;
    }).join('');
    methodNote.innerHTML = `<dl>${rows}</dl>`;
  }

  function renderArrangementDetail(a, variant) {
    // EVERY layout, including the one on screen: "same layout, other method" is precisely the
    // pair that shows the two methods apart, and it is unreachable if the list excludes it.
    compareSelect?.setItems(arrangementItems());
    compareSelect?.setValue(state.compareId);
    compareMethodSelect?.setValue(String(state.compareMethodId));
    methodSelect?.setValue(String(state.method));
    renderMethodNote();

    const other = state.compare && currentStep === 4
      ? ARRANGEMENTS.find((x) => x.id === state.compareId)
      : null;
    if (!arrangementDetail) return;
    arrangementDetail.className = 'detail detail--verdict';

    if (!other) {
      arrangementDetail.innerHTML = `<h3>${a.name} · ${a.fig}</h3>
         <p>${a.use}</p>
         <p><b>Used when:</b> ${a.when}</p>
         ${variant ? `<p><span class="detail__flag">${variant.label}</span><br>${variant.note}</p>` : ''}
         <dl>
           <dt>Space</dt><dd>${a.space}</dd>
           <dt>Clarity</dt><dd>${a.clarity}</dd>
           <dt>Making it</dt><dd>${a.making}</dd>
         </dl>`;
      return;
    }

    // WHICH TABLE depends on which axis actually moved, because a comparison should be judged on
    // the thing that differs. Same layout, two methods → the method table (where the value sits,
    // which way it turns, which way it is read). Same method, two layouts → the layout table
    // (space, clarity, manufacture), exactly as before. Both moved → the layout table, with the
    // pair named in full and a line saying two things changed at once, so the learner is not left
    // to guess which difference they are looking at.
    const otherM = METHODS[state.compareMethodId];
    const thisM = METHODS[state.method];
    const sameLayout = other.id === a.id;
    const sameMethod = state.compareMethodId === state.method;
    const head = sameLayout
      ? `Method ${otherM.n} <span class="detail__vs">vs</span> Method ${thisM.n}`
      : `${other.name} <span class="detail__vs">vs</span> ${a.name}`;

    const methodTable = `
      <table class="data data--diff">
        <thead><tr><th><span class="sr-only">Judged on</span></th><th>Method ${otherM.n}</th><th>Method ${thisM.n}</th></tr></thead>
        <tbody>
          <tr><th scope="row">Across and up</th><td>${otherM.across}</td><td>${thisM.across}</td></tr>
          <tr><th scope="row">Sloping and angles</th><td>${otherM.sloping}</td><td>${thisM.sloping}</td></tr>
          <tr><th scope="row">Read from</th><td>${otherM.read}</td><td>${thisM.read}</td></tr>
        </tbody>
      </table>`;
    const layoutTable = `
      <table class="data data--diff">
        <thead><tr><th><span class="sr-only">Judged on</span></th><th>${other.name}</th><th>${a.name}</th></tr></thead>
        <tbody>
          <tr><th scope="row">Space</th><td>${other.space}</td><td>${a.space}</td></tr>
          <tr><th scope="row">Clarity</th><td>${other.clarity}</td><td>${a.clarity}</td></tr>
          <tr><th scope="row">Making it</th><td>${other.making}</td><td>${a.making}</td></tr>
        </tbody>
      </table>`;

    // THE HONEST CASE. Four of the six layouts measure only across the part, and both methods
    // write a horizontal value the same way — so the two sheets really are identical, and the
    // card has to say so. Pretending otherwise would leave the learner hunting for a difference
    // that is not there; saying it turns a dead comparison into the rule it demonstrates.
    const flat = sameLayout && !a.showsMethod;
    const lead = !sameLayout
      ? ''
      : flat
        ? `<p>The same ${a.name.toLowerCase()} layout in both methods — and the two sheets are <b>identical</b>. Every dimension line here is horizontal, and both methods write a horizontal value the same way: above the line, read from the bottom. The method only shows itself on a line that is <b>not</b> horizontal — try <b>${METHOD_SHOWING_LAYOUTS[0]}</b>.</p>`
        : `<p>The same ${a.name.toLowerCase()} layout on both sheets — the same lines in the same places. Only the way the values are written differs.</p>`;

    arrangementDetail.innerHTML = `<h3>${head}</h3>
      ${sameLayout
        ? `${lead}${methodTable}`
        : `${layoutTable}${sameMethod
            ? ''
            : `<p>Both sheets also differ in method — Method ${otherM.n} on the left, Method ${thisM.n} on the right. Hold one of the two still to read the other.</p>`}`}`;
  }

  /** The live arrangement and its variant, for the light repaint paths. */
  function currentArrangement() {
    const a = ARRANGEMENTS.find((x) => x.id === state.arrangementId) || ARRANGEMENTS[0];
    const variant = a.variants
      ? (a.variants.find((v) => v.id === state.arrangementVariant) ?? a.variants[0])
      : null;
    return { a, variant };
  }

  function renderArrangement() {
    const a = ARRANGEMENTS.find((x) => x.id === state.arrangementId) || ARRANGEMENTS[0];
    arrangementSelect?.setValue(a.id);

    // Variant chips exist only where the chapter's own figure prints more than one form.
    if (arrangementVariants) {
      arrangementVariants.innerHTML = '';
      arrangementVariants.hidden = !a.variants;
      if (a.variants) {
        const active = state.arrangementVariant ?? a.variants[0].id;
        for (const v of a.variants) {
          chip(arrangementVariants, {
            key: 'av', value: v.id, label: v.label,
            onPick: () => selectArrangementVariant(v.id),
          });
        }
        latch(arrangementVariants, 'av', active);
      }
    }

    const variant = a.variants
      ? (a.variants.find((v) => v.id === state.arrangementVariant) ?? a.variants[0])
      : null;

    renderArrangementDetail(a, variant);

    renderCoordinateTable(variant ? variant.table : a.table);

    renderCompare();
    sim.setArrangement(a.id, variant?.id ?? null);
    sim.setCompare(state.compare ? state.compareId : null, state.compareMethodId);
  }

  // --- The persistent compare ------------------------------------------------
  //
  // ONE control, in ONE place, wherever a comparison is on offer. It used to be a block button
  // in Step 4 whose label rewrote itself, and a third segment of a three-way control in Step 6
  // — two different affordances for the same idea, in two different positions. Both remaining
  // steps now paint the same toggle into a fixed slot directly under the step's own primary
  // control, so the learner never has to look for it. (Step 6 had a slot too, until its
  // faulty-versus-corrected pair went with the fault hunt; its comparison is now the worked
  // examples' own two sheets, which are always side by side and need no control at all.)
  const compareSlots = [$('compare-slot-3'), $('compare-slot-4')].filter(Boolean);
  const compareToggles = compareSlots.map((slot) => createToggle(slot, {
    label: 'Compare side by side',
    onToggle: (on) => toggleCompare(on),
  }));

  function toggleCompare(on) {
    state.compare = on;
    renderCompare();
    if (currentStep === 3) {
      // The two value systems, on the SAME drawing: the one not selected on the left, the one
      // selected on the right. Nothing else differs between the two sheets, which is the whole
      // reason the comparison teaches anything.
      renderMethodDetail();
      sim.setMethodCompare(on);
      const other = METHODS[state.method === 1 ? 2 : 1];
      sim.announce(on
        ? `${other.name} on the left, ${METHODS[state.method].name} on the right. The same plate, the same sizes — only the way the values are written differs.`
        : 'Single drawing shown.');
      return;
    }
    // The LIGHT path: only sheet B appears or goes, and only the card is repainted. Going back
    // through `sim.setArrangement` would re-run the main drawing's reveal animation.
    if (on) keepPairDistinct('layout');   // the pair may have gone identical while the compare was down
    const { a, variant } = currentArrangement();
    renderArrangementDetail(a, variant);
    sim.setCompare(on ? state.compareId : null, state.compareMethodId);
    if (on) announceCompare(); else sim.announce('Single drawing shown.');
  }

  /** Push the compare state into whichever slot the current step owns. Split out so main.js
   *  can drop the compare (see `compareDropped`) without repainting a whole step. */
  function renderCompare() {
    // Step 4 compares ANY layout in EITHER method with any other, so it discloses two more
    // selectors: one per axis, in the same order as the two above them. Step 3 holds one
    // drawing in both value systems and needs no second list.
    const inStep4 = currentStep === 4;
    const note = inStep4
      ? 'Hold any layout, in either method, beside this one'
      : 'The same drawing in both value systems, side by side';
    for (const t of compareToggles) t.set(state.compare, { disabled: false, note });
    if (compareWithGroup) compareWithGroup.hidden = !(inStep4 && state.compare);
  }


  /** Fig. 4.19's table, in the two forms the figure prints (with ø, and without). */
  function renderCoordinateTable(form) {
    if (!coordinateTable) return;
    coordinateTable.hidden = !form;
    if (!form) { coordinateTable.innerHTML = ''; return; }
    const withSize = form === 'full';
    const head = withSize
      ? '<tr><th>#</th><th>x</th><th>y</th><th>size</th><th>feature</th></tr>'
      : '<tr><th>#</th><th>x</th><th>y</th></tr>';
    const rows = COORDINATE_TABLE.map((r) => (withSize
      ? `<tr><td>${r.n}</td><td>${r.x}</td><td>${r.y}</td><td>${r.dia}</td><td>${r.label}</td></tr>`
      : `<tr><td>${r.n}</td><td>${r.x}</td><td>${r.y}</td></tr>`)).join('');
    coordinateTable.innerHTML = `<table class="data">
      <caption class="sr-only">Position of each feature</caption>
      <thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  // ==========================================================================
  // Step 5 — shape symbols
  // ==========================================================================
  const symbolChips = $('symbol-chips');
  const symbolChipsConv = $('symbol-chips-conv');
  const symbolVariants = $('symbol-variants');
  const symbolDetail = $('symbol-detail');
  const btnSymbolView = $('btn-symbol-view');

  function paintSymbols() {
    if (!symbolChips || symbolChips.childElementCount) return;
    for (const s of SYMBOLS) {
      const host = s.bis ? symbolChips : symbolChipsConv;
      if (!host) continue;
      chip(host, {
        key: 'sym', value: s.id, glyph: s.glyph, label: s.name,
        onPick: () => selectSymbol(s.id),
      });
    }
  }

  function selectSymbol(id) {
    state.symbolId = state.symbolId === id ? null : id;
    state.symbolVariant = null;
    if (state.symbolId) state.symbolsSeen.add(state.symbolId);
    latch(symbolChips, 'sym', state.symbolId);
    latch(symbolChipsConv, 'sym', state.symbolId);
    renderSymbol();
    const s = SYMBOLS.find((x) => x.id === state.symbolId);
    if (s) sim.announce(`${s.name}. ${s.meaning} ${s.usage}`);
    sync();
  }

  function selectSymbolVariant(vid) {
    state.symbolVariant = vid;
    renderSymbol();
    const s = SYMBOLS.find((x) => x.id === state.symbolId);
    const v = s?.variants.find((x) => x.id === vid);
    if (v) sim.announce(`${v.label}. ${v.fig}. ${v.note}`);
  }

  function renderSymbol() {
    const s = SYMBOLS.find((x) => x.id === state.symbolId);

    if (symbolVariants) {
      symbolVariants.innerHTML = '';
      symbolVariants.hidden = !s;
      if (s) {
        for (const v of s.variants) {
          chip(symbolVariants, {
            key: 'sv', value: v.id, label: v.label,
            onPick: () => selectSymbolVariant(v.id),
          });
        }
        latch(symbolVariants, 'sv', state.symbolVariant ?? s.variants[0].id);
      }
    }

    const variant = s ? (s.variants.find((v) => v.id === state.symbolVariant) ?? s.variants[0]) : null;

    if (symbolDetail) {
      symbolDetail.className = s ? 'detail detail--verdict' : 'detail';
      symbolDetail.innerHTML = s
        ? `<h3><span aria-hidden="true">${s.glyph}</span> ${s.name}</h3>
           <p class="detail__meta">${s.bis ? 'One of the five shape symbols' : 'A convention, not a symbol'}</p>
           <p><span class="detail__flag">${variant.label}</span><br>${variant.note}</p>
           <dl>
             <dt>Means</dt><dd>${s.meaning}</dd>
             <dt>How</dt><dd>${s.usage}</dd>
             <dt>Where</dt><dd>${s.placement}</dd>
             <dt>Watch out</dt><dd>${s.mistake}</dd>
           </dl>`
        : 'Pick a symbol to see it dimension the feature it belongs to.';
    }
    if (btnSymbolView) btnSymbolView.hidden = !(s && s.rear);
    sim.showSymbol(state.symbolId, variant?.id ?? null);
  }

  on(btnSymbolView, 'click', () => {
    sim.setView('rear');
    sim.announce('The plate is turned over. The countersink that reads dashed in the front view is now the visible face.');
  });

  // ==========================================================================
  // Step 6 — the chapter's worked examples + the sheet itself
  // ==========================================================================
  const exampleChips = $('example-chips');
  const exampleDetail = $('example-detail');
  const sheetFold = $('review-sheet-fold');
  const scaleChips = $('scale-chips');
  const unitChips = $('unit-chips');
  const sheetDetail = $('sheet-detail');

  /**
   * The chips are the whole of Step 6's navigation.
   *
   * ⚠️ THEY NAME THE PART AND NOTHING ELSE. The chips briefly carried the chapter's figure
   * number as well ("Fig. 4.28" over "L-plate"); it was taken out again on 2026-08-17 because
   * this is a standalone learning module, not a viewer for a scanned textbook, and a citation
   * in front of a first-year student is a speed bump they cannot act on. That restores the
   * no-citations rule in CLAUDE.md's Voice section to having NO exceptions — keep it that way.
   * `reviewFigures.js` still records each figure's number in `no`, for us, in the data.
   */
  function paintExamples() {
    if (!exampleChips || exampleChips.childElementCount) return;
    for (const f of REVIEW_FIGURES) {
      chip(exampleChips, {
        key: 'example', value: f.id, label: f.name, onPick: () => selectExample(f.id),
      });
    }
    latch(exampleChips, 'example', state.exampleId);
  }

  /** Put one worked example on the board and say, in the panel, what it is there to show. */
  function selectExample(id) {
    const fig = reviewFigure(id) || REVIEW_FIGURES[0];
    state.exampleId = fig.id;
    state.examplesSeen.add(fig.id);
    latch(exampleChips, 'example', fig.id);
    // Picking an example is a request for the board, so the sheet study gives the viewport
    // back. Closing the fold is what runs `sim.setExamples` again — see the toggle below.
    if (sheetFold?.open) sheetFold.open = false;
    else sim.setExamples(fig.id);
    if (exampleDetail) {
      exampleDetail.className = 'detail detail--verdict';
      exampleDetail.innerHTML = `<h3>${fig.name} — ${fig.arrangement.toLowerCase()}</h3>`
        + `<p>${fig.faults.length} things are wrong with the left-hand drawing. `
        + `The list under the pair names every one of them, and says what the corrected sheet does instead.</p>`;
    }
    sim.announce(`${fig.name}, ${fig.arrangement.toLowerCase()}. `
      + 'The wrongly dimensioned drawing is on the left and the corrected one on the right.');
    if (state.examplesSeen.size >= REVIEW_FIGURES.length && !state.completed) {
      state.completed = true;
      sim.completeLesson();
    }
    sync();
  }

  /**
   * "The sheet itself" OWNS THE VIEWPORT while it is open.
   *
   * The scale and unit study acts on the 3-D Guide Plate, and the examples board covers it, so
   * the two cannot both be on screen. Opening the fold takes the board down; closing it puts
   * the current pair back. Same contract as Step 1's studies, which return the drawing to the
   * plain anatomy on close — a control whose subject is not visible is not a control.
   */
  on(sheetFold, 'toggle', () => {
    if (sheetFold.open) sim.setSheetView();
    else sim.setExamples(state.exampleId);
  });

  function paintSheetSettings() {
    if (scaleChips && !scaleChips.childElementCount) {
      for (const s of SHEET_SETTINGS.scales) {
        chip(scaleChips, { key: 'scale', value: s.id, label: s.label, onPick: () => selectScale(s.id) });
      }
      latch(scaleChips, 'scale', state.sheetScale);
    }
    if (unitChips && !unitChips.childElementCount) {
      for (const u of SHEET_SETTINGS.units) {
        chip(unitChips, { key: 'unit', value: u.id, label: u.label, onPick: () => selectUnits(u.id) });
      }
      latch(unitChips, 'unit', state.sheetUnits);
    }
  }

  function renderSheetDetail(note, headline) {
    if (!sheetDetail) return;
    sheetDetail.className = 'detail detail--verdict';
    sheetDetail.innerHTML = `<h3>${headline}</h3><p>${note}</p>`;
  }

  function selectScale(id) {
    state.sheetScale = id;
    latch(scaleChips, 'scale', id);
    const s = SHEET_SETTINGS.scales.find((x) => x.id === id);
    sim.setSheetScale(id);
    renderSheetDetail(s.note, `Scale ${s.label}`);
    sim.announce(`Scale ${s.label}. ${s.note}`);
  }

  function selectUnits(id) {
    state.sheetUnits = id;
    latch(unitChips, 'unit', id);
    const u = SHEET_SETTINGS.units.find((x) => x.id === id);
    sim.setSheetUnits(id);
    renderSheetDetail(u.note, u.label);
    sim.announce(`${u.label}. ${u.note}`);
  }

  /** The §4.6 checklist and the §4.5 class-work system are REFERENCE, not a reward: they are
   *  painted the moment Step 6 opens and never hidden (Curriculum audit, blocking fix 3). */
  function paintReference() {
    const list = $('bis-checklist');
    if (list && !list.childElementCount) list.innerHTML = BIS_CHECKLIST.map((r) => `<li>${r}</li>`).join('');
    const cw = $('classwork-list');
    if (cw && !cw.childElementCount) cw.innerHTML = CLASSWORK_SYSTEM.map((c) => `<dt>${c.title}</dt><dd>${c.detail}</dd>`).join('');
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  function renderRail() {
    for (const item of railItems) {
      const i = Number(item.dataset.step);
      const marker = item.querySelector('.rail__marker');
      const btn = item.querySelector('.rail__btn');
      const labelEl = item.querySelector('.rail__label');
      const terminal = i === TOTAL && state.completed;
      const current = i === currentStep && !terminal;
      const complete = terminal || (!current && isComplete(i));
      item.classList.toggle('is-current', current);
      item.classList.toggle('is-complete', complete);
      item.classList.toggle('is-upcoming', !current && !complete);
      if (marker) marker.textContent = complete ? '✓' : String(i); // shape cue, not colour alone
      if (btn) {
        // Unlocked as far as the learner has been, not only as far as they have finished —
        // Next never blocks, so the rail must be able to bring them back.
        btn.disabled = i > maxReached;
        const name = labelEl ? labelEl.textContent.trim() : `Step ${i}`;
        const word = current ? 'current step' : complete ? 'completed, go to step'
          : i <= maxReached ? 'go to step' : 'not reached yet';
        btn.setAttribute('aria-label', `Step ${i}, ${name}, ${word}`);
        if (current) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    }
  }

  /**
   * Navigation is ALWAYS available. Next is never disabled and never hidden behind content —
   * a learner who wants to read ahead, or who is stuck, must be able to move. The step's
   * remaining work is stated beside the button instead of being enforced by it; the rail's
   * ✓ marks and each step's summary card are what actually record completion.
   */
  function renderNav() {
    if (elCurrent) elCurrent.textContent = String(currentStep);
    if (btnBack) btnBack.hidden = currentStep === 1;
    const onLast = currentStep >= TOTAL;
    const done = isComplete(currentStep);
    if (btnNext) {
      btnNext.hidden = onLast;
      btnNext.disabled = false;
      btnNext.title = onLast || done ? '' : gateHintLong(currentStep);
      btnNext.setAttribute('aria-describedby', 'step-gate');
    }
    const gate = $('step-gate');
    if (gate) {
      const show = !onLast && !done;
      gate.hidden = !show;
      if (show) {
        gate.textContent = gateHint(currentStep);
        gate.title = gateHintLong(currentStep);
      }
    }
  }

  /**
   * The closing summary is a CONCLUSION, not a preface: it states what the step's own
   * interactions establish, so painting it on arrival would hand the learner every answer
   * before they had touched a control. It appears the moment the step completes — `sync()`
   * calls this, and every control that can complete a step already calls `sync()` — so it
   * never needs the learner to leave and come back.
   */
  function renderSummary() {
    if (!elSummary) return;
    const done = isComplete(currentStep);
    elSummary.hidden = !done;
    if (!done) {
      elSummary.innerHTML = '';
      delete elSummary.dataset.step;
      return;
    }
    if (elSummary.dataset.step === String(currentStep)) return; // already painted; don't thrash
    elSummary.dataset.step = String(currentStep);
    const meta = STEPS[currentStep - 1];
    elSummary.innerHTML = `
      <h3 class="summary__title">${meta.summary.title}</h3>
      <ul class="summary__list">${meta.summary.points.map((p) => `<li>${p}</li>`).join('')}</ul>`;
  }

  /** Whether this step's interactive controls are on screen yet. Step 1's are disclosed by
   *  "Add the dimensions"; every other step's exist as soon as the step does. */
  const controlsVisible = (i) => i !== 1 || state.dimensionsAdded;

  /**
   * Paint the step's prose. `postBody` is the "How it is drawn" paragraph, and it DESCRIBES
   * the step's controls — so it is withheld until those controls exist, or the learner reads
   * about four control groups that are not on screen yet.
   */
  function renderCopy() {
    const meta = STEPS[currentStep - 1];
    if (elTitle) elTitle.textContent = meta.title;
    if (elLead) elLead.textContent = meta.lead;
    const toParas = (arr) => (arr || []).map((p) => `<p>${p}</p>`).join('');
    if (elBody) elBody.innerHTML = toParas(meta.body.open);
    if (elPostBody) {
      elPostBody.innerHTML = controlsVisible(currentStep) ? toParas(meta.body.postBody) : '';
    }
  }

  function goToStep(n, { announce = true } = {}) {
    currentStep = Math.min(Math.max(n, 1), TOTAL);
    maxReached = Math.max(maxReached, currentStep);
    // main.js's enterStep() drops any live compare, so the control must not stay latched.
    state.compare = false;
    ruleSelect?.close();
    arrangementSelect?.close();

    // Every Back / Next / rail jump puts the camera back on the drawing, exactly as the
    // sibling Foundations topic does. Manual orbit, zoom and pan stay live — this only
    // undoes them at a step boundary, where a skewed sheet would misrepresent the next step.
    //
    // NOT on the first entry: the sim OPENS on the isometric (main.js's initial pose), and
    // this call runs once during boot as Step 1 is entered. Restoring there would snap the
    // opening view back to the elevation before the learner ever sees the solid.
    if (booted) sim.restoreView?.();
    booted = true;

    renderCopy();

    for (const panel of panels) {
      const show = Number(panel.dataset.step) === currentStep;
      panel.hidden = !show;
      panel.classList.toggle('is-active', show);
    }
    if (scrollRegion) scrollRegion.scrollTop = 0;

    // Hand the scene the step FIRST (it resets any compare and installs the step's default
    // drawing), THEN paint this step's controls — several of them push their own drawing
    // through the controller, and they must win over the default.
    sim.enterStep(currentStep);
    if (currentStep === 1 && state.dimensionsAdded) {
      paintStep1();
      selectTermination(state.termination);
      setTerminationAngle(state.terminationAngle);
    }
    if (currentStep === 2) { paintRules(); renderRule(); }
    if (currentStep === 3) { setMethod(state.method); setAngularStyle(state.angularStyle); }
    if (currentStep === 4) { paintArrangements(); renderArrangement(); }
    if (currentStep === 5) { paintSymbols(); renderSymbol(); }
    if (currentStep === 6) {
      paintReference();
      paintSheetSettings();
      paintExamples();
      // LAST, and it owns the viewport: enterStep has just put the 3-D sheet up, and the board
      // has to win over it unless the learner has left "The sheet itself" open.
      if (sheetFold?.open) sim.setSheetView(); else selectExample(state.exampleId);
    }
    // The compare slot is per-step, so it has to be re-stated on arrival — including on the
    // steps that do not own one, where both toggles simply read "off".
    renderCompare();

    sync();

    if (announce) {
      sim.announce(`Step ${currentStep} of ${TOTAL}. ${STEPS[currentStep - 1].title}.`);
      elTitle?.focus?.({ preventScroll: true });
    }
  }

  /** Re-render everything that depends on completion state. Every control that can complete
   *  a step calls this, which is what lets the summary appear the moment the step is done. */
  function sync() { renderRail(); renderNav(); renderSummary(); }

  /**
   * Keep keyboard focus inside the card after a control hides itself. Prefer the given next
   * control; fall back to the step heading so focus never drops to <body>.
   * (The same helper Foundations' stepper uses — one focus policy, one place.)
   */
  function refocus(preferred) {
    const el = preferred && !preferred.hidden && !preferred.disabled ? preferred : elTitle;
    el?.focus?.({ preventScroll: true });
  }

  // --- Navigation + reset ---------------------------------------------------
  on(btnNext, 'click', () => { if (currentStep < TOTAL) goToStep(currentStep + 1); });
  on(btnBack, 'click', () => goToStep(currentStep - 1));
  on(btnReset, 'click', () => sim.reset()); // the ONE reset path (RULES.md §2.9)

  for (const item of railItems) {
    const btn = item.querySelector('.rail__btn');
    on(btn, 'click', () => {
      const target = Number(item.dataset.step);
      if (target === currentStep || target > maxReached) return;
      goToStep(target);
    });
  }

  // --- Public surface -------------------------------------------------------
  goToStep(1, { announce: false });

  return {
    sync,

    /**
     * main.js has taken the before/after split down on its own. It has to: the two sheets
     * are slid apart in world space, and the live edge classifier welds and raycasts against
     * a sheet that is square-on and centred, so a compare cannot survive the learner turning
     * the part. The control would otherwise stay latched over a viewport showing one sheet.
     */
    compareDropped() {
      if (!state.compare) return;
      // Step 3's card changes shape with the compare — it is a two-column table while both
      // sheets are up and a single verdict when they are not.
      if (currentStep === 3) { state.compare = false; renderMethodDetail(); }
      state.compare = false;
      // Step 4's card does the same: a diff table while both sheets are up, a single layout
      // verdict when they are not. Repainting the CARD is not repainting the drawing.
      if (currentStep === 4) {
        const { a, variant } = currentArrangement();
        renderArrangementDetail(a, variant);
      }
      renderCompare(); // not sync(): the drawing itself must not be repainted from here
    },

    /** main.js reports the outcome of a value drag against the §4.2 placement rules. */
    reportPlacement(res) {
      if (!placeDetail) return;
      placeDetail.className = `detail ${res.ok ? 'detail--right' : 'detail--wrong'}`;
      placeDetail.innerHTML = res.ok
        ? `<p><span class="detail__flag">✓ Legal placement</span><br>${res.message}</p>`
        : `<p><span class="detail__flag">✗ ${res.rule}</span><br>${res.message}</p>`;
      sim.announce(res.ok ? `Legal placement. ${res.message}` : `Rule broken. ${res.message}`);
    },

    reset() {
      state.dimensionsAdded = false;
      state.elementsSeen.clear();
      state.lineType = null;
      state.termination = 'open';
      state.terminationAngle = 15;
      state.leaderHead = null;
      state.leaderHeadsSeen.clear();
      state.spaceMm = 60;
      state.study = 'anatomy';
      state.ruleId = RULES[0].id;
      state.ruleVariant = 'ok';
      state.rulesExplored.clear();
      state.method = 1;
      state.methodsSeen = new Set([1]);
      state.angularStyle = 'a';
      state.oblique = false;
      state.arrangementId = ARRANGEMENTS[0].id;
      state.arrangementVariant = null;
      state.compareId = ARRANGEMENTS[1].id;
      state.arrangementsSeen = new Set([ARRANGEMENTS[0].id]);
      state.compare = false;
      state.symbolId = null;
      state.symbolVariant = null;
      state.symbolsSeen.clear();
      state.exampleId = REVIEW_FIGURES[0].id;
      state.examplesSeen = new Set([REVIEW_FIGURES[0].id]);
      state.sheetScale = '1:1';
      state.sheetUnits = 'mm';
      state.completed = false;
      pinnedElement = null;
      maxReached = 1;

      if (btnAddDims) btnAddDims.hidden = false;
      doneAdd?.classList.remove('is-on');
      if (elementGroup) elementGroup.hidden = true;
      for (const [range, out, value, suffix] of [
        [termAngle, termAngleOut, '15', '°'],
        [spaceRange, spaceOut, '60', ' mm'],
      ]) {
        if (range) {
          range.value = value;
          const min = Number(range.min || 0);
          const max = Number(range.max || 100);
          range.style.setProperty('--p', `${((Number(value) - min) / (max - min)) * 100}%`);
        }
        if (out) out.textContent = `${value}${suffix}`;
      }
      btnOblique?.setAttribute('aria-pressed', 'false');
      ruleSelect?.setValue(RULES[0].id);
      arrangementSelect?.setValue(ARRANGEMENTS[0].id);
      renderCompare();
      if (sheetFold) sheetFold.open = false;
      latch(scaleChips, 'scale', '1:1');
      latch(unitChips, 'unit', 'mm');
      latch(exampleChips, 'example', state.exampleId);
      if (exampleDetail) { exampleDetail.className = 'detail'; exampleDetail.textContent = ''; }
      if (sheetDetail) { sheetDetail.className = 'detail'; sheetDetail.textContent = 'Change the scale and watch every value stay exactly where it is.'; }
      if (placeDetail) { placeDetail.className = 'detail'; placeDetail.textContent = 'Waiting for you to move the value.'; }
      if (lineTypeDetail) { lineTypeDetail.className = 'detail'; lineTypeDetail.textContent = 'Pick a line type to hold it on the drawing and fade the rest.'; }
      if (leaderDetail) { leaderDetail.className = 'detail'; leaderDetail.textContent = 'Pick a head to take the same note to a different kind of thing.'; }
      goToStep(1, { announce: false });
    },

    dispose: () => ac.abort(),
  };
}
