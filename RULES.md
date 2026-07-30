# Simatrix — Rules (Enforcement Checklist)

> **This file is the cross-module standard previously referenced as `SIMATRIX-UI-STANDARDS.md`
> in the module `CLAUDE.md` files.** Both `Module1/CLAUDE.md` and `Module2/CLAUDE.md` pointed to a
> `../SIMATRIX-UI-STANDARDS.md` at the Simatrix root that never existed (ARCHITECTURE.md §9.3).
> `RULES.md` fulfills that role: it is the platform-wide standards & parity checklist. Those two
> CLAUDE.md references have been updated to point here.

---

## Preamble

### The three documents
- **ARCHITECTURE.md** — *what the system is* (the map).
- **DECISIONS.md** — *why it is that way* (the reasoning; the ADR log).
- **RULES.md** (this file) — *what you must and must not do* (the checklist).

**RULES.md is not DECISIONS.md.** DECISIONS.md explains the *why* in full, with alternatives and
consequences. RULES.md is the short, actionable enforcement layer: each rule is a single
**✅ DO** or **❌ NEVER**, traceable to its source. When you want the reasoning behind a rule, follow
its citation back to the named ADR or document. Do not duplicate the reasoning here.

### How to read a rule
Every rule is formatted:

> **§N.M ✅ DO** / **❌ NEVER** — the actionable instruction. *(source)*
> Reason: one sentence, only where the why is not obvious.

- The **source** is always one of: `(ADR-NNN)` · `(ARCHITECTURE.md §9.N)` · `(DESIGN.md)` ·
  `(CLAUDE.md)`.
- Rules are stated as absolutes. There is no "consider" or "try to." If a real exception exists, it
  is written as its own rule.

### How to add a rule
1. Make the decision first and record its *reasoning* as an ADR in DECISIONS.md (see ADR-000 template).
2. Translate the ADR's consequence into one or more rules here: ask "because of this decision, what
   must a contributor now **always** do or **never** do?"
3. Mark each new rule **✅ DO** or **❌ NEVER**, keep it to 2–3 lines, and cite its source ADR.
4. If the rule reverses something, also add it to **Section 9 (Anti-Patterns)** so it is scannable.

---

## Section 1 — Master Codebase & Deployment Rules

> The single most important thing a newcomer cannot infer from the folder names (ARCHITECTURE.md
> §9.1, ADR-020): **`Module2/` is the master.** Read this section before touching any
> `graphics_module_2_topic_*` folder.

### The master → deploy map
- **`Module2/`** = THE MASTER ("Orthographic Projection of Solids"). Single source of truth.
- **`graphics_module_2_topic_1_introduction/`** = a DEPLOYED COPY of Module 2, heavily adapted down
  to a 3D anatomy gallery.
- **`graphics_module_2_topic_2_simple_positions/`** = a DEPLOYED COPY of Module 2, a near-faithful
  clone with inclination removed.
- **`Module1/`** = its own module (foundations), NOT a copy of Module 2.

> **§1.1 ✅ DO** treat `Module2/` as the master and single source of truth; the two
> `graphics_module_2_topic_*` folders are deployed copies of it. *(ADR-009, ARCHITECTURE.md §9.1)*

> **§1.2 ✅ DO** originate every change in `Module2/` first, then copy/adapt it into the topic
> folders. *(ADR-009)*
> Reason: there is no shared library and no build step, so the master is the only authoritative copy.

> **§1.3 ❌ NEVER** make a shared-file fix (geometry generator, design token, engine logic) directly
> in a topic folder. Fix it in `Module2/` and re-copy. *(ADR-009)*

> **§1.4 ✅ DO** manually re-copy any shared-file fix into *every* topic folder that carries that
> file — there is no automated sync. *(ADR-009, ARCHITECTURE.md §9.2)*

> **§1.5 ✅ DO** backport an improvement discovered while building a clone as a **merge** into the
> master, not a blind copy — the master must keep features (e.g. inclination) the clone deleted.
> *(ADR-009)*

> **§1.6 ✅ DO** scope a topic clone by flipping the single `ENABLED_TIERS` flag in
> `src/problems.js` (and, for Topic 2, removing the inclination fields). *(ADR-009)*

> **§1.7 ❌ NEVER** infer the master→deploy lineage from a folder's `topic_N` number — the numbers
> encode the host catalog order, not the master. Topic 1's own CLAUDE.md even mislabels the master's
> content. *(ARCHITECTURE.md §9.1, ADR-020)*

> **§1.8 ❌ NEVER** assume the copies are in sync — they will drift; verify against the master before
> relying on a "shared" file being identical. *(ARCHITECTURE.md §9.2)*

> **§1.9 ✅ DO** keep the Simple Positions clone titled "Simple Positions" with **no topic number**
> in its human-facing title. *(ADR-020)*

> **§1.10 ✅ DO** name a deployed topic folder `graphics_module_<M>_topic_<K>_<slug>` — `<M>` the
> subject-module index, `<K>` the host-catalog order, `<slug>` the lowercase underscore-separated
> topic name (e.g. `graphics_module_2_topic_2_simple_positions`). *(ADR-024)*
> Reason: the indices serve the host catalog's grouping/order, not the master→deploy lineage (§1.7).

> **§1.11 ✅ DO** choose a new subject module's template by geometry — copy `Module2/` for a 3D
> subject, `Module1/` for a 2D-canvas / multi-lesson subject; a subject that fits neither cleanly
> needs its own ADR before work starts. *(ADR-025)*

> **§1.12 ✅ DO** keep the `<title>` in `index.html` identical to the `title` field in `meta.json`.
> **❌ NEVER** ship a sim whose `<title>` disagrees with `meta.json.title`. *(ADR-026)*
> Reason: `<title>` is the browser-tab text and the page's screen-reader-announced accessible name;
> a mismatch is both a catalog-consistency bug and an accessibility defect. *(Topic 2 violated this
> until 2026-06-28 — `<title>` read "Orthographic Projection of Solids" vs. `meta.json` "Simple
> Positions"; now fixed to "Simple Positions". Scope: this rule governs single-sim payloads, one
> page per `meta.json`. Module 1 is a seven-page module under one `meta.json`, so each page keeps its
> own per-lesson `<title>` — that is by design, not a violation.)*

> **§1.13 ✅ DO** treat `iShape.js` as an **adapt** file (read it and adapt `applyShapeTransform()`
> to your topic's poses, keeping the `ZXY` Euler order — ADR-005). **❌ NEVER** copy it verbatim as if
> it were one of the byte-identical shared files — it carries topic-specific pose logic (the VP
> lay-down + inclination) and already differs between the master and the topics. *(ADR-027)*

> **§1.14 ✅ DO** point a new topic's `CLAUDE.md` at the root `../DESIGN.md` and `../PRODUCT.md` (via
> the "Project-wide documentation" block). **❌ NEVER** create a local `DESIGN.md`/`PRODUCT.md` copy
> inside a new topic folder — a copy is an immediate drift point. *(ADR-028, ADR-022, ADR-023)*

> **§1.15 ✅ DO** scaffold a new topic from `template_starter/` (MODULE-STARTER §3.2) — OR from the
> nearest SIBLING topic when the boilerplate lacks a layer the new topic needs (the Module-3
> Problem Library + wired Compare card). Either way, **re-copy every shared engine file from
> `Module2/src/`** (and any ported leaf from its origin topic) and **verify byte-identity with
> `md5sum` before writing a line of topic code**. *(ADR-082)*
> Reason: cutting from a sibling starts at chrome parity and makes the delta reviewable; the
> md5 check is what neutralises the "topics carry stale shared files" hazard (§1.8) that makes
> sibling-cutting dangerous in the first place.

