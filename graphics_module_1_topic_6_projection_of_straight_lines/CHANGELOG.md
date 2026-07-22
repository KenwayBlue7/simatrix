# Changelog — Projection of Straight Lines

## 2026-07-22 — Dashed hidden-edge lines tightened to Module 2's visual standard

- **Changed:** the dashed projector lines in `lineRig.js` now use the same tight dash rhythm
  (0.12/0.08) as Module 2's Compare sheet instead of the old chunky 1.6/1.0 pattern, restoring
  platform-wide "Simatrix Feel" visual parity between this topic and the master reference.

## 2026-07-21 — Own-canvas 2D Compare sheet; ADR-037 floating-card workbench; constructions run in the split

- **Changed:** the 2D Compare sheet (`compareSheet.js`) now renders on its own `WebGLRenderer` +
  `<canvas>` (created lazily in `.compare-card__stage` on first Compare open), a genuinely separate
  surface from the 3D viewport's canvas — replacing the original design where it was a second
  render pass scissored onto the SAME renderer. This let the topic adopt Module 2's ADR-037
  floating-card workbench (grey `--color-panel` shell, `var(--space-4)` gaps, rounded/bordered
  cards, `#rail-toggle` Hide/Show) instead of the old flush/hybrid split — a shared canvas couldn't
  show a real gutter between its own two scissored halves (ADR-076).
- **Fixed:** the Traces and True Length & Angles construction launchers forced the Compare card
  down to the compact floating PIP even when the 50/50 split was already open, because the split
  used to hide the wizard that hosted their buttons. Both launchers (plus their Replay buttons) now
  live in `[data-ctrl]` wrappers that re-parent into the workbench rail alongside the geometry
  drivers, so a construction runs inside the expanded split like any other control.
- **Removed:** `computeRegions()`, the `regions` struct, and the scissored-pass `pass()` viewport
  helper — the render loop no longer scissors one canvas into two regions, so there is nothing left
  for ADR-074's device-px→logical-px conversion to patch.

## 2026-07-20 — Intrinsic True-Length scale for the 2D Compare sheet

- **Changed:** `src/sheet2DLayout.js`'s `layout2D()` scale now derives from the resolved line's
  own True Length (`M.tl`) instead of the fixed `SHEET2D_SPAN = 150` mm span (ADR-038/ADR-072) —
  the ADR-053 intrinsic-size model applied to a line, invariant to the distance and angle sliders,
  so a typical drawing fills the sheet at any True Length instead of floating tiny inside a
  worst-case-sized frame (ADR-075). `traces.js` and `trueLength.js` inherit the new scale
  automatically, since all three share the one `layout2D()` source.

## 2026-07-20 — Fixed 2D-sheet label desync on HiDPI/scaled displays

- **Fixed:** the Compare workbench's 2D-sheet labels (`a′`/`b′`/`a`/`b`, dimension values) were
  offset from the WebGL drawing they annotate on any display with `devicePixelRatio != 1` (e.g.
  Windows 125% scaling) — the render loop's scissored passes handed `renderer.setViewport`/
  `setScissor` device-px regions, but those APIs apply `pixelRatio` internally, so the ratio was
  applied twice and the sheet pass drew shifted/clipped while its CSS2D labels stayed correct
  (ADR-074).

## 2026-07-20 — Step-card typography normalized to Module 2 reference scale

- **Changed:** `.step-body p` gained `color: var(--color-ink-secondary)` so the multi-paragraph step
  prose reads the same grey tone as `.card__lead` instead of inheriting near-black `--color-ink`
  (this topic's `.card__lead`/`.step-body` were already sized `var(--text-sm)`, matching Module 2 —
  only the body-copy colour had drifted). Part of a platform-wide step-card typography pass
  (ADR-073); see `graphics_module_1_topic_5_projection_of_line_types` for the sibling topic's larger
  size-token fix.

## 2026-07-20 — Rounded workbench panels; src/labels/ dead-code claim corrected

