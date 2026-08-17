// Part data model (Module 1 Topic 1.1 — Dimensioning). The single source of truth for every
// figure the lesson is taught on, from the plain plate of the first step to the Guide Plate
// the review is set on.
//
// PURE DATA LEAF (ADR-007 star rule / RULES.md §3.6): imports nothing, owns no DOM and
// no Three.js objects. Every other layer — the mesh generator (dimensionRig.js), the BIS
// dimension renderer (dimensionDraw.js), the arrangement catalogues — reads its
// numbers from here, so a change to the part lands everywhere at once.
//
// UNITS. Every number below is in MILLIMETRES, the BIS unit for engineering drawings
// (textbook §4.5 "4. Units for dimensioning": millimetre is the unit recommended by BIS,
// and a value written as a dimension is normally understood as mm — so the drawing shows
// BARE numbers with no "mm" suffix). The world/scene converter is the platform's declared
// drawing scale, 1 world unit = 10 mm (RULES.md §6.8) — a label change only, never a
// global rescale (§6.9).
//
// WHY FIVE FIGURES AND NOT ONE (2026-08-04, lecturers' review). The lesson used to teach
// every concept on the Guide Plate, which carries one clean instance of every feature the
// textbook dimensions — a stepped profile, a fillet, a corner radius, a chamfer, a bore, a
// countersunk hole, a square hole, a slot, a spherical seat and a spigot. That is the right
// part to be EXAMINED on and the wrong one to meet a projection line on: a beginner reading
// their first dimension had to find it among nine features they had no name for yet.
//
// So the geometry now comes in the order a drawing office teaches it, and each step is set on
// the SIMPLEST figure that can carry its concept:
//
//   1  plate    plain rectangle                  overall sizes, projection + dimension lines,
//                                                arrow heads, the value
//   2  hole     rectangle with one drilled hole  diameter, centre line, locating a feature
//   3  slot     slotted plate with two holes     slot sizes, radius, several located features
//   4  chamfer  chamfered plate with one hole    angles, chamfers, leaders, inclined lines
//   5  guide    the Guide Plate                  everything, once the fundamentals are in
//
// Every figure is drawn in the same millimetre frame, to the same line standards, by the same
// rig, so moving between them changes the geometry and nothing else.

/** Declared drawing scale: 1 world unit = 10 mm (RULES.md §6.8). */
export const MM_PER_UNIT = 10;

/** Overall envelope of the GUIDE PLATE in mm — the figure Steps 5 and 6 are set on. */
export const PLATE = Object.freeze({
  length: 200,   // overall length  (X)
  height: 100,   // overall height  (Y)
  thickness: 30, // plate thickness (Z) — read in the 3-D view, not the front elevation
  stepHeight: 50, // top of the low right-hand step, at each END of the crowned face
  stepX: 95,      // the riser: where the tall left portion ends
  chamfer: 10,    // 45° chamfer at the bottom-right corner of the step
  filletR: 15,    // internal fillet where the step meets the riser
  cornerR: 12,    // outside corner radius, top-left
  crownR: 220,    // LARGE radius crowning the step's top face (textbook Fig. 4.22)
  boreChamfer: 3, // internal chamfer at the bore's front mouth (Fig. 4.26c), 3 × 45°
});

/**
 * Centre of the crowned step face. A large radius is the case Fig. 4.22 is really about:
 * its centre falls far outside the drawing, so the radius cannot be dimensioned from the
 * centre and the dimension line has to be broken and offset instead.
 * Chord 110 → 190 at y = 50, radius 220, bulging UP ⇒ centre far below the part.
 */
const CROWN_CX = (110 + 190) / 2;
const CROWN_CY = PLATE.stepHeight - Math.sqrt(PLATE.crownR ** 2 - ((190 - 110) / 2) ** 2);

/** The crown's centre in mm — exported because the R220 dimension has to point at it. */
export const CROWN_CENTRE = Object.freeze([CROWN_CX, CROWN_CY]);

/** Peak of the crowned face (mm) — the highest point of the step's top surface. */
export const CROWN_PEAK = Object.freeze([CROWN_CX, CROWN_CY + PLATE.crownR]);

