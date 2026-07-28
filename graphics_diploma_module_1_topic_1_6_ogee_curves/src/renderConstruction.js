// Draws a construction recipe (from constructions.js) into the SVG construction layer.
// The ONLY file that touches the SVG DOM for construction content — main.js owns the
// group element and calls into here; nothing else creates or removes drawn geometry.
//
// Every compass-arc and straightedge-line step shows the DRAFTING TOOL making the mark —
// a two-leg compass pivoting from its centre point, or a ruler bar sliding along the line
// — not just an abstract stroke fading in. The tool disappears once the mark is complete,
// leaving only the ink behind. This is what makes the sequence read as "watch it get
// built" rather than "shapes appearing."
//
// Re-expression of the platform's disposal contract (RULES.md §3.3) for a 2D DOM
// substrate: every rebuild clears this layer's children before redrawing, since there is
// nothing to `dispose()` in the WebGL sense (no geometry/material/texture buffers).
//
// Draw-on animation uses anim.js's tween(), which already collapses to an instant
// end-state under prefers-reduced-motion (DESIGN.md §5.10) — this file adds no separate
// reduced-motion branch, it simply relies on that contract (a tool glyph still flashes
// through its motion in one jump rather than gliding, which is correct: state still
// updates, only motion is suppressed).
//
// Layering (CLAUDE.md): leaf module. Imports only anim.js (tween/easing), never terms.js,
// uiManager.js, or stepper.js.
//
// New this topic: mountHandle() — the draggable reversal-point/radius handle (CLAUDE.md).
// It is exported from HERE, not uiManager.js, because uiManager.js is documented as never
// touching the SVG directly (RULES.md §3.2) and this handle IS construction content living
// inside #construction-svg — the same "only renderConstruction.js touches this SVG" rule
// that already governs every drawn step. main.js calls mountHandle() once per rebuild
// (passing the construction's own `handle` descriptor from constructions.js) and receives
// a dispose() to call before the next rebuild — the same lifecycle shape clear()/
// renderStatic()/playSteps() already have.

import { tween, easeDraw } from './anim.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TOOL_COLOR = 'var(--color-ink-secondary)';

