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
**Status:** Narrowed by ADR-078 (and its 2026-07-28 addendum) — the blanket "no `postMessage`" ban
no longer holds; two sanctioned outbound messages (`sim:ready`, `sim:complete`) are now part of the
contract. `window.simAPI` remains the sole *inbound* control surface; nothing here about
`simAPI`/`meta.json`/the reset-path rule changes.

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

**Addendum (2026-07-25):** Ported into `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`, the fix for the camera-framing gap ADR-079
flagged and explicitly left open. Two adaptations, both scoped to these two topics:
1. **Split detect/move pivot.** Both prior ports (Module 2, Module 1's engine.js) pivot the fit
   distance on the same point they move the camera toward. In these topics the default orbit
   `target` sits measurably off the content box's centre (the drawing is one-quadrant-only, ADR-079),
   so engine.js's steady-state guard (`target ≈ centre`) does not hold at defaults — a straight port
   would pan the target on the very first rebuild, an unrequested drift at boot. Fixed by **detecting**
   clipping with the fit pivoted on the *live, unmoved* `controls.target` (so a value that already
   fits leaves the pose untouched, exactly matching pre-port framing) and only pivoting the **move**
   destination on the box centre once a push-back is actually warranted (engine.js's fix for pivot
   lurch still applies once movement is happening).
2. **No boot/reset tight-fit branch.** Both topics keep their existing fixed `CAMERA_POSITION`/
   `CAMERA_TARGET` pose on boot/reset rather than adding a `frameToSolid`-style fit — ADR-079 verified
   that pose's default framing by live screenshot the same day, and the tight-fit/push-back XOR this
   ADR requires is satisfied trivially (boot/reset never fits, edits only push back).
Verified (headless, projected content-box corners into camera NDC space): worst-case typed values in
both topics stay inside frame after the dolly settles; default/typical values produce zero camera
movement; a manual grab (`OrbitControls` `'start'`) cancels an in-flight dolly with the camera frozen
in place; the fold swoop and quick-view ortho engage own the camera with no interference (per §5.10).
topic_5 additionally sequences this against its own per-step `frameStep()` vantage glide via a
`stepFraming` guard, so the two movers never race from the same outgoing pose.

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
**Status:** Active — grid matrices + PP placement stand. The PP **fold clause** was superseded by
ADR-049 (2026-07-13) and then **restored** by ADR-108 (2026-08-04), which found ADR-049's "Module 2
parity" fold to be the actual regression — see ADR-108.

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
**Status:** The **fold clause** (item 1) is superseded by ADR-108 (2026-08-04: "beside the top view"
is wrong first-angle convention — Side must share the FRONT view's band, not the Top view's;
ADR-044's original fold-placement reasoning was correct and this ADR's reversal of it was the
regression, traced to a bad "Module 2 parity" citation — Module 2 itself carried the same bug at
the time, fixed separately by ADR-106). ADR-044's PP placement (+X, viewing direction −X) is
unaffected and stands, as do this ADR's other three clauses (exploded planes, CSS2D plane pills,
CSS2D Observer icon) — only the fold hinge/direction is reverted, by ADR-108.

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
**Status:** Active (amended by ADR-106 — X1-Y1's identity is the VP∩PP hinge, not HP∩PP, and its
length now spans the Front+Side block, not Top+Side; its analytic position formula, `x1X = -z0`,
and its slider-invariance proof are unchanged)

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

## ADR-078: One sanctioned outbound `postMessage` — `sim:ready` — narrows ADR-002

**Date:** 2026-07-24
**Decision:** Every sim now emits exactly one outbound message to the host,
`window.parent.postMessage({ type: 'sim:ready' }, '*')`, fired once from `markBooted()` after
`document.fonts.ready` resolves — i.e. after the boot watchdog (`__simBootTimer`) would already
consider the sim successfully booted, and after webfonts are painted so the host never reveals a
FOUT'd sim. This is the **only** direction of the message (sim → host); the sim still reads nothing
back via `postMessage` and installs no `message` listener. `window.simAPI` (`pause`/`resume`/`reset`)
remains the sole *inbound* control surface — this ADR does not touch it.
**Why:** The host platform's outer loading screen (built by the separate web team) previously had no
reliable signal for "this iframe is actually displayable" and had to guess, either closing the
loader over an incomplete scene or holding it open past when the sim was ready. `window.simAPI` is a
host→sim call surface; it cannot carry a sim→host event, so an outbound channel was unavoidable for
this one signal. `postMessage` targeting `'*'` was chosen over a fixed origin because the host origin
is not knowable at build time (the payload is served from "an arbitrary URL prefix," ADR-001) and the
message payload (`{ type: 'sim:ready' }`) carries no sensitive data, so origin-restriction has no
security benefit here.
**Alternatives rejected:** Leaving ADR-002's ban intact and inferring readiness from the iframe's
`load` event — rejected because `load` fires on document/script load, not on "the 3D scene has
actually rendered a frame," which is exactly the premature-reveal failure mode the web team reported.
Polling `window.__simBooted` from the host via a repeated read — rejected as impossible; cross-origin
iframes cannot read the child's globals synchronously, which is the same reason ADR-002 needed
`simAPI` as an explicit call surface in the first place. A bidirectional `postMessage` handshake
(host asks "ready?", sim answers) — rejected as unnecessary complexity; a single fire-once event is
sufficient since the host already owns its own fallback timeout.
**Consequences:** Easier: the host loading screen can close exactly on scene-readiness instead of
guessing. Harder/constraint: `RULES.md §2.10`, `PLATFORM-RULES.md §1.10`/§273, and `ARCHITECTURE.md
§6` all stated a blanket postMessage ban and needed updating to name this one exception explicitly,
so the rule stays enforceable rather than quietly violated. Every current topic's `markBooted()` is
byte-identical, so the change is one identical patch across 10 topics + `template_starter` (so future
topics inherit it for free); the two capital-letter legacy monoliths (`Module1/`, `Module2/`) were
left out of this pass — `Module1` has no `markBooted()`/boot-tracking equivalent to hook at all, and
both are superseded by the split topics, so a decision on their live-embed status was deferred back
to whoever owns them rather than assumed here.
**Status:** Active

**Addendum (2026-07-28): a second sanctioned outbound message, `sim:complete`.** The host gained a
second need — a "next topic / stay" overlay it can only show once it knows the learner *finished*
the lesson, not merely that the iframe booted. This addendum extends the ADR-078 contract (not a
new ADR — same decision, same mechanism, a second trigger point) to a second message:
`window.parent.postMessage({ type: 'sim:complete' }, '*')`, fired from a new `markComplete()`
sitting beside `markBooted()`. `markComplete()`'s body is byte-identical across every topic that
carries it (verified by hash), the same parity property as `markBooted()`:
```js
function markComplete() {
  if (window.__simComplete) return;
  window.__simComplete = true;
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}
```
**Fires at most once per page load; the `window.__simComplete` latch is deliberately NOT cleared by
`simAPI.reset()`** — replaying a finished lesson never re-opens the host overlay. This is a
considered departure from several topics' own in-sim celebration toasts (e.g.
`graphics_module_1_topic_4_understanding_orthographic_views`'s `lessonCompleteShown`, which *does*
re-arm on stepping back off the terminal step): the in-sim UI is free to re-celebrate on every
visit, but the outbound signal to the host is a one-time event, because a host overlay that could
reopen mid-session would be a worse experience than one that never returns after the first win.
The payload stays bare (`{ type: 'sim:complete' }`, no topic id or metadata) to preserve
`sim:ready`'s byte-parity property — the host already knows which iframe it loaded and can
attribute the event itself. *(Revised 2026-07-31 for Module 2 specifically, then platform-wide the
same day — see the addenda below. This paragraph is historical: it describes the retired latched
shape, now migrated everywhere.)*

**Call-site placement varies by topic, same as `markBooted()`'s per-topic call site does** — each
topic hooks its own existing notion of "finished" rather than a uniform signal, on the reasoning
that the most honest completion signal is the topic's real payoff moment, not a generic "reached
the last step" click-through:
- `graphics_module_1_topic_1_foundations`, `..._topic_2_spatial_framework`, `..._topic_3_points`,
  `..._topic_4_understanding_orthographic_views`, `..._topic_6_projection_of_straight_lines`, and
  `graphics_module_2_topic_2_simple_positions` hook an existing semantic payoff already latched
  in-sim (a dimension reveal, first arrival at a stepper's terminal step, a first fold/rabatment,
  a first flatten).
- `graphics_module_1_topic_5_projection_of_line_types`, `graphics_module_3_topic_1_sections_of_solids`,
  `graphics_module_3_topic_2_development_of_surfaces`, and `template_starter` have no such payoff
  (a conceptual tour with no answer gates, or a terminal step whose own arrival *is* the payoff), so
  they use a uniform "first arrival at the terminal step" guard instead, the same
  `highestVisited`/`visited`-Set idiom `graphics_module_1_topic_2_spatial_framework`'s stepper
  already used for its own in-sim toast.
- Several topics' "Complete & next problem" button (`completeAndNext()`) was deliberately **not**
  used as the hook — that action calls `simAPI.reset()` in the same click, which would fight the
  "never re-arm" rule above; the fold/flatten/dimension-reveal moment that precedes it is the real
  finish line. *(The "never re-arm" rule itself is struck by the 2026-07-31 addendum below; this
  bullet documents why the original 9-topic pass made this call under the old constraint.)*

**Excluded: `graphics_module_2_topic_1_introduction`.** This topic is a free-browse anatomy
gallery with no stepper, no steps, and no progress tracking (`src/gallery.js` tracks no
visited/viewed set) — there is no "finished" state to hook without inventing a completion rule
(e.g. "all 11 solids viewed"), which is a product decision, not something this pass should assume.
It continues to emit `sim:ready` only. `Module1/` stays out of scope for the same reason ADR-078
deferred it originally. `Module2/` is no longer out of scope — see the 2026-07-31 addendum below,
which is where it picked up both signals.

**Addendum (2026-07-31): `sim:complete` becomes re-fireable — the "never re-arm" rule above is
struck.** Host-side confirmed (Abhiram) the platform now supports repeated `sim:complete` triggers,
not just a first-arrival latch — the practical driver was Module 2's "Finish lesson" button pilot
(a new footer-nav button replacing the terminal step's `Next` slot, calling `markComplete()` on
click instead of an auto-detected payoff moment), which needs every click to notify the host,
including a second visit after "Try another problem" resets the bench and the learner re-flattens.
`markComplete()` drops the `window.__simComplete` guard entirely:
```js
function markComplete() {
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}
```
Fires on every call, full stop — no per-page-load ceiling, no reset-immunity clause to reason
about. **`sim:ready` is unaffected by this addendum** — `markBooted()` keeps its existing one-shot
shape; it was never a per-click signal, and `init()` itself only runs once (self-start, no external
`init()` call, CLAUDE.md), so there was never a latch to remove there.

This also **retires** the "replaying a finished lesson never re-opens the host overlay" design
intent the 2026-07-28 text above asserted as settled — the host can now re-open it, by design, on
every fire — and the reasoning that excluded `completeAndNext()` as a hook because it "would fight
the never re-arm rule": that specific constraint no longer exists, though `completeAndNext()`
remains a poor hook on its own terms (it resets the bench synchronously, still a confusing moment
to also fire a lesson-complete signal from). Module 2's pilot uses a dedicated `#btn-finish`
instead, not `completeAndNext()`.

**Pilot, then rolled out.** `Module2/` shipped the button-driven, latchless `markComplete()` first
(a `markBooted()`/`sim:ready` catch-up alongside it). The same day, the pattern rolled out to 7 of
the 9 KTU auto-firing topics (`graphics_module_1_topic_2_spatial_framework`,
`graphics_module_1_topic_3_points`, `graphics_module_1_topic_5_projection_of_line_types`,
`graphics_module_1_topic_6_projection_of_straight_lines`,
`graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_1_sections_of_solids`,
`graphics_module_3_topic_2_development_of_surfaces`) and, separately, to all 9 Diploma Engineering
Graphics topics (see the Diploma paragraph below — a gated variant, not a straight port).
`template_starter` carried the **old**, latched `markComplete()` body quoted in the 2026-07-28
addendum above for the rest of that day; it migrated too, later the same day — see the final
2026-07-31 addendum below, which closes out the rollout entirely.

