// Draws a construction recipe (from constructions.js) into the shared construction
// canvas — REIMPLEMENTED against Canvas2D instead of SVG DOM (ADR-112 §1: this topic's
// whole plate — front view, top-view semicircle, development, transfer lines — is ONE
// `<canvas>`). Every other Diploma topic's renderConstruction.js creates/mutates SVG
// nodes; a canvas has no persistent scene graph, so this file instead exposes a "layer"
// as a small plain-data record ({ entries: [{step, t}] }) and a `paintLayer(ctx, layer,
// palette)` function main.js calls every repaint — the CALLING CONVENTION main.js uses
// (clear/renderStatic/playSteps on a "layer") matches the SVG version's ("layer" there
// meant an SVG <g>; here it means this record), so constructions.js and stepper.js need
// no awareness of the substrate swap.
//
// main.js is responsible for: clearing the canvas, painting the paper background, and
// setting `ctx`'s transform (translate+uniform-scale, letterboxed per viewTransform.js's
// current view-state) BEFORE calling paintLayer — every function below draws in RAW
// drawing-space units (the same numbers constructions.js's steps already carry), exactly
// like the SVG version drew in raw SVG user-space units under its viewBox. Because the
// transform is uniform, line widths / dash lengths / font sizes given in drawing units
// auto-scale with zoom, the same way SVG stroke-width does — no per-step scale math here.
//
// Same "watch the tool make the mark" choreography as every other Diploma topic: a ruler
// bar slides along a drawn line, a compass needle+leg sweeps an arc, both vanish once the
// mark completes (t reaches 1) — computed fresh from `t` each paint rather than mutating
// persisted DOM attributes, since canvas has no persisted nodes to mutate.
//
// Draw-on reveal for straight/curved marks reuses the EXACT SVG mechanic — dash-array +
// dash-offset — since Canvas2D's `setLineDash()`/`lineDashOffset` are a direct match for
// SVG's `stroke-dasharray`/`stroke-dashoffset`; no need to hand-truncate paths.
//
// New step kind this topic needs, beyond the shared point/line/arc/circle/curve/dim/label
// set: **'polyline'** — a straight-segment multi-point path (sharp corners, unlike
// 'curve's traced-locus semantics) for the development pattern's outline, which is a
// closed rectangle for a full solid but gains a notch when truncated (Bhatt Fig. 15-8 /
// K.C. John Fig. 15.4). Also: every step MAY carry an explicit `weight` (drawing-unit
// stroke width) overriding its role's default — K.C. John's "outline THICK, folding THIN"
// rule (Ch.15 Tools note #4) is a stroke-weight axis independent of `role` (given/move/
// result already means something else: pedagogical significance, not line-weight), so
// `constructions.js` sets `weight: OUTLINE_WEIGHT` on the pattern outline and
// `weight: FOLD_WEIGHT` on each fold/generator line rather than overloading `role` to mean
// two different things at once.
//
// Layering (CLAUDE.md): leaf module. Imports only anim.js (tween/easing), never terms.js,
// uiManager.js, or stepper.js.

import { tween, easeDraw } from './anim.js';

/** DESIGN.md §2 construction-line token, keyed by step role — resolved to actual colour
 *  strings by main.js each paint (canvas fillStyle/strokeStyle cannot read a raw
 *  `var(--token)` string the way SVG presentation attributes can), never hard-coded here.
 *  @param {'given'|'move'|'result'} role  @param {{given:string, move:string, result:string}} palette */
function roleColor(role, palette) {
  if (role === 'given') return palette.given;
  if (role === 'move') return palette.move;
  return palette.result;
}

function roleWidthDefault(role) {
  return role === 'result' ? 1.2 : role === 'given' ? 1 : 0.6;
}

/** A step's own `weight` (K.C. John's outline/fold axis) wins over the role default. */
function strokeWidthFor(step) {
  return step.weight ?? roleWidthDefault(step.role);
}

/** Cumulative polyline length — sizes the dash-offset draw-on so a traced curve or a
 *  straight polyline "draws itself" at a rate proportional to its own length. */
