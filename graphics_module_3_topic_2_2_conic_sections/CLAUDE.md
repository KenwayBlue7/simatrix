# CLAUDE.md — Simatrix Engineering Graphics Viewer — Conic Sections

Three.js lesson that teaches **conic sections**: the curves a plane cuts from a right circular
double cone, and how to draw each of them with instruments. Ships as a self-contained ZIP that
runs inside a sandboxed `iframe` on the Simatrix platform.

**Source of truth for the content:** the prescribed textbook's **Chapter 6, "Conic Sections"**
(§6.1 types of conic sections · §6.2 nomenclature · §6.3 conic defined as loci · §6.4 ellipse ·
§6.5 methods of construction of ellipse · §6.6 parabola · §6.7 methods of construction of
parabola · §6.8 hyperbola · §6.9 methods of construction of hyperbola · Exercises 1–15). Every
step, term, construction and problem in this topic comes from that chapter and nothing else; do
not add conic material the chapter does not carry (no polar/parametric algebra, no cycloids, no
involutes), and do not drop a construction it does teach.

**Build status:** feature-complete, and **sequenced as a lesson rather than exposed as a parameter
set** (ADR-141 · RULES.md §6.30–§6.32). The **six-step guided stepper** tells one story — (1) meet
the cone, (2) cut it, (3) six cuts and six curves, (4) why they differ, (5) how it is drawn on
paper, (6) your turn — and each step shows ONLY the controls its own question needs. The section
plane is PLACED by Step 2 itself, and the learner decides when it bites with **Cut the cone**
(`#tgl-cut`, the reference topic's interaction); Step 2 describes the cut in plain words with no
name; Step 3's six chips travel the plane to each named cut and state the textbook rule; Step 4
swings the camera to face the cut, opens the sheet on THAT curve, and reveals the answer in five
stages with its vocabulary held back until the last; Step 5 plays the construction one stage at a
time (or steps it by hand) and lets the learner point at anything on the sheet to be told what it
is; Step 6 deals an unnamed cut and marks the learner's prediction. Before
changing a control, read the topic README's "teaching contract". The 3D half runs the restored Module-2 `cone.js` twice into a double cone
assembled in the orchestrator and truncated by topic-1's `sectionCut.js` clipper once the learner
ticks **Cut the cone** — each nappe's geometry is REPLACED by the clipper's result and its cap
becomes material group 1 in the section token, the reference topic's own pattern, so the section
face is a real face of a real solid (ADR-088, superseding ADR-140). The material the cut removed is
kept as a faint ghost, which is how the chapter's Fig. 6.2 pictorials still read and how a
hyperbola keeps the second branch a steep truncation would otherwise take with it. The 2D half is the Compare sheet: `drawCompare()` in
`main.js` delegates every curve, construction line and label to the pure leaf
**`src/conicEngine.js`** (ADR-139), whose sheet quantities are stored in **millimetres**, not
world units (ADR-138). Sheet scale follows the ADR-053 fixed intrinsic-frame pattern (analytic
construction footprint), with ADR-054 pan / ADR-055 zoom as pure post-multipliers. The textbook
Problem Library ships all **fifteen chapter exercises verbatim**, grouped by curve, with a
never-auto-fill self-check (±0.02 on the eccentricity, ±0.5 on every millimetre and degree).

**The two panes are ONE model** (ADR-088 · RULES.md §3.40-§3.42). The drawing sheet draws the curve
of the LIVE cut: `eccentricityForSection()` is the chapter's identity `e = cos β / cos α`
re-expressed in what this topic dials, `e = sin θ / sin g` (the plane's tilt over the cone's own
generator angle). Steps 1-4 hold that link — `syncSheetToCut()` runs on every cone or plane commit —
and Step 5 releases it, because from there the exercises give *e* and the focal distance as data
and the Problem Library needs both dial-able. `sectionState.enabled` (the plane is present, the
step decides) and `sectionState.cut` (it bites, the learner decides) are different things; do not
collapse them. Edge overlays are built AFTER the cut and the axis centre line is measured from the
surviving geometry, because a truncated nappe has a different silhouette. The sheet's captions
carry hover explanations matched on their own text (`describeAt()`), so a labelled element with no
sentence is a detectable defect.

**Labels are drawing annotations** (ADR-087 · RULES.md §3.36–§3.39). A 3-D name is added only
through `annotate()`, which takes the feature point and one plain-English sentence and produces a
pill + a leader line + a dot on the feature; the pill's offset is applied along the CAMERA's
right/up axes and recomputed each frame, so it stays clear of the silhouette at every orbit angle.
Overlaps are resolved and the pane's edges enforced after the CSS2D pass (`declutterLabels()`,
only when the view has moved). A label leaves with the geometry it names — hiding the second nappe
takes BOTH nappe labels. The cone's **axis is a centre line, present in every step**: a chain-line
stub past the outline and the concealed run as short-dash hidden linework drawn `depthTest: false`,
both from explicit segment geometry at the PLATFORM's constants (Foundations' chain
0.34 · 0.12 · 0.07 · 0.12, overshoot 0.35; Module 2's hidden 0.12 / 0.08). On the sheet,
`drawLabels()` measures every caption, nudges it along a ladder of alternatives, and drops it only
if all are taken — so a construction must never depend on a caption to be legible.

