# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 2 Topic 1.1: Development of Surfaces

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-095]**. This is that track's **Module 2**, Topic
> 1 ("Development of Surfaces") — the first Diploma topic to grow past Module 1 ("Geometrical
> Constructions" + "Misc Curves", ADR-095/ADR-096). Namespaced
> `graphics_diploma_module_2_topic_1_1_development_of_surfaces` per ADR-095's decimal convention
> (`graphics_diploma_module_<M>_topic_<M>_<N>_<slug>` — the repeated `<M>` is deliberate). See
> `../DECISIONS.md` **ADR-112** for the full module-numbering and architecture reasoning.

Three constructions, all Parallel-Line method (K.C. John Ch.15 §15.2/§15.4, Bhatt Ch.15 §15-1/§15-2):
a rectangular prism, a plain cylinder, and a two-piece symmetric 90° pipe elbow (each piece a
cylinder mitred once at 45°). **Scope is deliberately narrow** — no pyramid/cone (those are the
Radial-Line method, a different lesson), no general truncation UI, no three-piece elbow. Built by
reading BOTH reference PDFs cover-to-cover for this chapter first (`Development.pdf` — N.D. Bhatt;
`KC-Development.pdf` — K.C. John, the closer diploma-level scope), cross-checking K.C. John first
per this build's brief, falling back to Bhatt only where K.C. John was silent (true for the
two-piece elbow — see §"Elbow scope" below).

## Project-wide documentation (read before cross-module tasks)

Per **ADR-095**, this syllabus track **shares this repo's root docs and ADR sequence**. Before
starting any task that touches shared behavior, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — ADR log; this topic's own decision recorded as **ADR-112**
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1).

**Scope boundary:** this module produces a self-contained simulation payload — the viewport plus
its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host Simatrix
website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## ADR-112: ONE canvas, not SVG — read this before touching the viewport or renderConstruction.js

Every other Diploma topic renders to inline SVG. This topic renders to **ONE `<canvas>`**
(`#construction-canvas`) carrying the front view, top view/auxiliary circle, development, and every
transfer line as a single continuous plate — matching how Bhatt Fig. 15-8/15-10 and K.C. John Fig.
15.4/15.7/15.12 actually draw this subject (a transfer line crossing from the front view straight
into the development on ONE sheet). This is recorded in full in **ADR-112** — read it before
"fixing" this topic back to SVG for consistency with the rest of the track; the SVG choice
elsewhere is a strong default for subjects with no multi-view single-plate transfer-line
requirement, which every other Diploma topic (so far) has and this one does not.

`viewTransform.js` and `renderConstruction.js` are full REIMPLEMENTATIONS against
`CanvasRenderingContext2D`, not ports — see each file's own header comment for the substitution
details. Both keep the SAME external contract every other topic's SVG versions expose
(`initViewTransform() → {resetView, ensureVisible, dispose}`; `clear/computeBounds/renderStatic/
playSteps`), so `constructions.js`/`stepper.js`/`uiManager.js` need no special awareness of the
substrate swap — only `main.js`'s `paint()` (which resolves CSS custom properties to real colour
strings every frame, since canvas cannot read a raw `var(--token)` string the way SVG presentation
attributes can, and sets `ctx`'s transform from the current pan/zoom view-state) knows the
difference.

## `developmentEngine.js` — an independent copy, not a shared file

`src/developmentEngine.js` and `src/genericSolid.js` are copied from the KTU-track topic
`../graphics_module_3_topic_2_development_of_surfaces/src/`, but **this is NOT a byte-identical
shared-file relationship under RULES §1.3/§1.4** (ADR-112) — this topic's copy is free to drift.
What this topic actually calls: `parallelLayout()`'s cylinder branch (unused directly — the
cylinder construction rolls its own stretch-out math inline for clarity) and the underlying
plane-cylinder-intersection reasoning `computeCutDistances()` encodes, closed-formed directly in
`constructions.js`'s `cutHeight()` for the elbow (see that file's own derivation comments). The
copied file's `draw*()` functions, radial-line math, and string-path/"ant" geodesic functions are
**unused** — this topic's pedagogy is animated step-by-step draw-on (`renderConstruction.js`), a
different paint model from the KTU engine's direct, non-animated `drawDevelopment()`. Kept rather
than deleted for audit-trail-back-to-source, per ADR-112.

## Elbow scope — a named simplification, verify before "completing" it

**Neither reference PDF has a worked TWO-piece 90° elbow example.** Both books' only worked
pipe-bend example is a THREE-piece bend (Bhatt Problem 15-13/Fig. 15-15; K.C. John Example
15.18/Fig. 15.20-21, general formula `θ = 90°/(n+1)`). This topic's two-piece elbow is a deliberate
simplification (ADR-112), each piece built from the single-truncation cylinder construction (Bhatt
Fig. 15-10 / K.C. John Fig. 15.12, Example 15.9) mitred at 45° and mirrored. Do not cite a specific
figure number for "the two-piece elbow" in future work — there isn't one; cite the single-truncation
construction instead, as this file and `constructions.js` already do.

**A documented simplification within the simplification:** the horizontal piece's twelve generators
have no genuine third (side) auxiliary view to project from in this topic's two-view-plus-
development layout, so they're placed directly along that piece's own flat end and tied to the
mitre line by a labelled number correspondence rather than a continuous orthogonal projector (see
`constructions.js`'s `buildElbow()` comments). The underlying MATH (stretch-out length, cut-curve
amplitude/period, leg-length algebra) is verified correct — see the in-file corner-point derivation
and the `verifyCutHeightAgainstGeneralSolver()` dev-console self-check that runs once at module
load. The FRONT-VIEW drawing of the horizontal piece's generators is the part that is simplified.
If a future pass adds a genuine side view, replace that section — the cut-height math underneath it
does not need to change.

