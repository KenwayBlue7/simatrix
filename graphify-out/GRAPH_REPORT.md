# Graph Report - C:/xampp/htdocs/Simatrix  (2026-07-10)

## Corpus Check
- 35 files · ~389,323 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1484 nodes · 2608 edges · 142 communities (86 shown, 56 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 178 edges (avg confidence: 0.69)
- Token cost: 487,331 input · 0 output

## Community Hubs (Navigation)
- Module 1 Engine Core
- Module 2 Sim Orchestrator
- Simple Positions Sim
- Foundations Sim & Annotations
- Cross-Module Orchestrator Docs
- Points Sim & Fold
- Module 1 First-Angle Projection
- Module 2 Solid Geometry Core
- Architecture Decisions (ADRs)
- Intro to Solids Sim
- Simple Positions Solid Generators
- Module 1 Lines & Traces
- Module 1 Dimensioning
- Spatial Framework Fold
- Product Feature Set
- Module 1 Lesson Docs
- Module 1 Lines Engine
- Intro Solid Generators
- Simple Positions 2D Drawer
- Module 2 2D Projection Drawer
- Spatial Framework Changelog & UI
- Module 1 Lines & Traces
- Points HP/VP Planes
- Points Point Projector
- Spatial Framework HP/VP Planes
- Spatial Framework Point Projector
- Intro Solid Geometry Core
- Module 1 Quadrant System
- Spatial Framework Frustums
- Foundations Line Drawer
- Points Sim Orchestrator
- Points Compare Workbench
- Simple Positions Problem Library
- Simple Positions Vertex Labeler
- Module 2 Problem Library
- Module 2 Vertex Labeler
- Foundations Animation
- Spatial Framework Animation
- Points Animation
- Intro to Solids Vertex Labeler
- Simple Positions Animation
- Module 1 Animation
- Module 2 Animation
- Product Design Principles
- Foundations Bearing Block
- Foundations Hidden-Line Analyzer
- Spatial Framework Label Layer
- Spatial Framework Guided Stepper
- Points Label Layer
- Intro to Solids Solid Anatomy
- Simple Positions Hidden-Line Analyzer
- Simple Positions UI Manager
- Module 2 Hidden-Line Analyzer
- Module 2 Design Docs
- Points Sim Orchestrator
- Points UI Manager
- Module 1 Line Steps
- Spatial Framework Framework Data
- Points Sim Orchestrator
- Points Point Steps
- Module 1 Plane Steps
- Spatial Framework Sim Orchestrator
- Spatial Framework Sim Orchestrator
- Spatial Framework UI Manager
- Simple Positions Lesson Page UI
- Spatial Framework Sim Orchestrator
- Points Problem Set
- Design & Decision Notes
- Spatial Framework Sim Orchestrator
- Points Onboarding
- Points Problem Library
- Intro to Solids Module Guide
- Simple Positions Onboarding
- Module 2 Onboarding
- Foundations Module Guide
- Spatial Framework Sim Orchestrator
- Points Point Data
- Intro to Solids Lesson Page UI
- Module 1 Line Problems
- Module 1 Onboarding
- Design System Rules
- Foundations Lesson Page UI
- Foundations Label Layer
- Foundations Glossary Terms
- Spatial Framework Changelog
- Spatial Framework Lesson Page UI
- Points Changelog
- Module 1 Changelog
- Module 1 Quadrant Steps
- Changelog
- Changelog
- Changelog
- Changelog
- Changelog
- Architecture Decisions ADR Note
- Points Changelog
- Module 2 2026-06-01T14-57-13Z__Index-Html
- Module 2 Lesson Page UI
- Module 2 Lesson Page UI
- Product Spec Product Notes
- Changelog
- Changelog
- Changelog
- Changelog
- Changelog
- Changelog
- Architecture Decisions ADR Note
- Architecture Decisions ADR Note
- Architecture Decisions ADR Note
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Design System Design Notes
- Foundations Changelog
- Foundations Lesson Page UI
- Spatial Framework Changelog
- Spatial Framework Changelog
- Points Lesson Page UI
- Intro to Solids Changelog
- Simple Positions Changelog
- Module 2 Changelog
- Module 2 Module Guide
- Module 2 Module Guide
- Module 2 Design Notes
- Module 2 Design Notes
- Module 2 Design Notes
- Module 2 Design Notes
- Module 2 Design Notes
- Module 2 Lesson Page UI
- Module 2 Lesson Page UI
- Module 2 Lesson Page UI
- Platform Rules

## God Nodes (most connected - your core abstractions)
1. `$()` - 29 edges
2. `asg()` - 28 edges
3. `rebuild()` - 26 edges
4. `alb()` - 25 edges
5. `wire()` - 25 edges
6. `announce()` - 20 edges
7. `buildTraceScene()` - 19 edges
8. `albBox()` - 19 edges
9. `buildTLScene()` - 17 edges
10. `alp()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Module 2 Topic 1 DESIGN (Guided Stepper design system)` --semantically_similar_to--> `Module 2 Topic 2 DESIGN (Guided Stepper design system)`  [INFERRED] [semantically similar]
  graphics_module_2_topic_1_introduction/DESIGN.md → graphics_module_2_topic_2_simple_positions/DESIGN.md
- `Orthographic Projection of Solids (HP/VP/PP views)` --semantically_similar_to--> `Projection of a Point (onto HP/VP across four quadrants)`  [INFERRED] [semantically similar]
  Module2/CLAUDE.md → graphics_module_1_topic_3_points/CLAUDE.md
- `Module 2 Topic 1 CLAUDE (Introduction to Solids)` --semantically_similar_to--> `Module 2 Topic 2 CLAUDE (Simple Positions / Orthographic Projection)`  [INFERRED] [semantically similar]
  graphics_module_2_topic_1_introduction/CLAUDE.md → graphics_module_2_topic_2_simple_positions/CLAUDE.md
- `Lines 2D Compare Sheet-Locked Scale` --semantically_similar_to--> `Points/Lines Auto-Zoom Framing`  [INFERRED] [semantically similar]
  CHANGELOG.md → Module1/CHANGELOG.md
- `Dual-Camera Ortho Quick-Views` --semantically_similar_to--> `Front View Projection Morph`  [INFERRED] [semantically similar]
  graphics_module_1_topic_3_points/CHANGELOG.md → graphics_module_1_topic_1_foundations/CHANGELOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **The named colour rules (binding everywhere)** — design_quiet_chrome_rule, design_chrome_only_blue_rule, design_two_cue_rule [EXTRACTED 0.90]
- **Module 1's migration from shared-engine to the orchestrator pattern** — decisions_adr_007_orchestrator_leaf_modules, decisions_adr_011_module1_shared_engine, decisions_adr_029_foundations_orchestrator_hidden_line, decisions_adr_033_module1_orchestrator_migration [EXTRACTED 0.85]
- **Centralization of shared docs into the Simatrix root** — decisions_adr_010_design_shared_md, decisions_adr_022_centralized_design_md, decisions_adr_023_centralized_product_md, decisions_adr_028_new_topic_consumes_root_docs [EXTRACTED 0.90]
- **ADR-032 Quiet Chrome Scrollbar System** — product_quiet_chrome_principle, changelog_quiet_chrome_scrollbar, module2_changelog_scrollbar, module1_changelog_scrollbar_pill [INFERRED 0.85]
- **Compare Split Workbench System** — product_compare_view, product_lines_workbench, changelog_points_compare_workbench, module1_changelog_lines_compare_split [INFERRED 0.80]
- **3D-to-2D Fold System** — product_fold_animation, changelog_fold_swoop, module1_changelog_fold_swoop [INFERRED 0.85]
- **ADR-032 Quiet Chrome Scrollbar Backport** — graphics_module_1_topic_1_foundations_changelog_quiet_chrome_scrollbar, graphics_module_1_topic_2_spatial_framework_changelog_quiet_chrome_scrollbar, graphics_module_2_topic_1_introduction_changelog_quiet_chrome_scrollbar, graphics_module_2_topic_2_simple_positions_changelog_quiet_chrome_scrollbar [INFERRED 0.80]
- **Dual-Camera Projection Morph (flatten / quick-views)** — graphics_module_1_topic_1_foundations_changelog_front_view_morph, graphics_module_1_topic_2_spatial_framework_changelog_rabattement_fold, graphics_module_1_topic_3_points_changelog_ortho_quick_views, graphics_module_1_topic_3_points_changelog_fold_swoop [INFERRED 0.75]
- **Module-2 Guided Stepper Pattern** — graphics_module_1_topic_1_foundations_index_line_type_wizard, graphics_module_1_topic_2_spatial_framework_changelog_stepper, graphics_module_1_topic_3_points_index_points_wizard, graphics_module_2_topic_2_simple_positions_index_projection_wizard [INFERRED 0.75]
- **Cinematic Reversible Fold / Rabatment System (First-angle, Points, Lines)** — module1_claude_fold_rabatment, module1_firstangle_first_angle_projection, module1_points_projection_of_points, module1_lines_projection_of_straight_lines [INFERRED 0.85]
- **The Simatrix Six-File Documentation System** — architecture_map, decisions_adr_log, design_platform_design_system, module_starter_playbook, documentation_system_methodology, claude_module_template_starter [EXTRACTED 0.90]
- **DESIGN.md Named Rules System** — module2_design_quiet_chrome_rule, module2_design_chrome_only_blue_rule, module2_design_two_cue_rule, module2_design_two_weight_rule, module2_design_tabular_rule, module2_design_flat_ink_rule, module2_design_border_over_shadow_rule, module2_design_host_integration_white_exception [EXTRACTED 0.90]
- **Foundations BIS Line-Type Lesson (Bearing Block)** — graphics_module_1_topic_1_foundations_claude_bearing_block, graphics_module_1_topic_1_foundations_design_bis_line_types, graphics_module_1_topic_1_foundations_claude_hidden_line_classification, module2_claude_meshanalyzer_welding [EXTRACTED 0.85]
- **Two-Cue plane colour encoding (teal HP / amber VP / violet PP)** — graphics_module_2_topic_2_simple_positions_design_two_cue_rule, graphics_module_2_topic_2_simple_positions_design_hp_teal, graphics_module_2_topic_2_simple_positions_design_vp_amber, graphics_module_2_topic_2_simple_positions_design_pp_violet [EXTRACTED 0.90]
- **Iterative design-critique sequence on index.html** — graphics_module_2_topic_2_simple_positions_critique_2026_05_29_0517, graphics_module_2_topic_2_simple_positions_critique_2026_05_29_0830, graphics_module_2_topic_2_simple_positions_critique_2026_06_01_1457, graphics_module_2_topic_2_simple_positions_critique_2026_06_03_1312, graphics_module_2_topic_2_simple_positions_index [INFERRED 0.80]

## Communities (142 total, 56 thin omitted)

### Community 0 - "Module 1 Engine Core"
Cohesion: 0.05
Nodes (101): $(), rebuildFromEdit(), animateFold(), animateFoldSwoop(), announce(), announceState(), applyProjectionMorph(), area (+93 more)

### Community 1 - "Module 2 Sim Orchestrator"
Cohesion: 0.05
Nodes (82): animate(), animateFold(), announce(), answerSheetBox(), applyFoldVisual(), applyMode(), applyProfilePlaneVisibility(), applyProjectionMorph() (+74 more)

### Community 2 - "Simple Positions Sim"
Cohesion: 0.05
Nodes (80): animate(), animateFold(), announce(), answerSheetBox(), applyFoldVisual(), applyMode(), applyProfilePlaneVisibility(), applyProjectionMorph() (+72 more)

### Community 3 - "Foundations Sim & Annotations"
Cohesion: 0.06
Nodes (61): ARROW, buildSegments(), CHAIN, createAnnotations(), cssColor(), ADR-0007, ADR-0018, pushArrowTriangle() (+53 more)

### Community 4 - "Cross-Module Orchestrator Docs"
Cohesion: 0.05
Nodes (53): Foundations (Topic 1) CLAUDE.md — Bearing Block plan, ADR-029 (Foundations on Module 2 orchestrator; retains meshAnalyzer; overturns ADR-011 for this topic), Foundations (Topic 1) DESIGN.md appendix — BIS line-type map, Spatial Framework (Topic 2) CLAUDE.md, ADR-033 (Module 1 remaining topics adopt Module 2 orchestrator pattern), Projection of Points (Topic 3) CLAUDE.md, Module 2 Topic 1 CLAUDE (Introduction to Solids), Shared 3D engine (shape generators + vertexLabeler) (+45 more)

### Community 5 - "Points Sim & Fold"
Cohesion: 0.06
Nodes (32): ADR-0012, ADR-0013, ADR-0021, animate(), applyProjectionMorph(), CAMERA_POSE, compare, currentData (+24 more)

### Community 6 - "Module 1 First-Angle Projection"
Cohesion: 0.12
Nodes (29): buildAnimScene(), draw3D(), firstAngleSymbol(), SYM, conMarker(), buildAnimScene(), draw3D(), QNAME (+21 more)

### Community 7 - "Module 2 Solid Geometry Core"
Cohesion: 0.10
Nodes (30): buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle, buildCylinderGeometry() (+22 more)

### Community 8 - "Architecture Decisions (ADRs)"
Cohesion: 0.08
Nodes (35): ADR-001: No build step; ship pinned CDN ES modules, ADR-004: Every geometry change funnels through one rebuild() pipeline, ADR-005: Re-derive every ported sign visually (Unity LH -> Three.js RH), explicit ZXY Euler, ADR-006: Fat lines + hard-edge geometry + quantized edge welding for crisp technical linework, ADR-007: Orchestrator + leaf modules; leaves don't cross-import, only genericSolid is shared, ADR-008: Rotation priority hierarchy enforced through mutually-exclusive UI, ADR-009: No shared code library; topic clones are manual full copies simplified from Module 2 (the master), ADR-010: DESIGN.shared.md is the platform-wide visual contract, duplicated per module (interim) (+27 more)

### Community 9 - "Intro to Solids Sim"
Cohesion: 0.12
Nodes (31): animate(), announce(), buildScene(), createEdgeOverlay(), cssColor(), cssVar(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET (+23 more)

### Community 10 - "Simple Positions Solid Generators"
Cohesion: 0.12
Nodes (26): buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle, buildCylinderGeometry() (+18 more)

### Community 11 - "Module 1 Lines & Traces"
Cohesion: 0.13
Nodes (28): beginConScene(), buildTLScene(), buildTraceScene(), CALM_GRID, clamp01(), computeTraces(), conLabel(), conLine() (+20 more)

### Community 12 - "Module 1 Dimensioning"
Cohesion: 0.13
Nodes (21): $(), afterRebuild(), draw3D(), FEEDBACK, mark(), wireControls(), draw3D(), FOCUS (+13 more)

### Community 13 - "Spatial Framework Fold"
Cohesion: 0.08
Nodes (17): CAMERA_POSE, currentData, currentView, fadeOutMembers, fadeState, FLAT_VIEW_DIR, FLAT_VIEW_UP, ADR-0004 (+9 more)

### Community 14 - "Product Feature Set"
Cohesion: 0.09
Nodes (23): 3D-to-2D Orthographic Fold Swoop, Points Compare-Split Workbench, Points/Lines Fold Swoop (Module 1), Lines Side-by-Side Compare Split, Lines 5-Step Problem-Solving Stepper, N.D. Bhatt / K.C. John Textbook Problem Sets, HT/VT Trace Markers, Impeccable Critique — Practice Problems Entry Positioning (2026-06-03, 28/40) (+15 more)

### Community 15 - "Module 1 Lesson Docs"
Cohesion: 0.13
Nodes (21): ARCHITECTURE.md — Simatrix Architecture Map, Master → Deploy Relationship (Module 2 is the master), CLAUDE.module-template.md — New-Subject CLAUDE.md Starter, DOCUMENTATION-SYSTEM.md — Six-File Documentation Methodology, Impeccable Critique — Projection of Points Sim (2026-05-30, 35/40), Impeccable Critique — lines.html Projection of Straight Lines (2026-06-02, 32/40), Impeccable Critique — index.html Lesson 1 Two Reference Planes (2026-06-13, 38/40), Cinematic Reversible Fold / Rabatment Animation (+13 more)

### Community 16 - "Module 1 Lines Engine"
Cohesion: 0.27
Nodes (21): drawStage(), draw3D(), angle3(), arc(), asgBold(), buildAnimScene(), draw2D(), draw3D() (+13 more)

### Community 17 - "Intro Solid Generators"
Cohesion: 0.19
Nodes (15): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+7 more)

### Community 18 - "Simple Positions 2D Drawer"
Cohesion: 0.18
Nodes (18): addIfPresent(), addSegment(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections(), EdgeType (+10 more)

### Community 19 - "Module 2 2D Projection Drawer"
Cohesion: 0.18
Nodes (18): addIfPresent(), addSegment(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections(), EdgeType (+10 more)

### Community 20 - "Spatial Framework Changelog & UI"
Cohesion: 0.12
Nodes (18): Bearing Block Model, Front View Projection Morph, Hidden-Line Occlusion Raycaster, Line Classification Fixes, Orbitable Bearing Block Viewport, Turn 90 Viewport Chip, HP/VP Plane Pair, Spatial Quadrant Label Layer (+10 more)

### Community 21 - "Module 1 Lines & Traces"
Cohesion: 0.27
Nodes (17): $(), applyTLState(), enterTL(), enterTrace(), exitCon(), pauseTL(), playTL(), runConAnim() (+9 more)

### Community 22 - "Points HP/VP Planes"
Cohesion: 0.16
Nodes (16): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+8 more)

### Community 23 - "Points Point Projector"
Cohesion: 0.17
Nodes (14): ADR-0006, createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0007 (+6 more)

### Community 24 - "Spatial Framework HP/VP Planes"
Cohesion: 0.17
Nodes (15): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+7 more)

### Community 25 - "Spatial Framework Point Projector"
Cohesion: 0.17
Nodes (14): createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0006, ADR-0007 (+6 more)

### Community 26 - "Intro Solid Geometry Core"
Cohesion: 0.27
Nodes (12): buildPrismGeometry(), rootStyle, buildPyramidGeometry(), createGenericPyramid(), cssColor(), rootStyle, alignmentOffset(), apothem() (+4 more)

### Community 27 - "Module 1 Quadrant System"
Cohesion: 0.24
Nodes (12): $(), $(), syncUI(), sync(), wireControls(), HPVT(), QNAME, sync() (+4 more)

### Community 28 - "Spatial Framework Frustums"
Cohesion: 0.19
Nodes (13): BODIES, createFrustums(), cssColor(), DASH, fatSegments(), ADR-0004, ADR-0006, ADR-0007 (+5 more)

### Community 29 - "Foundations Line Drawer"
Cohesion: 0.21
Nodes (11): bucketCovers(), createLineDrawer(), cssColor(), DASH, EdgeClass, findCoplanarPair(), ADR-0007, LINE_WIDTH_PX (+3 more)

### Community 30 - "Points Sim Orchestrator"
Cohesion: 0.22
Nodes (13): announce(), applyCompareSize(), drawCompare(), exitWorkbench(), handleResize(), init(), isWorkbenchViewport(), markBooted() (+5 more)

### Community 31 - "Points Compare Workbench"
Cohesion: 0.23
Nodes (13): buildScene(), clearProjectionMorph(), clearQuickView(), cssColor(), cueOrthoLock(), driveFold(), engageOrtho(), orthoZoomForDist() (+5 more)

### Community 32 - "Simple Positions Problem Library"
Cohesion: 0.24
Nodes (7): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, ShapeType

### Community 33 - "Simple Positions Vertex Labeler"
Cohesion: 0.24
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 34 - "Module 2 Problem Library"
Cohesion: 0.24
Nodes (7): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, ShapeType

### Community 35 - "Module 2 Vertex Labeler"
Cohesion: 0.24
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 36 - "Foundations Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 37 - "Spatial Framework Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 38 - "Points Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 39 - "Intro to Solids Vertex Labeler"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 40 - "Simple Positions Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 41 - "Module 1 Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 42 - "Module 2 Animation"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 43 - "Product Design Principles"
Cohesion: 0.20
Nodes (10): Quiet Chrome Scrollbar Harmonization, Step-Card Scrollbar Pill (Module 1), Floating Minimal Scrollbars (Module 2), Domain Colours (HP/VP/PP Encoding), Two-State Reset Confirm, Accessibility Commitments (WCAG 2.2 AA), Seven Core Design Principles, Primary Persona — Struggling First-Year (+2 more)

### Community 44 - "Foundations Bearing Block"
Cohesion: 0.29
Nodes (9): ADR-0001, BEARING_BLOCK_DIMS, buildBearingBlockGeometry(), buildBodyProfile(), buildFootProfile(), createBearingBlock(), cssColor(), ADR-0007 (+1 more)

### Community 45 - "Foundations Hidden-Line Analyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 46 - "Spatial Framework Label Layer"
Cohesion: 0.20
Nodes (8): CHIP_OFFSET, ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS, NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/bo

### Community 47 - "Spatial Framework Guided Stepper"
Cohesion: 0.24
Nodes (6): DEFAULT_VIEW, STEPS, TERMS, initStepper(), ADR-0007, ADR-0007

### Community 48 - "Points Label Layer"
Cohesion: 0.20
Nodes (8): CHIP_OFFSET, ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS, NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/bo

### Community 49 - "Intro to Solids Solid Anatomy"
Cohesion: 0.29
Nodes (6): CONCEPTS, factsFor(), LAYER_TOGGLES, ROSTER, SHAPE_FACTS, ShapeType

### Community 50 - "Simple Positions Hidden-Line Analyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 51 - "Simple Positions UI Manager"
Cohesion: 0.27
Nodes (8): clamp(), initUIManager(), parseNumeric(), SLIDERS, clamp(), initUIManager(), parseNumeric(), SLIDERS

### Community 52 - "Module 2 Hidden-Line Analyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 53 - "Module 2 Design Docs"
Cohesion: 0.25
Nodes (9): First-Angle Projection Framework, Four Quadrants (HP/VP intersection), Rabattement Fold (HP hinges flat onto VP about the XY line), Projection of a Point (onto HP/VP across four quadrants), Orthographic Projection of Solids (HP/VP/PP views), HP Teal (Horizontal Plane / top-view encoding), PP Violet (Profile Plane / side-view encoding), Two-Cue Rule (no color carries meaning alone) (+1 more)

### Community 54 - "Points Sim Orchestrator"
Cohesion: 0.22
Nodes (9): commit(), contentBoxWorld(), disposeContent(), flatSheetBox(), notifyStateChange(), rebuild(), viewportSize(), worldPosition() (+1 more)

### Community 55 - "Points UI Manager"
Cohesion: 0.28
Nodes (8): clamp(), initUIManager(), ADR-0007, ADR-0015, ADR-0018, parseNumeric(), QUAD_NOTES, SLIDERS

### Community 56 - "Module 1 Line Steps"
Cohesion: 0.28
Nodes (5): deg(), LineCase, resolveLine(), STEPS, TERMS

### Community 57 - "Spatial Framework Framework Data"
Cohesion: 0.25
Nodes (4): ADR-0018, ADR-0033, QUADRANT_INFO, QuadrantType

### Community 58 - "Points Sim Orchestrator"
Cohesion: 0.25
Nodes (7): completeAndNext(), reset(), resetCamera(), showToast(), initStepper(), ADR-0007, ADR-0037

### Community 59 - "Points Point Steps"
Cohesion: 0.29
Nodes (5): DEFAULT_VIEW, ADR-0012, STEPS, TERMS, ADR-0007

### Community 60 - "Module 1 Plane Steps"
Cohesion: 0.36
Nodes (4): initSim(), defaultPlaneData(), STEPS, TERMS

### Community 61 - "Spatial Framework Sim Orchestrator"
Cohesion: 0.29
Nodes (7): createLabelLayer(), applyFadeLevels(), commit(), disposeContent(), rebuild(), viewportSize(), worldPosition()

### Community 62 - "Spatial Framework Sim Orchestrator"
Cohesion: 0.29
Nodes (7): buildScene(), cssColor(), cueOrthoLock(), handleResize(), init(), markBooted(), setupMobileNotice()

### Community 63 - "Spatial Framework UI Manager"
Cohesion: 0.38
Nodes (6): clamp(), initUIManager(), ADR-0007, ADR-0018, parseNumeric(), SLIDERS

### Community 64 - "Simple Positions Lesson Page UI"
Cohesion: 0.29
Nodes (7): Points Problem Library, Active-Problem Header, Points Problem Library Overlay, Orthographic Projection Viewport, Simple Positions Problem Library, Six-Step Projection Wizard, Solid & Placement Controls

### Community 65 - "Spatial Framework Sim Orchestrator"
Cohesion: 0.40
Nodes (6): clearProjectionMorph(), engageOrtho(), fitOrthoZoom(), restorePerspective(), swoopToAnswerSheet(), tweenCamera()

### Community 66 - "Points Problem Set"
Cohesion: 0.33
Nodes (5): FIELD_LABELS, ADR-0015, ADR-0018, PROBLEMS, TIERS

### Community 67 - "Design & Decision Notes"
Cohesion: 0.40
Nodes (5): ADR-003: CSS design tokens are the single runtime source of truth for all visual values, ADR-032: The floating padded scrollbar pill is the platform scrollbar standard, tinted --color-border, Clinical / Inverted Palette and token table, Creative North Star: The Patient Tutor's Paper, Scrollbars - the floating padded pill

### Community 68 - "Spatial Framework Sim Orchestrator"
Cohesion: 0.40
Nodes (5): announce(), flushFadeOut(), reset(), resetCamera(), startFadeOut()

### Community 70 - "Points Problem Library"
Cohesion: 0.40
Nodes (3): ADR-0007, ADR-0015, ADR-0033

### Community 71 - "Intro to Solids Module Guide"
Cohesion: 0.40
Nodes (5): Apex, Base vertices, Central axis OP, Surface generators, Solid anatomy (parts of solids)

### Community 74 - "Foundations Module Guide"
Cohesion: 0.50
Nodes (4): Bearing Block (simplified pillow/plummer-block housing model), Camera-Dependent Hidden-Line Classification (occlusion raycaster + BVH), BIS Line Types (SP 46:2003 — Type A / E-F / G / B), meshAnalyzer.js Quantized Edge Welding (1e-3 canonical keys)

### Community 75 - "Spatial Framework Sim Orchestrator"
Cohesion: 0.50
Nodes (4): animate(), applyProjectionMorph(), resume(), startLoop()

### Community 77 - "Intro to Solids Lesson Page UI"
Cohesion: 0.50
Nodes (4): Anatomy Gallery Viewport, Anatomy Panel, Anatomy Display Toggles, Shape Rail

### Community 79 - "Module 1 Line Problems"
Cohesion: 0.50
Nodes (3): FIELD_LABELS, PROBLEMS, TIERS

### Community 81 - "Design System Rules"
Cohesion: 0.67
Nodes (3): The Tabular Rule, The Two-Weight Rule, Typography - Atkinson Hyperlegible + IBM Plex Mono

### Community 82 - "Foundations Lesson Page UI"
Cohesion: 0.67
Nodes (3): BIS Line-Type Stepper, Dimension Text Toggle, BIS Line-Type Wizard

### Community 85 - "Spatial Framework Changelog"
Cohesion: 0.67
Nodes (3): Frustum Illustration, Point Projector Rig, Point P Controls

### Community 86 - "Spatial Framework Lesson Page UI"
Cohesion: 0.67
Nodes (3): Orbital Quadrant Flights, Quadrant Picker Panel, Quadrant 2x2 Grid

### Community 87 - "Points Changelog"
Cohesion: 1.00
Nodes (3): Compare 2D Drawing, Compare Workbench, Compare Card

### Community 88 - "Module 1 Changelog"
Cohesion: 0.67
Nodes (3): Dual-Camera Orchestrator Port, Quick-View Camera Chips, Dual Perspective/Orthographic Camera

## Knowledge Gaps
- **420 isolated node(s):** `FEEDBACK`, `SYM`, `FOCUS`, `QNAME`, `active` (+415 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **56 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `armReset()` connect `Module 1 Engine Core` to `Simple Positions UI Manager`, `Points UI Manager`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `Points UI Manager` to `Module 1 Engine Core`, `Module 1 Quadrant System`, `Points Sim & Fold`, `Points Sim Orchestrator`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `sync()` connect `Module 1 Quadrant System` to `Points Sim Orchestrator`, `Points UI Manager`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `wire()` (e.g. with `armReset()` and `beginOverlay()`) actually correct?**
  _`wire()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `FEEDBACK`, `SYM`, `FOCUS` to the rest of the system?**
  _446 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Module 1 Engine Core` be split into smaller, more focused modules?**
  _Cohesion score 0.053296703296703295 - nodes in this community are weakly interconnected._
- **Should `Module 2 Sim Orchestrator` be split into smaller, more focused modules?**
  _Cohesion score 0.0533515731874145 - nodes in this community are weakly interconnected._