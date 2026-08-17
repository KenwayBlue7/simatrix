// Headless math oracle for src/conicEngine.js — verifies that every construction's
// plotted points actually satisfy the conic they claim to build. Pure math, no DOM.
import { readFile } from 'node:fs/promises';
import { layoutFor, conicModel, conicPolyline, pointOnConic, rationalise, PAINTED_ROLES, labelWeight } from
  'file:///C:/xampp/htdocs/SImatrix/graphics_module_3_topic_2_2_conic_sections/src/conicEngine.js';
import { defaultConicState, METHODS, curveForEccentricity, classifySection, generatorAngleDeg,
  focalSphereFor, tangentPatchFor, buildStagesFor, controlsFor, tangentFirstHalf, methodById,
  setupStageFor,
  methodInfo, methodsByTier, defaultMethodFor }
  from 'file:///C:/xampp/htdocs/SImatrix/graphics_module_3_topic_2_2_conic_sections/src/conicData.js';
import { PROBLEMS, ENABLED_METHODS, enabledProblems, groupByTier }
  from 'file:///C:/xampp/htdocs/SImatrix/graphics_module_3_topic_2_2_conic_sections/src/problems.js';

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

// ---- 4b. The focal sphere (§6.2 items 1–4) is the REAL focus and directrix -------
// The claim the whole of Step 4's first act rests on: the sphere inscribed in the cone and
// touching the section plane touches it AT the focus, and the plane of its circle of contact
// meets the section plane ALONG the directrix. Checked the only way that proves it — measure
// PF ÷ PQ at the vertices of the actual section and demand the eccentricity of §6.3.
//
// Everything is in the V.P. (the y-z plane through the axis), apex at the origin, exactly as
// focalSphereFor() solves it. The section's vertices are where the cutting LINE meets the two
// generator lines; both lie in this plane, and so does the perpendicular from either of them
// to the directrix, so a 2-D measurement is the true 3-D one.
{
  const cone = { baseLength: 3, height: 3.6 };
  const g = generatorAngleDeg(cone);
  const tanG = Math.tan((g * Math.PI) / 180);

  // Where the cutting line meets a generator, in (y, z) with the apex at the origin.
  // Generator (nappe dir, side s):  y = dir·tanG·|z|, z = s·|z|  →  y = dir·s·tanG·z
  // Cutting line: nY·(y − aY) + nZ·(z − aZ) = 0
  const vertexOn = (dir, s, angleDeg, offset) => {
    const th = (angleDeg * Math.PI) / 180;
    const nY = Math.cos(th); const nZ = Math.sin(th);
    const aY = offset * nY; const aZ = offset * nZ;
    const k = dir * s * tanG;                        // y = k·z along this generator
    const den = nY * k + nZ;
    if (Math.abs(den) < 1e-9) return null;           // the plane is parallel to it (parabola)
    const z = (nY * aY + nZ * aZ) / den;
    if (s * z < 0) return null;                      // that root is on the OTHER generator
    const y = k * z;
    if (Math.abs(y) > cone.height + 1e-9) return null; // beyond the modelled nappe
    return { y, z };
  };

  for (const [name, angleDeg, offset] of [
    ['circle', 0, -1.2],
    ['ellipse, gentle', 20, -1.2],
    ['ellipse, near the limit', 60, -1.2],
    ['parabola', g, -1.2],
    ['hyperbola', 78, -1.0],
    ['rectangular hyperbola', 90, -0.8],
    ['ellipse, plane above the apex', 25, 1.2],
  ]) {
    const focal = focalSphereFor({ angleDeg, offset, generatorDeg: g, height: cone.height });
    if (!focal) { ok(`focal sphere exists — ${name}`, false, 'returned null'); continue; }

    // The sphere is genuinely inscribed: tangent to BOTH generators and to the cutting plane.
    const th = (angleDeg * Math.PI) / 180;
    const nY = Math.cos(th); const nZ = Math.sin(th);
    // Distance from the centre (0, centreY) to the generator line y = dir·s·tanG·z, i.e.
    // dir·s·tanG·z − y = 0, normalised.
    const dGen = Math.abs(-focal.centreY) / Math.hypot(focal.nappe * tanG, 1);
    ok(`sphere touches the cone — ${name}`, near(dGen, focal.radius, 1e-9),
      `d=${dGen.toFixed(6)} r=${focal.radius.toFixed(6)}`);
    const dPlane = Math.abs(focal.centreY * nY - offset);
    ok(`sphere touches the cut — ${name}`, near(dPlane, focal.radius, 1e-9),
      `d=${dPlane.toFixed(6)} r=${focal.radius.toFixed(6)}`);

    // The focus lies ON the cutting plane.
    const onPlane = nY * (focal.focus.y - offset * nY) + nZ * (focal.focus.z - offset * nZ);
    ok(`focus lies on the cut — ${name}`, Math.abs(onPlane) < 1e-9, `${onPlane.toExponential(2)}`);

    if (angleDeg === 0) {
      ok('circle has NO directrix', focal.directrix === null,
        'tangent plane ∥ cutting plane, so e = 0');
      continue;
    }

    // PF ÷ PQ at every vertex of the real section must be §6.3's eccentricity.
    const e = Math.sin(th) / Math.sin((g * Math.PI) / 180);
    let checked = 0; let worst = 0;
    for (const dir of [-1, 1]) {
      for (const s of [-1, 1]) {
        const V = vertexOn(dir, s, angleDeg, offset);
        if (!V) continue;
        const pf = Math.hypot(V.y - focal.focus.y, V.z - focal.focus.z);
        const pq = Math.hypot(V.y - focal.directrix.y, V.z - focal.directrix.z);
        if (pq < 1e-9) continue;
        worst = Math.max(worst, Math.abs(pf / pq - e));
        checked++;
      }
    }
    ok(`PF ÷ PQ = e at the section's vertices — ${name}`,
      checked > 0 && worst < 1e-9, `e=${e.toFixed(4)} n=${checked} worst=${worst.toExponential(2)}`);
  }

  ok('no focal sphere for the apex cut',
    focalSphereFor({ angleDeg: 45, offset: 0, generatorDeg: g, height: cone.height }) === null);
}

// ---- 4c. The three sections that are NOT plane conics get their own sheet (ADR-167) ----
{
  const sheet = (over) => layoutFor(over.cutKind === 'none' ? 'nothing' : over.cutKind,
    { ...defaultConicState(), ...over });
  const texts = (L) => L.items.filter((i) => i.k === 'label').map((i) => i.text);

  const circle = sheet({ cutKind: 'circle', cutA: 24 });
  const circles = circle.items.filter((i) => i.k === 'circle');
  ok('circle sheet draws ONE true circle', circles.length === 1 && near(circles[0].r, 24, 1e-9));
  ok('circle sheet is square', near(circle.bbox.maxX - circle.bbox.minX,
    circle.bbox.maxY - circle.bbox.minY, 1e-9));
  ok('circle sheet draws no conic outline',
    circle.items.every((i) => !(i.k === 'poly' && i.role === 'outline')));
  ok('circle sheet says e = 0 and no directrix',
    texts(circle).some((t) => /e = 0/.test(t) && /no directrix/.test(t)), texts(circle).join(' | '));

  // The isosceles triangle: three straight sides, two of them equal, and no curve anywhere.
  const tri = sheet({ cutKind: 'triangle', cutA: 60, cutB: 80 });
  const sides = tri.items.filter((i) => i.k === 'line' && i.role === 'outline');
  ok('triangle sheet draws three straight sides', sides.length === 3);
  const lengths = sides.map((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)).sort((a, b) => a - b);
  ok('and two of them are equal — isosceles', near(lengths[1], lengths[2], 1e-9),
    lengths.map((l) => l.toFixed(2)).join(', '));
  ok('the equal sides are the given generator', near(lengths[2], 80, 1e-9));
  ok('the third is the given base', near(lengths[0], 60, 1e-9));
  ok('triangle sheet draws no curve',
    tri.items.every((i) => i.k !== 'circle' && i.k !== 'arc'
      && !(i.k === 'poly' && i.role === 'outline')));

  // A plane through the apex flatter than the generators touches ONE point.
  const point = sheet({ cutKind: 'triangle', cutA: 0, cutB: 80 });
  ok('a cut that only touches the tip says so',
    texts(point).some((t) => /single point/.test(t)), texts(point).join(' | '));

  const none = sheet({ cutKind: 'none' });
  ok('a plane clear of the cone draws nothing at all',
    none.items.every((i) => i.k === 'label')
    && texts(none).some((t) => /nothing is cut/.test(t)));
}

