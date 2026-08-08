// Solid registry — Module 4, Topic 2: How to Construct an Isometric Drawing.
//
// THE DATA MODEL. This file is the single place a solid is described, and every other module in the
// topic is a generic interpreter of what it finds here. A solid declares five things and nothing
// else:
//
//   dims          which dimensions the learner may set (Step 2 builds its controls from this)
//   bounds(d)     the overall enclosing width × depth × height (Step 4 Phase B's bounding box)
//   body(d)       a geometry SPEC — a kind + numbers, never a THREE object (shapeFactory reads it)
//   views(d)      the three orthographic views as 2D primitives (orthographicDrawer reads them)
//   construction(d)  the ordered construction stages for Step 4 Phase C (constructionEngine reads them)
//
// WHY DATA-DRIVEN (task brief; ADR-043). The alternative — a `switch (solid)` in the factory, another
// in the drawer, another in the construction sequencer, another in the UI — is the pattern that makes
// "add a solid" a five-file archaeology exercise and guarantees the five copies drift. Here, adding a
// solid is appending ONE object to `SOLIDS`. The interpreters each own exactly one switch, over
// PRIMITIVE KINDS (a bounded vocabulary that grows far more slowly than the solid list).
//
// UNITS. Every number in this file is in MILLIMETRES, the unit the learner types and the unit the
// orthographic views are labelled in. The world scale is the platform's declared 1 world unit = 10 mm
// (RULES.md §6.8), applied by `toWorld()` at the boundary — never by rescaling the data.
//
// Layering (CLAUDE.md): leaf DATA module. Imports nothing, knows nothing about THREE, the DOM, or
// the scene. That is what lets the same description drive a 3D construction, a 2D SVG sheet, and a
// set of sliders without any of them knowing about each other.

/** Platform scale: 1 world unit = 10 mm (RULES.md §6.8). */
export const MM_PER_UNIT = 10;

/** Convert a millimetre value to world units. */
export function toWorld(mm) { return mm / MM_PER_UNIT; }

// ---------------------------------------------------------------------------
// Footprint helpers — the base outline of a solid as a list of [x, z] points in mm.
// Shared by `views` (to draw the top view) and `construction` (to raise verticals), so the two can
// never disagree about where a corner is.
// ---------------------------------------------------------------------------

/** Circumradius of a regular polygon from its side length. */
export function circumradius(side, sides) {
  return side / (2 * Math.sin(Math.PI / sides));
}

/**
 * Corner points of a regular polygon lying in the horizontal plane.
 * @param {number} r        Circumradius (mm).
 * @param {number} sides
 * @param {number} [rot=0]  Rotation about the vertical axis (radians).
 * @returns {[number, number][]}  [x, z] pairs.
 */
export function polygonPoints(r, sides, rot = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    pts.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  return pts;
}

/** A square footprint of half-width hw / half-depth hd, corners in order. */
function rectPoints(hw, hd) {
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
}

/**
 * Points evenly spaced around a horizontal circle — used to raise the "generators" of a cone or
 * frustum, which is how a curved solid is actually constructed by hand.
 */
