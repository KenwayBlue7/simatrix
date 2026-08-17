# CLAUDE.md — Simatrix · Module 4, Topic 2: Isometric Construction

A guided **conceptual construction lesson**. Topic 1 answered *"what is an isometric drawing?"*;
this topic answers *"how is one constructed?"* — and answers it as a **process**, not a recipe. The
learner picks any of fifteen solids, gives it real dimensions, reads its three orthographic views, then
watches the same four-phase construction produce it: **axes → bounding box → shape → finish**.
Because the phases are identical for every solid and only Phase C's contents change, the
transferable idea is the ORDER, which is what lets a student construct a solid they have never seen.

**This is NOT a problem-solving simulator.** It has **no scoring and no verdict** — the learner is
guided towards a construction, never marked on one.

**Amended 2026-08-12.** This line previously read "no problem library, no answer checking, no
scoring". Two of those three changed, on a lecturer requirement:

- **It has a Problem Library** (`src/problemLibrary.js`), migrated from Topic 3: eighteen textbook
  problems, each supplying a statement and the sizes it states. A problem is an INPUT to Step 1 like
  choosing a solid, reached through **Practice Problems** exactly as Topic 3 reaches it, and it
  resolves to a solid or to a combination (`src/problemBuilder.js`). The six steps and the four
  phases are unchanged.
- **It has a LIVE self-check** while a problem is loaded: Topic 3's `answerValidator.js`, migrated
  with its logic unchanged and fed by `src/problemCheck.js`, painted as the platform's
  `.match-status` line inside the problem card. It updates as the learner dials — no button, no
  polling. `Still to match: …` while something disagrees with the question; `✓ Your construction
  matches the problem.` when nothing does.
- **Step 6 is still the replay**, with no verdict panel. Topic 3's one documented divergence
  (ADR-055 amendment 2) survives, and Next is never gated on the check.

## Deliberately OUT of scope (task brief)
Hidden-line conventions · sectioning · auxiliary views · inclination problems · intersection
problems · rotation problems · **teaching dimensioning rules** · measurement exercises · textbook
problem solving. Where a construction genuinely produces a hidden edge (the far corner of a prism),
the copy *names* that it would be drawn hidden on a finished sheet and moves on; it does not teach
the convention.

**Amended 2026-07-20 (ADR-049, RULES §8.4 — no silent reversal).** This list previously read "no BIS
Type-B dimension lines". The 3D drawing now DOES carry real Type-B dimensions (extension lines,
filled 3:1 arrowheads, centred values) — `src/dimensionLayer.js`. What stays out of scope is
*teaching* the convention: the topic never explains gaps, overshoots or arrowhead ratios, it just
draws correctly. The orthographic SVG sheet still carries no dimensions at all, so ADR-044 and
RULES §3.34 are untouched.

