# Graph Report - Simatrix  (2026-07-16)

## Corpus Check
- 192 files · ~500,249 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2535 nodes · 3980 edges · 350 communities (142 shown, 208 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 111 edges (avg confidence: 0.58)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6acf3d1f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- setView
- problemLibrary.js
- main
- lineData
- ARCHITECTURE
- DESIGN
- spatialData
- uiManager
- main
- announce
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
- computeEffectiveAngles
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
- terms
- CHANGELOG
- problemLibrary
- buildScene
- 2026-06-01T14-57-13Z__index-html
- terms
- PRODUCT
- CLAUDE
- DECISIONS
- DECISIONS
- layout
- Simatrix
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CHANGELOG
- announce
- frameDefault
- CHANGELOG
- 5. Components
- CHANGELOG
- CHANGELOG
- CHANGELOG
- CLAUDE
- CLAUDE
- DESIGN
- anim.js
- DESIGN
- DESIGN
- DESIGN
- PLATFORM-RULES
- PRODUCT
- CLAUDE
- init
- DESIGN.md — Module 1 Premium Interaction Layer
- setView
- wireControls
- rebuild
- Simatrix — Rules (Enforcement Checklist)
- Critique — Orthographic Projection Guided Stepper (`index.html`)
- Critique — Orthographic Projection Guided Stepper (`index.html`)
- init
- CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT)
- engageOrtho
- annotations.js
- anim.js
- Critique — `index.html` (Lesson 1: The Two Reference Planes)
- reset
- Changelog — Simatrix (repository root)
- CLAUDE.md — Simatrix Projection of Points
- renderStep
- CLAUDE.md — Simatrix Engineering Graphics Viewer
- glassBox.js
- Changelog
- CLAUDE.md — Simatrix · Module 1 Topic 2: Spatial Framework (BUILT)
- bearingBlock.js
- Critique — Projection of Points simulation (`index.html` + `main.js`)
- Critique — `lines.html` (Projection of Straight Lines)
- CLAUDE.md — Simatrix · Module 2 Topic 1: Introduction to Solids
- CLAUDE.md — Simatrix Engineering Graphics Viewer
- 2026-05-29T05-17-54Z__index-html.md
- 2026-05-29T08-30-33Z__index-html.md
- 2026-06-03T13-12-43Z__index-html.md
- 2026-05-29T05-17-54Z__index-html.md
- 2026-05-29T08-30-33Z__index-html.md
- 2026-06-03T13-12-43Z__index-html.md
- CLAUDE.md — Simatrix · [Subject Name] · [Module/Topic Name]
- CLAUDE.md — Simatrix: Understanding Orthographic Views
- intro.js
- Changelog — Understanding Orthographic Views
- problems.js
- foundationSteps.js
- DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)
- onboarding.js
- Changelog
- Changelog
- Changelog
- frameDefault
- Unity to Three.js sign re-derivation gotcha
- Changelog — Simatrix Starter Template
- Textbook Problem Library
- Guided Stepper (step rail + step card)
- CLAUDE.md
- Boot Watchdog + WebGL Fallback
- genericSolid.js (Shared Polygon Trigonometry)
- Sandboxed iframe Boundary
- Master to Deploy Relationship
- meshAnalyzer.js (Edge Welding)
- meta.json Four-Field Metadata Contract
- Module 1 (Foundations of Projection)
- Module 2 (Master — Orthographic Projection of Solids)
- No-Build Pinned-CDN ES-Module Contract
- Orchestrator + Leaf-Modules Pattern
- graphics_module_1_topic_3_points
- projectionDrawer.js (Orthographic Projections + Dimensions)
- Single rebuild() Pipeline
- Shared engine.js + Thin Pages Pattern
- window.simAPI Host Contract (pause/resume/reset)
- Simatrix Teaching Platform
- graphics_module_1_topic_2_spatial_framework
- three-mesh-bvh (Occlusion Raycaster Acceleration)
- graphics_module_2_topic_1_introduction (deployed copy)
- graphics_module_2_topic_2_simple_positions (deployed copy)
- CHANGELOG.md (Root Changelog)
- ADR-001: No build step; pinned CDN ES modules
- ADR-002: Host integration via window.simAPI, not postMessage
- ADR-003: CSS design tokens are the single runtime source of truth
- ADR-004: Every geometry change funnels through one rebuild() pipeline
- ADR-005: Re-derive ported signs visually; explicit ZXY Euler
- ADR-006: Fat lines + hard-edge geometry + quantized edge welding
- ADR-007: Orchestrator + leaf modules; only genericSolid shared
- ADR-008: Rotation priority hierarchy via mutually-exclusive UI
- ADR-009: No shared library; topic clones are manual full copies
- ADR-010: DESIGN.shared.md duplicated per module (superseded)
- ADR-011: Module 1 uses shared engine.js + thin pages (superseded)
- ADR-012: On-demand Compare View replaced persistent dual-pane
- ADR-013: The fold camera moves (revised, then re-overturned)
- ADR-020: 'Simple Positions' carries no topic number; folder names hide the master
- ADR-022: Platform design system centralized into one root DESIGN.md
- ADR-023: PRODUCT.md centralized into one root file
- ADR-024: Topic folders named graphics_module_M_topic_K_slug
- ADR-025: New subject picks its template by geometry (M2=3D, M1=2D)
- ADR-029: Foundations adopts orchestrator pattern, retains meshAnalyzer
- ADR-030: three-mesh-bvh via CDN import map accelerates occlusion
- ADR-031: rAF-throttle on-orbit hidden-line update, never debounce
- ADR-033: Module 1 fully adopts orchestrator pattern platform-wide
- ADR-036: Restore front-on ortho camera swoop during the fold
- ADR-037: Points Compare gains a standalone 50/50 workbench
- ADR-038: 2D Compare drawing is a fixed sheet-locked scale
- ADR-039: Repository flattening into one unified monorepo
- ADR-040: Cool-neutral clinical palette remap
- ADR-041: Split HP/VP dimension groups + filled BIS arrowheads
- DECISIONS.md (ADR Log)
- Border-Over-Shadow Rule
- Chrome-Only Blue Rule
- DESIGN.md (Platform Design System)
- Flat-Ink Rule
- Cinematic Fold-to-Flat Animation
- Host-Integration White Exception (retired)
- North Star: The Patient Tutor's Paper
- Quiet Chrome Rule
- Tabular Rule
- CSS Design-Token System (single runtime source of truth)
- Two-Cue Rule
- Two-Weight Rule
- DOCUMENTATION-SYSTEM.md — Six-File Documentation Methodology
- Hidden-Line Occlusion Raycaster
- Line Classification Fixes
- ADR-029 (Foundations on Module 2 orchestrator; retains meshAnalyzer; overturns ADR-011 for this topic)
- Camera-Dependent Hidden-Line Classification (occlusion raycaster + BVH)
- BIS Line Types (SP 46:2003 — Type A / E-F / G / B)
- HP/VP Plane Pair
- Spatial Quadrant Label Layer
- Point Projector Rig
- Rabattement Fold (Flatten-to-2D)
- Transition Cross-Fades
- ADR-033 (Module 1 remaining topics adopt Module 2 orchestrator pattern)
- Four Quadrants (HP/VP intersection)
- Rabattement Fold (HP hinges flat onto VP about the XY line)
- Compare Workbench
- Fold Swoop
- Points Quadrant Numeral Occlusion
- Ortho Orbit Lock
- Dual-Camera Ortho Quick-Views
- Projection of a Point (onto HP/VP across four quadrants)
- Base vertices
- Central axis OP
- Surface generators
- Shared 3D engine (shape generators + vertexLabeler)
- Solid anatomy (parts of solids)
- Base orientation / Orient to corner preset
- meshAnalyzer quantized edge welding
- rebuild() single-path disposal contract
- quadrants.js
- window.simAPI platform contract
- Simple positions pose model
- Unity to Three.js sign re-derivation gotcha
- Impeccable critique 2026-05-29T05:17 (score 32, 3 P1s)
- Impeccable critique 2026-05-29T08:30 (score 37, post-fixes)
- Impeccable critique 2026-06-01T14:57 (score 34)
- Impeccable critique 2026-06-03T13:12 (Practice-problems button, score 28)
- Accent blue vs HP projection blue collision (P1)
- font-weight 600 Two-Weight Rule violation (P2)
- Unanchored Practice-problems entry button (P1)
- Unconfirmed one-click Reset wipe (P1)
- Silent unfold-on-edit (visibility gap, P1)
- Implemented tokens drift from DESIGN.md (P1)
- Chrome-Only Blue Rule
- HP Teal (#007f7c, solid HP projection)
- Inline Term Definition component
- PP Violet (#7a5ea6, profile plane projection)
- Quiet Chrome Rule
- Step Rail component (progress spine)
- Technical Blue accent (#1f66b5)
- Two-Cue Rule
- Two-Weight Rule (Atkinson 400/700 only)
- VP Amber (#bc5d1e, dashed VP projection)
- Guided Stepper platform direction
- Struggling first-year primary persona
- WCAG 2.2 AA accessibility commitments
- Impeccable Critique — Projection of Points Sim (2026-05-30, 35/40)
- Impeccable Critique — lines.html Projection of Straight Lines (2026-06-02, 32/40)
- Impeccable Critique — index.html Lesson 1 Two Reference Planes (2026-06-13, 38/40)
- Lines Side-by-Side Compare Split
- Lines 5-Step Problem-Solving Stepper
- N.D. Bhatt / K.C. John Textbook Problem Sets
- HT/VT Trace Markers
- Cinematic Reversible Fold / Rabatment Animation
- Module 1 CLAUDE.md — EG Foundations (seven shared-frame lessons)
- Quadrant Sign Convention (resolvePosition sign table)
- Module 1 DESIGN.md — Premium Interaction Layer
- Dimensioning (three parts of a dimension; aligned vs unidirectional)
- First-Angle Projection & the Fold (SP 46:2003 / BIS)
- The Two Reference Planes (HP + VP meeting at the xy fold line)
- Standard Line Types (visible / hidden / centre / dimension)
- Projection of Points (p top view, p′ front view)
- The Four Dihedral Quadrants
- Impeccable Critique — Module 2 index.html (2026-05-29 v1, 32/40)
- Impeccable Critique — Module 2 index.html post-fixes (2026-05-29 v2, 37/40)
- Impeccable Critique — Practice Problems Entry Positioning (2026-06-03, 28/40)
- meshAnalyzer.js Quantized Edge Welding (1e-3 canonical keys)
- Module 2 Orchestrator + Leaf-Module Pattern (star topology)
- Orthographic Projection of Solids (HP/VP/PP views)
- HP Teal (Horizontal Plane / top-view encoding)
- Inline Term Definition (dotted-underline term popover)
- The Patient Tutor's Paper (Creative North Star)
- PP Violet (Profile Plane / side-view encoding)
- Quiet Chrome Rule (blue accent <=10% of chrome)
- Two-Cue Rule (no color carries meaning alone)
- Two-Weight Rule (Atkinson ships 400/700 only)
- VP Amber (Vertical Plane / front-view encoding)
- CLAUDE.module-template.md (New-Subject Starter)
- MODULE-STARTER.md (New-Sim Playbook)
- PLATFORM-RULES.md (Subject-Agnostic Rules)
- template_starter (Stripped Boilerplate Scaffold)
- Anti-References (Product Boundaries)
- Compare View
- Seven Core Design Principles
- meta.json (topic metadata)
- Guided Stepper
- meshAnalyzer.js
- intro.js
- rebuild
- buildScene
- initUIManager

## God Nodes (most connected - your core abstractions)
1. `Simatrix — Decisions (ADR Log)` - 58 edges
2. `$()` - 29 edges
3. `asg()` - 28 edges
4. `rebuild()` - 26 edges
5. `alb()` - 25 edges
6. `wire()` - 25 edges
7. `Changelog` - 25 edges
8. `Changelog` - 23 edges
9. `Changelog — Projection of Points` - 21 edges
10. `buildTraceScene()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Projection of a Point` --semantically_similar_to--> `Orthographic Projection`  [INFERRED] [semantically similar]
  graphics_module_1_topic_3_points/index.html → Module2/index.html
- `Simple Positions lesson` --semantically_similar_to--> `Orthographic Projection of Solids (Module 2 master lesson)`  [INFERRED] [semantically similar]
  graphics_module_2_topic_2_simple_positions/index.html → Module2/index.html
- `initUIManager()` --indirect_call--> `armReset()`  [INFERRED]
  graphics_module_1_topic_3_points/src/uiManager.js → Module1/src/engine.js
- `initUIManager()` --indirect_call--> `armReset()`  [INFERRED]
  graphics_module_2_topic_2_simple_positions/src/uiManager.js → Module1/src/engine.js
- `initUIManager()` --indirect_call--> `armReset()`  [INFERRED]
  Module2/src/uiManager.js → Module1/src/engine.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Guided Stepper pattern shared across the guided lessons** — module2_index_guided_stepper, module2_index_page, graphics_module_1_topic_1_foundations_index_page, graphics_module_1_topic_2_spatial_framework_index_page, graphics_module_1_topic_3_points_index_page, graphics_module_2_topic_2_simple_positions_index_page [INFERRED 0.85]
- **HP, VP and PP form the orthographic reference-plane framework** — graphics_module_1_topic_2_spatial_framework_index_horizontal_plane, graphics_module_1_topic_2_spatial_framework_index_vertical_plane, graphics_module_1_topic_3_points_index_profile_plane, graphics_module_1_topic_2_spatial_framework_index_four_quadrants [INFERRED 0.85]
- **BIS line types A / E-F / G / B form the line-type taxonomy** — graphics_module_1_topic_1_foundations_index_type_a, graphics_module_1_topic_1_foundations_index_type_ef, graphics_module_1_topic_1_foundations_index_type_g, graphics_module_1_topic_1_foundations_index_type_b, graphics_module_1_topic_1_foundations_index_bis_line_types [INFERRED 0.85]

## Communities (350 total, 208 thin omitted)

### Community 0 - "First-Angle Projection Scene"
Cohesion: 0.05
Nodes (58): animate(), applyMode(), applyProjectionMorph(), buildScene(), compare, computeEffectiveAngles(), contentBox(), createEdgeOverlay() (+50 more)

### Community 1 - "Fold Animation Engine"
Cohesion: 0.06
Nodes (39): animate(), applyCompareSize(), applyProjectionMorph(), compare, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, DEFAULT_VIEW_DIR, driverHomes (+31 more)

### Community 2 - "Projection Orchestrator"
Cohesion: 0.16
Nodes (40): buildAnimScene(), draw3D(), drawStage(), firstAngleSymbol(), SYM, draw3D(), angle3(), asgBold() (+32 more)

### Community 3 - "Annotations & Arrow Meshes"
Cohesion: 0.07
Nodes (42): animate(), announce(), buildScene(), cssColor(), cssVar(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, disposeObj() (+34 more)

### Community 4 - "Module Docs & ADRs"
Cohesion: 0.09
Nodes (40): arc(), beginConScene(), buildTLScene(), buildTraceScene(), CALM_GRID, clamp01(), computeTraces(), conLabel() (+32 more)

### Community 5 - "Scene Boot & Camera"
Cohesion: 0.06
Nodes (37): ADR-0021, CAMERA_POSE, compare, currentData, currentView, fitOrthoZoom(), fitOrthoZoomForView(), hasDialedWork() (+29 more)

### Community 6 - "Solid Geometry Generators"
Cohesion: 0.06
Nodes (32): ADR-0045, ADR-0047, ADR-0050, index.html — Understanding Orthographic Views, boundHalf, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET, foldFadeMats (+24 more)

### Community 7 - "Engineering Graphics Concepts"
Cohesion: 0.10
Nodes (31): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+23 more)

### Community 8 - "Edge Overlay & Layers"
Cohesion: 0.08
Nodes (33): announce(), applyFadeLevels(), buildScene(), CAMERA_POSE, commit(), cssColor(), cueOrthoLock(), currentData (+25 more)

### Community 9 - "Camera Framing & Solids"
Cohesion: 0.05
Nodes (36): 1. Purpose and scope of this file, 2.1 The token table (verified against code), 2.2 Module-1 construction-aid encodings (Lines sim), 2.3 The named colour rules (binding everywhere), 2. Color system, 3.1 Where the fonts are hosted, 3.2 When each font is used (hierarchy), 3.3 The named type rules (+28 more)

### Community 10 - "Solid Generators (clone)"
Cohesion: 0.12
Nodes (34): Bearing Block (split plummer / pillow block), BIS Line Types (SP 46:2003), Dimensioning System (Aligned vs Unidirectional), Camera-Dependent Edge Classification (visible vs hidden, meshAnalyzer + BVH raycaster), Engineering Graphics Foundations lesson, Type A — Continuous Wide (visible edges), Type B — Continuous Narrow (dimensions/leaders), Type E/F — Dashed (hidden edges) (+26 more)

### Community 11 - "Platform Design System"
Cohesion: 0.12
Nodes (27): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+19 more)

### Community 12 - "ADR Index & Compare View"
Cohesion: 0.07
Nodes (29): active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold, easeStandard, tick() (+21 more)

### Community 13 - "Dimensioning & Line Types"
Cohesion: 0.12
Nodes (31): animate(), announce(), buildScene(), createEdgeOverlay(), cssColor(), cssVar(), DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET (+23 more)

### Community 14 - "Fold Camera Choreography"
Cohesion: 0.06
Nodes (32): 3.10 Register the topic in `ARCHITECTURE.md`, 3.1 Name the folder, 3.2 Duplicate `template_starter/`, then restore the solids, 3.3 File-by-file: keep exactly as copied (the shared contracts), 3.4 File-by-file: adapt (the topic-specific content), 3.5 File-by-file: create fresh (only if your topic needs them), 3.6 Update `meta.json` (every field), 3.7 Update the new folder's `CLAUDE.md` (the pointer to root docs) (+24 more)

### Community 15 - "Projection Drawer"
Cohesion: 0.06
Nodes (32): 3.10 Register the topic in `ARCHITECTURE.md`, 3.1 Name the folder, 3.2 Copy the master, whole, 3.3 File-by-file: keep exactly as copied (the shared contracts), 3.4 File-by-file: adapt (the topic-specific content), 3.5 File-by-file: create fresh (only if your topic needs them), 3.6 Update `meta.json` (every field), 3.7 Update the new folder's `CLAUDE.md` (the pointer to root docs) (+24 more)

### Community 16 - "Projection Drawer (clone)"
Cohesion: 0.13
Nodes (21): $(), afterRebuild(), draw3D(), FEEDBACK, mark(), wireControls(), draw3D(), FOCUS (+13 more)

### Community 17 - "UI Manager & Sliders"
Cohesion: 0.06
Nodes (30): A Reusable Methodology for Solo and Small-Team Software Projects, ARCHITECTURE.md — The Map, CLAUDE.module-template.md — The New-Family Starter, DECISIONS.md — The Diary, DESIGN.md — The Visual Contract, How CLAUDE.md Connects Everything, MODULE-STARTER.md — The Onboarding Playbook, PLATFORM-RULES.md — The Subject-Agnostic Foundation (+22 more)

### Community 18 - "Solid Mesh Builder"
Cohesion: 0.12
Nodes (24): tick(), createLabelLayer(), ADR-0007, animate(), applyProjectionMorph(), buildScene(), cssColor(), exitFrontViewSmooth() (+16 more)

### Community 19 - "HP/VP Planes"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 20 - "Point Rig"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 21 - "HP/VP Planes (clone)"
Cohesion: 0.07
Nodes (29): 1. Overview, 2. Colors, 3. Typography, 4. Elevation, 5. Components, 6. Do's and Don'ts, Buttons, Cards / Containers (+21 more)

### Community 22 - "Point Rig (clone)"
Cohesion: 0.07
Nodes (26): 2D drawing conventions (after HP unfolds 90° about the X fold line), 2D sign logic per quadrant, 3D scene conventions (right-handed, Y-up — Three.js default), Architecture (non-negotiable), Cinematic camera (this OVERTURNS the old "camera never moves during the fold" rule), Cinematic reversible fold animation (fold ⇄ unfold, camera sweeps square-on), CLAUDE.md — Simatrix Engineering Graphics · Module 1, Colour convention (platform functional encodings — read from CSS tokens) (+18 more)

### Community 23 - "CLAUDE"
Cohesion: 0.08
Nodes (25): 2026-06-29, 2026-06-30, 2026-06-30 (Phase 2 — logic & interactivity), 2026-06-30 (Phase 3.1 — restore dashed hidden lines, keep X-ray), 2026-06-30 (Phase 3.2 — persistent X-ray, seam & hidden-line fixes), 2026-06-30 (Phase 3 — projection morph, X-ray overhaul & UI parity), 2026-07-01 (Completion-state cleanup + Back-button parity), 2026-07-01 (Content & Pedagogy Upgrade — foundations content model) (+17 more)

### Community 24 - "PRODUCT"
Cohesion: 0.14
Nodes (24): addIfPresent(), addSegment(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections() (+16 more)

### Community 25 - "genericSolid"
Cohesion: 0.14
Nodes (24): addIfPresent(), addSegment(), buildArrowMesh(), buildSegments(), classifyEdge(), cssColor(), DASH, drawProjections() (+16 more)

### Community 26 - "ARCHITECTURE"
Cohesion: 0.08
Nodes (23): 2026-07-02 (3D content: planes, point, cinematic fold), 2026-07-02 (Data layer + registration), 2026-07-02 (Guided stepper), 2026-07-02 (Scaffold), 2026-07-03 (CSS2D label layer — topic complete), 2026-07-03 (Dock removal + full-height step rail — Module 2 convergence), 2026-07-03 (Param-control relocation + step-name trim — UI regression fix), 2026-07-03 (Step-rail button layout — narrow-rail fix) (+15 more)

### Community 27 - "frustums"
Cohesion: 0.20
Nodes (10): $(), QNAME, sync(), defaultPointData(), QuadrantType, FIELD_LABELS, PROBLEMS, TIERS (+2 more)

### Community 28 - "lineDrawer"
Cohesion: 0.21
Nodes (17): rebuildFromEdit(), wireControls(), announce(), armReset(), closeTerm(), disarmReset(), editRebuild(), flowNote() (+9 more)

### Community 29 - "main"
Cohesion: 0.31
Nodes (15): answerSheetBox(), clearProjectionMorph(), engageOrtho(), fitOrthoZoom(), flattenedViewBox(), restorePerspective(), setFlatView(), setupQuickViews() (+7 more)

### Community 30 - "main"
Cohesion: 0.12
Nodes (15): init(), markBooted(), setupConnectorToggle(), setupMobileNotice(), initOnboarding(), SPOTLIGHTS, TONE_CLASSES, initProblemLibrary() (+7 more)

### Community 31 - "main"
Cohesion: 0.12
Nodes (24): announce(), applyCompareSize(), completeAndNext(), ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), handleResize(), init() (+16 more)

### Community 32 - "main"
Cohesion: 0.09
Nodes (21): 2026-07-06, 2026-07-06 (Phase 2 — pipeline rewire), 2026-07-07 (Phase 3 fixes — ADR compliance), 2026-07-07 (Phase 3 — UI shell, guided sequence, labels), 2026-07-07 (Phase 4 — Problem Library + textbook problem sets), 2026-07-07 (Phase 5 — final polish: line conventions, quick-views, leak cert), 2026-07-08 (Dual-camera ortho quick-views — enforce RULES.md §5.18), 2026-07-08 (Phase 6 — UI/UX polish: quadrant grid, negative PP, Compare mirrors lateral) (+13 more)

### Community 33 - "problems"
Cohesion: 0.19
Nodes (15): createSolidMesh(), buildConeGeometry(), createCone(), cssColor(), rootStyle, createCube(), cssColor(), rootStyle (+7 more)

### Community 34 - "problems"
Cohesion: 0.12
Nodes (19): animateFold(), applyDimensionVisibility(), applyFoldVisual(), applyProfilePlaneVisibility(), disposeActiveProjection(), refreshProjections(), setDimensionsVisible(), setObjectOpacity() (+11 more)

### Community 35 - "DECISIONS"
Cohesion: 0.12
Nodes (15): How to add a rule, How to read a rule, Preamble, Section 1 — Master Codebase & Deployment Rules, Section 2 — Platform & Runtime Rules, Section 3 — 3D Scene & Architecture Rules, Section 4 — UI & Visual Rules (Cross-Module Standards), Section 5 — Camera & Animation Rules (+7 more)

### Community 36 - "anim"
Cohesion: 0.21
Nodes (13): applyObserverView(), assembleScene(), bufferResolution(), buildObserver(), clearSightLines(), disposeObj(), drawSightLines(), gatherFadeMaterials() (+5 more)

### Community 37 - "anim"
Cohesion: 0.11
Nodes (17): Card geometry & facade, Chrome-injection contract, Cinematic fold camera, Compare View contract, Compare workbench (Lines — `cfg.workbenchControls`), CSS keyframes, DESIGN.md — Module 1 Premium Interaction Layer, Dual-camera orchestrator (Points / Lines — `cfg.orthoViews`) (+9 more)

### Community 38 - "main"
Cohesion: 0.15
Nodes (12): injectCardChrome(), injectChrome(), injectLibraryChrome(), attachOrtho(), boot(), build(), buildRail(), readTokens() (+4 more)

### Community 39 - "main"
Cohesion: 0.14
Nodes (26): $(), animateFold(), announceState(), buildCtx(), cueOrthoLock(), declutterChipLabels(), fill(), foldBack() (+18 more)

### Community 40 - "anim"
Cohesion: 0.20
Nodes (14): ADR-0043, ADR-0046, castProjectors(), circleInto(), createGlassBox(), cssColor(), DASH, gridPositions() (+6 more)

### Community 41 - "labelLayer"
Cohesion: 0.23
Nodes (14): buildScene(), clearProjectionMorph(), clearQuickView(), cssColor(), cueOrthoLock(), driveFold(), engageOrtho(), flyCamera() (+6 more)

### Community 42 - "vertexLabeler"
Cohesion: 0.16
Nodes (16): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+8 more)

### Community 43 - "anim"
Cohesion: 0.08
Nodes (25): announce(), completeAndNext(), init(), markBooted(), reset(), resetCamera(), resetCompareView(), setConnectorsVisible() (+17 more)

### Community 44 - "vertexLabeler"
Cohesion: 0.27
Nodes (17): $(), applyTLState(), enterTL(), enterTrace(), exitCon(), pauseTL(), playTL(), runConAnim() (+9 more)

### Community 45 - "anim"
Cohesion: 0.17
Nodes (15): calmGrid(), createHvPlanes(), cssColor(), DASH, fatSegments(), FILL, GRID, ADR-0004 (+7 more)

### Community 46 - "anim"
Cohesion: 0.17
Nodes (14): createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0006, ADR-0007 (+6 more)

### Community 47 - "vertexLabeler"
Cohesion: 0.17
Nodes (14): createPointRig(), cssColor(), DASH, fatSegment(), footDot(), ADR-0004, ADR-0006, ADR-0007 (+6 more)

### Community 48 - "bearingBlock"
Cohesion: 0.18
Nodes (18): announce(), clearStepViewButtons(), defaultShapeData(), enterCompareSplit(), exitCompareSplit(), handleResize(), init(), markBooted() (+10 more)

### Community 49 - "meshAnalyzer"
Cohesion: 0.27
Nodes (12): buildPrismGeometry(), rootStyle, buildPyramidGeometry(), createGenericPyramid(), cssColor(), rootStyle, alignmentOffset(), apothem() (+4 more)

### Community 50 - "labelLayer"
Cohesion: 0.13
Nodes (14): Anti-Patterns Verdict, Critique — Orthographic Projection Guided Stepper (`index.html`), Design Health Score, Minor Observations, Overall Impression, [P1] Editing geometry while flattened unfolds the drawing with no visible explanation, [P1] Reset is a one-click, unconfirmed total wipe, [P2] `aria-live="polite"` on the entire `#step-card` over-announces for screen readers (+6 more)

### Community 51 - "spatialSteps"
Cohesion: 0.21
Nodes (13): applyDimensionVisibility(), applyProfilePlaneVisibility(), disposeActiveProjection(), drawCompare(), handleResize(), refreshProjections(), remeasureAfterReflow(), setDimensionsVisible() (+5 more)

### Community 52 - "anatomy"
Cohesion: 0.13
Nodes (14): Anti-Patterns Verdict, Critique — Orthographic Projection Guided Stepper (`index.html`), Design Health Score, Minor Observations, Overall Impression, [P1] Editing geometry while flattened unfolds the drawing with no visible explanation, [P1] Reset is a one-click, unconfirmed total wipe, [P2] `aria-live="polite"` on the entire `#step-card` over-announces for screen readers (+6 more)

### Community 53 - "main"
Cohesion: 0.21
Nodes (14): announce(), applyLayers(), disposeContent(), init(), markBooted(), rebuild(), reset(), restoreView() (+6 more)

### Community 54 - "meshAnalyzer"
Cohesion: 0.14
Nodes (12): active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold, easeStandard, tick() (+4 more)

### Community 55 - "meshAnalyzer"
Cohesion: 0.19
Nodes (13): BODIES, createFrustums(), cssColor(), DASH, fatSegments(), ADR-0004, ADR-0006, ADR-0007 (+5 more)

### Community 56 - "DECISIONS"
Cohesion: 0.18
Nodes (11): handleResize(), init(), markBooted(), setupMobileNotice(), DEFAULT_VIEW, STEPS, TERMS, initStepper() (+3 more)

### Community 57 - "setView"
Cohesion: 0.26
Nodes (17): tween(), animateFoldSwoop(), clearProjectionMorph(), engageOrtho(), exitQuickView(), fitOrthoZoom(), fitOrthoZoomForView(), flatBoxFor() (+9 more)

### Community 58 - "problemLibrary.js"
Cohesion: 0.18
Nodes (7): initOnboarding(), SPOTLIGHTS, TONE_CLASSES, initProblemLibrary(), ADR-0007, ADR-0015, ADR-0033

### Community 59 - "main"
Cohesion: 0.24
Nodes (17): answerSheetBox(), clearProjectionMorph(), contentBox(), engageOrtho(), fitOrthoZoom(), fitPerspectiveDistance(), flattenedViewBox(), frameToSolid() (+9 more)

### Community 60 - "lineData"
Cohesion: 0.09
Nodes (21): 1. What Simatrix Is, 2. Codebase Map, 3. Module 2 — Component Breakdown (the master), 4. Module 1 — Component Breakdown (foundations of projection), 5. Data Flow — How a User Interaction Reaches the Scene, 6. The iframe Boundary, 7. What Is Shared Across All Codebases, 8. What Is Intentionally Different Between Modules (+13 more)

### Community 61 - "ARCHITECTURE"
Cohesion: 0.15
Nodes (12): CLAUDE.md — Simatrix · Module 1 Topic 1: Engineering Graphics Foundations (BUILT), Decision 1 — Canonical "Front Face", Decision 2 — Fully orbitable in 3D, every step (no 2D camera lock), Decision 3 — RETAIN `meshAnalyzer.js` + the dynamic projection/line-drawing machinery, Decision 4 — BIS line-type mapping for the Front Face, Non-negotiables inherited from Module 2 (apply unchanged), Open questions (geometry to verify before build) — see chat, Refactor intent (what this overturns) (+4 more)

### Community 62 - "DESIGN"
Cohesion: 0.22
Nodes (13): tween(), clearProjectionMorph(), engageOrtho(), ensurePerspectiveActive(), frameToBlock(), frontViewOrtho(), frontViewPose(), orbitToAzimuth() (+5 more)

### Community 63 - "spatialData"
Cohesion: 0.22
Nodes (12): ARROW, buildSegments(), CHAIN, createAnnotations(), cssColor(), ADR-0007, ADR-0018, pushArrowTriangle() (+4 more)

### Community 64 - "uiManager"
Cohesion: 0.21
Nodes (11): bucketCovers(), createLineDrawer(), cssColor(), DASH, EdgeClass, findCoplanarPair(), ADR-0007, LINE_WIDTH_PX (+3 more)

### Community 65 - "main"
Cohesion: 0.15
Nodes (12): Anti-Patterns Verdict, Critique — `index.html` (Lesson 1: The Two Reference Planes), Design Health Score, Headline finding, Minor Observations, [P2] Boot overlay diverges from the token system, [P2] `#c3d` canvas has no accessible name, [P3] `<h1>` empty until JS runs (+4 more)

### Community 66 - "announce"
Cohesion: 0.20
Nodes (9): animateFold(), applyFoldVisual(), active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold (+1 more)

### Community 67 - "pointSteps"
Cohesion: 0.17
Nodes (11): 2026-06-27, 2026-06-28, 2026-06-29, 2026-07-02, 2026-07-03, 2026-07-09, 2026-07-10, 2026-07-11 (+3 more)

### Community 68 - "main"
Cohesion: 0.17
Nodes (11): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Projection of Points, Cross-cutting rules, Keeping Root Documents Current, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical) (+3 more)

### Community 69 - "problems"
Cohesion: 0.27
Nodes (8): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, defaultShapeData(), ShapeType

### Community 70 - "DECISIONS"
Cohesion: 0.17
Nodes (11): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Engineering Graphics Viewer, Cross-cutting rules, Keeping Root Documents Current, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical) (+3 more)

