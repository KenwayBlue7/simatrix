// The drawings themselves (Module 1 Topic 1.1 — Dimensioning).
//
// PURE DATA LEAF (ADR-007 / RULES.md §3.6) apart from the pure-data `dimensionData.js`
// import (ADR-078): every export here is a plain object or a function of plain objects.
// It owns nothing in the scene — `dimensionDraw.js` turns these specs into linework.
//
// What lives here:
//   • ELEMENTS       — Step 1's anatomy: the five elements of §4.1 plus the note, each
//                      mapped onto the exact part of a real dimension it names.
//   • anatomyDrawing() — the small starter drawing Step 1 builds.
//   • LEADER_DEMO    — Step 1's Fig. 4.4 leader-head study and Fig. 4.7/4.8 space study.
//   • ARRANGEMENTS   — Step 4: the same located features re-dimensioned every way §4.3
//                      gives, each with the variants its own figure prints.
//   • completeDrawing() — the fully dimensioned plate.
//   • MISTAKES       — Step 6: twelve seeded faults, each with the rule it breaks, the spec
//                      that expresses it, and the corrected spec it morphs back into.
//
// All coordinates are the part's own MILLIMETRE frame (origin at the bottom-left of the
// outline), the same frame `dimensionData.js` describes the geometry in.

import {
  FIGURES, PLATE, FEATURES, SLOT_LENGTH, BORE_MOUTH_DIA, SPIGOT_RECT, CROWN_CENTRE, lanesFor,
} from './dimensionData.js';

const F = FEATURES;
const CSK = F.cskHole.countersink;

// The figures the earlier steps are set on, and their dimension lanes. Every drawing below
// reads its sizes off the figure it is drawn on, so moving a hole moves its dimension too and
// no number in this file is ever typed twice.
const PLAIN = FIGURES.plate;         // Step 1 — the anatomy and the space study
const HOLED = FIGURES.hole;          // Step 1's leader study; Step 2's rules
const SLOTTED = FIGURES.slot;        // Step 4 — the layouts
const CHAMFERED = FIGURES.chamfer;   // Step 3 — the two value systems

const L1 = lanesFor(PLAIN);
const L2 = lanesFor(HOLED);
const L3 = lanesFor(SLOTTED);
const L4 = lanesFor(CHAMFERED);

/** The GUIDE PLATE's lanes — Steps 5 and 6. `right1` clears the cylindrical spigot, which
 *  stands 26 mm off the right end face. */
export const LANE = lanesFor(FIGURES.guide);

/** A point on a circle of radius r about `c`, at `deg`. */
const onCircle = (c, r, deg) => [
  c[0] + Math.cos(deg * Math.PI / 180) * r,
  c[1] + Math.sin(deg * Math.PI / 180) * r,
];

/** The spigot's axis station (mm) — the middle of its front-view rectangle. */
const SPIGOT_MID_X = (SPIGOT_RECT.x0 + SPIGOT_RECT.x1) / 2;

// ============================================================================
// STEP 1 — the anatomy of a dimension
// ============================================================================

/**
 * The small starter drawing Step 1 animates onto the undimensioned PLAIN PLATE. Three
 * dimensions, chosen so that between them they contain every element §4.1 lists — and no more
 * than three, because this is the first dimensioned drawing the learner ever reads.
 *
 * WHY A NOTE ON A PLAIN RECTANGLE. §4.1 counts the note among the elements, and the chapter's
 * own examples of one are "a chamfer, a countersink, a MATERIAL" — so a plate with no features
 * at all can still carry an honest one, on a leader that ends in a dot because the note is
 * about the face itself. Nothing is added to the geometry to make the point.
 * @returns {object[]}
 */
export function anatomyDrawing() {
  const P = PLAIN.plate;
  return [
    {
      id: 'a-len', kind: 'linear', axis: 'x',
      from: [0, 0], to: [P.length, 0], at: L1.below1, text: String(P.length),
    },
    {
      id: 'a-ht', kind: 'linear', axis: 'y',
      from: [0, 0], to: [0, P.height], at: L1.left1, text: String(P.height),
    },
    {
      // Dot, knee, bar and note all INSIDE the outline: a dot has to sit clearly on the face
      // it is about, and a bar that ran out past the right-hand edge would cross it.
      id: 'a-note', kind: 'leader',
      anchor: [66, 46], dirDeg: 40, lengthMm: 24, barMm: 14, head: 'dot',
      text: `MS PLATE\n${P.thickness} THICK`,
    },
  ];
}

/**
 * The elements of dimensioning (§4.1), each pointing at the exact PART of the anatomy
 * drawing it names. `parts` drives the isolate-on-hover behaviour: main.js re-renders the
 * drawing with everything muted except these.
 * @type {Array<{ id:string, name:string, type:string, blurb:string,
 *                parts:{ specId:string, only:string }[] }>}
 */
