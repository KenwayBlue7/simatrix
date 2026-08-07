// Conic-curve engine — the pure 2D sheet leaf (root DECISIONS.md ADR-139, the ADR-066
// pattern applied to this topic).
//
// Owns ALL of the plane-curve mathematics and the Canvas2D construction drawing for the
// Compare sheet. main.js's drawCompare() sizes the canvas, derives the fixed intrinsic
// frame from layoutFor()'s analytic bbox (the ADR-053 pattern), and hands this module a
// `view` ({ project, pxPerMm }) plus a resolved `palette` — this file reads NO DOM, no CSS
// tokens and no Three.js, and imports nothing, so every layout function stays testable
// from the console (the headless verification oracles, ADR-019).
//
// Four sheet MODES, one per teaching step, each reproducing the chapter's own figure:
//   'locus'        §6.3, Fig. 6.3  — the conic as a locus: e = PF/PQ, and how e < 1,
//                                    e = 1, e > 1 give the three curves.
//   'terms'        §6.2/§6.4/§6.8, Figs. 6.4 / 6.11 / 6.17 — the nomenclature diagram.
//   'eccentricity' §6.5.1/§6.7.1/§6.9.1, Figs. 6.5 / 6.12 / 6.18 — the eccentricity
//                                    (focus–directrix) construction, the one method that
//                                    draws all three curves.
//   'methods'      §6.5.2–5 / §6.7.2–5 / §6.9.2–4, Figs. 6.6–6.10, 6.13–6.16, 6.19–6.21 —
//                                    the remaining eleven constructions.
//
// SHEET SPACE: millimetres, x along the conic's axis, **y grows DOWN** (matching canvas),
// so main.js's project() needs no flip and "above the axis" is negative y. Millimetres,
// not world units, because the construction never enters the 3D scene and every figure in
// the chapter is quoted in mm (ADR-138).
//
// Output is a DISPLAY LIST, not immediate drawing: each layout returns `items` (typed
// primitives) plus the analytic `bbox` that locks the sheet scale. drawSheet() is the one
// renderer, so a new construction is a new layout function and never a new drawing path —
// and the line-weight vocabulary (thin construction vs. heavy curve outline) can never
// drift between the twelve methods.

// ============================================================================
// Line weights + sampling. Two weights only, the engineering convention
// DESIGN.md's Two-Weight Rule states for linework: the finished curve is heavy,
// everything that was needed to find it is thin.
// ============================================================================

const OUTLINE_PX = 2.25;
const THIN_PX = 1;
/** Engineering projection lines: thinner than construction, and lightened rather than recoloured
 *  so the sheet keeps ONE construction grey instead of gaining a second one (ADR-104). */
const HAIR_PX = 0.75;
const PROJECTION_ALPHA = 0.5;
/** Working lines sit a shade back from the given frame they are drawn inside (ADR-118). */
const AUXILIARY_ALPHA = 0.82;
/** The one short-dash pattern on this sheet. The chain line [10, 3, 2, 3] is the other, and
 *  between them they are the whole dashed vocabulary a BIS drawing needs. */
const SHORT_DASH = Object.freeze([4, 3]);
const MARK_PX = 1.6;

/** Samples along a drawn curve — smooth at any sheet scale without being wasteful. */
const CURVE_SAMPLES = 240;

/** Radius of a plotted construction point / focus dot, px (instrument chrome). */
const DOT_PX = 3;

/** How far an open curve (parabola, hyperbola) is drawn, as a multiple of the
 *  focus-to-directrix distance. The curves are infinite; the sheet is not. */
const OPEN_EXTENT = 3.4;

/** Divisions of a circle in the auxiliary-circle method — the textbook's "say 12". */
const CIRCLE_DIVISIONS = 12;

const TAU = Math.PI * 2;
const deg = (d) => (d * Math.PI) / 180;

// ============================================================================
// Tiny vector helpers (plain objects — no dependency, no allocation discipline
// beyond what the display list needs).
// ============================================================================

const pt = (x, y) => ({ x, y });
const add = (a, b) => pt(a.x + b.x, a.y + b.y);
const sub = (a, b) => pt(a.x - b.x, a.y - b.y);
const mul = (a, k) => pt(a.x * k, a.y * k);
const mid = (a, b) => pt((a.x + b.x) / 2, (a.y + b.y) / 2);
const lerp = (a, b, t) => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return pt(a.x / l, a.y / l); };
/** Left normal in y-down space (rotate −90°). */
const perp = (a) => pt(a.y, -a.x);

/** Intersection of line a1→a2 with line b1→b2 (null when parallel). */
function intersect(a1, a2, b1, b2) {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b1.x - a1.x) * s.y - (b1.y - a1.y) * s.x) / denom;
  return add(a1, mul(r, t));
}

/** Extend the segment a→b past both ends by `k` times its own length. */
function extend(a, b, k = 0.15) {
  const d = sub(b, a);
  return [sub(a, mul(d, k)), add(b, mul(d, k))];
}

// ============================================================================
// Display-list primitives. `role` selects the pen in drawSheet():
//   'construction' thin grey — the lines that were needed to find the curve
//   'outline'      heavy      — the finished conic
//   'axis'         thin grey chain — axes, directrices, asymptotes
//   'mark'         medium     — focus, directrix label anchors, tangent + normal, P
// ============================================================================

const line = (a, b, role = 'construction', dash = null) => ({ k: 'line', a, b, role, dash });
const poly = (pts, role = 'outline', closed = false) => ({ k: 'poly', pts, role, closed });
const circle = (c, r, role = 'construction', dash = null) => ({ k: 'circle', c, r, role, dash });
const arc = (c, r, a0, a1, role = 'construction') => ({ k: 'arc', c, r, a0, a1, role });
const dot = (p, role = 'mark') => ({ k: 'dot', p, role });
const label = (p, text, dx = 6, dy = -6, role = 'mark') => ({ k: 'label', p, text, dx, dy, role });

/**
 * Mark a caption as one that NAMES the section — "Circle · e = 0 · no directrix", "Isosceles
 * triangle · not a curve". Three of §6.1's six cuts are not plane conics, and their sheets say
 * so in words, which is right in the taught half and wrong in Step 6, where naming the section
 * IS the question being asked (ADR-117). `drawSheet`'s `anonymous` option drops exactly these
 * and leaves everything measured — the radius, the base, the generator — in place.
 */
const naming = (it) => ({ ...it, naming: true });

// ============================================================================
// The conic model — focus, directrix and eccentricity (§6.3).
//
// With the directrix on x = 0, the axis on y = 0 and the focus at (fa, 0), the
// locus PF = e·PQ is the focal polar r(θ) = e·fa / (1 + e·cos θ), measured from
// the focus with θ = 0 pointing AWAY from the directrix. Every curve, vertex,
// centre, latus rectum and asymptote below falls out of that one equation, so
// the three curves are never three separate code paths.
// ============================================================================

/**
 * Resolve the whole family of a conic's named quantities from (e, fa).
 * @param {number} e   Eccentricity (> 0).
 * @param {number} fa  Focus-to-directrix distance, mm.
 */
export function conicModel(e, fa) {
  const focus = pt(fa, 0);
  const semiLatus = e * fa;              // l = a(1 − e²) = e·fa for every conic
  const xV = fa / (1 + e);               // near vertex (§6.5 Example 6.1 step 2)
  const parabola = Math.abs(e - 1) <= 1e-6;

  const model = {
    e, fa, focus, semiLatus, parabola,
    vertex: pt(xV, 0),
    directrixX: 0,
    /** θ beyond which the curve has escaped the sheet (or does not exist). */
    thetaMax: parabola ? Math.acos(-1 + 1e-6) : (e > 1 ? Math.acos(-1 / e) : Math.PI),
  };

  if (!parabola) {
    const xC = fa / (1 - e * e);                     // centre (negative for e > 1)
    const a = Math.abs((fa * e) / (1 - e * e));      // semi transverse / major axis
    const b = a * Math.sqrt(Math.abs(1 - e * e));    // semi conjugate / minor axis
    Object.assign(model, {
      centre: pt(xC, 0),
      a,
      b,
      c: a * e,
      vertex2: pt(fa / (1 - e), 0),                  // far vertex / other branch's vertex
      focus2: pt(2 * xC - fa, 0),
      directrix2X: 2 * xC,
      central: true,                                 // §6.4: "central conic"
    });
  } else {
    Object.assign(model, { central: false, a: null, b: null });
  }
  return model;
}

/** Radius from the focus at polar angle θ (Infinity where the curve escapes). */
function radiusAt(model, theta) {
  const denom = 1 + model.e * Math.cos(theta);
  return denom <= 1e-6 ? Infinity : model.semiLatus / denom;
}

/**
 * The curve point at polar angle θ. θ = 0 aims from the focus BACK TOWARDS the directrix,
 * so it lands on the near vertex V at x = fa/(1 + e) — the vertex Example 6.1 step 2
 * locates by dividing FA in the ratio. (Aiming θ = 0 the other way would put the vertex
 * on the far side and make PF = e·PQ fail for every point.)
 */
function pointAtTheta(model, theta) {
  const r = radiusAt(model, theta);
  return add(model.focus, pt(-r * Math.cos(theta), r * Math.sin(theta)));
}

/**
 * Tangent DIRECTION at polar angle θ — the analytic derivative of the focal polar,
 * so the tangent and the normal are exact rather than a finite difference of the
 * sampled polyline.
 */
function tangentAtTheta(model, theta) {
  const { e, semiLatus: l } = model;
  const denom = 1 + e * Math.cos(theta);
  const r = l / denom;
  const dr = (l * e * Math.sin(theta)) / (denom * denom);
  // d/dθ of F + r·(−cos θ, sin θ) — the same sign convention pointAtTheta uses.
  return norm(pt(
    -dr * Math.cos(theta) + r * Math.sin(theta),
    dr * Math.sin(theta) + r * Math.cos(theta),
  ));
}

/**
 * Sample the conic as one polyline. Closed for the ellipse; for the parabola and
 * the hyperbola the sweep stops at OPEN_EXTENT·fa from the focus, since the curve
 * itself runs to infinity (§6.1: "conic surface is supposed to extend to infinity").
 */
export function conicPolyline(model, samples = CURVE_SAMPLES) {
  const limit = OPEN_EXTENT * model.fa;
  const span = model.e < 1 - 1e-9
    ? Math.PI
    : Math.min(model.thetaMax * 0.999, thetaForRadius(model, limit));
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const theta = -span + (2 * span * i) / samples;
    const r = radiusAt(model, theta);
    if (!Number.isFinite(r) || r > limit * 1.25) continue;
    pts.push(pointAtTheta(model, theta));
  }
  return pts;
}

/** The θ at which the focal radius reaches `r` (the sweep clamp for open curves). */
function thetaForRadius(model, r) {
  const cos = (model.semiLatus / r - 1) / model.e;
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/**
 * The marked point P at parameter t ∈ [0, 1] — the point every worked example draws
 * its tangent and normal at. t sweeps the whole ellipse; on an open curve it sweeps
 * the drawn arc, so P can never sit off the sheet.
 */
export function pointOnConic(model, t) {
  const limit = OPEN_EXTENT * model.fa;
  const span = model.e < 1 - 1e-9
    ? Math.PI
    : Math.min(model.thetaMax * 0.999, thetaForRadius(model, limit));
  const theta = -span + 2 * span * Math.min(Math.max(t, 0), 1);
  return { theta, p: pointAtTheta(model, theta), tangent: tangentAtTheta(model, theta) };
}

/**
 * Tangent + normal at P, drawn the way every worked example draws them (Examples 6.1,
 * 6.7, 6.12 step 5): the tangent through P meets the DIRECTRIX at T, where FT is
 * perpendicular to FP — so the construction line FT is drawn too, not just the answer.
 * The normal NN is the perpendicular to the tangent at P.
 *
 * @returns {Array} display-list items.
 */
function tangentNormalItems(model, at) {
  const { p, tangent } = at;
  const items = [];
  const half = 0.9 * model.fa;
  const n = perp(tangent);

  // T — where the tangent meets the directrix (the pole of P on that line).
  const T = intersect(p, add(p, tangent), pt(0, -1), pt(0, 1));
  if (T) {
    items.push(line(model.focus, T, 'construction', [4, 3])); // FT ⊥ FP, the construction
    items.push(dot(T), label(T, 'T', -14, -6));
  }

  const [t0, t1] = extend(sub(p, mul(tangent, half)), add(p, mul(tangent, half)), 0);
  items.push(line(t0, t1, 'mark'));
  items.push(label(t1, 'Tangent', 6, -6));

  items.push(line(sub(p, mul(n, half * 0.7)), add(p, mul(n, half * 0.7)), 'mark'));
  items.push(label(add(p, mul(n, half * 0.7)), 'Normal', 6, 12));

  items.push(dot(p), label(p, 'P', 7, -7));
  return items;
}

// ============================================================================
// Shared furniture: the axis, the directrix, the focus — drawn identically in
// every mode so the learner reads the same three references on every sheet.
// ============================================================================

function frameItems(model, { axisFrom, axisTo, span, showVertex = true, axisLabel = true, reveal = 9 }) {
  // `reveal` lets a staged construction bring the three references in one at a time — the axis,
  // then the fixed line, then the fixed point — instead of starting with all three already
  // drawn, which is the single hardest frame for a beginner to read (ADR-099).
  const items = [
    line(pt(axisFrom, 0), pt(axisTo, 0), 'axis', [10, 3, 2, 3]),
  ];
  if (reveal >= 1) {
    items.push(line(pt(0, -span), pt(0, span), 'axis'));
    items.push(label(pt(0, span), 'Directrix', 6, 14, 'axis'));
  }
  if (reveal >= 2) {
    items.push(dot(model.focus));
    items.push(label(model.focus, 'Focus', 8, 16));
  }
  // Suppressed on the terminology sheet of a central conic, where the major / transverse
  // axis label already names this same line and the two captions land on each other.
  if (axisLabel) items.push(label(pt(axisTo, 0), 'Axis', -2, -8, 'axis'));
  if (showVertex && reveal >= 2) {
    // Above the axis, where the focus pill (below it) can never reach — the two sit only
    // a vertex-to-focus distance apart on a tight eccentricity.
    items.push(dot(model.vertex), label(model.vertex, 'V', -4, -10));
  }
  return items;
}

// ============================================================================
// MODE 'locus' — §6.3, Fig. 6.3. The definition itself: P moves so that
// PF ÷ PQ is constant. e < 1 ellipse, e = 1 parabola, e > 1 hyperbola.
// ============================================================================

/**
 * Step 4's sheet. `conic.locusStage` says how much of the apparatus may be drawn, and the
 * order is the order the SOLID derived it in (ADR-095) — nothing appears on paper before the
 * 3-D proof has explained it:
 *
 *   0 the curve · 1 the focus · 2 the directrix · 3 P with PF and PQ · 4 the ratio
 *
 * Stage 0 is the curve of the learner's own cut and nothing else, so the first thing the sheet
 * shows is recognisably the slice they just watched being made.
 *
 * The frame is computed from the FULL figure at every stage, so the drawing does not jump
 * as pieces arrive — the same trick the construction playback uses.
 */
function locusLayout(conic) {
  const model = conicModel(conic.e, conic.fa);
  const at = pointOnConic(model, conic.pointT);
  const span = 1.25 * curveHalfHeight(model);
  const stage = conic.locusStage ?? LOCUS_LAST;
  const items = [];

  // The comparison figure: all three curves off ONE directrix and ONE focus (Fig. 6.3).
  if (conic.showAll) {
    for (const [e, name] of [[2 / 3, 'Ellipse, e < 1'], [1, 'Parabola, e = 1'], [3 / 2, 'Hyperbola, e > 1']]) {
      const m = conicModel(e, conic.fa);
      const pts = conicPolyline(m, 160);
      items.push(poly(pts, 'construction'));
      const tip = pts.reduce((best, q) => (q.y > best.y ? q : best), pts[0]);
      items.push(label(tip, name, 6, 14, 'construction'));
    }
  }

  // The axis is part of reading ANY of it; the directrix and the focus each wait their turn.
  items.push(line(pt(-0.6 * conic.fa, 0), pt(axisEnd(model), 0), 'axis', [10, 3, 2, 3]));
  items.push(label(pt(axisEnd(model), 0), 'Axis', -2, -8, 'axis'));
  // The FOCUS first: the proof found it first, on the solid, where the ball touched the cut.
  // Ringed as well as dotted, and captioned with the chapter's own letter, so a learner reading
  // "measure PF" can find F without hunting (ADR-097).
  if (stage >= 1) {
    items.push(dot(model.focus));
    items.push(circle(model.focus, 0.055 * conic.fa, 'mark'));
    items.push(label(model.focus, 'Focus F', 10, 18));
    items.push(dot(model.vertex), label(model.vertex, 'Vertex V', -6, -10));
  }
  // …then the directrix, which the proof produced from two planes crossing.
  if (stage >= 2) {
    items.push(line(pt(0, -span), pt(0, span), 'axis'));
    items.push(label(pt(0, span), 'Directrix', 6, 14, 'axis'));
  }

  items.push(poly(conicPolyline(model), 'outline'));

  // The ratio, drawn: PF to the focus, PQ perpendicular to the directrix. The two
  // measurements are labelled on OPPOSITE sides of their own segments, and the ratio is
  // parked above the curve, so nothing lands on the focus pill or on the vertex.
  if (stage >= 3) {
    const Q = pt(0, at.p.y);
    items.push(line(at.p, model.focus, 'mark'));
    items.push(line(at.p, Q, 'mark', SHORT_DASH));
    items.push(dot(Q), label(Q, 'Q', -18, -8));
    items.push(dot(at.p), label(at.p, 'P', 9, -9));
    const pf = len(sub(at.p, model.focus));
    const pq = Math.abs(at.p.x);
    const above = at.p.y <= 0 ? -1 : 1; // keep each label on the side P is already on
    items.push(label(mid(at.p, model.focus), `PF = ${pf.toFixed(1)}`, 6, above * 16));
    items.push(label(mid(at.p, Q), `PQ = ${pq.toFixed(1)}`, -14, above * -10));
    if (stage >= 4) {
      items.push(label(pt(model.focus.x, -span * 0.86),
        `e = PF / PQ = ${(pq > 0.01 ? pf / pq : conic.e).toFixed(3)}`, -60, 0));
    }
  }

  // Frame from the DRAWN CURVE plus the directrix, and from the whole figure rather than the
  // revealed part, so the drawing holds still while the pieces arrive. Not from axisEnd():
  // as e approaches 1 the axis runs away to keep the far vertex in view, and the curve the
  // learner is looking at collapses to a few millimetres in a card of empty paper — which
  // also drops it below the labelling threshold and silently strips its captions.
  const drawn = conicPolyline(model);
  let minX = 0; let maxX = 0; let maxY = 1; // x = 0 is the directrix, always in frame
  for (const q of drawn) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (Math.abs(q.y) > maxY) maxY = Math.abs(q.y);
  }
  // The directrix is drawn a little taller than the curve and simply runs off the sheet if
  // the frame is tighter — a directrix is an unbounded line, and letting its length drive
  // the scale is what shrank the figure it is supposed to be measured against.
  const pad = 0.08 * Math.max(maxX - minX, 2 * maxY);
  return finish('locus', items, model, null,
    { minX: minX - pad, maxX: maxX + pad, minY: -maxY - pad, maxY: maxY + pad });
}