function el(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** DESIGN.md §2 construction-line token, keyed by step role. */
function roleColor(role) {
  if (role === 'given') return 'var(--color-construct-given)';
  if (role === 'move') return 'var(--color-construct-move)';
  return 'var(--color-construct-result)';
}

function roleWidth(role) {
  return role === 'result' ? 1.4 : role === 'given' ? 1 : 0.6;
}

function arcPathD(center, radius, startAngle, endAngle) {
  const p0 = { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) };
  const p1 = { x: center.x + radius * Math.cos(endAngle), y: center.y + radius * Math.sin(endAngle) };
  const large = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** How long a step's draw-on takes — a sweeping arc or a drawn line needs enough time to
 *  actually watch the tool move; a point/label snapping into place doesn't. */
function durationFor(step) {
  return step.kind === 'arc' || step.kind === 'line' || step.kind === 'circle' ? 1800 : 600;
}

/** Build (but do not reveal) the SVG element for one recipe step. Returns { node, reveal,
 *  finalize } where reveal(t) sets the 0..1 draw-on progress and finalize() removes any
 *  transient tool/reveal-only attributes once t reaches 1. */
function buildStepNode(step) {
  if (step.kind === 'line') {
    const len = Math.hypot(step.b.x - step.a.x, step.b.y - step.a.y);
    const dashed = step.role === 'move';
    const angleDeg = (Math.atan2(step.b.y - step.a.y, step.b.x - step.a.x) * 180) / Math.PI;

    const group = el('g', {});
    // The straightedge: a translucent ruler bar laid along the line while it draws,
    // extending slightly past both ends the way a real ruler would. Removed on finalize.
    const overhang = 5;
    const ruler = el('rect', {
      x: -overhang, y: -1.4, width: len + overhang * 2, height: 2.8,
      rx: 0.6, fill: 'color-mix(in srgb, var(--color-ink-secondary) 16%, transparent)',
      stroke: TOOL_COLOR, 'stroke-width': 0.35,
      transform: `translate(${step.a.x} ${step.a.y}) rotate(${angleDeg.toFixed(2)})`,
    });
    const mark = el('line', {
      x1: step.a.x, y1: step.a.y, x2: step.b.x, y2: step.b.y,
      stroke: roleColor(step.role), 'stroke-width': roleWidth(step.role),
      'stroke-linecap': 'round',
    });
    if (dashed) mark.setAttribute('stroke-dasharray', '4 3');
    else mark.setAttribute('stroke-dasharray', String(len));
    group.append(ruler, mark);

    const reveal = (t) => {
      ruler.style.opacity = t >= 1 ? '0' : '1';
      if (dashed) mark.style.opacity = String(t);
      else mark.setAttribute('stroke-dashoffset', String(len * (1 - t)));
    };
    const finalize = () => {
      ruler.style.opacity = '0';
      if (!dashed) mark.removeAttribute('stroke-dasharray');
    };
    return { node: group, reveal, finalize };
  }

  if (step.kind === 'arc') {
    const { center, radius, startAngle, endAngle, role } = step;
    const group = el('g', {});
    // The compass: a needle dot pinned at the centre (the fixed point) and a pencil leg
    // sweeping from startAngle to the current angle, tracing the same arc the ink mark
    // follows. Both disappear once the arc is complete.
    const needle = el('circle', { cx: center.x, cy: center.y, r: 0.9, fill: TOOL_COLOR });
    const leg = el('line', { x1: center.x, y1: center.y, x2: center.x, y2: center.y, stroke: TOOL_COLOR, 'stroke-width': 0.5 });
    const tip = el('circle', { r: 1, fill: TOOL_COLOR });
    const mark = el('path', {
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role),
      'stroke-linecap': 'round',
    });
    if (role === 'move') mark.setAttribute('stroke-dasharray', '3 2.5');
    group.append(needle, mark, leg, tip);

    const reveal = (t) => {
      const cur = startAngle + t * (endAngle - startAngle);
      const tipX = center.x + radius * Math.cos(cur);
      const tipY = center.y + radius * Math.sin(cur);
      leg.setAttribute('x2', tipX.toFixed(2));
      leg.setAttribute('y2', tipY.toFixed(2));
      tip.setAttribute('cx', tipX.toFixed(2));
      tip.setAttribute('cy', tipY.toFixed(2));
      mark.setAttribute('d', arcPathD(center, radius, startAngle, cur));
      const toolOpacity = t >= 1 ? '0' : '1';
      needle.style.opacity = leg.style.opacity = tip.style.opacity = toolOpacity;
    };
    const finalize = () => { needle.style.opacity = leg.style.opacity = tip.style.opacity = '0'; };
    return { node: group, reveal, finalize };
  }

  if (step.kind === 'circle') {
    const { center, radius, role } = step;
    if (role === 'given') {
      // A full given circle (line+circle / circle+circle constructions' starting circle) —
      // stated by the problem, not constructed, so it's drawn statically via renderStatic(),
      // never through playSteps(); reveal() only needs the immediate reveal(1) that calls.
      const node = el('circle', {
        cx: center.x, cy: center.y, r: radius,
        fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role),
      });
      const reveal = (t) => { node.style.opacity = String(t); };
      return { node, reveal, finalize: () => {} };
    }
    // A 'move'/'result' circle (an auxiliary circle, or a circumscribing circle) IS
    // animated through playSteps() — the same compass needle+leg+tip sweep as an 'arc'
    // step, just carried all the way around (2π) instead of a short span, so it reads as
    // "the compass drew this" instead of "this shape appeared." The swept path is capped
    // just short of a full 360° (an SVG elliptical-arc command renders nothing sensible
    // when its start and end points exactly coincide) — finalize() swaps in a true
    // <circle> element for a cleanly-closed result once the sweep completes.
    const group = el('g', {});
    const startAngle = -Math.PI / 2; // start at the top — a natural "12 o'clock" pen-down
    const endAngle = startAngle + Math.PI * 2;
    const needle = el('circle', { cx: center.x, cy: center.y, r: 0.9, fill: TOOL_COLOR });
    const leg = el('line', { x1: center.x, y1: center.y, x2: center.x, y2: center.y, stroke: TOOL_COLOR, 'stroke-width': 0.5 });
    const tip = el('circle', { r: 1, fill: TOOL_COLOR });
    const sweep = el('path', {
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role), 'stroke-linecap': 'round',
    });
    const finalCircle = el('circle', {
      cx: center.x, cy: center.y, r: radius,
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role), opacity: 0,
    });
    group.append(finalCircle, needle, sweep, leg, tip);

    const reveal = (t) => {
      const capped = Math.min(t, 0.995);
      const cur = startAngle + capped * (endAngle - startAngle);
      const tipX = center.x + radius * Math.cos(cur);
      const tipY = center.y + radius * Math.sin(cur);
      leg.setAttribute('x2', tipX.toFixed(2));
      leg.setAttribute('y2', tipY.toFixed(2));
      tip.setAttribute('cx', tipX.toFixed(2));
      tip.setAttribute('cy', tipY.toFixed(2));
      sweep.setAttribute('d', arcPathD(center, radius, startAngle, cur));
      const toolOpacity = t >= 1 ? '0' : '1';
      needle.style.opacity = leg.style.opacity = tip.style.opacity = toolOpacity;
      if (t >= 1) { sweep.style.opacity = '0'; finalCircle.style.opacity = '1'; }
    };
    const finalize = () => {
      needle.style.opacity = leg.style.opacity = tip.style.opacity = '0';
      sweep.style.opacity = '0';
      finalCircle.style.opacity = '1';
    };
    return { node: group, reveal, finalize };
  }

  if (step.kind === 'point') {
    const group = el('g', {});
    const r = step.role === 'result' ? 2.4 : 1.6;
    const dot = el('circle', {
      cx: step.p.x, cy: step.p.y, r,
      fill: step.role === 'move' ? 'var(--color-paper)' : roleColor(step.role),
      stroke: roleColor(step.role), 'stroke-width': 1,
    });
    group.appendChild(dot);
    if (step.label) {
      const text = el('text', {
        x: step.p.x + 4, y: step.p.y - 4,
        fill: roleColor(step.role), 'font-family': 'var(--font-sans)',
        'font-size': 6.5, 'font-weight': 700,
      });
      text.textContent = step.label;
      group.appendChild(text);
    }
    const reveal = (t) => { group.style.opacity = String(t); };
    return { node: group, reveal, finalize: () => {} };
  }

  if (step.kind === 'dim') {
    const { a, b, text, role } = step;
    const color = roleColor(role);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const group = el('g', {});
    if (len < 1e-6) return { node: group, reveal: () => {}, finalize: () => {} };
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const px = -uy; // perpendicular unit vector; step.offset's sign picks the side
    const py = ux;
    const off = step.offset ?? 10;
    const oa = { x: a.x + px * off, y: a.y + py * off };
    const ob = { x: b.x + px * off, y: b.y + py * off };
    const overshoot = 1.5; // extension line runs a hair past the dimension line (BIS convention)
    const extEnd = (o) => ({ x: o.x + px * overshoot * Math.sign(off || 1), y: o.y + py * overshoot * Math.sign(off || 1) });
    const ext1 = el('line', { x1: a.x, y1: a.y, x2: extEnd(oa).x, y2: extEnd(oa).y, stroke: color, 'stroke-width': 0.35, opacity: 0.65 });
    const ext2 = el('line', { x1: b.x, y1: b.y, x2: extEnd(ob).x, y2: extEnd(ob).y, stroke: color, 'stroke-width': 0.35, opacity: 0.65 });
    const dimLine = el('line', { x1: oa.x, y1: oa.y, x2: ob.x, y2: ob.y, stroke: color, 'stroke-width': 0.4 });
    const arrowLen = 2.6;
    const arrowHalfWidth = 0.45; // ~3:1 length:width, BIS closed-arrowhead convention
    const arrowPath = (tip, dirx, diry) => {
      const backx = tip.x - dirx * arrowLen;
      const backy = tip.y - diry * arrowLen;
      const wx = -diry * arrowHalfWidth;
      const wy = dirx * arrowHalfWidth;
      return `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${(backx + wx).toFixed(2)} ${(backy + wy).toFixed(2)} L ${(backx - wx).toFixed(2)} ${(backy - wy).toFixed(2)} Z`;
    };
    const arrow1 = el('path', { d: arrowPath(oa, -ux, -uy), fill: color });
    const arrow2 = el('path', { d: arrowPath(ob, ux, uy), fill: color });
    const mid = { x: (oa.x + ob.x) / 2 + px * 4, y: (oa.y + ob.y) / 2 + py * 4 };
    const label = el('text', {
      x: mid.x.toFixed(2), y: mid.y.toFixed(2),
      fill: color, 'font-family': 'var(--font-mono)', 'font-size': 5.5,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    });
    label.textContent = text;
    group.append(ext1, ext2, dimLine, arrow1, arrow2, label);
    const reveal = (t) => { group.style.opacity = String(t); };
    return { node: group, reveal, finalize: () => {} };
  }

  if (step.kind === 'angledim') {
    // An angle mark: a small arc between two rays from `center`, plus its degree value —
    // the angular counterpart to 'dim' (which marks a LENGTH). Static reveal (opacity fade,
    // like 'dim'), not compass-animated — it's labelling an angle the construction already
    // implies, not a new drafting move.
    const { center, rayA, rayB, text, role } = step;
    const color = roleColor(role);
    const radius = step.radius ?? 10;
    const a0 = Math.atan2(rayA.y - center.y, rayA.x - center.x);
    const a1raw = Math.atan2(rayB.y - center.y, rayB.x - center.x);
    let diff = a1raw - a0;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const a1 = a0 + diff; // normalized to the minor (<=180°) arc between the two rays
    const group = el('g', {});
    const arcNode = el('path', { d: arcPathD(center, radius, a0, a1), fill: 'none', stroke: color, 'stroke-width': 0.5 });
    const midAngle = a0 + diff / 2;
    const labelR = radius + 4;
    const label = el('text', {
      x: (center.x + labelR * Math.cos(midAngle)).toFixed(2),
      y: (center.y + labelR * Math.sin(midAngle)).toFixed(2),
      fill: color, 'font-family': 'var(--font-mono)', 'font-size': 5.5,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
    });
    label.textContent = text;
    group.append(arcNode, label);
    const reveal = (t) => { group.style.opacity = String(t); };
    return { node: group, reveal, finalize: () => {} };
  }

  // 'label' kind — text only, no geometry.
  const node = el('text', {
    x: step.p.x + (step.dx ?? 4), y: step.p.y + (step.dy ?? -4),
    fill: 'var(--color-ink-secondary)', 'font-family': 'var(--font-sans)', 'font-size': 6.5,
  });
  node.textContent = step.text;
  const reveal = (t) => { node.style.opacity = String(t); };
  return { node, reveal, finalize: () => {} };
}

