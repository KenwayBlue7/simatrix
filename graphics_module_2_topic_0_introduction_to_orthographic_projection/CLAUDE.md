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
the four quadrants** (ADR-208 — that is `graphics_module_1_topic_2_spatial_framework`'s lesson;
here first angle is taught as its observable consequence) · inclined or tilted solids · sections ·
auxiliary views · missing-view problems · a problem library, answer checking or scoring · teaching
the dimensioning *rules*. The sheet dimensions correctly to BIS Type B in the
aligned system, but it never teaches gaps, overshoots or arrowhead ratios — that is
`graphics_module_1_topic_1_1_dimensioning`'s subject and this topic must not restate it.

## The source
The four objects are the parts worked in **"Intro To Machine Drawing", Chapter 19 (Multiview
Projection of Objects), pages 252–255**.

> **Audited against the figures on 2026-08-17 and corrected — ADR-221, RULES.md §6.37.** All four
> objects differed from the figure they cite. Read that ADR before changing any size here; the
> `CHANGELOG.md` entry of the same date lists the corrections per object. Two traps it records:
> **19.24 is captioned "A block" and 19.27 is "A stepped block"** — the object named Stepped Block
> was built from the wrong one; and the Bearing Block's **37 is the height to the bore centre**, not
> the overall height.

Listed in **picker order** — the order the dropdown reads, which is also `OBJECTS` order and so
the default object and what Reset returns to. Figure numbers live here, not on the buttons: a
figure number is a fact about the textbook, not about the object.

| # | Object | Figure | What it introduces | Default side view |
|---|---|---|---|---|
| 1 | Cylindrical Block | Fig. 19.20 | Circles, centre lines, a blind bore's hidden lines, and a forked plate the plan alone can show | Right → drawn LEFT |
| 2 | Shaft Support | Fig. 19.21 | One hole that is a circle in one view and dashes in two | Left → drawn RIGHT |
| 3 | Bearing Block | Fig. 19.22 | Two lugs that coincide in the elevation and separate elsewhere | Right → drawn LEFT |
| 4 | Stepped Block | Fig. 19.27 | The three-view layout with nothing else going on — and two side views that disagree | Left → drawn RIGHT |

Two of each default placement, so the first-angle crossover is something the learner *sees* on both
sides rather than a sentence they are asked to trust — and the side-view radio lets them flip any
object to the other side and watch it move. Principal sizes are the figures' own; a size the figure
genuinely does not print carries a `// chosen` comment at its definition in `src/objectData.js`.
**That marker is a claim about the figure, and it was wrong twice** — the Shaft Support's bolt hole
IS printed, as R6 with a leader pointing straight at it, and the Bearing Block carried three for
sizes the figure gives plainly. **None now survives.** The last one, the Shaft Support's head
radius, turned out to be derived rather than chosen: the figure's R12 leader points at the BORE, and
the head's own arc is drawn TANGENT to the lug's two 40 mm faces, so it is half the depth and
nothing else will close (ADR-226). Before adding the marker, look for what the geometry forces.

**The Cylindrical Block is ONE solid, not a boss on a plate.** Its Ø50 column runs the whole 40 mm
to the bench and the 100 × 40 × 12 forked plate is merged onto it; since the column is 50 across and
the plate 40 deep, the plate stops dead against it at ±15 and is therefore TWO extrusions, each
ending on an exact arc (ADR-227, RULES.md §6.40). No CSG: the junction curve is a circle of known
radius, so it is authored rather than computed. **When auditing a part, ask where each feature ENDS,
not only how big it is** — this one passed two audits on diameter, height, bore and overhang while
its column stopped in the wrong place, because nobody put that question to the views. Each view
answers it differently: the elevation runs the plate's top face inboard of the column's silhouette,
the side view is a plain rectangle rather than a stepped one, and the plan draws the circle complete.

**One object is blended, and it decides how its solid is cut up.** Fig. 19.21 prints `R6` twice on
the Shaft Support's elevation — into the root of the upright and onto the top corner of the base —
and both are drawn at both ends, so there are four, all running the full 40 mm depth. A blend is an
arc in the ELEVATION profile pushed along z; a bolt hole is a hole in the PLAN profile pushed along
y; no one extrusion is both, so the part is eight butt-joined pieces rather than four, split where
the two features stop overlapping (ADR-226, RULES.md §6.39). The other three objects are square
everywhere — including the Cylindrical Block's boss, whose apparent blend in Fig. 19.20(a) is the
overhanging bottom rim of a Ø50 boss on a 40 deep plate. **Test a blend against the printed views,
never against the pictorial**: the elevation shows a square corner and the plan draws two circles
where a blend would need three.

