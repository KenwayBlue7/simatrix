// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders to match the stated problem, and the check goes green
// once every targeted param is within its tolerance. All four problems here target
// millimetre lengths/radii, so every tolerance is the same ±1 mm band.
//
// Layering (CLAUDE.md): pure data, imports nothing. Consumed by problemLibrary.js.

export const TIERS = ['practice', 'challenge'];

export const PROBLEMS = [
  {
    id: 'tangent-lines-30-70',
    tier: 'practice',
    constructionId: 'tangent-two-lines',
    statement: 'Draw a tangent arc of radius 30 mm to two lines meeting at 70°.',
    target: { radius: 30, angle: 70 },
    tolerance: { radius: 1, angle: 1 },
    hints: [
      'Set the Arc radius slider to 30 mm.',
      'Set the Angle between lines slider to 70°.',
      'Press Play, then check the arc touches each line at T1 and T2 — nowhere else.',
    ],
  },
  {
    id: 'tangent-line-circle-ext-25',
    tier: 'practice',
    constructionId: 'tangent-line-circle-ext',
    statement: "Draw an arc of radius 25 mm tangential externally to a circle of radius 35 mm, with the line 55 mm from the circle's centre. Mark the points of tangency.",
    target: { radius: 25, circleRadius: 35, distance: 55 },
    tolerance: { radius: 1, circleRadius: 1, distance: 1 },
    hints: [
      'Set the Arc radius to 25 mm and the Circle’s radius to 35 mm.',
      "Set the distance to the circle's centre to 55 mm.",
      'External tangency: the arc centre sits circleRadius + radius from C — that distance should read 60 mm once built.',
    ],
  },
  {
    id: 'tangent-line-circle-int-25',
    tier: 'challenge',
    constructionId: 'tangent-line-circle-int',
    statement: "Draw an arc of radius 25 mm tangential internally to an arc of radius 50 mm, with the line 35 mm from the circle's centre. Mark the points of tangency.",
    target: { radius: 25, circleRadius: 50, distance: 35 },
    tolerance: { radius: 1, circleRadius: 1, distance: 1 },
    hints: [
      'Set the Arc radius to 25 mm and the Circle’s radius to 50 mm.',
      "Set the distance to the circle's centre to 35 mm — notice the line now crosses the circle; that's expected for the internal case.",
      'Internal tangency uses the DIFFERENCE of the radii (50 − 25 = 25 mm), not the sum — that is the one line-circle problems 2 and 3 are designed to contrast.',
    ],
  },
  {
    id: 'tangent-two-circles-60',
    tier: 'challenge',
    constructionId: 'tangent-two-circles',
    statement: 'Draw an arc of radius 60 mm tangential externally to two circles 90 mm apart, of radii 35 mm and 30 mm. Mark the points of tangency.',
    target: { radius: 60, r1: 35, r2: 30, distance: 90 },
    tolerance: { radius: 1, r1: 1, r2: 1, distance: 1 },
    hints: [
      'Set Circle 1 radius to 35 mm, Circle 2 radius to 30 mm, and Distance between centres to 90 mm.',
      'Set the Arc radius to 60 mm. Leave the mode toggle on External.',
      'Try the Internal toggle afterward on these same circles — at this distance, does an internal (enclosing) arc even exist?',
    ],
  },
];

export const groupByTier = () =>
  Object.fromEntries(TIERS.map((t) => [t, PROBLEMS.filter((p) => p.tier === t)]));
