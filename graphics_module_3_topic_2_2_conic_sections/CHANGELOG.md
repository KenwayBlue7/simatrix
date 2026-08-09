# Changelog — Conic Sections (Module 3, Topic 2.2)

Notable changes to this topic. (The sibling topic's history was intentionally not carried over —
this changelog starts fresh at the build, per MODULE-STARTER §3.2.)

## 2026-08-09 — The tangent method's frame stops moving; its labels are set outward (ADR-137)

**1. Fixed: the drawing rescaled on the final step (ADR-137).**
- The report: "a noticeable visual jump/glitch in the final (freehand) step ONLY in the Tangent
  Method", with the cause given as a fresh rebuild or a second drawing mode, to be fixed by
  suppressing `scene.clear()` and not re-instantiating geometry groups.
- **The cause was arithmetic, not rendering.** This sheet is a display list: `layoutFor()` returns
  typed primitives and `drawSheet()` repaints the whole list every frame. There is no scene to
  clear, no geometry group to re-instantiate, and no second drawing mode — every stage already
  redraws all of the linework before it, and the reveal is a trim on path length applied by that
  same renderer. Nothing needed preserving because nothing was being discarded.
- What was actually wrong: the sheet locks its millimetre scale to the layout's analytic bbox
  (ADR-053), and that bbox was measured from what the CURRENT stage had drawn. The last stage adds
  the directrix, which runs to ±0.6 · AB where every earlier stage stops at A and B, ±0.5 · AB — so
  the frame grew from 224 × 120 mm to 224 × 144 at the exact moment the freehand curve began.
- Measured, stepping the construction by hand and reading the pixel length of the double ordinate
  (120 mm at every stage):

  | pane | stages 1–8 | stage 9 |
  |---|---|---|
  | 964 × 805 | AB = 219 px | AB = 219 px — width binds, nothing moves |
  | 1124 × 565 | AB = 225 px | **AB = 189 px, sliding 54 px left** |

  A 16 % rescale of the whole drawing in one frame, on a short viewport; invisible on a tall one,
  which is why it read as intermittent.
- Fixed: `parabolaTangent()` returns the frame of the FINISHED figure and `methodsLayout()` passes a
  builder's own bbox through to `finish()`. AB now measures 188 px at every stage of the short pane
  and 192 in the tall one. The sheet is laid out for the finished drawing from stage 1.
- This is the only one of the three syllabus constructions that had the fault: the concentric
  method's frame is its two auxiliary circles and the oblong method's is its rectangle, both drawn
  at stage 0. Neither was touched.
- Rejected, and recorded: also reserving the tangent and normal at BOTH ends of the curve, so that
  dragging P could not move the frame either. Measured at 258 × 187 mm, which took the 1124 × 565
  pane to **1.1 px/mm** — under the 1.3 gate at which `drawSheet` drops every caption. A drawing
  with no names on it is worse than one that resizes while a slider is dragged.
- Oracle: three new assertions in `verify/conic-math.mjs` — one frame across every stage at every
  division count 4–12, one across every stage at five positions of P, and a non-vacuity check that
  the tangent toggle does enlarge the frame, so the first two are not passing because nothing moves.

**2. Fixed: a replay could run against a live curve trace.**
- `playConstruction()` cleared the stage timer but not the reveal tween, so a trace still running
  from the previous pass kept writing the global `curveReveal` while the new playback laid down its
  construction lines. It now calls `cancelCurveReveal()`, the other half of `stopBuildPlayback()`.
- Not changed, because it was not broken: **"Draw it step by step" already starts from the given
  data alone.** Probed on the shipped page — the first frame reads `1 of 9 · The given sizes` with
  the same 2963-px ink as arrival: the axis, the double ordinate, the abscissa and V/A/B/C, and
  nothing constructed. That is ADR-118/ADR-119 working. The tangent method's triangle looks like a
  frame and is not one, because E at its apex has to be found first.

**3. Changed: every point name on the tangent method is set OUTWARD from the figure.**
- A and B both pointed inward, toward the line AB they sit on, which put them among the chords. A
  now reads up-right and B down-right — mirrored about the axis, as the construction is.
- The division numbers had `dy: 0`, setting the baseline at the point, so each number sat across the
  very tangent whose divisions it counts. They are now above AE and below EB.
- `Directrix, DD` was offset `dx: -30` and ran back across its own line; it is right-aligned off the
  line with `textWidthGuess`, the way the double-ordinate caption already was.
- The two dimension captions take opposite sides of the axis so they cannot land in one row.
- Font sizes were already correct and are untouched: `labelWeight()` infers them from the text, so
  the division numbers are the bold size and the point names the size below it.

**4. Changed: A is the FOOT of the double ordinate and B its head (ADR-138).**
- ADR-134 reversed the trace so the pencil comes up out of the base, and deliberately left the
  labelling alone. That made the drawing read **B → A**: the curve began at B and finished at A,
  while every sentence describing the construction names A first — "draw the double ordinate AB",
  "tangents to the parabola at A and at B". The two orders disagreed.
- Fixed at the coordinates, not in the drawing:

  ```js
  const A = pt(abs, dOrd / 2);    // the FOOT — the sheet is y-DOWN, so +y is the bottom
  const B = pt(abs, -dOrd / 2);   // its head
  ```

- Everything derived from those two points followed with no further edit: the tangents AE and BE,
  the division marks along them, the chords 1–1′, the dimension text on AB, and the frame. The trace
  is untouched — `parabolaPts().reverse()` still runs +y to −y, which is now A → B by construction.
- Three annotation offsets moved with the points, since every name here is set outward: A reads
  down-right and B up-right, and the division numbers hang below AE and above BE.
- No geometry changed. The figure is symmetric about its axis, so the swap maps the construction
  onto its own mirror image: same envelope, same f, same focus, same directrix, same bbox.
- Narration updated to match ("from A round the vertex up to B"). `conicData.js` and
  `conicEngine.js` cannot import each other, so the oracle checks the two agree.
- Oracle: four assertions read the COORDINATES rather than the captions — A at +y, B at −y,
  symmetric about the axis; the trace beginning on A and ending on B; and a construction line struck
  from each of them. A caption-only swap fails all but the first.

**Untouched:** the concentric circle method, the rectangular (oblong) method, every other module,
and all geometry. `parabolaPts()` is unchanged, `f = (dOrd²)/(16·abs)` is unchanged, and the
envelope still satisfies y² = 4f·x to 1e-9. All five oracles green.

## 2026-08-08 — Tangent method ends on its curve, traced clockwise; the library is cut to the syllabus (ADR-133 … ADR-136)

**1. The tangent method is nine steps, not ten (ADR-133).**
- Changed: the construction now **ENDS on the envelope**. The tenth stage is gone; the focus and
  the directrix — what Example 6.8 asks this method to LOCATE — are drawn on the envelope stage
  with the curve.
- Fixed: the tangent and normal at P are gated on **`conic.showTangent` alone**. They used to ride
  on the tenth stage as well, so a learner with the toggle on saw them arrive on the last press of
  "Next line", as if they were a step of the construction. Neither sibling syllabus method does
  that — the concentric and oblong methods end on "join the curve" and leave optional elements to
  their own controls.
- Not removed: the focus and the directrix. They are what the construction is asked to produce, are
  named in `METHOD_INFO`'s `output`, and are asked for by name in a shipped exercise. Deleting the
  tenth stage outright would have deleted the answer to the question.