function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

/** How long a step's draw-on takes — a sweeping arc, a drawn line/polyline, or a traced
 *  curve needs enough time to actually watch it happen; a point/label snapping into place
 *  doesn't. A dashed (hidden-line) curve segment fades in like a point, it doesn't draw on. */
function durationFor(step) {
  // Explicit per-step override (constructions.js) wins — a construction with many
  // repetitive utility lines (12+ generator projectors, a dozen fold lines) needs those
  // fast, reserving the full "watch it happen" duration for the few conceptually load-
  // bearing steps (a transfer line, the pattern outline, a cut curve). Verified live: a
  // 12-generator cylinder with every step at the flat 1800ms default took ~45+ seconds
  // to Play — the override exists specifically to fix that, not as a hypothetical.
  if (step.duration != null) return step.duration;
  if (step.kind === 'curve' && step.dashed) return 600;
  return step.kind === 'arc' || step.kind === 'line' || step.kind === 'polyline' || step.kind === 'curve' ? 1800 : 600;
}

function paintLine(ctx, step, t, palette) {
  const { a, b, role } = step;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
  const dashed = role === 'move';
  const angle = Math.atan2(b.y - a.y, b.x - a.x);

  if (t < 1) {
    // The straightedge: a translucent ruler bar laid along the line while it draws,
    // extending slightly past both ends the way a real ruler would. Uses globalAlpha for
    // the translucent fill rather than a `color-mix()` fillStyle string — canvas's CSS
    // colour parser does not reliably accept CSS Color 4 syntax the way SVG presentation
    // attributes do, and a rejected fillStyle silently keeps whatever colour was set
    // before it (verified live: it rendered as an opaque bar, not a light tint).
    const overhang = 5;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-overhang, -1.4, len + overhang * 2, 2.8);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = palette.tool;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.tool;
    ctx.lineWidth = 0.35;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, palette);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  if (dashed) {
    ctx.globalAlpha = t;
    ctx.setLineDash([4, 3]);
  } else {
    ctx.setLineDash([len]);
    ctx.lineDashOffset = len * (1 - t);
  }
  ctx.stroke();
  ctx.restore();
}

function paintPolyline(ctx, step, t, palette) {
  const { points, role, closed } = step;
  if (points.length < 2) return;
  const path = closed ? [...points, points[0]] : points;
  const len = Math.max(polylineLength(path), 1e-6);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter'; // sharp corners — a pattern outline is straight-edged, not traced
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, palette);
  ctx.setLineDash([len]);
  ctx.lineDashOffset = len * (1 - t);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.restore();
}

