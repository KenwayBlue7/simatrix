# Syllabus Compliance Report — `graphics_module_3_topic_2_2_conic_sections`

**Audited against:** `../1003.pdf` — *Diploma Curriculum Revision 2026*, course **1003 Engineering
Graphics**, Semester I, Module II. Cross-read with `../Conic Sections.pdf` (textbook Chapter 6,
pp. 55–70) and the two previous audits in `../Conic Sections - Syllabus Audit.docx`.

**Audit date:** 2026-08-02
**Scope:** syllabus compliance only. No code was changed to produce this report.
**Verdict: the syllabus content is already 100 % present. The gap is pedagogical, and it is
precisely inverted — see §3.**

---

## 1 · What the official syllabus actually requires

Module II, "Basic Figures", 12 instructional hours total, of which Conic Sections has **4**:

> **Conic Sections** — *"Ellipse – Rectangular Method & Concentric Circle Method only,
> Parabola- Tangent method only"*
> Mode of delivery **L** · Mapped **CO2** · Bloom's level **Understand** · **4 hours**

Self-learning, week 4:

> *"Conic Sections - Methodology and terminology. Construct an Ellipse – Rectangular Method and
> Concentric Circle Method. Construct a Parabola- Tangent method"* — 1.5 h

**The word "only" appears twice.** The syllabus scope is exactly **three constructions**:

| # | Syllabus item |
|---|---|
| 1 | Ellipse — **Rectangular Method** |
| 2 | Ellipse — **Concentric Circle Method** |
| 3 | Parabola — **Tangent Method** |

Three things follow, and all three matter:

- **No hyperbola construction is required.** The syllabus names none under Conic Sections.
- **No eccentricity / focus-directrix construction is required.** Nor intersecting arcs,
  parallelogram, offset, rectangle-for-parabola, four centres, foci or asymptotes.
- **The taxonomy level is *Understand*, not *Apply*.** Compare Development of Surfaces in the same
  module, which is *Apply*. The conceptual half of this topic is therefore squarely in scope, not
  an indulgence — but the three constructions must still be drawable, because the ESE pattern
  (Part B, 10-mark set questions, one per module) is a drawing paper.

**Out of scope, and correctly absent from this topic:** "Miscellaneous Curves — Involute of a
circle and rectangle" is a separate Module II subtopic with its own 4 hours, and belongs to a
different Simatrix topic. Nothing is missing here on that account.

---

## 2 · Mapping: every syllabus item → simulator step

| Syllabus item | Simulator step | Implementation | Textbook | Status |
|---|---|---|---|---|
| Conic Sections — terminology | Steps 1–4 + Step 4 "label the engineering names" | `termsLayout`, 19 captions, hover-explained | §6.2, §6.4, §6.6, §6.8 | ✓ Full |
| Conic Sections — methodology | Step 5 | 13 constructions, staged playback on one | §6.5, §6.7, §6.9 | △ see §3 |
| **Ellipse — Rectangular Method** | **Step 5** | **`ellipse-oblong`** | **Example 6.3, Fig. 6.7** | **✓ built, oracle-verified** |
| **Ellipse — Concentric Circle Method** | **Step 5** | **`ellipse-concentric`** | **Example 6.2, Fig. 6.6** | **✓ built, oracle-verified** |
| **Parabola — Tangent Method** | **Step 5** | **`parabola-tangent`** | **Example 6.8, Fig. 6.13** | **✓ built, oracle-verified** |
| CO2 "construct geometrical figures" | Steps 5 + 6 + Practice | Problem Library, 15 exercises, hand-dialled self-check | Exercises 1–15 | ✓ Full |
| ESE drawing competence | Step 5 + Practice | all three methods have a practice problem | — | △ see §3 |

**Verified, not assumed.** All three required constructions are checked by
`verify/conic-math.mjs`: every plotted point satisfies `x²/a² + y²/b² = 1` for the two ellipse
methods and a zero discriminant for the tangent method's envelope, to 1e-9. All three have a
Problem Library exercise (`ellipse-oblong-120-80`, `ellipse-auxiliary-100-70`,
`parabola-tangent-110-80`) with scaffolded hints and a never-auto-fill check.

---

## 3 · The gap, stated precisely

**Content compliance is 100 %. Pedagogical compliance is inverted.**

Step 5 has a full step-by-step teaching apparatus — staged playback, Back / Next a line at a time,
a narrated readout, and a stage counter. It is wired to **exactly one construction**:

```js
const general = conic.method === sim.ECCENTRICITY_METHOD;
if (btnPlayBuild) btnPlayBuild.hidden = !general;   // src/uiManager.js
if (buildNav)     buildNav.hidden     = !general;
```

`ECCENTRICITY_METHOD` is the focus-and-directrix construction — **which the syllabus does not
require at all.** The three constructions the syllabus *does* require draw whole, in a single
frame, with no play button, no stage list and no numbering lifecycle.

So the brief's central request is correct and the gap is real. It is smaller than the brief
assumes — nothing needs building from scratch, and no new mode is needed — but it is exactly
where the brief says it is.

### 3.1 Fully implemented (no work needed)

