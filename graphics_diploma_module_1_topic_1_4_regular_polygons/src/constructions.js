// Pure geometry for the three regular-polygon constructions. NO DOM here — every function
// returns plain data (points, line segments, arc/circle definitions). renderConstruction.js
// is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 200x200 drawing area (SVG viewBox units), origin top-left, y
// increases downward — same convention as every prior topic, whose generic primitives
// (dist/midpoint/angleOf/pointAt/pointAlong/circleIntersect/lineIntersect/sortByY/P/L/
// arcMark/moveArc/dim/outwardOffset/circleStep) are copied verbatim here.
//
// New to this topic: EVERY construction offers 2-3 alternate METHODS for reaching the SAME
// regular polygon (a live method switcher, uiManager.js's #method-switcher — see CLAUDE.md).
// `regularPolygonVertices(A, B, n)` below is the shared ground-truth calculation (a regular
// n-gon on a stated side AB has exactly one shape: circumradius R = s/(2 sin(π/n)), vertices
// spaced 360°/n apart around a computed centre O), and every method reads its final vertices
// off it, so switching methods always shows a different derivation path converging on the
// SAME polygon, never a different-looking one. What differs per method is which of those
// vertices are shown as independently, verifiably derived (not merely decorated) versus
// carried from the shared ground truth once the method's own technique runs out: the n-gon's
// semicircle-division method (buildSemicircleDivision()) independently derives EVERY vertex
// past B — a ray from A through each semicircle division point, cut by an arc of radius AB
// centred on the previously-found vertex, exactly the polygon.pdf sequence (rays extended
// past the arc, "Draw a line connecting A and Nth division" repeated per division) — verified
// exact for n=3..12 (see the numeric check referenced in buildSemicircleDivision()'s own
// header). An earlier version of this file claimed that technique was "numerically disproved
// for n≥7"; that claim was itself wrong (a ray-origin bug, not a geometric limit) and has been
// corrected here and in DECISIONS.md ADR-143.
//
// A note on precision: pentagon (n=5) and hexagon (n=6) are compass-and-straightedge
// constructible (Gauss–Wantzel), so their methods below are exact derivations, not
// approximations. The general n-gon's semicircle-division method is exact and general for
// ANY n (it divides an angle with a protractor-style split, not a compass radius, which is
// exactly why it works where a pure-compass method can't — most n, e.g. 7, 9, 11, are NOT
// compass-constructible at all). Its perpendicular-bisector method follows Regular
// Polygons.pdf Fig 5.24's own centre-point ladder (4, 5, 6, 7…), which is itself only exact
// for n=4 and n=6 — see buildPerpendicularBisector()'s header comment and ADR-143 for exactly
// where and why this sim's ladder departs from the book's literal equal-interval step.
//
// Every step in a recipe carries a `role`:
//   'given'  — the construction's starting element(s), stated by the problem
//   'move'   — a compass arc/circle or straightedge guide drawn WHILE building
//   'result' — the polygon's sides and vertices the construction was built to produce
// renderConstruction.js maps role -> the DESIGN.md §2 construction-line token.
//
// Step Through (ADR-095 addendum): the N-Gon construction's two build()s ALSO return a
// `slides: { caption, startIdx, endIdx }[]` array (never the pentagon/hexagon ones — that
// key's presence, not a construction-id check, is what main.js/uiManager.js branch on), each
// covering a contiguous run of the SAME steps array Play All already plays flat. Own header
// comments on buildSemicircleDivision() and buildPerpendicularBisector() explain how each
// method's slides are staged — one is a literal match to a real slide deck (polygon.pdf), the
// other a designed analogue over a static book page with no slide deck of its own (Regular
// Polygons.pdf Fig 5.24) — do not conflate the two or assume both are equally "sourced".

// ----------------------------------------------------------------------------
// Geometry primitives
// ----------------------------------------------------------------------------

const deg2rad = (d) => (d * Math.PI) / 180;

function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function angleOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointAt(center, r, angleRad) {
  return { x: center.x + r * Math.cos(angleRad), y: center.y + r * Math.sin(angleRad) };
}

/** Both intersection points of two circles, or null if they don't cross. */
function circleIntersect(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d > r1 + r2 || d < Math.abs(r1 - r2) || d === 0) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const xm = c1.x + (a * (c2.x - c1.x)) / d;
  const ym = c1.y + (a * (c2.y - c1.y)) / d;
  const dx = (h * (c2.y - c1.y)) / d;
  const dy = (h * (c2.x - c1.x)) / d;
  return [{ x: xm + dx, y: ym - dy }, { x: xm - dx, y: ym + dy }];
}

/** The two candidates from circleIntersect, sorted [upper, lower] (smaller y first). */
function sortByY(cands) {
  if (!cands) return null;
  return cands[0].y <= cands[1].y ? cands : [cands[1], cands[0]];
}

/** The one shared ground truth: a regular n-gon built on side AB (A = vertex 0, B = vertex
 *  1, going around in the same rotational sense as A→B) has exactly one shape. Returns the
 *  circumcentre O, circumradius R, apothem, and all n vertices in order. Every method below
 *  derives this SAME O by a different route, then reads vertices/R off it identically. */
function regularPolygonVertices(A, B, n) {
  const s = dist(A, B);
  const apothem = s / (2 * Math.tan(Math.PI / n));
  const R = s / (2 * Math.sin(Math.PI / n));
  const M = midpoint(A, B);
  const dirAB = angleOf(A, B);
  const perpDir = dirAB - Math.PI / 2; // the side the polygon builds toward
  const O = { x: M.x + apothem * Math.cos(perpDir), y: M.y + apothem * Math.sin(perpDir) };
  const thetaA = angleOf(O, A);
  const thetaB = angleOf(O, B);
  let step = thetaB - thetaA;
  while (step <= -Math.PI) step += 2 * Math.PI;
  while (step > Math.PI) step -= 2 * Math.PI;
  const mag = (2 * Math.PI) / n;
  step = step < 0 ? -mag : mag; // normalize to the exact central angle, sign from real geometry
  const vertices = [];
  for (let k = 0; k < n; k++) vertices.push(pointAt(O, R, thetaA + step * k));
  return { O, R, apothem, vertices };
}

// ----------------------------------------------------------------------------
// Step builders — each returns a plain object renderConstruction.js knows how to draw
// ----------------------------------------------------------------------------

/** `away`, if given, is an optional {dx,dy} hint for renderConstruction.js's label-collision
 *  pass — the label's FIRST candidate position, before it searches for a clear spot. Every
 *  point is still a fixed obstacle regardless of whether it has a label of its own. */
const P = (p, role, label, away) => ({ kind: 'point', role, p, label, dx: away?.dx, dy: away?.dy });
/** A label-offset hint pointing from `center` through `p`, scaled to `dist` units — "place
 *  this label on the far side of its point from `center`", the direction that's usually
 *  already clear of whatever's driving the construction (the semicircle's own centre, or the
 *  polygon's circumcentre). Mirrors outwardOffset() below, for the 'point' step kind instead
 *  of a dim() line. */
function awayFrom(center, p, dist = 6) {
  const dx = p.x - center.x, dy = p.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: (dx / len) * dist, dy: (dy / len) * dist };
}
const L = (a, b, role, label) => ({ kind: 'line', role, a, b, label });
/** A short compass-arc mark: half-span degrees centered on the direction toward aimPoint. */
const arcMark = (center, radius, aimPoint, spanDeg = 60) => {
  const a = angleOf(center, aimPoint);
  const half = deg2rad(spanDeg / 2);
  return { kind: 'arc', role: 'move', center, radius, startAngle: a - half, endAngle: a + half };
};
/** A fully-specified compass arc drawn WHILE constructing (exact span, not a short mark) —
 *  used here for the semicircle-division method's 180° sweep. */
