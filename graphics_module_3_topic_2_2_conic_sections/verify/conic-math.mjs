// Headless math oracle for src/conicEngine.js — verifies that every construction's
// plotted points actually satisfy the conic they claim to build. Pure math, no DOM.
import { layoutFor, conicModel, conicPolyline, pointOnConic, rationalise } from
  'file:///C:/xampp/htdocs/SImatrix/graphics_module_3_topic_2_2_conic_sections/src/conicEngine.js';
import { defaultConicState, METHODS, curveForEccentricity, classifySection, generatorAngleDeg }
  from 'file:///C:/xampp/htdocs/SImatrix/graphics_module_3_topic_2_2_conic_sections/src/conicData.js';

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fails++; console.log(`FAIL ${name} ${detail}`); }
  else console.log(`ok   ${name} ${detail}`);
};
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// ---- 1. Focus-directrix locus: every sampled point satisfies PF = e·PQ ----------
for (const e of [0.4, 2 / 3, 1, 1.5, 2.2]) {
  const m = conicModel(e, 50);
  const pts = conicPolyline(m, 120);
  let worst = 0;
  for (const p of pts) {
    const pf = Math.hypot(p.x - m.focus.x, p.y - m.focus.y);
    const pq = Math.abs(p.x);
    worst = Math.max(worst, Math.abs(pf - e * pq));
  }
  ok(`locus e=${e}`, worst < 1e-6, `worst |PF-e·PQ| = ${worst.toExponential(2)} over ${pts.length} pts`);
}

// ---- 2. Named quantities against the textbook's own worked numbers -------------
{
  const m = conicModel(2 / 3, 50); // Example 6.1: FA = 50, e = 2/3
  ok('Ex 6.1 VA = 30', near(m.vertex.x, 30, 1e-9), `VA=${m.vertex.x}`);
  ok('Ex 6.1 VF = 20', near(50 - m.vertex.x, 20, 1e-9));
  ok('Ex 6.1 major axis 120', near(2 * m.a, 120, 1e-9), `2a=${(2 * m.a).toFixed(3)}`);
  const r = rationalise(2 / 3);
  ok('Ex 6.1 divides FA into 2+3', r.p === 2 && r.q === 3, JSON.stringify(r));
  const m2 = conicModel(1, 50); // Example 6.7: e = 1, FA = 50 → V at midpoint
  ok('Ex 6.7 vertex bisects AF', near(m2.vertex.x, 25, 1e-9));
  const m3 = conicModel(1.5, 50); // Example 6.12: e = 3/2
  ok('Ex 6.12 divides FA into 3+2', rationalise(1.5).p === 3 && rationalise(1.5).q === 2);
  ok('Ex 6.12 VA = 20', near(m3.vertex.x, 20, 1e-9), `VA=${m3.vertex.x}`);
}

// ---- 3. Eccentricity classification (§6.3) --------------------------------------
ok('e<1 ellipse', curveForEccentricity(0.67) === 'Ellipse');
ok('e=1 parabola', curveForEccentricity(1) === 'Parabola');
ok('e>1 hyperbola', curveForEccentricity(1.5) === 'Hyperbola');

// ---- 4. Section classification (§6.1) against a live generator angle ------------
{
  const cone = { baseLength: 3, height: 3.6 };       // r = 1.5, h = 3.6
  const g = generatorAngleDeg(cone);                  // atan(3.6/1.5) = 67.38°
  ok('generator angle', near(g, (Math.atan2(3.6, 1.5) * 180) / Math.PI, 1e-9), `${g.toFixed(2)}°`);
  // The plane's offset is measured from the APEX, so a non-zero offset is a plane clear of
  // it; offset 0 is section plane FF by construction.
  const at = (angleDeg, offset = -1.2) =>
    classifySection({ enabled: true, angleDeg, offset }, g).key;
  ok('AA ⊥ axis → circle', at(0) === 'Circle');
  ok('BB inclined → ellipse', at(40) === 'Ellipse');
  ok('CC ∥ generator → parabola', at(g) === 'Parabola');
  ok('DD steeper → hyperbola', at(80) === 'Hyperbola');
  ok('EE ∥ axis → rectangular hyperbola', at(90) === 'RectangularHyperbola');
  ok('FF through apex → triangle', at(45, 0) === 'IsoscelesTriangle');
  ok('FF holds at any slope', at(70, 0.02) === 'IsoscelesTriangle');
}

// ---- 5. Every construction: its plotted dots must satisfy its own curve ---------
const dots = (layout) => layout.items.filter((i) => i.k === 'dot').map((i) => i.p);
const conicFor = (over) => ({ ...defaultConicState(), ...over });

// helper: max |f(p)| over the construction dots that are NOT on an axis
const residual = (pts, f) => pts.reduce((w, p) => Math.max(w, Math.abs(f(p))), 0);