### Community 71 - "ARCHITECTURE"
Cohesion: 0.15
Nodes (12): 1. What Simatrix is, 2. Who it is for, 3. What it is not (anti-references), 4. Core design principles, 5. Features — Module 1 (audit-verified), 6. Features — Module 2 (audit-verified), 7. Accessibility commitments (with implementation status), 8. Planned but not yet implemented (+4 more)

### Community 72 - "DECISIONS"
Cohesion: 0.24
Nodes (11): tween(), clearProjectionMorph(), driveFold(), engageOrtho(), fadeExtension(), fadeInLeaf(), fitOrthoZoom(), flyCamera() (+3 more)

### Community 73 - "main"
Cohesion: 0.18
Nodes (9): CHIP_OFFSET, createLabelLayer(), ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS (+1 more)

### Community 74 - "pointProblems"
Cohesion: 0.22
Nodes (8): DEFAULT_VIEW, ADR-0012, STEPS, TERMS, ADR-0007, ADR-0037, initTerms(), ADR-0007

### Community 75 - "DECISIONS"
Cohesion: 0.15
Nodes (11): animate(), resume(), startLoop(), active, cancelAll(), easeCamera, easeDissolve, easeDraw (+3 more)

### Community 76 - "main"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 77 - "onboarding"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 78 - "problemLibrary"
Cohesion: 0.18
Nodes (10): 2026-06-16, 2026-06-19, 2026-06-20, 2026-06-25, 2026-06-26, 2026-06-27, 2026-06-28, 2026-07-09 (+2 more)

