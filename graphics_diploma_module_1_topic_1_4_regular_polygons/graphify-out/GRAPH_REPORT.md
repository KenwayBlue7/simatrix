# Graph Report - graphics_diploma_module_1_topic_1_4_regular_polygons  (2026-08-08)

## Corpus Check
- 15 files · ~22,809 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 126 nodes · 198 edges · 14 communities (10 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d976019c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- constructions.js
- main.js
- renderConstruction.js
- CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons
- problemLibrary.js
- init
- DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)
- rebuild
- stepper.js
- viewTransform.js
- uiManager.js
- terms.js
- onboarding.js
- Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)

## God Nodes (most connected - your core abstractions)
1. `buildPerpendicularBisector()` - 11 edges
2. `buildSemicircleDivision()` - 10 edges
3. `CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons` - 8 edges
4. `regularPolygonVertices()` - 7 edges
5. `assignLabelPositions()` - 7 edges
6. `dist()` - 6 edges
7. `arcMark()` - 6 edges
8. `walkVerticesByCompass()` - 6 edges
9. `buildStepNode()` - 6 edges
10. `P()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `rebuild()` --calls--> `renderStatic()`  [EXTRACTED]
  src/main.js → src/renderConstruction.js
- `initStepper()` --indirect_call--> `reset()`  [INFERRED]
  src/stepper.js → src/main.js
- `frame()` --calls--> `tick()`  [EXTRACTED]
  src/main.js → src/anim.js
- `rebuild()` --calls--> `findConstruction()`  [EXTRACTED]
  src/main.js → src/constructions.js
- `rebuild()` --calls--> `clear()`  [EXTRACTED]
  src/main.js → src/renderConstruction.js

## Import Cycles
- None detected.

## Communities (14 total, 4 thin omitted)

### Community 0 - "constructions.js"
Cohesion: 0.21
Nodes (20): ADR-0143, angleDim(), angleOf(), arcMark(), awayFrom(), buildPerpendicularBisector(), buildSemicircleDivision(), circleIntersect() (+12 more)

### Community 1 - "main.js"
Cohesion: 0.10
Nodes (16): ADR-0002, ADR-0004, ADR-0095, dynamicLayer, givenLayer, ADR-0078, onboarding, problemLibrary (+8 more)

### Community 2 - "renderConstruction.js"
Cohesion: 0.15
Nodes (18): active, cancelAll(), easeDraw, easeStandard, tween(), arcPathD(), assignLabelPositions(), boxesOverlap() (+10 more)

### Community 3 - "CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons"
Cohesion: 0.17
Nodes (11): Architecture — 2D SVG orchestrator (ADR-095, invoked-by ADR-025), CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons, File structure, Non-negotiables inherited from the platform (apply unchanged), Platform contract (wired here — do not add a second path), Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol (+3 more)

### Community 4 - "problemLibrary.js"
Cohesion: 0.24
Nodes (9): initProblemLibrary(), ADR-0015, ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), ADR-0015, PROBLEMS (+1 more)

### Community 5 - "init"
Cohesion: 0.33
Nodes (6): tick(), announce(), frame(), init(), setupVerifyActions(), setupWizardToggle()

### Community 6 - "DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)"
Cohesion: 0.40
Nodes (4): 1. Subject, 2. Construction-line token map (reused from Topic 1.1/1.2/1.3, unchanged), 3. The method switcher (new to this topic), DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)

### Community 7 - "rebuild"
Cohesion: 0.50
Nodes (4): CONSTRUCTIONS, findConstruction(), rebuild(), clear()

### Community 8 - "stepper.js"
Cohesion: 0.40
Nodes (4): reset(), initStepper(), ADR-0078, STEPS

### Community 9 - "viewTransform.js"
Cohesion: 0.50
Nodes (3): ADR-0054, ADR-0055, initViewTransform()

## Knowledge Gaps
- **40 isolated node(s):** `active`, `easeStandard`, `ADR-0143`, `state`, `givenLayer` (+35 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `renderStatic()` connect `renderConstruction.js` to `main.js`, `rebuild`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **What connects `active`, `easeStandard`, `ADR-0143` to the rest of the system?**
  _40 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._
- **Should `renderConstruction.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1471861471861472 - nodes in this community are weakly interconnected._