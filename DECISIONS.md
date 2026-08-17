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
**Amended 2026-07-14 (rounded cards):** The 2026-07-10 border amendment above (no top border /
flush seam so the rail reads as one continuous surface with the 2D pane) is **overturned** for
the Points 50/50 split. The split now renders **three separated rounded cards** —
`#sim-viewport`, `#compare-card`, `#workbench-rail` — each carrying its own `1px
var(--color-border)` + `var(--radius-md)` + paper fill, floating on a `var(--color-panel)` gray
grid backdrop (`gap` / `padding: var(--space-4)` on `body.compare-split`). The gap and the gray
background now carry the "one surface" separation that the flush seam used to; box-shadow stays
off (docked surfaces don't earn the transient-overlay shadow — Flat-Ink rule holds). This
officially adopts the rounded-card layout that shipped as a same-day trial earlier
2026-07-14 (see `points-compare-workbench` memory) — no longer a trial.
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
**Amended 2026-07-14 (rounded cards + rail toggle):** Two changes. (a) The split's layout is now
the rounded-card treatment (see ADR-021's 2026-07-14 amendment) instead of the flush-seam one
this ADR originally shipped with. (b) **New clause:** the workbench rail is default-visible upon
entering the split but features a dedicated hide/reveal toggle (`#rail-toggle`, `main.js
setupRailToggle`) for a full-screen mode — collapsing it drops the rail's grid row so
`#sim-viewport` and `#compare-card` reclaim the freed height, resized via the existing
`remeasureAfterReflow()` double-rAF helper. The rail toggle is a separate control from the
wizard chevron (`#wizard-toggle`, unchanged) — collapsing the rail does not exit the split, and
exiting the split (or re-entering it) always resets the rail back to shown.
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
**Status:** Active for the Lines topic (`Module1/lines.js`), which this ADR governs. Module 2's
Compare drawing had adopted the same fixed-scale *pattern* by convention (not this ADR — a
different file/sim) and has since moved off it; see **ADR-052**, which does not alter Lines.
**Superseded 2026-07-20 (ADR-075)** for the two standalone Lines topics
(`graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`) only — they now use ADR-053's
intrinsic-TL scale model. This ADR remains **Active, unchanged**, for the legacy `Module1/lines.js`.

**Amended 2026-07-19 (ADR-072):** `SHEET2D_SPAN` in the standalone Lines topics
(`graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`, both descended from `Module1/lines.js`
via ADR-033) is **`150`**, not the literal `(SHEET/2)*10 = 300` this ADR originally specified.
`150` frames the True-Length slider max (the Points-consistent "frame the slider max" pattern, so
a typical 60–150 mm drawing fills the sheet instead of floating tiny inside a worst-case-sized
one). This is a **narrower**, not larger, span than the original derivation, so the "guarantees the
absolute worst case stays inside" property this ADR's Alternatives-rejected clause protected
against is now traded away for a rare over-range line — accepted per §5.19's own fallback ("extends
past the sheet edge rather than shrinking the drawing"). The rule that the span must be a *named,
principled fixed constant* (never a data-dependent auto-fit, never a bare unexplained magic number)
is otherwise unchanged and still governs both topics identically. **Still Active** for the legacy
`Module1/lines.js` at the original `(SHEET/2)*10` value — this amendment applies only to the two
standalone topics named above.

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

## ADR-042: The `rebuild()` disposal contract MUST deep-`traverse()` — a shallow child loop leaks nested `THREE.Group` hierarchies

**Date:** 2026-07-12
**Decision:** The single-`rebuild()` disposal contract (ADR-004) disposes GPU resources by
**deep-traversing** every top-level child of the geometry group —
`for (const child of shapeGroup.children) child.traverse(disposeObj)`, where `disposeObj` frees an
object's geometry, every material, and any texture map — **not** by a shallow one-level loop over
`shapeGroup.children`. Landed in `graphics_module_1_topic_4_understanding_orthographic_views/main.js` (the `disposeObj`
helper + the traversal) and **backported to `template_starter/main.js`**, so every future topic cut
from the starter (ADR-009's copy-and-simplify discipline) inherits the deep contract by default.
**Why:** The Glass Box domain build assembles its content as **nested `THREE.Group` hierarchies** —
the glass box, the central solid, the projectors, and the orbiting Observer are each a sub-group of
`shapeGroup`. The starter's original shallow loop disposed only a **direct** child's *own*
geometry/material, and a `Group` node carries neither — so for grouped content it freed **nothing**
and would exhaust the WebGL context across rapid rebuilds (the "most likely late-stage bug" ADR-004
guards against). Verified against the shipped Glass Box module: with the deep traverse,
`renderer.info.memory` held **flat at 16 → 16 geometries / 0 textures** across 50 `simAPI.reset()`
rebuilds plus 30 quick-view switches.
**Alternatives rejected:** (a) *Keep the shallow child loop and mandate flat, un-nested geometry*
(every mesh a direct child of `shapeGroup`) — rejected: it pushes a fragile invariant onto every
future domain build (one nested `Group` silently leaks the whole subtree) to save a one-line
traversal, and grouping is the natural, readable way to assemble a domain scene. (b) *Dispose the
whole scene/renderer each rebuild* — rejected: it would tear down the persistent reference grid,
lights, and cameras the contract deliberately keeps **out** of `shapeGroup`, and is far more work
than freeing the per-frame subtree.
**Consequences:** `shapeGroup` children may now be nested `Group`s freely; disposal is a shared
`disposeObj(obj)` primitive (`geometry?.dispose()` + every material + `map`). RULES.md §3.3 is
updated to require the deep traversal and cites this ADR; a topic that reintroduces a shallow
one-level loop is a regression (RULES.md §8.4). The fixed grid / lights / cameras must stay outside
`shapeGroup` so the traverse never frees them. Any EG topic derived from `template_starter` now
carries the fix without re-discovering the leak.
**Status:** Active (refines the ADR-004 disposal contract; does not overturn it)

---

## ADR-043: The Glass Box reference planes use functional hue-tinted glass, not paper-tinted, to stay visible on the white viewport

**Date:** 2026-07-12
**Decision:** In the Glass Box Visualizer (`graphics_module_1_topic_4_understanding_orthographic_views/src/glassBox.js`)
the three reference planes are filled with **functional hue-tinted glass** — each pane tinted its
**own** domain hue (HP floor **teal** `--color-hp-line`, VP back wall **amber** `--color-vp-line`,
PP side wall **violet** `--color-pp-line`) at a low `FILL_OPACITY = 0.09` with a solid same-hue
border — **not** the neutral "paper-tinted" fill the original build brief specified.
**Why:** A paper/white fill (`--color-paper` is `#ffffff`) is **invisible** against the pure-white
sim viewport — the panes would vanish and leave only their edges, defeating the whole "object sits
inside a glass box" mental model. Tinting each pane its own functional hue makes the glass read as a
real surface **and** does double duty as that plane's Two-Cue hue signal, reusing the platform's
existing viewport colour encodings (HP teal / VP amber) rather than inventing new chrome.
**This strictly upholds the Two-Cue Rule (§4.6):** colour is never the sole cue — each pane still
carries its solid border, its label, and its fixed spatial position (floor / back wall / side wall),
so the plane's identity survives even if the faint 0.09 fill is not perceived.
**Alternatives rejected:** (a) *Paper/neutral-white fill as briefed* — rejected: invisible on the
white viewport. (b) *A single neutral-grey tint on all three panes* — rejected: it would separate
glass from background but throw away the free Two-Cue reinforcement and force the learner to tell
three identically-coloured panes apart by position alone. (c) *Raise the opacity so a neutral fill
shows* — rejected: a heavier fill occludes the solid and its projected views **inside** the box and
drifts toward the banned glassmorphism / PBR "architectural-viz" look (PRODUCT.md anti-references).
**Consequences:** A documented deviation from the brief, recorded at `FILL_OPACITY` in
`glassBox.js`. The tint reads **domain** hues only, so §4.5 (Chrome-Only Blue) still holds — no blue
enters the viewport. Token discipline holds: every fill and border colour is read from a
`--color-*-line` token, none hard-coded (ADR-003). If a future pane ever needs a distinct non-hue
tint, it must be declared as its own token, not inlined.
**Status:** Superseded by ADR-044 (the fill is gone; the plane is now a grid matrix)

---

## ADR-044: The Glass Box reference planes are calm grid matrices, not hue-tinted glass — and the Profile Plane moves to +X to fix a first-angle handedness bug

**Date:** 2026-07-13
**Decision:** In `graphics_module_1_topic_4_understanding_orthographic_views/src/glassBox.js`, the three reference planes
drop the hue-tinted glass fill (ADR-043) for a calm **grid matrix** (a 12×12 lattice of faint
same-hue lines, `GRID_OPACITY = 0.30`) plus a thick same-hue border, all rendered as
`LineSegments2` (no mesh fill at all). Separately, the **Profile Plane moves from x = −H to
x = +H** — the object is now viewed from −X for the Side view, so its image casts onto the PP at
+X, and the PP's fold hinge flips from −π/2 to +π/2 (`PP_FOLD_ANGLE`) so it swings to the RIGHT of
the fixed VP when unfolded. *(Fold clause superseded by ADR-049 — the PP now folds DOWN onto the
HP, Module 2 parity; the +X placement and −X viewing direction stand.)*
**Why:** Two independent problems. (1) The hue-tinted glass fill (ADR-043) was a workable fix for
visibility, but a build audit found the grid-matrix look reads more like a drafting instrument
(the "graph paper you can see through") and avoids any residual translucency artifacts stacking
with the new bounding-box projector rays (ADR-046) once four dashed ray-batches plus three fills
plus the fold's dissolve-opacity animation were all live in the same view. (2) The **orientation
bug**: with PP at −X, the Left-hand Side View's fold hinge swung the PP to the LEFT of Front —
first-angle projection puts the **Left**-hand Side View to the **right** of the Front view (the
object is imagined rolling rightward past the observer, HP down / PP right). The −X placement had
been carried through three earlier build phases (glass-box-domain-build memory, ADR-036, ADR-038)
without the handedness ever being checked against BIS/first-angle convention until this pass.
**Alternatives rejected:** (a) *Keep the hue-tinted fill, just move PP* — rejected: doesn't address
the layering-artifact concern once bounding-box projectors (ADR-046) added a fourth translucent
layer per pane. (b) *Keep PP at −X and mirror the 2D Compare sheet layout instead* (Side view drawn
top-left, Front top-right) — rejected: this is the "flagged divergence" the 2026-07-12 completion
memory recorded as unresolved; reorienting the 3D fold to match the correct first-angle convention
is the textbook-correct fix, not papering over it in the 2D sheet.
**Consequences:** `VIEW_DIR.side` now casts from `(−1,0,0)`; `projectToPlane('side')` and every
PP-tagged buffer in `castProjectors()` target `x = +H`. The exploded pane offset (`half`) is no
longer a fixed constant — it is now computed per rebuild from the domain object's live bounding box
(see ADR-045), so `createGlassBox()`/`castProjectors()` take an options object instead of positional
args. `--color-hp/vp/pp-line` tokens are still the only colour source (ADR-003 unaffected).
**Status:** Active — grid matrices + PP placement stand; the PP **fold clause** superseded by ADR-049

---

## ADR-045: The Foundations Bearing Block becomes the Glass Box Visualizer's domain object, replacing the placeholder box solid

**Date:** 2026-07-13
**Decision:** `graphics_module_1_topic_4_understanding_orthographic_views` no longer suspends a plain `BoxGeometry`
placeholder inside the glass box. It copies `graphics_module_1_topic_1_foundations/src/bearingBlock.js`
verbatim (the pillow-block housing generator — base, mounting holes, boss, through-bore) into its
own `src/`, imports `createBearingBlock()`, and scales it down (`BLOCK_SCALE = 0.42`) to float
inside the exploded reference box.
**Why:** A plain box solid taught nothing about *why* orthographic projection matters — every one
of its three views is a trivial rectangle. The Bearing Block is a real, already-built, non-trivial
part (round bore, mounting holes, a curved boss) that makes the three cast views visibly different
from each other, which is the entire pedagogical point of the glass-box mental model. Reusing the
Foundations generator (rather than authoring a new solid) keeps a single geometry source for the
"same object, two lessons" pairing across Module 1 Topic 1 (hidden-line classification) and Topic 4
(orthographic projection) — a learner who has seen the block once recognizes it here.
**Alternatives rejected:** (a) *Author a new, simpler solid just for this topic* — rejected: extra
generator code for no pedagogical gain the Bearing Block doesn't already provide, and it forfeits
the cross-topic recognition. (b) *Import `bearingBlock.js` via a relative `../` path instead of
copying it* — rejected: violates ADR-009 (no shared code library; topic clones are manual full
copies) and would couple two independently-deployed sim payloads at runtime.
**Consequences:** The block's generator-authored scale (~9 units) no longer matches the old fixed
`BOX_HALF = 2.6` constant, so the exploded plane offset is now *derived*: `main.js`'s
`buildBearingBlockSolid()` computes the scaled block's `THREE.Box3`, and `paneHalf` = its largest
half-extent + a fixed `PANE_MARGIN`. This also feeds the Observer's orbit distance and the 2D
Compare sheet's fixed bounds (ADR-038 unaffected — the sheet is still locked to a static value, just
one now computed once per rebuild instead of hand-tuned). If `bearingBlock.js` changes in
Foundations, this topic's copy must be updated by hand (ADR-009's known cost).
**Status:** Active

---

## ADR-046: Projector rays cast from the object's bounding-box corners, not every mesh vertex

**Date:** 2026-07-13
**Decision:** `castProjectors()` in `glassBox.js` casts its dashed projector rays and 2D view
outlines from the domain object's axis-aligned `THREE.Box3` — its 8 extreme corners and 12 box
edges — rather than the object's real mesh vertices.
**Why:** The Bearing Block (ADR-045) is a non-convex CSG-style mesh with dozens of vertices (base
corners, two mounting-hole rims at 24 segments each, the bore rim, the boss dome). Casting a
projector ray from every vertex to every one of the three planes would draw an unreadable spiderweb
that obscures the very views it's meant to explain — the opposite of the lesson's goal. The
bounding box gives exactly 8 corners and a clean rectangular "envelope" projection on each pane,
which is legible at a glance and still visually correct: the object's true silhouette is always
inside its bounding-box projection.
**Alternatives rejected:** (a) *Cast from every mesh vertex* — rejected per above (spiderweb). (b)
*Cast from the convex hull* — rejected: still tens of points for this part, and computing/maintaining
a hull is unwarranted complexity for a teaching aid whose point is the glass-box concept, not exact
silhouette tracing. (c) *Hand-pick a handful of "interesting" vertices per part* — rejected: not
generic, breaks if the domain object ever changes.
**Consequences:** The 2D Compare sheet (`drawCompare()`) also draws the bounding-box outline (it
consumes the same `solidData.verts/edges`), so the 3D projector view and the 2D drawing are always
the same simplified envelope — consistent, if a deliberate simplification a learner should be told
is "the object's extent," not "the object's exact outline." `castProjectors()` now returns
`userData.views`/`userData.rays` keyed per plane (`hp`/`vp`/`pp`) instead of one flat group, so a
guided step (ADR-047) can show a single plane's cast in isolation.
**Amended (2026-07-13):** the bounding-box simplification now applies **only to the dashed
projector rays** (still 8 rays per plane, from the Box3's extreme corners — the spiderweb argument
above stands for rays). The **2D view outlines drawn on the planes must trace the true domain
geometry silhouette**: a rectangular envelope on the pane taught the wrong lesson — the learner saw
"a box" where the cast view should show the Bearing Block's real profile (dome, base, hole rims),
which is the entire point of casting a view. The silhouette comes from `THREE.EdgesGeometry` on the
block's merged geometry at a threshold above its 15° curve-facet angle (so smooth surfaces stay
clean and only true creases/rims survive), carried as `solidData.silhouette` alongside the
unchanged `verts/edges` bbox corners. `drawCompare()` consumes the same silhouette so the 3D pane
views and the 2D sheet stay the same picture (the consistency invariant above is preserved, now at
true-silhouette fidelity). Segments that degenerate to a point in a given view (edges parallel to
that view's sight axis) are skipped per view.
**Status:** Active (amended 2026-07-13 — bbox for rays only; view outlines trace the true silhouette)

---

## ADR-047: The Glass Box view-switcher moves off the viewport into a 5-step guided sequence, driven by a single `renderStep()`

**Date:** 2026-07-13
**Decision:** The Top/Front/Side quick-view buttons move out of the 3D viewport's floating
top-left cluster (`.vp-cluster`, now deleted along with the never-wired connector-line toggle) and
into the Step 3 panel of a new 5-step guided wizard: **1** The Object, **2** The Reference Planes,
**3** Lines of Sight, **4** The Glass Box, **5** The 2D Drawing. A new `renderStep(step)` in
`main.js` is the single function that decides which domain layers (the block+Observer, the
grid planes, each plane's view outline + dashed rays, the Observer's sight lines, the fold, the
Compare split) are visible for a given step; `stepper.js` calls `sim.onStepChange(n)` on every
Next/Back/rail-jump so `renderStep` fires on every transition.
**Why:** The original quick-view chips let a learner jump straight to "Front" before the object,
the planes, or the projection concept had been introduced — useful as a bench control, wrong as a
first encounter. Folding the view-switcher into a guided step, and gating every other layer
(planes, rays, sight lines, the fold) behind the SAME step sequence, turns the sim from "a bench
with everything visible at once" into a taught progression: see the object, see the planes appear,
learn to cast one view at a time, then see all three at once, then watch them unfold flat. This
mirrors the Foundations topic's existing 4-step wizard pattern (ADR-029) rather than inventing a
new interaction model.
**Alternatives rejected:** (a) *Keep the quick-view chips in the viewport AND add the step gating
separately* — rejected: two controls doing overlapping jobs invites them to drift out of sync (a
chip click during Step 1 would show a view the lesson hasn't introduced yet). (b) *Gate visibility
per-step inside `stepper.js`* — rejected: violates the leaf-module layering rule (CLAUDE.md
"leaves don't cross-import") — `stepper.js` cannot own THREE.js scene-graph visibility; it now only
calls one hook (`onStepChange`) back into the orchestrator, which owns the scene.
**Consequences:** `main.js` no longer boots straight into the Compare split
(`BOOT_INTO_COMPARE_SPLIT` flipped to `false`, overturning the Phase-4 scaffold's boot-into-split
default) — Step 5 opens it instead, via the same `renderStep()` call. `simAPI.reset()` now also
resets `currentStep` to 1. The Observer's sight lines and each plane's dashed rays gained a
gating layer (`sightAllowed`/`rayAllowed` in `main.js`) that `applyFoldPose()` ANDs against its own
fold-dissolve visibility, so the two visibility sources (which step is active vs. how far the fold
has progressed) never fight for control of the same `.visible` flag. **Trap found + fixed in the
same pass:** `body.compare-split #wizard { display:none }` (ADR-037) hides the entire wizard —
rail, Back button, Reset — the instant Step 5 opens the split, so a learner who reached Step 5 had
no way back to Step 4 short of reloading the page. Fixed with one ghost "← Back to Step 4" button
docked in `#workbench-rail` (which stays visible in compare-split), wired to a new `stepper.back()`
that steps to `currentStep − 1`.
**Status:** Active

---

## ADR-048: QA cleanup pass on the (now-renamed) "Understanding Orthographic Views" topic — rename, camera default, dead-UI purge, Reset fix

**Date:** 2026-07-13
**Decision:** Four changes to `graphics_module_1_topic_4_understanding_orthographic_views` (folder
and product renamed from "Glass Box Visualizer"/`..._glass_box`, ADR-024 slug + §1.12 title-parity
compliance unaffected by the rename): (1) the default 3D perspective camera pose moves from
top-right-front `(8.5, 6.5, 10)` to top-left-front `(-12, 8, 12)` — new **RULES.md §5.20**; (2) the
unwired "Practice problems" entry button, its full-viewport dialog, and the active-problem header
DOM + CSS are deleted outright — this topic never wired a `problemLibrary.js`, so the button opened
an empty shell; (3) `src/uiManager.js` — which owned the Reset button's two-state confirm but was
never imported by `main.js` and targeted a parameter dock (`ctl-shape`, sliders) this topic doesn't
have — is deleted, and its Reset wiring is reimplemented directly in `main.js` as
`setupResetControl()`, routed through the single `window.simAPI.reset()` path (§2.9); (4) Step 3
gains explicit action copy ("Click the buttons below to move the Observer.") and a new
`showToast()` helper fires "Lesson complete" on first reaching Step 5.
**Why:** A QA pass written against the platform's other engine (Module 1's `initSim(cfg)`) surfaced
that this topic — built on the Module-2 orchestrator pattern (ADR-033) — has no `cfg`, no
`cfg.problems`, and no `STEPS` array in `main.js`; translating the QA intent onto the real
architecture surfaced that Reset was silently dead (the confirm markup existed, but nothing live
called it) rather than merely mis-styled. The camera default follows the "layout reads
left-to-right" rationale: Top/Front/Side cast to the object's top/back/left faces (first-angle), so
starting the eye on that same top-left side previews how the unfolded drawing will read.
**Alternatives rejected:** *Add `cfg.problems`/an `initSim(cfg)` shim to satisfy the QA brief
literally* — rejected: would duplicate Module 1's engine inside a Module-2-pattern topic, violating
the no-cross-architecture-conflation rule (§7.6/§7.7) for no real benefit, since this topic has no
problem-library content to gate.
**Consequences:** The topic's served URL changes to
`graphics_module_1_topic_4_understanding_orthographic_views/`; every cross-file path reference
(ARCHITECTURE.md §2, root CHANGELOG.md, this file's ADR-042/043/044/045 path strings, the topic's
own CLAUDE.md/CHANGELOG.md) was swept to match — historical ADR narrative text describing the
former "Glass Box" build is left as-written (append-only log, §8.4). `.reset-confirm*` CSS is now
shared solely by `main.js`'s `setupResetControl()` (its other consumer, the Practice-problems
"load problem" confirm, was deleted in the same pass).
**Status:** Active

---

## ADR-049: The Profile Plane folds DOWN onto the HP (Module 2 parity), the reference planes explode apart with CSS2D name pills, and the Observer becomes a flat CSS2D icon

