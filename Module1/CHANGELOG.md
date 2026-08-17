# Changelog

All notable changes to Module 1 (Engineering Graphics — Foundations of Projection).

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082). (`src/shell.css`.)

## 2026-07-20
- Changed: `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper) — `src/shell.css` `:root`; `CLAUDE.md`'s token reference updated to match.

## 2026-07-10
- Fixed: the 3D→2D fold now SWOOPS square-on to the orthographic answer sheet (ADR-036, overturning ADR-013's held-angle hold) — the shared engine's held-angle dolly (`animateFoldHold`/`snapFoldFlatHold`/`framePerspectiveToFlat`) is replaced by `animateFoldSwoop`/`snapFoldSwoop` on the existing dual-camera stack: forward engages the ortho camera, glides it front-on to the flattened sheet and morphs perspective→ortho on the hinge's `easeFold` curve; reverse glides back to the learner's retained perspective orbit pose. Drives BOTH Module 1 sims (Points via `main.js`, Lines via `lines.js`, both `orthoViews:true`); `preFoldPose` is no longer stored on these lessons (the perspective camera never moves during the swoop). (`src/engine.js`.)
- Changed: the Lines 2D drawing scale span was re-derived from `SHEET` — `SHEET2D_SPAN` 100 → `(SHEET/2)*10` (= 300 mm per half) — because the flat 100 mm span (above) could be overrun by the 150 mm True-Length slider (and a 150 mm end height), overflowing the static sheet; the absolute worst-case line now stays inside it. (`lines.js` `sheet2D`; ADR-038.)
- Fixed: the Lines 2D Compare drawing (`sheet2D`) auto-fit its scale to the line — `fit = min(1, frame/lineExtent)` — so as True Length grew the sheet zoomed out to keep the line the same on-screen size (10 mm shrank). Now a FIXED scale locked to the static sheet bounds (a 100 mm working span), so 10 mm always reads as 10 mm and a long line grows toward the sheet edge instead of the sheet shrinking around it. (`lines.js` `sheet2D`.)
- Verified: local server + Chrome — TL 60→150 grows the elevation/plan lines ~2.4× (proportional), staying within the sheet frame; no console errors.

## 2026-07-09
- Changed: `shell.css` `.step-card` scrollbar was fully hidden (`scrollbar-width:none` + WebKit hide) — replaced with the platform floating padded pill (ADR-032): 10px WebKit channel, transparent track, `--color-border` thumb floating clear via a 3px transparent padding-box border, Firefox `scrollbar-color` in an `@supports` guard (`scrollbar-width` kept off the base rule — Chrome 121+ gotcha). Hiding a scrollbar fails Visibility of System Status (PLATFORM-RULES §2.21).

## 2026-06-28
- Changed: Compare Workbench rail rhythm, second pass — slimmed the slider tracks (fields 21rem → 15rem), switched to equal spacing (space-evenly) so the gaps between parameters now also appear before the first and after the last as matching padding, and pulled each slider tighter under its label.
- Changed: Compare Workbench rail rhythm refinement — widened the gaps between the five parameter fields (slider tracks shrink to absorb it) and tightened the label-to-slider spacing within each field so the label hugs its control.
- Changed: Compare Workbench rail spacing — each parameter now holds a natural width so its slider stays grouped tight with its own label and number box, and the leftover rail width falls into even gaps between the five parameters, so the groups read as distinct units instead of one continuous strip.
- Changed: Compare Workbench rail, second polish pass — moved each control's number box up onto its label line (name, value, unit) so the slider now spans its own full-width row, widened the spacing between sliders, and grew the rail slightly to fit the two-line layout; the sliders read clearly and are easier to drag.
- Removed: the "2D drawing" title bar on top of the side-by-side Compare drawing (Lines) — it was redundant since the top-right chevron already closes the view, and removing it gives the drawing the full panel height.
- Changed: moved the "Compare 2D drawing" button above the Top/Front/Side camera-view buttons in the viewport toolbar (Lines), so the primary action sits first.
- Changed: Impeccable UI polish on the Compare Workbench rail (the slim strip of sliders under the side-by-side Lines drawings) — it was cramped because a tall wizard control got squeezed into a short bar; gave it room to breathe (taller rail, calmer 4pt spacing), put each control's unit up beside its name instead of crowding the slider, and trimmed the number box, so the slider tracks get the width and the whole strip feels like the rest of the app.

## 2026-06-27
- Added: opening the Lines side-by-side Compare now collapses the step panel and docks the True Length / distance / angle sliders in a slim strip beneath the two drawings, so the 3D and 2D views get a true 50/50 split while you can still adjust the line and watch both update at once; closing Compare (or the panel chevron) brings the steps back and returns the controls.
- Changed: the Lines "Compare" now opens a side-by-side split — live 3D on the left, the 2D orthographic drawing on the right, the step wizard still on the far right and fully operable — instead of a floating card that hovered over the 3D view, so you can drag a slider and watch both views update at once (reuses the engine's existing `compareSplit` docked-pane path; the floating PiP is retired for Lines).
- Added: HT/VT trace markers now appear in the live 3D scene while the "Show Traces" walkthrough is open — a teal dot where the line pierces the HP, an amber dot where it pierces the VP, each with a dashed extension of the line to that point — so the traces read in 3D, not only in the 2D construction; a trace that lands off the sheet (near-parallel line) is suppressed.
- Changed: the True Length is now shown in 3D as a proper offset dimension line (a thin measurement line running alongside the line with end ticks and the value) instead of a floating "TL" tag, matching blueprint dimensioning.

## 2026-06-26
- Changed: the Lines sim is now a 5-step problem-solving stepper (True Length → Distance from HP/VP → Inclinations → Generate Orthographic Projections → Draw Traces) built on one general line the learner sets up, replacing the six fixed-orientation exploration steps; each step exposes only its own control (dedicated, not cumulative).
- Changed: Lines Problem-Library problems now route to the first step and self-check on explicit θ/φ targets (the per-step LineCase was removed; the default line now starts flat), so the learner walks the dedicated steps and the check greens once all values match.
- Changed: synced Problem-Library statements to the on-screen labels — Lines problems now say "line AB / end A" and Points problems say "Point P", matching the hard-coded viewport text so the wording no longer contradicts the drawing.
- Fixed: editing an earlier step no longer wipes the later projections — nudging an early slider after reaching a later step now refills and live-updates the downstream geometry instead of reverting to that step's lean view (Points; ported from Module 2's non-destructive reflow).
- Added: a visible "Unfolded to 3D so you can see your change" note when you edit a value while the drawing is folded flat (Points & Lines), so the automatic snap back to 3D no longer looks like a glitch; the Lines construction-close message is now on-screen too, not screen-reader-only.
- Changed: vertex/point name chips (P, p, p′, A, B, a, b…) nudge outward off the linework so they no longer sit on top of the thick edges (Points & Lines).
- Fixed: Points/Lines 3D view booted far back despite the tight-fit code — the boot/reset rebuild was running the auto-framer's push-back dolly AND the fresh tight fit, and the dolly's in-flight tween clobbered the fit, stranding the camera at the far default distance. A rebuild now does EITHER a fresh tight fit (boot/reset) OR the push-back (slider edits), never both (mirrors Module 2), so the view opens snug on the subject and only eases back as values grow.
- Changed: Points/Lines 3D view now opens tighter on the subject — shrank the auto-framer's fixed breathing-room margin (the `contentBox` `expandByScalar`: Points 1→0.5, Lines 1.2→0.6) so the default scene fills more of the frame instead of sitting far back, while keeping enough margin to de-degenerate edge cases and avoid clipping labels.
- Fixed: Engine Hardening — the Points/Lines auto-zoom now frames the subject on the geometry's centre (the orbit target tracks it) so the camera pulls back linearly as a parameter grows, killing the off-centre "exponential lurch."
- Changed: Engine Hardening — the Points/Lines 3D view now starts snug on the default geometry (centre-pivot fit + much tighter content margin), so it opens close to the point/line and the auto-zoom only eases it back as values grow.
- Changed: Engine Hardening — the fold-to-flat ("Generate Orthographic Projection" / "Animate Unfolding") now HOLDS the learner's 3D angle (a dolly-only reframe along the fixed view direction) instead of sweeping the camera front-on into an orthographic view — so students actually watch the HP plane hinge flat into the 2D drawing (the prior front-on sweep both read as a bottom-right swoop and hid the hinge edge-on). The clean head-on orthographic read stays in the Compare card / the Front quick-view.

## 2026-06-25
- Fixed: the Lines orthographic quick-view camera swooped down-right before settling — it now glides a clean arc (the morph-in standoff is matched to the live orbit distance instead of a fixed far point); also smooths the Points quick-views.
- Fixed: the Lines Readout HUD × no longer unfolds the orthographic drawing — hiding the panel only toggles its visibility instead of rebuilding the scene.
- Changed: moved the Lines Readout toggle below the "Compare 2D drawing" button and hid the Readout HUD by default.
- Changed: removed the hard border from the Lines HP/VP reference planes (faint fill + calm grid only) to match Module 2's borderless plane style.
- Fixed: the Lines auto-zoom now dollies back smoothly and continuously as True Length / HP-VP distances grow — a per-frame camera follow that tracks a slider drag, instead of the old tween that stalled mid-drag then jumped the whole way on release — and reaches far enough (wider content box) to keep the line and its labels in frame.
- Added: a second batch of K.C. John textbook problems to the Points and Lines Problem Libraries (6 points across all four quadrants + on-plane/origin cases; 6 lines including the first perpendicular-to-VP case), so learners get more practice variety.
- Added: flexible "OR" answer acceptance in the Problem-Library self-check (a problem's target may now be an array of equally-valid configurations), synced to Module 2's flexible-acceptance spirit; applied to on-plane/origin points where the quadrant is geometrically degenerate, so a student isn't marked wrong for an equally-correct quadrant.
- Fixed: the Points/Lines auto-zoom "lurch" — replaced the per-frame exponential camera follow (above) with Module 2's one-shot fixed-duration eased dolly, restarted from the camera's live distance each rebuild, so it pulls back proportionally and smoothly with no accelerating lurch or end-of-drag jump.
- Changed: the Points and Lines 3D view now starts tight on the default geometry (auto-fit at boot + reset, keeping each lesson's look angle), so the view is intimate by default and the smooth auto-zoom only dollies further out as parameters grow.

## 2026-06-20
- Added: authentic N.D. Bhatt / K.C. John textbook problem sets to the Points and Lines Problem Libraries (6 points across the four quadrants + on-plane cases; 6 lines from parallel-to-both through inclined-to-both), with self-check targets mapped to the real slider fields.
- Changed: enlarged the Lines reference sheet/grid 26→60 units (600 mm) and the Points grid 20→40 units (400 mm) so large lines and typed 200 mm points never bleed off the glass.
- Added: ported Module 2's full camera/animation orchestrator into the shared engine — dual perspective/orthographic cameras with active-camera switching, a projection-matrix morph (projectionMorphK) for seamless 3D↔2D transitions, clip-aware auto-zoom (reframeIfClipped) wired into rebuild(), orthographic quick-views, and a flattened 2D pan — gated to the Points/Lines sims.
- Changed: synced CLAUDE.md + DESIGN.md with the new dual-camera engine (dual perspective/ortho camera, projection morph, ortho quick-views + 2D pan, auto-zoom, ortho fold; retired the single-perspective / tweenCamera / "camera never moves" descriptions for the sims).

## 2026-06-19
- Changed: pulled the Points sim's default 3D camera back to match the Lines sim, so the full HP/VP grids are in frame.
- Changed: 2D orthographic projectors to solid Type-B continuous thin lines (per N.D. Bhatt / ISO line types); 3D pictorial projectors stay dashed.
- Changed: projection-foot markers (`acr`) to thick filled dots across all lessons — the textbook "thick dot" for a point (supersedes the 2026-06-16 "45° ×").
- Added: verified the Problem Library end-to-end (Practice-problems entry, active-problem banner, ±0.5 self-check, success toast).
- Changed: removed the in-panel header (brand + chapter nav) from the Lines sim for clean iframe embedding.
- Changed: moved the Labels/Dimensions/Projectors toggles and the live readout table out of the Lines wizard panel into floating viewport HUD chrome.
- Changed: harmonized the Lines Traces/construction panel typography to the shared `--font-sans` / `--text-*` / `--color-ink` tokens.
- Changed: editing a Lines parameter slider now eases the camera back to the 3D orbit when an orthographic quick-view is active.
- Fixed: Problem-Library cards rendered in the default button font — pinned `.problem-card` to `--font-sans`.
- Fixed: the active Traces/True-Length launcher button turned unreadable (white text on a hover-lightened background) — it now darkens on hover.
- Changed: Lines viewport-HUD polish — display toggles sit above the camera chips; the readout is a compact bottom-left panel that blends with the viewport; launcher button + caption weights un-bolded to match the fold button.
- Added: a Readout toggle chip + an in-panel × to show/hide the Lines readout HUD, and switched its text to the Atkinson sans (matching the wizard body).
- Removed: the introductory "two planes and the line" step from the Lines sim — it now opens directly on the line-position cases (titles also shortened for a tidier rail).
- Added: distance-from-HP / distance-from-VP sliders to the Lines sim so a line's end can be positioned (0–100 mm) for textbook problems, not just its length and angles.
- Changed: enlarged the Lines HP/VP reference sheet + grid to 26 units (260 mm) and reframed the default and quick-view/fold cameras so larger textbook lines (TL up to 150 mm) stay in frame.
- Removed: the white halo behind line endpoints and projection feet in the Lines sim, for a cleaner sheet (engine `acr()` gained a `halo` option).
- Added: smooth sweep-in animation for the angle arcs (θ/φ/α/β) on step reveal and on Compare-card open (engine `addSweep` driven by the existing draw-on).
- Changed: the folded 3D sheet now dissolves its 3D θ/φ marks and reveals the same angle markers + length annotations the 2D Compare drawing shows, so the two stay in sync.

## 2026-06-16
- Added: white card/chip surfaces (`--color-host-white`) so the sim blends with the white host page when embedded.
- Changed: "Practice problems" entry to a ghost button and the step counter to normal weight, for parity with Module 2.
- Changed: 3D projection foot marker to a 45° "×" so it reads as a distinct point, clear of the grid and projector lines.
- Changed: distance sliders, rail labels, and step titles to quadrant-neutral "Distance from HP/VP/PP" (correct in every quadrant).