export const ELEMENTS = Object.freeze([
  {
    id: 'projline', name: 'Projection line', type: 'Thin line',
    blurb: 'Carries an edge of the part out to where you can write the size. Starts on the feature, comes off square, and runs a little past the dimension line.',
    parts: [{ specId: 'a-len', only: 'extension' }, { specId: 'a-ht', only: 'extension' }],
  },
  {
    id: 'dimline', name: 'Dimension line', type: 'Thin line',
    blurb: 'Spans the distance being measured. Never a centre line, never an edge of the part.',
    parts: [{ specId: 'a-len', only: 'dimline' }, { specId: 'a-ht', only: 'dimline' }],
  },
  {
    id: 'leader', name: 'Leader line', type: 'Thin line',
    blurb: 'Points at something a dimension line cannot reach — a hole, a chamfer, a note. Comes off at 30° or steeper.',
    parts: [{ specId: 'a-note', only: 'leader' }],
  },
  {
    id: 'termination', name: 'Arrow head', type: 'Thick line',
    blurb: 'How each end of the dimension line is closed — an arrow, a slash or a dot. One style per drawing, and the only thick thing here.',
    parts: [
      { specId: 'a-len', only: 'termination' }, { specId: 'a-ht', only: 'termination' },
      { specId: 'a-note', only: 'termination' },
    ],
  },
  {
    id: 'dimtext', name: 'The value', type: 'Small lettering',
    blurb: 'The number. Sizes are in millimetres, so you never write "mm" after it.',
    parts: [{ specId: 'a-len', only: 'text' }, { specId: 'a-ht', only: 'text' }],
  },
  {
    id: 'note', name: 'Note', type: 'Lettering on a leader',
    blurb: 'A few words a dimension line cannot carry — a chamfer, a countersink, a material. It sits on a short bar at the end of its leader.',
    parts: [{ specId: 'a-note', only: 'note' }],
  },
]);

/** The element parts, in the order Step 1 reveals them. */
export const ELEMENT_PARTS = Object.freeze(['extension', 'dimline', 'leader', 'termination', 'note', 'text']);

/**
 * Step 1's leader-head study (Fig. 4.4), on the PLATE WITH A HOLE. The same kind of note is
 * taken to three different things, and each thing demands a different head: a surface wants a
 * dot, an edge wants an arrow, a dimension line wants neither.
 *
 * The study borrows the holed figure because two of its three cases need a feature: an arrow
 * has to land on an EDGE, and the no-head case has to land on a DIMENSION LINE — which means
 * there has to be a size on the sheet worth qualifying. A plain rectangle can only show the dot.
 *
 * @param {'dot'|'arrow'|'none'} head
 * @returns {object[]}
 */
export function leaderDemo(head) {
  const H = HOLED.features.hole;
  const base = { id: 'ld', kind: 'leader', barMm: 14, dirDeg: 55, text: 'note' };
  if (head === 'dot') {
    return [{
      ...base, head: 'dot', text: 'GROUND',
      anchor: [96, 24], lengthMm: 34,
    }];
  }
  if (head === 'none') {
    // The note qualifies the SIZE, not the feature — which is exactly why it lands on the
    // dimension line and takes no head there. The dimension line already has its own two ends.
    return [
      {
        id: 'ld-dim', kind: 'linear', axis: 'x',
        from: [0, 0], to: H.at, at: L2.below1, text: String(H.at[0]),
      },
      {
        ...base, head: 'none', text: 'AFTER\nPLATING',
        anchor: [H.at[0] / 2, L2.below1], lengthMm: 30, dirDeg: -55, barMm: 14,
      },
    ];
  }
  return [{
    ...base, head: 'arrow', text: `ø${H.dia}`,
    anchor: onCircle(H.at, H.dia / 2, 55), lengthMm: 30,
  }];
}

/**
 * Step 1's space study (Figs. 4.7 and 4.8), on the PLAIN PLATE. One dimension whose two
 * projection lines the learner can squeeze together, so the termination has to change to
 * survive it. The specs are built from `fitDecision()`'s verdict in dimensionUI, which is the
 * actual rule.
 *
 * It is parked above the top edge, where it is the only thing on the sheet: watching an arrow
 * head give way is hard enough without a second dimension in the frame.
 *
 * @param {number} spanMm     How far apart the projection lines are.
 * @param {object} decision   The verdict from dimensionDraw's `fitDecision()`.
 * @returns {object[]}
 */
export function spaceDemo(spanMm, decision) {
  const P = PLAIN.plate;
  const cx = P.length / 2;
  const half = spanMm / 2;
  return [
    {
      id: 'sp', kind: 'linear', axis: 'x',
      from: [cx - half, P.height], to: [cx + half, P.height],
      at: P.height + 16, text: String(Math.round(spanMm)),
      arrowsOutside: decision.arrowsOutside,
      termination: decision.termination,
    },
  ];
}

// ============================================================================
// STEP 3 — the method comparison drawing
// ============================================================================

