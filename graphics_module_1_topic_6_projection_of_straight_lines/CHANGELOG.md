# Changelog — Projection of Straight Lines

## 2026-08-17 — #workbench-rail becomes a two-lane row: Constructions pinned right, sliders shrink instead of wrapping (ADR-167)
- Changed: `main.js` — `WORKBENCH_GROUPS` entries gain a `lane` field; `ensureWorkbenchRail()` nests
  the Dimensions + Inclination clusters inside a new `#rail-drivers` wrapper, leaving Constructions
  as a direct rail child. `enterWorkbench()`/`exitWorkbench()` needed no changes (both address
  wrappers by descendant `querySelector`).
- Changed: `index.html` — `#rail-drivers` is `flex: 1 1 auto`, growing into the row's leftover width
  to pin Constructions to the right end (not an auto margin — flexbox §9.5 would zero the lane's own
  flex-grow). `.rail__group-body` changes `wrap` → `nowrap` (a cluster never splits mid-group).
  `.field` width changes from fixed `200px` to `clamp(158px, calc(20vw - 130px), 200px)`; the rail's
  own `flex-wrap` remains the below-floor fallback, unchanged from ADR-166's shape. `.field__num`
  narrows to `3.75rem` in the rail (was `4.5rem`, sized for a wider value string this topic never
  shows), scoped to the rail only.
- Verified live at 1536px: rail height 239px → 144px, all three clusters on one row, zero horizontal
  overflow, all five slider labels stay one line, all seven controls restore to `#controls` in
  order on split exit.
- See `../DECISIONS.md` ADR-167 for the full audit, the three rejected CSS mechanisms and why each
  failed, and the floor-width measurement (158px, not the originally proposed 120–140px).
- Fixed: Constructions cluster's title sat 25.6px lower than Dimensions/Inclination's on the same
  rail row — the two-lane row's `flex-end` bottom-aligned clusters of unequal height (Constructions'
  bare `.ctrl` button has no label line, unlike `.field`). `#workbench-rail`/`#rail-drivers` switch
  to `align-items: stretch` + `.rail__group` gains `justify-content: space-between`, levelling all
  three titles while keeping controls bottom-aligned with the slider rows (ADR-167 amendment).
- Fixed: that same fix's bottom-anchor left the Constructions buttons flush with the θ/φ slider
  *tracks* instead of their label text, 27.2px lower than requested. Scoped
  `justify-content: flex-start` to just the Constructions cluster
  (`#workbench-rail .rail__group[data-group="constructions"]`) — button top now lands exactly on
  the label top (0px off, measured live); buttons no longer align with the slider tracks, which was
  a side effect of the prior fix, not an intended relationship (ADR-167 second amendment).

## 2026-08-17 — True Length & Angles / Show Traces launchers move from #con-dock into #workbench-rail (ADR-166)
- Changed: `main.js`/`index.html` — the two construction-launcher buttons re-parent into `#workbench-rail` (a new "Constructions" cluster, alongside Dimensions/Inclination) on Compare-split entry, instead of the separate floating `#con-dock` corner widget. Reverses RULES.md §5.16's ADR-165-audit T6 clarification, at user request — the platform rule's literal "into the docked `#workbench-rail`" reading now holds for T6 with no exception.
- Removed: `#con-dock` entirely — the element, `main.js`'s `ensureConDock()`/`conDock` state, `CON_DOCK_CONTROLS`, and its ~30 lines of CSS (base rule, split rule, `.ctrl`/`.ctrl[hidden]`, `.btn` chrome + hover override). Confirmed dead first — nothing else ever docked there.
- Changed: `#workbench-rail` gains `.ctrl`/`.ctrl[hidden]` rules (180px column, ADR-051 stray-hide guard) ported from the deleted `#con-dock` styling, so the launchers keep their layout and per-step-disclosure safety in the new location. They lose the old dock's "no hover shift" chrome match to `#rail-toggle` — not ported, since nothing asked for it — and now take the rail's plain `.btn:hover`.
- Removed: `#con-nav`'s `max-width` cap, which existed only to clear `#con-dock`'s 180px column (a measured overlap fix from two sessions ago). No replacement value — left unconstrained pending a visual review now that the collision it guarded against can't happen.
- See `../DECISIONS.md` ADR-166 for the full audit, reversal rationale, and RULES.md §5.16 rewrite.

