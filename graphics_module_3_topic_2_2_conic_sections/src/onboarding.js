// First-run orientation.
//
// Two quiet aids, both dismissible and shown at most once:
//   1. Orbit hint — a one-time "Drag to rotate" chip shown when the cone first appears.
//      The 3D view is drag-to-orbit but nothing advertises that, and a learner who never
//      turns the double cone never sees that the ellipse really is a closed curve on it.
//   2. Contextual spotlight hints — the same chip treatment, reused to point out the
//      section curve the first time a plane cuts the cone, and the drawing sheet the
//      first time it opens. A shared queue plays them ONE AT A TIME (DESIGN.md "Quiet
//      Chrome"). Each is first-seen-once (persisted), auto-dismisses, and also dismisses
//      on click or first orbit.
//
// Sandboxed-iframe note (CLAUDE.md "no same-origin assumptions"): localStorage can throw
// a SecurityError in a sandboxed iframe, so every access is guarded and falls back to an
// in-session flag. Worst case a hint shows once per load, which is harmless.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js owns OrbitControls and calls
// setSolidPresent() from rebuild() as the cone comes and goes, and spotlight() as each
// layer is first revealed.

const ORBIT_HINT_KEY = 'simatrix-orbit-hint-seen';

/** Per-id persistence key for the contextual spotlight hints. */
const spotlightKey = (id) => `simatrix-hint-${id}-seen`;

/**
 * Contextual spotlight copy + colour tone, keyed by reveal moment. The tone maps to a
 * `.vp-spotlight--<tone>` modifier whose dot colour reads the matching design token, so
 * the chip carries colour AND label (Two-Cue Rule). Copy stays in this leaf module, like
 * stepper.js owns its step copy.
 */
const SPOTLIGHTS = {
  'section-curve': {
    tone: 'section',
    text: 'That crimson curve where the plane meets the cone IS the conic section — orbit until you face it square-on.',
  },
  'drawing-sheet': {
    tone: 'ink',
    // The sheet can be opened from Step 1, so this chip must not name apparatus the lesson
    // has not reached yet — "focus" and "directrix" belong to Step 4 (RULES.md §6.27).
    text: 'The drawing sheet is the same curve again, drawn flat on paper the way an engineer would.',
  },
};

/** ms a spotlight stays up before auto-dismissing — generous for the anxious persona. */
const HINT_HOLD = 4500;
/** ms to let the fade-out finish before the chip leaves layout / the next hint plays. */
const FADE_OUT_MS = 240;

const TONE_CLASSES = ['vp-spotlight--section', 'vp-spotlight--ink'];

/**
 * @param {{ addEventListener: (type: string, fn: () => void) => void }} controls
 *   OrbitControls (its 'start' event marks the first view interaction).
 * @returns {{ setSolidPresent: (on: boolean) => void, spotlight: (id: string) => void, cue: (text: string, tone?: string) => void }}
 */
export function initOnboarding(controls) {
  const hint = document.getElementById('vp-orbit-hint');
  const dismissBtn = document.getElementById('vp-orbit-dismiss');

  const spot = document.getElementById('vp-spotlight');
  const spotText = spot?.querySelector('.vp-spotlight__text');
  const spotDismiss = document.getElementById('vp-spotlight-dismiss');

  let present = false;
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
  // The queue holds normalized cue specs { text, tone, key?, id? } so two callers share
  // the SAME bottom-centre chip + animation: spotlight() enqueues a FIRST-SEEN hint
  // (carries an `id` for dedupe and a `key` for persistence), and cue() enqueues an
  // AD-HOC, replayable nudge (no id/key — it fires every call).
  const queue = [];
  let activeSpot = null;    // spec currently showing, or null when the slot is free
  let spotTimer = null;     // auto-dismiss hold
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
   * @param {'section'|'ink'} [tone]  Dot colour tone (falls back to 'ink' if unknown).
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

  /** Drop any pending hints and hide the active one (used on reset to empty). */
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

  /** Reflect whether a cone currently exists. main.js calls this from rebuild(). */
  function setSolidPresent(on) {
    if (on && !present) showOrbitHint(); // only on the empty -> present transition
    if (!on) {                           // back to empty: nothing to point at
      hideOrbitHint();
      clearSpotlights();
    }
    present = on;
  }

  /**
   * Clear the chip slot: whatever is showing goes, and anything queued behind it is dropped.
   *
   * A chip is anchored to the moment it describes. "Orbit until you face it square-on" is the
   * right instruction on Step 3 and the wrong one on Step 4, where the camera faces the section
   * for the learner — so a step change retires the slot rather than letting a 4.5-second hold
   * carry the previous step's instruction into the next one. Nothing is lost by going early:
   * `markSeen` already fires when a spotlight is SHOWN, so a learner who moves on inside the
   * hold had spent their one showing either way.
   */
  function retire() {
    queue.length = 0;
    if (hint && !hint.hidden) dismissOrbitHint();
    dismissSpot();
  }

  return { setSolidPresent, spotlight, cue, retire };
}