### Community 79 - "CLAUDE"
Cohesion: 0.27
Nodes (8): ENABLED_TIERS, enabledProblems(), FIELD_LABELS, groupByTier(), PROBLEMS, TIERS, defaultShapeData(), ShapeType

### Community 80 - "onboarding"
Cohesion: 0.27
Nodes (8): CHAIN, GENERATOR_DASH, letterFor(), numberFor(), orderRing(), planAnnotations(), sampleRing(), uniqueLocalVertices()

### Community 81 - "onboarding"
Cohesion: 0.29
Nodes (9): BEARING_BLOCK_DIMS, buildBearingBlockGeometry(), buildBodyProfile(), buildFootProfile(), createBearingBlock(), cssColor(), ADR-0001, ADR-0007 (+1 more)

### Community 82 - "PRODUCT"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 83 - "uiManager"
Cohesion: 0.20
Nodes (9): Architecture — Module 2 orchestrator pattern (ADR-033, overturns ADR-011 for this topic), CLAUDE.md — Simatrix · Module 1 Topic 2: Spatial Framework (BUILT), File structure, Non-negotiables inherited from the platform (apply unchanged), Platform contract (already wired — do not add a second path), Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol (+1 more)

### Community 84 - "CLAUDE"
Cohesion: 0.20
Nodes (8): CHIP_OFFSET, ADR-0004, ADR-0007, ADR-0016, ADR-0033, PLANE_ANCHOR, QUAD_ANCHORS, NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/bo

