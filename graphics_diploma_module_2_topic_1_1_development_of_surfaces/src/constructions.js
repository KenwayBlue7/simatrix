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
// ============================================================================

const CYL_GENERATORS = 12;

function buildCylinder(params) {
  const D = params.diameter ?? 44;
  const H = params.height ?? 60;
  const r = D / 2;
  const stretchOut = Math.PI * D;

  const plate = planPlate(D, H, D, stretchOut);
  const { toFront, toTop, toDev, scale } = plate;
  const cx = r, cy = r; // circle centre, in the shared front/top x-axis and top's own depth axis

  // Front/top outlines are the STATED problem (visible immediately, before Play) —
  // role 'given'; only the development is the constructed 'result'.
  const frontOutline = POLY(
    [toFront(0, 0), toFront(D, 0), toFront(D, H), toFront(0, H)],
    'given', true, OUTLINE_W,
  );
  const topCircle = CIRC(toTop(cx, cy), r * scale, 'given');
  const projector = L(toFront(0, 0), toTop(0, cy), 'given');

  // Twelve generators, seam at the left (K.C. John convention: "locate the seam on the
  // left side of top view and name the generators clockwise from this point").
  const genSteps = [];
  const stationXs = [];
  for (let k = 0; k <= CYL_GENERATORS; k++) {
    const kk = k % CYL_GENERATORS;
    const a = Math.PI - (2 * Math.PI * kk) / CYL_GENERATORS; // k=0 at the seam (angle 180°)
    const px = cx + r * Math.cos(a);
    const py = cy + r * Math.sin(a);
    const topPt = toTop(px, py);
    const frontBase = toFront(px, 0);
    const frontTop = toFront(px, H);
    stationXs.push((k * stretchOut) / CYL_GENERATORS);
    genSteps.push(L(topPt, frontBase, 'move', undefined, FAST_MS)); // projector, top view → front view
    // role 'given' (shown immediately, no `duration` needed — 'given' steps never animate).
    if (k > 0 && k < CYL_GENERATORS) genSteps.push(L(frontBase, frontTop, 'given', FOLD_W));
  }

  const devOutline = POLY(
    [toDev(0, 0), toDev(stretchOut, 0), toDev(stretchOut, H), toDev(0, H)],
    'result', true, OUTLINE_W,
  );
  const devGenLines = stationXs.slice(1, -1).map((sx) => L(toDev(sx, 0), toDev(sx, H), 'result', FOLD_W, FAST_MS));
  const transferBase = L(toFront(0, 0), toDev(stretchOut, 0), 'move');
  const transferTop = L(toFront(0, H), toDev(stretchOut, H), 'move');

  const steps = [
    frontOutline, topCircle, projector, ...genSteps,
    dim(toFront(0, 0), toFront(D, 0), `⌀ ${D} mm`, 'given', -12),
    dim(toFront(D, 0), toFront(D, H), `${H} mm`, 'given', 14),
    transferBase, transferTop,
    devOutline, ...devGenLines,
    dim(toDev(0, 0), toDev(stretchOut, 0), `π×${D} = ${stretchOut.toFixed(1)} mm`, 'result', 16),
  ];

  return {
    steps,
    resultText: `Cylinder ⌀${D} mm × ${H} mm high — stretch-out = π×${D} = ${stretchOut.toFixed(1)} mm, twelve generators at ${(stretchOut / 12).toFixed(1)} mm spacing (K.C. John Example 15.4).`,
  };
}

