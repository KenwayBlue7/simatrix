// Pure geometry for the spiral engine. NO DOM here — every function returns plain data
// (points, line segments, arc definitions, a sampled polyline for the curve itself).
// renderConstruction.js is the only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// Coordinate system: a fixed 240x190 drawing area (SVG viewBox units), matching Topic 2.1
// — see this topic's DESIGN.md/CLAUDE.md. Every construction computes its own geometry in
// a LOCAL MATH FRAME (pole at the origin, y increases UPWARD like a textbook figure), then
// fitTransform() maps that frame into SVG space once, so every point — curve samples, the
// radius vector, the tangent/normal — scales and centres together (Topic 2.1's own fix for
// the class of bug where a late-added guide line overshoots a bbox computed before it
// existed: everything that will be DRAWN goes into the SAME bbox that derives scale,
// including the tangent/normal reach at its worst case — see buildSpiral() below).
//
// Every step in a recipe carries a `role`:
//   'given'  — the pole and the growth law's stated measurements
//   'move'   — the sweeping radius vector, and the angle-arc auxiliary mark
//   'result' — the traced curve, and the tangent/normal built from it
//
// ----------------------------------------------------------------------------
// THE ENGINE (see this topic's CLAUDE.md for the full reasoning): ONE construction, ONE
// polar function r(theta), a `mode` toggle (Topic 1.2's own pattern — rides state.params,
// not `given[]`) selecting the growth law. Archimedean grows by a fixed amount per radian
// (r' = constant); logarithmic grows by a fixed RATIO per fixed angle step (r' = r times
// a constant) — that difference alone is what makes the logarithmic spiral "equiangular"
// (the tangent holds a CONSTANT angle to the radius vector everywhere, verified
// numerically during this topic's build). Tangent/normal construction is one shared
// routine (`tangentNormalSteps()`) built from the general polar-tangent fact
// tan(alpha) = r / (dr/dtheta), valid for ANY r(theta) — not spiral-specific — so the
// growth law only changes r()/rPrime(), never the tangent/normal logic itself.
// ----------------------------------------------------------------------------

const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;

function angleOf(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function pointAt(center, r, angleRad) {
  return { x: center.x + r * Math.cos(angleRad), y: center.y + r * Math.sin(angleRad) };
}

// ----------------------------------------------------------------------------
// Step builders
// ----------------------------------------------------------------------------

const P = (p, role, label) => ({ kind: 'point', role, p, label });
const L = (a, b, role, label) => ({ kind: 'line', role, a, b, label });
const CIRC = (center, radius, role) => ({ kind: 'circle', role, center, radius });
const CURVE = (points, role) => ({ kind: 'curve', role, points });
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });

/** [start,end] such that end-start is the MINOR (<= pi) sweep from angle a to angle b —
 *  the same minor-arc normalisation this track has used since Topic 1.2, so the angle
 *  indicator between the radius vector and the tangent always draws the small wedge, not
 *  the long way around. */
