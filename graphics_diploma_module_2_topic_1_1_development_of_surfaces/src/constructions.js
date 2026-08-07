// Pure geometry for the three Development-of-Surfaces constructions (rectangular prism,
// cylinder, two-piece 90° elbow — ADR-112's stated scope). NO DOM here — every function
// returns plain step data (points, lines, polylines, dims). renderConstruction.js is the
// only file that turns this into canvas paint calls.
//
// Layering (CLAUDE.md): leaf module. Imports developmentEngine.js/genericSolid.js's pure
// math only where noted; never renderConstruction.js, uiManager.js, or stepper.js.
//
// Single-plate convention (ADR-112 §1): every construction draws a FRONT VIEW, a TOP VIEW
// (or auxiliary circle), and the DEVELOPMENT on one shared canvas, with horizontal
// transfer lines carrying true heights from the front view straight across into the
// development — exactly how Bhatt Fig. 15-8/15-10 and K.C. John Fig. 15.4/15.7/15.12 draw
// it. `planPlate()` below is the one function that lays all three regions out with the
// shared axes this requires: front view + top view share one x-origin/scale (vertical
// projectors are genuinely vertical); front view + development share one y-origin/scale
// (transfer lines are genuinely horizontal).
//
// K.C. John Ch.15 "Tools to solve development problems" note #4: outline THICK, folding
// THIN. This is a stroke-WEIGHT axis, independent of a step's `role` (given/move/result
// already means something else — pedagogical significance). Every outline step below
// carries `weight: OUTLINE_W`; every fold/generator line carries `weight: FOLD_W`.
//
// Phase 1 rebuild (../DECISIONS.md ADR for this topic's Module2-parity pass) — three
// content additions on top of the same geometry, all consumed by the new step kinds
// renderConstruction.js gained the same day:
//   - `numeral` steps number every corner/generator this construction cares about, on
//     BOTH the views and the development (K.C. John Fig. 15.4/15.7, Bhatt Fig. 15-10 all
//     do this) — station identifiers reuse the SAME numbers/letters across regions
//     (the top view's own corner "1" is the same "1" that appears on the development),
//     which is the actual pedagogical thread these figures are teaching.
//   - `note` steps are the leader callouts every source figure carries (`Seam`,
//     `Fold line`, `Inside pattern` — Bhatt Fig. 15.1/15-10, K.C. John Fig. 15.4/15.7).
//   - `caption` steps are the "(i) ..." / "(ii) ..." region captions under each block.
// A `dash` tag on a 'move'-role `L(...)` line distinguishes a same-region projector
// (default, DASH_PROJECT) from a cross-region transfer/derivation line
// (`dash: 'carry'`, DASH_CARRY) — see renderConstruction.js's file header for the full
// dash vocabulary. Only `buildPrism` below has been rebuilt to this standard; the
// cylinder/elbow builders keep their pre-rebuild content shape until their own phase
// (this rebuild's own plan is solid-by-solid) — they still render correctly through the
// new renderConstruction.js (same step-kind contract), just without the numeral/note/
// caption annotation layer yet.

import { computeCutDistances } from './developmentEngine.js';

const deg2rad = (d) => (d * Math.PI) / 180;

// ----------------------------------------------------------------------------
// Step builders (same shape as every other Diploma topic's constructions.js)
// ----------------------------------------------------------------------------

const P = (p, role, label, duration) => ({ kind: 'point', role, p, label, duration });
/** `dash` ('carry'|'hidden'|'datum', optional) — see file header; only meaningful on a
 *  'move'-role line, ignored otherwise. */
const L = (a, b, role, weight, duration, dash) => ({ kind: 'line', role, a, b, weight, duration, dash });
/** Straight-segment path (sharp corners) — new this topic, see file header. */
const POLY = (points, role, closed, weight, duration) => ({ kind: 'polyline', role, points, closed, weight, duration });
const CIRC = (center, radius, role) => ({ kind: 'circle', role, center, radius });
/** extA/extB (optional): the true drawn corner each extension line/tick should terminate
 * at, when it differs from the point that defines the dim LINE's own placement/angle (a/b
 * stay the dim-line-defining pair, e.g. both at one clean level; see renderConstruction.js's
 * paintDim header comment). Defaults to a/b — the common, level-matched case. */
const dim = (a, b, text, role, offset = 10, extA, extB) => ({ kind: 'dim', role, a, b, text, offset, extA, extB });
const LABEL = (p, text, dx, dy) => ({ kind: 'label', p, text, dx, dy });
/** Station numeral — always ink (identifiers aren't part of the given/move/result colour
 *  axis); `place` ('above'|'below'|'left'|'right') picks a fixed-px offset direction. */
const NUM = (p, text, place, duration) => ({ kind: 'numeral', p, text, place, duration });
/** Leader callout ('Seam' / 'Fold line' / 'Inside pattern') — `p` is the text anchor,
 *  `to` the point being named; always the auxiliary tier. */
const NOTE = (p, to, text, duration) => ({ kind: 'note', p, to, text, duration });
/** Region caption under a block ("(i) Front view & top view"). */
const CAPTION = (p, text, duration) => ({ kind: 'caption', p, text, duration });

const OUTLINE_W = 1.6; // K.C. John Ch.15 note #4: pattern outline, THICK — Module2-parity px value (renderConstruction.js file header)
const FOLD_W = 0.9;    //   ...fold / generator lines, THIN

// A construction with a dozen generators means a dozen projector/fold lines during Play —
// at renderConstruction.js's 1800ms default "watch it happen" pace, that alone is 20+
// seconds. FAST_MS is for exactly those repetitive utility lines (verified live: a
// 12-generator cylinder at the flat default took ~45s to Play); the few conceptually
// load-bearing steps (a transfer line, the pattern outline, a cut curve) keep the default.
const FAST_MS = 180;

const CANVAS = { w: 420, h: 260 }; // matches viewTransform.js's BASE_W/BASE_H

// ----------------------------------------------------------------------------
// Shared plate layout — one scale, three aligned regions (see file header)
// ----------------------------------------------------------------------------

const MARGIN = 18;
const GAP_TOP = 18; // between front view's bottom edge and the top view/circle below it
const GAP_DEV = 30; // between front view's right edge and the development's left edge

// Reserve bands (drawing-space units, same axis the block sizes below already use) for
// annotation that lives OUTSIDE a block's own geometric bbox — the above-view width dim,
// the left-of-top-view depth dim, station numerals placed 'right' of the front view /
// development, and the bottom band's region captions + numeral row + stretch-out dim.
// Subtracted from the fit BEFORE `scale` is derived, so `scale` already accounts for them
// — constants, never a measured bbox of what's actually been drawn (ADR-053/054's
// intrinsic-only law; Module2 hit this exact bug class in ADR-102, a Set caption's own
// offset left out of its own fit, overlapping its nav pill — these bands are this topic's
// fix for the same class of bug, see ../DECISIONS.md's ADR for this rebuild).
// LEFT/RIGHT bumped from an initial 16/20 after live verification: a long dim STRING
// (e.g. the elbow's "100 mm (short leg)" at its slider max) is now a fixed-px width
// regardless of the plate's own intrinsic scale (Phase 1's actual fix — see
// renderConstruction.js's file header), so a construction with a small intrinsic scale
// (the elbow's wide-legs-but-tall-bbox front view, `planPlate`'s own comment) can no
// longer rely on its dim text shrinking to fit the way it did under the old baked-in
// ctx.scale(). Caught live: "70 mm (short leg)" clipped its leading digit at the old 16.
const RESERVE_TOP = 16;
const RESERVE_BOTTOM = 36;
const RESERVE_LEFT = 30;
const RESERVE_RIGHT = 30;

