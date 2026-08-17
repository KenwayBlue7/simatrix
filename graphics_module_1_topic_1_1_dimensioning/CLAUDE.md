# CLAUDE.md — Simatrix · Module 1 Topic 1.1: Dimensioning (BUILT)

> **STATUS: BUILT (2026-07-26), curriculum-audited and remediated (2026-07-27), pedagogically
> redesigned onto a five-figure progression (2026-08-04).** The sim is
> implemented, self-starting and headless-verified. `CURRICULUM-AUDIT.md` (here) is the
> standing checklist against the textbook; everything in it is implemented **except** the
> production/authoring workflow, which is deliberately postponed — see its status section and
> the scope note in `README.md`.
> It follows the **standalone orchestrator pattern** of the sibling
> `../graphics_module_1_topic_1_foundations` (ADR-007 / ADR-029 / ADR-033) — a thin `main.js`
> with pure leaf modules around it — **not** Module 1's legacy shared `engine.js`.

## Project-wide documentation

This topic consumes the single root copies. **Never** create a local `DESIGN.md` or
`PRODUCT.md` here (RULES.md §1.14, ADR-028).

- `../ARCHITECTURE.md` — what the platform is
- `../DECISIONS.md` — why (the ADR log; this topic is **ADR-133**, **ADR-134**, **ADR-136**,
  **ADR-199**, **ADR-200** and **ADR-203**)
- `../RULES.md` — the enforcement checklist
- `../DESIGN.md` — the shared design system and token table
- `../PRODUCT.md` — the platform product contract
- `../MODULE-STARTER.md` — how a new topic is stood up
- `README.md` (here) — what this topic teaches and how it is put together

## Academic source of truth

`../Dimensions.pdf` — **Chapter 4 "Dimensioning"** of the prescribed textbook (*Engineering
Graphics for Diploma*, pp. 29–40), following the Bureau of Indian Standards. Section numbers
in the copy and in the source comments (§4.1 … §4.6, Figs. 4.1–4.34) are the chapter's own.

**Never contradict it.** In particular:

- The **arrowhead proportions** are the chapter's (Figs. 4.5–4.6, §4.5 item 2): open head,
  included angle ≈15°, length 3–4 mm, drawn with a thick line; closed/filled heads 3–4 long ×
  1.5–2 wide; oblique strokes at 45°; dots ≈1.5 mm. These deliberately differ from the
  platform's default 3:1 head (RULES.md §6.19) because this topic *teaches* the proportion —
  see **ADR-134**, and do **not** "fix" them back.
- The **symbol set is the chapter's, not ISO's**, and it is **five**: ø, R, Sø, SR, □. The
  slot, chamfer, countersink and chord/arc are dimensioned by the chapter but are NOT
  recommended symbols, and Step 5 keeps them in a separate group saying so. Chapter 4 defines
  no depth (↧), counterbore (⌴) or thread indication, so none is invented. Do not fill the gap
  from general practice without a new citation, and do not re-merge the two groups.
- **Projection lines leave NO GAP at the feature.** `SPACING.extGap` is 0 because Fig. 4.1
  annotates that junction "No gap is left here". Other drawing offices leave one; this chapter
  is the authority here. Do not put it back.
- Values on the drawing are **bare numbers in millimetres** (§4.5 item 4) — never suffixed
  "mm". Step 6's centimetre mode is the exception the chapter itself describes: the values are
  restated and a **general note goes near the title block**, precisely so no unit is written
  after each value.

## The subjects — FIVE figures, simple to complex (2026-08-04)

`src/dimensionData.js` exports a `FIGURES` catalogue, and **each step uses the simplest figure
that can teach its concept**. This replaced "one component for all six steps" after the
lecturers' review: a beginner meeting their first dimension on a fourteen-feature stepped part
spends their attention reading the OBJECT rather than the DIMENSION.

| Figure | Size | Used by | Allowed to carry |
|---|---|---|---|
| `plate` — Plain plate | 130 × 80 × 20 | Step 1 anatomy + space study | nothing but a rectangle |
| `hole` — Plate with a hole | + ø30, csk ø44 far face | Step 1 legend + leader study · **Step 2, all ten rules** | one hole, its centre line, one hidden outline |
| `slot` — Slotted plate | + R15, 2 × ø12, 16 × 40 slot | Step 4 arrangement | three located features in a row |
| `chamfer` — Chamfered plate | + 20 × 45°, ø24 | Step 3 values | a sloping and an angular dimension |
| `guide` — Guide Plate | 200 × 100 × 30, 14 features | Step 5 symbols · Step 6 sheet study | everything |

> **⚠️ DO NOT "simplify" by deleting a figure or by putting a step back on the Guide Plate.**
> The progression *is* the pedagogy. Equally, do not add a seventh step to make room for a
> figure — the brief's constraint is six steps, and a new figure enters by being *swapped into*
> an existing step.

> **⚠️ The first four figures are the SAME 130 × 80 × 20 blank on purpose.** Step 1 swaps
> plain ↔ holed as the learner opens a study, and an identical blank means that swap moves not
> one dimension on the sheet. Changing any of those three numbers on one figure breaks that.

