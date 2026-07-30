// Parameter dock controller — Conic Sections.
//
// One group per guided step, and NOTHING in a group that does not serve that step's own
// question (ADR-086). The dock is deliberately smaller than the topic's state:
//
//   Step 1  the cone — how wide, how tall, and whether the second half is shown.
//   Step 2  the cut — the tilt, and nothing else. The plane is switched on by the step
//           itself (main.js setStage), so there is no on/off toggle to hunt for, and the
//           readout describes what is on screen WITHOUT naming it yet.
//   Step 3  the six named cuts as chips: press one, the plane travels there (sim.tourCut)
//           and the readout states the textbook rule. The "slide it past the tip" field is
//           revealed here, because the apex cut is the first one that needs it.
//   Step 4  the ratio PF ÷ PQ, one comparison toggle, and a toggle that puts the formal
//           §6.2/§6.4/§6.8 vocabulary on the sheet only when asked for.
//   Step 5  the construction: play it stage by stage, or pick one of the other eleven —
//           whose given dimensions appear only for the method that is given them.
//   Step 6  predict and verify: deal a cut, name it, and be marked against the same
//           classification the earlier steps report with.
//   Footer  the guarded two-state Reset confirm (behaviour-identical to Module 2).
//
// Layering (CLAUDE.md): leaf layer. The only import is the pure-data catalogue
// src/conicData.js — the sibling-importable category RULES.md §3.6a defines; behaviour
// still reaches the orchestrator only through the injected `sim` controller.
//
// The slider ↔ numeric-input two-way sync mirrors the Module 2 dock: dragging the slider
// rewrites the field; committing the field clamps to range and drives the slider; invalid
// text reverts to the last valid value with a visible "Kept …" nudge.

import { methodById } from './conicData.js';

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {() => (import('./shapeData.js').ShapeData | null)} state  The current cone.
 * @property {(partial:object) => void} commit          Merge into ShapeData and rebuild().
 * @property {() => {enabled:boolean, angleDeg:number, offset:number}} sectionState
 * @property {(partial:object) => void} commitSection   Merge into the section state and rebuild().
 * @property {() => import('./conicData.js').ConicState} conicState
 * @property {(partial:object) => void} commitConic     Merge into the sheet state and repaint.
 * @property {() => boolean} showUpperNappe
 * @property {(on:boolean) => void} commitNappes
 * @property {() => {key:string, letter:string, name:string, seen:string, rule:string, generatorDeg:number, cuts:boolean}} sectionInfo
 * @property {(e:number) => string} curveForEccentricity
 * @property {() => number} stage                       Which guided step is showing.
 * @property {() => Array<{key:string, letter:string, name:string, seen:string, how:string, rule:string}>} sectionTour
 * @property {(key:string) => void} tourCut             Travel the plane to a named cut.
 * @property {() => Array<{index:number, label:string, say:string}>} buildStages
 * @property {() => void} playConstruction              Draw the construction stage by stage.
 * @property {() => void} dealPrediction                Set up an unnamed cut (Step 6).
 * @property {(key:string) => void} answerPrediction    Commit to an answer (Step 6).
 * @property {() => {answer:string|null, chosen:string|null, right:number, asked:number}} predictionState
 * @property {string} ECCENTRICITY_METHOD
 * @property {() => void} reset                         Route through simAPI.reset().
 * @property {(message:string) => void} announce        Narrate to the live region.
 * @property {(message:string) => void} flowNote        Flash a brief note over the viewport.
 */

/**
 * Slider descriptors. `key` names the field in its own state bag. `min`/`max` are in the
 * DISPLAYED unit; `scale` maps display → stored (display = stored × scale), so the cone's
 * world units (1 unit = 10 mm) show as millimetres while the sheet's own millimetres pass
 * straight through at scale 1 (ADR-083).
 */
const CONE_SLIDERS = [
  { key: 'baseLength', range: 'rng-base',   num: 'num-base',   min: 20, max: 60, decimals: 0, unitWord: 'millimetres', scale: 10 },
  { key: 'height',     range: 'rng-height', num: 'num-height', min: 15, max: 45, decimals: 0, unitWord: 'millimetres', scale: 10 },
];

