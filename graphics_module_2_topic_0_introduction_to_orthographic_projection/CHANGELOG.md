# Changelog — Module 2, Topic 0: Introduction to Orthographic Projection

## 2026-08-06 — Built

- **Added** the topic: a two-step introduction to orthographic projection, the first thing a
  student meets in Module 2. Step 1 is four textbook machine parts under free orbit with the four
  principal directions as buttons and a panel that says what each one shows; Step 2 draws the
  same object in first angle, one press at a time. Scaffolded from
  `graphics_module_4_topic_2_isometric_construction` per RULES.md §1.15 — the nearest sibling, and
  the only one already carrying an SVG first-angle sheet and a named-direction camera rig.
- **Added** `src/objectData.js`, the single place an object is described: 3D part specs, the three
  views as layered 2D linework, the aligned dimensions, and the Step-1 copy per direction. Its
  header states the four coordinate frames once, and the two sign flips in them **are** first-angle
  projection — the plan's near edge finishes furthest from XY, and each side view's near face
  finishes on the outer side. Four objects from Chapter 19, pages 252–254: the Stepped Block
  (Fig. 19.24), the Cylindrical Block (Fig. 19.20), the Shaft Support (Fig. 19.21) and the Bearing
  Block (Fig. 19.22), two carrying a left side view and two a right, so the crossover is something
  the learner sees on both sides rather than a sentence to trust.
- **Added** `src/objectRig.js` — part specs → mesh + fat ink edges, one switch over two geometry
  kinds. `extrude` covers every prismatic piece in the chapter with its holes carried through as
  real missing material; `lathe` exists for the one thing an extrusion cannot express, the
  cylindrical block's BLIND bore, because a blind pocket has a floor.
- **Added** `src/projectionSheet.js` — the first-angle sheet, authored and laid out in millimetres
  and fitted with one `viewBox`, so a real millimetre reads the same length everywhere on it at
  every pane size (RULES.md §5.19's measured invariant, obtained by construction rather than by
  locking a scale against a bbox). It derives the projectors, the 45° mitre and the whole stage
  list from the views it is laying out.
- **Changed** `src/cameraRig.js` from the sibling's: it now carries the platform's **dual-camera
  pair** and moves between them with the `projectionMorphK` matrix morph (RULES.md §5.18). A
  perspective view from the front draws a boss's top as an ellipse and no true size anywhere, which
  is every single thing an orthographic view is defined by NOT showing — a topic whose first claim
  is "this is the elevation" cannot present one. Free orbit is perspective, the four principal
  directions are orthographic, and the transition is the morph. Recorded as **ADR-128**.
- **Changed** the rig's framing from a bounding-SPHERE fit to a projected-BOX one. A sphere's
  radius is the box half-diagonal: for the 83 × 44 × 37 bearing block that is 51 mm against an
  on-screen half-extent of 22 mm from the right, so the part read as a speck in its own view. Each
  principal direction sees exactly two of the box's three half-extents; the pictorial pose keeps
  the sphere, because a part turned at an angle really can throw a corner out that far.
- **Fixed**, during the build, three defects a screenshot found that no assertion would have:
  the renderer was sized to `#sim-viewport` rather than to the canvas's own grid column, so on
  Step 2 the scene rendered stretched and a **round hole projected as an ellipse**; the XY ground
  line was inside the projector group and **faded out with the projectors**, leaving a first-angle
  sheet with no datum; and six dimensions offset into the material rather than out of it, which
  looks legal and is not.
- **Added** `verify/shipped-module.mjs` — Chrome over the DevTools Protocol with Node's built-in
  WebSocket and fetch, no npm (RULES.md §2.17–§2.19). It asserts the platform contract, the
  two-step stepper, the four directions, a flat WebGL buffer count across 24 object rebuilds, and
  — the load-bearing part — the first-angle **layout** read out of the live SVG in sheet
  millimetres: elevation above the XY line, plan below it and aligned under the elevation, the
  right side view drawn left and the left side view drawn right. A sheet that gets those backwards
  teaches the wrong convention while looking perfectly plausible.
- **Note:** `src/anim.js` is byte-identical to `Module2/src/anim.js` (md5 `c5779a0c…`, RULES.md
  §7.1). The sibling's copy had drifted to CRLF and was deliberately not the file taken.