- Note: this cost the oracle its witness that "the stage that draws the curve" and "the last stage"
  are different things (ADR-115's trigger). The witness moved to the focus-directrix construction
  — curve at stage 6, tangent and normal at 7 — and a new assertion pins the tangent method's curve
  to its own last stage, so the tenth cannot come back unnoticed.
- Note: `METHOD_INFO['parabola-tangent'].steps` still reads 7. It is the chapter's written
  procedure count, not the playback length, which is a function of the divisions slider.

**2. The parabola is traced clockwise (ADR-134).**
- Changed: `parabolaTangent()` reverses its `curvePts`. The reveal now runs from **B at the foot of
  the double ordinate, round the vertex, up to A** — clockwise on screen, the way a hand moves
  through a curve of this shape.
- Root cause: `parabolaPts()` samples y from −yMax upward and the sheet is y-DOWN (ADR-083), so the
  pencil started at the TOP of the base and swept anticlockwise.
- Untouched: the geometry. Same samples, same focal length, same envelope, same bbox, same analytic
  scale — order only. The oracle re-checks every reversed point against y² = 4f·x, and checks the
  direction as a **signed sweep about the figure's own centroid** (+270°) rather than on two
  endpoints, so a reversal that only fixed the ends would fail.
- Not done: reversing inside `parabolaPts()` (shared with two parabolas that open the other way up)
  or swapping the labels A and B (that would relabel the drawing).

**3. The Problem Library is cut to the syllabus (ADR-135).**
- Added: `ENABLED_METHODS` in `src/problems.js` — a **third filter axis**, holding
  `ellipse-concentric`, `ellipse-oblong` and `parabola-tangent`. `enabledProblems()` now deals only
  problems whose `target.method` is one of the three, so the focus-and-directrix exercises (which
  name no method at all) are excluded rather than waved through.
- Why a third axis: `ENABLED_TIERS` cuts by CURVE and the ellipse tier holds two syllabus methods
  and four beyond them; `EXCLUDED_TYPES` cuts by problem KIND and `'given-dimensions'` covers the
  oblong method and the offset method alike. Neither can say "these three constructions only".
- Removed from the DEAL, not from the file: the three eccentricity-method exercises and the
  parallelogram, intersecting-arc, rectangle, parabola-parallelogram and offset ones. All fifteen
  chapter exercises stay in `src/problems.js` verbatim, exactly as the four hyperbola ones have
  since ADR-115. Widening the list is a one-line change.
- Added: the **four syllabus practice problems**, verbatim as set — concentric circle method at
  100 × 70 and 120 × 80, rectangular method at 100 × 70 and 120 × 80 — in their own labelled block,
  each with the three-step hint scaffold and a target that maps straight onto the construction.
- The library now deals **seven** problems in two curve groups: three chapter exercises plus the
  four new ones.
- Flagged, not resolved: two of the new four overlap chapter exercises in dimensions (100 × 70
  concentric, 120 × 80 rectangular). The chapter's versions ask for a tangent, a normal or a
  located point on top of the same figure. Dropping either set is a content call.

**4. A loaded problem selects the construction it names (ADR-136, amending RULES §6.2).**
- Added: `armMethodForStep5()` in `src/problemLibrary.js`. Loading a problem arms it; on the
  learner's **first arrival at Step 5** it selects the construction the statement names in words,
  once, and then hands the picker back.
- The dimension sliders land at their **FLOOR**, never at the method's own defaults.
  `ellipse-concentric` defaults to 120 × 80, which is one of the practice answers exactly —
  committing the method with its defaults would have lit the self-check green on load.
- At Step 5 rather than at load, because Steps 1–4 re-derive the sheet's CURVE from the live cut
  (`syncSheetToCut`, ADR-117) and would leave the method beside a curve that had drifted.
- RULES §6.2 is amended, not withdrawn: **a measured quantity is never auto-filled; the named
  construction is.** Verified in the browser — the picker shows "Concentric (auxiliary) circles"
  and the self-check still reads "Still to match: major axis and minor axis."

**Oracles.** All five green. `verify/conic-math.mjs` gains a section 8 for the library (syllabus
methods only, the four new problems by exact statement, seven dealt in two groups, nothing
pre-solved on load, and a non-vacuity check) and four new assertions in section 4o (no stage draws
the tangent with the toggle off; it arrives with the curve when on; the focus and directrix arrive
with the envelope; the trace is clockwise). `verify/shipped-module.mjs` counts seven cards and
asserts none names a construction outside the syllabus.

## 2026-08-05 (c) — One thumbnail box on every step; the docked mode is deleted (ADR-125, supersedes ADR-120)

- Changed: **Steps 4 and 6 now show the thumbnail at exactly the box Step 5 uses** — 420 × 320,
  same anchor, same radius, same shadow, same minimize/restore. Requested twice; asked and
  confirmed with the trade laid out.
- Root cause, and it is not what the brief guessed: there is **no second thumbnail component,
  no step-specific wrapper, no JS assigning a height, and no different flex/grid parent.** One card
  element (`#compare-card`), one sizing rule (`.compare-card[data-size="compact"]`). Step 5 never
  sized it differently — `body.drawing-main` SWAPS which pane is large and which is the card and
  leaves the card's own rules alone. Exactly one thing overrode that rule: `body.sheet-docked`,
  ADR-120's full-height column for Steps 4 and 6.
- Removed: the docked mode **outright**, rather than scoped smaller. Eleven `body.sheet-docked`
  rules across three media queries, the `--sheet-col` / `--sheet-row` tokens, the two `#view-box`
  re-rects, the shadow suppression, and the four `.vp-note` / `.vp-hint` re-anchors that existed
  only to dodge a column. `syncSheetDock()` keeps only `sheet-solo` (the phone's one-pane-at-a-time
  mode, ADR-123) and no longer reads the stage at all. Narrowing the override, or adding a third
  selector to defeat it, would have left two sizing systems in the file — which is the defect.
- Accepted, knowingly: on Steps 4 and 6 the card sits over the box the camera framed the cone into
  again. That was ADR-120's whole reason for existing. Section 7 now **prints that overlap as a
  `note` line on every run** instead of asserting it away, so the trade stays visible. If it is
  addressed later, reframe the camera — do not re-add a per-step sizing mode.
- Changed: `verify/interaction.mjs` section 7 rewritten from "Steps 4 and 6 dock" to "every step's
  thumbnail is the same rect as Step 5's", as an equality on origin AND size, plus a check that the
  body carries **no per-step sizing class** on Steps 1, 4 and 6 — an absence-of-one-class check
  would pass a second mode introduced under another name. Verified at 1920 × 1200, 1440 × 900 and
  1100 × 800.

## 2026-08-05 (b) — The sheet floats at one compact size on every step that has a thumbnail (ADR-124)

- Fixed: **Steps 1, 2 and 3 stretched the drawing sheet to the full height of the viewport**
  (403 × 876 at 1440 × 900) instead of the compact 420 × 320 panel Step 5 shows. ADR-120 and the
  `syncSheetDock()` docstring both say docking is for Steps 4 and 6 — "the steps that show both and
  give neither the bench" — but the condition never read the stage: it docked whenever the sheet
  was open and compact. On Steps 1–3 the cone is the sole subject and the sheet is an optional
  side-reference the learner opened themselves with the Compare chip, so docking handed half the
  bench to something nobody asked to be given equal billing. `DOCK_STAGES = new Set([4, 6])` is now
  the whole of that judgement, and the function reads it.
- Unchanged, deliberately: **Steps 4 and 6 keep the docked column.** That is ADR-120, the fix for
  the design critique's P1 "the sheet occludes the cone" — the float sat on the apex the Step-4
  proof inscribes the focal sphere at, and on the cut Step 6 asks the learner to read. Confirmed
  with the reporter after the alternatives were laid out; ADR-120 stands unamended.
- Verified: at 1920 × 1200, 1440 × 900, 1280 × 720 and 1100 × 800, Steps 1, 2, 3 and 5 agree on the
  thumbnail rect to the pixel, and it never exceeds its 420 × 320 cap — so resizing cannot stretch
  it. `verify/interaction.mjs` section 7 asserts that as an EQUALITY against Step 5's thumbnail
  rather than as "not docked", because the claim is that one box serves them all and a class check
  would pass a third size introduced somewhere else.

## 2026-08-05 — The phone gets its own layout, not a shrunken desktop one (ADR-123)

- Fixed: **the sim was unusable at phone width, not merely degraded.** At 360 × 640 the viewport
  took a fixed 42% slice, the drawing sheet floated as a 70%-height bottom sheet over it
  (96,769 px² of overlap, the solid left an 81 px sliver), and the step card's scroll port
  collapsed to **99 px** — about one line. Step 6's "Set up a cut", the only way into the step,
  sat 130 px below the fold of that port.
- Changed: **below 768 px the sheet is not a window — it is the other view.** `body.sheet-solo`
  gives it the whole viewport and the pane behind it stops painting, so neither is ever partly
  covered. The switch is the pair already used in Step 5: the sheet's own Minimize, and the
  corner chip that names what it brings back. It opens MINIMIZED, because Step 4 swings the
  camera to face the cut and then opens the sheet — on a phone that would replace the solid the
  step had just framed.
- Changed: the vertical split is `clamp(190px, 34vh, 300px)` instead of 42%. A percentage shrinks
  with the screen and the copy in the panel below it does not. The step rail drops its labels and
  keeps its 44 px markers — the step it points at is already spelled out one line above it in the
  card's eyebrow. Measured after: **365 px of scroll port** at 390 × 844, with Step 6's action
  inside it.
- Fixed: **`.card__nav` clipped "Next" off the card's right edge between 768 and ~1000 px.** The
  wizard sits on its 340 px floor there and hands the card 193 px; the footer wants 261. It wraps
  now. Raising the wizard's clamp would have paid for the footer out of a 3-D pane already down to
  428 px. `.card__eyebrow-row` wraps for the same reason ("Practice problems" clipped at 272/280).
- Added: **a phone in landscape puts the panes back in columns.** Stacking assumes height is the
  axis with room in it; at 667 × 375 it hands the solid a band and the card a slot. Under 768 px
  wide AND 520 px tall the layout is the desktop relationship at phone scale, with the 88 px
  nav-button floor dropped so the footer fits on one line.
- Added: touch targets gated on `@media (pointer: coarse)`, not on a breakpoint — a touch laptop
  at 1440 px needs the 44 px floor and a phone with a stylus does not lose it at 360. Lifts
  `.btn--ghost`, `.compare-chip` and `.field__num`; pads the inline glossary terms, which sit in
  running prose and cannot take a 44 px box without opening holes in the paragraph.
- Fixed: **the "Best experienced on desktop" banner painted over the sim.** It is fixed-position
  and covered the top 66 px of a 287 px viewport — including the drawing sheet's title bar and the
  Minimize button in it. `main.js` measures it (the copy wraps to two lines at 320 px and one at
  767 px), sets `--notice-h`, and `body.notice-up` reserves the space; Dismiss hands it back.
- Added: safe-area insets where content meets an edge — the wizard's bottom, which sits under the
  home indicator, and the banner's three edges.
- Added: `verify/interaction.mjs` section 9, which drives the emulated device rather than reading
  the stylesheet. The failure it replaces was arithmetic, and a check for "is there a mobile
  breakpoint?" passed the broken layout. It measures the scroll port, whether Step 6's action can
  be scrolled to inside the card, how many panes paint, and every control's effective hit box
  (44 px `::before` hit areas and checkbox labels counted as the target they are) — then repeats
  it in landscape and re-checks the 768 px band for clipping.
- Not changed, and a correction to the critique that prompted this: `prefers-reduced-motion` DOES
  govern the Three.js tweens. `src/anim.js` checks it and lands a tween on its final value
  immediately, and every camera swing and curve trace goes through that one helper.

## 2026-08-04 (f) — One loud action per step; messages retire with their step (ADR-121)

- Fixed: **Step 4 carried two identical blue "Next" buttons** a few hundred pixels apart, one
  walking a stage of the proof and one leaving the step and abandoning it. DESIGN.md §5.1 already
  says "Primary: the one loud action per step", so this was documented drift, not a judgement
  call. The proof stepper holds the accent while the proof is unwalked, because walking it IS the
  step; once the proof completes the loud action becomes moving on and the accent goes to the
  wizard's Next, while the finished proof button hands it back rather than sitting there as a
  disabled blue button beside a live one.
- Fixed: **Step 6 stacked two full-width primaries.** The exercise keeps the accent; the library
  link is loud only when it COMPLETES something. Mid-problem "Complete & next problem" is the
  payoff and takes it back, but in free play "Pick a problem" is one of three routes to the same
  library. The base `.btn` was already the system's secondary treatment, so demoting is removing a
  class, not inventing a style.
- Fixed: **a step change retires the message slots.** The flow note and the onboarding chip each
  hold for 4.5 seconds, which outlives a learner pressing Next twice in three seconds — and Step
  2's note ("Aim it, then tick Cut the cone") names a control Step 3 does not have, on a cone that
  is already cut. Nothing is lost by going early: `markSeen` fires when a spotlight is SHOWN, so a
  learner who moved on inside the hold had spent their one showing either way.
  *(Correction to the critique that prompted this: it reported the chip as persisting across steps
  and the note as going stale. Both auto-dismiss after 4.5s; the true defect is narrower — they
  are not retired BY a step change, so only a fast learner sees the wrong instruction.)*
- Changed: **uppercase is for labels, not sentences.** `p#proof-stage` set 32 characters of
  "STAGE 1 OF 7 · THE CUTTING PLANE" in capitals. It is a counter AND a title, so only the counter
  keeps the label treatment and the stage name is set in sentence case beside it — `textContent` is
  unchanged, so the proof oracles still match on it. Two dock group titles running to 43 and 34
  characters became "Focus and directrix" and "Why the curve changes".
- Changed: **cut content announces itself.** `.card__scroll` gained a paper-to-transparent fade at
  each end. Step 1's hint ended mid-sentence at the fold with nothing to say there was more, and
  the floating scrollbar pill only appears on hover. Pure paint, no layout.
- Added: oracle section 8 counts VISIBLE, ENABLED primary buttons per step rather than checking one
  button's class — a class check would pass a second primary added elsewhere on the panel.

## 2026-08-04 (e) — The sheet is docked beside the solid, not floated over it (ADR-120)

- Changed: **Steps 4 and 6 dock the drawing sheet beside the cone instead of floating it over.**
  Both steps relate a solid to its drawing, so both are subjects; the sheet was a 420 x 320 card
  absolutely positioned on the top-right quadrant of the box the camera had already framed the
  cone into. Step 4's copy says "Watch the cone" while the card covered the apex the focal sphere
  is inscribed at, and Step 6 asked the learner to read a cut the card was sitting on.
- The viewport now ALLOCATES space to both panes rather than letting one take it, using the same
  idiom `body.drawing-main` already uses — two absolutely-positioned boxes, each with its own
  inset — except the boxes sit beside each other. Scoped inside `#sim-viewport` rather than
  reusing Compare Mode's body-level split, because that one collapses the wizard and a guided step
  that hides its own step card strands the learner.
- Structural at the breakpoints, per the product register: two columns at 1100px and up, stacked
  rows at 768-1099px, and **the float is deliberately kept below 768px** — docking there hands the
  solid a 44px sliver, which is worse than a partly-covered one, and that width is already met
  with "Best experienced on desktop".
- Unchanged: Step 5's workspace grid, Compare Mode, Switch view, Minimize/Restore, every
  construction and every coordinate. Minimize now returns the sheet's column to the solid rather
  than leaving a hole where the sheet was (541px to 964px, measured).
- Fixed: the viewport's floating notes centred on the whole bench, so the note reading "the same
  outline drawn on paper" ran underneath the paper it named. They centre on the solid's column now
  and drop below the Compare cluster's row.
- Fixed: captions hang SIDEWAYS further than they hang up and down — "Axis", "Directrix, DD", the
  dimension strings. A square-ish pane hides that because height binds the scale first and leaves
  width to spare; a tall narrow one does not, and "Axis" clipped at the pane edge on the first
  frame. The horizontal margin carries a few characters' worth of extra room now; the vertical one
  is unchanged.
- Added: oracle section 7 measures the two panes' overlapping AREA rather than checking a rule — a
  rule-based test would pass a layout that merely moved the float somewhere else. **0 px² overlap**
  at 1440, 1024 and 900, and the sheet gains a full-height column (781px against 320px), which
  raises its px-per-mm.

## 2026-08-04 (d) — Open on the given data; a drafting vocabulary (ADR-118)

- Changed: **every construction opens on its GIVEN DATA, never on its answer.** Step 5 showed the
  finished figure on arrival, which put the answer on the paper before the question and made
  "Draw it step by step" look like it began from the middle. `setupStageFor()` names the stage
  each construction starts at, applied on entering Step 5, on asking for a construction, and on
  Reset. Measured: the oblong opens at 2,768 inked px and finishes at 10,105.
- Changed: the opening stage is **per method, not uniformly stage 0** — that is the substance of
  it. The concentric method's two circles ARE its auxiliary circles, so it opens on the axes and
  the centre alone; the four-centre method starts swinging arcs at stage 1, so it waits too; the
  oblong, rectangle and parallelogram methods are handed their frame; the arc method is given
  both foci and the constant sum; the tangent method is given its base and abscissa and nothing
  else; the focus-directrix construction is given an axis, a directrix and a focus. Opening
  everything at 0 would have shown the oblong method a bare pair of axes and called that the
  given data of a rectangular construction.
- Fixed: **re-picking the construction already selected now clears the paper too.** Keying the
  reset on "did the method id change" left the finished drawing sitting there in exactly the case
  a learner means *start this one* — pressing "Ellipse" with the ellipse already up, or choosing
  the same method again. It keys on the request now.
- Changed: the dock's invitation follows the sheet — "The given data is set out, ready to
  construct from. Press the button to draw it one line at a time."
- Changed: **three weights of line, one dash vocabulary.** Working lines sit a shade back from the
  given frame they are drawn inside (`axis` full strength, `construction` 0.82, `projection`
  0.5) — same ink throughout, since this is line WEIGHT, the drafting variable, not a second
  palette. Six ad-hoc dash patterns had accumulated and none meant anything the others did not;
  there are two now, which is what BIS gives a drawing: the chain line for a centre line and one
  short dash for everything else.
- Changed: captions run the nudge ladder **twice** — first wanting a spot clear of the working
  lines as well, then settling for one clear of the linework that must never be covered. Dropping
  the caption instead would be worse on a figure like the oblong method, where the fan leaves
  almost no clear paper, and the paper halo keeps it readable either way. Plotted points are drawn
  a size up from the marks that merely locate things: a plotted point IS the answer at that spot.
- Added: oracle section 4t proves no construction opens with its curve drawn, none opens on a
  blank sheet, every setup stage is real and short of the last, and the first press after it
  always adds linework — so an opening view cannot quietly eat a construction step. The three
  openings the review named are checked against what is actually on the sheet.
- Unchanged: every construction, every coordinate, the animation order and the mathematics.

## 2026-08-04 (c) — Every step draws its own sheet (ADR-117)

- Fixed: **Step 6 was showing Step 5's engineering drawing.** The sheet's mode said `stage >= 5`,
  so the construction simply ran on into the step that asks the learner to name an unnamed cut —
  a solved drawing sitting beside a question about a solid. It reads `stage === 5` now: the
  construction belongs to the step that builds it, and Steps 1–4 and Step 6 all show the live cut.
- Changed: **Step 6 BORROWS the cut rather than taking it.** `syncSheetToCut()` is split into a
  pure `cutDerivedSheet()` and a `commitDerivedSheet()`; Steps 1–4 still commit, because there the
  cut is the sheet's subject and the proof and the dock read it back, while Step 6 calls only the
  derivation, on every paint. Widening the existing coupling would have been the shorter fix and
  would have written `e`, `curve` and `cutKind` into the sheet — so a learner stepping 5 → 6 → 5
  would have found their construction dialled to whatever the quiz had just dealt. Verified: the
  Step 5 sheet returns **bit-identical** after a round trip through Step 6 and six fresh deals.
- Changed: the Step 6 sheet repaints from `rebuild()`, because the commit is what used to trigger
  a repaint and Step 6 no longer commits. The plane moves under the learner there, so the
  thumbnail follows each dealt cut instead of holding the one it opened on — five distinct
  thumbnails across six deals, and never the construction.
- Changed: Step 6's sheet may draw the cut but not **name** it. Three of §6.1's six cuts are not
  plane conics and their sheets say so in words — "Circle · e = 0 · no directrix", "Isosceles
  triangle · not a curve" — which is right in the taught half and hands over the answer here.
  Those captions are marked, and `drawSheet`'s new `anonymous` option drops exactly them while
  keeping everything the drawing MEASURES. The mark lifts once the learner commits, since the dock
  has said the name by then anyway.
- Added: oracle section 4s proves the naming captions are marked and the plain-conic sheets have
  nothing to withhold, and asserts on the source that the derivation and the commit stay
  separable — merging them back would be silent and would cost Step 5 its state. The interaction
  oracle walks 5 → 6 → 5 against a canvas signature rather than a pixel count, since two different
  drawings can ink the same number of pixels.
- Unchanged: Step 5's layout, Compare mode, Switch view, Minimize/Restore, the animation system,
  every construction and every coordinate.

## 2026-08-04 (b) — One pacing rule everywhere; the properties toggle back (ADR-116)

- Changed: **one pacing rule, applied to every construction** — teach the part that must be
  understood one press at a time, mirror the part that is only its reflection in a single step.
  The question each construction answers is what its unit of understanding is and what its
  reflection is, and a construction with TWO symmetries gets the rule applied twice rather than
  once at the finest grain available.
- Changed: the **oblong method is twelve stages, not seventeen.** Its fan from C is upper/lower
  and its connecting lines are left/right, so each gets three presses and a mirror: C to point 1,
  2, 3 on the upper sides, then the whole lower fan at once; then the left half's connections one
  numbered point at a time — both crossings of that point marked as it lands — then the right half
  at once. No step repeats the one before it. Measured: ~1,360 inked px per fan press then 4,086
  for the mirrored fan; ~1,180 per connection press then 3,574 for the mirrored half.
- Changed: the **tangent method paces its chords the same way** — one per press through the first
  half, then the mirrored half whole. Its stage list is **sized to its division count**, because
  that is on a slider from 4 to 12 and a fixed list would either dead-press at four divisions or
  bunch the chords at twelve. `METHOD_PLAYBACK` entries may now be a function of the conic state.
- Fixed: **"Show its three properties" is a toggle.** It only ever turned the properties ON; the
  sole way back was to nudge some other control, which is exactly why pressing it again looked
  like it had broken the drawing — nothing had put the sheet back. It now closes them, and fires
  the state-change bus so the readout and the button return with the sheet rather than trailing
  it. A pure VIEW toggle: `propsOpen` is the only field touched, so the construction, its stage,
  its dimensions and its tangent all come back because none of them ever left. Verified against a
  fresh independent render of the same construction — **zero differing pixels**.
- Fixed: the tangent method read `dim3` unclamped. That field is shared by every construction
  taking a third given and defaults to 70 — the parallelogram method's included ANGLE — so a
  sheet built straight from the default state drew a sixty-nine-chord construction carrying 138
  numbers. It never reached a learner, since the dock rewrites `dim3` on every method change, but
  a stage list sized from that number made it visible. Both modules clamp to 4–12 now.
- Changed: **drafting legibility, with no coordinate touched.** Captions clear the PAPER behind
  themselves before being set — what a drawing office does with dimension text over hatching, and
  what keeps the oblong's numbering readable where it must cross the fan. Centre lines and the
  marked apparatus join the finished curve as things a caption is nudged off; the dense
  construction fan deliberately does not, because treating every thin line as blocking would drop
  most of the numbering, which is what the halo is for. The nudge ladder gained the diagonals, so
  the extra obstacles cost no captions. Division numbers keep their 1.2× bold, point letters gain
  1.12× semibold, both inferred from the caption text so a construction added later cannot forget.
- Added: oracle section 4r checks the caption weighting against the captions the layouts actually
  emit, and section 4o now walks the tangent method across the slider's whole range, proving the
  stage list and the drawing agree at every division count — the two live in modules that cannot
  import each other, so their agreement is the thing worth proving.

## 2026-08-04 — Hyperbola out of scope; the tangent method's curve is traced (ADR-115)

- Removed: **the three §6.9 constructions of the hyperbola** — foci and difference, ordinate and
  abscissa, asymptotes and a point — with their methodology cards, stage lists and layout
  functions, and the Hyperbola button from "Draw this Curve". Course 1003 Module II teaches the
  hyperbola as a SECTION of the cone and never asks for it to be drawn with instruments.
- Unchanged, deliberately: **the hyperbola itself**. It is still one of Step 3's six named cuts,
  still classified from the live cone by `classifySection()`, still carries its §6.8 vocabulary
  on the terms sheet, and the sheet still draws it from the focus-and-directrix definition
  whenever the cutting plane makes one. Only its CONSTRUCTIONS left.
- Changed: Step 6's problem library drops the hyperbola tier. Three of exercises 12–15 are
  answered with the constructions just removed, so dealing them would set a problem the dock
  cannot express. All fifteen stay in `src/problems.js` verbatim — `ENABLED_TIERS` decides which
  are dealt, and putting `'hyperbola'` back restores all four.
- Fixed: **the tangent method now traces its curve on like every other construction.** ADR-114
  fired the trace on the LAST stage, which is the curve stage for twelve of the thirteen but not
  for this one: its envelope is drawn at stage 6 and its focus and directrix are marked at 7, so
  the curve appeared whole and the trace ran a stage later against nothing new. `stageDrawsCurve()`
  now asks the layout which stage first carries an `outline` item. No per-method table.
  Measured: 9 → 287 → 606 → 874 → 1190 → 1490 → 1544 px across the trace, then holding.
- Changed: **every connecting line of the oblong's first half arrives on its own press** —
  twelve of them, four per division, with each crossing marked the moment the second line of its
  pair lands rather than swept up on a later stage. The right half is still mirrored on in a
  single step. Seventeen stages. Measured: ~600–700 inked px per press for twelve presses, then
  7,700 at once for the mirrored half.
- Changed: **one control on a thumbnail head** — Minimize. Close is gone from both the 3-D head
  and the drawing card's; it collapsed the same thumbnail to the same restore chip.
- Changed: the syllabus tier heading is "Required by the Diploma syllabus", with no star.
- Added: oracle section 4q proves the removal is exactly as wide as intended, and 4p is now
  driven off `METHODS` itself, so "every construction ends with a traced curve" is asked of every
  construction there is — and asserts the tangent method's curve stage is not its last one.

## 2026-08-03 (o) — The curve is traced on, and the oblong's rays arrive one at a time (ADR-114)

- Changed: **one ray per stage on the oblong's left half** — six presses instead of three, so
  every line arrives on its own. The right half is still mirrored on in a single step. Fourteen
  stages.
- Added: **every construction now ends by TRACING its curve on**, at a constant speed, instead of
  switching it on. `drawSheet` takes a `reveal` fraction; outline items are cut short along their
  own path, and each piece's length is measured so a figure drawn in several pieces — the
  four-centre ellipse is four arcs — traces at one steady rate from end to end. Linear, 1100 ms,
  no easing: easing would distort the drawing rate.
- The trace fires on ARRIVAL at the last stage, never on display: switching method or opening the
  sheet still shows a finished drawing finished, and anything that is not "one more stage of this
  construction" cancels a trace in progress.
- Note: ADR-112 declined a *fade* because the sheet renders from a pure stage function. This is
  not a fade — it is a geometric cut returning the same points up to the one the pencil has
  reached, so the layouts stay pure and the animation is one number passed to the renderer.
- Verification: the oracle checks the geometry without a canvas — nothing at 0, exactly half the
  path length at 0.5 with every point still on the original path, the whole of it at 1, for all
  six curve shapes. In the browser the curve's pixel count climbs 257 → 3500 across the trace and
  then holds, with every construction line, label and point still on the sheet.

## 2026-08-03 (n) — The tangent method is built from divisions, and says so (ADR-113)

Parabola tangent method only. Terminology, controls and pacing — geometry untouched.

- Changed: **both names on each given** — "Double ordinate / base" and "Abscissa / axis", on the
  controls and on the drawing.
- Changed: **"points plotted" replaced by the method's own "No. of equal divisions"** (default 7,
  4-12). This construction plots no points — the curve is the envelope its chords touch — so a
  control named for plotted points described the wrong idea. Carried as the method's own `dim3`,
  the existing per-method mechanism, so no other construction is affected.
