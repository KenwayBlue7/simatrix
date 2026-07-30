# Changelog — Conic Sections (Module 3, Topic 2.2)

Notable changes to this topic. (The sibling topic's history was intentionally not carried over —
this changelog starts fresh at the build, per MODULE-STARTER §3.2.)

## 2026-07-30 — Sequenced as a lesson (ADR-086)

- Changed: the six steps are now a story — meet the cone · cut it · six cuts, six curves · why they
  differ · drawing it on paper · your turn — and every control moved to the step whose question it
  answers or was removed. Steps 1-4 now carry at most three controls each, and Step 2 carries exactly one.
- Changed: the section plane is switched on by Step 2 itself, so its on/off toggle is gone; stepping
  back to Step 1 takes the plane away again. The "slide it past the tip" field first appears in
  Step 3, where the apex cut needs it.
- Changed: Step 2 reports the cut in plain words with NO name ("a closed oval — longer one way than
  the other, but it still closes up"). `ConicSection` entries now carry `seen` / `name` / `rule`, and
  the name and the textbook statement arrive in Step 3.
- Added: Step 3's six "show me" chips. Each travels the plane to that cut on THIS cone (presets
  derived from the live generator angle) and states the rule — the explanation phase, after the
  learner has swept the tilt by hand in Step 2.
- Added: the 3D → 2D bridge. Entering Step 4 swings the camera round to look at the cut square-on
  and then opens the sheet beside it, so the slice and the drawn curve are visibly the same thing.
- Added: Step 5's "draw it step by step" — the eccentricity construction plays through its six
  stages (`BUILD_STAGES`, gated in the engine by `conicState.buildStage`), narrating each. The sheet
  frame is pinned to the finished construction so the drawing does not swim between stages.
- Added: Step 6's predict-and-verify drill — the sim deals a cut the learner did not choose, keeps
  its name back until they commit, and marks the answer against the same `classifySection()` the
  lesson taught with, keeping a running score.
