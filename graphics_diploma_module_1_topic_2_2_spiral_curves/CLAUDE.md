# CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 2.2: Spiral Curves

> **Syllabus track:** "Diploma Engineering Graphics" **[PLACEHOLDER — exact syllabus/issuing-body
> name not yet confirmed; see `../DECISIONS.md` ADR-078]**. This is that track's Module 1, Topic
> 2 ("Miscellaneous Curves", ADR-079) — subtopic 2.2, the second of three (2.1 Roulettes, built;
> 2.3 Helix, not yet built). Namespaced `graphics_diploma_module_1_topic_2_2_spiral_curves` (the
> repeated `1` is deliberate: module 1, subtopic 2.2 — ADR-078's own note on this pattern).

One construction — the spiral engine — covering two growth laws via a toggle: the Archimedean
spiral (radius grows by a fixed amount per radian) and the logarithmic/equiangular spiral (radius
grows by a fixed ratio per fixed angle step). **Duplicated from Topic 2.1**
(`../graphics_diploma_module_1_topic_2_1_roulettes`), audited file-by-file before copying, not
assumed (see the EXTRACTED/INFERRED table below).

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

## The engine — one construction, one polar function, a growth-law toggle

Unlike Topic 2.1 (12 picker entries sharing 2 generators), this topic is **one construction
(`id: 'spiral'`)** with a `mode` toggle — the source chapter's own framing ("compare the two
growth laws directly rather than learning two unrelated tools") pointed at this shape, not
Topic 2.1's "many named entries" shape. `mode` rides `state.params`/`commit()` like any value but
is deliberately **not** in `given[]` — the same pattern Topic 1.2 established for its internal/
external tangency toggle (a two-state named choice, not a numeric slider).

**The math.** Both curves are one polar function `r(theta)` differing only in growth law:
- Archimedean: `r(theta) = Rmin + k*theta`, `k = (Rmax-Rmin)/2*pi` — exactly Example 7.8's
  "constant of the curve," surfaced in the result readout.
- Logarithmic: `r(theta) = Rmax * ratio^((theta - 2*pi)/stepAngle)` — algebraically the same
  `r = a*e^(b*theta)` form every calculus text gives the equiangular spiral, anchored at the
  OUTER radius (`Rmax`, at one full convolution) since that's how the source chapter states the
  example ("greatest radius 108 mm"), not the unstated inner one.

One convolution only, both growth laws — both worked examples (7.8, 7.10) are one convolution;
not exposed as a param, to avoid unrequested scope beyond what was asked.

**Tangent/normal — one routine, not two.** The general polar-tangent fact
`tan(alpha) = r / (dr/dtheta)` applies to ANY `r(theta)`, so `dr/dtheta` (constant `k` for
Archimedean; `r * ln(ratio)/stepAngle` for logarithmic) is the only thing that differs between
the two laws' tangent/normal construction. A build-time numeric check confirmed the logarithmic
law's defining "equiangular" property directly from this formula: `alpha` comes out CONSTANT
across every sampled `theta`, which is exactly what "equiangular" means — not assumed, verified.

**Why no literal polar-subtangent triangle is drawn.** The classical hand-drafting method
constructs `T` — the intersection of the tangent with the line through the pole perpendicular to
the radius vector, at distance `r^2/(dr/dtheta)` (the "polar subtangent") — and reads the tangent
off `MT`. That's mathematically exact, but for the Archimedean spiral at its outer radius, `k` is
small (rMax and rMin close together relative to `2*pi`), so the subtangent can run to **several
hundred millimetres** against a ~100mm curve. Drawing it at true scale would force the whole
canvas to shrink to illegibility to fit one auxiliary line. Instead: the tangent direction comes
straight from the exact closed-form velocity vector (no numeric differentiation, no need to
construct `T` geometrically), drawn as a short bounded-length segment through `M` (Topic 2.1's own
"fixed local-length reach" pattern), with a small angle-arc showing `alpha` directly — the same
underlying fact, at a bounded, always-safe size. This bbox-inclusion discipline (worst-case
tangent/normal reach folded into the SAME bbox that derives scale, computed at `theta = 360°`
since `r()` is monotonic increasing for both growth laws) is Topic 2.1's own fix for this exact bug
class, applied here before any drawing happened, not discovered after an overshoot.

## Explicitly out of scope: Exercise 7.9 (the oscillating lever)

The source chapter's Exercise 7.9 — a 120mm lever oscillating through 30°/60°, tracing the locus
of a particle sliding along it — is **not a spiral**. It's a moving-point-on-a-swinging-lever
locus, not a pole-centred growing-radius curve; neither growth law models it, and it doesn't
obviously belong to Topic 2.1 (Roulettes, a rolling-without-slipping mechanism) or the planned
Topic 2.3 (Helix) either. Left out of `problems.js` deliberately, not silently dropped — it may
belong to a "Loci of Moving Points" category this track's provisional 3-topic Misc Curves set
doesn't currently have a home for. Flagging for a future scoping decision, not making one here.

## What copied verbatim (EXTRACTED) vs. what's new (INFERRED)

Audited file-by-file before building, not assumed:

| File | Status | Why |
|---|---|---|
| `src/anim.js` | EXTRACTED | Renderer-agnostic tween engine, no construction knowledge |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED | Topic 2.1's `'curve'`/`'circle'` step kinds already cover everything a spiral needs — no new primitive required |
| `src/viewTransform.js` | EXTRACTED + **one constant carried over** | `BASE_W/H` stays Topic 2.1's `240x190` (not Topic 1.1's `200x140`) — a logarithmic spiral's greatest radius runs to 150mm, needing the same headroom |
| `src/stepper.js` (mechanics) | EXTRACTED | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged |
| `src/stepper.js` (copy) | INFERRED | `STEPS` lead text — "one engine, two growth laws," Given step mentions picking a law first |
| `src/problemLibrary.js` | EXTRACTED + **one addition** | Picker + persistent header + hint reveal all generic. **`matches()` gained a `typeof target[key] === 'string'` branch** — every prior topic's problem targets are pure numbers, but this topic's problems also target `mode` (a string); the untouched numeric branch keeps every other topic's problems working exactly as before |
| `src/uiManager.js` | EXTRACTED + **two additions** | Slider-building loop, reset-confirm, result sync all generic. **(1)** `renderGivenFields()` filters `con.given` by the active `mode` (each entry optionally tagged `modes: [...]`) — a field for the OTHER growth law simply isn't rendered. **(2)** a `#mode-toggle` control (Topic 1.2's pattern), placed on the GIVEN step here (not Construct, where Topic 1.2 put it) — this topic's toggle changes which fields exist, so it has to resolve before the fields render |
| `src/main.js` | EXTRACTED + **one addition** | Orchestrator/simController/render-loop/simAPI/`playRollAnimation()` all unchanged from Topic 2.1 — the two-phase roll animation only depends on `lastRecipe.animateRoll`, which this topic's `constructions.js` provides in the same shape. **`defaultsFor()`** also seeds `mode: 'archimedean'` (Topic 1.2's pattern) |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry — the one shared polar engine described above |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged); Exercise 7.9 deliberately excluded (see above) |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: pole, radius vector, convolution, Archimedean spiral, logarithmic spiral |
| `meta.json`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific; **one-item picker** (the spiral engine covers both laws internally) — kept as a picker for structural consistency with every other topic's wizard rather than special-casing a 3-step variant |
| `DESIGN.md` (appendix) | EXTRACTED (§2 construction-line tokens from 2.1, §3 mode-toggle from 1.2, byte-for-byte) + INFERRED (§4, new) | Tangent/normal visual spec is new |

