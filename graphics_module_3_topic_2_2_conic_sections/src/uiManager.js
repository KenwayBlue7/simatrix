// Parameter dock controller — Conic Sections.
//
// One group per guided step, and NOTHING in a group that does not serve that step's own
// question (ADR-141). The dock is deliberately smaller than the topic's state:
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

import { methodById, methodInfo, methodsByTier, defaultMethodFor, defaultEccentricityFor,
  controlsFor } from './conicData.js';

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
 * @property {() => boolean} buildPlayed                Has the construction been played yet?
 * @property {() => void} playConstruction              Draw the construction stage by stage.
 * @property {() => boolean} buildPaused                 Is that playback paused?
 * @property {() => void} toggleBuildPause               Hold it where it stands, or resume.
 * @property {() => Array<{index:number, label:string, say:string}>} proofStages
 * @property {() => number} proofStage                  Which stage of Step 4's proof is showing.
 * @property {() => boolean} proofBusy                  Is that stage still animating?
 * @property {(i:number, opts?:{animate?:boolean}) => void} setProofStage
 * @property {() => boolean} hasFocalSphere             Does this cut have a focal sphere?
 * @property {() => Array<{label:string, value:number, unit:string, from:string}>} sheetResults
 * @property {() => Array<{term:string, say:string, item:object}>} sheetTerms
 * @property {(term:string|null) => void} highlightTerm     Light one up on the sheet.
 * @property {() => boolean} sheetFollowsCut            Is the sheet locked to the 3-D cut?
 * @property {() => number} cutEccentricity             e of the LIVE cut, unclamped.
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
 * straight through at scale 1 (ADR-138).
 */
const CONE_SLIDERS = [
  { key: 'baseLength', range: 'rng-base',   num: 'num-base',   min: 20, max: 60, decimals: 0, unitWord: 'millimetres', scale: 10 },
  { key: 'height',     range: 'rng-height', num: 'num-height', min: 15, max: 45, decimals: 0, unitWord: 'millimetres', scale: 10 },
];

/**
 * The cutting plane. `angleDeg` carries TWO slider pairs: Step 2's, where the learner meets
 * the cut, and Step 4's, where the same tilt is the driver of "why is this curve different".
 * One state, two views of it — `setPair` writes both on every sync, so they can never drift.
 */
const SECTION_SLIDERS = [
  { key: 'angleDeg', range: 'rng-sec-angle',  num: 'num-sec-angle',  min: 0,   max: 90, decimals: 0, unitWord: 'degrees',    scale: 1 },
  { key: 'angleDeg', range: 'rng-cut-tilt',   num: 'num-cut-tilt',   min: 0,   max: 90, decimals: 0, unitWord: 'degrees',    scale: 1 },
  { key: 'offset',   range: 'rng-sec-offset', num: 'num-sec-offset', min: -40, max: 40, decimals: 0, unitWord: 'millimetres', scale: 10 },
];