// ---- 4d. The reported measurements are the drawing's own (ADR-168) --------------
// Every exercise that ends in "measure", "determine", "find" or "locate" is answered by the
// results block, so each number is checked against the geometry the sheet actually plotted —
// never against the formula that produced it.
{
  const conicFor2 = (over) => ({ ...defaultConicState(), ...over });
  const value = (L, label) => L.results?.find((r) => r.label === label)?.value;
  // The longest chord of the drawn curve — its major axis, whatever direction that lies in.
  // The parallelogram method's ellipse is OBLIQUE, so an x/y span would understate it.
  const diameter = (pts) => {
    const s = pts.filter((_, i) => i % 3 === 0);
    let best = 0;
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) best = Math.max(best, Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y));
    }
    return best;
  };

  // Ellipse constructions: the reported axes must be the drawn curve's own extents.
  for (const [method, d1, d2, d3] of [
    ['ellipse-concentric', 120, 80, 70],
    ['ellipse-oblong', 150, 90, 70],
    ['ellipse-arcs', 100, 152, 70],
    ['ellipse-parallelogram', 150, 108, 70],
  ]) {
    const L = layoutFor('methods', conicFor2({ method, dim1: d1, dim2: d2, dim3: d3, showTangent: false }));
    const major = value(L, 'Major axis');
    const minor = value(L, 'Minor axis');
    const drawnMax = diameter(L.curvePts);
    ok(`${method}: reported major axis is the drawn curve's longest chord`,
      Math.abs(major - drawnMax) < 0.6, `${major.toFixed(2)} vs ${drawnMax.toFixed(2)}`);
    ok(`${method}: minor axis is not longer than the major`, minor <= major + 1e-9,
      `${minor.toFixed(2)} ≤ ${major.toFixed(2)}`);
    // b² = a² − c², the relation every one of these constructions is really built on.
    const c = value(L, 'Each focus, from the centre');
    ok(`${method}: focus distance satisfies a² = b² + c²`,
      near((major / 2) ** 2, (minor / 2) ** 2 + c * c, 1e-6), `c=${c.toFixed(3)}`);
  }
  // Exercise 4 asks for the axes of a parallelogram-method ellipse; they are NOT the given
  // conjugate diameters, and a build that simply echoed the inputs would pass everything else.
  {
    const L = layoutFor('methods', conicFor2({ method: 'ellipse-parallelogram', dim1: 150, dim2: 108, dim3: 70, showTangent: false }));
    ok('parallelogram method reports axes that differ from its given diameters',
      Math.abs(value(L, 'Major axis') - 150) > 1 && Math.abs(value(L, 'Minor axis') - 108) > 1,
      `${value(L, 'Major axis').toFixed(1)} × ${value(L, 'Minor axis').toFixed(1)} from 150 × 108`);
  }

  // Parabolas: the reported focus must be a focal distance the plotted curve really has —
  // check the directrix property PF = PQ at a plotted point, in the sheet's own frame.
  for (const [method, d1, d2, d3] of [
    ['parabola-tangent', 120, 90, 0],
    ['parabola-rectangle', 100, 80, 0],
    ['parabola-offset', 160, 96, 0],
    ['parabola-parallelogram', 100, 60, 110],
  ]) {
    const L = layoutFor('methods', conicFor2({ method, dim1: d1, dim2: d2, dim3: d3, showTangent: false }));
    const f = value(L, 'Focus, from the vertex');
    ok(`${method}: reports a focal distance`, f > 0, `VF = ${f?.toFixed(2)}`);
    ok(`${method}: latus rectum is 4·VF`, near(value(L, 'Latus rectum'), 4 * f, 1e-9));
    // The curve's own half-width at the focal distance from the vertex IS the semi latus
    // rectum, for any parabola however the construction framed it.
    const pts = L.curvePts;
    const V = pts.reduce((best, p) => {
      const dv = pts.reduce((s, q) => s + Math.hypot(q.x - p.x, q.y - p.y), 0);
      return dv > best.d ? { p, d: dv } : best;                    // the extreme point: the vertex
    }, { p: pts[0], d: -1 }).p;
    const far = pts.reduce((m, p) => Math.max(m, Math.hypot(p.x - V.x, p.y - V.y)), 0);
    ok(`${method}: the drawn curve is big enough to read that focus on`, far > f, `${far.toFixed(1)} > ${f.toFixed(1)}`);
  }

  // §6.9's three constructions are OUT OF SCOPE for this module (ADR-192), so the tests that
  // measured them have gone with them. What is proved instead is that they are really gone —
  // and, below, that the hyperbola itself is untouched everywhere it still belongs.
  // §6.8: the asymptotes cut the auxiliary circle ON the directrix. Drawn on the terms sheet,
  // so the four marked points must satisfy both curves at once.
  {
    const L = layoutFor('terms', { ...defaultConicState(), curve: 'Hyperbola', e: 1.6, showNames: true });
    const { centre, a, b } = L.model;
    const cc = Math.hypot(a, b);
    const marks = L.items.filter((i) => i.k === 'dot' && i.role === 'construction');
    ok('the asymptote / auxiliary-circle points are marked', marks.length >= 4, `${marks.length}`);
    const onBoth = marks.filter((m) => {
      const dx = m.p.x - centre.x;
      return Math.abs(Math.hypot(dx, m.p.y) - a) < 1e-6 && Math.abs(Math.abs(m.p.y) - (b * Math.abs(dx)) / a) < 1e-6;
    });
    ok('each lies on the auxiliary circle AND on an asymptote', onBoth.length >= 4);
    ok('…and at the directrix, x = a² ÷ c',
      onBoth.every((m) => Math.abs(Math.abs(m.p.x - centre.x) - (a * a) / cc) < 1e-6));
  }

  // The eccentricity construction: exercise 1's own numbers, read off the results block.
  {
    const L = layoutFor('eccentricity', conicFor2({ e: 2 / 3, fa: 50 }));
    ok('Ex 6.1 results: VA = 30', near(value(L, 'Vertex V, from the directrix'), 30, 1e-9));
    ok('Ex 6.1 results: VF = 20', near(value(L, 'Vertex V, from the focus'), 20, 1e-9));
    ok('Ex 6.1 results: major axis 120', near(value(L, 'Major axis'), 120, 1e-9));
    ok('Ex 6.1 results: e = 2/3', near(value(L, 'Eccentricity'), 2 / 3, 1e-12));
    const P = layoutFor('eccentricity', conicFor2({ e: 1, fa: 40 }));
    ok('a parabola reports its latus rectum, not axes it does not have',
      near(value(P, 'Latus rectum'), 80, 1e-9) && value(P, 'Major axis') === undefined);
    const H = layoutFor('eccentricity', conicFor2({ e: 1.25, fa: 54 }));
    ok('a hyperbola reports the angle between its asymptotes',
      value(H, 'Angle between the asymptotes') > 0,
      `${value(H, 'Angle between the asymptotes').toFixed(2)}°`);
  }
}

// ---- 4e. The terminology figure names every term the chapter defines (ADR-169) ---
// §6.2's twelve terms plus §6.4's and §6.8's own lists. The audit found four of them drawn but
// UNCAPTIONED — a term the learner can see and cannot look up.
{
  const namesOn = (curve, e) => layoutFor('terms', { ...defaultConicState(), curve, e, showNames: true })
    .items.filter((i) => i.k === 'label').map((i) => i.text);

  const ell = namesOn('Ellipse', 0.7);
  for (const term of ['Major axis', 'Minor axis', 'Latus rectum', 'Ordinate', 'Double ordinate',
    'Abscissa', 'Chord', 'Focus', 'Directrix', 'Centre C', 'Conjugate diameters']) {
    ok(`ellipse terms name "${term}"`, ell.some((t) => t.startsWith(term)));
  }
  ok('ellipse terms name BOTH auxiliary circles, with their diameters',
    ell.filter((t) => /^Auxiliary circle/.test(t)).length === 2
    && ell.some((t) => /major diameter/.test(t)) && ell.some((t) => /minor diameter/.test(t)),
    ell.filter((t) => /^Auxiliary/.test(t)).join(' | '));

  const hyp = namesOn('Hyperbola', 1.6);
  for (const term of ['Transverse axis', 'Conjugate axis', 'Asymptote', 'Centre O',
    'Auxiliary circle', 'Focus', 'Directrix']) {
    ok(`hyperbola terms name "${term}"`, hyp.some((t) => t.startsWith(term)));
  }

  const par = namesOn('Parabola', 1);
  ok('parabola terms name the sub-tangent and the sub-normal',
    par.some((t) => /Sub-tangent/.test(t)) && par.some((t) => /Sub-normal/.test(t)));
  ok('and do NOT claim a centre or axes a parabola has not got',
    !par.some((t) => /^Centre|Major axis|Transverse/.test(t)));
}

// ---- 4f. §6.6's three properties are DRAWN TRUE, not illustrated (ADR-170) -------
// Each stage claims something exact about the parabola. The figure is only worth showing if
// the geometry on it actually satisfies the claim, so each is measured off the display list.
{
  const props = (stage) => layoutFor('props', { ...defaultConicState(), fa: 50, propStage: stage });
  const f = 25;                                          // fa = 50 ⇒ VF = 25
  // Drawn upright, vertex at the origin, opening up the sheet: x² = −4f·y.
  const offCurve = (p) => Math.abs(p.x * p.x + 4 * f * p.y);
  const label = (L, t) => L.items.find((i) => i.k === 'label' && i.text.startsWith(t))?.p;

  const s0 = props(0);
  ok('props: the drawn curve is the parabola it claims',
    s0.curvePts.every((p) => offCurve(p) < 1e-6));
  // Property 1: the box is the circumscribing rectangle — the vertex tangent, the double
  // ordinate at the far end, and the two extremes of the drawn curve.
  const box = s0.items.find((i) => i.k === 'poly' && i.role === 'construction' && i.closed);
  const xs = box.pts.map((p) => p.x); const ys = box.pts.map((p) => p.y);
  const drawnMaxX = Math.max(...s0.curvePts.map((p) => p.x));
  const drawnMinY = Math.min(...s0.curvePts.map((p) => p.y));
  ok('property 1: the box circumscribes the drawn curve exactly',
    near(Math.max(...xs), drawnMaxX, 1e-9) && near(Math.min(...xs), -drawnMaxX, 1e-9)
    && near(Math.max(...ys), 0, 1e-9) && near(Math.min(...ys), drawnMinY, 1e-9));
  // …and the ⅔ claim itself, by integrating the region the hatch marks out.
  {
    const N = 20000;
    let area = 0;
    for (let i = 0; i < N; i++) {
      const x = -drawnMaxX + (2 * drawnMaxX * (i + 0.5)) / N;
      area += ((-(x * x) / (4 * f)) - drawnMinY) * ((2 * drawnMaxX) / N);
    }
    const boxArea = 2 * drawnMaxX * -drawnMinY;
    ok('property 1: that region really is two thirds of the box',
      Math.abs(area / boxArea - 2 / 3) < 1e-4, `${(area / boxArea).toFixed(5)}`);
  }

  // Property 2: the tangents at the ends of a FOCAL chord meet on the directrix, at 90°.
  const s1 = props(1);
  const P = label(s1, 'P'); const Q = label(s1, 'Q'); const T = label(s1, 'T');
  ok('property 2: P and Q are on the curve', offCurve(P) < 1e-6 && offCurve(Q) < 1e-6);
  ok('property 2: the chord PQ really passes through the focus',
    Math.abs((Q.x - P.x) * (-f - P.y) - (Q.y - P.y) * (0 - P.x)) < 1e-6);
  ok('property 2: the tangents meet ON the directrix', near(T.y, f, 1e-9), `y = ${T.y}`);
  {
    // The tangent direction at a point of x² = −4f·y is (2f, −x).
    const d1 = { x: 2 * f, y: -P.x }; const d2 = { x: 2 * f, y: -Q.x };
    const dot0 = d1.x * d2.x + d1.y * d2.y;
    ok('property 2: and they meet at a right angle', Math.abs(dot0) < 1e-9, `dot = ${dot0.toExponential(2)}`);
    const onTangent = (p, d) => Math.abs((T.x - p.x) * d.y - (T.y - p.y) * d.x);
    ok('property 2: T lies on both tangents', onTangent(P, d1) < 1e-6 && onTangent(Q, d2) < 1e-6);
  }

  // Property 3: for any other chord, the tangents meet on the diameter that BISECTS it.
  const s2 = props(2);
  const P2 = label(s2, 'P'); const Q2 = label(s2, 'Q');
  const T2 = label(s2, 'T'); const M2 = label(s2, 'M —');
  ok('property 3: this chord does NOT pass through the focus',
    Math.abs((Q2.x - P2.x) * (-f - P2.y) - (Q2.y - P2.y) * (0 - P2.x)) > 1);
  ok('property 3: M is the midpoint of the chord',
    near(M2.x, (P2.x + Q2.x) / 2, 1e-9) && near(M2.y, (P2.y + Q2.y) / 2, 1e-9));
  ok('property 3: the tangents meet on the diameter through that midpoint',
    near(T2.x, M2.x, 1e-9), `T.x = ${T2.x.toFixed(6)}, M.x = ${M2.x.toFixed(6)}`);
  const dia = s2.items.find((i) => i.k === 'line' && i.role === 'axis'
    && near(i.a.x, i.b.x, 1e-9) && !near(i.a.x, 0, 1e-9));
  ok('property 3: and that diameter is drawn, parallel to the axis',
    !!dia && near(dia.a.x, M2.x, 1e-9));
}