**Date:** 2026-07-13
**Decision:** Four coupled geometry/aid changes to `graphics_module_1_topic_4_understanding_orthographic_views`:
(1) **PP fold reversal** — the PP no longer swings sideways into the VP plane about the VP∩PP edge
(`+π/2` about Y, ADR-044); it now hinges **DOWN onto the HP about the HP∩PP line** with
`PP_FOLD_ANGLE = −π/2`, the same −90° drop as Module 2's `PP_FOLD_TARGET`. Its hinge pivot is
**nested inside the HP hinge's inner group**, so the flattened PP rides the HP's own +90° swing into
the VP plane — the Side view lands **beside the Top view** (bottom-right, Module 2's 4th-quadrant
layout, Top and Side sharing the depth axis). `drawCompare()` moves the 2D Side view to match
(beside Top, `projSide = (y right, z down)` read off the fold's landing pose).
(2) **Exploded planes** — each pane keeps its `[−paneHalf, paneHalf]` in-plane span but sits at
`planeOffset = paneHalf + PLANE_EXPLODE_GAP` on its normal axis, so the three grid planes share no
vertices and a visible air gap separates their edges; the fold hinges sit at the offset lines
(ground line `(0,−D,−D)`, HP∩PP line `(+D,−D)` along Z), which lands everything coplanar with the
VP and carries the explode gap into the flat layout as sheet separation.
(3) **CSS2D plane pills** — "HP"/"VP"/"PP" `CSS2DObject` pills (Module 2's `.plane-label`
convention, already in this topic's starter CSS) attach to each pane's outer edge and ride its fold
hinge; they fade with the Step-2 plane reveal via element opacity + their own `.visible`.
(4) **CSS2D Observer** — the wireframe camera assembly (body box + lens frustum, ~40 fat-line
segments) is replaced by a flat CSS2D eye-glyph icon (`.observer-icon`): a viewport AID should be
the lightest thing that reads, and a DOM glyph costs zero geometry and always faces the camera.
**Why:** (1) The old sideways PP fold contradicted the platform's reference implementation —
Module 2 established (and documents at `PP_FOLD_TARGET`) that the profile plane folds down onto the
HP, landing the side view beside the top view; two topics teaching two different unfold layouts for
the same concept is exactly the cross-module drift RULES.md §7 exists to prevent. (2) The corner-box
panes previously shared corner vertices, reading as one welded solid rather than three independent
planes — the "exploded" mental model the lesson narrates was not what the scene showed. (3/4) With
three separated planes the learner needs the names ON the planes, and the wireframe camera cost
real geometry + disposal bookkeeping for an aid whose only job is "the eye is here."
**Alternatives rejected:** (a) *Keep the PP fold world-sibling (Module 2's parenting) instead of
nesting it in the HP hinge* — rejected: in Module 2 the HP is the FIXED plane so a sibling works;
here the VP is fixed and the HP itself folds, so a world-sibling PP would land on a plane that then
rotates away without it. Nesting composes the two hinges so "PP onto HP, HP into VP" reads as one
continuous physical unfold. (b) *Explode the panes by growing their span instead of offsetting
them* — rejected: shared corner vertices are the artifact being removed; a bigger welded corner box
is still a welded corner box. (c) *An SVG texture sprite for the Observer* — rejected: a texture is
GPU state to dispose and mip-blur at glancing angles; the CSS2D node needs neither.
**Consequences:** `createGlassBox()`/`castProjectors()` take `offset` alongside `half`;
`projectToPlane()` and the rays/views/sight-lines all land at `±planeOffset`. ADR-044's PP
**placement** (+X) and viewing direction (−X) stand; only its fold clause is superseded. The r160
CSS2DRenderer-ignores-ancestor-visibility gotcha (Module 2) now applies here: the pills and the
Observer icon get their own `.visible` writes in `applyPlaneOpacity()`/`applyFoldPose()`, and the
disposal traversal pulls CSS2D DOM nodes from the overlay per RULES.md §3.5 (`disposeObj` handles
`isCSS2DObject`), since the auto-remove listener only fires for a directly-removed child, not a
descendant of a cleared group.
**Status:** Active (supersedes ADR-044's fold clause; ADR-044's PP placement stands)

---

## ADR-050: Pane view outlines are dimension-constructed 2D drawings; the dashed bounding-box projector rays are removed

**Date:** 2026-07-13
**Decision:** Three coupled QA-polish changes to `graphics_module_1_topic_4_understanding_orthographic_views`:
(1) **Exact 2D views** — `castProjectors()` no longer projects an EdgesGeometry-extracted 3D
silhouette per pane; it constructs each view's segments directly from the Bearing Block's dimension
table (`BEARING_BLOCK_DIMS × BLOCK_SCALE`, computed in `main.js` and passed as a world-unit `dims`
object — glassBox.js stays a THREE-only leaf, ADR-007 star rule). Front (VP): base rectangle + body
sides to the dome spring line + a 32-chord dome semicircle, with NO line at the spring line (the
dome springs tangentially — body width equals the boss diameter). Top (HP): base outer rectangle +
the body's two longitudinal edges (its front/back edges coincide with the base rectangle). Side
(PP): ONE seamless outer rectangle from foot bottom to dome top (base, body and dome share the full
depth, so no interior edge exists).
(2) **Projector-ray purge** — the dashed 8-corner bounding-box rays (`buildRays`, `rayByPlane`,
`rayAllowed`, `userData.rays`) are deleted end-to-end; the panes display only the 2D drawing
outlines. Step gating renames `rayAllowed` → `viewAllowed` and drives the outlines directly; the
Step-3/Step-4 dock copy no longer mentions dashed projector lines.
(3) **Tighter Step-2+ framing** — `FRAME_MARGIN` drops 1.18 → 1.08 so the three exploded grids fill
the camera with a small breathable margin (`FRAME_MARGIN_TIGHT` 1.03 for Step 1 unchanged).
**Why:** The extract-then-filter pipeline (amended ADR-046 + the Part-3 `sideFix` seam filter/apex
injection) was a chain of patches fighting EdgesGeometry's per-view blind spots — false seams to
subtract, culled tangents to re-inject — and visual QA still found artifacts. The block's views are
closed-form: constructing them from the dimension table is shorter, exact by definition, and
matches how a draughtsman authors a multiview drawing. The rays read as clutter over the now-exact
outlines and duplicated what Step 3's sight lines already teach.
**Alternatives rejected:** (a) *Keep EdgesGeometry and grow the per-view filter set* — rejected:
every new geometry feature would need new filters; exactness by construction beats exactness by
subtraction. (b) *Import `BEARING_BLOCK_DIMS` into glassBox.js* — rejected: breaks the leaf rule
(ADR-007); main.js owns the scale and passes world numbers in.
**Consequences:** `castProjectors({ offset, resolution, dims })` — the `verts`, `silhouette` and
`sideFix` parameters are gone, as is `userData.rays`. `solidData.silhouette` (EdgesGeometry) still
exists in main.js solely for the 2D Compare sheet's `drawCompare()`; the pane outlines and the
Compare sheet no longer share one segment source (the ADR-046/049 consistency invariant is
narrowed to the Compare sheet). `solidData.verts` still feeds the Step-3 sight lines.
**Status:** Active (supersedes the amended ADR-046's view-outline pipeline and the Part-3 `sideFix`
corrections; ADR-046's bounding-box treatment survives only in the sight lines' 8-corner cast)

---

## ADR-051: Module 2 gains the Compare 50/50 workbench (ADR-037 pattern); the rail deliberately overrides per-step disclosure with the full geometry driver set

**Date:** 2026-07-15
**Decision:** Port the Points topic's finished Compare workbench (ADR-037/021/034/038) to `Module2`
(orthographic projection of solids), which previously had no Compare chrome at all — its only 2D
representation was the in-scene flattened answer sheet from the Step-6 fold. Two Module2-specific
adaptations, since it diverges structurally from the Points reference:
(1) **Rail contents** — Module2 has no `[data-ctrl]` dock (Points had one `#controls` with 4 fixed
wrappers); its sliders are distributed across per-step `.step-panel`s. The rail docks **all 7**
`[data-ctrl]` wrapper groups covering the 8 continuous geometry drivers (`size` = base length +
height, `resting`, `disthp`, `distvp`, `roty`, `anglehp`, `anglevp`) **at once** while the split is
open — a deliberate override of the wizard's one-idea-per-step disclosure, enabling a "solve &
verify" altitude (adjust any driver, watch the 2D sheet update live). Shape selection, Add, and the
mode toggles (orient-to-corner, face-inclination HP/VP) stay in the wizard — not continuous drivers,
and the wizard is unreachable while the split is open anyway. Each wrapper's original
`{parent, nextSibling}` is captured on first re-parent so `exitWorkbench()` restores it to its exact
home slot (two different Step panels, not one shared dock).
(2) **`drawCompare()`'s data source** — rather than re-deriving edge visibility classification (view-
dependent, camera-independent-but-per-plane, already correctly implemented in
`projectionDrawer.js`'s `classifyEdge`/`visibleInHP`/`VP`/`PP`), it reads the ALREADY-BUILT
`LineSegments2` objects on `activeProjection.hpGroup`/`vpGroup`/`ppGroup`/`flatConnectorGroup`
directly (their `instanceStart`/`instanceEnd` attribute buffers), then applies the exact same
analytic flatten the 3D scene's own Step-6 fold uses (`vpFoldGroup`'s +90° about Z, `ppHingeGroup`'s
−90° about local X — both derived from `projectHP`/`VP`/`PP` and the `flatConnectors` construction in
`projectionDrawer.js`), so the 2D sheet always agrees with the in-scene answer sheet with zero
duplicated geometry logic. One additive line in `buildSegments()` tags `segments.userData.hidden =
dashed` so the consumer can tell solid from occluded without relying on unverified `LineMaterial`
getter behaviour.
**Why:** Re-deriving edge classification a second time in `main.js` would duplicate
`projectionDrawer.js`'s already-correct, already-tested convex-solid visibility logic and risk the
two views (3D fold vs. 2D canvas) silently disagreeing after a future edit to one but not the other.
Reading the built linework back out keeps ONE source of truth.
**Alternatives rejected:** (a) *Mirror one representative driver per step into the rail* — rejected:
the user explicitly wanted the full set surfaced at once for cross-checking a solved problem, not a
curated subset. (b) *Re-run `buildEdgeMap` + reclassify in `main.js`* — rejected per the "why" above.
(c) *Read `material.dashed` instead of tagging `userData`* — rejected: not confirmed as public/stable
API from this codebase's own usage; a one-line additive tag is unambiguous and low-risk.
**Consequences:** `projectionDrawer.js`'s `buildSegments()` now sets `userData.hidden` on every
`LineSegments2` it returns (additive, does not change `ProjectionResult`'s shape). Compare gate =
`showProjectionsFlag` (Step 4 top+front), mirroring Points' `showHP && showVP`; the side (PP, violet)
line is added only once `showSideViewFlag` (Step 5) is on. Verified headless (Chrome via CDP, PID-
scoped kill): 50/50 split activates, both panes measure to half width, both canvases' backing stores
resize, the 2D sheet paints real non-blank linework (pixel-sampled) that grows when the side view is
revealed, the `#rail-toggle` collapsed state lands at exactly `var(--space-6)` (32px) off the
viewport corner, and all 7 drivers restore to their correct home Step panel on exit — 31/31 checks,
zero console errors.
**Status:** Active
**Amended 2026-07-15 (rail layout):** The single non-wrapping flex row of fixed-172px fields
(above) held for the initial port but did not scale once the full 8-driver set was checked against
the rail at split width — the row ran wider than the bench and relied on `overflow-x:auto` to hide
the excess, and the floating `#rail-toggle` pill (a grid sibling pinned to the rail's top-left) had
no reserved clearance from the first field row. `body.compare-split #workbench-rail` now lays the 7
`[data-ctrl]` wrappers out as a `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`
instrument grid (wraps into new rows as the bench narrows, no horizontal scroll), with
`#workbench-rail .field` losing its fixed 172px width to fill its cell, and a
`calc(44px + var(--space-4) + var(--space-3))` top padding on the rail that reserves a clear band
under the toggle at every width (toggle is a grid sibling, unaffected by the rail's own padding).
Verified headless (Chrome via CDP, PID-scoped kill): the 8 fields wrap into 2 grid rows at split
width, the toggle clears all 8 field rects with a 12.6px gap, and no field overflows the rail's
horizontal bounds.

---

## ADR-052: Module 2's `drawCompare()` projects through the answer-sheet camera, not a same-axis passthrough; its scale auto-fits the card

**Date:** 2026-07-15
**Decision:** `drawCompare()`'s flatten functions now compose TWO transforms per point, not one:
(1) the analytic fold each group's own pivot applies (unchanged from ADR-051 — VP's +90° about Z:
`(x,y,z)→(−y,x,z)`; PP's −90° about local X at its `z0` hinge: `(x,y,z)→(x,z,z0−y)`), then (2) the
answer-sheet camera's own top-down projection: `(sheetX, sheetY) = (−worldZ, −worldX)`. (2) was
missing entirely — ADR-051 stopped at the fold and wrote the folded world `(x, z)` straight to the
canvas, an implicit assumption that camera-space equals world-space, which is only true for a
camera looking down −Y with up = +Z. This sim's actual answer-sheet camera
(`swoopToAnswerSheet`/`QUICK_VIEWS.top.dir=(0,1,0)`, `FLAT_VIEW_UP=(−1,0,0)`) looks down −Y with
up = −X — a 90°-rolled top view — so the passthrough put the front view LEFT of the top view and the
side view BELOW it, a 90° rotation off the 3D pane's own rendered fold (front above top, side right
of top). The projection direction was re-derived from the camera basis
(`screenRight = cross(forward, up) = cross((0,−1,0),(−1,0,0)) = (0,0,−1)`, i.e. `screenX ∝ −worldZ`;
`screenUp = up = (−1,0,0)`, i.e. `screenY(up) ∝ −worldX`) and cross-checked pixel-for-pixel against
a screenshot of the 3D pane's flattened Step-6 state. The point-to-point projectors
(`flatConnectorGroup`) are also no longer drawn on the sheet — they read as clutter once the layout
is correct; that connector set still serves the 3D pane's own upright/fold view
(`showConnectorsFlag`). Separately, the sheet's scale switches from a fixed mm span to **auto-fit**:
it measures every point it is about to draw (views + visible dimension geometry + captions) and
scales+centres to fill the card with a constant pixel margin — true size stays readable off the
dimension numerals. This auto-fit applies **only to Module 2's Compare sheet**; it does not touch
or reverse **ADR-038**, which governs the Lines topic's separate 2D sheet (`Module1/lines.js`) and
remains Active there for the reason ADR-038 states (measured-drawing fidelity matters more when the
sheet has no numeric dimension layer to fall back on).
**Why:** The 2D Compare card exists so a learner can check their by-hand drawing against the sim's
answer — that only works if the sim's own two representations (3D fold, 2D sheet) agree. A silent
90° mismatch between them defeats the feature's purpose. Auto-fit was chosen (over retuning the
fixed mm span) because Module 2's solids vary far more in size (base/height 1–70 mm) than Lines'
single line geometry, so any fixed span is either too tight for large solids or leaves small ones
reading as a speck — Module 2's sheet also carries numeric dimension labels (ADR-041), so "10 mm
reads as 10 mm" fidelity (ADR-038's rationale) is preserved through the numerals even as the drawing
itself scales to fit.
**Alternatives rejected:** (a) *Keep ADR-038's fixed-scale pattern, just retune `REF_SPAN_MM`
smaller* — rejected: any single constant is wrong at one end of Module 2's slider range (the same
problem ADR-038 itself doesn't have, since Lines has one fixed-shape geometry, not free-varying
base/height/distance sliders). (b) *Fix only the axis swap, keep drawing `flatConnectorGroup`* —
rejected per explicit task requirement: the projectors read as visual noise once the sheet's own
linework is correct and legible.
**Consequences:** `drawCompare()` (`Module2/main.js`) now runs two passes — measure (`walkGroupPoints`
over `sheetHP`/`sheetVP`/`sheetPP`/`sheetCaption`) then draw (`flattenHP`/`VP`/`PP`/`Caption`,
composing the same sheet functions with `project()`). `REF_SPAN_MM` and the `flatConnectorGroup`
stroke call are removed from this function. ADR-051's claim that the flatten "always agrees with the
in-scene answer sheet" was true for the fold math but incomplete for the camera projection — amended
here, not reversed (the fold-reuse architecture ADR-051 established is unchanged and still correct).
**Status:** Superseded by ADR-053 (the auto-fit *scale/anchor* basis only — the camera-projection
flatten this ADR fixed is unchanged and still correct).

---

## ADR-053: `drawCompare()`'s scale locks to the solid's intrinsic 3D size, not the live drawn layout; the anchor pins to the world origin, not a live bbox centre

**Date:** 2026-07-16
**Decision:** ADR-052's auto-fit measured every point about to be drawn (all three views + dimensions
+ captions) into one combined bbox and derived `scale`/`centerX`/`centerY` from it every redraw. That
combined bbox includes the *empty spacing* between views, so moving a solid via a distance slider
(`mesh.position.x = distVP` / `.y = distHP`, `seatOnPlanes`) grows that bbox and the whole sheet
rescales+re-pans to chase it — reported as: dragging "Distance from VP" visibly shrinks the Front and
Side views too, when only the Top view should move. Fixed by decoupling scale and anchor from the
live bbox entirely:
- **Scale** now derives only from `solidSpanUnits` — the current solid's LOCAL-geometry
  bounding-sphere diameter (`mesh.geometry.computeBoundingSphere()`, computed once per `rebuild()`
  before `mesh.position`/`quaternion` are applied). Local geometry never encodes distHP/distVP (only
  the mesh transform does), and the bounding sphere is rotation-invariant, so `scale` is now identical
  across every distance AND angle slider — it only changes when base/height actually resize the solid
  (ADR-052's "no speck" goal, kept).
- **Anchor** is the fixed world origin, mapped through the SAME unchanged `sheetHP`/`sheetVP`/`sheetPP`
  functions (`project` now maps `p.x, p.y` directly, no `centerX/centerY` subtraction). This is not an
  arbitrary choice: `seatOnPlanes` already seats distHP = 0 exactly on the HP (world y = 0) and
  distVP = 0 exactly on the VP (world x = 0), with world z always 0 — the origin IS the
  slider-independent reference already built into the solid's seating. Since `sheetVP` (Front) reads
  `(−z, y)` — no world-x term at all — pinning the anchor there makes the Front view provably
  identical in scale and pixel position for any distVP, while it still correctly translates with
  distHP (a real, intentional distance, not a distortion). `sheetHP` (Top) reads `(−z, −x)`, so it
  moves with distVP as intended and is untouched by distHP.
**Why:** A distance/angle slider must change the drawing the way the physical setup actually changes
— moving the solid relative to one plane — not the sheet's zoom level. Tying scale/anchor to the
solid's own fixed size and to the origin already baked into its seating achieves that with no new
per-frame geometry pass; the existing per-view `hpBox/vpBox/ppBox` measurement (kept, unchanged) still
positions the dashed XY / X1-Y1 reference lines in the actual visual gap.
**Alternatives rejected:** (a) *Retune the old auto-fit's margin/weighting* — rejected, the distortion
is structural (any live-bbox-derived scale rescales when the bbox grows), not a tuning problem. (b)
*Re-center on the live bbox after fixing only the scale* — rejected: a live-bbox-derived anchor still
pans the Front view whenever the Top view (or anything else) moves, reintroducing the same coupling
one axis later.
**Consequences:** The Side view (`sheetPP`) keeps ADR-052's existing, unchanged formula
(`(y−z0, −x)`), which groups its vertical placement with the Top view's rather than the Front view's —
a pre-existing sheet-layout convention from ADR-052, not something this ADR alters. So Side view's
*position* still legitimately shifts with distVP (by the same, already-shipped formula); what this ADR
guarantees is that Side view's *scale* never changes, and that the Front view is fully invariant
(scale + position) to distVP specifically, per the reported bug and its CDP-verified fix (measured
Front-view pixel bbox identical at distVP 0 vs 50). A large distVP can legitimately push the Top (and
Side) view toward the card edge at a fixed scale — accepted, since re-panning to recenter would move
the Front view and reintroduce the reported distortion.
**Status:** Active

---

## ADR-054: `drawCompare()`'s anchor moves from the bare world origin to the intrinsic-nominal layout centre; drag-to-pan added as the sanctioned way to inspect a clipped extreme

**Date:** 2026-07-16
**Decision:** ADR-053 anchored the 2D Compare sheet's `project()` at world-space `(0,0)`. But the sheet's
own three-view layout does not straddle that point: Front (`sheetVP.x=-z`) and Top (`sheetHP.x=-z`)
sit centred near sheet-x 0, while the Side block (`sheetPP.x=y-z0`) sits a further `E+GAP` world units
to the right of them (`E`=`solidSpanUnits`, the same characteristic size `scale` is already keyed to).
Anchoring at `(0,0)` therefore left the Side block's extra width entirely on one side, reported as a
large dead zone on the left of the card and — since scale is intentionally locked (ADR-053) — clipping
at the top/right edges once a distance slider pushed the layout further off that unbalanced anchor.
Fixed by computing a **fixed intrinsic-nominal anchor offset**,
`anchorSX = showSideViewFlag ? (E + GAP) / 2 : 0`, `anchorSY = 0`, subtracted in `project()` before the
existing `WORLD_TO_MM * scale` step. This is derived only from `E`, `GAP` (`E * 0.35`), and
`showSideViewFlag` — the same distance/angle-independent inputs `scale` itself already uses — so it
changes only when base/height actually resize the solid, never with a distance or angle slider; ADR-053's
scale-lock invariant is unchanged, only its anchor clause is refined from "world origin" to "the origin's
own nominal layout centre."
**Drag-to-pan (same ADR):** a fixed anchor can still put part of the drawing past the card edge at large
distance/angle values (ADR-053 accepts this as the tradeoff for a non-rescaling sheet). Added
`comparePanX`/`comparePanY` (CSS px), applied in `project()` after the anchor, driven by standard
`pointerdown`/`pointermove`/`pointerup`/`pointerleave`/`pointercancel` handlers on `compareCanvas`
(`setupComparePan()`, rAF-coalesced redraw). Pan is purely user-driven — never touched by a slider or
angle — so it composes with the scale-lock instead of reopening ADR-053's original bug. It resets to
zero on every fresh Compare-card open (`compare.show()`) and on a double-click (recenter).
**Why:** A learner should never lose the drawing off-card just because a distance value is large, but
the fix must not resurrect ADR-053's live-bbox coupling. Centering the *nominal* layout (a solid-size
constant) fixes the common case for free; panning is the escape hatch for the extreme case, kept
strictly opt-in and user-controlled.
**Verified (CDP, isolated per-view-colour bbox to avoid a caption text-alignment red herring — see
below):** base=70, height=70, distHP=distVP=50. Measuring the Top view's own teal linework
(`--color-hp-line`) bounding box across four pan states — `(0,0)`, `(100,0)`, `(0,40)`, `(100,40)` CSS
px — gave an identical pixel count (684) and identical width/height (138×137 backing px) in all four,
with `minX`/`minY` each shifting by exactly `pan * dpr` (dpr 1.25) on their own axis and not the other.
Confirms translation is pixel-exact and scale is untouched by panning.
**Caveat found during verification, not a bug:** measuring the *whole-canvas* ink bounding box (rather
than one view's own colour) is unreliable as a scale-invariance proxy here — `drawCaption()`'s existing,
intentional alignment rule (anchor the caption to read away from the sheet centre) flips `textAlign`/
`textBaseline` as a caption's position relative to `(cx,cy)` changes sign under panning, changing how far
the caption text extends and thus the whole-canvas bbox width — with no change to any view's own
geometry or scale. Future verification of this sheet should isolate one view's line colour rather than
trust an aggregate ink bbox.
**Status:** Active

---

## ADR-055: 2D Compare scroll-zoom added as a screen-space lens over the ADR-053 intrinsic scale

**Date:** 2026-07-16
**Decision:** Module 2's Compare sheet had drag-to-pan (ADR-054) but no way to magnify a small drawing.
Added scroll-wheel zoom on `compareCanvas`, implemented the same way pan was: a new user-driven state
var (`compareZoom`, default 1) consumed by `project()` as a **post-multiply on the content term only**
(`(p.x - anchorSX) * WORLD_TO_MM * scale * compareZoom`) — `scale` and `anchorSX/SY` themselves are
untouched, so ADR-053's scale-lock invariant holds exactly as it did through ADR-054's pan addition.
Zoom-to-pointer keeps the world point under the cursor stationary: on `wheel`, compute
`nextZoom = clamp(compareZoom * exp(-deltaY * k), MIN, MAX)`, then solve the pan shift that cancels the
resulting scale change at the cursor position — `k = nextZoom/compareZoom`;
`pan' = (cursor - canvasCentre) * (1-k) + pan * k` — before committing `compareZoom = nextZoom`. Wheel
listener is non-passive with `preventDefault()` so the page never scrolls while the cursor is over the
sheet. Clamped to `[0.4, 5]×` (`COMPARE_ZOOM_MIN/MAX`) so the sheet can't invert or vanish.
**Reset contract (shared with pan):** a stray zoom must not persist across sessions with the drawing.
Factored both `comparePanX/Y` and `compareZoom` into one `resetCompareView()`, called from
`compare.show()` (fresh open), the canvas `dblclick` handler (recenter — now also un-zooms), and
`window.simAPI.reset()` (a full sim reset previously left pan/zoom untouched even though `compare.hide()`
closes the card — the state would silently reappear stale on the next open).
**Why:** Same rationale as ADR-054 — the fixed-scale invariant ("10 mm reads as 10 mm") is a real
teaching requirement, so any inspection aid must be a reversible, purely additive screen-space layer,
never a rescale of the underlying drawing. Zoom is pan's natural sibling: pan solves "the view I want is
off-card," zoom solves "the view I want is too small to read."
**Verify:** dispatch synthetic `WheelEvent`s (negative `deltaY` = zoom in, positive = zoom out) at a
known `clientX/clientY` on `compareCanvas`; assert `compareZoom` moves in the expected direction and
clamps at the bounds, the world point nearest the cursor stays visually stationary (zoom-to-pointer), and
`scale` (read via the same temp `__dbg` hook used in ADR-054's verification) is bit-identical before and
after — confirming the intrinsic base math in `drawCompare()` was never touched.
**Status:** Active

---

## ADR-056: `drawCompare()`'s XY / X1-Y1 reference lines pin to analytic fold coordinates, not a live bbox midpoint

**Date:** 2026-07-16
**Decision:** The same day's XY/X1-Y1 ground-line addition (see Module2 CHANGELOG) placed each
dashed reference line at the midpoint of the *live* gap between adjacent views —
`xyY = (hpBox.maxY + vpBox.minY) / 2` and `x1X = (topFrontMaxX + ppBox.minX) / 2`, read from the
Pass-1 per-view bboxes. That gap is not fixed: `seatOnPlanes()` seats the solid at
`mesh.position.y = distHP − minY`, so the Front view's `sheetVP.y (=worldY)` — and therefore the
Side view's `sheetPP.x (=worldY−z0)` — both move under the **Distance from HP** slider, dragging
the "ground line" along with the geometry it's supposed to be a fixed reference against. Fixed by
anchoring both lines to the analytic hinge coordinates the sheet-space functions already define
(header comment above `sheetHP`/`sheetVP`/`sheetPP`): `xyY = 0` (sheetY=0, the HP∩VP line) and
`x1X = -z0` (sheetX=−z0, the HP∩PP hinge, `z0 = ppHingeGroup.position.z`, reset to
`DEFAULT_PP_STANDOFF` every rebuild — never touched by a slider). The live bboxes are still read,
but only to size each line's *length* along the line's own perpendicular axis (sheetX for XY,
sheetY for X1-Y1) — both provably slider-invariant (`sheetHP.x = sheetVP.x = −worldZ`;
`sheetHP.y = −worldX`), so the length can track the drawing without the position drifting.
**Why:** matches the ADR-053 "fixed-scale, slider-independent" invariant this module has held
since ADR-053/054/055 — a distance slider must move only the geometry, never the reference frame
it's being measured against. The midpoint approach was a leftover reflex from the retired
ADR-052 live-auto-fit era and was never re-derived against ADR-053's world-origin-anchor model.
**Verify:** via CDP, read the XY line's painted canvas Y (temp probe mirroring the `__dbg`
pattern used in ADR-054/055's verification) before and after moving **Distance from HP** from 0
to 50; assert byte-identical. Same check for X1-Y1's canvas X under **Distance from VP**.
**Status:** Active

---

## ADR-057: Coincident hidden dashed lines are forced behind visible solid lines via `polygonOffset` + `renderOrder`, not left to the depth test

**Date:** 2026-07-16
**Decision:** Drafting convention requires a visible continuous line (Type A) to fully occlude a
hidden dashed line (Type E/F) wherever the two coincide — e.g. the Cube's front and back faces
project to the *identical* square, so the "hidden" square sits at exactly the same depth as the
"visible" one. `buildSegments()` in `projectionDrawer.js` built every `LineMaterial` with depth
defaults and no `renderOrder`, so which line painted last was decided by draw order plus the
`LESS` depth test at equal depth — and because `LineSegments2` renders fat lines as instanced
triangle *fills* (not GL `LINES`), per-fragment depth jitters across that quad, so equal-depth
solid/dashed pairs z-fought and dashed fragments leaked through unpredictably rather than losing
deterministically. Fixed by giving the **dashed** material a positive `polygonOffset`
(`factor: 1, units: 1`) so it is pushed strictly farther from the camera than any coincident solid
line — the depth test then has a real winner regardless of fat-line jitter — plus
`segments.renderOrder = dashed ? 0 : 1` as a belt-and-suspenders paint-order backstop. `depthTest`
is left untouched (`true`) so the 3D solid still occludes projection lines normally; only the
solid-vs-dashed pair at equal depth is disambiguated.
**Why:** matches the existing `polygonOffset: true` idiom already used on the solid mesh material
(`Module2/CLAUDE.md` 3D gotchas — prevents `EdgesGeometry` z-fighting against mesh faces) rather
than inventing a new technique; a depth bias is robust to draw order and to fat-line triangle-fill
jitter, where `renderOrder` alone would not be (same-buffer painter's-algorithm ties still race the
depth test if depth values aren't actually separated).
**Verify:** via CDP, patch `THREE.Object3D.prototype.add` (imported via `await import('three')`,
which resolves through the page's import map to the same cached module instance the app uses) to
capture every `HP/VP/PP Projection` group as it's attached; assert each dashed `LineSegments2`
child has `renderOrder === 0`, `material.polygonOffset === true`,
`polygonOffsetFactor/Units === 1`, `depthTest === true`, and each visible child has
`renderOrder === 1`, `polygonOffset === false`. Confirmed on the Cube across 6 capture points
(HP/VP/PP, including reparenting during fold/flatten); the flattened 2D sheet shows clean solid
square edges with zero dashed bleed-through.
**Status:** Active

---

## ADR-058: Section cutting is a hand-authored single-plane triangle clipper, not a CSG library

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-001 (elevated 2026-07-18).
**Decision:** The section-cut engine is `src/sectionCut.js` — an analytic clipper that slices
the solid's non-indexed triangles against ONE cutting plane (Sutherland–Hodgman per triangle,
kept half-space = signed distance ≤ 0), welds the intersection segments on the same 1e-3
quantized lattice `meshAnalyzer.js` uses, chains them into an ordered closed loop, and
fan-triangulates that loop into a solid cap (the "True Shape" face). It runs as a fixed stage
inside `rebuild()`'s DOMAIN BUILD SEAM — generate mesh → **slice** → analyze edges — never as a
live mutation from a slider. No CSG/boolean library is imported.
**Why:** The syllabus problem is exactly one plane against one convex faceted solid — not
general booleans. A per-triangle clip is O(triangles) with no acceleration structure (the
largest roster solid is ≈ 96 triangles, so a full re-cut per slider tick costs microseconds),
and its intermediate product — the ordered section loop, returned in the plane's own (u,v)
basis — IS the true-shape polygon the auxiliary view must draw. A CSG evaluator returns
re-triangulated soup from which that boundary loop would have to be reconstructed by
edge-matching anyway, and its irregular cap triangulation emits exactly the slivers that once
drew phantom "spiderweb" seams (see `meshAnalyzer.js` `DEGENERATE_NORMAL_EPS`). The topic
CLAUDE.md's non-negotiable architecture section already forbids a CSG library for the section
cut; this ADR records the concrete design inside that rule.
**Alternatives rejected:** (a) *`three-bvh-csg` via the import map* — technically possible with
no build step (pin the raw `build/index.module.js` files, never jsDelivr's `/+esm` transform,
which would smuggle in a second `three` instance; ADR-030 set the import-map precedent with
`three-mesh-bvh`) but forbidden by the topic rule and the wrong tool size: a BVH build plus a
half-space proxy-box subtraction per slider tick to do what one linear pass does. Revisit only
for genuine boolean territory (compound multi-plane cuts, solids with interior voids).
(b) *`THREE.Shape` extrude + `mergeGeometries()` per the ADR-045 precedent* — right for
hand-authoring a fixed part (the Bearing Block), wrong for a cut that must respond to a
continuous plane parameterization.
**Consequences:** Easier: the cut rim welds with the clipped lateral walls because the whole
sliced solid feeds ONE `buildEdgeMap()` call — no double-drawn section edges; the cap is a
second geometry group so the section face carries its own `--color-section-face` token (and,
later, hatching) without a separate mesh. Harder/known: (1) exact plane-through-face/vertex
grazing is degenerate for any clipper, so `sectionCut.js` snaps vertices within `PLANE_EPS`
(2e-3) onto the plane — **the snap must exceed meshAnalyzer's 1e-3 weld lattice**, or a
near-grazed vertex emits intersection points inside the vertex's own weld cell and
`buildEdgeMap` fuses the sliver fan into a non-manifold edge (observed live at 1e-6 on the
default 45° centre cut of the cube, which passes exactly through two cube edges); (2) the
convex-roster cap uses a centroid fan — a future hollow solid (multi-loop annular section)
falls back to `THREE.ShapeUtils.triangulateShape` (three's bundled earcut, still no new
dependency), which is written but not exercised by any current shape; (3) a cut rim whose
dihedral is shallower than the 20° crease threshold will not draw in the simple edge overlay —
acceptable until the camera-dependent visible/hidden classifier pass (ADR-029 lineage) lands.
**Status:** Active.

---

## ADR-059: Section-plane state lives outside ShapeData, beside it in main.js

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-002 (elevated 2026-07-18).
**Decision:** The cutting-plane parameters (`enabled`, `orientation`, `angleDeg`, `offset`)
live in a topic-local `sectionState` object in `main.js`, mutated only through
`simController.commitSection()` (which routes through `rebuild()`), and are reset by
`simAPI.reset()`. They are NOT fields of `ShapeData`.
**Why:** `src/shapeData.js` is part of the Module 2 geometry engine restored byte-identical
(root RULES.md §1.3–1.4): drift is fixed in `Module2/` and re-copied, never patched in place.
Adding section fields to `ShapeData` would fork the file permanently. Keeping the section
state beside — merged at the `rebuild()` call site — preserves byte-identity while keeping the
"single rebuild path" contract intact (`commitSection` is to sectionState what `commit` is to
ShapeData).
**Alternatives rejected:** Formally exempting `shapeData.js` from byte-identity — a standing
exception to a platform rule for one topic's convenience; rejected while the cheap composition
alternative works.
**Consequences:** Easier: `Module2/src/` fixes keep flowing into this topic by plain re-copy.
Harder/known: problem-library "load problem" plumbing (a later pass) must serialize BOTH bags
(`ShapeData` + `SectionState`) instead of one.
**Status:** Active.

---

## ADR-060: projectionDrawer.js is a byte-identical Module2 copy; all section drawing lives in a new leaf module

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-003 (elevated 2026-07-18).
**Decision:** The orthographic views (top/front/side, with per-view visible/dashed
classification and 3D→2D connectors) come from `src/projectionDrawer.js` copied
**byte-identical** from `Module2/src/` — the same restore-don't-fork doctrine as the geometry
engine (root RULES.md §1.3–1.4): any fix lands in Module2 first, then re-copy. Everything
section-specific — the 45° apparent-shape hatching per view and the true-shape auxiliary
sheet — lives in a NEW leaf module `src/sectionView.js` (imports only THREE + the fat-line
addons). Views are consumed with `drawDimensions: false` (the dimension layer carries CSS2D
labels and this topic mounts no CSS2DRenderer yet) and all output groups are parented INSIDE
`shapeGroup`, so `rebuild()`'s single deep-disposal contract frees them — `sectionView.js`
deliberately exports no `dispose()`.
**Why:** The drawer consumes the welded edge map generically, and the sliced solid already
feeds one `buildEdgeMap()` call, so it needs zero modification — a cut of a convex solid is
still convex, keeping the drawer's face-normal visibility tests exact. Isolating hatching +
true shape in a sibling leaf keeps the copy permanently patch-free (no drift), unlike the
module_2_topic_2 clone's manual-backport exposure.
**Alternatives rejected:** (a) forking the drawer to add hatching inside it — permanent drift
from the master for something expressible outside it; (b) a second dispose path mirroring the
drawer's own `dispose()` — this topic's idiom is the one shapeGroup contract, and holding two
teardown paths is how leaks start (verified flat 20→20 geometries across 50 re-cuts).
**Consequences:** Easier: Module2 drawer fixes flow in by plain re-copy; `fc /b` proves parity.
Harder/known: the drawer's 8° coplanar threshold draws all 24 lateral facet edges of the
cone/cylinder in the views (Module2-consistent behaviour, inherited as-is); the parked
`flatConnectorGroup` (fold-phase material) must ride hidden inside shapeGroup or its batch
leaks.
**Status:** Active.

---

## ADR-061: The true shape is an in-scene world-scale sheet plus a camera tween, not an auxiliary camera viewport

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-004 (elevated 2026-07-18).
**Decision:** The TRUE SHAPE auxiliary view is drawn as a flat in-scene sheet
(`sectionView.js`): the cut loop's `points2D` are rendered VERBATIM as local (x, y) geometry
in a group posed by the cutting plane's own world (u, v, normal) basis, offset along the
normal past the removed half. Step 5's "Face the section" button tweens the MAIN camera to
`centroid + normal × orbitDistance` (orbit distance preserved, `easeCamera`, reduced-motion
jumps). There is no second render pass, no scissored inset viewport, no auxiliary
OrthographicCamera.
**Why:** `sectionCut.js` already returns the exact true-shape polygon in plane coordinates —
a camera is only a way to LOOK, not a way to OBTAIN. Drawing `points2D` at world scale locks
the true shape 1:1 to the solid intrinsically (no frustum-fitting logic exists to drift —
the auto-zoom failure class ADR-038 fixed by sheet-locking is unrepresentable here), keeps
the single-canvas invariant, and matches the textbook construction: an auxiliary plane held
parallel to the cut. Verified on the 30° cone cut: conic fit of the drawn loop has max
residual ~1e-8 and the top view's extent equals the true extent × cos 30° exactly.
**Alternatives rejected:** a picture-in-picture ortho viewport (renderer.setScissor) — a
per-frame second render plus frustum-sizing state that must track the section, i.e. exactly
the drift surface being avoided, for no pedagogical gain over facing the sheet.
**Consequences:** Easier: zero scale bookkeeping; hatch pitch is constant in world units
(0.25 = 2.5 mm at dock scale) across views and sheet alike. Harder/known: face-on, the
opaque paper sheet occludes the solid behind it (accepted — the sheet IS the view); the
sheet repositions with the plane slider since it is anchored to the live cut.
**Status:** Active.

---

## ADR-062: The KTU "exclude true shape given" rule is a problem-TYPE axis with a hard filter, not an authoring convention

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-005 (elevated 2026-07-18).
**Decision:** Every problem in `src/problems.js` carries a `type` field, and the library
exposes `EXCLUDED_TYPES = ['true-shape-given']` — `enabledProblems()` filters on BOTH the
tier (`ENABLED_TIERS`, the clone switch) AND the type. All shipped problems are
`type: 'find-true-shape'`. A problem that hands the learner the true shape to
reverse-engineer the cut from can therefore never surface in the library UI, even if a
future author gives it an enabled tier.
**Why:** The 2024 KTU syllabus explicitly excludes "true shape given" problems. The
Module2 `TIERS`/`ENABLED_TIERS` axis is scope-based (which configurations this build can
solve), not legality-based — reusing it would conflate "not built yet" with "banned", and
"just don't author them" leaves the constraint invisible to the next contributor (module
CLAUDE.md flagged exactly this gap). Additionally, no problem `target` may reference a
true-shape dimension: targets are structurally limited to `shape` + `SectionState` keys,
which contain no true-shape quantities at all.
**Alternatives rejected:** (a) a never-enabled tier — overloads the clone switch and
disappears silently if a clone edits `ENABLED_TIERS`; (b) convention only — unenforceable.
**Consequences:** Easier: the ban is greppable, testable (a banned-type fixture is filtered
— verified in node), and survives cloning. Harder/known: none; the axis costs one field.
**Status:** Active.

---

## ADR-063: Conic-section self-check — ±0.5° tolerance + a live 'generator' target, not a "parallel to generator" preset

**Date:** 2026-07-17
**Origin:** topic-local ADR-M3T1-006 (elevated 2026-07-18).
**Decision:** `src/problemLibrary.js` checks the cutting plane with per-field tolerances:
±0.5° on `angleDeg`, ±0.05 world units (0.5 mm) on `offset`, identity on strings/booleans.
A parabola problem's target is the token `angleDeg: 'generator'`, resolved at compare time
as `atan(2·height ÷ baseLength)` from the solid actually on the bench (69.44° for the
Fig 14-28 cone — dimension-ratio-derived, so scale-invariant). There is NO "parallel to
generator" UI preset. Two supporting policies: (1) `offset` is checked only where the
statement maps 1:1 onto the control ("bisecting the axis" → 0); a quoted axis point that
would require the learner to derive a plane-normal offset is left free, guarded by a
cuts-the-solid check (`sim.section()` non-null) so a plane that misses the solid can never
go green. (2) Problem `setup` dims are the statement's PROPORTIONS at bench scale (mm ×
0.04): the topic has no size controls or mm readouts, every checked quantity is
ratio-derived, and full-scale dims (a Ø 75 mm cone) overflow the fixed camera framing
(verified live).
**Why:** The angle slider steps in whole degrees while a generator angle is irrational —
but the nearest integer stop is mathematically never more than 0.5° from ANY derived
angle, so ±0.5° makes every conic target reachable by slider alone (numeric field accepts
the exact decimal), without a preset that would pre-solve the lesson's one discovery:
"parallel to a generator" MEANS inclination = atan(axis ÷ radius). The sibling library's
flat 0.05 tolerance is a length in world units and would demand 0.05° — impossible on
this dock.
**Alternatives rejected:** (a) a "Parallel to Generator" toggle — mechanically convenient,
pedagogically hollow (violates the problem-solving discovery arc); (b) snapping the typed
angle to the slider step — forbids the exact answer; (c) checking derived normal-offsets —
tests arithmetic the dock never teaches.
**Consequences:** Easier: authoring a conic problem is one token; dims may be rescaled
freely without touching targets. Harder/known: an offset-free ellipse problem accepts any
cutting position (the section stays the named conic wherever the plane cuts — accepted);
the hint chain, not the checker, carries the atan derivation.
**Status:** Active.

---

## ADR-064: `iShape.js` taken verbatim from the Module 2 master (conscious ADR-027 resolution)

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-001 (elevated 2026-07-18).
**Decision:** This topic's `src/iShape.js` is the master's full 4702-byte version
(`Module2/src/iShape.js`), copied **verbatim** and kept byte-identical.
**Why:** Root ADR-027 classifies `iShape.js` as adapt-on-copy, requiring every new topic to read
`applyShapeTransform()` and consciously decide which poses it keeps. The freshest Case A precedent
(topic 1, Sections of Solids, 2026-07-17) resolved "adapt" by taking the master verbatim: full pose
freedom (restingPlane lay-down + `angleHP`/`angleVP` inclination, `ZXY` Euler order) is retained,
and topic scoping is done through shapeData defaults in `main.js` (`defaultSolidData()` overrides
only `shape`), never by trimming the transform. Developments of *inclined* or truncated solids are
in scope for later phases, so pre-stripping poses would have to be undone anyway.
**Alternatives rejected:** *Copy an older topic's smaller `iShape.js`* — silently omits the
inclination/lay-down composition this topic may need (the exact trap ADR-027 warns about).
**Consequences:** `iShape.js` joins the byte-identical set for THIS topic — drift is fixed in
`Module2/` and re-copied, never patched here. md5 `a5e6c662584cf53649c8ac81af57823e` at copy time.
**Status:** Active

---

## ADR-065: Through-hole problems are excluded structurally, not editorially

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-002 (elevated 2026-07-18).
**Decision:** The syllabus mandate "exclude problems with through holes" is enforced on three
layers, strongest first: (1) **engine impossibility** — the architecture bans CSG/boolean
libraries and the restored generator family emits only closed single-shell solids, so a pierced
solid is unrepresentable by construction; (2) **problem-library axis** — when the problem library
lands, it must carry a dedicated problem-`type` axis (or never-enabled tier) naming the exclusion,
because the pose-based `TIERS`/`ENABLED_TIERS` mechanism cannot express a problem-type ban
(the same gap topic 1 flagged for its "true shape given" exclusion); (3) **on-record notice** —
this topic's `CLAUDE.md` carries the constraint as a named syllabus block from scaffold day one.
**Alternatives rejected:** *"Just don't author hole problems"* — authoring discipline does not
survive sessions; the constraint must be visible in code and docs.
**Consequences:** Any future request for pierced/hollow solids in this topic must be pushed back
on citing the syllabus, or escalated as a syllabus change — never implemented via a CSG library.
**Status:** Active

---

## ADR-066: The development is drawn in Canvas2D on the Compare sheet via a pure `developmentEngine.js` leaf

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-003 (elevated 2026-07-18).
**Decision:** The 2D flat pattern renders on the Compare card's plain 2D `<canvas>` (the ADR-012 /
ADR-037 workbench, ported from the Module 2 master), drawn by `main.js`'s `drawCompare()` which
delegates ALL unrolling mathematics and path construction to a new pure leaf,
**`src/developmentEngine.js`** — no DOM access, no THREE dependency, colours injected as a resolved
palette. This supersedes the scaffold-era CLAUDE.md prose that sketched a `developmentView.js`
3D-space sheet "per the topic-1 `sectionView.js` precedent".
Three sub-decisions ride along:
1. **Method split is the KTU syllabus mandate**: Parallel-Line (prisms + cylinder — stretch-out
   `P = n·s` / `π·d`, rectangle `P × h`, generator heights are true lengths) vs Radial-Line
   (pyramids + cone — cone sector by the arc-length identity `θ = 360°·(r/L)`, `L = √(r²+h²)`;
   pyramids by per-face CHORD stepping `φ = 2·asin(s/(2·L_e))`, `L_e = √(h²+R_c²)`, base edges
   straight chords). The dispatch lives only in `layoutFor()` so the split cannot drift.
2. **Sheet scale follows the ADR-053 fixed intrinsic-frame pattern** (user-confirmed over a strict
   ADR-038 fixed mm span): px-per-mm derives from the ANALYTIC nominal footprint each layout
   computes out of ShapeData intrinsics (never the live drawn extents), so the pattern can never
   bleed off the card and pan (ADR-054) / zoom (ADR-055) / future cuts never rescale the drawing.
3. **Truncation is a data seam, not UI**: `computeCutDistances(shapeData, localPlane)` maps a
   cutting plane already transformed into the solid's local seated frame to true-length distances
   per generator/edge (`|apex−P|` along a straight generator IS the true length), and
   `drawDevelopment()` accepts the result as `cutData`. The cutting-plane controls port from
   topic-1's `commitSection` pattern (ADR-059) in a later phase with zero engine change.
**Why:** The Compare canvas is the platform's established 2D "answer sheet" (single-canvas
invariant ADR-034 — no second WebGL context), Canvas2D gives crisp DPR-scaled arcs/paths with real
line-weight control (the fat-line LineSegments2 rule is a WebGL-viewport concern and does not
apply), and a pure engine leaf keeps every formula console-testable — the headless verification
drives `layoutFor()` oracles directly.
**Alternatives rejected:** (a) *3D-space sheet à la topic-1 `sectionView.js`* — that pattern exists
because topic-1's true shape lives in the 3D fold narrative; the development is a flat DRAWING and
belongs on the drawing sheet. (b) *SVG overlay* — a second render surface duplicating the card's
canvas contract for no gain. (c) *Unrolling the actual mesh triangles* — the analytic formulas ARE
the lesson (KTU methods); mesh unrolling would obscure them and drag THREE into the leaf.
**Consequences:** `main.js` gains the ported Compare/workbench block + a thin `drawCompare()`
orchestrator; `index.html` gains the `#compare-chip` (always visible — the sim always has a solid,
so there is no projection gate). `WORKBENCH_CONTROLS` starts EMPTY — the parameter dock docks its
drivers there in a later phase. The engine's ShapeType dispatch uses string literals (leaves may
import only `genericSolid.js`, ADR-007); corner indexing ↔ 3D-mesh seam alignment is deferred to
the section-UI port, when the seam choice becomes learner-visible.
**Status:** Active

---

## ADR-067: Cutting-plane state lives in `main.js` OUTSIDE ShapeData (`commitSection` port)

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-004 (elevated 2026-07-18).
**Decision:** The truncation state — `{ enabled, angleDeg, cutHeight }` — is a module-level
`sectionState` in `main.js`, mutated only via `simController.commitSection(partial)` which routes
through the single `rebuild()` pipeline; `simController.sectionState()` returns a copy, and
`simAPI.reset()` re-seeds `defaultSectionState()`. `src/shapeData.js` stays byte-identical to
Module2 (RULES.md §1.3–1.4).
**Why:** Straight port of topic-1's proven ADR-059 pattern, and the CLAUDE.md scaffold
clause ("Development/unroll state lives OUTSIDE ShapeData") already mandated the shape of it.
The seated-frame plane consumed by `computeCutDistances()` is derived once per rebuild inside
the build seam (`activeCutLocalPlane`), never recomputed by the drawing layer.
**Alternatives rejected:** *Extending ShapeData* — breaks the byte-identical contract and forks
the master schema for a topic-local concern.
**Consequences:** `drawCompare()` reads `activeCutLocalPlane` (null ⇒ full pattern); the dock's
section controls write only through `commitSection`. The unroll-animation state of a later phase
follows the same pattern beside it.
**Status:** Active

---

