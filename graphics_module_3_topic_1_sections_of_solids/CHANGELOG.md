# Changelog

All notable changes to Module 3 · Topic 1 (Sections of Solids).

(This topic's own history starts fresh from the scaffold date below — `template_starter/`'s prior
build history belongs to the template, not this topic, per MODULE-STARTER §3.2 convention.)

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082). (`index.html`.)

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002). (`main.js`.)

## 2026-07-20
- Changed: `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper) — `index.html` `:root`.

## 2026-07-18
- Added: 3 conic-section problems completing the KTU set on the cone — circle (parallel to base, `angleDeg:0`), isosceles triangle (through the apex, `angleDeg:90, offset:0`), hyperbola (parallel to the axis, `angleDeg:90, offset:0.8`) — joining the existing ellipse ×2 and parabola problems in `src/problems.js` (root `DECISIONS.md` ADR-071).
- Changed: Triangle/hyperbola both dial `angleDeg:90`, so the self-check now CHECKS `offset` to tell them apart (0 vs 8 mm) — the first conic problem to check offset, reversing the oblique problems' "offset stays free" default (legitimate here because at 90° the offset is a 1:1 dockable horizontal distance, not a derived normal-offset).

## 2026-07-17
- Added: First-angle orthographic views (top/front/side with per-view visible/dashed classification + 3D→2D connectors) via `src/projectionDrawer.js` copied byte-identical from Module2 (ADR-060) — zero edits, so no drift; VP/PP wall grids seated per rebuild (PP at `bbox.min.z − 1.5`).
- Added: 45° section hatching of the apparent shape in every view where the cut face projects to an area (new leaf `src/sectionView.js`); the edge-on view correctly shows no hatch — pitch fixed at 0.25 world units (2.5 mm at dock scale) per SP 46 density.
- Added: TRUE SHAPE auxiliary view — an in-scene paper sheet posed by the cutting plane's (u,v,normal) basis drawing `points2D` verbatim at 1:1 world scale (ADR-061, no auxiliary camera, no zoom drift) + a Step-5 "Face the section" camera tween (orbit distance preserved); verified on the 30° cone cut: conic-fit residual ~1e-8 (exact ellipse), top view shortened by exactly cos 30°.
- Changed: Stepper grown 3 → 5 steps ("Project the views", "The true shape") with stage-gated scene reveal through `simController.setStage()`; disposal verified flat (20→20 geometries across 50 re-cuts — views ride the one shapeGroup contract).
- Added: The section-cut engine (`src/sectionCut.js`, ADR-058) — an analytic single-plane triangle clipper (no CSG library) that slices the solid, chains the welded intersection loop, and caps it as the crimson "True Shape" face; runs as a fixed stage inside `rebuild()` and re-cuts live per slider tick (≈0.6 ms per cut, verified 66/66 configs weld to a clean manifold).
- Added: Section-plane controls (Step 2: cut toggle, HP/VP orientation, inclination + position sliders) wired through a rewritten `src/uiManager.js` — the scaffold's copy referenced Module-2-only markup and was never imported, leaving the Reset button silently dead; Reset (guarded confirm) now works.
- Added: Restored `src/meshAnalyzer.js` byte-identical from `Module2/src/` and drew welded hard-edge linework (fat `LineSegments2`) for every build — the cut rim welds with the clipped walls so section edges draw once, never doubled.
- Added: `--color-section-face` (Section Crimson) token for the cut face + translucent cutting-plane sheet, registered in root `DESIGN.md` §7.3; root `DECISIONS.md` gained ADR-058/059.
- Fixed: Grazing cuts (e.g. the default 45° centre cut of the cube, which passes exactly through two cube edges) produced non-manifold welded edges — `PLANE_EPS` on-plane snap raised to 2e-3 so it exceeds meshAnalyzer's 1e-3 weld lattice and grazed vertices become section-loop vertices outright.
- Changed: Section state lives beside `ShapeData` in `main.js` (`commitSection()`), not inside it, so `src/shapeData.js` stays byte-identical to Module 2 (ADR-059); `simAPI.reset()` clears both.
- Added: Scaffolded this topic from `template_starter/` (MODULE-STARTER Case A). Restored the
  eight geometry files byte-identical from `Module2/src/` (`cube`, `cone`, `cylinder`,
  `genericPrism`, `genericPyramid`, `genericSolid`, `shapeData`, `iShape` — the last was missing
  from MODULE-STARTER's original file list but is a hard dependency of all five mesh generators).
  Wired `main.js`'s `createSolidMesh()` dispatch switch (ported verbatim from `Module2/main.js`)
  into the `rebuild()` build seam and seeded the default solid on boot and on reset.
- Changed: `meta.json` (title, description, `difficulty: "intermediate"`, tags) and `index.html`
  `<title>`/`<meta description>` from the template's placeholder values to this topic's own.
- Changed: Replaced the template's Case-C `CLAUDE.md` with an Engineering-Graphics topic CLAUDE.md
  that re-points at the root `ARCHITECTURE.md`/`DECISIONS.md`/`RULES.md`/`DESIGN.md`/`PRODUCT.md`,
  and documents that the section-cut engine itself (plane intersection, true-shape auxiliary view)
  is net-new work gated behind its own ADR — `meshAnalyzer.js` as restored has no arbitrary-plane
  support today.
