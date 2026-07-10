// Parameter dock controller — the bridge between the Point P controls and the
// orchestrator's commit()/rebuild() pipeline. Adapted from the Topic 2 sibling's
// uiManager (itself adapted from the master Module2/src/uiManager.js): the
// slider <-> numeric-input two-way sync (dragging the slider rewrites the field;
// committing the field clamps to range and drives the slider) and the
// revert-on-invalid entry rule are the same. This topic's dock is the four
// Points controls — the HP / VP / PP distance sliders and the Quadrant picker
// (a 2×2 button grid, the Spatial Framework pattern) — plus the guarded
// ghost-Reset confirm. Every solid-specific constraint from the
// Module 2 original (cube height-lock, face-inclination mutual exclusion,
// orientation presets, the distVP floor) is gone: a point has no such modes.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator, the scene, or
// another leaf. Distances are committed in the same unsigned mm the data layer
// stores; the mm → world remap (1 world unit = 10 mm, ADR-018) stays main.js's
// concern — the controls read and write millimetres, nothing else.
//
// There is no separate dock: the controls live in the #controls block inside the
// step card, one [data-ctrl] wrapper each, and stepper.js reveals exactly the
// wrapper the current step teaches (one control per step — the legacy Points
// pattern). This module wires values; it never touches wrapper visibility.

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {() => {distHP:number, distVP:number, distRP:number, quadrant:string}} getData  Snapshot of the point.
 * @property {(partial:object) => void} commit     Merge params into the data and rebuild().
 * @property {(q:string) => void} setQuadrant      Commit a quadrant walk (flies the camera).
 * @property {() => void} reset                    Route through simAPI.reset() (the ONE reset path).
 * @property {(message:string) => void} announce   Narrate to the live region.
 */

/**
 * Slider/input descriptors. `key` matches a PointData field; the controls
 * read/write the stored unsigned mm directly (ADR-018: 1 world unit = 10 mm is
 * main.js's remap, never the dock's). All three distances allow 0: the textbook
 * problems this module ports (K.C. John) include points resting exactly ON a
 * reference plane — 0 mm is a legal, teachable position (ADR-015 already treats
 * on-plane points as valid degenerate cases), so the dock must not forbid it.
 * The SLIDER runs between `min`…`max` (the comfortable drag range); the typed
 * field accepts `inputMin`…`inputMax`. Both now share the same 40 mm ceiling:
 * every problem in pointProblems.js stays within 40 mm, and the tighter travel
 * keeps the point well inside the bounded reference sheet.
 *
 * The two plane distances (HP, VP) stay unsigned (0…40 mm). The PROFILE-plane
 * distance is signed (−40…40 mm): distRP is the lateral position along the fold
 * line, and a NEGATIVE value places the point on the far side of the profile
 * plane, so the learner can walk it both ways. pointData.resolvePosition maps
 * the signed value straight onto Z — no clamp downstream.
 */
