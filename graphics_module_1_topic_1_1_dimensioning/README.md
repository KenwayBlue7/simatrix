# Dimensioning — Module 1, Topic 1.1

An interactive lesson on **engineering-drawing dimensioning to BIS practice**, taught on one
real machined component. It sits immediately after
`../graphics_module_1_topic_1_foundations` (the BIS line alphabet) and before the projection
topics: Foundations teaches what the *lines* mean, this topic teaches how a drawing states
**size** and **location**.

**Academic source of truth:** `../Dimensions.pdf` — Chapter 4 "Dimensioning" of the
prescribed textbook (*Engineering Graphics for Diploma*, pp. 29–40), which follows the Bureau
of Indian Standards. Every rule, proportion, figure reference and worked example in this topic
comes from that chapter, and the section numbers used throughout the copy and the source
comments (§4.1 … §4.6, Fig. 4.1 … Fig. 4.34) are the chapter's own.

---

## Run it

Served over HTTP (never `file://` — ES-module CORS):

```
http://localhost:8080/SImatrix/graphics_module_1_topic_1_1_dimensioning/
```

XAMPP Apache on **port 8080** (port 80 is held by Windows IIS). Hard-reload after an edit —
Apache sends no `Cache-Control`.

No build step, no npm, no bundler. Three.js is a pinned CDN ES module (`three@0.160.0`) via
the import map in `index.html`. Fonts are bundled `woff2`, so the sim runs offline after the
first load.

---

## The subjects: five figures, simple to complex

The lesson used to run entirely on the Guide Plate. It no longer does. A beginner meeting the
first dimension of their life on a stepped part with fourteen features spends their attention
reading the *object* instead of the *dimension*, so the figures now grow with the learner:

| # | Figure | Size | The step that uses it | What it is allowed to teach |
|---|---|---|---|---|
| 1 | **Plain plate** | 130 × 80 × 20 | Step 1 (anatomy, space study) | overall sizes, projection lines, dimension lines, terminations, the value, a leader carrying a note |
| 2 | **Plate with a hole** | 130 × 80 × 20, ø30 | Step 1 (line legend, leader study) · **Step 2 (all ten rules)** | `ø`, a centre line, a hidden outline, and every rule about where a dimension's parts may go |
| 3 | **Slotted plate** | 130 × 80 × 20, R15, two ø12, a 16 × 40 slot | Step 4 (arrangement) | several *located* features in a row — the only thing chain / parallel / running / co-ordinates can be argued about |
| 4 | **Chamfered plate** | 130 × 80 × 20, 20 × 45° corner, ø24 | Step 3 (values) | a horizontal, a vertical, a **sloping** and an **angular** dimension — the four cases aligned and unidirectional actually differ on |
| 5 | **Guide Plate** | 200 × 100 × 30, fourteen features | Step 5 (symbols) · Step 6 (the sheet study) | the complete component, once the fundamentals are in place |

All five share one visual style, one line alphabet, one renderer and one interaction set —
they are the same `dimensionRig.js` build fed different data, so nothing about *how* a
dimension is drawn changes when the figure does. The first four are deliberately the **same
130 × 80 × 20 blank**, so a figure swap inside Step 1 moves not one dimension on the sheet.
The live figure names itself in the top-right of the viewport, with the concepts it carries.

### Figure 5 — the Guide Plate

`src/dimensionData.js` is the single source of its numbers. **200 × 100 × 30 mm**, and
deliberately carrying one clean instance of every feature the textbook dimensions:

| Feature | Size | What it lets the lesson show |
|---|---|---|
| Rectangular block, stepped profile | 200 × 100, step 50 high at x = 95 | overall sizes, a shoulder, chain vs. parallel |
| Outside corner radius | R12 | `R`, and the chord/arc pair of Fig. 4.25 |
| Internal fillet | R15 | `R` with a single arrow head on the feature outline |
| **Crowned step face** | **R220** | the LARGE radius of Fig. 4.22 — its centre falls 166 mm below the plate, off the sheet, so the dimension line has to break and offset |
| Chamfer | 10 × 45° | the simplified chamfer indication, Fig. 4.26(a)/(b) |
| Central bore, **chamfered at the front mouth** | ø40, **3 × 45°** | `ø` four ways; the **internal** chamfer of Fig. 4.26(c) — which is why the bore reads as two concentric circles |
| Drilled hole, countersunk on the **far** face | ø14, ø24 × 90° (5 deep) | the countersink of Fig. 4.27 **both ways** — angle with diameter (a) and angle with depth (b) — **and the drawing's one genuinely hidden outline** |
| Square hole | □22 | `□`, plus the diagonals of Fig. 4.23 |
| Slot | 16 wide × 48 long | arrow heads **outside** the limits, Fig. 4.7 |
| Spherical seat | Sø24 / SR12 | `Sø` and `SR`, Fig. 4.24 |
| **Cylindrical spigot** on the right end face | **ø28 × 26** | Fig. 4.21 — a cylinder whose axis lies IN the drawing plane, so the elevation shows it as a **rectangle** and only `ø` plus the centre line say it is round |