const moveArc = (center, radius, startAngle, endAngle) =>
  ({ kind: 'arc', role: 'move', center, radius, startAngle, endAngle });
/** A full given/auxiliary circle, drawn as a native SVG <circle> (renderConstruction.js). */
const circleStep = (center, radius, role) => ({ kind: 'circle', role, center, radius });
/** A dimension mark: extension lines + an arrowed offset line + a value, spanning a→b. */
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });
/** An angle mark: a small arc between two rays from `center` (toward rayA, rayB) plus its
 *  degree value — the angular counterpart to dim(). Every method in this topic hinges on a
 *  specific angle (54°, 60°, an interior angle) that was previously stated only in text
 *  (principle()/resultText) and never actually shown on the drawing itself. */
const angleDim = (center, rayA, rayB, text, role, radius = 10) => ({ kind: 'angledim', role, center, rayA, rayB, text, radius });

/** Signed dim()/offset-line offset that points AWAY from `awayFrom`. */
function outwardOffset(a, b, awayFrom, magnitude) {
  const px = -(b.y - a.y);
  const py = b.x - a.x;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dot = px * (awayFrom.x - mx) + py * (awayFrom.y - my);
  return dot > 0 ? -magnitude : magnitude;
}

// ----------------------------------------------------------------------------
// Framing — fit + centre a finished recipe into the fixed 200x200 SVG viewBox
// ----------------------------------------------------------------------------
//
// Every build() below constructs its geometry in local mm-ish space at an arbitrary,
// unscaled anchor (A at the origin, B at (side, 0)) — real side-length units, no ad hoc
// clamp. Two separate operations turn that into what's actually drawn:
//   - calibratedScale() fixes ONE screen-space scale per construction, lazily, from the
//     WORST-CASE natural extent across every one of its methods at max(side)[, max(n)] —
//     computed once and cached, never recomputed from the CURRENT params' own bounds. These
//     are literal similarity constructions (every coordinate scales exactly linearly with
//     `side`), so a scale that instead re-fit to the CURRENT config's own bounds on every
//     call would shrink in exact lockstep with side/n growing — the on-screen drawing would
//     never visibly change size at all, which is the opposite of what "the drawing should
//     scale with the dimension" (Phase A audit's defect 5) means. Mirrors the platform's
//     ADR-053 "intrinsic size, recomputed only when the modelled object's own size changes,
//     never a live/positional auto-fit" split (RULES.md §5.19) — every parameter in this
//     topic (side, n) IS a true size parameter, so there's no positional-slider case (e.g.
//     Module 2's distHP/distVP) to guard against here.
//   - centerAt() recentres THAT config's own current bounds at the frame centre, redone on
//     every build() call — position tracks the current geometry even though size doesn't.
// Previously each build() hard-coded its own fixed anchor + a per-shape scale CEILING
// (`Math.min(1, K / side)`), so past that ceiling the geometry silently stopped growing while
// the "N mm" label kept climbing, and every construction sat off-centre at every param value
// that wasn't the one the anchor happened to be tuned for (Phase A audit, ADR-145).
// The viewBox itself was widened 200x140 -> 200x200 (ADR-146): all three constructions'
// worst-case raw geometry is square-to-tall (aspect 0.89-1.07), so a 1.429-aspect landscape
// frame left height as the binding constraint everywhere, capping every construction's scale
// well below what the frame's width could actually support — worst on the n-gon (its own
// worst case, n=12, is far larger than pentagon/hexagon's), which is why n=6 read as
// noticeably small even though ADR-145's scale/centre math was already correct.

/** Mirrors renderConstruction.js's computeBounds() — duplicated rather than imported, since
 *  this file stays leaf/import-free (CLAUDE.md's layering contract: a leaf module must not
 *  import a sibling leaf, only main.js may). Keep the two in sync: renderConstruction.js's
 *  copy is what ensureVisible() later measures the SAME (already-fitted) steps against, and
 *  the dim/angledim reach margins in both mirror the max label-push distance
 *  assignLabelPositions() can choose (see renderConstruction.js). */
