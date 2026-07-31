# Changelog

## 2026-07-31
- Added: "Finish lesson" button (Module 2 Finish-button pilot rollout) — `#btn-finish` takes over the footer's primary slot at Step 4 exactly when `#btn-next` vacates it. Gated on `state.dimensions` (the Step-4 dimensions reveal — the lesson's real content payoff, not mere step arrival). Click posts `sim:complete` and announces "Lesson marked complete." (`src/main.js`, `src/stepper.js`, `index.html`.)
- Changed: `sim:complete` (`markComplete()`) drops its one-shot `window.__simComplete` latch — fires on every "Finish lesson" click now, replacing the old auto-fire from `completeLesson()` on dimensions reveal. `completeLesson()` keeps its toast + narration as a standalone content-milestone celebration, decoupled from the host signal. (`src/main.js`, `src/stepper.js`.)

## 2026-07-28
- Added: a new `markComplete()` posts `{ type: 'sim:complete' }` to `window.parent` once, called from `completeLesson()` when the Step-4 dimensions are revealed — the host's second sanctioned signal, for a "next topic / stay" overlay (ADR-078 addendum). (`src/main.js`.)

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002). (`src/main.js`.)

## 2026-07-09 (ADR-032 scrollbar retint)
- Fixed: the `.card__scroll` scrollbar pill was still tinted `--color-accent` (the surrounding CSS comment already described the border token) — WebKit thumb + Firefox `scrollbar-color` retinted to `var(--color-border)` per ADR-032 Quiet Chrome.

## 2026-07-09 (Viewport polish — Front View button removed, Ø30 arrowhead fixed)
- Removed: the "Front View" viewport chip (`#btn-front-view`) and its click listener — the ortho elevation remains reachable through `simController.frontView()` and exits via the existing drag-back path, so the viewport chrome slims to just "Turn 90°". (`index.html`, `src/main.js`.)
- Fixed: the Ø30 bore-leader arrowhead was built with its back-spread along +Z, standing 90° out of the front annotation plane — from the front it rendered edge-on as a bare line. The spread axis is now the in-plane perpendicular of the 45° leader, so the filled 3:1 wedge faces the camera like the L/H arrowheads. (`src/annotations.js`.)

## 2026-07-03 (anim.js re-synced to the master)
- Fixed: `src/anim.js` had drifted from the byte-identical platform copy (RULES.md §7.1) — its comments were rewritten for this topic and the unused `easeDraw`/`easeDissolve` exports were deleted. Overwritten with `Module2/src/anim.js` verbatim (SHA256-verified identical); no functional change here, since this topic only imports `tween`/`tick`/`cancelAll`/`easeCamera`/`easeStandard`, all unchanged.