**2026-07-31, migration completed for the last 2 shipped-topic stragglers.**
`graphics_module_1_topic_1_foundations` and `graphics_module_1_topic_4_understanding_orthographic_views`
both migrated to the button-driven, latchless pattern, closing out the rollout across every shipped
topic (the scaffold, `template_starter`, followed the same day — see the final addendum below):
- `graphics_module_1_topic_1_foundations` follows the standard footer-nav placement (`#btn-finish`
  takes `#btn-next`'s slot at terminal Step 4), gated on `state.dimensions` — the Step-4 dimensions
  reveal is the lesson's real content payoff, not mere step arrival, same reasoning as `points`'
  `isFolded()` gate.
- `graphics_module_1_topic_4_understanding_orthographic_views` **deviates from the standard
  placement**: `#btn-finish` lives in `#workbench-rail` beside "Back to Step 4" and the
  Fold/Unfold toggle, not the footer nav, because `body.compare-split #wizard { display: none; }`
  hides the entire wizard (including the footer) for all of Step 5 — the rail is the only surface
  reachable there. It is **ungated**: this stepper's Next has no per-step completion gate at all
  (unlike `points`/Diploma), and Step 5's own arrival already auto-drives the box-unfold, the
  topic's real payoff, so there is no separate in-step action left to gate on. The old
  arrival-triggered "Lesson complete" toast and its `lessonCompleteShown` re-arm-on-step-back latch
  are retired along with the auto-fire — the host signal is now solely the button's job, matching
  Module 2 (no separate arrival celebration). The Fold/Unfold toggle also lost its accent-fill-when-
  -pressed styling (now plain paper/bordered in both states) so "Finish lesson" is the rail's one
  accent-filled action; its toggle behaviour and label-swap were already correct pre-existing code,
  untouched by this pass.

`template_starter` migrated the same day (see the final addendum below) — nothing in the field
still carries the old auto-triggered, one-shot `markComplete()` shape.
**Status:** Active

**Note (2026-07-31):** The Diploma Engineering Graphics track (`feat/diplomaMod1`) independently
arrived at this same `sim:ready`/`sim:complete` contract before this ADR reached that branch,
recorded there as its own ADR-081 with a Diploma-only carve-out. That ADR is retired on merge —
its decision was already made here, platform-wide, and this ADR's scope covers the Diploma track
too. See ADR-095 (that track's renumbered founding decision) for where its independent version
used to live.

**Diploma rollout (2026-07-31, Phase C — completes the migration for this track):** all 9 Diploma
topics (`graphics_diploma_module_1_topic_1_1_basic_constructions` through `_1_6_ogee_curves`,
`_2_1_roulettes` through `_2_3_helix`) replaced their passive auto-fire (`problemLibrary.js`
detecting a self-check match and calling `main.js`'s one-shot `reportComplete()`/`completeSent`)
with the same `#btn-finish` pattern — but **gated**, not ungated like
`graphics_module_1_topic_2_spatial_framework` / `graphics_module_3_topic_1_sections_of_solids` /
`graphics_module_3_topic_2_development_of_surfaces` above. Diploma's 4-step wizard makes the
terminal step ("Verify") cheap to reach — pick a construction, click Next three times, nothing
solved — so `#btn-finish` stays `disabled` until a Problem Library problem has matched at least
once (`main.js`'s `solvedAny` flag, exposed as `hasSolvedProblem()`; `problemLibrary.js`'s
`solvedFired` latch now calls `sim.onProblemSolved()` instead of firing the host signal directly).
This preserves the completion meaning the deleted auto-fire actually had, rather than degrading it
to mere step-arrival. `solvedAny` is deliberately not cleared by `simAPI.reset()` — the same
reset-immunity the retired `completeSent` latch carried.

**Addendum (2026-07-31): `template_starter` migrates — rollout is now 100% complete platform-wide.**
The scaffold was the last file anywhere still carrying the retired auto-fire/latch shape (it was
deliberately deferred at the top of this rollout, on the reasoning that "a starter template has no
stepper of its own to hook a Finish button into until a real topic is cut from it" — but it *does*
ship its own 3-step placeholder stepper for demo purposes, and that stepper was still calling the
old `markComplete()` shape on first arrival at its terminal step, so it was carrying the exact bug
a topic cloned from it would have inherited). Fixed to match every other migrated topic:
`markComplete()` in `main.js` drops the `window.__simComplete` guard (one-line latchless body,
byte-identical in shape to `Module2/`'s); `stepper.js` removes the `firstArrival`/`visited.has(TOTAL)`
auto-fire check from `goToStep()` entirely and instead wires a `#btn-finish` click listener (added
to the `sim` JSDoc typedef, which had never declared `markComplete` despite calling it); `index.html`
gains the `#btn-finish` button in `.card__nav`, after `#btn-next`.
**Ungated**, matching `graphics_module_1_topic_4_understanding_orthographic_views`'s precedent, not
Module 2's/Foundations'/Diploma's gated forms — the starter has no domain state to gate on, the same
reasoning that made it ungated in the first place, not an oversight this time.
**New this pass:** `MODULE-STARTER.md` gains a §3.11 documenting the whole pattern for anyone
building a new topic from this template — what `#btn-finish` is, that `markComplete()` is latchless
by platform rule (citing this ADR), and, most importantly, that a new topic should **decide its own
gate condition** rather than reflexively copying the starter's ungated form, citing `state.flattened`/
`state.dimensions`/`isFolded()`/`hasSolvedProblem()` as gated precedents and
`understanding_orthographic_views` as the deliberate ungated one. This closes the one remaining gap
the rollout kept flagging: the pattern existed everywhere in shipped code but nowhere in the
building-a-new-topic playbook, so a topic cut from the template before this pass would have silently
regressed to the retired shape with no rule telling its author otherwise.
Verified via CDP: page loads clean (zero console errors), `#btn-next`/`#btn-finish` are mutually
exclusive at the terminal step (arrival alone fires nothing), and two `#btn-finish` clicks produce
two `sim:complete` messages (latchless, not two-then-silence).
**Status:** Active — the Finish-button migration is complete across every file in the repo that
carries a stepper; there is no remaining "old pattern" instance to track.

**Addendum (2026-08-09): `graphics_diploma_module_1_topic_1_4_regular_polygons` carve-out from
the Diploma-wide gated form.** Per explicit user decision (not a rediscovery of the Diploma
rationale above — that reasoning still holds for the other 8 Diploma topics), Topic 1.4 alone
unlocks `#btn-finish` on reaching the Verify step, no Problem Library match required. `main.js`
adds a second, separate flag (`verifyReached`, distinct from `solvedAny` — not a reuse of
`onProblemSolved()`, so "solved" keeps meaning solved) set by a `MutationObserver` on the Verify
panel's (`.step-panel[data-step="4"]`) `hidden` attribute; `hasSolvedProblem()` returns
`solvedAny || verifyReached`. `stepper.js` itself is untouched — the observer watches a DOM node
`stepper.js` already toggles, rather than adding a step-4-entry hook to the per-topic-copied
`goToStep()`, so this topic's `stepper.js` stays byte-identical to its 8 Diploma siblings
(CLAUDE.md's EXTRACTED/unchanged audit note for that file holds). Scope is this one topic only;
the platform-wide `sim:complete` mechanism (`markComplete()`, this ADR's main body) and the other
8 Diploma topics' gated form are unaffected.
**Status:** Active.

---

## ADR-079: The Lines topics' 3D reference planes are OFFSET into the used quadrant, sized to the typed-field ceiling, overturning the earlier 60→24 `SHEET` shrink's stated rationale

**Date:** 2026-07-25
**Decision:** In `graphics_module_1_topic_6_projection_of_straight_lines/src/lineRig.js` and
`graphics_module_1_topic_5_projection_of_line_types/src/lineTypeRig.js`, the HP/VP reference
planes are no longer centred on the origin. `referencePlane()` gained a world-space `offset`
parameter (a `THREE.Vector3`, applied to the mesh, the grid vertices, and the border after
`applyEuler` — i.e. after rotation, the same order `Object3D` composes its own transform, so a
"push +y" offset stays a world +y push regardless of which local axis the plane's `euler` maps
onto it). Both planes are offset by a new `PLANE_LIFT` constant along the axis the drawing
actually uses (VP: `+y`; HP: `+z`), so a plane's full `SHEET × SHEET` extent sits in
`[-6, SHEET-6]` instead of straddling `[-SHEET/2, +SHEET/2]`. `SHEET` itself grew: topic 6
24 → 44 (`PLANE_LIFT = 16`), topic 5 24 → 32 (`PLANE_LIFT = 10`); `GRID.divs` scaled in step in
both files so the cell stays the 1.0u = 10 mm engineering grid. `labels/LabelPlacement.js`'s
`PLANE_HP_ANCHOR`/`PLANE_VP_ANCHOR`/`AXIS_X_ANCHOR`/`AXIS_Y_ANCHOR` (both topics) were
repositioned to track the new edges — they are hand-placed constants, not derived from `SHEET`.
**Why:** Live repro (driving both sims to their typed-field maxima, not just the slider maxima)
found the prior 24u sizing wrong on two counts. First, `referencePlane()` builds a
`PlaneGeometry(s, s)` centred at the origin, but the line data is constrained to the first
quadrant (`aHP`/`aVP` ≥ 0, and the resolver's `dy`/`dz` ≥ 0 in every case), so the `-y`/`-z` half
of every plane was geometrically unreachable — the real usable ceiling was `SHEET/2` (120 mm),
not `SHEET` (240 mm), roughly twice as tight as the original sizing assumed. Second, `uiManager.js`
`DRIVERS` gives the typed numeric fields a deliberately wider ceiling than the sliders ("a wider
ceiling for exact textbook values": TL `inputMax` 200 vs. slider max 150; topic 6's `aHP`/`aVP`
`inputMax` 150 vs. slider max 100) — reachable today by typing a value, so sizing against the
slider max left a reachable overrun in place. Together this explains why the reported overrun was
worse than the "250mm vs. 240mm" estimate that motivated the original bug report. This directly
overturns the stated rationale of the prior `SHEET` 60→24 shrink (this topic's own CHANGELOG,
2026-07-1x entries, and both `CLAUDE.md` Architecture sections): that pass sized the sheet to "a
centred 150mm line's views" under the Points ~87%-fill philosophy, which is a correct read of the
*visual* framing goal but did not account for the planes being origin-centred while the data is
one-quadrant-only, nor for the typed-field ceiling above the sliders.
**Alternatives rejected:** A symmetric enlargement (just grow `SHEET`, keep planes origin-centred)
was rejected — it would need roughly 2.5× the area of the offset fix to cover the same worst case
(most of it on the permanently-dead negative side), reintroducing the exact "vast sparse grid, tiny
line" problem the 60→24 shrink was written to fix. Sizing against the slider ceiling only (TL 150,
`aHP`/`aVP` 100) was rejected because the typed fields reach further than that today, so it would
leave the reported bug reachable via the numeric input. Sizing topic 6 to its 12 real Problem
Library textbook maxima (TL 130, `aHP` 40, `aVP` 55) was rejected for the same reason — free
slider/typed-field play past those values is still possible and still overruns.
**Consequences:** Both topics' 3D grid is visually larger at rest — confirmed via live screenshot
this does not read as oversized/sparse at typical parameter values (grid density is unchanged,
1.0u = 10 mm cell in both). `contentBoxWorld()` (camera quick-view framing) and `flatSheetBox()`
(the fold-swoop's flat-sheet framing) were confirmed to derive purely from resolved line geometry,
never from `SHEET` — genuinely zero changes needed there, unaffected by this ADR. The 2D Compare
sheet (`sheet2DLayout.js` `SHEET = 60`, ADR-075's intrinsic-TL-scale model) and the Compare
pan/zoom clamp (`COMPARE_ZOOM_MIN/MAX`, ADR-077) are a fully separate rendering vehicle (own
`OrthographicCamera`, own `WebGLRenderer`, ADR-076) with no reference to the 3D `SHEET` at all —
confirmed no interaction, and pan/zoom re-verified working unchanged at both clamp ends. Not fixed
by this ADR, flagged as a separate finding: at the true worst case (typed-field maxima at a steep
angle) the line's own endpoint still leaves the *default 3D camera's viewport* (confirmed: `B` at
~614px above a 776px canvas at topic 6's default framing) — a larger grid cannot fix this, since
the camera pose (`CAMERA_POSITION`/`CAMERA_TARGET`, unchanged by this ADR) is fixed regardless of
grid size. `main.js`'s `SHEET_HALF` in both topics was confirmed to have exactly one occurrence
(its own declaration) in each file — it is dead, unreferenced by any other code — updated to a
correct value and comment rather than removed, since deleting an unused-but-documented constant
was not part of the requested change.
**Status:** Active

**Addendum (2026-07-25):** The offset fix above had an unnoticed side effect on the visual it was
never meant to touch. Before ADR-079, each plane was a `PlaneGeometry(SHEET, SHEET)` centred on
the origin, so along its lift axis it spanned `[-SHEET/2, +SHEET/2]`; the negative half (12u, when
`SHEET` was 24) was the visible "pierce-through" — VP continuing below where HP sits, HP
continuing behind where VP sits, so the two planes read as genuinely crossing rather than meeting
at a hinge. Shifting the plane by `PLANE_LIFT` without changing its square shape left only
`SHEET/2 − PLANE_LIFT` past the fold line — 6u in both topics, down from the pre-ADR-079 12u —
which reads on screen as flush-at-the-hinge instead of crossing (confirmed by direct arithmetic on
the diff, not assumed; the camera pose is unchanged so the same absolute tail reads smaller against
a larger plane). Fixed by making each plane a **rectangle**: the fold-line-axis extent stays
exactly `SHEET` (44 / 32, untouched, so the fold line and every hand-placed label anchor in
`labels/LabelPlacement.js` needed no repositioning), while the lift-axis extent becomes a new
`SHEET_LIFT = PLANE_REACH + PLANE_OVERHANG`, where `PLANE_REACH` is this ADR's original positive
ceiling kept byte-for-byte (38 / 26 — the overrun fix is untouched) and `PLANE_OVERHANG = 12`
restores the exact pre-ADR-079 tail. `referencePlane()` in both `lineRig.js` and `lineTypeRig.js`
gained `w`/`h` parameters (default `SHEET`/`SHEET`) so `PlaneGeometry`, the grid, and the border
all build from independent width/height instead of one square `s`; `PLANE_LIFT` is now derived
(`SHEET_LIFT/2 − PLANE_OVERHANG` = 13 / 7) so the span keeps landing on `[-12, +38]` / `[-12, +26]`.
VP and HP stay equal size within each topic (both calls pass the same `SHEET`/`SHEET_LIFT` pair).
Verified: topic 6's worst case (aHP/aVP 150 + TL 200 = 35u) still fits inside `PLANE_REACH = 38`;
topic 5's (TL 200 = 21.8u, no `aHP`/`aVP` driver) still fits inside `PLANE_REACH = 26` — neither
number changed from this ADR's original sizing. Pan/zoom and `sheet2DLayout.js` remain unaffected
for the same reason as the original ADR (separate rendering vehicle, no reference to 3D `SHEET`).
**Status:** Active

---

## ADR-080: Compare platform-wide is collapsed to a single docked shape — the compact floating card is removed, not fixed

**Date:** 2026-07-25
**Decision:** No Compare-card topic on the platform has a `.compare-card[data-size="compact"]`
floating state anymore. Compare has exactly one shape everywhere: the docked ADR-037 50/50 split.
Fixed, in order: `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines` (same day, first pass), then confirmed
present and fixed identically in `graphics_module_1_topic_3_points`,
`graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_2_development_of_surfaces`,
and `Module2` (the platform-wide reference module). `template_starter`'s CSS/markup scaffolding
(no JS wiring exists there) was cleaned the same way so a new topic cut from it no longer re-seeds
the dead compact-card chrome. In every location, `compare.show()` now calls `enterWorkbench()`
unconditionally, at every viewport width; `applyCompareSize()`, `isWorkbenchViewport()`, the
`compareSize` state, `COMPARE_DEFAULT_SIZE`, the card's head chrome (`.compare-card__head`/`__tab`/
`__btn`, the `#compare-expand`/`#compare-close` buttons and their
`matchMedia('(min-width: 768px)').addEventListener('change', ...)` demotion listener) are deleted
outright. `.compare-card` is a plain flex column and a grid cell (`grid-area: compare`) — never
`position: absolute`, never a transient overlay, so it no longer earns the Flat-Ink shadow
exception. Below the existing 768px mobile breakpoint the same `body.compare-split` grid restacks
to a single column (`"view" "compare" "rail"`, and `"view" "compare"` when the rail is collapsed)
via one `@media (max-width: 767px)` override — there is no second Compare UI to fall back to, so
there is no state a resize can strand.
**Why:** The floating card was a real, shipped mode (reached via `applyCompareSize('compact')`
when the wizard-toggle chevron was clicked mid-split, or automatically when the viewport narrowed
below 768px while the split was open), not a debug artifact — but the demotion listener only had a
narrowing branch, never a widening one, so widening back past 768px left the card stuck floating at
full window width: exactly the picture-in-picture-style panel (title bar + expand + close) reported
against topic 6, reproduced identically in topic 5, and confirmed present (same markup, same
listener, byte-for-byte) in `graphics_module_1_topic_3_points`,
`graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_2_development_of_surfaces`,
and `Module2` — pre-existing since the listener's introduction (`60b8ece`, 2026-07-19), not a
regression from the same-day con-dock/pan-zoom/auto-zoom session that prompted the report. The
`topic_3_points` wizard-toggle chevron needed the same `applyCompareSize('compact')` →
`compare.hide()` swap topic 5/6 required; `Module2` and `graphics_module_2_topic_2_simple_positions`
had no mobile Compare `@media` rules to replace at all (the restack rule is net-new there);
`graphics_module_3_topic_2_development_of_surfaces` carried its own small standalone
`@media (max-width: 767px)` block for the compact card, separate from the topic's main mobile
block, which the restack rule replaced in place. No location needed a camera/`frameStep()`-style
fix — topic 5's `stepFraming` interaction was ADR-014 auto-zoom landing in the same commit as this
fix, not part of it. `graphics_module_1_topic_4_understanding_orthographic_views` and
`graphics_module_3_topic_1_sections_of_solids` were checked and are NOT part of this decision: both
ship the same dead `.compare-card[data-size="compact"]` CSS/markup but neither has the demotion
listener (topic_4 drives its own `enterCompareSplit`/`exitCompareSplit`; sections-of-solids has no
Compare wiring at all) — left alone as pre-existing dead code, not a resize-strandable bug.
Repairing the listener (adding a widening branch)
was considered and rejected: Compare's whole point is a full drawing-sheet read next to the 3D
solid, and a 420×320px floating card serving that job on a phone- or tablet-width viewport is not a
usable secondary state worth keeping around — it exists only because the split couldn't fit two
side-by-side panes that narrow, which is exactly what a single-column stack solves without a second
mode. Module 2's *code* was not usable as a template for this fix — it carries the byte-identical
compact card and the byte-identical one-way listener — so "make Compare behave the way it already
reads everywhere else" here means the single-shape outcome, not copying Module 2's implementation.
**Alternatives rejected:** A two-way `matchMedia` listener that re-enters the split on widening —
rejected because it still needs the compact card to exist as a landing state during the narrow
window, and (per the first AskUserQuestion round on this task, overridden by this decision) any
such listener has an intent-tracking problem: it can't distinguish a breakpoint-forced demotion from
a user's deliberate Shrink click without extra state, which the single-shape design sidesteps
entirely by not having a second state to track. Keeping the compact card only for the sub-768px case
(effectively restoring its pre-ADR-021 mobile role) was rejected for the same reasons above, plus it
would leave the exact demotion/restoration bug live at that one boundary — just renamed as "expected
behavior" rather than fixed.
**Consequences:** `driveFold()`'s forward-fold guard drops its `!workbenchOpen` term (always false
now that Compare-open implies split-open) but is kept, not deleted, as a defensive no-op guard,
since `simAPI.reset()` also routes through `compare.hide()`. The `#wizard-toggle` chevron's
split-exit branch now calls `compare.hide()` (closing Compare) instead of `applyCompareSize('compact')`
(demoting it) — consistent with the split being Compare's only shape. `loop()` no longer toggles
`labelRenderer.domElement.style.display` to hide the 3D scene's CSS2D labels while Compare is
"compact" (that state no longer exists; the split's two panes never overlapped, so the labels render
unconditionally now). Verified in both topics via a same-origin same-document iframe harness (real
window/tab resize proved unreliable in this session's browser-automation environment, and a
backgrounded automation tab suspends `matchMedia` `change`-event dispatch entirely — the exact
mechanism that hid this bug from earlier manual QA): the grid's `gridTemplateColumns`/
`gridTemplateAreas` switch correctly and reversibly at 1200→900→760→500→900→1200px, `.compare-card__head`,
`#compare-expand`, and `#compare-close` are absent from the DOM at every width, and — because the
fix is now pure CSS with no JS listener driving it — this holds even where the `change` event itself
never fires. `#rail-toggle` and `#con-dock` needed no changes; both already claim their grid areas
positionally and follow the stack. The same verification approach (iframe width-walk, DOM absence
checks for the deleted head-chrome ids, `node --check` syntax validation on every edited `main.js`)
was repeated for `graphics_module_1_topic_3_points`, `graphics_module_2_topic_2_simple_positions`,
`graphics_module_3_topic_2_development_of_surfaces`, and `Module2` in the follow-up pass that
completed this ADR platform-wide the same day. `graphics_module_1_topic_4_understanding_orthographic_views`
and `graphics_module_3_topic_1_sections_of_solids` remain untouched (see Why) — their dead compact-card
CSS/markup is a separate, non-urgent cleanup, not covered by this ADR.
**Status:** Active — resolved platform-wide across every Compare-card topic + `template_starter`.

---

## ADR-081: The Lines topics' 3D BIS dimensions roll about the rod axis to face the live camera, instead of a fixed world-up standoff

**Date:** 2026-07-25
**Decision:** In `graphics_module_1_topic_6_projection_of_straight_lines/src/dimensions.js` and
`graphics_module_1_topic_5_projection_of_line_types/src/dimensions.js` (byte-identical, per this
module pair's existing convention), the True-Length BIS Type-B dimension used in the 3D scene no
longer computes a single fixed standoff direction at build time (`off = normalize(cross(rod,
worldUp))`, ADR-041's original geometry). A new `addOrientedDimension()` builds the same extension
+ dimension-line + filled-3:1-arrowhead geometry once, in a dedicated child `THREE.Group`'s own
local frame (rod along local +X, standoff along local +Y, centred at the rod's midpoint); a new
`orientDimension()` re-derives that group's rotation every render frame as
`standoff = normalize(rod × viewDirection)`, both terms taken in the dimension's OWNER group's
local space (so a dimension riding a folding group — topic 5's top-view dimension parented to
`hpGroup` — still resolves against the camera correctly through a fold tween, by dividing out the
owner's world quaternion). `lineRig.js`/`lineTypeRig.js` track every dimension's `{entry, owner}`
and expose `orientDimensions(camera)`, called once per frame from each topic's `main.js` render
loop immediately before `renderer.render()`, passing whichever camera is live (free-orbit
perspective, an engaged Top/Front/Side quick-view, or the fold-swoop ortho camera). The original
`addLinearDimension()` (fixed world-space `off`) is UNCHANGED and still used by `compareSheet.js`'s
`addViewDim()` — the flat 2D Compare sheet's own square-on ortho camera never moves, so its
dimensions were never affected and needed no camera-tracking.
**Why:** `off = cross(rod, worldUp)` always has zero y-component, committing the dimension to a
horizontal plane that only reads as screen-perpendicular to the rod from directly overhead — i.e.
Top was a coincidence of that one camera pose, not a property of the formula. From Front or Side
the extension/tick marks projected at an angle (reading as a skewed parallelogram instead of a
drafting bracket) and the filled arrowhead triangles were seen edge-on (near-invisible slivers).
Reported against topic 6's Front/Side quick-views; reproduced live in both topics via a same-origin
`:8123` PHP dev server (matching this pair's established `graphics_module_1_topic_5/6`
browser-verification pattern). Topic 5 additionally dimensions the VIEW PROJECTIONS (not the space
rod) — for its front-view dimension the rod lies exactly in the VP plane, so the old formula's `off`
degenerated to a vector ALONG the view axis: the whole dimension collapsed flat onto the `a′b′` line
in Front view, arrowheads gone entirely, confirmed live at Step 1 (Parallel to both). A per-view
"pick a different fixed formula for Top vs Front vs Side" fix was rejected in favour of a single
camera-relative formula, since the quick-view set is not exhaustive (free perspective orbit and the
fold-swoop ortho camera both need the same correctness with no enumerable set of "known" views).
**Alternatives rejected:** Billboard the WHOLE dimension flat to face the camera (like the CSS2D
text labels) — rejected because the extension lines and arrowheads measure real 3D endpoints; a
free billboard would tear their feet off the rod's actual A/B terminators the instant the camera
moved off-axis from the billboard plane, which is a correctness defect a text label doesn't have
(a label's position is a single point; a dimension's extension lines connect TWO specific points to
a line). The chosen fix keeps every vertex glued to its measured feature and rotates only the
STANDOFF axis — an axis-constrained roll, not a free billboard. Rebuilding the dimension's geometry
every frame from a live camera-derived `off` (i.e. keep `addLinearDimension`'s shape, just re-run it
per frame) was rejected as unnecessary allocation/GC churn against the leaf's ADR-004 disposal
discipline, when a pure quaternion transform on a static local-frame widget (mirroring the existing
`setFoldAngle` pattern) achieves the identical visual result with zero new geometry.
**Consequences:** Every `addOrientedDimension()` call site must also register its returned
`{group, dLocal, prevPerp}` entry (paired with the owner group it was parented to) so the rig's
`orientDimensions(camera)` can find it; a dimension built but never registered would freeze at its
build-time seed pose (the same world-up formula, kept ONLY as a deterministic fallback — see the
seed-pose note in `dimensions.js`) and silently reproduce the old bug in non-Top views. Disposal
needed NO new code: both `group.traverse()` (geometry/material) and `disposeLabels(group)`
(CSS2D DOM) in `lineRig.js`/`lineTypeRig.js`'s `dispose()` already recurse into arbitrarily nested
children, so the dimension's extra wrapping `THREE.Group` (one level deeper than the old flat
`addLinearDimension` output) is swept by the same generic traversal, unchanged. A per-frame
continuity rule (hold the previous frame's standoff sign when `rod × viewDirection` flips or
degenerates near end-on) prevents the dimension from visibly snapping to the opposite side of the
rod as the camera orbits past it. Verified: Top view is an exact algebraic fixed point of the new
formula (`viewDirection = (0,−1,0)` reduces `rod × viewDirection` to the old `(−rod.z, 0, rod.x)`
up to sign), so it was re-checked for pixel-level parity, not assumed safe. Topic 6's Front/Side
quick-views, topic 5's Front/Side quick-views and its Step 1/4/5 view-projection dimensions, both
topics' fold swoop (including topic 5's `hpGroup`-parented top-view dimension riding the fold), and
a free-orbit drag sweep were all re-verified live; the 2D Compare sheet was confirmed pixel-identical
to its pre-fix rendering in both topics.
**Status:** Active — landed in both `graphics_module_1_topic_5_projection_of_line_types` and
`graphics_module_1_topic_6_projection_of_straight_lines`. No other topic in the catalog builds a 3D
(non-flat) BIS dimension via this `dimensions.js` pattern, so no further backport is in scope.

---

## ADR-082: Problem Library overlay title centres; close button stays corner-anchored

**Date:** 2026-07-27
**Decision:** The `.problem-library__title` ("Practice problems", the `<h1>` in the Problem
Library modal's header) now reads centered in its header row, on every deployed copy. The
`.problem-library__close` 44px button stays where it was — pinned top-right, the platform's
standard corner-anchored chip (DESIGN.md §5.12). Achieved with a `44px` `::before` spacer on the
opposite side of `.problem-library__header` plus `.problem-library__title { flex: 1 1 auto;
text-align: center }`, so the spacer and the close button counterweight each other and the title
box sits on true header-width center. No markup changed in any location.
**Why:** Requested UI polish; the header previously used plain `justify-content: space-between`,
so the title read hard-left. Audited DECISIONS.md, DESIGN.md, RULES.md, and the graphify knowledge
graph first — the top-left placement was never a recorded decision (no `#NOTE`/`#WHY` convention
exists in this repo, and no ADR mentions this title's alignment), and DESIGN.md's §5 component
catalog had **no subsection for the Problem Library dialog at all** (it ran 5.1→5.13 and stopped).
Centering it does not overturn anything (§8.4 not triggered) and does not conflict with any
existing typography or Quiet Chrome rule (§2.3/§3.3), which govern colour coverage and weight, not
alignment.
**Alternatives rejected:** Absolute-positioning the close button (`position: absolute; right:
var(--space-5)`) with `justify-content: center` on the header — also centers the title, but
requires merging its `translateY(-50%)` into the existing `:active { transform: scale(0.97) }`
press rule (§6 rule 6) in all 8 files, more edit surface for the same visual result, and touches
Module 1's no-transform-sensitive shell (DESIGN.md §4.4) for no benefit. Centering the whole header
group (`justify-content: center` alone) was also rejected — it drags the close button off its
top-right corner, breaking the platform's §5.12 corner-chip convention.
**Consequences:** Easier: the header now reads as a conventional centered dialog title, matching
the pattern learners see in every other full-viewport modal on the platform; DESIGN.md gains a
proper §5.14 component spec for this overlay so future topic clones inherit the intent instead of
copying blind. Harder/known: this is one more rule that must be manually re-applied in any *new*
topic folder that adds its own Problem Library from scratch rather than copying `template_starter/`
(RULES.md §1.3/§1.4 — no shared file, no build step). The 44px spacer literal deliberately mirrors
`.problem-library__close`'s own `width: 44px` (the platform's minimum-target constant, DESIGN.md §6
rule 4) rather than introducing a new token for it.
**Status:** Active — landed in `Module2/index.html` (master), `Module1/src/shell.css` (Module 1's
own master), the five deployed topic copies (`graphics_module_2_topic_2_simple_positions`,
`graphics_module_3_topic_1_sections_of_solids`, `graphics_module_3_topic_2_development_of_surfaces`,
`graphics_module_1_topic_3_points`, `graphics_module_1_topic_6_projection_of_straight_lines`), and
`template_starter/index.html` so future topic scaffolds inherit it.

## ADR-083: The problem-library interface contract (`problems.js` six exports, `problemLibrary.js` one-arg `initProblemLibrary(sim)`) is a platform-wide standard for every new topic, not scoped to the Module 2 family

**Date:** 2026-07-27
**Decision:** Every new `problems.js`/`problemLibrary.js` pair created for a NEW topic — Case A
(a new Module 2 family topic) or Case C (a whole new subject module) — must follow the interface
confirmed identical across all four shipped Family-A pairs (`Module2`,
`graphics_module_2_topic_2_simple_positions`, `graphics_module_3_topic_1_sections_of_solids`,
`graphics_module_3_topic_2_development_of_surfaces`): `problems.js` exports exactly `TIERS`,
`ENABLED_TIERS`, `FIELD_LABELS`, `PROBLEMS`, `enabledProblems()`, `groupByTier(list)`;
`problemLibrary.js` exports exactly one `initProblemLibrary(sim)` (one positional argument),
importing only `{ PROBLEMS, FIELD_LABELS, enabledProblems, groupByTier }`, returning exactly
`{ open, exit, isActive, dispose }`. `EXCLUDED_TYPES` + a per-problem `type` field remain an
additive, optional layer for a hard syllabus-KIND exclusion (already proven by ADR-062/065/069),
never a required export. This is now documented as RULES.md §6.24–§6.26, and `template_starter/`
gains a real (empty-bodied) `problemLibrary.js` stub alongside its existing `problems.js` stub, so
every future Case A/C builder gets working starter code instead of "copy a sibling topic's file"
instructions (MODULE-STARTER.md §3.4, Section 6 updated to match).

Case B (a new Module 1 lesson) is structurally exempt: it never creates its own
`problemLibrary.js` — it injects into Module 1's existing **shared engine leaf**
(`Module1/src/problemLibrary.js`, MODULE-STARTER.md's Case-B shared-leaf table), the same way it
injects into `engine.js` without ever editing it (ADR-011). This ADR does **not** touch that shared
file, and does **not** require `graphics_module_1_topic_3_points` or
`graphics_module_1_topic_6_projection_of_straight_lines` — its two existing consumers, both on the
2-argument `initProblemLibrary(sim, config)` form — to migrate. Migrating Module 1's shared engine
leaf onto the 1-arg contract is a real, separately-decided future task, not a consequence of this
ADR.

**Why:** The interface shape — export names, arity, return keys — is subject-agnostic on
inspection: nothing in it names a solid, a tier, or an Engineering-Graphics concept. Confining it
to the Module 2 family was narrower than the evidence supported. Reading all four shipped pairs
first (rather than generalizing from the richest one) kept the drafted contract from
over-specifying `EXCLUDED_TYPES`/`setup`/`path` as if universal — they stay optional (§6.25).
**Alternatives rejected:** (1) Scoping the contract to Case A only, revisiting later — rejected;
nothing case-specific was found once the four pairs were actually compared, so a narrower rule
would just need the same widening the next time a Case C module needed a problem library. (2)
Silently broadening an already-narrow rule instead of stating the platform-wide scope directly —
not applicable here: RULES.md §6.24 and this ADR did not exist prior to this entry. An earlier
drafting pass proposed Case-A-only wording for both, but it was never confirmed or committed — no
prior rule exists to silently reverse. (3) Forcing Module 1's two existing lessons to migrate now —
rejected, out of scope, working code shouldn't be touched opportunistically just because a new rule
was written.
**Consequences:** A future Case A or Case C topic can be checked against §6.24 as a pass/fail
contract, and can start from a working `template_starter/src/problemLibrary.js` stub instead of
copying and stripping a sibling topic's filled-in file. `EXCLUDED_TYPES`/`setup`/`path`/`type`
remain undocumented as generic members — addable by any future topic without contradicting §6.24.
Known follow-up, not part of this ADR: whether Module 1's shared engine leaf should eventually move
to the 1-arg form is an open question for a separate ADR.
**Status:** Active

---

## ADR-084: Show Method lays its construction Sets SIDE BY SIDE on the 2D Compare sheet; ADR-053's scale-lock and ADR-054's anchor extend to an n-Set nominal layout

**Date:** 2026-07-27
**Decision:** Step 6's "Show Method" walkthrough replays a problem's textbook construction as 2 or 3
*Sets* (successive poses of the same solid) on the existing Canvas2D Compare sheet. The Sets are drawn
SIDE BY SIDE, all visible at once, matching the change-of-position convention every textbook and exam
answer uses — not replaced in place. That requires `drawCompare()` to size for n drawings instead of
one, which touches the two ADRs that currently assume a single drawing. Both are EXTENDED, not
reversed; neither ADR's own text is edited.

- **Extends ADR-053 (scale-lock).** ADR-053's invariant is "`scale` derives ONLY from the solid's
  intrinsic 3D size (`solidSpanUnits`) and never from the live drawn bbox." That invariant is
  PRESERVED verbatim. What changes is the nominal layout the intrinsic size is measured against:
  `nomWmm` becomes `(n·blockW + (n−1)·STAGE_GAP) · WORLD_TO_MM`, with
  `blockW = E + (showSideViewFlag ? GAP + E : 0)` and `STAGE_GAP = GAP = E·0.35`. Every input is
  still `E`, `GAP`, `showSideViewFlag` and a Set count — all distance- and angle-independent
  constants. No live bbox is introduced anywhere, including for the per-Set focus targets (below).
  This is legitimate because a Set is the SAME solid at a different pose: `solidSpanUnits` is a
  bounding-sphere diameter read off LOCAL geometry before `position`/`quaternion` apply, so it is
  provably identical for every Set. One scale serves all of them.
- **Extends ADR-054 (balanced anchor).** ADR-054 centres the nominal layout rather than the world
  origin. The same reasoning now carries the Set row:
  `anchorSX = (showSideViewFlag ? (E+GAP)/2 : 0) + (n−1)·(blockW + STAGE_GAP)/2`, `anchorSY = 0`.
  Same intrinsic-only inputs, same "changes only when base/height resize the solid" guarantee.
- **n is gated on `methodActive`, and the transition is TWEENED.** The sheet is 1-wide in ordinary
  use and expands to n-wide only while Show Method runs. Sizing for 3 permanently would shrink the
  ordinary single-drawing case by ~3× for a feature most sessions never open; snapping between the
  two would jump `scale` and `anchorSX` visibly. So a `methodSpread` 0→1 tween feeds a continuous
  `nEff = 1 + (n−1)·methodSpread` into BOTH formulas, and each Set's `dx = i·(blockW+STAGE_GAP)·
  methodSpread`. The Sets slide apart from a stack; `scale` moves continuously with them and lands
  on exactly the intrinsic value at both ends. The honest cost this ADR accepts: while Show Method
  runs, the drawing IS ~3× smaller than normal. That is what the per-Set focus chips exist for.
- **Captions follow the Set, not the view, while the method runs.** The per-view Top/Front/Side
  captions are suppressed and each block carries one `Set N — <label>` caption instead; 9 view
  captions at the reduced scale collide with the dimension numerals. The per-view captions return
  unchanged on exit.
- **Per-Set focus is intrinsic too.** A Set's focus target is its block centre, derived from the same
  `E`/`GAP`/`showSideViewFlag`/index inputs — never a measured bbox of what was actually drawn.
  Tighter framing from a live per-Set bbox was rejected specifically because it would reintroduce the
  live-bbox coupling ADR-053 removed. Focus drives `comparePanX/Y` + `compareZoom` only (ADR-054/055
  screen-space lens), so it composes with the scale-lock instead of fighting it.
- **On method exit, `resetCompareView()` fires.** `nEff` returning 3→1 changes both `scale` and
  `anchorSX`; a pan/zoom left pointing at where Set 3 used to be would strand the single drawing
  off-frame. `resetCompareView()` gains a third call site (fresh open, dblclick, sim reset → plus
  method exit) and also clears `focusSet`.

**Why:** A learner comparing Set 2 against Set 1 needs both on screen — that comparison IS the
pedagogy of a change-of-position problem, and it is how the answer is drawn on real exam paper.
Replace-in-place would have kept the sheet large but destroyed the comparison. Extending the two
layout ADRs was preferable to carving out an exception because their actual invariant (intrinsic,
never live-bbox) survives untouched — only a constant in the nominal layout became a variable.
**Alternatives rejected:** (a) *Size for 3 Sets always* — rejected, penalises every ordinary session
for a feature most never open. (b) *Snap n on enter/exit* — rejected, a visible scale jump reads as a
bug. (c) *Replace-in-place, one Set at a time* — rejected, destroys the side-by-side comparison that
is the whole point. (d) *Per-Set live-bbox framing for tighter focus* — rejected, reopens ADR-053's
original coupling.
**Consequences:** ADR-055 (zoom) and ADR-018 (`WORLD_TO_MM`) are untouched and compose unchanged.
ADR-056's analytic pinning RULE is unchanged but now applies PER SET: each Set draws its own XY at
`sheetY=0` and its own X1-Y1 at `sheetX=−z0ᵢ`, both offset by that Set's `dx`. `z0` is genuinely
per-Set (it derives from the pose's world bbox, `main.js:892`), so reading the live `ppHingeGroup`
would misplace every Set but the live one. ADR-052's "no projector lines on the sheet" de-clutter
rule gains a scoped exception: projectors ARE drawn during Show Method, because "project across from
the previous view" is a construction beat — they are gone again the moment the method exits.
**Status:** Superseded by ADR-085

---

## ADR-085: Show Method moves out of the Compare sheet into its own iframe-scoped full-screen takeover view

**Date:** 2026-07-27
**Decision:** Show Method is no longer an extension of the 2D Compare sheet. It becomes a dedicated
full-viewport takeover, scoped to the sim's own iframe — `position: fixed; inset: 0` at
`--z-overlay`, following the `.problem-library` precedent exactly — and NOT the browser Fullscreen
API: the sim stays inside its `window.simAPI` sandbox boundary and never requests chrome outside the
iframe. This SUPERSEDES ADR-084's container decision. ADR-084's pedagogical content is retained
wholesale and re-hosted:

- **Retained verbatim.** The headless per-Set projection pipeline (`projectSetPose` →
  `buildEdgeMap` → `drawProjections` → harvest → `dispose()` in the same tick), the fixed 7-beat
  template, the per-Set `z0`, the corner-label and axis-chain beats built from `planAnnotations`/
  `chainPositions`, the n-Set side-by-side layout, and the "Set label only" caption. Verified
  reusable without internal edits: `drawMethodSheet(ctx, w, h)` takes its surface as parameters and
  reads no Compare DOM.
- **Retained as sizing law, no longer as an extension of ADR-053/054.** Scale stays intrinsic-only
  (`solidSpanUnits`/`E`/`GAP`/`showSideViewFlag`/Set count, never a live bbox) and the anchor stays
  the nominal Set-row centre. Because the takeover owns its own surface, these formulas no longer
  co-exist with the single-drawing path, so **ADR-053 and ADR-054 revert to governing the ordinary
  Compare sheet alone**; their n-Set generalisations move here, unchanged in form.
- **`methodSpread` retires.** The 0→1 spread tween existed only to morph one shared sheet between
  1-wide and n-wide without a visible `scale` jump (ADR-084 bullet 3). A dedicated container has no
  1-wide state to morph from: `nEff` is simply the Set count (2 or 3), `dx` is fixed, and the
  delayed-collapse teardown retires with it. The entrance flourish reuses the Problem Library's
  existing `libraryIn` slide-and-fade rather than bespoke logic.
- **The sim loop pauses while the view is open.** `window.simAPI.pause()` on open / `resume()` on
  close, matching the `.problem-library` contract — the 3D scene is fully covered, so rendering it
  is wasted GPU and battery. The known consequence is accepted deliberately: `simAPI.pause()`
  cancels the rAF that `anim.js`'s `tick()` rides, so no `anim.js` tween can run inside this view.
  The one interaction that used one — Set-focus zoom — becomes an **instant snap**. Building a
  second, independent rAF-driven animation path for a single interaction was rejected as worse than
  the snap.
- **Compare's coupling is removed entirely.** `enterWorkbench(keepFlattened)`,
  `compare.show(keepFlattened)` and `simController.openCompare` are deleted; `enterWorkbench`'s
  forced unflatten is unconditional again, restoring its ADR-037/080 invariant ("the left pane
  always shows the 3D pictorial"). The `teardownShowMethod` unflatten-on-exit block is deleted too —
  it existed only to undo the `keepFlattened` suspension, and outside Compare it would spring the
  learner's own Step-6 flatten back to 3D unbidden. Show Method's pan/zoom/focus fork from
  `comparePanX/Y`/`compareZoom`/`focusSet` into its own variables with their own reset, so a drag on
  either surface can never re-frame the other.
- **Chrome moves onto the sheet.** The `Set X of Y — <description>` title bar is REMOVED. Back /
  Next / Exit method become a floating control bar, bottom-centre, overlaying the drawing; the
  Set-1/2/3 focus chips a separate floating group, top-right. Focus stays purely visual and never
  moves the sequence (ADR-084 Decision 7, unchanged). The Set-label text the removed bar carried
  moves into the `announce()` string, so screen-reader parity survives its deletion.
- **Abort-on-edit retires on the controller side, stays on the stepper side.** Under ADR-084 the
  Step 1/2 drivers were re-parented into `#workbench-rail` and left fully live during the
  walkthrough, which is why `methodController.js` had to bind its own rail listener. The takeover
  never opens the split, so the rail is never built, the drivers stay in the covered wizard, and
  that listener is deleted. `stepper.js`'s `sim.method.abort()` calls in `reflowFrom` and on Unfold
  are KEPT as no-op invariant guards: the overlay blocks the pointer, but only the focus trap keeps
  Tab out, and a trap gap must not leave an un-abortable edit path.
- **The `foldProgress === 1` trigger gate is unchanged.** It was always a pedagogical sequencing
  choice — build fold intuition live, first — not a consequence of needing the flattened sheet's
  container. The container correction does not touch that reasoning.

**Why:** ADR-084 put Show Method inside the Compare split because that is where the 2D sheet lived.
Live testing the same day surfaced a container mismatch the design could only paper over: (a) the
Step-6 trigger and the sheet it draws on can never be visible together, forcing `begin()` to open
Compare itself; (b) that open forcibly unflattened the very state `methodCanRun()` requires, forcing
a `keepFlattened` flag through four functions; (c) the split leaves all 8 geometry drivers live
beside a walkthrough a single slider nudge invalidates, forcing a second abort listener; and (d)
sharing the sheet forced a `methodSpread` morph tween purely to hide a scale jump. Every one is a
symptom of borrowing a container built for a different job. A dedicated surface removes all four at
once rather than adding a fifth compensation.
**Alternatives rejected:** (a) *Keep it in Compare and fix the symptoms individually* — rejected,
each fix threaded a new parameter or listener through code with no other reason to know Show Method
exists. (b) *Browser Fullscreen API* — rejected, crosses the `window.simAPI` sandbox boundary the
platform contract draws around the iframe. (c) *A new Step 7* — rejected, Show Method reviews Step
6's answer, it is not a further construction step. (d) *Keep sharing pan/zoom/focus with Compare* —
rejected, a drag on one surface would silently re-frame the other. (e) *A second rAF pump so tweens
survive the pause* — rejected, a whole parallel animation path for one zoom interaction.
**Consequences:** ADR-084 is Superseded. ADR-053/054 revert to governing only the ordinary
single-drawing Compare sheet. ADR-056's analytic pinning rule still applies per Set. ADR-052's "no
projectors on the sheet" de-clutter rule keeps ADR-084's scoped exception — projectors are a
construction beat and exist only inside this view. No `anim.js` tween may be added to this view
while the pause contract holds; any future motion here must be CSS or an instant state change.
**Status:** Active

## ADR-086: Platform fonts move from bundled local woff2 to Supabase Storage CDN

**Date:** 2026-07-27
**Decision:** Every module and topic's `@font-face` rule for Atkinson Hyperlegible (400/700) and
IBM Plex Mono (400) now points at a public Supabase Storage bucket
(`https://ipcgxpcfrqlxicgtyhql.supabase.co/storage/v1/object/public/simulations/_shared/fonts/…`)
instead of a local `./assets/fonts/*.woff2` file. This **reverses** the local-bundled-font clause
of RULES.md §2.15 / PLATFORM-RULES.md §1.15 (and the offline-capability rule they sat beside,
§2.12/§1.12), which had mandated bundled woff2 + "never use a Google-Fonts CDN" specifically to
guarantee full offline rendering after first load. The rule is not being re-argued — the web team
directed the reversal to centralize font hosting in one Supabase-backed location instead of
maintaining 13 byte-identical copies (39 files) scattered across every module/topic folder.

**What changed:** the `@font-face` `src` in all 13 declaration sites (12 module/topic
`index.html` files plus `Module1/src/shell.css`) now points at the CDN; each block is otherwise
unchanged (family, weight, style, `font-display: swap`). All 39 local `.woff2` files and all 13
`assets/fonts/` directories were deleted (each `assets/` folder held nothing else, so it was
removed too where it went empty). The three font files themselves are unchanged — same subset,
same bytes — only their hosting location moved.

**Why:** web-team directive to centralize static asset hosting on Supabase Storage rather than
duplicate the same three files in every module folder. One authoritative copy is easier to update
(a subset/format change now ships from one place) and removes 39 duplicated binaries from the repo.

**Consequences (tradeoff accepted):** the sim **no longer renders correct typography fully
offline on first load** without network access to Supabase — this is the direct reversal of the
old guarantee. `font-display: swap` means there is no hang or blank-text risk: the system-font
fallback paints immediately and the real face swaps in once/if the CDN fetch resolves; on a
network failure the fallback simply stays. A secondary effect: ~10 topics gate first paint on
`document.fonts.ready` (e.g. `graphics_module_1_topic_3_points/main.js`, "*Gated on
document.fonts.ready so the host never reveals us mid-FOUT*") — that promise now settles on a
network round-trip instead of disk. It cannot hang (the promise settles on fetch failure too via
`swap`), but a slow or absent connection now measurably delays first reveal where it previously
never would. No JS was changed to compensate; this is accepted as part of the same tradeoff.
Process note: the initial repo-wide grep for `@font-face`/`assets/fonts`/`.woff2` missed 5
`CLAUDE.md` file-tree references to the old bundled-font layout — caught only by a follow-up full
sweep after the first edit pass. Future doc-wide reversals of a platform-wide rule should budget
for a second grep-and-fix pass before considering the doc sweep complete.
**Status:** Active

**Note (2026-07-31):** The Diploma Engineering Graphics track (`feat/diplomaMod1`) independently
arrived at the same shared-Supabase-host font migration before this ADR reached that branch,
recorded there as its own ADR-082 with a Diploma-only carve-out. That ADR is retired on merge —
its decision was already made here, platform-wide, and this ADR's scope covers the Diploma track
too. See ADR-095 (that track's renumbered founding decision) for where its independent version
used to live.

---

## ADR-087: Show Method's beat template is rewritten to follow Method of Drawing.md's actual draw sequence — outline, then visible/hidden face, then visible/hidden generators, per view, axis last

**Date:** 2026-07-27
**Decision:** ADR-084's 7-beat template (0 XY/X1-Y1 · 1 true-shape view, all visible lines at once
· 2 projectors · 3 the other view + side view, bundled · 4 axis + corner labels, bundled · 5 hidden
dashes, all views at once · 6 dimensions) was audited against the authoritative textbook spec
("Method of Drawing.md", Section 12.6) and found to diverge on every beat but the first and last.
The spec's 5-step sequence (outline → visible base/face → hidden base/face → generators
visible-then-hidden → axis, explicitly LAST) groups by **feature, then visibility**; the shipped
template grouped by **visibility across a whole view**, which is the transpose and cannot be
reached by reordering the existing 7 beats. Replaced with a **15-beat-per-Set** template, applied
per view:

`xy (sheet-wide, ADR-088) → outline(A) → visible face(A) → hidden face(A) → visible
generators(A) → hidden generators(A) → projectors → outline(B) → visible face(B) → hidden
face(B) → visible generators(B) → hidden generators(B) → axis (last, both views) → labels →
dimensions`

Two new edge classifiers were needed to make this representable, added in `meshAnalyzer.js` /
`projectionDrawer.js` (shared with the live 3D pane, not method-only code):

- **Outline** — the front/back straddle test (an edge is on the 2D outline iff its incident faces
  include one facing the observer and one not, or it has only one incident face at all). This is
  NOT `EdgeType.SILHOUETTE` (a purely 3D, orbit-invariant classification) — it is a new per-plane,
  per-view test alongside the existing `visibleInHP/VP/PP`. Outline edges are a strict SUBSET of
  each view's visible edges, so the outline beat and the later visible-face/generator beats
  legitimately redraw the same lines — accepted deliberately, matching how a learner re-traces the
  outline before adding detail, rather than suppressing the overlap.
- **Base vs. generator** — every Module 2 solid is generated upright about local +Y (CLAUDE.md);
  since each Show Method stage's pose matrix is rigid (translate + quaternion + unit scale, no
  shear), an edge is classified by `|dot(normalize(p2−p1), worldAxis)|` against a tolerance:
  ≈0 → base/cap edge, ≈1 (or any non-zero slant) → generator. `worldAxis` is `(0,1,0)` rotated by
  the stage's own quaternion, so the test is correct for every stage without re-deriving per shape.

**Why:** the whole point of Show Method is to teach the textbook's own drawing procedure; a beat
template that groups by the wrong axis cannot demonstrate that procedure regardless of caption
text. The spec's "outermost lines first, axis last" rule (Method of Drawing.md §12.6, restated as
its own rule of thumb) is unambiguous and was being violated on 5 of 7 beats.
**Alternatives rejected:** (a) *Keep 7 beats, reorder only* — rejected, the grouping axis itself is
wrong (visibility-across-view vs. feature-then-visibility), no reorder of the existing beats
reaches the spec sequence. (b) *Merge visible+hidden generators into one beat* (13/Set, 39 clicks)
and (c) *also merge axis+labels* (12/Set, 36 clicks) — both considered to hold the per-Set click
count down; rejected because the target sequence explicitly names "generators [visible/hidden
split]" and folding labels back into the axis beat re-creates the exact divergence (corner labels
welded to the axis beat) this ADR fixes. 15 beats/Set, mitigated by ADR-088's Skip-to-next-Set
control, was accepted as the faithful reading.
**Consequences:** Click cost per full walkthrough rises to `15 × Set count` (30 for a 2-Set
problem, 45 for a 3-Set problem), up from `7 × Set count` under ADR-084. `METHOD_BEAT_COUNT`
(`main.js`) and its hand-duplicated twin `BEAT_COUNT` (`methodController.js`, header note explains
the duplication is deliberate) both become 15 in the same change — they must never drift, or
`goNext`'s beat-boundary math desyncs from `drawMethodSheet`'s gates. The live 3D pane gains the
same outline/base/generator classifiers (shared leaf modules) but its own rendering is
UNCHANGED — colour and line width there still key off `hidden` only, the new `kind` tag is
Show-Method-only consumption for now. Supersedes ADR-084's beat template (§3) specifically; ADR-084's
other pedagogy (per-Set headless pipeline, n-Set side-by-side layout, "Set label only" caption)
is untouched.
**Status:** Active

---

## ADR-088: Show Method drops the Side (PP) view from its walkthrough; the XY reference line becomes one sheet-wide stroke instead of one per Set

**Date:** 2026-07-27
**Decision:** Two layout changes to the Show Method takeover (`drawMethodSheet`, `main.js`),
independent of ADR-087's beat re-sequencing:

1. **Side view removed from the replay.** `showSideViewFlag` — which gated the PP view, its
   generators, and the X1-Y1 reference line inside the method's own sizing/draw functions
   (`drawMethodSheet`, `setMethodFocus`) — is replaced by a Show-Method-local `false` at every one
   of its 5 call sites in those two functions. `drawCompare()`'s own (unrelated) uses of the live
   flag are untouched — the ordinary Compare sheet still shows the side view exactly as before.
   The side view itself is NOT removed from the sim: Step 5 still reveals it live on the 3D pane;
   only its replay inside the Show Method walkthrough is dropped. This shrinks the takeover's
   nominal layout (`blockW` drops its `showSideViewFlag ? GAP + E : 0` term, roughly halving),
   which — per ADR-053's intrinsic-only scale law, unchanged — makes every Set draw at roughly 2×
   the on-screen size. `projectSet`'s per-Set PP harvest and `z0` computation are left in place
   (harmless, still feed the live 3D pane's own projection); only the METHOD REPLAY's consumption
   of them is dropped.
2. **One sheet-wide XY line, not one per Set.** ADR-084's Consequences committed to "each Set draws
   its own XY at sheetY=0 … offset by that Set's dx" — correct under the n-Set side-by-side layout,
   but redundant: `drawMethodSheet`'s own `project()` maps sheet-y through an anchor at `y=0` for
   every Set (`dx` only ever perturbs sheet-x), so every Set's XY line was already landing on the
   identical screen row. The per-Set loop is replaced with one stroke computed once, before the
   per-Set loop runs, spanning the full intrinsic row width
   (`[blockLocalCenterX − blockW/2 … (n−1)(blockW+STAGE_GAP) + blockLocalCenterX + blockW/2]` —
   `E`/`GAP`/Set-count only, no live bbox). This is STRICTLY TIGHTER than ADR-053's existing
   invariant, not a new exception: the line's length no longer depends on which views have been
   drawn so far, only on the same intrinsic constants the block layout itself already uses.
   X1-Y1 needed no equivalent change — it retires along with the side view (point 1).

**Why:** point 1 removes the last thing the Show Method surface drew that the spec (Method of
Drawing.md) never asked for and that ADR-087's beat budget can't afford per-view. Point 2 corrects
a redundant per-Set computation that was never actually producing per-Set output — the "own XY per
Set" framing in ADR-084 assumed a visual outcome that the shared `anchorSY=0` anchor was already
preventing.
**Alternatives rejected:** (a) *Keep the side view, absorb it into ADR-087's per-view beat
sequence* (adds a third view's worth of outline/face/generator beats — 15 beats/Set becomes ~21) —
rejected as disproportionate for a view the spec's Section 12.5/12.6 change-of-position procedure
doesn't itself dimension. (b) *Union-of-bboxes XY span instead of intrinsic* — legal under ADR-056
(position analytic, length may track drawn content) but rejected as strictly worse: the intrinsic
span is simpler, already-available, and doesn't grow/shrink beat-to-beat as views appear.
**Consequences:** Marks ADR-084's Consequences sentence "each Set draws its own XY … offset by that
Set's dx" (`DECISIONS.md`, ADR-084) and ADR-085's "retained verbatim" bullet's implicit inclusion
of the per-Set X1-Y1 line as **superseded** for Show Method specifically — ADR-084's n-Set side-by-
side layout itself (scale-lock, anchor, captions) is untouched. ADR-053/054's intrinsic-only law is
unchanged and, per point 2, is now honoured by one more surface (the XY line) than before.
**Status:** Active

---

## ADR-089: Show Method drops its dimensions beat and the "(N of 45)" step counter

**Date:** 2026-07-28
**Decision:** Two changes to the takeover, found while diagnosing a report that a live desktop
session showed almost no solid geometry at beat 42/45 of a both-planes walkthrough — the actual
root cause turned out to be that the session "verifying" ADR-087/088 as working had run inside an
MCP headless tab (`document.hidden === true`, 0 native `requestAnimationFrame` callbacks measured
in 600ms), so `queueMethodRedraw()`'s plain-rAF repaint had never actually executed; the "verified"
report was never watching real output. Re-verifying with a synchronous frame-pump (`requestAnimationFrame`
replaced with a manually-flushed queue) showed the beat pipeline itself — `projectSet`'s harvest,
the beat gates in `drawMethodSheet` — drawing correctly. Two real defects surfaced alongside that
false-confidence finding, fixed here:
1. **Dimensions beat removed** (was beat 14/Set, `showDims`/`strokeMethodLines(...hpDimLines...)`
   block in `drawMethodSheet`). Show Method is the construction-method walkthrough; BIS Type-B
   dimensioning is a separate, already-shipped concern behind the live pane's own "Show dimensions"
   toggle (ADR-041) — bundling it into the replay taught the wrong lesson (that dimensioning is
   part of *drawing method*) and cost a beat on every Set. `projectSet`'s `hpDimLines/vpDimLines/
   hpDimTris/vpDimTris/hpDimLabels/vpDimLabels` harvest, and the now-single-caller
   `harvestTriGroup`/`harvestLabelGroup` helpers, are deleted with it — nothing else read them.
   `METHOD_BEAT_COUNT` (`main.js`) and its hand-duplicated twin `BEAT_COUNT` (`methodController.js`)
   both drop 15 → 14; ADR-087's other 13 beats and their gate thresholds are untouched (the removed
   beat was strictly last).
2. **Step counter text removed from the Next button.** `methodController.js`'s `renderProgress()`
   set `nextBtn.textContent` to `` `Next step (${flatIndex()+1} of ${totalBeats()})` ``; now just
   `'Next step'` (`'Done'` on the last beat, unchanged). Matches `RULES.md`'s platform-wide
   step-counter-weight guidance — the count added noise without adding orientation the Set-N focus
   chips don't already give.

**Why:** both were in-scope, low-risk cleanups found in the same investigation, not separate asks
requiring their own audit — the counter was pure display logic and the dimensions beat's removal
doesn't change any other gate's numbering (it was already last).
**Alternatives rejected:** *Keep the dimensions beat but gate it behind a per-Set toggle* —
rejected as unnecessary complexity for content that already has a dedicated, discoverable control
on the live pane.
**Consequences:** Click budget per full walkthrough drops to `14 × Set count` (28/42 for 2-/3-Set
problems, down from 30/45). See ADR-090 for the further, pose-dependent reduction from auto-skipping
empty beats.
**Status:** Active

---

## ADR-090: Show Method's Next/Back skip beats that add no mark to the sheet

**Date:** 2026-07-28
**Decision:** Same investigation as ADR-089 surfaced a second, independently real defect: for a
pose where a given view has no edge of a particular hidden/generator combination (e.g. a prism
square-on to a plane casts no dashed generator there), that beat's gate in `drawMethodSheet` passes
but draws zero new segments — the repaint is a byte-for-byte repeat of the previous frame. Measured
directly (pixel + draw-call diff across a full 45-beat walkthrough, pre-ADR-089): 3 of 45 beats
were exactly identical to the one before. This is what "Next sometimes does nothing" was — not a
stuck click or a desynced counter, a genuine no-op repaint the learner has no way to distinguish
from a broken button.

Fix: `projectSet()` (`main.js`) now computes a `contentBeats: boolean[14]` table per Set at
`begin()` time — one entry per beat index, `true` iff that beat's own harvested array (the same
`data.hp/vp/hpOutline/vpOutline` arrays `drawMethodSheet` itself reads, filtered by the same
`hidden`/`kind` split as `strokeMethodLines`) is non-empty; beat 0 (the Set's caption reveal) is
always `true`. Exposed read-only via `sim.method.hasContent(set, beat)`. `methodController.js`'s
`goNext`/`goBack` loop past any beat this reports `false` for (both directions, for symmetry — a
one-directional skip would make Back land back on the beat Next just skipped past, the same
"nothing happened" complaint mirrored).
**Why:** computing content-presence from the SAME harvested arrays the draw call reads (rather than
e.g. re-simulating `drawMethodSheet`'s gate logic separately) is what keeps this from drifting out
of sync with what the sheet actually draws — one data source, two consumers.
**Alternatives rejected:** *Detect emptiness by diffing consecutive canvas frames at runtime* —
rejected, requires a real paint to have already happened (expensive, and reintroduces exactly the
document.hidden fragility this investigation started from) where the harvested-array check is free
and available the instant `begin()` builds `methodSets`.
**Consequences:** Click budget is now pose-dependent (≤ `14 × Set count`, less whenever a Set has
no hidden geometry on some sub-beat). `sets()`'s existing `reached` semantics (ADR-084 Decision 7)
are untouched — a Set is "reached" the moment its first beat draws, regardless of how many of its
interior beats get skipped.
**Status:** Superseded by ADR-098 — this ADR's own-array-emptiness test still missed a beat that
is non-empty but redraws lines an earlier beat already put on the sheet; ADR-098 replaces it with
a mark-novelty test in sheet-local 2D. The skip *mechanism* this ADR introduced (`goNext`/`goBack`
loop past `hasVisibleContent(set, beat) === false`) is unchanged and still active.

---

## ADR-091: Show Method's lines stroke in one at a time, sequentially, per beat

**Date:** 2026-07-28
**Decision:** ADR-087/088 draw each beat's whole batch of lines in one shot — correct data, but it
pops in as a static group rather than reading as construction. This was the actual pedagogical
requirement from when the feature was first scoped: within a beat, each individual stroked line
draws in over ~0.2-0.4s, one after another, before the beat is considered finished.

`drawMethodSheet` (`main.js`) already iterates every beat's harvested segments as a flat sequence
of atomic `moveTo→lineTo→stroke()` calls (`strokeMethodLines`'s own `k`-loop, the projector loop,
`strokeAxisInto`'s two passes) — that iteration order IS the animation-unit granularity; no new
data shape was needed; `strokeMethodLines` gained an optional `reveal: {index, t}` param (draw
units `0..index-1` in full, unit `index` lerped from its start point by `t`, stop — omitted, this
is exactly the old full-draw behaviour, so every non-animating call site is provably unchanged).

Only ONE beat can ever be mid-reveal — the current frontier (`methodSet`, `methodBeat`); everything
behind it already settled, everything ahead hasn't been reached — so a flat set of module vars
(`methodAnimBeat/-Index/-UnitT`) carries the state, no per-beat map. `setMethodProgress` compares
the new flat beat-index to the old: forward (Next) starts a fresh reveal (`startMethodBeatAnim`,
one `tween()` spanning the whole beat linearly across units so each gets an equal slice, `easeDraw`
reshaping each unit's own reveal — same curve `setProjectionsVisible`'s draw-on already uses);
anything else (Back, skip, focus jump) snaps straight to fully-drawn, matching how those already
behaved. Clicking Next again mid-reveal calls `stopMethodBeatAnim()` first — cancels the tween,
sets `methodAnimBeat = -1` — so the in-flight beat's remaining units render in full on the very
next paint, then the new beat's reveal starts; Next is never disabled while a beat animates.

**Reused, not reinvented:** the tween/tick primitives are anim.js's existing shared ones (the same
helper the live pane's Step 4/5/6 draw-on reveals already use). But `animate()`'s own `tickTweens`
call is paused for Show Method's entire lifetime (ADR-085 pauses the sim loop — the 3D scene is
fully covered) — reusing `active`'s shared Set is still safe (nothing else can be tweening while
paused) but nothing would ever call `tick()` to drain it. `main.js` therefore pumps its own,
independent `requestAnimationFrame` loop (`methodAnimFrame`) only while a beat is actually
animating, started by `startMethodBeatAnim` and torn down by `stopMethodBeatAnim` (also called from
`teardownShowMethod`, so Exit/Escape mid-reveal leaves nothing running).
**Why:** an opacity-fade "draw-on" (the live pane's own cheaper substitute, see
`setProjectionsVisible`'s header) was rejected here — Show Method draws on a plain Canvas2D sheet,
where a true per-line length reveal is a lerp of two numbers, not the "per-segment dash trickery"
LineSegments2/LineMaterial would need; there was no reason to take the cheaper, worse-reading
option when the real one was this inexpensive.
**Verification note:** this environment's MCP browser tab cannot render a genuinely-visible
foreground tab (`document.hidden === true`, confirmed again on a fresh tab — see ADR-089); native
`requestAnimationFrame` here fires once as an apparent input-driven catch-up frame and then goes
silent, so real elapsed-time playback could not be observed end-to-end. What WAS verified natively
(no synthetic pump): opening Show Method, a rapid 37-click Next walkthrough to "Done" with zero
gaps between clicks (the most aggressive possible exercise of the cancel-and-restart path), and a
5-click Back walk, all with zero console errors and correct button/state transitions throughout.
The actual ~0.2-0.4s-per-line visual timing needs confirming in a real, foregrounded desktop
browser tab — flagged explicitly rather than claimed.
**Alternatives rejected:** *Group-opacity fade-in per beat* (matches the live pane's existing
draw-on) — rejected, reads as a beat "appearing," not "being drawn," which is exactly what this ADR
exists to fix. *A per-beat map of reveal state* — rejected, over-engineered: only the current
frontier beat is ever reachable in a mid-reveal state by construction, so a single flat set of vars
sufficed and is simpler to reason about than a Map that could only ever hold one entry.
**Consequences:** a learner who waits watches each beat's lines draw in one at a time; a learner who
clicks through quickly sees the same instant-advance experience as before (Next was never gated on
animation completing). `methodBeatUnitCount`/`methodViewSplit` (`main.js`) are new pure helpers a
third call site needed — `methodViewSplit` is shared with `drawMethodSheet`'s own viewA/viewB
construction; `methodContentBeats` (ADR-090) keeps its own, pre-existing independent copy of the
same split, left untouched rather than risking already-verified beat-skip logic for a style-only
refactor.
**Status:** Active — visual timing pending the user's own foregrounded-tab confirmation.

## ADR-092: Show Method's cross-Set derivation lines merge into the existing "projectors" beat

**Date:** 2026-07-28
**Decision:** The audited plan for cross-Set projection/derivation lines (Sets 2/3 shown as
*derived* from the previous Set, not appearing fully-formed) proposed a new beat inserted before
each subsequent Set's own outline/face/generator sequence. Corrected before implementation: view A
is already a direct rotated copy the moment it's traced, so there is nothing to derive before it —
the real derivation moment is exactly where the existing beat-6 "projectors" beat already sits
(after view A, before view B). Merged instead of adding a beat: `BEAT_COUNT`/`METHOD_BEAT_COUNT`
and `methodController.js` are unchanged; Set 0's projectors beat is untouched (no previous Set to
draw from), and Sets 1+ gain additional content in that SAME beat — the existing within-Set
vertical projector line, plus (i>0) a new horizontal line from the previous Set's untouched-view
point to this Set's own (`drawMethodSheet`, `main.js`).
**Why:** which view is "active" (view A, just resolved) vs. "untouched" (view B, carried over) at
each transition is already fully derivable from `methodViewSplit`'s existing `firstIsHP`/viewA/
viewB split (built from `set.trueShape`, itself from `trueShapeForPlane`) — no new per-problem
field was needed. And every Set's harvested data (`ann.labels`, world-space) is already retained
for the walkthrough's entire lifetime (`methodSets = plans.map(projectSet)` at `begin()`), so the
previous Set's points are already sitting in memory when the current Set's beat 6 runs — nothing
to restructure. Merging into the existing beat was strictly smaller than a new one and needed
neither change.
**Correspondence guard:** the line-pairing assumes `set.ann.labels[k]` and `prevSet.ann.labels[k]`
name the same vertex (same corner, same label order) across Sets — true because both are built by
the same `planAnnotations` call against the same `currentMesh.geometry`, but asserted rather than
assumed: a `console.warn` fires if the two Sets' label counts ever differ.
**Alternatives rejected:** *A new beat before each Set's own sequence* (the original audited
plan) — rejected once the merge was seen to need no new beat index, no `BEAT_COUNT` bump, and no
`methodController.js` change, all of which the new-beat plan would have required. *Restructuring
`methodSets` from `.map` to a loop* (considered mid-audit, in case draw-time needed the previous
Set's data before it existed) — rejected/retracted: `.map` already builds every Set before any
paint call runs, so the data is always available by the time beat 6 draws.
**Consequences:** the derivation line is not guaranteed pixel-flat by construction — see ADR-093,
which found (and fixed) that the both-planes Set2→Set3 transition initially drew visibly diagonal
because of a pose-model property, not a bug in this beat's drawing code.
**Status:** Active.

## ADR-093: Show Method's both-planes Set 3 computes its pose sequentially, not as one combined Euler

**Date:** 2026-07-28
**Decision:** ADR-092's cross-Set derivation line drew visibly diagonal for the both-planes
Set2→Set3 transition (verified on `sqpyr-both`: label heights diverged up to 0.866 units). Root
cause, confirmed analytically before any code changed: `planMethodStages`' Set-3 pose used the
combined-Euler shortcut `overrides: {}` → the SAME single Euler (`iShape.js` `applyShapeTransform`,
order `'ZXY'`) the live solid uses, computed FROM THE ORIGINAL UPRIGHT SHAPE with both angles set
at once. Because order `'ZXY'` applies the VP (Z) lean before the HP (X) tilt, adding the second
angle re-derives the whole pose from scratch rather than building on Set 2's own — a genuine
structural property of the "manual dual-angle decomposition" (self-flagged in that function's own
comment as an accepted simplification), not floating-point noise.
Added `projectSequentialBothPlanesPose` (`main.js`), used ONLY when `planMethodStages` attaches a
new `sequential: {firstPlane, firstAngle, secondAngle}` marker to Set 3's plan (both-planes tier):
it builds Set 2's pose the normal way (the same `applyShapeTransform` call everyone else uses,
called here read-only), then yaws that quaternion about world-Y by the second angle — reproducing
the real textbook auxiliary-view technique (tip to the first plane, THEN turn the already-tipped
solid about the true vertical to bring it true to the second; turning is a yaw about world-up, not
a second lean).
**Why this is provably right, not just visually close:** a rotation about world Y can only ever mix
a point's x/z — it leaves y (height) exactly alone, for every vertex, always (not just the axis).
`computeSeating`'s re-seat is driven by `minY`, itself untouched by that same yaw. So Set 3's
labeled vertices come out with world-Y bit-for-bit identical to Set 2's, which is exactly what a
flat derivation line needs. Verified on both existing both-planes problems: `sqpyr-both` (equal
30°/30° angles) — every label's height diff exactly `0`; `hexprism-both` (unequal 20°/30°,
12 labels incl. top-hexagon primes) — every diff `~4.4e-16` (float epsilon). Screenshots of a live
both-planes walkthrough confirm both the Set0→Set1 and Set1→Set2 (= UI "Set 2→Set 3") connector
lines now draw fully horizontal.
**Self-contained, as scoped:** `iShape.js`, `computeEffectiveAngles`, and the live solid's own pose
(`rebuild()`) are untouched — `projectSequentialBothPlanesPose` only reads `currentShapeData`/
`currentMesh.geometry` the same read-only way `projectSetPose`'s existing branch already does.
**Alternatives rejected:** *Solve for the exact yaw angle that reproduces the target VP angle via
auxiliary-view trigonometry* — rejected: only has a closed form for a vertex lying exactly on the
solid's central axis (x₀=z₀=0), and no closed form in general (the derivation showed no real
solution exists for some angle pairs under that model) — over-engineered for what this beat needs,
which is height-preserving flatness, not a re-derivation of true-angle drafting trigonometry.
Any yaw angle already preserves height exactly (proven above), so reusing the second stage's own
angle magnitude keeps the label ("Axis X° to the HP and Y° to the VP") meaningful without solving
anything new. *Reordering the live Euler to apply Z last* (`iShape.js` order change) — rejected:
still a Z-axis operation, which mixes x/y regardless of ordering, so it would NOT have fixed
flatness — the fix had to be a different axis (Y), not a different order of the same axes; also
would have touched the live solid's protected rotation math, which was out of scope.
**Consequences:** Set 3's rendered pose for both-planes problems is now geometrically distinct from
"the live solid's exact final orientation" (the two are mathematically different compositions of
the same two angles) — acceptable because Show Method is a construction-method walkthrough, not a
byte-for-byte replay of the live pane's pose, and Set 3's own labeled angles are unchanged.
**Status:** Active.

---

## ADR-094: Show Method's Next/Done boundary becomes content-aware; a left-active Set-N chip no longer strands new beats off-screen; the duplicated beat count is asserted at init; the Skip button's hide/disable actually match its own doc comment; every beat gets a plain-language caption

**Date:** 2026-07-28
**Decision:** A follow-up audit of ADR-089/ADR-090's "Next sometimes does nothing" fix found the
fix was incomplete, plus a separate, unrelated cause of the same symptom, plus documentation that
no longer matched the code it described. Five changes, all confined to `src/methodController.js`
+ `main.js` (Show Method has no clone anywhere else in the repo — confirmed by a repo-wide sweep —
so none of this needs backporting):
1. **Content-aware end-of-walkthrough** (`methodController.js`). ADR-090's `hasVisibleContent`
   skip loop in `goNext`/`goBack` was still bounded by the positional `totalBeats() - 1` — if the
   very last beat (13, labels) of the very last Set drew nothing for a given pose, the loop exited
   there anyway (guard `flatIndex() < totalBeats() - 1`) and the click repainted an identical
   frame, reproducing ADR-090's own defect at the one beat a learner is most likely to remember.
   Worse, `renderProgress`'s `isLast` test was the same positional check, so "Done" could arrive a
   full click late (relabel-then-exit, reading as two separate malfunctions). Added
   `computeFinalIndex()`: scans backward from `totalBeats() - 1` once per run (`contentBeats` is
   fixed at `begin()` time, so it can't change mid-run) for the true last content-bearing flat
   index, using the exact same `hasVisibleContent` the skip loops already trust. `goNext`'s entry
   guard/loop and `renderProgress`'s `isLast` now compare against this instead.
2. **Focus-chip strand** (`methodController.js`). Independent of the above and not previously
   documented as a defect: `focusSet` (main.js) is deliberately decoupled from walkthrough
   progress (a Set-N chip only moves the camera, never `methodSet`/`methodBeat` — ADR-084
   Decision 7), but nothing cleared it when Next/Back/Skip crossed into a *different* Set. A
   student who zoomed into Set 2's chip and kept clicking Next would have every subsequent mark
   drawn into Set 3 while the camera stayed locked on Set 2's block — Next visibly "doing
   nothing" with none of ADR-090's beat-emptiness logic involved. `clearFocusChip()` now clears
   the active chip's `is-active`/`aria-pressed` state and calls `sim.method.setFocus(null)`
   (re-framing to the whole row) whenever `goNext`/`goBack` land in a different Set than they
   started in, and unconditionally in `goSkipSet` (which always crosses a Set boundary). Chosen
   over the alternative of re-targeting the chip to follow the walkthrough — clearing is less
   surprising, and preserves Decision 7's "chips never move the sequence" by touching only
   `setFocus`.
3. **Runtime-asserted beat count** (`methodController.js`, `main.js`). `BEAT_COUNT`
   (`methodController.js`) and `METHOD_BEAT_COUNT` (`main.js`) are hand-duplicated by design
   (ADR-087) and have already moved once together (15 → 14, ADR-089) on a comment-only invariant
   ("the two constants MUST move together"). If they ever drift, `main.js`'s `setMethodProgress`
   clamp silently swallows the excess beat while this controller's own `flatIndex()` keeps
   counting past it — reproducing "Next does nothing" wholesale, with no error anywhere, the
   worst-case failure mode in the whole system. `main.js`'s `sim.method` surface now exposes
   `beatCount: METHOD_BEAT_COUNT`; `initMethodController` compares it against its own `BEAT_COUNT`
   at init and, on mismatch, logs a `console.error` naming both values and degrades to the same
   no-op return the missing-markup guard already uses, rather than silently limping along.
4. **Skip button hide/disable parity** (`methodController.js`, `index.html`). `index.html`'s own
   comment on `#method-skip-set` said the button is "Hidden entirely on ... the walkthrough's last
   Set" — `renderProgress` only ever set `.disabled`, never `.hidden`, leaving a visible, inert
   button for the entire final Set (a third to a half of a full walkthrough). `renderProgress` now
   sets both `skipBtn.hidden` and `skipBtn.disabled` from the same `noSetToSkipTo` condition; the
   comment's stray "a Set's last beat" clause (never actually implemented) is dropped so the doc
   describes only the one condition that is.
5. **Per-beat captions** (`main.js`, `methodController.js`, `index.html`). Post-ADR-085/ADR-089
   the only progress signal left was Set chips flipping enabled — inside a 14-beat Set there was
   no way to tell what a beat had just drawn, and a skipped beat (ADR-090) was indistinguishable
   from one that never existed, discarding real teaching content ("this view has no dashed
   generators because the base sits square-on to the plane"). Added `methodBeatLabel(set, beat)`
   (`main.js`, beside `methodContentBeats`, reusing its exact `firstIsHP` split so a beat's caption
   never disagrees with its own content gate) returning plain English ("Outline of the top view",
   "Hidden face lines — front view", "Projectors linking the two views") with beat 0 matching the
   Set's own canvas caption verbatim [SUPERSEDED by ADR-098: beat 0 now reads "Starting Set N" —
   verbatim duplication of the canvas caption turned out to be the second half of a layout defect,
   see ADR-098 §2]. Exposed as `sim.method.beatLabel`. `methodController.js`'s new `syncCaption()`
   pushes it into a new visible `#method-caption` pill (`index.html`, wrapped with `.method-bar`
   inside a new `.method-controls` flex-column, `aria-hidden="true"`) [SUPERSEDED by ADR-098: the
   caption moved out of `.method-controls` to its own top-of-view title row — stacking it above
   the pill still collided with the canvas' own Set caption at the same screen row] AND the
   platform's one `#sim-status` live region via the existing `sim.announce`, on every
   Next/Back/Skip and once on `start()`.
**Why:** all five were found in one investigation and are individually small, but bundled here
rather than five ADRs because they share one root cause category — the gap between what ADR-089/
ADR-090 intended ("every click visibly changes the sheet, orientation comes from chips not a
counter") and what was actually wired.
**Alternatives rejected:** *Numeric or tick-mark in-Set progress indicator* (would restore what
ADR-089 Decision 2 deliberately removed, citing `RULES.md`'s step-counter-weight guidance; raised
to the user as an explicit question before this pass began and confirmed rejected — captions
carry the orientation load instead, no counter, no tick row). *Announce every auto-skipped beat
individually* (cheaper than full captions, but leaves the beats a student does land on
unlabelled — captions subsume this). *Give the projectors beat (6) its own content predicate
independent of the labels beat (13)* — deferred; both currently gate on `hasLabels` and no shipped
problem is confirmed to reach zero labels, so this is unconfirmed dead-code risk, not a live
defect.
**Consequences:** "Done" now always lands on a beat that actually drew something; a Set-N chip
click can no longer strand the walkthrough off-screen; a `BEAT_COUNT`/`METHOD_BEAT_COUNT`
mismatch now fails loudly at init instead of silently corrupting every subsequent click; the Skip
button's visibility matches its own doc comment; every beat narrates itself in plain language with
no step count reintroduced.
**Status:** Active.

---

## ADR-095: A new curriculum track ("Diploma Engineering Graphics") shares this repo's root docs; its Module 1 ("Geometrical Constructions") is namespaced `graphics_diploma_module_1_topic_1_<N>_<slug>` on a 2D SVG/Canvas orchestrator

**Date:** 2026-07-26
**Decision:** A new curriculum track — **"Diploma Engineering Graphics" [PLACEHOLDER — confirm
exact syllabus/issuing-body name before this track's first topic ships]** — shares this repo's
existing root docs (`ARCHITECTURE.md`, `DECISIONS.md`, `RULES.md`, `PRODUCT.md`, `DESIGN.md`) and
continues the same ADR sequence rather than forking Case-C-style. Its Module 1, "Geometrical
Constructions," is namespaced `graphics_diploma_module_1_topic_1_<N>_<slug>` to avoid colliding with
the current syllabus's existing Module 1 (`graphics_module_1_topic_*` — foundations: planes, line
types, dimensioning, quadrants, first-angle, points, lines). The numbering scheme (module.subtopic,
e.g. `topic_1_1` = subtopic "1.1") is **final**; the six provisional subtopics — 1.1
`basic_constructions`, 1.2 `tangent_arcs`, 1.3 `tangent_lines`, 1.4 `regular_polygons`, 1.5
`polygon_circle_relations`, 1.6 `ogee_curves` — and their final count remain **provisional pending
topic-level scoping**. None of these subtopics involve 3D solid geometry, so this Module adopts
Module 2's orchestrator discipline (single `main.js`, no-cross-import leaves, one `rebuild()` funnel,
`window.simAPI`) over a 2D SVG/Canvas renderer instead of Three.js.
**Why:** RULES.md §1.11 (sourced from ADR-025) requires a subject that fits neither the Module 2
(3D) nor Module 1 (2D-from-3D projection) template cleanly to get its own ADR before work starts —
compass-and-straightedge plane-geometry construction is flat 2D from the outset, not a projection of
3D geometry, so it fits neither. A repo-wide check for "syllabus"/"diploma"/"curriculum" found no
prior second-track concept: every existing "syllabus" reference (RULES.md §6.21/§6.22, the Module 3
problem-exclusion ADRs) is a problem-set rule *inside* the single track this repo already ships —
`Module1/CLAUDE.md` names it explicitly ("Simatrix Engineering Graphics Platform · KTU B.Tech
Syllabus"). Diploma Engineering Graphics is genuinely new territory, not an extension of that track.
Reusing the orchestrator *pattern* rather than Module 1's shared-`engine.js` pattern is grounded in
ADR-007's own text: the orchestrator (one `main.js` owning state/`rebuild()`, leaves that don't
cross-import) is a structural/organizational discipline, not something ADR-007 or ADR-033 ties to
Three.js specifically — every existing instance happens to render 3D, but nothing in either ADR
requires it to.
**Alternatives rejected:** (a) *Reusing `module_1` unprefixed* — rejected: direct folder-name
collision with the current syllabus's existing Module 1. (b) *Forking into Case-C-style own root
docs (a new local `DECISIONS.md` starting at ADR-001, per MODULE-STARTER.md §5.4)* — rejected: the
explicit choice here is to share root docs and continue this ADR sequence — same discipline
(Engineering Graphics), a different syllabus track, not a foreign discipline in the Case C sense.
(c) *Treating this as a lesson-add to the current syllabus's existing Module 1* — rejected: a
different syllabus entirely, with its own sequencing and numbering, not an extension of the current
one.
**Consequences:** Cite ADR-025 as **invoked by** (not superseded) — its Module-1-vs-Module-2
heuristic is unchanged; this adds a third case alongside it, for a 2D-non-solids subject outside the
current syllabus. The repeated `<M>` in `graphics_diploma_module_<M>_topic_<M>_<N>_<slug>` is
**deliberate, not a typo** — it encodes the source syllabus's own decimal module.subtopic numbering
(e.g. "1.4" → `topic_1_4`); a future contributor must not "fix" it to `topic_<N>` alone. Descriptively
only: MODULE-STARTER.md's Case A/B/C table (Section 2) has no row for "same discipline, different
syllabus track, shared root docs" — this ADR is the first instance of that pattern; a future ADR may
formalize a Case D. Future module numbering for this track, if it grows beyond Module 1, is left
fully open pending a future ADR if/when that happens. The exact syllabus/issuing-body name remains an
**open placeholder until confirmed** — see the Decision field.
**Status:** Active.

---

## ADR-096: "Misc Curves" (Roulettes / Spiral Curves / Helix) is Diploma Module 1 Topic 2, not a new module

**Date:** 2026-07-28
**Decision:** Misc Curves — roulettes, spiral curves, helix — is **Diploma Module 1, Topic 2**, sitting
beside Topic 1 ("Geometrical Constructions", ADR-095) inside the same module. Namespaced per ADR-095's
established `graphics_diploma_module_<M>_topic_<M>_<N>_<slug>` convention:
`graphics_diploma_module_1_topic_2_1_roulettes`, `graphics_diploma_module_1_topic_2_2_spiral_curves`,
`graphics_diploma_module_1_topic_2_3_helix`.
**Why:** These three curve families belong to the same course module as Geometrical Constructions in
the source syllabus — the module boundary is the syllabus's own, not this repo's to redraw. The topic
index (`topic_2_*` vs. `topic_1_*`) is sufficient to disambiguate them without minting a new module
number.
**Alternatives rejected:** *New Module 2 for this track* — rejected as premature: nothing yet confirms
the source syllabus actually draws a module boundary here rather than a topic boundary within Module 1;
inventing a second module number ahead of that confirmation risks the same kind of renumbering churn
ADR-095 was written to avoid.
**Consequences:** Invokes ADR-095, does not supersede it — resolves ADR-095's own open note ("future
module numbering for this track... left fully open pending a future ADR") by settling that this
particular growth (Misc Curves) stays inside Module 1 as Topic 2, not a new module. ADR-095's provisional
six-subtopic list for Topic 1 (1.1-1.6) is unaffected. Docs only — no topic folders created yet.
**Status:** Active.

---

## ADR-097: Helix (Diploma Module 1 Topic 2.3) is drawn as a first-angle top+front two-view construction, not a Three.js 3D orbit view

**Date:** 2026-07-29
**Decision:** Despite being a genuine 3D space curve, the cylindrical helix, conical helix, and
helical spring (Topic 2.3) are built on the same 2D SVG orchestrator every other topic in this
track uses — a linked top-view (circumferential position) + front-view (axial advance) pair,
first-angle aligned per this platform's own convention (RULES.md §4's citation: "Top/Front/Side
are cast to the object's top, back, and left respectively (first-angle)"), matching Example
7.11's own textbook method exactly. The underlying point geometry is genuinely 3D-parametric
(`x = r·cosθ, y = ±r·sinθ, z = pitch·θ/2π`, with `r` constant for the cylindrical case and
linearly tapering for the conical case) — only the *rendering* is two orthographic projections of
that curve, the same relationship every projection-drawing subject already has between a 3D
object and its 2D sheet; it is not a flattened single-view stand-in.
**Why:** This tests ADR-095's premise explicitly rather than silently assuming it still holds.
ADR-095 chose the 2D SVG orchestrator for the whole Module because "none of its subtopics involve
3D solid geometry" — true of how a helix is *drawn* in this construction, but not fully true of
what a helix *is* (a genuine 3D space curve), so the premise deserved a real check at the one
topic that stresses it, not a silent pass-through. The two-view method is not a compromise forced
by that constraint: it is the source textbook's own correct, standard technique for teaching this
exact curve, and matches what "Engineering Graphics" as a discipline actually teaches — reading
and producing linked orthographic views of a 3D form, not orbiting a live 3D model of it.
**Alternatives rejected:** *A true 3D Three.js orbit-camera view on Module 2's orchestrator* —
rejected: would be the only Three.js dependency anywhere in the Diploma track (a CDN import map,
the full disposal-contract/rebuild pipeline, WebGL context management, keyboard-operable orbit
controls — none of which the other fifteen topics in this track need), requires its own RULES
§1.11/ADR-025 template-choice ADR, and would likely still need the *same* 2D top+front
construction built alongside it to actually teach Example 7.11's drawing procedure — an addition
to the 2D build's scope, not a replacement for it.
**Consequences:** Invokes ADR-095 (not superseded) — the Module's 2D-orchestrator choice stands,
now on record as having been re-examined at its hardest test case rather than merely inherited by
topic-numbering momentum. `constructions.js`'s helix math is shared 3D-parametric geometry
projected into two SVG panes by one shared layout function, not duplicated per-view logic.
**Status:** Active.

**Addendum (2026-08-05): Reversed for Diploma Module 2 Topic 1.1 only.** The original decision
(Diploma track stays 2D-only, no Three.js orbit view) is explicitly overridden for
`graphics_diploma_module_2_topic_1_1_development_of_surfaces`. Reasoning: Development of Surfaces
is fundamentally a 3D-solid-unrolled-to-2D subject — unlike the helix case this ADR was written
for, seeing the actual solid before its flattened pattern is core to the pedagogy, not an optional
enhancement. This addendum does not reopen this ADR for any other Diploma topic; each future case
is judged on its own subject matter, per this ADR's own per-topic-ADR requirement. See ADR-112's
own addendum for the implementation this reversal produced.

---

## ADR-098: Show Method's beat-emptiness test becomes mark-novelty in sheet-local 2D; the per-beat caption moves to a top-of-view title, out of the canvas-caption's own space; the nav pill's corner radius is made concentric with its buttons; the Set-N chip pill is re-anchored to clear the new title row

**Date:** 2026-08-01
**Decision:** Three defects survived ADR-089/090/094's pass on Show Method (Module 2), found in
one audit:
1. **Redundant click-stops.** ADR-090's `methodContentBeats` (`main.js`) asked only "is this
   beat's own harvested array non-empty" — too weak. A beat can be non-empty and still redraw
   exactly what an earlier beat already put on the sheet: a Set with no inclination (Set 1,
   "Simple position") shows its top view's outline beat and visible-face beat tracing the
   identical square, and its vertical generators flattening to points in that same view. Four
   clicks, one visible mark. Fixed by replacing the per-array-emptiness test with a mark-novelty
   one: each beat's segments are flattened with the SAME sheet-local affine map
   `drawMethodSheet` uses (`methodFlattenHP`/`methodFlattenVP`, `main.js`), quantized at `1e-3`
   (the same weld tolerance `meshAnalyzer.js` uses), order-normalized (`A→B === B→A`), and
   plane-prefixed (HP and VP both flatten `u = -z`, so an unprefixed key would false-match a
   top-view line against a coincidentally-aligned front-view one). A beat is content-bearing iff
   at least one of its keys was not already in the accumulated set (`methodSegmentKeys`,
   rewritten `methodContentBeats`, `main.js`). A degenerate segment (both endpoints quantize to
   the same point — a generator viewed end-on) contributes no key at all, matching what
   `strokeMethodLines` actually paints. Beats 6 (projectors) and 13 (labels) stay undeduped
   (dashed construction lines and text, neither ever meaningfully coincides with view geometry);
   beat 12 (axis) stays undeduped against view geometry — a different colour/dash is a genuine
   new mark even collinear with a generator — but still reads `false` when truly degenerate in
   BOTH flattens, so it doesn't reproduce this exact defect at the beat drawn last. ADR-087's
   deliberate outline/visible-face overlap is unaffected — `drawMethodSheet`'s gates,
   `strokeMethodLines`, and the ADR-091 reveal animation are untouched; a skipped beat's lines
   still paint in full within whichever beat absorbed its click. Verified end-to-end: a scripted
   Next walkthrough on an upright-then-30°-HP-inclined cube produced zero identical
   before/after canvas frames across all 14 content-bearing clicks (5 skipped of Set 1's 14
   beats, 5 skipped of Set 2's), and the mirrored Back walk retraced the same beats with zero
   no-ops in the reverse direction too.
2. **Caption collision + duplication.** The per-beat step description (`#method-caption`) lived
   inside `.method-controls`, stacked directly above the nav pill (ADR-094) — at the same screen
   row `drawMethodSheet` paints each Set's own canvas caption ("Set N — <label>") under its
   block, so the canvas caption rendered half-behind the pill. Separately, beat 0's step
   description returned the Set caption verbatim (`Set ${set+1} — ${s.label}`), duplicating it
   outright. Fixed two ways: (a) `#method-caption` moved out of `.method-controls` to be the
   first flow child of `#method-view` (a `flex-direction:column` container), styled as a
   `.method-title` row above `.method-view__stage` — a flow sibling that shrinks the stage,
   never an absolute overlay, so it cannot structurally collide with the canvas caption or with
   `.set-chips` at any width; (b) `drawMethodSheet`'s and `setMethodFocus`'s vertical fit
   (`main.js`) switched from one symmetric `marginPx` to `marginTopPx`/`marginBottomPx`, with
   `marginBottomPx = 120` clearing the canvas caption's own offset below `blockH` plus the
   `.method-controls` pill (`bottom: var(--space-5)` = 24px + the pill's own rendered height,
   measured live at 49.6px — 120px leaves a comfortable margin, not a tight fit); (c)
   `methodBeatLabel`'s beat-0 branch (`main.js`) now returns `` `Starting Set ${set+1}` ``
   instead of the Set caption text, so the two captions never repeat each other. Verified live:
   opened a 2-Set walkthrough, drove it to each Set's final beat, and screenshotted the
   bottom region — both Set captions render fully legible, clear of the pill both vertically
   (visible gap above the pill) and horizontally (each caption sits under its own block, the
   centred pill sits between them), with the top title always a distinct, single-occurrence
   string.
3. **Nav pill radius.** `.method-bar` was `border-radius: 999px` (an unrelated stadium shape)
   wrapping `.btn--small` children at `--radius-sm` (6px) across the bar's own 8px
   (`--space-2`) vertical padding — non-concentric corners. Changed to
   `calc(var(--radius-sm) + var(--space-2))` (14px), in both the row layout and the
   `@media (max-width: 480px)` stacked variant. Verified via computed style: `14px`, exactly 6 +
   8, matching the button corners visually.
4. **[Addendum, same day] Set-N chip gap.** Decision 2's `.method-title` row pushed
   `.method-view__stage`'s top edge down — but `#method-chips` (the top-right Set-focus pill)
   was `position: absolute` *inside that stage*, so its `top: var(--space-2)` offset was now
   measured from the shifted stage edge, not the view's actual top, leaving an oversized gap
   above it. Moved `#method-chips` to be a direct child of `#method-view` (`position: fixed`,
   a valid containing block for absolutely-positioned descendants) instead of
   `.method-view__stage` — no CSS values changed, only which box `top`/`right` are measured
   against. Verified live: `chips.getBoundingClientRect().top - view.getBoundingClientRect().top`
   reads exactly `8`, and a screenshot shows the pill level with the top title, no overlap.
**Why:** all four were found across one audit and one same-day addendum, but share a root cause
category with ADR-089/090/094 — "every click visibly changes the sheet, nothing overlaps or
repeats" was the intent; these were the parts of that intent still unmet.
**Alternatives rejected:** *Detect mark-novelty in world/3D space, not sheet-local 2D* —
rejected: two distinct world edges routinely flatten to the same sheet line (a prism's top face
over its bottom face in top view when upright), and a vertical generator flattens to a
zero-length point in that same view; a 3D comparison misses both, which are exactly the cases
this fix exists to catch. *Dedupe beats 6/12/13 against view geometry too* — rejected for
projectors/labels (never meaningfully coincide, and are read by a live region regardless); for
axis, rejected specifically because a learner-visible colour/dash change is a genuine new mark
even when geometrically collinear with an already-drawn generator — only the fully-degenerate
(both-flattens-collapse-to-a-point) case is treated as a true no-op. *Collapse the title row to
zero height when the caption is empty* (`:empty{display:none}`, ADR-094's original behaviour) —
rejected: would resize the canvas mid-walkthrough as beats come and go; the row now reserves its
line-height unconditionally.
**Consequences:** `methodViewSplit` (ADR-091) is now shared by three call sites instead of two —
`methodContentBeats` no longer keeps its own independent copy of the `firstIsHP` split (that
independence was ADR-091's deliberate precedent for a second copy; a third was not, ADR-091's own
header note). `#method-caption` keeps its id and `aria-hidden` (unchanged JS wiring in
`methodController.js` — only its DOM position and CSS class changed). No beat template, gate, or
animation logic changed — `METHOD_BEAT_COUNT`/`BEAT_COUNT` stay at 14 and still must move
together (ADR-087/094).
**Status:** Active.

---

## ADR-099: Show Method denotes its angles with a drawn arc + degree label, measured off the Set's actual pose rather than declared from the raw slider; the Set 2→Set 3 carry-over gets its own dash and a Set-aware caption

**Date:** 2026-08-01
**Decision:** Two gaps found in one audit: (1) nothing on the Show Method sheet showed WHERE an
inclination angle actually was or WHAT it was measured against — Sets named their angles in the
caption text only ("Axis 30° to the HP"), never on the drawing itself; Module 2 had zero arc
primitives anywhere. (2) beat 6's cross-Set derivation line (ADR-092) and its within-Set projector
line were visually identical (same colour, same short dash, same caption), so a learner had no way
to tell "linking this Set's two views" apart from "carried over from the last Set," or why.

Fixed as one measured-not-declared system, not a labelling patch:
1. **Audit finding that reframed the whole angle half:** `angleHP` is a plain X-tilt from upright
   (`iShape.js`), so an "axis 30° to the HP" problem statement actually draws at **60°** off the
   HP (confirmed live: world axis direction read back via a temporary debug hook against the
   "Square pyramid, inclined both ways" problem — `asin(|dir.y|) = 60°`, not 30). `angleVP` alone
   is faithful (a pure Z-roll, upright ⇒ 0° to VP). The both-planes Set 3 case is worse than a
   simple complement: its VP-inclination is a SEQUENTIAL yaw-after-tilt (ADR-093), which reads
   14.48° true 3-D VP-angle for a nominal "30°" — no closed-form correction was going to hold up
   here. **Chosen fix: measure, don't declare.** Every Set's caption and its arc both derive from
   the Set's actual resolved world axis (`axisInclinations(dir) = { toHP: asin(|dir.y|), toVP:
   asin(|dir.x|) }`, `main.js`), so they can never disagree with each other or with the drawing.
   The underlying slider-vs-statement mismatch itself is explicitly OUT of scope — a separate,
   larger fix (touching defaults, the −90..90 range, and the face-inclination formula) that this
   change does not attempt.
2. **`planMethodStages` stops baking angle text into `label`.** It emits a declarative
   `labelSpec` (`{kind:'literal',text}` | `{kind:'plane',plane}` | `{kind:'both',firstPlane,
   secondPlane}`) instead; `projectSet` resolves the actual degrees via `formatSetLabel(spec,
   incl)` once the Set's real pose is known, reusing the `axis` unit vector ADR-087 already
   computes there (no re-derivation).
3. **The arc (`strokeAngleArc`, `main.js`) draws in beat 12** (the axis beat — no new beat,
   `METHOD_BEAT_COUNT`/`BEAT_COUNT` stay 14, ADR-087/094's invariant untouched), in viewA's own
   flatten (the Set's `trueShape` view) — gated by a numeric guard, NOT trusted by construction.
   viewA drops Y (top view) when `firstIsHP`, else drops X (front view); a single line's own
   inclination is a TRUE angle in a view exactly when the axis has zero component along that
   view's dropped axis. For a `'plane'`-kind Set on the HP branch this is exact — `angleVP` is
   held at exactly 0 by `planMethodStages`' own override, so `axisDir.x` is exactly 0 and the
   front view always qualifies. The mirror VP branch is NOT exact: a manually-dialled
   angleVP-only pose (`angleHP` 0, no shipped problem exercises this — reachable only via
   free-explore) keeps `axisDir.z` constant instead, which projects as a purely vertical line —
   always reading 90° — in BOTH available views, because Show Method has no side view (ADR-088)
   to show this rotation family true in. **Caught live, not anticipated in the original design**:
   the first version of this fix assumed the 'plane' case was exact "by construction" for both
   branches and shipped a "90°" arc beside a "40° to the VP" caption on a free-explore VP-only
   pose — exactly the arc-disagrees-with-caption failure this whole ADR exists to prevent. Fixed
   by checking `Math.abs(firstIsHP ? axisDir.y : axisDir.x) < ARC_DIR_EPS` (0.02 rad ≈ 1.1°,
   floating-point slack only) before drawing, for the 'plane' case specifically — the HP branch
   still always passes, the VP branch now correctly draws no arc rather than a wrong one. A
   `'both'`-kind Set (both-planes Set 3) draws the same primitive but denotes the TURN, not a
   3-D inclination — the previous Set's own same-view axis line is provably horizontal in the
   top view (its other component is the one just zeroed in step 2), so a plain horizontal datum
   measures the applied yaw exactly, with no cross-block coordinate reuse needed. Guarded
   separately to `firstIsHP` (i.e. viewA is genuinely the top view): the sequential yaw (ADR-093)
   is always about world-Y, which is angle-preserving in a projection ONLY when that projection
   drops Y — true for the top view, not the front. A future VP-first `method.order` entry would
   put viewA in the front view instead, where the identical sweep would misrepresent the turn;
   the guard skips the arc there rather than draw a lie (`method.order` currently has zero
   entries in `problems.js`, so this is dead code today, same status as ADR-093's own
   sequential-VP-first branch).
4. **Beat 6 splits its two line families visually** — the within-Set vertical projector keeps its
   short dash (`[2,2]`); the cross-Set horizontal carry-over gets a long dash (`[8,4]`), same
   colour/width. Not `--color-accent`: the palette deliberately keeps sheet linework off blue
   (`--color-hp-line`'s own token comment, `index.html`).
5. **Captions become Set-aware** for both halves of the transition (`methodBeatLabel`, Sets 2+
   only — Set 1 keeps its original text unchanged): beat 1 states WHY view A is drawn first
   ("drawn first because it shows the new angle true" — the same fact step 3's arc placement
   relies on); beat 6 names what's carried ("Set N's `<view>` view carried across, `<heights|
   depths>` unchanged") — heights for a carried front view, depths for a carried top view,
   matching exactly which sheet-coordinate `drawMethodSheet`'s own `prevFlattenUntouched` holds
   constant. Beat 12's caption gains the same measured value the arc shows, from the same `incl`/
   `turnDeg` fields — one source, both readouts.
**Why:** the whole point of adding an angle denotation was to make Show Method more trustworthy,
not less — a caption or arc that could ever show a different number than the drawing itself would
be worse than the missing-denotation status quo it replaces. Measuring off the Set's own resolved
pose (already computed, already trusted by the rest of the pipeline) was the only source that could
make that guarantee; every other option available (correcting the caption formula by hand,
labelling with the stated slider value) either couldn't handle the sequential-yaw case or would
have shipped an arc that measurably disagreed with its own label.
**Alternatives rejected:** *Fix the pose at the source* (make `angleHP` genuinely mean
inclination-to-HP) — correct, but touches defaults, the slider range, the face-inclination
formula, and any topic cloning this pattern; out of scope for an annotation feature, logged as a
follow-up instead. *Label arcs with the stated slider values as-is* — fastest, but ships a drawn
arc whose own label contradicts what it visually measures. *Denote every non-zero angle on every
Set* (including Set 3's now-apparent first-plane angle) — rejected: that angle is no longer a TRUE
angle in either of Set 3's own views once the solid is turned, and would need its own
apparent-angle convention and caveat to stay honest; simpler to show only what each Set newly
introduces. *A dedicated new beat for the carry-over* — rejected, same reasoning ADR-092 already
used: no beat index change, no `BEAT_COUNT` bump, no `methodController.js` change.
**Consequences:** the both-planes Set 3 caption text changes from the old declared
`Axis 30° to the HP and 30° to the VP` to the measured `Axis 60° to the HP and 14° to the VP` —
intended, not a regression; the numbers now match what a protractor would read off the sheet.
`src/methodController.js`, `src/vertexLabeler.js`, and `index.html` are untouched — captions flow
through the existing `sim.method.beatLabel` surface, and the arc introduces no new CSS token.
**Status:** Superseded in part — `src/vertexLabeler.js` IS touched by ADR-100 below (axis
overshoot removal); the caption/label-source claims here remain accurate.

---

## ADR-100: Beat 12's animation unit is a whole view-pass, not a chain-line dash; the angle arc animates in instead of popping in; the axis drops its endpoint overshoot

**Date:** 2026-08-01
**Decision:** Four small, related defects found in one audit of ADR-091's stroke-in and ADR-099's
arc, all localized to beat 12:
1. **Wrong animation granularity.** ADR-091's "one unit = one atomic stroked line" convention means
   every other beat counts a whole EDGE as one unit. The axis is drawn as a chain (centre) line —
   `chainPositions` (`vertexLabeler.js`) explodes it into ~22 tiny dash segments per view, and
   `methodBeatUnitCount`'s old `case 12` counted each dash as its own unit, twice (HP pass + VP
   pass): ≈44 units × 300ms ≈ **13 seconds**, the walkthrough's one glaring outlier against a
   couple hundred ms to ~2s everywhere else. Fixed by counting **one unit per view pass** (2
   units, ≈0.6s) instead — the axis is one line, not N dashes; `strokeAxisPass` (`main.js`, was
   `strokeAxisInto`) now cuts each pass by WORLD distance along the axis, not by dash index, so
   the reveal fraction still lands correctly regardless of how many dashes the chain pattern
   happens to produce.
2. **Arc appeared instantly.** ADR-099's `arcEligible` check required `!reveal` — the arc was
   unconditionally suppressed for the whole beat-12 reveal and popped in fully formed the instant
   the reveal ended, jarring against every line beat's progressive stroke-in. Fixed by giving the
   arc two more animation units of its own (`methodBeatUnitCount` case 12 is now
   `2 + (methodArcEligible(set) ? 2 : 0)`) and a `phase` param on `strokeAngleArc`
   (`{datumT, arcT, labelA}`, each defaulting to 1 = fully drawn — same optional-param precedent
   ADR-091 set for `strokeMethodLines`' `reveal`): unit index 2 grows the datum ray, unit index 3
   sweeps the arc itself with the degree label cross-fading in (`ctx.globalAlpha`) over the
   sweep's last 30%, so the number settles just after the arc finishes rather than mid-sweep
   against a half-drawn angle. The eligibility check itself is unchanged, only relocated to a
   standalone `methodArcEligible(set)` — `methodBeatUnitCount` (a pre-flight count) and
   `drawMethodSheet` (the actual draw) are a beat apart in the source and had already drifted once
   under ADR-099 (its own "caught live" free-explore VP-only-pose incident); one shared function
   makes that drift structurally impossible now, mirroring the precedent `methodViewSplit` already
   set for the firstIsHP/viewA/viewB split.
3. **Arc too big, label too far out.** Radius `E * 0.22 * pxPerUnit` → `E * 0.14`; the degree
   label's position changed from `rPx * 1.5` (a radius MULTIPLIER — every future radius tweak
   would drag the label with it) to `rPx + ARC_LABEL_GAP_PX` (`main.js`, a constant 10px gap
   outside the arc, independent of radius).
4. **Axis overshot its true endpoints.** `AXIS_OVERSHOOT` (0.12 world units, `vertexLabeler.js`)
   was added past both ends of the axis "like a real centre line" — but it made the drawn line
   visibly run past P (base centre) and O (top/apex), the exact points it's labelling. Removed
   outright (`bottom`/`topAxis` now sit exactly at `minY`/`maxY`). Deleting it alone would leave
   the line ending short of or mid-gap at the endpoint on all but a lucky span (the old chain
   pattern just repeated at its authored length and clamped at `total`), so `chainPositions` now
   fits an integer number of `[gap,dot,gap,long]` cycles to the exact span and uniformly SCALES
   every dash/gap/dot length to match — built as an explicit leading-long-dash-then-n-cycles
   sequence (not a cyclic re-index of a 4-step array from position 0, which was tried first and
   found to end on a GAP, not a dash) so both ends provably terminate on drawn ink. This is the
   same function the LIVE 3D PANE's own axis calls (`vertexLabeler.js:364`) — the fix lands there
   too, deliberately: it is the same axis on the same solid, and an overshoot the sheet no longer
   has but the 3D view still did would be a new, not a fixed, inconsistency.
**Why:** all four were small, but all four sat in the one beat (12) a learner's eye lands on last
and lingers on — the axis and its angle are the payoff of the whole construction. A beat that
visibly outlasted the rest by 6-7x, an annotation that broke the "everything draws on" pattern, an
oversized arc crowding the solid, and a line that ran past its own labels all read as unfinished
polish on exactly the mark meant to look most deliberate.
**Alternatives rejected:** *Lower `METHOD_SEG_DURATION_MS` globally* — rejected, would speed up
every beat's per-edge stroke-in, not just the one outlier beat, changing timing ADR-091 already
tuned elsewhere. *Keep chain-dash-count granularity but shorten each dash's duration* — rejected,
still couples beat-12 pacing to how finely `CHAIN` happens to subdivide a given axis length,
which is incidental geometry, not pedagogical content. *Scale only `CHAIN.long`/`CHAIN.dot` and
leave `CHAIN.gap` unscaled* — rejected for the endpoint fit: an unscaled gap can't guarantee an
exact integer number of cycles fits the span, reintroducing the short/mid-gap ending this exists
to fix.
**Consequences:** beat 12 now takes ≈0.6s (no arc) to ≈1.2s (arc drawn) versus ≈13s before —
correct, not a regression; a learner who was clicking through quickly never noticed the old
duration anyway (Next was never gated on animation completing, ADR-091). The axis's chain-line
dash COUNT changes slightly (pattern is now scaled to fit, not clamped) — cosmetic only, the same
long-dot-long rhythm reads the same. `src/methodController.js` and `index.html` remain untouched;
`BEAT_COUNT` stays 14.
**Status:** Active.

---

## ADR-101: Show Method gains a Set-to-Set tilt — a screen-anchored Canvas2D pictorial, not a live 3D viewport; ADR-085's "no anim.js tween" clause is superseded by ADR-091's own private rAF pump

**Date:** 2026-08-02
**Decision:** Show Method's both-planes tier (Set 2 → Set 3, the ADR-093 sequential yaw) gains a
"Watch the turn" control that plays the solid physically rotating between the two Sets' poses,
rather than the learner only ever seeing both drawings fully settled side by side. Landed in two
parts:
- **Phase 0 (prerequisite, no user-visible change).** `projectSetPose`/
  `projectSequentialBothPlanesPose` (`main.js`) now return the orientation quaternion `q` and the
  `seat` offset alongside the existing `{eff, m}`; `projectSet` retains them on the Set record as
  `pose: {q, seat}` — previously computed and discarded every time (`m` was local to `projectSet`,
  last read at its own `res.dispose()` call). `cacheMethodTiltEdges()` additionally snapshots the
  current solid's unique edges in LOCAL space (`buildEdgeMap(currentMesh.geometry)`, no
  `matrixWorld` argument — welding is rotation-invariant, meshAnalyzer.js's own doc) into a flat
  `Float32Array`, once per `method.begin()`, cleared in `teardownShowMethod`. No THREE.js objects
  retained; nothing to dispose.
- **Phase 1 (the tilt itself).** `startMethodTilt()` slerps the previous Set's quaternion into the
  current one's over `METHOD_TILT_DURATION_MS` (900ms, `easeFold`), re-seating via the existing
  `computeSeating` each frame and transforming the Phase-0 cached local edges by the interpolated
  pose. The result draws as a bordered, opaque inset in the TOP-LEFT corner of `#method-canvas`
  (`drawMethodTilt`, painted after `drawMethodSheet`), projected through a fixed 30° axonometric
  formula (`projectMethodTiltPoint`) — not a THREE.Camera. The inset's `{scale, cx, cy}` is fit
  ONCE at tilt start across both endpoint poses (`fitMethodTiltProjection`, 6 sampled t-values), not
  re-centred every frame, so a seat-driven vertical settle between the two Sets stays visible as
  real motion instead of being cancelled out by a per-frame auto-fit. No hidden-line pass — every
  edge strokes solid; this is a motion cue between two already-correct, already-dashed Sets, not a
  construction drawing of its own.

**ADR-085 correction.** That ADR's consequence clause reads: *"No `anim.js` tween may be added to
this view while the pause contract holds; any future motion here must be CSS or an instant state
change."* This was already false in shipped code by the time this ADR was written — **ADR-091**
(the per-line beat stroke-in) stood up exactly such a tween, riding a **private rAF pump**
(`methodAnimFrame`/`queueMethodRedraw`, `main.js`) that the takeover owns for itself, explicitly
BECAUSE `window.simAPI.pause()` has cancelled `animate()`'s own loop. ADR-091's own header says so
("pumped by THIS module's OWN requestAnimationFrame loop... that loop is paused for the entire
time Show Method is open"), but ADR-085's consequence line was never amended to match. This ADR
formally supersedes that clause: **a `tween()` may run inside the takeover, provided it rides
Show Method's own private pump, never the sim's paused `animate()` loop.** The tilt reuses that
same pump rather than adding a second one — `methodAnimFrame`'s re-arm condition extends from
`methodAnimBeat !== -1` to `methodAnimBeat !== -1 || methodTiltActive`, and `stopMethodBeatAnim`
(the single existing chokepoint for "settle whatever Show Method animation is running", called from
`setMethodProgress`/Next/Back/skip and `teardownShowMethod`/Exit/Escape/reset) is extended to also
cancel `methodTiltHandle` — so every path that already knew how to interrupt a beat reveal now
interrupts a tilt too, with no new call sites.

**Why:** a side-by-side Sets 2/3 comparison is the textbook convention (ADR-084), but it cannot
show the rotation ITSELF — for a both-planes problem, watching the solid tip-then-turn is the part
of the construction method a static sheet cannot carry. The two prior blockers (rebuild() being a
full teardown+rebuild pipeline, and the takeover's pause contract) turned out not to be blockers at
all once audited: rebuild() is never on the path (every Set already shares `currentMesh.geometry`
untouched, ADR-084's own "no mesh, no geometry allocation" invariant), and the pause contract was
already bridged by ADR-091's own pump.

**Alternatives rejected:**
- **A live WebGL viewport inside the takeover, showing the real 3D solid turning.** Rejected as the
  first phase's approach — it would need either a second `WebGLRenderer`/canvas (ADR-076 is
  precedent that this is possible) or re-parenting the live canvas, plus `LineMaterial.resolution`
  resize sync (ADR-006), a CSS2D overlay move, and a new disposal surface to verify against
  `renderer.info.memory` — a large risk step for a motion the learner reads as "the solid turned"
  regardless. Left as a possible Phase 3 if the pictorial doesn't read clearly enough in practice.
- **Rotating the live 3D solid visually (the `applyFoldVisual` idiom) instead of a headless
  pictorial.** Rejected — `applyFoldVisual` only ever rotates PLANE pivots (`vpFoldGroup`,
  `ppHingeGroup`), never the solid itself: `shapeGroup`'s mesh and its edge overlay are flat
  siblings with no pivot between them and `shapeGroup` (main.js's disposal contract requires flat
  children), and every projection/hidden-line/label/dimension downstream is a baked WORLD-space
  snapshot taken once at `buildEdgeMap`/`drawProjections` time against fixed world-axis observers
  (`projectionDrawer.js`) — a live visual rotation of the solid would desync all of it silently.
  Moot in any case: Show Method never shows the live scene (ADR-085 keeps it paused and covered).
- **A new beat in the template.** Rejected — would bump `METHOD_BEAT_COUNT` (14 → 15), touching the
  hand-duplicated twin in `methodController.js`, ADR-094's init assert, and ADR-098's
  `methodContentBeats` novelty rule for one motion cue that isn't a construction step. The tilt is
  an on-demand control (`#method-tilt`, shown only when `sim.method.canTilt()`), not a beat.
- **Anchoring the inset in sheet space** (following `methodPanX/Y`/`methodZoom`, alongside the Sets
  themselves). Rejected — `drawMethodSheet`'s and `setMethodFocus`'s sheet-layout block (`E`/`GAP`/
  `scale`/`anchorSX`) is already duplicated once between those two functions; a third copy for the
  inset was avoidable by anchoring in plain screen space instead, which also means a drag or
  focus-jump mid-tilt can never strand the inset off-frame.

**Consequences:** new Set-record field `pose: {q, seat}` (Phase 0); new module state
(`methodTiltEdges`, `methodTiltActive/FromQ/ToQ/Eff/T/Handle/Projection`, `METHOD_TILT_DURATION_MS/
SIZE/MARGIN/PAD`); new `sim.method.canTilt()`/`playTilt()`; new `#method-tilt` button in
`.method-bar` (`index.html`), hidden — not merely disabled — whenever `canTilt()` is false, so
`methodController.js`'s existing `focusables()` (`button` + `offsetParent !== null`) needs no
change to keep the focus trap correct. Reduced motion is free (`tween()` itself snaps to the end
value, `src/anim.js`). Scoped to the both-planes tier's Set 3 only (`turnDeg != null`, ADR-093);
a single-plane Set1→Set2 tilt (whose combined-Euler pose pair has no proven height-preserving
invariant the way ADR-093's yaw does) is explicitly out of scope, left for a future phase alongside
replay/scrub controls and a Phase-3 live-viewport escalation if warranted.
**Status:** Superseded by ADR-104.

---

## ADR-004 correction (2026-08-02): the "returns early while animating" line is stale

ADR-004's consequences paragraph states *"`rebuild()` returns early while animating, so anything
that should run during an animation needs separate handling."* Audited while scoping ADR-101 above:
`rebuild()` has exactly one early return, keyed on a null `shapeData` (the empty-start/reset path),
not on any animation flag — no `isAnimating` module variable exists anywhere in `main.js`. Rebuild
is instead **fold-aware by re-application**: it calls `applyFoldVisual(foldProgress)` unconditionally
near its end (main.js) so a mid-fold or fully-folded state is reconstituted onto the freshly-rebuilt
geometry rather than rebuild() being skipped during one. The actual "don't run rebuild mid-animation"
guards live OUTSIDE rebuild, keyed on `foldProgress`/`foldTween`/`methodActive` at each call site
(e.g. `compare.show()`'s `if (foldTween) return`, `methodCanRun()`'s `foldProgress !== 1` check) —
ADR-004's own text is left as-is above (historical record), corrected here rather than silently
edited, per this doc's own precedent for amendments-not-rewrites.

---

## ADR-102: Show Method — caption-clearance fix folded into the layout math, Set-chip focus gains a real tween, and a restricted dimension layer (base edge + height) returns to the walkthrough

**Date:** 2026-08-03
**Decision:** Three related fixes to the Show Method takeover (Module 2), audited and shipped
together.

**1. Set 2's caption overlapping the nav pill — a genuine bug in ADR-095's fix, not a new
regression.** ADR-095 reserved a flat `marginBottomPx = 120` below the fitted block, but the Set
caption's own offset (`captionY = -(blockH/2 + GAP*0.4)`) was never counted in the fit
(`nomHmm = blockH * WORLD_TO_MM` — the caption's `GAP*0.4` term is absent). On a height-bound fit
(the normal case for a 3-Set row), the block fills the whole reserved band and the caption hangs
a further `≈6%` of the band below it, landing ~9px inside the pill's own footprint. Every Set's
caption sits at the identical screen row (`anchorSY`); only Set 2 is horizontally centred under
`.method-controls` (`left: 50%`), so it was the only one that visibly collided — Sets 1/3's
captions clear the pill purely by being ~397px off to the side. **Fix:** a single shared
`methodSheetLayout(w, h)` (`main.js`) replaces the two hand-duplicated copies of this layout math
(`drawMethodSheet` and `setMethodFocus` — flagged as a duplication risk in ADR-095 itself) and
folds the caption's `GAP*0.4` offset into `nomHmm`/`anchorSY`, so the fit now measures the
block+caption band together, not the block alone. `marginBottomPx` is now a named constant
(`METHOD_PILL_RESERVE_PX + METHOD_CAPTION_LINE_PX = 100`) instead of the old bare `120`.
`setMethodFocus`'s own `zFitH` divides by `(blockH + capGapS)` too, so a focused Set clears the
pill exactly like the unfocused row. **Verified live** (real Chrome tab, both-planes 3-Set
problem): `.method-bar`'s screenshot rect sits a clear ~27px below "Set 2 — Axis 60° to the HP"'s
baseline, in both the unfocused row and a focused Set 2.

**2. Set-chip focus now tweens — amends ADR-085's "instant snap, no tween" clause, the same way
ADR-101 already amended it for the Set-to-Set tilt.** ADR-085 rejected a tween because the sim
loop is paused while Show Method is open, so nothing would ever drive one. ADR-091 (2026-07-28)
stood up a private `requestAnimationFrame` pump for the per-beat stroke-in that keeps running
regardless of the paused main loop; ADR-101 (2026-08-02) reused that same pump for the tilt. This
ADR reuses it a third time for `setMethodFocus`: `startMethodFocusAnim`/`stopMethodFocusAnim`
(`main.js`) tween `methodPanX/Y`/`methodZoom` via `anim.js`'s `tween()`, sharing
`methodAnimFrame`'s pump (now also gated on a new `methodFocusActive` flag) rather than adding a
fourth loop. **Timing matches the platform's existing Top/Front/Side quick-view chips exactly** —
`QUICK_VIEW_MS` (1500) + `easeFold` (`cubicBezier(0.83, 0, 0.17, 1)`), the real values `setView`
passes to `tweenCamera` (`main.js:1711`), not `easeCamera` (that name is only `tweenCamera`'s
*default* parameter, used by `setFlatView`/the auto-zoom dolly — `anim.js`'s own doc comment
claiming otherwise for the quick-views was stale and is corrected in the same pass). Chosen over
the tilt's own `METHOD_TILT_DURATION_MS` (900ms) deliberately, for parity with the quick-view
chips elsewhere in Module 2 rather than internal consistency with the tilt. `stopMethodBeatAnim`
(the existing single chokepoint for settling in-flight Show Method animations) now also calls
`stopMethodFocusAnim(true)` — a Set change (`goNext`/`goBack`'s `clearFocusChip` →
`setFocus(null)`, which runs *before* `setProgress`) must SNAP the focus tween to its target, not
freeze it mid-flight, or the sheet would strand on whichever Set was being left. The drag-to-pan
and scroll-wheel-zoom handlers each call `stopMethodFocusAnim(false)` first (freeze in place —
user input wins outright). **Verified live**, via a temporary debug hook driving Show Method's own
rAF pump manually (this MCP browser tab reports `document.hidden === true`, so native
`requestAnimationFrame` never fires here — the same environment limitation ADR-089/091 already
documented): `methodPanX`/`methodZoom` interpolate smoothly along an easeFold-shaped curve (slow
start, fast middle, slow settle) over ~1300-1500ms and then hold flat; clicking Next mid-tween
snaps both instantly to the same final values the tween would have settled at on its own.

**3. A restricted dimension layer returns to Show Method — base edge + overall height ONLY,
supersedes ADR-089 Decision 1.** ADR-089 removed dimensioning from the walkthrough entirely,
reasoning that BIS Type-B dimensioning is a separate concern from drawing *method*, already
served by the live pane's own "Show dimensions" toggle. That toggle's 5 dims (`projectionDrawer.js`)
are all **bounding-box extents** (overall height/width/depth, clearance from each plane) — correct
for Set 1's simple position, but wrong for Sets 2/3: inclining the solid changes its *projected*
envelope without changing the base edge's *true* length, so a bbox-width dimension on an inclined
Set would print a foreshortened number, not the real one. This ADR reverses ADR-089 Decision 1
for exactly two measurements — the true base-edge length and the true overall height — added as a
new `options.restrictedDims` branch in `drawProjections` (`projectionDrawer.js`), never passed by
the live pane's own call (its 5-dim toggle is byte-for-byte unchanged). The base edge needs REAL
geometry, not a reused bbox extent: `findBaseRingEdge` classifies every edge via the existing
`edgeKindOf` (`base` vs `generator`, ADR-087), separates the base ring from the top/cap ring by
axial position along the Set's own world axis (provably rotation-invariant — `dot(worldPoint,
axisDir)` is an affine function of local Y for any rigid transform), and picks the
least-foreshortened ring edge in the HP flatten to place the dimension line against; a new
`baseEdgeDimOffset` computes a per-edge perpendicular-in-plane offset (the existing bbox dims can
hardcode a single world-axis offset because they're always axis-aligned — an arbitrary-pose base
edge generally isn't). The PRINTED value is always the Set-invariant true value
(`shapeData.baseLength`/`height` × `WORLD_TO_MM`, read once in `projectSet`) — decoupled from the
placement geometry exactly the way `pushLinearDim`'s existing `(A, B, off, valueMM)` signature
already separates the two for every other dim in the file, so this needed no new primitive, only a
new caller. Curved-base solids (Cone/Cylinder) get the height dim only — `main.js` gates
`baseMM: null` off `currentShapeData.shape`, since `projectionDrawer.js` stays shape-agnostic by
design (its own header) and has no concept of "this solid has no single base edge." **Folded into
the EXISTING beat 13 (labels), per explicit direction, not a new beat 14** — `METHOD_BEAT_COUNT`
stays 14, the click budget is completely unchanged (28/42 for 2-/3-Set problems), keeping intact
the exact rationale ADR-089/090/098 already established for minimizing clicks. Reveal granularity
for the new dims mirrors ADR-100's fix for the axis: one animation unit per DIMENSION (not per
line segment) — each unit grows its dimension's own line (extensions snap in immediately, the
`pushLinearDim`-ordered third segment lerps), with the filled arrowheads + numeral appearing once
that unit settles. **Verified live**: on a 3×5 SquarePrism at 30°/40° (both-planes), every one of
its 3 Sets — including both inclined ones — labels the base edge "30" and the height "50"
identically (the true values, `3×10` and `5×10`), while the base-edge dimension's drawn line
visibly follows the tilted edge itself (a real oblique dimension, not a straight bbox width) in
Set 2/3's top view. On a Cone, `hpDimLines` is empty on every Set (no base dimension drawn) and
`vpDimLines` carries the height only; the beat-13 caption text adjusts automatically ("Vertex
labels and dimensions — overall height", no "base edge" clause).

**Also, independently:** spacebar now works as an alternate Next trigger while Show Method is
open — bound on `onViewKeydown` (`methodController.js`), which is attached to `#method-view`
itself (not `document`), the same scoping that ADR-084's original Escape/Tab-trap handler already
uses. Every slider/input in the app lives outside `#method-view` (`hidden` and covered while the
takeover is open), so this is a structural, not a checked, guarantee against firing on background
controls. Space on any OTHER focused button in the pill (Back/Skip/Exit/Tilt/a Set chip) is left
to native browser activation (the handler returns early without calling `preventDefault()`) —
Space only triggers `goNext()` when `#method-next` itself is focused, or nothing more specific is.
`e.repeat` is checked and dropped so holding the key can't machine-gun beats. **Verified live**
with genuine OS-level key events (not synthetic `dispatchEvent`): Space on a focused Next advances
exactly one beat; Space on a focused Back goes backward, not forward; Space with a background
slider focused (Show Method closed) does nothing.

**Alternatives rejected:**
- *Dimensions as a new beat 14* — rejected per explicit direction: would have reversed
  ADR-089/090/098's click-budget rationale for a feature that fits cleanly inside the existing
  labels beat instead.
- *Base-edge dimension reusing the bbox width/depth shortcut* — rejected: correct only in Set 1's
  simple position, silently wrong (foreshortened) on every inclined Set, which is precisely the
  case this feature exists to cover.
- *A fourth independent rAF loop for the focus tween* — rejected: ADR-091's pump already exists
  and already tolerates concurrent use (the tilt is the second reuse, this is the third); a new
  loop would be pure duplication.
**Consequences:** new shared `methodSheetLayout()` (replaces two hand-duplicated layout blocks);
new module state (`methodFocusActive/Handle/Target`); `stopMethodBeatAnim` now settles three
animations, not two; `drawProjections` gains an `options.restrictedDims` parameter (opt-in, no
effect on existing callers); `projectSet`'s harvested `data` gains
`hpDimLines/vpDimLines/hpDimTris/vpDimTris/hpDimLabels/vpDimLabels`, restoring the
`harvestTriGroup`/`harvestLabelGroup` helpers ADR-089 deleted; `methodBeatUnitCount`/
`methodBeatLabel` both gain a beat-13 case. `METHOD_BEAT_COUNT` is untouched.
**Status:** Decision 3's "every Set" and "greatest projected length" clauses superseded same-day
by ADR-103 (base-edge selection was picking a triangulation-seam diagonal, not a real edge — see
ADR-103 for the audit and fix). Decisions 1 and 2 (caption clearance, focus-chip tween) remain
Active.

---

## ADR-103: Show Method's restricted dimension layer — real base edge, textbook placement,
## Set-1-only (fixes ADR-102 Decision 3)

**Date:** 2026-08-03
**Decision:** Three bugs in ADR-102's restricted dimension layer, found by live-testing a
30°/30° square pyramid and cross-checking against the textbook (John, *Engineering Graphics for
Diploma*, the "Axis Inclined to Both Planes" chapter — Figs 12.20/12.21/12.23/12.24/12.25,
rendered from the project-root PDF via poppler) — audited, then fixed together.

**1. The "base edge" dimension was measuring a triangulation-seam DIAGONAL, not a real edge.**
`findBaseRingEdge` (`projectionDrawer.js`) walked the welded `edgeMap` and filtered only on
`edgeKindOf(...) === 'base'`. `meshAnalyzer.buildEdgeMap` records every triangle edge, so a flat
N-gon base face (triangulated into a fan) contributes its diagonals alongside its real edges; a
diagonal lies in the base plane (⊥ the axis, same as a real edge) and so also classifies as
`'base'`. The picker then took the edge with the "greatest projected length in the HP flatten" —
intended as "least foreshortened" — which a diagonal always wins (√2× a square's side, more on a
hexagon), so it was selected every time. **Fix:** exclude coplanar seams using this file's own
existing `classifyEdge`/`EdgeType.COPLANAR` test (the same filter the main draw loop already
applies to every other edge, `projectionDrawer.js`'s edge-walk) before the 'base' classification
runs at all.

**2. Once restricted to Set 1 (Decision 3 below), "greatest projected length" no longer
discriminates anything — every real base edge is already true length there, so a different
selection metric is needed for PLACEMENT.** The edge is now picked by which direction reads most
nearly vertical on the method sheet (largest `|world-X component| / length`, since
`flattenHP`'s `v = -x`) — its in-plane normal is then dominantly sheet-horizontal, landing the
dimension beside the view (John's own placement: Fig 12.21's edge b–a, Fig 12.25's edge c–d)
rather than stacked toward the xy line. For a base deliberately turned in plan (e.g. the
"Orient to Corner" 45° preset), no edge is purely axis-aligned; the same metric still picks a
definite edge and draws an ALIGNED dimension parallel to it — Fig 12.20's turned-square frustum
convention (`□32`/`□16`, aligned to the turned edge) — rather than the diagonal's degenerate
case. (Confirmed with the user: bare numeral, no `□` prefix — the existing `pushLinearDim` label
format is unchanged.)

**3. The base-edge dimension's placement was landing in the gap between the top and front
views — a direct CONSEQUENCE of Bug 1, not an independent defect in the offset formula.**
`baseEdgeDimOffset`'s "away from the solid's bbox centre" sign test is well-defined for any real
edge (whose midpoint is never the centre) but degenerates for the diagonal (whose midpoint IS
the centre exactly, `dot ≈ 0`), leaving the offset direction effectively whatever the raw
perpendicular happened to compute — the diagonal's own far corner, already at the top view's own
extreme, then got pushed further outward by that unstable direction, past the outline toward the
xy line. Fixing Bug 1 (a real, off-centre edge) resolves this without changing the offset
formula itself.

**4. The overall-height dimension's top extension line was a short, disconnected horizontal
mark floating near the apex — reported as a possible stray/leftover.** It is not a leftover: the
height dim is built between synthetic bbox points `V(0, min.y, max.z)`/`V(0, max.y, max.z)`
(`projectionDrawer.js`), and `pushLinearDim`'s extension lines run from THOSE points, not from
any point actually on the drawing. A prism's top ring reaches the bbox's own Z extent (so this
was harmless there), but a pyramid/cone's apex is a single point usually nowhere near `max.z` —
the extension line floated beside the apex instead of touching it. **Fix:** `pushLinearDim`
gains optional `anchorA`/`anchorB` parameters — the REAL feature point each extension line starts
from, independent of the point defining the dimension LINE's own screen position — and a new
`ringZExtentAt(edgeMap, targetY, eps)` helper finds the actual Z reach of the drawing at the
apex/base height (a no-op for a prism, the fix for a pyramid/cone). Every other existing
`pushLinearDim` call is unaffected (both params default to `A`/`B`).

**5. Size dimensions were repeating on every Set — the textbook prints them once.** Every worked
example read this session (Figs 12.21, 12.23, 12.24, 12.25) prints the base-edge and height
dimensions exactly once, on the simple-position Set; the inclined Sets carry the beat-12 angle
arc instead, never a repeated size dimension. `projectSet` (`main.js`) now takes a `setIndex`
parameter (`plans.map((plan, i) => projectSet(plan, i))`) and passes `restrictedDims` only when
`setIndex === 0`. Getting Sets 2/3 to draw NOTHING (not the live pane's full 5-dim bbox layer)
needed a second change: `restrictedDims: null` alone is indistinguishable, inside
`drawProjections`, from the live pane's own call (which also never passes `restrictedDims` and so
also defaults to `null`) — it was falling through to the `else` branch (the full 5-dim layer)
instead of drawing nothing. Sets 2/3 now also pass `drawDimensions: setIndex === 0` explicitly,
suppressing the whole dimensioning block for those Sets. `methodBeatUnitCount`/the beat-13
caption (`main.js`) already keyed off `hpDimLines.length`/`vpDimLines.length`, so Sets 2/3
collapse to a bare "Vertex labels" caption and zero extra animation units with no further change.

**Verified live** (real Chrome tab, `php -S 127.0.0.1:8123` serving `Module2/`, a fresh
30°/30° square pyramid, base 20 mm, height 30 mm): Set 1's top view prints "20" against the real
edge D–C, offset beside the square, clear of the xy line; the front view's "30" has both
extension lines landing on real points (base corner and apex `O`) with no floating mark; Sets 2
and 3 draw the angle arc only, captioned "Vertex labels" (no dimensions). Screenshots taken at
each Set match the John figures' convention.

**Alternatives rejected:**
- *Keep dimensioning every Set, just fix the edge* — rejected per direction: the textbook does
  not repeat size dimensions on inclined Sets, and repeating them compounds the placement problem
  (an inclined Set's base ring is itself tilted in 3-D, no longer guaranteed to have an edge
  reading cleanly beside the view).
- *Square prefix (`□20`) for a turned base* — rejected per direction: keep the existing bare
  numeral; only the placement geometry (aligned, parallel to a real edge) needed to change.
- *Length-based edge selection retained, only excluding diagonals* — rejected: once Set-1-only
  (this ADR) is applied, every real base edge shares one true length, so length is not a useful
  placement signal; the sheet-orientation metric is needed regardless.

**Consequences:** `findBaseRingEdge` takes `faces` from `edgeMap` (already present on every
value) and filters `EdgeType.COPLANAR`; its selection metric changed from edge length to sheet
orientation. `baseEdgeDimOffset` unchanged in formula, re-documented. `pushLinearDim` gains two
optional trailing parameters (back-compatible). New helper `ringZExtentAt`. `projectSet` gains a
`setIndex` parameter; its one call site updated. `drawProjections`'s restricted-dims caller now
also passes `drawDimensions`. No change to `METHOD_BEAT_COUNT`, the live pane's 5-dim toggle, or
any beat/click budget.
**Status:** Active.

---

## ADR-104: Show Method's Set-to-Set tilt becomes an on-sheet ghost — a rigid 2D rotate+translate of Set 2's own top view, not a screen-anchored 3D pictorial; supersedes ADR-101

**Date:** 2026-08-04
**Decision:** ADR-101's "Watch the turn" control played a screen-anchored, fake-axonometric
pictorial of the solid physically rotating in a fixed 200px inset (`projectMethodTiltPoint`,
`fitMethodTiltProjection`, `drawMethodTilt`). Read both reference textbooks cover-to-cover on this
specific transition before redesigning (John, *Engineering Graphics for Diploma* pp.148–153, Figs
12.20–12.27; Bhatt, *Engineering Drawing* pp.286–300, Figs 13-29–13-47 — 21 Set-1/2/3 figures,
zero exceptions): **not one uses a pictorial for the Set-2→Set-3 transition.** Every one is a pure
2D operation on the sheet itself:
- John, Fig 12.21 step 2 — *"Copy the front view after tilting the axis by 45° to the xy line."*
- John, Fig 12.21 step 3 — *"turn the top view about point c, the point of turning PT"* — a named
  pivot lying on the reference line, not a re-derivation from scratch.
- Bhatt, Fig 13-30(i)–(iv) — the identical outline drawn three times at three tilt angles, the
  angle marked at the pivot each time.
- Bhatt, Fig 13-39 — the only separate small diagram in either book, and it is a trig locus-arc
  construction for the apparent angle β, not a pictorial of the solid — not a precedent for an
  inset.

The fix is not to restyle the inset — it is to do on the sheet what the books do on the page: the
view that carried the true angle in Set 2 is bodily copied and turned about its axis foot onto
Set 3's own position, faded, angle marked during the motion, then removed as Set 3's real
beat-by-beat construction begins. Show Method already draws every Set side by side in one figure
(`methodSheetLayout`/`drawMethodSheet`), which already mirrors the textbook page layout — the
transition just wasn't using it.

**Why this lands pixel-exact, not merely close:** Set 3's pose is Set 2's pose yawed about
world-Y (ADR-093), and the top view drops Y. So Set 3's top view IS Set 2's top view under a
rigid 2D motion — a rotation plus a translation, no scaling, no reshaping. `methodArcEligible`
(ADR-099/100) already encodes the exact guard this depends on (`kind === 'both'` plus
`firstIsHP`, i.e. view A really is the top view) — `startMethodTilt` now shares that same gate,
so the ghost is only ever offered when the claim is provably true.

**θ is measured, never declared.** `projectSheet` applies a uniform scale *and a y-flip*, so a
world rotation reads as the opposite sense on canvas — exactly the ported-sign trap
`Module2/CLAUDE.md` warns about. The pivot is chosen by ARRAY INDEX (which end of `ann.axis` beat
12's own "lower on screen" rule already picks for Set 3, reused by index on Set 2 — both Sets
harvest from one shared geometry with only pose differing, the same cross-Set assumption beat 6's
projector derivation already relies on for `ann.labels`), then θ is the signed angle, in canvas
px, between Set 2's own drawn axis direction and Set 3's — sign, y-flip, and handedness all
cancel out for free. Per Set-2 sheet point `P` (already flattened at Set 2's own `dx`):
`ghostPx(P, t) = Rot(θ·t)·(Ppx − pivot2px) + pivot2px + t·(pivot3px − pivot2px)`. At `t=0` this is
Set 2's drawing untouched; at `t=1` it is Set 3's starting position, by construction.

**Net simplification, not just a re-skin.** The old inset needed a 3D pose (quaternion slerp), a
local-space edge cache re-projected every frame (`methodTiltEdges`, `cacheMethodTiltEdges`), and a
hand-rolled fake-axonometric trig projection with its own fit pass. All of it is deleted. The
ghost instead re-flattens the harvested sheet-space line arrays (`data.hp`/`data.hpOutline`) both
Sets already carry, through one closed-form 2D transform — no buildEdgeMap, no allocation, no
disposal, and (unlike the inset, which ignored `methodPanX/Y`/`methodZoom` entirely and was
anchored in screen space specifically to dodge threading that state through) the ghost now tracks
a pan/zoom mid-tilt correctly because it lives in sheet space, computed fresh each frame from
`methodSheetLayout` — the same call-it-again precedent `setMethodFocus` already established for
that single-source layout.

**Reused verbatim, not reinvented:** `strokeMethodLines` draws the ghost body (per-segment hidden
dashing comes free from `seg.hidden`, so the ghost keeps Set 2's real line types — a copied
orthographic view, unlike a pictorial, has a meaningful hidden-line pass); `strokeAngleArc`
(ADR-099/100) draws the angle mark, fed the ghost's own current (rotating) pivot/far points every
frame, so its label naturally counts up from ~0° (the near-zero sweep at `t=0` hits the existing
degenerate-input guard, so no stray dot appears) to the full turn — no separate counter, and it
agrees with beat 12's arc at rest by construction. The private rAF pump (ADR-091/101) and
`tween()`/`easeFold` are reused unchanged; `stopMethodBeatAnim` still cancels exactly one handle.

Timing: motion (900ms, `easeFold`) → hold (400ms, full alpha — the payoff frame where ghost and
Set 3 coincide) → fade (350ms, alpha 1→0), one tween mapped internally to the three phases so the
cancel/handle contract stays a single chokepoint.

Only view A (the top view) is ghosted. View B (not true-shape in Set 2) is left untouched — no
textbook figure animates the derived view either; beat 6's projector beat already carries that
derivation.

**Alternatives rejected:**
- **Keep the pictorial, just move/restyle it onto the sheet.** Rejected outright by the source
  material — no figure in either book ever draws a pictorial for this transition; restyling the
  wrong representation is not a fix.
- **Derive θ from `turnDeg`'s sign directly.** Rejected — `projectSheet`'s y-flip makes this
  exactly the ported-sign trap the project's own CLAUDE.md calls out; measuring both Sets' drawn
  directions and taking the signed difference makes handedness cancel automatically instead of
  needing to be reasoned about by hand.
- **Also ghost view B, or extend this to Set1→Set2.** Rejected — out of scope by explicit
  decision (see Scope below); no textbook figure animates the untouched view, and Set1→Set2's
  combined-Euler pose pair has no proven angle-preserving invariant the way ADR-093's sequential
  yaw does.

**Scope:** Set 2 → Set 3 (both-planes tier, `turnDeg != null`) only — identical to ADR-101's
scope. The manual, replayable **"Watch the turn"** button is unchanged in contract; `index.html`
and `methodController.js` needed no changes at all.

**Consequences:** removed `projectMethodTiltPoint`, `fitMethodTiltProjection`, `drawMethodTilt`,
`cacheMethodTiltEdges`, module state `methodTiltEdges`/`methodTiltFromQ/ToQ/Eff/Projection`,
`_tiltScratchQ/VecA/VecB`, `METHOD_TILT_SIZE/MARGIN/PAD`, and the Set-record's `pose: {q, seat}`
field (nothing else read it). New: `drawMethodGhost` (`main.js`, called from `drawMethodView`
after `drawMethodSheet`, same paint ordering the inset used); module state `methodGhost`
(`{fromIndex, vertexIsFirst, turnDeg}`, pose-independent facts solved once at ghost start) and
`methodTiltMotionT`/`methodTiltAlpha` (replacing the old single `methodTiltT`); new constants
`METHOD_TILT_HOLD_MS`/`METHOD_TILT_FADE_MS`/`METHOD_TILT_TOTAL_MS`/`GHOST_ALPHA`.
`startMethodTilt` keeps its exact boolean-return, no-op-on-false shape and its
`stopMethodBeatAnim()`-first contract; it gains the `methodArcEligible(set)` guard.
`METHOD_BEAT_COUNT` stays 14 — the ghost remains a motion cue, not a beat.
**Status:** Active.

---

## ADR-105: Ghost turn — shortest-path rotation, and the trigger merges into Next; amends ADR-104's "methodController.js needed no changes" clause

**Date:** 2026-08-04
**Decision:** Two fixes to the ADR-104 ghost.

**1. Shortest-path θ.** `drawMethodGhost` (`main.js`) measured the turn as a raw difference of two
`atan2` calls: `Math.atan2(far3.y-pivot3.y, far3.x-pivot3.x) - Math.atan2(far2.y-pivot2.y,
far2.x-pivot2.x)`. `atan2` itself returns `(-π, π]`, but a DIFFERENCE of two such values spans
`(-2π, 2π)` and was never wrapped back down — when Set 2's and Set 3's drawn axis directions
straddle the ±180° seam (one just under +180°, the other just over −180°), the raw difference
reads as e.g. +330° for a turn that is really −30°, and the ghost visibly spins the long way
round. Fixed with the same wrap idiom `strokeAngleArc` already applies to its own `diff` two
screens up in the same file: `while (theta > Math.PI) theta -= 2*Math.PI; while (theta <= -Math.PI)
theta += 2*Math.PI;`. This is provably correct here, not merely prettier: `turnDeg` is
`plan.sequential.secondAngle`, sourced from the `rng-anglehp`/`rng-anglevp` sliders
(`index.html`), range `[-90, 90]` — so `|true turn| ≤ 90° < 180°`, meaning the shortest-path wrap
can never pick the wrong rotation, only stop picking the needlessly long one. `t=1` still lands on
Set 3 exactly (`Rot(θ)` and `Rot(θ ± 2π)` are the same rotation), so ADR-104's landing proof is
untouched.

**2. Trigger merges into Next.** ADR-104 explicitly left the manual "Watch the turn" button and
`methodController.js` untouched ("the manual, replayable 'Watch the turn' button is unchanged in
contract; `index.html` and `methodController.js` needed no changes at all") — that sentence is now
superseded. The turn is the payoff of the Set 2 → Set 3 transition, so it now plays automatically
as part of the Next click that crosses that boundary, in `goNext` (`methodController.js`):
`if (crossedSet && sim.method.canTilt()) sim.method.playTilt();`, called after `syncCaption()` so
`startMethodTilt`'s own `announce()` ("Turning Set 2's top view N° into Set 3's position", then
"Now at Set 3 — ‹label›" on completion) is the narration actually read out, not immediately
overwritten by it. No engine change was needed to make the landing itself safe: Set 3's beat 0 has
zero animation units (`methodBeatUnitCount`'s `default:` arm) and draws no view geometry, so
`setMethodProgress`'s own `startMethodBeatAnim` call is already a no-op there — the ghost cannot
collide with a beat reveal. `playTilt()`'s existing idempotent, self-gating, `stopMethodBeatAnim()`
-first contract (ADR-104) needed no change either.

Deliberately **not** wired into `goSkipSet` — Skip exists to cut click cost on the 15-beat/Set
template (ADR-087 Decision 2); firing a 1.65s animation on the "get me past this" control fights
its own purpose. `goBack` is likewise untouched, matching `setMethodProgress`'s pre-existing "only
a genuine forward step animates in" rule.

**Replay control.** The old `#method-tilt` pill is repurposed rather than deleted: renamed
`#method-replay-turn`, moved out of `.method-bar` into a new `.method-corner` wrapper beside
`#method-chips` (top-right, `index.html`), restyled from a full-width text pill to a small
circular icon button (↻, `aria-label="Replay the turn"`) matching `.set-chip`'s own token
language and 28px footprint. Its wiring is unchanged — same `sim.method.playTilt()` call,
`renderProgress`'s same `hidden = !sim.method.canTilt()` gate, same idempotent-replay contract.
Rejected the alternative of overloading the Set 3 chip's re-click to trigger replay: ADR-084
Decision 7 ("chips only ever focus/zoom, never move the sequence") is easiest to keep intact by
construction when the replay trigger is a different element entirely, not a second meaning
layered onto a chip click; a chip-click-count-based exception would also be undiscoverable.
`.method-corner` takes over `.set-chips`' old `position: absolute; top; right` so the replay
button can be `chipRow`'s sibling rather than its child — `renderChips()` still does
`chipRow.innerHTML = ''` on every `start()`, which would otherwise wipe a static button nested
inside it.

**`canTilt()` tightened.** It previously tested only `turnDeg != null`; `startMethodTilt` itself
also requires `methodArcEligible(set)` (Set 3's true-shape view must genuinely be the top view —
the same guard the rigid-2D-motion claim depends on). A Set could theoretically satisfy the first
but not the second, showing/enabling a control `startMethodTilt` would then silently no-op. Folded
`methodArcEligible` into `canTilt()` itself (`main.js`), so one predicate now backs the auto-play
gate in `goNext`, the replay button's visibility, and the engine's own guard.

**Alternatives rejected:**
- **Derive θ from `turnDeg`'s own sign instead of wrapping the measured difference.** Rejected —
  ADR-104 already rejected this once for the un-wrapped case (the `projectSheet` y-flip makes
  declaring the sign from `turnDeg` the exact ported-sign trap `Module2/CLAUDE.md` warns about);
  wrapping the MEASURED value preserves ADR-104's "measured, never declared" property while fixing
  the range bug, rather than reopening a rejected approach.
- **Block Next/disable input while the ghost plays.** Rejected — every other Show Method animation
  (beat stroke-in, focus pan/zoom) is already interruptible by Next (`setMethodProgress`'s
  `stopMethodBeatAnim()`), and special-casing the ghost to block input would be the one
  inconsistent animation on the platform.
- **Auto-play on `goSkipSet` too, since it also can cross into Set 3.** Rejected — see Decision
  above; contradicts Skip's own click-cost-mitigation purpose (ADR-087 Decision 2).

**Consequences:** `drawMethodGhost`'s `theta` computation (`main.js`) gains a wrap loop.
`stopMethodBeatAnim` now also clears `methodGhost = null` (was previously left stale on a
cancelled-mid-flight tilt; harmless since `drawMethodView` gates on `methodTiltActive`, but no
longer left dangling). `sim.method.canTilt()` (`main.js`) now also checks `methodArcEligible`.
`methodController.js`'s `goNext` gains one guarded `playTilt()` call; its local `tiltBtn` is
renamed `replayBtn` (`#method-tilt` → `#method-replay-turn`). `index.html` gains `.method-corner`
and `.method-replay`; `.set-chips` drops its own `position/top/right/z-index` (now inherited from
the wrapper). `METHOD_BEAT_COUNT` (14) and the ghost's timing constants are unchanged.
**Status:** Active. Amends ADR-104's Scope clause; ADR-104 itself stays Active.

---

## ADR-106: Module 2's Profile Plane folds INTO the VP about the VP∩PP line, not down onto the HP — the Side view lands beside the FRONT view, not the Top view

**Date:** 2026-08-04
**Decision:** A 2026-08-04 faculty review flagged that Module 2 — the platform's master/reference
implementation for orthographic-view layout (`Module2/CLAUDE.md`) — laid the Side view out
against the wrong anchor. Standard first-angle projection: **Front is the anchor**; Top sits
directly below it (shared vertical projectors, same width band); **Side sits directly to the
RIGHT of Front, at the same height** (shared horizontal projectors, same height band). Side has
no direct projection relationship with Top. Module 2 instead folded the Profile Plane DOWN onto
the HP (`PP_FOLD_TARGET = −π/2` about `ppHingeGroup`'s local X, the hinge a world-space SIBLING
of `vpFoldGroup`), landing the Side view beside the **Top** view — a bottom-right "4th-quadrant"
block sharing Top's row instead of Front's.

Fixed in `Module2/` only (scope: this session; the clone, Glass Box, and Sections carry the same
bug and are follow-up work — see Consequences):
- `ppHingeGroup` is now **nested inside `vpFoldGroup`** (was a scene-level sibling), positioned at
  local `(0, 0, z0)` — the VP∩PP line now lives IN the VP's own local frame, at the z0 slice.
- `PP_FOLD_TARGET` flips to `+π/2`, applied about `ppHingeGroup`'s **local Y** (was local X). This
  folds the PP sideways INTO the VP plane about the VP∩PP line; `vpFoldGroup`'s own existing
  `+π/2`-about-Z fold then carries it down WITH the front view, same `foldProgress` driving both.
- Full derivation (local PP point `(x,y,0)` → world): `R_y(+90°)` → `(0,y,−x)` → `+hinge(0,0,z0)`
  → `(0,y,z0−x)` in `vpFoldGroup`'s frame → `vpFoldGroup`'s own `R_z(+90°)` → `(−y,0,z0−x)` in
  world → answer-sheet camera `(sheetX,sheetY)=(−worldZ,−worldX)` → sheet `(x−z0, y)`. `sheetY=y`
  is now **identical to the Front view's own `sheetVP.y=worldY`** (was `sheetY=−x`, identical to
  Top's `sheetHP.y=−worldX`) — Side now shares Front's height band.
- `projectionDrawer.js`'s flat-connector builder ties the folded Side point to the folded FRONT
  point (`foldedFront = (-vertex.y, 0, vertex.z)`, `foldedSide = (-vertex.y, 0, z0-vertex.x)` —
  both share world x, giving a horizontal projector), not to `projectHP(vertex)`.
- `drawCompare()`'s X1-Y1 reference line is now identified as the VP∩PP hinge (was HP∩PP) and its
  length spans the Front+Side block (`vpBox`), not Top+Side (`hpBox`) — see the ADR-056 amendment.
  Its position formula, `x1X = −z0`, is numerically unchanged (the hinge's sheetX is the same
  either way).
- `Module2/src/stepper.js:49`'s Step-6 tutorial caption ("the side view beside the front") needed
  **no change** — the copy was already correct; only the code contradicted it.

**Why:** `Module2/CLAUDE.md` designates this module the design-system's master/reference
implementation (echoed in the platform root `RULES.md`), so its layout bug propagated by
citation rather than staying contained: ADR-049 explicitly ported Module 2's fold to
`graphics_module_1_topic_4_understanding_orthographic_views` for "parity," **overturning that
topic's own correct fold** (ADR-044, which had it right — Side right of Front — hours earlier the
same day). The bug is deliberate-looking (`PP_FOLD_TARGET`'s own doc comment asserted the
Top-relative placement as intended, "the 4th-quadrant layout"), not an oversight, so a straight
faculty audit was needed to catch it. Root cause was almost certainly a literal Unity-prototype
port that was never re-checked against first-angle convention — exactly the risk
`Module2/CLAUDE.md`'s "re-derive every ported sign visually" rule exists to catch, and the rule
was not applied to this fold's hinge axis/nesting when it was first written.
**Alternatives rejected:**
- **Keep the HP-fold hinge, fix only `drawCompare()`'s sheet formula.** Rejected — the 2D sheet
  and the 3D pane's own live fold must show the SAME layout (`drawCompare`'s header comment: sheet
  points are read "exactly where the 3D pane's own fold puts them"); patching only the 2D sheet
  would silently diverge the two surfaces, the same anti-pattern ADR-044 explicitly rejected for
  Glass Box ("mirror the 2D Compare sheet layout instead... papering over it").
- **Keep `ppHingeGroup` a world-space sibling, fold it about a different axis to fake landing
  beside Front.** Rejected — Front's own view MOVES (it's parented to `vpFoldGroup`, which
  animates); a sibling pivot cannot track a moving target without duplicating `vpFoldGroup`'s
  rotation by hand every frame. Nesting is the only construction where "ride the VP fold down" is
  automatic and stays correct through the fold animation, not just at `foldProgress=1`.
**Consequences:** `Module2/src/projectionDrawer.js`'s `visibleInPP`/`projectPP`/`options.z0`
doc comments updated to name the VP∩PP hinge; the `worldNormal.z > 0` visibility test itself is
UNCHANGED (observer direction is independent of the fold). `answerSheetBox()`'s Z-range formula
updates from `z0 − y` to `z0 − x`. `positionRefLabels()` places `sideViewLabel` in the Front
caption's X-band instead of the Top caption's. `simAPI.reset()`'s `ppHingeGroup.rotation` reset
moves from `.x` to `.y`. Verified live (PHP dev server, foreground Chrome tab — MCP tabs run
`document.hidden=false` here so no rAF-pump workaround was needed): Compare 2D sheet shows Side
right of Front at matching height with nothing beside Top; the 3D pane's flattened answer-sheet
view shows the same; dragging **Distance from HP** moves Front+Side together with Top fixed;
dragging **Distance from VP** moves Top down and Side right with Front fixed; cycling shapes
(cube/pyramid/cylinder/prism ×5) produced no console errors. **Known pre-existing, unrelated
issue found during verification and left untouched (out of scope):** `positionRefLabels`'s shared
`M = 2.0` world-unit caption overshoot is disproportionately large relative to a small solid's
own bounding box (e.g. a 20mm-base pyramid is ~2 world units per `WORLD_TO_MM=10`), which pushes
the "Top View"/"Front View" captions (not "Side View," whose overshoot direction happens to stay
on-canvas) far outside the Compare sheet's auto-fit frame for small solids. Pre-dates this ADR;
worth its own ticket.
**Follow-up (separate sessions, not fixed here):** `graphics_module_3_topic_1_sections_of_solids`
(`src/projectionDrawer.js` ported the same Top-relative connector logic; this module has no 2D
Compare sheet of its own, so only its live-3D projector geometry is affected) carried the bug —
now fixed, see ADR-109.
`graphics_module_2_topic_2_simple_positions` (Module 2 clone) carried the same byte-identical
pre-fix code but is now fixed — see ADR-107, which backports this ADR to that clone.
`graphics_module_1_topic_4_understanding_orthographic_views` (Glass Box) also carried the bug
(ported here by ADR-049's citation) but is now fixed too — see ADR-108, which restores that topic's
own pre-existing correct fix (ADR-044) rather than porting this ADR's nested-hinge construction,
since Glass Box's VP does not fold (unlike Module 2's).
**Status:** Active. Supersedes ADR-049's fold clause for Module 2 (ADR-049 itself, scoped to
Glass Box, is separately marked Superseded above pending that topic's own fix). Amends ADR-056
(X1-Y1 identity/length only; its position formula is unchanged).

---

## ADR-107: ADR-106 backported to the Module 2 clone (`graphics_module_2_topic_2_simple_positions`) — Side view now lands beside Front, not Top

**Date:** 2026-08-04
**Decision:** Per ADR-009 (copy-paste-clone architecture, no automatic sync), ADR-106's Side-view
fold fix was hand-transplanted from `Module2/` into its "simple positions" clone, which carried
the identical bug byte-for-byte in every affected hunk of `main.js` and `src/projectionDrawer.js`
(`ppHingeGroup` a world-space sibling of `vpFoldGroup` folding `−90°` about local X onto the HP;
`sheetPP`, `answerSheetBox()`, `positionRefLabels()`, the X1-Y1 reference line, and the flat
side-view connector all keyed off the same Top-relative placement). The fix and its full
derivation are ADR-106's, cited rather than re-derived here: `ppHingeGroup` now nests inside
`vpFoldGroup` at local `(0, 0, z0)`, `PP_FOLD_TARGET` flips to `+π/2` about local Y, and every
consumer of the fold (`applyFoldVisual`, `answerSheetBox`, `positionRefLabels`, `drawCompare`'s
`sheetPP`/X1-Y1 block, `simAPI.reset`, and `projectionDrawer.js`'s `visibleInPP`/`projectPP`/flat
connector) was updated in lockstep, exactly mirroring ADR-106's own hunks.
**Clone-specific notes (where this session diverged from a literal copy):**
- This clone has no `methodController.js` / Show Method feature (`sim.method.*` calls were
  surgically removed in an earlier session — "simple positions" never tilts), so the ADR-105
  hunks bundled into the same Module2 commit (`c288974`) that also carried ADR-106 — the ghost-turn
  angle wrap, `canTilt`'s `methodArcEligible` gate, `stopMethodBeatAnim`'s `methodGhost` reset —
  do not apply and were skipped entirely.
- The clone's `ppPlaneLabel` sits at local `(0, 4, 0)` (Module2 uses `(4, 4, 0)`) — left as-is,
  only the surrounding comment was updated to flag it for re-verification against the new
  composed fold, per Module2's own equivalent comment.
- A handful of this clone's comments (`main.js`'s `ppHingeGroup` doc, the `rebuild()` PP-standoff
  comment, `refreshProjections()`'s parent comment, and the `buildScene()` block comment above the
  PP grid) already described the nested/VP∩PP design in prose — stale drift written ahead of code
  that was never actually updated to match. Those comments needed no further edit; the code has
  now caught up to what they already claimed. Every other comment in both files still described
  the old HP∩PP/Top-relative fold and was rewritten to match Module2's corresponding fixed comment.
- `src/stepper.js:49`'s Step-5 copy already read "the side view beside the front" — like Module2's
  own stepper caption, it needed no change; only the code disagreed with it.
**Why:** Same as ADR-106 — first-angle convention requires Side to share Front's height band, not
Top's. This is a straight backport, not an independent re-derivation; the geometry/signs are
proven in ADR-106 and were not re-litigated here.
**Consequences:** `DECISIONS.md`'s ADR-106 Follow-up list amended to strike this clone (see above).
`graphics_module_1_topic_4_understanding_orthographic_views` (Glass Box) and
`graphics_module_3_topic_1_sections_of_solids` still carry the bug — unaffected by this session.
Verified live (foreground Chrome tab, XAMPP-served — MCP tabs run `document.hidden=false` here so
no rAF-pump workaround was needed) against ADR-106's own pass criteria: 2D Compare sheet shows
Side right of Front at matching height with nothing beside Top; the 3D pane's flattened answer
sheet agrees; dragging Distance from HP moves Front+Side together with Top fixed; dragging
Distance from VP moves Top down and Side right with Front fixed; the X1-Y1 reference line stays
pinned under both sliders; shape cycling (cube/pyramid/cylinder/prism ×5) produced no console
errors; `renderer.info.memory` geometry/texture counts stayed flat across rapid rebuilds.
**Status:** Active.

---

## ADR-108: Glass Box's Profile Plane folds sideways into the VP about the VP∩PP line — restoring ADR-044, superseding ADR-049's fold clause

**Date:** 2026-08-04
**Decision:** In `graphics_module_1_topic_4_understanding_orthographic_views`, the PP fold reverts
to ADR-044's original design: `foldPivotPP` becomes a scene-level SIBLING of `foldPivotHP` (both
children of `foldRoot`, alongside the fixed `vpRoot`) instead of nested inside the HP hinge's inner
group. Its pivot moves from `(D,−D,0)` (the HP∩PP line, along Z) to `(D,0,−D)` (the **VP∩PP** line,
along Y); `PP_FOLD_ANGLE` flips from `−π/2` to `+π/2`; `applyFoldPose()` drives it via
`foldPivotPP.rotation.y` (was `.rotation.z`). This lands the Side view **beside the Front view, at
the same height** (shared horizontal projectors), not beside the Top view. `drawCompare()`'s 2D
sheet is rewritten in lockstep: `sideC` moves from the bottom-right (beside Top) to the right of
Front at Front's own centre-Y, the second fold-reference line moves from between Top/Side to
between Front/Side, and the Side view's own drawing is re-authored with its axes swapped
(`u = +worldZ` horizontal, `v = −worldY` vertical, matching Front's height convention) — since this
topic's Compare sheet is hand-authored directly from the dimension table (ADR-050), not derived
from the 3D fold geometry, so it cannot simply be "moved," only redrawn rotated.
**Why:** ADR-044 (2026-07-13) had this right the same day it was written — PP hinges directly onto
the fixed VP about their shared edge, swinging Side to the right of Front. Hours later, ADR-049
reverted just this fold clause to instead nest the PP hinge inside the HP hinge and fold it down
onto the HP, explicitly citing "Module 2 parity" (`PP_FOLD_TARGET`) as the reason. That citation was
the bug: Module 2 itself had the wrong layout at the time (Side beside Top, a "4th-quadrant"
misreading of first-angle projection), not fixed until ADR-106 that same faculty-review session
(2026-08-04). ADR-106's Status note and Follow-up list already flagged that this topic inherited
the mistake via citation and would need its own pass. **Module 2's own fix (ADR-106) does not
transplant here.** ADR-106 nests Module 2's `ppHingeGroup` inside `vpFoldGroup` because Module 2's
VP is not fixed — it folds along with the rest of the box (`vpFoldGroup`'s own `+π/2`-about-Z), so a
free-standing PP pivot could never track a moving Front view; nesting is what lets "PP into VP, VP
into the fold" compose automatically at every frame of the animation. Glass Box's VP (`vpRoot`) is a
plain group at identity — it never moves — so nothing needs to ride along with it, and the pivot can
sit directly on the VP∩PP line as a scene sibling, exactly as ADR-044 originally built it. This ADR
is therefore a **restoration** of Glass Box's own prior, independently-correct fix, not a port of
Module 2's construction, and the geometry was re-verified by hand rather than copied from either
ADR-044 (whose literal code no longer exists — the whole 2026-07-13 build landed in one squashed
commit, `6f7376f`, with no finer git history to restore from) or Module 2's ADR-106 (wrong topology
for this module): a PP pane point `(D,y,z)` rotated `+π/2` about local Y at pivot `(D,0,−D)` lands
at world `(2D+z, y, −D)` — height `y` passes through unchanged (same band as Front's own
`(x,y,−D)`), and the horizontal coordinate `2D+z` places it to the right of the fixed VP with the
explode gap preserved between panes.
**Alternatives rejected:**
- **Port Module 2's ADR-106 nested-hinge construction as-is.** Rejected — see Why: it solves a
  problem (a moving VP) that does not exist in this topic. Copying it would nest PP inside a HP
  hinge that has no reason to carry it, adding indirection for no benefit and leaving the topic's
  own architecture inconsistent with its own "VP is fixed" invariant (documented in this topic's
  fold-overview comment since ADR-044).
- **Patch only `drawCompare()`'s 2D layout, leave the 3D fold alone.** Rejected for the same reason
  ADR-106 rejected it for Module 2: the 2D sheet and the live 3D fold must show the same layout, or
  the two surfaces silently diverge — the exact anti-pattern ADR-044 itself flagged when it rejected
  "mirror the 2D Compare sheet instead" as papering over a 3D bug.
**Consequences:** `main.js`'s fold-overview comment block, the `foldPivotPP` state doc, and
`assembleScene()`'s HINGE TOPOLOGY doc are rewritten to describe the sibling topology and the
VP-is-fixed rationale, so a future session doesn't reach for Module 2's nested pattern again without
re-checking this module's own architecture first. `src/glassBox.js`'s header comment and
`createGlassBox()` docstring (prose only — no code there depends on fold direction; the pane
geometry is authored in world space at rest and the hinge alone determines its folded position) are
updated to match. Verified live (XAMPP `:8080`, foreground Chrome tab — this environment runs
`document.hidden=false`, so no rAF-pump workaround needed, per ADR-106/107's own verification note):
driving Step 1→5, the 2D Compare sheet shows Side right of Front at matching height with nothing
beside Top; the 3D pane's flattened fold agrees; the Fold/Unfold rail toggle replays correctly both
directions mid-tween; `renderer.info.memory` geometry/texture counts stay flat across repeated
`simAPI.reset()` cycles; zero console errors. This topic has no HP/VP distance sliders (unlike
Module 2), so ADR-106's drag-behaviour check has no analogue here; substituted with orbit-drag and
fold-replay checks instead.
**Status:** Active. Supersedes ADR-049's fold clause (its other three clauses — exploded planes,
CSS2D plane pills, CSS2D Observer icon — are unaffected and stand). Restores ADR-044's original fold
design. Strikes `graphics_module_1_topic_4_understanding_orthographic_views` from ADR-106's
Follow-up list — `graphics_module_3_topic_1_sections_of_solids` was the only item remaining and is
now fixed too, see ADR-109; ADR-106's Follow-up list is fully closed.

---

## ADR-109: Sections of Solids' flattened side-view connector now ties to the FRONT view, not the Top view — closing ADR-106's Follow-up list

**Date:** 2026-08-04
**Decision:** `graphics_module_3_topic_1_sections_of_solids` was the last module named in ADR-106's
Follow-up list. `src/projectionDrawer.js`'s `flatConnectors` batch (`drawProjections()`) computed
its folded side-view point as `foldedSide = (vertex.x, 0, z0 − vertex.y)` and drew the segment from
`projectHP(vertex)` (the TOP view) to `foldedSide` — sharing world X with the Top view, the same
Top-relative construction ADR-106/107/108 all fixed elsewhere. Corrected to match those ADRs
exactly, cited rather than re-derived here: `foldedSide = (−vertex.y, 0, z0 − vertex.x)`, drawn
from `foldedFront` (not `projectHP(vertex)`) to `foldedSide` — Front and Side now share world X
(`−vertex.y`), giving a horizontal projector, and the segment ties Side to Front as first-angle
projection requires.

Two things distinguish this module from the other three fixes and are worth recording:
- **This module has no fold pivot at all.** `main.js` has no `vpFoldGroup`, `ppHingeGroup`, or
  `PP_FOLD_TARGET` — the fold-to-flat-sheet animation is explicitly unbuilt (`CLAUDE.md`'s own
  "Build status" line, `main.js`'s file-header comment). The profile plane is carried by a plain,
  unrotated `ppHolder` translated to `z0` (`main.js:611-616`). So unlike Module 2/its
  clone/Glass Box, there was never a wrong *fold* to fix here — only the wrong *connector* math,
  copy-pasted from the pre-fix Module2 source (ADR-060/061 note this file was copied
  byte-identical at the time). This is the scope the task brief predicted and the audit confirmed.
- **The buggy geometry was never actually rendering.** `main.js:619-622` builds
  `flatConnectorGroup` and immediately parks it `visible = false`, with a comment noting the
  group is held for "a later (fold) phase." The fix is therefore a **latent-bug** fix: no visual
  regression existed to observe before or after, because the group has never been shown. Chose to
  fix it now anyway rather than leave it for whoever builds the fold phase, since the wrong
  formula would otherwise ship silently the day that phase lands and the group's `visible` flag
  flips to `true`.

Also corrected in the same pass: four doc comments in `projectionDrawer.js` (`visibleInPP`'s SIGN
note, `projectPP`'s hinge description, `flatConnectorGroup`'s JSDoc, and the `options.z0` JSDoc)
that described the old HP∩PP/beside-Top construction — two of them (`projectPP`'s doc citing a
rotation on `ppHingeGroup`, and `options.z0`'s doc citing `ppHingeGroup.position.z`) also named
state objects (`ppHingeGroup`, a rotated hinge) that do not exist anywhere in this module's
`main.js`, i.e. they were already inaccurate independent of the Top-vs-Front bug. Reworded to
describe the actual current state (a static `ppHolder`, no rotation) plus the contract a future
fold-phase implementation must satisfy (VP∩PP hinge, nested pivot per ADR-106's reasoning, since
this module's own VP will presumably fold like Module 2's rather than staying fixed like Glass
Box's — left as an open call for whoever builds that phase, not decided here).

**Why:** Same first-angle rationale as ADR-106/107/108 — Side has no direct projection
relationship with Top; it shares Front's height band. Not re-litigated here.
**Alternatives rejected:**
- **Re-copy `Module2/src/projectionDrawer.js` verbatim, per this module's own `CLAUDE.md:11-13`
  ("BYTE-IDENTICAL Module2 copy... fix drift in Module2/ and re-copy, never patch here").**
  Rejected — measured drift between the two files is 504 changed lines across 18 diff hunks
  (`diff --strip-trailing-cr`). Module2's copy has since grown ADR-087's base/generator edge
  batches, ADR-102/103's restricted dimension layer, and other features this pruned module
  neither has nor wants. A re-copy would be a large, unreviewed behavior change disguised as a
  sync. Hand-patched instead, and `CLAUDE.md:11-13` is corrected in this same session to record
  the drift and retire the "never patch here" instruction — see Consequences.
**Consequences:** `graphics_module_3_topic_1_sections_of_solids/src/projectionDrawer.js`'s
`foldedSide` math and its four surrounding doc comments are updated (see Decision). This module's
own `CLAUDE.md:11-13` is corrected to stop claiming byte-identical parity with Module2 and to
record that targeted, ADR-cited patches are the route for this file going forward. ADR-106's
Follow-up list is now fully closed (see that ADR's amended Status note above).

Verification could not follow ADR-106/107/108's own live-3D-pane pattern, because the connector
group in question is never shown (`main.js:619-622`, see Decision). Verified instead by
temporarily forcing `flatConnectorGroup.visible = true` at runtime in a foreground Chrome tab
(XAMPP-served, no rAF-pump workaround needed — this environment runs `document.hidden = false`
per ADR-106/107/108's own note) and reading the rendered `LineSegments2`'s
`instanceStart`/`instanceEnd` attributes directly: every side-view projector's two endpoints now
share world X (the horizontal, Front-aligned signature the fix predicts), where before the fix
they did not. Screenshot confirmed the same visually — side projectors run horizontally out of
the front view rather than along Z out of the top view. Reverted the runtime override via reload;
confirmed zero console errors and flat `renderer.info.memory` geometry/texture counts across
repeated `simAPI.reset()` cycles.

Two things were noticed during the audit but are explicitly **out of scope** for this ADR:
- This module carries dormant 2D-Compare-sheet scaffolding (`index.html`'s `.compare-card` CSS
  and a `hidden` card, `projectionDrawer.js`'s vestigial `segments.userData.hidden` tag) with
  comments naming a `drawCompare()` that is never wired into `main.js`. Confirms ADR-106's own
  note that this module has no 2D sheet. Whoever wires it must use the Front-anchored layout
  fixed here, and must build any fold pivot nested (ADR-106's construction), not as a scene
  sibling (ADR-108's construction) — this module's VP is not obviously fixed the way Glass Box's
  is, so that choice needs its own re-derivation, not a default copy of either prior fix.
- `graphics_module_2_topic_2_simple_positions/src/projectionDrawer.js` no longer sets
  `segments.userData.hidden`, but its `main.js:2689-2690` still reads that tag to choose dash
  pattern/line width for its 2D Compare sheet — so that sheet now draws every line solid. Checked
  against `git show HEAD` and confirmed this predates ADR-107's uncommitted work, i.e. it is a
  pre-existing, unrelated drift bug, not a regression from any session in this ADR chain. Left
  untouched; worth its own ticket.
**Status:** Active. Closes ADR-106's Follow-up list (all four modules now fixed: Module2 itself
by ADR-106, the clone by ADR-107, Glass Box by ADR-108, Sections of Solids here).

---

## ADR-110: Projection of Straight Lines — Art 10-8 Method II added; traces fixed for θ+φ=90°

**Date:** 2026-08-04
**Decision:** `graphics_module_1_topic_6_projection_of_straight_lines/src/sheet2DLayout.js`'s
`computeTraces()` implemented only Art 10-10 Method I (extend a view to xy, drop a projector,
extend the other view to meet it). When both projections are perpendicular to xy — θ+φ=90°, Art
10-7's profile-plane case, reachable from the sliders and not merely a boundary curiosity — Method
I's `xAtY`/`yAtX` helpers return `null` (the view has no finite slope), and the code silently fell
back to the endpoint's OWN coordinate as the trace. That fallback is *correct* for the true
point-view cases (line ⟂ HP or ⟂ VP, Art 10-9 fig. 10-21 — the trace really does coincide with the
point view) but *wrong* for θ+φ=90°: Traces.pdf p.212 Art 10-11 states outright that "it is not
possible to find the traces by the first method" there and requires Method II. A 45°/45°, 18mm/18mm
line (both traces analytically ON xy) was rendering HT and VT 18mm off — a silent, plausible-looking
wrong answer, exactly the failure mode §2.19a (added by ADR-105, same session block) now names.

Added `trapezoid()` and `methodII()` (Art 10-8 Method II — True Length.pdf figs. 10-18/10-19: erect
perpendiculars on one view equal to the OTHER view's signed offset from xy, join the far ends; that
join is the True Length, at the plane inclination the other view lies on) as pure exports on
`sheet2DLayout.js`. `computeTraces()` now branches three ways: point-view → trace coincides with
the projection (unchanged, made explicit rather than an accidental null-fallback); θ+φ=90° →
Method II, each trapezoid produced against its own view locates that view's trace (Art 10-10 Method
II / fig. 10-25, fig. 10-26); otherwise → Method I, unchanged. `traces.js` gained a matching Method
II animation branch (perpendiculars → hypotenuse → produced-to-trace, in place of Method I's
extend-to-xy choreography, since there is no h/v foot to find here). `trueLength.js`'s
`createTrueLength()` gained a `method: 'I'|'II'` parameter, defaulting to 'I' (the existing
12-phase rotating-line construction, unchanged); `main.js`'s True-Length launcher now auto-selects
`'II'` from `computeTraces(layout2D(r)).method`, so the Traces and True-Length launchers never
disagree about which method a given line requires.

Offsets in `trapezoid()` are signed (not `Math.abs`), so problem 10-7 / fig. 10-30's
opposite-sides-of-xy case falls out with no extra branch. Verified algebraically before writing
any construction code (§2.19a): `trapezoid(...).tl` reduces to `√(len²+Δoff²)` which is exactly
`TL` by the Pythagorean relation `lineData.js` already uses to derive `fvLen`/`tvLen` from `TL`,
`θ`, `φ`; `.angle` reduces to the same `atan2` expression `lineData.js` uses for `theta`/`phi`; and
reflecting the trapezoid (`side: -1`) provably cannot move where it meets its view, since a
reflection fixes every point of the view line pointwise. All three claims, plus the traced
θ+φ=90° regression case (asserting the new HT/VT are NOT at the old wrong position) and all 12
shipped Problem Library entries, are asserted by a scratch analytic Node script importing the
shipped `lineData.js`/`sheet2DLayout.js` directly (ADR-019: verify the real artifact) — 59/59
passed, plus a 16-assertion pass proving the True-Length Method II angle ARC itself sweeps the
exact `resolved.theta`/`resolved.phi`, not merely that `trapezoid()` computed the right number.
Runtime-smoke-tested (stubbed THREE/DOM) that `createTraces()`/`createTrueLength()` build and
`animate(0..1)` without throwing across the full case matrix (both perpXY configurations, both
point-view cases, ordinary Method I, the θ=φ=0 default). Headless-verified per ADR-019 (Chrome via
CDP, no puppeteer): sim boots clean, zero console errors/exceptions, both construction launchers
click through the θ+φ=90° case without throwing, and `renderer.info.memory.{geometries,textures}`
stays flat (`16/0`) across 50 real-slider-driven rebuilds cycling five cases including two
perpXY configurations — confirming the new Method II geometry is disposed by the existing
`compareSheet.clearConstruction()` contract (ADR-004) with no added leak. (First attempt at this
memory check read `renderer.info.memory` synchronously inside a tight 50-iteration loop with no
`requestAnimationFrame` yield, so Three's WebGLGeometries bookkeeping — which only updates inside
an actual `render()` call — never ran; every sample silently read pre-loop state. Caught by cross-
checking against a separate sanity pass showing genuine non-zero geometry/render-call counts, and
fixed by awaiting two rAF ticks between commits — a concrete instance of §2.19a's own warning
about a check that looks like it passed for the wrong reason.)
**Why:** Correctness against the cited textbook (N.D. Bhatt, *Engineering Drawing*, Ch. 10) is this
module's whole contract (CLAUDE.md's opening line). θ+φ=90° is a named, examinable case (Art 10-7),
not an edge case to leave broken.
**Alternatives rejected:** Guard-and-suppress (detect θ+φ≈90° and simply hide the trace with a "not
computable" note) — rejected; the textbook gives a real method, and hiding a required construction
teaches an omission the source material doesn't have. Extending `sheet2DLayout.js`'s existing
null-fallback with a manual epsilon-nudge to avoid the `NaN`/coincidence-with-endpoint case —
rejected; it would still be Method I algebra applied where Art 10-11 says Method I algebra does not
apply, producing a different but equally fabricated number.
**Consequences:** Easier: `trueLength.js` and `traces.js` now share one geometric primitive
(`methodII()`) for both the True-Length recovery and the trace construction, so a future fix to one
automatically benefits the other. Harder: `sheet2DLayout.js`'s public surface grew
(`trapezoid`/`methodII`/`meet` now exported); RULES.md §3.6 named only `genericSolid.js` as the
cross-topic shared-pure exception and did not name `sheet2DLayout.js` at all even though three
Lines leaves already imported it before this change — noted, not newly created, by this ADR; a
RULES.md update naming the Lines-family exception explicitly is a good follow-up but out of scope
here (this ADR only adds functions to an already-shared file, it doesn't create the sharing
pattern). F3 (a line lying wholly IN the HP or VP reports "no trace" instead of Art 10-9's
"trace coincides with the line," reachable by the shipped `ln-incl-vp-2` problem) and F4 (no
on-screen "NO TRACE" callout matching figs. 10-20/10-21, where Method I legitimately has none) were
identified in the same audit but are explicitly OUT of this ADR's scope — real audit findings F1/F2/F5
only. Not implemented.
**Status:** Active

---

## ADR-111: Show Method's on-sheet ghost extends to Set1→Set2 (a TILT, front view) — ADR-101/104's exclusion was over-broad, not wrong about the risk

**Date:** 2026-08-04
**Decision:** Audited whether ADR-104's ghost (currently Set2→Set3 only, both-planes tier) could
safely extend to Set1→Set2, which ADR-101/104 had left out of scope on the grounds that its
"combined-Euler pose pair has no proven angle-preserving invariant the way ADR-093's yaw does."
Proved a class of Set1→Set2 (and, as a corollary, the both-planes tier's OWN Set1→Set2) IS
provably a rigid 2D motion — riding the **front** view, not the top view ADR-104 uses — and
extended the ghost to cover it. **Correction to the premise this audit started from:** ADR-093
does not prove the combined-Euler Set2→Set3 is single-axis; it proves the opposite — ADR-093
*replaced* that pose with a constructed sequential yaw precisely because the combined-Euler
version was not height-preserving.

**The proof.** Every Set's rotation is `R = Rz(-V)·Rx(H)·Ry(θ)` (`iShape.js` `applyShapeTransform`,
order `'ZXY'`). Set 1 always has every mode forced off (`planMethodStages`), so `R_from = Ry(θ_from)`
— not the identity, but exactly the right-hand factor of `R_to`. So `ΔR = R_to · R_from⁻¹ =
Rz(-V_to)·Rx(H_to)·Ry(θ_to - θ_from)`, which collapses to a pure world-**X** rotation (a TILT) iff
`V_to ≈ 0` **and** `θ_to ≈ θ_from` — both required, since a product of rotations about two distinct
world axes has no single axis. (The premise "Set 1 is untilted so only one angle changes" is not
what actually makes this work — it's that `R_from` cancels as a factor of `R_to`, which a mode
that rewrites `rotationY` between the two Sets would break even though the learner still only sees
one slider move.)

`drawMethodSheet`'s front-view flatten is `(u,v) = (-z, y)`. Under `Rx(A)`: `y' = y·cosA - z·sinA`,
`z' = y·sinA + z·cosA`; substituting `z=-u, y=v` gives `u' = u·cosA - v·sinA`, `v' = u·sinA +
v·cosA` — exact SO(2), no scale/shear. The top view drops `y`, the very coordinate `Rx` mixes into
`z`, so it foreshortens instead — the front view is *forced*, and it's the opposite view from
ADR-104's turn. Seating adds a pure translation (`m`'s translation has `z=0` identically, and the
front view's `u` reads `z`). The drawn line SET is unchanged too, not just its shape:
`visibleInVP`/`onOutlineVP` (`projectionDrawer.js`) key off `worldNormal.x`, and `edgeKindOf` keys
off a dot product with `axisDir` — both untouched by a rotation about that same world-X axis, by
construction. This is the exact dual of ADR-093 with X and Y swapped, and stronger: ADR-093 had to
construct a new pose to get its invariant; here the invariant falls out of the existing
`projectSetPose` algebra unmodified.

**Where it stays unsafe** (audited, not merely assumed): a VP-inclination 2-Set problem gives
`ΔR = Rz(-V)`, rigid only in the side view — which `METHOD_SHOW_SIDE_VIEW` hard-disables (ADR-088)
— unfixable by picking a different view, since the top view's `v'` would depend on `y`, the very
coordinate the top view drops. `orientToCorner` combined with a tilt gives `Rx(H)·Ry(Δθ)` (two
axes) since Set 1 forces the mode off while Set 2's live mode overwrites `rotationY` — reachable
only in free-explore, no shipped problem hits it. `restingPlane:'VP'` is *itself* a pure `Rx`, but
is independently excluded: its axis then points along world-X (⟂ VP), projecting to a POINT in the
front view — `methodArcEligible`'s existing `|axisDir.x| < ARC_DIR_EPS` guard already rejects it.
Explicitly **not** relying on `methodArcEligible` alone as the safety gate: `axisDir.x = cos(H)·sin(V)`
is also ≈0 at `H≈±90°` for arbitrary `V`, a combination that can't arise inside the 2-Set tier's own
data but would be an unrelated coincidence if that predicate were reused as the rigidity test
itself, hence the new `methodStepIsXTilt` states the rigidity condition explicitly instead of
inferring it from a view-degeneracy check built for something else.

**Shipped-data check.** Of the `one-plane` tier's three problems, both `faceInclinationHP` ones
(`Pyramid` 45°, `Cone` 30°) resolve to `V=0, Δθ=0` — eligible. The third
(`TriangularPyramid`/`faceInclinationVP`) resolves to BOTH `H` and `V` non-zero, so
`inclinationStageCount` returns 3 for it — it was never a 2-Set problem and was already excluded by
every existing gate (`turnDeg` stays null on its Sets). **Bonus:** the both-planes tier's own
Set1→Set2 (`{angleHP: eff.angleHP, angleVP: 0}` for the default HP-first `method.order`,
`orientToCorner:false`) also satisfies the tilt condition — both shipped both-planes problems omit
`method.order` and so both qualify, gaining a full "tilt then turn" walkthrough matching the
textbook's own two-step narration. A `VP`-first `method.order` would instead give `ΔR = Rz(-V)`
(the unsafe case above) and is rejected by the same guard automatically — no tier-specific
carve-out needed.

**Implementation.** New `methodStepIsXTilt(fromSet, toSet)` (`main.js`, beside `methodArcEligible`)
states the rigidity condition directly against `eff.angleVP`/`eff.rotationY`, gated by
`toSet.turnDeg == null` — the both-planes Set 3's `eff` is deliberately a COPY of Set 2's own
(ADR-093, for labelling only) and would otherwise satisfy the same numeric test despite its actual
motion being a yaw, not a tilt; `turnDeg` is the one field that tells the two cases apart.
`startMethodTilt` now resolves `isTurn`/`isTilt` and stores `methodGhost.kind`; the pivot rule
flips with the view (`flattenHP`'s canvas-y increases with world-x, `flattenVP`'s canvas-y
*decreases* with world-y, so "lower on screen" — the existing deterministic pivot convention —
picks the opposite raw comparison). `drawMethodGhost` picks `flattenHPAt`/`flattenVPAt` and
`.hp`/`.vp` (+ outline, + line colour) off `methodGhost.kind`, and skips the angle arc entirely for
a tilt: `strokeAngleArc`'s datum is horizontal, but a tilt's axis starts near-vertical in the front
view, so the datum would flip sides mid-flight if reused unmodified — the destination Set's own
beat-12 arc marks the settled angle a moment later instead. `canTilt()` widens to accept either
case behind one predicate, same as ADR-105's own "one predicate backs everything" precedent.
`goNext`'s trigger (`methodController.js`) needed no change — `crossedSet && sim.method.canTilt()`
already fires on any forward crossing into a ghost-eligible Set, tilt or turn. The replay button's
static label is generalized ("Replay the Set-to-Set motion") since which case applies now varies
by Set; `startMethodTilt`'s own `announce()` still narrates the specific motion and Set numbers.

**Alternatives rejected:**
- **Ghost the angle arc too, sourced from a fixed datum captured at ghost start (shrinking
  90°→settled) or swept from the ghost's own start direction (growing 0°→applied tilt).** Both
  considered and rejected in favor of no arc during the tilt: either would show a DIFFERENT number
  than the destination Set's own beat-12 caption at the moment they're both on screen together
  (the face-inclination angle named in the problem statement vs. the derived axis angle
  `axisInclinations` actually measures — a pre-existing, inherited caption mismatch this ADR does
  not fix), and a mismatched number mid-animation is worse than no number.
- **Reuse `methodArcEligible` as the sole gate for the tilt case, the same way it gates the turn
  case.** Rejected — it is a view-degeneracy test (does the axis project at full length in this
  view), not a rigidity test (is the pose delta actually a single-axis rotation); the two happen to
  coincide for the turn case (ADR-093's construction guarantees both) but do not for an arbitrary
  step, so stating the rigidity condition explicitly in `methodStepIsXTilt` is not redundant.
**Status:** Active. Narrows ADR-101's and ADR-104's "no proven invariant, out of scope" scope
clauses to the cases in this ADR's "where it stays unsafe" section; both ADRs stay Active
otherwise (their own TURN mechanics are unchanged).

---

## ADR-112: "Development of Surfaces" (Diploma, prism/cylinder/two-piece elbow) is Diploma **Module 2**, Topic 1.1 — first module beyond ADR-096's Module 1 — and its single construction plate is Canvas2D, not this track's usual SVG

**Date:** 2026-08-05
**Decision:** A new Diploma Engineering Graphics topic, scoped to **rectangular prism, cylinder, and
a symmetric two-piece 90° elbow only** (no pyramid, cone, sphere, or general truncation), is
namespaced `graphics_diploma_module_2_topic_1_1_development_of_surfaces` — **Diploma Module 2**,
Topic 1 (subtopic 1.1), per ADR-095's `graphics_diploma_module_<M>_topic_<M>_<N>_<slug>` decimal
convention (the repeated `<M>` is deliberate, per that ADR — not collapsed to a bare `topic_1`).
This is the first topic to grow this track past ADR-096's Module 1 ("Geometrical Constructions" +
"Misc Curves"), settling ADR-095's own open note ("future module numbering... left fully open
pending a future ADR") for this specific growth: Development of Surfaces is its own course module
in the source syllabus, not a third topic bolted onto Module 1.

Two further sub-decisions ride along:

1. **Canvas2D single plate, not SVG.** Every other Diploma topic renders one inline SVG viewport
   (`renderConstruction.js` emitting DOM nodes, ADR-095's inherited pattern). This topic instead
   renders to one `<canvas>` (`#construction-canvas`) carrying the front view, the top-view
   semicircle, the stretch-out development, and the horizontal transfer/projector lines connecting
   them, as ONE continuous plate — matching how the source textbooks (Bhatt Fig. 15-8/15-10, K.C.
   John Fig. 15.4–15.12) actually draw this subject: transfer lines cross freely between views on
   one sheet, which an SVG-viewport-plus-separate-canvas split cannot do (an SVG `<line>` cannot
   terminate inside a different DOM subtree's coordinate space without a second synced transform).
   This is a **deliberate, on-record deviation** — a future contributor must not "fix" this topic
   back onto the SVG pattern citing ADR-095/097 consistency; those ADRs chose SVG because their
   subjects had no multi-view single-plate transfer-line requirement, not because SVG is mandatory
   track-wide. `viewTransform.js` and `renderConstruction.js` are reimplemented against
   `CanvasRenderingContext2D` (pan/zoom via a `{vx,vy,vw,vh}` view-state + redraw, draw-on animation
   via partial-path progress instead of `stroke-dashoffset`) but keep the **same external contract**
   (`initViewTransform() → {resetView, ensureVisible, dispose}`; `renderConstruction`'s
   `clear/computeBounds/renderStatic/playSteps`) and the **same step-list data shape**
   (`{kind, role, ...}` from `constructions.js`) — only the rendering backend changes, not the
   authoring contract every other topic's `constructions.js` already uses.
2. **`developmentEngine.js` (the KTU-track engine, `graphics_module_3_topic_2_development_of_surfaces/src/`)
   is reused for its LAYOUT MATH only, copied into this topic's own `src/developmentEngine.js`.**
   `parallelLayout()` (cylinder branch) and `computeCutDistances()` (parallel/cylinder branch) are
   called from `constructions.js` as pure geometry calculators to produce step-list coordinates;
   its own `drawDevelopment()`/`drawParallelDevelopment()`/`drawStringPath()` paint functions are
   NOT called — they paint directly and non-animated, incompatible with this track's step-based
   draw-on pedagogy (ruler-bar/compass-sweep reveal per role). They ship in the copied file as dead
   code rather than being deleted, since the file is copied whole (simplest audit trail back to the
   source engine) and may earn a use if this topic later grows a "final assembled pattern" snapshot
   view. Radial-line math (`radialConeLayout`/`radialPyramidLayout`) and the string-path/"ant"
   geodesic functions are likewise unused — out of this topic's scope (no pyramid/cone/shortest-path
   problems). The rectangular prism (unequal base sides, unlike the KTU engine's equal-side
   `PRISM_SIDES` table) gets its OWN stretch-out calc in this topic's `constructions.js`, not a
   literal call into the copied `parallelLayout()`.

**Elbow scope — a named simplification, not a textbook figure.** Neither reference PDF
(`Development.pdf`, N.D. Bhatt Ch. 15; `KC-Development.pdf`, K.C. John Ch. 15) contains a worked
TWO-piece 90° elbow example — both books' only worked pipe-bend example is a THREE-piece bend
(Bhatt Problem 15-13/Fig. 15-15; K.C. John Example 15.18/Fig. 15-20–21, general form
`θ = 90°/(n+1)` for `n` middle pieces). A two-piece elbow is confirmed audit-2026-08-05 to be a
correct degenerate case: each half is a plain cylinder truncated ONCE at 45° (mitred, then
mirrored) — exactly Bhatt Problem 15-8/Fig. 15-10 and K.C. John Example 15.9/Fig. 15.12's
single-truncation cylinder construction, which `computeCutDistances()`'s existing parallel/cylinder
branch already covers with zero new math (one `localPlane`, called twice — once mirrored). This
topic's ADR/CLAUDE.md must cite that single-truncation math as the source, not a numbered elbow
figure, since none exists at two-piece scope.

**Why:** RULES.md §1.11/ADR-025's template-choice discipline applies to the module-number question
the same way ADR-096 applied it; ADR-095's own placeholder note requires a real ADR before this
track's first Module-2 topic, not silent folder creation. The Canvas2D call is a genuine
architectural fork (this track's first) so it gets recorded rather than discovered later as an
unexplained outlier against ADR-095/097/098's SVG precedent.

**Alternatives rejected:**
- *Fold this into Diploma Module 1 as a further Topic 3* — rejected: the source syllabus draws its
  own module boundary here (a distinct course module, "Development of Surfaces"), the same
  reasoning ADR-096 used in the other direction to keep Misc Curves inside Module 1.
- *Keep the SVG viewport, fake cross-surface transfer lines with per-view stub ticks* — rejected
  before this ADR (see the earlier Phase-A audit): breaks the textbook's actual single-plate
  reading and would need its own future un-fix once a real transfer-line requirement showed up.
- *Rewrite `developmentEngine.js`'s draw functions to emit SVG step nodes, keep the whole plate in
  one SVG* — rejected: throws away the one part of the KTU engine that already works
  (`computeCutDistances`) for no gain, since this topic needs the step-list contract either way to
  get animated draw-on; Canvas2D is the more direct realization of "one continuous plate" as several
  existing views on this platform (the Module 2 Compare sheet, ADR-066) already prove out.
- *Build the Bhatt/K.C. John three-piece elbow verbatim* — rejected for THIS topic's stated scope
  (two-piece symmetric only); left as a documented future-phase seam (this topic's
  `computeCutDistances` call is structured to accept a middle double-truncated piece later without
  an engine rework, since that piece is just two `localPlane` cuts on one cylinder instead of one).

**Consequences:** Establishes Diploma Module 2 as a real, numbered thing — the next Diploma topic
that is NOT Development of Surfaces stays in Module 1 unless it has its own equally genuine
syllabus-module boundary (do not default new Diploma topics to Module 2 by proximity). Establishes
that this track's SVG orchestrator is a strong default, not an absolute rule — citing THIS ADR's
Canvas2D reasoning (multi-view single-plate transfer lines) is the bar for any future topic wanting
the same deviation, not "SVG felt harder." `src/developmentEngine.js` in this topic's folder is an
**independent copy**, not a byte-identical shared file under RULES §1.3/§1.4 — the KTU-track engine
and this copy are permitted to drift (different `ShapeType` tables, different scope), so no
cross-file sync obligation is created by this ADR.
**Status:** Active.

**Addendum (2026-08-05): 3D View step added.** A new wizard step, 3D View, is inserted between
Choose and Given (Choose → 3D View → Given → Construct → Verify). This is the track's first
Three.js dependency, using Module 2's boot/disposal contract and `cube.js`/`cylinder.js`
generators — copied fresh, not shared via the byte-identical family guarantee (RULES §7.2 doesn't
extend to this track), matching the precedent already set for `developmentEngine.js`. The
two-piece elbow requires a bespoke `elbowHalf.js` generator (no existing platform elbow mesh); it
reuses the 2D construction's `cutHeight()` mitre-plane math, not shared geometry code. The
existing Canvas2D development plate (front view + top view + development + transfer lines, one
sheet) is unchanged — 3D is additive, not a replacement. See ADR-097's own addendum for the
override this step required. **Superseded the next revision pass, before any of this was
committed — see the 2026-08-06 addendum immediately below.**

**Addendum (2026-08-06): the 3D View STEP above is replaced by a Compare card — nothing from the
2026-08-05 addendum above had been committed yet, so this is a same-arc revision, not a rollback.**
Two things surfaced this revision, stated plainly rather than silently reworked: (1) an unrelated
audit of this topic's elbow drawing (front view pinned top-left instead of centered — a routine
`constructions.js` `planPlate()` bug fix, logged in this topic's own CHANGELOG.md, not here)
prompted re-reading Bhatt's actual page layout for this chapter
(Fig. 15-1, 15-3 through 15-15) — **every** figure puts the small isometric pictorial and the
front/top+development plate **side by side in one figure**, never sequentially (view the solid,
leave it, then draw). The 3D View step contradicted the source material's own presentation.
(2) Checking the platform's own Compare precedent surfaced ADR-080 (below): the floating/compact
Compare card is fixed and removed everywhere, platform-wide — Compare has exactly one shape, the
docked ADR-037 50/50 split. A "3D View step" was never going to reconcile with that; a Compare
card is the shape the platform has already standardized on for "peek at a second view without
losing the main one."
**Decision:** the wizard reverts to the platform's standard four-step shape (Choose → Given →
Construct → Verify, `stepper.js`). The 3D solid moves into a docked Compare split
(ADR-012/037/080), **roles reversed from every other Compare topic on the platform**: this topic's
Canvas2D construction plate (`#sim-viewport`) is already the primary pane (ADR-112 §1), so Compare
docks the 3D solid (`view3d.js`, unchanged) as the SECOND pane instead of a 2D drawing — the usual
direction is 3D-primary/2D-secondary (Points, Lines, the KTU
`graphics_module_3_topic_2_development_of_surfaces` sibling); this is the first Compare-card topic
built the other way around. `#given-fields` (the Given step's dimension sliders) docks into the
split's `#workbench-rail` — unlike the sibling topics' rail (which docks a solid/cutting-plane
*picker*), this rail exists so dimensions stay LIVE-adjustable while comparing solid against
pattern, which the old sequential step structurally could not offer (Given and 3D View were
different steps, never both on screen). `main.js`'s `rebuild()` now calls `view3d.js`'s
`rebuild3D()` directly whenever Compare is open, closing that gap. `view3d.js`/`cube.js`/
`cylinder.js`/`elbowHalf.js` are UNCHANGED — the lifecycle API (`show3D`/`hide3D`/`rebuild3D`/
`resumeLoop3D`/`clear3D`) was already caller-agnostic, so only the caller (`main.js`, `stepper.js`,
`index.html`) needed rewiring.
**Files touched:** `stepper.js` (5→4 steps), `main.js` (compare state machine replacing
`onEnter3DStep`/`onLeave3DStep`), `index.html` (Compare chip/card/workbench-rail/rail-toggle
markup + CSS, ported from the KTU sibling topic), `view3d.js` (comment wording only — "Step 2" →
"Compare open/close" throughout, no behavior change). `cube.js`/`cylinder.js`/`elbowHalf.js`
untouched. `constructions.js` got the unrelated `planPlate()` centering fix noted above, same
pass, logged in CHANGELOG.md rather than here (routine bug fix, not a decision).
**Status:** Active. The 2026-08-05 addendum above is superseded by this one.

**Addendum (2026-08-06): pane order swapped to 3D-left/2D-right, and the 3D solid gains corner
numerals — the thing that makes Compare pedagogical, not just decorative.** This addendum's own
"roles reversed" language above ("Compare docks the 3D solid as the SECOND pane") was read too
literally into pane *position* as well as pane *role* — re-reading Bhatt Fig. 15-1/15-3…15-15
confirms every figure puts the isometric pictorial and the construction plate side by side with
the pictorial FIRST (left), never the plate first; every other Compare-card topic on the platform
(Points, Lines, the KTU sibling) also puts 3D left. The Canvas2D plate stays this topic's primary
pane in role (ADR-112 §1 — it's still what Choose/Given/Construct/Verify drive), but its screen
position moves right. Pure CSS: `index.html`'s `grid-template-areas` string order flipped at all
four split/rail-collapsed/mobile sites; DOM order and `main.js`'s `enterWorkbench()`/
`exitWorkbench()` re-parenting are untouched, since grid position is expressed entirely by
`grid-area` names, not DOM order or an `order:` property.

Separately, and this is the change that actually closes the loop Compare was built to provide: the
3D prism's corners are now numbered `1,2,3,4` (unprimed on both the base and top ring), matching
`constructions.js`'s own top-view/development station numerals exactly (DESIGN.md §6) — until now
the 3D solid carried no labels at all, so a student comparing panes had no way to trace a specific
corner across them. New leaf `src/labels3d.js`, adapted from `Module2/src/vertexLabeler.js`
(CSS2DObject DOM pills; independent copy, not byte-identical-shared, same precedent as this
topic's own `cube.js`/`developmentEngine.js` — RULES §7.2's guarantee doesn't reach this track).
Unlike `vertexLabeler.js`'s generic `uniqueLocalVertices`/`orderRing` atan2 inference (built for
arbitrary n-gon solids), the prism's 8 corners are read directly off `BoxGeometry`'s own bounding
box against an explicit, auditable station table — exact for a box, not inferred. `view3d.js`
gained a `CSS2DRenderer` overlay (mounted/resized/rendered alongside the existing
`WebGLRenderer`, same `z-index:1`-traps-the-label-stacking-context fix `Module2/CHANGELOG.md`
already recorded once); no new dependency, `three/addons/` was already import-mapped. Numerals
are Prism-only this phase — `rebuild3D()` clears them for cylinder/elbow — matching the
solid-by-solid rebuild already underway for the 2D plate (ADR-113/114).

**A discrepancy surfaced, not fixed:** deriving the 3D↔2D corner mapping required reading
`constructions.js`'s own first-angle convention (`toTop`'s `y=0` is nearest the fold line, i.e.
nearest the VP/rear) against `edges = [Lf, Wd, Lf, Wd]`'s comment, which labels that same walk
"front → right → back → left". The two disagree on which wall is "front". Nothing renders wrong —
a plain rectangular box's top view is symmetric, so the edge walk is a valid closed circuit either
way and every on-screen measurement is unaffected — but the comment's prose is inconsistent with
the file's own first-angle derivation elsewhere. Left as-is pending confirmation; flagged here
rather than silently reworded.
**Status:** Active.

---

## ADR-113: Development of Surfaces (Diploma) 2D plate — Phase 1 rendering rebuild (screen-space paint, Module2-parity ink hierarchy, textbook annotation) — Prism only, solid-by-solid

**Date:** 2026-08-06
**Decision:** Two prior same-day patches to this topic's `renderConstruction.js` (aliasing
`given`→`--color-ink`, adding paper-knockout text — both logged in the topic's own `DESIGN.md` §3)
did not close the visual gap against Module2's Show Method sheet, the cited quality bar. Rather than
patch further, `Module2/main.js`'s entire Show Method drawing section (`drawMethodSheet` + every
helper) was read in full, alongside both source chapters (`Development.pdf` — K.C. John Fig. 15.4/
15.7; `KC-Development.pdf` — Bhatt Fig. 15-3/15-10/15-15 — filenames are swapped from their title
pages, verified by content: `Development.pdf`'s Ktunotes-watermarked pages are K.C. John's "Engineering
Graphics for Diploma"; `KC-Development.pdf`'s Charotar-Cognifront-marked pages are N.D. Bhatt's
"Engineering Drawing"). Four structural defects were found, none of them a colour token:

1. **Geometry was painted under a baked-in `ctx.scale()`.** `main.js`'s `paint()` set
   `ctx.setTransform(dpr*scale, …)` from the live pan/zoom, so every `lineWidth`/font size in
   `renderConstruction.js` (authored as plain numbers, e.g. `1.8`) meant that many WORLD units —
   1.8px only at one particular zoom. The outline/fold thick/thin convention (K.C. John Ch.15 note
   #4) silently broke at every other zoom level. Module2 never does this: `drawMethodSheet` builds a
   `projectSheet(p)->{x,y}` and every stroke width is a literal, constant canvas-px number.
2. **No auxiliary tier.** Three saturated hues (ink / a violet `move` / green `result`) sat at
   near-equal visual weight — nothing read as scaffolding. Module2 drops every purely-auxiliary
   construction mark (a projector, a reference line) to `--color-ink-secondary` and carries the
   mark's MEANING in dash pattern instead (`Module2/main.js`'s within-Set-projector `[2,2]` vs.
   carried-from-previous-Set `[8,4]` split).
3. **Near-zero textbook annotation.** Every cited figure in both chapters numbers every corner/
   generator on both the views AND the development (top and bottom row), and carries `Seam`/
   `Fold line`/`Inside pattern` leader callouts plus a region caption under each block. The prism
   drew zero numerals before this pass.
4. **The fit budget excluded its own annotation.** `constructions.js`'s `planPlate()` fit the views
   + development inside a flat margin with no allowance for the dims/captions/numerals living
   OUTSIDE that geometric bbox — the exact bug class Module2 fixed in ADR-102 (a Set's own caption
   offset left out of its fit, overlapping its nav pill).

**Scope: Prism only, this pass.** The rebuild plan is explicitly solid-by-solid (Prism → Cylinder →
Elbow, each shown for approval before the next); this ADR covers Prism. Cylinder/Elbow keep their
pre-rebuild step CONTENT (no numerals/notes/captions yet) but render correctly through the rebuilt
`renderConstruction.js` unchanged — verified live, no console errors, `constructions.js`'s own
`verifyCutHeightAgainstGeneralSolver()` self-check stayed silent.

**What changed:**
- `main.js`'s `paint()` — `ctx` stays DPR-only for the whole paint; builds a `sheet` object
  (`{ project, pxPerUnit, given, move, result, ink, inkSecondary, paper, fontSans, fontMono }`,
  Module2's `projectSheet`/`pxPerUnit` shape) and hands it to `renderConstruction.js` instead of
  setting a scaled transform.
- `renderConstruction.js` — every `paint*` helper now projects its own points via `sheet.project()`
  and draws in literal canvas px for anything that is UI chrome, not geometry (stroke width, font
  size, point-dot radius, arrowhead size, dash lengths, the ruler/compass tool overlay — real
  geometry like a circle/arc radius is still scaled, by `sheet.pxPerUnit`). Weights: `OUTLINE_PX
  1.6`, `FOLD_PX 0.9`, `AUX_PX 0.75` (previously `1.8`/`0.6` WORLD units). Three new step kinds —
  `'numeral'` (station identifier, always `ink`), `'note'` (leader callout, always `inkSecondary`),
  `'caption'` (region caption, plain text) — all sharing one `drawKnockoutText` helper (ported
  technique from Module2's `drawMethodLabels`/`strokeAngleArc`, not the file). Four named dashes —
  `DASH_DATUM [1]`, `DASH_HIDDEN [5,4]`, `DASH_PROJECT [2,2]`, `DASH_CARRY [8,4]` — a `dash: 'carry'`
  tag on a step opts a 'move'-role line into the cross-region pattern; every other 'move'-role line
  defaults to `DASH_PROJECT`.
- `constructions.js` — `OUTLINE_W`/`FOLD_W` updated to the new px values; `planPlate()` gained
  `RESERVE_TOP/BOTTOM/LEFT/RIGHT` bands (fixed constants, subtracted before `scale` is derived —
  ADR-053/054's intrinsic-only law, never a measured bbox); `buildPrism` fully rebuilt against K.C.
  John Example 15.1/Fig. 15.4 — top-view corners numbered 1-4 clockwise from the seam, the SAME
  numbers reused on the development's top AND bottom edge rows (the actual pedagogical thread the
  figure teaches); `Seam`/`Fold line`/`Inside pattern` leader callouts; region captions; the single
  projector (which only reached ONE of the two coincident corners it should have) replaced with two
  projectors, each running the FULL depth of its x-column so it legitimately touches both real
  corners a front-view edge collapses. A genuine content bug fixed in the same pass: the projector
  was tagged `role: 'given'` (primary ink) — scaffolding, not stated geometry, so it is `'move'`
  (auxiliary) like every other projector.
- `index.html` — `--color-construct-move` now aliases `var(--color-ink-secondary)`; the retired
  violet value (`#7b4fb5`) is recorded in a comment, not silently dropped.

**Front-view corner numerals are a named scope decision, not an oversight:** depth collapses in the
front view, so each of its 4 drawn points is a coincidence of two real solid corners (the prism's
corners 1 and 4 both land on the front view's left edge) — labelling that coincidence correctly
needs a disambiguating convention this topic doesn't otherwise use. The two projectors (each
spanning a full x-column's depth) already carry that correspondence visually; the top view's own
corners are genuinely unambiguous (only height collapses there) and carry the numerals instead.

**End-cap faces (base/top rectangles) were considered and deferred, not silently decided.** K.C.
John Example 15.1 step 2 explicitly attaches the base+top face rectangles to the pattern
("draw the two rectangles 5,6,7,8 and 1,2,3,4..."); Bhatt omits ends by stated policy ("the ends or
bases have been omitted"). This pass kept the existing lateral-surface-only scope (matching Bhatt's
explicit policy and this topic's pre-rebuild behaviour) rather than widen scope mid-rewrite; flagged
for the user rather than assumed.

**A regression caught by verification, not assumed fixed:** a live check at the elbow's slider
extremes (`legLength=100`) showed "100 mm (short leg)" clipping its leading digit at the canvas
edge — a direct side-effect of point (1) above: dim TEXT is now a fixed px width regardless of a
construction's own intrinsic `scale`, so a construction with a small intrinsic scale (the elbow's
wide-legs-but-tall-bbox front view, `planPlate`'s own long-standing comment) can no longer rely on
text shrinking to fit the way it did under the old baked-in `ctx.scale()`. Fixed by widening
`RESERVE_LEFT`/`RESERVE_RIGHT` from `16`/`20` to `30`/`30` — re-verified clean at the elbow's own
slider max and the prism's own min/max on every given. The reserve bands remain generous fixed
constants, not a measured bbox (per point (4) above) — a future construction with an even longer dim
string at an even tighter intrinsic scale could still need this revisited; flagged in
`constructions.js`'s own comment, not treated as permanently solved.

**Why:** RULES.md §2.19a (verify the underlying mechanism before shipping, not visual plausibility)
applies here directly — the prior two patches looked locally reasonable (a token alias, a knockout
rect) but never addressed why the sheet still didn't read as an engineering drawing. Reading the
actual reference implementation and the actual source chapters, rather than iterating on guesses,
is what surfaced the real (structural, not cosmetic) causes.
**Alternatives rejected:** *Keep patching the existing colour/knockout layer* — this is the
approach that already failed twice; rejected as the same failure mode a third time. *Build all three
solids in one pass* — rejected per the user's own explicit instruction: solid-by-solid, Prism shown
and approved before Cylinder/Elbow.
**Consequences:** `renderConstruction.js`'s `paintLayer(ctx, layer, sheet)` third argument is no
longer a flat colour `palette` — any future direct caller must build the `sheet` shape `main.js`'s
`paint()` now constructs. Cylinder/Elbow render correctly today but read visually inconsistent with
the now-rebuilt Prism (no numerals/notes/captions) until their own phases land — expected, not a
defect, per the solid-by-solid plan.
**Status:** Active. Cylinder and Elbow phases pending user approval of this Prism pass.

## ADR-113 correction (2026-08-06): the PDF↔author mapping was backwards

ADR-113 states `Development.pdf` is K.C. John's *Engineering Graphics for Diploma* (Ktunotes
watermark) and `KC-Development.pdf` is N.D. Bhatt's *Engineering Drawing* (Charotar-Cognifront
watermark) — i.e. the filenames are "swapped" from their content. Re-verified directly against
both files' actual pages while sourcing citations for ADR-114 below: it's the other way round.
`KC-Development.pdf` carries the Ktunotes watermark, the "Engineering Graphics for Diploma"
running header, and K.C. John's own dotted figure numbering (`Fig. 15.4`, `Example 15.1` — its
p.174 Example 15.1 is base 24×30mm, axis 40mm, the exact numbers this topic's `buildPrism()`
defaults to). `Development.pdf` carries the Charotar-Cognifront watermark, the "Engineering
Drawing" running header (pp.352-356), and Bhatt's hyphenated numbering (`Fig. 15-1`, `Problem
15-1`) — its own §15-2 states the lateral-surface-only policy ADR-113 quoted ("The ends or bases
have been omitted. They can be easily incorporated if required."), just filed under the wrong
filename. Net effect: the filenames actually match their obvious reading (`KC-Development.pdf` =
K.C. John, `Development.pdf` = Bhatt) — no swap. ADR-114 below cites both correctly.

## ADR-114: Development of Surfaces (Diploma) Prism — dimension-offset sign fix, fit-to-frame→fixed-scale switch, and end-cap faces (K.C. John Fig. 15.4)

**Date:** 2026-08-06
**Decision:** Two bugs and a scope gap flagged in live review of ADR-113's Prism pass, fixed in
one coherent follow-up (Prism only, per that same pass's solid-by-solid plan):

1. **Given-step dimension lines rendered inside the outline.** `buildPrism()`'s base-length and
   base-width `dim()` calls (`constructions.js`) carried a negative `offset` where the sign
   convention (`renderConstruction.js`'s `paintDim()`: `perpx=-uy, perpy=ux`, `off`'s sign picks
   the side) needed positive to land outside the shape — a leftover from before the Construct-
   step development dim got this same fix; the height dim and the stretch-out dim were already
   correctly signed. NOT a second code path: Given-step and Construct-step dims share one
   `paintDim()` and one data source, filtered by `role` in `main.js`'s `rebuild()`/`play()`.
   Confirmed by direct computation (offset -12 landed the width dim ~12 drawing-units inside an
   ~85-unit-tall box at default params) and reproduced live in-browser before the fix.
2. **The plate did not scale proportionally to its own mm dimensions.** `planPlate()`'s `scale`
   was `Math.min(scaleX, scaleY, 4)`, both ratios derived from the CURRENT render's own
   `frontW+devW`/`frontH+topDepth` — genuine fit-to-frame, so a 16mm and a 32mm base width could
   render at nearly the same on-screen width (halving `baseWidth` raised `scaleY` and re-inflated
   everything else). Root-caused as SEPARATE from (1) — a sign error breaks outside/inside
   placement independent of what `scale`'s actual value is; the two only interact in that a small
   `scale` could occasionally shrink the box enough to mask the sign bug by coincidence.
3. **Lateral-surface-only, not the full pattern.** K.C. John Example 15.1 (Fig. 15.4, p.174 —
   this topic's own cited source, see the correction above) explicitly attaches the base and top
   rectangles to the strip ("draw the two rectangles 5,6,7,8 and 1,2,3,4..."), turning the
   pattern into a cross, not a straight strip — ADR-113 flagged this and deliberately deferred it
   rather than widen scope mid-rewrite. This ADR resolves that deferral.

**What changed:**
- `constructions.js` `buildPrism()` — the base-length dim's offset flipped `-12`→`+12`; the
  base-width dim's offset flipped `-12`→`+12`. Both now point the same outward direction as the
  height dim (`+14`) and the result-role stretch-out dim (`+16`).
- `constructions.js` `planPlate()` gained an optional 6th param, `fixedScale` (default `null`,
  every existing call site untouched — Cylinder/Elbow don't pass it, still fit-to-frame, out of
  this pass's scope per ADR-113's own plan). When given, it overrides the derived `scale`
  entirely; `extraX`/`extraY` (the existing even-split centering fix) then letterbox around
  whatever room is left, instead of the scale itself flexing to fill the frame. `buildPrism()`
  passes a new module constant, `PRISM_SCALE = 1.24`, derived ONCE from this construction's own
  slider worst-case (every `given` range at its max simultaneously: `baseLength≤40`,
  `baseWidth≤32`, `height≤60`) through the SAME two fit-budget ratios `planPlate()` itself
  computes (`scaleX_worst = 294/(40+2×(40+32)) ≈ 1.598`, `scaleY_worst = 154/(60+2×32) ≈ 1.242`),
  floored to 2dp — provably small enough to fit at every reachable slider combination, not just
  the default. Verified: identical `1.24` px/mm computed independently for the base-length AND
  base-width dims, at both `baseWidth=24` and `baseWidth=16` — and the worst-case combo plus 6
  other corner-cases all fit inside the 420×260 canvas via `renderConstruction.js`'s own
  `computeBounds()`.
- `constructions.js` `planPlate()` also gained a 5th param, `devExtra` (default `0`, same
  no-op-for-Cylinder/Elbow contract) — extra mm the DEVELOPMENT column alone needs above AND
  below the front view's own `[0,frontH]` z-range for a face that folds out past the strip's own
  top/bottom edge. `scaleY`'s fit-budget became `Math.max(frontH+topDepth, frontH+2×devExtra)`
  (whichever column is actually taller binds); `front.y0` gained `+ devExtra*scale` unconditional
  headroom. Worked through by hand for the prism's own case (`devExtra = Wd`, the same value as
  `topDepth` there): in the scaleY-bound worst case, the top cap's outer edge lands exactly on
  `RESERVE_TOP` and the front+top-view column's own bottom edge lands exactly on the canvas's
  bottom margin too — no overflow on either column, no unclaimed slack when `devExtra` is `0`.
- `constructions.js` `buildPrism()` — `devOutline` rebuilt from a 4-vertex rectangle into the
  true 10-vertex cross-boundary polygon Fig. 15.4 draws: both end-cap rectangles hinge on the
  FIRST (seam-side) panel only (x:0→Lf) — top cap folds up from z=H, base cap folds down from
  z=0 — matching the source figure exactly (confirmed against a 600dpi crop of the actual page,
  not the thumbnail scan). Two new fold-line segments (thin, `FOLD_W`) mark the cap hinges — the
  exact two segments `devOutline`'s new path routes around instead of through. Four new station
  numerals (`NUM`) on the caps' far corners reuse `3`/`4` — the SAME identifiers the top-view's
  own corners already carry (folding the top-view's own 1-2-3-4 rectangle about its 1-2 edge
  carries corner 4 to directly above/below corner 1, corner 3 above/below corner 2) — matching
  this file's existing reuse-across-regions convention, not a new letter/number alphabet the way
  K.C. John's own 1-4/5-8 split would need.

**Why:** RULES.md §2.19a again (per ADR-113) — root-caused via direct arithmetic on the shipped
`paintDim()`/`planPlate()` formulas and a 600dpi crop of the actual cited page, not visual
plausibility. The end-cap placement specifically was re-derived from the source figure rather
than guessed, since a wrong hinge/orientation would have shipped a pattern that folds into the
wrong shape.
**Alternatives rejected:** *Fix `planPlate()`'s fit-to-frame scale for all three solids at once*
— rejected, same solid-by-solid discipline ADR-113 already committed to; Cylinder/Elbow have the
same latent bug but are out of scope until their own phase. *Give the end caps their own fresh
corner alphabet (K.C. John's literal 5-8 split)* — rejected in favour of reusing 1-4, since this
file's `constructions.js` already established that convention for the SAME physical corners
across the top view and both development rows, and a fifth-through-eighth label would be new
decoration with no reader benefit over the existing reuse rule.
**Consequences:** `planPlate()`'s signature grew two optional trailing params; any future direct
caller (there are none outside `constructions.js` today) inherits fit-to-frame-by-default
behaviour unless it opts in. A live position-drift issue was found investigating this pass (the
front+top view group's on-canvas position now visibly shifts as sliders change, a latent
consequence of `PRISM_SCALE` making the existing centering slack — `extraX`/`extraY`, previously
near-zero under fit-to-frame — large and content-size-dependent) — reported separately, fix
pending approval, not folded into this ADR.
**Status:** Active. Cylinder and Elbow inherit the same fit-to-frame scale and lateral-surface-
only scope pending their own phases (ADR-113's plan, unchanged).

**Addendum (2026-08-06): the position-drift Consequence above is fixed, approved same day.**
Root-caused before touching code, per RULES.md §2.19a: NOT the centering fix (`extraX`/`extraY`
even-split, this same file's earlier ADR) computing the wrong answer — it was computing the
right answer to a question that stopped mattering once `fixedScale` existed. That split exists
to redistribute LEFTOVER space evenly; under fit-to-frame, leftover is ≈0 by construction (scale
flexes to consume it), so the split was a no-op in practice. Under `PRISM_SCALE`, leftover
becomes real and CONTENT-SIZE-DEPENDENT — so `front.x0`/`y0` (and everything anchored off them,
including the Given step's front+top view, which never even draws the dev block that leftover is
nominally shared with) started moving every time a slider moved. Confirmed by direct computation
before fixing: shrinking `baseLength`+`baseWidth` moved `front.x0` `109.44→137.96`; shrinking
`height` moved `front.y0` `101.08→113.48` — and `uiManager.js`'s slider-commit path
(`main.js`'s `commit()`) never calls `viewTransform`'s `resetView()`/`ensureVisible()`, so nothing
in the outer pan/zoom layer masks or re-frames that shift — it renders 1:1 on screen.

**Fix:** `planPlate()`'s `extraX`/`extraY` are now pinned to `0` whenever `fixedScale` is passed
— `front.x0`/`y0` collapse to the plate's fixed top-left corner (`MARGIN+RESERVE_LEFT`,
`MARGIN+RESERVE_TOP+devExtra*scale`), identical at every slider value; only the drawn shapes'
own size changes, the way a real drafting sheet is anchored to its corner rather than
auto-centered. Cylinder/Elbow (`fixedScale` null) are byte-for-byte unaffected — `extraX`/`extraY`
still compute the original way there, and the elbow's own ~35%-dead-space centering fix still
applies untouched. A second, smaller fix was needed alongside it: `buildPrism()` was passing the
LIVE `baseWidth` as `planPlate()`'s `devExtra` (the end-cap headroom reserved above `front.y0`) —
live meant `front.y0` was STILL a function of the `baseWidth` slider even with `extraY` pinned to
0. Replaced with a new constant, `PRISM_CAP_RESERVE_MM = 32` (the same `baseWidth` slider MAX
`PRISM_SCALE` was already derived from), so the reserved headroom — and therefore `front.y0` — is
now a true constant too; every `baseWidth` below the max just gets more (never less) headroom
above the cap than it strictly needs, the deliberate trade for a stable origin.
**Verified:** `front.x0,y0` computed identical (`48, 73.68`) across 7 param combinations including
both slider-range extremes — confirmed by direct computation AND by a live in-browser render
(a fixed reference crosshair painted at that exact drawing-space point lands on the front view's
own top-left corner at `baseLength/baseWidth/height` = default, min, and max simultaneously).
Bug-1 (dim-offset sign) and Bug-2 (`PRISM_SCALE` proportionality) both re-verified unregressed;
Cylinder/Elbow step counts and `resultText` unchanged.
**Status:** Resolved.

---

## ADR-115: Development of Surfaces (Diploma) Cylinder — Phase 2 of the solid-by-solid rebuild (fixed-scale rendering, corrected generator direction, no end caps, textbook annotation)

**Date:** 2026-08-06
**Decision:** Apply the identical rendering bar ADR-113/114 established for the Prism to the
Cylinder (`buildCylinder()` in `constructions.js`, plus its own 3D generator gaining vertex
numerals in `labels3d.js`/`view3d.js`) — the second step of the explicitly solid-by-solid plan
(Prism → Cylinder → Elbow, each shown for approval before the next).

**Source verification, done against the actual pages, not assumed:**
1. **No end caps.** K.C. John Fig. 15.7 (p.175, this construction's own cited source, Example
   15.4) is titled *"Lateral surface of a cylinder"* and its development is a plain rectangle
   with no circles attached — unlike Example 15.1's prism, which explicitly attaches base/top
   rectangles. Bhatt Fig. 15-10/15-11 agree (§15-2's stated lateral-surface-only policy, the
   same one ADR-113 quoted for the prism before its own end-cap addendum). **The cylinder stays
   lateral-surface-only — `devExtra` is 0, no `PRISM_CAP_RESERVE_MM`-equivalent needed.** This
   settles the question the rebuild brief asked to verify rather than assume.
2. **Generator direction was shipped backwards against K.C. John's own text.** Example 15.4 step
   1: *"Locate the seam (joint) of the development on left side and name the 12 generators
   clockwise from this point"* — Fig. 15.7's circle reads 1 (left) → 2 (upper-left) → …
   clockwise. The shipped `a = π − 2πk/12` walked the OPPOSITE direction (Bhatt Fig. 15-10's own
   convention, not this construction's cited K.C. John source). Fixed to `a = π + 2πk/12`
   (verified by hand: with `toTop`'s y-down screen convention, increasing θ in `(cosθ, sinθ)`
   traces clockwise on screen).
3. **One numbered development row, not two.** K.C. John numbers the top edge; Bhatt numbers the
   bottom edge (and thins the station count). The cylinder's 13 stations across ~152mm at the
   new `CYL_SCALE` sit closer together than a two-digit knockout box is wide — both-rows would
   visibly collide (unlike the prism's 5 stations across ~108mm, where both-rows was correct).
   Resolved with the user: **all 13 stations (1..12,1) on the BOTTOM edge only.** The top-view
   circle itself still gets all 12 numerals — no density problem there, they sit radially
   outside the circle rather than packed along one straight edge.
4. **3D numerals: base ring only, not both rings.** `cylinder.js`'s mesh is a smooth 24-segment
   round shell with no true corners; 24 pills (12×2 rings) would crowd the silhouette and CSS2D
   pills do not depth-test (a far-side label on a round mesh shows straight through it — the
   prism's flat box faces don't have this problem). Resolved with the user: base ring only,
   matching the top-view circle's own numerals (both derive from the same 12 station angles).

**What changed:**
- `constructions.js` `buildCylinder()` — `CYL_SCALE = 1.10` (Bug-2-class fixed-scale override,
  derived the same way as `PRISM_SCALE`: `scaleX_worst = 294/(60+π×60) ≈ 1.183`,
  `scaleY_worst = 154/(80+60) = 1.100` from this construction's own `diameter≤60`/`height≤80`
  slider worst case; min, floored to 2dp). `devExtra` stays 0 throughout (point 1 above), so
  `planPlate()`'s existing `extraX`/`extraY` pin-to-0 branch keeps the origin stable with no
  second reserve constant needed (unlike the prism's `PRISM_CAP_RESERVE_MM`).
- The `⌀ D` dim's offset flipped `-12`→`+12` (same inverted-sign class as ADR-114 bug 1 — it
  was landing inside the front view instead of in the `GAP_TOP` band beside it).
- The stretch-out dim gained its formula text (`Stretch out = π×⌀${D} = … mm`), matching the
  prism's own formula-bearing dim and Fig. 15.7's own *"Stretch out length, πd = 138.2"*.
- The seam projector's role flipped `'given'`→`'move'` — scaffolding, not stated geometry, the
  exact fix ADR-113 applied to the prism's projectors.
- The two transfer lines (front view → development) gained `dash: 'carry'` — a cross-region
  transfer, not the projectors' `DASH_PROJECT` — shipped untagged before this pass.
- Front-view generator verticals de-duplicated: depth collapses there, so the 12 stations land
  on only 7 distinct x's (two coincide with the outline's own left/right edges); the pre-rebuild
  loop drew 11 lines where only 5 are geometrically distinct, silently overdrawing 6.
- New annotation layer (all new, mirroring `buildPrism()`'s structure): 12 `numeral` steps
  around the top-view circle (placed by quadrant so they sit outside the circle), 13 `numeral`
  steps on the development's bottom edge, `Seam`/`Fold line`/`Inside pattern` leader callouts,
  and a shared-row `(i)`/`(ii)` caption pair using the same `captionRowY` max-of-both-blocks rule
  the prism's caption fix established.
- `labels3d.js` — new `planCylinderStations()` beside `planPrismStations()`, dispatched by
  `mesh.name` (`'cylinder'` vs `'prism'`) in `generate()`. Reads the mesh's own bounding box for
  radius/base-Y (never a guessed offset, same discipline as the prism's planner), with the
  2D→3D angle mapping derived directly from `buildCylinder()`'s own `a(k)` formula and
  `cube.js`'s established front-face-is-+Z convention.
- `view3d.js` — `rebuild3D()`'s numeral gate widened from `shapeId === 'prism'` to
  `shapeId === 'prism' || shapeId === 'cylinder'`; Elbow still clears (`labeler?.clear()`),
  pending its own phase.

**Front-view station numerals stay OUT, same scope decision as the prism (DESIGN.md §6):** the
cylinder's front view has the identical depth-collapse ambiguity at a larger scale (12 stations
onto 7 distinct x's) and is scoped out for the identical reason — no disambiguating convention
this topic otherwise uses, and the projectors already carry the correspondence visually.

**Why:** RULES.md §2.19a (verify the underlying mechanism before shipping) applies directly —
the generator-direction error was only caught by reading K.C. John's own step-by-step text
against the shipped formula, not by visual plausibility (a mirrored circle numbering looks
entirely reasonable at a glance). The end-cap and numeral-density questions were resolved by
reading the actual cited page and asking the user, respectively, rather than silently choosing
either the prism's own precedent or a guess.
**Alternatives rejected:** *Both development rows, thinned to match the prism's density* —
rejected in favour of one full row (all 13 stations), since Bhatt's own thinned convention
(1,2,3,4,7,10,12,1) would silently drop 5 of 12 generators from the visible numbering, a bigger
pedagogical loss than one unlabelled edge. *24 3D pills on both rings* — rejected per point 4
above (silhouette crowding, no depth-testing on a round mesh with no true corners to anchor to).
**Consequences:** Cylinder now renders through the same rebuilt pipeline the Prism already
proved out, with zero changes to `renderConstruction.js`/`main.js`/`viewTransform.js` — this
phase is scoped entirely to `constructions.js`/`labels3d.js`/`view3d.js`, confirming the Phase 1
rendering layer needed no further changes to serve a second solid. Elbow keeps fit-to-frame
scale, its own inverted dim signs, and no annotation until its own phase (unchanged, per the
solid-by-solid plan).

**A regression caught by live verification, not assumed fixed:** the ⌀ dim's first draft kept
ADR-114's bottom-edge convention (z=0, offset+12) — correct in isolation, but a real
foreground-browser check showed its text colliding with the top-view circle's own 'above'-placed
numerals (stations 3/4/5): both wanted the same narrow `GAP_TOP` band. Moved to the front view's
TOP edge (z=H, offset −14) instead, into the otherwise-empty `RESERVE_TOP` margin — re-verified
by direct computation (bbox `minY=20` at every slider combination, never clipping the canvas)
and live in-browser at default/min/max.
**Status:** Active. Elbow phase pending user approval of this Cylinder pass.

---

## ADR-116: Development of Surfaces (Diploma) Elbow — Phase 3 (final) of the solid-by-solid rebuild (one development pattern, ELBOW_SCALE, left-seam renumbering, transfer lines, 3D numerals)

**Date:** 2026-08-07
**Decision:** Apply the rendering bar ADR-113/114/115 established for the Prism and Cylinder to
the Elbow (`buildElbow()` in `constructions.js`, plus its own 3D generator gaining vertex numerals
in `labels3d.js`/`view3d.js`) — the third and final step of the solid-by-solid plan.

**Source verification, done against the actual pages, not assumed — and one citation was wrong:**
`ADR-112`, the topic's own `CLAUDE.md`, and `buildElbow()`'s own comments cited *K.C. John Fig.
15.12 / Example 15.9* as the single-truncation cylinder source for one elbow half. Read directly
(`KC-Development.pdf` p.179): Example 15.9 is a **doubly**-truncated tube (a 45° cut at the top, a
30° cut the opposite way lower down) — two cut curves, not one. It is not this topic's source. The
genuine single-truncation sources, read directly and confirmed: **Bhatt Problem 15-8 / Fig. 15-10**
(`Development.pdf` p.356–357, a 30°-cut cylinder) and, closer still, **Bhatt Problem 15-9 / Fig.
15-11** (p.357, a **45°** cut — exactly one elbow half). Fig. 15-10's development is numbered on
its bottom edge with a thinned set; Fig. 15-11 thins further to `1,2,4,7,10,12,1`. Bhatt Fig.
15-15 (p.359, the actual three-piece elbow this topic simplifies away from, per ADR-112) states
outright that its two end pieces "are similar" — the mirror-image relationship this phase's single
drawn pattern relies on. Every citation of K.C. John Fig. 15.12 for this construction (ADR-112,
topic `CLAUDE.md`, `constructions.js`'s own comments/`resultText`) is corrected to Bhatt Fig.
15-10/15-11 in this same pass.

**The elbow cannot carry annotation at its pre-rebuild (two-pattern) layout.** Two side-by-side πD
development patterns plus a `D+legShort`-wide front view total up to 557mm of worst-case content —
driving a fixed scale of just 0.52 px/mm (Prism 1.24, Cylinder 1.10). At 0.52 the auxiliary circle
is 13px in radius and development stations sit 5.7px apart: no numeral fits at any density. This
is a genuine new edge case (the rebuild brief's own item 1) — a *layout* limit, not a `paintDim()`
or reserve-band defect. Resolved with the user: draw **ONE** development pattern; the second piece
is noted as its mirror image (folded into the region caption's own text, see below) rather than
drawn a second time. This alone recovers a workable scale.

**What changed:**
- `constructions.js` — new `ELBOW_SCALE = 0.70`, the Bug-2-class fixed-scale override, derived the
  same documented way as `PRISM_SCALE`/`CYL_SCALE`, from this construction's own slider worst case
  (`diameter≤60`, `legLength≤100`) with the ONE-pattern `devW`:
  `scaleX_worst = 294/(160+188.5) ≈ 0.844`, `scaleY_worst = 154/(160+60) = 0.700` (binds). Floored
  to 2dp. `devExtra` stays 0 (no end caps — Bhatt §15-2's lateral-surface-only policy, and neither
  Fig. 15-10 nor 15-11 shows one), so `planPlate()`'s existing `extraX`/`extraY` pin-to-0 branch
  keeps the origin stable with no cap-reserve-equivalent constant, exactly as the Cylinder needed
  none.
- **Left-seam renumbering.** `buildElbow()`'s station angle changed from `θ = 2πk/12` (0 at the
  long/right wall) to `a(k) = π + 2πk/12` — `buildCylinder()`'s own formula, verbatim. Station 1 is
  now the LEFT/short wall, station 7 the RIGHT/long wall, matching both K.C. John's stated
  clockwise-from-left rule (Example 15.4 step 1, already Cylinder's own convention, ADR-115) and
  fixing a real inconsistency: the seam projector was always drawn at the left wall while the old
  numbering started at the right. `cutHeight()` itself is unchanged — `cos(a(0)) = −1` still yields
  `legShort`, `cos(a(6)) = +1` still yields `legLong`.
- **The development's z-datum was off by `r` from the front view's own.** `devZBase` was
  `legLong + r`; `frontH` (the front view's own z-extent) is `D + legShort`, which **equals**
  `legLong` exactly. So every development cut point sat `r` below its true front-view counterpart —
  this construction never had a working transfer line despite ADR-112's whole single-plate
  Canvas2D architecture existing for exactly that (K.C. John Ch.15 note #1: every development line
  must be a TRUE length, genuinely horizontal here). Fixed: `devZBase = frontH`. Verified
  independently (`frontH === legLong` at every param combination, by construction) and confirmed
  the fix makes a front-view mitre point and its development counterpart land at the identical
  drawing-space y.
- **New transfer lines.** 7 distinct `role:'move'`, `dash:'carry'` lines (front-view mitre point →
  development cut point), one per distinct cut height (`k=0..6`; `k` and `12−k` share a height by
  the mitre's own 45° symmetry, the same depth-collapse this construction's front-view generators
  already have) — the actual Parallel-Line-method content Bhatt Fig. 15-10 draws, and this
  construction's own missing piece until the datum fix above made it possible.
- **Seam projector role fixed** `'given'` → `'move'` — scaffolding, not stated geometry, the same
  fix ADR-113/115 applied to the prism's and cylinder's own projectors (this one shipped still
  `'given'`).
- **De-duplicated collapsed front-view generators.** Both pieces' wall/mitre generator lines at
  `k=0` and `k=6` coincide exactly with the front-view outline's own edges (`A-E`/`B-C` for the
  vertical piece, `G-E`/`C-F` for the horizontal piece) — confirmed by direct substitution, not
  assumed. Only `k=1..5` draw a new line per piece (5 each), the identical dedup class ADR-115 fixed
  for the cylinder's front view (there: 11 drawn where 5 were distinct).
- **Numerals.** Auxiliary circle: all 12, placed radially by quadrant (`buildCylinder()`'s own
  `place` rule, reused verbatim). Development bottom edge: **thinned to Bhatt Fig. 15-11's own set,
  `1,2,4,7,10,12,1`** — at `ELBOW_SCALE` the full 13 sit ≈9.2px apart against a ≈14px two-digit
  knockout box (the same density problem ADR-115 solved for the cylinder, worse here since
  `ELBOW_SCALE < CYL_SCALE`). Horizontal piece's own front-view mitre points keep a **numbered
  correspondence** (this topic's own documented "no genuine third view" simplification, `CLAUDE.md`
  "Elbow scope" — NOT removed by this phase) — thinned to the 4 stations `{1,2,4,7}` that remain
  positionally distinct within this piece's own dedup half (`k=0..6`; stations 10/12 would coincide
  with 4/2's own drawn positions, an artifact of the SAME depth-collapse dedup, not a fresh
  omission).
- **Dimension signs — audited against `paintDim()`'s `perp = (−uy, ux)` rule directly, not
  assumed, since this shape's non-convex L-footprint (the two pieces' footprints meet at a reflex
  vertex, C) makes "outward" genuinely direction-dependent per edge, unlike the prism's/cylinder's
  simple rectangles (RULES §2.19a) — AND since `paintDim()` computes that perpendicular from `a`/`b`
  in their OWN already-y-flipped `toFront`-space (screen convention: larger y = further down), not
  the local mm frame those points came from, a sign derived by reasoning in the local frame lands
  backwards. Verified by literally replicating `paintDim()`'s own `oa`/`ob`/mid formula in a script
  and ray-casting each result against the real `frontOutline` polygon — not re-guessed by hand a
  second time after the first manual pass shipped backwards signs for both leg dims:**
  - `legShort` (A–E, the vertical piece's own leftmost wall for its full length): pre-rebuild
    `offset −14` is confirmed outside at both extension ticks AND the text midpoint — this one was
    already correct; no change shipped.
  - `legLong` (B–C): pre-rebuild `offset +14` is confirmed outside at the B-end tick and the text
    midpoint; only the C-end tick lands inside — this edge's exterior side is genuinely mixed along
    its length (interior for the stretch nearest the reflex vertex C, where the horizontal piece's
    own body overhangs; exterior for the rest), so no single perpendicular offset clears it
    entirely. Already correct pre-rebuild for the achievable majority; no change shipped. The
    residual C-end overlap is a genuine, flagged limitation, not silently claimed solved.
  - `⌀ D`: the one REAL bug. Pre-rebuild `offset −12` landed inside the front view (the same
    inverted-sign bug class ADR-114/115 fixed elsewhere) — confirmed by the same polygon
    replication. Rather than a same-line sign flip (checked directly: `+12` on A–B still clips the
    circle's own footprint at part of its length, and a placement on the auxiliary circle itself has
    no slack in that band's exact-height budget), moved to a **horizontal** dim below the front
    view's own A–B bottom edge, `offset +14` (`RESERVE_BOTTOM`, universally clear at every slider
    value, since nothing is ever drawn below `yBottom`) — confirmed outside at both ticks and the
    midpoint.
  - Stretch-out dim gained its formula text (`Stretch out = π×⌀D = … mm`), matching the prism's and
    cylinder's own formula-bearing dims and Bhatt's own *"π × D = 141.3"* annotation.
- **3D numerals (Compare pane).** `elbowHalf.js`'s `createElbow()` returns TWO meshes
  (`elbow-vertical`, `elbow-horizontal` — confirmed by reading the file, NOT the single-mesh
  `'prism'`/`'cylinder'` convention `labels3d.js` previously assumed). New
  `planElbowStations(mesh)` in `labels3d.js`, dispatched on `mesh.name === 'elbow-vertical'`,
  numbers the vertical leg's **flat-end ring only** (12 stations, `a(k)` reused verbatim) — the
  same reasoning as the cylinder's base-ring-only decision (ADR-115): a round mesh has no true
  corners, CSS2D pills do not depth-test, and the flat end is where the 2D plate's own development
  `z=0` line ties in. The horizontal leg mesh is simply never passed to the labeler — unlabelled,
  matching the 2D plate's own single-pattern scope this phase. `view3d.js`'s numeral gate widened to
  include `'elbow'`. The stale `labels3d.js` group name (`'Prism Corner Labels'`, inherited from
  when the file only served one solid) is corrected to `'Solid Station Labels'`.

**Why:** RULES.md §2.19a (verify the underlying mechanism, not visual plausibility) — the wrong
K.C. John citation, the datum-offset bug, and both dim-sign bugs were each only caught by direct
arithmetic/page-reading, not by how the pre-rebuild elbow looked on screen (a plausible-looking
elbow front view gave no visual hint that its own development had never been able to draw a
transfer line, or that a dim was 100% inside the shape rather than merely close to it).
**Alternatives rejected:**
- *Keep both development patterns, ship without numerals* — rejected: defeats this phase's own
  stated goal (making the horizontal piece's numbered correspondence readable), the exact thing the
  Prism/Cylinder numeral system exists to provide.
- *Keep both patterns, shrink the `legLength` slider max to buy scale* — computed and rejected:
  even at `legLength` max lowered to 80mm, two patterns still bind `scaleX` at ≈0.55 — does not
  actually solve the problem, and silently narrows the construction's stated range.
- *Number all 13 development stations, thinned or not* — rejected per the density arithmetic above,
  same reasoning ADR-115 already used for the cylinder.
- *Give the ⌀ dim a second circle-based placement attempt with a larger offset* — rejected after
  direct computation showed no offset within the available band clears the circle's own footprint
  at every diameter; the front-view-bottom placement has no such constraint.
**Consequences:** All three solids in this topic now share one rendering bar (fixed scale, dash
tiers, textbook annotation, 3D numerals). The `legLong` dim's residual near-`C` overlap (flagged
above) is the one open cosmetic item carried forward, tied to this shape's own non-convex geometry
rather than anything `paintDim()`/`planPlate()` can fix generically — noted for a future pass, not
silently treated as solved.
**Status:** Active, pending the live foreground-browser Play watch-through (this construction's own
long-outstanding, never-before-completed check — see this topic's own session notes) and final
user approval closing out the solid-by-solid rebuild.

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

## ADR-140: In Conic Sections the section clipper EXTRACTS the curve; the cone is never cut away

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
**Status:** Active

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

---

## ADR-142: Merging Vishnu's `feat/mod4` — an independent-numbering collision, an unrecoverable gitlink, and 45 orphaned ADR references discovered in his own docs

**Date:** 2026-08-07
**Decision:** `feat/mod4` (Vishnu, 4 commits, tip `c61e783`) added three complete topics —
`graphics_module_1_topic_1_1_dimensioning`, `graphics_module_2_topic_0_introduction_to_orthographic_projection`,
`graphics_module_3_topic_2_2_conic_sections` — merged into `main` with four adjustments recorded here
so a future reader does not have to re-derive this investigation from scratch.

**1. ADR/RULES numbering collision (why his real decisions are ADR-133–141, not ADR-078–086).**
The merge-base (`92b9f82`) topped out at ADR-077. Both branches then numbered forward from 078
independently: this repo's own ADR-078…116 (the Show Method / Development-of-Surfaces / font-CDN
work) and Vishnu's ADR-078…086 (his 9 real decisions for the three topics above) are **entirely
different decisions sharing the same 9 numbers**. Same collision in `RULES.md`: his `§5.16a` and
`§6.23–§6.28` collided with this repo's own `§5.16a`/`§6.21–§6.26`. His nine are renumbered
ADR-133…141 here (see below); his RULES sections renumbered `§5.16a→§5.16b`, `§6.23→§6.27`,
`§6.24→§6.28`, `§6.25→§6.29`, `§6.26→§6.30`, `§6.27→§6.31`, `§6.28→§6.32`. All 133 references
across his three topic directories and this repo's root docs were updated to match; his own
internal cross-reference ("ADR-081 supersedes ADR-078 point 2") now reads "ADR-136 supersedes
ADR-133 point 2".

The renumber target is 133, not 117 (the first number clear of this repo's own ADR-001–116) —
see the next point for why.

**2. Forty-five orphaned ADR references in Vishnu's own docs — pre-existing, NOT fixed here.**
Across his three topics, 413 sites in 25 files (concentrated in `graphics_module_3_topic_2_2_conic_sections`:
`main.js`, `index.html`, `conicEngine.js`, `CHANGELOG.md`, `CLAUDE.md`) cite 45 distinct ADR ids,
**ADR-087 through ADR-132, that have no body anywhere** — not in his own pushed `DECISIONS.md`
(which stops at his real ADR-086), not in this repo's. The pattern is visible in his own
`CHANGELOG.md`: entries like *"ADR-125, supersedes ADR-120"* describe him consolidating roughly
45 granular local-iteration decisions down into the 9 he actually pushed, without updating the
prose and code comments that still cite the old, superseded numbers.

**This is why the renumber target is 133, not 117**: the range 117–132 is already claimed by his
own orphaned citations, and landing his real decisions there would have created a *second*
collision inside his own documentation.

Two kinds of orphan, and the second is the dangerous one:
- 15 ids (117–132) resolve to nothing — a dead reference, easy to notice.
- **30 ids (087–116) now silently resolve to this repo's own unrelated real decisions**, since
  this repo's ADR-087…116 exist only on this side of the merge. Example: his conic
  `CLAUDE.md` cites `ADR-115` for *"the hyperbola is a SECTION here, never a construction"*;
  this repo's real `ADR-115` is the Development-of-Surfaces cylinder rebuild (2026-08-06). A
  reader who follows that citation lands on the wrong decision without any signal that anything
  is wrong.

**These 45 references were deliberately left untouched** — not renumbered, not annotated inline.
This is Vishnu's own pre-existing documentation debt from before he pushed, it is cosmetic (stale
comment/prose citations, not a functional defect), and the old-number → new-number mapping is
known only to him. Editing 413 sites in code this repo does not own, to guess at a mapping only
he has, was judged the wrong trade — reconcile directly with him when he is reachable.

**3. Two Module 4 topics excluded — a real, unresolved ADR-039 violation.**
`graphics_module_4_topic_1_introduction_to_isometric_drawing` and
`graphics_module_4_topic_2_isometric_construction` exist on `feat/mod4` only as gitlinks
(git tree mode `160000`) pointing at commits `9359d52` and `b2b9f9b` respectively. Both commits
are unreachable (`git cat-file -e` fails against every fetched remote) and there is no
`.gitmodules` on the branch, so these are not registered submodules — the content was simply
never pushed and exists only on Vishnu's machine. He is travelling with no laptop access, so it
cannot be recovered now. Both paths are excluded from this merge entirely, deliberately, rather
than landed as broken links or empty directories, so they are absent from `main`'s tree — not
present-and-broken. To be merged once he can push the real commits. This is a known, temporary
gap, not an oversight; the only in-repo trace of it is this note and the matching `CHANGELOG.md`
entry.

**4. Font policy and root-PDF exclusions — routine, noted for completeness.** His three topics
bundled local `woff2` fonts, which this repo's `ADR-086` had already retired in favour of the
shared Supabase font host (`RULES.md §2.12/§2.15`); repointed to match, 9 local files dropped.
`Conic Sections.pdf` and `Dimensions.pdf` were excluded per this repo's own `*.pdf` `.gitignore`
rule (commit `6478322`).

**Consequences:** `main`'s ADR sequence now runs 001…141 with no duplicate id. A reader who hits
any of `ADR-087`…`ADR-132` inside the three merged topics' own files should treat it as broken —
check this entry before assuming the number resolves correctly, especially for `087`–`116`, which
silently point at real but unrelated entries in this same log.
**Status:** Active — pending Vishnu reconciling the 45 orphaned references and pushing the two
Module 4 topics as real commits.

**Note (2026-08-09):** the first live collateral of these orphans surfaced. `f8771ab` (2026-08-07,
the Finish-button rollout) deleted the fix that CONIC's own `CHANGELOG.md` records under its local
`ADR-121` — one of the 45 references this entry documents as having no body anywhere — while adding
`#btn-finish` as a new primary button its terminal step had no accent rule for. The fix and the
re-decided accent rule are recorded in `graphics_module_3_topic_2_2_conic_sections/CHANGELOG.md`
(2026-08-09 entry), not as a new root `ADR-121`, precisely to avoid creating the 46th orphan/collision
this entry warns about — this repo's decision record for that topic's local ADR ids is its own
`CHANGELOG.md`, until Vishnu's reconciliation gives them real root bodies.

---

## ADR-143: Regular Polygons' perpendicular-bisector method places its extrapolated centre points at the TRUE apothem, not the book's equal-interval step

**Date:** 2026-08-08
**Decision:** In `graphics_diploma_module_1_topic_1_4_regular_polygons`, the `ngon` construction's
"Perpendicular Bisector" method (`src/constructions.js`, `buildPerpendicularBisector()`) rebuilds
*Regular Polygons.pdf*'s Fig 5.24 sequence faithfully — the perpendicular bisector of AB, point 4
(arc centred on the AB-midpoint, radius to A), point 6 (arc centred on B, radius AB), and point 5
(the literal midpoint of 4 and 6) — but departs from the book for points **7 and beyond**: instead
of continuing the book's *equal interval* (the 4-to-5 spacing, stepped repeatedly up the bisector),
each point k ≥ 7 is placed at its true apothem, `s / (2·tan(π/k))`. Point 5 keeps the book's own
midpoint approximation unchanged (it is the book's own worked value, not an extrapolation of it).
For n = 3, which the book's ladder doesn't cover at all (Fig 5.24 starts at 4), a single point at
apothem(3) stands in directly.
**Why:** Phase A audit (this session) found the method as it shipped drew four short compass-arc
marks and a "calibration arc" whose radius was read directly off the closed-form circumcentre —
i.e. an arc drawn *through* the answer, not one that derived it, with no bisector line, no marked
intersection points, and no points 4–8 at all. Rebuilding Fig 5.24 literally (equal intervals
included) was considered and rejected: the equal-interval step is only exact for n = 4 and n = 6;
by n = 8 (the book's own example) it is 2.1% off the true apothem, which subtends 44.17° per side
instead of 45° — an octagon that visibly fails to close by 6.6°, worse for n up to the sim's max of
12. Shipping that literal sequence would mean animating a construction that visibly doesn't
complete the shape it claims to build, which RULES.md's on-screen-claims bar (ADR-090, ADR-099,
ADR-103, ADR-104, ADR-105 — every prior real bug in this project rendered plausibly while its math
was never checked) rules out. The true-apothem substitution keeps every point on-screen exactly
where the book's own instructions would place it for n ≤ 6 (points 4 and 6 are already exact by
construction — real compass arcs, not formula), changes only the *unconstructible-by-the-book's-
own-method* points 7 and up, and the resulting polygon always closes exactly because the actual
drawn vertices come from the shared closed-form ground truth (`regularPolygonVertices`) regardless
of the ladder's own point — only the overlay circle drawn from the final ladder point can be
imperceptibly (≤0.75%, at n = 5 only, from the book's own point-5 midpoint approximation) off the
polygon's true circumcircle, and never at n = 4, 6, or 7–12, where the ladder point is exact by
construction.
**Alternatives rejected:**
- *Ship the book's literal equal-interval ladder, gap and all* — rejected: a construction that
  visibly fails to close is a worse teaching artifact than a construction that silently smooths
  over a textbook approximation the audit already flagged as a stated limitation, not a claimed
  guarantee (the book itself never claims the interval step is exact for n > 6).
- *Draw the ladder as pure decoration and always drive the circle from the closed-form circumcentre
  (as the pre-fix code effectively did)* — rejected: this was the exact defect the audit reported
  (a calibration arc "drawn through the answer, not deriving it"); it would restore the same
  complaint under a longer ladder.
- *Re-derive every remaining vertex independently for the semicircle-division method too, via a
  ray-from-A/cut-by-arc technique* — this bullet originally claimed the technique was numerically
  DISPROVED for n ≥ 7. **That claim was wrong and has been corrected** (see Update below): the
  ray-cut technique is inscribed-angle exact for every n, and the original failure was a ray-origin
  bug (rays drawn from B, not A — the source's own diagram, `polygon.pdf`, draws them from A), not
  a geometric limit.
**Consequences:** Easier: the sim can show the book's own ladder-building technique for any n from
3 to 12 without ever animating a polygon that fails to close. Harder: a reader comparing the sim
frame-by-frame against Fig 5.24 for n = 7 or 8 will see points 7 and 8 sit very slightly off where
a literal equal-interval read of the book's figure would place them (imperceptible in the drawing,
documented in `buildPerpendicularBisector()`'s header comment) — worth calling out explicitly if
this sim is ever used to grade a student's manual equal-interval construction, which it is not
designed to do. Same session also fixed a dimension-label placement bug in
`graphics_module_1_topic_1_foundations` (`src/annotations.js`, `src/labelLayer.js`) and renamed the
n-gon's Step 1 picker label from "General Regular Polygon" to "N-Sided Regular Polygon"
(`index.html`, `src/constructions.js`) — both unrelated to this ADR, recorded together in
CHANGELOG.md for the same hotfix pass.
**Update (2026-08-08, same-day follow-up):** A Phase A audit of this ADR's own rejected-alternative
bullet found it factually wrong — polygon.pdf (the authoritative source, not previously checked
against for this method) draws the semicircle-division method's rays from **A**, not B, and every
such ray is inscribed-angle exact for any n (the angle a ray through division `j` makes at A is
always `j` division-steps, the same inscribed angle vertex `j+1` subtends there, so the arc-cut
always exists). `buildSemicircleDivision()` was rebuilt to match: centred on A (not B), extension
point C on the far side of A (not P past B), a ray from A through every division, each cut by a
radius-AB arc centred on the previously-found vertex — every vertex past B is now independently
derived and illustrated this way, not just C, verified exact for n=3–12. This ADR's SCOPE now
covers that rebuild too, not only the perpendicular-bisector ladder in its title. A second,
unrelated defect was fixed in the same pass: `renderConstruction.js`'s point-label placement had no
collision avoidance at all (a fixed `+4/-4` offset, unconditionally) — crowded further by the new
rays' extra points — replaced with a greedy candidate-search placement pass plus radial-outward
label hints from `constructions.js`, run once per recipe before either static or animated
rendering. See the module's own `CHANGELOG.md` (new this pass) for the itemised change list.
**Status:** Active

---

## ADR-144: Development of Surfaces (Diploma) Elbow — ADR-116's development-plate numeral thinning is overridden by faculty requirement; the full 13-station set ships, the collision risk it was thinned to avoid is real and stays open

**Date:** 2026-08-08
**Decision:** In `graphics_diploma_module_2_topic_1_1_development_of_surfaces`, `buildElbow()`'s
development-plate `THIN_K` (`src/constructions.js`) reverts from ADR-116's thinned
`[0, 1, 3, 6, 9, 11, 12]` (printed labels `1,2,4,7,10,12,1`) to the full `[0..12]` (printed
`1,2,3,4,5,6,7,8,9,10,11,12,1`), permanently. Per RULES §8.4 this supersedes ADR-116's numeral-count
clause by explicit new ADR, not a silent code change — ADR-116 itself is otherwise unchanged and its
other decisions (ONE development pattern, `ELBOW_SCALE = 0.70`, left-seam renumbering, transfer
lines, the front-view horizontal-piece `1,2,4,7` thinning, all Bhatt/K.C. John citations) all stand.
**This is a requirements override, not a correction — ADR-116's density math was never wrong.**
Driven by direct faculty feedback (domain expert, teaches Engineering Graphics): all 13 stations are
pedagogically required on the development plate, full stop, independent of whether they fit cleanly.
**Bhatt Fig. 15-11 is no longer the followed numbering convention for this one element** — its own
thinned set was the ADR-116 rationale being overridden here; every other citation in ADR-116/the
topic `CLAUDE.md` for the elbow construction itself (Bhatt Fig. 15-10/15-11 as the single-truncation
source, Fig. 15-15(v) for the mirror-image simplification) is untouched and still followed.
**Verification, done twice, because the first pass was misleading:**
1. First pass (comfortable desktop browser window, default zoom): D=50 (the report's own value,
   157.1mm stretch-out) and D=30 (slider minimum, 94.2mm, the worst-case density) both showed all 13
   numerals rendering legibly with clear gaps, zero console errors. Read in isolation this looked
   like it overturned ADR-116's arithmetic outright.
2. That reading doesn't survive a second pass. `renderConstruction.js`'s own header states numeral
   font size is a literal, zoom-invariant canvas-px constant (`NUMERAL_PX = 9`) while station
   *positions* are geometry that scales with `viewTransform`'s pan/zoom. The app auto-fits the plate
   to its viewport on load, and a comfortable desktop window auto-fits to a zoom well past
   `ELBOW_SCALE`'s raw 1:1 — stretching station spacing while the font stays fixed, giving more
   headroom than ADR-116's math assumed. That headroom is a function of window width, not a property
   of the fix. Re-tested at realistic embed widths via a same-origin `<iframe>` harness (a truer
   model of "this sim embedded in a host page" than resizing the outer browser chrome, and this
   session's `resize_window` tool did not reliably resize the actual rendered viewport anyway —
   confirmed via `window.innerWidth` staying pinned across repeated calls with different targets):
   - 600px width, D=50: numerals `1`–`9` stay legible; `10, 11, 12, 1` collide into an unreadable
     jammed cluster.
   - 600px width, D=30 (worse, as ADR-116's own arithmetic predicts): the jam starts one station
     earlier — `9, 10, 11, 12, 1` all collide.
   - 400px width: not attributable to this numeral set specifically — the entire plate (front view,
     top view, development, both region captions) overlaps at that width regardless of `D`, a
     pre-existing general layout limit of the fixed two-pane design, unrelated to `THIN_K` and out of
     scope for this ADR. Flagged below, not fixed here.
   - Console stayed clean (zero errors) through every width/D combination in both passes, including
     the fully-overlapping 400px states — this is a legibility defect, not a functional break.
   - `buildCylinder()` (unaffected by this change, still ships all 13 numerals at `CYL_SCALE = 1.10`)
     re-checked as a regression control and found unchanged — its own headroom over the 14px knockout
     box is real and structural (`CYL_SCALE > ELBOW_SCALE`), not an artifact of viewport width.
**This is recorded as a KNOWN, ACCEPTED, OPEN risk — not resolved, not mitigated.** The full-13 set
ships as-is with no zoom-aware fallback, no responsive knockout-box sizing, and no second-row
stagger. A future fix along any of those lines was considered and explicitly deferred, not rejected:
a reader must not take "kept" as "solved." Anyone revisiting this: the collision is real at ~600px
embed widths and below, worse at smaller `D`, and is currently unmitigated.
**Why:** Pedagogical completeness, per the domain expert who teaches this subject, outranks
textbook-literal numbering fidelity and this construction's own display-density limit at narrow
embed widths — the numerals exist to teach station correspondence, and a teacher's judgment that all
12 stations (13 with the closing repeat) must be visible for that to work is a requirement this
project takes at face value, not a claim that the density problem stopped existing.
**Alternatives rejected:**
- *Two-row stagger (odd stations below the flat edge, even stations above)* — considered, not
  implemented. Would very likely clear the 14px collision (roughly doubles effective per-row
  spacing) but changes the plate's own drawing convention away from every cited source figure and
  needs its own layout work; deferred, not ruled out for a future pass.
- *Zoom-aware/responsive thinning (fall back to ADR-116's 7-station set below some viewport-width or
  computed-spacing threshold)* — considered, not implemented. Same reasoning: real fix, real scope,
  deferred rather than done under this pass's docs-only mandate.
- *Keep ADR-116's thinned set and decline the faculty request* — rejected outright: this override
  exists because the requirement, not the arithmetic, changed. The unthinned math was never disputed.
**Consequences:** Easier: matches direct domain-expert teaching requirements; the development plate
always shows the same station count as the top-view circle, closing a visible asymmetry a reader
could otherwise question. Harder: the plate is confirmed to become illegible at realistic small
embed widths (≤600px) at every diameter tested, worst at the slider minimum — a real, open,
documented UX regression risk for any host page narrower than a comfortable desktop window, left for
a future pass to actually fix.
**Status:** Active — supersedes ADR-116's numeral-count clause only; ADR-116 otherwise stands.

---

## ADR-145: Regular Polygons' Construct step gets a calibrated-once fixed scale (replacing three per-shape clamps) and a unified, collision-aware label pass (replacing point-only, dot-only placement)

**Date:** 2026-08-09
**Decision:** In `graphics_diploma_module_1_topic_1_4_regular_polygons`, Phase A of this session's
audit found five reported drawing defects (not centered, inconsistent label placement, construction
lines never de-emphasizing, overlapping angle labels, and a scaling bug) traced to three root
causes, fixed together as Phase B:

1. **Framing (`src/constructions.js`).** Each construction's `build()` previously hard-coded its own
   fixed anchor plus a per-shape scale ceiling (`Math.min(1, K / side)`), so past that ceiling the
   drawing silently stopped growing while its own "N mm" dimension label kept climbing, and every
   construction sat off-centre in the 200×140 viewBox at every param value that wasn't the one the
   anchor happened to be tuned for. Replaced with `pentagonRaw()`/`hexagonRaw()`/`ngonRaw()` — each
   construction now builds its geometry in local mm-space at true side length, no clamp — plus two
   new pure helpers: `calibratedScale(id, rawFn, given, methods)`, which fixes ONE on-screen scale
   per construction, lazily computed once and cached, from the worst-case natural extent across
   every one of that construction's methods at max(side)[, max(n)]; and `centerAt(steps, scale)`,
   which recentres THAT call's own current bounds at the frame centre, redone on every `build()`.
   Scale is fixed; position is not.
2. **Labels (`src/renderConstruction.js`).** `assignLabelPositions()` previously resolved only
   `'point'`-kind labels, searched against marker dots only. Extended to also resolve `'dim'`/
   `'angledim'` labels (a radial-push search, `'angledim'` additionally searching a small angular
   shift since two angle marks whose bisectors converge toward each other don't separate at any
   radius alone), and widened the shared obstacle set to include sampled line/arc/circle ink, not
   just dots. Paired with a new `applyOutwardHints()` pass in `constructions.js` that fills in a
   real outward-from-circumcentre hint for every labelled point that didn't already carry one (the
   given A/B points, every `walkVerticesByCompass()` vertex letter, the bisector ladder numbers) —
   previously those fell back to a fixed up-right default, which reads as "inward" for any point on
   the wrong side of centre.
3. **De-emphasis + a11y.** `buildStepNode()` now stamps `data-role` on every ink node; `main.js`
   toggles `.is-complete` on `#dynamic-layer` once the full construction (or the last Step Through
   slide) is on screen, and `index.html` fades every `[data-role="move"]` element via CSS
   `!important` (several step kinds drive their own reveal-animation opacity inline on the same
   element, which would otherwise outrank a plain class rule). The move-role auxiliary circle
   (`circleStep`'s animated sweep/final circle) was also missing the DESIGN.md-mandated dashed
   second cue that lines/arcs already had — added. Labels moved into a dedicated
   `[data-layer="labels"]` sub-`<g>` that always paints above `[data-layer="ink"]`, with a
   paper-coloured `paint-order: stroke` halo, so a later step's ink can never paint over an earlier
   label. `#construction-svg` gained `tabindex="0"`/`role="img"`/a live `aria-label`
   (`main.js`'s `rebuild()` keeps it in sync with `resultText`), and `viewTransform.js` gained
   arrow-key pan / `+`/`-` zoom / `0` reset — previously the drawing was reachable by mouse only.

**Why:** RULES §2.19a — never ship a visual fix on assumed geometry. Every claim above was proved
with a headless sweep (`constructions.js` imports nothing, so it runs directly under Node) over all
3 constructions × every method × {min, default, max} side × representative n, replaying
`computeBounds()`/`assignLabelPositions()` verbatim: pre-fix, centre offset ranged up to 47.2 units
on a 200×140 frame (never zero) with 4/39 configs clipped at rest, and drawn side length tracked
requested `side` only up to a knee then froze (`unitsPerMm` swung 1.47× across the param space with
byte-identical bounds above the knee); post-fix, 0/39 configs clip and `unitsPerMm` is now CONSTANT
per construction (0.856 pentagon / 0.915 hexagon / 0.575 n-gon) — the drawn side length now tracks
`side` linearly by construction, which is what "the drawing should scale with the dimension" means.
Point labels placed inward-of-centre dropped from 355/576 (62%) to 157/576 (27%), the residual being
mostly the deliberately-unhinted circumcentre `O` label and a few tight small-side/large-apex
configs. Live-verified against the shipped module (RULES §2.19, §2.7 hard-reload) in Chrome: the
default pentagon "54° Angle + Circle" construction renders centred, its circumcircle and rays
visibly dash, both 54° marks and the 108° result angle are legible with clear halos, and every
`move`-role element visibly fades once the polygon completes.

**A live bug found and fixed mid-implementation, worth recording:** the first framing design
recomputed scale from each config's OWN current bounds every `build()` call (a live per-config
fit-to-frame). This is wrong for this topic specifically — every one of these three constructions is
a literal Euclidean similarity construction, so the raw (pre-fit) bounding box scales EXACTLY
linearly with `side`; fitting to a constant frame fraction on every call would have made the fit
scale shrink in exact lockstep with `side` growing, so the on-screen drawing would never visibly
change size at all — defeating defect 5's fix while appearing to solve defect 1. Caught by re-running
the bounds sweep and noticing `unitsPerMm` was constant ACROSS every side value tested (the live-fit
version's actual bug) rather than constant only within one fixed-scale construction (the correct,
now-shipped behaviour). This is the same distinction RULES §5.19 already draws for Module 2's 2D
sheet (intrinsic size, recomputed only when the modelled object's own size changes vs. a live/
positional auto-fit) — applied here for the first time to a topic where EVERY parameter (side, n)
is a true size parameter, with no positional/view slider to guard against.

A second, subtler bug from the same implementation pass: `assignLabelPositions()`'s obstacle set
already included every point's own marker-dot box (unconditionally, since before this session too),
which the OLD fixed +4/-4 default always happened to clear by construction. Once `applyOutwardHints`
gave real, geometry-derived hints to more points, a hint with a small vertical/horizontal component
could self-collide with its OWN dot and fall through to an oddly-rotated fallback (reproduced live:
the given point A's hint was rejected this way, landing back near its pre-fix position while B,
whose hint pointed away from the line entirely, was unaffected — an asymmetry that would have shipped
undetected without the live Chrome check). Fixed by tagging each obstacle box with its owning step
and excluding a point's own box from its own candidate search (`renderConstruction.js`).

**Alternatives rejected:**
- *Ship the live per-config fit-to-frame framing* — rejected once its self-defeating interaction
  with these constructions' pure-similarity geometry was caught (see above).
- *A literal Cache-Control/Apache config change to avoid the stale-module hard-reload gotcha* —
  out of scope for this session; RULES §2.7 already documents the workaround (hard-reload after
  every edit), which is what this verification pass used.

**Consequences:** Easier: any construction now visibly, proportionally grows/shrinks with its own
size parameters, always centred, with labels sitting outward-of-centre and legible over a fading
construction scaffold, keyboard-reachable. Harder / open: `Topic 1.1`, `Topic 1.2`, and `Topic 1.3`
were the source this topic was duplicated from (per this topic's own CLAUDE.md) and share the SAME
`renderConstruction.js`/`viewTransform.js` lineage — they were **not** audited or touched this
session, but plausibly carry the identical per-shape-clamp framing defect and the same point-only
label search; worth a follow-up audit, not assumed fixed by this ADR. A handful of extreme
min-side/large-n or min-side/small-side configs (documented in the audit's label sweep — e.g.
`hexagon`/`compass` at its own default) still have angle-label overlaps the collision search cannot
clear within its current candidate range; these are a genuine, narrower residual, not a regression
(the pre-fix code never attempted to move them at all).

---

## ADR-146: Regular Polygons' fixed drawing frame widened 200×140 → 200×200

**Date:** 2026-08-09
**Decision:** In `graphics_diploma_module_1_topic_1_4_regular_polygons`, widen the construction
SVG's fixed viewBox from 200×140 to 200×200 (`index.html`), and the two framing constants that
mirror it — `calibratedScale()`/`centerAt()`'s `height` default (`src/constructions.js`) and
`viewTransform.js`'s `BASE_H`.

**Why:** A follow-up audit of a screenshot (N-Gon / Semicircle Division, n=6, side=32, still
reading small/off-centre despite ADR-145) found ADR-145's scale/centre math correctly wired and
computing correctly — `unitsPerMm` constant per construction, 0/39 swept configs clipped,
live-measured centre offset only 5.33 units (≈15 px) — but backing out each construction's
worst-case RAW bounding box (the box `calibratedScale()` fits to the frame) showed all three are
square-to-tall: pentagon 150.0×140.2 (aspect 1.070), hexagon 116.4×131.2 (0.887), n-gon
188.9×208.8 (0.905). Fit against a 1.429-aspect landscape frame, **height was the binding
constraint for every construction, every time** — width was never the limit, capping n-gon's
scale worst (its own worst case, n=12, is far larger than pentagon/hexagon's, and that fixed
scale is what n=6 then inherits). Squaring the frame to 200×200 lets width stop being spare
capacity: recomputing the same worst-case fit gives scale ×1.40 (pentagon), ×1.50 (hexagon),
×1.50 (n-gon) versus today. Re-ran the ADR-145 bounds sweep (3 constructions × every method ×
{min, default, max} side × representative n for the n-gon) against the new frame: 0/39 configs
clip, `unitsPerMm` still constant per construction (1.2000 pentagon / 1.3723 hexagon / 0.8620
n-gon) — the ADR-145 invariant holds, this is a scale change, not a re-introduction of the
live-fit bug ADR-145's own postmortem warns against. Live-verified in Chrome (RULES §2.7
hard-reload): n=6/side=32 grows from 190×176 px to 256×238 px on screen, frame fill 32.7%W/43.5%H
→ 44.2%W/41.0%H, not clipped; pentagon/hexagon defaults re-checked at 58–81% fill, none clipped;
arrow-key pan and double-click reset re-verified against the new `BASE_H` (`viewTransform.js`'s
pan-clamp and `zoomAt()`/`resetView()` are already expressed purely in terms of `BASE_W`/
`BASE_H`, so no separate code change was needed there).

Considered widening further to 200×240 to squeeze out more: rejected because the platform-typical
`#sim-viewport` pane (measured 580×778, portrait) is width-bound at 200×200 already, so the full
scale gain reaches the screen; 200×240 only pays off once the pane itself turns landscape
(`innerWidth ≳ innerHeight + 340`), and *loses* a small amount (net ×0.97 vs. today) below that —
200×200 is the only frame size tested that is never worse than the ADR-145 baseline at any window
size.

**Consequences:** Easier: the n-gon in particular reads as a real, appreciably-sized drawing at
its default n=6 instead of floating small in the frame; pentagon and hexagon also gained
headroom. Harder / open: this only changes the fixed calibration frame, not
`assignLabelPositions()`/`applyOutwardHints()` — the pre-existing residual label-collision cases
ADR-145 already documents (e.g. the division-number labels near a polygon's top vertex at small
n) are unchanged by this ADR and remain a separate, not-yet-scheduled follow-up. Reducing the
10-unit margin further (an independent, smaller additional gain) was considered and deliberately
deferred rather than bundled in, to keep this change measurable in isolation.

---

## ADR-147: Regular Polygons' calibration-frame margin narrowed 10 → 6 units — amends ADR-146

**Date:** 2026-08-09
**Decision:** In `graphics_diploma_module_1_topic_1_4_regular_polygons`, narrow `calibratedScale()`'s
`margin` default from 10 to 6 units (`src/constructions.js`), the one remaining growth lever ADR-146
identified and deliberately deferred ("Reducing the 10-unit margin further ... was considered and
deliberately deferred rather than bundled in, to keep this change measurable in isolation").

**Why:** Since `calibratedScale()` subtracts the margin from BOTH the 200-wide and 200-tall frame
dimensions equally (`width = height = 200`), the resulting scale ratio — `(200 - 2·6) / (200 - 2·10)
= 188/180 = 1.0444` — is identical regardless of which dimension (width or height) binds for a given
construction/method, so the gain is uniform across all three constructions with no narrow-pane
downside: +4.44% linear, +9.08% area, for every one of the 39 swept configs. Verified no other code
depends on the margin=10 literal before changing it: `renderConstruction.js`'s dim/angledim label-push
"reach" constant and `viewTransform.js`'s own `ensureVisible(bounds, margin = 10)` (zoom-to-fit pan/zoom
padding) each hardcode their own independent `10`, unrelated to `calibratedScale()`'s frame margin —
narrowing one does not affect the others. Re-ran the ADR-145 bounds sweep (3 constructions × every
method × {min, default, max} side × representative n for the n-gon, 39 configs) against the new margin:
0/39 clip, `unitsPerMm` still constant per construction, and each construction's `unitsPerMm` scaled by
the exact predicted ×1.0444 (pentagon 1.2000 → 1.2533, hexagon 1.3723 → 1.4333, n-gon 0.8620 → 0.9003).
Live-verified in Chrome (RULES §2.7 hard-reload, foreground tab per the rAF-stall gotcha — automated
tabs report `document.hidden`, which stalls `anim.js`'s rAF-driven tween queue; drained it with a
manual `tick(2000)` pump before measuring/screenshotting): pentagon (default 45 mm) and hexagon
(default 35 mm) at their own default method render centred, un-clipped, both angle-pair labels and the
result angle legible; N-Gon Semicircle Division at n=6/side=32 (the ADR-146 follow-up's own reported
case) renders centred and un-clipped, `#dynamic-layer` `getBBox()` measuring 91.5×67.0 of the 200×200
viewBox, no dimension exceeding frame bounds.

**Alternatives rejected:** none — this was the single lever ADR-146 left open, applied as scoped.

**Consequences:** Easier: all three constructions read slightly larger at every param value, for free,
with no clipping or aspect-ratio regression. Harder / open: the residual label-collision cases ADR-145
already documents (e.g. hexagon/compass at its own default) are unchanged by this ADR — a narrower
margin does not touch `assignLabelPositions()`'s search radius — and remain a separate, not-yet-scheduled
follow-up, same as ADR-146 left them. No further margin reduction is planned; ADR-146's own frame-size
reasoning (200×200 is the only size tested that is never worse than the ADR-145 baseline at any window
size) is unaffected by this change.

---

## ADR-148: Regular Polygons' N-Gon Semicircle Division method separates labels for coincident division-point/vertex pairs, instead of leaving them to fight over one dot

**Date:** 2026-08-09
**Decision:** In `graphics_diploma_module_1_topic_1_4_regular_polygons`, a Phase A audit (full sweep:
3 constructions × every method × {min,default,max} side × n∈{3,5,6,7,9,12}, 51 configs) found 38/51
configs carry ≥1 label collision, from three independent causes. This ADR fixes only the first:
`buildSemicircleDivision()`'s division point `(n-2)` and polygon vertex `(n-1)` are the exact same
coordinate (float noise only, <5e-14) at **every n from 3 to 12** — proved algebraically (the
interior angle at A, `(n-2)·180/n`, is exactly division point `(n-2)`'s own angle from A, and both
points sit at radius `s` from A) and numerically (n=3..12 swept). Two different labels — a division
number and a vertex letter (`"4"`/`"G"` at n=6, `"3"`/`"F"` at n=5, etc.) — were being stamped on one
literal dot. `applyOutwardHints()` (ADR-145) gives each an independent hint (division points
away-from-A, vertex letters away-from-O) too close in angle to reliably clear two ~7-unit label boxes
anchored at the same point; `renderConstruction.js`'s `candidateOffsets()` ring-widening search
(ADR-145) cannot fix a genuinely same-point conflict no matter how far it widens.

Added `separateCoincidentLabels(steps, O)` in `src/constructions.js`, run after `applyOutwardHints()`
and wired into all three raw builders (`pentagonRaw`/`hexagonRaw`/`ngonRaw`) even though only the
n-gon's semicircle method hits the case today, so the invariant is construction-wide rather than
method-specific. For each group of labelled points sharing one coordinate (excluding groups that
share one identical label — nothing to separate — and points coincident with O itself, no direction
to derive from, same guard `applyOutwardHints()` uses): computes the tangent-to-O direction at that
point, splits the group's k members evenly around it (`θ + i·360°/k`), and grows a shared radius
(starting at `awayFrom()`'s own default of 6, +2 per attempt, up to 20 attempts) until every pair of
members' label boxes — checked with a duplicated copy of `renderConstruction.js`'s own `labelBox()`/
`boxesOverlap()`, same duplication discipline as `rawBounds()` mirroring `computeBounds()` — actually
clears. A first version used a fixed radius of 6 (angle split only) and left one live residual: at
n=12, `"10"` (two digits, wider box) and `"M"` grazed by ~0.02 units even at opposite angles, because
`labelBox()` is left/top-anchored, not centred, so opposite ANGLES alone don't guarantee clearance for
boxes of different widths — the DISTANCE has to be sized to the actual label, not guessed.

Tangential (not radial) split, not each member's own outward hint as one pole: taking a member's own
`awayFrom()` hint as θ would send its +180° partner straight back toward the crowded interior.

**Why keep both labels (not suppress the redundant one):** the task's own instruction was to check
`polygon.pdf` (the method's literal slide-deck source) before assuming suppression is cleaner.
`polygon.pdf` slides 8-9 (its own n=5 pentagon worked example) print BOTH `F` and `3` at the shared
point, side by side, split along the arc's tangent — the source itself keeps both, so this ADR mirrors
that layout rather than dropping either label.

**Why:** RULES §2.19a — proved with the same headless-sweep method ADR-145 established
(`constructions.js` imports nothing, runs directly under Node). Re-ran the 51-config sweep:
digit-vs-letter identity-class collisions dropped from 14 to 0 (one apparent remaining digit-vs-letter
pair at n=12, `"C"` vs `"11"`, checked and confirmed NOT coincident — 7.5 units apart, ordinary high-n
crowding, correctly untouched, in scope of the two causes this ADR explicitly does not fix). No
regression in the other two causes: point-vs-angledim held at 38, angledim-vs-angledim held at 9,
label-vs-ink improved 101→99 (side effect of less congestion at the now-separated points). Added a
standalone coincidence check (n=3..12, both n-gon methods): every coincident-point label group now
resolves to distinct, non-overlapping boxes — PASS. Live-verified in Chrome (RULES §2.7 hard-reload):
n=6/side=32/Semicircle Division's `"4"`/`"G"` pair measured via real `getBBox()` on the rendered
`<text>` nodes, not just the headless box-estimate model — boxes no longer overlap (previously grazed
by ~0.02-1.8 units depending on config). Reused the [[project_chrome_automation_raf_stall]] gotcha's
own workaround for measuring: an automated tab is backgrounded, which stalls `anim.js`'s rAF tween
queue — forced a full static render via a direct `renderConstruction.js`/`constructions.js` dynamic
`import()` in the page instead of waiting out Play All's animation.

**Alternatives rejected:**
- *Suppress the redundant division-number label* — the task's own fallback if `polygon.pdf` never
  double-labels the point. It does (see above), so rejected.
- *Fixed separation radius (6, angle split only)* — tried first; left a live residual at n=12 where a
  2-digit division number's wider box still grazed its letter partner at the same fixed distance. A
  radius search against the actual box model replaced it.

**Consequences:** Easier: every division-number/vertex-letter pair this method produces (10 pairs,
one per n from 3 to 12) is now guaranteed visually distinct, matching `polygon.pdf`'s own layout.
Harder / open: this ADR fixes only the coincident-point cause. Two others remain, deliberately
deferred (not in this ADR's scope): label-vs-ink collisions concentrated at min-side configs (labels
are fixed-size, geometry is calibrated from max-side, so min-side draws smallest — 99 residual pairs),
and digit-vs-digit crowding at high n (9, 12) where many division numbers pack a fixed-radius
semicircle (15 residual pairs, e.g. the `"C"`/`"11"` case found and confirmed out-of-scope above).
Topics 1.1-1.3 untouched (separate follow-up, see [[project_regular_polygons_adr145_followup]]).

---

*This log was assembled by reading ARCHITECTURE.md, the saved session-memory notes, both modules'
CHANGELOG and CLAUDE files, and the DESIGN docs. Where evidence was thin it says so. Add new ADRs
at the bottom using ADR-000.*