/**
 * @param {number} frontW  front view's own width (its local x-extent, in mm)
 * @param {number} frontH  front view's own height (its local y-extent, in mm)
 * @param {number} topDepth  top view/auxiliary-circle's extent below the front view (mm)
 * @param {number} devW  development's total width (its stretch-out extent, in mm)
 * @param {number} [devExtra]  extra mm the DEVELOPMENT column alone needs above AND below
 *  the front view's own [0,frontH] z-range (e.g. the prism's end-cap rectangles, hinged at
 *  z=0 and z=frontH and folding out by this same amount each way — see buildPrism()).
 *  Default 0 — every other construction's dev column is exactly frontH tall, same as
 *  before this param existed (cylinder/elbow callers below pass nothing, unaffected).
 * @param {number|null} [fixedScale]  Bug-2 fix: when given, this OVERRIDES the derived
 *  fit-to-frame scale below with a caller-supplied constant px/mm ratio — the plate then
 *  letterboxes (extraX/extraY grows) instead of re-stretching content to fill the frame, so
 *  two different mm sizes actually render at two different on-screen sizes. Default null
 *  preserves the original fit-to-frame behaviour untouched (cylinder/elbow callers below
 *  don't pass this — out of this rebuild's phased scope, see this file's header). See
 *  buildPrism()'s PRISM_SCALE for how a construction derives a safe constant to pass here.
 */
function planPlate(frontW, frontH, topDepth, devW, devExtra = 0, fixedScale = null) {
  const availW = CANVAS.w - MARGIN * 2 - GAP_DEV - RESERVE_LEFT - RESERVE_RIGHT;
  const availH = CANVAS.h - MARGIN * 2 - GAP_TOP - RESERVE_TOP - RESERVE_BOTTOM;
  const scaleX = availW / Math.max(frontW + devW, 1e-6);
  // scaleY must fit BOTH columns: the front+top-view column (frontH+topDepth, unchanged)
  // AND the dev column, which is frontH + devExtra ABOVE + devExtra BELOW when end caps are
  // present — whichever column is taller at a given scale is the real constraint. Taking
  // the max here (not just frontH+topDepth) is the actual fix for the "cap clips past the
  // canvas edge" failure mode devExtra exists to prevent.
  const scaleY = availH / Math.max(frontH + topDepth, frontH + 2 * devExtra, 1e-6);
  const scale = fixedScale != null ? Math.min(fixedScale, 4) : Math.min(scaleX, scaleY, 4);

  // Centering fix: `scale` binds to whichever axis is tighter (scaleX or scaleY) — the
  // OTHER axis then has leftover room in avail{W,H} that used to just sit unused past the
  // plate's bottom/right edge, because front.x0/y0 were pinned to a hardcoded MARGIN. Split
  // that leftover evenly onto x0/y0 instead, so the whole plate centers inside CANVAS on
  // BOTH axes. Matters most when a construction's (frontW+devW) : (frontH+topDepth) aspect
  // diverges sharply from CANVAS's own — the elbow's wide-legs-but-tall-bbox front view is
  // the worst case (was ~35% dead space on one axis before this fix).
  //
  // UNDER A FIXED SCALE, this same split becomes a position-drift bug, not centering: extra
  // now varies with the CURRENT slider values (small content = big leftover = big offset),
  // so front.x0/y0 — and everything anchored off them, including the Given step's front+top
  // view, which never even draws the dev block this leftover is nominally shared with — visibly
  // shifts as sliders move, even though nothing about "centered" should depend on which slider
  // moved. Root-caused 2026-08-06 (see DECISIONS.md ADR-114's followup): NOT the same
  // leftover-redistribution math correctly doing its job — the combined-plate split was never
  // designed for a regime where extra stops being ≈0. Fixed by skipping the split entirely
  // when `fixedScale` is set (extra pinned to 0) — x0/y0 become the plate's fixed top-left
  // corner, identical at every slider value; only the drawn shapes' own size changes, matching
  // a real drafting sheet anchored to its corner rather than auto-centered. Fit-to-frame
  // constructions (cylinder/elbow, fixedScale null) are UNCHANGED — extra is still computed and
  // still ≈0 there by construction (scale flexes to fill the frame), so this branch is a no-op
  // for them; the elbow's own centering fix above still applies.
  const extraX = fixedScale != null ? 0 : Math.max(availW - (frontW + devW) * scale, 0);
  const extraY = fixedScale != null ? 0 : Math.max(availH - (frontH + topDepth) * scale, 0);
  const x0 = MARGIN + RESERVE_LEFT + extraX / 2;
  // + devExtra*scale: unconditional headroom above front.y0 for a dev-column end cap
  // folding UP past z=frontH (see devExtra jsdoc above). devExtra=0 everywhere except the
  // prism makes this a no-op for cylinder/elbow. For the drift fix above to hold (y0 constant
  // across sliders), a fixed-scale caller must pass a CONSTANT devExtra here too — buildPrism()
  // below passes its own base-width slider's MAX, not the live value, for exactly this reason
  // (see PRISM_CAP_RESERVE_MM). Worked through by hand for that worst case (scaleY the binding
  // axis, so extraY=0 regardless): the top cap's outer edge lands exactly on RESERVE_TOP, and —
  // because topDepth's own worst case and devExtra are the SAME value there (both derive from
  // the prism's base-width slider's max) — the front+top-view column's bottom edge AND the base
  // cap's bottom edge both land exactly on the canvas's bottom margin too, at that one worst
  // case; every smaller slider combination just gets more (never less) headroom above front.y0
  // than it strictly needs, which is the deliberate trade this fix makes for a stable origin.
  const y0 = MARGIN + RESERVE_TOP + extraY / 2 + devExtra * scale;

  const front = { x0, y0, w: frontW * scale, h: frontH * scale };
  const top = { x0: front.x0, y0: front.y0 + front.h + GAP_TOP, w: frontW * scale, h: topDepth * scale };
  const dev = { x0: front.x0 + front.w + GAP_DEV, y0: front.y0, w: devW * scale, h: frontH * scale };

  return {
    scale, front, top, dev,
    /** Front view: x measured from the front view's own local left edge (0..frontW), z
     *  from its own local BASE (0..frontH, base/z=0 at the bottom). */
    toFront: (x, z) => ({ x: front.x0 + x * scale, y: front.y0 + (frontH - z) * scale }),
    /** Top view / auxiliary circle: shares the front view's x-axis exactly (vertical
     *  projectors are literally vertical); y is plan depth, growing DOWN the page from
     *  the fold line (first-angle: the edge nearest the front view sits at the top of
     *  this band, RULES.md §4's first-angle citation). */
    toTop: (x, y) => ({ x: top.x0 + x * scale, y: top.y0 + y * scale }),
    /** Development: x is the unrolled stretch-out distance (an independent axis — a
     *  different physical measurement from the front view's own width); z shares the
     *  FRONT VIEW's own z-mapping exactly, so a transfer line at a given height is a
     *  genuinely horizontal line (K.C. John Ch.15 note #1: every development line must be
     *  a TRUE length). */
    toDev: (x, z) => ({ x: dev.x0 + x * scale, y: front.y0 + (frontH - z) * scale }),
  };
}

// ============================================================================
// 1. Rectangular prism — K.C. John Example 15.1 / Bhatt Problem 15-1 (Fig. 15.4/15-3)
// ============================================================================

// Bug-2 fix: a FIXED px/mm ratio, not planPlate()'s default fit-to-frame — a true-to-scale
// engineering drawing must render a 16mm and a 32mm base width at genuinely different
// on-screen widths, not auto-stretch both to fill the same frame. Derived ONCE from this
// construction's own worst case (every slider at its max simultaneously — the `given` ranges
// on CONSTRUCTIONS[0] below: baseLength≤40, baseWidth≤32, height≤60), through the SAME two
// fit-budget ratios planPlate() itself computes, so it's provably small enough to fit at
// EVERY reachable slider combination, not just the default:
//   scaleX_worst = availW / (Lf_max + devW_max)      = 294 / (40 + 2×(40+32))  = 294/184 ≈ 1.598
//   scaleY_worst = availH / (H_max + 2×Wd_max)        = 154 / (60 + 2×32)      = 154/124 ≈ 1.242
// (availW/availH from this file's own MARGIN/GAP_*/RESERVE_* constants; the 2×Wd_max term is
// the end-cap devExtra budget added above — recompute this if those constants, this
// construction's `given` ranges, or the end-cap scope ever change.) Floored to 2dp, smaller
// of the two, for headroom.
const PRISM_SCALE = 1.24;

