// onboarding.js — Module 1 first-run viewport aids (orbit hint + contextual spotlights).
//
// Ported from Module 2's src/onboarding.js, adapted to Module 1:
//   • NO empty-state overlay / setSolidPresent(). Module 1 boots straight into a populated
//     scene, so there is no "add a solid first" gap to fill. The orbit hint is instead
//     driven by the engine, which calls showOrbitHint() on any step that declares
//     orbitHint:true (every lesson's step 0 does).
//   • The spotlight copy is NOT hard-coded here. The engine passes the active lesson's
//     cfg.spotlights dict into initOnboarding(controls, spotlights), so each lesson owns its
//     own reveal copy + tone (Points / Lines author them; intro lessons pass none).
//
// Two quiet aids, both dismissible and shown at most once:
//   1. Orbit hint — a one-time "Drag to rotate" chip. The 3D view is drag-to-orbit but
//      nothing advertises that; an anxious beginner could misread a projection that looks
//      flat from the default angle. Auto-dismisses on the first orbit interaction.
//   2. Contextual spotlights — the same chip treatment, reused to point out a feature the
//      FIRST time it is revealed (top view, front view, the fold, …). A shared queue plays
//      them ONE AT A TIME (DESIGN.md "Quiet Chrome" — never stack / spam). Each is
//      first-seen-once (persisted), auto-dismisses, and also dismisses on click or first orbit.
//
// Sandboxed-iframe note (CLAUDE.md "no same-origin assumptions"): localStorage can throw a
// SecurityError in a sandboxed iframe, so every access is guarded and falls back to an
// in-session Set. Worst case a hint shows once per load, which is harmless (the chips are
// dismissible and self-dismiss on the first orbit).
//
// Layering: leaf module, imports nothing. The engine owns OrbitControls and calls
// showOrbitHint()/hideOrbitHint()/spotlight() from renderStep() as each step is reached.

const ORBIT_HINT_KEY = 'simatrix-m1-orbit-hint-seen';

/** Per-id persistence key for the contextual spotlight hints. */
const spotlightKey = (id) => `simatrix-m1-hint-${id}-seen`;

/** ms a spotlight stays up before auto-dismissing — generous for the anxious persona. */
const HINT_HOLD = 4500;
/** ms to let the fade-out finish before the chip leaves layout / the next hint plays. */
const FADE_OUT_MS = 240;

const TONE_CLASSES = ['vp-spotlight--hp', 'vp-spotlight--vp', 'vp-spotlight--ink'];

/**
 * @param {{ addEventListener: (type: string, fn: () => void) => void }} controls
 *   OrbitControls (its 'start' event marks the first view interaction).
 * @param {Record<string, { tone: 'hp'|'vp'|'ink', text: string }>} [spotlights]
 *   The active lesson's cfg.spotlights — reveal copy + tone keyed by spotlight id.
 * @returns {{ showOrbitHint: () => void, hideOrbitHint: () => void,
 *            spotlight: (id: string) => void, cue: (text: string, tone?: string) => void,
 *            clearSpotlights: () => void }}
 */
