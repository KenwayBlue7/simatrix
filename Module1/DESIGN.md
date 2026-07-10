# DESIGN.md — Module 1 Premium Interaction Layer

Module-local design spec for **Simatrix Engineering Graphics · Module 1**. This file documents
only what Module 1 layers **on top of** the platform-wide system. All colour, typography,
spacing, radius, and base-motion tokens are defined by the consolidated platform design system at
`../DESIGN.md` (Simatrix root) and mirrored into `src/shell.css`'s `:root {}` — this document does
**not** redefine them. It covers the
premium interaction layer ported from Module 2: the motion palette, the z-index ladder, the
hover/focus/press conventions, the Compare View, the cinematic fold camera, the engine-injected
chrome, and the Problem Library.

Architecture & engineering-graphics conventions live in `CLAUDE.md`; this is the visual /
interaction contract. As of Increment 7 (the docs closeout) all of Increments 0–6 are landed in
code, so every section below is **authoritative** — there are no remaining stubs.

---

## Z-index ladder

A single ordered ladder so transient layers never fight. Tokens live in `src/shell.css :root`;
never hard-code a `z-index` — reference the token.

| Token | Value | What lives here |
|---|---|---|
| `--z-term` | 60 | Term-definition popover (`#term-pop`) |
| `--z-compare` | 90 | Compare-card frame (`#compare-card`) |
| `--z-notice` | 100 | Mobile notice banner (`#mobile-note`) |
| `--z-overlay` | 120 | Full-viewport modal — the Problem Library (`#problem-library`) |
| `--z-toast` | 130 | Success toast (`#sim-toast`) |
| `--z-restoring` | 150 | WebGL context-lost "Restoring 3D view…" chip (`#sim-context-lost`) |
| `--z-boot` | 200 | Boot diagnostic (`#boot-error`) — must sit above everything |

**The Compare canvas floats just above its own frame** (not via a token, by design in
`src/engine.js`): the frame is `--z-compare` (90); `#c2d` is set to `CARD_Z = 91`; its CSS2D label
overlay to `CARD_Z + 1 = 92`. These three sit *below* `--z-notice`, so the mobile banner and every
page-level modal still escape over the card.

Other in-viewport chrome (orbit hint, spotlight, quick-view/connector chips, wizard toggle,
fa-symbol) lives in the local stacking context of `#sim-viewport`/`#canvas-area`, below
`--z-notice`. Only the table above escapes to the page level.

---

## Motion palette

CSS keyframes are defined in `src/shell.css`; JS-driven motion uses the `src/anim.js` tween
system. **Everything collapses to instant** under `@media (prefers-reduced-motion: reduce)` — the
global CSS rule at the bottom of `shell.css`, and `anim.js`'s `tween()`, which jumps to the end
value and fires `onComplete` on the next tick (state still updates; only motion is suppressed).

### CSS keyframes

| Keyframe | Motion | Used by |
|---|---|---|
| `panelIn` | `translateY(8px)` + fade, `--dur-step` (380ms) | step-card swap (`.step-card.swap`) |
| `resetConfirmIn` | `translateY(4px)` + fade | inline Reset-confirm strip |
| `hintStepIn` | `translateY(6px)` + fade | scaffolded problem hints, revealed one at a time |
| `libraryIn` | `scale(.98)` + fade | Problem Library modal open |

CSS transitions use the shared `--ease-standard` (`cubic-bezier(0.22, 1, 0.36, 1)`).

### JS easing curves (`src/anim.js`)

Built natively with `cubicBezier(x1,y1,x2,y2)` (a WebKit-style `UnitBezier` solver — no animation
library, per the no-build contract). **NO-OVERSHOOT RULE:** every curve keeps `y1, y2 ∈ [0,1]` so
nothing anticipates or overshoots.

