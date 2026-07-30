# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.3: Tangent Lines

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's Module 1, third topic —
> subtopic 1.3 in ADR-078's provisional numbering. Namespaced
> `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1.
> **Do not confuse the two Module 1s or port content between them without a reason.**

Three tangent-line constructions, taught one at a time: two tangents from a point outside a
circle; common EXTERNAL tangents to two circles; and common INTERNAL tangents to two circles.
Unlike Topic 1.2 (which drew tangent ARCS with a live external/internal toggle on its two-circle
case), this topic draws tangent LINES and keeps external/internal as two separate picker items —
each earns its own principle text carrying the sum-vs-difference contrast (DESIGN.md appendix
§3 explains why no toggle was added here). A fourth, applied "crossed flat-belt drive" problem in
the Problem Library reuses the internal-tangents construction as a stretch/capstone.

**Duplicated from Topic 1.1** (`../graphics_diploma_module_1_topic_1_1_basic_constructions`),
which established this syllabus track's scaffold shape (RULES.md §1.4's manual-copy discipline,
no shared library). Also carried forward Topic 1.2's `renderConstruction.js` `'circle'` step kind
and its `viewTransform.js` `ensureVisible()` auto-fit — both already generic, not re-derived.

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
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1). This topic's own construction-line
colour tokens are declared in this folder's `DESIGN.md` appendix — reused byte-for-byte from
Topic 1.1/1.2 (the given/move/result roles already cover tangency points; no fourth token was
needed, see appendix §2). Strategic context (persona, principles, accessibility commitments)
lives in the root `../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, inline hints, and sim-internal animations. The host Simatrix
website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## Architecture — 2D SVG orchestrator (ADR-078, invoked-by ADR-025)

Same discipline as Topics 1.1/1.2: one orchestrator (`src/main.js`) owning state and a single
`rebuild()` funnel, single-purpose leaf modules that never import each other, inline SVG (no
Three.js, no import map). See Topic 1.1's own CLAUDE.md for the full rationale; only what this
topic adds or changes is recorded here.

### What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/viewTransform.js` | EXTRACTED (from Topic 1.2) | Pure viewBox pan/zoom + `ensureVisible()`; only depends on the shared 200×140 viewBox |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.2, incl. its `'circle'` kind) | `buildStepNode()`'s line/arc/point/circle/dim cases are construction-agnostic; this topic's given/auxiliary circles reuse the `'circle'` kind Topic 1.2 added, no further change needed |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic |
| `src/uiManager.js` | EXTRACTED | Slider-building loop, reset-confirm, result sync unchanged — no mode toggle needed this topic (see below), so nothing to add |
| `src/main.js` | EXTRACTED (from Topic 1.1, not 1.2) | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. Topic 1.2's `mode: 'external'` default addition does NOT apply here — `state.params` stays plain numbers, only the header comment was retitled |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: tangent, point of tangency, external/internal common tangent |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS[0]`'s lead text says "three" not "nine"/"four" |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry. New primitive: `tangentPointsFromExternalPoint` (Thales/semicircle construction), a thin wrapper around the `circleIntersect` primitive both prior topics already established — not a new geometric idea |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged); includes the belt-drive applied/capstone problem |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3, new) | Token table reused unchanged; §3 explains why no mode toggle was added here (contrast with Topic 1.2) |

### Why no internal/external toggle (contrast with Topic 1.2)

Topic 1.2's tangent-arc case has one construction with two valid readings of the SAME two
circles (external/internal arc), so a live toggle on one drawing was the right UX. This topic's
internal/external confusion is real (`constructions.js`'s two principle texts carry the
`r1−r2` vs. `r1+r2` contrast explicitly, matching the CONTEXT block's instruction to give it the
same deliberate step-level treatment) but sits between two genuinely different tangent-LINE
families — external and internal common tangents are separate picker items, each already showing
both of its own two tangent lines side by side (the two roots of `circleIntersect`). See
DESIGN.md appendix §3 for the full reasoning. `state.params` therefore stays plain numbers; no
`mode` field, no `#mode-toggle` control, no toggle-related change to `uiManager.js`/`main.js`.

## The four-step shape (every construction uses the same shape)

Unchanged from Topics 1.1/1.2 — Choose (a 3-item picker) → Given → Construct (Play/Replay) →
Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`
  (same tier as Topic 1.2 — tangency is a step up from Topic 1.1's straight bisection).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_3_tangent_lines/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + no-toggle note (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-082)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── viewTransform.js             ← pan/zoom + ensureVisible() over the SVG viewBox (byte-copy)
    ├── stepper.js                     ← guided-step controller (4-step shape + picker step)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders (byte-copy, no toggle needed)
    ├── problems.js                            ← Problem Library data (tiered, incl. belt-drive capstone)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 3 constructions' pure geometry
    ├── renderConstruction.js                        ← draws a recipe into the SVG (incl. 'circle' kind)
    └── main.js                                        ← orchestrator
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the SVG
  directly (RULES §3.2, re-expressed for this substrate).
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1–§6.3).
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.3 — Tangent Lines ·
2D SVG orchestrator (ADR-078) · scaffold duplicated from Topic 1.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
