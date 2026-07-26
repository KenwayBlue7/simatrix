# CLAUDE.md — Simatrix Engineering Graphics Viewer — Development of Surfaces

Three.js lesson that teaches **development of surfaces**: unrolling the surface of a solid into
its true-size flat pattern (the stretch-out) — prisms, pyramids, cylinders, and cones, later
including truncated/cut solids. Ships as a self-contained ZIP that runs inside a sandboxed
`iframe` on the Simatrix platform.

**Build status:** Phase 4 (final) — the topic is feature-complete. The textbook problem
library is live: `src/problems.js` (4 verbatim shortest-path problems, tiers mirroring the
KTU method split, the "through holes" ban enforced as a hard `EXCLUDED_TYPES` type-axis
filter — ADR-069, completing ADR-065 layer 2) + `src/problemLibrary.js` (topic-1
controller port: overlay, scaffolded hints, tolerant never-auto-fill self-check ±0.5° /
±0.05 u, cuts-the-solid guard via `sim.hasCut()`). Shortest-path ("string"/"ant") problems
draw the geodesic as a straight chord on the 2D sheet AND wrap it onto the 3D solid
(`computeStringPath`/`drawStringPath` in the engine, `liftStringPathTo3D` + a fat plum
`Line2` in `main.js`, token `--color-dev-path`), revealed ONLY on a matched self-check via
the non-rebuild `commitStringPath` overlay commit — ADR-070. The terminal step carries
the "Complete & next problem" CTA + success toast. Earlier phases below. Phase 3 —
truncated developments are live end-to-end. The Module 2
solid-geometry engine is restored byte-identical (see "Geometry engine" below), `main.js` boots a
default cylinder through the single `rebuild()` pipeline, and the Compare card / 50/50 workbench
split (ADR-012 / ADR-037 port) hosts the development sheet: `drawCompare()` in `main.js` delegates
all unrolling math + Canvas2D paths to the pure leaf **`src/developmentEngine.js`** (ADR-066 —
Canvas2D on the Compare sheet, NOT a 3D-space sheet). Method split per the KTU syllabus:
Parallel-Line for prisms + cylinder, Radial-Line for pyramids + cone. Sheet scale follows the
ADR-053 fixed intrinsic-frame pattern (analytic nominal footprint, `WORLD_TO_MM = 10`), with
ADR-054 pan / ADR-055 zoom as pure post-multipliers. The **parameter dock** is wired
(`src/uiManager.js` rewritten; solid picker + cutting-plane controls, both docking into
`#workbench-rail` during the split), the **3D truncation** runs topic-1's `sectionCut.js`
analytic clipper (copied verbatim — never CSG) inside `rebuild()`'s seam, and the 2D sheet draws
the truncated pattern from `computeCutDistances()` (seated-frame plane derived per rebuild —
ADR-067/068: plane always ⊥ VP, Angle-to-HP + Cut-height controls, corner sampling at the
meshes' `polygonVertexAngle` alignment phase). Still net-new for later passes: the unroll
animation, size/pose sliders, and the problem library (through-hole exclusion axis pending).

**Syllabus constraint (hard):** problems with **through holes are excluded**. This holds
structurally on three layers: (1) the architecture bans CSG/boolean libraries outright, and the
generator family produces only closed single-shell solids — a through hole is unrepresentable by
construction; (2) when the problem library lands, it must carry a dedicated problem-`type` axis
(or never-enabled tier) that names the exclusion, mirroring topic-1's pending "true shape given"
exclusion pattern — pose-based `TIERS` cannot express it; (3) this block is the on-record notice
so no later session re-introduces pierced solids unknowingly. See root `../DECISIONS.md` ADR-065.

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
  Never use the UMD global, never use `@latest`, never `npm install three`. **No CSG/boolean library either** — a truncated solid is hand-authored geometry (the analytic single-plane clipper precedent lives in `../graphics_module_3_topic_1_sections_of_solids/src/sectionCut.js`, ADR-058), never an npm CSG package.
- **All asset paths relative** — `./assets/model.glb`, never `/assets/...`. Platform serves the extracted ZIP from an arbitrary URL prefix.
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
    reset(),   // restore defaultSolidData() + default camera; route through rebuild()
  };
  ```
  The platform calls `pause()` when overlays/whiteboard open and `resume()` on close. The in-sim Reset button must also route through `simAPI.reset()` — no second reset path.
- **`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
  `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
  sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.
- **Mobile notice.** At viewports `< 768px`, render a dismissible HTML banner reading *"Best experienced on desktop"*. Do not block, redirect, or disable the sim — banner only.
- **Self-starting.** Sim runs on page load; no external `init()` call.

## Geometry engine (restored from Module 2, byte-identical — ADR-009)

`src/{cube,cone,cylinder,genericPrism,genericPyramid,genericSolid,shapeData,iShape,meshAnalyzer}.js`
are copied verbatim from `../Module2/src/` and must stay byte-identical (RULES.md §1.3–1.4) — fix
drift in `Module2/` and re-copy, never patch the copy in place. `iShape.js` is the master's full
4702-byte version taken verbatim, a *conscious* ADR-027 resolution following the topic-1 precedent
(root `../DECISIONS.md` ADR-064): scoping is done through shapeData defaults in `main.js`, never
by trimming `iShape.js`. `genericSolid.js` is pure polygon trigonometry (no THREE dependency) and
is the only file siblings may import (ADR-007). All five mesh generators route their pose through
`iShape.js`'s `applyShapeTransform` (Euler order `'ZXY'`, re-derived signs — ADR-005).

`main.js`'s `createSolidMesh(data)` is the `ShapeType` → generator dispatch switch, ported
verbatim from `Module2/main.js`. It is called only from inside `rebuild()`'s DOMAIN BUILD SEAM.
The topic's default boot state is `defaultSolidData()` — Module2's `defaultShapeData()` with the
shape overridden to a cylinder (axis vertical, resting on HP), keeping `shapeData.js` untouched.

**Development/unroll state lives OUTSIDE ShapeData** (mirror of topic-1's ADR-059
`commitSection` pattern): when the unroll layer lands, its state (which surface, unroll progress)
sits in `main.js` beside ShapeData and commits through its own `simController` method —
`src/shapeData.js` stays byte-identical.

## 3D engineering gotchas (read before writing rotation/unroll math)

- **Right-handed, Y-up.** Re-derive every ported or copied sign visually rather than trusting it.
- **Set `euler.order` explicitly** — `'ZXY'`, matching the restored `iShape.js`.
- **Single `rebuild(shapeData)` function is the only path for geometry changes**, non-negotiable. It runs the disposal contract (deep `traverse()` over every `shapeGroup` child — ADR-042) before building new objects. Verify with `renderer.info.memory` — geometry and texture counts must stay flat across 50 rapid regenerations.
- **Use `LineMaterial` + `LineSegments2`** (from `three/addons/lines/`) for engineering linework — standard `LineBasicMaterial` is capped at 1px on most GPUs. (The scaffold's edge overlay is the acceptable 1px placeholder.)
- **`LineDashedMaterial` requires `computeLineDistances()`** on every line object or dashes silently render as solid.
- **`polygonOffset: true`** on the solid material — without it, `EdgesGeometry` outlines z-fight with mesh faces and flicker.
- **Hard-edge geometry only.** Non-indexed `BufferGeometry` (or duplicated vertices per face) so edge extraction is clean.
- **Quantized edge welding** in `meshAnalyzer.js` (restored byte-identical): round endpoints to `1e-3` tolerance, canonical sorted edge keys — without this, cylinder rim edges double-draw. Any future cut/unroll edges must weld on the SAME lattice (topic-1 precedent).

## Visual style

Engineering textbook / CAD viewport — **not** architectural presentation. Flat ambient + single directional light, **no cast shadows** on the solid, `MeshPhongMaterial` with `shininess: 0` (no PBR). Hidden edges dashed grey; visible edges solid dark. The 2D development sheet should get its own distinct token treatment once designed — do not reuse the HP/VP projection colours for the stretch-out pattern.

## Cross-cutting rules

- Route **every** shape change through `rebuild()` — no exceptions.
- Read all colours from CSS custom properties via `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. Never hard-code hex in JS or component CSS. Single source of truth lives in `../DESIGN.md`.
- Keep `main.js` as the orchestrator; layer modules do not import each other except `genericSolid` (pure math).
- Re-derive every ported sign visually. Copying sign conventions blindly is the fastest way to produce plausible-but-wrong developments.

---

*Sources: Engineering Graphics Educational Tool README v1.3.0 + Simatrix Platform Simulation Developer Guide v1 + MODULE-STARTER.md Case A. This file supersedes both where they conflict.*

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
