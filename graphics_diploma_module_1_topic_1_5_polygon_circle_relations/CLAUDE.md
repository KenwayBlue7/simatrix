# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.5: Polygon-Circle Relations

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**, distinct from this repo's original
> (KTU B.Tech) Engineering Graphics syllabus. This is that track's Module 1, fifth topic —
> subtopic 1.5 in ADR-078's provisional numbering. Namespaced
> `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with the existing
> `graphics_module_1_topic_*` folders, which belong to the original syllabus's own Module 1.
> **Do not confuse the two Module 1s or port content between them without a reason.**

Four constructions, taught one at a time, as **two mirrored pairs** (this topic's own audit,
confirmed before building — see "Pairing" below): inscribing a circle in a triangle, then
circumscribing one about the SAME triangle shape; superscribing a regular polygon about a given
circle, then inscribing a regular polygon inside a given circle. `superscribe-polygon` offers a
live n-switcher over `{4, 6, 8, 12}` (every polygon reachable by repeated angle bisection);
`inscribe-polygon` offers a continuous n-slider from 5 to 9, built on the textbook's own general
diameter-division method — genuinely approximate for every n except 3, 4, and 6 (verified
numerically this session, not asserted), which is exactly why it, and not a compass trick, is
the "general" method taught for polygons a compass alone cannot build (a heptagon, notably).

**Duplicated from Topic 1.1** (`../graphics_diploma_module_1_topic_1_1_basic_constructions`),
which established this syllabus track's scaffold shape (RULES.md §1.4's manual-copy discipline,
no shared library). Also carried forward Topic 1.2's `renderConstruction.js` `'circle'` step
kind, Topic 1.4's `'angledim'` step kind, and `viewTransform.js`'s `ensureVisible()` — all
already generic.

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
Topic 1.1 (§2). The n-switcher (§3) is new, narrower than Topic 1.4's method switcher — see below.
Strategic context (persona, principles, accessibility commitments) lives in the root
`../PRODUCT.md`.

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, n-switcher, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## Architecture — 2D SVG orchestrator (ADR-078, invoked-by ADR-025)

Same discipline as Topics 1.1-1.4: one orchestrator (`src/main.js`) owning state and a single
`rebuild()` funnel, single-purpose leaf modules that never import each other, inline SVG (no
Three.js, no import map). See Topic 1.1's own CLAUDE.md for the full rationale; only what this
topic adds or changes is recorded here.

### Pairing: why two picker-pairs, not two toggles

This topic's own audit (before any file was written) considered both of the platform's existing
pairing patterns and picked deliberately:
- **Topic 1.2's pattern** — ONE construction, a live `mode` toggle rebuilding the SAME two
  circles both ways (external/internal). Fits when the two readings are genuinely the same
  drawing, flipped.
- **Topic 1.3's pattern** — TWO separate picker items, each its own principle text. Fits when the
  two techniques are genuinely different constructions that merely share a base shape.

Incircle vs. circumcircle use angle bisectors vs. perpendicular bisectors — different
techniques, same triangle. Superscribe vs. inscribe use tangent lines vs. diameter-division —
different techniques, same circle. Both pairs match **Topic 1.3's shape**, not Topic 1.2's:
four picker items, not two toggled constructions. Step 1's lead copy and each pair's principle
text cross-reference their partner explicitly so the pairing still reads as intentional, not
four unrelated constructions.

### What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/viewTransform.js` | EXTRACTED (from Topic 1.2/1.4) | Pure viewBox pan/zoom + `ensureVisible()` |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.4, incl. `'circle'` and `'angledim'` kinds) | This topic uses full given/result circles AND angle marks (the incircle/circumcircle's own angle facts, the superscribed polygon's interior angle) — both kinds Topic 1.4 already built, no further change needed |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic. superscribe-polygon's `n` rides as a numeric-STRING id ('4'/'6'/'8'/'12'); JS's `'8' - '8' === 0` coercion means `matches()` needed no change at all, unlike Topic 1.2's genuinely non-numeric `mode` |
| `src/main.js` | EXTRACTED + **one narrow addition** | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. **Added**: `defaultsFor()` sets `params.n` ONLY when `construction.nChoices` exists (today, only superscribe-polygon) — narrower than Topic 1.4, where every construction got a `method` default |
| `src/uiManager.js` | EXTRACTED + **one narrow addition** | Slider-building loop, reset-confirm, result sync unchanged. **Added**: `renderNSwitcher()`/`syncNSwitcher()` — same mechanics as Topic 1.4's method switcher, but gated on `con.nChoices` existing (optional), not assumed present. **Changed**: `principle` is called as a function when the active construction's is one (superscribe-polygon, inscribe-polygon) or read as a plain string otherwise (incircle-triangle, circumcircle-triangle) — this topic's four constructions genuinely differ here, unlike Topic 1.4 where all three used the function form |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: incircle, circumcircle, tangent, constructible (constructible's definition adapted from Topic 1.4's, now foreshadowing the heptagon's own non-constructibility rather than just naming it) |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS[0]` lead text says "four" constructions, titled "Choose a Relation" |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry. New primitives this topic needed and no prior topic did: `angleBisectorAt` (Topic 1.1's bisect-angle, generalized to any vertex/ray pair — a triangle's own angles are never a convenient fixed value), `perpendicularFootFromAbove` (Topic 1.1's perpendicular-off-line, pulled into a reusable helper), `tangentAtPoint` (perpendicular to a radius AT a point ON a circle, extending both ways into a full tangent line — no prior topic drew a tangent to a full circle from a point on it), `divideSegment` (Topic 1.1's divide-line, pulled into a reusable n-part divider), `rayCircleFar` (Topic 1.4's ray-extension technique, reused for inscribe-polygon) |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) — 5 seeded problems plus the CONTEXT's optional advanced capstone chaining Topic 1.1's line-division technique (152 mm ÷ 4:6:5) into this topic's incircle construction |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3, new) | Token table reused unchanged; §3 documents the (narrower) n-switcher |

### A note on precision — verified, not asserted (RULES §6.6)

Before writing `constructions.js`, this topic's build numerically verified (Node, this session)
which of its two circle→polygon techniques is exact and which is approximate, rather than
assuming textbook language ("the general method") meant "exact but general":

- **`superscribe-polygon`** is EXACT for every n it offers (4, 6, 8, 12) — max measured side/angle
  deviation 0.0000% across hundreds of random samples. Angle bisection and perpendicular
  tangency are both exact operations.
- **`inscribe-polygon`**'s general diameter-division method is EXACT only for n = 3, 4, 6 (0.000%
  deviation); for n = 5, 7, 8, 9 it is a genuine approximation (0.4-3.0% side-length deviation
  measured, worst at n = 9). The construction draws the REAL constructed points — it does not
  silently substitute a mathematically perfect polygon — and `resultText`/`principle()` say so
  explicitly ("general method — a close approximation") rather than implying exactness. This is
  exactly why a regular heptagon is the sharper of the two seeded "inscribe" problems: it is not
  buildable exactly by ANY compass-and-straightedge method (Gauss–Wantzel), so the small,
  honestly-reported approximation here is the textbook's own answer, not a shortcut this build
  introduced.

## The four-step shape (every construction uses the same shape)

Unchanged from Topics 1.1-1.4 — Choose (a 4-item picker) → Given → Construct (n-switcher when
applicable + Play/Replay) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`
  (same tier as Topics 1.2-1.4).
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_1_5_polygon_circle_relations/
├── index.html              ← SVG viewport + wizard shell, platform CSS tokens inline, no import map
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + n-switcher (new)
├── assets/fonts/                ← bundled woff2 (byte-identical to the platform set)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy — renderer-agnostic)
    ├── viewTransform.js             ← pan/zoom + ensureVisible() over the SVG viewBox (byte-copy)
    ├── stepper.js                     ← guided-step controller (4-step shape + picker step)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders + the (optional) n-switcher
    ├── problems.js                            ← Problem Library data (tiered)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 4 constructions' pure geometry
    ├── renderConstruction.js                        ← draws a recipe into the SVG (circle + angledim kinds)
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

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 1.5 — Polygon-Circle Relations ·
2D SVG orchestrator (ADR-078) · scaffold duplicated from Topic 1.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