## 2026-07-02 (Scrollbar pill retinted to --color-border)
- Changed: The floating step-card scrollbar thumb (WebKit) and Firefox `scrollbar-color` were retinted from `--color-panel` to `--color-border` (#d9d2c3, ~1.28:1 on the card paper) — a touch more presence than the near-invisible panel tint, matching the "Quiet Chrome" aesthetic. (Note: the pre-change tint was `--color-panel`, not `--color-track` as assumed in the finalizing request.)

## 2026-07-02 (Floating padded scrollbar pill — panel-tinted)
- Changed: The step-card scrollbar is now a floating, padded pill — the WebKit channel widened to 10px with a 3px transparent border + `background-clip: padding-box` on the thumb, so only the inner ~4px paints and the pill floats clear of both edges.
- Changed: Thumb + Firefox `scrollbar-color` retinted from `--color-bench-grey` to `--color-panel` (the wizard-panel fill) so the pill reads as part of the chrome.
- Note: `--color-panel` (#efebe1) on the card's `--color-paper` (#faf8f3) is only a 1.12:1 contrast, so the pill is near-invisible at normal scale — this softens the earlier "Visibility of System Status" intent. Floating/padding mechanics verified in Chrome 149 (10px channel, 4px painted pill); swap to `--color-border`/`--color-track` if a touch more presence is wanted.

## 2026-07-02 (Minimal token-aware step-card scrollbar)
- Changed: The step card's inner scroll region (`.card__scroll`) no longer hides its scrollbar — replaced `scrollbar-width:none` + `::-webkit-scrollbar{display:none}` with a minimal, token-tinted scrollbar so students can see there is more content below the fold (Nielsen "Visibility of System Status" fix from the Impeccable critique).
- Changed: Split the styling per engine so Chrome renders the intended crisp look — a 6px rounded `var(--color-bench-grey)` pill on a transparent track via `::-webkit-scrollbar`, with `scrollbar-width:thin` + `scrollbar-color` scoped to Firefox only under an `@supports (-moz-appearance:none)` guard. (Setting `scrollbar-width` unconditionally makes Chrome 121+ ignore the WebKit 6px rules and fall back to its ~11px native bar with arrow buttons.)
- Changed: Removed two now-stale comments that described the card scrollbar as "intentionally hidden".
- Verified (Chrome 149): the live scrollbar measures 6px and renders as a rounded bench-grey pill with no arrow buttons while the card overflows.

## 2026-07-02 (Un-collapse "How it is drawn" + verify shipped UI)
- Changed: Each step's reveal buttons now sit above its "How it is drawn" paragraph (new `#step-post-body` below the controls) so the interactive buttons aren't buried below the intentionally-hidden card scrollbar; Step 1 keeps its prose contiguous.
- Changed: The "Front View" and "Turn 90°" viewport buttons now use Module 2's pill styling (panel fill, hairline border, semibold text, solid-accent latched Front View) as **two separate side-by-side chips** — not fused into one segmented container.
- Changed: Reverted the "How it is drawn" progressive-disclosure accordion — all three step sections ("What it is", "Why we use it", "How it is drawn") now render inline and fully visible by default, matching the flat Module 2 step card; the dead `.step-more*` CSS was removed.
- Verified: The viewport-chip styling (`.vp-chip` pills on Front View / Turn 90°), the Front-View toggle + smooth ortho→perspective exit on drag/scroll, the hidden step-card scrollbar, and the removed "Lesson Completed" note were all confirmed already-present from the 2026-06-30/07-01 passes — no code change needed (the earlier mismatch was a stale browser cache).

## 2026-07-01 (Smooth Front-View exit on drag & scroll)
- Fixed: Dragging out of the orthographic Front View no longer snaps — a left-drag now eases the projection smoothly from parallel back to 3D perspective (the same `exitFrontViewSmooth` morph the button toggle uses) instead of the old instant hand-back, so there is no projection "pop" when you break out to free-orbit.
- Added: Scroll-to-zoom and pan gestures on the live Front View now also ease smoothly back to the free-orbit 3D view (hooked into the OrbitControls `start` event), where before scrolling just zoomed the flat elevation and never handed back.
- Changed: Both exit paths now share one guarded morph — the ortho controls are silenced for the length of the transition so a continued drag or extra scroll notch can't fight it, and the dead `seedPerspectiveFromOrtho` instant-swap helper was removed.

## 2026-07-01 (Typography & base-button parity — Module 2 master)
- Changed: All buttons are now non-bold (`.btn` font-weight 700 → 400), matching Module 2's `font:inherit` base so Next/Back/Reveal/Inspect read as one quiet family.
- Changed: The Step-4 "Inspect arrowhead" secondary button now uses the paper background (`--color-panel` → `--color-paper`) so its rest state is visually identical to the Back button.

## 2026-07-01 (UI/UX polish — Module 2 parity, Front-View toggle, prose density)
- Changed: Step body prose now reads in secondary ink (`--color-ink-secondary`), matching Module 2's body-text hierarchy so the bold titles carry the weight.
- Changed: The "Front View" and "Turn 90°" viewport buttons are now compact pill chips reusing Module 2's quiet quick-view/connector chip shell (panel fill, hairline border, small text) instead of two heavy white buttons.
- Changed: The Step-4 "Inspect arrowhead" control is now a real bordered secondary button so it clearly reads as clickable (was a too-faint borderless ghost).
- Added: "Front View" is now a toggle — clicking it while the orthographic elevation is live eases smoothly back to the free-orbit 3D perspective instead of only ever engaging.
- Fixed: Breaking out of Front View by dragging no longer snaps harshly — the hand-back now converts the ortho zoom into an equivalent perspective distance so the part keeps its on-screen size (and the button toggle eases the projection back in place).
- Changed: Progressive disclosure now keeps "What it is" AND "Why we use it" open by default; only "How it is drawn" hides behind the click-to-expand accordion.
- Changed: The step scroll region's scrollbar is hidden again (`scrollbar-width:none` + WebKit hide) for a clean app-like feel, matching Module 2 — no scrollbar flashes in when the accordion expands.
- Removed: The redundant "✓ Lesson Completed!" footer note — the one-shot success toast is the sole completion feedback now.

## 2026-07-01 (Impeccable critique remediation — nav, disclosure, keyboard, Front-View state)
- Fixed: Back/Next are no longer buried below a long step body — the card footer is pinned outside a new inner scroll region with a visible thin scrollbar, so primary navigation stays in view even on short laptop screens (was hidden below a `scrollbar-width:none` fold).
- Added: Progressive disclosure — each step opens with just the "What it is" paragraph; "Why we use it" and "How it is drawn" now sit in a collapsible `<details>`, cutting the three-paragraph wall of text in the narrow dock.
- Added: A "Turn 90°" viewport button plus step-change focus management, so keyboard-only learners can rotate the part to watch visible edges become hidden, and focus follows each step instead of dropping to `<body>` when a reveal button hides itself.
- Added: The Front View button now shows a pressed/active state (and the hint reads "Drag to return to free orbit") while the orthographic elevation is live, so the current projection mode is visible.
- Changed: Normalised em dashes to plain punctuation across the lesson copy, made step titles colon-separated, and reconciled the initial step title so it no longer flashes a different name on load.

## 2026-07-01 (Completion-state cleanup + Back-button parity)
- Removed: The redundant "Complete lesson" button — revealing the Type B dimensions is now the lesson's final action, so completion latches (and the success toast fires) the moment they appear, with no extra click.
- Fixed: The "✓ Lesson Completed!" note now shows only when you are on the final step AND the dimensions have actually been revealed (was showing the instant you reached Step 4); clicking Back to an earlier step hides it again.
- Fixed: The success toast fires exactly once at completion — whether reached via "Reveal dimensions" or the "Inspect arrowhead" shortcut — and never re-fires when you navigate back onto the finished step.
- Changed: Confirmed Back-button parity with Module 2 (`btnBack.hidden = currentStep === 1`) so Back stays visible and functional on the terminal step.

## 2026-07-01 (Step-4 dimensioning toggle + completion note + done-badge sync fix)
- Added: A Step-4 "Dimension text" toggle (Aligned / Unidirectional) that switches how the vertical height value sits — Aligned rotates it to read up the right edge (BIS default), Unidirectional keeps every value horizontal — so learners can compare the two dimensioning systems live.
- Added: A calm "✓ Lesson Completed!" note that takes the place of the (absent) Next button in the footer on the terminal step, so the nav never sits empty at the end of the lesson.
- Fixed: Clicking "Inspect arrowhead" before "Reveal dimensions" now ticks the Step-4 done-badge and unlocks the rail check — the micro-zoom's force-reveal of dimensions now syncs the stepper's own state instead of only flipping the engine layer.
- Changed: Dimension value pills now wrap their text in an inner span (CSS2DRenderer owns the outer element's transform), so the height value can rotate with its paper background intact.

## 2026-07-01 (Pedagogy wired in + strict BIS dimensioning + arrowhead micro-zoom)
- Added: The `foundationSteps.js` lesson content now actually renders — `stepper.js` paints each step's textbook `body` prose into a new `#step-body`, so learners see the What/Why/How notes, not just the one-line lead (resolves the "authored but NOT yet rendered" note below).
- Added: `src/terms.js` — an event-delegated glossary popover that defines the inline `.term` words on hover/focus/tap in one shared `#term-pop`, working even though the term buttons are re-injected on every step.
- Changed: Type B dimension arrowheads are now BIS-correct — closed, solid-filled triangles at a strict 3:1 length:width ratio (were open "<" strokes at ~1.22:1), and extension lines overshoot the arrowhead tip by 2.5 mm (was 1.8 mm), inside the 2–3 mm rule.
- Added: A Step-4 "Inspect arrowhead" micro-zoom that dollies the camera in close to a dimension arrowhead so the 3:1 ratio and overshoot are legible, and pulls back on toggle / Back / step navigation / Reset.

## 2026-07-01 (Content & Pedagogy Upgrade — foundations content model)
- Added: `src/foundationSteps.js` — the single source of truth for the four-step lesson copy, now carrying full textbook notes (What it is / Why we use it / How it is drawn) as a `body` array per step, plus a `TERMS` glossary of 12 inline definitions, so the pedagogy lives in one authored data module instead of the terse `lead` strings baked into `stepper.js`.
- Note: This new module is authored but NOT yet rendered — `stepper.js`/`index.html` still show the old inline `lead` text and have no `body`/glossary wiring; a follow-up render pass is needed to actually inject these notes into the step panels.

## 2026-07-01 (crisp boss/base junction + Module 2 line parity)
- Fixed: The tiny line fragment that "poked out" past the boss/base corner is gone — the flush-seam mask now finds the EXACT point where the base's top arris passes behind the boss (by bisection) and injects it as a slice boundary, so the drawn line clips crisply at the corner instead of ending at the nearest ½-unit slice edge (measured overshoot dropped from 0.1 units to ~0).
- Changed: Hidden Type E/F lines are now genuinely thinner (1.5 px) than visible Type A lines (2.5 px), matching the Module 2 master exactly, so a rear edge reads as a lighter dashed line rather than a same-weight dashed one; dash size/gap already matched Module 2 (0.12 / 0.08) and `LineMaterial.resolution` stays synced on resize so these pixel weights render true.

## 2026-07-01 (flush-seam filter + crease self-occlusion fix at the body↔foot junction)
- Fixed: The false horizontal seam where the boss meets the base is gone and the part reads as one seamless casting — a coplanar-coverage test in `lineDrawer.js` drops both the boss's redundant bottom edge AND the stretch of the base's top arris that passes behind the boss (per sub-segment, so the arris survives at its two exposed ends), because the flush interface is a continuous flat surface, not a real crease.
- Fixed: The genuine left/right creases (boss side walls stepping onto the base top) no longer flicker while orbiting — the raycast sample bias now negates BURIED contact-face normals, so a crease sample nudges up-and-outward into free air instead of down into the base slab where it self-occluded (false-occlusion in the realistic orbit cone dropped from ~1.6% to 0%).
- Changed: These fixes live purely in the math/classification layer (`lineDrawer.js`) — no geometry change in `bearingBlock.js`, no CSG. The premise that the junction edges are non-manifold no longer holds (the foot-less body geometry makes them all 2-face), so the fix keys off a per-plane coplanar-face index rather than an incident-face dot test.

## 2026-07-01 (partial-occlusion fix on long edges)
- Fixed: Long arrises that pass behind the boss now render PARTLY solid and PARTLY dashed instead of being branded entirely one way. The hidden-line test used a 3-sample majority vote per edge, so a full-width base-slab edge whose middle is blocked by the boss while its ends stay visible was misclassified (phantom solid line / missing dashes). Each edge is now cut into ≈0.5-unit sub-segments and the line-of-sight test runs per sub-segment, so one edge draws solid·dashed·solid exactly where it leaves and re-enters view as the part orbits.
- Changed: Chose mathematical edge subdivision in `lineDrawer.js` over physically splitting the base mesh — the occlusion boundary slides along the edge as the camera orbits, which a fixed geometric split cannot track, and splitting would add flush coincident seams the classifier already fights. Adjacent same-state sub-segments are merged into one stroke at draw time (clean dash phase, low vertex count).
- Perf: No regression — short edges (the bulk of the part) now cast 1 ray instead of up to 3, offsetting the extra rays on the ~dozen long arrises. Measured ~560–587 rays/pass, settling to ~6 ms warm (≈19 ms cold), well inside the 60 FPS budget.

## 2026-06-30 (Phase 3.2 — persistent X-ray, seam & hidden-line fixes)
- Changed: X-ray ("Reveal hidden lines") is now a PERSISTENT toggle — the see-through state survives moving to Steps 3 and 4 (centre lines and dimensions layer onto the wireframe) and clears only when toggled back on Step 2 or on Reset, instead of snapping the solid back every time you left Step 2.
- Fixed: Killed the phantom horizontal seam at the body↔foot junction that made the part read as two stacked solids — a non-manifold edge whose two front faces are flush + coplanar is now classified SMOOTH (not a drawn crease), so the block reads as one continuous solid.
- Fixed: Visible body/foot corner lines no longer vanish and rear rims (bore / mounting holes) reliably show dashed — interior occlusion samples are now nudged a hair off the surface they lie in (along the summed face normal), so a grazing line-of-sight ray stops self-occluding genuinely visible Type-A edges into the invisible hidden batch.

## 2026-06-30 (Phase 3.1 — restore dashed hidden lines, keep X-ray)
- Fixed: Restored the dashed Type E/F hidden lines that Phase 3 wrongly deleted — the CPU line-of-sight occlusion raycaster + `three-mesh-bvh` are back, and edges are again split into a solid Type-A (visible) batch and a dashed Type-E/F (hidden) batch. The solid-vs-dashed distinction is the core lesson, so this is required, not optional.
- Changed: Step-2 X-ray now reveals a true engineering wireframe — solid front edges + DASHED rear edges. The X-ray hides only the block's material (`material.visible=false`); the mesh stays in the scene so the raycaster keeps classifying against the geometry and the rear edges stay dashed. The dashed layer is shown exactly when X-ray is on.
- Changed: Re-added `three-mesh-bvh@0.7.8` to the CDN import map and restored the `computeBoundsTree`/`disposeBoundsTree`/`acceleratedRaycast` patches + the BVH build/dispose in the `rebuild()` contract.
- Docs: Logged the reversal as an addendum to ADR-029 (+ ADR-030 status) and a "DO NOT DROP THE RAYCASTER" note in the topic CLAUDE.md, recording that GPU-depth hidden-line removal cannot teach dashed lines.
- (Kept from Phase 3: the `projectionMorphK` Front-View camera morph + `src/anim.js`, and the Reset-button UI parity — none of that was reverted.)

## 2026-06-30 (Phase 3 — projection morph, X-ray overhaul & UI parity)
- Fixed: The "Front View" no longer hard-swaps perspective→orthographic at the end of the glide (the visual "pop"). Ported Module 2's `projectionMorphK` matrix-blend — `applyProjectionMorph`/`clearProjectionMorph` + an anim.js-driven `tweenCamera` on the `easeCamera` curve — so the projection now morphs smoothly to parallel across the same eased move and lands on a true elevation with no cut.
- Added: `src/anim.js` (the Module 2 tween engine + bezier ease palette), and wired the render loop to step its tweens (so `simAPI.pause()` halts in-flight camera moves) and stamp the morph last each frame.
- Changed: Step 2 is now an X-ray reveal, not dashed hidden lines. ALL edges draw as one solid Type-A batch; the opaque solid's depth buffer hides the rear edges, and the Step-2 button toggles the solid's faces off (`material.visible=false`) to reveal the full wireframe behind it — restored on toggle-back or when leaving the step.
- Removed: The dashed (Type E/F) line rendering, the per-edge line-of-sight occlusion raycaster, the `three-mesh-bvh` dependency it needed, and the standalone "Hide Solid" viewport toggle — hidden-line removal is now the GPU depth buffer's job, so the whole occlusion stack is gone.
- Changed: Reset button restyled to exact Module 2 parity — `.btn--ghost` is now small, borderless, regular-weight, secondary ink (was a full bordered button); Back is a plain `.btn--nav`. Confirmed the scene background is the `--color-paper` token.

## 2026-06-30 (Phase 2 — logic & interactivity)
- Changed: Renamed the four lesson steps to the BIS designations — Type A / Type E·F / Type G / Type B (rail shows the bare type, card heading keeps a short descriptor) — so the wizard speaks the standard, not generic verbs.
- Added: A "Complete lesson" button on Step 4 (surfaces once dimensions are revealed) that fires a calm success toast and checks off the final step, giving the lesson a satisfying terminal state without resetting the finished drawing.
- Added: An orthographic "Front View" — the button now glides head-on then swaps to a true parallel-projection elevation (the bore reads as a perfect circle), via a Module 2-style dual-camera setup; a left-drag or Reset hands control straight back to the perspective free-orbit camera.
- Added: A "Hide Solid" viewport toggle that hides the block's faces while keeping the classified wireframe (toggles the material, not the mesh, so hidden-line occlusion keeps running).
- Fixed: Hidden (Type E/F) dashed lines now render at the same 2.5px weight as the visible (Type A) solid lines, so only the dash pattern — not a thinner stroke — distinguishes them.
- Fixed: The "Type E/F — hidden" callout now anchors on the rear bore rim (a genuinely occluded edge) instead of a mounting-hole top that often reads visible.

## 2026-06-30
- Changed: Harmonised the stepper UI to the Module 2 master standard — the step card and progress rail now sit side by side in a `.wizard-main` row (white card left, vertical numbered rail right) instead of stacked full-width sections, so the steps no longer read as separate blocks.
- Changed: The `#step-card` is now an enclosed white box (paper fill, hairline border, rounded corners) and its text uses the shared `--text-title`/`--text-sm` tokens, matching Module 2's font sizes.
- Changed: Reset is now an inline `.btn--ghost` pinned to the left of Back/Next inside the card footer (`.card__nav`), replacing the full-width Reset bar.
- Removed: the redundant "Engineering Graphics — Foundations — BIS line types" wizard heading (the document `<title>` already carries the topic name).
- Changed: Hidden-line classification now runs LIVE on every moved orbit frame (rAF-throttled in the render loop), replacing the 100ms settle debounce — solid↔dashed swaps track the drag in real time. Verified ~56–110 passes per drag at ~2.5ms median each (well inside a 60fps budget), now that the BVH made the pass cheap.
- Removed: the occlusion-pass debounce machinery (`OCCLUSION_SETTLE_MS`, `armOcclusionPass`/`cancelOcclusionPass`, the `occlusionTimer` and its clear-on-pause/dispose/stopLoop safeguards) and the now-redundant cheap `lineDrawer.updateOutline()` silhouette pass.
- Added: `three-mesh-bvh` (0.7.8, via import map — no build step, ADR-001) accelerates the hidden-line occlusion raycaster; the same 816-ray pass dropped from ~270ms (brute force) to ~19ms median (~14× faster, ~23µs/ray). BVH built once per `rebuild()` and freed via `disposeBoundsTree()` before the geometry (ADR-004).
- Added: opt-in occlusion profiler in `lineDrawer.reclassify` (set `window.__simProfile = true`) logging pass time, ray count, and edge count.
- Fixed: Bearing-block body no longer redraws the full base slab — it now starts at the slab top, ending the overlap that produced non-manifold "spiderweb" edges and the filled-hole false occlusion that hid genuine edges.
- Fixed: `meshAnalyzer` now drops zero-area (degenerate) triangles instead of storing a (0,0,0) normal, killing the phantom sharp-crease seams those slivers caused on flat caps.
- Changed: `SMOOTH_DOT` 0.90→0.80 and mounting holes 16→24 segments — restores a generous coplanarity margin now that the geometry is clean, instead of hugging the fragile 0.90 the coarse holes forced.

## 2026-06-29
- Changed: Lowered curve tessellation (bore/dome 48→24 segments, mounting holes 24→16) to cut triangle count and make the occlusion raycaster cheaper.
- Changed: Lowered `SMOOTH_DOT` 0.93→0.90 so the coarser bore/hole facets still read as smooth surfaces (no stray longitudinal facet lines on curved walls).
- Added: `lineDrawer.updateOutline()` — a cheap, raycast-free silhouette pass that keeps curved outlines tracking the orbit live every frame.
- Changed: Throttled the hidden-line raycaster — the heavy occlusion pass now runs ~100ms after the camera settles instead of every frame, fixing orbit choppiness (timer cleared on dispose/pause to keep the WebGL disposal contract intact).