| Curve | Bezier | Role |
|---|---|---|
| `easeStandard` | `0.22, 1, 0.36, 1` | matches the `--ease-standard` CSS token exactly; tween default + the `restorePerspective` ortho→perspective glide |
| `easeFold` | `0.83, 0, 0.17, 1` | heavy symmetric ease-in-out — the "physical hinge" fold + its held-angle camera dolly (`animateFoldHold`) and the ortho quick-view morph |
| `easeCamera` | `0.76, 0, 0.24, 1` | weighted accelerate-then-settle — the legacy quick-view snap + the auto-zoom dolly + the legacy fold camera tween |
| `easeDraw` | `0.25, 1, 0.5, 1` | gentle ease-out — the projection draw-on ramp |
| `easeDissolve` | `0.5, 0, 0.75, 0` | accelerating ease-in (used as `1 − easeDissolve(t)`) — the 3D body dissolving into its flat drawing |

### Durations & holds (the values in code)

| Motion | Duration | Where |
|---|---|---|
| Cinematic fold (sheet + camera) | `FOLD_DURATION = 2800ms`, split `FOLD_SPLIT = 0.72` | `animateFold` / `animateFoldHold` (orthoViews held-angle) |
| Quick-view camera move | `1500ms` | `tweenPerspective` (legacy `easeCamera`) / `tweenCamFull` (ortho `easeFold`) |
| Clip-aware auto-zoom dolly | `AUTO_ZOOM_MS = 520ms` (`easeCamera`) | `reframeIfClipped` |
| Projection draw-on | `800ms` (`easeDraw`) | `startDrawOn` |
| Success toast hold | `2600ms` | `showToast` |
| Flow-note / spotlight hold | `4500ms` (240ms fade-out) | `flowNote` / `onboarding.js` |
| Step-card swap | `380ms` (`--dur-step`) | `.step-card.swap` |

### Press & interaction conventions

- **Press states (Emil Kowalski tactility):** all buttons press **in**
  (`:active → scale(.97)`) — Module 2 parity (primary, secondary, ghost, chip alike).
  Always gated by `:not(:disabled)`.
- **Hover gating:** every hover-only rule (tints, preview halos) is wrapped in
  `@media (hover:hover) and (pointer:fine){…}` so coarse-pointer / touch devices never get a
  stuck hover state after a tap. `:focus-visible` and `:active` rules stay **outside** the gate
  — keyboard and touch both need them.
- **Focus ring:** a global `:focus-visible{outline:none;box-shadow:var(--ring-focus)}` is the
  default; per-component overrides match the component's own radius (pills `999px`, buttons
  `--radius-sm`, rail markers via the marker's circle). The ring is never removed.
- **Term popover:** origin-aware scale-in (`translateY(4px) scale(.96)` → none over `--dur-fast`)
  driven by a `visibility`/`opacity`/`transform` transition, not a `display` toggle — so the
  element stays measurable for positioning and the open/close actually animates.

---

## Layout invariants

- **No CSS `transform` on `#sim-viewport`, `#canvas-area`, or `body`.** The Compare card is
  `position:fixed` and laid out from viewport rects (`layout()` measures `.compare-card__stage`'s
  `getBoundingClientRect()` and floats `#c2d` + its CSS2D overlay over it, escaping
  `#canvas-area{overflow:hidden}`). A transformed ancestor would establish a containing block and
  break that placement. Treat these three elements as transform-free zones.
- **Canvas sizing is JavaScript-owned**, never authored in the stylesheet — `layout()` in
  `src/engine.js` calls `rend.setSize(w,h,false)` (backing store only) and writes each canvas's CSS
  `width`/`height` inline itself (in `c3.style`/`c2.style`), since `updateStyle:false` means Three
  won't. The stylesheet's `#c3d,#c2d` rule carries no width/height — `layout()` supplies it. Skipping
  it makes the canvas lay out at its DPR-scaled backing size → a blurry, upscaled viewport on DPR>1.
  `layout()` also keeps each stack's `LineMaterial.resolution` in sync (`s3Px()`/`s2Px()` →
  `updateLineRes()`), and the ortho camera's frustum aspect (`S3.oCam`) when present. (See
  `CLAUDE.md`'s renderer-stack section.)
