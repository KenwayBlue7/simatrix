# Graph Report - Module2  (2026-08-11)

## Corpus Check
- 29 files · ~112,774 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 462 nodes · 864 edges · 24 communities (23 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `4b94bb5b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- genericPrism.js
- 5. Components
- main.js
- projectionDrawer.js
- setView
- init
- Critique — Orthographic Projection Guided Stepper (`index.html`)
- drawCompare
- rebuild
- CLAUDE.md — Simatrix Engineering Graphics Viewer
- anim.js
- problems.js
- buildScene
- vertexLabeler.js
- refreshProjections
- meshAnalyzer.js
- 2026-05-29T05-17-54Z__index-html.md
- 2026-05-29T08-30-33Z__index-html.md
- 2026-06-03T13-12-43Z__index-html.md
- Changelog
- reset
- startLoop
- projectSet
- methodBeatLabel

## God Nodes (most connected - your core abstractions)
1. `drawProjections()` - 27 edges
2. `init()` - 18 edges
3. `Changelog` - 18 edges
4. `rebuild()` - 17 edges
5. `tween()` - 15 edges
6. `applyShapeTransform()` - 14 edges
7. `buildScene()` - 13 edges
8. `projectSet()` - 13 edges
9. `applyFoldVisual()` - 12 edges
10. `setView()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `slantAngleDeg()` --calls--> `slantAngle()`  [EXTRACTED]
  main.js → src/genericSolid.js
- `refreshProjections()` --calls--> `buildEdgeMap()`  [EXTRACTED]
  main.js → src/meshAnalyzer.js
- `refreshProjections()` --calls--> `drawProjections()`  [EXTRACTED]
  main.js → src/projectionDrawer.js
- `reframeIfClipped()` --calls--> `tween()`  [EXTRACTED]
  main.js → src/anim.js
- `tweenCamera()` --calls--> `tween()`  [EXTRACTED]
  main.js → src/anim.js

## Import Cycles
- None detected.

## Communities (24 total, 1 thin omitted)

### Community 0 - "genericPrism.js"
Cohesion: 0.10
Nodes (31): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+23 more)

### Community 1 - "5. Components"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 2 - "main.js"
Cohesion: 0.03
Nodes (54): ADR-0034, ADR-0037, ADR-0038, ADR-0052, ADR-0053, ADR-0054, ADR-0055, ADR-0056 (+46 more)

### Community 3 - "projectionDrawer.js"
Cohesion: 0.10
Nodes (37): addIfPresent(), addSegment(), baseEdgeDimOffset(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH (+29 more)

### Community 4 - "setView"
Cohesion: 0.11
Nodes (30): announce(), answerSheetBox(), clearProjectionMorph(), completeAndNext(), engageOrtho(), fitOrthoZoom(), flattenedViewBox(), reset() (+22 more)

### Community 5 - "init"
Cohesion: 0.12
Nodes (16): initMethodController(), ADR-0084, ADR-0085, ADR-0087, ADR-0089, ADR-0090, ADR-0091, ADR-0094 (+8 more)

### Community 6 - "Critique — Orthographic Projection Guided Stepper (`index.html`)"
Cohesion: 0.13
Nodes (14): Anti-Patterns Verdict, Critique — Orthographic Projection Guided Stepper (`index.html`), Design Health Score, Minor Observations, Overall Impression, [P1] Editing geometry while flattened unfolds the drawing with no visible explanation, [P1] Reset is a one-click, unconfirmed total wipe, [P2] `aria-live="polite"` on the entire `#step-card` over-announces for screen readers (+6 more)

### Community 7 - "drawCompare"
Cohesion: 0.17
Nodes (9): init(), markBooted(), setupConnectorToggle(), setupMobileNotice(), initOnboarding(), ADR-0162, SPOTLIGHTS, TONE_CLASSES (+1 more)

### Community 8 - "rebuild"
Cohesion: 0.08
Nodes (33): applyMode(), axisInclinations(), beginShowMethod(), computeEffectiveAngles(), computeSeating(), contentBox(), fitPerspectiveDistance(), formatSetLabel() (+25 more)

### Community 9 - "CLAUDE.md — Simatrix Engineering Graphics Viewer"
Cohesion: 0.17
Nodes (11): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Engineering Graphics Viewer, Cross-cutting rules, Keeping Root Documents Current, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical) (+3 more)

### Community 10 - "anim.js"
Cohesion: 0.22
Nodes (9): ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), queueRedraw(), resetCompareView(), setupCompareCard(), setupComparePan(), setupRailToggle() (+1 more)

### Community 11 - "problems.js"
Cohesion: 0.22
Nodes (11): initProblemLibrary(), ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), ADR-0083, ADR-0084, PROBLEMS (+3 more)

### Community 12 - "buildScene"
Cohesion: 0.22
Nodes (9): buildScene(), createEdgeOverlay(), cssColor(), cueOrthoLock(), makePlaneLabel(), makeViewLabel(), pause(), stopLoop() (+1 more)

### Community 13 - "vertexLabeler.js"
Cohesion: 0.23
Nodes (11): harvestAnnotations(), CHAIN, chainPositions(), GENERATOR_DASH, ADR-0084, letterFor(), numberFor(), orderRing() (+3 more)

### Community 14 - "refreshProjections"
Cohesion: 0.08
Nodes (45): abortShowMethod(), animateFold(), applyDimensionVisibility(), applyFoldVisual(), applyMethodPose(), applyProfilePlaneVisibility(), disposeActiveProjection(), drawCompare() (+37 more)

### Community 15 - "meshAnalyzer.js"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 16 - "2026-05-29T05-17-54Z__index-html.md"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 17 - "2026-05-29T08-30-33Z__index-html.md"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 18 - "2026-06-03T13-12-43Z__index-html.md"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 19 - "Changelog"
Cohesion: 0.11
Nodes (18): 2026-06-16, 2026-07-02, 2026-07-09, 2026-07-15, 2026-07-16, 2026-07-20, 2026-07-25, 2026-07-27 (+10 more)

### Community 20 - "reset"
Cohesion: 0.31
Nodes (10): cssVar(), drawMethodGhost(), drawMethodLabels(), drawMethodSheet(), drawMethodView(), fillMethodTris(), methodBeatsShown(), methodSheetLayout() (+2 more)

### Community 21 - "startLoop"
Cohesion: 0.40
Nodes (5): animate(), applyProjectionMorph(), resume(), startLoop(), tick()

### Community 22 - "projectSet"
Cohesion: 0.24
Nodes (10): lineArrayUnitCount(), methodArcEligible(), methodBeatUnitCount(), methodContentBeats(), methodFlattenHP(), methodFlattenVP(), methodQuantize(), methodSegmentKeys() (+2 more)

## Knowledge Gaps
- **188 isolated node(s):** `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET`, `DEFAULT_VIEW_DIR`, `QUICK_VIEWS` (+183 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drawProjections()` connect `projectionDrawer.js` to `rebuild`, `main.js`, `refreshProjections`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `planAnnotations()` connect `vertexLabeler.js` to `main.js`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `init` to `main.js`, `drawCompare`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET` to the rest of the system?**
  _189 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `genericPrism.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10384068278805121 - nodes in this community are weakly interconnected._
- **Should `5. Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03333333333333333 - nodes in this community are weakly interconnected._