## Project-wide documentation (read before cross-module tasks)
This is an **Engineering Graphics** topic, so it consumes the shared EG root docs. Before any task
that touches shared behaviour, UI patterns, or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md`    — why key decisions were made (ADR log; this topic adds **ADR-043**…**ADR-051**)
- `../RULES.md`        — what you must and must not do (enforcement; this topic adds **§3.33**–**§3.41**, **§4.21**)
- `../DESIGN.md`       — colour tokens, typography, component standards (the single platform design system)
- `../PRODUCT.md`      — who it's for, features, accessibility commitments

**Design system rules:** always read and strictly follow `../DESIGN.md` for all colour, typography,
spacing, component styling and UI/UX decisions. Never hard-code design values in CSS or JS — consume
the tokens. This topic **adds no token and invents no UI pattern**: the wizard, rail, step card,
sliders, select, hint callout, term popover and flow strip are all the platform components, and the
flow strip is Topic 1's, reused for the phase transport and the summary chain. This topic carries
**no** local `DESIGN.md`/`PRODUCT.md` copy (RULES.md §1.14).

**Scope boundary:** this module produces a self-contained Three.js payload — the 3D viewport plus
its guided stepper, inline hints and sim-internal animations. The host Simatrix website is built by
other developers and is **out of scope**.

## Architecture (this topic)

Built on **Module 2's orchestrator + leaf-module pattern** (ADR-033), **standalone** like Topic 1 —
it does not use the Module-2 solids engine (`iShape` / `meshAnalyzer` / `projectionDrawer` /
`vertexLabeler` / the Problem Library). Its `src/shapeData.js` fills the same *role* as Module 2's
file of that name but is this topic's own data model, not a copy.

**The data model is the architecture (ADR-043).** `src/shapeData.js` is the only place a solid is
described; every other module is a generic interpreter that owns exactly ONE switch, over a bounded
PRIMITIVE-KIND vocabulary — never over solid names. Adding a solid is appending one object.

- **`main.js`** — the orchestrator. Owns the scene, the perspective camera + `OrbitControls`, the
  CSS2D overlay, the single disposal-safe `rebuild()`, the scene controller `enterStep(n)`, the
  Step-4 phase controller `goPhase(id)`, the Step-5 form comparison, the Step-6 replay, and
  `window.simAPI`. It owns no linework maths, no solid definitions, no step copy, no label offsets
  and no timing tables.
- **`src/shapeData.js`** — leaf DATA. The fifteen solids: dimension fields (each with its engineering
  `symbol`) · `axisSymbols` for the three box edges · `bounds()` · a geometry `body()` SPEC ·
  `views()` (2D primitives) · `construction()` (ordered 3D primitive stages). Knows nothing about
  THREE or the DOM. Also the mm ↔ world converter (1 world unit = 10 mm, RULES §6.8),
  `ISOMETRIC_SCALE` (0.816), and `resolveDims()` — the boundary that turns the learner's numbers
  into the geometry's numbers when a field is left UNKNOWN (ADR-045).
- **`src/problemLibrary.js`** — leaf DATA. The eighteen textbook problems and their four categories,
  migrated from Topic 3. Statements are VERBATIM. A problem names its solids in THIS topic's
  vocabulary (`parts: [{ solidId, dims }]`, bottom first) because Topic 3's part parameters are
  derived one way and cannot be inverted at runtime; the translation was done once, offline, and
  checked against Topic 3's own `answerData.bounds`. Adding a problem is appending one object.
- **`src/problemBuilder.js`** — leaf DATA. The whole join: one part resolves to a solid, two or more
  resolve through `combinationBuilder.js`. No second composer, no second rendering path, no
  per-problem branch.
- **`src/answerValidator.js`** — leaf, pure. **Topic 3's validator, logic byte-identical** (only its
  import line differs). Checkers are pure functions in one registry; a future check registers one
  more entry. `pending` is not `fail`, tolerance is ±0.5 mm, and it never fills anything in.
- **`src/problemCheck.js`** — leaf, pure. The adapter between Topic 2's live state and that
  validator, plus the one line the problem card shows. Derives everything, stores nothing. `main.js`
  re-runs it on the state changes the check depends on — a dimension, the subject, the form, a
  phase, a stage — and never on a timer.
- **`src/shapeFactory.js`** — leaf. Body spec → mesh + fattened ink edges + view-dependent
  silhouettes. One switch over geometry kinds. Owns and frees everything it builds. Also
  `topHalfExtent()` — how far the solid still spreads AT ITS TOP, and whether that top is round,
  which is what the figure title is placed clear of (a sphere ends in a point, a cube in a corner).
- **`src/dimensionLayer.js`** — leaf. The overall sizes as REAL BIS Type-B dimensions (ADR-049):
  extension lines with a gap and an overshoot, a narrow dimension line, filled 3:1 arrowheads in
  their own triangle soup, and an anchor for the value. Construction register — bench grey,
  `WEIGHT.dimension` — because the object, not its annotation, is the subject. A size that repeats
  across two box edges is drawn once and the other edge aliased to it.
- **`src/constructionEngine.js`** — leaf. Bounds + construction stages → the three axes, the
  bounding box, the per-solid stage linework, and the three Step-3 face highlights. One switch over
  construction primitives. **The growth trick:** axis and box geometry is written RELATIVE to the
  shared origin corner and parented to a group positioned there, so scaling that group 0 → 1 draws
  the lines OUT of the corner — the motion a hand makes — without rewriting geometry per frame.
- **`src/orthographicDrawer.js`** — leaf. Builds the first-angle SVG sheet (front above XY, top
  below, side beside) with the projection lines, the HP/VP tags, and a focusable/ARIA-labelled group
  per view. SVG, not a WebGL pass — ADR-044.
- **`src/isoAngles.js`** — leaf. Phase A's two **30° arcs**: a screen-space SVG overlay (horizontal
  datum · thin arc onto each receding axis · the value) re-derived every frame from the PROJECTED
  axis directions, so it stays readable at any zoom. It imports nothing — main.js hands it points
  that are already projected. Honest by composition, not by fudging: main aims the camera at the
  construction origin so that corner sits on the principal axis, where the projection preserves
  angles, and the annotation fades out as the camera leaves the isometric sight-line (ADR-047).
- **`src/transferLayer.js`** — leaf. Phase B's dimension carrier: a dashed leader plus a ruled token
  that flies from an orthographic view to the box edge that size is set off along, then hands over
  to the CSS2D callout. Screen space, because the two ends live in different worlds. Imports only
  `anim.js`, so `simAPI.pause()` freezes a transfer in flight.
- **`src/cameraRig.js`** — leaf. Named viewing DIRECTIONS + a per-rebuild framing radius; every move
  is a fixed-duration eased flight, never a teleport. `retarget()` slides what the camera AIMS at
  without changing where it looks from — Phase A's 30° claim depends on the origin corner staying
  centred, and a dimension edit moves that corner.
- **`src/labelLayer.js`** — leaf. The CSS2D label factory AND the single documented placement policy
  (`PLACEMENT`, RULES §3.27a). No other file invents an offset. A FIGURE TITLE is the one placement
  that cannot be tabulated: main.js projects the real high points against the live camera each frame
  and passes the lift in, because what a solid throws highest depends on its shape AND the pose
  (ADR-050). Its clearance is in SCREEN space so the gap reads the same at every size.
- **`src/uiManager.js`** — leaf. Owns the parameter dock: the Step-1 solid picker and the Step-2
  dimension fields, built from `shapeData` (RULES §4.14). Controls never touch the scene; they call
  back into the injected controller, which funnels into `rebuild()`.
- **`src/constructionSteps.js`** — leaf DATA: the six-step rail/card copy (`STEPS`) and the four
  construction phases (`PHASES`).
- **`src/summaryAnimator.js`** — leaf. The abortable, token-guarded timeline behind Step 4's phases
  and Step 6's replay, plus the summary timing/chain data.
- **`src/tokens.js`** — STATELESS shared util (RULES §3.6a): token → role → `THREE.Color`, plus the
  named line WEIGHTs. Several leaves import it; that is the documented carve-out, not a §3.6 breach.
- **`src/stepper.js`** — the guided-stepper controller; drives the rail + card and calls
  `sim.enterStep(n)`. A step is reachable once visited; upcoming steps stay locked.
- **`src/terms.js`**, **`src/onboarding.js`** — the platform popover + onboarding leaves.
- **`src/anim.js`** — the shared tween + easing engine, **byte-identical** to Module 2's
  (RULES §7.1 — never edit it here; fix it in the master and re-copy).

## Platform contract (required)
- `meta.json` with all four fields; `<title>` matches `meta.json.title` ("Isometric Construction") —
  RULES §1.12.
- `window.simAPI { pause, resume, reset }`; the in-sim Reset routes through `simAPI.reset()` only,
  guarded by the inline two-state confirm (RULES §2.9, §4.19).
- Self-starting on load; import map pins `three@0.160.0`; `.js` extensions; relative paths.
- Dismissible "Best experienced on desktop." notice below 768px.

## Cross-cutting rules
- Every geometry change routes through the single `rebuild()`; nothing else touches the scene graph.
  A dimension edit re-asserts the current step via `applyStepState()` rather than re-entering it —
  restarting the camera flight on every slider tick would strobe the viewport.
- Read all colours from CSS custom properties at runtime (through `tokens.js`); never hard-code hex.
- Blue stays in the chrome only. Viewport meaning uses ink linework, the neutral construction grey,
  and the HP/VP/PP domain encodings on the sheet and the face highlights.
- Geometry is built from `currentDims()` — the resolved set — never from `state.dims` (RULES §3.35).
- Viewport annotation is written in engineering notation from the data (`L`, `ØD`, `R`), never in
  descriptive words (RULES §3.36).
- Step 5 leaves a SCALE on the shared solid rig; `resetSceneLayers()` puts it back to 1 (RULES §4.21).
- Step-5 scale comes from `formScaleFor(solid, mode)`, never from `FORM_SCALE` directly: a sphere is
  drawn at its TRUE diameter in both forms (it has no length along an axis to reduce), and it says so
  in its own `formNote` (RULES §3.41, ADR-051).
- Camera moves are eased flights, never teleports; everything collapses to instant under
  `prefers-reduced-motion`, but the state still lands.
- Leaf modules never import each other. `shapeData.js` and `tokens.js` are the stateless shared
  utils (§3.6a); everything else hangs off `main.js`.