/**
 * The front-view OUTLINE of the plate, as an ordered path in mm, traced anticlockwise
 * from the bottom-left corner. Two segment kinds only:
 *   { line:  [x, y] }                                   — straight to that point
 *   { arc: { to:[x,y], centre:[cx,cy], ccw:boolean } }  — circular arc to that point
 * The path is closed implicitly (last point back to the first).
 *
 * The arcs are the teaching features: `filletR` is the CONCAVE internal fillet where the
 * step's horizontal face runs into the riser (dimensioned R15, textbook Fig. 4.22), and
 * `cornerR` is the CONVEX outside corner (R12). The straight run from (200,40) to (190,50)
 * is the 45° chamfer (textbook Fig. 4.26 — "4 × 45°" style indication). The step's top face
 * is CROWNED to R220 — a large radius whose centre lies far off the sheet, which is the
 * case Fig. 4.22's R120 examples exist for.
 *
 * The crown is deliberately shallow (≈3.7 mm of rise over its 80 mm chord) so that it meets
 * the R15 fillet at a turn of about 10° — under `dimensionRig.js`'s CORNER_DEG threshold, so
 * the junction stays smooth and does not sprout a spurious vertical edge.
 */
export const OUTLINE = Object.freeze([
  { line: [200, 0] },                                              // bottom edge
  { line: [200, 40] },                                             // right edge, below the chamfer
  { line: [190, 50], id: 'chamfer' },                              // 10 × 45° chamfer
  { arc: { to: [110, 50], centre: [CROWN_CX, CROWN_CY], ccw: true }, id: 'crown' }, // R220 crown
  { arc: { to: [95, 65], centre: [110, 65], ccw: false }, id: 'fillet' }, // R15 internal fillet
  { line: [95, 100] },                                             // riser (the shoulder face)
  { line: [12, 100] },                                             // top edge
  { arc: { to: [0, 88], centre: [12, 88], ccw: true }, id: 'cornerR' }, // R12 outside corner
  { line: [0, 0] },                                                // left edge
]);

/** Where an outline path starts (mm) — the bottom-left corner, on every figure. */
export const OUTLINE_START = Object.freeze([0, 0]);

/**
 * Every machined feature on the plate, keyed by id. Each carries the numbers the drawing
 * has to state, so the dimension specs never re-derive a size by hand.
 *
 * kind:
 *   'circle'  — a drilled/bored hole. `dia` mm. `countersink` (optional) records the BIS
 *               countersink indication (textbook Fig. 4.27: included angle with diameter),
 *               and `side:'back'` puts it on the FAR face, so in the front elevation the
 *               countersink mouth reads as a HIDDEN (dashed) circle while the Ø14 drill
 *               reads as a visible one. That gives the drawing one honest hidden outline —
 *               the thing Rule 5 of §4.6 is about ("dimensions are to be given from visible
 *               outlines rather than from hidden lines").
 *   'square'  — a square through-hole. `side` mm (textbook §4.4: the □ symbol, Fig. 4.23).
 *   'slot'    — an obround slot. `width` mm, `centres` = the two arc centres in mm.
 *   'sphere'  — a spherical seat sunk into the FRONT face. `dia` mm (Sø) / `radius` mm (SR),
 *               textbook Fig. 4.24.
 *   'cylinderX' — a cylindrical spigot standing off the RIGHT end face with its axis lying
 *               IN the drawing plane, so the front elevation shows it as a RECTANGLE. That
 *               is the case Fig. 4.21 ("indicating diameter on cylindrical features") is
 *               about, and a flat plate has no other way to show it truthfully.
 */
export const FEATURES = Object.freeze({
  bore: Object.freeze({
    id: 'bore', kind: 'circle', label: 'Central bore',
    at: [50, 70], dia: 40,
    // Internal chamfer at the FRONT mouth — Fig. 4.26(c). 3 × 45° opens the ø40 bore out to
    // ø46 at the face; the simplified "3 × 45°" indication is allowed because the angle is 45°.
    chamfer: Object.freeze({ width: 3, angle: 45, side: 'front' }),
  }),
  cskHole: Object.freeze({
    id: 'cskHole', kind: 'circle', label: 'Countersunk hole',
    at: [30, 25], dia: 14,
    // `depth` is the axial drop of the cone, so the SAME feature can be stated either of the
    // two ways Fig. 4.27 gives: (a) included angle with the diameter, (b) angle with the depth.
    countersink: Object.freeze({ dia: 24, angle: 90, side: 'back', depth: 5 }),
  }),
  square: Object.freeze({
    id: 'square', kind: 'square', label: 'Square hole',
    at: [70, 25], side: 22,
  }),
  slot: Object.freeze({
    id: 'slot', kind: 'slot', label: 'Slot',
    at: [124, 25], width: 16, centres: Object.freeze([[108, 25], [140, 25]]),
  }),
  sphere: Object.freeze({
    id: 'sphere', kind: 'sphere', label: 'Spherical seat',
    at: [176, 25], dia: 24, radius: 12,
  }),
  spigot: Object.freeze({
    id: 'spigot', kind: 'cylinderX', label: 'Cylindrical spigot',
    at: [PLATE.length, 20],   // where its axis meets the right end face
    dia: 28, length: 26,
  }),
});