## ADR-068: Cutting-plane controls are Angle-to-HP + Cut-height (plane always ⊥ VP); corner sampling takes the meshes' alignment phase

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-005 (elevated 2026-07-18).
**Decision:** (1) The truncation UI is two sliders + a toggle: **Angle to HP** (0–90°) and
**Cut height** (mm above the base where the plane crosses the solid's axis). The plane is ALWAYS
perpendicular to the VP — normal `(0, cosθ, sinθ)` — and there is no orientation select (diverges
deliberately from topic-1's orient+offset dock; user-confirmed). (2) The 3D solid is really
truncated: topic-1's `sectionCut.js` analytic clipper is copied in (never CSG) and runs inside
`rebuild()`'s seam; the world plane reaches mesh-local space via `mesh.matrix.invert()` (the
ADR-005 ZXY order is baked into the quaternion — no Euler is ever decomposed) and reaches the
engine's seated frame via the constant shift `d_seated = d_local − n_y·(h/2)` (generators centre
geometry at ±h/2). (3) `computeCutDistances()` samples polygon corners at
`polygonVertexAngle(N, k, PRISM | FLAT_EDGE_FRONT)` — the phase the meshes are actually built
with — importing `genericSolid.js`, the one leaf import ADR-007 permits. This resolves
ADR-066's deferred "corner indexing ↔ mesh seam alignment" clause.
**Why:** The KTU truncation standard is a plane ⊥ VP inclined to HP crossing every generator —
exactly what the development height-model can draw. A VP-inclined (vertical) cut removes whole
generators and is NOT representable as a height truncation of the same stretch-out (the engine
returns null there by design); an oblique two-angle plane is beyond the syllabus. Anchoring by
axis-crossing height reads directly off the textbook problem statements ("cut by a plane
bisecting the axis"). Without the alignment phase, cut heights are sampled at corners the mesh
does not have — plausible-but-wrong patterns (verified: the square prism's true heights are
0.423/1.577 at the π/4-phase corners, not the plain-2πk/N values).
**Alternatives rejected:** *Topic-1 parity (orientation select + offset-along-normal)* — carries
the un-drawable VP branch into a topic whose whole payoff is the 2D pattern; *raycasting the mesh
for cut points* — hits the 24-segment approximation instead of the true cone/cylinder and drags
THREE into the pure engine leaf.
**Consequences:** `WORKBENCH_CONTROLS = ['shape', 'section']` (amends ADR-066's "starts
EMPTY"); the dock docks into `#workbench-rail` during the split. `--color-section-face` token
added to this topic's `index.html` (same value as topic-1/DESIGN.md). 'all-cut' keeps the seated
plane so the pattern honestly collapses; 'no-cut' nulls it so the full pattern draws.
**Status:** Active

---

## ADR-069: The "through holes" exclusion ships as a hard problem-`type` filter (`EXCLUDED_TYPES`) in the data layer

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-006 (elevated 2026-07-18).
**Decision:** `src/problems.js` carries a dedicated problem-type axis: every problem declares a
`type` ('shortest-path' | 'truncation' today) and `EXCLUDED_TYPES = Object.freeze(['through-hole'])`
is filtered INSIDE `enabledProblems()` — `ENABLED_TIERS.includes(p.tier) && !EXCLUDED_TYPES.includes(p.type)`.
A 'through-hole' problem can never reach the library UI regardless of its tier. This completes
ADR-065 layer 2 (the pending exclusion axis), mirroring topic-1's ADR-062
"true-shape-given" pattern exactly.
**Why:** The KTU 2024 syllabus mandate ("Exclude problems with through holes") must be
structural, not an authoring convention — pose-based `TIERS` cannot express a problem-KIND ban,
and a later session adding a pierced-solid problem should hit a named filter, not a comment.
Layer 1 (no CSG, closed single-shell generators) already makes the geometry unrepresentable;
this makes the *problem statement* unreachable too.
**Alternatives rejected:** *A never-enabled tier* — conflates the method-split grouping axis
with the ban and vanishes from view when tiers are reshuffled; *authoring discipline alone* —
explicitly ruled out by ADR-065's on-record notice.
**Consequences:** `groupByTier()` also filters to enabled tiers (topic-1 parity). Library data
layer: 4 problems (statements verbatim, user-supplied), tiers `parallel`/`radial` mirroring the
KTU method split.
**Status:** Active

---

## ADR-070: Shortest-path ("string") problems — straight chord on the development, 3D wrap by per-face isometry, revealed only on a matched self-check via a non-rebuild overlay commit

**Date:** 2026-07-18
**Origin:** topic-local ADR-M3T2-007 (elevated 2026-07-18).
**Decision:** (1) The shortest route on the surface is drawn as a STRAIGHT line on the 2D
development (the development is an isometry, so straight there = the surface geodesic).
`computeStringPath(layout, spec)` in `src/developmentEngine.js` parameterises a problem's
`path: { wrap, from, to }` spec seam-anchored: radial solids take the chord between boundary
points at pattern angles γ₀ = −half and γ₁ = γ₀ + wrap·total, with interior generator/edge
crossings from the polar chord identity ρ(γ) = R·cos(Δ/2) / cos(γ − γₘ) (guarded invalid at
Δ ≥ 180°, and radial specs are base→base only); parallel solids take the straight segment
(0, y_from) → (wrap·P, y_to) with crossings interpolated on the station grid. (2) The SAME
path is wrapped onto the 3D solid (`liftStringPathTo3D` in `main.js`): flat solids lift only
the fold-crossing points (straight per face — per-face isometry), the cone uses a 49-sample
fine grid; points are built in the seated frame, shifted to the generators' centred frame
(y − h/2), and pushed through `mesh.matrix` (after an explicit `updateMatrix()` — the matrix
is still identity right after rebuild() when the cut is off, verified live as a
half-height-low render). Corner sampling reuses the ADR-068 alignment phases
(PRISM / FLAT_EDGE_FRONT / plain 2πk/N). Drawn as a fat `Line2` in the new `--color-dev-path`
token (plum), parented into `shapeGroup` so ADR-042 disposal frees it. (3) The reveal is
GATED ON THE MATCHED SELF-CHECK (user decision): `simController.commitStringPath(spec)` is a
NON-rebuild overlay commit — it stores the spec, rebuilds the 3D string, and repaints the
sheet, but never calls `rebuild()` — so `problemLibrary.evaluate()` (which runs inside the
`onStateChange` seam) can clear it on unmatch and idempotently RE-assert it after every
rebuild while matched, with zero re-entrancy.
**Why:** Pedagogy: the whole point of these KTU classics is discovering that the shortest
surface route is a straight line on the flat pattern — revealing it only when the learner's
setup matches keeps the reveal as the reward and honours the never-auto-fill rule. Cost: the
lift is ≤ 49 points computed once per commit — no per-frame work, no performance-budget
conflict, so the "2D-only if 3D is too expensive" fallback in the plan was not needed.
**Alternatives rejected:** *Reveal on load* — turns the answer into scenery;
*routing the spec through rebuild()* — re-enters `notifyStateChange` from inside a subscriber;
*raycast/geodesic-walk on the mesh* — hits the 24-segment approximation and drags THREE into
the pure engine leaf.
**Consequences:** `stringPathSpec` lives beside `sectionState` (outside ShapeData,
ADR-067 mirror) and is cleared by `simAPI.reset()`; `simController` gains `hasCut()`,
`commitStringPath()`, `isProblemActive()`, `completeAndNext()`; the terminal step gains the
topic-1 "Complete & next problem" CTA + success toast; `--color-dev-path #8f3a86` recorded in
DESIGN.md §7.4.
**Status:** Active

---

## ADR-071: Extreme-angle conic problems (circle/triangle/hyperbola) check a nonzero `offset`, overriding the oblique-conic "offset stays free" default

**Date:** 2026-07-18
**Decision:** Topic-1's problem library (`src/problems.js`) gains three cone problems completing
the KTU conic set — circle (`orientation:'HP', angleDeg:0`, offset free), isosceles triangle
(`angleDeg:90, offset:0`, orientation omitted), hyperbola (`angleDeg:90, offset:0.8`, orientation
omitted). At `angleDeg:90` the `'HP'` and `'VP'` plane normals coincide
(`(0,cos90,sin90) ≡ (cos90,0,sin90) ≡ (0,0,1)` in `main.js buildSectionPlaneWorld()`), so
orientation is a genuine don't-care and is omitted from `target.section` for both. `offset` is
CHECKED for triangle/hyperbola — the only field that tells them apart, since both dial
`angleDeg:90` — reversing every prior conic problem's practice of leaving `offset` free.
**Why:** Every oblique conic problem (ellipse ×2, parabola) leaves `offset` free because a quoted
"N mm from the base/apex" needs the learner to derive a normal-offset the mm dock can't express
1:1 (documented per-problem in `problems.js`). At `angleDeg:90` the plane's normal is horizontal,
so `offset` IS literally the plane's horizontal distance from the cone's axis — a true 1:1
dockable quantity, not a derived one — so checking it exactly is legitimate here even though it
isn't for the oblique cases. Without a checked `offset`, the triangle and hyperbola targets would
be identical (`angleDeg:90` alone) and either problem's self-check would accept the other's answer.
**Alternatives rejected:** *Leave offset free on both, discriminate on `type`/title alone* — the
self-check only compares `target` fields against the dialled plane, so an unchecked field can
never fail a wrong answer; a learner could "solve" the triangle problem by dialling any hyperbola
offset. *A synthetic "throughApex: boolean" field* — reinvents `offset:0`, which the engine
already treats as passing through the solid's centre (and the apex sits on the axis at that
centre), for no gain.
**Consequences:** `problems.js`'s `PROBLEMS` array grows 4 → 7; its header docstring documents the
checked-offset pattern for future conic authoring. `TIERS[1].blurb` updated to name all five
curves (circle, ellipse, triangle, parabola, hyperbola) instead of the original three.
**Status:** Active

---

## ADR-072: The teammate-contributed Lines problem-solver is promoted to catalog topic 6, its Problem Library activated, and its construction-aid tokens reconciled to DESIGN.md §2.2

**Date:** 2026-07-19
**Decision:** A second, previously untracked build of the "Projection of Straight Lines" topic —
contributed alongside the conceptual `graphics_module_1_topic_5_projection_of_line_types` primer —
is promoted from its non-conforming folder name `module_1_topic_lines` to
**`graphics_module_1_topic_6_projection_of_straight_lines`**, the next free Module-1 catalog slot
after topic 5. Three changes land together:
1. **Rename**, no other structural change — `main.js`, `meta.json`'s title ("Projection of Straight
   Lines"), and the `<title>` tag were already correct pre-rename.
2. **Problem Library un-staled**, not newly built — the topic's own CLAUDE.md described the
   Problem Library as "deferred, out of migration scope" (per ADR-042), but `main.js` already calls
   `initProblemLibrary(simController, {list: LINE_PROBLEMS, tiers: LINE_TIERS, fieldLabels:
   LINE_FIELD_LABELS})` and wires `isProblemActive`/`completeAndNext` into `window.simAPI`; the
   overlay DOM is present in `index.html`. The 12 problems in `src/lineProblems.js` are
   verbatim-identical to the legacy `Module1/src/lineProblems.js` set (N.D. Bhatt + K.C. John,
   RULES.md §6.7 compliant) — no new problems were authored, the existing library was simply wired
   up. The doc was corrected to match the shipped code rather than the code being rolled back.
3. **Construction-aid tokens reconciled to DESIGN.md §2.2.** The topic's `index.html :root` defined
   only three of the six catalogued Module-1 construction-aid tokens, and two of those three were
   aliased to existing neutrals (`--construct: var(--color-ink-secondary)`, `--locus:
   var(--color-bench-grey)`) rather than the platform's own distinct values; the three `*-ink` text
   variants were absent entirely. Replaced with DESIGN.md §2.2's exact catalogued hex —
   `--construct #8a8275`, `--locus #7b4fb5`, `--tl-green #1f8a4c`, `--construct-ink #5e564a`,
   `--locus-ink #6a3fa3`, `--tl-green-ink #166b3c` — so this Traces/True-Length construction reads
   with the same encodings as every other Module-1 consumer of these tokens (originally catalogued
   from `Module1/src/shell.css` in the 2026-06-27 code audit, DESIGN.md §2.2).
**Why:** Two intentionally-distinct sibling topics were found coexisting: topic 5 is a **concept
primer** ("Types of Lines," six fixed positions, deliberately problem-free by design — see its own
CLAUDE.md, "removed, not deferred"), and this topic is the **problem-solving build** (5-step
build-up + traces + True-Length + the 12-problem textbook library). An initial read of the two
folders looked like pedagogical drift (one topic "lost" the problems the other had); reading both
topics' CLAUDE.md files corrected that — they are siblings by design, not competing versions, and
the only real defects were this topic's non-conforming folder name, its stale "deferred" doc
language for a library that was already wired, and its token drift from the platform catalog.
Promoting it (rather than discarding it in favour of porting problems into topic 5, which would
have violated topic 5's explicit charter) preserves the only copy of the Lines problem-solving
topic and gives it a permanent, conforming home.
**Alternatives rejected:** (a) *Port the 12-problem library into topic 5 and retire this folder* —
rejected: topic 5's CLAUDE.md explicitly excludes a Problem Library ("NOT a problem library... the
sibling topic owns all of that"); doing this would both violate that charter and delete the only
Lines problem-solver, the opposite of the intent. (b) *Leave the folder under its non-conforming
name* — rejected: every other Module-1/2/3 topic follows the `graphics_module_<N>_topic_<K>_<slug>`
convention (or the deliberate unnumbered exception documented for "Simple Positions," RULES.md
§1.9); an untracked, unnumbered sibling folder is a permanent source of confusion for the next
contributor. (c) *Revert `SHEET2D_SPAN` to the literal ADR-038 formula (`300`)* — rejected: the
code's own comment documents a deliberate, reasoned improvement (Points-parity sheet fill); see the
ADR-038 amendment above instead of reverting a documented win.
**Consequences:** `graphics_module_1_topic_6_projection_of_straight_lines/` is the canonical,
committed home of the Lines problem-solver; `graphics_module_1_topic_5_projection_of_line_types`'s
CLAUDE.md/CHANGELOG sibling references were updated to the new name. ADR-038 gained the 2026-07-19
amendment above. topic 5 carries the **same** token drift from DESIGN.md §2.2 (identical `:root`
block, ported when topic 5 was cut from this topic) — left unresolved here as a flagged follow-up,
since fixing it is outside this topic's own folder and wasn't part of the approved scope for this
change; a future pass should apply the identical `--construct`/`--locus`/`--tl-green` + `*-ink`
fix there for platform consistency.
**Status:** Active

---

## ADR-075: The two standalone Lines topics' 2D Compare sheet moves from ADR-038's fixed mm span to the ADR-053 intrinsic-size model — scale derives from the line's True Length

**Date:** 2026-07-20
**Decision:** `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`'s shared `sheet2DLayout.js::layout2D()`
no longer derives its px-per-mm scale from the fixed `SHEET2D_SPAN = 150` constant (ADR-038, as
amended by ADR-072). It now derives the scale **per call, from the resolved line's own True Length**
(`M.tl`, `resolveLine()`'s `tl = hypot(dx,dy,dz)`, which equals `data.TL` exactly): `FIT = (HH - 0.9)
/ W(max(M.tl, 20))`, framing each sheet half (front view above XY, top view below) to fit a
TL-long view. This is the Module 2 **ADR-053 intrinsic-size model**, not ADR-052's live-bbox
auto-fit: `M.tl` is invariant to the distance-from-HP/VP sliders (they translate end A only) and to
the θ/φ angle sliders (they reorient, not lengthen) — it changes only when TL itself changes,
exactly as `solidSpanUnits` (a bounding-sphere diameter) changes only when base/height resize a
Module 2 solid. `SHEET2D_SPAN` and the module-level `FIT` constant are removed; `layout2D()` is the
sole place the scale is computed, so its three consumers (`compareSheet.js`, `traces.js`,
`trueLength.js`/`rotationMethod.js`) inherit the new scale with no signature or call-site changes.
**Why:** ADR-038/ADR-072's fixed 150 mm span framed the True-Length slider's *maximum*, so a typical
60–100 mm line — the common case — drew as a small fraction of the sheet, breaking visual parity
with the Points and Module 2 Compare sheets, while a line pushed tall by a large distance offset
could still overrun the fixed frame. Keying scale to TL means every line, at every length, fills its
sheet half, and the "extends past the sheet edge rather than shrinking the drawing" fallback §5.19
already sanctioned for the distance-driven case is now the exception (large distance offsets only),
not the everyday small-TL case.
**Alternatives rejected:** (a) *Retune `SHEET2D_SPAN` again* — rejected: any single fixed span is
wrong at one end of the TL slider's range, the same structural problem ADR-052 identified for Module
2's base/height sliders (ADR-053's own rationale). (b) *Live-bbox auto-fit (ADR-052's original,
already-superseded approach)* — rejected: would rescale the sheet on a distance-slider drag (the
combined-view bbox grows), reintroducing the exact coupling bug ADR-053 fixed in Module 2.
**Consequences:** `sheet2DLayout.js` in both topics (byte-identical files) drops `SHEET2D_SPAN` and
the module-level `FIT`; `layout2D()` computes `FIT` locally from `M.tl`. The "10 mm reads as 10 mm"
fixed-ruler property (ADR-038's core rationale) is now traded away *across* different True Lengths —
accepted, since within any single TL the ruler is still consistent, and the tradeoff exists solely to
fill the card, mirroring ADR-053's own accepted tradeoff for Module 2. A large distance offset can
still push a view toward the sheet edge at the (now TL-locked, not distance-locked) scale — an
accepted, pre-existing class of edge case, unchanged in kind from ADR-038's own "rare over-range
line" fallback. RULES.md §5.19 updated to record the split: legacy `Module1/lines.js` stays on
ADR-038's fixed span; the two standalone topics now follow this ADR.
**Status:** Active. Supersedes ADR-038 (and its 2026-07-19 ADR-072 amendment) for
`graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines` only. ADR-038 remains Active, unamended
further, for the legacy `Module1/lines.js`.

---

## ADR-073: Step-card Lead + Body copy is pinned to Module 2's compact `--text-sm` / `--color-ink-secondary` scale; DESIGN.md §3.2's `1.125rem`/`1rem` split is retired for that role

**Date:** 2026-07-20
**Decision:** The step card's lead sentence (`.card__lead`) and its instruction body (`.step-body`)
now render, everywhere, at `font-size: var(--text-sm)` (0.875rem), `line-height: 1.55`, and
`color: var(--color-ink-secondary)` — Module 2's existing scale, unchanged. Two files were brought
onto it:
- `graphics_module_1_topic_5_projection_of_line_types/index.html` — `.card__lead` was
  `var(--text-lead)` (1.125rem, lh 1.35) and `.step-body` was `var(--text-base)` (1rem, lh 1.6), a
  visibly larger step panel than every sibling topic; both now match `--text-sm`.
- `.step-body p` in this topic plus `graphics_module_1_topic_6_projection_of_straight_lines` and
  `graphics_module_1_topic_3_points` had no explicit colour and inherited `body`'s near-black
  `--color-ink`, reading as a darker, two-tone step panel against Module 2's single grey tone;
  all three now set `color: var(--color-ink-secondary)` on `.step-body p`, matching the pattern
  `graphics_module_1_topic_1_foundations` already used.
DESIGN.md §3.2 is amended to match (see the "Step-card copy" row): the `1.125rem`/`1rem` Lead/Body
sizing it previously specified is retired for the step-card role. `--text-lead` remains a declared
CSS custom property (harmless, unused) but has no consumer after this change.
**Why:** A user-driven visual audit (screenshots of Module 2, topic 5, and topic 6's step panels
side by side) found the step copy rendering at a visibly different size and a darker ink in topics
5 and 6. Investigation showed every design token's *value* was already identical platform-wide —
the divergence was purely which token each file's `.card__lead`/`.step-body` rule referenced. A
platform-wide audit (`.card__lead` font-size across all 11 sims) found topic 5 was the **only**
outlier at the larger size; topics 3, 5, and 6 were the only three with unset (near-black) body-copy
colour. DESIGN.md §3.2 had in fact specified the larger `1.125rem`/`1rem` sizing all along — meaning
topic 5 was arguably the spec-compliant one and Module 2 was the outlier against its own written
doc. The user, given this conflict, explicitly chose **Module 2 — the platform's declared
master/reference implementation (see every topic's own CLAUDE.md) — as the source of truth**, so
the doc is amended to match the code rather than the reverse.
**Alternatives rejected:** (a) *Grow Module 2 + topic 6 up to the `1.125rem`/`1rem` DESIGN.md
sizing instead* — rejected per explicit user decision; Module 2 is the reference implementation and
the user wants its exact size/ink treatment platform-wide, not a third compromise scale. (b) *Leave
`graphics_module_1_topic_3_points`'s near-black step-body untouched, since neither audited
screenshot showed it* — rejected: the code-level cause (`.step-body p` with no colour, inheriting
`--color-ink`) is identical to topics 5 and 6, so leaving it would just relocate the same
inconsistency rather than resolve it; flagged to the user as an easy revert if it should have stayed
near-black.
**Consequences:** `--text-lead` is now a dead-but-declared token — do not reintroduce it into a
step-card rule without a new ADR. Any future Module-1/2/3 topic's step panel should be authored
against `--text-sm` / `--color-ink-secondary` from the start, matching Module 2, rather than the
DESIGN.md §3.2 table's now-superseded Lead/Body sizing for that specific role.
**Status:** Active

---

## ADR-074: The Lines topics' two-pass scissor regions are computed in device px but must be handed to `renderer.setViewport`/`setScissor` as logical px, since three.js applies `pixelRatio` internally

**Date:** 2026-07-20
**Decision:** In `graphics_module_1_topic_6_projection_of_straight_lines/main.js` and
`graphics_module_1_topic_5_projection_of_line_types/main.js`, the render `loop()`'s two scissored
passes (the 3D scene into `regions.main`, the 2D ortho sheet into `regions.sheet` — the ADR-034
"one `WebGLRenderer`, no second GL context" pattern) now divide every `{x,y,w,h}` by
`renderer.getPixelRatio()` at the `setViewport`/`setScissor` call boundary. `computeRegions()` still
derives `regions.main`/`regions.sheet` in **device** px (via `renderer.getDrawingBufferSize()`), and
`LineMaterial.resolution` (`lineRig.setResolution` / `compareSheet.setResolution`) still receives
device px, unchanged — only the viewport/scissor calls convert.
**Why:** `renderer.setViewport(x,y,w,h)` / `setScissor(x,y,w,h)` take **logical (CSS) px** and
multiply by `_pixelRatio` internally — passing device px (as the loop did) silently double-applies
the ratio. At `devicePixelRatio === 1` (a 100%-scaled dev display) this is a no-op and invisible,
which is why it shipped unnoticed. At any other DPR (reproduced live at the user's Windows 125%
scaling, DPR 1.25) it is not: measured ground truth via a `gl.viewport`/`gl.scissor` capture showed
the real buffer at 1920×765 but the actual GL calls landing in a 2400×956 space (1920×1.25) — full
clear `[0,0,2400,956]`, 3D pass `[0,0,1203,956]`, sheet pass `[1203,-2,1196,957]` — pushing the sheet
pass right and clipping its right edge off-buffer. The CSS2D sheet labels (`a′`/`b′`/`a`/`b`, the
BIS dimension values) are positioned separately in true CSS px from `regions.cssSheet`, so they
stayed correct — producing a ~300px horizontal desync between the labels and the WebGL drawing they
annotate, visible only in the Compare workbench's 2D sheet pane on a scaled display. The 3D pane's
identical bug read as a subtle mis-zoom rather than a gross offset only because its region starts at
the origin `(0,0)`.
This was reported as a suspected missing double-`requestAnimationFrame` reflow sync (Module 2's
`remeasureAfterReflow` pattern). Audit found both topics already carry that helper, wired
identically to the Module 2 master (`applyCompareSize()` → `remeasureAfterReflow()` → double-rAF →
`handleResize()` → `computeRegions()`) — it was never the cause. In-browser reproduction (headless
CDP against a live `php -S` server) traced the actual desync to this pixelRatio double-application
instead.
**Alternatives rejected:** *(a) Have `computeRegions()` store logical-px regions instead of device
px* — rejected: `LineMaterial.resolution` (the fat-line width calculation) legitimately needs device
px, and `computeRegions()` is the single source `regions` struct consumed by both the resolution
calls and the viewport/scissor calls, so splitting it into two differently-scaled copies is more
error-prone than converting once at the one call site that needs logical px. *(b) Set
`renderer.setPixelRatio(1)` and manage DPR scaling manually* — rejected: loses free HiDPI
sharpness/antialiasing quality three.js otherwise provides, and would require re-deriving every
other device-px consumer (label overlay sizing, `getDrawingBufferSize`) from scratch.
**Consequences:** Any new scissored-pass code added to either topic's `loop()` must route through
the same `pass(x,y,w,h)` helper (divides by `renderer.getPixelRatio()`) rather than calling
`setViewport`/`setScissor` directly with `regions.*` values. Module 2 and the Points topic are
unaffected — they use Canvas2D for the 2D sheet (ADR-034), not a second WebGL scissor pass, so they
never had this class of bug. Verify any future two-pass topic at a non-1.0 `devicePixelRatio` (e.g.
Windows display scaling, not just Chrome zoom) — DPR-1 testing alone will not catch this.
**Status:** Superseded 2026-07-21 by ADR-076 — the two-pass scissor mechanism this ADR patched (and
the `regions`/`computeRegions()`/`pass()` machinery it names) no longer exists in either topic;
ADR-076 replaces it outright with two independent `WebGLRenderer`s, so there is no `setViewport`/
`setScissor` pixelRatio boundary left to get wrong. Recorded here as history, not to be reintroduced.

---

## ADR-076: The two standalone Lines topics' 2D Compare sheet moves off the shared-canvas scissor pass onto its own `WebGLRenderer`/canvas, adopting the ADR-037 floating-card workbench

**Date:** 2026-07-21
**Decision:** In `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`, the 2D orthographic Compare sheet
(`compareSheet.js`) now renders on its **own `WebGLRenderer`**, bound to its **own `<canvas>`**
created lazily inside the Compare card's `.compare-card__stage` on first Compare open
(`ensureSheetRenderer()` in `main.js`), with its own `CSS2DRenderer` overlay (`sheetLabelRenderer`)
as a DOM sibling of that canvas. This retires the two topics' original design — one shared
`WebGLRenderer` scissored into two regions per frame (`regions.main` for the 3D scene,
`regions.sheet` for the 2D sheet), computed by `computeRegions()` and consumed by a `pass(x,y,w,h)`
viewport/scissor helper in the render loop — which the topics' own code comments and `CLAUDE.md`
called "ADR-034 alternative-A for Lines" (one GL context, no second `WebGLRenderer`) and which
ADR-074 patched for a pixelRatio double-application bug. `compareSheet.js` itself is **unchanged**:
its `render(renderer)` method already took the renderer as an argument, so it is renderer-agnostic
by construction — only which renderer main.js passes it changes. The render loop is correspondingly
simplified: the 3D renderer draws its own full canvas every frame (`renderer.render(scene,
activeCamera)`, relying on default `autoClear`), and the sheet renderer draws the sheet scene only
while Compare is open (`compareSheet.render(sheetRenderer)`) — no scissor test, no viewport math, no
pixelRatio boundary to get wrong (ADR-074's entire fix surface is gone with it).

Alongside the renderer split, both topics adopt Module 2's **ADR-037 floating-card workbench shell**
(DESIGN.md §5.13, PLATFORM-RULES.md §2.24) verbatim: `body.compare-split` becomes a
`background:var(--color-panel)` shell with `gap`/`padding: var(--space-4)` between three rounded,
hairline-bordered cards (the 3D viewport, the 2D drawing, the docked rail — previously a
`gap:var(--space-1)` paper-white hybrid with no real gutter, since a single shared canvas couldn't
show a gap between its own two scissored halves), plus the `#rail-toggle` Hide/Show pill
(`setupRailToggle`/`syncRailToggleState`, ported verbatim from `Module2/main.js`). The construction
launchers (T6: Traces `data-ctrl="traces"`, True Length & Angles `data-ctrl="truelength"`; T5:
Rotation Method `data-ctrl="rotation"`) are added to each topic's `WORKBENCH_CONTROLS` so they
re-parent into the rail on split entry, and `ensureCompareForCon()` no longer force-demotes to the
compact card (`compare.show('compact')` → `compare.show()`) — a construction now runs inside the
expanded 50/50 split like every other driver.
**Why:** A single canvas scissored into two regions cannot show a **grey gutter between** those two
regions — they are pixels of the same buffer, so the two topics' Compare split read as a paper-white
hybrid (thin hairline seams, no real card separation) rather than Module 2's genuine "three floating
cards on a grey shell" look, even though most of the ADR-037 CSS tokens (`--space-4` gap,
`--radius-md` corners) were otherwise portable. Splitting onto two independent canvases makes the
gutter trivial (it's simply unpainted DOM background between two real elements) and is what makes
the rest of the ADR-037 port possible without reinventing Module 2's shell. Separately, the
construction launchers' compact-card fallback (`ensureCompareForCon`) predated the workbench rail
even having the construction buttons on it: the split used to collapse the wizard, which was the
constructions' only home, so opening one on the split forced a demotion to the compact card the
learner did not choose. Now that the launcher buttons are `[data-ctrl]` wrappers re-parented into
the rail exactly like any other driver, that forced demotion is no longer necessary and was actively
fighting the split's `COMPARE_DEFAULT_SIZE = 'expanded'` default (ADR-021) whenever a learner reached
for a construction.
**Alternatives rejected:** (a) *Keep the single shared canvas; fake the grey gutter by repainting the
clear colour grey when split and re-deriving `computeRegions()` to leave the gap area unpainted* —
technically possible but keeps every fragility ADR-074 had to patch (device-px/logical-px scissor
math, sub-pixel gap coverage, stage-rect tracking on every layout change) while adding MORE of the
same class of bug (a second region boundary at the gutter's inner edges) for a cosmetic outcome that
two real DOM elements give for free. (b) *Rewrite `compareSheet.js` and all three construction
leaves (`traces.js`, `trueLength.js`, `rotationMethod.js`) onto a flat Canvas2D, matching Module 2's
`drawCompare()` literally* — considered and explicitly rejected by the user: it would require
rewriting three working, recently-shipped animated constructions and would demote the CSS2D DOM
labels (crisp, screen-reader-readable per RULES.md §3.27) to painted `ctx.fillText` pixels, an
accessibility regression, for no behavioural gain over (the chosen) option. (c) *Leave the two Lines
topics on the flush/hybrid split permanently, treating ADR-037 as Module-2-and-Points-only* —
rejected: the whole platform's stated direction (PLATFORM-RULES.md §2.24) is that the ADR-037
workbench shape is shared across every guided-stepper sim, not a per-module style choice; leaving two
topics behind was the reported problem, not an acceptable end state.
**Consequences:** A second `WebGLRenderer`/GL context now exists per topic once Compare is opened —
a deliberate reversal of the "one GL context" constraint the topics' compareSheet.js header and
CLAUDE.md previously cited as "ADR-034 alternative-A for Lines." This is accepted: modern browsers
support well over a dozen simultaneous WebGL contexts per page, the sheet context is created lazily
(only if Compare is ever opened, not at boot) and lives for the page's lifetime (not recreated per
open/close), and the platform's own Points/Module 2 topics already run their 3D context alongside a
Canvas2D context with no documented issue — a second *WebGL* context is a smaller step than that,
not a larger one. `computeRegions()`, the `regions` struct, and the scissor `pass()` helper are
deleted from both topics' `main.js`; replaced by `syncMainSizing()` (3D renderer, called from
`handleResize`/`init`) and `ensureSheetRenderer()`/`resizeSheetRenderer()` (sheet renderer, driven by
a `ResizeObserver` on `.compare-card__stage` rather than the old manual double-rAF
`remeasureAfterReflow` chain — though that chain is kept for the 3D renderer's own resize, since
`#sim-viewport`'s size is also already covered by its own `ResizeObserver` from `init()`, making the
manual calls elsewhere in both topics pre-existing, harmless redundancy, not something this ADR
introduces or needed to remove). `traces.js`, `trueLength.js`, `rotationMethod.js`, `labels.js`,
`dimensions.js`, and `sheet2DLayout.js` (and its ADR-075 intrinsic-TL-scale math) are **untouched** —
the whole point of the own-canvas approach was to keep this working, recently-built code intact.
Both topics' `CLAUDE.md` "2D Compare vehicle" paragraph is rewritten to describe the new renderer;
`PLATFORM-RULES.md` §2.24 no longer needs a Lines-specific carve-out, since both topics now conform
to the shared ADR-037 shape like every other guided-stepper sim.
**Status:** Active. Supersedes, for `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines` only, the "ADR-034 alternative-A" scissor
design those two topics used since their Phase 4C/4E migration (as most recently refined by
ADR-074, now superseded in turn — see above). ADR-034 itself remains Active and unamended for the
Points topic and Module 2, which were never on the scissor design and are unaffected by this entry.

---

## ADR-077: The two standalone Lines topics' 2D Compare pan/zoom re-expresses ADR-054/055 against the ADR-076 ortho camera, not a Canvas2D `project()` lens

**Date:** 2026-07-23
**Decision:** Module 2 (and the Points topic, a faithful copy) implement Compare drag-to-pan
(ADR-054) and scroll-zoom (ADR-055) as two plain numbers — `comparePanX/Y`, `compareZoom` — consumed
inside a Canvas2D `project(mmX,mmY)` function. `graphics_module_1_topic_5_projection_of_line_types`
and `graphics_module_1_topic_6_projection_of_straight_lines` have no such function: since ADR-076
their Compare sheet is a live Three.js scene rendered through a real `OrthographicCamera` on its own
`WebGLRenderer` (`compareSheet.js`). Ported the same interaction — pointer-capture drag, non-passive
zoom-to-cursor wheel (`exp(-deltaY*0.0015)`, clamped `[0.4, 5]×`), double-click reset — but the
transform target is the ortho camera itself: pan moves `camera.position.x/y` (converted from CSS-px
deltas via the camera's own visible span `(right-left)/zoom` over the stage's CSS size); zoom sets
`camera.zoom` and solves the same position shift ADR-055's `pan' = (cursor-centre)*(1-k) + pan*k`
describes, so the world point under the cursor stays fixed. `compareSheet.js` gained
`resetView()`/`panByPixels()`/`zoomAtPixel()`; `main.js` gained a thin `setupComparePan()` (no
Canvas2D redraw queue needed — the existing rAF loop repaints the sheet every frame while Compare is
open). Listeners bind to `.compare-card__stage` (the canvas's parent), not the canvas itself, because
the sheet's CSS2D label overlay is a DOM sibling layered on top of the canvas and would otherwise
swallow drags/wheel landing on a label.
**Why:** "Don't invent a new pan/zoom mechanism" was the goal, but ADR-076 already established that
these two topics' Compare sheet is structurally a different rendering vehicle from Module 2/Points
(own-canvas ortho scene vs. Canvas2D). Reusing Module 2's *code* verbatim isn't possible — there is no
`project()` to patch — so the interaction model (gesture semantics, clamps, reset contract) is what's
reused, re-expressed against the camera the sheet actually has.
**Consequences:** `compareSheet.js`'s camera keeps identity rotation for the sim's lifetime (set once
via the initial `lookAt`) — pan/zoom only ever touch `position.xy`/`zoom`, never re-orient the camera,
so `setResolution()`'s aspect/frustum recompute on resize composes for free without resetting the
learner's pan/zoom. `compareSheet.js` in both topics stays byte-parity (as it was pre-existing).
**Status:** Active.

---

## ADR-133: Module 1 Topic 1.1 (Dimensioning) runs on ONE orthographic camera with authored linework — no perspective camera, no projection morph, no occlusion raycaster — and its pure-data catalogues are sibling-importable

**Date:** 2026-07-26
**Decision:** `graphics_module_1_topic_1_1_dimensioning` adopts the standalone orchestrator pattern
of its sibling `graphics_module_1_topic_1_foundations` (ADR-007 / ADR-029 / ADR-033) — thin `main.js`,
pure leaves in a star, single `rebuild()`, full disposal contract, `window.simAPI`, CSS2D labels,
guided stepper — but departs from it in three places, deliberately:

1. **One `OrthographicCamera`, and no second camera.** There is no `PerspectiveCamera` in the scene
   and therefore no `projectionMorphK` blend. Orbit stays live on the parallel camera; the "Front
   view", "3-D view" and "Turn over" chips are azimuth/elevation tweens of that one camera.
2. **No occlusion raycaster and no `three-mesh-bvh`.** The Type A linework is authored from the very
   outline the solid is extruded from, and the drawing's single genuinely hidden outline — a
   countersink deliberately machined on the FAR face — is authored dashed. No edge classification is
   camera-dependent, so nothing is re-run on orbit.
3. **The topic's pure-data modules are the sibling-importable exception.** `dimensionData.js`,
   `dimensionSteps.js`, `dimensionRules.js`, `dimensionSymbols.js`, `dimensionExamples.js` and
   `dimensionAnimations.js` hold plain objects and pure functions — no DOM, no Three.js objects, no
   behaviour — and any leaf may import them. The BEHAVIOURAL leaves (`dimensionRig`, `dimensionDraw`,
   `dimensionLabels`, `dimensionUI`) still never import one another.

Two supporting mechanics fall out of it and are recorded here so they are not "tidied away": the
solid is **opaque** by default with an explicit render order `solid (0) → hidden dashed (1) → visible
wide (2) → dimension apparatus (3)`, the hidden batch running `depthTest: false`; and the dimension
apparatus is **declarative** — a step hands `main.js` a list of specs plus a per-spec reveal
progress, and one `redraw()` turns them into linework and CSS2D values. Geometry still changes only
inside `rebuild()`.

**Why:**
1. This topic *is* a drawing. A dimension states a true length, and under perspective every value on
   screen would be a lie about its own line. RULES.md §5.18's dual-camera morph exists to smooth the
   hand-off *between* a perspective view and an ortho quick-view; with no perspective camera there is
   no hand-off to smooth, so obeying §5.18 here would mean **adding** a camera the lesson must never
   use. (Contrast Topic 1, whose pictorial IS the subject.)
2. ADR-029/ADR-030's raycaster is load-bearing for Topic 1 *because* its lesson is the
   visible-to-hidden swap under orbit. Here the lesson is the dimension apparatus. Carrying the
   raycaster would buy nothing and re-import the ADR-029 performance class of problem; the ONE hidden
   outline the syllabus needs (§4.6 rule 5, "dimensions are to be given from visible outlines rather
   than from hidden lines") is instead designed into the part, which is both cheaper and
   pedagogically sharper — the student can see exactly which line the rule is about.
3. Six catalogues of textbook content cannot all hang off the orchestrator without `main.js` becoming
   a content file. §3.6's stated exception is "pure math/pure data may be shared" (`genericSolid.js`);
   these modules are the same category, and keeping the behavioural leaves strictly
   non-cross-importing preserves what the rule is actually protecting.

**Alternatives rejected:** *(a)* Add a perspective camera + `projectionMorphK` for §5.18 literal
compliance — rejected: it adds a projection the topic must never teach in, purely to satisfy a rule
whose precondition (two cameras) it would itself create. *(b)* Copy Topic 1's raycaster + BVH —
rejected: no camera-dependent decision exists to make, and it would tie a second topic to the ADR-030
dependency for nothing. *(c)* Draw the hidden countersink as a decorative dashed circle with no
geometry behind it — rejected: the 3-D view would expose the lie the moment a learner orbits, and
this whole topic is about drawings telling the truth. *(d)* Put every catalogue behind the
orchestrator — rejected: `main.js` stops being an orchestrator.

> **⚠️ POINT 2 SUPERSEDED BY ADR-136 (2026-07-27).** The topic now DOES carry the occlusion
> raycaster and `three-mesh-bvh` — but only for the 3-D inspection, which did not exist when this
> ADR was written. Point 2's reasoning held while the topic had a single fixed elevation and
> nothing camera-dependent; once the learner can turn the part, "what can I see from here?" is a
> live question. **Points 1 and 3 stand unchanged**: still one orthographic camera, still no
> projection morph, still sibling-importable pure-data catalogues. The FRONT ELEVATION still
> draws the authored linework, exactly as described below.

**Consequences:** The topic ships no `three-mesh-bvh` in its import map (RULES.md §2.20 does not
apply to it). Anyone porting from Topic 1 must NOT carry this decision back — Topic 1's raycaster is
protected by ADR-029's Phase-3 reversal note. The opaque-solid + render-order arrangement is the only
thing keeping the hidden linework visible; making the solid transparent by default would push it into
Three.js's late transparent pass and silently erase the drawing's one Type E/F line. The topic also
ADDS two viewport encodings (`--color-flag-wrong`, `--color-flag-right`) under RULES.md §4.16 — a
dimensioning lesson must be able to mark a stroke wrong inside the viewport, where the accent blue is
forbidden (§4.5) — and never uses them alone (a cross/tick marker and a written rule always accompany
them, Two-Cue Rule §4.6).
**Status:** Active.

---

## ADR-134: The Dimensioning topic's arrowhead proportions follow the textbook's Figs. 4.5–4.6 and §4.5, not the platform's 3:1 default

**Date:** 2026-07-26
**Decision:** In `graphics_module_1_topic_1_1_dimensioning`, the five termination styles are drawn to
the proportions its own master reference gives: **open** head with an included angle of about 15° and
a length of 4 mm, drawn with a THICK line (§4.5 item 2, the textbook's own suggestion for class
work); **closed** and **closed-and-filled** heads 3.5 mm long by 1.75 mm wide (Fig. 4.6's "3 to 4" by
"1.5 to 2"); **oblique** strokes at 45° (Fig. 4.5b); and **dots** of 1.5 mm (§4.5 item 2). The default
termination for the whole topic is the OPEN head, again per §4.5. RULES.md §6.19's platform default —
a strict 3:1 length:width head, filled on the Points Compare sheet and an open chevron in
`Module2/src/projectionDrawer.js` — does **not** apply to this topic's linework.

**Why:** §6.19 exists so that dimensions *incidental* to another lesson look consistent across the
platform. Here the arrowhead is not incidental: Step 2 puts the five styles on a selector and states
their proportions as the lesson content, and a student can hold the book beside the screen. A 3:1
head is outside the band Fig. 4.6 actually prints (3–4 long by 1.5–2 wide is between 1.5:1 and
2.7:1), so rendering 3:1 while the card quotes the book would make the simulation contradict its own
source of truth — the one thing this topic may never do.
**Alternatives rejected:** *(a)* Draw 3:1 and quote 3:1 in the copy — rejected: it misquotes the
textbook. *(b)* Draw 3:1 and quote the book — rejected: the drawing and the card would disagree in
front of the student. *(c)* Change §6.19 platform-wide — rejected: the other consumers (Points'
Canvas2D Compare sheet, Module 2's `projectionDrawer.js`) are settled under ADR-041/ADR-016 and have
no reason to move; a scoped exception is the smaller, honest change.
**Consequences:** Terminations in this topic will not match Module 2's or Points' pixel-for-pixel.
That is intended and must not be "fixed" (RULES.md §8.6). §6.19 is amended with an explicit
carve-out; if a future topic also teaches termination geometry, it should cite this ADR rather than
re-argue it.
**Status:** Active.

---

## ADR-135: A figure the subject cannot show is a figure the topic does not teach — the Dimensioning plate carries three features that exist only to make one; and a permission is never rendered as a violation

**Date:** 2026-07-27
**Decision:** Following the curriculum audit of `graphics_module_1_topic_1_1_dimensioning`
(`CURRICULUM-AUDIT.md`, which stays in the topic as its standing academic checklist), three
decisions were taken and are recorded here so none of them is later "simplified" away:

1. **Three features were added to the Guide Plate purely so that three of the chapter's figures
   have something real to be drawn on.** A **cylindrical spigot** ø28 × 26 stands off the right
   end face with its axis lying IN the drawing plane, so the front elevation shows it as a
   RECTANGLE — the entire subject of Fig. 4.21, and a case a flat plate has no other way to
   present. The step's top face is **crowned to R220**, a radius whose centre falls 166 mm below
   the plate and therefore off the sheet, which is what Fig. 4.22's large-radius cases are
   about. The bore's front mouth carries a **3 × 45° internal chamfer** (Fig. 4.26c), which is
   why the bore now reads as two concentric circles in the front view. All three are real
   manifold geometry, like everything else on the part.
2. **A rule card that shows something the chapter ALLOWS presents two lawful drawings, not a
   correct one and a violation.** Fig. 4.2 — "projection lines may be drawn as an extension of a
   centre line or outline of the object" — is a permission. The rule catalogue gained a
   `permission` flag that relabels the switch and suppresses the wrong-flag styling.
3. **Step 1 owns how a dimension is DRAWN; Step 2 owns where its parts may GO.** The termination
   selector, the included-angle slider, the Figs. 4.7–4.8 space study and the Fig. 4.4 leader
   heads all live in Step 1.

**Why:**
1. The audit's sharpest finding was not that anything was wrong, but that seventeen of
   forty-four figures had nothing on the sheet they could be demonstrated on. The topic's own
   founding constraint is ONE subject for all six steps — never switch objects — so the only
   honest way to close that gap was to give the subject the features. The alternative, a side
   diagram per missing figure, would have made the topic exactly the slideshow it was built not
   to be. The crown is deliberately shallow (≈3.7 mm of rise over an 80 mm chord) so it meets
   the R15 fillet at about 10°, under `dimensionRig.js`'s `CORNER_DEG` threshold, and the
   junction stays smooth instead of sprouting a spurious edge.
2. Rendering Fig. 4.2's alternative in `--color-flag-wrong` would teach the opposite of what the
   chapter says, in the one channel a student trusts most — the colour. The topic already
   distinguishes "wrong" from "different" everywhere else; a permission has to be able to say
   "both of these are correct" without borrowing the vocabulary of error.
3. Step 2 had accumulated three unrelated control clusters (seven rule cards, five terminations,
   a drag task) while Step 1 had one button and a row of chips. The split above is §4.1's own —
   the section names the termination and the leader as ELEMENTS, then states the rules about
   them separately — so it costs nothing in fidelity and fixes the load imbalance the audit
   measured.

**Alternatives rejected:** *(a)* Illustrate the missing figures on separate diagrams beside the
plate — rejected: it breaks the one-subject rule that makes every rule in the topic legible
against geometry the student already understands. *(b)* Leave Figs. 4.21/4.22/4.26c uncovered and
note the gap — rejected: the textbook is the syllabus, and "the model cannot show it" is not a
reason a student is excused from it. *(c)* Show Fig. 4.2 as a violation for switch symmetry —
rejected: it inverts the chapter. *(d)* Add a seventh step for the drawing mechanics — rejected:
the six-step flow is fixed, and §4.1 already groups these under the elements.

**Consequences:** `SHEET_MM.xMax` and `LANE.right1` both moved out to clear the spigot, so any
future dimension parked on the right must respect the new lane. The three added features are
load-bearing for Figs. 4.21, 4.22 and 4.26c and for two of Step 6's twelve faults; removing one
silently deletes a piece of the syllabus, which is why `CLAUDE.md` marks them. This ADR does NOT
cover the production/authoring workflow the audit identifies as the chapter's terminal objective:
that is deliberately postponed, because it needs an authoring surface, lane snapping and a
validation engine — a different interaction architecture from this topic's declarative spec
pipeline — and a half-built version would be worse than an honest absence.
**Status:** Active.

---

## ADR-136: The Dimensioning topic's 3-D inspection is classified LIVE by Foundations' raycaster; the front elevation keeps its authored linework (supersedes ADR-133 point 2)

**Date:** 2026-07-27
**Decision:** `graphics_module_1_topic_1_1_dimensioning` now carries the occlusion raycaster and
`three-mesh-bvh`, reusing the sibling Foundations topic's stack **verbatim** — `meshAnalyzer.js`
copied byte-for-byte, `lineDrawer.js` copied with only its header and group name retargeted, the
same global `computeBoundsTree` / `acceleratedRaycast` prototype patch, and the same
rAF-throttled `reclassify(camera)` in the render loop. The topic runs **two** linework systems
and swaps between them on the named camera pose:

- **FRONT ELEVATION → the authored linework, unchanged.** A drawing is a fixed, agreed
  projection. Which of its lines are dashed is a draughting decision the whole lesson rests on —
  Step 2's "measure from visible outlines" rule argues about one specific dashed circle — and it
  must not shift under the learner.
- **ANY OTHER DIRECTION → the live classifier.** Silhouettes appear and vanish under the orbit,
  and an edge that passes behind the boss goes dashed for exactly the stretch that is buried.
- **"Reveal hidden lines"** takes the solid's MATERIAL off while the mesh stays in the scene, so
  the raycaster (which reads geometry, never material) keeps classifying and the buried edges come
  out dashed. Same mechanism as Foundations' X-ray; the chip is disabled in the elevation, where
  there is nothing to reveal.

**Why:** ADR-133 point 2 argued that nothing in this topic was camera-dependent, so the raycaster
would buy nothing. That was true of a topic with one fixed elevation. It stopped being true the
moment the 3-D view became an *inspection*: static dashed lines that do not move when the part
does are not a simplification, they are wrong — they tell the learner a back-face feature is
hidden from a direction it is plainly visible from. The authored set is still right for the
elevation and still cheaper there, so neither system replaces the other; the pose decides.

Reuse rather than re-implementation is the point. Foundations' classifier is the reviewed
reference for this exact problem (ADR-029, and the Phase-3 reversal note that says never to drop
it), it already handles the hard cases — welded topology, silhouette seams on curved surfaces,
per-sub-segment partial occlusion, flush-seam suppression — and a learner moving between the two
topics should meet one behaviour, not two.

**Alternatives rejected:** *(a)* Classify everywhere, including the elevation — rejected: the
drawing's dashed lines would become an emergent property of the camera rather than a stated
convention, and the countersink Step 2 argues about could silently change. *(b)* Keep the authored
linework in 3-D and accept that it is stale — rejected: that is the defect. *(c)* Write a lighter
classifier for this topic — rejected: two implementations of one idea, and the light one would be
the one that gets the curved-surface silhouettes wrong.

**Consequences:** The topic now pins `three-mesh-bvh` in its import map (RULES.md §2.20 applies to
it after all — the note in ADR-133's consequences is superseded). `meshAnalyzer.js` is a third
verbatim copy and must stay byte-identical to Foundations'. The BVH is built once per `rebuild()`
and **freed with `disposeBoundsTree()` before the geometry** (ADR-004). Because the classifier
welds and raycasts in WORLD space, the sheet must be square-on and centred while it is live:
entering a dynamic view drops the Step-3 turn and the two-sheet compare, both of which are
flat-drawing devices, and returning to the front restores the turn. Measured on the Guide Plate:
**≈5.3 ms per pass, 1222 rays over 4641 edges** — comfortably inside a frame, and the pass is
gated on `lineDrawer.group.visible`, so the elevation costs nothing at all.
**Status:** Active. Supersedes ADR-133 point 2 only.

---

## ADR-137: Module-3 Topic 2.2 (Conic Sections) is cut from its SIBLING topic, not from `template_starter/`

**Date:** 2026-07-29
**Decision:** `graphics_module_3_topic_2_2_conic_sections` was scaffolded by duplicating
`graphics_module_3_topic_2_development_of_surfaces` — then immediately re-copying every shared
engine file from `Module2/src/` and verifying each by `md5sum` — rather than duplicating
`template_starter/` as MODULE-STARTER §3.2 prescribes.
**Why:** The template carries the platform skeleton but NOT the Module-3 layer this topic needs:
`problemLibrary.js` and the active-problem/library markup were deliberately stripped from it, and
its Compare card ships as unwired CSS + markup scaffolding. Cutting from the template would have
meant re-deriving that layer from the two Module-3 topics anyway, by hand, with a real chance of
subtle divergence in exactly the chrome the topic was required to keep identical. Cutting from the
sibling starts at parity and makes the delta reviewable. The hazard MODULE-STARTER §9 warns about —
"the topics are already scoped-down and some carry stale shared files" — was neutralised directly:
`anim.js`, `cone.js`, `iShape.js` and `shapeData.js` were re-copied from the master and confirmed
byte-identical by `md5sum`, and `sectionCut.js` was re-copied from topic 1.
**Alternatives rejected:** *(a)* Duplicate `template_starter/` and port the library layer by hand —
rejected as above: the same code, arrived at less reliably. *(b)* Duplicate `Module2/` (the
"legitimate shortcut" §2 allows) — rejected: this topic uses one generator out of five and none of
the projection stack, so it would be mostly deletion, and it would still not carry the Module-3
Compare wiring. *(c)* Extend the sibling topic in place — rejected outright: a topic is a catalogue
entry, and conic sections is not development of surfaces.
**Consequences:** The three Module-3 topics now share their chrome by descent, so a fix to the
wizard / Compare / library chrome still has to be re-copied by hand to all three (ARCHITECTURE.md
§9.2 — unchanged, only wider). MODULE-STARTER §3.2 should be read as "duplicate the boilerplate, OR
the nearest sibling if it carries a layer the boilerplate lacks — then re-copy every shared file
from the master and verify it." The verification step is the part that is not optional.
**Status:** Active

---

## ADR-138: The Conic Sections drawing sheet stores MILLIMETRES; the 3D scene keeps world units

**Date:** 2026-07-29
**Decision:** `ConicState` (eccentricity, focus-to-directrix distance, and every construction
dimension) is stored in millimetres and degrees. The 3D cone and its cutting plane keep the
platform's world units (ADR-018's `1 unit = 10 mm`); `src/uiManager.js` converts at the control,
and `src/conicEngine.js` never converts at all.
**Why:** The sheet is a plane construction that never enters the 3D scene — no camera, no mesh, no
shared geometry — while every quantity it draws is quoted in millimetres by the chapter it teaches
("FA = 50 mm", "major axis 150 mm", "asymptotes at 75°"). Storing world units would have left the
data layer, the dock, the self-check targets and the textbook statement all disagreeing about the
same number with a ×10 in between: the class of mistake ADR-018 exists to prevent, only inverted.
Keeping the 3D half in world units keeps `cone.js`, `shapeData.js` and `sectionCut.js`
byte-identical to their masters.
**Alternatives rejected:** *(a)* World units everywhere, with the dock showing mm — rejected: the
Problem Library's targets would then read `5.0` where the exercise says `50 mm`, and every future
author would have to remember the factor. *(b)* Millimetres everywhere, converting the cone —
rejected: it would fork the shared geometry files, the one thing RULES.md §1.3 forbids.
**Consequences:** The topic has two unit systems, each stated in exactly one place (`conicData.js`'s
header, and the dock's slider table where the `scale` column converts). The Compare sheet's fixed
intrinsic frame (ADR-053) is therefore a px-per-**mm** scale with no `WORLD_TO_MM` factor, unlike
the sibling topics'. Any future control that drives BOTH halves must state which side it is in.
**Status:** Active

---

## ADR-139: The conic curves are drawn by a pure `conicEngine.js` leaf, from ONE focal-polar model, as a display list

**Date:** 2026-07-29
**Decision:** All plane-curve mathematics and all Canvas2D drawing for the Compare sheet live in
one pure leaf, `src/conicEngine.js` (the ADR-066 pattern). Inside it: a single conic model derived
from the focal polar r = e·FA ÷ (1 + e·cos θ) serves all three curves; each of the four sheet modes
and each of the eleven constructions returns a **display list** of typed primitives plus an
analytic bbox; and one `drawSheet()` renders them in drafting order — construction linework thin,
the finished curve heavy, the marked apparatus on top.
**Why:** The chapter draws the same three curves twelve different ways. Written directly that is
twelve drawing routines, each free to disagree about line weight, label placement, and what counts
as construction versus answer — the drift the Two-Weight Rule forbids. A display list makes a new
construction a new *layout function*, never a new drawing path. Deriving every named quantity
(vertex, centre, second focus and directrix, semi-latus rectum, asymptotes, both axes) from one
equation removes the other failure mode: three curve implementations that are each subtly right and
mutually inconsistent. And because the leaf imports nothing and touches no DOM, every layout is
testable from Node — which is how all twelve were proved (see Consequences).
**Alternatives rejected:** *(a)* Immediate-mode drawing per method — rejected as above. *(b)* Three
curve classes (Ellipse / Parabola / Hyperbola) — rejected: §6.3's whole point is that they are one
family separated only by e; three classes would bury it. *(c)* A curve/geometry library — rejected
by the no-build, no-npm contract (ADR-001), and it would make the constructions unprovable: the
point of the offset method is that the offsets ARE the squares, not that a library produced a
parabola.
**Consequences:** A Node oracle asserts that every plotted construction point satisfies its own
conic — PF = e·PQ for the locus, x²/a² + y²/b² = 1 for the ellipse methods, a zero discriminant for
the tangent method's envelope, and a constant sum / difference / product for the arc, foci and
asymptote methods — to ~1e-14. Two real errors were caught by it and fixed: the focal polar's θ = 0
was aiming AWAY from the directrix (putting the vertex on the far side and breaking PF = e·PQ for
every point), and Fig. 6.20's joins were paired to the wrong edges (V₁ to the ordinate edge instead
of the top edge), which drew a plausible curve that was not the given hyperbola. Re-run the oracle
after touching any layout.
**Status:** Active

---

## ADR-140: In Conic Sections the section clipper EXTRACTS the curve; the cone is never cut away *(superseded by ADR-165 — the cone IS cut; the removed material is kept as a ghost)*

**Date:** 2026-07-29
**Decision:** `sectionCut.js` (ADR-058) is ported verbatim into the Conic Sections topic, but its
sliced solid is discarded: the topic keeps the double cone whole, draws the clipper's ordered
boundary loop on it as a fat `Line2` in the section colour, and lifts the clipper's cap triangles
out as the section face. The cone turns translucent only while a section is on.
**Why:** Topic 1 (Sections of Solids) teaches the SOLID left after a cut, so removing the discarded
half is its lesson. This topic teaches the CURVE, and removing material works against it: a
hyperbola exists because the plane meets both nappes, and the kept half-space always discards one
of them — the learner would watch half the subject vanish at the moment it became relevant. The
chapter's own pictorials (Fig. 6.2 a–f) show the section on an intact cone, which is exactly what
this produces. The clipper is still the right tool: its `loops` output is already welded and
ordered on meshAnalyzer's 1e-3 lattice, so the curve needs no reconstruction.
**Alternatives rejected:** *(a)* Truncate like topic 1 — rejected as above; it also makes the
rectangular hyperbola (which needs both nappes, on the same side of the axis) undrawable. *(b)* Cut
each nappe with an opposite-facing plane so both survive — rejected: two contradictory planes on
screen, and the caps would face the wrong way. *(c)* Intersect analytically without the clipper —
rejected: a second implementation of a solved problem, and it would not weld.
**Consequences:** The topic pays for one clip per nappe per rebuild and disposes the sliced geometry
by hand, pre-scene, so the rebuild disposal contract never sees it. `sim.hasCut()` reports whether a
section was found at all, which is the Problem Library's cuts-the-solid guard here as in both
siblings. A contributor who reads topic 1 first will find this surprising — it is stated in the
topic's CLAUDE.md and README as well as here.
**Status:** Superseded by ADR-165 (2026-07-31) — the cone IS truncated now, the reference
topic's way; the nappe a hyperbola needs is preserved as a faint ghost of the removed material
rather than by leaving the solid whole.

---

## ADR-141: Conic Sections is sequenced as a lesson, not exposed as a parameter set — observe, then experiment, then name

**Date:** 2026-07-30
**Decision:** The topic's six steps were re-cut into a story — meet the cone · cut it · six cuts,
six curves · why they differ · how it is drawn · your turn — and every control was moved to the
step whose question it answers, or removed. Concretely:
- The section plane is switched **on by Step 2 itself** (`setStage`), so the on/off toggle is gone;
  stepping back to Step 1 takes the plane away again.
- Step 2 reports the cut in **plain words with no name** ("a closed oval — longer one way than the
  other, but it still closes up"). The engineering name and the textbook rule arrive in Step 3, on
  the six "show me" chips that travel the plane to each named cut.
- Step 4 opens the drawing sheet **after** swinging the camera round to look at the cut square-on,
  so the learner sees the 3D slice become the 2D curve. Its one driver is the ratio PF ÷ PQ; the
  §6.2/§6.4/§6.8 vocabulary is behind a "label the engineering names" toggle, off by default.
- Step 5 **plays the construction** stage by stage (`BUILD_STAGES`, gated in the engine by
  `conicState.buildStage`) instead of presenting it finished. The other eleven methods sit behind
  one select, with only the dimensions that method is given.
- Step 6 is a **predict-and-verify drill**: the sim deals a cut the learner did not choose, keeps
  its name back, and marks their answer against the same `classifySection()` the earlier steps
  report with.
- Retired from the dock: the curve select (derived from e), the focus-to-directrix slider (fixed at
  the chapter's own 50 mm), and the plane on/off toggle. Every remaining control earns its place in
  exactly one step.
**Why:** The first build was complete and wrong-shaped: it showed a first-year every engineering
parameter of the chapter at once — twelve constructions, three dimension fields, an eccentricity, a
focal distance, a curve picker — and read as CAD software with a syllabus attached. PRODUCT.md's
arc is Orient → Intuition → Problem-solving, and its persona is the struggling first-year; a panel
that offers eleven methods before the learner knows why a parabola differs from an ellipse inverts
that. The chapter itself teaches in this order (the cone, then the cuts, then the locus, then the
constructions), so following it costs nothing architecturally and is what the material already
assumes.
**Alternatives rejected:** *(a)* Keep every control visible and improve the copy — rejected: the
copy was not the load; sixteen live controls across six panels was. *(b)* Split into more steps so
each holds fewer controls — rejected: six steps is the brief and the sibling topics' shape, and the
problem is disclosure, not step count. *(c)* Add a "beginner mode" toggle over the existing panel —
rejected: two UIs to maintain, and the learner who most needs the simple one is the least likely to
find the switch.
**Consequences:** The dock is now stage-aware — `sim.stage()` decides what a readout may say, which
means the step change itself is a state change and `setStage` must fire the state bus (it does).
`ConicSection` entries carry three descriptions of one idea (`seen` plain, `name`, `rule` formal),
so a future contributor adding a cut must supply all three. Teaching demonstrations that MOVE the
plane (Step 3's chips, Step 6's deal) are sanctioned; this does **not** loosen ADR-063, whose ban on
a "parallel to a generator" preset governs the Problem Library's checked targets — the learner still
sweeps the tilt by hand in Step 2 and predicts with no chips to lean on in Step 6. Labels on the
sheet are suppressed below ~1.3 px per millimetre, because at compact card size a 12 px caption is
nine millimetres of "drawing" and the annotation becomes the figure.
**Status:** Active

## ADR-164: A label is a drawing annotation, not a floating word — leader lines, screen-space anchors, and a concealed axis drawn to convention

**Date:** 2026-07-31
**Decision:** Every name a Simatrix topic puts on a solid or on a sheet is placed the way a
draughtsman places one. Four rules, first applied in Conic Sections:
- **Attached, not adjacent.** A 3-D anatomy label is a pill PLUS a leader line PLUS a dot on the
  feature it names (`annotate()` in `main.js`). A pill on its own reads as a word hovering near
  the solid; the learner has to guess which part it means.
- **Anchored in SCREEN space, not world space.** The pill's offset from its feature is applied
  along the camera's own right/up axes and recomputed every frame, so a label placed clear of the
  silhouette stays clear of it at every orbit angle. Fixed world anchors swing across the solid
  the moment the view turns — which is exactly what the first build did.
- **Never stacked, never spilled.** After the CSS2D pass, overlapping pills are nudged apart and
  clamped inside the pane (`declutterLabels()`, run only when the view has moved). On the Canvas2D
  sheet the same job is done analytically before painting (`drawLabels()`): each caption is
  measured, tried where it was authored, then stepped along a fixed ladder of alternatives, and
  dropped only if every one is taken. Captions are placed in priority order — the marked apparatus
  the step is ABOUT first, the axes next, the general nomenclature last — and the finished curve is
  an obstacle, so a name is nudged off the answer the same way it is nudged off another name.
- **Visibility is shared with the geometry.** A label leaves with the thing it names. Hiding the
  second nappe takes BOTH nappe labels with it, because "nappe" means nothing without the double
  cone on screen.

A solid's **axis** is drawn to Engineering Graphics convention rather than omitted: a chain-line
stub where it projects past the outline, and the concealed run drawn as short-dash hidden linework
with `depthTest: false`, so "the axis exists inside the cone" is something the learner can see. It
is present whenever the cone is, because it is part of how a cone is REPRESENTED, not a Step-1
annotation. Both parts are explicit segment geometry (`patternedAxis()`), not
`LineDashedMaterial` — the dash length becomes a drawing decision and there is no
`computeLineDistances()` to forget.

Each named part carries **one plain-English sentence**, shown on a deliberate ~1.2 s hover (or at
once on keyboard focus) in one shared tooltip node.

**Why:** The first build's labels were six pills at fixed world points with nothing joining them to
anything. They collided on the default view, swung over the solid on orbit, named a "lower nappe"
that had no upper nappe to be lower than, and carried an "apex angle" readout that belongs to no
step's question. The axis was a dashed line inside an opaque solid — invisible, so the one part
§6.1 insists on could not be seen at all. And the §6.4 nomenclature figure put a dozen captions
round one ellipse where they were authored, so several were unreadable. Every one of those is a
teaching failure, not a cosmetic one: a label the learner cannot read, cannot attribute, or should
not be seeing is worse than no label.

**Alternatives rejected:** *(a)* Keep world anchors and simply push them further out — rejected:
"further out" is an azimuth-dependent quantity, so it either fails at some angle or wastes the pane
at every other one. *(b)* Resolve 3-D label collisions by projecting and nudging every frame —
rejected as needless layout thrash; the pass runs only when the camera or the model has moved, and
only while Step 1's labels exist. *(c)* Draw the axis through the solid at full strength, or make
the cone permanently translucent so the axis shows — rejected: the first competes with the
outline, the second gives up the solid reading the chapter's own pictorials depend on. *(d)* Cut
the §6.4 nomenclature figure down until nothing collides — rejected: the crowding is the chapter's,
and a general placement pass fixes it for every construction rather than one figure.

**Consequences:** `annotate()` is the only way to add a 3-D name in this topic, and it demands the
plain-English sentence as an argument — a label with nothing to say cannot be written by accident.
Leader geometry is rewritten in place each frame from two pre-sized buffers (occluded and
drawn-through), so adding a label means re-running `addAnatomyLabels()`, never mutating the live
group. Because the sheet's placement pass may DROP a caption on a crowded figure, a construction
must never depend on a caption to be legible — the linework has to carry the figure on its own.
`verify/annotations.mjs` is the oracle: it asserts the vocabulary, the sentences, zero overlap and
zero spill across five orbit poses, the hover delay, and that both nappe labels leave with the
geometry.
**Status:** Active

## ADR-165: Conic Sections cuts for real, and its two panes are one model — the sheet draws the curve of the LIVE section (supersedes ADR-140)

**Date:** 2026-07-31
**Decision:** Four changes, all of them the same decision seen from different ends: the cut, the
cut face, the sheet and the step that joins them are one continuous piece of teaching rather than
two pictures placed side by side.

- **The cut is the learner's to make.** A `Cut the cone` checkbox (`sectionState.cut`), exactly the
  reference topic's `#tgl-section` interaction. Unticked, the double cone is whole and the
  translucent plane still passes through it — tilting and sliding are live, because that is how you
  AIM a knife, and the readout already says what this cut would leave. Ticked, the clipper runs.
  The steps that DEMONSTRATE (3 onward) tick it themselves; Step 2, where cutting is the lesson,
  leaves it to the learner.
- **The cone is truncated, and the cap is a real face — superseding ADR-140.** Each nappe's geometry
  is swapped for `cutGeometryWithPlane`'s result and its cap becomes material group 1 in the section
  token, the reference topic's own pattern. The previous build kept the solid whole, lifted the cap
  out as a floating mesh and made the cone translucent to see it through: the section face read as a
  stain rather than a surface, and the transparency cost correct depth sorting. Now it is lit like
  any other face, sorted like any other face, and visible from every angle with no trickery.
  ADR-140's reason for keeping the solid whole — that truncation hides the nappe a hyperbola needs —
  is answered instead by drawing the REMOVED material as a faint ghost, so §6.1's own pictorials
  (Fig. 6.2, the section on a whole cone) still read while the cut is a real cut.
- **The sheet draws the curve of the live cut.** `e = sin θ ÷ sin g` — the section's eccentricity
  from the plane's tilt and the cone's own generator angle — so reshaping the cone or moving the
  plane moves the curve on the paper, and Step 3's chips morph the drawing as the plane travels.
  The link holds for Steps 1-4, the taught half. From Step 5 the chapter's exercises give the
  eccentricity and the focal distance as DATA, so both become the learner's own dials there and the
  link is released.
- **Step 4 reveals its answer in stages.** `LOCUS_STAGES`: the curve alone (recognisably the slice
  just made), then the line it is measured to, then the point it is measured from, then P with its
  two distances, then the ratio. `focus`, `directrix` and `eccentricity` are not printed until the
  things they name are on the sheet — the panel's term block unhides at the last stage.

The drawing sheet also stopped being a picture: pointing at any element names it in one sentence
(`describeAt()` in the engine, matched on the caption the engine itself drew) and rings it on the
canvas; the auxiliary construction linework can be hidden; and the construction can be stepped a
line at a time in both directions as well as played.

**Why:** The topic had drifted into two independent halves. The 3-D pane always showed a cutting
plane the learner never chose and a section face they could barely see; the sheet showed a curve
driven by an abstract ratio slider with no connection to the cone beside it. A learner could set
the cut to a hyperbola and the sheet would go on drawing an ellipse. That is not a hard question —
it is two different lessons in one window, and the eccentricity identity that joins them is a
single line of trigonometry the chapter already assumes.

**Alternatives rejected:** *(a)* Keep the intact cone and improve the cap's material — rejected: no
material makes an interior surface read correctly through a translucent shell, and the reference
topic's answer was already in the repository. *(b)* Drive the cut FROM the sheet's eccentricity
slider (the reverse link) — rejected: the cone is the thing the chapter starts from, and a slider
that silently re-poses a solid is harder to follow than a plane you can see moving. *(c)* Keep the
eccentricity slider live in Step 4 alongside the tilt — rejected: two controls writing one value,
where moving either silently desynchronises the other pane. *(d)* Truncate without the ghost —
rejected: at a steep tilt the remaining stump is unrecognisable as a cone and a hyperbola's second
branch leaves with the nappe that carried it.

**Consequences:** `sectionState` carries `cut` beside `enabled`, and the two mean different things:
`enabled` is "the plane is present" (the step decides), `cut` is "it bites" (the learner decides).
Edge overlays must be built AFTER the cut, because a truncated nappe has a different silhouette,
and the axis centre line is measured from the surviving geometry. The classification remains the
chapter's ANGLE rule, which describes an infinite cone, so a steep cut can be a hyperbola by the
rule while its second branch falls beyond a finite nappe — the dock says so rather than promising a
branch that is not on screen. Because the sheet's captions now carry hover explanations matched on
their own text, a construction that grows a new labelled element without adding its sentence will
show up as an unexplained element; `verify/interaction.mjs` is the oracle for all of it.
**Status:** Active

## ADR-166: Conic Sections teaches the focal sphere — the focus and the directrix are FOUND on the cone before they are used on paper

**Date:** 2026-08-01
**Decision:** Step 4's reveal runs in two acts rather than one. The first act is played on the
solid and is §6.2 items 1–4 of the chapter, in the chapter's own order: a sphere is inscribed
in the cone until it touches the cutting plane; that single touching point IS the focus; the
circle where the sphere touches the cone is carried by a plane perpendicular to the axis — the
tangent plane; and where THAT crosses the cutting plane IS the directrix. Only then does the
second act, the existing sheet reveal (§6.3), measure PF and PQ with them.

- **The maths is a pure function.** `focalSphereFor()` in `src/conicData.js` solves the whole
  construction in the V.P. — the y-z plane through the axis — because the cutting plane is
  always perpendicular to it (ADR-068), so the sphere's centre, the focus and the directrix's
  crossing point all lie in that one plane and the problem is two-dimensional. It returns
  `null` for the apex cut (no sphere exists) and a null `directrix` for the circle (the two
  planes are parallel, which is exactly why a circle has no directrix and e = 0).
- **The reveal is ONE sequence of ten stages**, not two buttons: `conicState.focalStage`
  0–5 walks the cone act and `locusStage` 0–4 the sheet act, and `revealStages()` joins them
  so the dock shows "4 of 10 · The focus (on the cone)". A cut with no sphere falls back to
  the five sheet stages rather than pretending.
- **The apparatus is drawn in the projection teal** used nowhere else in this topic, so it
  reads as an instrument the way the crimson cutting plane does — and the two things it
  PRODUCES are drawn in `--color-conic-mark`, the sheet's own focus/directrix colour, because
  they are the same focus and the same directrix the sheet is about to use.
- **The act gets its own camera pose.** Step 4 arrives facing the cut square-on, which is
  right for reading the curve's true shape and useless for watching a sphere descend into a
  cone; `faceTheFocalSphere()` swings to the near-elevation the textbook figure is drawn in.

**Why:** The syllabus audit of 2026-08-01 found this the largest conceptual gap in the topic:
§6.2 defines the focus and the directrix ON THE CONE, and the simulation skipped straight to
§6.3's locus, handing the learner two pieces of apparatus with no origin. Worse, the bridge the
topic HAD invented between its two panes — `e = sin θ ÷ sin g` (ADR-165) — is correct
trigonometry that the chapter never states, so the one place the learner was told "these two
pictures are the same thing" was the one place the book could not back up. The focal sphere is
the book's own answer, it is inherently three-dimensional, and it is the one thing left in this
topic that the drawing sheet structurally cannot teach.

**Alternatives rejected:** *(a)* A seventh step for the sphere — rejected: the six-step journey
is fixed, and this IS the answer to Step 4's own question. *(b)* A separate "show me the
sphere" button beside "Show me why" — rejected: two buttons make two lessons, and the whole
point is that the focus on the cone and the F on the sheet are one object. *(c)* Deriving the
sphere numerically from the clipped mesh — rejected: the construction is four lines of
trigonometry, and a pure function is one an oracle can prove. *(d)* Showing both Dandelin
spheres (an ellipse has two) — rejected: the sheet draws ONE focus and ONE directrix, and a
second sphere would raise a question this chapter does not answer.

**Consequences:** `conicState` carries `focalStage`, and `setStage` must rebuild on entering
AND leaving Step 4 (the apparatus lives in the scene graph, so it comes and goes like the
Step-1 anatomy labels). The leader-line machinery is now shared: `attachLeaders()` is called
once per build, after whichever step's `annotate()` calls ran — Step 1's labels and Step 4's
never coexist, which is what makes one pair of buffers correct. `verify/conic-math.mjs` proves
the construction the only way that means anything: it measures PF ÷ PQ at the vertices of the
REAL section and demands §6.3's eccentricity, for every case from the circle to the rectangular
hyperbola. `verify/shipped-module.mjs` hammers the tilt with the apparatus fully revealed,
because an undisposed sphere is the fastest way there is to exhaust a WebGL context.
**Status:** Active

## ADR-167: In Conic Sections the sheet draws WHAT THE CUT IS — three of §6.1's six sections are not plane conics

**Date:** 2026-08-01
**Decision:** `conicState` carries `cutKind` — `'conic' | 'circle' | 'triangle' | 'none'` — derived
from the live scene at the END of `rebuild()`, and the sheet has a layout for each:

- **Circle (plane AA).** e = 0, which the focal-polar model cannot express: its radius collapses.
  The sheet draws the TRUE circle at the radius the cone actually has where the plane crosses it,
  with its centre marked and the statement that follows from the focal sphere — the centre and the
  focus are the same point, the directrix is infinitely far away.
- **Isosceles triangle (plane FF).** Not a locus at all. The sheet draws §6.1 item 6: two
  generators and the chord of the base between their feet, with both dimensions. Where the plane
  through the apex is FLATTER than the generators it touches the cone at one point and nowhere
  else, and the sheet says exactly that.
- **The plane clear of the cone.** Nothing is cut, and the sheet says so instead of holding the
  last curve it had.

Everything else is a conic and behaves as ADR-165 set out. The dock's readout and Step 4's reveal
branch on the same `cutKind`, so the 3-D pane, the sheet and the words can never describe
different things.

**Why:** The syllabus audit of 2026-08-01 found the two panes contradicting each other at both
degenerate cuts. `syncSheetToCut()` clamped the derived eccentricity to the slider's floor of 0.2,
so a flat cut drew a visible ellipse while the cone showed a circle; and the apex cut was ignored
entirely, so the 3-D pane named an isosceles triangle while the sheet drew whatever conic the tilt
happened to imply. Both are worse than a missing feature: a learner who trusts the simulation
learns something false.

**Alternatives rejected:** *(a)* Special-case e = 0 inside `conicModel` — rejected: a circle is not
a focal-polar conic at any tolerance, and the model would have to grow a second parametrisation to
pretend otherwise. *(b)* Blank the sheet for the two degenerate cuts — rejected: they are two of
the chapter's six named sections and each has a drawing worth reading. *(c)* Leave the sheet
showing the previous curve — rejected: that is the contradiction itself.

**Consequences:** `syncSheetToCut()` moved INTO `rebuild()`'s tail and every other call site was
removed, because two of the four cases can only be settled once the clipper has reported whether
the plane hit anything — a caller that ran the sync BEFORE the rebuild would read last frame's
answer. `sheetMode()` now consults `cutKind` before anything else while the sheet is locked to
the cut, which also keeps the terminology sheet — a conic's own figure — off a cut that has no
conic. Step 4's reveal returns a shorter list for the non-conic cuts (the circle's ends on the
cone, at the two parallel planes that are the reason it has no directrix), and the panel's
vocabulary block stays shut for a cut that produced no focus and no directrix to name.
**Status:** Active

## ADR-168: The Conic Sections drawing sheet REPORTS what it measures — a worksheet, not a picture

**Date:** 2026-08-01
**Decision:** Every layout the engine returns carries `results` — a list of
`{label, value, unit, from}` — and the dock renders it under **"What the drawing gives you"** at
the foot of Step 5. `from` names where the quantity is read on the sheet, in the drawing's own
lettering ("VV′", "at the centre O", "F₁ and F₂"), so the number can always be checked against
the figure rather than taken on trust. Three shared helpers cover the chapter: `ellipseResults`,
`parabolaResults` and `hyperbolaResults`, because four ellipse constructions given four
different sets of data all yield the same figure and should report the same quantities.

**Why:** Six of the chapter's fifteen exercises end in *measure*, *determine*, *find* or
*locate*: exercise 1 wants the major and minor axes, 4 wants the axes of an ellipse given by its
conjugate diameters, 5 the major axis, 8 and 10 the focus and directrix, 13 the angle between
the asymptotes. The sheet drew all of them and stated none of them, so a learner had no way to
finish the question — and one problem hint already claimed otherwise ("the construction reports
the major axis as VV′"). It did not.

**Alternatives rejected:** *(a)* Dimension every answer ON the drawing — rejected: the sheet's
caption pass already drops captions on a crowded figure by design (RULES.md §3.39), and six more
would push it there on every construction. *(b)* Report only the quantity the loaded exercise
asks for — rejected: the topic is used without a problem loaded as often as with one. *(c)* One
results function per construction — rejected: eleven near-copies, and the four ellipse methods
would have drifted apart on the first edit.

**Consequences:** Results are computed by `drawCompare()` and read back through
`sim.sheetResults()`, so the block is empty while the sheet is CLOSED — these are the drawing's
answers and there is no drawing. The parallelogram method needed a real derivation rather than
an echo of its inputs: its ellipse is oblique, so `principalAxes()` supplies the true axes, and
its parabola's focal distance comes from `focalOfAffine()`, which re-bases the oblique
parametrisation on the diameter whose tangent is square to it. `verify/conic-math.mjs` checks
every reported number against the geometry that was actually plotted — the major axis against
the drawn curve's longest chord, the focus against the latus rectum, `a² = b² + c²` — never
against the formula that produced it, and the oblique-ellipse case caught a first version of
that check that compared against an x/y span.
**Status:** Active

## ADR-169: Every term Chapter 6 defines is CAPTIONED on the figure that draws it

**Date:** 2026-08-01
**Decision:** The terminology sheet names §6.4's auxiliary circles (with their major and minor
diameters), draws and names §6.4's conjugate diameters, and calls both the ellipse's and the
hyperbola's centre "Centre C" / "Centre O" — the caption whose hover explanation carries the
chapter's own phrase, *central conic*. The terms sheet also gets a wider margin than the
constructions, because its captions are the longest in the topic.

**Why:** The syllabus audit found four terms DRAWN and unnamed. Both auxiliary circles were on
the sheet as dashed circles with no caption at all — a term the learner can see, cannot name,
and cannot look up. "Major diameter", "minor diameter", "conjugate diameters" and "central
conic" appeared nowhere in the topic. Conjugate diameters matter twice over: they are what
Example 6.4's parallelogram method is GIVEN, so a learner meeting that construction had been
shown its input nowhere.

**Alternatives rejected:** *(a)* Put the four terms in the step card's prose — rejected: this
topic's rule is that a name belongs to the thing it names, on the drawing (ADR-164). *(b)* A
separate "ellipse terminology" sheet to spread the load — rejected: Fig. 6.4 is one figure in
the book and splitting it would lose exactly what it is for.

**Consequences:** The terminology figure is now the densest sheet in the topic, which is why it
stays opt-in behind Step 4's "Label the engineering names" and why `drawCompare` gives mode
`terms` a 0.16 margin fraction against everything else's 0.11. Its caption pass may still drop
one name on a crowded frame, by design (RULES.md §3.39) — the maths oracle asserts the FULL set
is present in the layout, which is the check that cannot be defeated by a placement decision.
**Status:** Active

## ADR-170: §6.6's three properties of the parabola are DRAWN, and the drawing is the proof

**Date:** 2026-08-01
**Decision:** A `props` sheet mode with three stages, played from a Step-5 button that appears
only while a parabola is on the sheet:

1. the circumscribing box with the curve's own region hatched — *area = ⅔ of the box*;
2. a FOCAL chord with the tangents at its ends, meeting on the directrix at a right angle;
3. any other chord, whose tangents meet on the diameter that bisects it.

The figure is drawn upright (vertex at the origin, opening up the sheet), and every stage is
exact: the parabola is taken as P(t) = (2f·t, −f·t²), the tangents at t₁ and t₂ meet at
(f(t₁ + t₂), −f·t₁t₂), and a chord is focal exactly when t₁t₂ = −1 — which puts that meeting
point on the directrix with tangent slopes whose product is −1. The chapter's engineering
applications (headlamp reflector, solar concentrator, bridge arch, the path of a thrown object)
are one sentence beside the button, not a paragraph.

**Why:** The audit found properties 1–3 missing entirely while 4 and 5 were already captioned on
the terminology sheet. The chapter introduces all five as "useful in the construction of a
parabola" — property 3 is the whole basis of the tangent method the topic already ships — and a
sentence is not a reason to believe a claim about a curve. Each of these three is exact, so a
correct figure IS the proof, which is the one thing a textbook page cannot offer.

**Alternatives rejected:** *(a)* Add the three to the terminology sheet — rejected: it is
already the densest figure here, and these are claims about the whole curve rather than names
for its parts. *(b)* A seventh step — rejected outright; the six-step journey is fixed. *(c)* A
paragraph in the step card — rejected: the brief for this work asks for them taught visually,
and a property nobody can see is a property nobody checks.

**Consequences:** `props` takes the sheet over while it plays and hands it straight back on any
control that changes what is drawn, so it can never become a mode to get stuck in. The figure's
REACH is tuned to 1.8 for a reason worth stating: `drawSheet` drops every non-axis caption below
1.3 px per mm, the compact card is 418 × 269, and at REACH 2.2 the figure fell to 1.19 px/mm and
lost every letter on it. Both chord parameters must also stay inside REACH — a first version put
Q at t = 2.2 on a curve drawn only to 1.8, claiming something about a point the drawing did not
contain. `verify/conic-math.mjs` integrates the hatched region to 0.66667 of the box and checks
the tangency and perpendicularity claims off the display list.
**Status:** Active

## ADR-171: The rest of §6.8, and the one method of §6.5 that can be drawn without inventing it

**Date:** 2026-08-01
**Decision:** Phases 6 and 7 of the audit roadmap, finishing the syllabus:

- **The tangent bisects ∠F₂PF₁** (§6.8), drawn on `hyperbola-foci` — the one construction with
  both foci on the paper, so the claim can be checked where it is made. The tangent is drawn AS
  the bisector of the two focal radii, with an equal-angle mark on each side.
- **The asymptotes cut the auxiliary circle ON the directrix** (§6.8), marked on the terminology
  sheet at x = a² ÷ c, where all three curves genuinely meet.
- **The rectangular hyperbola is named** whenever the angle between the asymptotes reaches 90°,
  by the results block, in both the `hyperbola-foci` and the asymptote constructions — the case
  §6.8's last paragraph defines and the topic previously only had as a SECTION (plane EE).
- **The approximate ellipse by four centres** (§6.5 item 8) is implemented. **The circle method
  (item 7) is not**, deliberately: the chapter lists it and gives no procedure, and inventing
  one would be adding syllabus rather than covering it. The audit says the same in as many
  words — do not assume anything beyond what the textbook contains.

**Why:** These were the last unticked lines of the coverage matrix. The three hyperbola items
are each one sentence in the book that the topic drew everything for and stated nothing about;
the four-centre construction is the only §6.5 method left, it is a fixed classical procedure, and
it is the construction Module 4 uses for isometric circles.

**Consequences:** The construction list is thirteen, not twelve — `verify/shipped-module.mjs`
asserts the count, so the change had to be deliberate. The four-centre arcs meet by INTERNAL
tangency (|GH| = rH − rG), which means each junction lies on GH produced BEYOND the small
centre; reading it as "toward the other centre" drew a lozenge, and the oracle now asserts the
tangency relation rather than the picture. The sheet says "four arcs, not a true ellipse" on the
drawing, and the oracle demands the curve be close to the true ellipse WITHOUT being equal to it
— an approximation that tested as exact would mean the construction was not being followed.
**Status:** Active

## ADR-172: Step 4 is a proof the learner WALKS — and the tangent plane is not tangent to the sphere

**Date:** 2026-08-01
**Decision:** Step 4's explanation of where the focus and the directrix come from is rebuilt as
six stages the learner steps through by hand, with the same two-button stepper Step 5 already
uses for its construction. Nothing plays by itself; `Next` is refused while a stage's own
animation is running, and `Back` restores the previous stage at once with no animation to sit
through twice.

  1 the cutting plane alone · 2 the ball, and the ONE point where it meets the cut ·
  3 that point named the focus · 4 the ring where the ball touches the CONE, and the plane
  through it · 5 the directrix drawn out of the two planes crossing · 6 the bridge: the cone
  steps back and the same two objects are handed to the drawing sheet

**The tangent-plane question, settled by measurement rather than by eye.** The brief for this
work asked that stage 4 always communicate ONE POINT OF CONTACT between the plane and the
sphere, and never a plane slicing through it. That is not what §6.2 defines, and it is not
geometrically possible: the tangent plane is the plane containing the circle in which the
sphere touches the CONE, so it passes through the sphere by construction. Measured on the
shipped `focalSphereFor()`: the distance from the sphere's centre to that plane is t·sin²α while
its radius is t·sinα — for a 30 × 30 cone at a 35° cut, 0.1895 against 0.4238 — and the circle
it cuts the sphere in has radius 0.3790, exactly the radius of the contact ring on the cone.
They coincide because they are the same circle. The two are equal only when sin α = 1, a
degenerate cone. **So the issue was neither a rendering fault nor a mathematical error, and
"one point of contact" would have been a new error.** The visualisation was fixed instead to
teach the true relationship: the ring is drawn heavy, depth-free and pulsing while its stage is
current, the ball is dimmed to half as the plane arrives, and the stage says in words that the
ball touches the cone *in a ring, not a point*. The single point of contact — sphere against
CUTTING plane — is stages 2 and 3, where it is genuinely one point and is marked with an
expanding pulse.

**Why:** the previous build revealed the same content on a timer. A learner could not stop it,
could not go back, and the pieces arrived while they were still reading about the last one — an
animation to watch rather than a proof to follow. It also raced ahead of the drawing sheet.

**Alternatives rejected:** *(a)* Keep the autoplay and add a pause — rejected: pausing a film is
not the same as choosing to advance. *(b)* Clip the sphere against the tangent plane so it looks
tangent — rejected: it would teach a false statement about the chapter's own definition. *(c)*
Move the sphere so the plane really is tangent to it — same objection, and the sphere would no
longer be the inscribed one that produces the focus.

**Consequences:** `conicState.proofStage` replaces the old `focalStage` + autoplay timer, and
`PROOF_STAGES` replaces `FOCAL_STAGES` + `LOCUS_STAGES`. Every stage declares the furthest the
SHEET may be revealed (`sheet`), so nothing reaches the paper before the cone has explained it —
which required the sheet's own reveal order to be swapped: the focus is now stage 1 of the locus
figure and the directrix stage 2, matching the order the solid derives them in. The apparatus is
held in `focalParts` and driven by `applyProofPhase()` from both the build and the frame loop, so
a rebuild mid-fade lands exactly where the fade had got to. Changing the KIND of section restarts
the proof rather than clamping it, through one guarded re-entry into `rebuild()`. A cut with no
inscribed sphere gets a two-stage honest answer, and a circle a five-stage one that ends on the
two parallel planes. `verify/proof.mjs` is the new oracle: it asserts that the step does NOT
advance on its own, that each stage shows only its own idea, that Back restores the scene, and it
screenshots every stage — because whether a figure reads as one point of contact is a judgement
no assertion can make.
**Status:** Active

## ADR-173: The tangent plane is drawn as an ANNULUS, and the one-point tangency is shown where it actually happens

**Date:** 2026-08-01
**Decision:** The Step-4 proof keeps its geometry exactly and changes only what is drawn.

- **The tangent plane becomes an annulus whose inner edge IS the contact circle**
  (`tangentPatchFor()`). Any quad drawn across that plane necessarily passes through the sphere —
  the plane meets the sphere in that very circle — so no amount of `renderOrder`, `depthWrite`,
  `polygonOffset` or blending can stop it reading as a slice. An annulus starting at the circle
  puts NOTHING inside the sphere's silhouette: the ball sits in the hole and rests on the rim all
  the way round, which is the relationship §6.2 is actually describing. Its outer radius is capped
  at 1.35 sphere-radii so it reads as a washer rather than as an infinite sheet.
- **The genuine one-point tangency is given the finite patch, a glowing marker and a caption.**
  The sphere IS tangent to the CUTTING plane, at exactly one point — the focus. That stage now
  hides the full-size cutting plane entirely and draws a small square of it centred on the point
  of contact, with a pulsing halo, a soft glow and the annotation "Touches here — one point only".
- **Both tangency stages quiet everything else**: the cone drops to 0.22, and so do the edge
  overlays, the section curve, the ghost of the removed material and the axis (`focalParts.scenery`,
  collected after the rest of the build). The focus marker itself stands down to 0.35 at the ring
  stage and its pill is withdrawn, so the ring is the only thing being pointed at.
- **The proof's camera is biased into the free part of the viewport**, because the drawing-sheet
  card floats over the top right from Step 4 on and a centred subject is a subject half under a
  card.

**Why:** the brief asked that the tangent plane be made to touch the sphere at exactly one point,
and reported the current rendering as communicating the wrong concept. The rendering was right and
the expectation was not, so the fix had to be found in the drawing rather than in the geometry —
and had to remove the misreading rather than argue with it.

**The verification, restated because it is the whole basis of this ADR.** For the plane containing
the sphere's circle of contact with the cone, the distance from the sphere's centre is t·sin²α
while the radius is t·sinα. On a 30 × 30 cone at a 35° cut: 0.1895 against 0.4238, and the circle
it cuts the sphere in has radius 0.3790 — exactly the contact ring. They are the same circle.
Equality would need sin α = 1, a flat disc rather than a cone. A plane placed tangent to the
sphere and perpendicular to the axis would meet the cutting plane at z = −1.3440 (lower pole) or
z = −0.1336 (upper), against the true directrix at z = −1.0095 — so "fixing" the geometry to
match the expectation would move the directrix and break PF ÷ PQ = e, the identity the whole topic
rests on.

**Alternatives rejected:** *(a)* Clip the sphere against the plane, or offset the plane along its
normal until it looks tangent — rejected: both teach a false statement about the chapter's own
definition, and the second silently moves the directrix. *(b)* Depth/blend tricks alone — tried
and insufficient in principle: the intersection is real, so any fully-drawn plane shows it.
*(c)* Drop the tangent plane and assert the directrix — rejected: the derivation IS the step.

**Consequences:** `tangentPatchFor()` joins the pure data layer, so the sizes are testable without
a browser, and `verify/conic-math.mjs` now asserts BOTH claims across four cuts — that the cutting
plane is tangent to the sphere to 1e-9, that the tangent plane meets it in exactly the contact
circle, and that the drawn annulus starts at that circle and stays finite. `verify/proof.mjs`
asserts the caption is present at the point it describes. The scenery dimming needs a parentage
test (`isDescendantOf`) because `traverse` gives none, and the proof's own parts must not be
dimmed as scenery.
**Status:** Active

## ADR-174: The two tangencies are two stages — sphere-to-cone is a CIRCLE, sphere-to-cut is a POINT

**Date:** 2026-08-01
**Decision:** Step 4's proof goes from six stages to seven, and the extra one exists to separate
two facts that were being shown together and read as one:

  1 the cutting plane · 2 the ball, wedged · **3 against the CONE: a whole ring** ·
  **4 against the CUT: one point, and it is the focus** · 5 the plane through that ring ·
  6 the directrix · 7 the bridge onto the paper

Stage 3 draws the ring alone, with the REASON it is a ring — a cone is the same all the way round
its axis, so a ball touching it at one place must touch at every place that far down — and no
focus marker on screen to compete with it. Stage 4 then draws the single point of contact with the
flat cut and names it the focus, opening with "Against the flat cut it is different", so the
contrast is the point of the stage rather than an inference the learner has to make. Stage 5 lays
the plane through the ring and says the quiet part out loud: **the name "tangent plane" is about
the CONE it touches, not the ball.**

The two are also separated by colour, which was already true and is now load-bearing: the ring is
the projection teal used for instruments, the focus is `--color-conic-mark`, the plum reserved for
the conic's own apparatus. Two relationships, two colours, two stages.

**Why:** the previous build put the ring and the tangent plane in the same stage, so the ring
arrived as part of "here is the tangent plane" and read as *where the plane touches the ball*.
That is the confusion the name invites, and a learner meeting it has no way to recover: they are
being told about a plane while looking at a circle that belongs to a different pair of objects.
Splitting the stages is the fix; no geometry changed.

**On the request that prompted it.** The brief asked for the tangent plane to be explained as
touching the sphere at exactly one point. It does not — it meets the sphere in the contact circle,
which is §6.2's own definition, and a plane placed tangent to the sphere would move the directrix
(z = −1.3440 or −0.1336 against the true −1.0095) and break PF ÷ PQ = e. The plane that DOES touch
the sphere at one point is the cutting plane, and that point is the focus. So the distinction the
brief asked for is delivered in full — two tangencies, two stages, the single point highlighted —
with each claim attached to the pair of objects it is actually true of.

**Consequences:** the stage count is no longer hard-coded anywhere that matters: the bridge is
`stages.length - 1`, and the circle's shorter proof ends at the stage carrying `sayFlat`, found by
search rather than by index — it had already been renumbered once and silently pointed at the
wrong stage. Three oracles asserted a six-stage walk and were updated. `verify/proof.mjs` now
asserts the separation directly: that stage 3 names the ring and shows NO point marker, that stage
4 names the point and withdraws the ring's pill, and that stage 5 states the name is about the
cone. On the sheet, the focus is drawn ringed as well as dotted and captioned "Focus F" — the
chapter's own letter — with "Vertex V" beside it, so the five things a learner must be able to
find (focus, directrix, axis, vertex, curve) are all named. `verify/conic-math.mjs` asserts that
set against the layout rather than the canvas, because the caption pass may legitimately drop one
it cannot place (§3.39).
**Status:** Active

## ADR-175: The three constructions course 1003 names are STAGED — one playback system, four constructions

**Date:** 2026-08-02
**Decision:** The official syllabus turned up (`1003.pdf`, *Diploma Curriculum Revision 2026*), and
Module II scopes Conic Sections to exactly three constructions, saying "only" twice:

> *"Ellipse – Rectangular Method & Concentric Circle Method only, Parabola- Tangent method only"*
> CO2 · Bloom's level **Understand** · 4 hours

All three were already present and mathematically verified. What none of them had was the thing
that makes a construction teachable — watching it happen. The one construction that DID have
staged playback was the focus-directrix method, which the syllabus does not require at all.

- **`buildStagesFor(method)`** returns the stage list of the construction currently selected, and
  `null` for the nine that draw whole. The playback, the Back/Next pair, the readout and
  `conicState.buildStage` are the SAME ones the focus-directrix construction already used: one
  playback system, four constructions. Each list is its own textbook example cut where a teacher
  would stop — seven stages each, from the axes to the joined curve.
- **Pause**, and `BUILD_DWELL` raised from 1300 ms to 2200 ms. The syllabus's assessment is a
  drawing paper; a learner copying the construction has to see each line go down.
- **Point numbering is bounded by the stage**, not by the construction-lines toggle: it appears
  with the divisions it labels and leaves when the curve is joined, so the finished drawing is
  clean. The bounds live in each BUILDER, because they are a property of the drawing and
  `conicEngine.js` imports nothing (CLAUDE.md).
- **A methodology card** — Method / Purpose / Instruments / Output, one line each — on all
  thirteen. The syllabus's own name for this subtopic is "Conic Sections — **Methodology** and
  terminology".
- **A syllabus badge** on every construction: *Required by the Diploma syllabus* on the three,
  *Beyond the Diploma syllabus* with its textbook reference on the other ten. **Nothing is
  hidden or removed** — a student revising for the ESE is simply told where to spend the evening.
- **An Engineering Terms panel**, built from the terms the CURRENT drawing actually contains, so
  it can never offer one this figure has not got. Hovering drives the same `sheetHover` the
  cursor drives; `drawHighlight()` is not duplicated.

**Why:** the previous two audits measured this topic against the TEXTBOOK chapter, which is far
wider than the syllabus. Against the syllabus the content was already complete; the gap was that
the three examinable constructions were the only ones with no teaching apparatus.

**Alternatives rejected:** *(a)* A separate "Engineering Drawing Mode" beside a "Concept Mode",
as the brief proposed — rejected and argued in `SYLLABUS-COMPLIANCE.md` §4: the six-step flow
already IS that separation (1–4 why, 5 how, 6 practice), and a parallel mode would duplicate
Step 5 and fork the drawing sheet's state, contradicting the brief's own first constraint.
*(b)* Staging all thirteen — rejected: nine are enrichment, and stages are teaching copy that has
to be written per construction, not generated. *(c)* Trimming the topic to the syllabus's three —
rejected outright; the enrichment is correct, verified and free to ignore.

**Consequences:** switching construction now lands on the FINISHED figure of the new one
(`next.buildStage = stages.length - 1`) — without that, a 7-stage construction inherited the
6-stage default and drew every line except the curve, which is exactly what happened the first
time it ran. The Engineering Terms panel highlights by CAPTION rather than by item reference,
because `drawCompare()` rebuilds the display list on every paint and the staleness guard that
keeps the cursor's hover honest would otherwise drop it silently. The panel also exposed a
terminology error it inherited: a bare `C` was explained as "the centre of the curve", which is
false in both ellipse constructions (it is a minor-axis end) and in the tangent method (the foot
of the abscissa) — `O` is the centre, and the tip now says so.
**Status:** Active

## ADR-176: The focus-directrix construction opens with ONE line, and the newest line is the bright one

**Date:** 2026-08-02
**Decision:** Three usability changes to Step 5, none of them mathematical.

- **The construction builds up one reference at a time.** It used to open on "The frame" — the
  axis, the directrix and the focus all drawn at once — which is the single hardest picture in
  the topic for a beginner to read, because nothing on it has been introduced. It is eight
  stages now: the centre line · the fixed line · the fixed point · where the curve starts · the
  measuring line · finding one point · the whole curve · tangent and normal. `frameItems()`
  gained a `reveal` argument so the three references arrive separately; the terminology sheet,
  which shares it, is unaffected by default.
- **Plain words.** "Divide FA in the ratio", "swing an arc from F equal to the scale height" and
  "produce it" are gone. "Split the gap between the line and the point in the given ratio",
  "Pick a spot along the axis. Draw a vertical line there, then swing an arc from F. Where they
  cross is one point on the curve." The maths oracle asserts the absence of the jargon that was
  there and caps each stage at three sentences and 160 characters.
- **The newest linework is drawn at full strength and everything before it at 0.42.** The
  builder records `freshFrom`, the index its current stage's linework starts at, and the single
  renderer dims what came before. It applies ONLY while a construction is being stepped: a
  finished drawing is never dimmed, and `freshFrom` is 0 when nothing is playing.
- **Textbook section references are out of the UI.** "§6.5.1 / §6.7.1 / §6.9.1" beside the badge
  told a first-year student nothing. `info.ref` stays in the catalogue for traceability.

**Why:** the drawing was correct and unreadable to its own audience. A construction that appears
whole cannot teach where its lines came from, and every line at equal weight gives the eye
nowhere to go.

**On the reported drawing-sheet bug:** the brief reported that closing the sheet made the chip
stop working until the learner left and re-entered the step. **It could not be reproduced** — on
all six steps, with real dispatched mouse events (not synthetic `.click()`, so hit-testing and
z-order applied), from both the compact and the expanded/split close paths, with no element
overlaying the chip and no exceptions. The sheet reopened every time, with content. Reading the
code did turn up something adjacent and real: `compare.show()` never repainted, so a reopen was
showing whatever bitmap was last painted, and it only stayed fresh because the resize path
happens to redraw. That is now explicit rather than incidental.

**Consequences:** `drawSheet` takes a `stepping` flag; without it the dimming would apply to
finished drawings and to the Problem Library. `BUILD_STAGES` went from six entries to eight, so
two oracles that asserted "5 of 6" were updated — the third time a hard-coded stage count has
needed changing, which §3.53 already warns about.
**Status:** Active

## ADR-177: Step 5 is a drawing workspace — the sheet takes the bench, and every method animates

**Date:** 2026-08-03
**Context:** An Engineering Graphics professor reviewed the shipped topic. The substance of the
feedback was that Step 5 still presents itself as a 3-D lesson with a drawing attached, when by
Step 5 the drawing IS the lesson.

**Decision:** Five changes, all inside Step 5.

- **The sheet becomes the primary pane.** A new `body.sheet-primary` grid puts the drawing on the
  left at ~67% of the bench and the cone on the right at ~33%, with the wizard keeping its own
  column. It re-parents the card exactly the way the workbench split does, and the two grids are
  mutually exclusive — expanding hands the bench to the workbench, and closing the sheet returns
  to the floating layout. Unlike the split it does NOT collapse the wizard: Step 5's dock is
  where the construction is chosen and stepped, so hiding it would take the step's controls.
- **The curve is chosen in Step 5.** Three buttons, wired to `commitConic`, landing on that
  curve's first SYLLABUS construction where it has one. Walking back to Step 3 and forward again
  to compare two constructions was never a thing the lesson intended to ask for.
- **The construction list is tiered, not trimmed.** `methodsByTier()` splits one curve's methods
  into "★ Required by the Diploma syllabus" and "Additional methods". Nothing is removed —
  a Diploma student needs to know which two to practise, and a B.Tech student or self-learner
  needs the other eleven to still be there. The list holds ONE curve at a time.
- **The methodology card answers the exam question.** Purpose, how it works, instruments, output,
  step count and whether it is examinable — the last of which is the reason a student is reading
  the card at all.
- **All thirteen constructions are staged.** Previously only the syllabus three animated and the
  other ten drew whole. Showing a learner who picked the four-centre method the concentric-circle
  animation tells them something false about what they drew, and drawing it in one flash tells
  them nothing. Each has its own stage list and its own gates in its own builder.

**Why not one generic animation:** the ten differ in procedure, not just in output. The offset
method's whole content is that the drop goes as the square of the division; the four-centre
method's is where the compass point moves to. A shared animation would have to drop exactly the
part each method exists to teach.

**Consequences:** the "beyond the syllabus" tier is now marked by its BADGE alone, since it is no
longer distinguishable by lacking playback — three oracle assertions encoded the old rule and
were updated. Division marks stay LABELS and never become dots: a construction dot on this sheet
means "a point of the curve" and the oracle proves every one lies on it. A staged builder must
never remove linework, which caught two constructions that dropped their numbered points when the
first pair of arcs was struck. `curvePts` is filled at every stage even when unhung, because the
analytic bbox that locks the sheet scale (ADR-053) must not shift as the construction plays.
**Status:** Active

## ADR-178: The concentric-circle construction numbers BOTH circles, and names its crossings

**Date:** 2026-08-03
**Context:** The professor's second review. The concentric-circle method divided both circles but
numbered only the outer one, and left the projected crossings anonymous.

**Decision:** Number both circles — `1…12` outside the outer, `1'…12'` outside the inner, at the
same radial positions — and name each crossing `P1…P12` on the stage that plots it.

**Why this is not decoration:** the method IS the correspondence. A point of the ellipse takes its
x from the outer circle and its y from the inner one, so *outer 4 and inner 4′ produce P4* is the
whole content of the construction. A drawing that numbers only the outer circle hides the very
relationship it exists to demonstrate, and the learner is left to infer that the inner circle has
matching divisions at all.

**Placement:** captions go along their own radius, `radialLabel()`, so each sits just outside the
circle it belongs to and never on the linework it names. Because captions are drawn left-aligned
from their offset, one on the left of a circle is pulled back by its own estimated width — the
layouts are pure data and never see a 2-D context, so the offset can only estimate, and
`drawLabels()` measures for real and nudges along its existing ladder when the guess crowds
something. No new collision machinery was added.

**Lifecycle:** the primed numbers live with the division numbering (the stages that divide,
project and cross), and the point names appear ONLY on the stage that plots them. The finished
drawing carries none of the three — a completed figure shows the curve, not the scaffolding, and
the oracle asserts all three are absent from the last stage.

**Consequences:** twelve more captions on the busiest stage, which is exactly the case
`drawLabels()`'s drop-rather-than-overlap rule exists for. The oracle now checks the CLAIM and not
just the count: that each k and k′ share one radius and sit on their own circles, that Pk is the
crossing of outer k with inner k′, and that every named point satisfies the ellipse.
**Status:** Active

## ADR-179: Step 5's dock is a hierarchy, and a control that does nothing is not shown

**Date:** 2026-08-03
**Context:** A third review. The headline report was that "problem mode breaks the construction" —
loading a problem and choosing the concentric-circle method made the drawing animation stop
appearing, and removing the problem fixed it.

**Root cause, and it was not problem mode.** Problems stamp nothing into the sim by design
(RULES.md §6.2): `loadProblem` only pins a statement and calls `sim.reset()`. Measured, the
construction ran correctly under a loaded problem for all thirteen methods. What was actually
wrong is that Step 5's dock had grown to **2140 px of content in a 588 px scroller**, and "Draw
it step by step" sat ~850 px below the fold. Loading a problem adds a statement header, which
pushed it a further 254 px down. The learner saw a panel with no playback control on it and
reasonably concluded the animation was gone. The regression was mine: ADR-177 added the curve
picker, the tiered method list and a seven-row methodology card above the playback.

**Decision:** fix it by ordering and by subtraction, not by adding a scrollbar hint.

- **Hierarchy.** Curve → construction method → that method's own givens → drawing controls →
  reference. The method select was five controls deep inside the playback group; it now leads its
  own group. The methodology card is reference prose read once, so it moved BELOW the controls
  that act.
- **No dead controls.** `controlsFor()` reports which of the shared controls a construction
  actually reads. The eccentricity and focus-directrix-distance sliders are the general
  construction's two givens and are inert beside the other twelve; seven of the thirteen never
  draw a tangent. Both sets are now absent rather than present-and-useless.
- **Say it once.** The step lead and the dock's hand-over note both explained why → how in
  different words.

Together these took the panel to **1952 px** and the playback control to **508 px down a 588 px
panel — visible without scrolling**, with a problem loaded or without.

**Also fixed, found while measuring:**
- Every curve opened on the general focus-directrix construction. Each curve now opens on the one
  it should — concentric circles, the tangent method, and (the hyperbola having no syllabus
  construction) the general one. The general method has no curve of its own, so `e` has to travel
  with the request or the curve is re-derived and snaps straight back.
- Reopening the sheet in Step 5 defaulted to the 50/50 workbench, which collapses the wizard and
  moves Step 5's controls into the rail — leaving no way to play the construction. It returns to
  the Step 5 workspace now.
- `.toggle`'s `display: flex` outranks the UA's `[hidden] { display: none }`, so hiding a toggle
  did nothing. Any component that sets `display` needs its own `[hidden]` rule.
- The pane-focus swap animates its column widths, and `remeasureAfterReflow` runs two frames in —
  while the transition is still moving. The canvas kept a mid-flight width until a
  `transitionend` re-measure was added.

**Presentation:** division numbering is set a size up and bold, because it carries the
correspondence a construction is built on; and the points a construction PLOTS are drawn in the
CURVE's own colour rather than the grey of the scaffolding that found them — these points are the
curve, and sharing its colour is what says so. The two viewing modes (Drawing-first, 3D-first)
are one grid at two column ratios, so the swap animates and neither pane is rebuilt; their
buttons sit above the viewer, where the panes are, rather than in the dock among the construction
controls.

**Consequences:** `shown()` in the oracles asserts a rendered height, which is what caught the
`[hidden]` specificity bug. The terms-highlight assertion now settles on agreement rather than a
fixed number of paints: the first paint of a sheet lays its captions out with metrics one frame
stale, so ~3% of its ink differs on that frame alone and never again.
**Status:** Active

## ADR-180: One viewport control — Compare — and a thumbnail minimizes rather than vanishes

**Date:** 2026-08-03
**Context:** A fourth review. Step 5's viewport had accumulated four floating controls (Open/Hide
drawing, Swap views, Reset view, and a Drawing/3D pair), and "Hide drawing" removed the sheet with
no obvious way to get it back.