## What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED (byte-identical) | Renderer-agnostic tween engine, no SVG/canvas knowledge at all |
| `src/onboarding.js` | EXTRACTED (byte-identical) | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/problemLibrary.js` | EXTRACTED (byte-identical, from Topic 2.3) | This topic's problem targets are all pure numbers — the simpler numeric-only `matches()` path applies unchanged |
| `src/developmentEngine.js`, `src/genericSolid.js` | EXTRACTED (from the KTU-track topic) + **independent copy, not byte-identical-shared** | See "developmentEngine.js" section above |
| `src/viewTransform.js` | REIMPLEMENTED (Canvas2D, not SVG viewBox) | ADR-112 §1 — same external contract, new backend |
| `src/renderConstruction.js` | REIMPLEMENTED (Canvas2D, not SVG DOM) + **new `'polyline'` step kind + `weight` override axis** | ADR-112 §1; K.C. John Ch.15 note #4 (outline thick / fold thin) |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS` lead text — this topic's own 3-item picker, no hand toggle mentioned |
| `src/uiManager.js` | EXTRACTED (from Topic 2.3) **minus the hand-toggle wiring** | This topic's three constructions have no handedness axis |
| `src/main.js` | EXTRACTED shape, REIMPLEMENTED viewport plumbing | Orchestrator/simController/simAPI/rebuild() funnel unchanged in shape; `givenLayer`/`dynamicLayer` are now `createLayer()` records, not SVG `<g>` refs, and a new `paint()` resolves CSS tokens + sets `ctx`'s transform every rAF frame |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry — `planPlate()`'s shared-axis layout, the prism/cylinder/elbow builders, all described above |
| `src/labels3d.js` | INFERRED (new) + adapted from `Module2/src/vertexLabeler.js` (**not** byte-identical-shared — RULES §7.2's guarantee doesn't reach this track, same precedent as `cube.js`/`developmentEngine.js`) | Compare pane's 3D prism corner numerals (`1`,`2`,`3`,`4`, matching `constructions.js`'s own top-view/development digits); Prism only, see DESIGN.md §6 |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: development, stretch-out line, fold line, seam, generator, mitre |
| `meta.json`, `index.html` | INFERRED (new) | Topic-specific; `<canvas>` viewport, not `<svg>`; 3-item picker, no hand-toggle markup |
| `DESIGN.md` (appendix) | EXTRACTED (§ construction-line tokens, byte-for-byte) + INFERRED (Canvas2D viewport note, outline/fold weight axis, `'polyline'` kind — all new) | |
| `../DECISIONS.md` ADR-112 | INFERRED (new) | The module-numbering + Canvas2D architecture decision |

## The four-step shape (every construction uses the same shape)

Choose (a 3-item picker: Prism / Cylinder / Elbow) → Given (that construction's own measurements —
no hand toggle) → Construct (Play; a single one-shot animated build, no scrub/roll phase, unlike
Topic 2.3's helix) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`.
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_2_topic_1_1_development_of_surfaces/
├── index.html              ← ONE <canvas> viewport (ADR-112 §1, NOT <svg>) + wizard shell
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: tokens (reused) + Canvas2D/weight-axis notes (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-086)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy)
    ├── genericSolid.js               ← pure polygon trig (copied from the KTU-track engine, unused
                                         directly by this topic's own constructions but kept so
                                         developmentEngine.js's import resolves — ADR-112)
    ├── developmentEngine.js           ← independent copy of the KTU-track engine (ADR-112, NOT
                                         byte-identical-shared); layout math is the reused part
    ├── viewTransform.js                 ← pan/zoom over the canvas view-state (REIMPLEMENTED)
    ├── stepper.js                         ← guided-step controller (4-step shape + 3-item picker)
    ├── terms.js                             ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                          ← first-run hints (byte-copy)
    ├── uiManager.js                             ← given-value sliders (no hand toggle)
    ├── problems.js                                ← Problem Library data (tiered)
    ├── problemLibrary.js                            ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                               ← prism/cylinder/elbow pure geometry (new)
    ├── renderConstruction.js                            ← paints steps onto Canvas2D (REIMPLEMENTED)
    ├── labels3d.js                                       ← Compare pane's 3D prism corner numerals
                                                              (CSS2DObject pills, adapted from
                                                              Module2/src/vertexLabeler.js — new)
    └── main.js                                            ← orchestrator (REIMPLEMENTED viewport plumbing)
```

(The Compare pane's own 3D layer — `view3d.js`, `cube.js`, `cylinder.js`, `elbowHalf.js` — is a
pre-existing gap in this tree, untracked since the 2026-08-05/06 Compare build; not addressed here.
`labels3d.js` is `view3d.js`'s only consumer of the pair.)

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the
  canvas directly (RULES §3.2, re-expressed for this substrate).
- Read all colours from CSS tokens — never hard-code hex (ADR-003). Canvas fillStyle/strokeStyle
  values are RESOLVED strings (`getComputedStyle(...).getPropertyValue(...)`), not raw `var(...)`
  literals — canvas cannot parse the latter the way SVG presentation attributes can.
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1-§6.3).
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 2 Topic 1.1 — Development of Surfaces ·
first Diploma topic in Module 2 (ADR-112) · Canvas2D viewport (ADR-112 §1, this track's first
deviation from the SVG default) · scaffold adapted from Topic 2.3's helix (mechanics EXTRACTED,
viewport REIMPLEMENTED) · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