const CONIC_SLIDERS = [
  { key: 'e',      range: 'rng-ecc',    num: 'num-ecc',    min: 0.2, max: 2.5, decimals: 2, unitWord: '',         scale: 1 },
  { key: 'fa',     range: 'rng-fa',     num: 'num-fa',     min: 20,  max: 90,  decimals: 0, unitWord: 'millimetres', scale: 1 },
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
  const tglCut = $('tgl-cut');
  const tglConstruction = $('tgl-construction');
  const btnProofPrev = $('btn-proof-prev');
  const btnProofNext = $('btn-proof-next');
  // The wizard's own Next belongs to stepper.js, which owns its `hidden` state and never touches
  // its classes. Its EMPHASIS has to follow the proof, though, and only this module syncs on
  // every state change — so the accent is settled here and the two never fight.
  const btnNext = $('btn-next');
  const proofStageEl = $('proof-stage');
  const proofReadout = $('proof-readout');
  const measureGroup = $('measure-group');
  const measureList = $('measure-list');
  const propsGroup = $('props-group');
  const propsReadout = $('props-readout');
  const btnProps = $('btn-props');
  const curvePicker = $('curve-picker');
  const termsPanel = $('terms-panel');
  const termsList = $('terms-list');
  const methodBadge = $('method-badge');
  const methodInfoList = $('method-info');
  const btnPauseBuild = $('btn-pause-build');
  const btnBuildPrev = $('btn-build-prev');
  const btnBuildNext = $('btn-build-next');
  const buildNav = $('build-nav');
  const hintLocusTerms = $('hint-locus-terms');
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

  // The reference topic's cut toggle: the plane is placed first, and the learner decides
  // when it bites. Unticked, tilting and sliding still move the plane — they are how you
  // AIM it — so the control that does nothing yet is never on screen.
  tglCut?.addEventListener('change', () => {
    sim.commitSection({ cut: tglCut.checked });
    sim.announce(tglCut.checked
      ? 'The plane cuts the cone. The red face is the section.'
      : 'The cone is whole again. The plane is still there, ready to cut.');
  }, listen);

  // --- Step 3: the six named cuts -------------------------------------------------------
  // Rendered from the data layer, so the chips can never drift from the six cases §6.1
  // defines. Pressing one hands off to main.js, which travels the plane there.
  const tour = sim.sectionTour();
  // CHANGE 1 (ADR-107) — Step 4 offers the four NAMED conics from the same catalogue and
  // through the same `sim.tourCut()` call Step 3 uses. Step 3 lists all six of §6.1's sections
  // because its question is "what cuts are there"; Step 4 asks why these four have the names
  // they do, so the degenerate two are not on it.
  const whyChips = $('why-chips');
  if (whyChips) {
    for (const cut of tour.filter((c) => ['Circle', 'Ellipse', 'Parabola', 'Hyperbola'].includes(c.key))) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tour-chip';
      chip.dataset.cut = cut.key;
      chip.textContent = cut.name;
      chip.setAttribute('aria-pressed', 'false');
      chip.title = cut.how;
      whyChips.appendChild(chip);
    }
    whyChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-cut]');
      if (chip) sim.tourCut(chip.dataset.cut);
    }, listen);
  }

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

  // --- Step 4: the staged answer ---------------------------------------------------------
  // The proof is walked by hand: one press, one idea (ADR-095). Next is refused while the
  // current stage is still animating, so nothing can be skipped past half-drawn.
  btnProofPrev?.addEventListener('click',
    () => sim.setProofStage(sim.proofStage() - 1, { animate: false }), listen);
  btnProofNext?.addEventListener('click', () => {
    if (!sim.proofBusy()) sim.setProofStage(sim.proofStage() + 1);
  }, listen);
  btnProps?.addEventListener('click', () => sim.playParabolaProps(), listen);

  // --- Step 5: the construction ---------------------------------------------------------
  // CHANGE 2 — three buttons, one per curve. Choosing one moves to that curve's FIRST syllabus
  // construction where it has one, so a Diploma student lands on what they are examined on.
  // The hyperbola is not offered for CONSTRUCTION (ADR-115): Course 1003 Module II teaches it as
  // a section of the cone, which Steps 1–4 still do in full, and does not ask for it to be drawn.
  for (const curve of ['Ellipse', 'Parabola']) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.curve = curve;
    b.textContent = curve;
    b.addEventListener('click', () => {
      // The 3-D beside the drawing is a REFERENCE: it has to be showing the curve being drawn,
      // or it is a picture of something else (ADR-108). Aiming the plane does NOT re-couple the
      // sheet to the cut — from Step 5 the drawing keeps its own given dimensions.
      sim.tourCut(curve);
      const method = defaultMethodFor(curve);
      // The general construction has no curve of its own — which one it draws is read back off
      // `e` — so the eccentricity has to travel with the request or the curve snaps back.
      const partial = { curve, method };
      if (method === sim.ECCENTRICITY_METHOD) partial.e = defaultEccentricityFor(curve);
      sim.commitConic(partial);
    }, listen);
    curvePicker?.append(b);
  }

  /**
   * Rebuild the construction list for one curve: the syllabus tier first under its own
   * heading, then everything else (CHANGE 3). Rebuilt only when the curve changes — a `<select>`
   * rebuilt on every sync would drop the keyboard focus mid-choice.
   */
  function syncMethodList(curve) {
    if (!methodSelect || methodSelect.dataset.curve === curve) return;
    methodSelect.dataset.curve = curve;
    const { syllabus, additional } = methodsByTier(curve);
    const group = (label, list) => {
      if (list.length === 0) return null;
      const g = document.createElement('optgroup');
      g.label = label;
      for (const m of list) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.label;
        g.append(o);
      }
      return g;
    };
    methodSelect.replaceChildren(...[
      // No icon on the heading (ADR-115). An `<optgroup>` label is already typographically
      // distinct from its options; a star in front of it read as decoration on a control.
      group('Required by the Diploma syllabus', syllabus),
      group('Additional methods', additional),
    ].filter(Boolean));
  }

  btnPlayBuild?.addEventListener('click', () => sim.playConstruction(), listen);
  btnPauseBuild?.addEventListener('click', () => sim.toggleBuildPause(), listen);

  /** Step one stage of the construction by hand, in either direction. */
  const stepBuild = (delta) => {
    const stages = sim.buildStages();
    const next = clamp(sim.conicState().buildStage + delta, 0, stages.length - 1);
    sim.commitConic({ buildStage: next });
    sim.announce(`${next + 1} of ${stages.length}. ${stages[next].say}`);
    // Autoplay writes the stage caption over the cone; stepping by hand did not, so the note
    // sat there describing a stage the learner had left. Same narration, either way in.
    sim.flowNote(stages[next].say);
  };
  btnBuildPrev?.addEventListener('click', () => stepBuild(-1), listen);
  btnBuildNext?.addEventListener('click', () => stepBuild(1), listen);

  tglConstruction?.addEventListener('change', () => {
    sim.commitConic({ showConstruction: tglConstruction.checked });
    sim.announce(tglConstruction.checked
      ? 'Construction lines shown.'
      : 'Construction lines hidden — just the finished drawing.');
  }, listen);

  methodSelect?.addEventListener('change', () => {
    // The list holds one curve's constructions at a time (CHANGE 3), so a value set from
    // outside it leaves the select empty. Ignore that rather than reading `selectedOptions[0]`
    // off nothing — which threw.
    const chosen = methodSelect.selectedOptions[0];
    if (!chosen) return;
    sim.commitConic({ method: methodSelect.value });
    sim.announce(`Construction set to ${chosen.textContent}.`);
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
      // A unitless field (a count) must not read "No. of equal divisions ()".
      if (labelEl) labelEl.textContent = spec.unit ? `${spec.label} (${spec.unit})` : spec.label;
      if (range) {
        range.min = String(spec.min);
        range.max = String(spec.max);
        range.step = String(spec.step);
        range.value = String(conic[dim.key]);
        range.setAttribute('aria-valuetext', `${conic[dim.key]} ${
          spec.unit === '°' ? 'degrees' : spec.unit === 'mm' ? 'millimetres' : 'equal parts'}`);
      }
      if (num) {
        num.value = String(conic[dim.key]);
        num.setAttribute('aria-label', `${spec.label}, exact value`);
      }
    }
    // The playback belongs to any construction that HAS stages — the focus-directrix method
    // and the three the syllabus names (ADR-098). The other nine draw whole, and their controls
    // are absent rather than dead.
    const stages = sim.buildStages();
    const staged = stages.length > 0;
    if (btnPlayBuild) btnPlayBuild.hidden = !staged;
    // Pause appears once there is something running to pause, and says which way it will go.
    if (btnPauseBuild) {
      btnPauseBuild.hidden = !staged;
      btnPauseBuild.disabled = !sim.buildPlayed();
      btnPauseBuild.textContent = sim.buildPaused() ? 'Resume' : 'Pause';
    }
    if (buildNav) buildNav.hidden = !staged;
    if (buildReadout) buildReadout.hidden = !staged;
    if (btnBuildPrev) btnBuildPrev.disabled = conic.buildStage <= 0;
    if (btnBuildNext) btnBuildNext.disabled = conic.buildStage >= stages.length - 1;
    // The shared "points plotted" slider appears only where a construction actually READS it
    // (ADR-113). The oblong, parallelogram, concentric, four-centre and offset methods fix their
    // own division count, and the tangent method carries its own field — for all of them this
    // slider moved nothing, which is worse than not offering it.
    const points = $('fld-points');
    if (points) points.hidden = !controlsFor(conic.method).points;
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
    if (tglCut) tglCut.checked = sec.cut;
    // "Slide it past the tip" is the control the apex cut needs, and nothing before it
    // does — so Step 3 is where it appears.
    const offsetField = $('fld-sec-offset');
    if (offsetField) offsetField.hidden = step < 3;

    for (const cfg of CONIC_SLIDERS) setPair(cfg, conic[cfg.key]);
    if (tglShowAll) tglShowAll.checked = conic.showAll;
    if (tglShowNames) tglShowNames.checked = conic.showNames;
    if (tglTangent) tglTangent.checked = conic.showTangent;
    if (tglConstruction) tglConstruction.checked = conic.showConstruction !== false;
    syncMethodList(conic.curve);
    if (methodSelect) methodSelect.value = conic.method;
    for (const b of curvePicker?.querySelectorAll('[data-curve]') ?? []) {
      b.setAttribute('aria-checked', String(b.dataset.curve === conic.curve));
    }
    syncMethodDims(conic);

    // Steps 1-4 keep the sheet locked to the 3-D cut, so its eccentricity is a READING, not
    // a dial; from Step 5 the learner is drawing from given data and both quantities are
    // theirs (ADR-088). The fields are simply absent while they would be inert.
    // …and from Step 5 they belong to the FOCUS-DIRECTRIX construction alone (ADR-102). The
    // other twelve are dimensioned by their own sliders and never read e or the focal distance,
    // so leaving them on screen offered two controls that did nothing.
    const owned = !sim.sheetFollowsCut();
    const uses = controlsFor(conic.method);
    for (const id of ['fld-ecc', 'fld-fa']) {
      const field = $(id);
      if (field) field.hidden = !owned || (step >= 5 && !uses.eccentricity);
    }
    // Likewise the marked point and its tangent: seven of the thirteen never draw one.
    for (const id of ['fld-point', 'fld-tangent']) {
      const field = $(id);
      if (field) field.hidden = step >= 5 && !uses.tangent;
    }

    // --- The readouts. Each one says what is on screen in everyday words; the textbook
    //     statement arrives with the name, and never before it (ADR-141). ---
    if (coneReadout) {
      coneReadout.textContent = `Its sloping side sits ${info.generatorDeg.toFixed(0)}° from the table.`;
    }
    if (sectionReadout) {
      const quiz = sim.predictionState();
      const hideName = step >= 6 && quiz.answer !== null && quiz.chosen === null;
      if (!sec.cut) {
        // Nothing has been cut yet, so there is no cut face to describe — say what the plane
        // WOULD do, which is what makes ticking the box worth doing.
        sectionReadout.textContent = hideName
          ? 'Tick “Cut the cone”, then name what you see.'
          : `Tick “Cut the cone” and this plane will leave ${step < 3 ? 'a shape like this: ' + info.seen : info.name.toLowerCase() + ' — ' + info.seen}`;
      } else {
        // A two-branch curve named while only one nappe was reached: the rule is about the
        // infinite cone, the model is finite. Say where the missing branch went instead of
        // promising one that is not on screen.
        const twoBranches = info.key === 'Hyperbola' || info.key === 'RectangularHyperbola';
        const oneBranchOnly = info.cuts && twoBranches && info.nappesCut < 2 && sim.showUpperNappe();
        sectionReadout.textContent = hideName
          ? 'Look at the cut, then name it below.'
          : (step < 3 ? info.seen : `${info.name} — ${info.seen}`)
            + (info.cuts ? '' : ' (The plane is clear of the cone just now.)')
            + (oneBranchOnly ? ' On this cone only one branch is reached — slide the cut nearer the tip to catch the second.' : '');
      }
    }
    if (tourReadout) {
      // Empty until the step that earns it — an empty wash bar is chrome with nothing to say.
      // Step 3 is where a cut is NAMED, so the name leads and the chapter's own wording
      // follows it; the plane's letter is the label, not the headline.
      tourReadout.hidden = step < 3;
      tourReadout.textContent = step >= 3
        ? `${info.name} (section plane ${info.letter}). ${info.rule}`
        : '';
    }
    if (conicReadout) {
      const kind = conic.cutKind ?? 'conic';
      if (sim.sheetFollowsCut() && kind !== 'conic') {
        // §6.1's three non-conic sections. The sheet is drawing one of them, so the readout
        // must be talking about the same thing — a ratio quoted here for a cut that has none
        // is the contradiction this branch exists to prevent (ADR-090).
        conicReadout.textContent = kind === 'circle'
          ? `A circle, ${(2 * (conic.cutA ?? 0)).toFixed(0)} mm across. Every point of it is the same distance from the centre, so there is nothing to compare — the ratio is 0. It is the one conic with no directrix.`
          : kind === 'triangle'
            ? 'This cut goes through the tip of the cone, so it is not a curve at all: two straight sides and the base between them. Slide the cut off the tip to get a curve back.'
            : 'The plane is clear of the cone — there is no section to draw. Slide it back until it cuts.';
      } else if (sim.sheetFollowsCut()) {
        // The answer to "why is THIS curve different", in the learner's own numbers: the
        // ratio is the tilt of their cut measured against the slope of their own cone.
        const ratio = sim.cutEccentricity();
        const says = ratio < 0.02
          ? 'The cut is flat, square across the cone: the ratio is 0 and the curve closes into a circle — the limiting case.'
          : Math.abs(ratio - 1) < 0.02
            ? 'Exactly 1: the cut is parallel to the cone’s own side, so the curve just fails to close.'
            : ratio < 1
              ? 'Less than 1: the cut is flatter than the cone’s side, so it comes back round and closes.'
              : 'More than 1: the cut is steeper than the cone’s side, so it runs off the cone instead of closing.';
        conicReadout.textContent =
          `Your cut: ${sec.angleDeg.toFixed(0)}° against a side that slopes ${info.generatorDeg.toFixed(0)}°`
          + ` — the ratio is ${ratio.toFixed(2)}. ${says}`;
      } else {
        const curve = sim.curveForEccentricity(conic.e);
        const says = curve === 'Parabola'
          ? 'exactly 1 — the curve just fails to close'
          : curve === 'Ellipse'
            ? 'less than 1 — the curve closes on itself'
            : 'more than 1 — the curve escapes, in two branches';
        conicReadout.textContent = `PF ÷ PQ = ${conic.e.toFixed(2)}: ${says}. That is ${curve === 'Ellipse' ? 'an' : 'a'} ${curve.toLowerCase()}.`;
      }
    }

    // CHANGE 4/5 (ADR-107) — the live eccentricity and the sentence that belongs to it. The
    // number is the REAL one for the cut on the bench, not a value looked up from the name:
    // `cutEccentricity()` is the chapter's own e = sin θ ÷ sin g (ADR-088).
    {
      const kind = conic.cutKind ?? 'conic';
      const follows = sim.sheetFollowsCut();
      const e = follows ? sim.cutEccentricity() : conic.e;
      // Which of the four the cut is in comes from the SAME classifier the rest of the topic
      // uses (`classifySection`, with its 0.5° tolerance), never from a threshold invented here
      // — otherwise the badge could name one curve while the readout beside it named another.
      // A rectangular hyperbola is a hyperbola; the apex cut is no curve at all.
      const band = kind === 'triangle' || kind === 'none' ? null
        : follows
          ? (info.key === 'IsoscelesTriangle' ? null
            : info.key === 'RectangularHyperbola' ? 'Hyperbola' : info.key)
          : sim.curveForEccentricity(e);

      const eccValue = $('ecc-value');
      if (eccValue) eccValue.textContent = band === null ? '—' : e.toFixed(2);
      const eccCurve = $('ecc-curve');
      if (eccCurve) eccCurve.textContent = band ?? 'not a curve';

      const WHY = {
        Circle: 'The cutting plane is horizontal, so every point of the section stays the same distance from the centre. Nothing varies, and e is 0.',
        Ellipse: 'The plane is tilted, but not as steeply as the cone’s own side, so it comes back round and the curve closes. e stays between 0 and 1.',
        Parabola: 'The plane is exactly parallel to one side of the cone. The curve never closes — and that is the single value e = 1.',
        Hyperbola: 'The plane is steeper than the cone’s side, so it reaches the second half of the cone and the section comes in two separate branches. e is more than 1.',
      };
      const eccWhy = $('ecc-why');
      if (eccWhy) {
        eccWhy.textContent = band === null
          ? 'This cut passes through the tip, so there is no curve to measure — and no eccentricity.'
          : WHY[band];
      }
      for (const row of $('ecc-table')?.querySelectorAll('[data-curve]') ?? []) {
        row.dataset.here = String(row.dataset.curve === band);
      }
      // Both chip rows show which named cut is live — one loop, both groups.
      for (const chip of document.querySelectorAll('#why-chips [data-cut], #tour-chips [data-cut]')) {
        chip.setAttribute('aria-pressed', String(follows && chip.dataset.cut === info.key));
      }
    }

    // Step 4's staged answer: which piece is on the sheet, and the terminology held back
    // until every piece it names is there (RULES.md §6.31).
    // Step 4's proof: where the learner is, what just happened, and whether they may move on.
    {
      const stages = sim.proofStages();
      const at = sim.proofStage();
      const current = stages[Math.min(at, stages.length - 1)];
      const busy = sim.proofBusy();
      if (proofStageEl) {
        // Two parts, one line: the counter is a label and keeps the uppercase treatment, the
        // stage name is a title and is set in sentence case beside it. `textContent` still reads
        // exactly as it did, which is what the proof oracles match on.
        const count = document.createElement('span');
        count.className = 'proof-stage__count';
        count.textContent = `Stage ${at + 1} of ${stages.length}`;
        const name = document.createElement('span');
        name.className = 'proof-stage__name';
        name.textContent = current.label;
        proofStageEl.replaceChildren(count, document.createTextNode(' · '), name);
      }
      if (proofReadout) proofReadout.textContent = current.say;
      if (btnProofPrev) btnProofPrev.disabled = at <= 0;
      const proofDone = at >= stages.length - 1;
      if (btnProofNext) {
        btnProofNext.disabled = busy || proofDone;
        btnProofNext.textContent = proofDone ? 'Proof complete' : 'Next \u203a';
        // Once it reads "Proof complete" it is a status, not an action, so it hands the accent
        // back rather than sitting there as a disabled blue button beside a live one.
        btnProofNext.classList.toggle('btn--primary', !proofDone);
      }
      // ONE loud action per step (DESIGN.md \u00a75.1). Step 4 had two: the proof's "Next \u203a" and the
      // wizard's "Next", identical blue fills a few hundred pixels apart doing entirely different
      // things \u2014 one walks a stage of the proof, the other leaves the step and abandons it. While
      // the proof is unwalked it IS the step's action, so it keeps the accent and the wizard's
      // Next drops to the secondary treatment; once the proof is complete the loud action becomes
      // moving on, and the accent follows it there. Scoped to Step 4: every other step has one
      // Next, and it stays primary.
      if (btnNext) {
        const stepFour = sim.stage?.() === 4;
        btnNext.classList.toggle('btn--primary', !stepFour || proofDone);
      }
    }
    if (hintLocusTerms) {
      // The vocabulary block names the focus, the directrix and the eccentricity — so it stays
      // shut for a cut that produced none of them, and until the proof has produced both.
      const namesApply = (conic.cutKind ?? 'conic') === 'conic';
      hintLocusTerms.hidden = !namesApply || sim.proofStage() < sim.proofStages().length - 1;
    }
    if (buildReadout && !buildReadout.hidden) {
      // The sheet opens on the construction's GIVEN DATA (ADR-118) — the frame a learner would
      // have on the paper before the first step. Before they have played it there is no stage to
      // be on, so the readout says what is in front of them and what the button will do, rather
      // than narrating a step that never happened.
      if (!sim.buildPlayed()) {
        buildReadout.textContent = 'The given data is set out, ready to construct from. Press the button to draw it one line at a time.';
      } else {
        const played = sim.buildStages();
        const current = played[Math.min(conic.buildStage, played.length - 1)];
        buildReadout.textContent = `${current.index + 1} of ${played.length} · ${current.label} — ${current.say}`;
      }
    }

    // §6.6's properties belong to the parabola, so the control appears when one is on the
    // sheet and not otherwise — the same rule every other control in this topic follows.
    if (propsGroup) propsGroup.hidden = conic.curve !== 'Parabola';
    // A TOGGLE (ADR-116). It says which way it will go, so a learner can always get the
    // construction back — pressing it again restores the drawing exactly as it was.
    if (btnProps) {
      btnProps.setAttribute('aria-pressed', String(!!conic.propsOpen));
      btnProps.textContent = conic.propsOpen
        ? 'Back to the construction'
        : 'Show its three properties';
    }
    if (propsReadout) {
      const stages = sim.propStages();
      propsReadout.hidden = !conic.propsOpen;
      if (conic.propsOpen) {
        const current = stages[Math.min(conic.propStage ?? 0, stages.length - 1)];
        propsReadout.textContent = `${current.index + 1} of ${stages.length} · ${current.label} — ${current.say}`;
      }
    }

    // Engineering Terms — rebuilt from whatever the sheet is drawing right now (ADR-098).
    // Hovering a term drives the same `sheetHover` the cursor drives, so the highlight logic
    // is not duplicated. Rebuilt wholesale: the list is short and changes with the drawing.
    if (termsPanel && termsList) {
      const terms = sim.sheetTerms();
      termsPanel.hidden = terms.length === 0;
      const signature = terms.map((t) => t.term).join('|');
      if (signature !== termsList.dataset.signature) {
        termsList.dataset.signature = signature;
        termsList.replaceChildren(...terms.map(({ term, say }) => {
          const li = document.createElement('li');
          li.tabIndex = 0;                       // the vocabulary must be reachable by keyboard
          const name = document.createElement('b');
          name.textContent = term;
          const sentence = document.createElement('span');
          sentence.textContent = say;
          li.append(name, sentence);
          const on = () => sim.highlightTerm(term);
          const off = () => sim.highlightTerm(null);
          li.addEventListener('pointerenter', on, listen);
          li.addEventListener('pointerleave', off, listen);
          li.addEventListener('focus', on, listen);
          li.addEventListener('blur', off, listen);
          return li;
        }));
      }
    }

    // The methodology card, and the badge that says whether this construction is examinable
    // (ADR-098). Both are pure reads of the catalogue — no state of their own.
    {
      const info = methodInfo(conic.method);
      if (methodBadge) {
        methodBadge.hidden = !info;
        if (info) {
          methodBadge.dataset.scope = info.syllabus ? 'required' : 'beyond';
          methodBadge.replaceChildren(
            document.createTextNode(info.syllabus
              ? '✓ Required by the syllabus'
              : '○ Beyond the syllabus'),
          );
          // `info.ref` (the textbook section) stays in the catalogue for traceability and is
          // deliberately NOT shown: "§6.5.1" tells a first-year student nothing, and the badge's
          // job is to say whether this construction is examinable.
        }
      }
      if (methodInfoList) {
        methodInfoList.hidden = !info;
        if (info) {
          const label = conic.method === sim.ECCENTRICITY_METHOD
            ? 'Focus & directrix (works for all three)'
            : methodById(conic.method)?.label ?? '';
          const rows = [
            ['Method', label],
            ['Purpose', info.purpose],
            ['How it works', info.principle],
            ['Instruments', info.instruments.join(' · ')],
            ['Output', info.output],
            ['Steps', `${info.steps} — ${sim.buildStages().length > 0 ? 'watch it drawn below' : 'drawn in one pass'}`],
            ['In the exam', info.syllabus
              ? 'Examinable — practise this one.'
              : 'Not examinable at Diploma level. Useful beyond it.'],
          ];
          methodInfoList.replaceChildren(...rows.map(([k, v]) => {
            const row = document.createElement('div');
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.textContent = v;
            row.append(dt, dd);
            return row;
          }));
        }
      }
    }

    // Everything the drawing on the sheet MEASURES (ADR-091). Rebuilt from scratch each sync:
    // the list is short, it changes with every construction, and a diffing pass would be more
    // code than the whole block. Values are quoted to one decimal — the precision a learner
    // can actually read off a drawing with a scale rule, not the precision of a float.
    if (measureGroup && measureList) {
      const results = sim.sheetResults();
      measureGroup.hidden = results.length === 0;
      if (results.length > 0) {
        measureList.replaceChildren(...results.map((r) => {
          const row = document.createElement('div');
          const dt = document.createElement('dt');
          dt.textContent = r.label;
          if (r.from) {
            const where = document.createElement('small');
            where.textContent = r.from;
            dt.append(where);
          }
          const dd = document.createElement('dd');
          const digits = r.unit === '' ? 3 : 1;
          dd.textContent = `${r.value.toFixed(digits)}${r.unit ? ` ${r.unit}` : ''}`;
          row.append(dt, dd);
          return row;
        }));
      }
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
