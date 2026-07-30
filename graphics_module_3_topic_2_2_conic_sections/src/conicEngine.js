// Conic-curve engine — the pure 2D sheet leaf (root DECISIONS.md ADR-084, the ADR-066
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
// the chapter is quoted in mm (ADR-083).
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

function frameItems(model, { axisFrom, axisTo, span, showVertex = true, axisLabel = true }) {
  const items = [
    line(pt(axisFrom, 0), pt(axisTo, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -span), pt(0, span), 'axis'),
    label(pt(0, span), 'Directrix', 6, 14, 'axis'),
    dot(model.focus),
    label(model.focus, 'Focus', 8, 16),
  ];
  // Suppressed on the terminology sheet of a central conic, where the major / transverse
  // axis label already names this same line and the two captions land on each other.
  if (axisLabel) items.push(label(pt(axisTo, 0), 'Axis', -2, -8, 'axis'));
  if (showVertex) {
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

function locusLayout(conic) {
  const model = conicModel(conic.e, conic.fa);
  const at = pointOnConic(model, conic.pointT);
  const span = 1.25 * curveHalfHeight(model);
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

  items.push(...frameItems(model, { axisFrom: -0.6 * conic.fa, axisTo: axisEnd(model), span }));
  items.push(poly(conicPolyline(model), 'outline'));

  // The ratio, drawn: PF to the focus, PQ perpendicular to the directrix. The two
  // measurements are labelled on OPPOSITE sides of their own segments, and the ratio is
  // parked above the curve, so nothing lands on the focus pill or on the vertex.
  const Q = pt(0, at.p.y);
  items.push(line(at.p, model.focus, 'mark'));
  items.push(line(at.p, Q, 'mark', [5, 4]));
  items.push(dot(Q), label(Q, 'Q', -18, -8));
  items.push(dot(at.p), label(at.p, 'P', 9, -9));
  const pf = len(sub(at.p, model.focus));
  const pq = Math.abs(at.p.x);
  const above = at.p.y <= 0 ? -1 : 1; // keep each label on the side P is already on
  items.push(label(mid(at.p, model.focus), `PF = ${pf.toFixed(1)}`, 6, above * 16));
  items.push(label(mid(at.p, Q), `PQ = ${pq.toFixed(1)}`, -14, above * -10));
  items.push(label(pt(model.focus.x, -span * 0.86),
    `e = PF / PQ = ${(pq > 0.01 ? pf / pq : conic.e).toFixed(3)}`, -60, 0));

  return finish('locus', items, model);
}

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
  items.push(line(at.p, mirror, 'construction', [5, 4]));
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
    items.push(line(at.p, opposite, 'construction', [6, 4]));
    items.push(label(opposite, 'Focal chord', 6, 14, 'construction'));
  }

  // --- Per-curve terms ------------------------------------------------------------
  if (conic.curve === 'Ellipse') {
    const { centre, a, b } = model;
    items.push(dot(centre), label(centre, 'C', -4, 18));
    items.push(line(pt(centre.x - a, 0), pt(centre.x + a, 0), 'mark'));
    items.push(label(pt(centre.x + a, 0), 'Major axis', -46, -8));
    items.push(line(pt(centre.x, -b), pt(centre.x, b), 'mark'));
    items.push(label(pt(centre.x, -b), 'Minor axis', 6, -8));
    items.push(dot(model.focus2), label(model.focus2, 'Focus', 7, 14));
    items.push(dot(model.vertex2), label(model.vertex2, "V'", 6, 16));
    items.push(line(pt(model.directrix2X, -span), pt(model.directrix2X, span), 'axis'));
    items.push(label(pt(model.directrix2X, span), 'Directrix', -62, 14, 'axis'));
    // Auxiliary circles (§6.4 item 3) — described on the major and minor axes.
    items.push(circle(centre, a, 'construction', [4, 4]));
    items.push(circle(centre, b, 'construction', [4, 4]));
    
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
    items.push(dot(centre), label(centre, 'O', -4, 20));
    // The second branch — a hyperbola has two branches, two foci, two directrices.
    items.push(poly(mirrorAbout(conicPolyline(model), centre.x), 'outline'));
    items.push(line(pt(centre.x - a, 0), pt(centre.x + a, 0), 'mark'));
    items.push(label(pt(centre.x - a, 0), 'Transverse axis', -8, -8));
    items.push(line(pt(centre.x, -b), pt(centre.x, b), 'mark', [6, 4]));
    items.push(label(pt(centre.x, -b), 'Conjugate axis', -18, -8));
    items.push(dot(model.focus2), label(model.focus2, 'Focus', -18, 16));
    items.push(line(pt(model.directrix2X, -span), pt(model.directrix2X, span), 'axis'));
    items.push(label(pt(model.directrix2X, span), 'Directrix', -62, 14, 'axis'));
    // Asymptotes — tangents at infinity (§6.8 item 5); they intersect the auxiliary
    // circle on the directrix, which is why that circle is drawn with them.
    const reach = 1.9 * (a + b);
    for (const s of [-1, 1]) {
      const d = norm(pt(a, s * b));
      items.push(line(sub(centre, mul(d, reach)), add(centre, mul(d, reach)), 'axis', [8, 4]));
      items.push(label(add(centre, mul(d, reach)), 'Asymptote', -30, s > 0 ? 14 : -8, 'axis'));
    }
    items.push(circle(centre, a, 'construction', [4, 4]));
    
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
 * watches the drawing happen instead of meeting it finished (ADR-086). An absent
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
  const stage = conic.buildStage ?? 5;
  const items = frameItems(model, {
    axisFrom: -0.5 * fa,
    axisTo: axisEnd(model),
    span,
    showVertex: stage >= 1,
  });

  items.push(label(pt(0, 0), 'A', -14, 18, 'axis'));

  // Stage 1 — divide AF into (p + q) equal parts and mark the vertex V at q of them.
  if (stage >= 1) {
    for (let i = 1; i < ratio.p + ratio.q; i++) {
      const x = (fa * i) / (ratio.p + ratio.q);
      items.push(line(pt(x, -4), pt(x, 4), 'construction'));
    }
  }

  // Stage 2 — VE ⊥ axis with VE = VF, joined to A and produced: the eccentricity scale,
  // whose ordinate at any x is exactly e·x, which is the radius each arc needs.
  const vf = fa - model.vertex.x;
  const E = pt(model.vertex.x, -vf);
  if (stage >= 2) {
    items.push(line(model.vertex, E, 'construction'));
    items.push(dot(E), label(E, 'E', -14, -6));
    const scaleEnd = pt(axisEnd(model), -e * axisEnd(model));
    items.push(line(pt(0, 0), scaleEnd, 'construction'));
    items.push(label(scaleEnd, 'Eccentricity scale', -30, -10, 'construction'));
  }

  // Stage 3 — points 1, 2, 3 … on the axis; a perpendicular through each; an arc from F
  // of radius (the scale's ordinate there) cutting it above and below.
  if (stage >= 3) {
    const last = pointsExtent(model);
    const n = Math.max(2, Math.round(conic.points));
    for (let i = 1; i <= n; i++) {
      const x = model.vertex.x + ((last - model.vertex.x) * i) / n;
      const r = e * x;                                   // = the AE scale's ordinate at x
      const dy = Math.sqrt(Math.max(r * r - (x - fa) * (x - fa), 0));
      if (dy < 1e-6) continue;
      items.push(line(pt(x, -dy - 10), pt(x, dy + 10), 'construction'));
      items.push(line(pt(x, 0), pt(x, -r), 'construction', [3, 3])); // the scale ordinate
      const a0 = Math.atan2(-dy, x - fa);
      items.push(arc(model.focus, r, a0 - 0.28, a0 + 0.28, 'construction'));
      items.push(arc(model.focus, r, -a0 - 0.28, -a0 + 0.28, 'construction'));
      items.push(dot(pt(x, -dy), 'construction'), dot(pt(x, dy), 'construction'));
      items.push(label(pt(x, 0), String(i), -3, 16, 'construction'));
    }
  }

  // Stage 4 — the smooth curve through V, P₁, P₂, P₃ …
  if (stage >= 4) items.push(poly(conicPolyline(model), 'outline'));

  // Stage 5 — the tangent and normal at P.
  if (stage >= 5 && conic.showTangent) {
    items.push(...tangentNormalItems(model, pointOnConic(model, conic.pointT)));
  }

  // The frame is pinned to the FINISHED construction's own extents, not to what this
  // stage happens to have drawn — otherwise the sheet would rescale on every stage of the
  // playback and the drawing would appear to swim.
  const end = axisEnd(model);
  const reach = Math.max(span, e * end, curveHalfHeight(model));
  return finish('eccentricity', items, model, null,
    { minX: -0.5 * fa, maxX: end, minY: -reach, maxY: reach });
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
// MODE 'methods' — the eleven remaining constructions, §6.5.2–5, §6.7.2–5,
// §6.9.2–4. One builder each; all of them return the same display list, so the
// renderer never learns a method's name.
// ============================================================================

const METHOD_BUILDERS = {
  'ellipse-concentric': ellipseConcentric,
  'ellipse-oblong': ellipseOblong,
  'ellipse-parallelogram': ellipseParallelogram,
  'ellipse-arcs': ellipseArcs,
  'parabola-tangent': parabolaTangent,
  'parabola-rectangle': parabolaRectangle,
  'parabola-parallelogram': parabolaParallelogram,
  'parabola-offset': parabolaOffset,
  'hyperbola-foci': hyperbolaFoci,
  'hyperbola-ordinate': hyperbolaOrdinate,
  'hyperbola-asymptotes': hyperbolaAsymptotes,
};

function methodsLayout(conic) {
  const build = METHOD_BUILDERS[conic.method] ?? ellipseConcentric;
  const built = build(conic);
  return finish('methods', built.items, built.model ?? null, built.curvePts);
}

/** Ellipse polyline about a centre from its semi-axes (y-down, so no sign care needed). */
function ellipsePts(centre, a, b, samples = CURVE_SAMPLES) {
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = (i / samples) * TAU;
    return pt(centre.x + a * Math.cos(t), centre.y + b * Math.sin(t));
  });
}