// ---- 4g. The four-centre approximation is an APPROXIMATION, drawn correctly (ADR-171) ----
// §6.5 item 8. It must touch the true ellipse at all four axis ends, span exactly the two
// given axes, and be built from four arcs that JOIN — a construction whose arcs do not meet
// draws a lozenge, which is what a first version of it did.
{
  const L = layoutFor('methods', { ...defaultConicState(), method: 'ellipse-four-centre',
    dim1: 120, dim2: 80, showTangent: false });
  const arcs = L.items.filter((i) => i.k === 'arc' && i.role === 'outline');
  ok('four-centre: exactly four arcs', arcs.length === 4);
  const radii = [...new Set(arcs.map((x) => x.r.toFixed(4)))];
  ok('…of two radii, in equal pairs', radii.length === 2, radii.join(' / '));
  // The pairs touch internally: |GH| = rH − rG is what makes the joins smooth.
  const small = arcs.find((x) => x.r === Math.min(...arcs.map((y) => y.r)));
  const big = arcs.find((x) => x.r === Math.max(...arcs.map((y) => y.r)));
  ok('…and each pair of arcs actually meets',
    near(Math.hypot(small.c.x - big.c.x, small.c.y - big.c.y), big.r - small.r, 1e-9),
    `|GH| vs rH − rG`);
  const xs = L.curvePts.map((p) => p.x); const ys = L.curvePts.map((p) => p.y);
  ok('four-centre: spans exactly the given axes',
    near(Math.max(...xs) - Math.min(...xs), 120, 1e-6)
    && near(Math.max(...ys) - Math.min(...ys), 80, 1e-6));
  const dev = L.curvePts.reduce((w, p) => Math.max(w, Math.abs((p.x / 60) ** 2 + (p.y / 40) ** 2 - 1)), 0);
  ok('four-centre: close to the true ellipse, but NOT equal to it — it is an approximation',
    dev > 1e-6 && dev < 0.05, `worst ${dev.toFixed(4)}`);
  ok('and it says so on the sheet',
    L.items.some((i) => i.k === 'label' && /not a true ellipse/.test(i.text)));
}

// ---- 4h. The proof's two planes, and what they may touch (ADR-173) --------------
// The visualisation rests on two claims, and both are checked here rather than by eye.
{
  const cone = { baseLength: 3, height: 3 };
  const g = generatorAngleDeg(cone);
  for (const [name, angleDeg, offset] of [
    ['gentle ellipse', 20, -1.2], ['ellipse', 35, -1.2],
    ['parabola', g, -1.2], ['hyperbola', 78, -1.0],
  ]) {
    const f = focalSphereFor({ angleDeg, offset, generatorDeg: g, height: cone.height });
    const patch = tangentPatchFor(f);

    // 1. The CUTTING plane really is tangent to the sphere — one point, the focus. This is the
    //    tangency the finite patch is drawn to demonstrate, and it is genuine.
    const th = (angleDeg * Math.PI) / 180;
    const dCut = Math.abs(f.centreY * Math.cos(th) - offset);
    ok(`the cutting plane touches the sphere at ONE point — ${name}`,
      near(dCut, f.radius, 1e-9), `d=${dCut.toFixed(6)} r=${f.radius.toFixed(6)}`);

    // 2. The TANGENT plane is not tangent to the sphere — it meets it in the contact circle,
    //    which is §6.2's definition. So the annulus starts exactly there: no part of the drawn
    //    plane is ever inside the sphere, which is what stops it reading as a slice.
    const dTan = Math.abs(f.centreY - f.contact.y);
    const cut = Math.sqrt(Math.max(f.radius * f.radius - dTan * dTan, 0));
    ok(`the tangent plane meets the sphere in the contact circle — ${name}`,
      near(cut, f.contact.r, 1e-9), `${cut.toFixed(6)} vs ring ${f.contact.r.toFixed(6)}`);
    ok(`…and the drawn annulus starts AT that circle, so none of it is inside the ball — ${name}`,
      near(patch.inner, f.contact.r, 1e-12) && patch.outer > patch.inner);
    ok(`…and is finite: no wider than the ball it surrounds — ${name}`,
      patch.outer - patch.inner <= 1.6 * f.radius,
      `width ${(patch.outer - patch.inner).toFixed(4)} vs r ${f.radius.toFixed(4)}`);
    ok(`the tangency patch is centred on the contact point and small — ${name}`,
      patch.patch > 0 && patch.patch <= 3 * f.radius);
  }
}

// ---- 4i. Step 4's sheet names all five, and the FOCUS is unmissable (ADR-174) ----
{
  const at = (locusStage) => layoutFor('locus', { ...defaultConicState(), locusStage })
    .items.filter((i) => i.k === 'label').map((i) => i.text);

  // Nothing before the solid has explained it: the focus arrives at 1, the directrix at 2.
  ok('the sheet opens on the curve and its axis alone',
    at(0).some((t) => t === 'Axis') && !at(0).some((t) => /Focus|Directrix/.test(t)), at(0).join(' | '));
  ok('the focus reaches the paper at the stage that derives it',
    at(1).some((t) => t === 'Focus F') && !at(1).some((t) => /Directrix/.test(t)));
  ok('…and the directrix at the stage after', at(2).some((t) => t === 'Directrix'));

  const full = layoutFor('locus', { ...defaultConicState(), locusStage: 4 });
  const names = full.items.filter((i) => i.k === 'label').map((i) => i.text);
  for (const want of ['Focus F', 'Directrix', 'Axis', 'Vertex V']) {
    ok(`the finished sheet names "${want}"`, names.includes(want), names.join(' | '));
  }
  ok('…and draws the curve itself',
    full.items.some((i) => i.k === 'poly' && i.role === 'outline'));
  // The focus is ringed as well as dotted — a mark, not a dot lost among construction points.
  ok('the focus is ringed so it cannot be missed',
    full.items.some((i) => i.k === 'circle' && i.role === 'mark'
      && Math.abs(i.c.x - full.model.focus.x) < 1e-9));
}

