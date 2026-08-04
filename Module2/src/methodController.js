// Show Method (ADR-084 pedagogy, ADR-085 container) — Step-6 walkthrough that replays the
// CURRENTLY loaded problem's textbook construction as 2 or 3 side-by-side Sets, drawn into its
// OWN full-viewport takeover (#method-view/#method-canvas in index.html). Leaf module, mirroring
// problemLibrary.js's own shape: one initMethodController(sim) export, owns its own DOM + beat-
// sequencing state + focus trap, reaches the engine only through simController.method (never
// touches main.js's internals directly, never imports stepper.js).
//
// ADR-085 correction (this module was rewritten same-day as ADR-084 shipped, after live testing
// surfaced a container mismatch — see DECISIONS.md ADR-085 for the full "why"): Show Method no
// longer lives inside the Compare split/workbench. It is a dedicated, focus-trapped, full-
// viewport takeover — mirroring #problem-library's own shell exactly (main.js pauses the sim
// loop on open/resume on close, matching that same contract). Two consequences for this file:
//   1. The DOM is now STATIC markup (index.html), not built here — this module queries it, same
//      as problemLibrary.js queries #problem-library rather than creating it.
//   2. The takeover is fully independent of Compare: no split ever opens, so Step 1/2's drivers
//      never leave the (now-covered) wizard panels. The rail-edit abort listener ADR-084 needed
//      here (because the split re-parented those drivers into a rail that stayed live) is
//      GENUINELY DEAD under ADR-085 and has been deleted — stepper.js's own abort-on-edit
//      (reflowFrom) is kept as a no-op invariant guard, but this module's half of it is gone.
// The title bar ("Set X of Y — <description>") is REMOVED per ADR-085 — Back/Next/Exit float
// bottom-centre, Set-N focus chips float top-right, both overlaying the drawing directly.
//
// Beat count MUST match main.js's own METHOD_BEAT_COUNT (ADR-089: 14 — xy (sheet-wide, drawn
// once, outside the per-Set beat gate) · outline/visible-face/hidden-face/visible-generators/
// hidden-generators for view A · projectors · the same 5 for view B · axis · labels — dimensions
// dropped from the replay, ADR-089) — duplicated here rather than round-tripped through
// simController, the same small-constant-duplication precedent projectionDrawer.js already sets
// for WORLD_TO_MM (its own header note explains why: a leaf keeps its own copy rather than
// reaching back into the orchestrator for a number that essentially never changes). The two
// constants MUST move together — see main.js's own METHOD_BEAT_COUNT comment. ADR-094: this was
// a comment-only invariant, so initMethodController now asserts it against `sim.method.beatCount`
// at init and refuses to wire up on mismatch (see the guard just below the DOM lookups) rather
// than let the two silently drift out from under `goNext`'s beat-boundary math.

const BEAT_COUNT = 14;

/**
 * @param {import('../main.js').simController} sim  Narrow engine surface — only
 *   sim.method.{canRun,begin,end,isActive,setProgress,setFocus,sets,hasContent,beatCount,
 *   beatLabel,canTilt,playTilt}, sim.announce, sim.onStateChange. `sim.method.abort` is called by
 *   stepper.js directly, never from here —
 *   see sync()'s own header for why external teardown is a one-way, reconciled-not-called-back
 *   flow.
 * @returns {{ sync: () => void, dispose: () => void }}
 */
