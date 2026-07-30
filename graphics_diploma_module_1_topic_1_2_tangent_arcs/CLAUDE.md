# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.2: Tangent Arcs

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's Module 1, second topic —
> subtopic 1.2 in ADR-078's provisional numbering. Namespaced
> `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1.
> **Do not confuse the two Module 1s or port content between them without a reason.**

Four tangent-arc constructions, taught one at a time: an arc tangent to two straight lines; an
arc tangent to a line and a circle (external case, then internal); and an arc tangent to two
circles, with a live toggle that rebuilds the SAME two circles both ways (external ↔ internal) so
the R₁+R₂ vs R₁−R₂ distinction — the one point every source problem set flags as the most
confused — is something a student can flip back and forth on rather than read as a footnote.

**Duplicated from Topic 1.1** (`../graphics_diploma_module_1_topic_1_1_basic_constructions`),
which established this syllabus track's scaffold shape (RULES.md §1.4's manual-copy discipline,
no shared library). This topic's own build audited that scaffold file-by-file before copying —
see the EXTRACTED/INFERRED split below — rather than assuming everything ports unchanged.

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
Topic 1.1 (the given/move/result roles already cover tangency points; no fourth token was
needed, see appendix §2). Strategic context (persona, principles, accessibility commitments)
lives in the root `../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## Architecture — 2D SVG orchestrator (ADR-078, invoked-by ADR-025)

Same discipline as Topic 1.1: one orchestrator (`src/main.js`) owning state and a single
`rebuild()` funnel, single-purpose leaf modules that never import each other, inline SVG (no
Three.js, no import map). See Topic 1.1's own CLAUDE.md for the full rationale; only what this
topic adds or changes is recorded here.

### What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/viewTransform.js` | EXTRACTED | Pure viewBox pan/zoom; only depends on the shared 200×140 viewBox |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED + **one addition** | `buildStepNode()`'s line/arc/point/label/dim cases are construction-agnostic. **Added a `'circle'` kind** (native SVG `<circle>`) — this topic is the first to need a *full* given circle, and a single SVG elliptical-arc command can't express a 360° sweep (start/end points coincide). Back-portable to future topics that need one. |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: tangent, point of tangency, external/internal tangency |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS` lead text says "four" not "nine" |
| `src/uiManager.js` | EXTRACTED + **one addition** | Slider-building loop, reset-confirm, result sync unchanged. **Added** `#mode-toggle` wiring for the internal/external toggle — see below |
| `src/main.js` | EXTRACTED + **one addition** | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. **Added** `mode: 'external'` to every state-(re)init call site's defaults |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry — none of Topic 1.1's 9 constructions involve tangency |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3, new) | Token table reused unchanged; the toggle's own design note is new |

### The internal/external toggle

`constructions.js`'s `tangent-two-circles` build function reads a `mode` field
(`'external' | 'internal'`) off its `params` — but `mode` is **deliberately not** in that
construction's `given` array. `given` is `uiManager.js`'s generic numeric-slider contract
(`{key,label,unit,min,max,step,default}`); bending it to also support a two-state named choice,
for the one construction out of four that needs it, would complicate every other consumer of
`given` for no shared benefit. Instead `mode` rides the exact same `state.params` object and the
exact same `sim.commit()` funnel as every numeric param (`main.js` doesn't know or care that one
of its values happens to be a string) — the ONLY topic-specific pieces are: `main.js` defaulting
`mode: 'external'` in `defaultsFor()`, and a small segmented `#mode-toggle` control
(`uiManager.js`, DESIGN.md appendix §3) that calls `commit({mode})` directly, bypassing the
generic slider loop entirely. No second state path, no second render path — `rebuild()` is still
the only way geometry changes.

## The four-step shape (every construction uses the same shape)

Unchanged from Topic 1.1 — Choose (a 4-item picker) → Given → Construct (Play/Replay, plus the
mode toggle when "Tangent Between Two Circles" is active) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`
  (Topic 1.1 is `"beginner"` — tangency, and especially the internal/external distinction, is a
  step up from straight bisection).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_2_tangent_arcs/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + toggle note (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-082)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── viewTransform.js             ← pan/zoom over the SVG viewBox (byte-copy)
    ├── stepper.js                     ← guided-step controller (4-step shape + picker step)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders + the mode toggle
    ├── problems.js                            ← Problem Library data (tiered)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 4 constructions' pure geometry
    ├── renderConstruction.js                        ← draws a recipe into the SVG (+ 'circle' kind)
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

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.2 — Tangent Arcs ·
2D SVG orchestrator (ADR-078) · scaffold duplicated from Topic 1.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
