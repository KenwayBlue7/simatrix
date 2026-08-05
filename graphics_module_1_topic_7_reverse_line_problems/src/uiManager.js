// Parameter panel controller — REVERSE TOPIC fork of Topic 6's uiManager.js.
//
// Topic 6 owns a slider <-> numeric two-way sync: the learner DIALS every field, and
// uiManager.js reflects the live dialled value back into the DOM. This topic never lets the
// learner touch the drawing's own geometry — every field is either:
//   - GIVEN:  shown read-only (a plain text/number readout, no slider, no input) — the problem's
//             stated data, safe to show because it's never the thing being guessed.
//   - ASKED:  a bare numeric guess input (no slider — a slider revealing "the right answer is
//             somewhere in 0..90" via its thumb position would itself leak information a
//             textbook problem doesn't give you). Starts empty; never auto-filled.
// Which fields fall in which bucket comes from main.js's sim.getFieldGating() (itself driven by
// problemLibrary.js loading a problem's `givenFields`/`askFields`) — this module just renders
// whatever gating is live and wires the guess inputs to sim.setGuess().
//
// Layering (ADR-007 / RULES.md §3.6): leaf module, speaks only to the injected `sim` facade.

/** Per-field display metadata — label, unit, decimals, and how to read the value out of a
 *  resolved shapeData / trace computation for the GIVEN panel. htDist/vtDist aren't part of
 *  shapeData (they're derived by intersecting the line with y=0 / z=0, same as
 *  lineProblems.js's own target values), so the given panel reads them from the active
 *  problem's own `target`-shaped data — main.js exposes the full solved numbers via
 *  sim.getFieldGating() + the problem's shapeData/target, forwarded through sim.getGivenValue().
 */
const FIELD_META = {
  TL:     { label: 'True length',              unit: 'mm', decimals: 1 },
  theta:  { label: 'θ — inclination with HP',  unit: '°',  decimals: 1 },
  phi:    { label: 'φ — inclination with VP',  unit: '°',  decimals: 1 },
  aHP:    { label: 'Distance of A from HP',     unit: 'mm', decimals: 1 },
  aVP:    { label: 'Distance of A from VP',     unit: 'mm', decimals: 1 },
  htDist: { label: 'H.T. (+ front VP / − behind)', unit: 'mm', decimals: 1 },
  vtDist: { label: 'V.T. (+ above HP / − below)',  unit: 'mm', decimals: 1 },
};
const FIELD_ORDER = ['TL', 'theta', 'phi', 'aHP', 'aVP', 'htDist', 'vtDist'];

const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * @param {SimController} sim  main.js's facade — see problemLibrary.js's JSDoc for the shape;
 *   this module additionally needs getFieldGating(), getGivenValue(key), getGuesses(), setGuess().
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const givenPanel = $('given-panel');
  const guessPanel = $('guess-panel');

  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');

  const el = (tag, cls) => { const n = document.createElement(tag); if (cls) n.className = cls; return n; };
  const fmt = (v, d) => Number(v).toFixed(d);

  /** Build the read-only "Given" rows from the current field gating. */
  function renderGiven() {
    if (!givenPanel) return;
    givenPanel.replaceChildren();
    const { given } = sim.getFieldGating();
    for (const key of FIELD_ORDER) {
      if (!given.includes(key)) continue;
      const meta = FIELD_META[key];
      const value = sim.getGivenValue(key);
      if (value == null) continue;
      const row = el('div', 'given-row');
      const label = el('span', 'given-row__label'); label.textContent = meta.label;
      const val = el('span', 'given-row__value'); val.textContent = `${fmt(value, meta.decimals)} ${meta.unit}`;
      row.append(label, val);
      givenPanel.appendChild(row);
    }
  }

  /** Build the numeric guess-input rows from the current field gating, wired to sim.setGuess. */
  function renderGuess() {
    if (!guessPanel) return;
    guessPanel.replaceChildren();
    const { ask } = sim.getFieldGating();
    const guesses = sim.getGuesses();
    for (const key of FIELD_ORDER) {
      if (!ask.includes(key)) continue;
      const meta = FIELD_META[key];
      const row = el('div', 'guess-row');
      const label = el('label', 'guess-row__label');
      const inputId = `guess-${key}`;
      label.setAttribute('for', inputId);
      label.textContent = meta.label;
      const wrap = el('div', 'guess-row__field');
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.id = inputId;
      input.className = 'field__num';
      input.setAttribute('aria-label', `Your guess for ${meta.label}, in ${meta.unit}`);
      const existing = guesses[key];
      input.value = typeof existing === 'number' && Number.isFinite(existing) ? fmt(existing, meta.decimals) : '';
      input.addEventListener('change', () => {
        const parsed = parseNumeric(input.value);
        sim.setGuess(key, Number.isFinite(parsed) ? parsed : undefined);
      }, listen);
      const unit = el('span', 'field__unit'); unit.setAttribute('aria-hidden', 'true'); unit.textContent = meta.unit;
      wrap.append(input, unit);
      row.append(label, wrap);
      guessPanel.appendChild(row);
    }
  }

  // --- Reset: inline two-state confirm (RULES.md §4.19), unchanged from Topic 6. ---
  let resetArmed = false;

  function armReset() {
    if (resetArmed) return;
    resetArmed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel.focus();
    sim.announce('Reset everything? Choose Yes to clear your guess, or Cancel to keep it.');
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

  /** Full refresh — initial load, every field-gating change, and reset. Rebuilds both panels
   *  from scratch (cheap: at most 5 rows each) rather than diffing. */
  function sync() {
    renderGiven();
    renderGuess();
  }

  sync();

  return { sync, dispose: () => ac.abort() };
}