- **Changed:** `body.compare-split` workbench (`#compare-card` + `#workbench-rail`) gained
  `border-radius: var(--radius-md)`; the split grid gained `gap: var(--space-1)` so the rounding
  reads clear of the flush panes. (This topic's `--color-vp-line` was already `#b25718` from the
  2026-07-19 promotion — no token change here.)
- **Verified:** a stabilization audit flagged `src/labels/` (`LabelFactory.js`, `LabelManager.js`,
  `LabelPlacement.js`, `LabelStyles.js`) as unimported dead code and a deletion candidate. False —
  `src/lineRig.js` imports `createLabelManager`/`DIMENSION_OFFSET` from it live (the h/HT/v/VT 3D
  label system + the True-Length dimension standoff). Deletion was skipped; the directory is
  untouched. Real architectural debt does exist here — this topic runs TWO parallel CSS2D label
  systems side by side (`src/labels.js`'s flat `addLabel`/`disposeLabels`, used only for the TL tag,
  alongside `src/labels/`'s Manager/Factory/Styles/Placement stack for everything else) — merging
  them into one is banked as a follow-up task, not done in this pass.

## 2026-07-20 — Purge stale PIP-era comments and dead CSS from the Compare card

- **Removed:** the dead `.compare-card__stage canvas { display:block; width:100%; height:100% }`
  CSS rule (`index.html`) — the stage has never hosted a child `<canvas>` since the ADR-012/ADR-034
  migration to a single scissored `WebGLRenderer` pass; verified no code ever injects one
  (`main.js` only reads `.compare-card__stage` as a scissor rect).
- **Fixed:** a stale comment on `#compare-card` still described `main.js drawCompare()` live-redrawing
  a plain 2D `<canvas>` from point data — that function/path was removed at the ADR-012 migration.
  Reworded to describe the current second-render-pass design (ADR-012 / ADR-034 alternative-A).
- Prompted by a stabilization audit of this topic's reported UX regressions (label drift,
  orbit-drag capture, legacy PIP remnants); the audit found none of those present in current code —
  only this cosmetic dead-code residue remained.

## 2026-07-19 — Promoted to catalog topic 6; Problem Library doc un-staled; tokens reconciled (ADR-072)

- **Changed:** Renamed the folder from the non-conforming `module_1_topic_lines` to
  `graphics_module_1_topic_6_projection_of_straight_lines` — the next free Module-1 catalog slot
  after the sibling `graphics_module_1_topic_5_projection_of_line_types` concept primer.
- **Fixed:** `CLAUDE.md` described the Problem Library as "deferred, out of migration scope," but
  `main.js` already calls `initProblemLibrary(...)` and wires it into `window.simAPI` — the doc was
  stale, not the code; corrected the doc to match the shipped, active library.
- **Fixed:** Construction-aid tokens (`--construct`/`--locus`/`--tl-green`) in `index.html` were
  aliased to unrelated neutrals and missing their `*-ink` text variants; replaced with DESIGN.md
  §2.2's platform-catalogued hex so this topic's Traces/True-Length linework matches every other
  Module-1 consumer of these tokens.
- **Changed:** `SHEET2D_SPAN`'s deliberate `150` value (vs. ADR-038's original literal `300`) is now
  formally recorded as an ADR-038 amendment in `../DECISIONS.md` rather than an undocumented
  deviation; no code change — the existing value and its Points-parity rationale were already
  correct.

## 2026-07-15 — Remove vestigial Points leftovers + earlier UI-quality pass (impeccable)

Executed the long-deferred removal of the two dead Points-skeleton leaves and folded in a small
frontend-quality pass on the shell.

- **Deleted** `src/hvPlanes.js` + `src/labelLayer.js` — dead Points leftovers, unimported (grep
  verified), superseded by `lineRig.js` / `labels.js`. Removed their orphaned `.lbl--quad` /
  `.lbl--coord` CSS in `index.html`; the live `.lbl--xy` (used by `labels.js`) is kept. Updated the
  file maps in `CLAUDE.md` and `../ARCHITECTURE.md`. `problemLibrary.js` stays (deferred library).