/** The fully revealed locus figure. */
const LOCUS_LAST = 4;

/**
 * Half-height of the drawn curve — the vertical extent the directrix and the axis marks
 * should be sized against. Derived from the curve's own samples (a pure function of e and
 * FA, recomputed identically every call), so the sheet frames the CONSTRUCTION rather than
 * an arbitrarily long reference line: sizing the directrix at a fixed multiple of FA used
 * to leave a flat ellipse floating in three times its own height of empty paper.
 */
function curveHalfHeight(model) {
  let half = 0;
  for (const p of conicPolyline(model, 96)) half = Math.max(half, Math.abs(p.y));
  return Math.max(half, 0.35 * model.fa);
}

/** How far along the axis a mode's chain line runs — past the far vertex, or past
 *  the drawn sweep of an open curve. */
function axisEnd(model) {
  if (model.e < 1 - 1e-9) return model.vertex2.x + 0.35 * model.fa;
  return OPEN_EXTENT * model.fa * 0.85;
}

// ============================================================================
// MODE 'terms' — §6.2 + §6.4 / §6.8, Figs. 6.4, 6.11, 6.17. Every term the
// chapter defines, drawn on the curve it belongs to.
// ============================================================================

function termsLayout(conic) {
  // The terminology diagram always shows the chosen curve, so the eccentricity is
  // pinned into that curve's own band rather than following the Step-3 slider off it.
  const e = conic.curve === 'Ellipse' ? Math.min(conic.e, 0.9)
    : conic.curve === 'Parabola' ? 1
      : Math.max(conic.e, 1.1);
  const model = conicModel(e, conic.fa);
  const at = pointOnConic(model, conic.pointT);
  const span = 1.3 * curveHalfHeight(model);
  const items = frameItems(model, {
    axisFrom: -0.7 * conic.fa,
    axisTo: axisEnd(model),
    span,
    axisLabel: !model.central, // the parabola's axis has no major/transverse label of its own
  });

  items.push(poly(conicPolyline(model), 'outline'));

  // --- Terms every conic shares (§6.2) -------------------------------------------
  // Latus rectum: the double ordinate through the focus (semi = e·fa).
  const lrTop = pt(model.focus.x, -model.semiLatus);
  const lrBot = pt(model.focus.x, model.semiLatus);
  items.push(line(lrTop, lrBot, 'mark'));
  items.push(label(lrTop, 'Latus rectum', 6, -8));

  // Ordinate MP (the perpendicular from P to the axis) and the double ordinate EG.
  const foot = pt(at.p.x, 0);
  items.push(line(at.p, foot, 'construction'));
  items.push(label(mid(at.p, foot), 'Ordinate', 6, 0, 'construction'));
  const mirror = pt(at.p.x, -at.p.y);
  items.push(line(at.p, mirror, 'construction', SHORT_DASH));
  items.push(label(mirror, 'Double ordinate', 6, -6, 'construction'));

  // Abscissa — vertex to the ordinate's foot on the axis (§6.2 item 12).
  items.push(line(model.vertex, foot, 'construction'));
  items.push(label(mid(model.vertex, foot), 'Abscissa', -14, 30, 'construction'));

  // A chord and a focal chord (§6.2 items 7–8).
  const cA = pointOnConic(model, 0.18).p;
  const cB = pointOnConic(model, 0.42).p;
  items.push(line(cA, cB, 'construction'));
  items.push(label(mid(cA, cB), 'Chord', -30, -8, 'construction'));
  const opposite = pointAtTheta(model, at.theta + Math.PI);
  if (Number.isFinite(opposite.x) && Math.abs(opposite.x) < 8 * conic.fa) {
    items.push(line(at.p, opposite, 'construction', SHORT_DASH));
    items.push(label(opposite, 'Focal chord', 6, 14, 'construction'));
  }

  // --- Per-curve terms ------------------------------------------------------------
  if (conic.curve === 'Ellipse') {
    const { centre, a, b } = model;
    // §6.4: an ellipse "cuts the axis of the conic at two points, [so] it is called a CENTRAL
    // conic" — the property that gives it a centre, two foci and two directrices. The word
    // lives on the centre's own caption, where it can be read off the thing it describes.
    items.push(dot(centre), label(centre, 'Centre C', -22, 18));
    items.push(line(pt(centre.x - a, 0), pt(centre.x + a, 0), 'mark'));
    items.push(label(pt(centre.x + a, 0), 'Major axis', -46, -8));
    items.push(line(pt(centre.x, -b), pt(centre.x, b), 'mark'));
    items.push(label(pt(centre.x, -b), 'Minor axis', 6, -8));
    items.push(dot(model.focus2), label(model.focus2, 'Focus', 7, 14));
    items.push(dot(model.vertex2), label(model.vertex2, "V'", 6, 16));
    items.push(line(pt(model.directrix2X, -span), pt(model.directrix2X, span), 'axis'));
    items.push(label(pt(model.directrix2X, span), 'Directrix', -62, 14, 'axis'));
    // Auxiliary circles (§6.4 item 3) — described on the major and minor axes as diameters,
    // and named, because a circle drawn with no caption is a term the learner cannot look up.
    // Their diameters are §6.4's own major diameter and minor diameter (items 4 and 5).
    items.push(circle(centre, a, 'construction', SHORT_DASH));
    items.push(label(pt(centre.x, centre.y - a), 'Auxiliary circle · major diameter', -84, -8, 'construction'));
    items.push(circle(centre, b, 'construction', SHORT_DASH));
    items.push(label(pt(centre.x, centre.y + b), 'Auxiliary circle · minor diameter', -90, 18, 'construction'));

    // Conjugate diameters (§6.4 item 8) — "two lines intersecting each other at the centre of
    // the ellipse such that each is parallel to the tangents drawn at the extremities of the
    // other". Drawn as the pair at parameter t and t + 90°, which is exactly that condition,
    // and the pair the parallelogram construction is GIVEN in Example 6.4.
    const tc = Math.PI / 5;
    const cd1 = pt(a * Math.cos(tc), b * Math.sin(tc));
    const cd2 = pt(-a * Math.sin(tc), b * Math.cos(tc));
    for (const d of [cd1, cd2]) {
      items.push(line(sub(centre, d), add(centre, d), 'construction', SHORT_DASH));
    }
    items.push(label(add(centre, cd2), 'Conjugate diameters', -46, -8, 'construction'));

  } else if (conic.curve === 'Parabola') {
    // Sub-tangent and sub-normal (§6.6 properties 4 and 5): OM is bisected by the
    // vertex, and MN is constant and equal to twice the vertex-to-focus distance.
    const foot2 = pt(at.p.x, 0);
    const T = intersect(at.p, add(at.p, at.tangent), pt(-1, 0), pt(1, 0));
    if (T) {
      items.push(line(T, foot2, 'construction'));
      items.push(label(mid(T, foot2), 'Sub-tangent (bisected by V)', -20, 20, 'construction'));
    }
    const N = intersect(at.p, add(at.p, perp(at.tangent)), pt(-1, 0), pt(1, 0));
    if (N) {
      items.push(line(foot2, N, 'construction'));
      items.push(label(mid(foot2, N), `Sub-normal = 2·VF = ${model.fa.toFixed(0)}`, 6, 20, 'construction'));
    }
  } else {
    const { centre, a, b } = model;
    // §6.8: "each branch has the same eccentricity and hence hyperbola is also known as
    // CENTRAL conic" — the same property, named on the same kind of caption as the ellipse's.
    items.push(dot(centre), label(centre, 'Centre O', -22, 20));
    // The second branch — a hyperbola has two branches, two foci, two directrices.
    items.push(poly(mirrorAbout(conicPolyline(model), centre.x), 'outline'));
    items.push(line(pt(centre.x - a, 0), pt(centre.x + a, 0), 'mark'));
    items.push(label(pt(centre.x - a, 0), 'Transverse axis', -8, -8));
    items.push(line(pt(centre.x, -b), pt(centre.x, b), 'mark', SHORT_DASH));
    items.push(label(pt(centre.x, -b), 'Conjugate axis', -18, -8));
    items.push(dot(model.focus2), label(model.focus2, 'Focus', -18, 16));
    items.push(line(pt(model.directrix2X, -span), pt(model.directrix2X, span), 'axis'));
    items.push(label(pt(model.directrix2X, span), 'Directrix', -62, 14, 'axis'));
    // Asymptotes — tangents at infinity (§6.8 item 5); they intersect the auxiliary
    // circle on the directrix, which is why that circle is drawn with them.
    const reach = 1.9 * (a + b);
    for (const s of [-1, 1]) {
      const d = norm(pt(a, s * b));
      items.push(line(sub(centre, mul(d, reach)), add(centre, mul(d, reach)), 'axis', SHORT_DASH));
      items.push(label(add(centre, mul(d, reach)), 'Asymptote', -30, s > 0 ? 14 : -8, 'axis'));
    }
    items.push(circle(centre, a, 'construction', SHORT_DASH));
    items.push(label(pt(centre.x, centre.y - a), 'Auxiliary circle', -30, -8, 'construction'));
    // …and where the two meet: an asymptote y = ±(b/a)x cuts the auxiliary circle x² + y² = a²
    // at x = a² ÷ c, which is the directrix. §6.8 states it; here it is a point on the drawing.
    const xd = (a * a) / Math.hypot(a, b);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        items.push(dot(pt(centre.x + sx * xd, (sy * b * xd) / a), 'construction'));
      }
    }
    items.push(label(pt(centre.x + xd, (b * xd) / a),
      'The asymptotes cut the auxiliary circle ON the directrix', 8, -8, 'construction'));
  }

  // No tangent or normal here: this sheet is the NAMING figure, and the chapter draws the
  // tangent construction with the eccentricity method (Step 5, where its toggle lives).
  // Keeping them off is also what stops the ordinate / chord / latus-rectum captions from
  // stacking on two more full-length lines through the middle of the curve.
  items.push(dot(at.p), label(at.p, 'P', 8, -8));

  return finish('terms', items, model);
}

/** Mirror a polyline about the vertical line x = xc (the hyperbola's second branch). */
function mirrorAbout(pts, xc) {
  return pts.map((p) => pt(2 * xc - p.x, p.y));
}

// ============================================================================
// MODE 'eccentricity' — Examples 6.1 / 6.7 / 6.12 (Figs. 6.5, 6.12, 6.18).
// The one construction that draws all three curves from the same five steps:
// directrix + axis + focus, divide FA in the ratio, erect VE = VF, join AE as
// the eccentricity SCALE, then step out points 1, 2, 3 … with arcs from F.
// ============================================================================

/**
 * The construction, built in the chapter's own stages. `conic.buildStage` gates how much of
 * it is on the sheet, so Step 5 can play it through one stage at a time and the learner
 * watches the drawing happen instead of meeting it finished (ADR-141). An absent
 * `buildStage` draws everything, which is what the problem library and the oracles want.
 *
 * Stage 0 frame · 1 vertex · 2 scale · 3 points · 4 curve · 5 tangent (conicData's
 * BUILD_STAGES holds the matching copy).
 */