// Position-drift fix (DECISIONS.md ADR-114 followup): planPlate()'s devExtra*scale headroom
// must be a CONSTANT for the plate's origin to stay put across slider changes (see planPlate()'s
// own y0 comment) — this is that constant, the SAME baseWidth_max=32 PRISM_SCALE was already
// derived from above, so it's provably enough room for the end cap at every reachable baseWidth,
// not just the current one. NOT the live `Wd` (that was the bug: reserving exactly-live headroom
// made front.y0 itself a function of the baseWidth slider, shifting the Given step's front+top
// view — which doesn't even draw the cap yet — every time baseWidth moved).
const PRISM_CAP_RESERVE_MM = 32;

function buildPrism(params) {
  const Lf = params.baseLength ?? 30; // the base edge parallel to VP (shown true in front view)
  const Wd = params.baseWidth ?? 24;  // the base edge running back (plan depth)
  const H = params.height ?? 40;
  // Going around the base, rear → right → front → left → (seam): edges alternate Lf/Wd.
  // ("rear" = toTop's y=0, nearest the fold line/VP in this first-angle layout — stations 1→2;
  // "front" = y=Wd, nearest the observer — stations 3→4. See DECISIONS.md ADR-112's 2026-08-06
  // addendum: a prior version of this comment had front/back backwards.)
  const edges = [Lf, Wd, Lf, Wd];
  const stretchOut = edges.reduce((a, b) => a + b, 0);

  // devExtra=PRISM_CAP_RESERVE_MM (NOT the live Wd — see that constant's own comment: a fixed-
  // scale plate needs a CONSTANT reserve for its origin to stay stable across slider changes).
  // fixedScale=PRISM_SCALE: Bug-2 fix, see that constant's own comment above.
  const plate = planPlate(Lf, H, Wd, stretchOut, PRISM_CAP_RESERVE_MM, PRISM_SCALE);
  const { toFront, toTop, toDev, front, top, dev } = plate;

  // Front/top outlines are the STATED problem (visible immediately, before Play) —
  // role 'given', matching topOutline; only the development is the constructed 'result'.
  const frontOutline = POLY(
    [toFront(0, 0), toFront(Lf, 0), toFront(Lf, H), toFront(0, H)],
    'given', true, OUTLINE_W,
  );
  const topOutline = POLY(
    [toTop(0, 0), toTop(Lf, 0), toTop(Lf, Wd), toTop(0, Wd)],
    'given', true, OUTLINE_W,
  );
  // Vertical projectors — first-angle fold-line convention (RULES §4), auxiliary tier
  // (Module2 parity: a projector is scaffolding, not stated geometry, so it is NOT
  // 'given'). The top view's own y-axis (depth) is invisible to the front view, so each
  // projector runs the FULL depth of its x-column, touching every corner that shares that
  // x — front view's left edge (x=0) legitimately projects to BOTH corner 1 (y=0, nearest
  // the fold line) and corner 4 (y=Wd, the far corner), which is why this is one line to
  // the FAR corner rather than two — same principle for the right edge (x=Lf) to corners
  // 2/3. Only 2 lines needed: front view has only 2 distinct verticals (depth collapses
  // there), matching topOutline's own 4 distinct corners exactly.
  const projectorLeft = L(toFront(0, 0), toTop(0, Wd), 'move');
  const projectorRight = L(toFront(Lf, 0), toTop(Lf, Wd), 'move');

  let x = 0;
  const foldXs = [];
  for (let i = 0; i < edges.length - 1; i++) { x += edges[i]; foldXs.push(x); }
  // Outline: NOT a plain stretch-out rectangle — K.C. John Fig. 15.4 (Example 15.1, this
  // construction's own cited source) hinges the base rectangle and the top rectangle onto
  // the FIRST panel (the Lf-wide wall nearest the seam, x:0→Lf) of the lateral strip, one
  // folding down from z=0, one folding up from z=H, turning the cut-out pattern into a
  // cross offset toward the seam end — not a strip, not a centred plus. Traced as ONE
  // closed outer boundary (10 vertices) starting at the base cap's outer corner, walking
  // the base cap → the strip's own bottom-right/right/top-right → the top cap → back down
  // the strip's genuinely-outer left wall (x=0, the seam, full height — the ONE strip edge
  // this shape keeps) → the base cap's left edge, closing the loop. The two segments this
  // routing SKIPS (x:0→Lf at z=0 and at z=H) are exactly where the caps hinge — drawn below
  // as fold lines (thin), not outline (thick), matching K.C. John Ch.15 note #4.
  const devOutline = POLY(
    [
      toDev(0, -Wd), toDev(Lf, -Wd), toDev(Lf, 0),
      toDev(stretchOut, 0), toDev(stretchOut, H), toDev(Lf, H),
      toDev(Lf, H + Wd), toDev(0, H + Wd), toDev(0, H), toDev(0, 0),
    ],
    'result', true, OUTLINE_W,
  );
  const foldLines = [
    ...foldXs.map((fx) => L(toDev(fx, 0), toDev(fx, H), 'result', FOLD_W, FAST_MS)),
    // Cap hinges — the two segments devOutline's own path deliberately skips (see above).
    L(toDev(0, 0), toDev(Lf, 0), 'result', FOLD_W, FAST_MS),
    L(toDev(0, H), toDev(Lf, H), 'result', FOLD_W, FAST_MS),
  ];
  // A plain (uncut) prism's every vertical edge is already a TRUE length (K.C. John
  // Ch.15 note #1) — only the base line (z=0) and top line (z=H) ever need transferring.
  // Cross-region (front view → development): DASH_CARRY, not the projectors' DASH_PROJECT
  // (see renderConstruction.js's file header dash vocabulary).
  const transferBase = L(toFront(0, 0), toDev(stretchOut, 0), 'move', undefined, undefined, 'carry');
  const transferTop = L(toFront(0, H), toDev(stretchOut, H), 'move', undefined, undefined, 'carry');

  // ---- Station numerals — K.C. John Fig. 15.4 numbers every corner of the top view AND
  // both edges of the development (top row AND bottom row), reusing the SAME four numbers
  // across both regions: this is the actual thread the figure is teaching ("this fold line
  // is where corner 2 lands"), not decoration. The front view's own 4 drawn corners are
  // each a COINCIDENCE of two real corners (depth collapses there — corners 1&4 share the
  // front view's left edge, 2&3 its right) — labelling that ambiguity correctly needs a
  // second, disambiguating view convention this topic doesn't otherwise use, so front-view
  // corner numerals are scoped OUT here (see this file's own header note); the two
  // projectors above already carry that correspondence visually. ----
  const topNumerals = [
    NUM(toTop(0, 0), '1', 'left'),
    NUM(toTop(Lf, 0), '2', 'right'),
    NUM(toTop(Lf, Wd), '3', 'right'),
    NUM(toTop(0, Wd), '4', 'left'),
  ];
  const stationXs = [0, Lf, Lf + Wd, Lf + Wd + Lf, stretchOut];
  const stationLabels = ['1', '2', '3', '4', '1'];
  const devNumeralsTop = stationXs.map((sx, i) => NUM(toDev(sx, H), stationLabels[i], 'above'));
  const devNumeralsBottom = stationXs.map((sx, i) => NUM(toDev(sx, 0), stationLabels[i], 'below'));
  // End-cap far corners — folding the top-view's own 1,2,3,4 rectangle up/down about the
  // 1-2 hinge (x:0→Lf) carries corner 4 (0,Wd) to directly above/below corner 1, and corner
  // 3 (Lf,Wd) to directly above/below corner 2 (Fig. 15.4 verified: same "3"/"4" reused, not
  // a new letter/number alphabet) — matching this file's own reuse-across-regions rule.
  const devNumeralsCap = [
    NUM(toDev(0, H + Wd), '4', 'above'), NUM(toDev(Lf, H + Wd), '3', 'above'),
    NUM(toDev(0, -Wd), '4', 'below'), NUM(toDev(Lf, -Wd), '3', 'below'),
  ];

  // ---- Leader callouts — every source figure in this chapter carries these three
  // (Bhatt Fig. 15.1/15-10, K.C. John Fig. 15.4/15.7). Anchors are offset a small
  // constant amount in the SAME drawing-space `planPlate` already returns everything in
  // (see renderConstruction.js's file header — this is authored geometry, not UI chrome,
  // so it lives in drawing-space like every other point in this file), landing inside the
  // reserve bands `planPlate` set aside for exactly this kind of annotation. ----
  const seamNote = NOTE({ x: top.x0 - 12, y: top.y0 - 10 }, toTop(0, 0), 'Seam');
  // Label-polish pass: foldNote/insideNote used to anchor only ~9 drawing-units apart (their
  // offsets pulled them toward the SAME panel-2 corner from opposite directions) — at this
  // plate's own scale that's less than one text-box width, so the two knockout boxes
  // overlapped. Re-anchored to genuinely different real estate instead of nudging the old
  // offsets: fold line's callout stays on the SAME fold line (x=Lf) but higher up it (0.7H,
  // was 0.5H); inside-pattern's callout moves off panel 2 entirely, into panel 3's own
  // center at a low height (0.28H) — vertically stacked with ~25-unit clearance from the
  // fold note, not squeezed into the same corner.
  const foldAt = toDev(Lf, H * 0.7);
  const foldNote = NOTE({ x: foldAt.x + 14, y: foldAt.y - 8 }, foldAt, 'Fold line');
  const insideAt = toDev(Lf + Wd + Lf / 2, H * 0.28);
  const insideNote = NOTE({ x: insideAt.x - 30, y: insideAt.y - 4 }, insideAt, 'Inside pattern');

  // ---- Region captions — below each block, ROW-ALIGNED, not independently tied to each
  // block's own bottom edge. `capDev`'s old anchor (`toDev(*, 0).y + 26`, a fixed offset off
  // the strip's z=0 line) predates the end-cap addition above — the base cap now extends
  // BELOW z=0, so that anchor landed the caption INSIDE the cap's own rectangle. Even before
  // that bug, "(i)"/"(ii)" sat at two independently-computed y's (each block's own bottom +
  // its own margin) that only happened to look close, never a genuine shared row the way
  // K.C. John's own figure captions read. Fixed by taking whichever block's bottom edge is
  // actually lower on screen — front+top's own (`top.y0+top.h`) or the development pattern's,
  // now including the base cap (`toDev(*, -Wd).y`, not `toDev(*, 0).y`) — and putting BOTH
  // captions the SAME `CAPTION_GAP` below THAT one shared row.
  const CAPTION_GAP = 10;
  // Bug-3 fix: the stretch-out dim below (`DIM_OFFSET`) used to anchor at z=0 (the cap
  // hinge, mid-block) with the SAME stale pre-end-cap assumption capDev's old anchor had
  // (see the caption-row comment this block already carries) — it landed inside/overlapping
  // the base cap instead of clear below it. Anchored at devBottom now (matches the dim's
  // own new z=-Wd anchor points), and its own reach folded into captionRowY the same way
  // devBottom already is, so the caption row can never land on top of it.
  const DIM_OFFSET = 16; // stretch-out dim's stand-off below the cap's real bottom edge
  const frontTopBottom = top.y0 + top.h;
  const devBottom = toDev(stretchOut / 2, -Wd).y;
  const stretchDimBottom = devBottom + DIM_OFFSET;
  const captionRowY = Math.max(frontTopBottom, stretchDimBottom) + CAPTION_GAP;
  const capFrontTop = CAPTION({ x: front.x0 + front.w / 2, y: captionRowY }, '(i) Front view & top view');
  const devBase = toDev(stretchOut / 2, 0);
  const capDev = CAPTION({ x: devBase.x, y: captionRowY }, '(ii) Development of prism (inside pattern)');

  const steps = [
    frontOutline, topOutline, projectorLeft, projectorRight,
    // Offsets flipped positive (were -12/-12): `off`'s sign picks perp's own direction, and
    // negative here pointed INWARD (perp=(0,1) down for the width dim, perp=(-1,0) left for
    // the depth dim — "outward" needs the offset's sign to match, same law the correctly-
    // signed H-dim below (+14) and the result-role stretch-out dim (+16) already follow).
    // Was landing the dim line inside the outline instead of in the reserve band beside it.
    dim(toFront(0, 0), toFront(Lf, 0), `${Lf} mm`, 'given', 12),
    dim(toFront(Lf, 0), toFront(Lf, H), `${H} mm`, 'given', 14),
    dim(toTop(0, 0), toTop(0, Wd), `${Wd} mm`, 'given', 12),
    ...topNumerals, seamNote, capFrontTop,
    transferBase, transferTop,
    devOutline, ...foldLines,
    ...devNumeralsTop, ...devNumeralsBottom, ...devNumeralsCap, foldNote, insideNote,
    // Dim-line pair stays at the clean level z=-Wd (the base cap's own bottom edge, a real
    // corner on the LEFT end at x=0) so the dim line itself stays horizontal. The RIGHT end
    // (x=stretchOut) has no geometry at z=-Wd — the base cap only spans x∈[0,Lf], so the
    // pattern's true bottom-right corner is (stretchOut, 0), Wd above the dim-line pair's own
    // b. extB below sends that end's tick the extra Wd so it actually reaches drawn outline
    // instead of stopping in empty space (paintDim's extA/extB).
    dim(toDev(0, -Wd), toDev(stretchOut, -Wd), `Stretch out = 2×(${Lf}+${Wd}) = ${stretchOut} mm`, 'result', DIM_OFFSET, undefined, toDev(stretchOut, 0)),
    capDev,
  ];

  return {
    steps,
    resultText: `Rectangular prism ${Lf}×${Wd} mm base, ${H} mm high — stretch-out = 2×(${Lf}+${Wd}) = ${stretchOut} mm, four rectangles ${Lf}×${H} / ${Wd}×${H} in sequence plus the ${Lf}×${Wd} mm base and top end caps hinged at the seam wall (K.C. John Example 15.1, Fig. 15.4).`,
  };
}