- **Accessibility** — the viewport `aria-label` described "a point … across the four quadrants"
  (Points copy); rewritten to "straight line AB projected onto the Horizontal Plane and Vertical
  Plane." Static `<h2>` default `Choose the quadrant` → `True Length` (step-1 title). VP amber
  `--color-vp-line` `#bc5d1e` → `#b25718` so the `.lbl--vp` label text clears AA (4.45 → 4.92:1).
- **Theming** — two data-URI SVG strokes carried retired warm-paper hex (`#564e3c`, `#faf8f3`);
  replaced with resolved clinical token values (`#5a5d66` = ink-secondary, `#ffffff` = paper).
- **Consistency** — `btn-traces` / `trace-replay` / `btn-fold` prefixed raw glyphs; migrated to the
  shared `.btn--icon` / `.btn__icon` layout (fold label split into icon + `#fold-label` spans in
  `stepper.js`, keeping the `aria-hidden` glyph out of the accessible name).
- Comment sweep: stale `pointSteps.js` / `pointProblems.js` references → `line*`.

Not runtime-verified live (no dev server; Three.js is a CDN import) — `stepper.js` passes
`node --check`, deletions/CSS-cuts grep-verified against live usage. Recommend one manual fold-toggle
+ boot check before ship.

## 2026-07-13 — Scene framing: restore the Points apparatus-tight philosophy (HP/VP extents 60→24)

The Lines 3D scene read "framed much wider than Points" — the line filled a small part of the
viewport and every label/dimension looked crowded. Measured both topics: camera FOV (45), position,
and target were already Points-equivalent and the live camera (dist ≈ 32.8, frame ≈ 27u) was already
apparatus-tight — the divergence was NOT the camera. It was the **HP/VP sheet extent + grid scale**:
Points sizes its plane apparatus to its data (9u sheet ≈ its point range) and frames it ~87% full;
Lines' sheet was **60u (600 mm)** while a line is only 6–15u, so the camera framed a vast sparse grid
(cell 2.5u) with the subject a fraction of it. Object scale (÷10) was identical in both — the line was
never intrinsically small, it was dwarfed by an oversized reference frame.

- **`lineRig.js`** — `SHEET` 60 → **24** (±12; 240 mm), sized to the line data envelope (TL max
  150 mm = 15u fits centred). `GRID.divs` unchanged → grid cell 2.5u → **1.0u = 10 mm** (a natural
  engineering grid). Planes / grid / border / fold line all derive from `SHEET`.
- **`main.js`** — `SHEET_HALF` 30 → **12** (the fold/flat-sheet framing half-extent, kept in step).
- **Camera unchanged** — position (-21, 16, 21), target (0, 2, 0), FOV 45: with the 24u apparatus it
  now frames ~89% full, matching Points' ~87%.
- **Labels untouched** (per brief — framing first): every offset still sources from `labelPlacement.js`.

Verified headless (ADR-019): clean boot, ONE WebGL context, no console errors/exceptions; default 3D
now frames the apparatus edge-to-edge with the line + views + chips centred and readable (side-by-side
with the Points default), and the folded orthographic sheet still frames the flattened drawing.

## 2026-07-13 — Label-placement architecture: ONE centralized placement policy (`labelPlacement.js`)

Root cause of the lingering annotation regression was ARCHITECTURAL, not numeric: label offsets had
accumulated across **four leaves** (`lineRig` used three different mechanisms — `outboard()`, inline
plane literals `lo=9`, inline angle literals; `compareSheet` had its own `CHIP2D` + `DIM_OFF` + inline
`0.38`; `traces` / `trueLength` each carried inline marker offsets), with **no shared table** — the
opposite of the Points reference, which concentrates every scene offset in named tables in ONE leaf
(`labelLayer.js`: `PLANE_ANCHOR` / `QUAD_ANCHORS` / `CHIP_OFFSET`). Restored a single placement system;
this is a **behaviour-preserving refactor** — the already-verified numeric values were relocated, not
re-tuned (no trial-and-error), so the drawing is pixel-identical while every offset now has ONE home.

