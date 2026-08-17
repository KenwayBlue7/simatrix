// Answer validation — the check that turns a drawing exercise into a verification tool.
//
// MIGRATED FROM TOPIC 3 (2026-08-12), LOGIC UNCHANGED. Every checker, every message, every status
// and the whole registry are Topic 3's, character for character. The ONLY edit is the import line:
// Topic 3 keeps `CHECK_TOLERANCE_MM` / `humanList` / `round1` in a `helpers.js`, and this topic
// keeps its stateless shared util in `shapeData.js`. There is no second validator (the brief's
// rule), and there is no Topic-2 fork of the rules a drawing is judged by.
//
// What DOES differ is what feeds it. Topic 3 hands it a `ComposedModel` from its own composer; this
// topic hands it the same shape, adapted from its own subject and resolved dimensions by
// `problemCheck.js`. The validator cannot tell the two apart, which is the point.
//
// PURE, AND DELIBERATELY SO (RULES.md §6.3). This file takes the composed model plus the problem's
// `answerData` and returns findings. It owns no DOM, mutates no state, and never touches a control —
// `uiManager.js` paints what it returns, and it runs off the single `onStateChange` seam that every
// rebuild fires. Validation logic in a UI handler is the pattern this rule exists to prevent.
//
// IT NEVER FILLS ANYTHING IN (RULES.md §6.2). The learner dials; the check lights. A finding names
// WHAT to look at ("the height you have set off along the vertical axis"), never the number to type.
//
// TOLERANCE is ±0.5 mm (RULES.md §6.1) — enough for slider granularity, not enough to green a wrong
// drawing.
//
// `pending` IS NOT `fail`. Before the learner has done the work there is nothing to be wrong about,
// so an untouched problem shows a quiet "not yet checked", never red. Red is reserved for a real
// contradiction with the question.
//
// ONLY WHAT THE QUESTION FIXES IS CHECKED. A key absent from `answerData` is left free, never pinned
// to an arbitrary value (the Module-2 target convention, §6.4).
//
// EXTENSIBLE BY REGISTRATION (the brief's line-by-line ambition). Checkers are pure functions in one
// list. A future check registers one more entry against the same composed model, with no change to
// the engine, the UI, or any problem.
//
// Layering (CLAUDE.md): leaf, pure. Imports `helpers.js` only.

import { CHECK_TOLERANCE_MM, humanList, round1 } from './shapeData.js';

/**
 * @typedef {Object} Finding
 * @property {'projectionType'|'dimensions'|'orientation'|'constructionOrder'|'completion'|'sphereRule'} check
 * @property {'pass'|'pending'|'fail'} status
 * @property {string} label     Short heading for the panel row.
 * @property {string} message   Learner-facing. Names what to look at — never the answer.
 * @property {Object} [detail]
 */

const near = (a, b) => Math.abs(a - b) <= CHECK_TOLERANCE_MM;

const finding = (check, status, label, message, detail) => ({ check, status, label, message, detail });

/**
 * Did the learner draw the FORM the question asked for — a projection at 0.816, or a view at 1:1?
 * The most consequential check in the module, and the one students most often skip reading.
 */
function checkProjectionType(model, problem, plan) {
  const want = problem.answerData?.scale;
  if (want == null) return null;
  const got = plan.axialScale;
  const wantName = want < 1 ? 'Isometric Projection' : 'Isometric View';
  if (near(got * 1000, want * 1000)) {
    return finding('projectionType', 'pass', 'Form',
      `Drawn as an ${wantName}, which is what the question asks for.`);
  }
  return finding('projectionType', 'fail', 'Form',
    `Read the question again: it asks for an ${wantName}. Check which form you are drawing in.`,
    { expected: want, actual: got });
}