### Community 85 - "main"
Cohesion: 0.06
Nodes (32): 3.10 Register the topic in `ARCHITECTURE.md`, 3.1 Name the folder, 3.2 Copy the master, whole, 3.3 File-by-file: keep exactly as copied (the shared contracts), 3.4 File-by-file: adapt (the topic-specific content), 3.5 File-by-file: create fresh (only if your topic needs them), 3.6 Update `meta.json` (every field), 3.7 Update the new folder's `CLAUDE.md` (the pointer to root docs) (+24 more)

### Community 86 - "main"
Cohesion: 0.29
Nodes (6): CONCEPTS, factsFor(), LAYER_TOGGLES, ROSTER, SHAPE_FACTS, ShapeType

### Community 87 - "pointData"
Cohesion: 0.14
Nodes (12): animate(), applyProjectionMorph(), resume(), startLoop(), active, cancelAll(), easeCamera, easeDissolve (+4 more)

### Community 88 - "computeEffectiveAngles"
Cohesion: 0.20
Nodes (9): Anti-Patterns Verdict, Critique — Projection of Points simulation (`index.html` + `main.js`), Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider (+1 more)

### Community 89 - "lineProblems"
Cohesion: 0.20
Nodes (9): Anti-Patterns Verdict, Critique — `lines.html` (Projection of Straight Lines), Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider (+1 more)