function minorArcAngles(a, b) {
  let diff = (((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  return diff >= 0 ? [a, a + diff] : [a + diff, a];
}

// ----------------------------------------------------------------------------
// The spiral engine
// ----------------------------------------------------------------------------

/** @typedef {{mode:'archimedean', rMin:number, rMax:number}|{mode:'logarithmic', rMax:number, ratio:number, stepAngleRad:number}} SpiralCfg */

const THETA_MAX = 2 * Math.PI; // one convolution — both worked examples in the source
                                 // chapter are one convolution; not exposed as a param.

function rOf(theta, cfg) {
  if (cfg.mode === 'archimedean') {
    const k = (cfg.rMax - cfg.rMin) / THETA_MAX;
    return cfg.rMin + k * theta;
  }
  // logarithmic — rMax is defined as the radius reached at theta = THETA_MAX (one full
  // convolution), so r(theta) = rMax * ratio^((theta - THETA_MAX) / stepAngle); this is
  // algebraically the same r = a*e^(b*theta) form every calculus text gives the
  // logarithmic/equiangular spiral, just anchored at the OUTER radius instead of the
  // (unstated) inner one, matching how the worked example states "greatest radius."
  return cfg.rMax * Math.pow(cfg.ratio, (theta - THETA_MAX) / cfg.stepAngleRad);
}

function rPrimeOf(theta, cfg) {
  if (cfg.mode === 'archimedean') return (cfg.rMax - cfg.rMin) / THETA_MAX;
  return rOf(theta, cfg) * Math.log(cfg.ratio) / cfg.stepAngleRad;
}

function spiralPoint(theta, cfg) {
  const r = rOf(theta, cfg);
  return { x: r * Math.cos(theta), y: r * Math.sin(theta) };
}

/** Exact closed-form velocity dM/dtheta — used for the tangent direction. No numeric
 *  differentiation needed: both growth laws have an exact r'(theta) above. */
function spiralVelocity(theta, cfg) {
  const r = rOf(theta, cfg);
  const rp = rPrimeOf(theta, cfg);
  return { x: rp * Math.cos(theta) - r * Math.sin(theta), y: rp * Math.sin(theta) + r * Math.cos(theta) };
}

/** The angle (radians, unsigned) between the radius vector and the tangent at `theta` —
 *  tan(alpha) = r/(dr/dtheta), read off directly from the exact velocity vector instead
 *  of computing the ratio (avoids a separate division-by-zero case when dr/dtheta is 0,
 *  which never happens here but costs nothing to sidestep). Constant across theta for the
 *  logarithmic law — that constancy is the "equiangular" property, and is asserted, not
 *  assumed: this topic's build-time verification checks it numerically. */
function alphaAt(theta, cfg) {
  const vel = spiralVelocity(theta, cfg);
  const tangentAngle = Math.atan2(vel.y, vel.x);
  let diff = tangentAngle - theta;
  diff = ((diff % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

function sampleSpiral(cfg, thetaMax, n = 160) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(spiralPoint((thetaMax * i) / n, cfg));
  return pts;
}

function sampleCircle(center, radius, n = 32) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pointAt(center, radius, (2 * Math.PI * i) / n));
  return pts;
}

// ----------------------------------------------------------------------------
// Coordinate fitting — identical shape to Topic 2.1's fitTransform()
// ----------------------------------------------------------------------------

function boundsOfPoints(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

const PAD = 16;

function fitTransform(bbox, budget, cap = 1.3) {
  const bw = Math.max(budget.w - PAD * 2, 1);
  const bh = Math.max(budget.h - PAD * 2, 1);
  const spanX = Math.max(bbox.maxX - bbox.minX, 1e-6);
  const spanY = Math.max(bbox.maxY - bbox.minY, 1e-6);
  const scale = Math.min(cap, bw / spanX, bh / spanY);
  const drawnW = spanX * scale;
  const drawnH = spanY * scale;
  const originX = budget.x + PAD + (bw - drawnW) / 2 - bbox.minX * scale;
  const originY = budget.y + PAD + (bh - drawnH) / 2 + bbox.maxY * scale;
  return { toSvg: (p) => ({ x: originX + p.x * scale, y: originY - p.y * scale }), scale };
}

const SPIRAL_BUDGET = { x: 10, y: 16, w: 220, h: 150 };

// ----------------------------------------------------------------------------
// The one construction
// ----------------------------------------------------------------------------

/** @typedef {{key:string,label:string,unit:string,min:number,max:number,step:number,default:number,modes?:string[]}} ParamSpec */

const THETA_PARAM = { key: 'theta', label: 'Roll angle', unit: '°', min: 0, max: 360, step: 5, default: 360 };

function buildSpiral(params) {
  const mode = params.mode === 'logarithmic' ? 'logarithmic' : 'archimedean';
  const clampedDeg = Math.max(0, Math.min(360, params.theta ?? 360));

  /** @type {SpiralCfg} */
  let cfg;
  let invalidReason = null;
  if (mode === 'archimedean') {
    const rMin = params.rMin ?? 20, rMax = params.rMax ?? 80;
    if (rMax <= rMin) invalidReason = 'archimedean-radii';
    cfg = { mode, rMin, rMax };
  } else {
    const rMax = params.logRMax ?? 108, ratio = params.ratio ?? 1.2, stepAngleRad = deg2rad(params.stepAngle ?? 30);
    if (ratio <= 1) invalidReason = 'logarithmic-ratio';
    cfg = { mode, rMax, ratio, stepAngleRad };
  }
  if (invalidReason) {
    return { steps: [], resultText: 'Adjust the values so the spiral genuinely grows outward.', invalid: invalidReason };
  }

  const fullPts = sampleSpiral(cfg, THETA_MAX, 160);
  // Safety points for the bbox that DERIVES scale — everything that will ever be drawn at
  // theta up to THETA_MAX must be included here, not bolted on after scale is known
  // (Topic 2.1's own fix for this exact bug class). The tangent/normal reach is worst-case
  // at theta = THETA_MAX, since r() is monotonic increasing for both growth laws (guarded
  // above: archimedean needs rMax > rMin, logarithmic needs ratio > 1).
  const worstM = spiralPoint(THETA_MAX, cfg);
  const worstReach = Math.max(15, rOf(THETA_MAX, cfg) * 0.28);
  const worstVel = spiralVelocity(THETA_MAX, cfg);
  const worstTangentAngle = Math.atan2(worstVel.y, worstVel.x);
  const worstNormalAngle = worstTangentAngle + Math.PI / 2;
  const safetyPts = [
    { x: 0, y: 0 },
    ...sampleCircle({ x: 0, y: 0 }, rOf(THETA_MAX, cfg), 24),
    pointAt(worstM, worstReach, worstTangentAngle), pointAt(worstM, worstReach, worstTangentAngle + Math.PI),
    pointAt(worstM, worstReach, worstNormalAngle), pointAt(worstM, worstReach, worstNormalAngle + Math.PI),
  ];
  const bbox = boundsOfPoints([...fullPts, ...safetyPts]);
  const { toSvg, scale } = fitTransform(bbox, SPIRAL_BUDGET);
  const tsv = toSvg;
  const line = (a, b, role, label) => L(tsv(a), tsv(b), role, label);
  const point = (p, role, label) => P(tsv(p), role, label);
  const circ = (center, radius, role) => CIRC(tsv(center), radius * scale, role);
  const curve = (pts, role) => CURVE(pts.map(tsv), role);

  const O = { x: 0, y: 0 };
  const givenSteps = [point(O, 'given', 'O')];
  if (mode === 'archimedean') {
    givenSteps.push(circ(O, cfg.rMin, 'given'));
    givenSteps.push(circ(O, cfg.rMax, 'given'));
    givenSteps.push(dim(tsv(O), tsv({ x: cfg.rMin, y: 0 }), `Rmin ${cfg.rMin} mm`, 'given', -12));
    givenSteps.push(dim(tsv(O), tsv({ x: cfg.rMax, y: 0 }), `Rmax ${cfg.rMax} mm`, 'given', -24));
  } else {
    givenSteps.push(circ(O, cfg.rMax, 'given'));
    const endPt = pointAt(O, cfg.rMax, THETA_MAX);
    givenSteps.push(dim(tsv(O), tsv(endPt), `Rmax ${cfg.rMax} mm`, 'given', 16));
  }

  /** The "how it got there" phase: the radius vector sweeping from the pole, and the
   *  curve traced so far. Mirrors Topic 2.1's rollStepsAt() exactly — main.js's play()
   *  calls this at many intermediate angles to animate the sweep. */
  function rollStepsAt(atDeg) {
    const at = deg2rad(Math.max(0, Math.min(360, atDeg)));
    const steps = [];
    const tracedPts = sampleSpiral(cfg, at, Math.max(8, Math.round(160 * (at / THETA_MAX))));
    if (tracedPts.length >= 2) steps.push(curve(tracedPts, 'result'));
    const M = spiralPoint(at, cfg);
    steps.push(line(O, M, 'move'));
    steps.push(point(M, 'move'));
    return steps;
  }

  /** The tangent/normal construction, built once at the sweep's final angle. tan(alpha)
   *  = r/(dr/dtheta) is the general polar-tangent fact (any r(theta), not spiral-specific)
   *  — alpha shown directly as a small angle-arc between the radius vector and the
   *  tangent, rather than the classical polar-subtangent triangle (OT perpendicular to OM,
   *  length r^2/(dr/dtheta)): for the Archimedean case at large r that triangle runs to
   *  several HUNDRED millimetres against a ~100mm curve (subtangent grows as r^2/k, and k
   *  is small), which would force the whole drawing to shrink to illegibility if drawn at
   *  true scale — the angle-arc shows the identical fact (alpha itself) at a bounded size. */
  function tangentStepsAt(atDeg) {
    const at = deg2rad(Math.max(0, Math.min(360, atDeg)));
    const M = spiralPoint(at, cfg);
    const vel = spiralVelocity(at, cfg);
    const tangentAngle = Math.atan2(vel.y, vel.x);
    const normalAngle = tangentAngle + Math.PI / 2;
    const r = rOf(at, cfg);
    const reach = Math.max(15, r * 0.28);
    const radialAngle = angleOf(O, M); // == theta exactly, since M is at polar angle theta

    const steps = [];
    const [a0, a1] = minorArcAngles(radialAngle, tangentAngle);
    steps.push({ kind: 'arc', role: 'move', center: tsv(M), radius: reach * 0.45 * scale, startAngle: a0, endAngle: a1 });
    const t1 = pointAt(M, reach, tangentAngle);
    const t2 = pointAt(M, reach, tangentAngle + Math.PI);
    steps.push(line(t1, t2, 'result'));
    const n1 = pointAt(M, reach, normalAngle);
    const n2 = pointAt(M, reach, normalAngle + Math.PI);
    steps.push(line(n1, n2, 'result'));
    steps.push(point(M, 'result', 'M'));
    return steps;
  }

  const steps = [...givenSteps, ...rollStepsAt(clampedDeg), ...tangentStepsAt(clampedDeg)];

  const alphaDeg = rad2deg(alphaAt(deg2rad(clampedDeg), cfg));
  let resultText;
  if (mode === 'archimedean') {
    const k = (cfg.rMax - cfg.rMin) / THETA_MAX;
    resultText = `Archimedean spiral through ${clampedDeg.toFixed(0)}° — constant of the curve C = (Rmax − Rmin)/2π = ${k.toFixed(2)} mm/rad. Angle between radius vector and tangent at M: ${alphaDeg.toFixed(1)}°.`;
  } else {
    resultText = `Logarithmic spiral through ${clampedDeg.toFixed(0)}° — equiangular: the ${alphaDeg.toFixed(1)}° angle between the radius vector and the tangent is the SAME at every point on the curve (verify by scrubbing Roll Angle — it won't change).`;
  }

  return {
    steps,
    resultText,
    animateRoll: { toDeg: clampedDeg, givenSteps, rollStepsAt, tangentStepsAt },
  };
}

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'spiral',
    label: 'Spiral Curves',
    shortLabel: 'Spiral',
    principle: 'Both spirals are a radius vector rotating about a fixed pole while its length grows — the ONLY difference is the growth law: a fixed amount per radian (Archimedean) versus a fixed ratio per equal angle step (logarithmic). The general polar-tangent fact tan(alpha) = r / (dr/dtheta) gives the tangent at any point on either curve.',
    given: [
      { key: 'rMin', label: 'Least radius (Rmin)', unit: 'mm', min: 10, max: 40, step: 5, default: 20, modes: ['archimedean'] },
      { key: 'rMax', label: 'Greatest radius (Rmax)', unit: 'mm', min: 60, max: 100, step: 5, default: 80, modes: ['archimedean'] },
      { key: 'logRMax', label: 'Greatest radius (Rmax)', unit: 'mm', min: 60, max: 150, step: 2, default: 108, modes: ['logarithmic'] },
      { key: 'ratio', label: 'Ratio of successive radii', unit: '', min: 1.05, max: 1.4, step: 0.01, default: 1.2, modes: ['logarithmic'] },
      { key: 'stepAngle', label: 'Angle between successive radii', unit: '°', min: 10, max: 45, step: 5, default: 30, modes: ['logarithmic'] },
      THETA_PARAM,
    ],
    build: buildSpiral,
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];
