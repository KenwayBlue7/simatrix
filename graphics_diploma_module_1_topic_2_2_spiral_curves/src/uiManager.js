// Parameter dock + step-3/4 action wiring. Unlike Module 2's fixed SLIDERS array, this
// topic's given-value fields are DYNAMIC — the one construction (the spiral engine)
// declares a `given` list covering BOTH growth laws, each entry optionally tagged
// `modes: [...]` (constructions.js) — this module rebuilds/filters the slider set
// whenever the construction or the active growth law changes.
//
// Mechanics copied from Topic 2.1 (graphics_diploma_module_1_topic_2_1_roulettes/
// src/uiManager.js, itself copied from Topic 1.1) with two additions this topic needs:
// (1) `renderGivenFields()` filters `con.given` by the current `mode` before building
// sliders — a field tagged for the other growth law simply isn't rendered, rather than
// showing every field always and letting the student guess which ones matter; (2) a
// `#mode-toggle` control (Topic 1.2's own pattern, `constructions.js` reads
// `params.mode`, deliberately NOT in `given[]` — RULES §6.2's "never preset the answer"
// extends here too: switching growth law is itself part of what the student sets up, not
// auto-picked for them). Topic 1.2 placed its toggle on the Construct step, since its two
// modes share one field set; this topic's toggle changes WHICH fields exist, so it lives
// on the Given step instead, above the fields it gates.
//
// Layering (CLAUDE.md): leaf module. Imports nothing; main.js injects `sim`. Pure DOM —
// every change routes through sim.commit()/sim.play()/sim.reset(), never touching the
// SVG directly (RULES.md §3.2, re-expressed for this substrate).

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * @typedef {Object} SimController
 * @property {() => import('./constructions.js').ConstructionDef | null} getActiveConstruction
 * @property {() => Record<string, number|string>} getParams
 * @property {(partial: Record<string, number|string>) => void} commit
 * @property {() => void} play
 * @property {() => void} reset
 * @property {(msg: string) => void} announce
 * @property {(msg: string) => void} flowNote
 * @property {() => string} getResultText
 * @property {() => string | null} getInvalidReason
 */

