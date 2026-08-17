# Graph Report - graphics_module_1_topic_1_foundations  (2026-08-08)

## Corpus Check
- 14 files · ~39,096 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 166 nodes · 270 edges · 15 communities
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.55)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d976019c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Changelog
- main.js
- CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT)
- annotations.js
- lineDrawer.js
- init
- bearingBlock.js
- meshAnalyzer.js
- anim.js
- stepper.js
- buildScene
- engageOrtho
- tween
- rebuild
- DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)

## God Nodes (most connected - your core abstractions)
1. `Changelog` - 28 edges
2. `init()` - 14 edges
3. `rebuild()` - 13 edges
4. `CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT)` - 11 edges
5. `buildScene()` - 10 edges
6. `exitFrontViewSmooth()` - 9 edges
7. `createAnnotations()` - 8 edges
8. `announce()` - 7 edges
9. `zoomToArrowhead()` - 7 edges
10. `createLineDrawer()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `exitFrontViewSmooth()` --calls--> `tween()`  [EXTRACTED]
  src/main.js → src/anim.js
- `rebuild()` --calls--> `createAnnotations()`  [EXTRACTED]
  src/main.js → src/annotations.js
- `rebuild()` --calls--> `createBearingBlock()`  [EXTRACTED]
  src/main.js → src/bearingBlock.js
- `rebuild()` --calls--> `createLineDrawer()`  [EXTRACTED]
  src/main.js → src/lineDrawer.js
- `rebuild()` --calls--> `buildEdgeMap()`  [EXTRACTED]
  src/main.js → src/meshAnalyzer.js

## Import Cycles
- None detected.

## Communities (15 total, 0 thin omitted)

### Community 0 - "Changelog"
Cohesion: 0.07
Nodes (28): 2026-06-29, 2026-06-30, 2026-06-30 (Phase 2 — logic & interactivity), 2026-06-30 (Phase 3.1 — restore dashed hidden lines, keep X-ray), 2026-06-30 (Phase 3.2 — persistent X-ray, seam & hidden-line fixes), 2026-06-30 (Phase 3 — projection morph, X-ray overhaul & UI parity), 2026-07-01 (Completion-state cleanup + Back-button parity), 2026-07-01 (Content & Pedagogy Upgrade — foundations content model) (+20 more)

### Community 1 - "main.js"
Cohesion: 0.13
Nodes (16): ADR-0004, tick(), animate(), applyProjectionMorph(), ADR-0007, ADR-0078, layers, pause() (+8 more)

### Community 2 - "CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT)"
Cohesion: 0.15
Nodes (12): CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT), Decision 1 — Canonical "Front Face", Decision 2 — Fully orbitable in 3D, every step (no 2D camera lock), Decision 3 — RETAIN `meshAnalyzer.js` + the dynamic projection/line-drawing machinery, Decision 4 — BIS line-type mapping for the Front Face, Non-negotiables inherited from Module 2 (apply unchanged), Open questions (geometry to verify before build) — see chat, Refactor intent (what this overturns) (+4 more)

### Community 3 - "annotations.js"
Cohesion: 0.22
Nodes (12): ADR-0018, ARROW, buildSegments(), CHAIN, createAnnotations(), cssColor(), ADR-0007, pushArrowTriangle() (+4 more)

### Community 4 - "lineDrawer.js"
Cohesion: 0.21
Nodes (11): bucketCovers(), createLineDrawer(), cssColor(), DASH, EdgeClass, findCoplanarPair(), ADR-0007, LINE_WIDTH_PX (+3 more)

### Community 5 - "init"
Cohesion: 0.25
Nodes (11): announce(), applyLayers(), init(), markBooted(), reset(), restoreView(), setupMobileNotice(), setZoomLabel() (+3 more)

### Community 6 - "bearingBlock.js"
Cohesion: 0.29
Nodes (9): ADR-0001, BEARING_BLOCK_DIMS, buildBearingBlockGeometry(), buildBodyProfile(), buildFootProfile(), createBearingBlock(), cssColor(), ADR-0007 (+1 more)

### Community 7 - "meshAnalyzer.js"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 8 - "anim.js"
Cohesion: 0.22
Nodes (7): active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 9 - "stepper.js"
Cohesion: 0.33
Nodes (5): ADR-0007, STEPS, TERMS, ADR-0007, ADR-0078

### Community 10 - "buildScene"
Cohesion: 0.38
Nodes (7): buildScene(), cssColor(), exitFrontViewSmooth(), handleResize(), onOrthoInteractionStart(), onViewportPointerDown(), orthoFrustum()

### Community 11 - "engageOrtho"
Cohesion: 0.38
Nodes (7): clearProjectionMorph(), engageOrtho(), ensurePerspectiveActive(), frameToBlock(), setFrontViewActive(), usePerspective(), viewportSize()

### Community 12 - "tween"
Cohesion: 0.40
Nodes (6): tween(), frontViewOrtho(), frontViewPose(), orbitToAzimuth(), tweenCamera(), tweenPerspectiveTo()

### Community 13 - "rebuild"
Cohesion: 0.33
Nodes (5): createLabelLayer(), ADR-0007, disposeContent(), rebuild(), setXray()

### Community 14 - "DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)"
Cohesion: 0.40
Nodes (4): 1. Subject, 2. BIS line-type → token map (the only encoding this topic adds), 3. Fat-line stack (inherited, non-negotiable), DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)

## Knowledge Gaps
- **71 isolated node(s):** `active`, `easeFold`, `easeDraw`, `easeDissolve`, `rootStyle` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createAnnotations()` connect `annotations.js` to `main.js`, `rebuild`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Why does `createLineDrawer()` connect `lineDrawer.js` to `main.js`, `rebuild`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `buildScene()` (e.g. with `onOrthoInteractionStart()` and `onViewportPointerDown()`) actually correct?**
  _`buildScene()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `active`, `easeFold`, `easeDraw` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Changelog` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._