function rawBounds(steps) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const upd = (x, y) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const step of steps) {
    if (step.kind === 'point' || step.kind === 'label') {
      upd(step.p.x, step.p.y);
    } else if (step.kind === 'line') {
      upd(step.a.x, step.a.y);
      upd(step.b.x, step.b.y);
    } else if (step.kind === 'circle') {
      upd(step.center.x - step.radius, step.center.y - step.radius);
      upd(step.center.x + step.radius, step.center.y + step.radius);
    } else if (step.kind === 'arc') {
      // A partial arc's bbox is NOT the full circle's — sample its actual angular span
      // (mirrors renderConstruction.js's computeBounds()); using the full-circle bbox here
      // would over-count every short compass-mark arc, skewing the fit off-centre.
      const n = 16;
      for (let i = 0; i <= n; i++) {
        const a = step.startAngle + (step.endAngle - step.startAngle) * (i / n);
        upd(step.center.x + step.radius * Math.cos(a), step.center.y + step.radius * Math.sin(a));
      }
    } else if (step.kind === 'dim') {
      upd(step.a.x, step.a.y);
      upd(step.b.x, step.b.y);
      const len = dist(step.a, step.b) || 1;
      const px = -(step.b.y - step.a.y) / len;
      const py = (step.b.x - step.a.x) / len;
      const reach = (step.offset ?? 10) + 18; // + worst-case label push, renderConstruction.js
      upd(step.a.x + px * reach, step.a.y + py * reach);
      upd(step.b.x + px * reach, step.b.y + py * reach);
    } else if (step.kind === 'angledim') {
      const reach = (step.radius ?? 10) + 18; // + worst-case label push, renderConstruction.js
      upd(step.center.x - reach, step.center.y - reach);
      upd(step.center.x + reach, step.center.y + reach);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/** Applies one uniform scale + translate to every step's positions AND geometric magnitudes
 *  (radius, dim `offset`) — but never to a label's `dx`/`dy` hint, which stays a fixed
 *  final-space offset regardless of how big the construction itself is (the "labels stay a
 *  constant size, geometry scales" half of the fix — awayFrom()'s `dist` parameter already
 *  fixes a hint's magnitude independent of the underlying coordinate scale, so leaving dx/dy
 *  untouched here is correct whether a hint was computed before or after this runs). */
function applyTransform(steps, scale, tx, ty) {
  const tp = (p) => ({ x: p.x * scale + tx, y: p.y * scale + ty });
  const tm = (v) => v * scale; // a magnitude (radius/offset) — scales, never translates
  return steps.map((step) => {
    // dx/dy is a point's label-offset HINT (awayFrom()/applyOutwardHints(), raw pre-scale
    // units) — must scale in lockstep with p or it ends up interpreted as final-space px
    // against an already-scaled point, the same magnitude-scaling `tm()` already gives
    // 'dim'/'circle'/'arc' below. Unscaled, a fixed raw hint reads oversized on any tightly-
    // packed raw-space point cluster (e.g. the bisector ladder points, ADR-153) even though
    // it looks fine on widely-spaced points (e.g. polygon vertices) at the exact same magnitude.
    if (step.kind === 'point' || step.kind === 'label') {
      return {
        ...step, p: tp(step.p),
        dx: step.dx != null ? tm(step.dx) : step.dx,
        dy: step.dy != null ? tm(step.dy) : step.dy,
      };
    }
    if (step.kind === 'line') return { ...step, a: tp(step.a), b: tp(step.b) };
    if (step.kind === 'circle' || step.kind === 'arc') {
      return { ...step, center: tp(step.center), radius: tm(step.radius) };
    }
    if (step.kind === 'dim') {
      return { ...step, a: tp(step.a), b: tp(step.b), offset: step.offset != null ? tm(step.offset) : step.offset };
    }
    if (step.kind === 'angledim') {
      return {
        ...step,
        center: tp(step.center), rayA: tp(step.rayA), rayB: tp(step.rayB),
        radius: step.radius != null ? tm(step.radius) : step.radius,
      };
    }
    return step;
  });
}

const scaleCache = new Map();

/** A construction's on-screen scale, calibrated ONCE (lazily, cached by construction id) from
 *  the worst-case natural extent across every one of its methods at max(side)[, max(n)] — see
 *  this section's header comment for why a live per-config recompute would defeat defect 5's
 *  fix instead of fixing it. `rawFn` is that construction's own raw builder (`pentagonRaw` etc,
 *  below); `given`/`methods` are its own ConstructionDef fields, read via the caller's `this`. */
function calibratedScale(id, rawFn, given, methods, { width = 200, height = 200, margin = 6 } = {}) {
  if (scaleCache.has(id)) return scaleCache.get(id);
  const maxParams = Object.fromEntries(given.map((g) => [g.key, g.max]));
  let scale = Infinity;
  for (const m of methods) {
    const { steps } = rawFn({ ...maxParams, method: m.id });
    const b = rawBounds(steps);
    const w = Math.max(b.maxX - b.minX, 1e-6);
    const h = Math.max(b.maxY - b.minY, 1e-6);
    scale = Math.min(scale, (width - margin * 2) / w, (height - margin * 2) / h);
  }
  scaleCache.set(id, scale);
  return scale;
}

// A construction's chrome (font-size, stroke-width, angle-arc radius — never geometry
// position) reads oversized at any param combo below the worst-case ceiling calibratedScale()
// freezes on, because chrome is drawn at fixed absolute constants while the geometry itself
// draws smaller (deliberately — ADR-145's "drawing scales with side/n"). chromeScaleFor()
// is the ratio between the scale calibratedScale() actually froze and the scale that would
// have exactly fit the CURRENT params alone — i.e. how much smaller than the calibration
// ceiling the current drawing is. A caller multiplies every chrome constant by this ratio so
// chrome shrinks in lockstep with the geometry instead of staying pinned to the worst case.
// Floored, not left to shrink freely, so the smallest allowed config never goes illegible.
const CHROME_SCALE_FLOOR = 0.5;

function chromeScaleFor(id, rawFn, given, methods, params, opts) {
  const frozenScale = calibratedScale(id, rawFn, given, methods, opts);
  const { width = 200, height = 200, margin = 6 } = opts ?? {};
  const { steps } = rawFn(params);
  const b = rawBounds(steps);
  const w = Math.max(b.maxX - b.minX, 1e-6);
  const h = Math.max(b.maxY - b.minY, 1e-6);
  const idealScale = Math.min((width - margin * 2) / w, (height - margin * 2) / h);
  const ratio = frozenScale / idealScale;
  return Math.min(1, Math.max(CHROME_SCALE_FLOOR, ratio));
}

/** Recentres `steps`' own current bounds at the frame centre, at the given fixed `scale` —
 *  the position half of the framing fix, redone on every build() call (unlike the scale). */
function centerAt(steps, scale, { width = 200, height = 200 } = {}) {
  const b = rawBounds(steps);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return applyTransform(steps, scale, width / 2 - cx * scale, height / 2 - cy * scale);
}

/** Fills in a real outward-from-centre label hint (awayFrom()) for every labelled point that
 *  doesn't already carry one. Several call sites never passed one (walkVerticesByCompass()'s
 *  own vertex letters, the given A/B points, the bisector ladder numbers) — those fell back to
 *  renderConstruction.js's fixed up-right default, which reads as "inward" for any point below
 *  or left of the circumcentre O (every construction here builds upward from a horizontal
 *  baseline, so up-right IS the interior direction for A and B specifically). Phase A audit,
 *  ADR-145. Skips a point that coincides with O itself (its own centre label) — awayFrom(O, O)
 *  has no direction to push toward, so it keeps the plain fallback instead. */
function applyOutwardHints(steps, O) {
  return steps.map((step) => {
    if (step.kind !== 'point' || !step.label || step.dx != null) return step;
    if (dist(step.p, O) < 1e-6) return step;
    const hint = awayFrom(O, step.p, 6);
    return { ...step, dx: hint.dx, dy: hint.dy };
  });
}

/** Fixes a defect `applyOutwardHints()` cannot: several call sites label TWO geometrically
 *  DIFFERENT points that happen to sit at the exact SAME coordinate — e.g.
 *  buildSemicircleDivision()'s division point (n-2) and vertex (n-1), proved coincident
 *  (float noise only, <5e-14) for every n from 3 to 12: the interior angle at A is exactly
 *  (n-2)*divAngle, which is exactly where division point (n-2) sits, and both points are
 *  radius `s` from A (a division point by construction; vertex (n-1) because it's A's
 *  neighbour along the closing side). `applyOutwardHints()` gives each an independent
 *  awayFrom() hint (division points away-from-A, vertex letters away-from-O) that can be too
 *  close in angle to clear two ~7-unit label boxes anchored at the SAME dot — no ring-widening
 *  in renderConstruction.js's candidateOffsets() can fix a genuinely same-point conflict.
 *  Root-caused this session (Phase A audit) after the n=6 "4"/"G" collision survived ADR-146/
 *  ADR-147's frame/margin changes untouched (those only ever changed scale, never label
 *  hints). Confirmed polygon.pdf's own n=5 worked example (slides 8-9) DOES keep both labels
 *  at the shared point — side by side, split along the arc's own tangent, not one suppressed —
 *  so this mirrors the source rather than dropping either label (ADR-148).
 *
 *  Runs AFTER applyOutwardHints() and deliberately OVERRIDES its hint for every point in a
 *  coincident group (unlike applyOutwardHints() itself, which only fills a MISSING hint and
 *  skips any point that already has one) — the two points here already carry hints, just ones
 *  too close together to help. Assigns each of a group's k members a hint at
 *  tangent-to-O + i*(360/k)deg, i=0..k-1: for the k=2 case this file actually produces, that's
 *  exactly a theta/theta+180 split (guaranteed max initial separation, same idea as an
 *  antipodal pair), and it generalizes to k>2 without a special case. Tangential (not radial)
 *  so neither member is pushed back toward the crowded interior the way taking one member's
 *  own outward hint as theta would send its +180 partner. Skips a group whose points share one
 *  label (nothing to separate) or that coincides with O itself (no direction to derive from —
 *  same guard applyOutwardHints() already uses). */
// Mirrors renderConstruction.js's labelBox()/boxesOverlap() for a 'point' label exactly
// (same duplication discipline as rawBounds() mirroring computeBounds(), above) — needed so
// the radius search below can prove the two members it just angled apart also clear EACH
// OTHER, not just guess a fixed distance. A guessed fixed distance (magnitude 6, matching
// awayFrom()'s own default) was tried first and left one live residual: n=12's "10"/"M" pair
// still grazed by ~0.02 units (labelBox()'s left/top-anchored shape means a longer 2-digit
// label like "10" reaches further right than a short "M" reaches left, so opposite ANGLES
// alone don't guarantee clearance — the DISTANCE has to be sized to the actual label widths).
function coincidentLabelBox(label, p, dx, dy) {
  const w = label.length * 4.3 + 1.5;
  const h = 7;
  return { x0: p.x + dx, x1: p.x + dx + w, y0: p.y + dy - h, y1: p.y + dy + 1.5 };
}
function coincidentBoxesOverlap(a, b, pad = 1) {
  return a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0;
}

// Phase A verify (2026-08-11): this function proves clearance in RAW pre-scale space using
// labelBox()'s magic constants unscaled, while the render judges the SAME box scaled by
// chromeScale (renderConstruction.js's labelBox()) after dx/dy has already been multiplied by
// calibratedScale (applyTransform()). The two scales aren't the same factor, so the true error
// is chromeScale/calibratedScale, not the 1/calibratedScale a naive read suggests. Measured for
// N-Gon (the only construction that ever emits a coincident group — pentagon/hexagon emit none):
// calibratedScale = 0.900, chromeScale ranges 0.5 (CHROME_SCALE_FLOOR) to 1 (worst-case params),
// so the render is up to 11% tighter than this search proves at large side/n and up to 80%
// LOOSER at small side/n. Exhaustively swept (both methods × n 3-12 × every integer side in
// range): zero overlaps at either the hint stage or after assignLabelPositions()'s real search,
// minimum clearance 1.22 units. The margin comes from this function's own `radius += 2` quantum
// and from coincidentBoxesOverlap()'s `pad = 1`, which is NOT scaled by chromeScale either — pad
// alone is worth ~1.11 raw units at the worst case, almost exactly covering the shortfall. A
// future change to `pad`, `CHROME_SCALE_FLOOR`, or the `radius += 2` step should re-run that
// sweep (constructions.js's own exports make it a small node script) rather than assume the
// margin still holds.
function separateCoincidentLabels(steps, O, eps = 1e-6) {
  const groups = [];
  for (const step of steps) {
    if (step.kind !== 'point' || !step.label) continue;
    if (dist(step.p, O) < eps) continue;
    let g = groups.find((g) => dist(g.p, step.p) < eps);
    if (!g) { g = { p: step.p, members: [] }; groups.push(g); }
    g.members.push(step);
  }
  const overrides = new Map();
  for (const g of groups) {
    if (g.members.length < 2) continue;
    if (g.members.every((m) => m.label === g.members[0].label)) continue;
    const baseAngle = angleOf(O, g.p) + Math.PI / 2; // tangent direction at this point
    const k = g.members.length;
    const angleFor = (i) => baseAngle + (i * 2 * Math.PI) / k;
    // Grow the shared radius (starting at awayFrom()'s own default magnitude) until every
    // pair of members' label boxes actually clears, proven with the SAME box model
    // assignLabelPositions() will judge them by — not assumed from the angle split alone.
    let radius = 6;
    for (let attempt = 0; attempt < 20; attempt++) {
      const boxes = g.members.map((m, i) => {
        const a = angleFor(i);
        return coincidentLabelBox(m.label, g.p, radius * Math.cos(a), radius * Math.sin(a));
      });
      let clear = true;
      for (let i = 0; i < boxes.length && clear; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (coincidentBoxesOverlap(boxes[i], boxes[j])) { clear = false; break; }
        }
      }
      if (clear) break;
      radius += 2;
    }
    g.members.forEach((m, i) => {
      const a = angleFor(i);
      overrides.set(m, { dx: radius * Math.cos(a), dy: radius * Math.sin(a) });
    });
  }
  if (!overrides.size) return steps;
  return steps.map((step) => {
    const hint = overrides.get(step);
    return hint ? { ...step, dx: hint.dx, dy: hint.dy } : step;
  });
}

/** Draws the circumcentre O and its circle — the shared anchor every method's vertex-walk
 *  starts from, once its own method-specific steps have located O. */
function drawCircumcircle(steps, O, R) {
  steps.push(P(O, 'move', 'O'), circleStep(O, R, 'move'));
}

/** WALK A COMPASS around the already-drawn circumcircle to mark each remaining vertex —
 *  plant the needle on the last-found vertex, swing an arc of radius = one side (every
 *  side of a regular polygon is the same length, so the SAME compass width that drew AB
 *  finds every other vertex too), and the crossing point on the circumcircle is the next
 *  vertex. Used by every method except semicircle-division, which has its own more direct
 *  technique (buildSemicircleDivision, below). A and B are already drawn/
 *  labelled as 'given', so the walk starts at B and stops one side short of closing back
 *  to A (whose point already exists — no need to re-mark it).
 *
 *  Returns the walk split into its two phases instead of pushing directly: the arc-cut +
 *  vertex-label steps (drawn as each vertex is found) and the polygon's own SIDES
 *  (deferred). Both polygon.pdf's semicircle-division method and Regular Polygons.pdf Fig
 *  5.24's perpendicular-bisector method defer every side to a final "join" step, well after
 *  every vertex is already marked — sides are NOT interleaved per-vertex in either source.
 *  Callers decide the push order: pentagon/hexagon's build() concatenates both halves
 *  immediately (arcAndLabelSteps then resultLines) so Play All's reveal order now matches
 *  the sources too; buildPerpendicularBisector() (below) uses the split directly to stage
 *  its own "cut the vertices" vs. "join the sides" slide marks. */
function walkVerticesByCompass(vertices, n) {
  const side = dist(vertices[0], vertices[1]);
  const arcAndLabelSteps = [];
  const resultLines = [];
  for (let k = 1; k < n; k++) {
    const from = vertices[k];
    const to = vertices[(k + 1) % n];
    const closesToA = k === n - 1;
    if (!closesToA) arcAndLabelSteps.push(arcMark(from, side, to, 45));
    resultLines.push(L(from, to, 'result'));
    if (!closesToA) arcAndLabelSteps.push(P(to, 'result', String.fromCharCode(65 + k + 1)));
  }
  return { arcAndLabelSteps, resultLines };
}

/** Perpendicular-bisector method (Regular Polygons.pdf Fig 5.24), generalized to any n.
 *  Builds the book's own ladder of centre-points 4, 5, 6, 7… up the perpendicular bisector of
 *  AB — each one the true circumcentre for a regular polygon of that many sides on side AB —
 *  stopping at point nn and drawing that polygon's circumcircle from there.
 *
 *  Points 4 and 6 are located exactly as the book does, by real compass arcs (point 4 = the
 *  arc centred on the AB-midpoint with radius to A; point 6 = the arc centred on B with radius
 *  AB) — both coincide exactly with the true apothem for n=4 and n=6, for any side length.
 *  Point 5 is the book's own literal midpoint of 4 and 6, which sits ~0.75% off the TRUE
 *  apothem for n=5 — the book's own approximation, kept deliberately (ADR-143) rather than
 *  silently "corrected". Continuing that SAME equal-interval step past 6 is where the book's
 *  method compounds fast (2.1% off by n=8 — a visible ~6.6° gap that would leave the polygon
 *  not closing), so points 7 upward are placed at their TRUE apothem instead of the book's
 *  extrapolated interval — the ladder still LOOKS like the book's, it just lands exactly.
 *
 *  The polygon itself is always drawn from the exact closed-form vertices
 *  (regularPolygonVertices) — never from the ladder's own point — so it closes exactly for
 *  every n. Only the overlay circle drawn from point nn can be very slightly (≤0.75%, at
 *  n=5 only) off the polygon's real circumcircle; imperceptible, and it does not affect where
 *  any vertex is drawn. n=3 is a special case: the book's ladder only starts at 4 (Fig 5.24
 *  has no triangle example), so a single point at the true apothem(3) stands in for the whole
 *  ladder rather than showing point 4's unrelated radius.
 *
 *  "O" denotes the circumcentre topic-wide (drawCircumcircle() is its only other emitter) —
 *  this method's AB-midpoint is drawn but deliberately left UNLABELLED rather than reusing that
 *  symbol for a point that is the circumcentre only at n=∞ (ADR-157). The real circumcentre this
 *  method reaches is the numbered ladder rung itself (point 4/5/6…nn), never separately labelled
 *  "O" — the ladder number IS its name here.
 *
 *  Slide grouping (Step Through, ADR-095 addendum): Fig 5.24 is a STATIC book page (a
 *  9-instruction numbered list for its own n=8 octagon example), not a slide deck — unlike
 *  buildSemicircleDivision()'s polygon.pdf source, there is no literal per-slide PDF to match
 *  here. The `mark()` calls below stage the book's own 9 numbered instructions as this
 *  method's "slides" instead — a designed analogue in the same spirit, not a faithful PDF
 *  port. Slide COUNT varies by n, following the same nn===3/nn>=5/nn>=7 branches the geometry
 *  itself already uses (fewer rungs on the ladder for a triangle/square than an octagon). */
function buildPerpendicularBisector(A, B, s, nn) {
  const methodSteps = [];
  const slides = [];
  const mark = (caption, fn) => {
    const startIdx = methodSteps.length;
    fn();
    if (methodSteps.length > startIdx) slides.push({ caption, startIdx, endIdx: methodSteps.length });
  };

  const { vertices } = regularPolygonVertices(A, B, nn);
  const M = midpoint(A, B);
  const upDir = { x: 0, y: -1 }; // matches regularPolygonVertices' perpDir for a horizontal
  const along = (h) => ({ x: M.x + upDir.x * h, y: M.y + upDir.y * h }); // AB, A left of B
  const apothem = (k) => s / (2 * Math.tan(Math.PI / k));
  // Every ladder point (3/4/5/6/7…nn) sits, by construction, ON the bisector line itself —
  // applyOutwardHints()'s default "away from O" hint is RADIAL, which for a point collinear
  // with O points straight at the ladder's own neighbouring point (e.g. point 5's hint aims
  // dead at point 4 or 6), guaranteeing a first-ring collision and forcing
  // candidateOffsets()'s widening-ring search to escalate outward. A Phase C audit (this
  // session, ADR-153 addendum) tested fixing the DIRECTION alone (tangential instead of
  // radial) first — measured no real improvement (91-110/141 ladder labels still escalated
  // across every hint angle tried, n=3..12 × 3 side values): the true driver is
  // assignLabelPositions()'s sequential greedy placement, 3+ labels genuinely competing for
  // the same ~10-15 unit vertical corridor, not the hint's own angle. What the same sweep DID
  // show working: a smaller base MAGNITUDE — halving it (6 → 3) roughly halved both how often
  // escalation triggers (89→58/141) and its worst case (13.2→6.6, since candidateOffsets()'s
  // ring multipliers are relative) — the ×2.2 worst ring is only ever as far as this base
  // makes it. Sideways (perpendicular to the vertical bisector) still beats radial outright
  // for the same reason as ADR-148's tangential coincident-point split: it can never point AT
  // another ladder point, only ever past one's side.
  const ladderHint = { dx: -3, dy: 0 };

  const r = Math.max(s * 0.62, s / 2 + 1);
  const cands = sortByY(circleIntersect(A, r, B, r));
  let invalid;
  if (!cands) {
    // Unreachable in practice (r > s/2 guarantees the two arcs cross) — guarded anyway rather
    // than silently skipping the bisector line if it ever isn't. No slide is staged in this
    // branch (mark()'s own empty-push guard skips it), so Step Through never lands on a
    // content-empty slide.
    invalid = 'Could not construct the perpendicular bisector for this side length.';
  } else {
    const [upper, lower] = cands;
    // The line drawn here has to carry the WHOLE ladder below, not just the two compass-arc
    // crossings — `[upper, lower]` alone reaches only ~0.366*s off M (Phase A audit), while the
    // ladder's own topmost rung sits well past that for every nn>=4 (0.5*s at point 4, up to
    // 1.866*s at point 12), leaving points 4/5/6/… floating off the end of a too-short segment
    // with nothing under them. `topK` is the highest-numbered rung actually PLOTTED below (not
    // always `nn`: nn===5 still plots point 6 as an intermediate rung before taking pt5's
    // midpoint), so `apothem(topK)` is always >= every plotted rung's own height. `upper`/
    // `lower` stay as their own point markers (the book shows both crossings) — only the LINE's
    // far endpoint moves.
    const topK = nn === 3 ? 3 : nn === 4 ? 4 : Math.max(nn, 6);
    const ladderTop = along(apothem(topK) + s * 0.08);
    mark('Construct the perpendicular bisector of AB.', () => {
      // unobtrusive (Phase D audit, ADR-153 addendum): these 4 arcs exist to FIND the bisector,
      // not to mark any one labelled point — upper/lower are unlabelled, so no point "owns"
      // them the way point 4 owns its own arc below. But their wide 55°-half-span sweep passes
      // right through the ladder's own neighbourhood, and unlike an owned arc (excluded by
      // onOwnArc() geometrically, since a ladder point sits ON its own arc) these are only ever
      // NEAR a ladder point, never on it — geometric self-exclusion can't reach them. Opting
      // them out of the obstacle set entirely is what actually gets point 4 off ring 3 (verified
      // via sweep: without this, point 4 stays at ring 3/mag 5.94 even with every other
      // exemption applied — see ADR-153 addendum for the full trace).
      methodSteps.push(
        { ...arcMark(A, r, upper, 55), unobtrusive: true },
        { ...arcMark(A, r, lower, 55), unobtrusive: true },
        { ...arcMark(B, r, upper, 55), unobtrusive: true },
        { ...arcMark(B, r, lower, 55), unobtrusive: true },
        L(lower, ladderTop, 'move'),
        P(upper, 'move'), P(lower, 'move'),
        P(M, 'move'),
      );
    });
  }

  let ptFinal;
  if (nn === 3) {
    // The book's ladder starts at 4 (Fig 5.24 has no n=3 case) — for a triangle there is
    // nothing to build up to, so place the one point directly rather than showing point 4's
    // (wrong) radius and correcting it away.
    mark("With AB's midpoint as centre, mark point 3 (no ladder needed for a triangle).", () => {
      ptFinal = along(apothem(3));
      methodSteps.push(arcMark(M, dist(M, A), ptFinal, 40), P(ptFinal, 'move', '3', ladderHint));
    });
  } else {
    mark("With AB's midpoint as centre and radius to A, draw an arc to point 4.", () => {
      const pt4 = along(apothem(4));
      methodSteps.push(arcMark(M, dist(M, A), pt4, 40), P(pt4, 'move', '4', ladderHint));
      ptFinal = pt4;
    });

    if (nn >= 5) {
      const pt4 = ptFinal;
      let pt6;
      mark('With centre B and radius AB, draw a second arc to point 6.', () => {
        pt6 = along(apothem(6));
        methodSteps.push(arcMark(B, s, pt6, 40), P(pt6, 'move', '6', ladderHint));
        ptFinal = pt6;
      });
      mark('Find the midpoint of 4 to 6 — point 5.', () => {
        const pt5 = midpoint(pt4, pt6); // book's method: literal midpoint, not apothem(5)
        methodSteps.push(P(pt5, 'move', '5', ladderHint));
        ptFinal = nn === 5 ? pt5 : pt6;
      });
      if (nn >= 7) {
        mark(`Mark centre points 7, 8, … ${nn} at equal intervals up the bisector.`, () => {
          for (let k = 7; k <= nn; k++) {
            const ptK = along(apothem(k));
            methodSteps.push(P(ptK, 'move', String(k), ladderHint));
            ptFinal = ptK;
          }
        });
      }
    }
  }

  mark('With the final centre point and radius to A, draw the circle.', () => {
    methodSteps.push(circleStep(ptFinal, dist(ptFinal, A), 'move'));
  });

  const walk = walkVerticesByCompass(vertices, nn);
  mark("Cut the polygon's vertices around the circle with arcs of radius AB.", () => {
    methodSteps.push(...walk.arcAndLabelSteps);
  });
  mark('Join the sides to get the required polygon.', () => {
    methodSteps.push(...walk.resultLines);
  });

  return { vertices, methodSteps, slides, invalid };
}

/** Semicircle-division method (polygon.pdf), generalized to any n. Extends AB past A to C
 *  (AC = AB), draws a semicircle centred on A (radius AB) over CB, and divides it into n equal
 *  parts numbered B→C (the source's own numbering direction — 1 nearest B, n-1 nearest C, with
 *  division n itself coinciding with C, so only n-1 division points are separately marked).
 *
 *  Every vertex past B is independently derived, not carried from the shared ground truth: a
 *  ray from A through division point j (extended past the semicircle, per "Draw a line
 *  connecting A and [division]", repeated for every division) is cut by an arc of radius AB
 *  centred on the previously-found vertex, giving the next vertex — inscribed-angle exact for
 *  ANY n (the ray through division j always passes through vertex j+1: the angle it makes at A
 *  is (j)·(180°/n), exactly the inscribed angle vertex B..vertex(j+1) subtends at A), verified
 *  numerically to floating-point noise against the closed-form vertices for n=3..12. Only the
 *  LAST division's ray (j = n-1, pointing back toward A) is drawn without a matching arc-cut —
 *  the source draws it too (the "similarly…" step lumps every division's ray together) but it
 *  isn't needed: n-2 arc-cuts already produce every vertex between B and the closing side.
 *
 *  A previous version of this file claimed the ray-cut technique was disproved for n≥7 — that
 *  was a ray-origin bug (rays were drawn from B, the wrong source vertex), not a geometric
 *  limit; see DECISIONS.md ADR-143. As with every method in this file, the final polygon is
 *  still drawn from the shared closed-form vertices (regularPolygonVertices) so it always
 *  closes exactly — the ray+arc-cut is a verified-exact ILLUSTRATION of how each vertex is
 *  reached, not the value the drawing actually relies on. No circumcircle is drawn — the source
 *  doesn't use one for this method.
 *
 *  Slide grouping (Step Through, ADR-095 addendum): polygon.pdf is a literal slide deck for
 *  this method — verified against its own pentagon(n=5)/hexagon(n=6)/heptagon(n=7) examples,
 *  all identical in shape, confirming one general formula (slideCount = n+3) rather than
 *  per-n special-casing. Captions below are near-verbatim from those slides. Each `mark()`
 *  call stages one PDF slide: the semicircle+division, the first ray, the first arc-cut, ALL
 *  remaining rays together ("similarly…"), one arc-cut slide per remaining vertex, and — the
 *  reason this function no longer draws a side the moment its arc finds the vertex — a FINAL
 *  "Join …" slide holding every side at once, exactly where polygon.pdf puts it. */
function buildSemicircleDivision(A, B, s, dirAB, nn, divAngle) {
  const methodSteps = [];
  const slides = [];
  const mark = (caption, fn) => {
    const startIdx = methodSteps.length;
    fn();
    if (methodSteps.length > startIdx) slides.push({ caption, startIdx, endIdx: methodSteps.length });
  };

  const { vertices, O } = regularPolygonVertices(A, B, nn);
  const C = pointAt(A, s, dirAB + Math.PI);
  const letterFor = (k) => String.fromCharCode(65 + k + 1); // skip 'C' (the extension point)
  const vertexLabel = (k) => (k === 1 ? 'B' : letterFor(k));

  mark('Draw AB and a semicircle of radius AB.', () => {
    methodSteps.push(L(A, C, 'move'), P(C, 'move', 'C', awayFrom(A, C)));
    methodSteps.push(moveArc(A, s, dirAB, dirAB - Math.PI));
  });

  // Division numbers sit ON the semicircle's own arc, with the fan of A-rays converging
  // behind them — offset each outward from A (the semicircle's centre) so the label reads
  // just past the arc instead of landing on the arc, a ray, or a neighbouring division.
  const divisionPoint = (i) => pointAt(A, s, dirAB - i * divAngle);
  mark(`Divide the semicircle into ${nn} equal parts.`, () => {
    for (let i = 1; i <= nn - 1; i++) {
      const div = divisionPoint(i);
      methodSteps.push(P(div, 'move', String(i), awayFrom(A, div)));
    }
  });

  // One ray per division (1..n-1), extended a FIXED amount past whichever it needs to reach —
  // the vertex it cuts (division j reaches vertex j+1), or, for the unused last division, a
  // little past the semicircle itself. A fixed overshoot (not proportional) keeps the far tip
  // on-canvas even for the long near-diameter chords that show up around n=9..12.
  const RAY_OVERSHOOT = 4;
  const rayTo = (j) => {
    const reach = (j <= nn - 2 ? dist(A, vertices[j + 1]) : s) + RAY_OVERSHOOT;
    return pointAt(A, reach, dirAB - j * divAngle);
  };

  mark('Draw a line connecting A and the first division.', () => {
    methodSteps.push(L(A, rayTo(1), 'move'));
    // radius 10, not the platform's usual 7-ish "small mark" default — this angle's own span
    // (180°/n, as low as ~15° at n=12) makes for a short chord even at a normal radius; a
    // smaller radius shrinks the chord further, to the point the arc reads as a stray dot next
    // to its own label rather than a visible sweep between the two rays (Phase A follow-up:
    // the render-side fix — renderConstruction.js's geometryObstacles() now including
    // dim/angledim ink — keeps the label from sitting ON TOP of the arc, but a too-small arc
    // is still hard to read even once uncovered). Staged in THIS slide, not the division slide
    // above — an angledim mark needs both its legs already drawn (AB from the opening slide,
    // A's own ray just above) or it floats with nothing to measure between (Phase A audit).
    methodSteps.push(angleDim(A, B, divisionPoint(1), `${(180 / nn).toFixed(1)}°`, 'move', 10));
  });

  mark(`With radius AB and centre B, draw an arc to cut the line at ${letterFor(2)}.`, () => {
    methodSteps.push(arcMark(vertices[1], s, vertices[2], 45));
    methodSteps.push(P(vertices[2], 'result', letterFor(2), awayFrom(O, vertices[2])));
  });

  mark('Similarly, draw lines connecting A and the remaining divisions.', () => {
    for (let j = 2; j <= nn - 1; j++) methodSteps.push(L(A, rayTo(j), 'move'));
  });

  for (let k = 3; k < nn; k++) {
    const prevLabel = letterFor(k - 1);
    const curLabel = letterFor(k);
    mark(`With radius AB and centre ${prevLabel}, draw an arc to cut the line at ${curLabel}.`, () => {
      methodSteps.push(arcMark(vertices[k - 1], s, vertices[k], 45));
      // Outward from the circumcentre O, same "past the answer, not into the crowded middle"
      // idea as the division-number offset above.
      methodSteps.push(P(vertices[k], 'result', curLabel, awayFrom(O, vertices[k])));
    });
  }

  // Every side deferred here — polygon.pdf's "Join BD, DE, EF & FA…" slide comes only after
  // EVERY vertex above is already found and labelled, never interleaved per-vertex.
  const edges = [];
  for (let k = 2; k < nn; k++) edges.push(`${vertexLabel(k - 1)}${vertexLabel(k)}`);
  edges.push(`${vertexLabel(nn - 1)}A`);
  mark(`Join ${edges.join(', ')} to get the required polygon.`, () => {
    for (let k = 2; k < nn; k++) methodSteps.push(L(vertices[k - 1], vertices[k], 'result'));
    methodSteps.push(L(vertices[nn - 1], A, 'result')); // closing side back to A
  });

  return { vertices, methodSteps, slides };
}

// ----------------------------------------------------------------------------
// The three constructions
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number}} ParamSpec */
/** @typedef {{id:string,label:string}} MethodSpec */