// ---- Example 6.2, Fig. 6.6 — concentric (auxiliary) circles -------------------
function ellipseConcentric(conic) {
  const a = conic.dim1 / 2;
  const b = conic.dim2 / 2;
  const O = pt(0, 0);
  const items = [
    circle(O, a, 'construction'),
    circle(O, b, 'construction'),
    line(pt(-a - 8, 0), pt(a + 8, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b - 8), pt(0, b + 8), 'axis', [10, 3, 2, 3]),
    label(pt(a, 0), 'B', 8, 4, 'axis'),
    label(pt(-a, 0), 'A', -14, 4, 'axis'),
    label(pt(0, -b), 'C', -4, -8, 'axis'),
    label(pt(0, b), 'D', -4, 16, 'axis'),
    dot(O), label(O, 'O', -12, 14),
  ];

  // Divide the circles into 12 equal parts; through each outer point drop a parallel
  // to CD and through the matching inner point a parallel to AB — they meet on the curve.
  for (let k = 0; k < CIRCLE_DIVISIONS; k++) {
    const t = (k / CIRCLE_DIVISIONS) * TAU;
    const outer = pt(a * Math.cos(t), a * Math.sin(t));
    const inner = pt(b * Math.cos(t), b * Math.sin(t));
    const p = pt(outer.x, inner.y);
    items.push(line(O, outer, 'construction'));
    items.push(line(outer, p, 'construction'));
    items.push(line(inner, p, 'construction'));
    items.push(dot(p, 'construction'));
    items.push(label(outer, String(k + 1), 5, -5, 'construction'));
  }

  const curvePts = ellipsePts(O, a, b);
  items.push(poly(curvePts, 'outline', true));
  pushAxisMarks(items, O, a, b);
  if (conic.showTangent) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  return { items, curvePts };
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
function ellipseOblong(conic) {
  const a = conic.dim1 / 2;
  const b = conic.dim2 / 2;
  const O = pt(0, 0);
  const n = 4; // the textbook's "say 4"
  const items = [
    poly([pt(-a, -b), pt(a, -b), pt(a, b), pt(-a, b)], 'construction', true),
    line(pt(-a, 0), pt(a, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b), pt(0, b), 'axis', [10, 3, 2, 3]),
    label(pt(-a, -b), 'E', -12, -6, 'construction'),
    label(pt(a, -b), 'G', 8, -6, 'construction'),
    label(pt(a, b), 'K', 8, 14, 'construction'),
    label(pt(-a, b), 'L', -12, 14, 'construction'),
    label(pt(-a, 0), 'A', -14, 4, 'axis'),
    label(pt(a, 0), 'B', 8, 4, 'axis'),
    dot(O), label(O, 'O', -12, 14),
  ];

  const C = pt(0, -b); // top of the minor axis
  const D = pt(0, b);  // bottom of the minor axis
  const quarter = [];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const onEdge = pt(side * a, -b * f);            // divisions of the half height AE
      const onAxis = pt(side * a * (1 - f), 0);       // divisions of the half axis AO
      items.push(line(C, onEdge, 'construction'));
      items.push(line(D, onAxis, 'construction'));
      const q = intersect(C, onEdge, D, onAxis);
      if (q) { quarter.push(q); items.push(dot(q, 'construction')); }
      items.push(label(onEdge, `${i}`, side < 0 ? -12 : 6, 0, 'construction'));
      items.push(label(onAxis, `${i}'`, -3, 16, 'construction'));
    }
  }

  const curvePts = ellipsePts(O, a, b);
  items.push(poly(curvePts, 'outline', true));
  pushAxisMarks(items, O, a, b);
  if (conic.showTangent) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  return { items, curvePts };
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

  const items = [
    line(A, B, 'mark'), line(C, D, 'mark'),
    label(A, 'A', -14, 4), label(B, 'B', 8, 4),
    label(C, 'C', 4, -8), label(D, 'D', -6, 16),
    poly([add(A, v), add(B, v), add(B, mul(v, -1)), add(A, mul(v, -1))], 'construction', true),
    dot(O), label(O, 'O', -12, 16),
    label(mid(O, v), `${conic.dim3 ?? 70}°`, 10, 10, 'construction'),
  ];

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
      items.push(line(C, onEdge, 'construction'));
      items.push(line(D, onDia, 'construction'));
      const q = intersect(C, onEdge, D, onDia);
      if (q) items.push(dot(q, 'construction'));
    }
  }

  // The curve: the affine image of the unit circle under [u, v].
  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const t = (i / CURVE_SAMPLES) * TAU;
    return add(O, add(mul(u, Math.cos(t)), mul(v, Math.sin(t))));
  });
  items.push(poly(curvePts, 'outline', true));

  // The axes of the curve fall out of the conjugate pair (Example 6.4 steps 3–4:
  // the semicircle on OD cuts the ellipse at K, CK gives the minor axis direction).
  const axes = principalAxes(u, v);
  items.push(line(sub(O, mul(axes.major.dir, axes.major.len)), add(O, mul(axes.major.dir, axes.major.len)), 'axis', [10, 3, 2, 3]));
  items.push(line(sub(O, mul(axes.minor.dir, axes.minor.len)), add(O, mul(axes.minor.dir, axes.minor.len)), 'axis', [10, 3, 2, 3]));
  items.push(label(add(O, mul(axes.major.dir, axes.major.len)), 'Major axis', 6, -6, 'axis'));
  items.push(label(add(O, mul(axes.minor.dir, axes.minor.len)), 'Minor axis', 6, 14, 'axis'));
  return { items, curvePts };
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

  const items = [
    line(pt(-a - 10, 0), pt(a + 10, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -b - 10), pt(0, b + 10), 'axis', [10, 3, 2, 3]),
    dot(F), label(F, 'F', -6, 16),
    dot(F2), label(F2, "F'", 6, 16),
    label(A, 'A', -14, 4, 'axis'), label(B, 'B', 8, 4, 'axis'),
    label(mid(F, F2), `${conic.dim1.toFixed(0)}`, -8, 18, 'construction'),
    label(pt(0, -b), `${conic.dim2.toFixed(0)} = P₁F + P₁F'`, 8, -8, 'construction'),
  ];

  // Mark points 1, 2, 3 … on FO; the arc of radius A-i about F crosses the arc of
  // radius B-i about F' on the curve, because (A-i) + (B-i) = AB = the constant sum.
  const n = Math.max(2, Math.round(conic.points));
  for (let i = 1; i <= n; i++) {
    const xi = -c + (c * i) / (n + 1);
    items.push(dot(pt(xi, 0), 'construction'), label(pt(xi, 0), String(i), -3, 16, 'construction'));
    const rA = Math.abs(xi - A.x);
    const rB = Math.abs(B.x - xi);
    const cross = circleCross(F, rA, F2, rB);
    if (!cross) continue;
    for (const [centre, r] of [[F, rA], [F2, rB]]) {
      const a0 = Math.atan2(cross.y - centre.y, cross.x - centre.x);
      items.push(arc(centre, r, a0 - 0.3, a0 + 0.3, 'construction'));
      items.push(arc(centre, r, -a0 - 0.3, -a0 + 0.3, 'construction'));
    }
    items.push(dot(cross, 'construction'), dot(pt(cross.x, -cross.y), 'construction'));
    items.push(label(cross, `P${i}`, 5, -6, 'construction'));
  }

  const curvePts = ellipsePts(O, a, b);
  items.push(poly(curvePts, 'outline', true));
  if (conic.showTangent) items.push(...ellipseTangentItems(O, a, b, conic.pointT));
  return { items, curvePts };
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
function parabolaTangent(conic) {
  const dOrd = conic.dim1;   // double ordinate AB
  const abs = conic.dim2;    // abscissa CV
  const V = pt(0, 0);
  const C = pt(abs, 0);
  const A = pt(abs, -dOrd / 2);
  const B = pt(abs, dOrd / 2);
  const E = pt(-abs, 0);     // CV produced to E with VE = CV

  const n = Math.max(4, Math.round(conic.points) * 2);
  const items = [
    line(pt(-abs - 10, 0), pt(abs + 14, 0), 'axis', [10, 3, 2, 3]),
    line(A, B, 'mark'),
    label(mid(A, B), `Double ordinate ${dOrd.toFixed(0)}`, 8, 0),
    label(mid(V, C), `Abscissa ${abs.toFixed(0)}`, -18, 18, 'axis'),
    line(A, E, 'construction'), line(B, E, 'construction'),
    dot(E), label(E, 'E', -12, -6),
    dot(V), label(V, 'V', -12, -8),
    label(A, 'A', 8, 8), label(B, 'B', 8, -4), label(C, 'C', 10, 16, 'axis'),
  ];

  // Divide AE and BE into the same number of parts and join 1-1', 2-2' … — the
  // parabola is the envelope those chords are tangent to.
  for (let i = 1; i < n; i++) {
    const p1 = lerp(A, E, i / n);
    const p2 = lerp(E, B, i / n);
    items.push(line(p1, p2, 'construction'));
    items.push(dot(p1, 'construction'), dot(p2, 'construction'));
  }

  // y² = 4f·x through A: f = (dOrd/2)² / (4·abs).
  const f = (dOrd * dOrd) / (16 * abs);
  const curvePts = parabolaPts(V, f, abs, 1);
  items.push(poly(curvePts, 'outline'));
  items.push(dot(pt(f, 0)), label(pt(f, 0), 'Focus, F', 6, -8));
  items.push(line(pt(-f, -dOrd * 0.6), pt(-f, dOrd * 0.6), 'axis'));
  items.push(label(pt(-f, -dOrd * 0.6), 'Directrix, DD', -30, -8, 'axis'));
  if (conic.showTangent) items.push(...parabolaTangentItems(V, f, abs, conic.pointT));
  return { items, curvePts };
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

  const items = [
    poly([A, B, Cc, D], 'construction', true),
    line(pt(0, -8), pt(0, R + 10), 'axis', [10, 3, 2, 3]),
    dot(V), label(V, 'V', 8, -6),
    label(A, 'A', -14, 8, 'construction'), label(B, 'B', 8, 8, 'construction'),
    label(D, 'D', -14, -6, 'construction'), label(Cc, 'C', 8, -6, 'construction'),
    label(mid(A, B), `Base ${S.toFixed(0)}`, -14, 18, 'construction'),
    label(mid(D, A), `Rise ${R.toFixed(0)}`, -34, 0, 'construction'),
  ];

  // Divide DV (half the top edge) and AD (the side) into the same number of parts;
  // the vertical through i on DV meets V-i on AD at a point of the curve.
  for (const side of [-1, 1]) {
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const onTop = pt((side * S / 2) * (1 - u), 0);
      const onSide = pt(side * S / 2, R * (1 - u));
      items.push(line(onTop, pt(onTop.x, R), 'construction'));
      items.push(line(V, onSide, 'construction'));
      const q = intersect(onTop, pt(onTop.x, R), V, onSide);
      if (q) items.push(dot(q, 'construction'));
      items.push(label(onTop, String(i), -3, -6, 'construction'));
      items.push(label(onSide, `${i}'`, side < 0 ? -12 : 6, 0, 'construction'));
    }
  }

  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const x = -S / 2 + (S * i) / CURVE_SAMPLES;
    return pt(x, R * (2 * x / S) ** 2);
  });
  items.push(poly(curvePts, 'outline'));
  // In this frame the axis is vertical, so the focal distance is measured down the axis.
  const f = (S * S) / (16 * R);
  items.push(dot(pt(0, f)), label(pt(0, f), 'Focus, F', 8, 4));
  items.push(line(pt(-S * 0.55, -f), pt(S * 0.55, -f), 'axis'));
  items.push(label(pt(-S * 0.55, -f), 'Directrix, DD', 0, -8, 'axis'));
  return { items, curvePts };
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

  const items = [
    poly([K, L, M, N], 'construction', true),
    label(K, 'K', -14, 8, 'construction'), label(L, 'L', 8, 8, 'construction'),
    label(M, 'M', 8, -6, 'construction'), label(N, 'N', -14, -6, 'construction'),
    line(O, P, 'construction', [6, 4]),
    label(mid(O, P), 'Mid-line OP', -20, -8, 'construction'),
  ];

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
      items.push(line(onTop, add(onTop, mul(norm(dirTop), side)), 'construction'));
      items.push(line(apex, onSide, 'construction'));
      const q = intersect(onTop, add(onTop, mul(norm(dirTop), side)), apex, onSide);
      if (q) items.push(dot(q, 'construction'));
    }
  }

  // Affine image of y = x² : P(u) = apex + u·(half chord) + u²·(the leg), u ∈ [−1, 1].
  const halfChord = mul(sub(L, K), 0.5);
  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const u = -1 + (2 * i) / CURVE_SAMPLES;
    return add(apex, add(mul(halfChord, u), mul(mul(leg, -1), u * u)));
  });
  items.push(poly(curvePts, 'outline'));

  // The axis is the diameter through the apex — found by the chord-bisector
  // construction in the book, drawn here through the same two points it produces.
  const axisDir = norm(mul(leg, -1));
  items.push(line(sub(apex, mul(axisDir, side * 0.4)), add(apex, mul(axisDir, side * 1.4)), 'axis', [10, 3, 2, 3]));
  items.push(dot(V), label(V, 'V', 8, -6));
  items.push(label(add(apex, mul(axisDir, side * 1.4)), 'Axis AB', 6, 14, 'axis'));
  return { items, curvePts };
}