/**
 * The CHAMFERED plate, measured five ways — a horizontal, a vertical, an inclined and an
 * angular dimension plus a note on a leader. Those are exactly the cases where the two value
 * systems differ, and the reason this step is set on this figure: on a horizontal dimension
 * line the two systems draw the identical thing, so a plain rectangle cannot show the
 * difference at all.
 *
 * The same list is drawn on BOTH sheets of the step's comparison, in the two systems, so the
 * only difference between the two drawings is the one the step is about.
 *
 * WHERE EACH ONE SITS, AND WHY. Four dimensions want the bottom-right corner of this sheet and
 * the corner the chamfer cuts away is only 20 mm square, so the cluster is laid out in the
 * order of how little freedom each annotation has:
 *   1 the chamfer face's own INCLINED dimension can only lie parallel to that face, a set
 *     distance off it — it stays where it is, at the textbook's own offset;
 *   2 the ANGLE has to live in the wedge between the two faces, so its arc is drawn small
 *     enough to sit wholly inside that wedge and clear of the inclined dimension line;
 *   3 the RISE moves out to the second right-hand lane, leaving the inclined dimension's far
 *     arrow head the room it needs;
 *   4 the OVERALL LENGTH moves ABOVE the part. Measured from below, its right-hand projection
 *     line has to spring from [130, 0] — a point in the empty air the chamfer removed — and run
 *     straight down through the one place the inclined dimension has to pass. Above the part
 *     it springs off the real top corners, crosses nothing, and gives the sheet the top-edge
 *     weight it was missing.
 * @returns {object[]}
 */
export function methodDrawing() {
  const P = CHAMFERED.plate;
  const H = CHAMFERED.features.hole;
  const chamferStart = P.length - P.chamfer;   // where the bottom edge stops
  return [
    { id: 'm-len', kind: 'linear', axis: 'x', from: [0, P.height], to: [P.length, P.height], at: L4.above1, text: String(P.length) },
    { id: 'm-ht', kind: 'linear', axis: 'y', from: [0, 0], to: [0, P.height], at: L4.left1, text: String(P.height) },
    { id: 'm-rise', kind: 'linear', axis: 'y', from: [P.length, 0], to: [P.length, P.chamfer], at: L4.right1, text: String(P.chamfer) },
    {
      // The chamfer face itself — an INCLINED dimension line, the case Fig. 4.10 is about.
      //
      // WHY 30 AND NOT THE USUAL 14. A dimension line parallel to a 45° face crosses the bottom
      // edge's own level at x = 110 + offset × √2, and from x = 130 outwards that level belongs
      // to the rise's lower projection line. There are therefore only two offsets that do not
      // cross it: hard in against the face, or clear out past the end of that projection line.
      // Hard in leaves the 45° nowhere to be lettered — the corner the chamfer removed is only
      // 20 mm square, and an arc, a value and a dimension line will not fit in it three deep.
      // So this one goes out. Its two projection lines run long and parallel into the empty
      // paper below the plate, and the whole wedge is left to the angle.
      id: 'm-chamfer', kind: 'linear', axis: 'aligned',
      from: [chamferStart, 0], to: [P.length, P.chamfer], at: -30,
      text: String(Math.round(Math.SQRT2 * P.chamfer)),
    },
    // The 45° between the chamfer face and the bottom face it cuts away from. The arc falls
    // OUTSIDE the material, in the corner the chamfer removed — and at R17 it stays inside that
    // corner: it stops 6 mm short of the rise's lower projection line rather than landing an
    // arrow head on it, and leaves room outside itself for the value.
    // `legs: 'from'` extends the BOTTOM edge out to meet the arc. The chamfer face carries the
    // other end of the arc itself, so only this one needs a projection line — without it the
    // 0° arrow head would terminate on nothing, the bottom edge having stopped 14 mm short.
    {
      id: 'm-angle', kind: 'angular', vertex: [chamferStart, 0], radiusMm: 14,
      fromDeg: 0, toDeg: 45, legs: 'from', text: '45°',
    },
    // The note is kept short so its bar and lettering stay well inside the top edge rather than
    // printing across it (§4.6 rule 3 — a note crosses nothing, least of all an outline).
    { id: 'm-hole', kind: 'diameter', mode: 'leader', centre: H.at, diaMm: H.dia, dirDeg: 125, lengthMm: 20, barMm: -14, text: `ø${H.dia}` },
  ];
}

/**
 * Fig. 4.10's own subject: the SAME value on dimension lines pointing every way round the
 * circle. Under Method-1 each one turns with its line and folds so it still reads from the
 * bottom or the right; under Method-2 not one of them moves. Eight directions, exactly as
 * the figure prints them.
 * @returns {object[]}
 */
export function obliqueClock() {
  const c = [CHAMFERED.plate.length / 2, CHAMFERED.plate.height / 2];
  const r = 34;
  const out = [];
  for (let i = 0; i < 8; i++) {
    const deg = i * 45;
    const a = onCircle(c, r * 0.42, deg);
    const b = onCircle(c, r, deg);
    out.push({
      id: `ob-${i}`, kind: 'linear', axis: 'aligned',
      from: a, to: b, at: 0, noExtension: true, text: '20',
    });
  }
  return out;
}

// ============================================================================
// STEP 4 — arrangements of dimension lines (§4.3)
// ============================================================================

