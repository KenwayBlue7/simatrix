# Simatrix — Architecture

> A map of the codebase for someone seeing it for the first time. Everything here
> was confirmed by reading the actual files in this repository and the saved
> session-memory notes; where the code could not confirm something, it says so.
> Written in plain language — no prior knowledge of this project is assumed.

---

## 1. What Simatrix Is

Simatrix is a web-based teaching platform for B.Tech (undergraduate engineering)
students. Instead of reading about an abstract concept, the student manipulates a
live, rotatable **3D simulation** and watches the result update with real numbers
attached. The platform is meant to span many subjects over time (the saved project
notes list Engineering Graphics, Mechanical, Civil, Electrical & Electronics, and
Computer Science), but everything in this repository today is **Engineering
Graphics**. Each simulation is built with **Three.js** (a 3D library that draws into
the browser) and ships as a **self-contained payload that runs inside a sandboxed
`iframe`** — a small web page embedded inside a larger Simatrix website. That larger
website (its navigation bar, login, account pages, course browser) is built by a
separate team and is explicitly **out of scope** for this codebase; the work here is
only what renders *inside the iframe*: the 3D viewport, the step-by-step control
panel, the sliders, toggles, and inline hints. Every simulation follows the same
teaching shape — a **"Guided Stepper"** that reveals one idea at a time rather than
dumping every control on screen at once — and is designed first for the anxious,
struggling first-year student. There are two subject modules: **Module 1**
(foundations of technical drawing — reference planes, line types, dimensioning, and
the projection of points and lines) and **Module 2** (orthographic projection of 3D
solids onto the horizontal and vertical planes).

---

## 2. Codebase Map

There is no shared code library and no build step. Each module/topic is a standalone
folder that runs by being served over HTTP (locally via XAMPP Apache on **port
8080** — `http://localhost:8080/Simatrix/...` — per the saved dev-server notes; port
80 is held by Windows IIS and returns 404). The browser loads Three.js from a CDN
the first time, then runs offline.

The whole platform is now managed as a **single, unified Git monorepo** rooted at
`C:\xampp\htdocs\Simatrix` — one repository, one working tree, one commit history for
every module and topic below. It was **not** always this way: each topic/module folder
used to be its own independent repository with its own inner `.git` directory and
detached history. Those inner `.git` folders were **deleted** and everything flattened
into this one repo so that a platform-wide change (a shared root doc plus several topic
folders) is a single atomic commit, and so version control, tagging, and git hooks are
centralized alongside the one root source of truth for the docs (DESIGN.md, PRODUCT.md,
PLATFORM-RULES.md, ARCHITECTURE.md, DECISIONS.md). See **DECISIONS.md → ADR-039**.