> **⚠️ The holed plate's far-face countersink is the ONE deliberate exception to "only what
> this step teaches".** Step 1's line legend has to name a dashed line and Step 2's
> `visible-outlines` rule has to argue against a hidden outline. Remove it and both lose their
> example. (Same reasoning as the Guide Plate's, below.)

`toWorld` is ONE fixed mm→world map shared by every figure — two sheets of a comparison must be
in the same space. Only the CAMERA is per-figure, via `figure.frame` ({centre, reach}, the
`SHEET_CENTRE_MM`/`SHEET_REACH_MM` shape). `HALF_DEPTH` stays a **constant sheet plane** while
`halfDepthOf(figure)` gives each solid its own thickness, so the dimension apparatus never
steps toward the viewer on a thinner figure.

`main.js` owns `currentFigure` + `setFigure(id)`, and `setFigure` runs the ordinary path —
`rebuild()` → `handleResize()` → `applyPose()` → captions/badge. A figure change is a geometry
change like any other and still happens in exactly one place (RULES.md §3.1). Never mutate the
rig's geometry from a step function to "just change the shape".

### Figure 5 — the Guide Plate

The complete component, reserved for Step 5 and for Step 6's sheet study (`src/dimensionData.js`,
`FIGURES.guide`):
200 × 100 × 30 mm, stepped, carrying a rectangular block, a shoulder, an R15 fillet, an R12
corner, a 10 × 45° chamfer, a ø40 bore **chamfered 3 × 45° at its front mouth**, a ø14 hole
countersunk ø24 × 90° **on the far face**, a □22 square hole, a 16 × 48 slot, an Sø24 / SR12
spherical seat, an **R220 crown on the step's top face**, and a **ø28 × 26 cylindrical spigot
on the right end face**.

> **⚠️ Three of those features exist ONLY to make a figure showable, and removing any of them
> silently deletes a piece of the syllabus:**
> - the **spigot** has its axis in the drawing plane, so the elevation shows it as a
>   **rectangle** — the whole subject of Fig. 4.21, which a flat plate cannot otherwise show;
> - the **crown** is R220, whose centre falls 166 mm below the plate and therefore off the
>   sheet — the large-radius case of Fig. 4.22. It is deliberately shallow so it meets the R15
>   fillet at about 10°, under `dimensionRig.js`'s `CORNER_DEG`, and stays smooth;
> - the **bore's mouth chamfer** is why the bore reads as two concentric circles in the front
>   view, and it is the only internal chamfer on the part (Fig. 4.26c).

> **⚠️ The countersink is on the FAR face on purpose.** A front elevation of a flat plate
> otherwise has no hidden detail at all, and §4.6 rule 5 ("dimensions are to be given from
> visible outlines rather than from hidden lines") needs a real dashed outline to argue
> against. Moving it to the near face silently removes the drawing's only Type E/F line and
> guts Step 2's `visible-outlines` rule, which is the only place left that argues against it.

Every feature is real geometry — the countersink a true 90° cone, the seat a true spherical
bowl — so the 3-D view never exposes a drawn-on lie. The solid is one manifold, hard-edged,
non-indexed mesh (RULES.md §3.14, §3.29).

## Architecture (ADR-133)

Two departures from Topic 1, both deliberate:

- **One `OrthographicCamera`, no perspective camera, no `projectionMorphK` morph.** A
  dimension only measures truly under parallel projection, so this sim never renders the part
  in perspective. RULES.md §5.18 governs the hand-off *between* a perspective view and an
  ortho quick-view; with no perspective camera there is no hand-off. Orbit stays live.
- **No occlusion raycaster and no `three-mesh-bvh`.** Nothing here is camera-dependent: the
  linework is authored from the same outline the solid is extruded from, and the one hidden
  outline is authored dashed. (Contrast Topic 1, whose raycaster is load-bearing — do not
  copy this decision back into it.)

The dimension apparatus is **declarative**: a step hands `main.js` a list of specs plus a
reveal progress, and `redraw()` is the single funnel from specs to linework and CSS2D values.
Geometry still changes only inside `rebuild()` (RULES.md §3.1).

**Leaf layering.** The topic's *pure-data* modules (`dimensionData`, `dimensionSteps`,
`dimensionRules`, `dimensionSymbols`, `dimensionExamples`, `dimensionAnimations`,
`dimensionLayout`, `reviewFigures`) carry no behaviour and no scene objects, and are importable
by any leaf — the `genericSolid.js` exception of RULES.md §3.6, recorded in ADR-133. The
**behavioural** leaves (`dimensionRig`, `dimensionDraw`, `dimensionLabels`, `dimensionUI`) never
import one another. `dimensionDraw` imports `dimensionLayout`, which is the one data leaf that
also owns maths — see below. `reviewFigureSvg` imports `reviewFigures` and nothing else: it
emits an SVG string and touches neither the DOM nor Three.js, so it stays measurable in Node.

## The annotation layout pass (ADR-203)

`dimensionLayout.js` is a second look at every drawing, run inside `draw()` before a single
stroke is emitted. It works out where every projection line, dimension line, arrow head, arc,
leader and value will actually land, finds the pairs that are touching or closer than **3 mm**,
and moves the LOWER-PRIORITY one until they are not.

- **3 mm is derived, not invented.** §4.5 item 3 letters a value 3–4 mm high; one letter-height
  of air is the smallest gap that still reads as two things rather than one smudge. The SAME
  number governs every pair, which is what makes the sheet look drawn by one hand.
- **Priority is by how much freedom each kind has** — sloping dimension (1), angle (2), straight
  dimension (3), leader (4). A spec may override with `priority`.
- **The five knobs**, and nothing else: a lane moves out, a sloping offset grows or shrinks, an
  arc shrinks (or its value moves further out), a leader lengthens or is re-aimed within 20°,
  and — last resort — a value slides 6 mm along its own dimension line (`textAlongMm`).
  `from`, `to`, `text`, `kind`, the termination and the method are NEVER touched, so every
  drawing states exactly the same sizes measured between exactly the same points.
- **A nudge is kept only if the sheet gets less crowded.** The objective is the sorted list of
  shortfalls compared lexicographically — worst contact first, then the next. That is why the
  pass cannot cure one clash by causing another, and why it cannot cycle.

