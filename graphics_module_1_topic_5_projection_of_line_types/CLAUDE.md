# CLAUDE.md — Simatrix · Projection of Straight Lines — Types of Lines

A **conceptual** Three.js teaching simulation: a six-step guided tour of the standard positions a
straight line can occupy relative to the Horizontal (HP) and Vertical (VP) planes. **One standard
position per step** — parallel to both · perpendicular to HP · perpendicular to VP · inclined to
HP · inclined to VP · inclined to both — each an independent mini-lesson that shows the line
already correctly positioned, generates its projections live, and explains *why* the views read as
they do. Step 6 closes on the **Rotation Method** for recovering the true length of a line inclined
to both planes. Ships as a self-contained payload that runs inside a sandboxed `iframe`.

> **This is NOT a problem library and NOT an examination solver.** It teaches the six standard
> line positions *before* a student attempts textbook problems. There is no answer validation, no
> practice-problem selector, and no traces construction — the sibling `graphics_module_1_topic_6_projection_of_straight_lines`
> topic owns all of that.

This topic was cut **copy-and-simplify (ADR-009)** from `graphics_module_1_topic_6_projection_of_straight_lines`, reusing
its proven machinery verbatim (the reversible fold + ADR-036 orthographic swoop, the second-pass
Compare sheet, BIS Type-B dimensioning, the CSS2D label system, the rotating-line construction) and
replacing only the pedagogy: the data layer, the stepper, the parameter dock, and the HTML shell.
The **source Lines topic was not modified.** Folder slug carries index **5**, the next free Module-1
catalog number after `graphics_module_1_topic_4_orthographic_projection`.

## Project-wide documentation (read before cross-module tasks)
- ../ARCHITECTURE.md — system map, component breakdown, data flow
- ../DECISIONS.md    — why key decisions were made (ADR log)
- ../RULES.md        — what you must and must not do (enforcement)
- ../DESIGN.md       — color tokens, typography, component standards
- ../PRODUCT.md      — who it's for, features, accessibility commitments

**Design system rules:** read and strictly follow `../DESIGN.md` for all colour, typography,
spacing, component styling, and UI/UX. Never hard-code design values — consume the tokens. This
topic does **not** carry a local `DESIGN.md`/`PRODUCT.md` copy (ADR-028, RULES.md §1.14). The three
construction-aid tokens (`--construct`, `--locus`, `--tl-green` + their `*-ink` text variants) are
declared in this topic's own `index.html` `:root` (viewport encodings unique to this topic, used by
the Rotation Method construction — carried over from the Lines topic).

**Scope boundary:** self-contained Three.js *simulation payload* only. The host Simatrix website
(navbar, module browser, account UI) is out of scope.

---

## Architecture — Module 2 orchestrator pattern (ADR-033)

- **`main.js` is the orchestrator** (ADR-007): it owns the scene, the 3D WebGLRenderer (the 2D
  Compare sheet owns a second, own-canvas renderer — ADR-076), the perspective + orthographic
  cameras + their `OrbitControls` (the dual-camera §5.18 stack — quick-views + the ADR-036 fold
  swoop), the single `rebuild()` pipeline (full WebGL disposal contract, ADR-004), the render loop,
  the two CSS2D overlays, the Compare state machine + the ADR-021/ADR-037 workbench split, the
  Rotation Method construction system, the **per-step camera framing** (`frameStep`), and
  `window.simAPI`. No leaf imports a sibling leaf (RULES.md §3.6).
- **Data-driven line types.** Each of the six positions is a **configuration object** in
  `lineTypesData.js` (`STEPS`), NOT a bespoke render path. A step's `set` LOCKS the `case` + the
  angles it does not teach; `controls` lists the meaningful controls; `cam` is the vantage the
  camera glides to. `resolveLine()` (shared with the Lines topic) turns the active config into
  endpoints + view metrics. Rendering (`lineTypeRig`), UI (`uiManager`), and animation all read the
  active config — there is no per-type rendering code.
- **The stepper drives the scene through ONE channel:** `sim.applyStep(meta)` (main.js) locks the
  case + angles, sets all views on, gently frames the camera, and routes into `rebuild()`. It is a
  conceptual TOUR — no answer gates; a step counts complete once visited.
- **World axes** (Module-1 family): `HP = XZ plane (y=0)` · `VP = XY plane (z=0)` · `fold line = X`.
  `÷10`, ADR-018: 1 world unit = 10 mm. Sheet 24×24 units (240 mm), framed apparatus-tight.
- **Per-step camera (frameStep)** glides the **free-orbit perspective camera** to each step's
  vantage on entry — an orbit-preserving reframe, not a held-angle lock (§5.8). Any user drag
  cancels it; orbit behaviour stays identical to every other Module-1 topic. The fold still flies
  the ADR-036 orthographic swoop unchanged.
