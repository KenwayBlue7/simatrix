// Object registry — Module 2, Topic 0: Introduction to Orthographic Projection.
//
// THE DATA MODEL (the sibling topic's ADR-043 pattern, reused unchanged). This file is the single
// place an object is described; every other module in the topic is a generic interpreter of what it
// finds here. An object declares five things and nothing else:
//
//   parts(...)   the 3D solid as a list of geometry SPECS — a kind + numbers, never a THREE object
//   size         the overall enclosing L x D x H, used for camera framing only
//   views        the three orthographic views as layered 2D linework (projectionSheet reads them)
//   dims         the aligned dimensions each view carries
//   viewNotes    what Step 1's right panel says about each camera direction
//
// UNITS. Every number here is in MILLIMETRES — the unit the textbook quotes and the unit the sheet
// is drawn in. The 3D scale is the platform's declared 1 world unit = 10 mm (RULES.md §6.8), applied
// by `toWorld()` at the boundary, never by rescaling the data.
//
// SOURCE. The four objects are the machine parts worked in "Intro To Machine Drawing", Chapter 19
// (Multiview Projection of Objects), pages 252-255 — Fig. 19.27 (a stepped block), Fig. 19.20
// (cylindrical block), Fig. 19.21 (shaft support) and Fig. 19.22 (bearing block), in that order of
// difficulty. The principal sizes are the figures' own.
//
// AUDITED AGAINST THE FIGURES, 2026-08-17 (ADR-221, RULES.md §6.37), and all four differed. Read
// that ADR before changing a size here. Two of its findings are traps this file walked into:
//   * 19.24 is captioned "A block"; the only figure captioned "A stepped block" is 19.27, and the
//     two are different parts. This file cited 19.24 for an object called Stepped Block.
//   * the Bearing Block's 37 is the height to the BORE CENTRE, dimensioned on the right side view
//     from the seating up to the centre line — not the overall height, which is 37 + R24.
//
// Where a size the figure genuinely does not print was needed, a sensible engineering value is
// flagged `// chosen` below. That flag is a claim about the figure and it was wrong twice, so check
// the figure before adding one; exactly one survives the audit.
//
// FRAMES. Getting these right is the whole lesson, so they are stated once, here, and every view's
// linework below is authored in them.
//
//   World (3D):     +x right, +y up, +z toward the observer of the front view.
//                   Every object is seated on y = 0 and centred about x = 0.
//
//   Each 2D view is authored in its own local frame, +x right and +y UP on the paper. The sheet
//   places the frames; it never re-maps their contents.
//
//   ELEVATION (front view, on the VP)     local x = world x     local y = world y
//   PLAN (top view, on the HP)            local x = world x     local y = -world z
//   RIGHT SIDE VIEW (on the left PP)      local x = -world z    local y = world y
//   LEFT SIDE VIEW (on the right PP)      local x =  world z    local y = world y
//
//   The two sign flips are FIRST-ANGLE itself, not a convention this file invented. The plan is
//   projected onto the HP below the object and that plane is then hinged DOWN about the XY line, so
//   the edge nearest the front observer (largest z) ends up FURTHEST below XY — the bottom of the
//   plan. The right side view is projected onto the PP beyond the object's left, and that plane
//   hinges out to the LEFT, so the same near edge ends up furthest from the elevation. In both
//   views the near face lands on the OUTER side. Third angle reverses both, which is exactly the
//   difference §19.11 of the chapter describes.
//
// Layering (CLAUDE.md, RULES.md §3.6a): leaf DATA module. Imports nothing, knows nothing about
// THREE, the DOM or the scene. That is what lets one description drive a 3D solid, an SVG sheet and
// a set of controls without any of them knowing about each other.

/** Platform scale: 1 world unit = 10 mm (RULES.md §6.8). */
export const MM_PER_UNIT = 10;

/** Convert a millimetre value to world units. */
export function toWorld(mm) { return mm / MM_PER_UNIT; }

// ---------------------------------------------------------------------------
// Authoring helpers. All pure; all in millimetres.
// ---------------------------------------------------------------------------

