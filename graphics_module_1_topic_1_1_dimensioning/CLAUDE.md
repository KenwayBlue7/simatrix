# CLAUDE.md — Simatrix · Module 1 Topic 1.1: Dimensioning (BUILT)

> **STATUS: BUILT (2026-07-26), curriculum-audited and remediated (2026-07-27).** The sim is
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
- `../DECISIONS.md` — why (the ADR log; this topic is **ADR-078** and **ADR-079**)
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
  see **ADR-079**, and do **not** "fix" them back.
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

## The subject — the Guide Plate

ONE component for all six steps (`src/dimensionData.js` is its single source of numbers):
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
> guts Step 2's `visible-outlines` rule and Step 6's `m-hidden` fault.

Every feature is real geometry — the countersink a true 90° cone, the seat a true spherical
bowl — so the 3-D view never exposes a drawn-on lie. The solid is one manifold, hard-edged,
non-indexed mesh (RULES.md §3.14, §3.29).

## Architecture (ADR-078)

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
`dimensionRules`, `dimensionSymbols`, `dimensionExamples`, `dimensionAnimations`) carry no
behaviour and no scene objects, and are importable by any leaf — the `genericSolid.js`
exception of RULES.md §3.6, recorded in ADR-078. The **behavioural** leaves (`dimensionRig`,
`dimensionDraw`, `dimensionLabels`, `dimensionUI`) never import one another.

## Framing (do not re-derive from the bounding box)

The camera is centred on the PART and the frame is a symmetric **reach** out from there
(`SHEET_CENTRE_MM` / `SHEET_REACH_MM` in `main.js`) — the shape of Foundations' `frontViewPose`.
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
checklist entry or page description. They stay in the source comments, which are for us — every
rule remains traceable to the chapter from the code without putting a reference in front of a
first-year student mid-sentence.

Budgets that keep the drawing the hero: **step bodies 75–100 words**, three short paragraphs on
the What it is / Why we use it / instruction pattern; **summaries 4–5 short bullets**; glossary
entries two or three sentences. If an interaction can show it, do not explain it in advance.

Formal terms are introduced only after the concept lands — the legend says "Visible edge · Thick
line" before it ever says Type A, and the value controls say "Aligned" and "Upright" rather than
Method-1 and Method-2.

## TWO linework systems, chosen by the pose (ADR-081)

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
Neither is per-edge classification — nothing is recomputed while orbiting, so ADR-078 stands.

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
| `.seg` | A genuine two- or three-way **either/or** (Correct·Violation, Aligned·Upright) | Never a toggle |
| `.toggle` | An **on/off overlay** (the compare, the eight-directions study) | Fixed label; the switch carries state |

Two rules that are easy to break by accident:

- **A toggle's label never changes.** A button that rewrites its own text on press makes the
  learner re-read it to find out what just happened. State lives on the switch and on
  `aria-pressed`.
- **A control that does not apply right now stays put, fades, and says why.** It does not
  disappear. Step 4's compare before a second layout exists and Step 3's angle choice under
  Upright both follow this — a control that vanishes makes the learner wonder what they did.

`.fold` is the disclosure for anything that is reference, or a secondary study: Step 1's three
"how it is drawn" studies, Step 6's sheet settings and rules list. Closing a Step-1 fold puts
the drawing back to the plain anatomy, so the viewport never keeps showing a study whose
control is no longer on screen.

## The comparison (Step 4, and Step 6's fixed pair)

Two sheets, held side by side. Things that are easy to break:

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
- **The comparison list is every layout EXCEPT the current one**, re-derived in
  `renderArrangementDetail()` whenever the main layout changes. `createSelect.setItems()` swaps
  the options without replacing the trigger, so a list that changes under the learner never
  steals their focus.
- **Each sheet names itself.** `labelLayer.setSheetCaption()` anchors the name in the sheet's own
  world space at `CAPTION_AT` — centred on `SHEET_CENTRE_MM`, not on the part's midpoint, or the
  two names stop being symmetric even when the drawings are. Do not put the names back in a
  strip at the top of the viewport; that is what they were, and it left the learner matching a
  label at the top of the screen to a drawing in the middle of it.
- **Annotation scales with the drawing in compare mode** (`#sim-viewport.is-compare .vp-value`).
  A CSS2D pill is a fixed pixel width however small the drawing gets, so the longest note runs
  off the edge at narrow viewports. It is applied to BOTH sheets, so they stay identical.

## Step 6 is an ASSESSMENT, not a seventh lesson

Its copy is deliberately the shortest in the module, and the panel leads with the progress
meter rather than with prose: the learner is here to look at the drawing. The four marker
states (untouched · checked · wrongly accused · solved) each carry a glyph as well as a colour,
the last-judged marker is ringed so the drawing and the explanation card point at each other,
and the explanation is three short lines — Wrong · Why · Correct. Completing the hunt switches
the viewport to the corrected sheet; that IS the reward, so do not leave the faults on screen.

## Step ownership (do not shuffle back)

**Step 1 is how a dimension is DRAWN; Step 2 is where its parts may GO.** That split is §4.1's
own, and it exists because the audit found Step 2 carrying three unrelated control clusters
while Step 1 carried one. The termination selector, the included-angle slider, the space study
and the leader heads all belong to Step 1 — the step that names the termination and the leader
as elements. Moving them back overloads Step 2 and leaves Step 1 passive again.

## Verification (last full pass, 2026-07-27)

Headless over the DevTools Protocol with Node's **built-in** `fetch`/`WebSocket`, cache
disabled (RULES.md §2.17–§2.18):

- Boots clean; `simAPI` = `pause,resume,reset`; `<title>` matches `meta.json.title`.
- **Zero console errors, zero warnings** over a full walk: 10 rules × 2 variants, 5 termination
  styles + the angle slider, all three regimes of the space study, 3 leader heads, 4 line
  types, both methods + rotation + the oblique clock + both angular styles, 6 arrangements with
  every variant + the compare split, 9 symbols with every variant, both scales, both units,
  12/12 faults found and corrected. The §4.6 checklist and the §4.5 system are painted on entry
  to Step 6, not on completion.
- Value drag and the keyboard nudge both return a §4.2 placement verdict.
- `renderer.info.memory` flat across 50 rapid `simAPI.reset()` calls; CSS2D nodes 0 → 0.

---

## Session Digest Protocol

At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