/**
 * Every stated overall size, compared against the drawing at ±0.5 mm — at TRUE size, not drawn.
 *
 * Sizes are a property EVERY solid has, so a missing `bounds` is never SILENTLY skipped. A checker
 * that returned `null` here would drop out of the findings, and `summarise` would then green a
 * drawing whose overall size was never verified — the exact wrong-greening §6.22 forbids. Every
 * shipped problem now carries `bounds`; the `pending` fallback guards a problem authored without one
 * (it surfaces the gap instead of hiding it).
 *
 * A question that poses more than one placement (`orientations` has two — a cylinder drawn axis
 * vertical AND axis horizontal) fixes the three overall sizes but not which edge is width and which
 * is height. The SET of sizes is invariant across the placements, so it is the set that is checked
 * (§6.4): a wrong size still fails, and either valid placement still passes. The test is on DATA
 * SHAPE — how many placements the question poses — never on which problem it is (§6.23).
 */
function checkDimensions(model, problem, plan) {
  const want = problem.answerData?.bounds;
  if (!want) {
    return finding('dimensions', 'pending', 'Sizes',
      'The overall sizes are not checked for this problem.');
  }
  const got = model.bounds;

  if ((problem.orientations?.length ?? 0) > 1) {
    const wantSet = [want.width, want.depth, want.height].sort((a, b) => a - b);
    const gotSet = [got.width, got.depth, got.height].sort((a, b) => a - b);
    if (wantSet.every((v, i) => near(v, gotSet[i]))) {
      return finding('dimensions', 'pass', 'Sizes', 'Every overall size matches the question.');
    }
    return finding('dimensions', 'fail', 'Sizes',
      'Check the overall sizes against the question — one of the three does not match.',
      { expected: wantSet, actual: gotSet.map(round1), tolerance: CHECK_TOLERANCE_MM });
  }

  const off = [];
  for (const [key, value] of Object.entries(want)) {
    if (!near(got[key] ?? 0, value)) off.push(key);
  }
  if (off.length === 0) {
    return finding('dimensions', 'pass', 'Sizes',
      'Every overall size matches the question.');
  }
  return finding('dimensions', 'fail', 'Sizes',
    `Check the overall ${humanList(off)} against the sizes the question states.`,
    { expected: want, actual: { width: round1(got.width), depth: round1(got.depth), height: round1(got.height) }, tolerance: CHECK_TOLERANCE_MM });
}

/** Axis vertical / horizontal, and any "edge perpendicular to the VP" condition the question fixes. */
function checkOrientation(model, problem, plan, progress) {
  const want = problem.answerData?.orientation;
  if (!want) return null;
  const got = progress?.orientationId ?? 'axis-vertical';
  if (got === want) {
    return finding('orientation', 'pass', 'Orientation', 'The solid is placed as the question describes.');
  }
  return finding('orientation', 'fail', 'Orientation',
    'Re-read the clause that says how the solid is placed — the axis is not lying the way the question puts it.',
    { expected: want, actual: got });
}

/**
 * Were the phases worked in the order a drawing is actually built — axes, box, shape, finish?
 * Order is the transferable skill, so working out of order is reported even when the picture is
 * right.
 */
function checkConstructionOrder(model, problem, plan, progress) {
  const done = progress?.phasesDone ?? [];
  if (done.length === 0) {
    return finding('constructionOrder', 'pending', 'Method',
      'Work through the construction phases in order: axes, then the box, then the shape.');
  }
  const canonical = ['a', 'b', 'c', 'd'];
  // The learner may re-run a phase, so collapse repeats before judging the sequence: what matters is
  // whether each phase was first reached after the one before it, not how many times it was replayed.
  const firstReached = canonical
    .map((id) => ({ id, at: done.indexOf(id) }))
    .filter((p) => p.at >= 0);
  const inOrder = firstReached.every((p, i) => i === 0 || p.at > firstReached[i - 1].at);
  const seen = firstReached.map((p) => p.id);
  if (!inOrder) {
    return finding('constructionOrder', 'fail', 'Method',
      'The phases were not worked in order. An isometric drawing is started at the axes, extended into the box, and only then constructed inside it.');
  }
  return finding('constructionOrder', seen.length === canonical.length ? 'pass' : 'pending', 'Method',
    seen.length === canonical.length
      ? 'The construction was worked in the right order.'
      : 'Keep going — the remaining phases are still to be worked.');
}

