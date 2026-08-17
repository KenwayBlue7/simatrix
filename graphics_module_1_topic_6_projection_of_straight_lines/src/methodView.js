// methodView.js — the Show Method takeover shell for the True-Length construction (ADR-165).
//
// A full-viewport, focus-trapped, beat-gated Back/Next walkthrough — Module 2's Show Method
// SHAPE (methodController.js's {sync,dispose} handle, one AbortController, the focus trap,
// Escape/Space handling), ported as a CONTRACT rather than as code (ADR-077 precedent: "the
// interaction model is what's reused, re-expressed against the surface this topic actually
// has"). What Module 2 does NOT bring: Sets, focus chips, Skip, the ghost/tilt, the 3D-pose
// split, or a beat counter (ADR-089 rejected the counter platform-wide). This topic has one
// line and one construction — no Sets concept applies (see DECISIONS.md ADR-165).
//
// This module is presentation ONLY. It owns no geometry, no timing, no beat data — beat state
// is delegated entirely to constructionStepper.js (the SAME beat-gated adapter the in-Compare
// `.con-nav` row already uses), instantiated by `sim.method.begin()` on open. All render-surface
// plumbing (re-parenting the 2D Compare sheet's existing stage, mounting the construction,
// building the leaf) lives in main.js, which is the only place that owns compareSheet /
// sheetRenderer / the construction leaf (ADR-007).
//
// Layering (ADR-007 / RULES.md §3.6): leaf module — imports nothing; main.js wires it.

/**
 * @param {{
 *   method: {
 *     canRun: () => boolean,
 *     begin: (nav: { captionEl: HTMLElement, backBtn: HTMLButtonElement, nextBtn: HTMLButtonElement }) => boolean,
 *     end: () => void,
 *   },
 *   announce: (msg: string) => void,
 * }} sim — the simController surface this leaf reads (main.js).
 * @returns {{ sync: () => void, close: () => void, dispose: () => void }}
 */
export function initMethodView(sim) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };
  const $ = (id) => document.getElementById(id);

  const launchBtn = $('btn-show-method');
  const viewEl = $('method-view');
  const captionEl = $('method-caption');
  const backBtn = $('method-back');
  const nextBtn = $('method-next');
  const exitBtn = $('method-exit');

  // Degrade to a no-op stub rather than throw if any required node is missing — mirrors
  // methodController.js's own hard-init guard.
  if (!launchBtn || !viewEl || !captionEl || !backBtn || !nextBtn || !exitBtn) {
    return { sync: () => {}, close: () => {}, dispose: () => {} };
  }

  let running = false;

  // --- Focus trap + Escape (scoped to the view; harmless while it is hidden) ---
  function focusables() {
    return [...viewEl.querySelectorAll('button')].filter((n) => !n.disabled && n.offsetParent !== null);
  }

  function onViewKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); stop(); return; }
    // Space as an alternate Next: swallow e.repeat (holding Space must not machine-gun beats),
    // and skip the synthetic click when nextBtn itself already has focus — its native Space
    // activation would otherwise fire this SAME click a second time.
    if (e.key === ' ') {
      if (e.repeat || document.activeElement === nextBtn) return;
      e.preventDefault();
      nextBtn.click();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function start() {
    if (running || launchBtn.disabled) return;
    const ok = sim.method.begin({ captionEl, backBtn, nextBtn });
    if (!ok) return;
    running = true;
    viewEl.hidden = false;
    launchBtn.hidden = true;
    sim.announce('Show Method opened — the True Length construction, step by step.');
    exitBtn.focus();
  }

  function stop() {
    if (!running) return;
    running = false;
    sim.method.end();
    viewEl.hidden = true;
    launchBtn.hidden = false;
    sim.announce('Show Method closed.');
    launchBtn.focus();
  }

  /** Re-derive the launcher's hidden/disabled state from live sim state (folded + a
   *  constructible line). No-op while the view is already open — sync() never fights the
   *  learner's own place in the walkthrough. */
  function sync() {
    if (running) return;
    launchBtn.disabled = !sim.method.canRun();
  }

  launchBtn.addEventListener('click', start, listen);
  exitBtn.addEventListener('click', stop, listen);
  viewEl.addEventListener('keydown', onViewKeydown, listen);

  sync();

  return {
    sync,
    /** Force-close from OUTSIDE (unfold, reset, an external simAPI.reset() call) — idempotent. */
    close: stop,
    dispose() { ac.abort(); },
  };
}
