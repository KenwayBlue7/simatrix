// Draws a construction recipe (from constructions.js) into the shared construction
// canvas — REIMPLEMENTED against Canvas2D instead of SVG DOM (ADR-112 §1: this topic's
// whole plate — front view, top-view semicircle, development, transfer lines — is ONE
// `<canvas>`). Every other Diploma topic's renderConstruction.js creates/mutates SVG
// nodes; a canvas has no persistent scene graph, so this file instead exposes a "layer"
// as a small plain-data record ({ entries: [{step, t}] }) and a `paintLayer(ctx, layer,
// sheet)` function main.js calls every repaint — the CALLING CONVENTION main.js uses
// (clear/renderStatic/playSteps on a "layer") matches the SVG version's ("layer" there
// meant an SVG <g>; here it means this record), so constructions.js and stepper.js need
// no awareness of the substrate swap.
//
// ---- Screen-space rewrite (Phase 1, ../DECISIONS.md ADR for this rebuild) ----------
// main.js's paint() no longer bakes pan/zoom into ctx's transform — it stays DPR-only for
// the whole paint. Every helper below instead takes a `sheet` object ({ project(p)->{x,y},
// pxPerUnit, given, move, result, ink, inkSecondary, paper, fontSans, fontMono } — the
// first three are the pedagogical colour axis, resolved from their own CSS tokens;
// ink/inkSecondary are for content OUTSIDE that axis, e.g. numerals) and calls
// `sheet.project()` on every point immediately before stroking/filling it —
// the same shape Module2's `drawMethodSheet` uses (`projectSheet`/`flattenHP`/`flattenVP`,
// `Module2/main.js`). Two kinds of numbers exist here and must never be confused:
//   - REAL GEOMETRY (line endpoints, circle/arc radii) is authored in constructions.js in
//     drawing-space units and must be scaled by `sheet.pxPerUnit` to reach canvas px
//     (points via `sheet.project`, standalone magnitudes like a radius via `* pxPerUnit`).
//   - UI CHROME (stroke width, font size, point-dot radius, arrowhead size, dash lengths,
//     the ruler/compass tool overlay) is NOT geometry — it is authored below as LITERAL
//     canvas-px constants, same as Module2's `ARC_LABEL_GAP_PX`/arrow sizing. This is the
//     actual fix for the pre-rebuild bug: a `ctx.lineWidth = 1.8` under a baked-in
//     `ctx.scale()` meant 1.8 WORLD units, i.e. 1.8px only at one particular zoom: the
//     outline/fold thick/thin convention (K.C. John Ch.15 note #4) silently broke at every
//     other zoom level. Every width/font/dot size below is a plain px number now, constant
//     at any zoom, matching how Module2 draws its own sheet.
//
// Same "watch the tool make the mark" choreography as every other Diploma topic: a ruler
// bar slides along a drawn line, a compass needle+leg sweeps an arc, both vanish once the
// mark completes (t reaches 1) — computed fresh from `t` each paint rather than mutating
// persisted DOM attributes, since canvas has no persisted nodes to mutate.
//
// Draw-on reveal for straight/curved marks reuses the EXACT SVG mechanic — dash-array +
// dash-offset — since Canvas2D's `setLineDash()`/`lineDashOffset` are a direct match for
// SVG's `stroke-dasharray`/`stroke-dashoffset`; no need to hand-truncate paths. Dash length
// is now measured in PROJECTED (px) space, not drawing-space, so draw-on speed reads at a
// constant rate on screen regardless of a construction's own scale.
//
// Ink hierarchy (Phase 1 rebuild, ported from Module2's drawMethodSheet, not shared code —
// ADR-112 precedent): THREE tiers, not three saturated hues. `given` → --color-ink (primary
// problem statement), `result` → the one answer hue (green, the development pattern),
// `move` → --color-ink-secondary (auxiliary: projectors, transfer lines) — Module2 never
// gives auxiliary construction marks their own saturated colour, it drops them to gray and
// carries their MEANING in dash pattern instead (Module2/main.js:4054 vs :4078, the
// within-Set-projector [2,2] vs carried-from-previous-Set [8,4] split). Ported here as:
//   DASH_DATUM   [1]     — a reference/construction mark that is not itself a drawn edge
//                          (dimension extension lines) — Module2's angle-arc datum ray.
//   DASH_HIDDEN  [5,4]   — hidden geometry (unused by this topic's three current
//                          constructions, kept for a future truncation/cut view).
//   DASH_PROJECT [2,2]   — a projector linking two views of THE SAME region (e.g. top view
//                          corner → front view edge) — Module2's within-Set projector.
//   DASH_CARRY   [8,4]   — a transfer line carrying a true measurement into a DIFFERENT
//                          region (front view → development) — Module2's cross-Set
//                          derivation line. A step opts in via `dash: 'carry'`; every
//                          'move'-role line defaults to DASH_PROJECT otherwise.
//
// New step kinds this topic needs, beyond the shared point/line/arc/circle/curve/dim/label
// set:
//   'polyline' — a straight-segment multi-point path (sharp corners, unlike 'curve's
//     traced-locus semantics) for the development pattern's outline, which is a closed
//     rectangle for a full solid but gains a notch when truncated (Bhatt Fig. 15-8 /
//     K.C. John Fig. 15.4).
//   'numeral' — a station identifier (K.C. John/Bhatt number every corner and generator on
//     both the views and the development, e.g. Fig. 15.4/15.7/15-10) — plain text, always
//     ink (identifiers are not pedagogically coloured), knockout-backed, offset a fixed px
//     distance from its anchor point in one of four directions (`place`).
//   'note' — a leader callout (`Seam`, `Fold line`, `Inside pattern` — the labels every
//     source figure in this chapter carries, see Bhatt Fig. 15.1/15-10, K.C. John Fig.
//     15.4/15.7): a thin auxiliary-tier leader from the text anchor to the point it refers
//     to, a small dot at that point, knockout-backed text.
//   'caption' — a region caption under a block ("(i) Front view & top view" /
//     "(ii) Development of prism") — Module2's own per-Set caption treatment
//     (`Module2/main.js`'s drawMethodSheet, "Set caption" block), plain text, no knockout.
// Also: every step MAY carry an explicit `weight` (px stroke width) overriding its role's
// default — K.C. John's "outline THICK, folding THIN" rule (Ch.15 Tools note #4) is a
// stroke-weight axis independent of `role` (given/move/result already means something
// else: pedagogical significance, not line-weight), so `constructions.js` sets
// `weight: OUTLINE_W` on the pattern outline and `weight: FOLD_W` on each fold/generator
// line rather than overloading `role` to mean two different things at once.
//
// Layering (CLAUDE.md): leaf module. Imports only anim.js (tween/easing), never terms.js,
// uiManager.js, or stepper.js.

