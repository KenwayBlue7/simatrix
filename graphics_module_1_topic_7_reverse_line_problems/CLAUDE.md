# CLAUDE.md — Simatrix · Finding Angles & True Length (Reverse Line Problems)

Three.js simulation that flips Topic 6's model: instead of dialling sliders to BUILD a line's
projection, the learner is shown a **finished, locked drawing** for a specific textbook problem
and must **guess** one or more of its numeric parameters (true length, θ, φ, and/or the H.T./V.T.
trace positions) by working the construction out for themselves — on paper, or using the same
on-demand **True Length & Angles** / **Traces** constructions Topic 6 offers, now with the
guessed value's digit suppressed so using them doesn't hand over the answer. Ships as a
self-contained payload that runs inside a sandboxed `iframe` on the Simatrix platform.

> **STATUS: NEW TOPIC, Phase B scaffold (2026-08-05).** Full-cloned from
> `graphics_module_1_topic_6_projection_of_straight_lines` (ADR-009's manual copy-and-simplify
> discipline — not shared code, a standalone deploy copy) and reworked for the reverse-guess
> interaction. Carries catalog index **7**, the next free Module-1 slot after
> `graphics_module_1_topic_6_projection_of_straight_lines`. This is NOT a sibling cut from Topic 3
> or Topic 6's own skeleton lineage — it is a direct, full clone of Topic 6 itself, since it needs
> the identical trace/True-Length construction engine, sheet layout, and 3D rig; only the
> interaction layer (what drives the drawing, what the learner types, how the self-check compares)
> was rewritten. See the topic-creation ADR in `../DECISIONS.md` (pending) and this repo's own
> session history for the Phase A investigation that grounded the problem set in actual textbook
> problem types (not invented ones) before any file was cloned.

## What actually changed vs. Topic 6 (read this before assuming Topic 6's docs apply)

- **Unchanged, byte-for-byte from Topic 6:** `anim.js` (shared, ADR-009 — never fork), `lineRig.js`
  and `compareSheet.js`'s core rendering (both gained an additive `hiddenFields` param, geometry
  itself untouched), `sheet2DLayout.js`, `dimensions.js`, `labelPlacement.js`, `labels.js`,
  `labels/*`, `terms.js`.
