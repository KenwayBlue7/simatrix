// UI manager — owns the parameter dock: the Step-1 solid picker and the Step-2 dimension fields.
//
// This is the Module-2 `uiManager.js` role (RULES.md §4.14): one module owns the dock's DOM, and no
// control ever touches the Three.js scene directly — every change is routed back through the
// injected controller, which funnels it into the single `rebuild()` pipeline (RULES.md §3.2). That
// discipline is what keeps a rapid slider drag from exhausting the WebGL context.
//
// The dimension fields are BUILT FROM DATA. `shapeData` declares which dimensions a solid has, so
// choosing a cylinder produces Diameter + Height and choosing a cuboid produces Length + Breadth +
// Height, with no per-solid UI code anywhere (ADR-043). That is also what makes the task brief's
// "architecture must allow adding more solids later" true rather than aspirational: a new solid ships
// its own controls.
//
// Every control here is a platform component used as-is — `.field__select` (DESIGN.md §5.3),
// `.field` slider + numeric pair (§5.2/§5.3). Nothing new is invented.
//
// Layering (CLAUDE.md): leaf module. Imports the solid DATA only; main.js injects `sim`.

import { SOLIDS, getSolid, resolveDims, axisSymbol } from './shapeData.js';

/**
 * @param {{
 *   setSolid: (id: string) => void,
 *   setDim: (key: string, value: number) => void,
 *   setDimSpecified: (key: string, on: boolean) => void,
 *   announce?: (msg: string) => void,
 * }} sim
 */
