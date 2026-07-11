# Simatrix — Decisions (ADR Log)

> **What this file is:** A record of WHY key decisions were made. When you encounter something
> and wonder "why is it done this way?", the answer should be here. For WHAT changed and when,
> see CHANGELOG.md. For rules you must follow, see RULES.md (coming next).
>
> **How to add an entry:** When you make a non-obvious decision — especially one where you had
> two real options — add an ADR at the bottom using the template below.

This log records *reasoning*, not history. Several entries below describe decisions that were
**reversed** — both the original choice and the reversal are kept on purpose, so a future
contributor finding only the current code doesn't undo a deliberate change. Where a claim is
grounded in saved session memory it is cited (e.g. *memory: `compare-view-architecture`*); where
it is grounded in the repo it cites the file. Cross-references to `ARCHITECTURE.md` use `§`.

---

## ADR-000: [Template — copy this for a new entry]

**Date:** YYYY-MM-DD (exact if known; "approx." otherwise)
**Decision:** One sentence — what was chosen.
**Why:** The problem it solves or the reason it was the better choice. Be specific — "it was
simpler" is not enough; say what problem the simplicity was solving.
**Alternatives rejected:** What else was considered and why it lost. If you cannot find evidence
that alternatives were considered, write "No alternatives documented."
**Consequences:** What this makes easier or harder going forward. Note any known structural issue
it created (cross-reference `ARCHITECTURE.md §9` where relevant).
**Status:** Active | Superseded by ADR-XXX | Known issue, unresolved

---

## ADR-001: No build step; ship pinned CDN ES modules