**Content constraint (hard):** the section classification is derived from the cone ON THE BENCH,
never from a constant — `classifySection()` compares the plane's inclination against the live
`generatorAngleDeg()` (the ADR-063 precedent). There is deliberately **no "parallel to a
generator" preset**: finding that angle is the one discovery §6.1 exists to teach, and a preset
would pre-solve it. Step 2 describes the cut in plain words and does NOT name it; the name and the
textbook rule arrive in Step 3 (ADR-141), so the learner is told *why*, not just *what* — but only
after they have seen the *what*.

## Project-wide documentation (read before cross-module tasks)
Before starting any task that touches shared behavior, UI patterns,
or cross-module consistency, read these root-level files:
- ../ARCHITECTURE.md  — system map, component breakdown, data flow
- ../DECISIONS.md     — why key decisions were made (ADR log)
- ../RULES.md         — what you must and must not do (enforcement)
- ../DESIGN.md        — color tokens, typography, component standards
- ../PRODUCT.md       — who it's for, features, accessibility commitments

For module-specific work that doesn't touch shared behavior,
reading the root docs is optional but recommended.

**Design system rules:** Always read and strictly follow `../DESIGN.md` for all colour, typography, spacing, component styling, and UI/UX decisions. Strategic context — users, brand personality, anti-references, design principles, accessibility commitments — lives in `../PRODUCT.md`. Never hard-code design values in CSS or JS — consume tokens defined in `../DESIGN.md`. This module does **not** and must **not** carry a local `DESIGN.md`/`PRODUCT.md` copy.

**Scope boundary:** This module produces a self-contained Three.js *simulation payload* — the 3D viewport plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host Simatrix website (top-level navbar, module browser, account UI, marketing chrome, login, dashboard) is built by other web developers and is **out of scope** here. Treat the sim like a teaching aid embedded in someone else's page: do not render navigation, branding, footer, or any platform-level UI inside the sim's iframe.

---

## Architecture (non-negotiable)

