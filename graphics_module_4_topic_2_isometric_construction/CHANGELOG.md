# Changelog — Simatrix · Module 4, Topic 2: Isometric Construction

Notable changes to this topic. Built as a new standalone topic on the Module-2 orchestrator pattern
(ADR-033), following the shell and interaction language of
`graphics_module_4_topic_1_introduction_to_isometric_drawing`; history before that fork is not
carried over.

## 2026-08-12 — Problem Library, migrated from Topic 3

The topic can now be pointed at a **textbook problem**: eighteen examination problems, with their
statements as printed, their stated sizes, their sources and their hints. Selecting one is an INPUT
to Step 1, exactly as choosing a solid or building a combination is.

`graphics_module_4_topic_3_isometric_projection_problem_library` was the reference implementation.
Nothing was copied wholesale, **nothing in that topic was modified**, and this topic imports nothing
from it at runtime — it remains independently runnable.

**The six-step workflow is unchanged.** No step was added, none removed, none reordered; Step 4 still
has exactly its four phases; Step 6 still replays the whole process and still checks nothing.

### The data (`src/problemLibrary.js`, new)
- The eighteen problems and the four categories. `question` is the textbook's own sentence, character
  for character; `title`, `category`, `source`, `difficulty`, `learningObjective`, `projectionType`,
  `hints`, `tags` and `answerData` are carried across unchanged.
- **One field could not be carried: the solid itself.** Topic 3 describes a solid as a list of PARTS
  whose parameters are keys into the problem's own dimension map, most of them DERIVED one way
  (`r: 'circum'`, `circum = circumradius(side, 6)`). This topic describes whole named SOLIDS that
  take the learner's dimension directly (`side`). A derived value cannot be inverted generically, so
  translating at runtime would have meant re-implementing every part kind inside this topic — a
  second geometry vocabulary and a second composer. The translation was therefore done **once,
  offline**, and the result is what is written in the file: `parts: [{ solidId, dims }]`, bottom
  first. Every problem's overall size was checked against Topic 3's own `answerData.bounds`
  afterwards, and all eighteen agree.
- Adding a problem is still appending ONE object. No file in this topic contains `if (problem.id === …)`.

### The join (`src/problemBuilder.js`, new — fifty lines)
- One part resolves to a solid from `SOLIDS`; two or more resolve through **the existing
  `combinationBuilder.js`**, with its existing `p{i}_` key namespacing, its per-component bounding
  boxes, its bottom-up stages and its per-component sphere rule. A problem is not a third kind of
  subject and there is no second composer.
- `state.mode` gained a third value, `'problem'`, beside `'single'` and `'combination'`;
  `currentSolid()` gained one branch. Everything below that line — `rebuild()`, `shapeFactory`,
  `constructionEngine`, `dimensionLayer`, `orthographicDrawer`, `cameraRig`, the stepper, the six
  steps, the four phases — is untouched and never learns a problem was loaded.
- A problem's stated sizes REPLACE the dimension set when it loads. Those sizes are the given data,
  and reading them is the second step of the solve — not the sim filling an answer in (§6.2).
- `projectionType` decides which of the two forms Step 5 **opens** in. The toggle stays live, because
  comparing the two is that step's lesson.

### The LIVE self-check (`src/answerValidator.js`, `src/problemCheck.js`, both new)
While a problem is loaded, the problem card carries a status line that updates **as the learner
dials** — no button, no polling, no per-frame work.

- **The validator is Topic 3's, logic byte-identical.** The only edit is its import line: Topic 3
  keeps `CHECK_TOLERANCE_MM` / `round1` / `humanList` in a `helpers.js`, and this topic keeps its
  stateless shared util in `shapeData.js`, which gained those three. Stripping comments and imports,
  the two files are the same text — verified mechanically. There is no second validator and no
  Topic-2 fork of the rules a drawing is judged by.
