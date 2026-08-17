# Migrating the Problem Library from Topic 3 into Topic 2

**Source** `graphics_module_4_topic_3_isometric_projection_problem_library`
**Target** `graphics_module_4_topic_2_isometric_construction`
**Status** investigation complete — written before any application code was changed.

This document answers the seven questions the brief asks for: how Topic 3's Problem Library works,
which files are required, which can be copied, which need adaptation, which are not required, how
Topic 3's problem data connects to Topic 2, and how a combination problem connects to Topic 2's
**existing** combination implementation.

---

## 1. How Topic 3's Problem Library works

Topic 3's central claim (its `CLAUDE.md`, ADR-053) is *problems are DATA; the engine interprets
them*. Adding a problem is appending one object. Nothing in that topic contains
`if (problem.id === …)`. The pipeline is:

```
problemLibrary.js   PROBLEMS[]  — 18 objects: statement, source, category, solid, dimensions, answerData, hints
        │
problemQuery.js     getSubject(id) — the ONE junction between textbook problems and free-practice solids
        │
dimensionResolver   specified + auto + derived  →  ONE flat dimension set
        │
solidComposer.js    PartSpec[] + seating rules  →  ComposedModel { parts, bounds, stages, views, dimSpecs }
        │
geometryFactory / constructionEngine / orthographicDrawer / answerValidator
```

Four properties matter for the migration:

1. **A problem's `solid` is a list of PARTS**, not a solid. `{ id:'prism', part:'prism', sides:6,
   r:'circum', h:'axis', rot:'flatToVP' }`. The six part kinds are `box · revolve · prism ·
   pyramid · sphere · hemisphere` (`solidCatalog.js`).
2. **Part parameters are KEYS into the problem's own dimension map**, and many of them point at
   `derived` values — `r: 'circum'` where `circum = circumradius(side, 6)`.
3. **A single solid is the one-part case.** There is no separate code path for combinations.
4. **A free-practice solid IS a problem** minus `question`, `answerData` and `hints`
   (`practiceSolids.js`, ADR-058) — which is how Topic 3's Step-1 picker works.

## 2. What Topic 2 already has

Topic 2 is *not* missing a composition model. It gained one when combination-of-solids shipped
(2026-08-11):

```
shapeData.js        SOLIDS[] — whole named solids: dims · bounds() · body() · views() · construction()
combinationBuilder  N solids  →  ONE synthetic solid satisfying the SAME contract
        │                         (assembly body kind, per-component boxes, per-component dim keys p0_/p1_)
main.js  currentSolid()  →  rebuild()  →  shapeFactory · constructionEngine · orthographicDrawer
```

Topic 2's geometry kinds are **the same six** as Topic 3's part kinds, with one difference: Topic 2's
`pyramid` has no `rTop`, so it cannot draw a frustum of a pyramid.

## 3. The one real incompatibility, and the decision it forces

**Topic 3's `PartSpec` cannot be adapted at runtime into Topic 2's model.** A part's parameters are
derived one-way from the learner's dimensions (`r: 'circum'`, `circum = f(side)`), and Topic 2's
solids take the learner's dimension directly (`side`). Inverting `derived` generically is not
possible, so a runtime translator would have to re-implement each part kind's parameter semantics —
which is a second geometry vocabulary living inside Topic 2. That is exactly what the brief forbids
("Do NOT create a second `solidComposer`").

**Decision.** Everything in the problem schema is preserved *except* the `solid` field, which is
re-expressed in Topic 2's own vocabulary:

```js
// Topic 3                                        // Topic 2
solid: [{ id:'slab', part:'prism', sides:6,       parts: [
          r:'slabCircum', h:'slabThickness',        { solidId: 'hexagonal-prism', dims: { side: 24, height: 25 } },
          rot:'flatToVP' },                         { solidId: 'sphere',          dims: { diameter: 36 } },
        { id:'sphere', part:'sphere',             ],
          r:'sphereRadius', seat:{on:'slab'} }],