import { tween, easeDraw } from './anim.js';

// ============================================================================
// Ink tiers, weights, dashes — Module2-parity constants (see file header)
// ============================================================================

const OUTLINE_PX = 1.6;   // pattern/view outline — Module2's visible-edge weight
const FOLD_PX = 0.9;      // fold/generator line — Module2's hidden-edge weight (thin, not dashed here — K.C. John Ch.15 note #4 says THIN, not hidden)
const AUX_PX = 0.75;      // projector/transfer line default — Module2's reference-mark weight

const DASH_DATUM = [1];
const DASH_HIDDEN = [5, 4];
const DASH_PROJECT = [2, 2];
const DASH_CARRY = [8, 4];

function roleColor(role, sheet) {
  if (role === 'given') return sheet.given;
  if (role === 'move') return sheet.move;
  return sheet.result; // 'result'
}

function roleWidthDefault(role) {
  return role === 'move' ? AUX_PX : OUTLINE_PX;
}

/** A step's own `weight` (K.C. John's outline/fold axis) wins over the role default. */
function strokeWidthFor(step) {
  return step.weight ?? roleWidthDefault(step.role);
}

/** `step.dash` ('carry'|'hidden'|'datum') picks a named dash; a plain 'move'-role line
 *  with no tag defaults to DASH_PROJECT (the more common case — most auxiliary lines link
 *  two views of the same region, not a cross-region transfer). See file header. */