### Community 90 - "onboarding"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 92 - "labelLayer"
Cohesion: 0.22
Nodes (7): active, cancelAll(), easeCamera, easeDissolve, easeDraw, easeFold, easeStandard

### Community 93 - "terms"
Cohesion: 0.28
Nodes (8): clamp(), initUIManager(), ADR-0007, ADR-0015, ADR-0018, parseNumeric(), QUAD_NOTES, SLIDERS

### Community 94 - "quadrantSteps"
Cohesion: 0.22
Nodes (8): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix · Module 2 Topic 1: Introduction to Solids, Cross-cutting rules, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), Rotation priority hierarchy (pedagogically critical), Visual style

### Community 95 - "CLAUDE.module-template"
Cohesion: 0.22
Nodes (8): 3D engineering gotchas (read before writing rotation/projection math), Architecture (non-negotiable), CLAUDE.md — Simatrix Engineering Graphics Viewer, Cross-cutting rules, Platform contract (required for Simatrix uploads), Pose model — SIMPLE POSITIONS (this clone), Project-wide documentation (read before cross-module tasks), Visual style

### Community 96 - "DECISIONS"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 97 - "DECISIONS"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 98 - "CHANGELOG"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 99 - "CHANGELOG"
Cohesion: 0.22
Nodes (8): Accessibility & Inclusion, Anti-references, Brand Personality, Design Principles, Product, Product Purpose, Register, Users