/**
 * @typedef {Object} ConstructionDef
 * @property {string} id
 * @property {string} label
 * @property {string} shortLabel
 * @property {MethodSpec[]} methods
 * @property {(method:string) => string} principle
 * @property {{given?:(method:string)=>string, construct?:(method:string)=>string}} [notes] Short
 *   plain-language blurbs for the Given/Construct wizard phases (RULES §6.31 — phenomenon in
 *   plain words BEFORE the formal statement `principle()` gives in Verify). Optional per key;
 *   Choose and Verify intentionally have none — see this topic's DESIGN.md §6.
 * @property {ParamSpec[]} given
 * @property {(params:Record<string,number|string>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** Pentagon's raw (unscaled, uncentred) geometry — the same function calibratedScale() calls
 *  at max(side) for every method to find this construction's fixed on-screen scale. */
function pentagonRaw({ side, method }) {
  const n = 5;
  const s = side;
  const A = { x: 0, y: 0 };
  const B = { x: s, y: 0 };
  const steps = [
    L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
    dim(A, B, `${side} mm`, 'given', 18),
  ];
  const { O, R, vertices } = regularPolygonVertices(A, B, n);
  const M = midpoint(A, B);

  if (method === 'angle') {
    const rayA = pointAt(A, s * 1.3, angleOf(A, O));
    const rayB = pointAt(B, s * 1.3, angleOf(B, O));
    steps.push(L(A, rayA, 'move'), L(B, rayB, 'move'));
    steps.push(angleDim(A, B, O, '54°', 'move', 9), angleDim(B, A, O, '54°', 'move', 9));
  } else {
    const apex = sortByY(circleIntersect(A, s, B, s))[0]; // equilateral apex, upper candidate
    if (method === 'circles') {
      steps.push(circleStep(A, s, 'move'), circleStep(B, s, 'move'));
    } else {
      steps.push(arcMark(A, s, apex, 50), arcMark(B, s, apex, 50));
    }
    steps.push(P(apex, 'move', 'P'));
    steps.push(L(A, apex, 'move'), L(B, apex, 'move')); // the legs each 60° mark below measures
    steps.push(angleDim(A, B, apex, '60°', 'move', 9), angleDim(B, A, apex, '60°', 'move', 9));
    steps.push(arcMark(M, dist(M, O), O, 40));
  }

  drawCircumcircle(steps, O, R);
  const pentagonWalk = walkVerticesByCompass(vertices, n);
  steps.push(...pentagonWalk.arcAndLabelSteps, ...pentagonWalk.resultLines);
  steps.push(angleDim(B, A, vertices[2], '108°', 'result', 12));
  return {
    steps: separateCoincidentLabels(applyOutwardHints(steps, O), O),
    resultText: `Regular pentagon of side ${side} mm, interior angle 108°`,
  };
}

