# CLAUDE.md — Simatrix · Projection of Straight Lines

Three.js simulation that teaches the **projection of a straight line** onto the Horizontal (HP)
and Vertical (VP) planes: a 5-step build-up on one general line — True Length → distance of end A
from HP/VP → inclinations θ (with HP) & φ (with VP) → generate the orthographic projection (the
cinematic fold) → find the traces (HT/VT) — plus the on-demand **True Length & Angles**
(rotating-line) construction. Ships as a self-contained payload that runs inside a sandboxed
`iframe` on the Simatrix platform.

> **STATUS: MIGRATION COMPLETE (Phases 4A–4G, 2026-07-12 — ADR-042); PROMOTED to catalog topic 6 +
> PROBLEM LIBRARY ACTIVATED (2026-07-19).**
> This topic was cut from the `graphics_module_1_topic_3_points` skeleton (ADR-009's
> copy-and-simplify discipline) and migrated off the retired shared `Module1/src/engine.js`
> (ADR-033) onto the orchestrator + leaf-module pattern, then built to feature parity: the 5-step
> workflow (ADR-017), the Compare card + workbench (ADR-012 / ADR-021), the second-pass orthographic
> sheet (ADR-042), the fold camera swoop (ADR-036), the Traces + True-Length constructions, BIS
> Type-B dimensioning (ADR-041), and the two-overlay CSS2D annotation layer. Each phase was
> headless-verified (ADR-019). The **Problem Library is now ACTIVE** — `src/problemLibrary.js` +
> `src/lineProblems.js` (12 verbatim N.D. Bhatt / K.C. John textbook problems, RULES.md §6.7) are
> wired via `initProblemLibrary(simController, {list, tiers, fieldLabels})` in `main.js`, with the
> "Practice problems" entry, a focus-trapped overlay, and a ±0.5-tolerant OR-array self-check driven
> by `sim.onStateChange` (ADR-015). It was carried in the file tree from the ADR-042 migration but
> not previously called from `main.js`; this doc had gone stale describing it as deferred. **Still
> deferred:** the Top/Front/Side quick-view cameras. See **ADR-042** and the topic-promotion ADR in
> `../DECISIONS.md`.

This is a **Module 1 topic migrated onto the Module 2 orchestrator + leaf-module pattern**
(ADR-033), a standalone `graphics_module_1_topic_6_projection_of_straight_lines` folder — NOT a
thin page bolted onto the retired shared `engine.js`. It carries catalog index **6**, the next free
Module-1 slot after `graphics_module_1_topic_5_projection_of_line_types` — the sibling "Types of
Lines" concept primer, cut FROM this topic (ADR-009 copy-and-simplify) to teach the six standard
line positions before a learner reaches textbook problems. That sibling deliberately omits the
Problem Library (see its own CLAUDE.md); this topic is the full problem-solving build and is the
one that owns it. (The folder previously shipped under a non-conforming name without the
`graphics_` prefix or a catalog number; renamed to conform.)

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

**Design system rules:** Always read and strictly follow the consolidated platform design system
at `../DESIGN.md` (Simatrix root) for all colour, typography, spacing, component styling, and
UI/UX decisions — Module 2 is its master/reference implementation. Strategic context lives in the
consolidated root `../PRODUCT.md` (ADR-023). Never hard-code design values in CSS or JS — consume
tokens defined in `../DESIGN.md`. This topic does **not** and must **not** carry a local
`DESIGN.md`/`PRODUCT.md` copy (ADR-028, RULES.md §1.14). The three Lines construction-aid tokens
(`--construct`, `--locus`, `--tl-green` + their `*-ink` text variants) are declared in this
topic's own `index.html` `:root` (they are viewport encodings unique to this topic, not shared
design-system tokens).

**Scope boundary:** This module produces a self-contained Three.js *simulation payload* — the 3D
viewport plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations.
The host Simatrix website (navbar, module browser, account UI, login, dashboard) is built by
other web developers and is **out of scope** here.

