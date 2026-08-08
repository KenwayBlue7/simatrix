# Changelog — Simatrix · Module 4, Topic 1: Introduction to Isometric Drawing

Notable changes to this topic. Cut from `template_starter/` (MODULE-STARTER Case A pattern);
history before the fork is not carried over.

## 2026-07-18 (sixth pass)
- Changed: **Step 6's Construction stage is now drawn, not morphed.** The old version ghosted the
  cube, faded the whole guide box in at once, then faded the cube back — technically a construction,
  but it read as a graphical transformation and a beginner could not tell which dimension was
  moving or where any edge came from. It is now a slow, staged build.
- Changed: **the guide box is twelve independently drawable segments** (plus three face outlines)
  instead of one object sharing one material, which is what makes one-line-at-a-time possible. The
  three *measured* lines (width, depth, height) are ink weight; the nine box-closing edges are light
  bench-grey.
- Changed: the sequence is now — board cleared to nothing but the axes → axes named, then dimmed to
  faint direction guides → **width** transfers from the top view and its construction line is drawn
  → pause → **depth** from the top view → pause → **height** from the front view → pause → the nine
  remaining edges close the box one after another → pause → the object drawn on top of the guides
  **one face at a time** (front, top, side) → the solid fills in behind its own outline. Roughly 21
  seconds; deliberately slow, nothing overlaps, and every beat has a caption naming the source view.
- Changed: **the orthographic views stay fully visible throughout.** They are the thing being read
  from, so hiding them defeated the demonstration. Only the non-source views mute, and only while a
  transfer is actually running; they come back up in each pause.
- Changed: the axes now arrive at full ink to be named, then drop to 26% — otherwise their weight
  hid the very construction lines being drawn along them. (Caught on a screenshot: the measured
  lines were rendering underneath the heavier axes and were effectively invisible.)
- Changed: Stage 3 fades the construction lines first and the face outlines a beat later, so the
  finished linework is the last thing standing before the 30° annotation plays.
- Note on the brief: emphasis during a transfer uses **weight and muting, not the accent colour**.
  DESIGN.md's Chrome-Only Blue keeps accent out of the viewport, and a drafting board does not
  highlight in blue. The accent still marks the source view on the drawing sheet, which is chrome.
- Verified: headless CDP — every beat fires in order with the right token, source view and caption
  (Width←top, Depth←top, Height←front), the views stay visible and un-muted outside transfers, the
  box closes, the faces build front→top→side, and the 30° annotation still measures 30.47°. All
  earlier suites pass. Zero JS exceptions.

## 2026-07-18 (fifth pass)
- Added: **Step 6 now closes by naming the isometric orientation.** Once the finished drawing stands
  clean, a drafting-style annotation plays in: a subtle dashed horizontal datum through the object's
  near-bottom corner, then a thin arc and a small `30°` callout on the left receding edge, then the
  same on the right, then the vertical edge picked out, then the sentence tying them together. Slow
  and sequential, one idea at a time (`playIsoAnnotation`).
- Added: `#iso-annotation` inside the `#vp-transfer` SVG — thin construction arcs (`pathLength="100"`
  so one dash rule works at any arc length), mono `30°` labels, neutral ink, `--color-bench-grey`
  datum. Drafting annotation, not UI decoration: no accent, no fill, no emphasis.
- Added: the annotation is **screen-space and live** — `updateIsoAnnotation()` re-derives every arc,
  label and line each frame from the projected cube corners, so the arcs sit on the real edges. If
  the learner orbits more than ~14° off the isometric sight-line the whole group **fades out**,
  because 30° is a property of that view and must not keep claiming to be true from elsewhere. The
  fade is itself part of the teaching.
- Changed: **Stage 3 now flies to a flattened isometric pose** (`POSES.isometricFlat`) — the camera
  dollies 14× further back while the field of view narrows to match, so framing is unchanged but the
  projection becomes effectively parallel. This was necessary, not cosmetic: measured under the
  normal 45° lens the two receding edges project at **36.6°**, so a `30°` label would have been
  annotating something a learner could measure as wrong. After flattening they measure **30.47°** —
  under half a degree, which at a 52px arc radius is sub-pixel. `flyCamera` now tweens `fov` with
  position and carries each pose's orbit distance clamp (`controls.maxDistance` would otherwise yank
  the far-back camera straight back in). Camera frustum widened to `near 0.5 / far 400`, a tighter
  ratio than before, so depth precision at the new distance stays clean.
