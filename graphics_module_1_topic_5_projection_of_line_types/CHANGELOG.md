# Changelog — Projection of Straight Lines · Types of Lines

All notable changes to this topic. Format loosely follows Keep a Changelog.

## [0.1.22] — 2026-07-25 — Tighter default 3D camera framing

### Changed
- The free-orbit perspective camera's default boot pose — both the transient `CAMERA_POSITION`
  (main.js) and Step 1's `cam` vantage it settles on (`STEPS[0].cam`, lineTypesData.js) — is pulled
  in by the same ~6/7 distance factor as the sibling
  `graphics_module_1_topic_6_projection_of_straight_lines` topic (same direction/target, just
  closer), fixing a line that looked small against a lot of empty HP/VP plane at boot. This topic
  has no aHP/aVP controls, so Step 1's only lever is Length; verified TL never clips at its 200 mm
  typed-field ceiling even at the new closer distance (needs ~24 of the ~28 units available), so
  the clip-aware auto-zoom (ADR-014) has no ordinary-vs-worst-case tension to check here — Steps
  2–6 keep their own already-tuned `cam` vantages, out of scope for this boot-framing fix.

## [0.1.21] — 2026-07-25 — 3D BIS dimension now rolls to face the camera in every view (ADR-081)

### Fixed
- The True-Length dimension's extension/tick marks and filled arrowheads read correctly only in
  the Top quick-view; Front and Side showed a skewed parallelogram with edge-on (near-invisible)
  arrowheads — worse here than in the sibling topic, since this topic dimensions the projections
  (not the space rod), so the Front-view dimension collapsed flat onto the front view entirely.
  Root cause: the dimension's standoff direction was computed once from a fixed world-up vector
  (`cross(rod, worldUp)`), only screen-perpendicular to the rod from directly overhead. Same fix as
  `graphics_module_1_topic_6_projection_of_straight_lines`: `dimensions.js` gained
  `addOrientedDimension`/`orientDimension` — the Type-B geometry is built once in a dedicated
  group's own local frame and that group's rotation is re-driven every render frame to face
  whichever camera is live (free-orbit, Top/Front/Side, or this topic's own reversible fold —
  including the top-view dimension, which rides the folding `hpGroup`). Verified across Steps 1–6,
  the fold, and free orbit; Top is an exact fixed point of the new formula. The flat 2D Compare
  sheet (a fixed square-on ortho camera) was unaffected and left untouched.

## [0.1.20] — 2026-07-25 — Floating Compare card removed; split is now the only shape (ADR-080)

### Fixed
- Resizing the browser while the Compare split was open could strand the 2D drawing panel as a
  small floating "picture-in-picture" window (its own title bar, expand button, close button)
  instead of the docked 50/50 split. Root cause was a one-way narrow-viewport listener (added
  2026-07-19) that demoted the split to the compact floating card below 768px but never re-entered
  the split on widening back past it.

### Removed
- The compact floating Compare card entirely — `applyCompareSize`, `compareSize`,
  `isWorkbenchViewport`, the card's head chrome (tab + expand + close buttons), and the breakpoint
  listener are gone. Compare is now always the docked split, at every viewport width; below 768px
  the same split restacks to a single column instead of switching to a different Compare UI.

## [0.1.19] — 2026-07-25 — Clip-aware 3D camera auto-zoom (ADR-014)

### Added
- The free-orbit perspective camera now dollies back automatically when typed-field values push
  the line past the default frame (the case ADR-079 flagged but didn't fix — grid sizing can't fix
  a fixed camera pose). Ported from Module 2 / Module 1's `reframeIfClipped`, sequenced against
  this topic's per-step `frameStep()` vantage glide so the two movers never race (`main.js`).

## [0.1.18] — 2026-07-25 — 3D reference-plane overrun fixed (ADR-079)