- **New `src/labelPlacement.js`** — a STATELESS shared util (the `sheet2DLayout.js` / `dimensions.js`
  §3.6 exception) exporting the ONE `PLACEMENT` table (grouped by coordinate space `scene3D` /
  `sheet2D`, named by role: vertex / projected / plane / axis / angle / dimension / trace) + the shared
  strategy helpers `outboard()` (DESIGN.md §5.9 push-past-the-tip) and `bisectorAnchor()` (angle
  labels along the bisector). Units documented per space, never mixed.
- **`lineRig.js`** — deleted its local `outboard()` + `LABEL_STANDOFF` and the inline `lo=9` / `0.7` /
  `0.3` / `0.95` literals; imports `PLACEMENT.scene3D` + `outboard`.
- **`compareSheet.js`** — deleted `CHIP2D` + `DIM_OFF` + inline `0.38`; imports `PLACEMENT.sheet2D`.
- **`traces.js`** — h/v/HT/VT marker-child offsets now `PLACEMENT.sheet2D.trace`.
- **`trueLength.js`** — b₁/b₁′ marker letter, θ/φ bisector radius, TL-value lift now from
  `PLACEMENT.sheet2D` (+ `bisectorAnchor()`).
- **`RULES.md §3.27a`** — new rule: one documented placement policy per topic; no leaf invents its own
  offset.

Verified headless (ADR-019): clean boot, ONE WebGL context, no console errors/exceptions; default 3D
(A/B outboard-balanced, a/b/a′/b′ on views, θ/φ off the rod, HP/VP/x/y placed, TL 60), Compare sheet
(x/y + mirrored chips, dims), and the mounted True-Length construction (b₁/b₁′/θ/φ/TL shown, base
dimensions correctly hidden, no 3D-label bleed) all render pixel-identical to the prior approved state.

## 2026-07-13 — Final annotation pass: balanced endpoint labels, icon-button layout, construction hierarchy

Three regressions closed against the finalized Points topic; all verified headless (ADR-019): clean
boot, ONE WebGL context, no console errors, `renderer.info` flat 16→0 across 40 rebuilds + fold cycles.

- **Issue 1 — 3D endpoint labels A/B (`lineRig.js`).** Root cause: the previous fix borrowed the Points
  `CHIP_OFFSET` *vertical* lift (`+0.60 up`), which is balanced for Points' single isolated POINT but
  NOT for a line — a fixed up-nudge lands the label ON the diagonal rod at its lower end (A sat on AB)
  and clear at the upper end. Replaced with the correct §5.9 "outward off the linework" strategy for a
  line: `outboard(end, far)` pushes each endpoint label PAST its own end along the line's own axis, away
  from the far end — mirror-symmetric for the two ends, always into empty space beyond the tip. Applied
  to A/B, a′/b′, a/b.
- **Issue 2 — "True Length & Angles" launcher (`index.html`).** The button prefixed a raw `∡` glyph onto
  a plain (baseline-aligned) `.btn`, so the glyph rode high off the label. Restored the platform
  icon-button layout (the Points pattern: a flex row with a `flex: none` icon slot) via a reusable
  `.btn--icon` / `.btn__icon`, with the glyph in an `aria-hidden` icon span — no ad-hoc glyph nudging.
- **Issue 3 — 2D construction clutter (`compareSheet.js`, `main.js`).** Two overlaps: (a) a mounted
  construction's TL/θ/φ callouts fought the base view-length DIMENSIONS; (b) in the compact Compare card
  the full-viewport 3D-scene labels bled through onto the sheet. Fixed the annotation hierarchy — the
  base dimensions now yield while any construction is mounted (never coexist), and the 3D-label overlay
  is hidden while the compact card is up (the sheet carries its own labels). **Subtle bug caught:**
  hiding the dimensions via `dimGroup.visible = false` hid the WebGL dimension *lines* but NOT the CSS2D
  value labels ("56"/"49") — three's `CSS2DRenderer` honours only each CSS2DObject's OWN `.visible`,
  never an ancestor group's. The gate now toggles `.visible` on the dim CSS2D labels directly (RULES.md
  §3.27 extended with this trap).

