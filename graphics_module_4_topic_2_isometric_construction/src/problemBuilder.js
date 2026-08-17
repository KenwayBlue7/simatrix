// Problem → subject. The whole of the join between the Problem Library and this topic's engine.
//
// WHY THIS FILE IS SHORT, AND WHY THAT IS THE POINT. A textbook problem does not need a pipeline of
// its own. It names some solids, states their sizes, and asks for one of the two isometric forms.
// This topic already knows how to construct one solid (`shapeData.js`) and how to construct several
// seated on each other (`combinationBuilder.js`), so a problem resolves to one of those two things
// and then stops being a problem as far as the engine is concerned:
//
//   one part      →  the solid itself, from `SOLIDS`
//   two or more   →  `buildCombination()` — the EXISTING combination model, unchanged
//
// Every consumer below this line — `rebuild()`, `shapeFactory`, `constructionEngine`,
// `dimensionLayer`, `orthographicDrawer`, `cameraRig`, the stepper, the six steps, the four phases —
// is untouched by the existence of problems and never learns one was loaded. There is no second
// rendering path, no second composer and no per-problem branch anywhere (ADR-053).
//
// DIMENSIONS. A problem states its sizes, and those sizes ARE the given data — reading them is the
// second step of the solve, not the sim auto-filling an answer. A combination problem's keys are
// namespaced `p0_`, `p1_` … because that is the namespace `combinationBuilder` builds its fields in;
// the two therefore agree by construction rather than by convention.
//
// Layering (CLAUDE.md): leaf DATA module. Imports the stateless data utils `shapeData.js` and
// `combinationBuilder.js` (RULES.md §3.6a) — both pure, both stateless, neither owning any scene or
// DOM. Knows nothing about THREE, the DOM, the viewport or the UI.

import { getSolid } from './shapeData.js';
import { buildCombination } from './combinationBuilder.js';
import { getProblem, DEFAULT_PROBLEM_ID } from './problemLibrary.js';

/** Resolve a problem id, falling back to the library's opening problem so a bad id cannot blank the sim. */
export function resolveProblem(id) {
  return getProblem(id) ?? getProblem(DEFAULT_PROBLEM_ID);
}

/** Is this problem a combination of solids rather than a single one? Read as DATA SHAPE, never as an id. */
export function isCombinationProblem(problem) {
  return (problem?.parts?.length ?? 0) > 1;
}

/**
 * The combination list a problem's parts make — the same `{ solidId }` list Step 1's builder
 * produces by hand, so a combination problem and a hand-built combination are the same thing to
 * every module downstream.
 */
export function problemComboParts(problem) {
  return (problem?.parts ?? []).map((p) => ({ solidId: getSolid(p.solidId).id }));
}

/**
 * THE SUBJECT a problem describes: one solid, or the synthetic solid its parts compose to.
 *
 * @param {import('./problemLibrary.js').Problem} problem
 * @returns {object} A solid satisfying the contract `shapeData.js` documents.
 */
export function problemSubject(problem) {
  const parts = problem?.parts ?? [];
  if (parts.length <= 1) return getSolid(parts[0]?.solidId);
  return buildCombination(problemComboParts(problem));
}

/**
 * The dimension set the question states, keyed the way the subject's own fields are keyed.
 *
 * A value the question does not state is simply absent, and the field's own default stands — so a
 * problem never has to restate a size it did not fix.
 *
 * @returns {Record<string, number>}
 */
export function problemDims(problem) {
  const parts = problem?.parts ?? [];
  const out = {};
  if (parts.length <= 1) {
    const solid = getSolid(parts[0]?.solidId);
    for (const f of solid.dims) out[f.key] = parts[0]?.dims?.[f.key] ?? f.default;
    return out;
  }
  parts.forEach((part, i) => {
    const solid = getSolid(part.solidId);
    for (const f of solid.dims) out[`p${i}_${f.key}`] = part.dims?.[f.key] ?? f.default;
  });
  return out;
}

/**
 * Which of the two forms Step 5 opens in for this problem.
 *
 * The question decides it — "draw the isometric PROJECTION" and "draw the isometric VIEW" are
 * different instructions, and answering the wrong one is a real mistake rather than a preference.
 * The toggle stays live either way, because comparing the two IS Step 5's lesson; this only settles
 * where the comparison starts.
 *
 * @returns {'projection'|'view'}
 */
export function initialFormMode(problem) {
  return problem?.projectionType === 'projection' ? 'projection' : 'view';
}

/** The source line shown under a statement: "N.D. Bhatt · Ch 17 · Problem 17-12 (adapted)". */
export function sourceLine(problem) {
  const s = problem?.source;
  if (!s) return '';
  const parts = [s.textbook, s.chapter, s.ref].filter(Boolean);
  return `${parts.join(' · ')}${s.adapted ? ' (adapted)' : ''}`;
}