// ---- Example 6.11, Fig. 6.16 — parabola by the offset method -----------------
function parabolaOffset(conic) {
  const base = conic.dim1;
  const axis = conic.dim2;
  const n = 4; // the textbook's "say 4", so the side divides into 4² = 16
  const V = pt(0, 0);
  const K = pt(-base / 2, axis), L = pt(base / 2, axis);
  const N = pt(-base / 2, 0), M = pt(base / 2, 0);

  const items = [
    poly([K, L, M, N], 'construction', true),
    line(pt(0, -8), pt(0, axis + 10), 'axis', [10, 3, 2, 3]),
    label(K, 'K', -14, 8, 'construction'), label(L, 'L', 8, 8, 'construction'),
    label(M, 'M', 8, -6, 'construction'), label(N, 'N', -14, -6, 'construction'),
    dot(V), label(V, 'V', 8, -8),
    label(mid(K, L), `Base ${base.toFixed(0)}`, -14, 18, 'construction'),
    label(mid(N, K), `Axis ${axis.toFixed(0)}`, -34, 0, 'construction'),
  ];

  // Divide NV into n parts and KN into n² parts: the offset at the i-th division is
  // i² of those parts — the squares that give the method its name.
  for (let i = 1; i <= n * n; i++) {
    const y = (axis * i) / (n * n);
    if (i === 1 || i === 4 || i === 9 || i === 16) {
      items.push(line(pt(-base / 2, y), pt(base / 2, y), 'construction'));
      const k = Math.round(Math.sqrt(i));
      items.push(label(pt(-base / 2, y), `${k}² = ${i}`, -34, 4, 'construction'));
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 1; i <= n; i++) {
      const x = (s * base / 2) * (i / n);
      const y = axis * (i / n) ** 2;
      items.push(line(pt(x, 0), pt(x, y), 'construction'));
      items.push(dot(pt(x, y), 'construction'));
      items.push(label(pt(x, 0), String(i), -3, -6, 'construction'));
    }
  }

  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) => {
    const x = -base / 2 + (base * i) / CURVE_SAMPLES;
    return pt(x, axis * (2 * x / base) ** 2);
  });
  items.push(poly(curvePts, 'outline'));
  const f = (base * base) / (16 * axis);
  items.push(dot(pt(0, f)), label(pt(0, f), 'Focus, F', 8, 4));
  items.push(line(pt(-base * 0.55, -f), pt(base * 0.55, -f), 'axis'));
  items.push(label(pt(-base * 0.55, -f), 'Directrix, DD', 0, -8, 'axis'));
  return { items, curvePts };
}