> **⚠️ FIVE CONTACTS ARE LAWFUL AND ARE NOT COLLISIONS.** Same spec; two dimensions sharing a
> limit in the same row (a chain's arrow heads meet nose to nose — Fig. 4.15; superimposed
> running draws every line on the last — Fig. 4.17); two strokes along the same line; a
> PROJECTION line crossing another projection line or a dimension line (every stacked
> arrangement in §4.3 does this, four rows deep in Fig. 4.16 — forbidding it would forbid
> parallel dimensioning); and a leader's first 6 mm, which exists to touch something.
> Two VALUES are exempt from none of it.

> **⚠️ A DRAWING THAT IS MEANT TO BE WRONG MUST STAY WRONG.** Step 2's ten broken rules take no
> part in the pass — not moved, not avoided. They are excluded by `tone: 'bad'`/`'good'`, by
> carrying a fault knob (`extShort`, `extSkew`, `textNudgeMm`), or by `pinned`. Delete that and
> the pass tidies the lesson away in front of the learner. (Step 6's four `wrong` sheets are
> wrong on purpose too, but they never reach this pass at all — they are flat SVG from
> `reviewFigureSvg.js`, which shares no code with the renderer the pass feeds.)

The pass is memoised on a signature of the layout-relevant spec fields, so it runs once per
change and not once per animation frame. It stands down entirely when a spec carries `only`
(Step 1 renders one ELEMENT of a dimension at a time, and half a dimension's boxes are not the
dimension's boxes).

`SPACING`, `TERMINATION`, the vector helpers, `linearEnds()` and `textPlacement()` LIVE in
`dimensionLayout.js` and are re-exported by `dimensionDraw.js`. That is deliberate: the pass has
to reason about the same proportions the renderer strokes with, and two copies of Fig. 4.6 would
be one copy too many.

## Framing (do not re-derive from the bounding box)

The camera is centred on the PART and the frame is a symmetric **reach** out from there
(`figure.frame = { centre, reach }` in `dimensionData.js`, read through `frameOf()` in
`main.js`) — the shape of Foundations' `frontViewPose`. Each figure carries its own frame,
because a 130 × 80 plate with two dimension lanes and a 200 × 100 plate with five do not fit
the same box; everything below is the Guide Plate's, and each simpler figure's reach was
measured the same way.
Framing the bounding box of everything drawn instead is what left the plate riding high in the
viewport: five dimension lanes stack below the drawing against one above it, so the box's centre
falls ~27 mm under the part. The lanes are hairlines; the plate is the visual mass. The 13 mm
rightward nudge on the centre is the measured offset of the drawn ink from the part's middle
(the leader notes and the spigot all sit off the right-hand end, with nothing to balance them).
The reaches are measured across every step, not guessed — re-measure before changing either.

## Render order (do not reshuffle casually)

`solid (0) → hidden dashed (1) → visible wide (2) → the dimension apparatus (3)`, with the
hidden batch on `depthTest: false` and the solid deliberately **opaque** (a transparent
material renders in the late transparent pass and would paint over the hidden linework).
`setDimmed()` is the only thing that makes the solid transparent. This ordering is what keeps
RULES.md §3.18a's precedence — a coincident visible line still wins over a hidden one.

## Topic-own viewport tokens

`--color-flag-wrong` / `--color-flag-right` / `--color-flag-wrong-soft` are **additions**, not
redefinitions (RULES.md §4.16). A dimensioning lesson has to be able to say "this stroke is
the wrong one" inside the viewport, where the accent blue is forbidden (§4.5). They are never
used alone: a faulted dimension always also carries a ✗ marker and a written rule, and a
corrected one ✓ (Two-Cue Rule, §4.6).

## Voice (do not undo)

**Plain teaching language, and NO citations anywhere a learner can see.** No section numbers,
rule numbers, item numbers or figure numbers in any card, chip, label, tooltip, announcement,
checklist entry, accessible name or page description. They stay in the source comments, which are
for us — every rule remains traceable to the chapter from the code without putting a reference in
front of a first-year student mid-sentence.

**This rule has NO exceptions, and it is enforced by a test.** Step 6's worked examples came from
four numbered figures of the chapter and briefly said so on their chips and board header; a review
on 2026-08-17 removed that, and the Step-6 walk now sweeps every rendered string and every
`aria-label`/`title`/`alt`/`placeholder` in the panel and the board for `Fig`, `Figure n`, `4.2x`,
`4.3x` and `§`. An accessible name counts as learner-facing — the sweep covers it because a chip
whose visible label is clean can still read a citation aloud.

Budgets that keep the drawing the hero: **step bodies 75–100 words**, three short paragraphs on
the What it is / Why we use it / instruction pattern; **summaries 4–5 short bullets** — six only
where a step teaches two independent choices, which is Step 4 alone (five layouts, then the line
saying the method is a separate axis); glossary entries two or three sentences. If an interaction can show it, do not explain it in advance.

Formal terms are introduced only after the concept lands — the legend says "Visible edge · Thick
line" before it ever says Type A, and Step 3's control, where the two systems are first met, says
"Aligned" and "Unidirectional" rather than Method-1 and Method-2.

**Step 4's method selector is the one place that carries the NUMBER, and it carries both:**
`Method 1 · Aligned`, `Method 2 · Unidirectional`. By Step 4 the concept has landed, the chapter
numbers them itself, and a lecturer asks for "Method 1" out loud — so a learner who has only ever
seen the word cannot follow the room. The number alone says nothing about what changes on the
paper and the word is what an exam answer must contain, so it is never one or the other. `label`
on `METHODS` is that string, and it is the single source of it.

**"Beginner-friendly" never means a word the exam does not use.** Where the standard, the
textbook and the paper all say one thing, that is the label; the everyday synonym goes beside it
in the explanation card, in `.detail__alias`, and nowhere else. So Method-2 is
**Unidirectional**, with *(also called upright)* under it — never "Upright" on the control. A
learner who leaves knowing only the friendly word has been taught a term they cannot use.

## TWO linework systems, chosen by the pose (ADR-136)

The topic draws the part's edges two different ways and swaps between them in
`main.js`'s `applyViewMode()`:

| Pose | Linework | Why |
|---|---|---|
| **Front view** | The rig's **authored** batches | A drawing is a fixed, agreed projection. Which lines are dashed is a draughting decision Step 2's "measure from visible outlines" rule argues about — it must not shift under the learner |
| **3-D view · Turn over · free orbit** | `lineDrawer.js`, **classified live** against the camera | Once the part turns, the question is "what can I see from *here*?", and that has a different answer every frame |

`src/meshAnalyzer.js` and `src/lineDrawer.js` are **copies of Foundations'** — the reviewed
reference for this exact problem. `meshAnalyzer.js` must stay byte-identical (md5
`be543af5cb26c2787a3b8a74861d5664`); `lineDrawer.js` differs only in its header and group name.
Do not fork their logic; fix bugs in both topics.

**The study dim belongs to the DRAWING only.** Step 3's oblique clock and every Step-4
arrangement push the part into the background by making its material transparent, and Step 1's
line legend does the same to hold one line type. Both are suppressed the moment the linework is
handed to the classifier (`applyMaterialState()` in `dimensionRig.js`, driven by
`setAuthoredVisible`). This is not cosmetic: a transparent mesh renders in Three.js's **late
transparent pass**, after every opaque object, so a dimmed solid in the 3-D view paints over the
classifier's strokes and its far faces show through as surfaces the part does not have. The
wants are held, not dropped — returning to the elevation restores the study intact.

**Rig state is replayed on every rebuild.** `rigState` in `main.js` is the single record of the
dim, the line-type focus and the centre lines; `applyRigState()` pushes it, and `applyViewMode()`
calls it at the end of every `rebuild()`. Writing at the rig directly from a step function
instead would come back wrong after a WebGL context loss — that is what `applyLayers()` +
`setXray()` are for in Foundations. Use `setRig({ … })`.

**The solid is `FrontSide`, and every loop is wound so its normal points out of the material.**
`THREE.Raycaster` honours `material.side`, so this is what the occlusion pass is calibrated
against — and an inward normal is not merely a shading bug: `lineDrawer`'s `SAMPLE_BIAS` nudges
each probe OFF the surface along the summed incident-face normal, so a reversed face drives the
probe INTO the metal and that edge classifies hidden from every direction. The spigot's ring
winding runs the opposite hand to `pushWall`'s z-ordered convention and is wound explicitly to
compensate; do not "tidy" it, and do not reach for `DoubleSide` to fix a dark face.

**Gotchas:**

- The classifier welds and raycasts in **world space**, so the sheet must be square-on and
  centred while it is live. `applyViewMode()` drops the Step-3 turn and the two-sheet compare on
  entering a dynamic view and restores the turn on returning. Do not "fix" that by leaving the
  sheet rotated — the raycasts would be measured against a stale weld.
- The BVH is built once per `rebuild()` and **freed with `disposeBoundsTree()` BEFORE the
  geometry**. Reordering that leaks CPU-side typed arrays past the disposal contract.
- The reclassify pass is gated on `lineDrawer.group.visible`, so the elevation costs nothing.
  Ungating it would run ~1200 rays a frame for linework nobody is looking at.
- "Reveal hidden lines" hides the solid's **material**, never the mesh — the raycaster reads
  geometry, and removing the mesh would make every edge classify visible.

## Two things about the AUTHORED linework that depend on the POSE

Both are switched by `rig.setViewMode('front'|'rear'|'free')` from `main.js`'s `applyViewMode()`.
Neither is per-edge classification — nothing is recomputed while orbiting, so ADR-133 stands.

- **The spigot's two long edges are a SILHOUETTE.** They are the sides of the rectangle in an
  axial view and a false crease down a smooth cylinder in any other, so they show only in the
  elevation. Putting them back in the main outline batch reintroduces the crease.
- **The far-side countersink is drawn BOTH ways** and swapped with the pose: dashed from the
  front, continuous once the plate is turned over. If it does not change, the "Turn over" chip
  is lying and Step 2's visible-edges rule loses its example.

## Parity with Foundations (do not undo)

`PARITY-AUDIT.md` (here) is the standing implementation-parity checklist against the reviewed
sibling `../graphics_module_1_topic_1_foundations`. All items are closed. Four of them are easy
to reverse by accident:

- **The summary card is a CONCLUSION.** It is gated on `isComplete(currentStep)` and driven from
  `sync()`. Painting it in `goToStep()` again would put every answer on screen before the
  learner starts.
- **`goToStep()` calls `sim.restoreView()`.** Every Back / Next / rail jump puts the camera back
  on the drawing. Manual orbit, zoom and pan stay live — this only undoes them at a step
  boundary, because this topic's subject is a flat elevation and a skewed sheet misrepresents it.
- **Step copy uses one heading triad** — What it is / Why we use it / How it is drawn — with any
  instruction sentence left unlabelled. Documented on the `STEPS` JSDoc in `dimensionSteps.js`.
- **Step 1's `postBody` is withheld until its controls exist** (`controlsVisible()` in
  `renderCopy()`), because it describes them.

