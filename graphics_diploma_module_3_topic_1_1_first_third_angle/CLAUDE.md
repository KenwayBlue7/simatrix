# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 3 Topic 1.1: First and Third Angle Projection

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-095]**. This is that track's **Module 3**
> ("Projection Systems"), Topic 1 — the first topic in a new module, not a new subtopic of Module 1
> ("Geometrical Constructions") or Module 1 Topic 2 ("Misc Curves"). See `../DECISIONS.md` ADR-149
> for why this needed a new module (ADR-095 left module numbering beyond Module 1 open pending a
> future ADR — this is that ADR) and why Module 2 was skipped (reserved, not yet built).
> Namespaced `graphics_diploma_module_3_topic_1_1_first_third_angle` per ADR-095's
> `module_<M>_topic_<K>_<N>_<slug>` convention (M=3, K=1, N=1 — the first of possibly several
> subtopics under this Topic 1, mirroring how Module 1 Topic 2 grew to three subtopics).

Compares first-angle and third-angle orthographic projection on ONE solid: a shared glass-box
setup (HP/VP/PP), a 90° rabatment fold reused identically for both systems, the resulting view
layout (top/side view position flips between the two), and the BIS title-block symbol for each.
Self-contained — this track has no prior "Spatial Framework"-equivalent topic to link back to.

## Project-wide documentation (read before cross-module tasks)

Per **ADR-095**, this syllabus track **shares this repo's root docs and ADR sequence** (invoked,
not superseded, per ADR-149's own consequence). Before starting any task that touches shared
behavior, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — ADR log; this topic's own decisions recorded under ADR-149
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1).

**Scope boundary:** this module produces a self-contained simulation payload — the 3D viewport
plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## Architecture — Three.js orchestrator (ADR-149, a genuine exception to ADR-095's 2D default)