{ // ellipse-concentric: x²/a² + y²/b² = 1
  const c = conicFor({ method: 'ellipse-concentric', dim1: 120, dim2: 80, showTangent: false });
  const L = layoutFor('methods', c);
  const a = 60, b = 40;
  const pts = dots(L).filter((p) => Math.abs(p.x) > 1e-6 && Math.abs(p.y) > 1e-6);
  ok('ellipse-concentric points on curve',
    residual(pts, (p) => (p.x / a) ** 2 + (p.y / b) ** 2 - 1) < 1e-9, `n=${pts.length}`);
}
{ // ellipse-oblong
  const c = conicFor({ method: 'ellipse-oblong', dim1: 150, dim2: 90, showTangent: false });
  const L = layoutFor('methods', c);
  const a = 75, b = 45;
  const pts = dots(L).filter((p) => Math.abs(p.x) > 1e-6 && Math.abs(p.y) > 1e-6);
  ok('ellipse-oblong points on curve',
    residual(pts, (p) => (p.x / a) ** 2 + (p.y / b) ** 2 - 1) < 1e-9, `n=${pts.length}`);
}
{ // ellipse-parallelogram: affine ellipse u cos t + v sin t → check via inverse map
  const c = conicFor({ method: 'ellipse-parallelogram', dim1: 150, dim2: 108, dim3: 70, showTangent: false });
  const L = layoutFor('methods', c);
  const ux = 75, uy = 0;
  const vx = 54 * Math.cos((70 * Math.PI) / 180), vy = -54 * Math.sin((70 * Math.PI) / 180);
  const det = ux * vy - uy * vx;
  const pts = dots(L).filter((p) => Math.hypot(p.x, p.y) > 1e-6);
  const f = (p) => {
    const s = (p.x * vy - p.y * vx) / det;      // coefficient of u
    const t = (ux * p.y - uy * p.x) / det;      // coefficient of v
    return s * s + t * t - 1;
  };
  ok('ellipse-parallelogram points on curve', residual(pts, f) < 1e-9, `n=${pts.length}`);
}
{ // ellipse-arcs: PF + PF' = the given sum
  const c = conicFor({ method: 'ellipse-arcs', dim1: 100, dim2: 152, points: 4, showTangent: false });
  const L = layoutFor('methods', c);
  const F = { x: -50, y: 0 }, F2 = { x: 50, y: 0 };
  const pts = dots(L).filter((p) => Math.abs(p.y) > 1e-6);
  ok('ellipse-arcs sum of focal distances = 152',
    residual(pts, (p) => Math.hypot(p.x - F.x, p.y) + Math.hypot(p.x - F2.x, p.y) - 152) < 1e-6,
    `n=${pts.length}`);
}
{ // parabola-tangent: the chords must be TANGENT to y² = 4f x (envelope check)
  const c = conicFor({ method: 'parabola-tangent', dim1: 120, dim2: 90, showTangent: false });
  const L = layoutFor('methods', c);
  const f = (60 * 60) / (4 * 90);
  // every construction line joining the two divided tangents should touch the curve once
  const lines = L.items.filter((i) => i.k === 'line' && i.role === 'construction');
  let worst = 0;
  for (const ln of lines) {
    const dx = ln.b.x - ln.a.x, dy = ln.b.y - ln.a.y;
    if (Math.abs(dy) < 1e-9) continue;
    // substitute x = a.x + s dx, y = a.y + s dy into y² = 4f x → quadratic in s
    const A = dy * dy;
    const B = 2 * ln.a.y * dy - 4 * f * dx;
    const C = ln.a.y * ln.a.y - 4 * f * ln.a.x;
    const disc = B * B - 4 * A * C;
    worst = Math.max(worst, Math.abs(disc) / (A * A + 1));
  }
  ok('parabola-tangent chords are tangents (disc≈0)', worst < 1e-6, `worst=${worst.toExponential(2)}`);
}
{ // parabola-rectangle
  const c = conicFor({ method: 'parabola-rectangle', dim1: 100, dim2: 80, showTangent: false });
  const L = layoutFor('methods', c);
  const pts = dots(L).filter((p) => Math.abs(p.x) > 1e-6 && Math.abs(p.y) > 1e-6);
  ok('parabola-rectangle points on curve',
    residual(pts, (p) => p.y - 80 * (2 * p.x / 100) ** 2) < 1e-9, `n=${pts.length}`);
}
{ // parabola-offset — the squares
  const c = conicFor({ method: 'parabola-offset', dim1: 160, dim2: 96, showTangent: false });
  const L = layoutFor('methods', c);
  const pts = dots(L).filter((p) => Math.abs(p.x) > 1e-6 && Math.abs(p.y) > 1e-6);
  ok('parabola-offset points on curve',
    residual(pts, (p) => p.y - 96 * (2 * p.x / 160) ** 2) < 1e-9, `n=${pts.length}`);
}
{ // parabola-parallelogram: affine parabola apex + u·halfChord − u²·leg
  const c = conicFor({ method: 'parabola-parallelogram', dim1: 100, dim2: 60, dim3: 110, showTangent: false });
  const L = layoutFor('methods', c);
  ok('parabola-parallelogram draws a curve', (L.curvePts?.length ?? 0) > 100, `pts=${L.curvePts?.length}`);
  ok('parabola-parallelogram bbox finite', Number.isFinite(L.bbox.minX) && Number.isFinite(L.bbox.maxY));
}
{ // hyperbola-foci: |PF₂ − PF₁| = the given difference
  const c = conicFor({ method: 'hyperbola-foci', dim1: 100, dim2: 50, points: 4, showTangent: false });
  const L = layoutFor('methods', c);
  const F1 = { x: 50, y: 0 }, F2 = { x: -50, y: 0 };
  const pts = dots(L).filter((p) => Math.abs(p.y) > 1e-6);
  ok('hyperbola-foci difference = 50',
    residual(pts, (p) => Math.abs(Math.hypot(p.x - F2.x, p.y) - Math.hypot(p.x - F1.x, p.y)) - 50) < 1e-6,
    `n=${pts.length}`);
}
{ // hyperbola-ordinate: x²/a² − y²/b² = 1 through (a+abscissa, ordinate)
  const c = conicFor({ method: 'hyperbola-ordinate', dim1: 80, dim2: 48, dim3: 60, showTangent: false });
  const L = layoutFor('methods', c);
  const a = 40;
  const b = 60 / Math.sqrt(((40 + 48) / 40) ** 2 - 1);
  const pts = dots(L).filter((p) => Math.abs(p.y) > 1e-6 && p.x > a + 1e-6);
  ok('hyperbola-ordinate points on curve',
    residual(pts, (p) => (p.x / a) ** 2 - (p.y / b) ** 2 - 1) < 1e-9, `n=${pts.length} b=${b.toFixed(2)}`);
}
{ // hyperbola-asymptotes: the product of the distances measured along the asymptotes is constant
  const c = conicFor({ method: 'hyperbola-asymptotes', dim1: 80, dim2: 30, dim3: 45, showTangent: false });
  const L = layoutFor('methods', c);
  const ang = (80 * Math.PI) / 180;
  const oy = { x: Math.cos(ang), y: -Math.sin(ang) };
  const prod = (p) => {
    const v = -p.y;                      // distance from OX
    const u = p.x - (-v / oy.y) * oy.x;  // distance along OX from the OY leg
    return u * v;
  };
  const k = 45 * 30; // P is 45 mm from OY measured along OX, 30 mm above OX
  ok('hyperbola-asymptotes constant product',
    residual(L.curvePts, (p) => prod(p) - k) < 1e-6, `k=${k.toFixed(2)}`);
}