`dimensionUI.js` is large (~1000 lines) because it paints every control from six catalogues.
That is deliberate; do not split it mid-topic.

## Panel layout (one system, all six steps)

```
#step-card  (flex column)
  .card__scroll   flex: 1 1 auto · min-height: 0 · overflow-y: auto   ← the ONLY scrolling box
  .card__nav      flex: 0 0 auto                                       ← sticky by construction
```

The footer is sticky because it is a **non-shrinking sibling of the scroll box**, not because
anything is positioned. Nothing has `position: sticky` or a z-index, so the footer can neither
scroll away nor overlap the content, at any viewport height. Do not "improve" this by making it
`position: sticky` inside the scroll region — that reintroduces the overlap it avoids.

Spacing, and where it is declared:

| Between | Value | Rule |
|---|---|---|
| sections (direct children of a step panel) | 16 px | `.step-panel > * + *`, `.group-stack > * + *` |
| stacked accordion headers | 8 px | `.fold + .fold` |
| a heading and its content | 12 px | `.group__label`, `.fold__body` |
| a control and the verdict it produces | 12 px | the `+ .detail` pairing rules |

**These rules are declared AFTER the component styles on purpose.** `.step-hint` and
`.summary__list` zero their own margin at the same specificity, so only the later rule wins the
tie; moved earlier, those gaps silently collapse to 0. The stack uses margins rather than a
flex `gap` because a gap is identical between every pair and stacked accordions have to sit
closer than sections do.

