// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// `theta` (Roll Angle) is a `given[]` entry too, but no problem below targets it — the
// self-check only iterates a problem's OWN target keys (problemLibrary.js's matches()),
// so leaving theta out of `target` leaves it unchecked/free: the student scrubs it to
// read the curve, it is never part of "did you set this up right."
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
  diameter: 'rolling circle diameter',
  offsetBeyond: 'point distance beyond rim',
  insetWithin: 'point distance inside rim',
  genDiameter: 'generating circle diameter',
  baseRadius: 'base circle radius',
});

export const PROBLEMS = [
  {
    id: 'cycloid-56',
    tier: 'practice',
    constructionId: 'cycloid',
    statement: 'A wheel 56 mm in diameter rolls along a straight line. Trace the cycloid and find the tangent and normal at a point 40 mm from the line.',
    target: { diameter: 56 },
    tolerance: { diameter: 1 },
    hints: [
      'Set the Rolling circle diameter slider to 56 mm.',
      'Scrub the Roll Angle slider until the traced point sits about 40 mm above the base line, then read the tangent/normal built at M.',
    ],
  },
  {
    id: 'superior-trochoid-48-6',
    tier: 'challenge',
    constructionId: 'superior-trochoid',
    statement: 'A flanged carriage wheel 48 mm in diameter has a flange 60 mm in diameter. Trace the curve traced by a point on the flange, and find the tangent/normal at a point above the rail.',
    target: { diameter: 48, offsetBeyond: 6 },
    tolerance: { diameter: 1, offsetBeyond: 0.5 },
    hints: [
      'Set the Rolling circle diameter slider to 48 mm.',
      'The flange radius (30 mm) is 6 mm beyond the wheel’s own rim (24 mm) — set Point distance beyond rim to 6 mm.',
    ],
  },
  {
    id: 'inferior-trochoid-52-16',
    tier: 'challenge',
    constructionId: 'inferior-trochoid',
    statement: 'A disc 52 mm in diameter carries a point 16 mm from its centre. Trace the curve and find the tangent/normal on the first half of it.',
    target: { diameter: 52, insetWithin: 10 },
    tolerance: { diameter: 1, insetWithin: 0.5 },
    hints: [
      'Set the Rolling circle diameter slider to 52 mm (radius 26 mm).',
      'A point 16 mm from the centre is 10 mm inside the 26 mm rim — set Point distance inside rim to 10 mm.',
    ],
  },
  {
    id: 'epicycloid-46-180',
    tier: 'challenge',
    constructionId: 'epicycloid',
    statement: 'A circle 46 mm in diameter rolls on the outside of a circle 180 mm in diameter. Trace the epicycloid and find the tangent/normal on the second quarter of the curve.',
    target: { genDiameter: 46, baseRadius: 90 },
    tolerance: { genDiameter: 1, baseRadius: 1 },
    hints: [
      'Set the Generating circle diameter slider to 46 mm.',
      'A 180 mm base circle has radius 90 mm — set Base circle radius to 90 mm.',
      'Scrub Roll Angle to about 180° for the second quarter of the curve.',
    ],
  },
  {
    id: 'hypocycloid-44-200',
    tier: 'challenge',
    constructionId: 'hypocycloid',
    statement: 'A circle 44 mm in diameter rolls inside a circle 200 mm in diameter. Trace the hypocycloid and find the tangent/normal on the third quarter of the curve.',
    target: { genDiameter: 44, baseRadius: 100 },
    tolerance: { genDiameter: 1, baseRadius: 1 },
    hints: [
      'Set the Generating circle diameter slider to 44 mm.',
      'A 200 mm base circle has radius 100 mm — set Base circle radius to 100 mm.',
      'Scrub Roll Angle to about 270° for the third quarter of the curve.',
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