**Date:** approx. 2026-05 (foundational; stated in every module's CLAUDE.md)
**Decision:** No npm, bundler, or `package.json`. Each module is plain files served over HTTP;
Three.js is loaded as ES modules through an import map pinned to **`three@0.160.0`** from jsDelivr,
all asset paths are relative, and imports carry explicit `.js` extensions.
**Why:** The sims ship as self-contained payloads that the host platform extracts and serves from
an arbitrary URL prefix; they must run with zero toolchain, work offline after the first CDN fetch,
and stay reproducible (a pinned version can't silently change under the sim). Removing the build
step also removes a whole class of "works on my machine" breakage for a small team. (`package.json`
files that crept in were deliberately deleted — *memory: `rebuild-plan-progress`* notes Module 1's
was `git rm`-ed.)
**Alternatives rejected:** A bundler (Vite/Webpack) — rejected because it adds a toolchain the
payload doesn't need and breaks the "open the folder and it runs" contract. `@latest` or
`npm install three` — rejected: unpinned versions break reproducibility and offline use; the UMD
global — rejected in favor of ES modules. (CLAUDE.md states these as non-negotiable bans.)
**Consequences:** Easier: deployment, reproducibility, offline use. Harder: no tree-shaking or
minification; `.js` extensions are mandatory (extensionless imports 404 with no resolver); ES
modules + import maps **require HTTP**, so `file://` fails (CORS/null origin) and a static server
is mandatory even locally. Locally that server is **XAMPP Apache on port 8080** — port 80 is held
by Windows IIS/HTTP.sys and 404s (*memory: `local-dev-serving`, `serving-and-http-verification`*).
Apache sends no `Cache-Control`, so Chrome heuristically caches modules — "changes not reflected"
is usually stale-cache, not a bad edit (hard-reload fixes it).
**Status:** Active

---

## ADR-002: Host integration via a `window.simAPI` global, not `postMessage`

**Date:** approx. 2026-05 (CLAUDE.md "Platform contract"; ARCHITECTURE.md §6)
**Decision:** Each sim runs in a sandboxed `iframe` and exposes a global `window.simAPI` object
with `pause()`, `resume()`, and `reset()`; the host reads a static four-field `meta.json`. That
global object plus `meta.json` is the entire host↔sim surface — there is deliberately **no
`postMessage` and no `window.parent`/`window.top` usage anywhere** (verified by search, ARCHITECTURE.md §6).
**Why:** The sim is only the iframe payload; the surrounding website (navbar, account, course
browser) is built by a separate team and is out of scope (*memory: `project_sim_scope_boundary`*).
A tiny synchronous API the host can call (`pause` on overlay open, `resume` on close, `reset`) is
the smallest possible contract and needs no message protocol, handshake, or origin negotiation.
**Alternatives rejected:** `postMessage`-based messaging — not chosen; no evidence it was
implemented, and the global-object approach was adopted instead. (The choice is documented as a
contract, not as a head-to-head, so treat the rejection as implicit.)
**Consequences:** Easier: trivial host wiring, no async plumbing, the sim assumes no same-origin
access and makes no runtime network calls beyond the CDN. Harder/constraint: the in-sim Reset
button **must** route through `simAPI.reset()` — there is exactly one reset path, no second one.
The actual host-side code that calls `simAPI.*` lives in the separate host repo and is **not
verifiable here** (ARCHITECTURE.md §6 flags the exact wiring as "needs review").
**Status:** Active

---

## ADR-003: CSS design tokens are the single runtime source of truth for all visual values

**Date:** approx. 2026-05 (CLAUDE.md cross-cutting rules; DESIGN.md §2/§6)
**Decision:** Every colour, radius, and spacing value is a CSS custom property (design token).
JS and Three.js materials read the *live* token at runtime via
`getComputedStyle(document.documentElement).getPropertyValue('--token')` (Module 1 caches these
into the exported `COL` map via `readTokens()`); no hex literal appears in JS or component CSS.
**Why:** The platform's goal is "one identifiable visual language across all subjects"
(*memory: `project_simatrix_scope`*). One source of truth means the viewport linework and the UI
chrome can never disagree about what "HP teal" is, and a re-theme is a token swap, not a hunt
through code. It also enforces the design system's named rules (Two-Cue, Chrome-Only Blue) at a
single chokepoint.
**Alternatives rejected:** Hard-coding hex per use site — explicitly banned ("Never hard-code hex
in JS or component CSS"). No alternative token mechanism documented.
**Consequences:** Easier: theming, host-blend tweaks (the `--color-host-white` exception is one
token), and keeping the colour-blind-safe palette consistent. Harder: SVG presentation attributes
can't read `var()`, so Module 1 had to recolour SVGs via CSS utility classes
(*memory: `module1-module2-harmonization`*); a lesson that needs an extra colour must declare it
as a token and pass it through `cfg.tokens`. Note: the token *definitions* are duplicated per
module (Module 2 inline in `index.html`, Module 1 in `src/shell.css`) — see ADR-010.
**Status:** Active

---

## ADR-004: Every geometry change funnels through one `rebuild()` pipeline

**Date:** approx. 2026-05 (CLAUDE.md "3D engineering gotchas"; ARCHITECTURE.md §5)
**Decision:** A single `rebuild(shapeData)` function is the only path for any geometry change. It
runs a fixed order: dispose old objects → resolve effective angles → generate mesh → seat on
planes → analyze edges → draw projections → place labels → notify subscribers. The control panel
never touches Three.js directly; it calls `commit()`/`rebuild` on an injected controller.
**Why:** WebGL context exhaustion inside the iframe is "the most likely late-stage bug" (CLAUDE.md):
without a single disciplined disposal point, geometries/materials/label DOM nodes leak and the
context dies. One pipeline also guarantees the scene, projections, labels, and the self-check bus
always reflect the same state, in one predictable sequence.
**Alternatives rejected:** Letting individual controls mutate the scene directly — rejected as the
leak/instability source the single path exists to prevent. No other pipeline shape documented.
**Consequences:** Easier: a verifiable disposal contract (CLAUDE.md asks to confirm
`renderer.info.memory` stays flat across 50 regenerations); reasoning about state. Harder: every
new feature must slot into the fixed order; `rebuild()` returns early while animating, so anything
that should run during an animation needs separate handling. The orchestrator that owns `rebuild()`
becomes large — Module 2's `main.js` is ~116 KB, Module 1's `engine.js` ~108 KB (ARCHITECTURE.md §9.6).
**Status:** Active

---

## ADR-005: Re-derive every ported sign visually (Unity left-handed → Three.js right-handed), explicit ZXY Euler

**Date:** approx. 2026-05 (CLAUDE.md "3D engineering gotchas"; ARCHITECTURE.md §3 `iShape.js`)
**Decision:** Geometry was ported from a Unity (C#) prototype to Three.js. Magnitudes
(apothem `a = s/(2·tan(π/n))`, slant `α = arctan(h/a)`) port unchanged, but **every sign is
re-derived visually** against a worked square-pyramid example, and the Euler rotation order is set
explicitly to **`ZXY`** (Unity's internal order), centralized in `iShape.js`'s `applyShapeTransform()`.
**Why:** Unity is left-handed Y-up; Three.js is right-handed Y-up. Copying Unity's negative signs
verbatim produces "plausible-but-wrong" mirrored or back-to-front projections — the most insidious
kind of bug because it looks fine until checked against a real drawing. Three.js's default Euler
order is `XYZ`, so leaving it implicit would silently change the rotation result.
**Alternatives rejected:** Copying signs verbatim from the prototype — explicitly called out as
"the fastest way to produce plausible-but-wrong projections." Leaving `euler.order` at the Three.js
default — rejected; the order is pinned and documented where the Euler is constructed.
**Consequences:** Easier: the tricky handedness math lives in exactly one helper, so no shape
re-derives it. Harder/legacy: comments throughout still say "Ported from `src_csharp/…`", but that
folder is no longer in the tree (ARCHITECTURE.md §9.8) — useful history that points at a missing
source, so don't chase those paths.
**Status:** Active

---

## ADR-006: Fat lines + hard-edge geometry + quantized edge welding for crisp technical linework

**Date:** approx. 2026-05 (CLAUDE.md "3D engineering gotchas"; ARCHITECTURE.md §3)
**Decision:** All engineering linework uses `LineMaterial` + `LineSegments2`/`Line2` (the
`three/addons/lines/` "fat line" stack), geometry is built hard-edged (non-indexed
`BufferGeometry`, duplicated vertices per face), and `meshAnalyzer.js` welds edge endpoints by
rounding world-space positions to a `1e-3` tolerance and building canonical sorted edge keys.
**Why:** Standard `LineBasicMaterial` is capped at 1px on most GPUs (a WebGL limitation), but
engineering line *weights* must be real, constant pixels to read as a technical drawing. Hard
edges keep the outline crisp (shared/smoothed vertices break the CAD look). Welding collapses
duplicates — without it a cylinder rim drawn where cap and side meet shows as a double line.
**Alternatives rejected:** `LineBasicMaterial` — rejected (1px cap). Indexed/smooth-shaded
geometry — rejected (smooths the edges, breaks edge extraction). No welding — rejected (double
lines on curved-solid rims).
**Consequences:** Easier: line weights and projections look like a real drawing on any GPU.
Harder: `LineMaterial.resolution` must be kept in sync with canvas pixel size on every
resize/layout change; `LineDashedMaterial` needs `computeLineDistances()` or dashes render solid;
`polygonOffset: true` is required on the solid material so edge outlines don't z-fight. These are
recurring gotchas the CLAUDE.md bug tables track.
**Status:** Active

---

## ADR-007: Orchestrator + leaf modules — leaves don't cross-import; only `genericSolid` (pure math) is shared

**Date:** approx. 2026-05 (ARCHITECTURE.md §3; CLAUDE.md cross-cutting rules)
**Decision:** Module 2 is structured as one orchestrator (`main.js`) that owns scene/state/`rebuild()`,
plus single-purpose "leaf" modules it wires together. Leaf modules **do not import each other**;
the only exception is `genericSolid.js` (stateless polygon trigonometry), which sibling shape files
may import. Shape generators follow one contract (`iShape.js` + `applyShapeTransform`).
**Why:** A strict no-cross-import rule keeps the dependency graph a star (everything hangs off the
orchestrator), so a leaf can be read, changed, or replaced without tracing a web of sibling
dependencies. Funneling the shared math into one importable pure-function module avoids duplicating
trigonometry across every shape while still banning stateful coupling.
**Alternatives rejected:** Letting leaves import siblings freely — rejected (creates hidden
coupling and circular-import risk). No shared math module (each shape re-derives polygon math) —
rejected as duplication. (Stated as a rule, not a documented trade study.)
**Consequences:** Easier: each leaf is independently understandable and testable; new shapes are
factories (`createGenericPrism(sides)`) over the shared base. Harder: the orchestrator absorbs all
the wiring and grows very large (ARCHITECTURE.md §9.6). Note this pattern is **Module 2's**;
Module 1 chose a different structure — see ADR-011.
**Status:** Active

---

## ADR-008: Rotation priority hierarchy enforced through mutually-exclusive UI

**Date:** approx. 2026-05 (CLAUDE.md "Rotation priority hierarchy (pedagogically critical)")
**Decision:** Solid orientation follows strict precedence — (1) Face Inclination HP/VP
(mutually exclusive, pyramids+cone only) > (2) Orient-to-Corner/Edge preset > (3) Manual Y
rotation — where a higher mode disables the lower ones, enforced by toggles that enable/disable
each other in `uiManager.js`. Preset angles are per-shape (square 45°, triangular 30°, pentagonal
**54°** — not 18° — hexagonal 30°).
**Why:** These rotation modes can conflict (you can't simultaneously incline a face and manually
spin Y meaningfully). Encoding a strict, UI-enforced precedence prevents contradictory states and
teaches the concepts in the right order; the explicit "54° not 18°" note records a corrected
geometry value so it isn't "fixed" back to the wrong one.
**Alternatives rejected:** Allowing all rotation controls to be active at once — rejected (produces
ambiguous/contradictory orientation). No alternative precedence ordering documented.
**Consequences:** Easier: the orientation state is always well-defined; the disabled-by-hierarchy
pattern (faint + padlock icon) is reused platform-wide (DESIGN.md §5; formerly DESIGN.shared.md). Harder: the UI must
keep enable/disable logic in lockstep with the hierarchy; topic clones that remove inclination
(ADR-009) must also remove the corresponding mutual-exclusion wiring.
**Status:** Active

---

## ADR-009: No shared code library — topic clones are manual full copies simplified down from Module 2 (the master)

**Date:** confirmed 2026-06-05 (*memory: `project_module2_topic_split`*); build details June 2026 (*memory: `simple-positions-build`*)
**Decision:** There is no shared library and no sync tooling. **Module 2 is the master/template.**
Each `graphics_module_2_topic_*` folder is a complete copy-paste of Module 2, then *simplified
down* for its topic, gating content with a single `ENABLED_TIERS` flag in `src/problems.js`. Topic 2
("Simple Positions") deletes dual inclination (drops `angleHP`/`angleVP`, keeps a `restingPlane`
choice); Topic 1 ("Introduction") drops the whole projection/stepper/problem layer and adds
`anatomy.js`/`gallery.js`. Improvements found while building a clone are **backported as a merge,
not a copy** (the master must re-blend additions while keeping its inclination features).
**Why:** With no build step and no package manager (ADR-001), there is no natural place for a
shared library; full duplication keeps each topic a standalone, independently-deployable payload
and lets a clone diverge freely (delete features to "look clean") without risking the master.
**Alternatives rejected:** A shared/imported common library — incompatible with the no-build,
self-contained-payload constraint, so not adopted. Automated sync — none exists; copies are made by
hand (many files are byte-identical only because someone copied them).
**Consequences:** Easier: each topic ships alone; a clone can drop features safely. Harder/known
issue: **the copies will drift** — any fix to a shared file (e.g. a geometry generator) must be
re-copied into every topic by hand, and backports are merges that can miss a clone (ARCHITECTURE.md
§9.2). The `DESIGN.shared.md` drift in ADR-010 is the first visible symptom.
**Status:** Known issue, unresolved (the duplication is deliberate; the drift it enables is the cost)

---

## ADR-010: `DESIGN.shared.md` is the platform-wide visual contract, duplicated per module until a shared root exists

**Date:** approx. 2026-05 → 2026-06 (DESIGN.shared.md header; *memory: `reference_design_system_files`*)
**Decision:** The platform-wide design system was extracted from Module 2's `DESIGN.md` into
`DESIGN.shared.md` (tokens, components, named rules, North Star generalized away from solids-only
specifics). It is meant to be byte-identical across modules, with each module adding only a
module-local appendix (`DESIGN.md`) for its own viewport encodings — not re-defining tokens. For
now `PRODUCT.md`/`DESIGN.md`/`DESIGN.shared.md` are duplicated *inside* each module.
**Why:** The platform wants one visual language across all future subjects (*memory:
`project_simatrix_scope`*); a single shared contract (with "this file wins on conflict") is how
that's enforced. The files live per-module today only because "that is the only repo in flight";
the stated intent is to move them to a shared Simatrix root once it exists (*memory:
`reference_design_system_files`*).
**Alternatives rejected:** A single centralized copy referenced from one place — the desired end
state, but blocked because no shared Simatrix root directory exists yet. So per-module duplication
was accepted as interim.
**Consequences:** Easier: each module is self-describing. Harder/known issue: every copy is a
drift point — `DESIGN.shared.md` already differs ~2 lines between Module 1 and Module 2
(ARCHITECTURE.md §8/§9.4), and both modules' CLAUDE.md point at `../SIMATRIX-UI-STANDARDS.md` at
the root, **which does not exist** (ARCHITECTURE.md §9.3) — a dangling reference RULES.md is
intended to fulfill.
**Status:** Superseded by ADR-022 (2026-06-27) — the shared Simatrix root now exists and the design
system was centralized into one root `DESIGN.md`; the per-module `DESIGN.shared.md` copies were
deleted. (The `../SIMATRIX-UI-STANDARDS.md` dangling reference was already resolved by RULES.md.)

---

## ADR-011: Module 1 uses a shared `engine.js` + thin pages — a different architecture from Module 2

**Date:** 2026-06-07/08 (*memory: `module1-module2-harmonization`, `rebuild-plan-progress`*)
**Decision:** Module 1 ships **seven thin HTML pages**, each a near-empty shell that calls one
shared engine (`src/engine.js`, exporting `initSim(config)`) with its own pure data + draw
functions, sharing one stylesheet (`src/shell.css`). This is structurally different from Module 2's
orchestrator + many leaf modules (ADR-007). Module 1 was also harmonized to Module 2's design
language (tokens, bundled fonts, `#wizard`/`#sim-viewport` shell) — Module 2 is the design source
of truth.
**Why:** Module 1 had seven copy-pasted pages that drifted apart; lifting all real logic into one
shared frame means a shell or engine change "lands once" and the pages "can no longer drift"
(*memory: `rebuild-plan-progress`* — the explicit goal of REBUILD-PLAN). Module 1 draws points and
lines, not solids, so it needs no shape generators or edge analyzer; folding everything into one
engine fit its simpler geometry.
**Alternatives rejected:** Mirroring Module 2's orchestrator + leaf-modules layout exactly — not
chosen; Module 1's shared-engine structure is described as the *newer* refactor pattern
(ARCHITECTURE.md §8). Keeping the seven independent copy-pasted pages — rejected as the drift
source the rebuild removed.
**Consequences:** Easier (within Module 1): adding a lesson is a new page + data module, no engine
change; the seven pages can't drift. Harder/known issue: the platform now has **two architectures
for the same kind of product** (ARCHITECTURE.md §9.5), including where CSS lives (Module 1's
separate `shell.css` vs Module 2's inline CSS) and how labels are made (engine helpers vs a
standalone `vertexLabeler.js`). A contributor fluent in one module must re-learn the other. Also a
`uiManager.js` name now means a 3-line stub in Module 1 but a full controller in Module 2
(ARCHITECTURE.md §9.7).
**Status:** **Superseded by ADR-033** (2026-07-02) — Module 1 fully adopts the orchestrator pattern
platform-wide, migrating Quadrants, First-angle, Points, and Lines off the shared-`engine.js`
architecture this ADR describes. ADR-029 (2026-06-29) was the first, *partial* supersession, covering
only `graphics_module_1_topic_1_foundations`; ADR-033 completes it for the remaining topics. This ADR
is kept for the historical record of why the shared-engine architecture was originally chosen — do
not resurrect `engine.js` as a template for new work.

---

## ADR-012: On-demand Compare View replaced the persistent dual-pane (PiP + toggle bar + `swap()`)

**Date:** decided 2026-06-12, code-complete 2026-06-13 (*memory: `compare-view-architecture`, `premium-upgrade-decisions`, `premium-upgrade-progress`*)
**Decision:** Module 1's Points/Lines sims dropped the persistent dual-pane viewport
(Picture-in-Picture second view + a bottom 3D/2D toggle bar `#tbar` + an engine `swap()`). The main
pane is now **always** the live 3D scene (`#c3d`); the second view (the 2D drawing, or — while
folded — a live-rebuilt 3D view) appears on demand in a floating Compare card. `swap()`/`isMain3D()`
survive only as deprecated no-op shims so old call sites don't throw.
**Why:** The user pitched the Compare View as the centrepiece of the upgrade — a single-canvas
cinematic fold as the hero interaction, with the alternate view on demand instead of a permanently
half-sized split. Same pedagogy (the 2D drawing is still gated behind `compareGate`), but more
screen for the 3D teaching (*memory: `compare-view-architecture`*).
**Alternatives rejected:** Keeping the dual-pane PiP + toggle bar — the prior design, explicitly
replaced. Snapshotting the alternate view — rejected; the card shows a *live* rebuilt view, never a
snapshot.
**Consequences:** Easier: the 3D scene gets the full viewport; the alternate view is a clear,
deliberate action. Constraint introduced: the card floats `#c2d` `position:fixed` over the card's
stage, which only works if no ancestor has a CSS `transform` — hence the **no-transform invariant**
on `#sim-viewport`/`#canvas-area`/`body` (a real gotcha documented in Module 1's CLAUDE.md and
DESIGN.md). Old code/comments referencing PiP/`tbar`/`swap()` are stale by design.
**Status:** Active (supersedes the dual-pane PiP design)

---

## ADR-013: The fold camera moves — overturning the "camera never moves during the fold" rule (then revised again)

**Date:** rule overturned 2026-06-12; held-angle revision 2026-06-16 (*memory: `premium-upgrade-decisions`, `compare-view-architecture`*; Module 1 CHANGELOG 2026-06-16)
**Decision:** The old hard rule "the camera NEVER moves during the fold animation" was deliberately
**overturned**. The fold-to-flat now animates the camera. This itself was then revised: the first
replacement flew an orthographic camera front-on with a perspective→ortho morph
(`animateFoldOrthoCamera`); that was **replaced** by a *held-angle* dolly (`animateFoldHold`) where
the perspective camera keeps the learner's view direction and only dollies/pans to keep the
flattening sheet framed. The clean square-on orthographic read lives in the Compare card / Front
quick-view instead.
**Why:** First reversal: the user explicitly chose "Full Module-2 cinematic" when warned it
contradicted the recorded rule; the rule's *intent* (no disorienting teleports) is preserved by
eased tweens + storing/restoring the pre-fold pose (*memory: `premium-upgrade-decisions`*). Second
revision: the front-on ortho sweep "read as a bottom-right swoop and hid the hinge edge-on" — the
whole point is to watch the HP plane hinge flat from the learner's own angle, so the camera must
hold its direction (Module 1 CHANGELOG 2026-06-16).
**Alternatives rejected:** Keeping the no-camera-motion rule — overturned on purpose; **do not
re-cite it as binding.** The ortho front-on sweep — tried and rejected because it obscured the hinge.
**Consequences:** Easier: the 3D→2D morph is legible from the learner's perspective; reduced-motion
snaps to the end state. Harder: the fold now "owns" the camera (cancels in-flight tweens, closes
the Compare card, skips OrbitControls updates while animating) so two camera moves never fight; the
First-angle intro lesson keeps the *legacy* single-perspective square-on sweep, so two fold-camera
code paths coexist (chosen by `cfg.orthoViews`). Module 2's `main.js` uses its own top-down
`swoopToAnswerSheet`.
**Status:** Held-angle revision **fully overturned by ADR-036** (2026-07-09; code landed 2026-07-10).
**Binding rule — the 3D→2D fold MUST transition to the orthographic camera:** on every `orthoViews`
lesson (Points, Lines) the fold-to-flat swoops the camera **square-on to the answer sheet** with a
perspective→orthographic morph, landing on the finished 2D drawing exactly as the textbook prints it.
**Held-angle perspective folds are forbidden** — the perspective camera must not merely dolly/pan
along a held view direction (`animateFoldHold`/`framePerspectiveToFlat` are retired). The *first*
reversal recorded here still stands — the camera **does** move during the fold; never re-cite "camera
never moves" as binding. See ADR-036 for the reinstated behaviour and the landed code.

---

## ADR-014: Auto-zoom is a one-shot eased dolly, and a rebuild does tight-fit XOR push-back — never both

**Date:** 2026-06-20 → 2026-06-25 (*memory: `dual-camera-orchestrator-port`*; Module 1 CHANGELOG 2026-06-25, 2026-06-16)
**Decision:** Module 1 ported Module 2's clip-aware auto-zoom (`reframeIfClipped` at the end of
`rebuild()`, push-back only). The framing logic settled on: a per-rebuild **one-shot,
fixed-duration eased dolly** restarted from the camera's live distance, and a rebuild does **either**
a fresh tight fit (on boot/reset) **or** the push-back dolly (on slider edits) — never both in the
same rebuild.
**Why:** The first implementation was a per-frame "exponential" camera follow that read as an
accelerating lurch and an end-of-drag jump; replacing it with one eased dolly per rebuild makes the
pull-back proportional and smooth (Module 1 CHANGELOG 2026-06-25). The tight-fit/push-back XOR
fixed a specific bug: on boot the push-back dolly's in-flight tween clobbered the fresh tight fit,
stranding the camera far back (Module 1 CHANGELOG 2026-06-16). Auto-zoom must frame the *meaningful*
geometry, so it uses a lesson-supplied `contentBox(model)` (the point/line + feet), not the big grid.
**Alternatives rejected:** Per-frame exponential follow — implemented, then rejected for the lurch.
Running both fit and push-back in one rebuild — rejected; they fight.
**Consequences:** Easier: the view opens snug on the subject and eases back only as values grow.
Harder: a lesson must supply an accurate `contentBox` (returning the whole `S3.grp` box would frame
the 60-unit grid and never fit); the boot path and edit path must stay distinguishable so the right
one runs.
**Status:** Active (supersedes the per-frame exponential follow)

---

## ADR-015: Self-check is ±0.5-tolerant, never auto-fills, and accepts OR-arrays only for genuinely-degenerate cases

**Date:** 2026-06-25/26 (*memory: `problem-library-or-targets`, `lines-single-case-stepper`*; Module 1 CHANGELOG 2026-06-25)
**Decision:** The Problem Library self-check compares the learner's dialed-in values against a
target with **±0.5 tolerance**, and **never auto-fills** (loading a problem resets to defaults and
routes to the dial-able step; the student dials, the check lights green). A target may be a single
object **or an array of equally-valid alternatives**; any full match passes. OR-arrays are used only
where the geometry is truly degenerate (on-plane/origin points where quadrants coincide).
**Why:** Auto-filling would defeat the teaching ("a limitation the student can see and manipulate
teaches the distinction" — *memory: `textbook-fidelity-preference`*). The OR-array exists so a
student isn't marked wrong for an answer that is geometrically identical (e.g. a point on a plane
belongs to two quadrants at once). The tolerance accommodates slider granularity.
**Alternatives rejected (explicitly, as false positives — do NOT add):** accepting `θ = +θ` OR `−θ`
for lines (sliders clamp 0–90 and signed `sin` makes them different drawings); accepting endpoint
A/B OR for lines (state only has end A; end B is computed). These were deliberately *not*
implemented because they would green a wrong drawing (*memory: `problem-library-or-targets`*).
**Consequences:** Easier: fair grading that doesn't punish genuine equivalence. Harder: each new
problem's `target` must be authored to expose only the fields its case actually constrains; a
verification bug here once shipped because a hand-built replica masked a real call-site bug —
**verify against the real module, not a replica** (*memory: `verify-real-artifact-not-replica`*,
see ADR-019).
**Status:** Active

---

## ADR-016: Drawing line conventions follow N.D. Bhatt / ISO — corrected from earlier choices

**Date:** 2026-06-19, superseding 2026-06-16 (*memory: `drawing-line-conventions`*; Module 1 CHANGELOG 2026-06-16 vs 2026-06-19)
**Decision:** Projection-foot/point markers are **thick filled dots** (paper halo + colour disc);
2D orthographic projectors are **solid Type-B continuous thin** lines; 3D pictorial-view projectors
stay **dashed**. These corrected an earlier brief that had made the foot a 45° "×" and asked for a
solid VP projector in 3D.
**Why:** The textbook (N.D. Bhatt) represents a point as a thick dot, and draws projectors from a
point in space to a plane as dashed in pictorials. In the **2D** drawing the HP/VP distinction is
already carried by *position* (top view below the XY line, front view above), so solid Type-B
projectors are the standards-correct choice and don't weaken the read; the 3D scene still uses the
Two-Cue Rule (HP solid-teal / VP dashed-amber) (*memory: `drawing-line-conventions`*).
**Alternatives rejected:** Foot marker as a 45° "×" (the 2026-06-16 choice) — overruled in favor of
the textbook dot. Solid VP projector in the 3D scene — overruled (3D keeps dashed for VP).
**Consequences:** Constraint: don't "fix" the 2D projectors back to dashed, the dots back to
crosses, or the 3D projectors to solid — these look like regressions but are deliberate. The
2026-06-16 changelog "45° ×" entry is explicitly superseded. Markers are drawn by `acr()` in
`src/engine.js`, which gained a `halo` option.
**Status:** Active (supersedes the 2026-06-16 "45° ×" and the solid-VP-in-3D request)

---

## ADR-017: The Lines sim is a 5-step problem-solving stepper with dedicated per-step controls — not six fixed-orientation cases

**Date:** 2026-06-26 (*memory: `lines-single-case-stepper`*; Module 1 CHANGELOG 2026-06-26)
**Decision:** The Lines sim was restructured from six fixed-orientation "case" steps into a
**5-step build-up** the learner constructs on one general line: True Length → Distance from HP/VP →
Inclinations (θ & φ) → Generate Orthographic Projections → Draw Traces. Every step pins the same
general `LineCase.INCL_BOTH` resolver; controls are **dedicated per step** (TL on step 1, distances
on step 2, θ/φ on step 3 — not cumulative); Problem Library problems route to the first step and the
self-check fires on every rebuild.
**Why:** A single general line the learner builds up teaches the *process* of constructing a line's
views, rather than presenting six pre-set orientations to inspect. Spreading dedicated controls
across steps keeps each step to one idea (the Guided Stepper principle) and lets dialled values
persist across navigation (*memory: `lines-single-case-stepper`*).
**Alternatives rejected:** The prior six fixed-orientation case steps — replaced. Cumulative
controls (all setup sliders visible once revealed) — rejected in favor of dedicated per-step
controls (user ruling 2026-06-26).
**Consequences:** Easier: a cleaner, narrative build-up; problems no longer need a per-step
`LineCase`. Required ripple changes: every `lineProblems.js` target dropped `case` and pins explicit
θ/φ; `FIELD_LABELS` lost its `case` key; `entryStep` routes problems to step 1; the default line now
starts flat (θ=φ=0). Problem text must match the hard-coded viewport labels ("line AB"/"end A" for
Lines, "Point P" for Points) — don't rename them.
**Status:** Active (supersedes the six fixed-orientation case steps)

---

## ADR-018: Favor textbook fidelity over fudging; reconcile units by a declared scale (1 unit = 10 mm)

**Date:** June 2026 (*memory: `textbook-fidelity-preference`, `simple-positions-build`, `points-mm-units`*)
**Decision:** When a textbook problem can't be represented exactly by existing controls, invest in
a geometrically-correct solution — add a dedicated UI control and a per-problem teaching hint —
rather than fudge a number or drop the problem. Textbook wording is kept verbatim and units are
reconciled by a declared scale: **1 world unit = 10 mm**. Display unit is per-sim (Points/Lines show
mm; the shared `pointData.js` stays cm for the Quadrants/First-angle lessons) — a relabel, **not** a
world rescale.
**Why:** The sim is a teaching aid; a limitation the student can see and manipulate (e.g. the
"VP distance measured to: nearest point / axis" `distVPRef` switch added for Simple Positions)
teaches the underlying drafting distinction, whereas a silently-adjusted number teaches nothing
(*memory: `textbook-fidelity-preference`*).
**Alternatives rejected:** Silently adjusting a value, or dropping a problem that doesn't fit —
rejected as the "cheapest workaround" that hides the concept. Globally rescaling world units to
match mm — rejected; the converter `toW(v)=v/10` is unchanged, only the *label* changes.
**Consequences:** Easier: faithful textbook problems and a richer control vocabulary. Harder/gotcha:
the same stored default point renders identically everywhere but is labelled "20 mm" in Points and
"20 cm" in Quadrants — **do not** globally "fix" `pointData.js` comments to mm, and don't assume
sibling point-lessons share a display unit (*memory: `points-mm-units`*).
**Status:** Active

---

## ADR-019: Verify sims headlessly via Node's built-in WebSocket CDP — no puppeteer, no npm

**Date:** approx. 2026-06 (*memory: `reference_headless_sim_verification`, `verify-real-artifact-not-replica`*)
**Decision:** End-to-end sim verification (boot, console errors, walk the UI, screenshot) is done by
driving headless Chrome over the DevTools Protocol using Node's **built-in** global `WebSocket`/`fetch`
— spawning Chrome with swiftshader for software WebGL, disabling the network cache, then exercising
the real module. No puppeteer, no `npm install`. And the final green check must run the **shipped
module**, not a hand-typed replica of its logic.
**Why:** Installing puppeteer would violate the no-build/no-dependency contract (ADR-001) and dirty
the repo; Node's built-in WebSocket makes a dependency unnecessary (*memory:
`reference_headless_sim_verification`*). The replica ban comes from a real incident: a hand-built
replica of the self-check passed while the shipped module had a call-site arg-count bug, costing
several debugging round-trips (*memory: `verify-real-artifact-not-replica`*).
**Alternatives rejected:** Puppeteer/Playwright — rejected (adds an npm dependency, breaks the
no-build contract). Verifying logic via a re-implemented replica — rejected; it can't catch
call-site bugs in the real file.
**Consequences:** Easier: verification stays dependency-free and aligned with the no-build ethos;
`node --check` (copied to `.mjs`) and HTTP probes on port 8080 round out static checks. Harder:
cache must be disabled explicitly (`Network.setCacheDisabled`) or Chrome serves a stale ES module;
the recipe is more manual than a library would be.
**Status:** Active

---

## ADR-020: Naming — "Simple Positions" carries no topic number, and the folder names hide the master

**Date:** June 2026 (*memory: `simple-positions-build`*; topic_1 CLAUDE.md; ARCHITECTURE.md §9.1)
**Decision:** Two related naming choices. (1) The Simple Positions clone is titled "Simple
Positions" with **no topic number**, per the user. (2) The deploy copies are named
`graphics_module_2_topic_1_introduction` / `..._topic_2_simple_positions` — names that do **not**
reveal they are copies of `Module2` (the master).
**Why:** (1) The human-facing title was the user's explicit preference (*memory:
`simple-positions-build`*). (2) The folder naming is the as-built convention for progressive topic
deploys; no rationale for *hiding the master* is documented — it appears to be incidental, not a
deliberate "hide the master" choice. Rationale for (2) not documented — inferred from structure: the
names encode "module 2, topic N" for the host's catalog, not the master→deploy lineage.
**Alternatives rejected:** A numbered title for Simple Positions — rejected by the user. No
alternative folder-naming scheme is documented.
**Consequences:** (1) Active and fine. (2) Known issue: a newcomer can't infer the master→deploy
relationship from the directory listing, and the terms overlap confusingly — Topic 1's own CLAUDE.md
calls the master's content "**Topic 2 — Orthographic Projection of Solids**," while the folder
literally named `topic_2` is *Simple Positions* (ARCHITECTURE.md §9.1). RULES.md or a top-level
README should state the master→deploy map explicitly.
**Status:** Mixed — the title is Active; the folder-name confusion is a Known issue, unresolved

---

## ADR-021: The Lines expanded Compare enters a "workbench" — collapse the wizard for a true 50/50 and dock the live parameters under both panes

**Date:** 2026-06-27
**Decision:** When the Lines side-by-side Compare split is open, collapse the step wizard and
re-parent the geometry-driver controls (True Length, distance HP/VP, θ, φ) into a docked
`#workbench-rail` spanning the bottom of both panes. Gated by a new `cfg.workbenchControls` key
(Lines only); the engine drives it with `syncWorkbench` / `enterWorkbench` / `exitWorkbench`.
**Why:** The wizard reserves `clamp(340px, 34vw, 460px)` and that width is held even during the
split, so `isSplit()` only halved the *leftover* — each canvas fell to ~420–490px on a 1280–1440px
laptop instead of a true 50/50 (~640–720px), a "Quiet chrome, loud subject" violation. Worse, the
live parameters are revealed by per-step progressive disclosure (`renderStep`), so a learner could
not tune TL/distances/angles while watching both views. Collapsing the wizard reclaims the full
width (each canvas = full width / 2); surfacing the driver set in a rail under both panes keeps the
parameters live so both the 3D and the 2D drawing update together.
**Alternatives rejected:** (a) *Solver Dock* — keep a slim ~220px instrument column instead of
collapsing the wizard; rejected because it is not the true 50/50 the brief asked for. (b)
*Pane-aware drawer* — the wizard overlays a pane on demand; rejected because adjusting a slider
would cover the 2D pane (defeating "watch both update"), and a translucent drawer is banned
glassmorphism. (c) *Mirror the controls* (duplicate inputs that sync) — rejected for **re-parenting
the existing `.ctrl` nodes**: ids are global so every input listener / `setRange` / self-check keeps
working wherever the node lives (one source of truth), the same pattern Lines already uses to
relocate `#view-toggles` into `.vp-cluster`.
**Consequences:** A true 50/50 at the cost of ~76px of canvas height (the rail) and the step
narrative being hidden while comparing — acceptable: the concept is taught by the time the
side-by-side is useful, and the wizard returns on Compare close or via the panel chevron (which, in
workbench mode, closes the split). The rail surfaces the *full* driver set at once rather than one
idea per step — a deliberate "solve & verify" altitude (PRODUCT.md problem-solving phase), the one
trade-off against Design Principle 2. Desktop-only (mobile keeps the bottom-sheet Compare). The rail
is docked/persistent → no shadow (Flat-Ink), a hairline top border only.
**Amended 2026-07-10 (ADR-037):** ~~Points omits `cfg.workbenchControls`, so its split is
unchanged.~~ Struck. The `cfg.workbenchControls` clause was true only while Points rode the shared
`initSim` engine; that exclusion is void now that Points is a standalone deploy (ADR-033). The
Points Compare now runs the SAME workbench pattern — 50/50 split, wizard collapsed, all four point
drivers (quad / HP / VP / PP) docked in a rail under both panes — re-implemented in its own
architecture (not via an engine `cfg` key, which no longer exists there). See ADR-037.
**Amended 2026-07-10 (border rule):** The original "single hairline top border" rule for the rail
(Consequences, above) is **overturned specifically for the Points 2D Compare card**. A full-width
rail border would draw the hairline under BOTH panes, including the 2D drawing half, which must flow
seamlessly into the rail without a seam. So the rail itself carries **no** top border; the left (3D)
half's structural seam is drawn instead by `#sim-viewport`'s `border-bottom`, and the right (2D)
Compare card stays **borderless** so it reads as one continuous surface with the rail. The "hairline
top border" therefore survives only as the 3D viewport's bottom border, not as a rail-wide rule.
**Status:** Active — the pattern now spans both Lines (engine `cfg`) and Points (standalone)

---

## ADR-022: The platform design system is centralized into one root `DESIGN.md`; the per-module `DESIGN.shared.md` copies are deleted

**Date:** 2026-06-27
**Decision:** Enact the end state ADR-010 was waiting for. The four former design files
(`Module1/DESIGN.md`, `Module1/DESIGN.shared.md`, `Module2/DESIGN.md`, `Module2/DESIGN.shared.md`)
were audited against the live code and merged into a **single root `DESIGN.md`** (the shared
visual contract: tokens, typography, spacing, components, named rules, cross-module consistency,
module-specific exceptions, known gaps). The three `DESIGN.shared.md` copies (Module 1, Module 2,
and `graphics_module_2_topic_2_simple_positions`) were **deleted**. Both modules' `CLAUDE.md` (and
the kept `Module1/DESIGN.md` premium-interaction appendix) now reference `../DESIGN.md`. Module 2
remains the master; where a module appendix conflicts on a token or named rule, the root file wins.
**Why:** ADR-010 accepted per-module duplication only as interim, "blocked because no shared
Simatrix root directory exists yet," with the stated intent to centralize "once it exists." The
root now exists (it already holds `ARCHITECTURE.md` / `DECISIONS.md` / `RULES.md`), and the
duplication's predicted cost had materialized: the two `DESIGN.shared.md` copies had drifted ~2
lines (the Host-White application note — ARCHITECTURE.md §8/§9.4). One root file removes the drift
surface entirely. The merge was also a correctness pass: a code audit caught two stale doc claims
(button press is `scale(0.97)`, not a 1px nudge; the auto-zoom dolly is 500 ms / `easeStandard`,
not 520 ms / `easeCamera`) and one token-name contradiction (the doc's `geometry-fill` was never
implemented — the real token is `--color-solid-fill`), all resolved in the code's favour.
**Alternatives rejected:** (a) *Keep per-module copies and re-sync them* — rejected; it preserves
the very drift point ADR-010 flagged, with no offsetting benefit now that a root exists. (b) *Also
delete `Module1/DESIGN.md`* — rejected; it is a genuine module-local *implementation* appendix
(Compare-View state machine, cinematic-fold camera, chrome-injection contract) distinct from the
shared visual system, so it was kept and repointed. (c) *Resolve `geometry-fill` by renaming the
code token* — deferred to a future ADR-tracked rename across both modules + topic copies; for now
the code name `--color-solid-fill` is canonical and the doc was corrected to match.
**Consequences:** Easier: one source of truth for every shared visual value; no more "keep N copies
identical" rule (RULES.md §4.15/§4.16/§7.4 were rewritten to the single-root model, plus new
§4.17 `scale(0.97)` press and §4.18 `solid-fill` canonical). Harder/residual: `Module2/DESIGN.md`
is now fully superseded by the root file but was left on disk (a removal candidate, root `DESIGN.md`
§8); the topic deploy copies still carry their own `DESIGN.md`, and the centralization must be
honored when a future topic is cut from the master (do not reintroduce a `DESIGN.shared.md`). This
supersedes **ADR-010** and resolves ARCHITECTURE.md §8 (the drift item) and §9.4 (per-module design
duplication).
**Status:** Active (supersedes ADR-010)