function dashFor(step) {
  if (step.dash === 'carry') return DASH_CARRY;
  if (step.dash === 'hidden') return DASH_HIDDEN;
  if (step.dash === 'datum') return DASH_DATUM;
  return DASH_PROJECT;
}

/** Knockout text, ported from Module2's `drawMethodLabels`/`strokeAngleArc` pattern
 *  (technique only, not the file — Module2/main.js:3781-3793). A paper-colour rect sized
 *  to the measured text sits behind it, so a label stays legible crossing a generator/fold
 *  line. Centre-aligned/middle-baseline (not Module2's left/alphabetic label variant —
 *  every one of THIS topic's knockout texts is anchored at its own visual centre, not a
 *  corner), so the rect math is exact regardless of caller. */
function drawKnockoutText(ctx, x, y, text, color, font, paper, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const half = ctx.measureText(text).width / 2 + 2;
  ctx.fillStyle = paper;
  ctx.fillRect(x - half, y - 6, half * 2, 12);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Cumulative polyline length in the SPACE the points are already in — called on already-
 *  projected (px) points so a draw-on's speed reads constant on screen at any zoom. */
function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return total;
}

// Green-tier slowdown: `role: 'result'` is the development pattern itself (roleColor()
// below, file header line 46 — "the one answer hue"), the whole reason Play exists. At the
// base durations below it flashed past too fast to actually watch the pattern unroll —
// verified live. Applied AFTER durationFor()'s override resolves (both the FAST_MS
// constructions.js gives its fold/generator lines and the 1800ms hero default), so the
// existing fast-repetitive-vs-slow-hero RATIO survives untouched, just stretched: a 180ms
// fold line reads 324ms, a 1800ms pattern outline reads 3240ms. Grey `move` steps
// (projectors, transfer lines) are untouched — they were never the pacing complaint.
const RESULT_PACE = 1.8;

/** How long a step's draw-on takes — a sweeping arc, a drawn line/polyline, or a traced
 *  curve needs enough time to actually watch it happen; a point/label/numeral/note/caption
 *  snapping into place doesn't. A dashed (hidden-line) curve segment fades in like a point,
 *  it doesn't draw on. */
function durationFor(step) {
  // Explicit per-step override (constructions.js) wins — a construction with many
  // repetitive utility lines (12+ generator projectors, a dozen fold lines) needs those
  // fast, reserving the full "watch it happen" duration for the few conceptually load-
  // bearing steps (a transfer line, the pattern outline, a cut curve). Verified live: a
  // 12-generator cylinder with every step at the flat 1800ms default took ~45+ seconds
  // to Play — the override exists specifically to fix that, not as a hypothetical.
  const base = step.duration != null ? step.duration
    : (step.kind === 'curve' && step.dashed) ? 600
    : (step.kind === 'arc' || step.kind === 'line' || step.kind === 'polyline' || step.kind === 'curve') ? 1800 : 600;
  return step.role === 'result' ? base * RESULT_PACE : base;
}

// ============================================================================
// Paint helpers — every one projects its own points via sheet.project() and draws in
// literal canvas px (see file header for the geometry-vs-chrome distinction)
// ============================================================================

const RULER_OVERHANG_PX = 6;
const RULER_HALF_H_PX = 1.6;
const RULER_STROKE_PX = 0.5;

