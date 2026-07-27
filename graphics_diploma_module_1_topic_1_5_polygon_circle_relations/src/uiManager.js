// Parameter dock + step-3/4 action wiring. Given-value fields are DYNAMIC — each
// construction declares its own `given` param list (constructions.js), so this module
// rebuilds the slider set whenever the active construction changes.
//
// New this topic: an optional n-switcher (#n-switcher), used by exactly ONE of the four
// constructions (superscribe-polygon, whose n is a discrete set {4,6,8,12} — not a
// contiguous range a slider can express, and not a "same shape, different technique"
// choice like Topic 1.4's method switcher, so it deliberately isn't named/shaped like that
// switcher). Unlike Topic 1.4 (where EVERY construction declared `methods`), only
// superscribe-polygon declares `nChoices` here — incircle-triangle, circumcircle-triangle,
// and inscribe-polygon have none, so the switcher stays hidden for them. Mechanically it
// reuses the exact button-group pattern Topic 1.4 established (render from an array, one
// active state, `sim.commit()` on click) — a generic "N discrete choices" component is not
// worth inventing twice, only the trigger condition (optional vs. mandatory) differs.
//
// Layering (CLAUDE.md): leaf module. Imports nothing; main.js injects `sim`. Pure DOM —
// every change routes through sim.commit()/sim.play()/sim.reset(), never touching the SVG
// directly (RULES.md §3.2, re-expressed for this substrate).

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
  const nSwitcher = $('n-switcher');
  const resultGiven = $('result-given');
  const resultText = $('result-text');
  const resultWarning = $('result-warning');
  const resultPrinciple = $('result-principle');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');

  let fieldEls = []; // [{ cfg, range, num }] for the currently-active construction

  /** (Re)build the given-value sliders for the active construction. Called whenever the
   *  construction changes — the param SET itself differs per construction, so fields are
   *  rebuilt, not just re-valued. */
  function renderGivenFields() {
    if (!givenFields) return;
    givenFields.innerHTML = '';
    fieldEls = [];
    const con = sim.getActiveConstruction();
    if (!con) return;
    const params = sim.getParams();

    for (const cfg of con.given) {
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

  /** (Re)build the n-switcher buttons — ONLY for a construction that declares `nChoices`
   *  (today, only superscribe-polygon). Hidden entirely for the other three. */
  function renderNSwitcher() {
    if (!nSwitcher) return;
    nSwitcher.innerHTML = '';
    const con = sim.getActiveConstruction();
    if (!con || !con.nChoices) { nSwitcher.hidden = true; return; }
    nSwitcher.hidden = false;
    const params = sim.getParams();
    const active = String(params.n ?? con.defaultNId ?? con.nChoices[0].id);
    for (const choice of con.nChoices) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'n-switcher__btn';
      btn.dataset.choice = choice.id;
      btn.setAttribute('aria-pressed', String(choice.id === active));
      btn.textContent = choice.label;
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        sim.commit({ n: choice.id });
        sim.announce(`${choice.label} selected. Press Play to watch it build.`);
      }, listen);
      nSwitcher.appendChild(btn);
    }
  }

  /** Reflect the active n-choice into already-built switcher buttons (no rebuild). */
  function syncNSwitcher() {
    if (!nSwitcher || nSwitcher.hidden) return;
    const active = String(sim.getParams().n);
    for (const btn of nSwitcher.querySelectorAll('.n-switcher__btn')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.choice === active));
    }
  }

  /** Verify step's "You built" recap — the same given values as step 2, restated as a
   *  plain list, plus the active n-choice for superscribe-polygon (the switcher itself
   *  lives in step 3; Verify is where the student confirms what they actually built). */
  function renderGivenRecap() {
    if (!resultGiven) return;
    resultGiven.innerHTML = '';
    const con = sim.getActiveConstruction();
    if (!con) return;
    const params = sim.getParams();
    for (const cfg of con.given) {
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
    if (con.nChoices) {
      const active = String(params.n ?? con.defaultNId ?? con.nChoices[0].id);
      const choice = con.nChoices.find((c) => c.id === active);
      if (choice) {
        const li = document.createElement('li');
        const label = document.createElement('span');
        label.className = 'result-given__label';
        label.textContent = 'Polygon';
        const value = document.createElement('span');
        value.className = 'result-given__value';
        value.textContent = choice.label;
        li.append(label, value);
        resultGiven.appendChild(li);
      }
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
    if (resultPrinciple) {
      const con = sim.getActiveConstruction();
      const principle = con ? (typeof con.principle === 'function' ? con.principle(sim.getParams().n) : con.principle) : '';
      resultPrinciple.textContent = principle;
    }
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
    if (rebuildFields) { renderGivenFields(); renderNSwitcher(); }
    else { syncFieldValues(); syncNSwitcher(); }
    syncResult();
  }

  return { sync, dispose: () => ac.abort() };
}