```
C:\xampp\htdocs\Simatrix\
├── Module1\                                   Engineering Drawing foundations.
│                                              Seven thin HTML pages (planes, line
│                                              types, dimensioning, quadrants,
│                                              first-angle, points, lines) sharing
│                                              ONE engine (src/engine.js) + ONE
│                                              stylesheet (src/shell.css).
│
├── Module2\                                   >>> THE MASTER CODEBASE <<<
│                                              "Orthographic Projection of Solids".
│                                              A single-page sim: index.html + main.js
│                                              orchestrator + a folder of small,
│                                              single-purpose modules in src/.
│
├── graphics_module_2_topic_1_introduction\    DEPLOYED COPY of Module2, scoped down
│                                              to "Introduction to Solids" — a 3D
│                                              anatomy gallery (apex, axis, generators,
│                                              base vertices). Heavily adapted.
│
├── graphics_module_2_topic_2_simple_positions\ DEPLOYED COPY of Module2, the "Simple
│                                              Positions" restricted clone (axis
│                                              perpendicular to one plane, no tilt).
│                                              Near-faithful copy of the master.
│
├── graphics_module_1_topic_1_foundations\     MODULE-1 SUBJECT (Engineering Graphics
│                                              Foundations — the four BIS line types)
│                                              built on MODULE 2's orchestrator pattern,
│                                              NOT Module 1's shared engine. Standalone:
│                                              its own main.js + src/ leaf modules
│                                              (bearingBlock, lineDrawer, annotations,
│                                              labelLayer, stepper) + a copied
│                                              meshAnalyzer.js. Teaches line types on an
│                                              orbitable 3D bearing block. (ADR-029.)
│
├── graphics_module_1_topic_2_spatial_framework\ MODULE-1 SUBJECT ("Spatial Framework" —
│                                              Quadrants + First-angle combined into one
│                                              topic), built on MODULE 2's orchestrator
│                                              pattern per ADR-033. BUILT & SHIPPED
│                                              (2026-07-03). Teaches the projection
│                                              framework itself with an interactive 3D
│                                              point, a 5-step guided stepper, and the
│                                              cinematic rabatment fold: platform
│                                              contract, data layer (spatialData.js),
│                                              the stepper (spatialSteps.js +
│                                              stepper.js), the 3D content — HP/VP plane
│                                              pair with the eased 1600 ms rabatment
│                                              fold (hvPlanes.js + anim.js) and the
│                                              point + projections (point.js) — the
│                                              CSS2D label layer (labelLayer.js:
│                                              HP/VP/XY + P/p/p′ callouts, I–IV numerals,
│                                              the BIS first-angle badge), the glossary
│                                              popovers (terms.js, the #term-pop
│                                              singleton), and the Point P parameter dock
│                                              (uiManager.js: HP/VP distances two-way
│                                              synced and clamped to 1–40 cm, so P can
│                                              never touch a plane or leave its chosen
│                                              quadrant — quadrant changes go only
│                                              through the explicit select) are all
│                                              wired and headless-verified.
│
├── graphics_module_1_topic_3_points\          MODULE-1 SUBJECT ("Projection of Points"),
│                                              built on MODULE 2's orchestrator pattern
│                                              per ADR-033, cut from the Topic 2 sibling's
│                                              skeleton. Phase 3 complete (2026-07-07):
│                                              platform contract + data layer
│                                              (pointData.js, all four quadrants), the
│                                              5-step legacy Points guided sequence
│                                              (pointSteps.js — copy verbatim from
│                                              Module1/src/steps.js — + stepper.js with
│                                              one [data-ctrl] control per step:
│                                              Quadrant select → HP → VP → PP sliders in
│                                              mm, ADR-018 → the fold), the 3D content
│                                              (hvPlanes.js + point.js with independent
│                                              showHP/showVP projection layers, the
│                                              1600 ms rabatment WITHOUT a camera swoop —
│                                              legacy Points kept the camera free), the
│                                              CSS2D label layer (labelLayer.js + the
│                                              P(x, y, z) signed-mm read-out), glossary
│                                              popovers (terms.js singleton), quadrant
│                                              camera-pose flights, the Top/Front/Side
│                                              ortho quick-view chips (setView engages a
│                                              second OrthographicCamera and morphs it
│                                              square-on to each plane — the projectionMorphK
│                                              dual-camera morph, RULES.md §5.18), onboarding spotlight
│                                              chips, and the textbook Problem Library
│                                              (pointProblems.js + problemLibrary.js,
│                                              ADR-015). STILL hidden in index.html: only
│                                              the connector-declutter toggle.
│
├── graphics_module_1_topic_4_understanding_orthographic_views\  MODULE-1 SUBJECT
│                                              ("Understanding Orthographic Views", formerly "Glass
│                                              Box Visualizer" — renamed 2026-07-13, ADR-048),
│                                              built on MODULE 2's orchestrator pattern per
│                                              ADR-033, cut from template_starter\ (Phase 4).
│                                              3D DOMAIN BUILD COMPLETE (2026-07-12): a new leaf
│                                              src/glassBox.js builds the first-angle corner box
│                                              — three hue-tinted glass panes (HP floor teal /
│                                              VP back amber / PP side violet at 0.09 opacity,
│                                              ADR-043) — the central solid, its three
│                                              orthographic views cast on the panes with dashed
│                                              projector rays (castProjectors), and an orbiting
│                                              Observer, all assembled as NESTED sub-groups of
│                                              shapeGroup and freed by the deep-traverse disposal
│                                              contract (ADR-042). Boots into the ADR-037 50/50
│                                              Compare split; drawCompare() + the six-view unfold
│                                              are still pending.
│
├── graphics_module_3_topic_1_sections_of_solids\  MODULE-3 SUBJECT (Sections of Solids),
│                                              built on MODULE 2's orchestrator pattern per
│                                              ADR-033. BUILT (2026-07-17), feature-complete:
│                                              the section-cut engine (src/sectionCut.js,
│                                              ADR-058) is a hand-authored analytic single-plane
│                                              triangle clipper — never CSG — that slices the
│                                              solid inside rebuild()'s DOMAIN BUILD SEAM, welds
│                                              the loop on meshAnalyzer.js's 1e-3 lattice, and
│                                              caps it as the TRUE SHAPE face; cutting-plane
│                                              state lives beside ShapeData in main.js, never
│                                              inside it (ADR-059). The drawing layer
│                                              (ADR-060/061) restores projectionDrawer.js
│                                              byte-identical from Module2 and adds a new leaf
│                                              src/sectionView.js: 45° apparent-shape hatching
│                                              per view plus the true shape drawn as an in-scene
│                                              world-scale sheet with a camera tween (no
│                                              auxiliary viewport). The textbook problem library
│                                              (ADR-062/063) enforces the KTU "true shape given"
│                                              exclusion as a hard EXCLUDED_TYPES data-layer
│                                              filter and checks conic-section cuts ±0.5° with a
│                                              live 'generator'-angle target. See root
│                                              DECISIONS.md ADR-058..063.
│
├── graphics_module_3_topic_2_development_of_surfaces\  MODULE-3 SUBJECT (Development of
│                                              Surfaces), built on MODULE 2's orchestrator
│                                              pattern per ADR-033. BUILT (2026-07-18), Phase 4
│                                              (final): unrolls prisms, pyramids, cylinders, and
│                                              cones into true-size flat patterns. A new pure
│                                              leaf src/developmentEngine.js (ADR-066) draws the
│                                              KTU Parallel-Line / Radial-Line method split on
│                                              the Compare card's Canvas2D sheet (ADR-053 fixed
│                                              intrinsic-frame scale, not a 3D-space sheet);
│                                              cutting-plane state lives beside ShapeData in
│                                              main.js the same way (ADR-067, mirroring topic-1's
│                                              ADR-059). Topic-1's sectionCut.js clipper
│                                              (ADR-058) is ported in verbatim for real 3D
│                                              truncation, restricted to Angle-to-HP + Cut-height
│                                              controls (plane always ⊥ VP — ADR-068). The
│                                              textbook problem library enforces the KTU
│                                              "through holes" exclusion as a hard
│                                              EXCLUDED_TYPES filter (ADR-065/069); shortest-path
│                                              ("string") problems draw the geodesic as a
│                                              straight chord on the 2D pattern AND wrap it onto
│                                              the 3D solid, revealed only on a matched
│                                              self-check via the non-rebuild
│                                              commitStringPath() overlay commit (ADR-070). See
│                                              root DECISIONS.md ADR-064..070.
│
└── (src_csharp\)                              Old C# Unity prototype. NOT documented
                                               here. (Not present in the working tree
                                               at the time of writing.)
```

**Master → Deploy relationship.** **Module 2 is the master.** The two
`graphics_module_2_topic_*` folders are **deployed copies** of Module 2, each adapted
for a specific teaching topic. Changes originate in Module 2 first and are then
copied/adapted into a topic folder. There is no automated sync — the copies are full
duplications of the source (confirmed: many files are byte-for-byte identical between
the master and the copies, which is only possible with manual copying). The two
copies differ from the master by very different amounts:

- **Topic 2 (Simple Positions)** is a *near-faithful* clone — it has the same 18
  `src/` files as Module 2, and 9 of them are byte-identical. The other 9 carry the
  topic restriction (no inclination, narrowed problem set).
- **Topic 1 (Introduction)** is a *much larger adaptation* — it keeps Module 2's
  geometry generators but drops the entire projection/stepper layer and adds two
  unique files (`anatomy.js`, `gallery.js`).

Module 1 is **not** a copy of Module 2; it is its own module with its own
architecture (see §4 and §8).

