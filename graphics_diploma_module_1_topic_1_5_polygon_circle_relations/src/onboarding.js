// First-run orientation. Two quiet aids, both dismissible and shown at most once:
//   1. Empty-state overlay — shown in the viewport until a construction is chosen, so the
//      empty area points back at the Step-1 picker instead of reading as a dead void.
//   2. A one-time "Press Play to watch it build" hint, shown the first time a learner
//      reaches the Construct step.
// No orbit hint here (unlike the platform's 3D topics) — this viewport has nothing to
// drag; the only first-run friction is knowing the Play button exists.
//
// Sandboxed-iframe note (CLAUDE.md "no same-origin assumptions"): localStorage can throw
// in a sandboxed iframe, so every access is guarded and falls back to an in-session flag.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls setConstructionPresent()
// from rebuild() and playHint() when the Construct step is first shown.

const PLAY_HINT_KEY = 'simatrix-diploma-play-hint-seen';

export function initOnboarding() {
  const empty = document.getElementById('vp-empty');
  const hint = document.getElementById('vp-play-hint');
  const dismissBtn = document.getElementById('vp-play-hint-dismiss');

  let present = false;
  const seenMem = new Set();

  const isSeen = (key) => {
    if (seenMem.has(key)) return true;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  };
  const markSeen = (key) => {
    seenMem.add(key);
    try { localStorage.setItem(key, '1'); } catch { /* sandboxed: in-session only */ }
  };

  function hideHint() {
    if (!hint) return;
    hint.classList.remove('is-visible');
    hint.hidden = true;
  }
  function dismissHint() {
    markSeen(PLAY_HINT_KEY);
    hideHint();
  }

  dismissBtn?.addEventListener('click', dismissHint);

  /** Reflect whether a construction is currently chosen. main.js calls this from rebuild(). */
  function setConstructionPresent(on) {
    if (empty) empty.hidden = on;
    if (!on) hideHint();
    present = on;
  }

  /** Show the one-time Play hint. main.js calls this when the Construct step is first shown. */
  function playHint() {
    if (!hint || isSeen(PLAY_HINT_KEY) || !present) return;
    hint.hidden = false;
    requestAnimationFrame(() => hint.classList.add('is-visible'));
  }

  setConstructionPresent(false);
  return { setConstructionPresent, playHint, dismissHint };
}
