// Development-of-surfaces engine — the pure 2D flat-pattern leaf (ADR-066).
//
// Owns ALL of the unrolling mathematics and the Canvas2D path construction for the
// Compare sheet. main.js's drawCompare() sizes the canvas, derives the fixed intrinsic
// frame (ADR-053 pattern) from layoutFor()'s analytic bbox, and hands this module a
// `view` ({ project, pxPerWorld }) plus a resolved `palette` — this file reads NO DOM
// and no CSS tokens, and imports ONLY the pure-math genericSolid.js (the one leaf
// import ADR-007 permits — computeCutDistances must sample corners at the alignment
// phase the meshes are actually built with), so every layout function stays
// unit-testable from the console (the headless verification oracles).
//
// KTU syllabus method split (hard constraint, this module's whole pedagogy):
//   - Parallel-Line method  → prisms + cylinder (generators parallel to the axis; the
//     stretch-out line is the base perimeter laid flat, heights plot as TRUE lengths).
//   - Radial-Line method    → pyramids + cone (generators radiate from the apex; the
//     pattern is swung about the apex at TRUE slant length).
//   A cone's sector angle uses the arc-length identity θ = 360°·(r/L); a pyramid does
//   NOT — its faces step as chords, φ = 2·asin(s/(2·L_e)) per face. Conflating the two
//   is the classic textbook error this module must never teach.
//
// Pattern space: world units, y grows DOWN (matching canvas), so main.js's project()
// needs no y flip. Radial layouts put the apex at the origin with the sector opening
// downward (bisector = +y); parallel layouts put the top rim at y=0 and the stretch-out
// (base) line at y=height.
//
// Truncation seam: computeCutDistances() maps a cutting plane — ALREADY transformed into
// the solid's local seated frame (base centre at origin, +y up; the world→local inverse
// of applyShapeTransform + seating is main.js's job when the section UI ports over) —
// to true-length distances per generator/edge, and drawDevelopment() accepts that as
// `cutData`. Null cutData = full (untruncated) solid.

import { polygonVertexAngle, PolygonAlignment } from './genericSolid.js';

/** Generator count for curved-surface developments (cylinder + cone) — the standard
 *  textbook division of the base circle into 12 equal parts. */
const CURVE_GENERATORS = 12;

/** Sample count for a truncation cut's curve on a curved surface (cylinder/cone) —
 *  finer than the 12 drawn generators so the plotted cut reads as a smooth curve. */
const CUT_SAMPLES = 48;

/** Engineering two-weight rule (DESIGN.md): pattern outline vs construction linework. */
const OUTLINE_PX = 2.25;
const THIN_PX = 1;