- Changed: **the shared points slider appears only where a construction reads it.** Five methods
  fix their own division count and the slider moved nothing for them. The oracle works the list
  out by building each construction at two values and comparing, so it cannot drift.
- Changed: **the chords arrive in two halves**, one stage each, as the oblong method's rays do.
  Seven stages to eight.
- Fixed: the double-ordinate dimension text was set outboard of AB — the figure's right-hand edge
  — and ran off the sheet. The analytic bbox measures geometry, not captions, so it is now placed
  inboard.
- Verification: the parabola is identical at 4 and at 12 divisions, to 1e-9 over every sampled
  point.

## 2026-08-03 (m) — Dashed past the centre line, and one half mirrored on (ADR-112)

Rectangular (oblong) method only. Presentation and animation — geometry untouched.

- Changed: **a connecting ray is solid only as far as the centre line**, and the part carried on
  into the opposite half is a thin dashed projection line, breaking exactly on the axis. This
  puts the `projection` role back into service — ADR-111 had left it emitted by nothing, and the
  part of a ray beyond the axis is what it was defined for.
- Changed: **only the left half is walked by hand.** Its three rays arrive one division at a
  time; the right half is then mirrored on in a single step. Thirteen stages down to eleven.
- Not done: the suggested 0-100% fade of the mirrored rays. The sheet is drawn by a pure function
  of the stage index with no per-item timeline, so a fade would mean giving the 2-D renderer an
  animation clock — a rendering-pipeline change this pass was told not to make. The mirrored half
  appears together in one step, which is the requirement.