### Fixed
- At high True Length + the ⟂HP/⟂VP steps, the line's endpoint, its view, and labels could run
  off the edge of the 3D HP/VP reference-plane grid. Root cause was two compounding mis-sizings:
  the planes were origin-centred (`PlaneGeometry` at `0,0`) while the drawing only ever occupies
  the first quadrant (end A fixed at `aHP=18, aVP=18`; the resolver's `dy`/`dz` are ≥0), so half
  of every plane's `SHEET=24` extent was permanently dead (real ceiling was 120 mm, not 240 mm);
  and the sizing was measured against the `r-tl` slider max (150) rather than the wider typed
  `n-tl` field ceiling (`uiManager.js` `inputMax` 200) a learner can type directly. `lineTypeRig.js`
  `SHEET` 24 → 32 with a new `PLANE_LIFT = 10` world-space offset (planes now span `[-6, +26]`
  instead of `[-12, +12]`), `GRID.divs` 24 → 32 to keep the 1.0u = 10 mm cell; `referencePlane()`
  gained an `offset` parameter. `labels/LabelPlacement.js`'s `PLANE_HP/VP_ANCHOR` and
  `AXIS_X/Y_ANCHOR` updated to track the new plane edges. `main.js` `SHEET_HALF` 12 → 16 (verified
  unreferenced; kept as a documented constant only). Same fix applied to the sibling
  `graphics_module_1_topic_6_projection_of_straight_lines` topic with its own numbers (SHEET
  24 → 44, `PLANE_LIFT = 16`). `contentBoxWorld()`/`flatSheetBox()` (camera framing) and
  `sheet2DLayout.js` (the separate 2D Compare sheet, ADR-075) were confirmed out of scope and
  untouched.

### Fixed
- The plane-offset fix above left VP/HP flush at the fold line instead of visibly crossing through each other (the tail past the fold line shrank from the pre-fix 12u to 6u); planes are now rectangular (fold-line width unchanged, lift axis grown to `PLANE_REACH + PLANE_OVERHANG`) so they overhang the fold line by 12u again, matching the original look, without reducing the overrun fix's reach (ADR-079 addendum).

## [0.1.17] — 2026-07-24 — sim:ready boot signal

### Added
- `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after
  `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows
  ADR-002). (`main.js`.)

## [0.1.16] — 2026-07-23 — Compare 2D panel gains drag-to-pan + scroll-wheel zoom

### Added
- Drag-to-pan and scroll-wheel zoom (zeroed-in on the cursor, clamped 0.4–5×) on the 2D Compare
  drawing, double-click to recenter/un-zoom — the same interaction Module 2 and the Points topic
  ship (ADR-054/055), re-expressed against this topic's own live ortho camera (ADR-076's
  own-`WebGLRenderer` sheet has no Canvas2D `project()` to hook into) via new `compareSheet.js`
  `resetView()`/`panByPixels()`/`zoomAtPixel()` methods + a `setupComparePan()` wiring in `main.js`
  (ADR-077).

## [0.1.15] — 2026-07-23 — Compare 2D panel's CSS border restored (over-corrected in [0.1.12])

### Fixed
- The split workbench's 2D drawing panel (`#compare-card`) had no visible border at all, unlike
  its `#sim-viewport` and `#workbench-rail` siblings. [0.1.12] mistook the panel's real
  `border`/`border-left: 1px solid var(--color-border)` CSS for a duplicate of the hand-drawn
  canvas rectangle ([0.1.13] correctly identified and removed) and deleted both — but only the
  canvas rectangle was ever the actual leftover; the CSS border was the panel's own legitimate
  frame (same pattern Module 2 uses). Restored `border: 1px solid var(--color-border)` on the base
  `.compare-card` rule so both the compact float and the split view keep it; the split rule no
  longer zeroes it back out. Same correction applied to the sibling
  `graphics_module_1_topic_6_projection_of_straight_lines` topic.

## [0.1.14] — 2026-07-23 — Rail grouped into Dimensions/Inclination; Rotation Method moved to a floating con-dock

### Changed
- The rail's three drivers now cluster under two titled groups — **Dimensions** (True Length) and
  **Inclination** (θ, φ) — instead of one flat row, porting the `.dock__group`/`WORKBENCH_GROUPS`
  pattern from the sibling `graphics_module_1_topic_6_projection_of_straight_lines`.
- The Rotation Method launcher moved out of the rail into a new floating `#con-dock` at the 2D
  drawing panel's bottom-right corner (mirrors `#rail-toggle`'s bottom-left placement on the 3D
  pane), styled to match its chrome and the platform's 0.8125rem/600 floating-pill font.
- The separate "Replay" button is gone — the launcher's own label now swaps to "Replay Rotation
  Method" once triggered, and a click while active replays instead of closing.

## [0.1.13] — 2026-07-23 — Compare panel hairline border: real fix (canvas-drawn frame, not CSS)

### Fixed
- The 2D Compare panel's hairline border was not a CSS border — `compareSheet.js` drew its own
  sheet-frame rectangle in `--color-border` on every commit, a leftover from before ADR-076 gave
  the Compare card its own opaque rounded box. Removed the frame draw (the XY line stays); the
  CSS-only fix in 0.1.12 below verified clean via `getComputedStyle` but never touched this
  canvas-rendered line, which is why the border was still visible. Same fix applied to the sibling
  `graphics_module_1_topic_6_projection_of_straight_lines`, where the bug was first reported.

