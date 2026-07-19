// Parameter dock controller — the bridge between the Line controls and the
// orchestrator's commit()/rebuild() pipeline (ADR-017). The slider <-> numeric
// two-way sync (dragging the slider rewrites the field; committing the field
// clamps to range and drives the slider) and the revert-on-invalid entry rule are
// the Module-2 pattern. This topic's dock is the five Lines drivers — True Length,
// distance of end A from HP and VP, and the two inclinations θ (with HP) and φ
// (with VP) — plus the guarded ghost-Reset confirm.
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator, the scene, or
// another leaf. Values are committed in the same unsigned mm / degrees the data
// layer stores; the mm → world remap (1 world unit = 10 mm, ADR-018) stays
// main.js's concern.
//
// Progressive disclosure is the stepper's job: the controls live in the #controls
// block as [data-ctrl] wrappers and stepper.js reveals exactly the wrapper the
// current step teaches. This module wires values; it never touches wrapper
// visibility.

/**
 * @typedef {Object} SimController  Injected by main.js.
 * @property {() => {TL:number, aHP:number, aVP:number, theta:number, phi:number}} getData
 * @property {(partial:object) => void} commit   Merge params into the data and rebuild().
 * @property {() => void} reset                   Route through simAPI.reset() (the ONE reset path).
 * @property {(message:string) => void} announce  Narrate to the live region.
 */

/**
 * Driver descriptors. `key` matches a lineData field; the controls read/write the
 * stored value directly (the mm → world remap is main.js's, ADR-018). The SLIDER
 * runs `min`…`max` (the comfortable drag range); the typed field accepts
 * `inputMin`…`inputMax` (a wider ceiling for exact textbook values).
 */
const DRIVERS = [
  { key: 'TL',    range: 'r-tl',  num: 'n-tl',  min: 20, max: 150, inputMin: 0, inputMax: 200, decimals: 0, unitWord: 'mm' },
  { key: 'aHP',   range: 'r-ahp', num: 'n-ahp', min: 0,  max: 100, inputMin: 0, inputMax: 150, decimals: 0, unitWord: 'mm' },
  { key: 'aVP',   range: 'r-avp', num: 'n-avp', min: 0,  max: 100, inputMin: 0, inputMax: 150, decimals: 0, unitWord: 'mm' },
  { key: 'theta', range: 'r-th',  num: 'n-th',  min: 0,  max: 90,  inputMin: 0, inputMax: 90,  decimals: 0, unitWord: 'degrees' },
  { key: 'phi',   range: 'r-ph',  num: 'n-ph',  min: 0,  max: 90,  inputMin: 0, inputMax: 90,  decimals: 0, unitWord: 'degrees' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Parse a typed field, tolerating a decimal COMMA (3,5 → 3.5). NaN for anything
 *  non-numeric so the caller can revert to the last valid value. */
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * Wire the parameter controls to the sim controller.
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');
  const noteValid = $('note-valid');

  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  /** Reflect one stored value into its slider + numeric field + SR value text. */
  function setPair(cfg, value) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    if (!range || !num) return;
    range.value = String(value);
    num.value = fmt(value, cfg.decimals);
    range.setAttribute('aria-valuetext', `${fmt(value, cfg.decimals)} ${cfg.unitWord}`);
  }

  // --- Sliders + numeric inputs (two-way, the Module-2 Slider/InputField pair) ---
  for (const cfg of DRIVERS) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    if (!range || !num) continue;

    // Live drag / arrow-key stepping.
    range.addEventListener('input', () => {
      const value = clamp(parseFloat(range.value), cfg.min, cfg.max);
      setPair(cfg, value);
      sim.commit({ [cfg.key]: value });
    }, listen);

    // Precise entry: parse + clamp on commit; revert on invalid.
    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value);
      if (Number.isFinite(parsed)) {
        const value = clamp(parsed, cfg.inputMin, cfg.inputMax);
        setPair(cfg, value);
        sim.commit({ [cfg.key]: value });
        if (parsed > cfg.inputMax) {
          sim.announce(`The maximum is ${cfg.inputMax} ${cfg.unitWord}, so ${cfg.inputMax} ${cfg.unitWord} is used.`);
        } else if (parsed < cfg.inputMin) {
          sim.announce(`The minimum is ${cfg.inputMin} ${cfg.unitWord}, so ${cfg.inputMin} ${cfg.unitWord} is used.`);
        }
      } else {
        const last = sim.getData()[cfg.key];
        setPair(cfg, last);
        sim.announce(`Kept your last value, ${fmt(last, cfg.decimals)} ${cfg.unitWord}.`);
      }
    }, listen);
  }

  // --- Reset: inline two-state confirm (RULES.md §4.19). simAPI.reset() stays the
  //     single reset path (§2.9), fired solely by a deliberate "Yes". ---
  let resetArmed = false;

  function armReset() {
    if (resetArmed) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel.focus();
    sim.announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }

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
    disarmReset({ returnFocus: true });
    sim.reset();
  }, listen);
  btnResetCancel?.addEventListener('click', () => {
    disarmReset({ returnFocus: true });
    sim.announce('Reset cancelled.');
  }, listen);

  resetConfirm?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      disarmReset({ returnFocus: true });
      sim.announce('Reset cancelled.');
    }
  }, listen);

  resetConfirm?.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && !resetConfirm.contains(e.target)) disarmReset();
  }, listen);

  /** Full refresh from current data — initial load, every commit, every step
   *  change, and reset. Values only; wrapper visibility is the stepper's job. */
  function sync() {
    const data = sim.getData();
    for (const cfg of DRIVERS) setPair(cfg, data[cfg.key]);
    // θ + φ must stay ≤ 90° for a real line (lineData.resolveLine `valid` flag).
    if (noteValid) {
      const invalid = (data.theta + data.phi) > 90;
      noteValid.hidden = !invalid;
      noteValid.textContent = invalid ? 'θ + φ must stay ≤ 90° for a real line. Reduce one angle.' : '';
    }
  }

  sync();

  return { sync, dispose: () => ac.abort() };
}