- Verification: the same twelve crossings, each still on the ellipse to 1e-9; the break asserted
  at y = 0 from both sides; the mirror step asserted to be the exact reflection of the half
  already drawn.

## 2026-08-03 (l) — The oblong method matches the classroom demonstration (ADR-111)

Rectangular (oblong) method only. Sequence and annotation — no geometry, no other construction.

- Changed: **each connecting ray stops at the crossing it makes.** ADR-104 carried them on to the
  rectangle's edge as dashed projection lines; drawn out that was clutter. Not a reversal of that
  finding — the original complaint was that the ray stopped SHORT of the crossing; ending exactly
  on it fixes that without the extension.
- Changed: **the rays arrive one division at a time**, the left half finished before the right
  begins. Six ray stages where there was one; thirteen stages in all.
- Added: **the lower half is numbered too** — same text, same offsets, same styling.
- Added: **C and D are labelled.** The stage text names them; the drawing did not.
- Changed: **the crossings use the concentric method's marker** — the curve's colour at full
  size, the same `plot` role, so the two methods mark a plotted point identically.
- Removed: `exitBox()`, now unused. The `projection` role and its pen stay; the role-coverage
  oracle's orphan check is what protects them if a construction emits them again.

## 2026-08-03 (k) — Compare Mode is driven by the tilt alone (ADR-110)

- Removed: **"slide it past the tip" from Compare Mode.** Which conic a cut makes is the tilt's
  doing; sliding the plane along its normal moves the same curve up and down the cone without
  changing what it is. It stays in the lesson, where Step 3 needs it for the apex cut.
- Added: **a guard for the dead end this opened.** With the slide gone, a plane on the apex gives
  a triangle at EVERY tilt — measured at 0°, 30°, 62° and 80° — and Step 3's triangle chip parks
  it exactly there. Entering Compare Mode lifts the plane clear of the tip when, and only when,
  it is on the apex.
- Fixed: `commitSection()` rebuilds without firing the state-change bus, so the geometry moved
  while the slider and readout kept describing the old plane.