// ---- Example 6.13, Fig. 6.19 — hyperbola from the foci and the difference ----
function hyperbolaFoci(conic) {
  const c = conic.dim1 / 2;                 // half the distance between the foci
  const a = Math.min(conic.dim2 / 2, c * 0.95); // half the constant difference
  const b = Math.sqrt(Math.max(c * c - a * a, 1));
  const O = pt(0, 0);
  const F1 = pt(c, 0), F2 = pt(-c, 0);
  const V1 = pt(a, 0), V2 = pt(-a, 0);

  const items = [
    line(pt(-c - 20, 0), pt(c + 20, 0), 'axis', [10, 3, 2, 3]),
    line(pt(0, -c - 20), pt(0, c + 20), 'axis', [10, 3, 2, 3]),
    dot(F1), label(F1, 'F₁', 6, 16), dot(F2), label(F2, 'F₂', -18, 16),
    dot(V1), label(V1, 'V₁', 4, -8), dot(V2), label(V2, 'V₂', -18, -8),
    dot(O), label(O, 'O', -6, 18),
    circle(O, c, 'construction', [4, 4]),
    label(mid(F2, F1), `${conic.dim1.toFixed(0)}`, -8, 20, 'construction'),
    label(mid(V2, V1), `${conic.dim2.toFixed(0)} = P F₂ − P F₁`, -20, -10, 'construction'),
  ];

  // Points 2, 3, 4 … on the axis beyond V₁; arcs of radius 2V₁ from F₁ and 2V₂ from
  // F₂ cross on the curve, since their difference stays V₁V₂ = the given difference.
  const n = Math.max(2, Math.round(conic.points));
  for (let i = 1; i <= n; i++) {
    const x = a + ((1.9 * c - a) * i) / n;      // points 2, 3, 4 … on the axis beyond V₁
    const r1 = x - a;                            // radius to V₁
    const r2 = x + a;                            // radius to V₂ — their difference is 2a
    items.push(dot(pt(x, 0), 'construction'), label(pt(x, 0), String(i + 1), -3, 18, 'construction'));
    const cross = circleCross(F2, r2, F1, r1);
    if (!cross) continue;
    for (const [ctr, r] of [[F1, r1], [F2, r2]]) {
      const ang0 = Math.atan2(cross.y - ctr.y, cross.x - ctr.x);
      items.push(arc(ctr, r, ang0 - 0.25, ang0 + 0.25, 'construction'));
      items.push(arc(ctr, r, -ang0 - 0.25, -ang0 + 0.25, 'construction'));
    }
    items.push(dot(cross, 'construction'), dot(pt(cross.x, -cross.y), 'construction'));
    items.push(label(cross, `P${i}`, 6, -6, 'construction'));
  }

  const right = hyperbolaPts(O, a, b, 1);
  const left = hyperbolaPts(O, a, b, -1);
  items.push(poly(right, 'outline'), poly(left, 'outline'));
  // Asymptotes: tangents to the circle of radius c at V₁ and V₂ meet it at J, K, L, M,
  // and the lines through O and those points are the asymptotes (Example 6.13 steps 3–5).
  const reach = 1.7 * (a + b);
  for (const s of [-1, 1]) {
    const d = norm(pt(a, s * b));
    items.push(line(sub(O, mul(d, reach)), add(O, mul(d, reach)), 'axis', [8, 4]));
    items.push(label(add(O, mul(d, reach)), 'Asymptote', -34, s > 0 ? 14 : -8, 'axis'));
  }
  // Directrices at x = ±a²/c.
  for (const s of [-1, 1]) {
    const x = (s * a * a) / c;
    items.push(line(pt(x, -c), pt(x, c), 'axis'));
    items.push(label(pt(x, -c), 'Directrix', -20, -8, 'axis'));
  }
  return { items, curvePts: right };
}