- **No build step.** No npm, Vite, Webpack, bundler, or `package.json` build artifact. Files run by opening `index.html` directly.
- **CDN ES modules only**, via this exact import map pinned to `0.160.0`:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }}
  </script>
  ```
  Never use the UMD global, never use `@latest`, never `npm install three`. **No CSG/boolean library either** — the section is hand-authored geometry (the analytic single-plane clipper, `src/sectionCut.js`, ADR-058), never an npm CSG package. **No curve/geometry library for the 2D sheet either**: every conic in `src/conicEngine.js` is derived from the focal-polar equation or from the construction's own intersections, so each drawn point can be proved to lie on the curve it claims.
- **All asset paths relative** — `./assets/...`, never `/assets/...`. Platform serves the extracted ZIP from an arbitrary URL prefix.
- **ZIP payload ≤ 10 MB.** Prefer `.glb` over `.gltf+bin`; `.webp` over `.png`/`.jpg`; skip HDR environments.
- **Imports must include `.js` extension** (`import { x } from './src/x.js'`). Extensionless imports 404 with no bundler to resolve them.
- **Sandboxed iframe context.** No same-origin assumptions, no server APIs, zero runtime network calls beyond the initial CDN module fetch. The sim must work fully offline once loaded.

## Platform contract (required for Simatrix uploads)

- **`meta.json`** at ZIP root with all four fields — `title`, `description`, `difficulty`, `tags`. Uploads missing any field are rejected. `difficulty` is lowercase only (`beginner`/`intermediate`/`advanced`).
- **`window.simAPI`** exposed in `main.js`:
  ```js
  window.simAPI = {
    pause(),   // cancel the rAF loop
    resume(),  // restart the rAF loop
    reset(),   // restore defaultConeData() + default camera; route through rebuild()
  };
  ```
  The platform calls `pause()` when overlays/whiteboard open and `resume()` on close. The in-sim Reset button must also route through `simAPI.reset()` — no second reset path.
- **Mobile notice.** At viewports `< 768px`, render a dismissible HTML banner reading *"Best experienced on desktop"*. Do not block, redirect, or disable the sim — banner only.
- **Self-starting.** Sim runs on page load; no external `init()` call.

## Geometry engine (restored from Module 2, byte-identical — ADR-009)

`src/{cone,shapeData,iShape,anim}.js` are copied verbatim from `../Module2/src/` and must stay
byte-identical (RULES.md §1.3–1.4) — fix drift in `Module2/` and re-copy, never patch the copy in
place. `iShape.js` is the master's full version taken verbatim, the same *conscious* ADR-027
resolution the two sibling Module-3 topics made (ADR-064): scoping is done through the shapeData
defaults in `main.js`, never by trimming `iShape.js`. This topic carries ONLY the cone — the four
other generators, `genericSolid.js` and `meshAnalyzer.js` are deliberately absent, because nothing
here imports them and an unused copy is a drift surface with no upside.

`src/sectionCut.js` is copied verbatim from `../graphics_module_3_topic_1_sections_of_solids/`
(ADR-058) and is likewise not to be patched here.

The **double cone** is assembled in `main.js` (`buildDoubleCone`), not in a new leaf: a leaf may
not import a sibling leaf (ADR-007 / RULES.md §3.6), and re-authoring the cone geometry would fork
the master's generator. The upper nappe is the same mesh turned 180° about X — never a negative
scale, which would invert the winding the clipper depends on.

**Both topic-local state bags live OUTSIDE ShapeData** (the ADR-059 / ADR-067 pattern): the
cutting plane (`SectionState`) and the drawing sheet (`ConicState`) sit in `main.js` beside
ShapeData and commit through their own `simController` methods, so `src/shapeData.js` stays
byte-identical.

## 3D engineering gotchas (read before writing cone/section math)

- **Right-handed, Y-up.** Re-derive every ported or copied sign visually rather than trusting it.
- **Set `euler.order` explicitly** — `'ZXY'`, matching the restored `iShape.js`.
- **Single `rebuild(shapeData)` function is the only path for geometry changes**, non-negotiable. It runs the disposal contract (deep `traverse()` over every `shapeGroup` child — ADR-042) before building new objects, and that traversal also pulls CSS2D label DOM nodes (RULES.md §3.5). Verify with a WebGL buffer count — it must stay flat across 50 rapid regenerations.
- **Use `LineMaterial` + `Line2`** (from `three/addons/lines/`) for the section curve — standard `LineBasicMaterial` is capped at 1px on most GPUs. Keep `material.resolution` in sync on every resize.
- **`LineDashedMaterial` requires `computeLineDistances()`** on every line object or dashes silently render as solid (the anatomy axis chain line).
- **`polygonOffset: true`** on the solid material — without it, `EdgesGeometry` outlines z-fight with mesh faces and flicker.
- **Hard-edge geometry only.** Non-indexed `BufferGeometry`; `sectionCut.js` refuses indexed input outright.
- **The plane's offset is measured from the APEX**, along the plane's own normal. That is what makes offset 0 exactly section plane FF ("passing through the apex") and what makes the offset at 90° read as the plane's distance from the axis — the pair that separates the isosceles triangle from the rectangular hyperbola.

- **The focal sphere is the chapter's own bridge (ADR-089).** §6.2 defines the focus and the directrix ON THE SOLID, and Step 4's reveal plays that before the sheet measures with either. `focalSphereFor()` (pure, in `conicData.js`) solves it in the V.P., because the cutting plane is always perpendicular to it. It returns `null` for the apex cut and a null directrix for the circle — both are honest answers, not special cases: a circle's tangent plane is PARALLEL to its cutting plane, which is exactly why it has no directrix and e = 0.
- **The scene's Step-4 apparatus lives in the scene graph**, so `setStage` rebuilds on entering AND leaving Step 4, the same way Step 1's anatomy labels come and go. `attachLeaders()` is called ONCE per build, after whichever step's `annotate()` calls ran.

## The 2D sheet (`src/conicEngine.js`)

- **Millimetres, y DOWN.** Sheet quantities are stored in mm (ADR-138) because the construction never enters the 3D scene and every figure in the chapter is quoted in mm. The 3D scene keeps the platform's `1 unit = 10 mm` (ADR-018) — the dock converts, the engine never does.
- **One focal-polar model.** `conicModel(e, fa)` derives the vertex, centre, second focus and directrix, semi-latus rectum, asymptotes and both axes for all three curves; there are no three separate curve code paths. θ = 0 aims from the focus BACK toward the directrix, so it lands on the near vertex — flipping that sign silently breaks PF = e·PQ for every point.
- **Display list, not immediate drawing.** Each layout returns typed primitives plus the analytic `bbox` that locks the sheet scale, and `drawSheet()` is the one renderer. A new construction is a new layout function and never a new drawing path, so the thin-construction / heavy-curve line vocabulary cannot drift between the ten methods.
- **Every construction must be provable.** A plotted point has to satisfy its own conic to floating-point precision. The oracle that checks all ten lives outside the payload (see README "Verifying"); re-run it after touching any layout.
- **The sheet draws WHAT THE CUT IS (ADR-090).** Three of §6.1's six sections are not plane conics: the circle gets a true circle at the cone's own radius there, the apex cut gets the isosceles triangle (or the single point, where the plane through the apex is flatter than the generators), and a plane clear of the cone gets a sheet that says so. `conicState.cutKind` is derived in `rebuild()`'s tail — after the clipper has reported. NEVER clamp a derived value into the model's drawable range and let the drawing stand.
- **The sheet reports what it MEASURES (ADR-091).** Every layout carries `results`, rendered under "What the drawing gives you". Six of the chapter's exercises end in *measure*, *determine*, *find* or *locate*. Report the DERIVED quantity, never the given echoed back — the parallelogram method's axes are not its conjugate diameters.
- **The SYLLABUS is narrower than the chapter (ADR-098).** Course 1003, Module II: *"Ellipse – Rectangular Method & Concentric Circle Method only, Parabola- Tangent method only"*. Those three (`ellipse-oblong`, `ellipse-concentric`, `parabola-tangent`) are badged *Required* and are what an ESE drawing paper asks for; the other seven are textbook enrichment, badged *Beyond*. **Every one of the ten is staged** (ADR-100) — the tiers differ in the BADGE, not in whether the construction animates, because showing a learner who picked the four-centre method the concentric-circle animation tells them something false about what they drew. `buildStagesFor()` returns a stage list or null — one playback system, ten constructions. Switching method must land on the finished figure of the NEW one, or a seven-stage construction inherits a six-stage index and loses its curve, and it must CANCEL the old playback or a stale tick walks the new drawing back. A staged builder may never remove linework between stages, and division marks stay LABELS: a construction `dot` on this sheet means "a point of the curve", and the oracle proves every one of them lies on it.

- **The hyperbola is a SECTION here, never a construction (ADR-115).** §6.9's three methods are deliberately absent: Course 1003 Module II teaches the hyperbola as one of the six cuts and never asks for it to be drawn with instruments, so Step 5 offers two curves and ten constructions. This is the ONE place the topic is narrower than Chapter 6, and it is narrower only in "how to draw it". The hyperbola itself is untouched everywhere else — Step 3's six chips, `classifySection()`, the §6.8 terminology sheet, and the focus-and-directrix sheet that draws it whenever the plane makes one. Do not re-add the constructions, and do not "tidy" the hyperbola out of anything else. Step 6's hyperbola tier is off through `ENABLED_TIERS`, with all fifteen exercises still in `src/problems.js` verbatim.

- **A construction opens on its GIVEN DATA (ADR-118).** Step 5 must never arrive on the finished figure — that puts the answer on the paper before the question and makes "Draw it step by step" look like it starts from the middle. `setupStageFor(method)` in `conicData.js` is the single table of opening stages, applied on entering Step 5, on any request for a construction (keyed on the REQUEST, not on whether the id changed — re-picking what is already selected means "start this one"), and on Reset. It is deliberately NOT stage 0 for every method: the concentric method's two circles ARE its auxiliary circles and wait, while the oblong method is handed its rectangle. When adding a construction, ask not "does this shape enclose the figure" but "is every part of it GIVEN" — the tangent method's triangle looks like a frame and is not one, because the point E at its apex has to be found first (ADR-119). A construction that has already found something has already started.
- **The sheet's drafting vocabulary is closed (ADR-118).** Three line WEIGHTS in one ink — `axis` full strength for centre lines and the given frame, `construction` at `AUXILIARY_ALPHA` for working lines, `projection` at `PROJECTION_ALPHA` for a line carried past the point it produced — and exactly two dash patterns: the chain line `[10, 3, 2, 3]` and `SHORT_DASH`. Do not add a fourth weight or a third dash; six ad-hoc patterns had accumulated before this and none meant anything the others did not.
- **The thumbnail has ONE box on every step, and no step gets a sizing mode of its own (ADR-125, superseding ADR-120).** There is a single card element, `#compare-card`, and its rect comes from a single rule, `.compare-card[data-size="compact"]`. Step 5 does not size it differently — `body.drawing-main` SWAPS which of the two panes is large and which is the card, and leaves the card's rules untouched. So a report of "this step's thumbnail is the wrong size" is never a missing shared component; it is an override, and the fix is to DELETE the override, not to narrow it or add a selector that defeats it. ADR-120's `body.sheet-docked` was exactly such an override — a full-height column on Steps 4 and 6 that made the same panel 420×320 on four steps and 403×876 on two — and it is gone, along with `--sheet-col`/`--sheet-row` and the `.vp-note`/`.vp-hint` re-anchors that only existed to dodge the column. `syncSheetDock()` now sets only `sheet-solo` and does not read the stage. **Accepted cost:** on Steps 4 and 6 the card sits over the box the camera framed the cone into again; oracle section 7 PRINTS that overlap on every run rather than asserting it away, so the trade stays visible. If it is ever addressed, reframe the CAMERA — that lever is per-step by nature and does not fork the chrome.
- **Below 768px the sheet is the other VIEW, not a window on this one (ADR-123).** A phone has no second rect to give, so the sheet is one pane at a time: `body.sheet-solo` gives the drawing the whole viewport and the pane behind it goes `visibility: hidden` — *covered* and *gone* are different things to a CSS2D label. This is NOT a second size (ADR-125 removed the only one of those); it is a different pane being on screen. It opens MINIMIZED, because Step 4 swings the camera to face the cut and then opens the sheet. `syncSheetDock()` re-derives it from `isWorkbenchViewport()`, so a rotated phone is a change of MODE and not of size — that is why `main.js` listens to the media query itself and not only to the `ResizeObserver`. Size a phone panel from what it has to HOLD, never as a percentage of the screen: 42% of 640px left the step card a 99px scroll port and put Step 6's only action below its fold. Touch-target floors belong in `@media (pointer: coarse)`, not in a width breakpoint. The `< 768px` platform banner is fixed-position and MUST reserve its measured height (`body.notice-up` / `--notice-h`) or it paints over the sheet's own Minimize button. Section 9 of the interaction oracle drives the emulated device and measures all of this, because the defect it replaces was arithmetic and a "is there a mobile breakpoint?" check passed the broken layout.
- **Every step draws its own sheet, and Step 6 borrows the cut (ADR-117).** The construction sheet belongs to Step 5 ALONE — `sheetMode()` reads `stage === 5`, never `>= 5`, or the finished drawing runs on into the step that asks the learner to name an unnamed cut. Steps 1–4 and Step 6 both show the live cut, but they get there differently and must keep doing so: Steps 1–4 COMMIT the derivation (`syncSheetToCut()` → `commitDerivedSheet()`), because there the cut is the sheet's subject and the proof and the dock read it back; Step 6 calls `cutDerivedSheet()` only, through `sheetSourceState()`, on every paint. Do not merge those two back together and do not widen `sheetFollowsCut()` to reach Step 6 — that writes `e`, `curve` and `cutKind` into the sheet, and a learner stepping 5 → 6 → 5 loses their construction to whatever the quiz dealt. Step 6's sheet may DRAW the cut but not NAME it: the captions that state which section it is carry `naming: true`, and `drawSheet`'s `anonymous` option withholds them until the learner has answered.