- **Auto-zoom is a pure dolly, never a transform.** The clip-aware reframe (`reframeIfClipped`) only
  moves the perspective camera along its view axis; it touches no CSS, so it is fully compatible with
  the no-transform invariant above.

---

## Compare View contract

The re-housing of the dual-renderer 2D drawing. The main pane is **always `#c3d`** (stack `S3`);
the second stack **`S2`/`#c2d` survives** as the content of an on-demand floating Compare card
instead of a persistent PiP. Invariants (carried from `CLAUDE.md`'s renderer-stack rules):

- Canvases never move in the DOM; renderers never cross; scenes never swap between stacks.
- Only S2's **group content** and **camera pose** change — consistent with the `rebuild()`
  disposal contract.

### State machine

| Main-pane state | Compare card content (S2) | How (`src/engine.js refillCompare`) |
|---|---|---|
| Live 3D (unfolded) | **2D drawing** — `cfg.draw2D`, incl. the Lines construction overlays | `fill(S2, false, ctx)`, `S2.cam ← cam2`, orbit off |
| Folded flat sheet | **Live 3D view** — `cfg.draw3D` rebuilt into `S2.grp` | `fill(S2, true, ctx)`, `S2.cam ← cam3`, orbit on **when expanded** |

The content mode is the module flag `s2Is3D` (`= folded` at `compare.show()` time; reset to `false`
by `rebuild()` whenever the main view is live). The card's corner tab relabels "2D drawing" / "3D
view" to match.

### Card geometry & facade

- **Compact:** a premium "drawing sheet" card, ~`min(420px, 38vw)`, hovering over the
  viewport/wizard seam (top-right). Paper bg, hairline border, `--radius-md`, `--shadow-md`
  (a transient overlay → the Flat-Ink rule permits the shadow), corner label tab, expand + close.
- **Expanded:** the card grows to ~76 % of the viewport — this **replaces** the old "swap the 2D
  drawing to the main pane" capability for construction-heavy Lines steps. S2 OrbitControls are
  enabled here only when the card is showing 3D content.
- **Facade:** `compare = { show(size?), hide(), toggle(), isOpen() }` (module-private in the
  engine, also handed to lessons on the `wireControls` api). `compareSize` (`'compact'|'expanded'`)
  rides on the card's `data-size`. Escape closes; the chip mirrors open/closed via `aria-pressed`;
  `announce()` narrates open/close + content for SR.
- **Chip gate:** the Compare chip is hidden until `cfg.compareGate(view)` passes (Points:
  `v.showHP && v.showVP`; Lines: `v.showFV && v.showTV`) — preserving the pedagogy that the 2D
  drawing is meaningless before both views exist. A closed gate force-closes an open card.
- **During a fold:** `compare.show()` is a no-op while `animating`; a fold start auto-closes the
  card (it re-opens against the new fold state on demand).

### Feature-preservation mapping (no loss vs. the old dual-pane)

| Old mechanism | New home |
|---|---|
| `#tbar` 3D/2D pills (main-pane switch) | the fold button (cinematic flatten) + the Compare card's expanded state |
| Persistent PiP (other view always visible) | the Compare chip — same content, on demand, bigger |
| PiP click-to-swap | the Compare card's expand button |
| `api.swap()` / `api.isMain3D()` (Lines "show the 2D drawing large") | `api.compare.show('expanded')`; `swap`/`isMain3D` kept as deprecated no-op shims |
| `beginOverlay()` construction overlays into `S2.grp` | unchanged — S2 survives; those Lines steps auto-open Compare expanded |
| Mobile tbar switching | the Compare chip (full-width card over the sticky viewport) |

### Compare workbench (Lines — `cfg.workbenchControls`)

The docked side-by-side split still left the wizard reserving `clamp(340px, 34vw, 460px)`, so each
canvas was only half of the *leftover* width (~420–490px on a laptop), not a true 50/50, and the
geometry-driver controls were gated to their per-step disclosure — unreachable while comparing. On
Lines (which sets `cfg.workbenchControls`), opening the **expanded** split therefore enters
**workbench mode** (engine `syncWorkbench` → `enterWorkbench` / `exitWorkbench`, keyed off
`isSplit()`):

- The wizard collapses (reusing `body.wizard-collapsed`) **and** `body.compare-workbench` is set, so
  `#sim-viewport` reclaims the full width → `#c3d` and the split card each become exactly half of it
  (a true 50/50).
- The listed `.ctrl` driver fields (`tl, disthp, distvp, theta, phi`) are **re-parented** from
  `#controls` into the docked `#workbench-rail` — a flat paper strip across the bottom of both panes,
  separated by a single hairline top border (Flat-Ink → **no shadow**; the rail is docked, not a
  transient overlay). `#canvas-area` (`flex:1`) auto-shrinks by `--compare-rail-h` so the canvases
  resize via `layout()`; the split card's `bottom` is pulled up to the rail. Dragging any rail slider
  drives the normal rebuild, so **both** the 3D pane and the 2D drawing update live.
- Re-parenting (not mirroring) keeps one source of truth — control ids are global, so the existing
  input listeners / `setRange` / self-check are untouched (the same pattern Lines uses to relocate
  `#view-toggles` into `.vp-cluster`). The fields restore to their exact original slots on exit.
- **Exit** (Compare close / chip toggle off / shrink to compact / a fold start / the wizard chevron,
  which in workbench mode closes the split) reverses it: fields return to `#controls`, the rail
  hides, the two body classes drop, and `renderStep(step)` restores per-step disclosure.
- **Trade-offs (deliberate, see ADR-021):** the step narrative is hidden while comparing, the rail
  shows the *full* driver set at once (the "solve & verify" altitude, not one-idea-per-step), and
  `fold`/`traces` stay wizard-bound. Desktop-only; mobile keeps the bottom-sheet Compare. Points
  omits `cfg.workbenchControls`, so its split is unchanged.

---

## Cinematic fold camera

**The previous hard rule "the camera NEVER moves during the fold" is OVERTURNED** (user ruling,
2026-06-12). The fold is now full Module-2 cinematic. The `animateFold` frame loop in `src/engine.js`
rotates the sheet **and** moves the camera — by one of two paths, chosen by `cfg.orthoViews`.

**`cfg.orthoViews` lessons (Points / Lines) — the HELD-ANGLE fold.** `animateFold` delegates the
camera to `animateFoldHold`: the **perspective** camera `S3.cam` stays live and **never rotates** —
its view DIRECTION is held constant while it dollies + pans along that direction to keep the folding
sheet framed. Because `pos − tgt` stays parallel to the fixed direction, the move is a pure dolly+pan
(no rotation), so the learner watches the HP plane **hinge flat from their own 3D angle** — the
pedagogical 3D→2D morph. There is **no ortho sweep and no projection morph during the fold**; the
square-on true-orthographic read stays in the **Compare card** (and the Front quick-view squares up on
demand). *(This replaces the earlier `animateFoldOrthoCamera`, which flew `S3.oCam` front-on with a
perspective→ortho morph — it read as a bottom-right swoop and hid the hinge edge-on.)*
- **Pose capture:** on forward, the learner's perspective orbit pose is stored in `preFoldPose`.
- **Forward target:** `framePerspectiveToFlat()` keeps the current view direction, recentres the
  target on the flattened-sheet box (`flatViewBox('all')`), and dollies to a `fitPerspectiveDistance`
  fill — so the whole flatten stays in frame without a front-on swing.
- **Reverse:** `S3.cam` eases from the held flat-framed pose back to `preFoldPose`, then `rebuild()`
  restores the live 3D scene.
- **Reduced motion** snaps via `snapFoldFlatHold()` (forward, same-angle dolly) / `restorePerspective(false)`
  + rebuild (reverse) — no tween; state still updates. The dual ortho camera + `projMorphK` remain in
  use, but only for the **quick-views** (see *Dual-camera orchestrator* below), not the fold.

**Legacy single-perspective fold (the First-angle intro lesson).** Unchanged: `animateFold` eases
`S3.cam` + `S3.ctrl.target` (`easeCamera`) to the square-on **`FRONT`** pose (`FRONT === QVL.front`,
the pose the "Front" quick-view chip lands), and reverses to `preFoldPose`. Reduced motion uses
`snapCameraToFront()` / `snapCameraHome()`.

**Both paths:**
- **Leaving a folded sheet without reversing** (Next / slider edit) restores `preFoldPose` inside
  `rebuild()` (orthoViews lessons first `restorePerspective(false)`), so the camera never strands.
- **No camera fights:** a fold start cancels any in-flight `camTween` **and `autoZoomTween`** and
  closes the Compare card; while `animating`, `loop()` skips `actCtrl.update()` so the fold owns the
  camera with no OrbitControls damping fight; the fold button is disabled for the duration.

The sheet timeline itself (hinge rotation, depth-cue fade, the dynamic `footTracker` projector) is
unchanged from the reversible fold described in `CLAUDE.md`. Forward end freezes the flat sheet and
fades in the `#fa-symbol` first-angle badge (Points/Lines, via `cfg.ui.faSymbol`).

---

## Dual-camera orchestrator (Points / Lines — `cfg.orthoViews`)

Ported from Module 2: the two sims run a **dual perspective/orthographic camera** on the main stack
`S3`, gated entirely on `cfg.orthoViews` (the five intro lessons keep a single perspective camera and
pay nothing). The contract:

- **Two cameras on S3.** `attachOrtho()` adds `S3.oCam` (`OrthographicCamera`) + `S3.oCtrl` (a second
  `OrbitControls`) beside the perspective `S3.cam`/`S3.ctrl`. Module-level `actCam`/`actCtrl` point at
  the live pair; `loop()` renders `actCam`. Only one control set is enabled at a time. S2 (the Compare
  card) is always perspective.
- **Projection morph.** `projMorphK` ∈ `[0,1]` or `null` (0 = ortho, 1 = perspective, null = off).
  `loop()` calls `applyProjectionMorph()` after `actCtrl.update()` (so it is the last word before
  render), element-wise blending `S3.oCam`'s matrix toward `S3.cam`'s; `clearProjectionMorph()` resets
  it. This makes every perspective↔ortho transition animate instead of cutting.
- **Orthographic quick-views.** A quick-view click runs `setView(kind)`: `engageOrtho()` (seed the
  ortho pose on the live 3D view + arm the morph) then `tweenCamFull(…easeFold…, up)` (fit-to-box,
  with the screen-up roll). Re-clicking the active view → `restorePerspective(true)` (glide
  ortho→perspective back to the retained orbit). While the sheet is folded, the click instead pans —
  `setFlatView(kind)`.
- **Flattened 2D pan.** Because M1's folded sheet is **vertical** (the z=0 plane) and read **front-on**
  — unlike Module 2's top-down floor answer-sheet — `setFlatView` keeps a front-on framing
  (`FLAT_VIEW_UP = +Y`) and pans/zooms to the requested region (`flatViewBox('front')` elevation,
  `'top'` plan, `'side'` whole sheet) rather than rotating.
- **Clip-aware auto-zoom.** `reframeIfClipped()` (at the end of `rebuild()`, behind `cfg.autoFrame`) is
  a perspective-only **push-back** dolly: it fits `cfg.contentBox(model)` (the geometry, not the grid)
  via `fitPerspectiveDistance` and never pulls in, so a deliberate zoom-in survives an edit.
- **Constants** (`src/engine.js`): `ORTHO_FRUSTUM` (reference half-height), `ORTHO_STANDOFF` (ortho
  camera distance along the view dir), `FRAME_PADDING` (fit margin), `AUTO_ZOOM_MS` (dolly duration),
  `QV_DIR` (per-view dir/up in M1 axes), `FLAT_VIEW_UP`.

---

## Chrome-injection contract

Shared chrome is injected by `src/chrome.js` at boot, **before** `wire()` queries element ids —
preventing 7-way HTML drift. Boot order:
`readTokens → injectChrome → injectCardChrome → [injectLibraryChrome] → build → onboarding →
[problemLib] → wire`. Each injected node is `hidden` until its owning feature reveals it (via
`cfg.ui` / `cfg.mode` / `cfg.compareGate` / `cfg.problems`), so intro lessons stay clean.

| Injector | Mount | Injects |
|---|---|---|
| `injectChrome(#sim-viewport)` | `#sim-viewport` | `#wizard-toggle`; the `.vp-cluster` (`#quick-views` Top/Front/Side, `#connector-toggle`, `#compare-chip`); `#compare-card` (head tab + expand + close, `.compare-card__stage`); `#fa-symbol`; `#vp-orbit-hint`, `#vp-spotlight`, `#vp-flow-note`; `#sim-toast`, `#sim-context-lost`; `#workbench-rail` (empty until the Lines workbench reveals it) |
| `injectCardChrome()` | `#reset-control` + `.step-card` | `#reset-confirm` strip (`btn-reset-yes`/`btn-reset-cancel`) beside the ghost Reset; `#done-badge` before the card nav |
| `injectLibraryChrome()` *(only if `cfg.problems`)* | `.wizard-main` + `<body>` | `#open-problem-library` entry + `#active-problem` panel above the card/rail row; the `#problem-library` overlay appended to `<body>` (must escape ancestor overflow) |

Both injectors are idempotent (each bails if its sentinel id already exists). The SR utility class
is **`.sr`** here (Module 2's `.sr-only` was renamed on port). No hard-coded colours — `shell.css`
drives every visual from the shared tokens.

---

## Problem Library

Config-driven controller (`src/problemLibrary.js`), the **same code for both sims** —
`initProblemLibrary(sim, problems)` where `problems = { list, tiers, fieldLabels, entryStep }`
(`src/pointProblems.js` / `src/lineProblems.js` supply the data). The engine wires it only when a
lesson ships `cfg.problems`.

- **Controller seam:** the engine's `simFacade()` exposes
  `{ state, hasWork, isBusy, reset, goStep, announce, toast, flowNote, cueHint, firstControl,
  onStateChange }`. The self-check subscribes via `onStateChange` and sees every change through
  `rebuild()`'s single `notifyStateChange` seam.
- **Modal:** full-viewport (`--z-overlay`, `libraryIn`), focus-trapped, Escape to close, the rAF
  loop paused while open (`simAPI.pause/resume`); a tiered `.problem-grid` of `.problem-card`s; a
  "clears your current work" confirm strip gated on `sim.hasWork()`.
- **`#active-problem` panel:** the pinned statement (collapsible), scaffolded hints revealed one at
  a time (`hintStepIn`, "Showing 1 of N"), a neutral→`--color-success` self-check status, and a
  "Complete & next problem" CTA shown only on a green check → toast → reopen library.
- **Never auto-fills.** Loading a problem `reset()`s to defaults and routes to the dial-able step
  (Points → the final solve step; Lines → the matching case step via `entryStep`). The student
  dials the setup by hand; the ±0.5-tolerant check lights green on a match (M2 pedagogy).
- **Intro lessons** ship no `problems` key → the feature is fully absent (no markup, no controller,
  zero cost).

---

*Module 1 — premium interaction layer over the shared `src/engine.js` + `src/shell.css` frame.
Colour / type / spacing: see the root `../DESIGN.md`. Architecture & conventions: see `CLAUDE.md`.*
