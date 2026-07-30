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
set** (ADR-086 · RULES.md §6.26–§6.28). The **six-step guided stepper** tells one story — (1) meet
the cone, (2) cut it, (3) six cuts and six curves, (4) why they differ, (5) how it is drawn on
paper, (6) your turn — and each step shows ONLY the controls its own question needs. The section
plane is switched on by Step 2 itself (no toggle); Step 2 describes the cut in plain words with no
name; Step 3's six chips travel the plane to each named cut and state the textbook rule; Step 4
swings the camera to face the cut before the sheet opens beside it; Step 5 plays the construction
one stage at a time; Step 6 deals an unnamed cut and marks the learner's prediction. Before
changing a control, read the topic README's "teaching contract". The 3D half runs the restored Module-2 `cone.js` twice into a double cone
assembled in the orchestrator, cut by topic-1's `sectionCut.js` clipper used as a **curve
extractor** — the solid stays whole and its section loop is drawn on it (ADR-085), which is what
the chapter's Fig. 6.2 pictorials show. The 2D half is the Compare sheet: `drawCompare()` in
`main.js` delegates every curve, construction line and label to the pure leaf
**`src/conicEngine.js`** (ADR-084), whose sheet quantities are stored in **millimetres**, not
world units (ADR-083). Sheet scale follows the ADR-053 fixed intrinsic-frame pattern (analytic
construction footprint), with ADR-054 pan / ADR-055 zoom as pure post-multipliers. The textbook
Problem Library ships all **fifteen chapter exercises verbatim**, grouped by curve, with a
never-auto-fill self-check (±0.02 on the eccentricity, ±0.5 on every millimetre and degree).

**Content constraint (hard):** the section classification is derived from the cone ON THE BENCH,
never from a constant — `classifySection()` compares the plane's inclination against the live
`generatorAngleDeg()` (the ADR-063 precedent). There is deliberately **no "parallel to a
generator" preset**: finding that angle is the one discovery §6.1 exists to teach, and a preset
would pre-solve it. The Step-2 readout names the resulting conic and states the rule, so the
learner is told *why*, not just *what*.

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

## The 2D sheet (`src/conicEngine.js`)

- **Millimetres, y DOWN.** Sheet quantities are stored in mm (ADR-083) because the construction never enters the 3D scene and every figure in the chapter is quoted in mm. The 3D scene keeps the platform's `1 unit = 10 mm` (ADR-018) — the dock converts, the engine never does.
- **One focal-polar model.** `conicModel(e, fa)` derives the vertex, centre, second focus and directrix, semi-latus rectum, asymptotes and both axes for all three curves; there are no three separate curve code paths. θ = 0 aims from the focus BACK toward the directrix, so it lands on the near vertex — flipping that sign silently breaks PF = e·PQ for every point.
- **Display list, not immediate drawing.** Each layout returns typed primitives plus the analytic `bbox` that locks the sheet scale, and `drawSheet()` is the one renderer. A new construction is a new layout function and never a new drawing path, so the thin-construction / heavy-curve line vocabulary cannot drift between the twelve methods.
- **Every construction must be provable.** A plotted point has to satisfy its own conic to floating-point precision. The oracle that checks all twelve lives outside the payload (see README "Verifying"); re-run it after touching any layout.

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