export function initUIManager(sim) {
  const $ = (id) => document.getElementById(id);

  const select = $('solid-select');
  const dimsHost = $('dim-fields');
  const blurbEl = $('solid-blurb');
  const summaryEl = $('dim-summary');

  /** Live field controls, keyed by dimension key, so `sync()` can push values without rebuilding. */
  const fields = new Map();

  // ---- Step 1: the solid picker -------------------------------------------------------------
  if (select) {
    select.innerHTML = '';
    for (const s of SOLIDS) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      select.appendChild(opt);
    }
    select.addEventListener('change', () => sim.setSolid(select.value));
  }

  // ---- Step 2: the dimension fields ----------------------------------------------------------

  /**
   * Build one slider + numeric-input pair. The two are two-way bound: dragging updates the number,
   * typing updates the slider, and an invalid entry quietly reverts to the last valid value rather
   * than turning alarming red (DESIGN.md §5.3).
   */
  function buildField(spec, value, { unspecified = false, autoValue = null } = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const id = `dim-${spec.key}`;
    const label = document.createElement('label');
    label.className = 'field__label';
    label.setAttribute('for', id);
    // Engineering notation first, the plain-English name after it — the notation is what the
    // drawing, the transfer tokens and the comparison table all use, so it leads here too.
    const sym = document.createElement('span');
    sym.className = 'field__symbol';
    sym.textContent = spec.symbol;
    sym.setAttribute('aria-hidden', 'true');   // the name beside it already says it in words
    const name = document.createElement('span');
    name.className = 'field__name';
    name.textContent = spec.label;
    label.append(sym, name);
    wrap.appendChild(label);

    // ---- An optional dimension: the learner may declare it UNSPECIFIED ------------------------
    // Nothing here knows which solid this is; the field declared itself optional (ADR-043).
    if (spec.optional) {
      const opt = document.createElement('div');
      opt.className = 'field__optional';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'field__check';
      box.id = `${id}-specify`;
      box.checked = !unspecified;
      const optLabel = document.createElement('label');
      optLabel.className = 'field__check-label';
      optLabel.setAttribute('for', box.id);
      optLabel.textContent = `Specify ${spec.label}`;
      opt.append(box, optLabel);
      wrap.appendChild(opt);
      box.addEventListener('change', () => sim.setDimSpecified(spec.key, box.checked));

      if (unspecified) {
        // No slider: the value is not the learner's to set. The drawing still needs A number, so
        // the sim uses a demonstration value and says so plainly.
        const auto = document.createElement('p');
        auto.className = 'field__auto';
        auto.textContent = spec.autoLabel ?? 'Auto / Unknown';
        wrap.appendChild(auto);
        if (autoValue != null) {
          const shown = document.createElement('p');
          shown.className = 'field__auto-value';
          shown.textContent = `Drawn at ${autoValue} ${spec.unit} for the demonstration.`;
          wrap.appendChild(shown);
        }
        if (spec.autoNote) {
          const note = document.createElement('p');
          note.className = 'dock__note field__auto-note';
          note.textContent = spec.autoNote;
          wrap.appendChild(note);
        }
        return wrap;
      }
    }

    const row = document.createElement('div');
    row.className = 'field__row';

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'field__range';
    range.id = id;
    range.min = String(spec.min);
    range.max = String(spec.max);
    range.step = String(spec.step);
    range.value = String(value);
    range.setAttribute('aria-valuetext', `${value} ${spec.unit}`);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'field__num';
    num.min = String(spec.min);
    num.max = String(spec.max);
    num.step = String(spec.step);
    num.value = String(value);
    num.setAttribute('aria-label', `${spec.label} in millimetres`);

    const unit = document.createElement('span');
    unit.className = 'field__unit';
    unit.textContent = spec.unit;

    row.append(range, num, unit);
    wrap.appendChild(row);

    const clamp = (v) => Math.min(Math.max(v, spec.min), spec.max);

    const commit = (raw, { fromText = false } = {}) => {
      const parsed = Number(String(raw).replace(',', '.')); // tolerate a decimal comma
      if (!Number.isFinite(parsed)) {           // invalid text: revert, never scold
        num.value = range.value;
        return;
      }
      const v = clamp(Math.round(parsed / spec.step) * spec.step);
      range.value = String(v);
      num.value = String(v);
      range.setAttribute('aria-valuetext', `${v} ${spec.unit}`);
      sim.setDim(spec.key, v);
      if (fromText && v !== parsed) {
        sim.announce?.(`${spec.label} kept at ${v} ${spec.unit}, the nearest allowed value.`);
      }
    };

    range.addEventListener('input', () => commit(range.value));
    num.addEventListener('change', () => commit(num.value, { fromText: true }));

    fields.set(spec.key, { range, num, spec });
    return wrap;
  }

  /**
   * Rebuild the dock for a solid. Called whenever the selected solid changes — the field SET is
   * per-solid, so it must be re-created, not merely re-valued.
   */
  function render(state) {
    const solid = getSolid(state.solidId);
    if (select && select.value !== solid.id) select.value = solid.id;
    if (blurbEl) blurbEl.textContent = solid.blurb;

    fields.clear();
    if (dimsHost) {
      dimsHost.innerHTML = '';
      for (const spec of solid.dims) {
        const unspecified = Boolean(state.unspecified?.[spec.key]);
        const autoValue = unspecified && typeof spec.auto === 'function'
          ? Math.round(spec.auto(state.dims) * 10) / 10
          : null;
        dimsHost.appendChild(buildField(spec, state.dims[spec.key], { unspecified, autoValue }));
      }
    }
    syncSummary(state);
  }

  /**
   * Push current values into existing controls without rebuilding them (used after a reset, and
   * whenever the scene changes a value the dock did not originate).
   */
  function sync(state) {
    for (const [key, f] of fields) {
      const v = state.dims[key];
      if (v == null) continue;
      f.range.value = String(v);
      f.num.value = String(v);
      f.range.setAttribute('aria-valuetext', `${v} ${f.spec.unit}`);
    }
    syncSummary(state);
  }

  /**
   * The live overall-size readout. It exists because Step 4 Phase B transfers exactly these three
   * numbers onto the three axes — seeing them here first is what makes that transfer legible rather
   * than magical. Real values in real units (PRODUCT.md principle 4), set in the tabular mono face.
   */
  function syncSummary(state) {
    if (!summaryEl) return;
    const solid = getSolid(state.solidId);
    const b = solid.bounds(resolveDims(solid, state.dims, state.unspecified));
    const fmt = (v) => `${Math.round(v * 10) / 10}`;
    summaryEl.innerHTML = '';
    // Named by the SAME symbol Phase B writes against that box edge, so the readout and the
    // drawing are one notation rather than two vocabularies.
    const rows = [
      [`Overall width · ${axisSymbol(solid, 'width')}`, fmt(b.width)],
      [`Overall depth · ${axisSymbol(solid, 'depth')}`, fmt(b.depth)],
      [`Overall height · ${axisSymbol(solid, 'height')}`, fmt(b.height)],
    ];
    for (const [name, value] of rows) {
      const row = document.createElement('div');
      row.className = 'bounds-row';
      const n = document.createElement('span');
      n.className = 'bounds-row__name';
      n.textContent = name;
      const v = document.createElement('span');
      v.className = 'bounds-row__value';
      v.textContent = `${value} mm`;
      row.append(n, v);
      summaryEl.appendChild(row);
    }
  }

  return { render, sync };
}
