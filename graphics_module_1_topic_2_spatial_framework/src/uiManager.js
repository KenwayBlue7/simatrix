// Parameter dock controller — the bridge between the Point P controls and the
// orchestrator's commit()/rebuild() pipeline. Adapted from the master
// Module2/src/uiManager.js: the slider <-> numeric-input two-way sync (dragging
// the slider rewrites the field; committing the field clamps to range and
// drives the slider) and the revert-on-invalid entry rule are the same; this
// topic's dock is just far smaller — the two distances. (The quadrant select is
// gone: step 2's room buttons are the one quadrant control.)
//
// Layering (ADR-007 / RULES.md §3.6): leaf module. main.js injects the `sim`
// controller; this module never reaches into the orchestrator, the scene, or
// another leaf. Distances are committed in the same unsigned mm the data layer
// stores (ADR-018) — the mm → world remap stays main.js's concern.
//
// There is no separate dock: the Point P controls live in the #controls group
// inside the step card, and sync() reveals them through the card's progressive
// disclosure by reading the ACTIVE VIEW. The whole group is HIDDEN while the point
// is not on stage (step 1, and step 5's fixed frustum illustration), and appears
// as native step content once P enters the scene — the card never offers a
// control the current step has taken away.

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {() => {distHP:number, distVP:number, quadrant:string}} getData  Snapshot of the point.
 * @property {() => Record<string, any>} getView   The active step's merged view flags.
 * @property {(partial:object) => void} commit     Merge params into the data and rebuild().
 * @property {(message:string) => void} announce   Narrate to the live region.
 */

/**
 * Slider/input descriptors. `key` matches a SpatialData field; the controls
 * read/write the stored unsigned mm directly (no display scale — Module 2's
 * uiManager needed a × 10). min is 1, not 0: the lesson is quadrant membership,
 * and a zero distance would put P ON a plane — in no quadrant at all — while
 * the viewport still highlighted one.
 */
const SLIDERS = [
  { key: 'distHP', range: 'rng-disthp', num: 'num-disthp', field: 'field-disthp', min: 1, max: 40, decimals: 0, unitWord: 'mm' },
  { key: 'distVP', range: 'rng-distvp', num: 'num-distvp', field: 'field-distvp', min: 1, max: 40, decimals: 0, unitWord: 'mm' },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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
 * Wire the parameter dock to the sim controller. Returns a handle so main.js
 * can re-sync after every commit / step change / reset and (optionally) tear
 * the listeners down.
 *
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const controls = $('controls'); // the whole Point P group — revealed per step

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

    // Precise entry: parse + clamp on commit; revert on invalid.
    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value);
      if (Number.isFinite(parsed)) {
        const value = clamp(parsed, cfg.min, cfg.max);
        setPair(cfg, value);
        sim.commit({ [cfg.key]: value });
      } else {
        // Invalid entry reverts to the last valid value; the revert is narrated
        // so it never reads as the input silently vanishing.
        const last = sim.getData()[cfg.key];
        setPair(cfg, last);
        sim.announce(`Kept your last value, ${fmt(last, cfg.decimals)} ${cfg.unitWord}.`);
      }
    }, listen);
  }

  /** Full refresh from current data + view — initial load, every commit, every
   *  step change, and reset (main.js calls this after each). */
  function sync() {
    const data = sim.getData();
    const view = sim.getView();
    const pointLive = !!view.showPoint;

    // Progressive disclosure: the Point P group is present in the card only while
    // the point is on stage. Hidden on step 1 (no point yet) and step 5 (the
    // fixed frustum illustration replaces P); revealed steps 2–4.
    if (controls) controls.hidden = !pointLive;

    for (const cfg of SLIDERS) {
      setPair(cfg, data[cfg.key]);
      $(cfg.range).disabled = !pointLive;
      $(cfg.num).disabled = !pointLive;
      $(cfg.field)?.classList.toggle('field--disabled', !pointLive);
    }
  }

  sync();

  return { sync, dispose: () => ac.abort() };
}
