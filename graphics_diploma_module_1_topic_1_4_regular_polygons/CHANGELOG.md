# Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)

Per-module changelog, per this repo's own rule (root `CHANGELOG.md` header, `RULES.md` §8.2).
Root `CHANGELOG.md` covers repo-wide entries; this file covers only this module.

## 2026-08-11

- Fixed: `.construction-picker__item` (Step 1) and `.method-switcher__btn` (Construct step) had
  no `:hover` rule despite both declaring a `transition` for it — the two most-clicked controls
  in the wizard were inert until clicked; added gated hover (root DESIGN.md §5.10), mirroring
  the existing `.wizard-toggle:hover` pattern, skipping the already-selected button on each.
- Fixed: focusing `#btn-play-all` and pressing Space advanced a Step Through slide instead of
  playing the full animation (`#step-through`'s keydown handler excluded only `#btn-step-back`);
  Play All now excluded too, matching its Enter-key behaviour.
- Changed: Corrected ADR-155's default-view fill percentages in `src/main.js`, this folder's
  `DESIGN.md` §7, and root `DECISIONS.md` — they describe fill of the square 200×200 viewBox, not
  of the rendered viewport, which `xMidYMid meet` letterboxes to a 0.75–1.5 aspect (never the
  ~2:1 a first read implied); largest-config figure corrected 95%→92%. No behaviour change.
- Changed: Documented `separateCoincidentLabels()`'s raw-vs-scaled coordinate-space gap
  (`chromeScale`/`calibratedScale` mismatch) in its header comment, with the measured worst-case
  margin (11% tighter at large side/n) and why it doesn't currently cause an overlap. No
  behaviour change.
- Fixed: Play/Play All animation had no time ceiling (every construction's default ran 22–37s,
  N-Gon/Semicircle Division at n=12 ran 75.6s) and no in-flight signal — the button stayed
  "Play construction"/"Play All" throughout, and a second click silently cancelled and restarted.
  `playSteps()` now caps any one call at a 20s budget (Step Through's own per-slide pacing is
  practically unaffected — only two slides at n≥11 also exceed the budget on their own and get
  the same mild compression); both Play buttons relabel to "Skip to end" while playing and jump
  straight to the finished drawing on click. See ADR-159.
- Fixed: Play All set Step Through's slide counter/caption to "fully drawn" the instant it was
  clicked, not when the drawing actually finished, so Next disabled and Back enabled while slide
  one of the animation was still on screen. Step Through now shows "Playing all steps…" with
  Back/Next both disabled until Play All's animation genuinely completes.
- Fixed: the Construct step's five recent additions (method switcher, step note, Step Through,
  Play All, replay hint) all sat at the same flat 12px gap and the same grey text register, so
  they read as one undifferentiated stack — one layout pass (Phase A U8–U12): a three-tier
  spacing rhythm (8px same-control / 12px alternate-action / 16px between-widgets, no new
  tokens), `#step-lead` promoted to body ink so it outranks the concept blurb below it,
  `.construct-actions`' wrongly-centring `align-items` deleted so the replay hint reads as
  left-aligned card prose, and Step Through's caption drops its accent-soft wash at rest
  (previously just restated the button under it) and regains it once a real slide is showing.
  See ADR-160.

## 2026-08-10

