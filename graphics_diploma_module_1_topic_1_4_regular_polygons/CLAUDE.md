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
| `src/viewTransform.js` | EXTRACTED (from Topic 1.2) + **diverged, ADR-145 / ADR-155** | Pure viewBox pan/zoom + `ensureVisible()`. **Added (2026-08-09)**: arrow-key pan, `+`/`-` zoom, `0` reset on the same `viewportEl` keydown target — the drawing was previously reachable by pointer/touch only (RULES §4.12). **Added (2026-08-10, ADR-155)**: `fitToBounds(bounds, {margin, maxZoom})` — the unconditional zoom-in-or-out core, lifted out of what was `ensureVisible()`'s own tail (that function now just delegates to it at the uncapped `MAX_ZOOM`, unchanged behaviourally); a `userAdjusted` flag (set by any manual wheel/pinch/drag/arrow-key move, read via `hasUserAdjusted()`, cleared only via `clearUserAdjusted()`); and an `onResetRequest` third constructor param so dblclick/`0` route through a caller's content-aware reset instead of the raw `resetView()` box |
| `src/onboarding.js` | EXTRACTED | Fully generic; its localStorage key is track-scoped, not topic-scoped |
| `src/renderConstruction.js` | EXTRACTED (from Topic 1.2, incl. its `'circle'` kind) + **diverged, ADR-145** | This topic's given/auxiliary circles reuse the `'circle'` kind Topic 1.2 added. `assignLabelPositions()` was exported (already existed, internal-only) so `main.js` can pre-resolve label positions once over a full move/result array — Step Through needs this (see below). **ADR-145 (2026-08-09) rewrote it further, no longer a byte-shared file with Topic 1.2's copy**: it now also resolves `'dim'`/`'angledim'` labels (previously fixed-position, collision-blind) against a shared obstacle set that samples line/arc/circle ink, not just marker dots; `buildStepNode()` splits every step's ink and label into separate returns so `renderStatic()`/`playSteps()` can route them into always-on-top `[data-layer="labels"]` vs `[data-layer="ink"]` sub-groups (via `ensureSublayers()`), and stamps `data-role` on ink nodes for `index.html`'s post-construction de-emphasis fade. **ADR-152 (2026-08-10) extended the stamp to label `<text>` nodes too** (`'point'`/`'dim'`/`'angledim'`) — previously only ink faded on `.is-complete`, leaving move-role labels (e.g. Perpendicular Bisector's ladder numbers) stranded at full opacity next to their now-faded dots; same ADR also extended `buildPerpendicularBisector()`'s drawn bisector line to actually reach the ladder points it labels, previously truncated to the compass-arc crossings only. **Added (2026-08-11, ADR-159)**: `PLAY_BUDGET_MS`/`MIN_STEP_MS` — `playSteps()` now sums `durationFor()` across whatever step list it was handed and scales every step's duration down if the total exceeds the budget, applied identically to every call (Play's whole-recipe call and Step Through's one-slide call are not special-cased) — see DESIGN.md §8 |
| `src/problemLibrary.js` | EXTRACTED | Picker + persistent active-problem header + `matches()` self-check are generic. `matches()` does plain numeric subtraction per key — `method` is deliberately never a `target` key, same limitation Topic 1.2's `mode` had |
| `src/onboarding.js`, `src/anim.js` | EXTRACTED | as above |
| `src/main.js` | EXTRACTED + **additions** | Orchestrator/simController/render-loop/simAPI/wizard-toggle/verify-actions unchanged. **Added**: `defaultsFor()` sets `method: construction.methods[0].id` — each construction's OWN first method, not a fixed constant (pentagon/hexagon/n-gon each declare a different `methods` list, unlike Topic 1.2's single fixed `'external'` default). **Added** (Step Through): `hasSlides()`/`getSlides()`/`revealSlide()`/`showStepsUpTo()` on `simController`, plus `lastRecipe.resolvedMoveResult` cached in `rebuild()` — see below. **Added (2026-08-09, ADR-145)**: `setComplete()` toggles `.is-complete` on `#dynamic-layer` at the start/end of every redraw path (`rebuild()`, `play()`, `revealSlide()`, `showStepsUpTo()`), driving the post-construction move-role fade; `rebuild()` also keeps `#construction-svg`'s `aria-label` in sync with the active construction's `resultText`. **Added (2026-08-10, ADR-155)**: `defaultFit()`/`resetFit()` (module-2 `development_of_surfaces` precedent, capped at `DEFAULT_FIT_MAX_ZOOM = 1.6` — see viewTransform.js row) — `rebuild()`'s tail calls `defaultFit()` whenever `!viewTransform.hasUserAdjusted()`, and the three `viewTransform.resetView()` call sites (`selectConstruction()`, `reset()`, `loadProblem()`) are now `resetFit()`. **Added (2026-08-11, ADR-159)**: `play()` now takes `{ onComplete }`, chained inside its existing completion callback, mirroring `revealSlide()`'s own shape; new `skipToEnd()` on `simController` is a one-line wrapper over the existing `showStepsUpTo(fullLength)` — no new render path |
| `src/uiManager.js` | EXTRACTED + **additions** | Slider-building loop, reset-confirm, result sync unchanged. **Added**: `renderMethodSwitcher()`/`syncMethodSwitcher()` — see below. **Changed**: `principle` is now called as a function (`con.principle(method)`), since which derivation is active changes the explanation, not just static text. **Added** (Step Through): the N-Gon-only slide-index state machine (`goStepNext`/`goStepBack`/`renderStepThrough`) — see below. **Added (2026-08-11, ADR-159)**: `playInFlight`/`playAllInFlight` flags — `#btn-play-construction` and `#btn-play-all` relabel to "Skip to end" while their animation runs and call `sim.skipToEnd()` instead of restarting silently; `renderStepThrough()` gained a `playAllInFlight` branch so Step Through's caption/Back/Next stay truthful while Play All runs, and the `stepIdx = slideCount() - 1` write moved from Play All's click handler to its `onComplete` (previously set on click, before the drawing had actually finished — E15) |
| `src/terms.js` (mechanics) | EXTRACTED | Hover/focus/popover positioning is generic |
| `src/terms.js` (data) | INFERRED | New `TERMS`: regular polygon, circumcentre, apothem, constructible |
| `src/stepper.js` (mechanics) | EXTRACTED + **addition** | Four-step shape, rail rendering, `restart()`/`goToGivenStep()` unchanged. **Added (2026-08-10, ADR-154)**: `renderNote()`, called from `goToStep()` and `sync()`, fills `#step-note` from the active construction's `notes.given`/`notes.construct` and hides it on Choose/Verify |
| `src/stepper.js` (copy) | INFERRED | `STEPS[0]`/`STEPS[2]` lead text (construction count; mentions choosing a method) |
| `src/constructions.js` | INFERRED (new) | Entirely new geometry. Shared ground truth: `regularPolygonVertices(A,B,n)` — every method derives the SAME circumcentre/vertices by a different route, verified programmatically (all methods produce byte-identical vertex sets). N-Gon's two `build()`s additionally return `slides` (Step Through's slide-boundary metadata) — see below. **ADR-145 (2026-08-09)**: each construction's raw geometry now lives in a standalone `xRaw(params)` function (`pentagonRaw`/`hexagonRaw`/`ngonRaw`, true side-length units, no clamp); `build(params)` is a thin wrapper calling `centerAt(xRaw(params).steps, calibratedScale(id, xRaw, given, methods))` — a construction-wide fixed scale (calibrated once, cached, from the worst-case param combo across every method) plus a per-call recentre, replacing three separate hard-coded anchors + per-shape scale ceilings that used to freeze the drawing's growth past a threshold. `applyOutwardHints()` fills in a real outward-from-circumcentre label hint for every labelled point that didn't already carry one. **Added (2026-08-10, ADR-154)**: each `ConstructionDef` gains `notes: { given, construct(method) }` — short K.C. John-Ch.5-cited concept blurbs for the Given/Construct wizard phases, same `(method) => string` shape as the existing `principle()` |
| `src/problems.js` | INFERRED (new) | New `PROBLEMS` array (shape/`groupByTier()` unchanged); pentagon/hexagon appear three/two times each (once per method, per the source's "by all three named methods"), since the self-check can't enforce which method was used — only which numeric side (and n) — hints steer method choice |
| `meta.json`, `CLAUDE.md`, `index.html` (picker/copy) | INFERRED (new) | Topic-specific. **Added (2026-08-10, ADR-154)**: `#step-note` block in `index.html`, between `#step-lead` and the step panels |
| `DESIGN.md` (appendix) | EXTRACTED (§2) + INFERRED (§3-§6, new) | Token table reused unchanged; §3 documents the method switcher, §4-§5 Step Through/de-emphasis, §6 (2026-08-10) the `#step-note` concept blurb |

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

### Step Through (Construct step, N-Gon construction only)

The N-Gon construction's two methods (Semicircle Division, Perpendicular Bisector) additionally
offer a click-gated slide navigator alongside the existing single-animation "Play All" — DEFAULT/
primary in the Construct step for N-Gon, secondary for Play All. **Pentagon and Hexagon do NOT
get this** — their five methods (3 + 2) have no audited slide breakdown, so they keep today's
single "Play construction" button unchanged. `sim.hasSlides()` (true only when the active
recipe's `build()` returned a non-empty `slides` array) is the feature flag `uiManager.js`
branches the Construct-step UI on — not a construction-id check, so this stays correct if the
scope is ever widened without a UI change.

**Slide sourcing — the two methods are NOT equally "sourced", document this distinction
faithfully:**
- **Semicircle Division** slides are a literal match to `polygon.pdf`, a real slide deck —
  verified against its own pentagon(n=5)/hexagon(n=6)/heptagon(n=7) worked examples (slide
  count = n+3 for every n checked). Captions are near-verbatim from those slides.
- **Perpendicular Bisector**'s actual source, *Regular Polygons.pdf* Fig 5.24, is a STATIC book
  page (a 9-instruction numbered list for its own n=8 octagon example) — there is no slide deck
  to match. Its "slides" are the book's own 9 numbered instructions, staged as a designed
  analogue in the same spirit, generalized to any n via the existing `nn===3`/`nn>=5`/`nn>=7`
  branches. Do not read this as a faithful PDF port the way Semicircle Division's slides are.

**Mechanics.** `buildSemicircleDivision()`/`buildPerpendicularBisector()` (`constructions.js`)
each build into a local `methodSteps` array plus a `slides: { caption, startIdx, endIdx }[]`
array via a small `mark(caption, fn)` helper — a slide with zero steps is never recorded, so
Step Through can never land on a content-empty slide (the same principle
`Module2/src/methodController.js`'s `hasVisibleContent()` protects there, applied here as a
structural guarantee since this list is precomputed once, not walked live). Both sources defer
every polygon SIDE to one final "Join…" slide, well after every vertex is found and labelled —
this REQUIRED a real reorder of the existing step-emission code, not just a UI grouping layer:
`walkVerticesByCompass()` (shared by pentagon, hexagon, AND the bisector method) now returns
`{ arcAndLabelSteps, resultLines }` split instead of pushing directly, so callers control the
push order. Pentagon/hexagon's own Play All reveal order changed as a result (sides now drawn
after all arcs instead of interleaved) — verified live, not a regression.

Step Through and Play All share the SAME step array (`resolvedMoveResult`, cached on the recipe
in `main.js`'s `rebuild()`); Step Through just also gets slide-boundary metadata to gate reveals
by. **Accepted, stated cost:** any future edit to a N-Gon method's step array must be verified
against BOTH Play All's flat auto-chain and Step Through's slide-gated click-through — an edit
that only updates one path silently breaks the other.

Cherry-picked from `methodController.js`: flat forward/back index math, spacebar-as-Next (bound
to the Step Through container, not `document`). NOT ported: the Tab-wrap focus-trap /
Escape-to-close — those exist there because Show Method is a full-viewport MODAL takeover with
something to trap into and exit from; Step Through is an inline widget in the existing Construct
panel with nothing to escape from, and trapping Tab here would block reaching Back/Reset in the
step-card footer.

**Next vs. Back are asymmetric by design.** Next (`simController.revealSlide()`) plays the new
slide's own steps through the existing animated tween (`playSteps()`) — but first re-renders
everything BEFORE that slide statically (`renderStatic()`), because a Next click can land before
the PREVIOUS slide's own draw-on animation finished; cancelling an in-flight tween freezes it at
a partial `t` with no way back to its finished state, so skipping this step would let a rushed
click leave a permanently stuck partial arc/line behind (reproduced live during verification,
fixed as described here). Back (`simController.showStepsUpTo()`) is a plain instant redraw of
everything through a given point — a state jump, not a construction move, so it never animates.

## The four-step shape (every construction uses the same shape)

Unchanged from Topics 1.1-1.3 — Choose (a 3-item picker) → Given → Construct (method switcher +
Play/Replay, or — N-Gon only — method switcher + Step Through/Play All) → Verify (recaps the
active method alongside the given values).

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
    ├── uiManager.js                         ← given-value sliders + the method switcher +
    │                                           Step Through's slide-index state (N-Gon only)
    ├── problems.js                            ← Problem Library data (tiered)
    ├── problemLibrary.js                        ← Problem Library modal + self-check (byte-copy)
    ├── constructions.js                           ← the 3 constructions' pure geometry, N methods
    │                                                 each; N-Gon's two build()s also emit `slides`
    ├── renderConstruction.js                        ← draws a recipe into the SVG (incl. 'circle'
    │                                                   kind); assignLabelPositions() exported
    └── main.js                                        ← orchestrator; simController's Step Through
                                                           surface (hasSlides/getSlides/revealSlide/
                                                           showStepsUpTo)
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
