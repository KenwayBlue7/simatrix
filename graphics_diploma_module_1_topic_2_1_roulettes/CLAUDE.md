# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 2.1: Roulettes

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**. This is that track's Module 1, Topic
> 2 ("Miscellaneous Curves", ADR-079) — subtopic 2.1, the first of three (2.2 Spiral Curves, 2.3
> Helix, not yet built). Topic 2 sits **beside** Topic 1 ("Geometrical Constructions") inside the
> same module, per ADR-079 — it is not a new module. Namespaced
> `graphics_diploma_module_1_topic_2_1_roulettes` (the repeated `1` is deliberate: module 1,
> subtopic 2.1 — see ADR-078's own note on this pattern, not a typo).

Twelve roulette/involute curves, taught one at a time: cycloid, superior/inferior trochoid,
epicycloid, superior/inferior epitrochoid, hypocycloid, superior/inferior hypotrochoid, involute
of a circle, involute of a triangle, involute of a square. **Duplicated from Topic 1.1**
(`../graphics_diploma_module_1_topic_1_1_basic_constructions`), which established this syllabus
track's scaffold shape (RULES.md §1.4's manual-copy discipline, no shared library) — audited
file-by-file before copying, not assumed (see the EXTRACTED/INFERRED table below).

## Project-wide documentation (read before cross-module tasks)

Per **ADR-078**, this syllabus track **shares this repo's root docs and ADR sequence**. Before
starting any task that touches shared behavior, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — ADR log; this topic's own decisions recorded under ADR-078/ADR-079
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1).

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## The generator shape — two shared functions, not twelve hardcoded curves

**Generator A — the roulette family** (`rollingCurvePoint()` / `contactPoint()` /
`rollingCircleCenter()` in `src/constructions.js`), covering 9 of the 12 picker entries: cycloid,
superior/inferior trochoid, epicycloid, superior/inferior epitrochoid, hypocycloid, superior/
inferior hypotrochoid. These are genuinely one equation family — a point at signed distance
`offset` from a circle of radius `rollRadius` rolling without slipping on either a straight line
or a fixed circle of radius `baseRadius` — differing only in those three inputs plus which side
of the base circle it rolls on (`baseType: 'line' | 'outside-circle' | 'inside-circle'`).
Hardcoding nine near-identical trig blocks would be pure duplication that drifts (RULES §1.3/
§1.4's shared-logic concern, applied within this one topic's own file, not just across topic
folders). The 9 CONSTRUCTIONS entries are thin config wrappers around this one function, each
exposing only its own textbook-relevant `given[]`.