`[hidden] { display: none !important }` is load-bearing: `[hidden]` loses to any author rule
that sets `display`, and this panel sets `display: flex` on chip rows, option lists, the
progress meter and the segmented controls. Without it, hidden containers stay laid out as empty
flex boxes reserving their own height *and* the panel's gap around them.

**Next is never disabled.** A learner who wants to read ahead, or who is stuck, must be able to
move. `isComplete()` still drives the rail's ✓ marks, the closing summary card and the footer's
remaining-work hint — it just does not gate navigation. The rail unlocks every step already
reached (`maxReached`), not every step finished.

Accordions animate through `interpolate-size: allow-keywords` + `::details-content` — CSS only,
no layout read-back, nothing to thrash. Browsers without them snap open and closed correctly;
the animation is never load-bearing.

## Control vocabulary (four shapes, and when each is right)

The module deliberately has a small set of control shapes. Adding a fifth is a decision, not a
convenience.

| Shape | Use it for | Rule |
|---|---|---|
| `.chips` | A small set browsed by eye — the elements, the symbols, the variants | Glyph optional; latch one |
| `.opts` | A set of **four or fewer** compared side by side (Step 1's line types) | Beyond four, use `.select` |
| `.select` | A set of **five or more** picked from (Step 2's rules, Step 4's layouts) | Collapsed by default |
| `.select` (paired) | One question with **two axes** — Step 4's layout **and** method, for each sheet | Same component twice, same order both times, tighter gap |

**Why Step 4's method control is a `.select` and Step 3's is a `.seg`.** Two items is a `.seg` by
the table above, and Step 3's is one. Step 4's cannot be: its labels carry BOTH names of each
method — `Method 1 · Aligned` — because a lecturer says "Method 1" and an exam wants the word,
and `Method 2 · Unidirectional` does not fit a half-width segment in a 320 px panel (`termres`
measures the bare word at 93 px of a 156 px segment already). It also sits directly under the
layout selector and asks the same shape of question about the same drawing, so the two read as
one pair. Do not "unify" them into two segmented controls without re-measuring at 1280 px.
| `.seg` | A genuine two- or three-way **either/or** (Correct·Violation, Aligned·Unidirectional) | Never a toggle |
| `.toggle` | An **on/off overlay** (the compare on Steps 3 and 4, the eight-directions study) | Fixed label; the switch carries state |

Two rules that are easy to break by accident:

- **A toggle's label never changes.** A button that rewrites its own text on press makes the
  learner re-read it to find out what just happened. State lives on the switch and on
  `aria-pressed`.
- **A control that does not apply right now stays put, fades, and says why.** It does not
  disappear. Step 4's compare before a second layout exists and Step 3's angle choice under
  Unidirectional both follow this — a control that vanishes makes the learner wonder what they
  did.

`.fold` is the disclosure for anything that is reference, or a secondary study: Step 1's three
"how it is drawn" studies, Step 6's sheet settings and rules list — and in Step 6 the sheet fold
also owns the viewport while it is open, exactly as a Step-1 study does. Closing a Step-1 fold puts
the drawing back to the plain anatomy, so the viewport never keeps showing a study whose
control is no longer on screen.

## The comparison (Step 3's two methods, Step 4's layout × method)

ONE compare component, two uses. `compareSlots` in `dimensionUI.js` lists its two homes —
`compare-slot-3` and `compare-slot-4` — and `toggleCompare()` branches per step. There was a
third, `compare-slot-6`, holding the faulty Guide Plate beside the corrected one; it went with the
fault hunt on 2026-08-16, and Step 6's comparison is now the worked examples' own two sheets,
which are always side by side and need no control at all.
`compareKind` in `main.js` (`'method' | 'layout' | null`) says which is live. **Do not
infer it from `compareMethod !== null`** — that cannot tell "Step 4, both sheets in Method 1"
from "no comparison at all", and a Step-4 method change would then repaint the wrong sheet.

**Step 4 compares on TWO axes: layout and method.** A sheet is a (layout, method) pair; the panel
discloses one selector per axis for each sheet, in the same order both times. `method` was already
a per-draw option in `dimensionDraw.js` and a spec could already override it, so sheet B carrying
its own method needed **no renderer change** — `layerB.draw(specs, { ...opts, method })`, and that
is the whole mechanism. No geometry, no sizes and no values differ between the two sheets; only
the drafting convention the values are written under.

> **⚠️ FOUR OF THE SIX LAYOUTS DRAW THE SAME SHEET UNDER BOTH METHODS, and that is correct.**
> Aligned and unidirectional are identical on a *horizontal* dimension line — both sit above it,
> both read from the bottom. Chain, parallel, combined, running-one-way and co-ordinates measure
> only across the part, so only **Running, both ways** (which has vertical dimension lines) shows
> the two apart. `ARRANGEMENTS[i].showsMethod` is **derived** from each layout's own specs in
> `dimensionExamples.js`, never hand-declared, and the Step-4 card uses it to say plainly that the
> two sheets are identical here and to name the layout where they are not. Do not "fix" this by
> adding a vertical dimension to a layout that does not have one — that would be inventing a
> dimension to make a feature look busier, and the honest version is the better lesson.

**Step 4's compare opens on a LAYOUT pair, in one method** — exactly as it did before the method
axis existed. Opening on a method pair instead would put two indistinguishable sheets on screen
four times out of six, which reads as a broken feature.

**Step 3 is the methods comparison, and it is the answer to "which method is preferred?".**
`main.js` holds `compareMethod` (the method shown on the OTHER sheet, or `null`); the compare
draws the *same chamfered plate* twice, sheet A in the learner's current method and sheet B in
the other one, each captioned with its name. The card under it becomes a three-row table —
*across and up · sloping and angles · read from* — whose cells are deliberately **fragments,
not sentences**: the panel is ~320 px wide and a table of full sentences wraps into unreadable
mush, and the brief asked for a comparison that is visual rather than text-heavy. The nuance
lives in one paragraph below the table (`METHOD_CHOICE.note`), which says aligned is the
convention this course draws in, that unidirectional is not a lesser method but what typed and
CAD drawings use, and that the one forbidden thing is mixing them.

**`METHODS` and `METHOD_CHOICE` in `dimensionSteps.js` are the single source of method copy.**
The single-method verdict card and the comparison table both render from them
(`renderMethodDetail()`). There used to be a second copy called `METHOD_COPY` inside
`dimensionUI.js`; it is gone, and re-adding one is how the control, the card and the table
start disagreeing about what unidirectional means.

Things that are easy to break:

- **Sheet offsets are ±`COMPARE_DX` and nothing else.** Each sheet's ink already sits `FRAME.cx`
  right of its own origin (the frame is nudged right to balance the leader notes), so adding
  `cx` to the offsets pushes both sheets the same way and leaves the PAIR off centre — which is
  exactly what made the left drawing look tighter and slightly different from the right.
- **`setCompareOffsets` re-sizes only when the compare opens or closes.** The frustum widens for
  two sheets, and a resize reallocates every `LineMaterial.resolution`. Swapping which layout
  sheet B shows is a spec change; routing it through a resize is what "no unnecessary
  rebuilding" is about.
- **Switching either side never goes through `sim.setArrangement`.** That path re-runs the main
  drawing's reveal animation, which throws away the comparison the learner is looking at. Use
  `renderArrangementDetail()` + `sim.setCompare()` — see `toggleCompare` and `selectCompareWith`.
- **The comparison list is EVERY layout, including the one on the drawing.** It used to exclude
  the current one, because a sheet was identified by its layout alone and two sheets showing the
  same layout would have been the same drawing twice. A sheet now carries a layout **and** a
  method, so "same layout, other method" is a real comparison — the one that shows the two
  methods apart — and excluding it would make that impossible to ask for. What is forbidden is
  the whole PAIR colliding, and `keepPairDistinct()` is the guard: it moves whichever axis the
  learner did **not** just touch, so a deliberate choice is never overwritten under their hand.
  Do not put the exclusion back.
- **Each sheet names itself.** `labelLayer.setSheetCaption()` anchors the name in the sheet's own
  world space at `CAPTION_AT` — centred on `SHEET_CENTRE_MM`, not on the part's midpoint, or the
  two names stop being symmetric even when the drawings are. Do not put the names back in a
  strip at the top of the viewport; that is what they were, and it left the learner matching a
  label at the top of the screen to a drawing in the middle of it.
- **Annotation scales with the drawing in compare mode** (`#sim-viewport.is-compare .vp-value`).
  A CSS2D pill is a fixed pixel width however small the drawing gets, so the longest note runs
  off the edge at narrow viewports. It is applied to BOTH sheets, so they stay identical.

## Step 6 IS the worked examples — the fault hunt is GONE

A lecturers' review (2026-08-14) found the review too abstract: a learner was asked to find
faults having never been shown a wrong drawing beside its corrected form. Chapter 4 prints
exactly that four times — Examples 4.1–4.4, Figs. **4.28** L-plate, **4.29** Lock plate,
**4.30** Template, **4.31** Rod support — and those four are what the class is set. They went in
beside the existing twelve-fault hunt, and a second review (**2026-08-16**) removed the hunt
outright: being shown a mistake beside its correction is what teaches it, and two assessments in
one step buried the pairs that do the teaching. Step 6 is now **passive and instructional**.

> **⚠️ DO NOT RE-ADD A FAULT HUNT, A SCORE, A PROGRESS METER OR A MARKER.** `MISTAKES`,
> `faultyDrawing()`, `reviewHotspots()`, `onHotspotPick()`, `setHotspots()`, `renderScore()`,
> `reportFault()`, the `.vp-hotspot` component and the `.progress` component were all deleted on
> 2026-08-16, and `sim.setReviewView` became `sim.setSheetView`. The removal is the requirement,
> not a side effect of one — the lecturers asked for the step to stop testing. Reversing it is a
> product decision, not a refactor.

**Four chips are the whole navigation, and they name the PART** — `L-plate`, `Lock plate`,
`Template`, `Rod support`. Nothing else: an ordinary `.chips` row, no glyph.

> **⚠️ NO TEXTBOOK CITATION REACHES THE LEARNER, and Step 6 has no exception.** The chips briefly
> carried `Fig. 4.28` over the part's name, and the board's header printed it too; a UI-cleanup
> review on **2026-08-17** took both out. This is a standalone learning module, not a viewer for
> a scanned textbook, and a figure number is a reference a first-year student cannot act on. The
> Voice section's no-citations rule below therefore stands with NO exceptions — do not reopen
> one. `reviewFigures.js` still records `no` per figure so the geometry stays checkable against
> the scan, and `verify`'s Step-6 walk sweeps every rendered string AND every `aria-label`,
> `title`, `alt` and `placeholder` in the panel and the board for `Fig`, `Figure n`, `4.2x`,
> `4.3x` and `§`, on all four examples and with the sheet study open.

| File | What it is |
|---|---|
| `src/reviewFigures.js` | PURE DATA. The four figures: outline, circles, centre lines, hidden detail, and TWO annotation sets each (`wrong` / `correct`) plus the six-a-side prose |
| `src/reviewFigureSvg.js` | The SVG renderer. Six annotation kinds and nothing else |
| `verify/reviewfigures.mjs` | Measures every sheet in Node — no browser |

> **⚠️ FLAT 2-D IS THE REQUIREMENT, not a shortcut.** No canvas, no camera, no orbit, no
> isometric, no animation. The lecturers asked for plain illustrations because a student
> comparing two sheets is reading paper, and anything that turns or tweens moves their attention
> off the drawing. Do NOT "upgrade" these to the WebGL renderer — `dimensionDraw.js` answers a
> different question, and reusing it would drag a camera and a scene graph in behind it.

> **⚠️ THE GEOMETRY AND EVERY VALUE ARE THE CHAPTER'S**, read off the scans of pp. 36–37. The
> figures are internally consistent and a single edit breaks that: Fig. 4.29's chain reads
> 12 · 8 · 74 · 20 = 114 and 10 · 14 · 24 = 48; Fig. 4.30's 60° cut is what fixes the top edge at
> x = 80 (45 of rise over 45/tan 60°); Fig. 4.28's ø20 hole is centred ON the R20 corner's own
> centre. Change a link and you must change the overall, and then it is not the chapter's figure.

> **⚠️ THE `wrong` SETS MUST STAY WRONG.** They take no part in the ADR-203 layout pass — nothing
> here goes near it — and `verify/reviewfigures.mjs` reports them without counting them. A fault
> sheet "fixed" to clear the verifier has had its lesson deleted. Same reasoning as Step 2's ten
> broken rules.

**Two departures from the scans, both for legibility, both commented where they are made:** Fig.
4.30's `5` sits in the middle of the space the land leaves rather than against the riser, and
Fig. 4.31's ø24 leader runs 6 mm further out. At the chapter's own placement both values land on
the outline at screen size. Everything else is where the chapter puts it.

**The board covers the viewport, and the CSS2D layer goes down with it.** A 320 px panel cannot
hold two engineering drawings side by side, so `setExamples()` in `main.js` paints
`#review-sheet` over `#sim-viewport` and sets `labelRenderer.domElement.style.display = 'none'`.
An opaque background is NOT enough on its own: CSS2D labels are real DOM, so leaving the layer up
paints every one of the Guide Plate's values over the examples and leaves any focusable one in
the tab order behind a panel nobody can see. Closing "The sheet itself" is the path that would
do it.

**"The sheet itself" OWNS THE VIEWPORT while it is open.** The scale and unit study (§4.5 items
4–5) acts on the 3-D Guide Plate, which the board covers, so the fold takes the board down on
open and puts the pair back on close — and picking an example chip closes the fold. Same contract
as Step 1's studies: a control whose subject is not visible is not a control. `enterStep(6)` calls
`showSheet()` so the plate is ready UNDER the board, and `goToStep`'s step-6 branch then decides
which of the two wins. That branch runs LAST for exactly that reason.

**The pair stacks below 720 px — and that is a CONTAINER query, not a viewport one.** The
viewport shrinks whenever the wizard panel is open, so a media query would measure the wrong box.

**Step 6 completes on reading all four examples.** There is nothing here to get right or wrong.
Next is still never disabled; this drives the rail's ✓ and the closing summary only. `renderNav`
suppresses the gate hint on the last step, so `gateHint`/`gateHintLong` deliberately have no entry
for 6 — and note that a COMPLETED last step carries a terminal ✓ instead of `is-current`, so no
rail item has that class. Any harness that asks the rail "which step am I on?" must read the
visible `.step-panel` instead.

## Step 6 is a READING, not a seventh lesson and not a test

Its copy is deliberately the shortest in the module and the panel leads with the chips: the
learner is here to look at two drawings, not to read the panel and not to be scored. The verdict
card under the chips names the part and says how many faults the left sheet carries; the board's
own two lists name each one. Colour is never alone — the wrong sheet's captions carry ✗ and the
right sheet's ✓, and every fault is written out in prose.

## Step ownership (do not shuffle back)

**Step 1 is how a dimension is DRAWN; Step 2 is where its parts may GO.** That split is §4.1's
own, and it exists because the audit found Step 2 carrying three unrelated control clusters
while Step 1 carried one. The termination selector, the included-angle slider, the space study
and the leader heads all belong to Step 1 — the step that names the termination and the leader
as elements. Moving them back overloads Step 2 and leaves Step 1 passive again.

**Each step also owns its FIGURE, and picks it in its own `show*()` function** — `setFigure()`
is called by `showStudy`, `showRule`, `showMethods`, `showArrangement`, `showSymbol` and
`showSheet`, never from `dimensionUI.js`. The controller entries that change *what is being
studied* inside a step (`addDimensions`, `focusLineType`) re-pick too, which is how Step 1
swaps plain ↔ holed as a fold opens. A step must never assume the figure it inherited from the
step before it.

## Verification

### The worked examples (2026-08-16)

`node verify/reviewfigures.mjs` — no browser. The four CORRECTED sheets must show no value
overlapping another and no value sitting on the part's outline; **4/4 pass**. The four faulty
sheets are printed and never counted (`--all` shows their deliberate faults). Measured in the
browser as well, over a full Step-6 walk at 1440 and 900 px: all four examples open, both sheets
render at the same scale, the corrected sheet's real glyph boxes never overlap, the pair stacks
to one column below 720 px with the board never scrolling sideways and values still 14 px tall,
the four chips fit two rows and carry no citation, "The sheet itself" hands the viewport back and forth without leaving
a CSS2D label over the board or anything of the plate in the tab order, leaving Step 6 gives the
viewport back, reset returns to the first example, and the console stays clean.

> **⚠️ ONE PASS PROVES NO CITATION REACHES THE LEARNER**, and it is not vacuous: it was checked
> by planting `Fig. 4.28` as rendered text, `Based on Figure 4.31` as an `aria-label` and a `§`
> in the verdict card, and it caught all three. Keep that property if you edit the regex.

> **⚠️ ONE PASS PROVES THE FAULT HUNT IS GONE, not hidden**, and it runs FIRST — everything else
> would pass with a `display: none` fault system still wired underneath. It asserts a zero count
> for `[data-review-mode]`, `#review-hunt-block`, `#rev-faults`/`#rev-correct`, `.progress`,
> `#review-detail`, `#compare-slot-6`, `.vp-hotspot`, any CSS rule matching
> `vp-hotspot|progress__|\.score`, and the `simAPI` keys `setReviewView`/`reportFault`/
> `setHotspots`. Keep it first when you edit that walk.

> **⚠️ A SUITE THAT DOES NOT CALL `open()` IS LYING TO YOU.** `figwalk`, `ux`, `cmp2` and
> `s4meth` each ran against whatever state the previous suite left in the tab, so every "step N"
> assertion read one step behind and looked like a sim bug — it was reported as pre-existing
> flake on 2026-08-14 and it was not flake, it was the harness. All four now load the page first.
> What survives that fix and still reproduces byte-identically on the committed baseline is one
> real issue: `cmp2` finds the compare pair ~5 px off the viewport centre.

### The 3-D sheets (last full pass, 2026-08-06)

`node verify/clearance.mjs` needs **no browser**: `dimensionLayout.js` and the three spec
catalogues are pure data leaves, so every drawing in the lesson can be laid out and measured in
Node. It prints what was touching before the pass, every nudge the pass made and why, and
anything still inside the 3 mm clearance. `--all` shows the clean drawings too.

> **⚠️ THE GUIDE PLATE HAS A BUDGET, AND IT IS A RATCHET.** Step 6 carries every feature the
> chapter has on one part, and a few of its notes have to cross a projection line to reach clear
> paper at all. Its budget is **5** residual contacts (down from 20 before the pass existed).
> Lower it when you improve the sheet; **never raise it**. Every other drawing in the lesson
> must come out of the pass completely clear.

Headless over the DevTools Protocol with Node's **built-in** `fetch`/`WebSocket`, cache
disabled (RULES.md §2.17–§2.18):

- **The clearance audit**: 27 drawings, 12 nudges, every drawing within budget. Measured in the
  browser too — 0 px of overlap between any two value pills on Step 3, under both methods.

- **The figure walk**: the right figure on every step and inside every Step-1 study, the
  compare's two named sheets, Step 3's six labels, Step 6's board owning the viewport over the
  Guide Plate, console clean.
- **The Step-4 layout × method walk**: 26/26. It measures the claim rather than the wiring — on
  Running-both-ways the three vertical values TURN under Method 1 and stay LEVEL under Method 2,
  while all four horizontal values are written identically under both — and asserts 0 px² of
  overlap between any sheet caption and any value.
- Re-passed after the redesign: the full lesson regression, the device-pixel-ratio sweep, the
  control-vocabulary audit, the six-step panel-layout table, the any-to-any layout compare and
  both terminology suites (five widths, 1280 → 2560).
- Boots clean; `simAPI` = `pause,resume,reset`; `<title>` matches `meta.json.title`.
- **Zero console errors, zero warnings** over a full walk: 10 rules × 2 variants, 5 termination
  styles + the angle slider, all three regimes of the space study, 3 leader heads, 4 line
  types, both methods + rotation + the oblique clock + both angular styles, 6 arrangements with
  every variant + the compare split, 9 symbols with every variant, both scales, both units, and
  all four worked examples read. The §4.6 checklist and the §4.5 system are painted on entry
  to Step 6, not on completion.
- Value drag and the keyboard nudge both return a §4.2 placement verdict.
- `renderer.info.memory` flat across 50 rapid `simAPI.reset()` calls; CSS2D nodes 0 → 0.

> **⚠️ A backgrounded Chrome tab gets NO `requestAnimationFrame` callbacks at all**, so every
> tween stalls at its first value and the only frames that render are the ones
> `Page.captureScreenshot` forces. That looks exactly like a broken reveal animation and is not
> one. Before blaming the sim: activate the target (`Target.activateTarget`) and launch Chrome
> with `--disable-background-timer-throttling --disable-backgrounding-occluded-windows
> --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion`. A 30-frame
> rAF probe is the one-line test — it should finish in ~200 ms, not hang.

---

## Session Digest Protocol

At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