// ShapeType string contract (src/shapeData.js). Listed as literals because leaves may
// import only genericSolid.js (ADR-007); these strings are frozen platform-wide.
const PRISM_SIDES = Object.freeze({
  Cube: 4,
  TriangularPrism: 3,
  SquarePrism: 4,
  PentagonalPrism: 5,
  HexagonalPrism: 6,
});
const PYRAMID_SIDES = Object.freeze({
  Pyramid: 4,
  TriangularPyramid: 3,
  PentagonalPyramid: 5,
  HexagonalPyramid: 6,
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ============================================================================
// Layouts — pure analytic geometry, world units. Each returns a `bbox` derived
// ONLY from ShapeData intrinsics: the ADR-053 nominal footprint main.js locks
// the sheet scale to (drawn extents are never measured).
// ============================================================================

/**
 * Parallel-Line layout — prisms (incl. cube) and the cylinder.
 * Stretch-out length: prism P = n·s; cylinder P = π·d (baseLength IS the diameter for
 * turned solids — shapeData.js contract). Pattern = rectangle P × h; fold lines at the
 * corner unwrap positions (prism) or the 12 generator stations (cylinder).
 *
 * @param {import('./shapeData.js').ShapeData} data
 */
export function parallelLayout(data) {
  const n = PRISM_SIDES[data.shape] ?? null; // null ⇒ cylinder
  const h = data.height;
  let stretchOut;
  let foldXs; // interior thin verticals (pattern x); the x=0 / x=P seam edges are outline
  let stationXs; // every generator/corner station incl. both seam edges (cut plotting grid)

  if (n !== null) {
    const s = data.baseLength;
    stretchOut = n * s;
    foldXs = Array.from({ length: n - 1 }, (_, k) => (k + 1) * s);
    stationXs = Array.from({ length: n + 1 }, (_, k) => k * s);
  } else {
    const d = data.baseLength;
    stretchOut = Math.PI * d;
    foldXs = Array.from({ length: CURVE_GENERATORS - 1 }, (_, k) => ((k + 1) * stretchOut) / CURVE_GENERATORS);
    stationXs = Array.from({ length: CURVE_GENERATORS + 1 }, (_, k) => (k * stretchOut) / CURVE_GENERATORS);
  }

  return {
    method: 'parallel',
    shape: data.shape,
    sides: n,
    stretchOut,
    height: h,
    foldXs,
    stationXs,
    bbox: { minX: 0, maxX: stretchOut, minY: 0, maxY: h },
  };
}

/** Direction of a radial ray at angle γ measured from the downward bisector (y-down
 *  pattern space): γ=0 points straight down, positive γ swings toward +x. */
const rayDir = (gamma) => ({ x: Math.sin(gamma), y: Math.cos(gamma) });

/** Analytic bbox of a circular sector of radius R, half-angle `half` about the downward
 *  bisector, apex at the origin — apex + end rays + any axis-aligned arc extreme that
 *  falls inside the span. Handles θ > 180° (a flat cone's sector can exceed a half circle). */
function sectorBBox(R, half) {
  const pts = [{ x: 0, y: 0 }, rayDir(-half), rayDir(half)].map((p, i) =>
    i === 0 ? p : { x: p.x * R, y: p.y * R });
  for (const g of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) {
    if (g >= -half && g <= half) {
      const d = rayDir(g);
      pts.push({ x: d.x * R, y: d.y * R });
    }
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Radial-Line layout — cone. True slant L = √(r² + h²); subtended sector angle from the
 * arc-length identity L·θ_rad = 2πr ⇒ θ = 360°·(r/L). Sector opens downward, apex at
 * the origin, 12 generator rays at k·θ/12.
 *
 * @param {import('./shapeData.js').ShapeData} data
 */
export function radialConeLayout(data) {
  const r = data.baseLength / 2; // baseLength is the DIAMETER for turned solids
  const h = data.height;
  const L = Math.hypot(r, h);
  const thetaRad = L > 0 ? (2 * Math.PI * r) / L : 0;
  const half = thetaRad / 2;
  const rayGammas = Array.from({ length: CURVE_GENERATORS + 1 },
    (_, k) => -half + (k * thetaRad) / CURVE_GENERATORS);

  return {
    method: 'radial',
    shape: data.shape,
    kind: 'cone',
    slant: L,
    thetaRad,
    thetaDeg: (thetaRad * 180) / Math.PI,
    rayGammas,
    bbox: sectorBBox(L, half),
  };
}

/**
 * Radial-Line layout — pyramids. Base circumradius R_c = s/(2·sin(π/n)); TRUE slant-edge
 * length L_e = √(h² + R_c²). The pattern is a fan of n TRUE-SIZE isosceles triangles:
 * each face subtends φ = 2·asin(s/(2·L_e)) — chord stepping, NOT the cone's arc-length
 * formula — and base edges are straight chords between corners at radius L_e.
 *
 * @param {import('./shapeData.js').ShapeData} data
 */
export function radialPyramidLayout(data) {
  const n = PYRAMID_SIDES[data.shape];
  const s = data.baseLength;
  const h = data.height;
  const Rc = s / (2 * Math.sin(Math.PI / n));
  const Le = Math.hypot(h, Rc);
  // s/(2·L_e) ≤ 1 always for a valid solid (L_e ≥ R_c ≥ s/2); clamp is the NaN guard.
  const phi = 2 * Math.asin(clamp(s / (2 * Le), -1, 1));
  const total = n * phi;
  const cornerGammas = Array.from({ length: n + 1 }, (_, k) => -total / 2 + k * phi);
  const corners = cornerGammas.map((g) => {
    const d = rayDir(g);
    return { x: d.x * Le, y: d.y * Le };
  });

  let minX = 0, maxX = 0, minY = 0, maxY = 0; // apex (0,0) seeds the bounds
  for (const p of corners) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    method: 'radial',
    shape: data.shape,
    kind: 'pyramid',
    sides: n,
    slant: Le,
    phi,
    totalRad: total,
    cornerGammas,
    corners,
    bbox: { minX, maxX, minY, maxY },
  };
}

/**
 * ShapeType → layout dispatch: the KTU method split lives here and ONLY here.
 * @param {import('./shapeData.js').ShapeData} data
 */
export function layoutFor(data) {
  if (data.shape === 'Cylinder' || PRISM_SIDES[data.shape] !== undefined) return parallelLayout(data);
  if (data.shape === 'Cone') return radialConeLayout(data);
  if (PYRAMID_SIDES[data.shape] !== undefined) return radialPyramidLayout(data);
  throw new Error(`developmentEngine: unsupported shape "${data.shape}"`);
}

// ============================================================================
// Truncation seam — cutting-plane → true-length distances on the pattern grid.
// The plane must already be in the solid's LOCAL seated frame (base centre at the
// origin, +y up, base at y=0): { nx, ny, nz, d } with n·p + d = 0.
// ============================================================================

/**
 * Map a local-frame cutting plane to per-generator true lengths.
 * Parallel solids → { method:'parallel', xs, heights }: cut height above the base per
 * station x (true, generators are axis-parallel), clamped to [0, h].
 * Radial solids → { method:'radial', gammas, distances }: TRUE distance from the apex
 * along each generator/edge (the 3D |apex−P| of a straight line through the apex IS the
 * true length — no auxiliary-view rotation needed), clamped to [0, slant].
 *
 * Corner/generator k sits at the mesh's OWN base angle: cylinder/cone rims at plain
 * 2πk/N (cylinder.js/cone.js), prism corners at genericSolid's PRISM alignment phase,
 * pyramid corners at FLAT_EDGE_FRONT (the offsets the generators build with — sampling
 * without them reads cut heights at the wrong generators). The cube is an axis-aligned
 * box = the N=4 PRISM phase (π/4). Seam choice (which corner is k=0) stays arbitrary;
 * only the cyclic CCW order must match, and polygonVertexAngle is CCW-ascending.
 *
 * @param {import('./shapeData.js').ShapeData} data
 * @param {{nx:number, ny:number, nz:number, d:number}} localPlane
 * @returns {object|null} null when the plane cannot cut (missing/degenerate).
 */
export function computeCutDistances(data, localPlane) {
  if (!localPlane) return null;
  const { nx, ny, nz, d } = localPlane;
  const layout = layoutFor(data);
  const h = data.height;

  if (layout.method === 'parallel') {
    const isCyl = layout.sides === null;
    const N = isCyl ? CUT_SAMPLES : layout.sides;
    const P = layout.stretchOut;
    const rad = isCyl ? data.baseLength / 2
      : data.baseLength / (2 * Math.sin(Math.PI / layout.sides)); // corner circumradius
    if (Math.abs(ny) < 1e-9) return null; // plane parallel to the generators — no height cut
    const xs = [];
    const heights = [];
    for (let k = 0; k <= N; k++) {
      const a = isCyl
        ? (2 * Math.PI * k) / N
        : polygonVertexAngle(N, k, PolygonAlignment.PRISM); // the phase the meshes carry
      const bx = rad * Math.cos(a);
      const bz = rad * Math.sin(a);
      // Generator p(t) = (bx, t, bz), t ∈ [0,h]; solve n·p + d = 0 for t.
      const t = -(nx * bx + nz * bz + d) / ny;
      xs.push((k / N) * P);
      heights.push(clamp(t, 0, h));
    }
    return { method: 'parallel', xs, heights };
  }

  // Radial: generators/edges run apex → base point; intersect each straight line.
  const isCone = layout.kind === 'cone';
  const N = isCone ? CUT_SAMPLES : layout.sides;
  const baseR = isCone ? data.baseLength / 2
    : data.baseLength / (2 * Math.sin(Math.PI / layout.sides));
  const apex = { x: 0, y: h, z: 0 };
  const gammas = [];
  const distances = [];
  const half = isCone ? layout.thetaRad / 2 : layout.totalRad / 2;
  for (let k = 0; k <= N; k++) {
    const a = isCone
      ? (2 * Math.PI * k) / N
      : polygonVertexAngle(N, k, PolygonAlignment.FLAT_EDGE_FRONT); // pyramid corner phase
    const b = { x: baseR * Math.cos(a), y: 0, z: baseR * Math.sin(a) };
    const dir = { x: b.x - apex.x, y: b.y - apex.y, z: b.z - apex.z };
    const denom = nx * dir.x + ny * dir.y + nz * dir.z;
    const slantLen = Math.hypot(dir.x, dir.y, dir.z);
    // Pattern ray for this generator: cone spreads by base-angle fraction; pyramid by
    // whole-face chord steps (corner k of n).
    gammas.push(-half + (k / N) * (isCone ? layout.thetaRad : layout.totalRad));
    if (Math.abs(denom) < 1e-9) { distances.push(slantLen); continue; } // grazing: keep full
    const t = -(nx * apex.x + ny * apex.y + nz * apex.z + d) / denom;
    distances.push(clamp(t, 0, 1) * slantLen); // |apex−P| along a straight generator = TRUE length
  }
  return { method: 'radial', gammas, distances };
}

// ============================================================================
// Shortest-path ("string"/"ant") geodesic — ADR-070. The development is an
// isometry, so the shortest route on the surface is a STRAIGHT line on the
// unrolled pattern. computeStringPath() turns a problem's `path` spec
// ({ wrap, from, to } — see src/problems.js) into pattern-space endpoints plus
// the crossing points where the line meets each generator/fold station; those
// crossings are also exactly what main.js needs to wrap the path back onto the
// 3D solid (per-face isometry: straight on the sheet = straight on each face).
// ============================================================================

/** Radius of the string's endpoint dots, px (instrument chrome, not linework). */
const PATH_DOT_PX = 3.5;

/**
 * Pattern-space geodesic for a shortest-path spec.
 *
 * Parallel: the straight segment from (0, y_from) to (wrap·P, y_to) in y-down
 * pattern space (base rim = y=h, top rim = y=0). Crossings sit on the stationXs
 * grid by linear interpolation, so main.js can lift them to the prism corners.
 *
 * Radial: both endpoints on rims at pattern angles γ₀ = −half and
 * γ₁ = γ₀ + wrap·total; 'base' pins the endpoint at the outer boundary (radius
 * slant), 'top' at the apex-side radius 0 (degenerate today — all four shipped
 * problems are base/base or handled by parallel). The chord's polar form about
 * the apex: foot p = R·cos(Δ/2) at mid-angle γₘ, ρ(γ) = p / cos(γ − γₘ).
 * Valid only while Δ < π (beyond that the "chord" would pass the apex on the
 * wrong side and a straight pattern line stops being the surface geodesic).
 *
 * @param {object} layout  From layoutFor().
 * @param {{wrap:number, from:'base'|'top', to:'base'|'top'}} spec
 * @returns {{valid:boolean, method:'parallel'|'radial',
 *            a:{x:number,y:number}, b:{x:number,y:number},
 *            crossings:Array<object>}|null}
 *   Crossings (endpoints included, in travel order):
 *   parallel → { x, y, k }  (k = station index on stationXs)
 *   radial   → { gamma, rho, frac }  (frac = (γ−γ₀)/(γ₁−γ₀) along the sweep)
 */
export function computeStringPath(layout, spec) {
  if (!spec) return null;
  const wrap = spec.wrap;

  if (layout.method === 'parallel') {
    const h = layout.height;
    const P = layout.stretchOut;
    const yOf = (rim) => (rim === 'top' ? 0 : h);
    const a = { x: 0, y: yOf(spec.from) };
    const b = { x: wrap * P, y: yOf(spec.to) };
    const crossings = [];
    for (let k = 0; k < layout.stationXs.length; k++) {
      const x = layout.stationXs[k];
      if (x < a.x - 1e-9 || x > b.x + 1e-9) continue;
      const f = (x - a.x) / (b.x - a.x || 1);
      crossings.push({ x, y: a.y + f * (b.y - a.y), k });
    }
    return { valid: true, method: 'parallel', a, b, crossings };
  }

  // Radial (pyramid + cone). The chord's polar form below assumes BOTH endpoints
  // on the outer (base) boundary at radius slant — an apex-side endpoint would be
  // a plain generator, a different construction this topic has no problem for.
  if (spec.from !== 'base' || spec.to !== 'base') {
    console.warn('developmentEngine: radial string paths support base→base endpoints only; not drawn.');
    return { valid: false, method: 'radial', a: null, b: null, crossings: [] };
  }
  const R = layout.slant;
  const total = layout.kind === 'cone' ? layout.thetaRad : layout.totalRad;
  const g0 = -total / 2;
  const g1 = g0 + wrap * total;
  const delta = g1 - g0;
  if (delta >= Math.PI - 1e-9) {
    console.warn('developmentEngine: string path spans ≥180° of the pattern — a straight chord is no longer the geodesic; not drawn.');
    return { valid: false, method: 'radial', a: null, b: null, crossings: [] };
  }
  const gm = (g0 + g1) / 2;
  const p = R * Math.cos(delta / 2); // closest approach to the apex
  const rhoAt = (gamma) => p / Math.cos(gamma - gm);

  const aDir = rayDir(g0);
  const bDir = rayDir(g1);
  const a = { x: aDir.x * R, y: aDir.y * R };
  const b = { x: bDir.x * R, y: bDir.y * R };

  // Sample the chord at the drawn generator/edge stations inside the sweep, plus
  // both endpoints — the grid main.js lifts back onto the 3D surface.
  const gammas = layout.kind === 'cone' ? layout.rayGammas : layout.cornerGammas;
  const crossings = [{ gamma: g0, rho: R, frac: 0 }];
  for (const g of gammas) {
    if (g <= g0 + 1e-9 || g >= g1 - 1e-9) continue;
    crossings.push({ gamma: g, rho: rhoAt(g), frac: (g - g0) / delta });
  }
  crossings.push({ gamma: g1, rho: R, frac: 1 });

  // Fine sampling of the same chord for the 3D wrap: a pyramid's path is straight
  // per face (crossings suffice), but on the cone's curved surface the wrapped
  // string is a smooth curve — sample it on the CUT_SAMPLES grid.
  const samples = Array.from({ length: CUT_SAMPLES + 1 }, (_, i) => {
    const g = g0 + (i / CUT_SAMPLES) * delta;
    return { gamma: g, rho: i === 0 || i === CUT_SAMPLES ? R : rhoAt(g), frac: i / CUT_SAMPLES };
  });

  return { valid: true, method: 'radial', a, b, crossings, samples };
}

/**
 * Draw the revealed shortest path on the 2D sheet: the straight chord at outline
 * weight in the dedicated path colour, endpoint dots, and thin tick marks where
 * the string crosses each fold line / generator (the textbook transfer points).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{project:(p:{x:number,y:number})=>{x:number,y:number}, pxPerWorld:number}} view
 * @param {object} layout   From layoutFor() (unused today; kept for parity with drawDevelopment).
 * @param {{path:string}} palette   Resolved token colour for the string.
 * @param {ReturnType<typeof computeStringPath>} path
 */
export function drawStringPath(ctx, view, layout, palette, path) {
  if (!path?.valid) return;
  const toPx = (c) => (path.method === 'parallel'
    ? view.project({ x: c.x, y: c.y })
    : view.project({ x: rayDir(c.gamma).x * c.rho, y: rayDir(c.gamma).y * c.rho }));

  const aPx = view.project(path.a);
  const bPx = view.project(path.b);

  // Crossing ticks first (thin) so the chord reads on top of them.
  ctx.strokeStyle = palette.path;
  ctx.lineWidth = THIN_PX;
  ctx.setLineDash([]);
  ctx.beginPath();
  const dx = bPx.x - aPx.x;
  const dy = bPx.y - aPx.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len; // unit normal to the chord, for symmetric ticks
  const ny = dx / len;
  const TICK = 5;
  for (const c of path.crossings.slice(1, -1)) {
    const q = toPx(c);
    ctx.moveTo(q.x - nx * TICK, q.y - ny * TICK);
    ctx.lineTo(q.x + nx * TICK, q.y + ny * TICK);
  }
  ctx.stroke();

  // The chord itself — the answer line.
  ctx.lineWidth = OUTLINE_PX;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(aPx.x, aPx.y);
  ctx.lineTo(bPx.x, bPx.y);
  ctx.stroke();

  // Endpoint dots (start = end for a round trip, but both rims for a climb).
  ctx.fillStyle = palette.path;
  for (const q of [aPx, bPx]) {
    ctx.beginPath();
    ctx.arc(q.x, q.y, PATH_DOT_PX, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ============================================================================
// Drawing — Canvas2D paths through view.project (px). Construction linework first
// (thin), pattern outline second (heavy) so the outline always reads on top.
// ============================================================================

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{project: (p:{x:number,y:number}) => {x:number,y:number}, pxPerWorld: number}} view
 * @param {object} layout   From layoutFor() — main.js derives the sheet scale from its bbox.
 * @param {{ink:string, construction:string}} palette   Resolved token colours (no DOM here).
 * @param {object|null} cutData   From computeCutDistances(); null = full solid.
 */
export function drawDevelopment(ctx, view, layout, palette, cutData = null) {
  if (layout.method === 'parallel') drawParallelDevelopment(ctx, view, layout, palette, cutData);
  else drawRadialDevelopment(ctx, view, layout, palette, cutData);
}

/** Cut height above the base at pattern x, linearly interpolated on the cut grid. */
function cutHeightAt(cutData, x, fullHeight) {
  if (!cutData || cutData.method !== 'parallel') return fullHeight;
  const { xs, heights } = cutData;
  if (x <= xs[0]) return heights[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const f = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1);
      return heights[i - 1] + f * (heights[i] - heights[i - 1]);
    }
  }
  return heights[heights.length - 1];
}

/**
 * Parallel-Line method: rectangle stretchOut × height. y-down pattern space puts the
 * top rim at y=0 and the stretch-out (base) line at y=height, so a cut height `c`
 * above the base plots at y = height − c — truncation eats the sheet from the top.
 */
function drawParallelDevelopment(ctx, view, layout, palette, cutData) {
  const { stretchOut: P, height: h, foldXs } = layout;
  const topY = (x) => h - cutHeightAt(cutData, x, h);

  // Construction: interior fold lines (prism corners) / generator stations (cylinder),
  // thin, from the (possibly cut) top boundary down to the stretch-out line.
  ctx.strokeStyle = palette.construction;
  ctx.lineWidth = THIN_PX;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (const x of foldXs) {
    const a = view.project({ x, y: topY(x) });
    const b = view.project({ x, y: h });
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // Outline: seam edge up, cut/top boundary across, seam edge down, stretch-out back.
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = OUTLINE_PX;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const start = view.project({ x: 0, y: h });
  ctx.moveTo(start.x, start.y);
  let p = view.project({ x: 0, y: topY(0) });
  ctx.lineTo(p.x, p.y);
  if (cutData?.method === 'parallel') {
    for (const [i, x] of cutData.xs.entries()) {
      p = view.project({ x, y: h - cutData.heights[i] });
      ctx.lineTo(p.x, p.y);
    }
  } else {
    p = view.project({ x: P, y: 0 });
    ctx.lineTo(p.x, p.y);
  }
  p = view.project({ x: P, y: h });
  ctx.lineTo(p.x, p.y);
  ctx.closePath(); // the stretch-out line back to the start seam
  ctx.stroke();
}

/**
 * Radial-Line method. Cone: sector of radius L (arc via ctx.arc about the projected
 * apex — pan/zoom is a uniform similarity, so the arc stays a true circle in px).
 * Pyramid: fan of chords between corners at radius L_e. Truncation removes the APEX
 * side: the outer boundary (arc/chords) stays, the two end generators shorten to run
 * between the cut curve and the outer boundary, and the cut plots as an inner
 * polyline at true distances from the apex.
 */
function drawRadialDevelopment(ctx, view, layout, palette, cutData) {
  const isCone = layout.kind === 'cone';
  const R = layout.slant;
  const atRadius = (gamma, radius) => {
    const dir = rayDir(gamma);
    return view.project({ x: dir.x * radius, y: dir.y * radius });
  };
  const cut = cutData?.method === 'radial' ? cutData : null;
  const innerAt = (k) => (cut ? cut.distances[Math.round((k / (isCone ? CURVE_GENERATORS : layout.sides)) * (cut.gammas.length - 1))] : 0);

  // Construction: interior generator rays (cone: 11 of the 12 stations; pyramid: the
  // n−1 interior lateral edges = the fold lines), thin, apex/cut → outer boundary.
  const gammas = isCone ? layout.rayGammas : layout.cornerGammas;
  ctx.strokeStyle = palette.construction;
  ctx.lineWidth = THIN_PX;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let k = 1; k < gammas.length - 1; k++) {
    const a = atRadius(gammas[k], cut ? innerAt(k) : 0);
    const b = atRadius(gammas[k], R);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  // Outline.
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = OUTLINE_PX;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const half = isCone ? layout.thetaRad / 2 : layout.totalRad / 2;
  const startInner = atRadius(gammas[0], cut ? cut.distances[0] : 0);
  ctx.moveTo(startInner.x, startInner.y);
  const startOuter = atRadius(gammas[0], R);
  ctx.lineTo(startOuter.x, startOuter.y); // first end generator, cut (or apex) → outer
  if (isCone) {
    // Outer arc about the projected apex. Canvas angles: direction (sinγ, cosγ) in
    // y-down space is the canvas angle α = π/2 − γ, so γ ∈ [−half, +half] maps to
    // α from π/2+half down to π/2−half — drawn anticlockwise so it follows γ order.
    const apexPx = view.project({ x: 0, y: 0 });
    ctx.arc(apexPx.x, apexPx.y, R * view.pxPerWorld, Math.PI / 2 + half, Math.PI / 2 - half, true);
  } else {
    for (let k = 1; k < gammas.length; k++) {
      const c = atRadius(gammas[k], R);
      ctx.lineTo(c.x, c.y); // base edges are straight CHORDS — never arcs (pyramid)
    }
  }
  const endInner = atRadius(gammas[gammas.length - 1], cut ? cut.distances[cut.distances.length - 1] : 0);
  ctx.lineTo(endInner.x, endInner.y); // last end generator, outer → cut (or apex)
  if (cut) {
    // Inner boundary: the cut curve (cone: smooth polyline over the fine grid;
    // pyramid: straight between corner rays — a face's development is an isometry).
    for (let i = cut.gammas.length - 2; i >= 0; i--) {
      const q = atRadius(cut.gammas[i], cut.distances[i]);
      ctx.lineTo(q.x, q.y);
    }
  }
  ctx.closePath(); // no-cut: both end generators meet at the apex; cut: closes the inner curve
  ctx.stroke();
}