**Cross-family topics (Module-1 subjects on the Module-2 pattern).** `graphics_module_1_topic_1_foundations`
is a **Module-1 subject** (Engineering Graphics Foundations — the four BIS line types) but is
built on **Module 2's orchestrator + leaf-module pattern**, not Module 1's shared-`engine.js`
thin-page structure. It teaches the line types on a single orbitable 3D bearing block, so it
needs Module 2's solid machinery: a verbatim copy of `meshAnalyzer.js`, a thin `main.js`
orchestrator, and `src/` leaf modules (`bearingBlock.js`, `lineDrawer.js`, `annotations.js`,
`labelLayer.js`, `stepper.js`). It is standalone (not a deployed copy of either module — it
shares no shape generators with the Module-2 family). This began as a one-topic exception
(**ADR-029**, the first, partial supersession of ADR-011) and is now the platform-wide
direction: **ADR-033** (2026-07-02) fully supersedes ADR-011 and migrates Module 1's remaining
topics (Quadrants, First-angle, Points, Lines) onto the same orchestrator pattern. The first
of those, `graphics_module_1_topic_2_spatial_framework` ("Spatial Framework" — Quadrants +
First-angle combined), is now fully built and shipped (2026-07-03): data layer, 5-step
guided stepper, 3D geometry (planes + the quadrant-clamped point + the cinematic rabatment
fold), CSS2D label layer, glossary popovers, and parameter dock, all headless-verified.
See §8.

---

## 3. Module 2 — Component Breakdown (the master)

Module 2 is organized as an **orchestrator + leaf modules** pattern. One big file
(`main.js`) owns the scene, the state, and the master `rebuild()` pipeline; every
other file in `src/` is a "leaf" with a single job that `main.js` wires together.
The strict rule (stated in `CLAUDE.md`) is that leaf modules do **not** import each
other — only `genericSolid.js` (pure math) may be imported by sibling shape files.
Every color is read from a CSS custom property (design token), never hard-coded.

### Data layer

- **`shapeData.js`** — Defines the shape "vocabulary" (the `ShapeType` list: cube,
  prism, pyramid, cylinder, cone in their sizes) and `defaultShapeData()`, the
  canonical starting solid (a 2×2×2 cube clear of both planes). A `ShapeData` object
  is the single bag of numbers (size, distances, angles, resting plane, turn) that
  drives a rebuild. **Imports:** nothing. **Provides:** `ShapeType`,
  `defaultShapeData()`. Pure data — no DOM, no Three.js.

- **`problems.js`** — The textbook **Problem Library** data: a frozen list of
  `PROBLEMS`, the `TIERS` they group into, `FIELD_LABELS` for the self-check
  read-out, and the `ENABLED_TIERS` switch (the single flag a topic clone flips to
  hide tiers it cannot solve). **Imports:** `ShapeType` from `shapeData.js`.
  **Provides:** `PROBLEMS`, `TIERS`, `ENABLED_TIERS`, `FIELD_LABELS`,
  `enabledProblems()`, `groupByTier()`. Pure data + tiny helpers.

### Geometry / shape generators

These turn a `ShapeData` into a Three.js mesh. They all follow one contract
(`iShape.js`), build "hard-edged" geometry (so the technical outline reads crisply),
and read the fill color from a CSS token. None of them touch the DOM beyond reading
the root style; none manage state.

- **`iShape.js`** — The shape-generator *contract* plus the one shared rotation
  helper, `applyShapeTransform()`. This is where the non-obvious Euler rotation order
  (`ZXY`) and the sign corrections (ported carefully from the left-handed Unity
  prototype to right-handed Three.js) live, so no individual shape re-derives them.
  **Imports:** Three.js. **Provides:** `applyShapeTransform()` and the JSDoc `IShape`
  contract.

- **`genericSolid.js`** — Pure trigonometry for regular polygons: `circumradius`,
  `apothem`, `slantAngle`, and the vertex-angle/alignment helpers. The single file
  other shape files are allowed to import. **Imports:** nothing. **Provides:** the
  polygon math + `PolygonAlignment`. Stateless, side-effect-free.

- **`cube.js`** — Generates a cube/box. **Imports:** Three.js + `applyShapeTransform`.
  **Provides:** `createCube(data)`.

- **`cone.js`** — Generates a cone (a 24-segment approximation). **Imports:** Three.js
  + `applyShapeTransform`. **Provides:** `createCone(data)`.

- **`cylinder.js`** — Generates a cylinder (24-segment). **Imports:** Three.js +
  `applyShapeTransform`. **Provides:** `createCylinder(data)`.

- **`genericPrism.js`** — A *factory* for N-sided prisms (triangular … hexagonal).
  **Imports:** `genericSolid.js` math + `applyShapeTransform`. **Provides:**
  `createGenericPrism(sides)` → a generator function.

- **`genericPyramid.js`** — A *factory* for N-sided pyramids. Uses the "flat edge
  faces the camera" alignment so a tilt pivots about a face, not a corner. **Imports:**
  `genericSolid.js` + `applyShapeTransform`. **Provides:** `createGenericPyramid(sides)`.

### Analysis & rendering

- **`meshAnalyzer.js`** — Takes a mesh and finds its unique edges and faces by
  **welding endpoints that share a world-space position** (so a cylinder rim drawn
  three times collapses to one line). This is the foundation for clean projections.
  **Imports:** Three.js only. **Provides:** `buildEdgeMap()`, plus the `Edge`/`Face`
  classes and `WELD_TOLERANCE`. Touches Three.js geometry; no DOM, no state.

- **`projectionDrawer.js`** — Consumes the welded edge map and produces the actual
  orthographic projections — the **top view (HP, teal, solid)**, **front view (VP,
  amber, dashed)**, and **side view (PP, violet)**, with hidden edges dashed and
  faint dotted connector lines tracing each 3D corner down to its views. Uses
  fattened lines (`LineSegments2`) so engineering line weights are real pixels.
  It also emits the BIS Type-B **dimension layer split into `hpDimensionGroup` +
  `vpDimensionGroup`** (ADR-041): the orchestrator MUST parent the HP top-view dims to
  world `shapeGroup` and the VP front-view dims to `vpFoldGroup`, so the front-view
  dimensions fold flat WITH the VP during the Step-6 cinematic fold while the top-view
  dimensions stay put — a single dimension group could not survive the fold.
  **Imports:** Three.js + the line add-ons. **Provides:** `drawProjections()`,
  `classifyEdge()`, `EdgeType`. Reads CSS color tokens; returns a Three.js group.