### Community 100 - "terms"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 101 - "CHANGELOG"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 102 - "problemLibrary"
Cohesion: 0.22
Nodes (8): Anti-Patterns Verdict, Design Health Score, Minor Observations, Overall Impression, Persona Red Flags, Priority Issues, Questions to Consider, What's Working

### Community 103 - "buildScene"
Cohesion: 0.29
Nodes (8): buildScene(), cssColor(), cssVar(), drawCompare(), paintCompare(), pause(), showContextLostNotice(), stopLoop()

### Community 104 - "2026-06-01T14-57-13Z__index-html"
Cohesion: 0.25
Nodes (7): Before you write any code, CLAUDE.md — Simatrix · [Subject Name] · [Module/Topic Name], Keeping your own documents current, Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol, Subject-specific architecture rules

### Community 105 - "terms"
Cohesion: 0.32
Nodes (7): clamp(), initUIManager(), ADR-0007, ADR-0018, parseNumeric(), QUAD_NOTES, SLIDERS

### Community 106 - "PRODUCT"
Cohesion: 0.25
Nodes (7): Before you write any code, CLAUDE.md — Simatrix Starter Template, Keeping your own documents current, Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol, Subject-specific architecture rules

### Community 107 - "CLAUDE"
Cohesion: 0.03
Nodes (58): ADR-000: [Template — copy this for a new entry], ADR-001: No build step; ship pinned CDN ES modules, ADR-002: Host integration via a `window.simAPI` global, not `postMessage`, ADR-003: CSS design tokens are the single runtime source of truth for all visual values, ADR-004: Every geometry change funnels through one `rebuild()` pipeline, ADR-005: Re-derive every ported sign visually (Unity left-handed → Three.js right-handed), explicit ZXY Euler, ADR-006: Fat lines + hard-edge geometry + quantized edge welding for crisp technical linework, ADR-007: Orchestrator + leaf modules — leaves don't cross-import; only `genericSolid` (pure math) is shared (+50 more)

