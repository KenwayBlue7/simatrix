# CLAUDE.md — Simatrix: Understanding Orthographic Views

Three.js simulation that teaches the **glass box** mental model of orthographic projection: an
object sits inside a transparent box, each face of the box catches the view that projects onto it,
and the box then **unfolds** into the flat six-view multiview drawing. This is the spatial bridge
between a 3D object and its 2D orthographic views.

This is a **Module 1 topic on the Module 2 orchestrator + leaf-module pattern** (ADR-033): a
standalone `graphics_module_1_topic_4_understanding_orthographic_views` folder cut from the shared starter skeleton
(`../template_starter`, ADR-009's copy-and-simplify discipline), **not** a thin page bolted onto
the retired shared `engine.js`. It ships as a self-contained payload that runs inside a sandboxed
`iframe` on the Simatrix platform. Because it is part of the Engineering Graphics module family, it
consumes the **root** Engineering-Graphics docs below — it is not a new discipline, so the
Case-C "build your own ARCHITECTURE/DECISIONS/RULES" guidance in `../template_starter/CLAUDE.md`
does **not** apply here.

## Project-wide documentation (read before cross-module tasks)
Before starting any task that touches shared behavior, UI patterns, or cross-module consistency,
read these root-level files:
- `../ARCHITECTURE.md`  — system map, component breakdown, data flow
- `../DECISIONS.md`     — why key decisions were made (ADR log; see ADR-012 Compare View, ADR-033 orchestrator, ADR-037 50/50 workbench)
- `../RULES.md`         — what you must and must not do (enforcement)
- `../DESIGN.md`        — color tokens, typography, component standards
- `../PRODUCT.md`       — who it's for, features, accessibility commitments
- `../PLATFORM-RULES.md` — the subject-agnostic platform contract every Simatrix sim obeys

For module-specific work that doesn't touch shared behavior, reading the root docs is optional but
recommended.

**Design system rules:** Always read and strictly follow the consolidated platform design system at
`../DESIGN.md` (Simatrix root) for all colour, typography, spacing, component styling, and UI/UX
decisions — Module 2 is its master/reference implementation. Strategic context — users, brand
personality, anti-references, design principles, accessibility commitments — lives in the
consolidated root `../PRODUCT.md` (the single platform-wide product contract; ADR-023). Never
hard-code design values in CSS or JS — consume tokens defined in `../DESIGN.md`. For cross-module
quality/aesthetic parity (the host-white card exception, the "Practice problems" ghost-entry spec,
step-counter weight, and a pre-ship checklist) see `../RULES.md` — Module 2 is the reference
implementation for the shared components there.

This module does **not** carry a local `DESIGN.md`/`PRODUCT.md` copy — it consumes the single root
copies (ADR-023, ADR-028). If a genuine module-local *appendix* is needed later (documenting this
topic's own viewport encodings, for instance), add it as a small file that points back to the root,
never a duplicate of the root content.

**Scope boundary:** This module produces a self-contained Three.js *simulation payload* — the 3D
viewport plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The
host Simatrix website (top-level navbar, module browser, account UI, marketing chrome, login,
dashboard) is built by other web developers and is **out of scope** here. Treat the sim like a
teaching aid embedded in someone else's page: do not render navigation, branding, footer, or any
platform-level UI inside the sim's iframe.

---

## Architecture (non-negotiable)

- **No build step.** No npm, Vite, Webpack, bundler, or `package.json` build artifact. Files run by
  being served over HTTP (locally: XAMPP Apache on **port 8080**, `http://localhost:8080/Simatrix/...`;
  `file://` fails ES-module CORS and port 80 is held by Windows IIS — PLATFORM-RULES §1.6).
- **CDN ES modules only**, via this exact import map pinned to `0.160.0`:
  ```html
  <script type="importmap">
  { "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }}
  </script>
  ```
  Never use the UMD global, never `@latest`, never `npm install three`.
- **All asset paths relative** — `./assets/...`, never `/assets/...`. The platform serves the payload
  from an arbitrary URL prefix.
- **Imports must include the `.js` extension** (`import { x } from './src/x.js'`). Extensionless
  imports 404 with no bundler to resolve them.
- **Sandboxed iframe context.** No same-origin assumptions, no server APIs, zero runtime network
  calls beyond the initial CDN module fetch. The sim must work fully offline once loaded.

## Platform contract (required for Simatrix uploads)

- **`meta.json`** at the sim root with all four fields — `title`, `description`, `difficulty`
  (lowercase `beginner`/`intermediate`/`advanced` — PLATFORM-RULES §1.11a), `tags`. Uploads missing
  any field are rejected. The `index.html` `<title>` must equal `meta.json.title` (ADR-026).
- **`window.simAPI`** exposed in `main.js` with exactly `pause()`, `resume()`, `reset()`; the in-sim
  Reset routes through `simAPI.reset()` — no second reset path.
- **Mobile notice.** At `< 768px`, a dismissible "Best experienced on desktop" banner only — never
  block, redirect, or disable the sim.

---

## This topic's architecture

- **Rendering / pattern.** Three.js, Module 2 **orchestrator + leaf-module** pattern (ADR-033):
  `main.js` is the orchestrator; leaf modules (`src/stepper.js`, `src/terms.js`, `src/onboarding.js`,
  `src/anim.js`) hang off it and never import each other.
- **Single state-change pipeline.** `rebuild()` in `main.js` is the ONLY path that mutates scene
  geometry; it runs the disposal contract first (verify `renderer.info.memory` stays flat across 50
  rebuilds). Add Glass-Box geometry only inside its marked build seam, as a direct child of
  `shapeGroup`.
- **Compare workbench (ADR-012 / ADR-037).** The topic is dual-mode: a live 3D viewport plus an
  on-demand 2D drawing that expands into a **true 50/50 split** (`body.compare-split` grid; 3D left,
  2D sheet right, drivers docked in `#workbench-rail`). Per ADR-034/ADR-037 the 2D pane is a plain 2D
  `<canvas>` — **no second WebGL context**. Because the Compare card floats over its stage, **no
  ancestor of the card may carry a CSS `transform`** (the position-fixed/absolute no-transform
  invariant, ADR-012) — audit `body` / `#sim-viewport` before adding any transform to them.
- **Domain build still pending.** As scaffolded, `main.js` boots a clean empty scene into the 50/50
  split with a placeholder 2D sheet and an empty rail. The Glass-Box geometry, the `drawCompare()`
  renderer, the box-unfold animation, and the re-parented drivers are the next domain-build phase.

Record any non-obvious decision as an ADR in the **root** `../DECISIONS.md` (this topic is part of
the Engineering Graphics family — its decisions live with the family, not in a per-topic ADR log),
and add a dated entry to this topic's `CHANGELOG.md` after any significant change.

---

## Session Digest Protocol

At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
