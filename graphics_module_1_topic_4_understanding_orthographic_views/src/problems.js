// Textbook Problem Library — DATA LAYER (starter-template stub).
//
// Emptied for the Simatrix Starter Template. Fill TIERS + PROBLEMS with your own
// subject's practice problems and set ENABLED_TIERS to the tiers this build can solve.
// The self-check (src/problemLibrary.js) imports PROBLEMS, FIELD_LABELS,
// enabledProblems() and groupByTier() from here, so those exports are preserved (as
// empty data / pass-throughs) to keep the module contract intact. See README.md
// (MODULE-STARTER) for how the ENABLED_TIERS clone switch works.

/** Ordered configuration tiers (each problem's `tier` is matched against these). Empty stub. */
export const TIERS = Object.freeze([]);

/** The single clone-scope switch — the tiers this build can actually solve. Empty stub. */
export const ENABLED_TIERS = Object.freeze([]);

/** Human labels for each self-check field, keyed by data field. Empty stub. */
export const FIELD_LABELS = Object.freeze({});

/** The practice-problem set. Empty stub — add your problems here. */
export const PROBLEMS = Object.freeze([]);

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
