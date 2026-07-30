# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 2.3: Helix

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**. This is that track's Module 1, Topic
> 2 ("Miscellaneous Curves", ADR-079) — subtopic 2.3, the third and LAST of three (2.1 Roulettes,
> 2.2 Spiral Curves, both built). Namespaced `graphics_diploma_module_1_topic_2_3_helix`.

Three helix constructions — cylindrical helix, conical helix, helical spring — sharing one 3D
point generator and a right/left-hand toggle. **Duplicated from Topic 2.1**
(`../graphics_diploma_module_1_topic_2_1_roulettes`), audited file-by-file before copying, not
assumed (see the EXTRACTED/INFERRED table below).

## Project-wide documentation (read before cross-module tasks)

Per **ADR-078**, this syllabus track **shares this repo's root docs and ADR sequence**. Before
starting any task that touches shared behavior, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — ADR log; this topic's own decisions recorded under ADR-078/079/**080**
- `../RULES.md`        — what you must and must not do (enforcement)
- `../DESIGN.md`       — color tokens, typography, component standards
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** every colour, spacing, and type value is a token from `../DESIGN.md` —
never hard-code a hex or a raw pixel/rem literal (RULES.md §4.1).

**Scope boundary:** this module produces a self-contained simulation payload — the 2D viewport
plus its parameter dock, sliders, toggles, inline hints, and sim-internal animations. The host
Simatrix website (navbar, module browser, account UI, marketing chrome, login) is out of scope.

---

## ADR-080: 2D two-view construction, not a 3D orbit scene — read this before touching the geometry

A helix is a genuine 3D space curve. This topic stays on the Diploma track's 2D SVG orchestrator
anyway — **ADR-080** records the full reasoning (weighed explicitly, not defaulted into): the
underlying math in `constructions.js` is honestly 3D (`spacePoint(theta, cfg)` returns real
`{x, y, z}`), and only the *rendering* is two first-angle orthographic projections of that curve —
exactly Example 7.11's own textbook method, not a compromise forced by staying 2D. A Three.js 3D
orbit build was considered and rejected: it would be the only Three.js dependency anywhere in this
15-topic track, needs its own RULES §1.11/ADR-025 template-choice ADR, and would likely still need
this same 2D construction built alongside it to actually teach the drawing procedure.

**If you are extending this topic (a fourth construction, a new view), do not silently reach for
Three.js** — that decision has already been made and recorded; revisiting it needs a new ADR of
its own, the same way ADR-080 amended ADR-078's premise rather than silently overriding it.

## The two-view layout — one shared scale, deterministic not sampled

`fitTwoView(maxRadius, heightSpan)` computes ONE scale and ONE horizontal (x) origin for both the
front view (x horizontal, z vertical — axial height) and the top view (x horizontal, y vertical —
depth), so a vertical projector line between a top-view division point and its front-view point is
literally vertical, not merely close. Unlike Topic 2.1/2.2's `fitTransform()` (which derives scale
from a *sampled* bounding box of curve points), this topic's scale comes from **exact, known
quantities** — a cylinder's radius and total height, a cone's base radius and lead, a spring's mean
radius plus wire radius — since every construction's true extent IS one of its own given
parameters, not something that needs discovering by sampling. This is a stronger safety guarantee
than the sampled-bbox approach, not a weaker one: nothing can be drawn outside what the layout
already accounts for, by construction.

**The one thing this discipline requires of any new construction added here:** if you add
geometry that reaches beyond the bare curve's own radius/height (Topic 2.2's own lesson, learned
the hard way with the polar-subtangent construction it rejected for exactly this reason) — the way
the spring's wire circles reach `wireRadius` beyond the mean radius — widen the `maxRadius`/
`heightSpan` passed to `fitTwoView()` to include it, the way `buildSpring()` passes `R + w` and
`heightSpan + w`, not the bare `R`/`heightSpan`. Verified empirically: the very first numeric sweep
across all three constructions came back at zero OOB, because this was done up front, not
discovered after an overshoot.

## The shared 3D generator

**One function, `spacePoint(theta, cfg)`**, covers both the cylindrical and conical case — the
`cfg.kind` only changes whether the radius is constant (`cylindrical`) or linearly tapers with
height (`conical`, `r = r0 * (1 - z/coneHeight)`), the cone's own straight-line profile. The
helical spring reuses this same function for its centreline (`kind: 'cylindrical'` at the coil's
mean radius). Right/left-hand (`cfg.hand`) mirrors the rotation direction (`y = ±r*sin(theta)`)
while keeping the axial advance direction the same, so "left-hand" doesn't also flip which end is
"up."

**A consequence worth knowing:** the cylindrical helix's TOP view is always just the base circle
retraced (every division has the same radius) — no curve is drawn there, only division dots on the
given circle. The conical helix's top view is a genuine shrinking spiral (radius falls with
height), so it DOES need its own drawn curve there, unlike the cylindrical case. This isn't an
inconsistency between the two constructions — it's the correct, different-shaped output of the
same one generator, and `buildConical()`'s own `topCurveSteps()` (absent from `buildCylindrical()`)
exists specifically because of this real geometric difference.

## The helical spring's wire thickness — an exact tangent construction, not an approximation