## [0.1.12] — 2026-07-23 — Compare 2D drawing panel hairline border removed

### Fixed
- The 2D Compare drawing panel's hairline border, in both the compact float and the default
  expanded split view — `.compare-card` and `body.compare-split #compare-card` both carried a
  `1px solid var(--color-border)` (`border` / `border-left`); removed both. This topic duplicates
  the sibling `graphics_module_1_topic_6_projection_of_straight_lines`'s Compare CSS verbatim,
  where the same fix was applied.

## [0.1.11] — 2026-07-22 — Dashed hidden-edge lines tightened to Module 2's visual standard

### Changed
- The dashed projector lines in `lineTypeRig.js` now use the same tight dash rhythm (0.12/0.08) as
  Module 2's Compare sheet instead of the old chunky 1.6/1.0 pattern, restoring platform-wide
  "Simatrix Feel" visual parity between this topic and the master reference.

## [0.1.10] — 2026-07-21 — Own-canvas 2D Compare sheet; ADR-037 floating-card workbench; Rotation Method runs in the split

### Changed
- The 2D Compare sheet (`compareSheet.js`) now renders on its own `WebGLRenderer` + `<canvas>`
  (created lazily in `.compare-card__stage` on first Compare open), a genuinely separate surface
  from the 3D viewport's canvas — replacing the original design where it was a second render pass
  scissored onto the SAME renderer. This let the topic adopt Module 2's ADR-037 floating-card
  workbench (grey `--color-panel` shell, `var(--space-4)` gaps, rounded/bordered cards,
  `#rail-toggle` Hide/Show) instead of the old flush/hybrid split — a shared canvas couldn't show a
  real gutter between its own two scissored halves (ADR-076).

### Fixed
- The Rotation Method construction launcher forced the Compare card down to the compact floating
  PIP even when the 50/50 split was already open, because the split used to hide the wizard that
  hosted its button. The launcher (plus its Replay button) now lives in a `[data-ctrl="rotation"]`
  wrapper that re-parents into the workbench rail alongside the geometry drivers, so it runs inside
  the expanded split like any other control.

### Removed
- `computeRegions()`, the `regions` struct, and the scissored-pass `pass()` viewport helper — the
  render loop no longer scissors one canvas into two regions, so there is nothing left for
  ADR-074's device-px→logical-px conversion to patch.

## [0.1.9] — 2026-07-20 — Intrinsic True-Length scale for the 2D Compare sheet

### Changed
- `src/sheet2DLayout.js`'s `layout2D()` scale now derives from the resolved line's own True Length
  (`M.tl`) instead of the fixed `SHEET2D_SPAN = 150` mm span (ADR-038/ADR-072) — the ADR-053
  intrinsic-size model applied to a line, invariant to the distance and angle sliders, so a typical
  drawing fills the sheet at any True Length instead of floating tiny inside a worst-case-sized
  frame (ADR-075). `rotationMethod.js`'s construction inherits the new scale automatically, since
  both share the one `layout2D()` source.

## [0.1.8] — 2026-07-20 — Fixed 2D-sheet label desync on HiDPI/scaled displays

### Fixed
- The Compare workbench's 2D-sheet labels (`a′`/`b′`/`a`/`b`, dimension values) were offset from
  the WebGL drawing they annotate on any display with `devicePixelRatio != 1` (e.g. Windows 125%
  scaling) — the render loop's scissored passes handed `renderer.setViewport`/`setScissor`
  device-px regions, but those APIs apply `pixelRatio` internally, so the ratio was applied twice
  and the sheet pass drew shifted/clipped while its CSS2D labels stayed correct (ADR-074).

## [0.1.7] — 2026-07-20 — Step-card typography normalized to Module 2 reference scale

### Changed
- `.card__lead` shrunk `var(--text-lead)` (1.125rem) → `var(--text-sm)` (0.875rem), and `.step-body`
  shrunk `var(--text-base)` (1rem) → `var(--text-sm)`, matching Module 2's step-panel size — this
  topic's step copy had been visibly larger than every sibling topic (ADR-073).
- `.step-body p` gained `color: var(--color-ink-secondary)`, so the multi-paragraph step prose reads
  the same grey tone as the lead sentence instead of near-black.

## [0.1.6] — 2026-07-20 — Platform amber promotion + rounded workbench + stale comment fix