/** A rectangle as a closed point loop, given its two opposite corners. */
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** A circle as a closed point loop — used for a hole in an extruded profile. */
function circleLoop(cx, cy, r, steps = 48) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/** An obround (slot) loop: a rectangle capped by a semicircle at each end centre. */
function slotLoop(x0, x1, cy, r, steps = 24) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {          // right cap, -90 deg -> +90 deg
    const a = -Math.PI / 2 + (i / steps) * Math.PI;
    pts.push([x1 + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  for (let i = 0; i <= steps; i++) {          // left cap, +90 deg -> +270 deg
    const a = Math.PI / 2 + (i / steps) * Math.PI;
    pts.push([x0 + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Append an arc's points to an outline being authored as one polyline.
 * Angles in degrees, measured CCW from +x, in the view's own local frame.
 */
function arcPts(cx, cy, r, a0, a1, steps = 32) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + (a1 - a0) * (i / steps)) * Math.PI) / 180;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// 2D view primitives. Every one carries a LAYER, and the layer is the drawing's whole line
// alphabet — the sheet owns no other vocabulary (RULES.md §3.58: a closed set of weights and dash
// patterns, and nothing added that means what an existing one already means).
//
//   outline   continuous WIDE     — the object's outer SILHOUETTE, and nothing else
//   edge      continuous MEDIUM   — visible geometry INSIDE that silhouette: steps, shoulders,
//                                   hole and slot edges, internal arcs
//   hidden    Type E, dashed narrow  — edges the material conceals
//   centre    Type G, chain thin     — the axis of every circular / symmetrical feature
//
// THE SILHOUETTE / EDGE SPLIT. ISO 128 and BIS SP 46 put visible outlines AND visible edges in one
// type at one width, which is what `graphics_module_1_topic_1_1_dimensioning` draws. This topic
// splits them, deliberately: its whole job is to teach a beginner to read a view, and the first
// thing they have to be able to do is find where the object ENDS before they start interpreting
// what is inside it. Weighting the profile above the internal detail is the emphasis most
// engineering textbooks print, and it is a teaching decision, not the standard itself.
//
// The defaults below carry it, so an author does not have to think about it: a bare `poly()` is a
// silhouette (every view's outer profile is authored as one closed loop), while a bare `line()` or
// `circle()` is internal geometry (a step, a bore, a bolt hole). The one loop that is closed but
// NOT a silhouette — the bearing block's slot — says `'edge'` explicitly.
//
// Construction and projection lines are Type B and are NOT authored: the sheet derives them from
// the views it is laying out, which is the only way they can be guaranteed to meet the views they
// are supposed to project (RULES.md §3.52 — derive an animation's trigger from what it draws).
//
//   { k:'poly',   pts, close }   a polyline / closed outline
//   { k:'line',   a, b }         one segment
//   { k:'circle', c, r }         a full circle
//   { k:'cross',  c, r }         a centre cross for a circular feature (layer is always 'centre')
// ---------------------------------------------------------------------------

const poly = (pts, layer = 'outline', close = true) => ({ k: 'poly', pts, close, layer });
const line = (a, b, layer = 'edge') => ({ k: 'line', a, b, layer });
const circle = (c, r, layer = 'edge') => ({ k: 'circle', c, r, layer });
const cross = (c, r) => ({ k: 'cross', c, r, layer: 'centre' });
const hid = (a, b) => line(a, b, 'hidden');
const ctr = (a, b) => line(a, b, 'centre');

// ---------------------------------------------------------------------------
// Dimensions, in the ALIGNED system (BIS SP 46 Method 1): the value is written parallel to its
// dimension line and above it, readable from the bottom edge or the right-hand edge of the sheet.
// The sheet does the placing; this file only says WHAT is measured and which side it goes.
//
//   dim(a, b, off, text)   a linear dimension between two points of the view, its dimension line
//                          offset `off` mm along the outward normal (sign picks the side)
//   note(at, to, text)     a leader: arrow on the feature at `at`, landing at `to`
// ---------------------------------------------------------------------------

// SIGN OF `off`. The dimension line is offset along the measured direction rotated +90 deg, so a
// dimension read UPWARDS (a below b) offsets to its LEFT at a positive `off` and to its RIGHT at a
// negative one. Getting it backwards puts the dimension line inside the material, which is
// legal-looking and wrong; every value below has been checked against the view it annotates.
//
// LANES. Dimensions stack outward in fixed lanes, one lane per dimension that OVERLAPS another
// along the same direction, so no two dimension lines can ever run into each other. `LANE(n)` is
// the n-th lane out; smallest size innermost, overall size outermost, as the drawing office does
// it, so a detail's extension lines never have to cross an overall dimension line to reach home.
//
// Two consequences of `off` being measured from the dimension's OWN endpoints rather than from the
// view's edge, and both of them are why several calls below read as arithmetic instead of a bare
// lane number:
//   * a dimension taken at a raised datum must add that datum's own height to reach the same
//     VISUAL lane as one taken at the baseline — `-(t + LANE(1))`;
//   * two dimensions that do NOT overlap — consecutive stretches of one line, like a lug and the
//     gap beside it, or two treads of a stair — CHAIN in a single lane, head to head. Stacking
//     those in separate lanes spends a lane saying nothing, and puts the inner one closer to the
//     material than the lane discipline allows.
const LANE = (n) => 12 + (n - 1) * 13;

/**
 * BIS SP 46 Type-B dimension geometry, in millimetres (RULES.md §6.19).
 *
 * Consumed by BOTH renderers — `projectionSheet.js` draws it in SVG on the paper, `dimensions3d.js`
 * draws it as fat lines on the solid. The same standard in two media, so the numbers live once,
 * here, in the pure-data module a leaf is allowed to import (§3.6a).
 */
const TEXT_GAP = 1.0;      // clear air between the dimension line and the value above it
const TEXT_HEIGHT = 4.4;   // the value's own height — `.psheet__value`'s font-size, in sheet mm

export const DIM_STYLE = Object.freeze({
  arrow: 3.2,        // arrowhead length; 3:1 length-to-width, so half-width = length / 6
  extGap: 1.2,       // extension line starts this clear of the outline
  extOver: 2.2,      // and overruns the dimension line by this
  textGap: TEXT_GAP,
  textHeight: TEXT_HEIGHT,
  // The value is anchored on its CENTRE in both renderers (SVG `dominant-baseline: central`,
  // CSS2D's own 0.5/0.5 centre), so the offset from the line has to carry half the text with it.
  textLift: TEXT_GAP + TEXT_HEIGHT / 2,
  leaderLand: 8,     // horizontal landing on a leader
});

/**
 * ALIGNED (BIS SP 46 Method 1) placement for one linear dimension, in the view's own 2-D frame.
 *
 * ONE implementation, because there are TWO renderers. `projectionSheet.js` strokes this on paper
 * and `dimensions3d.js` strokes it on the solid, and a drawing whose value lies along its line in
 * one medium and lies flat in the other is not one drawing — it is two conventions mixed, which is
 * the one thing Method 1 forbids. Everything either renderer needs to place a dimension is decided
 * here; they add their own origin and stroke it.
 *
 * @param {{a:number[], b:number[], off:number}} d  A `dim()` entry, already mirrored if the view is.
 * @returns {{ u:number[], n:number[], s:number, A:number[], B:number[], angle:number, textAt:number[] }}
 *   `u` the measured direction, `n` its +90 deg normal, `s` the sign of the offset, `A`/`B` the
 *   ends of the dimension line, `angle` the degrees the value is turned through, `textAt` its centre.
 */
export function alignedDim(d) {
  const [ax, ay] = d.a;
  const [bx, by] = d.b;
  const span = Math.hypot(bx - ax, by - ay) || 1;
  const u = [(bx - ax) / span, (by - ay) / span];
  const n = [-u[1], u[0]];
  const s = Math.sign(d.off) || 1;
  const o = Math.abs(d.off);

  const A = [ax + n[0] * s * o, ay + n[1] * s * o];
  const B = [bx + n[0] * s * o, by + n[1] * s * o];

  // Fold the reading direction into (-90, 90] so every value reads from the BOTTOM edge of the
  // sheet, or from the RIGHT-hand edge where its line is vertical. That fold IS "aligned"; without
  // it a dimension measured leftwards or downwards prints upside down.
  let angle = (Math.atan2(u[1], u[0]) * 180) / Math.PI;
  let flip = false;
  if (angle > 90) { angle -= 180; flip = true; } else if (angle <= -90) { angle += 180; flip = true; }

  // "Above the dimension line" means above AS READ, so the lift follows the normal of the FOLDED
  // direction — re-reading a dimension from the other end moves its value to the other side of the
  // line. Lifting along the raw normal instead prints half the sheet's values UNDER their own line.
  const lift = flip ? [-n[0], -n[1]] : n;
  return {
    u,
    n,
    s,
    A,
    B,
    angle,
    textAt: [
      (A[0] + B[0]) / 2 + lift[0] * DIM_STYLE.textLift,
      (A[1] + B[1]) / 2 + lift[1] * DIM_STYLE.textLift,
    ],
  };
}

const dim = (a, b, off, text) => ({ k: 'dim', a, b, off, text });
const note = (at, to, text) => ({ k: 'note', at, to, text });

/** A circle is only a circle if all of it is there. Anything short of that is an arc. */
const FULL_TURN = 360;
const SWEEP_TOLERANCE = 0.5;
const fmt = (v) => String(Math.round(v * 10) / 10);

/**
 * Ø OR R, ON A LEADER WITH A HORIZONTAL SHELF — ONE SHAPE OF MARK FOR BOTH.
 *
 * WHICH SYMBOL is decided from the geometry, never typed. The rule (BIS SP 46 / ISO 129-1) is not
 * about what the feature IS, it is about what this view DRAWS: a complete circle is a diameter,
 * anything less is an arc and takes a radius. So the sweep the view actually shows is an argument,
 * and the symbol falls out of it — a size cannot be labelled Ø by habit while the paper shows two
 * arcs and a pair of straight edges.
 *
 * The plan of the Cylindrical Block is exactly that case and was exactly that bug. The boss is a
 * 50 mm cylinder, so it was labelled Ø50; but the plate under it is only 40 deep, so the plan trims
 * the circle to the two arcs that stand proud of the plate's edges — 148 deg of it — and 148 deg of
 * circle is an arc. It is R25, and its leader has to land on an arc that is actually drawn.
 *
 * HOW IT IS DRAWN. Both marks end the same way — a slanting leg out to clear paper, a short
 * horizontal shelf, the value level above the shelf — and they differ at the feature end, which is
 * where the difference belongs.
 *
 * A DIAMETER's line PASSES THROUGH THE CENTRE. It starts at the far side of the circle, crosses the
 * centre, and carries on out to the elbow, with an arrowhead at each end of the diameter itself
 * pointing outwards. That is the hybrid form: the line states the measurement (a full width, taken
 * through the middle) while the shelf keeps the value out on clear paper, off the feature the
 * learner is being asked to look at. The value is NOT written at the midpoint of the line, which is
 * the centre of the hole.
 *
 * A RADIUS's line starts ON THE ARC and does not reach the centre — a radius is measured from the
 * centre to the curve, and drawing it across the middle would say diameter.
 *
 * Both legs run along the feature's own radius, so the diameter's line passes through the centre by
 * construction and the radius's arrow lands on its arc by construction, rather than by the author's
 * arithmetic.
 *
 * @param {number[]} c      centre, in the view's own frame
 * @param {number} r        radius, mm
 * @param {number} sweep    how much of the circle THIS VIEW draws, in degrees
 * @param {number} ang      the direction the leader leaves the centre, degrees CCW from +x. For a
 *                          radius it must point along a drawn arc, so the arrow touches one.
 * @param {number} out      how far out the elbow sits, from the centre. The author's one job: put
 *                          the shelf and its value on clear paper, outside the object.
 */
const roundDim = (c, r, sweep, ang, out) => {
  const full = Math.abs(sweep) >= FULL_TURN - SWEEP_TOLERANCE;
  const a = (ang * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const along = (t) => [c[0] + u[0] * t, c[1] + u[1] * t];
  // `at` is where the line STARTS and carries its first arrowhead; `to` is the elbow the shelf
  // grows from. A diameter starts at the far side and so spans the whole width through the centre;
  // a radius starts on the arc. `head2` is the diameter's second arrowhead, on the near side.
  const d = note(along(full ? -r : r), along(out), full ? `Ø${fmt(2 * r)}` : `R${fmt(r)}`);
  return full ? { ...d, k: 'dia', head2: along(r) } : d;
};

/**
 * Ø ON A VIEW THAT DRAWS NO CIRCLE AT ALL — a cylinder measured ACROSS its axis.
 *
 * The third form of the mark, and the one `roundDim()` cannot reach. An elevation looking along a
 * boss's side draws two straight silhouette lines and no arc whatever, so there is no sweep to
 * choose from; but the size between those two lines IS a diameter, and BIS SP 46 / ISO 129-1 say so
 * with a plain linear dimension carrying the Ø prefix. That is what the textbook prints across the
 * top of the Cylindrical Block's boss, and reading it is how a learner discovers that the flat
 * rectangle in the elevation is the same round thing they just saw in the plan.
 *
 * It is a `dim()`, so both renderers place it in the aligned system with nothing added. What it is
 * NOT is a licence to type the symbol: the radius is the argument and the number is derived from
 * it, exactly as in `roundDim()`. `r` is also carried on the entry so the oracle can check the
 * measured span really is 2r rather than trusting the string (RULES.md §6.36).
 *
 * @param {number[]} a  one silhouette line, at the height the dimension is taken
 * @param {number[]} b  the other, 2r away
 * @param {number} off  lane offset, same sign convention as `dim()`
 * @param {number} r    the cylinder's radius
 */
const acrossDia = (a, b, off, r) => ({ ...dim(a, b, off, `Ø${fmt(2 * r)}`), dia: r });

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} EngObject
 * @property {string} id
 * @property {string} name        Human title, as the chapter prints it.
 * @property {string} figure      The textbook figure this is taken from.
 * @property {string} blurb       One sentence for the Step-1 picker.
 * @property {'left'|'right'} sideView  WHICH side view this object's drawing carries.
 * @property {{L:number,D:number,H:number}} size  Overall enclosing box, mm.
 * @property {object[]} parts     3D geometry specs.
 * @property {{front:object[],top:object[],side:object[]}} views  Layered 2D linework.
 * @property {{front:object[],top:object[],side:object[]}} dims   Aligned dimensions per view.
 * @property {Record<string,string>} viewNotes  Step-1 copy per camera direction.
 */

// ===========================================================================
// 1. Stepped Block — Fig. 19.27, page 255 (exercise 04).
//    Wholly planar: no curve, no circle, no centre line. It exists so the learner meets the
//    THREE-VIEW LAYOUT with nothing else going on, and it is the object whose two side views
//    DISAGREE — from the left every step edge is visible, from the right the full-height wall
//    conceals all three. That is the cheapest demonstration in the topic that a view is a
//    statement about a DIRECTION, and it is why this object authors both side views (see
//    `views.sideFlip` below) instead of letting the sheet mirror one into the other.
// ===========================================================================

const BLOCK = (() => {
  const L = 120; const D = 90; const H = 64;
  const slab = 16;          // the base the whole part stands on
  const rise = 16;          // every riser — the figure states the three of them as "3 x 16"
  const tread = 30;         // every tread, and 3 x 30 is the whole depth
  const wall = 20;          // the full-height wall along the right-hand end
  const hx = L / 2; const hz = D / 2;
  const xW = hx - wall;              // 40 — the wall's inner face
  const z1 = hz - tread;             // 15 — the front tread's back edge
  const z2 = hz - 2 * tread;         // -15 — the middle tread's back edge
  const y1 = slab + rise;            // 32 — the middle tread's top
  const y2 = slab + 2 * rise;        // 48 — the back tread's top

  /**
   * The two steps that stand ON the slab, as a profile in the ZY plane. `+z` is toward the front
   * observer, so the profile climbs as it runs BACKWARDS, which is what the figure draws.
   */
  const steps = [
    [-hz, slab], [z1, slab], [z1, y1], [z2, y1], [z2, y2], [-hz, y2],
  ];

  return {
    id: 'block',
    name: 'Stepped Block',
    figure: 'Fig. 19.27',
    blurb: 'Three steps climbing to the back, with a full-height wall along one end.',
    sideView: 'left',
    size: { L, D, H },
    parts: [
      // THREE extrusions, and the split is chosen so that every seam between them falls on an
      // edge the part really has. A staircase modelled as stacked slabs puts a coincident pair
      // inside the material at every tread (RULES.md §3.29) and grows a line across the front face
      // for each one; cutting the wall down to the ground instead grows one down the front face at
      // x = 40, where the slab is in fact continuous. Slab first, then the two steps that stand on
      // it, then the wall beside them — the boundary of every one of those faces is a real corner,
      // so `EdgesGeometry` draws nothing the drawing does not.
      { k: 'extrude', axis: 'y', from: 0, to: slab, outline: rect(-hx, -hz, hx, hz) },
      { k: 'extrude', axis: 'x', from: -hx, to: xW, outline: steps },
      { k: 'extrude', axis: 'x', from: xW, to: hx, outline: rect(-hz, slab, hz, H) },
    ],
    views: {
      front: [
        // The SILHOUETTE reaches 48 over the stepped part, not 16: the back tread stands that
        // high, and a silhouette is the outline of everything that projects, not of the nearest
        // face. Only the wall's 20 mm carries on up to 64.
        poly([[-hx, 0], [hx, 0], [hx, H], [xW, H], [xW, y2], [-hx, y2]]),
        // The risers face the observer, so their top edges are VISIBLE, not hidden: at each of
        // them the only material further forward is the step below, which is lower down.
        line([-hx, slab], [xW, slab]),
        line([-hx, y1], [xW, y1]),
        // The wall's inner face, exposed alongside the steps for the whole of their height.
        line([xW, slab], [xW, y2]),
      ],
      top: [
        poly(rect(-hx, -hz, hx, hz)),
        line([xW, -hz], [xW, hz]),    // the wall's inner face, seen from above
        line([-hx, -z1], [xW, -z1]),  // the two treads. Plan frame: local y = -world z.
        line([-hx, -z2], [xW, -z2]),
      ],
      side: [
        // LEFT side view (local x = world z). The stair's own end face is the nearest thing to
        // this observer, so its whole profile is drawn solid inside the wall's silhouette.
        poly(rect(-hz, 0, hz, H)),
        line([z1, slab], [hz, slab]),
        line([z1, slab], [z1, y1]),
        line([z2, y1], [z1, y1]),
        line([z2, y1], [z2, y2]),
        line([-hz, y2], [z2, y2]),
      ],
      sideFlip: [
        // RIGHT side view (local x = -world z), authored in its OWN frame rather than mirrored.
        // Same silhouette, every line dashed: from this side the wall stands between the observer
        // and the whole stair. No reflection of a solid line can produce this view.
        poly(rect(-hz, 0, hz, H)),
        hid([-z1, slab], [-hz, slab]),
        hid([-z1, slab], [-z1, y1]),
        hid([-z2, y1], [-z1, y1]),
        hid([-z2, y1], [-z2, y2]),
        hid([hz, y2], [-z2, y2]),
      ],
    },
    dims: {
      front: [
        dim([-hx, 0], [hx, 0], -LANE(2), '120'),       // overall length, outermost lane
        dim([-hx, 0], [xW, 0], -LANE(1), '100'),       // the stepped part; the wall is the balance
        // The slab and the two risers CHAIN up the left-hand edge, head to head — three equal
        // stretches of one line, which is the figure's own "3 x 16" written the long way.
        dim([-hx, 0], [-hx, slab], LANE(1), '16'),
        dim([-hx, slab], [-hx, y1], LANE(1), '16'),
        dim([-hx, y1], [-hx, y2], LANE(1), '16'),
        dim([hx, 0], [hx, H], -LANE(1), '64'),         // overall height
      ],
      top: [
        dim([hx, -hz], [hx, hz], -LANE(1), '90'),      // overall depth
        // Two treads chain up the left edge; the third is the balance of the 90, which is exactly
        // how the figure dimensions them.
        dim([-hx, -hz], [-hx, -z1], LANE(1), '30'),
        dim([-hx, -z1], [-hx, -z2], LANE(1), '30'),
      ],
      // The overall height is given ONCE, on the elevation that shows the steps producing it.
      side: [dim([-hz, 0], [hz, 0], -LANE(1), '90')],
    },
    viewNotes: {
      front: 'You are standing in front of the block, looking straight at it. The tall wall on the '
        + 'right runs the whole way back. The two lines across the low part are the fronts of the '
        + 'steps behind it — you can see them, so they are solid.',
      top: 'You are above the block, looking straight down. This view shows how LONG it is and how '
        + 'DEEP it is, and the three steps split the depth into three equal strips of 30 mm.',
      left: 'From this side you are looking straight at the staircase and nothing is in the way, '
        + 'so every step edge is drawn as a solid line.',
      right: 'From this side the tall wall is in the way, so you cannot see the steps at all. They '
        + 'are still there, so on the drawing they are shown with dashes.',
    },
  };
})();

// ===========================================================================
// 2. Cylindrical Block — Fig. 19.20, page 252 (Example 19.4).
//    A FORKED plate wrapped round a bored column. It introduces the circle, the centre line and
//    the hidden line; each end of the plate is slotted, which is a shape only the plan can show.
//
//    THE COLUMN GOES TO THE BENCH (ADR-227, RULES.md §6.40). It is NOT a boss standing on the
//    plate's top face — it is Ø50 for its whole 40 mm, and the 100 x 40 x 12 plate is merged onto
//    it. Because the column is 50 across and the plate only 40 deep, the plate stops dead against
//    the column at x = ±sqrt(25² − 20²) = ±15 and the two are one solid from there in. All three
//    printed views say so, and each of the three says it differently:
//      * the ELEVATION runs the plate's top face INBOARD of the column's silhouette, as far as
//        ±15, and drops a solid line from there to the bench — the plate's own front face ending
//        against the column. A column that stood ON the plate would leave that face an unbroken
//        100 x 12 rectangle with nothing drawn on it.
//      * the RIGHT SIDE VIEW is a plain 50 x 40 rectangle. Measured off the page: the outline is
//        the full 50 at every height, with the 40 deep plate drawn INSIDE it as a 40 x 12 panel
//        split 12 | 16 | 12 by the prongs. A seated boss would step in to 40 below y = 12.
//      * the PLAN draws the Ø50 circle COMPLETE, with the plate's edges running in and stopping on
//        it. A seated boss shows only the two arcs that stand proud of the plate.
// ===========================================================================

const CYLBLOCK = (() => {
  const L = 100; const D = 40; const t = 12;
  const rB = 25;            // column radius (dia 50), the same all the way to the bench
  const rH = 15;            // bore radius   (dia 30)
  const H = 40;             // overall height
  const bore = 18;          // bore depth from the top face
  const yFloor = H - bore;  // 22
  const slotD = 18;         // how far the slot cuts into each end, along the length
  const slotW = 16;         // the slot across the depth — 40 less a 12 mm prong each side
  const hx = L / 2; const hz = D / 2; const hs = slotW / 2;
  const xS = hx - slotD;    // 32 — where the slot bottoms out. Clear of the boss at 25.
  // Where the boss circle crosses the plate's edges: sqrt(25^2 - 20^2) = 15.
  const xC = Math.sqrt(rB * rB - hz * hz);
  const aC = (Math.atan2(hz, xC) * 180) / Math.PI;   // 53.13 deg

  /** Arc steps on the two bites. Fine enough that the chord error against the lathe's own facets
   *  is a hundredth of a millimetre — far inside a pixel at any zoom this topic offers. */
  const BITE = 48;

  /**
   * THE PLATE, SEEN FROM ABOVE, IN TWO HALVES — because that is what it is.
   *
   * The union of a plate and a column is not two overlapping volumes stacked on each other; it is
   * the column, plus whatever of the plate the column does not already occupy. The column is 50
   * across and the plate 40 deep, so at |x| < 15 the column takes the plate's ENTIRE width and
   * nothing of the plate survives. The plate is therefore two separate pieces, each ending in a
   * circular bite, and the solid needs no boolean to say so: the bite is an arc of a circle whose
   * radius is known, so it is authored exactly (ADR-227). Mesh CSG would compute the same curve
   * less precisely and add a second geometry system to do it.
   *
   * Each half is walked once round: outer edge, into that end's slot and out, back along the other
   * edge, then the bite. The same loops are the plan's skeleton, so the solid and the drawing
   * cannot disagree about either the fork or the junction.
   */
  const plateL = [
    [-hx, -hz], [-xC, -hz],
    ...arcPts(0, 0, rB, 180 + aC, 180 - aC, BITE).slice(1),
    [-hx, hz], [-hx, hs], [-xS, hs], [-xS, -hs], [-hx, -hs],
  ];
  const plateR = [
    [xC, -hz], [hx, -hz], [hx, -hs], [xS, -hs], [xS, hs], [hx, hs], [hx, hz], [xC, hz],
    ...arcPts(0, 0, rB, aC, -aC, BITE).slice(1, -1),
  ];

  return {
    id: 'cylblock',
    name: 'Cylindrical Block',
    figure: 'Fig. 19.20',
    blurb: 'A forked plate with a round tower on top. The tower has a hole that does not go all the way through.',
    sideView: 'right',
    size: { L, D: 2 * rB, H },
    parts: [
      // The column is a LATHE, not an extrusion with a hole: the bore is blind, and a blind pocket
      // has a floor. Its profile starts and ends on the axis, so the revolved surface is closed —
      // and it starts at y = 0, on the bench, which is the whole correction of ADR-227. It used to
      // start at y = t, which made this a boss parked on a plate.
      { k: 'lathe', at: [0, 0], profile: [[0, 0], [rB, 0], [rB, H], [rH, H], [rH, yFloor], [0, yFloor]] },
      { k: 'extrude', axis: 'y', from: 0, to: t, outline: plateL },
      { k: 'extrude', axis: 'y', from: 0, to: t, outline: plateR },
    ],
    views: {
      front: [
        // The SILHOUETTE is unchanged by the correction: below y = 12 the plate is the widest
        // thing at ±50, above it the column at ±25. What changes is everything inside it.
        poly([[-hx, 0], [hx, 0], [hx, t], [rB, t], [rB, H], [-rB, H], [-rB, t], [-hx, t]]),
        // THE JUNCTION, and the pair of lines that prove the column is not sitting on the plate.
        // The plate's top face does not stop where the column's silhouette crosses it — the column
        // is round, so the top face carries on behind it and is still in plain view out to ±15,
        // where the column finally takes the plate's whole 40 mm of depth. There the plate's front
        // face ENDS, square, against the column: a solid line down to the bench.
        line([-rB, t], [-xC, t]),
        line([xC, t], [rB, t]),
        line([-xC, 0], [-xC, t]),
        line([xC, 0], [xC, t]),
        hid([-rH, H], [-rH, yFloor]),
        hid([rH, H], [rH, yFloor]),
        hid([-rH, yFloor], [rH, yFloor]),   // the floor of the blind bore
        // Each slot's end wall, concealed by the prong standing in front of it.
        hid([-xS, 0], [-xS, t]),
        hid([xS, 0], [xS, t]),
        ctr([0, -6], [0, H + 8]),
      ],
      top: [
        // The column is 50 across and the plate 40 deep, so the outline is the plate's edges run
        // in to ±15 and the two arcs that stand PROUD of them — and the two ends are the fork,
        // taken straight from the half-plate loops above.
        poly([
          [-hx, -hz], [-xC, -hz],
          ...arcPts(0, 0, rB, 180 + aC, 360 - aC),
          [xC, -hz], [hx, -hz], [hx, -hs], [xS, -hs], [xS, hs], [hx, hs],
          [hx, hz], [xC, hz],
          ...arcPts(0, 0, rB, aC, 180 - aC),
          [-xC, hz], [-hx, hz], [-hx, hs], [-xS, hs], [-xS, -hs], [-hx, -hs],
        ]),
        // THE REST OF THE CIRCLE, which the plan prints and which used to be missing. Between ±15
        // and ±25 the column's wall stands up out of the plate's TOP FACE rather than out of clear
        // paper, so those two arcs are visible edges INSIDE the silhouette rather than part of it.
        // With them the plan draws the whole 360°, which is what the figure shows — and which is
        // why the R25 that used to be noted here is gone: a complete circle is a diameter, and the
        // diameter is already stated once, on the elevation.
        poly(arcPts(0, 0, rB, 180 - aC, 180 + aC), 'edge', false),
        poly(arcPts(0, 0, rB, -aC, aC), 'edge', false),
        circle([0, 0], rH),
        cross([0, 0], rB + 6),
      ],
      side: [
        // A PLAIN RECTANGLE, 50 wide by 40 high. Looking along the length there is no step at all:
        // the column is the widest thing at every height, and the plate — narrower, at 40 — is
        // drawn INSIDE it. Getting this wrong is what a seated boss looks like on paper, and it is
        // the cheapest of the three views to check the correction against.
        poly(rect(-rB, 0, rB, H)),
        // The plate, nested: its two long faces seen edge-on, and its top face across them.
        line([-hz, 0], [-hz, t]),
        line([hz, 0], [hz, t]),
        line([-hz, t], [hz, t]),
        hid([-rH, H], [-rH, yFloor]),
        hid([rH, H], [rH, yFloor]),
        hid([-rH, yFloor], [rH, yFloor]),
        // The near slot's two side walls run ALONG the line of sight, so they come to the paper as
        // a pair of lines splitting the plate 12 | 16 | 12 — and they are visible, because this is
        // the end the slot opens out of. The far slot's walls fall on the same two lines.
        line([-hs, 0], [-hs, t]),
        line([hs, 0], [hs, t]),
        ctr([0, -6], [0, H + 8]),
      ],
    },
    dims: {
      front: [
        dim([-hx, 0], [hx, 0], -LANE(1), '100'),       // overall length
        dim([-hx, t], [-hx, 0], -LANE(1), '12'),       // plate thickness
        dim([hx, 0], [hx, H], -LANE(1), '40'),         // overall height
        // Measured off the BORE, but its dimension line is thrown clear of the boss it is sunk in.
        dim([rH, yFloor], [rH, H], -(rB - rH) - LANE(1), '18'),
        // The column is a cylinder seen along its side here — two straight lines and no arc at
        // all — so the size across it is a DIAMETER stated on a linear dimension. This is where
        // the figure prints it, and it is the only place it is stated: the plan draws the whole
        // circle and could carry it too, but a size is given ONCE, on the view the figure chose.
        acrossDia([-rB, H], [rB, H], LANE(1), rB),
      ],
      top: [
        dim([hx, -hz], [hx, hz], -LANE(2), '40'),      // overall depth, outside the prongs
        // The two prongs, in the lane inside the overall depth — smallest size innermost.
        dim([hx, -hz], [hx, -hs], -LANE(1), '12'),
        dim([hx, hs], [hx, hz], -LANE(1), '12'),
        dim([-hx, -hz], [-xS, -hz], -LANE(1), '18'),   // how deep the slot cuts in
        // The bore IS a complete circle in the plan, so it is a diameter through its centre.
        roundDim([0, 0], rH, 360, -45, rB + 14),
        // NOTHING ON THE COLUMN HERE. It used to carry R25, on the reading that the plan drew only
        // the two arcs standing proud of the plate — 148 deg, and 148 deg of circle is an arc. The
        // plan draws all 360 (see `views.top`), so that was the wrong symbol taken from the wrong
        // fact; and the diameter it should have been is already on the elevation, where the figure
        // puts it. ADR-218 chooses Ø or R from the sweep and still does; what was wrong was the
        // sweep, not the rule (ADR-227).
      ],
      side: [dim([-hz, 0], [hz, 0], -LANE(1), '40')],  // depth again, on the view it is read from
    },
    viewNotes: {
      front: 'Straight at the front. The round tower looks like a plain rectangle from here — you '
        + 'cannot tell it is round. The dashes down the middle are the hole inside it, and they '
        + 'stop partway down, because the hole does not go all the way through. The tower is not '
        + 'standing ON the plate: it runs all the way down to the bench, and the plate is wrapped '
        + 'round it. That is what the two short upright lines low down are — the plate ending '
        + 'against the tower.',
      top: 'From above. Now you can see that the tower IS round, that it is wider than the plate '
        + 'is deep so it bulges out at the front and the back, and that each end of the plate is '
        + 'forked. The front view told you none of the three.',
      left: 'From this side. The block is the same on both sides, so this looks exactly like the '
        + 'view from the right. That is why a drawing only ever needs one of the two.',
      right: 'From this side the whole outline is one plain rectangle, because the tower is the '
        + 'widest thing all the way up. The plate is drawn INSIDE it — 40 mm deep, which is the '
        + 'one size the front view cannot show you — and you are looking straight into the slot, '
        + 'so the plate reads as two prongs with a gap between them.',
    },
  };
})();

// ===========================================================================
// 3. Shaft Support — Fig. 19.21, page 253 (Example 19.5).
//    A base plate with two bolt holes, carrying a bored lug with a round head. The bored lug's
//    hole runs ALONG the line of sight of the side view, so the same feature is a circle in one
//    view and a pair of dashed lines in the other two. That contrast is the point of the object.
//
//    THE ONLY BLENDED PART IN THE TOPIC (ADR-226, RULES.md §6.39). The figure prints R6 twice on
//    its elevation, with leaders: once into the root of the lug, where the casting is filleted on
//    BOTH flanks, and once onto the top corner of the base, which is rounded at both ends. All
//    four run the full 40 mm depth, so all four are arcs in the ELEVATION profile — and that is
//    what decides how the solid is cut up below. The other three objects are square everywhere;
//    checked figure by figure, 2026-08-18, and nothing was found on any of them.
// ===========================================================================

const SHAFTSUP = (() => {
  const L = 100; const D = 40; const t = 20;
  const relief = 8;         // the underside is relieved by this between the two feet
  const foot = 12;          // and each foot is this long, so the part stands on its two ends
  const lugT = 20;          // lug thickness, along x
  const yTop = 44;          // where the lug's flat sides end and the round head begins: 20 + 24
  // The figure's R12 leader points at the BORE, not at the head — an R12 head around a dia 24
  // hole would leave no metal at all. The head's own radius is not printed and does not need to
  // be: the left side view draws its arc TANGENT to the lug's two 40 mm faces, so it is half the
  // depth and nothing else will close. Derived, therefore, not chosen — it used to carry the
  // `// chosen` flag, which is the same claim ADR-221 caught this file making falsely twice.
  const R = D / 2;          // 20 — round head, tangent to both faces
  const rHole = 12;         // dia 24 bore through the lug
  const rBolt = 6;          // dia 12 bolt holes — the figure prints R6 against one of them
  const xBolt = 30;
  const rFil = 6;           // the figure's R6, at the lug root and on the base's top corners
  const H = yTop + R;       // 64 overall
  const hx = L / 2; const hz = D / 2; const hl = lugT / 2;
  const xF = hx - foot;     // 38 — where the relief starts, inboard of each foot
  // Where the four R6 blends leave the flats they are tangent to. A round eats into the base's
  // top face and its end face; a fillet grows out of the base's top face and the lug's flank.
  const xR = hx - rFil;     // 44 — round, tangent on the top face
  const yR = t - rFil;      // 14 — round, tangent on the end face
  const xFil = hl + rFil;   // 16 — fillet, tangent on the top face
  const yFil = t + rFil;    // 26 — fillet, tangent on the lug's flank

  return {
    id: 'shaftsupport',
    name: 'Shaft Support',
    figure: 'Fig. 19.21',
    blurb: 'A tall wall standing on a footed base plate. The wall has a big hole; the base has two small ones.',
    sideView: 'left',
    size: { L, D, H },
    parts: [
      // HOW THE R6 BLENDS AND THE BOLT HOLES SHARE ONE SOLID.
      //
      // The two kinds push a profile along one axis, so a feature is buildable exactly when it is
      // prismatic along an axis — and this part has features that disagree about which. The rounds
      // and the fillets run the full DEPTH, so they are arcs in an elevation profile pushed along
      // z; the bolt holes are drilled DOWNWARDS, so they are holes in a plan profile pushed along
      // y. Neither piece can carry the other's feature.
      //
      // They never have to. The rounds live in x = 44..50 at each end and the bolt holes in
      // x = 24..36, so the two occupy DISJOINT stretches of the length and the part splits cleanly
      // between them. Every seam below therefore falls on a plane where both sides are flat, which
      // is what makes each of them a butt joint on a shared face rather than the overlapping
      // volumes RULES.md §3.29 forbids. Reading down: the two rounded end caps, the two feet, the
      // bolted plate between them, the two root fillets, then the lug.
      { k: 'extrude', axis: 'z', from: -hz, to: hz,
        outline: [[-hx, 0], [-xR, 0], [-xR, t], ...arcPts(-xR, yR, rFil, 90, 180).slice(1)] },
      { k: 'extrude', axis: 'z', from: -hz, to: hz,
        outline: [[xR, 0], [hx, 0], [hx, yR], ...arcPts(xR, yR, rFil, 0, 90).slice(1)] },
      // The base is a plate on two FEET: the casting only touches its seating at the two ends, and
      // the 8 mm between them is relieved — and the bolt holes are drilled through the plate above
      // the relief, where there was never any metal underneath them to drill through.
      { k: 'extrude', axis: 'y', from: 0, to: relief, outline: rect(-xR, -hz, -xF, hz) },
      { k: 'extrude', axis: 'y', from: 0, to: relief, outline: rect(xF, -hz, xR, hz) },
      {
        k: 'extrude', axis: 'y', from: relief, to: t,
        outline: rect(-xR, -hz, xR, hz),
        holes: [circleLoop(-xBolt, 0, rBolt), circleLoop(xBolt, 0, rBolt)],
      },
      // A fillet is the corner of a square MINUS a quarter disc, and the disc's centre sits out in
      // the air at (±16, 26) — off the metal, which is what makes the surface concave. The two are
      // mirror images, so their arcs run opposite ways round: the left one from the lug's flank
      // down to the base, the right one from the base up to the flank.
      { k: 'extrude', axis: 'z', from: -hz, to: hz,
        outline: [[-xFil, t], [-hl, t], ...arcPts(-xFil, yFil, rFil, 0, -90).slice(0, -1)] },
      { k: 'extrude', axis: 'z', from: -hz, to: hz,
        outline: [[hl, t], [xFil, t], ...arcPts(xFil, yFil, rFil, -90, -180).slice(1)] },
      {
        // Profile authored in the ZY plane and extruded along x — the lug is a plate standing on
        // edge, and its round head is part of the profile, not a separate piece.
        k: 'extrude', axis: 'x', from: -hl, to: hl,
        outline: [[-hz, t], [hz, t], [hz, yTop], ...arcPts(0, yTop, R, 0, 180), [-hz, yTop]],
        holes: [circleLoop(0, yTop, rHole)],
      },
    ],
    views: {
      front: [
        // The one view any of the four R6 blends reaches. Walked once round, anticlockwise from
        // the bottom left: the stepped underside the casting stands on, up the right end and over
        // its round, in along the base's top face to the right-hand fillet, up the lug and across
        // its top, down the far flank into the left-hand fillet, back along the top face and over
        // the left round. Six of those eight corners used to be square.
        poly([
          [-hx, 0], [-xF, 0], [-xF, relief], [xF, relief], [xF, 0], [hx, 0],
          [hx, yR], ...arcPts(xR, yR, rFil, 0, 90).slice(1),
          [xFil, t], ...arcPts(xFil, yFil, rFil, -90, -180).slice(1),
          [hl, H], [-hl, H],
          [-hl, yFil], ...arcPts(-xFil, yFil, rFil, 0, -90).slice(1),
          [-xR, t], ...arcPts(-xR, yR, rFil, 90, 180).slice(1),
        ]),
        hid([-hl, yTop - rHole], [hl, yTop - rHole]),
        hid([-hl, yTop + rHole], [hl, yTop + rHole]),
        hid([-xBolt - rBolt, relief], [-xBolt - rBolt, t]),
        hid([-xBolt + rBolt, relief], [-xBolt + rBolt, t]),
        hid([xBolt - rBolt, relief], [xBolt - rBolt, t]),
        hid([xBolt + rBolt, relief], [xBolt + rBolt, t]),
        ctr([0, -6], [0, H + 8]),
        ctr([-hl - 8, yTop], [hl + 8, yTop]),
        ctr([-xBolt, relief - 5], [-xBolt, t + 5]),
        ctr([xBolt, relief - 5], [xBolt, t + 5]),
      ],
      top: [
        poly(rect(-hx, -hz, hx, hz)),
        line([-hl, -hz], [-hl, hz]),
        line([hl, -hz], [hl, hz]),
        circle([-xBolt, 0], rBolt),
        circle([xBolt, 0], rBolt),
        hid([-hl, -rHole], [hl, -rHole]),
        hid([-hl, rHole], [hl, rHole]),
        // The relief is cut in the UNDERSIDE, so from above it is two concealed edges.
        hid([-xF, -hz], [-xF, hz]),
        hid([xF, -hz], [xF, hz]),
        cross([-xBolt, 0], rBolt + 6),
        cross([xBolt, 0], rBolt + 6),
        ctr([0, -hz - 6], [0, hz + 6]),
      ],
      side: [
        poly([[-hz, 0], [hz, 0], [hz, yTop], ...arcPts(0, yTop, R, 0, 180), [-hz, yTop]]),
        circle([0, yTop], rHole),
        hid([-rBolt, relief], [-rBolt, t]),
        hid([rBolt, relief], [rBolt, t]),
        hid([-hz, relief], [hz, relief]),   // the relief, behind the foot nearest this observer
        line([-hz, t], [hz, t]),            // the top face of the plate, either side of the lug
        cross([0, yTop], R + 6),
        ctr([0, relief - 6], [0, t + 6]),
      ],
    },
    dims: {
      front: [
        // Smallest size innermost, overall size outermost — so the bolt position takes lane 1 and
        // the overall length lane 2 behind it. The other way round, its extension lines have to
        // cross the overall dimension line to reach their own, which is the one crossing the lane
        // discipline exists to prevent. It is measured at the plate's TOP face, so its offset
        // carries that datum down to the baseline before it goes out to the lane.
        //
        // FROM THE END, not between the two centres. This used to state the 60 mm pitch, which is
        // the same hole in a different sentence; the figure locates the bolt from the end of the
        // casting, dimensions ONE of the pair and lets the part's symmetry carry the other.
        dim([-hx, t], [-xBolt, t], -(t + LANE(1)), '20'),
        dim([-hx, 0], [hx, 0], -LANE(2), '100'),       // overall length
        dim([hx, 0], [hx, H], -LANE(1), '64'),         // overall height
        // THE TWO R6 NOTES, one per KIND of blend, exactly as the figure prints them — a fillet is
        // not a round and a drawing that shows only one of the two has not said the part is
        // blended at both. Both are arcs, so both are R, and `roundDim` derives that from the 90
        // deg each of them sweeps rather than being told.
        //
        // BOTH LEADERS LEAVE TO THE LEFT, and the fillet's `out` is NEGATIVE to do it. A leader has
        // to touch the arc it names, so its ray is pinned to the 90 deg the arc occupies; on a
        // CONCAVE fillet every one of those directions runs from the centre INTO the metal, and
        // only the far end of the ray reaches clear paper. The round is convex and needs no such
        // trick — it is on the left end because the right one is where the overall height's
        // dimension line stands, and a leader that crosses a dimension line is a leader in the
        // wrong place.
        roundDim([-xFil, yFil], rFil, 90, -45, -(rFil + 22)),
        roundDim([-xR, yR], rFil, 90, 135, rFil + 22),
      ],
      top: [
        dim([hx, -hz], [hx, hz], -LANE(1), '40'),      // overall depth
        // The length chain the figure prints on its plan: foot, then the run in to the lug, then
        // the lug itself, then the far foot. Four consecutive stretches of one line, so they CHAIN
        // in a single lane rather than stacking four lanes deep.
        dim([-hx, -hz], [-xF, -hz], -LANE(1), '12'),
        dim([-xF, -hz], [-hl, -hz], -LANE(1), '28'),
        dim([-hl, -hz], [hl, -hz], -LANE(1), '20'),
        dim([xF, -hz], [hx, -hz], -LANE(1), '12'),
        // Down and out, not up: above the plan is where the elevation's own 100 lives.
        roundDim([-xBolt, 0], rBolt, 360, -135, 34),   // a complete circle in the plan
      ],
      side: [
        dim([-hz, 0], [hz, 0], -LANE(1), '40'),        // depth
        // Plate and the run up to the bore chain head to head up the left-hand edge, which is how
        // the figure gives the bore's height: 20 of plate, then 24 more.
        dim([-hz, 0], [-hz, t], LANE(1), '20'),
        dim([-hz, t], [-hz, yTop], LANE(1), '24'),
        dim([hz, 0], [hz, relief], -LANE(1), '8'),     // the relief, on the clear side
        roundDim([0, yTop], rHole, 360, 45, R + 16),   // the bore, seen square-on: a full circle
        roundDim([0, yTop], R, 180, 135, R + 12),      // the head is a semicircle, so R
      ],
    },
    viewNotes: {
      front: 'Straight at the front. The wall is only 20 mm thick, so from here it is a narrow '
        + 'strip. You are looking ACROSS its big hole, so the hole is just two dashed lines. Look '
        + 'at the bottom edge: the casting only touches the bench at its two ends. This is also '
        + 'the only view that shows the four R6 curves — the two where the wall grows out of the '
        + 'base, and one on each top corner. From above or from the side they face you edge-on.',
      top: 'From above. The two small holes in the base are proper circles here. The big hole in '
        + 'the wall is still only dashes, because you are still looking across it, and the two '
        + 'dashed lines near the ends are where the underside is cut away.',
      left: 'From this side you are looking straight THROUGH the big hole, so at last it is drawn '
        + 'as a circle, and the top of the wall shows its true round shape.',
      right: 'From this side. The part is the same on both sides, so this repeats the view from '
        + 'the left. A drawing gives whichever one the question asks for.',
    },
  };
})();

// ===========================================================================
// 4. Bearing Block — Fig. 19.22, page 253 (Example 19.6).
//    Two bored lugs on a base with a rounded end and a slot. The lugs COINCIDE in the elevation
//    and separate in the other two views, which is the last thing this topic has to teach: two
//    views can never be assumed to be one view seen twice.
// ===========================================================================

const BEARING = (() => {
  // THE FIGURE'S 37 IS THE HEIGHT TO THE BORE CENTRE, not the overall height — it is dimensioned
  // on the right side view from the seating up to the centre line, and the head's R24 stands on
  // top of it. Reading it as the overall once shrank every other size on this part to fit inside
  // it; the chain below is the figure's own, taken from its plan (48 + 35 to the arc centre, then
  // R22) and its elevation (15 base, dia 24 bore).
  const t = 15;             // base thickness
  const hz = 22;            // half depth (44 across)
  const rEnd = 22;          // the base's rounded end, which is a semicircle on the 44
  const lugL = 48;          // each lug's length from the near end
  const rLug = lugL / 2;    // 24 — the head is the semicircle that closes that length
  const lugT = 11;          // each lug's thickness in z
  const rBore = 12;         // dia 24 bore
  const yLug = 37;          // bore centre height above the seating
  const rSlot = 9;          // dia 18 slot
  const L = 48 + 35 + rEnd; // 105 — the plan's chain runs to the arc CENTRE, then the radius
  const hx = L / 2;
  const xL = -hx;           // -52.5, the near end
  const xJ = xL + 48 + 35;  // 30.5, the rounded end's centre
  const xR = xJ + rEnd;     // 52.5 — the far end of the base
  const lugX0 = xL; const lugX1 = xL + lugL;   // -52.5 .. -4.5
  const xLug = (lugX0 + lugX1) / 2;   // -28.5, the bore axis
  const H = yLug + rLug;    // 61 overall
  const sx1 = xJ; const sx0 = xJ - 18;   // the slot's two centres, 18 apart

  /** One lug's profile in the XY plane: a flat-sided body under a semicircular head. */
  const lugProfile = [
    [lugX0, t], [lugX1, t], [lugX1, yLug], ...arcPts(xLug, yLug, rLug, 0, 180), [lugX0, yLug],
  ];

  return {
    id: 'bearingblock',
    name: 'Bearing Block',
    figure: 'Fig. 19.22',
    blurb: 'Two arms standing on a base with a rounded end. Each arm has a hole; the base has a long slot.',
    sideView: 'right',
    size: { L, D: 2 * hz, H },
    parts: [
      {
        k: 'extrude', axis: 'y', from: 0, to: t,
        outline: [
          [xL, -hz], [xJ, -hz], ...arcPts(xJ, 0, rEnd, -90, 90), [xJ, hz], [xL, hz],
        ],
        holes: [slotLoop(sx0, sx1, 0, rSlot)],
      },
      {
        k: 'extrude', axis: 'z', from: -hz, to: -hz + lugT,
        outline: lugProfile, holes: [circleLoop(xLug, yLug, rBore)],
      },
      {
        k: 'extrude', axis: 'z', from: hz - lugT, to: hz,
        outline: lugProfile, holes: [circleLoop(xLug, yLug, rBore)],
      },
    ],
    views: {
      front: [
        poly([
          [xL, 0], [xR, 0], [xR, t], [lugX1, t], [lugX1, yLug],
          ...arcPts(xLug, yLug, rLug, 0, 180), [lugX0, yLug],
        ]),
        circle([xLug, yLug], rBore),
        // The base's top face runs on behind the two lugs, in the 22 mm gap between them.
        hid([lugX0, t], [lugX1, t]),
        hid([sx0 - rSlot, 0], [sx0 - rSlot, t]),
        hid([sx1 + rSlot, 0], [sx1 + rSlot, t]),
        cross([xLug, yLug], rLug + 7),
        // ONE CENTRE LINE PER CAP, not one down the middle of the slot. The 18 above measures the
        // two cap centres, and a dimension has to spring from something the view actually draws.
        ctr([sx0, -6], [sx0, t + 6]),
        ctr([sx1, -6], [sx1, t + 6]),
      ],
      top: [
        poly([
          [xL, -hz], [xJ, -hz], ...arcPts(xJ, 0, rEnd, -90, 90), [xJ, hz], [xL, hz],
        ]),
        poly(slotLoop(sx0, sx1, 0, rSlot), 'edge'),
        line([lugX1, -hz], [lugX1, -hz + lugT]),
        line([lugX0, -hz + lugT], [lugX1, -hz + lugT]),
        line([lugX1, hz - lugT], [lugX1, hz]),
        line([lugX0, hz - lugT], [lugX1, hz - lugT]),
        hid([xLug - rBore, -hz], [xLug - rBore, -hz + lugT]),
        hid([xLug + rBore, -hz], [xLug + rBore, -hz + lugT]),
        hid([xLug - rBore, hz - lugT], [xLug - rBore, hz]),
        hid([xLug + rBore, hz - lugT], [xLug + rBore, hz]),
        ctr([xL - 6, 0], [xR + 8, 0]),
        ctr([xLug, -hz - 6], [xLug, hz + 6]),
        ctr([sx0, -rSlot - 6], [sx0, rSlot + 6]),
        ctr([sx1, -rSlot - 6], [sx1, rSlot + 6]),
      ],
      side: [
        // Right side view: local x = -world z, so the lug at z in [11, 22] draws at x in [-22,-11].
        poly([
          [-hz, 0], [hz, 0], [hz, H], [hz - lugT, H], [hz - lugT, t],
          [-hz + lugT, t], [-hz + lugT, H], [-hz, H],
        ]),
        hid([-hz, yLug - rBore], [-hz + lugT, yLug - rBore]),
        hid([-hz, yLug + rBore], [-hz + lugT, yLug + rBore]),
        hid([hz - lugT, yLug - rBore], [hz, yLug - rBore]),
        hid([hz - lugT, yLug + rBore], [hz, yLug + rBore]),
        hid([-rSlot, 0], [-rSlot, t]),
        hid([rSlot, 0], [rSlot, t]),
        ctr([-hz - 6, yLug], [hz + 6, yLug]),
        ctr([0, -6], [0, t + 6]),
      ],
    },
    dims: {
      front: [
        dim([xL, 0], [xR, 0], -LANE(1), '105'),        // overall length
        dim([xL, t], [xL, 0], -LANE(1), '15'),         // base thickness
        // The slot's two centres. On the elevation, where the figure puts it, and where the paper
        // above the base is clear — on the plan it would have to climb out over the outline first.
        dim([sx0, t], [sx1, t], LANE(1), '18'),
        roundDim([xLug, yLug], rBore, 360, 45, rLug + 16),   // the bore: a full circle here
        roundDim([xLug, yLug], rLug, 180, 135, rLug + 12),   // the lug's head: a semicircle
      ],
      top: [
        dim([xR, -hz], [xR, hz], -LANE(1), '44'),      // overall depth
        // The figure's own length chain: the lugs, then the run out to the rounded end's centre.
        // Consecutive stretches of one line, so they chain in a single lane.
        dim([xL, -hz], [lugX1, -hz], -LANE(1), '48'),
        dim([lugX1, -hz], [xJ, -hz], -LANE(1), '35'),
        // A SLOT END IS NOT A HOLE. It is a semicircular cap on a straight-sided opening, so Ø18
        // would be the wrong symbol for it: R9 on the cap, with the 18 on the elevation giving the
        // two centres, is the pair that specifies the slot.
        // The slot's cap now sits ON the rounded end's own centre, so its leader has to clear a
        // R22 arc to reach paper: measured from the slot centre, anything shorter than 22 lands
        // back inside the casting. `rEnd + 8` is the first length that does.
        roundDim([sx1, 0], rSlot, 180, -45, rEnd + 8),
        // The base's rounded end, at a steeper angle and further out again so its shelf drops
        // below the length chain rather than across it.
        roundDim([xJ, 0], rEnd, 180, -70, rEnd + 26),
      ],
      side: [
        dim([-hz, 0], [hz, 0], -LANE(1), '44'),        // overall depth
        dim([-hz, 0], [-hz, yLug], LANE(1), '37'),     // seating up to the bore centre
        // A lug and the gap beside it are consecutive along the same line, so they CHAIN in one
        // lane, arrow head to arrow head at the lug's inner face. Stacking them in two lanes would
        // spend a lane saying nothing — the second dimension starts exactly where the first ends.
        dim([-hz, H], [-hz + lugT, H], LANE(1), '11'), // one lug's thickness
        dim([-hz + lugT, H], [hz - lugT, H], LANE(1), '22'), // the gap between them
      ],
    },
    viewNotes: {
      front: 'Straight at the front. Careful — there are TWO arms, one exactly behind the other, so '
        + 'from here they line up and look like one. This view cannot tell you there are two.',
      top: 'From above. Now the two arms separate, the rounded end shows its curve, and the long '
        + 'slot is a real slot. Everything the front view was hiding is here.',
      left: 'From this side you can see the two arms and the gap between them. It is the mirror '
        + 'image of the view from the right.',
      right: 'From this side you can see the two arms and the gap between them — the shape a fork '
        + 'makes. Now you know for certain there are two.',
    },
  };
})();

/**
 * The registry, in PICKER order — the order the 2x2 grid reads, left to right and top to bottom.
 *
 * Not the order of difficulty. The Cylindrical Block leads because it is the one a learner most
 * readily recognises as a machine part, and the picker is the first thing they touch; the Stepped
 * Block, which is the simplest DRAWING, sits last as the one to fall back on. Nothing in the topic
 * depends on the order — the grid, the default object and reset all read this array.
 */
/** @type {EngObject[]} */
export const OBJECTS = Object.freeze([CYLBLOCK, SHAFTSUP, BEARING, BLOCK]);

/** @param {string} id */
export function getObject(id) {
  return OBJECTS.find((o) => o.id === id) ?? OBJECTS[0];
}

export const DEFAULT_OBJECT = OBJECTS[0].id;

// ---------------------------------------------------------------------------
// Camera directions, as the drawing office names them.
//
// A "left side view" is the view obtained by looking FROM the left, so its camera sits at -x. The
// placement of the resulting drawing is the opposite side of the sheet, and that inversion is
// first-angle projection — see the frame note at the top of this file.
// ---------------------------------------------------------------------------

export const VIEW_DIRECTIONS = Object.freeze([
  { key: 'front', label: 'Front', drawing: 'Elevation' },
  { key: 'top', label: 'Top', drawing: 'Plan' },
  { key: 'left', label: 'Left', drawing: 'Left side view' },
  { key: 'right', label: 'Right', drawing: 'Right side view' },
]);

/** Where each side view is PLACED on a first-angle sheet. The one sentence the topic exists for. */
export const FIRST_ANGLE_PLACEMENT = Object.freeze({
  left: 'right',   // the view from the left is drawn on the right
  right: 'left',   // the view from the right is drawn on the left
});