## 2026-07-13 — Label-placement parity: reuse the Points `CHIP_OFFSET` standoff strategy

The 3D-scene vertex chips were placed by scattered inline offsets with no shared table, and the true-space
endpoint chips **A / B piled onto their plane-view chips a′ / b′** — a′ is A projected onto the VP, so the
two share the same lateral x AND the same height y and, when an endpoint sits near the VP, coincided on
screen. This is the exact P-vs-p′ collision the Points reference solves by lifting the space chip clearly
above the plane chip (`P.y = 0.60` over `p′.y = 0.30`). Restored that strategy — no new offsets invented,
the Points magnitudes reused:

- **`lineRig.js` (3D scene).** Added a documented `CHIP` standoff table + `END_SIGN` endpoint mirror
  (the §5.9 "nudge outward off the linework" rule): A/B lifted to the Points space-chip height (0.60) so
  they clear a′/b′ (0.30); a/b proud of the HP floor (0.24); every chip's horizontal sign mirrors its
  endpoint across the line centre (`resolveLine` gives `dx ≥ 0`, so A sits left, B right — opposite ends
  mirror). Verified in the folded orthographic sheet: A stacks cleanly above a′, B above b′.
- **`compareSheet.js` (2D sheet).** Extracted the ad-hoc chip magic numbers into a documented `CHIP2D`
  table (front-view chips up, top-view chips down, a left / b right) — same outward-mirror strategy,
  behaviour unchanged.
- **No change** to `traces.js` / `trueLength.js`: their h/HT/v/VT and b₁/TL/θ/φ labels are already
  children of their marker groups with fixed standoffs (angle labels along the bisector) — already the
  Points attached-marker pattern.

Verified headless (ADR-019): clean boot, no console errors/exceptions, ONE WebGL context, `renderer.info`
flat 16→0 across 40 rebuilds + 6 fold cycles, labels attached + readable through fold / Compare / resize.

## 2026-07-13 — Visual-parity pass: restore the clean orthographic sheet against the Points gold standard

A component-by-component runtime comparison against the finalised `graphics_module_1_topic_3_points`
sheet surfaced two regressions on the Compare **2D orthographic drawing** — both fixed by *removing*,
never adding (the Points sheet stays the reference: X/Y + the projected marks + BIS dimensions, nothing
more). Verified headless (ADR-019): clean boot, no console errors, ONE WebGL context, `renderer.info`
flat across 40 rebuilds, stepper/Compare/Library intact.

- **Sheet declutter (annotation hierarchy, DESIGN.md).** Dropped from the 2D sheet: the **α/β/θ/φ angle
  marks** (dashed reference + arc + label), the **ELEVATION (a′b′) / PLAN (ab)** view titles, and the
  **HP / VP** plane captions. The Points sheet carries none of these — on the small measured drawing they
  overlapped the views and the dimensions. The inclination angles remain in the 3D pane (the θ/φ callouts
  + the True-Length construction), where they belong; the sheet now shows only X/Y, the two views with
  their `a′/b′/a/b` chips + feet, the projectors, and the Type-B view dimensions. Dead `markAngle` /
  `thinArc` / `thinDash` helpers removed.
- **Sheet scale — fill like Points.** `SHEET2D_SPAN` retuned `300 → 150` mm (the True-Length slider max),
  so a typical drawing FILLS the sheet instead of floating tiny in it — the Points `REF_SPAN = 40`
  (distance-slider max) pattern. Still a FIXED, non-auto-zooming measured scale (§5.19 / ADR-038 amended);
  the shared `layout2D` constructions (traces, True-Length) scale with it and stay pixel-aligned.