Double cone · section plane · all six §6.1 sections · circle · ellipse · parabola · hyperbola ·
focus · directrix · eccentricity · Dandelin sphere and its two tangencies · dynamic cutting ·
interactive drawing sheet with hover explanations · derived-measurement readouts · construction-line
toggle (already works across **all thirteen** constructions, `drawSheet`'s `showConstruction`) ·
practice library with hints · the six-step flow.

### 3.2 Partially implemented

| Item | What exists | What is missing |
|---|---|---|
| Step-by-step for the three syllabus methods | the constructions themselves, correct and verified | stage list, animation, Back/Next, replay |
| Point numbering | numbers are drawn (`String(i)`) on all three | they carry role `construction`, so they follow the construction-lines toggle rather than the build stage; no "hide after completion" |
| Playback controls | Play, Back a line, Next line | **Pause** |
| Methodology | the construction and its given dimensions | **Method / Purpose / Instruments / Output** — the syllabus's own word is "Methodology" |
| Terms | 26 hover explanations on the sheet + inline popovers | no collapsible **Engineering Terms** panel; `drawHighlight()` already exists to light a term up in the drawing |
| Syllabus vs enrichment | — | nothing tells the learner which of the 13 are examinable |

### 3.3 Missing

**Nothing from the syllabus.** Every construction named in course 1003 is present and correct.

---

## 4 · One architectural recommendation, against the brief

The brief asks for a new **Engineering Drawing Mode** alongside Concept Mode.

**Recommendation: do not add a mode.** The six-step flow already *is* that separation —

- Steps 1–4 answer **WHY** (the cone, the cut, the six sections, the Dandelin derivation)
- Step 5 answers **HOW** (the constructions, on a drawing sheet)
- Step 6 is practice

A parallel mode would duplicate Step 5, split the drawing sheet's state in two, and contradict
"preserve the six-step learning flow" — the brief's own first constraint. The transition the brief
describes ("I now understand why" → "I now know how to draw it") is a *copy and sequencing* change
inside the existing Step 4 → Step 5 hand-over, not a new container.

The **Concept View / Engineering Drawing View** distinction the brief wants on the drawing sheet
already exists as sheet *modes* (`locus` / `terms` for concept, `methods` / `eccentricity` for
construction) selected by step. What is missing is that it is not *named* for the learner.

---

## 5 · Implementation plan

Ordered by syllabus impact. Each phase leaves the topic shippable.

| Phase | Work | Syllabus justification |
|---|---|---|
| **A** | **Staged construction for the three required methods.** A stage list per method in textbook order, gating each layout, driven by the existing `buildStage` machinery and the existing Play / Back / Next controls — un-gated from `ECCENTRICITY_METHOD`. | The three named constructions; ESE Part B is a drawing paper |
| **B** | **Pause**, and a slower default dwell. | "Students must clearly observe every construction line" |
| **C** | **Point numbering tied to the build stage** — numbers appear with the points they label and leave when the curve is joined. | "matching textbook order… hide numbering after completion" |
| **D** | **Method / Purpose / Instruments / Output** on all 13 methods, as pure data. | Syllabus: "Conic Sections — **Methodology** and terminology" |
| **E** | **Syllabus badge** — "Required by the syllabus" on the three, "Beyond the syllabus · textbook §6.x" on the other ten. Nothing removed. | Brief §Advanced Concepts; honest scoping |
| **F** | **Engineering Terms panel** — collapsible, textbook terms only, hover lights the element in the drawing via the existing `drawHighlight()`. | Syllabus: "Methodology and **terminology**" |
| **G** | Copy pass on the Step 4 → Step 5 hand-over; name the two sheet views. | Brief §Connect the current steps |

### 5.1 Files to modify

| File | Change |
|---|---|
| `src/conicData.js` | per-method stage lists; `methodology` metadata; `syllabus` flag |
| `src/conicEngine.js` | stage gating inside `ellipseOblong`, `ellipseConcentric`, `parabolaTangent`; numbering lifecycle |
| `src/uiManager.js` | un-gate the stepper; badge; methodology block; terms panel |
| `index.html` | terms-panel and methodology markup; Pause button; badge tokens |
| `main.js` | pause; per-method stage count in the playback |
| `verify/conic-math.mjs` | assert each stage list is monotonic and ends at the finished curve |
| `verify/interaction.mjs` | assert the three methods can be played, paused, stepped and replayed |
| `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `../DECISIONS.md`, `../RULES.md`, `../CHANGELOG.md` | record it |

### 5.2 Files that remain untouched

`src/cone.js`, `src/iShape.js`, `src/shapeData.js`, `src/anim.js` (byte-identical to Module 2 —
RULES.md §1.3–1.4) · `src/sectionCut.js` (verbatim, ADR-058) · `src/stepper.js` (the six steps) ·
`src/problems.js`, `src/problemLibrary.js` (practice already covers all three) · `src/onboarding.js`
· `src/terms.js` · `meta.json` · the whole Step 1–4 concept path and the ADR-089…097 apparatus.

No ADR is superseded. No rendering, camera, orchestrator, state or drawing-sheet system changes.

---

## 6 · Compliance scorecard

| Measure | Before this pass |
|---|---|
| Syllabus constructions present | **3 / 3 = 100 %** |
| Syllabus constructions mathematically verified | **3 / 3** |
| Syllabus constructions with practice problems | **3 / 3** |
| Syllabus constructions with step-by-step teaching | **0 / 3** |
| Non-syllabus constructions also shipped | 10 (textbook §6.5/6.7/6.9 — enrichment) |
| Syllabus items missing entirely | **0** |

The pass ahead moves row 4 from 0/3 to 3/3, and labels rows 5 honestly.