- Fixed: Problem Library — 6 of 8 problems targeted the exact value already sitting in the
  construction's default params (`defaultsFor()`), so `loadProblem()`'s reset-to-defaults made
  the self-check pass on load, before any slider was touched (RULES §6.2's letter held, its
  intent didn't). Targets restored to the source textbook's own numbers (`Regular Polygons.pdf`
  §5.6): pentagon 45→40 mm, hexagon 35→30 mm, the shared-side problem 35→40 mm, n-gon 30→25 mm —
  every one now differs from its construction's default by more than the ±1 tolerance and
  requires a real slider move to green. Problem ids renamed to match (`pentagon-40-angle` etc.).
  See root `DECISIONS.md` ADR-158; same collision found (not fixed here) in Topics 1.3/1.6/2.4.
- Fixed: the Construct view opened too far zoomed out — the fixed 200×200 default viewBox
  under-filled every config below `calibratedScale()`'s worst-case calibration (Pentagon/Hexagon
  ~65-75%, N-Gon default only ~45%, worst at small side/small n). Default view now fits the
  active construction's own drawn bounds (capped at 1.6× so the drawing still visibly grows with
  side/n, per ADR-145) and re-fits as sliders move, unless the student has manually zoomed/panned
  (ADR-155).
- Added: short K.C. John-cited concept blurb on the Given and Construct wizard phases (all three
  constructions, method-aware in Construct), so a learner sees the idea before the mechanics
  instead of only in Verify's existing "Why it works" (ADR-154).
- Changed: Step Through slide caption drops its "Slide X of Y —" prefix (instruction only now)
  and moves to an accent-soft hint-callout treatment so it reads as primary content, not a quiet
  status line; slide position moved into a small `aria-hidden` mono counter chip on the same row
  since screen readers already get it in prose via `#sim-status`.
- Fixed: N-Gon's Perpendicular Bisector method labelled the AB midpoint "O", the symbol every
  other method reserves for the true circumcentre — the midpoint now stays unlabelled and its
  three slide captions name the centre in words instead (ADR-157).
- Fixed: N-Gon Perpendicular Bisector's point `4` still rendered visibly separated from its dot
  even after the sideways-hint fix below — unlike its now-tight siblings `5`/`6`. Root cause:
  `renderConstruction.js`'s label-collision search treats a compass-constructed point's OWN arc/
  line (the very ink that placed it) as a foreign obstacle, same class of gap as a point's own dot
  needing an explicit exclusion. Two fixes: (1) `assignLabelPositions()` now geometrically excludes
  any arc/line a point's own coordinates lie on (`onOwnArc()`/`onOwnSegment()`, `renderConstruction.js`)
  — generic, no per-call-site changes, fixes point `6` outright and helps vertex letters/division
  numbers/pentagon's apex wherever the same pattern occurs; (2) the four wide compass arcs that
  locate the bisector itself (`buildPerpendicularBisector()`, `constructions.js`) are tagged
  `unobtrusive: true` and opt out of the obstacle set entirely — they're scaffolding no point sits
  ON, only near, so exclusion (1) can't reach them, and they were point `4`'s actual remaining
  blocker. n=6/side=32: point `4` 5.94→4.05, point `6` 4.05→2.70. See `../DECISIONS.md` ADR-153's
  second addendum for the full trace (an arc-only fix was tried first and measured no effect on
  point `4` at all — needed both pieces).