### Community 108 - "DECISIONS"
Cohesion: 0.20
Nodes (14): applyFoldPose(), applyPlaneOpacity(), applyStepGating(), driveFold(), fitDistance(), flowNote(), frameRadiusForStep(), frameToStep() (+6 more)

### Community 109 - "DECISIONS"
Cohesion: 0.29
Nodes (4): ENABLED_TIERS, FIELD_LABELS, PROBLEMS, TIERS

### Community 110 - "layout"
Cohesion: 0.22
Nodes (13): beginOverlay(), enterWorkbench(), exitWorkbench(), isSplit(), layout(), placeLr(), s2Px(), s3Px() (+5 more)

### Community 111 - "Simatrix"
Cohesion: 0.29
Nodes (6): 1. What Simatrix is, 2. Who it is for, 3. What it is not (anti-references), Brand personality, Simatrix, What this design contract covers — and what it doesn't

### Community 112 - "CHANGELOG"
Cohesion: 0.25
Nodes (7): How to read a rule, Section 1 — Platform & Runtime Contract, Section 2 — UI & Visual Rules, Section 3 — Cross-Subject Harmony, Section 4 — Documentation Rules, Section 5 — Anti-Patterns (Quick Scan), Simatrix — Platform Rules (Subject-Agnostic Foundation)

### Community 113 - "CHANGELOG"
Cohesion: 0.33
Nodes (7): DESIGN.md (platform design system), Platform Visual Rules (Quiet Chrome, Chrome-Only Blue, Two-Cue, Two-Weight, Tabular, Flat-Ink, Border-Over-Shadow), Connector-Line Toggle (dormant), Design Tokens (Modern Drafting Bench), Domain Viewport Colors (HP teal / VP amber / PP violet), Quick-View Camera Buttons (dormant), Byte-Identical Shared Contract Files

### Community 114 - "CHANGELOG"
Cohesion: 0.29
Nodes (4): ENABLED_TIERS, FIELD_LABELS, PROBLEMS, TIERS

### Community 115 - "CHANGELOG"
Cohesion: 0.40
Nodes (4): ADR-0007, STEPS, TERMS, ADR-0007

