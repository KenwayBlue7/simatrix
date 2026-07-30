// Pure geometry for the three helix constructions. NO DOM here — every function returns
// plain data (points, lines, circles, a sampled polyline). renderConstruction.js is the
// only file that turns this into SVG.
//
// Layering (CLAUDE.md): leaf module, imports nothing. main.js calls build(params) for the
// active construction and hands the recipe to renderConstruction.js.
//
// ADR-080: a helix is a genuine 3D space curve, but this topic stays on the Diploma
// track's 2D SVG orchestrator — every point is computed in real 3D (x, y, z), then
// projected into TWO linked orthographic views (front view above, top view below,
// first-angle — RULES.md §4's citation), exactly Example 7.11's own construction method.
// The geometry below is honestly 3D; only the rendering is two 2D projections of it.
//
// Coordinate system: a fixed 220x280 drawing area, taller than Topic 2.1/2.2's 240x190 —
// this is the first topic in the track to stack two orthographic views in one viewport.
// Both views share ONE scale and ONE horizontal (x) origin (fitTwoView() below) so a
// vertical projector line between a top-view division point and its front-view point is
// literally vertical — that alignment is what makes it a real first-angle construction,
// not two independently-scaled drawings placed near each other.
//
// Every step carries a `role` (given/move/result, same Two-Cue meaning as every other
// topic) plus, for 'curve' steps only, an independent `dashed` flag — hidden-line
// convention (RULES §4) for the far half of a cylindrical/conical helix's front-view
// projection, occluded by the solid it winds around. This is a DIFFERENT axis from role
// (a hidden segment is still 'result' — it's still part of the answer curve, just behind
// the solid), so it is its own flag, not a fourth role.

const deg2rad = (d) => (d * Math.PI) / 180;

function pointAt(center, r, angleRad) {
  return { x: center.x + r * Math.cos(angleRad), y: center.y + r * Math.sin(angleRad) };
}

// ----------------------------------------------------------------------------
// Step builders
// ----------------------------------------------------------------------------

const P = (p, role, label) => ({ kind: 'point', role, p, label });
const L = (a, b, role, label) => ({ kind: 'line', role, a, b, label });
const CIRC = (center, radius, role) => ({ kind: 'circle', role, center, radius });
const CURVE = (points, role, dashed = false) => ({ kind: 'curve', role, points, dashed });
const dim = (a, b, text, role, offset = 10) => ({ kind: 'dim', role, a, b, text, offset });

// ----------------------------------------------------------------------------
// The shared 3D generator — cylindrical and conical helix are ONE function, differing
// only in whether the radius is constant or linearly tapers with height (ADR-080's own
// "the math stays 3D" point). The helical spring reuses the cylindrical case for its
// centerline.
// ----------------------------------------------------------------------------

/** @typedef {{kind:'cylindrical', r:number, pitch:number, hand:'right'|'left'}|{kind:'conical', r0:number, coneHeight:number, lead:number, hand:'right'|'left'}} HelixCfg */

function radiusAndAxial(theta, cfg) {
  if (cfg.kind === 'cylindrical') return { r: cfg.r, z: (cfg.pitch * theta) / (2 * Math.PI) };
  const z = (cfg.lead * theta) / (2 * Math.PI);
  return { r: Math.max(0, cfg.r0 * (1 - z / cfg.coneHeight)), z };
}

/** The point in real 3D space at sweep angle `theta` (radians). x,y = plan position
 *  (top view), z = axial height (front view). */
function spacePoint(theta, cfg) {
  const { r, z } = radiusAndAxial(theta, cfg);
  const y = cfg.hand === 'left' ? -r * Math.sin(theta) : r * Math.sin(theta);
  return { x: r * Math.cos(theta), y, z, r };
}

/** Exact closed-form d(x,z)/dtheta as seen in the FRONT VIEW (the y/depth component is
 *  irrelevant there) — used for the spring's exact perpendicular wire-thickness offset.
 *  Cylindrical only (the spring is always drawn on its cylindrical mean-diameter helix). */
function frontVelocity(theta, cfg) {
  const dzdt = cfg.pitch / (2 * Math.PI);
  return { dx: -cfg.r * Math.sin(theta), dz: dzdt };
}

function sampleSpace(cfg, thetaMax, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(spacePoint((thetaMax * i) / n, cfg));
  return pts;
}

// ----------------------------------------------------------------------------
// Two-view layout — ONE shared scale + x-origin for both panes (see file header)
// ----------------------------------------------------------------------------