## The four-step shape (every construction uses the same shape)

Unchanged in structure from every prior topic — Choose (a 1-item picker) → Given (growth-law
toggle, then that law's measurements + the Roll Angle slider) → Construct (Play/Replay; the same
slider still scrubs live from the Given step) → Verify.

## Platform contract (wired here — do not add a second path)

- **`meta.json`** carries all four required fields (RULES §2.11); `difficulty: "intermediate"`.
- **`window.simAPI`** (`src/main.js`) exposes `pause()`/`resume()`/`reset()`; the in-sim Reset
  routes through it only, guarded by the two-state confirm (RULES §2.9, §4.19).
- **Mobile notice**, boot watchdog, and reduced-motion collapse are wired in `index.html`/`main.js`.
- **Self-starting**: `main.js` calls `init()` at module load.

## File structure

```
graphics_diploma_module_1_topic_2_2_spiral_curves/
├── index.html              ← SVG viewport (240×190) + wizard shell, growth-law toggle markup
├── meta.json
├── CLAUDE.md                ← this file
├── DESIGN.md                  ← local appendix: tokens (reused) + toggle (reused) + tangent visual (new)
                                  (no local assets/fonts/ — fonts load from the shared platform host, ADR-082)
└── src/
    ├── anim.js                    ← tween/easing engine (byte-copy)
    ├── viewTransform.js             ← pan/zoom over the SVG viewBox (byte-copy, 240×190)
    ├── stepper.js                     ← guided-step controller (4-step shape + 1-item picker)
    ├── terms.js                         ← inline glossary popovers (topic vocabulary)
    ├── onboarding.js                      ← first-run hints (byte-copy)
    ├── uiManager.js                         ← given-value sliders + growth-law toggle + mode filter
    ├── problems.js                            ← Problem Library data (tiered, mode-aware targets)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (+ string matches())
    ├── constructions.js                           ← the spiral engine's pure geometry
    ├── renderConstruction.js                        ← draws a recipe into the SVG (byte-copy from 2.1)
    └── main.js                                        ← orchestrator (+ mode default)
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; ES module imports with explicit `.js`, relative paths only (ADR-001, RULES §2).
- Single `rebuild()` is the only path for a construction to change; controls never touch the SVG
  directly (RULES §3.2, re-expressed for this substrate).
- Read all colours from CSS tokens — never hard-code hex (ADR-003).
- Problem Library: tiered, hints revealed one at a time, tolerant self-check that never auto-fills
  (ADR-015, RULES §6.1–§6.3) — extended here to a string-valued target (`mode`), never preset.
- A leaf module must not import a sibling leaf — only hang off `main.js` (ADR-007, RULES §3.6).

---

*Diploma Engineering Graphics [placeholder name] · Module 1 Topic 2.2 — Spiral Curves ·
2D SVG orchestrator (ADR-078/ADR-079) · scaffold duplicated from Topic 2.1 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)
