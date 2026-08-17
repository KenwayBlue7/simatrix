# Isometric Drawing — Technical Implementation Overview

**Scope:** `graphics_module_4_topic_1_introduction_to_isometric_drawing`, `graphics_module_4_topic_2_isometric_construction`, `graphics_module_4_topic_3_isometric_projection_problem_library`

**Status:** Investigation / documentation only. No source code was modified in producing this document.

**Method:** Every statement below was derived by reading the actual files listed in §11. Where a claim comes from a comment or a topic `CLAUDE.md` rather than from executable code, it is marked. Three confidence levels are used throughout:

| Marker | Meaning |
|---|---|
| **[CONFIRMED]** | Read directly in executable source; behaviour follows from the code as written. |
| **[INFERRED]** | Follows logically from the code but was not executed/observed at runtime. |
| **[POTENTIAL ISSUE]** | A defect, dead path, or inconsistency visible in the code. Not fixed, only recorded. |

---

## 1. Executive Summary

The Isometric Drawing feature is **three independent, self-contained Three.js single-page simulations**. They are not one application with three modes: each folder is a complete deployable payload with its own `index.html`, its own `main.js`, its own `src/` leaves, its own bundled fonts, and its own copy of every shared utility. There is no shared runtime library, no build step, and no npm dependency — Three.js is pinned at `0.160.0` and loaded from a CDN via an `<script type="importmap">` block in each `index.html`. **[CONFIRMED]**

The three topics form a teaching progression:

| Topic | Folder | Question it answers | Subject matter |
|---|---|---|---|
| 1 | `..._topic_1_introduction_to_isometric_drawing` | *"What IS an isometric drawing?"* | Why a pictorial exists alongside orthographic projection; the isometric position; that two forms exist. Teaches on two hard-coded solids (square pyramid, cube). |
| 2 | `..._topic_2_isometric_construction` | *"How is one CONSTRUCTED?"* | The four-phase construction method (axes → box → shape → finish) over ten user-selectable solids with user-set dimensions. |
| 3 | `..._topic_3_isometric_projection_problem_library` | *"How is that construction applied to THIS exam question?"* | Topic 2's identical six-step workflow, pointed at 14 textbook problems, plus answer verification. Adds combinations of solids (stacking). |

**The architectural claim that unifies Topics 2 and 3** is *data-driven interpretation*:

- Topic 2: a **solid is data** (`src/shapeData.js`); every consumer is a generic interpreter owning exactly one `switch` over a bounded **primitive-kind** vocabulary, never over solid names.
- Topic 3: the same rule lifted one level — a **problem is data** (`src/problemLibrary.js`), assembled from a **part** vocabulary (`src/solidCatalog.js`). Adding a problem is appending one object.

**[CONFIRMED]** I found no `if (solid === …)` or `if (problem.id === …)` branch anywhere in either topic; the only switches are over `spec.kind` / `p.k` / `partSpec.part`.

Topic 1 is architecturally the odd one out: it has no data model, builds its scene **once** at boot, and drives everything by toggling visibility and opacity. Topics 2 and 3 rebuild geometry through a single disposal-safe `rebuild()` on every parameter change.

Topics 2 and 3 share **seven byte-identical leaf files** (verified by MD5, §11.4). Topic 3's `CLAUDE.md` states outright that it is *"Topic 2 plus ONE capability: a Problem Library"* and that divergence from Topic 2 is a defect unless an ADR says otherwise.

---

## 2. Folder Structure

```
SImatrix/
├── ARCHITECTURE.md              root platform docs (see §13 — Module 4 is NOT registered here)
├── DECISIONS.md                 root ADR log (ADR-001 … ADR-218)
├── RULES.md                     root enforcement rules
├── DESIGN.md                    the single platform design system
├── PRODUCT.md                   audience, features, accessibility commitments
├── PLATFORM-RULES.md
├── CLAUDE.module-template.md    template a topic's CLAUDE.md is cut from
├── MODULE-STARTER.md
├── template_starter/            the scaffold new topics are cut from
├── Module2/                     THE MASTER CODEBASE (source of anim.js etc.)
│
├── graphics_module_4_topic_1_introduction_to_isometric_drawing/
│   ├── index.html               2564 lines — markup + the ENTIRE stylesheet + design tokens
│   ├── main.js                  1505 lines — orchestrator; owns scene/camera/labels/flow
│   ├── meta.json                title · description · difficulty · tags (platform contract)
│   ├── CLAUDE.md                topic brief + architecture + scope boundaries
│   ├── CHANGELOG.md
│   ├── .gitignore
│   ├── assets/fonts/            3 local woff2 subsets (no runtime Google Fonts fetch)
│   └── src/
│       ├── anim.js       209    tween + cubic-bezier easing engine (shared copy)
│       ├── isoSteps.js    56    DATA: the six-step rail/card copy
│       ├── onboarding.js 192    "Drag to rotate" orbit hint + contextual cue chips
│       ├── solidRig.js   329    builds the pyramid, the cube, a 2nd cube, axes, 12 guide segments
│       ├── stepper.js    119    guided-stepper controller (rail + card + Back/Next)
│       └── terms.js       83    markup-driven inline term popovers
│
├── graphics_module_4_topic_2_isometric_construction/          ← ASSIGNED WORK
│   ├── index.html              1811 lines — markup + full stylesheet + :root token block
│   ├── main.js                 1696 lines — orchestrator
│   ├── meta.json
│   ├── CLAUDE.md               topic brief; the authoritative architecture statement
│   ├── CHANGELOG.md
│   ├── assets/fonts/
│   └── src/
│       ├── anim.js              209   tween engine (byte-identical to T1/T3, modulo CRLF vs Module2)
│       ├── cameraRig.js         176   named DIRECTIONS + eased flights + retarget
│       ├── constructionEngine.js 347  axes + bounding box + per-solid stages + face highlights
│       ├── constructionSteps.js 136   DATA: STEPS (6) + PHASES (4) + getPhase()
│       ├── dimensionLayer.js    193   BIS Type-B dimensions (extension/dimension lines, arrowheads)
│       ├── isoAngles.js         161   SVG screen-space overlay: the two 30° arcs
│       ├── labelLayer.js        189   CSS2D label factory + the ONE placement policy (PLACEMENT)
│       ├── onboarding.js        192
│       ├── orthographicDrawer.js 315  first-angle SVG sheet (front/top/side + projectors + XY)
│       ├── shapeData.js         623   THE DATA MODEL — ten solids, toWorld(), ISOMETRIC_SCALE
│       ├── shapeFactory.js      318   body spec → mesh + ink edges + silhouettes; topHalfExtent()
│       ├── stepper.js           128   guided-stepper controller
│       ├── summaryAnimator.js   110   abortable token-guarded sequencer + SUMMARY_TIMING/CHAIN
│       ├── terms.js              83
│       ├── tokens.js             88   CSS custom property → THREE.Color + WEIGHT + ROLE_COLOR
│       ├── transferLayer.js     143   SVG screen-space overlay: the flying dimension token
│       └── uiManager.js         245   the parameter dock (solid picker + dimension fields)
│
└── graphics_module_4_topic_3_isometric_projection_problem_library/   ← ASSIGNED WORK
    ├── index.html              1611 lines — markup + full stylesheet
    ├── main.js                  873 lines — conductor (scene ownership moved to viewport.js)
    ├── meta.json
    ├── CLAUDE.md
    ├── CHANGELOG.md
    ├── assets/fonts/
    └── src/
        ├── anim.js              209   ← byte-identical to Topic 2's
        ├── answerValidator.js   239   PURE: composed model + answerData → findings
        ├── cameraRig.js         176   ← byte-identical to Topic 2's
        ├── constructionEngine.js 388  axes + ONE BOX PER PART + stages bottom-up
        ├── dimensionLayer.js    193   ← byte-identical to Topic 2's
        ├── dimensionResolver.js 103   PURE: specified · derived · optional · unknown → one flat set
        ├── geometryFactory.js   339   composed model → per-part meshes/edges/silhouettes
        ├── helpers.js            75   STATELESS UTIL: MM_PER_UNIT, ISOMETRIC_SCALE, polygon maths
        ├── labelLayer.js        189   ← byte-identical to Topic 2's
        ├── onboarding.js        192   ← byte-identical to Topic 2's
        ├── orthographicDrawer.js 193  simplified static SVG sheet (no draw-on, no plane tags)
        ├── practiceSolids.js    172   DATA: the ten free-practice solids, in problem schema
        ├── problemLibrary.js    597   DATA: 14 textbook problems + 4 CATEGORIES
        ├── problemQuery.js       64   the ONLY junction between problems and practice solids
        ├── projectionResolver.js 73   the 0.816 law + the sphere exemption
        ├── solidCatalog.js      354   STATELESS UTIL: the six PART_KINDS vocabulary
        ├── solidComposer.js     306   parts + placement → composed model; auditComposition()
        ├── state.js              84   the one state object + the change bus
        ├── stepDefinitions.js   151   DATA: Topic 2's six STEPS verbatim + four PHASES
        ├── stepper.js           164   generic stepper; builds the rail FROM the step list
        ├── terms.js              83   ← byte-identical to Topic 2's
        ├── tokens.js             88   ← byte-identical to Topic 2's
        ├── uiManager.js         581   problem browser + solid picker + problem card + dock + panel
        └── viewport.js          162   renderer, scene, camera, OrbitControls, CSS2D, frame loop
```

**Notable structural facts** **[CONFIRMED]**:

- There is **no `src/` file shared across topic folders by reference**. Sharing is by *copy*. `../ARCHITECTURE.md` and the topic `CLAUDE.md`s describe this as the platform's deliberate "no shared code library" model.
- There is **no CSS file anywhere**. Every stylesheet — including the `:root` design-token block — is inline in each topic's `index.html`. `src/tokens.js` reads those tokens back at runtime through `getComputedStyle(document.documentElement)`.
- `meta.json` carries exactly four fields (`title`, `description`, `difficulty`, `tags`) and `<title>` in `index.html` matches `meta.json.title` in all three topics — the platform contract (root `RULES.md` §1.12).
- Topic 3 has **no `isoAngles.js` and no `transferLayer.js`**. See §14 and §19.

---

## 3. Topic Architecture

### 3.1 Topic 1 — Introduction to Isometric Drawing

**Purpose (from `CLAUDE.md`):** builds the mental model only. Explicitly out of scope: the isometric scale, the 0.816 factor, construction procedure, circle construction, dimension transfer, true vs. foreshortened lengths, problem solving, and the *difference* between Isometric Projection and Isometric View. It **names** the two forms; it never compares them.

**Architecture:** orchestrator + leaf modules, standalone. Critically different from Topics 2/3:

- **The scene is built ONCE at boot.** `rebuild()` exists to satisfy the platform disposal contract but only ever disposes an empty `shapeGroup`. Steps toggle `visible` and material `opacity`. **[CONFIRMED — `main.js:188 rebuild()`, and the `CLAUDE.md` says so explicitly]**
- **Two teaching solids, not a data model.** `src/solidRig.js` builds a square pyramid (a 4-sided `ConeGeometry` spun 45°) for Steps 1–3 and a cube for Steps 4–6, plus a second cube for the Step-5 split, the three axes from the cube's near corner, and the Step-6 construction as **twelve independently drawable guide segments** plus three face outlines.
- **The pyramid/cube handover is deliberate pedagogy**, not a limitation: the pyramid's three orthographic views are unmistakably different (triangle / square / triangle), which is what makes Steps 1–3's question ("why do multiple views exist?") land; the cube's principal edges lie *along* the isometric axes, which is what makes Steps 4–6's question ("what is the isometric position?") land. `setActiveSolid` cross-fades pyramid → cube on entering Step 4 *from Step 3* only (620 ms each, 300 ms overlap).
- **Camera poses are POSITIONS, not directions** (`POSES` in `main.js:58`) — the opposite of Topic 2/3's `cameraRig`, which stores directions and derives distance from content radius.
- **`POSES.isometricFlat` is the topic's most interesting technical decision.** Under the working 45° lens the receding edges project at ~36.6°, so a "30°" annotation would be measurably false. The pose therefore dollies the camera back by `FLATTEN_FACTOR = 14` and narrows the FOV to `FLAT_FOV = 2·atan(tan(45°/2)/14)` so on-screen size is unchanged but the projection becomes effectively parallel. `flyCamera` tweens `fov` and applies each pose's `maxD` orbit-distance clamp. **[CONFIRMED — `main.js:48-87`]**
- **Step 6 (`goFlowStage`)** runs views → construction → finished drawing; a stage switch aborts any sequence in flight via a `flowToken` counter. The `#vp-transfer` screen-space layer carries each measurement out of a view on the SVG sheet onto an isometric axis, bridged by `worldToScreen()` + `sheetViewCenter()`. Width and depth come from the top view, height from the front view.

### 3.2 Topic 2 — Isometric Construction

**Purpose:** teaches the construction method as a **process**. Ten solids, learner-set dimensions, three orthographic views, then the same four phases for every solid — only Phase C's contents change. The transferable idea is the ORDER.

**Explicitly out of scope (from `CLAUDE.md`):** hidden-line conventions, sectioning, auxiliary views, inclination/intersection/rotation problems, *teaching* dimensioning rules, measurement exercises, textbook problem solving. It has **no problem library, no answer checking, no scoring**.

**Architecture:** one orchestrator (`main.js`) + fifteen leaves that never import each other. `shapeData.js` and `tokens.js` are the two documented stateless shared utils that several leaves may import.

The six steps (`src/constructionSteps.js` `STEPS`):

| n | title | rail label (in markup) |
|---|---|---|
| 1 | Choose a Solid | Choose Solid |
| 2 | Set the Dimensions | Set Dimensions |
| 3 | Read the Orthographic Views | Orthographic Views |
| 4 | Construct the Isometric Drawing | Construct |
| 5 | Projection or View? | Projection vs View |
| 6 | The Whole Process | The Whole Process |

Step 4's four phases (`PHASES`): **A** Draw the axes · **B** Build the box · **C** Construct the shape · **D** Finish the drawing.

### 3.3 Topic 3 — Isometric Projection Problem Library

**Purpose:** Topic 2's workflow, run on real examination problems' numbers, with the result checked against the question.

**The one architectural claim (from `CLAUDE.md`):** *Problems are DATA; the engine interprets them.* Its corollary: **a free-practice solid IS a problem** — Step 1's ten solids live in `src/practiceSolids.js` in the same schema, minus the three fields only a question has (`question`, `answerData`, `hints`). One resolver (`problemQuery.getSubject`), one load path (`simController.loadProblem`), no `kind` field, no branch. Where behaviour must differ, the test is on **data shape** — *does this subject carry a printed statement?* (`isTextbookProblem(subject)` → `Boolean(subject?.question)`) — never on which subject it is. **[CONFIRMED]**