const CANVAS = { w: 220, h: 280 };
const FRONT_BUDGET = { x: 15, y: 15, w: 190, h: 155 };
const TOP_BUDGET = { x: 15, y: 185, w: 190, h: 80 };
const PAD = 16;

/**
 * @param {number} maxRadius  the largest radius anything drawn ever reaches (base radius
 *   for a cone, mean+wire radius for a spring) — exact, not sampled/estimated, since every
 *   construction's true extent is directly one of its own given parameters (ADR-080).
 * @param {number} heightSpan  the largest axial z anything drawn ever reaches
 */
function fitTwoView(maxRadius, heightSpan, cap = 1.3) {
  const dSpan = Math.max(2 * maxRadius, 1e-6);
  const hSpan = Math.max(heightSpan, 1e-6);
  const fw = FRONT_BUDGET.w - PAD * 2, fh = FRONT_BUDGET.h - PAD * 2;
  const tw = TOP_BUDGET.w - PAD * 2, th = TOP_BUDGET.h - PAD * 2;
  const scale = Math.min(cap, fw / dSpan, fh / hSpan, tw / dSpan, th / dSpan);
  const originX = FRONT_BUDGET.x + FRONT_BUDGET.w / 2; // shared x centre — both views align
  const frontBaseY = FRONT_BUDGET.y + PAD + fh; // z=0 sits at the bottom of the front pane
  const topCenterY = TOP_BUDGET.y + PAD + th / 2;
  return {
    toFront: (p) => ({ x: originX + p.x * scale, y: frontBaseY - p.z * scale }),
    toTop: (p) => ({ x: originX + p.x * scale, y: topCenterY - p.y * scale }),
    scale,
  };
}

/** Split a dense front-view-projected point list into consecutive visible/hidden runs
 *  (`visible[i]` from the same-index space-point's y >= 0 — the near half of whatever
 *  solid the helix winds around) — the hidden-line convention this topic's
 *  renderConstruction.js CURVE `dashed` flag exists for. */
function splitVisibleRuns(spacePts, project) {
  const runs = [];
  let current = null;
  for (const sp of spacePts) {
    const visible = sp.y >= 0;
    if (!current || current.visible !== visible) {
      current = { visible, pts: [] };
      runs.push(current);
    }
    current.pts.push(project(sp));
  }
  return runs.filter((r) => r.pts.length >= 2);
}

// ----------------------------------------------------------------------------
// Shared "given" outline + division-point construction for the cylindrical/conical family
// ----------------------------------------------------------------------------

function cylinderOutlineSteps(toFront, r, heightSpan) {
  return [
    L(toFront({ x: -r, z: 0 }), toFront({ x: -r, z: heightSpan }), 'given'),
    L(toFront({ x: r, z: 0 }), toFront({ x: r, z: heightSpan }), 'given'),
    L(toFront({ x: -r, z: 0 }), toFront({ x: r, z: 0 }), 'given'),
  ];
}

function coneOutlineSteps(toFront, r0, rTop, heightSpan) {
  return [
    L(toFront({ x: -r0, z: 0 }), toFront({ x: -rTop, z: heightSpan }), 'given'),
    L(toFront({ x: r0, z: 0 }), toFront({ x: rTop, z: heightSpan }), 'given'),
    L(toFront({ x: -r0, z: 0 }), toFront({ x: r0, z: 0 }), 'given'),
  ];
}

/** The division-point construction (Example 7.11's own method): at each equal angular
 *  step of `360/divisionsPerTurn` degrees, up to `atDeg`, mark the top-view point, the
 *  front-view point, and the vertical projector between them (both views share one
 *  x-origin, so this projector is a real vertical line, not a diagram convenience).
 *  `divisionsPerTurn` is per ONE 360° turn — the number of divisions drawn naturally
 *  scales with however many turns `atDeg` has swept through, not a total fixed up front. */
function divisionSteps(cfg, atDeg, divisionsPerTurn, toFront, toTop) {
  const anglePerDivision = 360 / divisionsPerTurn;
  const n = Math.max(0, Math.round(atDeg / anglePerDivision));
  const steps = [];
  for (let i = 0; i <= n; i++) {
    const thetaDeg = Math.min(i * anglePerDivision, atDeg);
    const theta = deg2rad(thetaDeg);
    const sp = spacePoint(theta, cfg);
    const topPt = toTop(sp);
    const frontPt = toFront(sp);
    steps.push(P(topPt, 'move'));
    steps.push(P(frontPt, 'result'));
    steps.push(L(topPt, frontPt, 'move'));
  }
  return steps;
}

