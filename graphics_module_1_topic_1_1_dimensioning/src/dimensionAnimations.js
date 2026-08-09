// Animation choreography (Module 1 Topic 1.1 — Dimensioning).
//
// PURE DATA + PURE FUNCTIONS. Imports nothing — not even the tween engine. main.js owns the
// rAF loop and `anim.js`; this module only says WHAT should be at WHAT progress, so the
// timing of the lesson can be read and tuned in one place without touching the renderer or
// the orchestrator (ADR-007 star rule / RULES.md §3.6).
//
// EVERY ANIMATION HERE TEACHES. There is no decorative motion in this topic:
//   • A dimension builds in the order a draughtsman draws it — projection lines, then the
//     dimension line growing outward from its middle, then the termination, then the value.
//     (The phase boundaries themselves live in dimensionDraw.js, next to the geometry.)
//   • Dimensions arrive one after another, left to right, so the eye follows the sheet
//     being filled in rather than having a finished drawing dropped on it.
//   • A rule flip and an arrangement change cross-fade the OLD drawing out and the NEW one
//     in, because the point of both is the comparison, not the destination.
//   • Reduced motion is handled by anim.js, which jumps every tween to its end value — the
//     state still lands, only the motion is suppressed (RULES.md §4.13).

/** Durations in milliseconds. */
export const TIMING = Object.freeze({
  /** Step 1 — the whole starter drawing building on, staggered. */
  reveal: 2600,
  /** Step 2 / Step 6 — a wrong dimension morphing into its correct form. */
  morph: 700,
  /** Step 4 — one arrangement being replaced by another. */
  rearrange: 900,
  /** Step 5 — a symbol's dimension drawing itself onto its feature. */
  symbol: 900,
  /** Camera moves: quick-views, the turn-over, the zoom to a feature. */
  camera: 800,
  /** How long a rule/mistake explanation holds before the drawing settles. */
  explain: 2400,
});

/**
 * How much of the total run each successive dimension is delayed by, as a fraction of the
 * whole. Small enough that the sheet fills briskly, large enough that the eye can follow
 * one dimension at a time.
 */
export const STAGGER = 0.13;

/**
 * Turn a single 0→1 clock into a per-spec progress map, staggered in list order.
 *
 * With n specs and a stagger of s, spec i starts at i·s/(1+(n−1)·s) and runs for
 * 1/(1+(n−1)·s) of the clock, so the LAST spec finishes exactly as the clock reaches 1 —
 * no matter how many specs there are.
 *
 * @param {string[]} ids   Spec ids in the order they should appear.
 * @param {number} t       Global progress, 0..1.
 * @param {number} [stagger=STAGGER]
 * @returns {Record<string, number>} id → 0..1
 */
export function staggered(ids, t, stagger = STAGGER) {
  const out = {};
  const n = ids.length;
  if (n === 0) return out;
  const span = 1 / (1 + (n - 1) * stagger);
  ids.forEach((id, i) => {
    const start = i * stagger * span;
    out[id] = Math.max(0, Math.min(1, (t - start) / span));
  });
  return out;
}

/** Every spec at the same progress — used for a cross-fade or an instant state. */
export function uniform(ids, t) {
  const out = {};
  for (const id of ids) out[id] = t;
  return out;
}

/**
 * Step 1's element walk-through: the order the anatomy is introduced in, matching the order
 * §4.1 lists the elements.
 */
export const ELEMENT_ORDER = Object.freeze([
  'projline', 'dimline', 'leader', 'termination', 'dimtext', 'note',
]);

/**
 * Named camera poses, as { azimuthDeg, elevationDeg }. Azimuth 0 is square on to the front
 * face — the drawing. The lesson lives at 0; the others exist so a student can check that
 * the drawing really does describe a solid object.
 */
export const VIEWS = Object.freeze({
  /** The drawing itself: a true orthographic front elevation. */
  front: { azimuthDeg: 0, elevationDeg: 0 },
  /**
   * A true ISOMETRIC pictorial, to see the plate is 30 thick and the seat is a real bowl —
   * and the view the sim opens on. These two angles ARE `camera.position.set(1, 1, 1)`
   * normalised: azimuth atan2(1, 1) = 45°, elevation asin(1/√3) = 35.264°. `applyPose()` then
   * scales that direction by the current camera distance and looks at the part's centre, so
   * nothing about the camera system changes — only which direction it starts from.
   */
  pictorial: { azimuthDeg: 45, elevationDeg: 35.264 },
  /** Turned over, to read the countersink from the face it is machined on. */
  rear: { azimuthDeg: 180, elevationDeg: 0 },
});
