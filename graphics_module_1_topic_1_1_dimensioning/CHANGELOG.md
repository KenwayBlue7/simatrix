# Changelog — Module 1 Topic 1.1: Dimensioning

All notable changes to this topic. Platform-wide entries live in `../CHANGELOG.md`.

## 2026-07-28 — any-to-any comparison

Comparison workflow only. No change to the rendering engine, the drawing logic or the lesson
content.

- **Any layout against any other.** The compare used to hold whichever arrangement the learner
  happened to view *previously* — so the question it answered was an accident of their clicking
  order, and it was dead until they had switched layouts once. Step 4 now discloses a second
  selector when the compare opens: pick the layout on the drawing, pick the layout beside it,
  in either order. The comparison list is every arrangement **except** the one already on the
  drawing, and it is re-derived whenever the main layout changes — so the two can never become
  the same drawing, and a main-layout change that would collide moves the comparison aside.
- **Live, and nothing is rebuilt.** Switching either selector rebuilds only the affected sheet's
  spec list and redraws. Sheet A's reveal animation never re-runs, the camera never moves, and
  `setCompareOffsets` now re-sizes only when the compare actually opens or closes — a frustum
  change reallocates every fat-line resolution, and swapping which layout sheet B shows is a
  spec change, nothing more.
- **The two drawings are now genuinely symmetric.** They were not: each sheet's ink sits 13 mm
  right of its own origin (the frame is nudged right to balance the leader notes), and the sheet
  groups were being offset by that nudge *as well as* by the half-gap — so the pair sat 26 mm
  off centre and the left drawing had 38 px less margin than the right. Measured after the fix:
  identical margins at every resolution from 1366×768 to 3440×1440.
- **Rendering parity, measured.** Both sheets were already built from the same rig, the same
  dimension layer and the same resolution; what differed was sub-pixel placement from that
  asymmetry. Verified numerically on identical windows around each sheet: the same vertical
  stroke runs (2·2·2·1·2 px), the same minimum ink value, the same mean ink density. Same line
  weights, same dashes, same arrowheads, same anti-aliasing.
- **Each drawing carries its own name.** The two layout names used to sit in a strip pinned to
  the top of the viewport, ~340 px above the drawings they named. Each is now a CSS2D label
  anchored in its own sheet's world space, 88 mm below the drawing's centre of ink — so it
  travels with its sheet, and the two are automatically level, the same size and symmetric. The
  `.vp-split` strip is gone.
- **The card says what changed.** With a comparison open, the verdict card becomes a two-column
  table putting the two layouts side by side on the three axes the chapter judges them by —
  space, clarity, and how the part is actually made. Existing catalogue data; no drawing is
  altered to make the point, and neither column is styled as the right answer.
- **Clipping at narrow viewports.** The reach constants measure world-space ink, but the notes
  are CSS2D pills — a fixed number of pixels wide however small the drawing is scaled — so at
  886 px of viewport the longest note ran 12 px off the left edge. The compare frustum takes a
  larger margin (1.04 → 1.12) and the annotation scales with the drawing (12 → 11 px) on BOTH
  sheets, so the two stay identical. Verified clear at 1366×768, 1600×900, 1920×1080, 2560×1440
  and 3440×1440.
- **Step 6's compare is unchanged in kind** — the faulty drawing against the corrected one is a
  fixed pair, so it shows no second list. It picks up the per-sheet names and the symmetry fix.

## 2026-07-28 — right-panel layout

Layout only. No lesson content, no graphics, no change to the six-step structure.

- **Next is never disabled.** It used to open only once a step's key interactions were done, so
  a learner who wanted to read ahead, or who was stuck, was held in place by a greyed-out
  button. The step's remaining work is now stated beside it — a terse `4 left` on the footer's
  one row, with the full sentence on the button's tooltip and to assistive tech — and the
  learner decides. Completion still means something: it drives the rail's ✓ marks and each
  step's closing summary card, which is where it belongs. The rail unlocks every step already
  reached rather than only every step finished, so skipping ahead is reversible.
- **The footer is genuinely sticky, and now a stable single row.** It was already outside the
  scroll — `#step-card` is a flex column, `.card__scroll` is the only box with overflow, and
  `.card__nav` is a non-shrinking sibling after it — which is why nothing is positioned and the
  footer can neither scroll away nor overlap content. What was wrong is that the remaining-work
  hint took a full second row on incomplete steps and vanished on complete ones, so the footer
  changed height under the learner. It now sits between Reset and Back on the same row.
  Measured identical at **71 px on all six steps**, and at 720p, 768p, 900p, 1080p and 1440p.
