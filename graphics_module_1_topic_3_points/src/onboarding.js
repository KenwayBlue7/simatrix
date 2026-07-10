// First-run orientation (onboard) — adapted for Points: the point P is on stage
// from Step 1, so the Module-2 empty-state "add a solid" overlay is GONE. What
// remains are the two quiet aids, all dismissible and shown at most once:
//   1. Orbit hint — a one-time, dismissible "Drag to rotate" chip shown on the
//      first step (steps declare orbitHint in pointSteps.js; the stepper calls
//      orbitHint() through simController). The 3D view is drag-to-orbit but
//      nothing advertised that; an anxious beginner could misread a projection
//      that looks flat from the default angle. It auto-dismisses on the first
//      view interaction.
//   2. Contextual spotlight hints — the same chip treatment, pointing out the
//      quadrant walk, the top view, the front view, the profile distance, and
//      the fold the FIRST time each step reveals them. The copy + tones are the
//      legacy Points spotlights (Module1/main.js cfg.spotlights) verbatim. A
//      shared queue plays them ONE AT A TIME (DESIGN.md "Quiet Chrome" / don't
//      spam), and the queue WAITS while the orbit hint is up — the orbit hint
//      fires first on step 1, and the 'quadrants' chip follows once it is
//      dismissed, instead of instantly evicting it. Each is first-seen-once
//      (persisted), auto-dismisses, and also dismisses on click or first orbit.
//
// Sandboxed-iframe note (CLAUDE.md "no same-origin assumptions"): localStorage can
// throw a SecurityError in a sandboxed iframe, so every access is guarded and
// falls back to an in-session flag. Worst case a hint shows once per load, which
// is harmless (they are dismissible and self-dismiss on first orbit).
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js owns OrbitControls
// and exposes spotlight()/orbitHint() to the stepper through simController.

const ORBIT_HINT_KEY = 'simatrix-orbit-hint-seen';

/** Per-id persistence key for the contextual spotlight hints. */
const spotlightKey = (id) => `simatrix-hint-${id}-seen`;

/**
 * Contextual spotlight copy + colour tone, keyed by step reveal moment — the
 * legacy Points spotlights (Module1/main.js), carried over verbatim. The tone
 * maps to a `.vp-spotlight--<tone>` modifier whose dot colour reads the matching
 * design token (teal HP line / amber VP line / ink), so the chip carries colour
 * AND label (Two-Cue Rule). Step → id mapping lives in pointSteps.js.
 */
const SPOTLIGHTS = {
  'quadrants':  { tone: 'ink', text: 'Switch quadrants — point P jumps to a different room around the fold line.' },
  'top-view':   { tone: 'hp',  text: 'Top view p — P dropped straight down onto the HP (teal, solid).' },
  'front-view': { tone: 'vp',  text: 'Front view p′ — P projected back onto the VP (amber, dashed).' },
  'profile':    { tone: 'ink', text: 'Distance from PP slides P sideways along the fold line — the third coordinate.' },
  'unfold':     { tone: 'ink', text: 'Press Animate Unfolding — HP swings down flat to make the 2D sheet.' },
};

/** ms a spotlight stays up before auto-dismissing — generous for the anxious persona. */
const HINT_HOLD = 4500;
/** ms to let the fade-out finish before the chip leaves layout / the next hint plays. */
const FADE_OUT_MS = 240;

const TONE_CLASSES = ['vp-spotlight--hp', 'vp-spotlight--vp', 'vp-spotlight--ink'];

/**
 * @param {{ addEventListener: (type: string, fn: () => void) => void }} controls
 *   OrbitControls (its 'start' event marks the first view interaction).
 * @returns {{ orbitHint: () => void, spotlight: (id: string) => void, cue: (text: string, tone?: string) => void, clear: () => void }}
 */
export function initOnboarding(controls) {
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
  function hideOrbitHint() {
    if (!hint) return;
    hint.classList.remove('is-visible');
    hint.hidden = true;
  }
  /** Show the one-time orbit chip (the stepper calls this on orbitHint steps). */
  function showOrbitHint() {
    if (!hint || isSeen(ORBIT_HINT_KEY)) return;
    hint.hidden = false;
    // Next frame so the opacity transition runs (instant under reduced motion).
    requestAnimationFrame(() => hint.classList.add('is-visible'));
  }
  function dismissOrbitHint() {
    markSeen(ORBIT_HINT_KEY);
    hideOrbitHint();
    showNextSpot(); // the bottom-centre slot is free — play any waiting spotlight
  }

  // --- Contextual chips (queued, one at a time) -----------------------------
  // The queue holds normalized cue specs { text, tone, key?, id? } so two callers share the
  // SAME bottom-centre chip + animation: spotlight() enqueues a FIRST-SEEN hint (carries an
  // `id` for dedupe and a `key` for persistence), and cue() enqueues an AD-HOC, replayable
  // nudge (no id/key — it fires every call).
  const queue = [];
  let activeSpot = null;   // spec currently showing, or null when the slot is free
  let spotTimer = null;    // auto-dismiss hold
  let spotHideTimer = null; // post-fade re-hide

  /** Enqueue a first-seen hint. No-op if unknown, already seen, or already pending. */
  function spotlight(id) {
    if (!spot || !SPOTLIGHTS[id]) return;
    if (isSeen(spotlightKey(id))) return;
    if (activeSpot?.id === id || queue.some((q) => q.id === id)) return;
    const spec = SPOTLIGHTS[id];
    queue.push({ id, text: spec.text, tone: spec.tone, key: spotlightKey(id) });
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
    // The orbit hint owns the bottom-centre slot while it is up: it fired first
    // (step 1) and teaches the prerequisite gesture, so queued spotlights WAIT —
    // dismissOrbitHint() re-runs this once the slot frees up.
    if (hint && !hint.hidden) return;
    const item = queue.shift();
    if (!item) return;

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

  /** Drop any pending hints and hide the active one (simAPI.reset calls this so
   *  a stale chip never narrates the previous run over a fresh Step 1). */
  function clear() {
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

  return { orbitHint: showOrbitHint, spotlight, cue, clear };
}
