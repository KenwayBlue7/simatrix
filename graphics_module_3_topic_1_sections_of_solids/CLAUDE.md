# CLAUDE.md — Simatrix Engineering Graphics Viewer — Sections of Solids

Three.js port of a Unity prototype that teaches **sectional views of solids**: cutting a solid with
a section plane and projecting the true shape of the resulting cross-section (HP / VP planes,
first-angle projection). Ships as a self-contained ZIP that runs inside a sandboxed `iframe` on the
Simatrix platform.

**Build status:** the Module 2 solid-geometry engine is restored byte-identical; the
**section-cut engine is built** (`src/sectionCut.js` — analytic single-plane clipper + welded
loop chaining + solid cap; root `../DECISIONS.md` ADR-058/059); and the **drawing
layer is built** (ADR-060/061): `src/projectionDrawer.js` is a BYTE-IDENTICAL Module2
copy drawing the first-angle top/front/side views (fix drift in `Module2/` and re-copy, never
patch here — all section-specific drawing lives in `src/sectionView.js` instead: 45°
apparent-shape hatching per view + the TRUE SHAPE auxiliary sheet drawn 1:1 from the loop's
(u,v) coordinates, revealed by wizard stage 4/5). Still net-new for later passes: the
fold-to-flat-sheet animation, dimensioning (needs a CSS2DRenderer), and the problem library —
see "Section-cut engine" below.

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
  Never use the UMD global, never use `@latest`, never `npm install three`. **No CSG/boolean library either** — a section cut is hand-authored geometry (analytic plane intersection, or `THREE.Shape` extrude + `mergeGeometries()` per the precedent in `../graphics_module_1_topic_4_understanding_orthographic_views/src/bearingBlock.js`, ADR-045), never an npm CSG package.
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
    reset(),   // restore defaultShapeData() + default camera; route through rebuild()
  };
  ```
  The platform calls `pause()` when overlays/whiteboard open and `resume()` on close. The in-sim Reset button must also route through `simAPI.reset()` — no second reset path.
- **`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
  `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
  sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.
- **Mobile notice.** At viewports `< 768px`, render a dismissible HTML banner reading *"Best experienced on desktop"*. Do not block, redirect, or disable the sim — banner only.
- **Self-starting.** Sim runs on page load; no external `init()` call.

## Geometry engine (restored from Module 2, byte-identical — ADR-009)

`src/{cube,cone,cylinder,genericPrism,genericPyramid,genericSolid,shapeData,iShape}.js` are copied
verbatim from `../Module2/src/` and must stay byte-identical (RULES.md §1.3–1.4) — fix drift in
`Module2/` and re-copy, never patch the copy in place. `genericSolid.js` is pure polygon
trigonometry (no THREE dependency) and is the only file siblings may import (ADR-007). All five
mesh generators route their pose through `iShape.js`'s `applyShapeTransform` (Euler order `'ZXY'`,
re-derived signs — ADR-005).

`main.js`'s `createSolidMesh(data)` is the `ShapeType` → generator dispatch switch, ported verbatim
from `Module2/main.js`. It is called only from inside `rebuild()`'s DOMAIN BUILD SEAM — see below.

## 3D engineering gotchas (read before writing rotation/projection math)

- **Right-handed, Y-up vs Unity's left-handed.** Every negative sign ported from the Unity prototype is suspect. Re-derive signs visually rather than trusting a copied sign.
- **Set `euler.order` explicitly** — `'ZXY'`, matching the restored `iShape.js`.
- **Single `rebuild(shapeData)` function is the only path for geometry changes**, non-negotiable. It runs the disposal contract (deep `traverse()` over every `shapeGroup` child — ADR-042) before building new objects. Verify with `renderer.info.memory` — geometry and texture counts must stay flat across 50 rapid regenerations.
- **Edge classification is camera-dependent.** Visible/hidden/silhouette must re-run on orbit when projections are shown, not only on parameter change. Throttle to `requestAnimationFrame`, never to `mousemove`. GPU depth-buffer hiding is explicitly out — the CPU line-of-sight raycast classifier is required (ADR-029 addendum).
- **Use `LineMaterial` + `LineSegments2`** (from `three/addons/lines/`) for projection lines and hidden edges — standard `LineBasicMaterial` is capped at 1px on most GPUs.
- **`LineDashedMaterial` requires `computeLineDistances()`** on every line object or dashes silently render as solid.
- **`polygonOffset: true`** on the solid material — without it, `EdgesGeometry` outlines z-fight with mesh faces and flicker.
- **Hard-edge geometry only.** Non-indexed `BufferGeometry` (or duplicated vertices per face) so edge extraction is clean.
- **Quantized edge welding** in `meshAnalyzer.js` (restored byte-identical from `Module2/src/`): round endpoints to `1e-3` tolerance, canonical sorted edge keys — without this, cylinder rim edges and new section-cut edges will double-draw. `src/sectionCut.js` welds its loop endpoints on the SAME lattice deliberately.

## Section-cut engine (`src/sectionCut.js` — ADR-058)

Built 2026-07-17. An analytic single-plane clipper, **not** CSG: Sutherland–Hodgman per
triangle against the kept half-space, intersection segments welded on the same 1e-3 lattice as
`meshAnalyzer.js` and chained into an ordered closed loop, loop fan-triangulated into a solid
cap (geometry group 1, `--color-section-face`). The ordered loop doubles as the TRUE SHAPE
polygon (returned in the plane's (u,v) basis — `simController.section()`), so the auxiliary
view needs no boundary reconstruction. Invariants to preserve:
- The cut is a stage inside `rebuild(shapeData)` — generate mesh → slice → analyze edges —
  never a live mutation reacting directly to a slider (ADR-004's fixed-order consequence).
- The WHOLE sliced solid (lateral + cap) feeds ONE `buildEdgeMap()` call so the cut rim welds
  with the clipped walls and never double-draws.
- Section-plane state lives in `main.js` beside ShapeData, NOT inside it — `src/shapeData.js`
  stays byte-identical to Module2 (ADR-059). Section edits go through
  `simController.commitSection()`.
- `sectionCut.js`'s on-plane snap `PLANE_EPS` (2e-3) must stay LARGER than meshAnalyzer's
  1e-3 weld lattice — a grazed vertex then becomes a section-loop vertex outright. Shrinking it
  re-creates non-manifold welded edges on grazing cuts (e.g. the 45° centre cut of the cube).
- **Syllabus constraint (still pending — for the problem-library pass):** "true shape given"
  problems (where the true shape is handed to the learner rather than derived) must be excluded
  from the generated problem library and UI. There is no code representation for this today —
  `Module2/src/problems.js`'s `TIERS`/`ENABLED_TIERS` axis is pose-based, not problem-type-based.
  Add a dedicated axis (a `type`/tag field, or a never-enabled tier) and record the exclusion as
  an ADR, rather than relying on "just don't author them."

## Visual style

Engineering textbook / CAD viewport — **not** architectural presentation. Flat ambient + single directional light, **no cast shadows** on the solid, `MeshPhongMaterial` with `shininess: 0` (no PBR). HP projection lines and VP projection lines use distinct colours (see `../DESIGN.md`). Hidden edges dashed grey; visible edges solid dark. Section planes/cut faces should get their own distinct token once designed — do not reuse the HP/VP projection colours for the cutting plane itself.

## Cross-cutting rules

- Route **every** shape change through `rebuild()` — no exceptions.
- Read all colours from CSS custom properties via `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. Never hard-code hex in JS or component CSS. Single source of truth lives in `../DESIGN.md`.
- Keep `main.js` as the orchestrator; layer modules do not import each other except `genericSolid` (pure math).
- Re-derive every ported sign visually. Copying Unity sign conventions blindly is the fastest way to produce plausible-but-wrong projections.

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