/** One branch of x²/a² − y²/b² = 1 about a centre, opening toward +x·`sign`. */
function hyperbolaPts(O, a, b, sign, samples = CURVE_SAMPLES) {
  const tMax = Math.asinh(2.0);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = -tMax + (2 * tMax * i) / samples;
    return pt(O.x + sign * a * Math.cosh(t), O.y + b * Math.sinh(t));
  });
}

// ---- Example 6.14, Fig. 6.20 — ordinate, abscissa and transverse axis --------
function hyperbolaOrdinate(conic) {
  const tAxis = conic.dim1;          // transverse axis V₁V₂
  const absc = conic.dim2;           // abscissa V₁E
  const ord = conic.dim3 ?? 60;      // single ordinate
  const a = tAxis / 2;
  const V2 = pt(-a, 0), V1 = pt(a, 0);
  const E = pt(a + absc, 0);
  const B = pt(E.x, ord), Cc = pt(E.x, -ord);
  const D = pt(a, -ord), A = pt(a, ord);
  const n = Math.max(3, Math.round(conic.points));
  const b = ord / Math.sqrt(Math.max(((a + absc) / a) ** 2 - 1, 1e-6));

  const items = [
    line(pt(-a - 20, 0), pt(E.x + 14, 0), 'axis', [10, 3, 2, 3]),
    poly([A, B, Cc, D], 'construction', true),
    dot(V1), label(V1, 'V₁', -6, -8), dot(V2), label(V2, 'V₂', -18, -8),
    label(mid(V2, V1), `Transverse axis ${tAxis.toFixed(0)}`, -30, 20, 'axis'),
    label(mid(V1, E), `Abscissa ${absc.toFixed(0)}`, -18, 20, 'axis'),
    label(B, `Ordinate ${ord.toFixed(0)}`, 8, 0, 'construction'),
  ];

  // Divide DC and CE into the same number of equal parts (Example 6.14 step 2), then
  // join V₁ with 1', 2', 3' on the top edge DC and V₂ with 1, 2, 3 on the ordinate edge
  // CE: each pair of joins crosses ON the curve. (Verified numerically — the OTHER
  // pairing, V₁ to the ordinate edge, misses the hyperbola entirely.)
  for (const s of [-1, 1]) {
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      const onEdge = pt(E.x, s * ord * u);            // divisions of CE, counted from E
      const onTop = pt(a + absc * u, s * ord);        // divisions of DC, counted from D
      items.push(line(V1, onTop, 'construction'));
      items.push(line(V2, onEdge, 'construction'));
      const q = intersect(V1, onTop, V2, onEdge);
      if (q) items.push(dot(q, 'construction'));
      items.push(label(onEdge, `${i}`, 6, 0, 'construction'));
      items.push(label(onTop, `${i}'`, -3, s < 0 ? -6 : 14, 'construction'));
    }
  }

  const curvePts = hyperbolaPts(pt(0, 0), a, b, 1);
  items.push(poly(curvePts, 'outline'));
  return { items, curvePts };
}

