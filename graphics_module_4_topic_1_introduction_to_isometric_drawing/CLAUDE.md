# CLAUDE.md — Simatrix · Module 4, Topic 1: Introduction to Isometric Drawing

A calm, guided-discovery **introduction** that builds the learner's *mental model* of Isometric
Drawing before any later topic teaches it. It answers four questions and nothing more: **why** a
single pictorial drawing exists alongside orthographic projection, **how** the two relate, **why**
orthographic views still matter, and **that** two forms — *Isometric Projection* and *Isometric
View* — exist. It is the Module-4 counterpart of the Module-1 and Module-2 introductions.

**Deliberately OUT of scope (belongs to later Module-4 topics):** the isometric scale, the 0.816
reduction factor, construction procedure (box / coordinate method), circle construction, dimension
transfer, true vs. foreshortened lengths, problem solving, and the actual *difference* between
Isometric Projection and Isometric View. This topic only **names** the two forms; it never compares
them. It teaches no angles and no scale.

## Project-wide documentation (read before cross-module tasks)
This is an **Engineering Graphics** topic, so it consumes the shared EG root docs. Before any task
that touches shared behavior, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — why key decisions were made (ADR log)
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — colour tokens, typography, component standards (the single platform design system)
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** Always read and strictly follow the consolidated platform design system at
`../DESIGN.md` for all colour, typography, spacing, component styling, and UI/UX decisions. Strategic
context lives in `../PRODUCT.md`. Never hard-code design values in CSS or JS — consume the tokens
defined in `../DESIGN.md`. This topic carries **no** local `DESIGN.md`/`PRODUCT.md` copy (RULES.md
§1.14).

**Scope boundary:** This module produces a self-contained Three.js simulation payload — the 3D
viewport plus its guided stepper, inline hints, and sim-internal animations. The host Simatrix
website (navbar, module browser, account UI, marketing chrome) is built by other developers and is
**out of scope** here.

## Architecture (this topic)

Built on **Module 2's orchestrator + leaf-module pattern** (ADR-033), but it is **standalone** — it
teaches on TWO simple solids (a square pyramid for Steps 1-3, a cube for Steps 4-6) and does not use the solids engine (`shapeData` / `iShape` /
`meshAnalyzer` / `projectionDrawer` / `vertexLabeler` / the Problem Library). It was duplicated from
`template_starter/` and adapted.

- **`main.js`** — the orchestrator. Owns the scene, the perspective camera + `OrbitControls`, the
  CSS2D label overlay, the cinematic camera flights (via `anim.js`), the ortho "views sheet" and the
  Step-6 transformation demonstration (`goFlowStage`: views → construction → finished drawing; stage
  switches abort any sequence in flight via `flowToken`), the `#vp-transfer` screen-space layer that
  carries each measurement out of a view on the sheet and onto an isometric axis (`worldToScreen` +
  `sheetViewCenter` bridge the 3D axes and the DOM sheet; width + depth come from the top view,
  height from the front view), and the closing `#iso-annotation` that names the isometric
  orientation (horizontal datum + two 30° arcs + the vertical edge). That last one drives the
  camera to `POSES.isometricFlat` — a dolly back with a matching narrow fov, so the projection is
  effectively parallel: under the working 45° lens the receding edges project at 36.6°, and a
  "30°" label on them would be measurably false. `flyCamera` tweens `fov` and applies each pose's
  orbit distance clamp, `window.simAPI`, and the single
  disposal-safe `rebuild()`. The scene is built
  **once**; the steps toggle visibility / opacity, so `rebuild()` only ever disposes an empty
  `shapeGroup` (memory stays flat — RULES.md §3.4). The scene controller is `enterStep(n)`, called by
  the stepper on every Back/Next/rail move.
- **`src/solidRig.js`** — leaf. Builds **two** teaching solids (`MeshPhongMaterial` body with
  `flatShading` + fattened `LineSegments2` ink edges, `polygonOffset` on the bodies), plus a second
  cube for the Step-5 "two forms" split, the three isometric axes from the cube's near corner, and the
  Step-6 construction as **twelve independently drawable guide segments** plus three face outlines —
  one object per line, so the construction can be drawn one line at a time as each measurement
  arrives, and the solid built one face at a time, rather than faded in whole (which read as a morph).
  All materials are `transparent` so solids can be cross-faded. Reads colours from CSS tokens; keeps
  `LineMaterial.resolution` in sync on resize.
  **Why two solids — this is the load-bearing pedagogical decision here:**
  - **Steps 1–3, a SQUARE PYRAMID.** These steps ask *why do multiple orthographic views exist?* The
    pyramid's views are unmistakably different — front → triangle, top → square (the four slant edges
    project as its diagonals), side → triangle. A solid whose three views looked alike (a cube) would
    quietly undercut the very question being asked. Built as a 4-sided `ConeGeometry` — square base,
    four identical triangular faces, apex centred by construction — spun 45° so its base edges run
    square to the world axes and the front/side views are true triangles.
  - **Steps 4–6, a CUBE.** These steps ask *what is the isometric position?* A cube's three principal
    edges lie **along** the three isometric axes, so the orientation is legible with nothing else to
    explain; a pyramid's sloping edges would fight the axes for attention.
  - The handover is a **taught moment, not a glitch**: `main.js` `setActiveSolid` cross-fades pyramid →
    cube on entering Step 4 *from Step 3* (620 ms each, 300 ms overlap) and says why in the same beat.
    Any other arrival at Step 4 just lands on the cube.
- **`src/isoSteps.js`** — pure data: the six-step rail/card copy.
- **`src/stepper.js`** — the guided-stepper controller; drives the rail + card and calls
  `sim.enterStep(n)`. A step is reachable once visited; upcoming steps stay locked.
- **`src/terms.js`** — the markup-driven inline term popovers (orthographic, isometric position,
  isometric drawing).
- **`src/onboarding.js`** — the one-time "Drag to rotate" orbit hint + contextual cue chips.
- **`src/anim.js`** — the shared tween + easing engine, **byte-identical** to Module 2's (RULES.md
  §7.1 — never edit it here; fix it in the master and re-copy).

## Platform contract (required)
- `meta.json` with all four fields; `<title>` matches `meta.json.title` ("Introduction to Isometric
  Drawing") — RULES.md §1.12.
- `window.simAPI { pause, resume, reset }`; the in-sim Reset routes through `simAPI.reset()` only —
  no second reset path (RULES.md §2.9).
- Self-starting on load; import map pins `three@0.160.0`; `.js` extensions; relative paths.
- Dismissible "Best experienced on desktop." notice below 768px.

## Cross-cutting rules
- Every scene change routes through `enterStep(n)`; geometry cleanup goes through the single
  `rebuild()` disposal contract.
- Read all colours from CSS custom properties at runtime; never hard-code hex.
- Blue stays in the chrome only — the viewport uses ink linework + tokenised fills (Chrome-Only Blue).
- Camera moves are always **eased flights, never teleports** (task requirement); everything collapses
  to instant under `prefers-reduced-motion`, but the state still updates.
- Leaf modules never import each other; they hang off `main.js`.