### Changed
- `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper),
  matching the sibling `graphics_module_1_topic_6` topic's local override, now promoted platform-wide.
- `body.compare-split` workbench (`#compare-card` + `#workbench-rail`) gained
  `border-radius: var(--radius-md)`; the split grid gained `gap: var(--space-1)` so the rounding
  reads clear of the flush panes.

### Fixed
- A stale CSS comment (`index.html` ~L254) cited a nonexistent `src/labelLayer.js` — corrected to
  the real `src/labels.js`.

## [0.1.5] — 2026-07-20 — Fix: construction-aid token drift vs DESIGN.md §2.2

### Fixed
- **`--construct`/`--locus`/`--tl-green` had drifted from the platform catalog** (`index.html`
  `:root`): `--construct` and `--locus` were mis-aliased to unrelated neutral tokens
  (`--color-ink-secondary`, `--color-bench-grey`) instead of carrying their own catalogued hex, and
  `--tl-green` carried a stale green. All three `*-ink` text variants were missing entirely. Replaced
  with the DESIGN.md §2.2 values verbatim (matching the sibling `graphics_module_1_topic_6` topic):
  `--construct #8a8275`, `--locus #7b4fb5`, `--tl-green #1f8a4c`, plus `--construct-ink #5e564a`,
  `--locus-ink #6a3fa3`, `--tl-green-ink #166b3c`. The Rotation Method construction (Step 6) now
  renders in the correct platform hues instead of the drifted/aliased ones.

## [0.1.4] — 2026-07-15 — Fix: 3D True-Length annotation on the correct projection

### Fixed
- **The 3D TL indicator now sits on the projection that actually reveals true length** (`src/lineTypeRig.js`).
  It was drawn unconditionally along the space rod `AB`, which after the front-on fold always projects
  onto the FRONT-view location — so a line whose true-length view is the TOP view (e.g. Step 5,
  inclined to VP ∥ HP) mislabelled the foreshortened front view as TL. Replaced the single fixed
  `AB` dimension with a rule-based decision using the SAME criterion the 2D sheet already uses
  (`|viewLen − tl| < 0.5`): TL is drawn on the front view when `fvLen = tl` (line ∥ VP), on the top
  view when `tvLen = tl` (line ∥ HP), on BOTH when the line is ∥ both, and on NEITHER when inclined to
  both planes (Step 6 — TL comes only from the Rotation Method). Same `addLinearDimension` builder,
  same styling/colour; the top-view dimension is parented to `hpGroup` so it folds glued to the top
  view. Only the decision changed — no new TL system, no duplicated logic, no other behaviour touched.
- Result per step (verified): 1 = both views, 2 = front, 3 = top, 4 = front, 5 = top, 6 = none.

## [0.1.3] — 2026-07-15 — Fix: 2D Compare endpoint labels

### Fixed
- **Restored the missing endpoint letters in the 2D Compare drawing** (`src/compareSheet.js`). They
  had been *intentionally omitted* by a code stub; the drawing carried linework, XY, dots and
  dimensions but no point names. Now the sheet draws a′/b′ on the front view (VP, amber) and a/b on
  the top view (HP, teal) using the SAME shared factory as the 3D scene (`addLabel` → `.lbl--chip`)
  and the SAME sheet placement policy (`PLACEMENT.sheet2D.chip`) — no second label system. A view
  that collapses to a point (Steps 2 & 3) gets one combined chip (`ab` / `a'b'`) via the policy's
  `pointOut`. Chips are added to the sheet's `group`, so they rebuild on every `setData` (step /
  line-type / θ / φ / TL / fold / reopen) and dispose via `clearGroup()`'s `disposeLabels(group)` —
  one lifecycle with the XY marks and dimensions, no DOM/WebGL leak. No other behaviour changed.

## [0.1.2] — 2026-07-15 — Polish pass (P2 backlog)

Flagship polish against the `$impeccable critique` snapshot, aligned to DESIGN.md. Boot + type
sizes + rail names + the constraint note re-verified (CDP), zero exceptions.

### Changed
- **Teaching prose raised to the DESIGN.md §3.2 legibility spec** — `.step-body` 0.875rem/1.55 →
  `--text-base` 1rem/1.6, `.card__lead` 0.875rem → `--text-lead` 1.125rem/1.35. The reading
  hierarchy is now 16 / 18 / 21.6 px (body / lead / title), serving the low-vision struggling
  learner this product optimizes for.
- **Rail accessible names spell the ⟂ glyph** (`stepper.js`) — the jump-button `aria-label` now
  reads "Perpendicular to HP / VP" (screen readers announce the raw glyph inconsistently); the
  visible rail label stays the compact "⟂ HP / VP".