ADR-095 chose a 2D SVG/Canvas orchestrator for Diploma Module 1 because "none of these subtopics
involve 3D solid geometry." This topic is the opposite case — first vs. third angle IS a 3D
projection-system comparison, so it needed a real Three.js scene. Per MODULE-STARTER.md's Case A/B
table, that makes it structurally a Case-A build regardless of which curriculum track it belongs
to: cut from `template_starter/` (the platform's Three.js boilerplate), NOT a duplicate of any
Diploma Module 1 topic's 2D SVG skeleton.

**Technical patterns reused from two siblings** (read as technical reference only — neither is
curriculum lineage for this track):
- `../graphics_module_1_topic_2_spatial_framework` — the pivot-hinged rabatment fold
  (`src/planes.js` generalizes `hvPlanes.js`'s core+extension single-pivot pattern to a THIRD
  plane, PP), the CSS2D label layer pattern (`src/labelLayer.js`), and the BIS symbol badge
  (a plain fixed-position DOM overlay, not a scene-anchored CSS2DObject — confirmed by reading that
  topic's own `index.html`).
- `../graphics_module_1_topic_3_points` — the generic, data-driven Problem Library controller
  contract (`src/problemLibrary.js`, ADR-083) and its `problems.js` shape.

**The one genuinely new mechanism** (verified numerically before writing any Three.js code — see
the reasoning trail in this session's build): a SINGLE constant fold rotation on each plane (HP:
+90° about the X axis; PP: −90° about its own offset vertical hinge) reproduces BOTH systems'
correct flattened layout, with no per-system fold-direction branch. What actually differs between
first- and third-angle is:
1. **The object's quadrant** (`systemData.systemSign()`): +1 places it in Quadrant I (first-angle),
   −1 in Quadrant III (third-angle) — the exact point-reflection precedent `frustums.js`'s Q1/Q3
   bodies already established in the sibling topic above.
2. **PP's own hinge offset side** (`solidViews.ppOffsetFor()`): +D (right of the object) for
   first-angle, −D (left) for third-angle.
Both HP's core+extension halves and PP's core+extension halves are ALWAYS built (mirroring
`hvPlanes.js`'s "four rooms" discipline) — the object's quadrant determines which half holds the
live content, so one fold operation serves both systems automatically.

**The solid**: a single fixed rectangular block (`systemData.SOLID`), not a parametric shape family.
Its three views are three visibly-different rectangles (front L×H, top L×W, side W×H) — sufficient
to teach VIEW POSITION, which is what first-vs-third-angle actually changes. A box has no asymmetry
that would make any one view's *shape* differ between the two systems, only where each view lands
on the sheet — so no edge-detection/silhouette machinery (`meshAnalyzer.js` etc.) was needed.

**Files removed from the `template_starter/` copy** (both entirely inapplicable to this topic, not
trimmed-and-kept): `src/uiManager.js` (the copied file was, despite MODULE-STARTER's own claim,
NOT an emptied stub — it was leftover Module-2-specific cube/pyramid/cone slider code; this topic
has no continuous numeric parameters, only a two-state toggle wired directly in `src/stepper.js`)
and `src/onboarding.js` (empty-state / first-solid hints — this topic's solid is always present
from Step 2 onward, driven by the step sequence, not an "add a shape" affordance). The Reset
two-state confirm (RULES.md §2.9/§4.19) that would normally live in `uiManager.js` was ported
inline into `main.js` instead, since there was no other dock content left to justify a whole leaf
module for it.

## The seven-step sequence (`src/systemSteps.js`)

1. **Reference Planes** — HP+VP+PP glass-box corner, no solid.
2. **First-Angle Setup** — solid in Q1, projectors to all three planes, EYE→OBJECT→PLANE per view.
3. **First-Angle Fold** — the shared fold action; result: top view below, side view right.
4. **Third-Angle Setup** — same solid in Q3, EYE→PLANE→OBJECT per view.
5. **Third-Angle Fold** — same fold action; result: top view above, side view left (mirrored).
6. **Compare** — the learner's own First-angle/Third-angle toggle, live.
7. **Verify** — Problem Library self-check: a pictorial + arrow-F statement, target `{ system }`,
   checked by plain equality (no numeric tolerance needed — a two-value categorical field).

Out of scope (explicitly, per the original build spec): the full six-view glass box, and
surface-type behavior (parallel/inclined/oblique) — future subtopics under this same Topic 1 if
built (`_1_2`, `_1_3`, mirroring Module 1 Topic 2's growth to three subtopics).

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11).
- **`window.simAPI`** (`main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset routes
  through it only, guarded by the two-state confirm.
- **`sim:ready`/`sim:complete`** — the current platform contract (PLATFORM-RULES.md §1.10, ADR-078
  post-renumbering): `sim:ready` fires once from `markBooted()`; `sim:complete` is **latchless** —
  every "Finish lesson" click reposts, no per-page-load ceiling (MODULE-STARTER.md §3.11's current
  guidance — supersedes the one-shot-latch pattern this session used earlier on the Diploma Module 1
  topics, which predates the platform's move to a latchless contract).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_3_topic_1_1_first_third_angle/
├── index.html              ← Three.js viewport + wizard shell, platform CSS tokens inline,
│                              pinned three@0.160.0 import map, Supabase-CDN @font-face (ADR-086)
├── meta.json
├── CLAUDE.md                ← this file
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — RULES §7.1)
    ├── systemData.js               ← pure data: ProjectionSystem enum, systemSign(), the one
    │                                  fixed solid's dims, PP's hinge offset constant
    ├── planes.js                    ← HP/VP/PP builder: hinged core+extension sheets (HP, PP)
    │                                  + the stationary VP sheet
    ├── solidViews.js                  ← the box + its three view rectangles + 12 dashed
    │                                    projector lines
    ├── labelLayer.js                    ← CSS2D HP/VP/PP plane-name tags
    ├── systemSteps.js                     ← the 7-step sequence + TERMS glossary
    ├── stepper.js                           ← guided-step controller: rail/card render, the
    │                                          fold action, the system toggle, Finish-button
    ├── terms.js                               ← inline glossary popovers (singleton #term-pop)
    ├── problems.js                              ← Problem Library data (one categorical field)
    └── problemLibrary.js                          ← Problem Library modal + self-check
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a scene change; controls never touch Three.js objects
  directly (RULES §3.2). Full disposal contract every rebuild (ADR-004) — verify
  `renderer.info.memory` stays flat across 50 rebuilds.
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- Problem Library: tiered, hints revealed one at a time, tolerant/exact self-check that never
  auto-fills (ADR-015, RULES §6.1–§6.3, §6.24–§6.26).
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 3 Topic 1.1 — First and Third Angle
Projection · Three.js orchestrator (ADR-149, a Case-A exception to ADR-095's 2D default) · no
build tools.*
