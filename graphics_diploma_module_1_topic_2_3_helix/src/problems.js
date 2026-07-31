// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// The cylindrical problem targets `hand` (it states "right-hand" explicitly) alongside
// its numeric measurements — the student clicks the toggle themselves to match it, same
// as dialing any slider (problemLibrary.js's matches() has the string-equality branch
// Topic 2.2 introduced). The spring problem doesn't state a hand, so `hand` is left out
// of its target entirely — unstated is unchecked, not defaulted to a guess.
// `theta` (Sweep Angle) is never targeted, same reasoning as every prior topic in this
// set: it's a reveal/reading control, not a stated problem parameter.
//
// Layering (CLAUDE.md): pure data, imports nothing. Consumed by problemLibrary.js.

export const TIERS = ['practice', 'challenge'];

export const PROBLEMS = [
  {
    id: 'cylindrical-right-50-48-2turns',
    tier: 'practice',
    constructionId: 'cylindrical-helix',
    statement: 'Plot two complete turns of a cylindrical right-hand helix, 50 mm diameter, 48 mm pitch.',
    target: { hand: 'right', diameter: 50, pitch: 48, turns: 2 },
    tolerance: { diameter: 1, pitch: 1, turns: 0 },
    hints: [
      'Set the hand toggle to Right.',
      'Set Cylinder diameter to 50 mm and Pitch to 48 mm.',
      'Set Complete turns to 2, then scrub Sweep Angle to 720° (or press Play) to see both turns.',
    ],
  },
  {
    id: 'spring-12-50mean-48-2coils',
    tier: 'challenge',
    constructionId: 'helical-spring',
    statement: 'Draw two complete coils of a helical spring: circular wire section diameter 12 mm, outside spring diameter 62 mm, pitch 48 mm.',
    target: { wireDiameter: 12, meanDiameter: 50, pitch: 48, turns: 2 },
    tolerance: { wireDiameter: 1, meanDiameter: 1, pitch: 1, turns: 0 },
    hints: [
      'Set Wire diameter to 12 mm.',
      'Outside diameter 62 mm is the mean diameter plus the wire diameter — set Mean coil diameter to 62 − 12 = 50 mm.',
      'Set Pitch to 48 mm and Complete turns to 2, then scrub Sweep Angle to 720° (or press Play) to see both coils.',
    ],
  },
];

export const groupByTier = () =>
  Object.fromEntries(TIERS.map((t) => [t, PROBLEMS.filter((p) => p.tier === t)]));
