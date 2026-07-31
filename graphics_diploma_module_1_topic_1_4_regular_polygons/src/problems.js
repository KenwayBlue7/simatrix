// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders to match the stated problem, and the check goes green
// once every targeted param is within its ±1 mm/±0 count tolerance (RULES.md §6.1).
//
// `method` is deliberately NEVER a `target` key here, same as Topic 1.2's `mode` — the
// self-check (`matches()`, problemLibrary.js) does plain numeric subtraction per key, which
// breaks on a string. Problems that name a specific method (the pentagon/hexagon set below,
// each stated once per method per the CONTEXT's "by all three named methods") rely on the
// hint text to steer which method to pick; the checkmark itself confirms the numeric side
// (and n, for the general polygon) matches, not which derivation was used to get there.
//
// Layering (CLAUDE.md): pure data, imports nothing. Consumed by problemLibrary.js.

export const TIERS = ['practice', 'challenge'];

export const PROBLEMS = [
  {
    id: 'pentagon-45-angle',
    tier: 'practice',
    constructionId: 'pentagon',
    statement: 'Construct a regular pentagon of side 45 mm using the 54° angle method.',
    target: { side: 45 },
    tolerance: { side: 1 },
    hints: [
      'Set the Side length slider to 45 mm.',
      'On the Construct step, choose the "54° Angle + Circle" method.',
      'Press Play, then check all five sides measure 45 mm and every interior angle is 108°.',
    ],
  },
  {
    id: 'pentagon-45-circles',
    tier: 'practice',
    constructionId: 'pentagon',
    statement: 'Construct the same 45 mm pentagon again, this time using the two-circles-and-an-arc method.',
    target: { side: 45 },
    tolerance: { side: 1 },
    hints: [
      'Side length stays 45 mm.',
      'Switch the method to "Two Circles + Arc".',
      'Press Play — the finished pentagon should be identical to the angle-method version, just built a different way.',
    ],
  },
  {
    id: 'pentagon-45-arcs',
    tier: 'challenge',
    constructionId: 'pentagon',
    statement: 'Construct the same 45 mm pentagon a third way, using only three compass arcs (no protractor, no full circles).',
    target: { side: 45 },
    tolerance: { side: 1 },
    hints: [
      'Side length stays 45 mm.',
      'Switch the method to "Three Arcs".',
      'All three methods should land on the exact same pentagon — that is the point of comparing them.',
    ],
  },
  {
    id: 'hexagon-35-angle',
    tier: 'practice',
    constructionId: 'hexagon',
    statement: 'Construct a regular hexagon of side 35 mm using the 60° lines method.',
    target: { side: 35 },
    tolerance: { side: 1 },
    hints: [
      'Set the Side length slider to 35 mm.',
      'Choose the "60° Lines" method.',
      'A hexagon’s circumradius always equals its side — check the distance from the centre to any vertex reads 35 mm too.',
    ],
  },
  {
    id: 'hexagon-35-compass',
    tier: 'practice',
    constructionId: 'hexagon',
    statement: 'Construct the same 35 mm hexagon again using only a compass, no protractor.',
    target: { side: 35 },
    tolerance: { side: 1 },
    hints: [
      'Side length stays 35 mm.',
      'Switch the method to "Compass + Circle".',
      'Same hexagon, found without ever measuring an angle.',
    ],
  },
  {
    id: 'heptagon-30-semicircle',
    tier: 'challenge',
    constructionId: 'ngon',
    statement: 'Construct a regular heptagon (7 sides) of side 30 mm using the semicircle-division method.',
    target: { side: 30, n: 7 },
    tolerance: { side: 1, n: 0 },
    hints: [
      'Set the Side length slider to 30 mm and Number of sides to 7.',
      'Choose the "Semicircle Division" method — this is the one general method that works for a 7-gon at all (a heptagon cannot be built with a compass alone).',
      'Press Play, then confirm each interior angle reads about 128.6°.',
    ],
  },
  {
    id: 'octagon-30-bisector',
    tier: 'challenge',
    constructionId: 'ngon',
    statement: 'Construct a regular octagon (8 sides) of side 30 mm using the perpendicular-bisector method.',
    target: { side: 30, n: 8 },
    tolerance: { side: 1, n: 0 },
    hints: [
      'Set the Side length slider to 30 mm and Number of sides to 8.',
      'Choose the "Perpendicular Bisector" method.',
      'Press Play, then confirm each interior angle reads 135°.',
    ],
  },
  {
    id: 'pentagon-hexagon-shared-side',
    tier: 'challenge',
    constructionId: 'hexagon',
    statement: 'Applied problem: a pentagon and a hexagon share a common side of 35 mm. Construct the hexagon first, then switch to the pentagon and build it at the same 35 mm side length.',
    target: { side: 35 },
    tolerance: { side: 1 },
    hints: [
      'This loads the hexagon at 35 mm — build it with either method.',
      'Then open the picker again, choose Regular Pentagon, and set its side to 35 mm too.',
      'Imagine both shapes drawn on the same 35 mm edge — this is how a pentagon-and-hexagon combination tile is laid out on a drawing board.',
    ],
  },
];

export const groupByTier = () =>
  Object.fromEntries(TIERS.map((t) => [t, PROBLEMS.filter((p) => p.tier === t)]));