- **Compare / workbench** (ADR-012 / ADR-021 / ADR-037): the 3D scene is always the main pane; the
  finished 2D orthographic drawing appears on demand, rendered on its OWN `WebGLRenderer`/canvas
  (ADR-076 — a genuinely separate surface from the 3D viewport, not a scissored pass on a shared
  one). Available on every step. The expanded split docks three floating rounded cards (3D
  viewport, 2D drawing, rail) on a `--color-panel` shell (DESIGN.md §5.13) with an independent
  `#rail-toggle` Hide/Show control; `WORKBENCH_CONTROLS` re-parents the drivers (`tl`/`theta`/`phi`)
  **and** the Rotation Method launcher (`rotation`) into the rail, so the construction runs inside
  the split like any other control.
- **Rotation Method (Step 6):** the rotating-line construction (`rotationMethod.js`, ported from the
  Lines topic's `trueLength.js`, unchanged by the renderer split) animates on the Compare sheet —
  swings each foreshortened view flat to recover the True Length and the true angles θ, φ. Torn
  down on any edit / step change.

## File structure (as built)

```
graphics_module_1_topic_5_projection_of_line_types/
├── index.html        ← thin shell (importmap + boot watchdog + canvas + wizard chrome + Compare card)
├── main.js           ← ORCHESTRATOR (scene, the 3D renderer + the 2D Compare sheet's own
│                        renderer (ADR-076), dual cameras, rebuild()/disposal, Compare/workbench
│                        (ADR-037), fold swoop, frameStep, Rotation Method, simAPI)
├── meta.json         ← platform metadata (title = "Projection of Straight Lines — Types of Lines")
├── CLAUDE.md · CHANGELOG.md
├── assets/fonts/     ← bundled woff2 (byte-identical to the platform set)
└── src/
    ├── anim.js            ← tween/easing engine (byte-identical to the platform copy)
    │  # pure data
    ├── lineTypesData.js   ← LineCase · resolveLine() · defaultTypeData() · STEPS (6 types) · TERMS
    │  # shared STATELESS utilities (the §3.6 pure-math exception)
    ├── sheet2DLayout.js   ← intrinsic-scale (True-Length) sheet-space layout math (ADR-075)
    ├── dimensions.js      ← BIS SP 46:2003 Type-B dimension builder
    ├── labels.js · labelPlacement.js · labels/  ← the CSS2D label system + placement policy
    │  # 3D content + 2D sheet
    ├── lineTypeRig.js     ← the 3D scene: HP/VP planes + fold hinge, AB + views + projectors,
    │                         view-foot DOTS (so a point-view reads as a dot), TL dimension, 3D labels
    ├── compareSheet.js    ← the 2D orthographic sheet (own scene + ortho camera, 2nd pass) + overlay
    │  # construction (animated overlay on the sheet)
    ├── rotationMethod.js  ← the rotating-line True-Length construction (Step 6)
    │  # workflow chrome
    ├── stepper.js         ← the 6-step guided controller (applyStep + fold toggle)
    ├── uiManager.js       ← the parameter dock (Length / θ / φ) + the Reset confirm
    ├── terms.js           ← glossary popovers (imports lineTypesData.TERMS)
    └── onboarding.js      ← first-run orbit hint + per-step spotlights
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; CDN ES modules pinned to **three@0.160.0** via the exact import map; `.js`
  extensions on every import; all paths relative (ADR-001).
- Single `rebuild()` is the only path for geometry change; full disposal contract every rebuild
  (ADR-004). The Compare sheet + the Rotation Method overlay dispose through the same contract.
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- `LineMaterial` + `Line2` for all fat linework; keep `resolution` in sync on resize / Compare
  open-close (ADR-006). Dashed lines need `computeLineDistances()`.
- 3D pictorial projectors stay DASHED; 2D orthographic projectors are SOLID Type-B; foot markers
  are filled dots (ADR-016).
- A leaf module must not import a sibling leaf (ADR-007, §3.6).

## What differs from the sibling Lines topic (do not "restore")

- Six fixed-position **type** steps, NOT the five build-up problem-solving steps. Each step LOCKS a
  `case` (this is the deliberate design of a *concept* topic — the §6.13 "no fixed-orientation case
  steps" rule governs the *problem-solving* Lines topic, a different teaching goal).
- Controls are **Length / θ / φ** only (no distance-from-HP/VP dials — end A sits at a fixed pose).
- **No Problem Library, no traces construction, no answer validation** — removed, not deferred.
- Per-step **camera framing** (`frameStep`) on entry is new to this topic.

---

*Module 1 Topic — Projection of Straight Lines · Types of Lines · Module-2 orchestrator pattern
(ADR-033) · copy-and-simplify from `graphics_module_1_topic_6_projection_of_straight_lines` (ADR-009) · Three.js 0.160.0 ·
no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest:
### SESSION DIGEST — [date] — [feature/task]
**What changed:** · **Decisions made:** · **Patterns introduced:** · **Open questions / next steps:** · **Files modified:**

## Keeping Root Documents Current
After a task with architectural/decision significance: add an ADR to ../DECISIONS.md, update a
superseded ADR's status, add an enforced rule to ../RULES.md (citing its ADR), or update
../ARCHITECTURE.md. Do not update for routine changes.
