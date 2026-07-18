// Parameter dock controller — Development of Surfaces.
//
// REWRITTEN for this topic (the scaffold shipped the Module 2 dock controller verbatim, but
// none of the markup it wires — the exact unwired-markup failure ADR-048 recorded on the
// Glass Box topic and repeated on Sections of Solids). This version wires only the controls
// this topic actually renders:
//
//   Step 1 — the solid picker (#ctl-shape).
//   Step 2 — the cutting-plane controls: #tgl-section (cut on/off),
//            #rng-sec-angle/#num-sec-angle (inclination to the HP),
//            #rng-sec-height/#num-sec-height (height where the plane crosses the axis).
//            There is NO orientation select — the plane is always ⊥ VP, inclined to the
//            HP (ADR-068): the KTU truncation standard the development height-model
//            represents exactly.
//   Footer — the guarded two-state Reset confirm (kept behaviour-identical to Module 2).
//
// Layering (CLAUDE.md): leaf layer. Imports NO other module; main.js injects a small `sim`
// controller so uiManager never reaches back into the orchestrator. Section state lives in
// main.js OUTSIDE ShapeData (src/shapeData.js stays byte-identical to Module2 — root
// DECISIONS.md ADR-067, mirroring topic-1's ADR-059), so section edits go through
// sim.commitSection(), shape edits through sim.commit(); both route through the single
// rebuild() pipeline.
//
// The slider <-> numeric-input two-way sync mirrors the Module 2 dock: dragging the slider
// rewrites the field; committing the field clamps to range and drives the slider; invalid
// text reverts to the last valid value with a visible "Kept …" nudge.

/**
 * @typedef {Object} SimController  Injected by main.js. uiManager depends only on this.
 * @property {Readonly<Record<string,string>>} ShapeType  ShapeType enum (from shapeData.js).
 * @property {() => (import('./shapeData.js').ShapeData | null)} state  Current shape data.
 * @property {(partial:object) => void} commit         Merge params into ShapeData and rebuild().
 * @property {() => {enabled:boolean, angleDeg:number, cutHeight:number}} sectionState
 *   Copy of the topic-local cutting-plane state (cutHeight in world units above the base).
 * @property {(partial:object) => void} commitSection  Merge params into section state and rebuild().
 * @property {() => void} reset                        Route through simAPI.reset().
 * @property {(message:string) => void} announce       Narrate to the live region.
 * @property {(message:string) => void} flowNote       Flash a brief visible note over the viewport.
 */

/**
 * Section slider descriptors. `key` matches a section-state field. `min`/`max` are in the
 * DISPLAYED unit (mm for the cut height, degrees for the angle); `scale` maps display →
 * stored world units (display = stored × scale, so commit divides by scale; 1 world unit
 * = 10 mm, matching the Module 2 dock convention).
 */
const SECTION_SLIDERS = [
  { key: 'angleDeg',  range: 'rng-sec-angle',  num: 'num-sec-angle',  min: 0, max: 90, decimals: 0, unitWord: 'degrees', scale: 1 },
  { key: 'cutHeight', range: 'rng-sec-height', num: 'num-sec-height', min: 0, max: 40, decimals: 0, unitWord: 'mm',      scale: 10 },
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Parse a typed numeric field, tolerating a decimal COMMA (3,5 → 3.5) so an EU-format entry
 * is not silently truncated by parseFloat. Returns NaN for anything non-numeric so the caller
 * can revert to the last valid value. (Behaviour kept from the Module 2 dock.)
 * @param {string} str
 * @returns {number}
 */
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * Wire the dock to the sim controller. Returns a handle so main.js can re-sync after a reset
 * (via its onStateChange subscription) and tear listeners down.
 *
 * @param {SimController} sim
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const shapeSelect = $('ctl-shape');
  const tglSection = $('tgl-section');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset.closest('.card__nav');

  const fmt = (value, decimals) => Number(value).toFixed(decimals);

  /** Reflect one STORED section value into its slider + numeric field + SR value text. */
  function setPair(cfg, value) {
    const range = $(cfg.range);
    const num = $(cfg.num);
    const shown = value * cfg.scale;
    range.value = String(shown);
    num.value = fmt(shown, cfg.decimals);
    range.setAttribute('aria-valuetext', `${fmt(shown, cfg.decimals)} ${cfg.unitWord}`);
  }

  /** Commit a section slider/field value: reflect it, then route through rebuild(). */
  function applySection(cfg, value) {
    setPair(cfg, value);
    sim.commitSection({ [cfg.key]: value });
  }

  // --- Section sliders + numeric inputs (two-way, Module 2 dock behaviour) ---
  for (const cfg of SECTION_SLIDERS) {
    const range = $(cfg.range);
    const num = $(cfg.num);

    range.addEventListener('input', () => {
      applySection(cfg, clamp(parseFloat(range.value), cfg.min, cfg.max) / cfg.scale);
    }, listen);

    num.addEventListener('change', () => {
      const parsed = parseNumeric(num.value); // in the display unit
      if (Number.isFinite(parsed)) {
        applySection(cfg, clamp(parsed, cfg.min, cfg.max) / cfg.scale);
      } else {
        // Invalid entry reverts, with a visible nudge naming what was kept.
        const last = sim.sectionState()[cfg.key];
        setPair(cfg, last);
        const kept = `${fmt(last * cfg.scale, cfg.decimals)} ${cfg.unitWord}`;
        sim.flowNote(`Kept ${kept}`);
        sim.announce(`Kept your last value, ${kept}.`);
      }
    }, listen);
  }

  // --- Solid picker ---
  shapeSelect.addEventListener('change', () => {
    const shape = shapeSelect.value;
    const partial = { shape };
    // Cube locks height to base length (Module 2 rule; there is no height slider here yet,
    // but the lock keeps the data honest for the generators and the development layouts).
    if (shape === sim.ShapeType.Cube) partial.height = sim.state()?.baseLength ?? 2;
    sim.commit(partial);
    sim.announce(`Solid set to ${shapeSelect.selectedOptions[0].textContent}.`);
  }, listen);

  // --- Section on/off ---
  tglSection.addEventListener('change', () => {
    sim.commitSection({ enabled: tglSection.checked });
    sim.announce(tglSection.checked
      ? 'Cutting plane on. The solid is truncated; the development shows the remaining lower portion.'
      : 'Cutting plane off. The solid — and its development — are whole again.');
    syncAll(); // enable/disable the dependent angle + height controls
  }, listen);

  // --- Reset: guarded by an inline two-state confirm so a stray click can't wipe the work.
  //     The confirm guards the BUTTON only; simAPI.reset() stays the single reset path
  //     (CLAUDE.md), fired solely by a deliberate "Yes". Kept from the Module 2 dock. ---
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

  /** Full refresh from current state — initial load, section toggle, and reset. */
  function syncAll() {
    const s = sim.state();
    const sec = sim.sectionState();

    if (s) shapeSelect.value = s.shape;

    tglSection.checked = sec.enabled;

    for (const cfg of SECTION_SLIDERS) {
      setPair(cfg, sec[cfg.key]);
      $(cfg.range).disabled = !sec.enabled;
      $(cfg.num).disabled = !sec.enabled;
      $(cfg.range).closest('.field')?.classList.toggle('field--disabled', !sec.enabled);
    }
  }

  syncAll();

  return { sync: syncAll, dispose: () => ac.abort() };
}
