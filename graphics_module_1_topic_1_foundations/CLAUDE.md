# CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT)

> **STATUS: BUILT (2026-06-29).** The sim is implemented and self-starting. This file began
> life as the *master refactoring plan* for moving Module 1's "Foundations" content out of the
> shared-`engine.js` thin-page structure (ADR-011) onto **Module 2's orchestrator + leaf-module
> pattern** (ADR-007); that refactor is now complete and recorded in **ADR-029** (which
> supersedes ADR-011 for this topic only). The decisions below still describe *why* the sim is
> shaped as it is; the `src/` paths now all exist. Shipped files: `index.html`, `meta.json`,
> `DESIGN.md`, `src/main.js` (orchestrator), `src/bearingBlock.js`, `src/meshAnalyzer.js` (copied
> verbatim from Module 2), `src/lineDrawer.js`, `src/annotations.js`, `src/labelLayer.js`,
> `src/stepper.js`.

## Refactor intent (what this overturns)

- **Overturns ADR-011 for this topic.** ADR-011 said Module 1 "draws points and lines, not
  solids, so it needs no shape generators or edge analyzer." This topic changes that premise:
  the Foundations lesson now teaches **BIS line types on a real 3D machine part** (a Bearing
  Block), so it needs exactly the solid-handling machinery Module 2 already has.
- **Adopts the Module 2 orchestrator pattern:** a thin `main.js` orchestrator that owns the
  single `rebuild()` pipeline, with pure leaf modules around it (geometry generator,
  `meshAnalyzer.js`, the projection/line-drawing layer, the label layer). No shared
  `engine.js`/`initSim()` frame for this topic.
- **Sibling for cross-reference:** `../graphics_module_2_topic_2_simple_positions` (the
  closest working example of `meshAnalyzer` + the dynamic line-drawing layer in production).

---

## The 3D subject — Bearing Block (split plummer / pillow block)

Reference: `../Screenshot Reference for module 1 introductions/Bearing_Block.png` (a standard
split pedestal-bearing housing drawing — multiple orthographic + sectional views).

We model a **simplified teaching version** of the housing, not the full bearing assembly. The
shaft, rolling elements, seals, and the "Free side / Fixed side" arrangement are **out of
scope** — those exist only to clutter the line-type lesson. What we keep is the **housing
shell**: a rectangular base/foot, two mounting holes in the feet, a central cylindrical boss
carrying a horizontal through-bore, and a bolted cap split at the bore axis.

This part is chosen because it yields a clean, simultaneous mix of **all four target BIS line
types** in a single view, and because orbiting it makes visible edges become hidden edges —
the whole point of keeping the dynamic classifier (below).

---

## Decision 1 — Canonical "Front Face"

**Front View = looking ALONG the bore (shaft) axis** — the classic plummer-block *end
elevation*, where the central bore reads as a full **circle**.

Why this face (it best serves "clearly show the central bore AND the mounting holes"):
- The **bore mouth is an unmistakable visible circle** (Type A) dead-centre — the strongest
  single feature for anchoring the lesson.
- The **mounting holes** (drilled vertically through the feet) and the **rear bore rim** and
  the **cap-bolt holes** all sit *behind* the front face, so they read as **hidden lines**
  (Type E/F). The contrast "bore = visible circle, fixings = hidden dashes" is the cleanest
  possible teaching case for Type A vs Type E/F.
- The face is **bilaterally symmetric**, so the vertical line of symmetry and the horizontal
  bore axis give two clean **center lines** (Type G).
- **Orbit demonstration:** rotate ~90° about the vertical and the bore stops being a visible
  circle and becomes a pair of hidden horizontal lines through the boss, while the mounting
  holes open up as visible features on top of the feet. This visible↔hidden swap is exactly
  what Decision 3 keeps the machinery for.

The orientation convention to confirm with the author is in the Open Questions.

---

## Decision 2 — Fully orbitable in 3D, every step (no 2D camera lock)

- The Bearing Block stays in a **live, orbitable perspective 3D scene across all steps.** We do
  **not** lock the camera to a flat, head-on 2D elevation at any step.
- The "Front View" above is a **named camera pose / quick-view**, not a camera prison. Students
  start near it, but `OrbitControls` is always live so they can rotate the part and watch the
  line classification change.
