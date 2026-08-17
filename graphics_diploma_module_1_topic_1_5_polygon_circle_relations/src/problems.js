// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders to match the stated problem, and the check goes green
// once every targeted param is within its tolerance (RULES.md §6.1's ±0.5-style tolerance,
// re-expressed per param). superscribe-polygon's `n` is a numeric-STRING id ('4'/'6'/'8'/
// '12', not a plain number — see constructions.js's SUPERSCRIBE_N_CHOICES) but the generic
// matches() subtraction still works unmodified: JS coerces '8' - '8' to 0 automatically, so
// no special-casing was needed here, unlike Topic 1.2's genuinely non-numeric `mode` field.
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
  a: 'side a',
  b: 'side b',
  c: 'side c',
  diameter: 'circle diameter',
  n: 'number of sides',
});

export const PROBLEMS = [
  {
    id: 'incircle-100-80-70',
    tier: 'practice',
    constructionId: 'incircle-triangle',
    statement: 'A triangle has sides 100 mm, 80 mm, and 70 mm. Inscribe a circle in it.',
    target: { a: 100, b: 80, c: 70 },
    tolerance: { a: 1, b: 1, c: 1 },
    hints: [
      'Set side a (BC) to 100 mm, side b (CA) to 80 mm, and side c (AB) to 70 mm.',
      'Press Play, then check the finished circle touches all three sides without crossing any of them.',
    ],
  },
  {
    id: 'circumcircle-70-80-50',
    tier: 'practice',
    constructionId: 'circumcircle-triangle',
    statement: 'A triangle has sides 70 mm, 80 mm, and 50 mm. Circumscribe a circle about it.',
    target: { a: 70, b: 80, c: 50 },
    tolerance: { a: 1, b: 1, c: 1 },
    hints: [
      'Set side a (BC) to 70 mm, side b (CA) to 80 mm, and side c (AB) to 50 mm.',
      'Press Play, then confirm the finished circle passes through all three vertices A, B, and C.',
    ],
  },
  {
    id: 'superscribe-octagon-80',
    tier: 'practice',
    constructionId: 'superscribe-polygon',
    statement: 'Superscribe a regular octagon about a circle of diameter 80 mm.',
    target: { diameter: 80, n: '8' },
    tolerance: { diameter: 1, n: 0 },
    hints: [
      'Set the Circle diameter slider to 80 mm.',
      'On the Construct step, choose "Octagon (n=8)" from the shape switcher.',
      'Press Play, then check every side of the octagon touches the circle at exactly one point.',
    ],
  },
  {
    id: 'inscribe-pentagon-90',
    tier: 'practice',
    constructionId: 'inscribe-polygon',
    statement: 'Inscribe a regular pentagon inside a circle of diameter 90 mm.',
    target: { diameter: 90, n: 5 },
    tolerance: { diameter: 1, n: 0 },
    hints: [
      'Set the Circle diameter slider to 90 mm and Number of sides to 5.',
      'Press Play, then check all five vertices land on the circle and the sides read close to equal.',
    ],
  },
  {
    id: 'inscribe-heptagon-90',
    tier: 'challenge',
    constructionId: 'inscribe-polygon',
    statement: 'Inscribe a regular heptagon (7 sides) inside a circle of diameter 90 mm.',
    target: { diameter: 90, n: 7 },
    tolerance: { diameter: 1, n: 0 },
    hints: [
      'Set the Circle diameter slider to 90 mm and Number of sides to 7.',
      'A heptagon cannot be built exactly with a compass and straightedge at all — this is the general method\'s own practical approximation, not a mistake.',
      'Press Play, then compare the seven sides — close to equal, not exactly.',
    ],
  },
  {
    id: 'ratio-division-incircle-capstone',
    tier: 'challenge',
    constructionId: 'incircle-triangle',
    statement: 'Advanced: divide a 152 mm line into the ratio 4:6:5, then use the three resulting lengths as a triangle\'s sides and inscribe a circle in it.',
    target: { a: 40.5, b: 60.8, c: 50.7 },
    tolerance: { a: 1, b: 1, c: 1 },
    hints: [
      'Divide 152 mm into 4+6+5 = 15 equal parts (Topic 1.1\'s line-division technique): each part is 152 ÷ 15 ≈ 10.13 mm.',
      'The three sides are 4 parts ≈ 40.5 mm, 6 parts ≈ 60.8 mm, and 5 parts ≈ 50.7 mm.',
      'Set side a, b, and c to those three lengths, then press Play to inscribe the circle as usual.',
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
