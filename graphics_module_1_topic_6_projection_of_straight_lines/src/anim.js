// Tiny tween helper. No animation library (the no-build / CDN-only contract in
// CLAUDE.md forbids npm dependencies), just a requestAnimationFrame interpolator.
//
// Used by the Guided Stepper for the animations that teach cause-and-effect:
//   • the projection-line draw-on (top + front views, Step 4; side view, Step 5), and
//   • the VP-fold "flatten to 2D" (Step 6).
//
// Layering: leaf module, imports nothing. main.js owns the rAF loop and STEPS the
// active tweens from animate() (see tick()) so that simAPI.pause() halts in-flight
// animations along with the render loop — a tween that drove its own private rAF
// would keep running while the platform thinks the sim is paused.
//
// Reduced motion (DESIGN.md / PRODUCT.md a11y): when the user prefers reduced
// motion, a tween jumps straight to its end value and fires onComplete on the next
// tick. The simulation STATE still updates — only the motion is suppressed.

/** Live tweens, stepped by tick() from the render loop. @type {Set<Tween>} */
const active = new Set();

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Build a 1D cubic-bezier easing function — the same timing CSS exposes as
 * `cubic-bezier(x1, y1, x2, y2)`. The curve runs through control points
 * P0 = (0,0), P1 = (x1,y1), P2 = (x2,y2), P3 = (1,1). For a normalized time `x`
 * we solve X(s) = x for the curve parameter `s` (Newton–Raphson, with a bisection
 * fallback when the derivative goes flat — the standard WebKit `UnitBezier`
 * approach), then return Y(s).
 *
 * Written natively (no animation library — the no-build / CDN-only contract in
 * CLAUDE.md). Reduced motion needs no handling here: {@link tween} jumps straight to
 * the end value and never calls `ease` when motion is reduced.
 *
 * NO-OVERSHOOT RULE (DESIGN.md): keep y1 and y2 within [0,1]. A control-point Y
 * outside that range makes the curve overshoot/anticipate, which the design system
 * forbids — every curve in the palette below stays inside it.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(x:number)=>number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  // Polynomial coefficients of B(s) = ((a·s + b)·s + c)·s, with P0 pinned at the
  // origin (so there is no constant term). Computed once per curve, closed over below.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s) => ((ay * s + by) * s + cy) * s;
  const sampleDX = (s) => (3 * ax * s + 2 * bx) * s + cx; // dX/ds

  /** Find the curve parameter s where X(s) === x. */
  function solveS(x) {
    // Newton–Raphson from x as the initial guess — converges in a few iterations for
    // the well-behaved curves we use.
    let s = x;
    for (let i = 0; i < 8; i++) {
      const xErr = sampleX(s) - x;
      if (Math.abs(xErr) < 1e-6) return s;
      const d = sampleDX(s);
      if (Math.abs(d) < 1e-6) break; // derivative too flat — hand off to bisection
      s -= xErr / d;
    }
    // Bisection fallback (guaranteed to converge within [0,1]).
    let lo = 0;
    let hi = 1;
    s = x;
    while (lo < hi) {
      const xAt = sampleX(s);
      if (Math.abs(xAt - x) < 1e-6) return s;
      if (x > xAt) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  }

  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveS(x)));
}

// ----------------------------------------------------------------------------
// Curve palette. Each is a cubic-bezier with control-point Y values inside [0,1]
// (no overshoot — DESIGN.md). Named by role so call sites read intentionally.
// ----------------------------------------------------------------------------

/**
 * Matches the CSS `--ease-standard: cubic-bezier(0.22, 1, 0.36, 1)` token EXACTLY,
 * so JS-driven motion lines up with CSS-driven motion. The default for {@link tween}
 * and the baseline for chrome-level moves (auto-zoom dolly, the ortho→perspective
 * exit morph). Ease-out: quick to leave, soft to settle.
 * @type {(x:number)=>number}
 */
export const easeStandard = cubicBezier(0.22, 1, 0.36, 1);