export function initOnboarding(controls, spotlights = {}) {
  const hint = document.getElementById('vp-orbit-hint');
  const dismissBtn = document.getElementById('vp-orbit-dismiss');

  const spot = document.getElementById('vp-spotlight');
  const spotText = spot?.querySelector('.vp-spotlight__text');
  const spotDismiss = document.getElementById('vp-spotlight-dismiss');

  const seenMem = new Set(); // in-session fallback when storage is blocked

  const isSeen = (key) => {
    if (seenMem.has(key)) return true;
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  };
  const markSeen = (key) => {
    seenMem.add(key);
    try { localStorage.setItem(key, '1'); } catch { /* sandboxed: in-session only */ }
  };

  // --- Orbit hint -----------------------------------------------------------
  // hideOrbitHint() is a plain hide (does NOT mark seen) so leaving and returning to an
  // orbitHint step re-shows it; dismissOrbitHint() persists it (× button / first orbit).
  function hideOrbitHint() {
    if (!hint) return;
    hint.classList.remove('is-visible');
    hint.hidden = true;
  }
  function showOrbitHint() {
    if (!hint || isSeen(ORBIT_HINT_KEY)) return;
    hint.hidden = false;
    // Next frame so the opacity transition runs (instant under reduced motion).
    requestAnimationFrame(() => hint.classList.add('is-visible'));
  }
  function dismissOrbitHint() {
    markSeen(ORBIT_HINT_KEY);
    hideOrbitHint();
  }

  // --- Contextual chips (queued, one at a time) -----------------------------
  // The queue holds normalized specs { text, tone, key?, id? } so two callers share the SAME
  // bottom-centre chip + animation: spotlight() enqueues a FIRST-SEEN hint (carries an `id`
  // for dedupe and a `key` for persistence), and cue() enqueues an AD-HOC, replayable nudge
  // (no id/key — it fires every call).
  const queue = [];
  let activeSpot = null;    // spec currently showing, or null when the slot is free
  let spotTimer = null;     // auto-dismiss hold
  let spotHideTimer = null; // post-fade re-hide

  /** Enqueue a first-seen hint. No-op if unknown, already seen, or already pending. */
  function spotlight(id) {
    if (!spot || !spotlights[id]) return;
    if (isSeen(spotlightKey(id))) return;
    if (activeSpot?.id === id || queue.some((q) => q.id === id)) return;
    const spec = spotlights[id];
    const tone = TONE_CLASSES.includes(`vp-spotlight--${spec.tone}`) ? spec.tone : 'ink';
    queue.push({ id, text: spec.text, tone, key: spotlightKey(id) });
    if (!activeSpot) showNextSpot();
  }

  /**
   * Flash an ad-hoc contextual chip. Unlike spotlight(), this REPLAYS on every call (no
   * persistence, no dedupe) so a per-event nudge can fire each time its trigger recurs.
   * @param {string} text  Chip copy.
   * @param {'hp'|'vp'|'ink'} [tone]  Dot colour tone (falls back to 'ink' if unknown).
   */
  function cue(text, tone = 'ink') {
    if (!spot || !text) return;
    const safeTone = TONE_CLASSES.includes(`vp-spotlight--${tone}`) ? tone : 'ink';
    queue.push({ text, tone: safeTone });
    if (!activeSpot) showNextSpot();
  }

  function showNextSpot() {
    if (activeSpot || !spot) return; // one at a time
    const item = queue.shift();
    if (!item) return;

    // The orbit hint has done its job by the time the first chip fires and shares the
    // bottom-centre slot — retire it so only one chip occupies the slot.
    if (hint && !hint.hidden) dismissOrbitHint();

    activeSpot = item;
    if (item.key) markSeen(item.key); // first-seen spotlights persist; ad-hoc cues do not
    if (spotText) spotText.textContent = item.text;
    spot.classList.remove(...TONE_CLASSES);
    spot.classList.add(`vp-spotlight--${item.tone}`);

    clearTimeout(spotHideTimer);
    spot.hidden = false;
    // Next frame so the opacity transition runs (instant under reduced motion).
    requestAnimationFrame(() => spot.classList.add('is-visible'));

    clearTimeout(spotTimer);
    spotTimer = setTimeout(dismissSpot, HINT_HOLD);
  }

  function dismissSpot() {
    if (!spot || !activeSpot) return;
    clearTimeout(spotTimer);
    activeSpot = null;
    spot.classList.remove('is-visible');
    // Re-hide after the fade so it leaves layout, then play the next queued hint.
    clearTimeout(spotHideTimer);
    spotHideTimer = setTimeout(() => {
      spot.hidden = true;
      showNextSpot();
    }, FADE_OUT_MS);
  }

  /** Drop any pending hints and hide the active one (used on reset / teardown). */
  function clearSpotlights() {
    queue.length = 0;
    if (activeSpot) dismissSpot();
  }

  // The first orbit/zoom/pan proves the learner found the interaction: retire whichever
  // chip is up (the orbit hint, or the active spotlight).
  controls?.addEventListener('start', () => {
    if (hint && !hint.hidden) dismissOrbitHint();
    if (activeSpot) dismissSpot();
  });
  dismissBtn?.addEventListener('click', dismissOrbitHint);
  spotDismiss?.addEventListener('click', dismissSpot);

  return { showOrbitHint, hideOrbitHint, spotlight, cue, clearSpotlights };
}
