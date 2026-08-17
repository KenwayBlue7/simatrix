// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders to match the stated problem, and the check goes green
// once every targeted param is within its tolerance (RULES.md §6.1's ±0.5-style
// tolerance, re-expressed per param: an angle in degrees, a length in millimetres, or an
// exact integer count).
//
// Layering (CLAUDE.md): pure data, imports nothing. Consumed by problemLibrary.js.

export const TIERS = Object.freeze([
  { id: 'practice', label: 'Practice', blurb: '' },
  { id: 'challenge', label: 'Challenge', blurb: '' },
]);

/** The single clone-scope switch — every tier this build ships is enabled. */
export const ENABLED_TIERS = Object.freeze(['practice', 'challenge']);

/** Human labels for every self-check target field. */
export const FIELD_LABELS = Object.freeze({
  length: 'length',
  n: 'number of parts',
  angle: 'angle',
  a: 'side a',
  b: 'side b',
  c: 'side c',
});

export const PROBLEMS = [
  {
    id: 'divide-128-7',
    tier: 'practice',
    constructionId: 'divide-line',
    statement: 'Divide a 128 mm line graphically into 7 equal parts.',
    target: { length: 128, n: 7 },
    tolerance: { length: 1, n: 0 },
    hints: [
      'Set the Length AB slider to 128 mm.',
      'Set n (number of parts) to 7.',
      'Press Play on the Construct step to watch the division build, then check each part measures 128 ÷ 7 mm.',
    ],
  },
  {
    id: 'divide-96-5',
    tier: 'practice',
    constructionId: 'divide-line',
    statement: 'Divide a 96 mm line graphically into 5 equal parts.',
    target: { length: 96, n: 5 },
    tolerance: { length: 1, n: 0 },
    hints: [
      'Set the Length AB slider to 96 mm.',
      'Set n to 5.',
    ],
  },
  {
    id: 'bisect-140',
    tier: 'challenge',
    constructionId: 'bisect-angle',
    statement: 'Bisect an angle of 140°. Confirm each half measures 70°.',
    target: { angle: 140 },
    tolerance: { angle: 1 },
    hints: [
      'Set the Angle AOB slider to 140°.',
      'Press Play, then read the two resulting angles in the Verify step — each should be 70°.',
    ],
  },
  {
    id: 'triangle-60-80-100',
    tier: 'challenge',
    constructionId: 'triangle-three-sides',
    statement: 'Construct a triangle with sides 60 mm, 80 mm, and 100 mm.',
    target: { a: 60, b: 80, c: 100 },
    tolerance: { a: 1, b: 1, c: 1 },
    hints: [
      'Set side a (BC) to 60 mm, side b (CA) to 80 mm, and side c (AB) to 100 mm.',
      'Check 60 + 80 > 100 before you start — the triangle inequality must hold, or no triangle can close.',
    ],
  },
];

/** Problems whose tier is enabled for this build. */
export function enabledProblems() {
  return PROBLEMS.filter((p) => ENABLED_TIERS.includes(p.tier));
}

/** Group a problem list by tier, in TIERS display order. */
export function groupByTier(list) {
  return TIERS
    .filter((tier) => ENABLED_TIERS.includes(tier.id))
    .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
    .filter((g) => g.problems.length > 0);
}