// Step 4 is set on the SLOTTED plate. A layout question needs several features strung along
// one edge before chain, parallel, running and co-ordinates mean anything at all — and three
// features plus the two end faces is the fewest that tells all five layouts apart. The Guide
// Plate would answer the same question with nine features and a spigot in the way.
const S4 = SLOTTED.features;

/** The x station of every located feature, plus the two faces, left to right. */
const STATIONS = Object.freeze([
  { x: 0, label: 'left face' },
  ...[S4.holeA, S4.slot, S4.holeB].map((f) => ({ x: f.at[0], y: f.at[1], label: f.label })),
  { x: SLOTTED.plate.length, label: 'right face' },
]);

/** Vertical stations for the two-direction running case. */
const Y_STATIONS = Object.freeze([0, S4.slot.at[1], S4.holeA.at[1], SLOTTED.plate.height]);

function chainSpecs() {
  const out = [];
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const a = STATIONS[i];
    const b = STATIONS[i + 1];
    out.push({
      id: `ch-${i}`, kind: 'linear', axis: 'x',
      from: [a.x, a.y ?? 0], to: [b.x, b.y ?? 0],
      at: L3.below1, text: String(Math.round(b.x - a.x)),
    });
  }
  return out;
}

function parallelSpecs() {
  const lanes = [L3.below1, L3.below2, L3.below3, L3.below4, L3.below5];
  return STATIONS.slice(1).map((s, i) => ({
    id: `pl-${i}`, kind: 'linear', axis: 'x',
    from: [0, 0], to: [s.x, s.y ?? 0],
    at: lanes[i], text: String(Math.round(s.x)),
  }));
}

function combinedSpecs() {
  // Fig. 4.16 — chain and parallel used together where each suits the feature. The two holes
  // go on the datum because their positions matter; the slot rides the chain off the first.
  return [
    { id: 'cb-0', kind: 'linear', axis: 'x', from: [0, 0], to: [S4.holeA.at[0], S4.holeA.at[1]], at: L3.below1, text: String(S4.holeA.at[0]) },
    { id: 'cb-1', kind: 'linear', axis: 'x', from: [S4.holeA.at[0], S4.holeA.at[1]], to: [S4.slot.at[0], S4.holeA.at[1]], at: L3.below1, text: String(S4.slot.at[0] - S4.holeA.at[0]) },
    { id: 'cb-2', kind: 'linear', axis: 'x', from: [0, 0], to: [S4.holeB.at[0], S4.holeB.at[1]], at: L3.below2, text: String(S4.holeB.at[0]) },
    { id: 'cb-3', kind: 'linear', axis: 'x', from: [0, 0], to: [SLOTTED.plate.length, 0], at: L3.below3, text: String(SLOTTED.plate.length) },
  ];
}

/**
 * Superimposed running dimensioning (§4.3 item 4).
 * @param {boolean} twoDirection  Fig. 4.18 rather than Fig. 4.17.
 * @param {'a'|'b'} style         Which of Fig. 4.17's two value-entry styles to use.
 */
function runningSpecs(twoDirection, style = 'b') {
  const turned = style === 'a';
  const out = [{ id: 'rn-origin', kind: 'origin', at: [0, L3.below1] }];
  STATIONS.slice(1).forEach((s, i) => {
    out.push({
      id: `rn-${i}`, kind: 'linear', axis: 'x',
      from: [0, 0], to: [s.x, s.y ?? 0], at: L3.below1,
      text: String(Math.round(s.x)),
      terminationEnds: 'far', textAt: 'far',
      textStyle: turned ? 'rotated' : undefined,
    });
  });
  if (!twoDirection) return out;

  out.push({ id: 'rn-vorigin', kind: 'origin', at: [L3.left1, 0] });
  Y_STATIONS.slice(1).forEach((y, i) => {
    out.push({
      id: `rnv-${i}`, kind: 'linear', axis: 'y',
      from: [0, 0], to: [0, y], at: L3.left1,
      text: String(Math.round(y)),
      terminationEnds: 'far', textAt: 'far',
      textStyle: turned ? 'rotated' : undefined,
    });
  });
  return out;
}

/**
 * Dimensioning by co-ordinates (§4.3 item 5, Fig. 4.19).
 * @param {'a'|'b'|'c'} form  Which of the figure's three representations to draw.
 */
function coordinateSpecs(form = 'a') {
  const pts = [S4.holeA, S4.slot, S4.holeB];
  const out = [{ id: 'co-origin', kind: 'origin', at: [0, 0] }];
  pts.forEach((f, i) => {
    out.push(form === 'b'
      // Fig. 4.19(b): the co-ordinates are written at the point itself, and there is no table.
      ? { id: `co-${i}`, kind: 'coordinate', mode: 'values', at: f.at, text: `x = ${f.at[0]}\ny = ${f.at[1]}` }
      // Figs. 4.19(a) and (c): a numbered point, read against the table beside the view.
      : { id: `co-${i}`, kind: 'coordinate', at: f.at, text: String(i + 1) });
  });
  return out;
}