- **`vertexLabeler.js`** — The Step-3 annotation layer: letters the base corners
  (A, B, C…), marks the apex (O), draws the central axis as a chain line, and numbers
  curved-solid rims with dashed surface generators. Labels are live HTML nodes
  (`CSS2DObject`) so they stay crisp and are screen-reader-readable. **Imports:**
  Three.js + CSS2D/line add-ons. **Provides:** `initVertexLabeler(scene, resolution)`
  → `{ group, generate, clear, dispose, setOpacity, setResolution }`.

### UI controllers (the "leaf" panel modules)

Each receives a small `simController` object from `main.js` and never reaches back
into the orchestrator directly.

- **`uiManager.js`** — The parameter dock: wires every slider and numeric input,
  keeps the slider↔number two-way sync, clamps/reverts invalid entry, enforces the
  three UI constraints (cube locks height to base; face-inclination HP/VP are
  mutually exclusive; orientation disables manual turn). **Imports:** none (pure DOM
  + the injected controller). **Provides:** `initUIManager(sim)` → `{ sync, dispose }`.

- **`stepper.js`** — The Guided Stepper controller: sequences the six steps
  (1 Add & rest → 2 Position & incline → 3 Label vertices → 4 Top & front views →
  5 Side view → 6 Flatten to 2D), gates each step behind the previous, and drives the
  step card + numbered rail. **Imports:** none (injected controller). **Provides:**
  `initStepper(sim)` → `{ sync, reset, dispose }`.

- **`problemLibrary.js`** — The textbook Problem Library: a focus-trapped modal of
  problem cards, hints revealed one at a time, and a tolerant self-check that compares
  the student's dialed-in values against a target (it never auto-fills). The check is
  driven by `main.js`'s state-change notifications. **Imports:** `problems.js` + the
  injected controller. **Provides:** `initProblemLibrary(sim)`.