const SLIDERS = [
  { key: 'distHP', range: 'rng-disthp', num: 'num-disthp', min: 0, max: 40, inputMin: 0, inputMax: 40, decimals: 0, unitWord: 'mm' },
  { key: 'distVP', range: 'rng-distvp', num: 'num-distvp', min: 0, max: 40, inputMin: 0, inputMax: 40, decimals: 0, unitWord: 'mm' },
  { key: 'distRP', range: 'rng-distrp', num: 'num-distrp', min: -40, max: 40, inputMin: -40, inputMax: 40, decimals: 0, unitWord: 'mm' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The standard engineering definition of each quadrant, shown in the note under
 * the 2×2 picker and narrated on selection. Exact wording (capitalisation
 * included) is the textbook convention the lesson teaches — do not paraphrase.
 */
const QUAD_NOTES = Object.freeze({
  Q1: 'Above HP, In front of VP',
  Q2: 'Above HP, Behind VP',
  Q3: 'Below HP, Behind VP',
  Q4: 'Below HP, In front of VP',
});

/**
 * Parse a typed numeric field, tolerating a decimal COMMA (3,5 → 3.5) so an
 * EU-format entry is not silently truncated by parseFloat (which reads "3,5"
 * as 3). Trims surrounding whitespace; returns NaN for anything non-numeric so
 * the caller can revert to the last valid value.
 * @param {string} str
 * @returns {number}
 */
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * Wire the parameter controls to the sim controller. Returns a handle so
 * main.js can re-sync after every commit / step change / reset and (optionally)
 * tear the listeners down.
 *
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  // The quadrant picker — a 2×2 grid of data-quadrant buttons (the Spatial
  // Framework pattern) replacing the legacy <select>. The definition note beneath
  // reads the standard engineering description of the chosen room.
  const quadButtons = [...document.querySelectorAll('#controls [data-ctrl="quad"] .quad-btn')];
  const quadNote = $('quad-note');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');

  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  /** Reflect one stored value into its slider + numeric field + screen-reader
   *  value text. */
  function setPair(cfg, value) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    range.value = String(value);
    num.value = fmt(value, cfg.decimals);
    range.setAttribute('aria-valuetext', `${fmt(value, cfg.decimals)} ${cfg.unitWord}`);
  }

  // --- Sliders + numeric inputs (two-way, the Module-2 Slider/InputField pair) ---
  for (const cfg of SLIDERS) {
    const range = $(cfg.range);
    const num = $(cfg.num);

    // Live drag / arrow-key stepping on the slider.
    range.addEventListener('input', () => {
      const value = clamp(parseFloat(range.value), cfg.min, cfg.max);
      setPair(cfg, value);
      sim.commit({ [cfg.key]: value });
    }, listen);

    // Precise entry: parse + clamp on commit; revert on invalid. The typed
    // ceiling (inputMax) now matches the slider's 40 mm travel — see the
    // SLIDERS doc comment.
    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value);
      if (Number.isFinite(parsed)) {
        // The typed field is clamped to [inputMin, inputMax] (for distRP that
        // includes negatives, which the slider also reaches).
        const value = clamp(parsed, cfg.inputMin, cfg.inputMax);
        setPair(cfg, value);
        sim.commit({ [cfg.key]: value });
        if (parsed > cfg.inputMax) {
          sim.announce(`The maximum is ${cfg.inputMax} ${cfg.unitWord}, so ${cfg.inputMax} ${cfg.unitWord} is used.`);
        } else if (parsed < cfg.inputMin) {
          sim.announce(`The minimum is ${cfg.inputMin} ${cfg.unitWord}, so ${cfg.inputMin} ${cfg.unitWord} is used.`);
        }
      } else {
        // Invalid entry reverts to the last valid value; the revert is narrated
        // so it never reads as the input silently vanishing.
        const last = sim.getData()[cfg.key];
        setPair(cfg, last);
        sim.announce(`Kept your last value, ${fmt(last, cfg.decimals)} ${cfg.unitWord}.`);
      }
    }, listen);
  }

  // --- Quadrant picker (step 1's one control — the 2×2 button grid).
  //     Routed through setQuadrant, not plain commit, so the camera flies INTO
  //     the chosen room (main.js owns the flight; sliders never trigger one).
  //     setQuadrant → commit → sync() re-stamps aria-pressed + the note, so the
  //     announce below (which lands last) reads the settled definition. ---
  for (const btn of quadButtons) {
    btn.addEventListener('click', () => {
      const q = btn.dataset.quadrant;
      sim.setQuadrant(q);
      sim.announce(`Point P moved to Quadrant ${q.slice(1)} — ${QUAD_NOTES[q]}.`);
    }, listen);
  }

  // --- Reset: guarded by an inline two-state confirm so a stray click can't wipe
  //     the walk-through. The confirm guards the BUTTON only; simAPI.reset() stays
  //     the single reset path (RULES.md §2.9), fired solely by a deliberate "Yes". ---
  let resetArmed = false;

  /** Swap the ghost Reset for the inline confirm on the same control; Back / Next
   *  step aside (CSS) so the choice stands alone. Focus the safe option (Cancel),
   *  so a reflexive Enter or a stray second click never lands on "Yes". */
  function armReset() {
    if (resetArmed) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel.focus();
    sim.announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }

  /** Return to the idle ghost Reset. A deliberate dismiss (Cancel / Escape) returns
   *  focus to Reset; tabbing or clicking away just leaves focus where it went. */
  function disarmReset({ returnFocus = false } = {}) {
    if (!resetArmed) return;
    resetArmed = false;
    resetConfirm.hidden = true;
    btnReset.hidden = false;
    cardNav?.classList.remove('is-reset-armed');
    if (returnFocus) btnReset.focus();
  }

  btnReset?.addEventListener('click', armReset, listen);
  btnResetYes?.addEventListener('click', () => {
    disarmReset({ returnFocus: true }); // tidy the control to idle before resetting
    sim.reset();                        // the one reset path; re-syncs + announces
  }, listen);
  btnResetCancel?.addEventListener('click', () => {
    disarmReset({ returnFocus: true });
    sim.announce('Reset cancelled.');
  }, listen);

  // Escape backs out (matches the term-popover convention in terms.js).
  resetConfirm?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      disarmReset({ returnFocus: true });
      sim.announce('Reset cancelled.');
    }
  }, listen);

  // Tabbing or clicking outside the armed confirm abandons it (nothing is lost), so
  // the learner is never stranded with Back / Next hidden behind a forgotten prompt.
  // Both paths leave focus wherever the user sent it; disarm is idempotent.
  resetConfirm?.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && !resetConfirm.contains(e.target)) disarmReset();
  }, listen);

  /** Full refresh from current data — initial load, every commit, every step
   *  change, and reset (main.js calls this after each). Values only: wrapper
   *  visibility is the stepper's progressive disclosure, never re-written here. */
  function sync() {
    const data = sim.getData();
    for (const cfg of SLIDERS) setPair(cfg, data[cfg.key]);
    // Reflect the active quadrant onto the 2×2 grid (pressed state) and the note.
    for (const btn of quadButtons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.quadrant === data.quadrant));
    }
    if (quadNote && QUAD_NOTES[data.quadrant]) quadNote.textContent = QUAD_NOTES[data.quadrant];
  }

  sync();

  return { sync, dispose: () => ac.abort() };
}