/**
 * The §4.3 arrangements, each with the textbook's own note on when it is used and the honest
 * trade-off a student should weigh. Where the chapter's figure prints more than one form of
 * the same arrangement, that form is a VARIANT rather than a separate arrangement — because
 * chain-versus-parallel is a different kind of choice from Fig. 4.17(a)-versus-(b).
 *
 * @type {Array<{
 *   id:string, name:string, fig:string, use:string, when:string,
 *   space:string, clarity:string, making:string,
 *   build:() => object[],
 *   showsMethod?:boolean,
 *   table?:'full'|'xy'|null,
 *   variants?:Array<{ id:string, label:string, fig:string, note:string,
 *                     build:() => object[], table?:'full'|'xy'|null }>,
 * }>}
 */
export const ARRANGEMENTS = Object.freeze([
  {
    id: 'chain', name: 'Chain', fig: 'End to end',
    use: 'Each measurement starts where the last one finished.',
    when: 'Only where small errors adding up along the row cannot matter.',
    space: 'Compact — one row.', clarity: 'Each step reads directly.',
    making: 'Every feature is set out from the one before it, so errors stack.',
    build: chainSpecs,
  },
  {
    id: 'parallel', name: 'Parallel', fig: 'All from one edge',
    use: 'Every measurement taken from the same edge, each on its own line.',
    when: 'Where several sizes are all measured from one face.',
    space: 'Costly — a row per measurement.', clarity: 'Every value read from the same place.',
    making: 'No build-up: each feature is set out independently.',
    build: parallelSpecs,
  },
  {
    id: 'combined', name: 'Combined', fig: 'A bit of both',
    use: 'Chain and parallel mixed, whichever suits each feature.',
    when: 'The everyday choice.',
    space: 'Balanced.', clarity: 'Best of the lot, if you mix on purpose.',
    making: 'What matters goes on the datum; the rest goes on the chain.',
    build: combinedSpecs,
  },
  {
    id: 'running1', name: 'Running', fig: 'Stacked on one line',
    use: 'Parallel measurements squeezed onto a single line, with the start marked and one arrow at the far end of each.',
    when: 'Where space is short and the numbers will still be readable.',
    space: 'Cheapest of all — one row.', clarity: 'Only as good as the numbers stay legible.',
    making: 'Same as parallel: everything from one start point.',
    build: () => runningSpecs(false, 'b'),
    variants: [
      {
        // Step 3's two systems, met again on a layout: the same vocabulary, so the learner
        // sees that "unidirectional" and "aligned" are choices they carry from step to step.
        id: 'b', label: 'Unidirectional values',
        note: 'Numbers horizontal, clear above the line. Easier to read, but they need room before they start colliding.',
        build: () => runningSpecs(false, 'b'),
      },
      {
        id: 'a', label: 'Aligned values',
        note: 'Numbers turned to lie along their own line, just past each arrow. This is what buys the layout its space — turned numbers pack far closer.',
        build: () => runningSpecs(false, 'a'),
      },
    ],
  },
  {
    id: 'running2', name: 'Running, both ways', fig: 'From one corner',
    use: 'The same idea along both directions, from one corner.',
    when: 'Where features have to be placed across AND up, and space is short.',
    space: 'Cheapest in both directions.', clarity: 'Falls apart if the starting corner is not obvious.',
    making: 'A natural fit for a machine working from one corner.',
    build: () => runningSpecs(true, 'b'),
    variants: [
      {
        id: 'b', label: 'Unidirectional values',
        note: 'Numbers horizontal in both directions, all read from the one corner at the bottom left.',
        build: () => runningSpecs(true, 'b'),
      },
      {
        id: 'a', label: 'Aligned values',
        note: 'Numbers lying along their own lines on both axes — the tightest layout there is, and the one that most needs an unmistakable starting corner.',
        build: () => runningSpecs(true, 'a'),
      },
    ],
  },
  {
    id: 'coordinate', name: 'Co-ordinates', fig: 'Into a table',
    use: 'Number each feature and list how far across and up it sits.',
    when: 'Where there are lots of similar features — the view stays clean.',
    space: 'No dimension lines on the view at all.', clarity: 'The view is clear; the reading moves to the table.',
    making: 'Reads straight off as machine positions.',
    build: () => coordinateSpecs('a'),
    table: 'full',
    variants: [
      {
        id: 'a', label: 'Numbers + full table',
        note: 'Each feature carries only a number. The table holds across, up and size — so a change edits one row, not the drawing.',
        build: () => coordinateSpecs('a'), table: 'full',
      },
      {
        id: 'b', label: 'Written at each point',
        note: 'No table: each point carries its own two numbers. Quickest for a handful of features, hopeless for fifty.',
        build: () => coordinateSpecs('b'), table: null,
      },
      {
        id: 'c', label: 'Numbers + plain table',
        note: 'The same numbered points, but the table lists positions only. Drop the size column when the points are corners rather than holes — a table carries what the feature needs and nothing else.',
        build: () => coordinateSpecs('c'), table: 'xy',
      },
    ],
  },
]);

