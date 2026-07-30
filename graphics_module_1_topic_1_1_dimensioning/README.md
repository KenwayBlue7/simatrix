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

## The subject: the Guide Plate

One component carries the whole lesson. The drawing never switches objects — new dimensions
appear on the same plate as the student advances, so every rule, arrangement and symbol is
read against geometry they already understand.

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
true bowl — so orbiting into the 3-D view never exposes a drawn-on lie.

---

## The six steps

Steps 1 and 2 split §4.1 the way the chapter itself does: **Step 1 is how a dimension is
drawn**, **Step 2 is where its parts may go**. Every step closes on a summary card.

1. **Elements** — the plate is drawn but undimensioned. "Add the dimensions" builds them on
   in the order a draughtsman works: projection lines, then the dimension line growing out
   from its middle, then the termination, then the value. Then four studies on that one
   drawing: the **six elements** of §4.1 (point at one and the drawing isolates it alone); a
   clickable **line-type legend** (Type A / B / E-F / G) that holds one weight of line and
   fades the rest; the **five terminations** of Figs. 4.5–4.6 with a **15°–90° included-angle
   slider** (the band §4.1 actually allows); a **space slider** that squeezes the projection
   lines together until the heads have to go outside the limits and then give way to a dot
   (Figs. 4.7–4.8, §4.6 rule 7); and the **three leader heads** of Fig. 4.4 — a dot inside a
   surface, an arrow on an edge, nothing at all on a dimension line.
2. **Rules** — ten rules from §4.1/§4.3/§4.6, each with a switch that morphs the drawing so
   the ambiguity the rule prevents becomes visible. Two are **permissions** rather than
   prohibitions (Fig. 4.2's centre-line-as-projection-line is the clearest), and those switch
   between two lawful drawings with neither side flagged wrong. Plus a **draggable value**
   that checks itself against Method-1's placement conditions and slides back when it is put
   somewhere illegal.
3. **Methods** — Method-1 ↔ Method-2 on a drawing that carries a horizontal, a vertical, an
   inclined and an angular dimension. A **turn-the-drawing** slider shows Method-1's values
   rotating with their lines and flipping so they always read from the bottom or the right,
   while Method-2's stay horizontal and interrupt their lines instead. A **Fig. 4.10 study**
   puts the same value on eight dimension lines pointing every way round the circle, and the
   **Fig. 4.11(a)/(b)** switch offers the angular value aligned with its arc or written
   upright — the form the textbook calls simple and suggests for class work.
4. **Arrangement** — the same located features re-dimensioned six ways (§4.3: chain, parallel,
   combined, superimposed running in one and in two directions, and by co-ordinates), each
   animating into place, with a **before/after split view** to weigh space, clarity and
   manufacture against each other. Where the chapter's own figure prints more than one form,
   that form is a **variant chip**: Fig. 4.17(a) turned values against (b) upright, and all
   three co-ordinate representations of Fig. 4.19.
5. **Symbols** — the **five** §4.4 indications in their own group, labelled as the BIS set,
   with the slot, chamfer, countersink and chord/arc below them as feature conventions that
   are explicitly *not* symbols. Each carries the **variants its own figure prints** — the
   circle four ways plus the "ø omitted" case, the radius three ways including the large
   offset radius, the square three ways, the chamfer external / simplified / internal, and the
   countersink by diameter (Fig. 4.27a) and by depth (Fig. 4.27b).
6. **Review** — the plate carries its complete dimensioning plus **twelve** seeded faults:
   eight that break a rule, and four **notation** faults of exactly the kind Figs. 4.28–4.44
   spend their time correcting (`12R`, `Rad 15 mm`, `24 Dia`, `D28`). Click a marker to accuse
   a dimension; a correct accusation re-draws the fault into its BIS form in front of you. The
   step also carries **the sheet itself** — a caption band, a scale selector that resizes the
   drawing while every value on it stays exactly the same (§4.5 item 5), and a unit selector
   that restates the drawing in centimetres with the general note §4.5 item 4 requires. The
   nine rules of §4.6 and the class-work system of §4.5 are open from the moment the step is.

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
├── assets/fonts/               the three bundled woff2 faces (byte-identical platform-wide)
└── src/
    ├── main.js                 orchestrator: scene, ortho camera, rebuild(), redraw(), simAPI
    ├── dimensionData.js        PURE DATA — the Guide Plate: outline, features, mm↔world
    ├── dimensionRig.js         the solid + its AUTHORED linework (the front elevation)
    ├── meshAnalyzer.js         COPIED VERBATIM from Foundations — welded edge→faces map
    ├── lineDrawer.js           COPIED from Foundations — the live camera-dependent
    │                           visible/hidden/silhouette classifier (the 3-D inspection)
    ├── dimensionDraw.js        the BIS dimension renderer: specs → linework + label anchors
    ├── dimensionLabels.js      CSS2D values, draggable pills and clickable review markers
    ├── dimensionSteps.js       PURE DATA — step copy, glossary, §4.6 checklist, §4.5 system
    ├── dimensionRules.js       PURE DATA — Step 2's rule/violation pairs + placement checks
    ├── dimensionSymbols.js     PURE DATA — Step 5's §4.4 symbol catalogue
    ├── dimensionExamples.js    PURE DATA — anatomy, arrangements, complete drawing, faults
    ├── dimensionAnimations.js  PURE DATA — timings, stagger maths, named camera poses
    ├── dimensionUI.js          the guided stepper + every step's controls
    ├── anim.js                 the shared tween engine (byte-identical, RULES.md §7.1)
    └── terms.js                the glossary popover singleton
```

**Two decisions worth knowing before you edit anything** (both recorded as ADR-078 in
`../DECISIONS.md`):

- **One orthographic camera, no perspective camera, no projection morph.** This topic *is* a
  drawing: a dimension only measures truly under parallel projection. RULES.md §5.18's
  dual-camera morph governs moving *between* a perspective view and an ortho quick-view;
  with no perspective camera in the scene there is no such hand-off to make. Orbit stays
  live — the same parallel camera swings round the part.
- **Two linework systems, chosen by the camera pose** (ADR-081). The **front elevation** draws
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
see ADR-079, and do not "fix" them back.

---

## Verification

Run headlessly over the DevTools Protocol with Node's **built-in** `fetch`/`WebSocket` — never
puppeteer or playwright (RULES.md §2.17), with the network cache disabled (§2.18). Last full
pass:

- Boots clean, `window.simAPI` exposes exactly `pause`/`resume`/`reset`, `<title>` matches
  `meta.json.title`, canvas present, fallback hidden.
- **Zero console errors and zero warnings** across a walk of all six steps: 10 rules in both
  variants, 5 termination styles plus the included-angle slider, all three regimes of the
  space study, 3 leader heads, 4 line types, both methods plus a rotation plus the oblique
  clock plus both angular styles, 6 arrangements with every variant plus the compare split,
  9 symbols with every variant, both scales, both units, and all twelve faults found.
- Value drag and the keyboard nudge both report a placement verdict against §4.2.
- `renderer.info.memory` flat across 50 rapid `simAPI.reset()` calls (geometries 3 → 3), and
  every CSS2D node removed with it (labels 0 → 0).

---

*Module 1 Topic 1.1 — Dimensioning · BIS practice taught on one machined Guide Plate ·
standalone Module-2 orchestrator pattern · single orthographic camera · declarative
dimension-spec renderer · Chapter 4 of the prescribed textbook · Three.js 0.160.0 · no build
tools.*