- Changed: Step-6 panel copy gained an "isometric axes" section — one vertical direction, two at 30°
  to the horizontal, and the note that dimensions from the orthographic views are transferred along
  them. Still explicitly NOT taught: isometric scale, foreshortening, the 0.816 factor, construction
  rules, the box method.
- Verified: headless CDP — the sequence fires in order (datum → left arc → left label → right arc →
  right label → vertical → note), both labels read `30°`, the measured projected angle is 30.47°,
  orbiting away retires the annotation, replaying from Stage 1 and `simAPI.reset()` both clear it,
  and all earlier suites still pass. Zero JS exceptions.

## 2026-07-18 (fourth pass)
- Changed: **Step 6's construction stage now shows the dimension transfer instead of naming it.**
  Previously the axes and their Width / Height / Depth callouts simply appeared next to the views, so
  the learner still had to be *told* the sizes came from those views. Now each measurement is
  physically carried out of a view and onto an axis, one at a time.
- Added: **`#vp-transfer`, a screen-space transfer layer.** The drawing sheet is DOM and the axes are
  3D, so the bridge between them is screen space: `worldToScreen()` projects the axis midpoint,
  `sheetViewCenter()` measures the source view's rect, then a dashed leader is drawn between them
  and a small ruled token ("Width" / "Depth" / "Height") flies along it. On landing, the token hands
  over to the axis's CSS2D label. Ink-only — no accent inside the viewport (Chrome-Only Blue) —
  `pointer-events: none`, and `aria-hidden` so `#sim-status` stays the single announcement channel.
- Changed: **the source view for each size is now correct drafting practice** — width **and** depth
  are read from the **top view**, height from the **front view**. (It previously mapped width→front,
  height→side, depth→top, which was tidy but not how an engineer reads a sheet.)
- Changed: Stage 2's pacing now follows dimension-by-dimension: views recede but stay
  (`.views-sheet.is-recessed` dims the non-source views while the source stays full strength) →
  axes draw in → width transfers → depth transfers → height transfers → the guide box closes up →
  the object's own edges appear. Stage 3 then lets the views **linger beside the finished drawing**
  for ~2s before clearing, so the learner sees the result standing next to its source.
- Changed: Stage 1 now draws a dashed leader from the solid out to each view as it lights up, so the
  sheet reads as a record *of this object* rather than a diagram sitting beside it.
- Fixed: `sheetViewCenter()` measured the wrong shape. It selected the laid-out SVG with
  `offsetParent !== null`, but `offsetParent` is an `HTMLElement` property — on an `<svg>` it reads
  `undefined`, which passes an `!== null` test, so it picked the `display:none` shape set and
  measured a zero rect. Every leader therefore started from the viewport's top-left corner instead of
  the sheet. Now tested by rect width.
- Changed: Step-6 panel copy spells out where each size is read from, and closes on the honest note
  that this is the idea and not yet the method — the procedure is the next topic.
- Verified: headless CDP — leader draws in Stage 1, sheet recesses in Stage 2, each token fires in
  order with the right label and the right source view highlighted (Width←top, Depth←top,
  Height←front), all three land as axis labels, the views linger then clear in Stage 3, and
  switching stages mid-flight strands nothing. All earlier suites still pass. Zero JS exceptions.

## 2026-07-18 (third pass)
- Changed: **The lesson now deliberately teaches on TWO solids** — a **square pyramid** for Steps 1–3
  (the orthographic half) and a **cube** for Steps 4–6 (the isometric half). Each is chosen for the
  question its half is asking. The pyramid's three views are unmistakably different — front →
  triangle, top → **square with the four slant edges reading as its diagonals**, side → triangle — so
  "one view cannot identify a three-dimensional object" is something the learner discovers rather
  than is told. The cube's three principal edges lie *along* the three isometric axes, so the
  isometric position needs no explaining; a pyramid's sloping edges would fight the axes there. This
  supersedes the cylinder used for Steps 1–3 in the previous pass.