// ============================================================================
// 2. Cylinder — K.C. John Example 15.4 / Bhatt Problem 15-8 (Fig. 15.7/15-10), whole
//    (uncut) lateral surface only — this topic's cylinder construction has no truncation;
//    the two-piece elbow (below) is where a cut cylinder's math is actually used.
//
// Phase 2 rebuild (../DECISIONS.md ADR-115) — same Module2-parity bar as buildPrism()
// (ADR-113/114): fixed-scale rendering, numeral/note/caption annotation, corrected dim
// signs. Verified against the actual K.C. John p.175 page (not assumed): Fig. 15.7 is
// titled "Lateral surface of a cylinder" and its development is a plain rectangle with NO
// end-cap circles attached — unlike Example 15.1's prism, this construction stays
// lateral-surface-only, `devExtra` stays 0.
// ============================================================================

const CYL_GENERATORS = 12;

// Bug-2-class fix (ADR-114's PRISM_SCALE precedent), same derivation: this construction's
// own slider worst case (diameter≤60, height≤80) through planPlate()'s own two fit-budget
// ratios (availW=294, availH=154 from this file's MARGIN/GAP_*/RESERVE_* constants):
//   scaleX_worst = 294 / (60 + π×60)  = 294/248.5 ≈ 1.183
//   scaleY_worst = 154 / (80 + 60)    = 154/140    = 1.100
// (topDepth_max = D_max = 60, the circle band; devExtra = 0 throughout, no end caps above,
// so it never enters the scaleY max()). Floored to 2dp, smaller of the two.
const CYL_SCALE = 1.10;

