// Parameter dock controller. Ported from src_csharp/UIManager.cs — the bridge
// between the HTML controls and the rebuild() pipeline (the JS replacement for
// the C# Visualizer.UpdateVisualization()).
//
// Layering (CLAUDE.md): this is a leaf layer. It imports NO other layer module;
// main.js injects a small `sim` controller so uiManager never reaches back into
// the orchestrator or the data/transform layers. Pure DOM + the SIMPLE-POSITIONS
// UI constraints:
//
//   1. Cube locks height to baseLength (height controls disabled).
//        [UIManager.OnShapeChanged / OnBaseLengthChanged]
//   2. Base orientation: the orient-to-corner preset owns the turn while active;
//      nudging "Turn about the axis" (manual Y) clears the preset.
//   3. Resting plane (HP/VP) and the VP-distance reference (nearest/axis) are
//      plain shapeData commits — no mode flags, no tilting.
//
// LENGTHS ARE SHOWN IN MILLIMETRES. The engine stores world units (1 unit = 10 mm);
// the unit↔mm mapping is confined to this dock via each slider's `scale` (display =
// value × scale; commit divides back). Angles have scale 1.
//
// The slider <-> numeric-input two-way sync mirrors the C# Slider/InputField
// pair: dragging the slider rewrites the field; committing the field clamps to
// range and drives the slider. Invalid text reverts (C# float.TryParse + else).

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {Readonly<Record<string,string>>} ShapeType        ShapeType enum (from shapeData.js).
 * @property {() => (import('./shapeData.js').ShapeData | null)} state  Current shape data, or null on the empty start.
 * @property {() => import('./shapeData.js').ShapeData} defaults   Canonical defaults (placeholder values pre-add).
 * @property {() => {orientToCorner:boolean}} modes  Mode flags (copy).
 * @property {(shape:string) => boolean} isPyramidType          Pyramid/cone — used to label the orient preset ("edge" for the hexagonal pyramid).
 * @property {(partial:object) => void} commit                  Merge params into state and rebuild().
 * @property {(mode:string, enabled:boolean) => void} setMode   Flip a rotation mode (enforces hierarchy) and rebuild().
 * @property {() => void} reset                                 Route through simAPI.reset() (re-syncs the dock itself).
 * @property {(message:string) => void} announce               Narrate to the live region.
 * @property {(message:string) => void} flowNote                Flash a brief visible note over the viewport (auto-dismisses).
 */

/**
 * Slider/input descriptors. `key` matches a ShapeData field. `min`/`max` are in the
 * DISPLAYED unit (mm for lengths, degrees for the turn); `scale` maps display → the
 * engine's world units (display = stored × scale, so commit divides by scale).
 * Lengths show whole millimetres (`decimals: 0`); the turn shows `F1` like the C#.
 */
