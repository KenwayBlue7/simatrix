# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.6: Ogee Curves

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's Module 1, sixth and — per
> ADR-078's provisional list — LAST topic in this initial set. Namespaced
> `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1.
> **Do not confuse the two Module 1s or port content between them without a reason.**

Two ogee (reverse) curve constructions, taught one at a time: joining two parallel lines, and
joining two non-parallel (inclined) lines. Both share one underlying mechanism — a tangent-
circles equation, not the "reversal point on the straight line AB" shortcut a first look at the
textbook diagram suggests (see "A note on precision" below) — surfaced to the student as a
single **draggable handle** inside the drawing, the first interaction of its kind in this
syllabus track (Topics 1.1-1.5 never made a point inside a construction draggable — confirmed
by grep before this topic was built).

**Duplicated from Topic 1.1** (`../graphics_diploma_module_1_topic_1_1_basic_constructions`),
which established this syllabus track's scaffold shape (RULES.md §1.4's manual-copy discipline,
no shared library). Also carried forward Topic 1.5's `renderConstruction.js` (`'circle'` and
`'angledim'` kinds) as the base to extend, and Topic 1.2's `normalizeSpan()` minor-arc technique.

## Project-wide documentation (read before cross-module tasks)

Per **ADR-078**, this syllabus track **shares this repo's root docs and ADR sequence** — it is
**not** a Case-C fork. Before starting any task that touches shared behavior, UI patterns, or
cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — why key decisions were made (ADR log; recorded under ADR-078)
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1). This topic's own construction-
line colour tokens are declared in this folder's `DESIGN.md` appendix — reused byte-for-byte from
Topic 1.1 (§2). The draggable handle (§3) is new — see below. Strategic context (persona,
principles, accessibility commitments) lives in the root `../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, draggable handle, inline hints, and sim-internal animations.
The host Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out
of scope.

---

## Architecture — 2D SVG orchestrator (ADR-078, invoked-by ADR-025)

Same discipline as Topics 1.1-1.5: one orchestrator (`src/main.js`) owning state and a single
`rebuild()` funnel, single-purpose leaf modules that never import each other, inline SVG (no
Three.js, no import map). See Topic 1.1's own CLAUDE.md for the full rationale; only what this
topic adds or changes is recorded here.

### A note on precision — a wrong first derivation, caught before it shipped (RULES §6.6)

Before writing `constructions.js`, this topic's build tried the construction method a first
reading of the textbook diagram suggests: pick a reversal point M ON the straight segment AB
(the line joining the two connection points), then find each arc's centre by intersecting the
perpendicular to its own line at its own tangent point with the perpendicular to AB at M. A
numeric self-consistency check (Node, this session) caught that this does NOT actually produce
two circles tangent to each other for any split other than the symmetric R1=R2 case — the
centres it locates are NOT equidistant from both of their own two supposed tangent points. That
"M on straight AB" picture is only true in the special, symmetric case; the CONTEXT's own framing
("rather than only showing the one textbook-assumed midpoint case") turned out to be describing
exactly this trap.

The construction actually used (verified: `|O1-O2| = R1+R2` to floating-point precision, for
both constructions, across a wide random sweep): R1 (the first arc's radius) is the one genuinely
free parameter. `O1 = A + R1*n1` is then fixed; `R2` solves the tangent-circles equation in
closed form (one linear equation after squaring — no iteration); the reversal point M sits on
segment O1-O2, not on AB, except in the symmetric case. For the parallel-lines construction, an
extra fact holds and is asserted numerically in this file's own header comment: **R1+R2 is a
constant** for two given parallel lines, regardless of where the curve reverses — so the
parallel construction's own `reversalPos` (%, matching the textbook's position-based framing)
converts to R1 via that constant, while the non-parallel construction's `radius1` (mm) IS R1
directly, matching ITS OWN source framing. Both then feed the identical `solveR2()`/handle
mechanism — see `constructions.js`'s header comment for the full derivation.

### The draggable handle

