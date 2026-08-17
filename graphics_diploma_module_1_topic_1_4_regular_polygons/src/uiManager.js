// Parameter dock + step-3/4 action wiring. Unlike Module 2's fixed SLIDERS array, this
// topic's given-value fields are DYNAMIC — each construction declares its own `given`
// param list (constructions.js), so this module rebuilds the slider set whenever the
// active construction changes, rather than showing/hiding a fixed bank of fields.
//
// New this topic: the method switcher (#method-switcher). EVERY construction here offers
// 2-3 alternate methods for the SAME polygon (constructions.js's `methods` array), unlike
// Topic 1.2's #mode-toggle which was a fixed 2-button binary shown for exactly one
// construction. Button COUNT varies (pentagon: 3, hexagon/n-gon: 2), so — like the given
// sliders above it — the switcher's buttons are built from `con.methods` at render time,
// not hardcoded in HTML, and since every construction needs it, it's shown unconditionally
// once a construction is picked (no per-construction show/hide check). `method` still rides
// the same `state.params`/`sim.commit()` funnel as every numeric param.
//
// Layering (CLAUDE.md): leaf module. Imports nothing; main.js injects `sim`. Pure DOM —
// every change routes through sim.commit()/sim.play()/sim.reset(), never touching the
// SVG directly (RULES.md §3.2, re-expressed for this substrate).

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const parseNumeric = (str) => parseFloat(String(str).trim().replace(',', '.'));

/**
 * @typedef {Object} SimController
 * @property {() => import('./constructions.js').ConstructionDef | null} getActiveConstruction
 * @property {() => Record<string, number>} getParams
 * @property {(partial: Record<string, number>) => void} commit
 * @property {(opts?: {onComplete?: () => void}) => void} play
 * @property {() => void} reset
 * @property {(msg: string) => void} announce
 * @property {(msg: string) => void} flowNote
 * @property {() => string} getResultText
 * @property {() => string | null} getInvalidReason
 * @property {() => boolean} hasSlides Step Through feature flag (N-Gon only — true when the
 *   active recipe carries slide-boundary metadata).
 * @property {() => Array<{caption: string, startIdx: number, endIdx: number}>} getSlides
 * @property {(range: {startIdx: number, endIdx: number}, opts?: {onComplete?: () => void}) => void} revealSlide
 * @property {(endIdx: number) => void} showStepsUpTo
 * @property {() => void} skipToEnd Jump straight to the finished construction — what an
 *   in-flight Play/Play All relabels to (ADR-159).
 */