- **`problemCheck.js` is the adapter**: it derives the `ComposedModel`-shaped object and the
  `ProjectionPlan` the validator reads from Topic 2's own subject, resolved dimensions and form. It
  stores nothing — there is ONE copy of the learner's numbers and it is `state.dims`. A single solid
  is the one-part case; a combination's components are keyed `p0`, `p1` …, the namespace
  `combinationBuilder.js` already builds its fields in, so a problem's `answerData.parts` and the
  model agree by construction rather than by a lookup table.
- **What triggers it**: a dimension edit, a subject change, the Step-5 form, reaching a phase, and
  drawing a construction stage. Each is an existing state change; the check is a pure computation
  hung off it. Nothing rebuilds geometry to validate, and there is no interval anywhere.
- **The wording is the platform's** (`Module2/src/problemLibrary.js`): `Still to match: …` while
  something disagrees with the question, and `✓ Your construction matches the problem.` when nothing
  does — the `.match-status` component, success carrying both the green wash and the check glyph.
  The failing line names what to look at as specifically as the finding allows: the sizes checker
  knows which of the three edges is out, so the line says which.
- **`pending` is not `fail`** — the validator's own rule, kept. A freshly loaded problem reads
  "Keep going — some of the drawing is still to come.", never an error, and nothing is red anywhere.
- **`requiredStages` are narrowed** to the stages the subject can actually draw. The migrated ids are
  Topic 3's vocabulary and a few differ (a cylinder's third stage is `generators` there and `axis`
  here); judging a drawing against a stage it has no way to produce would be an unfixable miss.
- **Step 6 is untouched** — still the replay, still no verdict panel (ADR-055 amendment 2 survives),
  and **Next is never gated**, which is Topic 3's behaviour too.

### The four solids the library needed (`src/shapeData.js`)
Four problems name solids this topic did not have. Each is one more object in the registry, the
ADR-043 path taken as written — and they join Step 1's picker and the combination builder like any
other entry, because a learner who meets a hexagonal pyramid inside a problem must be able to
practise one. The picker goes from 11 solids to 15.
- **Pentagonal Pyramid** · **Hexagonal Pyramid** — data only.
- **Frustum of Square Pyramid** · **Frustum of Hexagonal Pyramid** — data, plus two single additive
  cases: the `pyramid` geometry kind accepts an optional `rTop` (a lathe between two polygons instead
  of a cone, `shapeFactory.js`), and the construction primitive vocabulary gained `edges`, which
  joins corner *i* of one outline to corner *i* of another (`constructionEngine.js`). `verticals`
  cannot draw those lines because they slope and `spokes` cannot because there is no single apex.
- The `cylinder` height range now reaches 120 mm, because a problem states a 120 mm axis and a field
  that cannot hold the size the question states cannot pose the question.

### The UI is Topic 3's, adopted whole (`index.html`, `src/uiManager.js`)
**Step 1's controls are untouched.** They still read **Single Solid · Combination of Solids**, with
the same labels and the same two columns. The library is reached the way Topic 3 reaches it:

- **`📖 Practice Problems`** — the platform `.library-entry`, in the card's eyebrow row, with the
  same open-book glyph at 18px and the same 44px target. That row was already a space-between flex
  with one child; this is the occupant it was waiting for.
- **The browser** is the platform `.problem-library` overlay: fixed header, one scrolling body, a
  centred 920px column, `libraryIn` motion, focus moved in on open and returned to the entry on
  close, Escape to dismiss, and a focus trap while it is open. Problems are `.problem-card` buttons
  grouped by category — title · question · difficulty, nothing else. It is a SELECTOR, not a second
  application: opening it pauses the rAF loop because it covers the live viewport, and nothing else
  changes.
- **The loaded problem** sits in a paper card above the stepper (`#active-problem`), with the
  statement verbatim, **Need a hint?** revealing one hint at a time, **Hide Text**, and **Exit
  Problem** behind the same two-state confirm the Reset control uses.