export function initMethodController(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };

  const btnShowMethod = document.getElementById('btn-show-method');
  const viewEl = document.getElementById('method-view');
  const chipRow = document.getElementById('method-chips');
  const captionEl = document.getElementById('method-caption'); // ADR-094
  const nextBtn = document.getElementById('method-next');
  const backBtn = document.getElementById('method-back');
  const skipBtn = document.getElementById('method-skip-set'); // ADR-087 Decision 2
  const exitBtn = document.getElementById('method-exit');
  const replayBtn = document.getElementById('method-replay-turn'); // ADR-105: turn replay control
  if (!viewEl || !chipRow || !captionEl || !nextBtn || !backBtn || !skipBtn || !exitBtn || !replayBtn) {
    // Takeover markup missing (shouldn't happen — index.html ships it) — degrade to a no-op
    // rather than throw, matching problemLibrary.js's own ac.abort()-guarded degrade shape.
    return { sync: () => {}, dispose: () => {} };
  }
  if (sim.method.beatCount !== BEAT_COUNT) {
    // ADR-094: this file's BEAT_COUNT and main.js's METHOD_BEAT_COUNT are hand-duplicated by
    // design (ADR-087) — if they ever drift, main.js's setMethodProgress clamps the excess
    // silently while this controller's own flatIndex() keeps counting past it, reproducing
    // "Next does nothing" wholesale with no error anywhere. Fail loud instead of trusting the
    // comment: refuse to wire up, same no-op degrade as the missing-markup guard above.
    console.error(
      `Show Method beat-count mismatch: main.js reports ${sim.method.beatCount}, `
      + `methodController.js expects ${BEAT_COUNT} — refusing to start (ADR-087/ADR-094).`,
    );
    return { sync: () => {}, dispose: () => {} };
  }

  // ----------------------------------------------------------------------------
  // State — local to this controller (main.js's methodSet/methodBeat are write-only from
  // here via sim.method.setProgress; Next/Back are the only things that move them, so there
  // is nothing to read back — see ADR-084's "Revised state model": method progress is owned by
  // Next/abort, focus is a fully separate variable this module never touches except via
  // sim.method.setFocus).
  // ----------------------------------------------------------------------------
  let running = false;
  let curSet = 0;
  let curBeat = 0;
  let setCount = 0;
  let finalIndex = 0; // ADR-094 — see computeFinalIndex()

  function totalBeats() { return setCount * BEAT_COUNT; }
  function flatIndex() { return curSet * BEAT_COUNT + curBeat; }

  /** ADR-094 — the true last beat that draws something, scanned once per run (`contentBeats`
   *  is fixed at `begin()` time, so this can't change mid-run). Replaces the positional
   *  `totalBeats() - 1` ADR-090 left in goNext's entry guard/loop and renderProgress's `isLast`:
   *  that positional test let a pose whose final beat (13, labels) draws nothing repaint an
   *  identical frame on the very last click — the exact "Next does nothing" defect ADR-090
   *  otherwise fixed, surviving at the one beat a learner is most likely to remember. Always
   *  finds SOME index: beat 0 of every Set is hardcoded content-bearing (hasVisibleContent), so
   *  the scan can never fall past the last Set's own beat 0. */
  function computeFinalIndex() {
    for (let i = totalBeats() - 1; i >= 0; i -= 1) {
      if (hasVisibleContent(Math.floor(i / BEAT_COUNT), i % BEAT_COUNT)) return i;
    }
    return 0;
  }

  function renderChips() {
    const sets = sim.method.sets();
    chipRow.innerHTML = '';
    sets.forEach((s, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'set-chip';
      chip.dataset.focusSet = String(i);
      chip.textContent = `Set ${i + 1}`;
      // One-way-back gate (stepper.js:148-157 precedent): a Set can be focused once the
      // walkthrough has actually drawn it at least once — chips never MOVE the sequence
      // (ADR-084 Decision 7), they can just refuse to target an empty block.
      chip.disabled = !s.reached;
      const stateWord = s.reached ? 'ready to focus' : 'not drawn yet';
      chip.setAttribute('aria-label', `${chip.textContent}, ${s.label}, ${stateWord}`);
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        const alreadyActive = chip.classList.contains('is-active');
        for (const c of chipRow.children) {
          c.classList.remove('is-active');
          c.setAttribute('aria-pressed', 'false');
        }
        if (alreadyActive) {
          sim.method.setFocus(null); // re-click precedent (main.js setView): zoom back out
        } else {
          chip.classList.add('is-active');
          chip.setAttribute('aria-pressed', 'true');
          sim.method.setFocus(i);
        }
      });
      chipRow.appendChild(chip);
    });
  }

  function renderProgress() {
    const sets = sim.method.sets();
    backBtn.disabled = flatIndex() === 0;
    // ADR-094: content-aware, not positional — "Done" now lands on the true last beat that
    // draws something, not the 14th slot regardless of whether it's empty (ADR-090's own
    // defect, surviving at exactly this one spot before this fix).
    const isLast = flatIndex() >= finalIndex;
    nextBtn.textContent = isLast ? 'Done' : 'Next step';
    // ADR-087 Decision 2: no Set left to skip TO once the walkthrough is on its last Set —
    // mirrors the click-cost mitigation the 15-beat/Set template needs (BEAT_COUNT comment).
    // ADR-094: hidden AND disabled — index.html's own comment already documented "hidden
    // entirely on the walkthrough's last Set", but the code only ever disabled it, leaving a
    // permanently dead button visible for the entire final Set.
    const noSetToSkipTo = curSet >= setCount - 1;
    skipBtn.hidden = noSetToSkipTo;
    skipBtn.disabled = noSetToSkipTo;
    // ADR-105: turn-replay control — hidden (not merely disabled) whenever the current Set isn't
    // a tilt's destination — focusables() below selects `button` and filters on offsetParent, so
    // a hidden button needs no separate focus-trap handling. Re-checked every renderProgress
    // (Next/Back/Skip all call it), same cadence as the skip button's own hidden state above.
    replayBtn.hidden = !sim.method.canTilt();
    // Re-render chip reached-state every step — a chip flips from disabled to enabled the
    // moment Next first draws its Set (mirrors stepper.js's rail re-render on every step).
    const chips = chipRow.querySelectorAll('.set-chip');
    sets.forEach((s, i) => { if (chips[i]) chips[i].disabled = !s.reached; });
  }

  // --- Focus trap + Escape (scoped to the takeover; harmless while it is hidden) — mirrors
  // problemLibrary.js's own overlay trap exactly. This is the ONLY thing keeping Tab out of the
  // covered Step 1/2 sliders under ADR-085 (no split ever opens, so there is no rail to bind a
  // second abort listener to) — load-bearing, not decoration. ---
  function focusables() {
    return [...viewEl.querySelectorAll('button')].filter(
      (node) => !node.disabled && node.offsetParent !== null,
    );
  }

  /** Spacebar as an alternate Next trigger — bound on `viewEl` (not `document`), so it is a
   *  structural no-op everywhere the takeover isn't covering: every slider/input in the app
   *  lives outside `#method-view` (fixed, inset:0, hidden when closed), and this listener is
   *  torn down with the rest of this module's DOM wiring (`ac.abort()`), so it can't leak past
   *  Exit/Escape either. The pill's OTHER buttons (Back/Skip/Exit/Tilt/chips) keep their native
   *  Space activation — this only steps in when focus is on `#method-next` itself or nowhere
   *  more specific inside the view (e.g. right after `start()`'s own `nextBtn.focus()`). */
  function onViewSpace(e) {
    const el = document.activeElement;
    if (el && el !== nextBtn && el.tagName === 'BUTTON' && viewEl.contains(el)) return;
    if (e.repeat) { e.preventDefault(); return; } // holding Space must not machine-gun beats
    e.preventDefault(); // suppress page scroll AND nextBtn's own native activation (no double-fire)
    goNext();
  }

  function onViewKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      stop();
      return;
    }
    if (e.code === 'Space' || e.key === ' ') {
      onViewSpace(e);
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function start() {
    if (running) return;
    const ok = sim.method.begin();
    if (!ok) return;
    running = true;
    curSet = 0;
    curBeat = 0;
    const sets = sim.method.sets();
    setCount = sets.length;
    finalIndex = computeFinalIndex(); // ADR-094 — depends on setCount, so computed after it's set
    sim.method.setProgress(curSet, curBeat);
    chipRow.hidden = false;
    if (btnShowMethod) btnShowMethod.hidden = true;
    renderChips();
    renderProgress();
    captionEl.textContent = sim.method.beatLabel(curSet, curBeat); // ADR-094
    nextBtn.focus();
    sim.announce(`Show Method started. Set 1 of ${setCount} — ${sets[0]?.label ?? ''}.`);
  }

  /** Normal completion — Next past the last beat, Exit button, or Escape. External teardown
   *  (stepper.js's sim.method.abort(), or a full sim reset) does NOT come through here — see
   *  sync()'s own reconciliation branch below for why that's a separate, one-way path rather
   *  than a second call into this function. */
  function stop() {
    if (!running) return;
    running = false;
    chipRow.hidden = true;
    chipRow.innerHTML = '';
    captionEl.textContent = '';
    if (btnShowMethod) btnShowMethod.hidden = false;
    sim.method.end();
    sim.announce('Show Method finished.');
    btnShowMethod?.focus();
    sync();
  }

  /** A beat is worth landing on if it is a Set's first beat (the caption reveal — always a
   *  visible change) or the engine reports it actually adds a NEW mark to the sheet (ADR-095:
   *  not just "this beat's own array is non-empty" — a beat can be non-empty and still redraw
   *  exactly what an earlier beat already put on the sheet, e.g. a top view's outline and
   *  visible-face beats tracing the identical silhouette, or a prism's vertical generators
   *  flattening to points in that same view). Either way, the old symptom was the same: a
   *  Next click producing an identical frame — this is what "Next did nothing" was, not a
   *  stuck click. */
  function hasVisibleContent(set, beat) {
    return beat === 0 || sim.method.hasContent(set, beat);
  }

  /** A0 fix (ADR-094) — a Set-N focus chip left zoomed in made Next/Back draw beyond the
   *  visible viewport the moment the walkthrough crossed into a different Set: the button
   *  responded, the sheet just changed off-screen, reading exactly like a dead Next. Clears the
   *  chip's active state AND re-frames to the whole row (`sim.method.setFocus(null)`) — never
   *  called for an in-Set beat advance, and never touches curSet/curBeat itself (ADR-084
   *  Decision 7: chips never move the sequence, only the camera). */
  function clearFocusChip() {
    const active = chipRow.querySelector('.set-chip.is-active');
    if (!active) return;
    active.classList.remove('is-active');
    active.setAttribute('aria-pressed', 'false');
    sim.method.setFocus(null);
  }

  /** ADR-094/-095 — plain-language orientation for the CURRENT beat, pushed into both the
   *  visible `#method-caption` top-title row and the platform's single `#sim-status` announce
   *  channel (main.js's `announce()`). Deliberately not a step count — see `methodBeatLabel`'s
   *  own header (main.js) for why that's a separate, already-rejected fix (ADR-089 Decision 2). */
  function syncCaption() {
    const text = sim.method.beatLabel(curSet, curBeat);
    captionEl.textContent = text;
    sim.announce(text);
  }

  function goNext() {
    if (!running) return;
    if (flatIndex() >= finalIndex) { stop(); return; }
    const prevSet = curSet;
    do {
      curBeat += 1;
      if (curBeat >= BEAT_COUNT) { curBeat = 0; curSet += 1; }
    } while (flatIndex() < finalIndex && !hasVisibleContent(curSet, curBeat));
    const crossedSet = curSet !== prevSet;
    if (crossedSet) clearFocusChip();
    sim.method.setProgress(curSet, curBeat);
    renderProgress();
    syncCaption();
    // ADR-105/-110: the Set-to-Set ghost (turn OR tilt) is this click, not a separate "Watch the
    // turn" button — curBeat===0 is always true on a set crossing (beat 0 is hardcoded
    // content-bearing, see hasVisibleContent), and canTilt() is only true when the JUST-ENTERED
    // Set is ghost-eligible, so this fires exactly once per forward crossing into such a Set.
    // sim.method.playTilt() is idempotent
    // and self-gating (startMethodTilt no-ops with a false return otherwise) — called AFTER
    // syncCaption() so the tilt's own announce() (turning..., then landed) is what's actually
    // read out, not immediately overwritten by it. Deliberately not wired into goSkipSet (Skip
    // exists to cut click cost, ADR-087 Decision 2 — playing a 1.65s animation there fights that)
    // or goBack (matches setMethodProgress's own "only a genuine forward step animates" rule).
    if (crossedSet && sim.method.canTilt()) sim.method.playTilt();
  }

  function goBack() {
    if (!running || flatIndex() === 0) return;
    const prevSet = curSet;
    do {
      curBeat -= 1;
      if (curBeat < 0) { curSet -= 1; curBeat = BEAT_COUNT - 1; }
    } while (flatIndex() > 0 && !hasVisibleContent(curSet, curBeat));
    if (curSet !== prevSet) clearFocusChip();
    sim.method.setProgress(curSet, curBeat);
    renderProgress();
    syncCaption();
  }

  /** ADR-087 Decision 2 — jumps to the NEXT Set's first beat only, never past the whole method
   *  (the "36-click ceiling" question this mitigates was about a single Set's length, not about
   *  skipping the walkthrough itself). No-op on the last Set — the button is hidden+disabled
   *  there (renderProgress) as the primary guard; this check is the load-bearing one for a stray
   *  click/Enter that lands between disable and click, same defensive shape as goBack's own
   *  `flatIndex() === 0` guard. Always crosses a Set boundary, so always clears the focus chip
   *  (ADR-094 A0 fix). */
  function goSkipSet() {
    if (!running || curSet >= setCount - 1) return;
    curSet += 1;
    curBeat = 0;
    clearFocusChip();
    sim.method.setProgress(curSet, curBeat);
    renderProgress();
    syncCaption();
  }

  btnShowMethod?.addEventListener('click', start, listen);
  nextBtn.addEventListener('click', goNext, listen);
  skipBtn.addEventListener('click', goSkipSet, listen);
  backBtn.addEventListener('click', goBack, listen);
  exitBtn.addEventListener('click', stop, listen);
  // ADR-105: explicit replay, not the primary trigger anymore (goNext auto-plays the turn on the
  // Set 2 -> Set 3 crossing) — no-op (not disabled) if the Set changed out from under a stale
  // click, or a tilt is already playing — sim.method.playTilt() itself is idempotent
  // (startMethodTilt cancels a live tilt before starting a new one, the same ADR-091
  // cancel-and-snap contract Next already relies on).
  replayBtn.addEventListener('click', () => sim.method.playTilt(), listen);
  viewEl.addEventListener('keydown', onViewKeydown, listen);

  /** Re-evaluate the Step-6 trigger's visible/enabled state AND reconcile against an EXTERNAL
   *  teardown. Two callers never route through stop() above: stepper.js's own
   *  `sim.method.abort()` (reflowFrom / unfold-while-editing) and a full sim reset — both tear
   *  the ENGINE down directly (see simController.method.abort's header for why that's
   *  deliberate: this controller's DOM shouldn't need a second, competing teardown entry
   *  point). So if `running` is still true here but the engine says otherwise
   *  (sim.method.isActive() false), the walkthrough was stopped out from under this
   *  controller — catch up its own DOM/state before computing the trigger button's state. */
  function sync() {
    if (!btnShowMethod) return;
    if (running && !sim.method.isActive()) {
      running = false;
      chipRow.hidden = true;
      chipRow.innerHTML = '';
      captionEl.textContent = '';
    }
    const can = sim.method.canRun();
    btnShowMethod.hidden = running; // stays hidden while running regardless of canRun()
    btnShowMethod.disabled = !can;
  }

  const unsubscribe = sim.onStateChange(sync);
  sync();

  return {
    sync,
    dispose() {
      unsubscribe?.();
      ac.abort();
    },
  };
}
