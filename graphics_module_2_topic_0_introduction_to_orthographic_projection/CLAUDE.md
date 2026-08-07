# CLAUDE.md — Simatrix · Module 2, Topic 0: Introduction to Orthographic Projection

The **first** thing a student meets in Module 2, and it answers exactly two questions before
handing over to Topic 1:

1. **What is a view?** Four textbook machine parts on a dropdown, free orbit, the textbook's
   **Front arrow** marking which face the elevation is taken from, and the four principal
   directions as buttons — each landing in a true orthographic projection, not a perspective
   picture of one. Two independent switches: the floating **Dimensions** chip (the sizes, on the
   solid and the sheet alike) and **Front arrow** in the card, which rides with the model.
2. **How is a drawing made from them?** The same object drawn in **first angle** on **blank
   paper**, one press at a time: elevation, then plan, then the side view **the learner chooses**,
   each built as *construction lines → outline → hidden detail → centre lines*, then dimensioned
   in the **aligned system**.

**TWO STEPS, and two is the whole topic.** Everything after this — inclined solids, simple
positions, sections, auxiliary views — needs both answers in place and neither of them
re-explained.

## Deliberately OUT of scope
Third-angle projection (named in Step 2's glossary, never drawn) · **the HP/VP/XY apparatus and
the four quadrants** (ADR-131 — that is `graphics_module_1_topic_2_spatial_framework`'s lesson;
here first angle is taught as its observable consequence) · inclined or tilted solids · sections ·
auxiliary views · missing-view problems · a problem library, answer checking or scoring · teaching
the dimensioning *rules*. The sheet dimensions correctly to BIS Type B in the
aligned system, but it never teaches gaps, overshoots or arrowhead ratios — that is
`graphics_module_1_topic_1_1_dimensioning`'s subject and this topic must not restate it.

## The source
The four objects are the parts worked in **"Intro To Machine Drawing", Chapter 19 (Multiview
Projection of Objects), pages 252–254**.

Listed in **picker order** — the order the dropdown reads, which is also `OBJECTS` order and so
the default object and what Reset returns to. Figure numbers live here, not on the buttons: a
figure number is a fact about the textbook, not about the object.

| # | Object | Figure | What it introduces | Default side view |
|---|---|---|---|---|
| 1 | Cylindrical Block | Fig. 19.20 | Circles, centre lines, a blind bore's hidden lines | Right → drawn LEFT |
| 2 | Shaft Support | Fig. 19.21 | One hole that is a circle in one view and dashes in two | Left → drawn RIGHT |
| 3 | Bearing Block | Fig. 19.22 | Two lugs that coincide in the elevation and separate elsewhere | Right → drawn LEFT |
| 4 | Stepped Block | Fig. 19.24 | The three-view layout, with nothing else going on | Left → drawn RIGHT |

Two of each default placement, so the first-angle crossover is something the learner *sees* on both
sides rather than a sentence they are asked to trust — and the side-view radio lets them flip any
object to the other side and watch it move. Principal sizes are the figures' own; a size
that was not legible on the printed scan carries a `// chosen` comment at its definition in
`src/objectData.js`.

## Project-wide documentation (read before cross-module tasks)
An **Engineering Graphics** topic, so it consumes the shared EG root docs. Before any task that
touches shared behaviour, UI patterns or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md` — why key decisions were made (ADR log; this topic adds **ADR-127**…**ADR-132**)
- `../RULES.md` — what you must and must not do (enforcement; this topic adds **§3.67**–**§3.70** and **§4.5a**)
- `../DESIGN.md` — colour tokens, typography, component standards (the single platform design system)
- `../PRODUCT.md` — who it is for, features, accessibility commitments

**Design system:** always read and follow `../DESIGN.md` for colour, typography, spacing,
component styling and UI/UX. Never hard-code design values in CSS or JS — consume the tokens.
This topic **adds no token and invents no UI pattern**: wizard, rail, step card, segmented control,
checkbox, radio, hint callout, term popover, mobile notice and reset confirm are all platform
components. It does take ONE named colour exception — the Front arrow on `--color-accent` inside
the viewport, bound to the single-consumer `guide` role (ADR-130, RULES.md §4.5a).
It carries **no** local `DESIGN.md` / `PRODUCT.md` copy (RULES.md §1.14).

**Scope boundary:** this module produces a self-contained Three.js payload — the 3D viewport plus
its guided stepper, drawing sheet and inline hints. The host Simatrix website is built by other
developers and is **out of scope**.

## Architecture (this topic)

Built on **Module 2's orchestrator + leaf-module pattern**, **standalone**: it does not use the
Module-2 solids engine (`iShape` / `meshAnalyzer` / `projectionDrawer` / `vertexLabeler` / the
Problem Library), because its objects are machine parts rather than the five generated solids and
its drawing is authored linework rather than a live edge classification.

**Cut from `graphics_module_4_topic_2_isometric_construction`** — the nearest sibling, and the one
carrying the two layers this topic needed (an SVG first-angle sheet and a named-direction camera
rig) — per RULES.md §1.15. `src/anim.js` was then re-copied from `Module2/src/` and md5-verified
byte-identical to the master (§7.1); the sibling's own copy had drifted to CRLF and was NOT the
file taken.

> **Note (2026-08-07, merge):** that sibling topic is not yet in this repo — on `feat/mod4` it
> existed only as a dangling gitlink (never pushed, ADR-039 violation), excluded from the merge.
> See `DECISIONS.md` ADR-142. The attribution above is accurate history; the path just doesn't
> resolve yet.

**Shared engine files carried (RULES.md §1.16 — nothing carried that is not imported):**
`anim.js` (byte-identical to Module 2's master — never edit it here; fix it in the master and
re-copy), `tokens.js`, `cameraRig.js`, `stepper.js`, `terms.js`, `onboarding.js`. No shape
generator, no `meshAnalyzer.js`, no `iShape.js`, no `problems.js`.

- **`main.js`** — the orchestrator. Owns the scene, the perspective camera + `OrbitControls`, the
  single disposal-safe `rebuild()`, the step controller `enterStep(n)`, the Step-2 stage controller
  `setStage(i)`, and `window.simAPI`. It owns no geometry maths, no object definitions, no drawing
  vocabulary and no step copy.
- **`src/objectData.js`** — leaf DATA, and the single place an object is described: 3D part specs,
  the three views as layered 2D linework, the aligned dimensions each view carries, and the Step-1
  copy per camera direction. Knows nothing about THREE or the DOM. **Its header states the four
  coordinate frames** (world, elevation, plan, and each side view) — read it before touching any
  view's linework, because the two sign flips in there ARE first-angle projection.
- **`src/objectRig.js`** — leaf. Part specs → mesh + fattened ink edges, plus the **Front arrow**
  and its CSS2D label. ONE switch over geometry kinds (`extrude` / `lathe`), never over object
  names. Owns and frees everything it builds, DOM label included (RULES.md §3.5). Note
  `setVisible()` toggles the label BY NAME as well as the group: `CSS2DRenderer` tests each
  object's own `visible` flag and never consults its ancestors.
- **`src/dimensions3d.js`** — leaf. BIS Type-B dimensions on the SOLID, so Step 1 can be checked
  against the textbook. Reads the SAME `objectData.dims` the sheet draws and lifts each 2-D view
  frame onto the matching face; draws the set for the direction the camera is at, and no other.
  Open 3:1 chevrons keep it one `LineSegments2` (ADR-132). Never author a second dimension set for
  it — the registry is the one source, and `DIM_STYLE` there is the one set of BIS numbers. The
  heads are 3:1 and must stay so: ADR-134's 15° heads are scoped to the topic that TEACHES
  termination geometry, and RULES.md §6.19's default governs incidental dimensions like these.
- **`src/projectionSheet.js`** — leaf. The first-angle SVG sheet: layout, the derived projection
  lines and 45° mitre, the aligned Type-B dimensions, and the staged reveal. Its stage list is
  **derived from the linework each view actually carries**, so an object with no hidden detail in
  its elevation simply has no hidden stage there (RULES.md §3.52).
- **`src/uiManager.js`** — leaf. Owns the dock: the object dropdown, the four direction buttons +
  Free Orbit, the Dimensions switch (in the card AND as the viewport chip) and Step 2's side-view
  radio (RULES.md §4.14). Controls never touch the scene; they call the injected controller. The
  Dimensions switch exists twice and latches in NEITHER place — both are pushed from
  `setAnnotations()`, so a second entry point cannot become a second source of truth.
- **`src/orthoSteps.js`** — leaf DATA: the two-step rail/card copy, the build order and its reasons,
  and the line-alphabet legend.
- **`src/cameraRig.js`** — leaf. Named viewing DIRECTIONS + a per-rebuild framing radius; every move
  is a fixed-duration eased flight, never a teleport.
- **`src/tokens.js`** — STATELESS shared util (RULES.md §3.6a): token → role → `THREE.Color`, plus
  the named line weights. The `guide` role (`--color-accent`) is the topic's one named exception to
  Chrome-Only Blue and has exactly ONE consumer, the Front arrow (ADR-130, RULES.md §4.5a). Do not
  add a second.
- **`src/stepper.js`**, **`src/terms.js`**, **`src/onboarding.js`**, **`src/anim.js`** — the
  platform leaves.

## Platform contract (required)
- `meta.json` with all four fields; `<title>` matches `meta.json.title`
  ("Introduction to Orthographic Projection") — RULES.md §1.12; `difficulty` lowercase (§2.11a).
- `window.simAPI { pause, resume, reset }`; the in-sim Reset routes through `simAPI.reset()` only,
  guarded by the inline two-state confirm (RULES.md §2.9, §4.19).
- Self-starting on load; import map pins `three@0.160.0`; `.js` extensions; relative paths.
- Dismissible "Best experienced on desktop." notice below 768px, which reserves its own height.

## Cross-cutting rules
- Every geometry change routes through the single `rebuild()`; nothing else touches the scene graph.
  The sheet is re-laid out **inside** that same pipeline, so it can never describe the previous
  object (RULES.md §3.42).
- The two panes are ONE state. In Step 2 the camera is driven BY the stage list — the stage being
  drawn names a view and the solid turns to it. There is no second control that could put the solid
  on the plan while the sheet inks the elevation.
- Step 2 opens on a **blank sheet**, never on the finished drawing (RULES.md §3.57). Forward
  animates and is disabled while a stage is still drawing; **Previous never replays and never moves
  the camera** (§3.49).
- The sheet carries **no XY line, no plane tags, no quadrant apparatus** (ADR-131). The XY ordinate
  still exists in `projectionSheet.js`'s layout maths as the datum every view is placed against —
  it is simply not drawn. Do not "restore" it.
- The **side view is the learner's choice** and lives in `main.js`'s state, not in the data, so a
  rebuild cannot revert it. Changing it rewinds the reveal to blank paper, because it changes the
  derived stage list. The **Dimensions switch deliberately does NOT** — it is visibility only
  (`sheet.setDimensions()`), so it can be thrown mid-construction. It used to be a `layout()` input
  and that inverted the control: turning dimensions on made the drawing vanish (ADR-131, amended).
- **Camera flights are arcs about the target, never chords.** Left and Right are 180° apart, so
  lerping positions runs the eye through the object. Do not "simplify" `arcBetween()` back.
- The **Left/Right cameras are correct and have been measured** (Stepped Block: treads visible from
  the right, concealed from the left). What reads as "swapped" is first-angle PLACEMENT. Say it in
  the copy; do not "fix" the geometry (RULES.md §3.50, §8.6).
- Projection lines **animate, then fade** — to a ghost once the view they carried is inked, and out
  altogether once the sheet is dimensioned. They are never deleted mid-build; a learner going Back
  has to be able to find them again.
- The sheet's line alphabet is CLOSED, and it is FIVE weights in three visual levels:
  **silhouette 2.5 px · internal visible edge 1.8 · hidden 1.5 dashed · centre 1.3 chain ·
  supporting 1.0**. Projection, dimension and extension lines are all the 1.0 — they recede by
  colour and by the fade, not by a sixth width (RULES.md §3.58).
- The **silhouette / edge split is deliberate and is NOT the standard**: ISO 128 and BIS SP 46 give
  visible outlines and visible edges one width, which is what the benchmark topic draws. It is the
  textbook teaching emphasis, kept because a beginner has to find where the object ends before they
  can read what is on it. Do not "correct" it back without reading this line first.
- Those are PIXEL widths on a sheet measured in millimetres, and they work because every rule is
  `calc(<px> * var(--ink-scale))`, with `--ink-scale` published by `projectionSheet.js` from the
  sheet's LIVE fit scale on layout and on resize. **Never swap that for
  `vector-effect: non-scaling-stroke`**: it makes Chrome compute `stroke-dasharray` in screen space,
  which disables `pathLength="1"` and turns every drawn-on outline into a 1 px dotted line — while
  the dashoffset property still animates to 0, so it does not show up in a property check. The
  oracle asserts no drawn-on stroke is non-scaling for exactly this reason.
- Read all colours from CSS custom properties at runtime (through `tokens.js` in JS, `var(--…)` in
  the sheet's CSS); never hard-code hex. Blue stays in the chrome only.
- The sheet is authored and laid out in **millimetres** and fitted with one `viewBox`, so a real
  millimetre reads the same length everywhere on it at every pane size — RULES.md §5.19's measured
  invariant, obtained by construction rather than by locking a scale.
- Camera moves are eased flights, never teleports; everything collapses to instant under
  `prefers-reduced-motion`, but the state still lands.
- Leaf modules never import each other. `objectData.js` and `tokens.js` are the stateless shared
  utils (§3.6a); everything else hangs off `main.js`.