/** @param {SimController} sim */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const givenFields = $('given-fields');
  const btnPlay = $('btn-play-construction');
  const modeToggle = $('mode-toggle');
  const modeButtons = modeToggle ? [...modeToggle.querySelectorAll('.mode-toggle__btn')] : [];
  const resultGiven = $('result-given');
  const resultText = $('result-text');
  const resultWarning = $('result-warning');
  const resultPrinciple = $('result-principle');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');

  let fieldEls = []; // [{ cfg, range, num }] for the currently-active construction+mode

  function currentMode() { return sim.getParams().mode ?? 'archimedean'; }

  /** (Re)build the given-value sliders for the active construction, filtered to the
   *  fields that apply to the current growth law (a field with no `modes` tag applies
   *  to both). Called whenever the construction OR the growth law changes — either one
   *  changes which fields should be on screen. */
  function renderGivenFields() {
    if (!givenFields) return;
    givenFields.innerHTML = '';
    fieldEls = [];
    const con = sim.getActiveConstruction();
    if (!con) return;
    const params = sim.getParams();
    const mode = currentMode();
    const visible = con.given.filter((cfg) => !cfg.modes || cfg.modes.includes(mode));

    for (const cfg of visible) {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const label = document.createElement('label');
      label.className = 'field__label';
      label.htmlFor = `rng-${cfg.key}`;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'field__name';
      nameSpan.textContent = cfg.label;
      label.appendChild(nameSpan);
      wrap.appendChild(label);

      const row = document.createElement('div');
      row.className = 'field__row';

      const range = document.createElement('input');
      range.type = 'range';
      range.className = 'field__range';
      range.id = `rng-${cfg.key}`;
      range.min = String(cfg.min);
      range.max = String(cfg.max);
      range.step = String(cfg.step);
      range.value = String(params[cfg.key] ?? cfg.default);

      const num = document.createElement('input');
      num.type = 'text';
      num.className = 'field__num';
      num.inputMode = 'decimal';
      num.autocomplete = 'off';
      num.spellcheck = false;
      num.setAttribute('aria-label', `${cfg.label}, exact value${cfg.unit ? ` in ${cfg.unit}` : ''}`);
      num.value = String(params[cfg.key] ?? cfg.default);

      const unit = document.createElement('span');
      unit.className = 'field__unit';
      unit.setAttribute('aria-hidden', 'true');
      unit.textContent = cfg.unit ?? '';

      row.append(range, num, unit);
      wrap.appendChild(row);
      givenFields.appendChild(wrap);
      fieldEls.push({ cfg, range, num });

      const applyValue = (raw) => {
        const clamped = clamp(raw, cfg.min, cfg.max);
        range.value = String(clamped);
        num.value = String(clamped);
        range.setAttribute('aria-valuetext', cfg.unit ? `${clamped} ${cfg.unit}` : String(clamped));
        sim.commit({ [cfg.key]: clamped });
      };

      range.addEventListener('input', () => applyValue(parseFloat(range.value)), listen);
      num.addEventListener('change', () => {
        const parsed = parseNumeric(num.value);
        if (Number.isFinite(parsed)) {
          applyValue(parsed);
        } else {
          const last = sim.getParams()[cfg.key];
          num.value = String(last);
          sim.flowNote(`Kept ${last}${cfg.unit ? ` ${cfg.unit}` : ''}`);
          sim.announce(`Kept your last value, ${last}${cfg.unit ? ` ${cfg.unit}` : ''}.`);
        }
      }, listen);
    }
  }

  /** Reflect current param values into the already-built fields (no rebuild). */
  function syncFieldValues() {
    const params = sim.getParams();
    for (const { cfg, range, num } of fieldEls) {
      const v = params[cfg.key] ?? cfg.default;
      range.value = String(v);
      num.value = String(v);
      range.setAttribute('aria-valuetext', cfg.unit ? `${v} ${cfg.unit}` : String(v));
    }
  }

  btnPlay?.addEventListener('click', () => sim.play(), listen);

  /** Sync the growth-law toggle's pressed state. Always shown — the one construction in
   *  this topic always reads `params.mode`, unlike Topic 1.2 where only one of four
   *  constructions used it. */
  function syncModeToggle() {
    if (!modeToggle) return;
    const mode = currentMode();
    for (const btn of modeButtons) btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  }

  for (const btn of modeButtons) {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-pressed') === 'true') return;
      sim.commit({ mode: btn.dataset.mode });
      // Switching growth law changes WHICH fields apply (not just their values) — the
      // generic rebuildFields:false path sim.commit() drives isn't enough here, so
      // rebuild the field set directly (values themselves are untouched: main.js's
      // defaultsFor() already seeded every key for both laws up front, so toggling back
      // and forth never loses a prior tuning).
      renderGivenFields();
      syncModeToggle();
      sim.announce(`${btn.dataset.mode === 'logarithmic' ? 'Logarithmic (equiangular)' : 'Archimedean'} spiral. Adjust its measurements, then continue.`);
    }, listen);
  }

  /** Verify step's "You built" recap — the same given values as step 2, restated as a
   *  plain list rather than sliders, so Verify reads as a summary, not just an answer. */
  function renderGivenRecap() {
    if (!resultGiven) return;
    resultGiven.innerHTML = '';
    const con = sim.getActiveConstruction();
    if (!con) return;
    const params = sim.getParams();
    const mode = currentMode();

    const modeLi = document.createElement('li');
    const modeLabel = document.createElement('span');
    modeLabel.className = 'result-given__label';
    modeLabel.textContent = 'Growth law';
    const modeValue = document.createElement('span');
    modeValue.className = 'result-given__value';
    modeValue.textContent = mode === 'logarithmic' ? 'Logarithmic' : 'Archimedean';
    modeLi.append(modeLabel, modeValue);
    resultGiven.appendChild(modeLi);

    for (const cfg of con.given.filter((g) => !g.modes || g.modes.includes(mode))) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'result-given__label';
      label.textContent = cfg.label;
      const value = document.createElement('span');
      value.className = 'result-given__value';
      const v = params[cfg.key] ?? cfg.default;
      value.textContent = cfg.unit ? `${v} ${cfg.unit}` : String(v);
      li.append(label, value);
      resultGiven.appendChild(li);
    }
  }

  function syncResult() {
    renderGivenRecap();
    if (resultText) resultText.textContent = sim.getResultText();
    const invalid = sim.getInvalidReason();
    if (resultWarning) {
      resultWarning.hidden = !invalid;
      if (invalid) resultWarning.textContent = sim.getResultText();
    }
    if (resultPrinciple) resultPrinciple.textContent = sim.getActiveConstruction()?.principle ?? '';
  }

  // --- Reset: two-state confirm, single path through simAPI.reset() (RULES §2.9/§4.19) ---
  let resetArmed = false;
  function armReset() {
    if (resetArmed || !btnReset || !resetConfirm) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel?.focus();
    sim.announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }
  function disarmReset({ returnFocus = false } = {}) {
    if (!resetArmed || !btnReset || !resetConfirm) return;
    resetArmed = false;
    resetConfirm.hidden = true;
    btnReset.hidden = false;
    cardNav?.classList.remove('is-reset-armed');
    if (returnFocus) btnReset.focus();
  }
  btnReset?.addEventListener('click', armReset, listen);
  btnResetYes?.addEventListener('click', () => { disarmReset({ returnFocus: true }); sim.reset(); }, listen);
  btnResetCancel?.addEventListener('click', () => { disarmReset({ returnFocus: true }); sim.announce('Reset cancelled.'); }, listen);
  resetConfirm?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); disarmReset({ returnFocus: true }); sim.announce('Reset cancelled.'); }
  }, listen);
  resetConfirm?.addEventListener('focusout', (e) => {
    if (resetArmed && !resetConfirm.contains(e.relatedTarget)) disarmReset();
  }, listen);
  document.addEventListener('pointerdown', (e) => {
    if (resetArmed && resetConfirm && !resetConfirm.contains(e.target)) disarmReset();
  }, listen);

  /** Full refresh — construction change rebuilds fields; a param-only change just re-syncs. */
  function sync({ rebuildFields = false } = {}) {
    if (rebuildFields) renderGivenFields();
    else syncFieldValues();
    syncModeToggle();
    syncResult();
  }

  return { sync, dispose: () => ac.abort() };
}
