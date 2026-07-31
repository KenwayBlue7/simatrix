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
attribute the event itself.

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
  finish line.

**Excluded: `graphics_module_2_topic_1_introduction`.** This topic is a free-browse anatomy
gallery with no stepper, no steps, and no progress tracking (`src/gallery.js` tracks no
visited/viewed set) — there is no "finished" state to hook without inventing a completion rule
(e.g. "all 11 solids viewed"), which is a product decision, not something this pass should assume.
It continues to emit `sim:ready` only. `Module1/`, `Module2/` stay out of scope for the same reason
ADR-078 deferred them originally.
**Status:** Active

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
**Status:** Active

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
   Set's own canvas caption verbatim. Exposed as `sim.method.beatLabel`. `methodController.js`'s
   new `syncCaption()` pushes it into a new visible `#method-caption` pill (`index.html`, wrapped
   with `.method-bar` inside a new `.method-controls` flex-column, `aria-hidden="true"`) AND the
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

---

*This log was assembled by reading ARCHITECTURE.md, the saved session-memory notes, both modules'
CHANGELOG and CLAUDE files, and the DESIGN docs. Where evidence was thin it says so. Add new ADRs
at the bottom using ADR-000.*