- Fixed: `tourCut()`'s tween could not be cancelled, and each of its frames calls `rebuild()`, so
  under a slow renderer it runs for seconds — long enough for a press to land mid-flight and be
  undone by the tween's own completion. The tour keeps its handle now.
- Verification: the oracle counts VISIBLE sliders (3, not 4) and sweeps the tilt to demand all
  four conics still appear, asking for the parabola by name since it is a single angle.

## 2026-08-03 (j) — Compare Mode builds its own layout, and carries the drivers (ADR-109)

- Fixed: **entering Compare Mode with the thumbnail minimized opened it with no drawing.** It now
  always builds both panes — the lesson's thumbnail state is remembered, cleared on the way in,
  and restored on the way out.
- Added: **one centred control strip beneath both panes** — the cone (width, height, second half)
  and the cut (cut, tilt, slide past the tip). Spanning both columns rather than running down one
  side, styled from the sibling topic `graphics_module_3_topic_2_development_of_surfaces`.
- The controls are MOVED into the strip, not rebuilt: same elements, same listeners, same state,
  so both views updating together is structural rather than something to keep in step.
- Fixed: the rail's `grid-area` had been deleted with its other rules last round, so the strip
  auto-placed into the left column and sat under one pane instead of both.

## 2026-08-03 (i) — Compare is a mode again; Switch view is Step 5's alone (ADR-108)

- Changed: **Compare enters a dedicated comparison mode** — 3-D left, drawing right, evenly
  split — and the button becomes **Back to 3D**. Returning changes only the layout: step, curve,
  construction, sliders and camera all continue.
- Changed: **Compare Mode carries the two views and nothing else.** No lesson sidebar, no docked
  control rail, no rail toggle; the lesson's drivers stay where they are instead of being moved
  into a rail beneath the panes.
- Removed: **Switch view from Steps 1–4.** Before the drawing step a swap has nothing to teach.
  It is Step 5's control, synced from `setStage`.
- Fixed: **choosing a curve in Step 5 now aims the plane at that cut**, so the 3-D reference is
  showing the curve being drawn. It was still showing the previous curve's cut. This does not
  re-couple the sheet to the cut — the drawing keeps its own given dimensions.
- Note: the thumbnail was never a static preview. It is the live WebGL canvas, measured at
  418x318 with the render loop running; what was stale was the scene behind it.

## 2026-08-03 (h) — Step 4 explains where the four names come from (ADR-107)

Step 4 said why the curve changes, never why the curves are called what they are.

- Added: **the four named cuts, in Step 4 too** — built from `sim.sectionTour()` and pressed
  through `sim.tourCut()`, the same catalogue and call Step 3 uses. No second tour.
- Added: **a live eccentricity badge** beside the tilt slider. The value is the real one for the
  cut on the bench (e = sin θ ÷ sin g, ADR-088), not a number looked up from the curve's name.
- Added: **a four-row reference card** — e = 0 · 0 < e < 1 · e = 1 · e > 1 — with the row the cut
  is currently in highlighted, and a sentence per curve that changes with the cut.
- Which of the four the badge names comes from `classifySection()`, the classifier the rest of
  the topic reports with, never from a threshold invented for the badge: the tour's named cuts
  land on whole-degree tilts, so the parabola preset sits at e = 0.996 and a local threshold
  would have had the badge disagree with the readout beside it.
- Verification: the oracle walks all four cuts and demands the badge, the sentence, the
  highlighted row and the chip's pressed state agree, and that the badge's number appears in the
  ratio the step already quotes.

## 2026-08-03 (g) — Compare opens a menu; Switch view swaps (ADR-106)

Seventh review. ADR-105 got the geometry right and left the chrome wrong.

- Changed: **the main view has no title bar and no window controls.** It is the panel; only the
  thumbnail is a window. The head is hidden rather than removed — the same element is the
  thumbnail one step later and needs its controls back.
- Changed: **Compare and Switch view are separate buttons.** Compare opens the menu and changes
  nothing; choosing an item swaps and closes it. Switch view swaps in one press, no menu.
- Removed: **Fullscreen from the thumbnail.** Promoting a view to the main panel now takes one
  press, so expanding a card to a split said nothing new.
- Changed: the thumbnail carries Minimize and Close only, and both leave the restore chip, so
  there is no state a learner cannot come back from.
- **Note:** Fullscreen was the only entry point to the `compare-split` workbench, which is now
  unreachable from the UI. Its code is untouched — retiring it is an architecture decision. Its
  oracle section, which guarded the rail starving the viewport, was re-aimed at the layout that
  ships rather than deleted.

## 2026-08-03 (f) — Step 5 IS Step 4, with the primary view swapped (ADR-105)

Sixth review. Step 5 had become a different interface; this removes it.

- Changed: **the three-column grid is gone.** Step 4 is a full-bleed 3-D pane with the drawing
  floating over it, top-right; Step 5 is a full-bleed drawing with the 3-D floating in the SAME
  rect. Measured at 1584x861: main 1124x805 at (0,0), thumbnail 420x320 at (692,64) — identical
  in both steps, after a swap, and after a minimize/restore.
- Changed: **Compare is a view selector.** It opens the menu and swaps which view is main. It
  never replaces the interface, and there is always a way back.
- Changed: **minimize hides only the floating view** and leaves a chip naming it, like minimizing
  a desktop window. Restoring returns it to the same rect.
- Mechanism: the canvas and its CSS2D overlay now live in a `#view-box` inside the pane, and it
  is the BOX that resizes. Shrinking the pane itself took it out of the flex row, so the step
  panel slid left and the full-bleed drawing covered it — the panel disappeared entirely.
  `handleResize` measures the box, so the renderer follows with no other change, and no
  re-parenting is needed.
- Fixed: the `.view-head` rule was lost in the CSS replacement, so the thumbnail's title bar
  flowed below the canvas instead of anchoring to its top.
- Fixed: the full-bleed drawing sits at `--z-compare` and covered the Compare cluster at
  z-index 4.

## 2026-08-03 (e) — The oblong method mirrors its fan (ADR-104)

Fifth review, of the rectangular (oblong) ellipse. Sequence and visualization only — the
divisions, the intersections and the curve are untouched.

- Added: **the mirrored fan is its own stage.** The construction went from the fan straight to
  the connecting rays, so the lower half was never built and the learner was handed the symmetry
  rather than watching it happen. Eight stages now, and the figure is symmetrical before anything
  else is drawn.
- Added: **each connecting ray is carried on past its crossing**, as a thin dashed light-grey
  projection line across the opposite half. This was the substantive fix: `intersect()` works on
  infinite lines, so the crossing lies BEYOND the axis division at which the drawn segment
  stopped — the visible line genuinely did not reach the point it was said to produce.
- Changed: projection lines are the same construction grey at 0.75 px and half alpha, so the
  sheet keeps one construction grey instead of gaining a second colour. They are clipped to the
  enclosing rectangle, so the analytic bbox — and the sheet scale — never shifts.
- **Fixed a rendering bug this uncovered:** `ROLE_ORDER` did not list the new `projection` role,
  so none of it was painted. It did not list `plot` either, so the points the concentric-circle
  construction plots had been unpainted since ADR-102. Both were invisible in a way nothing could
  catch — the display list was right and the pen table had entries, but the oracles inspected
  layouts rather than pixels. A missing role now fails a test: every role any layout emits is
  swept and checked against what the renderer will actually paint.

## 2026-08-03 (d) — One viewport control, and thumbnails minimize (ADR-103)

Fourth review. Step 5's viewport had four floating controls and a Hide that could not be undone.

- Changed: **Compare replaces all of them.** One button, a two-item menu (Drawing · 3D), and
  picking one makes it the large viewer and the other the thumbnail. Swap views, Reset view and
  Open/Hide drawing are gone — choosing a viewer by name brings the sheet back if it was closed.
  The viewport cluster holds Compare and nothing else.
- Added: **minimize, beside expand and close, on both thumbnail heads.** Minimizing collapses
  that pane's column and leaves a chip naming the viewer it restores. The pane is never
  unmounted; recovery never means leaving the step.
- Added: the 3D pane has a head built from the SAME rules as the drawing card's, so Step 4 and
  Step 5 read as one design language.
- Changed: Compare has one fixed home at the top-left of the bench, instead of riding inside the
  3D pane where it covered that pane's own title bar.
- Fixed: `.cone-first.thumb-min` also matches `.thumb-min`, so the first cut of the minimize rule
  hid BOTH viewers and left the bench blank — the exact failure minimize exists to prevent.
- Fixed: `shown()` in the oracle tested only for a rendered box, and a `visibility: hidden`
  element still reports one — which is why the blank bench passed. It now checks visibility, and
  the minimize assertions demand the large viewer and Compare both survive.

## 2026-08-03 (c) — Step 5's dock becomes a hierarchy (ADR-102)

Third review. The headline report was that problem mode broke the construction.

- **Root cause, and it was not problem mode.** Problems stamp nothing into the sim by design, and
  the construction was measured running correctly under a loaded problem for all thirteen
  methods. Step 5's dock had grown to **2140 px of content in a 588 px scroller**, putting "Draw
  it step by step" ~850 px below the fold; a problem's statement header pushed it 254 px further.
  The learner saw a panel with no playback control and concluded the animation was gone. The
  regression was mine — ADR-100 put the curve picker, the method list and a seven-row methodology
  card above the playback.
- Fixed by ordering and subtraction: curve → method → that method's givens → drawing controls →
  reference; the methodology card moved below the controls that act; controls a construction
  never reads are absent; the why → how hand-over is made once instead of twice. **1952 px, and
  the playback control 508 px down a 588 px panel — visible without scrolling.**
- Changed: each curve opens on its recommended construction, not on focus & directrix.
- Added: Drawing-first / 3D-first modes above the viewer — one grid, two column ratios.
- Changed: the sheet button names the action, with Swap views and Reset view beside it.
- Changed: division numbering a size up and bold; plotted points in the curve's own colour.
- Fixed: reopening the sheet in Step 5 dropped into the workbench split and hid Step 5's controls.
- Fixed: a hidden `.toggle` stayed visible — a class's `display` beats the UA `[hidden]` rule.
- Fixed: the canvas kept a mid-transition width after a pane swap.