/** Diameter of the bore's chamfered MOUTH at the front face (mm) — ø40 opened out by 3 × 45°. */
export const BORE_MOUTH_DIA = FEATURES.bore.dia + FEATURES.bore.chamfer.width * 2;

/** The spigot's front-view rectangle in mm: { x0, x1, y0, y1 }. */
export const SPIGOT_RECT = Object.freeze({
  x0: FEATURES.spigot.at[0],
  x1: FEATURES.spigot.at[0] + FEATURES.spigot.length,
  y0: FEATURES.spigot.at[1] - FEATURES.spigot.dia / 2,
  y1: FEATURES.spigot.at[1] + FEATURES.spigot.dia / 2,
});

/** Slot overall length across the arc ends (mm) — 32 between centres + 16 width. */
export const SLOT_LENGTH =
  Math.abs(FEATURES.slot.centres[1][0] - FEATURES.slot.centres[0][0]) + FEATURES.slot.width;

/**
 * The Guide Plate's features whose CENTRES are located along its length, left to right — the
 * ordered spine the finished drawing of Step 6 measures. (Step 4's arrangements are built on
 * the simpler `slot` figure and read their own spine from it.)
 */
export const LOCATED_FEATURES = Object.freeze([
  FEATURES.cskHole, FEATURES.square, FEATURES.slot, FEATURES.sphere,
]);

// ============================================================================
// THE FIGURES — simple, medium, complex
//
// Every figure has the same shape as the Guide Plate above: an `outline` path in mm traced
// anticlockwise from `[0, 0]`, a `features` map, and a `plate` envelope. It adds a `frame`,
// which is how the camera is centred on it (see main.js), and a `teaches` line, which is what
// the viewport badge tells the learner they are looking at.
//
// TWO RULES THE SIMPLE FIGURES OBEY, both of them about cognitive load:
//   • NOTHING IS ON A FIGURE THAT ITS STEP DOES NOT TEACH. A learner meeting projection lines
//     for the first time meets them on a rectangle, because a rectangle has nothing else to
//     look at. The one deliberate exception is documented on `hole` below.
//   • THEY ARE ALL THE SAME SIZE AND THE SAME THICKNESS. 130 × 80 × 20, drawn in the same
//     frame at the same scale, so stepping from one to the next reads as the same plate
//     growing a feature rather than as a different drawing at a different size.
// ============================================================================

/** The simple figures share one envelope, so the sheet never appears to change scale. */
const SIMPLE = Object.freeze({ length: 130, height: 80, thickness: 20 });

/**
 * @typedef {object} Figure
 * @property {string} id
 * @property {string} name      What the figure is called in the panel and the badge.
 * @property {string} caption   The sheet caption, in capitals (§4.5 item 6).
 * @property {string} teaches   One line: what this figure is here to teach.
 * @property {object} plate     Its envelope — `length`, `height`, `thickness` in mm, plus any
 *                              named sizes its own outline is built from.
 * @property {object[]} outline The front-view path (see {@link OUTLINE}).
 * @property {object} features  Machined features by id (see {@link FEATURES}).
 * @property {{centre:{x:number,y:number}, reach:{x:number,y:number}}} frame
 *                              Where the camera sits and how far the ink reaches from there,
 *                              both in mm. The centre is the PART's middle (nudged only where
 *                              the ink is genuinely one-sided); the reach is measured off the
 *                              furthest dimension lane the step draws, never guessed.
 */

