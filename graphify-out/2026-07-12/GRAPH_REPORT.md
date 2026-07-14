# Graph Report - .  (2026-07-12)

## Corpus Check
- 34 files · ~427,716 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1601 nodes · 2859 edges · 136 communities (91 shown, 45 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 162 edges (avg confidence: 0.67)
- Token cost: 378,595 input · 42,065 output

## Community Hubs (Navigation)
- First-Angle Projection Scene
- Fold Animation Engine
- Projection Orchestrator
- Annotations & Arrow Meshes
- Module Docs & ADRs
- Scene Boot & Camera
- Solid Geometry Generators
- Engineering Graphics Concepts
- Edge Overlay & Layers
- Camera Framing & Solids
- Solid Generators (clone)
- Platform Design System
- ADR Index & Compare View
- Dimensioning & Line Types
- Fold Camera Choreography
- Projection Drawer
- Projection Drawer (clone)
- UI Manager & Sliders
- Solid Mesh Builder
- HP/VP Planes
- Point Rig
- HP/VP Planes (clone)
- Point Rig (clone)
- CLAUDE
- PRODUCT
- genericSolid
- ARCHITECTURE
- frustums
- lineDrawer
- main
- main
- main
- main
- problems
- problems
- DECISIONS
- anim
- anim
- main
- main
- anim
- labelLayer
- vertexLabeler
- anim
- vertexLabeler
- anim
- anim
- vertexLabeler
- bearingBlock
- meshAnalyzer
- labelLayer
- spatialSteps
- anatomy
- main
- meshAnalyzer
- meshAnalyzer
- DECISIONS
- CHANGELOG
- CLAUDE
- main
- lineData
- ARCHITECTURE
- DESIGN
- spatialData
- uiManager
- main
- main
- pointSteps
- main
- problems
- DECISIONS
- ARCHITECTURE
- DECISIONS
- main
- pointProblems
- DECISIONS
- main
- onboarding
- problemLibrary
- CLAUDE
- onboarding
- onboarding
- PRODUCT
- uiManager
- CLAUDE
- main
- main
- pointData
- lineProblems
- onboarding
- CHANGELOG
- labelLayer
- terms
- quadrantSteps
- CLAUDE.module-template
- DECISIONS
- DECISIONS
- CHANGELOG
- CHANGELOG
- CHANGELOG
- 2026-06-01T14-57-13Z__index-html
- PRODUCT
- CLAUDE
- DECISIONS
- DECISIONS
- DECISIONS
- DECISIONS
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CLAUDE
- CLAUDE
- DESIGN
- DESIGN
- DESIGN
- DESIGN
- DESIGN
- PLATFORM-RULES
- PRODUCT
- CLAUDE
- CLAUDE

## God Nodes (most connected - your core abstractions)
1. `$()` - 29 edges
2. `asg()` - 28 edges
3. `rebuild()` - 26 edges
4. `alb()` - 25 edges
5. `wire()` - 25 edges
6. `announce()` - 20 edges
7. `RULES.md (Enforcement Checklist)` - 20 edges
8. `buildTraceScene()` - 19 edges
9. `albBox()` - 19 edges
10. `drawProjections()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Module 2 Topic 1 DESIGN (Guided Stepper design system)` --semantically_similar_to--> `Module 2 Topic 2 DESIGN (Guided Stepper design system)`  [INFERRED] [semantically similar]
  graphics_module_2_topic_1_introduction/DESIGN.md → graphics_module_2_topic_2_simple_positions/DESIGN.md
- `Projection of a Point` --semantically_similar_to--> `Orthographic Projection`  [INFERRED] [semantically similar]
  graphics_module_1_topic_3_points/index.html → Module2/index.html
- `Orthographic Projection of Solids (HP/VP/PP views)` --semantically_similar_to--> `Projection of a Point (onto HP/VP across four quadrants)`  [INFERRED] [semantically similar]
  Module2/CLAUDE.md → graphics_module_1_topic_3_points/CLAUDE.md
- `Module 2 Topic 1 CLAUDE (Introduction to Solids)` --semantically_similar_to--> `Module 2 Topic 2 CLAUDE (Simple Positions / Orthographic Projection)`  [INFERRED] [semantically similar]
  graphics_module_2_topic_1_introduction/CLAUDE.md → graphics_module_2_topic_2_simple_positions/CLAUDE.md
- `Dual-Camera Ortho Quick-Views` --semantically_similar_to--> `Front View Projection Morph`  [INFERRED] [semantically similar]
  graphics_module_1_topic_3_points/CHANGELOG.md → graphics_module_1_topic_1_foundations/CHANGELOG.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **The Three-Document System (Map / Why / Checklist)** — architecture_doc, decisions_doc, rules_doc [EXTRACTED 0.90]
- **Module 2 Master to Deploy-Copy Family** — architecture_module2, architecture_topic1_introduction, architecture_topic2_simple_positions, architecture_master_deploy [EXTRACTED 0.90]
- **rebuild() Pipeline Data Flow** — architecture_rebuild_pipeline, architecture_ishape, architecture_meshanalyzer, architecture_projectiondrawer [EXTRACTED 0.85]
- **Guided Stepper pattern shared across the guided lessons** — module2_index_guided_stepper, module2_index_page, graphics_module_1_topic_1_foundations_index_page, graphics_module_1_topic_2_spatial_framework_index_page, graphics_module_1_topic_3_points_index_page, graphics_module_2_topic_2_simple_positions_index_page [INFERRED 0.85]
- **HP, VP and PP form the orthographic reference-plane framework** — graphics_module_1_topic_2_spatial_framework_index_horizontal_plane, graphics_module_1_topic_2_spatial_framework_index_vertical_plane, graphics_module_1_topic_3_points_index_profile_plane, graphics_module_1_topic_2_spatial_framework_index_four_quadrants [INFERRED 0.85]
- **BIS line types A / E-F / G / B form the line-type taxonomy** — graphics_module_1_topic_1_foundations_index_type_a, graphics_module_1_topic_1_foundations_index_type_ef, graphics_module_1_topic_1_foundations_index_type_g, graphics_module_1_topic_1_foundations_index_type_b, graphics_module_1_topic_1_foundations_index_bis_line_types [INFERRED 0.85]
- **Dual-Mode Scaffold (guided stepper + Compare workbench)** — template_starter_claude_starter_template, template_starter_index_guided_stepper, template_starter_index_compare_scaffolding [EXTRACTED 0.90]
- **Platform Runtime Contract** — template_starter_claude_window_simapi, template_starter_claude_meta_json, template_starter_claude_mobile_notice, template_starter_index_import_map, template_starter_index_boot_watchdog [EXTRACTED 0.90]
- **Shared Platform-Wide Root Documents** — template_starter_claude_design_md, template_starter_claude_product_md, template_starter_claude_platform_rules [EXTRACTED 0.90]
- **ADR-032 Quiet Chrome Scrollbar Backport** — graphics_module_1_topic_1_foundations_changelog_quiet_chrome_scrollbar, graphics_module_1_topic_2_spatial_framework_changelog_quiet_chrome_scrollbar, graphics_module_2_topic_1_introduction_changelog_quiet_chrome_scrollbar, graphics_module_2_topic_2_simple_positions_changelog_quiet_chrome_scrollbar [INFERRED 0.80]
- **Dual-Camera Projection Morph (flatten / quick-views)** — graphics_module_1_topic_1_foundations_changelog_front_view_morph, graphics_module_1_topic_2_spatial_framework_changelog_rabattement_fold, graphics_module_1_topic_3_points_changelog_ortho_quick_views, graphics_module_1_topic_3_points_changelog_fold_swoop [INFERRED 0.75]
- **Cinematic Reversible Fold / Rabatment System (First-angle, Points, Lines)** — module1_claude_fold_rabatment, module1_firstangle_first_angle_projection, module1_points_projection_of_points, module1_lines_projection_of_straight_lines [INFERRED 0.85]
- **The Simatrix Six-File Documentation System** — architecture_map, decisions_adr_log, design_platform_design_system, module_starter_playbook, documentation_system_methodology, claude_module_template_starter [EXTRACTED 0.90]
- **DESIGN.md Named Rules System** — module2_design_quiet_chrome_rule, module2_design_chrome_only_blue_rule, module2_design_two_cue_rule, module2_design_two_weight_rule, module2_design_tabular_rule, module2_design_flat_ink_rule, module2_design_border_over_shadow_rule, module2_design_host_integration_white_exception [EXTRACTED 0.90]
- **Foundations BIS Line-Type Lesson (Bearing Block)** — graphics_module_1_topic_1_foundations_claude_bearing_block, graphics_module_1_topic_1_foundations_design_bis_line_types, graphics_module_1_topic_1_foundations_claude_hidden_line_classification, module2_claude_meshanalyzer_welding [EXTRACTED 0.85]
- **Two-Cue plane colour encoding (teal HP / amber VP / violet PP)** — graphics_module_2_topic_2_simple_positions_design_two_cue_rule, graphics_module_2_topic_2_simple_positions_design_hp_teal, graphics_module_2_topic_2_simple_positions_design_vp_amber, graphics_module_2_topic_2_simple_positions_design_pp_violet [EXTRACTED 0.90]
- **Iterative design-critique sequence on index.html** — graphics_module_2_topic_2_simple_positions_critique_2026_05_29_0517, graphics_module_2_topic_2_simple_positions_critique_2026_05_29_0830, graphics_module_2_topic_2_simple_positions_critique_2026_06_01_1457, graphics_module_2_topic_2_simple_positions_critique_2026_06_03_1312, graphics_module_2_topic_2_simple_positions_index [INFERRED 0.80]

## Communities (136 total, 45 thin omitted)

### Community 0 - "First-Angle Projection Scene"
Cohesion: 0.05
Nodes (110): $(), $(), $(), buildAnimScene(), draw3D(), drawStage(), firstAngleSymbol(), SYM (+102 more)

### Community 1 - "Fold Animation Engine"
Cohesion: 0.05
Nodes (101): $(), rebuildFromEdit(), wireControls(), animateFold(), animateFoldSwoop(), announce(), announceState(), applyProjectionMorph() (+93 more)

### Community 2 - "Projection Orchestrator"
Cohesion: 0.05
Nodes (87): animate(), animateFold(), announce(), answerSheetBox(), applyDimensionVisibility(), applyFoldVisual(), applyMode(), applyProfilePlaneVisibility() (+79 more)

### Community 3 - "Annotations & Arrow Meshes"
Cohesion: 0.06
Nodes (61): ARROW, buildSegments(), CHAIN, createAnnotations(), cssColor(), ADR-0007, ADR-0018, pushArrowTriangle() (+53 more)

### Community 4 - "Module Docs & ADRs"
Cohesion: 0.05
Nodes (53): Foundations (Topic 1) CLAUDE.md — Bearing Block plan, ADR-029 (Foundations on Module 2 orchestrator; retains meshAnalyzer; overturns ADR-011 for this topic), Foundations (Topic 1) DESIGN.md appendix — BIS line-type map, Spatial Framework (Topic 2) CLAUDE.md, ADR-033 (Module 1 remaining topics adopt Module 2 orchestrator pattern), Projection of Points (Topic 3) CLAUDE.md, Module 2 Topic 1 CLAUDE (Introduction to Solids), Shared 3D engine (shape generators + vertexLabeler) (+45 more)

### Community 5 - "Scene Boot & Camera"
Cohesion: 0.07
Nodes (40): animate(), announce(), buildScene(), cssColor(), cssVar(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, handleResize() (+32 more)

### Community 6 - "Solid Geometry Generators"
Cohesion: 0.10
Nodes (30): buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle, buildCylinderGeometry() (+22 more)

### Community 7 - "Engineering Graphics Concepts"
Cohesion: 0.12
Nodes (34): Bearing Block (split plummer / pillow block), BIS Line Types (SP 46:2003), Dimensioning System (Aligned vs Unidirectional), Camera-Dependent Edge Classification (visible vs hidden, meshAnalyzer + BVH raycaster), Engineering Graphics Foundations lesson, Type A — Continuous Wide (visible edges), Type B — Continuous Narrow (dimensions/leaders), Type E/F — Dashed (hidden edges) (+26 more)

### Community 8 - "Edge Overlay & Layers"
Cohesion: 0.12
Nodes (31): animate(), announce(), buildScene(), createEdgeOverlay(), cssColor(), cssVar(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET (+23 more)

### Community 9 - "Camera Framing & Solids"
Cohesion: 0.09
Nodes (29): applyMode(), computeEffectiveAngles(), contentBox(), createSolidMesh(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, DEFAULT_VIEW_DIR, fitPerspectiveDistance() (+21 more)

### Community 10 - "Solid Generators (clone)"
Cohesion: 0.12
Nodes (26): buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle, buildCylinderGeometry() (+18 more)

### Community 11 - "Platform Design System"
Cohesion: 0.09
Nodes (33): DESIGN.md (platform design system), meta.json (four required fields), Dismissible Mobile Notice (<768px), Module-Local ARCHITECTURE / DECISIONS / RULES, PLATFORM-RULES.md, Platform Visual Rules (Quiet Chrome, Chrome-Only Blue, Two-Cue, Two-Weight, Tabular, Flat-Ink, Border-Over-Shadow), Platform-Wide Contract, rebuild() State-Change Pipeline (+25 more)

### Community 12 - "ADR Index & Compare View"
Cohesion: 0.07
Nodes (26): ADR-0004, ADR-0012, ADR-0013, ADR-0015, ADR-0016, ADR-0021, ADR-0033, ADR-0036 (+18 more)

### Community 13 - "Dimensioning & Line Types"
Cohesion: 0.13
Nodes (21): $(), afterRebuild(), draw3D(), FEEDBACK, mark(), wireControls(), draw3D(), FOCUS (+13 more)

### Community 14 - "Fold Camera Choreography"
Cohesion: 0.08
Nodes (17): CAMERA_POSE, currentData, currentView, fadeOutMembers, fadeState, FLAT_VIEW_DIR, FLAT_VIEW_UP, ADR-0004 (+9 more)

### Community 15 - "Projection Drawer"
Cohesion: 0.14
Nodes (24): addIfPresent(), addSegment(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections() (+16 more)

### Community 16 - "Projection Drawer (clone)"
Cohesion: 0.14
Nodes (24): addIfPresent(), addSegment(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections() (+16 more)

### Community 17 - "UI Manager & Sliders"
Cohesion: 0.13
Nodes (17): clamp(), initUIManager(), ADR-0007, ADR-0015, ADR-0018, parseNumeric(), QUAD_NOTES, SLIDERS (+9 more)

### Community 18 - "Solid Mesh Builder"
Cohesion: 0.19
Nodes (15): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+7 more)

### Community 19 - "HP/VP Planes"
Cohesion: 0.16
Nodes (16): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+8 more)

### Community 20 - "Point Rig"
Cohesion: 0.17
Nodes (14): ADR-0006, createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0007 (+6 more)

### Community 21 - "HP/VP Planes (clone)"
Cohesion: 0.17
Nodes (15): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+7 more)

### Community 22 - "Point Rig (clone)"
Cohesion: 0.17
Nodes (14): createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0006, ADR-0007 (+6 more)

### Community 23 - "CLAUDE"
Cohesion: 0.17
Nodes (16): Impeccable Critique — Projection of Points Sim (2026-05-30, 35/40), Impeccable Critique — lines.html Projection of Straight Lines (2026-06-02, 32/40), Impeccable Critique — index.html Lesson 1 Two Reference Planes (2026-06-13, 38/40), Cinematic Reversible Fold / Rabatment Animation, Module 1 CLAUDE.md — EG Foundations (seven shared-frame lessons), Quadrant Sign Convention (resolvePosition sign table), Module 1 DESIGN.md — Premium Interaction Layer, Dimensioning (three parts of a dimension; aligned vs unidirectional) (+8 more)

### Community 24 - "PRODUCT"
Cohesion: 0.12
Nodes (16): Points/Lines Fold Swoop (Module 1), Lines Side-by-Side Compare Split, Lines 5-Step Problem-Solving Stepper, N.D. Bhatt / K.C. John Textbook Problem Sets, HT/VT Trace Markers, Impeccable Critique — Practice Problems Entry Positioning (2026-06-03, 28/40), Quiet Chrome Rule (blue accent <=10% of chrome), Compare View (+8 more)

### Community 25 - "genericSolid"
Cohesion: 0.27
Nodes (12): buildPrismGeometry(), rootStyle, buildPyramidGeometry(), createGenericPyramid(), cssColor(), rootStyle, alignmentOffset(), apothem() (+4 more)

### Community 26 - "ARCHITECTURE"
Cohesion: 0.18
Nodes (14): anim.js (Shared Tween + Easing Engine), genericSolid.js (Shared Polygon Trigonometry), Module 1 (Foundations of Projection), Module 2 (Master — Orthographic Projection of Solids), Orchestrator + Leaf-Modules Pattern, graphics_module_1_topic_3_points, Shared engine.js + Thin Pages Pattern, graphics_module_1_topic_2_spatial_framework (+6 more)

### Community 27 - "frustums"
Cohesion: 0.19
Nodes (13): BODIES, createFrustums(), cssColor(), DASH, fatSegments(), ADR-0004, ADR-0006, ADR-0007 (+5 more)

### Community 28 - "lineDrawer"
Cohesion: 0.21
Nodes (11): bucketCovers(), createLineDrawer(), cssColor(), DASH, EdgeClass, findCoplanarPair(), ADR-0007, LINE_WIDTH_PX (+3 more)

### Community 29 - "main"
Cohesion: 0.22
Nodes (13): announce(), applyCompareSize(), drawCompare(), exitWorkbench(), handleResize(), init(), isWorkbenchViewport(), markBooted() (+5 more)

### Community 30 - "main"
Cohesion: 0.15
Nodes (12): animate(), applyProjectionMorph(), handleResize(), init(), markBooted(), resume(), setupConnectorToggle(), setupMobileNotice() (+4 more)

### Community 31 - "main"
Cohesion: 0.33
Nodes (13): answerSheetBox(), clearProjectionMorph(), engageOrtho(), fitOrthoZoom(), flattenedViewBox(), restorePerspective(), setFlatView(), setupQuickViews() (+5 more)

### Community 32 - "main"
Cohesion: 0.23
Nodes (12): animateFold(), applyDimensionVisibility(), applyFoldVisual(), applyProfilePlaneVisibility(), disposeActiveProjection(), refreshProjections(), setDimensionsVisible(), setObjectOpacity() (+4 more)

### Community 33 - "problems"
Cohesion: 0.24
Nodes (7): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, ShapeType

### Community 34 - "problems"
Cohesion: 0.24
Nodes (7): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, ShapeType

### Community 35 - "DECISIONS"
Cohesion: 0.22
Nodes (11): PRODUCT.md (Platform Product Contract), ADR-003: CSS design tokens are the single runtime source of truth, ADR-010: DESIGN.shared.md duplicated per module (superseded), ADR-022: Platform design system centralized into one root DESIGN.md, ADR-023: PRODUCT.md centralized into one root file, ADR-040: Cool-neutral clinical palette remap, DESIGN.md (Platform Design System), Host-Integration White Exception (retired) (+3 more)

### Community 36 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 37 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 38 - "main"
Cohesion: 0.18
Nodes (11): animate(), applyProjectionMorph(), buildScene(), cssColor(), cueOrthoLock(), handleResize(), init(), markBooted() (+3 more)

### Community 39 - "main"
Cohesion: 0.27
Nodes (11): clearProjectionMorph(), clearQuickView(), driveFold(), engageOrtho(), fitOrthoZoom(), fitOrthoZoomForView(), orthoZoomForDist(), restorePerspective() (+3 more)

### Community 40 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 41 - "labelLayer"
Cohesion: 0.18
Nodes (8): CHIP_OFFSET, ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS, NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/bo

### Community 42 - "vertexLabeler"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 43 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 44 - "vertexLabeler"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 45 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 46 - "anim"
Cohesion: 0.18
Nodes (6): active, easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 47 - "vertexLabeler"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 48 - "bearingBlock"
Cohesion: 0.29
Nodes (9): ADR-0001, BEARING_BLOCK_DIMS, buildBearingBlockGeometry(), buildBodyProfile(), buildFootProfile(), createBearingBlock(), cssColor(), ADR-0007 (+1 more)

### Community 49 - "meshAnalyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 50 - "labelLayer"
Cohesion: 0.20
Nodes (8): CHIP_OFFSET, ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS, NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/bo

### Community 51 - "spatialSteps"
Cohesion: 0.24
Nodes (6): DEFAULT_VIEW, STEPS, TERMS, initStepper(), ADR-0007, ADR-0007

### Community 52 - "anatomy"
Cohesion: 0.29
Nodes (6): CONCEPTS, factsFor(), LAYER_TOGGLES, ROSTER, SHAPE_FACTS, ShapeType

### Community 53 - "main"
Cohesion: 0.22
Nodes (10): buildScene(), createEdgeOverlay(), cssColor(), cssVar(), cueOrthoLock(), makePlaneLabel(), makeViewLabel(), pause() (+2 more)

### Community 54 - "meshAnalyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 55 - "meshAnalyzer"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 56 - "DECISIONS"
Cohesion: 0.28
Nodes (9): ARCHITECTURE.md (Whole-Repo Map), Master to Deploy Relationship, ADR-009: No shared library; topic clones are manual full copies, ADR-020: 'Simple Positions' carries no topic number; folder names hide the master, ADR-024: Topic folders named graphics_module_M_topic_K_slug, ADR-025: New subject picks its template by geometry (M2=3D, M1=2D), CLAUDE.module-template.md (New-Subject Starter), MODULE-STARTER.md (New-Sim Playbook) (+1 more)

### Community 57 - "CHANGELOG"
Cohesion: 0.22
Nodes (9): Front View Projection Morph, HP/VP Plane Pair, Spatial Quadrant Label Layer, Rabattement Fold (Flatten-to-2D), Transition Cross-Fades, Fold Swoop, Points Quadrant Numeral Occlusion, Ortho Orbit Lock (+1 more)

### Community 58 - "CLAUDE"
Cohesion: 0.25
Nodes (9): First-Angle Projection Framework, Four Quadrants (HP/VP intersection), Rabattement Fold (HP hinges flat onto VP about the XY line), Projection of a Point (onto HP/VP across four quadrants), Orthographic Projection of Solids (HP/VP/PP views), HP Teal (Horizontal Plane / top-view encoding), PP Violet (Profile Plane / side-view encoding), Two-Cue Rule (no color carries meaning alone) (+1 more)

### Community 59 - "main"
Cohesion: 0.25
Nodes (9): announce(), completeAndNext(), reset(), resetCamera(), setConnectorsVisible(), setFirstAngleSymbol(), setupWizardToggle(), showContextLostNotice() (+1 more)

### Community 60 - "lineData"
Cohesion: 0.28
Nodes (5): deg(), LineCase, resolveLine(), STEPS, TERMS

### Community 61 - "ARCHITECTURE"
Cohesion: 0.29
Nodes (8): graphics_module_1_topic_1_foundations (cross-family hybrid), meshAnalyzer.js (Edge Welding), No-Build Pinned-CDN ES-Module Contract, three-mesh-bvh (Occlusion Raycaster Acceleration), ADR-001: No build step; pinned CDN ES modules, ADR-006: Fat lines + hard-edge geometry + quantized edge welding, ADR-030: three-mesh-bvh via CDN import map accelerates occlusion, ADR-031: rAF-throttle on-orbit hidden-line update, never debounce

### Community 62 - "DESIGN"
Cohesion: 0.36
Nodes (8): ADR-019: Verify sims headlessly via Node built-in WebSocket CDP, Border-Over-Shadow Rule, Chrome-Only Blue Rule, Flat-Ink Rule, Quiet Chrome Rule, Tabular Rule, Two-Weight Rule, RULES.md (Enforcement Checklist)

### Community 63 - "spatialData"
Cohesion: 0.25
Nodes (4): ADR-0018, ADR-0033, QUADRANT_INFO, QuadrantType

### Community 64 - "uiManager"
Cohesion: 0.32
Nodes (7): clamp(), initUIManager(), ADR-0007, ADR-0018, parseNumeric(), QUAD_NOTES, SLIDERS

### Community 65 - "main"
Cohesion: 0.25
Nodes (8): commit(), contentBoxWorld(), disposeContent(), flatSheetBox(), notifyStateChange(), rebuild(), viewportSize(), worldPosition()

### Community 66 - "main"
Cohesion: 0.25
Nodes (7): completeAndNext(), reset(), resetCamera(), showToast(), initStepper(), ADR-0007, ADR-0037

### Community 67 - "pointSteps"
Cohesion: 0.29
Nodes (5): DEFAULT_VIEW, ADR-0012, STEPS, TERMS, ADR-0007

### Community 68 - "main"
Cohesion: 0.29
Nodes (7): createLabelLayer(), applyFadeLevels(), commit(), disposeContent(), rebuild(), viewportSize(), worldPosition()

### Community 69 - "problems"
Cohesion: 0.33
Nodes (5): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, PROBLEMS, TIERS

### Community 70 - "DECISIONS"
Cohesion: 0.40
Nodes (6): On-Demand Compare View (floating card), ADR-012: On-demand Compare View replaced persistent dual-pane, ADR-013: The fold camera moves (revised, then re-overturned), ADR-036: Restore front-on ortho camera swoop during the fold, Cinematic Fold-to-Flat Animation, template_starter (Stripped Boilerplate Scaffold)

### Community 71 - "ARCHITECTURE"
Cohesion: 0.33
Nodes (6): Guided Stepper (one-idea-per-step teaching shape), Sandboxed iframe Boundary, meta.json Four-Field Metadata Contract, window.simAPI Host Contract (pause/resume/reset), Simatrix Teaching Platform, ADR-002: Host integration via window.simAPI, not postMessage

### Community 72 - "DECISIONS"
Cohesion: 0.40
Nodes (6): Unified Git Monorepo, projectionDrawer.js (Orthographic Projections + Dimensions), CHANGELOG.md (Root Changelog), ADR-039: Repository flattening into one unified monorepo, ADR-041: Split HP/VP dimension groups + filled BIS arrowheads, DECISIONS.md (ADR Log)

### Community 73 - "main"
Cohesion: 0.33
Nodes (6): announce(), flushFadeOut(), reset(), resetCamera(), restorePerspective(), startFadeOut()

### Community 74 - "pointProblems"
Cohesion: 0.33
Nodes (5): FIELD_LABELS, ADR-0015, ADR-0018, PROBLEMS, TIERS

### Community 75 - "DECISIONS"
Cohesion: 0.40
Nodes (5): iShape.js Shape-Generator Contract (ZXY Euler), Single rebuild() Pipeline, ADR-004: Every geometry change funnels through one rebuild() pipeline, ADR-005: Re-derive ported signs visually; explicit ZXY Euler, ADR-008: Rotation priority hierarchy via mutually-exclusive UI

### Community 76 - "main"
Cohesion: 0.50
Nodes (5): clearProjectionMorph(), engageOrtho(), fitOrthoZoom(), swoopToAnswerSheet(), tweenCamera()

### Community 78 - "problemLibrary"
Cohesion: 0.40
Nodes (3): ADR-0007, ADR-0015, ADR-0033

### Community 79 - "CLAUDE"
Cohesion: 0.40
Nodes (5): Apex, Base vertices, Central axis OP, Surface generators, Solid anatomy (parts of solids)

### Community 82 - "PRODUCT"
Cohesion: 0.40
Nodes (5): Accessibility Commitments (WCAG 2.2 AA), Seven Core Design Principles, Primary Persona — Struggling First-Year, Quiet Chrome, Loud Subject, Design for the Struggling Learner First

### Community 83 - "uiManager"
Cohesion: 0.60
Nodes (4): clamp(), initUIManager(), parseNumeric(), SLIDERS

### Community 84 - "CLAUDE"
Cohesion: 0.50
Nodes (4): Bearing Block (simplified pillow/plummer-block housing model), Camera-Dependent Hidden-Line Classification (occlusion raycaster + BVH), BIS Line Types (SP 46:2003 — Type A / E-F / G / B), meshAnalyzer.js Quantized Edge Welding (1e-3 canonical keys)

### Community 85 - "main"
Cohesion: 0.50
Nodes (4): animate(), applyProjectionMorph(), resume(), startLoop()

### Community 86 - "main"
Cohesion: 0.50
Nodes (4): buildScene(), cssColor(), cueOrthoLock(), pinCanvasSize()

### Community 89 - "lineProblems"
Cohesion: 0.50
Nodes (3): FIELD_LABELS, PROBLEMS, TIERS

### Community 91 - "CHANGELOG"
Cohesion: 0.67
Nodes (3): Bearing Block Model, Hidden-Line Occlusion Raycaster, Line Classification Fixes

## Knowledge Gaps
- **429 isolated node(s):** `FEEDBACK`, `SYM`, `FOCUS`, `QNAME`, `active` (+424 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **45 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `initStepper()` connect `main` to `First-Angle Projection Scene`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `reset()` connect `main` to `main`, `ADR Index & Compare View`, `main`, `main`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `sync()` connect `First-Angle Projection Scene` to `UI Manager & Sliders`, `main`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `wire()` (e.g. with `armReset()` and `beginOverlay()`) actually correct?**
  _`wire()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **What connects `FEEDBACK`, `SYM`, `FOCUS` to the rest of the system?**
  _463 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `First-Angle Projection Scene` be split into smaller, more focused modules?**
  _Cohesion score 0.05028571428571429 - nodes in this community are weakly interconnected._
- **Should `Fold Animation Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.053296703296703295 - nodes in this community are weakly interconnected._