---

## ADR-023: `PRODUCT.md` is centralized into one root file; the per-module copies are deleted

**Date:** 2026-06-28
**Decision:** The two byte-identical per-module product contracts (`Module1/PRODUCT.md`,
`Module2/PRODUCT.md`) were audited against the live code and consolidated into a **single root
`PRODUCT.md`** (platform identity, persona, anti-references, the seven design principles,
audit-verified per-module feature inventories, accessibility commitments with implementation
status). The two per-module copies were **deleted**; both modules' `CLAUDE.md` now reference
`../PRODUCT.md`. This enacts the end state PRODUCT.md's own scope note had always stated — "it
should move to a shared Simatrix root once that exists; each per-module repo should reference this
file rather than duplicate it" — and parallels the `DESIGN.md` centralization in ADR-022.
**Why:** The shared Simatrix root now exists (it already holds `ARCHITECTURE.md` / `DECISIONS.md` /
`RULES.md` / `DESIGN.md` / `CHANGELOG.md`), so the interim per-module duplication the scope note
accepted is no longer necessary. The two copies were byte-identical (a latent drift point, exactly
like `DESIGN.shared.md` was before ADR-022); one root file removes the drift surface. The merge was
also an audit pass: every product claim was checked against `uiManager.js` / `main.js` / `engine.js`
/ both `index.html`, status-flagged EXISTS / PARTIAL / ⚠️ PLANNED, and two real gaps were recorded —
the "Shift+arrow for finer steps" accessibility commitment is not implemented in any module, and
Module 1's mobile notice is dismissible but its wording diverges from the platform-contract "Best
experienced on desktop." text (Module 2 matches exactly).
**Alternatives rejected:** (a) *Keep per-module copies and re-sync them* — rejected; it preserves
the drift point with no offsetting benefit now that a root exists. (b) *Strictly touch only the
files the task listed, leaving RULES.md §7.3 / ARCHITECTURE.md §7 describing PRODUCT.md as
"duplicated per module"* — rejected; those statements would actively contradict the new reality.
(c) *Add a RULES.md enforcement rule for Design Principle 1 ("design for the struggling learner
first")* — rejected; it is a meta tie-breaker that cannot be mechanically verified, so it is
documented as a meta-principle in PRODUCT.md §4 instead of a checklist item.
**Consequences:** Easier: one source of truth for the product contract; no "keep N copies identical"
rule. Ripple updates made the same day: RULES.md §7.3 rewritten from "keep PRODUCT.md identical
between modules" to the single-root model; ARCHITECTURE.md §7 and §9.4 updated to record the
centralization. Residual: the topic deploy copies
(`graphics_module_2_topic_2_simple_positions/PRODUCT.md`, etc.) still carry their own product docs —
future topics must consume the root `PRODUCT.md`, not reintroduce a per-module copy. Two product
items were deferred to PRODUCT.md §8/§9 (implement Shift+arrow finer steps; reconcile Module 1's
mobile-notice wording).
**Status:** Active (parallels ADR-022; completes the scope-note intent)

---

## ADR-024: Topic-deploy folders are named `graphics_module_<M>_topic_<K>_<slug>` for the host catalog

**Date:** June 2026 (as-built); documented 2026-06-28
**Decision:** Every deployed topic folder is named `graphics_module_<M>_topic_<K>_<slug>`, where
`<M>` is the subject-module index (Module 2's family is `2`), `<K>` is the topic's order in the host
catalog, and `<slug>` is the lowercase, underscore-separated topic name. **Concrete example:**
`graphics_module_2_topic_2_simple_positions` (Module 2 family, second catalog topic, "Simple
Positions"). This documents the rationale ADR-020 recorded as "not documented."
**Why:** The host platform catalogs sims by subject module and then by an ordered list of topics
within that module. Encoding both indices in the folder name lets the host — and a human browsing
the directory — read the catalog grouping and display order straight from the name, while the slug
keeps it human-readable. The numbers serve the **catalog**, not the master→deploy lineage.
**Alternatives rejected:** (a) *Name by content only* (e.g. `simple_positions`) — rejected: it
drops the module grouping and the catalog display order the host needs. (b) *Encode the master
lineage* (e.g. `module2_copy_simple_positions`) — rejected: the host catalog does not care which
master a topic was cut from, and baking "copy" into a shipped, learner-facing payload name is noise;
the lineage belongs in docs (RULES.md §1, ARCHITECTURE.md §2), not the folder name. (c) *Flat global
sequential IDs* — rejected: loses both the subject grouping and human readability.
**Consequences:** Easier: the host can order and group the catalog from the directory listing alone.
Harder/known issue (already recorded in **ADR-020**, ARCHITECTURE.md §9.1): the numbering says
nothing about the master→deploy relationship, so **a new contributor cannot infer from these names
alone that each folder is a copy of `Module2`** — that fact must be learned from RULES.md §1 /
MODULE-STARTER.md. The `<K>` index is host-catalog order, **not** a claim about the master
(RULES.md §1.7).
**Status:** Active (documents the convention ADR-020 left descriptive; the master-hiding consequence
remains the known issue ADR-020 tracks)

---

## ADR-025: A new subject module picks its template by geometry — Module 2 for 3D, Module 1 for 2D

**Date:** 2026-06-28
**Decision:** When standing up a whole new subject module (Case C — Mechanical, Electrical, Civil,
CS…), the template is chosen by the subject's core geometry: **if it manipulates 3D geometry, copy
`Module2/`; if it is a sequence of 2D-canvas / diagram lessons, copy `Module1/`.** This records the
heuristic MODULE-STARTER.md §5.1 applied but had flagged as having no ADR.
**Why:** `Module2/` is the **master** — the most complete and most documented codebase (ADR-009) —
and a 3D subject directly reuses its orchestrator + leaf-module structure (ADR-007), the single
`rebuild()` pipeline (ADR-004), the fat-line engineering linework (ADR-006), the mesh analyzer, and
the projection machinery; copying it inherits all of that rather than rebuilding it. `Module1/` is
the right template for 2D work because it is the shared-`engine.js` + thin-pages structure (ADR-011)
built for a *sequence* of 2D-from-3D drawing lessons (points, lines, planes, line types…), with no
shape generators or edge analyzer to strip out — exactly the shape a 2D-diagram subject needs.
**Alternatives rejected:** (a) *Always copy the master (`Module2/`) regardless* — rejected: a 2D
subject would inherit 3D machinery (shape generators, `meshAnalyzer.js`, `projectionDrawer.js`) it
must strip, and would miss Module 1's multi-lesson shell that fits a series of diagrams. (b) *Build a
new subject from scratch* — rejected: it throws away the platform contract (`window.simAPI`,
`meta.json`), the no-build import map, the design tokens, and the rebuild discipline every subject
must share anyway.
**Consequences:** Easier: a clear, mechanical default for the most consequential early decision in a
new subject. Harder/required: **a subject that fits neither cleanly — part 3D-geometry, part
2D-diagram, or something the two templates don't model — needs an explicit architectural decision
(its own ADR) before work starts** and must not be forced into the wrong template by default
(MODULE-STARTER.md §5.1, §5.4). Either template still consumes the root `DESIGN.md`/`PRODUCT.md`
(ADR-028) and declares only a module-local appendix.
**Status:** Active

---

## ADR-026: A sim's `<title>` in index.html must match the `title` field in meta.json

**Date:** 2026-06-28
**Decision:** The `<title>` in a sim's `index.html` must be **identical to the `title` field in its
`meta.json`**. The two are one human-facing name expressed in two places, and they must not disagree.
**Why:** `meta.json.title` is what the host platform shows in its catalog (ADR-002); `<title>` is
what the browser tab shows and what assistive technology announces on load — a screen reader reads
the `<title>` as the page's accessible name. If they disagree, the catalog entry, the browser tab,
and the screen-reader announcement tell the learner three different things about what they are
looking at: both a consistency bug and an accessibility defect (PRODUCT.md §7).
**Alternatives rejected:** *Treat `<title>` as cosmetic and let it drift from `meta.json`* —
rejected: it is the page's accessible name, not decoration. No alternative documented. (This rule
was never written down before; that gap is what let the Topic 2 violation ship.)
**Consequences:** Easier: catalog, tab, and screen-reader name always agree; copying a topic forces
an explicit title update as part of identity setup (MODULE-STARTER.md §3.6–§3.7, §7 step 2).
**Violation (fixed 2026-06-28):** Topic 2 (`graphics_module_2_topic_2_simple_positions`) had shipped
`<title>Orthographic Projection of Solids — Simatrix</title>` (inherited from the master) while its
`meta.json` title is "Simple Positions" — a real, shipped inconsistency. Corrected on 2026-06-28 to
`<title>Simple Positions</title>`, now identical to `meta.json.title` (RULES.md §1.12;
MODULE-STARTER.md §9 now cites it as the historical cautionary example). Reinforces ADR-020 (the
human-facing title is "Simple Positions," carrying no topic number).
**Status:** Active (rule) — Topic 2 violation fixed 2026-06-28 (`<title>` now matches `meta.json`)

---

## ADR-027: `iShape.js` is an adapt file, not a copy-identical shared file

**Date:** 2026-06-28
**Decision:** `iShape.js` is classified as an **adapt-on-copy** file, **not** one of the
byte-identical shared files — even though it sits in `src/` right alongside the geometry generators
(`cube.js`, `cone.js`, `cylinder.js`, `genericPrism.js`, `genericPyramid.js`, `genericSolid.js`)
that *are* byte-identical across the Module-2 family (RULES.md §7.2).
**Why:** `iShape.js` carries **module/topic-specific pose logic**, not just the generic shape
contract. The master's version (4702 bytes; imports THREE) holds the `restingPlane:'VP'` lay-down
composition — a quaternion re-composition `Q = tilt · layDown(−90° about Z) · spin` added for the
dual-inclination template — plus the `angleHP`/`angleVP` inclination sign handling and the explicit
`ZXY` Euler order (ADR-005). The topic copies carry an **older, smaller** version (Topic 2's is
2652 bytes) without the VP lay-down, because Simple Positions scoped inclination out (ADR-009); the
change was never back-copied, so the file legitimately **diverges** between master and topics. The
geometry generators next to it are pure, scope-independent math, which is why they stay identical and
`iShape.js` does not. *(Sizes/divergence verified by `md5sum` + byte count, 2026-06-28.)*
**Alternatives rejected:** *Group `iShape.js` with the byte-identical generators and copy it
verbatim* — rejected and explicitly flagged as a trap (MODULE-STARTER.md §6): blind-copying the
master's `iShape.js` into a topic that removed inclination drags in VP-lay-down/inclination logic the
topic does not use, and blind-copying an older topic's `iShape.js` into a new topic that *needs*
inclination silently omits it.
**Consequences:** Harder/required: **any contributor copying `Module2/` for a new topic must read
`iShape.js` and adapt `applyShapeTransform()` to the poses their topic actually uses — keeping the
`ZXY` Euler order and re-deriving every sign visually (ADR-005) — never copy it blindly** (RULES.md
§1.13). It is the concrete, already-live instance of the drift ADR-009 predicts: it is out of sync
between the master and the topics *today*. Note it is correctly **absent** from the byte-identical
list in RULES.md §7.2 and MODULE-STARTER.md §6.
**Status:** Active

---

## ADR-028: A new topic consumes the root `DESIGN.md`/`PRODUCT.md` — never a local copy

**Date:** 2026-06-28
**Decision:** A new topic folder must **reference the root `../DESIGN.md` and `../PRODUCT.md` via its
`CLAUDE.md`** and must **never create local copies** of those files. This makes explicit the
consequence ADR-022 and ADR-023 left implicit: centralizing the design and product contracts to the
root is only durable if new topics keep consuming the root copies.
**Why:** ADR-022 (`DESIGN.md`) and ADR-023 (`PRODUCT.md`) centralized each contract into one root
file precisely because **every per-file copy is a drift point** — and the cost was not hypothetical:
the two former `DESIGN.shared.md` copies had already drifted ~2 lines (ARCHITECTURE.md §9 item 2 /
§9.4). Re-introducing a local `DESIGN.md` or `PRODUCT.md` in a new topic would recreate exactly the
drift surface those ADRs removed. One root copy, referenced from every topic, keeps a single source
of truth.
**Alternatives rejected:** (a) *Copy `DESIGN.md`/`PRODUCT.md` into each new topic* (the
pre-ADR-022/023 interim) — rejected: it reinstates the drift the centralization eliminated. (b)
*Reference the root files but also keep a "convenience" local stub* — rejected: a stub is just a copy
that will drift.
**Consequences:** Required: the `CLAUDE.md` in **every** new topic folder must carry the
"Project-wide documentation" block pointing at `../ARCHITECTURE.md`, `../DECISIONS.md`,
`../RULES.md`, `../DESIGN.md`, `../PRODUCT.md`, and its design-system line must point at
`../DESIGN.md`/`../PRODUCT.md`, not a local `@DESIGN.md` (RULES.md §1.14; MODULE-STARTER.md §3.7,
§9). Residual (from ADR-022/023): the **existing** topic deploy copies still carry their own
`DESIGN.md`/`PRODUCT.md` — removal candidates, not a precedent to follow. Cross-references
**ADR-022** and **ADR-023**.
**Status:** Active (makes explicit the new-topic consequence of ADR-022 and ADR-023)

---

## ADR-029: Module 1 Topic 1 (Foundations) adopts the orchestrator pattern + a per-edge line-of-sight hidden-line classifier — superseding ADR-011 for this topic

**Date:** 2026-06-29
**Decision:** The Module 1 "Foundations" lesson is rebuilt as a standalone topic
(`graphics_module_1_topic_1_foundations/`) on **Module 2's orchestrator + leaf-module pattern**
(ADR-007), not on Module 1's shared-`engine.js` thin-page structure (ADR-011). It teaches the four
BIS line types (Type A visible, Type E/F hidden, Type G centre, Type B dimension) on a **real,
orbitable 3D Bearing Block** instead of flat 2D points/lines. It **retains `meshAnalyzer.js`**
(copied verbatim from Module 2 — the camera-invariant welded edge map) and adds a **net-new per-edge
line-of-sight (raycast) occlusion classifier** (`lineDrawer.js`) that re-runs on orbit, throttled to
`requestAnimationFrame` (RULES.md §3.19). This **supersedes ADR-011 for this topic only**.
**Why:** ADR-011's premise — *"Module 1 draws points and lines, not solids, so it needs no shape
generators or edge analyzer"* — does not hold once Foundations teaches line types on a 3D machine
part. Because the part is fully orbitable (so the lesson can show a visible edge become a hidden edge
as the student spins it), edge visibility is **camera-dependent** and must be recomputed live — which
is exactly the solid-analysis machinery Module 2 already has. Module 2's *convex* face-normal
shortcut (`worldNormal.y > 0`) is insufficient here: the Bearing Block is **non-convex** (a
through-bore + drilled holes), so the boss can stand in front of the rear bore rim. The honest test
is "can the camera SEE this edge, or is solid material in the way?" — a short raycast against the
solid, sampled along each welded edge, majority-occluded ⇒ hidden (Type E/F), else visible (Type A).
Boundary/silhouette edges (1 incident face) cannot self-occlude, so they are always visible
("outline-first", which also trims raycasts).
**Alternatives rejected:** (a) *Build Foundations on Module 1's shared `engine.js` thin-page frame
(stay within ADR-011)* — rejected: that engine draws 2D points/lines and has no shape generator or
edge analyzer, so a 3D orbitable solid with live hidden-line detection would mean bolting Module 2's
entire stack onto it anyway; cleaner to adopt the orchestrator outright. (b) *Port Module 2's convex
`normal.y > 0` visibility shortcut verbatim* — rejected: it gives wrong results on a non-convex part
(it cannot tell the boss occludes the rear rim). (c) *GPU depth-buffer readback for occlusion* —
rejected: heavier plumbing for no pedagogical gain at this part's tessellation; a reused CPU
`Raycaster` against the single static mesh is smooth when gated on real camera movement. (d) *Make
the front view a flat 2D camera lock* — rejected: the whole lesson is "orbit to watch visible become
hidden," which a flat lock forbids (Decision 2 in the topic CLAUDE.md).
**Consequences:** Easier: the topic gets Module 2's disciplined single-`rebuild()` pipeline, full
WebGL + CSS2D disposal contract, fat-line stack, and token discipline for free; adding more
line-type teaching is a leaf change. The static-part-with-orbiting-camera choice keeps the once-built
edge map valid for the life of a rebuild (only the visible/hidden pass re-runs). Harder/known: this
topic is now a **third architecture instance** under Module 1's umbrella (the seven shared-engine
lessons are untouched and ADR-011 still governs them); a contributor must not "fix" this topic back
onto `engine.js`. The line-of-sight classifier is the one substantive piece of net-new engineering
versus a verbatim Module 2 port. Per RULES.md §8.4 this ADR is the written supersession; ADR-011's
status is annotated to point here. Cross-references **ADR-007**, **ADR-011**, **ADR-006** (fat-line +
welding non-negotiables), and the topic `CLAUDE.md`.
**Status:** Active (supersedes ADR-011 for `graphics_module_1_topic_1_foundations` only; ADR-011
remains active for Module 1's other lessons)

**Addendum (2026-06-30, Phase 3 reversal):** A Phase 3 refactor briefly **removed** this per-edge
line-of-sight classifier — dropping the raycaster, `three-mesh-bvh` (ADR-030), and the dashed
batch — and tried to hide rear edges purely with the GPU depth buffer (every edge drawn solid;
"X-ray" = hide the faces). That **broke the curriculum**: the topic exists to teach the BIS
solid-Type-A-vs-dashed-Type-E/F distinction, and depth-buffer hiding cannot produce dashed hidden
lines — it just makes occluded edges vanish or, in X-ray, turns everything into identical solid
lines. The change was **reverted**: the CPU occlusion raycaster + dual solid/dashed batch are
**REQUIRED**, not an optimisation, and a contributor must **not** drop them again. The one thing
Phase 3 got right — that the raycaster casts against GEOMETRY, not the material — is now used
deliberately: Step 2's "X-ray" hides the block's *material* (`material.visible=false`) while the
raycaster keeps classifying, yielding a true wireframe of **solid front + dashed rear** edges. This
is GPU depth-hiding rejected once more (ADR-029(c)/ADR-030(c)), now with the failure mode on record.

---

## ADR-030: Accelerate occlusion raycasting with `three-mesh-bvh`, added through the CDN import map (preserving the no-build contract)

**Date:** 2026-06-30
**Decision:** Add **`three-mesh-bvh`** (pinned, from jsDelivr) to the **same import map** that pins
`three@0.160.0`, and use it to accelerate the per-edge line-of-sight occlusion raycasts in the
Foundations topic's `lineDrawer.js` (ADR-029). A bounding-volume hierarchy (BVH) is built on the
static Bearing-Block mesh once per `rebuild()` and the `Raycaster` is pointed at it via
`three-mesh-bvh`'s accelerated raycast, instead of Three.js's default triangle-by-triangle scan.
**Why:** ADR-029's hidden-line classifier fires a short raycast against the solid for **every**
internal/silhouette edge, re-run as the student orbits. With the stock `Raycaster` each ray does a
**linear scan over every triangle** (≈ O(rays × triangles)); on the non-convex Bearing Block (bore +
drilled holes ⇒ a high triangle count) that was the **CPU bottleneck** — the very lag that had forced
a debounce timer and made the lines feel detached from the part. A BVH turns each ray into roughly
**O(log triangles)**, which is what makes a full per-frame re-classification affordable (and is the
precondition for dropping the debounce in ADR-031). Critically, `three-mesh-bvh` ships as an **ES
module** that can be **pinned in the import map exactly like `three`**, so it adds **no npm, no
bundler, no build step** — it stays inside the ADR-001 contract (CDN ES modules, pinned versions,
works offline after first fetch).
**Alternatives rejected:** (a) *`npm install three-mesh-bvh` / a bundler* — rejected: violates the
no-build, no-`package.json` contract (ADR-001, RULES.md §2.1–§2.2). (b) *Keep the stock `Raycaster`
behind a longer debounce* — rejected: the debounce only **hid** the bottleneck; it made orbit feel
unresponsive, which is the bug being fixed. (c) *GPU depth-buffer readback for occlusion* — already
rejected in ADR-029(c) as heavier plumbing for no pedagogical gain. (d) *Lower the mesh tessellation
so naive rays are cheap* — rejected: it degrades the part's curved bore/boss read.
**Consequences:** Easier: real-time, smooth visible↔hidden classification on a non-convex solid
without leaving the no-build world. Harder/required: the import map now pins a **second** CDN
dependency that must stay **version-compatible with `three@0.160.0` and pinned** (never `@latest`,
never npm) — RULES.md §2.20; the BVH is **derived state** that must be **rebuilt when the geometry
changes and disposed with the mesh** inside the single `rebuild()`/disposal contract (ADR-004),
RULES.md §3.31. Scope today: only the Foundations topic uses it — the master's `projectionDrawer.js`
still uses the convex `worldNormal` shortcut (ADR-029) and needs no BVH — but the dependency
precedent is now set. Cross-references **ADR-001** (no-build), **ADR-029** (the classifier it
accelerates), and **ADR-031** (the debounce removal it enables).
**Status:** Active (briefly removed in a Phase 3 experiment, then **restored** — the raycaster it
accelerates is curriculum-critical; see the ADR-029 Phase 3 reversal addendum).

---

## ADR-031: Replace the occlusion debounce timer with real-time `requestAnimationFrame` throttling (enabled by the BVH)

**Date:** 2026-06-30
**Decision:** The heavy visual update — the per-edge **visible/hidden re-classification on orbit** —
was previously deferred behind a **~100 ms debounce timer** (recompute only after the student stopped
moving). That timer is **removed**; the re-classification now runs **in real time, throttled to one
pass per `requestAnimationFrame`** (multiple orbit events in a frame coalesce into a single recompute,
gated by a camera-moved "dirty" flag so a still scene costs nothing).
**Why:** The debounce existed **only** to mask the naive-raycasting cost (ADR-030) — while orbiting,
the lines lagged or flickered, so the recompute was delayed until the user paused. Once the BVH makes
each classification pass cheap, the recompute can run **every frame**, so visible edges become hidden
edges **smoothly under the learner's hand** — which is the entire pedagogical point of keeping a live
classifier (ADR-029). `rAF` throttling (rather than recomputing on every `mousemove`/orbit-change
event) caps the work at the display refresh and aligns it with the render, exactly as the standing
gotcha requires: *"throttle to `requestAnimationFrame`, never to `mousemove`"* (RULES.md §3.19).
**Alternatives rejected:** (a) *Keep the debounce* — rejected: any time-based defer desyncs the lines
from the part, so the visible↔hidden swap lags the orbit and the live-classification pedagogy is lost.
(b) *Recompute on every orbit/`mousemove` event with no throttle* — rejected: fires many times per
frame for no extra visual benefit and re-introduces jank (and violates §3.19). (c) *Just shorten the
debounce interval* — rejected: a smaller delay still desyncs lines from the part; `rAF` + a dirty flag
is the correct cadence, not a faster timer.
**Consequences:** Easier: live, lag-free hidden-line updates during orbit; the debounce timer state
and its disposal edge case (a trailing fire after the component is torn down) are gone. Required: the
classifier must be **idempotent and cheap enough to run per frame**, and is **dirty-gated** on real
camera movement so an idle scene does no work. Establishes the platform pattern — **heavy visual
updates driven by continuous input (orbit) are `rAF`-throttled + dirty-gated, never debounced**
(RULES.md §3.32, reinforcing §3.19). Depends on **ADR-030** (the BVH that makes per-frame affordable)
and serves **ADR-029** (the live classifier).
**Status:** Active (depends on ADR-030)

---

## ADR-032: The floating padded scrollbar pill is the platform scrollbar standard, tinted to `--color-border`

**Date:** 2026-07-02
**Decision:** Scroll containers show a **floating, padded scrollbar pill** rather than hiding the
scrollbar. The WebKit/Blink channel is **10px**, but the thumb carries a **3px transparent border +
`background-clip: padding-box`** so only the inner ~4px paints and the pill floats clear of both edges;
the track is transparent, no native arrow buttons, `border-radius: 999px`. The thumb is tinted to
**`--color-border`** (`#d9d2c3`, ~1.28:1 on the card paper — faintly visible, per Quiet Chrome). Firefox
gets `scrollbar-width: thin` + `scrollbar-color: var(--color-border) transparent`, scoped to an
**`@supports (-moz-appearance: none)`** guard; critically, `scrollbar-width` is left **UNSET on the base
rule** so Chrome 121+ keeps the `::-webkit-scrollbar` pseudo-elements. Codified in DESIGN.md §5.11.
**Why:** Two threads converged. (1) **Visibility of System Status** — the earlier `scrollbar-width: none`
+ `::-webkit-scrollbar { display: none }` hid the scrollbar entirely, so a student on a short laptop
screen had no cue that content continued below the fold (flagged in the Impeccable critique). (2) A tint
iteration to find "present but quiet": `--color-bench-grey` read too heavy/loud (broke Quiet Chrome), and
`--color-panel` (`#efebe1`) was only ~1.12:1 on the card paper — so near-invisible it re-softened the
status-visibility fix it was meant to serve. `--color-border` sits between them at ~1.28:1 — faintly
visible without becoming chrome the eye fights, and it **reuses an existing structural token** rather than
minting a new scrollbar colour.
**Alternatives rejected:** (a) *Keep scrollbars hidden* — the prior state; rejected because it fails
Visibility of System Status. (b) *`--color-track` tint* — the token the "finalizing" request assumed had
been tried; it never actually landed in code (the shipped tint was `--color-panel`). `--color-border` was
chosen instead for the same faint-but-present read at slightly higher contrast, reusing the border token.
(c) *`--color-panel` tint* — rejected: ~1.12:1 is effectively invisible. (d) *`--color-bench-grey`* —
rejected: too loud for Quiet Chrome. (e) *Declaring `scrollbar-width` unconditionally (not Firefox-scoped)*
— rejected: Chrome 121+ then disables the WebKit pseudo-elements and falls back to its native ~11px bar
with arrow buttons, destroying the floating pill; hence the `@supports` scoping is load-bearing, not
cosmetic.
**Consequences:** One codified scrollbar pattern reused across modules; the token rules hold (read colour
from `--color-border`, never hard-code hex — §6.2/ADR-003). The base rule **must** keep `scrollbar-width`
unset — a non-obvious Chrome-121 gotcha, now documented inline and in DESIGN.md §5.11. First shipped in
`graphics_module_1_topic_1_foundations` (`.card__scroll`) and **backported for platform parity** to the
Module 2 master (`Module2/`: `#step-card`, `.problem-library__body`) and the intro topic
(`graphics_module_2_topic_1_introduction/`: `#shape-rail`, `#anatomy-panel`).
**Amended 2026-07-11 (scrollbar gutter):** the floating pill also needs horizontal breathing room so
it never overlaps the scrolling content. The first approach reserved that room as a **`+12px` right
gutter** — an asymmetric `padding-right` that pushed the content column left so the thumb sat in the
added strip on the right edge. That was reframed to a **centered flat gutter** of `var(--space-3)`
(still 12px, but read as the pill *floating centered in its own track* rather than a one-sided pad),
and critically the value is now sourced from the spacing scale token, not a raw `12px` literal
(ADR-003 / DESIGN.md §6). Landed in `graphics_module_1_topic_1_foundations` (`.card__scroll`:
`padding-right: var(--space-3)`, comment "pill floats centered in its track"); the `template_starter`
scaffold still carries the older "+12px scrollbar gutter" wording and is the remaining sweep target so
new modules cut from it inherit the centered-gutter framing.
**Status:** Active

---

## ADR-033: Module 1 fully adopts the orchestrator pattern — Quadrants, First-angle, Points, and Lines migrate off `engine.js`, fully superseding ADR-011

**Date:** 2026-07-02
**Decision:** Module 1's four remaining topics — Quadrants, First-angle, Points, and Lines — are
being migrated off the shared-`engine.js` + thin-page architecture (ADR-011) onto **Module 2's
orchestrator + leaf-module pattern** (ADR-007), the same pattern Foundations already proved
(ADR-029). Each topic becomes its own standalone `graphics_module_1_topic_<K>_<slug>` folder cut
from the Module 2 skeleton (ADR-009's copy-and-simplify discipline), not a new page bolted onto the
shared engine. Quadrants and First-angle ship combined as one topic, **"Spatial Framework"**
(`graphics_module_1_topic_2_spatial_framework`); Points and Lines migrate as their own topics in a
later pass. This is a **platform-wide architectural commitment, not a per-topic exception** — it
**fully supersedes ADR-011**, whose shared-engine premise no longer describes any current or
planned Module 1 content.
**Why:** Foundations proved the orchestrator pattern gives better encapsulation — each topic is a
fully self-contained payload, with no shared `engine.js` that every lesson must stay compatible
with — and unlocks dynamic, camera-dependent solid/geometry analysis the flat `engine.js` frame
cannot do (ADR-029's live occlusion classifier is the concrete proof it was worth doing). Running
two different rendering architectures for the same kind of product was already on record as a known,
unreconciled issue (ADR-011's own Status line; ARCHITECTURE.md §9.5). Standardizing the whole
platform on one pattern removes that cognitive tax for every future contributor and topic, rather
than leaving Foundations as a permanent one-off exception.
**Alternatives rejected:** (a) *Keep ADR-011's shared-`engine.js` frame for the remaining four
topics and treat Foundations as a one-off exception* — rejected: it perpetuates exactly the
two-architecture split ADR-011 flagged as unresolved, and every future Module 1 fix would still need
to be reasoned about twice, in two different codebases. (b) *Migrate only the topics that need
camera-dependent analysis and leave Points/Lines on `engine.js` since they are "simpler" 2D lessons*
— rejected: Points and Lines already render 3D points/lines in an orbitable scene, not a flat 2D
canvas, so the orchestrator's single-`rebuild()`/disposal discipline benefits them too; splitting
Module 1's four remaining topics across two architectures by perceived complexity would just
recreate the same inconsistency at smaller scale.
**Consequences:** Easier: one architecture across the entire platform — a contributor fluent in
Module 2's orchestrator pattern can work on any topic without relearning a second engine
(ARCHITECTURE.md §9.5/§9.7's "same name, opposite role" `uiManager.js` confusion goes away once
`engine.js` is fully retired). Harder/required: `Module1/src/engine.js` is retired as a template for
new work — it stays on disk only until all four topics are migrated and cut over, and must not be
used as a starting point for anything new; RULES.md §3.28 ("never edit `engine.js` to add a lesson")
becomes moot once nothing new is ever added to it. Each new topic inherits ADR-009's drift risk (a
manual copy-and-simplify of Module 2, no shared library) and must still consume the root
`DESIGN.md`/`PRODUCT.md`, never a local copy (ADR-028). This **fully supersedes ADR-011** — its
Status line is updated below rather than left as a Foundations-only partial supersession (RULES.md
§8.4). Cross-references **ADR-007**, **ADR-009**, **ADR-011**, and **ADR-029**.
**Status:** Active (fully supersedes ADR-011)

---

## ADR-034: The migrated Points topic's Compare card draws its 2D sheet on one 2D `<canvas>`, not a second WebGL stack

**Date:** 2026-07-07
**Decision:** `graphics_module_1_topic_3_points` honours ADR-012 (the mandatory on-demand Compare
card for `mode:'dual'` sims) with the ported card chrome and `compare = { show, hide, toggle,
isOpen }` state machine, but renders the card's 2D orthographic drawing on a **plain 2D `<canvas>`
owned by the card's stage**, repainted from the live point data (`resolvePosition`'s signed mm) on
every `rebuild()` — instead of re-housing the legacy second WebGL scene stack (`S2`/`#c2d` floated
`position:fixed` over the stage). Two knock-on adaptations: the card positions `absolute` inside
`#sim-viewport` (the floating-canvas no-transform invariant is moot when the canvas lives IN the
stage), and the chip label stays "Compare 2D drawing" in both fold states (with one WebGL canvas
there is no live 3D view to offer while folded — ADR-013 already assigns the square-on read to this
card, so a 2D-always card is the coherent pairing).
**Why:** A point's finished first-angle sheet is one XY line, two view marks, one projector, and
two dimensions — trivially drawable with Canvas2D at token fidelity. A second `WebGLRenderer` would
double the GL contexts in the sandboxed iframe purely for that, and WebGL context exhaustion is on
record as the platform's most likely late-stage bug (CLAUDE.md). ADR-012's substantive rules — a
*live rebuilt* drawing, never a snapshot; on-demand card over persistent dual-pane; the compareGate
pedagogy (`showHP && showVP`) — are all preserved; only the rendering vehicle changes.
**Alternatives rejected:** (a) *Port the legacy `S2` second WebGL stack verbatim* — rejected: a
second GL context + the fixed-position canvas float + the no-transform invariant, all to draw five
primitives. (b) *Scissor-render a second view into the main WebGL canvas under a transparent card
stage* — rejected as fragile (stacking contexts, stage-rect tracking) for zero visual gain.
**Consequences:** Easier: zero added GL contexts (the stress check stays a one-context sim); the
drawing repaints synchronously on every commit with no render-loop coupling. Harder/watch: this
card cannot show a live 3D view while folded (the legacy `s2Is3D` mode) — if a future phase needs
it, that is the point to revisit the second stack; the Lines topic's richer 2D drawing should
re-evaluate this trade-off rather than inherit it blindly. Cross-references **ADR-012**,
**ADR-013**, **ADR-033**.
**Update (2026-07-08, Phase 6):** the card's 2D drawing now RENDERS the lateral (profile-plane)
coordinate instead of centring the projector and discarding it. An earlier code rationale had
drawn the projector fixed at centre ("the side view that would show it is not part of this
drawing"); once the Distance-from-PP control gained a signed −100…100 mm range (to walk the point
either side of PP), that centred projector stopped mirroring the 3D state — moving the PP slider
changed nothing on the sheet, violating ADR-012's *live-rebuilt drawing that mirrors state* rule.
`drawCompare()` now slides the shared projector + both view marks left/right of a centre datum
along the XY line by `distRP` (positive = right of PP, negative = left), drawing a datum tick + a
lateral dimension when off-plane, on one fitted scale so a far point or large offset still frames.
The view marks also gained the ADR-016 paper halo they had been missing. The Lines topic, when it
builds its richer 2D drawing, should treat "render every dialled coordinate the drawing can carry"
as the baseline this establishes.
**Status:** Active

---

## ADR-036: Restore the 3D-to-2D orthographic camera swoop during the fold

**Date:** 2026-07-09 (Phase 1, Part 1 — Documentation Reversals)
**Decision:** This ADR explicitly **overturns ADR-013's held-angle revision**. The fold-to-flat once
again flies the **front-on orthographic camera swoop with a perspective→ortho morph**
(`animateFoldOrthoCamera`-style): as the HP plane hinges flat onto the VP, the camera sweeps square-on
and morphs to orthographic, so the fold lands on the finished 2D sheet exactly as the textbook prints
it. The held-angle dolly (`animateFoldHold`) is **retired** as the fold's camera move. ADR-013's *first*
reversal is untouched and still binding: the camera **does** move during the fold — "the camera never
moves during the fold" stays overturned and must not be re-cited.
**Why:** Reversed per the 2026-07-09 Phase 1 directive. The held-angle fold ends on a foreshortened
sheet the learner must mentally rectify; landing square-on in true orthographic closes the 3D→2D loop
in a single move — the fold itself *becomes* the transition to the drawing. ADR-013's recorded
objection to the sweep ("read as a bottom-right swoop and hid the hinge edge-on") is accepted as a
known trade-off; implementations should frame the hinge in the sweep's path rather than abandon the
square-on landing.
**Alternatives rejected:** Keeping `animateFoldHold` — rejected by this directive; the learner's-angle
read survives in free orbit before the fold. A hybrid (hold angle, then cut to ortho) — rejected: the
cut is exactly the disorienting teleport the fold rules exist to prevent.
**Consequences:** RULES.md §5.5–§5.8 rewritten to mandate the swoop (§5.7 now requires it; §5.8 now
bans the held-angle dolly instead of the sweep). Code phases must reinstate the orthographic sweep on
`orthoViews` lessons (Points/Lines) and retire `animateFoldHold`; the Compare card / Front quick-view
loses its role as the *sole* square-on read. §5.9 (pre-fold pose restore) and §5.10 (the fold owns the
camera) are unaffected and still bind. Cross-references **ADR-013**, **ADR-034**.
**Landed 2026-07-10:** the swoop is now implemented on the existing dual-camera stack (it reuses
`engageOrtho`/`tweenCamFull`/`restorePerspective` + the projection morph rather than resurrecting the
removed `animateFoldOrthoCamera`). In the shared engine (`Module1/src/engine.js`, drives Module 1
Points **and** Lines) `animateFoldSwoop`/`snapFoldSwoop` replace `animateFoldHold`/`snapFoldFlatHold`,
and `framePerspectiveToFlat` is deleted. In the standalone Points topic
(`graphics_module_1_topic_3_points/main.js`) `driveFold` now calls a new `swoopToAnswerSheet` (forward)
and `restorePerspective` (reverse), and the held-angle `framePerspectiveToFlat`/`fitPerspectiveDistance`
are deleted. Because the perspective camera never moves during the swoop, the reverse fold glides the
ortho camera straight back onto the learner's retained orbit pose — no stored `preFoldPose` needed.
**Status:** Active — **implemented 2026-07-10** (overturns ADR-013's held-angle revision)

---

## ADR-037: The standalone Points Compare gains a true 50/50 workbench — re-implemented in its own architecture, not via an engine `cfg` key

**Date:** 2026-07-10
**Decision:** Bring the Points topic's Compare to parity with the Lines workbench (ADR-021): expanding
Compare now enters a **true 50/50 split** — the step wizard collapses, the live 3D viewport takes the
left pane, the 2D orthographic drawing takes the right pane, and the four point drivers (Quadrant,
Distance from HP, Distance from VP, Distance from PP) re-parent into a docked `#workbench-rail`
spanning the bottom of both panes. Points opens **straight into** the split on desktop
(`COMPARE_DEFAULT_SIZE = 'expanded'`); the head's shrink button drops back to the ADR-012 floating
compact card, and the wizard chevron / Compare-close both exit the split. Desktop-only — mobile keeps
the bottom-sheet Compare. Implemented entirely in the topic's own code (`main.js` `enterWorkbench` /
`exitWorkbench` / `applyCompareSize`, `stepper.js` `refresh`, and an `index.html` `body.compare-split`
CSS grid), **not** through the shared engine's `initSim({ compareSplit, compareDefaultSize,
workbenchControls })` config surface.
**Why:** The task asked to "implement Compare parity by passing `compareSplit` / `compareDefaultSize`
/ `workbenchControls` into `initSim`." That is impossible here: Points was migrated off the shared
`engine.js` onto the Module-2 orchestrator + leaf-module pattern (ADR-033), so there is no `initSim`
call in `graphics_module_1_topic_3_points/main.js` and nothing reads those keys — they exist only in
`Module1/src/engine.js`, which Lines still rides. Passing the keys would have been dead config plus a
changelog claiming a split that did not exist. The user chose to build the real split instead. The
mechanism follows ADR-021's blessed pattern: **re-parent** the existing `[data-ctrl]` wrappers (their
ids are global, so every uiManager listener / self-check keeps working wherever the node lives — one
source of truth), never mirror inputs. Two adaptations fall out of the standalone architecture: (1)
the right pane is the topic's existing live-repainted 2D `<canvas>` (ADR-012), so the split needs **no
second WebGL context** — the single-canvas invariant survives; (2) because `handleResize()` measures
`#sim-viewport`, making that box the left pane resizes the renderer correctly with zero JS sizing
change.
**Alternatives rejected:** (a) *Add the three keys to a fabricated `initSim` call* — rejected: no
engine consumes them in this topic; it ships dead code and a false ADR/changelog. (b) *Re-host Points
back on the shared `engine.js`* — rejected: reverses ADR-033 wholesale to gain one feature. (c)
*Float a second WebGL canvas for the 3D pane* — rejected: re-introduces the GL-context-exhaustion risk
ADR-012 deliberately avoided in the sandboxed iframe; the 2D `<canvas>` right pane already exists. (d)
*Mirror the driver inputs into the rail* — rejected for re-parenting, per ADR-021.
**Consequences:** The workbench pattern now spans BOTH modules by two different mechanisms — Lines via
the engine `cfg.workbenchControls` (ADR-021), Points via standalone DOM re-parenting (this ADR) — so
"the workbench" is a shared *interaction contract*, not a shared code path. ADR-021's "Points omits
`cfg.workbenchControls`" clause is struck (amended above). Entering the split force-unfolds a folded
scene (the flat read belongs to the 2D pane, ADR-013); on exit `stepper.refresh()` restores per-step
progressive disclosure of the borrowed drivers. Same ~76px rail-height cost and hidden step-narrative
trade-off as ADR-021. New rule candidate for RULES.md: a topic-local Compare that offers an expanded
mode MUST provide the 50/50 workbench (not a centred overlay) for cross-topic parity.
**Status:** Active

---

## ADR-038: The 2D Compare orthographic drawing is a FIXED scale locked to the static sheet bounds — never auto-zooming

**Date:** 2026-07-10
**Decision:** The on-demand Compare **2D orthographic drawing** renders at a **fixed scale locked to
the static reference-sheet bounds** (the `SHEET` constant), so a real millimetre always reads as the
same on-screen length regardless of the line's True Length or inclination. It **must not** auto-fit /
auto-zoom to chase the drawn geometry. In Lines, `sheet2D()` maps the sheet's vertical half to `SHEET/2`
expressed in mm (`SHEET = 60` units = 600 mm → ±300 mm each side of the XY line); a rare over-range line
extends past the sheet edge rather than shrinking the whole drawing. The clip-aware auto-zoom of
**ADR-014** applies **only** to the 3D perspective main pane — never to the 2D drawing.
**Why:** Engineering fidelity — the 2D orthographic sheet is a *measured* drawing. If it auto-zoomed,
10 mm would shrink as the True Length grew, breaking the "10 mm reads as 10 mm" contract and making the
side-by-side 3D↔2D comparison meaningless. A previously shipped `fit = min(1, frame/lineExtent)`
auto-zoomed the sheet to chase the line — this ADR reverses that. It also fixes a clipping regression:
the fixed span had been a magic `100` mm, which the 150 mm True-Length slider (plus a 150 mm end height)
overran; deriving the span from `SHEET` (`SHEET2D_SPAN = (SHEET/2)*10`) guarantees the absolute
worst-case line stays inside the static sheet.
**Alternatives rejected:** (a) *Data-dependent auto-fit of the 2D drawing* — rejected: destroys
measured-scale fidelity, the whole point of an orthographic sheet. (b) *A larger magic constant* —
rejected: it drifts from the actual sheet bounds; the span must be **derived from `SHEET`** so enlarging
the sheet keeps the drawing in proportion automatically.
**Consequences:** New **RULES.md §5.19**. The 2D scale in `Module1/lines.js` is now
`SHEET2D_SPAN = (SHEET/2)*10`, not a bare `100`. Cross-references **ADR-014** (the 3D perspective
auto-zoom — the deliberate counterpart that this ADR carves the 2D drawing out of).
**Status:** Active

---

## ADR-039: Flatten every topic/module sub-repository into one unified `Simatrix` monorepo

**Date:** 2026-07-10
**Decision:** All of the previously independent topic and module folders — each of which carried its
own inner `.git` directory and its own detached commit history — are **collapsed into a single
`Simatrix` monorepo** rooted at `C:\xampp\htdocs\Simatrix`. The inner `.git` folders are **deleted**;
there is now exactly **one** git repository, one working tree, and one commit history for the whole
platform. Module1, Module2, and every `graphics_module_*_topic_*` folder are ordinary sub-directories
of that single repo, no longer nested repositories or submodules.
**Why:** The documentation system was just centralized onto **one root source of truth** — DESIGN.md,
PRODUCT.md, PLATFORM-RULES.md, ARCHITECTURE.md, and this DECISIONS.md all live at the repo root and
describe the platform as a whole. Version control must match that shape. Per-folder repositories forced
either git submodules or a set of disconnected histories, both of which make a platform-wide change
(touching a shared doc plus several topic folders in one logical edit) impossible to capture as a single
atomic commit, and make cross-cutting git hooks and history search unreliable.
**Alternatives rejected:** (a) *Keep separate sub-repositories and wire them together with git
submodules* — rejected: submodule pins, detached HEADs, and the two-step commit dance add maintenance
cost with no offsetting benefit for a single-team, single-deploy platform. (b) *Preserve each subfolder's
detached history by grafting/importing it into the monorepo* — rejected: the sub-repos were remote-less
and their histories held no shared value worth the merge complexity; a clean slate was chosen
deliberately over reconstructing tangled parallel histories.
**Consequences:** Platform-wide commits are now trivial — one edit spanning a root doc and several
topic folders is a single commit. Version control, tagging, and git hooks are unified and centralized.
The trade-off, accepted knowingly: the pre-flatten commit histories of the remote-less subfolders were
**dropped**, so the monorepo begins from a clean-slate baseline rather than a reconstructed timeline.
Reflected in **ARCHITECTURE.md §2** (the codebase map now states the platform is one unified git
monorepo).
**Status:** Active

---

## ADR-040: Cool the four residual warm neutrals (panel, ink, ink-secondary, border) to the clinical LAB values — accent and domain encodings untouched

**Date:** 2026-07-11
**Decision:** Four neutral tokens are re-derived from the platform's clinical **LAB** source (the
"Chromatic Architecture" definitions), converted to resolved sRGB hex because `THREE.Color` cannot parse
CSS `lab()`: `--color-panel` `#f5f5f5`→`#f0f2f5`, `--color-ink` `#221f18`→`#06070b`,
`--color-ink-secondary` `#564e3c`→`#5a5d66`, `--color-border` `#d9d2c3`→`#e0e1e5`. Applied at all **seven**
`:root` definition sites (`Module2/index.html`, `Module1/src/shell.css`, and the five topic `index.html`
files) and synced into the root `DESIGN.md` token table. The guidance **accent** (`#1f66b5` + strong/soft),
`success`, the **HP/VP/PP domain encodings**, `solid-fill`, `track`, `bench-grey`, and the Module-1
construction-aid tokens are all deliberately **left unchanged**.
**Why:** It completes the 2026-07-09 clinical-palette reversal — the warm `#221f18` ink and `#d9d2c3`
border were relics of the retired warm-paper era. Cooling only the neutrals harmonizes them to the web
team's cool-neutral clinical source while keeping the one ink-blue guidance accent (Quiet Chrome /
Chrome-Only Blue) and the CVD-tuned Two-Cue domain hues exactly as specified.
**Alternatives rejected:** (a) *Inject the LAB file wholesale* — rejected: it is a foreign shadcn-style
theme whose token names (`--primary`, `--accent`, `--brand`, …) do not map to `--color-*`, whose
`--primary` resolves to an electric `#4c3bf7` (breaks Quiet Chrome), whose `--accent` is a near-white gray
`#f0f2f5` (a semantic inversion of the loud-blue guidance accent), and which carries **no** HP/VP/PP
encodings (breaks Two-Cue). (b) *Also cool the accent and domain hues* — rejected: the accent is the sole
guidance colour and HP-teal/VP-amber are CVD-tuned; both are rule-protected. (c) *Panel-only minimal remap*
— considered, but the fuller neutral set gives a coherent cool ramp.
**Consequences:** Contrast re-measured on white: `ink` **improves** to ~20:1; `ink-secondary` ~6.6:1 (still
AA, below its former AAA-7 headroom); `border` as the scrollbar-pill tint drops to ~1.31:1 (fainter than
the former ~1.50, still above the ADR-032 ~1.28 floor). The Module 1 per-page **boot diagnostics** keep
their hard-coded warm hex — a deliberate pre-CSS fallback exempt from ADR-003 (§8 gap 4), so they remain a
warm island visible only on a boot error. The legacy per-module `DESIGN.md` copies still show the old hex;
they are already superseded by the root file (ADR-022). ADR-003 is unaffected — colours are still read from
tokens at runtime; only the stored values changed.
**Status:** Active