/** @type {Record<string, Figure>} */
export const FIGURES = Object.freeze({
  // --- 1 · the plain plate ---------------------------------------------------
  // Nothing but four edges. This is the whole point: the first dimension a student ever reads
  // has to be the only thing on the sheet.
  plate: Object.freeze({
    id: 'plate',
    name: 'Plain plate',
    caption: 'PLATE — FRONT ELEVATION',
    teaches: 'Overall sizes · projection lines · dimension lines · arrow heads',
    plate: SIMPLE,
    outline: Object.freeze([
      { line: [SIMPLE.length, 0] },              // bottom edge
      { line: [SIMPLE.length, SIMPLE.height] },  // right edge
      { line: [0, SIMPLE.height] },              // top edge
    ]),
    features: Object.freeze({}),
    frame: Object.freeze({ centre: { x: 65, y: 40 }, reach: { x: 100, y: 72 } }),
  }),

  // --- 2 · the plate with a hole ---------------------------------------------
  hole: Object.freeze({
    id: 'hole',
    name: 'Plate with a hole',
    caption: 'PLATE WITH HOLE — FRONT ELEVATION',
    teaches: 'Diameter · centre lines · locating a feature from two edges',
    plate: SIMPLE,
    outline: Object.freeze([
      { line: [SIMPLE.length, 0] },
      { line: [SIMPLE.length, SIMPLE.height] },
      { line: [0, SIMPLE.height] },
    ]),
    features: Object.freeze({
      hole: Object.freeze({
        id: 'hole', kind: 'circle', label: 'Drilled hole',
        // 55 rather than a round 50 so that no two sizes on this figure are equal: the plate is
        // 130 × 80, the hole sits 55 across and 45 up, and the gap to the right face is 75. Step
        // 2 shows a rule's dimension and the learner's draggable one on the same sheet, and two
        // different measurements printing the same number is a puzzle nobody needs.
        at: [55, 45], dia: 30,
        // THE ONE DELIBERATE EXCEPTION to "nothing the step does not teach". The countersink
        // is machined on the FAR face and is never dimensioned on this figure — it is here
        // only so the front elevation owns one honest DASHED outline, and two things need
        // exactly that: Step 1's line alphabet, whose third entry is the hidden line and would
        // otherwise point at nothing, and Step 2's "measure from visible edges" rule, which
        // needs a dashed circle to argue against. Removing it silently guts both.
        countersink: Object.freeze({ dia: 44, angle: 90, side: 'back', depth: 7 }),
      }),
    }),
    frame: Object.freeze({ centre: { x: 65, y: 40 }, reach: { x: 100, y: 76 } }),
  }),

  // --- 3 · the slotted plate -------------------------------------------------
  // A slot, a corner radius, and two plain holes. The holes are not decoration: Step 4 lays
  // the same four sizes out five different ways, and a layout needs several located features
  // strung along the length before chain, parallel and running mean anything at all.
  slot: Object.freeze({
    id: 'slot',
    name: 'Slotted plate',
    caption: 'SLOTTED PLATE — FRONT ELEVATION',
    teaches: 'Slot sizes · radius · several features located along one edge',
    plate: Object.freeze({ ...SIMPLE, cornerR: 15 }),
    outline: Object.freeze([
      { line: [SIMPLE.length, 0] },
      { line: [SIMPLE.length, SIMPLE.height] },
      { line: [15, SIMPLE.height] },
      { arc: { to: [0, 65], centre: [15, 65], ccw: true }, id: 'cornerR' }, // R15 outside corner
    ]),
    features: Object.freeze({
      holeA: Object.freeze({ id: 'holeA', kind: 'circle', label: 'Left hole', at: [25, 58], dia: 12 }),
      slot: Object.freeze({
        id: 'slot', kind: 'slot', label: 'Slot',
        at: [72, 26], width: 16, centres: Object.freeze([[52, 26], [92, 26]]),
      }),
      holeB: Object.freeze({ id: 'holeB', kind: 'circle', label: 'Right hole', at: [105, 58], dia: 12 }),
    }),
    // Five stacked lanes under the parallel arrangement is what makes this figure's reach
    // deep rather than wide. Measured off `lanesFor()` below, not guessed. The extra 16 is the
    // SHEET CAPTION's room: a compare names each sheet 10 mm inside the bottom of its frame,
    // and the parallel layout's lowest lane sits at −56, exactly where a 106 reach would put
    // that name. The caption printed straight through the dimension line.
    frame: Object.freeze({ centre: { x: 65, y: 40 }, reach: { x: 104, y: 122 } }),
  }),

  // --- 4 · the chamfered plate -----------------------------------------------
  // The figure Step 3 needs, and the reason it is a chamfer: aligned and unidirectional values
  // are IDENTICAL on a horizontal dimension line, so a figure that can only be measured across
  // and up cannot show the difference at all. A 45° chamfer supplies both cases the two systems
  // disagree about in one feature — an INCLINED dimension line and an ANGULAR one — and the
  // hole supplies the third, a leader note, which never turns under either system.
  chamfer: Object.freeze({
    id: 'chamfer',
    name: 'Chamfered plate',
    caption: 'CHAMFERED PLATE — FRONT ELEVATION',
    teaches: 'Angles · chamfers · leaders · sloping dimension lines',
    plate: Object.freeze({ ...SIMPLE, chamfer: 20 }),
    outline: Object.freeze([
      { line: [110, 0] },                        // bottom edge, stopping at the chamfer
      { line: [130, 20], id: 'chamfer' },        // 20 × 45° chamfer
      { line: [SIMPLE.length, SIMPLE.height] },  // right edge
      { line: [0, SIMPLE.height] },              // top edge
    ]),
    features: Object.freeze({
      hole: Object.freeze({ id: 'hole', kind: 'circle', label: 'Drilled hole', at: [40, 45], dia: 24 }),
    }),
    frame: Object.freeze({ centre: { x: 70, y: 40 }, reach: { x: 104, y: 76 } }),
  }),

  // --- 5 · the Guide Plate ---------------------------------------------------
  // Everything above, on one part. Reached only at Step 5, once every element, rule, value
  // system and layout has already been met somewhere simpler.
  guide: Object.freeze({
    id: 'guide',
    name: 'Guide Plate',
    caption: 'GUIDE PLATE — FRONT ELEVATION',
    teaches: 'Every feature at once — the drawing you are examined on',
    plate: PLATE,
    outline: OUTLINE,
    features: FEATURES,
    // The centre is the plate's own middle nudged 13 mm right, because the ink is not
    // symmetric about the part: the leader notes and the spigot's dimensions all sit off the
    // right-hand end with nothing to balance them on the left.
    frame: Object.freeze({ centre: { x: PLATE.length / 2 + 13, y: PLATE.height / 2 }, reach: { x: 152, y: 145 } }),
  }),
});

