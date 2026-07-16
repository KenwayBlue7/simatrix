# Graph Report - Module2  (2026-07-16)

## Corpus Check
- 28 files · ~76,984 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 326 nodes · 583 edges · 22 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.54)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6acf3d1f`
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

## God Nodes (most connected - your core abstractions)
1. `drawProjections()` - 19 edges
2. `rebuild()` - 17 edges
3. `init()` - 16 edges
4. `buildScene()` - 13 edges
5. `setView()` - 12 edges
6. `announce()` - 11 edges
7. `reset()` - 11 edges
8. `applyShapeTransform()` - 11 edges
9. `applyFoldVisual()` - 10 edges
10. `tween()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `initStepper()` --indirect_call--> `reset()`  [INFERRED]
  src/stepper.js → main.js
- `slantAngleDeg()` --calls--> `slantAngle()`  [EXTRACTED]
  main.js → src/genericSolid.js
- `refreshProjections()` --calls--> `buildEdgeMap()`  [EXTRACTED]
  main.js → src/meshAnalyzer.js
- `refreshProjections()` --calls--> `drawProjections()`  [EXTRACTED]
  main.js → src/projectionDrawer.js
- `setProjectionsVisible()` --calls--> `tween()`  [EXTRACTED]
  main.js → src/anim.js

## Import Cycles
- None detected.

## Communities (22 total, 0 thin omitted)

### Community 0 - "genericPrism.js"
Cohesion: 0.10
Nodes (31): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+23 more)

### Community 1 - "5. Components"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 2 - "main.js"
Cohesion: 0.07
Nodes (25): ADR-0034, ADR-0037, ADR-0038, ADR-0052, ADR-0053, ADR-0054, ADR-0055, ADR-0056 (+17 more)

### Community 3 - "projectionDrawer.js"
Cohesion: 0.14
Nodes (24): addIfPresent(), addSegment(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections() (+16 more)

### Community 4 - "setView"
Cohesion: 0.23
Nodes (20): announce(), answerSheetBox(), clearProjectionMorph(), contentBox(), engageOrtho(), fitOrthoZoom(), fitPerspectiveDistance(), flattenedViewBox() (+12 more)

### Community 5 - "init"
Cohesion: 0.12
Nodes (15): init(), markBooted(), setupConnectorToggle(), setupMobileNotice(), initOnboarding(), SPOTLIGHTS, TONE_CLASSES, initStepper() (+7 more)

### Community 6 - "Critique — Orthographic Projection Guided Stepper (`index.html`)"
Cohesion: 0.13
Nodes (14): Anti-Patterns Verdict, Critique — Orthographic Projection Guided Stepper (`index.html`), Design Health Score, Minor Observations, Overall Impression, [P1] Editing geometry while flattened unfolds the drawing with no visible explanation, [P1] Reset is a one-click, unconfirmed total wipe, [P2] `aria-live="polite"` on the entire `#step-card` over-announces for screen readers (+6 more)

### Community 7 - "drawCompare"
Cohesion: 0.22
Nodes (13): applyCompareSize(), drawCompare(), ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), handleResize(), isWorkbenchViewport(), remeasureAfterReflow() (+5 more)

### Community 8 - "rebuild"
Cohesion: 0.17
Nodes (13): applyMode(), computeEffectiveAngles(), isPyramidType(), notifyStateChange(), orientationAngle(), positionRefLabels(), PYRAMID_TYPES, rebuild() (+5 more)

### Community 9 - "CLAUDE.md — Simatrix Engineering Graphics Viewer"
Cohesion: 0.17
Nodes (11): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Engineering Graphics Viewer, Cross-cutting rules, Keeping Root Documents Current, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical) (+3 more)

### Community 10 - "anim.js"
Cohesion: 0.18
Nodes (10): animateFold(), applyFoldVisual(), setConnectorsVisible(), active, cancelAll(), easeCamera, easeDissolve, easeDraw (+2 more)

### Community 11 - "problems.js"
Cohesion: 0.27
Nodes (9): initProblemLibrary(), ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, defaultShapeData() (+1 more)

### Community 12 - "buildScene"
Cohesion: 0.20
Nodes (11): buildScene(), createEdgeOverlay(), cssColor(), cssVar(), cueOrthoLock(), makePlaneLabel(), makeViewLabel(), pause() (+3 more)

### Community 13 - "vertexLabeler.js"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 14 - "refreshProjections"
Cohesion: 0.24
Nodes (10): applyDimensionVisibility(), applyProfilePlaneVisibility(), disposeActiveProjection(), refreshProjections(), setDimensionsVisible(), setObjectOpacity(), setProjectionsVisible(), setSideViewVisible() (+2 more)

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
Cohesion: 0.29
Nodes (6): 2026-06-16, 2026-07-02, 2026-07-09, 2026-07-15, 2026-07-16, Changelog

### Community 20 - "reset"
Cohesion: 0.33
Nodes (6): completeAndNext(), reset(), resetCamera(), setFirstAngleSymbol(), setRefLabelOpacity(), showToast()

### Community 21 - "startLoop"
Cohesion: 0.40
Nodes (5): animate(), applyProjectionMorph(), resume(), startLoop(), tick()

## Knowledge Gaps
- **121 isolated node(s):** `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET`, `DEFAULT_VIEW_DIR`, `QUICK_VIEWS` (+116 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drawProjections()` connect `projectionDrawer.js` to `main.js`, `refreshProjections`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `init` to `main.js`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET` to the rest of the system?**
  _122 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `genericPrism.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10384068278805121 - nodes in this community are weakly interconnected._
- **Should `5. Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `projectionDrawer.js` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._