- The pedagogy is explicitly *"orbit the part to see how visible lines become hidden lines from
  different angles."* A static 2D drawing cannot show that, so a flat lock is forbidden here.
- (Any 2D orthographic drawing we choose to show later would be an *additional* on-demand panel,
  never a replacement for the orbitable main view. Not in scope for this plan step.)

---

## Decision 3 — RETAIN `meshAnalyzer.js` + the dynamic projection/line-drawing machinery

**This is the headline decision of this update.** Because the part is orbitable (Decision 2),
edge visibility is **camera-dependent** and must be recomputed as the student orbits — so we
**keep** Module 2's solid-analysis stack rather than dropping it (as ADR-011 assumed Module 1
could).

What we carry over from `../graphics_module_2_topic_2_simple_positions/src/`:

- **`meshAnalyzer.js` — KEPT.** `buildEdgeMap(geometry, matrixWorld)` does **position-based
  edge welding** (1e-3 lattice) and returns the welded **edge → incident-faces** map. This is
  the *topology* layer:
  - **boundary edges** (1 incident face) → silhouette/outline candidates,
  - **internal edges** (2 incident faces) → drawn only when one face is front-facing and the
    other back-facing.
  This is **camera-invariant**, so it runs **once per `rebuild()`** (geometry/transform
  change), exactly as in Module 2. Welding is what stops the boss/cap-rim and base/foot seams
  from drawing doubled lines.
- **The dynamic line-classification (visible vs hidden) — KEPT and re-run on orbit.** The
  **camera-dependent** pass that decides, per edge, *visible (Type A) vs hidden (Type E/F)*
  must re-run **on every orbit**, throttled to `requestAnimationFrame` (never to `mousemove`),
  per the Module 2 gotcha "Edge classification is camera-dependent." This is the live machinery
  that makes a bore rim flip from solid to dashed as it rotates to the far side.
- **The line-drawing layer (`projectionDrawer.js` lineage) — KEPT, adapted.** It consumes the
  edge map and emits fattened `LineSegments2` strokes with per-edge style. **Adaptation note:**
  Module 2's hidden-line test is the *convex* face-normal shortcut (`normal.y>0` / `normal.x>0`).
  The Bearing Block is **non-convex** (it has a bore and holes), so that shortcut is
  insufficient for the orbitable pictorial — we need a genuine **per-edge occlusion / depth
  test against the live camera** (e.g. sampled raycast or depth compare), still re-run per rAF
  on orbit. This is the main net-new engineering vs. a verbatim Module 2 port. (See Open
  Questions for the exact method to lock.)
- **Hard-edge, non-indexed geometry + `polygonOffset` + `LineMaterial.resolution` upkeep —
  KEPT.** All the Module 2 line-rendering non-negotiables apply unchanged.

Net effect on ADR-011: the "Module 1 needs no edge analyzer" rationale **no longer holds for
this topic.** A superseding ADR should be logged in `../DECISIONS.md` when build starts.

> **⚠️ DO NOT DROP THE RAYCASTER (Phase 3 reversal, 2026-06-30).** A Phase 3 refactor tried to
> delete the per-edge occlusion raycaster + `three-mesh-bvh` and hide rear edges with the GPU
> depth buffer alone (every edge solid; "X-ray" = hide the faces). It **broke the lesson** — with
> no raycaster there is no *visible-vs-hidden* decision, so there are no **dashed Type E/F lines**,
> and the topic's entire reason to exist (teaching solid Type A vs dashed Type E/F) is gone. It was
> reverted. The CPU line-of-sight raycaster + the dual solid/dashed batch are **REQUIRED**, not an
> optimisation. The **X-ray (Step 2)** now coexists with it correctly: it hides the block's
> *material* (`material.visible=false`) only — the mesh stays in the scene, so the raycaster keeps
> classifying against the geometry and the rear edges stay **dashed**. Result: a true engineering
> wireframe of **solid front edges + dashed rear edges**. See `../DECISIONS.md` ADR-029 (Phase 3
> reversal addendum) + ADR-030.

---

## Decision 4 — BIS line-type mapping for the Front Face

The four target line types map onto the chosen front face as follows. Type A and Type E/F are
**produced dynamically** by the retained classifier (they swap as the student orbits); Type G
and Type B are **authored annotations** that ride along with the model and re-project each frame.