// ============================================================================
// 3. Two-piece symmetric 90° elbow — a deliberate simplification of Bhatt Problem 15-13
//    (Fig. 15-15) / K.C. John Example 15.18 (Fig. 15.20-21)'s THREE-piece worked bend,
//    dropping the middle double-truncated piece (ADR-112: no numbered two-piece textbook
//    figure exists — each piece here is a single 45°-mitred cylinder, Bhatt Fig. 15-10 /
//    K.C. John Fig. 15.12's own construction, mitred and mirrored).
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

  const plate = planPlate(frontW, frontH, D, stretchOut * 2 + 20 /* gap between the two patterns */);
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
  // 'given'; only the development patterns are the constructed 'result'.
  const frontOutline = POLY([toFront(A), toFront(B), toFront(C), toFront(F), toFront(G), toFront(E)], 'given', true, OUTLINE_W);
  const mitreLine = L(toFront(E), toFront(C), 'given', FOLD_W);
  const topCircleCenter = toTop(0, topCy);
  const topCircle = CIRC(topCircleCenter, r * scale, 'given');
  // Seam projector: front view's LEFT wall (x=-r, elbow frame) down to the circle's own
  // leftmost point (x=-r, same frame, θ=π) — genuinely vertical, matching kk=6 below.
  const projector = L(toFront(A), toTop(-r, topCy), 'given');

  // Vertical piece's twelve generators: evenly spaced around the auxiliary circle,
  // projected UP into the vertical piece's wall band, meeting the mitre line at
  // cutHeight(theta) above yBottom — theta=0 at the RIGHT (outer, x=+r, LONG) direction,
  // matching this piece's own long/short wall algebra above.
  const genStepsV = [];
  for (let k = 0; k <= ELBOW_GENERATORS; k++) {
    const kk = k % ELBOW_GENERATORS;
    const theta = (2 * Math.PI * kk) / ELBOW_GENERATORS; // 0 at +x (right/outer/long)
    const localX = r * Math.cos(theta);
    const topPt = toTop(localX, topCy + r * Math.sin(theta));
    const h = cutHeight(theta, legShort, r);
    const wallTop = toFront({ x: localX, y: yBottom + h });
    const wallBase = toFront({ x: localX, y: yBottom });
    genStepsV.push(L(topPt, wallBase, 'move', undefined, FAST_MS));
    if (kk !== 0) genStepsV.push(L(wallBase, wallTop, 'given', FOLD_W)); // 'given' — no animation, no duration needed
  }

  // Horizontal piece's twelve generators: this topic has no genuine third (side) view to
  // project them from, so they're placed directly along its own flat end (x=xRight) at
  // evenly spaced positions and tied to the mitre line by a labelled correspondence
  // (station numbers) rather than a continuous orthogonal projector — a documented
  // simplification (see this topic's CLAUDE.md), not a claim of a third auxiliary view.
  const genStepsH = [];
  for (let k = 0; k <= ELBOW_GENERATORS; k++) {
    const kk = k % ELBOW_GENERATORS;
    const theta = (2 * Math.PI * kk) / ELBOW_GENERATORS; // 0 at -y (bottom/inner/long, this piece's own long direction)
    const localY = r * Math.sin(theta) * -1;
    const h = cutHeight(theta, legShort, r);
    const wallEnd = toFront({ x: xRight, y: localY });
    const mitrePt = toFront({ x: xRight - h, y: localY });
    if (kk !== 0) genStepsH.push(L(mitrePt, wallEnd, 'given', FOLD_W)); // 'given' — no animation, no duration needed
    genStepsH.push(P(mitrePt, 'move', String(kk), FAST_MS));
  }

  // --- Development: two congruent stretch-out patterns, side by side, each width πD,
  // each a straight flat edge on one side and the cosine mitre curve on the other — the
  // SAME formula for both pieces (see file header: a truly symmetric elbow's two
  // developments are congruent, not merely similar). Development's own z=0 sits at each
  // piece's flat end (its OWN convention, independent of the front view's yBottom, since
  // the two pieces run along different front-view axes).
  const devZBase = legLong + r; // headroom above z=0 for the tallest cut point
  function dev0(x, z) { return { x: dev.x0 + x * scale, y: dev.y0 + (devZBase - z) * scale }; }

  function devPattern(originX, label) {
    const pts = [];
    for (let k = 0; k <= ELBOW_GENERATORS; k++) {
      const theta = (2 * Math.PI * k) / ELBOW_GENERATORS;
      const h = cutHeight(theta, legShort, r);
      pts.push({ x: originX + (k * stretchOut) / ELBOW_GENERATORS, z: h });
    }
    // flatEdge/sideA/sideB are short boundary lines, not the "hero" reveal — FAST_MS,
    // same reasoning as the fold lines. cutCurve (the sinusoidal mitre cut, this
    // construction's actual textbook-notable result) keeps the full default pace.
    const flatEdge = POLY([dev0(pts[0].x, 0), dev0(pts[pts.length - 1].x, 0)], 'result', false, OUTLINE_W, FAST_MS);
    const cutCurve = POLY(pts.map((p) => dev0(p.x, p.z)), 'result', false, OUTLINE_W);
    const sideA = L(dev0(pts[0].x, 0), dev0(pts[0].x, pts[0].z), 'result', OUTLINE_W, FAST_MS);
    const sideB = L(dev0(pts[pts.length - 1].x, 0), dev0(pts[pts.length - 1].x, pts[pts.length - 1].z), 'result', OUTLINE_W, FAST_MS);
    const foldLines = pts.slice(1, -1).map((p) => L(dev0(p.x, 0), dev0(p.x, p.z), 'result', FOLD_W, FAST_MS));
    const cap = LABEL(dev0(originX, legLong + r + 6), label, 0, 0);
    return [flatEdge, sideA, sideB, ...foldLines, cutCurve, cap];
  }

  const pattern1 = devPattern(0, 'Piece 1 (vertical leg)');
  const pattern2 = devPattern(stretchOut + 20, 'Piece 2 (horizontal leg, mirror image)');

  const steps = [
    frontOutline, mitreLine, topCircle, projector, ...genStepsV, ...genStepsH,
    dim(toFront(A), toFront(B), `⌀ ${D} mm`, 'given', -12),
    dim(toFront(A), toFront(E), `${legShort} mm (short leg)`, 'given', -14),
    dim(toFront(B), toFront(C), `${legLong} mm (long leg)`, 'given', 14),
    ...pattern1, ...pattern2,
    dim(dev0(0, 0), dev0(stretchOut, 0), `π×${D} = ${stretchOut.toFixed(1)} mm`, 'result', 16),
  ];

  return {
    steps,
    resultText: `Two-piece 90° elbow, ⌀${D} mm, short leg ${legShort} mm / long leg ${legLong} mm — each piece is a plain cylinder mitred once at 45° (Bhatt Fig. 15-10 / K.C. John Fig. 15.12's single-cut math), stretch-out π×${D} = ${stretchOut.toFixed(1)} mm each, mirrored.`,
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
    principle: 'A 90° pipe bend built from two identical cylinder pieces, each mitred once at 45° and joined mirror-symmetrically. Each piece’s development is the single-truncation cylinder construction (Bhatt Fig. 15-10 / K.C. John Fig. 15.12) — a straight flat edge on one side, a cosine-shaped cut curve on the other, amplitude equal to the pipe’s own radius.',
    given: [
      { key: 'diameter', label: 'Pipe diameter', unit: 'mm', min: 30, max: 60, step: 2, default: 50 },
      { key: 'legLength', label: 'Leg length (short side)', unit: 'mm', min: 40, max: 100, step: 5, default: 70 },
    ],
    build: buildElbow,
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];

export const __internal = { CANVAS };