function eccentricityLayout(conic) {
  const model = conicModel(conic.e, conic.fa);
  const { fa, e } = conic;
  const ratio = rationalise(e);
  const span = 1.25 * curveHalfHeight(model);
  const stage = conic.buildStage ?? 7;
  // Where the CURRENT stage's linework starts. Everything before it is context and is drawn
  // back; everything from it on is what this stage just added (ADR-099).
  let freshFrom = 0;
  const startOfStage = (n) => { if (stage === n) freshFrom = items.length; };
  const items = frameItems(model, {
    axisFrom: -0.5 * fa,
    axisTo: axisEnd(model),
    span,
    showVertex: stage >= 3,
    reveal: stage,          // 0 axis · 1 + the fixed line · 2 + the fixed point
  });

  startOfStage(1);
  if (stage >= 1) items.push(label(pt(0, 0), 'A', -14, 18, 'axis'));

  // Stage 3 — divide AF into (p + q) equal parts and mark the vertex V at q of them.
  startOfStage(3);
  if (stage >= 3) {
    for (let i = 1; i < ratio.p + ratio.q; i++) {
      const x = (fa * i) / (ratio.p + ratio.q);
      items.push(line(pt(x, -4), pt(x, 4), 'construction'));
    }
  }

  // Stage 2 — VE ⊥ axis with VE = VF, joined to A and produced: the eccentricity scale,
  // whose ordinate at any x is exactly e·x, which is the radius each arc needs.
  const vf = fa - model.vertex.x;
  const E = pt(model.vertex.x, -vf);
  startOfStage(4);
  if (stage >= 4) {
    items.push(line(model.vertex, E, 'construction'));
    items.push(dot(E), label(E, 'E', -14, -6));
    const scaleEnd = pt(axisEnd(model), -e * axisEnd(model));
    items.push(line(pt(0, 0), scaleEnd, 'construction'));
    items.push(label(scaleEnd, 'Eccentricity scale', -30, -10, 'construction'));
  }

  // Stage 3 — points 1, 2, 3 … on the axis; a perpendicular through each; an arc from F
  // of radius (the scale's ordinate there) cutting it above and below.
  startOfStage(5);
  if (stage >= 5) {
    const last = pointsExtent(model);
    const n = Math.max(2, Math.round(conic.points));
    for (let i = 1; i <= n; i++) {
      const x = model.vertex.x + ((last - model.vertex.x) * i) / n;
      const r = e * x;                                   // = the AE scale's ordinate at x
      const dy = Math.sqrt(Math.max(r * r - (x - fa) * (x - fa), 0));
      if (dy < 1e-6) continue;
      items.push(line(pt(x, -dy - 10), pt(x, dy + 10), 'construction'));
      items.push(line(pt(x, 0), pt(x, -r), 'construction', SHORT_DASH)); // the scale ordinate
      const a0 = Math.atan2(-dy, x - fa);
      items.push(arc(model.focus, r, a0 - 0.28, a0 + 0.28, 'construction'));
      items.push(arc(model.focus, r, -a0 - 0.28, -a0 + 0.28, 'construction'));
      items.push(dot(pt(x, -dy), 'construction'), dot(pt(x, dy), 'construction'));
      items.push(label(pt(x, 0), String(i), -3, 16, 'construction'));
    }
  }

  // Stage 6 — the smooth curve through V, P₁, P₂, P₃ …
  startOfStage(6);
  if (stage >= 6) items.push(poly(conicPolyline(model), 'outline'));

  // Stage 7 — the tangent and normal at P.
  startOfStage(7);
  if (stage >= 7 && conic.showTangent) {
    items.push(...tangentNormalItems(model, pointOnConic(model, conic.pointT)));
  }

  // The frame is pinned to the FINISHED construction's own extents, not to what this
  // stage happens to have drawn — otherwise the sheet would rescale on every stage of the
  // playback and the drawing would appear to swim.
  const end = axisEnd(model);
  const reach = Math.max(span, e * end, curveHalfHeight(model));
  // "Draw the curve and MEASURE ITS MAJOR AND MINOR AXES" (exercise 1) — and the same two
  // quantities are what a hyperbola's transverse and conjugate axes are.
  const results = [
    measure('Vertex V, from the directrix', model.vertex.x, 'mm', 'VA'),
    measure('Vertex V, from the focus', fa - model.vertex.x, 'mm', 'VF'),
    ...(model.central
      ? (e < 1
        ? ellipseResults(model.a, model.b).slice(0, 3)
        : hyperbolaResults(model.a, model.b).slice(0, 4))
      : [measure('Latus rectum', 2 * model.semiLatus, 'mm', 'the chord through F, square to the axis')]),
    measure('Eccentricity', e, '', `divides FA into ${ratio.p} + ${ratio.q}`),
  ];
  const out = finish('eccentricity', items, model, null,
    { minX: -0.5 * fa, maxX: end, minY: -reach, maxY: reach }, results);
  out.freshFrom = conic.buildStage === undefined ? 0 : freshFrom;
  return out;
}

/** How far along the axis the plotted points run: to the far vertex for an ellipse,
 *  to the drawn sweep for an open curve. */
function pointsExtent(model) {
  if (model.e < 1 - 1e-9) return model.vertex2.x - 0.04 * model.fa;
  return OPEN_EXTENT * model.fa * 0.7;
}

/**
 * The small whole-number ratio the chapter divides FA in ("as the eccentricity is 2/3,
 * divide FA into 2 + 3 = 5 equal parts"). Continued fractions with a denominator cap,
 * so a slider value always lands on a ratio a student could actually step out with
 * dividers.
 */
export function rationalise(e, maxDen = 9) {
  let best = { p: 1, q: 1, err: Infinity };
  for (let q = 1; q <= maxDen; q++) {
    const p = Math.max(1, Math.round(e * q));
    const err = Math.abs(p / q - e);
    if (err < best.err - 1e-12) best = { p, q, err };
  }
  return best;
}

// ============================================================================
// MODE 'methods' — the eight remaining constructions, §6.5.2–5 and §6.7.2–5. One
// builder each; all of them return the same display list, so the renderer never
// learns a method's name. §6.9's three are absent by syllabus scope (ADR-115).
// ============================================================================

/** Larger than any stage index: an absent `buildStage` draws the finished figure. */
const LAST_STAGE = 99;

const METHOD_BUILDERS = {
  'ellipse-concentric': ellipseConcentric,
  'ellipse-oblong': ellipseOblong,
  'ellipse-parallelogram': ellipseParallelogram,
  'ellipse-arcs': ellipseArcs,
  'ellipse-four-centre': ellipseFourCentre,
  'parabola-tangent': parabolaTangent,
  'parabola-rectangle': parabolaRectangle,
  'parabola-parallelogram': parabolaParallelogram,
  'parabola-offset': parabolaOffset,
};

function methodsLayout(conic) {
  const build = METHOD_BUILDERS[conic.method] ?? ellipseConcentric;
  const built = build(conic);
  return finish('methods', built.items, built.model ?? null, built.curvePts, null, built.results ?? []);
}

/** The named quantities of an ellipse from its two semi-axes — shared by the four ellipse
 *  constructions, which are given different data and all yield the same figure. */
function ellipseResults(a, b) {
  const [semiMajor, semiMinor] = a >= b ? [a, b] : [b, a];
  const c = Math.sqrt(Math.max(semiMajor * semiMajor - semiMinor * semiMinor, 0));
  return [
    measure('Major axis', 2 * semiMajor, 'mm', 'VV′'),
    measure('Minor axis', 2 * semiMinor, 'mm', 'the ends of the short axis'),
    measure('Each focus, from the centre', c, 'mm', 'F and F′'),
    measure('Eccentricity', semiMajor > 0 ? c / semiMajor : 0, '', 'VF ÷ VA'),
    measure('Latus rectum', semiMajor > 0 ? (2 * semiMinor * semiMinor) / semiMajor : 0, 'mm',
      'the chord through F, square to the axis'),
  ];
}

/** The named quantities of a parabola from its focal distance f = VF. */
function parabolaResults(f) {
  return [
    measure('Focus, from the vertex', f, 'mm', 'VF'),
    measure('Directrix, from the vertex', f, 'mm', 'the far side of V from F'),
    measure('Focus to directrix', 2 * f, 'mm', 'FA'),
    measure('Latus rectum', 4 * f, 'mm', 'the chord through F, square to the axis'),
    measure('Eccentricity', 1, '', 'always 1 for a parabola'),
  ];
}

/**
 * The focal distance of a parabola given in the OBLIQUE parametrisation the parallelogram
 * method produces: P(u) = V₀ + u·h + u²·k. The direction k is a diameter, not necessarily the
 * axis; the axis is the diameter through the point whose tangent is square to k, at
 * u* = −(h·k) ÷ 2|k|². Re-based there, h' = h + 2u*·k is perpendicular to k and the curve is
 * y = |k|·x² ÷ |h'|², so 4f = |h'|² ÷ |k|.
 */
function focalOfAffine(h, k) {
  const kk = h.x * k.x + h.y * k.y;
  const k2 = k.x * k.x + k.y * k.y;
  if (k2 < 1e-9) return 1;
  const u = -kk / (2 * k2);
  const hx = h.x + 2 * u * k.x;
  const hy = h.y + 2 * u * k.y;
  return (hx * hx + hy * hy) / (4 * Math.sqrt(k2));
}

/** The named quantities of a hyperbola from its semi-transverse a and semi-conjugate b. */
function hyperbolaResults(a, b) {
  const c = Math.hypot(a, b);
  const asymptoteDeg = (2 * Math.atan2(b, a) * 180) / Math.PI;
  const out = [
    measure('Transverse axis', 2 * a, 'mm', 'V₁V₂'),
    measure('Conjugate axis', 2 * b, 'mm', 'C₁C₂'),
    measure('Angle between the asymptotes', (2 * Math.atan2(b, a) * 180) / Math.PI, '°',
      'at the centre O'),
    measure('Each focus, from the centre', c, 'mm', 'F₁ and F₂'),
    measure('Each directrix, from the centre', a > 0 ? (a * a) / c : 0, 'mm', 'D₁ and D₂'),
    measure('Eccentricity', a > 0 ? c / a : 0, '', 'V₁F₁ ÷ V₁A'),
  ];
  // §6.8: "a rectangular or equilateral hyperbola" is the one whose asymptotes are at right
  // angles — which happens exactly at e = √2, and is worth saying when the learner dials it.
  if (Math.abs(asymptoteDeg - 90) <= 0.5) {
    out.push(measure('Rectangular hyperbola', 1, '', 'the asymptotes are at right angles, e = √2'));
  }
  return out;
}

/** Ellipse polyline about a centre from its semi-axes (y-down, so no sign care needed). */
function ellipsePts(centre, a, b, samples = CURVE_SAMPLES) {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = (i / samples) * TAU;
    return pt(centre.x + a * Math.cos(t), centre.y + b * Math.sin(t));
  });
}

// ---- Example 6.2, Fig. 6.6 — concentric (auxiliary) circles -------------------
/**
 * Roughly how wide a caption will be, in px, without a canvas to measure it on. The layouts are
 * pure data and never see a 2-D context, so an author-time offset can only estimate; `drawLabels`
 * measures for real and nudges along its ladder if the guess crowds something.
 */
function textWidthGuess(text) {
  return text.length * 6.2 + 2;
}

/**
 * Place a caption just OUTSIDE a circle, pushed along its own radius — the way a draughtsman
 * writes the division numbers round a circle so they never sit on the linework they name.
 *
 * Captions are drawn LEFT-aligned from `dx` with their baseline at `dy`, so a caption on the
 * left of the circle has to be pulled back by its own width or it reads as belonging to the
 * inside of the figure.
 *
 * @param {{x:number,y:number}} p  The point being named, in sheet mm.
 * @param {string} text
 * @param {number} t     The point's angle about the centre, radians (y DOWN, as everywhere here).
 * @param {number} gap   Clearance from the point, px.
 */
function radialLabel(p, text, t, gap) {
  const cx = Math.cos(t);
  const cy = Math.sin(t);
  const w = textWidthGuess(text) * 1.2;   // set a size up, so allow for it
  // Left of the circle: pull back the full width. Near the top or bottom: centre it.
  const pull = cx < -0.25 ? w : Math.abs(cx) <= 0.25 ? w / 2 : 0;
  return { ...label(p, text, cx * gap - pull, cy * gap + 4, 'construction'), emphasis: 'division' };
}

/**
 * Place a caption clear of a plotted point, offset away from the centre of the sheet. Role
 * `plot`, so the name is drawn in the curve's own colour — these points ARE the curve.
 */
function awayLabel(p, text, gap) {
  const sx = p.x >= 0 ? 1 : -1;
  const sy = p.y >= 0 ? 1 : -1;
  const pull = sx < 0 ? textWidthGuess(text) : 0;
  return label(p, text, sx * gap - pull, sy * gap + 4, 'plot');
}

function ellipseConcentric(conic) {
  const a = conic.dim1 / 2;
  const b = conic.dim2 / 2;
  const O = pt(0, 0);
  // Staged the way it is drawn (ADR-098). An absent buildStage is the finished figure, which is
  // what the Problem Library and the oracles read.
  const stage = conic.buildStage ?? LAST_STAGE;
  // Numbering lives from the divisions it labels until the curve is joined, so the finished
  // drawing is clean (ADR-098). No playback running = the finished drawing.
  const numbers = conic.buildStage !== undefined && stage >= 3 && stage < 6;
  const items = [
    line(pt(-a - 8, 0), pt(a + 8, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b - 8), pt(0, b + 8), 'axis', [10, 3, 2, 3]),
    label(pt(a, 0), 'B', 8, 4, 'axis'),
    label(pt(-a, 0), 'A', -14, 4, 'axis'),
    label(pt(0, -b), 'C', -4, -8, 'axis'),
    label(pt(0, b), 'D', -4, 16, 'axis'),
    dot(O), label(O, 'O', -12, 14),
  ];
  if (stage >= 1) items.push(circle(O, a, 'construction'));   // the major (outer) circle
  if (stage >= 2) items.push(circle(O, b, 'construction'));   // the minor (inner) circle

  // The projected points are named only on the stage that PRODUCES them, so the finished
  // drawing stays clean the same way the division numbering does (ADR-101).
  const pNames = conic.buildStage !== undefined && stage === 5;

  // Divide the circles into 12 equal parts; through each outer point drop a parallel
  // to CD and through the matching inner point a parallel to AB — they meet on the curve.
  if (stage >= 3) {
    for (let k = 0; k < CIRCLE_DIVISIONS; k++) {
      const t = (k / CIRCLE_DIVISIONS) * TAU;
      const outer = pt(a * Math.cos(t), a * Math.sin(t));
      const inner = pt(b * Math.cos(t), b * Math.sin(t));
      const q = pt(outer.x, inner.y);
      items.push(line(O, outer, 'construction'));             // the radial division
      if (stage >= 4) {
        items.push(line(outer, q, 'construction'));           // parallel to CD
        items.push(line(inner, q, 'construction'));           // parallel to AB
      }
      if (stage >= 5) items.push(dot(q, 'plot'));             // the point it produces
      // BOTH circles are numbered, k and k′ at the same radial position, because the whole
      // method is the correspondence between them: 4 and 4′ are what produce P4 (ADR-101).
      // Each sits just OUTSIDE its own circle, pushed along its own radius.
      if (numbers) {
        items.push(radialLabel(outer, String(k + 1), t, 9));
        items.push(radialLabel(inner, `${k + 1}'`, t, 9));
      }
      if (pNames) items.push(awayLabel(q, `P${k + 1}`, 7));
    }
  }

  const curvePts = ellipsePts(O, a, b);
  if (stage >= 6) {
    items.push(poly(curvePts, 'outline', true));
    pushAxisMarks(items, O, a, b);
    if (conic.showTangent) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  }
  return { items, curvePts, results: ellipseResults(a, b) };
}

