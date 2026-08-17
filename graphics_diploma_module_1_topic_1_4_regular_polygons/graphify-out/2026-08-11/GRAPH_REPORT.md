# Graph Report - graphics_diploma_module_1_topic_1_4_regular_polygons  (2026-08-11)

## Corpus Check
- 15 files · ~40,736 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 176 nodes · 321 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `82abe33a`
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
- Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)

## God Nodes (most connected - your core abstractions)
1. `pentagonRaw()` - 18 edges
2. `assignLabelPositions()` - 16 edges
3. `hexagonRaw()` - 13 edges
4. `buildPerpendicularBisector()` - 12 edges
5. `buildSemicircleDivision()` - 11 edges
6. `ngonRaw()` - 11 edges
7. `dist()` - 10 edges
8. `regularPolygonVertices()` - 10 edges
9. `P()` - 8 edges
10. `arcMark()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `rebuild()` --calls--> `assignLabelPositions()`  [EXTRACTED]
  src/main.js → src/renderConstruction.js
- `rebuild()` --calls--> `renderStatic()`  [EXTRACTED]
  src/main.js → src/renderConstruction.js
- `initStepper()` --indirect_call--> `reset()`  [INFERRED]
  src/stepper.js → src/main.js
- `frame()` --calls--> `tick()`  [EXTRACTED]
  src/main.js → src/anim.js
- `rebuild()` --calls--> `findConstruction()`  [EXTRACTED]
  src/main.js → src/constructions.js

## Import Cycles
- None detected.

## Communities (13 total, 2 thin omitted)

### Community 0 - "constructions.js"
Cohesion: 0.13
Nodes (42): ADR-0053, ADR-0143, ADR-0146, ADR-0147, ADR-0148, ADR-0157, angleDim(), angleOf() (+34 more)

### Community 1 - "main.js"
Cohesion: 0.08
Nodes (19): ADR-0002, ADR-0004, dynamicLayer, givenLayer, ADR-0078, ADR-0095, ADR-0145, ADR-0155 (+11 more)

### Community 2 - "renderConstruction.js"
Cohesion: 0.10
Nodes (31): active, cancelAll(), easeDraw, easeStandard, tween(), angledimCandidates(), angledimLabelCenter(), annoLabelBox() (+23 more)

### Community 3 - "CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons"
Cohesion: 0.15
Nodes (12): Architecture — 2D SVG orchestrator (ADR-095, invoked-by ADR-025), CLAUDE.md — Simatrix · Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons, File structure, Non-negotiables inherited from the platform (apply unchanged), Platform contract (wired here — do not add a second path), Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol (+4 more)

### Community 4 - "problemLibrary.js"
Cohesion: 0.24
Nodes (9): initProblemLibrary(), ADR-0015, ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), ADR-0015, PROBLEMS (+1 more)

### Community 5 - "init"
Cohesion: 0.29
Nodes (7): tick(), announce(), frame(), init(), setupVerifyActions(), setupVerifyGate(), setupWizardToggle()

### Community 6 - "DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)"
Cohesion: 0.22
Nodes (8): 1. Subject, 2. Construction-line token map (reused from Topic 1.1/1.2/1.3, unchanged), 3. The method switcher (new to this topic), 4. Step Through (new, N-Gon construction only), 5. Post-construction de-emphasis + label layering (new, ADR-145), 6. Step note — concept blurb for Given/Construct (new, ADR-154), 7. Default view — content-fitted, capped (new, ADR-155), DESIGN.md — Diploma Engineering Graphics, Module 1 Topic 1.4: Regular Polygons (topic appendix)

### Community 7 - "rebuild"
Cohesion: 0.25
Nodes (8): CONSTRUCTIONS, findConstruction(), defaultFit(), rebuild(), resetFit(), setComplete(), clear(), computeBounds()

### Community 8 - "stepper.js"
Cohesion: 0.40
Nodes (4): reset(), initStepper(), ADR-0078, STEPS

### Community 9 - "viewTransform.js"
Cohesion: 0.40
Nodes (4): ADR-0054, ADR-0055, initViewTransform(), ADR-0155

### Community 13 - "Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)"
Cohesion: 0.33
Nodes (5): 2026-08-08, 2026-08-09, 2026-08-10, 2026-08-11, Changelog — Regular Polygons (graphics_diploma_module_1_topic_1_4_regular_polygons)

## Knowledge Gaps
- **63 isolated node(s):** `active`, `easeStandard`, `scaleCache`, `ADR-0143`, `ADR-0095` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `assignLabelPositions()` connect `renderConstruction.js` to `main.js`, `rebuild`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Why does `renderStatic()` connect `renderConstruction.js` to `main.js`, `rebuild`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **What connects `active`, `easeStandard`, `scaleCache` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `constructions.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1331923890063425 - nodes in this community are weakly interconnected._
- **Should `main.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `renderConstruction.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10420168067226891 - nodes in this community are weakly interconnected._