- **Rewritten for the interaction flip:**
  - `lineData.js` needed **no structural change** — every problem's full `{TL, theta, phi, aHP,
    aVP}` is pre-solved offline (hand-derived from each textbook problem's raw given data, cross-
    checked against printed answers where the book supplies one — see `lineProblems.js`'s header
    comment) and fed through the existing `resolveLine()` unchanged, so the drawing renders exactly
    as if a learner had dialled those values in Topic 6.
  - `lineProblems.js` — 13 problems (N.D. Bhatt, *Engineering Drawing*, Chapter 10, cited by page +
    problem number in each entry's `source` field). Each stores `shapeData` (the full solved state
    that drives the drawing), `givenFields` (shown read-only), `askFields` (the subset of `{TL,
    theta, phi, htDist, vtDist}` the learner must guess — varies per problem, NOT always all five),
    and `target` (the correct value for each `askFields` key). `htDist`/`vtDist` are new fields not
    present in Topic 6's schema — traces are a derived construction, not a driving shapeData
    parameter, so their correct value is computed separately (line ∩ y=0 / line ∩ z=0) rather than
    read off shapeData.
  - `problemLibrary.js` — self-check now compares a separate `guesses` state space (`main.js`'s
    `setGuess`/`getGuesses`/`clearGuesses`) against `problem.target`, narrowed to that problem's own
    `askFields` only. This is a deliberate design change from Topic 6: there, shapeData itself IS
    the live-dialled state being checked; here shapeData IS the answer (needed to render the
    drawing correctly), so checking it against itself would trivially always pass — the learner's
    typed guesses live in their own state instead. Still ±0.5 tolerance (ADR-015, unchanged).
  - **Answer-leak suppression (`hiddenFields`/`askFields`, new mechanism, not in Topic 6):** Topic
    6's rig and sheet always print the TL/θ/φ digit and the H.T./V.T. trace circle wherever they're
    computed — fine when the learner set those values themselves, but here that would print the
    answer next to the guess box. `main.js` builds an `askFields`-derived Set once per rebuild and
    threads it as `hiddenFields` into `createLineRig()`, `compareSheet.setData()`, and — critically
    — into `createTrueLength()`/`createTraces()` when a construction is launched pre-check (so
    using the constructions to derive your own guess doesn't also read off the printed number).
    Geometry (arcs, projector lines, trace markers) always stays visible; only the printed digit is
    swapped for a `?` placeholder. `trueLength.js`'s α/β (apparent-angle) labels are gated too —
    not `askFields` themselves, but since both are a monotonic function of the same θ/φ this
    construction reveals, both labels blank together whenever EITHER theta or phi is hidden
    (closes the back-inference gap without needing the exact α↔θ / β↔φ pairing pinned down).
    **Known residual gap:** `traces.js` has no printed numeric digit for `htDist`/`vtDist` to
    begin with — only the letter tag ("HT"/"VT") is suppressed; the trace marker's actual position
    on the sheet's drafting grid remains visible and countable in grid cells, since hiding it would
    mean hiding the construction's own geometry. Not fixed — would require occluding geometry, a
    different tradeoff than digit-suppression.
  - `uiManager.js` — sliders are GONE. Two panels instead: **Given** (read-only display of the
    problem's `givenFields`) and **Guess** (bare numeric inputs for `askFields`, never pre-filled).
  - `stepper.js` / `lineSteps.js` — Topic 6's 5-step build-up wizard doesn't fit a fixed drawing;
    this topic has exactly **one step** (`solve`) with all controls visible at once: Given panel,
    Guess panel, and both construction launchers.
  - `onboarding.js` — one contextual spotlight (`reverse-flow`) explaining the Given/Guess split on
    first load, replacing Topic 6's three build-up-specific spotlights (which no longer fire —
    nothing in the single-step flow triggered them even before this rewrite).
- **13 seed problems, not all 12/13 possible textbook problems** — three more (10-26/27/28, the
  "true length of a portion in a quadrant" edge cases) were deliberately deferred to a future
  harder tier; their target concept (a segment's TL, not the line's own TL) doesn't fit this
  topic's `askFields` schema cleanly. Two problems (10-5, 10-6) had no printed numeric data in the
  available textbook excerpt (method-demonstration figures only) — this file supplies its own
  consistent instance of the same construction method and says so explicitly in that problem's
  `source` field; the geometry/method is authentic, the specific millimetres are this file's own.

## Project-wide documentation (read before cross-module tasks)
Before starting any task that touches shared behavior, UI patterns,
or cross-module consistency, read these root-level files:
- ../ARCHITECTURE.md  — system map, component breakdown, data flow
- ../DECISIONS.md     — why key decisions were made (ADR log)
- ../RULES.md         — what you must and must not do (enforcement)
- ../DESIGN.md        — color tokens, typography, component standards
- ../PRODUCT.md       — who it's for, features, accessibility commitments

For module-specific work that doesn't touch shared behavior,
reading the root docs is optional but recommended.

**Design system rules:** Always read and strictly follow the consolidated platform design system
at `../DESIGN.md` (Simatrix root) for all colour, typography, spacing, component styling, and
UI/UX decisions — Module 2 is its master/reference implementation. Strategic context lives in the
consolidated root `../PRODUCT.md` (ADR-023). Never hard-code design values in CSS or JS — consume
tokens defined in `../DESIGN.md`. This topic does **not** and must **not** carry a local
`DESIGN.md`/`PRODUCT.md` copy (ADR-028, RULES.md §1.14). The three Lines construction-aid tokens
(`--construct`, `--locus`, `--tl-green` + their `*-ink` text variants) are declared in this
topic's own `index.html` `:root` (they are viewport encodings unique to this topic family, not
shared design-system tokens) — carried over from Topic 6 unchanged.

**Scope boundary:** This module produces a self-contained Three.js *simulation payload* — the 3D
viewport plus its parameter dock, guess inputs, toggles, inline hints, and sim-internal animations.
The host Simatrix website (navbar, module browser, account UI, login, dashboard) is built by
other web developers and is **out of scope** here.

**`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
`{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.

---

## Architecture — Module 2 orchestrator pattern (ADR-033, overturns ADR-011 for this topic)

- **`main.js` is the orchestrator** (ADR-007): it owns the scene, the perspective **and**
  orthographic cameras + their `OrbitControls` (the dual-camera §5.18 stack — quick-views +
  the ADR-036 fold swoop), the single `rebuild()` pipeline (full WebGL disposal contract,
  ADR-004), the render loop, the Compare state machine + the ADR-021 workbench split, the
  Problem Library seam, the `askFields`/`hiddenFields`/`guesses` state (new, see above), the
  **clip-aware auto-zoom** (`reframeIfClipped`, ADR-014), and `window.simAPI`. It is the ONE place
  leaf modules meet (no leaf imports a sibling leaf — RULES.md §3.6).
- **World axes** (Module-1 family convention, unchanged from Topic 6): `HP = XZ plane (y=0)` ·
  `VP = XY plane (z=0)` · `fold line = X axis`. `lineData.resolveLine()` returns signed endpoint
  mm; the draw leaves remap onto these world axes (÷10, ADR-018: 1 world unit = 10 mm). Sheet is
  **44×44 units (440 mm)**, planes OFFSET (not origin-centred) per ADR-079 — see `lineRig.js`'s own
  comment for the full sizing rationale (unchanged from Topic 6, no problem here needs a larger
  ceiling than Topic 6's typed-field worst case).
- **The 3D→2D fold** flies the ADR-036 orthographic swoop (`swoopToAnswerSheet`); held-angle folds
  are FORBIDDEN (RULES.md §5.8). `beforeFold` closes any open construction overlay first.
- **The single-step solve flow** (replaces Topic 6's ADR-017 5-step build-up): one `lineSteps.js`
  step (`solve`), all controls visible together — Given panel, Guess panel, both construction
  launchers — because there is nothing to build up to, the drawing is already complete. Still
  pinned to the general `LineCase.INCL_BOTH` resolver (every seed problem is the general case;
  parallel/perpendicular cases just have θ or φ fixed at 0/90 in that problem's own `shapeData`,
  same as Topic 6's target objects did). Do NOT rename "line AB"/"end A" (§6.15, still applies).
- **Compare / workbench** (ADR-012 / ADR-021 / ADR-037, narrowed by ADR-080): same 50/50 split, same
  `#rail-toggle` floating Hide/Show, same no-`matchMedia`-demotion contract as Topic 6. But
  `WORKBENCH_CONTROLS` now re-parents `['given', 'guess', 'truelength', 'traces']` — the Given/Guess
  panels, NOT per-field sliders (Topic 6's `tl`/`disthp`/`distvp`/`theta`/`phi` controls don't exist
  in this topic). The construction launchers still dock separately in `#con-dock` (`CON_DOCK_CONTROLS`,
  unchanged mechanism from Topic 6).
