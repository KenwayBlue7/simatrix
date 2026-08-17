# CLAUDE.md — Simatrix · Module 2 Topic 1: Introduction to Solids

A calm, distraction-free **3D anatomy gallery** that introduces the basic parts of solids — the **apex**, the central **axis OP**, surface **generators**, and base **vertices** — across polyhedra (prisms, pyramids, cube) and solids of revolution (cylinders, cones). Ships as a self-contained ZIP that runs inside a sandboxed `iframe` on the Simatrix platform.

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

It shares its 3D engine (shape generators + the `vertexLabeler` annotation layer) with the sibling **Topic 2 "Orthographic Projection of Solids"** module, but is deliberately scoped DOWN to anatomy only.

**Out of scope here (lives only in Topic 2):** orthographic projection onto HP/VP/PP planes, the rotation-priority hierarchy (face inclination / orient-to-corner / manual Y), the fold-flat-to-2D animation, quick-views / connector lines, and the multi-step Guided Stepper. Sections of this file inherited from the projection module that describe those — notably **"Rotation priority hierarchy"** and the projection-line parts of **"Visual style"** — do **not** apply to this module. The architecture, platform contract, disposal contract, hard-edge geometry, CSS2D labels, and fattened-line (LineSegments2) rules below all still apply.

**Design system rules:** Always read and strictly follow `@DESIGN.md` for all colour, typography, spacing, component styling, and UI/UX decisions. Never hard-code design values in CSS or JS — consume tokens defined in `@DESIGN.md`.

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
  Never use the UMD global, never use `@latest`, never `npm install three`.
- **All asset paths relative** — `./assets/model.glb`, never `/assets/...`. Platform serves the extracted ZIP from an arbitrary URL prefix.
- **ZIP payload ≤ 10 MB.** Prefer `.glb` over `.gltf+bin`; `.webp` over `.png`/`.jpg`; skip HDR environments.
- **Imports must include `.js` extension** (`import { x } from './src/x.js'`). Extensionless imports 404 with no bundler to resolve them.
- **Sandboxed iframe context.** No same-origin assumptions, no server APIs, zero runtime network calls beyond the initial CDN module fetch. The sim must work fully offline once loaded.

## Platform contract (required for Simatrix uploads)

- **`meta.json`** at ZIP root with all four fields — `title`, `description`, `difficulty`, `tags`. Uploads missing any field are rejected.
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

## 3D engineering gotchas (read before writing rotation/projection math)

- **Right-handed, Y-up vs Unity's left-handed.** Every negative sign in the Unity prototype's rotation or projection code is suspect — they exist to compensate for Unity handedness and will produce mirrored or back-to-front output if copied verbatim. **Re-derive signs visually** against the worked square-pyramid example (`baseLength=2, height=3, target=45°`). Magnitudes (apothem `a = s / (2·tan(π/n))`, `α = arctan(h/a)`) port unchanged; only application signs differ.
- **Set `euler.order` explicitly.** Unity uses ZXY internally; Three.js default is `'XYZ'`. Pick one and document it where the Euler is constructed.
- **Single `rebuild(shapeData)` function is the only path for geometry changes.** It must run the full disposal contract before building new objects:
  ```js
  for (const obj of shapeGroup.children) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(m => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
  ```
  Verify with `renderer.info.memory` — geometry and texture counts must stay flat across 50 rapid regenerations. WebGL context exhaustion in the iframe is the most likely late-stage bug.
- **Edge classification is camera-dependent.** Visible/hidden/silhouette must re-run on orbit when projections are shown, not only on parameter change. Throttle to `requestAnimationFrame`, never to `mousemove`.
- **Use `LineMaterial` + `LineSegments2`** (from `three/addons/lines/`) for projection lines and hidden edges. Standard `LineBasicMaterial` is capped at 1 px on most GPUs due to a WebGL limitation — engineering line weights need real pixel width.
- **`LineDashedMaterial` requires `computeLineDistances()`** on every line object or dashes silently render as solid.
- **`polygonOffset: true`** on the solid material — without it, `EdgesGeometry` outlines z-fight with mesh faces and flicker.
- **Hard-edge geometry only.** Use non-indexed `BufferGeometry` (or duplicate vertices per face) so edge extraction is clean. Shared vertices across faces will smooth-shade and break the technical look.
- **Quantized edge welding** in `meshAnalyzer.js`: round endpoints to `1e-3` tolerance and build canonical sorted edge keys. Without this, cylinder rim edges duplicate (cap + side meet) and the projection shows double lines.

## Rotation priority hierarchy (pedagogically critical)

Implement strict precedence — higher wins and disables lower:

1. **Face Inclination HP or VP** (mutually exclusive, pyramids + cone only). `α = arctan(height / apothem)`; rotation correction makes the slant face parallel to target plane.
2. **Orient to Corner / Edge** preset. Per-shape angles: square 45°, triangular 30°, pentagonal **54°** (not 18°), hexagonal 30°. Disabled while face inclination is active.
3. **Manual Y rotation** (0–360°). Only active when no preset/face mode is on.

Standard-axis `angleHP` (X) and `angleVP` (Z) sliders feed the base Euler underneath this system. UI toggles must enable/disable each other to enforce the hierarchy.

## Visual style

Engineering textbook / CAD viewport — **not** architectural presentation. Flat ambient + single directional light, **no cast shadows** on the solid, `MeshPhongMaterial` with `shininess: 0` (no PBR). HP projection lines and VP projection lines use distinct colours (see `@DESIGN.md`). Hidden edges dashed grey; visible edges solid dark.

## Cross-cutting rules

- Route **every** shape change through `rebuild()` — no exceptions.
- Read all colours from CSS custom properties via `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. Never hard-code hex in JS or component CSS. Single source of truth lives in `@DESIGN.md`.
- Keep `main.js` as the orchestrator; layer modules do not import each other except `genericSolid` (pure math).
- Re-derive every ported sign visually. Copying Unity sign conventions blindly is the fastest way to produce plausible-but-wrong projections.

---

*Sources: Engineering Graphics Educational Tool README v1.3.0 + Simatrix Platform Simulation Developer Guide v1. This file supersedes both where they conflict.*