/**
 * DOES THE METHOD SHOW ON THIS LAYOUT? — derived, never declared.
 *
 * Aligned and unidirectional values are IDENTICAL on a horizontal dimension line: both sit
 * above it, both read from the bottom. So a layout that measures only across the part draws the
 * same sheet under either method, and four of the six here do exactly that. That is a true fact
 * about dimensioning and the lesson says so out loud rather than hiding it — but it has to be
 * WORKED OUT from each layout's own specs, because a hand-written list of "these four look the
 * same" would be a second source of truth that goes stale the first time a spec is edited.
 *
 * A layout shows the two methods apart when it carries a dimension line that is not horizontal:
 * a vertical linear one, a sloping one, or an angular one.
 */
const showsMethodApart = (specs) => specs.some((s) => (
  s.kind === 'angular'
  || s.kind === 'aligned'
  || (s.kind === 'linear' && s.axis && s.axis !== 'x')
));
for (const a of ARRANGEMENTS) {
  a.showsMethod = (a.variants ?? [a]).some((v) => showsMethodApart(v.build()));
  Object.freeze(a);
}

/** The layouts that DO show the method apart, named, for a card that has to point at one. */
export const METHOD_SHOWING_LAYOUTS = Object.freeze(
  ARRANGEMENTS.filter((a) => a.showsMethod).map((a) => a.name),
);

/**
 * The table that accompanies the co-ordinate arrangement (Fig. 4.19a). ø carries the shape
 * indication of each feature, exactly as the textbook's own table carries ø for its holes.
 */
export const COORDINATE_TABLE = Object.freeze(
  [S4.holeA, S4.slot, S4.holeB].map((f, i) => ({
    n: i + 1,
    x: f.at[0],
    y: f.at[1],
    dia: f.kind === 'circle' ? `ø${f.dia}` : f.kind === 'sphere' ? `Sø${f.dia}` : f.kind === 'square' ? `□${f.side}` : `${f.width} wide`,
    label: f.label,
  })),
);

// ============================================================================
// STEP 6 — the complete drawing
// ============================================================================

/**
 * The fully dimensioned Guide Plate: combined arrangement, Method-1, open terminations —
 * the textbook's own suggested class-work system (§4.5). Sizes are read straight off the
 * geometry in `dimensionData.js`, never typed in twice.
 * @returns {object[]}
 */