- Fixed: N-Gon Perpendicular Bisector's ladder numbers (`4`, `5`, `6`, … up to `n`) still read as
  floating well past their marker dot after the scale fix below — `buildPerpendicularBisector()`
  now gives each ladder point an explicit small sideways hint (`{dx:-3,dy:0}`) instead of falling
  through to `applyOutwardHints()`'s radial-from-circumcentre default, which pointed every ladder
  point straight at its own neighbour (they're all collinear on the bisector line) and forced the
  label-collision search to escalate outward. Worst-case offset measured 13.2 units pre-fix, 5.94
  post-fix (n=3-12 × 5 side values, 235 checks) — comparable to a vertex letter's own normal
  spacing. See `../DECISIONS.md` ADR-153 addendum for the audit trail (a naive direction-only fix
  was tried first and measured no real improvement; the actual fix needed a smaller base distance).
- Fixed: `src/constructions.js`'s `applyTransform()` scaled every point/line/circle/dim/angledim
  coordinate and magnitude to the construction's frozen on-screen scale except a `'point'` step's
  label-offset hint (`dx`/`dy`, set by `awayFrom()`/`applyOutwardHints()` in raw pre-scale units)
  — left untouched, so it was applied post-scale as if it were already final-space px. Inconsistent
  with `'dim'`'s own `offset`, scaled via the same `tm()` helper three lines down. Follow-up to
  ADR-152 below; see `../DECISIONS.md` ADR-153.
- Fixed: N-Gon Perpendicular Bisector's ladder numbers (`4`, `5`, `6`, … up to `n`) read as
  free-floating text with nothing under them — two independent causes, see `../DECISIONS.md`
  ADR-152 for the full root-cause trace and sweep numbers.
  - `src/constructions.js`: `buildPerpendicularBisector()`'s drawn bisector line previously ran
    only between the two compass-arc crossings (`≈0.366·s` off the midpoint), well short of the
    ladder's own points (`0.5·s` at point 4, up to `1.866·s` at point 12, for every n≥4) — now
    extended to `apothem(topK) + s*0.08` past the midpoint, covering every plotted rung.
  - `src/renderConstruction.js`: `buildStepNode()` now stamps `data-role` on label `<text>` nodes
    (`'point'`/`'dim'`/`'angledim'`), not just their ink — the post-construction fade
    (`index.html`'s `.is-complete [data-role="move"]`) previously faded a ladder's dots and line
    while its numbers stayed at full opacity, detaching them visually. Fixes the same detachment
    for Semicircle Division's division numbers and both constructions' other move-role labels too.
  - Verified via a 336-check headless sweep (n=3-12 × 3 side values × both n-gon methods, every
    labelled ladder/division point on its drawn ink), a re-run of ADR-148's coincident-label sweep
    (0 regressions), and live in Chrome (n=6/n=12, both methods, `getComputedStyle()` confirming
    move-role labels now match their ink's 0.32 opacity post-completion).

- Changed: Step Through's Back button now sits directly beside Next in the Construct step
  (N-Gon only), instead of sharing a row with the slide caption while Next sat full-width below —
  the two halves of one control now read as a pair. Caption moved to its own row above. Also
  dropped `.step-through__back`'s 40px height override, which was under RULES §4.12's 44px
  interactive-target floor; it now matches Next at 44px.
- Fixed: Pentagon "Two Circles + Arc"/"Three Arcs" and Hexagon "Compass + Circle" drew their 60°
  angle marks with no ray connecting A/B to the apex/centre — the arc floated with nothing visibly
  between it and the label. Root cause: `angleDim()` only ever draws the small arc + text, never
  the legs; these three "no protractor" methods never emitted them. Now emit `L(A,…)`/`L(B,…)`
  before the mark, matching the two "angle" methods that already did (ADR-156). Also reworded
  Hexagon Compass's Construct blurb, which had claimed "no rays at all". Separately fixed N-Gon
  Semicircle Division's own angle mark appearing one Step-Through slide before its ray existed.

## 2026-08-09

- Fixed: label/angle-arc/angle-text chrome (font-size, stroke-width, angledim arc radius) read
  oversized relative to the drawn geometry at any param combo below the worst-case ceiling
  `calibratedScale()` freezes on (e.g. the N-Gon default n=6/side=32, vs. its own n=12/side=42
  calibration max) — unlike Module2's Show Method, which stays proportionate because its camera
  re-fits the CURRENT object every rebuild; Regular Polygons has no per-config frame re-fit (a
  deliberate ADR-145 choice, so the drawing visibly grows/shrinks with side/n), so chrome tuned
  to the worst-case ceiling read oversized everywhere else.
  - `src/constructions.js`: new `chromeScaleFor()` — the ratio between the frozen calibration
    scale and the scale the CURRENT params alone would need, floored at 0.5 for legibility.
    Attached as `chromeScale` on every construction's `build()` return.
  - `src/renderConstruction.js`: every persisted chrome constant in `buildStepNode()` (label
    font-sizes, `roleWidth()` stroke, angledim arc radius/stroke, dim arrows/lines, point-dot
    size) now multiplies by `chromeScale`; label-collision measurers (`annoLabelBox`, `labelBox`,
    `dimLabelCenter`, `angledimLabelCenter`) updated to measure at the same scaled size, so
    ADR-148's collision search stays in sync with what actually renders. Transient tool glyphs
    (compass needle/leg, ruler bar) and position hints/offsets deliberately left unscaled —
    out of this fix's scope (size, not position).
  - `src/main.js`: threads `lastRecipe.chromeScale` through all render call sites.
  - Verified live: N-Gon default (n=6, side=32) hits the floor at `chromeScale=0.5` (labels
    halved from their previously-pinned full size); true worst case (n=12, side=42) stays at
    `chromeScale=1` (unchanged). No regression swept across pentagon/hexagon/ngon at min/max/
    default params.

- Fixed: the N-Gon Semicircle Division's "30.0°" division-angle label (at vertex A) sat visibly
  outside its own arc, while the same construction's "120.0°" interior-angle label (at vertex B)
  sat correctly inside its arc — same shared collision-avoidance code, per-instance result.
  Root cause: `angledimCandidates()`'s label-nudge shiftDeg ladder was fixed in ABSOLUTE degrees
  (14/26/40°), blind to each angledim's own angular span. Both labels' natural position collided
  with nearby ink and both resolved to a ±26°/±30° shift — but 26° is 87% of a 30°-wide wedge
  (swings the label almost out of it) versus only 22% of a 120°-wide wedge (label stays inside).
  A smaller, compounding factor: `push` (the radial gap past the arc) was left unscaled by the
  `chromeScale` fix above while `radius` was scaled, so at this case's floored `chromeScale=0.5`
  push became the DOMINANT term for the small 30° arc specifically.
  - `src/renderConstruction.js`: `angledimCandidates()`'s shiftDeg rungs are now proportional to
    the step's own angular span (capped in absolute degrees so a very wide angle doesn't over-
    rotate); `angledimLabelCenter()` and `buildStepNode()`'s angledim branch now scale `push` by
    `chromeScale` alongside `radius` (kept mirrored, per the existing "must match the render
    exactly" contract on both functions).
  - Verified live (hard-reloaded, RULES §2.7): 30° now resolves at its natural `shiftDeg=0`,
    zero rotation swing. Regression-swept pentagon/hexagon/ngon (n=3,6,9,12) at min/max/default
    sides, both ngon methods — no runaway push widening or oversized shifts anywhere.

- Removed: the paper-coloured `stroke` halo behind every label (`paint-order: stroke`, added by
  the ADR-145 fix below for legibility against dense/oversized chrome). Follow-up to the
  chromeScale fix above — now that chrome density around a label scales down with the geometry
  instead of staying pinned to the worst-case ceiling, the halo no longer earns its keep and
  reads as clutter. `index.html`: removed the `[data-layer="labels"] text { paint-order: stroke;
  stroke: ...; }` rule. `DESIGN.md` §5 updated (it previously said "do not remove the halo" —
  now notes it was removed and why). The sublayer-ordering half of that same fix (labels always
  painted after ink, so later ink can't paint over an earlier label) is untouched — still needed,
  independent of the halo. Small enough not to need its own ADR.
  - Verified live, no halo, still legible: N-Gon n=6/side=32 and Pentagon default (side=45).

- Fixed: N-Gon Semicircle Division's division-number and vertex-letter labels collided at every n
  (e.g. `"4"`/`"G"` at n=6, `"3"`/`"F"` at n=5) because division point `(n-2)` and vertex `(n-1)` are
  the exact same coordinate for every n from 3 to 12 (proved algebraically and numerically) — see
  `../DECISIONS.md` ADR-148 for the full root-cause trace and sweep numbers.
  - `src/constructions.js`: new `separateCoincidentLabels()`, run after `applyOutwardHints()` and
    wired into all three raw builders. Groups labelled points by shared coordinate, splits each
    group's labels evenly around the point's own tangent direction, and grows the separation radius
    (checked against a duplicated copy of `renderConstruction.js`'s own label-box model) until every
    pair actually clears — a fixed radius left a residual at n=12 where a 2-digit division number's
    wider box still grazed its letter partner.
  - Verified against `polygon.pdf` (the method's own slide-deck source, slides 8-9): it keeps BOTH
    labels at the shared point, side by side — so this keeps both too, rather than suppressing either.
  - Re-ran the Phase A 51-config sweep: identity-class (coincident-point) collisions 14 → 0, no
    regression in the two other, separately-tracked collision causes (label-vs-ink crowding at
    min-side, digit-vs-digit crowding at high n) — both deliberately out of scope for this fix.
  - Live-verified n=6/side=32 in Chrome via real `getBBox()` on the rendered labels (not just the
    headless estimate) — `"4"`/`"G"` no longer overlap.

- Fixed: five reported Construct-step drawing defects (drawing not centred, inconsistent label
  placement, construction lines never de-emphasizing once the polygon is drawn, overlapping angle
  labels, a scaling bug where the drawing froze while its own dimension label kept climbing) — see
  `../DECISIONS.md` ADR-145 for the full root-cause trace (five defects, three causes) and the
  headless-sweep verification numbers.
  - `src/constructions.js`: every `build()` now derives geometry from a construction-wide
    `calibratedScale()` (fixed once, from the worst-case param combo across every method) plus a
    per-call `centerAt()` recentre, replacing three separate hard-coded anchors + per-shape scale
    ceilings. `applyOutwardHints()` now gives every labelled point a real outward-from-circumcentre
    hint, not just the few call sites that already passed one.
  - `src/renderConstruction.js`: `assignLabelPositions()` now also resolves `'dim'`/`'angledim'`
    labels (previously fixed-position and collision-blind) against a richer obstacle set that
    includes sampled line/arc/circle ink, not just marker dots; a point's own dot is excluded from
    its own candidate search (a real self-collision bug found live-testing this same session — see
    ADR-145). Labels moved into an always-on-top `[data-layer="labels"]` sub-layer with a
    paper-coloured halo. `buildStepNode()` stamps `data-role` on every ink node and the move-role
    auxiliary circle now dashes (DESIGN.md's Two-Cue Rule — it was the one shape missing it).
  - `src/main.js`: toggles `.is-complete` on `#dynamic-layer` once a construction (or Step
    Through's last slide) finishes, fading every move-role element via `index.html`'s new CSS rule;
    keeps `#construction-svg`'s `aria-label` in sync with the active construction/result text.
  - `src/viewTransform.js`: arrow-key pan, `+`/`-` zoom, `0` reset — the drawing was previously
    reachable by mouse/touch only. `index.html`: `tabindex`/`role="img"` + a visible focus ring on
    `#construction-svg`.

  Verified via two headless sweep scripts (`constructions.js` imports nothing, runs directly under
  Node) across all 3 constructions × every method × representative side/n combinations, and live in
  Chrome against the shipped module (RULES §2.19/§2.7 — required a hard-reload mid-session after
  Apache served a stale cached module, exactly the gotcha RULES §2.7 warns about).

- Added: "Step Through" — a click-gated slide navigator for the N-Gon construction's two
  methods (Semicircle Division, Perpendicular Bisector), now the default/primary reveal path
  in the Construct step for that construction only. "Play All" (the existing single-animation
  reveal, unchanged) stays as a secondary button beside it. Pentagon and Hexagon are
  unaffected — no audited slide breakdown exists for their five methods, so they keep today's
  single "Play construction" button; `sim.hasSlides()` (true only when a recipe carries
  slide-boundary metadata) is the feature flag, not a construction-id check.

  Slide captions have two different, explicitly-distinguished sources:
  - **Semicircle Division** is a literal match to `polygon.pdf`, a real slide deck — verified
    against its own pentagon(n=5)/hexagon(n=6)/heptagon(n=7) worked examples, all identical in
    shape (slide count = n+3), confirming one general formula rather than per-n
    special-casing. Captions are near-verbatim from those slides.
  - **Perpendicular Bisector**'s actual source, *Regular Polygons.pdf* Fig 5.24, is a STATIC
    book page (a 9-instruction numbered list for its own n=8 octagon example) — not a slide
    deck. There is no literal PDF slide sequence to match here. Its "slides" are the book's own
    9 numbered instructions, staged as a designed analogue in the same spirit, generalized to
    any n via the existing `nn===3`/`nn>=5`/`nn>=7` branches — do not read this as a faithful
    PDF port the way Semicircle Division's slides are.

  Required a real reorder in `constructions.js`, not just a UI grouping layer over the existing
  step array: `buildSemicircleDivision()`'s vertex loop previously drew each polygon SIDE
  (`L(...,'result')`) the moment its arc found that vertex, interleaved with the arc/label —
  both sources instead defer EVERY side to one final "Join…" step, well after every vertex is
  already found and labelled. Fixed by collecting the deferred `L(...,'result')` pushes into a
  local array during the loop and pushing them all as one block at the end. The identical
  defect existed in `walkVerticesByCompass()` (shared by pentagon, hexagon, AND the bisector
  n-gon method) — same fix, applied once, so pentagon/hexagon's Play All reveal order changed
  too (sides now appear after all arcs instead of interleaved — a deliberate, verified-clean
  side effect, not a regression: both constructions' full Play-All animations were re-checked
  live and read correctly with the new ordering).

  New slide-boundary metadata (`{ caption, startIdx, endIdx }[]`, keyed to the same
  move/result step array both Play All and Step Through already share) is computed once per
  `build()` call inside `buildSemicircleDivision()`/`buildPerpendicularBisector()` via a small
  `mark(caption, fn)` helper — no empty slides are ever produced (a slide with zero steps is
  simply never recorded), the same "never land on a step that draws nothing" principle
  `Module2/src/methodController.js`'s `hasVisibleContent()` protects there, applied here as a
  structural guarantee instead of a runtime scan since this list is precomputed once, not
  walked live across a beat count.

  Cherry-picked from `methodController.js`: flat forward/back index math, and spacebar-as-Next
  (bound to the Step Through container itself, not `document`, so it's a structural no-op
  everywhere else on the page). NOT ported: the Tab-wrap focus-trap / Escape-to-close — those
  exist there because Show Method is a full-viewport MODAL takeover with something to trap
  into and exit from. Step Through is an inline widget inside the existing Construct step
  panel; there is nothing to escape from, and trapping Tab here would block reaching
  Back/Reset in the step-card footer.

  A real bug surfaced during live verification: `revealSlide()`'s first cut cancelled any
  still-animating PREVIOUS slide before starting the new one's tween — correct for interrupting
  stale work, but cancelling an in-flight draw-on tween freezes it at whatever partial `t` it
  had reached, with no way back to its finished `t=1` state (`playSteps()`'s `cancel()` is a
  hard stop, not a "snap to end"). A Next click landing before the prior slide's ~1.8s arc/line
  animation finished left a permanently stuck partial arc behind — reproduced live at n=6.
  Fixed by having `revealSlide()` re-render everything BEFORE the new slide statically (instant,
  via `renderStatic()`) before animating the new slide's own tween, making it correct regardless
  of click timing rather than relying on the student pacing clicks slower than ~2s each.

  `renderConstruction.js`'s `assignLabelPositions()` (previously module-private, called only
  internally by `renderStatic()`/`playSteps()`) is now exported: `main.js` pre-resolves label
  positions ONCE over a construction's full move/result array at `rebuild()` time, cached on
  the recipe, so Step Through's slide-by-slice reveal doesn't leave a later slide's label
  colliding with an earlier, already-drawn one — a slice-local resolve inside a single
  `playSteps()` call can only see that slide's own points. Calling the function twice (once
  globally, once again internally per slice) is safe and idempotent.

  Verified live in Chrome (real foreground tab): both n-gon methods swept across their full
  n=3–12 domain (structural check — slide count, no empty slides, interior-angle marker folded
  into the correct final slide, for all 20 n×method combinations) plus a full visual
  click-through at n=3/6/12 for both methods; Back at every slide index; the rapid-click race
  fixed above; Play All after partial Step Through progress (confirms the two paths' own
  progress state stays in sync, the accepted cost from the original decision); Pentagon/Hexagon
  regression on the shared `walkVerticesByCompass()` reorder (both draw correctly, no Step
  Through row shown); Reset mid-Step-Through via the existing two-state confirm and single
  `simAPI.reset()` path; zero console errors throughout.

- Changed: `calibratedScale()`'s frame margin narrowed 10 → 6 units (`src/constructions.js`) —
  see `../DECISIONS.md` ADR-147, which amends ADR-146. Since the margin is subtracted from both
  the 200×200 frame's dimensions equally, the gain is uniform regardless of which dimension binds
  for a given construction/method: +4.44% linear / +9.08% area, verified against the ADR-145
  39-config sweep (0/39 clip, `unitsPerMm` still constant per construction: pentagon 1.2000 →
  1.2533, hexagon 1.3723 → 1.4333, n-gon 0.8620 → 0.9003). Confirmed no other code depends on the
  old margin=10 literal — `renderConstruction.js`'s label-push "reach" constant and
  `viewTransform.js`'s `ensureVisible()` margin are each independent. Live-verified pentagon,
  hexagon, and N-Gon/Semicircle Division at n=6/side=32 in a foreground Chrome tab, all centred
  and un-clipped.

- Changed: `#btn-finish` no longer requires a solved Problem Library problem in this topic
  alone — reaching the Verify step (step 4) now unlocks it too. Carve-out from the platform-wide
  gated form all 9 Diploma topics otherwise share (`../DECISIONS.md` ADR-078, 2026-07-31
  addendum); explicit user decision this session, recorded as a new ADR-078 addendum, not a
  reopening of that original rationale for the other 8 topics.
  - `src/main.js`: new `verifyReached` flag (kept separate from `solvedAny`/`onProblemSolved()`
    so "solved" still means solved), set by a `MutationObserver` on the Verify panel's
    (`.step-panel[data-step="4"]`) `hidden` attribute. `hasSolvedProblem()` now returns
    `solvedAny || verifyReached`.
  - `src/stepper.js` untouched — the observer watches a DOM node `stepper.js` already toggles,
    so this topic's copy stays byte-identical to its 8 Diploma siblings.
  - Verified live in Chrome: reaching Verify via plain Construct flow (no problem loaded) enables
    Finish; the original problem-solve unlock path still works unchanged; no other topic's files
    touched.

## 2026-08-08

- Fixed: the n-gon "Semicircle Division" method (`src/constructions.js`,
  `buildSemicircleDivision()`) was centred on the wrong vertex. `polygon.pdf` (the authoritative
  source for this topic) centres the semicircle on **A**, extends AB past A to a point C, and
  draws a ray from A through EVERY division point, extended past the arc, each cut by a
  radius-AB arc centred on the previously-found vertex — a distinct construction step per
  division ("Draw a line connecting A and [division]", repeated for 1, 2, 3…), independently
  deriving every vertex past B. The method as it shipped instead followed *Regular Polygons.pdf*
  Fig 5.23's mirrored variant (semicircle centred on B, point P past B), drew only ONE segment
  (division 2 to vertex C) with no ray and no real arc-cut, and fell back to a decorative
  compass-arc mark (drawn at an already-known closed-form vertex, cutting nothing) for every
  vertex after that. Rebuilt A-centred to match `polygon.pdf`: extension point C left of A,
  divisions numbered from B, a ray from A through each division (fixed +4 unit overshoot past
  whatever it needs to reach, not proportional — an earlier proportional overshoot pushed ray
  tips off the top of the canvas for long near-diameter chords around n=9–12), and a real
  arc-cut deriving every vertex D onward. Vertex letters shift to skip C (`A, B, D, E, F…`).
  Verified exact (floating-point noise) against the shared closed-form vertices
  (`regularPolygonVertices`) for n=3–12 at side 25/32/42 — every ray genuinely passes through the
  vertex it claims to cut (inscribed-angle exact for any n: the angle a ray through division `j`
  makes at A is always `j` division-steps, the same inscribed angle vertex `j+1` subtends there).
  Bounds-checked against the 200×140 viewBox across the same sweep (no clipping beyond the
  ~1-1.4 unit tolerance the perpendicular-bisector method's shared scale formula already carries).
  Verified live in Chrome (real foreground tab, not headless): full Play animation frame-by-frame
  for n=6 and n=12, Verify step's result text and "why it works" copy, Reset, method switching,
  pentagon/hexagon regression check, zero console errors throughout.

  A previous pass had rebuilt this method already (see root `CHANGELOG.md` 2026-08-08, and
  `DECISIONS.md` ADR-143) but centred it wrong and additionally recorded — in ADR-143, this
  file's own header comment, and the root changelog — that a ray-cut derivation for every vertex
  was "numerically DISPROVED for n≥7". That claim was false (a ray-origin bug, not a geometric
  limit) and has been corrected in all three places by this pass.

- Fixed: `renderConstruction.js`'s point-label placement had no collision avoidance at all — a
  single unconditional `+4/-4` offset for every label, regardless of how many other points or
  labels were nearby. This was always latent (division numbers and vertex letters at higher n
  already crowd close together) and was made structurally worse by the semicircle-division fix
  above, which adds `n-1` more labelled points per construction; it also included a collision the
  new rays didn't cause — a division-number label and a vertex label landing at the exact same
  coordinate (the semicircle-division method's second division point coincides exactly with the
  vertex it derives), which no single fixed offset can resolve for both. Replaced with a greedy
  candidate-search placement pass (`assignLabelPositions()`) — tries a ring of candidate offsets
  around each labelled point, in order starting from a hint direction, picks the first that
  doesn't overlap an already-placed label or any marker dot — run once per recipe, before either
  `renderStatic()` or `playSteps()`, so a label's position is decided up front and never jumps
  mid-animation. `constructions.js`'s `P()` step builder gained an optional radial-outward offset
  hint (`awayFrom()`) — the semicircle-division method's division numbers now hint outward from
  the semicircle's own centre, and its derived vertex letters hint outward from the circumcentre,
  giving the greedy search an already-likely-clear starting candidate. Verified live in Chrome at
  n=6 (clean) and n=12/side=42 (the worst-case density this sim allows) — resolves the exact-
  coincidence case and the general n=12 crush; one residual light overlap remains among the very
  densest division labels at that single most extreme corner. Also checked for regression on
  pentagon, hexagon, and the perpendicular-bisector method (all share the same render path) — no
  regression, and the bisector method's own previously-crowded ladder labels (4/5/6/7…) benefit
  from the same generic pass despite not having been given explicit radial hints.

- Added: this file. The module had no `CHANGELOG.md` of its own — only root `CHANGELOG.md` had
  been carrying this module's history, against this repo's own per-module-changelog rule
  (root `CHANGELOG.md` header, `RULES.md` §8.2).