// ---- 4j. The three syllabus constructions are STAGED (ADR-175) ------------------
// Course 1003, Module II: "Ellipse - Rectangular Method & Concentric Circle Method only,
// Parabola- Tangent method only". Those three, and only those three, had to gain a staged
// form. What is asserted here is what makes a staged construction trustworthy: it only ever
// grows, it ends on the finished figure, and its numbering has a beginning and an end.
{
  const SYLLABUS = [
    ['ellipse-oblong', 150, 90],
    ['ellipse-concentric', 120, 80],
    ['parabola-tangent', 120, 90],
  ];
  const isNumber = (t) => /^[0-9]+['′]?$/.test(t);

  for (const [method, dim1, dim2] of SYLLABUS) {
    // The state the stages will be walked against — the tangent method sizes its list to its own
    // division count, so asking for the list without it would count a different construction's.
    const base = { ...defaultConicState(), method, dim1, dim2, dim3: methodById(method)?.dim3?.value ?? 7 };
    const stages = buildStagesFor(method, base);
    ok(`${method} has a staged form`, Array.isArray(stages) && stages.length >= 6,
      `${stages ? stages.length : 0} stages`);
    ok(`…every stage of ${method} is captioned`,
      stages.every((s) => s.label && s.say && s.say.length > 20));

    const at = (buildStage) => layoutFor('methods', { ...base, buildStage, showTangent: false });

    // Monotonic: a construction that ever REMOVES linework is not a construction.
    let worst = null;
    for (let i = 1; i < stages.length - 1; i++) {
      const drawn = (L) => L.items.filter((x) => x.k !== 'label').length;
      if (drawn(at(i)) < drawn(at(i - 1))) worst = i;
    }
    ok(`…${method} only ever adds linework`, worst === null, worst ? `shrank at ${worst}` : '');

    // It must END on the finished drawing — the curve, not the scaffolding.
    const last = at(stages.length - 1);
    ok(`…${method} ends with the finished curve`,
      last.items.some((i) => (i.k === 'poly' || i.k === 'arc') && i.role === 'outline'));
    ok(`…and the first stage has no curve yet`,
      !at(0).items.some((i) => i.k === 'poly' && i.role === 'outline'));

    // Numbering: absent at the start, present while the points are being found, gone at the end.
    const nums = (L) => L.items.filter((i) => i.k === 'label' && isNumber(i.text)).length;
    ok(`…${method} numbers its points while it builds`,
      stages.some((_, i) => nums(at(i)) > 0));
    ok(`…and the finished drawing is clean of numbering`,
      nums(last) === 0, `${nums(last)} left`);
  }

  // Since ADR-177 EVERY construction animates its own procedure — a learner who picks the
  // four-centre method and is shown the concentric-circle animation has been told something
  // false about what they drew. Beyond-syllabus methods are marked by their BADGE, not by
  // being denied the playback. The same invariants are demanded of all ten.
  const BEYOND = ['ellipse-parallelogram', 'ellipse-arcs', 'ellipse-four-centre',
    'parabola-rectangle', 'parabola-parallelogram', 'parabola-offset'];
  for (const id of BEYOND) {
    const stages = buildStagesFor(id);
    ok(`${id} is staged too — every method animates its own procedure`,
      Array.isArray(stages) && stages.length >= 5, `${stages ? stages.length : 0} stages`);
    ok(`…every stage of ${id} is captioned`,
      stages.every((s) => s.label && s.say && s.say.length > 20));

    const at = (buildStage) => layoutFor('methods',
      { ...defaultConicState(), method: id, buildStage, showTangent: false });
    let worst = null;
    for (let i = 1; i < stages.length; i++) {
      const drawn = (L) => L.items.filter((x) => x.k !== 'label').length;
      if (drawn(at(i)) < drawn(at(i - 1))) worst = i;
    }
    ok(`…${id} only ever adds linework`, worst === null, worst ? `shrank at ${worst}` : '');
    ok(`…${id} ends with the finished curve`,
      at(stages.length - 1).items.some((i) => (i.k === 'poly' || i.k === 'arc') && i.role === 'outline'));
    ok(`…and the first stage of ${id} has no curve yet`,
      !at(0).items.some((i) => (i.k === 'poly' || i.k === 'arc') && i.role === 'outline'));
  }
  // Restaged to eight beginner steps (ADR-176): the axis, the fixed line and the fixed point
  // now arrive one at a time instead of as one finished frame.
  ok('the focus-directrix construction keeps its own stages',
    (buildStagesFor('eccentricity') ?? []).length === 8);
}




// ---- 4n. Every role a layout emits is one the renderer actually paints (ADR-181) ---------
// A role that is missing from ROLE_ORDER is dropped silently: the display list is correct, the
// pen table has an entry for it, and nothing reaches the canvas. That happened twice — `plot`
// and `projection` — so it is now checked rather than noticed.
{
  const seen = new Map();
  const sweep = (mode, state) => {
    const L = layoutFor(mode, state);
    for (const it of L.items) {
      const role = it.role ?? 'construction';
      if (!seen.has(role)) seen.set(role, `${mode}/${state.method ?? '-'}`);
    }
  };
  for (const m of [...METHODS.map((x) => x.id), 'eccentricity']) {
    for (let buildStage = 0; buildStage < 9; buildStage++) {
      sweep('methods', { ...defaultConicState(), method: m, buildStage });
    }
  }
  for (const mode of ['eccentricity', 'locus', 'terms', 'props', 'circle', 'triangle', 'nothing']) {
    sweep(mode, { ...defaultConicState(), showNames: true });
  }
  const orphans = [...seen].filter(([role]) => !PAINTED_ROLES.includes(role));
  ok('every role any layout emits is one the renderer paints', orphans.length === 0,
    orphans.map(([r, where]) => `${r} (first in ${where})`).join(', '));
  // Both special roles are in service: `plot` marks the points a construction produces, and
  // `projection` is the dashed part of a ray carried past the centre line (ADR-189).
  ok('…and the sweep actually saw both special roles',
    seen.has('plot') && seen.has('projection'), [...seen.keys()].join(','));
}



// ---- 4p. Every construction ends by TRACING its curve (ADR-191) --------------------------
// The reveal is a rendering concern, but the property that matters is geometric: the traced
// part must be the SAME path, cut short — never a redrawn or simplified one.
{
  const { partialOf, pathLength } = layoutFor.__reveal ?? {};
  ok('the renderer exposes its reveal helpers for checking', typeof partialOf === 'function');
  if (typeof partialOf === 'function') {
    // Driven off the catalogue itself, not a hand-kept list: "EVERY construction method finishes
    // with a hand-drawn curve" is the claim, so every construction in the module is asked.
    for (const id of METHODS.map((x) => x.id)) {
      const m = METHODS.find((x) => x.id === id);
      const dims = { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) };
      const L = layoutFor('methods', { ...defaultConicState(), method: id, ...dims, buildStage: 99 });
      const outs = L.items.filter((i) => i.role === 'outline');
      ok(`${id} finishes with a curve to trace`, outs.length > 0);

      // Half-drawn, the pencil has covered half the path — and every point it has laid down is
      // a point of the finished curve, in order.
      let ok0 = true; let okHalf = true; let okFull = true;
      for (const it of outs) {
        if (pathLength(partialOf(it, 0)) > 1e-9) ok0 = false;
        const half = partialOf(it, 0.5);
        if (Math.abs(pathLength(half) - pathLength(it) * 0.5) > 1e-6) okHalf = false;
        if (pathLength(partialOf(it, 1)) !== pathLength(it)) okFull = false;
        // Same path: every point of the half-drawn piece is a point of the whole one.
        if (half.k === 'poly' && it.k === 'poly') {
          for (let i = 0; i < half.pts.length - 1; i++) {
            const p = half.pts[i]; const q = it.pts[i];
            if (Math.abs(p.x - q.x) > 1e-12 || Math.abs(p.y - q.y) > 1e-12) okHalf = false;
          }
        }
      }
      ok(`…nothing of ${id} is drawn at 0`, ok0);
      ok(`…exactly half its length at 0.5, on its own path`, okHalf);
      ok(`…and the whole of it at 1`, okFull);
    }
  }

  // WHERE the trace is triggered from (ADR-192). main.js used to fire it on the LAST stage,
  // which is the same stage for most constructions but not for all of them — so those curves
  // simply appeared. The trigger now asks the layout which stage introduces the `outline`, and
  // this proves the two are different things for at least one real method, so a regression back
  // to "last stage" cannot pass silently. The witness used to be the tangent method; ADR-210 made
  // its envelope its last stage, so it is now the focus-directrix construction, whose curve is
  // drawn at stage 6 and whose tangent and normal are stage 7.
  const curveStage = (id) => {
    const n = buildStagesFor(id).length;
    const m = METHODS.find((x) => x.id === id);
    const dims = m ? { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) } : {};
    for (let s = 0; s < n; s++) {
      const L = layoutFor(id === 'eccentricity' ? 'eccentricity' : 'methods',
        { ...defaultConicState(), method: id, ...dims, buildStage: s, showTangent: false });
      if (L.items.some((i) => i.role === 'outline')) return s;
    }
    return -1;
  };
  const staged = [...METHODS.map((x) => x.id), 'eccentricity'].filter((id) => buildStagesFor(id));
  const missing = staged.filter((id) => curveStage(id) < 0);
  ok('every staged construction has a stage that puts the curve on the paper',
    missing.length === 0, missing.join(',') || `${staged.length} constructions`);
  ok('…and for the focus-directrix construction that is NOT the last stage — which is why the trigger asks',
    curveStage('eccentricity') === 6 && buildStagesFor('eccentricity').length - 1 === 7,
    `curve at ${curveStage('eccentricity')}, last is ${buildStagesFor('eccentricity').length - 1}`);

  // ADR-210 — the tangent method now ENDS on its curve. Nine stages at the default seven
  // divisions, the last of them the envelope, and the focus and directrix on it rather than on a
  // tenth. This is the assertion that fails if the tangent stage is ever put back.
  ok('the tangent method ends on the stage that draws its curve',
    curveStage('parabola-tangent') === buildStagesFor('parabola-tangent').length - 1
      && buildStagesFor('parabola-tangent').length === 9,
    `curve at ${curveStage('parabola-tangent')} of ${buildStagesFor('parabola-tangent').length - 1}`);
}

