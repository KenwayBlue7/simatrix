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
// (Multiview Projection of Objects), pages 252-254 — Fig. 19.24 (a block), Fig. 19.20 (cylindrical
// block), Fig. 19.21 (shaft support) and Fig. 19.22 (bearing block), in that order of difficulty.
// The principal sizes are the figures' own. Where a size was not legible on the printed figure a
// sensible engineering value was chosen and is flagged `// chosen` below; nothing about the
// projection method depends on which value was used.
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
// 1. Stepped Block — Fig. 19.24, page 254 (exercise 01).
//    Wholly planar: no curve, no circle, no centre line. It exists so the learner meets the
//    THREE-VIEW LAYOUT with nothing else going on, and it is the one object whose left side view
//    is entirely hidden linework where its right side view would be entirely visible.
// ===========================================================================

const BLOCK = (() => {
  const L = 80; const D = 40; const H = 40;
  const t = 10;             // base slab thickness
  const y1 = 10; const y2 = 30;  // the two step tops
  const x1 = 20; const x2 = 0;   // the two step faces
  const hx = L / 2; const hz = D / 2;

  /** The staircase profile, in the XY plane, CCW from the bottom-left corner. */
  const profile = [
    [-hx, 0], [hx, 0], [hx, y1], [x1, y1], [x1, y2], [x2, y2], [x2, H], [-hx, H],
  ];

  return {
    id: 'block',
    name: 'Stepped Block',
    figure: 'Fig. 19.24',
    blurb: 'Three flat steps. No holes, no curves — the easiest one to draw.',
    sideView: 'left',
    size: { L, D, H },
    parts: [
      // ONE extrusion. A staircase modelled as three stacked slabs would put two coincident faces
      // inside the material at every tread (RULES.md §3.29); its profile has no such seam.
      { k: 'extrude', axis: 'z', from: -hz, to: hz, outline: profile },
    ],
    views: {
      front: [poly(profile)],
      top: [
        poly(rect(-hx, -hz, hx, hz)),
        line([x1, -hz], [x1, hz]),   // the two step faces, seen from above
        line([x2, -hz], [x2, hz]),
      ],
      side: [
        // LEFT side view: the full-height face at x = -40 stands between the observer and every
        // tread, so both step edges are hidden. Seen from the RIGHT they would both be visible —
        // the cheapest demonstration in the topic that a view is a statement about a DIRECTION.
        poly(rect(-hz, 0, hz, H)),
        hid([-hz, y1], [hz, y1]),
        hid([-hz, y2], [hz, y2]),
      ],
    },
    dims: {
      front: [
        dim([-hx, 0], [hx, 0], -LANE(1), '80'),        // overall length
        dim([hx, 0], [hx, y1], -LANE(1), '10'),        // base slab thickness
        // The two treads CHAIN in one lane above the block, meeting at the top step's face. The
        // middle tread is 10 mm lower than the top one, so its offset carries that drop up to the
        // shared lane; at a bare LANE(1) off its own face it sat 2 mm above the block's top edge,
        // with its extension lines cutting straight through the corner they spring from.
        dim([x2, H], [-hx, H], -LANE(1), '40'),        // top tread
        dim([x1, y2], [x2, y2], -((H - y2) + LANE(1)), '20'),  // middle tread
        // The risers chain up the tall face, which is the one edge with clear paper beside it.
        dim([-hx, y1], [-hx, y2], LANE(1), '20'),
        dim([-hx, y2], [-hx, H], LANE(1), '10'),
        dim([-hx, 0], [-hx, H], LANE(2), '40'),        // overall height, outermost lane
      ],
      top: [dim([hx, -hz], [hx, hz], -LANE(1), '40')], // overall depth
      // The overall height is given ONCE, on the elevation that shows the steps producing it.
      side: [dim([-hz, 0], [hz, 0], -LANE(1), '40')],
    },
    viewNotes: {
      front: 'You are standing in front of the steps, looking straight at them. This view shows '
        + 'how LONG the block is and how TALL it is.',
      top: 'You are above the block, looking straight down. This view shows how LONG it is and how '
        + 'DEEP it is. Each step top is flat, so from up here it is only a line.',
      left: 'From this side the tall end is in the way, so you cannot see the steps at all. They '
        + 'are still there, so on the drawing they are shown with dashes.',
      right: 'From this side you can see all three steps. Nothing is in the way, so every edge is '
        + 'drawn as a solid line.',
    },
  };
})();