- Removed: the curve select (derived from the ratio), the focus-to-directrix slider (fixed at the
  chapter's own 50 mm), and the section on/off toggle.
- Changed: every panel's copy rewritten in plain English — one idea, a "try this", and the formal
  wording kept for the hint block or the term popover.
- Changed: sheet labels are suppressed below ~1.3 px per millimetre; at compact card size a 12 px
  caption is nine millimetres of drawing, so the annotation was becoming the figure.
- Fixed: the teaching prose was lifted out of the two `[data-ctrl]` wrappers that dock into the
  workbench rail — prose inside a docked wrapper is height taken from the 3D pane (RULES.md
  §5.16a). Rail 317 px against the reference topic's 324.

## 2026-07-29 — UI parity pass against the Module-3 reference topics

- Fixed: opening the drawing sheet exploded the layout. `WORKBENCH_CONTROLS` docked all six step
  groups into `#workbench-rail`, which is a single wrapping row on the split grid's `auto` row —
  the rail grew to **1340 px** and starved the viewport's `minmax(0, 1fr)` row to **2 px**, taking
  the renderer (canvas 0 px high), the drawing sheet stage and the rail toggle (pushed to y = −44)
  down with it, and pushing the page to 1372 px of scroll. Now docks the two value drivers
  (`['cone', 'section']`), mirroring the sibling topic's `['shape', 'section']`. Measured against
  that topic afterwards: identical wizard / viewport / card / rail boxes, identical canvas sizing,
  no overflow and no overlap at 1440×900, 1280×720 and the 700 px mobile stack.
  Recorded as RULES.md §5.16a.
- Fixed: the `.vp-hint` rule (the orbit chip and the contextual spotlight) had been swallowed
  whole when this topic's `index.html` was derived from the sibling's — a lazy regex ate past the
  block it was meant to remove. Both chips were rendering as full-width `position: static` blocks
  in the viewport's flow, shifted 490 px off-screen by their own centring transform and pushing
  the WebGL canvas 51 px down the page. Restored verbatim from the reference. A full stylesheet
  diff against that topic now shows only intentional deltas.
- Fixed: Step 6's third dimension field stayed laid out when hidden — the author `.field
  { display: flex }` beats the UA `[hidden]` rule, the same trap the shared sheet already guards
  for `.btn`, `.vp-hint`, `.compare-chip` and `.step-panel`. Added the matching `.field[hidden]`
  guard.
- Fixed: the drawing sheet framed a directrix line three times the height of the curve, leaving
  the construction small in a card of empty paper. All three sheet frames now size from the
  curve's own analytic half-height, and the sheet margin scales with the card so the outermost
  captions stop clipping against its edge.
- Fixed: label collisions. The 3D anatomy pills were anchored on the cone's surface and stacked on
  each other; they now sit outside the silhouette, spread up the axis. On the sheet, the letters
  were dropped from the feature captions (the step card and each term's popover still name them in
  full), the terminology figure no longer draws the tangent and normal (they belong to Step 5,
  where their toggle lives), the eccentricity construction dropped its duplicate per-point labels,
  and the marked point P now defaults off-axis so PF / PQ never stack on the axis line.
- Changed: Step 6's copy no longer claims every group docks into the rail.
- Added: split-layout assertions to `verify/shipped-module.mjs` — only the value drivers dock, the
  viewport keeps ≥ 40% of its column, the renderer fills the pane, the sheet stage is real, and the
  page does not overflow.

## 2026-07-29
- Added: the topic, built end to end against Chapter 6 of the prescribed textbook — a six-step
  guided stepper covering §6.1 (the double cone and its six section planes), §6.3 (the conic as a
  locus), §6.2/§6.4/§6.8 (the nomenclature), and §6.5/§6.7/§6.9 (all twelve constructions,
  with the tangent and normal).
- Added: `src/conicEngine.js` — the pure 2D leaf that owns every plane-curve calculation and the Canvas2D
  drawing for the sheet. One focal-polar model derives the vertex, centre, second focus and
  directrix, latus rectum, axes and asymptotes of all three curves; four sheet modes (locus,
  terminology, eccentricity construction, the other methods) and eleven construction builders
  return a typed display list plus the analytic bbox that locks the millimetre scale (ADR-084).
- Added: `src/conicData.js` — the pure catalogue: the six section planes with the chapter's own
  defining rules, `classifySection()` judged against the cone's LIVE generator angle, the eleven
  methods with the dimensions each is given, and the two topic-local state shapes.
- Added: the 3D half — a double cone assembled in the orchestrator from two copies of the restored
  `cone.js`, with topic-1's `sectionCut.js` used as a curve EXTRACTOR: the solid stays whole, its
  section loop is drawn on it as a fat `Line2`, and the clipper's cap becomes the section face
  (ADR-085). The plane's offset is measured from the apex, so offset 0 IS section plane FF.
- Added: the Problem Library with all fifteen chapter exercises verbatim, grouped by curve, with
  three scaffolded hints each and a never-auto-fill self-check (±0.02 on the eccentricity, ±0.5 on
  every millimetre and degree). Nothing is stamped in on load — every checked quantity is one the
  learner can dial.
- Added: CSS2D anatomy labels for §6.1's vocabulary (apex, axis, generator, base, both nappes, the
  apex angle), shown on Step 1 only and freed by the disposal traversal.
- Changed: sheet quantities are stored in MILLIMETRES rather than the platform's world units — the
  construction never enters the 3D scene and every figure in the chapter is quoted in mm (ADR-083).
- Removed: the four non-cone generators, `genericSolid.js` and `meshAnalyzer.js` from the scaffold —
  nothing here imports them, and an unused copy of a shared file is a drift surface with no upside.
- Removed: the dormant quick-view and connector-line chrome inherited from the scaffold (markup +
  CSS), along with the plane-label, reference-line, view-name, first-angle-symbol and empty-state
  styles this topic never renders.
- Added: `verify/` — the two Node oracles, kept with the topic so a later session can re-run them.
  Tooling, not payload: nothing in the page references them, and they are excluded when packaging.
- Verified: the mathematics oracle (every plotted construction point satisfies its own conic) and
  the headless Chrome walkthrough of the shipped module (clean boot, platform contract, six steps,
  all eleven constructions painting, the six section classifications through the real sliders, the
  reset path, fifteen problems, and a flat WebGL buffer count across 50 rapid rebuilds) both green.