function ringPoints(r, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push([r * Math.sin(a), r * Math.cos(a)]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// Dimension-field factories. A field is what Step 2 turns into one slider + numeric input.
//
// ENGINEERING NOTATION. Every field carries a `symbol` — the letter a drawing office would write
// against that length (`L` · `B` · `H` · `a` · `ØD` · `Ød` · `R`), never a descriptive UI word. The
// symbol is what the dock labels, what the comparison table lists, and what flies out of an
// orthographic view during the Phase-B transfer, so the learner reads the same notation in the
// controls, on the sheet and in the drawing.
//
// OPTIONAL DIMENSIONS (`optional`). Some examination problems do not state every size: a frustum is
// commonly given only its base diameter and height, and the top diameter has to be recovered from
// the question's own conditions first. A field may therefore declare itself optional and supply
// `auto(d)`, a demonstration value used only so the solid still renders while the dimension is
// UNKNOWN. This is metadata, never behaviour: no interpreter contains the word "frustum" (ADR-043).
// The brief's `requiresTopDiameter` / `supportsUnknownTop` pair is exactly this, generalised —
// `optional: true` IS "supports unknown", and "requires it" is the live toggle state the learner
// controls.
// ---------------------------------------------------------------------------

/**
 * @param {string} key
 * @param {string} label   Plain-English name, used for screen readers and the aria-label.
 * @param {string} symbol  Engineering notation, e.g. `L`, `ØD`, `a`.
 * @param {object} [extra] `optional` / `auto` / `autoNote` for a dimension a problem may withhold.
 */
const dim = (key, label, symbol, def, min, max, extra = {}) => ({
  key, label, symbol, unit: 'mm', min, max, step: 1, default: def, ...extra,
});

// ---------------------------------------------------------------------------
// View primitives (2D, millimetres, origin at the view's CENTRE, +x right, +y up):
//   { k:'rect',   w, h }                     axis-aligned rectangle centred on the origin
//   { k:'circle', r }                        circle centred on the origin
//   { k:'poly',   pts:[[x,y],…] }            closed outline
//   { k:'line',   x1,y1,x2,y2, thin:true }   an internal edge (drawn narrower than an outline)
//   { k:'arc',    r, half:'upper'|'lower' }  a semicircle closed by its diameter
// ---------------------------------------------------------------------------

/** A regular polygon's outline as a top-view primitive, plus its corner-to-corner internal edges. */
function polyView(r, sides, rot = 0) {
  return { k: 'poly', pts: polygonPoints(r, sides, rot).map(([x, z]) => [x, -z]) };
}

/** The four sloping edges of a pyramid, which project as the top view's diagonals. */
function diagonals(pts) {
  return pts.map(([x, z]) => ({ k: 'line', x1: x, y1: -z, x2: 0, y2: 0, thin: true }));
}

/** Vertical edges of a prism seen in elevation — the corner edges that read on a real drawing. */
function prismElevationEdges(xs, h) {
  return xs.map((x) => ({ k: 'line', x1: x, y1: -h / 2, x2: x, y2: h / 2, thin: true }));
}

// ---------------------------------------------------------------------------
// Construction primitives (3D, millimetres, y measured UP from the seating plane):
//   { k:'axisLine',  y0, y1 }                    the vertical centre axis
//   { k:'ring',      y, r }                      a horizontal circle — reads as an ellipse in iso
//   { k:'poly',      y, pts }                    a closed horizontal outline
//   { k:'verticals', y0, y1, pts }               vertical lines raised from each [x,z]
//   { k:'spokes',    y, pts, apexY }             lines from each [x,z] up to the apex on the axis
//   { k:'generators', y0, r0, y1, r1, count }    lines joining a lower ring to an upper ring
//   { k:'billboard', y, r, half }                a camera-facing circle (a sphere's true outline)
//   { k:'marker',    y }                         a small point marker on the axis (an apex/centre)
// A stage groups primitives with the sentence the tutor says while they appear.
// ---------------------------------------------------------------------------

const stage = (id, label, note, draw) => ({ id, label, note, draw });

// ---------------------------------------------------------------------------
// Step-5 special cases.
//
// A solid may declare `trueDiameterInProjection` and carry a `formNote`, and Step 5 reads both. The
// sphere is the reason: the isometric scale reduces lengths measured ALONG THE AXES, and a sphere
// has no such length — it has no linear edge at all. Seen from any direction it projects as a
// circle of its TRUE radius, so an isometric projection of a sphere is drawn full size while
// everything around it is reduced. Stated the other way, which is how a drawing office works from a
// reduced layout: the projected diameter is multiplied by 1 / 0.816 ≈ 1.22 to get the circle to
// draw. Both of those are properties of the SOLID, so both live here as data — Step 5 owns no list
// of which solids are special (ADR-043).
// ---------------------------------------------------------------------------

const SPHERE_FORM_NOTE = {
  title: 'Sphere Special Case',
  body: [
    'Unlike most solids, a sphere is represented using its TRUE diameter.',
    'If you are working from an isometric projection, the projected diameter is multiplied by about '
      + '1.22 to obtain the circle that represents the sphere.',
    'So the sphere is drawn with its true diameter rather than the reduced isometric dimension — it '
      + 'is the one solid whose drawn size does not change between the two forms.',
  ],
};

// ---------------------------------------------------------------------------
// The registry.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} Solid
 * @property {string} id
 * @property {string} name
 * @property {string} blurb          One or two sentences shown in Step 1.
 * @property {{key:string,label:string,symbol:string,unit:string,min:number,max:number,step:number,default:number,optional?:boolean,autoLabel?:string,auto?:(d:Record<string,number>)=>number,autoNote?:string}[]} dims
 * @property {{width:string,depth:string,height:string}} axisSymbols  Notation for the three box edges.
 * @property {(d:Record<string,number>) => {width:number,depth:number,height:number}} bounds
 * @property {(d:Record<string,number>) => object} body
 * @property {(d:Record<string,number>) => {front:object,top:object,side:object}} views
 * @property {(d:Record<string,number>) => {id:string,label:string,note:string,draw:object[]}[]} construction
 */

/** @type {Solid[]} */
export const SOLIDS = [
  // ---- Cube ---------------------------------------------------------------
  {
    id: 'cube',
    name: 'Cube',
    blurb: 'Six equal square faces. Every overall size is the same number, so the enclosing box IS the solid — which makes it the clearest place to meet the construction method.',
    dims: [dim('edge', 'Edge', 'a', 50, 20, 90)],
    axisSymbols: { width: 'a', depth: 'a', height: 'a' },
    bounds: (d) => ({ width: d.edge, depth: d.edge, height: d.edge }),
    body: (d) => ({ kind: 'box', w: d.edge, h: d.edge, d: d.edge }),
    views: (d) => ({
      front: { w: d.edge, h: d.edge, shapes: [{ k: 'rect', w: d.edge, h: d.edge }] },
      top: { w: d.edge, h: d.edge, shapes: [{ k: 'rect', w: d.edge, h: d.edge }] },
      side: { w: d.edge, h: d.edge, shapes: [{ k: 'rect', w: d.edge, h: d.edge }] },
    }),
    construction: (d) => {
      const p = rectPoints(d.edge / 2, d.edge / 2);
      return [
        stage('done', 'Complete the box',
          'For a cube the enclosing box IS the finished solid — every face of the box is a face of the cube. Nothing is left to cut away.',
          [{ k: 'poly', y: 0, pts: p }, { k: 'poly', y: d.edge, pts: p }, { k: 'verticals', y0: 0, y1: d.edge, pts: p }]),
      ];
    },
  },

  // ---- Cuboid -------------------------------------------------------------
  {
    id: 'cuboid',
    name: 'Cuboid',
    blurb: 'A rectangular block. Its three overall sizes differ, so you can watch each one travel from its own orthographic view onto its own isometric axis.',
    dims: [dim('length', 'Length', 'L', 70, 20, 110), dim('breadth', 'Breadth', 'B', 40, 20, 110), dim('height', 'Height', 'H', 50, 20, 110)],
    axisSymbols: { width: 'L', depth: 'B', height: 'H' },
    bounds: (d) => ({ width: d.length, depth: d.breadth, height: d.height }),
    body: (d) => ({ kind: 'box', w: d.length, h: d.height, d: d.breadth }),
    views: (d) => ({
      front: { w: d.length, h: d.height, shapes: [{ k: 'rect', w: d.length, h: d.height }] },
      top: { w: d.length, h: d.breadth, shapes: [{ k: 'rect', w: d.length, h: d.breadth }] },
      side: { w: d.breadth, h: d.height, shapes: [{ k: 'rect', w: d.breadth, h: d.height }] },
    }),
    construction: (d) => {
      const p = rectPoints(d.length / 2, d.breadth / 2);
      return [
        stage('done', 'Complete the box',
          'A cuboid, like a cube, exactly fills its enclosing box. Length runs along one axis, breadth along the second, height up the third.',
          [{ k: 'poly', y: 0, pts: p }, { k: 'poly', y: d.height, pts: p }, { k: 'verticals', y0: 0, y1: d.height, pts: p }]),
      ];
    },
  },

  // ---- Cylinder -----------------------------------------------------------
  {
    id: 'cylinder',
    name: 'Cylinder',
    blurb: 'A circular base swept straight up. Its circles are the first thing that does NOT stay the same shape in an isometric drawing — each one becomes an ellipse.',
    dims: [dim('diameter', 'Diameter', 'ØD', 50, 20, 90), dim('height', 'Height', 'H', 70, 20, 110)],
    axisSymbols: { width: 'ØD', depth: 'ØD', height: 'H' },
    bounds: (d) => ({ width: d.diameter, depth: d.diameter, height: d.height }),
    body: (d) => ({ kind: 'revolve', rBottom: d.diameter / 2, rTop: d.diameter / 2, h: d.height }),
    views: (d) => ({
      front: { w: d.diameter, h: d.height, shapes: [{ k: 'rect', w: d.diameter, h: d.height }] },
      top: { w: d.diameter, h: d.diameter, shapes: [{ k: 'circle', r: d.diameter / 2 }] },
      side: { w: d.diameter, h: d.height, shapes: [{ k: 'rect', w: d.diameter, h: d.height }] },
    }),
    construction: (d) => {
      const r = d.diameter / 2;
      return [
        stage('base', 'Bottom ellipse',
          'The base circle is inscribed in the bottom face of the box. Seen from the isometric direction that circle reads as an ELLIPSE — it is still a circle on the object, only the view foreshortens it.',
          [{ k: 'ring', y: 0, r }]),
        stage('top', 'Top ellipse',
          'The same circle, repeated on the top face of the box, one height higher.',
          [{ k: 'ring', y: d.height, r }]),
        stage('axis', 'Axis and outline',
          'Join the two ellipses down their outermost points and the cylinder closes. The centre axis is a construction line, not an edge of the solid.',
          [{ k: 'axisLine', y0: 0, y1: d.height },
            { k: 'verticals', y0: 0, y1: d.height, pts: ringPoints(r, 12) }]),
      ];
    },
  },

  // ---- Cone ---------------------------------------------------------------
  {
    id: 'cone',
    name: 'Cone',
    blurb: 'A circular base and a single apex. Only the base needs constructing — the apex is one point on the vertical axis.',
    dims: [dim('diameter', 'Base diameter', 'ØD', 55, 20, 90), dim('height', 'Height', 'H', 75, 20, 110)],
    axisSymbols: { width: 'ØD', depth: 'ØD', height: 'H' },
    bounds: (d) => ({ width: d.diameter, depth: d.diameter, height: d.height }),
    body: (d) => ({ kind: 'revolve', rBottom: d.diameter / 2, rTop: 0, h: d.height }),
    views: (d) => ({
      front: {
        w: d.diameter, h: d.height,
        shapes: [{ k: 'poly', pts: [[-d.diameter / 2, -d.height / 2], [d.diameter / 2, -d.height / 2], [0, d.height / 2]] }],
      },
      top: {
        w: d.diameter, h: d.diameter,
        shapes: [{ k: 'circle', r: d.diameter / 2 }, { k: 'line', x1: -d.diameter / 2, y1: 0, x2: d.diameter / 2, y2: 0, thin: true }],
      },
      side: {
        w: d.diameter, h: d.height,
        shapes: [{ k: 'poly', pts: [[-d.diameter / 2, -d.height / 2], [d.diameter / 2, -d.height / 2], [0, d.height / 2]] }],
      },
    }),
    construction: (d) => {
      const r = d.diameter / 2;
      return [
        stage('base', 'Base ellipse',
          'The base circle is inscribed in the bottom face of the box, and reads as an ellipse from the isometric direction.',
          [{ k: 'ring', y: 0, r }]),
        stage('axis', 'Axis and apex',
          'Raise the vertical axis through the centre of the base. The apex sits on it, at the full height taken from the front view.',
          [{ k: 'axisLine', y0: 0, y1: d.height }, { k: 'marker', y: d.height }]),
        stage('slant', 'Join to the apex',
          'Lines from the apex down to the ellipse complete the cone. The two that just touch the ellipse are the outline you keep.',
          [{ k: 'spokes', y: 0, apexY: d.height, pts: ringPoints(r, 12) }]),
      ];
    },
  },

  // ---- Square pyramid -----------------------------------------------------
  {
    id: 'square-pyramid',
    name: 'Square Pyramid',
    blurb: 'A square base and four sloping faces meeting at an apex. The base is constructed inside the box, then every corner is joined to one point.',
    dims: [dim('side', 'Base side', 'a', 55, 20, 90), dim('height', 'Height', 'H', 70, 20, 110)],
    axisSymbols: { width: 'a', depth: 'a', height: 'H' },
    bounds: (d) => ({ width: d.side, depth: d.side, height: d.height }),
    body: (d) => ({ kind: 'pyramid', r: circumradius(d.side, 4), h: d.height, sides: 4, rot: Math.PI / 4 }),
    views: (d) => {
      const pts = polygonPoints(circumradius(d.side, 4), 4, Math.PI / 4);
      return {
        front: {
          w: d.side, h: d.height,
          shapes: [{ k: 'poly', pts: [[-d.side / 2, -d.height / 2], [d.side / 2, -d.height / 2], [0, d.height / 2]] }],
        },
        top: {
          w: d.side, h: d.side,
          shapes: [{ k: 'rect', w: d.side, h: d.side }, ...diagonals(pts)],
        },
        side: {
          w: d.side, h: d.height,
          shapes: [{ k: 'poly', pts: [[-d.side / 2, -d.height / 2], [d.side / 2, -d.height / 2], [0, d.height / 2]] }],
        },
      };
    },
    construction: (d) => {
      const pts = polygonPoints(circumradius(d.side, 4), 4, Math.PI / 4);
      return [
        stage('base', 'Base square',
          'The base is the bottom face of the enclosing box — no extra work. Its corners are already correct.',
          [{ k: 'poly', y: 0, pts }]),
        stage('apex', 'Locate the apex',
          'The apex is on the vertical axis, at the height read from the front view. Mark it before drawing a single sloping edge.',
          [{ k: 'axisLine', y0: 0, y1: d.height }, { k: 'marker', y: d.height }]),
        stage('edges', 'Join the edges',
          'Join each base corner to the apex. Three of the four sloping edges are visible from this direction; the fourth is hidden behind the solid.',
          [{ k: 'spokes', y: 0, apexY: d.height, pts }]),
      ];
    },
  },

  // ---- Square prism -------------------------------------------------------
  {
    id: 'square-prism',
    name: 'Square Prism',
    blurb: 'A square base carried straight up to an identical square top. The construction is the base polygon, repeated at height, then joined.',
    dims: [dim('side', 'Base side', 'a', 45, 20, 90), dim('height', 'Height', 'H', 75, 20, 110)],
    axisSymbols: { width: 'a', depth: 'a', height: 'H' },
    bounds: (d) => ({ width: d.side, depth: d.side, height: d.height }),
    body: (d) => ({ kind: 'prism', r: circumradius(d.side, 4), h: d.height, sides: 4, rot: Math.PI / 4 }),
    views: (d) => ({
      front: {
        w: d.side, h: d.height,
        shapes: [{ k: 'rect', w: d.side, h: d.height }],
      },
      top: { w: d.side, h: d.side, shapes: [{ k: 'rect', w: d.side, h: d.side }] },
      side: { w: d.side, h: d.height, shapes: [{ k: 'rect', w: d.side, h: d.height }] },
    }),
    construction: (d) => {
      const pts = polygonPoints(circumradius(d.side, 4), 4, Math.PI / 4);
      return [
        stage('base', 'Base polygon',
          'Draw the base square on the bottom face of the box.',
          [{ k: 'poly', y: 0, pts }]),
        stage('top', 'Top polygon',
          'Repeat exactly the same square on the top face, one height above.',
          [{ k: 'poly', y: d.height, pts }]),
        stage('join', 'Join the corners',
          'Join each base corner to the corner directly above it. Those vertical lines are the prism’s side edges.',
          [{ k: 'verticals', y0: 0, y1: d.height, pts }]),
      ];
    },
  },

  // ---- Pentagonal prism ---------------------------------------------------
  {
    id: 'pentagonal-prism',
    name: 'Pentagonal Prism',
    blurb: 'Five rectangular faces between two pentagons. The pentagon does not fit the box corner-to-corner, which is exactly why the box is drawn first and the shape constructed inside it.',
    dims: [dim('side', 'Base side', 'a', 32, 15, 60), dim('height', 'Height', 'H', 75, 20, 110)],
    // The pentagon does not fill its box, so the box edges are NOT the side `a`: they are the
    // overall length and breadth across the corners. Naming them L and B rather than `a` is the
    // honest reading, and it is exactly the distinction Phase B exists to make visible.
    axisSymbols: { width: 'L', depth: 'B', height: 'H' },
    bounds: (d) => {
      const pts = polygonPoints(circumradius(d.side, 5), 5, Math.PI / 5);
      const xs = pts.map((p) => p[0]); const zs = pts.map((p) => p[1]);
      return {
        width: Math.max(...xs) - Math.min(...xs),
        depth: Math.max(...zs) - Math.min(...zs),
        height: d.height,
      };
    },
    body: (d) => ({ kind: 'prism', r: circumradius(d.side, 5), h: d.height, sides: 5, rot: Math.PI / 5 }),
    views: (d) => {
      const R = circumradius(d.side, 5);
      const pts = polygonPoints(R, 5, Math.PI / 5);
      const xs = pts.map((p) => p[0]);
      const w = Math.max(...xs) - Math.min(...xs);
      const zs = pts.map((p) => p[1]);
      const dep = Math.max(...zs) - Math.min(...zs);
      // Interior corner edges that read in elevation (the extreme silhouette corners are the outline).
      const inner = [...new Set(xs.map((x) => Number(x.toFixed(3))))]
        .filter((x) => Math.abs(x - Math.min(...xs)) > 0.01 && Math.abs(x - Math.max(...xs)) > 0.01);
      return {
        front: { w, h: d.height, shapes: [{ k: 'rect', w, h: d.height }, ...prismElevationEdges(inner, d.height)] },
        top: { w, h: dep, shapes: [polyView(R, 5, Math.PI / 5)] },
        side: { w: dep, h: d.height, shapes: [{ k: 'rect', w: dep, h: d.height }] },
      };
    },
    construction: (d) => {
      const pts = polygonPoints(circumradius(d.side, 5), 5, Math.PI / 5);
      return [
        stage('base', 'Base pentagon',
          'The pentagon is constructed INSIDE the bottom face of the box, each corner placed from the top view. This is the step the bounding box exists for.',
          [{ k: 'poly', y: 0, pts }]),
        stage('top', 'Top pentagon',
          'The identical pentagon is repeated on the top face of the box.',
          [{ k: 'poly', y: d.height, pts }]),
        stage('join', 'Join the corners',
          'Join each base corner to the one above it. Two of the five side faces fall away from view; their edges would be drawn hidden on a finished sheet.',
          [{ k: 'verticals', y0: 0, y1: d.height, pts }]),
      ];
    },
  },

  // ---- Frustum of a cone --------------------------------------------------
  {
    id: 'frustum-cone',
    name: 'Frustum of Cone',
    blurb: 'A cone with its top cut off parallel to the base. Two circles of different sizes, at different heights, joined by straight generators.',
    dims: [
      dim('bottom', 'Bottom diameter', 'ØD', 60, 25, 95),
      // The one dimension a problem may withhold. See the `optional` note on the `dim` factory:
      // this is DATA, so the interpreters need no frustum branch anywhere.
      dim('top', 'Top diameter', 'Ød', 32, 10, 70, {
        optional: true,
        autoLabel: 'Auto / Unknown',
        /** Demonstration value used only while the dimension is unknown, so the solid still
         *  renders. Deliberately derived from the base so it stays a frustum at any base size —
         *  it is a placeholder for the construction, never an answer to the problem. */
        auto: (d) => Math.min(70, Math.max(10, Math.round(d.bottom * 0.55))),
        autoNote: 'Some examination problems provide only the base diameter and height. The top '
          + 'diameter is then obtained from the question conditions before constructing the '
          + 'isometric drawing.',
      }),
      dim('height', 'Height', 'H', 65, 20, 110),
    ],
    axisSymbols: { width: 'ØD', depth: 'ØD', height: 'H' },
    // The one size that is NOT an edge of the enclosing box, so the box-edge dimensions cannot
    // carry it. Measured across the top circle at its widest, with the dimension line taken up
    // clear of the solid — the usual place for a diameter on a pictorial view.
    extraDims: (d) => [{
      symbol: 'Ød',
      from: [-d.top / 2, d.height, 0],
      to: [d.top / 2, d.height, 0],
      push: [0, 1, 0],
    }],
    bounds: (d) => ({ width: Math.max(d.bottom, d.top), depth: Math.max(d.bottom, d.top), height: d.height }),
    body: (d) => ({ kind: 'revolve', rBottom: d.bottom / 2, rTop: d.top / 2, h: d.height }),
    views: (d) => {
      const rb = d.bottom / 2; const rt = d.top / 2; const hh = d.height / 2;
      return {
        front: {
          w: Math.max(d.bottom, d.top), h: d.height,
          shapes: [{ k: 'poly', pts: [[-rb, -hh], [rb, -hh], [rt, hh], [-rt, hh]] }],
        },
        top: {
          w: Math.max(d.bottom, d.top), h: Math.max(d.bottom, d.top),
          shapes: [{ k: 'circle', r: rb }, { k: 'circle', r: rt, thin: true }],
        },
        side: {
          w: Math.max(d.bottom, d.top), h: d.height,
          shapes: [{ k: 'poly', pts: [[-rb, -hh], [rb, -hh], [rt, hh], [-rt, hh]] }],
        },
      };
    },
    construction: (d) => [
      stage('lower', 'Lower ellipse',
        'The larger base circle, inscribed in the bottom face of the box.',
        [{ k: 'ring', y: 0, r: d.bottom / 2 }]),
      stage('upper', 'Upper ellipse',
        'The smaller top circle sits at the full height, on the SAME vertical axis. Its size comes from the top view, its position from the front view.',
        [{ k: 'axisLine', y0: 0, y1: d.height }, { k: 'ring', y: d.height, r: d.top / 2 }]),
      stage('generators', 'Join the generators',
        'Straight lines joining the two ellipses are the generators. The two that touch both ellipses tangentially are the outline of the finished drawing.',
        [{ k: 'generators', y0: 0, r0: d.bottom / 2, y1: d.height, r1: d.top / 2, count: 12 }]),
    ],
  },

  // ---- Sphere -------------------------------------------------------------
  {
    id: 'sphere',
    name: 'Sphere',
    blurb: 'The one solid whose isometric drawing is simply a circle. The construction cube still matters — it is what fixes the centre and the size.',
    dims: [dim('diameter', 'Diameter', 'ØD', 60, 20, 95)],
    axisSymbols: { width: 'ØD', depth: 'ØD', height: 'ØD' },
    trueDiameterInProjection: true,
    formNote: SPHERE_FORM_NOTE,
    bounds: (d) => ({ width: d.diameter, depth: d.diameter, height: d.diameter }),
    body: (d) => ({ kind: 'sphere', r: d.diameter / 2 }),
    views: (d) => ({
      front: { w: d.diameter, h: d.diameter, shapes: [{ k: 'circle', r: d.diameter / 2 }] },
      top: { w: d.diameter, h: d.diameter, shapes: [{ k: 'circle', r: d.diameter / 2 }] },
      side: { w: d.diameter, h: d.diameter, shapes: [{ k: 'circle', r: d.diameter / 2 }] },
    }),
    construction: (d) => {
      const r = d.diameter / 2;
      return [
        stage('centre', 'Locate the centre',
          'The enclosing cube fixes the centre of the sphere: it is the centre of the box, one radius above the base.',
          [{ k: 'axisLine', y0: 0, y1: d.diameter }, { k: 'marker', y: r }]),
        stage('outline', 'Inscribe the sphere',
          'A sphere looks the same from every direction, so its outline is a true CIRCLE about that centre — never an ellipse. That is what makes it the one solid you can draw without foreshortening anything.',
          [{ k: 'billboard', y: r, r }]),
      ];
    },
  },

  // ---- Hemisphere ---------------------------------------------------------
  {
    id: 'hemisphere',
    name: 'Hemisphere',
    blurb: 'Half a sphere resting on its flat face. A circular edge that foreshortens into an ellipse, capped by a semicircular outline that does not.',
    dims: [dim('diameter', 'Diameter', 'ØD', 66, 25, 95)],
    // The box is only one RADIUS tall, so its vertical edge is R — not the diameter.
    axisSymbols: { width: 'ØD', depth: 'ØD', height: 'R' },
    trueDiameterInProjection: true,
    formNote: SPHERE_FORM_NOTE,
    bounds: (d) => ({ width: d.diameter, depth: d.diameter, height: d.diameter / 2 }),
    body: (d) => ({ kind: 'hemisphere', r: d.diameter / 2 }),
    views: (d) => ({
      front: { w: d.diameter, h: d.diameter / 2, shapes: [{ k: 'arc', r: d.diameter / 2, half: 'upper' }] },
      top: { w: d.diameter, h: d.diameter, shapes: [{ k: 'circle', r: d.diameter / 2 }] },
      side: { w: d.diameter, h: d.diameter / 2, shapes: [{ k: 'arc', r: d.diameter / 2, half: 'upper' }] },
    }),
    construction: (d) => {
      const r = d.diameter / 2;
      return [
        stage('base', 'Flat face',
          'The flat circular face rests on the base of the box, and — being a circle seen at an angle — it reads as an ellipse.',
          [{ k: 'ring', y: 0, r }]),
        stage('dome', 'Half the sphere',
          'The curved surface is half a sphere about the centre of that ellipse, so its outline is a true SEMICIRCLE. Height is only one radius: the box is half as tall as it is wide.',
          [{ k: 'axisLine', y0: 0, y1: r }, { k: 'billboard', y: 0, r, half: 'upper' }]),
      ];
    },
  },
];

/** Lookup by id. Returns the first solid if the id is unknown, so a bad id can never blank the sim. */
export function getSolid(id) {
  return SOLIDS.find((s) => s.id === id) ?? SOLIDS[0];
}

/** Fresh default dimension set for a solid (Step 2's starting values, and what reset returns to). */
export function defaultDims(solid) {
  const out = {};
  for (const f of solid.dims) out[f.key] = f.default;
  return out;
}

// ---------------------------------------------------------------------------
// Optional dimensions + engineering notation — the accessors every interpreter asks through, so
// that none of them ever names a solid (ADR-043).
// ---------------------------------------------------------------------------

/** The fields a solid allows the learner to leave unspecified. Usually none. */
export function optionalDims(solid) {
  return solid.dims.filter((f) => f.optional);
}

/**
 * Resolve the learner's raw dimension set into the one the geometry is built from.
 *
 * A dimension the learner has marked UNKNOWN is replaced by its field's `auto(d)` demonstration
 * value — the drawing still has to be constructible, because the lesson is the construction, not
 * the arithmetic that recovers the missing size. Everything downstream (`bounds` · `body` · `views`
 * · `construction`) consumes the resolved set and never learns which values were stated.
 *
 * @param {Solid} solid
 * @param {Record<string, number>} dims          Raw values, exactly as typed.
 * @param {Record<string, boolean>} [unspecified] key → true when the learner has withheld it.
 * @returns {Record<string, number>}
 */
export function resolveDims(solid, dims, unspecified = {}) {
  let out = dims;
  for (const f of solid.dims) {
    if (!f.optional || !unspecified[f.key] || typeof f.auto !== 'function') continue;
    if (out === dims) out = { ...dims };            // copy on first write only
    out[f.key] = f.auto(dims);
  }
  return out;
}

/**
 * Engineering symbol for one edge of the enclosing box.
 * @param {Solid} solid
 * @param {'width'|'depth'|'height'} axisKey
 */
export function axisSymbol(solid, axisKey) {
  return solid.axisSymbols?.[axisKey] ?? { width: 'L', depth: 'B', height: 'H' }[axisKey];
}

/** Every symbol this solid is dimensioned with, in the order its fields are declared. */
export function dimensionSymbols(solid) {
  return solid.dims.map((f) => f.symbol);
}

/**
 * The isometric scale factor (Step 5). An isometric PROJECTION foreshortens every edge to
 * cos(35°16′) / cos(30°) ≈ 0.816 of its true length; an isometric VIEW keeps true lengths (1:1).
 * The construction is identical either way — only the numbers change, which is the whole point
 * Step 5 makes.
 */
export const ISOMETRIC_SCALE = 0.816;