The countersink being on the **far** face is a design decision, not an accident: a front
elevation of a flat plate otherwise has no hidden detail at all, and §4.6 rule 5 ("dimensions
are to be given from visible outlines rather than from hidden lines") needs a real dashed
outline to argue against. So the plate is built with exactly one.

Every feature is **real geometry** — the countersink is a true 90° cone, the spherical seat a
true bowl — so orbiting into the 3-D view never exposes a drawn-on lie. The same is true of
the four simple figures: each is extruded and walled from its own outline, so the 3-D view of
the plain plate really is a 20 mm slab and the hole really goes through.

The **holed plate keeps a countersink on its far face** for the same reason the Guide Plate
does, and it is the one deliberate exception to "a figure carries only what its step teaches":
Step 1's line legend needs a dashed line to name, and Step 2's *measure from visible outlines*
rule needs a hidden outline to argue against. Without it neither has an example.

---

## The six steps

Steps 1 and 2 split §4.1 the way the chapter itself does: **Step 1 is how a dimension is
drawn**, **Step 2 is where its parts may go**. Every step closes on a summary card. Six steps,
not seven — the figures were added by *swapping the demonstration figure inside* a step, never
by adding one.

1. **Elements** *(plain plate; the holed plate for the line legend and the leader study)* — the
   plate is drawn but undimensioned. "Add the dimensions" builds them on
   in the order a draughtsman works: projection lines, then the dimension line growing out
   from its middle, then the termination, then the value. Then four studies on that one
   drawing: the **six elements** of §4.1 (point at one and the drawing isolates it alone); a
   clickable **line-type legend** (Type A / B / E-F / G) that holds one weight of line and
   fades the rest; the **five terminations** of Figs. 4.5–4.6 with a **15°–90° included-angle
   slider** (the band §4.1 actually allows); a **space slider** that squeezes the projection
   lines together until the heads have to go outside the limits and then give way to a dot
   (Figs. 4.7–4.8, §4.6 rule 7); and the **three leader heads** of Fig. 4.4 — a dot inside a
   surface, an arrow on an edge, nothing at all on a dimension line.
2. **Rules** *(plate with a hole)* — ten rules from §4.1/§4.3/§4.6, each with a switch that morphs the drawing so
   the ambiguity the rule prevents becomes visible. Two are **permissions** rather than
   prohibitions (Fig. 4.2's centre-line-as-projection-line is the clearest), and those switch
   between two lawful drawings with neither side flagged wrong. Plus a **draggable value**
   that checks itself against Method-1's placement conditions and slides back when it is put
   somewhere illegal.
3. **Methods** *(chamfered plate)* — **Aligned ↔ Unidirectional** (Method-1 ↔ Method-2) on a
   figure chosen because it carries a horizontal, a vertical, a **sloping** and an **angular**
   dimension and nothing else: those are the four cases the two methods differ on, and a value
   that is identical under both teaches nothing. Switching the two re-letters every value on
   the plate: aligned values lie along their own lines and flip so they always read from the
   bottom or the right, while unidirectional values stay horizontal and interrupt their lines
   instead. **Compare side by side** splits the viewport into the *same drawing in both
   systems*, each sheet named, above a three-row table — across and up · sloping and angles ·
   read from — so the difference is seen before it is read. The card closes by naming
   **aligned** as this course's convention without calling unidirectional a lesser method: it
   is what typed and CAD drawings use, and the one thing forbidden is mixing them on one sheet.
   A **Fig. 4.10 study** puts the same value on eight dimension lines pointing every way round
   the circle, and the **Fig. 4.11(a)/(b)** switch offers the angular value aligned with its arc
   or written level — the form the textbook calls simple and suggests for class work.
4. **Arrangement** *(slotted plate)* — the same located features re-dimensioned six ways (§4.3: chain, parallel,
   combined, superimposed running in one and in two directions, and by co-ordinates), each
   animating into place, with a **before/after split view** to weigh space, clarity and
   manufacture against each other. Where the chapter's own figure prints more than one form,
   that form is a **variant chip**: Fig. 4.17(a) aligned values against (b) unidirectional, and all
   three co-ordinate representations of Fig. 4.19.

   The step carries a **second selector — the method** — because a layout says *where the
   dimension lines go* and a method says *how the values on them are written*, and the two
   choices are independent. Method 1 · Aligned is the default and is marked recommended. The
   comparison works on both axes: each sheet has its own layout **and** its own method, so the
   learner can hold one still and move the other — the same layout in both methods, or the same
   method in two layouts — and each sheet's caption names both. Where the pair would collide,
   whichever axis the learner did *not* just touch moves, so two identical sheets are impossible.

   One honest thing this exposes: aligned and unidirectional are **identical on a horizontal
   dimension line**, so five of the six layouts draw the same sheet under either method. Only
   *Running, both ways*, which measures up as well as across, shows them apart. The card says so
   plainly and points at that layout rather than leaving the learner hunting for a difference
   that is not there.
5. **Symbols** *(Guide Plate)* — the **five** §4.4 indications in their own group, labelled as the BIS set,
   with the slot, chamfer, countersink and chord/arc below them as feature conventions that
   are explicitly *not* symbols. Each carries the **variants its own figure prints** — the
   circle four ways plus the "ø omitted" case, the radius three ways including the large
   offset radius, the square three ways, the chamfer external / simplified / internal, and the
   countersink by diameter (Fig. 4.27a) and by depth (Fig. 4.27b).
6. **Review** — the chapter's own four worked examples, and nothing else to do but read them.

   Figs. 4.28 *L-plate* (parallel), 4.29 *Lock plate* (chain), 4.30 *Template* and 4.31 *Rod
   support* (both combined) are Examples 4.1–4.4, and what the class is set. Each is drawn twice
   side by side — **✗ Wrong dimensioning** on the left, **✓ Correct dimensioning** on the right —
   with *What is wrong?* and *Why the corrected version is better* underneath, six bullets a side
   naming every fault the left-hand sheet carries. Four chips choose between them, named for the
   part: *L-plate*, *Lock plate*, *Template*, *Rod support*. **No figure number reaches the
   screen** — the chapter's numbering is recorded in the source data so the geometry stays
   checkable, but the module reads as a lesson of its own, not as a textbook viewer, and a
   citation is a reference a first-year student cannot act on. They are **flat 2-D SVG**: no canvas, no camera, no
   orbit, no animation. A lecturers' review asked for plain illustrations, on the grounds that a
   student comparing two sheets is reading paper. Below 720 px of viewport the pair stacks, wrong
   above correct.

   **The step is passive on purpose.** It used to end with a twelve-fault hunt on the Guide
   Plate — click a marker, accuse a dimension, watch the meter fill. A second lecturers' review
   (2026-08-16) removed it: being shown a mistake beside its correction is what teaches it, and
   two assessments in one step buried the pairs that do the teaching.

   The step also carries **the sheet itself**, which is where the Guide Plate still lives — a
   caption band, a scale selector that resizes the drawing while every value on it stays exactly
   the same (§4.5 item 5), and a unit selector that restates the drawing in centimetres with the
   general note §4.5 item 4 requires. Opening that fold takes the examples board down and gives
   the viewport to the finished sheet; closing it brings the pair back. The nine rules of §4.6
   and the class-work system of §4.5 are open from the moment the step is.

   The step counts as complete when all four examples have been read. Next is never disabled;
   this drives the rail's ✓ and the summary only.

---

## Architecture

The **standalone orchestrator pattern** of Topic 1 (ADR-007, ADR-029, ADR-033): a thin
`main.js` owning the Three.js environment, the single `rebuild()` pipeline and the disposal
contract, with pure leaf modules in a star around it. No shared `engine.js`.

```
graphics_module_1_topic_1_1_dimensioning/
├── index.html                  thin shell: import map, tokens, wizard DOM; self-starting
├── meta.json                   platform metadata (title matches <title>, ADR-026)
├── README.md                   this file
├── CLAUDE.md                   the topic's build notes + session digest protocol
├── CHANGELOG.md                dated change log
│                                 (no local assets/fonts/ — fonts load from the shared platform host, ADR-086)
└── src/
    ├── main.js                 orchestrator: scene, ortho camera, rebuild(), redraw(), simAPI
    ├── dimensionData.js        PURE DATA — the FIGURES catalogue (plate · hole · slot ·
    │                           chamfer · guide): outlines, features, framing, mm↔world
    ├── dimensionRig.js         builds ANY figure: the solid + its AUTHORED linework
    ├── meshAnalyzer.js         COPIED VERBATIM from Foundations — welded edge→faces map
    ├── lineDrawer.js           COPIED from Foundations — the live camera-dependent
    │                           visible/hidden/silhouette classifier (the 3-D inspection)
    ├── dimensionDraw.js        the BIS dimension renderer: specs → linework + label anchors
    ├── dimensionLayout.js      PURE — the annotation layout pass: works out where every
    │                           stroke and value will land, finds the pairs closer than 3 mm,
    │                           and moves the lower-priority one clear (ADR-203)
    ├── dimensionLabels.js      CSS2D values and the draggable pills of Step 2
    ├── dimensionSteps.js       PURE DATA — step copy, glossary, §4.6 checklist, §4.5 system
    ├── dimensionRules.js       PURE DATA — Step 2's rule/violation pairs + placement checks
    ├── dimensionSymbols.js     PURE DATA — Step 5's §4.4 symbol catalogue
    ├── dimensionExamples.js    PURE DATA — anatomy, arrangements, the complete drawing
    ├── reviewFigures.js        PURE DATA — Step 6's four worked examples (Figs. 4.28–4.31):
    │                           geometry, a wrong AND a correct annotation set for each,
    │                           and the six-a-side explanation
    ├── reviewFigureSvg.js      strokes one of those as FLAT SVG — no canvas, no camera,
    │                           no animation. 1 user unit = 1 mm, so the weights are BIS's
    ├── dimensionAnimations.js  PURE DATA — timings, stagger maths, named camera poses
    ├── dimensionUI.js          the guided stepper + every step's controls
    ├── anim.js                 the shared tween engine (byte-identical, RULES.md §7.1)
    └── terms.js                the glossary popover singleton
```

**Two decisions worth knowing before you edit anything** (both recorded as ADR-133 in
`../DECISIONS.md`):

- **One orthographic camera, no perspective camera, no projection morph.** This topic *is* a
  drawing: a dimension only measures truly under parallel projection. RULES.md §5.18's
  dual-camera morph governs moving *between* a perspective view and an ortho quick-view;
  with no perspective camera in the scene there is no such hand-off to make. Orbit stays
  live — the same parallel camera swings round the part.
- **Two linework systems, chosen by the camera pose** (ADR-136). The **front elevation** draws
  the topic's own authored linework — a drawing is a fixed agreed projection, and which of its
  lines are dashed is a draughting decision the lesson argues about. Turn the part and the
  **live classifier** takes over: `meshAnalyzer.js` + `lineDrawer.js`, copied from Foundations,
  re-testing every edge against the camera each moved frame, so silhouettes appear and vanish
  and a buried stretch of an edge goes dashed for exactly its buried length. The **Reveal
  hidden lines** chip takes the faces off for a true wireframe. ≈5.3 ms per pass over 4641
  edges, and the pass does not run at all while the elevation is on show.

The dimension apparatus is **declarative**: a step hands `main.js` a list of specs and a
reveal progress, and `redraw()` is the single funnel from specs to linework plus values. That
is why a rule demo, an arrangement and the review drawing can never disagree about how a
dimension is drawn — they all go through one renderer.

**Every drawing gets a second look before it is inked.** A draughtsman places a dimension,
looks at what it landed next to, and shifts whichever of the two matters less. `dimensionLayout.js`
does that automatically: it works out where every projection line, dimension line, arrow head,
arc, leader and value will actually fall, finds the pairs that are touching or closer than 3 mm
— one letter-height, §4.5's own lower bound — and moves the lower-priority one clear. It may
only push a lane further out, change a sloping dimension's offset, shrink an arc, lengthen or
re-aim a leader, or slide a value along its own dimension line; `from`, `to` and `text` are
never touched, so the drawing always states the same sizes between the same points. A nudge is
kept only if the sheet as a whole gets less crowded, which is why it can never cure one clash by
causing another. Five contacts are lawful and exempt — chief among them a projection line
crossing a dimension line, which is how every stacked arrangement in §4.3 works. Drawings that
are *meant* to be wrong (Step 2's ten broken rules) take no part at all — and Step 6's four
wrong sheets never reach it, being flat SVG from a renderer this pass does not feed.

**The figure is data, not code.** `main.js` holds one `currentFigure` and one `setFigure(id)`,
which swaps the datum and then runs the ordinary path — `rebuild()`, resize, re-pose, re-caption
— so a figure change is a geometry change like any other and still happens in exactly one place
(RULES.md §3.1). `toWorld` is one fixed mm→world map shared by **every** figure, so two sheets
of a comparison are always in the same space; only the CAMERA is per-figure, through
`figure.frame`. Every figure's solid keeps its own thickness while the dimension apparatus stays
on one constant sheet plane, so annotation never steps toward the viewer on a thinner figure.

---

## Scope note — what this topic deliberately does NOT include

**No production or authoring workflow.** The student never places a dimension on an
undimensioned view, redraws a figure to scale, or converts a drawing from Method-1 to
Method-2 by hand. `CURRICULUM-AUDIT.md` identifies that as the chapter's terminal objective
(pp. 36–40 — seven worked examples and four exercise sets) and it is **postponed to a future
version**: it needs an authoring surface, lane snapping and a production validation engine,
which is a different interaction architecture from the declarative spec pipeline this topic
runs on. Everything else in that audit is implemented. Do not bolt a half-authoring mode onto
the spec renderer to close the gap.

The textbook is the source of truth, so the symbol catalogue is **the chapter's, not ISO's
complete set**. Chapter 4 defines no **depth (↧)**, **counterbore (⌴)** or **thread
indication**, so none is invented here. The countersink *is* present, because §4.4 dimensions
it explicitly (Fig. 4.27). If a later syllabus adds them, add them with their own citation —
do not fill the gap from general ISO practice.

**Projection lines leave no gap** at the feature (`SPACING.extGap` is 0). Some drawing offices
do leave one; Fig. 4.1 annotates that junction "No gap is left here", and this chapter is the
authority for this topic. Do not "tidy" a gap back in.

Likewise, the arrowhead proportions are the textbook's own (Figs. 4.5–4.6 and §4.5 item 2:
open head, included angle ≈15°, length 3–4 mm, drawn thick), not the platform's 3:1 default —
see ADR-134, and do not "fix" them back.

---

## Verification

```bash
node verify/clearance.mjs          # what is still tight, if anything
node verify/clearance.mjs --all    # every drawing, and every nudge the layout pass made
node verify/reviewfigures.mjs      # Step 6's four worked examples: overlaps and values on lines
node verify/reviewfigures.mjs --all  # …the deliberately faulty sheets too, for information
```

That one needs no browser: the layout pass and the spec catalogues are pure data leaves, so all
27 drawings in the lesson can be laid out and measured in Node. Every drawing comes out clear
except the Guide Plate, which carries a declared budget of 5 residual contacts — down from 20
before the pass existed — because a few of its notes have to cross a projection line to reach
clear paper at all. That budget is a ratchet: lower it, never raise it.

The rest runs headlessly over the DevTools Protocol with Node's **built-in** `fetch`/`WebSocket`
— never puppeteer or playwright (RULES.md §2.17), with the network cache disabled (§2.18). Last
full pass:

- Boots clean, `window.simAPI` exposes exactly `pause`/`resume`/`reset`, `<title>` matches
  `meta.json.title`, canvas present, fallback hidden.
- **Zero console errors and zero warnings** across a walk of all six steps: 10 rules in both
  variants, 5 termination styles plus the included-angle slider, all three regimes of the
  space study, 3 leader heads, 4 line types, both methods plus a rotation plus the oblique
  clock plus both angular styles, 6 arrangements with every variant plus the compare split,
  9 symbols with every variant, both scales, both units, and all four worked examples read.
- Value drag and the keyboard nudge both report a placement verdict against §4.2.
- `renderer.info.memory` flat across 50 rapid `simAPI.reset()` calls (geometries 3 → 3), and
  every CSS2D node removed with it (labels 0 → 0).

---

*Module 1 Topic 1.1 — Dimensioning · BIS practice taught on five figures, simple to complex,
ending on a complete machined Guide Plate · standalone Module-2 orchestrator pattern · single orthographic camera · declarative
dimension-spec renderer · Chapter 4 of the prescribed textbook · Three.js 0.160.0 · no build
tools.*
