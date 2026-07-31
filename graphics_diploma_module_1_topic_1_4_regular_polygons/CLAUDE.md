# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-095]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's Module 1, fourth topic —
> subtopic 1.4 in ADR-095's provisional numbering. Namespaced
> `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1.
> **Do not confuse the two Module 1s or port content between them without a reason.**

Three regular-polygon constructions, taught one at a time: a regular pentagon, a regular
hexagon, and a general n-sided polygon (n = 3 to 12). Unlike every prior topic, **every
construction here offers 2-3 alternate methods for reaching the SAME polygon**, switchable live
via `#method-switcher` — pentagon by a 54° angle, by two circles and an arc, or by three arcs;
hexagon by 60° lines or by compass alone; the general n-gon by semicircle division or by
perpendicular bisector. Picker order (Pentagon → Hexagon → General N-gon) is deliberate: two
concrete, named, fixed-vertex-count cases build intuition first (PRODUCT.md §1's Orient), then
the n-slider generalizes the same idea (Intuition → Problem-solving payoff) — the n-gon's own
`principle()` text calls back to pentagon/hexagon explicitly so the generalization reads as
connected, not a fresh topic.

**Duplicated from Topic 1.1** (`../graphics_diploma_module_1_topic_1_1_basic_constructions`),
which established this syllabus track's scaffold shape (RULES.md §1.4's manual-copy discipline,
no shared library). Also carried forward Topic 1.2's `renderConstruction.js` `'circle'` step
kind and `viewTransform.js`'s `ensureVisible()`, both already generic.

## Project-wide documentation (read before cross-module tasks)

Per **ADR-095**, this syllabus track **shares this repo's root docs and ADR sequence** — it is
**not** a Case-C fork. Before starting any task that touches shared behavior, UI patterns, or
cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — why key decisions were made (ADR log; recorded under ADR-095)
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1). This topic's own construction-line
colour tokens are declared in this folder's `DESIGN.md` appendix — reused byte-for-byte from
Topic 1.1 (§2). The method switcher (§3) is new — see below. Strategic context (persona,
principles, accessibility commitments) lives in the root `../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, method switcher, inline hints, and sim-internal animations.
The host Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out
of scope.

---

## Architecture — 2D SVG orchestrator (ADR-095, invoked-by ADR-025)

Same discipline as Topics 1.1-1.3: one orchestrator (`src/main.js`) owning state and a single
`rebuild()` funnel, single-purpose leaf modules that never import each other, inline SVG (no
Three.js, no import map). See Topic 1.1's own CLAUDE.md for the full rationale; only what this
topic adds or changes is recorded here.

### What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/viewTransform.js` | EXTRACTED (from Topic 1.2) | Pure viewBox pan/zoom + `ensureVisible()` |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.2, incl. its `'circle'` kind) | This topic's given/auxiliary circles reuse the `'circle'` kind Topic 1.2 added — no further change needed |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic. `matches()` does plain numeric subtraction per key — `method` is deliberately never a `target` key, same limitation Topic 1.2's `mode` had |
| `src/onboarding.js`, `src/anim.js` | EXTRACTED | as above |
| `src/main.js` | EXTRACTED + **one addition** | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. **Added**: `defaultsFor()` sets `method: construction.methods[0].id` — each construction's OWN first method, not a fixed constant (pentagon/hexagon/n-gon each declare a different `methods` list, unlike Topic 1.2's single fixed `'external'` default) |
| `src/uiManager.js` | EXTRACTED + **one addition** | Slider-building loop, reset-confirm, result sync unchanged. **Added**: `renderMethodSwitcher()`/`syncMethodSwitcher()` — see below. **Changed**: `principle` is now called as a function (`con.principle(method)`), since which derivation is active changes the explanation, not just static text |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: regular polygon, circumcentre, apothem, constructible |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS[0]`/`STEPS[2]` lead text (construction count; mentions choosing a method) |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry. Shared ground truth: `regularPolygonVertices(A,B,n)` — every method derives the SAME circumcentre/vertices by a different route, verified programmatically (all methods produce byte-identical vertex sets) |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged); pentagon/hexagon appear three/two times each (once per method, per the source's "by all three named methods"), since the self-check can't enforce which method was used — only which numeric side (and n) — hints steer method choice |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3, new) | Token table reused unchanged; §3 documents the method switcher |

### The method switcher

Every construction's `ConstructionDef` (`constructions.js`) carries a `methods: [{id,label}]`
array — pentagon has 3 entries, hexagon and the general n-gon have 2 each. Because **every**
construction needs it (unlike Topic 1.2's toggle, needed by exactly one of four), `uiManager.js`
shows `#method-switcher` unconditionally once a construction is picked, with no per-construction
show/hide branch. Button count varies, so — like the given-value sliders above it —
`renderMethodSwitcher()` builds buttons from `con.methods` at render time rather than hardcoding
them in `index.html`; `syncMethodSwitcher()` just re-flags `aria-pressed` on an unchanged button
set. `state.params.method` rides the exact same `commit()`/`state.params` funnel as every numeric
param — `main.js` doesn't know or care that one value is a string, the same principle Topic 1.2
established for its own `mode` field. No second state path, no second render path — `rebuild()`
is still the only way geometry changes.

**Ground truth, staged per method:** `regularPolygonVertices(A,B,n)` computes the one correct
shape (circumradius `R = s/(2 sin(π/n))`, vertices spaced `360°/n` around a computed centre `O`)
once. Every method then stages ITS OWN distinct `'move'` steps that visibly derive that SAME
`O`/vertex set — verified programmatically (see `constructions.js`'s header comment) that all of
a construction's methods produce an identical vertex set for identical params. Pentagon (n=5)
and hexagon (n=6) are compass-and-straightedge constructible (Gauss–Wantzel), so their methods
are exact derivations. The general n-gon's semicircle-division method is exact and general for
ANY n (a protractor-style angle split, not a compass radius — which is precisely why it, not a
pure-compass trick, is the textbook's "general" method: most n, e.g. 7, 9, 11, are not
compass-constructible at all). Its perpendicular-bisector method's calibration-arc radius is
computed directly from the same closed-form `O` rather than claiming a literal manual
re-derivation for arbitrary n — documented in `constructions.js`, not silently implied.

## The four-step shape (every construction uses the same shape)

Unchanged from Topics 1.1-1.3 — Choose (a 3-item picker) → Given → Construct (method switcher +
Play/Replay) → Verify (recaps the active method alongside the given values).

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`
  (same tier as Topics 1.2/1.3 — comparing methods is a step up from Topic 1.1's single-path
  constructions).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_4_regular_polygons/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + method switcher (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-086)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── viewTransform.js             ← pan/zoom + ensureVisible() over the SVG viewBox (byte-copy)
    ├── stepper.js                     ← guided-step controller (4-step shape + picker step)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders + the method switcher
    ├── problems.js                            ← Problem Library data (tiered)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 3 constructions' pure geometry, N methods each
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

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.4 — Regular Polygons ·
2D SVG orchestrator (ADR-095) · scaffold duplicated from Topic 1.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
