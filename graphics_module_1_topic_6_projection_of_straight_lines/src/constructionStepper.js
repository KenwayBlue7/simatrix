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
// Layering (ADR-007 / CLAUDE.md §3.6): leaf module — imports nothing, main.js wires it.

/**
 * @param {{
 *   leaf: { group, animate: (p: number) => void, duration: number, phases?: {t:number, caption:string}[] },
 *   captionEl?: HTMLElement,
 *   backBtn?: HTMLButtonElement,
 *   nextBtn?: HTMLButtonElement,
 *   startIndex?: number,
 * }} o
 * @returns {{ index: () => number, count: () => number, goNext: () => void, goBack: () => void, sync: () => void }}
 */
export function initConstructionStepper({ leaf, captionEl, backBtn, nextBtn, startIndex = 0 }) {
  const phases = leaf.phases ?? [];
  let i = Math.min(Math.max(startIndex, 0), Math.max(phases.length - 1, 0));

  function sync() {
    if (backBtn) backBtn.disabled = phases.length === 0 || i === 0;
    if (nextBtn) nextBtn.disabled = phases.length === 0 || i >= phases.length - 1;
    if (captionEl) captionEl.textContent = phases[i]?.caption ?? '';
  }

  function render() {
    leaf.animate(phases[i]?.t ?? 0);
    sync();
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

  render();
  return { index: () => i, count: () => phases.length, goNext, goBack, sync };
}
