// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Both problems below target `mode` (the growth law) alongside the numeric measurements —
// the student clicks the toggle themselves to match it, same as dialing any slider
// (problemLibrary.js's matches() gained a string-equality branch for exactly this).
// `theta` (Roll Angle) is never targeted, same reasoning as Topic 2.1: it's a reveal/
// reading control, not a stated problem parameter.
//
// EXCLUDED, deliberately: the source chapter's Exercise 7.9 (an oscillating 120mm lever
// swinging through 30°/60°, tracing the locus of a particle sliding along it) is NOT a
// spiral — it's a moving-point-on-a-swinging-lever locus, not a pole-centred growing-
// radius curve, and doesn't fit either growth law this topic's engine models. It also
// doesn't obviously belong to Topic 2.1 (Roulettes) or the planned Topic 2.3 (Helix). Left
// out of this problem set rather than force-fit or silently dropped — see this topic's
// CLAUDE.md for the same note.
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
  mode: 'growth law',
  rMin: 'least radius',
  rMax: 'greatest radius',
  logRMax: 'greatest radius',
  ratio: 'ratio of successive radii',
  stepAngle: 'angle between successive radii',
});

export const PROBLEMS = [
  {
    id: 'archimedean-30-90',
    tier: 'practice',
    constructionId: 'spiral',
    statement: 'Draw an Archimedean spiral of one convolution whose radius vector grows from 30 mm to 90 mm. Find the tangent and normal at a point 45 mm from the pole.',
    target: { mode: 'archimedean', rMin: 30, rMax: 90 },
    tolerance: { rMin: 1, rMax: 1 },
    hints: [
      'Set the growth law toggle to Archimedean.',
      'Set Least radius (Rmin) to 30 mm and Greatest radius (Rmax) to 90 mm.',
      'Scrub the Roll Angle slider until the traced point sits about 45 mm from the pole O, then read the tangent/normal built at M.',
    ],
  },
  {
    id: 'logarithmic-112-30',
    tier: 'challenge',
    constructionId: 'spiral',
    statement: 'Draw a logarithmic spiral of one convolution: ratio of successive radii 7:6, angle between successive radii 30°, greatest radial vector 112 mm. Find the tangent and normal at a point 60 mm from the pole.',
    target: { mode: 'logarithmic', logRMax: 112, ratio: 7 / 6, stepAngle: 30 },
    tolerance: { logRMax: 1, ratio: 0.01, stepAngle: 1 },
    hints: [
      'Set the growth law toggle to Logarithmic.',
      'Set Greatest radius (Rmax) to 112 mm and Angle between successive radii to 30°.',
      'A 7:6 ratio is about 1.17 — type it into the Ratio field for exact precision.',
      'Scrub the Roll Angle slider until the traced point sits about 60 mm from the pole O, then read the tangent/normal at M — notice the angle stays the same wherever you scrub to.',
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
