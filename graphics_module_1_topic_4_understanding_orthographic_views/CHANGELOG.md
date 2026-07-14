# Changelog — Understanding Orthographic Views

Notable changes to this Engineering Graphics Module 1 topic (folder
`graphics_module_1_topic_4_understanding_orthographic_views`, shipped 2026-07-12 through
2026-07-13 as "Glass Box Visualizer"; renamed 2026-07-13, ADR-048). History before the scaffold
below is the starter template's, carried over from the duplication.

## 2026-07-13 (ADR-050 final flag — 2D Compare sheet synced to the mathematical views)
- Fixed: `drawCompare()`'s 2D Compare sheet no longer traces an `EdgesGeometry` silhouette — Front/Top/Side are now constructed with native Canvas2D calls (`ctx.rect`/`ctx.arc`/`moveTo`/`lineTo`) straight from `BEARING_BLOCK_DIMS × BLOCK_SCALE`, mirroring `src/glassBox.js castProjectors()` exactly. This removes the Side view's false base/body seam and closes the Front view's dome as a true 180° arc — the two quirks the ADR-050 pane-outline rebuild fixed in 3D but left behind in the 2D sheet. The `scale`/`panX`/`panY` (`s`/`ox`/`oy`/`toX`/`toY`) mapping is unchanged.
- Removed: the now-dead `EdgesGeometry` silhouette extraction in `buildBearingBlockSolid()` and the `SILHOUETTE_THRESHOLD_DEG` constant — nothing reads `solidData.silhouette` any more (`solidData` is now `{ group, verts }`).
- Verified: `node --check` clean; headless CDP on :8080 boots with zero console messages through Step 5, and the painted 2D sheet shows a seamless Side rectangle and a closed Front dome.