## 2026-08-17 — Beat caption moves to the 2D card's top; walkthrough buttons shrink to Module 2 parity
- Changed: the in-Compare beat caption no longer lives in the floating `#con-nav` pill above the Back/Next buttons — it's now `.compare-card__top`/`.compare-card__caption`, prepended by `main.js`'s `ensureConNav()` into `#compare-card` itself, so it reads at the TOP of the 2D drawing card (flow child, stage shrinks to make room) instead of stacked above the buttons at the bottom. `#con-nav`'s width cap loses its floor (the caption's `align-self:stretch` was the only thing that needed one) and keeps only its `#con-dock`-clearance ceiling.
- Changed: reverted last session's `--text-lead`/600 caption typography (matched to Module 2's `.method-title`, reported "distracting" with its added chip paint) — `.method-caption`/`.compare-card__caption` now share one quieter `--text-base`/400 rule with no background/border chip, just a `border-bottom` on the containing band. `--text-lead` is DESIGN.md-retired (post-ADR-073); this topic had reintroduced its only consumer.
- Fixed: `#con-nav-back`/`-next` and this topic's own `#method-back`/`-next`/`-exit` read visibly larger than Module 2's equivalent buttons — confirmed by cascade audit (both sides' plain `.btn` is identical; the gap was a `min-width: 96px` floor plus a missing `.btn--small` class Module 2 has carried since ADR-095). Ported `.btn--small` (32px/`--space-3`/`--text-sm`) and applied it to all five buttons across both walkthrough surfaces; deleted both `min-width: 96px` rules.
- See `../DECISIONS.md` ADR-165's second amendment for the full audit and regression check against the two prior sessions' width-cap and empty-caption fixes.

## 2026-08-16 — `.con-nav` caption splits into its own banner above the buttons pill
- Changed: `index.html` — the in-Compare step-through nav's caption (`.con-nav__caption`) is no longer painted inside the same pill as its Back/Next buttons; it's now a separate bordered chip stacked above `.con-nav__btns`, matching Module 2's Show Method (heading on top, buttons in a pill below, `.method-title`'s `--text-lead`/600 typography). Markup was already split (`ensureConNav()` unchanged, `main.js` untouched) — only the shared pill-chrome CSS rule moved off `#con-nav`'s root onto its two children. Empty captions (the default state through the ~9s continuous auto-play) go `visibility: hidden` so no blank chip floats over the drawing; the reserved `min-height` still stops the buttons pill from jumping when the first beat's caption lands. `#con-nav`'s existing width cap (ADR-165 amendment's `#con-dock` overlap fix) is untouched — the buttons pill is now narrower than before, the banner fills the same capped width the combined pill used to.

## 2026-08-16 — `.con-nav` repositioned to a bottom-centre floating pill
- Changed: the in-Compare step-through nav (`.con-nav`) is no longer a row docked inside `#con-dock`'s 180px launcher column — it's now its own top-level `<body>` child, floating bottom-centre over the 2D drawing pane via the same CSS-Grid overlap idiom `#rail-toggle`/`#con-dock` already use, and wearing `.method-bar`'s own pill chrome (grouped into one shared CSS rule). Completes the sizing parity ADR-165's amendment (2026-08-15) couldn't finish because the 180px column would have overflowed; the Next-primary/Back-secondary hierarchy that amendment established carries over unchanged, now from the base `.btn--primary` class instead of a `#con-dock`-specificity override (3 dead override rules + 2 dead hover rules removed). Truelength/traces launchers stay in `#con-dock` — unchanged, a separate deferred decision.

## 2026-08-15 — Show Method follow-ups: beat-to-beat tween, `.con-nav` button hierarchy (ADR-165 amendment)
- Fixed: stepped Next/Back (both the Show Method takeover and the in-Compare `.con-nav` row) jumped straight to each beat's end state with no reveal motion — `src/constructionStepper.js` now tweens `p` from the previous beat's t to the new beat's t (duration proportional to the beat's own span, clamped 350–1200ms, `anim.js`'s `easeDraw`) instead of snapping, matching the quality of the continuous 9s Replay animation. Pre-existing gap in stepped nav, not a regression from ADR-165 — confirmed the stepper snapped identically before the takeover existed.
- Added: `src/constructionStepper.js` gains an optional injected `startTween` driver (keeps the leaf module import-free, RULES.md §3.6) and a `dispose()` handle; `main.js` wires both `.con-nav` and the Show Method takeover to the same driver and calls `dispose()` before dropping a construction leaf, so an in-flight tween can never call `animate()` on a disposed overlay.
- Changed: `index.html`/`main.js` — `.con-nav`'s Back/Next buttons now match `.method-bar`'s hierarchy (Next primary, Back secondary) instead of reading as two identical unstyled buttons; cosmetic only, both entry points unchanged functionally.