/** Foci + axis labels shared by every ellipse construction (§6.4 terminology). */
function pushAxisMarks(items, O, a, b) {
  const c = Math.sqrt(Math.max(a * a - b * b, 0));
  for (const s of [-1, 1]) {
    const F = pt(O.x + s * c, O.y);
    items.push(dot(F), label(F, s < 0 ? 'F' : "F'", -6, 16));
  }
}

/** Tangent + normal at a point on an axis-aligned ellipse: the tangent bisects the
 *  exterior angle of the focal lines (§6.4 item 6), which the analytic tangent gives
 *  exactly; the normal is its perpendicular (§6.4 item 7). */
function ellipseTangentItems(O, a, b, t) {
  const th = t * TAU;
  const p = pt(O.x + a * Math.cos(th), O.y + b * Math.sin(th));
  const tan = norm(pt(-a * Math.sin(th), b * Math.cos(th)));
  const n = perp(tan);
  const reach = 0.55 * Math.max(a, b);
  const c = Math.sqrt(Math.max(a * a - b * b, 0));
  return [
    line(pt(O.x - c, O.y), p, 'construction', [4, 3]),
    line(pt(O.x + c, O.y), p, 'construction', [4, 3]),
    line(sub(p, mul(tan, reach)), add(p, mul(tan, reach)), 'mark'),
    line(sub(p, mul(n, reach * 0.6)), add(p, mul(n, reach * 0.6)), 'mark'),
    dot(p),
    label(p, 'P', 8, -8),
    label(add(p, mul(tan, reach)), 'Tangent', 6, -6),
    label(add(p, mul(n, reach * 0.6)), 'Normal', 6, 12),
  ];
}

// ---- Example 6.3, Fig. 6.7 — rectangular (oblong) method ----------------------
/**
 * The oblong method's stage plan (ADR-116), named once so the layout and its narration cannot
 * drift apart. Both of the construction's families are taught the same way — the part that has
 * to be understood one line per press, the part that is only its reflection all at once:
 *
 *   0–2   the axes, the rectangle, the divisions
 *   3–5   the rays from C, one numbered point per press (the UPPER fan, both sides)
 *   6     the same fan mirrored down about the major axis, whole
 *   7–9   the connecting lines of the LEFT half, one numbered point per press
 *   10    the right half mirrored about the minor axis, whole
 *   11    the curve
 *
 * Twelve in all, and ELLIPSE_OBLONG_STAGES is exactly that long.
 */
const OBLONG_DIVISIONS = 4;                                        // the textbook's "say 4"
const OBLONG_FAN_FROM = 3;                                         // first ray-from-C stage
const OBLONG_FAN_MIRROR = OBLONG_FAN_FROM + (OBLONG_DIVISIONS - 1);        // 6
const OBLONG_JOIN_FROM = OBLONG_FAN_MIRROR + 1;                    // 7 — first connecting line
const OBLONG_JOIN_MIRROR = OBLONG_JOIN_FROM + (OBLONG_DIVISIONS - 1);      // 10
const OBLONG_CURVE = OBLONG_JOIN_MIRROR + 1;                       // 11

function ellipseOblong(conic) {
  const a = conic.dim1 / 2;
  const b = conic.dim2 / 2;
  const O = pt(0, 0);
  const n = OBLONG_DIVISIONS;
  const stage = conic.buildStage ?? LAST_STAGE;
  const numbers = conic.buildStage !== undefined && stage >= 2 && stage < OBLONG_CURVE;
  const items = [
    line(pt(-a, 0), pt(a, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b), pt(0, b), 'axis', [10, 3, 2, 3]),
    label(pt(-a, 0), 'A', -14, 4, 'axis'),
    label(pt(a, 0), 'B', 8, 4, 'axis'),
    dot(O), label(O, 'O', -12, 14),
  ];
  if (stage >= 1) {
    items.push(poly([pt(-a, -b), pt(a, -b), pt(a, b), pt(-a, b)], 'construction', true));
    items.push(label(pt(-a, -b), 'E', -12, -6, 'construction'));
    items.push(label(pt(a, -b), 'G', 8, -6, 'construction'));
    items.push(label(pt(a, b), 'K', 8, 14, 'construction'));
    items.push(label(pt(-a, b), 'L', -12, 14, 'construction'));
  }

  const C = pt(0, -b); // top of the minor axis
  const D = pt(0, b);  // bottom of the minor axis
  // C and D are named in the stage text ("join C to each numbered point"), so they are named on
  // the drawing too (ADR-111). Same styling as A, B and the rectangle's own corners.
  items.push(label(C, 'C', -4, -8, 'axis'), label(D, 'D', -4, 16, 'axis'));

  // Two families, each taught the same way (ADR-116): the part that has to be understood
  // arrives one numbered point per press, the part that is only its reflection arrives whole.
  //
  //   the fan from C   one press per numbered point of the UPPER sides, then the lower half
  //                    (drawn from D) mirrored down about the major axis in one step
  //   the connections  one press per numbered point of the LEFT half, then the right half
  //                    mirrored about the minor axis in one step
  //
  // The stage index alone still says exactly what is on the paper, and each crossing still
  // lands with the connection that makes it rather than on a later sweep-up stage.
  const fanStage = (i) => OBLONG_FAN_FROM + (i - 1);
  const joinStage = (side, i) => (side < 0 ? OBLONG_JOIN_FROM + (i - 1) : OBLONG_JOIN_MIRROR);

  // The divisions are computed at EVERY stage and only their drawing is gated, so the
  // intersections a later stage needs are never a function of what an earlier one drew.
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const onEdge = pt(side * a, -b * f);            // divisions of the half height AE
      const below = pt(side * a, b * f);              // the same divisions, mirrored
      const onAxis = pt(side * a * (1 - f), 0);       // divisions of the half axis AO
      // The fan, then the SAME fan reflected — the figure is symmetrical about the major axis,
      // and a learner should watch that symmetry happen rather than be handed it (ADR-104).
      if (stage >= fanStage(i)) items.push(line(C, onEdge, 'construction'));
      if (stage >= OBLONG_FAN_MIRROR) items.push(line(D, below, 'construction'));

      // Each ray STOPS at the point it produces (ADR-111) — and it changes character where it
      // crosses the centre line (ADR-112). Solid while it is still in its own half; a thin
      // dashed projection line for the part carried on into the opposite half, which is the
      // drawing convention for exactly that. The break is AT the axis, so the axis division is
      // where the two segments meet.
      const q = intersect(C, onEdge, D, onAxis);
      const qm = q ? pt(q.x, -q.y) : null;
      // The crossings, in the SAME marker the concentric-circle method uses for the points it
      // plots: the curve's own colour, at full size (ADR-102). One press draws BOTH connections
      // through a numbered point — the one above the axis and the one below — because a single
      // division of AO is one idea, not two.
      if (stage >= joinStage(side, i)) {
        items.push(line(D, onAxis, 'construction'), line(C, onAxis, 'construction'));
        if (q) items.push(line(onAxis, q, 'projection', [4, 3]), dot(q, 'plot'));
        if (qm) items.push(line(onAxis, qm, 'projection', [4, 3]), dot(qm, 'plot'));
      }

      if (numbers) {
        items.push(label(onEdge, `${i}`, side < 0 ? -12 : 6, 0, 'construction'));
        // BOTH halves carry the numbering (ADR-111) — same text, same offsets, same styling.
        items.push(label(below, `${i}`, side < 0 ? -12 : 6, 0, 'construction'));
        items.push(label(onAxis, `${i}'`, -3, 16, 'construction'));
      }
    }
  }

  const curvePts = ellipsePts(O, a, b);
  if (stage >= OBLONG_CURVE) {
    items.push(poly(curvePts, 'outline', true));
    pushAxisMarks(items, O, a, b);
    if (conic.showTangent) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  }
  return { items, curvePts, results: ellipseResults(a, b) };
}

// ---- Example 6.4, Fig. 6.8 — parallelogram method (conjugate diameters) -------
function ellipseParallelogram(conic) {
  const ab = conic.dim1;      // conjugate diameter AB
  const cd = conic.dim2;      // conjugate diameter CD
  const ang = deg(conic.dim3 ?? 70);
  const O = pt(0, 0);
  const u = pt(ab / 2, 0);                                   // half AB, along x
  const v = pt((cd / 2) * Math.cos(ang), -(cd / 2) * Math.sin(ang)); // half CD, at the angle
  const A = sub(O, u), B = add(O, u), C = add(O, v), D = sub(O, v);

  const stage = conic.buildStage ?? LAST_STAGE;
  const numbers = conic.buildStage !== undefined && stage >= 2 && stage < 5;
  const items = [
    line(A, B, 'mark'), line(C, D, 'mark'),
    label(A, 'A', -14, 4), label(B, 'B', 8, 4),
    label(C, 'C', 4, -8), label(D, 'D', -6, 16),
    dot(O), label(O, 'O', -12, 16),
    label(mid(O, v), `${conic.dim3 ?? 70}°`, 10, 10, 'construction'),
  ];
  if (stage >= 1) {
    items.push(poly([add(A, v), add(B, v), add(B, mul(v, -1)), add(A, mul(v, -1))], 'construction', true));
  }

  // The rectangular method, run in the oblique frame: the affine map that sends the
  // circumscribing rectangle to this parallelogram sends the ellipse to the ellipse.
  const n = 4;
  for (let side = -1; side <= 1; side += 2) {
    const cor = side < 0 ? A : B;
    const top = side < 0 ? add(A, v) : add(B, v);
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const onEdge = lerp(cor, top, f);
      const onDia = lerp(cor, O, f);
      // Divisions are LABELLED, never dotted: a construction dot on this sheet means "a point
      // of the curve", and the oracle proves every one of them lies on it.
      if (numbers) {
        items.push(label(onEdge, String(i), 5, -3, 'construction'));
        items.push(label(onDia, String(i), -3, 15, 'construction'));
      }
      if (stage >= 3) {
        items.push(line(C, onEdge, 'construction'));
        items.push(line(D, onDia, 'construction'));
      }
      const q = intersect(C, onEdge, D, onDia);
      if (q && stage >= 4) items.push(dot(q, 'construction'));
    }
  }

  // The curve: the affine image of the unit circle under [u, v].
  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const t = (i / CURVE_SAMPLES) * TAU;
    return add(O, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
  });
  if (stage >= 5) items.push(poly(curvePts, 'outline', true));

  // The axes of the curve fall out of the conjugate pair (Example 6.4 steps 3–4:
  // the semicircle on OD cuts the ellipse at K, CK gives the minor axis direction).
  const axes = principalAxes(u, v);
  if (stage >= 5) {
    items.push(line(sub(O, mul(axes.major.dir, axes.major.len)), add(O, mul(axes.major.dir, axes.major.len)), 'axis', [10, 3, 2, 3]));
    items.push(line(sub(O, mul(axes.minor.dir, axes.minor.len)), add(O, mul(axes.minor.dir, axes.minor.len)), 'axis', [10, 3, 2, 3]));
    items.push(label(add(O, mul(axes.major.dir, axes.major.len)), 'Major axis', 6, -6, 'axis'));
    items.push(label(add(O, mul(axes.minor.dir, axes.minor.len)), 'Minor axis', 6, 14, 'axis'));
  }
  // "Draw the ellipse by parallelogram method and DETERMINE ITS AXES" (Example 6.4 / exercise
  // 4): the axes are the whole point of the construction, so they are read off, not implied.
  return { items, curvePts, results: ellipseResults(axes.major.len, axes.minor.len) };
}

/**
 * Principal axes of the ellipse P(t) = u·cos t + v·sin t (conjugate half-diameters
 * u, v). Rytz's construction in closed form: the extreme of |P|² over t.
 */
function principalAxes(u, v) {
  const A = u.x * u.x + u.y * u.y;
  const B = v.x * v.x + v.y * v.y;
  const C = 2 * (u.x * v.x + u.y * v.y);
  const t0 = 0.5 * Math.atan2(C, A - B);
  const p0 = add(mul(u, Math.cos(t0)), mul(v, Math.sin(t0)));
  const p1 = add(mul(u, Math.cos(t0 + Math.PI / 2)), mul(v, Math.sin(t0 + Math.PI / 2)));
  const [big, small] = len(p0) >= len(p1) ? [p0, p1] : [p1, p0];
  return {
    major: { dir: norm(big), len: len(big) },
    minor: { dir: norm(small), len: len(small) },
  };
}

// ---- Examples 6.5 / 6.6, Figs. 6.9 / 6.10 — intersecting arcs (foci) ----------
function ellipseArcs(conic) {
  const c = conic.dim1 / 2;              // half the distance between the foci
  const a = conic.dim2 / 2;              // half the constant sum = semi major axis
  const b = Math.sqrt(Math.max(a * a - c * c, 1));
  const O = pt(0, 0);
  const F = pt(-c, 0), F2 = pt(c, 0);
  const A = pt(-a, 0), B = pt(a, 0);

  const stage = conic.buildStage ?? LAST_STAGE;
  const items = [
    line(pt(-a - 10, 0), pt(a + 10, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b - 10), pt(0, b + 10), 'axis', [10, 3, 2, 3]),
    dot(F), label(F, 'F', -6, 16),
    dot(F2), label(F2, "F'", 6, 16),
    label(mid(F, F2), `${conic.dim1.toFixed(0)}`, -8, 18, 'construction'),
  ];
  if (stage >= 1) {
    items.push(label(A, 'A', -14, 4, 'axis'), label(B, 'B', 8, 4, 'axis'));
    items.push(label(pt(0, -b), `${conic.dim2.toFixed(0)} = P₁F + P₁F'`, 8, -8, 'construction'));
  }

  // Mark points 1, 2, 3 … on FO; the arc of radius A-i about F crosses the arc of
  // radius B-i about F' on the curve, because (A-i) + (B-i) = AB = the constant sum.
  // Stage 3 shows the FIRST pair alone — one crossing understood beats six unexplained.
  const n = Math.max(2, Math.round(conic.points));
  for (let i = 1; i <= n; i++) {
    if (stage < 2) break;
    const xi = -c + (c * i) / (n + 1);
    items.push(dot(pt(xi, 0), 'construction'), label(pt(xi, 0), String(i), -3, 16, 'construction'));
    const rA = Math.abs(xi - A.x);
    const rB = Math.abs(B.x - xi);
    const cross = circleCross(F, rA, F2, rB);
    // Stage 3 strikes the FIRST pair of arcs alone — one crossing understood beats six
    // unexplained — but the numbered points stay put. A construction never takes lines back.
    if (!cross || stage < 3 || (stage === 3 && i > 1)) continue;
    for (const [centre, r] of [[F, rA], [F2, rB]]) {
      const a0 = Math.atan2(cross.y - centre.y, cross.x - centre.x);
      items.push(arc(centre, r, a0 - 0.3, a0 + 0.3, 'construction'));
      items.push(arc(centre, r, -a0 - 0.3, -a0 + 0.3, 'construction'));
    }
    items.push(dot(cross, 'construction'), dot(pt(cross.x, -cross.y), 'construction'));
    items.push(label(cross, `P${i}`, 5, -6, 'construction'));
  }

  const curvePts = ellipsePts(O, a, b);
  if (stage >= 5) items.push(poly(curvePts, 'outline', true));
  if (conic.showTangent && stage >= 5) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  return { items, curvePts, results: ellipseResults(a, b) };
}

