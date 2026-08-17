// Problem Library data (ADR-015 pattern): tiered, hints revealed one at a time, a
// tolerant self-check that compares the student's dialed-in construction parameters
// against the problem's target — never auto-fills (RULES.md §6.2).
//
// Each problem names which construction it exercises (constructionId) plus the target
// value for each of that construction's `given` params the problem states explicitly.
// Loading a problem selects that construction and resets its params to defaults; the
// student then dials the sliders (or drags the handle) to match the stated problem, and
// the check goes green once every targeted param is within tolerance (RULES.md §6.1).
//
// The two capstone problems recontextualize the SAME two constructions at engineering
// scale (a railway track gauge, an inclined pipeline joint) — per PRODUCT.md's
// "recognize professional tools later" goal. Neither construction has a unit-conversion
// field; the mm values dialed in ARE the scaled drawing (e.g. 1:50), and the hint text
// carries the real-world figure so the connection is explicit, not hidden.
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
  offset: 'vertical offset',
  distance: 'horizontal distance',
  reversalPos: 'reversal point position',
  angle: 'angle between lines',
  len1: 'length of first line',
  distance2: 'distance to second point',
  radius1: 'radius at first end',
});

export const PROBLEMS = [
  {
    id: 'ogee-parallel-60-70-midpoint',
    tier: 'practice',
    constructionId: 'ogee-parallel',
    statement: 'Two horizontal lines are 60 mm apart vertically, with a 70 mm horizontal offset between the connection points. Construct an ogee curve joining them, assuming the curves reverse at the midpoint.',
    target: { offset: 60, distance: 70, reversalPos: 50 },
    tolerance: { offset: 1, distance: 1, reversalPos: 2 },
    hints: [
      'Set Vertical offset to 60 mm and Horizontal distance to 70 mm.',
      'Drag the handle (or set Reversal point position) to exactly 50% — the midpoint.',
      'Press Play, then check R1 and R2 read the same value — that is what "reverses at the midpoint" means.',
    ],
  },
  {
    id: 'ogee-nonparallel-60deg-30r',
    tier: 'challenge',
    constructionId: 'ogee-nonparallel',
    statement: 'A 60°-inclined line of length 60 mm meets a horizontal line. A point is marked 86 mm along the horizontal line, and the curve touching the inclined line has radius 30 mm. Construct the ogee curve joining them.',
    target: { angle: 60, len1: 60, distance2: 86, radius1: 30 },
    tolerance: { angle: 2, len1: 1, distance2: 1, radius1: 1 },
    hints: [
      'Set Angle between lines to 60°, Length of first line to 60 mm, Distance to second point to 86 mm.',
      'Drag the handle (or set Radius at first end) to 30 mm.',
      'Press Play, then read off R2 — it is derived from the other four values, not something you dial in directly.',
    ],
  },
  {
    id: 'ogee-railway-capstone',
    tier: 'challenge',
    constructionId: 'ogee-parallel',
    statement: 'Applied (1:50 scale): two straight railway tracks run parallel, 3.5 m apart (gauge), and need an ogee curve to shift a train from one to the other, reversing at the midpoint. At 1:50, the 3.5 m gauge draws as 70 mm; use a 65 mm horizontal offset.',
    target: { offset: 70, distance: 65, reversalPos: 50 },
    tolerance: { offset: 1, distance: 1, reversalPos: 2 },
    hints: [
      'This is the same construction as the first problem, just relabelled: the "vertical offset" here IS the 3.5 m track gauge, drawn at 1:50 scale (70 mm).',
      'Set Vertical offset to 70 mm, Horizontal distance to 65 mm, reversal at the midpoint (50%).',
      'A real track-shift curve is built exactly this way — two circular arcs, reversing where they touch — just at a scale you could walk on.',
    ],
  },
  {
    id: 'ogee-pipeline-capstone',
    tier: 'challenge',
    constructionId: 'ogee-nonparallel',
    statement: 'Applied: an inclined pipeline section (angle 75° to the header pipe) needs an ogee joint to connect smoothly, with the first bend radius fixed by the pipe fitting at 25 mm (drawing scale).',
    target: { angle: 75, len1: 60, distance2: 90, radius1: 25 },
    tolerance: { angle: 2, len1: 3, distance2: 3, radius1: 1 },
    hints: [
      'Set Angle between lines to 75° and Radius at first end to 25 mm — that radius is fixed by the physical pipe fitting, same idea as the textbook problem\'s "radius touching one named end."',
      'Length of first line and Distance to second point are looser here (real fittings vary) — 60 mm and 90 mm are reasonable drawing values.',
      'Notice R2 is never something you choose directly, in either the drafting-board version or the real pipeline joint — it falls out once the fitting radius and the two lines are fixed.',
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