- **2D Compare vehicle — Three.js ortho sheet, own renderer (ADR-076), unchanged from Topic 6.** The
  Lines 2D drawing + its animated **Traces** and **True-Length** constructions render with the
  fat-line (`Line2`) stack in a dedicated ortho scene (`compareSheet.js`), on its own `WebGLRenderer`
  bound to its own lazily-created `<canvas>` (`ensureSheetRenderer()`). The 2D sheet renders at an
  intrinsic scale locked to the line's own True Length (ADR-075) — `sheet2DLayout.js::layout2D()`
  derives its px-per-mm factor from the resolved line's `M.tl` each call, so every problem's
  drawing fills the sheet regardless of that problem's specific TL.
- **No solid machinery.** Lines draws points/lines, not solids: no shape generators, no
  `meshAnalyzer.js`, no `projectionDrawer.js`, no hidden-line classification.

## File structure (as built)

```
graphics_module_1_topic_7_reverse_line_problems/
├── index.html            ← thin shell (importmap + boot watchdog + canvas + wizard chrome +
│                            Compare card + workbench-rail CSS + construction-aid tokens +
│                            Given/Guess panel markup, replacing Topic 6's slider markup)
├── main.js               ← ORCHESTRATOR (topic root, not src/): scene, the 3D WebGLRenderer (the
│                            2D Compare sheet owns a second, own-canvas renderer — ADR-076), the
│                            dual perspective+ortho cameras, single rebuild()/disposal, the two
│                            CSS2D overlays, Compare/workbench (ADR-037), the ADR-036 fold swoop,
│                            the construction system (now hiddenFields-aware), the guesses state,
│                            window.simAPI
├── meta.json             ← platform metadata (title = "Finding Angles & True Length")
├── CLAUDE.md             ← THIS file
├── CHANGELOG.md          ← this topic's change log (starts from the Topic 6 clone point)
│                          (fonts: @font-face served from Supabase Storage CDN, ADR-086 —
│                           no local assets/fonts/ anymore)
└── src/
    ├── anim.js           ← tween/easing engine, byte-identical to the platform copy
    │  # pure data
    ├── lineData.js       ← defaultLineData / resolveLine / LineCase — UNCHANGED from Topic 6
    ├── lineSteps.js      ← STEPS (ONE step: `solve`) + TERMS
    ├── lineProblems.js   ← PROBLEMS / TIERS / FIELD_LABELS — 13 reverse-guess problems, each with
    │                        shapeData (drives the locked drawing), givenFields, askFields (which
    │                        subset the learner guesses), and target (the correct value per
    │                        askFields key) — see this file's own header comment for the full shape
    │  # shared STATELESS utilities (the genericSolid-style §3.6 exception, imported by several leaves)
    ├── sheet2DLayout.js  ← pure sheet-space layout math (intrinsic TL scale, ADR-075) + trace
    │                        (HT/VT) geometry — UNCHANGED from Topic 6
    ├── dimensions.js     ← the BIS SP 46:2003 Type-B dimension builder — UNCHANGED
    ├── labels.js         ← the CSS2D label factory — UNCHANGED
    │  # 3D content + 2D sheet
    ├── lineRig.js        ← the 3D scene: HP/VP planes + fold hinge, AB + views + projectors, the
    │                        True-Length dimension, all 3D CSS2D labels — gained `hiddenFields`
    ├── compareSheet.js   ← the 2D orthographic sheet — gained `hiddenFields` passthrough
    │  # constructions (animated overlays on the sheet)
    ├── traces.js         ← the animated HT/VT trace construction — gained `hiddenFields` (partial:
    │                        suppresses the HT/VT letter tag only, see the leak note above)
    ├── trueLength.js     ← the 12-phase rotating-line True-Length construction — gained
    │                        `hiddenFields` (suppresses the TL/θ/φ printed digit; α/β not gated)
    │  # workflow chrome
    ├── stepper.js        ← the guided-step controller (now driving a single step, not 5)
    ├── uiManager.js      ← the Given (read-only) + Guess (numeric input) panels, replacing Topic
    │                        6's slider dock; the Reset confirm
    ├── terms.js          ← glossary popovers (imports lineSteps.TERMS) — UNCHANGED
    ├── onboarding.js     ← first-run spotlight (`reverse-flow`, explains the Given/Guess split)
    └── problemLibrary.js ← the Problem Library controller: focus-trapped overlay, entryStep
                             routing, ±0.5-tolerant self-check comparing `guesses` (NOT live
                             shapeData) against each problem's own `askFields` subset of `target`
```