## 2026-08-03 (b) — Concentric circles: both circles numbered, crossings named (ADR-101)

Second review with the Engineering Graphics professor. Notation only — the division, projection
and ellipse geometry are untouched, and no other construction was modified.

- Added: **the inner circle is numbered `1'…12'`**, at the same radial positions as the outer
  `1…12`. The method IS the correspondence — a point takes its x from the outer circle and its y
  from the inner — so numbering only the outer one hid the relationship being taught.
- Added: **each crossing is named `P1…P12`**, on the stage that plots it and not before.
- Changed: division captions now sit along their own radius (`radialLabel()`), just outside the
  circle they belong to, instead of at a fixed up-right offset. Captions on the left of a circle
  are pulled back by their own width, since captions draw left-aligned from their offset.
- Unchanged: the finished drawing still carries no numbering of any kind.
- Verification: the oracle checks the CLAIM, not the count — that each k and k′ share one radius
  and sit on their own circles, that Pk is the crossing of outer k with inner k′, that every
  named point satisfies the ellipse, and that no other construction picked up the notation.

## 2026-08-03 — Step 5 becomes the drawing workspace (ADR-100)

Acting on an Engineering Graphics professor's review of the shipped topic. Steps 1–4 and Step 6
are untouched.

- Changed: **the sheet takes the bench.** A new `body.sheet-primary` grid puts the drawing on the
  left at ~67% and the cone on the right at ~33%, with the step card keeping its own column.
  Measured at 1600×900: sheet 707 px · cone 353 px · wizard 460 px. Unlike the workbench split it
  does NOT collapse the wizard — Step 5's dock is where the construction is chosen and stepped.
- Added: **the curve is chosen here.** Three buttons, landing on that curve's first syllabus
  construction. Comparing two constructions no longer means walking back to Step 3.
- Changed: **the construction list is tiered, not trimmed** — "★ Required by the Diploma syllabus"
  first, then "Additional methods", one curve at a time. All thirteen constructions remain.
- Added: **every construction animates its own procedure.** Previously only the syllabus three
  were staged; the other ten drew whole. Ten new stage lists, each gated in its own builder.
- Changed: the methodology card now carries how the method works, its step count and whether it
  is examinable.
- Changed: the step is titled **"Engineering drawing"** and opens by naming the hand-over from
  why the curve forms to how it is constructed.
- Fixed: changing construction left the previous playback timer pending — a stale tick could walk
  the new drawing back to an early stage.
- Fixed: stepping by hand left the caption over the cone describing a stage already left behind.
- Fixed: setting a construction absent from the visible list threw on `selectedOptions[0]`.
- Verification: the oracle now demands of ALL thirteen that each stage is captioned, that a stage
  never removes linework, that the first stage has no curve and the last one does. That caught two
  constructions which dropped their numbered points when the first pair of arcs was struck.

## 2026-08-02 (c) — The sheet draws like a teacher (ADR-099)

- Changed: **the focus-directrix construction opens with one line.** It used to open on "The
  frame" — axis, directrix and focus all at once, none of them introduced. Eight stages now:
  the centre line · the fixed line · the fixed point · where the curve starts · the measuring
  line · finding one point · the whole curve · tangent and normal.
- Changed: **plain words.** "Divide FA in the ratio to find the vertex" became "Split the gap
  between the line and the point in the given ratio. That marks V — where the curve crosses the
  axis." The maths oracle asserts the old jargon is absent and caps each stage at three short
  sentences.
- Added: **the newest line is the bright one.** While a construction is being stepped, the
  linework of the current stage draws at full strength and everything before it at 0.42. A
  finished drawing is never dimmed — `freshFrom` is 0 unless a playback is running.
- Removed: **textbook section references from the badge.** "§6.5.1 / §6.7.1 / §6.9.1" tells a
  first-year student nothing. Kept in the catalogue for traceability.
- Changed: reopening the drawing sheet repaints explicitly, instead of relying on the resize
  path to do it as a side effect.
- **Not reproduced:** the reported bug where closing the sheet left its button dead until the
  learner re-entered the step. Tested on all six steps, with real dispatched mouse events rather
  than synthetic clicks, from both the compact and the expanded close paths: it reopened every
  time, with content, nothing overlaying the chip, no exceptions.

## 2026-08-02 (b) — UI polish against the golden references

Measured against `graphics_module_3_topic_1_sections_of_solids` and
`graphics_module_3_topic_2_development_of_surfaces`, not judged by eye. **The design tokens are
identical and so are the 283 component rules both goldens agree on** — nothing had drifted from
the design system. Every defect was in what this topic adds on top of it.

- Fixed: **the methodology card** was reusing `.measure`, which is built for a label and a
  NUMBER — monospaced, right-aligned, 3 px rows. Prose in that grid reads as cramped, and it was
  being corrected at runtime by four `element.style` writes (a DESIGN.md violation). It has its
  own class now: a label column, a 42 ch measure, 1.5 line-height. **Zero inline style writes
  left in the topic.**
- Fixed: **four raw pixel values** where spacing tokens exist.
- Fixed: **the Engineering Terms panel** was the only bordered box among borderless dock groups.
  It doubled the gap on one side — 24 px between the first two sections, 94 px between the next
  two. It is a dock group now, and the rhythm is 24/24/24 at 1366, 1600 and 1920.
- Fixed: **two layout shifts during playback.** Pause appeared when Play was pressed and pushed
  everything below it down — it is always present now, disabled until there is something to
  pause. The stage narration varies in length, so the readout reserves four lines. Measured:
  nine controls tracked through play → pause, **none moves.**
- Fixed: the syllabus badge wrapped to two lines with "Example 6.3" stranded; it fits one line.
- Verified and deliberately unchanged: the floating drawing-sheet window is rule-for-rule
  identical to the goldens; the single `.vlabel` difference is ADR-087's hover affordance; and
  the `def-tangent` "overflow" a first probe reported is a `position: fixed` tooltip sitting at
  `opacity: 0` — not clipping.

## 2026-08-02 — The syllabus's own three, drawn line by line (ADR-098)

The official syllabus turned up (`../1003.pdf`). Module II scopes this topic to three
constructions and says "only" twice. All three were already correct; none of them could be
watched being drawn — and the one that could was the focus-directrix method, which the syllabus
does not ask for.

- Added: **staged playback for the three examinable constructions** — Ellipse by the Rectangular
  Method, Ellipse by Concentric Circles, Parabola by the Tangent Method — seven stages each, in
  the order of Examples 6.3, 6.2 and 6.8. Same Play / Back / Next, same `buildStage` field, same
  readout: one playback system, four constructions.
- Added: **Pause**, and the dwell raised from 1.3 s to 2.2 s.
- Changed: **point numbering follows the stage**, not the construction-lines toggle. It appears
  with the divisions it labels and goes when the curve is joined.
- Added: a **methodology card** — Method, Purpose, Instruments, Output, one line each — on all
  thirteen. The syllabus's own words for this subtopic are "Methodology and terminology".
- Added: a **syllabus badge** on every construction. Nothing hidden, nothing removed; the ten
  beyond the syllabus carry their textbook reference instead.
- Added: an **Engineering Terms** panel, listing what the current drawing actually contains and
  highlighting a term on the sheet through the same `sheetHover` the cursor uses.
- Changed: Step 5's title and lead now mark the hand-over — "You know WHY the curve is what it
  is. This is HOW an engineer puts it on paper."
- Fixed: switching construction kept the previous method's stage number, so a seven-stage
  construction drew everything except the curve. It lands on the finished figure now.
- Fixed: a bare "C" was captioned "the centre of the curve". It is an end of the minor axis in
  both ellipse constructions and the foot of the abscissa in the tangent method; O is the centre.
  The Engineering Terms panel is what made the error visible.

## 2026-08-01 (h) — Two tangencies, two stages (ADR-097)

The geometry is unchanged again. What changed is that the proof stops asking the learner to hold
two different facts apart on their own.

- Changed: **the ring gets a stage of its own**, before any plane is laid through it. It says
  what it is — the circle where the ball touches the CONE — and why it is a circle: a cone is the
  same all the way round its axis, so a ball touching it at one place must touch at every place
  that far down. No focus marker is on screen to compete with it.
- Changed: **the single point of contact gets the next stage**, opening with "Against the flat
  cut it is different". The contrast is the stage's subject rather than something the learner has
  to infer, and that point is where the FOCUS is named.
- Changed: **the plane through the ring comes third**, and says the quiet part out loud — the
  name "tangent plane" is about the CONE it touches, not the ball.
- The two are separated by colour as well: the ring is the instrument teal, the focus is the plum
  this topic reserves for a conic's own apparatus. Two relationships, two colours, two stages.
- Changed: **the sheet names all five.** The focus is ringed as well as dotted and captioned
  "Focus F" — the chapter's own letter — with "Vertex V", "Axis", "Directrix" and the curve. A
  learner reading "measure PF" no longer has to hunt for F.
- Fixed: the circle's shorter proof ended one stage early after the renumber, stopping before the
  stage that explains why it has no directrix. The end is found by searching for that stage now,
  and the bridge is the last stage whatever its index — a literal index has silently pointed at
  the wrong stage twice.
- Changed: three oracles asserted a six-stage walk; all now walk seven, and `verify/proof.mjs`
  asserts the separation itself — the ring named with no point marker present, the point named
  with the ring's pill withdrawn, and the tangent plane's name explained.

## 2026-08-01 (g) — Tangency you cannot misread (ADR-096)

The geometry is unchanged and re-verified; only the drawing changed.

- Changed: **the tangent plane is an annulus**, its inner edge exactly the circle in which the
  sphere touches the cone. The plane really does meet the sphere in that circle — §6.2 defines it
  that way — so a full quad shows the intersection however it is sorted, blended or offset. With
  the annulus there is nothing inside the ball's silhouette to misread: the ball sits in the hole
  and rests on the rim all the way round. Capped at 1.35 ball-radii wide, so it reads as a washer
  rather than as an infinite sheet.