## Project-wide documentation (read before cross-module tasks)
An **Engineering Graphics** topic, so it consumes the shared EG root docs. Before any task that
touches shared behaviour, UI patterns or cross-module consistency, read:
- `../ARCHITECTURE.md` — system map, component breakdown, data flow
- `../DECISIONS.md` — why key decisions were made (ADR log; this topic adds **ADR-204**…**ADR-209**)
- `../RULES.md` — what you must and must not do (enforcement; this topic adds **§3.67**–**§3.70** and **§4.5a**)
- `../DESIGN.md` — colour tokens, typography, component standards (the single platform design system)
- `../PRODUCT.md` — who it is for, features, accessibility commitments

**Design system:** always read and follow `../DESIGN.md` for colour, typography, spacing,
component styling and UI/UX. Never hard-code design values in CSS or JS — consume the tokens.
This topic **adds no token and invents no UI pattern**: wizard, rail, step card, segmented control,
checkbox, radio, hint callout, term popover, mobile notice and reset confirm are all platform
components. It does take ONE named colour exception — the Front arrow on `--color-accent` inside
the viewport, bound to the single-consumer `guide` role (ADR-207, RULES.md §4.5a).
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
- **`alignedDim()`** in `objectData.js` is the ONE place BIS Method 1 is implemented, and both
  renderers call it: it takes a `dim()` entry and returns the dimension line's ends, the angle the
  value is turned through and where the value's centre goes. Sharing only `DIM_STYLE` was not
  enough — each renderer used to carry its own copy of the same trigonometry, and one copy had a
  sign error that printed every RE-READ value under its own line (RULES.md §3.71). Do not re-derive
  a placement in a renderer; add what you need to the function's return.
- **`src/dimensions3d.js`** — leaf. BIS Type-B dimensions on the SOLID, so Step 1 can be checked
  against the textbook. Reads the SAME `objectData.dims` the sheet draws and lifts each 2-D view
  frame onto the matching face; draws the set for the direction the camera is at, and no other.
  Open 3:1 chevrons keep it one `LineSegments2` (ADR-209). Never author a second dimension set for
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
  Chrome-Only Blue and has exactly ONE consumer, the Front arrow (ADR-207, RULES.md §4.5a). Do not
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
- **`sim:ready` boot signal** (ADR-078, narrows ADR-002): `markBooted()` posts
  `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` — the one
  sanctioned outbound `postMessage`. Do not add any other `postMessage`/inbound listener.

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
- The sheet carries **no XY line, no plane tags, no quadrant apparatus** (ADR-208). The XY ordinate
  still exists in `projectionSheet.js`'s layout maths as the datum every view is placed against —
  it is simply not drawn. Do not "restore" it.
- The **side view is the learner's choice** and lives in `main.js`'s state, not in the data, so a
  rebuild cannot revert it. Changing it rewinds the reveal to blank paper, because it changes the
  derived stage list. The **Dimensions switch deliberately does NOT** — it is visibility only
  (`sheet.setDimensions()`), so it can be thrown mid-construction. It used to be a `layout()` input
  and that inverted the control: turning dimensions on made the drawing vanish (ADR-208, amended).
- **Camera flights are arcs about the target, never chords.** Left and Right are 180° apart, so
  lerping positions runs the eye through the object. Do not "simplify" `arcBetween()` back.
