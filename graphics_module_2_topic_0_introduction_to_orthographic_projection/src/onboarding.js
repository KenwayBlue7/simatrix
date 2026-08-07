// First-run orientation for the empty start (onboard).
//
// Three quiet aids, all dismissible and shown at most once:
//   1. Empty-state overlay — shown in the viewport until the learner adds a solid,
//      so the large empty area points back at the panel's "Add" action instead of
//      reading as a dead void.
//   2. Orbit hint — a one-time, dismissible "Drag to rotate" chip shown when the
//      first solid appears. The 3D view is drag-to-orbit but nothing advertised
//      that; an anxious beginner could misread a projection that looks flat from
//      the default angle. It auto-dismisses on the first view interaction.
//   3. Contextual spotlight hints — the same chip treatment, reused to point out the
//      Top View, Front View, and connector lines the FIRST time each is revealed.
//      A shared queue plays them ONE AT A TIME (DESIGN.md "Quiet Chrome" / don't
//      spam): when Step 4 reveals the top and front views together, the two hints
//      play in sequence rather than stacking. Each is first-seen-once (persisted),
//      auto-dismisses, and also dismisses on click or first orbit.
//
// Sandboxed-iframe note (CLAUDE.md "no same-origin assumptions"): localStorage can
// throw a SecurityError in a sandboxed iframe, so every access is guarded and
// falls back to an in-session flag. Worst case a hint shows once per load, which
// is harmless (they are dismissible and self-dismiss on first orbit).
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js owns OrbitControls
// and calls setSolidPresent() from rebuild() as the solid comes and goes, and
// spotlight() from the step actions as each layer is first revealed.

const ORBIT_HINT_KEY = 'simatrix-orbit-hint-seen';

/** Per-id persistence key for the contextual spotlight hints. */
const spotlightKey = (id) => `simatrix-hint-${id}-seen`;

/**
 * Contextual spotlight copy + colour tone, keyed by reveal moment. The tone maps to a
 * `.vp-spotlight--<tone>` modifier whose dot colour reads the matching design token
 * (teal HP line / amber VP line / ink), so the chip carries colour AND label (Two-Cue
 * Rule). Copy stays in this leaf module, like stepper.js owns its step copy.
 */
const SPOTLIGHTS = {
  'directions': { tone: 'ink', text: 'Drag to turn it, or jump to one of the four principal directions.' },
  'first-angle': { tone: 'vp', text: 'First angle: the view from the RIGHT is drawn on the LEFT.' },
  'stages':     { tone: 'hp',  text: 'One press draws one thing. Back never replays it.' },
};

/** ms a spotlight stays up before auto-dismissing — generous for the anxious persona. */
const HINT_HOLD = 4500;
/** ms to let the fade-out finish before the chip leaves layout / the next hint plays. */
const FADE_OUT_MS = 240;

const TONE_CLASSES = ['vp-spotlight--hp', 'vp-spotlight--vp', 'vp-spotlight--ink'];

/**
 * @param {{ addEventListener: (type: string, fn: () => void) => void }} controls
 *   OrbitControls (its 'start' event marks the first view interaction).
 * @returns {{ setSolidPresent: (on: boolean) => void, spotlight: (id: string) => void, cue: (text: string, tone?: string) => void }}
 */
export function initOnboarding(controls) {
  const empty = document.getElementById('vp-empty');
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

  /** Reflect whether a solid currently exists. main.js calls this from rebuild(). */
  function setSolidPresent(on) {
    if (empty) empty.hidden = on;
    if (on && !present) showOrbitHint(); // only on the empty -> present transition
    if (!on) {                           // back to empty: nothing to point at
      hideOrbitHint();
      clearSpotlights();
    }
    present = on;
  }

  setSolidPresent(false); // boot state: empty scene, overlay visible
  return { setSolidPresent, spotlight, cue };
}
