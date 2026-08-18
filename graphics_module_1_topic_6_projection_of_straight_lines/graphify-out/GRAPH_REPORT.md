# Graph Report - graphics_module_1_topic_6_projection_of_straight_lines  (2026-08-18)

## Corpus Check
- 27 files · ~68,739 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 348 nodes · 593 edges · 17 communities (16 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 13 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d0467c3f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- main.js
- Changelog — Projection of Straight Lines
- traces.js
- compareSheet.js
- enterCon
- lineRig.js
- init
- reset
- stepper.js
- CLAUDE.md — Simatrix · Projection of Straight Lines
- anim.js
- uiManager.js
- loop
- buildScene
- syncRailToggleState
- lineProblems.js
- pause

## God Nodes (most connected - your core abstractions)
1. `Changelog — Projection of Straight Lines` - 45 edges
2. `init()` - 21 edges
3. `enterCon()` - 12 edges
4. `addLabel()` - 12 edges
5. `createTraces()` - 12 edges
6. `methodBegin()` - 11 edges
7. `layout2D()` - 11 edges
8. `computeTraces()` - 11 edges
9. `rebuild()` - 10 edges
10. `setView()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `initStepper()` --indirect_call--> `reset()`  [INFERRED]
  src/stepper.js → main.js
- `rebuild()` --calls--> `createLineRig()`  [EXTRACTED]
  main.js → src/lineRig.js
- `reframeIfClipped()` --calls--> `tween()`  [EXTRACTED]
  main.js → src/anim.js
- `flatSheetBox()` --calls--> `resolveLine()`  [EXTRACTED]
  main.js → src/lineData.js
- `beatTween()` --calls--> `tween()`  [EXTRACTED]
  main.js → src/anim.js

## Import Cycles
- None detected.

## Communities (17 total, 1 thin omitted)

### Community 0 - "main.js"
Cohesion: 0.04
Nodes (45): ADR-0011, ADR-0014, ADR-0036, ADR-0037, ADR-0051, ADR-0080, ADR-0085, ADR-0095 (+37 more)

### Community 1 - "Changelog — Projection of Straight Lines"
Cohesion: 0.04
Nodes (45): 2026-07-12 — Migration off `engine.js` to the standalone topic, COMPLETE (Phases 4A–4G, ADR-042), 2026-07-13 — Final annotation pass: balanced endpoint labels, icon-button layout, construction hierarchy, 2026-07-13 — Label-placement architecture: ONE centralized placement policy (`labelPlacement.js`), 2026-07-13 — Label-placement parity: reuse the Points `CHIP_OFFSET` standoff strategy, 2026-07-13 — Scene framing: restore the Points apparatus-tight philosophy (HP/VP extents 60→24), 2026-07-13 — Visual-parity pass: restore the clean orthographic sheet against the Points gold standard, 2026-07-15 — Remove vestigial Points leftovers + earlier UI-quality pass (impeccable), 2026-07-19 — Promoted to catalog topic 6; Problem Library doc un-staled; tokens reconciled (ADR-072) (+37 more)

### Community 2 - "traces.js"
Cohesion: 0.09
Nodes (35): ADR-0038, ADR-0053, ADR-0072, ADR-0075, methodPhaseCount(), bisectorAnchor(), ADR-0007, PLACEMENT (+27 more)

### Community 3 - "compareSheet.js"
Cohesion: 0.07
Nodes (35): ADR-0016, ADR-0034, ADR-0055, createCompareSheet(), cssColor(), ADR-0004, ADR-0007, ADR-0012 (+27 more)

### Community 4 - "enterCon"
Cohesion: 0.09
Nodes (32): beatTween(), canShowMethod(), commit(), contentBoxWorld(), disposeContent(), ensureCompareForCon(), ensureConNav(), ensureSheetRenderer() (+24 more)

### Community 5 - "lineRig.js"
Cohesion: 0.08
Nodes (25): createLabel(), createLabelManager(), ANGLE_OFFSET, AXIS_X_ANCHOR, AXIS_Y_ANCHOR, ADR-0018, ADR-0079, PLANE_HP_ANCHOR (+17 more)

### Community 6 - "init"
Cohesion: 0.09
Nodes (22): ADR-0089, handleResize(), init(), markBooted(), remeasureAfterReflow(), setupCompareCard(), setupMobileNotice(), setupRailToggle() (+14 more)

### Community 7 - "reset"
Cohesion: 0.18
Nodes (19): announce(), clearProjectionMorph(), clearQuickView(), completeAndNext(), driveFold(), engageOrtho(), fitOrthoZoom(), fitOrthoZoomForView() (+11 more)

### Community 8 - "stepper.js"
Cohesion: 0.13
Nodes (13): hasDialedWork(), defaultLineData(), LineCase, STEPS, TERMS, initStepper(), ADR-0007, ADR-0017 (+5 more)

### Community 9 - "CLAUDE.md — Simatrix · Projection of Straight Lines"
Cohesion: 0.22
Nodes (8): Architecture — Module 2 orchestrator pattern (ADR-033, overturns ADR-011 for this topic), CLAUDE.md — Simatrix · Projection of Straight Lines, File structure (as built), Keeping Root Documents Current, Non-negotiables inherited from the platform (apply unchanged), Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol

### Community 10 - "anim.js"
Cohesion: 0.22
Nodes (7): active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 11 - "uiManager.js"
Cohesion: 0.32
Nodes (7): clamp(), DRIVERS, initUIManager(), ADR-0007, ADR-0017, ADR-0018, parseNumeric()

### Community 12 - "loop"
Cohesion: 0.40
Nodes (5): applyProjectionMorph(), loop(), resume(), startLoop(), tick()

### Community 13 - "buildScene"
Cohesion: 0.50
Nodes (4): buildScene(), cssColor(), cueOrthoLock(), pinCanvasSize()

### Community 14 - "syncRailToggleState"
Cohesion: 0.50
Nodes (4): ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), syncRailToggleState()

### Community 15 - "lineProblems.js"
Cohesion: 0.50
Nodes (3): FIELD_LABELS, PROBLEMS, TIERS

## Knowledge Gaps
- **167 isolated node(s):** `CAMERA_POSITION`, `CAMERA_TARGET`, `DEFAULT_VIEW`, `QV_DIR`, `quickViewButtons` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `addLabel()` connect `compareSheet.js` to `traces.js`, `lineRig.js`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `createTraces()` connect `traces.js` to `main.js`, `compareSheet.js`, `enterCon`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `CAMERA_POSITION`, `CAMERA_TARGET`, `DEFAULT_VIEW` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.04081632653061224 - nodes in this community are weakly interconnected._
- **Should `Changelog — Projection of Straight Lines` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `traces.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09146341463414634 - nodes in this community are weakly interconnected._
- **Should `compareSheet.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07254623044096728 - nodes in this community are weakly interconnected._