dimensions: { … }, derived: { … }                 // both collapse into the per-part `dims`
```

`question`, `title`, `category`, `source`, `difficulty`, `learningObjective`, `projectionType`,
`hints`, `tags` and `answerData` are carried **verbatim**. This is the "smallest clean
adapter/translation layer" the brief's §5 authorises, and it is applied **once, offline**: a
throwaway translator generated the new file from Topic 3's data and every problem's overall size was
checked against Topic 3's own `answerData.bounds`. **No translator ships at runtime.**

## 4. Which Topic 3 files are required

| Topic 3 file | Verdict | Why |
|---|---|---|
| `problemLibrary.js` | **adapt** | The 18 problems + `CATEGORIES`. Statements, sources, hints, `answerData` copied verbatim; `solid`/`dimensions`/`derived` re-expressed as `parts` (§3). |
| `problemQuery.js` | **adapt (shrunk)** | Its job — *one lookup over the problem list* — is three functions in Topic 2's new `problemLibrary.js`. Topic 2 does not need `getSubject`'s two-source junction: its free-practice source is `SOLIDS`, which it already resolves. |
| `practiceSolids.js` | **not required** | It exists because Topic 3 has no whole-solid registry. Topic 2 *is* that registry (`SOLIDS`). |
| `solidCatalog.js` | **not required** | Topic 2's `shapeData.js` fills the role, and its geometry kinds are already the same six. |
| `solidComposer.js` | **not required** | Topic 2's `combinationBuilder.js` composes. Copying this would be the forbidden second composer. |
| `dimensionResolver.js` | **not required** | Topic 2's `resolveDims()` in `shapeData.js` already does specified + `auto` + unspecified. `derived` disappears with the `solid` re-expression. |
| `projectionResolver.js` | **not required** | Topic 2 owns the 0.816 law (`formScaleFor`) and the sphere rule (`trueDiameterInProjection`, per-component since the combination work). Only `projectionType` is consumed, as the *starting* form for Step 5. |
| `answerValidator.js` | **not migrated** | See §7. |
| `state.js`, `main.js`, `uiManager.js`, `viewport.js`, `geometryFactory.js`, `constructionEngine.js`, `orthographicDrawer.js`, `stepDefinitions.js` | **not required** | Topic 2 owns all of these and remains the rendering pipeline. |

**Nothing is copied wholesale. Nothing is imported across topics at runtime.**

## 5. How problem data connects to Topic 2

One new leaf, `src/problemBuilder.js`, mirroring `combinationBuilder.js`:

```
problem  →  problemSubject(problem)  →  a solid from SOLIDS        (one part)
                                     →  buildCombination([...])    (two or more parts)
         →  problemDims(problem)     →  { side: 24, height: 25 }   (one part)
                                     →  { p0_side: 24, p0_height: 25, p1_diameter: 36 }  (combination)
```

That is the whole adapter. A one-part problem *is* a Topic 2 solid; a multi-part problem *is* a
Topic 2 combination — the existing one, unchanged, with its existing `p{i}_` key namespacing,
per-component bounding boxes, bottom-up stages and per-component sphere rule.

`main.js` gains a third value for the `mode` it already carries:

```
state.mode = 'single' | 'combination' | 'problem'
state.problemId