- **Collapsed accordions cost exactly their header.** The `.fold` wrapper carried a 16 px
  `padding-top` — invisible space every collapsed section paid for, on top of the panel's own
  gap. Removed. Verified: a closed section measures 45 px against a 44 px summary, on every
  step.
- **`[hidden]` now actually hides.** It loses to any author rule that sets `display`, and this
  panel sets `display: flex` on chip rows, option lists, the progress meter and the segmented
  controls — so several hidden containers were still laid out as empty flex boxes reserving
  their own height *and* the panel's gap around them. One `[hidden] { display: none !important }`
  fixes the lot; the per-component overrides it replaced are gone.
- **One spacing system, stated once, applied everywhere:** 16 px between sections, 8 px between
  stacked accordion headers, 12 px between a heading and its content, 12 px between a control
  and the verdict it produces. Built from margins rather than a flex `gap`, because a gap is the
  same between every pair and stacked accordions have to sit closer than sections do. The rule
  is declared *after* the component styles on purpose: several components zero their own margin
  at the same specificity, and only the later rule wins that tie — declared earlier, they
  silently collapsed to a 0 px gap (Step 6's hint did exactly that).
- **Two verdicts moved to sit with the control that produces them** — Step 3's method card, and
  Step 4's variant chips — so the 12 px pairing is structural, not a special case.
- **Accordions animate in CSS, not JavaScript.** `interpolate-size: allow-keywords` plus
  `::details-content` gives a real height transition with no layout read-back, so nothing can
  thrash; where the browser lacks them the section still opens and closes, it simply snaps.
  Reduced motion collapses it to instant — `::details-content` is not matched by `*`, so it is
  named explicitly.
- **Space reclaimed:** the dead `.card__body { flex: 1 1 auto }` (its parent is not a flex
  container), the scroll run-out 32 → 16 px, the outer wizard padding 24 → 16 px, step
  body/summary margins 32 → 16 px, and the nav padding trimmed. Step 5's "conventions — not
  symbols" group folds, since it is secondary by definition and the step gates on the five.
- **Content heights, every step:** 1 · 1585, 2 · 1316, 3 · 1140, 4 · 1546, 5 · 1566,
  6 · **845 — no scroll at all**. Step 3 was 1256 and Step 5 1772 before this pass.

## 2026-07-28 — final UX and interaction polish

The last usability pass. Nothing in the architecture, the graphics engine or the six-step
structure changed; every edit below reduces what the learner has to hold in their head.

- **One collapsing selector, shared by Steps 2 and 4.** Ten rules and six layouts were open
  lists that filled the panel and pushed the verdict — the thing that answers the question —
  below the fold. Both now use the same `.select`: collapsed it shows the current choice, opened
  it lists the rest. Keyboard-complete (↑↓/Home/End, Enter, Escape, click-outside) with
  `aria-activedescendant`, so focus never leaves the trigger. The rule across the module: up to
  four choices stay an open list, because comparing them side by side IS the point; beyond four
  they collapse, because the list has stopped being a comparison and become a menu.
- **One persistent compare, in a fixed slot.** It was a block button in Step 4 whose label
  rewrote itself on press, and the third segment of a three-way control in Step 6 — two
  affordances for one idea, in two places. Both steps now paint the same `.toggle` directly
  under the step's own primary control. Step 6's segmented control drops to two states (With
  faults · Corrected), which is what it always was: "compare" is an overlay on whichever one is
  chosen, not a sibling of them. In Step 4 the control stays visible before a second layout
  exists and says *why* it is not yet available instead of going silently dead.
- **Removed Step 3's "Turn the drawing" slider**, and with it `viewRotationDeg` from the
  orchestrator. The step's objective is aligned-versus-upright text, and switching between the
  two methods teaches that directly; rotating the sheet was a second interaction for the same
  idea and a two-handed one. The eight-directions study stays — it is the one thing that shows
  *why* aligned values flip — but as the same fixed-label toggle, so "Back to the plate's own
  sizes" is gone. The method card now answers what changes, why, and where each is used.
- **Step 6 rebuilt as an assessment.** A twelve-cell progress meter and a `n / 12 solved` count
  in place of a bare tally; milestones at the first find, the halfway mark and the finish; the
  finished sheet shown automatically on completion. Marker states went from two to four —
  untouched, already checked, wrongly accused, solved — each with its own glyph as well as its
  colour, and the one just judged is ringed so the drawing and the explanation card point at
  each other. The explanation is three short lines (Wrong · Why · Correct) instead of three
  paragraphs, and the step's own copy is the shortest in the module because this step is for
  looking, not reading. The sheet settings and the rules reference fold away.
- **Step 1's three secondary studies fold.** The step ran to three screens before the learner
  had done anything, with the two groups that carry it buried in the middle. Terminations, the
  space study and the leader heads are now one disclosure each; closing one puts the drawing
  back to the plain anatomy, so the viewport never keeps showing a study whose control is gone.
  Panel height 2503 → 1841 px.
- **Nothing appears and disappears any more.** Step 3's angle choice is an aligned-only
  question, so it used to vanish under Upright; it now stays in place, fades, and explains
  itself — the same treatment as the compare.
- **Every control is a 44 px target.** The two sliders were 4 px tall: the painted track was
  also the whole hit area. The track moved to `::-webkit-slider-runnable-track` and the input
  is a transparent 44 px band around it. Audited across all six steps — nothing under 44 px.
- **Verified.** Full six-step walk with 12/12 faults, the keyboard path through both selects,
  compare on and off in both steps, and the device-scale sweep — zero console errors, zero
  warnings. Panel scroll height fell on every step that changed: Step 1 2503 → 1841, Step 2
  ~2100 → 1444, Step 6 ~1900 → 959.

## 2026-07-28 — graphics-pipeline parity with Foundations

A full audit of the graphics pipeline against `../graphics_module_1_topic_1_foundations`, and
the fixes it turned up. Four root causes, not four symptoms.

- **Fixed: the spigot's cylinder wall was wound inside-out.** 128 of the solid's 3094 triangles
  had normals pointing INTO the metal — every one of them on the spigot, whose ring winding runs
  the opposite hand to the z-ordered convention the rest of the solid is built on. The visible
  damage was in the classifier, not the shading: `lineDrawer`'s sample bias pushes each probe
  point OFF the surface along the summed incident-face normal, so an inward normal drove the
  probe INTO the metal and the cylinder's two silhouette generatrices classified as hidden from
  every direction. The spigot was permanently dashed in the 3-D view and in Turn Over. Now the
  buried 1 mm of each generatrix is dashed and the exposed 26 mm is solid, which is what the
  geometry says. Audited by ray-parity over every triangle: 0 remaining inverted normals.
- **Fixed: the solid was `DoubleSide`; Foundations is `FrontSide`.** DoubleSide was only ever
  covering for the winding above. It also lit every concave interior with a flipped normal, so
  the spherical seat read as a convex DOME instead of a bowl, and it doubled the fill cost. With
  the winding correct, back-face culling is safe — and it is what the occlusion raycaster was
  reviewed against, since `THREE.Raycaster` honours `material.side`.
- **Fixed: a study's dimming leaked into the 3-D view.** Step 3's oblique clock and every Step-4
  arrangement push the part into the background by making its material transparent at 0.35, so
  the dimension study reads on top. Nothing cleared that on entering a dynamic view — and a
  transparent mesh is drawn in Three.js's LATE transparent pass, after every opaque object, so
  the ghost solid painted over the classifier's strokes and its far faces showed through as
  surfaces the part does not have. The rig now treats the dim and Step 1's line-type focus as
  WANTS and suppresses both whenever the linework has been handed to the classifier; returning
  to the elevation restores the study exactly as the learner left it.
- **Fixed: rig state did not survive a rebuild.** The dim, the line-type focus and the centre
  lines were pushed at the rig ad hoc from each step and held nowhere else, so a WebGL context
  loss in Step 4 came back with the wrong part. They are now one record in `main.js`, replayed
  by `applyViewMode()` at the end of every rebuild — the contract Foundations has in
  `applyLayers()` + `setXray()`.
- **Fixed: the drawing was not centred.** The camera framed the bounding box of everything drawn,
  and the dimension lanes fall far further below the part than they rise above it, so the frame's
  centre sat 27 mm under the plate and the plate rode high: 247 px of clear space above it
  against 407 below. The frame is now a symmetric REACH from the part's own centre — Foundations'
  `frontViewPose` shape. Measured across every step: vertical bias 247/407 → **299/299** on the
  elevation, horizontal 86–101 px → **≤14 px**.
- **Fixed: a drag during a "Front view" glide was overridden.** `applyPose()` rewrote the camera
  from the in-flight tween every frame, so the part snapped back under the pointer for the rest
  of the transition. The gesture now cancels the tween. A related one: a glide started from the
  stored pose, which a manual orbit never updates, so it jumped to a stale azimuth on its first
  frame — every transition now starts from where the camera actually is.
- **Fixed: orbiting away from a before/after compare left its control latched.** The compare
  cannot survive a dynamic view (the classifier welds and raycasts against a sheet that must be
  square-on and centred), so `applyViewMode` takes it down — and now tells the wizard, which
  un-latches the toggle instead of claiming a split that is not on screen.
- **Fixed: the caption band sat on top of the finished drawing's lowest dimension lane.** Moved
  from centred-and-raised to bottom-right, where a title block lives on a real sheet.
- **Verified.** Every edge in the 3-D view, Turn Over and a free orbit re-tested against the
  geometry and the live camera: 906 runs, 0 wrongly solid, ≤3 wrongly dashed (all inside the
  tolerance of the check's own surface-offset approximation). All nine viewport transitions leave
  the right linework and an opaque solid; six reveal-hidden toggles return to the starting state;
  device-scale sweep 1 → 2 → 3 → 1.5 → 1 with one shared `LineMaterial.resolution` throughout;
  full six-step walk with 12/12 faults, zero console errors, zero warnings. Reclassify 3.84 ms.

## 2026-07-28 — production hardening

- **Line weights and dash patterns now match Foundations exactly.** The authored linework was
  drawing its dashes at 0.25/0.08 world units and its outlines at 2.1 px, while the live
  classifier used Foundations' 0.12/0.08 at 2.5 px — so the SAME dashed countersink changed
  appearance the moment the plate was turned. Every constant is now the benchmark's: outlines
  2.5, hidden 1.5, centre 1.3, dash 0.12/0.08, chain 0.34/0.07/0.12, centre overshoot 0.35. The
  dimension apparatus follows: Type B 1.0, arrow heads 2.5, and its dashed aid strokes on the
  same 0.12/0.08. Verified by cropping both topics at identical scale and DPR — indistinguishable.
- **Fixed: the pixel ratio never updated after boot.** `setPixelRatio` ran once; browser zoom, a
  move to a differently-scaled monitor, or an OS display-scale change left the drawing buffer at
  the old ratio — a soft picture with every fat line measured against the wrong buffer. It is
  now re-applied on change (and only on change, since it forces a buffer reallocation). A
  ResizeObserver alone cannot catch this: zoom can leave the viewport identical in CSS pixels, so
  the observer never fires. Two signals now cover it — a `(resolution: …dppx)` media query, plus
  a one-float-per-frame backstop for environments where that query does not dispatch.
- **Fixed: context restore came back mis-sized.** The handler rebuilt before re-sizing, so fresh
  batches were handed a stale resolution. It now re-sizes first, rebuilds, restores the camera
  pose and forces one classification pass.
- **Fixed: `handleResize` did not re-classify.** New resolutions reached the batches but nothing
  asked the classifier to redraw, so a resize with a still camera could leave lines at the old
  weight until the next orbit.
- **Fixed: the disabled "Reveal hidden lines" chip looked and behaved enabled** — full opacity,
  pointer cursor, live hover. It now dims to 0.45 with `not-allowed`, and hover is gated on
  `:not(:disabled)`.
- **Panel spacing.** One clear beat between control groups (16 → 24 px), a wider one between
  Step 1's five studies (16 → 32 px), and a rule pairing each control with the verdict it
  produces (12 px) so the rhythm reads label · control · verdict, gap, next idea. Group labels,
  paragraph spacing, detail padding and leading, summary separation and the action bar all
  loosened. Side padding is symmetric again, the scroll region has a proper run-out at the
  bottom, and `overscroll-behavior: contain` stops a flick at the end scrolling the page behind.
- **Controls.** Segmented buttons raised 40 → 44 px so every control shares one hit target;
  option rows given 4 px between title and tag.
- **Verified:** zero console errors and zero WebGL warnings through a stress of DPR churn
  (1 → 2 → 3 → 1), five viewport resizes, continuous orbiting, repeated step switching and two
  sidebar collapses; full six-step regression clean; 12/12 faults; CSS2D nodes 0 → 0 and JS heap
  flat (9.3 → 9.7 MB) across 50 rebuilds.

## 2026-07-27 — live edge visibility in the 3-D inspection

- **Added: the 3-D view now classifies its linework LIVE against the camera**, reusing the
  sibling Foundations topic's stack rather than inventing a second one — `src/meshAnalyzer.js`
  copied byte-for-byte (md5 matches), `src/lineDrawer.js` copied with only its header and group
  name retargeted, the same global `computeBoundsTree` / `acceleratedRaycast` patch, and the same
  rAF-throttled `reclassify(camera)` gated on `controls.update()`. Silhouettes now appear and
  vanish as the part turns, and an edge that passes behind the boss goes dashed for exactly the
  stretch that is buried.
- **The front elevation is untouched.** It keeps its authored linework, because a drawing is a
  fixed agreed projection and Step 2's "measure from visible outlines" rule argues about one
  specific dashed circle. The two systems swap on the named pose: authored in the elevation, live
  everywhere else. Leaving the elevation hands over at once so the linework is live as the plate
  starts to turn; arriving waits for the tween to land, so the drawing snaps in only once the two
  agree.
- **Added: a "Reveal hidden lines" viewport chip.** It takes the solid's *material* off while the
  mesh stays in the scene, so the raycaster — which reads geometry, never material — keeps
  classifying and the buried edges come out dashed. The result is a true engineering wireframe,
  solid where you can see it and dashed where the metal is in the way, not a flat tangle of
  lines. Same mechanism as Foundations' X-ray. Disabled in the elevation, where there is nothing
  to reveal and the chip says so.
- **Decided (ADR-081):** this supersedes **ADR-078 point 2** only. That point argued nothing here
  was camera-dependent — true of a topic with one fixed elevation, and untrue the moment the 3-D
  view became an inspection. Points 1 and 3 stand: still one orthographic camera, still no
  projection morph, still sibling-importable pure-data catalogues.
- **Note:** because the classifier welds and raycasts in WORLD space, the sheet must be square-on
  and centred while it is live. Entering a dynamic view drops the Step-3 turn and the two-sheet
  compare — both flat-drawing devices — and returning to the front restores the turn.
- **Verified:** ≈5.3 ms per classification pass, 1222 rays over 4641 edges, so the pass fits
  inside a frame with room to spare; and it is gated on the classifier being the visible one, so
  the elevation costs nothing. JS heap flat across 50 full rebuilds (9.2 → 9.6 MB) with the BVH
  freed before its geometry each time. Zero console errors and zero warnings across the full
  six-step regression walk; 12/12 faults; CSS2D nodes 0 → 0.

## 2026-07-27 — readability pass + model fixes

- **Rewrote every learner-facing string in plain teaching language.** Step bodies are down from
  150–220 words to 75–97; each is now three short paragraphs on one pattern — what it is, why we
  use it, and one line telling you what to do. Summaries are 4–5 short bullets. Glossary entries
  are two or three sentences. Nothing was cut from the engineering; only the wording changed.
- **Removed every citation from the interface.** No section numbers, rule numbers, item numbers
  or figure numbers appear anywhere a learner can see them — not in a card, a chip, a label, a
  tooltip, an announcement, the checklist or the page description. They remain in the source
  comments, which are for us. A student does not need to know where a rule came from to obey it,
  and a reference mid-sentence is a speed bump.
- **Simplified the terminology.** The line legend reads "Visible edge · Thick line · The part
  you can see", not "Type A continuous wide". Method-1 and Method-2 became "Aligned" and
  "Upright" on the controls and in the copy. "Termination" is introduced as "how the line ends".
  The formal names still appear once, where the concept is already understood.
- **Cut the duplication.** The termination proportions, the placement rules and the nine rules
  were each stated in three or four places; each is now stated once and reinforced by the
  interaction instead.
- **Fixed (graphics): the spigot showed a false crease in the 3-D view.** Its two long edges are
  a SILHOUETTE, which belongs to one direction of sight — correct as the sides of the rectangle
  in the elevation, wrong as a line down a smooth cylinder in a pictorial. They are now their own
  batch, shown only in an axial view. A named-pose switch, not per-edge classification: nothing
  is recomputed on orbit, so ADR-078 stands.
- **Fixed (graphics): "Turn over" did not turn the countersink over.** The far-side countersink
  was drawn dashed no matter which way the plate faced, so turning it over showed the near face
  still reading as hidden detail — contradicting the chip's own promise and the rule Step 2
  teaches with it. It is now drawn both ways in two batches and swapped with the pose:
  dashed from the front, continuous once the plate is turned.
- **Verified:** every other edge checked at 3× zoom in all three views — chamfer, crown, fillet
  tangency, bore chamfer ring, slot, square, ball seat, corner radius, the prism's corner edges.
  No duplicate or coincident edges, no z-fighting, no missing outlines, no clipped geometry.
  Every dimension still attaches to its own feature, every leader lands where it should, no
  labels overlap. Zero console errors and zero warnings across the full six-step walk; 12/12
  faults; CSS2D nodes 0 → 0 across 50 resets.

## 2026-07-27 — parity audit remediation

Everything in `PARITY-AUDIT.md` bar the items it marks as intentional differences. The topic
now matches the reviewed sibling `../graphics_module_1_topic_1_foundations` on every
platform-level behaviour compared.

- **Fixed (regression): the summary card was painted on arrival.** `renderSummary()` ran
  unconditionally inside `goToStep()`, so every conclusion a step exists to produce was on
  screen before the learner had touched a control. It is now gated on `isComplete(currentStep)`
  and driven from `sync()` — which every control that can complete a step already calls — so it
  appears the moment the step is finished, without the learner having to leave and come back.
- **Fixed (regression): the camera stayed wherever the learner last orbited.** Foundations
  restores the view on every navigation; this topic did not, and it matters more here, because
  its subject is a flat elevation rather than a pictorial — a step arrived at mid-orbit showed a
  skewed sheet, and in Step 3 the readability of a value could not be judged at all.
  `goToStep()` now calls `sim.restoreView()` on every Back, Next and rail jump. It glides
  through the existing `setView()`/`anim.js` path (so reduced motion still snaps), returns zoom
  to whatever the sheet's chosen scale asks for, and is a no-op when the camera is already
  there. Manual orbit, scroll-zoom and pan are untouched, and the viewport chips behave exactly
  as before.
- **Added: the viewport callout.** A `.vp-callout` pill — the same component, token for token,
  as Foundations' line-type callouts — now names ON the drawing whatever the step is pointing
  at: the isolated element in Step 1, the chosen symbol in Step 5. It rides the existing CSS2D
  layer (`dimensionLabels.setCallout()`), is deliberately excluded from the focus/fade set, and
  clears itself whenever nothing is active.
- **Changed: the step copy now uses one heading structure**, the triad Foundations uses on every
  step — **What it is** / **Why we use it** / **How it is drawn** — with any "do this next"
  sentence left unlabelled, exactly as Foundations does. Content was re-split and re-labelled,
  not rewritten.
- **Fixed: Step 1's `postBody` described controls that were still hidden.** The prose that
  explains the elements, line types, terminations and leader heads is now withheld until "Add
  the dimensions" discloses them, through a `controlsVisible()` predicate in the new
  `renderCopy()`.
- **Added: a `refocus()` helper**, the same one Foundations' stepper uses — one focus policy in
  one place. Focus can no longer fall to `<body>` when a control hides itself.
- **Verified:** camera restored on Next and on a rail jump while a real CDP drag still orbits
  freely; summary hidden at boot and on entering an incomplete step, shown in place on
  completion; callout tracks hover, pin, unpin and symbol selection and clears on each; zero
  console errors and zero warnings across the full six-step regression walk; CSS2D nodes 0 → 0
  across 50 `simAPI.reset()` calls.

## 2026-07-27 — curriculum audit remediation

Everything in `CURRICULUM-AUDIT.md` except the deliberately deferred production/authoring
workflow (see the audit's own status section). Figures fully represented move from 15 of 44 to
27 — which is **every figure in the teaching half of the chapter**, Figs. 4.1 to 4.27. The 17
that remain are the seven worked wrong→correct examples (substituted here by twelve seeded
faults on one part) and the ten exercise parts, which the deferred workflow covers.

- **Fixed (blocking): the projection-line gap.** `SPACING.extGap` was 1.0 mm, putting a
  visible gap between the outline and the root of every projection line — on every drawing,
  in all six steps. Fig. 4.1 annotates that junction **"No gap is left here"**. It is now 0.
  This was the audit's single blocking academic defect: the topic contradicted its own master
  reference in the chapter's first figure.
- **Fixed (blocking): the §4.6 checklist and the §4.5 class-work system are no longer gated.**
  They are painted the moment Step 6 opens. A checklist a student cannot consult while working
  is not a checklist.
- **Fixed: a leader's lettering was pushed twice** whenever Step 1 expanded a drawing into its
  named parts (`drawLeader` accepted both the `note` and the `text` element). §4.1 calls it a
  note; it is now pushed once, under `note` alone.
- **Added to the part** — three features, so that three figures the plate could not previously
  show become real geometry rather than absent:
  - a **cylindrical spigot** ø28 × 26 standing off the right end face, its axis lying IN the
    drawing plane so the front elevation shows it as a RECTANGLE (Fig. 4.21);
  - the step's top face **crowned to R220**, a radius whose centre falls 166 mm below the
    plate and therefore off the sheet entirely (Fig. 4.22's large-radius case);
  - a **3 × 45° internal chamfer** at the bore's front mouth, which is why the bore now reads
    as two concentric circles in the front view (Fig. 4.26c).
- **Added: three rule cards** — Fig. 4.2 (a centre line or an outline may BE the projection
  line), Fig. 4.3 (a broken feature keeps an unbroken dimension line), and §4.6 rule 8
  (hatching stops short of the value). Ten rules in all. Fig. 4.2 is a **permission**, so its
  switch reads as two lawful drawings and neither side is flagged wrong — a new `permission`
  flag in the rule catalogue.
- **Added: three renderer kinds** — `break` (the conventional break of Fig. 4.3), `hatch`
  (section hatching that steps around the dimensional text), and `radiusLarge` (the broken and
  offset radius line of Fig. 4.22).
- **Step 1 rebalanced, Step 2 unloaded.** Everything about how a dimension is DRAWN moved to
  Step 1, where §4.1 names those parts: the termination selector, a **15°–90° included-angle
  slider** (the band §4.1 actually allows), a **space slider** that squeezes the projection
  lines together and makes the termination give way — heads inside, then outside, then a dot
  (Figs. 4.7–4.8, §4.6 rule 7) — the **three leader heads** of Fig. 4.4, and a clickable
  **line-type legend** (Type A/B/E-F/G) that holds one weight of line and fades the rest.
  Step 2 is now rules plus the placement drag, and nothing else.
- **Step 3:** a **Fig. 4.10 study** (the same value on eight dimension lines pointing every way
  round the circle) and the **Fig. 4.11(a)/(b)** angular-value choice, with the textbook's own
  note that (b) is the simple one it suggests for class work.
- **Step 4:** arrangement **variants** where the chapter's own figure prints more than one form
  — Fig. 4.17(a) turned values vs (b) upright, and all three co-ordinate representations of
  Fig. 4.19 (numbered + full table, values written at each point, numbered + bare x/y table).
- **Step 5 made interactive, and the symbol set separated.** The five §4.4 indications
  (ø R Sø SR □) now sit in their own group labelled as the BIS set; the slot, chamfer,
  countersink and chord/arc sit below as feature conventions, explicitly *not* symbols. Every
  symbol carries the **variants its own figure prints** — the circle four ways plus the
  "ø omitted" case, the radius three ways including the large-radius form, the square three
  ways, the chamfer external/simplified/internal, and the countersink by diameter (Fig. 4.27a)
  **and by depth (Fig. 4.27b)**.
- **Step 6: four notation faults** added to the eight rule faults — `12R` (symbol after the
  value, the book's `8R`/`20φ`), `Rad 15 mm` (a word and a unit where a symbol belongs),
  `24 Dia` (which also throws away the S of a spherical seat) and `D28` (the book's
  `D12`/`12D`). Twelve faults in all. These are the errors Figs. 4.28–4.44 spend most of their
  time correcting, and they were previously untested.
- **Step 6: the sheet itself.** A caption band (object name in capitals, circled question
  number, scale note — §4.5 item 6), a **scale selector** that resizes the drawing while every
  value on it stays exactly the same (§4.5 item 5, the whole point), and a **unit selector**
  that restates the drawing in centimetres and puts the general note near the title block that
  §4.5 item 4 requires for any non-millimetre unit.
- **Added: a closing summary card on every step**, and a gate hint that names what is still
  outstanding.
- **Gates tightened:** Step 1 now needs 4 of 6 elements inspected, Step 2 five of ten rules
  switched to their second drawing, Step 4 five of six arrangements, and Step 5 **every one of
  the five BIS symbols**. Step 6 needs all twelve faults. The reference panels are exempt.
- **Copy de-duplicated.** Each fact is stated in one place: the termination proportions, the
  §4.6 rules and the glossary definitions no longer restate one another across three panels.
- **Also fixed:** `validatePlacement` tolerated a value floated 6 mm off its line while quoting
  §4.5's "0.5 mm to 1 mm"; the tolerance is now 4 mm, consistent with the number it cites.
  `fitDecision`'s thresholds now reflect two heads plus a 3–4 mm value, so all three regimes of
  Figs. 4.7–4.8 are actually reachable. An inline data-URI favicon stops the browser's
  automatic `/favicon.ico` 404 appearing as a console error.
- **Verified:** zero console errors and zero warnings across a full six-step walk — 10 rules ×
  2 variants, 5 termination styles + the angle slider, all three space regimes, 3 leader heads,
  4 line types, both methods + rotation + the oblique clock + both angular styles, 6
  arrangements with every variant, 9 symbols with every variant, 12/12 faults, both scales and
  both units. `renderer.info.memory` flat across 50 rapid `simAPI.reset()` calls, CSS2D nodes
  0 → 0.

## 2026-07-26

- **Added: the topic, complete.** A six-step interactive lesson on BIS dimensioning, built on
  the standalone orchestrator pattern of `../graphics_module_1_topic_1_foundations` (ADR-007 /
  ADR-029 / ADR-033) and sourced entirely from Chapter 4 "Dimensioning" of the prescribed
  textbook (`../Dimensions.pdf`, pp. 29–40).
  - `src/dimensionData.js` — the Guide Plate: a 200 × 100 × 30 mm stepped plate carrying one
    clean instance of every feature the chapter dimensions (rectangular block, shoulder, R15
    fillet, R12 corner, 10 × 45° chamfer, ø40 bore, ø14 hole countersunk ø24 × 90°, □22 square
    hole, 16 × 48 slot, Sø24 / SR12 spherical seat).
  - `src/dimensionRig.js` — the solid as ONE manifold, hard-edged, non-indexed mesh
    (`ShapeUtils.triangulateShape` caps + hand-built walls), with the countersink as a true
    90° cone and the seat as a true spherical bowl, plus its Type A / E-F / G linework.
  - `src/dimensionDraw.js` — the BIS dimension renderer: declarative specs → projection
    lines, dimension lines, leaders, terminations and label anchors, with every proportion
    taken from Figs. 4.5–4.6 and §4.3/§4.5/§4.6.
  - `src/dimensionLabels.js` — CSS2D values with Method-1 rotation on an inner span,
    draggable pills (Step 2) and keyboard-playable review markers (Step 6).
  - Pure-data catalogues: `dimensionSteps` (copy, glossary, the §4.6 checklist and the §4.5
    class-work system), `dimensionRules` (7 correct/violation pairs + the §4.2 placement
    check), `dimensionSymbols` (the §4.4 set), `dimensionExamples` (anatomy, the six §4.3
    arrangements, the complete drawing, 8 seeded faults), `dimensionAnimations` (timings,
    stagger maths, named poses).
  - `src/dimensionUI.js` — the guided stepper and every step's controls, each step gated
    behind its own key interaction.
  - `src/main.js` — orchestrator: one orthographic camera, the single `rebuild()` geometry
    path, the `redraw()` spec funnel, the two-sheet before/after compare, `window.simAPI`.
- **Decided (ADR-078):** one orthographic camera and no projection morph (a dimension only
  measures truly under parallel projection, so there is no perspective camera to hand off
  from); no occlusion raycaster and no `three-mesh-bvh` (nothing here is camera-dependent);
  and the topic's pure-data catalogues are sibling-importable, the `genericSolid.js` exception
  of RULES.md §3.6.
- **Decided (ADR-079):** termination proportions follow the textbook's Figs. 4.5–4.6 and §4.5
  item 2 — open head at ≈15° included angle, 3–4 mm long, drawn thick — rather than the
  platform's default 3:1 head (RULES.md §6.19), because this topic *teaches* the proportion
  and must show the figure the student's book shows.
- **Fixed during build** (all caught headlessly before ship):
  - `arcLength` specs were handed to the angular renderer without a `vertex`, throwing on
    every frame of the chord/arc symbol; they now map their own `centre` across.
  - The solid shipped `transparent: true`, which put it in Three.js's late transparent pass so
    it painted over the depth-test-free hidden linework and the far-side countersink never
    appeared. The solid is now opaque unless `setDimmed()` needs it otherwise, with an
    explicit `solid → hidden → visible → apparatus` render order.
  - Light intensities were carried over from pre-r155 units and rendered the paper-toned face
    fill as a muddy grey; rescaled into Three.js's physical units.
  - Sheet B's CSS2D values survived a compare being switched off (CSS2DRenderer reads only a
    label's own `visible` flag, never its ancestors'), leaving stale pills over sheet A.
  - `setPointerCapture` on a synthetic pointer aborted the Step-2 value drag; capture is now
    an enhancement, not a precondition.
  - Review markers were painted on every animation frame, throwing away keyboard focus; they
    are now set only when they change.
- **Verified:** zero console errors and warnings across a full six-step walk (every rule in
  both variants, every termination style, both methods plus a rotation, every arrangement plus
  the compare split, every symbol, all 8 faults found); `renderer.info.memory` flat across 50
  rapid `simAPI.reset()` calls with every CSS2D node removed.