function frontCurveSteps(cfg, atDeg, toFront, samplesPerTurn = 96) {
  const at = deg2rad(Math.max(0, atDeg));
  if (at <= 1e-6) return [];
  const n = Math.max(8, Math.round((samplesPerTurn * atDeg) / 360));
  const spacePts = sampleSpace(cfg, at, n);
  const runs = splitVisibleRuns(spacePts, toFront);
  return runs.map((run) => CURVE(run.pts, 'result', !run.visible));
}

// ----------------------------------------------------------------------------
// Cylindrical helix
// ----------------------------------------------------------------------------

const DIVISIONS_CYLINDRICAL = 12;

function buildCylindrical(params) {
  const diameter = params.diameter ?? 40, pitch = params.pitch ?? 56;
  const turns = Math.max(1, Math.round(params.turns ?? 1));
  const hand = params.hand === 'left' ? 'left' : 'right';
  const r = diameter / 2;
  const heightSpan = turns * pitch;
  const clampedDeg = Math.max(0, Math.min(turns * 360, params.theta ?? turns * 360));
  const cfg = { kind: 'cylindrical', r, pitch, hand };

  const { toFront, toTop, scale } = fitTwoView(r, heightSpan);
  const givenSteps = [
    ...cylinderOutlineSteps(toFront, r, heightSpan),
    CIRC(toTop({ x: 0, y: 0 }), r * scale, 'given'),
    dim(toFront({ x: -r, z: 0 }), toFront({ x: r, z: 0 }), `⌀ ${diameter} mm`, 'given', 12),
    dim(toFront({ x: r, z: 0 }), toFront({ x: r, z: pitch }), `pitch ${pitch} mm`, 'given', 14),
  ];

  function rollStepsAt(atDeg) {
    return [
      ...frontCurveSteps(cfg, atDeg, toFront),
      ...divisionSteps(cfg, atDeg, DIVISIONS_CYLINDRICAL, toFront, toTop),
    ];
  }

  const steps = [...givenSteps, ...rollStepsAt(clampedDeg)];
  const turnsDone = (clampedDeg / 360).toFixed(2);
  return {
    steps,
    resultText: `${hand === 'left' ? 'Left' : 'Right'}-hand cylindrical helix, ⌀${diameter} mm, pitch ${pitch} mm, through ${turnsDone} turn(s) — top view fixes each division's circumferential position, the front-view projector fixes its height.`,
    animateRoll: { toDeg: clampedDeg, givenSteps, rollStepsAt, tangentStepsAt: () => [] },
  };
}

// ----------------------------------------------------------------------------
// Conical helix — no fully worked numeric example in the source (Fig 7.14 gives the
// concept + "1/8 lead per division" only). Originated one consistent with the
// cylindrical example's own numbers: 60mm base diameter, 90mm cone height, 45mm lead
// (well under the cone height, so it never reaches the apex mid-turn) — see CLAUDE.md.
// ----------------------------------------------------------------------------

const DIVISIONS_CONICAL = 8; // "1/8 lead per division" (source Fig 7.14)

function buildConical(params) {
  const baseDiameter = params.baseDiameter ?? 60;
  const coneHeight = params.coneHeight ?? 90;
  const lead = params.lead ?? 45;
  const hand = params.hand === 'left' ? 'left' : 'right';
  const r0 = baseDiameter / 2;

  if (lead >= coneHeight) {
    return { steps: [], resultText: 'Lead must stay less than the cone height, or the helix reaches the apex before completing its turn.', invalid: 'lead-exceeds-height' };
  }

  const clampedDeg = Math.max(0, Math.min(360, params.theta ?? 360));
  const cfg = { kind: 'conical', r0, coneHeight, lead, hand };
  const rTop = r0 * (1 - lead / coneHeight);

  const { toFront, toTop, scale } = fitTwoView(r0, lead);
  const givenSteps = [
    ...coneOutlineSteps(toFront, r0, rTop, lead),
    CIRC(toTop({ x: 0, y: 0 }), r0 * scale, 'given'),
    dim(toFront({ x: -r0, z: 0 }), toFront({ x: r0, z: 0 }), `⌀ ${baseDiameter} mm`, 'given', 12),
    dim(toFront({ x: r0, z: 0 }), toFront({ x: rTop, z: lead }), `lead ${lead} mm`, 'given', 14),
  ];

  /** The top-view projection of a conical helix is NOT the base circle retraced — the
   *  radius shrinks with height, so it is a genuine shrinking spiral, unlike the
   *  cylindrical case (whose top view is always just the one circle, since r is
   *  constant). This is drawn in the top view too, not just the front view. */
  function topCurveSteps(atDeg) {
    const at = deg2rad(Math.max(0, atDeg));
    if (at <= 1e-6) return [];
    const n = Math.max(8, Math.round((96 * atDeg) / 360));
    const pts = sampleSpace(cfg, at, n).map(toTop);
    return [CURVE(pts, 'result')];
  }

  function rollStepsAt(atDeg) {
    return [
      ...frontCurveSteps(cfg, atDeg, toFront),
      ...topCurveSteps(atDeg),
      ...divisionSteps(cfg, atDeg, DIVISIONS_CONICAL, toFront, toTop),
    ];
  }

  const steps = [...givenSteps, ...rollStepsAt(clampedDeg)];
  const turnsDone = (clampedDeg / 360).toFixed(2);
  return {
    steps,
    resultText: `${hand === 'left' ? 'Left' : 'Right'}-hand conical helix, base ⌀${baseDiameter} mm, cone height ${coneHeight} mm, lead ${lead} mm, through ${turnsDone} turn(s) — the top view is a genuine shrinking spiral here, not a retraced circle, since the radius falls with height.`,
    animateRoll: { toDeg: clampedDeg, givenSteps, rollStepsAt, tangentStepsAt: () => [] },
  };
}