currentSolid()   // one more branch in the switch that already exists — still ONE subject, ONE rebuild()
```

Everything downstream — `rebuild()`, `shapeFactory`, `constructionEngine`, `dimensionLayer`,
`orthographicDrawer`, `cameraRig`, the stepper, the six steps, the four phases — is untouched and
never learns a problem exists.

## 6. Gaps found in Topic 2, and the smallest additive fixes

Four of the eighteen problems name solids Topic 2's registry does not have. Each fix is additive.

| Gap | Problems | Fix |
|---|---|---|
| No hexagonal pyramid | `eg-ex15` | append one object to `SOLIDS` |
| No pentagonal pyramid | `practice-pent-pyramid-on-cylinder` | append one object to `SOLIDS` |
| No frustum of a pyramid | `ndb-17-16`, `practice-sphere-on-square-frustum` | append two objects to `SOLIDS`, **plus**: `shapeFactory` `pyramid` case accepts `rTop` (one `CylinderGeometry` instead of `ConeGeometry`); `topHalfExtent` returns that top; `constructionEngine` gains **one** construction primitive, `edges`, joining corresponding corners of two polygons at two heights |
| `cylinder` height range stops at 110 | `practice-sphere-on-cylinder` states a 120 mm axis | widen that one field's `max` to 120 |

These four solids join Step 1's picker and the combination builder, because Topic 2 has **one**
solid registry and a learner who meets a hexagonal pyramid in a problem must be able to pick one for
practice. The picker goes from 11 solids to 15. No engine switch grows except the single documented
`edges` primitive.

**This is not an architectural change.** ADR-043's whole point is that adding a solid is appending
one object, and the new primitive is one more case in the existing bounded primitive vocabulary —
the same shape of change the topic was designed to absorb.

## 7. Validation — the decision, and its reversal

**Revised 2026-08-12 after review. `answerValidator.js` IS migrated, and it runs LIVE.** The
reasoning below was written when the brief said not to migrate anything unnecessarily, and it was
wrong about one thing: it read "validation" as Topic 3's Step-6 verdict panel. What was actually
wanted is the platform's **live self-check** — the status line the Module 1/2/3 problem libraries
carry inside the problem card, updating as the learner dials. That is guidance during solving, not a
verdict at the end, and it belongs in Topic 2 without touching Step 6.

What shipped:

- **`src/answerValidator.js`** — Topic 3's file, **logic byte-identical**. The only edit is the
  import line (Topic 3 keeps its helpers in `helpers.js`; this topic keeps them in `shapeData.js`,
  which gained `CHECK_TOLERANCE_MM`, `round1` and `humanList`). Verified mechanically: stripping
  comments and imports, the two files are the same text. There is no second validator.
- **`src/problemCheck.js`** — the adapter. It derives a `ComposedModel`-shaped object and a
  `ProjectionPlan` from Topic 2's own subject, resolved dimensions and form, so the validator cannot
  tell which topic is feeding it. It stores nothing: there is one copy of the learner's numbers and
  it is `state.dims`.
- **The line** is the platform `.match-status` component in its own wording — `Still to match: …`
  while something disagrees with the question, `✓ Your construction matches the problem.` when
  nothing does. A mismatch is never red; work merely unfinished reads as the validator's own
  "keep going", because `pending` is not `fail`.
- **Step 6 is untouched.** It still replays the whole process and still shows no verdict. Topic 3's
  divergence (ADR-055 amendment 2) survives.
- **Next is never gated** — Topic 3 does not gate it either, and the check is guidance.

`requiredStages` are narrowed to the stages the subject can actually draw: the migrated ids are
Topic 3's vocabulary and a few differ (a cylinder's third stage is `generators` there, `axis` here).
Judging a drawing against a stage it has no way to produce would be an unfixable miss.

The original reasoning, kept because it is what the decision was reversed from:

**`answerValidator.js` is NOT migrated.** Reasons, in order:

1. Topic 2's own `CLAUDE.md` states: *"This is NOT a problem-solving simulator. It has no problem
   library, no answer checking, no scoring."* The first clause changes with this work; the other two
   are a deliberate identity, not an omission.
2. Topic 3's **one documented divergence** from Topic 2 (ADR-055 amendment 2) is that its Step 6
   *checks* where Topic 2's Step 6 *replays the whole process*. Migrating the validator means
   replacing Topic 2's approved Step 6 — the brief forbids that twice ("Do not add a validation
   step", "Do NOT redesign Topic 2").
3. There is nothing to validate. Topic 2's learner does not submit a drawing; the sim constructs
   from the stated dimensions. Topic 3's validator compares the composed model against `answerData`,
   which in Topic 2 would be comparing the sim against itself.

`answerData` is nevertheless **carried on every migrated problem, inert**. It costs nothing, keeps
the schema faithful to Topic 3, and it was used during migration as the oracle that every problem's
overall size still comes out right. If a future step ever wants checking, the data is already there.

## 8. Problem-selection UI — Topic 3's, adopted whole

**Revised 2026-08-12 after review.** The first implementation added a third button to Step 1's
segmented control (`Single Solid · Combination · Problem`). That was rejected: Topic 3 already has
the approved pattern for this surface, and the two topics must be indistinguishable at it. The third
tab is gone and Step 1's controls are back to exactly what they were, labels included.

The library is reached the way Topic 3 reaches it:

```
STEP 1 — What are you constructing?          ← unchanged
  [ Single Solid | Combination of Solids ]   ← unchanged, same labels, same two columns

card eyebrow row:  STEP 1 OF 6            📖 Practice Problems   ← .library-entry, Topic 3's place
                                                     │
                              .problem-library overlay: category groups of .problem-card
                                                     │
                              #active-problem card above the stepper:
                              statement · Need a hint? · Hide Text · Exit Problem
```

Every element is Topic 3's, copied structurally: `.library-entry` with the same open-book glyph,
`.problem-library` with its fixed header, 920px centred column, `libraryIn` motion, focus trap and
Escape, `.problem-group` / `.problem-grid` / `.problem-card`, and `#active-problem` with the
two-state exit confirm. No token is added and no component is invented.