export function completeDrawing() {
  const cskRim = onCircle(F.cskHole.at, F.cskHole.dia / 2, 225);
  const sphereRim = onCircle(F.sphere.at, F.sphere.dia / 2, 115);
  const squareEdge = [F.square.at[0] + F.square.side / 2, F.square.at[1]];
  const slotL = F.slot.centres[0][0] - F.slot.width / 2;
  const slotR = F.slot.centres[1][0] + F.slot.width / 2;

  return [
    // --- located features along the length: a chain, closed by the overall size ---
    { id: 'd-30', kind: 'linear', axis: 'x', from: [0, 0], to: F.cskHole.at, at: LANE.below1, text: String(F.cskHole.at[0]) },
    { id: 'd-40', kind: 'linear', axis: 'x', from: F.cskHole.at, to: F.square.at, at: LANE.below1, text: String(F.square.at[0] - F.cskHole.at[0]) },
    { id: 'd-54', kind: 'linear', axis: 'x', from: F.square.at, to: F.slot.at, at: LANE.below1, text: String(F.slot.at[0] - F.square.at[0]) },
    { id: 'd-52', kind: 'linear', axis: 'x', from: F.slot.at, to: F.sphere.at, at: LANE.below1, text: String(F.sphere.at[0] - F.slot.at[0]) },
    { id: 'd-200', kind: 'linear', axis: 'x', from: [0, 0], to: [PLATE.length, 0], at: LANE.below2, text: String(PLATE.length) },
    { id: 'd-spigot-len', kind: 'linear', axis: 'x', from: [PLATE.length, 0], to: [SPIGOT_RECT.x1, SPIGOT_RECT.y0], at: LANE.below2, text: String(F.spigot.length) },

    // --- heights, from the bottom face as datum ---
    { id: 'd-25', kind: 'linear', axis: 'y', from: [0, 0], to: F.cskHole.at, at: LANE.left1, text: String(F.cskHole.at[1]) },
    { id: 'd-70', kind: 'linear', axis: 'y', from: [0, 0], to: F.bore.at, at: LANE.left2, text: String(F.bore.at[1]) },
    { id: 'd-100', kind: 'linear', axis: 'y', from: [0, 0], to: [12, PLATE.height], at: LANE.left3, text: String(PLATE.height) },

    // --- the step ---
    { id: 'd-95', kind: 'linear', axis: 'x', from: [0, 88], to: [PLATE.stepX, PLATE.height], at: LANE.above1, text: String(PLATE.stepX) },
    { id: 'd-50', kind: 'linear', axis: 'y', from: [PLATE.length, 0], to: [PLATE.length, PLATE.stepHeight], at: LANE.right1, text: String(PLATE.stepHeight) },

    // --- features ---
    { id: 'd-bore', kind: 'diameter', mode: 'leader', centre: F.bore.at, diaMm: F.bore.dia, dirDeg: 55, lengthMm: 26, barMm: 14, text: `ø${F.bore.dia}` },
    {
      // The bore's front mouth is chamfered (Fig. 4.26c). The note is routed RIGHT, into the
      // empty pocket above the low step — the only quiet corner of the sheet that is not
      // already a dimension lane, and well clear of the R12 corner note on the far side.
      id: 'd-ch-int', kind: 'leader', anchor: onCircle(F.bore.at, BORE_MOUTH_DIA / 2, 20),
      dirDeg: 20, lengthMm: 20, barMm: 14, head: 'arrow',
      text: `${F.bore.chamfer.width} × ${F.bore.chamfer.angle}°`,
    },
    {
      // Routed into the empty corner OUTSIDE the part — below the height lanes and left of
      // the length lanes — so the note crosses nothing (§4.6 rule 3).
      id: 'd-hole', kind: 'leader', anchor: cskRim, dirDeg: 225, lengthMm: 52, barMm: -14, head: 'arrow',
      text: `ø${F.cskHole.dia}\nø${CSK.dia} × ${CSK.angle}° CSK`,
    },
    { id: 'd-square', kind: 'leader', anchor: squareEdge, dirDeg: 55, lengthMm: 42, barMm: 14, head: 'arrow', text: `□${F.square.side}` },
    // Taken BELOW the part rather than above the step, so the region over the low step stays
    // free for the crown radius and no leader has to cross a projection line (§4.6 rule 3).
    { id: 'd-slot-len', kind: 'linear', axis: 'x', from: [slotL, F.slot.at[1]], to: [slotR, F.slot.at[1]], at: LANE.below3, text: String(SLOT_LENGTH) },
    {
      id: 'd-slot-wid', kind: 'linear', axis: 'y', noExtension: true, arrowsOutside: true,
      from: [F.slot.at[0], F.slot.at[1] - F.slot.width / 2], to: [F.slot.at[0], F.slot.at[1] + F.slot.width / 2],
      at: F.slot.at[0], text: String(F.slot.width),
    },
    { id: 'd-sphere', kind: 'leader', anchor: sphereRim, dirDeg: 75, lengthMm: 36, barMm: 14, head: 'arrow', text: `Sø${F.sphere.dia}` },
    { id: 'd-fillet', kind: 'radius', centre: [110, 65], radiusMm: PLATE.filletR, dirDeg: 225, text: `R${PLATE.filletR}` },
    { id: 'd-corner', kind: 'radius', centre: [12, 88], radiusMm: PLATE.cornerR, dirDeg: 135, text: `R${PLATE.cornerR}` },
    {
      id: 'd-crown', kind: 'radiusLarge', centre: CROWN_CENTRE, radiusMm: PLATE.crownR,
      onArcDeg: 90, jogMm: 12, falseCentre: [116, 41.7], text: `R${PLATE.crownR}`,
    },
    { id: 'd-chamfer', kind: 'leader', anchor: [195, 45], dirDeg: 40, lengthMm: 28, barMm: 14, head: 'arrow', text: `${PLATE.chamfer} × 45°` },
    {
      id: 'd-spigot-dia', kind: 'linear', axis: 'y', noExtension: true,
      from: [SPIGOT_MID_X, SPIGOT_RECT.y0], to: [SPIGOT_MID_X, SPIGOT_RECT.y1],
      at: SPIGOT_MID_X, text: `ø${F.spigot.dia}`,
    },
  ];
}

/**
 * The seeded faults of Step 6. Each names the rule it breaks, carries the SPEC OVERRIDE that
 * expresses the fault (merged over the correct spec of the same id, or added outright when
 * `add` is set), and the marker position the learner clicks.
 *
 * Faults 9–12 are NOTATION faults. The textbook's own worked examples (Figs. 4.28–4.34) and
 * every one of its exercise figures (4.35–4.44) are littered with them — `8R`, `20φ`,
 * `24 Dia`, `Rad 4 mm`, `80 mm Dia`, `D12`, `12D` — and correcting them is most of what
 * Examples 4.1 to 4.7 actually ask the student to do. They look like nothing and they are
 * the commonest fault in a first-year drawing.
 *
 * @type {Array<{
 *   id:string, target:string, add?:boolean, at:number[], title:string,
 *   rule:string, why:string, fix:string, wrong:object,
 * }>}
 */