function paintArc(ctx, step, t, palette) {
  const { center, radius, startAngle, endAngle, role } = step;
  const cur = startAngle + t * (endAngle - startAngle);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, palette);
  if (role === 'move') ctx.setLineDash([3, 2.5]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, startAngle, cur, endAngle < startAngle);
  ctx.stroke();
  ctx.restore();

  if (t < 1) {
    // The compass: a needle dot pinned at the centre and a pencil leg sweeping to the
    // current angle, tracing the same arc the ink mark follows.
    const tipX = center.x + radius * Math.cos(cur);
    const tipY = center.y + radius * Math.sin(cur);
    ctx.save();
    ctx.fillStyle = palette.tool;
    ctx.strokeStyle = palette.tool;
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(center.x, center.y, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, tipY, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function paintCircle(ctx, step, t, palette) {
  const { center, radius, role } = step;
  ctx.save();
  ctx.globalAlpha = t;
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, palette);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function paintCurve(ctx, step, t, palette) {
  const { points, role, dashed } = step;
  if (points.length === 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, palette);
  if (dashed) {
    // Hidden-line convention: a static dash pattern that fades in, not a progressive
    // draw-on — see this topic's DESIGN.md §3 (ported reasoning from Topic 2.3's helix).
    ctx.globalAlpha = t;
    ctx.setLineDash([3, 2.5]);
  } else {
    const len = Math.max(polylineLength(points), 1e-6);
    ctx.setLineDash([len]);
    ctx.lineDashOffset = len * (1 - t);
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  ctx.restore();
}

function paintPoint(ctx, step, t, palette) {
  const r = step.role === 'result' ? 1.7 : 1.1;
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = step.role === 'move' ? palette.paper : roleColor(step.role, palette);
  ctx.strokeStyle = roleColor(step.role, palette);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(step.p.x, step.p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (step.label) {
    ctx.fillStyle = roleColor(step.role, palette);
    ctx.font = `700 6.5px ${palette.fontSans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(step.label, step.p.x + 4, step.p.y - 4);
  }
  ctx.restore();
}

function paintDim(ctx, step, t, palette) {
  const { a, b, text, role } = step;
  const color = roleColor(role, palette);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const px = -uy; // perpendicular unit vector; step.offset's sign picks the side
  const py = ux;
  const off = step.offset ?? 10;
  const oa = { x: a.x + px * off, y: a.y + py * off };
  const ob = { x: b.x + px * off, y: b.y + py * off };
  const overshoot = 1.5; // extension line runs a hair past the dimension line (BIS convention)
  const sign = Math.sign(off || 1);
  const extEnd = (o) => ({ x: o.x + px * overshoot * sign, y: o.y + py * overshoot * sign });

  ctx.save();
  ctx.globalAlpha = t;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  ctx.globalAlpha = t * 0.65;
  ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); const e1 = extEnd(oa); ctx.lineTo(e1.x, e1.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b.x, b.y); const e2 = extEnd(ob); ctx.lineTo(e2.x, e2.y); ctx.stroke();

  ctx.globalAlpha = t;
  ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(oa.x, oa.y); ctx.lineTo(ob.x, ob.y); ctx.stroke();

  const arrowLen = 2.6;
  const arrowHalfWidth = 0.45; // ~3:1 length:width, BIS closed-arrowhead convention
  const drawArrow = (tip, dirx, diry) => {
    const backx = tip.x - dirx * arrowLen;
    const backy = tip.y - diry * arrowLen;
    const wx = -diry * arrowHalfWidth;
    const wy = dirx * arrowHalfWidth;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(backx + wx, backy + wy);
    ctx.lineTo(backx - wx, backy - wy);
    ctx.closePath();
    ctx.fill();
  };
  drawArrow(oa, -ux, -uy);
  drawArrow(ob, ux, uy);

  const mid = { x: (oa.x + ob.x) / 2 + px * 4, y: (oa.y + ob.y) / 2 + py * 4 };
  ctx.font = `5.5px ${palette.fontMono}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, mid.x, mid.y);
  ctx.restore();
}

function paintLabel(ctx, step, t, palette) {
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = palette.inkSecondary;
  ctx.font = `6.5px ${palette.fontSans}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(step.text, step.p.x + (step.dx ?? 4), step.p.y + (step.dy ?? -4));
  ctx.restore();
}

function paintStep(ctx, step, t, palette) {
  if (t <= 0) return;
  switch (step.kind) {
    case 'line': return paintLine(ctx, step, t, palette);
    case 'polyline': return paintPolyline(ctx, step, t, palette);
    case 'arc': return paintArc(ctx, step, t, palette);
    case 'circle': return paintCircle(ctx, step, t, palette);
    case 'curve': return paintCurve(ctx, step, t, palette);
    case 'point': return paintPoint(ctx, step, t, palette);
    case 'dim': return paintDim(ctx, step, t, palette);
    default: return paintLabel(ctx, step, t, palette); // 'label' kind — text only
  }
}

// ============================================================================
// Public contract — same shape as every other Diploma topic's renderConstruction.js,
// with "SVG group" replaced by "layer record" (ADR-112 §1).
// ============================================================================

/** A paintable layer: plain data, no DOM. main.js keeps one for "given" (static) content
 *  and one for "dynamic" (animated/replayable) content, matching the other topics' two-
 *  <g> convention. */
export function createLayer() {
  return { entries: [] };
}

/** Empty a layer (the disposal-contract re-expression — nothing to dispose in the WebGL
 *  sense, just drop the entries so the next paint draws nothing for this layer). */
export function clear(layer) {
  layer.entries.length = 0;
}

/** The axis-aligned bounding box (drawing units) of a list of recipe steps, including
 *  each dim mark's own offset reach — main.js calls this before Play so the viewport
 *  (viewTransform.js's ensureVisible()) can confirm a zoomed-in/panned view still shows
 *  the whole construction the animation is about to draw. Pure geometry — unchanged from
 *  the SVG version, no DOM involved either way. */
export function computeBounds(steps) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const upd = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const step of steps) {
    if (step.kind === 'point') {
      upd(step.p.x, step.p.y);
    } else if (step.kind === 'line') {
      upd(step.a.x, step.a.y);
      upd(step.b.x, step.b.y);
    } else if (step.kind === 'polyline') {
      for (const p of step.points) upd(p.x, p.y);
    } else if (step.kind === 'circle') {
      upd(step.center.x - step.radius, step.center.y - step.radius);
      upd(step.center.x + step.radius, step.center.y + step.radius);
    } else if (step.kind === 'curve') {
      for (const p of step.points) upd(p.x, p.y);
    } else if (step.kind === 'arc') {
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = step.startAngle + (step.endAngle - step.startAngle) * (i / n);
        upd(step.center.x + step.radius * Math.cos(a), step.center.y + step.radius * Math.sin(a));
      }
    } else if (step.kind === 'dim') {
      upd(step.a.x, step.a.y);
      upd(step.b.x, step.b.y);
      const len = Math.hypot(step.b.x - step.a.x, step.b.y - step.a.y) || 1;
      const px = -(step.b.y - step.a.y) / len;
      const py = (step.b.x - step.a.x) / len;
      const off = step.offset ?? 10;
      upd(step.a.x + px * off, step.a.y + py * off);
      upd(step.b.x + px * off, step.b.y + py * off);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Fill a layer with a list of steps at full reveal — no animation. Used for the "Given"
 *  step's static display and for landing on a later wizard step without pressing Play. */
export function renderStatic(layer, steps) {
  clear(layer);
  for (const step of steps) layer.entries.push({ step, t: 1 });
}

/**
 * Sequentially reveal a list of steps into `layer`, one draw-on tween after another.
 * Returns a handle with cancel(). Honors reduced motion automatically (anim.js's tween()
 * collapses to the end state and still calls onComplete, so the chain still advances and
 * finishes fast). main.js's own rAF loop (which steps anim.js's tweens and repaints every
 * frame) is what actually makes the in-progress `t` values visible — this function only
 * mutates the layer's data, it never touches a canvas directly.
 * @param {{entries: Array<{step:object, t:number}>}} layer
 * @param {Array<object>} steps
 * @param {{onComplete?: () => void}} [opts]
 */
export function playSteps(layer, steps, { onComplete } = {}) {
  clear(layer);
  let cancelled = false;
  let activeTween = null;

  function playAt(i) {
    if (cancelled) return;
    if (i >= steps.length) { onComplete?.(); return; }
    const step = steps[i];
    const entry = { step, t: 0 };
    layer.entries.push(entry);
    activeTween = tween({
      from: 0, to: 1, duration: durationFor(step), ease: easeDraw,
      onUpdate: (t) => { entry.t = t; },
      onComplete: () => { entry.t = 1; playAt(i + 1); },
    });
  }
  playAt(0);

  return { cancel: () => { cancelled = true; activeTween?.cancel(); } };
}

/** Paint every entry currently in `layer` onto `ctx`. Caller (main.js) must already have
 *  set ctx's transform for the current pan/zoom AND resolved `palette` to actual colour
 *  strings this frame (canvas cannot read a raw `var(--token)` string). Drawing order is
 *  entry order — main.js/constructions.js should emit steps back-to-front the same way
 *  the SVG version relied on DOM append order for z-order. */
export function paintLayer(ctx, layer, palette) {
  for (const { step, t } of layer.entries) paintStep(ctx, step, t, palette);
}