function buildCylinder(params) {
  const D = params.diameter ?? 44;
  const H = params.height ?? 60;
  const r = D / 2;
  const stretchOut = Math.PI * D;

  const plate = planPlate(D, H, D, stretchOut, 0, CYL_SCALE);
  const { toFront, toTop, toDev, front, top, dev, scale } = plate;
  const cx = r, cy = r; // circle centre, in the shared front/top x-axis and top's own depth axis

  // Front/top outlines are the STATED problem (visible immediately, before Play) —
  // role 'given'; only the development is the constructed 'result'.
  const frontOutline = POLY(
    [toFront(0, 0), toFront(D, 0), toFront(D, H), toFront(0, H)],
    'given', true, OUTLINE_W,
  );
  const topCircle = CIRC(toTop(cx, cy), r * scale, 'given');
  // Seam projector — scaffolding, not stated geometry, so 'move' (auxiliary tier), the same
  // fix ADR-113 applied to the prism's own projectors (this one shipped still 'given').
  const projector = L(toFront(0, 0), toTop(0, cy), 'move');

  // Twelve generators, CLOCKWISE from the LEFT seam — K.C. John Example 15.4 step 1's own
  // words: "Locate the seam (joint) of the development on left side and name the 12
  // generators clockwise from this point" (Fig. 15.7, verified against the actual page).
  // a(k) = π + 2πk/12: toTop's own y-axis grows DOWN the page (screen/canvas convention), so
  // increasing θ in (cosθ, sinθ) traces CLOCKWISE on screen; starting at θ=π (the leftmost
  // point, k=0) and increasing walks left→upper-left→top→right→bottom→left, matching Fig.
  // 15.7's own 1,2,3…12 layout. The previous a = π − 2πk/12 walked the OPPOSITE direction —
  // Bhatt Fig. 15-10's own convention, not this construction's cited K.C. John source
  // (CLAUDE.md's "cross-check K.C. John first" rule).
  const genSteps = [];
  const topNumerals = [];
  const stationPts = []; // this station's own (px,py) in the shared front/top x-axis — reused below
  for (let k = 0; k < CYL_GENERATORS; k++) {
    const a = Math.PI + (2 * Math.PI * k) / CYL_GENERATORS;
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    stationPts.push({ px, py });
    const topPt = toTop(px, py);
    genSteps.push(L(topPt, toFront(px, 0), 'move', undefined, FAST_MS)); // projector, top view → front view

    // Numeral sits outward from the circle's own centre, in whichever of the four 'place'
    // directions best matches this station's own quadrant (screen coords, y grows down).
    const nx = Math.cos(a), ny = Math.sin(a);
    const place = Math.abs(nx) >= Math.abs(ny) ? (nx >= 0 ? 'right' : 'left') : (ny >= 0 ? 'below' : 'above');
    topNumerals.push(NUM(topPt, String(k + 1), place));
  }
  // Front-view verticals: depth collapses there, so the 12 stations land on only 7 distinct
  // x's (k and 12−k share cos(a), hence the same px) — two of them coincide with the
  // outline's own left/right edges (k=0, k=6) and need no separate line; the five genuinely
  // interior x's (k=1..5, each shared with its mirror k=11..7) get exactly one line each —
  // the pre-rebuild loop drew eleven lines for this, six of them silent duplicates.
  // NAMED SCOPE DECISION, not an oversight (DESIGN.md §6, same rule the prism front view
  // follows): front-view x's are each a coincidence of TWO stations (e.g. k=1 and k=11 both
  // land here), and disambiguating that needs a second view convention (K.C. John's primed
  // letters) this topic doesn't otherwise use — so front-view stations stay unnumbered; the
  // projectors below already carry the top-view↔front-view correspondence visually.
  for (let k = 1; k < CYL_GENERATORS / 2; k++) {
    const { px } = stationPts[k];
    genSteps.push(L(toFront(px, 0), toFront(px, H), 'given', FOLD_W));
  }

  const stationXs = [];
  const stationLabels = [];
  for (let k = 0; k <= CYL_GENERATORS; k++) {
    stationXs.push((k * stretchOut) / CYL_GENERATORS);
    stationLabels.push(String((k % CYL_GENERATORS) + 1)); // 1,2,…,12,1 — closes the loop
  }

  const devOutline = POLY(
    [toDev(0, 0), toDev(stretchOut, 0), toDev(stretchOut, H), toDev(0, H)],
    'result', true, OUTLINE_W,
  );
  const devGenLines = stationXs.slice(1, -1).map((sx) => L(toDev(sx, 0), toDev(sx, H), 'result', FOLD_W, FAST_MS));
  // Cross-region (front view → development): DASH_CARRY, not the projectors' DASH_PROJECT
  // (renderConstruction.js's file header dash vocabulary) — shipped untagged before this pass.
  const transferBase = L(toFront(0, 0), toDev(stretchOut, 0), 'move', undefined, undefined, 'carry');
  const transferTop = L(toFront(0, H), toDev(stretchOut, H), 'move', undefined, undefined, 'carry');

  // ---- Station numerals on the development — K.C. John Fig. 15.7 numbers the TOP edge;
  // Bhatt Fig. 15-10 numbers the BOTTOM edge (and even thins the count). This construction
  // has 13 stations across the width the prism's own 5 shared — both-rows would collide at
  // this density (knockout boxes ~14px wide against ~12.7px station spacing at CYL_SCALE),
  // so — per review — all 13 land on the BOTTOM edge only, top edge unnumbered; a deliberate
  // divergence from the prism's both-rows treatment (DESIGN.md §6).
  const devNumeralsBottom = stationXs.map((sx, i) => NUM(toDev(sx, 0), stationLabels[i], 'below'));

  // ---- Leader callouts — Seam at the top view's own leftmost (k=0) point; Fold line/Inside
  // pattern anchored to genuinely separate real estate (the prism's own label-polish lesson:
  // two notes ~9 drawing-units apart overlapped at this font size).
  const seamNote = NOTE({ x: top.x0 - 12, y: top.y0 - 10 }, toTop(0, cy), 'Seam');
  const foldAt = toDev(stationXs[2], H * 0.75);
  const foldNote = NOTE({ x: foldAt.x + 10, y: foldAt.y - 8 }, foldAt, 'Fold line');
  const insideAt = toDev(stretchOut / 2, H * 0.3);
  const insideNote = NOTE({ x: insideAt.x, y: insideAt.y + 16 }, insideAt, 'Inside pattern');

  // ---- Region captions — same shared-row rule as the prism (constructions.js's buildPrism
  // comment): whichever block's bottom edge is lower on screen sets the row, both captions
  // the same CAPTION_GAP below it, so the stretch-out dim (which reaches DIM_OFFSET below
  // the development's own z=0 edge) can never collide with it.
  const CAPTION_GAP = 10;
  const DIM_OFFSET = 16;
  const frontTopBottom = top.y0 + top.h;
  const devBottom = toDev(stretchOut / 2, 0).y;
  const stretchDimBottom = devBottom + DIM_OFFSET;
  const captionRowY = Math.max(frontTopBottom, stretchDimBottom) + CAPTION_GAP;
  const capFrontTop = CAPTION({ x: front.x0 + front.w / 2, y: captionRowY }, '(i) Front view & top view');
  const capDev = CAPTION({ x: dev.x0 + dev.w / 2, y: captionRowY }, '(ii) Development of cylinder (inside pattern)');

  const steps = [
    frontOutline, topCircle, projector, ...genSteps,
    // Anchored at the TOP edge (z=H), not the bottom — a live check caught the bottom-edge
    // placement (offset+12, the same outward direction ADR-114 fixed for the prism's dims)
    // colliding with the top-view circle's own 'above'-placed numerals (stations 3/4/5): both
    // wanted the same narrow GAP_TOP band between front view and circle. The top edge's own
    // RESERVE_TOP margin is otherwise empty, so the dim moves there instead (offset -14,
    // pointing further up/out — same sign law, opposite edge), leaving GAP_TOP to the numerals.
    dim(toFront(0, H), toFront(D, H), `⌀ ${D} mm`, 'given', -14),
    dim(toFront(D, 0), toFront(D, H), `${H} mm`, 'given', 14),
    ...topNumerals, seamNote, capFrontTop,
    transferBase, transferTop,
    devOutline, ...devGenLines, ...devNumeralsBottom, foldNote, insideNote,
    dim(toDev(0, 0), toDev(stretchOut, 0), `Stretch out = π×⌀${D} = ${stretchOut.toFixed(1)} mm`, 'result', DIM_OFFSET),
    capDev,
  ];

  return {
    steps,
    resultText: `Cylinder ⌀${D} mm × ${H} mm high — stretch-out = π×${D} = ${stretchOut.toFixed(1)} mm, twelve generators at ${(stretchOut / 12).toFixed(1)} mm spacing (K.C. John Example 15.4, Fig. 15.7).`,
  };
}