// ===========================================================================
// 2. Cylindrical Block — Fig. 19.20, page 252 (Example 19.4).
//    A rectangular plate carrying a bored boss. It introduces the circle, the centre line and the
//    hidden line, and its boss is WIDER than the plate is deep, so the plan outline is a rectangle
//    the boss bulges out of — a shape the learner cannot get from the elevation alone.
// ===========================================================================

const CYLBLOCK = (() => {
  const L = 100; const D = 40; const t = 12;
  const rB = 25;            // boss radius   (dia 50)
  const rH = 15;            // bore radius   (dia 30)
  const H = 40;             // overall height
  const bore = 18;          // bore depth from the top face
  const yFloor = H - bore;  // 22
  const hx = L / 2; const hz = D / 2;
  // Where the boss circle crosses the plate's edges: sqrt(25^2 - 20^2) = 15.
  const xC = Math.sqrt(rB * rB - hz * hz);
  const aC = (Math.atan2(hz, xC) * 180) / Math.PI;   // 53.13 deg

  return {
    id: 'cylblock',
    name: 'Cylindrical Block',
    figure: 'Fig. 19.20',
    blurb: 'A flat plate with a round tower on top. The tower has a hole that does not go all the way through.',
    sideView: 'right',
    size: { L, D: 2 * rB, H },
    parts: [
      { k: 'extrude', axis: 'y', from: 0, to: t, outline: rect(-hx, -hz, hx, hz) },
      // The boss is a LATHE, not an extrusion with a hole: the bore is blind, and a blind pocket
      // has a floor. Its profile starts and ends on the axis, so the revolved surface is closed.
      { k: 'lathe', at: [0, 0], profile: [[0, t], [rB, t], [rB, H], [rH, H], [rH, yFloor], [0, yFloor]] },
    ],
    views: {
      front: [
        poly([[-hx, 0], [hx, 0], [hx, t], [rB, t], [rB, H], [-rB, H], [-rB, t], [-hx, t]]),
        hid([-rH, H], [-rH, yFloor]),
        hid([rH, H], [rH, yFloor]),
        hid([-rH, yFloor], [rH, yFloor]),   // the floor of the blind bore
        ctr([0, -6], [0, H + 8]),
      ],
      top: [
        // The boss overhangs the plate front and back, so the outline is the plate's edges TRIMMED
        // where the boss crosses them, joined by the two arcs that stand proud.
        poly([
          [-hx, -hz], [-xC, -hz],
          ...arcPts(0, 0, rB, 180 + aC, 360 - aC),
          [xC, -hz], [hx, -hz], [hx, hz], [xC, hz],
          ...arcPts(0, 0, rB, aC, 180 - aC),
          [-xC, hz], [-hx, hz],
        ]),
        circle([0, 0], rH),
        cross([0, 0], rB + 6),
      ],
      side: [
        poly([[-hz, 0], [hz, 0], [hz, t], [rB, t], [rB, H], [-rB, H], [-rB, t], [-hz, t]]),
        hid([-rH, H], [-rH, yFloor]),
        hid([rH, H], [rH, yFloor]),
        hid([-rH, yFloor], [rH, yFloor]),
        ctr([0, -6], [0, H + 8]),
      ],
    },
    dims: {
      front: [
        dim([-hx, 0], [hx, 0], -LANE(1), '100'),       // overall length
        // The plate thickness and the boss height CHAIN up the left-hand edge, head to head at the
        // plate's top face, so the two together read as the overall height without repeating it.
        // The boss height carries the plate's own half-width down to that lane first: taken at a
        // bare LANE(1) off the boss it would land at x = -37, where its lower extension line runs
        // back along 25 mm of the plate's top edge instead of springing off clear paper.
        dim([-hx, t], [-hx, 0], -LANE(1), '12'),       // plate thickness
        dim([-rB, t], [-rB, H], (hx - rB) + LANE(1), '28'),   // boss height above the plate
        dim([hx, 0], [hx, H], -LANE(1), '40'),         // overall height
        // Measured off the BORE, but its dimension line is thrown clear of the boss it is sunk in.
        dim([rH, yFloor], [rH, H], -(rB - rH) - LANE(1), '18'),
      ],
      top: [
        dim([hx, -hz], [hx, hz], -LANE(1), '40'),      // overall depth
        note([rH * 0.71, -rH * 0.71], [rB + 14, -rB - 10], 'Ø30'),
        note([-rB * 0.71, -rB * 0.71], [-rB - 16, -rB - 10], 'Ø50'),
      ],
      side: [dim([-hz, 0], [hz, 0], -LANE(1), '40')],  // depth again, on the view it is read from
    },
    viewNotes: {
      front: 'Straight at the front. The round tower looks like a plain rectangle from here — you '
        + 'cannot tell it is round. The dashes are the hole inside it, and they stop partway down, '
        + 'because the hole does not go all the way through.',
      top: 'From above. Now you can see that the tower IS round, and that it sticks out past the '
        + 'plate at the front and the back. The front view told you none of that.',
      left: 'From this side. The block is the same on both sides, so this looks exactly like the '
        + 'view from the right. That is why a drawing only ever needs one of the two.',
      right: 'From this side. It shows how DEEP the block is — 40 mm — which is the one size the '
        + 'front view cannot show you.',
    },
  };
})();