// ----------------------------------------------------------------------------
// Helical spring — a cylindrical helix centreline (mean diameter) plus wire thickness,
// drawn as two curves offset from the centreline by exactly the wire radius, PERPENDICULAR
// to the local front-view tangent direction (computed from the exact closed-form
// velocity, not approximated as a simple vertical shift). At every point where the
// centreline crosses the front-view silhouette (theta = k*pi, where the local tangent is
// purely vertical), this perpendicular offset lands exactly wireRadius to the left/right —
// i.e., exactly tangent to a wire-diameter circle centred on the centreline at that point,
// the textbook's own "two curves tangential to circles... at each point" (numerically
// verified during this topic's build, not just asserted).
// ----------------------------------------------------------------------------

const DIVISIONS_SPRING = 12;

function buildSpring(params) {
  const wireDiameter = params.wireDiameter ?? 10;
  const meanDiameter = params.meanDiameter ?? 50;
  const pitch = params.pitch ?? 36;
  const turns = Math.max(1, Math.round(params.turns ?? 2));
  const hand = params.hand === 'left' ? 'left' : 'right';
  const R = meanDiameter / 2;
  const w = wireDiameter / 2;
  const heightSpan = turns * pitch;
  const clampedDeg = Math.max(0, Math.min(turns * 360, params.theta ?? turns * 360));
  const cfg = { kind: 'cylindrical', r: R, pitch, hand };

  // Layout must contain the wire's own thickness — the offset curves reach w beyond the
  // bare centreline's own extent on every axis (ADR-080/Topic 2.2's "include everything
  // you'll draw in the SAME bbox that derives scale" discipline).
  const { toFront, toTop, scale } = fitTwoView(R + w, heightSpan + w);
  const givenSteps = [
    ...cylinderOutlineSteps(toFront, R, heightSpan),
    CIRC(toTop({ x: 0, y: 0 }), R * scale, 'given'),
    dim(toFront({ x: -R, z: 0 }), toFront({ x: R, z: 0 }), `mean ⌀ ${meanDiameter} mm`, 'given', 12),
    dim(toFront({ x: R, z: 0 }), toFront({ x: R, z: pitch }), `pitch ${pitch} mm`, 'given', 14),
    dim(toFront({ x: R, z: 0 }), toFront({ x: R + wireDiameter, z: 0 }), `wire ⌀ ${wireDiameter} mm`, 'given', 12),
  ];

  function offsetPoint(theta, sign) {
    const sp = spacePoint(theta, cfg);
    const v = frontVelocity(theta, cfg);
    const len = Math.hypot(v.dx, v.dz) || 1;
    const nx = -v.dz / len, nz = v.dx / len; // perpendicular to (dx,dz), in the front-view plane
    return { x: sp.x + sign * w * nx, z: sp.z + sign * w * nz };
  }

  function rollStepsAt(atDeg) {
    const at = deg2rad(Math.max(0, atDeg));
    const steps = [];
    if (at > 1e-6) {
      const n = Math.max(8, Math.round((96 * atDeg) / 360));
      const outer = [], inner = [];
      for (let i = 0; i <= n; i++) {
        const theta = (at * i) / n;
        outer.push(toFront(offsetPoint(theta, 1)));
        inner.push(toFront(offsetPoint(theta, -1)));
      }
      steps.push(CURVE(outer, 'result'), CURVE(inner, 'result'));
      // wire cross-section circles at each silhouette crossing (theta = k*pi) — the
      // "circles... at each point" the two curves above are tangent to.
      const crossings = Math.floor(at / Math.PI);
      for (let k = 0; k <= crossings; k++) {
        const theta = k * Math.PI;
        const sp = spacePoint(theta, cfg);
        steps.push(CIRC(toFront(sp), w * scale, 'move'));
      }
    }
    steps.push(...divisionSteps(cfg, atDeg, DIVISIONS_SPRING, toFront, toTop));
    return steps;
  }

  const steps = [...givenSteps, ...rollStepsAt(clampedDeg)];
  const turnsDone = (clampedDeg / 360).toFixed(2);
  const outsideDiameter = meanDiameter + wireDiameter;
  const insideDiameter = meanDiameter - wireDiameter;
  return {
    steps,
    resultText: `${hand === 'left' ? 'Left' : 'Right'}-hand helical spring, wire ⌀${wireDiameter} mm, mean ⌀${meanDiameter} mm (outside ⌀${outsideDiameter} mm, inside ⌀${insideDiameter} mm), pitch ${pitch} mm, through ${turnsDone} turn(s).`,
    animateRoll: { toDeg: clampedDeg, givenSteps, rollStepsAt, tangentStepsAt: () => [] },
    invalid: wireDiameter >= meanDiameter ? 'wire-too-thick' : undefined,
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
 * @property {(params:Record<string,number|string>) => {steps:Array, resultText:string, invalid?:string}} build
 */

/** @type {ConstructionDef[]} */
export const CONSTRUCTIONS = [
  {
    id: 'cylindrical-helix',
    label: 'Cylindrical Helix',
    shortLabel: 'Cylindrical Helix',
    principle: 'A point advancing at a uniform axial rate while moving at a uniform angular rate around a cylinder traces a helix. The top view fixes WHERE around the circle each division sits; a vertical projector into the front view, at that division’s own height, fixes the front-view point — the same divided-view method as every other projection drawing.',
    given: [
      { key: 'diameter', label: 'Cylinder diameter', unit: 'mm', min: 30, max: 60, step: 5, default: 40 },
      { key: 'pitch', label: 'Pitch', unit: 'mm', min: 30, max: 70, step: 2, default: 56 },
      { key: 'turns', label: 'Complete turns', unit: '', min: 1, max: 2, step: 1, default: 1 },
      { key: 'theta', label: 'Sweep angle', unit: '°', min: 0, max: 720, step: 10, default: 360 },
    ],
    build: buildCylindrical,
  },
  {
    id: 'conical-helix',
    label: 'Conical Helix',
    shortLabel: 'Conical Helix',
    principle: 'The same divided top+front construction as the cylindrical helix, but the radius shrinks with height (the cone’s own taper) — so unlike the cylindrical case, the top view is a genuine shrinking spiral, not the same circle retraced at every division.',
    given: [
      { key: 'baseDiameter', label: 'Base diameter', unit: 'mm', min: 40, max: 80, step: 5, default: 60 },
      { key: 'coneHeight', label: 'Cone height', unit: 'mm', min: 60, max: 120, step: 5, default: 90 },
      { key: 'lead', label: 'Lead (one turn)', unit: 'mm', min: 20, max: 60, step: 5, default: 45 },
      { key: 'theta', label: 'Sweep angle', unit: '°', min: 0, max: 360, step: 10, default: 360 },
    ],
    build: buildConical,
  },
  {
    id: 'helical-spring',
    label: 'Helical Spring',
    shortLabel: 'Helical Spring',
    principle: 'A coil spring’s wire follows a cylindrical helix at the coil’s mean diameter; drawing its true wire thickness means offsetting two curves from that centreline by exactly the wire radius, perpendicular to the curve’s own direction at every point — the offset lands exactly tangent to the wire’s own circular cross-section wherever the coil crosses the silhouette edge.',
    given: [
      { key: 'wireDiameter', label: 'Wire diameter', unit: 'mm', min: 6, max: 14, step: 1, default: 10 },
      { key: 'meanDiameter', label: 'Mean coil diameter', unit: 'mm', min: 40, max: 70, step: 2, default: 50 },
      { key: 'pitch', label: 'Pitch', unit: 'mm', min: 25, max: 55, step: 2, default: 36 },
      { key: 'turns', label: 'Complete turns', unit: '', min: 1, max: 3, step: 1, default: 2 },
      { key: 'theta', label: 'Sweep angle', unit: '°', min: 0, max: 1080, step: 10, default: 720 },
    ],
    build: buildSpring,
  },
];

export const findConstruction = (id) => CONSTRUCTIONS.find((c) => c.id === id) ?? CONSTRUCTIONS[0];

export const __internal = { CANVAS };