- Added: **a taught handover, not a swap.** Entering Step 4 from Step 3 cross-fades pyramid → cube
  (`setActiveSolid`, 620 ms each with a 300 ms overlap so it reads as one exchange), and the same
  beat carries the reason in the viewport note and the live region: "its edges run along the three
  isometric axes, so the isometric position is easy to see." Arriving at Step 4 any other way (rail
  jump back from 5/6) simply lands on the cube — the cross-fade is reserved for the moment it
  teaches. Collapses to instant under `prefers-reduced-motion`, state still lands.
- Changed: the views sheet now carries **two shape sets** (`.views-sheet__svg--pyramid` /
  `--cube`, switched by `.is-cube`), with per-solid hint captions, so the drawing sheet always
  describes the solid actually on screen — Step 2 shows the pyramid's views, Step 6 the cube's.
- Changed: quick-view teaching copy is now the pyramid's ("From the front, the pyramid appears as a
  triangle" / "From above… a square" / "From the side… a triangle again"), and Step 1, 2, 3 and 4
  panel copy updated. Step 1's question became "Can you *identify* the complete object?" — with a
  triangle on screen it is now a genuinely open question (pyramid? cone? wedge? flat plate?).
- Removed: the cylinder and its view-dependent silhouette generators. Both solids are polyhedra, so
  `EdgesGeometry` gives their true hard edges (12 for the cube, 8 for the pyramid) and no
  per-frame silhouette work is needed. Bodies use `flatShading` so the pyramid's four triangular
  faces stay distinct planes rather than smoothing into a cone.
- Note: the square pyramid is a 4-sided `ConeGeometry` — square base, four identical triangular
  faces, apex centred by construction — spun 45° so its base edges run square to the world axes and
  the front/side views are true triangles.
- Verified: headless CDP — sheet renders polygon/rect/polygon for the pyramid and rect/rect/rect for
  the cube, hints swap with it, each quick-view chip latches with the right pyramid copy, the Step-4
  handover fires only when crossing forward from the orthographic half, jumping back to Step 2
  restores the pyramid's sheet, and every earlier suite (six-step walk, Step-1 toggle, Step-6 three
  stages, rapid stage switching, reset) still passes. Zero JS exceptions.

## 2026-07-18 (later)
- Changed: **The teaching solid is now a vertical right circular cylinder, not a cube.** A cube's
  three orthographic views are all the same square, which quietly undermines the very reason several
  views exist. The cylinder's views genuinely differ — front → rectangle, top → **circle**, side →
  rectangle — so "the same object looks completely different depending on the direction you look
  from" is something the learner *sees*. Proportions are deliberately taller than wide (2.6 × 1.7):
  a cylinder as tall as it is wide would project a square from the front and blunt the contrast.
- Renamed: `src/cubeRig.js` → **`src/solidRig.js`** (`buildSolidRig`, `SECOND_SOLID_X`,
  `setSolidOpacity`, `rig.solid` / `rig.solidB`) — a module named `cubeRig` that builds a cylinder
  would be a lie. The construction box is now a real enclosing prism (`BoxGeometry`), which is a
  *better* Step-6 figure than before: the learner watches the box get blocked out from the views'
  sizes and the cylinder appear inside it.
- Added: **view-dependent silhouette generators.** A cylinder's outline is not a fixed set of edges —
  `EdgesGeometry` yields only the two rim circles, so the sides would read as a soft fill boundary
  rather than drafted linework. Two ink lines are built once at local ±R and parked in a holder that
  `updateSilhouettes(camera)` spins about Y each frame (`atan2(-vx, -vz)`), keeping them exactly on
  the silhouette. They share the rim material, so they fade with the rest of the solid for free.
  Cost is one rotation per solid per frame — no per-frame geometry rewrite.
- Changed: **the Front / Top / Side quick views are now part of the lesson, not viewport utilities.**
  Restored into the viewport (`#vp-cluster` / `#quick-views`) and shown during **Step 2 only**. Each
  chip flies the camera slowly to that principal direction (never a jump), lights the matching view
  on the sheet, and names what the cylinder just projected as — front "a rectangle", top "a circle,
  change the direction you look from and the projected shape changes completely", side "a rectangle
  again, but carrying its own information; only together do the three views describe the whole
  object". The latched chip is filled AND carries `aria-pressed`; clicking it again returns to the
  pictorial view, and a manual orbit drag unlatches it so the controls never fight the learner.