function paintLine(ctx, step, t, sheet) {
  const { role } = step;
  const pa = sheet.project(step.a);
  const pb = sheet.project(step.b);
  const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1e-6;
  const dashed = role === 'move';
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);

  if (t < 1) {
    // The straightedge: a translucent ruler bar laid along the line while it draws,
    // extending slightly past both ends the way a real ruler would. Uses globalAlpha for
    // the translucent fill rather than a `color-mix()` fillStyle string — canvas's CSS
    // colour parser does not reliably accept CSS Color 4 syntax the way SVG presentation
    // attributes do, and a rejected fillStyle silently keeps whatever colour was set
    // before it (verified live: it rendered as an opaque bar, not a light tint). Fixed
    // px overhang/height now — this is UI chrome, not geometry (see file header).
    ctx.save();
    ctx.translate(pa.x, pa.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-RULER_OVERHANG_PX, -RULER_HALF_H_PX, len + RULER_OVERHANG_PX * 2, RULER_HALF_H_PX * 2);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = sheet.inkSecondary;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = sheet.inkSecondary;
    ctx.lineWidth = RULER_STROKE_PX;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, sheet);
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  if (dashed) {
    ctx.globalAlpha = t;
    ctx.setLineDash(dashFor(step));
  } else {
    ctx.setLineDash([len]);
    ctx.lineDashOffset = len * (1 - t);
  }
  ctx.stroke();
  ctx.restore();
}

function paintPolyline(ctx, step, t, sheet) {
  const { points, role, closed } = step;
  if (points.length < 2) return;
  const path = (closed ? [...points, points[0]] : points).map(sheet.project);
  const len = Math.max(polylineLength(path), 1e-6);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'miter'; // sharp corners — a pattern outline is straight-edged, not traced
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, sheet);
  ctx.setLineDash([len]);
  ctx.lineDashOffset = len * (1 - t);
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.restore();
}

const COMPASS_PIVOT_PX = 1.6;
const COMPASS_TIP_PX = 1.8;
const COMPASS_LEG_PX = 0.7;

