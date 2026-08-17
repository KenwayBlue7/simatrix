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
  return role === 'result' ? 1.2 : role === 'given' ? 1 : 0.6;
}

// Chrome (label font-size, stroke-width, angle-arc radius/label — never a step's geometric
// position) is drawn at these absolute constants, tuned to read right at chromeScale=1 (the
// worst-case param combo constructions.js's calibratedScale() froze the frame's scale on).
// Every call site below multiplies by `chromeScale` (constructions.js's chromeScaleFor(),
// threaded in from main.js's lastRecipe) so chrome shrinks in lockstep with a smaller-than-
// worst-case drawing instead of staying pinned to that ceiling's size. Defaults to 1 so a
// caller that hasn't been updated still renders exactly as before.
const VERTEX_FONT = 6.5;
const ANNO_FONT = 5.5; // dim/angledim label
const LABEL_FONT = 6.5; // 'label'-kind step (plain text)
const ANGLEDIM_ARC_RADIUS = 10;
const DOT_RADIUS = { result: 1.7, other: 1.1 };
const DOT_STROKE = 1;
const DIM_EXT_STROKE = 0.35;
const DIM_LINE_STROKE = 0.4;
const DIM_ARROW_LEN = 2.6;
const DIM_ARROW_HALF_WIDTH = 0.45;
const ANGLEDIM_ARC_STROKE = 0.5;