/**
 * Heavy, symmetric ease-in-out (an easeInOutQuint-shaped curve) — slow start, fast
 * middle, slow settle. The "physical hinge" curve reserved for the "flatten to 2D"
 * fold + its camera swoop, where the motion should read as a weighted plane folding
 * open and settling flat. No overshoot.
 * @type {(x:number)=>number}
 */
export const easeFold = cubicBezier(0.83, 0, 0.17, 1);

/**
 * Weighted accelerate-then-settle (an easeInOutQuart-shaped curve) for the quick-view
 * camera snaps (Top/Front/Side) — firm enough to feel premium, never abrupt.
 * @type {(x:number)=>number}
 */
export const easeCamera = cubicBezier(0.76, 0, 0.24, 1);

/**
 * Gentle decelerating ease-out (an easeOutQuart-shaped curve) for the projection
 * draw-ons — lines glide on and settle rather than snapping to full weight.
 * @type {(x:number)=>number}
 */
export const easeDraw = cubicBezier(0.25, 1, 0.5, 1);

/**
 * Accelerating ease-in (an easeInCubic-shaped curve) for the 3D solid "dissolving" into
 * its flat drawing during the fold. Used as `1 - easeDissolve(t)`: the body HOLDS opaque
 * as the planes start to swing (so the learner keeps the solid as an anchor), then fades
 * away faster and faster — a decisive disappear with no lingering translucent ghost, and
 * no overshoot (Y control points pinned at 0). Pairs with the easeFold hinge motion.
 * @type {(x:number)=>number}
 */
export const easeDissolve = cubicBezier(0.5, 0, 0.75, 0);

/**
 * @typedef {Object} Tween
 * @property {number} from
 * @property {number} to
 * @property {number} duration  milliseconds
 * @property {(t:number)=>number} ease
 * @property {(value:number)=>void} onUpdate
 * @property {(()=>void)|undefined} onComplete
 * @property {number} elapsed
 * @property {boolean} done
 * @property {() => void} cancel  Stop without firing onComplete.
 */

/**
 * Start a tween. Returns a handle whose cancel() removes it from the active set
 * (onComplete does NOT fire on cancel). Starting a tween does not itself drive
 * any rAF — the caller's render loop must call {@link tick} each frame.
 *
 * @param {Object} opts
 * @param {number} opts.from
 * @param {number} opts.to
 * @param {number} [opts.duration=600]
 * @param {(t:number)=>number} [opts.ease=easeStandard]
 * @param {(value:number)=>void} opts.onUpdate  Called every tick with the eased value.
 * @param {()=>void} [opts.onComplete]          Called once when the tween reaches `to`.
 * @returns {{ cancel: () => void }}
 */
export function tween({ from, to, duration = 600, ease = easeStandard, onUpdate, onComplete }) {
  /** @type {Tween} */
  const t = {
    from, to, duration, ease, onUpdate, onComplete,
    elapsed: 0,
    done: false,
    cancel() { active.delete(t); },
  };

  // Reduced motion: land on the final value immediately. We still register the
  // tween so onComplete fires on the next tick() (consistent ordering with the
  // animated path — callers can rely on onComplete running after the loop ticks).
  if (prefersReducedMotion || duration <= 0) {
    onUpdate?.(to);
    t.elapsed = duration;
  } else {
    onUpdate?.(from);
  }

  active.add(t);
  return { cancel: t.cancel };
}

/**
 * Advance every active tween by `deltaMs`. Call once per frame from the render
 * loop. Completed tweens fire onComplete and are removed.
 * @param {number} deltaMs  Milliseconds since the previous frame.
 */
export function tick(deltaMs) {
  if (active.size === 0) return;
  // Snapshot: onComplete callbacks may start new tweens / cancel others.
  for (const t of [...active]) {
    if (!active.has(t)) continue; // cancelled mid-iteration
    t.elapsed += deltaMs;
    const raw = t.duration <= 0 ? 1 : Math.min(t.elapsed / t.duration, 1);
    const value = t.from + (t.to - t.from) * t.ease(raw);
    t.onUpdate?.(value);
    if (raw >= 1) {
      active.delete(t);
      t.onComplete?.();
    }
  }
}

/** Cancel every active tween (no onComplete). Used on reset/dispose. */
export function cancelAll() {
  active.clear();
}
