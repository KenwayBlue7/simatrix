// Tiny tween helper. No animation library (the no-build / CDN-only contract in
// CLAUDE.md forbids npm dependencies), just a requestAnimationFrame interpolator.
//
// Used by the construction draw-on animation (renderConstruction.js) to bring each
// compass arc / straightedge line into view over time rather than snapping in.
//
// Layering: leaf module, imports nothing. main.js owns the rAF loop and STEPS the
// active tweens from its render loop (see tick()) so that simAPI.pause() halts
// in-flight animations along with everything else.
//
// Reduced motion (DESIGN.md / PRODUCT.md a11y): when the user prefers reduced
// motion, a tween jumps straight to its end value and fires onComplete on the next
// tick. The simulation STATE still updates — only the motion is suppressed.
//
// Renderer-agnostic (confirmed by reading ARCHITECTURE.md §3): this file is
// byte-identical in spirit to the platform's other anim.js copies (Module 2,
// Module 1, template_starter) — it has no Three.js dependency at all, so it
// carries over unchanged to this topic's 2D SVG substrate.

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
 * NO-OVERSHOOT RULE (DESIGN.md): keep y1 and y2 within [0,1].
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {(x:number)=>number}
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (s) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s) => ((ay * s + by) * s + cy) * s;
  const sampleDX = (s) => (3 * ax * s + 2 * bx) * s + cx;

  function solveS(x) {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const xErr = sampleX(s) - x;
      if (Math.abs(xErr) < 1e-6) return s;
      const d = sampleDX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= xErr / d;
    }
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

/** Matches the CSS `--ease-standard` token exactly — the tween default. */
export const easeStandard = cubicBezier(0.22, 1, 0.36, 1);

/** Gentle decelerating ease-out for the compass-arc / straightedge draw-on. */
export const easeDraw = cubicBezier(0.25, 1, 0.5, 1);

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
 * @param {(value:number)=>void} opts.onUpdate
 * @param {()=>void} [opts.onComplete]
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
 * @param {number} deltaMs
 */
export function tick(deltaMs) {
  if (active.size === 0) return;
  for (const t of [...active]) {
    if (!active.has(t)) continue;
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