- Added: **the real one-point tangency, shown where it happens.** The sphere IS tangent to the
  CUTTING plane, at one point — the focus. That stage now hides the full-size plane, draws a
  small square of it centred on the contact point, and marks the point with a pulsing halo, a
  soft glow and the caption "Touches here — one point only".
- Changed: both tangency stages **stand the rest of the scene down** to 0.22 — the cone, its edge
  overlays, the section curve, the removed-material ghost and the axis. At the ring stage the
  focus marker dims to 0.35 and its pill is withdrawn, so the ring is the only thing being
  pointed at.
- Changed: the proof's camera is biased into the free part of the viewport; the drawing-sheet
  card floats over the top right and a centred subject was half underneath it.
- Added: oracle coverage that fixes both claims in place — across four cuts, the cutting plane is
  tangent to the sphere to 1e-9, the tangent plane meets it in exactly the contact ring, and the
  drawn annulus starts at that ring and stays finite.

## 2026-08-01 (f) — Step 4 became a proof you walk (ADR-095)

- Changed: **six stages, one press each.** The cutting plane · the ball and the ONE point where
  it meets the cut · that point named the focus · the ring where the ball touches the CONE and
  the plane through it · the directrix drawn out of the two planes crossing · the hand-over to
  the paper. Back and Next, the same stepper Step 5 uses. No autoplay anywhere.
- Changed: Next is refused while a stage's own animation runs, so nothing can be skipped past
  half-drawn; Back is never refused except at the first stage, and it restores the previous
  stage AT ONCE — a learner checking something should not sit through the reveal twice.
- **The tangent-plane question, settled by measurement.** It looks like it cuts the sphere
  because it does: §6.2 defines it as the plane containing the circle in which the sphere
  touches the CONE, so it meets the sphere in that same circle. On a 30 × 30 cone at 35°, the
  centre-to-plane distance is 0.1895 against a radius of 0.4238, and the circle it cuts has
  radius 0.3790 — exactly the contact ring. They are the same circle. Tangency would require
  sin α = 1. So the fix was the PICTURE, not the geometry: the ring is drawn heavy, depth-free
  and pulsing while its stage is current, the ball dims to half as the plane fades in, and the
  stage says in words that the ball touches the cone in a ring, not a point. The genuine
  one-point contact — ball against CUTTING plane — is stages 2 and 3, marked with a pulse.
- Changed: the sheet's reveal order now follows the solid's: focus first, directrix second.
  Nothing appears on paper before the cone has explained it.
- Changed: the proof leads the Step-4 panel; the tilt slider follows it. Its stepper was below
  the fold when the panel opened with the slider.
- Changed: changing the KIND of section restarts the proof instead of clamping it — sliding an
  ellipse into an apex cut now says the first thing about the apex cut.
- Added: `verify/proof.mjs` — asserts that the step does not advance on its own, that each stage
  shows only its own idea, that Back restores the scene, and that the degenerate cuts get their
  own shorter proofs. It screenshots all six stages, because "does this read as one point of
  contact" is a judgement no assertion can make.
- Fixed: `simAPI.reset()` still cleared the reveal timer the redesign deleted, so resetting from
  Step 4 threw a ReferenceError. Found by the shipped-module oracle.

## 2026-08-01 (e) — The rest of the hyperbola, and the thirteenth construction (ADR-094)

Phases 6 and 7 — the last unticked lines of the audit's coverage matrix.

- Added: **the tangent bisects ∠F₂PF₁** (§6.8), drawn on the from-the-foci construction, which
  is the one that has both foci on the paper. The tangent is drawn AS the bisector, with an
  equal-angle mark on each side, and the oracle checks both that it is the true tangent there
  and that the two angles are equal to 1e-9.
- Added: **the asymptotes cut the auxiliary circle ON the directrix** — four marked points at
  x = a² ÷ c on the terminology sheet, which is §6.8's sentence turned into a place on a drawing.
- Added: **"rectangular hyperbola"** in the results block whenever the asymptotes reach 90°,
  with its eccentricity of √2. The topic had this case as a SECTION (plane EE) and not as a
  curve.
- Added: **the approximate ellipse by four centres** (§6.5 item 8) — the thirteenth
  construction, drawn as four compass arcs with the centres, the join points and the centre
  lines they lie on, captioned "four arcs, not a true ellipse".
- Not added, on purpose: **the circle method** (§6.5 item 7). The chapter lists it and works no
  example, and there is no one procedure that name denotes; supplying one would be inventing
  syllabus, which is the opposite of what this audit asked for.
- Fixed, found while testing: `.dock__group { display: flex }` was overriding the `hidden`
  attribute, so a group hidden from script stayed on screen — the parabola's property block was
  showing beside a hyperbola. The oracles assert rendered height now, not the attribute, because
  the attribute was telling the truth and the page was not.

## 2026-08-01 (d) — The missing names, and the parabola's own three (ADR-092, ADR-093)

Phases 4 and 5 of the roadmap.

- Added: **both auxiliary circles are named** on the terminology sheet, with §6.4's major
  diameter and minor diameter. They were drawn and uncaptioned before — a term the learner can
  see, cannot name and cannot look up.
- Added: **conjugate diameters**, drawn as the pair at t and t + 90° (which is exactly §6.4's
  "each parallel to the tangents at the extremities of the other") and named. They are what the
  parallelogram construction is given, so a learner meeting Example 6.4 had been shown its input
  nowhere.
- Added: **"central conic"** — the chapter's own phrase for what having a centre means — on the
  hover explanation of the ellipse's and the hyperbola's centre captions.
- Changed: the terminology sheet gets a wider margin than the constructions. Its captions are
  the longest in the topic and "Auxiliary circle · minor diameter" was running off the paper.
- Added: **§6.6's three properties of the parabola**, drawn one at a time from Step 5 and only
  while a parabola is on the sheet — the box with the curve's own region hatched (area = ⅔), the
  focal chord whose tangents meet on the directrix at 90°, and any other chord whose tangents
  meet on the diameter that bisects it. Every one is exact, so the figure is the proof.
- Added: the chapter's engineering applications, in one sentence beside that button — a headlamp
  reflector, a solar concentrator, a bridge arch, the path of anything thrown.
- Fixed, in the making: the property figure was first drawn opening sideways, which made it
  taller than the landscape card and dropped every caption on it below the sheet's 1.3 px/mm
  size gate. It is drawn upright and sized to clear that gate. A first version also marked a
  point at t = 2.2 on a curve plotted only to t = 1.8 — a claim about a point the drawing did
  not contain.

## 2026-08-01 (c) — The sheet became a worksheet (ADR-091)

Phase 3 of the roadmap: wherever the chapter asks the learner to measure, determine, find or
locate something, the simulation now reports it.

- Added: **"What the drawing gives you"** at the foot of Step 5 — every quantity the current
  construction yields, with the value and the drawing's own lettering for where it is read
  ("VV′", "at the centre O", "F₁ and F₂"). An ellipse reports its major and minor axes, its
  focal distance, its eccentricity and its latus rectum; a parabola its focus, its directrix and
  its latus rectum; a hyperbola its transverse and conjugate axes, its foci, its directrices and
  **the angle between its asymptotes** — which is what exercise 13 asks for in as many words.
- Fixed: the parallelogram method reported the conjugate diameters it was GIVEN. Exercise 4 asks
  for the axes, which are different numbers: 150 × 108 at 70° yields 157.6 × 96.6. They are
  derived now, from the same `principalAxes()` the drawing already used.
- Added: `focalOfAffine()` — the focal distance of the parallelogram method's oblique parabola,
  re-based on the diameter whose tangent is square to it. Reporting a focus for that curve
  without it would have been a guess.
- Added: the asymptote construction reports the constant product QS × QW its whole method rests
  on, and names the **rectangular hyperbola** when the two asymptotes come to a right angle.
- Added: oracle coverage that checks the numbers against the DRAWING — the reported major axis
  against the drawn curve's longest chord, the latus rectum against 4·VF, a² = b² + c² at every
  ellipse construction, and exercise 1's own 30 / 20 / 120 mm read out of the results block.

## 2026-08-01 (b) — The sheet draws what the cut IS (ADR-090)

Phase 2 of the roadmap: the two correctness defects the audit found, where the 3-D pane and the
drawing sheet described different things.

- Fixed: **a flat cut now draws a true circle.** The sheet used to clamp the derived
  eccentricity to the slider's floor of 0.2, so section plane AA showed a circle on the cone and
  a visible ellipse on the paper. The circle sheet draws the real radius the cone has where the
  plane crosses it, marks the centre, and states what the focal sphere has just shown — the
  centre and the focus are the same point, and the directrix is infinitely far away.
- Fixed: **a cut through the apex no longer draws a curve.** §6.1 item 6's isosceles triangle is
  drawn as itself: two generators and the chord of the base between their feet, both dimensioned.
  A plane through the apex flatter than the generators touches the cone at one point and nowhere
  else, and the sheet says so rather than inventing a section.
- Added: a sheet for the plane that misses the cone entirely — "nothing is cut" — instead of
  holding the last curve it had.
- Changed: `syncSheetToCut()` moved into `rebuild()`'s tail and every other call site was removed.
  Two of the four cases can only be settled once the clipper has reported whether the plane hit
  anything, so a caller that synced before the rebuild read the previous frame's answer.
- Changed: the dock's Step-4 readout and the reveal both branch on the same `cutKind`, so the
  words, the solid and the paper cannot disagree. The vocabulary block stays shut for a cut that
  produced no focus and no directrix to name, and the circle's reveal ends on the cone — at the
  two parallel planes that are the reason it has no directrix.
- Added: oracle coverage — the maths oracle checks the circle sheet draws exactly one circle at
  the given radius and no conic outline, that the triangle sheet draws three straight sides with
  two equal, and that both degenerate messages appear; the interaction oracle drives the tilt to
  0° and the offset to the apex on the live page and reads the dock back.