// ===========================================================================
// 3. Shaft Support — Fig. 19.21, page 253 (Example 19.5).
//    A base plate with two bolt holes, carrying a bored lug with a round head. The bored lug's
//    hole runs ALONG the line of sight of the side view, so the same feature is a circle in one
//    view and a pair of dashed lines in the other two. That contrast is the point of the object.
// ===========================================================================

const SHAFTSUP = (() => {
  const L = 100; const D = 40; const t = 12;
  const lugT = 20;          // lug thickness, along x
  const yTop = 44;          // where the lug's flat sides end and the round head begins
  const R = 20;             // radius of the round head            // chosen (figure prints R12 against a larger head)
  const rHole = 12;         // dia 24 bore through the lug
  const rBolt = 6;          // dia 12 bolt holes in the plate      // chosen
  const xBolt = 34;
  const H = yTop + R;       // 64 overall
  const hx = L / 2; const hz = D / 2; const hl = lugT / 2;

  return {
    id: 'shaftsupport',
    name: 'Shaft Support',
    figure: 'Fig. 19.21',
    blurb: 'A tall wall standing on a base plate. The wall has a big hole; the base has two small ones.',
    sideView: 'left',
    size: { L, D, H },
    parts: [
      {
        k: 'extrude', axis: 'y', from: 0, to: t,
        outline: rect(-hx, -hz, hx, hz),
        holes: [circleLoop(-xBolt, 0, rBolt), circleLoop(xBolt, 0, rBolt)],
      },
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
        poly([[-hx, 0], [hx, 0], [hx, t], [hl, t], [hl, H], [-hl, H], [-hl, t], [-hx, t]]),
        hid([-hl, yTop - rHole], [hl, yTop - rHole]),
        hid([-hl, yTop + rHole], [hl, yTop + rHole]),
        hid([-xBolt - rBolt, 0], [-xBolt - rBolt, t]),
        hid([-xBolt + rBolt, 0], [-xBolt + rBolt, t]),
        hid([xBolt - rBolt, 0], [xBolt - rBolt, t]),
        hid([xBolt + rBolt, 0], [xBolt + rBolt, t]),
        ctr([0, -6], [0, H + 8]),
        ctr([-hl - 8, yTop], [hl + 8, yTop]),
        ctr([-xBolt, -5], [-xBolt, t + 5]),
        ctr([xBolt, -5], [xBolt, t + 5]),
      ],
      top: [
        poly(rect(-hx, -hz, hx, hz)),
        line([-hl, -hz], [-hl, hz]),
        line([hl, -hz], [hl, hz]),
        circle([-xBolt, 0], rBolt),
        circle([xBolt, 0], rBolt),
        hid([-hl, -rHole], [hl, -rHole]),
        hid([-hl, rHole], [hl, rHole]),
        cross([-xBolt, 0], rBolt + 6),
        cross([xBolt, 0], rBolt + 6),
        ctr([0, -hz - 6], [0, hz + 6]),
      ],
      side: [
        poly([[-hz, 0], [hz, 0], [hz, yTop], ...arcPts(0, yTop, R, 0, 180), [-hz, yTop]]),
        circle([0, yTop], rHole),
        hid([-rBolt, 0], [-rBolt, t]),
        hid([rBolt, 0], [rBolt, t]),
        line([-hz, t], [hz, t]),         // the top face of the plate, either side of the lug
        cross([0, yTop], R + 6),
        ctr([0, -6], [0, t + 6]),
      ],
    },
    dims: {
      front: [
        // Smallest size innermost, overall size outermost — so the bolt pitch takes lane 1 and the
        // overall length lane 2 behind it. The other way round, the pitch's extension lines have to
        // cross the overall dimension line to reach their own, which is the one crossing the lane
        // discipline exists to prevent. The pitch is measured at the plate's TOP face, so its
        // offset carries that datum down to the baseline before it goes out to the lane.
        dim([-xBolt, t], [xBolt, t], -(t + LANE(1)), '68'),
        dim([-hx, 0], [hx, 0], -LANE(2), '100'),       // overall length
        dim([-hx, 0], [-hx, t], LANE(1), '12'),        // plate thickness
        dim([-hl, H], [hl, H], LANE(1), '20'),         // lug thickness
        dim([hx, 0], [hx, H], -LANE(1), '64'),         // overall height
      ],
      top: [
        dim([hx, -hz], [hx, hz], -LANE(1), '40'),      // overall depth
        note([-xBolt + rBolt * 0.71, rBolt * 0.71], [-xBolt - 20, hz + 12], 'Ø12'),
      ],
      side: [
        dim([-hz, 0], [hz, 0], -LANE(1), '40'),        // depth
        dim([0, 0], [0, yTop], -(R + LANE(1)), '44'),  // height to the bore centre
        note([rHole * 0.71, yTop + rHole * 0.71], [R + 16, H + 6], 'Ø24'),
        note([-R * 0.71, yTop + R * 0.71], [-R - 18, H + 6], 'R20'),
      ],
    },
    viewNotes: {
      front: 'Straight at the front. The wall is only 20 mm thick, so from here it is a narrow '
        + 'strip. You are looking ACROSS its big hole, so the hole is just two dashed lines.',
      top: 'From above. The two small holes in the base are proper circles here. The big hole in '
        + 'the wall is still only dashes, because you are still looking across it.',
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
  const t = 9;              // base thickness                       // chosen
  const xL = -41; const xJ = 20; const rEnd = 22;   // base: rectangle to x=20, then a R22 end
  const xR = xJ + rEnd;     // 42 — the far end of the base
  const hz = 22;            // half depth (44 across)
  const lugT = 11;          // each lug's thickness in z
  const lugX0 = -41; const lugX1 = -9;
  const xLug = (lugX0 + lugX1) / 2;   // -25, the bore axis
  const yLug = 21;          // bore centre height
  const rLug = 16;          // radius of each lug's round head
  const rBore = 10;         // dia 20 bore                          // chosen
  const H = yLug + rLug;    // 37 overall
  const rSlot = 9;          // dia 18 slot
  const sx0 = 12; const sx1 = 28;
  const L = xR - xL;        // 83

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
        ctr([(sx0 + sx1) / 2, -6], [(sx0 + sx1) / 2, t + 6]),
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
        ctr([(sx0 + sx1) / 2, -rSlot - 6], [(sx0 + sx1) / 2, rSlot + 6]),
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
        dim([xL, 0], [xR, 0], -LANE(1), '83'),         // overall length
        dim([xL, t], [xL, 0], -LANE(1), '9'),          // base thickness
        dim([xL, 0], [xL, yLug], LANE(2), '21'),       // height to the bore centre
        dim([xR, 0], [xR, H], -LANE(1), '37'),         // overall height
        note([xLug + rBore * 0.71, yLug + rBore * 0.71], [xJ, H + 12], 'Ø20'),
        note([xLug - rLug * 0.71, yLug + rLug * 0.71], [xL - 14, H + 10], 'R16'),
      ],
      top: [
        dim([xR, -hz], [xR, hz], -LANE(1), '44'),      // overall depth
        dim([xL, hz], [lugX1, hz], LANE(1), '32'),     // lug length
        // Measured at the slot's edge, so the lane has to clear the base outline above it first.
        dim([sx0, rSlot], [sx1, rSlot], (hz - rSlot) + LANE(1), '16'), // slot, centre to centre
        note([sx1 + rSlot * 0.71, -rSlot * 0.71], [xR + 10, -hz - 12], 'Ø18 slot'),
        note([xJ + rEnd * 0.71, -rEnd * 0.71], [xR + 10, -hz - 24], 'R22'),
      ],
      side: [
        dim([-hz, 0], [hz, 0], -LANE(1), '44'),        // overall depth
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
