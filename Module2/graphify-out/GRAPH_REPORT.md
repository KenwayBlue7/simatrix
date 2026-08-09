# Graph Report - Module2  (2026-08-04)

## Corpus Check
- 29 files · ~106,637 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 443 nodes · 814 edges · 27 communities (22 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.53)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `bda9c420`
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
- projectSet
- beginShowMethod
- methodArcEligible
- methodBeatLabel
- refreshLabels
- initTerms

## God Nodes (most connected - your core abstractions)
1. `drawProjections()` - 27 edges
2. `init()` - 18 edges
3. `rebuild()` - 17 edges
4. `Changelog` - 15 edges
5. `applyShapeTransform()` - 14 edges
6. `buildScene()` - 13 edges
7. `projectSet()` - 13 edges
8. `tween()` - 13 edges
9. `setView()` - 12 edges
10. `reset()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `initStepper()` --indirect_call--> `reset()`  [INFERRED]
  src/stepper.js → main.js
- `slantAngleDeg()` --calls--> `slantAngle()`  [EXTRACTED]
  main.js → src/genericSolid.js
- `refreshProjections()` --calls--> `buildEdgeMap()`  [EXTRACTED]
  main.js → src/meshAnalyzer.js
- `refreshProjections()` --calls--> `drawProjections()`  [EXTRACTED]
  main.js → src/projectionDrawer.js
- `applyFoldVisual()` --calls--> `easeDraw`  [EXTRACTED]
  main.js → src/anim.js

## Import Cycles
- None detected.

## Communities (27 total, 5 thin omitted)

### Community 0 - "genericPrism.js"
Cohesion: 0.10
Nodes (31): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+23 more)

### Community 1 - "5. Components"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 2 - "main.js"
Cohesion: 0.03
Nodes (52): ADR-0034, ADR-0037, ADR-0038, ADR-0052, ADR-0053, ADR-0054, ADR-0055, ADR-0056 (+44 more)

### Community 3 - "projectionDrawer.js"
Cohesion: 0.10
Nodes (36): addIfPresent(), addSegment(), baseEdgeDimOffset(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH (+28 more)

### Community 4 - "setView"
Cohesion: 0.23
Nodes (20): announce(), answerSheetBox(), clearProjectionMorph(), contentBox(), engageOrtho(), fitOrthoZoom(), fitPerspectiveDistance(), flattenedViewBox() (+12 more)

### Community 5 - "init"
Cohesion: 0.07
Nodes (26): init(), markBooted(), setupConnectorToggle(), setupMobileNotice(), initMethodController(), ADR-0084, ADR-0085, ADR-0087 (+18 more)

### Community 6 - "Critique — Orthographic Projection Guided Stepper (`index.html`)"
Cohesion: 0.13
Nodes (14): Anti-Patterns Verdict, Critique — Orthographic Projection Guided Stepper (`index.html`), Design Health Score, Minor Observations, Overall Impression, [P1] Editing geometry while flattened unfolds the drawing with no visible explanation, [P1] Reset is a one-click, unconfirmed total wipe, [P2] `aria-live="polite"` on the entire `#step-card` over-announces for screen readers (+6 more)

### Community 7 - "drawCompare"
Cohesion: 0.50
Nodes (4): ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), syncRailToggleState()

### Community 8 - "rebuild"
Cohesion: 0.24
Nodes (10): applyMode(), computeEffectiveAngles(), computeSeating(), isPyramidType(), orientationAngle(), projectSequentialBothPlanesPose(), projectSetPose(), PYRAMID_TYPES (+2 more)

### Community 9 - "CLAUDE.md — Simatrix Engineering Graphics Viewer"
Cohesion: 0.17
Nodes (11): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Engineering Graphics Viewer, Cross-cutting rules, Keeping Root Documents Current, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical) (+3 more)

### Community 11 - "problems.js"
Cohesion: 0.22
Nodes (11): initProblemLibrary(), ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), ADR-0083, ADR-0084, PROBLEMS (+3 more)

### Community 12 - "buildScene"
Cohesion: 0.17
Nodes (12): animate(), applyProjectionMorph(), buildScene(), createEdgeOverlay(), cssColor(), cueOrthoLock(), makePlaneLabel(), makeViewLabel() (+4 more)

### Community 13 - "vertexLabeler.js"
Cohesion: 0.23
Nodes (11): harvestAnnotations(), CHAIN, chainPositions(), GENERATOR_DASH, ADR-0084, letterFor(), numberFor(), orderRing() (+3 more)

### Community 14 - "refreshProjections"
Cohesion: 0.10
Nodes (30): animateFold(), applyDimensionVisibility(), applyFoldVisual(), applyProfilePlaneVisibility(), disposeActiveProjection(), drawCompare(), handleResize(), notifyStateChange() (+22 more)

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
Cohesion: 0.12
Nodes (15): 2026-06-16, 2026-07-02, 2026-07-09, 2026-07-15, 2026-07-16, 2026-07-20, 2026-07-25, 2026-07-27 (+7 more)

### Community 20 - "reset"
Cohesion: 0.08
Nodes (36): abortShowMethod(), cssVar(), drawMethodGhost(), drawMethodLabels(), drawMethodSheet(), drawMethodView(), endShowMethod(), fillMethodTris() (+28 more)

### Community 22 - "projectSet"
Cohesion: 0.20
Nodes (11): axisInclinations(), formatSetLabel(), harvestLabelGroup(), harvestLineGroup(), harvestTriGroup(), methodContentBeats(), methodFlattenHP(), methodFlattenVP() (+3 more)

### Community 23 - "beginShowMethod"
Cohesion: 0.33
Nodes (7): beginShowMethod(), inclinationStageCount(), methodCanRun(), pause(), planMethodStages(), stopLoop(), trueShapeForPlane()

## Knowledge Gaps
- **176 isolated node(s):** `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET`, `DEFAULT_VIEW_DIR`, `QUICK_VIEWS` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `drawProjections()` connect `projectionDrawer.js` to `main.js`, `projectSet`, `refreshProjections`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `planAnnotations()` connect `vertexLabeler.js` to `main.js`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `init` to `main.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `rootStyle`, `DEFAULT_CAMERA_POSITION`, `DEFAULT_CAMERA_TARGET` to the rest of the system?**
  _177 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `genericPrism.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10384068278805121 - nodes in this community are weakly interconnected._
- **Should `5. Components` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.034482758620689655 - nodes in this community are weakly interconnected._