## 2026-08-14 — Show Method: a full-viewport, beat-gated True-Length walkthrough (ADR-165)
- Added: `src/methodView.js` — a full-viewport, focus-trapped Show Method takeover (`#method-view`, a direct `<body>` sibling of `#problem-library` following its exact overlay recipe), launched from a new primary button on Step 4 once folded. Presentation only: delegates all beat state to the EXISTING `constructionStepper.js` (the same adapter the in-Compare `.con-nav` row already uses) via a `sim.method.begin/end/canRun` contract main.js implements. Ported Module 2's `methodController.js` interaction CONTRACT (the `{sync,dispose}` handle, one `AbortController`, the focus trap, Escape/Space handling) — not its code, and not its Sets/chip/ghost machinery, which this topic has no equivalent of (one line, one construction — beats-only is genuinely all that's needed here).
- Added: `main.js` — `methodBegin()`/`methodEnd()`/`canShowMethod()`. Opening re-parents the 2D Compare sheet's EXISTING `.compare-card__stage` into the takeover and back (ADR-076's own-canvas sheet architecture is untouched — no 3rd WebGL context) and builds a construction leaf independent of the in-Compare `conLeaf`, so the two entry points never share or fight over one mounted overlay. Deliberately does NOT route through `ensureCompareForCon()`/`enterWorkbench()` — either would force-unfold the sheet and destroy the launcher's own `folded` precondition (the same mistake Module 2's ADR-085 moved Show Method out of Compare to fix). Deliberately does NOT call `simAPI.pause()` either — Module 2 pauses because its takeover fully covers a 3D scene it no longer needs; here the takeover IS the sheet renderer's only visible surface, and pausing would cancel the very render loop that repaints it.
- Changed: `src/trueLength.js` — the Method I rotating-line construction grows from 12 to 14 phases (`TL_N` 12→14), auditing the existing table against `True Length.pdf` figs 10-15/10-16/10-17 turned up three real defects, fixed alongside the beat-count change: (1) two of the figure's four loci (`ef`/`cd`, the reference lines through the PIVOT points) had no line objects at all — only `pq`/`rs` were ever drawn; added `tvPivLoc`/`fvPivLoc` and a new setup beat that reveals all four together, before the swing/arc/project sequence, matching the textbook's own drawing order. (2) Part B's recovered top-view point was labelled `b₁` — Fig 10-16(ii) names it `b₂`, and the beat's own caption already said "…at b₂"; the label contradicted its caption. (3) A caption read "meet b's vertical locus" for a locus that is drawn horizontal (parallel to xy) — the *projector* is vertical, the locus is not. Beat 13's caption also folds in Fig 10-17(ii)'s "hold B, turn A" variant as a footnote (proves the pivot choice is arbitrary, adds no new geometry, so it doesn't earn its own beat). The continuous 9s auto-play (`runCon()`) and the existing `.con-nav` step-through share `animate()`, so both paths get all three fixes for free.
- Added: `index.html` — `#btn-show-method` (Step 4, `.fold-actions`), swapped to primary the instant the fold completes while `#btn-fold` demotes to secondary "Fold back to 3D" (`stepper.js` `renderActions()`) — one loud action per step at every moment (DESIGN.md §5.1; ADR-162 is the precedent for why two `.btn--block` primaries on one panel is a regression). `.method-view`/`.method-bar` CSS, following the `.problem-library` overlay recipe token-for-token.
- Verified: `node --check` on all four changed/new files; manual trace of the cold-open path (Show Method launched without Compare ever having opened — `compareSheet.setData()` is now called explicitly in `methodBegin()`, since `rebuild()`'s own call is gated on `compareOpen`, which is false on that path); the render loop's sheet-paint gate widened from `compareOpen` to `compareOpen || methodOpen` (previously the sheet would never repaint on the cold-open path — the reparented stage would sit blank).
- See `../DECISIONS.md` ADR-165 for the full container/beat-model rationale and the architectural comparison against Module 2's Show Method.

## 2026-08-12 — Reference grid calmed to Module 2 parity
- Fixed: the 3D viewport's HP/VP reference grid (`src/lineRig.js`) rendered visibly darker than Module 2's equivalent grid — it painted grid lines in the plane's own hue (teal/amber) at 0.55 opacity, a leftover from the Points `hvPlanes.js` "cage" pattern, instead of the neutral `--color-border` token at 0.35 opacity DESIGN.md §2.1 documents and Module 2 (the master reference) actually ships. Each plane's hue still reads via its fat-line perimeter border, untouched.

## 2026-08-05 — Discrete step-through for True Length & Angles / Traces (ports Module 2's Show Method pattern)
- Added: `src/constructionStepper.js` — a thin Next/Back adapter over `trueLength.js`/`traces.js`'s existing `animate(p)` contract, modelled on Module 2's `methodController.js` (one int of local state, Next/Back, a caption sync, no read-back into the leaf). Unlike Module 2's Show Method, no snapshot/harvest step is needed: `animate(p)` is already a pure, idempotent function of `p`, so stepping is just calling it with a discrete `t` instead of a ramping one.
- Added: `phases` arrays on the leaf object returned by `createTrueLength()`/`createTraces()` — per-construction breakpoint tables (`{t, caption}`) along each leaf's own existing animation domain (trueLength.js's `G/TL_N` or `G/TL2_N`; traces.js's `prog` 0–1 directly), not a shared cross-file constant (ADR-094 in Module 2 flagged exactly that hazard — ours can't drift since each leaf owns its own table). Captions grounded verbatim in True Length.pdf Art 10-8 (figs 10-15/10-16/10-17 Method I, figs 10-18/10-19 Method II), Traces.pdf Art 10-10/10-11 (figs 10-23–10-26), and Inclined to Both.pdf Art 10-5/10-6 (α/β apparent-angle wording) — 12 stops for True-Length Method I, 8 for Method II, 3/side for Traces Method I, 4/side for Traces Method II. A side with no real trace (`htReason`/`vtReason !== 'trace'`) folds its reason into that side's own first-stop slot instead of a separate stop, reusing the file's existing "NO H.T."/"NO TRACE"/"AB IN HP" wording.
- Added: `main.js` — `stepCon(dir)` (cancels the continuous rAF ramp, lazily builds a `constructionStepper` on the first Next/Back click) and `ensureConNav()` (a caption + Back/Next row built once inside `#con-dock`, re-appended on every `enterCon()` so it always lands after whichever launcher is docked). `runCon()` itself — the continuous auto-play path every existing caller (including the `prefersReducedMotion` snap-to-`animate(1)` branch) depends on — is untouched; `replayCon()` (the launcher's own "click again to restart" behavior) now also drops any live step session back to continuous mode.
- Changed: `index.html` — `.con-nav`/`.con-nav__caption`/`.con-nav__btns` CSS for the new row. Deliberately not reusing the `.ctrl` class the True Length/Traces launcher wrappers use — `#con-dock .ctrl[hidden]{display:flex!important}` (so a stray reset can't re-hide a docked launcher) would otherwise fight the nav row's own `hidden` toggle.
- Changed (polish, found while smoke-testing): two Method II caption pairs (`trueLength.js`'s "Join the two perpendiculars' far ends…" and `traces.js`'s "Erect the second perpendicular, completing the trapezoid.") read byte-identical between their top-view and front-view stops. Harmless functionally (each still lands on the correct geometry), but confusing side-by-side — added "on the top view"/"on the front view" qualifiers to disambiguate.
- Verified: headless Edge via raw CDP (no browser extension available this session, so driven directly over the Node 22+ built-in `WebSocket`/`fetch` rather than Claude-in-Chrome) — 14/14 scripted checks: forward/back navigation lands on the correct caption at each stop for True-Length Method I (default line) and Method II (θ=φ=45°, forced via the θ/φ inputs), Traces Method II (same forced line), and the fold-in case (θ=0°, φ=30° — line parallel to the H.P., verified the "no H.T." caption appears at stop 1 and the V.T. side still walks its normal 3 stops); Back/Next disable correctly at the first/last stop; zero console/runtime exceptions across the whole session. Screenshots confirm the on-screen geometry matches the caption at several stops (a mid-construction True-Length Method I frame, the completed Method II trapezoid pair with α/β/θ/φ all visible, and the fold-in case showing "NO H.T." struck through on the top view alongside a fully-drawn V.T. construction on the front view).

## 2026-08-04 — True-Length no-op fixed; apparent angles (α/β) drawn; dead validity check removed
- Fixed: `createTrueLength()`'s Method I rotating-line construction (`src/trueLength.js`) ran its full 9000ms animation even at the default θ=φ=0 state, where both views are already true length and the rotation locus sweeps zero radians — 9 seconds of visibly nothing. Now gates on `layout2D()`'s existing `fvTrue`/`tvTrue` flags (previously computed but unused by this module) and returns a 400ms duration when both are true; every genuinely inclined case (45/45, one-incline, perp-HP/VP, Method II) keeps the full duration, unchanged.
- Added: α/β (apparent angles of inclination, Inclined_to_Both.pdf Art 10-5 fig. 10-13 — "always ≥ θ/φ") now drawn as a second, wider arc nested at the same pivot as θ/φ, in both the Method I and Method II branches of `src/trueLength.js`. The direction was already sitting unused in scope (`startB`/`startA` in Method I — the original unrotated view's own angle; the raw `P→Q` segment angle in Method II) — no new trig, just a second arc + label reusing the existing pattern. `lineData.js`'s `alpha`/`beta` (computed since the original topic build, never consumed anywhere — confirmed by grep) now finally reach the screen.
- Fixed (found while verifying the above via headless Chrome, not by inspection): the new α/β labels were positioned via `bisectorAnchor(pivot, angle, R * 1.4)`, where `R` (`PLACEMENT.sheet2D.angleRadius`) is an `{x,y}` object — `R * 1.4` silently evaluates to `NaN`, so the labels rendered at `NaN` coordinates (invisible, no thrown error; the analytic/stub test harness couldn't catch this because its `bisectorAnchor` stub ignores its arguments). Fixed to `{ x: R.x * 1.4, y: R.y * 1.4 }`. Caught only by actually looking at the headless screenshot, not by the "zero console errors" check — logged as a reminder that a clean console does not mean a correct render.
- Fixed (same verification pass): `resolveLine()`'s `valid` flag (`src/lineData.js`) — `lat2 >= 0` — flips to `false` at floating-point noise (~1e-13, an order of magnitude below any real invalid margin) right at the exact θ+φ=90° boundary (e.g. θ=75°, φ=15°, both integer-slider-reachable), because `sin²θ+sin²φ` can land fractionally above 1 there even though the trig identity says it's exactly 1. Previously harmless since nothing read `valid`; now that F8 (below) wires it into the UI, an unpatched boundary would have shown a spurious "θ+φ must stay ≤90°" warning at a perfectly valid angle pair. Added an `eps*TL²` tolerance (reusing the module's existing `1e-6` epsilon convention). Verified equivalence with the old check across a 361-point grid (0–90° in 5° steps on each axis, both axes) post-fix — no inversions.
- Removed: `uiManager.js:165`'s duplicate `(data.theta + data.phi) > 90` validity check — proved algebraically equivalent to `lineData.js`'s `valid` flag (`sin²θ+sin²φ≤1 ⟺ θ+φ≤90°` for θ,φ∈[0°,90°], via the `sin²+cos²=1` identity at the boundary plus strict monotonicity) before deleting, not just assumed. Routed through a new `simController.isValid()` (`main.js`) rather than importing `lineData.js` into `uiManager.js` directly — RULES.md §3.6 only names `genericSolid.js`-style pure-math modules as the cross-leaf-import exception, and `lineData.js` isn't on that list, so the orchestrator stays the one place leaves meet.
- Verified: analytic case matrix (θ=φ=0 duration gate across 7 cases, α≥θ/β≥φ + arc-direction-matches-resolved-value across 5 cases including asymmetric ones, F8's grid re-proof through the real `resolveLine()` — 28 assertions total, all passing) + the existing 97-assertion trace regression suite (unaffected, still 97/97) + a Method-I/Method-II runtime smoke test (7 cases, no throw, correct duration per case) + headless Chrome via CDP (ADR-019): clean boot, zero console errors across two independent page loads, screenshots confirm the default state completes near-instantly (not mid-rotation) and the α/β arcs render as a visibly distinct outer arc with correct values (α=41° vs θ=25°, β=58° vs φ=50°, at TL=90/θ=25°/φ=50°).
- Noted, not fixed (orthogonal to this pass): re-entering a construction (e.g. True Length & Angles) a second time within the same page session, right after changing sliders, intermittently failed to repaint on the 2D sheet in headless Chrome even though `conMode`/the button label updated correctly — only ever reproduced across two `enterCon()` calls in one uninterrupted session; a fresh page load each time (the two-run headless test above) never showed it. Not touched by this diff (no F6/F7/F8 code path change explains it) and not confirmed as user-reachable; flagging for awareness, not claiming it as a bug.

## 2026-08-04 — In-plane traces distinguished from "no trace"; explicit callouts added
- Fixed: `computeTraces()` (`src/sheet2DLayout.js`) reported `noHT`/`noVT` for two physically different situations with no way to tell them apart — a line genuinely parallel to a plane at a nonzero offset (Art 10-9(i), correctly no trace) and a line lying WHOLLY in that plane (θ=0 or φ=0 combined with a zero HP/VP offset — every point of AB is common to the line and the plane, so there's no single trace point, a third outcome distinct from both "a real trace" and "no trace"). Both collapsed onto the same `xAtY`/`yAtX` null-guard. Affects the shipped **`ln-incl-vp-2`** problem (θ=0, aHP=0) on its HT side; no other shipped problem is affected (checked all 12). Confirmed the existing single-end-in-plane case (fig. 10-22(i), e.g. `ln-incl-both-simple`) was already correct and is unchanged.
- Added: `htReason`/`vtReason` fields on `computeTraces()`'s return, one of `'trace' | 'parallel' | 'inPlane'` per side — same discriminator pattern as F1/ADR-110's `method` field, not a bare boolean.
- Changed: `src/traces.js` — where `noHT`/`noVT` used to draw nothing, now shows a reason-driven callout: **"NO TRACE"** when both sides are genuinely parallel (fig. 10-20(i)), else per-side **"NO H.T."** / **"NO V.T."** (figs. 10-20(ii)/(iii), 10-21), or **"AB IN HP"** / **"AB IN VP"** for the in-plane case (this topic's own "line AB" convention — no textbook figure in the excerpted pages covers that exact degenerate combo). The point-view coincidence case (F2) now also labels its absent side instead of silently showing nothing there.
- Verified: extended the same analytic script (97/97 passing, up from 59) — `ln-incl-vp-2`'s exact case, the VP mirror, the both-in-plane edge case (all four offset sliders at zero), the single-end-in-plane regression guard, and a check that exactly one shipped problem gets an `inPlane` reason. Runtime smoke test (no throw) across the callout paths. Headless Chrome via CDP (ADR-019): clean boot, zero console errors driving all five case-matrix configurations through the Traces launcher. Screenshots of `ln-incl-vp-2` and `ln-parallel-both` confirm the callouts render at the correct on-screen location with the correct text.

## 2026-08-04 — Art 10-8 Method II; θ+φ=90° traces fixed (ADR-110)
- Fixed: `computeTraces()` (`src/sheet2DLayout.js`) put HT/VT off by the full `aVP`/`aHP` offset whenever a line's projections were both ⟂ xy (θ+φ=90°, Art 10-7's profile-plane case — e.g. TL 60, θ=45°, φ=45°, both traces analytically land ON xy). Art 10-11 requires Method II there; Method I's null-fallback silently substituted the wrong coordinate instead. Point-view traces (line ⟂ HP/VP, Art 10-9) are unchanged and now branch explicitly rather than sharing that fallback by accident.
- Added: `trapezoid()` + `methodII()`, pure exports on `sheet2DLayout.js` — Art 10-8 Method II (True Length.pdf figs. 10-18/10-19), signed offsets so problem 10-7's opposite-sides case needs no special branch.
- Changed: `src/traces.js` gained a Method II animation branch (perpendiculars → hypotenuse → produced-to-trace) for the θ+φ=90° case. `src/trueLength.js`'s `createTrueLength()` takes a `method: 'I'|'II'` param (default `'I'`, existing rotating-line construction unchanged); `main.js`'s True-Length launcher auto-selects `'II'` from `computeTraces(...).method` so both construction launchers agree.
- Verified: 59/59 analytic assertions (scratch Node script, shipped `lineData.js`/`sheet2DLayout.js` imported directly) + 16/16 proving the True-Length angle arc sweeps the exact resolved θ/φ; runtime smoke test (no throw across the full case matrix); headless Chrome via CDP (ADR-019) — clean boot, zero console errors, both launchers click through the θ+φ=90° case, `renderer.info.memory` flat across 50 real-slider-driven rebuilds.
- Not in this pass (same audit, separate scope): a line lying wholly in the HP/VP still reports "no trace" instead of Art 10-9's "coincides with the line" (reachable via the shipped `ln-incl-vp-2` problem), and there's no on-screen "NO TRACE" callout for the legitimate Method-I no-trace cases. See ADR-110.

## 2026-07-31
- Added: "Finish lesson" button (Module 2 Finish-button pilot rollout) — `#btn-finish` takes over the footer's primary slot at the terminal Step 5 "Traces" exactly when `#btn-next` vacates it. Click posts `sim:complete` and announces "Lesson marked complete." (`main.js`, `src/stepper.js`, `index.html`.)
- Changed: `sim:complete` (`markComplete()`) drops its one-shot `window.__simComplete` latch — fires on every "Finish lesson" click now. **Behavior change**: the old auto-fire sat at Step 4's fold ("Generate Orthographic Projections"); completion now requires reaching the terminal Step 5 "Traces" instead, matching Module 2 parity (confirmed change — Traces is real content, not an epilogue). The fold's own "Orthographic projection generated" toast is unchanged, still fires once on first fold. (`main.js`, `src/stepper.js`.)

## 2026-07-28
- Added: a new `markComplete()` posts `{ type: 'sim:complete' }` to `window.parent` once, fired on first fold alongside the existing "Orthographic projection generated" toast — the host's second sanctioned signal, for a "next topic / stay" overlay (ADR-078 addendum). (`main.js`, `src/stepper.js`.)

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082). (`index.html`.)

## 2026-07-25 — Tighter default 3D camera framing

- Changed: the free-orbit perspective camera's default boot pose (`CAMERA_POSITION`) is pulled in
  from a distance of ~32.8 to ~28.1 world units (same direction/target, so the same 3/4 viewing
  angle) — the old distance was tuned for the legacy 60×60 sheet and never revisited after ADR-079
  shrank it, leaving the line looking small against a lot of empty HP/VP plane. Verified the
  clip-aware auto-zoom (ADR-014) still yields to a manual orbit, still leaves ordinary single-slider
  exploration (e.g. aHP or aVP alone at its 100 mm slider max) untouched, and still dollies back
  with no clipping at the typed-field ceilings (TL 200 mm, aHP/aVP 150 mm).

## 2026-07-25 — 3D BIS dimension now rolls to face the camera in every view (ADR-081)

- Fixed: the True-Length dimension's extension/tick marks and filled arrowheads read correctly
  only in the Top quick-view; Front and Side showed a skewed parallelogram with edge-on
  (near-invisible) arrowheads. Root cause: the dimension's standoff direction was computed once
  from a fixed world-up vector (`cross(rod, worldUp)`), which is only screen-perpendicular to the
  rod from directly overhead — Top was a coincidence, not a design guarantee. `dimensions.js`
  gained `addOrientedDimension`/`orientDimension`: the same Type-B geometry is now built once in a
  dedicated group's own local frame (rod along local +X, standoff along local +Y) and that group's
  rotation is re-driven every render frame to keep the standoff perpendicular to BOTH the rod and
  the current view direction, in any camera pose (free-orbit, Top/Front/Side, or the fold swoop).
  Verified: Top is an exact fixed point of the new formula (cannot regress); Front/Side/free-orbit
  now render a clean perpendicular bracket with filled arrowheads. The flat 2D Compare sheet
  (`compareSheet.js`, a fixed square-on ortho camera) was unaffected and left untouched.

## 2026-07-25 — Floating Compare card removed; split is now the only shape (ADR-080)

- Fixed: resizing the browser while the Compare split was open could strand the 2D drawing panel
  as a small floating "picture-in-picture" window (its own title bar, expand button, close button)
  instead of the docked 50/50 split. Root cause was a one-way narrow-viewport listener (added
  2026-07-19) that demoted the split to the compact floating card below 768px but never re-entered
  the split on widening back past it.
- Removed: the compact floating Compare card entirely — `applyCompareSize`, `compareSize`,
  `isWorkbenchViewport`, the card's head chrome (tab + expand + close buttons), and the breakpoint
  listener are gone. Compare is now always the docked split, at every viewport width; below 768px
  the same split restacks to a single column instead of switching to a different Compare UI.

## 2026-07-25 — Clip-aware 3D camera auto-zoom (ADR-014)

- Added: the free-orbit perspective camera now dollies back automatically when typed-field values
  (TL/aHP/aVP up to their 150–200 mm ceilings) push the line past the default frame — the case
  ADR-079 flagged but didn't fix, since a larger reference grid can't compensate for a fixed camera
  pose. Ported from Module 2 / Module 1's `reframeIfClipped` (`main.js`); push-back only, boot/reset
  keeps the existing fixed pose unchanged.

## 2026-07-25 — 3D reference-plane overrun fixed (ADR-079)

- Fixed: at high end-A distances + steep inclination, the line's endpoint, front/top views, and
  their labels could run off the edge of the 3D HP/VP reference-plane grid. Root cause was two
  compounding mis-sizings: the planes were origin-centred (`PlaneGeometry` at `0,0`) while the
  drawing only ever occupies the first quadrant, so half of every plane's `SHEET=24` extent was
  permanently dead (real ceiling was 120 mm, not 240 mm); and the sizing was measured against the
  slider max (`r-tl` 150 / `r-ahp`,`r-avp` 100) rather than the wider typed-field ceiling
  (`uiManager.js` `inputMax`: TL 200, aHP/aVP 150 each) a learner can type directly. `lineRig.js`
  `SHEET` 24 → 44 with a new `PLANE_LIFT = 16` world-space offset (planes now span `[-6, +38]`
  instead of `[-12, +12]`), `GRID.divs` 24 → 44 to keep the 1.0u = 10 mm cell; `referencePlane()`
  gained an `offset` parameter. `labels/LabelPlacement.js`'s `PLANE_HP/VP_ANCHOR` and
  `AXIS_X/Y_ANCHOR` updated to track the new plane edges. `main.js` `SHEET_HALF` 12 → 22 (verified
  unreferenced; kept as a documented constant only). Same fix applied to the sibling
  `graphics_module_1_topic_5_projection_of_line_types` topic with its own numbers (SHEET 24 → 32,
  `PLANE_LIFT = 10`). `contentBoxWorld()`/`flatSheetBox()` (camera framing) and `sheet2DLayout.js`
  (the separate 2D Compare sheet, ADR-075) were confirmed out of scope and untouched.
- Fixed: the plane-offset fix above left VP/HP flush at the fold line instead of visibly crossing through each other (the tail past the fold line shrank from the pre-fix 12u to 6u); planes are now rectangular (fold-line width unchanged, lift axis grown to `PLANE_REACH + PLANE_OVERHANG`) so they overhang the fold line by 12u again, matching the original look, without reducing the overrun fix's reach (ADR-079 addendum).

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002). (`main.js`.)

## 2026-07-23 — Compare 2D panel gains drag-to-pan + scroll-wheel zoom

- Added: drag-to-pan and scroll-wheel zoom (zeroed-in on the cursor, clamped 0.4–5×) on the 2D
  Compare drawing, double-click to recenter/un-zoom — the same interaction Module 2 and the
  Points topic ship (ADR-054/055), re-expressed against this topic's own live ortho camera
  (ADR-076's own-`WebGLRenderer` sheet has no Canvas2D `project()` to hook into) via new
  `compareSheet.js` `resetView()`/`panByPixels()`/`zoomAtPixel()` methods + a
  `setupComparePan()` wiring in `main.js` (ADR-077). Same change applied to the sibling
  `graphics_module_1_topic_5_projection_of_line_types` topic.

## 2026-07-23 — Compare 2D panel's CSS border restored (over-corrected in an earlier pass)

- Fixed: the split workbench's 2D drawing panel (`#compare-card`) had no visible border at all,
  unlike its `#sim-viewport` and `#workbench-rail` siblings. An earlier same-day pass ("Rail
  divider removed, Replay merged into launchers...") mistook the panel's real
  `border`/`border-left: 1px solid var(--color-border)` CSS for a "leftover" duplicate of the
  hand-drawn canvas rectangle and deleted both — but only the canvas rectangle (in
  `compareSheet.js`) was ever the actual leftover; the CSS border was the panel's own legitimate
  frame (same pattern Module 2 uses). Restored `border: 1px solid var(--color-border)` on the base
  `.compare-card` rule so both the compact float and the split view keep it; the split rule no
  longer zeroes it back out. Same correction applied to the sibling
  `graphics_module_1_topic_5_projection_of_line_types` topic.

## 2026-07-23 — Rail group spacing widened

- Changed: the gap between the rail's Dimensions and Inclination clusters widened from
  `--space-6` (32px) to `--space-6 + --space-3` (44px) for clearer visual separation; still no
  divider line.

## 2026-07-23 — Compare panel hairline border: real fix; #con-dock button font size matched to platform standard

- Fixed: the 2D Compare panel's hairline border was not a CSS border at all — `compareSheet.js`
  drew its own sheet-frame rectangle in `--color-border` on every commit, a leftover from before
  ADR-076 gave the Compare card its own opaque rounded box. Removed the frame draw (the XY line
  stays); the CSS-only fix logged in the entry below verified clean via `getComputedStyle` but
  never touched this canvas-rendered line, which is why the border was still visible.
- Changed: `#con-dock`'s "True Length & Angles" / "Show Traces" buttons now use the 0.8125rem /
  600-weight size shared by the platform's other floating pill controls (`#rail-toggle`,
  `.quick-view`, `.connector-toggle`, `.compare-chip`) instead of inheriting the body's larger
  1rem base size through the generic `.btn`'s `font: inherit`.

## 2026-07-23 — Rail divider removed, Replay merged into launchers, dock buttons match Hide/Show, Compare panel hairline removed

- **Removed:** the vertical divider line between the rail's Dimensions and Inclination clusters
  (`#workbench-rail .rail__group + .rail__group` no longer sets `border-left`); the groups now
  read as distinct through spacing alone.
- **Changed:** the separate "Replay" buttons (`#tl-replay`, `#trace-replay`) are gone. Each
  construction launcher now does double duty — first click builds + plays the construction and
  relabels itself ("Replay True Length & Angles" / "Replay Show Traces"); a second click while
  active replays the same animation from the start instead of closing it (`main.js`
  `setConLabel`/`setupConstructions`). The construction still tears down via the existing paths
  (switching constructions, editing a parameter, changing step, folding).
- **Changed:** the `#con-dock` launcher buttons now match the `#rail-toggle` Hide/Show pill's
  colours exactly (panel background, secondary ink text, no hover shift).
- **Fixed:** the 2D Compare drawing panel's hairline border, in both the compact float and the
  default expanded split view — a leftover `border`/`border-left: 1px solid var(--color-border)`
  on `.compare-card` / `body.compare-split #compare-card`. A prior session's attempt only touched
  one of these two rules (or an unloaded legacy stylesheet), so the higher-specificity split rule
  kept the seam visible; both are now removed. Same fix applied to the sibling
  `graphics_module_1_topic_5_projection_of_line_types` topic, which duplicates this CSS verbatim.

## 2026-07-23 — Construction launchers moved off the rail, docked to the 2D panel's corner

- **Changed:** the "True Length & Angles" and "Show Traces (HT & VT)" launcher buttons no longer
  sit in the workbench rail's Constructions cluster; they now float at the 2D drawing panel's
  bottom-right corner (`#con-dock`, `main.js` `ensureConDock()`), mirroring the existing
  `#rail-toggle` "Hide" button's floating-corner convention on the opposite pane (3D viewport,
  bottom-left). The rail's Constructions group and title are removed — the rail now only groups
  Dimensions and Inclination. Both launchers still re-parent from and back to `#controls` on
  split entry/exit exactly as before, and keep working identically (same buttons, same IDs, same
  click handlers) — only their docked home changed. Topic-local (`main.js`, `index.html`).

## 2026-07-23 — Workbench control rail grouped into labelled clusters

- **Changed:** the docked `#workbench-rail` (shown in the 50/50 Compare split) now groups its
  seven controls into three titled clusters — Dimensions, Inclination, Constructions — using the
  platform's existing `.dock__group` convention, instead of one flat undifferentiated row, to cut
  visual congestion. Topic-local change (`main.js`, `index.html`); no control was shrunk.

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