## 2026-08-06 (c) — Reworked for the beginner

- **Step 1** — the textbook's **Front arrow** now stands in front of every object, labelled, in the
  guidance accent (**ADR-130**); the object dropdown is a **2×2 grid** of buttons with no figure
  numbers; a **Dimensions & Labels** switch hides and restores the arrow, its label and the sheet's
  dimensioning stage together. Every explanation rewritten in plain English.
- **Step 2** — **blank paper**: no XY line, no HP/VP tags, no quadrant apparatus (**ADR-131**). The
  learner **chooses the side view** before construction and the sheet draws that one only. The
  transport moved to the bottom centre: `Previous / Draw next` over `Restart`.
- **Verified, not changed:** the Left/Right cameras were not swapped. The Stepped Block is the
  discriminator — from the right its two tread edges are visible, from the left the full-height wall
  conceals them — and the shipped module renders exactly that. What reads as swapped is first-angle
  PLACEMENT, which is now said in the panel title and beside each radio instead (RULES.md §3.50).
- **Fixed:** hiding the arrow's group left its CSS2D label on screen (`CSS2DRenderer` tests each
  object's own `visible`, never its ancestors'); the arrow's point landed inside the material on any
  part deeper than the arrow was long; and the shaft support's `68` and `100` shared a lane 2 mm
  apart because they are measured from different datums.

## 2026-08-06 (d) — Controls and two real bugs

- **Fixed: Left ↔ Right flew the camera through the object.** The flight lerped the two POSITIONS,
  and the two views are 180° apart, so mid-flight the eye sat exactly on the target with zero
  distance and an undefined `lookAt`. Front ↔ Top are 90° apart and their chord misses the centre,
  which is why only one pair looked broken. Flights are now a rotation about the target (swept
  direction, eased distance), with the ambiguous 180° axis CHOSEN as world up.
- **Fixed: the Dimensions switch inverted its own meaning.** As a `layout()` input it rebuilt the
  stage list, so turning dimensions ON rewound the sheet to blank paper. Now always built, toggled
  by visibility — throwable mid-construction without losing your place. ADR-131 amended.
- **Added:** a Dimensions chip at the viewport top-left, sharing one state with the card switch.
- **Changed:** dropdown object picker (no figure numbers) · `Free Orbit` · transport reordered to
  `Restart | Draw next | Previous` with the status above · Front arrow slimmed to the construction
  weight · right panel trimmed, background material behind native `<details>`, one open per step.
- **Changed:** the oracle now counts drawn dimensions against the AUTHORED count from the registry
  rather than a magic floor.

## 2026-08-06 (e) — UI parity with the Dimensioning benchmark

- **Viewport chrome** copied token-for-token from `graphics_module_1_topic_1_1_dimensioning`:
  `.vp-controls` / `.vp-chip` (34 px pill, 44 px `::before` hit target, `--space-3` padding,
  panel fill on a hairline, `--font-sans` 0.8125rem/700, the four-property `--dur-fast`
  transition, hover / press / focus / pressed states), with pressed state on **`aria-pressed`**
  instead of a local class. The Step-2 transport takes the benchmark's floating-surface language;
  the FRONT label takes its `.vp-callout` geometry.
- **FRONT arrow** reduced to textbook scale: `WEIGHT.dimension`, run 0.20 of span, head 0.032,
  chip de-bordered. It was out-drawing the part it points at.
- **Fixed** `--color-vp-line`: was `#bc5d1e`, the value DESIGN.md §2.1 records as retired. Now the
  canonical `#b25718`.
- **Token audit:** 37 shared `:root` tokens, zero differing from the benchmark.
- **One deliberate difference:** the chip sits at `--space-4`, not the benchmark's
  `calc(44px + var(--space-5))`. That clearance exists for the caption band above the benchmark's
  chips; nothing sits above these, and RULES.md §2.23 records copying it onto such a control as a
  shipped regression. Left / gap / z-index are identical.

## 2026-08-06 (f) — Quality pass against the Dimensioning benchmark

- **Fixed: Left ↔ Right went over the pole.** The previous fix's comment said "world up"; the code
  computed `up × fromDir`, which is perpendicular to it — +Z for Left, so a half turn rolled the
  camera upside down. Level-to-level flights (Front / Left / Right, and any eye-height orbit) now
  rotate about **world Y only**, by the signed `atan2` bearing change, with the 180° sign chosen to
  sweep across the FRONT. Only Top's flights use `from × to`, and those never exceed 90°.
