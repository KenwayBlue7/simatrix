// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Problems are drawn straight from the two reference texts' own worked examples
// (K.C. John Ch.15 — the closer-scoped diploma-level text; Bhatt Ch.15 only where K.C.
// John is silent, per this topic's build brief): Example 15.1 (prism), Example 15.4
// (cylinder). The elbow problem is originated (ADR-112: no two-piece worked example
// exists in either text), phrased consistently with the two textbook problems' own style.
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
  baseLength: 'base length',
  baseWidth: 'base width',
  height: 'height',
  diameter: 'diameter',
  legLength: 'leg length',
});

export const PROBLEMS = [
  {
    id: 'prism-24x30x40',
    tier: 'practice',
    constructionId: 'prism',
    statement: 'Draw the development of a rectangular prism, base 24 mm × 30 mm, axis 40 mm long (K.C. John Example 15.1).',
    target: { baseLength: 30, baseWidth: 24, height: 40 },
    tolerance: { baseLength: 1, baseWidth: 1, height: 1 },
    hints: [
      'Set Base length (the edge parallel to VP, shown true in the front view) to 30 mm.',
      'Set Base width (the depth edge) to 24 mm.',
      'Set Height to 40 mm, then press Play — stretch-out = 2×(30+24) = 108 mm.',
    ],
  },
  {
    id: 'cylinder-44x60',
    tier: 'practice',
    constructionId: 'cylinder',
    statement: 'Develop the lateral surface of a cylinder, 44 mm diameter, 60 mm height (K.C. John Example 15.4).',
    target: { diameter: 44, height: 60 },
    tolerance: { diameter: 1, height: 1 },
    hints: [
      'Set Diameter to 44 mm.',
      'Set Height to 60 mm, then press Play.',
      'Check the stretch-out reads π×44 ≈ 138.2 mm, divided into twelve equal generators.',
    ],
  },
  {
    id: 'elbow-50-70',
    tier: 'challenge',
    constructionId: 'elbow',
    statement: 'Develop the lateral surface of a two-piece 90° pipe elbow, 50 mm diameter, 70 mm short leg — each piece cut once at 45° (a two-piece simplification of Bhatt Problem 15-13 / K.C. John Example 15.18’s three-piece bend, built from the single-truncation cylinder construction — Bhatt Fig. 15-10 / K.C. John Fig. 15.12).',
    target: { diameter: 50, legLength: 70 },
    tolerance: { diameter: 1, legLength: 1 },
    hints: [
      'Set Pipe diameter to 50 mm.',
      'Set Leg length (the short side) to 70 mm — the long side follows automatically at short + diameter = 120 mm.',
      'Press Play. Each piece’s development is π×50 ≈ 157.1 mm wide, with a cosine-shaped cut curve of amplitude 25 mm (the pipe’s own radius).',
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