## Non-negotiables inherited from the platform (apply unchanged)

- No build step; CDN ES modules pinned to **three@0.160.0** via the exact import map; `.js`
  extensions on every import; all paths relative (ADR-001, §2.1–§2.5).
- Single `rebuild()` is the only path for geometry change; full disposal contract every rebuild
  (verify `renderer.info.memory` flat across 50 rebuilds — ADR-004, §3.1–§3.5). Any construction
  overlay + the fold sheet dispose through the same contract.
- Read all colours from CSS tokens — never hard-code hex (ADR-003, §4.1).
- `LineMaterial` + `Line2`/`LineSegments2` for all fat linework; keep `resolution` in sync on
  resize / Compare open/close (ADR-006, §3.12–§3.16). Dashed lines need `computeLineDistances()`.
- The 3D pictorial projectors stay DASHED; the 2D orthographic projectors are SOLID Type-B; foot
  markers are thick filled dots (ADR-016, §6.16–§6.18). Do not "fix" these back.
- A new leaf module must not import a sibling leaf (ADR-007, §3.6).

---

*Module 1 Topic — Finding Angles & True Length (Reverse Line Problems) · full-cloned from
`graphics_module_1_topic_6_projection_of_straight_lines` per ADR-009 · Module-2 orchestrator
pattern (ADR-033, overturns ADR-011 for this topic family) · Three.js 0.160.0 · no build tools.*

## Session Digest Protocol
At the end of every session (or when asked), produce a digest in this format:

### SESSION DIGEST — [date] — [feature/task]
**What changed:** (3–5 bullets, concrete)
**Decisions made:** (with brief rationale)
**Patterns introduced:** (reusable code patterns or conventions)
**Open questions / next steps:**
**Files modified:** (list)

## Keeping Root Documents Current

After completing any task, check whether the work involved:
- A non-obvious decision between two real options → add an ADR to ../DECISIONS.md
- A reversed or superseded previous decision → update the relevant ADR status
  in ../DECISIONS.md and add a new one
- A new rule that must be enforced going forward → add it to ../RULES.md
  with its source ADR cited
- A structural change to the codebase (new files, new relationships) →
  update ../ARCHITECTURE.md Section 2 or 3

Do not update these files for routine changes. Only update when the
change has architectural or decision-level significance.
