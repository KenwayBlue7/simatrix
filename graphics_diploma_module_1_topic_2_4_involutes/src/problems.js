// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// `theta` (Roll Angle, involute-of-a-circle only) is a `given[]` entry too, but no problem
// below targets it — the self-check only iterates a problem's OWN target keys
// (problemLibrary.js's matches()), so leaving theta out of `target` leaves it unchecked/
// free: the student scrubs it to read the curve, it is never part of "did you set this up
// right."
//
// Moved verbatim from graphics_diploma_module_1_topic_2_1_roulettes (ADR-150) — their
// target values already matched this topic's own build brief exactly, so no re-authoring
// was needed.
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
  diameter: 'circle diameter',
  side: 'side length',
});

export const PROBLEMS = [
  {
    id: 'involute-circle-40',
    tier: 'practice',
    constructionId: 'involute-circle',
    statement: 'Draw the involute of a circle 40 mm in diameter.',
    target: { diameter: 40 },
    tolerance: { diameter: 1 },
    hints: [
      'Set the Circle diameter slider to 40 mm.',
      'Press Play on the Construct step to watch the string unwind one full turn.',
    ],
  },
  {
    id: 'involute-triangle-30',
    tier: 'challenge',
    constructionId: 'involute-triangle',
    statement: 'Draw the involute of an equilateral triangle of side 30 mm; find the tangent/normal at the midpoint of the third segment.',
    target: { side: 30 },
    tolerance: { side: 1 },
    hints: [
      'Set the Triangle side slider to 30 mm.',
      'The third segment is the arc of radius 90 mm (3 × 30 mm) — its midpoint is halfway through that arc’s sweep.',
    ],
  },
  {
    id: 'involute-square-25',
    tier: 'challenge',
    constructionId: 'involute-square',
    statement: 'Draw the involute of a square of side 25 mm; find the tangent/normal at the midpoint of the third segment.',
    target: { side: 25 },
    tolerance: { side: 1 },
    hints: [
      'Set the Square side slider to 25 mm.',
      'The third segment is the arc of radius 75 mm (3 × 25 mm) — its midpoint is halfway through that arc’s sweep.',
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