- **Fixed: Previous restored only the drawing.** Both directions now sync the camera, so the sheet
  and the solid always describe the same stage. The drawing still never replays on the way back.
- **Fixed:** `rebuild()` blanks the sheet and blanking moves the camera, so boot parked the camera
  on Front before Step 1 opened. The stage-to-camera sync is scoped to Step 2.
- **Dimensioning completed:** 34 → **43** dimensions. Notably the shaft support's Ø12 bolt size,
  which had been drawn as two circles with centre marks and no size. Offsets go through `LANE(n)`
  so a dimension taken at a raised datum reaches the same visual lane as one at the baseline.
- **Chip band:** the Dimensions chip takes the benchmark's `calc(44px + var(--space-5))` inset, and
  the wizard toggle was aligned to the same band so the pair reads as the benchmark's does rather
  than leaving the chip alone on an empty row (RULES.md §2.23).
- **Oracle:** now audits drawn-vs-authored dimension counts per object and asserts no two values
  overlap, and walks all 13 bearing-block stages forward and back comparing both panes stage for
  stage. 102 assertions.

## 2026-08-06 (g) - Front chip, and the sizes on the solid

- **The floating chip is now `Front`.** It enters the front view, mirrors the camera's state through
  `aria-pressed`, and pressing it again returns to free orbit. The **Front arrow exists only while
  the front view is active** - hidden in Top, Left, Right and free orbit (RULES.md 3.37).
- **Added `src/dimensions3d.js`** (ADR-132): BIS Type-B dimensions on the 3-D solid, drawn from the
  SAME `objectData.dims` the sheet uses, one view's set at a time on the face that view is taken of.
  Open 3:1 chevrons, so the layer stays one `LineSegments2` and one disposal path.
- **`DIM_STYLE` moved into `objectData.js`** - the sheet and the 3-D layer draw one standard in two
  media, so its numbers live once, in the module both may import.
- **Fixed:** overall sizes were cropped at the pane edges (the camera framed the solid, not the
  dimensions); the Front label sat on the object when seen head-on.

## 2026-08-06 (h) - The two switches swap places

- **The floating chip is `Dimensions`**; **`Front arrow`** moved into the step card with the four
  direction buttons. Same components, different state behind each.
- **They are independent now.** Dimensions no longer hides the arrow, and the arrow's switch no
  longer hides the sizes.
- **The arrow rides with the MODEL**, not the camera: shown from any angle while its switch is on,
  free orbit included. Gating it to the front view put it in the one direction where it is
  degenerate. ADR-132 amended.
- **Readability:** dimension linework draws with `depthTest: false` / `renderOrder = 2` and stands
  10 mm off the face, so an arrowhead is never half-swallowed by the part it measures.
- **Arrowheads stay 3:1.** ADR-079's 15 degree heads are scoped to the topic that teaches
  termination geometry; dimensions here are incidental, so RULES.md 6.19's default applies.

## 2026-08-06 (i) - BIS SP 46 line hierarchy at the benchmark's widths

- **Fixed: every line was thin.** Measured on the shipped sheet the outline rendered at 2.23 px on
  one object and 2.13 on a wider one, against the benchmark's 2.5; hidden, centre and Type B were
  all short too. The sheet now uses `graphics_module_1_topic_1_1_dimensioning`'s numbers verbatim:
  **Type A 2.5 / Type E-F 1.5 / Type G 1.3 / Type B 1.0**.
- **`vector-effect: non-scaling-stroke`** is what makes a pixel width meaningful on a sheet measured
  in millimetres - without it the stroke scaled with the `viewBox`, which is why one drawing came
  out at two weights. Do not remove it: the widths above stop being the benchmark's the moment it
  goes. The `pathLength` draw-on was measured through it and still animates.
- **Dash patterns re-cut** for pixel space (hidden `6 3.5`, centre `16 3.5 3 3.5`).
- **Projection lines are Type B at 1.0**, like dimension and extension lines - BIS makes all three
  narrow continuous. They recede by colour and by the fade, not by a fourth width (RULES.md 3.58).