/** The figure every step falls back to if it names none. */
export const DEFAULT_FIGURE = FIGURES.plate;

/**
 * Where dimension lines are parked on a figure, in mm, measured off the part. §4.3 asks for at
 * least 5–6 mm of clearance; these rows are generously outside that so the sheet reads calmly,
 * and the pitch is the same 14 mm on every figure so the lanes look identical throughout.
 *
 * @param {Figure} figure
 * @returns {{below1:number, below2:number, below3:number, below4:number, below5:number,
 *            left1:number, left2:number, left3:number, above1:number,
 *            right1:number}}
 */
export function lanesFor(figure) {
  const f = figure || DEFAULT_FIGURE;
  // The Guide Plate's right-hand lane has to clear the spigot standing off its end face.
  const rightClear = f.features?.spigot ? f.features.spigot.length : 0;
  return {
    below1: -14, below2: -28, below3: -42, below4: -56, below5: -70,
    left1: -14, left2: -28, left3: -42,
    above1: f.plate.height + 14,
    right1: f.plate.length + rightClear + 14,
  };
}

// ============================================================================
// Pure helpers (no imports — this module stays a data leaf)
// ============================================================================

/** mm → world units at the declared 1 unit = 10 mm scale (RULES.md §6.8). */
export const toUnits = (mm) => mm / MM_PER_UNIT;

/**
 * Convert a point in a figure's own mm coordinate frame (origin at the bottom-left of its
 * outline) into world units.
 *
 * This is ONE fixed map, shared by every figure, and deliberately not a per-figure centring:
 * a figure that re-centred the world under itself would move all the OTHER figures whenever
 * the step changed, and the two sheets of a comparison would stop being drawn in the same
 * space. What is per figure is where the CAMERA sits — `figure.frame` — so a small plate is
 * framed as tightly as a large one without either of them moving in world terms.
 *
 * @param {number} xMm
 * @param {number} yMm
 * @returns {{ x: number, y: number }}
 */
export function toWorld(xMm, yMm) {
  return {
    x: (xMm - PLATE.length / 2) / MM_PER_UNIT,
    y: (yMm - PLATE.height / 2) / MM_PER_UNIT,
  };
}

