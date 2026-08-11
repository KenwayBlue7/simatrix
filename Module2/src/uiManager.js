// Parameter dock controller. Ported from src_csharp/UIManager.cs — the bridge
// between the HTML controls and the rebuild() pipeline (the JS replacement for
// the C# Visualizer.UpdateVisualization()).
//
// Layering (CLAUDE.md): this is a leaf layer. It imports NO other layer module;
// main.js injects a small `sim` controller so uiManager never reaches back into
// the orchestrator or the data/transform layers. Pure DOM + the three ported
// UI constraints called out in the C# original:
//
//   1. Cube locks height to baseLength (height controls disabled).
//        [UIManager.OnShapeChanged / OnBaseLengthChanged]
//   2. Face inclination HP and VP are mutually exclusive, pyramids/cone only.
//        [UIManager.OnFaceInclination{HP,VP}Toggled — exclusion lives in sim.setMode]
//   3. Orientation is disabled while a face mode is active; manual Y rotation
//      (lowest priority) clears an active orientation preset.
//        [UIManager.OnOrientationToggled / OnRotationYChanged]
//
// The slider <-> numeric-input two-way sync mirrors the C# Slider/InputField
// pair: dragging the slider rewrites the field; committing the field clamps to
// range and drives the slider. Invalid text reverts (C# float.TryParse + else).

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {Readonly<Record<string,string>>} ShapeType        ShapeType enum (from shapeData.js).
 * @property {() => (import('./shapeData.js').ShapeData | null)} state  Current shape data, or null on the empty start.
 * @property {() => import('./shapeData.js').ShapeData} defaults   Canonical defaults (placeholder values pre-add).
 * @property {() => {faceInclinationHP:boolean, faceInclinationVP:boolean, orientToCorner:boolean}} modes  Mode flags (copy).
 * @property {(shape:string) => boolean} isPyramidType          Whether a shape supports face inclination.
 * @property {(partial:object) => void} commit                  Merge params into state and rebuild().
 * @property {(mode:string, enabled:boolean) => void} setMode   Flip a rotation mode (enforces hierarchy) and rebuild().
 * @property {() => number} vpMinUnits                          Minimum distVP (world units) keeping the near face in front of the VP (0 unless distVPRef:'axis').
 * @property {() => void} reset                                 Route through simAPI.reset() (re-syncs the dock itself).
 * @property {(message:string) => void} announce               Narrate to the live region.
 * @property {(message:string) => void} flowNote                Flash a brief visible note over the viewport (auto-dismisses).
 */

/**
 * Slider/input descriptors. `key` matches a ShapeData field. `min`/`max` are in the
 * DISPLAYED unit (mm for lengths, degrees for the angles/turn); `scale` maps display →
 * the engine's stored world units (display = stored × scale, so commit divides by scale).
 * Lengths show whole millimetres (1 unit = 10 mm, `decimals: 0`); angles/turn show `F1`
 * like the C#. Angles have scale 1.
 */