- While a problem is loaded, Step 1's controls are **locked rather than replaced** — exactly as
  Topic 3 locks its picker. A single-solid problem reads through the solid picker, a combination
  problem through the combination builder, both disabled. Leaving the problem unlocks them.
- Two problems state "(i) vertical and (ii) horizontal". This topic has no orientation concept
  anywhere, so it draws case (i) and **says so on the problem card** rather than hiding it. Adding
  orientation would touch `shapeFactory`, `constructionEngine` and `orthographicDrawer`, so it was
  not done silently.

### One defect found and fixed while verifying
A locked control can still be driven programmatically — `dispatchEvent` on a disabled `<select>`
fires its handler. `setSolid` then replaced the dimension set while the subject was still the
problem's, and the geometry was built from keys that no longer existed: `THREE.LineSegmentsGeometry
… Computed radius is NaN`. The four free-practice controllers (`setSolid`, `setMode`, `setComboPart`,
`addComboPart`, `removeComboPart`) now return early while a problem is loaded, so a subject change
can never be half-applied. Covered by its own assertion.

### Verified
Node oracle over the live check: **409 assertions** — every problem reads as guidance when freshly
loaded, matches once the work is done at the stated sizes, is caught when a size actually moves an
edge (asserted against what the drawing does, not against a guess), tolerates a change inside
±0.5 mm, catches the wrong form, catches out-of-order phases, treats partial work as pending, and
models its parts as the topic draws them. Live browser: **40 assertions** reproducing the video —
the line appears with the problem, a slider drag updates it with no Next press, fixing one
requirement removes it from the list while the other stays, the four phases land the green state,
breaking a size drops straight back out, the form is checked, Next is never blocked, and a
combination problem behaves identically.

Node oracle over the library: **765 assertions**, including every problem's parts, field ranges,
subject contract, overall size against Topic 3's answer, face-to-face seating and per-component
boxes — plus all **225 pairings** of the now-15 solids composing. Live browser: **91 assertions** —
Step 1 still offers exactly two modes with their labels intact, the entry is the platform component
in the platform place, the overlay traps focus and closes on Escape, all eighteen problems load and
build, a single-solid problem and a combination problem each walk all six steps and all four phases,
the form follows the question, forcing a locked control changes nothing, and 42 subject changes
leave the CSS2D label DOM flat (3 → 3). Reduced motion: **12 assertions**, everything instant and
everything landing. The pre-existing suites still pass unchanged — **627** oracle assertions,
**87** browser assertions and **11** reduced-motion assertions, with one count updated (11 solids →
15). Zero console errors, zero uncaught exceptions, zero failed requests.

### Known limitations
- Two problems draw case (i) only, as above.
- Where a question states a *radius*, the field is this topic's own *diameter* (`R 18` → `ØD 36`).
  The statement is unchanged; only the control differs.
- Loading a problem replaces the dimension set, so a combination the learner had built by hand does
  not keep its numbers across a problem load — both use the same `p{i}_` namespace.

## 2026-08-11 — Combination of solids (§16.8)

Added on a lecturer requirement: the learner can now construct the isometric drawing of a
**combination of solids**, not only of one solid. The textbook section this implements states the
whole of what is new about them — *"Drawing procedure for the isometric projection of a combination
of two or more solids is similar to that of individual solids. The point to be specially considered
is the relative position of them in the isometric view"* (§16.8) — so this is an extension of the
existing subject, not a second kind of subject.

**The six-step workflow is unchanged.** No step was added, none was removed, none was reordered, and
Step 4 still has exactly its four phases. The choice between one solid and a combination is made in
Step 1, where the solid is already chosen.

### The data model: a combination composes to ONE solid (`src/combinationBuilder.js`, new)
- A combination is an ordered list of solid ids, **bottom first**. `buildCombination(parts)` folds
  them into a synthetic solid that satisfies the SAME contract `shapeData.js` documents —
  `dims` · `axisSymbols` · `bounds(d)` · `body(d)` · `views(d)` · `construction(d)` · `extraDims(d)`
  · `trueDiameterInProjection` · `formNote`.
- Because the contract is identical, every consumer is untouched by the existence of combinations.
  `shapeFactory`, `constructionEngine`, `dimensionLayer`, `orthographicDrawer`, `uiManager` and
  `rebuild()` all keep interpreting *one solid* and none of them learns which kind it is. There is no
  second pipeline and no `if (combination === …)` anywhere.
- **The seating convention does all the placement work.** Every solid in `shapeData` is already
  authored resting on its own `y = 0` and centred in plan, so placing a component is setting one
  number — the running height of the stack. Components therefore meet FACE TO FACE, which is the only
  relationship the textbook's examples pose ("surmounted over", "placed centrally over").
- **Dimension keys are namespaced per component** (`p0_side`, `p1_diameter`), so two cones in one
  object do not collide, an `optional` field keeps its own `auto()` bound to its own numbers, and
  switching between single and combination mode preserves both sets of values.
- Practical cap of **four components** (`MAX_PARTS`). The model has no limit — the layout is a running
  sum and every consumer iterates — but §16.8 poses two-solid combinations throughout and a deeper
  stack stops fitting the framing radius the camera rig derives.

### Step 1 gains a mode, and a builder (`index.html`, `src/uiManager.js`)
- A platform `.segmented` control — **Single Solid / Combination of Solids** — used exactly as Step
  5's form toggle uses it. Choosing *Single Solid* leaves the existing dock and behaviour untouched.
- The builder lists the components bottom first with a tier word (Base / Then / On top), a
  `.field__select` per row, and a ghost **Remove** on everything above the base. **+ Add solid**
  seats one more. No new UI pattern and no new token: every control is an existing platform
  component, and the only CSS added is row layout built from existing tokens.

### Per-component boxes in Phase B (`src/constructionEngine.js`, `main.js`)
- `construction.box` became `construction.boxes` — **one growable bounding box per component**, each
  standing on the finished top face of the one below, arriving bottom-up. A single box round a whole
  assembly would hide the step Phase B teaches: a cone's base ellipse is inscribed in the top face of
  the SLAB's box, not judged by eye inside one larger box round both.
- A solid declares `partBoxes(dims)` only when it has more than one component; anything else falls
  back to one box from its own bounds, with identical geometry and identical timing to before.

### The assembly body kind (`src/shapeFactory.js`)
- `buildShape` gained one case in its geometry-kind switch — `assembly` — and now normalises every
  spec into a list of components, so a plain solid is simply the one-component case and there is one
  code path.
- Each component is a **two-group rig**: a *placement* group carrying its seating height, and a
  *body* group carrying its own uniform scale. That split is what keeps **the sphere rule** true
  inside a combination: a sphere is drawn at its TRUE diameter while the height of its centre is
  still reduced. The file never learns which solids those are — it applies the two numbers it is
  handed.
- New: `setFormScale(axial)`, `formScale()` and `drawnTop()`. `drawnTop()` replaced the figure-title
  maths `main.js` used to do by hand, and made the title correct for a stack for free.

### Elsewhere
- `src/shapeData.js` — **one solid appended**: a hexagonal prism, whose height range reaches down to
  slab thickness. §16.8's Example 16.15 stands its combination on a hexagonal slab, and a slab is a
  prism drawn short. It uses the existing `prism` geometry kind; no engine change.
- `src/orthographicDrawer.js` — `renderPrimitive` now honours an optional per-primitive `cx`/`cy`
  offset, which is how a composed view places each component's outline at the height it sits at. A
  single solid declares neither and lands on the view centre exactly as before.
- `main.js` — `state.mode` and `state.combo` are the only new state, and both are *source
  configuration*: the composed subject is derived through `currentSolid()` and never stored. Step 5's
  comparison table now takes its scale **per row**, so a sphere on a reduced slab reads as the two
  facts it is.

### Verified
- **Node oracle, 566 assertions** over the pure data layer: every existing solid unchanged; the
  textbook figures exact (Example 16.13 → 40 × 40 × 65, Example 16.15 → 48 × 41.6 × 61); components
  seated face to face with no gap and no overlap; every construction primitive re-seated by its
  component's height with its footprint untouched; optional dimensions surviving namespacing.
- **Headless Chrome, 84 assertions**: all 11 solids load; the six steps walk and still lock; the four
  phases run; both forms; reset; the builder adds, changes, removes and caps; Phase C constructs
  bottom-up naming each component; the sphere rule holds inside a combination; the Step-6 replay runs
  to its close; the CSS2D label DOM stays flat across 50 rebuilds. Zero console errors, zero uncaught
  exceptions, zero failed requests.

### Known limitation
A hemisphere seated **flat face up** (Example 16.14 and Exercise 16) is not offered. The `hemisphere`
solid is authored resting on its flat face, and inverting it would need a new orientation in the
data model plus flipped views and construction stages — a real capability, not a data edit. It was
left out rather than added silently.

## 2026-07-20
- Changed: **The overall sizes are now real dimensions, not labels** (`src/dimensionLayer.js`).
  Extension lines with a gap off the point and an overshoot past the line, a continuous narrow
  dimension line, FILLED 3:1 arrowheads, and the value centred just off the line — the BIS SP 46
  Type-B treatment the platform already uses on Module 2's sheet (ADR-041). A label beside an edge
  never said WHICH span it measured; the extension lines are what turn a caption into a
  measurement. Drawn in the construction register (bench grey, `WEIGHT.dimension` — the thinnest
  weight in the scene) rather than at ink weight, so the object stays the subject: same standard,
  quieter voice (ADR-049). Arrowheads are their own triangle soup, because a filled polygon cannot
  live in a `LineSegments2`.
- Changed: **A repeated size is stated once.** A cylinder's box is square in plan, so its width and
  its depth are the same diameter — and a drawing states a diameter once, not twice on facing
  edges. The second edge is aliased to the first, so Phase B still transfers all three overall
  sizes and simply lands two of them on the same annotation, which IS the point that the width and
  the depth are one diameter. Per solid: `a` · `L B H` · `ØD H` · `ØD Ød H` · `ØD` · `ØD R`.
- Added: **The frustum's top diameter is dimensioned** — `Ød`, taken up clear of the top circle. It
  is the one size the enclosing box cannot carry, so it is declared as `extraDims` data on the
  solid; the dimension builder never learns which solid it is drawing.
- Fixed: **The height dimension was on the near corner, where it could not be separated.** That
  corner is the closest point of the solid, so every horizontal push slid the dimension ALONG the
  silhouette instead of away from it and it landed on the face. It now measures the left silhouette
  edge — the outermost vertical from both the three-quarter and the isometric viewpoint — and clears
  the drawing in either (ADR-050).
- Changed: **Figure titles are placed by measurement, not by formula.** "Cuboid", "Isometric
  Projection" and the rest now sit clear of the whole drawing, re-derived every frame: the real high
  points are projected against the live camera (top corners for a rectangular top, four points
  around a round one, plus any dimension drawn above the solid), the highest is taken, and one
  SCREEN-space clearance is added. Three modelling attempts failed first — a fixed lift landed on
  wide solids; deriving it from the enclosing box gave a sphere a cube's clearance when its highest
  point is the pole directly over its centre; resolving offsets against the camera's up axis is only
  right for a parallel projection, so perspective left boxes half a clearance too high. Measured gap
  across seven solids: 96–148 px, then 27–117 px, then **22–44 px**. The clearance is in screen
  space because the gap that reads as correct is a gap on the page (ADR-050).
- Added: **The sphere special case in Step 5.** For a sphere or a hemisphere an information card
  now explains that the solid is represented using its TRUE diameter, and that working from an
  isometric projection the projected diameter is multiplied by about 1.22 to obtain the circle. It
  never says "true length × 1.22" — a sphere has no linear edge to multiply. Hidden for every other
  solid, and carried as `formNote` DATA on the solid so Step 5 holds no list of special cases.
- Fixed: **and the drawing now agrees with that note.** The Projection toggle used to shrink a
  sphere to 0.816 while the note beside it said the opposite. The isometric scale reduces lengths
  measured along the axes and a sphere has none, so a sphere and a hemisphere declare
  `trueDiameterInProjection` and keep true size in both forms; the table header stays 1:1 and the
  announcement names the exception instead of quoting 0.816. The toggle doing nothing is the lesson
  (ADR-051).
- Verified (headless CDP, **25/25**): titles inside the viewport, horizontally centred, never
  overlapping the geometry (measured by decoding the screenshot and finding the topmost rendered
  pixel, not by proxy) and never overlapping a dimension; the right symbol set on all seven solids
  checked; no two dimension labels overlapping on any solid; the note shown for sphere and
  hemisphere only, worded correctly and never mentioning "true length"; the sphere unreduced in
  projection while the cuboid still reduces; reset restoring defaults; zero console errors. The
  earlier suites still pass — **55/55** enhancement (with GL buffer/texture/program counts now
  compared between two runs of the SAME state, so the delta is leak and nothing else: 35 → 35 across
  a ten-solid sweep, 50 slider ticks and 12 optional-dimension flips) and **7/7** reduced motion.

## 2026-07-19
- Added: **An optional top diameter for the frustum.** Many examination problems give only the base
  diameter and the height and expect the top diameter to be recovered from the question's own
  conditions first, so the sim can now hold "this size is not stated" as a real state. A
  `Specify Top diameter` checkbox (default ON) sits in the field; unchecking it removes the slider,
  shows `Auto / Unknown` plus the value the demonstration is drawn at, and prints the note about
  examination problems. The construction sequence is unchanged and nothing is solved for the
  learner. Built as DATA (`optional` · `auto(d)` · `autoNote` on the FIELD, resolved by
  `resolveDims()` at the boundary), so no file contains a frustum branch — ADR-045, RULES §3.35.
- Added: **The two 30° arcs in Phase A** (`src/isoAngles.js`). The copy called them "30° axes" and
  the drawing never showed it; now a dashed horizontal datum runs through the origin corner, a thin
  arc swings from it onto each receding axis, and the value is written on the bisector. They animate
  in after the axes are standing, are fixed-pixel (readable at any zoom), and are honest by
  COMPOSITION: main.js aims the camera at the construction origin, putting that corner on the
  principal axis where a perspective projection preserves angles. Measured headless at **30.00°** on
  both sides, and still 30° after a hard zoom. Orbit away and they fade out — 30° is a property of
  the isometric direction, not of the object — full within 2.5° of the sight-line, gone by 12°.
  ADR-047, RULES §3.37/§3.38.
- Changed: **Step 5 is now a toggle, not a split screen.** One solid and a segmented
  `[Isometric Projection] [Isometric View]` pair; switching tweens the SAME geometry between 1 and
  0.816 while the title, the active card, the table header and the drawn column follow. Two objects
  side by side quietly taught the misconception the step exists to remove — that the two forms are
  two different drawings. The second `buildShape()` rig (`compareShape`) is gone with it. The table
  keeps both a true-size and a drawn column so the 0.816 stays checkable. ADR-048, RULES §4.21.
- Changed: **Engineering dimension letters everywhere.** Every field carries a `symbol` and every
  solid an `axisSymbols` for its three box edges — `a` (cube) · `L B H` (cuboid, and the pentagonal
  prism's across-corners box) · `ØD H` (cylinder, cone) · `ØD Ød H` (frustum) · `ØD` (sphere) ·
  `ØD`/`R` (hemisphere, whose box is one radius tall) · `a H` (prisms and the pyramid). The dock
  labels, the overall-size readout, the comparison table, the transfer tokens and the viewport
  callouts all read from that data, so the callouts now say `L 70 mm`, not `Width 70 mm`. Held as
  data rather than derived, because a derivation gets the pentagon and the hemisphere wrong.
  ADR-046, RULES §3.36.
- Changed: **Phase B transfers each size instead of announcing it** (`src/transferLayer.js`). A
  dashed leader is drawn from the source view to the box edge, a ruled token carrying the symbol
  flies along it, and the CSS2D callout takes over on landing — one dimension at a time, the source
  view lit as each one leaves. Screen space, because one end is DOM and the other is 3D. Falls back
  to the callout simply appearing when the sheet is not laid out, so a missing anchor can never
  launch a token from the viewport corner.
- Fixed: `simAPI.reset()` left the last viewport flow note standing, describing a scene that had
  just been wiped. Reset now pulls it down along with the arcs and any transfer in flight.
- Verified (ADR-019, headless CDP against the shipped module): **55/55** — clean boot,
  `<title>`/`meta.json.title` match, `simAPI` exactly pause/reset/resume, symbols correct for five
  solids, the optional dimension on/off/on with the solid still rendering, the arcs shown only in
  Phase A and measuring 30.00° (and after a zoom), fading on orbit and returning, the transfer
  carrying L/B/H from front/top/side and landing as callouts with nothing stranded, rapid phase
  thrashing settling, the toggle in both directions with the table at 1:1 and ×0.816, reset
  restoring solid, symbols, form and flow note, GL buffer/texture/program counts flat across a
  ten-solid sweep plus 50 slider ticks and 12 optional-dimension flips, CSS2D label DOM bounded, and
  zero console errors or uncaught exceptions. A separate reduced-motion pass (**7/7**) confirms
  every one of these states still LANDS with the motion suppressed.

## 2026-07-18
- Added: New topic **Isometric Construction** — the second topic of Module 4, and the direct
  continuation of Topic 1. Topic 1 answered *"what is an isometric drawing?"*; this one answers
  *"how is one constructed?"*, as a **process** rather than a recipe. Six steps: (1) choose a solid,
  (2) set its dimensions, (3) read its orthographic views, (4) construct it in four phases,
  (5) Isometric Projection vs Isometric View, (6) the whole process replayed end to end.
- Added: **Ten selectable solids** — cube, cuboid, cylinder, cone, square pyramid, square prism,
  pentagonal prism, frustum of a cone, sphere, hemisphere. Each declares its own dimension fields,
  so choosing a cylinder produces Diameter + Height and choosing a cuboid produces Length + Breadth
  + Height with no per-solid UI code (ADR-043).
- Added: **`src/shapeData.js` — the data model that is the architecture** (ADR-043). A solid
  declares five things (dimension fields · `bounds()` · a geometry `body()` SPEC · `views()` ·
  ordered `construction()` stages) and every consumer is a generic interpreter owning exactly ONE
  switch, over a bounded PRIMITIVE-KIND vocabulary — never over solid names. Adding a solid is
  appending one object; the ten shipped solids resolve to six geometry kinds. Recorded as RULES.md
  §3.33.
- Added: **`src/constructionEngine.js`** — the three isometric axes, the enclosing bounding box, the
  per-solid construction stages, and the three face highlights, all derived from the data. Axis and
  box geometry is written RELATIVE to the shared origin corner and parented to a group positioned
  there, so scaling that group 0 → 1 **draws the lines out of the corner** — the motion a hand makes
  — with no per-frame geometry rewrite.
- Added: **`src/orthographicDrawer.js`** — a real first-angle drawing sheet in SVG: front view above
  the XY line, top view below it, side view beside the front, with the projection lines that tie
  them together, the X/Y end marks and the HP/VP plane tags. Every view is a focusable,
  ARIA-labelled `role="button"` group; selecting one turns the camera to look along that direction
  and lights the matching face on the 3D solid. SVG rather than a scissored WebGL pass, because this
  sheet is schematic but heavily interactive — recorded as ADR-044 / RULES.md §3.34.
- Added: **Step 4's four construction phases** (`PHASES`, `goPhase`), advanced by sub-buttons in a
  reused Topic-1 `.flow-strip`: **A** the axes drawn out of one corner · **B** the bounding box
  grown along them, with each overall size lighting up on the orthographic view it is read FROM at
  the instant it appears on the axis it is measured ALONG (width ← front, depth ← top, height ←
  side) · **C** the shape constructed inside the box, stage by stage from the solid's own data ·
  **D** the construction fading back as the visible edges darken in. Phases are cumulative and
  re-selectable; the solid is hidden through A–C so the learner watches the construction PRODUCE the
  drawing rather than tracing over an answer already on screen.
- Added: **Step 5 — Projection vs View.** The same solid is built twice from the same body spec, one
  at the isometric scale (≈ 0.816) and one at true size, side by side and labelled. Two platform
  cards state the rule and a live table shows this solid's real numbers in both forms, so 0.816 is a
  value the learner can check rather than a fact they are told. The copy's whole point is that the
  construction sequence is identical — only the measured numbers change.
- Added: **Step 6 — the replay.** Orthographic views → axes → bounding box → construction → finished
  isometric, driven by the shared layer controllers so the summary shows the learner the *same*
  construction they just performed rather than a second, subtly different animation of it. Any link
  in the chain can be selected to replay from there; earlier links are applied instantly so the
  state stays honest. Closes on "You are now ready to solve isometric drawing problems."
- Added: `src/summaryAnimator.js` — the abortable, token-guarded timeline behind both Step 4 and
  Step 6 (Topic 1's `flowToken` pattern), so a phase change or a step jump can never be overtaken by
  a stale beat resurrecting a scene that has moved on. Under reduced motion every beat still RUNS,
  it simply arrives at once.
- Added: `src/cameraRig.js` (named viewing directions + a per-rebuild framing radius; every move an
  eased flight, never a teleport), `src/labelLayer.js` (the CSS2D factory AND the single documented
  placement policy, RULES §3.27a), `src/uiManager.js` (the parameter dock, built from the data),
  `src/tokens.js` (the stateless token → role → colour util, RULES §3.6a), `src/constructionSteps.js`
  (step + phase copy), `src/shapeFactory.js` (body spec → mesh, with view-dependent silhouette
  generators for the curved solids and a camera-facing outline ring for the sphere and hemisphere).
- Scope: teaches the construction METHOD only. No hidden-line conventions, no sectioning, no
  auxiliary views, no inclination/intersection/rotation problems, no dimensioning rules, no
  measurement exercises, no textbook problems.
- Design: adds **no** token and invents **no** UI pattern — the wizard, rail, step card, sliders,
  select, hint callout, term popover and flow strip are all the platform components, and the flow
  strip is Topic 1's, reused for both the phase transport and the summary chain.
- Verified: headless CDP against the shipped module (ADR-019, RULES §2.17–§2.19) — 39/39 checks.
  Clean boot; `<title>` matches `meta.json.title`; `simAPI` is exactly `pause, reset, resume`; all
  ten solids build; the six steps walk; the sheet renders three views + the XY line + four projection
  lines and a view selection highlights it; all four phases run and mark; rapid phase switching
  settles; Step 5's projection values are 0.816 × the view values; the Step-6 replay reaches the
  finished link and the closing line; Reset arms the two-state confirm and returns to the initial
  state; zero console errors and zero uncaught exceptions. Separately GL-instrumented: buffer,
  texture and program counts are **flat** across 50 rapid dimension rebuilds and across two full
  ten-solid sweeps, and the CSS2D label DOM stays bounded (RULES §3.4, §3.5).
- Fixed during build (both caught by the headless run, before ship): `constructionEngine`'s resize
  handler walked every owned material's `.resolution`, including the face-highlight
  `MeshBasicMaterial`s that have no such property — the dispose list and the resolution list are now
  separate. The isometric camera framing was also too tight for Steps 4 and 6, cropping the box and
  the axis overshoot; the isometric pose is now framed deliberately loosest of the five.