// ---- Example 6.15, Fig. 6.21 — asymptotes and a point on the curve -----------
function hyperbolaAsymptotes(conic) {
  const ang = deg(conic.dim1 ?? 80);   // angle between the asymptotes
  const hFromX = conic.dim2;           // P's distance from the horizontal asymptote
  const hFromY = conic.dim3 ?? 45;     // P's distance from the inclined one, horizontally
  const O = pt(0, 0);
  const ox = pt(1, 0);                             // asymptote OX
  const oy = pt(Math.cos(ang), -Math.sin(ang));    // asymptote OY
  const n = Math.max(3, Math.round(conic.points) + 2);

  // P is hFromX above OX; hFromY along OX from where OY reaches that height.
  const yP = -hFromX;
  const xOnOY = (yP / oy.y) * oy.x;
  const P = pt(xOnOY + hFromY, yP);
  const reach = 6 * hFromY;

  const items = [
    line(O, mul(ox, reach), 'axis', [8, 4]),
    line(O, mul(oy, reach * 0.55), 'axis', [8, 4]),
    label(mul(ox, reach), 'Asymptote OX', -40, 16, 'axis'),
    label(mul(oy, reach * 0.55), 'Asymptote OY', 6, -6, 'axis'),
    label(mul(ox, hFromY * 0.5), `${conic.dim1 ?? 80}°`, 0, -8, 'construction'),
    dot(P), label(P, 'P', 8, -8),
    line(pt(P.x - reach * 0.5, P.y), pt(P.x + reach * 0.6, P.y), 'construction'), // AB ∥ OX
    line(sub(P, mul(oy, hFromX * 1.6)), add(P, mul(oy, hFromX * 1.2)), 'construction'), // CD ∥ OY
    label(pt(P.x, 0), `${hFromX.toFixed(0)}`, 4, 16, 'construction'),
  ];

  // The curve is u·v = constant in the ASYMPTOTE frame (§6.8: "the product of the
  // distances of a point on a hyperbola from the asymptotes … is a constant"), so P's own
  // pair of distances fixes it. `u` runs along OX from the OY leg, `v` up from OX.
  const uP = P.x - xOnOY;
  const k = uP * hFromX;
  const at = (u) => {
    const v = k / u;
    return pt((v / -oy.y) * oy.x + u, -v);
  };

  // Mark 1, 2, 3 … each side of P: O-i meets the parallels through P, and the pair of
  // parallels through those crossings meets on the curve.
  for (let i = 1; i <= n; i++) {
    const u = uP * (0.45 + (2.1 * i) / n);
    const q = at(u);
    items.push(line(O, mul(norm(q), len(q) * 1.06), 'construction'));
    items.push(line(q, pt(q.x, P.y), 'construction'));            // parallel to OY's drop
    items.push(line(q, add(q, mul(ox, uP * 0.5)), 'construction')); // parallel to OX
    items.push(dot(q, 'construction'));
    items.push(label(q, `P${i}`, 6, -6, 'construction'));
  }

  const curvePts = Array.from({ length: CURVE_SAMPLES + 1 }, (_, i) =>
    at(uP * (0.32 + (3.1 * i) / CURVE_SAMPLES)));
  items.push(poly(curvePts, 'outline'));
  return { items, curvePts };
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
    case 'locus':
    default: return locusLayout(conic);
  }
}