**Decision:** one control, and no viewer that can disappear.

- **Compare replaces the lot.** A single button opens a compact two-item menu — Drawing · 3D —
  and picking one makes it the large viewer and the other the thumbnail. That subsumes the swap,
  so Swap views and Reset view are gone; Open/Hide is gone too, because choosing a viewer by name
  brings the sheet back if it was closed. The viewport's floating cluster now holds Compare and
  nothing else.
- **Minimize, not hide.** Each thumbnail head carries a minimize control beside expand and close.
  Minimizing collapses that pane's grid column to zero and puts a chip in its place NAMING the
  viewer it will bring back. The pane is never unmounted, and recovery never means leaving the
  step.
- **One design language across Step 4 and Step 5.** The 3D pane gained a head built from the same
  `.compare-card__head` rules the drawing card uses, so the two thumbnails are the same object to
  a learner rather than two different affordances.
- **Compare has one fixed home** — the top-left of the bench — instead of riding inside
  `#sim-viewport`, where it sat on top of the 3D thumbnail's own title bar whenever the drawing
  was the large viewer.

**Why the menu rather than two always-visible buttons:** the pair is one choice, not two actions,
and a radiogroup that shows which viewer is currently large says something a pair of buttons does
not. It also keeps the promise of item 7 — one control on the viewport.