// ============================================================================
// 3. Two-piece symmetric 90° elbow — a deliberate simplification of Bhatt Problem 15-13
//    (Fig. 15-15) / K.C. John Example 15.18 (Fig. 15.20-21)'s THREE-piece worked bend,
//    dropping the middle double-truncated piece (ADR-112: no numbered two-piece textbook
//    figure exists — each piece here is a single 45°-mitred cylinder, Bhatt Fig. 15-10 /
//    15-11's own construction, mitred and mirrored — see DECISIONS.md ADR-116's citation
//    correction: K.C. John Fig. 15.12/Example 15.9, cited here originally, is actually a
//    DOUBLY truncated tube (45° at the top, 30° lower), not this topic's single-truncation
//    source; Bhatt's own Fig. 15-10 (Problem 15-8) and Fig. 15-11 (Problem 15-9, a 45° cut)
//    are the real sources).
//
// Front-view corner algebra (verified in-file, not just asserted): the mitre plane's
// trace is the straight line from the INNER corner E=(-r,-r) to the OUTER corner
// C=(+r,+r) in a local frame centred on the theoretical bend corner. Vertical piece:
// right wall (x=+r, through C) is LONG (legShort+D), left wall (x=-r, through E) is
// SHORT (legShort) — a flat perpendicular cut at the SAME yBottom for both walls
// necessarily makes them differ by exactly D (2×the mitre's r amplitude). Horizontal
// piece: by the identical logic rotated 90°, its FLAT end (a single vertical line at
// xRight) is genuinely reached by both walls; solving for the wall through C to be the
// SHORT one (matching this topic's "both legs the same length" parametrisation) makes
// the wall through E the LONG one — a real, verified asymmetry (outer-corner-attached
// wall is long on one piece, short on the other), not an error.
// ============================================================================

const ELBOW_GENERATORS = 12;

/** Per-piece cut-height above its own flat end, at circle angle theta (theta=0 at that
 *  piece's own LONG-wall direction). Both pieces use this SAME formula (a genuinely
 *  symmetric elbow's two developments are congruent) — the closed-form reduction of
 *  computeCutDistances()'s general per-generator plane-intersection loop for a simple
 *  single-axis-tilt 45° plane (amplitude = r, since tan 45° = 1); see developmentEngine.js
 *  header for why the general solver (fixed at its own CUT_SAMPLES=48) isn't called
 *  directly for this topic's own 12-generator convention. `computeCutDistances` stays
 *  imported and is exercised by this file's own dev-console self-check (see CLAUDE.md),
 *  confirming this closed form agrees with the general solver at every sampled angle.
 */
function cutHeight(theta, legShort, r) {
  return legShort + r + r * Math.cos(theta);
}

/** Dev-time cross-check, runs once at module load (console-warns, never throws): confirms
 *  cutHeight()'s closed form agrees with developmentEngine.js's general per-generator
 *  plane-intersection solver, for one representative case built from a plane chosen so
 *  its local-frame algebra matches cutHeight()'s own convention exactly (ny=nx-negated,
 *  nz=0, d solved so t(0)=legLong and t(π)=legShort — see the derivation in this
 *  function's own working). Keeps the ADR-112 claim ("uses the same math as the general
 *  solver") checked in code, not just asserted in a comment. */
(function verifyCutHeightAgainstGeneralSolver() {
  const legShort0 = 70, D0 = 50, r0 = D0 / 2;
  const ny = Math.SQRT1_2, nx = -ny, nz = 0, d = -ny * (legShort0 + r0);
  const result = computeCutDistances(
    { shape: 'Cylinder', baseLength: D0, height: legShort0 + D0 + 10 },
    { nx, ny, nz, d },
  );
  if (!result) { console.warn('[development-of-surfaces] cutHeight self-check: computeCutDistances returned null.'); return; }
  const N = result.heights.length - 1;
  let maxErr = 0;
  for (let k = 0; k <= N; k++) {
    const angle = (2 * Math.PI * k) / N;
    maxErr = Math.max(maxErr, Math.abs(result.heights[k] - cutHeight(angle, legShort0, r0)));
  }
  if (maxErr > 1e-6) {
    console.warn(`[development-of-surfaces] cutHeight() disagrees with the general plane-intersection solver by up to ${maxErr} — check the derivation.`);
  }
})();

// Phase 3 rebuild (../DECISIONS.md ADR-116) — a FIXED px/mm ratio, same reasoning as
// PRISM_SCALE/CYL_SCALE, derived from this construction's own slider worst case
// (diameter≤60, legLength≤100). Drawing ONE development pattern (not two side by side,
// see buildElbow()'s own comment) is what makes a usable scale reachable at all:
//   frontW = frontH = D_max + legShort_max = 60 + 100           = 160
//   topDepth = D_max                                             = 60
//   devW = pi * D_max (ONE pattern)                               ≈ 188.5
//   scaleX_worst = availW / (frontW + devW) = 294 / (160+188.5)  ≈ 0.8436
//   scaleY_worst = availH / (frontH + topDepth) = 154 / (160+60) = 0.7000   <- binds
// (availW/availH from this file's own MARGIN/GAP_*/RESERVE_* constants — recompute if
// those constants or this construction's `given` ranges ever change.) Floored to 2dp.
// TWO side-by-side patterns (devW ≈ 397) would instead bind scaleX at ≈0.52 px/mm — too
// small for any station numeral (circle radius 13px, dev stations 5.7px apart) — the
// edge case this phase's own brief flagged to watch for; confirmed with the user.
const ELBOW_SCALE = 0.70;