**While a problem is loaded, Step 1 is locked rather than replaced** — the same thing Topic 3 does
to its picker. A single-solid problem reads through the solid picker, a combination problem through
the combination builder, both disabled; leaving the problem unlocks them.

Three CSS lines exist here that Topic 3 does not need: `#active-problem[hidden]`,
`#active-problem-exit-confirm[hidden]` and `.problem-library[hidden]` all restate `display: none`,
because those components set their own `display` and an author rule outranks the UA stylesheet's
`[hidden]`. Topic 3 carries a global `[hidden] { display: none !important }`; Topic 2 does not, and
declares the rule per component instead — which is Topic 2's own existing convention (`.btn[hidden]`,
`.step-panel[hidden]`, `.reset-confirm[hidden]`, …).

## 9. Known limitations, carried into the report

- **Orientation.** Two problems (`ndb-17-12-cylinder`, `kcj-16-10-cone`) state "(i) vertical and
  (ii) horizontal". Topic 3 supports laying an axis down; Topic 2 has no orientation concept
  anywhere — adding one touches `shapeFactory`, `constructionEngine`, `orthographicDrawer` and the
  composer. That is a real capability change, so per the HARD STOP rule it is **not** being made
  silently. Both problems migrate and draw case (i); the limitation is stated on the problem itself.
- **Dimension symbols.** Where a question states a *radius* (`R 18`) Topic 2's field is a *diameter*
  (`ØD 36`), because the symbol belongs to Topic 2's solid. The verbatim statement is unchanged.
- **Dimension set on load.** Loading a problem replaces the dimension set with the question's stated
  sizes — that is the point of loading it. A combination the learner had built by hand does not keep
  its numbers across a problem load, because both use the same `p{i}_` key namespace.

## 10. Files, final list

**Added to Topic 2** — `src/problemLibrary.js`, `src/problemBuilder.js`.

**Changed in Topic 2** — `main.js` (mode/state/controller), `index.html` (Step-1 markup + two CSS
rules), `src/uiManager.js` (the third mode + problem dock), `src/shapeData.js` (four solids, one
range), `src/shapeFactory.js` (pyramid `rTop`), `src/constructionEngine.js` (the `edges` primitive),
`CHANGELOG.md`, `CLAUDE.md`.

**Changed in Topic 3** — nothing.

---

## 11. What actually shipped (added after implementation)

Everything above was written before any application code changed, and everything above held. No
architectural change was needed, so the HARD STOP was never reached.

The one thing the plan understated: `combinationBuilder.shiftPrimitive` also needed the new `edges`
primitive added to its switch, so a frustum of a pyramid seated inside a combination has its sloping
edges lifted with the rest of its stage. One line.

**Verification**

| Suite | Result |
|---|---|
| Node oracle, migrated library (`verify-lib.mjs`) | **765 / 765** — every problem's parts, ranges, subject contract, overall size vs Topic 3's `answerData.bounds`, seating, per-component boxes; all 225 pairings of the 15 solids compose |
| Live browser, Problem Library (`browser-lib.mjs`) | **91 / 91** — Step 1 unchanged, the entry is the platform component in Topic 3's place, the overlay traps focus and closes on Escape, 18 problems load and build, single-solid and combination problems each walk all six steps and four phases, forcing a locked control changes nothing, 42 subject changes leave the label DOM flat (3 → 3) |
| Reduced motion (`reduced-motion-lib.mjs`) | **12 / 12** |
| Pre-existing Topic 2 oracle (`verify-t2.mjs`) | **627 / 627**, unchanged |
| Pre-existing Topic 2 browser (`browser-t2.mjs`) | **87 / 87**; one assertion updated for a count this work deliberately changes (11 solids → 15) |
| Pre-existing reduced motion (`reduced-motion.mjs`) | **11 / 11**, unchanged |

Zero console errors, zero uncaught exceptions, zero failed requests. Screenshots confirm the entry
against Topic 3's, the browser overlay, the loaded-problem card with its hint reveal, a finished
combination problem, and the new `edges` primitive drawing the four sloping edges of a square
frustum.

**One defect found while verifying.** A disabled control still fires its handler when driven with
`dispatchEvent`, so `setSolid` could replace the dimension set while the subject was still the
problem's — geometry built from keys that no longer existed (`Computed radius is NaN`). All five
free-practice controllers now return early while a problem is loaded.