const SLIDERS = [
  { key: 'baseLength', range: 'rng-base',    num: 'num-base',    min: 5,   max: 70,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'height',     range: 'rng-height',  num: 'num-height',  min: 5,   max: 70,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'distHP',     range: 'rng-disthp',  num: 'num-disthp',  min: 0,   max: 50,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'distVP',     range: 'rng-distvp',  num: 'num-distvp',  min: 0,   max: 50,  decimals: 0, unitWord: 'mm',      scale: 10 },
  { key: 'angleHP',    range: 'rng-anglehp', num: 'num-anglehp', min: -90, max: 90,  decimals: 1, unitWord: 'degrees', scale: 1 },
  { key: 'angleVP',    range: 'rng-anglevp', num: 'num-anglevp', min: -90, max: 90,  decimals: 1, unitWord: 'degrees', scale: 1 },
  { key: 'rotationY',  range: 'rng-roty',    num: 'num-roty',    min: 0,   max: 360, decimals: 1, unitWord: 'degrees', scale: 1 },
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
  const fihp = $('tgl-fihp');
  const fivp = $('tgl-fivp');
  const orient = $('tgl-orient');
  const lblOrient = $('lbl-orient');
  const disthpHint = $('disthp-hint');
  const inclLockHint = $('incl-lock-hint'); // ADR-161: cross-step padlock cause (Step 3 note about Step 2's orient preset)
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset.closest('.card__nav');

  const cfgByKey = (key) => SLIDERS.find((c) => c.key === key);
  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  /** Reflect one STORED value (engine world units) into its slider + numeric field +
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
    refreshVpBound(); // commit may change the rotated extents → re-floor distVP
  }

  // Re-entrancy guard: refreshVpBound's clamp routes back through applyParam (which
  // tail-calls refreshVpBound), so the guard stops the floored re-commit from looping.
  let vpBoundGuard = false;

  /**
   * Cap the distVP slider so an axis-referenced solid never seats its nearest face behind
   * the VP. Sets the live floor from sim.vpMinUnits() and clamps the stored distVP up onto
   * it. Floor is 0 for nearest-point seating (the face already rests on the plane).
   */
  function refreshVpBound() {
    if (vpBoundGuard) return;
    const cfg = cfgByKey('distVP');
    const range = $(cfg.range);
    const s = sim.state();
    if (!s) { range.min = String(cfg.min); return; } // empty start — reset floor

    // ceil so world clearance is always ≥ 0; clamp into [min, max] so the floor can never
    // exceed the slider's ceiling for an extreme turned solid (degrades to a single value).
    const floorMm = clamp(Math.ceil(sim.vpMinUnits() * cfg.scale), cfg.min, cfg.max);
    range.min = String(floorMm);

    if (s.distVP * cfg.scale < floorMm - 1e-9) {
      vpBoundGuard = true;
      applyParam(cfg, floorMm / cfg.scale); // commit the floored value + reflect it
      vpBoundGuard = false;
    }
  }

  /** Show the HP-distance hint only while the base rests on the VP (height lies horizontal
   *  then, so the distance is read to the lowest point — the math students forget). */
  function refreshHpHint() {
    const s = sim.state();
    if (disthpHint) disthpHint.hidden = !(s && s.restingPlane === 'VP');
  }

  // --- Sliders + numeric inputs (two-way, mirrors the C# Slider/InputField) ---
  for (const cfg of SLIDERS) {
    const range = $(cfg.range);
    const num = $(cfg.num);

    // The controls read/write in the DISPLAY unit (mm / degrees); divide by scale
    // to hand applyParam the engine's stored world-unit value.
    // Live drag / arrow-key stepping on the slider.
    range.addEventListener('input', () => {
      applyParam(cfg, clamp(parseFloat(range.value), cfg.min, cfg.max) / cfg.scale);
    }, listen);

    // Precise entry: parse + clamp on commit; revert on invalid (C# onEndEdit).
    // parseNumeric also accepts a decimal comma so EU-format entry survives.
    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value); // in the display unit
      if (Number.isFinite(parsed)) {
        applyParam(cfg, clamp(parsed, cfg.min, cfg.max) / cfg.scale);
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

    // A non-pyramid shape cannot hold a face-inclination mode — clear it first.
    if (!sim.isPyramidType(shape)) {
      if (sim.modes().faceInclinationHP) sim.setMode('faceInclinationHP', false);
      if (sim.modes().faceInclinationVP) sim.setMode('faceInclinationVP', false);
    }

    sim.commit(partial);
    sim.announce(`Shape set to ${shapeSelect.selectedOptions[0].textContent}.`);
    syncAll();
  }, listen);

  // --- Resting plane (HP/VP) — a plain shapeData commit; it sets the FOUNDATION pose
  //     (HP keeps the axis upright, VP lays the base onto the VP), which the inclination
  //     controls then tilt from. See applyShapeTransform() in iShape.js. ---
  restingSelect.addEventListener('change', () => {
    sim.commit({ restingPlane: restingSelect.value });
    sim.announce(restingSelect.value === 'VP'
      ? 'Base resting on the VP. Axis horizontal, perpendicular to the VP.'
      : 'Base resting on the HP. Axis upright, perpendicular to the HP.');
    refreshVpBound(); // laying onto the VP changes the rotated extents → re-floor distVP
    refreshHpHint();  // and reveals/hides the HP-distance hint
  }, listen);

  // --- VP distance reference (nearest point / axis) — a plain shapeData commit. ---
  distVPRefSelect.addEventListener('change', () => {
    sim.commit({ distVPRef: distVPRefSelect.value });
    sim.announce(distVPRefSelect.value === 'axis'
      ? 'Distance from VP now measured to the axis (centre).'
      : 'Distance from VP now measured to the nearest point.');
    refreshVpBound(); // axis ref engages the clip cap; nearest releases it back to 0
  }, listen);

  // --- Face inclination toggles (mutual exclusion enforced inside sim.setMode) ---
  fihp.addEventListener('change', () => {
    sim.setMode('faceInclinationHP', fihp.checked);
    if (!fihp.checked) sim.announce('Face inclination HP disabled.');
    syncToggles();
    refreshVpBound(); // face tilt changes the rotated extents → re-floor distVP
  }, listen);

  fivp.addEventListener('change', () => {
    sim.setMode('faceInclinationVP', fivp.checked);
    if (!fivp.checked) sim.announce('Face inclination VP disabled.');
    syncToggles();
    refreshVpBound(); // face tilt changes the rotated extents → re-floor distVP
  }, listen);

  // --- Orientation toggle (port of UIManager.OnOrientationToggled) ---
  orient.addEventListener('change', () => {
    // A face mode owns the rotation while active — refuse and revert.
    if (sim.modes().faceInclinationHP || sim.modes().faceInclinationVP) {
      orient.checked = false;
      return;
    }
    sim.setMode('orientToCorner', orient.checked);
    sim.announce(orient.checked
      ? `${orientationLabelFor(sim.state().shape)} enabled.`
      : 'Orientation preset disabled.');
    syncToggles();
    refreshVpBound(); // turning to a corner pushes the near face out → re-floor distVP
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

  /** Reflect mode flags + shape into the toggles (checked + enabled + label). */
  function syncToggles() {
    const s = sim.state();
    if (!s) {
      // Empty start — no solid; keep every mode toggle off and disabled.
      fihp.checked = fivp.checked = orient.checked = false;
      fihp.disabled = fivp.disabled = orient.disabled = true;
      if (inclLockHint) inclLockHint.hidden = true;
      return;
    }
    const { shape } = s;
    const m = sim.modes();
    const pyramid = sim.isPyramidType(shape);
    const faceActive = m.faceInclinationHP || m.faceInclinationVP;

    fihp.checked = m.faceInclinationHP;
    fivp.checked = m.faceInclinationVP;
    orient.checked = m.orientToCorner;

    // Mutual exclusion (CLAUDE.md hierarchy): an active HP/VP face mode or an
    // active orientation preset greys out the conflicting toggles. The active
    // toggle itself stays enabled so the user can always switch it back off.
    fihp.disabled = !pyramid || m.faceInclinationVP || m.orientToCorner;
    fivp.disabled = !pyramid || m.faceInclinationHP || m.orientToCorner;
    orient.disabled = faceActive;

    // ADR-161: Step 3 (Inclinations) is a different panel from Step 2's "Orient to
    // corner" toggle that can padlock it — the padlock icon alone doesn't say WHY when
    // the cause is on a step the learner isn't currently looking at. Only surface this
    // for the cross-step cause (orient preset), not the same-panel non-pyramid case,
    // which the shape dropdown already explains.
    if (inclLockHint) inclLockHint.hidden = !(pyramid && m.orientToCorner);

    lblOrient.textContent = orientationLabelFor(shape);
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
      syncToggles();
      refreshVpBound(); // resets the distVP floor back to 0
      refreshHpHint();  // hides the HP hint (no solid)
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

    syncToggles();
    refreshVpBound(); // re-floor distVP for the synced shape/pose (shape change, reset, load)
    refreshHpHint();  // reveal/hide the HP hint for the synced resting plane
  }

  syncAll();

  return { sync: syncAll, dispose: () => ac.abort() };
}