---

## ADR-041: 2D dimensioning is BIS SP 46:2003 Type B — filled 3:1 arrowheads on both the Canvas2D sheet and the Three.js dimension layer

**Date:** 2026-07-11
**Decision:** Both orthographic surfaces gain formal dimensioning. **Points** (`graphics_module_1_topic_3_points/main.js`
`drawCompare()`): distHP / distVP / distRP become Type-B dimensions — extension lines (≈1 mm gap off the
mark, ≈2 mm overshoot), a continuous narrow dimension line, **FILLED** 3:1 arrowheads, and centered value
text over a paper break — replacing the plain mono numbers. **Module 2** (`Module2/src/projectionDrawer.js`):
a new `dimensionGroup` carries overall width / height + distances from HP / VP for the top and front views,
as one 1.0px `--color-ink` `LineSegments2` (extension + dimension lines) with **FILLED** 3:1 triangle
arrowheads carried in a separate `--color-ink` `MeshBasicMaterial` triangle soup (see the 2026-07-11
amendment — originally open chevrons), plus CSS2D `--font-mono` / `--text-xs` labels. The 3:1 ratio is
realised as an isosceles arrowhead of length `L` and
full width `L/3` (half-width `L/6`). Gap / overshoot / arrow sizes are paper-space (a paper spec), the value
text is the true model mm (world extent × 10, ADR-018).
**Why:** SP 46 is the binding Indian drafting standard the lessons teach; plain numbers beside a projector
are not a drawing. The 3:1 arrowhead and the extension-line gap/overshoot are the recognisable Type-B cues.
**Alternatives rejected:** (a) *Open 3:1 chevron arrowheads in Module 2* — **originally chosen** (a filled
arrowhead is a solid polygon that cannot live in a `LineSegments2`, so the open chevron kept the whole dimension
layer in one batched line object — cheap dispose, one `setResolution` target — while preserving the ratio cue),
but **overturned the same day**; see the amendment below. (b) *Auto-add
`dimensionGroup` to the returned `group`* — rejected: it would measure the sheet before the dimensioning
step and fight the fold; instead the consumer parents + step-gates it, exactly like `ppGroup` /
`flatConnectorGroup`. (c) *Scale gap/overshoot in model mm* — rejected: they would shrink/grow with the
drawing; paper-space keeps the standard proportions at any zoom.
**Consequences:** `projectionDrawer.js` header note 3 (which read "3D TextMeshPro dimension labels are NOT
ported") is amended — labels are not ported *as TextMeshPro*, but a CSS2D dimensioning layer now exists
(RULES.md §8.4 — no silent reversal). The layer is **inert until a consumer parents `dimensionGroup`**, so
nothing changes on screen until `Module2/main.js` wires + step-gates it; the `simple_positions` clone's
`projectionDrawer.js` copy is a pending **merge** (RULES.md §1.4/§1.5), not a blind copy — it already
diverges on PP-hinge comments. `drawDimensions:false` suppresses the whole layer. Token discipline holds:
line colour reads `--color-ink`; label DOM consumes `--font-mono` / `--text-xs` / `--color-ink` /
`--color-paper` (ADR-003).

**Amended 2026-07-11 (single group → SPLIT `hpDimensionGroup` + `vpDimensionGroup`, fold-survival — MANDATORY):**
The single `dimensionGroup` described above is **superseded**: the dimension layer **MUST be split into two
groups** to survive the Step-6 cinematic fold. Step 6 folds the VP (and its front view) flat about the ground
line while the HP top view stays put in world space, so a single dimension group parented anywhere is wrong —
parent it to `shapeGroup` and the front-view dims stand upright after the flatten; parent it to `vpFoldGroup`
and the top-view dims fold off the sheet. So `projectionDrawer.js` now emits **`hpDimensionGroup`** (top-view
dimensions) and **`vpDimensionGroup`** (front-view dimensions), and the consumer **MUST** parent
`hpDimensionGroup` to the world `shapeGroup` (stays flat, like `flatConnectorGroup`) and `vpDimensionGroup`
to `vpFoldGroup` (folds down WITH the VP grid + front view). Both are built in the upright world frame, held
hidden until Step 6; `applyDimensionVisibility` toggles **both** groups — and each CSS2D label's own `.visible`,
since the r160 `CSS2DRenderer` ignores ancestor visibility — as a unit. The Step-6 reveal is now a **toggle**
(button swaps *Show dimensions* ↔ *Hide dimensions*), not a one-shot. A single group is a regression; do not
re-merge them. The `simple_positions` clone was brought to **full parity** the same day: its `main.js` now
parents both split groups + gates them on `showDimensionsFlag` behind the Step-6 toggle, closing the
consumer gap recorded in memory `module2-clone-parity-gap`.
**Amended 2026-07-11 (open→filled reversal):** The open-chevron choice for Module 2 (Alternative (a) above) is
**overturned**. SP 46:2003 exam grading marks against the solid BIS wedge, so both orthographic surfaces now use
**FILLED** 3:1 arrowheads (textbook fidelity, ADR-018), not an open "<". Mechanism (`Module2/src/projectionDrawer.js`):
`pushLinearDim` routes each arrowhead into a separate flat `arrowPos` triangle buffer (never the line batch);
`buildArrowMesh` packs it into ONE `MeshBasicMaterial({ color: --color-ink, side: THREE.DoubleSide })` triangle
soup added to `dimensionGroup` — the same filled form `annotations.js` (Bearing Block) already uses. The "a fill
can't live in a `LineSegments2`" objection is resolved by giving the fill its own `Mesh` while the extension +
dimension LINES stay batched; the disposal contract holds because `dispose()` now tears down ANY material (not just
`LineMaterial`) in the same group traversal, so the mesh's geometry + material are freed with the layer. Module 2
is now **wired** (no longer inert): `main.js` parents `activeProjection.dimensionGroup` under `shapeGroup` in
`refreshProjections`, gates it on a new `showDimensionsFlag`, and a Step-6 "Show dimensions" button (`stepper.js`
→ `simController.setDimensions`) reveals it with a draw-on fade — the r160 `CSS2DRenderer` ignores ancestor
visibility, so the numeric labels get their own per-object toggle. The `simple_positions` clone **merge landed**
(`projectionDrawer.js` forward-copied); its stale `projectPP` comment (PP hinge about *local Y / the VP∩PP line*)
was reconciled to *local X / the HP∩PP line* to match that clone's own `main.js` fold (`PP_FOLD_TARGET`).
**Status:** Active (Module 2 arrowheads **overturned open→filled** the same day; dimension layer **split into
`hpDimensionGroup` + `vpDimensionGroup` for fold-survival** and made a Show/Hide toggle; `simple_positions`
clone at full parity — see amendments)

---

*This log was assembled by reading ARCHITECTURE.md, the saved session-memory notes, both modules'
CHANGELOG and CLAUDE files, and the DESIGN docs. Where evidence was thin it says so. Add new ADRs
at the bottom using ADR-000.*