// ---- §6.5 item 8 — the approximate ellipse by four centres -------------------
/**
 * Four circular arcs that stand in for an ellipse — the construction a draughtsman reaches for
 * when the figure only has to LOOK right (and the one Module 4 uses for isometric circles).
 * The chapter lists it and works no example, so the classical procedure is followed exactly:
 *
 *   1  swing OA about O onto the minor axis produced, at E — so CE = a − b
 *   2  swing that length from C onto AC, at F
 *   3  bisect AF; where the bisector cuts the two axes are the centres G (major) and H (minor)
 *   4  the four arcs are centred on G, H and their mirrors, and they JOIN on the lines GH,
 *      which is what makes the join smooth rather than a visible corner
 *
 * The result is drawn as arcs, not as a polyline, because arcs are what it is: the whole point
 * of the method is that it can be struck with a compass.
 */
function ellipseFourCentre(conic) {
  const a = Math.max(conic.dim1, conic.dim2) / 2;
  const b = Math.min(conic.dim1, conic.dim2) / 2;
  const O = pt(0, 0);
  const A = pt(-a, 0); const B = pt(a, 0);
  const C = pt(0, -b); const D = pt(0, b);
  const E = pt(0, -a);                                  // OA swung onto the minor axis produced
  const F = add(C, mul(norm(sub(A, C)), a - b));        // CE stepped off along CA

  // The perpendicular bisector of AF, where it crosses each axis.
  const M = mid(A, F);
  const dir = perp(norm(sub(F, A)));
  const G = intersect(M, add(M, dir), pt(-1, 0), pt(1, 0));   // on the major axis
  const H = intersect(M, add(M, dir), pt(0, -1), pt(0, 1));   // on the minor axis
  if (!G || !H) return { items: [], curvePts: [] };
  const G2 = pt(-G.x, 0); const H2 = pt(0, -H.y);

  // G falls on A's side of the centre, so GA is the SHORT radius that turns the end of the
  // major axis, and H falls on the far side of the minor axis from C, so HC is the LONG one
  // that sweeps the flank. Pairing them the other way round draws a lozenge, not an ellipse.
  const rG = len(sub(A, G));
  const rH = len(sub(C, H));

  const stage = conic.buildStage ?? LAST_STAGE;
  const items = [
    line(pt(-a - 10, 0), pt(a + 10, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -a - 10), pt(0, a + 10), 'axis', [10, 3, 2, 3]),
    label(A, 'A', -14, 4, 'axis'), label(B, 'B', 8, 4, 'axis'),
    label(C, 'C', -4, -8, 'axis'), label(D, 'D', -4, 16, 'axis'),
    dot(O), label(O, 'O', -12, 16),
  ];
  if (stage >= 1) {
    items.push(arc(O, a, -Math.PI / 2, Math.PI, 'construction'));   // OA swung to E
    items.push(dot(E), label(E, 'E', 8, 4, 'construction'));
  }
  if (stage >= 2) {
    items.push(line(A, C, 'construction'));
    items.push(arc(C, a - b, Math.atan2(F.y - C.y, F.x - C.x) - 0.35,
      Math.atan2(F.y - C.y, F.x - C.x) + 0.35, 'construction'));
    items.push(dot(F, 'construction'), label(F, 'F', 6, -6, 'construction'));
  }
  if (stage >= 3) {
    items.push(line(sub(M, mul(dir, 0.8 * a)), add(M, mul(dir, 0.8 * a)), 'construction'));
    items.push(dot(G), label(G, 'G', -4, 18));
    items.push(dot(H), label(H, 'H', 8, 0));
  }
  if (stage >= 4) {
    items.push(dot(G2), label(G2, "G'", -14, 18));
    items.push(dot(H2), label(H2, "H'", 8, 0));
  }

  // The four arcs. Each pair meets ON the line joining its two centres, so the joins are drawn
  // as well — a learner should see WHERE the compass point moves, which is the whole method.
  // Where each pair of arcs joins. |GH| = rH − rG, so the two circles touch INTERNALLY, and the
  // point of contact lies on the line GH produced BEYOND the small centre — the same point for
  // both, which is what makes the join smooth. (Reading the direction as "toward the mate" put
  // the small arcs on the wrong side of their own centres and drew a lozenge.)
  const joinOf = (small, big, rSmall) => add(small, mul(norm(sub(small, big)), rSmall));

  const curvePts = [];
  const sweep = (centre, radius, j1, j2, via) => {
    const ang = (p) => Math.atan2(p.y - centre.y, p.x - centre.x);
    let a0 = ang(j1); let a1 = ang(j2);
    const inside = (t) => {
      const w = ((t - a0) % TAU + TAU) % TAU;
      return w <= ((a1 - a0) % TAU + TAU) % TAU;
    };
    if (!inside(ang(via))) { const t = a0; a0 = a1; a1 = t; }   // take the other way round
    let span = ((a1 - a0) % TAU + TAU) % TAU;
    // curvePts is filled at EVERY stage — the bbox that locks the sheet scale is analytic and
    // must not shift as the construction plays (ADR-053). Only the drawing is gated.
    if (stage >= 5) items.push(arc(centre, radius, a0, a0 + span, 'outline'));
    for (let i = 0; i <= 40; i++) {
      const t = a0 + (span * i) / 40;
      curvePts.push(pt(centre.x + radius * Math.cos(t), centre.y + radius * Math.sin(t)));
    }
  };

  const jGH = joinOf(G, H, rG); const jGH2 = joinOf(G, H2, rG);
  const jG2H = joinOf(G2, H, rG); const jG2H2 = joinOf(G2, H2, rG);
  sweep(G, rG, jGH, jGH2, A);      // the short arc round the end A
  sweep(G2, rG, jG2H2, jG2H, B);   // …and round B
  sweep(H, rH, jG2H, jGH, C);      // the long arc sweeping the flank at C
  sweep(H2, rH, jGH2, jG2H2, D);   // …and at D
  if (stage >= 4) {
    for (const [c, j] of [[G, jGH], [G, jGH2], [G2, jG2H], [G2, jG2H2], [H, jGH], [H2, jGH2]]) {
      items.push(line(c, j, 'construction', [4, 3]));     // where the compass point moved to
    }
    for (const j of [jGH, jGH2, jG2H, jG2H2]) items.push(dot(j, 'construction'));
  }
  if (stage >= 5) items.push(label(pt(0, b), 'Four arcs, not a true ellipse', -80, 34, 'construction'));

  return { items, curvePts, results: ellipseResults(a, b) };
}

/**
 * Where two arcs cross, for the two "intersecting arc" constructions. Both centres lie
 * on the axis (y = 0), so the crossing is symmetric about it; the point BELOW the axis
 * (positive y in this y-down space) is returned and its mirror is drawn beside it.
 * Returns null when the circles miss each other entirely.
 */
function circleCross(c1, r1, c2, r2) {
  const d = c2.x - c1.x;
  if (Math.abs(d) < 1e-9) return null;
  const x = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - x * x;
  if (h2 <= 0) return null;
  return pt(c1.x + x, Math.sqrt(h2));
}

// ---- Example 6.8, Fig. 6.13 — parabola by the tangent method -----------------
/**
 * The tangent method's stage plan (ADR-116). Four stages set the figure up, then the first half
 * of the chords arrives one per press, then the second half — the reflection of the first about
 * the axis — arrives whole, then the envelope, then the focus and directrix.
 *
 * `conicData.js` generates the NARRATION from the same rule. The two modules cannot import each
 * other (both are pure leaves that import nothing — CLAUDE.md), so the rule is stated twice and
 * the oracle proves the two agree at every division count the slider offers, which is a stronger
 * check than a shared symbol would be: it compares the stage list against what is actually drawn.
 */
const TANGENT_CHORDS_FROM = 4;
/**
 * The division count this construction will actually draw at. Clamped to the method's OWN slider
 * range (`dim3`, 4–12), not merely floored: `dim3` is one field shared by every construction that
 * takes a third given, and it holds 70 by default because that is the parallelogram method's
 * included ANGLE. Read unclamped, a sheet built straight from the default state drew a
 * sixty-nine-chord tangent construction with 138 numbers on it.
 */
const tangentDivisions = (dim3) => Math.min(12, Math.max(4, Math.round(dim3 ?? 7)));
const tangentFirstHalf = (n) => Math.ceil((tangentDivisions(n) - 1) / 2);

function parabolaTangent(conic) {
  const dOrd = conic.dim1;   // double ordinate AB
  const abs = conic.dim2;    // abscissa CV
  const V = pt(0, 0);
  const C = pt(abs, 0);
  const A = pt(abs, -dOrd / 2);
  const B = pt(abs, dOrd / 2);
  const E = pt(-abs, 0);     // CV produced to E with VE = CV
  const stage = conic.buildStage ?? LAST_STAGE;

  // The construction's own division count (ADR-113): equal parts of the two tangents, which is
  // what this method is built from — not a number of plotted points.
  const n = tangentDivisions(conic.dim3);
  const half = tangentFirstHalf(n);
  const TANGENT_MIRROR = TANGENT_CHORDS_FROM + half;   // the second half, whole
  const TANGENT_ENVELOPE = TANGENT_MIRROR + 1;         // the curve
  const TANGENT_MARKS = TANGENT_ENVELOPE + 1;          // focus and directrix
  const numbers = conic.buildStage !== undefined && stage >= 3 && stage < TANGENT_ENVELOPE;
  const items = [
    line(pt(-abs - 10, 0), pt(abs + 14, 0), 'axis', [10, 3, 2, 3]),
    line(A, B, 'mark'),
    // Both names on the drawing, the chapter's and the drawing office's. AB is the RIGHT-hand
    // edge of the figure, so its dimension text is set inside the drawing rather than outboard
    // of it — outboard it ran off the sheet, since the analytic bbox measures geometry, not
    // captions (ADR-113).
    label(mid(A, B), `Double ordinate (base) ${dOrd.toFixed(0)}`,
      -8 - textWidthGuess(`Double ordinate (base) ${dOrd.toFixed(0)}`), 0),
    label(mid(V, C), `Abscissa (axis) ${abs.toFixed(0)}`, -18, 18, 'axis'),
    dot(V), label(V, 'V', -12, -8),
    label(A, 'A', 8, 8), label(B, 'B', 8, -4), label(C, 'C', 10, 16, 'axis'),
  ];
  if (stage >= 1) items.push(dot(E), label(E, 'E', -12, -6));
  if (stage >= 2) items.push(line(A, E, 'construction'), line(B, E, 'construction'));

  // Divide AE and BE into the same number of parts and join 1-1', 2-2' … — the
  // parabola is the envelope those chords are tangent to. It has no construction POINTS:
  // the curve is found by touching the chords, which is what makes it worth watching.
  //
  // The SAME pacing every construction in this topic uses (ADR-116): the first half of the
  // chords arrives one per press, so each is seen to land; the second half is the reflection of
  // the first about the axis and arrives whole. `tangentFirstHalf()` is shared with the stage
  // list, so the narration and the drawing cannot disagree about where the first half ends. The
  // envelope is unchanged — only the pacing of how it is revealed.
  const chordStage = (i) => (i <= half ? TANGENT_CHORDS_FROM + (i - 1) : TANGENT_MIRROR);
  if (stage >= 3) {
    for (let i = 1; i < n; i++) {
      const p1 = lerp(A, E, i / n);
      const p2 = lerp(E, B, i / n);
      items.push(dot(p1, 'construction'), dot(p2, 'construction'));
      if (stage >= chordStage(i)) items.push(line(p1, p2, 'construction'));
      if (numbers) {
        items.push(label(p1, String(i), -12, 0, 'construction'));
        items.push(label(p2, `${i}'`, 6, 0, 'construction'));
      }
    }
  }

  // y² = 4f·x through A: f = (dOrd/2)² / (4·abs).
  const f = (dOrd * dOrd) / (16 * abs);
  const curvePts = parabolaPts(V, f, abs, 1);
  if (stage >= TANGENT_ENVELOPE) items.push(poly(curvePts, 'outline'));
  if (stage >= TANGENT_MARKS) {
    items.push(dot(pt(f, 0)), label(pt(f, 0), 'Focus, F', 6, -8));
    items.push(line(pt(-f, -dOrd * 0.6), pt(-f, dOrd * 0.6), 'axis'));
    items.push(label(pt(-f, -dOrd * 0.6), 'Directrix, DD', -30, -8, 'axis'));
    if (conic.showTangent) items.push(...parabolaTangentItems(V, f, abs, conic.pointT));
  }
  // "Draw the parabola and LOCATE ITS FOCUS AND DIRECTRIX" (Example 6.8 / exercise 8).
  return { items, curvePts, results: parabolaResults(f) };
}

/** Samples of y² = 4f·x from the vertex out to x = depth, opening toward +x·`sign`. */
function parabolaPts(V, f, depth, sign = 1, samples = CURVE_SAMPLES) {
  const yMax = Math.sqrt(4 * f * depth);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const y = -yMax + (2 * yMax * i) / samples;
    return pt(V.x + sign * ((y * y) / (4 * f)), V.y + y);
  });
}

/** Tangent + normal at a point on y² = 4f·x, drawn as Example 6.8 step 5 draws them. */
function parabolaTangentItems(V, f, depth, t) {
  const yMax = Math.sqrt(4 * f * depth);
  const y = -yMax + 2 * yMax * Math.min(Math.max(t, 0), 1);
  const p = pt(V.x + (y * y) / (4 * f), V.y + y);
  const tan = norm(pt(y / (2 * f), 1));
  const n = perp(tan);
  const reach = 0.5 * depth;
  return [
    line(pt(V.x + f, V.y), p, 'construction', [4, 3]),
    line(sub(p, mul(tan, reach)), add(p, mul(tan, reach)), 'mark'),
    line(sub(p, mul(n, reach * 0.7)), add(p, mul(n, reach * 0.7)), 'mark'),
    dot(p), label(p, 'P', 8, -8),
    label(add(p, mul(tan, reach)), 'Tangent, TT', 6, -6),
    label(add(p, mul(n, reach * 0.7)), 'Normal, NN', 6, 12),
  ];
}