- **`WEIGHT` trimmed** to the two roles the 3-D scene draws (finished 2.5, dimension 1.0); hidden
  and centre live only in the sheet's alphabet, since the solid has no concealed edges to dash.
- **Oracle** asserts the four widths as an equality per object, in device pixels, with `vectorEffect`
  checked alongside.

## 2026-08-06 (j) - Three visual levels, and a trap removed

- **Only the silhouette is heavy now.** Each view's outer profile stays at 2.5 px; visible geometry
  inside it - steps, shoulders, bore and slot edges - drops to a new `edge` weight at 1.8 px.
  Supporting lines stay at 1.0. A deliberate departure from ISO 128 / BIS SP 46, which give
  outlines and visible edges one width: this is the textbook teaching emphasis, chosen because a
  beginner must find where the object ends before reading what is on it.
- **Carried by the data's defaults:** a bare `poly()` is a silhouette, a bare `line()` / `circle()`
  is internal geometry, and the bearing block's slot loop says `'edge'` explicitly. Both are inked
  in one press - two weights of one idea, not two stages.
- **Fixed: `vector-effect: non-scaling-stroke` was breaking the drawing.** It computes
  `stroke-dasharray` in screen space, which disables `pathLength="1"`, so every animated outline
  rendered as a 1 px dotted line. The previous pass "verified" it by watching the dashoffset
  property reach 0 - which it does, while the picture is wrong. Widths are now
  `calc(<px> * var(--ink-scale))`, with `--ink-scale` published from the sheet's live fit scale.
- **Do not replace `--ink-scale` with a fixed millimetre width:** the fit scale runs 1.95-2.30 px/mm
  across these four sheets, so one authored number lands anywhere in an 8% band.


## 2026-08-08 - One aligned system, in both media

- **The solid's values were level while the sheet's were turned.** Two conventions on one dimension
  set, which is the single thing BIS Method 1 forbids. ADR-132 had argued that a CSS2D label is
  billboarded so "the rotation is about paper"; aligned is not about paper, it is about how a value
  is written against the line it measures.
- **One placement function, `alignedDim()` in `objectData.js`.** It returns the dimension line's
  ends, the angle and the value's centre; each renderer adds its own origin and strokes it. Shared
  constants were not enough - both renderers had their own copy of the same trigonometry, and one
  copy lifted every RE-READ value to the wrong side of its own line.
- **The turn goes on `.vp-dim__text`, an inner span.** `CSS2DRenderer` rewrites the outer element's
  transform every frame. The benchmark's `.vp-value` / `.vp-value__text` pairing, for this reason.
- **Values anchor on their CENTRE** in both media, so `DIM_STYLE.textLift` is `textGap +
  textHeight / 2` = 3.2 mm. Baseline anchoring swings a turned value about a point below itself.
- **Four lane fixes:** the Shaft Support's overall length was inside its bolt pitch; two Stepped
  Block treads, a Bearing Block lug and its gap, and the Cylindrical Block's plate thickness and
  boss height are consecutive stretches of one line and now CHAIN in a single lane.
- **`rig.setFrontLabelFloor()`** - the Front label and the overall length wanted the same paper.
  `main.js` measures the dimension layer's box and drops the label below it; neither leaf can see
  the other, and composing them is the orchestrator's job.
  *(Superseded 2026-08-09: the drop is what put the name out in clear paper. See below.)*
- **The oracle was measuring with `getBBox()`**, which ignores an element's own transform - blind to
  exactly what Method 1 adds. Screen-space rects now, and a new pass that finds each value's own
  parallel dimension line and proves it sits one lift off its midpoint. 163 assertions green.

## 2026-08-09 (later) - A re-frame is a move

- **Fixed** the jump on the FIRST FRAME of every view change. The flight was never the problem: it
  already swung the eye round the target on an ease curve for 1200 ms, lerping position and target
  together every frame, and both ends of it were correct — which is why nothing that looked at the
  settled view could see the fault. Sampling the Front label's pane position on every animation
  frame across a switch showed the whole shape of it at once: 71 px on the cylindrical block's climb
  to the plan and 219 px on the bearing block's drop to the side view, in ONE frame, with the
  neighbouring frames a tenth of a pixel and the remaining 1199 ms perfectly smooth.
  Pressing a direction rebuilds the annotation layer BEFORE the flight starts (the flight has to be
  aimed at the framing it will land in), the new direction's dimension set is a different shape, so
  the content box and its centre move — and `focusOn()` re-aimed `controls.target` at the new centre
  in a single assignment while the eye stood still. The flight's first `lookAt` spent that entire
  swing in one frame.