### Fixed
- **`#note-valid` is no longer a second live region** — it was `role="status"` and had its
  `textContent` re-set on every commit, so a screen reader could re-announce the θ+φ≤90° constraint
  on each slider tick. It is now `aria-hidden` (visual only); `uiManager.js` narrates the constraint
  **once, on the transition into invalid**, through the single `#sim-status` channel — matching the
  discipline already used for the step card and the success toast.

### Reviewed, no change (would diverge from the platform)
- Sub-44px painted controls the critique flagged (`compare-chip`, `quick-view`, `vp-*-dismiss`) in
  fact carry a transparent **44px hit-area `::before`** — measured painted box, not the hit target.
  The `.btn--ghost` reset (36px) and numeric input (36px, paired with a 44px slider) are inherited
  platform sizes that pass WCAG-AA 2.5.8 (24px); raising them only here would diverge from the
  master, so they stay. Flagged as a platform-level decision instead.

## [0.1.1] — 2026-07-15 — De-lint pass (post-critique)

Removed the inherited-but-dead residue an `$impeccable critique` flagged (two P1s), no
behaviour change. Boot + all six steps re-verified clean (CDP).

### Removed
- The hidden focus-trapped **Problem Library** dialog (`index.html`) and its full CSS block
  (`.problem-library`, `#active-problem`, `.problem-card`, `.problem-group`, `.library-entry`,
  self-check/hints) — the topic has no Problem Library ("removed, not deferred").
- Dead **quadrant-picker** CSS (`.quad-grid`/`.quad-btn`/`.quad-note`, `.lbl--quad`,
  `#workbench-rail [data-ctrl="quad"]`) and its hover rules — a Points concept never marked up here.

### Fixed
- Two **hard-coded off-palette hex** in data-URI SVG glyphs (RULES §4.1): the `.field__select`
  chevron `#564e3c` and the `.toggle` tick `#faf8f3` were *retired warm* values; corrected to
  mirror the current clinical tokens (`#5a5d66` ink-secondary, `#ffffff` paper), each with an
  inline note documenting the data-URI-can't-read-`var()` exception.
- Stale `pointSteps.js` / "Points" / quadrant comments across `index.html`, `onboarding.js`,
  `terms.js`, and the `uiManager.js` driver-count header — now name `lineTypesData.js` and the
  three real drivers (TL / θ / φ).

## [0.1.0] — 2026-07-15 — Initial build

New standalone Module-1 topic, cut copy-and-simplify (ADR-009) from
`graphics_module_1_topic_lines` (renamed 2026-07-19 to
`graphics_module_1_topic_6_projection_of_straight_lines`, ADR-072). Conceptual six-step tour of the
standard line positions; the source Lines topic was not modified.

### Added
- **Six line-type lessons** (`src/lineTypesData.js` `STEPS`), one standard position per step:
  parallel to both · ⟂ HP · ⟂ VP · inclined to HP · inclined to VP · inclined to both. Each is a
  data-driven configuration (`set` locks the case + non-taught angles; `controls` lists the
  meaningful controls; `cam` gives the entry vantage). `resolveLine()` reused unchanged.
- **Per-step camera framing** (`frameStep` in `main.js`) — glides the free-orbit perspective
  camera to each step's vantage on entry; any user drag cancels it (orbit-preserving, not a
  held-angle lock; §5.8).
- **Dynamic parameter panel** — only the meaningful control(s) per line type are revealed:
  Length (steps 1–3), Length + θ (step 4), Length + φ (step 5), Length + θ + φ (step 6). No
  disabled controls are ever shown.
- **View-foot dots** in `lineTypeRig.js` — a projection that collapses to a point (steps 2 & 3)
  now reads as a visible dot in 3D.
- **Rotation Method** (`src/rotationMethod.js`, renamed from the Lines topic's `trueLength.js`)
  exposed on step 6 to recover the True Length + true angles of a line inclined to both planes.
- Fold (Generate Orthographic Projection) and the Compare 2D drawing available on every step.

### Removed (relative to the Lines topic)
- The Problem Library (`problemLibrary.js`, `lineProblems.js`), the traces construction
  (`traces.js`), and all answer-validation seams — this topic teaches concepts, it does not solve
  numerical problems.
- The distance-from-HP/VP dials — end A sits at a fixed pose; only Length / θ / φ are dialled.

### Verified
- Headless-Chrome smoke test (CDP): clean boot, canvas present, all six steps drive with the
  correct titles + per-step controls, fold toggles, Compare opens, the Rotation Method animates —
  no uncaught exceptions (only a benign favicon 404).