- Changed: the views sheet now draws the real projected shapes (rect / circle / rect) instead of
  three identical squares, with each hint naming both the direction and the shape. Step 1, 2 and 4
  copy updated for the cylinder (Step 1's "a rectangle could be a box, a cylinder, or something else
  entirely" is now a genuinely open question rather than a rhetorical one).
- Verified: headless CDP — sheet renders rect/circle/rect, chips appear in Step 2 only and are hidden
  everywhere else and after reset, each chip latches exactly one view and lights the matching sheet
  view with the right teaching note, click-again unlatches, and all earlier suites (six-step walk,
  Step-1 toggle, Step-6 three stages, rapid stage switching, reset) still pass. Zero JS exceptions.

## 2026-07-18
- Changed: **Step 1 is now a repeatable toggle.** The one-way "Reveal the top & side" button became a
  single "Show top & side" / "Hide top & side" toggle (`#act-toggle-faces`, `aria-pressed` kept in
  sync). The comparison between *front view only* and *front + top + side* is what teaches, so the
  learner can now flip back and forth as often as they like. All viewport labels gained a fade-and-lift
  enter/leave (`.vp-label.is-in`), and `setLabel()` takes an `{ animate }` option that drops the
  CSS2DObject's `visible` only after the fade-out finishes.
- Changed: **Step 4 now says why an isometric drawing is useful**, not only what it is called. The copy
  runs Isometric Position → Isometric Drawing → *represents the object in a single three-dimensional
  pictorial view, on a flat two-dimensional sheet* → *which is what makes the shape easy to visualize*.
  Still conceptual: no scale, no projection factor, no true lengths, no projection-vs-view comparison.
- Changed: **Step 6 is now an interactive demonstration instead of three labels.** The flow-strip nodes
  became real buttons that drive the viewport through three stages (`goFlowStage`):
  (1) *Orthographic views* — the same three squares re-laid out as a real drawing sheet
  (`.views-sheet.is-layout`: top above front, side beside it) next to the 3D cube, each view lighting
  up in turn; (2) *Construction* — the camera flies to the isometric position, the solid recedes to a
  ghost, the three axes are blocked out one at a time, and Width / Height / Depth callouts appear at the
  axis tips paired with the view each size is read from; (3) *Isometric drawing* — guides, callouts and
  views fade away and the finished drawing remains. Conceptual only: no construction rules, no
  measurements, no scale. Stage switches abort any sequence still in flight (`flowToken`).
- Added: `cubeRig` now exposes a faint construction box that **shares the main cube's line geometry**
  (only the material differs — no duplicated geometry), plus `setCubeOpacity()` and the axis tip
  positions used to anchor the dimension callouts. Cube body and edge materials are `transparent` so the
  finished drawing can be cross-faded.
- Verified: headless CDP against the shipped module — toggle round-trips (show/hide/show), Step-4 copy
  carries the 3D-on-2D-sheet idea and none of the out-of-scope terms, all three Step-6 stages reach the
  right scene, rapid stage-switching settles cleanly, and `simAPI.reset()` re-arms the toggle, clears the
  stage marks, and returns to Step 1. Zero JS exceptions or console errors.

## 2026-07-17
- Added: New topic **Introduction to Isometric Drawing** — the first topic of Module 4. A
  guided-discovery introduction that builds the mental model for isometric drawing before any later
  topic teaches it. Six steps: (1) Why another drawing method, (2) Orthographic projection,
  (3) Visualizing objects, (4) Isometric drawing (the isometric position + three axes),
  (5) Two types (Isometric Projection / Isometric View — named, not compared), (6) Connecting
  orthographic and isometric.
- Added: `src/cubeRig.js` — one hard-edged cube (phong body + fattened `LineSegments2` ink edges,
  `polygonOffset`), a second cube for the Step-5 split, and the three isometric axes (fade-in
  one-by-one). `src/isoSteps.js` — the six-step copy. Rewrote `src/stepper.js` to drive the scene
  via `sim.enterStep(n)`, and `main.js` into a cube-rig orchestrator with cinematic eased camera
  flights (never a teleport), a CSS2D label overlay, the SVG orthographic "views sheet" (highlights
  the view the learner orbits toward), and the Step-6 flow strip.
- Removed: the Compare-view / workbench scaffolding, the Problem Library, `problems.js`, and
  `uiManager.js` — this conceptual topic has no parameter dock, projections, fold, or exercises.
- Verified: teaches no isometric scale, no construction method, no angles — scope held to building
  the mental model (task brief).