/** Remove every child of the construction layer (the disposal-contract re-expression). */
export function clear(group) {
  while (group.firstChild) group.removeChild(group.firstChild);
}

/** The axis-aligned bounding box (drawing units) of a list of recipe steps, including
 *  each dim mark's own offset reach — main.js calls this before Play so the viewport
 *  (viewTransform.js's ensureVisible()) can confirm a zoomed-in/panned view still shows
 *  the whole construction the animation is about to draw. */
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
    } else if (step.kind === 'circle') {
      upd(step.center.x - step.radius, step.center.y - step.radius);
      upd(step.center.x + step.radius, step.center.y + step.radius);
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
    } else if (step.kind === 'angledim') {
      const reach = (step.radius ?? 10) + 6; // label sits a few units past the arc itself
      upd(step.center.x - reach, step.center.y - reach);
      upd(step.center.x + reach, step.center.y + reach);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Draw a list of steps immediately at full opacity — no animation. Used for the "Given"
 *  step's static display and for landing on a later wizard step without pressing Play. */
export function renderStatic(group, steps) {
  for (const step of steps) {
    const { node, reveal, finalize } = buildStepNode(step);
    group.appendChild(node);
    reveal(1);
    finalize();
  }
}

/**
 * Sequentially reveal a list of steps, one draw-on tween after another. Returns a handle
 * with cancel(). Honors reduced motion automatically (anim.js's tween() collapses to the
 * end state and still calls onComplete, so the chain still advances and finishes fast).
 * @param {SVGGElement} group
 * @param {Array} steps
 * @param {{onComplete?: () => void}} [opts]
 */
export function playSteps(group, steps, { onComplete } = {}) {
  let cancelled = false;
  let activeTween = null;

  function playAt(i) {
    if (cancelled) return;
    if (i >= steps.length) { onComplete?.(); return; }
    const step = steps[i];
    const { node, reveal, finalize } = buildStepNode(step);
    group.appendChild(node);
    activeTween = tween({
      from: 0, to: 1, duration: durationFor(step), ease: easeDraw,
      onUpdate: reveal,
      onComplete: () => { finalize(); playAt(i + 1); },
    });
  }
  playAt(0);

  return { cancel: () => { cancelled = true; activeTween?.cancel(); } };
}

// ============================================================================
// Draggable handle (this topic's own new interaction — see the header comment).
// ============================================================================

/** Convert a client-space point (from a PointerEvent) to the SVG's own user-space
 *  coordinates, accounting for the current viewBox/pan/zoom automatically — the standard
 *  SVG API for this, so it stays correct no matter what viewTransform.js's pan/zoom state
 *  is, without duplicating that module's own manual viewBox math. */
function clientToSvgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

/**
 * Mount (or remount) the one draggable handle a construction may declare (constructions.js's
 * `handle` field — today, both Ogee Curve constructions use it). Constrained to a 1D drag
 * along a fixed axis (handle.axisFrom + t*handle.axisDir), converted back to the bound
 * `given[]` param via handle.toParam() and committed through the SAME sim.commit() every
 * slider already uses — no second state path (RULES §3.2's spirit, re-expressed: a control
 * that happens to live inside the SVG is still only allowed to change state via commit()).
 *
 * Keyboard-operable, not drag-only (PRODUCT.md §7 accessibility commitment): the handle is
 * a focusable `role="slider"` element; ArrowUp/ArrowRight increments by `step`, ArrowDown/
 * ArrowLeft decrements, Home/End jump to min/max — the same semantics a native
 * `<input type="range">` already has, so it needs no separate instructions to discover.
 *
 * @param {SVGSVGElement} svg  the root <svg> (for client->user-space conversion)
 * @param {SVGGElement} group  layer to mount the handle into (main.js's #handle-layer)
 * @param {import('./constructions.js').HandleSpec} handle
 * @param {number} value  current value of state.params[handle.key]
 * @param {{ min: number, max: number, step: number, unit: string, label: string }} paramSpec
 * @param {{ onCommit: (value: number) => void, announce?: (msg: string) => void }} callbacks
 * @returns {{ dispose: () => void }}
 */
export function mountHandle(svg, group, handle, value, paramSpec, { onCommit, announce }) {
  const ac = new AbortController();
  const listen = { signal: ac.signal };

  const HALO_R = 5.5;
  const DOT_R = 3;
  const color = 'var(--color-construct-move)'; // never blue inside the viewport (DESIGN.md §2.3)

  const halo = el('circle', {
    cx: handle.point.x, cy: handle.point.y, r: HALO_R,
    fill: 'none', stroke: color, 'stroke-width': 0.6, 'stroke-dasharray': '2 1.4',
    opacity: 0.55,
  });
  const dot = el('circle', {
    cx: handle.point.x, cy: handle.point.y, r: DOT_R,
    fill: color, stroke: 'var(--color-paper)', 'stroke-width': 0.8,
  });
  const hit = el('circle', {
    // A generous invisible hit-target — the visible dot is deliberately small (matches the
    // rest of this topic family's point styling), but a 3-unit-radius target is too small
    // to comfortably drag; this circle is 4x the area and never rendered.
    cx: handle.point.x, cy: handle.point.y, r: HALO_R + 2,
    fill: 'transparent', stroke: 'none',
    cursor: 'grab', tabindex: '0', role: 'slider',
    'aria-label': paramSpec.label,
    'aria-valuemin': String(paramSpec.min), 'aria-valuemax': String(paramSpec.max),
    'aria-valuenow': String(value),
    'aria-valuetext': `${value}${paramSpec.unit ? ` ${paramSpec.unit}` : ''}`,
  });

  const wrap = el('g', { class: 'ogee-handle' });
  wrap.append(halo, dot, hit);
  group.appendChild(wrap);

  function setValueText(v) {
    hit.setAttribute('aria-valuenow', String(v));
    hit.setAttribute('aria-valuetext', `${v}${paramSpec.unit ? ` ${paramSpec.unit}` : ''}`);
  }

  let dragging = false;
  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    hit.setPointerCapture(e.pointerId);
    hit.style.cursor = 'grabbing';
    hit.focus();
  }, listen);
  hit.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = clientToSvgPoint(svg, e.clientX, e.clientY);
    const rel = { x: p.x - handle.axisFrom.x, y: p.y - handle.axisFrom.y };
    const distAlongAxis = rel.x * handle.axisDir.x + rel.y * handle.axisDir.y;
    const next = handle.toParam(distAlongAxis);
    setValueText(next);
    onCommit(next);
  }, listen);
  const endDrag = () => { dragging = false; hit.style.cursor = 'grab'; };
  hit.addEventListener('pointerup', endDrag, listen);
  hit.addEventListener('pointercancel', endDrag, listen);

  hit.addEventListener('keydown', (e) => {
    let next = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = Math.min(paramSpec.max, value + paramSpec.step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = Math.max(paramSpec.min, value - paramSpec.step);
    else if (e.key === 'Home') next = paramSpec.min;
    else if (e.key === 'End') next = paramSpec.max;
    if (next === null) return;
    e.preventDefault();
    setValueText(next);
    onCommit(next);
    announce?.(`${paramSpec.label}: ${next}${paramSpec.unit ? ` ${paramSpec.unit}` : ''}`);
  }, listen);

  return { dispose: () => ac.abort() };
}