## 2026-07-13 (final QA polish — framing, projector purge & exact 2D silhouettes, ADR-050)
- Changed: `castProjectors()` abandons `EdgesGeometry` — each pane's 2D view is now constructed segment-by-segment from `BEARING_BLOCK_DIMS × BLOCK_SCALE` (passed in as a world-unit `dims` object, keeping glassBox.js a THREE-only leaf): Front = base rectangle + body sides + 32-chord dome semicircle (no false line at the tangent spring point), Top = base rectangle + the body's two longitudinal edges, Side = ONE seamless outer rectangle (no base/body junction seam by construction). The Part-3 `sideFix` seam-filter/apex-injection machinery is deleted as obsolete.
- Removed: the dashed 8-corner bounding-box projector rays end-to-end (`buildRays`/`rayByPlane`/`rayAllowed`/`userData.rays`) — the planes display only the 2D drawing outlines; step gating renames to `viewAllowed`, and the Step-3/Step-4 dock copy no longer promises dashed projector lines. Step 3's sight lines are untouched.
- Changed: Step 2+ camera framing tightened `FRAME_MARGIN` 1.18 → 1.08 so the three exploded grids fill the frame with a small breathable margin (Step 1's 1.03 tight margin unchanged).
- Verified: `node --check` clean on `main.js` + `src/glassBox.js`; headless CDP on :8080 boots with zero console errors through Steps 1→4 + all three view switches; in-page re-run of the shipped `castProjectors()` confirms exact segment counts (Top 6, Front 38, Side 4) and the Side rectangle at world y `[−0.966, +0.966]`, z `±0.945` with no seam segment at y `−0.588`.

## 2026-07-13 (final QA polish — Step 3 textbook pedagogy & mutual-exclusion view choices)
- Changed: Step 3 "Lines of sight" replaced the single segmented Front/Top/Side pill with three vertically stacked "textbook" sections — each pairs a line of projection theory (Front→VP, Top→HP, Side→PP) with the button that glides the Observer to that vantage — so the learner reads *why* each view forms before choosing it.
- Changed: the three view buttons are now mutually exclusive — clicking one latches it to the accent fill (`.is-active` + `aria-pressed="true"`) and the group gains `.has-selection` so the two unpicked buttons mute back (opacity `0.55`); Step 3 now opens in a neutral, un-latched "pick a view" invite instead of pre-selecting Front (`renderStep`/`reset`/setup now call `clearStepViewButtons()`; the dead `syncStepViewButtons()` was removed).
- Verified: `node --check` clean on `main.js`; headless CDP on :8080 boots (`__simBooted`), drives to Step 3, confirms 3 stacked choices with the correct textbook copy + labels, a neutral default (0 active), and correct latch/mute on Front→Top clicks — zero console errors or exceptions.

## 2026-07-13 (visual QA polish, part 3 — domain geometry, silhouettes & camera tweaks)
- Changed: the default camera dollied in from `(-12, 8, 12)` to `(-9, 6, 9)` (same Top-Left-Front orientation, RULES.md §5.20) and Step 1 now hugs the lone block tighter — a dedicated `FRAME_MARGIN_TIGHT = 1.03` (vs the `1.18` wide-box margin) so the solid fills the viewport before the exploded planes appear.
- Removed: the faint dashed bounding-box "envelope" that cluttered the 3D solid (and its now-dead bbox-`edges` feeder in `buildBearingBlockSolid()`); the dashed projector rays already communicate the cast extent.
- Fixed: the Side view (PP) no longer draws the FALSE horizontal seam at the base/body junction (world Y `−0.588` = `baseTopY × BLOCK_SCALE`) — in the Side view base and body share the full block depth, so no real edge crosses there (it is real only in the Front view, where the base is wider, and is kept). `castProjectors()` drops any Side-view segment lying flat at that Y.
- Fixed: the Side view now CLOSES at the dome top — `EdgesGeometry` culls the apex crease (below the 20° silhouette threshold), so `castProjectors()` injects the missing apex tangent (world Y `+0.966` = `topY × BLOCK_SCALE`, spanning depth `±0.945`) to complete the textbook outline.
- Verified: `node --check` clean on `main.js` + `src/glassBox.js`; headless CDP on :8080 boots with `__simBooted`, live WebGL context and `gl.getError()===0`, zero console errors; a functional in-page re-run of the shipped `castProjectors()` proves the Side view goes 398 segments (100 on the seam, apex absent) → 299 (0 on the seam, apex present).

## 2026-07-13 (visual QA polish, part 2 — step-coupled camera framing & 2D sheet margins)
- Added: the perspective camera is now coupled to the active step — Step 1 frames tight on the Bearing Block alone (planes ignored), and stepping to Step 2 smoothly dollies BACK to hold the full exploded reference box; stepping back eases the camera in again (new `frameToStep()` on the shared `easeCamera` tween). It is a pure dolly along the current sight-line (target held at origin) so a learner's orbit direction survives the move, and only the 1↔2 boundary re-frames so a manual zoom on Steps 2–5 is never yanked back.
- Changed: the 2D Compare sheet gained breathing room — canvas padding `padPx` 26 → 48 and inter-view `gap` 0.6 → 0.9 (model units), so the Front/Top/Side drawings sit further from the canvas edges and each other.
- Verified: `node --check` clean on `main.js`; headless CDP on :8080 boots with zero console errors (`__simBooted`, `simAPI`, canvas all present); a scripted 1→5 step-drive (exercising the dolly tween branch) reaches the Compare split with zero console errors.

## 2026-07-13 (visual QA polish, part 1 — Step 3 controls, Observer font & sight-line origin)
- Changed: the "← Back to Step 4" rail button lost its leading arrow glyph and the Step-3 "Click the buttons below to move the Observer" note is now bold, so the instruction stands out.
- Fixed: the Step-3 Front/Top/Side view-switcher pill stretched full-width (an `inline-flex` group inside the flex-column step panel got `align-items:stretch`); it now sits in a centering wrapper so the pill hugs its content and centers.
- Changed: the CSS2D Observer icon now strictly renders in `--font-sans` (Atkinson Hyperlegible) instead of the mono caption default, and its `.center.set(0.5,0.5)` is made explicit so the DOM icon sits exactly on `observerGroup.position` — the same 3D point `drawSightLines()` casts the sight rays from.
- Verified: `node --check` clean on `main.js`/`glassBox.js`; headless boot on :8080 renders with zero console errors; zoom confirms sight lines converge on the eye centre and the pill is centered.

## 2026-07-13 (domain geometry & fold fixes — true silhouettes, PP-onto-HP fold, exploded labelled planes, CSS2D Observer)
- Fixed: the PP fold now hinges DOWN onto the HP about the HP∩PP line (`PP_FOLD_ANGLE = −π/2`, matching Module 2's `PP_FOLD_TARGET`; ADR-049) with its pivot nested inside the HP hinge, so the Side view lands beside the Top view (bottom-right) instead of beside the Front — verified numerically: PP pane midpoint lands at exactly (2D, −2D, −D).
- Changed: `drawCompare()` moved the 2D Side view beside the Top view (shared depth axis — features at the same Z line up horizontally between Top and Side) and redrew the fold reference line between Top & Side.
- Changed: the pane view outlines and the 2D sheet now trace the Bearing Block's TRUE silhouette (`EdgesGeometry` at 20°, above the generator's 15° curve facets — amended ADR-046: dome, boss/bore circles, base and hole rims all read); the dashed projector rays stay bounding-box-only (8 per plane).
- Changed: the HP/VP/PP reference planes are physically EXPLODED (`planeOffset = paneHalf + PLANE_EXPLODE_GAP`) — no shared vertices, visible air gaps that survive into the flat layout as sheet separation — and each carries a CSS2D name pill riding its fold hinge, fading with the Step-2 plane reveal.
- Changed: the wireframe camera Observer replaced by a flat CSS2D eye-glyph icon (`.observer-icon`, ADR-049); it dissolves across the fold via element opacity + its own `.visible` (the r160 CSS2DRenderer ignores ancestor visibility).
- Verified: CSS2D DOM nodes are pulled from the overlay inside the deep-disposal traversal (`disposeObj` handles `isCSS2DObject`, RULES.md §3.5) — 3 pills / 1 icon / 8 geometries dead flat across 20 resets + 5 full-sequence stress cycles; zero console errors; `node --check` clean.

## 2026-07-13 (cleanup pass — rename, camera default, dead-UI purge, Reset fix)
- Changed: renamed topic + folder to "Understanding Orthographic Views" and the default camera to a top-left-front pose (ADR-048), so the orthographic layout reads left-to-right from the first frame.
- Removed: the "Practice problems" button/dialog — it opened nothing, since this topic never wired a problem library.
- Fixed: the Reset button was silently dead (its only wiring lived in a file `main.js` never imported); it now correctly clears the lesson.
- Added: Step 3 now names the action ("click the buttons below") and a "Lesson complete" toast confirms finishing Step 5.

## 2026-07-13 (domain overhaul — Bearing Block, grid planes, 5-step sequence)
- Fixed: **PP orientation bug** — the Profile Plane sat on −X, so the fold sent the Left-hand Side View to the LEFT of Front (an RHSV-on-left layout, wrong for first-angle). PP now sits on +X (`src/glassBox.js`), `VIEW_DIR.side` casts from −X, and its fold hinge (`PP_FOLD_ANGLE`) flipped to +π/2, so Side now unfolds to the RIGHT of Front as first-angle requires.
- Changed: `src/glassBox.js` reference planes rebuilt as calm grid matrices (`gridPositions()`, a 12×12 lattice) with thick `LineSegments2` borders, replacing the hue-tinted glass fills (ADR-043 deviation retired). `createGlassBox()`/`castProjectors()` now take an options object and size themselves from a caller-supplied `half`, computed per rebuild from the object's live bounding box (the "exploded" offset now scales with the object, not a fixed constant).
- Added: the Foundations Bearing Block (`src/bearingBlock.js`, copied verbatim) replaces the placeholder box solid as the domain object, scaled to float inside the glass box (`BLOCK_SCALE`). `buildBearingBlockSolid()` in `main.js` derives the exploded pane offset, the Observer's orbit distance, and the 2D Compare sheet bounds from the block's live `THREE.Box3`.
- Added: bounding-box projectors (`castProjectors()`) — the dashed rays now cast from the object's 8 extreme Box3 corners only (not a per-vertex spiderweb), split into one ray-batch and one 2D view outline PER PLANE so a single step can show just one view's cast.
- Changed: the Observer's sphere+cone avatar replaced with a minimal wireframe "camera" icon (thin `LineSegments2` body + lens frustum, `buildObserver()`).
- Added: **5-step guided sequence** (`renderStep()` in `main.js`, the single per-layer-visibility pipeline layered on `rebuild()`) — 1 The Object (block + Observer only), 2 The Reference Planes (grids tween in, `setPlanesRevealed()`), 3 Lines of Sight (the Front/Top/Side view-switcher, relocated from the viewport into the Step 3 wizard panel, casts only the active view's rays + sight lines), 4 The Glass Box (all 3 views + all projectors), 5 The 2D Drawing (triggers `driveFold(true)` + `enterCompareSplit()`). `stepper.js` calls `sim.onStepChange(n)` on every Next/Back/rail-jump; `simAPI.reset()` returns to Step 1.
- Fixed: Step 5 opening the Compare split hid the entire wizard (CSS `body.compare-split #wizard`), including the Back button and step rail — a learner reaching Step 5 had no way back to Step 4 without reloading. Added a ghost "← Back to Step 4" button docked in `#workbench-rail` (stays visible in the split) wired to a new `stepper.back()`.
- Fixed: `applyFoldPose()` wasn't actually gating rays/sight-lines by the current step — only by fold progress — so Step 1/2 briefly showed all three planes' projector rays despite `applyStepGating()` computing the correct (all-hidden) state; caught via a temporary `window.__dbg` scene hook, confirmed fixed by inspecting live `.visible` flags in-browser.
- Removed: the viewport's top-left `.vp-cluster` (the quick-view chips + the never-wired connector-line toggle) and its now-dead CSS — the view switcher lives in the Step 3 panel only.
- Changed: `main.js` no longer boots straight into the Compare split (`BOOT_INTO_COMPARE_SPLIT = false`) — the guided sequence opens it at Step 5 instead.

## 2026-07-12 (completion — cinematic unfold + 2D Compare)
- Added: 3D cinematic unfold (`driveFold()` in `main.js`) — a 1600ms `easeFold` hinge that flattens the glass box into the first-angle layout. VP (back wall) stays fixed; HP (floor) hinges +90° down about the ground line; PP (side wall) hinges −90° outward. Each pane's reference grid and 2D view outline ride the hinge into place; the solid, Observer, sight lines and dashed rays dissolve out. Built with nested pivot/inner groups so the world-baked fat-line geometry rides the hinges with no geometry recompute.
- Added: 2D Compare sheet (`drawCompare()` replacing the placeholder) — the classic first-angle multiview on the right pane: Front (VP) top-left, Top (HP) bottom-left, Side (PP) top-right, each the solid's orthographic projection in its plane's token hue over a faint wash, with fold reference lines and captions. Scale is FIXED to the static sheet bounds and never auto-zooms to chase geometry (ADR-038 enforced).
- Added: "Unfold Glass Box" toggle docked in `#workbench-rail` (`index.html` + `main.js`); latches to the accent fill when unfolded. `rebuild()` snaps to the current fold state instantly (a rebuild while unfolded renders flat with no animation); reset folds the box back to 3D.
- Verified: hinge angles exact (+π/2 / −π/2), deep-disposal memory flat (16 → 16 geometries across 50 resets + fold cycles), clean boot with zero console errors.
- Note: the 3D fold sends the PP side view to the LEFT of front (physical outward swing), while the 2D sheet places Side top-right per the brief — a deliberate, flagged divergence between the animated fold and the measured sheet.

## 2026-07-12
- Added: Glass Box domain geometry — new `src/glassBox.js` with `createGlassBox()` (three hue-tinted glass panes — HP floor / VP back / PP side — forming a corner box), `castProjectors()` (the solid's three 2D orthographic views drawn on the panes + dashed projector rays), and a shared `makeFatSegments()` fat-line factory.
- Added: Central box solid suspended inside the box, and an orbiting "Observer" eye avatar that glides between the +Z/+Y/+X (Front/Top/Side) viewing axes with faint lines of sight to the active pane — wired to the now-revealed Top/Front/Side quick-view chips.
- Fixed: `rebuild()` disposal contract made DEEP (traverses each child group). The starter's shallow loop freed nothing for the new nested groups and would exhaust the WebGL context; verified `renderer.info.memory` stays flat (16 → 16 geometries, 0 textures) across 50 rebuilds + 30 view switches.
- Changed: Boot builds the Glass Box scene (was an empty viewport) and reset restores it; default camera reframed to the box; floor reference grid dropped under the HP pane; every fat line's `LineMaterial.resolution` re-synced on resize.
- Added: Scaffolded `graphics_module_1_topic_4_glass_box` by duplicating `template_starter/` (Phase 4).
- Changed: `meta.json` title → "Glass Box Visualizer" with a topic description and lowercase
  `difficulty: "beginner"`; `index.html` `<title>` matched to it (ADR-026 parity).
- Changed: `CLAUDE.md` re-pointed at the root Engineering-Graphics docs (`../ARCHITECTURE.md`,
  `../DECISIONS.md`, `../RULES.md`, …) — this is an EG-family topic, not a new discipline, so the
  template's Case-C "build your own docs" framing does not apply.
- Added: `main.js` boot wiring that opens the 50/50 Compare workbench on load (desktop) with a
  placeholder 2D sheet, keeping the no-transform ancestor invariant (ADR-012). Domain content
  (Glass-Box geometry, `drawCompare()`, rail drivers) is still pending.

## 2026-07-11
- Added: Minted `template_starter/` from the Module 2 master — a dual-mode (guided-stepper +
  Compare workbench) scaffold with all Engineering-Graphics domain content stripped: the seven
  solid-geometry files removed, `problems.js`/`terms.js` emptied to stubs, and `stepper.js`
  reset to three placeholder steps.
- Added: Compare-view scaffolding (`#compare-card` + `#compare-canvas`, empty `#workbench-rail`,
  and the `.compare-card` / `body.compare-split` / `#workbench-rail` CSS) ported from the Points
  topic so the template is natively dual-mode capable.