`constructions.js`'s `build()` returns an optional `handle` field (a `HandleSpec`: a point, a
fixed axis to slide along, and a `toParam()` conversion back to the bound `given[]` value).
`renderConstruction.js` exports `mountHandle()` — the actual SVG mounting/wiring — since
`renderConstruction.js` is the only file allowed to touch `#construction-svg` content
(RULES §3.2's spirit); `uiManager.js` never reaches into the SVG, unchanged from every prior
topic. `main.js` disposes and remounts the handle every `rebuild()`, right after the given steps
render, with an `onCommit` callback that is the EXACT SAME `simController.commit()` every slider
already calls — dragging the handle and dragging the matching slider thumb are two views of one
state write, so they stay in sync for free through the existing funnel, no special-casing.
Keyboard-operable (PRODUCT.md §7): `role="slider"`, arrow keys step by the bound param's own
`step`, Home/End jump to min/max — see DESIGN.md §3 for the full visual/interaction spec.

### What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/viewTransform.js` | EXTRACTED (from Topic 1.5) | Pure viewBox pan/zoom + `ensureVisible()`; the handle's own drag math uses `getScreenCTM()` directly rather than this module's internal viewBox state, so it stays correct under any pan/zoom without depending on viewTransform.js's internals |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic |
| `src/uiManager.js`, `src/stepper.js` (mechanics) | EXTRACTED (from Topic 1.1) | Slider-building loop, reset-confirm, four-step rail — no method/n-switcher needed this topic (plain `given[]` sliders only), so Topic 1.1's un-extended versions are the right base, not Topic 1.4's or 1.5's |
| `src/stepper.js` (copy) | INFERRED | `STEPS[0]`/`STEPS[1]` lead text: "two" constructions, mentions the handle |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.5, incl. `'circle'`/`'angledim'` kinds) + **one addition** | **Added** `mountHandle()` — see above. Everything else (buildStepNode, computeBounds, playSteps, renderStatic) unchanged |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: ogee, reversal point, tangent |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry. New primitives: `solveR2` (closed-form tangent-circles solver, shared by both constructions), `rot90`/`rotNeg90`, `normalizeSpan` (Topic 1.2's, copied verbatim — both ogee arcs must draw as their minor arc). New: every `build()` may return a `handle` field alongside `steps`/`resultText`/`invalid` |
| `src/main.js` | EXTRACTED (from Topic 1.1) + **one addition** | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. **Added**: `handleLayer` DOM ref, `activeHandle` lifecycle (dispose/remount every `rebuild()`), wiring `mountHandle()`'s `onCommit` to `simController.commit()` |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) — the two seeded problems plus the CONTEXT's railway-track and inclined-pipeline capstones, both recontextualizing the SAME two constructions at a stated drawing scale (1:50) rather than adding new fields |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3, new) | Token table reused unchanged; §3 documents the draggable handle's full visual/interaction spec |

## The four-step shape (every construction uses the same shape)

Unchanged from Topics 1.1-1.5 — Choose (a 2-item picker, parallel-lines case listed first, the
non-parallel general case second — same "concrete before general" sequencing Topic 1.4 used for
Pentagon/Hexagon before its N-gon) → Given (sliders + the draggable handle) → Construct
(Play/Replay) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`
  (same tier as Topics 1.2-1.5).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_6_ogee_curves/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + handle spec (new)
├── assets/fonts/                ← bundled woff2 (byte-identical to the platform set)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── viewTransform.js             ← pan/zoom + ensureVisible() over the SVG viewBox (byte-copy)
    ├── stepper.js                     ← guided-step controller (4-step shape + picker step)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders (byte-copy from Topic 1.1)
    ├── problems.js                            ← Problem Library data (tiered, incl. two capstones)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 2 constructions' pure geometry + handle specs
    ├── renderConstruction.js                        ← draws a recipe into the SVG + mountHandle()
    └── main.js                                        ← orchestrator + handle lifecycle
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the SVG
  directly (RULES §3.2) — the handle is the one control that DOES live inside the SVG, but it
  still only ever changes state via `commit()`, same as every slider.
- Read all colours from CSS tokens — never hard-code hex (ADR-003). The handle stays off
  `--color-accent` inside the viewport except its focus ring (DESIGN.md §3 explains why that's
  not a Chrome-Only-Blue violation).
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1–§6.3).
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.6 — Ogee Curves ·
2D SVG orchestrator (ADR-078) · scaffold duplicated from Topic 1.1 · no build tools · last topic
in the initial six-topic set.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