/** @param {SimController} sim */
export function initUIManager(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const givenFields = $('given-fields');
  const btnPlay = $('btn-play-construction');
  const methodSwitcher = $('method-switcher');
  const resultGiven = $('result-given');
  const resultText = $('result-text');
  const resultWarning = $('result-warning');
  const resultPrinciple = $('result-principle');
  const btnReset = $('btn-reset');
  const resetConfirm = $('reset-confirm');
  const btnResetYes = $('btn-reset-yes');
  const btnResetCancel = $('btn-reset-cancel');
  const cardNav = btnReset?.closest('.card__nav');
  const replayHint = $('construct-replay-hint');

  // Step Through (N-Gon construction only — sim.hasSlides() is the feature flag).
  const stepThroughEl = $('step-through');
  const btnStepBack = $('btn-step-back');
  const btnStepNext = $('btn-step-next');
  const btnPlayAll = $('btn-play-all');
  const stepCaptionEl = $('step-through-caption');
  const stepCaptionText = $('step-through-text');
  const stepCount = $('step-through-count');

  let fieldEls = []; // [{ cfg, range, num }] for the currently-active construction
  let stepIdx = -1; // Step Through progress: -1 = nothing revealed yet

  // ADR-159 (Phase A audit E5/E15): neither button ever changed state while a Play/Play All
  // animation was in flight — no signal anything was running, no way to stop it, and Play
  // All additionally lied about progress (stepIdx jumped to "done" the instant it was
  // CLICKED, not when the drawing actually finished). These two flags are the in-flight
  // signal; both are cleared by resetStepThrough() on every sync(), same as stepIdx already is.
  let playInFlight = false; // #btn-play-construction (Pentagon/Hexagon — Play is their ONLY path)
  let playAllInFlight = false; // #btn-play-all (N-Gon)

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

  // ADR-159: Play construction relabels to "Skip to end" while its animation is in flight —
  // the in-flight signal Phase A audit's E5 found missing, plus an actual escape hatch.
  // Pentagon/Hexagon have no Step Through, so Play is their ONLY reveal path; skipping just
  // jumps straight to sim.skipToEnd() (main.js's showStepsUpTo() driven to completion).
  function endPlay() {
    playInFlight = false;
    if (btnPlay) btnPlay.textContent = 'Play construction';
  }
  btnPlay?.addEventListener('click', () => {
    if (playInFlight) {
      sim.skipToEnd();
      endPlay();
      sim.announce('Skipped to the finished construction.');
      return;
    }
    playInFlight = true;
    if (btnPlay) btnPlay.textContent = 'Skip to end';
    sim.play({ onComplete: endPlay });
    sim.announce('Playing the construction. Press Skip to end to jump to the finished drawing.');
  }, listen);

  // --- Step Through (N-Gon only) — click-gated slide navigator, default/primary alongside
  // "Play All" (sim.play(), unchanged). Cherry-picked from Module2/src/methodController.js:
  // flat-index goNext/goBack math, and spacebar-as-Next scoped to this container (not
  // document) so it's a structural no-op everywhere else on the page. NOT cherry-picked:
  // the Tab-wrap focus-trap / Escape-to-close — those exist there because Show Method is a
  // full-viewport MODAL takeover with something to trap into and exit from. Step Through is
  // an inline widget inside the existing Construct step panel; there is nothing to escape
  // from, and trapping Tab here would block reaching Back/Reset in the step-card footer —
  // a real accessibility regression, not a faithful port. ---
  function slideCount() { return sim.getSlides().length; }

  function renderStepThrough() {
    if (!stepThroughEl || stepThroughEl.hidden) return;
    // ADR-159: Play All previously set stepIdx = slideCount() - 1 the instant it was
    // CLICKED, so this render made the caption/counter/Back-Next state claim "fully drawn"
    // while slide one of a multi-second (up to ~75s pre-budget) animation was still on
    // screen (Phase A audit E15). stepIdx is now only written once playback actually
    // completes (endPlayAll() below); while it's running this branch shows the true state
    // instead, and disables Back/Next rather than leaving Back readable as available.
    if (playAllInFlight) {
      if (btnStepBack) btnStepBack.disabled = true;
      if (btnStepNext) btnStepNext.disabled = true;
      if (stepCaptionText) stepCaptionText.textContent = 'Playing all steps…';
      if (stepCaptionEl) stepCaptionEl.classList.remove('is-idle');
      if (stepCount) stepCount.hidden = true;
      return;
    }
    const slides = sim.getSlides();
    const count = slides.length;
    if (btnStepBack) btnStepBack.disabled = stepIdx < 0;
    if (stepIdx < 0) {
      if (btnStepNext) { btnStepNext.textContent = 'Step Through'; btnStepNext.disabled = count === 0; }
      if (stepCaptionText) stepCaptionText.textContent = 'Press Step Through to begin.';
      // Idle: no slide revealed yet, so the caption has nothing of its own to say (it would
      // otherwise just restate the button below at promoted accent-soft weight — Phase A
      // U12). Demote to quiet chrome; the accent-soft wash is earned once a real slide
      // caption lands below, in the branch below (ADR-160).
      if (stepCaptionEl) stepCaptionEl.classList.add('is-idle');
      if (stepCount) stepCount.hidden = true;
    } else {
      if (btnStepNext) {
        btnStepNext.textContent = 'Next';
        btnStepNext.disabled = stepIdx >= count - 1;
      }
      if (stepCaptionText) stepCaptionText.textContent = slides[stepIdx].caption;
      if (stepCaptionEl) stepCaptionEl.classList.remove('is-idle');
      if (stepCount) { stepCount.hidden = false; stepCount.textContent = `${stepIdx + 1} / ${count}`; }
    }
  }

  // Called on every sync() (main.js's rebuild() already cancelled any in-flight activePlay
  // by then) — so a construction/param/method/reset change always lands back on the idle
  // "Play construction" / "Play All" labels, not just Step Through's own stepIdx (ADR-159).
  function resetStepThrough() {
    stepIdx = -1;
    playAllInFlight = false;
    if (btnPlayAll) btnPlayAll.textContent = 'Play All';
    playInFlight = false;
    if (btnPlay) btnPlay.textContent = 'Play construction';
    renderStepThrough();
  }

  function goStepNext() {
    const slides = sim.getSlides();
    if (stepIdx >= slides.length - 1) return;
    const nextIdx = stepIdx + 1;
    sim.revealSlide(slides[nextIdx], {});
    stepIdx = nextIdx;
    renderStepThrough();
    sim.announce(`Slide ${stepIdx + 1} of ${slides.length}. ${slides[stepIdx].caption}`);
  }

  function goStepBack() {
    if (stepIdx < 0) return;
    const slides = sim.getSlides();
    stepIdx -= 1;
    sim.showStepsUpTo(stepIdx >= 0 ? slides[stepIdx].endIdx : 0);
    renderStepThrough();
    sim.announce(stepIdx >= 0
      ? `Slide ${stepIdx + 1} of ${slides.length}. ${slides[stepIdx].caption}`
      : 'Back to the start.');
  }

  btnStepNext?.addEventListener('click', goStepNext, listen);
  btnStepBack?.addEventListener('click', goStepBack, listen);

  // ADR-159: stepIdx is now written HERE, at actual completion, not synchronously on click —
  // see renderStepThrough()'s playAllInFlight branch above for what covers the gap in between.
  function endPlayAll() {
    playAllInFlight = false;
    if (btnPlayAll) btnPlayAll.textContent = 'Play All';
    stepIdx = slideCount() - 1;
    renderStepThrough();
  }
  btnPlayAll?.addEventListener('click', () => {
    if (playAllInFlight) {
      sim.skipToEnd();
      endPlayAll();
      sim.announce('Skipped to the finished construction.');
      return;
    }
    playAllInFlight = true;
    if (btnPlayAll) btnPlayAll.textContent = 'Skip to end';
    sim.play({ onComplete: endPlayAll });
    renderStepThrough();
    sim.announce('Playing the construction. Press Skip to end to jump to the finished drawing.');
  }, listen);

  // Space advances like Next, unless focus is already on Back or Play All (each keeps its own
  // native Space activation) — bound to the container, not document, so it's inert everywhere else.
  // Also inert during Play All (ADR-159): Next is disabled on screen at that point (see
  // renderStepThrough()'s playAllInFlight branch), Space must not bypass that.
  stepThroughEl?.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (playAllInFlight) return;
    if (document.activeElement === btnStepBack || document.activeElement === btnPlayAll) return;
    if (e.repeat) { e.preventDefault(); return; }
    e.preventDefault();
    goStepNext();
  }, listen);

  /** (Re)build the method-switcher buttons for the active construction. Rebuilt (not just
   *  re-valued) whenever the construction changes, since the button COUNT itself differs
   *  per construction (pentagon: 3 methods, hexagon/n-gon: 2) — the same reason
   *  renderGivenFields() above rebuilds rather than shows/hides a fixed set. */
  function renderMethodSwitcher() {
    if (!methodSwitcher) return;
    methodSwitcher.innerHTML = '';
    const con = sim.getActiveConstruction();
    if (!con) { methodSwitcher.hidden = true; return; }
    methodSwitcher.hidden = false;
    const params = sim.getParams();
    const active = params.method ?? con.methods[0].id;
    for (const m of con.methods) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'method-switcher__btn';
      btn.dataset.method = m.id;
      btn.setAttribute('aria-pressed', String(m.id === active));
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        if (btn.getAttribute('aria-pressed') === 'true') return;
        sim.commit({ method: m.id });
        sim.announce(`${m.label} method. Press Play to watch it build.`);
      }, listen);
      methodSwitcher.appendChild(btn);
    }
  }

  /** Reflect the active method into already-built switcher buttons (no rebuild). */
  function syncMethodSwitcher() {
    if (!methodSwitcher || methodSwitcher.hidden) return;
    const active = sim.getParams().method;
    for (const btn of methodSwitcher.querySelectorAll('.method-switcher__btn')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.method === active));
    }
  }

  /** Verify step's "You built" recap — the same given values as step 2, restated as a
   *  plain list rather than sliders, so Verify reads as a summary, not just an answer.
   *  Also recaps which method is active — the switcher itself lives in step 3, but Verify
   *  is where the student confirms what they actually built. */
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
    const activeMethod = con.methods.find((m) => m.id === (params.method ?? con.methods[0].id));
    if (activeMethod) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'result-given__label';
      label.textContent = 'Method';
      const value = document.createElement('span');
      value.className = 'result-given__value';
      value.textContent = activeMethod.label;
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
    if (resultPrinciple) {
      const con = sim.getActiveConstruction();
      const principle = con ? con.principle(sim.getParams().method ?? con.methods[0].id) : '';
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

  /** Full refresh — construction change rebuilds fields; a param-only change just re-syncs.
   *  Runs on EVERY sync (not just rebuildFields) because main.js's rebuild() already cleared
   *  #dynamic-layer unconditionally by the time this is called — Step Through's own progress
   *  index needs to follow suit on any param/method/construction change, same as Play All's
   *  existing activePlay?.cancel() does. */
  function sync({ rebuildFields = false } = {}) {
    if (rebuildFields) { renderGivenFields(); renderMethodSwitcher(); }
    else { syncFieldValues(); syncMethodSwitcher(); }
    syncResult();

    const usesSteps = sim.hasSlides();
    if (btnPlay) btnPlay.hidden = usesSteps;
    if (stepThroughEl) stepThroughEl.hidden = !usesSteps;
    if (replayHint) replayHint.hidden = usesSteps;
    resetStepThrough();
  }

  return { sync, dispose: () => ac.abort() };
}