**Consequences and two bugs this surfaced.** `.cone-first.thumb-min` also matches `.thumb-min`,
so the unscoped rule hid BOTH viewers and left the bench blank — the exact failure minimize exists
to prevent. It needed `:not(.cone-first)`. The oracle had not caught it because `shown()` tested
only for a rendered box, and a `visibility: hidden` element still reports one; `shown()` now
checks computed visibility too, and the minimize assertions demand that the large viewer and
Compare both survive. The cluster also needs `visibility: visible` to outlive its hidden ancestor,
since it lives inside `#sim-viewport`.
**Status:** Active

## ADR-181: The oblong method mirrors its fan, and carries its rays past the crossing

**Date:** 2026-08-03
**Context:** A fifth review, of the rectangular (oblong) ellipse. Two complaints, both about the
sequence and the drawing rather than the arithmetic.

**Decision:**

- **The mirrored fan is its own stage.** The construction drew the fan from C and then went
  straight to the connecting rays, so the lower half of the figure was never built — the learner
  was handed the symmetry instead of watching it happen. There is now a stage between them that
  reflects the fan into the lower half, and the figure is symmetrical before anything else is
  drawn. Eight stages instead of seven.
- **Each connecting ray is carried on past its crossing** as a thin dashed projection line across
  the opposite half. This is the substantive fix: `intersect()` works on INFINITE lines, so the
  crossing a ray makes lies beyond the axis division at which the drawn segment stopped. The line
  a learner could see genuinely did not reach the point it was said to produce.
- **Projection lines are lightened, not recoloured.** A new `projection` pen: the same
  construction grey at 0.75 px and half alpha. The sheet keeps ONE construction grey rather than
  gaining a second, and no colour token had to be invented for it.
- **Projection lines are clipped to the enclosing rectangle** (`exitBox`). Unbounded they would
  enlarge the analytic bbox that locks the sheet scale (ADR-053), and the figure would visibly
  shrink the moment the projections arrived.

**The bug this uncovered.** `ROLE_ORDER` — the renderer's draw order — did not list the new
`projection` role, so none of it reached the canvas. Nor did it list `plot`, added in ADR-179, so
the points the concentric-circle construction plots had not been painted since that pass either.
Both were invisible in a way nothing could catch: the display list was right, the pen table had
entries, and the oracles inspected layouts rather than pixels. A missing role now fails a test —
`PAINTED_ROLES` is exported and the oracle sweeps every mode, every method and every stage, and
asserts that each role a layout emits is one the renderer will paint.

**Consequences:** the oblong method's stage count changed, so an oracle assertion pinned to
"1 of 7" was generalised — the fourth time a hard-coded stage count has needed changing. The
mirrored crossings are asserted to be reflections of the fan's own lines and to satisfy the
ellipse, so the symmetry is checked as a claim rather than trusted.
**Status:** Active

## ADR-182: Step 5 IS Step 4, with the primary view swapped — the canvas box, not the pane

**Date:** 2026-08-03
**Context:** A sixth review, and a straightforward verdict: Step 5 had become a different
interface. ADR-177 gave it a three-column grid, which meant a second layout language for one
step, a Compare menu that replaced the interface rather than selecting a view, and a minimize
that collapsed a grid column.

**Decision:** delete the grid. Step 5 is Step 4's layout with the primary view swapped and
nothing else different. Step 4 is a full-bleed 3-D pane with the drawing floating over it,
top-right; Step 5 is a full-bleed drawing with the 3-D floating in the SAME rect. Measured at
1584×861: main 1124×805 at (0,0) and thumbnail 420×320 at (692,64) — identical in both steps,
and identical again after a swap and after a minimize/restore.