## 2026-08-01 — Where the focus and the directrix come from (ADR-089)

Phase 1 of the syllabus-audit roadmap: §6.2 items 1–4, the chapter's own bridge from the solid
to the curve, which this topic had skipped entirely.

- Added: **the focal sphere, on the cone, inside Step 4.** "Show me why" now opens with a ball
  swelling inside the cone until it touches the cone all the way round and just touches the cut;
  it meets the flat cut in a single point; that point is named the **focus**; the ring where it
  touches the cone appears with the flat **tangent plane** that holds it; and where that plane
  crosses the cut is named the **directrix**. Only then does the sheet measure PF and PQ with
  them, exactly as §6.3 does.
- Added: `focalSphereFor()` in `src/conicData.js` — pure, no THREE, solved in the V.P. because
  the cutting plane is always perpendicular to it, so the whole construction is 2-D. It returns
  `null` for the apex cut, where no inscribed sphere exists, and a null directrix for the
  circle, where the two planes are parallel — and the reveal says so in as many words, which is
  the most honest explanation of e = 0 in the topic.
- Changed: the reveal is **one sequence of ten stages** across both panes, and the readout says
  which pane each stage is in — "4 of 10 · The focus (on the cone)". `conicState.focalStage`
  walks the first act, `locusStage` the second; a cut with no sphere falls back to the five
  sheet stages rather than pretending.
- Changed: the first act gets its own camera pose (`faceTheFocalSphere`). Step 4 arrives facing
  the cut square-on, which is right for reading the curve's true shape and useless for watching
  a sphere descend into a cone.
- Changed: the apparatus is drawn in the projection teal used nowhere else here, so it reads as
  an instrument the way the crimson cutting plane does; the focus and the directrix are drawn in
  `--color-conic-mark`, the sheet's own focus/directrix colour, because they are the same two
  objects the sheet is about to use.
- Changed: `attachLeaders()` extracted from the Step-1 anatomy labels, so Step 4's two pills get
  the same leader lines and terminating dots. One pair of buffers is correct because the two
  steps' labels never coexist.
- Added: oracle coverage for all of it — `verify/conic-math.mjs` measures PF ÷ PQ at the real
  section's vertices against §6.3's eccentricity (worst error 3e-15 across seven cases);
  `verify/interaction.mjs` walks the ten stages and reads the Focus and Directrix pills out of
  the live DOM; `verify/shipped-module.mjs` rebuilds the apparatus 40 times and holds the GPU
  buffer count flat.

## 2026-07-31 (b) — The cut is real, and the two panes became one model (ADR-088)

- Added: a **“Cut the cone” checkbox**, the reference topic's own interaction
  (`graphics_module_3_topic_1_sections_of_solids` `#tgl-section`). Unticked, the double cone is
  whole and the translucent plane still passes through it — tilting and sliding stay live, because
  that is how you aim a knife, and the readout says what this cut *would* leave. Ticked, the
  clipper runs. Steps 3 onward tick it themselves; Step 2, where cutting is the lesson, leaves it
  to the learner.
- Changed: **the cone is now truncated for real**, superseding ADR-085. Each nappe's geometry is
  swapped for the clipper's result and its cap becomes material group 1 in the section token — the
  reference topic's pattern — so the section face is a real face of a real solid: lit like the rest,
  depth-sorted like the rest, visible from every angle. The old translucent-cone-plus-floating-cap
  arrangement made the face read as a stain and cost correct depth sorting.
- Added: a faint **ghost of the material the cut removed**. ADR-085 kept the solid whole because
  truncation hides the nappe a hyperbola needs; the ghost answers that instead — at a steep tilt
  the kept half is otherwise a stump no learner would call a cone, and the second branch leaves
  with the nappe that carried it. §6.1's own pictorials still read.
- Fixed: the edge overlays are now built AFTER the cut (a truncated nappe has a different
  silhouette), and the axis centre line is measured from the geometry that survived instead of
  hanging in the space where the removed material used to be.
- Added: **the sheet draws the curve of the live cut.** `e = sin θ ÷ sin g` from the plane's tilt
  and the cone's own generator angle, so reshaping the cone or moving the plane moves the curve on
  the paper, and Step 3's chips morph the drawing as the plane travels. The link holds for Steps
  1–4; from Step 5 the chapter's exercises give *e* and the focal distance as data, so both become
  the learner's own dials there.
- Changed: **Step 4 now answers “why is THIS curve different”** in the learner's own numbers — “Your
  cut: 30° against a side that slopes 63° — the ratio is 0.56.” Its driver is the tilt of the cut,
  not an abstract ratio, and “Show me why” reveals the answer in five stages: the curve alone, then
  the line it is measured to, then the point it is measured from, then P with its two distances,
  then the ratio. The words *focus*, *directrix* and *eccentricity* stay unprinted until the things
  they name are on the sheet.
- Added: **the drawing sheet explains itself.** Pointing at any element names it in one sentence and
  rings it on the canvas — ten distinct explanations on the general construction alone. The
  vocabulary is matched on the caption the engine itself drew, so a labelled element with no
  explanation is a detectable defect.
- Added: “Show the construction lines” (hiding them takes 44% of the ink off the sheet) and a
  manual **‹ Back a line / Next line ›** stepper beside the playback, for re-reading one line the
  playback went past.
- Fixed: **two of the fifteen textbook problems were unsolvable.** They are given a focus-to-
  directrix distance of 40 mm and 54 mm, and the redesign had removed the control that sets it.
  The eccentricity and the focal distance are both back, in Step 5 where the constructions and the
  library live.
- Fixed: every problem hint still directed the learner to the OLD eight-step layout (“In Step 6
  choose…”, “In Step 3 set the eccentricity…”). All fifteen now point at Step 5.
- Fixed: the expanded sheet's controls hugged the rail's left edge — this topic's two docked groups
  used 775 px of a 1392 px rail and left 617 px of dead space. They now share the rail on an equal
  flex basis, centred: two 560 px columns using 1144 px.
- Fixed: the locus sheet was framed from the axis's far end, so as *e* approached 1 the curve
  collapsed to a few millimetres in a card of empty paper — and dropped below the labelling
  threshold, silently stripping its captions. It is framed from the drawn curve now.
- Changed: the first-seen drawing-sheet chip no longer names the focus and the directrix — it can
  appear at Step 1, four steps before those words are introduced.
- Added: `verify/interaction.mjs`, the fourth oracle — the cut is the learner's and visibly makes
  one, the sheet follows the cut, Step 4's answer arrives in stages with its vocabulary held back,
  and the sheet explains itself under the cursor.

## 2026-07-31 — Labels become drawing annotations; the axis is drawn to convention (ADR-087)

- Fixed: the axis was invisible. It was a dashed line inside an opaque solid, so §6.1's central
  term could not be seen at all. It is now drawn as a proper centre line — a chain-line stub where
  it projects past the outline, and the concealed run as short-dash hidden linework rendered
  `depthTest: false` so it reads THROUGH the cone — and it is present whenever the cone is, because
  it is part of how a cone is represented, not a Step-1 annotation. Both use the platform's own
  constants (Foundations' chain 0.34 · 0.12 · 0.07 · 0.12 with 0.35 overshoot, Module 2's hidden
  0.12 / 0.08) rather than a pattern invented here, and both are explicit segment geometry.
- Fixed: labels floated. Each is now an annotation — a pill, a leader line, and a dot on the
  feature — and the pill is offset along the CAMERA's right/up axes and recomputed each frame, so
  it stays clear of the silhouette at every orbit angle instead of swinging across the solid.
  Overlaps are resolved and the pane's edges enforced after the CSS2D pass, only when the view has
  moved. The "Axis" leader is the one drawn through the solid, because the centre line it points at
  is.
- Fixed: "Lower nappe" survived the disappearance of the upper one. Both nappe labels now leave
  with the second half — the word means nothing without the double cone on screen.
- Removed: the "Apex angle 53°" pill. Step 1 teaches apex, base, axis, generator and nappe; the
  slope is stated in plain words in the readout, where it does not compete with the geometry.
- Added: hover explanations. Resting on a label for ~1.2 s (or tabbing to it) gives one
  plain-English sentence — "The imaginary centre line the cone is built around." A passing cursor
  never triggers one, and the camera drifting to a stop under damping no longer cancels a hover the
  learner is still holding.
- Fixed: the §6.4 nomenclature figure piled a dozen captions round one ellipse. The sheet now
  measures every caption, tries it where authored, steps it along a ladder of alternatives, and
  drops it only if all are taken — in priority order, with the finished curve treated as an
  obstacle, so a name is nudged off the answer curve the same way it is nudged off another name.
- Changed: the term popovers were rewritten in plain English. "Drop a sphere into the cone until it
  touches the cutting plane" became "The fixed point every point on the curve is measured from."
  Terms are introduced gently in the copy too — "the sloping side is called the generator".
- Removed: three pieces of duplicated copy — Step 3's and Step 6's group notes each restated their
  own step lead word for word, and Step 5 explained twice why a draughtsman cannot trace a cone.
- Fixed: Step 3 never printed the name it had just travelled to. Its readout led with the plane's
  letter and then repeated "Section plane" from the rule; it now reads "Ellipse (section plane BB).
  …", which is the step whose whole job is to attach names.
- Fixed: Step 5 narrated "6 of 6 · Tangent — …" before the learner had pressed anything. The sheet
  boots on the finished construction, so there was no stage to be on; it now invites the playback
  and reports stages only once they are being drawn.
- Fixed: the cut face was called "pink" in two places. It is crimson (`--color-section-face`).
- Added: `verify/annotations.mjs`, the third oracle — the §6.1 vocabulary and nothing else, a
  sentence on every label, zero overlap and zero spill across five orbit poses, the hover delay,
  and both nappe labels leaving with the geometry.
- Fixed: `verify/shipped-module.mjs` asserted the chip tour after a fixed 2.5 s sleep, which failed
  about one run in two under SwiftShader while the product was behaving correctly. It now polls for
  the result.

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