/** Hexagon's raw (unscaled, uncentred) geometry — see pentagonRaw()'s comment. */
function hexagonRaw({ side, method }) {
  const n = 6;
  const s = side;
  const A = { x: 0, y: 0 };
  const B = { x: s, y: 0 };
  const steps = [
    L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
    dim(A, B, `${side} mm`, 'given', 18),
  ];
  const { O, R, vertices } = regularPolygonVertices(A, B, n);

  if (method === 'compass') {
    steps.push(arcMark(A, s, O, 50), arcMark(B, s, O, 50));
    steps.push(L(A, O, 'move'), L(B, O, 'move')); // the legs the 60° mark below measures
  } else {
    const rayA = pointAt(A, s * 1.2, angleOf(A, O));
    const rayB = pointAt(B, s * 1.2, angleOf(B, O));
    steps.push(L(A, rayA, 'move'), L(B, rayB, 'move'));
  }
  steps.push(angleDim(A, B, O, '60°', 'move', 9), angleDim(B, A, O, '60°', 'move', 9));

  drawCircumcircle(steps, O, R);
  const hexagonWalk = walkVerticesByCompass(vertices, n);
  steps.push(...hexagonWalk.arcAndLabelSteps, ...hexagonWalk.resultLines);
  steps.push(angleDim(B, A, vertices[2], '120°', 'result', 12));
  return {
    steps: separateCoincidentLabels(applyOutwardHints(steps, O), O),
    resultText: `Regular hexagon of side ${side} mm, interior angle 120°`,
  };
}