**The mechanism, and why the obvious version was wrong.** The first attempt shrank
`#sim-viewport` itself to the thumbnail rect. That takes it out of the flex row, so the step
panel slid left and the full-bleed drawing covered it — the panel vanished. The canvas and its
CSS2D overlay now live in a `#view-box` inside the pane, and it is the BOX that changes size:
the pane keeps its place in the flow, the drawing card stays parented to it and simply fills it,
and `handleResize` measures the box rather than the pane, so the renderer follows with no other
JS change. No re-parenting is needed at all, which also removed the `right`-inset workaround the
grid version required.

**Consequences.** Compare is a view selector: it opens a menu and swaps which view is main,
never replacing the interface. Minimize hides whichever view is floating and leaves a chip naming
it, and restoring returns it to the same rect. The `.view-head` rule was lost in the CSS
replacement and the thumbnail's title bar silently flowed below the canvas; and the drawing at
`--z-compare` covered the Compare cluster at z-index 4. Both were found by measuring the DOM
rather than by reading the screenshot, which is the lesson: a floating control over a pane whose
stacking context has changed needs its z-index restated, not assumed.
**Status:** Active

## ADR-183: Compare opens a menu; Switch view swaps. The main view is a panel, not a window

**Date:** 2026-08-03
**Context:** A seventh review. ADR-182 got the geometry right but left the chrome wrong: the
main view still wore the floating card's title bar with Minimize, Fullscreen and Close, and
Compare was doing two jobs — opening a menu AND being the only way to swap.

**Decision:**

- **The main view has no title bar and no window controls.** It is the panel; only the
  thumbnail is a window. The head is hidden by CSS rather than removed, because the same
  element is the thumbnail one step later and needs its controls back.
- **Compare and Switch view are separate actions.** Compare opens the menu and changes nothing;
  choosing an item swaps and closes the menu. Switch view swaps in one press with no menu. One
  button per job.
- **The thumbnail keeps Minimize and Close, and loses Fullscreen.** Expanding a card to a split
  said nothing that promoting it to the main panel does not say better, now that promoting it
  takes one press.
- **Nothing is a dead end.** Both Minimize and Close leave the restore chip, and the Compare
  menu can always promote either view.

**A consequence to be explicit about.** Fullscreen was the only UI entry point to the ADR-060
workbench split (`compare-split`), so that layout is now unreachable from the interface. Its code
is untouched — retiring it is an architecture decision, not a UI one, and belongs in its own ADR.
Its dedicated oracle section guarded a real regression (the rail starving the viewport to 2 px),
so rather than delete the coverage it was re-aimed at the layout that actually ships: no control
may collapse a pane or push the document into a scrollbar, asserted on the main/thumbnail pair in
both directions.

**Status:** Active

## ADR-184: Step 4 answers the second question — where the four NAMES come from

**Date:** 2026-08-03
**Context:** Step 4 explained why tilting the plane changes the curve, but never why the four
curves are called what they are. The answer is the eccentricity, and the topic already computes
the real one.

**Decision:** enrich Step 4; redesign nothing.

- **The four named cuts are offered here too**, built from `sim.sectionTour()` and pressed
  through `sim.tourCut()` — the same catalogue and the same call Step 3 uses, so there is no
  second implementation of the tour. Step 3 lists all six of §6.1's sections because its question
  is "what cuts are there"; Step 4 shows the four that have names to explain.
- **A live eccentricity badge**, beside the tilt slider that drives it. The value is the REAL one
  for the cut on the bench — `cutEccentricity()`, the chapter's own e = sin θ ÷ sin g (ADR-165) —
  never a number looked up from the curve's name.
- **A four-row reference card** (e = 0 · 0 < e < 1 · e = 1 · e > 1) with the row the cut is
  currently in highlighted, so the table reads as a live position rather than a list.
- **A sentence per curve**, replaced whenever the cut changes.

**Which of the four the badge names comes from `classifySection()`** — the same classifier the
rest of the topic reports with, and its own 0.5° tolerance — never from a threshold invented for
the badge. Comparing `e` against hand-picked bounds looked equivalent and was not: the tour's
named cuts land on whole-degree tilts, so the parabola preset sits at e = 0.996, and a local
threshold would have had the badge name one curve while the readout beside it named another.

**Consequences:** a rectangular hyperbola is shown as a hyperbola (it is one); the apex cut
reports no eccentricity rather than a number for a curve that does not exist. The oracle walks all
four cuts and demands the badge, the sentence, the highlighted row and the chip's pressed state
agree, and that the badge's number appears in the ratio the step already quotes — one claim in
four places, checked as one. Because the plane TWEENS to a named cut, those assertions wait for
ARRIVAL (the chip's pressed state) rather than for a fixed sleep; a first version compared values
mid-tween and read the curve the plane was passing through.
**Status:** Active

## ADR-185: Compare is a MODE — the two views side by side — and Switch view is Step 5's alone

**Date:** 2026-08-03
**Context:** ADR-183 made Compare a menu opener, and ADR-180 before it had removed the
side-by-side layout's entry point. That lost the thing Compare exists for: watching the cutting
plane drive the drawing, with both on screen at once.

**Decision:**

- **Compare enters a dedicated comparison mode** — the 3-D on the left, the drawing on the
  right, evenly split — and the button becomes **Back to 3D**, which returns to the lesson. This
  is the `compare-split` layout (ADR-060) restored to a first-class control rather than a
  fullscreen affordance on a card.
- **Compare Mode carries the two views and nothing else.** No lesson sidebar, no docked control
  rail, no rail toggle. `enterWorkbench` no longer moves the lesson's drivers into a rail
  beneath the panes: the point is to compare two pictures, not to keep working.
- **Leaving it changes only the layout.** Step, curve, construction, sliders, camera and drawing
  all continue — asserted, not assumed.
- **Switch view belongs to Step 5 alone.** Before Step 5 the lesson decides which view leads and
  a swap has nothing to teach, so the control is not there. It is synced from `setStage`,
  because a step change is exactly when which controls belong can change.
- **Choosing a curve in Step 5 aims the plane at that cut.** The 3-D beside the drawing is a
  REFERENCE; it was showing the previous curve's cut while the sheet drew a different one. This
  does NOT re-couple the sheet to the cut — from Step 5 the drawing keeps its own given
  dimensions (ADR-165) — it only points the reference at what is being drawn.

**On the thumbnail being "a static preview":** it never was. It is the live WebGL canvas in
`#view-box`, rendering every frame; measured mid-session it was a real `webgl` context at
418×318 with the rAF loop running. What was actually stale was the SCENE — nothing moved the
plane when the Step 5 curve changed — which is what the previous item fixes.

**Consequences:** three CSS rules were fighting over the rail's display; they are now one. The
rail toggle has nothing to toggle and is retired from the mode. Compare's own oracle section was
rewritten around the mode: it checks the two panes are side by side and even, that the sidebar
and rail are gone, that the label flips both ways, and that returning preserves the step and the
construction. (The "no rail" part of that is superseded by ADR-186, which puts a control strip
back deliberately.)
**Status:** Active

---

## ADR-186: Compare Mode builds its own layout, and carries the drivers that make it worth using

**Date:** 2026-08-03
**Context:** Two faults in ADR-185's Compare Mode. Entering it with the lesson's thumbnail
minimized opened it with no drawing at all; and with no controls in it, a learner could compare
two pictures but change nothing, which is most of the point.

**Decision:**

- **Compare Mode always builds both panes.** Whether the lesson's thumbnail was minimized,
  hidden or closed is a fact about the LESSON, not about this mode. Entering remembers that
  state, clears it, and hands it back on the way out — so the lesson is found exactly as it was
  left, and the comparison is never half-empty.
- **One centred control strip beneath both panes**, carrying the cone (width, height, second
  half) and the cut (cut, tilt, slide past the tip). Centred and spanning both columns, not down
  one side: the two pictures stay the subject, and one strip visibly serves both. Its layout,
  spacing and grouping rules are taken from the sibling topic
  `graphics_module_3_topic_2_development_of_surfaces`, which is the design reference.
- **The controls are MOVED, not rebuilt.** `enterWorkbench` re-parents the existing
  `[data-ctrl]` wrappers into the rail — same elements, same listeners, same state — and
  `driverHomes` remembers where each came from. There is no second copy of a slider to keep in
  step, so "both views update together" is structural rather than maintained.

**Consequences:** the `thumb-min` rules needed `:not(.compare-split)`, since a minimized
thumbnail is a lesson state that must not reach into this mode. The rail's `grid-area: rail` had
been deleted along with its other rules in ADR-185, so without it the strip auto-placed into the
left column and sat under one pane instead of both — the oracle now asserts it spans from the
3-D pane's left edge to the sheet's right edge, that it carries exactly the cone and the cut, and
that moving the tilt from inside the strip redraws the sheet.
**Status:** Active

## ADR-187: Compare Mode is driven by the TILT alone

**Date:** 2026-08-03
**Context:** Compare Mode's strip carried "slide it past the tip" beside the tilt. Which conic a
cut makes is decided by the tilt; sliding the plane along its own normal moves the same curve up
and down the cone without changing what it is. In a mode whose whole subject is how the tilt makes
the curve, it was one dial too many.

**Decision:** remove it from Compare Mode. It stays in the lesson, where Step 3 needs it to reach
the apex cut.

**The trap this opened, and the guard for it.** With the slide gone, a plane sitting ON the apex
is a dead end: measured, tilts of 0°, 30°, 62° and 80° all read *"Isosceles triangle — no curve at
all"*, and there is no longer a control to escape with. Step 3's own triangle chip parks the plane
exactly there. Entering Compare Mode therefore lifts the plane clear of the tip **when and only
when** it is on the apex — the one state change this mode may make, and only from a state its own
control cannot undo. The oracle sweeps the tilt and demands all four conics still appear.

**Two bugs found while making that guard work:**
- `commitSection()` rebuilds but does NOT fire the state-change bus, so the geometry moved while
  the slider and the readout beside it went on describing the old plane. The guard notifies.
- `tourCut()`'s tween was not cancellable, and every frame of it calls `rebuild()` — so under a
  slow renderer its 700 ms of tween time runs for seconds, long enough for a press to land
  mid-flight and be undone by the tween's own `onComplete`. The tour now keeps its handle: a
  second chip supersedes the first, and entering Compare Mode cancels a move still in flight.
  That race was always there; removing the slide is simply what made it visible.

**Consequences:** the oracle counts VISIBLE sliders, since a `display: none` field is still in
`querySelectorAll`. Its four-conic sweep asks for the parabola BY NAME — it is a single angle, the
cone's own generator, and a coarse sweep steps straight over it.
**Status:** Active

## ADR-188: The oblong method's rays stop at the point they produce, and arrive one at a time

**Date:** 2026-08-03
**Context:** A review of the rectangular (oblong) method against the standard classroom
demonstration. Five corrections, all to the sequence and the annotation — no geometry.

**Decision:**

- **Each connecting ray terminates at the crossing it makes**, and goes no further. ADR-181 had
  carried them on to the edge of the rectangle as dashed projection lines; drawn out, that was
  clutter. This is NOT a reversal of ADR-181's finding — the complaint there was that the ray
  stopped SHORT of the crossing, at the axis division, so it never reached the point it was said
  to produce. Ending exactly ON the crossing fixes that without the extension.
- **The rays arrive one division at a time**, the left half finished before the right begins —
  six ray stages where there was one. The construction is now thirteen stages.
- **Both halves carry the division numbering**, same text, same offsets, same styling. Only the
  upper half was numbered, which made a symmetrical figure look asymmetrical.
- **C and D are labelled.** The stage text names them ("join C to each numbered point") and the
  drawing did not.
- **The crossings use the concentric method's own marker** — role `plot`, the curve's colour at
  full size — rather than a thin grey construction dot. Same radius, same colour, same order,
  because it is literally the same role.

**Consequences:** `exitBox()` and the `projection` role are no longer used by any layout. The
helper is deleted; the role and its pen stay, and the role-coverage oracle's orphan check (ADR-181)
is what protects them if a construction starts emitting them again. The oracle now asserts each
ray's far end IS one of the crossings — not merely that it is short — that exactly two lines
arrive per stage, that stages 5–7 are the left half and 8–10 the right, and that the numbering is
balanced above and below the axis.
**Status:** Active

## ADR-189: A ray goes dashed where it crosses the centre line, and one half is mirrored on

**Date:** 2026-08-03
**Context:** Two more refinements to the oblong method after review.

**Decision:**

- **A connecting ray is solid only as far as the centre line.** The part carried on into the
  opposite half is a thin dashed projection line, breaking exactly ON the axis — which is the
  drawing convention for a line continued past the view it belongs to. This puts the
  `projection` role back into service: ADR-188 left it emitted by nothing, and the part of a ray
  beyond the axis is precisely what it was defined for.
- **Only the LEFT half is walked by hand.** Its three rays arrive one division at a time; the
  right half is then mirrored onto the drawing in a single step. Once the learner has built one
  half there is nothing new in repeating it press for press, and the construction drops from
  thirteen stages to eleven.

**Not done, and why:** the brief suggested fading the mirrored rays in from 0 % to 100 %. The
sheet is drawn by a pure function of the stage index with no per-item timeline, so a fade would
mean giving the 2-D renderer an animation clock it does not have — a change to the rendering
pipeline, which this pass was told not to touch. The mirrored half appears together in one step,
which is the requirement; the fade is the suggestion, and it was declined rather than faked.

**Consequences:** geometry is untouched — the same twelve crossings, each still satisfying the
ellipse to 1e-9, asserted before and after. The oracle checks the break is at y = 0 exactly on
both sides of it, that the dashed part carries a dash array and ends on its crossing, that stages
5–7 each add one division's two solid and two dashed segments and touch the left half only, and
that the single mirror step adds six of each and is the exact reflection of what was already
drawn.
**Status:** Active

## ADR-190: The tangent method is built from divisions, not points — and says so

**Date:** 2026-08-03
**Context:** Review of the parabola's tangent method. The controls described it as something it
is not, and its chords all arrived at once.

**Decision:**

- **Both names on each given.** "Double ordinate / base" and "Abscissa / axis": the chapter's
  term and the one a drawing office uses, on the same control and on the drawing itself.
- **"Points plotted" is replaced, for this method, by its own "No. of equal divisions"**
  (default 7, 4–12). The tangent method plots no points at all — the curve is the envelope its
  chords touch — so a control named for plotted points described the wrong idea. It is carried
  as the method's own `dim3`, which is the existing per-method mechanism: switching to the
  method applies its default, `syncMethodDims` labels and re-ranges it, and no other
  construction is touched.
- **The shared points slider appears only where a construction READS it.** Five methods fix
  their own division count — the oblong and parallelogram at the textbook's "say 4", the
  concentric at twelve, the offset at 4² — and for those the slider moved nothing. The oracle
  determines the list by BUILDING each construction at two different values and comparing, so it
  cannot drift from a hand-written list.
- **The chords arrive in two halves**, one stage each, the way the oblong method's rays do.
  Seven stages to eight.

**Consequences:** a unitless field needed the label and the aria-valuetext to stop assuming
millimetres. The double-ordinate dimension text was set outboard of AB, which is the right-hand
edge of the figure, and ran off the sheet — the analytic bbox that locks the scale measures
geometry, not captions (ADR-053), so a caption near an edge has to be placed inboard by hand. It
now is. Geometry is untouched: the oracle asserts the parabola is identical at 4 and at 12
divisions, to 1e-9 over every sampled point.
**Status:** Active

## ADR-191: The curve is TRACED on, and the oblong's rays arrive one line at a time

**Date:** 2026-08-03
**Context:** Two final requests. The oblong method still put two rays on the paper per press,
and every construction ended by switching its curve on all at once, which reads as a result
rather than as drawing.

**Decision:**

- **One ray per stage on the left half.** Six presses instead of three, so every line arrives on
  its own; the right half is still mirrored on in a single step. Fourteen stages.
- **The finished curve is traced on**, for every construction. `drawSheet` takes a `reveal`
  fraction; outline items are cut short along their own path by `partialOf()`, and `pathLength()`
  measures each so the reveal runs at ONE constant speed across a figure made of several pieces
  — which matters for the four-centre ellipse, whose curve is four separate arcs. A linear tween,
  1100 ms, no easing: easing here would distort the drawing rate, which is the one thing a
  drawing animation must keep honest.

**It fires on ARRIVAL at the last stage, not on display.** Reaching the end of a playback or
stepping onto the last stage traces the curve; switching method, opening the sheet, or loading a
problem shows a finished drawing finished. Anything that is not "one more stage of this
construction" cancels a trace in progress and shows the curve whole.

**Reversing a previous refusal.** ADR-189 declined a fade on the grounds that the sheet renders
from a pure stage function with no timeline. That was the right call for a fade — but the reveal
asked for here is not a fade: it is a geometric cut, `partialOf()` returning the SAME points up
to the one the pencil has reached, so the animation lives in one number passed to the renderer
and the layouts stay pure. The oracle checks it without a canvas: nothing drawn at 0, exactly
half the path length at 0.5 with every point still on the original path, the whole of it at 1 —
for all six curve shapes including the four-arc one.

**Consequences:** `layoutFor.__reveal` exposes the two helpers so the geometric property can be
asserted from the pure oracle rather than by sampling pixels. Measured in the browser, the
crimson pixel count climbs 257 → 341 → 1482 → 2732 → 3500 across the trace and then holds, with
every construction line, label and plotted point still on the sheet.
**Status:** Amended by ADR-192 — the oblong's left half now takes twelve presses rather than six,
and the trace fires on the stage that DRAWS the curve rather than on the last stage.

## ADR-192: The hyperbola is a section, not a construction; and the trace asks the layout

**Date:** 2026-08-04
**Context:** A review round with five items — three UI, two animation. The two that needed a
decision rather than an edit were the syllabus scope of the hyperbola, and why the tangent
method alone still popped its curve into existence after ADR-191 said none of them would.

**Decision:**

- **§6.9's three constructions are removed** — `hyperbola-foci`, `hyperbola-ordinate`,
  `hyperbola-asymptotes`, with their methodology cards, stage lists and layout functions.
  Course 1003 Module II teaches the hyperbola as a SECTION of the cone and never asks for it to
  be drawn with instruments. **The hyperbola itself is untouched**: it is still one of Step 3's
  six named cuts, still classified from the live cone by `classifySection()`, still carries its
  §6.8 vocabulary on the terms sheet, and the sheet still draws it from the focus-and-directrix
  definition whenever the plane makes one. What left is "how to construct a hyperbola", nothing
  else. This is narrower than ADR-177's "nothing is removed", which was about the tiers WITHIN a
  curve the module teaches; a curve the module does not ask to be constructed is a different
  question, and the honest answer to it is a shorter list rather than a longer one.
- **Step 6's hyperbola tier is off** (`ENABLED_TIERS` in `src/problems.js`). Three of exercises
  12–15 are answered with the constructions just removed, so dealing them would set a problem the
  dock cannot express. All fifteen exercises stay in `PROBLEMS` verbatim — this is the one-line
  lever that mechanism exists for, and putting `'hyperbola'` back restores all four.
- **The curve trace asks the LAYOUT which stage draws the curve**, instead of assuming it is the
  last one. That assumption held for twelve of the thirteen constructions and failed for the
  tangent method, whose envelope is drawn at stage 6 and whose focus and directrix are marked at
  stage 7 — so ADR-191's trace fired one stage late and the curve simply appeared, which is the
  inconsistency this round reported. `stageDrawsCurve()` compares two pure display lists and asks
  which stage first carries an `outline` item. No per-method table to fall out of step with one.
- **Every connecting line of the oblong's first half arrives on its own press** — twelve, four
  per division, each crossing marked as the second line of its pair lands rather than swept up
  on a later stage. The right half is still mirrored on whole. Seventeen stages.
- **One control on a thumbnail head.** Close is gone from both. It collapsed the same thumbnail
  to the same restore chip that Minimize does, so it was a second button for one outcome — and
  two window controls are what made a reference view read as a window to be managed.
- **No icon on the syllabus tier heading.** An `<optgroup>` label is already typographically
  distinct from its options; the star read as decoration on a control.

**Consequences:** `verify/conic-math.mjs` gains section 4q, which proves the removal is exactly
as wide as intended — no hyperbola construction in the catalogue, no card, no stage list, both
constructed curves intact, and a hyperbola arriving from the cut still drawn. Section 4p is now
driven off `METHODS` itself rather than a hand-kept list, so "EVERY construction ends with a
traced curve" is asked of every construction there is, and it asserts that the tangent method's
curve stage (6) is NOT its last (7) — a regression back to the last-stage rule cannot pass
quietly. Measured in the browser: the tangent method's curve climbs 9 → 287 → 606 → 874 → 1190
→ 1490 → 1544 px across the trace and holds; the oblong adds ~600–700 px on each of its twelve
first-half presses, then 7,700 at once for the mirrored half.
**Status:** Amended by ADR-193 — the oblong's twelve first-half presses became six, split across
the construction's two families rather than run as one long sequence.

## ADR-193: One pacing rule for every construction, and a stage list that can be sized

**Date:** 2026-08-04
**Context:** ADR-192 gave the oblong method seventeen presses and the review called it what it
was — thorough and repetitive. The same round reported that the tangent method still put its
chords down in two lumps, and that "Show its three properties" left the drawing broken.

**Decision:**

- **One pacing rule, stated once and applied everywhere: teach the part that must be understood
  one press at a time; mirror the part that is only its reflection in a single step.** The
  question each construction answers is *what is its unit of understanding, and what is its
  reflection* — and a construction with TWO symmetries gets the rule applied twice rather than
  once at the finest grain available. The oblong has two: the fan from C is upper/lower, the
  connecting lines are left/right. Three presses and a mirror for each is twelve stages, not
  seventeen, and no step in it is a repeat of the one before. The tangent method has one
  symmetry, about the axis: its first half of chords arrives one per press, its second whole.
- **A stage list may be a FUNCTION of the drawing.** `METHOD_PLAYBACK` entries are now a list or
  a function of the conic state, and `buildStagesFor(method, conic)` takes the state. Only the
  tangent method needs it, and it genuinely does: its chord count is on a slider from 4 to 12, so
  a fixed list either dead-presses at four divisions (three chords cannot be split into "three by
  hand, then the rest") or bunches them at twelve. `commitConic` clamps `buildStage` onto the new
  list when the slider shortens it.
- **The properties control is a TOGGLE.** It was a one-way door — `playParabolaProps()` only ever
  turned them on, and the sole way back was to nudge some other control, which is exactly why
  pressing it again looked like it had broken the drawing: nothing had put the sheet back.
  Pressing it now closes them, and `closeParabolaProps()` fires the state-change bus so the panel
  and the button come back with the sheet instead of trailing it. **It is a view toggle and
  nothing else**: `propsOpen` is the only field touched, so the construction, its stage, its
  dimensions and its tangent all return because none of them ever left.
- **Drafting legibility, without touching a single coordinate.** Captions now clear the PAPER
  behind themselves before being set — what a drawing office does with dimension text over
  hatching, and what keeps the oblong's numbering readable where it must cross the fan. Centre
  lines and the marked apparatus join the finished curve as things a caption is nudged off; the
  dense construction fan deliberately does not, because treating every thin line as blocking
  would drop most of the numbering, and that is what the halo is for. The nudge ladder gained the
  diagonals so the extra obstacles cost no captions. Division numbers keep their 1.2× bold and
  point letters gain 1.12× semibold, both INFERRED from the caption text so a construction added
  later cannot forget to ask.

**A latent defect this surfaced.** `dim3` is one field shared by every construction that takes a
third given, and it defaults to 70 — the parallelogram method's included ANGLE. The tangent
method read it unclamped, so a sheet built straight from the default state drew a sixty-nine-chord
construction carrying 138 numbers. It never reached a learner, because the dock rewrites `dim3`
on every method change, but a stage list sized from that number made it visible. Both modules now
clamp to the method's own slider range.

**Consequences:** `conicEngine.js` and `conicData.js` both state the tangent split rule, because
neither may import the other — both are pure leaves that import nothing (CLAUDE.md). The oracle
proves they agree at every division count from 4 to 12 by comparing the stage list against what
is actually DRAWN, which is a stronger check than a shared symbol. Measured in the browser: the
oblong adds ~1,360 inked px on each of its three fan presses then 4,086 for the mirrored fan, and
~1,180 on each of its three connection presses then 3,574 for the mirrored half. The properties
restore is asserted against a fresh independent render of the same construction — zero differing
pixels — rather than against a reading taken earlier in the session, which is hostage to the
first-paint label metrics that make any sheet's first render differ from its settled one.
**Status:** Active

## ADR-194: Every step draws its own sheet, and Step 6 borrows the cut rather than taking it

**Date:** 2026-08-04
**Context:** Step 6 asks the learner to name an unnamed cut, and the drawing sheet beside it was
showing the finished engineering construction left over from Step 5 — a solved drawing sitting
next to a question about a solid. `sheetMode()` said `stage >= 5`, so Step 5's mode simply ran on.

**Decision:**

- **`stage >= 5` becomes `stage === 5`.** The construction sheet belongs to the step that builds
  it. Steps 1–4 and Step 6 all show the live cut; only Step 5 shows the construction.
- **Step 6 DERIVES the cut without committing it.** `syncSheetToCut()` split into a pure
  `cutDerivedSheet(base)` and a `commitDerivedSheet(next)`. Steps 1–4 still commit, because there
  the cut IS the sheet's subject and the proof and the dock read it back. Step 6 calls only the
  derivation, on every paint, through `sheetSourceState()`.

  This is the whole design, and it is what the obvious fix would have got wrong: widening
  `sheetFollowsCut()` to include Step 6 would have written `e`, `curve` and `cutKind` into the
  sheet state, so a learner stepping 5 → 6 → 5 would find their construction dialled to whatever
  the quiz had just dealt. Deriving without committing keeps both steps whole. Measured: Step 5's
  sheet returns bit-identical after a round trip through Step 6 and six fresh deals.
- **The Step 6 sheet is repainted from `rebuild()`.** Nothing else would: the commit is what used
  to trigger the repaint, and Step 6 no longer commits. The plane moves under the learner there,
  so a thumbnail that did not follow would be showing a cut that is no longer on the bench.
- **The sheet may draw the cut but not NAME it.** Three of §6.1's six cuts are not plane conics
  and their sheets say what they are in words — "Circle · e = 0 · no directrix", "Isosceles
  triangle · not a curve". That is right in the taught half and hands over the answer in Step 6,
  where naming the section IS the question. Those captions are marked `naming`, and `drawSheet`'s
  `anonymous` option drops exactly them, keeping everything the drawing MEASURES — the radius,
  the base, the generator. The mark lifts once the learner commits, because by then the dock has
  said the name out loud anyway.

**Consequences:** no construction, layout or lesson logic changed — this is which state the sheet
is painted from, and one annotation gate. `verify/conic-math.mjs` gains section 4s, which proves
the naming captions are marked and that the plain-conic sheets have nothing to withhold, and
asserts on the source that the derivation and the commit stay separable — a merge back would be
silent and would cost Step 5 its state. `verify/interaction.mjs` walks 5 → 6 → 5 against a canvas
signature rather than a pixel count, since two different drawings can ink the same number of
pixels: Step 6 differs from Step 5, follows five distinct cuts across six deals, never falls back
to the construction, and Step 5 returns exactly as it was left.
**Status:** Active

## ADR-195: A construction opens on its given data, and the sheet gets a drafting vocabulary

**Date:** 2026-08-04
**Context:** Step 5 opened on the finished figure — the answer on the paper before the question —
so "Draw it step by step" appeared to start from the middle of a drawing that was already done.
The same review asked for better drafting quality across every construction.

**Decision:**

- **Every construction opens on its GIVEN DATA.** `setupStageFor(method)` names the stage each
  one starts at, applied on arriving at Step 5, on asking for a construction, and on Reset.
- **It is NOT uniformly stage 0, and that is the whole substance of the change.** What counts as
  "given" differs by method, and `SETUP_STAGE` is the one place that judgement is written down:
  the concentric method's two circles ARE its auxiliary circles and wait (0); the four-centre
  method starts swinging arcs at stage 1, so it waits too (0); the rectangle, oblong and
  parallelogram methods are handed their frame (1); the arc method is given both foci and the
  constant sum (1); the tangent method is given its base and abscissa and nothing else (0 — see
  ADR-196); the focus-directrix construction is given an axis, a directrix and a focus (2). Opening
  everything at stage 0 would have shown the oblong method a bare pair of axes and called it the
  given data of a rectangular construction.
- **Keyed on the REQUEST, not on whether the id changed.** Pressing "Ellipse" when the ellipse is
  already up, or re-picking the construction already selected, is a learner saying *start this
  one* — and the first version of this change, which only reset when `next.method !==
  conicState.method`, left the finished drawing sitting there in exactly that case.
- **Three weights of line, one dash vocabulary.** The pen table gains `AUXILIARY_ALPHA` so
  working lines sit a shade back from the given frame they are drawn inside: `axis` at full
  strength, `construction` at 0.82, `projection` at 0.5. Same ink throughout — this is line
  WEIGHT, the drafting variable, not a second palette. Six ad-hoc dash patterns had accumulated
  ([5,4] [6,4] [7,4] [8,4] [4,4] [3,3]), none meaning anything the others did not; there are now
  two, which is what BIS gives a drawing: the chain line for a centre line, `SHORT_DASH` for
  everything else.
- **Captions step off working lines when they can.** Placement runs the same nudge ladder twice —
  first wanting a spot clear of the construction fan as well, then settling for one clear of the
  linework that must never be covered. Dropping the caption instead would be worse on a figure
  like the oblong method, where the fan leaves almost no clear paper, and the paper halo from
  ADR-193 keeps it readable either way. Plotted points are drawn a size up from marks that merely
  locate things, since a plotted point IS the answer at that spot.

**Consequences:** the dock's invitation changes with the sheet — "The given data is set out, ready
to construct from" rather than "The finished construction is on the sheet". Several oracle
sections assumed a finished drawing on arrival and now draw it out first, which is what a learner
does; that is a change of setup, not of assertion. New section 4t proves no construction opens
with its curve drawn, none opens on a blank sheet, every setup stage is real and short of the
last, and the first press after it always adds linework — so an opening view cannot quietly eat a
construction step. The three openings the review named are checked against what is on the sheet:
the concentric method opens with no circles, the oblong with its rectangle and no numbering, the
tangent method with its base and axis and neither tangent. Measured: the oblong opens at 2,768
inked px and finishes at 10,105; the sheet carries seven distinct ink bands where the three
weights and the curve separate cleanly.
**Status:** Amended by ADR-196 — the tangent method's opening stage moved from 2 to 0.

## ADR-196: A triangle can look like a frame and still be the construction

**Date:** 2026-08-04
**Context:** ADR-195 opened the tangent method on stage 2, its two tangents joined, on the
reasoning that the triangle AEB is the frame the construction is built inside — the same reading
that gives the oblong method its rectangle. The review came back: that is an advanced stage of
the construction, and the method was the only one still not starting from its beginning.

**Decision:** `SETUP_STAGE['parabola-tangent']` moves from 2 to 0. Its givens are the double
ordinate and the abscissa. E is produced by stage 1 — the axis is *produced past the vertex* to
reach it — and the two tangents are joined at stage 2, so both are things the construction DOES,
not things it is handed.

**Why the first reading was wrong, since the distinction is the useful part.** A rectangle and a
triangle look equally like frames on the paper, and I let the drawn shape decide instead of
asking where each came from. The oblong's rectangle is struck from the two given axes and holds
no information that was not given; the tangent method's triangle needs a point that must first
be *found*. The test is not "does it enclose the figure" but "is every part of it given" — a
construction that has already found something has already started.

**Consequences:** ten stages become ten stages a learner actually walks. The oracle now asserts
the opening carries NEITHER tangent nor the point E, and does carry the base and the axis, so
the same mistake cannot be re-made quietly in either direction. Measured: the tangent method
opens at 1,775 inked px against 2,811 before, and the first three presses read "Produce the
axis", "The two tangents", "Divide them".
**Status:** Active

## ADR-197: The sheet is docked beside the solid in Steps 4 and 6, not floated over it

**Date:** 2026-08-04
**Context:** A design critique of the whole surface scored it 30/40 and named this as the biggest
opportunity. Steps 4 and 6 relate a solid to its drawing, and the drawing was a 420 × 320 card
absolutely positioned on the top-right quadrant of the box the camera had already framed the cone
into. Step 4's own copy says "Watch the cone" while the card covers the apex the focal sphere is
inscribed at. Step 6 asks the learner to read a cut the card is sitting on.

**Decision:** the viewport ALLOCATES space to both panes instead of letting one take it.
`body.sheet-docked` gives the sheet its own rect beside the solid's, using the same idiom
`body.drawing-main` already uses — two absolutely-positioned boxes, each with its own inset —
except the boxes sit beside each other rather than one over the other.

- **Scoped inside the viewport, not at the body.** Compare Mode's `body.compare-split` is the
  same relationship one level up, but it collapses the wizard, and a guided step that hides its
  own step card strands the learner (ADR-179). Docking inside `#sim-viewport` leaves the lesson
  column untouched, which is what made this the missing third layout rather than a reuse.
- **Structural at the breakpoints, per the product register.** Two columns at ≥1100px, stacked
  rows at 768–1099px, and **the float is deliberately kept below 768px**: docking there hands the
  solid a 44px sliver, which is worse than a partly-covered one. That width is already met with
  "Best experienced on desktop", and restructuring it properly belongs to the mobile pass.
- **Step 5 and Compare Mode are untouched.** Both keep their own layouts and neither is ever the
  docked pair.

**Two things the column exposed, both mine to fix.** The viewport's floating notes centred on the
whole bench, so the note reading "the same outline drawn on paper" ran underneath the paper it
named; docked, they centre on the solid's column and drop below the Compare cluster's row. And
captions hang SIDEWAYS further than they hang up and down — "Axis", "Directrix, DD", the dimension
strings — which a square-ish pane hides because height binds the scale first and leaves width to
spare. A tall narrow one does not, and "Axis" clipped at the pane edge on the first frame. The
horizontal margin now carries a few characters' worth of extra room; the vertical one is unchanged.

**Consequences:** the sheet gains a full-height column (781px against 320px), which raises its
px-per-mm, and captions on this sheet vanish below 1.3 of those. `verify/interaction.mjs` gains
section 7, which measures the overlapping AREA of the two panes rather than checking a rule — a
rule-based test would pass a layout that merely moved the float somewhere else. Measured: **0 px²
overlap** at 1440, 1024 and 900; minimize returns the column (541px → 964px); Step 5 and Compare
Mode still report their own layout classes.
**Status:** Superseded by ADR-202 (2026-08-05). The occlusion this fixed was real and the fix
worked, but the cost was a thumbnail that measured 420 × 320 on four steps and 403 × 876 on two,
and consistency of the chrome was judged the more important property by the product owner. The
docked mode, its `--sheet-col` / `--sheet-row` tokens and its `.vp-note` re-anchors were deleted
outright. Do not reinstate it; if the occlusion is to be addressed again, reframe the camera.

## ADR-198: One loud action per step, and no message outlives the step that raised it

**Date:** 2026-08-04
**Context:** The same critique's second P1. DESIGN.md §5.1 already commits to "Primary: Technical
Blue fill — the one loud action per step", so this was documented drift rather than a judgement
call: Step 4 carried two identical blue "Next" buttons a few hundred pixels apart, one walking a
stage of the proof and one leaving the step and abandoning it, and Step 6 stacked two full-width
primaries.

**Decision:**

- **The accent follows the step's actual action, and moves when that changes.** On Step 4 the
  proof stepper holds it while the proof is unwalked, because walking the proof IS the step;
  once the proof completes the loud action becomes moving on, and the accent goes to the wizard's
  Next. The finished proof button hands it back rather than sitting there as a disabled blue
  button beside a live one. Scoped to Step 4 — every other step has one Next and it stays primary.
- **On Step 6 the exercise keeps the accent and the library link drops to secondary.** It is loud
  only when it COMPLETES something: mid-problem "Complete & next problem" is the payoff and takes
  the accent back, but in free play "Pick a problem" is one of three routes to the same library
  (the card header and the body copy are the others), and three blue buttons on one panel means
  none of them is the primary. The base `.btn` was already the system's secondary treatment, so
  demoting is removing a class, not inventing a style.
- **A step change retires the message slots.** The flow note and the onboarding chip each hold for
  4.5 seconds, which outlives a learner pressing Next twice in three seconds — and the instruction
  they carry is then wrong for the step it lands in. Step 2's note says "Aim it, then tick Cut the
  cone"; on Step 3 that control is not on screen and the cone is already cut. Nothing is lost by
  retiring early: `markSeen` already fires when a spotlight is SHOWN, so a learner who moved on
  inside the hold had spent their one showing either way.

**A correction to the critique that produced this.** It reported the chip as persisting across
steps and the note as going stale. Both auto-dismiss after 4.5 s; what is true is narrower — they
are not retired BY a step change, so only a fast learner sees the previous step's instruction.
The fix is the same either way, but the defect is smaller than the critique implied.

- **Uppercase is for labels, not sentences.** `p#proof-stage` set 32 characters of "STAGE 1 OF 7 ·
  THE CUTTING PLANE" in capitals, and two dock group titles ran to 43 and 34 characters. The proof
  line is a counter AND a title, so only the counter keeps the label treatment; the stage name is
  set in sentence case beside it, and `textContent` is unchanged so the proof oracles still match
  on it. The long group titles were shortened to "Focus and directrix" and "Why the curve changes".
- **Cut content announces itself.** `.card__scroll` gained a paper-to-transparent fade riding the
  scroll port. Step 1's hint ended mid-sentence at the fold with nothing to say there was more,
  and the floating scrollbar pill only appears on hover. Pure paint, no layout.

**Consequences:** `verify/interaction.mjs` gains section 8, which counts VISIBLE, ENABLED primary
buttons per step rather than checking a particular button's class — a class check would pass a
second primary added somewhere else on the panel. Measured: one loud action on Step 4 before and
after the proof completes, one on Step 6, and the Step-2 note cleared on arrival at Step 3.
**Status:** Active

---

## ADR-199: Dimensioning teaches on five figures, and the figure is data

**Date:** 2026-08-04
**Context:** Experienced Engineering Graphics lecturers reviewed Module 1 Topic 1.1. Their finding
was not about the software: the topic taught every concept in the chapter on one object, the
Guide Plate — 200 × 100 × 30, stepped, with fourteen features. A beginner meeting their first
dimension there spends their attention reading the OBJECT rather than the DIMENSION. Their
recommendation was a progression of simple figures, and — separately — a visual side-by-side of
the two accepted dimensioning methods. Their explicit constraint was that the six-step structure,
the architecture and the graphics engine must not change.

**Decision:**

- **Five figures, and each step uses the simplest one that can teach its concept.**
  `dimensionData.js` exports a `FIGURES` catalogue: `plate` (a bare 130 × 80 × 20 rectangle) for
  Step 1's anatomy and space study; `hole` (+ ø30 and a far-face countersink) for Step 1's line
  legend and leader study and for all ten of Step 2's rules; `chamfer` (+ a 20 × 45° corner and
  ø24) for Step 3; `slot` (+ R15, two ø12 and a 16 × 40 slot) for Step 4; `guide` — the original
  Guide Plate — for Step 5 and the Step-6 review.
- **A figure enters by being SWAPPED INTO an existing step, never by adding one.** Six steps
  before, six steps after. This is the constraint that keeps the change pedagogical rather than
  structural, and it is why Step 1 alone swaps between two figures as its folds open.
- **The complex part is the destination, not the starting point.** Step 6 is untouched — the
  complete drawing with its twelve seeded faults — but the learner now arrives having practised
  each idea where nothing else competed for it.
- **A figure carries only what its step teaches, with one documented exception.** The holed plate
  keeps a countersink on its FAR face: Step 1's line legend must name a dashed line and Step 2's
  *measure from visible outlines* rule must argue against a hidden outline. Without it, neither
  has an example. Same reasoning that put the Guide Plate's countersink there in the first place.
- **The first four figures are the same 130 × 80 × 20 blank**, so Step 1's plain ↔ holed swap
  moves not one dimension on the sheet: the figure changes under the annotation, which is the
  teaching point.
- **The figure is DATA, not code.** `main.js` holds one `currentFigure` and one `setFigure(id)`
  that runs the ordinary path — `rebuild()` → resize → re-pose → re-caption — so a figure change
  is a geometry change like any other and still happens in exactly one place (RULES.md §3.1).
  `dimensionRig.js`, which was hardcoded to the Guide Plate's feature names, now loops over
  `figure.features` with a branch per kind. Nothing else in the pipeline moved: same solid
  construction, same winding convention, same authored-linework batches, same render order, same
  two-linework-systems switch of ADR-136.
- **`toWorld` stays ONE fixed mm→world map for every figure.** Two sheets of a comparison must be
  in the same space, so per-figure framing lives in `figure.frame` and touches the CAMERA only.
  `HALF_DEPTH` likewise stays a constant sheet plane while `halfDepthOf(figure)` gives each solid
  its own thickness — otherwise the dimension apparatus would step toward the viewer on a thinner
  figure.
- **Step 3 shows the two methods side by side, on the figure that can tell them apart.** The
  chamfered plate carries a horizontal, a vertical, a sloping and an angular dimension, and those
  are the only four cases aligned and unidirectional differ on. The existing compare component
  gains a third home (`compare-slot-3`) and draws the same plate twice, each sheet named, over a
  three-row table — across and up · sloping and angles · read from — whose cells are fragments
  rather than sentences because the panel is ~320 px wide.
- **The preferred method is named without the other being dismissed.** `METHOD_CHOICE.note` says
  this course draws aligned so that is the one to practise, that unidirectional is what typed and
  CAD drawings use and will be read plenty of, and that the forbidden thing is mixing them.
  `METHODS`/`METHOD_CHOICE` in `dimensionSteps.js` are the single source; `dimensionUI.js`'s
  duplicate `METHOD_COPY` was deleted, because two copies is how a control and its card start
  disagreeing.

**Consequences:** a new 18-assertion figure walk asserts the figure on every step and inside every
Step-1 study, and it passes with zero console errors and zero warnings; the lesson regression, the
device-pixel-ratio sweep, the control-vocabulary audit, the six-step layout table, the any-to-any
layout compare and both terminology suites all re-pass unchanged. A viewport badge names the live
figure and the concepts it carries, so a swap is never silent. The risk this decision accepts is
that six figures' worth of specs now have to stay visually consistent; they do so by construction,
being one rig, one renderer and one interaction set fed different data.
**Status:** Active

---

## ADR-200: On a phone the sheet is the other VIEW, not a window on this one

**Date:** 2026-08-05
**Context:** The third P1 of the same design critique that produced ADR-197 and ADR-198: *the sim
is unusable at phone width, not merely degraded.* Measured at 360 × 640 before this change: the
viewport took a fixed 42% slice (269 px), the drawing sheet floated as a 70%-height bottom sheet
over it (96,769 px² of overlap, the solid left an 81 px sliver), and what remained for the step
card gave `.card__scroll` a **99 px port** — about one line. Step 6's "Set up a cut", the only way
into the step, sat 130 px below the fold of that port. A second band failed at 768–1000 px, where
the wizard sits on its 340 px clamp floor and hands the card 193 px of content: `.card__nav` wants
261 px for Reset · Back · Next, so **Next was clipped off the card's right edge**. Separately the
"Best experienced on desktop" banner is `position: fixed` and painted over the top 66 px of a
287 px viewport — including the drawing sheet's own title bar and the Minimize button inside it.

The platform contract is explicit that the < 768 px notice **advises and never blocks**, so
"degrade to a message" was not available and would have been the wrong answer anyway.

**Decision:**

- **Below 768 px the sheet is not a window at all — it is the other view.** ADR-197 established
  that two subjects each get their own rect rather than one being parked on the other; a phone has
  no second rect to give, so the honest form of the same judgement is one pane at a time.
  `body.sheet-solo` (set by `syncSheetDock()`, the same one line of truth that sets
  `sheet-docked`) gives the drawing the whole viewport, and the pane behind it goes
  `visibility: hidden` — *covered* and *gone* are different things to a CSS2D label, which is a
  DOM node that would keep painting its leader over the drawing. The switch is the pair the
  learner already meets in Step 5: the sheet's own Minimize, and `#thumb-restore` in the corner
  cluster, which names what it brings back.
- **It opens minimized.** Step 4 swings the camera to face the cut and then opens the sheet; on a
  phone that would replace the solid the step just framed, before a word of the step has been
  read. So `setStage` minimizes it on arrival below 768 px and lets the learner choose. Above
  that width both panes are on screen and there is nothing to choose between.
- **A percentage was the wrong unit for the vertical split.** 42% of a screen shrinks with the
  screen, and the panel below it is where the lesson is read — its content does not. The slice
  became `clamp(190px, 34vh, 300px)`, and the chrome around the card (wizard padding, card
  padding, footer margins) was tightened to phone values. The step rail drops its labels and
  keeps its 44 px markers, because the step it is pointing at is already spelled out one line
  above it in the card's eyebrow; a second copy in 11 px type cost 26 px of the height the card
  needed. Measured after: **365 px of scroll port** at 390 × 844, and Step 6's action inside it.
- **The clipping bands are fixed by wrapping, not by taking width from the viewport.** Raising
  `--wizard-w`'s floor would have paid for the footer out of the 3-D pane, which at 768 px is
  already down to 428 px. `.card__nav` and `.card__eyebrow-row` wrap instead — the row falls to
  two lines and nothing is lost. Landscape is the one place height is scarcer than width, so
  there the 88 px `.btn--nav` floor is dropped and the footer fits on one line again.
- **A phone turned sideways is not a small tall phone.** Under 768 px wide AND 520 px tall the
  panes go back to being columns: stacking assumes height is the axis with room in it, and at
  667 × 375 it hands the solid a band and the card a slot. Same relationship as the desktop, at
  phone scale.
- **Touch targets are gated on the POINTER, not on a breakpoint.** Screen width does not tell you
  the input method: a touch laptop at 1440 px needs the 44 px floor and a phone with a stylus does
  not lose it at 360. `@media (pointer: coarse)` lifts the three treatments that paint below it —
  `.btn--ghost`, `.compare-chip`, `.field__num` — and pads the inline glossary terms, which sit in
  running prose and cannot take a 44 px box without opening holes in the paragraph.
- **The advisory banner reserves its own height.** An advisory that hides the control it is
  advising about is worse than no advisory. `main.js` measures the banner (its copy wraps to two
  lines at 320 px and one at 767 px, so the height is measured rather than assumed), sets
  `--notice-h`, and `body.notice-up` reserves it; Dismiss hands it straight back.
- **Safe areas are honoured where content meets an edge** — the wizard's bottom, which is the
  bottom-most thing on screen and sits under the home indicator, and the banner's three edges.

**What the critique got wrong.** It also reported that `prefers-reduced-motion` "does not govern
the Three.js tweens or canvas redraws". It does: `src/anim.js` checks it and lands a tween on its
final value immediately, and every camera swing and curve trace in `main.js` goes through that one
helper. Nothing was changed for it.

**Consequences:** `verify/interaction.mjs` gains section 9, which drives the emulated device
rather than reading the stylesheet — the failure it replaces was arithmetic, and a rule-based
check ("is there a mobile breakpoint?") passed the broken layout. It measures the four properties
a learner meets (room to read, the step's action in reach, one pane painted, targets a thumb can
hit), repeats them in landscape, and re-checks the 768 px band for clipping. It runs LAST because
it leaves the device metrics overridden. All five oracles pass; the desktop layout is byte-for-byte
unchanged in behaviour (nav still one row at 460 px, no new body class at boot).
**Status:** Active

---

## ADR-200: A comparison sheet is a (layout, method) PAIR, and the method is allowed to show nothing

**Date:** 2026-08-05
**Context:** Engineering Graphics lecturers asked that Step 4 of Module 1 Topic 1.1 teach the two
accepted dimensioning **methods** alongside the dimension **layouts** it already taught, as an
extension of the existing side-by-side comparison rather than as a new lesson — six steps, same
engine, same flow. The obvious reading is "add a second dropdown", and that part is easy. The hard
part is that the two methods are **identical on a horizontal dimension line**, and five of Step
4's six layouts measure only across the part.

**Decision:**

- **A comparison sheet is a (layout, method) pair.** Step 4 discloses one selector per axis for
  each sheet, in the same order both times, so the learner can hold one axis still and move the
  other. Method 1 · Aligned is the default and is marked Recommended.
- **The renderer was not touched.** `method` was already a per-draw option in `dimensionDraw.js`
  and a spec could already override it, so sheet B carrying its own method is
  `layerB.draw(specs, { ...opts, method })` and nothing else. No geometry, no sizes and no values
  differ between the two sheets — only the drafting convention the values are written under,
  which is exactly what the two methods are.
- **`compareKind` (`'method' | 'layout' | 'review' | null`) says which comparison is live.**
  Inferring it from `compareMethod !== null` cannot distinguish "Step 4, both sheets in Method 1"
  from "no comparison at all", and a Step-4 method change would then repaint the wrong sheet.
  Step 3's comparison SWAPS the two sheets when the method changes (the step chooses sheet B);
  Step 4's does not (the learner does).
- **The compare list holds EVERY layout, including the one on the drawing.** It used to exclude
  the current one, correctly, when a sheet was identified by its layout alone. Now "same layout,
  other method" is the pair that shows the two methods apart, so excluding it would make the new
  feature unaskable. The invariant moved from "the layouts differ" to "the PAIRS differ", enforced
  by `keepPairDistinct()`, which moves whichever axis the learner did **not** just touch — a
  deliberate choice is never overwritten under their hand.
- **The lesson says out loud where the method makes no difference.** Aligned and unidirectional
  both put a horizontal value above its line and read it from the bottom, so chain, parallel,
  combined, running-one-way and co-ordinates draw the same sheet either way; only *Running, both
  ways*, which has vertical dimension lines, shows them apart. `ARRANGEMENTS[i].showsMethod` is
  **derived from each layout's own specs**, never hand-declared — a hand-written list of "these
  five look the same" is a second source of truth that goes stale the first time a spec is edited.
  The card states that the two sheets are identical, why, and which layout to try instead.
- **Two things this deliberately does NOT do.** It does not add a vertical dimension to a layout
  that has none in order to make the comparison look busier — that would be inventing a dimension,
  and the honest version is the better lesson. And the compare still OPENS on a layout pair in one
  method, as it always did, because opening on a method pair would put two indistinguishable
  sheets on screen five times out of six, which reads as a broken feature.
- **The method control carries BOTH names** — `Method 1 · Aligned` — which is why it is a
  `.select` and not the `.seg` the control vocabulary would otherwise call for at two items:
  `Method 2 · Unidirectional` does not fit a half-width segment in a 320 px panel. The chapter
  numbers the methods and a lecturer asks for "Method 1" out loud; the number alone says nothing
  about what changes on the paper, and the word is what an exam answer must contain.

**Consequences:** a 26-assertion Step-4 walk passes with zero console errors and zero warnings,
and measures the claim rather than asserting the wiring: on Running-both-ways the three vertical
values turn under Method 1 and stay level under Method 2, while all four horizontal values are
written identically under both. The figure walk, the lesson regression, the control-vocabulary
audit, the six-step layout table, the any-to-any compare and both terminology suites re-pass; four
assertions in the compare suite were rewritten to the new pair invariant, which is the intended
change. One pre-existing defect surfaced and was fixed: the slotted plate's sheet caption printed
through the parallel layout's lowest dimension line (frame reach 106 → 122; 0 px² of overlap
measured afterwards).
**Status:** Active