// ---- 4t. A construction OPENS on its given data, never on its answer (ADR-195) ------------
// Step 5 used to open on the finished figure, which put the answer on the paper before the
// question. Every construction now opens on the drawing a learner would have in front of them
// before the first step — and what counts as 'given' differs by method, so it is checked per
// method rather than assumed to be stage 0.
{
  const staged = [...METHODS.map((x) => x.id), 'eccentricity'].filter((id) => buildStagesFor(id));
  let withCurve = []; let outOfRange = []; let empty = [];
  for (const id of staged) {
    const m = METHODS.find((x) => x.id === id);
    const dims = m ? { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) } : {};
    const base = { ...defaultConicState(), method: id, ...dims, showTangent: false };
    const stages = buildStagesFor(id, base);
    const setup = setupStageFor(id);
    if (setup < 0 || setup > stages.length - 2) { outOfRange.push(`${id}:${setup}`); continue; }

    const mode = id === 'eccentricity' ? 'eccentricity' : 'methods';
    const at = (st) => layoutFor(mode, { ...base, buildStage: st });

    // THE point: no finished curve on the paper when the construction is first shown.
    if (at(setup).items.some((i) => i.role === 'outline')) withCurve.push(id);
    // …and it is not a blank sheet either — the given data has to BE something to build on.
    // Two pieces of linework is the bar: the parallelogram methods open on an axis and the
    // frame boxing it, and that is a complete set of givens, not a thin one.
    if (at(setup).items.filter((i) => i.k !== 'label').length < 2) empty.push(id);
  }
  ok('no construction opens with its curve already drawn', withCurve.length === 0, withCurve.join(','));
  ok('…and none opens on a blank sheet either', empty.length === 0, empty.join(','));
  ok('…and every setup stage is a real stage of its own list, short of the last',
    outOfRange.length === 0, outOfRange.join(','));

  // The setup stage must be the LAST stage that is purely given data: one more press has to
  // add something. Otherwise the opening view has quietly eaten a construction step.
  let stalls = [];
  for (const id of staged) {
    const m = METHODS.find((x) => x.id === id);
    const dims = m ? { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) } : {};
    const base = { ...defaultConicState(), method: id, ...dims, showTangent: false };
    const mode = id === 'eccentricity' ? 'eccentricity' : 'methods';
    const drawn = (st) => layoutFor(mode, { ...base, buildStage: st }).items.length;
    if (drawn(setupStageFor(id) + 1) <= drawn(setupStageFor(id))) stalls.push(id);
  }
  ok('…and the first press after it always puts something new on the paper',
    stalls.length === 0, stalls.join(','));

  // Three of the openings the review named, checked against what is actually on the sheet.
  const opening = (id, extra = {}) => {
    const m = METHODS.find((x) => x.id === id);
    const dims = m ? { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) } : {};
    return layoutFor(id === 'eccentricity' ? 'eccentricity' : 'methods',
      { ...defaultConicState(), method: id, ...dims, showTangent: false,
        buildStage: setupStageFor(id), ...extra });
  };
  // Concentric: axes and centre, and NOT the auxiliary circles — they are the construction.
  ok('the concentric method opens without its auxiliary circles',
    opening('ellipse-concentric').items.every((i) => i.k !== 'circle'));
  // Oblong: the rectangle IS the given frame, so it is there; the numbering is not.
  ok('the oblong method opens with its rectangle',
    opening('ellipse-oblong').items.some((i) => i.k === 'poly' && i.role === 'construction'));
  ok('…and without its numbered divisions',
    !opening('ellipse-oblong').items.some((i) => i.k === 'label' && /^\d+['′]?$/.test(i.text)));
  // Tangent: its givens are the double ordinate and the abscissa. E and the two tangents are the
  // first things it DOES, so neither is on the paper before the animation starts (ADR-196). A
  // triangle reads as a frame, which is exactly why opening on one looked wrong to a draughtsman.
  ok('the tangent method opens with neither of its tangents drawn',
    opening('parabola-tangent').items.filter((i) => i.k === 'line' && i.role === 'construction').length === 0);
  ok('…nor the point E they are drawn from',
    !opening('parabola-tangent').items.some((i) => i.k === 'label' && i.text === 'E'));
  ok('…but with the base and the axis it is given',
    opening('parabola-tangent').items.filter((i) => i.k === 'line'
      && (i.role === 'mark' || i.role === 'axis')).length === 2);
}
// ---- 4s. A sheet that NAMES its section says so, so a quiz can withhold it (ADR-194) ------
// Three of §6.1's six cuts are not plane conics and their sheets say what they are in words.
// That is right in the taught half and wrong in Step 6, where naming the section IS the
// question. The captions that name one are marked, so `drawSheet`'s `anonymous` option can
// drop exactly those and keep everything measured.
{
  const base = defaultConicState();
  const named = (mode, state) => layoutFor(mode, { ...base, ...state })
    .items.filter((i) => i.k === 'label' && i.naming).map((i) => i.text);
  const all = (mode, state) => layoutFor(mode, { ...base, ...state })
    .items.filter((i) => i.k === 'label').map((i) => i.text);

  ok('the circle sheet marks the caption that names it',
    named('circle', { cutA: 30 }).length === 1 && /Circle/.test(named('circle', { cutA: 30 })[0]),
    named('circle', { cutA: 30 }).join(' | '));
  ok('…and leaves what it MEASURES unmarked',
    all('circle', { cutA: 30 }).some((t) => /^Radius/.test(t))
    && !named('circle', { cutA: 30 }).some((t) => /^Radius/.test(t)));
  ok('the apex-cut sheet marks its name too',
    named('triangle', { cutA: 60, cutB: 80 }).length === 1,
    named('triangle', { cutA: 60, cutB: 80 }).join(' | '));
  ok('…and the degenerate single point says so under the same mark',
    named('triangle', { cutA: 0, cutB: 80 }).length === 1,
    named('triangle', { cutA: 0, cutB: 80 }).join(' | '));

  // The plain-conic sheets name nothing to begin with — that is why Step 6 can show them.
  for (const mode of ['locus', 'methods', 'eccentricity']) {
    ok(`the ${mode} sheet has nothing to withhold`, named(mode, {}).length === 0,
      named(mode, {}).join(' | '));
  }

  // Step 6 draws the cut but must not write it into the sheet's state, so the derivation and
  // the commit have to be separable. Asserted on the source, since the split is what the step
  // depends on and a merge back would be silent.
  const mainSrc = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  ok('the cut derivation is separable from the commit',
    /function cutDerivedSheet\(/.test(mainSrc) && /function commitDerivedSheet\(/.test(mainSrc));
  ok('…and Step 6 paints from the derived state, never the stored one',
    /function sheetSourceState\(\)[\s\S]{0,400}stage !== 6[\s\S]{0,300}cutDerivedSheet/.test(mainSrc));
  ok('…and only Step 5 paints the construction',
    /if \(stage === 5\) return state\.method === ECCENTRICITY_METHOD/.test(mainSrc));
}
// ---- 4r. Drafting legibility: what is set heavy, and what is not (ADR-193) ----------------
// The numbering a construction is built on and the letters that name its points are the two
// things a learner hunts for on a dense sheet, so both are set heavier than the rest. The
// classification is inferred from the caption, so it is checked against the captions the
// layouts ACTUALLY emit rather than against a list of examples.
{
  for (const [text, want] of [['1', 'division'], ['12', 'division'], ["3'", 'division'],
    ['A', 'point'], ['V', 'point'], ["F'", 'point'], ['V₁', 'point'],
    ['Focus, F', null], ['Base 100', null], ['Double ordinate (base) 120', null],
    ['Tangent', null], ['Asymptote', null]]) {
    ok(`"${text}" is set as ${want ?? 'ordinary text'}`, labelWeight(text) === want,
      String(labelWeight(text)));
  }

  // Every construction's numbering must classify as numbering — if a layout numbered its
  // divisions some other way, this is where that would show.
  let unweighted = [];
  for (const m of METHODS) {
    const dims = { dim1: m.dim1.value, dim2: m.dim2.value, ...(m.dim3 ? { dim3: m.dim3.value } : {}) };
    for (let st = 0; st < 8; st++) {
      const L = layoutFor('methods', { ...defaultConicState(), method: m.id, ...dims, buildStage: st });
      for (const it of L.items) {
        if (it.k !== 'label') continue;
        if (/^\d+['′]?$/.test(it.text) && (it.emphasis ?? labelWeight(it.text)) !== 'division') {
          unweighted.push(`${m.id}:${it.text}`);
        }
      }
    }
  }
  ok('every division number on every construction is set as numbering',
    unweighted.length === 0, unweighted.slice(0, 6).join(','));

  // A caption is drawn on the PAPER colour so it stays legible where it must cross linework.
  // The renderer only does that when the caller supplies the token, so the caller must.
  const mainSrc = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  ok('the sheet renderer is given the paper colour to clear behind captions',
    /paper:\s*cssVar\('--color-paper'\)/.test(mainSrc));
}
// ---- 4q. §6.9's constructions are out of scope, and only they are (ADR-192) --------------
// The hyperbola is still one of §6.1's six cuts and still drawn from the focus-and-directrix
// definition whenever the plane makes one. What left the module is "how to construct one".
{
  const gone = ['hyperbola-foci', 'hyperbola-ordinate', 'hyperbola-asymptotes'];
  ok('no hyperbola construction is left in the catalogue',
    METHODS.every((m) => m.curve !== 'Hyperbola'), METHODS.map((m) => m.id).join(','));
  ok('…nor a methodology card for one', gone.every((id) => methodInfo(id) === null));
  ok('…nor a stage list', gone.every((id) => buildStagesFor(id) === null));
  ok('…and the two curves the module DOES construct are untouched',
    METHODS.filter((m) => m.curve === 'Ellipse').length === 5
    && METHODS.filter((m) => m.curve === 'Parabola').length === 4,
    `${METHODS.length} constructions`);

  // The syllabus tier is unchanged for both, and the hyperbola still offers the general method
  // — it arrives here from Steps 1–4 whenever the cut makes one.
  ok('the ellipse still opens on the concentric-circle method',
    defaultMethodFor('Ellipse') === 'ellipse-concentric');
  ok('the parabola still opens on the tangent method',
    defaultMethodFor('Parabola') === 'parabola-tangent');
  ok('a hyperbola arriving from the cut can still be drawn',
    methodsByTier('Hyperbola').additional.some((m) => m.id === 'eccentricity'));
  const hypSheet = layoutFor('eccentricity', { ...defaultConicState(), curve: 'Hyperbola', e: 1.6 });
  const hypCurve = hypSheet.items.filter((i) => i.role === 'outline');
  ok('…and its sheet still draws a curve',
    hypCurve.length > 0 && hypCurve.every((i) => (i.pts?.length ?? 0) > 50),
    `${hypCurve.length} outline piece(s), ${hypCurve[0]?.pts?.length ?? 0} points`);
}

// ---- 4o. The tangent method: its own divisions, chords in two halves (ADR-190) -----------
{
  const m = METHODS.find((x) => x.id === 'parabola-tangent');
  ok('the tangent method names both terms for each given',
    /double ordinate \/ base/i.test(m.dim1.label) && /abscissa \/ axis/i.test(m.dim2.label),
    `${m.dim1.label} | ${m.dim2.label}`);
  ok('…and carries its own division count, defaulting to 7',
    /equal divisions/i.test(m.dim3.label) && m.dim3.value === 7, JSON.stringify(m.dim3));

  const at = (buildStage, divisions = 7) => layoutFor('methods',
    { ...defaultConicState(), method: 'parabola-tangent', dim1: 120, dim2: 90,
      dim3: divisions, buildStage, showTangent: false });
  const chords = (L) => L.items.filter((i) => i.k === 'line' && i.role === 'construction').length - 2;

  // The chords are paced the same way every construction in this topic is (ADR-193): the first
  // half one per press, the second half whole. The stage list is a FUNCTION of the division
  // count, so this is checked across the slider's whole range rather than at one setting.
  const stagesAt = (d) => buildStagesFor('parabola-tangent', { ...defaultConicState(), dim3: d });
  let paced = true; let sized = true; let envelopeOk = true; let worstD = null;
  for (let d = 4; d <= 12; d++) {
    const half = tangentFirstHalf(d);
    const total = d - 1;
    // 4 set-up + `half` chord stages + 1 mirror + 1 envelope. NOT a further stage for the focus
    // and directrix: they arrive with the curve, and the tangent belongs to its toggle (ADR-210).
    if (stagesAt(d).length !== 4 + half + 2) { sized = false; worstD ??= d; }

    // One chord per press through the first half, then the rest together.
    for (let i = 1; i <= half; i++) {
      if (chords(at(4 + i - 1, d)) !== i) { paced = false; worstD ??= d; }
    }
    if (chords(at(4 + half, d)) !== total) { paced = false; worstD ??= d; }

    // The envelope is held back until every chord is down, and arrives on its own stage.
    const env = 4 + half + 1;
    if (at(env - 1, d).items.some((i) => i.role === 'outline')
      || !at(env, d).items.some((i) => i.role === 'outline')) { envelopeOk = false; worstD ??= d; }
  }
  ok('the chords arrive one per press through the first half', paced,
    worstD === null ? '4–12 divisions' : `wrong at ${worstD} divisions`);
  ok('…and the second half completes in a single step', paced);
  ok('…with the envelope held back until they are all drawn', envelopeOk);

  // The narration is generated in conicData.js and the drawing is gated in conicEngine.js.
  // Neither may import the other (both are pure leaves), so the agreement between them is the
  // thing to prove — and proving it against what is DRAWN is stronger than a shared symbol.
  ok('the stage list is exactly as long as the drawing needs, at every division count', sized,
    worstD === null ? `7 divisions gives ${stagesAt(7).length} stages` : `wrong at ${worstD}`);
  ok('…and every one of those stages is captioned',
    stagesAt(7).every((x) => x.label && x.say && x.say.length > 20));

  // The divisions slider rebuilds the construction: more divisions, more chords, same curve.
  for (const [d, want] of [[4, 3], [7, 6], [12, 11]]) {
    const last = stagesAt(d).length - 1;
    ok(`${d} divisions give ${want} chords`, chords(at(last, d)) === want, `${chords(at(last, d))}`);
  }
  // Geometry is untouched by the division count — the parabola is the same either way.
  const curveOf = (d) => at(stagesAt(d).length - 1, d).curvePts;
  const a4 = curveOf(4); const a12 = curveOf(12);
  let drift = 0;
  for (let i = 0; i < a4.length; i++) {
    drift = Math.max(drift, Math.hypot(a4[i].x - a12[i].x, a4[i].y - a12[i].y));
  }
  ok('…and the parabola itself is identical whatever the division count',
    drift < 1e-9, `worst drift ${drift.toExponential(2)}`);

  // `dim3` is ONE field shared by every construction that takes a third given, and it holds 70
  // by default — the parallelogram method's included angle. Unclamped, a sheet built straight
  // from the default state drew a sixty-nine-chord tangent construction (ADR-193).
  // ADR-210 — the tangent belongs to its toggle, not to a stage. Walk the WHOLE stage list with
  // the toggle off: no stage may put a tangent or a normal on the paper. With it on, they appear
  // once the curve does, and not before — there is nothing to touch until the envelope is drawn.
  const tangentDrawn = (L) => L.items.some((i) => i.k === 'label' && /^(Tangent, TT|Normal, NN)$/.test(i.text));
  const withTangent = (buildStage) => layoutFor('methods',
    { ...defaultConicState(), method: 'parabola-tangent', dim1: 120, dim2: 90, dim3: 7,
      buildStage, showTangent: true });
  const lastStage = stagesAt(7).length - 1;
  let leaked = [];
  for (let s = 0; s <= lastStage; s++) if (tangentDrawn(at(s))) leaked.push(s);
  ok('no stage of the tangent method draws the tangent while its toggle is off',
    leaked.length === 0, leaked.join(',') || `${lastStage + 1} stages walked`);
  ok('…and with the toggle on it arrives with the curve, never a step later',
    tangentDrawn(withTangent(lastStage)) && !tangentDrawn(withTangent(lastStage - 1)));

  // …and what the last stage DOES add, besides the curve, is what Example 6.8 asks to be located.
  const marks = (L) => L.items.filter((i) => i.k === 'label' && /^(Focus, F|Directrix, DD)$/.test(i.text)).length;
  ok('the focus and the directrix arrive on the same stage as the envelope',
    marks(at(lastStage)) === 2 && marks(at(lastStage - 1)) === 0,
    `${marks(at(lastStage))} at ${lastStage}, ${marks(at(lastStage - 1))} before it`);

  // ADR-211 — the envelope is traced CLOCKWISE, the way a hand moves through this curve. The
  // sheet is y-DOWN, so the drawn path has to start at the FOOT of the double ordinate (+y),
  // round the vertex, and finish at its head (−y). Checked as a signed area sweep about the
  // figure's own centroid rather than on two endpoints, so a reversed middle cannot slip past.
  const traced = at(lastStage).curvePts;
  const cx = traced.reduce((s, p) => s + p.x, 0) / traced.length;
  const cy = traced.reduce((s, p) => s + p.y, 0) / traced.length;
  let sweep = 0;
  for (let i = 1; i < traced.length; i++) {
    const a = { x: traced[i - 1].x - cx, y: traced[i - 1].y - cy };
    const b = { x: traced[i].x - cx, y: traced[i].y - cy };
    sweep += Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y);
  }
  // In a y-down space a POSITIVE cross product turns clockwise on screen.
  ok('the parabola is traced clockwise, from A round the vertex to B',
    sweep > 0 && traced[0].y > 0 && traced[traced.length - 1].y < 0,
    `sweep ${(sweep * 180 / Math.PI).toFixed(0)}°, y ${traced[0].y.toFixed(1)} → ${traced[traced.length - 1].y.toFixed(1)}`);

  // ADR-215 — A is the FOOT of the double ordinate and B its head. Read off the COORDINATES the
  // layout carries, not off the captions: a swap done in the labelling alone would leave the
  // tangent AE, its divisions and the chords hanging off the wrong ends, and would still pass a
  // check that only looked at which letter is drawn where. The sheet is y-DOWN, so the foot is +y.
  const named = (L, t) => L.items.find((i) => i.k === 'label' && i.text === t)?.p;
  const finished = at(lastStage);
  const pA = named(finished, 'A'); const pB = named(finished, 'B');
  ok('A is the foot of the double ordinate and B its head',
    pA && pB && pA.y > 0 && pB.y < 0 && Math.abs(pA.y + pB.y) < 1e-12 && pA.x === pB.x,
    `A ${pA?.y.toFixed(1)}, B ${pB?.y.toFixed(1)}`);
  // …and the trace begins ON A and ends ON B, so "drawn from A to B" is the drawing and not a
  // description of it.
  ok('…and the envelope starts at A and finishes at B',
    Math.abs(traced[0].y - pA.y) < 1e-9 && Math.abs(traced[traced.length - 1].y - pB.y) < 1e-9
      && Math.abs(traced[0].x - pA.x) < 1e-9,
    `${traced[0].y.toFixed(1)} → ${traced[traced.length - 1].y.toFixed(1)}`);
  // The tangents are the swapped ones too: AE runs to the LOWER half of the paper, BE the upper.
  const through = (L, p) => L.items.some((i) => i.k === 'line' && i.role === 'construction'
    && ((Math.abs(i.a.x - p.x) < 1e-9 && Math.abs(i.a.y - p.y) < 1e-9)
      || (Math.abs(i.b.x - p.x) < 1e-9 && Math.abs(i.b.y - p.y) < 1e-9)));
  ok('…and both tangents are struck from the swapped points, not from the old ones',
    through(finished, pA) && through(finished, pB));
  // Reversing the ORDER is all that changed: the same points, so the same envelope.
  ok('…and reversing it changed the order and nothing else',
    traced.every((p) => Math.abs((p.y * p.y) / (4 * ((120 * 120) / (16 * 90))) - p.x) < 1e-9));

  // ADR-214 — the FRAME is pinned to the finished figure, so the sheet's scale cannot change
  // between stages. The sheet locks its millimetre scale to this bbox (ADR-053), and the last
  // stage draws the one thing that reaches past A and B: the directrix, at ±0.6·AB against their
  // ±0.5. Measured on the shipped page, the drawing held a 729 × 431 px ink box through stages
  // 1–8 and jumped to 729 × 530 on stage 9 — the visual jump the review reported, arriving at
  // exactly the moment the freehand curve begins. Checked across the whole slider range, and with
  // the tangent toggle on at both ends of P, since that apparatus reaches further still.
  const frameKey = (L) => [L.bbox.minX, L.bbox.maxX, L.bbox.minY, L.bbox.maxY]
    .map((v) => v.toFixed(6)).join('|');
  let frameDrift = [];
  for (let d = 4; d <= 12; d++) {
    const total = stagesAt(d).length;
    const seen = new Set();
    for (let s = 0; s < total; s++) seen.add(frameKey(at(s, d)));
    if (seen.size !== 1) frameDrift.push(`dim3 ${d}: ${seen.size} frames`);
  }
  ok('the tangent method draws every stage inside one fixed frame',
    frameDrift.length === 0, frameDrift.join(' · ') || 'divisions 4–12 walked');

  const withP = (buildStage, pointT) => layoutFor('methods',
    { ...defaultConicState(), method: 'parabola-tangent', dim1: 120, dim2: 90, dim3: 7,
      buildStage, showTangent: true, pointT });
  // …and holds it with the tangent shown too — for a FIXED P. P itself may move the frame, and
  // deliberately does: reserving the tangent at both ends of the curve instead would widen the
  // frame to 258 × 187 mm and drop the drawing to 1.1 px/mm in a 1124 × 565 pane, under the
  // 1.3 px/mm gate below which every caption is dropped. Stages must not move the frame; a slider
  // the learner is dragging is allowed to (ADR-214).
  let tangentDrift = [];
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const seen = new Set();
    for (let s = 0; s <= lastStage; s++) seen.add(frameKey(withP(s, t)));
    if (seen.size !== 1) tangentDrift.push(`P ${t}: ${seen.size} frames`);
  }
  ok('…and holds it with the tangent shown, at every position of P',
    tangentDrift.length === 0, tangentDrift.join(' · ') || '5 positions walked');
  // Not vacuous: the toggle DOES enlarge the frame, so these are genuinely different drawings
  // being held still — the checks above are not passing because nothing ever moves.
  ok('…which is a pinned frame, not an unchanging one',
    frameKey(at(lastStage)) !== frameKey(withP(lastStage, 0)));

  ok('a stale dim3 cannot run the construction past its own slider',
    chords(at(99, 70)) === chords(at(99, 12)), `${chords(at(99, 70))} vs ${chords(at(99, 12))}`);
  // Only the constructions that READ the shared points slider may offer it.
  // The general construction is drawn by its OWN mode, not by the methods layout.
  const reads = (id) => {
    const mode = id === 'eccentricity' ? 'eccentricity' : 'methods';
    const L = (pts) => layoutFor(mode,
      { ...defaultConicState(), method: id, points: pts }).items.length;
    return L(3) !== L(7);
  };
  let mismatch = [];
  for (const id of [...METHODS.map((x) => x.id), 'eccentricity']) {
    if (controlsFor(id).points !== reads(id)) mismatch.push(id);
  }
  ok('the points slider is offered exactly where it changes the drawing',
    mismatch.length === 0, mismatch.join(','));
}

// ---- 4m. The oblong method: each half by hand, its reflection whole (ADR-188/112/116) ---
{
  const A2 = 120; const B2 = 80;
  const at = (buildStage) => layoutFor('methods',
    { ...defaultConicState(), method: 'ellipse-oblong', dim1: A2, dim2: B2, buildStage, showTangent: false });
  const lines = (L, role) => L.items.filter((i) => i.k === 'line' && i.role === role);
  const plots = (L) => L.items.filter((i) => i.k === 'dot' && i.role === 'plot');
  const texts = (L, re) => L.items.filter((i) => i.k === 'label' && re.test(i.text));
  const same = (p, q) => Math.abs(p.x - q.x) < 1e-9 && Math.abs(p.y - q.y) < 1e-9;
  const key = (l) => `${l.a.x},${l.a.y},${l.b.x},${l.b.y}`;

  // The stage plan (ADR-193): 0–2 set the figure up; 3–5 draw the rays from C, one numbered
  // point per press, on the UPPER sides of both halves; 6 mirrors that fan down about the major
  // axis; 7–9 draw the connections of the LEFT half, one numbered point per press; 10 mirrors
  // the right half about the minor axis; 11 joins the curve.
  const FAN_FROM = 3; const FAN_MIRROR = 6;
  const JOIN_FROM = 7; const MIRROR = 10; const CURVE = 11;
  ok('the oblong construction is walked in twelve stages',
    buildStagesFor('ellipse-oblong').length === 12, `${buildStagesFor('ellipse-oblong').length}`);

  // PART A — the fan from C arrives one numbered point at a time, upper sides only.
  let fanPaced = true; let fanUpperOnly = true;
  for (let st = FAN_FROM; st < FAN_MIRROR; st++) {
    const prev = new Set(lines(at(st - 1), 'construction').map(key));
    const fresh = lines(at(st), 'construction').filter((l) => !prev.has(key(l)));
    // One numbered point, both sides of the figure: two rays from C.
    if (fresh.length !== 2) fanPaced = false;
    // Every one of them starts at C (the TOP of the minor axis) and ends above the axis.
    for (const l of fresh) {
      if (Math.abs(l.a.x) > 1e-9 || l.a.y > 0 || l.b.y > 0) fanUpperOnly = false;
    }
  }
  ok('the rays from C arrive one numbered point per press', fanPaced);
  ok('…and only the UPPER fan is walked by hand', fanUpperOnly);

  // …then the whole lower half is mirrored on in ONE step, and it is an exact reflection.
  const beforeFan = at(FAN_MIRROR - 1); const afterFan = at(FAN_MIRROR);
  const fanAdded = lines(afterFan, 'construction').length - lines(beforeFan, 'construction').length;
  ok('the lower half of the fan arrives in a single step', fanAdded === 2 * (4 - 1),
    `${fanAdded} rays`);
  const upper = lines(beforeFan, 'construction');
  const all = lines(afterFan, 'construction');
  let fanMirrorOff = 0;
  for (const l of upper) {
    const hit = all.some((m) => same({ x: l.a.x, y: -l.a.y }, m.a) && same({ x: l.b.x, y: -l.b.y }, m.b));
    if (!hit) fanMirrorOff++;
  }
  ok('…and every mirrored ray is the exact reflection of one already drawn',
    fanMirrorOff === 0, `${fanMirrorOff}`);

  // PART B — the connections of the LEFT half, one numbered point per press. Each press draws
  // both connections through that point (above the axis and below) and marks both crossings.
  let joinPaced = true; let joinLeftOnly = true; let dotsGrew = true; let worstJoin = null;
  for (let st = JOIN_FROM; st < MIRROR; st++) {
    const prevSolid = new Set(lines(at(st - 1), 'construction').map(key));
    const fresh = lines(at(st), 'construction').filter((l) => !prevSolid.has(key(l)));
    const dashAdded = lines(at(st), 'projection').length - lines(at(st - 1), 'projection').length;
    if (fresh.length !== 2 || dashAdded !== 2) { joinPaced = false; worstJoin ??= st; }
    if (plots(at(st)).length !== plots(at(st - 1)).length + 2) dotsGrew = false;
    for (const l of lines(at(st), 'projection')) if (l.b.x > 1e-9) joinLeftOnly = false;
  }
  ok('the connecting lines arrive one numbered point per press', joinPaced,
    worstJoin === null ? '3 presses, one point each' : `stage ${worstJoin}`);
  ok('…and only the left half is walked by hand', joinLeftOnly);
  ok('…with both crossings of that point marked as it lands', dotsGrew,
    `${plots(at(MIRROR - 1)).length} points after the left half`);

  // The right half arrives in ONE step, and is the exact mirror of the left.
  const beforeMirror = at(MIRROR - 1); const afterMirror = at(MIRROR);
  const addedSolid = lines(afterMirror, 'construction').length - lines(beforeMirror, 'construction').length;
  const addedDash = lines(afterMirror, 'projection').length - lines(beforeMirror, 'projection').length;
  ok('the other half arrives in a single step', addedSolid === 6 && addedDash === 6,
    `${addedSolid} solid, ${addedDash} dashed`);
  const leftDash = lines(beforeMirror, 'projection');
  const allDash = lines(afterMirror, 'projection');
  let mirrorOff = 0;
  for (const l of leftDash) {
    const hit = allDash.some((m) => same({ x: -l.a.x, y: l.a.y }, m.a) && same({ x: -l.b.x, y: l.b.y }, m.b));
    if (!hit) mirrorOff++;
  }
  ok('…and it is the exact mirror of the half already drawn', mirrorOff === 0, `${mirrorOff}`);
  // CHANGE 1 — solid to the centre line, dashed beyond it, and the break exactly ON the axis.
  let badBreak = 0; let notDashed = 0; let overrun = 0;
  const crossings = plots(at(MIRROR)).map((d) => d.p);
  for (const l of lines(at(MIRROR), 'construction')) {
    const fromCD = Math.abs(l.a.x) < 1e-9 && Math.abs(Math.abs(l.a.y) - B2 / 2) < 1e-9;
    if (!fromCD) continue;
    const endsOnSide = Math.abs(Math.abs(l.b.x) - A2 / 2) < 1e-6;   // a fan line, not a ray
    if (endsOnSide) continue;
    if (Math.abs(l.b.y) > 1e-9) badBreak++;                          // a ray must stop AT y = 0
  }
  ok('every ray runs solid only as far as the centre line', badBreak === 0, `${badBreak} past it`);
  for (const l of allDash) {
    if (Math.abs(l.a.y) > 1e-9) badBreak++;                          // …and the dash starts there
    if (!Array.isArray(l.dash) || l.dash.length === 0) notDashed++;
    if (!crossings.some((q) => same(q, l.b))) overrun++;
  }
  ok('…the dashed part starts exactly on it', badBreak === 0);
  ok('…is drawn in the construction dash style', notDashed === 0);
  ok('…and ends exactly on the crossing it makes', overrun === 0, `${overrun}`);

  // Both halves numbered; C and D named.
  const nums = texts(at(2), /^\d+$/).map((i) => i.p);
  const above = nums.filter((p) => p.y < -1e-9).length;
  const below = nums.filter((p) => p.y > 1e-9).length;
  ok('both halves carry the division numbering', above > 0 && above === below,
    `${above} above, ${below} below`);
  ok('…and C and D are named', texts(at(0), /^[CD]$/).length === 2);

  // Geometry unchanged: the same twelve crossings, all on the ellipse.
  ok('the crossings are marked in the plotted-point style', plots(at(MIRROR)).length === 12,
    `${plots(at(MIRROR)).length}`);
  let off = 0;
  for (const q of crossings) {
    if (Math.abs((q.x / (A2 / 2)) ** 2 + (q.y / (B2 / 2)) ** 2 - 1) > 1e-9) off++;
  }
  ok('…and every one of them lies on the ellipse', off === 0, `${off} off the curve`);
  ok('the curve is joined only at the end',
    !at(CURVE - 1).items.some((i) => i.role === 'outline')
    && at(CURVE).items.some((i) => i.role === 'outline'));
  ok('…and the finished drawing is clean of numbering', texts(at(CURVE), /^\d+'?$/).length === 0);
}

// ---- 4l. Concentric circles: BOTH circles numbered, and the crossings named (ADR-178) ----
// The method IS the correspondence between the two circles — outer 4 and inner 4′ produce P4 —
// so a drawing that numbers only the outer circle hides the very thing it exists to show.
{
  const A = 90; const B = 60;                       // major, minor
  const at = (buildStage) => layoutFor('methods',
    { ...defaultConicState(), method: 'ellipse-concentric', dim1: A, dim2: B, buildStage, showTangent: false });
  const texts = (L, re) => L.items.filter((i) => i.k === 'label' && re.test(i.text));

  const divided = at(3);          // "Equal divisions"
  const crossed = at(5);          // "The crossings"
  const finished = at(6);         // "Join the curve"

  ok('the outer circle is numbered 1–12', texts(divided, /^\d+$/).length === 12,
    texts(divided, /^\d+$/).map((i) => i.text).join(','));
  ok('…and the inner circle 1′–12′ to match', texts(divided, /^\d+'$/).length === 12,
    texts(divided, /^\d+'$/).map((i) => i.text).join(','));

  // Correspondence is the claim being made, so it is checked as a claim: k and k′ must sit at
  // the SAME angle about the centre, on their own circles.
  let offAngle = null; let offRadius = null;
  for (let k = 1; k <= 12; k++) {
    const o = texts(divided, new RegExp(`^${k}$`))[0];
    const i2 = texts(divided, new RegExp(`^${k}'$`))[0];
    if (!o || !i2) { offAngle = k; break; }
    const ang = (p) => Math.atan2(p.y, p.x);
    if (Math.abs(Math.atan2(Math.sin(ang(o.p) - ang(i2.p)), Math.cos(ang(o.p) - ang(i2.p)))) > 1e-9) offAngle = k;
    if (Math.abs(Math.hypot(o.p.x, o.p.y) - A / 2) > 1e-9
      || Math.abs(Math.hypot(i2.p.x, i2.p.y) - B / 2) > 1e-9) offRadius = k;
  }
  ok('…each pair k and k′ shares one radius from the centre', offAngle === null, `off at ${offAngle}`);
  ok('…and each sits on its OWN circle', offRadius === null, `off at ${offRadius}`);

  // The crossings are named only once they exist, and each Pk is the crossing of ITS own pair.
  ok('the crossings are not named before they are plotted', texts(at(4), /^P\d+$/).length === 0);
  ok('…and all twelve are named on the stage that plots them',
    texts(crossed, /^P\d+$/).length === 12);
  let wrongP = null;
  for (let k = 1; k <= 12; k++) {
    const t = ((k - 1) / 12) * Math.PI * 2;
    const want = { x: (A / 2) * Math.cos(t), y: (B / 2) * Math.sin(t) };
    const p = texts(crossed, new RegExp(`^P${k}$`))[0];
    if (!p || Math.hypot(p.p.x - want.x, p.p.y - want.y) > 1e-9) wrongP = k;
  }
  ok('…and Pk is the crossing of outer k with inner k′', wrongP === null, `wrong at ${wrongP}`);
  // Every Pk must actually lie on the ellipse — the label would otherwise name a fiction.
  let offCurve = 0;
  for (const p of texts(crossed, /^P\d+$/)) {
    if (Math.abs((p.p.x / (A / 2)) ** 2 + (p.p.y / (B / 2)) ** 2 - 1) > 1e-9) offCurve++;
  }
  ok('…and every named point lies on the ellipse', offCurve === 0, `${offCurve} off`);

  // The finished drawing carries none of the three — a completed figure shows the curve.
  for (const [what, re] of [['division numbers', /^\d+$/], ['primed numbers', /^\d+'$/],
    ['point names', /^P\d+$/]]) {
    ok(`the finished drawing is clean of ${what}`, texts(finished, re).length === 0,
      `${texts(finished, re).length} left`);
  }

  // Captions sit OFF the point they name, or they sit on the linework they are there to explain.
  const tooClose = texts(crossed, /^P\d+$/).filter((i) => Math.hypot(i.dx, i.dy) < 5).length;
  ok('…and each caption is offset clear of its point', tooClose === 0, `${tooClose} too close`);

  // Nothing else was touched: the other twelve constructions must not have grown primed numbers.
  let leaked = null;
  for (const id of ['ellipse-oblong', 'ellipse-arcs', 'parabola-tangent', 'hyperbola-ordinate']) {
    const L = layoutFor('methods', { ...defaultConicState(), method: id, buildStage: 3 });
    if (texts(L, /^P\d+$/).length > 0) leaked = id;
  }
  ok('…and no other construction picked up the new notation', leaked === null, `${leaked}`);
}


// ---- 4k. The focus-directrix construction builds up ONE reference at a time (ADR-176) ----
// The frame used to open with the axis, the directrix and the focus already drawn — the single
// hardest thing for a beginner to read. Each now arrives on its own stage, and every stage's
// wording is checked for the jargon it was rewritten to remove.
{
  const at = (buildStage) => layoutFor('eccentricity',
    { ...defaultConicState(), e: 2 / 3, fa: 50, buildStage, showTangent: false });
  const texts = (L) => L.items.filter((i) => i.k === 'label').map((i) => i.text);

  ok('stage 1 is the axis alone',
    !texts(at(0)).includes('Directrix') && !texts(at(0)).includes('Focus'), texts(at(0)).join(' | '));
  ok('stage 2 adds the fixed line, and still no focus',
    texts(at(1)).includes('Directrix') && !texts(at(1)).includes('Focus'));
  ok('stage 3 adds the fixed point', texts(at(2)).includes('Focus'));
  ok('stage 4 marks where the curve starts', texts(at(3)).includes('V'));
  ok('the curve itself waits until stage 7',
    !at(5).items.some((i) => i.k === 'poly' && i.role === 'outline')
    && at(6).items.some((i) => i.k === 'poly' && i.role === 'outline'));

  // The language: these are first-year students, and the words below were the ones being used.
  const JARGON = /ordinate|locus|auxiliary projection|produce(d)? to|subtend/i;
  const stages = buildStagesFor('eccentricity');
  for (const st of stages) {
    ok(`"${st.label}" is written in plain words`, !JARGON.test(st.say), st.say.slice(0, 46));
  }
  ok('every stage is one or two short sentences',
    stages.every((st) => st.say.split(/[.!?]/).filter((x) => x.trim()).length <= 3
      && st.say.length <= 160));
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
// §6.9's three constructions are gone (ADR-192), and with them the proofs that each of
// their plotted points satisfied its own hyperbola. The hyperbola AS A CURVE is still proved
// below and in section 4a — only the three constructions of it have left the module.

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

// ---- 8. The problem library is inside the syllabus, and pre-solves nothing (ADR-212/129) ---
{
  const dealt = enabledProblems();
  const outside = dealt.filter((p) => !ENABLED_METHODS.includes(p.target.method));
  ok('every problem the library deals is answered with a syllabus construction',
    outside.length === 0, outside.map((p) => `${p.id}:${p.target.method}`).join(',') || `${dealt.length} dealt`);
  // The focus-and-directrix exercises are answered with `e` and `fa` and name no method at all —
  // an absent method must be EXCLUDED, not waved through the filter.
  ok('…and none of them is a focus-and-directrix exercise',
    dealt.every((p) => p.type !== 'eccentricity-method' && !!p.target.method));
  ok('…while the chapter\'s fifteen are all still in the file, verbatim',
    PROBLEMS.filter((p) => /^(ellipse|parabola|hyperbola)-/.test(p.id)).length === 15,
    `${PROBLEMS.length} problems in all`);

  // The four practice questions, checked against the exact wording they were set in.
  const WANTED = [
    ['practice-concentric-100-70', 'ellipse-concentric', 100, 70,
      'Draw an ellipse having a Major Axis of 100mm and Minor Axis of 70mm using concentric circle method.'],
    ['practice-concentric-120-80', 'ellipse-concentric', 120, 80,
      'Draw an ellipse having a Major Axis of 120mm and Minor Axis of 80mm using concentric circle method.'],
    ['practice-oblong-100-70', 'ellipse-oblong', 100, 70,
      'Draw an ellipse by rectangular method, given the major and minor axes as 100mm and 70mm respectively.'],
    ['practice-oblong-120-80', 'ellipse-oblong', 120, 80,
      'Draw an ellipse by rectangular method, given the major and minor axes as 120mm and 80mm respectively.'],
  ];
  for (const [id, method, dim1, dim2, statement] of WANTED) {
    const p = dealt.find((x) => x.id === id);
    ok(`practice problem ${id} is dealt, and maps to its own construction`,
      !!p && p.target.method === method && p.target.dim1 === dim1 && p.target.dim2 === dim2
        && p.statement === statement && p.hints?.length > 0,
      p ? `${p.target.method} ${p.target.dim1}×${p.target.dim2}` : 'missing');
  }

  ok('the library deals seven problems, in two curve groups',
    dealt.length === 7 && groupByTier(dealt).length === 2,
    `${dealt.length} problems, ${groupByTier(dealt).length} groups`);

  // ADR-213 — the construction is selected for the learner, and the dimension sliders land at
  // their FLOOR so that selecting it can never hand over a figure. `ellipse-concentric` is why
  // this is checked rather than assumed: its authored defaults are 120 × 80, which is one of the
  // practice answers exactly, so loading with the method's own defaults would have lit green.
  const SIZE_TOL = 0.5;   // problemLibrary.js's own tolerance
  let preSolved = [];
  for (const p of dealt) {
    const m = methodById(p.target.method);
    const onLoad = { curve: m.curve, method: p.target.method,
      dim1: m.dim1.min, dim2: m.dim2.min, dim3: m.dim3?.min };
    const solved = Object.entries(p.target).every(([k, want]) => (typeof want === 'number'
      ? Math.abs((onLoad[k] ?? NaN) - want) <= SIZE_TOL
      : onLoad[k] === want));
    if (solved) preSolved.push(p.id);
  }
  ok('no problem is already matched by the state it loads into',
    preSolved.length === 0, preSolved.join(',') || `${dealt.length} checked`);
  const defaulted = dealt.filter((p) => {
    const m = methodById(p.target.method);
    return Math.abs(m.dim1.value - p.target.dim1) <= SIZE_TOL
      && Math.abs(m.dim2.value - p.target.dim2) <= SIZE_TOL;
  });
  ok('…and that is not vacuous: at least one WOULD be, on the method\'s own defaults',
    defaulted.length > 0, defaulted.map((p) => p.id).join(',') || 'none');
}

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