/** N-Gon's raw (unscaled, uncentred) geometry — see pentagonRaw()'s comment. */
function ngonRaw({ side, n, method }) {
  const nn = Math.round(n);
  const s = side;
  const A = { x: 0, y: 0 };
  const B = { x: s, y: 0 };
  const steps = [
    L(A, B, 'given'), P(A, 'given', 'A'), P(B, 'given', 'B'),
    dim(A, B, `${side} mm`, 'given', 18),
  ];
  const dirAB = angleOf(A, B); // 0 — A is always placed left of B on a horizontal baseline
  const divAngle = Math.PI / nn;

  const result = method === 'semicircle'
    ? buildSemicircleDivision(A, B, s, dirAB, nn, divAngle)
    : buildPerpendicularBisector(A, B, s, nn);
  const { vertices: polyVertices, methodSteps, slides, invalid } = result;

  const interior = ((nn - 2) * 180) / nn;
  // Our own addition, not sourced from either PDF/book — folded into the LAST slide
  // (the "Join…" step) rather than left outside every slide's range, so Step Through's
  // final click reveals it too instead of it only ever appearing via Play All.
  methodSteps.push(angleDim(B, A, polyVertices[2], `${interior.toFixed(1)}°`, 'result', 12));
  if (slides.length) slides[slides.length - 1].endIdx = methodSteps.length;
  steps.push(...methodSteps);

  const { O } = regularPolygonVertices(A, B, nn); // for the outward label-hint pass only

  return {
    steps: separateCoincidentLabels(applyOutwardHints(steps, O), O),
    slides,
    resultText: `Regular ${nn}-gon of side ${side} mm, interior angle ${interior.toFixed(1)}°`,
    ...(invalid ? { invalid } : {}),
  };
}

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'pentagon',
    label: 'Regular Pentagon',
    shortLabel: 'Pentagon',
    methods: [
      { id: 'angle', label: '54° Angle + Circle' },
      { id: 'circles', label: 'Two Circles + Arc' },
      { id: 'arcs', label: 'Three Arcs' },
    ],
    principle(method) {
      if (method === 'circles') {
        return "Two circles of radius AB, centred on A and B, fix the equilateral triangle's apex above AB. One further arc — sized to the pentagon's own golden-ratio proportions (every diagonal is φ ≈ 1.618 times the side) — steps from there to the true circumcentre.";
      }
      if (method === 'arcs') {
        return "The same equilateral apex, found with two short arcs instead of full circles, plus one more arc scaled to the pentagon's golden-ratio proportions — three arcs, no protractor, same circumcentre as either other method.";
      }
      return "A pentagon's circumcentre O is exactly where two 54° rays from A and B meet — 54° is half the pentagon's 108° interior angle, since triangle OAB is isosceles with apex angle 72° (360° ÷ 5).";
    },
    notes: {
      given: () =>
        "A side length is the whole problem statement — the book's own worked example asks only for “a regular pentagon having side length equal to 40 mm”. All five sides equal AB and all five interior angles are 108° whatever you set, so the side alone fixes ONE pentagon. (K.C. John Ch. 5)",
      construct: (method) => {
        if (method === 'circles') {
          return "Two full circles, each as wide as AB, cross above the line at a point the same distance from A as from B. Every candidate centre lies on the straight-up line through AB's midpoint — the last arc steps along it to the one that works for FIVE sides. (K.C. John Ch. 5)";
        }
        if (method === 'arcs') {
          return 'Same idea, less ink — two short arcs instead of two whole circles reach the same crossing above AB, then one more arc steps up to the same centre. Compare it against Two Circles: identical pentagon, fewer compass sweeps. (K.C. John Ch. 5)';
        }
        return "Watch two straight rays leave A and B at the same shallow tilt and cross at one point above the line. That crossing is the centre of the circle every corner sits on — set the compass to AB and it steps round that circle five times. (K.C. John Ch. 5)";
      },
    },
    given: [{ key: 'side', label: 'Side length', unit: 'mm', min: 30, max: 50, step: 1, default: 45 }],
    build(params) {
      const { steps, resultText } = pentagonRaw(params);
      const scale = calibratedScale(this.id, pentagonRaw, this.given, this.methods);
      const chromeScale = chromeScaleFor(this.id, pentagonRaw, this.given, this.methods, params);
      return { steps: centerAt(steps, scale), resultText, chromeScale };
    },
  },

  {
    id: 'hexagon',
    label: 'Regular Hexagon',
    shortLabel: 'Hexagon',
    methods: [
      { id: 'angle', label: '60° Lines' },
      { id: 'compass', label: 'Compass + Circle' },
    ],
    principle(method) {
      if (method === 'compass') {
        return "The same equilateral fact — a hexagon's circumradius always equals its own side — lets a compass alone find O: arcs of radius AB from A and from B cross exactly at the centre, no protractor needed.";
      }
      return "A hexagon's circumcentre O is exactly where two 60° rays from A and B meet — triangle OAB is EQUILATERAL (apex angle 360° ÷ 6 = 60°), which is why a regular hexagon's circumradius always equals its own side length.";
    },
    notes: {
      given: () =>
        "Only the side is given, as in the book's “regular hexagon having length of a side equal to 30 mm”. A hexagon is the special case where the circumradius equals the side itself — so the number you set here is also the compass width that finds every corner. (K.C. John Ch. 5)",
      construct: (method) => {
        if (method === 'compass') {
          return 'No protractor this time, just two arcs both set to the width of AB. They cross at the centre — join A and B to it and that SAME compass width then walks round to every corner too, the one polygon where the compass never needs resetting. (K.C. John Ch. 5)';
        }
        return "The rays leave A and B at a steeper tilt than the pentagon's. Watch where they meet — the triangle they close with AB has all three sides EQUAL, which is why a hexagon's centre sits exactly one side-length from every corner. (K.C. John Ch. 5)";
      },
    },
    given: [{ key: 'side', label: 'Side length', unit: 'mm', min: 25, max: 45, step: 1, default: 35 }],
    build(params) {
      const { steps, resultText } = hexagonRaw(params);
      const scale = calibratedScale(this.id, hexagonRaw, this.given, this.methods);
      const chromeScale = chromeScaleFor(this.id, hexagonRaw, this.given, this.methods, params);
      return { steps: centerAt(steps, scale), resultText, chromeScale };
    },
  },

  {
    id: 'ngon',
    label: 'N-Sided Regular Polygon',
    shortLabel: 'N-Gon',
    methods: [
      { id: 'semicircle', label: 'Semicircle Division' },
      { id: 'bisector', label: 'Perpendicular Bisector' },
    ],
    principle(method) {
      if (method === 'bisector') {
        return "The perpendicular bisector of AB holds every possible centre for a polygon on side AB — real compass arcs pin points 4 and 6 exactly, their midpoint gives 5, and the same ladder keeps climbing to the point for the chosen n, whose circle threads every vertex. The same bisector–ladder–circle shape pentagon and hexagon use, generalized to any n from 3 to 12.";
      }
      return "Dividing a semicircle into n equal parts sidesteps a real limit: most polygons' angles (128.57° for a 7-gon, for instance) simply aren't reachable with a compass alone — a protractor-style division works for ANY n, which is exactly why this, not a compass trick, is the general method. A ray from A through each division point lands exactly on the next vertex — the angle it makes at A is always one division step, the same inscribed angle that vertex subtends — so a fixed-radius compass arc, centred on the vertex just found, can cut that ray to derive every remaining vertex in turn.";
    },
    notes: {
      given: () =>
        "Two numbers now, matching the book's general statement — “a polygon having n sides and length of side equal to s”. The interior angle follows from n alone: (n−2)×180°÷n, which is 128.57° at n = 7 and climbs toward 180° as n grows. (K.C. John Ch. 5)",
      construct: (method) => {
        if (method === 'bisector') {
          return "The line rising from AB's midpoint holds every possible centre — one rung per polygon. Watch the numbered ladder climb: 4 for a square, 5 for a pentagon, 6 for a hexagon, and so on. Pick the rung for your n, draw its circle, then step the compass round it. (K.C. John Ch. 5)";
        }
        return 'The semicircle above A is split into as many equal slices as the polygon has sides. Each ray through a division mark points straight at the next corner, and an arc of width AB planted on the corner just found cuts it there — repeat until the shape closes. Works for ANY n, including the ones a compass alone cannot reach. (K.C. John Ch. 5)';
      },
    },
    given: [
      { key: 'side', label: 'Side length', unit: 'mm', min: 25, max: 42, step: 1, default: 32 },
      { key: 'n', label: 'Number of sides (n)', unit: '', min: 3, max: 12, step: 1, default: 6 },
    ],
    build(params) {
      const { steps, slides, resultText, invalid } = ngonRaw(params);
      const scale = calibratedScale(this.id, ngonRaw, this.given, this.methods);
      const chromeScale = chromeScaleFor(this.id, ngonRaw, this.given, this.methods, params);
      return {
        steps: centerAt(steps, scale),
        slides,
        resultText,
        chromeScale,
        ...(invalid ? { invalid } : {}),
      };
    },
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