/**
 * Close a layout: attach the mode, the model (where there is one) and the bbox. A layout
 * whose drawn content changes while its FRAME must not (the staged construction) passes an
 * explicit `bbox` instead of letting the drawn items measure it.
 */
function finish(mode, items, model = null, curvePts = null, bbox = null) {
  return { mode, items, model, curvePts, bbox: bbox ?? bboxOf(items) };
}

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

/** Draw order by role, so a layout can push items in construction order and still
 *  paint in drafting order. */
const ROLE_ORDER = ['construction', 'axis', 'outline', 'mark', 'label'];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{project:(p:{x:number,y:number})=>{x:number,y:number}, pxPerMm:number}} view
 * @param {ReturnType<typeof layoutFor>} layout
 * @param {{ink:string, construction:string, curve:string, mark:string, font:string}} palette
 *   Resolved token colours + a ready-built font string (no DOM access in here).
 */
export function drawSheet(ctx, view, layout, palette) {
  const pen = {
    construction: { stroke: palette.construction, width: THIN_PX },
    axis: { stroke: palette.construction, width: THIN_PX },
    outline: { stroke: palette.curve, width: OUTLINE_PX },
    mark: { stroke: palette.mark, width: MARK_PX },
  };

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Below roughly a pixel and a third per millimetre, a 12 px caption stands nine
  // millimetres tall in drawing terms — the annotation stops being a label and becomes
  // the drawing. On a sheet that small only the three references a learner needs to read
  // the figure at all survive; expanding the sheet brings the rest back.
  const roomy = view.pxPerMm >= 1.3;

  for (const role of ROLE_ORDER) {
    for (const it of layout.items) {
      if ((it.role ?? 'construction') !== role && !(role === 'label' && it.k === 'label')) continue;
      if (role === 'label' && it.k !== 'label') continue;
      if (role !== 'label' && it.k === 'label') continue;
      if (it.k === 'label' && !roomy && it.role !== 'axis') continue;
      drawItem(ctx, view, it, pen, palette);
    }
  }
}

function drawItem(ctx, view, it, pen, palette) {
  const style = pen[it.role] ?? pen.construction;
  ctx.strokeStyle = style.stroke;
  ctx.fillStyle = style.stroke;
  ctx.lineWidth = style.width;
  ctx.setLineDash(it.dash ?? []);

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
      ctx.arc(p.x, p.y, it.role === 'construction' ? DOT_PX * 0.7 : DOT_PX, 0, TAU);
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
