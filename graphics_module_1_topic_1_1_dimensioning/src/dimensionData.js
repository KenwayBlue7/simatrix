// Part data model (Module 1 Topic 1.1 — Dimensioning). The single source of truth for
// the ONE mechanical component this whole lesson is taught on: the Guide Plate.
//
// PURE DATA LEAF (ADR-007 star rule / RULES.md §3.6): imports nothing, owns no DOM and
// no Three.js objects. Every other layer — the mesh generator (dimensionRig.js), the BIS
// dimension renderer (dimensionDraw.js), the arrangement/mistake catalogues — reads its
// numbers from here, so a change to the part lands everywhere at once.
//
// UNITS. Every number below is in MILLIMETRES, the BIS unit for engineering drawings
// (textbook §4.5 "4. Units for dimensioning": millimetre is the unit recommended by BIS,
// and a value written as a dimension is normally understood as mm — so the drawing shows
// BARE numbers with no "mm" suffix). The world/scene converter is the platform's declared
// drawing scale, 1 world unit = 10 mm (RULES.md §6.8) — a label change only, never a
// global rescale (§6.9).
//
// WHY ONE PART FOR SIX STEPS. The lesson never switches objects: new dimensions appear on
// the SAME plate as the student advances, so every rule, arrangement and symbol is read
// against geometry they already understand. The plate therefore carries, deliberately, one
// clean instance of every feature the textbook dimensions: a rectangular block, a stepped
// profile with a shoulder, a fillet, an outside corner radius, a 45° chamfer, a large
// cylindrical bore, a small drilled hole with a countersink, a square hole, a slot, and a
// spherical seat.

/** Declared drawing scale: 1 world unit = 10 mm (RULES.md §6.8). */
export const MM_PER_UNIT = 10;

/** Overall envelope of the plate in mm — the two "size" dimensions of Step 1. */
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

/** Where the outline path starts (mm). */
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
 * The features whose CENTRES are located along the length of the plate, left to right.
 * This is the ordered spine every Step-4 arrangement is built from (chain / parallel /
 * combined / superimposed running / co-ordinate), so the arrangements are guaranteed to
 * dimension the same real geometry rather than invented numbers.
 */
export const LOCATED_FEATURES = Object.freeze([
  FEATURES.cskHole, FEATURES.square, FEATURES.slot, FEATURES.sphere,
]);

// ============================================================================
// Pure helpers (no imports — this module stays a data leaf)
// ============================================================================

/** mm → world units at the declared 1 unit = 10 mm scale (RULES.md §6.8). */
export const toUnits = (mm) => mm / MM_PER_UNIT;

/**
 * Convert a point in the plate's own mm coordinate frame (origin at the bottom-left of
 * the outline) into CENTRED world units, so the model sits on the origin and the camera
 * framing stays symmetric.
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

/** Half the plate thickness in world units — the front face sits at +z, the back at −z. */
export const HALF_DEPTH = PLATE.thickness / 2 / MM_PER_UNIT;

/**
 * Flatten {@link OUTLINE} into a closed polyline of mm points, tessellating each arc.
 * Shared by the mesh generator (which extrudes it) and the linework layer (which strokes
 * it), so the solid and its Type-A outline can never disagree.
 *
 * @param {number} [arcSteps=24] Segments per quarter-turn of arc.
 * @returns {Array<{ x: number, y: number, id?: string }>} Points in order, not repeated at the close.
 */
export function outlinePoints(arcSteps = 24) {
  const pts = [{ x: OUTLINE_START[0], y: OUTLINE_START[1] }];
  let cur = { x: OUTLINE_START[0], y: OUTLINE_START[1] };

  for (const seg of OUTLINE) {
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
