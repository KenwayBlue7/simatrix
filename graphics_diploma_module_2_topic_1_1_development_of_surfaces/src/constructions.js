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

import { computeCutDistances } from './developmentEngine.js';

const deg2rad = (d) => (d * Math.PI) / 180;

// ----------------------------------------------------------------------------
// Step builders (same shape as every other Diploma topic's constructions.js)
// ----------------------------------------------------------------------------

const P = (p, role, label, duration) => ({ kind: 'point', role, p, label, duration });
const L = (a, b, role, weight, duration) => ({ kind: 'line', role, a, b, weight, duration });
/** Straight-segment path (sharp corners) — new this topic, see file header. */
const POLY = (points, role, closed, weight, duration) => ({ kind: 'polyline', role, points, closed, weight, duration });
const CIRC = (center, radius, role) => ({ kind: 'circle', role, center, radius });
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });
const LABEL = (p, text, dx, dy) => ({ kind: 'label', p, text, dx, dy });

const OUTLINE_W = 1.8; // K.C. John Ch.15 note #4: pattern outline, THICK
const FOLD_W = 0.6;    //   ...fold / generator lines, THIN

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

/**
 * @param {number} frontW  front view's own width (its local x-extent, in mm)
 * @param {number} frontH  front view's own height (its local y-extent, in mm)
 * @param {number} topDepth  top view/auxiliary-circle's extent below the front view (mm)
 * @param {number} devW  development's total width (its stretch-out extent, in mm)
 */
function planPlate(frontW, frontH, topDepth, devW) {
  const availW = CANVAS.w - MARGIN * 2 - GAP_DEV;
  const availH = CANVAS.h - MARGIN * 2 - GAP_TOP;
  const scaleX = availW / Math.max(frontW + devW, 1e-6);
  const scaleY = availH / Math.max(frontH + topDepth, 1e-6);
  const scale = Math.min(scaleX, scaleY, 4);

  const front = { x0: MARGIN, y0: MARGIN, w: frontW * scale, h: frontH * scale };
  const top = { x0: front.x0, y0: front.y0 + front.h + GAP_TOP, w: frontW * scale, h: topDepth * scale };
  const dev = { x0: front.x0 + front.w + GAP_DEV, y0: front.y0, w: devW * scale };

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

function buildPrism(params) {
  const Lf = params.baseLength ?? 30; // the base edge parallel to VP (shown true in front view)
  const Wd = params.baseWidth ?? 24;  // the base edge running back (plan depth)
  const H = params.height ?? 40;
  // Going around the base, front → right → back → left → (seam): edges alternate Lf/Wd.
  const edges = [Lf, Wd, Lf, Wd];
  const stretchOut = edges.reduce((a, b) => a + b, 0);

  const plate = planPlate(Lf, H, Wd, stretchOut);
  const { toFront, toTop, toDev } = plate;

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
  // Vertical projector, front view's seam corner down to the top view's own corner —
  // first-angle fold-line convention (RULES §4), ties the two views together.
  const projector = L(toFront(0, 0), toTop(0, 0), 'given');

  let x = 0;
  const foldXs = [];
  for (let i = 0; i < edges.length - 1; i++) { x += edges[i]; foldXs.push(x); }
  const devOutline = POLY(
    [toDev(0, 0), toDev(stretchOut, 0), toDev(stretchOut, H), toDev(0, H)],
    'result', true, OUTLINE_W,
  );
  const foldLines = foldXs.map((fx) => L(toDev(fx, 0), toDev(fx, H), 'result', FOLD_W, FAST_MS));
  // A plain (uncut) prism's every vertical edge is already a TRUE length (K.C. John
  // Ch.15 note #1) — only the base line (z=0) and top line (z=H) ever need transferring.
  const transferBase = L(toFront(0, 0), toDev(stretchOut, 0), 'move');
  const transferTop = L(toFront(0, H), toDev(stretchOut, H), 'move');

  const steps = [
    frontOutline, topOutline, projector,
    dim(toFront(0, 0), toFront(Lf, 0), `${Lf} mm`, 'given', -12),
    dim(toFront(Lf, 0), toFront(Lf, H), `${H} mm`, 'given', 14),
    dim(toTop(0, 0), toTop(0, Wd), `${Wd} mm`, 'given', -12),
    transferBase, transferTop,
    devOutline, ...foldLines,
    dim(toDev(0, 0), toDev(stretchOut, 0), `2×(${Lf}+${Wd}) = ${stretchOut} mm`, 'result', 16),
    LABEL(toDev(stretchOut / 2, H), 'Development — four rectangles in sequence', -70, -8),
  ];

  return {
    steps,
    resultText: `Rectangular prism ${Lf}×${Wd} mm base, ${H} mm high — stretch-out = 2×(${Lf}+${Wd}) = ${stretchOut} mm, four rectangles ${Lf}×${H} / ${Wd}×${H} in sequence (K.C. John Example 15.1).`,
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
