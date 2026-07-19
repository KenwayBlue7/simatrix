# Changelog — Projection of Straight Lines · Types of Lines

All notable changes to this topic. Format loosely follows Keep a Changelog.

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