---

## ADR-201: Docking is for the two steps that have two subjects, and the set has to be READ

**Date:** 2026-08-05
**Context:** Reported as a thumbnail-height regression: on Steps 1, 2, 3, 4 and 6 the drawing sheet
filled the viewport's height (403 × 876 at 1440 × 900) instead of staying the compact floating
panel Step 5 shows (420 × 320). Two separate things were tangled in that report.

ADR-197's decision text, and the docstring on `syncSheetDock()` itself, both say docking is for
**Step 4 and Step 6** — "the steps that show both and give neither the bench". The implementation
never looked at the stage:

```js
const docked = compareOpen && compareSize !== 'expanded' && !sheetPrimaryOn;
```

So it docked on Steps 1–3 as well. There the cone is the sole subject and the sheet is an optional
side-reference the learner opened themselves with the Compare chip; docking handed half the bench
to something nobody asked to be given equal billing. That half of the report is a straight
implementation bug against a written decision.

The other half is not a regression. Steps 4 and 6 dock by design, and that IS ADR-197 — the fix
for the design critique's P1, *"the sheet occludes the cone"*. Reverting them would have put the
sheet back on the top-right quadrant of the box the camera had framed the cone into, at the two
steps where the proof plays on the apex and the learner has to read a cut.

**Decision:**

- **`DOCK_STAGES = new Set([4, 6])` is the whole of the judgement, and `syncSheetDock()` reads it.**
  A rule that lives only in a docstring is not a rule. Steps 1–3 now float the sheet at exactly the
  box Step 5 gives its thumbnail — same width, same height, same anchor, same corner.
  *(Overtaken within the day: ADR-202 removed the docked mode entirely, so `DOCK_STAGES` no longer
  exists. The rule this ADR established — put the set in the condition, not the docstring — stands
  as RULES §3.65 and is what the next layout mode has to obey.)*
- **Steps 4 and 6 keep the docked column.** Confirmed with the reporter after the alternatives were
  laid out. ADR-197 stands unamended; this ADR corrects how it was applied, not what it decided.
  *(Reversed the same day — see ADR-202. The reporter came back asking for Steps 4 and 6 to match
  as well, which is their call to make and was made with the trade on the table.)*
- **One compact box serves every step that has one.** The only thing a step changes is what is
  drawn inside it — which is what the report asked for, and is now true for the five steps that
  have a thumbnail at all.

**Consequences:** `verify/interaction.mjs` section 7 gains three assertions that compare the sheet's
rect on Steps 1–3 against Step 5's thumbnail rect as an **equality**, not as "not docked" — the
claim is that one box serves them all, and a `!contains('sheet-docked')` check would pass a third
size introduced somewhere else. Step 5's thumbnail is located by area rather than by id, because
which pane is small there depends on whether the learner has pressed Switch view. Verified at
1920 × 1200, 1440 × 900, 1280 × 720 and 1100 × 800: Steps 1, 2, 3 and 5 agree to the pixel at every
one, and the box never exceeds its 420 × 320 cap, so resizing cannot stretch it.
**Status:** Active

---

## ADR-202: One thumbnail box for every step; the docked mode is deleted, not narrowed

**Date:** 2026-08-05
**Supersedes:** ADR-197
**Context:** Reported twice. ADR-201 fixed the first half — Steps 1–3 were docking when ADR-197's
own text scoped docking to Steps 4 and 6 — and the reporter was asked directly whether Steps 4 and
6 should keep the docked column, with the occlusion trade laid out. They chose to keep it, then
came back and asked for those two to match Step 5 as well. That is theirs to decide, and it was
decided with the cost visible, so it was implemented in full.

The brief proposed several root causes — a step-specific wrapper, a separate thumbnail component,
a different flex/grid parent, JS assigning a height. **None of those were present.** There is one
card element, `#compare-card`, and its rect came from one rule, `.compare-card[data-size="compact"]`.
Step 5 never sized it differently: `body.drawing-main` SWAPS which of the two panes is large and
which is the card, and leaves the card's own rules untouched. So "refactor Steps 4 and 6 to reuse
Step 5's component" had nothing to refactor — the component was always shared. Exactly one thing
overrode it, and that was `body.sheet-docked`.

**Decision:**

- **The docked mode is deleted, not scoped smaller.** Eleven `body.sheet-docked` rules across three
  media queries, the `--sheet-col` and `--sheet-row` tokens, the two `#view-box` re-rects, the
  shadow suppression and the four `.vp-note` / `.vp-hint` re-anchors that existed only to dodge a
  column — all gone. Narrowing the override or adding a third selector to defeat it would have left
  two sizing systems in the file, which is how this drifted in the first place.
- **`syncSheetDock()` keeps only `sheet-solo`.** That is not a second size: below 768px there is no
  room for a card and a solid at once, so the sheet becomes the other VIEW and the pane behind it
  stops painting (ADR-200). The function no longer reads the stage at all, because no step has a
  box of its own any more.
- **What this gives back is measured and printed, not asserted away.** On Steps 4 and 6 the card
  again sits over the box the camera framed the cone into. Section 7 prints that overlap as a
  `note` line on every run. A consistent thumbnail was chosen over it knowingly; the number stays
  on screen so the choice does not quietly become invisible.
- **If the occlusion is addressed later, reframe the CAMERA.** That is the other lever, it is
  per-step by nature, and it does not fork the chrome. Do not re-add a per-step sizing mode.

**Consequences:** section 7 is rewritten from "Steps 4 and 6 dock" to "every step's thumbnail is
the same rect as Step 5's" — an equality on the full rect (origin and size), because "stays
anchored in the same position" was half of what was asked and because `!contains('sheet-docked')`
would pass a third size introduced under another name. It additionally requires the body to carry
**no per-step sizing class** on Steps 1, 4 and 6, so a future mode cannot re-fork the box without
failing. Verified at 1920 × 1200, 1440 × 900 and 1100 × 800: all six steps agree to the pixel
(420 × 320, 420 × 320, 418 × 320 respectively), and the box is capped by
`min(420px, 38vw) × min(320px, 42vh)` so resizing can never stretch it.
**Status:** Active

---

*This log was assembled by reading ARCHITECTURE.md, the saved session-memory notes, both modules'
CHANGELOG and CLAUDE files, and the DESIGN docs. Where evidence was thin it says so. Add new ADRs
at the bottom using ADR-000.*

---

## ADR-203: A drawing gets a second look before it is inked, and only the annotation may move

**Status:** Accepted (2026-08-06)
**Context:** `graphics_module_1_topic_1_1_dimensioning`

### The problem

Dimensioning Topic 1.1's chamfered plate carried four annotations into a corner the chamfer had
left only 20 mm square. Measured on the running sheet, the 45° angular value and the 20 rise
value overlapped by 7.7 × 6.4 px; the angular arc crossed the inclined 28 dimension line; the
arc's 0° arrow head landed on the rise's projection line; and the inclined dimension line passed
0.14 mm from the point where the overall length's projection line began. Every one of those
drawings was technically correct — the right sizes between the right points — and none of them
was a drawing a draughtsman would sign.

The obvious fix, nudging the two labels apart, would have been worth nothing: the next spec
edited anywhere in the lesson could recreate the same problem somewhere else, and there was no
way to tell whether it had.

### The decision

**Every drawing is laid out twice.** `src/dimensionLayout.js` runs inside `draw()` before a
single stroke is emitted: it computes where every projection line, dimension line, arrow head,
arc, leader and value will actually fall, finds the pairs that are touching or closer than
3 mm, and moves the LOWER-PRIORITY one until they are not.

Four things make it a system rather than a heuristic:

1. **The clearance is derived, not invented.** §4.5 item 3 letters a value 3–4 mm high, so one
   letter-height — the chapter's own lower bound — is the smallest gap that still reads as two
   things rather than one smudge. The same number governs every pair of roles, which is what
   makes a sheet look drawn by one hand.
2. **Priority is by how much freedom each kind of annotation has.** A dimension on a sloping
   face can only lie parallel to that face (1); an angle must stay in its own corner but its arc
   may be any radius (2); a straight dimension can always move to the next lane out (3); a note
   on a leader can be re-routed to any clear paper (4).
3. **Only five knobs exist, and every one of them is a drafting freedom the chapter already
   grants**: a lane moves further out (§4.3 gives a minimum, not a maximum); a sloping offset
   grows or shrinks; an arc shrinks or its value moves further out (Fig. 4.11 fixes no radius);
   a leader lengthens or is re-aimed within 20° (§4.1 asks only for 30° or steeper); and, last,
   a value slides 6 mm along its own dimension line. `from`, `to`, `text`, `kind`, the
   termination style and the method are never touched — the drawing always states the same sizes
   measured between the same points.
4. **A nudge is kept only if the sheet as a whole gets less crowded.** The objective is the
   sorted list of shortfalls, compared lexicographically — worst contact first, then the next.
   That is why the pass cannot cure one clash by causing another, and why it terminates.

### What is NOT a collision

Five contacts are lawful and are subtracted before anything is measured. Getting this list wrong
is the failure mode that gives automatic layout its bad name — the first working version of this
pass "fixed" chain dimensioning by pulling its shared projection line apart.

- anything belonging to the same spec (a value sits 1 mm off its own line on purpose);
- two dimensions sharing a limit **in the same row** — a chain's arrow heads meet nose to nose
  on one projection line (Fig. 4.15), and superimposed running draws every dimension line on
  top of the last (Fig. 4.17);
- two strokes drawn along the same line — one line drawn twice is still one line, which is also
  §4.6's own permission to run an edge or a centre line out as a projection line;
- **a projection line crossing another projection line or a dimension line.** Every stacked
  arrangement in §4.3 does this, four rows deep in Fig. 4.16. Holding those apart would forbid
  parallel dimensioning outright;
- the first 6 mm of a leader — its landing — which exists to touch something.

Two VALUES are exempt from none of it. A number touching another number is unreadable however
lawful the lines beneath it are.

### A drawing that is meant to be wrong stays wrong

Step 2's ten broken rules and Step 6's twelve seeded faults take **no part** in the pass —
neither moved nor avoided. They are excluded by `tone: 'bad'`/`'good'`, by carrying a fault knob
(`extShort`, `extSkew`, `textNudgeMm`), or by `pinned`, which `faultyDrawing()` stamps on every
merged fault. Without that, the mistake hunt would tidy itself away in front of the learner and
the hotspots would point at nothing.

### Consequences

- `SPACING`, `TERMINATION`, the vector helpers, `linearEnds()` and `textPlacement()` moved out of
  `dimensionDraw.js` into `dimensionLayout.js`, which re-exports them. The pass has to reason
  about the same proportions the renderer strokes with, and two copies of Fig. 4.6 would be one
  copy too many.