Its steps are `stepDefinitions.js` `STEPS` — Topic 2's six, verbatim, but keyed by stable **string id** (`choose-solid` · `dimensions` · `views` · `construct` · `form` · `whole-process`) rather than by number, so `main.js` switches on the id. The four `PHASES` are Topic 2's four with slightly shortened labels (`Axes` · `Box` · `Shape` · `Finish` vs Topic 2's `Draw the axes` · `Build the box` · `Construct the shape` · `Finish the drawing`) and re-worded notes that mention combinations. **[CONFIRMED — this is a minor copy divergence from the "verbatim" claim; see §14]**

**The one sanctioned behavioural divergence:** Step 6. Topic 2 replays the whole construction chain; Topic 3 runs `runVerification()` and paints findings.

### 3.4 How the three topics interact

**They do not.** There is no cross-import, no shared state, no navigation between them, no common parent module. **[CONFIRMED — the import trace in §11.2 shows every import is either `three`, `three/addons/...`, or a `./src/*.js` sibling within the same topic folder.]**

The interaction is **editorial and by-copy**:

1. **Conceptual sequencing.** Topic 1 names the two forms; Topic 2 explains the scale difference (Step 5); Topic 3 makes the choice checkable. Each `CLAUDE.md` states what it defers to the next.
2. **Code lineage.** Topic 1 was cut from `template_starter/`. Topic 2 followed Topic 1's shell and interaction language. Topic 3 was cut from Topic 2 — seven leaves are byte-identical copies. Separately, `graphics_module_2_topic_0_introduction_to_orthographic_projection` was itself cut *from* Topic 2 (root `CHANGELOG.md`:161), so Topic 2 is an upstream source for a Module-2 topic.
3. **UI lineage.** Topic 1's `.flow-strip` is reused by Topic 2 for the phase transport and the summary chain, and by Topic 3 for the phase transport.
4. **Host integration.** All three expose `window.simAPI { pause, resume, reset }` and are embedded by a host website that is explicitly out of scope for these folders.

---

## 4. Application Entry Flow

Traced for **Topic 2** (Topic 3's differences are called out at each step).

### Step-by-step

**1. Page load — `index.html`**
- `<head>` declares `<meta name="color-scheme" content="light only">`, the `<title>`, and the **import map** pinning `three` → `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` and `three/addons/` → the matching `examples/jsm/`.
- A **classic (non-module) boot watchdog** runs first. It sets `window.__simBooted = false`, defines `window.__showSimFallback(variant)`, hooks `window.addEventListener('error', …)`, and arms `window.__simBootTimer = setTimeout(…, 15000)`. If the CDN module never evaluates, the learner reads a calm explanation instead of a blank iframe. **[CONFIRMED]**
- A large inline `<style>` block defines `@font-face` for three local woff2 subsets and then the `:root` design-token block (§18) followed by the whole stylesheet.
- `<body>` is `display:flex; flex-direction:row` and contains, in DOM order: `#sim-fallback`, `#sim-context-lost`, `#mobile-notice`, `#wizard` (rail + `#step-card` + six `.step-panel[data-step]` + `.card__nav`), `#sim-viewport` (with CSS `order: 1` so the viewport renders LEFT and the wizard right), and `#sim-status` (the `aria-live` region).
- Inside `#sim-viewport`: `#wizard-toggle`, `#ortho-sheet`, `#vp-angles` (SVG), `#vp-transfer` (SVG), `#phase-strip`, `#chain-strip`, `#vp-orbit-hint`, `#vp-spotlight`, `#vp-flow-note`.

**2. JavaScript entry point — `main.js`**
- Loaded as `<script type="module">`. The file's last statement is a bare `init()` call at line 1696 — **self-starting**, no `DOMContentLoaded` wait (module scripts are deferred by default).

**3. Initialization — `init()` (`main.js:1636`)**
```
init()
 ├── viewport = document.getElementById('sim-viewport')
 ├── try { buildScene(container) }  ── on throw: window.__showSimFallback('webgl'); return
 └── try {
      labels     = initLabelLayer(scene, { prefersReducedMotion })
      cameraRig  = initCameraRig({ camera, controls, prefersReducedMotion })
      sequencer  = createSequencer({ prefersReducedMotion })
      orthoSheet = initOrthoSheet(document.getElementById('ortho-sheet'))
      orthoSheet.onSelect(selectView)
      isoAngles  = initIsoAngles(document.getElementById('vp-angles'))
      transfers  = initTransferLayer(document.getElementById('vp-transfer'), {...})
      isoAngles.resize(w, h);  transfers.resize(w, h)
      ui         = initUIManager(simController)
      rebuild()                                   ← first geometry build
      ui.render(state)                            ← builds the dock from shapeData
      cameraRig.snapTo(cameraRig.pose('threeQuarter'))
      setupMobileNotice(); setupWizardToggle(); setupResetControl(); setupStepControls()
      initTerms()
      onboarding = initOnboarding(controls); onboarding.setSolidPresent(true)
      stepper    = initStepper(simController)     ← calls goToStep(1) → sim.enterStep(1)
      new ResizeObserver(() => handleResize(container)).observe(container)
      startLoop()
     } catch { window.__showSimFallback(); return }
 ├── document.fonts.ready.then(() => labelRenderer.render(scene, camera))   // §3.26
 └── markBooted()   ← sets window.__simBooted = true, clears the watchdog, hides #sim-fallback
```

**4. Scene setup — `buildScene(container)` (`main.js:1343`)**
- `scene = new THREE.Scene()`; `scene.background = cssColor('--color-paper')` — read from CSS, never a hex literal.
- Lights: `AmbientLight(0xffffff, 0.85)` + one `DirectionalLight(0xffffff, 0.55)` at `(5, 8, 6)`. `renderer.shadowMap.enabled = false`. This is the platform "Flat-Ink / flat CAD" look. **[CONFIRMED]**
- `shapeGroup = new THREE.Group(); scene.add(shapeGroup)` — **the one disposal target**.

**5. Camera**
- `camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 200)`, initial position `(6, 6, 6)`.
- Perspective, not orthographic — which is *why* `isoAngles` has to aim the camera at the construction origin to keep the 30° claim honest (§5.7).
- Topic 3: identical values in `viewport.js:42-43`.

**6. Renderer**
- `new THREE.WebGLRenderer({ antialias: true })`, `setPixelRatio(Math.min(devicePixelRatio, 2))`, `setSize(w, h, false)` (the `false` keeps CSS sizing to the container).
- Two context listeners: `webglcontextlost` → `preventDefault()` + `stopLoop()` + notice; `webglcontextrestored` → `rebuild()` + `enterStep(current)` + `startLoop()`.
- A second DOM layer is added: `labelRenderer = new CSS2DRenderer()`, absolutely positioned at `0,0` with `pointer-events: none` so a drag-to-orbit passes through it. **This is DOM only — not a second WebGL context.**

**7. Controls**
- `controls = new OrbitControls(camera, renderer.domElement)`.
- `enableDamping = !prefersReducedMotion`, `dampingFactor = 0.08`, `enablePan = false`, `minDistance = 1.5`, `maxDistance = 60`.
- Topic 3 (`viewport.js:66-71`): `enableDamping = true` unconditionally, `minDistance = 2`. **[CONFIRMED divergence]**

**8. UI**
- `initUIManager(simController)` (`src/uiManager.js`) fills `#solid-select` from `SOLIDS` and builds `#dim-fields` from the selected solid's `dims` array. Every control's handler calls back into `simController` — **no control touches the scene**.
- `initStepper(simController)` (`src/stepper.js`) reads `STEPS`, wires the rail buttons and Back/Next, and immediately calls `goToStep(1, { announce: false })`, which calls `sim.enterStep(1)`.

**9. Construction / problem selection**
- **Topic 2:** `#solid-select` `change` → `simController.setSolid(id)` → replaces `state.solidId`, resets `state.dims` to `defaultDims(solid)`, clears `state.unspecified`, `rebuild()`, `ui.render(state)`, `enterStep(currentStep)`.
- **Topic 3:** two entry points, one path. `#open-problem-library` (or `#btn-next-problem` at the terminal step) → `uiManager.openBrowser()` → renders `groupByCategory(allProblems())` → a card click → `sim.loadProblem(id)`. `#solid-select` → the same `sim.loadProblem(id)`. `loadProblem` sets `state.problemId`, `state.dims = defaultDims(p)`, seeds `state.unspecified` from `withheldDims(p)`, sets `state.projectionMode` from `initialProjectionMode(p).mode`, sets `state.orientationId = p.orientations?.[0] ?? null`, clears `state.verification` and `progress`, then `rebuild()` → `ui.render(state)` → `stepper.reload()` (which returns to Step 1).

**10. Rendering — `rebuild()` (`main.js:414`)**

Fixed order, and this order is load-bearing:
```
disposeScene()                                   // dimensions → construction → shape → labels → shapeGroup
solid  = getSolid(state.solidId)
dims   = currentDims()                           // resolveDims(solid, state.dims, state.unspecified)
shape        = buildShape(solid.body(dims), res);      shapeGroup.add(shape.group)
construction = buildConstruction({solid, dims, res});  shapeGroup.add(construction.group)
buildDimensionAnnotations(solid)                 // dimension linework + CSS2D values + title + view names
orthoSheet.draw(solid, dims)                     // the SVG sheet
cameraRig.focusOn(contentFocus().center, .radius)
notifyStateChange()
```
Topic 3's `rebuild()` (`main.js:242`) inserts the composition layer first:
```
disposeScene()
model = compose(problem(), currentDims(), { orientationId: state.orientationId })
plan  = resolveProjection(model, state.projectionMode)
faults = auditComposition(model);  if (faults.length) console.warn(...)
if (model.parts.length) {
  shape        = buildComposedShape(model, plan, res)
  construction = buildConstruction({ model, plan, resolution: res })
  buildDimensionAnnotations()
  orthoSheet.draw(model.views, dims)
  cameraRig.focusOn(...)
}
bus.notify(state)
```

**11. Step progression**
- `stepper.goToStep(n)` → sets `currentStep`, adds to `visited`, writes `#step-title` / `#step-lead`, shows the matching `.step-panel`, resets `.card__scroll` scrollTop, then calls `sim.enterStep(n)`, then `renderRail()` + `renderNav()`.
- `enterStep(n)` (`main.js:1246`) always calls `resetSceneLayers()` first, re-frames the camera, then runs the per-step `switch`. It is **idempotent** — rail jumps, Back/Next and context restore all route here.
- A **dimension edit** does *not* re-enter the step. `simController.setDim` calls `rebuild()` then `applyStepState()` (`main.js:1309`), which lands the same visual state instantly, leaving the camera exactly where the learner put it. Re-entering would restart the camera flight on every slider tick and strobe the viewport.

---

## 5. Topic 2 — Isometric Construction (detailed)

### 5.1 Construction workflow

Six guided steps; Step 4 contains the four construction phases. The workflow is:

```
Step 1  Choose a Solid      → showFinishedSolid(), title label on, fly to 'threeQuarter'
Step 2  Set the Dimensions  → + setAllDims(true), fly to 'threeQuarter'
Step 3  Orthographic Views  → + showSheet(true); clicking a view calls selectView(key)
Step 4  Construct           → showSheet(true), showStrip('phase-strip'), hideFinishedSolid(), goPhase('a')
Step 5  Projection or View? → showSheet(false), enterFormComparison()
Step 6  The Whole Process   → showSheet(true), showStrip('chain-strip'), playSummary('views')
```

### 5.2 Individual construction steps (the four phases) — `goPhase(id, {animate})` `main.js:757`

Every call begins with the same teardown: `sequencer.stop()`, `clearScheduled()`, `cancelAllTweens()`, `transfers?.clear()`, `markPhase(id)`, then `orthoSheet.setDrawn(true)`, `hideFinishedSolid()`, `labels.set('title', false)`, `setAllDims(false)`, `hideStages()`, `highlightFace(null)`, `isoAngles?.set(false)`.

**Phases are CUMULATIVE.** Phase C still shows the axes and the box — a construction that threw away its guides at each step would teach the opposite of the lesson. Re-selecting an earlier phase rewinds to exactly that state.

| Phase | Camera | Sequence (ms from phase start) |
|---|---|---|
| **A** — axes | `flyTo(pose('isometric', { center: construction.origin, radius: focus.radius * 1.5 }), { duration: 1400 })` — aimed at the **origin corner**, not the solid's centre | `500` → `showAxes({animate:true})` (three axes staggered `AXIS_STAGGER = 300` ms, each growing over `AXIS_GROW = 520` ms); `1900` → `isoAngles.set(true)` |
| **B** — box | `flyTo(pose('isometric'), { duration: 900 })` | `200` → `showBox()` (700 ms grow); then `1000 + i*1250` for each of the three `DIM_SOURCES` → `transferDimension(src)`; then `1000 + 3*1250 = 4750` → `orthoSheet.highlight(null)` + `setAllDims(true, {animate:true})` |
| **C** — shape | `flyTo(pose('isometric'), { duration: 900 })`; axes instant, box instant at `opacity 0.55`, all dims on | `500 + i*1600` for each stage → `showStage(i)` + `setStageNote(...)` + `announce(st.note)` |
| **D** — finish | `flyTo(pose('isometric'), { duration: 800 })`; axes/box/stages all landed instantly first | `260` → `hideAxes/hideBox/hideStages({animate:true})`; `640` → `showFinishedSolid({animate:true})` (760 ms); `1200` → closing stage note |

With `{ animate: false }` (used by `applyStepState()` after a dimension edit) each phase lands its cumulative end state with **no motion and no camera move**. Phase A additionally calls `cameraRig.retarget(construction.origin)` — a dimension edit moves the origin corner, and the 30° claim depends on that corner staying centred; `retarget` slides both eye and target by the same delta so the learner's own orbit survives.

### 5.3 Stepper / state machine

Two independent state machines:

**The step machine** — `src/stepper.js`. Owns `currentStep` (1..6) and a `visited: Set`. A step is reachable once visited; upcoming steps stay locked (`btn.disabled = !(current || complete)`, and the click handler early-returns on `!visited.has(target)`). The rail is written in the markup (six `<li class="rail__item" data-step="n">`), and the stepper only styles it (`is-current` / `is-complete` / `is-upcoming`, marker `✓` vs number) and sets `aria-label` / `aria-current`. Uses an `AbortController` (`ac.signal`) for every listener so `dispose()` removes them in one call.

**The phase machine** — `main.js` `state.phase` (`'a'|'b'|'c'|'d'|null`), driven by `goPhase()`. `markPhase(id)` sets `aria-current="step"` on the matching `#phase-strip .flow-strip__node` and swaps `#phase-note`'s title/body from `getPhase(id)`. `null` blanks the note so Phase A's copy is never stranded under another step.

**The sequencer** — `src/summaryAnimator.js` `createSequencer()`. A `token` counter guards every beat: `play()` calls `stop()` (which increments `token` and clears timers), captures `const mine = token`, and every scheduled callback early-returns `if (mine !== token)`. Under `prefers-reduced-motion` every `at` collapses to `0` — the beats still **run**, they just all arrive at once.

**Timer bookkeeping is deliberately split into two lists** (`main.js:698, 705`):
- `sequencerBeats[]` — scene-layer timers (the axis stagger, the Phase-C fan-out), cleared by `clearScheduled()` on every phase change.
- `chromeBeats[]` — the flow-strip node reveal, cleared only on a step change by `clearChromeScheduled()`.

The comment states why: a phase change must abandon scene beats without killing the strip's own reveal, which would otherwise leave the phase buttons stuck at `opacity 0` the moment Step 4 opened.

### 5.4 Geometry generation

Two generators, both fed from the same `shapeData` description, both owning and freeing everything they build.

**`src/shapeFactory.js` — `buildShape(spec, resolution)`** builds the *finished drawing*:
- `buildGeometry(spec)` — **one switch over six geometry kinds**: `box` (`BoxGeometry`), `revolve` (`CylinderGeometry(rTop, rBottom, h, 64, 1, false)` — cylinder, cone with `rTop = 0`, and frustum are one family), `prism` (`CylinderGeometry(r, r, h, sides)` + `rotateY(rot)`), `pyramid` (`ConeGeometry(r, h, sides)` + `rotateY(rot)` — an n-sided cone *is* an n-gonal pyramid), `sphere` (`SphereGeometry(r, 64, 32)`), `hemisphere` (a `SphereGeometry` upper hemisphere **plus** a separate `CircleGeometry` cap rotated to face down, returned as `extra[]` so the surface stays manifold).
- Every geometry is `translate(0, h/2, 0)`-seated so the solid **rests on y = 0** — the same seating the orthographic views assume, which is what lets a height read straight across from the front view onto the vertical isometric axis.
- Body material: `MeshPhongMaterial({ color: roleColor('solid'), shininess: 0, flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: true, side: DoubleSide })`.
- Ink edges: `EdgesGeometry(geometry, 20)` → `LineSegmentsGeometry().fromEdgesGeometry(...)` → `LineSegments2` with `LineMaterial({ color: roleColor('finished'), linewidth: WEIGHT.finished })`. The intermediate `EdgesGeometry` is disposed immediately.
- **Silhouettes** solve the curved-solid problem: `EdgesGeometry` on a cylinder returns only its two rim circles, so the sides would read as a soft fill boundary. `silhouetteSpec(spec)` returns two segments at local `±r` for a `revolve`, parked in a `silHolder` group that `update(camera)` spins about Y: `silHolder.rotation.y = Math.atan2(-v.x, -v.z) + Math.PI/2`. Sphere and hemisphere instead get a **billboard** ring that takes `camera.quaternion` outright.

**`src/constructionEngine.js` — `buildConstruction({solid, dims, resolution})`** builds the *linework an engineer draws*, as three independently animatable layers plus the face highlights. **One switch over nine construction primitive kinds** (`primitivePositions`): `axisLine` · `ring` · `poly` · `verticals` · `spokes` · `generators` · `marker` · `billboard`. Each returns a flat `[x,y,z, x,y,z, …]` array in world units.

**The growth trick** (the reason no geometry is rewritten per frame): axis and box geometry is written **relative to the shared origin corner** and parented to a group positioned there, with `scale.setScalar(0.0001)` at rest. Scaling that group 0 → 1 makes the lines extend *out of the corner* — the motion a hand makes.

### 5.5 Coordinate systems and isometric axes

- `origin = new THREE.Vector3(hw, 0, hd)` where `hw = toWorld(bounds.width)/2`, `hd = toWorld(bounds.depth)/2` — the bottom corner nearest the eye.
- `AXIS_SPECS` (`constructionEngine.js:51`), in the order the lesson names them:

| key | direction | label | read from |
|---|---|---|---|
| `height` | `(0, 1, 0)` | Height | side view |
| `width` | `(-1, 0, 0)` | Width | front view |
| `depth` | `(0, 0, -1)` | Depth | top view |

- Axis length = `bounds[dirKey] + AXIS_OVERSHOOT_MM (14)`, so an axis reads as a *guide* rather than one more edge of the box it carries.
- Each axis object carries `symbol` (from `axisSymbol(solid, dirKey)`), `tip`, `mid` (midpoint of the box edge — where a transferred size lands), `dir`, and `lengthMm`.
- The box is written with **signed** offsets from the origin corner: `W = -2*hw`, `D = -2*hd`, `H = h`, eight corners, twelve edges.

### 5.6 Object construction (per-solid stages)

Declared as data in `shapeData.js` `construction(d)`. The ten solids and their stage ids:

| Solid | dims (symbol) | stages |
|---|---|---|
| Cube | `edge` (a) | `done` |
| Cuboid | `length` (L) · `breadth` (B) · `height` (H) | `done` |
| Cylinder | `diameter` (ØD) · `height` (H) | `base` · `top` · `axis` |
| Cone | `diameter` (ØD) · `height` (H) | `base` · `axis` · `slant` |
| Square Pyramid | `side` (a) · `height` (H) | `base` · `apex` · `edges` |
| Square Prism | `side` (a) · `height` (H) | `base` · `top` · `join` |
| Pentagonal Prism | `side` (a) · `height` (H) | `base` · `top` · `join` |
| Frustum of Cone | `bottom` (ØD) · `top` (Ød, **optional**) · `height` (H) | `lower` · `upper` · `generators` |
| Sphere | `diameter` (ØD) | `centre` · `outline` |
| Hemisphere | `diameter` (ØD) | `base` · `dome` |

Each stage is `{ id, label, note, draw: [primitive…] }`. `showStage(i)` fades that stage's materials to 1 over 520 ms and `main.js` writes `${st.label} — ${st.note}` into `#phase-stage-note`.

Notable data facts **[CONFIRMED]**:
- The **pentagonal prism** is the only solid whose `bounds()` is computed from its actual footprint (`Math.max(...xs) - Math.min(...xs)`) rather than a stated dimension, because a pentagon does not fill its box. Its `axisSymbols` are therefore `L`/`B`/`H`, not `a`.
- The **hemisphere**'s `axisSymbols.height` is `'R'`, not `'ØD'` — its box is only one radius tall.
- The **frustum** is the only solid with `extraDims(d)` — its top diameter `Ød` cannot be carried by a box edge, so it is declared as data with an explicit `from`/`to`/`push`.
- **Sphere and hemisphere** carry `trueDiameterInProjection: true` and share `SPHERE_FORM_NOTE`.

### 5.7 Measurements / dimensions

**`src/dimensionLayer.js` — `buildDimensions({specs, resolution})`** builds real BIS SP 46:2003 **Type-B** dimensions, not floating captions:

| Constant | Value (world units) | Controls |
|---|---|---|
| `OFFSET` | `0.46` | how far the dimension line stands off the span |
| `GAP` | `0.07` | clear air between the measured point and the extension line's start |
| `OVERSHOOT` | `0.13` | how far the extension line runs past the dimension line |
| `ARROW_L` | `0.24` | arrowhead length; full width is `ARROW_L/3` (the 3:1 cue) |
| `LABEL_LIFT` | `0.2` | lift of the value above the dimension line |
| `MIN_INNER` | `ARROW_L * 2.6 = 0.624` | below this span the arrows turn **outward** and land on the outside of the extension lines |

Arrowheads cannot live in a `LineSegments2` batch (they are filled polygons), so each dimension gets its own three-vertex-per-head `BufferGeometry` triangle soup with a `MeshBasicMaterial`, sharing the dimension's own fade. `buildAssembly` returns `{ lines, arrows, anchor }`; the anchor is the midpoint of the offset span plus `LABEL_LIFT` along the push direction.

**Two deliberate divergences from the platform's orthographic-sheet dimensioning**, stated in the file header: (1) colour and weight are the **construction register** (`--color-bench-grey`, `WEIGHT.dimension = 1.1`, the thinnest weight in the scene) rather than ink, because here the dimensions annotate a pictorial whose object must stay the focus; (2) gap/overshoot/arrow sizes are **world** units, not paper space, because this scene is orbited and dollied and a paper-space arrowhead would need rewriting every frame.

**`DIM_SOURCES` (`main.js:290`)** binds each dimension to a box edge, a source view, and a push direction:

| labelKey | axisKey | view | edge (from `hw, hd, h`) | push |
|---|---|---|---|---|
| `dimWidth` | `width` | front | `(hw,0,hd)` → `(-hw,0,hd)` | `(0,0,1)` |
| `dimDepth` | `depth` | top | `(hw,0,hd)` → `(hw,0,-hd)` | `(1,0,0)` |
| `dimHeight` | `height` | side | `(-hw,0,hd)` → `(-hw,h,hd)` | `(-1,0,0)` |

The height dimension is **not** on the near origin corner. That corner is the closest point of the solid, so no horizontal push moves a dimension off it — every direction slides *along* the silhouette and the dimension lands on the face. It uses the **left** silhouette edge, which is the outermost vertical from both the three-quarter and the isometric viewpoint and is the same height either way.

**Deduplication** (`buildDimensionAnnotations`, `main.js:327`): a signature `${axis.symbol}|${value}` is kept in a `seen` map. A cylinder's box is square in plan, so its width and depth are the same diameter — a drawing states a diameter once. The later edge is **not drawn** and is aliased in `dimAlias` to the one that carries it, so Phase B still transfers all three overall sizes and simply lands two of them on the same annotation. `setDim(key, on)` shows/hides a dimension's linework, arrowheads **and** value together — they are three objects but one statement.

**The Phase-B transfer** — `transferDimension(src)` (`main.js:659`):
1. `orthoSheet.highlight(src.view)`
2. resolve `target = dimAlias.get(src.labelKey) ?? src.labelKey`, `anchor = dimAnchors.get(target)`
3. `announce(...)` the symbol, value, source view and destination axis
4. `from = orthoSheet.viewCenter(src.view)` (client-space, from `getBoundingClientRect()`)
5. if either `from` or `anchor` is missing → `land()` immediately (the callout just appears). **This fallback is deliberate**: a missing anchor must degrade to the old behaviour, never to a token flying out of the viewport's top-left corner.
6. otherwise `transfers.fly({ from: clientToViewport(from), to: worldToViewport(anchor), symbol, onLand: land })`

### 5.8 Labels

**`src/labelLayer.js`** is the CSS2D label factory **and the single documented placement policy**. `PLACEMENT` holds every standoff in the topic:

```js
PLACEMENT = {
  outboard: 0.34,            // world units — a dimension label pushed off the edge it measures
  crown: 0.55,               // world units — a title lifted above the top of the solid
  figureClearScreen: 0.115,  // NDC — clear air between the highest projected point and a figure title
}
```

`figureClearScreen` is in **screen space (NDC)** on purpose: a title is a figure caption, so the gap that reads as "right" is a gap *on the page* — the same handful of pixels whether the figure is a 20 mm cube or a 110 mm slab. A world-space clearance cannot do that, because the camera pulls back for a bigger solid and the same world gap shrinks on screen exactly when the drawing grows.

Two `CSS2DRenderer` facts the module exists to handle: it honours each object's **own** `.visible`, not an ancestor group's (so `set()` always drives the label object itself); and the `<div>`s are real DOM that accumulates, so `clearAll()` pulls them out of the document as part of rebuild disposal.

`set(key, on, {animate})` uses a **double `requestAnimationFrame`** before adding `.is-in` so the browser has a start value to transition from, and defers `visible = false` by `FADE_MS = 220` on hide so a label can be toggled repeatedly without ever snapping.

**The figure title is the one placement that cannot be tabulated** — `updateFigureTitles()` (`main.js:582`), called **every frame**:
1. `topY = toWorld(bounds.height) * shape.group.scale.x`
2. `top = topHalfExtent(solid.body(currentDims()))` — the spread of the solid **at its top**, not of its enclosing box, plus a `round` flag. A sphere/cone/pyramid ends in a point (`hw = hd = 0`), a cylinder/frustum in `rTop`, a box in its own half-extents, a prism in its circumradius.
3. `base = ndcHeight(0, topY, 0)`; `perUnit = ndcHeight(0, topY+1, 0) - base`
4. project four candidate top points (`[hw,0],[-hw,0],[0,hd],[0,-hd]` if round, else the four corners) and take the highest NDC y
5. also take the max over every currently visible dimension anchor (`visibleDims`) — a frustum's `Ød` is drawn *above* the solid and is part of the drawing
6. `rise = (highest - base + PLACEMENT.figureClearScreen) / perUnit`; `labels.moveTo('title', placeFigureTitle(topY, rise))` and the same for `'formTitle'`

The comment records that an earlier version resolved corner offsets against the camera's up axis, which is only correct for a **parallel** projection — under perspective the far top corner is further away and projects *lower*, so boxes were lifted about half a clearance too high. Measuring by projection is exact and costs four transforms.

Label keys in play: `dimWidth` · `dimDepth` · `dimHeight` · `dimExtra{i}` · `title` · `formTitle` · `viewFront` · `viewTop` · `viewSide`.

### 5.9 Annotations — the two screen-space overlays

Both have one foot in the DOM and one in the scene, so both are drawn in the only space that holds both: **CSS pixels over the viewport**. `main.js` owns the whole boundary in two helpers — `worldToViewport(v3)` (project against the camera, then map NDC to the viewport rect) and `clientToViewport(pt)` (subtract the viewport rect's origin).

**`src/isoAngles.js` — the two 30° arcs.** Imports **nothing**; `main.js` hands it already-projected screen points.
- `ARC_R = 52` CSS px (fixed, so the annotation reads the same at any zoom), `LABEL_GAP = 17`, `DATUM_SPAN = 2.05` (half-length of the horizontal datum as a multiple of `ARC_R`).
- Built once (`<line class="vp-angles__datum">` + two `<g><path pathLength="100"><text>30°</text></g>`); only attributes change per frame.
- `update({origin, rays, alignment})` normalises each ray, measures `deg = acos(ux * side) * 180/π` against the horizontal on the side the axis recedes toward, sets the arc `d` with SVG sweep flag derived from the cross product (screen y runs **down**, so a positive cross product is a clockwise sweep = sweep-flag 1), places the value on the bisector at `ARC_R + LABEL_GAP` with a `+4` optical baseline nudge, and stores what it measured in `measuredDeg` so a regression shows up as a number.
- `root.setAttribute('opacity', alignment)` — one property carries the whole fade.

**Honesty by composition, not by fudging.** A perspective camera does not preserve angles across the frame. `main.js` therefore aims the camera **at the construction origin** during Phase A so that corner sits on the principal axis, where the projection is locally angle-preserving. And `isoAlignment()` (`main.js:555`) fades the annotation out as the camera leaves the isometric sight-line:

```js
ISO_DIR        = (1,1,1).normalize()
ISO_FADE_START = 2.5°   // fully shown within this angle
ISO_FADE_END   = 12°    // gone by here
```
The comment records the reason the start band is so tight: measured off-axis, the receding axes drift about a degree for every three degrees of orbit, so a generous band would let the label read "30°" over an angle a student could measure off a screenshot as 32°.

**`src/transferLayer.js` — the flying dimension token.** Imports only `anim.js`, deliberately: the tween clock is `main`'s render loop, so `simAPI.pause()` freezes a transfer in flight. A private `rAF` would not. `TOKEN_W = 46`, `TOKEN_H = 22` (sized for the longest symbol the topic ships, `ØD`), default `duration = 760` ms. The **leader line is drawn first and stays for the flight** — the leader is the evidence, the token only the messenger. On landing it calls `onLand()`, adds `.is-landed`, and removes itself after 420 ms so two labels never say the same thing in the same place. Both overlays are `pointer-events: none` and `aria-hidden` so they never intercept a drag and never become a second announcement channel.

### 5.10 Camera behaviour — `src/cameraRig.js`

Poses are stored as **DIRECTIONS**, and distance is derived per rebuild from the live content radius:

```js
DIRECTIONS = {
  front:        (0, 0, 1),
  top:          (0, 1, 0.02).normalize(),   // the z nudge keeps OrbitControls off its polar singularity
  side:         (1, 0, 0),
  threeQuarter: (0.62, 0.42, 0.75).normalize(),
  isometric:    (1, 1, 1).normalize(),
}
FRAMING = { front: 2.6, top: 2.6, side: 2.6, threeQuarter: 3.4, isometric: 4.2 }
```
`pose(name, override)` returns `{ pos: center + dir * (radius * FRAMING[name]), target: center }`. The isometric framing is loosest on purpose: Steps 4 and 6 must hold not just the solid but the box, the three axes with their overshoot, and the dimension callouts pinned outboard.

`flyTo(target, { duration = 1300, ease = easeCamera })` disables `controls` for the duration (so the learner's drag and the flight never fight), lerps position and target, and restores `controls.enabled` on complete. `main.js`'s render loop skips `controls.update()` while `cameraRig.isFlying()`.

`retarget(point)` moves **both** eye and target by the same delta — the viewing direction and distance are untouched, so an orbit the learner set by hand survives. This exists solely for Phase A after a dimension edit.

`snapTo(pose)` (no motion) is used at boot and by `simAPI.reset()`. `focusOn(center, radius)` is called once per `rebuild()` from `contentFocus()`, which returns `center = (0, h/2, 0)` and `radius = 0.5 * √(w² + d² + h²)`.

Under `prefers-reduced-motion`, `tween`'s `duration` is forced to `0` — the camera still **lands**, it just gets there instantly.

### 5.11 Scene rebuilding

`rebuild()` is **the only path geometry changes through**. Three call sites in the controller (`setSolid`, `setDim`, `setDimSpecified`), plus `simAPI.reset()` and the `webglcontextrestored` handler. Nothing else touches the scene graph.

The `setDim` → `rebuild()` → `applyStepState()` sequence is what makes a fast slider drag safe: every tick disposes the previous solid completely before building the next, so `renderer.info.memory` stays flat rather than growing with each frame of the drag.

### 5.12 Disposal / cleanup — `disposeScene()` (`main.js:248`)

```js
dimensions?.dispose();   dimensions = null;
construction?.dispose(); construction = null;
shape?.dispose();        shape = null;
labels?.clearAll();                                  // removes the CSS2D <div>s from the DOM
for (const obj of [...shapeGroup.children]) {        // anything added outside a rig
  obj.geometry?.dispose();
  (Array.isArray(obj.material) ? obj.material : [obj.material])
    .forEach(m => { m?.map?.dispose(); m?.dispose(); });
}
shapeGroup.clear();
```
Each rig's own `dispose()` follows the same shape: `group.removeFromParent()`, then dispose every owned geometry and material, then empty the owned arrays and `group.clear()`. `constructionEngine` deliberately keeps **two** material lists — `materials` (everything to dispose) and `lineMaterials` (the subset carrying a screen-space `resolution`) — so the resize handler never walks into an undefined `.resolution` on a face-highlight `MeshBasicMaterial`.

Tween cleanup is separate: `liveTweens` is a `Map` keyed by the animated target, and `animateValue(key, …)` cancels any live tween on that key before starting a new one. `cancelAllTweens()` empties the map; `cancelTweens()` (from `anim.js`) clears the module-level active set.

### 5.13 Event handling

| Source | Handler | Effect |
|---|---|---|
| `#solid-select` change | `uiManager` → `sim.setSolid(id)` | full rebuild + dock re-render + `enterStep(current)` |
| `.field__range` input | `uiManager.commit()` → `sim.setDim(key, v)` | rebuild + `ui.sync` + `applyStepState()` |
| `.field__num` change | same, with `{fromText: true}` | as above; a non-finite entry **reverts silently**, never turns red |
| `.field__check` change | `sim.setDimSpecified(key, on)` | rebuild + full dock re-render (the field *set* changes shape) |
| `#phase-strip .flow-strip__node` click | `goPhase(btn.dataset.phase)` | phase change |
| `#act-replay-phases` click | `goPhase('a')` | restart phases |
| `#form-modes .segmented__btn` click | `setFormMode(btn.dataset.form)` | Step-5 scale toggle |
| `#chain-strip .flow-strip__node` click | `playSummary(btn.dataset.link)` | jump into the chain |
| `#act-replay-summary` click | `playSummary('views')` | restart the summary |
| SVG view group click / Enter / Space | `orthoSheet` subscribers → `selectView(key)` | highlight + face light + camera flight; clicking the same view again steps back out to `threeQuarter` |
| `#btn-back` / `#btn-next` / rail buttons | `stepper.goToStep(n)` | step change |
| `#btn-reset` → `#btn-reset-yes` | `window.simAPI.reset()` | the single reset path, behind a two-state confirm |
| `#wizard-toggle` click | toggles `body.wizard-collapsed`, then `handleResize` on the next frame | |
| `ResizeObserver` on `#sim-viewport` | `handleResize(container)` | see §7.9 |
| `webglcontextlost` / `restored` | `stopLoop()` / `rebuild()` + `enterStep()` + `startLoop()` | |

Every announcement goes through **one** channel: `announce(message)` writes `#sim-status` (`role="status" aria-live="polite"`). `flowNote(message)` is the visual twin — a 4500 ms accent wash over the viewport — and is `aria-hidden` precisely so it does not double-announce.

### 5.14 Step 5 — the form comparison

The only difference between the two forms is the **scale lengths are measured at**. Showing them side by side invited the reading "two different drawings", which is the misconception the step exists to kill — so there is **one** drawing and a toggle.

```js
FORM_SCALE = { projection: ISOMETRIC_SCALE (0.816), view: 1 }
FORM_TITLE = { projection: 'Isometric Projection', view: 'Isometric View' }

formScaleFor(solid, mode) {
  if (solid.trueDiameterInProjection) return 1;   // the sphere rule, as DATA
  return FORM_SCALE[mode] ?? 1;
}
```
`applyFormMode(mode, {animate})` tweens `shape.group.scale` — **the same geometry, re-scaled**, never rebuilt. Rebuilding would be dishonest: if the two forms needed different geometry, the method really would differ.

The chrome follows in `syncFormChrome()`: `aria-pressed` on the segmented buttons, `.is-active` on the two `.form-card`s, and `#form-drawn-head` reads `'Drawn · ×0.816'` **only** when `mode === 'projection' && !exempt` — a sphere drawn at true size in both forms must not carry a `×0.816` header over a column of unreduced numbers. `renderFormRows()` writes one `.form-row` per declared dimension with the true size and `trueLen * scale`, so the learner can *check* the 0.816 rather than be told it. `renderSolidFormNote(solid)` shows `solid.formNote` only for a solid that declares one.

`resetSceneLayers()` puts `shape.group.scale` back to 1 on every step change, because Step 5 leaves a scale on the shared rig.

### 5.15 Step 6 — the replay

`SUMMARY_CHAIN` (five links) and `SUMMARY_TIMING` (six marks, in ms):

```js
SUMMARY_TIMING = { views: 0, axes: 2200, box: 4200, shape: 6600, finish: 9600, close: 11600 }
SUMMARY_CHAIN  = [ views, axes, box, shape, finish ]   // each { id, label, note }
```
`playSummary(from = 'views')` computes `startIndex = order.indexOf(from)`, applies **every earlier link instantly** (so jumping into the middle still shows an honest state), then schedules the remaining beats offset by `t0 = SUMMARY_TIMING[order[startIndex]]`. The `finish` and `close` beats always run. `close` reveals `#summary-closing` and announces the chain.

### 5.16 Completion conditions

**There are none in the scoring sense.** Topic 2 has no answer checking and no completion gate. What exists:

- **Step reachability:** `visited` in `stepper.js`. A step becomes reachable once entered; upcoming steps stay locked. `renderNav()` hides Back at step 1 and Next at step 6 (the terminal step has no Next).
- **Phase completion:** purely visual. `goPhase('d')` lands the finished drawing; nothing records that it happened.
- **Rail completion marks:** `is-complete` + a `✓` marker for any visited, non-current step.

**[CONFIRMED]** `state` holds no completion flag; the only progress record in the whole topic is `stepper`'s private `visited` set.

---

## 6. Topic 3 — Problem Library (detailed)

### 6.1 Problem data structure

A problem is a plain frozen object in `src/problemLibrary.js`. The full schema (from the JSDoc typedefs plus what the code actually reads):

```js
{
  id:                'ndb-17-12-cylinder',        // stable, used as the subject key
  title:             'Cylinder — axis vertical and horizontal',
  question:          '…',                          // VERBATIM textbook wording
  category:          'standard-solids',            // → CATEGORIES[].id
  source:            { textbook, chapter, ref, adapted },   // carried but NOT rendered
  difficulty:        'beginner'|'intermediate'|'advanced',
  learningObjective: '…',
  solid:             [PartSpec, …],                // bottom-first
  dimensions:        { key: DimSpec, … },
  derived:           { key: (d) => number, … },    // optional
  axisSymbols:       { width, depth, height },     // optional; defaults L/B/H
  projectionType:    'projection'|'view'|'either',
  orientations:      ['axis-vertical', 'axis-horizontal-x'],   // optional
  answerData:        AnswerData,
  hints:             ['…', '…', '…'],              // ordered, revealed one at a time
  tags:              ['cylinder', 'ellipse', …],
}
```

**`PartSpec`** — one part of the solid:
```js
{ id:'sphere', part:'sphere', r:'sphereRadius',
  seat:{ on:'prism', mode:'flat' }, align:'centred', orient:'axis-vertical', rot:'flatToVP' }
```
Every remaining key is a **part-kind parameter holding a DIMENSION KEY** (a string), not a literal number — so one dimension edit moves every part that shares it. `resolveParams` skips the five reserved keys (`id`, `part`, `seat`, `align`, `orient`, `rot`) and resolves `typeof value === 'string' ? (dims[value] ?? 0) : value`. A literal `0` (as in `rTop: 0` for a cone) passes through unchanged.

**`DimSpec`** — `{ symbol, label, value, min, max, step?, given?, auto?, autoNote? }`. `value` is the size the **question states**; `given: false` marks a size the question deliberately withholds.

**`AnswerData`** — only the keys present are checked; a property the question does not fix is left OUT rather than pinned:
```js
{ scale: 0.816,                                     // 0.816 projection, 1 view
  bounds: { width, depth, height },                 // TRUE size, mm — on EVERY shipped problem
  parts: { hemi: { scaled:false, centreHeightScaled:true } },
  requiredStages: ['base','top','generators'],
  orientation: 'axis-vertical' }
```

**`CATEGORIES`** (four, in teaching order): `standard-solids` · `truncated-frustums` · `spherical` · `combinations`. Each has `{ id, label, blurb }`.

### 6.2 Problem definitions — the shipped 14

| # | id | Title | Category | Type | Parts | answerData.bounds |
|---|---|---|---|---|---|---|
| 1 | `ndb-17-12-cylinder` | Cylinder — axis vertical and horizontal | standard-solids | projection | `revolve` | 50 × 50 × 70 |
| 2 | `ndb-ex17-4-hex-prism` | Hexagonal prism on its base | standard-solids | view | `prism` (6) | 50 × 43.3 × 65 |
| 3 | `kcj-16-10-cone` | Cone — axis vertical and horizontal | standard-solids | view | `revolve` (rTop 0) | 40 × 40 × 55 |
| 4 | `ndb-17-16-frustum-hex-pyramid` | Frustum of a hexagonal pyramid | truncated-frustums | view | `pyramid` (6, rTop>0) | 100 × 86.6 × 75 |
| 5 | `ndb-17-20-frustum-cone` | Frustum of a cone | truncated-frustums | view | `revolve` | 50 × 50 × 65 |
| 6 | `ndb-hemisphere-60` | Hemisphere on its flat face | spherical | projection | `hemisphere` | 60 × 60 × 30 |
| 7 | `mqp-q8-sphere-on-hex-prism` | Sphere on a hexagonal prism | spherical | projection | `prism` + `sphere` | 70 × 60.6 × 100 |
| 8 | `mqp-q7-frustum-on-slab` | Frustum of a cone on a rectangular slab | combinations | view | `box` + `revolve` | 80 × 60 × 80 |
| 9 | `ndb-17-40-sphere-on-frustum` | Sphere on a frustum of a cone | combinations | projection | `revolve` + `sphere` | 80 × 80 × 115 |
| 10 | `practice-sphere-on-square-prism` | Sphere on a square prism | combinations | view | `prism` (4) + `sphere` | 60 × 60 × 90 |
| 11 | `practice-sphere-on-cylinder` | Cylinder surmounted by a sphere | combinations | view | `revolve` + `sphere` | 80 × 80 × 170 |
| 12 | `practice-pent-pyramid-on-cylinder` | Pentagonal pyramid on a cylinder | combinations | view | `revolve` + `pyramid` (5) | 90 × 90 × 110 |
| 13 | `practice-sphere-on-hex-slab` | Sphere on a hexagonal slab | combinations | view | `prism` (6) + `sphere` | 60 × 52 × 60 |
| 14 | `practice-sphere-on-square-frustum` | Sphere on a frustum of a square pyramid | combinations | projection | `pyramid` (4, rTop>0) + `sphere` | 50 × 50 × 100 |

A worked example — problem 7, the one that exercises both halves of the sphere rule:

```js
{
  id: 'mqp-q8-sphere-on-hex-prism',
  question: 'A sphere of diameter 40 mm is placed centrally on top of a hexagonal prism, base side 35 mm and height 60 mm. Draw the isometric projection of the combination.',
  solid: [
    { id:'prism',  part:'prism',  sides:6, r:'circum', h:'prismHeight', rot:'flatToVP' },
    { id:'sphere', part:'sphere', r:'sphereRadius', seat:{ on:'prism', mode:'flat' }, align:'centred' },
  ],
  dimensions: {
    sphereDia:   { symbol:'ØD', label:'Sphere diameter',  value:40, min:20, max:90 },
    baseSide:    { symbol:'a',  label:'Prism base side',  value:35, min:15, max:60 },
    prismHeight: { symbol:'H',  label:'Prism height',     value:60, min:20, max:110 },
  },
  derived: { circum: (d) => circumradius(d.baseSide, 6), sphereRadius: (d) => d.sphereDia / 2 },
  projectionType: 'projection',
  answerData: {
    scale: 0.816,
    bounds: { width:70, depth:60.6, height:100 },
    parts: { prism:{ scaled:true }, sphere:{ scaled:false, centreHeightScaled:true } },
  },
}
```

**`src/practiceSolids.js`** carries the same ten solids as Topic 2, in this schema, **minus** `question` / `answerData` / `hints`, and with `projectionType: 'either'` on every one. It carries **no geometry** — it names parts and hands over. `DEFAULT_PRACTICE_ID = 'practice-cube'` is what the sim boots and resets to.

### 6.3 Problem selection — `src/problemQuery.js`

The **only** junction between the two subject sources. Four exports:

```js
allProblems()          → PROBLEMS               // the browser's 14; practice solids never appear
allPracticeSolids()    → PRACTICE_SOLIDS        // the 10 in Step 1's picker
getSubject(id)         → getProblem(id) ?? getPracticeSolid(id) ?? null
isTextbookProblem(s)   → Boolean(s?.question)   // DATA SHAPE, never an identity test
```
The file header records that a derived-facet table and a keyword search over `PROBLEMS` used to live here and were **deliberately removed**: fourteen problems grouped into four categories do not earn a search box plus five chip rows. The removal is a UI decision, not a data one — if the library grows, filtering goes back *behind* this same accessor rather than into the browser.

### 6.4 Problem rendering — the load path

One path for both kinds of subject (`main.js:676 loadProblem`):
```
loadProblem(id)
 ├─ p = getSubject(id);  if (!p) return
 ├─ form = initialProjectionMode(p)
 ├─ state.problemId     = p.id
 ├─ state.dims          = defaultDims(p)                  // the question's stated sizes
 ├─ state.unspecified   = {}; for (k of withheldDims(p)) state.unspecified[k] = true
 ├─ state.projectionMode= form.mode
 ├─ state.orientationId = p.orientations?.[0] ?? null
 ├─ state.verification  = { checked:false, findings:[] }
 ├─ state.ui.statementHidden = false
 ├─ progress.phasesDone.length = 0;  progress.stagesDone.length = 0
 ├─ rebuild()
 ├─ ui.render(state)
 ├─ stepper.reload()                                       // rebuilds the rail, returns to Step 1
 └─ announce(isTextbookProblem(p) ? 'Problem loaded: …' : '… selected. Drag to rotate it.')
```
`exitProblem()` is simply `loadProblem(DEFAULT_PRACTICE_ID)` — it returns to a **solid**, never to nothing, because `compose(null)` yields an empty model and a blank viewport is not a state a button should be able to reach.

### 6.5 Relationship between problem data and construction code

The chain is four pure transforms and then two builders. **No renderer ever sees a problem.**

```
Problem (data)                                     src/problemLibrary.js | practiceSolids.js
   │
   ├─ resolveDims(problem, state.dims, state.unspecified) ──► ONE FLAT DIMENSION SET
   │      1. every key of problem.dimensions ← state.dims[k] ?? spec.value
   │      2. anything withheld (spec.given === false || unspecified[k]) ← spec.auto(out)
   │      3. problem.derived last, so a derived size sees the settled value
   │                                                   src/dimensionResolver.js
   │
   ├─ compose(problem, dims, { orientationId }) ──────────► ComposedModel
   │      per PartSpec:  kind = getPartKind(partSpec.part)
   │                     spec = resolveParams(partSpec, dims)
   │                     localBounds = kind.bounds(spec)
   │                     orient = ORIENTATIONS[partSpec.orient ?? opts.orientationId ?? 'axis-vertical']
   │                     bounds = orient.bounds(localBounds)
   │                     originY = seat==='ground' ? 0 : support.originY + support.bounds.height
   │                     part = { id, kind, spec, bodySpec: kind.body(spec), originY, offset,
   │                              rotation, turns, align, bounds, localBounds,
   │                              trueDiameter: kind.trueDiameter, stages: kind.construction(spec),
   │                              localViews: kind.views(spec) }
   │      then: overallBounds(parts) · flattenStages(parts) · composeViews(parts, bounds)
   │            · composeDimSpecs(problem, parts, bounds)
   │                                                   src/solidComposer.js
   │
   ├─ resolveProjection(model, state.projectionMode) ─────► ProjectionPlan
   │      axialScale = mode === 'projection' ? 0.816 : 1
   │      per part: { scale:       part.trueDiameter ? 1 : axialScale,   // drawn size
   │                  originScale: axialScale }                          // where it sits — ALWAYS reduced
   │                                                   src/projectionResolver.js
   │
   ├─ buildComposedShape(model, plan, res)  ──► meshes + ink edges + silhouettes
   ├─ buildConstruction({model, plan, res}) ──► axes + one box per part + stages
   ├─ buildDimensions({specs, res})         ──► Type-B dimension assemblies
   └─ orthoSheet.draw(model.views, dims)    ──► the SVG sheet
```

`getPartKind()` returns **`null`** for an unknown kind rather than a fallback — an unknown kind is an authoring bug in the problem data, and silently drawing a box instead would hide it. The fault is pushed into `model.problems` and surfaced by `auditComposition`.

### 6.6 Reusable geometry — `src/solidCatalog.js` `PART_KINDS`

Six kinds, each declaring exactly four functions (`bounds` · `body` · `views` · `construction`) and optionally `trueDiameter`:

| kind | covers | parameters | stages |
|---|---|---|---|
| `box` | cube · cuboid · rectangular slab | `w, d, h` | `box-done` |
| `revolve` | cylinder · cone (`rTop = 0`) · frustum of a cone | `rBottom, rTop, h` | cone: `base`/`apex`/`slant`; else `base`/`top`/`generators` |
| `prism` | square / pentagonal / hexagonal prism · polygonal slab | `r, sides, h, rot` | `base`/`top`/`join` |
| `pyramid` | pyramid (`rTop = 0`) · **frustum of a pyramid** (`rTop > 0`) | `r, rTop, sides, h, rot` | pyramid: `base`/`apex`/`edges`; frustum: `base`/`top`/`edges` |
| `sphere` | sphere — `trueDiameter: true` | `r` | `centre`/`outline` |
| `hemisphere` | hemisphere — `trueDiameter: true` | `r` | `base`/`dome` |

`pyramid.rTop` mirrors the way `revolve` already unifies cylinder/cone/frustum — **one extra parameter rather than a seventh kind**, and it covers two shipped problems on its own.

**The seating convention is what makes stacking trivial:** every part is authored **resting on its own y = 0 and centred in plan**, so placing a part is setting one number, `originY`.

`resolveRotation(token, sides)` is the bounded vocabulary that examination wording maps onto, so no consumer parses English:
```js
cornerToVP → 0                      // a VERTEX toward the observer
flatToVP   → π / sides              // half a sector
edgeToVP   → π / sides              // an edge facing the VP IS a flat facing the VP
default    → π / sides
```

`ORIENTATIONS` in `solidComposer.js` — three quarter-turns, deliberately not free rotation:
| id | rotation | bounds mapping | offset (re-seat) |
|---|---|---|---|
| `axis-vertical` | — | unchanged | `(0,0,0)` |
| `axis-horizontal-x` | `z: -π/2` | `(h, d, w)` | `(-h/2, w/2, 0)` |
| `axis-horizontal-z` | `x: +π/2` | `(w, h, d)` | `(0, d/2, -h/2)` |

`composeViews` rotates each part's 2D view primitives by `part.turns` quarter turns (`[x,y] → [y,-x]`; a `circle` is its own rotation; `arc` is passed through because no problem lays a hemisphere down) and offsets them by the part's align and its centre height relative to the assembly's.

### 6.7 Shared utilities

Per the topic's own layering statement, the three stateless shared utils several leaves may import are **`helpers.js`**, **`solidCatalog.js`** and **`tokens.js`**.

`src/helpers.js` exports: `MM_PER_UNIT = 10`, `toWorld(mm)`, `ISOMETRIC_SCALE = 0.816`, `CHECK_TOLERANCE_MM = 0.5`, `circumradius(side, sides)`, `inradius(side, sides)`, `polygonPoints(r, sides, rot)`, `ringPoints(r, count)`, `rectPoints(hw, hd)`, `round1(v)`, `humanList(items)`.

### 6.8 How a new problem would be added

See §17 for the step-by-step procedure. The short version, and it is the whole architectural claim: **append one object to `PROBLEMS` in `src/problemLibrary.js`.** No renderer edit, no UI edit, no engine edit — provided the solid decomposes into the existing six part kinds, the three orientations, and the four rotation tokens.

### 6.9 Validation / constraints

**`src/answerValidator.js`** is pure — it owns no DOM, mutates no state, never touches a control, and never fills anything in. `uiManager.renderFindings()` paints what it returns. Tolerance is `CHECK_TOLERANCE_MM = 0.5` mm.

Six checkers in one frozen registry, run in order (form first, because it invalidates everything downstream):

| checker | returns `null` when | pass / fail condition |
|---|---|---|
| `checkProjectionType` | `answerData.scale` absent | `near(plan.axialScale * 1000, want * 1000)` |
| `checkDimensions` | never — returns `pending` if `bounds` absent | if `orientations.length > 1`, the sorted **set** of three sizes is compared (either placement passes); otherwise each named key is compared |
| `checkOrientation` | `answerData.orientation` absent | `progress.orientationId === want` |
| `checkConstructionOrder` | never | `pending` if no phase worked; `fail` if the first-reach order of a/b/c/d is not monotonic; `pass` only when all four are reached |
| `checkCompletion` | `requiredStages` absent/empty | every required `stageId` present in `progress.stagesDone` |
| `checkSphereRule` | `answerData.parts` absent, or the model has no `trueDiameter` part | checks size **and** centre height as a pair |

`checkDimensions` deliberately does **not** return `null` on a missing `bounds` — a checker that dropped out would let `summarise()` green a drawing whose overall size was never verified.

`checkSphereRule` checks the pair because honouring one half and not the other is the classic half-right answer:
```js
sizeRight   = want.scaled === false ? applied.scale === 1 : applied.scale === plan.axialScale;
centreRight = want.centreHeightScaled === false ? applied.originScale === 1
                                                : applied.originScale === plan.axialScale;
```

`summarise(findings)`: any `fail` → `fail`; else any `pending` → `pending`; else `pass`. `pending` is **not** `fail` — before the learner has done the work there is nothing to be wrong about, so an untouched problem shows a quiet "not yet checked", never red.

**A separate, non-learner-facing constraint check** is `auditComposition(model)` in `solidComposer.js`. It walks the parts and reports any pair that overlaps in a height band while also overlapping in plan — parts of a combination must meet **face to face**, never interpenetrate. It returns findings rather than throwing, and `main.js` `console.warn`s them: an unsound arrangement is an **authoring** bug in the problem data.

### 6.10 Problem-specific logic

**There is none, by design.** The behaviour that varies between problems is all carried as data and read generically:

| Behaviour | Driven by | Read at |
|---|---|---|
| Is there a statement to show? | presence of `question` | `isTextbookProblem()` → `uiManager.renderProblemHeader` |
| Is there anything to check? | presence of `answerData` | `main.js runVerification()` |
| Is the solid picker locked? | `isTextbookProblem(activeProblem)` | `uiManager.renderSolidPicker` |
| Which sizes may be withheld? | `spec.optional \|\| spec.given === false` | `dimensionResolver.optionalDims` |
| Which part is drawn at true size? | `PART_KINDS[kind].trueDiameter` | `projectionResolver.resolveProjection` |
| Which symbol goes on which box edge? | `problem.axisSymbols` | `solidComposer.composeDimSpecs` |
| Which stages must be drawn? | `answerData.requiredStages` | `answerValidator.checkCompletion` |
| Does the question pose two placements? | `orientations.length > 1` | `answerValidator.checkDimensions` |

**[CONFIRMED]** — a repository-wide grep for `problem.id ===` and for solid names inside `if` conditions returns nothing in either topic.

---

## 7. Rendering Architecture

### 7.1 Three.js usage

Pinned to **`three@0.160.0`**, loaded as CDN ES modules via an import map. **No build step, no bundler, no npm.** Only four addon paths are used anywhere in the three topics:

```
three/addons/controls/OrbitControls.js
three/addons/renderers/CSS2DRenderer.js      (CSS2DRenderer + CSS2DObject)
three/addons/lines/LineSegments2.js
three/addons/lines/LineSegmentsGeometry.js
three/addons/lines/LineMaterial.js
```

### 7.2 Scene

One `THREE.Scene` per topic. `scene.background = cssColor('--color-paper')` — read from the CSS token at construction time, never a hex literal. Scene children: two lights, the CSS2D label objects (added directly to the scene by `labelLayer`, **not** to `shapeGroup`), and `shapeGroup`.

`shapeGroup` is **the one disposal target**. Everything per-solid / per-problem hangs off it, so `rebuild()` has a single place to empty.

**Ownership differs between the topics** — Topic 2 keeps scene/renderer/camera/controls/loop inside `main.js` (1696 lines); Topic 3 moved all of it into `src/viewport.js` (162 lines) so `main.js` stays the conductor at 873 lines.

### 7.3 Renderer

```js
new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(w, h, false)
renderer.shadowMap.enabled = false
```
**Exactly one `WebGLRenderer` per topic.** The orthographic sheet is SVG in the chrome, not a second GL pass; `CSS2DRenderer` is DOM-only and does not create a context. Context loss/restore is handled explicitly in both topics.

Two size concepts are kept distinct and it matters:
- `renderer.domElement.width/height` — the **drawing buffer** in device pixels. This is what every `LineMaterial.resolution` is fed.
- `container.clientWidth/clientHeight` — **CSS pixels**. This is what `CSS2DRenderer` and both SVG overlays are sized in, because they draw *over* the canvas rather than *into* it.

### 7.4 Camera

`PerspectiveCamera(45, aspect, 0.1, 200)` in Topics 2 and 3, initial position `(6, 6, 6)`. Topic 1 uses `PerspectiveCamera(BASE_FOV = 45, aspect, 0.5, 400)` — the near plane is lifted off 0.1 and far pushed out because `POSES.isometricFlat` sits ~120 units back and a tighter near/far ratio keeps depth precision good enough to avoid z-fighting there. **[CONFIRMED]**

There is **no orthographic camera anywhere in Module 4**, which is precisely why the 30° annotation needs the compositional honesty trick described in §5.9.

### 7.5 OrbitControls

| Setting | Topic 2 | Topic 3 |
|---|---|---|
| `enableDamping` | `!prefersReducedMotion` | `true` (unconditional) |
| `dampingFactor` | `0.08` | `0.08` |
| `enablePan` | `false` | `false` |
| `minDistance` | `1.5` | `2` |
| `maxDistance` | `60` | `60` |

Damping is suppressed while a camera flight is in progress so the two never fight: Topic 2 does this inline (`if (!cameraRig.isFlying()) controls.update()`); Topic 3 injects it (`viewport.setDampingGuard(() => cameraRig.isFlying())`).

### 7.6 Lights

Flat CAD lighting, no shadows, no PBR:
- Topic 2: `AmbientLight(0xffffff, 0.85)` + `DirectionalLight(0xffffff, 0.55)` at `(5, 8, 6)`.
- Topic 3: `AmbientLight(0xffffff, 0.85)` + `DirectionalLight(0xffffff, 0.45)` at `(4, 8, 6)`. **[CONFIRMED minor divergence]**
- No `AxesHelper` anywhere — its RGB is off-palette and would leak blue into the viewport.

### 7.7 Meshes, materials, geometries, groups

**Materials in play, by role:**

| Role | Material | Where |
|---|---|---|
| Solid body | `MeshPhongMaterial({ shininess:0, flatShading:true, polygonOffset:true, +1/+1, transparent:true, side:DoubleSide })` | `shapeFactory` / `geometryFactory` |
| Finished ink edges + silhouettes | `LineMaterial({ color: roleColor('finished'), linewidth: WEIGHT.finished = 2.4 })` | same |
| Isometric axes | `LineMaterial({ color: roleColor('axis'), linewidth: WEIGHT.axis = 3.0, opacity: 0 })` | `constructionEngine` |
| Box + construction stages | `LineMaterial({ color: roleColor('construction'), linewidth: WEIGHT.construction = 1.6, opacity: 0 })` | `constructionEngine` |
| Dimension lines + extension lines | `LineMaterial({ color: roleColor('dimension'), linewidth: WEIGHT.dimension = 1.1, opacity: 0 })` | `dimensionLayer` |
| Arrowheads | `MeshBasicMaterial({ color: roleColor('dimension'), transparent:true, opacity:0, side:DoubleSide, depthWrite:false })` | `dimensionLayer` |
| Face highlights (HP/VP/PP) | `MeshBasicMaterial({ color: roleColor('hp'\|'vp'\|'pp'), opacity:0, side:DoubleSide, depthWrite:false, polygonOffset:true, -1/-1 })` | `constructionEngine` |

`polygonOffset` on every body (`+1/+1`) is what keeps faces from z-fighting the outline; the face-highlight quads use the opposite sign (`-1/-1`) so they float in front of the box face they name.

**Linework is fat-line only** — `LineSegments2` + `LineMaterial`, never `LineBasicMaterial`, which caps at 1 px on most GPUs and would collapse the whole construction hierarchy to one weight. That hierarchy **is** the teaching device: a construction line must read as lighter than the finished edge it helps produce. Every line object gets `computeLineDistances()`.

**Group structure — Topic 2:**
```
scene
├── AmbientLight, DirectionalLight
├── CSS2DObject × n                     (labels — added straight to the scene)
└── shapeGroup
    ├── shape.group                     (mesh(es) + outline + silHolder + billboard?)
    ├── construction.group
    │   ├── axisGroup × 3               (positioned at origin, scale 0.0001 → 1)
    │   ├── boxGroup                    (positioned at origin, scale 0.0001 → 1)
    │   ├── faceMesh × 3
    │   └── stage line objects
    └── dimensions.group                (line + arrowMesh per dimension)
```
**Topic 3** adds a two-level per-part rig, and the split is what makes the sphere rule expressible:
```
shapeGroup
└── shape.group
    └── placement (per part)      position ONLY — align·originScale + offset·scale, originY·originScale
        ├── body                  rotation + UNIFORM scale (the part's own `scale` from the plan)
        │   ├── mesh(es)
        │   ├── outline
        │   └── silHolder
        └── billboard             hangs off PLACEMENT, not body, so a parent rotation cannot tilt it
```
Uniform scale commutes with rotation, so the two never fight — and a `trueDiameter` part can be drawn **full size** (`body.scale = 1`) at a **reduced height** (`placement.position.y = originY * 0.816`). `geometryFactory` never learns which kind that is; it applies the two numbers it is handed.

`constructionEngine` in Topic 3 builds the *same* two-group rig (`partFrames`) so a stage authored in a part's local frame lands exactly on the body it constructs.

### 7.8 Overlays and CSS2D labels

**Three overlay layers sit above the canvas inside `#sim-viewport`:**

1. **`CSS2DRenderer.domElement`** — absolutely positioned at `0,0`, `pointer-events: none`. Holds every `.vp-label` `<div>`. Labels are live DOM, never baked sprites: vector-sharp at any zoom, they inherit the design tokens, and a screen reader can read them.
2. **`#vp-angles`** (SVG) — the 30° arcs. Topic 2 only.
3. **`#vp-transfer`** (SVG) — the flying dimension token. Topic 2 only.

Plus DOM chrome floated over the viewport: `#ortho-sheet`, `#phase-strip`, `#chain-strip`, `#vp-orbit-hint`, `#vp-spotlight`, `#vp-flow-note`, `#wizard-toggle`.

Label CSS classes: `.vp-label` base + `--dim` (mono, `--text-xs`, secondary ink, `font-weight: 400`) · `--title` (700, on a white paper pill) · `--face`. The `.is-in` class carries the fade+lift.

### 7.9 Render loop

**Topic 2 — `animate(now)` (`main.js:1402`):**
```js
rafId = requestAnimationFrame(animate);
const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;   // clamp a tab-switch spike
lastFrameTime = now;
tickTweens(delta);                       // anim.js drives EVERY tween from here
if (!cameraRig.isFlying()) controls.update();
shape?.update(camera);                   // re-aim silhouettes / billboards
construction?.update(camera);            // re-aim construction billboards
updateIsoAngles();                       // re-derive the 30° arcs from projected axes
updateFigureTitles();                    // re-derive the title clearance against the live camera
renderer.render(scene, camera);
labelRenderer.render(scene, camera);
```
`startLoop()` / `stopLoop()` guard on a `running` flag so a double start is a no-op.

**Topic 3 — `frame(now)` (`viewport.js:88`):** the same shape, but the per-frame updaters are **subscribers** (`viewport.onFrame(cb)`), and `main.js` registers exactly one: `shape?.update(camera); construction?.update(camera)`. There is no `updateIsoAngles` and no `updateFigureTitles`.

**Every tween in the whole system is driven from the render loop**, never from a private `rAF`. That is what makes `simAPI.pause()` genuinely freeze in-flight motion.

### 7.10 Resize handling

**Topic 2 — `handleResize(container)` (`main.js:1442`)**, driven by a `ResizeObserver` on `#sim-viewport`:
```js
camera.aspect = w / h; camera.updateProjectionMatrix();
renderer.setSize(w, h, false);
labelRenderer?.setSize(w, h);
const bw = renderer.domElement.width, bh = renderer.domElement.height;   // DRAWING BUFFER px
shape?.setResolution(bw, bh);
construction?.setResolution(bw, bh);
dimensions?.setResolution(bw, bh);
isoAngles?.resize(w, h);          // CSS px — these draw OVER the canvas, not into it
transfers?.resize(w, h);
transfers?.clear();               // a resize moves BOTH ends of a transfer in flight
```
The final `transfers.clear()` is deliberate: there is no honest way to re-aim a transfer mid-journey, so runs are abandoned rather than left pointing at stale anchors.

**Topic 3** splits the same work: `viewport.resize()` handles camera/renderer/labelRenderer and re-renders; `main.js`'s `ResizeObserver` then pushes `viewport.size()` into `shape`, `construction` and `dimensions`. **[POTENTIAL ISSUE]** Topic 3 passes `viewport.size()` — which returns `container.clientWidth/clientHeight`, i.e. **CSS pixels** — into `setResolution()`, whereas Topic 2 passes the drawing-buffer size. On a display with `devicePixelRatio > 1` these differ by that factor, so fat-line width would be off on a HiDPI screen after a resize. Recorded, not fixed. Note the initial build is unaffected: both topics seed `LineMaterial.resolution` from `resolution()`, which correctly returns `renderer.domElement.width/height`.

### 7.11 Rebuild / disposal lifecycle

```
change (solid | dimension | unknown-toggle | problem | projection mode | orientation)
  → simController.<method>()
  → rebuild()
      → disposeScene()        dispose rigs → clear CSS2D DOM → dispose stragglers → shapeGroup.clear()
      → resolve data          currentDims()  [T3: + compose() + resolveProjection() + auditComposition()]
      → build geometry        buildShape / buildComposedShape
      → build construction    buildConstruction
      → build annotations     buildDimensions + labels.make(...)
      → draw the sheet        orthoSheet.draw(...)
      → reframe               cameraRig.focusOn(...)
      → notify                notifyStateChange() / bus.notify(state)
  → ui.render(state) | ui.sync(state)
  → applyStepState()          re-assert the current step, no motion, camera untouched
```
`renderer.info.memory` staying flat across repeated rebuilds is the stated acceptance criterion for this contract. Topic 3's `CLAUDE.md` records a headless verification: GL buffers/textures/programs flat at **44 / 4 / 5** across 50 dimension rebuilds and 28 problem loads, with the CSS2D label DOM bounded. **[Documented claim, not re-verified in this investigation.]**

---

## 8. Coordinate Systems and Geometry

### 8.1 The five coordinate systems

| # | System | Units | Origin / axes | Lives in |
|---|---|---|---|---|
| 1 | **Engineering (mm)** | millimetres | y measured **up** from the seating plane; solid centred in plan | `shapeData.js` / `solidCatalog.js` / `problemLibrary.js` — all data |
| 2 | **World (Three.js)** | world units, **1 unit = 10 mm** | y up, right-handed; solid rests on `y = 0`, centred in plan | every rig |
| 3 | **View / sheet (2D mm)** | millimetres | origin at the **view's centre**, `+x` right, `+y` **up** | `views()` primitives |
| 4 | **SVG sheet** | millimetres in a `viewBox` | `y` runs **down** — every drawer flips: `cy - y` | `orthographicDrawer.js` |
| 5 | **Screen / viewport CSS px** | CSS pixels | origin at the viewport rect's top-left, `y` **down** | `isoAngles`, `transferLayer`, `worldToViewport` |

Plus **NDC** as an intermediate: `THREE.Vector3.project(camera)` gives `x,y ∈ [-1, 1]` with `+1` at the top of the frame. It is used directly (not converted to pixels) by `updateFigureTitles`, and converted to viewport pixels by `worldToViewport`.

### 8.2 The conversions, exactly as written

**Engineering → World** — the single boundary, applied at build time and never by rescaling the data:
```js
export const MM_PER_UNIT = 10;                          // helpers.js / shapeData.js
export function toWorld(mm) { return mm / MM_PER_UNIT; }
```

**World → Viewport CSS pixels** (`main.js:522`, Topic 2):
```js
function worldToViewport(v3) {
  const p = v3.clone().project(camera);                 // → NDC
  const r = viewport.getBoundingClientRect();
  return { x: (p.x * 0.5 + 0.5) * r.width,
           y: (-p.y * 0.5 + 0.5) * r.height };          // note the y flip
}
```

**Client → Viewport CSS pixels** (`main.js:529`):
```js
function clientToViewport(pt) {
  const r = viewport.getBoundingClientRect();
  return { x: pt.x - r.left, y: pt.y - r.top };
}
```

**World → NDC height only** (`main.js:578`), the cheap probe the figure title uses:
```js
const probe = new THREE.Vector3();
function ndcHeight(x, y, z) { return probe.set(x, y, z).project(camera).y; }
```

**View (2D mm, +y up) → SVG (y down)** — Topic 2 `renderPrimitive(gr, prim, cx, cy)`:
```
rect    x: cx - w/2,  y: cy - h/2
circle  cx, cy, r
poly    points: `${cx + x},${cy - y}`          ← the flip
line    x1: cx + x1,  y1: cy - y1, …
arc     path M (cx-r) y0 A r r 0 0 sweep (cx+r) y0 Z,  y0 = cy ± r/2
```
Topic 3's `shapeNode(shape)` does the same, plus a per-shape offset: `cx = shape.cx ?? 0`, `cy = -(shape.cy ?? 0)`.

**Plan footprint → world positions** (`constructionEngine.polyPositions`, both topics): a footprint point `[x, z]` in mm at height `y` becomes `(toWorld(x), toWorld(y), toWorld(z))`. Note the footprint's second component is **z**, not y — `polygonPoints` returns `[r·sin(a), r·cos(a)]` as `[x, z]`.

**Footprint → top view** (`polyView`): `pts.map(([x, z]) => [x, -z])` — the top view's screen-up direction is world **−z**.

### 8.3 The isometric constants

```js
export const ISOMETRIC_SCALE = 0.816;    // shapeData.js:623  /  helpers.js:22
```
Documented derivation, identical in both files: an isometric **projection** foreshortens every edge measured along an axis to `cos(35°16′) / cos(30°) ≈ 0.816` of its true length; an isometric **view** keeps true lengths (1 : 1). The construction is identical either way — only the numbers change.

**Where 30° actually comes from in this code.** It is never written as a constant in the geometry. It **emerges** from the camera direction:
```js
DIRECTIONS.isometric = new THREE.Vector3(1, 1, 1).normalize()
AXIS_SPECS dirs: height (0,1,0) · width (-1,0,0) · depth (0,0,-1)
```
From the `(1,1,1)` sight-line the three principal edge directions make equal angles with the picture plane — the definition of the isometric position — and the two receding axes project at 30° to the horizontal while the vertical stays vertical. `isoAngles.js` then **measures** what it draws (`measuredDeg`) rather than asserting 30°, so a regression would show up as a number rather than as a wrong label. The literal string `'30°'` appears only as the `<text>` content.

Topic 1 solves the same honesty problem differently, with the flattened lens:
```js
BASE_FOV       = 45
FLATTEN_FACTOR = 14
FLAT_FOV       = 2 · atan( tan(45°/2) / 14 )     ≈ 2.96°
```
so on-screen size is preserved (`tan(fov/2)` scales with `1/distance`) while the projection becomes effectively parallel. Its comment records that under the working 45° lens the receding edges project at **~36.6°**.

### 8.4 Construction points

**The origin corner** — where every isometric drawing starts, and the anchor for the growth trick:
```js
const origin = new THREE.Vector3(hw, 0, hd);          // both topics
// hw = toWorld(bounds.width)/2,  hd = toWorld(bounds.depth)/2
```
It is the bottom corner **nearest the eye** from the `(1,1,1)` direction. Axis groups and box groups are positioned at it with their geometry written relative to `(0,0,0)`, so scaling the group `0.0001 → 1` draws the lines out of the corner.

**The box, signed from that corner:** `W = -2·hw`, `D = -2·hd`, `H = h`; eight corners, twelve edges.

**Polygon footprints:**
```js
circumradius(side, sides) = side / (2 · sin(π / sides))
inradius(side, sides)     = side / (2 · tan(π / sides))       // Topic 3 only; currently unused
polygonPoints(r, sides, rot) = [ r·sin(rot + 2πi/n), r·cos(rot + 2πi/n) ]   // as [x, z]
ringPoints(r, count)         = the same with rot = 0          // generators of a cone/frustum
rectPoints(hw, hd)           = [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd]]
```

**Segment counts:** construction rings `RING_SEGMENTS = 72`; body lathes `RADIAL_SEGMENTS = 64`; billboards `BILLBOARD_SEGMENTS = 72`; generators drawn by hand `12` (`GENERATORS` in Topic 3; a literal `12` in Topic 2's `shapeData`).

**Markers:** an apex/centre cross is `MARKER_MM = 4` per arm, drawn as three orthogonal segments.

### 8.5 Dimensions — where a number comes from and where it lands

```
question / slider (mm)
  → state.dims                                    raw, exactly as typed
  → resolveDims(...)                              + auto for withheld + derived
  → solid.bounds(d) | overallBounds(parts)        overall w × d × h, still mm
  → toWorld(...)                                  ÷ 10 → world units
  → DIM_SOURCES[i].edge(hw, hd, h)                two world endpoints on a box edge
  → buildAssembly({a, b, push})                   extension lines, dimension line, arrowheads, anchor
  → labels.make(key, `${symbol} ${value} mm`, 'vp-label--dim', anchor)
```
The **text** is always written from the mm value (`round(bounds[axisKey])` in Topic 2, `spec.value` in Topic 3), never from the world geometry — so a dimension states the size of the **object**, not of the picture. Topic 3 makes this explicit in a comment at `main.js:201`: in a projection the drawn length is reduced but the dimension still reads the true size.

Topic 3's construction bounds, by contrast, **are** at drawn size:
```js
const scaled = (mm) => mm * plan.axialScale;
bounds = { width: scaled(model.bounds.width), depth: …, height: … };
```
because every axis and every box edge *is* a length set off along an axis.

---

## 9. UI Architecture

### 9.1 HTML structure

Both topics are a single `index.html`: markup + the complete stylesheet + design tokens, all inline. `<body>` is `display: flex; flex-direction: row; overflow: hidden`.

**Topic 2 body order** (source order, then re-ordered visually by CSS `order`):
```
#sim-fallback           role="alert"  hidden — the boot watchdog's panel
#sim-context-lost       role="status" hidden — WebGL context-loss notice
#mobile-notice          role="status" hidden — "Best experienced on desktop." below 768px
#wizard                 <aside aria-label="Guided steps">
  #step-rail            <ol> six <li.rail__item data-step="1..6">
  #step-card            <section>
    .card__scroll         .card__eyebrow (#step-current / #step-total)
                          h2#step-title · p#step-lead
                          six <section.step-panel data-step="1..6">
    .card__nav            #reset-control (#btn-reset ▸ #reset-confirm ▸ #btn-reset-yes/#btn-reset-cancel)
                          #btn-back · #btn-next
#sim-viewport           <main aria-label="3D simulation viewport. Drag to orbit."> — CSS order: 1
  #wizard-toggle
  #ortho-sheet          <aside class="osheet"> hidden — the SVG sheet mounts here
  #vp-angles            <svg class="vp-angles" aria-hidden>
  #vp-transfer          <svg class="vp-transfer" aria-hidden>
  #phase-strip          .flow-strip hidden — four phase nodes (authored in markup)
  #chain-strip          .flow-strip hidden — five chain nodes (authored in markup)
  #vp-orbit-hint · #vp-spotlight · #vp-flow-note
#sim-status             .sr-only role="status" aria-live="polite"
```

**Topic 3** is the same skeleton with these differences **[CONFIRMED]**:
- `#active-problem` — a card **above** the step card: `#active-problem-statement`, `#active-problem-hints` (`<ol>#active-problem-hint-list`), and `#active-problem-hint-btn` / `#active-problem-hide-btn` / `#active-problem-exit-btn` with its own two-state `#active-problem-exit-confirm`.
- `#open-problem-library` (`.library-entry`, `aria-haspopup="dialog"`) in the card header.
- `#verdict-bar` (`.card__verdict`) holding `#verification-summary` — deliberately **outside** `.card__scroll`, alongside the nav, so the one-line result is always in view; only `#verification-findings` and `#verify-note` scroll.
- `#btn-next-problem` — the terminal step's forward door, the exact mirror of `#btn-next`'s visibility.
- `#problem-library` — a `role="dialog" aria-modal="true"` full-viewport overlay with `#problem-library-close` and `#problem-library-list`.
- `#step-rail` is an **empty `<ol>`** built by `stepper.buildRail()` from the step list, not authored in markup.
- `.step-panel` elements are keyed by **step id** (`data-step="choose-solid"`), not by number.
- `#phase-strip` is an **empty div** built by `main.buildPhaseStrip()` from `PHASES`.
- `#vp-angles` and `#vp-transfer` exist as bare `<div>`s but **nothing mounts into them** (see §14/§19).
- **No `#wizard-toggle`** — the wizard cannot be collapsed in Topic 3.
- `#sim-fallback` gains `#sim-fallback-detail`, and `__showSimFallback(variant, err)` takes a second argument.

### 9.2 CSS

Entirely inline, in one `<style>` block per topic. Structure: `@font-face` × 3 → `:root` token block → reset → `#sim-viewport` → chrome components → viewport overlays → media queries.

The `:root` block is the **single source of truth for every colour**, and `src/tokens.js` reads it back at runtime. **No JS file in either topic contains a colour literal** — verified by reading `tokens.js`, `shapeFactory.js`, `constructionEngine.js`, `dimensionLayer.js`, `geometryFactory.js`.

Media queries present: `(hover: hover) and (pointer: fine)` for hover states, `(max-width: 900px)` for layout stacking, `(min-width: 768px)` to hide `#mobile-notice`, and `(prefers-reduced-motion: reduce)` to kill transitions.

**Chrome-Only Blue** is the governing colour rule: `--color-accent` (`#1f66b5`) appears only in the chrome. Viewport *meaning* is carried by ink linework, the neutral construction grey, and the HP/VP/PP domain encodings.

### 9.3 Controls

Every control is a platform component used as-is; neither topic invents a UI pattern or adds a token.

| Component | Class | Used for |
|---|---|---|
| Select | `.field__select` | `#solid-select` |
| Slider + numeric pair | `.field` › `.field__label` (`.field__symbol` + `.field__name`) › `.field__row` (`.field__range` + `.field__num` + `.field__unit`) | every dimension |
| Optional-dimension checkbox | `.field__optional` › `.field__check` + `.field__check-label` | "Specify …" |
| Auto/unknown copy | `.field__auto` · `.field__auto-value` · `.field__auto-note` | a withheld size |
| Segmented control | `.segmented` › `.segmented__btn` | `#form-modes` |
| Flow strip | `.flow-strip` › `.flow-strip__node` (+ `.flow-strip__letter`) / `.flow-strip__arrow` | phases, chain |
| Hint callout | `.hint` › `.hint__text` | `#phase-stage-note` |
| Buttons | `.btn` + `--primary` / `--ghost` / `--nav` | throughout |
| Readout rows | `.bounds-row` › `__name` + `__value` | `#dim-summary` |
| Findings | `.finding` + `--pass` / `--pending` / `--fail` | Topic 3 verification |
| Problem cards | `.problem-card` › `__title` + `__hint` + `__difficulty`, in `.problem-grid` inside `.problem-group` | Topic 3 browser |

### 9.4 Buttons

- **Reset** is a ghost button behind an **inline two-state confirm**: the first click swaps it for a "Reset everything?" prompt (`#reset-confirm`) with Yes / Cancel; only Yes wipes, and it wipes through `window.simAPI.reset()` — **the single reset path**. Arming adds `.is-reset-armed` to `.card__nav`, which stands Back/Next aside so a stray click cannot land on Next while the learner is answering. Topic 3 also moves focus to Yes on arm and back to Reset on cancel.
- **Back / Next** — 88 px pair, right-aligned. Back is hidden at step 1, Next at the terminal step.
- Topic 3's **Exit Problem** uses the identical two-state confirm pattern, and `render()` re-arms it closed for every fresh subject so a confirm left open can never strand across a load.
- Topic 3's **Next problem** replaces Next at the terminal step; the stepper owns only its visibility (`hidden = !terminal`), and its action — open the library — is wired in `uiManager`, so the generic stepper never learns what a "problem" is.

### 9.5 Sliders

`buildField(...)` two-way binds a `range` and a `number` input. `commit(raw, {fromText})`:
```js
const parsed = Number(String(raw).replace(',', '.'));   // tolerate a decimal comma
if (!Number.isFinite(parsed)) { num.value = range.value; return; }   // revert, never scold
const v = clamp(Math.round(parsed / step) * step);
range.value = num.value = String(v);
range.setAttribute('aria-valuetext', `${v} ${unit}`);
sim.setDim(key, v);
if (fromText && v !== parsed) sim.announce(`${label} kept at ${v} ${unit}, the nearest allowed value.`);
```
`range` fires on `input` (continuous drag); `num` fires on `change` (commit). An invalid entry quietly reverts rather than turning alarming red.

`.field__symbol` carries the engineering notation and is `aria-hidden` — the plain-English `.field__name` beside it already says it in words.

### 9.6 Stepper

Rail + card + nav. Topic 2's rail is authored in markup and only *styled* by the stepper; Topic 3's is **built** from the step list. Both apply `is-current` / `is-complete` / `is-upcoming`, swap the marker to `✓` when complete, set `aria-label` to `Step {n}, {name}, {current step|completed, go to step|locked}` and `aria-current="step"` on the live one, and disable locked buttons. `.card__scroll` scrollTop resets to 0 on every step change. `.step-panel.is-active` re-triggers a `panelIn` keyframe so the new panel fades up.

### 9.7 Problem selector (Topic 3)

**The browser** — `#problem-library`, a `role="dialog" aria-modal="true"` full-viewport overlay:
- `renderList()` walks `groupByCategory(allProblems())` → one `.problem-group` per category (heading + blurb) → a `.problem-grid` of `.problem-card` buttons carrying `data-problem-id`.
- Each card shows **title · the question verbatim · difficulty** and nothing else. The description **is** the question, not a paraphrase — a learner should recognise the problem they want by its own words. `problem.source` is carried in the data but deliberately **not rendered**.
- `openBrowser()` calls `window.simAPI.pause()` — the overlay covers the live viewport, so the rAF loop stops — and focuses the close button. `closeBrowser()` resumes and returns focus to the entry button. The overlay is a **selector, not a second application**: camera, step, dimensions and the whole scene graph are exactly as they were when it closes.
- `onOverlayKeydown` implements Escape-to-close plus a **focus trap** cycling `button, input` that are enabled and laid out.
- Selection is delegated: one listener on `#problem-library-list` reads `e.target.closest('[data-problem-id]')`.

**The Step-1 picker** — `renderSolidPicker(state)` builds two `<optgroup>`s: "This question" (only while a textbook problem is loaded, and a multi-part problem is labelled `"{title} (combination)"`), and "Free practice" (the ten). While a textbook question is loaded the select is **disabled** (`#solid-locked-note` shown) because switching would silently abandon the problem; the escape is the one confirmed control, Exit Problem.

**The problem card** — statement written with `textContent` so nothing can reformat it; Hide Text collapses the **statement only** (the label and controls stay, so the card never vanishes out from under the button operating it) and folds any revealed hints away with it; hints reveal **one at a time** via `revealNextHint()`, and once all are shown the button toggles show/hide.

### 9.8 Labels

Three registers: viewport CSS2D labels (`.vp-label--dim` / `--title` / `--face`), SVG sheet captions (`.osheet__caption`, plus Topic 2's `X`/`Y` end marks and `VP`/`HP` plane tags), and chrome text.

### 9.9 Panels

`.step-panel[data-step]` — one per step, `hidden` toggled by the stepper. Body copy, controls, and inline `.term` popovers live in the markup; only the rail/card headline text comes from the data module, so the two never fight over ownership.

Docks inside the panels: `#solid-select` + `#solid-blurb` (Step 1), `#dim-fields` + `#dim-summary` (Step 2), `#phase-note` + `#phase-stage-note` (Step 4), `#form-modes` + `#form-table` + `#form-note` (Step 5), `#chain-note` + `#summary-closing` (Step 6). Topic 3 replaces Steps 5–6's contents with `#form-modes` (built by `uiManager`) and `#verification-findings` + `#verify-note` + `#verdict-bar`.

### 9.10 Responsive behaviour

- **Below 768 px:** a dismissible `#mobile-notice` — "Best experienced on desktop." Topic 2 wires it to a live `matchMedia` listener with a `dismissed` latch; Topic 3 checks `window.innerWidth < 768` **once** at boot. **[CONFIRMED divergence]**
- **Below 900 px:** layout stacking; `.flow-strip` wraps and centres.
- **`prefers-reduced-motion: reduce`:** CSS transitions are killed *and* every JS duration is forced to `0`. The state still **lands** — this is checked in `tween()` (`anim.js:174`), `createSequencer.play()`, `cameraRig.flyTo()`, `labelLayer.set()` and `transferLayer.fly()`.
- **Topic 2 only:** `#wizard-toggle` collapses the whole wizard (`body.wizard-collapsed`), then calls `handleResize` on the next frame so the canvas takes the reclaimed width.
- Every interactive target is sized ≥ 44 px.

---

## 10. State Management

### 10.1 Where state lives — Topic 2

There is no state module. State is **five module-level bindings in `main.js`** plus each leaf's private state.

```js
const state = {                       // main.js:79 — the ONLY learner-owned state
  solidId:     SOLIDS[0].id,          // 'cube'
  dims:        defaultDims(SOLIDS[0]),// { edge: 50 } — raw, exactly as typed
  unspecified: {},                    // key → true where the learner declared it UNKNOWN
  phase:       null,                  // 'a'|'b'|'c'|'d'|null — Step 4's live phase
  formMode:    'view',                // 'view' | 'projection' — Step 5
  chain:       null,                  // Step 6's live chain link
};
```
Other `main.js` state, all derived or presentational:

| Binding | Owner | Purpose |
|---|---|---|
| `renderer` · `labelRenderer` · `scene` · `camera` · `controls` · `viewport` | `buildScene` | the scene |
| `shapeGroup` | `buildScene` | **the one disposal target** |
| `shape` · `construction` · `dimensions` | `rebuild()` | live rigs, rebuilt and disposed together |
| `orthoSheet` · `cameraRig` · `labels` · `ui` · `stepper` · `onboarding` · `sequencer` · `isoAngles` · `transfers` | `init()` | leaf handles |
| `dimAnchors: Map` | `buildDimensionAnnotations` | dimension key → world anchor (so a transfer flies to exactly where the callout will appear) |
| `visibleDims: Set` | `setDim` | which dimensions are on screen — read by the figure-title placement |
| `dimAlias: Map` | `buildDimensionAnnotations` | box-edge key → the key that actually carries it |
| `selectedView` | `selectView` | Step 3's live view, or `null` |
| `liveTweens: Map` | `animateValue` | one live tween per animated target |
| `sequencerBeats[]` / `chromeBeats[]` | scene / chrome controllers | two separate timer lists |
| `stateChangeSubs: Set` | `onStateChange` | the change bus |
| `running` · `rafId` · `lastFrameTime` | loop | |

**Leaf-private state:** `stepper` owns `currentStep` + `visited`; `uiManager` owns `fields: Map`; `cameraRig` owns `center`, `radius`, `flying`, `handle`; `labelLayer` owns `labels: Map` + `timers: Map`; `orthographicDrawer` owns `svg`, `selectedKey`, `viewGroups`; `sequencer` owns `token`, `running`, `timers`; `isoAngles` owns `shown` + `measuredDeg`; `transferLayer` owns `live: Set`; `anim.js` owns a module-level `active: Set`.

### 10.2 Where state lives — Topic 3

`src/state.js` is a dedicated module, and it enforces one rule: **nothing derived is ever stored.**

```js
initialState(problemId) → {
  problemId,                                   // the active subject — never null in normal use
  stepIndex: 1,
  phaseId: null,
  dims: {},                                    // the learner's numbers, exactly as typed
  unspecified: {},
  projectionMode: 'view',
  orientationId: null,
  selection: { viewKey: null, partId: null },
  ui: { libraryOpen: false, hintsShown: 0, statementHidden: false },
  verification: { checked: false, findings: [] },
}
```
The file header lists what is **deliberately not stored**, and why it keeps being asked for: the problem's statement, hints, difficulty and parameters are all `getSubject(problemId)` lookups against frozen data — copying them in would give the sim two answers to "what does this question say". Also not stored: the camera pose (the rig owns it, and it is the learner's), anything the resolvers can compute, and anything the DOM already holds.

Derived-every-time: `problem()`, `currentDims()`, `model`, `plan`, `model.bounds`, the step list, and the findings.

`main.js` holds two live-rig bindings that are *not* in `state` — `model` and `plan` — plus:
```js
const progress = { phasesDone: [], stagesDone: [] };   // what the learner has actually worked through
```
This is the validator's view of progress. It is **outside** `state` and is reset by `loadProblem`.

`createBus()` is a plain `Set` of callbacks with `subscribe` / `notify` / `clear`.

### 10.3 Who owns what

| Concern | Owner | Notes |
|---|---|---|
| Learner values (solid/problem, dims, unspecified, mode) | `state` in `main.js` | mutated **only** by `simController` methods |
| Scene graph | `main.js` via `rebuild()` | no control ever touches it |
| Camera pose | `cameraRig` | not in `state` — it is the learner's |
| Current step | `stepper` (private `currentStep` + `visited`) | `main.js` reads it via `stepper.step()` / `stepper.stepId()` |
| Live phase | `state.phase` / `state.phaseId` | written by `goPhase` |
| Dock DOM | `uiManager` | the single owner (Topic 3 also owns the browser, card and panel) |
| Label DOM | `labelLayer` | |
| Sheet SVG | `orthographicDrawer` | |
| Timers | `sequencer` + the two beat arrays (T2) / `chromeBeats` (T3) | |
| Progress for validation | `progress` in `main.js` (T3 only) | |

### 10.4 How state changes — the one-way path

```
control event
  → simController.<method>(args)        the ONLY mutation site
  → state.<field> = …
  → rebuild()                           dispose → resolve → build → notify
  → ui.render(state) | ui.sync(state)
  → applyStepState() | enterStep(n)
  → subscribers read back (bus / stateChangeSubs)
```
No subscriber writes during a notification. No control mutates the scene.

**The full controller surface:**

| Topic 2 `simController` | Effect |
|---|---|
| `setSolid(id)` | new solid → `defaultDims`, clear `unspecified`, `rebuild()`, `ui.render`, `enterStep(current)` |
| `setDim(key, value)` | `rebuild()`, `ui.sync`, `applyStepState()` |
| `setDimSpecified(key, on)` | `rebuild()`, `ui.render` (the field *set* changes shape), `applyStepState()` |
| `enterStep(n)` · `announce(msg)` · `flowNote(msg)` · `onStateChange(cb)` | |

| Topic 3 `simController` | Effect |
|---|---|
| `loadProblem(id)` | the single load path for both subject kinds (§6.4) |
| `exitProblem()` | `loadProblem(DEFAULT_PRACTICE_ID)` |
| `setDim(key, value)` | `rebuild()`, `ui.sync`, `applyStepState()` |
| `setDimSpecified(key, on)` | `rebuild()`, `ui.render`, `applyStepState()` |
| `setProjectionMode(mode)` | `rebuild()`, `ui.render`, `applyStepState()` |
| `setStatementHidden(on)` | **pure chrome** — touches no geometry, never reaches `rebuild()` |
| `setOrientation(id)` | `rebuild()`, `applyStepState()` — **[POTENTIAL ISSUE: never called; see §14]** |
| `steps()` · `dimSpecs()` · `subject()` · `enterStep` · `announce` · `onStateChange` | read accessors |

### 10.5 What triggers rebuilds vs renders

| Trigger | `rebuild()`? | Scene re-assert |
|---|---|---|
| Solid / problem change | **yes** | `enterStep(current)` / `stepper.reload()` → Step 1 |
| Dimension edit | **yes** | `applyStepState()` — *re-assert, never restart* |
| Specify/unknown toggle | **yes** | `applyStepState()` + full dock re-render |
| Projection mode (T3) | **yes** | `applyStepState()` |
| Orientation (T3) | **yes** | `applyStepState()` |
| `simAPI.reset()` | **yes** | `stepper.reset()` → Step 1 |
| `webglcontextrestored` | **yes** | `enterStep(current)` |
| Step change | no | `enterStep(n)` |
| Phase change | no | `goPhase(id)` |
| Form toggle (T2 Step 5) | no | `applyFormMode` scales the **same** geometry |
| View selection (Step 3) | no | `highlightFace` + camera flight |
| Hide Text / hints (T3) | no | chrome only |
| Resize | no | `handleResize` / `viewport.resize` |

The distinction that matters most: **a dimension edit rebuilds geometry but does not re-enter the step.** Replaying the camera flight and reveal animations on every slider tick would strobe the viewport and make a slow drag feel broken.

### 10.6 How step completion is determined

- **Topic 1 and Topic 2:** reachability only. `visited` in `stepper.js`; a step becomes reachable once entered, upcoming steps stay locked. There is **no completion state, no scoring, no gate**.
- **Topic 3:** the same reachability, **plus** a separate progress record fed to the validator:
  - `progress.phasesDone[]` — appended by `goPhase(id)` on first reach.
  - `progress.stagesDone[]` — appended by `showStage(index)` with the stage's `stageId`.
  - Both reset by `loadProblem`.
  - `checkConstructionOrder` collapses repeats before judging: it maps each canonical phase to `done.indexOf(id)` and requires that sequence to be strictly increasing, so a learner may re-run a phase without failing.
  - `checkCompletion` compares `answerData.requiredStages` against `new Set(progress.stagesDone)`.
  - `state.verification = { checked, findings }` records the last run.

`runVerification()` fires on entering `whole-process`, and again on **every** `bus.notify` while that step is live:
```js
bus.subscribe(() => { if (stepper?.stepId() === 'whole-process') runVerification(); });
```
So a dimension edit at Step 6 immediately re-checks the answer.

### 10.7 How problem selection affects state

Loading a subject resets almost everything (see §6.4): `problemId`, `dims`, `unspecified`, `projectionMode`, `orientationId`, `verification`, `ui.statementHidden`, both `progress` arrays, and — via `stepper.reload()` — `visited` and the current step.

What it does **not** reset: the camera (`cameraRig` is re-framed by `rebuild()`'s `focusOn` but not flown until `enterStep(1)` runs), `state.selection.viewKey`, and `uiManager`'s local `hintsShown` (reset separately by `resetHints()` inside `renderProblemHeader`).

`simAPI.reset()` in Topic 3 is `Object.assign(state, initialState(DEFAULT_PRACTICE_ID))` followed by `loadProblem(state.problemId)` — **seeding through the one load path** rather than by hand, so a reset lands in exactly the state a fresh boot lands in, including the opening solid's own stated sizes.

---

## 11. File Dependency Map

Every import below was read from source, not inferred from filenames. "Imported By" lists only files **within the same topic folder** — there are no cross-topic imports anywhere.

### 11.1 Topic 2 — `graphics_module_4_topic_2_isometric_construction`

| File | Responsibility | Imports | Imported By | Important Functions / Exports |
|---|---|---|---|---|
| `index.html` | Markup, full stylesheet, `:root` design tokens, import map, boot watchdog | — (loads `main.js` as a module) | — | `window.__showSimFallback`, `window.__simBootTimer` |
| `main.js` | Orchestrator: scene, camera, controls, CSS2D overlay, the single `rebuild()`, `enterStep`, `goPhase`, Step-5 forms, Step-6 replay, `window.simAPI` | `three`; `three/addons/controls/OrbitControls.js`; `three/addons/renderers/CSS2DRenderer.js`; all 15 `./src/*.js` | — (entry point) | `init` · `buildScene` · `rebuild` · `disposeScene` · `enterStep` · `applyStepState` · `goPhase` · `showAxes`/`hideAxes` · `showBox`/`hideBox` · `showStage`/`hideStages` · `showFinishedSolid`/`hideFinishedSolid` · `buildDimensionAnnotations` · `setDim`/`setAllDims` · `transferDimension` · `highlightFace` · `selectView` · `enterFormComparison` · `applyFormMode` · `formScaleFor` · `syncFormChrome` · `renderFormRows` · `renderSolidFormNote` · `setFormMode` · `playSummary` · `markChain` · `markPhase` · `setStageNote` · `resetSceneLayers` · `showSheet` · `showStrip` · `updateFigureTitles` · `updateIsoAngles` · `isoAlignment` · `worldToViewport` · `clientToViewport` · `ndcHeight` · `contentFocus` · `animate` · `handleResize` · `setupResetControl` · `setupStepControls` · `simController` |
| `src/shapeData.js` | **THE DATA MODEL** — ten solids; the mm↔world converter; `ISOMETRIC_SCALE`; the unknown-dimension boundary | — (imports nothing) | `main.js`, `constructionEngine.js`, `shapeFactory.js`, `uiManager.js` | `SOLIDS` · `MM_PER_UNIT` (10) · `toWorld` · `ISOMETRIC_SCALE` (0.816) · `getSolid` · `defaultDims` · `resolveDims` · `axisSymbol` · `optionalDims`\* · `dimensionSymbols`\* · `circumradius` · `polygonPoints` |
| `src/shapeFactory.js` | Body spec → mesh + fattened ink edges + view-dependent silhouettes; top-spread probe | `three`; `three/addons/lines/*` ×3; `./shapeData.js`; `./tokens.js` | `main.js` | `buildShape(spec, resolution)` → `{ group, setOpacity, setEdgesVisible, setResolution, update, dispose }` · `topHalfExtent(spec)` · (private) `buildGeometry` · `silhouetteSpec` · `billboardPositions` |
| `src/constructionEngine.js` | Bounds + stages → three axes, bounding box, per-solid stage linework, three face highlights | `three`; `three/addons/lines/*` ×3; `./shapeData.js`; `./tokens.js` | `main.js` | `buildConstruction({solid, dims, resolution})` → `{ group, origin, bounds, axes, box, stages, faces, billboards, setResolution, update, dispose }` · `AXIS_SPECS` · (private) `primitivePositions` and eight `*Positions` helpers |
| `src/dimensionLayer.js` | BIS Type-B dimension assemblies: extension lines, dimension line, filled 3:1 arrowheads, value anchor | `three`; `three/addons/lines/*` ×3; `./tokens.js` | `main.js` | `buildDimensions({specs, resolution})` → `{ group, items, setResolution, dispose }` · (private) `buildAssembly` |
| `src/orthographicDrawer.js` | The first-angle SVG sheet: three focusable views, projection lines, XY datum, VP/HP tags | — (no imports) | `main.js` | `initOrthoSheet(mount)` → `{ draw, highlight, viewRect, viewCenter, selected\*, onSelect, setDrawn, dispose\* }` · (private) `renderPrimitive` |
| `src/isoAngles.js` | Phase A's two 30° arcs, as a screen-space SVG overlay re-derived every frame | — (imports nothing, deliberately) | `main.js` | `initIsoAngles(svg)` → `{ resize, update, set, visible, measured\*, dispose\* }` |
| `src/transferLayer.js` | Phase B's dimension carrier: dashed leader + ruled token flying view → axis | `./anim.js` | `main.js` | `initTransferLayer(svg, {prefersReducedMotion})` → `{ resize, fly, clear, inFlight\*, dispose }` |
| `src/cameraRig.js` | Named viewing DIRECTIONS + per-rebuild framing radius; every move an eased flight | `three`; `./anim.js` | `main.js` | `initCameraRig({camera, controls, prefersReducedMotion})` → `{ focusOn, pose, flyTo, flyToNamed\*, retarget, snapTo, cancel, isFlying, framing\* }` · `DIRECTIONS` |
| `src/labelLayer.js` | CSS2D label factory + the ONE placement policy | `three`; `three/addons/renderers/CSS2DRenderer.js` | `main.js` | `initLabelLayer(scene, opts)` → `{ make, place\*, placeFigureTitle, moveTo, set, setText\*, has\*, remove, hideAll, clearAll, keys }` · `PLACEMENT` |
| `src/uiManager.js` | The parameter dock: Step-1 solid picker, Step-2 dimension fields, the overall-size readout | `./shapeData.js` | `main.js` | `initUIManager(sim)` → `{ render, sync }` · (private) `buildField` · `syncSummary` |
| `src/stepper.js` | Guided-stepper controller: rail + card + Back/Next; calls `sim.enterStep(n)` | `./constructionSteps.js` | `main.js` | `initStepper(sim)` → `{ sync\*, reset, step, goTo\*, dispose\* }` |
| `src/constructionSteps.js` | **DATA** — the six-step rail/card copy and the four construction phases | — | `main.js`, `stepper.js` | `STEPS` · `PHASES` · `getPhase` |
| `src/summaryAnimator.js` | The abortable, token-guarded timeline + the summary timing/chain data | — | `main.js` | `createSequencer({prefersReducedMotion})` → `{ play, stop, isRunning\* }` · `SUMMARY_TIMING` · `SUMMARY_CHAIN` |
| `src/tokens.js` | **STATELESS UTIL** — CSS custom property → `THREE.Color`; the named line weights | `three` | `main.js`, `shapeFactory.js`, `constructionEngine.js`, `dimensionLayer.js` | `cssVar` · `cssColor` · `roleColor` · `WEIGHT` · `ROLE_COLOR` |
| `src/anim.js` | The shared tween + easing engine, stepped from the render loop | — | `main.js`, `cameraRig.js`, `transferLayer.js` | `tween` · `tick` · `cancelAll` · `cubicBezier` · `easeStandard` · `easeFold` · `easeCamera` · `easeDraw` · `easeDissolve` |
| `src/terms.js` | Markup-driven inline term popovers | — | `main.js` | `initTerms()` |
| `src/onboarding.js` | One-time "Drag to rotate" orbit hint + contextual cue chips | — | `main.js` | `initOnboarding(controls)` → `{ setSolidPresent, … }` |

`*` = exported/returned but **not called anywhere in the topic** (see §14.3).

### 11.2 Topic 3 — `graphics_module_4_topic_3_isometric_projection_problem_library`

| File | Responsibility | Imports | Imported By | Important Functions / Exports |
|---|---|---|---|---|
| `index.html` | Markup, full stylesheet, tokens, import map, boot watchdog | — | — | `window.__showSimFallback(variant, err)` |
| `main.js` | Conductor: the single `rebuild()`, `enterStep`, `goPhase`, the state object, the bus, `window.simAPI`. **Not** the scene owner | `three`; 19 `./src/*.js` | — (entry point) | `init` · `rebuild` · `disposeScene` · `enterStep` · `applyStepState` · `goPhase` · `markPhase` · `buildPhaseStrip` · `showStrip` · `showAxes`/`hideAxes` · `showBoxes`/`hideBoxes` · `showStage`/`showAllStages`/`hideStages` · `showFinishedSolid`/`hideFinishedSolid` · `buildDimensionAnnotations` · `contentFocus` · `resetSceneLayers` · `showSheet` · `runVerification` · `setupResetControl` · `simController` · `problem()` · `currentDims()` |
| `src/problemLibrary.js` | **DATA** — 14 textbook problems (verbatim statements) + 4 categories + the schema typedefs | `./helpers.js` | `problemQuery.js`, `uiManager.js` | `PROBLEMS` · `CATEGORIES` · `getProblem` · `getCategory` · `groupByCategory` |
| `src/practiceSolids.js` | **DATA** — the ten free-practice solids in the problem schema, minus question/answerData/hints | `./helpers.js` | `problemQuery.js`, `main.js` | `PRACTICE_SOLIDS` · `DEFAULT_PRACTICE_ID` · `getPracticeSolid` |
| `src/problemQuery.js` | The query layer and the **only** junction between the two subject sources | `./problemLibrary.js`; `./practiceSolids.js` | `main.js`, `uiManager.js` | `allProblems` · `allPracticeSolids` · `getSubject` · `isTextbookProblem` |
| `src/solidCatalog.js` | **STATELESS UTIL** — the six PART_KINDS vocabulary + the rotation-token resolver | `./helpers.js` | `solidComposer.js` | `PART_KINDS` · `getPartKind` · `isTrueDiameterKind`\* · `resolveRotation` · re-exports `circumradius` |
| `src/solidComposer.js` | Parts + placement → one composed model; the physical-honesty audit | `./solidCatalog.js`; `./helpers.js` | `main.js` | `compose(problem, dims, {orientationId})` · `auditComposition(model)` · (private) `resolveParams` · `overallBounds` · `flattenStages` · `composeViews` · `composeDimSpecs` · `rotateShape` · `ORIENTATIONS` |
| `src/dimensionResolver.js` | specified · derived · optional · unknown → ONE flat set | — (no imports) | `main.js`, `uiManager.js` | `resolveDims` · `defaultDims` · `withheldDims` · `optionalDims` · `dimSymbol`\* |
| `src/projectionResolver.js` | The 0.816 law and the sphere's exemption from it | `./helpers.js` | `main.js`, `uiManager.js` | `resolveProjection` · `initialProjectionMode` · `modeTitle` · re-exports `ISOMETRIC_SCALE` |
| `src/answerValidator.js` | **PURE** — composed model + `answerData` → findings | `./helpers.js` | `main.js` | `validate` · `summarise` · re-exports `CHECK_TOLERANCE_MM` · (private) six checkers + `CHECKERS` registry |
| `src/stepDefinitions.js` | **DATA** — Topic 2's six steps (id-keyed) + the four phases | — | `main.js` | `STEPS` · `PHASES` · `getPhase` |
| `src/state.js` | The one state object + the change bus | — | `main.js` | `initialState(problemId)` · `createBus()` |
| `src/viewport.js` | **Scene ownership** — renderer, scene, camera, OrbitControls, CSS2D overlay, frame loop | `three`; `three/addons/controls/OrbitControls.js`; `three/addons/renderers/CSS2DRenderer.js`; `./anim.js`; `./tokens.js` | `main.js` | `initViewport(container, opts)` → `{ scene, camera, controls, shapeGroup, renderer, resolution, size, onFrame, setDampingGuard, start, stop, resize, render, isRunning, dispose }` |
| `src/geometryFactory.js` | Composed model → per-part meshes, ink edges, silhouettes; the two-group placement/body rig | `three`; `three/addons/lines/*` ×3; `./helpers.js`; `./tokens.js` | `main.js` | `buildComposedShape(model, plan, resolution)` → `{ group, parts, setOpacity, setPartOpacity, setEdgesVisible, setResolution, update, dispose }` · `topHalfExtent`\* |
| `src/constructionEngine.js` | Axes + **one box per part** + stages bottom-up + face highlights | `three`; `three/addons/lines/*` ×3; `./helpers.js`; `./tokens.js` | `main.js` | `buildConstruction({model, plan, resolution})` → `{ group, origin, bounds, axes, boxes, stages, faces, billboards, setResolution, update, dispose }` · `AXIS_SPECS` · (private) `makeBox`, `edgePositions` + the same primitive helpers |
| `src/dimensionLayer.js` | Type-B dimension assemblies — **byte-identical to Topic 2's** | `three`; `three/addons/lines/*` ×3; `./tokens.js` | `main.js` | `buildDimensions({specs, resolution})` |
| `src/orthographicDrawer.js` | The schematic first-angle SVG sheet — simplified, static, composed-model-aware | `./helpers.js` | `main.js` | `initOrthoSheet(host)` → `{ draw, highlight, setDrawn (no-op), onSelect, dispose }` · (private) `shapeNode` |
| `src/cameraRig.js` | **byte-identical to Topic 2's** | `three`; `./anim.js` | `main.js` | `initCameraRig(...)` |
| `src/labelLayer.js` | **byte-identical to Topic 2's** | `three`; `three/addons/renderers/CSS2DRenderer.js` | `main.js` | `initLabelLayer(...)` · `PLACEMENT` |
| `src/uiManager.js` | Problem browser, solid picker, problem card, given-data dock, verification panel | `./problemLibrary.js`; `./problemQuery.js`; `./dimensionResolver.js`; `./projectionResolver.js`; `./helpers.js` | `main.js` | `initUIManager(sim)` → `{ render, sync, renderFindings, openBrowser, closeBrowser, isBrowserOpen, optionalDims\*, dispose\* }` · (private) `buildField` · `renderSolidPicker` · `renderProblemHeader` · `renderFormControl` · `syncSummary` · `syncStatementVisibility` · `armExit` · `resetHints` · `revealNextHint` · `renderList` · `onOverlayKeydown` |
| `src/stepper.js` | Generic stepper — builds the rail **from** the step list; never sees a problem | — (no imports) | `main.js` | `initStepper(sim)` → `{ sync, reload, reset, step, stepId, steps, goTo\*, dispose\* }` |
| `src/helpers.js` | **STATELESS UTIL** — scale, tolerance, polygon maths, formatting | — | 8 files: `answerValidator`, `constructionEngine`, `geometryFactory`, `orthographicDrawer`, `practiceSolids`, `problemLibrary`, `projectionResolver`, `solidCatalog`, `solidComposer`, `uiManager`, `main.js` | `MM_PER_UNIT` · `toWorld` · `ISOMETRIC_SCALE` · `CHECK_TOLERANCE_MM` · `circumradius` · `inradius`\* · `polygonPoints` · `ringPoints` · `rectPoints` · `round1` · `humanList` |
| `src/tokens.js` | **byte-identical to Topic 2's** | `three` | `viewport.js`, `geometryFactory.js`, `constructionEngine.js`, `dimensionLayer.js` | `cssVar` · `cssColor` · `roleColor` · `WEIGHT` · `ROLE_COLOR` |
| `src/anim.js` | **byte-identical to Topic 2's** | — | `main.js`, `cameraRig.js`, `viewport.js` | `tween` · `tick` · `cancelAll` · easing curves |
| `src/terms.js` / `src/onboarding.js` | **byte-identical to Topic 2's** | — | `main.js` | `initTerms()` / `initOnboarding(controls)` |

`*` = exported/returned but not called anywhere in the topic.

### 11.3 Topic 1 — `graphics_module_4_topic_1_introduction_to_isometric_drawing`

| File | Responsibility | Imports | Imported By | Important Functions |
|---|---|---|---|---|
| `main.js` | Orchestrator: scene built once, camera POSES, CSS2D labels, the ortho sheet, `goFlowStage`, the transfer layer, the `#iso-annotation`, `simAPI` | `three`; addons; all 5 `./src/*.js` | — | `init` · `buildScene` · `rebuild` · `enterStep` · `setActiveSolid` · `flyCamera` · `goFlowStage` · `markFlowStage` · `worldToScreen` · `sheetViewCenter` · `drawLeader` · `showSheet` · `highlightSheetView` · `setLabel` · `drawGuide` · `fadeSeg` · `fadeCube` · `clearConstruction` |
| `src/solidRig.js` | Builds the pyramid, the cube, a second cube, the three axes, twelve guide segments, three face outlines | `three`; addons | `main.js` | (rig builder) |
| `src/isoSteps.js` | **DATA** — the six-step rail/card copy | — | `stepper.js` | `STEPS` |
| `src/stepper.js` | Guided-stepper controller | `./isoSteps.js` | `main.js` | `initStepper(sim)` |
| `src/terms.js` · `src/onboarding.js` · `src/anim.js` | Popovers · onboarding · tweens (byte-identical to Topics 2/3) | — / — / — | `main.js` | |

### 11.4 Copy relationships (MD5-verified)

| File | T1 | T2 | T3 | Module2 master |
|---|---|---|---|---|
| `src/anim.js` | `9794e57…` | `9794e57…` | `9794e57…` | `c5779a0…` (CRLF) |
| `src/terms.js` | `06d7767…` | `06d7767…` | `06d7767…` | — |
| `src/onboarding.js` | `61c9b5b…` | `61c9b5b…` | `61c9b5b…` | — |
| `src/tokens.js` | — | `d27950e…` | `d27950e…` | — |
| `src/cameraRig.js` | — | `e48be9a…` | `e48be9a…` | — |
| `src/labelLayer.js` | — | `77da65d…` | `77da65d…` | — |
| `src/dimensionLayer.js` | — | `a989f0d…` | `a989f0d…` | — |

**[CONFIRMED]** `anim.js` differs from the Module2 master **only in line endings** — `tr -d '\r'` on both produces the identical hash `9794e57…`. Module2's copy is CRLF; all three Module-4 copies are LF. The `CLAUDE.md` claim "byte-identical to Module 2's" is therefore true in content but false byte-for-byte. Root `CHANGELOG.md`:161 independently records this drift.

---

## 12. Execution / Data Flow

### 12.1 Topic 2 — a dimension edit (the most frequent path)

```
User drags .field__range
  → uiManager  range 'input' listener
  → uiManager  commit(range.value)                        clamp + snap to step + write both inputs
  → simController.setDim(key, v)                          main.js:1596
      ├─ if (state.dims[key] === v) return                early-out — no work on a no-op
      ├─ state.dims[key] = v                              STATE CHANGE
      ├─ rebuild()                                        main.js:414
      │    ├─ disposeScene()
      │    │     dimensions.dispose() → construction.dispose() → shape.dispose()
      │    │     → labels.clearAll() → per-child geometry/material dispose → shapeGroup.clear()
      │    ├─ solid = getSolid(state.solidId)
      │    ├─ dims  = currentDims()  →  resolveDims(solid, state.dims, state.unspecified)
      │    ├─ shape = buildShape(solid.body(dims), resolution())          GEOMETRY CALCULATION
      │    │     buildGeometry(spec)  →  EdgesGeometry  →  LineSegmentsGeometry
      │    │     silhouetteSpec(spec) →  silHolder / billboard
      │    ├─ construction = buildConstruction({solid, dims, resolution})
      │    │     bounds = solid.bounds(dims); origin = (hw, 0, hd)
      │    │     axes   = AXIS_SPECS.map(...)             three growable groups at the origin
      │    │     box    = twelve edges, signed from the origin
      │    │     faces  = three MeshBasicMaterial quads (HP/VP/PP)
      │    │     stages = solid.construction(dims).map(primitivePositions)
      │    ├─ buildDimensionAnnotations(solid)            LABELS / DIMENSIONS
      │    │     dedupe by `${symbol}|${value}` → dimAlias
      │    │     + solid.extraDims?.(dims)
      │    │     dimensions = buildDimensions({specs, resolution})
      │    │     dimAnchors.set(key, item.anchor); labels.make(key, text, 'vp-label--dim', anchor)
      │    │     labels.make('title', solid.name, 'vp-label--title', placeFigureTitle(h))
      │    │     labels.make('viewFront'|'viewTop'|'viewSide', …, face.center)
      │    ├─ orthoSheet.draw(solid, dims)                SVG SHEET REBUILT
      │    ├─ cameraRig.focusOn(contentFocus().center, .radius)     REFRAME (no flight)
      │    └─ notifyStateChange()
      ├─ ui.sync(state)                                   push values into existing controls + readout
      └─ applyStepState()                                 main.js:1309 — RE-ASSERT, DO NOT RESTART
           n=1|2 → showFinishedSolid({animate:false}); labels.set('title'); (n=2) setAllDims(true)
           n=3   → + showSheet(true); restore selectedView highlight + face
           n=4   → showSheet(true); goPhase(state.phase ?? 'a', { animate:false })
           n=5   → enterFormComparison()
           n=6   → enterStep(6)
  ⟶ next animation frame:
      animate(now)
        tickTweens(delta) → controls.update() → shape.update(camera) → construction.update(camera)
        → updateIsoAngles() → updateFigureTitles()
        → renderer.render(scene, camera) → labelRenderer.render(scene, camera)          RENDER
```

### 12.2 Topic 2 — Phase B, the dimension transfer

```
Click #phase-strip [data-phase="b"]
  → goPhase('b')
      sequencer.stop(); clearScheduled(); cancelAllTweens(); transfers.clear()
      markPhase('b')                              aria-current + #phase-note title/body
      orthoSheet.setDrawn(true); hideFinishedSolid(); labels.set('title', false)
      setAllDims(false); hideStages(); highlightFace(null); isoAngles.set(false)
      hideAxes(); showAxes({animate:false})       axes already standing (cumulative)
      cameraRig.flyTo(pose('isometric'), { duration: 900 })
      sequencer.play([
        {  200 → showBox({animate:true})                     growGroup(box.group, 1, 700) },
        { 1000 → transferDimension(DIM_SOURCES[0]) },        // width,  front view
        { 2250 → transferDimension(DIM_SOURCES[1]) },        // depth,  top view
        { 3500 → transferDimension(DIM_SOURCES[2]) },        // height, side view
        { 4750 → orthoSheet.highlight(null); setAllDims(true, {animate:true}) },
      ])
      flowNote('Each overall size leaves the view it is read from …'); announce(phase.announce)

transferDimension(src):
  orthoSheet.highlight(src.view)                            SVG view goes accent + bold caption
  target = dimAlias.get(src.labelKey) ?? src.labelKey        a repeated size lands on its carrier
  anchor = dimAnchors.get(target)
  announce(`${symbol}, ${value} millimetres, from the ${view} view onto the ${axis} axis.`)
  from = orthoSheet.viewCenter(src.view)                     getBoundingClientRect → client px
  if (!from || !anchor) → land() and return                  honest degradation
  transfers.fly({ from: clientToViewport(from),
                  to:   worldToViewport(anchor),             project(camera) → NDC → viewport px
                  symbol,
                  onLand: () => setDim(target, true, {animate:true}) })
     ├─ draw the leader (stays for the flight — it is the evidence)
     ├─ tween 0→1 over 760 ms, translating the token
     └─ onComplete → settle(): onLand() → .is-landed → remove after 420 ms
```

### 12.3 Topic 3 — loading a problem

```
Click .problem-card[data-problem-id]
  → uiManager delegated listener on #problem-library-list
  → sim.loadProblem(id); closeBrowser()  →  window.simAPI.resume()
  → simController.loadProblem(id)                              main.js:676
      p = getSubject(id)                                       problemQuery — the one lookup
      form = initialProjectionMode(p)                          'either' → 'view', else the declared type
      STATE: problemId, dims = defaultDims(p), unspecified ← withheldDims(p),
             projectionMode, orientationId = p.orientations?.[0] ?? null,
             verification cleared, ui.statementHidden = false,
             progress.phasesDone = [] , progress.stagesDone = []
      rebuild()                                                main.js:242
        ├─ disposeScene()
        ├─ model = compose(p, currentDims(), { orientationId })          DATA → MODEL
        │     per PartSpec: getPartKind → resolveParams → kind.bounds
        │                   → ORIENTATIONS[orient] → seat resolution (originY)
        │                   → kind.body / kind.construction / kind.views
        │     overallBounds · flattenStages (bottom-up) · composeViews · composeDimSpecs
        ├─ plan = resolveProjection(model, state.projectionMode)         THE 0.816 LAW
        │     per part: scale = trueDiameter ? 1 : axialScale ; originScale = axialScale
        ├─ auditComposition(model) → console.warn on any fault           AUTHORING CHECK
        ├─ shape        = buildComposedShape(model, plan, res)           GEOMETRY
        ├─ construction = buildConstruction({model, plan, resolution})   AXES + BOXES + STAGES
        ├─ buildDimensionAnnotations()                                   DIMENSIONS + LABELS
        ├─ orthoSheet.draw(model.views, dims)                            SVG SHEET
        ├─ cameraRig.focusOn(contentFocus())
        └─ bus.notify(state)  →  (if stepId === 'whole-process') runVerification()
      ui.render(state)          dock rebuilt from p.dimensions; picker; problem card; form control
      stepper.reload()          rebuild the rail, visited = {1}, goToStep(1) → sim.enterStep(1)
      announce(isTextbookProblem(p) ? 'Problem loaded: …' : '… selected. Drag to rotate it.')
  ⟶ viewport.frame(now): tickTweens → controls.update → shape/construction.update → render
```

### 12.4 Topic 3 — reaching the verdict

```
stepper.goToStep(6)
  → sim.enterStep(6)
      resetSceneLayers()                       clears construction, dimension linework, labels,
                                               phase strip, sheet, and HIDES #verdict-bar
      id = 'whole-process'
      showFinishedSolid({animate:false}); labels.set('title', true)
      for each dimension item: labels.set(key, true) + fade its linework to 1
      cameraRig.flyTo(pose('isometric'), { duration: 1200 })
      runVerification()                        main.js:605
        ├─ p = problem();  if (!p || !model || !p.answerData) → ui.renderFindings([], null); return
        │     ↑ free practice: no question, so nothing to be right or wrong about — DATA SHAPE test
        ├─ findings = validate(model, p, plan, { ...progress, orientationId: state.orientationId })
        │     checkProjectionType → checkDimensions → checkOrientation
        │     → checkConstructionOrder → checkCompletion → checkSphereRule
        ├─ summary = summarise(findings)       any fail → fail; any pending → pending; else pass
        ├─ state.verification = { checked: true, findings }
        ├─ ui.renderFindings(findings, summary)
        │     reveals #verdict-bar (outside .card__scroll, always in view)
        │     paints #verification-summary + one .finding row per finding, each with its own glyph
        └─ announce(summary.message)

Any later dimension edit at Step 6:
  setDim → rebuild → bus.notify → (stepId === 'whole-process') → runVerification()   ← live re-check
```

### 12.5 The one-line summary of both topics

```
User Action → simController method → state mutation → rebuild()
   → [T3 only: compose() → resolveProjection()]
   → buildShape/buildComposedShape → buildConstruction → buildDimensions → labels.make
   → orthoSheet.draw → cameraRig.focusOn → notify
   → ui.render/sync → applyStepState()/enterStep()
   → animate()/frame(): tickTweens → controls.update → rigs.update(camera)
                        → [T2: updateIsoAngles + updateFigureTitles]
                        → renderer.render + labelRenderer.render
```

---

## 13. Existing Architecture / Conventions

### 13.1 What the root documents actually contain

| File | Size | What it is |
|---|---|---|
| `ARCHITECTURE.md` | 61 KB | System map — an annotated directory tree of every module and topic, plus component breakdown and data flow |
| `DECISIONS.md` | 444 KB | The ADR log — **ADR-001 … ADR-218**, 142 entries |
| `RULES.md` | 99 KB | Enforcement rules, numbered `§1.x` … `§8.x`, each citing the ADR it comes from, plus a "never do" summary list |
| `DESIGN.md` | 48 KB | The single platform design system — colour tokens, typography, component standards |
| `PRODUCT.md` | 23 KB | Audience, features, accessibility commitments |
| `PLATFORM-RULES.md` | 17 KB | Host-platform contract |
| `DOCUMENTATION-SYSTEM.md` | 28 KB | How the doc set is meant to be maintained |
| `CLAUDE.module-template.md` | 8 KB | The template a topic's `CLAUDE.md` is cut from |
| `MODULE-STARTER.md` | 52 KB | Scaffolding guide |
| `CHANGELOG.md` | 196 KB | Platform-wide changelog |

There is **no `DESIGN.md`, `PRODUCT.md`, `ARCHITECTURE.md` or `DECISIONS.md` inside any Module-4 topic folder** — correctly, per root `RULES.md` §1.14, which requires a topic's `CLAUDE.md` to *point at* the root copies rather than duplicate them. Each topic carries only `CLAUDE.md` + `CHANGELOG.md` + `meta.json`.

### 13.2 Root rules that verifiably apply to Isometric Drawing

These I located in `RULES.md` and confirmed the code honours:

| Rule | Text (abbreviated) | Where honoured |
|---|---|---|
| §1.12 | `<title>` identical to `meta.json.title` | all three topics ✔ |
| §1.14 | A topic's `CLAUDE.md` points at the root `DESIGN.md`/`PRODUCT.md` | all three ✔ |
| §1.15 | Scaffold a new topic from `template_starter/` **or** from a named sibling | T1 ← `template_starter/`; T3 ← T2 |
| §1.16 | Never carry a shared engine file a topic does not import | no unimported leaf found in T2 or T3 ✔ |
| §2.8 | `window.simAPI` with **exactly** `pause()`, `resume()`, `reset()` | T2 `main.js:1543`, T3 `main.js:762` ✔ |
| §2.9 | Never create a second reset path | both route the in-sim Reset through `simAPI.reset()` only ✔ |
| §3.1 | Route every geometry change through the single `rebuild()` | ✔ |
| §3.2 | Never let a control mutate the Three.js scene directly | ✔ — every control calls the injected controller |
| §3.3 | Run the full disposal contract at the start of every rebuild | `disposeScene()` ✔ |
| §3.4 | `renderer.info.memory` flat across 50 rapid rebuilds | claimed verified in T3's `CLAUDE.md`; not re-run here |
| §3.5 | Remove live CSS2D label DOM nodes inside the disposal traversal | `labels.clearAll()` → `obj.element.remove()` ✔ |
| §3.6 | Leaf modules never import each other | mostly ✔ — see §14.2 for the exception |
| §3.6a | A topic's pure-data catalogue modules may be sibling-imported | the carve-out `shapeData`/`tokens` (T2) and `helpers`/`solidCatalog`/`tokens` (T3) rely on |
| §3.12 / §3.13 | All engineering linework via `LineMaterial` + `LineSegments2`; never `LineBasicMaterial` | ✔ |
| §3.14 | Hard-edged geometry with flat shading so `EdgesGeometry` finds real creases | `flatShading: true` ✔ |
| §3.16 | Keep `LineMaterial.resolution` in sync on resize | ✔ T2; **T3 passes CSS px — see §14.1** |
| §3.17 | `computeLineDistances()` on every line object | ✔ |
| §3.18 | `polygonOffset: true` on the solid material | ✔ |
| §3.24 | Flat ambient + single directional, no shadows | ✔ |
| §3.25 | Never re-add `AxesHelper` or any RGB helper | ✔ — none present |
| §3.26 | Re-render after fonts load | `document.fonts.ready.then(...)` ✔ |
| §3.27 | Viewport labels as live `CSS2DObject` DOM nodes | ✔ |
| §3.29 | Every solid a manifold, no overlapping/duplicated extrusions | hemisphere = dome + cap meeting at the equator ✔; combinations audited by `auditComposition` ✔ |
| §4.11 | Never a bare `#000`/`#fff` literal — consume the token | ✔ no colour literal in any JS file |
| §4.12 | Every interactive target ≥ 44 px with a visible accent focus halo | claimed verified in T3's `CLAUDE.md` |
| §4.13 | Collapse all motion to instant under `prefers-reduced-motion`; the state still updates | ✔ in `anim.js`, `summaryAnimator`, `cameraRig`, `labelLayer`, `transferLayer` |
| §4.14 | UI DOM ownership stays with the designated owner (`uiManager.js`) | ✔ |
| §4.19 | Guard Reset with an inline two-state confirm | ✔ both topics |
| §6.1 | Self-check ±0.5 tolerant | `CHECK_TOLERANCE_MM = 0.5` ✔ |
| §6.2 | Never auto-fill answers | T3 seeds only the sizes the **question states**, and documents why that is reading given data, not filling an answer |
| §6.3 | Keep answer/target logic off the rebuild state-change seam, out of UI handlers | `answerValidator.js` is pure; `bus.subscribe` is its only trigger ✔ |
| §6.4 | OR-array targets only where the geometry is genuinely degenerate | `checkDimensions` compares the sorted **set** only when `orientations.length > 1` ✔ |
| §6.7 | Textbook problem wording verbatim | ✔ — statements carry their own `(i)/(ii)` clauses, `H.P.`/`VP` spellings and `80x60 mm` |
| §6.8 | 1 world unit = 10 mm | `MM_PER_UNIT = 10` in both topics ✔ |
| §6.19 | 2D/orthographic dimensions as BIS SP 46:2003 Type B | `dimensionLayer.js` ✔ (in the construction register — a documented divergence) |

### 13.3 Conventions the code follows that are not in the root rules

Derived by reading the source; these are the house style of this feature:

1. **Data is the architecture.** One data module per topic describes the subject; every other module owns exactly one `switch` over a bounded primitive/part vocabulary.
2. **The orchestrator owns no domain knowledge.** `main.js` contains no linework maths, no solid definitions, no step copy, no label offsets, no timing tables.
3. **One `switch`, over kinds, never over names.** Enforced consistently.
4. **Leaves are injected, not imported by each other.** `main.js` hands every leaf what it needs.
5. **A leaf owns and frees everything it builds.** Every rig returns a `dispose()`.
6. **Every tween is driven from the render loop**, never a private `rAF`, so `simAPI.pause()` freezes everything.
7. **Every camera move is an eased flight, never a teleport**, and collapses to instant under reduced motion **with the state still landing**.
8. **Engineering notation in the viewport, plain English in the controls.** `L` / `B` / `H` / `a` / `ØD` / `Ød` / `R` / `t` come from the data (`axisSymbols`, `DimSpec.symbol`) and are never derived from a field name.
9. **Chrome-Only Blue.** `--color-accent` never enters the viewport; viewport meaning uses ink, construction grey, and HP/VP/PP.
10. **Two-Cue Rule.** Colour is never the only signal — a selected view gets an accent frame *and* a bold caption; a finding gets a colour *and* a glyph; a line's role is carried by weight *and* colour.
11. **One announcement channel.** `#sim-status` only; `#vp-flow-note` is `aria-hidden` so it cannot double-announce.
12. **A repeated size is stated once.** Deduplication by `symbol|value`, with the other edge aliased.
13. **The seating convention.** Every solid/part is authored resting on `y = 0` and centred in plan.
14. **Re-assert, don't restart.** A parameter edit lands the current step's state instantly, leaving the camera where the learner put it.
15. **Honest degradation.** A missing anchor makes the callout appear rather than fly from `(0,0)`; an invalid numeric entry reverts rather than turning red; a bad solid id returns `SOLIDS[0]` rather than blanking the sim.

### 13.4 **[POTENTIAL ISSUE]** The ADR and rule citations in the Module-4 `CLAUDE.md` files do not resolve

This is the single most consequential documentation finding, and it should be understood before trusting any citation in those files.

**The claims:**
- Topic 2's `CLAUDE.md`: *"this topic adds **ADR-043**…**ADR-051**"* and *"adds **§3.33**–**§3.41**, **§4.21**"*.
- Topic 3's `CLAUDE.md`: *"this topic adds **ADR-052**…**ADR-059**"* and *"adds **§4.22**–**§4.23**, **§6.21**–**§6.30**"*.
- Topic 3's `CLAUDE.md` also states: *"the topic is registered in `../ARCHITECTURE.md` §2."*

**What is actually in the root documents [CONFIRMED]:**

| Cited as Module 4 | What root `DECISIONS.md` / `RULES.md` actually says |
|---|---|
| ADR-043 | "The Glass Box reference planes use functional hue-tinted glass…" — Module 1 Topic 4 |
| ADR-044 | "The Glass Box reference planes are calm grid matrices…" — Module 1 Topic 4 |
| ADR-049 | "The Profile Plane folds DOWN onto the HP…" — Module 1 |
| ADR-052 / ADR-053 | Module 2's `drawCompare()` projection and scale-lock |
| ADR-055 | Module 2's Compare scroll-zoom |
| §3.33 / §3.33a | *retired 2026-07-21* — scissored viewport regions |
| §3.34–§3.41 | `sectionCut.js` loops, 3D label leaders, centre lines, Canvas2D caption collision, ghost material |
| §6.21–§6.30 | Syllabus problem-KIND exclusions, multi-construction drawing engines, Node oracles |
| §3.27a, §4.21, §4.22, §4.23 | **not present** in root `RULES.md` |

`grep "module_4" ARCHITECTURE.md` returns exactly one hit — line 80, and it is inside the entry for `graphics_module_2_topic_0_introduction_to_orthographic_projection`, recording that *that* topic was cut **from** Topic 2. **No Module-4 topic has its own entry in `ARCHITECTURE.md`.** `grep -i isometric DECISIONS.md` returns one hit, a passing mention at line 3495 in a Conic Sections ADR.

**Interpretation [INFERRED]:** these ADRs and rules were written *for* Module 4 but were either never merged into the root documents, or were merged and then overwritten when other modules claimed the same numbers. Either way, the citations in the Module-4 `CLAUDE.md` files are **self-referential** — the reasoning they point at exists only in the prose of those `CLAUDE.md` files and the topic `CHANGELOG.md`s.

**Practical consequence for our work:** the topic `CLAUDE.md` and `CHANGELOG.md` files **are** the authoritative design record for Topics 2 and 3. Do not follow an "ADR-0xx" reference in them to the root `DECISIONS.md` and expect it to be about isometric drawing — it will not be. Conversely, if we are asked to log a decision, the numbering conflict must be resolved first.

---

## 14. Existing Technical Debt / Risks

Nothing below has been fixed. Each entry names the file and line where it is visible.

### 14.1 Fragile assumptions and probable defects

**A. Topic 3 feeds CSS pixels into `LineMaterial.resolution` on resize. [POTENTIAL ISSUE]**
`main.js:847-853` — the `ResizeObserver` calls `viewport.size()`, which returns `container.clientWidth/clientHeight` (CSS px), and passes it to `shape/construction/dimensions.setResolution()`. Topic 2 passes `renderer.domElement.width/height` (drawing-buffer px) at `main.js:1451-1455`. On a display with `devicePixelRatio > 1` these differ by that factor, so fat-line widths would be wrong after a resize. The **initial** build is correct in both topics because both seed from `viewport.resolution()` / `resolution()`, which read the drawing buffer. Root `RULES.md` §3.16 requires the canvas *pixel* size.

**B. Topic 3's phase staggers use untracked `setTimeout`s. [POTENTIAL ISSUE]**
`main.js:287` (`showAxes`) and `main.js:307` (`showBoxes`) schedule their per-axis / per-box stagger with a bare `setTimeout` that is stored nowhere. Topic 2 pushes the equivalent timers into `sequencerBeats[]` and clears them in `clearScheduled()` on every phase change. In Topic 3, `cancelAllTweens()` cancels tweens but cannot cancel these timers, so a rapid phase change (or a problem load during a stagger) can let a stale beat fire against a *disposed* rig. `showAxes` reads `construction?.axes` via optional chaining at call time but the closure `start()` captures the old `axis` object, so the write lands on a freed material.
**Mitigating [INFERRED]:** the window is at most `2 × 280 ms` for axes and `n × 320 ms` for boxes, and the effect would be a stray opacity write on an orphaned material rather than a throw.

**C. Topic 3 has no `sequencer` at all.** Topic 2's token-guarded `createSequencer` is absent; Topic 3's `goPhase` runs its layer calls synchronously plus the untracked staggers in (B). This is why (B) exists.

**D. The figure title is placed by a fixed formula in Topic 3.**
`main.js:221`: `labels.placeFigureTitle(h, 0.12 * h + 0.55)`. Topic 2 replaced exactly this kind of formula with per-frame measurement (`updateFigureTitles`), and its `CHANGELOG.md` records three failed modelling attempts before landing on measurement, with the measured gap improving from 96–148 px → 27–117 px → 22–44 px. Topic 3 therefore reproduces the defect Topic 2 fixed: the title will sit too high on a tapering solid and can collide with a wide one. `geometryFactory.topHalfExtent()` — the exact helper needed to fix it — is **exported and never imported**.

**E. Topic 3's `simController.setOrientation()` is unreachable. [POTENTIAL ISSUE]**
Defined at `main.js:748`; a repo-wide grep finds no caller. `state.orientationId` is set once by `loadProblem` to `p.orientations?.[0]` and never changes. Two shipped problems pose two placements each — `ndb-17-12-cylinder` ("axis is (i) vertical and (ii) horizontal") and `kcj-16-10-cone` (same) — and **the second half of both questions is unreachable in the UI**. The composer, the orientation table, the view rotation and the validator's set-comparison branch are all implemented for it; only the control is missing.

**F. `initialProjectionMode().learnerChoosable` is computed and discarded.**
`projectionResolver.js:64` returns it; nothing reads it. `uiManager.renderFormControl` renders **both** form buttons unconditionally, so a learner may draw problem 1 as an Isometric View even though its `projectionType` is `'projection'`. That is arguably correct — the validator's `checkProjectionType` then fails and teaches the mistake — but it means the flag encodes an intent the UI does not implement.

**G. Topic 3's `#vp-angles` and `#vp-transfer` are dead markup.**
`index.html:1585-1586` declares them as `<div>`s. Topic 3 has **no `isoAngles.js` and no `transferLayer.js`**, nothing mounts into them, and I found no CSS rules for them. Consequence: **Topic 3 has no 30° annotation and no dimension-transfer animation.** Its Phase B note still says the sizes are *"carried onto those axes… from the front view / top view / side view"*, and Phase A's note still says *"two receding to either side at 30° to the horizontal"* — claims the topic now only asserts, which is precisely the assertion-vs-demonstration gap Topic 2's `transferLayer.js` header says it was built to close.

**H. Topic 3's `state` carries four fields nothing ever writes.**
`state.stepIndex` (the stepper owns `currentStep` privately), `state.ui.libraryOpen` (`uiManager` tracks it via `overlayEl.hidden`), `state.ui.hintsShown` (`uiManager` has its own local `hintsShown`), and `state.selection.partId`. `state.js`'s own header says nothing derived is stored and mutation is one-way; these four are the opposite failure — declared as the source of truth and then bypassed. A future reader who trusts `state.stepIndex` will read a permanent `1`.

**I. `problem.steps` (`{ disable?, insert? }`) is documented and unimplemented.**
Declared in the `Problem` typedef (`problemLibrary.js:105`). No problem uses it and no code reads it. `stepper.reload()` and `sim.steps()` always return the same six. A problem author reading the typedef would reasonably believe per-problem step customisation works.

**J. `seat: { mode: 'rim' }` is reserved and deliberately unimplemented.**
`solidComposer.js:174` pushes a fault string instead. This one is **documented as intentional** ("implementing it would be inventing a case the textbook never poses") and is the right kind of unimplemented — it fails loudly. Recorded here only so it is not mistaken for a bug.

**K. Topic 3's mobile notice does not respond to a resize.**
`main.js:628`: `if (window.innerWidth < 768) notice.hidden = false;` — evaluated once at boot. Topic 2 wires a live `matchMedia` listener with a `dismissed` latch (`main.js:1469`). Rotating a tablet after load will not surface the notice in Topic 3.

**L. `checkDimensions` passes on load, before any work is done.**
`state.dims = defaultDims(p)` seeds the question's own stated sizes, and `answerData.bounds` is the value those sizes produce — so the Sizes check is green from frame one. This is *documented and intended* (§6.2: reading the given data is the second step of the solve, not auto-filling an answer), and `checkConstructionOrder` / `checkCompletion` still gate on real work. Recorded because it can read as a bug.

**M. Topic 2's Phase-B beat schedule is coupled to `DIM_SOURCES.length`.**
`main.js:826-829` uses `1000 + i * 1250` and then `1000 + DIM_SOURCES.length * 1250`. Correct today, but adding a fourth overall dimension silently lengthens Phase B to ~6 s with no other signal.

**N. `applyStepState()` in Topic 2 falls through to `enterStep(6)` for step 6.**
`main.js:1336`. The comment argues a rebuild at step 6 can only come from a reset, which re-enters step 1 anyway. **[INFERRED]** true today; it would become a full restart-with-camera-flight if step 6 ever gained a dimension control.

**O. Topic 2 aliases dimensions by `${symbol}|${value}` after rounding.**
`main.js:345` uses `round(bounds[axisKey])` (one decimal). Two genuinely different sizes that round to the same tenth and share a symbol would be collapsed into one dimension. **[INFERRED]** not reachable with the shipped ten solids, since only `width`/`depth` can share a symbol and they do so only when equal by construction.

### 14.2 Tight coupling and layering deviations

**P. Topic 3's `uiManager.js` imports four sibling leaves.**
`import { groupByCategory } from './problemLibrary.js'`, `from './problemQuery.js'`, `from './dimensionResolver.js'`, `from './projectionResolver.js'`, `from './helpers.js'`. The topic's own layering statement names only `helpers.js`, `solidCatalog.js` and `tokens.js` as the shared utils a leaf may import. `problemLibrary` and `problemQuery` are data/query and defensible; `dimensionResolver` and `projectionResolver` are **behaviour leaves**, so `uiManager → dimensionResolver` is a leaf-to-leaf import that root `RULES.md` §3.6 forbids and the topic's own §3.6a carve-out does not obviously cover. The imported surface is small (`optionalDims`, `modeTitle`) and both are pure.

**Q. `uiManager.optionalDims()` is returned and never called.** `uiManager.js:578`. It is the only consumer of the `dimensionResolver` import.

**R. `orthographicDrawer.setDrawn()` in Topic 3 is a deliberate no-op.**
`orthographicDrawer.js:185`, with a comment explaining that the method is kept so `main.js`'s `showSheet()` call site stays identical to Topic 2's. Honest, documented, and a small maintenance trap: a reader will assume it does something.

**S. `main.js` reaches into `stepper` for the current step.**
`stepper?.step()` and `stepper?.steps()[n-1]?.id` appear in `applyStepState`, `enterStep`, `simAPI.reset` and the bus subscriber. The step is genuinely owned by the stepper, so this is the lesser of two evils, but it means the step is *not* in `state` and any consumer must know to ask the stepper.

**T. Topic 2's `main.js` is 1696 lines and owns the scene, the loop, the resize, both overlays' per-frame maths, three step controllers and the whole chrome wiring.** Topic 3's `CLAUDE.md` explicitly cites this as the reason scene ownership was extracted into `viewport.js` for that topic. Topic 2 was never given the same treatment.

### 14.3 Dead / unused code (exported or returned, never called)

**Topic 2:** `shapeData.optionalDims` · `shapeData.dimensionSymbols` · `labelLayer.place` · `labelLayer.has` · `labelLayer.setText` · `cameraRig.flyToNamed` · `cameraRig.framing` · `orthographicDrawer.selected` · `orthographicDrawer.dispose` · `isoAngles.measured` · `isoAngles.dispose` · `transferLayer.inFlight` · `stepper.sync` · `stepper.goTo` · `stepper.dispose` · `summaryAnimator.isRunning`.

**Topic 3:** `geometryFactory.topHalfExtent` (the fix for **D**) · `solidCatalog.isTrueDiameterKind` · `helpers.inradius` · `dimensionResolver.dimSymbol` · `projectionResolver.learnerChoosable` · `uiManager.optionalDims` · `uiManager.dispose` · `stepper.goTo` · `stepper.dispose` · `viewport.dispose` · `viewport.isRunning` · `geometryFactory.setPartOpacity` · `simController.setOrientation` (**E**).

Several of these (`dispose`, `measured`) are deliberate contract/testing surface rather than accidental. `isoAngles.measured()` in particular exists so a regression in the 30° claim surfaces as a number.

### 14.4 Duplication

- **Seven leaves are byte-identical copies** between Topics 2 and 3 (§11.4). Per the platform's no-shared-library model this is the *intended* mechanism, but it means a fix must be applied in the origin **and re-copied**, and there is no automated check that they have not drifted. `anim.js` has already drifted from the Module2 master by line endings.
- **`geometryFactory.buildGeometry` (T3) and `shapeFactory.buildGeometry` (T2)** are near-identical, differing only in the `pyramid` case (T3 uses a `CylinderGeometry` with `rTop` so it covers frustums; T2 uses `ConeGeometry`).
- **`constructionEngine`'s primitive helpers** are duplicated between the two topics; T3 adds `edgePositions` and one box per part.
- **`topHalfExtent`** exists in both, with T3's version adding the `pyramid` frustum case — and T3's copy is unused.
- **`polygonPoints` / `ringPoints` / `rectPoints` / `circumradius`** exist in both `shapeData.js` (T2) and `helpers.js` (T3).
- **The `.field` slider/numeric builder** is duplicated between the two `uiManager.js` files with small differences (T3 defaults `spec.step ?? 1` and `spec.unit ?? 'mm'` because a `DimSpec` may omit them).
- **The design-token `:root` block and the whole stylesheet** are duplicated across all three `index.html` files.

### 14.5 Hard-coded values that are not in a token or a data file

All are named constants with explanatory comments, but they are *code*, not data:

- **Timings:** `AXIS_STAGGER` 300 (T2) / 280 (T3), `AXIS_GROW` 520, box grow 700 (T2) / 600 (T3), stage fade 520 (T2) / 420 (T3), finished-solid fade 760 (T2) / 480 (T3), `FLOW_NOTE_HOLD` 4500, `FADE_MS` 220, transfer 760 + 420 settle, and every camera-flight duration inline at its call site (800 / 900 / 1000 / 1100 / 1200 / 1300 / 1400 / 1700).
- **Phase-B beat maths:** `1000 + i * 1250` (T2 `main.js:826`).
- **Geometry:** `RING_SEGMENTS` 72, `RADIAL_SEGMENTS` 64, `BILLBOARD_SEGMENTS` 72, `GENERATORS`/`count: 12`, `EdgesGeometry(geometry, 20)` threshold, `AXIS_OVERSHOOT_MM` 14, `MARKER_MM` 4.
- **Dimension geometry:** `OFFSET` 0.46, `GAP` 0.07, `OVERSHOOT` 0.13, `ARROW_L` 0.24, `LABEL_LIFT` 0.2, `MIN_INNER` 0.624, arrow half-width `ARROW_L/6`, outward tail extension `ARROW_L * 1.6`.
- **Placement:** `PLACEMENT.outboard` 0.34, `.crown` 0.55, `.figureClearScreen` 0.115; T3's `0.12 * h + 0.55`.
- **Overlays:** `ARC_R` 52, `LABEL_GAP` 17, `DATUM_SPAN` 2.05, the `+4` baseline nudge, `TOKEN_W` 46, `TOKEN_H` 22.
- **Camera:** `FRAMING` 2.6/2.6/2.6/3.4/4.2, `DIRECTIONS.threeQuarter` `(0.62, 0.42, 0.75)`, `top`'s `0.02` polar nudge, `ISO_FADE_START` 2.5, `ISO_FADE_END` 12, Phase A's `radius * 1.5`, Step 5's `radius * 1.06`, `minDistance`/`maxDistance`, `fov` 45, `near`/`far` 0.1/200.
- **Sheet layout:** T2 `LEFT_PAD` 26, `MARGIN` 12, `CAP` 11, `GAP` 22, `OVERRUN` 8; T3 `MARGIN` 14, `GAP` 22, and the `× 1.6` px multiplier on the SVG width/height.
- **Loop:** the 64 ms frame-delta clamp, `Math.min(devicePixelRatio, 2)`.
- **Boot:** the 15000 ms watchdog.
- **Breakpoints:** 768 and 900, in both CSS and JS.

### 14.6 Unusual patterns worth knowing about

1. **The growth trick** — geometry written relative to the origin corner, parented to a group at it, scaled `0.0001 → 1`. `0.0001`, not `0`, because a zero scale produces a degenerate matrix. Anything that re-parents or re-positions those groups breaks the animation.
2. **Screen-space overlays fed by the orchestrator.** `isoAngles.js` imports *nothing*; `main.js` projects for it every frame. Elegant, but it means the 30° logic is split across two files.
3. **Compositional honesty for the 30° claim** — the camera is aimed at the origin corner so the projection is locally angle-preserving, and the annotation fades as the camera leaves the sight-line. Anything that changes Phase A's camera target silently invalidates the annotation.
4. **Dimension aliasing** — a repeated size is drawn once and pointed at from both edges, so `dimensions.items.length` can be less than `DIM_SOURCES.length`.
5. **Two separate timer lists** in Topic 2 (§5.3). Merging them re-introduces the stuck-at-opacity-0 phase-strip bug the comment records.
6. **`labels` are added to the `scene`, not to `shapeGroup`** — so `shapeGroup.clear()` does not remove them; `labels.clearAll()` must.
7. **`fadeMaterial` drives `object.visible` from the tween's completion**, so an object is only dropped from the draw at opacity 0. A cancelled fade can leave an object visible at partial opacity.
8. **Topic 3's billboard hangs off the `placement` group, not `body`** — deliberately, so a parent rotation cannot tilt a sphere's outline circle.
9. **`getSolid(id)` returns `SOLIDS[0]` for an unknown id** (T2, defensive) while **`getPartKind(id)` returns `null`** (T3, loud). Opposite philosophies in sibling topics, both deliberate.
10. **`revealNextHint()` doubles as a collapse toggle** once every hint is shown — the same button changes meaning.

### 14.7 Areas that should NOT be modified casually

| Area | Why |
|---|---|
| `rebuild()` / `disposeScene()` and every rig's `dispose()` | The whole memory contract. A missed `dispose()` leaks on every slider tick. |
| The growth trick in `constructionEngine.js` | Phase A and Phase B's motion depends on the exact origin/relative-geometry/scale arrangement. |
| Phase A's camera targeting + `isoAlignment()` + `isoAngles.js` | The 30° annotation is only honest because of this composition. Change the target and the label becomes measurably false. |
| `updateFigureTitles()` | Three earlier approaches failed for documented reasons. Any "simplification" is likely a regression. |
| `labelLayer.set()`'s double-rAF and deferred `visible = false` | Removing either makes labels snap or flash on repeated toggles. |
| `shapeData.js` `resolveDims` / `dimensionResolver.js` ordering | Specified → auto → derived. Reordering silently produces wrong geometry. |
| `projectionResolver.resolveProjection` | Two lines encode the entire sphere rule. |
| `solidComposer` seating + `ORIENTATIONS` | Face-to-face contact and the re-seat offsets. |
| `answerValidator.js` purity | It must stay DOM-free and side-effect-free; it runs on every rebuild. |
| The two timer lists (T2) | See §14.6.5. |
| The verbatim `question` strings | Root `RULES.md` §6.7. A learner must be able to match them against the paper. |
| Any of the seven byte-identical shared leaves | A change here must be mirrored in the sibling topic, or they drift. |
| `window.simAPI`'s shape | Exactly three methods; the host depends on it. |
| The `:root` token block | Shared across the platform; a topic may add a token, never re-define one. |

---

## 15. Safe Modification Boundaries

### 15.1 Safe to modify for Topic 2

| File | Risk | Notes |
|---|---|---|
| `src/shapeData.js` | **Low** | The intended extension point. Appending a solid, or editing an existing solid's `dims` / `bounds` / `body` / `views` / `construction` / `blurb`, touches nothing else — *provided* the `body.kind` and every `draw` primitive `k` already exist. |
| `src/constructionSteps.js` | **Low** | Pure copy. Changing `STEPS[n].title`/`lead` or a `PHASES[i].note`/`announce` is text-only. **Do not change the number of steps or the four phase ids** — `main.js`'s `enterStep` switch is on `1..6` and `goPhase` on `'a'..'d'`. |
| `src/summaryAnimator.js` — `SUMMARY_TIMING` / `SUMMARY_CHAIN` | **Low** | Tempo and copy for Step 6. Keep `SUMMARY_CHAIN` ids in step with `#chain-strip`'s `data-link` attributes and keep `close` in `SUMMARY_TIMING`. |
| `index.html` — `.step-panel` body copy | **Low** | Body copy, inline `.term` popovers and static markup inside a panel. |
| `index.html` — `:root` **additions** | **Low** | A topic may *add* a token. Never re-define a shared one. |
| `src/uiManager.js` | **Medium** | Self-contained, but it is the single owner of the dock DOM. Any class it emits must exist in the stylesheet. |
| `src/orthographicDrawer.js` | **Medium** | Owns its SVG subtree. `viewCenter()` is a hard dependency of Phase B's transfer — keep it returning `null` when the sheet is not laid out. |
| `src/dimensionLayer.js` | **Medium** | Geometry constants are tuned as a set (see §14.5); it is a byte-identical shared copy — mirror to Topic 3. |
| `src/shapeFactory.js` | **Medium** | Adding a geometry kind is additive. `topHalfExtent` must gain the matching case or figure titles misplace. |
| `src/constructionEngine.js` | **Medium-High** | Adding a primitive kind is additive; touching the axis/box group arrangement is not (§14.7). |
| `src/isoAngles.js`, `src/transferLayer.js` | **Medium-High** | Screen-space, and their inputs are computed in `main.js`. Changes must be made on both sides. |
| `src/cameraRig.js` | **High** | Shared copy. `FRAMING.isometric = 4.2` is load-bearing for Steps 4/6 framing; `retarget` is load-bearing for Phase A. |
| `src/labelLayer.js` | **High** | Shared copy, and `PLACEMENT` is the topic's single placement policy. |
| `main.js` | **High** | See §15.3 for the specific regions. |
| `src/anim.js` | **Do not edit here** | Fix in the Module2 master and re-copy. |
| `src/stepper.js`, `src/terms.js`, `src/onboarding.js` | **High / avoid** | Platform components; `terms`/`onboarding` are byte-identical across all three topics. |

### 15.2 Safe to modify for Topic 3

| File | Risk | Notes |
|---|---|---|
| `src/problemLibrary.js` | **Low** | **The intended extension point.** Appending a problem, or editing an existing one's dimensions/hints/answerData, touches nothing else. `question` strings must stay verbatim. |
| `src/practiceSolids.js` | **Low** | Same schema. Changing `DEFAULT_PRACTICE_ID` changes what the sim boots and resets to. |
| `src/stepDefinitions.js` | **Low-Medium** | Copy is safe. **The six `id` strings are structural** — `main.js`'s `enterStep` switches on them and `.step-panel[data-step="…"]` is keyed by them. Changing an id needs three coordinated edits. |
| `index.html` — `.step-panel` body copy, `:root` additions | **Low** | As Topic 2. |
| `src/answerValidator.js` | **Low-Medium** | Adding a checker is one more pure function in `CHECKERS`. It must stay DOM-free and must not return `null` for a check every problem should get (see `checkDimensions`'s comment). |
| `src/problemQuery.js` | **Low-Medium** | Small and pure. It is the *only* place that knows both subject sources — keep it that way. |
| `src/uiManager.js` | **Medium** | Single owner of five DOM regions. Every class it emits must exist in the stylesheet — the topic's `CHANGELOG.md` records eight that did not, which silently cost the size readout its tabular type. |
| `src/dimensionResolver.js`, `src/projectionResolver.js` | **Medium** | Pure and short, but the resolve **order** and the two-line sphere rule are load-bearing. |
| `src/solidCatalog.js` | **Medium** | Adding a part kind is additive — declare all four of `bounds`/`body`/`views`/`construction`, and add the matching cases in `geometryFactory.buildGeometry` and (if it needs new primitives) `constructionEngine.primitivePositions`. |
| `src/solidComposer.js` | **Medium-High** | Seating, orientation and view composition. Getting `originY` or an `offset` wrong produces floating or interpenetrating solids. |
| `src/geometryFactory.js`, `src/constructionEngine.js` | **Medium-High** | The two-group placement/body rig is what makes the sphere rule expressible. |
| `src/viewport.js` | **High** | Sole owner of the one WebGL context and the frame loop. |
| `src/state.js` | **High** | The state contract. Adding a derived value here violates its stated invariant. |
| `src/stepper.js` | **High** | Generic by design (ADR-055 as cited locally). Teaching it about problems is the thing it exists not to do. |
| `main.js` | **High** | See §15.3. |
| `cameraRig` · `labelLayer` · `dimensionLayer` · `tokens` · `anim` · `terms` · `onboarding` | **Shared copies — see §15.3** | |

### 15.3 Shared files that require caution

**Byte-identical across Topics 2 and 3 (MD5-verified, §11.4).** Editing one and not the other silently diverges the two sims:

`src/tokens.js` · `src/cameraRig.js` · `src/labelLayer.js` · `src/dimensionLayer.js` · `src/anim.js` · `src/terms.js` · `src/onboarding.js`

`terms.js`, `onboarding.js` and `anim.js` are additionally identical in **Topic 1**, so a change there is a three-way mirror. `anim.js` has a further constraint: it is a copy of `Module2/src/anim.js` and the topic `CLAUDE.md`s say to fix it in the master and re-copy, never here.

**There is no automated check that these copies match.** The check is `md5sum`:
```bash
md5sum graphics_module_4_topic_{2,3}*/src/{tokens,cameraRig,labelLayer,dimensionLayer,anim,terms,onboarding}.js
```

**Duplicated-by-hand, not byte-identical** — a change to one is a *candidate* for the other, and the two have already diverged deliberately: `main.js` · `index.html` (stylesheet + tokens) · `constructionEngine.js` · `stepper.js` · `uiManager.js` · `orthographicDrawer.js` · `shapeFactory.js`/`geometryFactory.js` · `shapeData.js`/`helpers.js`+`solidCatalog.js` · `constructionSteps.js`/`stepDefinitions.js`.

**High-risk regions inside `main.js` (both topics):**

| Region | Why |
|---|---|
| `rebuild()` + `disposeScene()` | The memory contract. |
| `enterStep(n)` + `applyStepState()` | Re-assert vs restart. Confusing the two strobes the viewport on a slider drag. |
| `goPhase(id)` | Both the animated and the `animate: false` branch must land the same cumulative state. |
| `buildDimensionAnnotations()` | The dedupe/alias map that Phase B depends on. |
| T2 `updateFigureTitles()` / `updateIsoAngles()` | Per-frame, and the honesty of the 30° claim. |
| T2 `transferDimension()` | The `dimAlias` → `dimAnchors` → `worldToViewport` chain and its degradation path. |
| T3 `runVerification()` + the `bus.subscribe` hook | Runs on every rebuild while Step 6 is live. |
| `window.simAPI` | Exactly three methods. |

**Cross-topic regression risk that is easy to miss:** `graphics_module_2_topic_0_introduction_to_orthographic_projection` was cut **from** Topic 2 (root `CHANGELOG.md`:161) and carries its own descendants of `orthographicDrawer.js`, `cameraRig.js` and `uiManager.js` under different names (`projectionSheet.js`, `objectData.js`, `objectRig.js`). It does **not** import from Topic 2 — but a fix made in Topic 2 may be a fix that topic also needs.

### 15.4 Files that should probably NOT be modified

| File | Reason |
|---|---|
| `src/anim.js` (all three topics) | Fix in `Module2/src/anim.js` and re-copy. Editing here breaks the copy chain. |
| `src/terms.js`, `src/onboarding.js` | Platform components, identical in all three Module-4 topics. |
| Everything in `graphics_module_4_topic_1_…` | Outside the assigned scope. Topic 1 is architecturally different (scene built once) and none of our work touches it. |
| Root `ARCHITECTURE.md`, `DECISIONS.md`, `RULES.md`, `DESIGN.md`, `PRODUCT.md` | Platform-wide. Also, the ADR/rule numbering conflict in §13.4 must be resolved before adding to them. |
| `Module2/` | The master codebase for other modules. |
| `meta.json` | The platform contract. If `title` changes, `<title>` must change in the same commit. |
| The `question` strings in `problemLibrary.js` | Verbatim by rule. |
| The `:root` token block | Shared platform values; add, never redefine. |
| `assets/fonts/` | Bundled subsets; the sim must work offline after first load. |
| The boot watchdog in `index.html` | Classic (non-module) script by necessity. |

### 15.5 Dependencies that could cause regressions

A change to the left-hand item breaks the right-hand things. Read this before touching any of them.

| Change | Breaks |
|---|---|
| `shapeData.SOLIDS[i].bounds()` | the bounding box, all three dimensions, the axis lengths, `contentFocus()`'s framing radius, the face-highlight quads, and `#dim-summary` |
| `shapeData` `axisSymbols` | dimension label text, `#dim-summary` rows, the transfer token's glyph, **and the dedupe signature** (`symbol|value`) |
| Adding a `body.kind` | `shapeFactory.buildGeometry` **and** `shapeFactory.topHalfExtent` **and** `shapeFactory.silhouetteSpec` |
| Adding a construction primitive `k` | `constructionEngine.primitivePositions` (both topics, if shared) |
| Adding a 2D view primitive `k` | `orthographicDrawer.renderPrimitive` (T2) / `shapeNode` (T3) **and** `solidComposer.rotateShape` (T3) |
| `DIM_SOURCES` (T2) / `DIM_PUSH` (T3) | Phase B's beat schedule, `dimAlias`, the dimension geometry, and the `view` → sheet-highlight mapping |
| `AXIS_SPECS` order or directions | the axis stagger order, `updateIsoAngles`'s "two receding axes" filter (`a.key !== 'height'`), the box corner signs, and `axis.mid` |
| `cameraRig.FRAMING.isometric` | whether Steps 4 and 6 crop the box, the axis overshoot, or the outboard dimensions |
| `cameraRig.retarget` or Phase A's `flyTo` target | the honesty of the 30° annotation |
| `labelLayer.PLACEMENT` | every dimension standoff and every figure title in the topic |
| `PART_KINDS[kind].bounds` (T3) | `overallBounds`, the per-part boxes, the seating of everything above it, **and `answerData.bounds`** for every problem using that kind |
| `PART_KINDS[kind].construction` stage ids (T3) | `answerData.requiredStages` on every problem using that kind, hence `checkCompletion` |
| `resolveRotation` tokens (T3) | which corners a polygon presents, hence `polyExtent`, hence `bounds`, hence `answerData.bounds` |
| `ISOMETRIC_SCALE` | T2's Step-5 table and scale; T3's `plan.axialScale`, the construction bounds, **and `checkProjectionType`** |
| `stepDefinitions.STEPS[i].id` (T3) | `main.js`'s `enterStep` switch, `.step-panel[data-step]`, and the `stepId() === 'whole-process'` bus hook |
| `PHASES[i].id` | `goPhase`'s switch, `#phase-strip` `data-phase`, and `checkConstructionOrder`'s canonical `['a','b','c','d']` |
| Any class emitted by `uiManager`/`stepper`/`orthographicDrawer` | must exist in that topic's inline stylesheet — there is no build step to catch it |
| `state` field names (T3) | `initialState`, `loadProblem`, `simAPI.reset`, `uiManager.render`, and the bus subscribers |
| `simController` method names | every leaf that is injected with it |
| `window.simAPI` | the host site **and** `uiManager.openBrowser`/`closeBrowser`, which call `pause()`/`resume()` |

---

## 16. How To Add / Modify a Construction (Topic 2)

### 16.1 Modify an existing solid's construction

1. **Read the solid's entry in `src/shapeData.js`.** Everything about it is in one object: `dims`, `axisSymbols`, `bounds`, `body`, `views`, `construction`, and optionally `extraDims`, `trueDiameterInProjection`, `formNote`.
2. **Decide which of the five functions the change belongs to.** `construction(d)` is the Phase-C stage list. If the *shape* changes, `body(d)` and `views(d)` change too, and probably `bounds(d)`.
3. **Edit `construction(d)`.** It returns an ordered array of `stage(id, label, note, draw)`:
   ```js
   stage('base', 'Base ellipse',
     'The base circle is inscribed in the bottom face of the box …',
     [{ k: 'ring', y: 0, r }])
   ```
   `label` goes on the stage note in the format `${label} — ${note}`; `note` is also what `announce()` reads.
4. **Use only existing primitive kinds** unless you are prepared to extend the engine: `axisLine {y0,y1}` · `ring {y,r}` · `poly {y,pts}` · `verticals {y0,y1,pts}` · `spokes {y,pts,apexY}` · `generators {y0,r0,y1,r1,count}` · `billboard {y,r,half?}` · `marker {y}`. All in **millimetres**, y measured **up** from the seating plane, footprints as `[x, z]` pairs.
5. **Derive footprints with the shared helpers** — `polygonPoints(circumradius(side, n), n, rot)`, `ringPoints(r, count)`, `rectPoints(hw, hd)` — so `views()` and `construction()` can never disagree about where a corner is.
6. **Check `bounds()` still describes the real enclosing box.** The pentagonal prism is the worked example: it computes its extents from the actual footprint because a pentagon does not fill its box.
7. **Check `axisSymbols`.** If the box edge no longer measures the dimension the symbol names, fix it — the hemisphere's `height: 'R'` is the precedent.
8. **Verify visually, in this order:** Step 2 (dimensions + `#dim-summary`), Step 3 (the SVG sheet), Step 4 Phase B (all three transfers land), Phase C (every stage reveals in order with its note), Phase D (the finished drawing matches), Step 5 (both forms, and the table's numbers), Step 6 (the replay).
9. **Then run the disposal check:** drag every slider fast through its full range and confirm `renderer.info.memory` (geometry + texture) is flat.
10. **Record it** in the topic's `CHANGELOG.md`. Do **not** cite a root ADR number without first resolving §13.4.

### 16.2 Add a new solid

1. Append **one object** to `SOLIDS` in `src/shapeData.js`:
   ```js
   {
     id: 'triangular-prism',
     name: 'Triangular Prism',
     blurb: 'One or two sentences shown in Step 1.',
     dims: [dim('side', 'Base side', 'a', 50, 20, 90), dim('height', 'Height', 'H', 70, 20, 110)],
     axisSymbols: { width: 'L', depth: 'B', height: 'H' },
     bounds: (d) => { /* the real enclosing w × d × h, in mm */ },
     body:   (d) => ({ kind: 'prism', r: circumradius(d.side, 3), h: d.height, sides: 3, rot: Math.PI / 3 }),
     views:  (d) => ({ front: {w,h,shapes}, top: {w,h,shapes}, side: {w,h,shapes} }),
     construction: (d) => [ stage(...), stage(...), stage(...) ],
   }
   ```
2. **That is the whole change**, *if* `body.kind` is one of the six existing kinds and every `draw` primitive and every `views` primitive already exists. The picker, the dimension fields, the readout, the sheet, the axes, the box, the dimensions and all four phases pick it up automatically.
3. **If it needs a new geometry kind**, three coordinated edits in `src/shapeFactory.js`: a case in `buildGeometry`, a case in `topHalfExtent` (or figure titles misplace), and a case in `silhouetteSpec` if the surface is curved.
4. **If it needs a new construction primitive**, one case in `constructionEngine.primitivePositions` plus its `*Positions` helper, and document the shape in the primitive-vocabulary comment block at the top of `shapeData.js`.
5. **If it needs a new 2D view primitive**, one case in `orthographicDrawer.renderPrimitive`.
6. **If a dimension may be withheld**, mark the field `optional: true` and give it `autoLabel`, `auto(d)` and `autoNote` — the frustum's top diameter is the worked example. No interpreter needs a branch; `resolveDims` and `uiManager.buildField` read the flags.
7. **If a size cannot be carried by a box edge**, declare `extraDims(d) => [{ symbol, from:[x,y,z], to:[x,y,z], push:[x,y,z] }]` in mm.
8. **If it is drawn at true size in both forms**, set `trueDiameterInProjection: true` and supply a `formNote` — Step 5 reads both and owns no list of which solids are special.
9. Verify per §16.1 step 8–10.

### 16.3 Add or change a construction phase

**Higher risk.** The four phases are structural:
- `PHASES` in `src/constructionSteps.js` — the copy and the `id`/`letter`/`label`.
- `#phase-strip` in `index.html` — one `.flow-strip__node[data-phase]` per phase, authored in markup.
- `goPhase(id)` in `main.js` — a branch per phase, in **both** the animated and the `animate: false` path.
- `applyStepState()` — restores `state.phase ?? 'a'`.

All four must move together. Note Topic 3 builds its strip from `PHASES` (`buildPhaseStrip()`), so the same change there is one file fewer.

---

## 17. How To Add / Modify a Problem (Topic 3)

### 17.1 Add a new problem — the happy path

**Append one object to `PROBLEMS` in `src/problemLibrary.js`. Nothing else.**

```js
{
  id: 'ndb-17-25-cube-on-slab',                 // unique; 'practice-…' is reserved
  title: 'Cube on a rectangular slab',
  question: 'A cube of 40 mm edge is placed centrally on a rectangular slab of size 80x60 mm and thickness 20 mm. Draw the isometric view of the combination.',   // VERBATIM
  category: 'combinations',                     // must match a CATEGORIES[].id
  source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Problem 17-25', adapted: false },
  difficulty: 'intermediate',
  learningObjective: 'Stand one box on another and construct each solid inside its own.',

  solid: [                                       // BOTTOM FIRST
    { id: 'slab', part: 'box', w: 'slabLength', d: 'slabWidth', h: 'slabThickness' },
    { id: 'cube', part: 'box', w: 'edge', d: 'edge', h: 'edge',
      seat: { on: 'slab' }, align: 'centred' },
  ],

  dimensions: {                                  // every key referenced above must exist here or in `derived`
    edge:          { symbol: 'a', label: 'Cube edge',      value: 40, min: 20, max: 90 },
    slabLength:    { symbol: 'L', label: 'Slab length',    value: 80, min: 40, max: 120 },
    slabWidth:     { symbol: 'B', label: 'Slab width',     value: 60, min: 30, max: 110 },
    slabThickness: { symbol: 't', label: 'Slab thickness', value: 20, min: 10, max: 50 },
  },
  // derived: { radius: (d) => d.diameter / 2 },  // only if a part parameter is not typed directly

  axisSymbols: { width: 'L', depth: 'B', height: 'H' },
  projectionType: 'view',                        // 'projection' | 'view' | 'either'

  answerData: {
    scale: 1,                                    // 1 for a view, 0.816 for a projection
    bounds: { width: 80, depth: 60, height: 60 },// TRUE size, mm — compute by hand and CHECK (§17.3)
    // parts: { cube: { scaled: true } },        // only where the sphere rule bites
    // requiredStages: ['box-done'],             // stage ids from solidCatalog, not part ids
  },

  hints: [                                       // ordered, scaffolded, never the answer
    'Build from the bottom up: the slab first, complete, then the cube on its finished top face.',
    '"Centrally" means the two share one vertical axis.',
    'Overall height is the slab plus the cube — 20 and 40 stacked, not 40.',
  ],
  tags: ['cube', 'slab', 'combination', 'stacking'],
}
```

### 17.2 The authoring rules that will bite you

1. **`question` is verbatim.** Character for character, including `(i)`/`(ii)` clauses, `H.P.`/`VP` spellings and `80x60 mm`. If you shortened or generalised it, set `source.adapted: true`.
2. **Part parameters hold dimension KEYS, not numbers.** `{ part:'revolve', rBottom:'radius', … }`. A literal number is allowed and passes through (`rTop: 0` for a cone). A key that resolves to nothing becomes `0` silently — the most likely authoring mistake.
3. **`derived` runs last** and sees the settled values, so `radius: (d) => d.diameter / 2` and `circum: (d) => circumradius(d.baseSide, 6)` are both safe.
4. **Parts are listed bottom-first** and each carries `seat: { on: '<id of a part already listed>' }`. Seating on a part not yet listed pushes a fault into `model.problems` and the part falls to the ground.
5. **`align: 'centred'`** (the default) or `{ dx, dz }` in mm.
6. **A sphere on a flat top needs no tangency maths.** `mode: 'flat'` gives `originY = topY` in every problem in this module, whatever the size of the face. `mode: 'rim'` is reserved and **not implemented** — it reports a fault.
7. **`rot`** is a token, not radians: `'flatToVP'` / `'edgeToVP'` (both `π/sides`) or `'cornerToVP'` (`0`). It applies only to a part with `sides`.
8. **`orientations`** is currently **display-only** — the first entry is used and there is no UI to switch (§14.1 E). Authoring a second entry changes `checkDimensions` to compare the sorted *set* of sizes rather than the named keys.
9. **`answerData.bounds` is at TRUE size**, never the reduced drawing size, and it should be on every problem — a checker that returns `null` there would let a wrong overall size go green.
10. **`requiredStages` are stage ids from `solidCatalog.js`**, not part ids: `box-done` · `base` · `top` · `apex` · `slant` · `join` · `edges` · `generators` · `centre` · `outline` · `dome`. `progress.stagesDone` records `stageId`, so a stage id shared by two parts is satisfied by either.
11. **`answerData.parts` keys are part ids** from your own `solid` array. Only supply it where `trueDiameter` bites — a sphere or hemisphere in a `projection` problem — and give it **both** halves: `{ scaled: false, centreHeightScaled: true }`.
12. **Hints name what to look at, never the number to type.**
13. **A withheld size** is `given: false` plus `auto(d)` and `autoNote` on the `DimSpec`. `loadProblem` seeds `state.unspecified` from `withheldDims(p)`, so the dock shows it as unknown from the start.
14. **`step` on a `DimSpec` defaults to 1** and `unit` defaults to `'mm'`.

### 17.3 Computing `answerData.bounds` correctly

This is the one number you must derive by hand, and getting it wrong makes the Sizes check fail on a correct drawing. It is `overallBounds(parts)`:

```
width  = max over parts of ( part.bounds.width  + 2·|align.dx| )
depth  = max over parts of ( part.bounds.depth  + 2·|align.dz| )
height = max over parts of ( part.originY + part.bounds.height )
```
with each `part.bounds` coming from its kind, **after** orientation:

| kind | width | depth | height |
|---|---|---|---|
| `box` | `w` | `d` | `h` |
| `revolve` | `2·max(rBottom, rTop)` | same | `h` |
| `prism` | `polyExtent(r, sides, rot).width` | `.depth` | `h` |
| `pyramid` | `max(polyExtent(r,…).width, polyExtent(rTop,…).width)` | likewise | `h` |
| `sphere` | `2r` | `2r` | `2r` |
| `hemisphere` | `2r` | `2r` | **`r`** |

where `polyExtent(r, sides, rot)` = the span of `polygonPoints(r, sides, rot)` in x and z.

Worked check — problem 7 (`mqp-q8-sphere-on-hex-prism`), hexagon side 35 → `circum = 35/(2·sin(π/6)) = 35`, `rot = flatToVP = π/6`:
- prism width across corners `= 2 × 35 = 70`; depth across flats `= 2 × 35 × cos(π/6) = 60.62` → `60.6` ✔
- prism height 60, sphere `2r = 40` seated at `originY = 60` → overall height `100` ✔
- sphere width 40 < 70, so width stays 70 ✔
- `answerData.bounds = { width: 70, depth: 60.6, height: 100 }` ✔ matches the shipped value.

**The quick empirical route:** author the problem with a placeholder `bounds`, load it, and read the three values off `#dim-summary` in Step 2 (they are `model.dimSpecs[i].value`, i.e. `round1(model.bounds[axisKey])`). Then write those numbers back. Tolerance is ±0.5 mm.

### 17.4 Modify an existing problem

1. Locate it by `id` in `PROBLEMS`.
2. Change the wording → `question` (keep it verbatim), `title`, `learningObjective`, `hints`, `tags`.
3. Change a stated size → the `value` in the matching `DimSpec`, **and `answerData.bounds`** (§17.3).
4. Change the form asked for → `projectionType` **and** `answerData.scale` (`0.816` ↔ `1`) — they must agree or `checkProjectionType` fails on a correct drawing.
5. Change the solid → `solid[]`, plus any `dimensions`/`derived` keys it references, plus `answerData.bounds`, plus `requiredStages` if the stage ids changed.
6. Move it to a different group → `category` (must match a `CATEGORIES[].id`).
7. Re-verify: load it, walk all six steps, drive Phases A–D **in order**, and confirm every finding at Step 6 is `pass` (or a deliberate `pending`).

### 17.5 Add a new category

Append `{ id, label, blurb }` to `CATEGORIES` and set `category` on the problems that belong to it. `groupByCategory` renders in `CATEGORIES` order and skips empty groups, so an unused category is invisible.

### 17.6 Add a new part kind

Only needed for a solid that is genuinely not one of the six. Four coordinated edits:
1. `solidCatalog.PART_KINDS.<newKind>` — declare `bounds`, `body`, `views`, `construction` (and `trueDiameter` if it applies). Author it **resting on its own `y = 0` and centred in plan**.
2. `geometryFactory.buildGeometry` — a case for the new `body.kind`.
3. `geometryFactory.silhouetteSpec` — a case if the surface is curved.
4. `constructionEngine.primitivePositions` — only if `construction()` needs a primitive that does not exist yet.

Also update `geometryFactory.topHalfExtent` for consistency, even though Topic 3 does not currently call it (§14.1 D).

### 17.7 Add a new validation check

One pure function in `answerValidator.js` with the signature `(model, problem, plan, progress) => Finding | null`, appended to the frozen `CHECKERS` array. It must:
- return `null` **only** when the question genuinely does not fix that property;
- never touch the DOM, never mutate state, never fill in a control;
- name **what to look at**, never the number to type;
- use `near(a, b)` (±0.5 mm) for any numeric comparison.

`uiManager.renderFindings` paints whatever shape you return; `summarise` folds the statuses.

---

## 18. Important Constants and Configuration

### 18.1 Scale and units

| Constant | Value | File | Controls |
|---|---|---|---|
| `MM_PER_UNIT` | `10` | `shapeData.js:28` / `helpers.js:12` | The platform scale: **1 world unit = 10 mm**. Applied only at the boundary by `toWorld()`, never by rescaling data. |
| `ISOMETRIC_SCALE` | `0.816` | `shapeData.js:623` / `helpers.js:22` | The isometric-projection foreshortening, `cos(35°16′)/cos(30°)`. T2's Step-5 scale and comparison table; T3's `plan.axialScale`, construction bounds, and `checkProjectionType`. |
| `CHECK_TOLERANCE_MM` | `0.5` | `helpers.js:25` | Every validator comparison. Enough for slider granularity, not enough to green a wrong drawing. |
| `round1(v)` | `Math.round(v*10)/10` | `helpers.js:69` | The precision every readout and dimension label is written at. |

### 18.2 Angles

| Constant | Value | File | Controls |
|---|---|---|---|
| `DIRECTIONS.isometric` | `(1,1,1).normalize()` | `cameraRig.js:36` | **The isometric position.** 30° emerges from this, it is never written as a constant. |
| `AXIS_SPECS` dirs | height `(0,1,0)`, width `(-1,0,0)`, depth `(0,0,-1)` | `constructionEngine.js:51` | The three isometric axis directions. |
| `ISO_DIR` | `(1,1,1).normalize()` | `main.js:535` (T2) | The sight-line the 30° claim is true from. |
| `ISO_FADE_START` | `2.5` (deg) | `main.js:544` (T2) | The annotation is fully shown within this angle of the sight-line. Tight on purpose: the axes drift ~1° per 3° of orbit. |
| `ISO_FADE_END` | `12` (deg) | `main.js:545` (T2) | The annotation is gone by here. |
| `resolveRotation` | `cornerToVP → 0`; `flatToVP`/`edgeToVP`/default → `π/sides` | `solidCatalog.js:343` | How a polygon meets the picture plane. |
| Pyramid/prism `rot` | `Math.PI/4` (square), `Math.PI/5` (pentagon) | `shapeData.js` | Turns a square base's edges square to the world axes. |
| `BASE_FOV` / `FLATTEN_FACTOR` / `FLAT_FOV` | `45` / `14` / `≈2.96°` | `main.js:48-55` (T1) | Topic 1's parallel-projection trick. Under 45° the receding edges project at ~36.6°. |

### 18.3 Camera

| Constant | Value | File | Controls |
|---|---|---|---|
| `PerspectiveCamera` | `fov 45`, `near 0.1`, `far 200` | T2 `main.js:1348`, T3 `viewport.js:42` | The working lens. T1 uses `near 0.5, far 400` for its flattened pose. |
| initial position | `(6, 6, 6)` | same | Before `snapTo(pose('threeQuarter'))`. |
| `FRAMING` | front/top/side `2.6`, threeQuarter `3.4`, **isometric `4.2`** | `cameraRig.js:47` | Multiplier on the content radius. The isometric value is loosest so Steps 4/6 hold the box, the axis overshoot and the outboard dimensions. |
| `DIRECTIONS.threeQuarter` | `(0.62, 0.42, 0.75).normalize()` | `cameraRig.js:35` | The default pictorial angle. |
| `DIRECTIONS.top` | `(0, 1, 0.02).normalize()` | `cameraRig.js:33` | The `0.02` keeps OrbitControls off its polar singularity. |
| `flyTo` default duration | `1300` ms, `easeCamera` | `cameraRig.js:97` | Every call site overrides: 800/900/1000/1100/1200/1400/1700. |
| Phase A framing | `focus.radius * 1.5` | `main.js:805` (T2) | Opened up because the axes spread *from* the corner. |
| Step 5 framing | `focus.radius * 1.06` | `main.js:914` (T2) | Framed for the larger form, so switching never crops or lurches. |
| `minDistance` / `maxDistance` | `1.5`/`60` (T2), `2`/`60` (T3) | | Orbit clamp. |
| `dampingFactor` | `0.08` | | |
| `contentFocus()` | `center (0, h/2, 0)`, `radius 0.5·√(w²+d²+h²)` | `main.js:405` | Half-diagonal framing, so no auto-zoom chases the geometry. |

### 18.4 Line weights (`tokens.js` `WEIGHT`)

| Role | Value | Meaning |
|---|---|---|
| `axis` | `3.0` | The heaviest guide — everything springs from the axes. |
| `finished` | `2.4` | Visible edges of the completed drawing. |
| `construction` | `1.6` | Bounding box + construction linework — deliberately thinner than a finished edge. |
| `transfer` | `1.4` | The flying dimension token's linework. |
| `dimension` | `1.1` | **The thinnest thing in the scene**: a dimension annotates the drawing, it is not part of it. |

The hierarchy is the teaching device — it is the Two-Cue partner (weight) to the grey/ink colour difference.

### 18.5 Colour tokens (`:root` in `index.html`) and role bindings (`tokens.js` `ROLE_COLOR`)

| Token | Value | Role bound to it |
|---|---|---|
| `--color-paper` | `#ffffff` | scene background; raised control fills |
| `--color-panel` | `#f0f2f5` | wizard, dock, cards |
| `--color-solid-fill` | `#e7e1d4` | `solid` — solid faces, so ink edges read |
| `--color-ink` | `#06070b` | `finished`, `axis` — body text and visible edges |
| `--color-ink-secondary` | `#5a5d66` | secondary text, dimension values |
| `--color-bench-grey` | `#938b7b` | `construction`, `transfer`, `dimension` |
| `--color-border` / `--color-track` | `#e0e1e5` | 1px seams; slider groove |
| `--color-accent` | `#1f66b5` | focus, primary action, selection — **chrome only** |
| `--color-accent-strong` | `#17539b` | hover / active |
| `--color-accent-soft` | `#e3ecf7` | current-step wash, hint background |
| `--color-success` / `--color-success-soft` | `#2e7d52` / `#e2efe8` | status, always paired with an icon |
| `--color-hp-line` | `#007f7c` (teal) | `hp` — the **top** view / HP |
| `--color-vp-line` | `#bc5d1e` (amber) | `vp` — the **front** view / VP |
| `--color-pp-line` | `#7a5ea6` (violet) | `pp` — the **side** view / PP |

**No JS file in Module 4 contains a colour literal.** Every colour is read at runtime through `cssVar` / `cssColor` / `roleColor`.

### 18.6 Spacing, radius, type, motion, layering (the rest of `:root`)

```
--space-1..6     4 · 8 · 12 · 16 · 24 · 32 px          (4px base scale)
--radius-xs/sm/md   4 · 6 · 10 px
--font-sans      "Atkinson Hyperlegible", system-ui, …   (UI + body)
--font-mono      "IBM Plex Mono", ui-monospace, …        (numeric readouts, tabular figures)
--text-xs/sm/base/lead/title   0.75 · 0.875 · 1 · 1.125 · 1.35 rem
--dur-fast/base/step           150 · 200 · 380 ms
--ease-standard  cubic-bezier(0.22, 1, 0.36, 1)          ← matched EXACTLY by anim.js easeStandard
--z-notice / --z-overlay       100 / 120
--ring-focus     0 0 0 3px color-mix(in srgb, var(--color-accent) 26%, transparent)
--shadow-md      0 4px 16px color-mix(in srgb, var(--color-ink) 12%, transparent)
```
`body` sets `font-variant-numeric: tabular-nums` globally.

### 18.7 Easing curves (`anim.js`)

| Curve | Control points | Used for |
|---|---|---|
| `easeStandard` | `(0.22, 1, 0.36, 1)` | the default; matches `--ease-standard` exactly so JS and CSS motion line up |
| `easeCamera` | `(0.76, 0, 0.24, 1)` | every camera flight |
| `easeFold` | `(0.83, 0, 0.17, 1)` | the "flatten to 2D" hinge (Topic 1) |
| `easeDraw` | `(0.25, 1, 0.5, 1)` | projection draw-ons |
| `easeDissolve` | `(0.5, 0, 0.75, 0)` | the 3D solid dissolving into its flat drawing (Topic 1) |

**No-overshoot rule:** every control-point Y stays within `[0,1]`.

### 18.8 Animation durations

| Constant | Value | Where |
|---|---|---|
| `AXIS_STAGGER` | `300` ms (T2) / `280` ms (T3) | delay between successive axes |
| `AXIS_GROW` | `520` ms | one axis growing out of the corner |
| box grow | `700` ms (T2) / `600` ms (T3) | Phase B |
| box hide | `380` ms | |
| stage reveal | `520` ms (T2) / `420` ms (T3) | Phase C |
| stage hide | `320` ms (T2) / `200` ms (T3) | |
| finished-solid fade-in | `760` ms (T2) / `480` ms (T3) | Phase D |
| `fadeMaterial` default | `480` ms (T2) / `420` ms (T3) | |
| `setDim` animated fade | `420` ms | dimension linework |
| face highlight | `280` ms | |
| Phase-B transfer cadence | `1000 + i × 1250` ms | `main.js:826` (T2) |
| `transferLayer.fly` | `760` ms + `420` ms settle | |
| `FLOW_NOTE_HOLD` | `4500` ms | the viewport note's dwell, + `240` ms fade-out |
| `FADE_MS` | `220` ms | `labelLayer` — must stay in step with the CSS `--dur-base` transition on `.vp-label` |
| flow-strip node reveal | `220` ms per node | `showStrip` |
| Step-5 form scale | `620` ms | `applyFormMode` |
| Topic 1 solid cross-fade | `620` ms each, `300` ms overlap | `setActiveSolid` |
| `SUMMARY_TIMING` | views 0 · axes 2200 · box 4200 · shape 6600 · finish 9600 · close 11600 | Step 6 |
| Step-6 stage fan-out | `i × 520` ms | `playSummary` |
| boot watchdog | `15000` ms | `index.html` |

Under `prefers-reduced-motion` every one of these becomes `0` — the state still lands.

### 18.9 Geometry constants

| Constant | Value | Controls |
|---|---|---|
| `RING_SEGMENTS` | `72` | construction circles — must read as a smooth ellipse in isometric |
| `RADIAL_SEGMENTS` | `64` | every revolved body surface |
| `BILLBOARD_SEGMENTS` | `72` | the camera-facing sphere/hemisphere outline ring |
| `GENERATORS` / `count` | `12` | generators of a cone/frustum, drawn as a hand would |
| `EdgesGeometry` threshold | `20`° | which creases count as visible edges |
| `AXIS_OVERSHOOT_MM` | `14` mm | how far an axis runs past the box, so it reads as a guide |
| `MARKER_MM` | `4` mm | half-arm of the apex/centre cross |
| growth rest scale | `0.0001` | not `0` — a zero scale is a degenerate matrix |
| hemisphere dome | `SphereGeometry(r, 64, 16, 0, 2π, 0, π/2)` + `CircleGeometry(r, 64)` cap | manifold, nothing coincident |

### 18.10 Dimension geometry (`dimensionLayer.js`, world units)

| Constant | Value | Controls |
|---|---|---|
| `OFFSET` | `0.46` | how far the dimension line stands off the span — ONE value, so the set reads as aligned |
| `GAP` | `0.07` | clear air between the measured point and its extension line |
| `OVERSHOOT` | `0.13` | how far the extension line runs past the dimension line |
| `ARROW_L` | `0.24` | arrowhead length; full width is `ARROW_L/3` (the Type-B 3:1 cue) |
| arrow half-width | `ARROW_L/6 = 0.04` | half of `ARROW_L/3` |
| `LABEL_LIFT` | `0.2` | lift of the value above the dimension line |
| `MIN_INNER` | `ARROW_L × 2.6 = 0.624` | below this span the arrows turn **outward** — why a 20 mm cube still reads cleanly |
| outward tail | `ARROW_L × 1.6` | how far the dimension line extends past each end when arrows are outward |

### 18.11 Label placement (`labelLayer.js` `PLACEMENT`)

| Constant | Value | Space | Controls |
|---|---|---|---|
| `outboard` | `0.34` | world | a dimension label pushed off the edge it measures |
| `crown` | `0.55` | world | a title lifted above the top of the solid |
| `figureClearScreen` | `0.115` | **NDC** | clear air between the highest projected point and a figure title — screen space so the gap reads the same at every size |
| T3 figure lift | `0.12 · h + 0.55` | world | `main.js:221` — the fixed formula Topic 2 replaced with measurement (§14.1 D) |

### 18.12 Overlay constants

| Constant | Value | File | Controls |
|---|---|---|---|
| `ARC_R` | `52` CSS px | `isoAngles.js:29` | Arc radius — fixed, so the annotation reads the same at any zoom |
| `LABEL_GAP` | `17` px | `isoAngles.js:31` | how far past the arc the "30°" is written |
| `DATUM_SPAN` | `2.05` | `isoAngles.js:33` | half-length of the horizontal datum, as a multiple of `ARC_R` |
| baseline nudge | `+4` px | `isoAngles.js:135` | keeps the type optically centred on the bisector |
| `TOKEN_W` / `TOKEN_H` | `46` / `22` px | `transferLayer.js:28` | the flying token's plate — sized for `ØD`, the longest symbol shipped |

### 18.13 Sheet layout (millimetres in a `viewBox`)

| Constant | T2 | T3 | Controls |
|---|---|---|---|
| `LEFT_PAD` | `26` | — | the left annotation column (X end-mark, VP/HP tags) |
| `MARGIN` | `12` | `14` | outer gutter |
| `CAP` | `11` | — | the band a view's caption is written in |
| `GAP` | `22` | `22` | between the front view and the views projected off it |
| `OVERRUN` | `8` | — | how far the XY line and each projector overrun the drawing |
| px multiplier | — | `× 1.6` | T3 sets the SVG `width`/`height` to `1.6 ×` the mm viewBox |

### 18.14 Rendering and platform configuration

| Setting | Value | Controls |
|---|---|---|
| Three.js version | `0.160.0`, pinned in the import map | the only runtime network dependency |
| `setPixelRatio` | `Math.min(devicePixelRatio, 2)` | caps the drawing-buffer cost on HiDPI |
| `antialias` | `true` | |
| `shadowMap.enabled` | `false` | the Flat-Ink rule |
| `AmbientLight` | `0.85` | flat CAD fill |
| `DirectionalLight` | `0.55` at `(5,8,6)` (T2) / `0.45` at `(4,8,6)` (T3) | the single key |
| `polygonOffset` (bodies) | `+1 / +1` | stops faces z-fighting the outline |
| `polygonOffset` (face highlights) | `-1 / -1` | floats the quad in front of the box face |
| frame-delta clamp | `Math.min(now - last, 64)` ms | stops a tab-switch spike jumping every tween |
| responsive breakpoints | `768` px (mobile notice), `900` px (layout) | |
| minimum target size | `44` px | |

### 18.15 Data-model configuration

| Item | Value | Where |
|---|---|---|
| Solids (T2) | 10 | `shapeData.SOLIDS` |
| Geometry kinds (T2) | 6 — `box` `revolve` `prism` `pyramid` `sphere` `hemisphere` | `shapeFactory.buildGeometry` |
| Construction primitives (T2) | 8 — `axisLine` `ring` `poly` `verticals` `spokes` `generators` `marker` `billboard` | `constructionEngine.primitivePositions` |
| View primitives | 5 — `rect` `circle` `poly` `line` `arc` | `orthographicDrawer` |
| Steps | 6 | `constructionSteps.STEPS` / `stepDefinitions.STEPS` |
| Phases | 4 — `a` `b` `c` `d` | `PHASES` |
| Summary chain (T2) | 5 links | `SUMMARY_CHAIN` |
| Problems (T3) | **14** | `problemLibrary.PROBLEMS` |
| Categories (T3) | 4 | `problemLibrary.CATEGORIES` |
| Practice solids (T3) | 10 | `practiceSolids.PRACTICE_SOLIDS` |
| Part kinds (T3) | 6 | `solidCatalog.PART_KINDS` |
| Construction primitives (T3) | 9 (adds `edges`) | `constructionEngine.primitivePositions` |
| Orientations (T3) | 3 — `axis-vertical` `axis-horizontal-x` `axis-horizontal-z` | `solidComposer.ORIENTATIONS` |
| Rotation tokens (T3) | 3 — `cornerToVP` `flatToVP` `edgeToVP` | `solidCatalog.resolveRotation` |
| Validators (T3) | 6 | `answerValidator.CHECKERS` |
| Default subject (T3) | `practice-cube` | `practiceSolids.DEFAULT_PRACTICE_ID` |
| Default solid (T2) | `SOLIDS[0]` = `cube` | `shapeData.SOLIDS` |
| Default form | `view` (T2 `state.formMode`) / from `projectionType` (T3) | |

---

## 19. Known Issues

Only items verifiable from the code or the existing documentation. Ordered by likely impact on our assigned work.

**1. Topic 3 has no 30° annotation and no dimension-transfer animation.** **[CONFIRMED]**
`index.html:1585-1586` declares `#vp-angles` and `#vp-transfer` as bare `<div>`s. There is no `src/isoAngles.js` and no `src/transferLayer.js` in Topic 3, nothing mounts into those elements, and no CSS rule targets them. Meanwhile Topic 3's Phase A note still asserts *"two receding to either side at 30° to the horizontal"* and its Phase B note still says the sizes are carried *"from the front view / top view / side view"* — both now claims rather than demonstrations. Topic 3's `CLAUDE.md` states divergence from Topic 2 is a defect unless an ADR says otherwise, and lists exactly one sanctioned divergence (Step 6). This is not it.

**2. `simController.setOrientation()` is unreachable, so two questions are half-answerable.** **[CONFIRMED]**
`main.js:748` defines it; nothing calls it. `state.orientationId` is fixed at load to `p.orientations?.[0]`. `ndb-17-12-cylinder` and `kcj-16-10-cone` both ask for *"(i) vertical and (ii) horizontal"*, and only (i) can be drawn. The composer's `ORIENTATIONS` table, `rotateShape`, and `checkDimensions`'s set-comparison branch are all implemented and waiting.

**3. Topic 3 resizes `LineMaterial.resolution` with CSS pixels, not drawing-buffer pixels.** **[CONFIRMED]**
`main.js:847-853` passes `viewport.size()` (which returns `clientWidth`/`clientHeight`) where Topic 2 passes `renderer.domElement.width/height`. On `devicePixelRatio > 1` fat-line widths would be wrong after any resize. The initial build is correct in both topics.

**4. Topic 3's phase staggers use untracked `setTimeout`s.** **[CONFIRMED]**
`main.js:287` and `main.js:307`. Topic 2 tracks the equivalent timers in `sequencerBeats[]` and clears them on every phase change; Topic 3 has no equivalent list and no sequencer. A rapid phase change or a problem load mid-stagger can let a stale beat write to a disposed material.

**5. Topic 3 places figure titles by a fixed formula.** **[CONFIRMED]**
`main.js:221`: `0.12 * h + 0.55`. Topic 2's `CHANGELOG.md` documents three failed modelling approaches before it replaced exactly this with per-frame measurement, with the measured gap improving from 96–148 px to 22–44 px. `geometryFactory.topHalfExtent()` — the helper needed — is exported and unused.

**6. The ADR and RULES citations in the Module-4 `CLAUDE.md` files do not resolve against the root documents.** **[CONFIRMED]** — see §13.4 for the full evidence. ADR-043…ADR-059 and §3.33–§3.41 / §6.21–§6.30 are all occupied by other modules in the root files, and §3.27a / §4.21 / §4.22 / §4.23 do not exist there at all.

**7. No Module-4 topic is registered in `ARCHITECTURE.md`.** **[CONFIRMED]**
`grep "module_4" ARCHITECTURE.md` returns one hit, inside another topic's entry. Topic 3's `CLAUDE.md` claims *"the topic is registered in `../ARCHITECTURE.md` §2"*; it is not.

**8. `problem.steps` (`{disable, insert}`) is documented in the schema and unimplemented.** **[CONFIRMED]**
`problemLibrary.js:105`. No problem uses it; no code reads it.

**9. Topic 3's `state` declares four fields nothing writes.** **[CONFIRMED]**
`stepIndex`, `ui.libraryOpen`, `ui.hintsShown`, `selection.partId`. Each has a real owner elsewhere.

**10. `initialProjectionMode().learnerChoosable` is computed and never read.** **[CONFIRMED]**
`projectionResolver.js:64`. Both form buttons render unconditionally.

**11. `uiManager.js` (T3) imports two behaviour leaves.** **[CONFIRMED]**
`./dimensionResolver.js` and `./projectionResolver.js` — neither is in the topic's own list of stateless shared utils. The imported surface is two pure functions, one of which (`optionalDims`) is then never called.

**12. Topic 3's mobile notice is evaluated once at boot.** **[CONFIRMED]**
`main.js:628`. Topic 2 uses a live `matchMedia` listener.

**13. `anim.js` is not byte-identical to the Module2 master.** **[CONFIRMED]**
Module2's copy is CRLF, all three Module-4 copies are LF; content is identical (`tr -d '\r'` gives the same hash). The `CLAUDE.md` claim "byte-identical" is true in content only. Root `CHANGELOG.md`:161 independently records this drift.

**14. Topic 3's `PHASES` copy is not verbatim Topic 2's, though `stepDefinitions.js` claims the steps are.** **[CONFIRMED]**
Labels differ (`Axes`/`Box`/`Shape`/`Finish` vs `Draw the axes`/`Build the box`/`Construct the shape`/`Finish the drawing`) and the notes are re-worded to mention combinations. The `STEPS` themselves *are* verbatim. The file's own header claims verbatim for the steps only, so this is a `CLAUDE.md`-level imprecision rather than a code defect.

**15. `orthographicDrawer.setDrawn()` is a no-op in Topic 3.** **[CONFIRMED]**
`orthographicDrawer.js:185`, documented as deliberate so `main.js`'s call site matches Topic 2's.

**16. Documented-but-unverified claims.** Topic 3's `CLAUDE.md` records a headless verification (all 14 problems load and reach Verify with no false failures; GL buffers/textures/programs flat at 44/4/5 across 50 rebuilds and 28 problem loads; reset clean; `simAPI` exactly pause/reset/resume; every target ≥ 44 px; reduced-motion lands the same end state; zero console errors). **This investigation did not re-run any of it.** Treat as a claim, not as a current fact.

**Explicitly NOT issues** (recorded so they are not mis-filed): `seat: { mode: 'rim' }` is unimplemented **by design** and fails loudly; `checkDimensions` passing on load is the documented consequence of seeding the question's given data; the by-copy sharing model is the platform's intended mechanism, not accidental duplication.

---

## 20. Recommended Investigation Before Implementation

Ordered by what will block or mislead us first.

### 20.1 Do these before writing any code

1. **Establish which document is authoritative for Module 4.** §13.4 shows the topic `CLAUDE.md`s' ADR/rule citations do not resolve against the root files. Before we log any decision or follow any cited rule, agree with the lecturer/maintainer whether (a) the Module-4 ADRs were never merged, (b) they were overwritten, or (c) the topic `CLAUDE.md`s are the record of truth. This changes where our own decisions get written down.
2. **Get the lecturer's actual change requests in writing, and classify each one** against §15's boundaries: is it *data* (`shapeData.js` / `problemLibrary.js` — low risk), *copy* (`constructionSteps.js` / `stepDefinitions.js` / `.step-panel` markup — low risk), *chrome* (`uiManager.js` / `index.html` — medium), or *engine/orchestrator* (high)? The ratio tells us the shape of the work.
3. **Run both sims and walk all six steps in each**, with the browser console open. Specifically confirm at first hand: Topic 3 really has no 30° arcs and no flying transfer token (§19.1); the Phase-B transfer in Topic 2 fires three times and lands three callouts; and no console warning appears from `auditComposition`.
4. **Establish the memory baseline before touching anything.** In each topic, record `renderer.info.memory` and `renderer.info.programs`, then drag a slider through its full range 50 times and re-read. That number is the acceptance criterion for every change we make to the rebuild path.
5. **MD5 the seven shared leaves** and keep the list (§15.3). It is the only guard against silently diverging Topics 2 and 3.
6. **Confirm the deployment/serving story.** The sims are served from XAMPP `htdocs`; the import map points at a public CDN. Verify Three.js actually loads in the target environment (a campus firewall is the exact scenario the 15 s boot watchdog exists for), and whether the host embeds these in an iframe.

### 20.2 Read these files, in this order, before touching Topic 2

1. `graphics_module_4_topic_2_isometric_construction/CLAUDE.md` — the design brief and the scope boundaries.
2. `src/shapeData.js` — the data model *is* the architecture; the header comment is the contract.
3. `main.js` `rebuild()` / `disposeScene()` / `enterStep()` / `applyStepState()` — the four functions that govern everything.
4. `main.js` `goPhase()` — both branches (animated and `animate: false`).
5. `src/constructionEngine.js` — the growth trick and the one switch.
6. `CHANGELOG.md` — the 2026-07-20 entry documents *why* the dimension layer, the dedupe and the figure-title placement are the way they are, including three approaches that failed.

### 20.3 Read these files, in this order, before touching Topic 3

1. `graphics_module_4_topic_3_isometric_projection_problem_library/CLAUDE.md` — especially *"Before changing anything here, read Topic 2 first"* and the one-architectural-claim section.
2. `src/problemLibrary.js` header + one complete problem (problem 7 is the richest).
3. `src/solidCatalog.js` — the part vocabulary and the seating convention.
4. `src/solidComposer.js` — `compose()`, `ORIENTATIONS`, `overallBounds()`, `auditComposition()`.
5. `src/dimensionResolver.js` + `src/projectionResolver.js` — short, pure, and load-bearing.
6. `src/answerValidator.js` — the six checkers, and *why* `checkDimensions` never returns `null`.
7. `src/state.js` — the "nothing derived is stored" contract.
8. `CHANGELOG.md` — the `$impeccable` entries record the layout benchmark and the §4.22 class-emission sweep.

### 20.4 Specific questions to answer before implementing

**On scope and intent**
- Is the lecturer asking for **content** changes (more solids, more problems, different wording) or **behaviour** changes (new interactions, new checks)? Content is a data edit; behaviour is an engine edit.
- Do any requests fall inside a topic's declared **out of scope** list? Topic 2 explicitly excludes hidden-line conventions, sectioning, auxiliary views, inclination/rotation/intersection problems, and *teaching* dimensioning rules. If a request lands there, it is a scope decision, not a coding decision.
- Should Topic 3 gain the missing 30° annotation and transfer animation (§19.1)? That is the single largest parity gap and the largest discretionary piece of work available.

**On Topic 2**
- Does any requested solid decompose into the existing six geometry kinds and eight construction primitives? If yes, it is one object in `SOLIDS`.
- Does it need a dimension the bounding box cannot carry (→ `extraDims`) or one that may be withheld (→ `optional` + `auto` + `autoNote`)?
- Does it need `trueDiameterInProjection` + a `formNote`?
- Do any requested copy changes alter the number of steps or phases? If so, four files move together (§16.3).

**On Topic 3**
- Does each requested problem decompose into the six part kinds, three orientations and three rotation tokens?
- Can I compute its `answerData.bounds` by hand and confirm it against `#dim-summary` (§17.3)?
- Does it need a new checker, or does an existing one cover it?
- Is the (ii)-horizontal half of the two orientation problems expected to work? If yes, that is a UI control plus wiring to the already-implemented `setOrientation`.
- Does anything require the problem browser to grow search or filters? `problemQuery.js` documents that these were deliberately removed and that filtering should go back *behind* the accessor, not into the browser.

**On cross-cutting risk**
- Does the change touch any of the seven byte-identical shared leaves? If so, plan the mirror edit in the same commit.
- Does it touch `graphics_module_2_topic_0_introduction_to_orthographic_projection`'s ancestry (§15.3)? A Topic 2 fix may be one that topic also needs.
- Does it emit any new CSS class from JS? There is no build step to catch an unstyled class — Topic 3's `CHANGELOG.md` records eight that silently cost the size readout its type.
- Does it add motion? It must collapse to instant under `prefers-reduced-motion` **with the state still landing**.
- Does it add a colour? It must be a token in `:root`, read through `tokens.js`, and it must not be blue inside the viewport.
- Does it add an announcement? It goes through `#sim-status` only.

### 20.5 Verification checklist for any change we make

Derived from the constraints the code already holds itself to:

- [ ] `renderer.info.memory` flat across 50 rapid slider rebuilds and (T3) 28 problem loads.
- [ ] Zero console errors, zero uncaught exceptions, zero failed requests.
- [ ] `window.simAPI` is still exactly `pause` / `resume` / `reset`, and the in-sim Reset is the only reset path.
- [ ] Reset returns to a clean initial state, behind the two-state confirm.
- [ ] `<title>` still matches `meta.json.title`.
- [ ] Every class emitted from JS exists in the inline stylesheet.
- [ ] No colour literal in any JS file.
- [ ] No blue inside the viewport.
- [ ] `prefers-reduced-motion` lands the same end state instantly.
- [ ] Every visible target ≥ 44 px; the sheet's views are still focusable and ARIA-labelled.
- [ ] The mobile notice still appears below 768 px.
- [ ] (T3) All 14 problems load, build, and reach Step 6 with no false failures.
- [ ] (T2/T3) All seven shared leaves still MD5-match between the topics.
- [ ] The topic `CHANGELOG.md` records what changed and why.

---

## Implementation Mental Model

Fifteen bullets for a developer picking this up cold.

1. **Three separate deployable sims, not one app.** Each folder has its own `index.html` + `main.js` + `src/` + fonts + a *copy* of every shared file. No cross-imports exist anywhere.
2. **No build step, no npm.** Three.js `0.160.0` from a CDN via an import map; a 15 s boot watchdog shows a fallback panel if it never evaluates. Every stylesheet and every design token is inline in `index.html`.
3. **The data model *is* the architecture.** Topic 2: a solid is one object in `shapeData.js`. Topic 3: a problem is one object in `problemLibrary.js`, built from parts in `solidCatalog.js`. Every consumer owns exactly **one `switch`, over a bounded kind vocabulary** — never over solid names or problem ids.
4. **`main.js` is a conductor with no domain knowledge** — no linework maths, no solid definitions, no step copy, no label offsets, no timing tables. Leaves never import each other; they are injected with a `simController`.
5. **One pipeline: `rebuild()`.** Dispose → resolve data → build solid → build construction → build dimensions + labels → draw the SVG sheet → reframe → notify. Every control routes here; nothing else touches the scene graph. That is what keeps a fast slider drag from leaking GL resources.
6. **Re-assert, don't restart.** A dimension edit calls `rebuild()` then `applyStepState()` — it lands the same visual state instantly and leaves the camera where the learner put it. Re-entering the step would strobe the viewport on every slider tick.
7. **Six steps, four phases, and the order is the lesson.** Steps 1–6 are the same in both topics. Step 4 advances through Phase **A** axes → **B** box → **C** shape → **D** finish, and the phases are **cumulative**. A step is reachable once visited; upcoming steps stay locked.
8. **The growth trick.** Axis and box geometry is written *relative to the origin corner* and parented to a group positioned there, scaled `0.0001 → 1`. That draws the lines out of the corner — the motion a hand makes — with no geometry rewritten per frame.
9. **1 world unit = 10 mm.** All data is in millimetres; `toWorld()` divides by 10 at the boundary and nowhere else. Five coordinate systems are in play (engineering mm, world, view-mm, SVG-y-down, screen CSS px) and every conversion is written explicitly in `main.js`.
10. **30° is never a constant — it emerges from the `(1,1,1)` camera direction.** Under a *perspective* camera that claim is only locally true, so Topic 2 aims the camera at the construction origin and fades the annotation out as the camera leaves the sight-line (2.5° → 12°). Topic 1 solves the same problem by dollying back ×14 with a matching narrow FOV. **Topic 3 has no 30° annotation at all.**
11. **`ISOMETRIC_SCALE = 0.816` is the entire difference between the two forms.** Topic 2 scales the *same* geometry rather than rebuilding it, because rebuilding would imply the method differs. Topic 3 splits it into two numbers per part — `scale` (drawn size) and `originScale` (where it sits) — which is exactly what makes the **sphere rule** expressible: a sphere is drawn at true diameter but its centre still sits at isometric height.
12. **Topic 3 = Topic 2 + a problem library.** Same six steps, same viewport, same camera, same motion. One sanctioned divergence: Step 6 verifies instead of replaying. Seven leaves are byte-identical copies — fix one, mirror the other.
13. **A practice solid IS a problem.** Same schema, minus `question` / `answerData` / `hints`. Every behavioural difference is a **data-shape** test (`Boolean(subject.question)`), never an identity test. One lookup (`getSubject`), one load path (`loadProblem`).
14. **Validation is pure and additive.** `answerValidator.js` takes the composed model + `answerData` and returns findings; `uiManager` paints them. Six checkers in one registry, ±0.5 mm tolerance, `pending ≠ fail`, and it never fills anything in — the learner dials, the check lights.
15. **The gap between the two topics is where our work lives.** Topic 3 lacks the 30° annotation, the dimension transfer, the per-frame figure-title placement, and a working orientation control — all of which Topic 2 has and all of which its own `CLAUDE.md` says it should match. Before any of it: the ADR/rule citations in both `CLAUDE.md` files do **not** resolve against the root documents (§13.4), so treat those files, not the root ADR log, as the design record for Module 4.

---

*Document produced by investigation only. No application source, UI, or existing documentation was modified.*