function arcPathD(center, radius, startAngle, endAngle) {
  const p0 = { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) };
  const p1 = { x: center.x + radius * Math.cos(endAngle), y: center.y + radius * Math.sin(endAngle) };
  const large = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
  const sweep = endAngle > startAngle ? 1 : 0;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${large} ${sweep} ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`;
}

/** How long a step's draw-on takes — a sweeping arc or a drawn line needs enough time to
 *  actually watch the tool move; a point/label snapping into place doesn't. These are the
 *  PER-KIND base durations; the actual contract playSteps() honours is PLAY_BUDGET_MS below
 *  (a whole-call time budget), not these constants directly — see playSteps(). */
function durationFor(step) {
  return step.kind === 'arc' || step.kind === 'line' || step.kind === 'circle' ? 1800 : 600;
}

// Phase A audit (E5): durationFor()'s flat per-step constants have no ceiling on a whole
// playSteps() call — N-Gon/Semicircle Division at n=12 summed to ~75.6s of unskippable
// animation (measured: 11 division points + 21 rays/sides/semicircle + 10 arc-cuts). Every
// OTHER construction's own default already ran 22-37s, not just the n=12 extreme.
// PLAY_BUDGET_MS caps one playSteps() CALL, not one step — durationFor()'s per-kind values
// stay meaningful (Step Through still shows a proper compass sweep), but a call whose steps
// sum past the budget gets every step's duration scaled down by the same factor, so relative
// pacing (arc vs point) is preserved. Applied UNIFORMLY to every call, Play All's whole-recipe
// call and Step Through's one-slide call alike — no special-casing by caller. In practice this
// means Play All (which hands the whole recipe) is the one that visibly compresses; almost
// every individual Step Through slide is already well under budget so it renders at
// durationFor()'s stated pace unchanged. Two slides are the exception, both only at the N-Gon
// slider's n=12 ceiling: Semicircle Division's final "Join every side" slide (11 lines, 20.4s
// raw) and Perpendicular Bisector's "cut every vertex" slide (12 arcs, 24s raw) — both exceed
// PLAY_BUDGET_MS on their own and get the same mild, budget-respecting compression Play All
// gets. That is a feature, not a gap: it means NO single reveal, slide or full recipe, ever
// runs unbounded — which is the actual outcome this fix is for. Verified numerically for every
// (method, n) combination, not just the n=12 case — see the topic's DESIGN.md §8.
// Rejected: lowering durationFor()'s constants instead — a flat cut from 1800->1100ms only
// takes n=12 to ~46s, it doesn't solve the actual "no ceiling" problem, and it slows down
// every short construction that never needed it.
const PLAY_BUDGET_MS = 20000;
const MIN_STEP_MS = 200; // floor so a future, larger recipe can't compress a step to a flicker

/** Build (but do not reveal) the SVG element for one recipe step. Returns { node, reveal,
 *  finalize } where reveal(t) sets the 0..1 draw-on progress and finalize() removes any
 *  transient tool/reveal-only attributes once t reaches 1. */
function buildStepNode(step, chromeScale = 1) {
  if (step.kind === 'line') {
    const len = Math.hypot(step.b.x - step.a.x, step.b.y - step.a.y);
    const dashed = step.role === 'move';
    const angleDeg = (Math.atan2(step.b.y - step.a.y, step.b.x - step.a.x) * 180) / Math.PI;

    // data-role drives the post-construction de-emphasis fade (index.html's .is-complete
    // rule) — stamped on every ink node's root so CSS can select by role without the JS
    // side needing a second pass (Phase A audit, ADR-145).
    const group = el('g', { 'data-role': step.role });
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
      stroke: roleColor(step.role), 'stroke-width': roleWidth(step.role) * chromeScale,
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
    const group = el('g', { 'data-role': role });
    // The compass: a needle dot pinned at the centre (the fixed point) and a pencil leg
    // sweeping from startAngle to the current angle, tracing the same arc the ink mark
    // follows. Both disappear once the arc is complete.
    const needle = el('circle', { cx: center.x, cy: center.y, r: 0.9, fill: TOOL_COLOR });
    const leg = el('line', { x1: center.x, y1: center.y, x2: center.x, y2: center.y, stroke: TOOL_COLOR, 'stroke-width': 0.5 });
    const tip = el('circle', { r: 1, fill: TOOL_COLOR });
    const mark = el('path', {
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role) * chromeScale,
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
        fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role) * chromeScale,
        'data-role': role,
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
    const group = el('g', { 'data-role': role });
    const startAngle = -Math.PI / 2; // start at the top — a natural "12 o'clock" pen-down
    const endAngle = startAngle + Math.PI * 2;
    const needle = el('circle', { cx: center.x, cy: center.y, r: 0.9, fill: TOOL_COLOR });
    const leg = el('line', { x1: center.x, y1: center.y, x2: center.x, y2: center.y, stroke: TOOL_COLOR, 'stroke-width': 0.5 });
    const tip = el('circle', { r: 1, fill: TOOL_COLOR });
    const sweep = el('path', {
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role) * chromeScale, 'stroke-linecap': 'round',
    });
    const finalCircle = el('circle', {
      cx: center.x, cy: center.y, r: radius,
      fill: 'none', stroke: roleColor(role), 'stroke-width': roleWidth(role) * chromeScale, opacity: 0,
    });
    // DESIGN.md §2: the move role is "thin, DASHED" — applied for 'line'/'arc' already, but
    // this circle path was missing it, rendering a solid violet circumcircle that competes
    // head-on with the solid green result polygon (Two-Cue Rule, RULES §4.6; Phase A audit,
    // ADR-145).
    if (role === 'move') {
      sweep.setAttribute('stroke-dasharray', '3 2.5');
      finalCircle.setAttribute('stroke-dasharray', '3 2.5');
    }
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
    const r = (step.role === 'result' ? DOT_RADIUS.result : DOT_RADIUS.other) * chromeScale;
    const dot = el('circle', {
      cx: step.p.x, cy: step.p.y, r,
      fill: step.role === 'move' ? 'var(--color-paper)' : roleColor(step.role),
      stroke: roleColor(step.role), 'stroke-width': DOT_STROKE * chromeScale,
      'data-role': step.role,
    });
    // The marker dot is ink; its text (if any) is returned SEPARATELY as labelNode, not
    // appended here — the caller (renderStatic()/playSteps()) routes labelNode into a
    // labels sublayer that always paints above every step's ink, platform-wide, so a later
    // step's line/arc can never paint over an earlier step's label (Phase A audit, ADR-145).
    let labelNode = null;
    if (step.label) {
      // dx/dy default to the original fixed +4/-4 offset — assignLabelPositions() (below)
      // overrides them per-recipe when a construction has enough points/labels for
      // collisions to be possible; a construction with only a couple of labels never
      // triggers the greedy search and keeps today's exact placement.
      labelNode = el('text', {
        x: step.p.x + (step.dx ?? 4), y: step.p.y + (step.dy ?? -4),
        fill: roleColor(step.role), 'font-family': 'var(--font-sans)',
        'font-size': VERTEX_FONT * chromeScale, 'font-weight': 700,
        'data-role': step.role,
      });
      labelNode.textContent = step.label;
    }
    const reveal = (t) => { dot.style.opacity = String(t); if (labelNode) labelNode.style.opacity = String(t); };
    return { node: dot, labelNode, reveal, finalize: () => {} };
  }

  if (step.kind === 'dim') {
    const { a, b, text, role } = step;
    const color = roleColor(role);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const group = el('g', { 'data-role': role });
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
    const ext1 = el('line', { x1: a.x, y1: a.y, x2: extEnd(oa).x, y2: extEnd(oa).y, stroke: color, 'stroke-width': DIM_EXT_STROKE * chromeScale, opacity: 0.65 });
    const ext2 = el('line', { x1: b.x, y1: b.y, x2: extEnd(ob).x, y2: extEnd(ob).y, stroke: color, 'stroke-width': DIM_EXT_STROKE * chromeScale, opacity: 0.65 });
    const dimLine = el('line', { x1: oa.x, y1: oa.y, x2: ob.x, y2: ob.y, stroke: color, 'stroke-width': DIM_LINE_STROKE * chromeScale });
    const arrowLen = DIM_ARROW_LEN * chromeScale;
    const arrowHalfWidth = DIM_ARROW_HALF_WIDTH * chromeScale; // ~3:1 length:width, BIS closed-arrowhead convention
    const arrowPath = (tip, dirx, diry) => {
      const backx = tip.x - dirx * arrowLen;
      const backy = tip.y - diry * arrowLen;
      const wx = -diry * arrowHalfWidth;
      const wy = dirx * arrowHalfWidth;
      return `M ${tip.x.toFixed(2)} ${tip.y.toFixed(2)} L ${(backx + wx).toFixed(2)} ${(backy + wy).toFixed(2)} L ${(backx - wx).toFixed(2)} ${(backy - wy).toFixed(2)} Z`;
    };
    const arrow1 = el('path', { d: arrowPath(oa, -ux, -uy), fill: color });
    const arrow2 = el('path', { d: arrowPath(ob, ux, uy), fill: color });
    // labelPush defaults to 4 (today's fixed offset) but assignLabelPositions() may widen it
    // to clear a collision with other drawn ink or another label (see that function, below).
    const push = step.labelPush ?? 4;
    const mid = { x: (oa.x + ob.x) / 2 + px * push, y: (oa.y + ob.y) / 2 + py * push };
    const label = el('text', {
      x: mid.x.toFixed(2), y: mid.y.toFixed(2),
      fill: color, 'font-family': 'var(--font-mono)', 'font-size': ANNO_FONT * chromeScale,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'data-role': role,
    });
    label.textContent = text;
    // Label kept OUT of `group` (ink only) — returned as labelNode so the caller can route
    // it into the always-on-top labels sublayer (see the 'point' branch's comment, above).
    group.append(ext1, ext2, dimLine, arrow1, arrow2);
    const reveal = (t) => { group.style.opacity = String(t); label.style.opacity = String(t); };
    return { node: group, labelNode: label, reveal, finalize: () => {} };
  }

  if (step.kind === 'angledim') {
    // An angle mark: a small arc between two rays from `center`, plus its degree value —
    // the angular counterpart to 'dim' (which marks a LENGTH). Static reveal (opacity fade,
    // like 'dim'), not compass-animated — it's labelling an angle the construction already
    // implies, not a new drafting move.
    const { center, rayA, rayB, text, role } = step;
    const color = roleColor(role);
    // step.radius is already in final viewBox units (scaled once by constructions.js's
    // frozen calibratedScale) — that scale is the SAME constant for every param combo, so
    // without the chromeScale factor here this arc would draw at a fixed size regardless of
    // how much smaller than the calibration ceiling the current polygon actually is.
    const radius = (step.radius ?? ANGLEDIM_ARC_RADIUS) * chromeScale;
    const a0 = Math.atan2(rayA.y - center.y, rayA.x - center.x);
    const a1raw = Math.atan2(rayB.y - center.y, rayB.x - center.x);
    let diff = a1raw - a0;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const a1 = a0 + diff; // normalized to the minor (<=180°) arc between the two rays
    const group = el('g', { 'data-role': role });
    const arcNode = el('path', { d: arcPathD(center, radius, a0, a1), fill: 'none', stroke: color, 'stroke-width': ANGLEDIM_ARC_STROKE * chromeScale });
    // labelPush/labelShiftDeg default to 4/0 (today's fixed radial offset past the arc) but
    // assignLabelPositions() may widen/rotate them to clear a collision with other drawn ink
    // or another label (below) — angledimLabelCenter() there computes the identical position.
    // push is scaled by chromeScale too (radius above already is) — see angledimLabelCenter()'s
    // comment for why push must track the arc instead of staying a fixed absolute gap.
    const midAngle = a0 + diff / 2 + ((step.labelShiftDeg ?? 0) * Math.PI) / 180;
    const labelR = radius + (step.labelPush ?? 4) * chromeScale;
    const label = el('text', {
      x: (center.x + labelR * Math.cos(midAngle)).toFixed(2),
      y: (center.y + labelR * Math.sin(midAngle)).toFixed(2),
      fill: color, 'font-family': 'var(--font-mono)', 'font-size': ANNO_FONT * chromeScale,
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      'data-role': role,
    });
    label.textContent = text;
    // Label kept OUT of `group` (ink only) — see the 'point' branch's comment, above.
    group.appendChild(arcNode);
    const reveal = (t) => { group.style.opacity = String(t); label.style.opacity = String(t); };
    return { node: group, labelNode: label, reveal, finalize: () => {} };
  }

  // 'label' kind — text only, no geometry, so it IS the labelNode (no ink `node` at all).
  const labelNode = el('text', {
    x: step.p.x + (step.dx ?? 4), y: step.p.y + (step.dy ?? -4),
    fill: 'var(--color-ink-secondary)', 'font-family': 'var(--font-sans)', 'font-size': LABEL_FONT * chromeScale,
  });
  labelNode.textContent = step.text;
  const reveal = (t) => { labelNode.style.opacity = String(t); };
  return { node: null, labelNode, reveal, finalize: () => {} };
}

/** Remove every child of the construction layer (the disposal-contract re-expression). */
export function clear(group) {
  while (group.firstChild) group.removeChild(group.firstChild);
}

/** Approximate on-screen box a label's text will occupy at a given dx/dy offset from its
 *  point — text is left-anchored at p.x+dx, sits just above p.y+dy (matches the 'point'
 *  branch above), so the box extends right of x and up from y. Width is a rough
 *  per-character estimate (font-size 6.5, bold) — doesn't need to be exact, only good
 *  enough to catch real overlaps. */
function labelBox(step, dx, dy, chromeScale = 1) {
  const w = (step.label.length * 4.3 + 1.5) * chromeScale;
  const h = 7 * chromeScale;
  return { x0: step.p.x + dx, x1: step.p.x + dx + w, y0: step.p.y + dy - h, y1: step.p.y + dy + 1.5 * chromeScale };
}

function pointBox(p, r) {
  return { x0: p.x - r, x1: p.x + r, y0: p.y - r, y1: p.y + r };
}

/** Box for a dim/angledim label — centred at (cx,cy), matching their `text-anchor: middle` /
 *  `dominant-baseline: middle` (unlike labelBox(), above, which is left/top-anchored for a
 *  'point' step's text). */
function annoLabelBox(cx, cy, charCount, fontSize = 5.5) {
  const w = charCount * fontSize * 0.62;
  const h = fontSize * 1.2;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
}

function boxesOverlap(a, b, pad = 1) {
  return a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0;
}

/** Whether `p` lies (within a small tolerance) ON the arc traced by center/radius/span — "this
 *  point's own construction ink," the same not-a-collision idea a point's own dot already gets
 *  (geometryObstacles()'s `owner: step` exclusion, below), extended to the compass arc that was
 *  drawn TO REACH it. A point built by `arcMark(center, radius, aimPoint, …)` sits exactly on
 *  that arc's curve by construction — e.g. the Perpendicular Bisector ladder's point 4/6 (Phase
 *  D audit, ADR-153 addendum): without this, the label-collision search could never get closer
 *  than ~2 units to its own dot before grazing the very arc that placed it. Purely geometric
 *  (no step-identity threading needed) so it generalizes to every arc-then-point call site at
 *  once — vertex letters, semicircle-division numbers, pentagon's apex — not just the ladder. */
function onOwnArc(p, center, radius, startAngle, endAngle, tol = 0.3) {
  const d = Math.hypot(p.x - center.x, p.y - center.y);
  if (Math.abs(d - radius) > tol) return false;
  let a = Math.atan2(p.y - center.y, p.x - center.x);
  const s = startAngle, e = endAngle;
  while (a < s - 0.01) a += 2 * Math.PI;
  while (a > e + 0.01) a -= 2 * Math.PI;
  return a >= s - 0.01 && a <= e + 0.01;
}

/** Same idea as onOwnArc(), for a straight line — whether `p` lies on segment a-b. Covers a
 *  point built to sit ON a drawn line (e.g. every rung of the ladder sits on the bisector line
 *  connecting them all). */
function onOwnSegment(p, a, b, tol = 0.3) {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 || 1;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len2;
  if (t < -0.05 || t > 1.05) return false;
  const px = a.x + t * (b.x - a.x), py = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - px, p.y - py) < tol;
}

/** A handful of small boxes sampled along a line segment — a cheap stand-in for "this ink is
 *  here" that boxesOverlap() can test a label box against, same spirit as pointBox() for a
 *  marker dot. Sampled from 12%..88% of the segment, NOT its literal endpoints: a's/b's own
 *  'point' steps already register their own pointBox() obstacle (above) at full size, so
 *  sampling all the way to t=0/t=1 here would double-count that same small neighbourhood —
 *  and since a label box is always left-anchored/grows rightward regardless of which way its
 *  outward hint points (SVG `text-anchor: start`), a point's OWN outward-pointing label can
 *  still graze the immediate start of a line springing from that same point, getting
 *  rejected by a collision that isn't really a separate piece of ink (reproduced live: A's
 *  own outward hint kept losing to the AB line's t=0 sample sitting right at A itself). */
function segmentObstacles(a, b, n = 6) {
  const boxes = [];
  for (let i = 0; i <= n; i++) {
    const t = 0.12 + (i / n) * 0.76;
    boxes.push(pointBox({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 0.6));
  }
  return boxes;
}

/** Same idea as segmentObstacles(), sampled around an arc's actual angular span (or a full
 *  circle when startAngle/endAngle span 2π) — mirrors computeBounds()'s own arc sampling. */
function arcObstacles(center, radius, startAngle, endAngle, n = 12) {
  const boxes = [];
  for (let i = 0; i <= n; i++) {
    const a = startAngle + (endAngle - startAngle) * (i / n);
    boxes.push(pointBox({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) }, 0.6));
  }
  return boxes;
}

/** 12 candidate directions around a point, at 3 radii (the hint's own, then 1.5x and 2.2x
 *  that) — starting from the point's own dx/dy hint (constructions.js's radial-outward
 *  offset, when it supplies one) so the FIRST try is usually already the semantically-right
 *  side of the point, falling back to a rotating, then widening, search only when that
 *  collides with something. Points with no hint start from the plain +4/-4 direction, keeping
 *  today's default look. */
function candidateOffsets(hintDx, hintDy) {
  const mag = hintDx != null ? Math.hypot(hintDx, hintDy) : Math.hypot(4, 4);
  const baseAngle = hintDx != null ? Math.atan2(hintDy, hintDx) : Math.atan2(-4, 4);
  const turnsDeg = [0, 45, -45, 90, -90, 135, -135, 180, 22.5, -22.5, 67.5, -67.5];
  const out = [];
  // Three rings — the third (2.2x) is the escape hatch for genuinely tight spots (e.g.
  // n=12 near max side in the semicircle-division method, where several division points
  // sit within a label-box-width of each other) that the first two rings can't clear.
  for (const radius of [mag, mag * 1.5, mag * 2.2]) {
    for (const turn of turnsDeg) {
      const a = baseAngle + (turn * Math.PI) / 180;
      out.push({ dx: radius * Math.cos(a), dy: radius * Math.sin(a) });
    }
  }
  return out;
}

/** Candidate label-push distances for a dim/angledim label — starting from the step's OWN
 *  current labelPush (if it already has one, from an earlier resolve pass — see the idempotency
 *  note below), then a small widening ladder past the default 4. Mirrors candidateOffsets()'s
 *  widening-rings idea, but along the mark's own radial/perpendicular axis instead of a
 *  12-direction fan, since a dim/angledim label only has one natural AXIS to slide along
 *  (further from the line/vertex), not a free 2D position. */
function pushCandidates(currentPush) {
  const base = currentPush ?? 4;
  return [...new Set([base, 4, 8, 12, 16])];
}

/** The dim label's centre at a given push — MUST mirror buildStepNode()'s own 'dim' branch
 *  (above) exactly, since this is what decides whether a push clears a collision the actual
 *  render will also have. */
function dimLabelCenter(step, push) {
  const len = Math.hypot(step.b.x - step.a.x, step.b.y - step.a.y) || 1;
  const px = -(step.b.y - step.a.y) / len;
  const py = (step.b.x - step.a.x) / len;
  const off = step.offset ?? 10;
  const oa = { x: step.a.x + px * off, y: step.a.y + py * off };
  const ob = { x: step.b.x + px * off, y: step.b.y + py * off };
  return { x: (oa.x + ob.x) / 2 + px * push, y: (oa.y + ob.y) / 2 + py * push };
}

/** The angledim label's centre at a given push + angular shift off its natural mid-angle —
 *  mirrors buildStepNode()'s 'angledim' branch (shift 0 reproduces it exactly). A purely
 *  RADIAL push (shift always 0) isn't enough on its own: two angle marks whose bisectors
 *  converge toward each other (e.g. the "54° at A" / "54° at B" pair, both pointing roughly
 *  at the shared apex) just stay just as close together at every radius — pushing them apart
 *  needs sliding at least one of them SIDEWAYS off its own bisector too, the same 2D freedom
 *  candidateOffsets() already gives point labels. */
function angledimLabelCenter(step, push, shiftDeg = 0, chromeScale = 1) {
  const a0 = Math.atan2(step.rayA.y - step.center.y, step.rayA.x - step.center.x);
  let diff = Math.atan2(step.rayB.y - step.center.y, step.rayB.x - step.center.x) - a0;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const midAngle = a0 + diff / 2 + (shiftDeg * Math.PI) / 180;
  // (step.radius ?? 10) * chromeScale mirrors buildStepNode()'s own 'angledim' radius exactly
  // (see the comment there). push is ALSO chromeScale'd here (unlike dimLabelCenter's
  // offset/push, which stay unscaled by design) — push is "distance past the arc," not a
  // free-standing position hint, so it must shrink with the arc or it dominates a small,
  // heavily-chromeScale'd radius (Phase A audit found push at 56% of labelR for a small
  // angledim at chromeScale=0.5, vs ~39% pre-chromeScale — push had become the bigger term).
  const labelR = ((step.radius ?? ANGLEDIM_ARC_RADIUS) + push) * chromeScale;
  return { x: step.center.x + labelR * Math.cos(midAngle), y: step.center.y + labelR * Math.sin(midAngle) };
}

/** {push, shiftDeg} candidates for an angledim label — the step's own current values first
 *  (idempotency, same reasoning as pushCandidates()), then a small ring/shift grid. shiftDeg
 *  rungs are PROPORTIONAL to this step's own angular span (diff), not fixed absolute degrees —
 *  a fixed shift (the old ladder's 14/26/40°) eats a wildly different fraction of a narrow
 *  angle's wedge than a wide one's: 26° is 87% of a 30° angle's own span (swings the label
 *  almost out of it) but only 22% of a 120° angle's span (label stays comfortably inside) —
 *  same shared collision search, same absolute rotation, opposite-looking result purely
 *  because the two angledim marks it's applied to have very different native widths (Phase A
 *  audit, this session: 30° division-angle vs 120° interior-angle labels on the same N-Gon
 *  drawing). Capped in absolute degrees too so a very wide angle's rungs don't spiral past a
 *  sane rotation. */
function angledimCandidates(step) {
  const a0 = Math.atan2(step.rayA.y - step.center.y, step.rayA.x - step.center.x);
  let diff = Math.atan2(step.rayB.y - step.center.y, step.rayB.x - step.center.x) - a0;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  const spanDeg = (Math.abs(diff) * 180) / Math.PI;
  const basePush = step.labelPush ?? 4;
  const baseShift = step.labelShiftDeg ?? 0;
  const pushes = [...new Set([basePush, 4, 8, 12, 16])];
  const r1 = Math.min(15, spanDeg * 0.15);
  const r2 = Math.min(30, spanDeg * 0.3);
  const r3 = Math.min(45, spanDeg * 0.5);
  const shifts = [...new Set([baseShift, 0, r1, -r1, r2, -r2, r3, -r3])];
  const out = [];
  for (const push of pushes) for (const shiftDeg of shifts) out.push({ push, shiftDeg });
  return out;
}

/** Every obstacle the drawn INK itself presents to a label — points, lines, arcs, circles,
 *  and (unlike the rest) a dim/angledim mark's OWN ink — built once from `steps` before any
 *  label is placed (the geometry doesn't move during this pass). Richer than "marker dots
 *  only": a label sitting ON a ray, an arc, or a circle read just as broken as one sitting on
 *  another label (Phase A audit, ADR-145). Each box carries an `owner` (the step it came from,
 *  or null for ownerless ink) so a point's OWN candidate search can exclude its OWN dot: a
 *  label sitting close to the point it names is expected, not a collision, and the small
 *  vertical/horizontal component a real outward hint can have (unlike the old fixed +4/-4
 *  default, which always happened to clear its own dot by construction) can otherwise
 *  self-reject and fall through to an oddly-rotated fallback.
 *
 *  A dim/angledim mark's own ink is the OPPOSITE case from a point's dot — its label is
 *  supposed to sit clear of the very arc/line it annotates, not hug it — so those boxes stay
 *  tagged with their owning step but assignLabelPositions() does NOT filter them out of that
 *  step's own search the way it does for 'point'. Before this, dim/angledim ink was entirely
 *  absent from `occupied`, so a label's search never detected its own mark underneath it and
 *  kept the very first (smallest-push) candidate — invisible on a normal-sized arc, but a
 *  small-radius angledim (e.g. this topic's 30°/120° N-Gon marks, ADR-14x Phase A follow-up)
 *  could have a chord shorter than its own label text, so the label fully occluded the arc it
 *  was meant to be labelling, reading as "the arc is missing"/"wrong position" even though the
 *  underlying rayA/rayB sweep was correct. `chromeScale` mirrors buildStepNode()'s own
 *  'angledim' radius exactly (see angledimLabelCenter()'s comment) — without it this obstacle
 *  would be sized for the PRE-chrome-shrink arc, larger than what's actually drawn. */
function geometryObstacles(steps, chromeScale = 1) {
  const occupied = [];
  for (const step of steps) {
    if (step.kind === 'point') {
      occupied.push({ ...pointBox(step.p, (step.role === 'result' ? 1.7 : 1.1) + 1), owner: step });
    } else if (step.kind === 'line') {
      // `unobtrusive` (Phase D, ADR-153 addendum): scaffolding ink drawn to FIND a construction
      // (e.g. the Perpendicular Bisector's own compass arcs, below) rather than ink that IS a
      // labelled point's answer — opts out of the obstacle set entirely, for every label, not
      // just the one point it happens to sit nearest. Distinct from onOwnSegment/onOwnArc below,
      // which excise ink a SPECIFIC point sits exactly on; this is for ink no point sits on but
      // that still crowds a busy neighbourhood (verified via sweep, ADR-153 addendum: without
      // it the ladder's own point 4 stays stuck three rings out even after its own arc/line are
      // excluded, blocked purely by nearby scaffold arcs it never touches).
      if (step.unobtrusive) continue;
      for (const b of segmentObstacles(step.a, step.b)) occupied.push({ ...b, owner: null, lineA: step.a, lineB: step.b });
    } else if (step.kind === 'arc') {
      if (step.unobtrusive) continue;
      for (const b of arcObstacles(step.center, step.radius, step.startAngle, step.endAngle)) {
        occupied.push({ ...b, owner: null, arcCenter: step.center, arcRadius: step.radius, arcStart: step.startAngle, arcEnd: step.endAngle });
      }
    } else if (step.kind === 'circle') {
      for (const b of arcObstacles(step.center, step.radius, -Math.PI, Math.PI)) occupied.push({ ...b, owner: null });
    } else if (step.kind === 'dim') {
      // The offset dimension line, not the raw a-b segment — matches dimLabelCenter()'s oa/ob.
      const len = Math.hypot(step.b.x - step.a.x, step.b.y - step.a.y) || 1;
      const px = -(step.b.y - step.a.y) / len;
      const py = (step.b.x - step.a.x) / len;
      const off = step.offset ?? 10;
      const oa = { x: step.a.x + px * off, y: step.a.y + py * off };
      const ob = { x: step.b.x + px * off, y: step.b.y + py * off };
      for (const b of segmentObstacles(oa, ob)) occupied.push({ ...b, owner: step });
    } else if (step.kind === 'angledim') {
      const a0 = Math.atan2(step.rayA.y - step.center.y, step.rayA.x - step.center.x);
      let diff = Math.atan2(step.rayB.y - step.center.y, step.rayB.x - step.center.x) - a0;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const radius = (step.radius ?? ANGLEDIM_ARC_RADIUS) * chromeScale;
      for (const b of arcObstacles(step.center, radius, a0, a0 + diff)) occupied.push({ ...b, owner: step });
    }
  }
  return occupied;
}

/** Greedy label-collision pass, run ONCE over a whole steps list before either static or
 *  animated rendering — so a label's position is decided up front and never jumps mid-
 *  animation. Covers every label-bearing step kind — 'point', 'dim', 'angledim' — against a
 *  SHARED obstacle set: the construction's own drawn ink (geometryObstacles(), above) plus
 *  every OTHER label already placed earlier in the same pass, walked in original step order.
 *  Previously only 'point' labels ran through this at all, searched against marker dots only;
 *  'dim'/'angledim' labels had one fixed, collision-blind position each (Phase A audit,
 *  ADR-145 — the reported "angle labels overlap/illegible" defect).
 *
 *  Exported (not just internal to renderStatic()/playSteps()) so main.js can pre-resolve
 *  label positions ONCE over a construction's FULL move/result array before Step Through
 *  reveals it slide-by-slide — a slice-local resolve inside a single slide's own playSteps()
 *  call can only see that slide's own points, so a later slide's label could otherwise land on
 *  top of an earlier, already-drawn one. Calling this twice (once globally by main.js, once
 *  again internally per playSteps()/renderStatic() call below) is safe and idempotent: a
 *  globally collision-free choice is always still collision-free against any subset, and both
 *  candidateOffsets() and pushCandidates() try the step's OWN already-resolved dx/dy/labelPush
 *  first, so the second pass just re-confirms it. */
export function assignLabelPositions(steps, chromeScale = 1) {
  const occupied = geometryObstacles(steps, chromeScale);
  const annoFont = ANNO_FONT * chromeScale; // must match buildStepNode()'s dim/angledim font exactly
  const resolved = [];
  for (const step of steps) {
    if (step.kind === 'point' && step.label) {
      const candidates = candidateOffsets(step.dx, step.dy);
      const relevant = occupied.filter((o) => {
        if (o.owner === step) return false; // exclude this point's OWN dot
        // Exclude the arc/line ink that PLACED this point too, same reasoning (Phase D audit,
        // ADR-153 addendum) — a compass-constructed point sits exactly on the ink that found
        // it, so grazing that ink isn't a real collision. Geometric, not identity-based, so it
        // covers every arc-then-point call site (ladder, vertex letters, division numbers,
        // pentagon's apex) without threading an owner reference through each one.
        if (o.arcCenter && onOwnArc(step.p, o.arcCenter, o.arcRadius, o.arcStart, o.arcEnd)) return false;
        if (o.lineA && onOwnSegment(step.p, o.lineA, o.lineB)) return false;
        return true;
      });
      let chosen = candidates[0];
      for (const c of candidates) {
        if (!relevant.some((b) => boxesOverlap(labelBox(step, c.dx, c.dy, chromeScale), b))) { chosen = c; break; }
      }
      occupied.push({ ...labelBox(step, chosen.dx, chosen.dy, chromeScale), owner: null });
      resolved.push({ ...step, dx: chosen.dx, dy: chosen.dy });
    } else if (step.kind === 'dim') {
      const candidates = pushCandidates(step.labelPush);
      let chosen = candidates[0];
      for (const push of candidates) {
        const c = dimLabelCenter(step, push);
        if (!occupied.some((b) => boxesOverlap(annoLabelBox(c.x, c.y, step.text.length, annoFont), b))) { chosen = push; break; }
      }
      occupied.push(annoLabelBox(dimLabelCenter(step, chosen).x, dimLabelCenter(step, chosen).y, step.text.length, annoFont));
      resolved.push({ ...step, labelPush: chosen });
    } else if (step.kind === 'angledim') {
      const candidates = angledimCandidates(step);
      let chosen = candidates[0];
      for (const c of candidates) {
        const p = angledimLabelCenter(step, c.push, c.shiftDeg, chromeScale);
        if (!occupied.some((b) => boxesOverlap(annoLabelBox(p.x, p.y, step.text.length, annoFont), b))) { chosen = c; break; }
      }
      const p = angledimLabelCenter(step, chosen.push, chosen.shiftDeg, chromeScale);
      occupied.push(annoLabelBox(p.x, p.y, step.text.length, annoFont));
      resolved.push({ ...step, labelPush: chosen.push, labelShiftDeg: chosen.shiftDeg });
    } else {
      resolved.push(step);
    }
  }
  return resolved;
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
      // +18: worst case a collision-avoidance labelPush (assignLabelPositions(), below) can
      // push the label to — keep in sync with constructions.js's own rawBounds(), which this
      // same construction's steps were already fitted/centred against.
      const reach = (step.offset ?? 10) + 18;
      upd(step.a.x + px * reach, step.a.y + py * reach);
      upd(step.b.x + px * reach, step.b.y + py * reach);
    } else if (step.kind === 'angledim') {
      const reach = (step.radius ?? 10) + 18; // see the dim branch's comment above
      upd(step.center.x - reach, step.center.y - reach);
      upd(step.center.x + reach, step.center.y + reach);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Every step's ink paints into `group`'s first sub-`<g>`, every label into its second — so
 *  a label is NEVER painted over by a later step's line/arc/circle, platform-wide, regardless
 *  of draw order (Phase A audit's "illegible" defect, ADR-145). Idempotent within one
 *  clear()...redraw cycle: renderStatic() (the "before" slice) and playSteps() (the active
 *  slide) can both draw into the SAME `group` back-to-back without an intervening clear() —
 *  see main.js's revealSlide() — so this REUSES an existing pair rather than creating a
 *  fresh one each call; only clear() (which removes them along with everything else) resets
 *  it. Reuse also preserves relative order (ink always first, labels always last) without
 *  needing to re-append on every call. */
function ensureSublayers(group) {
  let ink = group.querySelector(':scope > [data-layer="ink"]');
  let labels = group.querySelector(':scope > [data-layer="labels"]');
  if (!ink) { ink = el('g', { 'data-layer': 'ink' }); group.appendChild(ink); }
  if (!labels) { labels = el('g', { 'data-layer': 'labels' }); group.appendChild(labels); }
  return { ink, labels };
}

/** Draw a list of steps immediately at full opacity — no animation. Used for the "Given"
 *  step's static display and for landing on a later wizard step without pressing Play. */
export function renderStatic(group, steps, chromeScale = 1) {
  const { ink, labels } = ensureSublayers(group);
  for (const step of assignLabelPositions(steps, chromeScale)) {
    const { node, labelNode, reveal, finalize } = buildStepNode(step, chromeScale);
    if (node) ink.appendChild(node);
    if (labelNode) labels.appendChild(labelNode);
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
 * @param {{onComplete?: () => void, chromeScale?: number}} [opts]
 */
export function playSteps(group, steps, { onComplete, chromeScale = 1 } = {}) {
  const { ink, labels } = ensureSublayers(group);
  const resolvedSteps = assignLabelPositions(steps, chromeScale);
  let cancelled = false;
  let activeTween = null;

  // PLAY_BUDGET_MS caps THIS CALL's total draw-on time, not any single step (see the const's
  // own comment above). A one-slide Step Through slice is always far under budget, so
  // timeScale lands at 1 there and per-slide pacing is untouched; a full-recipe Play All call
  // scales down uniformly so relative pacing (arc vs point) survives the compression.
  const totalMs = resolvedSteps.reduce((sum, s) => sum + durationFor(s), 0);
  const timeScale = totalMs > PLAY_BUDGET_MS ? PLAY_BUDGET_MS / totalMs : 1;

  function playAt(i) {
    if (cancelled) return;
    if (i >= resolvedSteps.length) { onComplete?.(); return; }
    const step = resolvedSteps[i];
    const { node, labelNode, reveal, finalize } = buildStepNode(step, chromeScale);
    if (node) ink.appendChild(node);
    if (labelNode) labels.appendChild(labelNode);
    activeTween = tween({
      from: 0, to: 1, duration: Math.max(MIN_STEP_MS, durationFor(step) * timeScale), ease: easeDraw,
      onUpdate: reveal,
      onComplete: () => { finalize(); playAt(i + 1); },
    });
  }
  playAt(0);

  return { cancel: () => { cancelled = true; activeTween?.cancel(); } };
}