const SECTION_SLIDERS = [
  { key: 'angleDeg', range: 'rng-sec-angle',  num: 'num-sec-angle',  min: 0,   max: 90, decimals: 0, unitWord: 'degrees',    scale: 1 },
  { key: 'offset',   range: 'rng-sec-offset', num: 'num-sec-offset', min: -40, max: 40, decimals: 0, unitWord: 'millimetres', scale: 10 },
];

const CONIC_SLIDERS = [
  { key: 'e',      range: 'rng-ecc',    num: 'num-ecc',    min: 0.2, max: 2.5, decimals: 2, unitWord: '',         scale: 1 },
  { key: 'pointT', range: 'rng-point',  num: 'num-point',  min: 0,   max: 100, decimals: 0, unitWord: 'per cent', scale: 100 },
  { key: 'points', range: 'rng-points', num: 'num-points', min: 2,   max: 8,   decimals: 0, unitWord: 'points',   scale: 1 },
];

/** The three relabelling dimension fields of Step 5, in METHODS order. */
const METHOD_DIMS = [
  { key: 'dim1', field: 'fld-dim1', range: 'rng-dim1', num: 'num-dim1', label: 'lbl-dim1' },
  { key: 'dim2', field: 'fld-dim2', range: 'rng-dim2', num: 'num-dim2', label: 'lbl-dim2' },
  { key: 'dim3', field: 'fld-dim3', range: 'rng-dim3', num: 'num-dim3', label: 'lbl-dim3' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Parse a typed numeric field, tolerating a decimal COMMA (3,5 → 3.5) so an EU-format
 * entry is not silently truncated by parseFloat. Returns NaN for anything non-numeric so
 * the caller can revert to the last valid value. (Behaviour kept from the Module 2 dock.)
 * @param {string} str
 * @returns {number}
 */
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * Wire the dock to the sim controller. Returns a handle so main.js can re-sync after a
 * reset (via its onStateChange subscription) and tear listeners down.
 *
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const tglNappes = $('tgl-nappes');
  const tglShowAll = $('tgl-show-all');
  const tglShowNames = $('tgl-show-names');
  const tglTangent = $('tgl-tangent');
  const methodSelect = $('ctl-method');
  const coneReadout = $('cone-readout');
  const sectionReadout = $('section-readout');
  const tourReadout = $('tour-readout');
  const conicReadout = $('conic-readout');
  const buildReadout = $('build-readout');
  const tourChips = $('tour-chips');
  const predictChips = $('predict-chips');
  const predictStatus = $('predict-status');
  const btnPlayBuild = $('btn-play-build');
  const btnDealCut = $('btn-deal-cut');

  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset.closest('.card__nav');

  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  /** Reflect one STORED value into its slider + numeric field + SR value text. */
  function setPair(cfg, value) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    if (!range || !num) return;
    const shown = value * cfg.scale;
    range.value = String(shown);
    num.value = fmt(shown, cfg.decimals);
    range.setAttribute('aria-valuetext', `${fmt(shown, cfg.decimals)} ${cfg.unitWord}`.trim());
  }

  /**
   * Wire one slider + numeric field pair against a commit function. Shared by all three
   * state bags so the two-way sync, the clamp and the revert-with-a-nudge behave
   * identically everywhere.
   *
   * @param {object} cfg                       A slider descriptor.
   * @param {(value:number) => void} commit    Called with the STORED value.
   * @param {() => number} read                The current stored value (for the revert).
   */
  function wirePair(cfg, commit, read) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    if (!range || !num) return;

    range.addEventListener('input', () => {
      const value = clamp(parseFloat(range.value), cfg.min, cfg.max) / cfg.scale;
      setPair(cfg, value);
      commit(value);
    }, listen);

    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value); // in the display unit
      if (Number.isFinite(parsed)) {
        const value = clamp(parsed, cfg.min, cfg.max) / cfg.scale;
        setPair(cfg, value);
        commit(value);
      } else {
        // Invalid entry reverts, with a visible nudge naming what was kept.
        const last = read();
        setPair(cfg, last);
        const kept = `${fmt(last * cfg.scale, cfg.decimals)} ${cfg.unitWord}`.trim();
        sim.flowNote(`Kept ${kept}`);
        sim.announce(`Kept your last value, ${kept}.`);
      }
    }, listen);
  }

  // --- Step 1: the cone ---------------------------------------------------------------
  for (const cfg of CONE_SLIDERS) {
    wirePair(cfg,
      (value) => sim.commit({ [cfg.key]: value }),
      () => sim.state()?.[cfg.key] ?? 0);
  }

  tglNappes?.addEventListener('change', () => {
    sim.commitNappes(tglNappes.checked);
    sim.announce(tglNappes.checked
      ? 'Both halves shown. The surface carries on past the tip in the other direction.'
      : 'Second half hidden.');
  }, listen);

  // --- Step 2/3: the cut ---------------------------------------------------------------
  for (const cfg of SECTION_SLIDERS) {
    wirePair(cfg,
      (value) => sim.commitSection({ [cfg.key]: value }),
      () => sim.sectionState()[cfg.key]);
  }

  // --- Step 3: the six named cuts -------------------------------------------------------
  // Rendered from the data layer, so the chips can never drift from the six cases §6.1
  // defines. Pressing one hands off to main.js, which travels the plane there.
  const tour = sim.sectionTour();
  if (tourChips) {
    for (const cut of tour) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tour-chip';
      chip.dataset.cut = cut.key;
      chip.textContent = cut.name;
      chip.setAttribute('aria-pressed', 'false');
      chip.title = cut.how;
      tourChips.appendChild(chip);
    }
    tourChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cut]');
      if (chip) sim.tourCut(chip.dataset.cut);
    }, listen);
  }

  // --- Step 4: the ratio, the comparison, the vocabulary --------------------------------
  for (const cfg of CONIC_SLIDERS) {
    wirePair(cfg,
      (value) => sim.commitConic({ [cfg.key]: value }),
      () => sim.conicState()[cfg.key]);
  }

  tglShowAll?.addEventListener('change', () => {
    sim.commitConic({ showAll: tglShowAll.checked });
    sim.announce(tglShowAll.checked
      ? 'All three curves drawn from the same fixed point and line.'
      : 'Showing your curve alone.');
  }, listen);

  tglShowNames?.addEventListener('change', () => {
    sim.commitConic({ showNames: tglShowNames.checked });
    sim.announce(tglShowNames.checked
      ? 'The engineering names are on the drawing.'
      : 'Names hidden — just the curve and its two distances.');
  }, listen);

  tglTangent?.addEventListener('change', () => {
    sim.commitConic({ showTangent: tglTangent.checked });
    sim.announce(tglTangent.checked ? 'Tangent and normal drawn at P.' : 'Tangent and normal hidden.');
  }, listen);

  // --- Step 5: the construction ---------------------------------------------------------
  btnPlayBuild?.addEventListener('click', () => sim.playConstruction(), listen);

  methodSelect?.addEventListener('change', () => {
    sim.commitConic({ method: methodSelect.value });
    sim.announce(`Construction set to ${methodSelect.selectedOptions[0].textContent}.`);
  }, listen);

  for (const dim of METHOD_DIMS) {
    const range = $(dim.range);
    const num = $(dim.num);
    if (!range || !num) continue;

    const spec = () => methodById(sim.conicState().method)?.[dim.key];

    range.addEventListener('input', () => {
      const s = spec();
      if (!s) return;
      const value = clamp(parseFloat(range.value), s.min, s.max);
      num.value = String(value);
      range.setAttribute('aria-valuetext', `${value} ${s.unit === '°' ? 'degrees' : 'millimetres'}`);
      sim.commitConic({ [dim.key]: value });
    }, listen);

    num.addEventListener('change', () => {
      const s = spec();
      if (!s) return;
      const parsed = parseNumeric(num.value);
      if (Number.isFinite(parsed)) {
        const value = clamp(parsed, s.min, s.max);
        range.value = String(value);
        num.value = String(value);
        sim.commitConic({ [dim.key]: value });
      } else {
        const last = sim.conicState()[dim.key];
        num.value = String(last);
        sim.flowNote(`Kept ${last} ${s.unit}`);
        sim.announce(`Kept your last value, ${last} ${s.unit === '°' ? 'degrees' : 'millimetres'}.`);
      }
    }, listen);
  }

  // --- Step 6: predict, then verify -----------------------------------------------------
  if (predictChips) {
    for (const cut of tour) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tour-chip';
      chip.dataset.answer = cut.key;
      chip.textContent = cut.name;
      predictChips.appendChild(chip);
    }
    predictChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-answer]');
      if (chip) sim.answerPrediction(chip.dataset.answer);
    }, listen);
  }
  btnDealCut?.addEventListener('click', () => sim.dealPrediction(), listen);

  // --- Reset: guarded by an inline two-state confirm so a stray click can't wipe the
  //     work. The confirm guards the BUTTON only; simAPI.reset() stays the single reset
  //     path (CLAUDE.md), fired solely by a deliberate "Yes". Kept from the Module 2 dock.
  let resetArmed = false;

  /** Swap the ghost Reset for the inline confirm; focus the safe option (Cancel). */
  function armReset() {
    if (resetArmed) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel.focus();
    sim.announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }

  /** Return to the idle ghost Reset. */
  function disarmReset({ returnFocus = false } = {}) {
    if (!resetArmed) return;
    resetArmed = false;
    resetConfirm.hidden = true;
    btnReset.hidden = false;
    cardNav?.classList.remove('is-reset-armed');
    if (returnFocus) btnReset.focus();
  }

  btnReset.addEventListener('click', armReset, listen);
  btnResetYes.addEventListener('click', () => {
    disarmReset({ returnFocus: true }); // tidy the control to idle before resetting
    sim.reset();                        // the one reset path; re-syncs + announces
  }, listen);
  btnResetCancel.addEventListener('click', () => {
    disarmReset({ returnFocus: true });
    sim.announce('Reset cancelled.');
  }, listen);

  // Escape backs out (matches the term-popover convention in terms.js).
  resetConfirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      disarmReset({ returnFocus: true });
      sim.announce('Reset cancelled.');
    }
  }, listen);

  // Tabbing or clicking outside the armed confirm abandons it (nothing is lost).
  resetConfirm.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && !resetConfirm.contains(e.target)) disarmReset();
  }, listen);

  /** Re-label and re-range Step 5's dimension fields for the current method. The general
   *  construction is given no dimensions at all, so all three fields drop out for it. */
  function syncMethodDims(conic) {
    const method = methodById(conic.method);
    for (const dim of METHOD_DIMS) {
      const spec = method?.[dim.key];
      const field = $(dim.field);
      if (field) field.hidden = !spec;
      if (!spec) continue;
      const range = $(dim.range);
      const num = $(dim.num);
      const labelEl = $(dim.label);
      if (labelEl) labelEl.textContent = `${spec.label} (${spec.unit})`;
      if (range) {
        range.min = String(spec.min);
        range.max = String(spec.max);
        range.step = String(spec.step);
        range.value = String(conic[dim.key]);
        range.setAttribute('aria-valuetext',
          `${conic[dim.key]} ${spec.unit === '°' ? 'degrees' : 'millimetres'}`);
      }
      if (num) {
        num.value = String(conic[dim.key]);
        num.setAttribute('aria-label', `${spec.label}, exact value`);
      }
    }
    // Playing the construction stage by stage only means anything for the general
    // construction; the other eleven are drawn whole.
    const general = conic.method === sim.ECCENTRICITY_METHOD;
    if (btnPlayBuild) btnPlayBuild.hidden = !general;
    if (buildReadout) buildReadout.hidden = !general;
    const points = $('fld-points');
    if (points) points.hidden = !general && !method;
  }

  /** Full refresh from current state — initial load, every commit, and reset. */
  function syncAll() {
    const cone = sim.state();
    const sec = sim.sectionState();
    const conic = sim.conicState();
    const step = sim.stage();
    const info = sim.sectionInfo();

    if (cone) for (const cfg of CONE_SLIDERS) setPair(cfg, cone[cfg.key]);
    if (tglNappes) tglNappes.checked = sim.showUpperNappe();

    for (const cfg of SECTION_SLIDERS) setPair(cfg, sec[cfg.key]);
    // "Slide it past the tip" is the control the apex cut needs, and nothing before it
    // does — so Step 3 is where it appears.
    const offsetField = $('fld-sec-offset');
    if (offsetField) offsetField.hidden = step < 3;

    for (const cfg of CONIC_SLIDERS) setPair(cfg, conic[cfg.key]);
    if (tglShowAll) tglShowAll.checked = conic.showAll;
    if (tglShowNames) tglShowNames.checked = conic.showNames;
    if (tglTangent) tglTangent.checked = conic.showTangent;
    if (methodSelect) methodSelect.value = conic.method;
    syncMethodDims(conic);

    // --- The readouts. Each one says what is on screen in everyday words; the textbook
    //     statement arrives with the name, and never before it (ADR-086). ---
    if (coneReadout) {
      coneReadout.textContent = `Its sloping side sits ${info.generatorDeg.toFixed(0)}° from the table.`;
    }
    if (sectionReadout) {
      const quiz = sim.predictionState();
      const hideName = step >= 6 && quiz.answer !== null && quiz.chosen === null;
      sectionReadout.textContent = hideName
        ? 'Look at the cut, then name it below.'
        : (step < 3 ? info.seen : `${info.name} — ${info.seen}`)
          + (info.cuts ? '' : ' (The plane is clear of the cone just now.)');
    }
    if (tourReadout) {
      // Empty until the step that earns it — an empty wash bar is chrome with nothing to say.
      tourReadout.hidden = step < 3;
      tourReadout.textContent = step >= 3 ? `Section plane ${info.letter} · ${info.rule}` : '';
    }
    if (conicReadout) {
      const curve = sim.curveForEccentricity(conic.e);
      const says = curve === 'Parabola'
        ? 'exactly 1 — the curve just fails to close'
        : curve === 'Ellipse'
          ? 'less than 1 — the curve closes on itself'
          : 'more than 1 — the curve escapes, in two branches';
      conicReadout.textContent = `PF ÷ PQ = ${conic.e.toFixed(2)}: ${says}. That is ${curve === 'Ellipse' ? 'an' : 'a'} ${curve.toLowerCase()}.`;
    }
    if (buildReadout && !buildReadout.hidden) {
      const stages = sim.buildStages();
      const current = stages[Math.min(conic.buildStage, stages.length - 1)];
      buildReadout.textContent = `${current.index + 1} of ${stages.length} · ${current.label} — ${current.say}`;
    }

    // --- Step 6's verdict. The chips carry the mark, the status line carries the words
    //     and the running score; colour is never the only cue. ---
    const quiz = sim.predictionState();
    if (predictChips) {
      for (const chip of predictChips.querySelectorAll('[data-answer]')) {
        const isChosen = quiz.chosen === chip.dataset.answer;
        const isTruth = quiz.chosen !== null && info.key === chip.dataset.answer;
        chip.classList.toggle('is-right', isTruth);
        chip.classList.toggle('is-wrong', isChosen && !isTruth);
        chip.disabled = quiz.answer === null || quiz.chosen !== null;
      }
    }
    if (predictStatus) {
      const CHECK = '<svg class="match-status__icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
        + '<path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const right = quiz.chosen !== null && quiz.chosen === info.key;
      predictStatus.classList.toggle('match-status--ok', right);
      if (quiz.answer === null) {
        predictStatus.innerHTML = '<span>Press “Set up a cut” to begin.</span>';
      } else if (quiz.chosen === null) {
        predictStatus.innerHTML = '<span>Name the cut. Take your time — turn the view first.</span>';
      } else {
        predictStatus.innerHTML = (right ? CHECK : '')
          + `<span>${right ? 'Correct' : `Not this time — it is ${info.name}`}. ${info.rule}`
          + ` (${quiz.right} of ${quiz.asked} right.)</span>`;
      }
    }
  }

  syncAll();

  return { sync: syncAll, dispose: () => ac.abort() };
}