- **Changed** `focusOn()` to EASE the target onto the new centre over 260 ms instead of setting it,
  and `flyToNamed()` to cancel that ease and take the target over. Because a tween applies `t = 0`
  on the frame it starts, a flight still reads the OLD centre — so it captures the pose the picture
  is really in and carries the target the rest of the way itself, as it always did. The instant step
  the pop was made of does not exist anywhere now. Worst frame across seven switches: 1.1–1.5× its
  neighbours, from 27–245×.
- **Recorded** the fix that does NOT work, because it is the obvious one. Translating the eye by the
  same delta to hold the eye-to-target offset — "never move one without the other" — made it
  slightly worse (84 px, 103 px). The offset is preserved, so the camera faces the same way from the
  same distance, but the eye has still MOVED, and the whole scene slides across the pane by the
  parallax of that move. Only the point at the target is unaffected, and the target is what moved.
  There is no instant target change the learner cannot see.
- **Added** a frame-by-frame continuity oracle. A jump is a SPIKE, so each frame is compared with the
  larger of its two neighbours rather than with an absolute distance: an eased flight speeds up and
  slows down, so its biggest frame is simply its fastest and its neighbours are nearly as big, while
  a teleport is one enormous frame between two still ones. Calibrated by restoring the instant
  assignment — five of the seven checks fail, at up to 245×. The two that survive are the switches
  whose dimension set does not change, which is the population that never had the bug.
- **Moved** the guided-steps panel toggle 2 mm further in from the viewport's right edge. It is
  right-anchored, so moving it LEFT is a larger `right`; the 44 px box, the vertical band it shares
  with the Dimensions chip, every style and the panel's own behaviour are untouched.
- **Kept** the 1200 ms flight. A 300 ms one was asked for; the duration is deliberate (DESIGN.md
  §5.10 — the movement between viewpoints is what teaches that the four principal views are one
  object), and shortening it would have hidden the defect rather than fixed it.

## 2026-08-09 - The mark sits on the thing it names, and a scroll is a scroll

- **The Front arrow pointed at mid-air on the Bearing Block.** It was aimed at the bounding-box
  centre, which on an L-shaped front face is the empty paper above the base and beside the arm.
  `frontFaceAnchor()` drops a column of rays down the part's mid-width, keeps the stretch that
  strikes material, and aims at the middle of the stretch nearest the box centre. It returns that
  face's OWN depth too, so a part with a boss is met at the boss and not a plate behind it. On a
  full-rectangle face it returns the box centre again - the Cylindrical Block is pixel-identical.
- **`isMesh` is not the filter for a ray test here.** `LineSegments2` extends `Mesh`, and its
  instanced geometry makes a nonsense of `intersectObjects` - the whole sim failed to boot until the
  bodies were selected by `!geometry.isInstancedBufferGeometry`.
- **The Front label rides the middle of the shaft**, one arrow-head below it, and
  `setFrontLabelFloor()` is gone from `objectRig.js` and `main.js`. Yesterday's drop cleared the
  overlap by moving the name away from its mark; halfway along the shaft, the line runs into the chip
  and out the other side and there is no lane to contest. The point stands 3% of the part off the
  face rather than 5%, close enough to read as touching.
- **Scrolling in a principal view jumped.** Not a missing `controls.target` update - the flight sets
  it throughout and lands it exactly. `noteFreeOrbit` was bound to `OrbitControls`' `start`, which
  fires for the WHEEL as well as for a drag, so one notch handed the ortho camera back to
  perspective, swapped the dimension set and re-framed the scene, discarding the learner's zoom in
  the hand-off. A drag is now 3 px of pointer movement with exactly ONE pointer down.
- **`focusOn()` retargets when idle; flights and snaps `settle()`** - one `controls.update()` with
  damping off, so a flick before pressing Front does not leak its inertia into the landing pose.
- **The zoom is measured by its FIXED POINT.** `after = s·(before - F) + F`, solved from the values'
  centroid across a scroll, must land within 8% of the pane centre in all four directions. The old
  binding fails it by up to ten pane-widths. 196 assertions green.