// ---- Example 6.9, Fig. 6.14 — parabola by the rectangle method ---------------
function parabolaRectangle(conic) {
  const S = conic.dim1;  // span (base)
  const R = conic.dim2;  // rise (axis)
  const V = pt(0, 0);
  const n = Math.max(3, Math.round(conic.points));
  const A = pt(-S / 2, R), B = pt(S / 2, R);
  const D = pt(-S / 2, 0), Cc = pt(S / 2, 0);

  const stage = conic.buildStage ?? LAST_STAGE;
  const numbers = conic.buildStage === undefined || stage >= 2;
  const items = [
    line(pt(0, -8), pt(0, R + 10), 'axis', [10, 3, 2, 3]),
    dot(V), label(V, 'V', 8, -6),
    label(mid(A, B), `Base ${S.toFixed(0)}`, -14, 18, 'construction'),
    label(mid(D, A), `Rise ${R.toFixed(0)}`, -34, 0, 'construction'),
  ];
  if (stage >= 1) {
    items.push(poly([A, B, Cc, D], 'construction', true));
    items.push(label(A, 'A', -14, 8, 'construction'), label(B, 'B', 8, 8, 'construction'));
    items.push(label(D, 'D', -14, -6, 'construction'), label(Cc, 'C', 8, -6, 'construction'));
  }

  // Divide DV (half the top edge) and AD (the side) into the same number of parts;
  // the vertical through i on DV meets V-i on AD at a point of the curve.
  for (const side of [-1, 1]) {
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const onTop = pt((side * S / 2) * (1 - u), 0);
      const onSide = pt(side * S / 2, R * (1 - u));
      if (stage >= 4) items.push(line(onTop, pt(onTop.x, R), 'construction'));
      if (stage >= 4) items.push(line(V, onSide, 'construction'));
      const q = intersect(onTop, pt(onTop.x, R), V, onSide);
      if (q && stage >= 4) items.push(dot(q, 'construction'));
      if (stage >= 2 && numbers) items.push(label(onTop, String(i), -3, -6, 'construction'));
      if (stage >= 3 && numbers) items.push(label(onSide, `${i}'`, side < 0 ? -12 : 6, 0, 'construction'));
    }
  }

  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const x = -S / 2 + (S * i) / CURVE_SAMPLES;
    return pt(x, R * (2 * x / S) ** 2);
  });
  // In this frame the axis is vertical, so the focal distance is measured down the axis.
  const f = (S * S) / (16 * R);
  if (stage >= 5) {
    items.push(poly(curvePts, 'outline'));
    items.push(dot(pt(0, f)), label(pt(0, f), 'Focus, F', 8, 4));
    items.push(line(pt(-S * 0.55, -f), pt(S * 0.55, -f), 'axis'));
    items.push(label(pt(-S * 0.55, -f), 'Directrix, DD', 0, -8, 'axis'));
  }
  return { items, curvePts, results: parabolaResults(f) };
}

// ---- Example 6.10, Fig. 6.15 — parabola in a parallelogram -------------------
function parabolaParallelogram(conic) {
  const chord = conic.dim1;
  const side = conic.dim2;
  const ang = deg(conic.dim3 ?? 110);
  const n = Math.max(3, Math.round(conic.points));

  // KLMN: KL is the chord, KN the side leaning at the included angle.
  const K = pt(-chord / 2, 0);
  const L = pt(chord / 2, 0);
  const leg = pt(side * Math.cos(ang), -side * Math.sin(ang));
  const N = add(K, leg);
  const M = add(L, leg);
  const O = mid(K, N);   // midpoint of KN
  const P = mid(M, L);   // midpoint of ML
  const V = mid(O, P);   // the curve's vertex sits on the mid-line OP

  const stage = conic.buildStage ?? LAST_STAGE;
  const numbers = conic.buildStage === undefined || stage >= 2;
  const items = [
    line(O, P, 'construction', SHORT_DASH),
    label(mid(O, P), 'Mid-line OP', -20, -8, 'construction'),
  ];
  if (stage >= 1) {
    items.push(poly([K, L, M, N], 'construction', true));
    items.push(label(K, 'K', -14, 8, 'construction'), label(L, 'L', 8, 8, 'construction'));
    items.push(label(M, 'M', 8, -6, 'construction'), label(N, 'N', -14, -6, 'construction'));
  }

  // Same division scheme as the rectangle method, in the oblique frame: the curve
  // through K and L with its apex on OP.
  const apex = mid(N, M);
  for (const s of [-1, 1]) {
    const corner = s < 0 ? K : L;
    const top = s < 0 ? N : M;
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const onTop = lerp(apex, top, u);
      const onSide = lerp(corner, top, 1 - u);
      const dirTop = sub(add(onTop, sub(corner, top)), onTop);
      if (stage >= 2 && numbers) items.push(label(onTop, String(i), -3, -6, 'construction'));
      if (stage >= 3 && numbers) items.push(label(onSide, `${i}'`, s < 0 ? -12 : 6, 0, 'construction'));
      if (stage >= 4) {
        items.push(line(onTop, add(onTop, mul(norm(dirTop), side)), 'construction'));
        items.push(line(apex, onSide, 'construction'));
        const q = intersect(onTop, add(onTop, mul(norm(dirTop), side)), apex, onSide);
        if (q) items.push(dot(q, 'construction'));
      }
    }
  }

  // Affine image of y = x² : P(u) = apex + u·(half chord) + u²·(the leg), u ∈ [−1, 1].
  const halfChord = mul(sub(L, K), 0.5);
  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const u = -1 + (2 * i) / CURVE_SAMPLES;
    return add(apex, add(mul(halfChord, u), mul(mul(leg, -1), u * u)));
  });
  // The axis is the diameter through the apex — found by the chord-bisector
  // construction in the book, drawn here through the same two points it produces.
  const axisDir = norm(mul(leg, -1));
  if (stage >= 5) {
    items.push(poly(curvePts, 'outline'));
    items.push(line(sub(apex, mul(axisDir, side * 0.4)), add(apex, mul(axisDir, side * 1.4)), 'axis', [10, 3, 2, 3]));
    items.push(dot(V), label(V, 'V', 8, -6));
    items.push(label(add(apex, mul(axisDir, side * 1.4)), 'Axis AB', 6, 14, 'axis'));
  }
  return { items, curvePts, results: parabolaResults(focalOfAffine(halfChord, mul(leg, -1))) };
}

// ---- Example 6.11, Fig. 6.16 — parabola by the offset method -----------------
function parabolaOffset(conic) {
  const base = conic.dim1;
  const axis = conic.dim2;
  const n = 4; // the textbook's "say 4", so the side divides into 4² = 16
  const V = pt(0, 0);
  const K = pt(-base / 2, axis), L = pt(base / 2, axis);
  const N = pt(-base / 2, 0), M = pt(base / 2, 0);

  const stage = conic.buildStage ?? LAST_STAGE;
  const items = [
    line(pt(0, -8), pt(0, axis + 10), 'axis', [10, 3, 2, 3]),
    dot(V), label(V, 'V', 8, -8),
    label(mid(K, L), `Base ${base.toFixed(0)}`, -14, 18, 'construction'),
    label(mid(N, K), `Axis ${axis.toFixed(0)}`, -34, 0, 'construction'),
  ];
  if (stage >= 1) {
    items.push(poly([K, L, M, N], 'construction', true));
    items.push(label(K, 'K', -14, 8, 'construction'), label(L, 'L', 8, 8, 'construction'));
    items.push(label(M, 'M', 8, -6, 'construction'), label(N, 'N', -14, -6, 'construction'));
  }

  // Divide NV into n parts and KN into n² parts: the offset at the i-th division is
  // i² of those parts — the squares that give the method its name. Stage 3 shows the
  // FIRST square alone, because that one number is what the method actually asserts.
  for (let i = 1; i <= n * n; i++) {
    const y = (axis * i) / (n * n);
    if (i === 1 || i === 4 || i === 9 || i === 16) {
      const shown = stage >= 4 || (stage === 3 && i === 1);
      if (!shown) continue;
      items.push(line(pt(-base / 2, y), pt(base / 2, y), 'construction'));
      const k = Math.round(Math.sqrt(i));
      items.push(label(pt(-base / 2, y), `${k}² = ${i}`, -34, 4, 'construction'));
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 1; i <= n; i++) {
      const x = (s * base / 2) * (i / n);
      const y = axis * (i / n) ** 2;
      if (stage >= 2) {
        items.push(dot(pt(x, 0), 'construction'));
        items.push(label(pt(x, 0), String(i), -3, -6, 'construction'));
      }
      const shown = stage >= 4 || (stage === 3 && i === 1);
      if (!shown) continue;
      items.push(line(pt(x, 0), pt(x, y), 'construction'));
      items.push(dot(pt(x, y), 'construction'));
    }
  }

  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const x = -base / 2 + (base * i) / CURVE_SAMPLES;
    return pt(x, axis * (2 * x / base) ** 2);
  });
  const f = (base * base) / (16 * axis);
  if (stage >= 5) {
    items.push(poly(curvePts, 'outline'));
    items.push(dot(pt(0, f)), label(pt(0, f), 'Focus, F', 8, 4));
    items.push(line(pt(-base * 0.55, -f), pt(base * 0.55, -f), 'axis'));
    items.push(label(pt(-base * 0.55, -f), 'Directrix, DD', 0, -8, 'axis'));
  }
  return { items, curvePts, results: parabolaResults(f) };
}

// ============================================================================
// Layout dispatch + the analytic bbox that locks the sheet scale.
// ============================================================================

/**
 * Build the sheet for a mode. The returned `bbox` is derived ONLY from the state's own
 * numbers (never from what happens to be drawn on screen, never from pan/zoom), so it is
 * the fixed intrinsic frame main.js locks the millimetre scale to — the ADR-053 pattern.
 *
 * @param {string} mode  'locus' | 'terms' | 'eccentricity' | 'methods'
 * @param {import('./conicData.js').ConicState} conic
 */
export function layoutFor(mode, conic) {
  switch (mode) {
    case 'terms': return termsLayout(conic);
    case 'eccentricity': return eccentricityLayout(conic);
    case 'methods': return methodsLayout(conic);
    case 'props': return parabolaPropsLayout(conic);
    case 'circle': return circleLayout(conic);
    case 'triangle': return triangleLayout(conic);
    case 'nothing': return nothingLayout();
    case 'locus':
    default: return locusLayout(conic);
  }
}

// ============================================================================
// MODE 'props' — §6.6's three properties of the parabola, one per stage.
//
// The parabola is taken in its own parameter form, vertex at V and focus f
// beyond it:  P(t) = (V.x + f·t², 2f·t).  Two standard results do all the work
// and both are exact, so the figure IS the proof rather than an illustration:
//   · the tangents at t₁ and t₂ meet at (V.x + f·t₁t₂, f(t₁ + t₂))
//   · a chord is FOCAL exactly when t₁t₂ = −1, which puts that meeting point on
//     the directrix (x = V.x − f) with tangent slopes 1/t₁ and 1/t₂ whose
//     product is −1 — the right angle §6.6 property 2 claims.
// ============================================================================

function parabolaPropsLayout(conic) {
  const f = conic.fa / 2;                 // VF: the vertex bisects AF on a parabola
  const stage = Math.min(Math.max(conic.propStage ?? 0, 0), 2);
  // Drawn UPRIGHT — vertex at the origin, opening up the sheet (y is down), the same way the
  // rectangle and offset methods draw theirs. A parabola opening sideways is taller than it is
  // wide, and the sheet's card is landscape: turned upright the figure is twice the scale, which
  // is the difference between its captions being placeable and being dropped.
  const at = (t) => pt(2 * f * t, -f * t * t);
  const meet = (t1, t2) => pt(f * (t1 + t2), -f * t1 * t2);
  const F = pt(0, -f);
  const V = pt(0, 0);
  // 2.0, not more: the figure has to stay short enough that the sheet's own size gate keeps
  // its captions (drawSheet drops every non-axis caption below 1.3 px per mm, and the compact
  // card is only 260 px tall). A taller figure is a figure with no names on it.
  const REACH = 1.8;
  const half = 2 * f * REACH;

  const items = [
    line(pt(-half - 6, f), pt(half + 6, f), 'axis'),
    label(pt(-half - 8, f), 'Directrix', 6, 16, 'axis'),
    line(pt(0, 0.3 * f + f), pt(0, -f * REACH * REACH - 0.3 * f), 'axis', [10, 3, 2, 3]),
    dot(F), label(F, 'F', 10, 4),
    dot(V), label(V, 'V', -6, 18),
  ];
  const curve = [];
  for (let i = -60; i <= 60; i++) curve.push(at((REACH * i) / 60));
  items.push(poly(curve, 'outline'));

  if (stage === 0) {
    // Property 1 — the circumscribing box, with the curve's own region hatched. A hatch is the
    // drafting way to say "this area", and seeing it against the box IS the property.
    const top = at(REACH);
    const box = [pt(-half, 0), pt(half, 0), pt(half, top.y), pt(-half, top.y)];
    items.push(poly(box, 'construction', true));
    for (let i = 1; i < 24; i++) {
      const x = -half + (2 * half * i) / 24;
      items.push(line(pt(x, -f * (x / (2 * f)) * (x / (2 * f))), pt(x, top.y), 'construction'));
    }
    items.push(label(pt(0, top.y), 'Area = ⅔ of the box', -56, -16));
  } else if (stage === 1) {
    // Property 2 — a FOCAL chord: t₂ = −1 ÷ t₁, so the tangents meet on the directrix at 90°.
    const t1 = 1.7; const t2 = -1 / t1;
    const P = at(t1); const Q = at(t2); const T = meet(t1, t2);
    items.push(line(P, Q, 'mark'));
    items.push(label(mid(P, Q), 'Focal chord', 14, -14));
    for (const [p, name, dx] of [[P, 'P', 14], [Q, 'Q', -26]]) {
      items.push(line(extend(T, p, 0.35), T, 'mark'));   // the tangents are the subject here
      items.push(dot(p), label(p, name, dx, -14));
    }
    items.push(dot(T), label(T, 'T — on the directrix, at 90°', 14, 26));
    // The right angle at T, marked the drafting way: a square in the corner.
    const u = norm(sub(P, T)); const v2 = norm(sub(Q, T));
    const s = 0.32 * f;
    items.push(poly([add(T, mul(u, s)), add(add(T, mul(u, s)), mul(v2, s)), add(T, mul(v2, s))], 'mark'));
  } else {
    // Property 3 — any other chord: its tangents meet on the DIAMETER that bisects it.
    // Both parameters must stay inside REACH, or an end of the chord is a point the drawn
    // curve does not reach — a figure claiming something about a curve it has not got.
    const t1 = -0.5; const t2 = 1.7;
    const P = at(t1); const Q = at(t2); const T = meet(t1, t2); const M = mid(P, Q);
    items.push(line(P, Q, 'mark'));
    items.push(dot(P), label(P, 'P', -22, -12), dot(Q), label(Q, 'Q', 16, -12));
    for (const p of [P, Q]) items.push(line(extend(T, p, 0.3), T, 'mark'));
    items.push(dot(T), label(T, 'T', 16, 20));
    items.push(line(pt(M.x, f), pt(M.x, at(REACH).y), 'axis', SHORT_DASH));
    items.push(label(pt(M.x, at(REACH).y), 'Diameter', 8, 14, 'axis'));
    items.push(dot(M), label(M, 'M — midpoint of PQ', -104, 22));
  }

  return finish('props', items, null, curve, null, [
    measure('Focus, from the vertex', f, 'mm', 'VF'),
    measure('Latus rectum', 4 * f, 'mm', 'the chord through F, square to the axis'),
  ]);
}

// ============================================================================
// The three sections that are NOT plane conics (§6.1 items 1 and 6, plus the
// plane that misses). Each has its own sheet, because the sheet must draw what
// the cut actually IS: a focal-polar model asked for a circle collapses, and
// asked for the apex cut draws a curve that is not on the cone at all.
// ============================================================================

/**
 * Section plane AA (§6.1 item 1) — a true circle, at the radius the cone actually has where
 * the plane crosses it. `conic.cutA` is that radius in mm, supplied by the orchestrator from
 * the live cone.
 *
 * The circle is the limiting conic: its focus and its centre are the same point (the focal
 * sphere touches it there), and its directrix is infinitely far away, which is what e = 0
 * means. That is drawn as a statement rather than left as an absence.
 */
