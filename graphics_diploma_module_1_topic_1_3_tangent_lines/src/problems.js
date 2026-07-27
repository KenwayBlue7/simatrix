// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders to match the stated problem, and the check goes green
// once every targeted param is within its ±1 mm/±1° tolerance band (RULES.md §6.1).
// The belt-drive problem is an applied/capstone variant of the internal-tangents
// construction (a crossed flat-belt drive IS a pair of common internal tangents,
// PRODUCT.md's "recognize professional tools later" goal) — same constructionId, its
// own statement framing the pulleys/belt instead of bare circles.
//
// Layering (CLAUDE.md): pure data, imports nothing. Consumed by problemLibrary.js.

export const TIERS = ['practice', 'challenge'];

export const PROBLEMS = [
  {
    id: 'tangent-from-point-100-100-30',
    tier: 'practice',
    constructionId: 'tangent-from-point',
    statement: "Draw the two tangents to a circle of diameter 100 mm from a point 100 mm from its centre, with the centre-to-point line inclined 30° to the horizontal. Mark the points of tangency.",
    target: { circleDiameter: 100, distance: 100, angle: 30 },
    tolerance: { circleDiameter: 1, distance: 1, angle: 1 },
    hints: [
      'Set the Circle diameter slider to 100 mm.',
      'Set the Distance from point to centre to 100 mm, and the Angle to 30°.',
      'Press Play, then check both tangent lines touch the circle only at T1 and T2 — nowhere else.',
    ],
  },
  {
    id: 'tangent-two-circles-ext-80-50-120',
    tier: 'practice',
    constructionId: 'tangent-two-circles-ext',
    statement: 'Draw the common external tangents to circles of diameter 80 mm and 50 mm, with centres 120 mm apart.',
    target: { diameter1: 80, diameter2: 50, centreDistance: 120 },
    tolerance: { diameter1: 1, diameter2: 1, centreDistance: 1 },
    hints: [
      'Set Circle 1 diameter to 80 mm and Circle 2 diameter to 50 mm.',
      'Set the distance between centres to 120 mm.',
      'External tangents never cross the centre line — both should sit on the same side as each other.',
    ],
  },
  {
    id: 'tangent-two-circles-int-50-30-90',
    tier: 'challenge',
    constructionId: 'tangent-two-circles-int',
    statement: 'Draw the common internal tangents to circles of diameter 50 mm and 30 mm, with centres 90 mm apart.',
    target: { diameter1: 50, diameter2: 30, centreDistance: 90 },
    tolerance: { diameter1: 1, diameter2: 1, centreDistance: 1 },
    hints: [
      'Set Circle 1 diameter to 50 mm and Circle 2 diameter to 30 mm.',
      'Set the distance between centres to 90 mm.',
      'Internal tangents cross BETWEEN the circles — the auxiliary circle radius is the SUM of the two radii (40 mm), not the difference.',
    ],
  },
  {
    id: 'belt-drive-crossed',
    tier: 'challenge',
    constructionId: 'tangent-two-circles-int',
    statement: 'Applied problem: two pulleys of diameter 60 mm and 36 mm, centres 100 mm apart, are connected by a CROSSED flat belt. The belt is the two common internal tangents — construct them to find the belt’s straight-run length.',
    target: { diameter1: 60, diameter2: 36, centreDistance: 100 },
    tolerance: { diameter1: 1, diameter2: 1, centreDistance: 1 },
    hints: [
      'This is the same construction as the internal-tangents problem above — a crossed belt drive IS a pair of internal common tangents.',
      'Set Circle 1 (pulley 1) diameter to 60 mm, Circle 2 (pulley 2) diameter to 36 mm, centres 100 mm apart.',
      'Each tangent line segment (T1–T2 or T3–T4) is one straight run of belt — read its length off the Verify step.',
    ],
  },
];

export const groupByTier = () =>
  Object.fromEntries(TIERS.map((t) => [t, PROBLEMS.filter((p) => p.tier === t)]));
