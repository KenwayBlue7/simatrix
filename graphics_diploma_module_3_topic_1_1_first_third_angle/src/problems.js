// problems.js — Problem Library data layer. Each problem gives a short pictorial
// description with the front-view arrow F, and a target projection SYSTEM the
// student must set the toggle to and confirm (the resulting view layout + BIS
// symbol are both deterministic functions of `system`, so checking it alone is a
// complete, non-redundant self-check — RULES.md §6.1–§6.2, never auto-fill).
//
// Conforms to the platform-wide problem-library interface contract (ADR-083,
// RULES.md §6.24–§6.26): TIERS, ENABLED_TIERS, FIELD_LABELS, PROBLEMS,
// enabledProblems(), groupByTier() — the same exports problemLibrary.js expects
// from every topic that ships this contract.

/** Ordered configuration tiers. */
export const TIERS = Object.freeze([
  { id: 'read', label: 'Read the symbol', blurb: 'Given a BIS symbol or a stated convention, set the matching system.' },
  { id: 'apply', label: 'Apply the default rule', blurb: 'Decide first- or third-angle from what the problem says (or doesn’t say).' },
]);

/** The single clone-scope switch (ADR-009, RULES.md §1.6) — both tiers ship. */
export const ENABLED_TIERS = Object.freeze(['read', 'apply']);

/** Human labels for the one field the self-check reports as "still to match". */
export const FIELD_LABELS = Object.freeze({
  system: 'projection system',
});

/**
 * @typedef {Object} Problem
 * @property {string} id
 * @property {string} tier    One of TIERS[].id.
 * @property {string} title   Short card title.
 * @property {string} statement  Full word-problem text.
 * @property {string[]} hints
 * @property {{ system: 'first'|'third' }} target
 */

/** @type {ReadonlyArray<Problem>} */
export const PROBLEMS = Object.freeze([
  {
    id: 'pa-symbol-first',
    tier: 'read',
    title: 'Symbol reads first-angle',
    statement: 'A drawing’s title block carries the first-angle BIS symbol (small end of the cone toward the front view). Set the toggle to match.',
    hints: [
      'The symbol alone tells you everything — no need to reason about the object.',
      'First-angle’s cone points with its narrow end toward the circles, matching the badge you built in Step 3.',
      'Set the toggle to First-angle.',
    ],
    target: { system: 'first' },
  },
  {
    id: 'pa-symbol-third',
    tier: 'read',
    title: 'Symbol reads third-angle',
    statement: 'A drawing’s title block carries the third-angle BIS symbol — the mirror image of the one you saw in Step 5. Set the toggle to match.',
    hints: [
      'Third-angle’s symbol is the horizontal mirror of first-angle’s.',
      'Compare it against the badge you saw fold into place in Step 5.',
      'Set the toggle to Third-angle.',
    ],
    target: { system: 'third' },
  },
  {
    id: 'pa-no-statement',
    tier: 'apply',
    title: 'No system stated on the drawing',
    statement: 'A drawing gives a pictorial view with arrow F marking the front-view direction, but states no projection system at all. Which system applies, and set the toggle to match?',
    hints: [
      'One system is the assumed default when nothing is stated — which one, for BIS/India?',
      'Recall the CONTENT SPEC default-rule: BIS/India assumes first-angle unless third is explicitly called out.',
      'Set the toggle to First-angle.',
    ],
    target: { system: 'first' },
  },
  {
    id: 'pa-explicit-third',
    tier: 'apply',
    title: 'Drawing explicitly states third-angle',
    statement: 'A drawing’s title block reads "THIRD ANGLE PROJECTION" next to the pictorial view and arrow F. Set the toggle to match.',
    hints: [
      'When a drawing explicitly names its system, that overrides any default.',
      'The text says it outright — no symbol-reading needed here.',
      'Set the toggle to Third-angle.',
    ],
    target: { system: 'third' },
  },
]);

/** Problems whose tier is enabled for this build (the library's display list). */
export function enabledProblems() {
  return PROBLEMS.filter((p) => ENABLED_TIERS.includes(p.tier));
}

/** Group a problem list by tier id, in TIERS display order. */
export function groupByTier(list) {
  return TIERS
    .map((tier) => ({ tier, problems: list.filter((p) => p.tier === tier.id) }))
    .filter((g) => g.problems.length > 0);
}
