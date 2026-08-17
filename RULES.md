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
> `md5sum` before writing a line of topic code**. *(ADR-137)*
> Reason: cutting from a sibling starts at chrome parity and makes the delta reviewable; the
> md5 check is what neutralises the "topics carry stale shared files" hazard (§1.8) that makes
> sibling-cutting dangerous in the first place.

> **§1.16 ❌ NEVER** carry a shared engine file a topic does not import ("it might be useful
> later"). Omit it, and say in the topic's `CLAUDE.md` which shared files it does carry. *(ADR-137)*
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

> **§2.10 ❌ NEVER** add `postMessage`, `window.parent`, or `window.top` usage anywhere **except**
> the two sanctioned outbound messages: `window.parent.postMessage({ type: 'sim:ready' }, '*')`
> fired once from `markBooted()`, and `window.parent.postMessage({ type: 'sim:complete' }, '*')`
> fired from `markComplete()` when the lesson reaches its finished state. `sim:ready` stays strictly
> one-shot; `sim:complete` may fire more than once per page load (host-confirmed to support repeated
> triggers) — no latch is required, though a topic may still keep one. The host↔sim surface is
> `window.simAPI` + `meta.json` for control, plus those two outbound signals — nothing else, and no
> inbound `message` listener; `window.simAPI` stays the only path *into* the sim. *(ADR-002, ADR-078,
> ARCHITECTURE.md §6)*

> **§2.11 ✅ DO** ship a `meta.json` at the root with all four fields — `title`, `description`,
> `difficulty`, `tags`. Uploads missing any field are rejected. *(ADR-002, CLAUDE.md)*

> **§2.11a ❌ NEVER** use a capitalised difficulty value in meta.json. The backend requires
> exactly: `beginner`, `intermediate`, or `advanced` (all lowercase). *(PLATFORM-RULES.md §1.11a)*

> **§2.12 ❌ NEVER** make a runtime network call beyond the one-time Three.js CDN fetch and the
> font fetch from Supabase Storage (§2.15); the sim must work fully offline once those load.
> *(ADR-002, ADR-086, CLAUDE.md)*
> Note: since ADR-086, first-load typography is no longer guaranteed offline — see §2.15.

> **§2.13 ✅ DO** render only a dismissible "Best experienced on desktop" banner below 768px — never
> block, redirect, or disable the sim. *(CLAUDE.md)*

> **§2.14 ✅ DO** make the sim self-starting on page load; there is no external `init()` call. *(CLAUDE.md)*

> **§2.15 ✅ DO** load fonts (Atkinson Hyperlegible + IBM Plex Mono) via `@font-face` pointed at
> the Supabase Storage CDN (ADR-086, reverses the prior "bundle local woff2, never CDN" rule);
> **never** point at a Google-Fonts CDN or any other third-party font host. *(ARCHITECTURE.md §7,
> DESIGN.md §3.1, ADR-086)*
> Reason: these two fonts are the platform's own shared typography, defined in the root design
> system — not something each subject module chooses independently. Practically: web-team
> directive to centralize font hosting instead of duplicating the same three files in every
> module/topic's `assets/fonts/`. Tradeoff: first-load typography now depends on reaching
> Supabase; `font-display: swap` keeps the fallback safe (system font, no hang) but the sim's
> typography is no longer guaranteed correct fully offline on first load (§2.12). No local
> `assets/fonts/` anywhere in the repo.

> **§2.16 ✅ DO** keep a packaged Module 2 payload ≤ 10 MB — prefer `.glb` over `.gltf+bin`, `.webp`
> over `.png`/`.jpg`, and skip HDR environments. *(CLAUDE.md)*

> **§2.17 ✅ DO** verify sims headlessly by driving Chrome over the DevTools Protocol with Node's
> **built-in** `WebSocket`/`fetch` — never install puppeteer/playwright or any npm package. *(ADR-019)*

> **§2.18 ✅ DO** disable the network cache (`Network.setCacheDisabled`) during headless verification,
> or Chrome serves a stale ES module. *(ADR-019)*

> **§2.19 ✅ DO** run the final green check against the **shipped module**, never a hand-typed replica
> of its logic. *(ADR-019)*
> Reason: a replica once passed while the shipped module had a real call-site bug.

> **§2.19a ❌ NEVER** ship a visual/UI fix or feature on *assumed* geometric or logical
> correctness. Before implementing anything involving geometry, angles, positions, or derived
> values: **✅ DO** trace and verify the actual math/logic first — against the reference textbook
> figure where one exists — instead of pattern-matching to what looks visually plausible. Where
> the geometry allows it, define a **provable** correctness test ("point A lands within sub-pixel
> tolerance of point B"), not just a visual spot-check. Where a measured value's own math
> guarantees a range (e.g. a signed-angle difference of two `atan2` calls, which spans `(-2π,2π)`
> unless wrapped), check the fix against that range, not just against one example that looked
> right. *(ADR-090, ADR-099, ADR-103, ADR-104, ADR-105)*
> Reason: every real bug in this project's history rendered plausibly while its math was never
> checked — a caption declaring "30° to the HP" over an axis actually drawn at 60° (ADR-099), a
> beat gate that passed while drawing zero new segments (ADR-090), a base-edge dimension measuring
> a triangulation-seam diagonal because "greatest projected length" guarantees a diagonal wins
> (ADR-103), a height dimension anchored to a synthetic bbox point instead of the real apex
> (ADR-103), and a rotation computed as a raw difference of two `atan2` calls that visibly spun the
> long way round near the ±180° seam because the difference was never wrapped back into `(-π,π]`
> (ADR-105). ADR-104's on-sheet ghost is the pattern done right: the claim (Set 3's top view IS
> Set 2's top view under a rigid 2D rotate+translate) was *proved* from the pose derivation before
> a line was drawn, so `t=1` lands on Set 3 by construction rather than by eye.

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
> another. *(ADR-133, extends ADR-007)*
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
> *(ADR-140, ADR-058)*
> Reason: Sections of Solids teaches the solid left after the cut; Conic Sections teaches the
> curve, and truncating there would discard the very nappe a hyperbola needs.

> **§3.35 ✅ DO** dispose a clipper result the scene never receives BY HAND, immediately, at the
> call site — the `rebuild()` disposal contract (§3.3) can only free what is parented into
> `shapeGroup`. *(ADR-140, ADR-004)*

> **§3.36 ✅ DO** give a 3-D label a LEADER LINE ending on the feature it names, and anchor the
> pill along the CAMERA's right/up axes so it stays clear of the silhouette at every orbit angle.
> **❌ NEVER** park a label at a fixed world point and hope it misses the solid. *(ADR-164)*
> Reason: a pill on its own reads as a word floating near the solid — the learner has to guess
> which part it means — and a world anchor that clears the silhouette from the default camera
> swings straight across it the moment the view turns.

> **§3.37 ✅ DO** hide a label with the geometry it names. **❌ NEVER** leave a caption describing
> something that is no longer on screen. *(ADR-164)*
> Reason: "Lower nappe" with no upper nappe present names a distinction the learner cannot see.
> In Conic Sections both nappe labels leave with the second half; the visibility flag that drives
> the mesh drives the label.

> **§3.38 ✅ DO** draw a solid's axis as a CENTRE LINE, with the run the outline conceals shown as
> short-dash hidden linework (`depthTest: false`) so it reads through the solid, and build both
> from explicit segment geometry, using the PLATFORM's constants (Foundations' chain 0.34 · 0.12 ·
> 0.07 · 0.12 with 0.35 overshoot; Module 2's hidden 0.12 / 0.08, world units at 10 mm/unit).
> **❌ NEVER** leave an axis invisible inside its own solid, and
> never reach for `LineDashedMaterial` where the dash length is a drawing decision. *(ADR-164)*
> Reason: an axis a learner cannot see is an axis the topic has not taught, and centre lines are
> not omitted in engineering drawings because material is in the way. Explicit segments also
> sidestep the `computeLineDistances()` trap that renders dashes solid (§3.17).

> **§3.39 ✅ DO** place Canvas2D captions through a collision pass — measure, try where authored,
> step along a fixed ladder of alternatives, drop only as a last resort — in priority order, with
> the finished curve treated as an obstacle. **❌ NEVER** assume a construction stays legible
> because its captions are legible one at a time. *(ADR-164, and §5.20's small-sheet suppression)*
> Reason: a nomenclature figure carries a dozen names round one curve. Because a caption CAN be
> dropped, the linework must carry the figure on its own — never let a construction depend on its
> labels to be readable.

> **§3.40 ✅ DO** build a solid's edge overlay AFTER any cut has been applied, and measure its
> centre line from the geometry that survived. **❌ NEVER** outline the shape the generator made
> when the shape on screen is the shape the clipper left. *(ADR-165)*
> Reason: a truncated nappe has a different silhouette from a whole one, and an axis drawn to the
> uncut height hangs in the empty space where the removed material used to be.

> **§3.41 ✅ DO** give a topic whose subject is the CURVE a ghost of the material its cut removed
> when it truncates a solid. **❌ NEVER** assume "truncate like the reference topic" is complete —
> check what is left at the extremes of the sliders. *(ADR-165, answering ADR-140)*
> Reason: at a steep tilt the kept half of a double cone is a stump no learner would call a cone,
> and a hyperbola's second branch leaves with the nappe that carried it.

> **§3.42 ✅ DO** derive a 2-D sheet's subject from the 3-D state it is a view OF, and say in one
> place which steps the link holds for. **❌ NEVER** let a topic's two panes be driven by
> independent controls that can disagree about what is being taught. *(ADR-165)*
> Reason: in Conic Sections the section's eccentricity is `sin θ ÷ sin g` — one line of the
> chapter's own trigonometry. Without it a learner could set the cut to a hyperbola and watch the
> sheet go on drawing an ellipse, which is two lessons in one window. The link is released only
> where the syllabus itself supplies the quantity as given data (there, from Step 5).

> **§3.43 ✅ DO** teach a piece of apparatus WHERE THE TEXTBOOK DEFINES IT before the topic uses
> it to measure. **❌ NEVER** open a step by handing the learner a construction element the
> chapter derived earlier and the simulation skipped. *(ADR-166)*
> Reason: Conic Sections used the focus and the directrix from §6.3 onward while §6.2 — where a
> sphere inscribed in the cone produces both — was missing entirely, so the two most important
> objects in the chapter arrived as unexplained givens. A syllabus audit is the cheapest way to
> find a gap of this shape; it does not show up as a bug, because everything downstream of it
> still works.

> **§3.44 ✅ DO** give a staged reveal that crosses panes ONE index, and say in the readout which
> pane the current stage is happening in. **❌ NEVER** run two independent reveal controls for
> what is one explanation. *(ADR-166)*
> Reason: Step 4's answer starts on the solid and finishes on the paper. Two buttons would make
> it two lessons; a single "4 of 10 · The focus (on the cone)" keeps it one, and tells the
> learner where to look — which a 3-D reveal narrated in a side panel otherwise never does.

> **§3.45 ✅ DO** give a topic's DEGENERATE cases their own output, and derive which case is live
> from the scene AFTER the geometry stage has run. **❌ NEVER** clamp a derived quantity into the
> range a model can draw and let the drawing stand. *(ADR-167)*
> Reason: a circle is e = 0, which no focal-polar conic model can express; clamping it to the
> slider's floor drew a visible ellipse next to a 3-D circle. A cut through the apex is not a
> locus at all. Both are named sections of the chapter, both had a correct drawing available, and
> the clamp turned each into the simulation telling the learner something false.

> **§3.46 ✅ DO** report the quantities the syllabus asks the learner to MEASURE, and say where on
> the drawing each is read. **❌ NEVER** ship a construction that draws the answer and leaves the
> number unstated. *(ADR-168)*
> Reason: six of Chapter 6's fifteen exercises end in "measure", "determine", "find" or "locate".
> A drawing that contains the answer without stating it cannot be checked, and a problem hint in
> this very topic already promised a measurement the sheet did not make.

> **§3.49 ✅ DO** let the learner drive a step that PROVES something: one press, one idea, and a
> Back that restores the previous state without replaying it. **❌ NEVER** put an explanation on
> a timer. *(ADR-172)*
> Reason: a proof the learner cannot stop is a film. Disable the forward control while a stage
> is still animating, so nothing can be skipped past half-drawn, and never disable Back.

> **§3.50 ✅ DO** measure a geometric claim before "fixing" what it looks like. **❌ NEVER**
> adjust geometry to match an expectation about the picture. *(ADR-172)*
> Reason: Conic Sections' tangent plane appears to cut its focal sphere because it does — the
> plane contains the circle in which the sphere touches the CONE, so it meets the sphere in that
> same circle, and the two can only be tangent on a degenerate cone. The fix was the
> visualisation and the wording; making it "touch at one point" would have shipped a new error
> in place of a misread.

> **§3.51 ✅ DO** remove a visual misreading by not DRAWING the part that causes it. **❌ NEVER**
> reach for depth/blend/offset tricks to hide a real intersection. *(ADR-173)*
> Reason: a plane that genuinely meets a sphere in a circle will read as a slice however it is
> sorted or blended, because the intersection is there. Drawn as an annulus starting at that
> circle, none of the plane is inside the sphere, and the true relationship — the ball resting in
> the hole, touching the rim all the way round — is the only reading available.

> **§3.52 ✅ DO** give two different relationships two different stages, and say what makes them
> different. **❌ NEVER** show two tangencies, two projections or two constructions at once and
> leave the learner to sort out which is which. *(ADR-174)*
> Reason: Conic Sections showed the sphere's contact with the CONE (a circle) in the same stage as
> the plane laid through it, so the circle read as the plane's own contact. Separated — the ring
> with the reason it is a ring, then the single point with "against the flat cut it is different"
> — the contrast becomes the lesson instead of the obstacle.

> **§3.53 ✅ DO** derive a staged sequence's landmarks from the sequence itself. **❌ NEVER**
> hard-code "the last stage is index 5". *(ADR-174)*
> Reason: this topic's proof has been renumbered twice, and both times a literal index silently
> pointed at the wrong stage — once fading the cone out early, once cutting the circle's shorter
> proof off before the stage that explains it.

> **§3.54 ✅ DO** audit a topic against the SYLLABUS document as well as the textbook, and say
> which of the two a given feature serves. **❌ NEVER** assume the textbook chapter and the
> examinable scope are the same thing. *(ADR-175)*
> Reason: course 1003 scopes Conic Sections to three constructions and says "only" twice; the
> chapter works fifteen. Measured against the chapter this topic looked complete while the three
> examinable constructions were the only ones with no teaching apparatus — and the one that HAD
> it was not on the syllabus at all.

> **§3.55 ✅ DO** carry a UI highlight across a repaint by a STABLE key, not by an object
> reference. **❌ NEVER** hand a display-list item back to the UI and expect it to survive.
> *(ADR-175)*
> Reason: `drawCompare()` rebuilds the display list on every paint, so a stored item is stale the
> moment the highlight it triggers repaints — and the guard that keeps the cursor's own hover
> honest then drops it without a word.

> **§3.47 ✅ DO** caption every element the syllabus gives a NAME to, on the figure that draws it.
> **❌ NEVER** leave a named construction element on a sheet as unlabelled linework. *(ADR-169)*
> Reason: both of an ellipse's auxiliary circles were drawn as dashed circles with no caption at
> all — a term the learner can see, cannot name and cannot look up. Assert the full set in the
> LAYOUT, not on the canvas: the placement pass is allowed to drop a caption it cannot fit, and
> an on-canvas check would make that legitimate behaviour look like the defect.

> **§3.48 ✅ DO** draw a property the syllabus states, exactly, so the figure is the proof.
> **❌ NEVER** illustrate a claim with geometry that only approximately satisfies it, and never
> draw a marked point beyond the extent of the curve the figure actually plots. *(ADR-170)*
> Reason: §6.6's parabola properties are exact, so a correct figure demonstrates them in a way
> the textbook page cannot. A first version of property 3 marked a point at t = 2.2 on a curve
> drawn only to t = 1.8 — a claim about a point that was not on the drawing.

> **§3.51 ✅ DO** cut a syllabus scope at the exact thing the syllabus excludes, and prove the cut
> is that wide.
> **❌ NEVER** widen a scope removal into the subject matter that surrounds it. *(ADR-192)*
> Reason: Course 1003 excludes CONSTRUCTING a hyperbola, not the hyperbola. Removing §6.9's three
> methods must leave Step 3's six named cuts, `classifySection()`, the §6.8 terminology sheet and
> the focus-and-directrix sheet completely alone — so the oracle asserts both halves: that no
> hyperbola construction remains anywhere in the catalogue, AND that a hyperbola arriving from
> the cut still classifies and still draws.

> **§3.52 ✅ DO** derive an animation's trigger from the display list it animates.
> **❌ NEVER** key a drawing animation to a stage INDEX when what it depends on is what that stage
> draws. *(ADR-192)*
> Reason: the curve trace fired on the last stage, which is the curve stage for twelve of thirteen
> constructions. The tangent method draws its envelope at stage 6 and marks its focus and
> directrix at 7, so its curve appeared whole and the trace ran a stage later against nothing new.
> Asking the layout which stage first carries an `outline` needs no per-method table to keep in
> step, and one wrong entry in such a table is invisible until someone watches that one method.

> **§3.53 ✅ DO** pace a staged construction by asking what its UNIT OF UNDERSTANDING is and what
> is merely that unit reflected — one press for the first, one press for the whole of the second.
> **❌ NEVER** reach for the finest grain available and call it teaching. *(ADR-193)*
> Reason: giving the oblong method one press per line made seventeen stages, of which eleven said
> nothing the previous one had not. It has TWO symmetries — its fan is upper/lower and its
> connections are left/right — so the rule applies twice, three presses and a mirror each, and
> twelve stages contain no repeat. Where a construction's unit count is on a SLIDER, the stage
> list must be a function of the state rather than a constant, and the stage index must be clamped
> when the list shortens.

> **§3.54 ✅ DO** make a control that changes what is on screen say which way it will go, and give
> it the way back.
> **❌ NEVER** ship a one-way door whose only exit is a different control. *(ADR-193)*
> Reason: "Show its three properties" only ever turned them on. The sheet could be recovered by
> nudging any other control, so the code looked complete and every oracle passed — but a learner
> pressing the same button again saw nothing happen and reported the drawing as broken. A view
> toggle must restore by touching only the field that hid things, and must fire the state-change
> bus, or the panel trails the drawing it describes.

> **§3.55 ✅ DO** give every lesson step its own content in a shared pane, and let a step that
> only DISPLAYS derived state derive it per paint instead of committing it.
> **❌ NEVER** let one step's pane inherit the step before it, and never widen a state coupling to
> reach a step that merely needs to draw. *(ADR-194)*
> Reason: a `stage >= 5` in the sheet's mode meant Step 6 opened on Step 5's finished construction
> — a solved drawing beside a question about the same solid. The obvious repair, widening the
> "sheet follows the cut" coupling to include Step 6, would have written the quiz's cut into the
> sheet state and cost the learner their construction on the way back. Splitting the derivation
> from its commit is what lets both steps be whole.

> **§3.56 ✅ DO** withhold, in an assessment step, exactly the annotation that states the answer.
> **❌ NEVER** re-use a taught step's figure in a step that asks the learner to produce what that
> figure says. *(ADR-194)*
> Reason: three of §6.1's six sheets carry a caption naming the section, which is teaching in
> Steps 1–4 and the answer key in Step 6. Mark those captions and gate them, rather than dropping
> the whole figure or hand-building a second one — the drawing is still the right picture, and
> everything it MEASURES stays.

> **§3.59 ~~✅ DO~~ WITHDRAWN** — allocate space to every pane a step treats as a subject.
> *(ADR-197, superseded by ADR-202 on 2026-08-05.)* The occlusion it describes was real: Steps 4
> and 6 printed "Watch the cone" beside a card covering the apex. But the docked column it
> prescribed gave the same panel two sizes across one lesson, and the product owner chose a
> consistent thumbnail over an unobstructed solid with the trade on the table. The surviving rule
> is **§3.66** below. If the occlusion is addressed again, reframe the camera — do not reinstate a
> per-step sizing mode.

> **§3.66 ✅ DO** give a repeated piece of chrome ONE box, and let only its contents vary by step.
> **❌ NEVER** add a second sizing mode for a panel that already has one. *(ADR-202)*
> Reason: `#compare-card` had exactly one rule sizing it, and one body class overriding that rule on
> two steps — enough to make the same thumbnail 420 × 320 on four steps and 403 × 876 on two, and
> to make three separate bug reports. When a panel looks wrong on some steps, find the override and
> DELETE it; narrowing it, or adding a third selector to defeat it, leaves two sizing systems in the
> file, which is the actual defect. Assert it as an EQUALITY of the full rect against the reference
> step, plus "the body carries no per-step sizing class" — an absence-of-one-class check passes a
> second mode introduced under another name.

> **§3.61 ✅ DO** keep ONE loud action per step, and move the accent when the step's action
> changes rather than lighting both candidates.
> **❌ NEVER** put two controls in the primary treatment on one panel. *(ADR-198, DESIGN.md §5.1)*
> Reason: Step 4 shipped two identical blue "Next" buttons a few hundred pixels apart, one walking
> a stage of the proof and one abandoning it. DESIGN.md already said "the one loud action per
> step", so this was drift against a written rule. Assert it by COUNTING visible, enabled primaries
> on the panel — checking one button's class passes a second primary added somewhere else.

> **§3.62 ✅ DO** retire a transient message when the step that raised it ends.
> **❌ NEVER** rely on a hold timer to keep an instruction from outliving its context. *(ADR-198)*
> Reason: the flow note and the onboarding chip both auto-dismiss after 4.5 seconds, which reads as
> safe until a learner presses Next twice in three. Step 2's note names a control Step 3 does not
> have. A hold is for how long a message is worth reading, not for whether it is still true.

> **§3.65 ✅ DO** put the set of steps a layout mode applies to in the CODE, and let the function
> read it.
> **❌ NEVER** leave "this is for Steps 4 and 6" in a docstring while the condition tests only
> whether the pane is open. *(ADR-201, correcting how ADR-197 was applied)*
> Reason: `syncSheetDock()` said "Step 4 and Step 6" in its own docstring and in its ADR, and then
> docked on every step that had the sheet open — so Steps 1–3 handed half the bench to a
> side-reference the learner had opened themselves, on steps whose subject is the solid alone. A
> rule that lives only in a comment is not a rule. Assert the shared box as an EQUALITY against the
> reference step's thumbnail rect, not as "not docked": the claim is that one box serves every step
> that has one, and a class check would pass a third size introduced somewhere else.

> **§3.63 ✅ DO** give a narrow screen a DIFFERENT layout, not a scaled one — and size a panel
> from what it has to hold, never as a percentage of the screen.
> **❌ NEVER** float one pane over another at a width that cannot hold two. *(ADR-200)*
> Reason: a fixed 42% viewport slice plus a 70%-height floating sheet left a 360 × 640 phone with
> 96,769 px² of overlap and a 99 px scroll port — one line — with the step's only action 130 px
> below its fold. A percentage shrinks with the screen; the copy in the panel does not. Below the
> two-pane threshold the second pane becomes the other VIEW (`body.sheet-solo`), the covered one
> stops painting, and the learner switches between them. Assert it on an emulated device by
> MEASURING the port height, the action's reachability, and how many panes paint — a check for
> "is there a mobile breakpoint?" passed the broken layout.

> **§3.64 ✅ DO** gate touch-target sizing on the POINTER, and let a cramped row wrap rather than
> taking width from the viewport to fit it.
> **❌ NEVER** infer the input method from the screen width, or let a fixed banner cover the sim
> it is advising about. *(ADR-200)*
> Reason: a touch laptop at 1440 px needs the 44 px floor and a phone with a stylus does not lose
> it at 360, so the floor belongs in `@media (pointer: coarse)`. `.card__nav` wanted 261 px in a
> 193 px card and clipped Next off the edge; wrapping costs a row, while raising the wizard's
> clamp would have paid for it out of a 3-D pane already down to 428 px. And the `< 768px`
> "Best experienced on desktop" banner is fixed-position — it must reserve its measured height
> (`body.notice-up` / `--notice-h`) or it paints over the sheet's own Minimize button.

> **§3.60 ✅ DO** re-check caption fit whenever a drawing pane changes proportion.
> **❌ NEVER** assume one margin serves both axes. *(ADR-197)*
> Reason: captions hang sideways further than they hang up and down. A square-ish pane hides that
> because height binds the scale first and leaves width to spare; making the pane tall and narrow
> made width binding and clipped "Axis" at the edge on the first frame. The analytic bbox measures
> LINEWORK, so the caption allowance has to be added per axis, by the code that sizes the pane.
>
> *Extended 2026-08-09:* the two AXES of a caption's placement take two different boxes, and mixing
> them is what puts a heading visibly off its view. ACROSS, centre it on the DRAWING — outline and
> visible edges only. DOWN, clear it against everything the view reaches, dimensions included.
> A layout box that takes in centre lines is right for spacing the views (an overhanging centre line
> needs paper) and wrong for a caption: the Bearing Block's bore centre line reaches 7 mm past the
> lug on the left with nothing to balance it, so an all-primitives midpoint printed "Elevation"
> 3.5 mm left of a view that is symmetrical about its own axis. Never correct this with a manual
> nudge — take the box the label is a label FOR.
>
> And views that stand on the SAME BAND share ONE caption line: the elevation and the side view sit
> side by side across the top of a first-angle sheet, so their names are one row of headings and
> must read as one. Left to their own clearances they drift apart by whatever the two views happen
> to carry — the Cylindrical Block's elevation throws a boss height 37 mm clear of the part while
> its side view carries a single 12 mm lane, which put "Elevation" 45 mm above "Right side view".
> The pair takes the OUTER of the two reaches, so whichever view needs the room sets the row and the
> other rises to meet it. The plan is not in that row; it hangs off its own side, alone.
>
> Measure the reach on the PLACED MARK, never on its offset. `|off|` is only headroom when the
> offset points the way the caption hangs, and a VERTICAL dimension's offset is HORIZONTAL — it
> moves the mark sideways and adds nothing above the view at all. The Cylindrical Block's elevation
> carries a boss height thrown 37 mm clear to the LEFT, charged as headroom, which parked
> "Elevation" 39 mm above a drawing it had to clear by two. Ask the placement function where the
> mark landed; then add the value's own lift and half its height, the clear air, and half the
> caption, since a caption anchored on its centre hangs half of itself back towards the view.

> **§3.57 ✅ DO** open a step-by-step procedure on its GIVEN DATA, and name that opening state per
> procedure rather than assuming it is the first stage.
> **❌ NEVER** show the finished result before the learner has asked for it. *(ADR-195)*
> Reason: Step 5 opened on the completed construction, so pressing "Draw it step by step" looked
> like it started from the middle of a drawing already done. And "given data" is not stage 0: the
> concentric method's two circles are the construction, while the oblong method's rectangle is the
> frame it is handed. Write that judgement down in one table. Key the reset on the REQUEST, not on
> whether the identifier changed — re-picking what is already selected is a learner saying *start
> this one*.

> **§3.58 ✅ DO** give a technical drawing a closed vocabulary of line weights and dash patterns,
> and let annotation prefer clear paper while never being dropped for want of it.
> **❌ NEVER** add a dash pattern or a weight that means nothing the existing ones do not. *(ADR-195)*
> Reason: eight dash patterns had accumulated on one sheet and six of them were arbitrary; BIS
> gives a drawing a chain line and a short dash, and that was all this topic ever needed. Weight
> is the drafting variable for importance — same ink, three strengths — not a second palette.
> Captions should try twice: once wanting to clear the working lines too, then settling for
> clearing only what must never be covered.

> **§3.67 ✅ DO** render a view a topic NAMES as an orthographic view through an orthographic
> camera, reached by the `projectionMorphK` morph (§5.18). **❌ NEVER** present a perspective
> picture under the name of a principal view. *(ADR-205)*
> Reason: perspective draws a boss's top as an ellipse, near edges longer than far ones, and no true
> size anywhere — the definition of what an orthographic view is not. A topic whose step says "this
> is the elevation" and then shows perspective has taught the opposite of its own sentence, in the
> one place a beginner cannot detect it. §5.18's SCOPE note allows a single ORTHOGRAPHIC camera for a
> measured-drawing topic; it never allowed a single perspective one.

> **§3.68 ✅ DO** fit a principal view to the two box half-extents that direction actually projects.
> **❌ NEVER** frame a named view from the bounding SPHERE. *(ADR-205, refining §5.4)*
> Reason: a sphere's radius is the box half-DIAGONAL. An 83 × 44 × 37 part is 51 mm by that measure
> and 22 mm across in its own right side view, so the sphere fit puts the subject of the view in the
> middle of the frame as a speck. A pictorial pose is the one case where the sphere is right, because
> a part turned at an angle really can throw a corner out that far.

> **§3.69 ✅ DO** derive a staged reveal's stage list from the content each stage would draw, and
> keep a drawing's DATUM out of the group that fades. **❌ NEVER** give every view a fixed set of
> stages, and never let a Back replay the animation it is undoing. *(ADR-206, applying §3.52/§3.49)*
> Reason: an object with no circular feature has no centre-line stage, and a fixed four-per-view
> table hands it stages that draw nothing — ADR-193's pacing failure, reintroduced. The XY line is
> where the HP meets the VP and stays on a finished sheet; it was inside the projector group and
> faded out with it, leaving a first-angle drawing with nothing to be first-angle about. A group's
> opacity cannot be undone by a child, so the fix is which group the datum is IN, not a further rule
> on top of it.

> **§3.70 ✅ DO** teach a convention at the level the topic is FOR, and leave the apparatus that
> derives it to the topic that derives it. **❌ NEVER** put HP / VP / XY / quadrant apparatus on a
> beginner's first drawing. *(ADR-208)*
> Reason: Topic 0's job is "here is what a multiview drawing looks like"; the two hinged planes are a
> different lesson, and a learner meeting both at once loses the one they came for. The convention is
> still taught — as the observable consequence (the plan goes below, each side view crosses over)
> rather than as an explanation involving planes they have not met. Keep the datum in the layout
> MATHS either way: a view still has to be placed against something.

> **§3.71 ✅ DO** put a drawing CONVENTION in one function when two renderers draw it, not just its
> constants. **❌ NEVER** let one medium turn its dimension values along their lines while another
> lays the same values flat. *(ADR-209 amended)*
> Reason: aligned dimensioning is not a property of paper — it is how a value is written against the
> line it measures — so a sheet and a solid showing one dimension set have to agree about the turn as
> well as about the number. Sharing `DIM_STYLE` was not enough: both renderers still carried their
> own copy of the same trigonometry, and one copy had a sign error that printed every re-read value
> under its own line. A shared constant makes two renderers agree on a number; only a shared function
> makes them agree on what to do with it. `alignedDim()` in the pure-data leaf is the shape — it
> returns the dimension line's ends, the angle and the value's centre, and each renderer adds its own
> origin and strokes it.

> **§3.72 ✅ DO** hang a label on the MARK it names, at a fixed fraction of that mark's own size.
> **❌ NEVER** settle a collision between two annotation layers by measuring one and pushing the other
> further out — and never by handing one leaf a reference to the other. *(ADR-209, amended twice)*
> Reason: the Front label and the overall length were both parked on the paper under the part, so
> they collided, and the first fix measured the dimension layer's box in the orchestrator and dropped
> the label below it. The collision went away and the label went with it, out into clear paper with
> nothing connecting it to the arrow — reported immediately as the mark "floating away from the
> object". A label placed relative to its own mark cannot contend for a lane, needs no cross-leaf
> measurement, and holds its spacing at every direction and zoom because it is measured in the mark's
> units and not the pane's. Reach for composition when two layers genuinely describe different things
> in the same place; a label that has drifted from its mark is not that case.

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

> **§4.5a ✅ DO** bind any viewport use of the accent to a token ROLE with exactly ONE consumer, and
> name it in an ADR. **❌ NEVER** widen such a role to a second consumer without a new one.
> *(ADR-207, qualifying §4.5)*
> Reason: §4.5 exists so a learner can tell "the UI is guiding me" from "this is the domain content".
> A viewing-direction arrow — the textbook's `F` mark — is guidance that happens to live in the
> viewport, in the same category as the accent `.vp-hint` chips already there, and drawing it in ink
> would make it read as a feature of the part. One named role with one consumer keeps that a decision
> rather than the start of a drift.

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

> **§5.16a ❌ NEVER** demote an expanded Compare split to a floating/compact card — platform-wide,
> Compare has exactly one shape at every viewport width. Below the 768px breakpoint the same docked
> split restacks to a single column (`"view" "compare" "rail"`) instead of switching to a different
> Compare UI. This narrows §5.16's older "never forcing a demotion to the compact card" clause: the
> compact card no longer exists anywhere to demote to. *(ADR-080 — supersedes the compact-card half
> of ADR-012/ADR-021/ADR-037 platform-wide: `graphics_module_1_topic_5_projection_of_line_types`,
> `graphics_module_1_topic_6_projection_of_straight_lines`, `graphics_module_1_topic_3_points`,
> `graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_2_development_of_surfaces`,
> and `Module2` — the platform-wide reference module — are all fixed; `template_starter`'s
> CSS/markup scaffolding was cleaned the same way so new topics stop inheriting the dead chrome.)*
> Reason: a one-way narrow-viewport listener with no widening branch left the compact card
> permanently stuck floating at full window width once the viewport widened back past 768px — a
> picture-in-picture-style panel with its own title bar and expand/close buttons, sitting on top
> of the page instead of docked. Removing the second Compare shape removes the state a resize could
> strand it in.

> **§5.16b ✅ DO** dock ONLY the value drivers of the pane the rail serves — the sibling
> Module-3 topic docks two groups (`['shape', 'section']`), and Conic Sections docks two
> (`['cone', 'section']`). **❌ NEVER** dock a topic's whole control set: `#workbench-rail` is a
> single wrapping row on the split grid's `auto` row, sized by its content against the viewport's
> `minmax(0, 1fr)` row, so every extra group is taken directly out of the 3D pane's height.
> *(ADR-021, ADR-037; regression fixed 2026-07-29)*
> Reason: docking all six step groups in `graphics_module_3_topic_2_2_conic_sections` drove the
> rail to **1340 px**, starving the viewport row to **2 px** — the renderer, the drawing sheet and
> the rail toggle all collapsed with it. A control the split cannot show is reached by leaving the
> split, exactly as the sibling topics do.

> **§5.16c ✅ DO** let a docked split OTHER than Compare set its own pane ratio — Module 2's Show
> Method 3D-pose-visualizer split (`body.method-split`) is 30/70 (3D pane / sheet), not Compare's
> 50/50. **❌ NEVER** let it become a floating/compact card, a second Compare shape, or skip the
> narrow-viewport restack: below 768px it collapses to a single column exactly like
> `body.compare-split` does (3D pane first, the larger-share content below it). *(ADR-163, which
> narrows §5.16a to Compare specifically — see that ADR for why §5.16a itself is not engaged: no
> second Compare shape, no demotion listener, `compare.hide()` is a one-way exclusion between two
> independent docked grids, not a fallback state either can be stranded in.)*
> Reason: the 50/50 balance in §5.16/ADR-037 answers Compare's own job — a 3D↔2D read where neither
> pane should dominate. A different docked split can have a genuinely asymmetric job (here, the
> drawing is the deliverable and the 3D pane is the explanation) without that asymmetry becoming
> the kind of floating/compact fallback state ADR-080 spent an entire fix removing.
>
> **Chrome, regardless of ratio:** a docked split's panes still take the §5.13 card recipe —
> hairline border + `--radius-md` + `overflow: hidden`, **never** a shadow (Flat-Ink, §4.9). If a
> pane reuses an element that ALSO has its own non-docked shape (e.g. `#method-view`, which is a
> `position:fixed` full-viewport overlay outside `body.method-split` and legitimately carries the
> §4.9 transient-overlay shadow there), the docked rule must explicitly reset that shadow — it does
> not fall away on its own just because the element now sits in a grid cell. *(ADR-163 follow-up
> fixes, same day: `body.method-split #method-view` was missing exactly this reset.)*
>
> **If the split EXPOSES a pane that was previously only ever covered** (unlike Compare's own
> `#sim-viewport`, always live behind `.vp-cluster`), audit that pane's existing chrome against the
> new mode rather than assuming it still applies — a control can be dead (does nothing once the
> mode's own state gates the thing it toggles), actively wrong (fights the mode's own
> precondition), or fine as-is. **✅ DO** hide (`display: none`, scoped to the mode's body class)
> whichever controls are dead or wrong; **❌ NEVER** reach for the §5.4 padlock here — that pattern
> is for a control HIERARCHY within one panel (one live control disabling another), not a container
> swap, and a padlock also implies an in-panel path to unlocking that a mode swap doesn't have.
> *(ADR-163 second follow-up: Show Method's pose split hides `.vp-cluster`'s Compare chip —
> force-unflattens, destroying the mode's own precondition — and Connector-lines toggle — inert
> once the mode's own visibility pass has run — but keeps the quick-view chips, which stay a
> legitimate way to inspect the pose.)*
> Reason: a mode that reuses a pane inherits every control already anchored to it, whether or not
> that control's assumptions still hold — the plain full-viewport takeover never surfaced this
> because it fully covers `#sim-viewport` instead of sharing it.

> **§5.17 ❌ NEVER** mirror/duplicate the driver or construction-launcher controls into the rail, or
> give the docked rail a shadow — **re-parent** the existing nodes (one source of truth) and
> separate the rail with a hairline only (Flat-Ink). *(ADR-021, ADR-037)*

> **§5.18 SCOPE (ADR-133):** this rule binds a topic that HAS both cameras. A topic whose subject is
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

> **§5.21 ✅ DO** treat a SCROLL as a zoom and a DRAG as a turn, and detect the drag as pointer
> movement with one pointer down. **❌ NEVER** leave a latched view — or hand an orthographic view back
> to perspective — on `OrbitControls`' `start` event. *(ADR-216)*
> Reason: `OrbitControls` fires `start` for the wheel exactly as it does for a drag, so a listener
> that treats `start` as "the learner is turning the object" fires on every scroll. In a topic whose
> principal views carry their own projection and their own annotation set, that one event changed
> three things at once under a pointer the learner had only rolled — projection back to perspective,
> the view's dimension set swapped for the free-orbit one, and the frame recomputed around the new
> box. It reads as the object jumping out from under the cursor. A pinch is a zoom too, which is why
> the test is one pointer and not merely "a pointer is down".

> **§5.22 ✅ DO** move `controls.target` with the content whenever the framing changes, and flush the
> controls with damping temporarily OFF when a flight lands or a pose is snapped. *(ADR-216)*
> Reason: orbit AND zoom both pivot on the target, so a target left on the previous object's centre
> turns the next scroll into a sideways drag of the part across the pane — the fault is invisible
> until someone zooms. And `controls.update()` with damping on spends whatever inertia the last drag
> left in the controls: a learner who flicks the object and then presses Front gets the flight's exact
> landing pose plus a residue of their own flick, and the view creeps off square in the frames after
> it lands. One update with damping off discards the residue instead of applying it; restore the
> setting immediately so the next real drag still eases.
>
> *Amended 2026-08-09 (ADR-217):* move it, but **❌ NEVER set it in one step.** An instant target
> change is a visible jump in every form. Re-aim alone and the camera swings about a fixed eye;
> translate the eye with it to hold the offset and the whole scene slides across the pane by the
> parallax of the move. Ease the target onto the new centre when the camera is idle, and let a
> flight cancel that ease and carry the target itself when one is starting.

> **§5.23 ✅ DO** measure a transition FRAME BY FRAME when the complaint is that it jumps. **❌ NEVER**
> accept correct end states as evidence that the motion between them was continuous. *(ADR-217)*
> Reason: a flight can begin with a teleport and still land exactly where it should, so every
> assertion about the settled view passes while the defect is plainly visible. Track one DOM node
> that is glued to the model, sample its pane position every animation frame, and compare each frame
> with the LARGER OF ITS TWO NEIGHBOURS rather than with an absolute distance: an eased flight speeds
> up and slows down, so its biggest frame is merely its fastest and its neighbours are nearly as big
> (ratio ≈ 1.3), whereas a teleport is one enormous frame between two still ones (ratio 27 to 245 on
> the defect this rule comes from).

---

## Section 6 — Answer Validation & Problem Library Rules

> **§6.1 ✅ DO** make the self-check ±0.5-tolerant. *(ADR-015)*
> Reason: it accommodates slider granularity without greening a wrong drawing.

> **§6.2 ❌ NEVER** auto-fill answers — loading a problem resets to defaults and routes to the
> dial-able step; the student dials, the check lights green. *(ADR-015)*
> **Amended by ADR-213:** "answer" means a MEASURED quantity — a length, an angle, a ratio.
> A construction the statement NAMES IN WORDS ("using concentric circle method") may be selected
> for the learner, once, on their first arrival at the step that offers it; finding it in a picker
> is transcription, not drawing. Whatever else that commit sets must land AWAY from the target —
> `ellipse-concentric`'s own defaults are 120 × 80, which is one of the practice answers exactly,
> so the sliders go to their floor. Prove it: no problem may be matched by the state it loads into.

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
> **Carve-out (ADR-134):** this rule governs dimensions that are *incidental* to another lesson.
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

> **§6.23 ✅ DO** give any 3D-scene (non-flat) BIS dimension a camera-aware standoff, re-derived
> every render frame as `normalize(rod × viewDirection)` — never a standoff fixed at build time
> from a constant world-up vector. **❌ NEVER** assume a fixed formula chosen for one camera pose
> (e.g. Top) stays correct as the camera orbits or a quick-view/fold engages a different one — it
> is a coincidence of that one pose, not a property of the formula. The flat 2D Compare sheet's
> own dimensions (`compareSheet.js`'s `addViewDim`, under a fixed square-on ortho camera) are
> exempt — they need no camera-tracking and must keep using the plain `addLinearDimension`.
> *(ADR-081)*

> **§6.24 ✅ DO** shape every new topic's `problems.js` / `problemLibrary.js` pair — for a Case A
> (Module 2 family) or Case C (new subject module) topic built from 2026-07-27 onward — to the
> interface contract confirmed identical across all four shipped Family-A pairs (`Module2`,
> `graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_1_sections_of_solids`,
> `graphics_module_3_topic_2_development_of_surfaces`):
> - `problems.js` exports exactly six names: `TIERS`, `ENABLED_TIERS`, `FIELD_LABELS`, `PROBLEMS`,
>   `enabledProblems()`, `groupByTier(list)`. `ENABLED_TIERS` is the single clone-scoping switch
>   (ADR-009, RULES.md §1.6); `enabledProblems()` filters `PROBLEMS` by it.
> - `problemLibrary.js` exports exactly one name: `initProblemLibrary(sim)` — **one positional
>   argument**. It imports only `{ PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier }` from
>   `./problems.js` — never `TIERS`/`ENABLED_TIERS` directly.
> - The `main.js` call site is always `initProblemLibrary(simController)` — one argument.
> - `initProblemLibrary` returns exactly `{ open, exit, isActive, dispose }`, including on its
>   fail-silent early return when the overlay's DOM is missing.
> `template_starter/src/problemLibrary.js` ships a conforming, empty-bodied stub — start there.
> *(ADR-083)*

> **§6.25 ✅ DO**, when a syllabus bans a problem KIND outright (not just a tier), add it the way
> `graphics_module_3_topic_1_sections_of_solids` and `graphics_module_3_topic_2_development_of_surfaces`
> already do: an `EXCLUDED_TYPES` array in `problems.js` + a `type` field per problem (RULES.md
> §6.21–§6.22, ADR-062, ADR-065, ADR-069). §6.24's six-export contract is a floor, not a ceiling —
> `EXCLUDED_TYPES`, and any per-problem field a topic's own self-check needs (`setup`, `path`,
> `type`), are additive, per-topic decisions, never required exports.
> *(ADR-083)*

> **§6.26 ❌ NEVER** read §6.24 as applying to Case B (a new Module 1 lesson). Case B never
> creates its own `problemLibrary.js` — it injects into Module 1's existing shared engine leaf
> (`Module1/src/problemLibrary.js`) the same way it injects into `engine.js` without ever editing
> it (ADR-011), so §6.24 has no new file to apply to there. This rule does **not** require
> Module 1's shared leaf — or its two current consumers, `graphics_module_1_topic_3_points` and
> `graphics_module_1_topic_6_projection_of_straight_lines`, both on the existing 2-argument
> `initProblemLibrary(sim, config)` form — to migrate. That migration, if it ever happens, is a
> separate, not-yet-decided ADR.
> *(ADR-083)*


> **§6.27 ✅ DO** keep the platform's `1 world unit = 10 mm` (§6.8) for anything that enters the 3D
> scene. A topic whose 2D construction NEVER enters the scene **may** store its sheet state in
> millimetres instead (`graphics_module_3_topic_2_2_conic_sections`) — but then **❌ NEVER** convert
> inside the pure engine leaf: convert once, at the control, and state each bag's unit in exactly
> one place. *(ADR-138, ADR-018)*
> Reason: the chapter quotes millimetres, so storing world units would leave the data layer, the
> dock, the self-check targets and the textbook statement disagreeing by a factor of ten; but a
> conversion buried in the engine puts the same factor somewhere no author will look.

> **§6.28 ✅ DO** build a multi-construction drawing engine as ONE pure leaf where each layout
> returns a **display list** of typed primitives plus its own analytic bbox, rendered by a SINGLE
> renderer. **❌ NEVER** give a construction its own drawing path. *(ADR-139, ADR-066)*
> Reason: twelve immediate-mode routines are twelve chances for the thin-construction /
> heavy-answer line vocabulary to drift.

> **§6.29 ✅ DO** prove every construction with a Node oracle before shipping it — each plotted
> point must satisfy its own curve (PF = e·PQ, `x²/a² ± y²/b² = 1`, a zero discriminant for an
> envelope, a constant sum / difference / product). Re-run it after touching a layout. *(ADR-139,
> ADR-019)*
> Reason: a wrong construction still draws a plausible curve — both defects found this way were
> invisible on screen.

> **§6.30 ✅ DO** put a control in the ONE guided step whose question it answers, and hide it
> everywhere else. **❌ NEVER** show a learner the whole parameter set of a topic at once because
> every parameter is real. *(ADR-141, PRODUCT.md §1/§2)*
> Reason: the persona is the struggling first-year. A panel offering eleven construction methods
> before the learner knows why a parabola differs from an ellipse is CAD software with a syllabus
> attached — the failure the Conic Sections redesign was written to undo.

> **§6.31 ✅ DO** report a phenomenon in plain words BEFORE naming it, and keep the textbook
> statement for the step that introduces the name. **❌ NEVER** open with the formal definition.
> *(ADR-141)*
> Reason: "a closed oval that still closes up" is something a learner can check against the screen;
> "a section plane inclined to the axis and cutting all the generators" is something they can only
> take on trust. A data-layer entry that names a phenomenon should therefore carry BOTH forms —
> `ConicSection`'s `seen` / `name` / `rule` triple is the pattern.

> **§6.32 ✅ DO** let a teaching step MOVE the model for the learner (a guided tour that travels the
> cutting plane, a construction that plays stage by stage), and narrate what changed. **❌ NEVER**
> let that shortcut reach an assessed answer — the Problem Library's checked targets stay
> hand-dialled. *(ADR-141, scoping ADR-063)*

> **§6.33 ✅ DO** end a staged construction on the stage that completes its CURVE, and gate every
> optional element on its own control instead. **❌ NEVER** let a stage double as the reveal for a
> toggle. *(ADR-210)*
> Reason: the tangent method's tenth stage also let `showTangent` through, so the tangent and normal
> arrived on the last press of "Next line" as if they were a step of the construction — while the
> two sibling syllabus methods ended on "join the curve". The test is not "is this element
> optional" but "does a control already own it": if one does, no stage may.
> What a construction is ASKED to produce is not optional and does not leave — Example 6.8's focus
> and directrix moved onto the envelope stage rather than off the sheet.

> **§6.35 ✅ DO** choose ⌀ or R from the SWEEP THE VIEW DRAWS, and pass that sweep to the helper
> that writes the label. **❌ NEVER** type the symbol by hand from what the feature is. *(ADR-218)*
> Reason: the rule (BIS SP 46 / ISO 129-1) is about the paper, not the part. A 50 mm boss on a
> 40 mm-deep plate is a cylinder, and the plan can only draw the 148 deg of it that stands proud of
> the plate's edges — so the plan's label is R25, not ⌀50, however cylindrical the thing is. Because
> the wrong symbol is still a perfectly plausible-looking label, this cannot be left to the author's
> memory: the sweep is an argument and the symbol falls out of it.
> BOTH marks END the same way — a slanting leg out to clear paper, a short horizontal shelf, the
> value LEVEL above the shelf — and they differ at the feature end, which is where the difference
> belongs. A DIAMETER's line starts at the far side of the circle, crosses the CENTRE, and carries
> on out to the elbow, with an arrowhead at each end of the diameter pointing outwards. A RADIUS's
> line starts ON THE ARC and never reaches the centre, because a line across the middle would say
> diameter. Both legs run along the feature's own radius, so each of those properties holds by
> construction rather than by the author's arithmetic.
> Nothing the learner READS may sit on the geometry: the line may cross the feature — for a diameter
> it must — but the elbow, the shelf and the value must all be outside the outline. Writing the
> value along the slant instead was tried and is worse: turned text over a hatch of linework, in a
> topic whose subject is reading a drawing.

> **§6.36 ✅ DO** test a label against the view's own primitives. **❌ NEVER** assert it against the
> authored label. *(ADR-218)*
> Reason: `⌀30` where the registry says `⌀30` proves nothing about the drawing. A complete circle is
> the one thing a `circle` primitive draws, so a ⌀ must have one under it at that exact centre and
> radius and an R must not; and an R's arrowhead must sit within a tenth of a millimetre of drawn
> outline or edge linework — which is how the Cylindrical Block's boss was caught pointing its
> leader at 225 deg, into the part of the circle the plan trims away.

> **§6.34 ✅ DO** trace a revealed curve in the direction a hand would draw it, and check the
> direction as a signed sweep about the figure's own centroid. *(ADR-211, ADR-191)*
> Reason: the sheet is y-DOWN, so a sampler that runs y upward traces anticlockwise on screen. Two
> endpoints are not enough to prove a direction; a reversal that fixed only the ends would pass.
> Reverse the ORDER at the layout that owns the figure, never inside a shared point sampler.
> Renaming the endpoints is not a substitute for reversing the trace — but once the trace is right,
> NAME the ends to agree with it: ADR-215 swapped the tangent method's A and B as coordinates so the
> curve that is drawn foot-to-head is also described A → B. Swap the points, never the captions; the
> tangents, divisions and chords are derived from the points, and a caption-only swap leaves "the
> tangent at A" struck from the other end of the base. *(ADR-215)*

> **§6.35 ✅ DO** filter a problem library on the axis the SYLLABUS cuts on, and add that axis if
> none of the existing ones fits. **❌ NEVER** delete the excluded problems. *(ADR-212, ADR-192)*
> Reason: Course 1003 names three CONSTRUCTIONS. The tier axis cuts by curve and the type axis cuts
> by problem kind, and neither can express "these three methods only" — so `ENABLED_METHODS` is a
> third one-line lever beside them. A filter is reversible for the next course; a deletion is not,
> and the exercise list is the chapter.

> **§6.36 ✅ DO** pin a staged construction's FRAME to its finished figure whenever a late stage
> reaches further than an early one. **❌ NEVER** let a drawing's scale be measured from the stage
> that happens to be on screen. *(ADR-214, ADR-053)*
> Reason: the sheet locks its millimetre scale to the layout's analytic bbox, so a stage that adds a
> longer line rescales EVERYTHING drawn before it, in one frame. The tangent method's directrix runs
> to ±0.6·AB where its base stops at ±0.5, and in a 1124 × 565 pane the double ordinate — 120 mm at
> every stage — went 225 px through stages 1–8 and 189 px at stage 9, the whole drawing shrinking
> 16 % and sliding 54 px left as the freehand curve began. In a taller pane width binds and nothing
> moves, which is why it reads as intermittent. Reported as a rendering-pipeline fault; it was
> arithmetic. **A visible jump between stages is a SCALE question FIRST** — measure a known length in
> pixels before looking for a rebuild, because on a display-list sheet there is no rebuild to find.
> Pin to what the construction FINISHES as, not to a union of every control's extremes: reserving
> the tangent at both ends of the tangent method's curve held the frame perfectly still and took the
> drawing to 1.1 px/mm, under the 1.3 gate that drops every caption.

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
- ❌ Add `postMessage`/`window.parent`/`window.top` beyond the two sanctioned outbound signals
  (`sim:ready` boot, `sim:complete` lesson-finish), a second reset path, or any non-CDN network
  call. *(§2.9, §2.10, §2.12, ADR-078, ADR-086)*
- ❌ Install puppeteer/playwright, or verify against a hand-typed replica instead of the shipped module. *(§2.17, §2.19)*
- ❌ Ship a geometry/angle/position/derived-value fix verified only by "it looks right on screen" — prove the math first. *(§2.19a)*
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
- ❌ Anchor a 3-D label at a fixed world point, leave it without a leader, or keep it on screen after its geometry has gone. *(§3.36, §3.37)*
- ❌ Leave a solid's axis invisible inside it, or paint sheet captions where they were authored without a collision pass. *(§3.38, §3.39)*
- ❌ Outline or centre-line a solid from its pre-cut geometry, or truncate a double cone without checking what is left at the slider extremes. *(§3.40, §3.41)*
- ❌ Drive a topic's 3-D pane and its 2-D sheet from controls that can disagree. *(§3.42)*
- ❌ Use a construction element the chapter defined in a section the topic skipped, or split one explanation across two reveal controls. *(§3.43, §3.44)*
- ❌ Clamp a derived quantity into a model's drawable range and ship the drawing, or leave a degenerate case showing the previous frame's answer. *(§3.45)*
- ❌ Draw the answer to a "measure it" exercise without reporting the number. *(§3.46)*
- ❌ Put an explanation on a timer, or change geometry to match what a picture was expected to look like. *(§3.49, §3.50)*
- ❌ Widen a syllabus scope cut into the surrounding subject, or key a drawing animation to a stage index rather than to what that stage draws. *(§3.51, §3.52)*
- ❌ Pace a construction at the finest grain available instead of at its unit of understanding, or ship a control that turns something on with no way to turn it off. *(§3.53, §3.54)*
- ❌ Let a shared pane inherit the previous step's content, or show an assessment step the caption that names its own answer. *(§3.55, §3.56)*
- ❌ Assume one margin serves both axes after a drawing pane changes proportion. *(§3.60; §3.59 withdrawn by ADR-202)*
- ❌ Add a second sizing mode for a panel that already has one, or narrow an override instead of deleting it. *(§3.66)*
- ❌ Ship two primary buttons on one panel, or let a transient message outlive the step that raised it. *(§3.61, §3.62)*
- ❌ Float one pane over another at a width that cannot hold two, or size a panel as a percentage of the screen. *(§3.63)*
- ❌ Infer the input method from screen width, or let the mobile banner paint over the sim. *(§3.64)*
- ❌ Leave the steps a layout mode applies to in a docstring instead of in the condition. *(§3.65)*
- ❌ Open a step-by-step procedure on its finished result, or add a line weight or dash pattern that means nothing the existing ones do not. *(§3.57, §3.58)*
- ❌ Hide a real intersection with render-state tricks instead of not drawing the offending part. *(§3.51)*
- ❌ Conflate two distinct relationships in one stage, or hard-code a stage index that a renumber will break. *(§3.52, §3.53)*
- ❌ Treat the textbook chapter as the syllabus, or key a highlight on an object that a repaint recreates. *(§3.54, §3.55)*
- ❌ Pass device-px scissor/viewport regions straight to `setViewport`/`setScissor` — convert to logical px first. *(§3.33, §3.33a)*
- ❌ Show a perspective picture under the name of a principal view, or frame a named view from the bounding sphere. *(§3.67, §3.68)*
- ❌ Give every view a fixed set of reveal stages, or leave a drawing's datum inside the group that fades. *(§3.69)*
- ❌ Put HP / VP / XY / quadrant apparatus on a beginner's first drawing, or use the accent in a viewport without a one-consumer token role and an ADR. *(§3.70, §4.5a)*
- ❌ Share a drawing convention's constants between two renderers and leave each of them its own copy of the maths, or push a label out of another layer's way instead of hanging it on the mark it names. *(§3.71, §3.72)*

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
- ❌ Demote an expanded Compare split to a floating/compact card on resize. *(§5.16a)*
- ❌ Force a non-Compare docked split (e.g. Show Method's 3D-pose-visualizer split) to Compare's own 50/50 ratio, or let it skip the narrow-viewport restack. *(§5.16c)*
- ❌ Put a CSS `transform` on `#sim-viewport`/`#canvas-area`/`body`. *(§5.13)*
- ❌ Dock a topic's whole control set into `#workbench-rail` — it is sized against the viewport's row, so extra groups eat the 3D pane. *(§5.16b)*
- ❌ Mirror the workbench rail controls instead of re-parenting, or give the docked rail a shadow. *(§5.17)*
- ❌ Hard-swap perspective↔orthographic cameras in one frame instead of the `projectionMorphK` morph. *(§5.18)*

**Problems / units**
- ❌ Auto-fill an answer, or put answer logic in UI handlers. *(§6.2, §6.3)*
- ❌ Add `θ=±θ` or endpoint A/B OR-targets for lines. *(§6.5)*
- ❌ Globally rescale world units or "fix" `pointData.js` comments to mm. *(§6.9, §6.10)*
- ❌ Revert the Lines sim to six fixed cases, or rename "line AB"/"end A"/"Point P". *(§6.13, §6.15)*
- ❌ "Fix" 2D projectors to dashed, dots to crosses, or 3D projectors to solid. *(§6.18)*

- ❌ Show every parameter of a topic at once, or name a phenomenon before the learner has seen it. *(§6.30, §6.31)*
- ❌ Convert units inside a pure engine leaf, or leave a state bag's unit unstated. *(§6.27)*
- ❌ Give one construction its own drawing path, or ship a construction no oracle has proved. *(§6.28, §6.29)*
- ❌ Let a construction stage double as the reveal for a toggle, or trace a curve backwards. *(§6.33, §6.34)*
- ❌ Type ⌀ or R by hand, or check a label against the registry instead of against the linework. *(§6.35, §6.36)*
- ❌ Delete problems to narrow a library's scope, when a filter axis would say the same thing. *(§6.35)*
- ❌ Measure a staged drawing's frame from the stage on screen, when a later stage reaches further. *(§6.36)*

**Cross-module / docs**
- ❌ Fix a shared file directly in a topic folder, or infer the master from a `topic_N` number. *(§1.3, §1.7)*
- ❌ Ship an `index.html` `<title>` that disagrees with `meta.json.title`. *(§1.12)*
- ❌ Use a capitalised difficulty value in meta.json ("Intermediate" not "intermediate"). *(§2.11a)*
- ❌ Copy `iShape.js` verbatim as if it were byte-identical — it is an adapt file. *(§1.13)*
- ❌ Reintroduce a per-topic `DESIGN.md`/`PRODUCT.md` instead of consuming the root copies. *(§1.14)*
- ❌ Conflate Module 1's stub `uiManager.js` with Module 2's controller. *(§7.6)*
- ❌ Silently reverse a documented decision, or restore an ADR-superseded design. *(§8.4, §8.6)*

---

*Assembled from ARCHITECTURE.md, DECISIONS.md (ADR-001…028), the root `DESIGN.md`, and both modules'
`CLAUDE.md`. Every rule is traceable to one of those. RULES.md is the checklist; DECISIONS.md is the
reasoning; ARCHITECTURE.md is the map. Add new rules per the Preamble — always cite the source ADR.*