> **§1.16 ❌ NEVER** carry a shared engine file a topic does not import ("it might be useful
> later"). Omit it, and say in the topic's `CLAUDE.md` which shared files it does carry. *(ADR-082)*
> Reason: an unused copy is a drift surface (§1.4 obliges you to re-copy fixes into it) with no
> upside — `graphics_module_3_topic_2_2_conic_sections` carries only `cone.js` of the five
> generators for exactly this reason.

---

## Section 2 — Platform & Runtime Rules

> **§2.1 ❌ NEVER** add a `package.json`, npm, Vite, Webpack, or any bundler/build artifact. The sim
> is plain files served over HTTP. *(ADR-001, CLAUDE.md)*

> **§2.2 ❌ NEVER** use the Three.js UMD global, `@latest`, or `npm install three`. *(ADR-001, CLAUDE.md)*

> **§2.3 ✅ DO** load Three.js as ES modules through the exact import map pinned to **`three@0.160.0`**
> from jsDelivr (`three` + `three/addons/`). *(ADR-001, CLAUDE.md)*
> Reason: a pinned version cannot silently change under the sim, preserving reproducibility/offline use.

> **§2.4 ✅ DO** include the `.js` extension on every import (`./src/x.js`). *(ADR-001, CLAUDE.md)*
> Reason: with no bundler/resolver, extensionless imports 404.

> **§2.5 ✅ DO** use only relative asset paths (`./assets/...`), never absolute (`/assets/...`). *(ADR-001, CLAUDE.md)*
> Reason: the host serves the payload from an arbitrary URL prefix.

> **§2.6 ✅ DO** serve over HTTP — locally **XAMPP Apache on port 8080**
> (`http://localhost:8080/Simatrix/...`). `file://` fails (ES-module CORS) and port 80 is held by
> Windows IIS and 404s. *(ADR-001)*

> **§2.7 ✅ DO** hard-reload after an edit before assuming a change is broken — Apache sends no
> `Cache-Control`, so Chrome serves stale modules. *(ADR-001)*

> **§2.8 ✅ DO** expose `window.simAPI` with exactly `pause()`, `resume()`, and `reset()`. *(ADR-002, CLAUDE.md)*

> **§2.9 ❌ NEVER** create a second reset path — the in-sim Reset button must route through
> `simAPI.reset()`. *(ADR-002, CLAUDE.md)*

> **§2.10 ❌ NEVER** add `postMessage`, `window.parent`, or `window.top` usage anywhere. The
> host↔sim surface is `window.simAPI` + `meta.json` only. *(ADR-002, ARCHITECTURE.md §6)*

> **§2.11 ✅ DO** ship a `meta.json` at the root with all four fields — `title`, `description`,
> `difficulty`, `tags`. Uploads missing any field are rejected. *(ADR-002, CLAUDE.md)*

> **§2.11a ❌ NEVER** use a capitalised difficulty value in meta.json. The backend requires
> exactly: `beginner`, `intermediate`, or `advanced` (all lowercase). *(PLATFORM-RULES.md §1.11a)*

> **§2.12 ❌ NEVER** make a runtime network call beyond the one-time Three.js CDN fetch; the sim must
> work fully offline once loaded. *(ADR-002, CLAUDE.md)*

> **§2.13 ✅ DO** render only a dismissible "Best experienced on desktop" banner below 768px — never
> block, redirect, or disable the sim. *(CLAUDE.md)*

> **§2.14 ✅ DO** make the sim self-starting on page load; there is no external `init()` call. *(CLAUDE.md)*

> **§2.15 ✅ DO** bundle fonts as local `woff2` (Atkinson Hyperlegible + IBM Plex Mono) loaded via
> `@font-face`; **never** use a Google-Fonts CDN. *(ARCHITECTURE.md §7, CLAUDE.md)*

> **§2.16 ✅ DO** keep a packaged Module 2 payload ≤ 10 MB — prefer `.glb` over `.gltf+bin`, `.webp`
> over `.png`/`.jpg`, and skip HDR environments. *(CLAUDE.md)*

> **§2.17 ✅ DO** verify sims headlessly by driving Chrome over the DevTools Protocol with Node's
> **built-in** `WebSocket`/`fetch` — never install puppeteer/playwright or any npm package. *(ADR-019)*

> **§2.18 ✅ DO** disable the network cache (`Network.setCacheDisabled`) during headless verification,
> or Chrome serves a stale ES module. *(ADR-019)*

> **§2.19 ✅ DO** run the final green check against the **shipped module**, never a hand-typed replica
> of its logic. *(ADR-019)*
> Reason: a replica once passed while the shipped module had a real call-site bug.

> **§2.20 ✅ DO** pin **`three-mesh-bvh`** in the **same import map** as `three`, at a version
> compatible with `three@0.160.0`. **❌ NEVER** add it via npm/a bundler, or pin it to `@latest`.
> *(ADR-030)*
> Reason: it accelerates the occlusion raycaster (ADR-029) while staying inside the no-build,
> pinned-CDN-ES-module contract (ADR-001); an unpinned/bundled copy breaks reproducibility and §2.1–§2.2.

---

## Section 3 — 3D Scene & Architecture Rules

> **§3.1 ✅ DO** route every geometry change through the single `rebuild(shapeData)` pipeline, in its
> fixed order (dispose → resolve angles → generate mesh → seat → analyze edges → draw projections →
> place labels → notify). *(ADR-004, CLAUDE.md)*

> **§3.2 ❌ NEVER** let a control mutate the Three.js scene directly — controls call `commit()`/
> `rebuild` on the injected controller only. *(ADR-004, CLAUDE.md)*
> Reason: a single disciplined path is what prevents WebGL context exhaustion in the iframe.

> **§3.3 ✅ DO** run the full disposal contract at the start of every rebuild (dispose geometry,
> materials, textures) via a **deep `.traverse()`** of every top-level child of the geometry group
> (`for (const child of shapeGroup.children) child.traverse(disposeObj)`). **❌ NEVER** use a shallow
> one-level loop over the group's direct children. *(ADR-004, ADR-042, CLAUDE.md)*
> Reason: real domain geometry is assembled as nested `THREE.Group` hierarchies; a `Group` node carries
> no geometry/material, so a shallow loop frees **nothing** for it and exhausts the WebGL context
> (discovered leaking in the Glass Box build, ADR-042).

> **§3.4 ✅ DO** verify `renderer.info.memory` (geometry + texture counts) stays flat across 50 rapid
> regenerations. *(ADR-004, CLAUDE.md)*

> **§3.5 ✅ DO** remove the live CSS2D label DOM nodes inside the disposal traversal (Module 1's
> `fill()`); they accumulate fast otherwise. *(CLAUDE.md)*

> **§3.6 ❌ NEVER** let leaf modules import each other. Only `genericSolid.js` (pure math) may be
> imported by sibling shape files. *(ADR-007, CLAUDE.md)*
> Reason: the no-cross-import rule keeps the dependency graph a star around the orchestrator.

> **§3.6a ✅ DO** treat a topic's **pure-data catalogue** modules — plain objects and pure functions,
> no DOM, no Three.js objects, no behaviour — as the same sibling-importable category as
> `genericSolid.js`, and say so in the topic's `CLAUDE.md`. **❌ NEVER** extend that licence to a
> BEHAVIOURAL leaf (a rig, a renderer, a label layer, a stepper): those still never import one
> another. *(ADR-078, extends ADR-007)*
> Reason: a content-heavy topic (`graphics_module_1_topic_1_1_dimensioning` carries six textbook
> catalogues) cannot hang every table off the orchestrator without turning `main.js` into a content
> file — but the thing §3.6 protects is the behaviour graph, not the constants.

> **§3.7 ✅ DO** make every shape generator follow the `iShape.js` contract and rotate via the shared
> `applyShapeTransform()`. *(ADR-007, ADR-005)*

> **§3.8 ✅ DO** set `euler.order` explicitly to **`ZXY`** where the Euler is constructed. *(ADR-005, CLAUDE.md)*
> Reason: Three.js defaults to `XYZ`; leaving it implicit silently changes the rotation.

> **§3.9 ✅ DO** re-derive every ported sign visually against the worked square-pyramid example
> (`baseLength=2, height=3, target=45°`). Magnitudes port unchanged; only signs differ. *(ADR-005, CLAUDE.md)*

> **§3.10 ❌ NEVER** copy Unity's negative signs verbatim. *(ADR-005, CLAUDE.md)*
> Reason: Unity is left-handed; copied signs produce plausible-but-wrong mirrored/back-to-front output.

> **§3.11 ❌ NEVER** chase, restore, or recreate anything from a `src_csharp/` comment path — that
> Unity prototype folder is no longer in the tree. *(ADR-005, ARCHITECTURE.md §9.8)*

> **§3.12 ✅ DO** draw all engineering linework with `LineMaterial` + `LineSegments2`/`Line2` (the
> `three/addons/lines/` fat-line stack). *(ADR-006, CLAUDE.md)*

> **§3.13 ❌ NEVER** use `LineBasicMaterial` for engineering linework — it caps at 1px on most GPUs. *(ADR-006, CLAUDE.md)*

> **§3.14 ✅ DO** build hard-edged geometry (non-indexed `BufferGeometry`, duplicated vertices per
> face). *(ADR-006, CLAUDE.md)*
> Reason: shared/smoothed vertices break edge extraction and the CAD look.

> **§3.15 ✅ DO** weld edge endpoints in `meshAnalyzer.js` by rounding world positions to the `1e-3`
> tolerance with canonical sorted keys. *(ADR-006, CLAUDE.md)*
> Reason: without welding, curved-solid rims (cap + side) render as double lines.

> **§3.16 ✅ DO** keep `LineMaterial.resolution` in sync with the canvas pixel size on every resize/
> layout change. *(ADR-006, CLAUDE.md)*

> **§3.17 ✅ DO** call `computeLineDistances()` on every dashed line object. *(ADR-006, CLAUDE.md)*
> Reason: without it, `LineDashedMaterial` silently renders solid.

> **§3.18 ✅ DO** set `polygonOffset: true` on the solid material. *(ADR-006, CLAUDE.md)*
> Reason: otherwise edge outlines z-fight with mesh faces and flicker.

> **§3.18a ✅ DO** give dashed hidden-edge `LineSegments2` materials a positive `polygonOffset`
> (`factor: 1, units: 1`) plus `renderOrder = 0` (visible siblings get `renderOrder = 1`), so a
> visible solid line always fully occludes a coincident hidden dashed line — drafting convention's
> line-precedence rule. *(ADR-057)*
> Reason: fat lines render as triangle fills, so equal-depth solid/dashed pairs z-fight and jitter
> rather than losing deterministically; `renderOrder` alone doesn't separate their depth values.

> **§3.19 ✅ DO** re-run camera-dependent edge classification (visible/hidden/silhouette) on orbit
> when projections are shown, throttled to `requestAnimationFrame` — never to `mousemove`. *(CLAUDE.md)*

> **§3.20 ✅ DO** enforce the rotation precedence with mutually-exclusive UI: (1) Face Inclination
> HP/VP > (2) Orient-to-Corner/Edge preset > (3) Manual Y — a higher mode disables the lower. *(ADR-008, CLAUDE.md)*

> **§3.21 ❌ NEVER** allow all rotation controls to be active at once. *(ADR-008, CLAUDE.md)*
> Reason: it produces contradictory orientation states.

> **§3.22 ❌ NEVER** "fix" the pentagonal Orient preset from 54° back to 18°. *(ADR-008, CLAUDE.md)*
> Reason: 54° is the corrected geometry value; the note exists so it is not reverted.

> **§3.23 ✅ DO** use the per-shape preset angles: square 45°, triangular 30°, pentagonal 54°,
> hexagonal 30°. *(ADR-008, CLAUDE.md)*

> **§3.24 ✅ DO** keep the viewport look CAD/textbook: flat ambient + single directional light,
> `MeshPhongMaterial` with `shininess: 0`, **no PBR**, and **no cast shadows** on the solid. *(CLAUDE.md)*

> **§3.25 ❌ NEVER** re-add the `AxesHelper` (or any RGB helper) to the scene. *(CLAUDE.md)*
> Reason: its red/green/blue is off-palette and leaks blue into the viewport (breaks Chrome-Only Blue).

> **§3.26 ✅ DO** re-render after fonts load (`document.fonts.ready.then(() => rebuild(...))`) so
> CSS2D labels don't paint in a fallback font. *(CLAUDE.md)*

> **§3.27 ✅ DO** build viewport labels as live `CSS2DObject` DOM nodes (vector-sharp, screen-reader
> readable), not baked sprites. *(CLAUDE.md)*

> **§3.28 ✅ DO** add a new Module 1 lesson as a new thin page + data module — never by changing the
> shared `engine.js`. *(ADR-011)*

> **§3.29 ✅ DO** build every solid as a **manifold** — one closed surface with **no overlapping or
> duplicated extrusions** (e.g. two stacked base slabs occupying the same volume). **❌ NEVER** ship
> coincident/overlapping faces. *(ADR-029, ADR-030)*
> Reason: overlapping geometry stacks many coincident triangles at one spot, so a single occlusion
> ray hits a huge pile of them — the "raycast explosion" that tanked performance on the Bearing Block.

> **§3.30 ✅ DO** drop **degenerate (zero-area) triangles** in `meshAnalyzer.js` — a triangle whose
> normal length is `≤ DEGENERATE_NORMAL_EPS` (1e-10) contributes **no `Face` and no edges**. **❌ NEVER**
> keep a zero-area triangle with a `(0,0,0)` normal. *(ADR-029)*
> Reason: a zero normal poisons the consumer's coplanarity dot test (`dot(n,0)=0` reads as a 90° crease),
> drawing phantom "spiderweb" seams across flat caps. (Backported to the master + topic clones; the
> three `meshAnalyzer.js` copies are byte-identical — see §7.10.)

> **§3.31 ✅ DO** treat the `three-mesh-bvh` index as **derived state**: rebuild it whenever the mesh
> geometry changes and dispose it with the mesh, inside the single `rebuild()`/disposal contract. *(ADR-030, ADR-004)*
> Reason: a stale BVH raycasts against the old geometry; an undisposed one leaks like any other GPU/CPU buffer.

> **§3.32 ✅ DO** run a **heavy visual update driven by continuous input** (the on-orbit visible/hidden
> re-classification) as **`requestAnimationFrame`-throttled + dirty-gated** on real camera movement.
> **❌ NEVER** debounce it behind a timer. *(ADR-031, reinforces §3.19)*
> Reason: a debounce only masks a slow recompute and desyncs the lines from the part; with the BVH
> (§2.20) the pass is cheap enough to run every frame, so edges flip visible↔hidden live under the orbit.

> **§3.33 (retired 2026-07-21, ADR-076) ✅ DO**, *if* a topic ever renders two scenes as scissored
> regions of ONE shared `WebGLRenderer`, convert every scissored-pass region from device px to
> logical px before calling `renderer.setViewport`/`setScissor` — divide `{x,y,w,h}` by
> `renderer.getPixelRatio()` at the call site (a shared `pass(x,y,w,h)` helper), since both APIs
> multiply by `pixelRatio` internally. `LineMaterial.resolution` (§3.16) stays in device px,
> unchanged — only the viewport/scissor calls convert. *(ADR-074)*
> No topic currently does this: the two standalone Lines topics this rule was written for
> (`graphics_module_1_topic_5_projection_of_line_types`,
> `graphics_module_1_topic_6_projection_of_straight_lines`) moved their 2D Compare sheet onto its
> OWN `WebGLRenderer`/canvas (ADR-076), which has no scissor pass and no viewport/scissor pixelRatio
> boundary to get wrong. Kept as reference guidance for any future scissored-pass design.

> **§3.33a (retired 2026-07-21, ADR-076) ❌ NEVER** hand a scissor-region computation's device-px
> `{x,y,w,h}` straight to `setViewport`/`setScissor` — three.js multiplies by `pixelRatio`
> internally, so raw device px double-applies the ratio. Invisible at `devicePixelRatio === 1`; at
> any other DPR (Windows display scaling, not just browser zoom) it desyncs the WebGL pass from
> CSS-positioned overlays (e.g. CSS2D labels) that sit in true logical px. *(ADR-074)*
> Reason: bug silent on every DPR-1 dev display — verify any future two-pass topic at a non-1.0
> DPR. Retired alongside §3.33 — no topic currently has a scissor pass to misconvert.

> **§3.34 ✅ DO** treat `sectionCut.js`'s ordered `loops` output as a first-class result: a topic
> may use the clipper purely to EXTRACT the section curve (drawing the loop on an intact solid and
> lifting the cap out as the section face) and discard the sliced geometry. **❌ NEVER** assume a
> topic that imports `sectionCut.js` truncates its solid — check what it does with the result.
> *(ADR-085, ADR-058)*
> Reason: Sections of Solids teaches the solid left after the cut; Conic Sections teaches the
> curve, and truncating there would discard the very nappe a hyperbola needs.

> **§3.35 ✅ DO** dispose a clipper result the scene never receives BY HAND, immediately, at the
> call site — the `rebuild()` disposal contract (§3.3) can only free what is parented into
> `shapeGroup`. *(ADR-085, ADR-004)*

---

## Section 4 — UI & Visual Rules (Cross-Module Standards)

> This section is the platform-wide UI parity standard. The named rules below are binding in **every**
> module; their full statements live in the consolidated root `../DESIGN.md` (the former per-module
> `DESIGN.shared.md` copies were merged into it on 2026-06-27 and deleted).

> **§4.1 ❌ NEVER** hard-code a hex value in JS or component CSS. *(ADR-003, DESIGN.md)*
> Reason: CSS design tokens are the single runtime source of truth for all visual values.

> **§4.2 ✅ DO** read every colour from a CSS custom property at runtime via
> `getComputedStyle(document.documentElement).getPropertyValue('--token').trim()`. *(ADR-003, DESIGN.md)*

> **§4.3 ✅ DO** declare any new colour as a token and pass it through `cfg.tokens` (Module 1) /
> the inline `:root` (Module 2) — never inline a literal. *(ADR-003, CLAUDE.md)*

> **§4.4 ✅ DO** keep the blue accent to ~10% of the chrome (the Quiet Chrome Rule). *(DESIGN.md)*

> **§4.5 ❌ NEVER** put blue linework inside the viewport — blue is chrome/guidance only (the
> Chrome-Only Blue Rule). Viewport meaning uses the functional encodings (HP teal, VP amber). *(DESIGN.md)*

> **§4.6 ✅ DO** pair every colour signal with a second cue — dash, weight, label, icon, arrow, or
> shape (the Two-Cue Rule). *(DESIGN.md)*

> **§4.7 ✅ DO** build type hierarchy from size and the 700 bold only — never a 500/600 weight (the
> Two-Weight Rule; Atkinson ships 400/700 only). *(DESIGN.md)*

> **§4.8 ✅ DO** set every live numeric value in IBM Plex Mono with `tabular-nums` (the Tabular Rule). *(DESIGN.md)*

> **§4.9 ❌ NEVER** cast a shadow on rendered geometry, or use elevation as decoration (the Flat-Ink
> Rule). Shadows lift transient overlays only. *(DESIGN.md)*

> **§4.10 ✅ DO** convey structure with a single crisp 1px hairline (`#d9d2c3`) and tonal layering,
> not a drop shadow (the Border-Over-Shadow Rule). *(DESIGN.md)*

> **§4.11 ❌ NEVER** use a bare `#000` or `#fff` literal — always consume the token; `--color-panel`
> (`#ffffff`) is the standard white working surface. *(DESIGN.md)*

> **§4.12 ✅ DO** keep every interactive target ≥ 44px with a visible accent focus halo. *(DESIGN.md)*

> **§4.13 ✅ DO** collapse all motion to instant under `prefers-reduced-motion`; the simulation still
> updates to the end state. *(DESIGN.md)*

> **§4.14 ✅ DO** keep ownership of UI DOM in the designated owner: Module 2's `uiManager.js` owns the
> parameter dock; Module 1's engine + `chrome.js` own the chrome. *(ARCHITECTURE.md §3, CLAUDE.md)*

> **§4.15 ✅ DO** treat the consolidated root `../DESIGN.md` as the single source for the shared design
> system — there is exactly one copy. Per-module application notes live in its §7 "Module-specific
> exceptions," never in a duplicated shared file. *(ADR-010, DESIGN.md)*
> Reason: the former per-module `DESIGN.shared.md` copies drifted; a single root file removes the drift
> surface entirely.

> **§4.16 ❌ NEVER** re-define a shared token in a module's local `DESIGN.md` appendix — the appendix
> adds only that module's own viewport encodings. The root `../DESIGN.md` wins on conflict. *(ADR-010, DESIGN.md)*

> **§4.17 ✅ DO** give every pressable control the one shared press language — `transform: scale(0.97)`
> on `:active:not(:disabled)`, easing back over `--dur-fast`. **❌ NEVER** use a 1px translate.
> *(DESIGN.md §5.1; code audit 2026-06-27)*
> Reason: the former shared doc said "nudges down 1px," but both modules' code uses `scale(0.97)`; the
> doc was corrected to match the code.

> **§4.18 ❌ NEVER** write `--color-geometry-fill` — the canonical rendered-geometry fill token is
> `--color-solid-fill` (`#e7e1d4`). The old shared doc's `geometry-fill` name was never implemented.
> *(DESIGN.md §8; code audit 2026-06-27)*

> **§4.19 ✅ DO** guard the ghost **Reset** with an inline **two-state confirm** — the first click arms it
> into "Reset everything? · Yes / Cancel" (Back / Next step aside while armed), and **only "Yes"** fires
> `window.simAPI.reset()`. **❌ NEVER** wire Reset to wipe on a single click. *(DESIGN.md §5.1; ADR-002)*
> Reason: a stray click must not destroy several steps of work; the confirm is the guard, and the single
> reset path (§2.9) is still the only wipe route.

> **§4.20 ✅ DO** lay out each step-rail button (`.rail__btn`) with `flex-direction: column` so the
> text label stacks *below* the step marker, not beside it. This keeps the vertical rail narrow and
> stops long step titles ("First-Angle Setup") from pushing the button — and the whole wizard — wide.
> Pair it with a `max-width` on `.rail__label` so titles wrap instead of stretching the rail. *(DESIGN.md §5.6)*

---

## Section 5 — Camera & Animation Rules

> **§5.1 ✅ DO** make auto-zoom a one-shot, fixed-duration eased dolly restarted from the camera's
> live distance (`reframeIfClipped` at the end of `rebuild()`, push-back only). *(ADR-014)*

> **§5.2 ❌ NEVER** use a per-frame "exponential" camera follow. *(ADR-014)*
> Reason: it reads as an accelerating lurch and an end-of-drag jump.

> **§5.3 ❌ NEVER** run both a fresh tight fit and the push-back dolly in the same rebuild — do
> tight-fit (boot/reset) **XOR** push-back (slider edits), never both. *(ADR-014)*
> Reason: the two tweens fight and strand the camera far back.

> **§5.4 ✅ DO** feed auto-zoom and quick-views an accurate `contentBox(model)` — the meaningful
> geometry only (point/line + feet), never the full grid box. *(ADR-014)*

> **§5.5 ✅ DO** animate the camera during the fold-to-flat. *(ADR-013, ADR-036)*

> **§5.6 ❌ NEVER** re-cite "the camera never moves during the fold" as a binding rule — it was
> deliberately overturned. *(ADR-013)*

> **§5.7 ✅ DO** fly the 3D-to-2D orthographic camera swoop during the fold on `orthoViews` lessons
> (Points/Lines): hand the view to the ortho camera and sweep it square-on to the answer sheet with a
> perspective→ortho morph, so the fold lands on the finished 2D sheet. Built on the existing dual-camera
> stack (`engageOrtho` / `tweenCamFull` / `restorePerspective` + the `projectionMorphK` morph — §5.18):
> `Module1/src/engine.js` `animateFoldSwoop` / `snapFoldSwoop` (Module 1 Points + Lines) and
> `graphics_module_1_topic_3_points/main.js` `swoopToAnswerSheet` (standalone Points). *(ADR-036)*
> Reason: the learner ends the fold reading the true orthographic drawing, not a foreshortened
> sheet; frame the hinge in the sweep's path (the known ADR-013 objection) rather than abandon the
> square-on landing.

> **§5.8 ❌ NEVER** use the held-angle dolly (`animateFoldHold`) as the fold's camera move — retired
> by ADR-036, which overturns ADR-013's held-angle revision. *(ADR-036)*
> Reason: it ended the fold on a foreshortened sheet; the learner's-angle read lives in free orbit
> before the fold.

> **§5.9 ✅ DO** restore the learner's pre-fold orbit view on reverse — or when leaving a folded sheet by
> any other path — so the camera never strands. On `orthoViews` lessons the swoop moves only the ORTHO
> camera, so the perspective camera keeps that pose and `restorePerspective` hands straight back to it
> (no stored pose needed); the legacy single-perspective intro fold still stores/restores `preFoldPose`.
> *(ADR-013, ADR-036)*

> **§5.10 ✅ DO** let the fold own the camera: cancel any in-flight `camTween`/`autoZoomTween`, close
> the Compare card, and skip `OrbitControls.update()` while `animating`. *(ADR-013)*
> Reason: so two camera moves never fight.

> **§5.11 ❌ NEVER** reintroduce the persistent dual-pane viewport (PiP second view + `#tbar` toggle
> bar + a real `swap()`); `swap()`/`isMain3D()` survive only as deprecated no-op shims. *(ADR-012)*

> **§5.12 ✅ DO** keep the main pane always the live 3D scene (`#c3d`); the second view appears on
> demand in the floating Compare card. *(ADR-012)*

> **§5.13 ✅ DO** keep `#sim-viewport`, `#canvas-area`, and `body` free of any CSS `transform` (the
> no-transform invariant). *(ADR-012, CLAUDE.md)*
> Reason: a transform on an ancestor reparents the `position:fixed` Compare canvas and mis-places it.

> **§5.14 ✅ DO** show a *live-rebuilt* view in the Compare card (the same `fill()` machinery), never
> a snapshot. *(ADR-012)*

> **§5.15 ✅ DO** snap the fold (and every tween) to its end state under `prefers-reduced-motion`;
> state still updates. *(ADR-013, DESIGN.md)*

> **§5.16 ✅ DO** on the Lines expanded Compare split, collapse the wizard and re-parent the
> `WORKBENCH_CONTROLS` `[data-ctrl]` wrappers into the docked `#workbench-rail`
> (`main.js` `enterWorkbench`/`exitWorkbench`), so the two panes get a true 50/50 while the live
> parameters stay reachable under both. This list now includes the topic's construction launcher(s)
> (T6: `traces`, `truelength`; T5: `rotation`) alongside the value drivers — a construction runs
> inside the expanded split like any other control, never forcing a demotion to the compact card.
> *(ADR-021, ADR-037, ADR-076)*
> Reason: the reserved wizard otherwise cramps each pane and gates the live controls (and any
> construction launcher) away from the dual view.

> **§5.16a ✅ DO** dock ONLY the value drivers of the pane the rail serves — the sibling
> Module-3 topic docks two groups (`['shape', 'section']`), and Conic Sections docks two
> (`['cone', 'section']`). **❌ NEVER** dock a topic's whole control set: `#workbench-rail` is a
> single wrapping row on the split grid's `auto` row, sized by its content against the viewport's
> `minmax(0, 1fr)` row, so every extra group is taken directly out of the 3D pane's height.
> *(ADR-021, ADR-037; regression fixed 2026-07-29)*
> Reason: docking all six step groups in `graphics_module_3_topic_2_2_conic_sections` drove the
> rail to **1340 px**, starving the viewport row to **2 px** — the renderer, the drawing sheet and
> the rail toggle all collapsed with it. A control the split cannot show is reached by leaving the
> split, exactly as the sibling topics do.

> **§5.17 ❌ NEVER** mirror/duplicate the driver or construction-launcher controls into the rail, or
> give the docked rail a shadow — **re-parent** the existing nodes (one source of truth) and
> separate the rail with a hairline only (Flat-Ink). *(ADR-021, ADR-037)*

> **§5.18 SCOPE (ADR-078):** this rule binds a topic that HAS both cameras. A topic whose subject is
> a measured drawing may run on a **single orthographic camera** with no perspective camera at all
> (`graphics_module_1_topic_1_1_dimensioning`) — there is then no hand-off to morph, and adding a
> perspective camera merely to satisfy the rule would introduce a projection the lesson must never
> teach in. **❌ NEVER** read §5.18 as "every topic needs a perspective camera."

> **§5.18 ✅ DO** move between the 3D perspective view and a flat orthographic quick-view (Top / Front /
> Side) with the **`projectionMorphK` dual-camera matrix morph** — element-wise lerp the ortho camera's
> `projectionMatrix` toward the perspective camera's over the same tween, so the view continuously
> gains/loses depth and the hand-off between the two camera objects is a visual no-op. **❌ NEVER**
> hard-swap the perspective and orthographic cameras in a single frame. *(DESIGN.md §5.10;
> `Module2/main.js` `applyProjectionMorph`; code audit 2026-07-02)*
> Reason: orthographic has no foreshortening and perspective has full foreshortening, so a straight
> camera swap makes off-plane geometry "pop" into depth in one frame — the jarring cut the morph removes.

> **§5.19 ✅ DO** render the on-demand Compare **2D orthographic drawing** at a scale locked to a
> **fixed, principled basis that never chases the live-drawn geometry** — never a bare magic constant,
> and never the live bbox of what's about to be drawn:
> - **`Module1/lines.js` (legacy):** locked to the static sheet bounds, derived from `SHEET`
>   (`sheet2D`: `SHEET2D_SPAN = (SHEET/2)*10`). *(ADR-038)*
> - **The two standalone Lines topics** (`graphics_module_1_topic_5_projection_of_line_types`,
>   `graphics_module_1_topic_6_projection_of_straight_lines`): locked to the line's own **intrinsic
>   True Length** (`M.tl` from `resolveLine()`), recomputed per `layout2D()` call — invariant to the
>   distance-from-HP/VP sliders (translate end A only) and the θ/φ angle sliders (reorient, don't
>   lengthen); changes only when TL itself changes. *(ADR-075, the ADR-053 model applied to a line;
>   supersedes ADR-038/ADR-072 for these two topics only)*
> - **Module 2:** locked to the solid's own **intrinsic 3D size** (`solidSpanUnits`), anchored to that
>   layout's own nominal centre — NEVER the live drawn bbox, and never `distHP`/`distVP`/angle slider
>   values. *(ADR-053, refines the anchor in ADR-054; supersedes ADR-052's live auto-fit)*
>
> All three: a real millimetre reads the same on-screen length across every slider/distance/angle
> value **at a given intrinsic size** (span/TL/solidSpanUnits), and a rare over-range case extends past
> the sheet edge rather than shrinking the drawing. **❌ NEVER** auto-fit / auto-zoom the 2D drawing to
> the live-drawn bbox — the ADR-014 auto-zoom is for the 3D perspective main pane ONLY, and an
> intrinsic-size basis (TL, `solidSpanUnits`) is not the same thing as a live-bbox auto-fit (ADR-052's
> superseded approach): the former changes only when the underlying object's size changes, the latter
> rescales on every slider drag. *(ADR-038; ADR-075; ADR-053; ADR-014)*
> Reason: the orthographic sheet is a *measured* drawing — a live-bbox auto-fit shrinks 10 mm as the
> drawn layout grows (e.g. on a distance-slider drag), breaking "10 mm reads as 10 mm" and making the
> side-by-side 3D↔2D comparison meaningless; a fixed-but-wrong-sized span either overflows (Lines'
> original 100 mm magic constant) or leaves a typical drawing reading as a speck (the old
> `SHEET2D_SPAN = 150` framed to the TL slider's max, not the line's actual TL — ADR-075's motivation).
>
> **Exception — user-driven pan/zoom are allowed.** Drag-to-pan (ADR-054) and scroll-wheel zoom
> (ADR-055) on Module 2's Compare canvas are permitted as independent UX view-transform layers applied
> *after* the fixed scale above — a screen-space offset (pan) and a screen-space multiplier (zoom) in
> `project()`, composed on top of the locked `scale`/anchor, never recomputing or replacing them. The
> "10 mm reads as 10 mm" invariant holds at the 1×/centred default; zoom is a reversible inspection
> lens, not a rescale of the drawing, and resets to 1×/centred on a fresh Compare open, a canvas
> double-click, and a full sim reset (`resetCompareView()`). *(ADR-054; ADR-055)*
> Reason: a learner should be able to inspect a clipped or small drawing without the measured-mm
> invariant becoming a trap — pan/zoom solve that as opt-in, user-controlled screen-space lenses that
> never touch the mathematically pure base scale §5.19 otherwise protects.
>
> **Reference lines follow the same rule.** Module 2's XY / X1-Y1 ground-line/hinge marks on the
> Compare sheet are placed from the **analytic fold coordinates** (`sheetY=0`, `sheetX=−z0`), never a
> live-bbox midpoint between adjacent views — a midpoint drifts with the same `distHP`/`distVP`
> sliders the fixed scale above already protects against. *(ADR-056)*

> **§5.20 ✅ DO** make default 3D perspective camera poses look from the Top-Left-Front (negative X,
> positive Y, positive Z) so the orthographic layout reads predictably left-to-right. *(ADR-048)*
> Reason: Top/Front/Side are cast to the object's top, back, and left respectively (first-angle);
> starting the eye already on that left/top side previews how the unfolded drawing will read.

---

## Section 6 — Answer Validation & Problem Library Rules

> **§6.1 ✅ DO** make the self-check ±0.5-tolerant. *(ADR-015)*
> Reason: it accommodates slider granularity without greening a wrong drawing.

> **§6.2 ❌ NEVER** auto-fill answers — loading a problem resets to defaults and routes to the
> dial-able step; the student dials, the check lights green. *(ADR-015)*

> **§6.3 ✅ DO** keep answer/target logic in `problemLibrary.js` (driven off the rebuild state-change
> bus), never in UI control handlers. *(ARCHITECTURE.md §3, ADR-015)*

> **§6.4 ✅ DO** use an OR-array target only where the geometry is genuinely degenerate (on-plane/
> origin points where quadrants coincide). *(ADR-015)*

> **§6.5 ❌ NEVER** add `θ = +θ` OR `−θ`, or endpoint A/B OR, for lines. *(ADR-015)*
> Reason: these were rejected as false positives that would green a wrong drawing.

> **§6.6 ✅ DO** favour textbook fidelity over fudging — when a problem doesn't fit existing controls,
> add a dedicated control and a per-problem hint rather than adjust a number or drop the problem. *(ADR-018)*

> **§6.7 ✅ DO** keep textbook problem wording verbatim. *(ADR-018)*

> **§6.8 ✅ DO** reconcile units by the declared scale **1 world unit = 10 mm** — a label change only. *(ADR-018)*

> **§6.9 ❌ NEVER** globally rescale world units to match mm; the converter `toW(v)=v/10` stays
> unchanged. *(ADR-018)*

> **§6.10 ❌ NEVER** globally "fix" `pointData.js` comments to mm. *(ADR-018)*
> Reason: the same stored default is labelled mm in Points but cm in Quadrants/First-angle — by design.

> **§6.11 ❌ NEVER** assume sibling point-lessons share a display unit. *(ADR-018)*

> **§6.12 ✅ DO** keep the Lines sim a 5-step build-up on one general line (True Length → distances →
> inclinations → projections → traces), all pinned to `LineCase.INCL_BOTH`. *(ADR-017)*

> **§6.13 ❌ NEVER** revert the Lines sim to six fixed-orientation "case" steps. *(ADR-017)*

> **§6.14 ✅ DO** keep Lines controls dedicated per step (TL on step 1, distances on step 2, θ/φ on
> step 3) — not cumulative. *(ADR-017)*

> **§6.15 ❌ NEVER** rename the hard-coded viewport labels ("line AB"/"end A" for Lines, "Point P"
> for Points); problem text must match them. *(ADR-017)*

> **§6.16 ✅ DO** draw projection-foot/point markers as thick filled dots (paper halo + colour disc,
> via `acr()`). *(ADR-016)*

> **§6.17 ✅ DO** draw 2D orthographic projectors as solid Type-B continuous thin lines; keep 3D
> pictorial-view projectors dashed. *(ADR-016)*
> Reason: in 2D the HP/VP distinction is carried by position, so solid is standards-correct (N.D. Bhatt).

> **§6.18 ❌ NEVER** "fix" the 2D projectors back to dashed, the dots back to crosses, or the 3D
> projectors to solid — these look like regressions but are deliberate. *(ADR-016)*

> **§6.19 ✅ DO** draw every 2D/orthographic dimension as BIS SP 46:2003 **Type B** — continuous
> narrow lines, extension lines with a ~1 mm gap + ~2 mm overshoot, and **3:1** arrowheads (length :
> width = 3 : 1, so half-width = length/6). Use the **FILLED** arrowhead on the Points Canvas2D
> Compare sheet; use the **OPEN 3:1 chevron** in `Module2/src/projectionDrawer.js` (a filled head
> needs a `Mesh` and breaks its single-`LineSegments2` disposal contract). Dimension linework reads
> `--color-ink`; CSS2D labels read `--font-mono` / `--text-xs`. *(ADR-041, ADR-016)*
>
> **Carve-out (ADR-079):** this rule governs dimensions that are *incidental* to another lesson.
> `graphics_module_1_topic_1_1_dimensioning` **teaches** termination geometry, so it draws the five
> styles to its own master reference instead — open head at ≈15° included angle and 3–4 mm long drawn
> thick (the textbook's class-work default, §4.5 item 2); closed / closed-and-filled heads 3–4 long ×
> 1.5–2 wide (Fig. 4.6); oblique strokes at 45°; dots ≈1.5 mm. **❌ NEVER** "fix" that topic's heads
> back to 3:1 — 3:1 sits outside the band its own figure prints, so the drawing would contradict the
> card quoting it.

> **§6.20 ✅ DO** treat `projectionDrawer.js`'s `dimensionGroup` like `ppGroup` — the consumer parents
> and step-gates it (it is NOT added to the returned `group`), and it is reached by held reference in
> `setResolution` + `dispose` (CSS2D label nodes pulled from the DOM per §3.5). **❌ NEVER** auto-add it
> to `group` or leave its CSS2D nodes undisposed. *(ADR-041, ADR-004)*

> **§6.21 ✅ DO** enforce a syllabus problem-KIND exclusion as a hard data-layer filter:
> `EXCLUDED_TYPES = Object.freeze([...])` in `problems.js`, applied inside `enabledProblems()`
> alongside `ENABLED_TIERS` (`ENABLED_TIERS.includes(p.tier) && !EXCLUDED_TYPES.includes(p.type)`).
> Every problem declares a `type`. *(ADR-062, ADR-069)*
> Reason: pose-based `TIERS`/`ENABLED_TIERS` is scope-based and cannot express a banned KIND.

> **§6.22 ❌ NEVER** encode a syllabus exclusion as a never-enabled tier or as authoring
> discipline ("just don't author them") — both vanish silently when tiers are reshuffled.
> *(ADR-062, ADR-069)*

> **§6.23 ✅ DO** keep the platform's `1 world unit = 10 mm` (§6.8) for anything that enters the 3D
> scene. A topic whose 2D construction NEVER enters the scene **may** store its sheet state in
> millimetres instead (`graphics_module_3_topic_2_2_conic_sections`) — but then **❌ NEVER** convert
> inside the pure engine leaf: convert once, at the control, and state each bag's unit in exactly
> one place. *(ADR-083, ADR-018)*
> Reason: the chapter quotes millimetres, so storing world units would leave the data layer, the
> dock, the self-check targets and the textbook statement disagreeing by a factor of ten; but a
> conversion buried in the engine puts the same factor somewhere no author will look.

> **§6.24 ✅ DO** build a multi-construction drawing engine as ONE pure leaf where each layout
> returns a **display list** of typed primitives plus its own analytic bbox, rendered by a SINGLE
> renderer. **❌ NEVER** give a construction its own drawing path. *(ADR-084, ADR-066)*
> Reason: twelve immediate-mode routines are twelve chances for the thin-construction /
> heavy-answer line vocabulary to drift.

> **§6.25 ✅ DO** prove every construction with a Node oracle before shipping it — each plotted
> point must satisfy its own curve (PF = e·PQ, `x²/a² ± y²/b² = 1`, a zero discriminant for an
> envelope, a constant sum / difference / product). Re-run it after touching a layout. *(ADR-084,
> ADR-019)*
> Reason: a wrong construction still draws a plausible curve — both defects found this way were
> invisible on screen.

> **§6.26 ✅ DO** put a control in the ONE guided step whose question it answers, and hide it
> everywhere else. **❌ NEVER** show a learner the whole parameter set of a topic at once because
> every parameter is real. *(ADR-086, PRODUCT.md §1/§2)*
> Reason: the persona is the struggling first-year. A panel offering eleven construction methods
> before the learner knows why a parabola differs from an ellipse is CAD software with a syllabus
> attached — the failure the Conic Sections redesign was written to undo.

> **§6.27 ✅ DO** report a phenomenon in plain words BEFORE naming it, and keep the textbook
> statement for the step that introduces the name. **❌ NEVER** open with the formal definition.
> *(ADR-086)*
> Reason: "a closed oval that still closes up" is something a learner can check against the screen;
> "a section plane inclined to the axis and cutting all the generators" is something they can only
> take on trust. A data-layer entry that names a phenomenon should therefore carry BOTH forms —
> `ConicSection`'s `seen` / `name` / `rule` triple is the pattern.

> **§6.28 ✅ DO** let a teaching step MOVE the model for the learner (a guided tour that travels the
> cutting plane, a construction that plays stage by stage), and narrate what changed. **❌ NEVER**
> let that shortcut reach an assessed answer — the Problem Library's checked targets stay
> hand-dialled. *(ADR-086, scoping ADR-063)*

---

## Section 7 — Cross-Module Harmony Rules

> **What must be identical:**

> **§7.1 ✅ DO** keep `anim.js` byte-identical across Module 1, Module 2, and the topic copies. *(ARCHITECTURE.md §7)*

> **§7.2 ✅ DO** keep the geometry generators (`cube`, `cone`, `cylinder`, `genericPrism`,
> `genericPyramid`, `genericSolid`) byte-identical across the Module-2 family. *(ARCHITECTURE.md §7)*

> **§7.3 ✅ DO** treat the consolidated root `../PRODUCT.md` as the single platform-wide product
> contract — there is exactly one copy; each module references it from its `CLAUDE.md`, never a
> per-module duplicate. *(ADR-023, ARCHITECTURE.md §7)*
> Reason: the former per-module `PRODUCT.md` copies were byte-identical duplicates and a latent drift
> point; one root file removes the drift surface — the same move ADR-022 made for `DESIGN.md`.

> **§7.4 ✅ DO** consume the single root `../DESIGN.md` (see §4.15) and keep the import/runtime contract
> (no-build, pinned `three@0.160.0`, `.js` extensions, relative paths) identical everywhere. *(ARCHITECTURE.md §7, ADR-010)*

> **What is intentionally different (and must stay different):**

> **§7.5 ✅ DO** keep the two architectures as-is: Module 1 = one shared `engine.js` + thin pages +
> separate `shell.css`; Module 2 = orchestrator `main.js` + many `src/` leaf modules + inline CSS. *(ADR-011, ARCHITECTURE.md §8)*

> **§7.6 ❌ NEVER** conflate the two `uiManager.js` files: Module 2's is a full parameter-dock
> controller; Module 1's is a 3-line vestigial stub. Same name, opposite role. *(ARCHITECTURE.md §9.7, ADR-011)*

> **§7.7 ✅ DO** re-learn the target module's architecture before editing it — fluency in one does not
> transfer to the other. *(ARCHITECTURE.md §9.5)*

> **§7.8 ✅ DO** treat the very large hub files (`Module2/main.js` ~116 KB, `Module2/index.html`
> ~102 KB, `Module1/engine.js` ~108 KB) as load-bearing; read the surrounding code before editing. *(ARCHITECTURE.md §9.6)*

> **§7.9 ✅ DO** keep Topic 2's inclination removal intact (no `angleHP`/`angleVP`, narrowed
> `ENABLED_TIERS`) — it is an intentional scope-down, not a missing feature. *(ARCHITECTURE.md §8, ADR-009)*

> **Also byte-identical (added 2026-06-30):**

> **§7.10 ✅ DO** keep `meshAnalyzer.js` byte-identical across `Module2/` (master), every topic clone
> that carries it (today `graphics_module_2_topic_2_simple_positions/`), and
> `graphics_module_1_topic_1_foundations/`. The degenerate-triangle safeguard (§3.30) was discovered in
> the Foundations clone and **backported by merge** to the master, then re-copied to the topic clone, so
> all three copies match. *(ADR-029, ADR-009, §1.5)*
> Reason: `meshAnalyzer.js` is "copied verbatim," not adapted (unlike `iShape.js`, §1.13) — there is no
> topic-specific logic in it, so any fix must land in all copies or they drift (§1.4, §1.8).

---

## Section 8 — Documentation Rules

> **§8.1 ✅ DO** add an ADR to DECISIONS.md (using the ADR-000 template) whenever you make a
> non-obvious decision — especially one with two real options. *(DECISIONS.md)*

> **§8.2 ✅ DO** add a dated entry to the relevant `CHANGELOG.md` after any bug fix, feature, or
> significant change (what changed and why it mattered). *(CLAUDE.md)*

> **§8.3 ✅ DO** update ARCHITECTURE.md when you change the structure it describes (a new module file,
> a moved responsibility, a new shared/duplicated file). *(ARCHITECTURE.md)*

> **§8.4 ❌ NEVER** silently reverse a documented decision. If you overturn an ADR, write a new ADR
> that supersedes it — do not just change the code. *(DECISIONS.md)*

> **§8.5 ✅ DO** keep cross-references pointing at files that exist — the `SIMATRIX-UI-STANDARDS.md`
> reference now resolves to this `RULES.md`. *(ARCHITECTURE.md §9.3)*

> **§8.6 ❌ NEVER** restore a design that an ADR records as superseded just because the current code
> "looks wrong" — check DECISIONS.md first (the fold camera, the 2D projector style, the Lines
> stepper, the pentagonal 54° are all deliberate). *(ADR-013, ADR-016, ADR-017, ADR-008)*

---

## Section 9 — Anti-Patterns (Never Do These)

> The 60-second scan. Every line here is a ❌ NEVER drawn from the rules above. If you are about to do
> one of these, stop and read the cited rule first.

**Build / runtime**
- ❌ Add `package.json`, npm, or any bundler. *(§2.1)*
- ❌ Use the UMD global, `@latest`, or unpinned `three`. *(§2.2)*
- ❌ Write extensionless or absolute-path imports. *(§2.4, §2.5)*
- ❌ Open the sim from `file://` or assume port 80 works. *(§2.6)*
- ❌ Add `postMessage`/`window.parent`/`window.top`, a second reset path, or any non-CDN network call. *(§2.9, §2.10, §2.12)*
- ❌ Install puppeteer/playwright, or verify against a hand-typed replica instead of the shipped module. *(§2.17, §2.19)*
- ❌ Add `three-mesh-bvh` via npm/a bundler, or pin it to `@latest` instead of the shared import map. *(§2.20)*

**3D scene**
- ❌ Mutate the Three.js scene outside `rebuild()`, or skip the disposal contract. *(§3.2, §3.3)*
- ❌ Let leaf modules import each other (only `genericSolid.js` is shared). *(§3.6)*
- ❌ Copy Unity signs verbatim, leave `euler.order` implicit, or chase a `src_csharp/` path. *(§3.8, §3.10, §3.11)*
- ❌ Use `LineBasicMaterial`, skip `computeLineDistances()`, or omit `polygonOffset`. *(§3.13, §3.17, §3.18)*
- ❌ Leave dashed hidden-edge lines without a depth-offset/`renderOrder` bias — a coincident visible line must always win. *(§3.18a)*
- ❌ Allow all rotation modes at once, or "fix" the pentagonal preset to 18°. *(§3.21, §3.22)*
- ❌ Re-add the `AxesHelper`, add PBR, or cast shadows on geometry. *(§3.24, §3.25)*
- ❌ Ship a non-manifold solid (overlapping/duplicate extrusions), or keep a zero-area triangle in `meshAnalyzer.js`. *(§3.29, §3.30)*
- ❌ Debounce the on-orbit hidden-line recompute (rAF-throttle it), or leave a stale/undisposed `three-mesh-bvh`. *(§3.32, §3.31)*
- ❌ Assume a topic importing `sectionCut.js` truncates its solid, or leave a discarded clipper result undisposed. *(§3.34, §3.35)*
- ❌ Pass device-px scissor/viewport regions straight to `setViewport`/`setScissor` — convert to logical px first. *(§3.33, §3.33a)*

**UI / visual**
- ❌ Hard-code a hex in JS or component CSS. *(§4.1)*
- ❌ Put blue inside the viewport, or let a functional encoding read as the chrome accent. *(§4.5)*
- ❌ Use a 500/600 font weight, a bare `#000`/`#fff`, or colour as the only signal. *(§4.7, §4.11, §4.6)*
- ❌ Cast a shadow on geometry or use elevation as decoration. *(§4.9)*
- ❌ Re-define a shared token in a module appendix. *(§4.16)*
- ❌ Wire Reset to wipe on a single click instead of the two-state "Reset everything? · Yes / Cancel" confirm. *(§4.19)*

**Camera / animation**
- ❌ Re-cite "camera never moves during the fold," or use the held-angle fold dolly (`animateFoldHold`). *(§5.6, §5.8)*
- ❌ Use a per-frame exponential camera follow, or run tight-fit and push-back in one rebuild. *(§5.2, §5.3)*
- ❌ Reintroduce the persistent dual-pane PiP/`swap()`, or show a snapshot in the Compare card. *(§5.11, §5.14)*
- ❌ Put a CSS `transform` on `#sim-viewport`/`#canvas-area`/`body`. *(§5.13)*
- ❌ Dock a topic's whole control set into `#workbench-rail` — it is sized against the viewport's row, so extra groups eat the 3D pane. *(§5.16a)*
- ❌ Mirror the workbench rail controls instead of re-parenting, or give the docked rail a shadow. *(§5.17)*
- ❌ Hard-swap perspective↔orthographic cameras in one frame instead of the `projectionMorphK` morph. *(§5.18)*

**Problems / units**
- ❌ Auto-fill an answer, or put answer logic in UI handlers. *(§6.2, §6.3)*
- ❌ Add `θ=±θ` or endpoint A/B OR-targets for lines. *(§6.5)*
- ❌ Globally rescale world units or "fix" `pointData.js` comments to mm. *(§6.9, §6.10)*
- ❌ Revert the Lines sim to six fixed cases, or rename "line AB"/"end A"/"Point P". *(§6.13, §6.15)*
- ❌ "Fix" 2D projectors to dashed, dots to crosses, or 3D projectors to solid. *(§6.18)*

- ❌ Show every parameter of a topic at once, or name a phenomenon before the learner has seen it. *(§6.26, §6.27)*
- ❌ Convert units inside a pure engine leaf, or leave a state bag's unit unstated. *(§6.23)*
- ❌ Give one construction its own drawing path, or ship a construction no oracle has proved. *(§6.24, §6.25)*

**Cross-module / docs****Cross-module / docs**
- ❌ Fix a shared file directly in a topic folder, or infer the master from a `topic_N` number. *(§1.3, §1.7)*
- ❌ Ship an `index.html` `<title>` that disagrees with `meta.json.title`. *(§1.12)*
- ❌ Use a capitalised difficulty value in meta.json ("Intermediate" not "intermediate"). *(§2.11a)*
- ❌ Cut a new topic from a sibling without re-copying and md5-verifying every shared file, or carry a shared file the topic never imports. *(§1.15, §1.16)*
- ❌ Copy `iShape.js` verbatim as if it were byte-identical — it is an adapt file. *(§1.13)*
- ❌ Reintroduce a per-topic `DESIGN.md`/`PRODUCT.md` instead of consuming the root copies. *(§1.14)*
- ❌ Conflate Module 1's stub `uiManager.js` with Module 2's controller. *(§7.6)*
- ❌ Silently reverse a documented decision, or restore an ADR-superseded design. *(§8.4, §8.6)*

---

*Assembled from ARCHITECTURE.md, DECISIONS.md (ADR-001…028), the root `DESIGN.md`, and both modules'
`CLAUDE.md`. Every rule is traceable to one of those. RULES.md is the checklist; DECISIONS.md is the
reasoning; ARCHITECTURE.md is the map. Add new rules per the Preamble — always cite the source ADR.*
