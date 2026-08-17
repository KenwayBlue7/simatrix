// constructionStepper.js — discrete Next/Back adapter over a construction leaf's existing
// animate(p) contract (trueLength.js / traces.js). Owns none of the animation timing or
// geometry: it walks a leaf-supplied `phases` array and calls `leaf.animate(phases[i].t)` once
// per click — the SAME entry point main.js's runCon() continuous rAF ramp already calls, just
// with a discrete t instead of a ramping one. Mirrors Module2's methodController.js shape (one
// int of local state, Next/Back, a caption sync, no read-back into the leaf), scaled down: no
// harvest step is needed here because animate(p) is already a pure function of p (idempotent,
// no accumulation) — Module2's Sets needed a one-time snapshot because each Set was a genuinely
// different pose; a single p-driven leaf never needs that.
//
// Beat-to-beat MOTION (was a flat snap until this pass — see DECISIONS.md ADR-165 amendment):
// each Next/Back TWEENS p from the previous beat's t to the new beat's t, rather than jumping
// straight there, so stepped nav reads at the same quality as the continuous Replay ramp
// (runCon() in main.js) it sits beside. This module still owns no timing engine of its own
// (RULES.md §3.6 — a leaf imports nothing): the caller INJECTS a `startTween` driver
// (main.js supplies one backed by src/anim.js's tween(), ticked by the existing render loop).
// Omit `startTween` and this module falls back to the original instant snap — kept so the
// adapter stays usable/testable standalone, with no hard dependency on anim.js.
//
// Layering (ADR-007 / CLAUDE.md §3.6): leaf module — imports nothing, main.js wires it.

const MIN_TWEEN_MS = 350;
const MAX_TWEEN_MS = 1200;

/**
 * @param {{
 *   leaf: { group, animate: (p: number) => void, duration: number, phases?: {t:number, caption:string}[] },
 *   captionEl?: HTMLElement,
 *   backBtn?: HTMLButtonElement,
 *   nextBtn?: HTMLButtonElement,
 *   startIndex?: number,
 *   startTween?: (o: { from: number, to: number, duration: number, onUpdate: (v: number) => void }) => { cancel: () => void },
 * }} o
 * @returns {{ index: () => number, count: () => number, goNext: () => void, goBack: () => void, sync: () => void, dispose: () => void }}
 */
export function initConstructionStepper({ leaf, captionEl, backBtn, nextBtn, startIndex = 0, startTween }) {
  const phases = leaf.phases ?? [];
  let i = Math.min(Math.max(startIndex, 0), Math.max(phases.length - 1, 0));

  // Live animation progress — starts pinned to the initial beat's own t (the same value
  // render()'s old unconditional snap would have produced), so the first Next tweens FROM the
  // beat actually on screen rather than from 0.
  let p = phases[i]?.t ?? 0;
  let activeTween = null;

  function sync() {
    if (backBtn) backBtn.disabled = phases.length === 0 || i === 0;
    if (nextBtn) nextBtn.disabled = phases.length === 0 || i >= phases.length - 1;
    if (captionEl) captionEl.textContent = phases[i]?.caption ?? '';
  }

  /** Advance the leaf to the CURRENT beat's t, either instantly (no driver, or already there)
   *  or by tweening from wherever `p` currently sits — which is the in-flight value if a click
   *  interrupts a tween already in progress, not the old beat's resting t. Caption/disabled
   *  state sync IMMEDIATELY so the chrome never lags the motion. */
  function render() {
    activeTween?.cancel();
    activeTween = null;
    const target = phases[i]?.t ?? 0;
    sync();
    if (!startTween || Math.abs(target - p) < 1e-6) {
      p = target;
      leaf.animate(p);
      return;
    }
    const duration = Math.min(
      Math.max(Math.abs(target - p) * leaf.duration, MIN_TWEEN_MS),
      MAX_TWEEN_MS,
    );
    activeTween = startTween({
      from: p,
      to: target,
      duration,
      onUpdate: (v) => { p = v; leaf.animate(v); },
    });
  }

  function goNext() {
    if (i >= phases.length - 1) return;
    i += 1;
    render();
  }

  function goBack() {
    if (i === 0) return;
    i -= 1;
    render();
  }

  render(); // paints the start beat — target === p, so this always takes the instant-snap path above
  return {
    index: () => i,
    count: () => phases.length,
    goNext,
    goBack,
    sync,
    /** Cancel any in-flight tween without touching the leaf — call before dropping the leaf
     *  reference (teardownCon()/replayCon()/methodEnd() in main.js) so a straggling onUpdate
     *  never calls animate() on a disposed overlay. */
    dispose() { activeTween?.cancel(); activeTween = null; },
  };
}