function paintArc(ctx, step, t, sheet) {
  const { radius, startAngle, endAngle, role } = step;
  const center = sheet.project(step.center);
  const radiusPx = radius * sheet.pxPerUnit;
  const cur = startAngle + t * (endAngle - startAngle);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, sheet);
  if (role === 'move') ctx.setLineDash(dashFor(step));
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, startAngle, cur, endAngle < startAngle);
  ctx.stroke();
  ctx.restore();

  if (t < 1) {
    // The compass: a needle dot pinned at the centre and a pencil leg sweeping to the
    // current angle, tracing the same arc the ink mark follows. Fixed px sizing (chrome).
    const tipX = center.x + radiusPx * Math.cos(cur);
    const tipY = center.y + radiusPx * Math.sin(cur);
    ctx.save();
    ctx.fillStyle = sheet.inkSecondary;
    ctx.strokeStyle = sheet.inkSecondary;
    ctx.lineWidth = COMPASS_LEG_PX;
    ctx.beginPath(); ctx.arc(center.x, center.y, COMPASS_PIVOT_PX, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(center.x, center.y); ctx.lineTo(tipX, tipY); ctx.stroke();
    ctx.beginPath(); ctx.arc(tipX, tipY, COMPASS_TIP_PX, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

function paintCircle(ctx, step, t, sheet) {
  const { radius, role } = step;
  const center = sheet.project(step.center);
  const radiusPx = radius * sheet.pxPerUnit;
  ctx.save();
  ctx.globalAlpha = t;
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, sheet);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function paintCurve(ctx, step, t, sheet) {
  const { points, role, dashed } = step;
  if (points.length === 0) return;
  const path = points.map(sheet.project);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = strokeWidthFor(step);
  ctx.strokeStyle = roleColor(role, sheet);
  if (dashed) {
    // Hidden-line convention: a static dash pattern that fades in, not a progressive
    // draw-on — see this topic's DESIGN.md §3.
    ctx.globalAlpha = t;
    ctx.setLineDash(DASH_HIDDEN);
  } else {
    const len = Math.max(polylineLength(path), 1e-6);
    ctx.setLineDash([len]);
    ctx.lineDashOffset = len * (1 - t);
  }
  ctx.beginPath();
  ctx.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
  ctx.stroke();
  ctx.restore();
}

const POINT_R_RESULT = 1.8;
const POINT_R_OTHER = 1.2;
const POINT_LABEL_DX = 7;
const POINT_LABEL_DY = -7;
const LABEL_PX = 11; // sans — matches Module2's own labelFont size

function paintPoint(ctx, step, t, sheet) {
  const p = sheet.project(step.p);
  const r = step.role === 'result' ? POINT_R_RESULT : POINT_R_OTHER;
  ctx.save();
  ctx.globalAlpha = t;
  ctx.fillStyle = step.role === 'move' ? sheet.paper : roleColor(step.role, sheet);
  ctx.strokeStyle = roleColor(step.role, sheet);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  if (step.label) {
    drawKnockoutText(
      ctx, p.x + POINT_LABEL_DX, p.y + POINT_LABEL_DY, step.label,
      roleColor(step.role, sheet), `700 ${LABEL_PX}px ${sheet.fontSans}`, sheet.paper, t,
    );
  }
}

const DIM_PX = 11; // mono — matches Module2's own dimFont size (ADR-102 parity)
const DIM_ARROW_LEN_PX = 4;
// Half-width solved from Dimensions.pdf pg35 pt.2's stated ~15° included angle, not eyeballed:
// half = LEN·tan(7.5°) = 4·0.13165 = 0.527 → 0.53 (gives 2·atan(0.53/4) ≈ 15.10°, in spec).
const DIM_ARROW_HALF_PX = 0.53;
// mm-space (pre-projection), not px — Dimensions.pdf pg36 rule 2 caps overshoot at 1-2mm;
// a fixed post-projection px value drifted 2.0-3.6mm depending on solid's own fixed SCALE
// (PRISM_SCALE/CYL_SCALE/ELBOW_SCALE differ). Applying in mm before sheet.project() makes
// the overshoot exactly 1.5mm on every solid regardless of scale (ADR-116 audit finding).
const DIM_EXT_OVERSHOOT_MM = 1.5;
const DIM_TEXT_NUDGE_PX = 5;

function paintDim(ctx, step, t, sheet) {
  const { a, b, text, role } = step;
  const color = roleColor(role, sheet);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return;
  // Offset geometry stays in DRAWING-space units (unchanged from before the rewrite) —
  // constructions.js's tuned per-dim offsets (-12/14/16/…) are drawing-space magnitudes,
  // exactly like a real dimension line's stand-off is a fixed real distance from the
  // object; only the FINAL draw call below projects the resulting points to px.
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const perpx = -uy, perpy = ux; // perpendicular unit vector; step.offset's sign picks the side
  const off = step.offset ?? 10;
  const oa = { x: a.x + perpx * off, y: a.y + perpy * off };
  const ob = { x: b.x + perpx * off, y: b.y + perpy * off };

  // Overshoot past the dim line, same mm-space perpendicular direction as off (continuing
  // outward, past oa/ob) — see DIM_EXT_OVERSHOOT_MM comment above.
  const oshMM = DIM_EXT_OVERSHOOT_MM * Math.sign(off || 1);
  const oaExt = { x: oa.x + perpx * oshMM, y: oa.y + perpy * oshMM };
  const obExt = { x: ob.x + perpx * oshMM, y: ob.y + perpy * oshMM };

  // Extension lines normally run from a/b themselves. Some dims (the prism's stretch-out)
  // define a/b to keep the dim LINE clean and axis-aligned (both ends at the same level,
  // e.g. z=-Wd) while the feature they measure doesn't touch that level at BOTH ends — only
  // the base cap's bottom edge sits at z=-Wd; the pattern body's own bottom edge is z=0. For
  // those, constructions.js passes step.extA/extB — the true drawn corners each tick should
  // terminate at — and only the tick length (not the dim line's placement) changes.
  const extA = step.extA ?? a;
  const extB = step.extB ?? b;

  const pa = sheet.project(extA);
  const pb = sheet.project(extB);
  const poa = sheet.project(oa);
  const pob = sheet.project(ob);
  const poaExt = sheet.project(oaExt);
  const pobExt = sheet.project(obExt);
  const pdx = pob.x - poa.x, pdy = pob.y - poa.y;
  const plen = Math.hypot(pdx, pdy) || 1e-6;
  const pux = pdx / plen, puy = pdy / plen;
  const pperpx = -puy, pperpy = pux; // same-sign perpendicular in PX space (uniform transform preserves rotation)

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  // Extension lines — a reference/construction mark, not a drawn edge: DASH_DATUM (see
  // file header's dash vocabulary table).
  ctx.globalAlpha = t * 0.65;
  ctx.lineWidth = 0.5;
  ctx.setLineDash(DASH_DATUM);
  ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(poaExt.x, poaExt.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pb.x, pb.y); ctx.lineTo(pobExt.x, pobExt.y); ctx.stroke();
  ctx.setLineDash([]);

  // Dimension line — solid.
  ctx.globalAlpha = t;
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(poa.x, poa.y); ctx.lineTo(pob.x, pob.y); ctx.stroke();

  const drawArrow = (tip, dirx, diry) => {
    const backx = tip.x - dirx * DIM_ARROW_LEN_PX;
    const backy = tip.y - diry * DIM_ARROW_LEN_PX;
    const wx = -diry * DIM_ARROW_HALF_PX;
    const wy = dirx * DIM_ARROW_HALF_PX;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(backx + wx, backy + wy);
    ctx.lineTo(backx - wx, backy - wy);
    ctx.closePath();
    ctx.fill();
  };
  drawArrow(poa, -pux, -puy);
  drawArrow(pob, pux, puy);

  const pmid = { x: (poa.x + pob.x) / 2 + pperpx * DIM_TEXT_NUDGE_PX, y: (poa.y + pob.y) / 2 + pperpy * DIM_TEXT_NUDGE_PX };
  ctx.restore();
  drawKnockoutText(ctx, pmid.x, pmid.y, text, color, `${DIM_PX}px ${sheet.fontMono}`, sheet.paper, t);
}

function paintLabel(ctx, step, t, sheet) {
  // step.dx/dy stay drawing-space offsets applied BEFORE projecting (unchanged authoring
  // convention — constructions.js's existing LABEL() calls already tune these against a
  // construction's own scale, e.g. a caption nudged clear of the development's own bbox).
  const p = sheet.project({ x: step.p.x + (step.dx ?? 4), y: step.p.y + (step.dy ?? -4) });
  drawKnockoutText(ctx, p.x, p.y, step.text, sheet.inkSecondary, `${LABEL_PX}px ${sheet.fontSans}`, sheet.paper, t);
}

const NUMERAL_PX = 9; // mono — station identifiers; smaller than LABEL_PX, dense on the development
const NUMERAL_OFFSET_PX = 7;

/** Station numeral (K.C. John/Bhatt number every corner/generator on both the views and
 *  the development — Fig. 15.4/15.7/15-10). Always ink — identifiers are not part of the
 *  given/move/result pedagogical colour axis. `place` ('above'|'below'|'left'|'right')
 *  picks a fixed-px offset direction so a caller doesn't need per-numeral pixel math. */
function paintNumeral(ctx, step, t, sheet) {
  const p = sheet.project(step.p);
  let dx = 0, dy = 0;
  if (step.place === 'above') dy = -NUMERAL_OFFSET_PX;
  else if (step.place === 'below') dy = NUMERAL_OFFSET_PX;
  else if (step.place === 'left') dx = -NUMERAL_OFFSET_PX;
  else if (step.place === 'right') dx = NUMERAL_OFFSET_PX;
  drawKnockoutText(ctx, p.x + dx, p.y + dy, step.text, sheet.ink, `${NUMERAL_PX}px ${sheet.fontMono}`, sheet.paper, t);
}

const NOTE_PX = 10; // sans — leader-callout text (Seam / Fold line / Inside pattern); bumped
                     // from 9 (label-polish pass) — "Fold line"/"Inside pattern" were reading
                     // cramped at the old size once they got the spacing fix below.
const NOTE_DOT_PX = 1.3;

/** Leader callout — a thin auxiliary-tier leader from the text anchor (`p`) to the point
 *  it names (`to`), a small terminating dot at `to`, knockout text at `p`. Always the
 *  auxiliary tier (gray) — these name scaffolding (the seam, a fold line), not the answer. */
function paintNote(ctx, step, t, sheet) {
  const p = sheet.project(step.p);
  const to = sheet.project(step.to);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.strokeStyle = sheet.inkSecondary;
  ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(to.x, to.y); ctx.stroke();
  ctx.fillStyle = sheet.inkSecondary;
  ctx.beginPath(); ctx.arc(to.x, to.y, NOTE_DOT_PX, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawKnockoutText(ctx, p.x, p.y, step.text, sheet.inkSecondary, `${NOTE_PX}px ${sheet.fontSans}`, sheet.paper, t);
}

const CAPTION_PX = 12; // sans — matches Module2's own captionFont size

/** Region caption under a block ("(i) Front view & top view") — Module2's per-Set caption
 *  treatment (`drawMethodSheet`'s "Set caption" block): plain text, NOT knockout-backed
 *  (it never sits over crossing geometry, it lives in the plate's own reserved margin —
 *  see constructions.js `planPlate`'s reserve bands), auxiliary tier, centred. */
function paintCaption(ctx, step, t, sheet) {
  const p = sheet.project(step.p);
  ctx.save();
  ctx.globalAlpha = t;
  ctx.font = `${CAPTION_PX}px ${sheet.fontSans}`;
  ctx.fillStyle = sheet.inkSecondary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(step.text, p.x, p.y);
  ctx.restore();
}

function paintStep(ctx, step, t, sheet) {
  if (t <= 0) return;
  switch (step.kind) {
    case 'line': return paintLine(ctx, step, t, sheet);
    case 'polyline': return paintPolyline(ctx, step, t, sheet);
    case 'arc': return paintArc(ctx, step, t, sheet);
    case 'circle': return paintCircle(ctx, step, t, sheet);
    case 'curve': return paintCurve(ctx, step, t, sheet);
    case 'point': return paintPoint(ctx, step, t, sheet);
    case 'dim': return paintDim(ctx, step, t, sheet);
    case 'numeral': return paintNumeral(ctx, step, t, sheet);
    case 'note': return paintNote(ctx, step, t, sheet);
    case 'caption': return paintCaption(ctx, step, t, sheet);
    default: return paintLabel(ctx, step, t, sheet); // 'label' kind — text only
  }
}

// ============================================================================
// Public contract — same shape as every other Diploma topic's renderConstruction.js,
// with "SVG group" replaced by "layer record" (ADR-112 §1). `paintLayer`'s third
// argument (`sheet`, formerly `palette`) is topic-local, not part of this contract — see
// file header for its shape.
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
 *  the whole construction the animation is about to draw. Pure geometry, drawing-space
 *  units throughout — unaffected by the screen-space paint rewrite (viewTransform.js
 *  still consumes drawing units, only the CANVAS DRAW CALLS moved to px). */
export function computeBounds(steps) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const upd = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const step of steps) {
    if (step.kind === 'point' || step.kind === 'numeral') {
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
    } else if (step.kind === 'note') {
      upd(step.p.x, step.p.y);
      upd(step.to.x, step.to.y);
    } else if (step.kind === 'caption') {
      upd(step.p.x, step.p.y);
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
 *  cleared/filled the canvas this frame and built `sheet` fresh (CSS tokens resolved,
 *  `project`/`pxPerUnit` current — see file header). Drawing order is entry order —
 *  main.js/constructions.js should emit steps back-to-front the same way the SVG version
 *  relied on DOM append order for z-order. */
export function paintLayer(ctx, layer, sheet) {
  for (const { step, t } of layer.entries) paintStep(ctx, step, t, sheet);
}
