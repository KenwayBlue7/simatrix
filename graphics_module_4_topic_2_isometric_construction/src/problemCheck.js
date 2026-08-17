// The adapter between Topic 2's live state and Topic 3's validator — and the one line the learner reads.
//
// WHY AN ADAPTER RATHER THAN A SECOND VALIDATOR. `answerValidator.js` is Topic 3's, migrated with
// its logic unchanged, and it judges a `ComposedModel` + a `ProjectionPlan`. This topic composes
// differently (a synthetic solid from `combinationBuilder.js`, not a parts model), so something has
// to translate. That something is fifty lines of pure derivation, and it derives — it stores
// nothing. There is exactly ONE copy of the learner's numbers in this topic, and it is `state.dims`
// in `main.js`; everything here is computed from the subject and that set on the spot.
//
// LIVE, NOT AT THE END. Topic 3 runs this once, at its final step, into a verification panel. The
// behaviour asked for here is the platform's LIVE self-check — the one Module 2 and the Module 1/3
// topics show in their problem card — so the same findings are folded into a single status line that
// `main.js` re-runs whenever the state the check depends on changes. The wording is the platform's,
// character for character: `Still to match: …` while something is out, a green check when nothing
// is (`Module2/src/problemLibrary.js`).
//
// PENDING IS NOT FAIL (the validator's own rule, kept). Work not yet done reads as guidance —
// "keep going" — never as a red contradiction. Only a real disagreement with the question is
// reported as something still to match.
//
// Layering (CLAUDE.md): leaf, pure. Imports the validator and the stateless `shapeData` util. No
// THREE, no DOM, no state.

import { validate, summarise } from './answerValidator.js';
import { humanList, round1, ISOMETRIC_SCALE } from './shapeData.js';

/**
 * The learner's drawing in the shape the validator reads.
 *
 * A single solid is the ONE-PART case, exactly as it is everywhere else in this topic: the parts
 * list carries one entry. A combination carries one per component, keyed `p0`, `p1` … — the same
 * namespace `combinationBuilder.js` builds its dimension fields in, so a problem's `answerData.parts`
 * and the model agree by construction rather than by a lookup table.
 *
 * @param {object} subject   A solid from `shapeData.js`, or the synthetic solid a combination composes to.
 * @param {Record<string, number>} dims  The RESOLVED set (never `state.dims` — RULES.md §3.35).
 */
export function checkModel(subject, dims) {
  const bounds = subject.bounds(dims);
  const body = subject.body(dims);
  const parts = body?.kind === 'assembly'
    ? (body.parts ?? []).map((p, i) => ({ id: `p${i}`, trueDiameter: Boolean(p.trueSize) }))
    : [{ id: 'p0', trueDiameter: Boolean(subject.trueDiameterInProjection) }];
  return { parts, bounds };
}

/**
 * How the isometric scale is applied right now — read from the live form, and from each part's own
 * exemption. This mirrors `formScaleFor()` in `main.js` rather than re-deciding anything: a part
 * with no axial length to reduce is drawn at true size, and every part's SEAT is still reduced.
 */
export function checkPlan(model, formMode) {
  const axialScale = formMode === 'projection' ? ISOMETRIC_SCALE : 1;
  const parts = {};
  for (const part of model.parts) {
    parts[part.id] = {
      scale: part.trueDiameter ? 1 : axialScale,
      originScale: axialScale,
    };
  }
  return { mode: formMode, axialScale, parts };
}

/**
 * Which of a problem's `requiredStages` this subject can actually be judged against.
 *
 * The migrated stage ids are Topic 3's vocabulary, and the two topics name a few stages differently
 * (a cylinder's third stage is `generators` there and `axis` here). Judging a drawing against a
 * stage it has no way to draw would report a permanent, unfixable miss — so the requirement is
 * filtered to the stages this subject declares. The test is on DATA SHAPE — does this construction
 * contain a stage of that id — never on which problem or which solid it is (ADR-043).
 */
function stagesThisSubjectHas(problem, subject, dims) {
  const required = problem?.answerData?.requiredStages;
  if (!required?.length) return null;
  const own = new Set(subject.construction(dims).map((st) => stageId(st.id)));
  const usable = required.filter((id) => own.has(id));
  return usable.length ? usable : null;
}

/** A combination prefixes its stages `p0:base`; the stage's own id is what a requirement names. */
const stageId = (id) => String(id).split(':').pop();

/**
 * Run the check.
 *
 * @param {object} problem    The library problem, or null in free practice.
 * @param {object} subject    The live subject.
 * @param {Record<string, number>} dims  The resolved dimension set.
 * @param {'projection'|'view'} formMode
 * @param {{ phasesDone?: string[], stagesDone?: string[] }} [progress]
 * @returns {{ findings: object[], summary: object, status: 'pass'|'pending'|'fail', text: string }|null}
 */
export function checkProblem(problem, subject, dims, formMode, progress = {}) {
  if (!problem || !subject) return null;

  const model = checkModel(subject, dims);
  const plan = checkPlan(model, formMode);

  // The stage requirement is narrowed to what this subject can draw; nothing else about the problem
  // is altered, and the validator still reads its own `answerData`.
  const usableStages = stagesThisSubjectHas(problem, subject, dims);
  const forCheck = problem.answerData?.requiredStages
    ? { ...problem, answerData: { ...problem.answerData, requiredStages: usableStages ?? undefined } }
    : problem;

  const findings = validate(model, forCheck, plan, {
    phasesDone: progress.phasesDone ?? [],
    stagesDone: (progress.stagesDone ?? []).map(stageId),
  });
  const summary = summarise(findings);
  return { findings, summary, ...statusLine(findings, summary, subject, dims, problem) };
}

/**
 * The one line the problem card shows.
 *
 * A FAIL is a disagreement with the question, and it is named as specifically as the finding allows:
 * the overall sizes checker knows which of the three edges is out, so the line says which. Anything
 * merely unfinished falls through to the validator's own "keep going" wording, because work still
 * to do is not a mistake.
 */
function statusLine(findings, summary, subject, dims, problem) {
  const failed = findings.filter((f) => f.status === 'fail');
  if (failed.length) {
    const items = failed.flatMap((f) => failLabels(f, subject));
    return { status: 'fail', text: `Still to match: ${humanList(items)}.` };
  }
  if (findings.some((f) => f.status === 'pending')) {
    return { status: 'pending', text: summary.message };
  }
  return { status: 'pass', text: 'Your construction matches the problem.' };
}

/** Human names for what a failing finding is about — what to look at, never the number to type. */
function failLabels(f, subject) {
  switch (f.check) {
    case 'dimensions': {
      // The checker's own detail says which edges are out, so the line can name them rather than
      // saying "the sizes" and leaving the learner to hunt.
      const want = f.detail?.expected;
      const got = f.detail?.actual;
      if (want && got && !Array.isArray(want)) {
        const off = ['width', 'depth', 'height']
          .filter((k) => want[k] != null && Math.abs(round1(got[k] ?? 0) - want[k]) > 0.5);
        if (off.length) return off.map((k) => `overall ${k}`);
      }
      return ['the overall sizes'];
    }
    case 'projectionType': return ['the isometric form the question asks for'];
    case 'orientation': return ['the way the solid is placed'];
    case 'constructionOrder': return ['the order the phases were worked in'];
    case 'sphereRule': return ['the sphere rule'];
    default: return [f.label.toLowerCase()];
  }
}