const SLIDERS = [
  { key: 'baseLength', range: 'rng-base',   num: 'num-base',   min: 5, max: 70,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'height',     range: 'rng-height', num: 'num-height', min: 5, max: 70,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'distHP',     range: 'rng-disthp', num: 'num-disthp', min: 0, max: 50,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'distVP',     range: 'rng-distvp', num: 'num-distvp', min: 0, max: 50,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'rotationY',  range: 'rng-roty',   num: 'num-roty',   min: 0, max: 360, decimals: 1, unitWord: 'degrees', scale: 1 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Parse a typed numeric field, tolerating a decimal COMMA (3,5 → 3.5) so an EU /
 * German learner's entry is not silently truncated by parseFloat (which reads "3,5"
 * as 3). Trims surrounding whitespace; returns NaN for anything non-numeric so the
 * caller can revert to the last valid value.
 * @param {string} str
 * @returns {number}
 */
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * Wire the parameter dock to the sim controller. Returns a handle so main.js can
 * re-sync after a platform-driven reset and (optionally) tear listeners down.
 *
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const shapeSelect = $('ctl-shape');
  const fieldHeight = $('field-height');
  const restingSelect = $('ctl-resting');
  const distVPRefSelect = $('ctl-distvp-ref');
  const disthpHint = $('disthp-hint');
  const orient = $('tgl-orient');
  const lblOrient = $('lbl-orient');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset.closest('.card__nav');

  const cfgByKey = (key) => SLIDERS.find((c) => c.key === key);
  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  // Dynamic lower bound for the VP-distance control. distVP is normally floored at 0,
  // but axis-ref placement seats the AXIS at distVP, so the slider must not drop below
  // the solid's axis→face inset or it clips backward through the VP wall. This floor
  // (display mm) is refreshed after every geometry-changing commit by refreshVpBound();
  // every other control keeps its static SLIDERS min.
  let vpMinMm = 0;
  let inRefreshVpBound = false; // re-entrancy guard (refreshVpBound → applyParam → refreshVpBound)
  const floorFor = (cfg) => (cfg.key === 'distVP' ? Math.max(cfg.min, vpMinMm) : cfg.min);

  /** Reflect one STORED value (engine units) into its slider + numeric field +
   *  screen-reader value text, shown in the field's display unit (× scale). */
  function setPair(cfg, value) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    const shown = value * cfg.scale;
    range.value = String(shown);
    num.value = fmt(shown, cfg.decimals);
    range.setAttribute(
      'aria-valuetext',
      cfg.unitWord ? `${fmt(shown, cfg.decimals)} ${cfg.unitWord}` : fmt(shown, cfg.decimals),
    );
  }

  /**
   * Commit a slider/field value: reflect it, apply the Cube height-lock and the
   * manual-Y-clears-orientation rules, then route through rebuild() via sim.commit.
   */
  function applyParam(cfg, value) {
    if (!sim.state()) return; // empty start — no solid to update yet
    const partial = { [cfg.key]: value };
    setPair(cfg, value);

    // Cube: height stays locked to base length (its own slider is disabled).
    if (cfg.key === 'baseLength' && sim.state().shape === sim.ShapeType.Cube) {
      partial.height = value;
      setPair(cfgByKey('height'), value);
    }

    // Manual Y is lowest priority: touching it drops an active orientation preset.
    if (cfg.key === 'rotationY' && sim.modes().orientToCorner) {
      sim.setMode('orientToCorner', false);
      syncToggles();
    }

    sim.commit(partial);

    // Geometry just changed → the axis→VP inset (and so the distVP floor) may have moved.
    refreshVpBound();
  }

  /**
   * Re-read the VP-distance floor from the sim (axis-ref inset, else 0), reflect it onto
   * the slider's `min` attribute, and clamp the stored distVP up onto it so the solid can
   * never sit clipping the VP wall. Runs after every geometry-changing commit and on every
   * full sync. The re-entrancy guard stops the clamp's own applyParam() looping back in.
   */
  function refreshVpBound() {
    if (inRefreshVpBound) return;
    inRefreshVpBound = true;
    try {
      const cfgVP = cfgByKey('distVP');
      vpMinMm = Math.ceil(sim.vpMinUnits() * cfgVP.scale); // ceil: a step=1 value never lands below the clip threshold
      $(cfgVP.range).min = String(vpMinMm);

      const s = sim.state();
      if (s && s.distVP * cfgVP.scale < vpMinMm) {
        applyParam(cfgVP, vpMinMm / cfgVP.scale); // snap the stored value onto the new floor (re-pairs + recommits)
      }
    } finally {
      inRefreshVpBound = false;
    }
  }

  // --- Sliders + numeric inputs (two-way, mirrors the C# Slider/InputField) ---
  for (const cfg of SLIDERS) {
    const range = $(cfg.range);
    const num = $(cfg.num);

    // The controls read/write in the DISPLAY unit (mm / degrees); divide by scale
    // to hand applyParam the engine's stored value.
    // Live drag / arrow-key stepping on the slider.
    range.addEventListener('input', () => {
      applyParam(cfg, clamp(parseFloat(range.value), floorFor(cfg), cfg.max) / cfg.scale);
    }, listen);

    // Precise entry: parse + clamp on commit; revert on invalid (C# onEndEdit).
    // parseNumeric also accepts a decimal comma so EU-format entry survives.
    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value); // in the display unit
      if (Number.isFinite(parsed)) {
        applyParam(cfg, clamp(parsed, floorFor(cfg), cfg.max) / cfg.scale);
      } else {
        // Invalid entry reverts to the last valid value. A brief, non-alarming nudge
        // names what was kept (e.g. "Kept 20 mm") so the revert doesn't read as the
        // input silently vanishing — closes the error-recovery gap (critique #9).
        const last = sim.state()[cfg.key];
        setPair(cfg, last);
        const shown = fmt(last * cfg.scale, cfg.decimals);
        const kept = cfg.unitWord ? `${shown} ${cfg.unitWord}` : shown;
        sim.flowNote(`Kept ${kept}`);
        sim.announce(`Kept your last value, ${kept}.`);
      }
    }, listen);
  }

  // --- Shape dropdown (port of UIManager.OnShapeChanged) ---
  shapeSelect.addEventListener('change', () => {
    // Empty start: the dropdown only PICKS which solid the Step-1 "Add" button
    // will create — there is no solid to recommit onto yet.
    if (!sim.state()) return;

    const shape = shapeSelect.value;
    const partial = { shape };

    if (shape === sim.ShapeType.Cube) partial.height = sim.state().baseLength;

    sim.commit(partial);
    sim.announce(`Shape set to ${shapeSelect.selectedOptions[0].textContent}.`);
    syncAll();
  }, listen);

  // --- Resting plane (HP/VP) — a plain shapeData commit; HP keeps the axis upright,
  //     VP lays the base onto the VP (axis horizontal). No tilting. ---
  restingSelect.addEventListener('change', () => {
    sim.commit({ restingPlane: restingSelect.value });
    // Laying the base onto the VP swings the axis horizontal — the axis→VP inset (and so
    // the distVP floor) jumps; and the lowest-point reminder only applies lying down.
    refreshVpBound();
    disthpHint.hidden = restingSelect.value !== 'VP';
    sim.announce(restingSelect.value === 'VP'
      ? 'Base resting on the VP. Axis horizontal, perpendicular to the VP.'
      : 'Base resting on the HP. Axis upright, perpendicular to the HP.');
  }, listen);

  // --- VP distance reference (nearest point / axis) — a plain shapeData commit. ---
  distVPRefSelect.addEventListener('change', () => {
    sim.commit({ distVPRef: distVPRefSelect.value });
    // Axis-ref measures to the centre → the slider gains a non-clipping floor (the inset);
    // nearest-ref drops it back to 0. Clamps the stored distVP up if it now sits too close.
    refreshVpBound();
    sim.announce(distVPRefSelect.value === 'axis'
      ? 'Distance from VP now measured to the axis (centre).'
      : 'Distance from VP now measured to the nearest point.');
  }, listen);

  // --- Orientation toggle (port of UIManager.OnOrientationToggled) ---
  orient.addEventListener('change', () => {
    sim.setMode('orientToCorner', orient.checked);
    refreshVpBound(); // the preset re-turns the base → its axis→VP inset (distVP floor) shifts
    sim.announce(orient.checked
      ? `${orientationLabelFor(sim.state().shape)} enabled.`
      : 'Orientation preset disabled.');
    syncToggles();
  }, listen);

  // --- Reset: guarded by an inline two-state confirm so a stray click can't wipe
  //     the drawing. The confirm guards the BUTTON only; simAPI.reset() stays the
  //     single reset path (CLAUDE.md), fired solely by a deliberate "Yes". ---
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

  // Tabbing or clicking outside the armed confirm abandons it (nothing is lost), so
  // the learner is never stranded with Back / Next hidden behind a forgotten prompt.
  // Both paths leave focus wherever the user sent it; disarm is idempotent.
  resetConfirm.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && !resetConfirm.contains(e.target)) disarmReset();
  }, listen);

  /** Orientation label per shape (port of UIManager.UpdateOrientationLabel). */
  function orientationLabelFor(shape) {
    if (sim.isPyramidType(shape) && shape === sim.ShapeType.HexagonalPyramid) {
      return 'Orient to edge';
    }
    return 'Orient to corner';
  }

  /** Reflect the orient preset (checked + label) into its toggle. */
  function syncToggles() {
    const s = sim.state();
    if (!s) {
      // Empty start — no solid; keep the orient toggle off and disabled.
      orient.checked = false;
      orient.disabled = true;
      return;
    }
    orient.checked = sim.modes().orientToCorner;
    orient.disabled = false; // always available in this build (no face mode to block it)
    lblOrient.textContent = orientationLabelFor(s.shape);
  }

  /** Full refresh from current state — initial load, shape change, and reset. */
  function syncAll() {
    const s = sim.state();

    // Empty start (no solid yet): show canonical defaults as greyed placeholders
    // and disable every value control. The shape dropdown stays live so the
    // learner can choose what Step 1's "Add" button will create.
    if (!s) {
      const d = sim.defaults();
      for (const cfg of SLIDERS) {
        setPair(cfg, d[cfg.key]);
        $(cfg.range).disabled = true;
        $(cfg.num).disabled = true;
      }
      restingSelect.value = d.restingPlane;
      distVPRefSelect.value = d.distVPRef;
      restingSelect.disabled = true;
      distVPRefSelect.disabled = true;
      fieldHeight.classList.add('field--disabled');
      disthpHint.hidden = true;     // no solid yet — the lowest-point reminder has no subject
      refreshVpBound();             // no solid → floor resets to 0
      syncToggles();
      return;
    }

    for (const cfg of SLIDERS) {
      setPair(cfg, s[cfg.key]);
      $(cfg.range).disabled = false;
      $(cfg.num).disabled = false;
    }

    shapeSelect.value = s.shape;
    restingSelect.value = s.restingPlane;
    distVPRefSelect.value = s.distVPRef;
    restingSelect.disabled = false;
    distVPRefSelect.disabled = false;

    // Cube locks height to base length (its own slider stays disabled).
    const cube = s.shape === sim.ShapeType.Cube;
    $('rng-height').disabled = cube;
    $('num-height').disabled = cube;
    fieldHeight.classList.toggle('field--disabled', cube);

    // Lowest-point reminder shows only lying down (axis horizontal); upright base-on-HP
    // seats distHP straight onto the base, so no subtraction is needed.
    disthpHint.hidden = s.restingPlane !== 'VP';
    refreshVpBound(); // reflect the axis-ref floor for the freshly-loaded geometry

    syncToggles();
  }

  syncAll();

  return { sync: syncAll, dispose: () => ac.abort() };
}