**Step 5 is a drawing workspace, not a 3-D step (ADR-100).** `body.sheet-primary` gives the sheet ~67% of the bench on the LEFT and the cone ~33% on the right, with the wizard keeping its own column — the learner is past the solid by then and is being taught how the curve is constructed. It is a second grid over the same body as the workbench split and the two are mutually exclusive; unlike the split it does NOT collapse the wizard, because Step 5's dock is where the construction is chosen and stepped. The curve itself is chosen in-step, and `methodsByTier()` splits one curve's constructions into the syllabus tier and the rest.
- **Captions vanish below 1.3 px per mm**, by design. A figure whose captions matter must be small enough to clear that gate in the COMPACT card (418 × 269): the parabola-properties sheet is drawn upright and to REACH 1.8 for exactly this reason.

## Visual style

Engineering textbook / CAD viewport — **not** architectural presentation. Flat ambient + single
directional light, **no cast shadows**, `MeshPhongMaterial` with `shininess: 0` (no PBR). The
cone turns translucent only while a section is on, so the curve and the cut face read through it.
The section face, the section curve on the cone, and the finished curve on the sheet all share
`--color-section-face` — deliberately one colour for one idea, since the sheet's curve IS the
true shape of that cut. Everything the learner needed in order to find the curve (arcs, division
ticks, joins, enclosing rectangles) is thin `--color-ink-secondary`; the marked apparatus (focus,
directrix, latus rectum, P, tangent and normal) is `--color-conic-mark`.