/**
 * Half the depth of the SHEET in world units — where the dimension apparatus, the values and
 * the caption are drawn.
 *
 * It is the thickest figure's half thickness, and it is a constant on purpose: dimension lines
 * belong to the paper, not to the front face of the part, so they must not step towards the
 * viewer every time a thinner figure comes up. In the elevation — the pose a dimension is read
 * in — the difference is invisible under parallel projection anyway.
 */
export const HALF_DEPTH = PLATE.thickness / 2 / MM_PER_UNIT;

/** Half of one figure's own thickness in world units: its front face sits at +z, its back at −z. */
export const halfDepthOf = (figure) => (figure || DEFAULT_FIGURE).plate.thickness / 2 / MM_PER_UNIT;

/**
 * Flatten a figure's outline into a closed polyline of mm points, tessellating each arc.
 * Shared by the mesh generator (which extrudes it) and the linework layer (which strokes
 * it), so the solid and its Type-A outline can never disagree.
 *
 * @param {Figure} [figure] Which figure's outline. Defaults to the plain plate.
 * @param {number} [arcSteps=24] Segments per quarter-turn of arc.
 * @returns {Array<{ x: number, y: number, id?: string }>} Points in order, not repeated at the close.
 */
export function outlinePoints(figure = DEFAULT_FIGURE, arcSteps = 24) {
  const pts = [{ x: OUTLINE_START[0], y: OUTLINE_START[1] }];
  let cur = { x: OUTLINE_START[0], y: OUTLINE_START[1] };

  for (const seg of (figure || DEFAULT_FIGURE).outline) {
    if (seg.line) {
      cur = { x: seg.line[0], y: seg.line[1], id: seg.id };
      pts.push(cur);
      continue;
    }
    const { to, centre, ccw } = seg.arc;
    const [cx, cy] = centre;
    const r = Math.hypot(cur.x - cx, cur.y - cy);
    let a0 = Math.atan2(cur.y - cy, cur.x - cx);
    let a1 = Math.atan2(to[1] - cy, to[0] - cx);
    // Normalise the sweep into the requested direction so the arc bulges the right way.
    if (ccw && a1 < a0) a1 += Math.PI * 2;
    if (!ccw && a1 > a0) a1 -= Math.PI * 2;
    const sweep = Math.abs(a1 - a0);
    const steps = Math.max(2, Math.ceil((sweep / (Math.PI / 2)) * arcSteps));
    for (let i = 1; i <= steps; i++) {
      const a = a0 + (a1 - a0) * (i / steps);
      pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, id: seg.id });
    }
    cur = { x: to[0], y: to[1] };
  }

  // The final segment lands back on the start point; drop the duplicate.
  const last = pts[pts.length - 1];
  if (Math.hypot(last.x - pts[0].x, last.y - pts[0].y) < 1e-6) pts.pop();
  return pts;
}

/**
 * A closed polygon (mm) for one feature's opening in the FRONT face — the loop the mesh
 * generator punches out and the linework layer strokes. Circles/slots are tessellated;
 * the square is its four corners.
 *
 * @param {object} feature One of {@link FEATURES}.
 * @param {number} [steps=48] Segments for a full circle.
 * @returns {Array<{ x: number, y: number }>}
 */
export function featurePoints(feature, steps = 48) {
  const out = [];
  if (feature.kind === 'circle' || feature.kind === 'sphere') {
    const r = feature.dia / 2;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      out.push({ x: feature.at[0] + Math.cos(a) * r, y: feature.at[1] + Math.sin(a) * r });
    }
    return out;
  }
  if (feature.kind === 'square') {
    const h = feature.side / 2;
    const [cx, cy] = feature.at;
    return [
      { x: cx - h, y: cy - h }, { x: cx + h, y: cy - h },
      { x: cx + h, y: cy + h }, { x: cx - h, y: cy + h },
    ];
  }
  // Slot: a half-circle at each centre joined by two straight flanks.
  const r = feature.width / 2;
  const [a, b] = feature.centres;
  const half = Math.max(2, Math.round(steps / 2));
  for (let i = 0; i <= half; i++) {            // right cap, −90° → +90°
    const ang = -Math.PI / 2 + (i / half) * Math.PI;
    out.push({ x: b[0] + Math.cos(ang) * r, y: b[1] + Math.sin(ang) * r });
  }
  for (let i = 0; i <= half; i++) {            // left cap, +90° → +270°
    const ang = Math.PI / 2 + (i / half) * Math.PI;
    out.push({ x: a[0] + Math.cos(ang) * r, y: a[1] + Math.sin(ang) * r });
  }
  return out;
}