export const MISTAKES = Object.freeze([
  {
    id: 'm-short', target: 'd-200', at: [100, LANE.below2 - 6],
    title: 'Projection line stops short',
    rule: 'Projection lines',
    why: 'It should run 1 to 2 mm past the dimension line. Stopping short leaves you guessing where the measurement really ends.',
    fix: 'Run it a little past the line.',
    wrong: { extShort: true },
  },
  {
    id: 'm-cross', target: 'd-50', at: [186, 46],
    title: 'Dimension line crossing the part',
    rule: 'Crossing lines',
    why: 'Dropped inside the outline, this one cuts across the chamfer and the slot. Two lines crossing can always be read as one.',
    fix: 'Move it clear of the part, 5 to 6 mm outside.',
    wrong: { at: 176 },
  },
  {
    id: 'm-arrow', target: 'd-100', at: [LANE.left3, PLATE.height + 10],
    title: 'A second style of arrow head',
    rule: 'Arrow heads',
    why: 'One style per drawing. This one is filled in solid while every other arrow on the sheet is open.',
    fix: 'Use the same head everywhere.',
    wrong: { termination: 'filled' },
  },
  {
    id: 'm-text', target: 'd-95', at: [PLATE.stepX * 0.78, LANE.above1 + 9],
    title: 'Value sitting on its line',
    rule: 'Placing the value',
    why: 'The number goes above the line, not on it. Dropped onto the line the two fight each other and neither reads cleanly.',
    fix: 'Lift it just clear, above the line, in the middle.',
    wrong: { textNudgeMm: [0, -6] },
  },
  {
    id: 'm-nosymbol', target: 'd-bore', at: [F.bore.at[0] + 22, F.bore.at[1] + 22],
    title: 'Shape symbol missing',
    rule: 'Shape symbols',
    why: 'A bare "40" on a leader could be a length, a width or a depth. ø40 can only be a diameter. (Across the circle you may drop it — the line shows what it spans. On a leader, never.)',
    fix: 'Write ø in front of the number.',
    wrong: { text: String(F.bore.dia) },
  },
  {
    id: 'm-leader', target: 'd-square', at: [F.square.at[0] + 26, F.square.at[1] + 17],
    title: 'Leader too shallow',
    rule: 'Leader lines',
    why: 'At 8° it lies almost flat, parallel to the dimension below it — so it reads as one more dimension line instead of a pointer.',
    fix: 'Take it off at 30° or steeper.',
    wrong: { dirDeg: 8, lengthMm: 46 },
  },
  {
    id: 'm-hidden', target: 'd-hidden-dim', add: true, at: [F.cskHole.at[0] + 26, LANE.below4 + 7],
    title: 'Measured from a dashed line',
    rule: 'Visible edges',
    why: 'This one runs to the dashed countersink on the BACK of the plate. This view cannot show a back-face feature truly, so the number measures a shadow.',
    fix: 'Measure from the drilled circle you can see, and put the countersink in a note.',
    wrong: {
      kind: 'linear', axis: 'x', tone: 'bad',
      from: [0, 0], to: [F.cskHole.at[0] + CSK.dia / 2, F.cskHole.at[1]],
      at: LANE.below4, text: String(F.cskHole.at[0] + CSK.dia / 2),
    },
  },
  {
    id: 'm-duplicate', target: 'd-duplicate', add: true, at: [F.slot.at[0] + 12, LANE.below5 + 7],
    title: 'The same size given twice',
    rule: 'Say it once',
    why: 'The slot is already placed by the chain below. Measuring it again from the left edge means that if the two ever disagree, nobody can tell which is right.',
    fix: 'State each size exactly once.',
    wrong: {
      kind: 'linear', axis: 'x', tone: 'bad',
      from: [0, 0], to: F.slot.at, at: LANE.below5, text: String(F.slot.at[0]),
    },
  },

  // --- notation faults (Figs. 4.28–4.44) ------------------------------------
  {
    id: 'm-order', target: 'd-corner', at: [-14, 108],
    title: 'Symbol written after the number',
    rule: 'Symbol goes first',
    why: 'R12, not 12R. With the symbol trailing, every reader has to go back and re-read the number to find out what it was.',
    fix: 'Symbol first, tight against the number: R12.',
    wrong: { text: `${PLATE.cornerR}R` },
  },
  {
    id: 'm-word', target: 'd-fillet', at: [70, 46],
    title: 'A word where a symbol belongs',
    rule: 'Symbol, not a word',
    why: '"Rad 15 mm" gets two things wrong in three words: use the symbol R, not the word — and sizes are already in millimetres, so "mm" never follows a number.',
    fix: 'Write R15. No word, no unit.',
    wrong: { text: `Rad ${PLATE.filletR} mm` },
  },
  {
    id: 'm-diaword', target: 'd-sphere', at: [196, 78],
    title: '"Dia" written out — and the ball lost',
    rule: 'Symbol, not a word',
    why: '"24 Dia" spells out what ø already says — and throws away the S, so a round SEAT now reads as a plain drilled hole the same size.',
    fix: 'Write Sø24: symbol first, and the S that says it is a ball.',
    wrong: { text: `${F.sphere.dia} Dia` },
  },
  {
    id: 'm-dprefix', target: 'd-spigot-dia', at: [SPIGOT_MID_X, SPIGOT_RECT.y1 + 12],
    title: '"D" used for diameter',
    rule: 'Use ø, not D',
    why: 'D is not a shape symbol — it is a hand-lettering habit. And on a rectangle, where nothing else says the feature is round, ø is the only thing making this a cylinder rather than a flat tongue.',
    fix: 'Write ø28.',
    wrong: { text: `D${F.spigot.dia}` },
  },
]);