/** Is every stage the question requires actually drawn? */
function checkCompletion(model, problem, plan, progress) {
  const required = problem.answerData?.requiredStages;
  if (!required?.length) return null;
  const done = new Set(progress?.stagesDone ?? []);
  const missing = required.filter((id) => !done.has(id));
  if (missing.length === 0) {
    return finding('completion', 'pass', 'Completeness', 'Every part of the construction is drawn.');
  }
  return finding('completion', 'pending', 'Completeness',
    `${missing.length} part${missing.length === 1 ? '' : 's'} of the construction still to draw.`,
    { missing });
}

/**
 * The sphere rule, checked as the PAIR it is: a sphere in an isometric projection is drawn at its
 * TRUE diameter, and its centre sits at ISOMETRIC height. Honouring one and not the other is the
 * classic half-right answer, so a finding that passed on either alone would teach the error.
 */
function checkSphereRule(model, problem, plan) {
  const spec = problem.answerData?.parts;
  if (!spec) return null;
  const trueDiameterParts = model.parts.filter((p) => p.trueDiameter);
  if (trueDiameterParts.length === 0) return null;

  const wrong = [];
  for (const part of trueDiameterParts) {
    const want = spec[part.id];
    if (!want) continue;
    const applied = plan.parts[part.id] ?? {};
    const sizeRight = want.scaled === false ? applied.scale === 1 : applied.scale === plan.axialScale;
    const centreRight = want.centreHeightScaled === false
      ? applied.originScale === 1
      : applied.originScale === plan.axialScale;
    if (!sizeRight || !centreRight) wrong.push(part.id);
  }

  if (wrong.length === 0) {
    return finding('sphereRule', 'pass', 'Sphere rule',
      'The sphere is drawn at its true diameter, with its centre at isometric height — both halves of the rule.');
  }
  return finding('sphereRule', 'fail', 'Sphere rule',
    'A sphere keeps its TRUE diameter in an isometric projection, but the height of its centre is still reduced. Check both.',
    { parts: wrong });
}

/**
 * The registry. Order is the order findings are reported in: form first (it invalidates everything
 * downstream), then sizes, then orientation, then process.
 */
const CHECKERS = Object.freeze([
  checkProjectionType,
  checkDimensions,
  checkOrientation,
  checkConstructionOrder,
  checkCompletion,
  checkSphereRule,
]);

/**
 * Run every checker against the live drawing.
 *
 * @param {import('./solidComposer.js').ComposedModel} model
 * @param {import('./problemLibrary.js').Problem} problem
 * @param {import('./projectionResolver.js').ProjectionPlan} plan
 * @param {{ stagesDone?: string[], phasesDone?: string[], orientationId?: string }} [progress]
 * @returns {Finding[]}  Empty when there is no active problem.
 */
export function validate(model, problem, plan, progress = {}) {
  if (!problem || !model) return [];
  return CHECKERS
    .map((check) => check(model, problem, plan, progress))
    .filter(Boolean);
}

/**
 * The one-line summary the verification panel leads with.
 * @param {Finding[]} findings
 */
export function summarise(findings) {
  if (findings.length === 0) return { status: 'pending', message: 'Nothing checked yet.' };
  if (findings.some((f) => f.status === 'fail')) {
    return { status: 'fail', message: 'Some of the question is not yet satisfied.' };
  }
  if (findings.some((f) => f.status === 'pending')) {
    return { status: 'pending', message: 'Keep going — some of the drawing is still to come.' };
  }
  return { status: 'pass', message: 'Your drawing answers the question.' };
}

export { CHECK_TOLERANCE_MM };