- **`methodController.js`** (ADR-084 pedagogy, ADR-085 container) — "Show Method": a
  Step-6 walkthrough that replays the loaded problem's construction as 2-3 side-by-side
  Sets (simple position → one axis resolved → both), one construction beat at a time
  via Next/Back, plus Set-N focus chips. It draws into its OWN independent, focus-
  trapped, full-viewport takeover (`#method-view`/`#method-canvas` in `index.html`) —
  mirroring `problemLibrary.js`'s own overlay shell — NOT the Compare card; the sim
  loop pauses while it's open, same contract as the Problem Library. Back/Next/Exit
  float bottom-centre and the Set-N chips float top-right, overlaying the drawing
  directly; there is no title bar. **Imports:** nothing (injected controller only — the
  headless per-Set projection pipeline itself lives in `main.js`, reusing
  `meshAnalyzer.js`/`projectionDrawer.js`/`vertexLabeler.js`'s exports). **Provides:**
  `initMethodController(sim)` → `{ sync, dispose }`.

- **`terms.js`** — The inline glossary popovers (dotted-underline terms like "HP",
  "VP" that explain themselves on hover/focus/tap). **Imports:** nothing. **Provides:**
  `initTerms()`.

- **`onboarding.js`** — First-run aids: the empty-state overlay, the one-time "Drag
  to rotate" orbit hint, and the contextual spotlight chips. Guards `localStorage`
  because the sandboxed iframe may block it. **Imports:** nothing. **Provides:**
  `initOnboarding(controls)`.

### Motion utility

- **`anim.js`** — A tiny `requestAnimationFrame` tween engine with a named easing
  palette, used for the projection draw-on and the fold animation. It is **ticked by
  `main.js`'s render loop** (not its own private loop) so that pausing the sim also
  freezes animations. Honors `prefers-reduced-motion` by snapping to the end state.
  **Imports:** nothing. **Provides:** `cubicBezier`, the easings, `tween`, `tick`,
  `cancelAll`. (This file is byte-identical to Module 1's `anim.js`.)

### Orchestrator & shell

- **`main.js`** (~2,400 lines) — The conductor. It builds the Three.js scene,
  camera, renderer, lights, and reference grids; owns the application state
  (`currentShapeData` + the rotation `modes`); and owns the single **`rebuild()`
  pipeline** every change must pass through (dispose old objects → resolve effective
  angles → generate mesh → seat it on the planes → analyze edges → draw projections →
  place labels → notify subscribers). It exposes the platform's **`window.simAPI`**
  (`pause` / `resume` / `reset`) and assembles the `simController` object it injects
  into every leaf module. It imports **every** `src/` module. **Provides:** the running
  application + `window.simAPI`.

- **`index.html`** (~102 KB) — The single page. It holds the **import map** pinning
  `three@0.160.0`, a small inline boot-watchdog script (shows an on-brand fallback if
  the module fails to load, via `__simBootTimer`), the CDN-hosted `@font-face`
  declarations (ADR-086), **all of the CSS and design tokens inline in one big `<style>`
  block**, the complete wizard/viewport markup (step card, rail, sliders, toggles,
  mobile notice), and finally loads

  **Mandatory boot sequence (every topic, ADR-078):** `index.html`'s inline script
  arms `window.__simBooted = false` and a 15 s `__simBootTimer` watchdog before
  anything else runs. `main.js` must call `markBooted()` **last**, and only on a
  fully successful boot, which (1) flips `__simBooted = true` and clears the
  watchdog, (2) hides the `#sim-fallback` UI, and (3) once `document.fonts.ready`
  resolves, posts `{ type: 'sim:ready' }` to `window.parent` — the signal the host
  loading screen waits on. A new topic that skips this step leaves the host loader
  guessing; cloning `template_starter/main.js`'s `markBooted()` verbatim is the
  required starting point.

  **Completion signal (ADR-078 addendum, revised 2026-07-31):** a sibling
  `markComplete()` posts `{ type: 'sim:complete' }` to `window.parent` so the host can
  surface its "next topic / stay" overlay. Every shipped topic — Module 2, all 9 KTU
  stepper topics (including the last 2 stragglers, `graphics_module_1_topic_1_foundations`
  and `graphics_module_1_topic_4_understanding_orthographic_views`, migrated 2026-07-31),
  and all 9 Diploma Engineering Graphics topics — is now on the **button-driven,
  latchless** shape: a `#btn-finish` (taking over the footer nav's primary slot once a
  stepper's terminal step is reached) calls `markComplete()` on every click, no latch,
  so a replayed lesson re-fires the signal each time. Most topics gate `#btn-finish` on
  a domain milestone rather than mere step-arrival — `graphics_module_1_topic_1_foundations`
  on `state.dimensions` (the Step-4 dimensions reveal), the Diploma topics on a solved
  Problem Library problem (their terminal step is cheap to reach on its own). A minority
  are deliberately ungated where the terminal step's own arrival already is the payoff —
  `graphics_module_1_topic_4_understanding_orthographic_views` is one, and additionally
  **deviates on placement**: its `#btn-finish` lives in `#workbench-rail` beside the
  Fold/Unfold toggle, not the footer, because the footer (`#wizard`) is CSS-hidden for
  the whole of its Step 5 Compare split. `template_starter` migrated too (2026-07-31,
  closing out the rollout): its own copy is deliberately **ungated** (no domain state
  to gate on in a bare scaffold), matching `understanding_orthographic_views`'
  ungated precedent rather than the gated forms — see `MODULE-STARTER.md` §3.11 for
  the guidance a new topic cut from the template should follow to pick its own gate.
  There is no remaining topic on the old auto-triggered/latched shape.
  One topic, `graphics_module_2_topic_1_introduction`, omits `markComplete()` entirely —
  it is a free-browse anatomy gallery with no steps and no "finished" state to hook (a
  deliberate exclusion, not an oversight; see the ADR-078 addendum).
  `main.js` as an ES module. (Note: Module 2 keeps its CSS *inline* here, unlike
  Module 1 — see §8.)

---

## 4. Module 1 — Component Breakdown (foundations of projection)

Module 1 uses a **completely different architecture** from Module 2. Instead of one
sim, it ships **seven thin HTML pages** (the five "intro lessons" — planes, line
types, dimensioning, quadrants, first-angle — plus the two **Points** and **Lines**
simulations). Every page is a near-empty shell that links one shared stylesheet and
calls **one shared engine** with its own data. Real logic lives only in the shared
frame, so the seven pages cannot drift apart.

### The shared frame (unique to Module 1 — no Module 2 equivalent)

- **`src/engine.js`** (~108 KB) — The single shared engine. It exports
  **`initSim(config)`** plus a large toolkit of drawing helpers (`apl`, `planeGrid`,
  `planeSheet`, `fatLine`, `asg`, `alp`, `acircle`, `asgCentre`, `asp`, `acr`, `adm`,
  `alb`, `albBox`, `mix`, `roundRect`, `setRange`, `announce`, `flowNote`, `showToast`,
  `toW`, `foldStateAt`, and the `LW`/`COL` constants). It owns the renderer stack(s),
  the guided stepper, the **Compare View** (a floating second 3D/2D pane), the
  cinematic fold/unfold animation, the dual perspective/orthographic camera, the
  Problem Library seam, and `window.simAPI`. This single file does the job that
  `main.js` + the shape generators + `meshAnalyzer` + `projectionDrawer` +
  `vertexLabeler` + `stepper` + `uiManager` do collectively in Module 2. **Note:**
  Module 1 draws **points and lines**, not solids, so it has *no* shape-generator
  files and *no* mesh-edge analyzer; its labels are baked in as engine helpers
  (`alb`/`albBox`/`acr`) rather than a separate `vertexLabeler.js`.

- **`src/shell.css`** (~53 KB) — The shared stylesheet: the `:root` design tokens,
  CDN-hosted `@font-face` (ADR-086), the wizard/viewport shell, all control styling,
  and the CSS for the chrome that `chrome.js` injects. (Module 2 has no equivalent
  file — it keeps this same material inline in `index.html`.)

### Leaf modules (analogous to Module 2's)

- **`src/anim.js`** — **Byte-identical to Module 2's `anim.js`.** The shared tween +
  easing engine.

- **`src/chrome.js`** — Injects the shared viewport/step-card/Problem-Library chrome
  into each of the seven shells so the markup cannot drift. **Provides:**
  `injectChrome`, `injectCardChrome`, `injectLibraryChrome`. **Unique to Module 1**
  (Module 2's markup lives statically in its single `index.html`).

- **`src/onboarding.js`** — Orbit hint + contextual spotlights. Same *role* as Module
  2's `onboarding.js` but **not identical** (Module 1's serves seven pages).

- **`src/problemLibrary.js`** — Config-driven Problem Library + self-check. Same role
  as Module 2's, **not identical** (it serves both the Points and Lines sims via
  config).

### Pure data files (unique to Module 1 — its subject matter)

These hold no logic, only the per-lesson sequences, glossary terms, geometry data,
and problem sets that get passed into `initSim()`:

- **`src/pointData.js`** — point position math (`defaultPointData`, `resolvePosition`),
  reused by the Points, Quadrants, and First-angle lessons.
- **`src/lineData.js`** — the Lines sim's data layer.
- **`src/steps.js`** — the Points step sequence + glossary terms.
- **`src/lineSteps.js`**, **`src/planeSteps.js`**, **`src/linetypeSteps.js`**,
  **`src/dimSteps.js`**, **`src/quadrantSteps.js`**, **`src/firstangleSteps.js`** —
  the step sequence + terms for each lesson.
- **`src/planeData.js`** — Lesson 1 reference-plane data.
- **`src/partData.js`** — the shared machine-part geometry for Lessons 2 & 3.
- **`src/pointProblems.js`**, **`src/lineProblems.js`** — the Points/Lines textbook
  problem sets (lists, tiers, field labels).

### Vestigial

- **`src/uiManager.js`** — A **3-line stub** kept only so old imports do not break;
  the engine now handles UI directly. (Module 2's `uiManager.js` is a full, active
  controller — the two share a name but not a role.)

### Pages & wiring

- **`index.html`** (Lesson 1, the module entry) plus `linetypes.html`,
  `dimensioning.html`, `quadrants.html`, `firstangle.html`, `points.html`,
  `lines.html` — each links `src/shell.css` and loads its small orchestrator
  (`intro.js`, `linetypes.js`, `dimensioning.js`, `quadrants.js`, `firstangle.js`,
  `main.js`, `lines.js`). Each orchestrator imports `engine.js` + its data files,
  defines the lesson's draw functions, and calls `initSim({…})`. (`main.js` here is
  the **Points** orchestrator — confirmed it imports `engine.js` and calls
  `initSim`, ~18 KB — a very different role from Module 2's 116 KB `main.js`.)

**Files with a Module 2 equivalent:** `anim.js` (identical), `onboarding.js` and
`problemLibrary.js` (same role, diverged), and the `uiManager.js` *name* (but Module
1's is a stub). **Files unique to Module 1:** `engine.js`, `shell.css`, `chrome.js`,
all the `*Data.js` / `*Steps.js` / `*Problems.js` data files, `partData.js`, and the
seven page orchestrators. **Module 2 files with no Module 1 counterpart:** every shape
generator, `meshAnalyzer.js`, `projectionDrawer.js`, `vertexLabeler.js`, `terms.js`
(Module 1 folds terms into its step data), and the standalone `stepper.js`.

---

## 5. Data Flow — How a User Interaction Reaches the Scene

Tracing one action in **Module 2**: the student drags the **base-length slider**.

```
User drags  #rng-base  slider
        │
        ▼
uiManager.js  (its 'input' listener fires)
        │  reads the slider, divides display mm by the slider's `scale`
        │  to get engine world units
        ▼
simController.commit({ baseLength: <value> })          [defined in main.js]
        │  merges the change into the current ShapeData
        ▼
main.js  rebuild(mergedShapeData)        ← the single path every change takes
        │
        ├─ disposeActiveProjection()  +  dispose old mesh/edges   (WebGL cleanup)
        ├─ computeEffectiveAngles(data)   (resolve the rotation-priority hierarchy)
        ├─ createSolidMesh(eff)  ──────────►  cube.js / cone.js / genericPrism.js …
        │                                     (the matching shape generator builds geometry,
        │                                      applyShapeTransform() rotates it — iShape.js)
        ├─ seatOnPlanes(mesh, eff)        (re-rest the solid on HP/VP from real extents)
        ├─ buildEdgeMap(geometry, world) ─►  meshAnalyzer.js   (weld edges)
        ├─ refreshProjections() ─────────►  projectionDrawer.js drawProjections(edgeMap …)
        │                                     (top/front/side views + connectors)
        ├─ refreshLabels() ──────────────►  vertexLabeler.js  generate(mesh)
        ├─ frameToSolid() / reframeIfClipped()   (camera fit)
        └─ notifyStateChange() ──────────►  every onStateChange subscriber, incl.
                                            problemLibrary.js self-check
        │
        ▼
The render loop  (loop() in main.js, driven by requestAnimationFrame)
        │  also ticks anim.js tweens and the CSS2D label renderer
        ▼
Three.js renders the updated scene to the canvas  →  student sees the new solid + views
```

The key idea: **every change funnels through one `rebuild()` function in `main.js`.**
The control panel never touches Three.js directly; it only calls `commit()` on the
injected controller, and `rebuild()` does the rest in a fixed order. Module 1 follows
the same single-`rebuild()` discipline inside `engine.js`, where the lesson supplies
the `resolve`/`draw3D` functions and the engine runs the pipeline.

**Two renderers in the Lines topics (ADR-076):** Lines topics 5 & 6 (`graphics_module_1_topic_5_
projection_of_line_types`, `graphics_module_1_topic_6_projection_of_straight_lines`) each run TWO
independent `WebGLRenderer`s — the 3D scene's own full-canvas renderer, and a second renderer
(`sheetRenderer`, created lazily on first Compare open by `ensureSheetRenderer()`) bound to its own
`<canvas>` inside the Compare card's `.compare-card__stage`, drawing `compareSheet.js`'s 2D ortho
scene. This replaced an earlier single-canvas design where the 2D sheet was a second *scissored*
pass on the SAME renderer (`computeRegions()`/`pass()`, ADR-074's device-px→logical-px conversion) —
retired because a single canvas can't show a real grey gutter between its own two scissored halves,
which the ADR-037 floating-card workbench (DESIGN.md §5.13) needs. Each renderer now sizes to its own element
independently — the 3D renderer via `#sim-viewport`'s `ResizeObserver` (`handleResize`/
`syncMainSizing`), the sheet renderer via its own `ResizeObserver` on `.compare-card__stage`
(`resizeSheetRenderer`) — with no shared region math and no pixelRatio boundary between them.
`compareSheet.js` itself didn't need to change: its `render(renderer)` method already took the
renderer as an argument, so it was renderer-agnostic before this change too.

---

## 6. The iframe Boundary

Each Simatrix sim runs inside a sandboxed `iframe` on the host website. The contract
is mostly **a global JavaScript API object, not message passing** — with one
deliberate, narrow exception: a single outbound boot-ready signal (ADR-078).

**Confirmed from the code:**

- The sim exposes **`window.simAPI`** (set in Module 2's `main.js`, and wired by the
  engine in Module 1) with three methods: **`pause()`** (stop the render loop),
  **`resume()`** (restart it), and **`reset()`** (return to the empty start + default
  camera, through the single reset path). `CLAUDE.md` documents that the host calls
  `pause()`/`resume()` when overlays open/close, and that the in-sim Reset button must
  route through `simAPI.reset()` too — there is no second reset path.
- The sim ships a **`meta.json`** at its root (`title`, `description`, `difficulty`,
  `tags`) that the platform reads to catalog the sim. All four fields are present in
  every module/topic.
- **The sim announces its own boot completion.** `markBooted()` — called once, last,
  only on a fully successful boot — fires
  `window.parent.postMessage({ type: 'sim:ready' }, '*')` after `document.fonts.ready`
  resolves, so the host's loading screen can close exactly when the scene is
  displayable rather than guessing from the iframe's `load` event (ADR-078).
- **The sim announces its own lesson completion.** `markComplete()` posts
  `window.parent.postMessage({ type: 'sim:complete' }, '*')`, so the host can surface
  its "next topic / stay" overlay (ADR-078 addendum, revised 2026-07-31). Every shipped
  topic fires it from a `#btn-finish` click, latchless (re-fires every click) — the
  footer nav for most, `#workbench-rail` for
  `graphics_module_1_topic_4_understanding_orthographic_views` (its footer is CSS-hidden
  at the terminal step); the 9 Diploma topics additionally gate that button on a solved
  Problem Library problem. `template_starter` migrated too (2026-07-31), ungated like
  `understanding_orthographic_views` — no topic remains on the old auto-fired, latched
  shape.
  These are the sim's **only two** outbound messages; it never listens for inbound
  `message` events. One topic (`graphics_module_2_topic_1_introduction`, a free-browse
  gallery with no "finished" state) emits `sim:ready` only.
- The sim makes **no runtime network calls** beyond the initial Three.js CDN fetch,
  assumes **no same-origin access**, and uses only **relative asset paths**, so it can
  be served from any URL prefix the host chooses.

**What crosses the boundary:** control signals from host → sim (`pause`/`resume`/
`reset` calls into the iframe's `window.simAPI`), the static `meta.json` metadata the
host reads, and the two sim → host signals, `sim:ready` (boot) and `sim:complete`
(lesson finish). That is the entire surface.

**What is NOT in this codebase:** beyond the two sanctioned emits (`sim:ready`,
`sim:complete`), there is **no other `postMessage` and no `window.parent`/`window.top`
usage anywhere in the repository** (verified by search across all folders; ADR-002,
narrowed by ADR-078). So
the actual host-side code that reaches into the iframe and calls `simAPI.*`, and the
code that listens for `sim:ready`/`sim:complete` to drive the loading screen and the
next-topic overlay, lives in the separate host website, which is not part of this
repository. The exact wiring of *how* the host invokes `simAPI.*` (e.g.
`iframe.contentWindow.simAPI.pause()`) **could not be confirmed from code — needs
review** against the host project.

---

## 7. What Is Shared Across All Codebases

Confirmed identical or common by reading the files:

- **`anim.js` is byte-identical** across Module 1, Module 2, and the Simple Positions
  topic copy — the tween + easing engine is genuinely one shared file (kept in sync
  by copying).
- **`PRODUCT.md` is now a single root file** (as of 2026-06-28, ADR-023) — the platform-wide
  strategic product contract (users, brand personality, anti-references, the seven design
  principles, accessibility commitments). The former per-module copies (Module 1 and Module 2),
  which were byte-identical, were audited against the code and merged into the root `PRODUCT.md`;
  both modules' `CLAUDE.md` now reference `../PRODUCT.md`. (This mirrors the `DESIGN.md`
  centralization in ADR-022.)
- **The geometry generators are byte-identical across the Module-2 family** — `cube.js`,
  `cone.js`, `cylinder.js`, `genericPrism.js`, `genericPyramid.js`, `genericSolid.js`
  match across Module 2, Topic 1, and Topic 2 (and `vertexLabeler.js` matches between
  Module 2 and Topic 2). These are not shared with Module 1, which has no solids.
- **The build/runtime contract is identical everywhere:** no build step, no
  `package.json`; ES modules loaded via an import map pinned to **`three@0.160.0`**
  from jsDelivr; `.js` extensions required on imports; all paths relative; fonts
  served from the Supabase Storage CDN (Atkinson Hyperlegible + IBM Plex Mono),
  never a Google-Fonts CDN (ADR-086, reverses the prior bundled-local-woff2 rule).
- **Platform dependencies (pinned CDN ES modules).** The only runtime library every
  sim loads is **`three@0.160.0`** (plus `three/addons/`). One topic adds a **second**
  pinned dependency in the *same* import map: **`three-mesh-bvh`** — used by
  `graphics_module_1_topic_1_foundations` to accelerate its per-edge line-of-sight
  occlusion raycaster (a bounding-volume hierarchy turns each ray from a linear
  triangle scan into ~O(log n), which is what lets the hidden-line pass re-run every
  frame on the non-convex Bearing Block instead of behind a debounce). It is added
  through the import map specifically so it stays inside the no-build, pinned-CDN
  contract above — **no npm, no bundler, no `@latest`** (ADR-030; ADR-001). The
  master and the Module-2 topic clones do **not** load it — their projection layer
  uses the convex `worldNormal` shortcut and needs no BVH.
- **The platform contract is identical:** every module exposes `window.simAPI`
  (`pause`/`resume`/`reset`), ships a four-field `meta.json`, is self-starting on
  page load, and shows a dismissible "best on desktop" notice below 768px.
- **The design-token vocabulary is shared:** the same `--color-*`, `--space-*`,
  `--radius-*` token names and the same warm "drafting paper" palette (technical-blue
  accent, HP teal, VP amber) appear in both modules. As of 2026-06-27 the one
  platform-wide visual contract is the **single root `DESIGN.md`** (ADR-022): the former
  per-module `DESIGN.shared.md` copies — which had drifted ~2 lines — were audited against
  the code, merged into it, and deleted. Both modules' `CLAUDE.md` now reference
  `../DESIGN.md`; Module 1 keeps a local `DESIGN.md` only for its premium-interaction
  *implementation* spec.

---

## 8. What Is Intentionally Different Between Modules

**Different because of different subject matter (clearly intentional):**

- **Module 1 teaches 2D-from-3D foundations** (reference planes, line types,
  dimensioning, quadrants, first-angle, and the projection of *points* and *lines*).
  **Module 2 teaches projection of 3D *solids*.** This is why Module 1's seven
  shared-engine lessons have no shape generators and no edge analyzer, while Module 2
  has eight geometry files plus `meshAnalyzer.js`/`projectionDrawer.js`. (The exception
  is the `graphics_module_1_topic_1_foundations` topic — a Module-1 subject that *does*
  carry a shape generator + edge analyzer because it teaches on a 3D solid; see the
  architecture note below and ADR-029.)
- **Topic 2 (Simple Positions)** intentionally removes the inclination feature:
  confirmed in its `shapeData.js`, which deletes the `angleHP`/`angleVP` fields and
  keeps only the `restingPlane` choice (axis vertical or horizontal), and in its
  `problems.js`, which narrows `ENABLED_TIERS`. 9 of its 18 `src/` files diverge from
  the master for exactly this reason; the other 9 are byte-identical.
- **Topic 1 (Introduction)** intentionally narrows to a 3D *anatomy gallery* — it
  drops the whole projection/stepper/problem layer and adds `anatomy.js` + `gallery.js`.
  Its own `CLAUDE.md` states this scope-down explicitly.

**Different in architecture (intentional, but a divergence a contributor must learn):**

- **Module 1 uses one shared `engine.js` + `shell.css` for seven thin pages;
  Module 2 uses an orchestrator `main.js` + many small `src/` modules for one page.**
  These are two genuinely different ways of organizing the same kind of sim. The saved
  notes indicate Module 1 was harmonized to Module 2's design language *after* Module 2
  existed, and Module 1's shared-engine structure is the newer refactor.
- **Module 1 keeps CSS in a separate `src/shell.css`; Module 2 keeps the same kind of
  CSS inline in `index.html`.** Same styling problem, two different solutions.
- **The Foundations topic mixes the two families.** `graphics_module_1_topic_1_foundations`
  is a Module-1 subject (the BIS line types) built on **Module 2's** orchestrator pattern —
  its own thin `main.js` + `src/` leaf modules + a copied `meshAnalyzer.js` + inline CSS — not
  Module 1's shared `engine.js`/`shell.css`. It teaches the line types on an orbitable 3D
  bearing block, so it needs Module 2's solid + edge machinery (and adds net-new per-edge
  line-of-sight hidden-line detection for the non-convex part). So the "Module 1 has no edge
  analyzer" point above holds for Module 1's seven thin pages but **not** for this topic.
  This is deliberate (**ADR-029** superseded **ADR-011** for this topic only; **ADR-033** has
  since made the orchestrator pattern the platform-wide commitment for all remaining Module 1
  topics; the first of them, `graphics_module_1_topic_2_spatial_framework`, shipped fully
  built on 2026-07-03); a contributor must not "fix" it back onto `engine.js`.

**Confirmed-but-unclear-if-intentional (flag for review):**

- **`DESIGN.shared.md` drift — RESOLVED (2026-06-27, ADR-022).** The two copies had drifted
  ~2 lines (the Host-White application note; the Module-1 version legitimately covered its
  in-development Compare card). A code audit confirmed the delta was real module-specific
  content, not random drift. The copies were merged into the single root `DESIGN.md` and
  deleted, so the drift surface is gone.
- **`onboarding.js` and `problemLibrary.js` differ between Module 1 and Module 2.**
  Some divergence is justified (Module 1 serves seven pages / two sims), but whether
  the *entire* delta is intentional vs. partly drift is **unclear — needs review**.

---

## 9. Known Structural Issues

Reported directly, as a new contributor would hit them:

1. **The folder names hide the master.** "Module 2" is the master and single source
   of truth, but nothing in the names `graphics_module_2_topic_1_introduction` /
   `graphics_module_2_topic_2_simple_positions` says "I am a copy of `Module2`."
   Worse, Topic 1's own `CLAUDE.md` calls the master's content "**Topic 2 —
   Orthographic Projection of Solids**," while the folder literally named `topic_2` is
   *Simple Positions*. The words "Module 2", "Topic 2", and the master overlap
   confusingly. A newcomer cannot infer the master→deploy relationship from the
   directory listing alone.

2. **Deploys are full copy-paste duplicates with no sync mechanism.** Because there is
   no build step and no shared library (a deliberate constraint), each topic is a
   complete duplication of Module 2. Several files are byte-identical today only
   because someone copied them by hand. Any fix to a shared file (e.g. a geometry
   generator) must be manually re-copied into every topic, and the copies *will* drift.
   The first visible symptom — the `DESIGN.shared.md` 2-line drift between Module 1 and
   Module 2 — was **resolved on 2026-06-27** by centralizing the design system into one root
   `DESIGN.md` (ADR-022); the topic-clone duplication of *other* shared files remains the
   open issue here.

3. **A referenced standards file was missing — RESOLVED.** Both modules' `CLAUDE.md` once
   pointed to a non-existent `../SIMATRIX-UI-STANDARDS.md`. The Simatrix root now holds the
   shared docs (`ARCHITECTURE.md`, `DECISIONS.md`, `RULES.md`, `DESIGN.md`, `CHANGELOG.md`),
   and that reference was repointed to `../RULES.md`. No longer dangling.

4. **The platform design docs are duplicated per module — PARTIALLY RESOLVED.** As of
   2026-06-27 the design system is centralized: `DESIGN.shared.md` is gone and the single root
   `DESIGN.md` is canonical (ADR-022); as of 2026-06-28 `PRODUCT.md` is likewise centralized to a
   single root file (ADR-023), its former byte-identical per-module copies merged and deleted.
   Still duplicated per module: a module-local `DESIGN.md` (Module 1's premium-interaction appendix
   is intentional; `Module2/DESIGN.md` is now superseded and a removal candidate). The topic deploy
   copies still carry their own design + product docs — future topics must consume the root
   `DESIGN.md` / `PRODUCT.md`, not reintroduce per-module duplicates.

5. **Two different architectures for the same kind of product.** Module 1
   (shared-engine + thin pages) and Module 2 (orchestrator + leaf modules) solve the
   same problem in structurally different ways, including where the CSS lives
   (separate `shell.css` vs. inline in `index.html`) and how labels are produced
   (engine helpers vs. a standalone `vertexLabeler.js`). A contributor fluent in one
   module must re-learn the layout to work in the other. This may be a deliberate
   evolution (Module 1 is the newer pattern), but it is not reconciled.

6. **Very large hub files.** Module 2's `main.js` is ~116 KB (~2,400 lines) and its
   `index.html` is ~102 KB (most of it an inline CSS block); Module 1's `engine.js` is
   ~108 KB. These are the files a contributor most needs to understand and the hardest
   to navigate.

7. **A `uiManager.js` name means two different things.** In Module 2 it is a full,
   active parameter-dock controller; in Module 1 it is a 3-line vestigial stub kept
   only for import compatibility. Same filename, opposite significance.

8. **Comments throughout still reference the deleted `src_csharp/` prototype** (e.g.
   "Ported from src_csharp/…"). These are useful history but point at a folder that is
   not in the tree, which can mislead someone trying to open the referenced source.