function buildElbow(params) {
  const D = params.diameter ?? 50;
  const legShort = params.legLength ?? 70;
  const r = D / 2;
  const legLong = legShort + D;
  const stretchOut = Math.PI * D;

  // Local front-view frame (mm), corner points per the derivation above.
  const yBottom = -(r + legShort);
  const xRight = r + legShort;
  const A = { x: -r, y: yBottom };
  const B = { x: r, y: yBottom };
  const C = { x: r, y: r };
  const E = { x: -r, y: -r };
  const F = { x: xRight, y: r };
  const G = { x: xRight, y: -r };
  const localMinX = -r, localMaxX = xRight, localMinY = yBottom, localMaxY = r;
  const frontW = localMaxX - localMinX;
  const frontH = localMaxY - localMinY;

  // ONE development pattern (Phase 3 rebuild) — the other piece is its mirror image
  // (Bhatt p.359, Fig. 15-15(v): "Parts A and C are similar"), noted in capDev's own
  // caption text below, not drawn a second time. See ELBOW_SCALE's own comment for why:
  // two side-by-side patterns made annotation unreachable at any fixed scale.
  const devW = stretchOut;
  const plate = planPlate(frontW, frontH, D, devW, 0, ELBOW_SCALE);
  const { front, dev, scale } = plate;
  const toFront = (p) => ({ x: front.x0 + (p.x - localMinX) * scale, y: front.y0 + (localMaxY - p.y) * scale });
  // Auxiliary circle: SAME elbow-frame x-axis as toFront (x=0 is the vertical piece's own
  // centreline, matching its wall span [-r, r]) — vertical projectors are then genuinely
  // vertical, the same shared-axis contract planPlate's own toTop/toFront use everywhere
  // else in this file. `topCy` is the circle centre's depth within the top band (simply
  // `r`, centring it in the band's own D-tall budget) — NOT an elbow-frame coordinate.
  const topCy = r;
  const toTop = (x, y) => ({ x: front.x0 + (x - localMinX) * scale, y: plate.top.y0 + y * scale });

  // Front-view outline is the STATED problem (visible immediately, before Play) — role
  // 'given'; only the development pattern is the constructed 'result'.
  const frontOutline = POLY([toFront(A), toFront(B), toFront(C), toFront(F), toFront(G), toFront(E)], 'given', true, OUTLINE_W);
  const mitreLine = L(toFront(E), toFront(C), 'given', FOLD_W);
  const topCircleCenter = toTop(0, topCy);
  const topCircle = CIRC(topCircleCenter, r * scale, 'given');
  // Seam projector — scaffolding, not stated geometry, so 'move' (auxiliary tier), the
  // same fix ADR-113/115 applied to the prism's/cylinder's own projectors (this one
  // shipped still 'given'). Front view's LEFT wall (x=-r, elbow frame) down to the
  // circle's own leftmost point (x=-r, same frame, station 1, θ=π) — genuinely vertical.
  const projector = L(toFront(A), toTop(-r, topCy), 'move');

  // Vertical piece's twelve generators — LEFT-seam clockwise, K.C. John's own stated rule
  // (Example 15.4 step 1, ADR-115's own citation) and buildCylinder()'s identical a(k):
  // station 1 (k=0) is the LEFT/short wall, station 7 (k=6) the RIGHT/long wall. Every
  // front-view wall generator is a coincidence of TWO stations (k and 12-k share
  // r*cos(a(k)), since sin/cos of a(k)=pi+2*pi*k/12 mirror about the seam) — the SAME
  // depth-collapse dedup ADR-115 applied to the cylinder's front view: only k=1..5 need a
  // drawn wall line, k=0/k=6 already ARE the outline's own A-E/B-C edges.
  const genStepsV = [];
  const topNumerals = [];
  const stationPts = []; // {localX, a} per station — reused below by the horizontal piece
                          // and the transfer lines, since both pieces share the SAME
                          // station angle (this phase's own left-seam renumbering makes
                          // that sharing exact, not approximate).
  for (let k = 0; k < ELBOW_GENERATORS; k++) {
    const a = Math.PI + (2 * Math.PI * k) / ELBOW_GENERATORS;
    const localX = r * Math.cos(a);
    const localYtop = r * Math.sin(a);
    stationPts.push({ localX, a });
    const topPt = toTop(localX, topCy + localYtop);
    const h = cutHeight(a, legShort, r);
    const wallBase = toFront({ x: localX, y: yBottom });
    const wallTop = toFront({ x: localX, y: yBottom + h });
    genStepsV.push(L(topPt, wallBase, 'move', undefined, FAST_MS));
    if (k >= 1 && k <= 5) genStepsV.push(L(wallBase, wallTop, 'given', FOLD_W));

    // Numeral sits outward from the circle's own centre, in whichever of the four 'place'
    // directions best matches this station's own quadrant — buildCylinder()'s own rule.
    const nx = Math.cos(a), ny = Math.sin(a);
    const place = Math.abs(nx) >= Math.abs(ny) ? (nx >= 0 ? 'right' : 'left') : (ny >= 0 ? 'below' : 'above');
    topNumerals.push(NUM(topPt, String(k + 1), place));
  }

  // Horizontal piece's twelve generators: this topic has no genuine third (side) view to
  // project them from, so they're placed directly along its own flat end (x=xRight) and
  // tied to the mitre line by a labelled number correspondence rather than a continuous
  // orthogonal projector — a documented simplification (this topic's CLAUDE.md "Elbow
  // scope"), not a claim of a third auxiliary view. Station k here shares the VERTICAL
  // piece's own angle a(k) (stationPts above) — the mitre's 45° symmetry makes
  // r*cos(a(k)) the SAME cross-section coordinate for both pieces (file header), so this
  // piece's cut length is cutHeight()'s complement: legShort+r−r·cos(a(k)) instead of
  // legShort+r+r·cos(a(k)). Same k=1..5-only dedup as the vertical piece — k=0/k=6
  // already ARE the outline's own G-E/C-F edges.
  const genStepsH = [];
  const horizNumerals = [];
  const HORIZ_NUM_K = [0, 1, 3, 6]; // thinned set intersected with this piece's own
                                     // distinct half (k=7..11 mirror k=5..1, see above) —
                                     // stations 1, 2, 4, 7.
  for (let k = 0; k <= 6; k++) {
    const { a, localX: mLocalY } = stationPts[k]; // r*cos(a(k)) reused as this piece's own cross-section y
    const hH = legShort + r - r * Math.cos(a);
    const wallEnd = toFront({ x: xRight, y: mLocalY });
    const mitrePt = toFront({ x: xRight - hH, y: mLocalY });
    if (k >= 1 && k <= 5) genStepsH.push(L(mitrePt, wallEnd, 'given', FOLD_W));
    if (HORIZ_NUM_K.includes(k)) horizNumerals.push(NUM(mitrePt, String(k + 1), 'right'));
  }

  // --- Development: ONE stretch-out pattern (ELBOW_SCALE's own comment) — a straight flat
  // edge (z=0, the piece's own uncut flat rim) on one side, the cosine mitre curve on the
  // other. `devZBase = frontH` (Phase 3 fix, was `legLong + r`) ALIGNS the development's
  // z-datum with the front view's own — before this fix every cut point sat `r` below its
  // own front-view mitre point, which is why this construction never had a working
  // transfer line despite ADR-112's whole single-plate architecture existing for exactly
  // that (K.C. John Ch.15 note #1: every development line must be a TRUE length,
  // genuinely horizontal here).
  const devZBase = frontH;
  function dev0(x, z) { return { x: dev.x0 + x * scale, y: dev.y0 + (devZBase - z) * scale }; }

  const devPts = [];
  for (let k = 0; k <= ELBOW_GENERATORS; k++) {
    const a = Math.PI + (2 * Math.PI * k) / ELBOW_GENERATORS;
    devPts.push({ x: (k * stretchOut) / ELBOW_GENERATORS, z: cutHeight(a, legShort, r) });
  }
  // flatEdge/sideA/sideB are short boundary lines, not the "hero" reveal — FAST_MS, same
  // reasoning as the fold lines. cutCurve (the sinusoidal mitre cut, this construction's
  // actual textbook-notable result) keeps the full default pace, stretched by RESULT_PACE.
  const flatEdge = POLY([dev0(devPts[0].x, 0), dev0(devPts[devPts.length - 1].x, 0)], 'result', false, OUTLINE_W, FAST_MS);
  const cutCurve = POLY(devPts.map((p) => dev0(p.x, p.z)), 'result', false, OUTLINE_W);
  const sideA = L(dev0(devPts[0].x, 0), dev0(devPts[0].x, devPts[0].z), 'result', OUTLINE_W, FAST_MS);
  const sideB = L(dev0(devPts[devPts.length - 1].x, 0), dev0(devPts[devPts.length - 1].x, devPts[devPts.length - 1].z), 'result', OUTLINE_W, FAST_MS);
  const foldLines = devPts.slice(1, -1).map((p) => L(dev0(p.x, 0), dev0(p.x, p.z), 'result', FOLD_W, FAST_MS));

  // Thinned numeral set — Bhatt Fig. 15-11's own set for a 45° single-truncation cylinder
  // (1,2,4,7,10,12,1), not the full 13: at ELBOW_SCALE the full set collides (≈9.2px
  // spacing vs a ≈14px two-digit knockout box), the same density problem ADR-115 solved
  // for the cylinder, worse here since ELBOW_SCALE < CYL_SCALE. Confirmed with the user.
  const THIN_K = [0, 1, 3, 6, 9, 11, 12];
  const devNumerals = THIN_K.map((k) => NUM(dev0(devPts[k].x, 0), String((k % ELBOW_GENERATORS) + 1), 'below'));

  // Cross-region (front view → development) transfer lines, DASH_CARRY — the ONE thing
  // ADR-112's single-plate Canvas2D architecture exists for and this construction never
  // had until the devZBase fix above. 7 distinct heights (k=0..6, legShort → legLong
  // monotonically), not 12 — the SAME depth-collapse dedup as the wall generators, since a
  // transfer line's front-view endpoint is a wall/mitre point subject to the identical
  // k/12-k coincidence.
  const transfers = [];
  for (let k = 0; k <= 6; k++) {
    const { a, localX } = stationPts[k];
    const h = cutHeight(a, legShort, r);
    const frontPt = toFront({ x: localX, y: yBottom + h });
    transfers.push(L(frontPt, dev0(devPts[k].x, h), 'move', undefined, undefined, 'carry'));
  }

  // ---- Leader callouts.
  const seamNote = NOTE({ x: plate.top.x0 - 12, y: plate.top.y0 - 10 }, toTop(stationPts[0].localX, topCy), 'Seam');
  const foldAt = dev0(devPts[2].x, devPts[2].z * 0.6);
  const foldNote = NOTE({ x: foldAt.x + 10, y: foldAt.y - 8 }, foldAt, 'Fold line');
  const insideAt = dev0(stretchOut / 2, devPts[6].z * 0.3);
  const insideNote = NOTE({ x: insideAt.x, y: insideAt.y + 16 }, insideAt, 'Inside pattern');

  // ---- Region captions. The mirror-image note (Bhatt p.359, Fig. 15-15(v): "Parts A and
  // C are similar") folds into capDev's OWN text rather than a standalone NOTE — a
  // standalone note near the pattern's own top edge landed only 10 units above the front
  // view's top edge (inside RESERVE_TOP, not overflowing the canvas, but tight); the
  // caption row is already the one position on this plate proven collision-free at every
  // slider extreme (captionRowY below), so reusing it is strictly safer than finding a new
  // clear spot inside the development block itself. — same shared-row rule the prism/cylinder established: whichever
  // block's bottom edge is lower on screen sets the row, both captions the same gap below.
  const CAPTION_GAP = 10;
  const DIM_OFFSET = 16;
  const frontTopBottom = plate.top.y0 + plate.top.h;
  const devBottom = dev0(stretchOut / 2, 0).y;
  const stretchDimBottom = devBottom + DIM_OFFSET;
  const captionRowY = Math.max(frontTopBottom, stretchDimBottom) + CAPTION_GAP;
  const capFrontTop = CAPTION({ x: front.x0 + front.w / 2, y: captionRowY }, '(i) Front view & top view');
  const capDev = CAPTION({ x: dev.x0 + dev.w / 2, y: captionRowY }, '(ii) Development of one elbow piece (inside pattern) — piece 2 is its mirror image');

  const steps = [
    frontOutline, mitreLine, topCircle, projector,
    ...genStepsV, ...topNumerals, seamNote,
    ...genStepsH, ...horizNumerals,
    // ⌀ dim: horizontal, below the A-B bottom edge (RESERVE_BOTTOM) — universally clear
    // for its whole length, unlike a placement beside/on the front view or circle (both
    // are only PARTIALLY clear against this shape's own non-convex L-footprint, see
    // ADR-116). Was landing INSIDE the front view (offset -12 pre-rebuild, then briefly
    // -14 mid-rebuild — both wrong; paintDim()'s perpendicular is computed from a/b in
    // their OWN already-y-flipped toFront-space, not the local mm frame these points came
    // from, so a sign derived by reasoning in local space lands backwards here). Verified
    // by literally replicating paintDim()'s own oa/ob/mid formula against the real
    // frontOutline polygon (ray-casting inside/outside), not re-guessed by hand a third
    // time: +14 is confirmed outside at both ends and the midpoint.
    dim(toFront(A), toFront(B), `⌀ ${D} mm`, 'given', 14),
    // legShort: LEFT of the A-E wall (x=-r, the shape's true global-leftmost edge for this
    // wall's whole y-range) — confirmed outside at both ends and the midpoint by the same
    // polygon replication above. This one was already correct pre-rebuild (-14); no change.
    dim(toFront(A), toFront(E), `${legShort} mm (short leg)`, 'given', -14),
    // legLong: RIGHT of the B-C wall — also already correct pre-rebuild (+14): outside at
    // the B end and the dim TEXT's own midpoint, confirmed by the same polygon
    // replication. Only the C end (`ob`) lands inside — B-C's exterior side genuinely
    // differs above/below local y=-r on this non-convex L-shaped outline (the horizontal
    // piece's own body overhangs the upper stretch near the reflex vertex C), so no single
    // perpendicular offset clears this edge's WHOLE length; the achievable best (text and
    // majority of the line clear) is what's shipped here. Flagged, not silently treated as
    // fully solved (RULES §2.19a; see ADR-116's own note on this edge case).
    dim(toFront(B), toFront(C), `${legLong} mm (long leg)`, 'given', 14),
    capFrontTop,
    flatEdge, sideA, sideB, ...foldLines, cutCurve, ...devNumerals,
    foldNote, insideNote,
    ...transfers,
    dim(dev0(0, 0), dev0(stretchOut, 0), `Stretch out = π×⌀${D} = ${stretchOut.toFixed(1)} mm`, 'result', DIM_OFFSET),
    capDev,
  ];

  return {
    steps,
    resultText: `Two-piece 90° elbow, ⌀${D} mm, short leg ${legShort} mm / long leg ${legLong} mm — each piece is a plain cylinder mitred once at 45° (Bhatt Fig. 15-10/15-11's single-truncation construction), stretch-out π×${D} = ${stretchOut.toFixed(1)} mm. One development pattern is drawn; the second piece is its mirror image.`,
  };
}