## 2026-07-12 — Migration off `engine.js` to the standalone topic, COMPLETE (Phases 4A–4G, ADR-042)

The **Projection of Straight Lines** lesson was migrated off the retired shared
`Module1/src/engine.js` into this standalone `graphics_module_1_topic_lines` folder, cut from the
`graphics_module_1_topic_3_points` skeleton (ADR-009) and built on Module 2's orchestrator +
leaf-module pattern (ADR-007, ADR-033). No topic number in the slug — catalog index 4 was taken by
the orthographic-projection intro topic (like "Simple Positions", §1.9). Delivered and headless-verified
(ADR-019) in seven phases:

- **4A — architecture / boot.** Standalone `main.js` orchestrator owns the scene, ONE `WebGLRenderer`
  (one WebGL context), the camera + `OrbitControls`, the single `rebuild()` pipeline, the full disposal
  contract (ADR-004), the render loop, and `window.simAPI`. Pure-data layer (`lineData.js` /
  `lineSteps.js` / `lineProblems.js`) copied over; zero `engine.js` import.
- **4B — guided workflow (ADR-017).** The 5-step Lines stepper (True Length → distance from HP/VP →
  θ/φ → generate → traces) with dedicated, non-accumulating per-step controls; `stepper.js` /
  `uiManager.js` / `terms.js` / `onboarding.js` adapted.
- **4C — Compare / workbench / 2nd-pass sheet.** The on-demand Compare card (ADR-012) + the ADR-021
  workbench split (drivers re-parented into a docked rail); the 2D orthographic drawing as a **second
  scissored WebGL render pass on the ONE canvas** (`compareSheet.js`, ADR-042 / ADR-034 alt-A — not
  Canvas2D, not a second context), fixed-scale (ADR-038 §5.19).
- **4D — fold camera (ADR-036).** The dual-camera orthographic swoop: forward swoops square-on to the
  flattened answer sheet with a perspective→ortho `projectionMorphK` morph; reverse restores free orbit
  on the retained pose. No held-angle path.
- **4E — constructions.** Animated Traces (HT/VT) + the 12-phase True-Length (rotating-line) method as
  thin-line overlays mounted into the sheet scene (`traces.js` / `trueLength.js`), step-gated launchers,
  torn down on edit/step-change/reset, disposed via the overlay.
- **4F — BIS dimensioning (ADR-041).** Type-B dimension GEOMETRY via the shared `dimensions.js` builder:
  narrow extension + dimension lines + FILLED 3:1 arrowheads, dimensioning the 2D sheet's view lengths
  and the 3D rod's True Length.
- **4G — CSS2D annotations.** The complete label layer via the shared `labels.js` factory + a SECOND
  `CSS2DRenderer` for the sheet (one overlay per camera): dimension values, True-Length value, θ / φ,
  A/B, a/b, a′/b′, HT/VT/h/v, ELEVATION/PLAN, and construction labels (b₁ / b₁′ / TL / θ / φ).

**Architecture established:** the second-pass ortho sheet + the two-overlay CSS2D layer + the shared
stateless utilities (`sheet2DLayout.js`, `dimensions.js`, `labels.js`, the §3.6 exception). Every phase
preserved: standalone ownership, one orchestrator, single `rebuild()`/disposal, one `WebGLRenderer` +
context, `window.simAPI`, zero `engine.js`, and memory stability (`renderer.info.memory` + CSS2D
DOM-node counts flat across 50 rebuilds).

**Vestigial (removal candidates):** `src/hvPlanes.js` + `src/labelLayer.js` — dead Points leftovers
superseded by `lineRig.js` / `labels.js`; inert (they import the removed `point*` files and are not
imported by anything).

**Deferred (out of migration scope):** the textbook Problem Library (`lineProblems.js` is present as its
data layer; entry hidden) and the Top/Front/Side quick-view cameras (the dual-camera stack built in 4D is
their foundation).