The two "curves tangential to circles... at each point" the source text describes are computed as
the centreline offset by exactly the wire radius, **perpendicular to the exact closed-form
front-view tangent direction** (`frontVelocity()`) at every sampled point — not a simple vertical
shift (which was the first, rejected design: correct-looking but not actually tangent to anything).
This is exact, not approximate: at every point where the centreline crosses the front-view
silhouette (`theta = k*pi`, where the tangent is purely vertical by symmetry), the perpendicular
offset lands exactly `wireRadius` horizontally away with zero vertical component — i.e., exactly
tangent to a wire-diameter circle centred on the centreline at that point. Verified numerically
during this topic's build (worst-case error `1.4e-14`, floating-point noise, not approximation
error). The wire cross-section circles drawn at those silhouette crossings are not decorative —
they are literally the circles the two offset curves are proven tangent to.

## The originated conical-helix numeric example

The source chapter's Fig 7.14 gives the concept and a figure, but no fully worked numeric example
— unlike Example 7.11 (cylindrical) and Example 7.12 (spring). Originated one consistent with
those two examples' own numeric style: **60 mm base diameter, 90 mm cone height, 45 mm lead** (half
the cone height, so the helix comfortably completes its one turn well short of the apex — no edge
case, no near-degenerate cone). `DIVISIONS_CONICAL = 8`, matching the source's own "1/8 lead per
division" phrasing directly, rather than reusing the cylindrical case's 12.

## What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/problemLibrary.js` | EXTRACTED (from Topic 2.2, which already added the string-equality `matches()` branch) | This topic's cylindrical-helix problem targets `hand` (a string) — the same need Topic 2.2 already solved |
| `src/renderConstruction.js` | EXTRACTED (from Topic 2.1) + **one addition** | The `'curve'` kind gained an independent `dashed` flag for hidden-line convention — a different axis from `role`, see this topic's DESIGN.md §3 |
| `src/viewTransform.js` | EXTRACTED + **canvas resized** | `BASE_W/H` grew to `220×280` — TALLER than Topic 2.1/2.2's `240×190`, since this is the first topic stacking two views in one viewport instead of drawing one |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS` lead text — 3-item picker, Construct step mentions both views building together |
| `src/uiManager.js` | EXTRACTED (from Topic 2.1) + **one addition** | Slider loop/reset-confirm/result-sync all generic. **Added** a `#hand-toggle` control (Topic 1.2's simpler always-visible pattern — NOT Topic 2.2's field-filtering variant, since hand never changes which fields exist) |
| `src/main.js` | EXTRACTED (from Topic 2.1/2.2) + **one addition** | Orchestrator/simController/render-loop/simAPI/`playRollAnimation()` all unchanged — the two-phase roll animation only depends on `lastRecipe.animateRoll`; this topic's `tangentStepsAt()` always returns `[]` (no second phase), a harmless no-op main.js needs no special-casing for. **`defaultsFor()`** also seeds `hand: 'right'` |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry — the shared 3D generator, the two-view layout, the spring's exact offset construction, all described above |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged) |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: helix, pitch, lead, right-hand, first-angle |
| `meta.json`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific; viewBox `220×280`; 3-item picker; `#hand-toggle` markup |
| `DESIGN.md` (appendix) | EXTRACTED (§2 tokens from 2.1, §4 toggle from 1.2/2.2, byte-for-byte) + INFERRED (§3, new) | Hidden-line convention is new |
| `../DECISIONS.md` ADR-080 | INFERRED (new) | The 2D-vs-3D architecture decision, recorded explicitly per the CONTEXT's mandatory decision gate |

### Cross-topic note for the eventual 2.1-2.3 cleanup pass

All three Misc Curves topics now exist. Worth a follow-up pass: Topic 2.1/2.2 compute their
`fitTransform`/scale from a *sampled* bounding box of curve points; this topic computes
`fitTwoView`'s scale from *exact* known extents instead (see above) — both are safe (verified
zero-OOB in each topic), but they're two different techniques solving the same problem, and a
future contributor extending any of the three should know which pattern that topic actually uses
before assuming the other one applies.

## The four-step shape (every construction uses the same shape)

Unchanged in structure — Choose (a 3-item picker) → Given (hand toggle, then that construction's
measurements + the Sweep Angle slider) → Construct (Play/Replay; the same slider still scrubs live
from the Given step) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`.
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_2_3_helix/
├── index.html              ← SVG viewport (220×280, two stacked views) + wizard shell
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: tokens/toggle (reused) + hidden-line convention (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-082)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy)
    ├── viewTransform.js             ← pan/zoom over the SVG viewBox (220×280)
    ├── stepper.js                     ← guided-step controller (4-step shape + 3-item picker)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders + hand toggle
    ├── problems.js                            ← Problem Library data (tiered, hand-aware target)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy from 2.2)
    ├── constructions.js                           ← the 3 helices' pure geometry (shared 3D generator)
    ├── renderConstruction.js                        ← draws a recipe into the SVG (+ dashed curves)
    └── main.js                                        ← orchestrator (+ hand default)
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the SVG
  directly (RULES §3.2, re-expressed for this substrate).
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1–§6.3) — including a string-valued target (`hand`), never preset.
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 2.3 — Helix · LAST topic in the
Misc Curves set (ADR-079) · 2D SVG orchestrator, 3D math (ADR-078/ADR-080) · scaffold duplicated
from Topic 2.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