- The **Left/Right cameras are correct and have been measured** (Stepped Block, since Fig. 19.27:
  treads visible from the **left**, concealed from the right by the full-height wall at the other
  end — the reverse of Fig. 19.24's object, which this line used to describe). What reads as
  "swapped" is first-angle PLACEMENT. Say it in the copy; do not "fix" the geometry (RULES.md
  §3.50, §8.6).
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
- Dimensioning is **aligned (BIS Method 1) in BOTH media**, and that is not negotiable: a value lies
  along its own dimension line, sits one 3.2 mm lift above it, and is turned into the half-circle
  that reads from the bottom edge or the right-hand edge. It applies to the SOLID as much as to the
  sheet — "a CSS2D label is billboarded, so the rotation is about paper" was the reasoning behind
  the defect, not behind the design (ADR-209 amended). Two things that look like exceptions and are
  not: a **leader's note stays level**, because a note is written along its horizontal landing in
  both systems; and the turn on the solid is a **constant**, because the layer is only drawn for the
  direction the camera is AT, where the view's own frame lands on the screen square.
- The turn on the solid lives on the **inner `.vp-dim__text` span**. `CSS2DRenderer` rewrites the
  outer element's transform every frame, so a rotation set on the node itself lasts one frame.
- Values are anchored on their **centre** in both media — SVG `dominant-baseline: central`, CSS2D's
  own 0.5/0.5 — which is what makes `DIM_STYLE.textLift` one derived number. Remove the baseline
  rule and every turned value swings about a point below itself.
- **Lanes**: one lane per dimension that OVERLAPS another along the same direction, smallest
  innermost. Two dimensions that do NOT overlap — consecutive stretches of one line, like a lug and
  the gap beside it, or two treads of a stair — **chain in a single lane**, head to head. The `off`
  is measured from a dimension's own endpoints, so one taken at a raised datum adds that datum to
  reach the same visual lane. `verify/shipped-module.mjs` measures all of this on the finished sheet
  in SCREEN space; do not go back to `getBBox()`, which ignores an element's own transform and is
  therefore blind to exactly what Method 1 adds.
- The **Front mark is one object**: the arrow points at material on the front face (`frontFaceAnchor()`
  finds it by ray, because a box centre is mid-air on an L-shaped face), and the label rides the
  MIDDLE of the shaft one arrow-head below it. Every offset in it is a fraction of the ARROW, so it
  holds its spacing at every direction and zoom. Do not park the label on the paper and then push it
  clear of the dimension lane — that was tried, and it is how the name ended up adrift (RULES.md
  §3.72). Note `LineSegments2` extends `Mesh`: filter it out of any ray test.
- **A scroll is a zoom; only a drag is a turn.** Never hang "the learner has taken over" on
  `OrbitControls`' `start` — it fires for the wheel too, and in this topic that swaps the projection,
  the dimension set and the frame in one notch. A drag is 3 px of movement with exactly ONE pointer
  down. `focusOn()` retargets when idle and flights `settle()` with damping off (RULES.md §5.21/§5.22).
- **A MIRROR IS NOT THE OTHER SIDE VIEW.** The sheet reflects the authored side view to produce the
  one the learner asks for, and that is exact only where the part is symmetric about its mid-plane.
  The Stepped Block is not: its wall hides all three treads from the right and none from the left,
  and reflecting a dashed line cannot make it solid. Objects whose two sides disagree author both —
  `views.sideFlip`, in the second view's own frame, used as authored. Dimensions still mirror
  (ADR-222, RULES.md §3.73).
- **Ø ALSO APPEARS WHERE THERE IS NO CIRCLE.** `acrossDia()` is the third form of the mark: a linear
  dimension between a cylinder's two silhouette lines, carrying the Ø prefix, its number derived
  from the radius. It is how the Cylindrical Block's elevation states Ø50 — the plan can only offer
  R25. Not an exception to `roundDim()`: the symbol still comes from the geometry and the number
  from the radius, and neither is typed (ADR-223, RULES.md §6.38).
- **Views are spaced by `markBox()`, not by `boxes`.** `boxes` is the linework alone — right for
  centring a caption, wrong for spacing two views, because a dimension in a second lane lands on the
  neighbour. `markBox()` adds the dimension line, the value where `alignedDim()` puts it, and a
  leader's elbow and shelf. `reachOf()` reads the value's real position too, not an end plus a
  constant: a value facing ACROSS the sheet reaches no further ALONG it than the view's own edge
  (ADR-224, RULES.md §3.74).
- **`EdgesGeometry` cannot pair an ear-clipped lid.** Measured: three unpaired diagonals per cap for
  a six-point stair profile, none for a rectangle or a triangle, and winding makes no difference.
  They arrive at full outline weight. `objectRig.js` filters them against the authored profile while
  it is still to hand — a cap-plane segment survives only if its ends are consecutive profile
  points. Never add, only remove (ADR-225, RULES.md §3.75).
- **⌀ or R comes from the SWEEP THE VIEW DRAWS, through `roundDim()`.** Never type the symbol. A
  50 mm boss on a 40 mm plate is a cylinder, and the plan draws 148 deg of it, so the plan says R25.
  Both marks END the same way — slanting leg, horizontal shelf, value LEVEL above it — and differ at
  the feature end. A **diameter's line crosses the CENTRE** (far side of the circle, through the
  middle, out to the elbow, an arrowhead at each end of the diameter). A **radius starts ON the arc**
  and never reaches the centre, because a line across the middle would say diameter. The geometry
  states the measurement; the shelf keeps what the learner reads off the feature. Test against the
  view's primitives, never against the authored label (RULES.md §6.35/§6.36, ADR-218).
- **`controls.target` is EASED onto new content, never assigned.** A view change rebuilds the
  annotation layer before the flight starts, so the content box moves; setting the target in one step
  swung the camera in a single frame and was the whole of the "view switching jumps" report.
  `focusOn()` tweens it over 260 ms and `flyToNamed()` cancels that tween and carries the target
  itself. Holding the eye-to-target offset instead does NOT help — the eye has still moved, so the
  scene slides by the parallax. Prove a transition by sampling it per FRAME, not by checking where it
  landed (RULES.md §5.22/§5.23, ADR-217).
- Read all colours from CSS custom properties at runtime (through `tokens.js` in JS, `var(--…)` in
  the sheet's CSS); never hard-code hex. Blue stays in the chrome only.
- The sheet is authored and laid out in **millimetres** and fitted with one `viewBox`, so a real
  millimetre reads the same length everywhere on it at every pane size — RULES.md §5.19's measured
  invariant, obtained by construction rather than by locking a scale.
- Camera moves are eased flights, never teleports; everything collapses to instant under
  `prefers-reduced-motion`, but the state still lands.
- Leaf modules never import each other. `objectData.js` and `tokens.js` are the stateless shared
  utils (§3.6a); everything else hangs off `main.js`.