function circleLayout(conic) {
  const r = Math.max(conic.cutA ?? 30, 1);
  const O = pt(0, 0);
  const items = [
    line(pt(-1.35 * r, 0), pt(1.35 * r, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -1.35 * r), pt(0, 1.35 * r), 'axis', [10, 3, 2, 3]),
    circle(O, r, 'outline'),
    line(O, pt(r * Math.cos(-Math.PI / 4), r * Math.sin(-Math.PI / 4)), 'mark'),
    label(pt(0.42 * r * Math.SQRT2 * Math.cos(-Math.PI / 4), 0.42 * r * Math.SQRT2 * Math.sin(-Math.PI / 4)),
      `Radius ${r.toFixed(1)}`, 6, -6),
    dot(O),
    label(O, 'Centre', -12, 20),
    naming(label(pt(0, 1.2 * r), 'Circle · e = 0 · no directrix', -46, 16, 'construction')),
  ];
  return finish('circle', items, null, null,
    { minX: -1.4 * r, maxX: 1.4 * r, minY: -1.4 * r, maxY: 1.4 * r });
}

/**
 * Section plane FF (§6.1 item 6) — "when a right circular cone is cut by a section plane
 * through the apex of the cone, the section obtained is called isosceles triangle". Not a
 * conic and not a locus: two straight generators and the chord of the base between their feet.
 *
 * `conic.cutA` is the base of the triangle and `conic.cutB` its two equal sides, both in mm.
 * A base of zero is the honest degenerate: a plane through the apex flatter than the
 * generators touches the cone at the apex and nowhere else, so the section is one point.
 */
function triangleLayout(conic) {
  const base = Math.max(conic.cutA ?? 0, 0);
  const side = Math.max(conic.cutB ?? 40, 1);
  const half = base / 2;
  const height = Math.sqrt(Math.max(side * side - half * half, 1));
  const A = pt(0, -height);              // the apex, up the sheet (y is down)
  const B = pt(-half, 0);
  const C = pt(half, 0);

  if (base < 0.5) {
    // The plane only touches the tip.
    const items = [
      line(pt(-30, 0), pt(30, 0), 'axis', [10, 3, 2, 3]),
      dot(pt(0, 0)),
      label(pt(0, 0), 'Apex', -12, -10),
      naming(label(pt(0, 0), 'The cut touches the tip only — the section is a single point', -150, 26, 'construction')),
    ];
    return finish('triangle', items, null, null, { minX: -40, maxX: 40, minY: -30, maxY: 30 });
  }

  const items = [
    line(A, pt(0, 0), 'axis', [10, 3, 2, 3]),
    line(A, B, 'outline'), line(A, C, 'outline'), line(B, C, 'outline'),
    dot(A), label(A, 'Apex', -12, -10),
    label(mid(B, C), `Base ${base.toFixed(1)}`, -22, 20),
    label(mid(A, C), `Generator ${side.toFixed(1)}`, 6, 0),
    // Under the base, clear of all three sides — a caption that lands on the figure it names
    // is worse than no caption (RULES.md §3.39).
    naming(label(pt(0, 0), 'Isosceles triangle · not a curve', -78, 40, 'construction')),
  ];
  return finish('triangle', items, null, null, {
    minX: -0.62 * base - 4, maxX: 0.62 * base + 4, minY: -height - 6, maxY: 0.18 * height,
  });
}

/** The plane is clear of the cone: there is no section, and the sheet says so rather than
 *  going on drawing the last curve it had. */
function nothingLayout() {
  return finish('nothing', [
    label(pt(0, 0), 'The plane is clear of the cone — nothing is cut.', -130, 0, 'construction'),
  ], null, null, { minX: -60, maxX: 60, minY: -30, maxY: 30 });
}

/**
 * Close a layout: attach the mode, the model (where there is one) and the bbox. A layout
 * whose drawn content changes while its FRAME must not (the staged construction) passes an
 * explicit `bbox` instead of letting the drawn items measure it.
 */
function finish(mode, items, model = null, curvePts = null, bbox = null, results = []) {
  return { mode, items, model, curvePts, bbox: bbox ?? bboxOf(items), results };
}

/**
 * One quantity the finished drawing YIELDS, for the dock's results block (ADR-091). Every
 * exercise in the chapter that ends in "measure", "determine", "find" or "locate" is asking
 * for one of these, and a construction that draws the answer without stating it leaves the
 * learner to guess at what they were meant to read off.
 *
 * `from` names where it is read on the sheet, in the drawing's own letters, so the number can
 * always be checked against the figure rather than taken on trust.
 */
const measure = (label, value, unit = 'mm', from = '') => ({ label, value, unit, from });

/** Bounding box over every GEOMETRIC primitive (labels float outside it by design —
 *  they are chrome, and letting them drive the scale would shrink the drawing). */
function bboxOf(items) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const take = (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  for (const it of items) {
    if (it.k === 'line') { take(it.a); take(it.b); }
    else if (it.k === 'poly') { for (const p of it.pts) take(p); }
    else if (it.k === 'circle' || it.k === 'arc') {
      take(pt(it.c.x - it.r, it.c.y - it.r));
      take(pt(it.c.x + it.r, it.c.y + it.r));
    } else if (it.k === 'dot') take(it.p);
  }
  if (!Number.isFinite(minX)) return { minX: -50, maxX: 50, minY: -50, maxY: 50 };
  return { minX, maxX, minY, maxY };
}

// ============================================================================
// The single renderer. Construction linework first (thin), then the finished
// curve (heavy), then the marks and labels — so the answer always reads on top.
// ============================================================================

/**
 * Draw order by role, so a layout can push items in construction order and still paint in
 * drafting order. Faintest first, the marked apparatus last.
 *
 * EVERY role a layout can emit must appear here: a role that is missing is not drawn at all,
 * silently, and nothing in the display list looks wrong. `plot` and `projection` were each
 * added to a builder and to the pen table without being added here, and neither reached the
 * canvas (ADR-104). The oracle now asserts this list covers the pen table.
 */
const ROLE_ORDER = ['projection', 'construction', 'axis', 'outline', 'plot', 'mark', 'label'];

/** The roles the renderer will actually paint, for the oracle to check every layout against. */
export const PAINTED_ROLES = Object.freeze([...ROLE_ORDER]);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{project:(p:{x:number,y:number})=>{x:number,y:number}, pxPerMm:number}} view
 * @param {ReturnType<typeof layoutFor>} layout
 * @param {{ink:string, construction:string, curve:string, mark:string, font:string}} palette
 *   Resolved token colours + a ready-built font string (no DOM access in here).
 */
export function drawSheet(ctx, view, layout, palette, options = {}) {
  // While a construction is being played, the line JUST drawn is the one to look at, and the
  // ones before it are context. Drawing the context back is what makes the eye follow the
  // teacher's hand instead of scanning a finished drawing (ADR-099). `freshFrom` is the index
  // the current stage's linework starts at; it is 0 when nothing is playing, so a finished
  // drawing is never dimmed.
  const freshFrom = options.stepping ? (layout.freshFrom ?? 0) : 0;
  const CONTEXT_ALPHA = 0.42;
  // "Hide the construction lines" — the learner choosing to read the finished figure alone.
  // The thin linework is what FOUND the answer, so it is on by default; being able to take
  // it away is how a learner checks they can still read the drawing without it.
  const showConstruction = options.showConstruction !== false;
  // Three weights, so a learner can tell a given from a working line at a glance (ADR-118).
  // Same ink throughout — this is line WEIGHT, the drafting variable, not a second palette:
  //   axis         centre lines and the given frame, at full strength
  //   construction the working lines that find the answer, a shade back from them
  //   projection   a line carried past the point it produced, lighter still
  const pen = {
    construction: { stroke: palette.construction, width: THIN_PX, alpha: AUXILIARY_ALPHA },
    axis: { stroke: palette.construction, width: THIN_PX },
    outline: { stroke: palette.curve, width: OUTLINE_PX },
    mark: { stroke: palette.mark, width: MARK_PX },
    // The points a construction PLOTS, in the curve's own colour (ADR-102). They used to be
    // thin grey like the scaffolding that found them, which is exactly backwards: these points
    // ARE the curve, and sharing its colour is what says so. Construction lines stay neutral.
    plot: { stroke: palette.curve, width: MARK_PX },
    // Where a construction line CARRIES ON past the point it produced (ADR-104): same grey,
    // thinner and lightened, so it reads as a projection line and never competes with the curve.
    projection: { stroke: palette.construction, width: HAIR_PX, alpha: PROJECTION_ALPHA },
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Below roughly a pixel and a third per millimetre, a 12 px caption stands nine
  // millimetres tall in drawing terms — the annotation stops being a label and becomes
  // the drawing. On a sheet that small only the three references a learner needs to read
  // the figure at all survive; expanding the sheet brings the rest back.
  const roomy = view.pxPerMm >= 1.3;

  // The finished curve can be TRACED rather than switched on (ADR-114): `reveal` is how much of
  // it the pencil has covered. Measured along the path and shared across every outline piece in
  // order, so a figure drawn in four arcs is traced at one steady speed from end to end.
  const reveal = options.reveal ?? 1;
  const outlineTotal = reveal < 1
    ? layout.items.reduce((d, it) => d + (it.role === 'outline' ? pathLength(it) : 0), 0)
    : 0;
  let outlineDrawn = 0;

  for (const role of ROLE_ORDER) {
    if (role === 'label') break; // the label pass places rather than simply paints
    // A projection line IS construction — it leaves with the rest of the scaffolding.
    if ((role === 'construction' || role === 'projection') && !showConstruction) continue;
    for (let i = 0; i < layout.items.length; i++) {
      const it = layout.items[i];
      if ((it.role ?? 'construction') !== role) continue;
      if (it.k === 'label') continue;
      // Earlier stages step back so the newest line reads as the one being drawn.
      ctx.globalAlpha = freshFrom > 0 && i < freshFrom ? CONTEXT_ALPHA : 1;
      let drawn = it;
      if (role === 'outline' && reveal < 1) {
        const want = outlineTotal * reveal;
        const own = pathLength(it);
        if (want <= outlineDrawn) { outlineDrawn += own; continue; }   // not reached yet
        if (want < outlineDrawn + own) drawn = partialOf(it, (want - outlineDrawn) / own);
        outlineDrawn += own;
      }
      drawItem(ctx, view, drawn, pen, palette);
    }
    ctx.globalAlpha = 1;
  }

  drawLabels(ctx, view, layout, palette, roomy, showConstruction, options.anonymous === true);

  // The highlight sits on top of everything: a ring round whatever the cursor is over, so
  // the hover explanation and the geometry it names are unmistakably the same thing.
  if (options.highlight) drawHighlight(ctx, view, options.highlight, palette);
}

/**
 * Length of one outline item along its own path, in sheet millimetres — so a reveal can run at a
 * CONSTANT speed across a figure made of several pieces (ADR-114).
 */
function pathLength(it) {
  if (it.k === 'poly' && it.pts?.length > 1) {
    let d = 0;
    for (let i = 1; i < it.pts.length; i++) d += len(sub(it.pts[i], it.pts[i - 1]));
    if (it.closed) d += len(sub(it.pts[0], it.pts[it.pts.length - 1]));
    return d;
  }
  if (it.k === 'arc') return Math.abs(it.a1 - it.a0) * it.r;
  if (it.k === 'circle') return TAU * it.r;
  return 0;
}

/**
 * The same item cut short at `f` (0..1) of its own path — the drawn part of a curve that is
 * still being traced. The geometry is untouched: this returns the SAME points, up to the one
 * the pencil has reached, with the last segment interpolated so the tip moves smoothly.
 */
function partialOf(it, f) {
  if (f >= 1) return it;
  if (it.k === 'arc') return { ...it, a1: it.a0 + (it.a1 - it.a0) * f };
  if (it.k === 'circle') return { k: 'arc', c: it.c, r: it.r, a0: 0, a1: TAU * f, role: it.role };
  if (it.k !== 'poly' || !(it.pts?.length > 1)) return it;
  const pts = it.closed ? [...it.pts, it.pts[0]] : it.pts;
  const want = pathLength(it) * f;
  const out = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = len(sub(pts[i], pts[i - 1]));
    if (run + seg >= want) {
      const t = seg > 1e-12 ? (want - run) / seg : 0;
      out.push(lerp(pts[i - 1], pts[i], t));
      break;
    }
    run += seg;
    out.push(pts[i]);
  }
  return { ...it, k: 'poly', pts: out, closed: false };
}

// The reveal helpers, exposed for the oracle: the property worth checking is geometric — the
// traced part must be the same path cut short — and that is testable without a canvas.
layoutFor.__reveal = { partialOf, pathLength };

/** How close, in px, the cursor must come to an element to be pointing at it. */
const HIT_PX = 10;

/** Mark the hovered element over the finished drawing: a ring on a point, a heavier
 *  re-stroke on a line or a curve. Colour is never the only cue — the caller shows the
 *  explanation at the same time. */