| BIS type | Line style | Source | On the Bearing Block (front-along-axis) |
|---|---|---|---|
| **Type A** — continuous **wide** | solid, thick | dynamic — `meshAnalyzer` boundary/silhouette + front-facing internal edges classified **visible** | outer housing silhouette (base → boss → cap), the **near bore-rim circle**, visible cap/base parting-line ends, near spotface rims |
| **Type E/F** — **dashed** | dashed (narrow) | dynamic — edges classified **hidden** by the camera-dependent occlusion pass | **rear bore rim**, the two **vertical mounting through-holes** in the feet, the **cap-bolt holes**, any internal step behind the front face |
| **Type G** — chain thin (long-dash · short-dash) | chain | authored center-line annotations attached to features | the **horizontal bore axis**, the **vertical line of symmetry**, and center lines through each mounting hole and each cap bolt |
| **Type B** — continuous **narrow** | solid, thin | authored annotation layer | dimension lines + arrowheads, extension/projection lines, leader lines, section hatching (if a half-section is shown), short center crosses for small holes |

(SP 46:2003 / BIS, first-angle. Hidden detail uses dashed narrow per current Module 1 practice;
the exact Type E vs Type F weight is a token choice carried from `../DESIGN.md`.)

---

## Target file structure (Module 2 orchestrator shape — TO BUILD)

```
graphics_module_1_topic_1_foundations/
├── index.html            ← thin shell (importmap + canvas + dock); self-starting
├── meta.json             ← platform metadata (title, description, difficulty, tags)
├── CLAUDE.md             ← THIS plan
├── DESIGN.md             ← topic design tokens/spec (to add; inherits ../DESIGN.md)
├── assets/fonts/         ← bundled woff2 (as Module 2)
└── src/
    ├── main.js           ← orchestrator: scene, OrbitControls, single rebuild(), rAF loop,
    │                       window.simAPI, the on-orbit (rAF-throttled) visible/hidden re-classify
    ├── bearingBlock.js   ← geometry generator (hard-edge, non-indexed) for the housing model
    ├── meshAnalyzer.js   ← KEPT verbatim from Module 2: buildEdgeMap (camera-invariant weld)
    ├── lineDrawer.js     ← adapted projectionDrawer: edge map → Type A/E-F LineSegments2,
    │                       with a true per-edge occlusion test (non-convex), re-run on orbit
    ├── annotations.js    ← authored Type G center lines + Type B dimensions/leaders
    ├── labelLayer.js     ← CSS2D labels (vertexLabeler lineage)
    └── stepper.js        ← guided-stepper controller (line-type reveal sequence; matches Module 2's name)
```

`meshAnalyzer.js` is copied, **not** re-implemented — it is already a faithful, handedness-safe,
allocation-light port and is the literal subject of "keep it."

---

## Non-negotiables inherited from Module 2 (apply unchanged)

- No build step; CDN ES modules pinned to **three@0.160.0** via the exact import map; `.js`
  extensions on every import; all paths relative.
- `meta.json` with all four fields; `window.simAPI` (`pause`/`resume`/`reset`); mobile notice
  `< 768px`; self-starting on load.
- **`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
  `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
  sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.
- Single `rebuild()` is the only path for geometry change; full disposal contract every rebuild
  (verify `renderer.info.memory` stays flat across 50 rebuilds).
- Engineering-textbook visual style: flat light, no cast shadows, `MeshPhongMaterial`
  `shininess:0`, `polygonOffset:true`; **read all colours from CSS tokens — never hard-code hex.**
- `LineMaterial` + `LineSegments2` for every stroke; keep `resolution` in sync on resize.

---

## Open questions (geometry to verify before build) — see chat

The author-facing questions extracted from the image are listed in the accompanying chat
message. Pending answers gate the geometry generator (`bearingBlock.js`) and the occlusion
method in `lineDrawer.js`.

---

*Module 1 Topic 1 — Engineering Graphics Foundations · BIS line types taught on an orbitable
3D Bearing Block · Module-2 orchestrator pattern (overturns ADR-011 for this topic) ·
`meshAnalyzer.js` retained for dynamic, camera-dependent visible/hidden line classification ·
First Angle Projection · SP 46:2003 (BIS) · Three.js 0.160.0 · no build tools.*


## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)