**`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
`{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.

---

## Architecture — Module 2 orchestrator pattern (ADR-033, overturns ADR-011 for this topic)

- **`main.js` is the orchestrator** (ADR-007): it owns the scene, the perspective **and**
  orthographic cameras + their `OrbitControls` (the dual-camera §5.18 stack — quick-views +
  the ADR-036 fold swoop), the single `rebuild()` pipeline (full WebGL disposal contract,
  ADR-004), the render loop, the Compare state machine + the ADR-021 workbench split, the
  Problem Library seam, the **clip-aware auto-zoom** (`reframeIfClipped`, ADR-014 — dollies the
  free-orbit perspective camera back, push-back only, when typed-field values push the line past
  the frame), and `window.simAPI`. It is the ONE place leaf modules meet (no leaf imports a
  sibling leaf — RULES.md §3.6).
- **World axes** (Module-1 family convention): `HP = XZ plane (y=0)` · `VP = XY plane (z=0)` ·
  `fold line = X axis`. `lineData.resolveLine()` returns signed endpoint mm; the draw leaves
  remap onto these world axes (÷10, ADR-018: 1 world unit = 10 mm). Sheet is **44×44 units
  (440 mm)**, `PLANE_LIFT = 16` — the HP/VP planes are OFFSET (not origin-centred), spanning
  `[-6, +38]` on the axis the drawing uses, sized to the typed-field ceiling (TL 200mm +
  aHP/aVP 150mm each, plus a 3u annotation margin), not just the slider max (ADR-079,
  overturns this section's prior 24u rationale — the drawing only ever occupies the first
  quadrant, so an origin-centred plane wastes half its area). `GRID.divs` scales with `SHEET`
  to keep the 1.0u = 10 mm engineering cell.
- **The 3D→2D fold** flies the ADR-036 orthographic swoop (`swoopToAnswerSheet` — square-on to the
  flattened answer sheet, perspective→ortho morph); held-angle folds are FORBIDDEN (RULES.md §5.8).
  `beforeFold` closes any open construction overlay first.
- **The 5-step stepper** (ADR-017 / §6.12–§6.14): True Length → distances → inclinations →
  generate projection → traces, all pinned to the general `LineCase.INCL_BOTH` resolver; controls
  are dedicated per step (TL on step 1, distances on step 2, θ/φ on step 3). Do NOT revert to the
  six fixed-orientation "case" steps (§6.13). Do NOT rename "line AB"/"end A" (§6.15).
- **Compare / workbench** (ADR-012 / ADR-021 / ADR-037, narrowed by ADR-080): Compare has exactly
  one shape, at every viewport width — a true 50/50 split, three floating rounded cards (3D
  viewport, 2D orthographic drawing, docked rail) on a `--color-panel` shell (DESIGN.md §5.13),
  with an independent `#rail-toggle` Hide/Show control (`setupRailToggle`) floating at the 3D
  viewport's bottom-left corner. There is no compact/floating fallback card and no
  `matchMedia`-driven demotion (§5.16a) — below 768px the same split grid restacks to a single
  column instead of switching to a different Compare UI. `WORKBENCH_CONTROLS` re-parents the
  geometry-driver controls (`tl`/`disthp`/`distvp`/`theta`/`phi`) into the docked
  `#workbench-rail` (two titled clusters, Dimensions / Inclination); re-parent the existing
  `[data-ctrl]` nodes, never mirror inputs (§5.17). The construction launchers (`truelength`,
  `traces`) dock separately, in `#con-dock` — a direct `<body>` child that floats at the 2D
  drawing panel's bottom-right corner, mirroring `#rail-toggle`'s floating-corner convention on
  the opposite pane (`ensureConDock()`/`CON_DOCK_CONTROLS`, topic-local). A construction runs
  inside the split like any other control.
- **2D Compare vehicle — Three.js ortho sheet, own renderer (ADR-076).** Unlike the sibling Points
  topic (ADR-034, Canvas2D), the Lines 2D drawing + its animated **Traces** and **True-Length**
  constructions are rendered with the **fat-line (`Line2`) stack in a dedicated ortho scene**
  (`compareSheet.js`, unchanged) — but that scene now draws on its **OWN `WebGLRenderer`**, bound to
  its own `<canvas>` created lazily inside the Compare card's stage on first Compare open
  (`ensureSheetRenderer()`), a genuinely separate surface from the 3D viewport's canvas. This
  replaces the topic's original design (a SECOND render pass scissored onto the SAME
  `WebGLRenderer` as the 3D scene — one GL context, informally cited in this file's older revisions
  and in code comments as "ADR-042," which was always this topic's own local label, never a
  proper root-DECISIONS.md entry; the real root citation for that design was ADR-034's
  "alternative-A" pattern, most recently patched by ADR-074's pixelRatio fix). ADR-076 retired that
  design because a single canvas scissored into two regions cannot show a real grey gutter between
  them, which the ADR-037 floating-card workbench (ported into this topic alongside the renderer
  split) needs. A second WebGL context per topic is an accepted, deliberate tradeoff — see ADR-076's
  Consequences. The rich fat-line construction code needed **zero changes**: `compareSheet.js`'s
  `render(renderer)` already took the renderer as an argument, so it was renderer-agnostic before
  this change too. The 2D sheet renders at an **intrinsic scale locked
  to the line's own True Length** (ADR-075 / §5.19, superseding ADR-038's fixed `SHEET2D_SPAN` span
  for this topic): `sheet2DLayout.js::layout2D()` derives its px-per-mm factor from the resolved
  line's `M.tl` each call — the Module 2 ADR-053 intrinsic-size model applied to a line, invariant
  to the distance-from-HP/VP and θ/φ sliders (they translate/reorient, never change TL), so a
  typical drawing fills the sheet at any True Length instead of floating tiny inside a
  worst-case-sized frame (see `sheet2DLayout.js`'s own comment for the full rationale).
- **No solid machinery.** Lines draws points/lines, not solids: no shape generators, no
  `meshAnalyzer.js`, no `projectionDrawer.js`, no hidden-line classification.

## File structure (as built)

```
graphics_module_1_topic_6_projection_of_straight_lines/
├── index.html            ← thin shell (importmap + boot watchdog + canvas + wizard chrome +
│                            Compare card + workbench-rail CSS + construction-aid tokens)
├── main.js               ← ORCHESTRATOR (topic root, not src/): scene, the 3D WebGLRenderer (the
│                            2D Compare sheet owns a second, own-canvas renderer — ADR-076), the
│                            dual perspective+ortho cameras, single rebuild()/disposal, the two
│                            CSS2D overlays, Compare/workbench (ADR-037), the ADR-036 fold swoop,
│                            the construction system, window.simAPI
├── meta.json             ← platform metadata (title = "Projection of Straight Lines")
├── CLAUDE.md             ← THIS file
├── CHANGELOG.md          ← this topic's change log
│                          (fonts: @font-face served from Supabase Storage CDN, ADR-086 —
│                           no local assets/fonts/ anymore)
└── src/
    ├── anim.js           ← tween/easing engine, byte-identical to the platform copy
    │  # pure data
    ├── lineData.js       ← defaultLineData / resolveLine / LineCase
    ├── lineSteps.js      ← STEPS (ADR-017 5-step) + TERMS
    ├── lineProblems.js   ← PROBLEMS / TIERS / FIELD_LABELS for the ACTIVE Problem Library (12
    │                        verbatim N.D. Bhatt / K.C. John textbook problems, RULES.md §6.7)
    │  # shared STATELESS utilities (the genericSolid-style §3.6 exception, imported by several leaves)
    ├── sheet2DLayout.js  ← pure sheet-space layout math (intrinsic TL scale, ADR-075) + trace
    │                        (HT/VT) geometry
    ├── dimensions.js     ← the BIS SP 46:2003 Type-B dimension builder (filled 3:1 arrows)
    ├── labels.js         ← the CSS2D label factory (makeLabel / addLabel / disposeLabels)
    │  # 3D content + 2D sheet
    ├── lineRig.js        ← the 3D scene: HP/VP planes + fold hinge, AB + views + projectors,
    │                        the True-Length dimension, and all 3D CSS2D labels
    ├── compareSheet.js   ← the 2D orthographic sheet (its own scene + ortho camera, the 2nd
    │                        render pass), the view dimensions, sheet labels, + the construction overlay
    │  # constructions (animated overlays on the sheet)
    ├── traces.js         ← the animated HT/VT trace construction (+ HT/VT/h/v labels)
    ├── trueLength.js     ← the 12-phase rotating-line True-Length construction (+ b₁/TL/θ/φ labels)
    │  # workflow chrome
    ├── stepper.js        ← the 5-step guided controller + the construction launchers
    ├── uiManager.js      ← the parameter dock (TL / distance HP-VP / θ / φ) + the Reset confirm
    ├── terms.js          ← glossary popovers (imports lineSteps.TERMS)
    ├── onboarding.js     ← first-run spotlights (Lines set)
    └── problemLibrary.js ← the ACTIVE Problem Library controller (ADR-015): focus-trapped
                             overlay, entryStep routing, ±0.5-tolerant self-check via
                             sim.onStateChange — wired in main.js, not deferred
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; CDN ES modules pinned to **three@0.160.0** via the exact import map; `.js`
  extensions on every import; all paths relative (ADR-001, §2.1–§2.5).
- Single `rebuild()` is the only path for geometry change; full disposal contract every rebuild
  (verify `renderer.info.memory` flat across 50 rebuilds — ADR-004, §3.1–§3.5). Any construction
  overlay + the fold sheet dispose through the same contract.
- Read all colours from CSS tokens — never hard-code hex (ADR-003, §4.1).
- `LineMaterial` + `Line2`/`LineSegments2` for all fat linework; keep `resolution` in sync on
  resize / Compare open/close (ADR-006, §3.12–§3.16). Dashed lines need `computeLineDistances()`.
- The 3D pictorial projectors stay DASHED; the 2D orthographic projectors are SOLID Type-B; foot
  markers are thick filled dots (ADR-016, §6.16–§6.18). Do not "fix" these back.
- A new leaf module must not import a sibling leaf (ADR-007, §3.6).

---

*Module 1 Topic — Projection of Straight Lines · Module-2 orchestrator pattern (ADR-033,
overturns ADR-011 for this topic) · migrated off the retired shared `engine.js` · Three.js
0.160.0 · no build tools.*

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
