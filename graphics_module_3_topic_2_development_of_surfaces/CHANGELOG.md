# Changelog — Development of Surfaces (Module 3, Topic 2)

Notable changes to this topic. (The starter template's own history was intentionally not carried
over — this changelog starts fresh at the scaffold, per MODULE-STARTER §3.2.)

## 2026-07-27
- Changed: the Problem Library overlay's title now centers in its header row (was hard-left) — a 44px spacer counterweights the close button so it stays corner-anchored (ADR-082). (`index.html`.)

## 2026-07-25
- Fixed: the Compare split's floating "compact" card (its own title bar + expand/close buttons) could get stuck stranded at full window width after the viewport narrowed below 768px and then widened back — a one-way `matchMedia` listener demoted the split but never restored it. Removed the compact card entirely: Compare now has exactly one shape (the docked 50/50 split) at every viewport width, and below 768px the same grid restacks to a single column via CSS instead of switching UI (ADR-080, platform-wide). This topic's own standalone mobile `@media` block for the compact card was replaced with the restack rule. (`main.js`, `index.html`.)

## 2026-07-24
- Added: `markBooted()` now posts `{ type: 'sim:ready' }` to `window.parent` once, after `document.fonts.ready` resolves — the host loading screen's boot-ready signal (ADR-078, narrows ADR-002). (`main.js`.)

## 2026-07-20
- Changed: `--color-vp-line` darkened `#bc5d1e → #b25718` (platform-wide AA promotion, ~4.92:1 on paper) — `index.html` `:root`.

## 2026-07-18
- Added: Phase 2 flat-pattern layer — new pure leaf `src/developmentEngine.js` draws textbook
  developments on the Compare sheet: Parallel-Line method (prisms/cylinder, stretch-out `n·s` /
  `π·d` × height, fold/generator stations) and Radial-Line method (cone sector `θ = 360°·(r/L)`;
  pyramid chord-stepped fan `φ = 2·asin(s/(2·L_e))`), per the KTU syllabus split (ADR-066).
- Added: Compare card + 50/50 workbench split wired (ADR-012/ADR-037 port from the Module 2
  master) — `#compare-chip`, expand/close, rail toggle, drag-pan + pointer-anchored wheel zoom,
  live redraw on every `rebuild()` via the `onStateChange` seam; sheet scale locked to the
  analytic intrinsic footprint (ADR-053 pattern, `WORLD_TO_MM = 10`).
- Added: Truncation data seam — `computeCutDistances()` maps a local-frame cutting plane to
  true-length distances per generator/edge, ready for the topic-1 section-UI port with zero
  engine change.
- Added: Scaffolded the topic from `template_starter/` (MODULE-STARTER Case A) as
  `graphics_module_3_topic_2_development_of_surfaces` — the WebGL skeleton for the Development
  of Surfaces lesson.
- Added: Restored the Module 2 solid-geometry engine byte-identical from `Module2/src/` — the 8
  geometry files (`cube`, `cone`, `cylinder`, `genericPrism`, `genericPyramid`, `genericSolid`,
  `shapeData`, `iShape`) plus `meshAnalyzer.js` (edge welding, needed once linework lands).
  `iShape.js` taken verbatim from the master per ADR-064 (conscious ADR-027 resolution).
- Added: Wired `main.js` — `createSolidMesh()` dispatch ported verbatim from `Module2/main.js`,
  built inside `rebuild()`'s DOMAIN BUILD SEAM with a transform-copying edge-overlay sibling;
  boots and resets to `defaultSolidData()` (a cylinder resting on HP, axis vertical).
- Added: `meta.json` (title "Development of Surfaces", difficulty "intermediate"), matching
  `index.html` title/description, topic `CLAUDE.md` (root-pointing five-doc block + the
  through-hole syllabus exclusion on record); root `DECISIONS.md` gained ADR-064/065.