## Cross-cutting rules

- Route **every** geometry change through `rebuild()` — no exceptions. Sheet-only edits go through `commitConic()`, which repaints without rebuilding the scene but still fires the state-change bus.
- Read all colours from CSS custom properties via `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. Never hard-code hex in JS or component CSS. Single source of truth lives in `../DESIGN.md`.
- Keep `main.js` as the orchestrator; leaf modules do not import each other, except the pure-data catalogue `src/conicData.js`, which is sibling-importable under RULES.md §3.6a.
- Never auto-fill an answer. Every quantity the Problem Library checks is one the learner can dial, so the library stamps NOTHING on load (unlike the two sibling topics, whose statements quote dimensions their docks cannot express).

---

*Sources: the prescribed textbook Chapter 6 (Conic Sections) + Engineering Graphics Educational Tool README v1.3.0 + Simatrix Platform Simulation Developer Guide v1 + MODULE-STARTER.md Case A. This file supersedes them where they conflict.*

## Session Digest Protocol

At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)

## Keeping Root Documents Current

After completing any task, check whether the work involved:
- A non-obvious decision between two real options → add an ADR to ../DECISIONS.md
- A reversed or superseded previous decision → update the relevant ADR status
  in ../DECISIONS.md and add a new one
- A new rule that must be enforced going forward → add it to ../RULES.md
  with its source ADR cited
- A structural change to the codebase (new files, new relationships) →
  update ../ARCHITECTURE.md Section 2 or 3

Do not update these files for routine changes. Only update when the
change has architectural or decision-level significance.