**Generator B — involute of a circle / a polygon** (`involuteCirclePoint()` /
`involutePolygonArcs()`), the other 3 entries. Deliberately **not** unified with Generator A — an
involute is a taut string unwinding, not a circle rolling on a base; the polygon case isn't a
smooth parametric at all, it's a chain of `n` circular arcs of radii `side, 2·side, ..., n·side`
centred at successive vertices (the textbook's own Example 7.7 method), so it reuses the
**existing** `arc` step primitive with no new geometry engine.

**Shared across both generators:** the classical fact that a roulette's normal at its traced
point always passes through the curve's instantaneous point of contact with its base
(`tangentNormalSteps()`). This is why tangent/normal construction is one routine, not
reimplemented per curve — verified against the specific worked method the source text names for
the cycloid (Example 7.1: an auxiliary arc of the rolling-circle's own radius from the traced
point M, cutting the rolling circle's centre-locus at N, then NC perpendicular to the base —
`showClassicalArc` in `tangentNormalSteps()` renders exactly that sequence for the cycloid
construction specifically; every other curve draws the same MC normal fact more directly, since
the auxiliary-arc's radius only equals the rolling-circle radius in the on-rim cycloid case).

**Why this is 12 picker entries, not fewer:** each named curve keeps its own `id`, `principle`
text (the "why it works" shown on Verify), and its own scoped `given[]` — a superior trochoid
problem shouldn't expose a base-circle radius slider it has no use for. The picker still reads as
12 distinct things to a student; only the geometry underneath is shared.

## The roll angle is a plain slider, not a bespoke handle

Topic 1.6 (ogee curves) introduced a draggable in-viewport handle (`mountHandle()`) because its
one free parameter was tied to a point living *inside* the drawn geometry. This topic's "scrub
the roll angle" ask is different: `theta` is just another scalar, so it rides the **exact same**
`given[]` slider system every other param does (`uiManager.js`, unmodified) — a native
`<input type="range">` is already keyboard-scrubbable (arrow keys, Home/End) with zero new
interaction code. Press Play still animates `theta` from 0 to its max once (the existing
`playSteps()` draw-on, now applied to the `'curve'` step kind); scrubbing the slider directly is
the keyboard-accessible manual control PRODUCT.md §7 requires. `theta` is deliberately **not**
checked by any Problem Library target (`problemLibrary.js`'s `matches()` only iterates a
problem's own `target` keys) — it's a reveal/reading control, not a stated problem parameter.

## What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/uiManager.js` | EXTRACTED | Slider-building loop, reset-confirm, result sync are all generic — `theta` needed no special-casing (see above) |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: roulette, cycloid, trochoid, epicycloid, hypocycloid, involute, generating circle, base circle |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS` lead text — "Choose a Curve," Construct step mentions scrubbing Roll Angle |
| `src/viewTransform.js` | EXTRACTED + **one constant change** | Pan/zoom math unchanged; `BASE_W/H` raised 200×140 → 240×190 — the epicycloid/hypocycloid constructions carry a base circle up to 100mm radius plus the rolling circle's own extent, which doesn't fit the smaller family-default canvas at a readable scale |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.2, not 1.1) + **one addition** | Topic 1.1 itself lacks `'circle'`-kind rendering (it has no circle-drawing construction) — pulled the `circle` case from Topic 1.2, which added it first. **Added a `'curve'` kind** — a sampled polyline for a traced roulette, since no prior topic (1.1–1.6) ever drew a curve that isn't a compass-constructible point/line/arc/circle. Reuses the same stroke-dashoffset draw-on as a line, sized to the polyline's own length. Back-portable to Topics 2.2/2.3 (spiral curves, helix) if they need the same primitive. |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry — the two shared generators described above |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) |
| `meta.json`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific; viewBox `240 190` (not the family default `200 140`) |
| `DESIGN.md` (appendix) | EXTRACTED (§2, byte-for-byte) + INFERRED (§3, new) | Construction-line tokens reused unchanged; the traced-curve visual spec is new |

### Cross-topic scaffold note (flagged during this topic's own Phase A audit)

Topic 1.1, the designated "copy from" reference for this whole syllabus track, lacks `'circle'`-
kind rendering — every later topic (1.2 onward) independently added it locally and consistently.
This topic pulled the addition from Topic 1.2 rather than Topic 1.1, and is itself now the first
topic to add a **second** primitive (`'curve'`) Topic 1.1 doesn't have. If a future topic in this
track is scaffolded directly from 1.1 again without checking 1.2–2.1's additions, it will silently
regress both. Worth folding into the switcher-pattern cleanup pass already deferred after Topic 1.6.

## The four-step shape (every construction uses the same shape)

Unchanged from every prior topic — Choose (a 12-item picker) → Given (measurements + the Roll
Angle slider) → Construct (Play/Replay; the same slider still scrubs live from here) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`.
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_2_1_roulettes/
├── index.html              ← SVG viewport (240×190) + wizard shell, platform CSS tokens inline
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: construction-line tokens (reused) + curve visual (new)
├── assets/fonts/                ← bundled woff2 (byte-identical to the platform set)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy)
    ├── viewTransform.js             ← pan/zoom over the SVG viewBox (BASE_W/H raised to 240×190)
    ├── stepper.js                     ← guided-step controller (4-step shape + 12-item picker)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders incl. Roll Angle (byte-copy)
    ├── problems.js                            ← Problem Library data (tiered)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 12 curves' pure geometry (2 shared generators)
    ├── renderConstruction.js                        ← draws a recipe into the SVG (+ 'circle', 'curve')
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

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 2.1 — Roulettes ·
2D SVG orchestrator (ADR-078/ADR-079) · scaffold duplicated from Topic 1.1 (+ Topic 1.2's circle
rendering) · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