// ---- 6. Every mode + every method builds a finite, non-degenerate bbox ----------
for (const mode of ['locus', 'terms', 'eccentricity']) {
  for (const curve of ['Ellipse', 'Parabola', 'Hyperbola']) {
    const e = curve === 'Ellipse' ? 2 / 3 : curve === 'Parabola' ? 1 : 1.5;
    const L = layoutFor(mode, conicFor({ curve, e }));
    const wide = L.bbox.maxX - L.bbox.minX;
    const tall = L.bbox.maxY - L.bbox.minY;
    ok(`${mode}/${curve} bbox`, Number.isFinite(wide) && wide > 1 && tall > 1,
      `${wide.toFixed(1)} × ${tall.toFixed(1)} mm, ${L.items.length} items`);
  }
}
for (const m of METHODS) {
  const c = conicFor({ curve: m.curve, method: m.id, dim1: m.dim1.value, dim2: m.dim2.value, dim3: m.dim3?.value });
  const L = layoutFor('methods', c);
  const wide = L.bbox.maxX - L.bbox.minX;
  const tall = L.bbox.maxY - L.bbox.minY;
  const finite = L.items.every((i) => {
    const ps = i.k === 'poly' ? i.pts : [i.a, i.b, i.p, i.c].filter(Boolean);
    return ps.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  });
  ok(`method ${m.id}`, finite && wide > 1 && tall > 1 && L.curvePts?.length > 10,
    `${wide.toFixed(0)}×${tall.toFixed(0)} mm, ${L.items.length} items`);
}

// ---- 7. pointOnConic stays on the curve for every t ----------------------------
for (const e of [0.5, 1, 1.8]) {
  const m = conicModel(e, 50);
  let worst = 0;
  for (let i = 0; i <= 20; i++) {
    const { p } = pointOnConic(m, i / 20);
    worst = Math.max(worst, Math.abs(Math.hypot(p.x - m.focus.x, p.y) - e * Math.abs(p.x)));
  }
  ok(`pointOnConic e=${e}`, worst < 1e-6, `worst=${worst.toExponential(2)}`);
}

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