function drawHighlight(ctx, view, it, palette) {
  ctx.setLineDash([]);
  ctx.strokeStyle = palette.mark;
  ctx.lineWidth = MARK_PX + 2;
  ctx.globalAlpha = 0.6;

  if (it.k === 'dot' || it.k === 'label') {
    const c = view.project(it.p);
    ctx.beginPath();
    ctx.arc(c.x, c.y, HIT_PX, 0, TAU);
    ctx.stroke();
  } else if (it.k === 'line') {
    const a = view.project(it.a);
    const b = view.project(it.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  } else if (it.k === 'poly' && it.pts?.length) {
    ctx.beginPath();
    const first = view.project(it.pts[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < it.pts.length; i++) {
      const q = view.project(it.pts[i]);
      ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ============================================================================
// Hover explanations (ADR-088). The sheet is a drawing, not a picture: pointing
// at a line on it should say what that line is FOR, in the words a teacher would
// use. Matched on the caption the engine itself drew, so a construction can
// never grow an element with no explanation attached — if it is labelled, it is
// explained, and the match is checked by the oracle.
// ============================================================================

const SHEET_TIPS = Object.freeze([
  [/^Directrix/, 'The fixed straight line. Every point on the curve is measured square across to it.'],
  [/^Focus|^F[′′]?$/, 'The fixed point, F. Every point on the curve is measured back to it — and on the cone it is where the inscribed ball touches the cutting plane.'],
  [/^Axis$/, 'The centre line of the curve — square to the directrix, through the focus.'],
  [/^V(ertex)?/, 'The vertex, V: where the curve crosses its own axis. It is the first point you plot.'],
  [/^P$/, 'A point on the curve. Everything the construction does is aimed at finding points like this one.'],
  [/^Q$/, 'The foot of P on the directrix — where the square-across measurement lands.'],
  [/^PF/, 'The distance from P to the focus.'],
  [/^PQ/, 'The distance from P square across to the directrix.'],
  [/^e = /, 'Divide PF by PQ. You get the same answer wherever P sits on this curve — that is what makes it one curve.'],
  [/^Centre [CO]/, 'The midpoint of both axes, halfway between the two vertices. An ellipse and a hyperbola each have one — which is why the chapter calls them CENTRAL conics, and why each has two foci and two directrices. A parabola has none of that.'],
  [/^Auxiliary circle/, 'A circle drawn on an axis of the curve as its diameter. The big one gives the major diameter and the small one the minor diameter, and the concentric-circles construction is built on the pair.'],
  [/^Conjugate diameters/, 'A pair of diameters where each one is parallel to the tangents at the ends of the other. They are not the axes — but they fix the ellipse just as well, which is what the parallelogram method is given.'],
  [/^Centre/, 'Every point of a circle is the same distance from here. The ball inside the cone touches the cut at this one point, so the focus and the centre are the same — and the directrix is infinitely far away. That is what e = 0 means.'],
  [/^Radius/, 'The distance from the centre out to the curve — the same all the way round, which is what makes it a circle.'],
  [/^Apex$/, 'The tip of the cone. A plane through it cuts straight lines, never a curve.'],
  [/^Base /, 'The chord the cut leaves across the base circle — the third side of the triangle.'],
  [/^Generator /, 'One of the cone’s own sloping lines. A cut through the apex runs down two of them, which is why the triangle is isosceles.'],
  [/^Major axis|^Transverse/, 'The long way across the curve, through both vertices.'],
  [/^Minor axis|^Conjugate/, 'The short way across, square to the long one at the centre.'],
  [/^Latus rectum/, 'The chord through the focus, square to the axis. It fixes how wide the curve opens.'],
  [/^Double ordinate/, 'A chord square to the axis — an ordinate carried across to the other side.'],
  [/^Ordinate/, 'The square-across distance from a point on the curve to the axis.'],
  [/^Abscissa/, 'The distance along the axis from the vertex to where that ordinate meets it.'],
  [/^Focal chord/, 'Any chord that passes through the focus.'],
  [/^Chord/, 'A straight line joining two points on the curve.'],
  [/^Asymptote/, 'A line the hyperbola gets ever closer to but never reaches.'],
  [/^Tangent/, 'A line that just touches the curve at one point.'],
  [/^Normal/, 'The line at right angles to the tangent, at the point where it touches.'],
  [/^T$/, 'Where the tangent meets the directrix. Joining T to P draws the tangent.'],
  [/^E$/, 'The top of the scale line. Joining A to E measures out the ratio for every point at once.'],
  // A bare O is the centre in every construction that labels one; a bare C is NOT — in the two
  // ellipse constructions it is an end of the minor axis, and in the tangent method it is the
  // foot of the abscissa. The old blanket "C is the centre" was wrong wherever it now appears,
  // and the Engineering Terms panel is what made that visible (ADR-098).
  [/^O$/, 'The centre of the curve — where its two axes cross.'],
]);

/**
 * Every named element the CURRENT drawing actually contains, with the sentence that explains it
 * and the display-list item that highlights it (ADR-098). Derived from the drawing rather than
 * from a fixed word list, so the panel can never offer a term this figure has not got — and
 * hovering one always lights something up.
 *
 * @param {ReturnType<typeof layoutFor>} layout
 * @returns {Array<{term:string, say:string, item:object}>}
 */
export function sheetTerms(layout) {
  const seen = new Map();
  for (const it of layout.items) {
    if (it.k !== 'label') continue;
    const say = tipFor(it);
    if (!say || seen.has(it.text)) continue;
    seen.set(it.text, { term: it.text, say, item: it });
  }
  return [...seen.values()].sort((a, b) => a.term.localeCompare(b.term));
}

/** The sentence for one display-list item, or null if it has none to give. */
function tipFor(it) {
  if (it.k === 'poly' && it.role === 'outline') {
    return 'The finished curve — the same outline as the cut face on the cone beside it.';
  }
  if (it.k !== 'label') return null;
  for (const [pattern, text] of SHEET_TIPS) if (pattern.test(it.text)) return text;
  return null;
}

/** Distance from a point to a segment, in the same units as its inputs. */
function distToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * What is under the cursor on the sheet, and what it is for.
 *
 * Points and captions win over lines, and lines over the curve, so the small precise targets
 * are reachable inside the big ones. Pure: the caller supplies the same `view` it drew with.
 *
 * @param {{project:(p:{x:number,y:number})=>{x:number,y:number}}} view
 * @param {ReturnType<typeof layoutFor>} layout
 * @param {number} x  Cursor position in CSS px, relative to the canvas.
 * @param {number} y
 * @returns {{item:object, text:string}|null}
 */
export function describeAt(view, layout, x, y) {
  const cursor = { x, y };
  let best = null;
  let bestRank = Infinity;

  for (const it of layout.items) {
    const text = tipFor(it);
    if (!text) continue;

    let d = Infinity;
    let rank = 3;
    if (it.k === 'label' || it.k === 'dot') {
      const p = view.project(it.p);
      d = Math.hypot(p.x - cursor.x, p.y - cursor.y);
      rank = 0;
    } else if (it.k === 'line') {
      d = distToSegment(cursor, view.project(it.a), view.project(it.b));
      rank = 1;
    } else if (it.k === 'poly' && it.pts?.length) {
      for (let i = 1; i < it.pts.length && d > HIT_PX; i++) {
        d = Math.min(d, distToSegment(cursor, view.project(it.pts[i - 1]), view.project(it.pts[i])));
      }
      rank = 2;
    }

    if (d <= HIT_PX && rank < bestRank) { best = { item: it, text }; bestRank = rank; }
  }
  return best;
}

/** Candidate displacements for a label that will not fit where it was authored, in units of
 *  the text's own line height. Tried in order: as authored, then stepping away vertically,
 *  then to the far side horizontally. */
// Tried in order: where it was authored, then stepping away vertically, then sideways, then
// the diagonals. The diagonals were added when captions began avoiding LINEWORK as well as one
// another (ADR-116) — with more obstacles a purely vertical ladder ran out and dropped names
// that had a perfectly good corner to move into.
/**
 * How heavily a caption is set, from the caption itself (ADR-116).
 *
 * `'division'` — the numbering a construction is built on: 1, 2, 3 and their primed partners.
 * `'point'`    — a named point: A, B, C, V, F′, V₁. The shortest text on the sheet and the most
 *                looked-for, since a learner following a written procedure hunts for the letter.
 * `null`       — everything else, chiefly the dimension captions, which are read once in place.
 *
 * Inferred rather than hand-tagged so a construction added later cannot forget to ask for it; a
 * layout that sets `emphasis` explicitly still wins. Exported so the classification is checkable
 * without a canvas.
 *
 * @param {string} text
 * @returns {'division'|'point'|null}
 */
export function labelWeight(text) {
  if (/^\d+['′]?$/.test(text)) return 'division';
  if (/^[A-Z][₀-₉]?['′]?$/.test(text)) return 'point';
  return null;
}

const LABEL_NUDGES = [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [-1, 0], [1, 0],
  [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -3], [0, 3], [-1, -2], [1, -2], [-1, 2], [1, 2],
  [-2, 0], [2, 0], [0, -4], [0, 4]];

/**
 * Paint the captions last and NEVER on top of one another. A figure like §6.4's
 * nomenclature carries a dozen names round one ellipse; drawn where each was authored they
 * pile up, and a caption a learner cannot read teaches nothing. Each one is measured, tried
 * where it was asked for, then nudged along a fixed ladder of alternatives, and dropped
 * only if every one of them is taken.
 *
 * Priority decides who keeps their place: the marked apparatus the current step is ABOUT
 * (P, F, the directrix) claims its spot first, the axes next, and the general nomenclature
 * last — so the caption that gets dropped on a crowded figure is always the least load-bearing.
 */
function drawLabels(ctx, view, layout, palette, roomy, showConstruction = true, anonymous = false) {
  ctx.setLineDash([]);
  ctx.font = palette.font;
  ctx.textBaseline = 'alphabetic';

  // The caller composes the font from tokens, so its size is read back rather than assumed.
  const textPx = parseFloat(palette.font) || 12;
  const lineHeight = textPx * 1.15;
  const rank = { mark: 0, plot: 1, axis: 2, outline: 3 };
  const labels = layout.items
    .filter((it) => it.k === 'label' && (roomy || it.role === 'axis')
      && (showConstruction || (it.role ?? 'construction') !== 'construction')
      && !(anonymous && it.naming))
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (rank[a.it.role] ?? 3) - (rank[b.it.role] ?? 3) || a.i - b.i);

  // The finished curve is the one piece of linework a caption must never sit on: it is the
  // answer the whole figure exists to produce. Its projected points become obstacles, so a
  // name is nudged off the curve the same way it is nudged off another name.
  const onCurve = [];
  // …and since ADR-116 the same is true of the CENTRE LINES and the marked apparatus. Those are
  // the lines a drawing is read from — the axes, the tangent, the normal, the directrix, the
  // latus rectum — so a caption sitting across one hides the thing it is naming. The dense
  // construction fan is deliberately NOT an obstacle: a figure like the oblong method leaves
  // almost no clear paper, and treating every thin line as blocking would drop most of the
  // numbering. Those are handled by the halo below instead.
  const OBSTACLE_ROLES = new Set(['outline', 'axis', 'mark']);
  // Working lines are SOFT obstacles (ADR-118). A caption steps off one where it can, and
  // accepts sitting across it where it cannot — which on a figure like the oblong method is
  // often, since the fan leaves almost no clear paper. Dropping the caption instead would be
  // worse, and the halo keeps it readable either way.
  const softly = [];
  for (const it of layout.items) {
    if (it.k === 'line' && (it.role ?? 'construction') === 'construction') {
      const a = view.project(it.a); const b = view.project(it.b);
      for (let t = 0; t <= 1; t += 1 / 10) {
        softly.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (!OBSTACLE_ROLES.has(it.role)) continue;
    if (it.k === 'line') {
      // Sampled along its length rather than tested as a segment: the free() check below is a
      // point-in-box test, and 12 samples is plenty at the scales this sheet draws at.
      const a = view.project(it.a); const b = view.project(it.b);
      for (let t = 0; t <= 1; t += 1 / 12) {
        onCurve.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      continue;
    }
    if (it.k === 'poly' && it.pts) for (const q of it.pts) onCurve.push(view.project(q));
    else if (it.k === 'circle') {
      for (let a = 0; a < TAU; a += TAU / 64) {
        onCurve.push(view.project({ x: it.c.x + it.r * Math.cos(a), y: it.c.y + it.r * Math.sin(a) }));
      }
    }
  }

  const placed = [];
  const clearOf = (box, pts) => !pts.some((q) => q.x > box.x && q.x < box.x + box.w
    && q.y > box.y && q.y < box.y + box.h);
  const free = (box) => !placed.some((o) => box.x < o.x + o.w && box.x + box.w > o.x
      && box.y < o.y + o.h && box.y + box.h > o.y)
    && clearOf(box, onCurve);

  // Division numbering carries the correspondence a construction is built on, so it is set a
  // little larger and bolder than the rest of the annotation — readable at a glance without
  // becoming a second layer of drawing (ADR-102). Composed from the caller's own font.
  //
  // The single-letter POINT names — A, B, C, V, F′, P — get the same treatment one step down
  // (ADR-116). They are the shortest text on the sheet and the most looked-for: a learner
  // following a written procedure is hunting for the letter it names. Dimension captions keep
  // the base size; they are read once, in place, and enlarging them would crowd the drawing.
  //
  // Weight is INFERRED from the text where a layout has not said otherwise, so a construction
  // added later cannot forget to ask for it, and an explicit `emphasis` still wins.
  const strongPx = Math.round(textPx * 1.2);
  const strongFont = palette.font.replace(/^(\d+(?:\.\d+)?)px/, `700 ${strongPx}px`);
  const pointPx = Math.round(textPx * 1.12);
  const pointFont = palette.font.replace(/^(\d+(?:\.\d+)?)px/, `600 ${pointPx}px`);
  const weightOf = (it) => it.emphasis ?? labelWeight(it.text);

  for (const { it } of labels) {
    const weight = weightOf(it);
    ctx.font = weight === 'division' ? strongFont : weight === 'point' ? pointFont : palette.font;
    const px = weight === 'division' ? strongPx : weight === 'point' ? pointPx : textPx;
    const p = view.project(it.p);
    const w = ctx.measureText(it.text).width;
    // Two passes down the same ladder: the first wants a spot clear of the working lines too,
    // the second settles for one clear of the linework that must never be covered (ADR-118).
    // Same ordering either way, so a caption still lands as near to where it was authored as
    // the drawing allows.
    let box = null;
    for (const strict of [true, false]) {
      for (const [nx, ny] of LABEL_NUDGES) {
        const x = p.x + it.dx + nx * (w + 6);
        const y = p.y + it.dy + ny * lineHeight;
        const candidate = { x: x - 2, y: y - px, w: w + 4, h: lineHeight };
        if (free(candidate) && (!strict || clearOf(candidate, softly))) { box = candidate; break; }
      }
      if (box) break;
    }
    if (!box) continue; // every alternative taken: a dropped caption beats an unreadable one
    placed.push(box);
    // Clear the paper behind the text before setting it (ADR-116). This is what a drawing
    // office does with dimension text over hatching or a lattice of thin lines, and it is what
    // keeps the oblong method's numbering legible where it must sit across the fan. It is the
    // PAPER colour, so nothing is added to the palette — only the background showing through.
    if (palette.paper) {
      ctx.fillStyle = palette.paper;
      ctx.fillRect(box.x, box.y + px - textPx * 0.82, box.w, textPx * 1.06);
    }
    ctx.fillStyle = it.role === 'mark' ? palette.mark
      : it.role === 'plot' ? palette.curve
        : palette.construction;
    ctx.fillText(it.text, box.x + 2, box.y + px);
  }
  ctx.font = palette.font;
}

function drawItem(ctx, view, it, pen, palette) {
  const style = pen[it.role] ?? pen.construction;
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.stroke;
  ctx.lineWidth = style.width;
  ctx.setLineDash(it.dash ?? []);
  // Multiplied, not assigned: the caller may already have dimmed this item as earlier context
  // while a construction plays (ADR-099), and a projection line inside that context is lighter
  // still. The caller resets the alpha before the next item.
  if (style.alpha !== undefined) ctx.globalAlpha *= style.alpha;

  switch (it.k) {
    case 'line': {
      const a = view.project(it.a);
      const b = view.project(it.b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    }
    case 'poly': {
      if (!it.pts?.length) break;
      ctx.beginPath();
      const first = view.project(it.pts[0]);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < it.pts.length; i++) {
        const q = view.project(it.pts[i]);
        ctx.lineTo(q.x, q.y);
      }
      if (it.closed) ctx.closePath();
      ctx.stroke();
      break;
    }
    case 'circle': {
      const c = view.project(it.c);
      ctx.beginPath();
      ctx.arc(c.x, c.y, it.r * view.pxPerMm, 0, TAU);
      ctx.stroke();
      break;
    }
    case 'arc': {
      // Pan/zoom is a uniform similarity, so a circle in sheet space stays a circle in px.
      const c = view.project(it.c);
      ctx.beginPath();
      ctx.arc(c.x, c.y, it.r * view.pxPerMm, it.a0, it.a1);
      ctx.stroke();
      break;
    }
    case 'dot': {
      const p = view.project(it.p);
      ctx.beginPath();
      // A plotted point IS the answer at that spot, so it is drawn a size up from the marks
      // that merely locate things (ADR-118). Construction dots stay small — they are noted,
      // not read off.
      const r = it.role === 'construction' ? DOT_PX * 0.7
        : it.role === 'plot' ? DOT_PX * 1.25
          : DOT_PX;
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      break;
    }
    case 'label': {
      const p = view.project(it.p);
      ctx.setLineDash([]);
      ctx.font = palette.font;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = it.role === 'mark' ? palette.mark : palette.construction;
      ctx.fillText(it.text, p.x + it.dx, p.y + it.dy);
      break;
    }
    default:
      break;
  }
  ctx.setLineDash([]);
}