// ----------------------------------------------------------------------------
// The three constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {string} principle
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'prism',
    label: 'Rectangular Prism',
    shortLabel: 'Prism',
    principle: 'A prism’s lateral surface unrolls into four rectangles in a row, one per base edge, in EXACT sequence — the stretch-out length is simply the base perimeter, and every fold line is a TRUE-length vertical edge already, so no transfer construction is needed beyond the base and top lines.',
    given: [
      { key: 'baseLength', label: 'Base length (front edge)', unit: 'mm', min: 20, max: 40, step: 2, default: 30 },
      { key: 'baseWidth', label: 'Base width (depth)', unit: 'mm', min: 16, max: 32, step: 2, default: 24 },
      { key: 'height', label: 'Height', unit: 'mm', min: 20, max: 60, step: 5, default: 40 },
    ],
    build: buildPrism,
  },
  {
    id: 'cylinder',
    label: 'Cylinder',
    shortLabel: 'Cylinder',
    principle: 'A cylinder’s lateral surface unrolls into a single rectangle, width = π×diameter (the base circumference), height = the cylinder’s own height. Dividing the base circle into twelve equal generators and transferring each one across gives the fold-line grid the pattern is drawn on.',
    given: [
      { key: 'diameter', label: 'Diameter', unit: 'mm', min: 30, max: 60, step: 2, default: 44 },
      { key: 'height', label: 'Height', unit: 'mm', min: 30, max: 80, step: 5, default: 60 },
    ],
    build: buildCylinder,
  },
  {
    id: 'elbow',
    label: 'Two-Piece 90° Elbow',
    shortLabel: 'Elbow',
    principle: 'A 90° pipe bend built from two identical cylinder pieces, each mitred once at 45° and joined mirror-symmetrically. Each piece’s development is the single-truncation cylinder construction (Bhatt Fig. 15-10 / Fig. 15-11) — a straight flat edge on one side, a cosine-shaped cut curve on the other, amplitude equal to the pipe’s own radius. Only one pattern is drawn; the second piece is its mirror image.',
    given: [
      { key: 'diameter', label: 'Pipe diameter', unit: 'mm', min: 30, max: 60, step: 2, default: 50 },
      { key: 'legLength', label: 'Leg length (short side)', unit: 'mm', min: 40, max: 100, step: 5, default: 70 },
    ],
    build: buildElbow,
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];

export const __internal = { CANVAS };