### Community 116 - "CHANGELOG"
Cohesion: 0.33
Nodes (4): ADR-0018, ADR-0033, QUADRANT_INFO, QuadrantType

### Community 117 - "announce"
Cohesion: 0.60
Nodes (4): clamp(), initUIManager(), parseNumeric(), SLIDERS

### Community 118 - "frameDefault"
Cohesion: 0.67
Nodes (4): contentBoxWorld(), fitPerspectiveDistance(), frameDefault(), reframeIfClipped()

### Community 119 - "CHANGELOG"
Cohesion: 0.40
Nodes (4): 1. Subject, 2. BIS line-type → token map (the only encoding this topic adds), 3. Fat-line stack (inherited, non-negotiable), DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)

### Community 120 - "5. Components"
Cohesion: 0.13
Nodes (22): announce(), applyCompareSize(), completeAndNext(), drawCompare(), ensureWorkbenchRail(), enterWorkbench(), exitWorkbench(), handleResize() (+14 more)

### Community 122 - "CHANGELOG"
Cohesion: 0.40
Nodes (3): initOnboarding(), SPOTLIGHTS, TONE_CLASSES

### Community 123 - "CHANGELOG"
Cohesion: 0.29
Nodes (6): 2026-06-16, 2026-07-02, 2026-07-09, 2026-07-15, 2026-07-16, Changelog

### Community 126 - "CLAUDE"
Cohesion: 0.50
Nodes (3): 2026-07-02, 2026-07-09, Changelog

### Community 127 - "DESIGN"
Cohesion: 0.40
Nodes (4): 2026-07-02, 2026-07-09, 2026-07-16, Changelog

### Community 128 - "anim.js"
Cohesion: 0.22
Nodes (11): commit(), contentBoxWorld(), disposeContent(), drawCompare(), flatSheetBox(), notifyStateChange(), rebuild(), viewportSize() (+3 more)

### Community 130 - "DESIGN"
Cohesion: 0.13
Nodes (14): 2026-07-11, 2026-07-12, 2026-07-12 (completion — cinematic unfold + 2D Compare), 2026-07-13 (ADR-050 final flag — 2D Compare sheet synced to the mathematical views), 2026-07-13 (cleanup pass — rename, camera default, dead-UI purge, Reset fix), 2026-07-13 (domain geometry & fold fixes — true silhouettes, PP-onto-HP fold, exploded labelled planes, CSS2D Observer), 2026-07-13 (domain overhaul — Bearing Block, grid planes, 5-step sequence), 2026-07-13 (final QA polish — framing, projector purge & exact 2D silhouettes, ADR-050) (+6 more)

### Community 131 - "DESIGN"
Cohesion: 0.67
Nodes (3): Projection of Straight Lines, Horizontal & Vertical Traces (HT / VT), True Length & Angles — Rotating-Line Method (θ/φ)

### Community 132 - "PLATFORM-RULES"
Cohesion: 0.50
Nodes (3): 2026-07-11, 2026-07-16, Changelog — Simatrix Starter Template

### Community 133 - "PRODUCT"
Cohesion: 0.67
Nodes (3): Active-Problem Header & Self-Check, Textbook Problem Library, ENABLED_TIERS Scope Flag

### Community 134 - "CLAUDE"
Cohesion: 0.67
Nodes (3): Compare View Scaffolding (card + 50/50 workbench), Guided Stepper (step rail + step card), Inline Term Definitions (glossary popover)

### Community 276 - "quadrants.js"
Cohesion: 0.24
Nodes (11): $(), syncUI(), HPVT(), QNAME, sync(), VPVT(), wireControls(), setNote() (+3 more)

### Community 277 - "window.simAPI platform contract"
Cohesion: 0.25
Nodes (10): buildBearingBlockSolid(), BEARING_BLOCK_DIMS, buildBearingBlockGeometry(), buildBodyProfile(), buildFootProfile(), createBearingBlock(), cssColor(), ADR-0001 (+2 more)

### Community 278 - "Simple positions pose model"
Cohesion: 0.25
Nodes (7): Architecture (non-negotiable), CLAUDE.md — Simatrix: Understanding Orthographic Views, Platform contract (required for Simatrix uploads), Project-wide documentation (read before cross-module tasks), SESSION DIGEST — [date] — [feature/task], Session Digest Protocol, This topic's architecture

### Community 346 - "meshAnalyzer.js"
Cohesion: 0.27
Nodes (7): addEdge(), buildEdgeMap(), compareLattice(), Edge, Face, IDENTITY_ELEMENTS, vertexToken()

### Community 347 - "intro.js"
Cohesion: 0.36
Nodes (4): initSim(), defaultPlaneData(), STEPS, TERMS

### Community 348 - "rebuild"
Cohesion: 0.20
Nodes (10): applyMode(), computeEffectiveAngles(), notifyStateChange(), orientationAngle(), positionRefLabels(), rebuild(), reframeIfClipped(), refreshLabels() (+2 more)

### Community 349 - "buildScene"
Cohesion: 0.22
Nodes (10): buildScene(), createEdgeOverlay(), cssColor(), cssVar(), cueOrthoLock(), makePlaneLabel(), makeViewLabel(), pause() (+2 more)

### Community 350 - "initUIManager"
Cohesion: 0.60
Nodes (4): clamp(), initUIManager(), parseNumeric(), SLIDERS

## Knowledge Gaps
- **1166 isolated node(s):** `FEEDBACK`, `SYM`, `NOHALO`, `reduceMotion`, `DEF` (+1161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **208 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `armReset()` connect `lineDrawer` to `initUIManager`, `main`, `ADR Index & Compare View`, `announce`, `terms`, `main`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `main` to `First-Angle Projection Scene`, `lineDrawer`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `initUIManager()` connect `terms` to `lineDrawer`, `Scene Boot & Camera`, `main`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **What connects `FEEDBACK`, `SYM`, `NOHALO` to the rest of the system?**
  _1233 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `First-Angle Projection Scene` be split into smaller, more focused modules?**
  _Cohesion score 0.05017921146953405 - nodes in this community are weakly interconnected._
- **Should `Fold Animation Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `Annotations & Arrow Meshes` be split into smaller, more focused modules?**
  _Cohesion score 0.06588235294117648 - nodes in this community are weakly interconnected._