- The pass is memoised on a signature of the layout-relevant spec fields, so it runs once per
  change rather than once per animation frame, and it stands down entirely when a spec carries
  `only` (Step 1 draws one element of a dimension at a time; half a dimension's boxes are not
  the dimension's boxes).
- **It is not a substitute for deciding which side of the part a dimension lives on.** The pass
  found, and could not fix, the chamfered plate's real problem: an overall length measured from
  BELOW must spring its right-hand projection line from a point in the empty air the chamfer
  removed, straight through the one place the inclined dimension has to pass. Moving that
  dimension above the part was a human decision; the pass's job was to prove it necessary and
  then to guarantee everything else.
- The pass knows about annotations only. Clearance from the part's own OUTLINE is still a hand
  judgement, because the brief this implements — and the chapter — talk about annotations
  crowding each other.
- `verify/clearance.mjs` audits all 27 drawings in Node with no browser. Every one comes out
  clear except the Guide Plate, which carries a declared budget of 5 residual contacts, down
  from 20. **The budget is a ratchet: lower it, never raise it.**

### Alternatives rejected

- **Nudge the two labels apart.** Fixes one sheet, proves nothing, and goes stale on the next
  spec edit.
- **Test every pair of strokes.** Flags every stacked arrangement in the chapter as a fault.
- **Let the pass move anything to anywhere.** Rejected in favour of five named knobs, each of
  which is a freedom the chapter grants, so no output of the pass can be un-draughtsmanlike.
- **Accept only nudges that create no new tight pair.** Too strict — it made zero moves, because
  clearing a 0 mm overlap usually passes through a 2.9 mm near-miss.

---

## ADR-204: A topic that teaches the DRAWING authors its linework; only the 3-D solid is generated

**Date:** 2026-08-06
**Decision:** In `graphics_module_2_topic_0_introduction_to_orthographic_projection`, each of the
four textbook parts declares BOTH a 3-D part list (extruded profiles and one lathe, from which
`objectRig.js` builds a real manifold solid) AND its three orthographic views as **authored,
layer-tagged 2-D linework** in millimetres. The views are not computed from the mesh.
**Why:** The subject is the finished drawing, and a finished drawing is a set of *decisions* as
much as a set of edges. Deriving it live would require a correct hidden-line pass, correct centre
lines for every circular and symmetrical feature, and correct trimming where a boss stands proud
of the plate it sits on — on non-convex machined parts with blind bores and obround slots. The
platform has hit this before and answered it the same way: `graphics_module_1_topic_1_1_dimensioning`
reuses `meshAnalyzer` + `lineDrawer` for LIVE camera-dependent classification of the 3-D part while
its front elevation keeps **authored** linework (ADR-136). Authored linework is also the only form
in which the textbook's own figure can be transcribed, which is what the syllabus asks the learner
to reproduce. The two halves cannot drift apart unnoticed: both are declared in one object, in the
same millimetres, and the frames that relate them are stated once at the top of the file.
**Alternatives rejected:**
- *Project the mesh live (Module 2's `projectionDrawer` route).* It is the right engine for the
  five generated solids, whose convex `worldNormal` shortcut decides visibility. These parts are
  not convex, so it would need Foundations' per-edge occlusion raycaster and `three-mesh-bvh` —
  a second pinned dependency and a whole hidden-line subsystem — to produce a drawing that would
  STILL have no centre lines and no dimensions, because those are not properties of a mesh.
- *Author the views only, and fake the 3-D with a pictorial image.* Step 1's whole claim is that
  the learner may turn the real object and look along any direction. A picture cannot be turned.
- *Derive the views from the part list analytically.* Tempting, and correct for a view taken along
  an extrusion axis. Across the axis it needs occlusion reasoning between separate parts (which of
  two lugs is in front, whether a base's top face is concealed), which is the same problem again
  with a worse failure mode: a plausible wrong drawing with no figure to check it against.
**Consequences:** Adding a fifth part is one object appended to `OBJECTS` — but that object has to
carry its three views, and whoever writes them must read the frame note first. The oracle asserts
the LAYOUT rather than the linework, so a mis-authored internal edge is caught by looking, not by
`node verify/`. That is the honest boundary of this decision and is stated in the topic's CLAUDE.md.
**Status:** Active

---

## ADR-205: A view button lands in a real orthographic projection, not a perspective picture of one

**Date:** 2026-08-06
**Decision:** The four principal directions in Topic 0 render through an **orthographic** camera,
reached from the free-orbit perspective camera by the platform's `projectionMorphK` matrix morph
(RULES.md §5.18) on the same tween as the camera flight. Grabbing the object while it is square-on
gives the depth back over 340 ms of the drag. Framing is a projected-BOX fit, not a bounding-sphere
one.
**Why:** A perspective view of the Cylindrical Block from the front draws the top of its ⌀50 boss as
an ellipse, its near edges longer than its far ones, and no true size anywhere. Those are not
cosmetic differences — they are the definition of what an orthographic view is not. A topic whose
first step says "this is the elevation" and then shows a perspective picture has taught the
opposite of its own sentence, and it does it in the one place a beginner has no way to detect the
error. §5.18's SCOPE note already anticipated a topic like this: it binds a topic that HAS both
cameras, and the reason to have both here is that free orbit genuinely wants perspective while every
named direction genuinely wants none.
The sphere→box change is a separate necessity that only showed up once the views were flat: a
sphere's radius is the box half-DIAGONAL, so the 83 × 44 × 37 bearing block was framed for 51 mm
when its right side view is 22 mm across, and the part sat in the middle of its own view as a speck.
Each principal direction sees exactly two of the three half-extents, so the pair is simply picked
per direction; the pictorial pose keeps the sphere, because a part turned at an angle really can
throw a corner out to its half-diagonal.
**Alternatives rejected:**
- *A single orthographic camera throughout* (the `graphics_module_1_topic_1_1_dimensioning` route,
  §5.18's carve-out). That topic's subject is a measured drawing and it never orbits freely. Here
  Step 1 is free orbit, and orthographic free orbit of a machine part reads as a confusing flat
  jumble — the depth cue is what makes the object legible before the drawing exists.
- *Hard-swap the two cameras at the end of the flight.* Explicitly forbidden by §5.18, and for a
  good reason: off-plane geometry pops into depth in one frame.
- *A very long lens (fov ≈ 5°) as a cheap fake.* It reduces the error without removing it, and the
  camera then sits so far back that the near/far clipping and the orbit feel both degrade. "Almost
  orthographic" is the wrong answer to "is this an orthographic view?".
**Consequences:** `OrbitControls.object` is swapped between the two cameras, so anything reading
`camera` directly for a screen-space calculation would be wrong — the rig exposes `activeCamera()`
and main.js renders with that. The morph must be stamped LAST each frame, after `controls.update()`.
**Status:** Active

---

## ADR-206: The projectors fade; the datum does not — and the stage list is derived from the linework

**Date:** 2026-08-06
**Decision:** Step 2's reveal is a list of stages **derived** from the layers each view actually
carries, not a fixed four-per-view table. Construction lines animate on and then fade — to a ghost
once the view they carried is inked, out altogether once the sheet is dimensioned — but the XY
ground line, its X/Y end marks and the VP/HP tags are exempt, in their own subgroup inside the same
stage. Forward animates and is disabled while a stage is drawing; Back lands instantly, never
replays, and never moves the camera.
**Why:** Three separate things, each learned the hard way here.
*Derived, not tabulated:* the Stepped Block has no circular feature anywhere and hidden detail in
one view only, so it has 8 stages where the Bearing Block has 13. A fixed table would have given it
five stages that draw nothing and say nothing, which is the pacing failure ADR-193 already
recorded — and one wrong entry in such a table is invisible until someone watches that one object.
Asking the layout which layers a view carries needs no table to keep in step (RULES.md §3.52).
*The datum is not a projector:* the XY line is where the HP meets the VP. It is what the plan is
measured below and the elevation above, and it stays on a finished sheet. It was inside the
projector group and faded out with them, leaving a first-angle drawing with nothing to be
first-angle about. A group opacity cannot be undone by a child, so the fix is which group the datum
is IN, not a stronger rule on top of it.
*Back does not replay:* a learner presses Back because they missed something. Replaying the
animation shows them the same thing at the same speed and makes them wait for it (RULES.md §3.49).
**Alternatives rejected:**
- *Delete the projectors once the view is inked.* They are the visible proof that the three views
  are three records of one object; a learner stepping Back has to be able to find them again.
- *Fade them the moment the next view starts.* The projectors for the plan are still the reason the
  plan is where it is while the plan is being drawn. Tying the fade to "the view this group serves
  now has its own outline" is the statement that is actually true.
- *One press per line.* Seventeen presses that mostly say nothing new — ADR-193's finding, applied
  before repeating it.
**Consequences:** Nothing may index into the stage list by number; main.js asks a stage which view
it belongs to and turns the solid to match. The oracle asserts the derivation directly (8 stages for
the block, more for the bearing block) rather than a magic total.
**Status:** Active

---

## ADR-207: The Front arrow takes the guidance accent — the one named exception to Chrome-Only Blue

**Date:** 2026-08-06
**Decision:** `graphics_module_2_topic_0_introduction_to_orthographic_projection` draws the textbook's
`F` mark — an arrow at the front of every object, labelled "Front" — in `--color-accent`, inside the
viewport. It is bound to a single token role (`guide` in `tokens.js`) with exactly one consumer, and
it is hidden and restored by the topic's "Dimensions & Labels" switch along with every other
annotation.
**Why:** Every worked figure in Chapter 19 carries this arrow, and it is what makes "the front view"
a fact about the drawing rather than a guess — without it the learner has to infer which face the
draughtsman called the front, which is precisely the thing the whole topic is built on. So the mark
has to be there and has to be unmissable.
RULES.md §4.5 (Chrome-Only Blue) says blue never appears as a domain colour inside the viewport. The
arrow is not a domain colour: it carries no engineering meaning, it is not part of the object, and
it is not one of the HP/VP/PP encodings. It is an INSTRUCTION about where the learner should stand —
the same category as the accent-tinted `.vp-hint` and `.vp-spotlight` chips that already float in
every viewport on this platform. §4.5's actual purpose is that a learner can tell "the UI is guiding
me" from "this is the domain content" even on a washed-out projector; drawing the arrow in accent
serves that distinction rather than breaking it, and drawing it in ink would defeat it by making the
arrow read as a feature of the part.
**Alternatives rejected:**
- *Ink, like the rest of the linework.* It then reads as an edge of the object — a spike sticking out
  of the front face. Exactly the misreading the mark exists to prevent.
- *Bench grey, the construction colour.* Construction grey means "a working line, about to be
  rubbed out". The Front arrow is the opposite: it is the one mark on screen that is never part of
  the drawing and never goes away while the object is being studied.
- *A fourth domain encoding of its own (a new token).* It is not domain content, so a domain token
  would be a lie about what it is, and it would put a fifth saturated hue in a palette that is
  deliberately rationed to two jobs (DESIGN.md §2).
**Consequences:** The exception is bound to a token ROLE with one consumer, so a second use of
`guide` inside the viewport is a visible edit rather than a slow drift. If a future topic wants the
same mark, it takes this role; if it wants accent for anything else, that needs its own ADR.
**Status:** Active

---

## ADR-208: Topic 0's sheet is blank paper, and the learner picks which side view it carries

**Date:** 2026-08-06
**Decision:** Two changes to Step 2, taken together. The sheet draws the object and nothing else —
no XY ground line, no HP/VP tags, no quadrant or plane apparatus — although the XY ordinate still
exists in the layout maths as the datum every view is placed against. And before construction the
learner chooses **Right side view** or **Left side view**; the drawing carries that one only,
obtained by mirroring the authored side linework in its own local x.
**Why:** *The blank sheet:* Topic 0 is the first thing a student meets in Module 2. Its job is
"here is what a multiview drawing looks like and how it is built up". HP, VP, XY and the four
quadrants are a different lesson — the one that DERIVES first angle from two hinged planes, which is
`graphics_module_1_topic_2_spatial_framework`'s subject and Module 2's own fold. Putting that
apparatus on a beginner's first drawing asks them to learn two things at once, and the one they came
for is the one that loses. The topic still TEACHES first angle; it teaches it as the observable
consequence (the plan goes below, each side view crosses over) rather than as an explanation
involving planes the learner has not met.
*The side-view choice:* a real drawing carries one side view, not both, and which one is a decision
the draughtsman makes. Drawing whichever side the textbook figure happened to use taught that the
choice does not exist. Making it the learner's choice, with the placement stated next to each option
("drawn on the left" / "drawn on the right"), turns the crossover from a sentence they must trust
into something they can operate and watch happen — twice, in both directions, on the same object.
**Alternatives rejected:**
- *Keep the XY line, drop only the tags.* The line without the two planes it is the intersection of
  is a horizontal rule with a two-letter name and no meaning. Worse than either extreme.
- *Draw both side views.* Not what a drawing does, and it removes the choice that makes the
  crossover memorable.
- *Author a second set of side linework per object.* Duplicate data that could disagree with itself.
  The two side frames differ by exactly a sign in local x, so the mirror is the honest transform —
  including on the dimensions, whose offset normal mirrors with them (`off` flips, or the value
  lands inside the material).
**Consequences:** `layout()` takes `{ sideView }` and the topic's state — not the data — owns which
side is live, so a rebuild cannot silently revert the learner's choice. Changing it rewinds the
reveal to blank paper, because it changes the derived stage list and a half-drawn sheet would be
indexing into a list that no longer describes it. The oracle asserts the ABSENCE of XY/HP/VP
lettering by name; "looks clean" is not a check.

**Amended 2026-08-06 (d).** `layout()` originally took `showDims` alongside `sideView`, so the
dimension switch rebuilt the stage list too. That was wrong, and wrong in a way that inverted the
control: turning dimensions ON rewound the drawing to blank paper, so the learner pressed "show me
the sizes" and watched the whole drawing vanish. The side-view choice changes what the drawing IS
and must rewind; the dimension switch changes only what is VISIBLE and must not cost the learner
their place. Dimensions are now always built and toggled by `setDimensions()`, a class on the
sheet's mount — which is also what makes a second entry point for it (the viewport chip) safe. The
rest of this ADR stands.
**Status:** Active (amended 2026-08-06)

---

## ADR-209: The sizes go on the SOLID, from the sheet's own data, one view at a time

**Date:** 2026-08-06
**Decision:** `graphics_module_2_topic_0_introduction_to_orthographic_projection` gains a third
renderer, `src/dimensions3d.js`, which draws BIS Type-B dimensions on the 3-D object in Step 1. It
reads the SAME `objectData.dims` entries the SVG sheet draws, lifts each 2-D view frame onto the
corresponding face of the solid, and shows only the set belonging to the direction the camera is
currently at. The shared BIS geometry moves into `objectData.js` as `DIM_STYLE`. The Front arrow is
gated to the front view.
**Why:** Step 1 asks a learner to look at a machine part; the textbook prints that part with its
sizes on it. Without them there is no way to check that the thing being orbited is the thing in the
book - the one question a modelled object has to be able to answer - and Step 2's sheet, which does
carry every size, is a step the learner has not reached.
Three sub-decisions carry the weight:
- **Reuse the DATA, not the code.** Every dimension is the same registry entry the sheet draws, so
  there is one dimension set per object and the sheet's proven non-overlapping lane layout comes
  along unchanged. Copying the benchmark's `dimensionDraw.js` would have been ~950 lines of a
  second renderer bound to a different topic's data model - a drift surface with no upside
  (RULES.md 1.3, 1.16).
- **One view at a time.** All forty-three at once buries the solid. The set whose plane faces the
  learner is also the set that reads square rather than foreshortened, so "which set" and "which
  way is the camera pointing" are the same question and need only one answer.
- **Open 3:1 chevrons, not the sheet's filled heads.** A filled head needs a `Mesh` and would break
  the single-`LineSegments2` disposal contract this layer is built on - the same reason
  `Module2/src/projectionDrawer.js` gives (RULES.md 6.19).
**Alternatives rejected:**
- *Leave the sizes on the sheet only.* It is the honest drafting answer and it fails the learner:
  Step 1's object is unverifiable until Step 2, which is a step away and about something else.
- *Author a second, 3-D-specific dimension set.* Duplicate data that can disagree with the drawing
  of the same part - the defect the single registry exists to prevent.
- *Show every view's set at once.* Rejected on the grounds ADR-206 rejected a fixed stage list:
  more marks is not more teaching.
**Consequences:** The framing box is recomputed to include the layer, before the flight that uses
it - a dimension hangs a lane and a half outboard of the face it measures, and framing the solid
alone crops the overall sizes off both edges of the pane. `DIM_STYLE` is now a third thing
`objectData.js` owns; it is pure data and sibling-importable under 3.6a, and both renderers must
keep reading it rather than re-declaring the numbers. Values are CSS2D and therefore billboarded,
so the aligned system's Method-1 rotation is neither applied nor wanted on the solid - that
convention is about paper.

**Amended 2026-08-06 (h).** Two changes, both to the CONTROLS rather than to the layer.
The arrow is no longer gated to the front view: it is parented inside the object's own group, so it
rides with the model and marks which face the elevation is taken from from any angle, which is the
question a learner in free orbit is most likely to be asking. Gating it to the front view meant the
one direction where it is DEGENERATE — pointing straight at the camera, foreshortened to a dot —
was the only direction it appeared in.
And the two switches have swapped places. `Dimensions` is the floating chip, because the sizes are
read on the model and a learner reaching for them is already looking at it; `Front arrow` sits in
the step card beside the four direction buttons, because it is another viewing aid. They are now
independent flags: a learner reading sizes off a clean model and a learner checking which way the
front is are not the same learner, and neither should have to turn on the other's marks to get
their own. The layer itself, its data source and its style are unchanged.

**Amended 2026-08-08.** The claim struck out above — *"Values are CSS2D and therefore billboarded,
so the aligned system's Method-1 rotation is neither applied nor wanted on the solid"* — was wrong,
and it was the whole of the defect the product owner reported. Aligned dimensioning is not a
property of paper; it is how a value is written against the line it measures, and a drawing that
turns its values on the sheet and lays them flat on the model is not one drawing in two media. It
is two conventions mixed, which is the single thing BIS Method 1 forbids.

So the placement moves into ONE function, `alignedDim()`, exported from the pure-data `objectData.js`
beside `DIM_STYLE`. It takes a `dim()` entry and returns the ends of the dimension line, the angle
the value is turned through, and where the value's centre goes; `projectionSheet.js` and
`dimensions3d.js` add their own origin and stroke it. Shared CONSTANTS were never enough — the two
renderers each carried their own copy of the same twelve lines of trigonometry, and one of the
copies had a sign error that printed every re-read value under its own line instead of above it.
A constant two renderers agree on does not make them agree about what to do with it.

Three details the amendment fixes as a consequence:
- **The turn lives on an INNER span.** `CSS2DRenderer` rewrites the outer element's transform every
  frame, so a rotation set on the node itself survives exactly until the next render. This is the
  benchmark's own `.vp-value` / `.vp-value__text` pairing, adopted verbatim.
- **The angle is a constant, not a per-frame reprojection.** The layer is only drawn for the
  direction the camera is AT, and at each of the four principal directions the view's own 2-D frame
  lands on the screen square — local +x right, local +y up. In free orbit the whole set foreshortens
  together and the value rides its plane, which is what the sheet's values do too.
- **A leader's note stays level**, in both methods. Method 1 governs the value on a dimension line;
  a note is written along its horizontal landing. Not an exception, and not a lapse back to Method 2.

Both renderers now anchor a value on its CENTRE — SVG through `dominant-baseline: central`, CSS2D
through its own 0.5/0.5 default — so `DIM_STYLE.textLift` is one derived number,
`textGap + textHeight / 2`, rather than a baseline offset that clears the line on a horizontal
dimension and cuts through it on a vertical one.

**Amended again 2026-08-09** — and this part of the 2026-08-08 amendment is WITHDRAWN. It said the
orchestrator gained `rig.setFrontLabelFloor(y)`: the Front label and the overall length both wanted
the paper directly under the part, neither leaf could see the other, so `main.js` measured the
dimension layer's box and dropped the label below it. It worked, and it was the wrong shape of fix.
Two annotations were competing for one piece of paper because the label was parked on the paper in
the first place; measuring the winner's box and pushing the loser further out only moved the name
further from the thing it names, which is exactly what the product owner reported next
(*"the arrow and 'Front' label are floating away from the object"*).

The label now rides the ARROW — halfway along the shaft, dropped by one arrow-head — so there is no
lane to contest and no cross-leaf measurement to make. `setFrontLabelFloor` is deleted from
`objectRig.js` and its call from `main.js`. The composition rule the amendment invoked still stands
(RULES.md §3.71); it simply is not needed here, and a rule about who may compose two leaves is not a
reason to compose them.

Where the arrow POINTS moved with it. The box centre is the middle of the front face only on a part
whose front face is a full rectangle; on the bearing block's L it is clear air above the base, so
`frontFaceAnchor()` drops a column of rays down the part's mid-width, keeps the stretch that strikes
material, and aims at the middle of the stretch nearest the box centre — returning that face's own
depth, not the box maximum. On the parts that were already right it returns the box centre again.
**Status:** Active (amended 2026-08-06, 2026-08-08, 2026-08-09)

---

## ADR-210: A construction ends on its curve; an optional element belongs to its own control

**Date:** 2026-08-08
**Decision:** The tangent method's stage list ends on the ENVELOPE. It runs nine stages at the
default seven divisions rather than ten: the focus and the directrix are drawn ON the envelope
stage, and the tangent and normal at P are gated on `conic.showTangent` alone.
**Why:** Reported by the product owner: *"The final step draws the tangent. We already provide a
separate UI option — 'Show tangent'. So the tangent should NOT be part of the step-by-step
construction."* It was true. `parabolaTangent()` carried a tenth stage, `TANGENT_MARKS`, and that
stage let `showTangent` through — so a learner with the toggle on saw the tangent and normal
arrive on the last press of "Next line", as if they were a step of the construction. Neither of
the other two syllabus constructions works that way: the concentric and oblong methods end on
"join the curve" and leave every optional element to its own control.
Two sub-decisions:
- **The focus and the directrix are NOT optional and do not leave.** Example 6.8 is *"draw the
  parabola and locate its focus and directrix"*, `METHOD_INFO` promises them as this method's
  output, and the shipped exercise asks for them by name. Deleting the tenth stage outright would
  have deleted the answer to the question. They move onto the envelope stage instead, which is
  also the honest reading of "the construction ends when the curve is complete".
- **The tangent is gated on the curve existing, not on a stage.** `stage >= TANGENT_ENVELOPE &&
  conic.showTangent`. There is nothing for a tangent to touch before the envelope is drawn, so the
  gate is geometric rather than a step number, and no press of Next can reach it.
**Alternatives rejected:**
- *Delete the tenth stage and everything on it.* Loses the focus and the directrix, contradicting
  the worked example, the methodology card and a problem statement this module ships.
- *Keep the tenth stage and only move `showTangent` off it.* Leaves a ten-step construction whose
  last step adds two marks, which is the shape the report objected to and which the two sibling
  syllabus methods do not have.
**Consequences:** `stageDrawsCurve()` in main.js is unaffected — it asks the layout which stage
introduces the `outline` rather than assuming the last one — but the tangent method is no longer
the WITNESS that those two are different things. The oracle's witness moves to the
focus-and-directrix construction, whose curve is stage 6 and whose tangent and normal are stage 7,
and a new assertion pins the tangent method's curve to its last stage so the tenth cannot come
back unnoticed. `METHOD_INFO['parabola-tangent'].steps` is untouched: it is the chapter's own
written procedure count, not the playback length, which varies with the divisions slider.
**Status:** Active

---

## ADR-211: The parabola is traced clockwise, because that is the way a hand draws it

**Date:** 2026-08-08
**Decision:** The tangent method's `curvePts` are reversed. The envelope is traced from the foot of
the double ordinate, round the vertex, up to its head — clockwise on screen. *(Amended by ADR-215:
the foot is now A and the head B, so that trace reads A → B.)*
**Why:** `parabolaPts()` samples y from −yMax upward, and the sheet is y-DOWN (ADR-138), so the
pencil started at the TOP of the base and swept anticlockwise. ADR-191's reveal exists to show the
curve being drawn the way a hand would draw it; a hand working a parabola of this shape comes up
out of the base, and the reveal was showing the opposite. This is the same class of correction as
the reveal itself: the geometry was right and the PERFORMANCE of it was not.
**Alternatives rejected:**
- *Swap the roles of A and B.* Would relabel the drawing. A is the chapter's upper end of the
  double ordinate and the numbering of the divided tangents follows it; renaming the ends to fix a
  playback direction changes what the figure says. **Superseded by ADR-215**, which does swap them —
  as coordinates, not captions — on the ground that a curve drawn from B to A on a figure labelled A
  first asks the learner to read the construction backwards.
- *Reverse inside `parabolaPts()`.* That helper is shared with the parallelogram and rectangle
  parabolas, whose figures open a different way — one method's playback direction is not the
  others'.
**Consequences:** Order only. Same samples, same f, same envelope, same bbox, same analytic scale —
the oracle re-checks every reversed point against y² = 4f·x and checks the direction as a signed
sweep about the figure's own centroid, so a reversal that only fixed the endpoints would fail. The
other three parabola constructions are untouched; they are enrichment tier and their figures are
built the other way up.
**Status:** Active

---

## ADR-212: The problem library is filtered by METHOD, because that is the axis the syllabus cuts on

**Date:** 2026-08-08
**Decision:** `src/problems.js` gains a third filter, `ENABLED_METHODS`, holding the three
constructions Course 1003 Module II names. `enabledProblems()` deals only problems whose
`target.method` is one of them, so a problem with no method — the focus-and-directrix exercises —
is excluded rather than waved through. Four syllabus practice problems are added, verbatim as set.
The library now deals seven: three chapter exercises and the four new ones.
**Why:** The syllabus says *"Ellipse - Rectangular Method & Concentric Circle Method only,
Parabola- Tangent method only"*, and neither existing axis can express that. `ENABLED_TIERS` cuts
by CURVE, and the ellipse tier holds two syllabus constructions and four beyond them.
`EXCLUDED_TYPES` cuts by problem KIND, and 'given-dimensions' straddles the line — it covers the
oblong method and the offset method alike. ADR-175 already named these three as the syllabus tier
of the CONSTRUCTION picker; this makes the problem library agree with it.
Two sub-decisions:
- **Filtered, not deleted.** The excluded exercises stay in `PROBLEMS` verbatim, exactly as the
  four hyperbola ones have since ADR-192. This file is the chapter, the topic README and CLAUDE.md
  both promise all fifteen, and widening the list is a one-line change if the scope moves.
- **The four new problems are a separate, labelled block.** They are not chapter exercises and are
  not presented as such. They differ from the chapter's in kind as well as origin: each states its
  METHOD and both AXES outright, where the chapter's ask for a tangent, a normal or a located point
  on top of the same figure.
**Alternatives rejected:**
- *Ban `type: 'eccentricity-method'` through `EXCLUDED_TYPES`.* Removes the three focus-directrix
  exercises and none of the four non-syllabus `given-dimensions` ones. Half a filter.
- *Delete the excluded problems.* Breaks the "fifteen, verbatim" contract for a scope decision that
  a different course could reverse.
**Consequences:** Two of the four new problems overlap the chapter exercises they sit beside in
dimensions — 100 × 70 concentric and 120 × 80 rectangular — so the shelf shows near-neighbours
whose difference is the extra work the chapter's version asks for. Left in deliberately, and
flagged: dropping either set is a content call, not a code one. `enabledProblems()` now reads
`p.target.method`, so a problem authored without a target is filtered out rather than crashing.
**Status:** Active

---

## ADR-213: The named construction may be selected for the learner; no measured quantity may

**Date:** 2026-08-08
**Decision:** Loading a problem arms `methodArmed`, and on the learner's FIRST arrival at Step 5
`armMethodForStep5()` selects the construction the statement names — with the dimension sliders set
to the bottom of their own ranges. It fires once; after that the picker is the learner's.
**Why:** Requested directly: *"maps correctly to the construction engine · auto-selects correct
method when loaded"*. Every practice statement names its method in words ("using concentric circle
method", "by rectangular method"), so hunting for it in the picker is transcription, not drawing.
This is a deliberate narrowing of RULES.md §6.2, which had been read as "stamp nothing at all", and
the line is now drawn in a different place: **a MEASURED quantity is never auto-filled; the named
construction is.** The self-check still has every dimension to report on.
Three sub-decisions:
- **The sliders land at their FLOOR, not at the method's own defaults.** `ellipse-concentric`
  defaults to 120 × 80, which is one of the four practice answers exactly — committing the method
  with its defaults would have lit the self-check green on load. The oracle asserts that no problem
  is matched by the state it loads into, and asserts that the check is not vacuous by confirming
  that at least one WOULD be on the defaults.
- **At Step 5, not at load.** Steps 1–4 re-derive the sheet's CURVE from the live cut
  (`syncSheetToCut`, ADR-194), so a method chosen at load would be left beside a curve that had
  drifted away from it, and Step 5's picker would show the wrong curve's list.
- **Once.** A learner who then picks a different construction is exploring, and re-asserting the
  problem's choice under them would be the sim arguing with the person using it.
**Alternatives rejected:**
- *Select it on load and jump the wizard to Step 5.* Skips the lesson. The library is reachable
  from Step 6 and from the card header, and a learner who opens it has not necessarily finished.
- *Do not select it at all.* The existing behaviour, and the reason the request was made.
**Consequences:** `problemLibrary.js` now reads `sim.stage()` and commits through `sim.commitConic`,
both already on the injected controller — no new seam and no reach into the orchestrator. The
commit happens inside an `onStateChange` callback, so `methodArmed` is cleared BEFORE it, and the
re-entrant pass returns early. `RULES.md` §6.2 is amended rather than withdrawn.
**Status:** Active
---

## ADR-214 — A staged construction's frame is pinned to the FINISHED figure, not to the stage on screen

**Date:** 2026-08-09
**Status:** Active
**Context:** `graphics_module_3_topic_2_2_conic_sections`

A review reported a visible jump in the tangent method's last step, "only in the Tangent Method",
and gave a cause: that the freehand step "is being rendered using a different drawing mode or a
fresh rebuild instead of continuing from the previous step state", to be fixed by *no
`scene.clear()`, no full `rebuild()`, no re-instantiating geometry groups*.

**That cause does not exist in this codebase and could not.** The 2-D sheet is a display list, not
a scene graph: `layoutFor(mode, conic)` returns typed primitives plus an analytic bbox, and
`drawSheet()` is the ONE renderer, repainting the whole list every frame (ADR-139, ADR-195). There
are no geometry groups on the sheet to re-instantiate, no clear to suppress, and no second drawing
mode to switch out of — every stage already redraws all of the linework before it, which is the
"preserve everything previously drawn" the report asks for. The reveal is a trim on path length
(`curveReveal`, ADR-191) applied by that same renderer, so the last stage runs the identical code
path as the eight before it.

The jump is real. It is a change of SCALE.

The sheet locks its millimetre scale to the layout's analytic bbox — the ADR-053 fixed
intrinsic-frame pattern — and `methodsLayout` measured that bbox from whatever the CURRENT stage
had drawn. The tangent method's last stage adds the one element in the construction that reaches
past A and B: the directrix, at ±0.6 · AB against their ±0.5. Its frame therefore grew from
224 × 120 mm to 224 × 144 at the exact moment the freehand curve began tracing — and it is the only
one of the three syllabus constructions that does this. The concentric method's frame is its two
auxiliary circles and the oblong method's is its rectangle; both are drawn at stage 0 and neither
moves again.

Whether that growth is VISIBLE depends on which dimension binds. Measured on the shipped page,
stepping the construction by hand and reading the pixel length of the double ordinate, which is
120 mm at every stage:

| pane | stages 1–8 | stage 9 |
|---|---|---|
| 964 × 805 (tall) | AB = 219 px | AB = 219 px — width binds, nothing moves |
| 1124 × 565 (short) | AB = 225 px | **AB = 189 px, and the line slides from x 885 to x 831** |

So the defect is real, is confined to this construction, and appears the moment the viewport is
short enough for height to bind — a 16 % rescale of the entire drawing, in one frame, with every
chord, division number and caption moving at once. On a taller window it is invisible, which is why
it reads as intermittent.

**Decision:** a builder MAY return its own `bbox`, and `methodsLayout` passes it to `finish()` where
one is given. `parabolaTangent` returns the frame of the FINISHED figure — axis, double ordinate,
directrix, E, focus, curve — plus the tangent apparatus where it is, when its toggle is on. Builders
that return no bbox are unchanged: `finish()` measures their items, as the other eight constructions
still do. `eccentricityLayout` already pinned its frame for this reason and says so.

After the change, AB measures 188 px at every stage of the short pane and 192 in the tall one: the
sheet is laid out for the finished drawing from stage 1, which is what a drafter does with paper.

**Alternatives rejected:**

- *Also reserve the tangent and normal at BOTH ends of the curve, so that dragging P could not move
  the frame either.* Tried and measured: it widens the frame to 258 × 187 mm and took the 1124 × 565
  pane from 1.9 px/mm to **1.1**, under the 1.3 px/mm gate at which `drawSheet` drops every caption
  (ADR-169). A construction with no names on it is worse than one that resizes while a slider is
  being dragged. P moving the frame is pre-existing behaviour and is left alone; the reported defect
  is the STAGE change, and stages are not something the learner is dragging.
- *Shorten the directrix to ±0.5 · AB so it stops level with A and B.* Hides the symptom by damaging
  the drawing: a directrix that ends level with the base reads as a chord of the figure rather than
  as the line the whole curve is measured against.
- *Draw the directrix from stage 0, invisibly, to reserve the room.* A construction may not draw
  what it has not yet found (ADR-195/ADR-196), and an invisible item is a lie in the display list
  that `describeAt()` and the annotation oracle would both trip over.
- *Ease the scale change instead of jumping it.* Makes a 16 % rescale of a technical drawing take
  longer. It should not rescale.
- *Compute the frame as the union over every stage by walking the stage list.* The same answer at
  ten times the cost, re-derived on every repaint from something the construction knows in closed
  form.

**Consequences:** the tangent method holds ONE frame across every stage, at every division count
4–12, and at every position of P — asserted three ways in `verify/conic-math.mjs`, including a
non-vacuity check that the tangent toggle genuinely does enlarge the frame, so the stability
assertions are not passing because nothing ever moves. `DIRECTRIX_HALF` is named once and read by
both the drawn item and the frame, so the two cannot drift.

The general rule: **when a staged construction's late stages reach further than its early ones, pin
the frame** — otherwise the ADR-053 scale lock turns "one more line" into "redraw everything
smaller". And when a jump is reported on this sheet, measure the SCALE first: there is no rebuild
to find.

---

## ADR-215: A is the FOOT of the double ordinate, so the envelope is drawn A → B

**Date:** 2026-08-09
**Status:** Active. Amends ADR-211.

**Context:** ADR-211 reversed the tangent method's trace so the pencil comes up out of the base —
clockwise, the way a hand works a parabola of this shape — and explicitly declined to swap A and B,
on the ground that renaming a figure's endpoints to fix a playback direction changes what the figure
says. The reveal was then correct and the labelling was left alone.

That left the drawing reading **B → A**: the trace began at B, at the foot of the base, and finished
at A, at its head. A learner following the construction meets A first in every sentence that
describes it — "draw the double ordinate AB", "join AE and BE", "tangents to the parabola at A and
at B" — and then watches the curve arrive at A last. The two orders disagree.

**Decision:** swap the coordinates.

```js
const A = pt(abs, dOrd / 2);    // the FOOT of the double ordinate — +y is down (ADR-138)
const B = pt(abs, -dOrd / 2);   // its head
```

At the DATA level, not in the drawing. Everything built from those two points follows without any
further edit — the tangents AE and BE, the division marks along them, the chords that join 1 to 1′,
the dimension text on AB, and the bbox — because all of them are derived from A and B rather than
from a top/bottom assumption. The trace is unchanged: `parabolaPts().reverse()` still starts at +y
and finishes at −y, which is now A → B by construction rather than by coincidence.

Three annotation offsets move with the points, since every name on this figure is set OUTWARD:
A reads down-right and B up-right (they swap), and the division numbers hang below AE and above BE
(AE is the lower tangent now).

**Why this is not a relabelling:** the figure is symmetric about its axis. Swapping A and B maps the
construction onto its own mirror image, so the envelope, the focus, the directrix, f, and every
chord are identical to floating point. What changes is which end each name is attached to, and
therefore which end the construction is described as starting from.

**Alternatives rejected:**
- *Reverse the trace back to B → A and keep A at the top.* Undoes ADR-211. A hand does not draw this
  curve downward into the base.
- *Swap only the two `label()` calls.* The request explicitly ruled it out, and rightly: the tangent
  AE, its numbering and the chords are all derived from the point named A, so moving the caption
  alone would leave "the tangent at A" struck from the other end of the base. The oracle now reads
  the COORDINATES rather than the captions, and checks that a line of the construction is struck
  from each, so a caption-only swap fails.
- *Keep both and add an option.* Two ways to label one figure is two figures to verify, for a
  question the chapter answers once.

**Consequences:** ADR-211 stands — the direction is still clockwise, still reversed at the layout
that owns the figure, still not inside `parabolaPts()`, which the parallelogram and rectangle
parabolas share. RULES §6.34's closing clause, "never by renaming the drawing's own endpoints", is
narrowed: it forbids renaming as a way to FAKE a direction, not naming the ends to match one. The
narration in `conicData.js` reads "from A round the vertex up to B" and is checked against the
drawing by the oracle, as the two modules cannot import each other. Four assertions cover it: A at
+y and B at −y, symmetric about the axis; the trace beginning on A and ending on B; and a
construction line struck from each of them.

---

## ADR-216: A scroll is a zoom. Only a drag is a turn.

**Date:** 2026-08-09
**Status:** Active. Applies to `graphics_module_2_topic_0_introduction_to_orthographic_projection`;
binding platform-wide as RULES §5.21/§5.22.

**Context:** Reported by the product owner: the camera jumps when you scroll in any of the four
orthographic views. The report attributed it to `controls.target` never being updated on a view
change. That was not the fault — `flyToNamed()` lerps the target across the whole flight and copies
it exactly on landing — so the fix went to what the measurement actually showed.

The topic hung `noteFreeOrbit` on the controls' `start` event. `OrbitControls` fires `start` for the
WHEEL exactly as it does for a drag, so every scroll in a principal view was read as the learner
turning the object, and one notch of the wheel did three things at once:

- `releaseOnDrag()` began handing the orthographic camera back to perspective, mid-gesture;
- `state.view` went null, so the dimension set swapped to the free-orbit one;
- `refreshAnnotations()` re-framed the scene around the new box.

The ortho camera's zoom was discarded in the hand-off, so the learner's zoom was thrown away in the
same frame the projection changed. The verification measures it as the zoom's FIXED POINT: solve
`after = s·(before − F) + F` from the values' centroid before and after, and F is the point the view
zoomed about. Against the old binding, F landed **ten pane-widths** off centre in Top and about one
and a half in each side view. That is the jump.

**Decision:**

1. A drag is detected as pointer MOVEMENT past a 3 px threshold with exactly ONE pointer down, on the
   renderer's own element. A click that never moves is not a turn; a two-finger pinch is a zoom.
2. A scroll changes nothing but the zoom. It keeps the direction, the projection, the dimension set
   and the frame — `OrbitControls` already zooms about `controls.target`, and `zoomToCursor` stays
   off, so the target is the pivot in both cameras.
3. `focusOn()` moves `controls.target` to the new content centre whenever the camera is idle. A
   flight owns the target for its whole duration and lands it exactly, so the two never contend.
4. Flights and snaps finish through `settle()`, which runs one `controls.update()` with damping
   turned off and then restores it.

**Why (3) and (4) even though neither was the reported fault:** both are the same class of defect and
both are invisible until someone zooms. A target left on the previous object's centre makes the next
scroll pull the part sideways instead of growing it in place — the drift is proportional to the
distance between the two centres, which is why it never showed on the four parts that are all
roughly centred. And `controls.update()` with damping on spends whatever inertia the last drag left
behind, so a learner who flicks the object and then presses Front gets the landing pose plus a
residue of their own flick, and the view creeps off square in the frames after it lands.

**Alternatives rejected:**
- *Set `controls.target` again on every view change, as reported.* It is already set there. Doing it
  twice fixes nothing, and would have shipped with the jump intact.
- *Suppress the release with a time window after a wheel event.* A timer that guesses which gesture
  is in progress, rather than reading which one it is.
- *`controls.enableZoom = false` in principal views.* Removes the jump by removing the zoom. The
  learner wants to look closer at the elevation; that is the whole reason they scrolled.

**Consequences:** the four principal views are now zoomable in place, and a drag still drops the
latched direction into free orbit — both asserted. Twelve assertions cover the zoom (a direction
stays lit, the scroll really did change scale, and the fixed point is within 8% of the pane centre,
for each of Front / Top / Left / Right) and one covers the drag. The zoom assertions were calibrated
by restoring the old `start` binding: eight of the twelve fail, with the fixed point up to 1058% of a
pane-width off centre.

---

## ADR-217: A re-frame is a MOVE. There is no instant target change the learner cannot see

**Date:** 2026-08-09
**Status:** Active. Applies to `graphics_module_2_topic_0_introduction_to_orthographic_projection`;
binding platform-wide as RULES §5.22 (amended) and §5.23.

**Context.** Pressing a direction was reported as jumping. ADR-216 had already established that
`controls.target` must follow the content, and that a flight lerps position and target together on
an eased curve from the pose it is leaving — so on paper the transition was already exactly what a
smooth transition is supposed to be, and every assertion about the settled view passed.

It was measured instead of argued about. The Front label is the one DOM node glued to the solid from
every direction; sampling its pane position on every animation frame across a switch produced a
1200 ms flight that was smooth for its whole length and **one enormous first frame**: 71 px on the
cylindrical block's climb to the plan, 219 px on the bearing block's drop to the side view, against
neighbouring frames of a tenth of a pixel. Two controls proved where it came from. With the
dimension layer switched OFF, every flight was clean end to end. With the layer ON but no flight at
all — the Dimensions chip, which rebuilds the same annotation set in place — there was no jump
either. Only the two together did it.

The cause is the ORDER a view change happens in. `refreshAnnotations()` builds the new direction's
dimension set BEFORE the flight starts, because the flight has to be aimed at the framing it will
land in. The new set is a different shape from the old one, so the content box and its centre move,
and `focusOn()` re-aimed `controls.target` at the new centre in one assignment. The camera had not
moved, so the flight's first `lookAt` applied that whole swing in a single frame.

**The fix that does not work, and why it is worth recording.** Translating the eye by the same delta
so the eye-to-target offset is preserved — "never update one without the other", which is the
obvious reading of the rule. It made the pop slightly WORSE (84 px, 103 px). Preserving the offset
preserves the direction the camera faces and the distance it stands off, but the eye has still
physically moved, so the entire scene slides across the pane by the parallax of that move. Only the
point AT the target is unaffected, and the target is precisely what moved.

**Decision.**

1. **`focusOn()` eases the target; it never sets it.** When the camera is idle the target tweens onto
   the new content centre over 260 ms on the shared `anim.js` engine, ease-standard.
2. **A flight takes the target over.** `flyToNamed()` cancels any live re-aim and reads
   `controls.target` where it stands. Because a tween applies `t = 0` on the frame it starts, that
   is still the OLD centre — so the flight captures the pose the picture is actually in and carries
   the target the whole way itself, alongside the eye, exactly as it already did. The instant step
   the pop was made of no longer exists anywhere.
3. **The idle re-frame is now a motion too.** A new object, or the Dimensions switch, eases onto the
   new centre over a quarter of a second instead of snapping to it.
4. **Frame-by-frame verification.** Seven switches are sampled per animation frame and each frame is
   compared with the larger of its two neighbours (§5.23).

**Rejected.**

- *Shorten the flight to ~300 ms, as reported.* The flight is 1200 ms deliberately: DESIGN.md §5.10
  makes the movement between viewpoints the thing that teaches the four principal views are one
  object. The flight was never the defect — its first frame was.
- *Disable damping for the duration of the flight.* Already equivalent: `main.js` skips
  `controls.update()` entirely while the rig is flying, so the damping loop is inert, and `settle()`
  flushes it with damping off on landing. Adding a second switch for the same effect is noise.
- *Leave the target alone when idle.* Reintroduces the ADR-216 zoom drift.
- *Re-frame after the flight instead of before it.* The flight would then be aimed at the framing it
  is leaving and would land wrong, which is a worse fault than a jump and a harder one to see.

**Consequences:** the worst single frame of a view change is now 1.1–1.5× its neighbours, down from
27–245×, and the last twelve frames of every flight are still to within 0.00 px. Twenty-one
assertions cover it, calibrated by restoring the instant assignment: five of the seven "no frame
that teleports" checks fail, at up to 245×. The two that pass under the old code are the switches
whose dimension set does not change — which is exactly the population that never had the bug.

---

## ADR-218: ⌀ or R is a fact about the VIEW, not about the part

**Date:** 2026-08-09 (amended 2026-08-09)
**Status:** Active, with decision 2 REPLACED — see the amendment at the end. Applies to
`graphics_module_2_topic_0_introduction_to_orthographic_projection`; binding platform-wide as
RULES §6.35/§6.36.

**Context.** The topic's circular sizes were hand-typed strings in the registry — `'Ø30'`, `'Ø50'`,
`'Ø18 slot'` — and two of them were wrong. Both were wrong in the same way: the author wrote down
what the FEATURE is, and BIS SP 46 / ISO 129-1 asks what the VIEW DRAWS.

The Cylindrical Block's boss is a 50 mm cylinder, so it was labelled ⌀50. But the plate it stands on
is only 40 deep, so the plan can draw just the two arcs that stand proud of the plate's edges —
147.5 deg of circle between them, well under the half circle above which a diameter would still be
allowed. It is R25. Worse, its leader was anchored at 225 deg, which is inside the plate: the arrow
pointed at a stretch of circle that is not on the paper at all. The Bearing Block's slot was ⌀18,
and a slot end is not a hole — it is a semicircular cap, R9, which with the 16 centre-to-centre
already on the plan is the pair that specifies the slot.

**Decision.**

1. **The sweep is an argument.** `roundDim(centre, r, sweep, ang, out)` in `objectData.js` takes how
   much of the circle THIS VIEW draws and returns the right primitive: a diameter at 360 deg, a
   radius leader below it. The symbol is computed, never typed. Every circular size in all four
   objects goes through it.
2. **A diameter is a line through the centre.** New `dia` primitive, placed by `diameterDim()` next
   to `alignedDim()` and shared by both renderers: arrowheads at the two ends of the diameter, ON
   the circle, pointing outwards; the line running on past the second head to `out`; the value
   written over that tail, outside the geometry the line has just crossed. Method 1 governs the
   value exactly as it governs a linear one — parallel to its line, above it as read, folded into
   (-90, 90].
3. **A radius is a leader that touches its arc.** The arrowhead is computed as `centre + r·û`, so it
   is on the arc by construction rather than by the author's arithmetic.
4. **The oracle reads the linework, not the registry.** A ⌀ must have a `circle` primitive at that
   exact centre and radius; an R must not; an R's arrow must land within 0.1 mm of drawn outline or
   edge. Calibrated by declaring the boss a full circle: it fails with "Ø on a shape this view does
   not draw as a full circle".

**Rejected.**

- *Keep the leader for diameters and only fix the letters.* A leader with ⌀ is legitimate for a
  small hole, and is what the topic had. But the brief asked for the line through the centre, it is
  equally standard, and it makes the two symbols visually distinct — which is the thing being
  taught here.
- *Write the diameter's value at the midpoint of its line, as a linear dimension does.* The midpoint
  of a diameter is the centre of the hole.
- *A threshold below which a hole is "too small" for a through-centre diameter.* Not needed: with
  the value out on the tail, the circle only has to hold two 3.2 mm arrowheads, and the smallest
  hole in the topic is 12 mm.

**Consequences:** four diameters and five radii, every one of them derived. Six assertions cover the
rule, plus the Method 1 test, which was generalised to measure the value's PERPENDICULAR distance
from its line with the foot required to land on the line — the old test measured distance from the
midpoint, which is only the same thing for a linear dimension.

**Noted, not acted on.** The Cylindrical Block's plan omits the boss's circle WHERE IT CROSSES the
plate, and that is what makes the boss an arc there. Seen from above on the solid, the boss's top
edge is a complete circle and is visible along its whole length, so the plan arguably ought to draw
it — and if it did, the same rule would then make the label ⌀50. That is a question about the
linework, not about the dimensioning, and the label follows whichever the drawing shows.

**Amended 2026-08-09 — decision 2 replaced twice, landing on the HYBRID form.**

Decision 2 originally drew a diameter as a bare line through the centre with the value written
along it. That was withdrawn for a good reason and replaced by a plain leader off the circle's edge,
which was then withdrawn in turn for a different good reason. Both intermediate forms are recorded
here because each was correct about something and wrong about something, and the form that shipped
is the one that keeps both halves.

*The bare through-centre line* stated the measurement honestly — a diameter IS a full width taken
through the middle, and a line that crosses the centre says so — but it wrote its value out along
its own slant on the far side of the circle. Turned text sitting on a hatch of geometry is hard to
read, and this topic's whole subject is reading a drawing.

*The plain edge leader* fixed the value: level, on a horizontal shelf, out on clear paper. But it
threw away the statement. An arrow touching the edge of a circle with `Ø30` beside it is the same
mark a radius uses, distinguished only by the letter, and the topic is teaching exactly that
distinction — so the two marks should not be identical apart from the word after all. The earlier
amendment argued the opposite; the argument was wrong, and the reason it was wrong is that it
treated the mark as decoration rather than as the statement it is.

**The hybrid.** The line starts at the FAR side of the circle, crosses the centre, and carries on
out past the near side to an elbow; an arrowhead sits at each end of the diameter itself, pointing
outwards; the elbow turns into a short horizontal shelf; the value stands level above the shelf, on
clear paper. The geometry states the measurement, the shelf keeps what the learner reads off the
feature they are being asked to look at, and a diameter no longer looks like a radius.

A RADIUS is unchanged and must stay unchanged: it starts ON the arc and does not reach the centre,
because a radius is measured from the centre to the curve and a line drawn across the middle would
say diameter.

Both legs still run along the feature's own radius, so the diameter's line passes through the
centre by construction and the radius's arrow lands on its arc by construction — which is what
decision 3 was for, kept through all three forms.

In code this is one `note`-shaped object with two extra fields: `k: 'dia'`, and `head2` for the
second arrowhead. Both renderers' existing leader functions draw it, each with one guarded line for
the extra head; there is no separate diameter path in either medium, and no `diameterDim()`.

Consequence for §6.36's oracle, all measured rather than assumed: the two heads are 2r apart, both
on the circle and collinear with the elbow (that IS "passes through the centre"); a radius carries
no `head2`; the symbol and the kind of mark must agree; every leader is three points with a
horizontal last leg; exactly one value sits one lift above each shelf and none is turned; an
even-odd ray cast proves no elbow and no shelf lands on the object; and the arrowheads on the paper
are COUNTED against the authored set, because a second head drawn by one guarded line would go
missing silently. Twelve assertions across three objects, on top of the symbol audit.
