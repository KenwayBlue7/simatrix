// Orchestrator. Ported from src_csharp/Visualizer.cs — the "control center"
// of the engineering-graphics sim. Responsibilities translated here:
//
//   • Bootstraps the Three.js environment (scene, flat lighting, camera, renderer)
//     inside the sandboxed iframe.                          [new — replaces Unity scene]
//   • Owns the SINGLE rebuild(shapeData) pipeline: dispose → configure → build →
//     transform, the only path geometry ever changes through.  [Visualizer.UpdateVisualization]
//   • Enforces the rotation-priority hierarchy (Face Inclination > Orient-to-Corner >
//     Manual Y) when computing effective angles.            [Visualizer.CreateAndConfigureShape]
//   • Exposes window.simAPI { pause, resume, reset } for the platform.  [Visualizer lifecycle]
//
// Layering rule (CLAUDE.md): main.js is the orchestrator. It imports the data,
// transform, and pure-math layers; those layers never import each other (except
// genericSolid, which is pure math). Projection drawing and mesh analysis are a
// later layer and plug into the clearly-marked seams below.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { defaultShapeData, ShapeType } from './src/shapeData.js';
import { slantAngle } from './src/genericSolid.js';
import { createGenericPyramid } from './src/genericPyramid.js';
import { createGenericPrism } from './src/genericPrism.js';
import { createCylinder } from './src/cylinder.js';
import { createCone } from './src/cone.js';
import { createCube } from './src/cube.js';
import { initUIManager } from './src/uiManager.js';
import { initStepper } from './src/stepper.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { initVertexLabeler, planAnnotations, chainPositions } from './src/vertexLabeler.js';
import { buildEdgeMap } from './src/meshAnalyzer.js';
import { drawProjections } from './src/projectionDrawer.js';
import { applyShapeTransform } from './src/iShape.js';
import { initMethodController } from './src/methodController.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeFold, easeCamera, easeDraw, easeDissolve, easeStandard } from './src/anim.js';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded.
// (DESIGN.md is the single source of truth; CLAUDE.md "Cross-cutting rules".)
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);

/** Raw CSS custom-property value, trimmed. */
function cssVar(name) {
  return rootStyle.getPropertyValue(name).trim();
}

/** A design token resolved to a THREE.Color (tokens are sRGB hex, which THREE parses). */
function cssColor(name) {
  return new THREE.Color(cssVar(name));
}

// ============================================================================
// Default camera framing. Restored by simAPI.reset() (CLAUDE.md platform contract).
// Positioned to read the default 2-unit solid plus the ground plane clearly.
// ============================================================================

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(6, 5, 7.5);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0.8, 1.4, 0);

/** Default 3/4 viewing direction (target→camera, normalised) — the look angle of
 *  DEFAULT_CAMERA_POSITION about DEFAULT_CAMERA_TARGET. The DISTANCE is no longer fixed:
 *  frameToSolid() fits it to the solid (~FRAME_PADDING margin) when a solid first appears. */
const DEFAULT_VIEW_DIR = new THREE.Vector3(6 - 0.8, 5 - 1.4, 7.5).normalize();

/** Baseline vertical half-extent of the ortho frustum at zoom = 1 (world units). The actual
 *  on-screen scale is set per quick-view by fitting the content box via camera.zoom, so this
 *  is just the reference frustum; resize keeps L/R/T/B aspect-correct and preserves zoom. */
const ORTHO_FRUSTUM = 5;

/** Fixed standoff for the ortho camera along its view direction. Parallel projection makes
 *  scale independent of distance, so this only needs to clear near/keep the box inside far. */
const ORTHO_STANDOFF = 40;

/** Padding factor when fitting a box into the ortho frustum — leaves a 10% margin so views
 *  (quick-views + the flattened answer sheet) never touch the viewport edge. */
const FIT_PADDING = 1.1;

/** Padding for the perspective auto-zoom (Feature 2) — 10% margin so a re-framed tall solid
 *  never touches the viewport edge. */
const FRAME_PADDING = 1.1;

/** Auto-zoom dolly duration. Snappier than the quick-view move (CAMERA_MOVE_MS) so it keeps
 *  up with a height-slider drag — each rebuild restarts the dolly toward the new distance. */
const AUTO_ZOOM_MS = 500;

/** Baseline camera-move duration — the 2D answer-sheet pan (setFlatView) and the default for
 *  tweenCamera/restorePerspective. Long enough that the projection blend reads as a smooth gain
 *  of depth rather than a quick move (reduced-motion jumps instantly). */
const CAMERA_MOVE_MS = 900;

/** Cinematic duration + curve for the 3D quick-views (Top/Front/Side) — both entering a view
 *  and exiting back to free-orbit. Deliberately slow with a heavy ease-in-out (easeFold) so the
 *  rotate + projection morph reads as a smooth, weighted camera move rather than a snap. */
const QUICK_VIEW_MS = 1500;

/** Head-on direction + screen-up for each quick-view, matching the projection observers:
 *  Top looks down −Y onto the HP (up = −Z so +X reads right, +Z down, like a plan);
 *  Front looks along −X onto the VP (the +X observer of visibleInVP);
 *  Side looks along −Z onto the PP (the +Z observer of visibleInPP). */
const QUICK_VIEWS = {
  top:   { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  front: { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  side:  { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
};

/** Screen-up for the flattened answer-sheet framing. Still a top-down look (dir =
 *  QUICK_VIEWS.top.dir, −Y), but rolled 90° clockwise from the plan's up = −Z: with
 *  up = −X the world Z axis (the HP∩VP ground line) runs HORIZONTAL across the screen,
 *  laying the Front View (−X region) ABOVE the Top View (+X region) — the standard
 *  first-angle layout. The roll swaps the screen axes (world Z → screen X, world X →
 *  screen Y), so fits against this framing pass (size.z, size.x), not (size.x, size.z). */
const FLAT_VIEW_UP = new THREE.Vector3(-1, 0, 0);

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;

/** Hybrid camera (CLAUDE.md plan): the PerspectiveCamera above is the default free-orbit
 *  3D view; this OrthographicCamera is used ONLY for the three quick-views (Top/Front/Side)
 *  and the Step-5 answer-sheet swoop, where parallel projection is the engineering-correct
 *  way to read a plane square-on (no perspective foreshortening). Each camera keeps its own
 *  OrbitControls; only the active one is enabled so they don't both consume pointer events. */
let orthoCamera;
let controlsOrtho;

/** The camera/controls currently driving the render loop — either the perspective pair or
 *  the ortho pair. Swapped by setView()/the answer-sheet swoop; restored to perspective on
 *  reset. */
let activeCamera;
let activeControls;

/** Which quick-view is latched ('top' | 'front' | 'side'), or null when free-orbiting in
 *  perspective. Clicking the latched view toggles back to perspective so the learner is
 *  never trapped in an ortho view. */
let activeView = null;

/** In-flight camera move (quick-view snap or answer-sheet swoop), so a new request cancels
 *  the previous one cleanly. Separate from foldTween — the swoop runs alongside the fold. */
let cameraTween = null;

/** In-flight perspective auto-zoom (Feature 2 tall-solid reframe). Held so a fresh rebuild
 *  cancels the previous dolly cleanly. Separate from cameraTween (quick-views / ortho). */
let autoZoomTween = null;

/** View-name captions ("Top View" / "Front View" / "Side View") for the flattened
 *  drawing. Static in world space at the folded layout positions; faded in with the
 *  reference-line labels over the last of the fold, and re-placed per rebuild from the
 *  solid's box (positionRefLabels). */
let topViewLabel;
let frontViewLabel;
let sideViewLabel;

/** The first-angle projection symbol overlay (#fa-symbol). Toggled visible on flatten. */
let faSymbolEl;

/** The "PP" plane pill (CSS2DObject). Held at module scope because the r160 CSS2DRenderer
 *  honours only an object's OWN `.visible`, not its ancestors' — so hiding ppHingeGroup
 *  hides the WebGL grid + side view but NOT this label. It must be toggled in lockstep with
 *  the profile plane (see applyProfilePlaneVisibility) or the pill leaks through Steps 1–4. */
let ppPlaneLabel;

/** CSS2DRenderer overlay for vertex labels (Step 4). Rendered each frame on top
 *  of the WebGL canvas; sized in lockstep with the renderer on resize. */
let labelRenderer;

/** Vertex-label controller from initVertexLabeler — { group, generate, clear, dispose }. */
let labeler;

/** The sim viewport element. Held module-wide so rebuild() can read the live
 *  drawing-buffer size for LineMaterial without threading it through callers. */
let viewport;

/**
 * The live ProjectionResult from the last rebuild (group + setResolution + dispose),
 * or null before the first build. Its dispose() MUST run at the top of every
 * rebuild: the shapeGroup disposal loop only reaches its DIRECT children's
 * geometry/material, and a ProjectionResult is a NESTED tree of LineSegments2 whose
 * LineMaterials would otherwise leak across rapid slider drags (CLAUDE.md WebGL
 * disposal contract). It also owns the LineMaterial resolution, updated on resize.
 * @type {import('./src/projectionDrawer.js').ProjectionResult | null}
 */
let activeProjection = null;

/** Parameter-dock handle from uiManager.initUIManager — { sync, dispose }. */
let ui;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

/** Textbook Problem Library handle from initProblemLibrary —
 *  { open, exit, isActive, dispose } (the Step-6 flow uses open/exit/isActive). */
let problemLibrary;

/** First-run onboarding handle from initOnboarding — { setSolidPresent }. */
let onboarding;

/** Show Method handle from initMethodController (ADR-084) — { sync, dispose }. Owns its own
 *  DOM (the Step-6 button + progress/chip UI) and beat-sequencing state; reaches the engine
 *  only through simController.method (mirrors problemLibrary's own leaf pattern). */
let methodController;

/** Holds the active solid (+ its edge overlay, + future projections). The
 *  disposal contract iterates this group's direct children, so everything
 *  per-shape is added here as a sibling — never nested. */
let shapeGroup;

/** Reference grids for the three reference planes, hoisted to module scope so the
 *  flatten step can fold the VP and PP. HP stays fixed; VP lives inside vpFoldGroup;
 *  PP lives inside ppHingeGroup (a sibling fold pivot in world space). */
let hpGrid;
let vpGrid;
let ppGrid;

/**
 * Hinge for the profile plane's flatten fold (Step 6). Parented INSIDE vpFoldGroup
 * (ADR-106 — NOT the scene) and translated onto the VP∩PP line at the PP standoff
 * (local position (0, 0, z0), z0 set per rebuild from the solid's depth). Rotating it
 * about its LOCAL Y by PP_FOLD_TARGET (+90°) folds the profile plane sideways into the
 * VP plane; vpFoldGroup's own fold then carries it down with the front view, landing
 * the side view beside the FRONT view at (−y, 0, z0 − x). Holds the PP grid, the PP
 * label, and — once drawn — the PP projection subgroup.
 */
let ppHingeGroup;

/**
 * Pivot at the world origin for the "flatten to 2D" fold (Step 6). Holds the VP
 * grid and — once projections are drawn — the VP projection subgroup, so rotating
 * this group about Z swings the whole vertical plane (grid + front view) down onto
 * the horizontal plane, hinged on the ground line (the Z axis, where HP meets VP).
 */
let vpFoldGroup;

/** The live solid mesh + its edge overlay from the last rebuild (null when the
 *  scene is empty). Held so label/projection refreshes and the fold fade can act
 *  on the current solid without a full geometry rebuild. */
let currentMesh = null;
let currentEdgeOverlay = null;

/** Characteristic 3D size of the current solid — bounding-sphere diameter of its LOCAL
 *  geometry (world units). Rotation- and translation-invariant by construction (local
 *  geometry never encodes distHP/distVP, only mesh.position/quaternion do), so it is the
 *  fixed basis drawCompare() uses for its px-per-mm scale (ADR-053) — a distance or angle
 *  slider can move a view but must never rescale the sheet. 0 while the scene is empty. */
let solidSpanUnits = 0;

/**
 * The shape parameters currently on screen, or `null` before the learner adds a
 * solid in Step 1 (the Guided Stepper boots to an EMPTY scene — grids only).
 * Mutated only via rebuild().
 * @type {import('./src/shapeData.js').ShapeData | null}
 */
let currentShapeData = null;

/** The Problem Library's currently-loaded problem (its full `problems.js` object, target and
 *  all), or `null` in free-explore. Pushed in by problemLibrary.js's loadProblem/exitProblem via
 *  simController.setActiveProblem — problemLibrary.js's OWN return shape stays the ADR-083
 *  platform-wide contract `{ open, exit, isActive, dispose }` verbatim; this is a separate,
 *  additive channel. Show Method (methodController.js, ADR-084) reads it via
 *  simController.activeProblem() for the per-problem `method` stage data (src/problems.js). */
let activeProblemRef = null;

/** Axis→nearest-face X extent (world units) of the last-seated solid. Floor for distVP
 *  under distVPRef:'axis' so the near face never crosses the VP. Set in seatOnPlanes();
 *  reset to 0 on the empty start. Read by uiManager.refreshVpBound via vpMinUnits(). */
let vpAxisInset = 0;

// --- Stepper-driven view state. The wizard flips these; rebuild() honours them so
//     editing the solid keeps labels/projections/fold consistent. ---
let showLabelsFlag = false;      // Step 4 on
let showProjectionsFlag = false; // Step 5 on — top (HP) + front (VP) views
let showSideViewFlag = false;    // Step 5 on — profile plane (PP) revealed + side view drawn (toggle, doesn't gate)
let showDimensionsFlag = false;  // Step 6 (optional) on — BIS Type-B dimension layer revealed (ADR-041)
/** De-clutter toggle (default on): hides BOTH connector sets — the upright 3D→2D
 *  connectors and the flattened projectors — when the learner wants a cleaner drawing.
 *  Persists across rebuild() because every rebuild ends in applyFoldVisual, which reads
 *  this flag (so dragging a slider never resurrects hidden connectors). */
let showConnectorsFlag = true;
/** 0 = upright 3D, 1 = fully folded flat (Step 6). Animated by flatten/unflatten. */
let foldProgress = 0;
let foldTween = null;
/** Direction of the live fold tween: true while UNFOLDING (flat → 3D), so applyFoldVisual
 *  re-materialises the solid on the appear curve (tied to the plane acceleration) rather
 *  than the reverse of the disappear curve. Set by animateFold. */
let solidAppearing = false;

/** Live handle + bookkeeping for the Step 5 Front→Top→Side sequential reveal (ADR-162), or
 *  null/0 when no reveal is in flight. Held so a mid-reveal dispose/reset can cancel-and-snap
 *  (mirrors methodAnimHandle's role for Show Method's own beat reveal) — and so that
 *  cancel-and-snap can still fire the stepper's onViewDrawn/onDone hooks for whatever the
 *  in-flight tween hadn't yet announced, instead of leaving the wizard's button/badges/Next-gate
 *  stuck waiting on a callback that a cancelled tween will never call. */
let viewRevealHandle = null;
let viewRevealHooks = null;
let viewRevealUnits = null;
let viewRevealAnnounced = 0;

/** VP fold angle at foldProgress = 1: +90° about Z swings the VP's top edge
 *  BACKWARD (away from the +X observer) down into the horizontal plane, landing
 *  the front view on the opposite side of the ground line from the top view —
 *  the standard unfolded layout. Sign re-derived visually (CLAUDE.md). */
const FOLD_TARGET = Math.PI / 2;

/** PP fold angle at foldProgress = 1, applied to ppHingeGroup's LOCAL Y (the hinge group is
 *  now parented INSIDE vpFoldGroup, not the scene — see buildScene). +90° about Y folds the
 *  profile plane sideways into the VP plane about the VP∩PP line (world x = 0 at z = z0),
 *  carrying its local point (x, y, 0) to (0, y, z0 − x) in vpFoldGroup's frame. vpFoldGroup's
 *  OWN +90°-about-Z fold (FOLD_TARGET, same progress p) then carries that on into the world,
 *  landing the side view beside the FRONT view: (0, y, z0−x) → (−y, 0, z0−x) — sheetY = y,
 *  identical to the front view's own sheetY (sheetVP.y = worldY), so Side shares Front's
 *  height band (ADR-106; supersedes the old HP∩PP-hinge fold that shared Top's band).
 *  Sign pairs with visibleInPP's `worldNormal.z > 0` (observer direction is unchanged by
 *  the fold); re-derive visually (square pyramid apex must point consistently with the
 *  front view — flip to −Math.PI/2 if mirrored) (CLAUDE.md). */
const PP_FOLD_TARGET = Math.PI / 2;

/** Gap between the solid's nearest face and the profile plane (the side "wall of the
 *  box"), mirroring the HP/VP standoffs so the side view never slices the solid. The
 *  PP sits at z0 = box.min.z − PP_MARGIN, recomputed per rebuild. */
const PP_MARGIN = 1.0;

/** PP standoff used before any solid exists (empty Guided-Stepper boot) — keeps the
 *  reference grid clear of the origin until the first rebuild sets a depth-based z0. */
const DEFAULT_PP_STANDOFF = -3;

/** Longer than the chrome durations — the fold is the lesson's payoff, not a
 *  micro-interaction. Deliberately slow + a heavy ease-in-out (easeFold) so the hinge
 *  reads as a graceful physical fold rather than a snap. */
const FOLD_DURATION_MS = 1600;
const DRAW_DURATION_MS = 1000; // projection / side-view draw-on (Steps 4–5)

/** Camera swoop to the flattened answer sheet. Decoupled from CAMERA_MOVE_MS (the snappy
 *  quick-view buttons) and matched to FOLD_DURATION_MS so the camera and the hinge move
 *  together, on the same easeFold curve. */
const FLATTEN_MOVE_MS = FOLD_DURATION_MS;

/** Fold progress (0..1) by which the 3D solid has fully DISSOLVED away (see applyFoldVisual +
 *  easeDissolve). < 1 so the body is gone a touch before the planes settle, leaving the final
 *  flat drawing clean rather than ghosted by a translucent solid. */
const SOLID_DISSOLVE_END = 0.85;

/** UNFOLD appear window (fold progress, high → low as the drawing springs back to 3D). The
 *  solid stays hidden while the drawing is still flat (p above _START), then fades in across
 *  [_END, _START]. _START ≈ the easeFold acceleration onset, so the body re-materialises right
 *  as the planes begin to swing up, and is fully present before they stand vertical. */
const SOLID_APPEAR_START = 0.88;
const SOLID_APPEAR_END = 0.25;

/**
 * Rotation-mode flags driving the priority hierarchy. Mirrors the public bools
 * on Visualizer.cs. The parameter dock (next layer) flips these via applyMode().
 */
const modes = {
  faceInclinationHP: false, // Priority 1 (pyramids/cone)
  faceInclinationVP: false, // Priority 1 (pyramids/cone), mutually exclusive with HP
  orientToCorner: false,    // Priority 2 (preset per-shape angle)
};

let rafId = null;
let running = false;

/** Subscribers fired at the end of every rebuild() — the single seam every parameter
 *  and mode change passes through. The Problem Library's self-check rides this. */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Shape classification (port of Visualizer.IsPyramidType + a sides lookup)
// ============================================================================

const PYRAMID_TYPES = new Set([
  ShapeType.Pyramid,
  ShapeType.TriangularPyramid,
  ShapeType.PentagonalPyramid,
  ShapeType.HexagonalPyramid,
  ShapeType.Cone,
]);

/** Pyramids + cone support Face Inclination. (Visualizer.IsPyramidType) */
function isPyramidType(shape) {
  return PYRAMID_TYPES.has(shape);
}

/** Regular-polygon side count for a base. Cone/Cylinder return null (radius-based). */
function sidesOf(shape) {
  switch (shape) {
    case ShapeType.TriangularPyramid:
    case ShapeType.TriangularPrism:
      return 3;
    case ShapeType.Pyramid:
    case ShapeType.Cube:
    case ShapeType.SquarePrism:
      return 4;
    case ShapeType.PentagonalPyramid:
    case ShapeType.PentagonalPrism:
      return 5;
    case ShapeType.HexagonalPyramid:
    case ShapeType.HexagonalPrism:
      return 6;
    default:
      return null; // Cone, Cylinder
  }
}

// ============================================================================
// Rotation priority hierarchy (port of Visualizer.CreateAndConfigureShape)
//
// Strict precedence — higher wins and disables lower (CLAUDE.md):
//   1. Face Inclination HP / VP   (mutually exclusive; pyramids + cone only)
//   2. Orient to Corner / Edge    (preset per-shape angle)
//   3. Manual Y rotation          (slider, only when no preset/face mode)
// angleHP feeds the X-axis, angleVP the Z-axis (negated in applyShapeTransform).
// ============================================================================

/**
 * Natural slant angle α of a pyramid/cone in DEGREES.
 * Magnitude only — ports unchanged from Unity (CLAUDE.md): cone uses radius as
 * its "apothem", regular pyramids use the genericSolid apothem via slantAngle().
 */
function slantAngleDeg(shape, baseLength, height) {
  if (shape === ShapeType.Cone) {
    const radius = baseLength / 2;
    return Math.atan(height / radius) * RAD2DEG;
  }
  return slantAngle(sidesOf(shape), baseLength, height) * RAD2DEG;
}

/**
 * Per-shape preset Y angle for "Orient to Corner / Edge".
 * Pentagonal pyramid magnitude is 54° (= 90° − 360°/10), NOT 18° — CLAUDE.md calls
 * this out as a corrected value. The SIGN is NEGATIVE (−54°): the base geometry sits
 * at alignmentOffset(5, FLAT_EDGE_FRONT) = −π/2 (flat edge at +Z, lone vertex at −Z),
 * and applyShapeTransform maps a positive rotationY to a DECREASE in vertex angle, so
 * +54° drives the lone base corner to +X (away from the VP, toward the camera) while
 * −54° carries it to −X (toward the VP), leaving the opposite edge running along Z
 * (parallel to the VP) at the front. Re-derived visually per CLAUDE.md ("every ported
 * sign is suspect"); +54° was a handedness/camera inversion. (Visualizer preset table.)
 */
function orientationAngle(shape) {
  switch (shape) {
    case ShapeType.TriangularPyramid: return 30;
    case ShapeType.PentagonalPyramid: return -54;
    case ShapeType.HexagonalPyramid:  return 30;
    case ShapeType.Pyramid:           return 45;
    case ShapeType.Cube:
    case ShapeType.SquarePrism:       return 45;
    case ShapeType.TriangularPrism:   return 180;
    case ShapeType.PentagonalPrism:   return 180;
    case ShapeType.HexagonalPrism:    return 30;
    default:                          return 45; // Cone, Cylinder
  }
}

/**
 * Rotational-symmetry period of the base about the axis (degrees): the smallest turn
 * that maps the solid onto itself, so any two `rotationY` values differing by a multiple
 * are the IDENTICAL pose (indistinguishable in orthographic projection). Mirrors the
 * base-side counts in rebuild()'s switch. Surfaced via simController so the Problem
 * Library self-check can accept a hand-dialled turn that lands on the same pose as the
 * orient-to-corner preset. Cone/Cylinder are rotationally continuous (orientation is a
 * "don't-care" for them, so this is never consulted) — 360 leaves them exact.
 * @param {string} shape ShapeType value.
 * @returns {number} Symmetry period in degrees.
 */
function orientationPeriod(shape) {
  switch (shape) {
    case ShapeType.TriangularPyramid:
    case ShapeType.TriangularPrism:   return 120; // 360/3
    case ShapeType.Cube:
    case ShapeType.Pyramid:
    case ShapeType.SquarePrism:       return 90;  // 360/4
    case ShapeType.PentagonalPyramid:
    case ShapeType.PentagonalPrism:   return 72;  // 360/5
    case ShapeType.HexagonalPyramid:
    case ShapeType.HexagonalPrism:    return 60;  // 360/6
    default:                          return 360; // Cone, Cylinder (continuous)
  }
}

/**
 * Resolve the raw slider values + active mode flags into the effective
 * (angleHP, angleVP, rotationY) that actually drive the transform.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIGN NOTE — the face-inclination offsets below are RE-DERIVED for Three.js │
 * │ right-handed Y-up: the handedness-corrected NEGATION of the Unity proto's  │
 * │ −180° (HP) / −90° (VP) constants (CLAUDE.md: "every negative sign in the   │
 * │ Unity code is suspect"). Worked example — square pyramid, baseLength=2,    │
 * │ height=3:  apothem=1, α = arctan(3/1) = 71.57°.                             │
 * │   • Face Inclination HP, target 0 → angleHP = 180 − α = 108.43°: the solid │
 * │     tips forward onto its front slant face, which then lies flat on HP.    │
 * │     target 45 → 180 − α − 45 = 63.43°: that face ends inclined 45° to HP.  │
 * │   • Face Inclination VP, target 0 → angleHP = 180 − α, angleVP = 90 (a     │
 * │     Z-roll of −90° swings the laid face up onto VP, flat against it).      │
 * │ Re-verify VISUALLY once the projection layer lands; do not touch genericSolid.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * @param {import('./src/shapeData.js').ShapeData} data
 * @param {{faceInclinationHP:boolean,faceInclinationVP:boolean,orientToCorner:boolean}} [modeSet=modes]
 *   Which rotation-hierarchy flags to resolve against. Defaults to the live module-level
 *   `modes` so every existing call site (rebuild()) is behaviourally unchanged. A headless
 *   Show Method stage passes its OWN mode set here (e.g. Set 1 = every flag off) instead of
 *   mutating the live `modes` object, which the 3D pane and its dock are still reading.
 * @returns {import('./src/shapeData.js').ShapeData} effective shape data (copy)
 */
function computeEffectiveAngles(data, modeSet = modes) {
  const eff = { ...data };
  const pyramid = isPyramidType(data.shape);

  // === PRIORITY 1: FACE INCLINATION ===
  if (modeSet.faceInclinationHP && pyramid) {
    const alpha = slantAngleDeg(data.shape, data.baseLength, data.height);
    // Lay the front slant face flat ON the HP, then incline it by the target.
    //   X-tilt = (180 − α) − target. target 0 ⇒ 180 − α tips the solid forward
    //   onto its slant face (flat on HP); target 90 ⇒ 90 − α (face vertical).
    eff.angleHP = 180 - alpha - data.angleHP;
    eff.angleVP = data.angleVP;        // standard-axis lean still feeds underneath
    eff.rotationY = data.rotationY;     // dual inclination: free Y-spin along the plane
    return eff;
  }

  if (modeSet.faceInclinationVP && pyramid) {
    const alpha = slantAngleDeg(data.shape, data.baseLength, data.height);
    // Build the VP pose from the HP solution, then swing it up onto the VP about
    // the ground line (the Z axis, where HP meets VP):  Rz(−90) · Rx(180 − α − t).
    //   • angleHP (X) = 180 − α − target → at target 0 the face is flat ON VP.
    //   • angleVP = 90 → applyShapeTransform negates it to a Z-roll of −90°, the
    //     HP→VP swing (the C# −90 VP offset, handedness-corrected onto the Z axis).
    // Verbatim-porting the C# (yRot=90, xRot=α−90+target) leaves the face normal
    // off-axis under Three.js handedness — re-derived here instead.
    eff.angleHP = 180 - alpha - data.angleVP;
    eff.angleVP = 90;
    eff.rotationY = data.rotationY;     // dual inclination: free Y-spin along the plane
    return eff;
  }

  // === PRIORITY 2: ORIENT TO CORNER / EDGE ===
  if (modeSet.orientToCorner) {
    eff.rotationY = orientationAngle(data.shape);
    return eff;
  }

  // === PRIORITY 3: MANUAL (raw slider values pass straight through) ===
  return eff;
}

/**
 * Flip a rotation mode on/off, enforcing the hierarchy's mutual exclusions
 * (port of Visualizer.EnableFaceInclinationHP/VP + the orientation guard), then
 * rebuild. The parameter dock (next layer, also in main.js) is the caller.
 *
 * @param {'faceInclinationHP'|'faceInclinationVP'|'orientToCorner'} mode
 * @param {boolean} enabled
 */
function applyMode(mode, enabled) {
  if (!currentShapeData) return; // no solid yet (empty start) — nothing to mode

  if ((mode === 'faceInclinationHP' || mode === 'faceInclinationVP') &&
      enabled && !isPyramidType(currentShapeData.shape)) {
    return; // Face inclination is pyramid/cone only — ignore (Visualizer returns false).
  }

  if (mode === 'faceInclinationHP' && enabled) {
    modes.faceInclinationHP = true;
    modes.faceInclinationVP = false; // mutually exclusive
    modes.orientToCorner = false;    // disabled while a face mode is active
    announce('Face inclination HP enabled. Manual Y rotation disabled.');
  } else if (mode === 'faceInclinationVP' && enabled) {
    modes.faceInclinationVP = true;
    modes.faceInclinationHP = false;
    modes.orientToCorner = false;
    announce('Face inclination VP enabled. Manual Y rotation disabled.');
  } else {
    modes[mode] = enabled;
  }

  rebuild(currentShapeData);
}

/** Narrate a mode change to assistive tech (PRODUCT.md a11y commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/** ms a reflow note stays up before fading — generous for the anxious primary persona. */
const FLOW_NOTE_HOLD = 4500;
let flowNoteEl = null;
let flowNoteTimer = null;
let flowNoteHideTimer = null;

/**
 * Flash a brief, *visible* note over the viewport for a state change a sighted learner
 * needs explained — currently the edit-triggered unfold that springs the flat 2D drawing
 * back to 3D (stepper.js reflowFrom). Status that lived only in the sr-only live region
 * was invisible to sighted users (critique P1); this closes that gap.
 *
 * Screen readers still get the message through #sim-status via announce(), so this note
 * is aria-hidden and is NOT itself a live region — narrating it twice would over-announce.
 * Auto-dismisses after FLOW_NOTE_HOLD; a fresh call resets the timer and re-shows.
 * @param {string} message
 */
function flowNote(message) {
  flowNoteEl ??= document.getElementById('vp-flow-note');
  if (!flowNoteEl) return;
  const text = flowNoteEl.querySelector('.vp-note__text');
  if (text) text.textContent = message;

  clearTimeout(flowNoteTimer);
  clearTimeout(flowNoteHideTimer);
  flowNoteEl.hidden = false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(() => flowNoteEl.classList.add('is-visible'));

  flowNoteTimer = setTimeout(() => {
    flowNoteEl.classList.remove('is-visible');
    // Re-hide once the fade has finished so it leaves the layout and re-shows cleanly.
    flowNoteHideTimer = setTimeout(() => { flowNoteEl.hidden = true; }, 240);
  }, FLOW_NOTE_HOLD);
}

/** ms the success toast stays up before fading. */
const TOAST_HOLD = 3500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Show a brief, calm success toast over the viewport (the Step-6 "Complete & next
 * problem" win). Token-driven success styling + a check glyph (Two-Cue Rule) — NOT a
 * gamified celebration (DESIGN.md rejects confetti/badges/points).
 *
 * Driven by setTimeout, NOT the rAF tween engine, because the Problem Library overlay
 * pauses the loop immediately after this is called (the toast still needs to fade).
 * aria-hidden: #sim-status already narrates the win, so this is not a second live
 * region (would double-announce). Auto-dismisses; a fresh call resets the timer.
 * @param {string} message
 */
function showToast(message) {
  toastEl ??= document.getElementById('sim-toast');
  if (!toastEl) return;
  const text = toastEl.querySelector('.sim-toast__text');
  if (text) text.textContent = message;

  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastEl.hidden = false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, 240);
  }, TOAST_HOLD);
}

/** Fire every state-change subscriber (see stateChangeSubs). Each callback is guarded
 *  so one throwing subscriber can never break the rebuild pipeline. */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/**
 * Show or hide the transient WebGL context-loss recovery chip, and narrate the
 * state change so a screen-reader user knows the paused view is recovering, not
 * broken (PRODUCT.md: the struggling learner must never think they broke it).
 * @param {boolean} on
 */
function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
}

/**
 * Signal a successful boot to the index.html watchdog: clear its timeout and hide
 * any fallback a slow load may have surfaced. A late-but-successful boot therefore
 * self-heals (the fallback disappears the moment the sim is live). Also posts the
 * platform's sim:ready signal (ADR-078) — genuinely single-fire since init() itself
 * only ever runs once (self-start, no external init() call, CLAUDE.md).
 */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) {
    clearTimeout(window.__simBootTimer);
    window.__simBootTimer = null;
  }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
  window.parent.postMessage({ type: 'sim:ready' }, '*');
}

/**
 * Signal lesson completion to the host (ADR-078 addendum, revised): the learner
 * clicked "Finish lesson" at the flattened Step 6. Fires on every call, no latch —
 * the host confirmed it supports repeated sim:complete triggers, so replaying the
 * signal (e.g. after "Try another problem" then re-flattening) is expected, not a bug.
 */
function markComplete() {
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}

// ============================================================================
// Geometry build
// ============================================================================

/**
 * Build the solid for the given (effective) shape data, fully positioned and
 * rotated per the IShape contract — the caller just adds it to shapeGroup.
 *
 * Pure routing: every ShapeType maps to its dedicated generator. Pyramids and
 * prisms bind their side count to the generic generator (the JS equivalent of the
 * C# `new GenericPyramid(n)` / `new GenericPrism(n)` constructors); cube, cylinder,
 * and cone have single-purpose generators. All eleven ShapeType values are now
 * backed by a real generator, so there is no fallback placeholder — an unknown
 * shape is a programming error, not a renderable box.
 *
 * @param {import('./src/shapeData.js').ShapeData} data effective shape data
 * @returns {THREE.Mesh}
 */
function createSolidMesh(data) {
  switch (data.shape) {
    case ShapeType.Cube:              return createCube(data);
    case ShapeType.Cylinder:          return createCylinder(data);
    case ShapeType.Cone:              return createCone(data);

    case ShapeType.TriangularPrism:   return createGenericPrism(3)(data);
    case ShapeType.SquarePrism:       return createGenericPrism(4)(data);
    case ShapeType.PentagonalPrism:   return createGenericPrism(5)(data);
    case ShapeType.HexagonalPrism:    return createGenericPrism(6)(data);

    case ShapeType.TriangularPyramid: return createGenericPyramid(3)(data);
    case ShapeType.Pyramid:           return createGenericPyramid(4)(data);
    case ShapeType.PentagonalPyramid: return createGenericPyramid(5)(data);
    case ShapeType.HexagonalPyramid:  return createGenericPyramid(6)(data);

    default:
      throw new Error(`createSolidMesh: unsupported shape "${data.shape}"`);
  }
}

/**
 * Visible-edge overlay for the solid: solid dark ink lines (CLAUDE.md visual
 * style). Placeholder uses LineBasicMaterial (1px cap is acceptable for the
 * solid's own silhouette); the projection layer will use LineSegments2 +
 * LineMaterial for real engineering line weights and dashed hidden edges.
 *
 * @param {THREE.BufferGeometry} sourceGeometry
 * @returns {THREE.LineSegments}
 */
function createEdgeOverlay(sourceGeometry) {
  const edges = new THREE.EdgesGeometry(sourceGeometry);
  const material = new THREE.LineBasicMaterial({ color: cssColor('--color-ink') });
  return new THREE.LineSegments(edges, material);
}

/**
 * Seat the solid flush against HP and VP in its CURRENT (rotated) pose.
 *
 * The shape generators — and the placeholder in createSolidMesh — position with
 * fixed UPRIGHT half-extents: `distVP + baseLength/2` on X, `distHP + height/2`
 * on Y. That is only correct while the solid is upright. Once a rotation is
 * applied the geometry's real bounding extents change (Three.js rotates about
 * the geometric centre), so the same offset misplaces the solid in two ways the
 * user observed:
 *
 *   • Face inclination tips a slant face down (HP) or across (VP). The centre is
 *     no longer half-a-height above the resting face, so `height/2` leaves the
 *     solid floating ~0.5u off the plane.
 *   • Orient-to-corner spins a base vertex out from the apothem to the longer
 *     circumradius, so the leftmost point passes `baseLength/2` and crosses VP.
 *
 * Both are the same bug — a hardcoded half-extent standing in for the true
 * extent. Rather than special-case each mode, we measure the actual minimum X
 * and Y of the rotated vertices and place the solid so its lowest point rests
 * exactly on HP (Y = distHP) and its leftmost point exactly on VP (X = distVP).
 * This is exact for BOTH cases the user reported — it is the perpendicular
 * distance from centre to the slant face under face inclination, and the maximum
 * X-radius at the current rotationY under orient-to-corner — and it collapses
 * back to the original half-extent offsets when the solid is upright. Z stays
 * centred on the ground line where HP meets VP.
 *
 * @param {THREE.Mesh} mesh  Already rotated via applyShapeTransform (quaternion in sync).
 * @param {import('./src/shapeData.js').ShapeData} data  Effective data — for distHP/distVP.
 */
function seatOnPlanes(mesh, data) {
  const seat = computeSeating(mesh.geometry, mesh.quaternion, data);
  // Distance from the central axis (local x = 0) out to the nearest face. The floor for
  // distVP when distVPRef:'axis' seats the AXIS at distVP — without this the near face
  // (at distVP + minX) can sit behind the VP. uiManager reads it via sim.vpMinUnits().
  // Lives on the module-level solid only — a headless Show Method stage (computeSeating
  // called directly, below) must NOT touch this: it would clobber the live distVP slider
  // floor with a different pose's inset while the dock is still showing the real solid.
  vpAxisInset = seat.inset;
  mesh.position.set(seat.x, seat.y, 0);
}

/**
 * Pure seating math extracted from seatOnPlanes: given a geometry, an orientation
 * quaternion, and effective shape data, return the local-space position that rests the
 * solid's nearest extremes on the HP/VP per distHP/distVP (see seatOnPlanes' header for
 * the full rationale — this is the SAME algorithm, verbatim, with the one module-level
 * side effect (vpAxisInset) lifted out into the return value instead of a global write.
 * This is what makes a headless Show Method stage possible: it can compute a pose's
 * seating without disturbing the live solid's vpAxisInset (which uiManager's distVP
 * slider floor depends on).
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Quaternion} quaternion  Orientation to seat (already resolved, e.g. via
 *   applyShapeTransform against some effective data — may differ from `data` below, e.g. a
 *   headless stage's own effective angles).
 * @param {import('./src/shapeData.js').ShapeData} data  Effective data — for distHP/distVP.
 * @returns {{x:number, y:number, inset:number}}
 */
function computeSeating(geometry, quaternion, data) {
  const positions = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;

  // Rotate every vertex into the mesh's current orientation and track the
  // extremes. Setting obj.rotation keeps obj.quaternion in sync, so this matches
  // what the GPU will render. Vertex counts are tiny (a few dozen), once per rebuild.
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i).applyQuaternion(quaternion);
    if (vertex.x < minX) minX = vertex.x;
    if (vertex.y < minY) minY = vertex.y;
  }

  // Offset so the minimum corner lands exactly on each plane's distance. HP is
  // always measured to the nearest point (so distHP = 0 rests ON the floor). VP
  // defaults to the same, but `distVPRef: 'axis'` measures distVP to the solid's
  // central axis instead — for a TURNED solid the nearest corner sits in front of
  // the axis, and N.D. Bhatt quotes the axis distance (e.g. "axis 50 mm in front").
  // The solid is built centred on its axis (local x = 0), so the axis lands at
  // position.x; placing it at distVP is just `position.x = distVP`. (distVP = 0
  // keeps using 'nearest' regardless, so "base in the VP" is never affected.)
  const xPlace = data.distVPRef === 'axis' && data.distVP !== 0
    ? data.distVP
    : data.distVP - minX;
  return { x: xPlace, y: data.distHP - minY, inset: -minX };
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (CLAUDE.md, non-negotiable)
// Port of Visualizer.UpdateVisualization: cleanup → configure → build → analyse.
// ============================================================================

/**
 * Dispose the live projection (a nested LineSegments2 tree the flat shapeGroup
 * loop cannot reach) and detach it. Its dispose() walks hpGroup/vpGroup/
 * connectorGroup by reference, so it stays leak-safe even though the flatten step
 * reparents vpGroup out into vpFoldGroup (projectionDrawer.dispose).
 */
function disposeActiveProjection() {
  // ADR-162: a Step 5 reveal captures activeProjection into a closure var (proj) and keeps
  // writing opacity into it every tick; cancel-and-snap FIRST so an in-flight reveal can't
  // write into the groups this is about to dispose (stopViewReveal is a no-op once nulled).
  stopViewReveal();
  if (activeProjection) {
    activeProjection.dispose();
    activeProjection = null;
  }
}

/**
 * THE ONLY path for geometry changes (CLAUDE.md, non-negotiable). Port of
 * Visualizer.UpdateVisualization: cleanup → configure → build → analyse — now
 * GUIDED-STEPPER AWARE. Projections and vertex labels are no longer drawn
 * unconditionally; they follow the wizard flags (showProjectionsFlag /
 * showLabelsFlag) so the scene starts empty and reveals one layer per step.
 * Passing `null` clears to the empty start (grids only).
 *
 * @param {import('./src/shapeData.js').ShapeData | null} shapeData
 */
function rebuild(shapeData) {
  // Was the scene empty BEFORE this rebuild? (currentMesh is nulled below.) A solid appearing
  // from the empty start / a reset gets a fresh frame-to-fit; ongoing edits keep their pose.
  const wasEmpty = currentMesh === null;
  currentShapeData = shapeData;

  // --- Dispose the previous projection FIRST (see disposeActiveProjection). ---
  disposeActiveProjection();

  // --- Disposal contract (verbatim from CLAUDE.md). Prevents WebGL context
  //     exhaustion across rapid regenerations; verify with renderer.info.memory. ---
  for (const obj of shapeGroup.children) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
  currentMesh = null;
  currentEdgeOverlay = null;
  solidSpanUnits = 0;

  // --- Empty start / reset: no solid. Clear any labels/projections and stop. ---
  if (!shapeData) {
    vpAxisInset = 0; // no solid → no clip cap (uiManager floors distVP back to 0)
    if (ppHingeGroup) ppHingeGroup.position.z = DEFAULT_PP_STANDOFF;
    refreshLabels();
    onboarding?.setSolidPresent(false); // show the empty-state overlay
    if (compareOpen) drawCompare(); // clear the 2D sheet too — a live rebuild, never a snapshot
    notifyStateChange(); // empty/reset is a state change too (drives the self-check prompt)
    return;
  }

  // --- Configure: resolve the rotation-priority hierarchy into effective angles. ---
  const eff = computeEffectiveAngles(shapeData);

  // --- Build the solid + its edge overlay. createSolidMesh returns the mesh
  //     already positioned (distVP + halfBase, distHP + halfHeight) and rotated
  //     through the canonical applyShapeTransform — IShape contract. ---
  const mesh = createSolidMesh(eff);

  // Re-seat against HP/VP from the solid's ACTUAL rotated extents, overriding the
  // generator's upright half-extent placement. Fixes both the face-inclination
  // float and the orient-to-corner VP crossing in one pass (see seatOnPlanes).
  seatOnPlanes(mesh, eff);

  // Edge overlay shares the solid's transform. Kept as a SIBLING (not a child of
  // mesh) so the disposal loop above reaches it.
  const edgeOverlay = createEdgeOverlay(mesh.geometry);
  edgeOverlay.position.copy(mesh.position);
  edgeOverlay.quaternion.copy(mesh.quaternion);
  edgeOverlay.scale.copy(mesh.scale);

  shapeGroup.add(mesh, edgeOverlay);

  // The scanner/labeler weld + place in WORLD space, so matrixWorld must be
  // current. seatOnPlanes() set .position but the render loop has not run yet, so
  // force it now. updateWorldMatrix(true, false): fold in shapeGroup's transform,
  // no children to recurse (the mesh is a leaf).
  mesh.updateWorldMatrix(true, false);
  currentMesh = mesh;
  currentEdgeOverlay = edgeOverlay;

  // ADR-053: the 2D Compare sheet's scale is fixed to this LOCAL-geometry size, never to the
  // live drawn bbox — computeBoundingSphere() reads geometry attributes before mesh.position/
  // quaternion are applied, so it is untouched by distVP, distHP, or rotation.
  mesh.geometry.computeBoundingSphere();
  solidSpanUnits = (mesh.geometry.boundingSphere?.radius || 0) * 2;

  // Seat the profile plane just clear of the solid's nearest face (−Z side), so the
  // side view casts onto the "side wall of the box" without slicing it. The PP hinge
  // axis is the VP∩PP line at this z0 (ADR-106); projectPP draws the side view at the
  // hinge's local z=0, so this Z position is the plane's whole standoff (mirrors HP/VP gaps).
  {
    const box = new THREE.Box3().setFromObject(mesh);
    ppHingeGroup.position.z = box.min.z - PP_MARGIN;
    positionRefLabels(box); // place x/y + x1/y1 from the solid's extents (uses the new z0)
  }

  // --- Reveal the layers the current step has unlocked. ---
  refreshLabels();
  refreshProjections();
  applyFoldVisual(foldProgress); // keep a mid-fold / folded state consistent on edit
  if (wasEmpty) {
    // First solid after the empty start / a reset: frame it fresh so it fills the viewport
    // (~FRAME_PADDING margin) along the default look angle, instead of inheriting the loose
    // empty-scene pose. Subsequent edits use the push-out-only auto-zoom in the else branch.
    frameToSolid(DEFAULT_VIEW_DIR);
    controls.update();
  } else {
    reframeIfClipped();  // Feature 2: dolly back if a taller/turned solid now clips the view
  }
  onboarding?.setSolidPresent(true); // hide the empty-state; surface the orbit hint once
  // The Compare card shows a LIVE drawing, never a snapshot: every rebuild — slider
  // drags included — repaints it from the fresh projection data.
  if (compareOpen) drawCompare();
  notifyStateChange(); // parameter/mode change committed — re-run any self-check
}

/**
 * Regenerate or clear vertex labels to match showLabelsFlag + the current mesh.
 * (Idempotent — safe to call after any rebuild or flag flip.)
 */
function refreshLabels() {
  if (!labeler) return;
  if (showLabelsFlag && currentMesh) labeler.generate(currentMesh);
  else labeler.clear();
}

/**
 * Show or hide the profile plane as a unit — the WebGL hinge group (PP grid + side
 * view lines) AND its CSS2D "PP" pill. Both must move together: WebGLRenderer honours
 * ppHingeGroup.visible for the grid/lines, but the r160 CSS2DRenderer ignores ancestor
 * visibility, so the pill needs its own toggle (see ppPlaneLabel).
 * @param {boolean} on
 */
function applyProfilePlaneVisibility(on) {
  if (ppHingeGroup) ppHingeGroup.visible = on;
  if (ppPlaneLabel) ppPlaneLabel.visible = on;
}

/**
 * Show or hide the BIS Type-B dimension layer (projectionDrawer hpDimensionGroup +
 * vpDimensionGroup, ADR-041) as a unit. WebGLRenderer honours each group's .visible for the
 * fat dimension lines and the filled-arrowhead mesh, but the r160 CSS2DRenderer ignores ancestor
 * visibility, so each numeric CSS2D label needs its own per-object toggle (same gotcha as the PP pill).
 * @param {boolean} on
 */
function applyDimensionVisibility(on) {
  if (!activeProjection) return;
  // Toggle BOTH view groups as a unit: the top-view dims (world space) and the front-view
  // dims (VP fold pivot). Each CSS2D label needs its own .visible flip because the r160
  // CSS2DRenderer ignores ancestor visibility (same gotcha as the PP pill).
  for (const g of [activeProjection.hpDimensionGroup, activeProjection.vpDimensionGroup]) {
    g.visible = on;
    g.traverse((obj) => { if (obj.isCSS2DObject) obj.visible = on; });
  }
}

/**
 * Draw or clear the orthographic projections to match showProjectionsFlag + the
 * current mesh. All three views (HP/VP/PP) are computed in one edge pass, but the PP
 * side view only BECOMES VISIBLE once showSideViewFlag is on: the PP subgroup lives
 * under ppHingeGroup, whose `.visible` mirrors that flag. ADR-162: Step 5's single
 * "Draw the three views" action flips both showProjectionsFlag and showSideViewFlag
 * together (revealViewsSequence, main.js) before animating anything, so this function
 * itself no longer distinguishes a top+front-only call from a with-side-view call —
 * un-hiding the hinge group here just re-asserts whichever flags are already set.
 *
 * The VP subgroup is reparented into vpFoldGroup so the flatten step can fold it with
 * the VP grid; HP + connectors stay in world space under shapeGroup.
 * (Visualizer.AnalyzeShapeMesh → MeshAnalyzer + ProjectionDrawer.)
 */
function refreshProjections() {
  disposeActiveProjection();
  if (!showProjectionsFlag || !currentMesh) return;

  const edgeMap = buildEdgeMap(currentMesh.geometry, currentMesh.matrixWorld);
  const { width, height } = viewportSize();
  // ADR-087: the solid's world-space axis (local +Y rotated into world space), driving the
  // base/generator edge split. `transformDirection` applies only the 3×3 rotation+scale part of
  // matrixWorld (ignores translation) and normalizes — exactly the rotated-axis direction, and
  // correct even though `currentMesh` sits under `shapeGroup` (shapeGroup carries no rotation of
  // its own, but matrixWorld is used here anyway so this stays correct if that ever changes).
  const worldAxis = new THREE.Vector3(0, 1, 0).transformDirection(currentMesh.matrixWorld);
  // Pass the seated PP standoff (set in rebuild before this runs) so the flat
  // connectors can land the side-view projectors at z0 − x in the folded layout (ADR-106).
  activeProjection = drawProjections(edgeMap, {
    width, height, z0: ppHingeGroup.position.z, axis: worldAxis,
  });

  // HP top view + connectors render in world space; the VP front view hinges on
  // the ground line, so move it under the VP fold pivot. The PP side view hinges on the
  // VP∩PP line (ADR-106 — ppHingeGroup is nested inside vpFoldGroup), so move it under
  // the PP hinge group, which rides the VP fold down with the front view.
  shapeGroup.add(activeProjection.group);
  vpFoldGroup.add(activeProjection.vpGroup);
  ppHingeGroup.add(activeProjection.ppGroup);

  // Re-assert the profile plane's reveal state after a rebuild re-parents the PP
  // subgroup: it stays hidden until showSideViewFlag is on (Step 5's single reveal
  // action sets this alongside showProjectionsFlag — see the header above, ADR-162).
  applyProfilePlaneVisibility(showSideViewFlag);

  // 2D projectors live at the FOLDED layout positions (static world space), so they
  // stay put while the VP swings down; applyFoldVisual fades them in as the fold
  // completes. Kept out of the fold pivot for that reason.
  shapeGroup.add(activeProjection.flatConnectorGroup);

  // 3D side-view connectors (vertex → profile plane at z0) also live in world space — they
  // trace the upright solid back to the PP, parallel to the HP/VP connectors. They stay
  // hidden until the side-view step; applyFoldVisual gates them on showSideViewFlag.
  shapeGroup.add(activeProjection.ppConnectorGroup);

  // Dimensions annotate the top + front views, split per view so each rides the right hinge
  // (ADR-041 fold fix): the TOP-view dims stay flat in world space under shapeGroup (like the
  // flat connectors), while the FRONT-view dims go under vpFoldGroup so they fold down flat WITH
  // the VP grid + front view instead of standing upright after the flatten. Both built in the
  // upright world frame, held hidden until the learner reveals them at Step 6
  // (setDimensionsVisible); the projectionDrawer dispose() / setResolution reach them by held
  // reference regardless of parent (ADR-041).
  shapeGroup.add(activeProjection.hpDimensionGroup);
  vpFoldGroup.add(activeProjection.vpDimensionGroup);
  applyDimensionVisibility(showDimensionsFlag);
}

/**
 * Apply a fold state (0 = upright 3D, 1 = flat 2D drawing). Rotates the VP pivot
 * about the ground line and cross-fades the 3D-only elements (solid, its edge
 * overlay, and the connector lines) out as the drawing flattens — leaving the HP
 * top view and the folded VP front view as a clean orthographic drawing.
 * @param {number} p  fold progress 0..1
 */
function applyFoldVisual(p) {
  foldProgress = p;
  if (vpFoldGroup) vpFoldGroup.rotation.z = FOLD_TARGET * p;
  // Composed fold (ADR-106): ppHingeGroup is nested INSIDE vpFoldGroup, so this local-Y
  // rotation folds the profile plane sideways into the VP plane about the VP∩PP line, and
  // then rides vpFoldGroup's own Z rotation down with the front view — landing the side
  // view beside the FRONT view at (−y, 0, z0 − x). Same progress p drives both folds so
  // they complete together.
  if (ppHingeGroup) ppHingeGroup.rotation.y = PP_FOLD_TARGET * p;

  const solidOpacity = 1 - p; // linear fold progress — drives the connector cross-fade timing

  // The 3D solid + its edge overlay get DIRECTION-AWARE opacity:
  //  • FOLD (disappear): easeDissolve holds the body opaque as the fold begins, then fades it
  //    away faster and faster, fully gone by SOLID_DISSOLVE_END so the flat drawing lands clean.
  //  • UNFOLD (appear): the body stays hidden while the drawing is still flat, then fades in
  //    across [SOLID_APPEAR_END, SOLID_APPEAR_START] — _START sits at the easeFold acceleration
  //    onset, so the solid re-materialises just as the planes begin to swing back up.
  // Endpoints agree (p=0 ⇒ 1, p=1 ⇒ 0), so static refreshes (rebuild) are correct either way.
  const solidVis = solidAppearing
    ? easeDraw(THREE.MathUtils.clamp(
        (SOLID_APPEAR_START - p) / (SOLID_APPEAR_START - SOLID_APPEAR_END), 0, 1))
    : 1 - easeDissolve(THREE.MathUtils.clamp(p / SOLID_DISSOLVE_END, 0, 1));
  setObjectOpacity(currentMesh, solidVis);
  setObjectOpacity(currentEdgeOverlay, solidVis);
  if (activeProjection) {
    // The 3D vertex→plane connectors belong to the upright view — fade them out as
    // it flattens. Their 2D replacement, the projectors linking the top view to the
    // folded front view across the ground line, fade IN only over the last third of
    // the fold, so they snap onto the two settled views rather than trailing the
    // VP mid-swing. Both are dashed (projectionDrawer), so the 2D drawing keeps its
    // dashed connector lines.
    //
    // The "show connector lines" toggle gates BOTH sets by zeroing their effective
    // opacity (setObjectOpacity then also flips .visible off). Routing the toggle
    // through here is what makes it survive fold animation frames AND rebuilds — both
    // end in applyFoldVisual, so a hidden choice is re-applied rather than reset.
    const connectorFactor = showConnectorsFlag ? 1 : 0;
    setObjectOpacity(activeProjection.connectorGroup, solidOpacity * connectorFactor);
    // The 3D side-view connectors belong to the upright view too, but to the PP — which is
    // only revealed once the Step 5 Side view toggle is on. Gate them additionally on
    // showSideViewFlag so they never appear alongside the HP/VP connectors before that
    // toggle is switched on, then fade with the solid like those.
    const ppConnectorFactor = connectorFactor * (showSideViewFlag ? 1 : 0);
    setObjectOpacity(activeProjection.ppConnectorGroup, solidOpacity * ppConnectorFactor);
    setObjectOpacity(activeProjection.flatConnectorGroup,
      THREE.MathUtils.clamp(p * 3 - 2, 0, 1) * connectorFactor);
  }
  // View-name captions belong to the 2D drawing — fade them in on the same last-third
  // curve as the 2D projectors so they land on the settled view rows.
  setRefLabelOpacity(THREE.MathUtils.clamp(p * 3 - 2, 0, 1));
  labeler?.setOpacity(solidOpacity); // labels annotate the 3D solid — fade with it
}

/**
 * Fade an object (and its descendants) by driving every material's opacity.
 * `visible` is toggled off only at fully transparent so a faded-out solid stops
 * occluding picks/lines while a partly-faded one still renders.
 * @param {THREE.Object3D | null} root
 * @param {number} opacity 0..1
 */
function setObjectOpacity(root, opacity) {
  if (!root) return;
  const wantTransparent = opacity < 1;
  root.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      // Toggling `transparent` recompiles the (shader-based) LineMaterial, so only
      // flip it on the actual 1↔<1 transition, never every animation frame —
      // changing the opacity uniform alone needs no recompile.
      if (m.transparent !== wantTransparent) {
        m.transparent = wantTransparent;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
    }
  });
  root.visible = opacity > 0.001;
}

// ============================================================================
// Step actions — labels (Step 4), the three views (Step 5: setProjectionsVisible +
// setSideViewVisible are the per-flag primitives, revealViewsSequence is the wizard's
// single "draw all three" action that drives them together — ADR-162, supersedes
// ADR-161's two-button merge), flatten (Step 6). Exposed to the wizard through
// simController; each is idempotent and routes any geometry side-effects through the
// refresh helpers above.
// ============================================================================

function setLabelsVisible(on) {
  showLabelsFlag = on;
  refreshLabels();
}

/**
 * @param {boolean} on
 * @param {{ sequenced?: boolean }} [opts]  ADR-162: when `sequenced` is true, this call is one
 *   step inside `revealViewsSequence`'s own Front→Top→Side tween — skip this function's SOLO
 *   draw-on tween and its spotlight/Compare side-effects, which the sequence drives itself once
 *   all three views have landed. The flag + geometry build still happen unconditionally so the
 *   sequence has `activeProjection` to animate.
 */
function setProjectionsVisible(on, { sequenced = false } = {}) {
  showProjectionsFlag = on;
  refreshProjections();
  if (sequenced) return;
  // The Compare chip's 2D gate and any open sheet both track showProjectionsFlag. Only reached
  // when called directly (sequenced=false) — Step 5's own reveal (ADR-162) defers this to its
  // own onComplete instead, so the chip waits for all three views, not just this one.
  syncCompareChipVisibility();
  if (compareOpen) drawCompare();
  // Sync the freshly built projection to the current fold state — at Step 5 the
  // fold is 0, so this hides the 2D projectors until the learner flattens (without
  // it the new flatConnectorGroup would render at full opacity over the 3D view).
  applyFoldVisual(foldProgress);
  // Draw-on (DESIGN.md): grow the projection in by fading it from nothing. A true
  // length-grow on LineSegments2 needs per-segment dash trickery; an opacity rise
  // reads as "drawing on" while staying cheap and reduced-motion-safe (the tween
  // jumps to full opacity instantly when motion is reduced).
  if (on && activeProjection) {
    const proj = activeProjection; // capture: a later toggle may null the module ref
    tween({
      from: 0,
      to: 1,
      duration: DRAW_DURATION_MS,
      ease: easeDraw, // gentle ease-out so the views glide on and settle
      onUpdate: (o) => {
        setObjectOpacity(proj.hpGroup, o);   // HP top view
        setObjectOpacity(proj.vpGroup, o);   // VP front view (reparented to fold pivot)
        // Connectors draw on with the views only when the toggle has them shown; when
        // hidden, applyFoldVisual (already run above) has zeroed them and we leave them be.
        // PP is NOT faded here — it stays hidden under ppHingeGroup until Step 5.
        if (showConnectorsFlag) setObjectOpacity(proj.connectorGroup, o);
      },
    });
    // First-seen spotlight hints for the two views revealed here. Queued in onboarding.js
    // so they play one after the other (top, then front) rather than stacking (Quiet Chrome).
    onboarding?.spotlight('top-view');
    onboarding?.spotlight('front-view');
  }
}

/**
 * Step 5: reveal the profile plane (PP) and draw on the side view. The PP projection
 * was already computed in refreshProjections (one edge pass covers all three views)
 * but kept hidden under ppHingeGroup; this un-hides the hinge group — bringing in the
 * PP grid and label — and fades the PP linework on, so the third view arrives as its
 * own beat after the top + front views. Idempotent: re-running re-asserts the reveal.
 * @param {boolean} on
 * @param {{ sequenced?: boolean }} [opts]  ADR-162: see setProjectionsVisible's matching param —
 *   skip this function's own draw-on tween and Compare redraw when the sequence is driving it.
 */
function setSideViewVisible(on, { sequenced = false } = {}) {
  showSideViewFlag = on;
  applyProfilePlaneVisibility(on);
  // Sync the 3D side-view connectors to the new flag through the same path rebuild uses
  // (they live in world space, gated on showSideViewFlag inside applyFoldVisual). This is
  // what hides them again when the step is turned off.
  applyFoldVisual(foldProgress);
  if (sequenced) return;
  // The Compare sheet's side (PP, violet) line follows the same flag (drawCompare gates
  // ppGroup on showSideViewFlag).
  if (compareOpen) drawCompare();

  // Draw-on the side view by fading the PP linework in (mirrors setProjectionsVisible's
  // HP/VP draw-on). Seed at 0 so the lines grow in rather than flashing at full weight; the
  // PP connectors draw on with it when the connector toggle has them shown.
  if (on && activeProjection) {
    const proj = activeProjection; // capture: a later toggle may null the module ref
    setObjectOpacity(proj.ppGroup, 0);
    if (showConnectorsFlag) setObjectOpacity(proj.ppConnectorGroup, 0);
    tween({
      from: 0,
      to: 1,
      duration: DRAW_DURATION_MS,
      ease: easeDraw, // gentle ease-out so the side view glides on and settles
      onUpdate: (o) => {
        setObjectOpacity(proj.ppGroup, o);
        if (showConnectorsFlag) setObjectOpacity(proj.ppConnectorGroup, o);
      },
    });
  }
}

/**
 * Cancel-and-snap chokepoint for the Step 5 view reveal (ADR-162), mirroring
 * stopMethodBeatAnim's contract: cancelling never freezes a half-drawn view — it snaps every
 * group straight to full opacity so a reveal interrupted by an edit or a reset still completes
 * visually. No-op when nothing is in flight.
 *
 * This is an EXTERNAL cancellation (a rebuild from a slider edit, or window.simAPI.reset), never
 * the tween's own natural finish — tween()'s cancel() contract explicitly does NOT fire
 * onComplete (src/anim.js) — so any onViewDrawn/onDone the in-flight reveal hadn't yet announced
 * are fired here instead. Without this, editing a slider mid-reveal would strand the wizard:
 * the button stays hidden (state.viewsDrawing never clears) and Next stays disabled forever,
 * even though every view is now visibly, fully drawn.
 */
function stopViewReveal() {
  if (!viewRevealHandle) return;
  viewRevealHandle.cancel();
  viewRevealHandle = null;
  const units = viewRevealUnits;
  const hooks = viewRevealHooks;
  const from = viewRevealAnnounced;
  viewRevealUnits = null;
  viewRevealHooks = null;
  viewRevealAnnounced = 0;
  if (units) {
    for (const u of units) for (const g of u.groups) setObjectOpacity(g, 1);
  }
  if (hooks && units) {
    for (let i = from; i < units.length; i++) hooks.onViewDrawn?.(units[i].name);
    hooks.onDone?.();
  }
}

/**
 * Step 5 (ADR-162, supersedes ADR-161 decision 3): draw all three views — front, then top,
 * then side — from a single click, all three mandatory. Reuses Show Method's own idiom
 * (startMethodBeatAnim, ~main.js:2760): one tween whose value is a fractional item index —
 * `floor(v)` counts how many units are fully done, `v - floor(v)` (re-eased by easeDraw) is the
 * CURRENT unit's own 0..1 draw-on — rather than three separate tweens or a setTimeout chain.
 *
 * Reduced motion needs no special-casing: tween() (src/anim.js) calls onUpdate ONCE, synchronously,
 * with `v` already at `to` — the `while` loop below still walks every unit in that single call, so
 * all three onViewDrawn fire (and onComplete right after), just with zero visible motion.
 *
 * Front is revealed first (not Top, unlike the old combined HP+VP tween this replaces) because
 * the front view is what the learner has been building toward since Step 3's inclinations —
 * see ADR-162. Compare-chip sync and the spotlight queue are deferred to onComplete so neither
 * pops mid-sequence (syncCompareChipVisibility fires the instant showProjectionsFlag flips,
 * which used to happen on Front's own solo tween in setProjectionsVisible).
 *
 * @param {{ onViewDrawn?: (name: 'front'|'top'|'side') => void, onDone?: () => void }} [hooks]
 */
function revealViewsSequence(hooks = {}) {
  stopViewReveal(); // defensive: force-complete any stale in-flight reveal before starting a new one
  // Build the geometry + flip both flags before animating anything — refreshProjections()
  // (called by setProjectionsVisible) early-returns on !showProjectionsFlag, so the side view
  // MUST run second or activeProjection would still be null for it to reveal.
  setProjectionsVisible(true, { sequenced: true });
  setSideViewVisible(true, { sequenced: true });
  if (!activeProjection) { hooks.onDone?.(); return; } // no mesh — nothing to reveal
  const proj = activeProjection; // capture: a later toggle/rebuild may null the module ref

  const UNITS = [
    { name: 'front', groups: [proj.vpGroup, ...(showConnectorsFlag ? [proj.connectorGroup] : [])] },
    { name: 'top', groups: [proj.hpGroup] },
    { name: 'side', groups: [proj.ppGroup, ...(showConnectorsFlag ? [proj.ppConnectorGroup] : [])] },
  ];
  for (const u of UNITS) for (const g of u.groups) setObjectOpacity(g, 0);

  viewRevealUnits = UNITS;
  viewRevealHooks = hooks;
  viewRevealAnnounced = 0;

  viewRevealHandle = tween({
    from: 0,
    to: UNITS.length,
    duration: UNITS.length * DRAW_DURATION_MS,
    ease: (x) => x, // linear across units — easeDraw (below) shapes each unit's own reveal instead
    onUpdate: (v) => {
      const doneCount = Math.min(Math.floor(v), UNITS.length);
      const unitT = doneCount < UNITS.length ? easeDraw(THREE.MathUtils.clamp(v - doneCount, 0, 1)) : 1;
      for (let i = 0; i < UNITS.length; i++) {
        const o = i < doneCount ? 1 : i === doneCount ? unitT : 0;
        for (const g of UNITS[i].groups) setObjectOpacity(g, o);
      }
      while (viewRevealAnnounced < doneCount) {
        hooks.onViewDrawn?.(UNITS[viewRevealAnnounced].name);
        viewRevealAnnounced++;
      }
    },
    onComplete: () => {
      viewRevealHandle = null;
      viewRevealUnits = null;
      viewRevealHooks = null;
      viewRevealAnnounced = 0;
      for (const u of UNITS) for (const g of u.groups) setObjectOpacity(g, 1);
      // Deferred from the two solo setters above: Compare's 2D gate + any open sheet, and the
      // first-seen spotlight chips, now that all three views are actually on the sheet.
      syncCompareChipVisibility();
      if (compareOpen) drawCompare();
      onboarding?.spotlight('front-view');
      onboarding?.spotlight('top-view');
      onboarding?.spotlight('side-view');
      hooks.onDone?.();
    },
  });
}

/**
 * Step 6 (optional): reveal the BIS Type-B dimension layer on the top + front views —
 * overall width / height + the distances from HP / VP, with FILLED 3:1 arrowheads
 * (projectionDrawer hpDimensionGroup + vpDimensionGroup, ADR-041). The layer was built in refreshProjections
 * but held hidden; this un-hides it and draws it on. Idempotent; the flag persists across
 * rebuilds (refreshProjections re-asserts it via applyDimensionVisibility).
 * @param {boolean} on
 */
function setDimensionsVisible(on) {
  showDimensionsFlag = on;
  applyDimensionVisibility(on);

  // Draw-on (DESIGN.md): fade the dimensions in from nothing, mirroring the HP/VP + side-view
  // reveals. Seed at 0 so the linework grows in rather than flashing at full weight (the tween
  // snaps to full instantly under reduced motion). The numeric labels are CSS2D, so their reveal
  // is the visibility toggle above, not this opacity rise.
  if (on && activeProjection) {
    const proj = activeProjection; // capture: a later toggle may null the module ref
    // Seed both view groups at 0 and fade them on together (top-view + front-view dims).
    setObjectOpacity(proj.hpDimensionGroup, 0);
    setObjectOpacity(proj.vpDimensionGroup, 0);
    tween({
      from: 0,
      to: 1,
      duration: DRAW_DURATION_MS,
      ease: easeDraw, // gentle ease-out so the dimensions glide on and settle
      onUpdate: (o) => {
        setObjectOpacity(proj.hpDimensionGroup, o);
        setObjectOpacity(proj.vpDimensionGroup, o);
      },
    });
  }
}

/**
 * De-clutter toggle: show or hide BOTH connector sets (the upright 3D→2D connectors and
 * the flattened projectors) together. Routes through applyFoldVisual so the connectors'
 * effective opacity is recomputed against the CURRENT fold state with the flag applied —
 * the same path rebuild() uses, which is what makes the choice persist across edits.
 * Idempotent.
 * @param {boolean} on
 */
function setConnectorsVisible(on) {
  showConnectorsFlag = on;
  applyFoldVisual(foldProgress);
  announce(on ? 'Connector lines shown.' : 'Connector lines hidden.');
}

/** Animate the VP fold to `target` (1 = flatten, 0 = unflatten). */
function animateFold(target) {
  foldTween?.cancel();
  solidAppearing = target < foldProgress; // unfolding → the solid re-appears (appear curve)
  foldTween = tween({
    from: foldProgress,
    to: target,
    duration: FOLD_DURATION_MS,
    ease: easeFold, // heavy in/out so the hinge eases open and settles flat
    onUpdate: applyFoldVisual,
    onComplete: () => {
      foldTween = null;
      // methodCanRun() (ADR-084) gates on foldProgress === 1, which this tween is what
      // actually sets — stepper.js's own sim.method.refresh() call fires synchronously right
      // after sim.flatten()/unflatten(), i.e. BEFORE this tween has finished, so the Show
      // Method button would otherwise stay stuck disabled/enabled from the pose it was in at
      // click time. Re-sync here, once foldProgress has actually settled at its target.
      methodController?.sync();
    },
  });
}

// ============================================================================
// Camera framing — quick-views (Top/Front/Side) + the Step-5 answer-sheet swoop.
// The hybrid camera lives here: setView swaps in the ortho pair and snaps it square
// to a plane; restorePerspective swaps back to free-orbit.
// ============================================================================

/**
 * World-space bounding box of the content to frame: the live solid if one exists, else the
 * whole shapeGroup, else a unit box at the default target so even the empty scene frames
 * sanely (the quick-views stay usable before a solid is added).
 * @returns {THREE.Box3}
 */
function contentBox() {
  const box = new THREE.Box3();
  if (currentMesh) box.setFromObject(currentMesh);
  else if (shapeGroup && shapeGroup.children.length) box.setFromObject(shapeGroup);
  if (box.isEmpty()) {
    box.setFromCenterAndSize(DEFAULT_CAMERA_TARGET, new THREE.Vector3(2, 2, 2));
  }
  return box;
}

/**
 * Ortho zoom that fits a box's on-screen extent inside the current frustum, with padding.
 * Frustum half-height is ORTHO_FRUSTUM, half-width ORTHO_FRUSTUM*aspect at zoom 1; the
 * returned zoom scales both so the larger of the two box dimensions just fits.
 * @param {number} screenW  box extent mapped to screen X (world units)
 * @param {number} screenH  box extent mapped to screen Y (world units)
 * @returns {number}
 */
function fitOrthoZoom(screenW, screenH) {
  const aspect = orthoCamera.right / orthoCamera.top; // = viewport aspect
  const halfW = Math.max((screenW / 2) * FIT_PADDING, 1e-3);
  const halfH = Math.max((screenH / 2) * FIT_PADDING, 1e-3);
  return Math.min((ORTHO_FRUSTUM * aspect) / halfW, ORTHO_FRUSTUM / halfH);
}

/**
 * Perspective distance (camera→`pivot`, world units) that frames `box` with `padding` margin,
 * looking along `dir` (unit, pivot→camera) with screen-up `up`. Accurate PROJECTED-BOX fit:
 * each of the 8 corners is resolved onto the camera's right/up axes (perpendicular screen
 * extents) and its depth toward the camera, and the binding corner sets the distance. Unlike a
 * bounding-sphere fit it does not over-frame (a sphere's radius is the box half-diagonal, far
 * larger than the on-screen silhouette), so the solid fills the viewport with just the margin.
 * Pivot-aware: pass the box centre for an exact centred fill, or a fixed orbit target for a
 * pure-dolly fit that keeps that target on the optical axis.
 * @param {THREE.Box3} box
 * @param {THREE.Vector3} pivot   point the distance is measured from (held on the optical axis)
 * @param {THREE.Vector3} dir     unit view direction, pivot→camera
 * @param {THREE.Vector3} up      camera screen-up
 * @param {number} [padding=FRAME_PADDING]
 * @returns {number}
 */
function fitPerspectiveDistance(box, pivot, dir, up, padding = FRAME_PADDING) {
  const forward = dir.clone().negate();                       // pivot→scene
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, forward).normalize();
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const tanV = Math.tan(vHalf);
  const tanH = Math.tan(hHalf);

  const v = new THREE.Vector3();
  let D = 0;
  for (let i = 0; i < 8; i++) {
    v.set(
      (i & 1) ? box.max.x : box.min.x,
      (i & 2) ? box.max.y : box.min.y,
      (i & 4) ? box.max.z : box.min.z,
    ).sub(pivot);
    const a = v.dot(dir);                                     // depth toward the camera
    const px = Math.abs(v.dot(right));                        // perpendicular screen half-extents
    const py = Math.abs(v.dot(camUp));
    D = Math.max(D, a + (px * padding) / tanH, a + (py * padding) / tanV);
  }
  return D;
}

/**
 * Point the perspective camera at the live solid and dolly to a FRAME_PADDING fill along `dir`
 * (unit, target→camera), recentring controls.target on the solid centre. Does NOT call
 * controls.update(): instant callers (first solid) update after; the unfold glide reads the new
 * camera.position / controls.target as its destination and animates there.
 * @param {THREE.Vector3} dir  unit view direction (target→camera)
 */
function frameToSolid(dir) {
  const box = contentBox();
  const center = box.getCenter(new THREE.Vector3());
  const D = fitPerspectiveDistance(box, center, dir, camera.up);
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(dir, D);
}

// --- Ortho→perspective projection morph -----------------------------------
// The exit glide (restorePerspective) flies the ORTHO camera onto the perspective
// camera's retained pose. Matching the pose and framing is not enough on its own:
// orthographic has no foreshortening, perspective has full foreshortening, so a
// straight camera swap at the end of the glide makes off-plane geometry "pop" into
// depth in a single frame — the jarring snap. Instead we blend the active ortho
// camera's projection matrix toward the perspective projection across the SAME tween,
// so the view continuously gains depth and the final hand-off to the real perspective
// camera is a visual no-op (identical pose, identical projection).

/** Morph factor 0..1 (eased, set by the exit tween), or null when no morph is live. */
let projectionMorphK = null;

/**
 * Stamp the blended ortho↔perspective projection onto the ortho camera for this frame.
 * Read live each frame (after controls.update / the tween's updateProjectionMatrix) so
 * it is the last word on the matrix before render. At k=0 it is the pure ortho matrix
 * the tween just rebuilt; at k=1 it equals the perspective camera's matrix exactly, so
 * the subsequent hand-off shows no change.
 *
 * Element-wise lerp of two projection matrices is not a physically exact camera, but
 * between matched-framing endpoints over a sub-second move it reads cleanly as the
 * scene gaining depth — and it is the only thing that removes the projection-type cut.
 */
function applyProjectionMorph() {
  const k = projectionMorphK;
  const o = orthoCamera.projectionMatrix.elements; // pure ortho this frame (tween rebuilt it)
  const p = camera.projectionMatrix.elements;      // perspective, pose-independent
  for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * k;
  orthoCamera.projectionMatrixInverse.copy(orthoCamera.projectionMatrix).invert();
}

/** End any in-flight projection morph and restore a clean ortho matrix. Called before
 *  every fresh camera move so a leftover blend never bleeds into the next view. */
function clearProjectionMorph() {
  if (projectionMorphK === null) return;
  projectionMorphK = null;
  orthoCamera.updateProjectionMatrix(); // discard the blend; recompute pure ortho
}

/**
 * Feature 2 — clip-aware auto-zoom. Called at the end of rebuild() (the single seam every
 * size/orient change passes through), so it NEVER runs per-frame and never fights a manual
 * orbit or scroll-zoom: between edits OrbitControls owns the camera completely.
 *
 * If the (new) solid would clip the default perspective camera, dolly the camera BACKWARD
 * along its current view direction until the solid is fully framed; otherwise do nothing —
 * push-back only, so a deliberate zoom-in is preserved. controls.target stays fixed, so the
 * orbit pivot/baseline is unchanged and the move is a pure dolly. Reduced motion jumps to
 * the end instantly (anim.js).
 */
function reframeIfClipped() {
  // Only the free-orbit perspective view auto-frames: skip the ortho quick-views /
  // answer-sheet and any in-progress fold, where their own framing owns the camera.
  if (!currentMesh || activeCamera !== camera || foldProgress !== 0) return;

  // Dolly direction (target→camera). Captured once; the render loop's activeControls.update()
  // finalises damping each frame (mirrors tweenCamera). Guard the degenerate camera-at-target
  // case so normalize() can't yield a zero direction.
  const target = controls.target;
  const dir = camera.position.clone().sub(target);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();

  // Required distance from the FIXED target to frame the solid with FRAME_PADDING margin, via an
  // accurate projected-box fit (a bounding sphere over-frames — its radius is the box half
  // diagonal, far larger than the on-screen silhouette). Pivoting on the fixed target keeps a
  // pure dolly. Push-back only below, so a deliberate zoom-in survives an edit.
  const dReq = fitPerspectiveDistance(contentBox(), target, dir, camera.up);

  const dCur = camera.position.distanceTo(target);
  if (dCur >= dReq) return; // already framed (or zoomed in within range) — never pull in

  autoZoomTween?.cancel();
  autoZoomTween = tween({
    from: dCur,
    to: dReq,
    duration: AUTO_ZOOM_MS,
    onUpdate: (d) => { camera.position.copy(target).addScaledVector(dir, d); },
    onComplete: () => { autoZoomTween = null; },
  });
}

/**
 * Tween a camera + its controls to a pose (position, target, and — for the ortho camera —
 * zoom). Lerps inside the rAF tween engine; the render loop's activeControls.update() each
 * frame finalises damping, so we only set the raw transforms here. Reduced motion makes the
 * tween jump to the end instantly (anim.js).
 * @param {THREE.Camera} cam
 * @param {OrbitControls} ctrls
 * @param {THREE.Vector3} toPos
 * @param {THREE.Vector3} toTarget
 * @param {number} [toZoom]  ortho zoom; omitted for the perspective camera
 * @param {number} [duration=CAMERA_MOVE_MS]  override for the answer-sheet swoop (slower).
 * @param {(t:number)=>number} [ease=easeCamera]  easing; quick-view snaps use the weighted
 *   easeCamera, the answer-sheet swoop overrides with easeFold (matched to the fold hinge).
 * @param {THREE.Vector3} [toUp]  destination screen-up. When given, the camera's up is LERPED
 *   to it (the roll animates instead of snapping); pairs with engageOrtho seeding the start up.
 *
 * If engageOrtho armed a perspective→ortho morph (projectionMorphK !== null on entry), this
 * drives it to 0 across the same eased curve so the depth change animates too.
 */
function tweenCamera(cam, ctrls, toPos, toTarget, toZoom, duration = CAMERA_MOVE_MS, ease = easeCamera, toUp) {
  const fromPos = cam.position.clone();
  const fromTarget = ctrls.target.clone();
  const fromZoom = cam.zoom ?? 1;
  const fromUp = toUp ? cam.up.clone() : null;
  // engageOrtho has already set the morph state (1 to morph from perspective, null for a pure
  // ortho→ortho re-frame), so READ it here rather than clearing it — clearing would wipe the arm.
  const morphing = projectionMorphK !== null;
  // While morphing FROM perspective, hold the camera-to-target distance constant (the seeded
  // distance) instead of dollying out to the destination standoff. A far standoff would, during
  // the perspective phase, shrink the view and the ortho zoom would then grow it back: the
  // zoom-out-then-in wobble. In pure ortho the final distance is irrelevant to framing, so the
  // monotonic zoom alone settles it. (Pure ortho→ortho re-frames don't morph, so they skip this.)
  const fromDist = morphing ? fromPos.distanceTo(fromTarget) : 0;
  cameraTween?.cancel();
  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease,
    onUpdate: (t) => {
      cam.position.lerpVectors(fromPos, toPos, t);
      ctrls.target.lerpVectors(fromTarget, toTarget, t);
      if (morphing) cam.position.sub(ctrls.target).setLength(fromDist).add(ctrls.target); // no dolly
      if (fromUp) cam.up.copy(fromUp).lerp(toUp, t).normalize(); // animate the screen-up roll
      if (toZoom != null && cam.isOrthographicCamera) {
        cam.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
        cam.updateProjectionMatrix();
      }
      if (morphing) projectionMorphK = 1 - t; // perspective→ortho on the same curve
    },
    onComplete: () => { cameraTween = null; if (morphing) projectionMorphK = null; },
  });
}

/**
 * Return to the perspective free-orbit camera (cancelling any in-flight ortho move).
 *
 * The perspective camera kept the learner's last orbit pose, so the HAND-OFF itself is just
 * a swap. By default that swap is instant (used by reset, where the camera is being
 * repositioned anyway). When `animate` is true — re-clicking the active quick-view to leave
 * it, OR unfolding the 2D drawing back to 3D — the ortho camera first GLIDES from its
 * square-on pose back to the perspective camera's retained pose (position, target, screen-up
 * + a zoom matching the perspective frustum at that distance), AND its projection matrix
 * morphs from orthographic to perspective over the same tween, so the swap lands seamlessly
 * with no projection-type cut and the learner keeps their spatial bearing. The unfold passes
 * the fold's own duration + easeFold so the camera and the planes spring back up together
 * (the mirror of the flatten swoop). Reduced motion skips straight to the swap.
 * @param {boolean} [animate=false] Tween the ortho camera back before handing off.
 * @param {number} [duration=CAMERA_MOVE_MS] Glide duration (unfold passes FLATTEN_MOVE_MS).
 * @param {(t:number)=>number} [ease=easeStandard] Glide easing (unfold passes easeFold).
 */
function restorePerspective(animate = false, duration = CAMERA_MOVE_MS, ease = easeStandard) {
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();

  // Latch the quick-view off up front so the buttons update at the START of the move.
  activeView = null;
  syncQuickViews();

  const handOff = () => {
    activeCamera = camera;
    activeControls = controls;
    controlsOrtho.enabled = false;
    controls.enabled = true;
  };

  // Instant swap for reset / unflatten / reduced motion, or when already in perspective.
  if (!animate || prefersReducedMotion || activeCamera !== orthoCamera) {
    handOff();
    return;
  }

  // Glide the ortho camera onto the perspective camera's pose, then hand off. Lerp position,
  // target and screen-up (the last gives the smooth roll out of a top-down view); set zoom so
  // the ortho frustum height equals the perspective frustum height at the target distance, so
  // framing matches at the moment of the swap.
  const fromPos = orthoCamera.position.clone();
  const fromTarget = controlsOrtho.target.clone();
  const fromUp = orthoCamera.up.clone();
  const fromZoom = orthoCamera.zoom;

  const toPos = camera.position.clone();
  const toTarget = controls.target.clone();
  const toUp = camera.up.clone();
  const dist = toPos.distanceTo(toTarget);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const toZoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3);

  // The perspective endpoint of the morph is pose-independent — make sure it is current
  // (aspect may have changed since the last resize) before the loop blends against it.
  camera.updateProjectionMatrix();
  projectionMorphK = 0; // arm the morph; the render loop stamps it each frame from here

  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease,
    onUpdate: (t) => {
      orthoCamera.position.lerpVectors(fromPos, toPos, t);
      controlsOrtho.target.lerpVectors(fromTarget, toTarget, t);
      orthoCamera.up.copy(fromUp).lerp(toUp, t).normalize();
      orthoCamera.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
      orthoCamera.updateProjectionMatrix(); // pure ortho; applyProjectionMorph blends on top
      projectionMorphK = t;                 // drive the depth morph on the same eased curve
    },
    onComplete: () => {
      cameraTween = null;
      projectionMorphK = null; // morph reached perspective; stop blending (no clean-up redraw
                               // needed — we hand off to the real perspective camera now)
      handOff();
    },
  });
}

/**
 * Make the ortho camera the live camera, seeding a smooth transition INTO it.
 *
 * On first entry FROM perspective it seeds the ortho pose ON the live 3D view — position,
 * target, screen-up AND a zoom whose frustum height matches the perspective frustum at this
 * distance — and arms the perspective→ortho projection morph. The following tweenCamera then
 * animates a CONTINUOUS move: position, the screen-up ROLL, zoom, and the depth morph all
 * glide rather than cutting (previously the screen-up snapped, so the view appeared to rotate
 * instantly). Ortho→ortho re-frames keep the current ortho pose as the tween's start and clear
 * any leftover morph. Reduced motion skips the morph (the tween jumps to the end value).
 *
 * Callers set activeView + syncQuickViews, then call tweenCamera with the destination `toUp`.
 */
function engageOrtho() {
  if (activeCamera !== orthoCamera) {
    orthoCamera.position.copy(camera.position);
    controlsOrtho.target.copy(controls.target);
    orthoCamera.up.copy(camera.up); // start the roll from the 3D view's screen-up, don't snap
    const dist = camera.position.distanceTo(controls.target);
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    orthoCamera.zoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3); // match framing at frame 0 (no pop)
    orthoCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();                    // morph endpoint must be current (aspect)
    projectionMorphK = prefersReducedMotion ? null : 1; // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph(); // ortho→ortho: pure ortho throughout; drop any leftover blend
  }
  activeCamera = orthoCamera;
  activeControls = controlsOrtho;
  controls.enabled = false;
  controlsOrtho.enabled = true;
}

/** Capitalised quick-view name for screen-reader announcements ('top' → 'Top'). */
function viewName(kind) {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

/**
 * Snap the ortho camera square to a reference plane, or toggle back to perspective orbit if
 * the already-active view is clicked again (so the learner is never trapped in ortho).
 *
 * FOLD-AWARE: once the drawing is fully flattened (foldProgress === 1) the VP and PP have
 * folded flat onto the HP floor, so the 3D head-on directions below would aim the camera at
 * empty space. In that state all three views delegate to setFlatView, which keeps the
 * top-down angle and merely PANS to frame the requested view's flattened linework.
 * @param {'top'|'front'|'side'} kind
 */
function setView(kind) {
  const spec = QUICK_VIEWS[kind];
  if (!spec) return;
  if (activeView === kind) {
    // Re-clicking the active view resets the camera. In the flattened 2D state,
    // restoring the 3D perspective would show a confusing angled view of the flat
    // drawings, so swoop back to the full answer-sheet framing instead. Otherwise glide
    // back to the perspective view (animate = true) so the return reads as a move, not a cut.
    if (foldProgress === 1) swoopToAnswerSheet();
    else restorePerspective(true, QUICK_VIEW_MS, easeFold); // cinematic exit back to free-orbit
    return;
  }
  if (foldProgress === 1) { setFlatView(kind); return; }

  const box = contentBox();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // On-screen extents perpendicular to the view direction (see QUICK_VIEWS).
  let screenW;
  let screenH;
  if (kind === 'top')        { screenW = size.x; screenH = size.z; }
  else if (kind === 'front') { screenW = size.z; screenH = size.y; }
  else /* side */            { screenW = size.x; screenH = size.y; }

  const toPos = center.clone().addScaledVector(spec.dir, ORTHO_STANDOFF);
  const toZoom = fitOrthoZoom(screenW, screenH);

  engageOrtho();
  activeView = kind;
  syncQuickViews();

  // Pass the destination screen-up so the roll between views animates instead of snapping;
  // slow cinematic timing + heavy ease-in-out so entering a view reads as a weighted move.
  tweenCamera(orthoCamera, controlsOrtho, toPos, center, toZoom, QUICK_VIEW_MS, easeFold, spec.up);
  announce(`${viewName(kind)} view.`);
}

/**
 * World box of ONE view's linework in the flattened drawing: the HP top view, the folded VP
 * front view, or the folded PP side view. Read from the live projection groups whose world
 * matrices already carry the fold (we force-update them first), so it is exact for the
 * current solid. Falls back to the whole answer-sheet box if that group has no lines yet.
 * @param {'top'|'front'|'side'} kind
 * @returns {THREE.Box3}
 */
function flattenedViewBox(kind) {
  let group = null;
  if (activeProjection) {
    if (kind === 'top') group = activeProjection.hpGroup;
    else if (kind === 'front') group = activeProjection.vpGroup;
    else group = activeProjection.ppGroup;
  }
  if (group && group.children.length) {
    group.updateWorldMatrix(true, true); // fold the ancestor pivots in before measuring
    const box = new THREE.Box3().setFromObject(group);
    if (!box.isEmpty()) return box;
  }
  return answerSheetBox();
}

/**
 * 2D quick-view: in the flattened drawing the three views sit side-by-side on the XZ floor,
 * so "Top / Front / Side" become a top-down PAN that frames the requested view's linework
 * rather than a camera rotation. Uses the same top-down angle (dir + up) and fit as the
 * answer-sheet swoop, retargeted to the single view's box.
 * @param {'top'|'front'|'side'} kind
 */
function setFlatView(kind) {
  const box = flattenedViewBox(kind);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Top-down framing (as the answer sheet), rolled 90° so world Z → screen X and
  // world X → screen Y (up = −X). Fit against the swapped axes accordingly.
  const toZoom = fitOrthoZoom(size.z, size.x);
  const toPos = center.clone().addScaledVector(QUICK_VIEWS.top.dir, ORTHO_STANDOFF);

  engageOrtho();
  activeView = kind;
  syncQuickViews();

  tweenCamera(orthoCamera, controlsOrtho, toPos, center, toZoom, CAMERA_MOVE_MS, easeCamera, FLAT_VIEW_UP);
  announce(`${viewName(kind)} view (flattened drawing).`);
}

/**
 * World box of the FINAL flattened layout (all three views in the Y=0 floor), derived
 * analytically from the solid's box + the PP standoff so it's correct from the instant the
 * fold starts (no need to wait for the animation). Mappings (see projectionDrawer /
 * applyFoldVisual, ADR-106): top view (x,0,z); folded front view (−y,0,z); folded side view
 * (−y,0,z0−x). The union spans those X/Z ranges; Y is flat.
 * @returns {THREE.Box3}
 */
function answerSheetBox() {
  const solid = contentBox();
  const { min, max } = solid;
  const z0 = ppHingeGroup.position.z;
  const M = 2.0; // match positionRefLabels overshoot so captions stay framed
  // X: top view (x) + front view AND side view (both −y — they share the X band, ADR-106).
  // +M / −M push the boundaries out to the top + front caption edges.
  const xs = [min.x, max.x + M, -max.y - M, -min.y];
  // Z: top/front view (z) + side view (z0 − x, beside the FRONT view on the −Z side).
  // −M extends the −Z boundary out to the side-view caption (see positionRefLabels).
  const zs = [min.z, max.z, z0 - max.x - M, z0 - min.x];
  return new THREE.Box3(
    new THREE.Vector3(Math.min(...xs), -0.01, Math.min(...zs)),
    new THREE.Vector3(Math.max(...xs), 0.01, Math.max(...zs)),
  );
}

/**
 * Step-6 "answer sheet": swoop the ortho camera to a top-down framing of the whole
 * flattened drawing, alongside the fold tween (matched FLATTEN_MOVE_MS + easeFold).
 *
 * The camera ROTATION is animated, not snapped. The naive path (engageOrtho → tweenCamera)
 * rolled the screen-up to FLAT_VIEW_UP (−X) and cut to ortho INSTANTLY, then glided the
 * position — so the view appeared to spin 90° before it moved. Instead we seed the ortho
 * camera ON the live perspective pose (same position, target, screen-up, and a zoom whose
 * frustum height matches the perspective frustum at this distance), so frame 0 is identical
 * to the 3D view, then lerp position, target, screen-up (the roll) and zoom together while
 * morphing the projection perspective→ortho on the same eased curve. This is the entry
 * mirror of restorePerspective's animated exit. Reduced motion / an already-ortho start
 * (a quick-view) keep the original instant engage + position tween.
 */
function swoopToAnswerSheet() {
  const box = answerSheetBox();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  // Top-down, rolled 90° (up = −X): world Z maps to screen X, world X to screen Y, so the
  // ground line lies horizontal and the front view sits above the top view. Fit against the
  // swapped axes (size.z horizontal, size.x vertical).
  const toZoom = fitOrthoZoom(size.z, size.x);
  const toPos = center.clone().addScaledVector(QUICK_VIEWS.top.dir, ORTHO_STANDOFF);

  activeView = null; // the answer sheet is not a latched quick-view
  syncQuickViews();

  // No perspective pose to roll out of (reduced motion, or we are already square-on in a
  // quick-view): keep the original instant engage + position tween.
  if (prefersReducedMotion || activeCamera === orthoCamera) {
    engageOrtho();
    tweenCamera(orthoCamera, controlsOrtho, toPos, center, toZoom, FLATTEN_MOVE_MS, easeFold, FLAT_VIEW_UP);
    return;
  }

  // --- Animated entry from the perspective free-orbit view (mirror of restorePerspective) ---
  cameraTween?.cancel();
  clearProjectionMorph();

  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const fromUp = camera.up.clone();
  const toUp = FLAT_VIEW_UP;
  // Seed the ortho zoom so its frustum height equals the perspective frustum height at this
  // distance — frame 0 then matches the 3D framing exactly (no scale pop alongside the roll).
  const dist = fromPos.distanceTo(fromTarget);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fromZoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3);
  // Rotate down at the SAME distance the camera had from the solid — a pure pivot, no
  // dolly-back. A far standoff (ORTHO_STANDOFF) would, during the perspective phase, shrink
  // the view, and the ortho zoom would then grow it back: the zoom-out-then-in wobble. In
  // pure ortho the final height is irrelevant to framing, so a near standoff is free; the
  // monotonic zoom (fromZoom → toZoom) alone settles the answer-sheet framing.
  const toPosAnim = center.clone().addScaledVector(QUICK_VIEWS.top.dir, dist);

  orthoCamera.position.copy(fromPos);
  controlsOrtho.target.copy(fromTarget);
  orthoCamera.up.copy(fromUp);
  orthoCamera.zoom = fromZoom;
  orthoCamera.updateProjectionMatrix();

  // Hand the live camera to ortho up front (buttons + render switch now), but seeded on the
  // perspective pose so the hand-off is a visual no-op, not a cut.
  activeCamera = orthoCamera;
  activeControls = controlsOrtho;
  controls.enabled = false;
  controlsOrtho.enabled = true;

  camera.updateProjectionMatrix(); // morph endpoint must be current (aspect may have changed)
  projectionMorphK = 1;            // start fully perspective-looking, morph to pure ortho (0)

  cameraTween = tween({
    from: 0,
    to: 1,
    duration: FLATTEN_MOVE_MS,
    ease: easeFold, // matched to the fold hinge so camera and planes move as one
    onUpdate: (t) => {
      // Pure pivot: lerp toward the top-down pose but FORCE the camera-to-target distance to
      // stay exactly `dist` the whole way (a linear lerp would cut the corner and dip closer
      // mid-arc, which under the lingering perspective reads as a zoom-in bump). Constant
      // distance ⇒ the perspective scale never changes; only the monotonic zoom settles framing.
      controlsOrtho.target.lerpVectors(fromTarget, center, t);
      orthoCamera.position
        .lerpVectors(fromPos, toPosAnim, t)
        .sub(controlsOrtho.target)
        .setLength(dist)
        .add(controlsOrtho.target);
      orthoCamera.up.copy(fromUp).lerp(toUp, t).normalize(); // the roll, now animated
      orthoCamera.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
      orthoCamera.updateProjectionMatrix();         // pure ortho; applyProjectionMorph blends on top
      projectionMorphK = 1 - t;                     // perspective(1) → ortho(0) on the same curve
    },
    onComplete: () => {
      cameraTween = null;
      projectionMorphK = null; // settled on pure ortho; stop blending
    },
  });
}

/** Fade the first-angle projection symbol in (flatten) or out (unflatten/reset). */
function setFirstAngleSymbol(visible) {
  faSymbolEl?.classList.toggle('is-visible', visible);
}

/**
 * Current drawing-buffer size in CSS pixels — the unit LineMaterial.resolution
 * expects (matching the three.js line examples, which pass innerWidth/innerHeight,
 * not DPR-scaled pixels). Falls back to a 1×1 size before the viewport mounts.
 * @returns {{ width: number, height: number }}
 */
function viewportSize() {
  return {
    width: viewport?.clientWidth || 1,
    height: viewport?.clientHeight || 1,
  };
}

// ============================================================================
// Scene bootstrap
// ============================================================================

/**
 * Build a CSS2D plane-name pill ("HP" / "VP") themed from its plane's domain hue.
 * Positioned by the caller in the relevant plane's space (HP in world, VP under
 * the fold pivot). The pill always faces the camera (CSS2DObject) and renders via
 * labelRenderer, so it reads in the 3D view and after the fold to 2D alike.
 * @param {string} text     Plane label, e.g. 'HP'.
 * @param {'hp'|'vp'|'pp'} modifier  Hue modifier matching the .plane-label--* CSS.
 * @returns {CSS2DObject}
 */
function makePlaneLabel(text, modifier) {
  const el = document.createElement('div');
  el.className = `plane-label plane-label--${modifier}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

/**
 * Build a CSS2D view-name caption ("Top View" / "Front View" / "Side View") for the
 * flattened drawing — a quiet muted-ink sans label naming each orthographic view.
 * Starts faded; setRefLabelOpacity drives it in lockstep with the x/y reference lines.
 * @param {string} text
 * @returns {CSS2DObject}
 */
function makeViewLabel(text) {
  const el = document.createElement('div');
  el.className = 'view-name-label';
  el.textContent = text;
  el.style.opacity = '0';
  return new CSS2DObject(el);
}

/**
 * Drive the opacity of the flattened-drawing view-name captions (Top/Front/Side View)
 * together, in step with the fold's last-third fade. Hidden from layout at ~0 so a faded
 * caption never catches a stray click.
 *
 * NOTE: the x/y and x1/y1 ground-line reference marks are intentionally NOT created for now
 * (de-clutter), so only the captions are driven here.
 * @param {number} o 0..1
 */
function setRefLabelOpacity(o) {
  for (const lbl of [topViewLabel, frontViewLabel, sideViewLabel]) {
    if (!lbl) continue;
    lbl.element.style.opacity = String(o);
    lbl.visible = o > 0.001;
  }
}

/**
 * Re-place the flattened-drawing view-name captions from the solid's world box. (The x/y and
 * x1/y1 ground-line reference marks are not created for now — de-clutter — so nothing else is
 * placed here.)
 * @param {THREE.Box3} box  solid's world bounding box
 */
function positionRefLabels(box) {
  const M = 2.0; // overshoot past the view extents — clears geometry + projector lines
  const z0 = ppHingeGroup.position.z;

  // View-name captions sit at the folded layout positions (world space). The flattened
  // floor lives at Y = 0; in the answer-sheet camera world +X reads DOWN the screen and
  // world Z reads across it. The three views land (see answerSheetBox / projectionDrawer):
  //   • Top view   at +X, spanning the solid's X/Z extents.
  //   • Front view at −Y (negative X on the floor) → ABOVE the top view on screen.
  //   • Side view  beside the FRONT view at Z = z0 − x (shares the front view's X band —
  //     screen-vertical — so Side lands at the SAME on-screen height as Front; ADR-106,
  //     supersedes the old HP∩PP-hinge fold that shared the top view's band instead).
  // Caption each just clear of its view: top view below it (+X), front above (−X), side
  // beside the front view further along −Z.
  if (!topViewLabel) return;
  const groundCz = (box.min.z + box.max.z) / 2; // shared top/front horizontal centre
  topViewLabel.position.set(box.max.x + M, 0, groundCz);
  frontViewLabel.position.set(-box.max.y - M, 0, groundCz);
  const frontCx = -(box.min.y + box.max.y) / 2;   // share the front view's X band (on-screen height)
  const sideEdgeZ = z0 - box.max.x;                // side view's −Z (screen-left) edge
  sideViewLabel.position.set(frontCx, 0, sideEdgeZ - M); // M past the edge, not the centre
}

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  // Camera.
  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  // Renderer. Antialias for crisp technical edges; cap DPR so retina iframes
  // don't overdraw.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows on the solid (CLAUDE.md)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (CLAUDE.md flags context exhaustion as the most
  // likely late-stage bug). A GPU reset or a long backgrounding can drop the
  // context; without preventDefault() the browser will NOT restore it and the
  // canvas freezes blank while the rAF loop spins uselessly. So: stop the loop and
  // show a quiet recovery chip on loss, then re-upload by rebuilding the current
  // state and resume on restore.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // REQUIRED — opts in to a restorable context
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    // Three.js re-initialises its GL state on the next render; rebuilding the live
    // shape re-creates the projection LineMaterials cleanly too (rebuild(null) is a
    // no-op clear when the scene is empty). Then restart the loop and hide the chip.
    rebuild(currentShapeData);
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Lighting: flat ambient fill + ONE low directional, no shadows. Gives faint
  // face differentiation without architectural-viz lighting (CLAUDE.md visual style).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  // Subtle ground reference on the HP (XZ) plane — CAD orientation aid, kept
  // out of shapeGroup so rebuild() never disposes it. Stays fixed during the fold.
  hpGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  hpGrid.material.opacity = 0.35;
  hpGrid.material.transparent = true;
  scene.add(hpGrid);

  // Matching reference grid on the VP (YZ plane at X=0). A GridHelper lies in the
  // XZ plane by default, so roll it 90° about Z to stand it up vertical. HP and VP
  // meet along the Z axis — the ground/reference line, which is the fold hinge.
  vpGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  vpGrid.material.opacity = 0.35;
  vpGrid.material.transparent = true;
  vpGrid.rotation.z = Math.PI / 2;

  // Fold pivot at the origin: rotating it about Z swings the VP (grid + front-view
  // projection, added later) down onto the HP, hinged on the ground line (Step 6).
  vpFoldGroup = new THREE.Group();
  vpFoldGroup.add(vpGrid);
  scene.add(vpFoldGroup);

  // Profile plane (PP, side view). Normal +Z, so it lies in the XY plane: a GridHelper
  // defaults to XZ (normal Y), so tip it 90° about X to stand it in XY (upright). It is
  // parented under ppHingeGroup, which is NESTED INSIDE vpFoldGroup (ADR-106 — was a
  // sibling fold pivot in world space; that landed the side view beside the TOP view,
  // which is wrong). Folding ppHingeGroup +90° about its local Y swings the profile plane
  // SIDEWAYS into the VP plane about the VP∩PP line; vpFoldGroup's own fold then carries
  // it down WITH the front view, laying the grid flat beside the front view. The hinge's
  // Z position (the PP standoff z0) is set per-rebuild from the solid's depth; default
  // here keeps the empty-scene grid clear of the origin.
  ppGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  ppGrid.material.opacity = 0.35;
  ppGrid.material.transparent = true;
  ppGrid.rotation.x = Math.PI / 2;

  ppHingeGroup = new THREE.Group();
  ppHingeGroup.position.z = DEFAULT_PP_STANDOFF; // origin on the VP∩PP line (0, 0, z0) in vpFoldGroup's frame
  // The profile plane is introduced together with the other two views by Step 5's single
  // reveal action (ADR-162), so it stays hidden through the empty start and Steps 1–4 to
  // keep the viewport uncluttered until then. setSideViewVisible reveals it.
  ppHingeGroup.visible = false;
  ppHingeGroup.add(ppGrid);
  vpFoldGroup.add(ppHingeGroup); // ADR-106 — nested so the PP fold rides the VP fold down

  // PP pill. Parented under the hinge so it rides the fold and stays labelled on the
  // flattened sheet, beside the folded side view (same rationale as the VP label riding
  // vpFoldGroup). Pre-fold (upright), vpFoldGroup carries no translation, so this local
  // (4, 4, 0) reads as world (4, 4, DEFAULT_PP_STANDOFF) — tight enough to sit inside the
  // default camera frame (~±4 units) without a zoom-out, and still clear of the HP/VP
  // pills. ADR-106: the +90°-about-Y PP fold now composes with vpFoldGroup's own fold, so
  // this pill lands beside the folded SIDE view wherever that settles beside the front
  // view — re-verify it doesn't collide with the side-view linework after the fold change.
  ppPlaneLabel = makePlaneLabel('PP', 'pp');
  ppPlaneLabel.position.set(4, 4, 0);
  ppPlaneLabel.visible = false; // hidden with the profile plane until Step 5's reveal (ADR-162; see ppPlaneLabel decl)
  ppHingeGroup.add(ppPlaneLabel);

  // (The x/y and x1/y1 ground-line reference marks are intentionally not created for now —
  // a de-clutter pass on the 2D drawing. setRefLabelOpacity / positionRefLabels now drive
  // only the view-name captions below.)

  // View-name captions for the flattened sheet (Top / Front / Side View). Static in
  // world space at the folded layout — positionRefLabels re-places them per rebuild —
  // and faded in with the reference lines at the end of the flatten (setRefLabelOpacity).
  topViewLabel = makeViewLabel('Top View');
  frontViewLabel = makeViewLabel('Front View');
  sideViewLabel = makeViewLabel('Side View');
  scene.add(topViewLabel, frontViewLabel, sideViewLabel);
  setRefLabelOpacity(0);

  // Name the two reference planes in the viewport (CSS2D pills, plane-hue coded).
  // HP sits on the fixed floor grid (never folds); VP is parented to the fold pivot so
  // it swings down with the front view and stays labelled in the flattened 2D drawing.
  // Coordinates are tight (a few units) so both pills sit inside the default camera
  // frame (DEFAULT_CAMERA_POSITION/TARGET, ~±4 units) without a zoom-out, while still
  // staying clearly separated. HP's X MUST be positive: the VP plane is fixed at world
  // X=0 and the solid always seats with its near face at X=distVP>0 (see seatOnPlanes,
  // "leftmost point exactly on VP"), so positive X is the first-angle side the solid
  // actually occupies — a negative-X HP pill reads as sitting behind VP, in the wrong
  // quadrant for a first-angle drawing. VP rides the fold pivot at local (0, 4, -3) —
  // local x MUST stay 0, since the +90°-about-Z flatten maps local (x, y, z) →
  // world (-y, x, z), and only x=0 keeps the pill on the floor (world y=0) once folded
  // flat beside the front view.
  const hpLabel = makePlaneLabel('HP', 'hp');
  hpLabel.position.set(2.5, 0, 3);
  scene.add(hpLabel);

  const vpLabel = makePlaneLabel('VP', 'vp');
  vpLabel.position.set(0, 4, -3);
  vpFoldGroup.add(vpLabel);

  // Orbit controls. Edge classification will re-run on the 'change' event when
  // projections exist (CLAUDE.md: re-classify on orbit, throttled to rAF).
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();

  // Ortho camera for the quick-views + answer sheet (hybrid plan). Frustum sized from the
  // aspect now; per-view fitting drives camera.zoom thereafter. It shares the canvas with a
  // second OrbitControls, disabled until an ortho view is active so only one set of controls
  // consumes pointer events at a time.
  const aspect = (w || 1) / (h || 1);
  orthoCamera = new THREE.OrthographicCamera(
    -ORTHO_FRUSTUM * aspect, ORTHO_FRUSTUM * aspect, ORTHO_FRUSTUM, -ORTHO_FRUSTUM, 0.1, 100);
  orthoCamera.position.copy(DEFAULT_CAMERA_POSITION);

  controlsOrtho = new OrbitControls(orthoCamera, renderer.domElement);
  controlsOrtho.target.copy(DEFAULT_CAMERA_TARGET);
  controlsOrtho.enableDamping = !prefersReducedMotion;
  controlsOrtho.dampingFactor = 0.08;
  controlsOrtho.enabled = false; // perspective is the default active pair
  // Lock ORBIT on the ortho pair. The ortho camera only ever frames a plane head-on
  // (Top/Front/Side quick-views) or the flattened answer-sheet top-down — orbiting any of
  // those breaks the square-on, parallel-projection reading the view exists to give, and a
  // dragged ortho view reads as a confusing flat shear (no perspective cue to anchor it).
  // Pan + zoom stay on so the learner can still inspect the drawing without leaving the view.
  // Free-orbit lives on the perspective pair (controls), which is untouched.
  controlsOrtho.enableRotate = false;
  controlsOrtho.update();

  // An attempted ORBIT on the rotate-locked ortho pair fires no OrbitControls event at all —
  // catch the pointerdown itself and nudge the lit quick-view chip (cueOrthoLock), so the
  // learner reads "disengage this view to orbit" instead of a dead drag.
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activeCamera !== orthoCamera) return;
    cueOrthoLock();
  });

  // Start in free-orbit perspective.
  activeCamera = camera;
  activeControls = controls;

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // CSS2D overlay for vertex labels (Step 4). A transparent DOM layer sized to the
  // canvas; pointer-events disabled so drag-to-orbit passes through. Appended to
  // the same container as the canvas so it tracks the viewport's box exactly.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  // Own stacking context (position:absolute + explicit z-index) so the per-label
  // zIndex values CSS2DRenderer assigns for depth-sorting stay TRAPPED inside this
  // overlay instead of competing in #sim-viewport's root context — where a high label
  // index would paint over the viewport chrome (.vp-cluster z4, etc.). Tier 1: above
  // the WebGL canvas (z auto/0), below all chrome (z 2–4).
  overlay.style.zIndex = '1';
  container.appendChild(overlay);

  // Pass the live drawing-buffer size so the axis chain line + curved-solid
  // generators (fattened LineSegments2) render at the right pixel width from frame
  // one; handleResize keeps it in sync thereafter.
  labeler = initVertexLabeler(scene, new THREE.Vector2(w, h));
}

// ============================================================================
// Render loop
// ============================================================================

let lastFrameTime = 0;

function animate(now) {
  rafId = requestAnimationFrame(animate);
  // Delta in ms (cap to avoid a huge jump after a pause/tab-switch resumes).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);        // advance fold / draw-on / camera animations (pauses with the loop)
  activeControls.update();  // applies damping inertia on whichever camera is live
  // Ortho→perspective projection morph (exit from a quick-view). Stamped HERE, after
  // controls.update() and the tween's own updateProjectionMatrix(), so neither can
  // clobber the blended matrix before it is rendered (see restorePerspective).
  if (projectionMorphK !== null) applyProjectionMorph();
  renderer.render(scene, activeCamera);
  labelRenderer.render(scene, activeCamera); // vertex-label overlay on top of the canvas
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0; // reset delta clock so resume() doesn't see a stale gap
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize — track the container, not just window (the iframe can be resized
// by the host without a window resize event).
// ============================================================================

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  // Keep the ortho frustum aspect-correct without disturbing the per-view fit: only L/R/T/B
  // change here, camera.zoom (set by frameBox) is preserved.
  if (orthoCamera) {
    orthoCamera.left = -ORTHO_FRUSTUM * aspect;
    orthoCamera.right = ORTHO_FRUSTUM * aspect;
    orthoCamera.top = ORTHO_FRUSTUM;
    orthoCamera.bottom = -ORTHO_FRUSTUM;
    orthoCamera.updateProjectionMatrix();
  }

  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h); // keep the vertex-label overlay aligned to the canvas

  // Fattened lines render the wrong thickness if LineMaterial's resolution drifts
  // from the drawing buffer — keep it in sync on every resize (CLAUDE.md / drawer
  // header note 1). The render-loop owns nothing here; this is the only updater.
  activeProjection?.setResolution(w, h);
  labeler?.setResolution(w, h); // axis chain line + curved-solid generators

  // The Compare card's stage tracks the viewport (grid/flex sizing) — repaint its
  // drawing at the new backing-store size so the linework stays crisp.
  if (compareOpen) drawCompare();
  // Show Method's takeover (ADR-085) is `position: fixed; inset: 0` — it resizes with the
  // window, not with #sim-viewport, but the container's ResizeObserver still fires on every
  // window resize (the container itself resizes too), so this is the same hook, forked.
  if (methodViewOpen) queueMethodRedraw();
}

// ============================================================================
// Mobile advisory — banner only, never blocks the sim (platform contract).
// ============================================================================

function setupMobileNotice() {
  const notice = document.getElementById('mobile-notice');
  const dismiss = document.getElementById('mobile-notice-dismiss');
  if (!notice || !dismiss) return;

  const mq = window.matchMedia('(max-width: 767px)');
  let dismissed = false;

  const sync = () => { notice.hidden = !mq.matches || dismissed; };
  dismiss.addEventListener('click', () => { dismissed = true; sync(); });
  mq.addEventListener('change', sync);
  sync();
}

// ============================================================================
// Wizard hide/show — collapse the guided-steps panel for a larger 3D view.
// Toggles a body class; the viewport reflows to full width via flex, and the
// ResizeObserver below keeps the renderer + LineMaterial resolution in sync.
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');

    // The viewport just changed size (flex reflow). Sync the renderer to the new box, then
    // re-fit so an expanded — now taller/narrower on mobile — frame doesn't over-zoom or crop.
    // rAF lets the layout settle so handleResize reads the final dimensions.
    requestAnimationFrame(() => {
      handleResize(viewport);
      if (activeCamera === orthoCamera && foldProgress === 1) {
        // Flattened 2D drawing (answer sheet, or a single flat view): only the ortho ZOOM
        // depends on aspect, so re-fit it to the new frame (pose unchanged) — the same fit
        // the flatten swoop used, recomputed for the resized viewport.
        const box = activeView ? flattenedViewBox(activeView) : answerSheetBox();
        const size = box.getSize(new THREE.Vector3());
        const toZoom = fitOrthoZoom(size.z, size.x);
        tweenCamera(orthoCamera, controlsOrtho, orthoCamera.position.clone(),
                    controlsOrtho.target.clone(), toZoom, AUTO_ZOOM_MS, easeCamera);
      } else {
        // Free-orbit perspective: reframeIfClipped dollies back until the solid is framed with
        // FRAME_PADDING margin. Push-back only, so a collapse that merely WIDENS the view
        // (desktop) is a clean no-op, and an empty scene reframes nothing.
        reframeIfClipped();
      }
    });
  });
}

// ============================================================================
// Quick-view buttons — always-on viewport overlay (Top / Front / Side). Wired in
// main.js like the wizard toggle, not the stepper, so they work in every step.
// ============================================================================

/** The three quick-view buttons, held so syncQuickViews can reflect the latched view. */
let quickViewButtons = [];

function setupQuickViews() {
  quickViewButtons = Array.from(document.querySelectorAll('[data-quick-view]'));
  for (const btn of quickViewButtons) {
    btn.addEventListener('click', () => setView(btn.dataset.quickView));
  }
  syncQuickViews();
}

/** The connector-visibility checkbox, held so reset() can sync its checked state. */
let connectorToggleEl = null;

/**
 * Wire the global "Show connector lines" checkbox (viewport overlay, beside the quick
 * views). Like setupQuickViews it lives in main.js, not the stepper, so it works in every
 * step. Toggling routes through simController.setConnectors; the flag persists across
 * rebuilds (see showConnectorsFlag / applyFoldVisual).
 */
function setupConnectorToggle() {
  connectorToggleEl = document.getElementById('connector-toggle');
  if (!connectorToggleEl) return;
  connectorToggleEl.checked = showConnectorsFlag;
  connectorToggleEl.addEventListener('change', () => {
    simController.setConnectors(connectorToggleEl.checked);
  });
}

/** Reflect the latched ortho view on the buttons (.is-active + aria-pressed). */
function syncQuickViews() {
  for (const btn of quickViewButtons) {
    const on = btn.dataset.quickView === activeView;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

/** Orbit attempted while the rotate-locked ortho camera is live: nudge the lit chip (or the
 *  chip group when the answer sheet latched nothing — activeView is null there) so the learner
 *  reads "disengage this view to orbit". The reflow restarts the animation on a repeat drag. */
function cueOrthoLock() {
  const el = document.querySelector('[data-quick-view].is-active')
    || document.querySelector('.quick-views');
  if (!el) return;
  el.classList.remove('qv-lock-cue');
  void el.offsetWidth;
  el.classList.add('qv-lock-cue');
  setTimeout(() => el.classList.remove('qv-lock-cue'), 450);
}

// ============================================================================
// Compare view + 50/50 workbench (ADR-037 pattern, ported from the finished Points
// topic reference build: graphics_module_1_topic_3_points/main.js). The on-demand 2D
// drawing (top/front/side views on one plain 2D <canvas>, ADR-034 — never a second
// WebGL context) plus the expanded workbench split that docks the FULL geometry
// driver set under both panes for a "solve & verify" read, deliberately overriding
// the wizard's one-idea-per-step disclosure while the split is open.
// ============================================================================

/** The 7 [data-ctrl] wrapper keys re-parented into #workbench-rail, ORDERED so related
 *  drivers sit adjacent (#rail-toggle floats over the viewport pane now, not the rail, so
 *  this array's first entry lands in column 1 with no clearance to dodge): size (Base
 *  length + Height, already one bundled wrapper, spans both grid rows in column 1) →
 *  disthp + distvp (the two distances) → anglehp + anglevp (the two angles) → resting +
 *  roty (rests on / turn about the axis). Shape, Add, and the mode toggles
 *  (orient/face-inclination) stay in the wizard — they are not continuous geometry
 *  drivers, and the wizard itself is unreachable while the split is open (aria-label on
 *  #workbench-rail notes this). */
const WORKBENCH_CONTROLS = ['size', 'disthp', 'distvp', 'anglehp', 'anglevp', 'resting', 'roty'];
/** ADR-018 declared scale: 1 world unit = 10 mm. projectionDrawer.js keeps its own private
 *  copy of this same constant (for its dimension labels); drawCompare needs it too, to turn
 *  flattened world-space points into the same mm units the sheet's fixed scale is defined in. */
const WORLD_TO_MM = 10;

let compareCard = null;
let compareCanvas = null;
let compareChip = null;
let compareOpen = false;      // the card is shown at all
let workbenchOpen = false;
/** Drag-to-pan offset (CSS px, ADR-054) applied on top of the fixed intrinsic-nominal frame
 *  in drawCompare's project(). User-driven only — never touched by slider/angle changes, so
 *  it composes with ADR-053's scale-lock instead of fighting it. Zeroed on every card (re)open
 *  (compare.show) so a fresh open is always centred; a dblclick on the canvas also zeroes it. */
let comparePanX = 0;
let comparePanY = 0;
/** Scroll-wheel zoom multiplier (ADR-055), applied in project() as a post-multiply on TOP of
 *  the fixed intrinsic scale — never recomputes or replaces it, so ADR-053's scale-lock stays
 *  pure. 1 = the untouched intrinsic scale (10 mm reads as 10 mm); user-driven only, same
 *  reset contract as comparePanX/Y (compare.show, dblclick, sim reset — see resetCompareView). */
let compareZoom = 1;
const COMPARE_ZOOM_MIN = 0.4;
const COMPARE_ZOOM_MAX = 5;

// ---- Show Method state (ADR-085). All Set-1/2/3 walkthrough state lives here, entirely
// SEPARATE from `activeProjection`/`currentMesh` (the live 3D pane) — the Sets are additive
// headless data, never a scene mutation (methodController.js owns the DOM + beat sequencing;
// this module only builds/draws the data and the sheet layout math). Show Method draws into its
// OWN takeover (#method-view/#method-canvas), never the Compare card — see drawMethodView below.
// ----
let methodActive = false;          // walkthrough is running (the takeover is open and drawing)
let methodSets = [];                // built ONCE per method.begin(): [{ label, z0, data, eff }]
let methodSet = 0;                  // 0-based index of the Set currently being drawn
let methodBeat = 0;                 // 0-based beat index within methodSet (see BEAT ORDER, drawMethodSheet)
/** Set-N focus (main.js CLAUDE.md naming note, ADR-084/085): purely visual — which Set's block
 *  the camera lens (methodPanX/Y, methodZoom) is currently framed on. Independent of methodSet/
 *  methodBeat (what is DRAWN); null = the whole row. "Set" not "Stage" — .compare-card__stage
 *  already owns that word in this file/CSS. */
let focusSet = null;

/** Coalesce Compare-sheet repaints to one per animation frame — shared by drag/wheel (ADR-054/
 *  055) and any future driver of a rapid repaint sequence, so none of them can independently
 *  queue up a backlog of drawCompare() calls. Show Method (ADR-085) has its own, separate
 *  queueMethodRedraw — the two surfaces are fully independent post-ADR-085. */
let redrawQueued = false;
function queueRedraw() {
  if (redrawQueued) return;
  redrawQueued = true;
  requestAnimationFrame(() => {
    redrawQueued = false;
    if (compareOpen) drawCompare();
  });
}

// ---- Show Method's OWN surface + camera lens (ADR-085) — forked from compareCanvas/
// comparePanX/Y/compareZoom so a drag on either surface can never re-frame the other. ----
let methodCanvas = null;           // #method-canvas — grabbed in the boot block beside compareCanvas
let methodViewEl = null;           // #method-view — the takeover container main.js shows/hides
let methodViewOpen = false;        // the takeover is visible at all (mirrors compareOpen's role)
let methodPanX = 0;
let methodPanY = 0;
let methodZoom = 1;

/** Show Method's own reset contract (ADR-085) — resetCompareView() no longer touches this state;
 *  the two surfaces reset independently. Called on begin() and on every teardown path. */
function resetMethodView() {
  stopMethodFocusAnim(false); // cancel without snapping — the explicit reset below wins instead
  methodFocusTarget = null;
  methodPanX = 0;
  methodPanY = 0;
  methodZoom = 1;
  focusSet = null;
}

// ---- Set-chip focus animation (ADR-102 supersedes ADR-085's "instant snap, no tween" clause for
// this one interaction — the same amendment ADR-101 already made for the tilt: ADR-091's private
// rAF pump means a second independent loop is no longer the only way to animate here). Matches
// the platform's existing Top/Front/Side quick-view chips exactly — QUICK_VIEW_MS + easeFold,
// reused verbatim rather than a new curve/duration (see tweenCamera's own use of them). ----
let methodFocusActive = false;   // a focus pan/zoom is currently playing
let methodFocusHandle = null;    // the live tween handle, so a snap-finish can cancel it mid-flight
let methodFocusTarget = null;    // { panX, panY, zoom } — the destination of the most recent tween

/** Cancel any in-flight focus tween. `snap` (default) lands methodPanX/Y/methodZoom on the last
 *  target computed by setMethodFocus; pass false to freeze wherever the tween currently is (used
 *  by the drag/wheel handlers, which immediately overwrite methodPanX/Y/methodZoom themselves). */
function stopMethodFocusAnim(snap = true) {
  methodFocusHandle?.cancel();
  methodFocusHandle = null;
  if (snap && methodFocusTarget) {
    methodPanX = methodFocusTarget.panX;
    methodPanY = methodFocusTarget.panY;
    methodZoom = methodFocusTarget.zoom;
  }
  methodFocusActive = false;
}

/** Tween methodPanX/Y/methodZoom to a target, sharing methodAnimFrame's rAF pump (ADR-091) with
 *  the beat stroke-in and the Set-to-Set tilt — only one of the three is ever actually mid-tween
 *  (setMethodProgress/stopMethodBeatAnim settle this one first), so nothing new needs pumping. */
function startMethodFocusAnim(toPanX, toPanY, toZoom) {
  const from = { panX: methodPanX, panY: methodPanY, zoom: methodZoom };
  methodFocusTarget = { panX: toPanX, panY: toPanY, zoom: toZoom };
  stopMethodFocusAnim(false); // cancel a prior focus tween IN PLACE — don't snap it to ITS old target first
  methodFocusActive = true;
  if (methodAnimRafId === null) {
    methodAnimLastT = 0;
    methodAnimRafId = requestAnimationFrame(methodAnimFrame);
  }
  methodFocusHandle = tween({
    from: 0,
    to: 1,
    duration: QUICK_VIEW_MS,
    ease: easeFold,
    onUpdate: (t) => {
      methodPanX = THREE.MathUtils.lerp(from.panX, methodFocusTarget.panX, t);
      methodPanY = THREE.MathUtils.lerp(from.panY, methodFocusTarget.panY, t);
      methodZoom = THREE.MathUtils.lerp(from.zoom, methodFocusTarget.zoom, t);
      queueMethodRedraw();
    },
    onComplete: () => {
      methodFocusActive = false;
      methodFocusHandle = null;
      queueMethodRedraw();
    },
  });
}

// ---- Show Method per-line stroke-in (ADR-091). Each beat's lines draw one at a time, ~0.2-0.4s
// apiece, instead of the whole beat's batch popping in at once. Only ONE beat can ever be
// mid-reveal at a time — the current frontier (methodSet, methodBeat) — everything behind it is
// already fully drawn and everything ahead of it is still empty, so a single flat set of module
// vars (not a per-beat map) is enough. Driven by anim.js's shared tween()/tick() (same helper the
// live pane's own draw-on reveals use, see setProjectionsVisible), but pumped by THIS module's
// OWN requestAnimationFrame loop rather than the sim's animate() — that loop is paused for the
// entire time Show Method is open (ADR-085), so reusing it would mean nothing ever ticks. Reusing
// anim.js's `active` Set is still safe: nothing else can be tweening while animate() is paused. ----
const METHOD_SEG_DURATION_MS = 300; // ~0.2-0.4s band per line/segment, spec'd by ADR-091
let methodAnimBeat = -1;     // beat index currently mid-reveal, or -1 = none (draw beats in full)
let methodAnimIndex = 0;     // 0-based index of the unit currently drawing within methodAnimBeat
let methodAnimUnitT = 0;     // 0..1 eased reveal fraction of that unit
let methodAnimHandle = null; // the live tween handle, so a snap-finish can cancel it mid-flight
let methodAnimRafId = null;  // this module's own rAF loop handle (animate()'s loop is paused)
let methodAnimLastT = 0;

// ---- Show Method Set-to-Set ghost (supersedes ADR-101's screen-anchored 3D pictorial — see
// DECISIONS.md). Both reference textbooks draw this transition as a pure 2D operation: whichever
// view carried the true angle is bodily copied and turned/tilted about its axis foot to land on
// the next Set's own position — never a pictorial of the solid. This does exactly that: a rigid
// rotate+translate of the previous Set's own already-harvested true-shape-view lines. Two
// eligible kinds (ADR-104 TURN, ADR-110 TILT — methodStepIsXTilt/startMethodTilt pick which):
// TURN lands pixel-exact on the top view because Set 3's pose IS Set 2's pose yawed about world-Y
// (ADR-093, which drops Y); TILT lands pixel-exact on the FRONT view because that step's pose
// delta IS a pure world-X rotation (ADR-110, which drops X). A motion cue between two
// already-drawn Sets, never a beat of its own (METHOD_BEAT_COUNT stays 14 — ADR-094's assert is
// untouched). Rides the exact same private rAF pump ADR-091 already stood up
// (methodAnimFrame/queueMethodRedraw below), not a second loop — no buildEdgeMap/
// drawProjections, no allocation, no disposal; drawMethodGhost re-flattens the harvested `data`
// arrays both Sets already carry. ----
const METHOD_TILT_DURATION_MS = 900;  // motion phase — rotate+translate, easeFold
const METHOD_TILT_HOLD_MS = 400;      // landed, full alpha — the payoff frame (ghost == Set 3 start)
const METHOD_TILT_FADE_MS = 350;      // alpha 1 -> 0, then Set 3's own beat-1 stroke-in takes over
const METHOD_TILT_TOTAL_MS = METHOD_TILT_DURATION_MS + METHOD_TILT_HOLD_MS + METHOD_TILT_FADE_MS;
const GHOST_ALPHA = 0.35; // base opacity of the copied top view, before the fade-phase multiplier
let methodTiltActive = false;   // a ghost is currently playing
let methodTiltMotionT = 0;      // 0..1 eased rotate+translate progress — 1 for the whole hold+fade tail
let methodTiltAlpha = 1;        // 1 through motion+hold, ramps to 0 across the fade phase
let methodTiltHandle = null;    // the live tween handle, so a snap-finish can cancel it mid-flight
/** Pose-independent facts solved ONCE at ghost start (mirrors the old fitMethodTiltProjection's
 *  "compute once" precedent) — everything PX-valued is recomputed per frame in drawMethodGhost
 *  from the live sheet layout instead, so a pan/zoom mid-tilt stays correct (the old screen-
 *  anchored inset ignored methodPanX/Y/methodZoom entirely). `vertexIsFirst`: which end of
 *  `ann.axis` is the turning pivot, decided once against Set 3 (see startMethodTilt) and reused by
 *  INDEX on Set 2 — both Sets harvest from one shared geometry, so index correspondence holds. */
let methodGhost = null; // { fromIndex, vertexIsFirst, turnDeg, kind: 'turn'|'tilt' } | null

/** One atomic stroked line ("moveTo→lineTo→stroke") per k-step — the animation-unit granularity;
 *  matches strokeMethodLines'/the projector-loop's/strokeAxisInto's own iteration exactly, so an
 *  index computed here always lands on the same unit drawMethodSheet's reveal-aware draw does. */
function segUnitCount(pts) {
  let n = 0;
  for (let k = 0; k + 5 < pts.length; k += 6) n++;
  return n;
}

function lineArrayUnitCount(lines, onlyHidden, onlyKind) {
  let n = 0;
  for (const seg of lines) {
    if (onlyHidden !== undefined && seg.hidden !== onlyHidden) continue;
    if (onlyKind !== undefined && seg.kind !== onlyKind) continue;
    n += segUnitCount(seg.pts);
  }
  return n;
}

/** The firstIsHP/view-A/view-B split drawMethodSheet and methodContentBeats each need — pulled
 *  out here because methodBeatUnitCount below is now a THIRD site that needs the identical split;
 *  two independent copies (methodContentBeats' own, predating this change) was the accepted
 *  precedent, a third was not. */
function methodViewSplit(set) {
  const firstIsHP = set.trueShape !== 'front';
  return {
    firstIsHP,
    viewA: firstIsHP
      ? { outline: set.data.hpOutline, data: set.data.hp }
      : { outline: set.data.vpOutline, data: set.data.vp },
    viewB: firstIsHP
      ? { outline: set.data.vpOutline, data: set.data.vp }
      : { outline: set.data.hpOutline, data: set.data.hp },
  };
}

/** ADR-099/-100: is the angle arc + degree label eligible for this Set at all — the exact
 *  numeric guard ADR-099 introduced, pulled out to a standalone function (mirroring
 *  methodViewSplit's own precedent above) so methodBeatUnitCount (a pre-flight COUNT of beat 12's
 *  animation units) and drawMethodSheet (the actual draw) share one answer and can never disagree
 *  about whether the arc exists — the two are a beat apart in the source and had already drifted
 *  once (ADR-099's own "caught live" note). See drawMethodSheet's call site for the full geometric
 *  reasoning this guard encodes; unchanged from ADR-099, only relocated. */
const ARC_DIR_EPS = 0.02; // ~1.1° — floating-point slack, not a real tolerance window
function methodArcEligible(set) {
  const spec = set.labelSpec;
  if (!spec) return false;
  const { firstIsHP } = methodViewSplit(set);
  if (spec.kind === 'plane') {
    const dropped = firstIsHP ? set.axisDir.y : set.axisDir.x;
    return Math.abs(dropped) < ARC_DIR_EPS;
  }
  if (spec.kind === 'both') return firstIsHP;
  return false;
}

/** ADR-110 — is `from → to` a pure world-X-axis rotation, i.e. a Set1→Set2-style TILT eligible
 *  for the SAME rigid-2D-motion ghost treatment ADR-104 gave the both-planes Set2→Set3 TURN, but
 *  riding the FRONT view instead of the top view.
 *
 *  Every Set's rotation is `R = Rz(-V)·Rx(H)·Ry(θ)` (iShape.js, order 'ZXY'). Set 1 always has
 *  every mode forced off (planMethodStages), so `R_from = Ry(θ_from)` — NOT the identity, but
 *  exactly the right-hand factor of `R_to`. So `ΔR = R_to · R_from⁻¹ = Rz(-V_to)·Rx(H_to)·Ry(θ_to
 *  - θ_from)`, which collapses to a pure `Rx` (a TILT) iff `V_to ≈ 0` AND `θ_to ≈ θ_from` — both
 *  required, since a product of rotations about two distinct world axes has no single axis. The
 *  `to.turnDeg == null` guard excludes the both-planes Set 3: that Set's `eff` is deliberately a
 *  COPY of Set 2's own (projectSequentialBothPlanesPose, ADR-093) for LABELLING only — it is not
 *  the rotation actually applied there (a yaw), so `eff` alone can't tell the two cases apart.
 *
 *  Why the FRONT view, not the top view: flattenVP is `(u,v) = (-z, y)`. Under `Rx(A)`, `y' = y
 *  cosA - z sinA` and `z' = y sinA + z cosA`; substituting `z=-u, y=v` gives `u' = u·cosA -
 *  v·sinA`, `v' = u·sinA + v·cosA` — exact SO(2). (The top view drops `y` — the very coordinate
 *  `Rx` mixes into `z` — so it foreshortens instead of rotating; ADR-104's turn uses the top view
 *  because ITS invariant, ADR-093's yaw, is the Y-axis dual of this one.) The drawn line SET is
 *  also unchanged, not just its shape: `visibleInVP`/`onOutlineVP` (projectionDrawer.js) key off
 *  `worldNormal.x`, and `edgeKindOf` keys off a dot product with `axisDir` — both untouched by a
 *  rotation about that same world-X axis, by construction. See DECISIONS.md ADR-110 for the full
 *  proof (includes why `restingPlane:'VP'` and a VP-inclination step can't reach this branch). */
function methodStepIsXTilt(fromSet, toSet) {
  if (toSet.turnDeg != null) return false; // ADR-093 sequential yaw — handled by the turn path
  return Math.abs(fromSet.eff.angleVP) < ANGLE_EPS
      && Math.abs(toSet.eff.angleVP) < ANGLE_EPS
      && Math.abs(toSet.eff.rotationY - fromSet.eff.rotationY) < ANGLE_EPS
      && toSet.trueShape === 'front';
}

/** Total animation units for a given Set + beat index — world-space counts only (no screen
 *  transform), so pacing stays correct even if the learner pans/zooms/focuses mid-reveal. Mirrors
 *  the exact filters drawMethodSheet's own per-beat gates use (see that function's beat-index
 *  table); beats 0 (caption/xy) and 13 (labels, text not lines) have nothing to animate. */
function methodBeatUnitCount(set, beatIndex) {
  const { viewA, viewB } = methodViewSplit(set);
  switch (beatIndex) {
    case 1: return lineArrayUnitCount(viewA.outline);
    case 2: return lineArrayUnitCount(viewA.data, false, 'base');
    case 3: return lineArrayUnitCount(viewA.data, true, 'base');
    case 4: return lineArrayUnitCount(viewA.data, false, 'generator');
    case 5: return lineArrayUnitCount(viewA.data, true, 'generator');
    case 6: return set.ann.labels.length;
    case 7: return lineArrayUnitCount(viewB.outline);
    case 8: return lineArrayUnitCount(viewB.data, false, 'base');
    case 9: return lineArrayUnitCount(viewB.data, true, 'base');
    case 10: return lineArrayUnitCount(viewB.data, false, 'generator');
    case 11: return lineArrayUnitCount(viewB.data, true, 'generator');
    // ADR-100: one unit per PASS (HP, then VP), not one per chain-line dash — the axis is a
    // single line, and ADR-091's "one unit = one edge" convention means every other beat already
    // counts a whole edge as one unit regardless of how many pixels it spans. Chain-dash-counting
    // made beat 12 ~44 units (~13s) versus a handful for every other beat. Two more units are
    // added when the angle arc is eligible (methodArcEligible) — the datum+sweep, then the label
    // fade (see the arc's own reveal phases in drawMethodSheet's beat-12 block). No shipped
    // problem has a zero-length axis, but `set.ann.axis.length >= 6` is kept as the same
    // zero-units-for-nothing-to-draw guard the old `segUnitCount(...) * 2` gave for free.
    case 12: return (set.ann.axis.length >= 6 ? 2 : 0) + (methodArcEligible(set) ? 2 : 0);
    // ADR-102 — one unit per DIMENSION drawn (0/1/2: base edge in HP, overall height in VP,
    // either possibly absent — restrictedDims' own baseMM===null gate for curved-base solids,
    // or EXTENT_EPS in projectionDrawer.js for a degenerate zero-height solid), the same
    // "one unit per whole mark" convention beat 12 already established for the axis — not one
    // per line segment, which is the exact bug ADR-100 fixed there. Labels (drawMethodLabels)
    // have no reveal of their own and stay unaffected — this only adds units for the dims
    // drawMethodSheet's own beat-13 block folds in alongside them.
    case 13: return (set.data.hpDimLines.length ? 1 : 0) + (set.data.vpDimLines.length ? 1 : 0);
    default: return 0;
  }
}

/** Hard-stop for ALL THREE of Show Method's own animations — the beat stroke-in (ADR-091), the
 *  Set-to-Set tilt, and the Set-chip focus pan/zoom (ADR-102) — cancelling whichever is live and
 *  resetting reveal state so the next repaint draws methodAnimBeat's beat (if any) fully. The
 *  focus tween SNAPS to its target rather than freezing: a Set change (goNext/goBack call
 *  clearFocusChip → setFocus(null) BEFORE sim.method.setProgress, methodController.js) must not
 *  leave the sheet stranded mid-zoom on the Set being left. Single chokepoint, called from every
 *  path that should settle an in-flight animation instantly: setMethodProgress (Next/Back/skip),
 *  teardownShowMethod (Exit/Escape/reset), and startMethodTilt itself (a tilt first settles any
 *  in-flight beat reveal before it starts, and cancels a previous tilt if one was already live). */
function stopMethodBeatAnim() {
  methodAnimHandle?.cancel();
  methodAnimHandle = null;
  methodAnimBeat = -1;
  methodTiltHandle?.cancel();
  methodTiltHandle = null;
  methodTiltActive = false;
  methodGhost = null; // ADR-105: a cancelled-mid-flight tilt left this populated (harmless, since
                       // drawMethodView gates on methodTiltActive, but stale state worth clearing)
  stopMethodFocusAnim(true);
  if (methodAnimRafId !== null) {
    cancelAnimationFrame(methodAnimRafId);
    methodAnimRafId = null;
  }
  methodAnimLastT = 0;
}

function methodAnimFrame(now) {
  const delta = methodAnimLastT ? Math.min(now - methodAnimLastT, 64) : 16;
  methodAnimLastT = now;
  tickTweens(delta); // drives methodAnimHandle's/methodTiltHandle's/methodFocusHandle's onUpdate
                      // below — safe to share anim.js's `active` Set with the (paused) live pane:
                      // nothing else can be tweening right now.
  if (methodAnimBeat !== -1 || methodTiltActive || methodFocusActive) {
    methodAnimRafId = requestAnimationFrame(methodAnimFrame);
  } else {
    methodAnimRafId = null;
    methodAnimLastT = 0;
  }
}

/** Begin the sequential stroke-in for `set`'s `beatIndex` — one tween spanning the whole beat
 *  (0..totalUnits over totalUnits*METHOD_SEG_DURATION_MS, linear), so every unit gets an equal
 *  wall-clock slice; `easeDraw` then shapes EACH unit's own reveal (fast start, gentle settle) —
 *  the same curve setProjectionsVisible's draw-on already uses, reused here for the same
 *  "glides on and settles" read. No-ops (methodAnimBeat stays -1) when the beat has no lines to
 *  animate, so the caller never needs to check methodBeatUnitCount itself. Reduced motion is
 *  handled entirely by tween() itself (main.js CLAUDE.md / anim.js): it jumps straight to the end
 *  value, so this still resolves to a normal instant full-draw, no special-casing needed here. */
function startMethodBeatAnim(set, beatIndex) {
  const total = methodBeatUnitCount(set, beatIndex);
  if (total === 0) return;
  methodAnimBeat = beatIndex;
  methodAnimIndex = 0;
  methodAnimUnitT = 0;
  if (methodAnimRafId === null) {
    methodAnimLastT = 0;
    methodAnimRafId = requestAnimationFrame(methodAnimFrame);
  }
  methodAnimHandle = tween({
    from: 0,
    to: total,
    duration: total * METHOD_SEG_DURATION_MS,
    ease: (x) => x, // linear across units — easeDraw (below) shapes each unit's own reveal instead
    onUpdate: (v) => {
      const idx = Math.min(Math.floor(v), total - 1);
      methodAnimIndex = idx;
      const rawT = idx === total - 1 && v >= total ? 1 : v - idx;
      methodAnimUnitT = easeDraw(THREE.MathUtils.clamp(rawT, 0, 1));
      queueMethodRedraw();
    },
    onComplete: () => {
      methodAnimBeat = -1; // done — next repaint takes the normal, fully-drawn cumulative path
      queueMethodRedraw();
    },
  });
}

/** Play the Set-to-Set ghost: lift a faded copy of the previous Set's own true-shape view off the
 *  sheet, rotate+translate it, and land it on this Set's start position (drawMethodGhost does the
 *  per-frame work; this only solves the pose-independent facts once, see methodGhost's own
 *  header). No-ops with a `false` return when there is nothing eligible — mirrors beginShowMethod's
 *  own boolean-return, no-op-on-false shape, so methodController.js can treat this identically to
 *  sim.method.begin().
 *
 *  Two eligible transitions (ADR-104 + ADR-110), sharing this one entry point since only one can
 *  ever apply to a given Set (`methodStepIsXTilt` itself excludes the `turnDeg != null` case):
 *   - **turn** — the both-planes Set 3 (ADR-093's `turnDeg`, gated by `methodArcEligible`: the
 *     rigid-2D-motion claim only holds when Set 3's true-shape view is genuinely the top view).
 *   - **tilt** — ADR-110: any step whose ΔR is provably a pure world-X rotation (Set1→Set2 of the
 *     one-plane tier, or the both-planes tier's own Set1→Set2), riding the FRONT view instead. */
function startMethodTilt() {
  if (!methodActive) return false;
  const set = methodSets[methodSet];
  const prevSet = methodSets[methodSet - 1];
  if (!set || !prevSet) return false;
  const isTurn = set.turnDeg != null;
  const isTilt = !isTurn && methodStepIsXTilt(prevSet, set);
  if (!isTurn && !isTilt) return false;
  if (isTurn && !methodArcEligible(set)) return false;
  const axis3 = set?.ann?.axis;
  if ((axis3?.length ?? 0) < 6) return false;
  stopMethodBeatAnim(); // settles any in-flight beat reveal AND cancels a prior in-flight ghost —
                        // the exact ADR-091 cancel-and-snap contract, reused in both directions.

  // Which end of `ann.axis` is the turning pivot — beat 12's own screen rule ("lower on screen —
  // deterministic, no world guess") reduces to a raw world-coordinate comparison, no projection
  // call needed, since each flatten's canvas output is an affine function (with IDENTICAL
  // coefficients for both endpoints) of exactly one world coordinate: flattenHP's canvas-y
  // INCREASES with world-x (turn/top-view case); flattenVP's canvas-y DECREASES with world-y
  // (tilt/front-view case, ADR-110) — so "lower on screen" flips which raw comparison picks it.
  // Set 2 (or Set 1) shares this SAME array index as the destination Set — both Sets harvest from
  // one shared geometry with only pose differing, the same cross-Set assumption beat 6's projector
  // derivation already relies on for `ann.labels` (main.js, drawMethodSheet).
  const vertexIsFirst = isTurn
    ? axis3[0] >= axis3[axis3.length - 3]
    : axis3[1] <= axis3[axis3.length - 2];
  methodGhost = { fromIndex: methodSet - 1, vertexIsFirst, turnDeg: set.turnDeg, kind: isTurn ? 'turn' : 'tilt' };

  methodTiltMotionT = 0;
  methodTiltAlpha = 1;
  methodTiltActive = true;
  if (methodAnimRafId === null) {
    methodAnimLastT = 0;
    methodAnimRafId = requestAnimationFrame(methodAnimFrame);
  }
  if (isTurn) {
    announce(`Turning Set ${methodSet}'s top view ${Math.round(set.turnDeg)}° into Set ${methodSet + 1}'s position.`);
  } else {
    const deg = Math.round(Math.abs(set.eff.angleHP - prevSet.eff.angleHP));
    announce(`Tilting Set ${methodSet}'s front view ${deg}° into Set ${methodSet + 1}'s position.`);
  }
  methodTiltHandle = tween({
    from: 0,
    to: METHOD_TILT_TOTAL_MS,
    duration: METHOD_TILT_TOTAL_MS,
    ease: (x) => x, // linear in ms — the three phases below own their own easing/ramp
    onUpdate: (ms) => {
      if (ms < METHOD_TILT_DURATION_MS) {
        methodTiltMotionT = easeFold(ms / METHOD_TILT_DURATION_MS); // the "physical hinge" curve
        methodTiltAlpha = 1;                                         // the platform's other rotations use
      } else if (ms < METHOD_TILT_DURATION_MS + METHOD_TILT_HOLD_MS) {
        methodTiltMotionT = 1; // landed — the payoff frame where ghost and Set 3 coincide
        methodTiltAlpha = 1;
      } else {
        methodTiltMotionT = 1;
        methodTiltAlpha = 1 - (ms - METHOD_TILT_DURATION_MS - METHOD_TILT_HOLD_MS) / METHOD_TILT_FADE_MS;
      }
      queueMethodRedraw();
    },
    onComplete: () => {
      methodTiltActive = false;
      methodTiltHandle = null;
      methodGhost = null;
      queueMethodRedraw();
      announce(`Now at Set ${methodSet + 1} — ${set.label}.`);
    },
  });
  return true;
}

/** Coalesce Show Method repaints to one per animation frame — mirrors queueRedraw's shape but
 *  targets the takeover's own canvas. Plain requestAnimationFrame, NOT the sim's rAF loop, so it
 *  keeps working while window.simAPI.pause() has stopped animate() (ADR-085). */
let methodRedrawQueued = false;
function queueMethodRedraw() {
  if (methodRedrawQueued) return;
  methodRedrawQueued = true;
  requestAnimationFrame(() => {
    methodRedrawQueued = false;
    if (methodViewOpen) drawMethodView();
  });
}

let workbenchRail = null;
/** @type {Map<string, {parent: Element, next: Node|null}>} Each driver wrapper's original
 *  {parent, nextSibling}, captured the first time it is re-parented so exitWorkbench can
 *  restore it to its EXACT home slot — unlike the Points reference's single `#controls`
 *  dock, these 7 wrappers come home to THREE different Step panels (Step 1, Step 2, and
 *  Step 3 — ADR-161 moved the inclination pair `anglehp`/`anglevp` out of Step 2). */
const driverHomes = new Map();

/** The docked rail, created once and kept for the session. */
function ensureWorkbenchRail() {
  if (workbenchRail) return workbenchRail;
  workbenchRail = document.createElement('div');
  workbenchRail.id = 'workbench-rail';
  workbenchRail.setAttribute('role', 'group');
  workbenchRail.setAttribute('aria-label',
    'Geometry drivers. Shape, and the orientation/inclination mode toggles, stay in the steps panel.');
  document.body.appendChild(workbenchRail);
  return workbenchRail;
}

/** Collapse the wizard, split the viewport 50/50, and dock the 7 driver wrappers under
 *  both panes. Idempotent.
 *  ADR-085: previously took a `keepFlattened` param so Show Method could suspend the
 *  forced-unflatten below while opening Compare for its own sheet. Show Method no longer opens
 *  Compare at all (its own takeover, #method-view, is fully independent) — so this is
 *  unconditional again, restoring the ADR-037/080 invariant: entering the split ALWAYS shows
 *  the 3D pictorial in the left pane. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;

  // The split is a live 3D↔2D read, so the left pane must show the 3D pictorial — return
  // the scene to unfolded 3D (ADR-037 gives the flattened read to the 2D canvas instead).
  // The Step-6 flatten/unfold buttons live in #wizard, which is hidden for the whole split
  // (see CSS), so this is the only place a flattened sheet can be un-flattened here.
  // This bypasses the btnUnfold handler, so the stepper's own flatten latch is re-synced
  // explicitly — otherwise Step 6 still reads "Unfold to 3D" after the Compare round-trip
  // even though the engine is back in 3D.
  if (foldProgress > 0) {
    simController.unflatten();
    stepper?.setFlattened(false);
  }

  const rail = ensureWorkbenchRail();
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = document.querySelector(`[data-ctrl="${key}"]`);
    if (!wrap) continue;
    if (!driverHomes.has(key)) {
      driverHomes.set(key, { parent: wrap.parentElement, next: wrap.nextSibling });
    }
    rail.appendChild(wrap);
  }

  // Re-parent the drawing card out to <body> so the grid can place it as the right pane
  // (the card is a plain grid cell in the split — ADR-080 — not absolutely positioned,
  // but it still needs to leave #sim-viewport to become a body-level sibling).
  if (compareCard && compareCard.parentElement !== document.body) {
    document.body.appendChild(compareCard);
  }
  document.body.classList.add('compare-split');
  // The rail toggle always defaults to shown on entry — a prior collapse from an earlier
  // split visit must not carry over, and the button's own facets need the same reset.
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
}

/** Restore the floating layout: hand the 7 driver wrappers back to their captured home
 *  slots, re-nest the card in #sim-viewport, and let the stepper's existing per-step
 *  [hidden] (never touched while docked — #wizard is unreachable during the split) own
 *  their visibility again. Idempotent. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);

  // Card back inside the viewport, its normal-flow parent outside the split.
  if (compareCard && viewport && compareCard.parentElement !== viewport) {
    viewport.appendChild(compareCard);
  }

  for (const key of WORKBENCH_CONTROLS) {
    const wrap = workbenchRail?.querySelector(`[data-ctrl="${key}"]`);
    const home = driverHomes.get(key);
    if (wrap && home?.parent) home.parent.insertBefore(wrap, home.next);
  }
}

/** Re-measure the viewport AFTER a layout-changing reflow has actually been laid out
 *  (entering/leaving the split flips the body between a flex row and a CSS grid — a
 *  heavy reflow not committed by the first requestAnimationFrame). */
function remeasureAfterReflow() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    handleResize(viewport);
    if (compareOpen) drawCompare();
  }));
}

/** State-aware Compare chip: aria-pressed mirrors open/closed (the CSS fills the pill
 *  solid accent while pressed). */
function updateCompareChip() {
  compareChip?.setAttribute('aria-pressed', String(compareOpen));
}

/** Hide the chip until the lesson's 2D gate passes (showProjectionsFlag; ADR-162's
 *  revealViewsSequence defers the call that checks this to its onComplete, so the chip in
 *  practice waits for all three of Step 5's views, not merely this one flag), preserving
 *  the pedagogy that the 2D drawing is meaningless before it's actually complete. A closed
 *  gate also force-closes an open card (e.g. a reset mid-Compare). */
function syncCompareChipVisibility() {
  if (!compareChip) return;
  const ok = showProjectionsFlag;
  compareChip.hidden = !ok;
  if (!ok && compareOpen) compare.hide();
}

/** Single reset point for the Compare sheet's user-driven view state (ADR-054 pan + ADR-055
 *  zoom) — called on fresh open, dblclick recenter, and sim reset. ADR-085: Show Method no
 *  longer shares this state (it forked its own methodPanX/Y/methodZoom + resetMethodView), so
 *  this reverts to the plain ADR-054/055 pan+zoom reset it was before ADR-084. */
function resetCompareView() {
  comparePanX = 0;
  comparePanY = 0;
  compareZoom = 1;
}

// ============================================================================
// SHOW METHOD (ADR-084 pedagogy, ADR-085 container) — headless per-Set projection + the
// n-Set independent takeover sheet (#method-view/#method-canvas, drawMethodView).
//
// Set-1/2/3 are successive POSES of the SAME solid (never separate problems.js entries),
// projected headlessly: compose a stage matrix → buildEdgeMap (meshAnalyzer.js) →
// drawProjections (projectionDrawer.js, pure) → harvest to plain arrays → dispose the THREE
// result in the same tick. `activeProjection`/`currentMesh` — the live 3D pane — are never
// touched; every Set is built ONCE at method.begin() and re-read on every repaint/focus
// switch, so nothing is created or disposed again until the NEXT begin() (see the Verification
// section of the ADR-084 plan for why this is what keeps memory flat across repeated Set
// switches, rather than a disposal loop).
// ============================================================================

const ONE_SCALE = new THREE.Vector3(1, 1, 1);
const _methodScratch = new THREE.Object3D();
/** Effective-angle magnitude below which an axis counts as "not inclined" — same role as a
 *  dead-zone, not a precision guard (targets are authored in whole degrees). */
const ANGLE_EPS = 0.05;
/** Fixed generic beat template (ADR-087, overturns ADR-084's flat 7-beat version — see
 *  DECISIONS.md for the full "Method of Drawing.md" audit this replaces it with). Follows the
 *  textbook's actual draw sequence (outline → visible face → hidden face → visible generators →
 *  hidden generators, PER VIEW, axis genuinely LAST), not "whole view visible, then whole view
 *  hidden": 0 xy (sheet-wide, ADR-088) · 1 outline(A) · 2 visible face(A) · 3 hidden face(A) ·
 *  4 visible generators(A) · 5 hidden generators(A) · 6 projectors · 7 outline(B) · 8 visible
 *  face(B) · 9 hidden face(B) · 10 visible generators(B) · 11 hidden generators(B) · 12 axis
 *  (last, both views) · 13 labels. "View A" is whichever of HP/VP carries this Set's true shape
 *  (trueShapeForPlane), "view B" the other — same firstIsHP split as ADR-084. ADR-089 drops the
 *  trailing dimensions beat (14 → gone): Show Method is the construction walkthrough, and BIS
 *  dimensioning is a separate, already-existing concern the learner reaches via the live pane's
 *  own "Show dimensions" toggle — bundling it into the replay taught the wrong lesson (that
 *  dimensioning is part of *drawing method*). MUST match methodController.js's own duplicated
 *  BEAT_COUNT (that file's header explains why the duplication is deliberate) — the two
 *  constants move together or `goNext`'s beat-boundary math desyncs from the gates below. */
const METHOD_BEAT_COUNT = 14;

/** ADR-088 — Show Method's OWN side-view flag, always `false`, replacing the 5 call sites that
 *  used to read the LIVE `showSideViewFlag` inside `drawMethodSheet`/`setMethodFocus`. The side
 *  view is NOT removed from the sim: Step 5 still reveals it live on the 3D pane, and
 *  `drawCompare()`'s own (unrelated) uses of the live flag are untouched — only the Show Method
 *  REPLAY drops it, because ADR-087's beat budget can't afford a third view's worth of
 *  outline/face/generator beats per Set (would take 15 beats/Set to ~21). Named separately from
 *  `showSideViewFlag` rather than just inlining `false` at each site, so a future reversal is a
 *  one-line change instead of a 5-site grep. */
const METHOD_SHOW_SIDE_VIEW = false;

/** Which of HP/VP shows the TRUE angle for an axis inclined to that plane (standard drafting
 *  convention: inclination to HP reads true in the front/elevation view; inclination to VP
 *  reads true in the top/plan view). */
function trueShapeForPlane(plane) { return plane === 'HP' ? 'front' : 'top'; }

/** How many Sets a pose needs: 1 = simple (nothing to walk through, Show Method disabled),
 *  2 = one axis inclined, 3 = both. Applied uniformly to a loaded problem's effective angles
 *  OR free-explore's live dialled angles — so 'base'/'corner-edge' (no inclination) and
 *  'corner-edge' presets (yaw only, angleHP=angleVP=0) fall out of this test for free, with no
 *  hard-coded tier string check. */
function inclinationStageCount(eff) {
  const hp = Math.abs(eff.angleHP) > ANGLE_EPS;
  const vp = Math.abs(eff.angleVP) > ANGLE_EPS;
  if (hp && vp) return 3;
  if (hp || vp) return 2;
  return 1;
}

/**
 * Derive each Set's construction-pose plan for the CURRENTLY loaded solid: `{overrides, modes,
 * trueShape, label}` per Set, Set 1 always "simple position". Sets 2/3 resolve one inclination
 * axis at a time, per `order` (problems.js's optional `method.order`, defaulting HP-then-VP —
 * the audit found "the textbook doesn't follow one fixed order" for both-planes problems).
 *
 * Face-inclination poses (today's ENTIRE one-plane tier) don't decompose into partial per-axis
 * steps — their formula ties BOTH eff.angleHP/eff.angleVP to one target+alpha (main.js
 * computeEffectiveAngles). A 2-Set walkthrough doesn't need that decomposition: it goes
 * straight from simple position to the fully resolved live pose, which is already
 * textbook-correct for a single-axis problem. A both-planes pose driven by a face-inclination
 * mode (not present in today's problems.js data) falls back to the same "straight to the live
 * pose" shape for its remaining Sets rather than guessing a wrong partial decomposition.
 */
function planMethodStages(eff) {
  const n = inclinationStageCount(eff);
  if (n < 2) return [];

  const order = activeProblemRef?.method?.order || ['HP', 'VP'];
  const plans = [{
    overrides: { angleHP: 0, angleVP: 0 },
    modes: { faceInclinationHP: false, faceInclinationVP: false, orientToCorner: false },
    trueShape: 'top',
    // ADR-099: 'literal' specs pass their text straight through formatSetLabel — no angle to
    // measure at Simple position.
    labelSpec: { kind: 'literal', text: 'Simple position' },
  }];

  if (n === 2) {
    const axis = Math.abs(eff.angleHP) > ANGLE_EPS ? 'HP' : 'VP';
    plans.push({
      overrides: {},        // the full live shapeData — already the fully resolved pose
      modes: { ...modes },  // the full live mode set (may be face-inclination, orient, or manual)
      trueShape: trueShapeForPlane(axis),
      // ADR-099: the degree value is resolved in projectSet from the Set's MEASURED pose, not
      // baked in here from the raw slider — see formatSetLabel/axisInclinations (main.js).
      labelSpec: { kind: 'plane', plane: axis },
    });
    return plans;
  }

  // n === 3 (both-planes). Manual dual-angle decomposition — today's only both-planes data
  // shape (problems.js's both-planes tier never sets a face-inclination mode).
  const firstPlane = order[0] === 'VP' ? 'VP' : 'HP';
  const secondPlane = firstPlane === 'HP' ? 'VP' : 'HP';
  if (modes.faceInclinationHP || modes.faceInclinationVP) {
    // Defensive fallback (no current data exercises this): can't cleanly split a
    // face-inclination formula into a single resolved axis, so go straight to the live pose
    // for both remaining Sets rather than compute a wrong partial pose. Stays literal text
    // (ADR-099) — there is no clean single angle to measure and name here either.
    plans.push({ overrides: {}, modes: { ...modes }, trueShape: trueShapeForPlane(firstPlane), labelSpec: { kind: 'literal', text: `Axis inclined to the ${firstPlane}` } });
    plans.push({ overrides: {}, modes: { ...modes }, trueShape: trueShapeForPlane(secondPlane), labelSpec: { kind: 'literal', text: 'Axis inclined to both planes' } });
    return plans;
  }
  const firstAngle = firstPlane === 'HP' ? eff.angleHP : eff.angleVP;
  const secondAngle = secondPlane === 'HP' ? eff.angleHP : eff.angleVP;
  plans.push({
    overrides: firstPlane === 'HP' ? { angleHP: eff.angleHP, angleVP: 0 } : { angleHP: 0, angleVP: eff.angleVP },
    modes: { ...modes },
    trueShape: trueShapeForPlane(firstPlane),
    labelSpec: { kind: 'plane', plane: firstPlane },
  });
  plans.push({
    overrides: {},           // unused by projectSetPose when `sequential` is set (kept only so
                             // this plan shape still matches plans[0]/[1] for any future reader)
    modes: { ...modes },
    trueShape: trueShapeForPlane(secondPlane),
    labelSpec: { kind: 'both', firstPlane, secondPlane },
    // ADR-093: Set 3's pose is NOT the combined-Euler shortcut above (that's what `overrides: {}`
    // would trigger) — projectSetPose branches on this marker to a separate sequential "tip, then
    // turn" composition instead. See projectSequentialBothPlanesPose's own header for why.
    sequential: { firstPlane, firstAngle, secondAngle },
  });
  return plans;
}

/** Compose a headless stage's orientation + seating WITHOUT touching the live mesh, the live
 *  `modes` object, or `vpAxisInset` (computeSeating is the pure extraction from seatOnPlanes —
 *  see its own header for why the live solid's distVP slider floor must not be clobbered by a
 *  different pose's inset). Returns the effective angles (for labelling) and the resulting
 *  world matrix (shapeGroup carries no transform of its own, so this IS the equivalent of
 *  mesh.matrixWorld for a stage that was never actually built as a mesh). */
function projectSetPose(overrides, modeSet, sequential) {
  if (sequential) return projectSequentialBothPlanesPose(sequential, modeSet);
  const raw = { ...currentShapeData, ...overrides };
  const eff = computeEffectiveAngles(raw, modeSet);
  _methodScratch.rotation.order = 'ZXY';
  applyShapeTransform(_methodScratch, eff);
  const seat = computeSeating(currentMesh.geometry, _methodScratch.quaternion, eff);
  // _methodScratch is one shared scratch object reused by every Set (and, for a tilt between two
  // Sets, read back well after this call returns) — its quaternion must be CLONED before being
  // retained, or every retained "q" would alias the same object and end up holding whichever Set
  // was computed last.
  const q = _methodScratch.quaternion.clone();
  const m = new THREE.Matrix4().compose(new THREE.Vector3(seat.x, seat.y, 0), q, ONE_SCALE);
  return { eff, m, q, seat };
}

/** ADR-093 — Show Method's both-planes Set 3 ONLY. planMethodStages' combined-Euler shortcut
 *  (the `overrides: {}` branch above) computes Set 3 as ONE Euler from the ORIGINAL upright
 *  shape — iShape.js's order 'ZXY' applies the VP (Z) lean BEFORE the HP (X) tilt, so adding the
 *  second angle genuinely re-derives the pose from scratch rather than building on Set 2's own.
 *  The real textbook auxiliary-view technique never does that: it tips the solid to the first
 *  plane, THEN turns the already-tipped solid about the TRUE VERTICAL to bring it true to the
 *  second — "turning" is a yaw about world-up, not a second lean. This function reproduces that:
 *  Set 2's pose is built the normal way (same applyShapeTransform/iShape.js call everyone else
 *  uses, untouched, called here read-only), then yawed about world Y by the second angle.
 *
 *  Why this is provably right, not just visually close: a rotation about world Y can only ever
 *  mix a point's x/z — it leaves y (height) exactly alone, for every point, always. computeSeating
 *  re-seats off `minY`, which is likewise untouched by that same yaw. So every labeled vertex's
 *  final world-Y comes out bit-for-bit identical to Set 2's — which is exactly what keeps the new
 *  cross-Set derivation line (drawMethodSheet's merged "projectors" beat, ADR-092) flat for THIS
 *  transition, the same way Set 1→Set 2's line is trivially flat (a pure X-tilt never touches x).
 *
 *  Self-contained: reads currentShapeData/currentMesh.geometry like projectSetPose's own branch
 *  already does, but never touches iShape.js, computeEffectiveAngles, or the live solid's pose. */
function projectSequentialBothPlanesPose(sequential, modeSet) {
  const { firstPlane, firstAngle, secondAngle } = sequential;
  const raw1 = {
    ...currentShapeData,
    angleHP: firstPlane === 'HP' ? firstAngle : 0,
    angleVP: firstPlane === 'VP' ? firstAngle : 0,
  };
  const eff1 = computeEffectiveAngles(raw1, modeSet);
  _methodScratch.rotation.order = 'ZXY';
  applyShapeTransform(_methodScratch, eff1);          // Set 2's own pose, verbatim, reused
  const q1 = _methodScratch.quaternion.clone();
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -secondAngle * DEG2RAD);
  const q = yaw.multiply(q1);                         // second tilt applied ON TOP, world frame
  const seat = computeSeating(currentMesh.geometry, q, eff1);
  const m = new THREE.Matrix4().compose(new THREE.Vector3(seat.x, seat.y, 0), q, ONE_SCALE);
  return { eff: eff1, m, q, seat };
}

/** Copy every LineSegments2 child's instanceStart/instanceEnd endpoints into a plain array —
 *  the harvested shape drawMethodSheet strokes from after the live THREE result is disposed.
 *  ADR-087: also copies `userData.kind` ('base' | 'generator' | 'outline' | undefined) through
 *  beside the existing `hidden` tag — this is the ONE chokepoint where THREE.js userData crosses
 *  into the harvested plain-array shape strokeMethodLines filters on. */
function harvestLineGroup(group) {
  const lines = [];
  if (!group) return lines;
  for (const child of group.children) {
    if (!child.isLineSegments2) continue;
    const start = child.geometry.attributes.instanceStart;
    const end = child.geometry.attributes.instanceEnd;
    if (!start || !end) continue;
    const pts = [];
    for (let i = 0; i < start.count; i++) {
      pts.push(start.getX(i), start.getY(i), start.getZ(i), end.getX(i), end.getY(i), end.getZ(i));
    }
    lines.push({ pts, hidden: !!child.userData.hidden, kind: child.userData.kind });
  }
  return lines;
}

/** Copy every triangle-soup Mesh child's position attribute into a flat [x,y,z,x,y,z,…] array
 *  (3 verts / 9 floats per triangle, world space) — the harvested shape a drawn-array fill reads
 *  after the live THREE result is disposed. Mirrors harvestLineGroup's own shape-preserving copy
 *  for the dimension layer's filled 3:1 arrowheads (ADR-041's buildArrowMesh, ADR-102 restores
 *  this harvest — ADR-089 deleted it along with the dimensions beat it fed). LineSegments2 also
 *  reports isMesh=true (r160 gotcha, same one drawCompare's fillArrowMesh works around) so it
 *  must be excluded even though nothing here currently shares a group with one. */
function harvestTriGroup(group) {
  const tris = [];
  if (!group) return tris;
  for (const child of group.children) {
    if (!child.isMesh || child.isLineSegments2) continue;
    const pos = child.geometry?.attributes?.position;
    if (!pos) continue;
    for (let i = 0; i < pos.count; i++) tris.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  return tris;
}

/** Copy every CSS2DObject child's world position + live text into the plain `[{text,x,y,z}]`
 *  shape drawMethodLabels already consumes (it was written for vertexLabeler's corner labels,
 *  but the shape is identical for the dimension layer's numeric labels — ADR-102 reuses it
 *  rather than writing a second drawing function). ADR-089 deleted this harvest; ADR-102 restores
 *  it for the restricted dimension layer only (see projectSet's own restrictedDims comment). */
function harvestLabelGroup(group) {
  const labels = [];
  if (!group) return labels;
  for (const child of group.children) {
    if (!child.isCSS2DObject) continue;
    const text = child.element?.textContent;
    if (!text) continue;
    labels.push({ text, x: child.position.x, y: child.position.y, z: child.position.z });
  }
  return labels;
}

/** Corner labels (A, B, C…, O, P) + the axis chain line, planned in vertexLabeler.js's
 *  planAnnotations (LOCAL space, pure) and carried to WORLD space by the stage matrix `m` —
 *  the two new beats the audit found absent from both flat surfaces (vertexLabeler.js only
 *  ever annotates the upright 3D solid, and fades OUT on fold). */
function harvestAnnotations(m) {
  const { labels, axis } = planAnnotations(currentMesh.geometry);
  const worldOf = (local) => local.clone().applyMatrix4(m);
  const worldLabels = labels.map(({ local, text }) => {
    const w = worldOf(local);
    return { text, x: w.x, y: w.y, z: w.z };
  });
  const axisSegs = chainPositions(worldOf(axis.bottom), worldOf(axis.top));
  return { labels: worldLabels, axis: axisSegs };
}

/** ADR-099 — the axis' TRUE angle to each reference plane, measured from its actual world
 *  direction rather than read off a slider. Exact and view-independent: asin of the direction
 *  cosine against each plane's normal (HP: +Y, VP: +X) — unlike a Set's caption/arc, which is
 *  only a TRUE angle in the one view where the axis happens to be parallel to the OTHER plane. */
function axisInclinations(dir) {
  return {
    toHP: Math.asin(Math.min(1, Math.abs(dir.y))) * RAD2DEG,
    toVP: Math.asin(Math.min(1, Math.abs(dir.x))) * RAD2DEG,
  };
}

/** ADR-099 — Set caption text, built from the Set's MEASURED inclination (axisInclinations)
 *  rather than the raw angleHP/angleVP slider values planMethodStages used to bake in directly.
 *  `spec` is planMethodStages' declarative description of which plane(s) this Set's caption
 *  names — resolving the actual degree values here (once the Set's real pose is known) is what
 *  keeps the caption from ever disagreeing with the arc drawn on the same Set (both read the
 *  same `incl`). See DECISIONS.md ADR-099 for why this replaced baked-in slider values. */
function formatSetLabel(spec, incl) {
  if (spec.kind === 'literal') return spec.text;
  const degFor = (plane) => (plane === 'HP' ? incl.toHP : incl.toVP);
  if (spec.kind === 'plane') return `Axis ${Math.round(degFor(spec.plane))}° to the ${spec.plane}`;
  return `Axis ${Math.round(degFor(spec.firstPlane))}° to the ${spec.firstPlane} and ${Math.round(degFor(spec.secondPlane))}° to the ${spec.secondPlane}`;
}

/** Build one Set's complete drawable data for a stage plan. No mesh, no geometry allocation:
 *  every stage shares currentMesh.geometry (overrides never touch shape/baseLength/height).
 *  The only THREE objects created are drawProjections' own result, harvested to plain arrays
 *  and disposed in this SAME tick — same disposal contract as refreshProjections(), just
 *  without ever parenting the result into the scene.
 * @param {number} setIndex 0-based Set number within this problem's plan (ADR-103) — the
 *  restricted dimension layer is Set-1-only (`setIndex === 0`), matching the textbook (John,
 *  Figs 12.21/12.23/12.24/12.25): size dimensions are printed once, in the simple-position Set,
 *  never repeated on the inclined Sets (which instead carry the beat-12 angle arc). */
function projectSet(plan, setIndex) {
  const { eff, m } = projectSetPose(plan.overrides, plan.modes, plan.sequential);
  const box = new THREE.Box3().setFromBufferAttribute(currentMesh.geometry.getAttribute('position'));
  box.applyMatrix4(m); // mirrors rebuild()'s own `new THREE.Box3().setFromObject(mesh)` (main.js)
  const z0 = box.min.z - PP_MARGIN; // per-Set standoff — NEVER read the live ppHingeGroup (ADR-084)
  const { width, height } = viewportSize();
  const edgeMap = buildEdgeMap(currentMesh.geometry, m);
  // ADR-087: this stage's own world-space axis (local +Y rotated by the STAGE's pose, not the
  // live mesh's) — same `transformDirection` reasoning as refreshProjections' worldAxis, against
  // the headless matrix `m` instead of a live matrixWorld. Drives the base/generator split for
  // this Set specifically (a Set's pose differs from the live mesh's, so its axis direction does
  // too — reading the live mesh's axis here would misclassify every stage but the live one, the
  // same trap z0/dimensions already avoid per ADR-084).
  const axis = new THREE.Vector3(0, 1, 0).transformDirection(m);
  // ADR-103 (amends ADR-102 Decision 3): Show Method's OWN restricted dimension layer — overall
  // height + the true base-edge length ONLY, never the live pane's 5 bbox-extent dims (untouched
  // — this option only exists on THIS call) — and SET-1 ONLY. John's own worked examples (Figs
  // 12.21/12.23/12.24/12.25) print size dimensions exactly once, on the simple-position Set;
  // Sets 2/3 carry the beat-12 angle arc instead, never a repeated size dimension. Values are
  // read straight off currentShapeData rather than measured off this Set's own geometry — every
  // Set shares one geometry (only pose differs, see the pose/eff comment below), so the true
  // edge length and true height are Set-invariant. `baseMM` is null for Cone/Cylinder — no
  // polygon base edge exists to measure (baseLength is a diameter for those two; see
  // shapeData.js's own doc comment).
  const restrictedDims = setIndex === 0 ? {
    heightMM: currentShapeData.height * WORLD_TO_MM,
    baseMM: (currentShapeData.shape === ShapeType.Cone || currentShapeData.shape === ShapeType.Cylinder)
      ? null
      : currentShapeData.baseLength * WORLD_TO_MM,
  } : null;
  // ADR-103: Sets 2/3 pass `drawDimensions: false` (not just `restrictedDims: null`) —
  // `restrictedDims: null` alone is indistinguishable, inside drawProjections, from the live
  // pane's own call (which ALSO never passes restrictedDims and so also defaults to null),
  // so it fell through to the bbox 5-dim `else` branch instead of drawing nothing. Sets 2/3
  // must draw NO size dimension at all — the textbook prints these once, on Set 1 (John, Figs
  // 12.21/12.23/12.24/12.25); the inclined Sets carry the beat-12 angle arc instead.
  const res = drawProjections(edgeMap, { width, height, z0, axis, restrictedDims, drawDimensions: setIndex === 0 });
  const data = {
    hp: harvestLineGroup(res.hpGroup),
    vp: harvestLineGroup(res.vpGroup),
    pp: harvestLineGroup(res.ppGroup), // ADR-088: side view dropped from the replay; left harmless
    hpOutline: harvestLineGroup(res.hpOutlineGroup),
    vpOutline: harvestLineGroup(res.vpOutlineGroup),
    // ADR-102 restores the hpDim*/vpDim* harvest ADR-089 deleted — restricted to the two dims
    // `restrictedDims` above requested, folded into beat 13 (labels) by drawMethodSheet, not a
    // beat of its own (no METHOD_BEAT_COUNT change — see main.js's own comment on that constant).
    hpDimLines: harvestLineGroup(res.hpDimensionGroup),
    vpDimLines: harvestLineGroup(res.vpDimensionGroup),
    hpDimTris: harvestTriGroup(res.hpDimensionGroup),
    vpDimTris: harvestTriGroup(res.vpDimensionGroup),
    hpDimLabels: harvestLabelGroup(res.hpDimensionGroup),
    vpDimLabels: harvestLabelGroup(res.vpDimensionGroup),
  };
  res.dispose(); // WebGL buffers + CSS2D DOM nodes gone before this function returns
  const ann = harvestAnnotations(m);
  // ADR-099: MEASURED off this Set's own resolved pose, not the raw angleHP/angleVP slider
  // values planMethodStages used to bake into `label` directly — reuses the `axis` unit vector
  // already computed above (ADR-087) rather than re-deriving a direction from `ann`.
  const incl = axisInclinations(axis);
  const label = formatSetLabel(plan.labelSpec, incl);
  const set = {
    label, trueShape: plan.trueShape, eff, z0, data, ann, axisDir: axis, incl,
    labelSpec: plan.labelSpec,
    // ADR-099: the exact TURN this Set applies (projectSequentialBothPlanesPose's own yaw
    // magnitude, not a re-measurement) — for the both-planes Set 3 only. Distinct from `incl`:
    // `incl.toVP` is the axis' true 3-D angle to the VP, which is NOT the same number as the
    // yaw applied to get there (a yawed-then-tilted axis reads a different 3-D VP angle than
    // the yaw itself). This is what the top-view turn arc actually sweeps.
    turnDeg: plan.sequential ? plan.sequential.secondAngle : null,
  };
  set.contentBeats = methodContentBeats(set);
  return set;
}

/** ADR-095 — sheet-local flattens used ONLY for the mark-novelty comparison below; the same
 *  affine map drawMethodSheet's own flattenHP/flattenVP apply, minus the per-Set `dx` and the
 *  projectSheet transform (both affine and identical for every beat of a Set, so neither can
 *  change whether two segments coincide on screen). */
function methodFlattenHP(x, y, z) { return { u: -z, v: -x }; }
function methodFlattenVP(x, y, z) { return { u: -z, v: y }; }
function methodQuantize(v) { return Math.round(v / 1e-3); } // same weld tolerance meshAnalyzer.js uses

/** One key per non-degenerate flattened segment: order-normalized (A→B === B→A, so a segment
 *  drawn from either end still dedupes) and plane-prefixed (HP and VP both flatten `u = -z`,
 *  so an unprefixed key would false-match a top-view line against a coincidentally-aligned
 *  front-view one). A segment whose two endpoints quantize to the same point is degenerate —
 *  it flattens to nothing (e.g. a vertical generator viewed from directly above) and
 *  contributes no key, matching what strokeMethodLines actually paints (a zero-length moveTo/
 *  lineTo). Filters mirror strokeMethodLines' own `onlyHidden`/`onlyKind` exactly. */
function methodSegmentKeys(plane, flattenFn, arr, onlyHidden, onlyKind) {
  const keys = [];
  for (const seg of arr) {
    if (onlyHidden !== undefined && seg.hidden !== onlyHidden) continue;
    if (onlyKind !== undefined && seg.kind !== onlyKind) continue;
    for (let k = 0; k + 5 < seg.pts.length; k += 6) {
      const a = flattenFn(seg.pts[k], seg.pts[k + 1], seg.pts[k + 2]);
      const b = flattenFn(seg.pts[k + 3], seg.pts[k + 4], seg.pts[k + 5]);
      const ax = methodQuantize(a.u), ay = methodQuantize(a.v);
      const bx = methodQuantize(b.u), by = methodQuantize(b.v);
      if (ax === bx && ay === by) continue; // degenerate — collapses to a point, draws nothing
      const p1 = `${ax},${ay}`, p2 = `${bx},${by}`;
      keys.push(`${plane}:${p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`}`);
    }
  }
  return keys;
}

/** ADR-090/-095 — per-Set, per-beat "does this beat actually add a NEW mark to the sheet"
 *  table, computed once at begin() from the same harvested `data`/`ann` drawMethodSheet itself
 *  reads, so it can never drift from what actually gets drawn. ADR-090's original test asked
 *  only "is this beat's own array non-empty" — too weak: a beat can be non-empty and still
 *  redraw exactly what an earlier beat already put on the sheet (Set 1, no inclination — the
 *  top view's outline beat and visible-face beat trace the identical hexagon; a prism's
 *  vertical generators flatten to points in that same top view). ADR-087's overlap between the
 *  outline beat and later visible-face/generator beats is DELIBERATE and still draws in full
 *  when shown (nothing here changes what strokeMethodLines paints) — this table only decides
 *  whether Next spends a click-stop on a beat that would look identical to the one before it.
 *  Index 0 (the Set's caption reveal) is always true. Beats 6 (projectors) and 13 (labels) are
 *  never deduped — dashed construction lines and text marks respectively, neither ever
 *  coincides meaningfully with view geometry. Beat 12 (axis) is never deduped against view
 *  geometry either — a different colour/dash reads as a genuinely new mark even where it runs
 *  collinear with a generator — but still goes `false` when truly degenerate (an upright axis
 *  collapsing to a point in top view), so it doesn't reproduce the exact defect this exists to
 *  fix at the one beat drawn last. */
function methodContentBeats(set) {
  const { firstIsHP, viewA, viewB } = methodViewSplit(set);
  const planeA = firstIsHP ? 'HP' : 'VP';
  const planeB = firstIsHP ? 'VP' : 'HP';
  const flattenA = firstIsHP ? methodFlattenHP : methodFlattenVP;
  const flattenB = firstIsHP ? methodFlattenVP : methodFlattenHP;
  const hasLabels = set.ann.labels.length > 0;

  const seen = new Set();
  const markNovel = (keys) => {
    let novel = false;
    for (const k of keys) {
      if (!seen.has(k)) novel = true;
      seen.add(k);
    }
    return novel;
  };

  const beats = new Array(14).fill(false);
  beats[0] = true; // caption reveal

  beats[1] = markNovel(methodSegmentKeys(planeA, flattenA, viewA.outline, undefined, undefined));
  beats[2] = markNovel(methodSegmentKeys(planeA, flattenA, viewA.data, false, 'base'));
  beats[3] = markNovel(methodSegmentKeys(planeA, flattenA, viewA.data, true, 'base'));
  beats[4] = markNovel(methodSegmentKeys(planeA, flattenA, viewA.data, false, 'generator'));
  beats[5] = markNovel(methodSegmentKeys(planeA, flattenA, viewA.data, true, 'generator'));

  beats[6] = hasLabels; // projectors — dashed construction lines, never deduped

  beats[7] = markNovel(methodSegmentKeys(planeB, flattenB, viewB.outline, undefined, undefined));
  beats[8] = markNovel(methodSegmentKeys(planeB, flattenB, viewB.data, false, 'base'));
  beats[9] = markNovel(methodSegmentKeys(planeB, flattenB, viewB.data, true, 'base'));
  beats[10] = markNovel(methodSegmentKeys(planeB, flattenB, viewB.data, false, 'generator'));
  beats[11] = markNovel(methodSegmentKeys(planeB, flattenB, viewB.data, true, 'generator'));

  // Beat 12 — axis: true iff at least one segment is non-degenerate in HP OR VP (the axis
  // draws into both flattens — strokeAxisInto's two passes — so it only reads as a genuine
  // no-op when BOTH collapse to points).
  let hasAxisMark = false;
  for (let k = 0; k + 5 < set.ann.axis.length; k += 6) {
    const aHP = methodFlattenHP(set.ann.axis[k], set.ann.axis[k + 1], set.ann.axis[k + 2]);
    const bHP = methodFlattenHP(set.ann.axis[k + 3], set.ann.axis[k + 4], set.ann.axis[k + 5]);
    const aVP = methodFlattenVP(set.ann.axis[k], set.ann.axis[k + 1], set.ann.axis[k + 2]);
    const bVP = methodFlattenVP(set.ann.axis[k + 3], set.ann.axis[k + 4], set.ann.axis[k + 5]);
    const degenHP = methodQuantize(aHP.u) === methodQuantize(bHP.u) && methodQuantize(aHP.v) === methodQuantize(bHP.v);
    const degenVP = methodQuantize(aVP.u) === methodQuantize(bVP.u) && methodQuantize(aVP.v) === methodQuantize(bVP.v);
    if (!degenHP || !degenVP) { hasAxisMark = true; break; }
  }
  beats[12] = hasAxisMark;

  beats[13] = hasLabels; // vertex labels — text marks, never deduped

  return beats;
}

/** ADR-094 — plain-English name for a plane in a walkthrough caption: HP is always "top view",
 *  VP always "front view" (the PP/"side view" never appears here, ADR-088). */
function planeViewWord(plane) { return plane === 'HP' ? 'top' : 'front'; }

/** ADR-094 — per-beat caption audit found "Next sometimes does nothing" wasn't the only gap:
 *  a learner landing on any of the 14 beats had no words for what just appeared, only the Set's
 *  own caption (painted once, beat 0) and mute Back/Next/Skip buttons. This is deliberately NOT
 *  the numeric counter ADR-089 removed — no position, no total, just what the beat drew — read
 *  by methodController.js's syncCaption() into `#method-caption` (ADR-095: a top-title row,
 *  clear of the canvas' own Set caption — the two must never repeat each other, so beat 0
 *  reads "Starting Set N" here rather than the canvas' "Set N — <label>") and the existing
 *  `#sim-status` announce channel. Reuses `methodContentBeats`' own `firstIsHP` split (same
 *  `set.trueShape !== 'front'` test) so view-A/view-B always name the same plane here as the
 *  content-gate does. */
function methodBeatLabel(set, beat) {
  const s = methodSets[set];
  if (!s) return '';
  // ADR-095: NOT the Set caption verbatim (that text lives on the canvas, under the block,
  // beat 0's own reveal target) — the top-title row and the canvas caption must never repeat
  // each other.
  if (beat === 0) return `Starting Set ${set + 1}`;
  const firstIsHP = s.trueShape !== 'front';
  const wordA = planeViewWord(firstIsHP ? 'HP' : 'VP');
  const wordB = planeViewWord(firstIsHP ? 'VP' : 'HP');
  switch (beat) {
    // ADR-099: Sets 2+ name WHY this view is drawn first — it's the trueShape view, the one
    // that shows the newly-introduced angle without foreshortening (see `methodArcEligible`'s
    // reasoning for the same fact, used there to place the angle arc). Set 1 has no new angle
    // yet, so its caption stays the plain original.
    case 1: return set > 0
      ? `Outline of the ${wordA} view — drawn first because it shows the new angle true`
      : `Outline of the ${wordA} view`;
    case 2: return `Visible face lines — ${wordA} view`;
    case 3: return `Hidden face lines — ${wordA} view`;
    case 4: return `Visible generators — ${wordA} view`;
    case 5: return `Hidden generators — ${wordA} view`;
    case 6: {
      // ADR-099: Sets 2+ name what this beat's cross-Set derivation line actually carries —
      // the previous Set's untouched view (wordB, same plane, same block row), unchanged in
      // exactly the coordinate its own line holds constant (see drawMethodSheet's beat-6
      // `prevFlattenUntouched` — heights for a carried front view, depths for a carried top
      // view). `set` is this Set's 0-based index, which is also the previous Set's 1-based
      // number (Set 2 is index 1, its predecessor is "Set 1").
      if (set === 0) return 'Projectors linking the two views';
      const carriedWord = firstIsHP ? 'heights' : 'depths';
      return `Projectors — and Set ${set}'s ${wordB} view carried across, ${carriedWord} unchanged`;
    }
    case 7: return `Outline of the ${wordB} view`;
    case 8: return `Visible face lines — ${wordB} view`;
    case 9: return `Hidden face lines — ${wordB} view`;
    case 10: return `Visible generators — ${wordB} view`;
    case 11: return `Hidden generators — ${wordB} view`;
    case 12: {
      // ADR-099: names the arc drawMethodSheet draws in the same beat — 'plane'-kind Sets get
      // the measured inclination, 'both'-kind Sets (both-planes Set 3) get the measured turn
      // (only when firstIsHP — see `methodArcEligible` for why the arc itself skips a VP-first
      // order here, and this caption stays generic to match).
      const spec = s.labelSpec;
      if (spec?.kind === 'plane') {
        const deg = Math.round(spec.plane === 'HP' ? s.incl.toHP : s.incl.toVP);
        return `Axis of the solid — ${deg}° to the ${spec.plane}`;
      }
      if (spec?.kind === 'both' && firstIsHP && s.turnDeg != null) {
        return `Axis of the solid — turned ${Math.round(s.turnDeg)}° in the top view`;
      }
      return 'Axis of the solid';
    }
    case 13: {
      // ADR-102 — names the restricted dims drawMethodSheet's own beat-13 block folds in
      // alongside the vertex labels this beat already drew (never a beat of its own).
      const dims = [];
      if (s.data.hpDimLines.length) dims.push('base edge');
      if (s.data.vpDimLines.length) dims.push('overall height');
      return dims.length ? `Vertex labels and dimensions — ${dims.join(' and ')}` : 'Vertex labels';
    }
    default: return '';
  }
}

/** Whether Show Method may start right now: a solid exists, the sheet is fully flattened
 *  (foldProgress === 1 — the engine-level signal stepper.js's state.flattened mirrors), and
 *  the live/loaded pose actually has an axis to resolve (excludes 'base'/'corner-edge'). */
function methodCanRun() {
  if (!currentShapeData || !currentMesh || foldProgress !== 1) return false;
  return inclinationStageCount(computeEffectiveAngles(currentShapeData)) >= 2;
}

/** ADR-085: opens Show Method's own full-viewport takeover (#method-view), independent of
 *  Compare — no split, no workbench rail, Step 1/2's sliders stay covered + focus-trapped by
 *  methodController.js's own trap. The sim loop is paused for the duration (matches the
 *  #problem-library contract: the 3D scene is fully covered, so rendering it is wasted GPU) —
 *  which also means no anim.js tween may run in this view (tick() rides the paused rAF loop);
 *  Set-focus (setMethodFocus) is an instant snap for exactly this reason. */
function beginShowMethod() {
  if (methodActive || !methodCanRun()) return false;
  const plans = planMethodStages(computeEffectiveAngles(currentShapeData));
  if (plans.length < 2) return false;
  stopMethodBeatAnim(); // defensive — a prior session should have already torn this down
  methodSets = plans.map((plan, i) => projectSet(plan, i));
  methodActive = true;
  methodSet = 0;
  methodBeat = 0;
  resetMethodView();
  if (methodViewEl) methodViewEl.hidden = false;
  methodViewOpen = true;
  window.simAPI?.pause(); // ADR-085 — matches .problem-library; scene is fully covered
  // A freshly un-hidden `position:fixed` element has no committed layout rect on frame 1 (same
  // reasoning as remeasureAfterReflow's double-rAF) — wait two frames before the first paint.
  requestAnimationFrame(() => requestAnimationFrame(queueMethodRedraw));
  return true;
}

/** Shared teardown for a normal finish (end), an Exit-button/Escape close, and a mid-method edit
 *  (abort) — the only difference between the paths is the flowNote wording methodController.js
 *  shows, not this engine-side behaviour. ADR-085: synchronous now — the takeover always draws
 *  all of its Sets at once (no 1-wide↔n-wide morph to collapse first), so there is nothing to
 *  tween through before tearing down. Does NOT call resetCompareView() or unflatten(): Show
 *  Method no longer touches Compare's state or the fold at all post-ADR-085. */
function teardownShowMethod() {
  if (!methodActive) return;
  stopMethodBeatAnim();
  methodActive = false;
  methodSets = [];
  methodGhost = null;
  methodSet = 0;
  methodBeat = 0;
  methodViewOpen = false;
  if (methodViewEl) methodViewEl.hidden = true;
  window.simAPI?.resume();
  resetMethodView();
  // The moment methodActive actually flips false — whether this teardown was reached via end()
  // (methodController's own Exit/Escape/Next-when-done, which already re-syncs itself right
  // after calling sim.method.end()) or abort() (stepper.js, which does NOT re-sync) — is exactly
  // when methodController's sync() needs to run to catch an abort-driven teardown. Calling it
  // unconditionally here is a harmless extra call on the end() path (sync() is idempotent) and
  // the ONLY correct trigger on the abort() path.
  methodController?.sync();
}

function endShowMethod() { teardownShowMethod(); }
function abortShowMethod() { teardownShowMethod(); }

function setMethodProgress(set, beat) {
  if (!methodActive || methodSets.length === 0) return;
  const prevFlat = methodSet * METHOD_BEAT_COUNT + methodBeat;
  // ADR-091: whatever beat was mid-reveal snaps to fully-drawn before the new position takes
  // effect — this is the "Next mid-animation" half of the contract, and it is a harmless no-op
  // when nothing was animating (Back, a skip, or a fresh Next after the prior beat finished).
  stopMethodBeatAnim();
  methodSet = Math.min(Math.max(set, 0), methodSets.length - 1);
  methodBeat = Math.min(Math.max(beat, 0), METHOD_BEAT_COUNT - 1);
  const newFlat = methodSet * METHOD_BEAT_COUNT + methodBeat;
  // Only a genuine forward step (Next) animates in — Back/skip/focus jumps land on the fully-drawn
  // state instantly, matching how those already behaved before this change.
  if (newFlat > prevFlat) startMethodBeatAnim(methodSets[methodSet], methodBeat);
  queueMethodRedraw();
}

/** Reserve below the fitted band, in px: .method-controls' 24px (--space-5) bottom offset + the
 *  pill's ~52px rendered height + 8px visual clearance. Re-verify against the pill's live rect
 *  if either changes. */
const METHOD_PILL_RESERVE_PX = 84;
/** One caption line's box — captionFont is `12px --font-sans`, textBaseline 'top'. */
const METHOD_CAPTION_LINE_PX = 16;

/** Single source of Show Method's intrinsic sheet layout — was hand-duplicated between
 *  drawMethodSheet and setMethodFocus (ADR-095), which is exactly how the two drifted out of
 *  sync and let Set 2's caption (the one horizontally centred under .method-controls, since
 *  .method-controls itself is `left:50%`) overlap the pill: the old fit only measured `blockH`
 *  and left the caption's `captionY = -(blockH/2 + GAP*0.4)` offset to a flat marginBottomPx
 *  guess. Folding `capGapS` into `nomHmm`/`anchorSY` here means BOTH call sites now fit the
 *  block+caption band together, not the block alone — fixed once, for both. */
function methodSheetLayout(w, h) {
  const E = Math.max(solidSpanUnits, 1e-3);
  const GAP = E * 0.35;
  const STAGE_GAP = GAP;
  const blockW = E + (METHOD_SHOW_SIDE_VIEW ? GAP + E : 0);
  const blockH = E + GAP + E;
  const capGapS = GAP * 0.4; // SAME offset drawMethodSheet's captionY uses — single source now
  const n = methodSets.length || 1; // always the actual Set count (2 or 3) — no 1-wide state post-ADR-085
  const marginPx = 40; // horizontal only — the block row is centred left-right
  const marginTopPx = 40;
  const marginBottomPx = METHOD_PILL_RESERVE_PX + METHOD_CAPTION_LINE_PX; // 100
  const nomWmm = (n * blockW + (n - 1) * STAGE_GAP) * WORLD_TO_MM;
  const nomHmm = (blockH + capGapS) * WORLD_TO_MM; // caption offset now INSIDE the fit
  const scale = Math.min((w - 2 * marginPx) / nomWmm, (h - marginTopPx - marginBottomPx) / nomHmm);
  const blockLocalCenterX = METHOD_SHOW_SIDE_VIEW ? (E + GAP) / 2 : 0;
  const anchorSX = blockLocalCenterX + (n - 1) * (blockW + STAGE_GAP) / 2;
  const anchorSY = -capGapS / 2; // centre the block+caption band, not the block alone
  return {
    E, GAP, STAGE_GAP, blockW, blockH, capGapS, n, marginPx, marginTopPx, marginBottomPx,
    nomWmm, nomHmm, scale, blockLocalCenterX, anchorSX, anchorSY,
    cx: w / 2, cy: marginTopPx + (h - marginTopPx - marginBottomPx) / 2,
  };
}

/** Set-N focus (ADR-084 audit round 2, Decision 6/7; ADR-102 supersedes ADR-085's "instant snap,
 *  no tween" clause — see startMethodFocusAnim below): visual pan/zoom only, never touches
 *  methodSet/methodBeat. Target is the Set's INTRINSIC block centre (methodSheetLayout — same
 *  E/GAP/showSideViewFlag inputs `scale`/`anchorSX` themselves use), never a live bbox of what
 *  that Set has actually drawn so far, which is exactly what keeps this from reopening the
 *  live-bbox coupling ADR-053 removed. Inverts drawMethodSheet's own project() formula for the
 *  block centre. */
function setMethodFocus(i) {
  if (!methodActive) return;
  focusSet = (i === null || i === undefined) ? null : Math.min(Math.max(i, 0), methodSets.length - 1);

  const stage = methodCanvas?.parentElement;
  const w = stage?.clientWidth || 0;
  const h = stage?.clientHeight || 0;
  if (!w || !h) return;

  const L = methodSheetLayout(w, h);

  let targetSX;
  let targetZoom;
  if (focusSet === null) {
    targetSX = L.anchorSX;
    targetZoom = 1;
  } else {
    targetSX = L.blockLocalCenterX + focusSet * (L.blockW + L.STAGE_GAP);
    const zFitW = (w - 2 * L.marginPx) / (L.blockW * WORLD_TO_MM * L.scale);
    // Divides by (blockH + capGapS), not blockH alone — a focused Set must clear the caption
    // exactly like the unfocused row does, or focusing re-introduces the overlap this fixes.
    const zFitH = (h - L.marginTopPx - L.marginBottomPx) / ((L.blockH + L.capGapS) * WORLD_TO_MM * L.scale);
    targetZoom = Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, Math.min(zFitW, zFitH)));
  }
  startMethodFocusAnim(
    -(targetSX - L.anchorSX) * WORLD_TO_MM * L.scale * targetZoom,
    0, // every Set is nominally centred about sheetY=0, same as anchorSY
    targetZoom,
  );
}

/** Read-only chip-UI summary: a Set is `reached` once the walkthrough has drawn it at least
 *  once — mirrors stepper.js's one-way-back `current || complete` gate (stepper.js
 *  renderRail) so an un-reached Set's chip can be disabled the same way. */
function methodSetsSummary() {
  return methodSets.map((s, i) => ({ label: s.label, reached: i <= methodSet }));
}

/** How many of a Set's 7 beats are currently revealed: every beat once the walkthrough has
 *  moved past this Set, methodBeat+1 for the Set being drawn right now, 0 for a Set not yet
 *  reached (its slot in the row stays visually empty until Next reaches it). */
function methodBeatsShown(i) {
  if (i < methodSet) return METHOD_BEAT_COUNT;
  if (i === methodSet) return methodBeat + 1;
  return 0;
}

/** Stroke every harvested line segment, filtered by `onlyHidden` (undefined = draw both solid
 *  and dashed, e.g. the dimension layer's single ink line style) — mirrors drawCompare's own
 *  strokeGroup, just reading the harvested plain-array shape instead of a live THREE group.
 *  ADR-087: `onlyKind` additionally filters on the harvested `kind` tag ('base' | 'generator' |
 *  'outline' | undefined) — undefined (default) draws every kind, matching how the dimension
 *  layer's calls (whose segments carry no `kind` at all) never pass it.
 *  ADR-091: optional `reveal` ({index, t}) draws units `0..index-1` in full, unit `index` lerped
 *  from its start point by fraction `t`, and stops — everything after it is simply not drawn yet.
 *  Omitted (the default), this draws every unit in full, i.e. the pre-ADR-091 behaviour exactly —
 *  every call site that is never the current animating beat passes nothing and is unaffected. */
function strokeMethodLines(ctx, lines, flattenFn, color, onlyHidden, widthOverride, onlyKind, reveal) {
  let idx = 0;
  for (const seg of lines) {
    if (onlyHidden !== undefined && seg.hidden !== onlyHidden) continue;
    if (onlyKind !== undefined && seg.kind !== onlyKind) continue;
    ctx.strokeStyle = color;
    ctx.lineWidth = widthOverride ?? (seg.hidden ? 1 : 1.6);
    ctx.setLineDash(seg.hidden ? [5, 4] : []);
    for (let k = 0; k + 5 < seg.pts.length; k += 6) {
      if (reveal && idx > reveal.index) { ctx.setLineDash([]); return; }
      const a = flattenFn(seg.pts[k], seg.pts[k + 1], seg.pts[k + 2]);
      const b = flattenFn(seg.pts[k + 3], seg.pts[k + 4], seg.pts[k + 5]);
      let bx = b.x, by = b.y;
      if (reveal && idx === reveal.index) {
        bx = a.x + (b.x - a.x) * reveal.t;
        by = a.y + (b.y - a.y) * reveal.t;
      }
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(bx, by);
      ctx.stroke();
      idx++;
    }
  }
  ctx.setLineDash([]);
}

/** Draw every harvested CSS2D label as flat Canvas2D text with a paper-colour break behind it
 *  — mirrors drawCompare's drawGroupText over the harvested plain-array shape. */
function drawMethodLabels(ctx, labels, flattenFn, color, font, paperColor) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const { text, x, y, z } of labels) {
    const p = flattenFn(x, y, z);
    const half = ctx.measureText(text).width / 2 + 2;
    ctx.fillStyle = paperColor;
    ctx.fillRect(p.x - half, p.y - 6, half * 2, 12);
    ctx.fillStyle = color;
    ctx.fillText(text, p.x, p.y);
  }
}

/** Fill every harvested triangle-soup array (flat [x,y,z,x,y,z,…], world space, 3 verts/
 *  triangle) — ADR-102's restricted dimension layer reuses this for the filled 3:1 arrowheads
 *  harvestTriGroup copies out of the live Mesh before projectSet disposes it. Mirrors
 *  drawCompare's fillArrowMesh over the harvested plain-array shape, the same relationship
 *  strokeMethodLines/drawMethodLabels already have to strokeGroup/drawGroupText. */
function fillMethodTris(ctx, tris, flattenFn, color) {
  ctx.fillStyle = color;
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const p0 = flattenFn(tris[i], tris[i + 1], tris[i + 2]);
    const p1 = flattenFn(tris[i + 3], tris[i + 4], tris[i + 5]);
    const p2 = flattenFn(tris[i + 6], tris[i + 7], tris[i + 8]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    ctx.fill();
  }
}

/** ADR-100: label sits a constant px GAP outside the arc, not a radius multiplier — a multiplier
 *  drags the label along with every future radius tweak, where a fixed offset stays a readable,
 *  predictable distance from the arc regardless of how big the arc itself is drawn. */
const ARC_LABEL_GAP_PX = 10;
const ARC_DEFAULT_PHASE = Object.freeze({ datumT: 1, arcT: 1, labelA: 1 });

/** ADR-099/-100 — angle arc + degree label, textbook style: a thin horizontal datum from
 *  `vertexPx`, an arc swept the SHORT way from that datum to the line toward `farPx`, and a
 *  knockout-backed degree label just outside the arc's own bisector. Both points are
 *  already-projected CANVAS points (the sheet's flattens bake in sign flips + the y-flip
 *  already, so sweeping raw world angles here would draw a mirrored arc) — callers own the "is
 *  this angle actually true in this view" question (see drawMethodSheet's `methodArcEligible`
 *  guard); this primitive only draws what it's given. No-ops on a degenerate (zero-length) input
 *  rather than drawing a stray dot.
 *  ADR-100: `phase` ({datumT, arcT, labelA}, each 0..1, all default to 1 = fully drawn) lets the
 *  caller reveal the mark progressively — datum ray first (endpoint lerp, the same technique
 *  strokeMethodLines' `reveal` uses), then the arc sweep (partial `ctx.arc` end angle), then the
 *  label cross-fades in via globalAlpha. Every existing call site that doesn't pass `phase` is
 *  provably unchanged — same precedent ADR-091 set for `strokeMethodLines`' own optional `reveal`. */
function strokeAngleArc(ctx, vertexPx, farPx, rPx, refCol, inkCol, font, paperColor, phase = ARC_DEFAULT_PHASE) {
  const dx = farPx.x - vertexPx.x;
  const dy = farPx.y - vertexPx.y;
  if (Math.hypot(dx, dy) < 1e-6) return;
  const axisAngle = Math.atan2(dy, dx);
  const datumAngle = dx >= 0 ? 0 : Math.PI; // opens toward whichever side the axis actually leans
  let diff = axisAngle - datumAngle;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) < 1e-3) return; // upright/flat — nothing to denote

  const { datumT, arcT, labelA } = phase;

  if (datumT > 0) {
    ctx.strokeStyle = refCol;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([1]);
    const datumLen = rPx * 1.15 * datumT;
    ctx.beginPath();
    ctx.moveTo(vertexPx.x, vertexPx.y);
    ctx.lineTo(vertexPx.x + Math.cos(datumAngle) * datumLen, vertexPx.y + Math.sin(datumAngle) * datumLen);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (arcT > 0) {
    ctx.strokeStyle = refCol;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(vertexPx.x, vertexPx.y, rPx, datumAngle, datumAngle + diff * arcT, diff < 0);
    ctx.stroke();
  }

  if (labelA > 0) {
    const mid = datumAngle + diff / 2;
    const lx = vertexPx.x + Math.cos(mid) * (rPx + ARC_LABEL_GAP_PX);
    const ly = vertexPx.y + Math.sin(mid) * (rPx + ARC_LABEL_GAP_PX);
    const text = `${Math.round(Math.abs(diff) * RAD2DEG)}°`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const half = ctx.measureText(text).width / 2 + 2;
    ctx.save();
    ctx.globalAlpha = labelA;
    ctx.fillStyle = paperColor;
    ctx.fillRect(lx - half, ly - 6, half * 2, 12);
    ctx.fillStyle = inkCol;
    ctx.fillText(text, lx, ly);
    ctx.restore();
  }
}

/**
 * ADR-087/-088 — draw every Show Method Set side by side, into Show Method's OWN independent
 * takeover canvas (called from drawMethodView(), never drawCompare()). Sizing follows the same
 * intrinsic-only law ADR-053/054 established for Compare (E/GAP/Set-count, never a live bbox —
 * ADR-088 drops `showSideViewFlag` from the inputs entirely, see METHOD_SHOW_SIDE_VIEW), applied
 * here as the sole sizing law for this view — the takeover is always exactly `n` Sets wide, with
 * no 1-wide state to morph from (ADR-085 retires the methodSpread tween ADR-084 needed for that
 * morph). Per-Set beat gating comes from methodBeatsShown(i); each Set's beat template now
 * follows Method of Drawing.md's own draw sequence (ADR-087): outline → visible face → hidden
 * face → visible generators → hidden generators, per view, axis genuinely last.
 * ADR-091: within the single Set currently mid-beat (i === methodSet), that beat's own lines
 * stroke in one at a time rather than popping in as a batch — `animatingBeat`/`revealFor` below
 * feed each candidate strokeMethodLines/projector/axis call its `{index, t}` reveal state (or
 * `undefined`, drawing in full, for every beat that isn't the live one — every already-settled
 * Set and every already-drawn beat of the current Set take that path, unchanged from ADR-087).
 */
function drawMethodSheet(ctx, w, h) {
  const paper = cssVar('--color-paper');
  const hpCol = cssVar('--color-hp-line');
  const vpCol = cssVar('--color-vp-line');
  const inkCol = cssVar('--color-ink');
  const refCol = cssVar('--color-ink-secondary');
  const captionFont = `12px ${cssVar('--font-sans') || 'sans-serif'}`;
  const labelFont = `11px ${cssVar('--font-sans') || 'sans-serif'}`;
  // ADR-102 — matches the live pane's own dimension-numeral font exactly (drawCompare's
  // monoFont: `11px --font-mono`), so the restricted layer reads identically to the full one.
  const dimFont = `11px ${cssVar('--font-mono') || 'monospace'}`;

  // ---- Sizing (ADR-085/-088, follows the ADR-053/054 intrinsic-only law) — always `n` Sets
  // wide; no 1-wide state exists in this view, so there is nothing to morph from. ADR-102: the
  // fit is the single shared methodSheetLayout — setMethodFocus fits the identical block+caption
  // band, so a focused Set frames consistently with the unfocused row (previously hand-duplicated
  // and the caption's own offset below blockH was left OUT of the fit entirely, which is why Set
  // 2 — the one horizontally centred under .method-controls — could overlap the pill). ----
  const L = methodSheetLayout(w, h);
  const {
    E, GAP, STAGE_GAP, blockW, blockH, n, marginPx, marginTopPx, marginBottomPx,
    scale, blockLocalCenterX, anchorSX, anchorSY, cx, cy,
  } = L;

  // Sheet-space projection with NO per-Set `dx` — the frame the sheet-wide XY line (ADR-088)
  // draws in; each per-Set `project()` below is this PLUS that Set's own `dx`.
  const projectSheet = (p) => ({
    x: cx + (p.x - anchorSX) * WORLD_TO_MM * scale * methodZoom + methodPanX,
    y: cy - (p.y - anchorSY) * WORLD_TO_MM * scale * methodZoom + methodPanY,
  });

  // ---- ADR-088: ONE sheet-wide XY line, not one per Set. Every Set already lands on the
  // identical screen row — anchorSY=0 above, and `dx` (added per-Set below) only ever perturbs
  // sheet-x — so a single stroke spanning the whole intrinsic row width is strictly TIGHTER than
  // the old per-Set version: no live bbox anywhere, only E/GAP/n, the same constants blockW/
  // anchorSX already use. Drawn unconditionally: methodBeat starts at 0 the instant the view
  // opens, so this line is visible for the view's entire lifetime, same as before. ----
  {
    const REF_OVERSHOOT = 0.3;
    const xMin = blockLocalCenterX - blockW / 2 - REF_OVERSHOOT;
    const xMax = (n - 1) * (blockW + STAGE_GAP) + blockLocalCenterX + blockW / 2 + REF_OVERSHOOT;
    ctx.strokeStyle = refCol;
    ctx.lineWidth = 0.75;
    ctx.setLineDash([1]);
    const a = projectSheet({ x: xMin, y: 0 });
    const b = projectSheet({ x: xMax, y: 0 });
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  for (let i = 0; i < n; i++) {
    const shown = methodBeatsShown(i);
    if (shown === 0) continue; // this Set's slot stays empty until Next actually reaches it

    const set = methodSets[i];
    const dx = i * (blockW + STAGE_GAP);
    const project = (p) => projectSheet({ x: p.x + dx, y: p.y });
    const flattenHP = (x, y, z) => project({ x: -z, y: -x });
    const flattenVP = (x, y, z) => project({ x: -z, y });

    // "View A" is whichever of HP/VP carries this Set's true shape (drawn first, same
    // firstIsHP split ADR-084 used); "view B" is the other. Both run the identical 5-beat
    // outline→visible-face→hidden-face→visible-generators→hidden-generators sub-sequence
    // (Method of Drawing.md §12.6) — ADR-087's fix for the old template treating "the other
    // view" as a single undifferentiated beat.
    const { firstIsHP, viewA: splitA, viewB: splitB } = methodViewSplit(set);
    const viewA = firstIsHP
      ? { flatten: flattenHP, color: hpCol, ...splitA }
      : { flatten: flattenVP, color: vpCol, ...splitA };
    const viewB = firstIsHP
      ? { flatten: flattenVP, color: vpCol, ...splitB }
      : { flatten: flattenHP, color: hpCol, ...splitB };

    // ADR-091: which beat (if any) of THIS Set is mid-stroke-in right now — only the current
    // frontier Set can ever be mid-reveal (everything behind it already drew in full and settled;
    // everything ahead of it hasn't been reached), so this is a single index, not a per-beat map.
    const animatingBeat = i === methodSet ? methodAnimBeat : -1;
    const revealFor = (beatIdx) =>
      animatingBeat === beatIdx ? { index: methodAnimIndex, t: methodAnimUnitT } : undefined;

    // Beat gates (ADR-087's 15-beat template; beat 0 = the sheet-wide XY line above, drawn
    // outside this loop). `shown > N` ⟺ the walkthrough has reached beat index N — same
    // convention ADR-084 established (methodBeatsShown returns METHOD_BEAT_COUNT outright for
    // any Set already fully behind the current one, so every gate below is trivially true there).
    const showOutlineA = shown > 1;
    const showFaceVisA = shown > 2;
    const showFaceHidA = shown > 3;
    const showGenVisA = shown > 4;
    const showGenHidA = shown > 5;
    const showProjectors = shown > 6;
    const showOutlineB = shown > 7;
    const showFaceVisB = shown > 8;
    const showFaceHidB = shown > 9;
    const showGenVisB = shown > 10;
    const showGenHidB = shown > 11;
    const showAxis = shown > 12;
    const showLabels = shown > 13;

    // ---- Beats 1-5: view A's own outline → visible face → hidden face → visible generators →
    // hidden generators. The outline beat reads a SEPARATE harvested array (hpOutline/vpOutline,
    // ADR-087) — a deliberate redundant copy of edges the visible-face/generator beats redraw a
    // few beats later (see onOutlineHP's header in projectionDrawer.js for why that overlap is
    // intentional, not a bug). ----
    if (showOutlineA) strokeMethodLines(ctx, viewA.outline, viewA.flatten, viewA.color, undefined, undefined, undefined, revealFor(1));
    if (showFaceVisA) strokeMethodLines(ctx, viewA.data, viewA.flatten, viewA.color, false, undefined, 'base', revealFor(2));
    if (showFaceHidA) strokeMethodLines(ctx, viewA.data, viewA.flatten, viewA.color, true, undefined, 'base', revealFor(3));
    if (showGenVisA) strokeMethodLines(ctx, viewA.data, viewA.flatten, viewA.color, false, undefined, 'generator', revealFor(4));
    if (showGenHidA) strokeMethodLines(ctx, viewA.data, viewA.flatten, viewA.color, true, undefined, 'generator', revealFor(5));

    // ---- Beat 6: projectors — vertical construction lines from each corner in the
    // already-drawn view to its counterpart's position in the view about to appear, PLUS
    // (i>0 only) the horizontal DERIVATION carry-over from the PREVIOUS Set's untouched view
    // (ADR-092 — merged into this existing beat rather than a new one: viewA is already a
    // direct rotated copy by the time this beat runs, nothing to derive before it; the actual
    // derivation of "this Set from the last one" happens exactly here, once both this Set's
    // own views exist to correlate against). Set 0 has no previous Set, so its horizontal half
    // never draws. The Set2→Set3 (both-planes) transition used to draw a visibly diagonal line
    // here — planMethodStages' old combined-Euler Set-3 pose didn't preserve the untouched view's
    // height between those two Sets. Fixed at the SOURCE (ADR-093, projectSequentialBothPlanesPose
    // in main.js), not here: Set 3 now composes as Set 2's own pose yawed about world-Y on top,
    // which leaves every vertex's height exactly alone — so this beat draws the same real
    // computed points as before and they now land flat for every Set transition, no special-
    // casing needed in this drawing code.
    // sheetHP.x === sheetVP.x (= −worldZ) for ANY point, so a corner's Top-view and
    // Front-view sheet positions always share the same sheet-x — the vertical projector is
    // exactly the vertical segment between them, never a diagonal point-to-point guess. ----
    if (showProjectors) {
      ctx.strokeStyle = refCol;
      ctx.lineWidth = 1;
      const reveal = revealFor(6);
      // Previous Set's SAME untouched-view flatten, rebuilt at ITS OWN dx — only used for i>0.
      // "Untouched" for THIS Set is viewB (firstIsHP ? VP : HP) — same split already computed
      // above for viewA/viewB, reused rather than re-derived.
      const prevSet = i > 0 ? methodSets[i - 1] : null;
      const prevDx = (i - 1) * (blockW + STAGE_GAP);
      const prevProject = (p) => projectSheet({ x: p.x + prevDx, y: p.y });
      const prevFlattenUntouched = firstIsHP
        ? (x, y, z) => prevProject({ x: -z, y })       // untouched = VP (front)
        : (x, y, z) => prevProject({ x: -z, y: -x });  // untouched = HP (top)
      if (prevSet && prevSet.ann.labels.length !== set.ann.labels.length) {
        console.warn(`Show Method: Set ${i} label count (${set.ann.labels.length}) != Set ${i - 1}'s (${prevSet.ann.labels.length}) — cross-Set correspondence assumption broken.`);
      }
      let idx = 0;
      for (const lbl of set.ann.labels) {
        if (reveal && idx > reveal.index) break;
        const hp = flattenHP(lbl.x, lbl.y, lbl.z);
        const vp = flattenVP(lbl.x, lbl.y, lbl.z);
        let vx = vp.x, vy = vp.y;
        if (reveal && idx === reveal.index) {
          vx = hp.x + (vp.x - hp.x) * reveal.t;
          vy = hp.y + (vp.y - hp.y) * reveal.t;
        }
        ctx.setLineDash([2, 2]); // within-Set projector
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y);
        ctx.lineTo(vx, vy);
        ctx.stroke();

        // Cross-Set horizontal derivation — this Set's untouched-view point traces back to
        // the SAME corner's position in the previous Set's SAME view (same row, different
        // block). Reveals in lockstep with the vertical segment above (same idx/reveal.t) —
        // one corner, one construction step, not two animation units.
        if (prevSet && prevSet.ann.labels[idx]) {
          const untouchedPt = firstIsHP ? vp : hp;
          const pLbl = prevSet.ann.labels[idx];
          const prevPt = prevFlattenUntouched(pLbl.x, pLbl.y, pLbl.z);
          let ux = untouchedPt.x, uy = untouchedPt.y;
          if (reveal && idx === reveal.index) {
            ux = prevPt.x + (untouchedPt.x - prevPt.x) * reveal.t;
            uy = prevPt.y + (untouchedPt.y - prevPt.y) * reveal.t;
          }
          // ADR-099: long dash, same colour/width as the within-Set projector above — visually
          // distinguishes "carried from the previous Set" from "linking this Set's own two
          // views" without introducing a second colour on a palette that deliberately keeps
          // sheet linework off blue (--color-accent stays reserved for chrome/focus, see the
          // --color-hp-line token comment in index.html).
          ctx.setLineDash([8, 4]);
          ctx.beginPath();
          ctx.moveTo(prevPt.x, prevPt.y);
          ctx.lineTo(ux, uy);
          ctx.stroke();
        }

        idx++;
      }
      ctx.setLineDash([]);
    }

    // ---- Beats 7-11: view B's own outline → visible face → hidden face → visible generators →
    // hidden generators — the identical 5-beat sub-sequence beats 1-5 ran for view A. ----
    if (showOutlineB) strokeMethodLines(ctx, viewB.outline, viewB.flatten, viewB.color, undefined, undefined, undefined, revealFor(7));
    if (showFaceVisB) strokeMethodLines(ctx, viewB.data, viewB.flatten, viewB.color, false, undefined, 'base', revealFor(8));
    if (showFaceHidB) strokeMethodLines(ctx, viewB.data, viewB.flatten, viewB.color, true, undefined, 'base', revealFor(9));
    if (showGenVisB) strokeMethodLines(ctx, viewB.data, viewB.flatten, viewB.color, false, undefined, 'generator', revealFor(10));
    if (showGenHidB) strokeMethodLines(ctx, viewB.data, viewB.flatten, viewB.color, true, undefined, 'generator', revealFor(11));

    // ---- Beat 12: axis chain-line — genuinely LAST (Method of Drawing.md §12.6's own rule of
    // thumb: "boundary → nearest visible face → hidden face/edges → axis line"), fixing ADR-084's
    // draw-2-beats-too-early divergence. Both views are already fully drawn by this point
    // (their own last beats, 5 and 11, are both < 12), so — unlike the old template — no showHP/
    // showVP guard is needed here.
    // ADR-100: reveal granularity is one unit per PASS (HP, then VP), not one per chain-line
    // dash (methodBeatUnitCount's own comment has the "why" — dash-counting made this beat the
    // walkthrough's one ~13s outlier). Each pass unit is cut by WORLD distance along the axis
    // (not canvas px) so the fraction maps correctly however the active view foreshortens it,
    // and a degenerate all-one-point projection can't produce a divide-by-zero. The angle arc
    // (ADR-099) gets its own two units after both passes settle — see methodArcEligible/
    // strokeAngleArc's `phase` param. ----
    if (showAxis) {
      ctx.strokeStyle = refCol;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      const reveal = revealFor(12);
      const axisPts = set.ann.axis;
      const ax0 = axisPts[0], ay0 = axisPts[1], az0 = axisPts[2];
      const axN = axisPts[axisPts.length - 3], ayN = axisPts[axisPts.length - 2], azN = axisPts[axisPts.length - 1];
      const axisWorldLen = Math.hypot(axN - ax0, ayN - ay0, azN - az0) || 1e-6;

      const strokeAxisPass = (flattenFn, cutFrac) => {
        if (cutFrac === 0) return;
        const cutDist = cutFrac === null ? Infinity : cutFrac * axisWorldLen;
        for (let k = 0; k + 5 < axisPts.length; k += 6) {
          const sx = axisPts[k], sy = axisPts[k + 1], sz = axisPts[k + 2];
          const ex = axisPts[k + 3], ey = axisPts[k + 4], ez = axisPts[k + 5];
          const da = Math.hypot(sx - ax0, sy - ay0, sz - az0);
          if (da >= cutDist) break; // this dash starts beyond the cut — nothing further is drawn
          let tx = ex, ty = ey, tz = ez;
          const db = Math.hypot(ex - ax0, ey - ay0, ez - az0);
          if (db > cutDist) {
            const segLen = db - da;
            const localT = segLen > 1e-9 ? (cutDist - da) / segLen : 1;
            tx = sx + (ex - sx) * localT;
            ty = sy + (ey - sy) * localT;
            tz = sz + (ez - sz) * localT;
          }
          const a = flattenFn(sx, sy, sz);
          const b = flattenFn(tx, ty, tz);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      };
      let hpCut = null, vpCut = null;
      if (reveal) {
        if (reveal.index === 0) { hpCut = reveal.t; vpCut = 0; }
        else if (reveal.index === 1) { vpCut = reveal.t; }
        // reveal.index >= 2 (arc units): both passes are already settled — leave both null.
      }
      strokeAxisPass(flattenHP, hpCut);
      strokeAxisPass(flattenVP, vpCut);

      // ADR-099: angle arc + degree label, drawn in viewA's own flatten — but ONLY when that
      // view actually shows a TRUE angle for this axis, not a foreshortened one. viewA drops Y
      // (flattenHP/top) when firstIsHP, else drops X (flattenVP/front); a view is exact for a
      // single line's own inclination exactly when the axis has zero component along the
      // dropped axis. Proven true for the 'HP'-plane case: planMethodStages' own override holds
      // angleVP at exactly 0 for that Set, so `axisDir.x` is exactly 0 there — always eligible.
      // The mirror 'VP'-plane case is NOT exact: a manually-dialled angleVP-only pose (angleHP
      // 0, no shipped problem exercises this — reachable only via free-explore) keeps
      // `axisDir.z` constant instead, so it projects as a purely VERTICAL line — always
      // measuring 90° — in BOTH available views (Show Method has no side view to show it true
      // in, ADR-088). Caught live: the first version of this guard trusted `trueShapeForPlane`
      // unconditionally and drew a "90°" arc beside a "40° to the VP" caption. Checked
      // numerically now, not assumed (methodArcEligible, above). 'both'-kind (the both-planes
      // Set 3) draws the TURN instead of a 3-D inclination, and only when firstIsHP: the yaw
      // `projectSequentialBothPlanesPose` applies is always about world-Y, which a screen sweep
      // only reads as a true angle in the TOP view (rotation-about-Y is angle-preserving ONLY
      // under the projection that drops Y) — a future VP-first `method.order` entry would put
      // viewA in the front view instead, where this same sweep would misrepresent the turn.
      // ADR-100: the arc's own reveal — index 2 grows the datum ray only (arc/label held at 0),
      // index 3 sweeps the arc with the label cross-fading in over the sweep's last 30% (so the
      // number settles just after the arc finishes, not mid-sweep against a half-drawn angle).
      if (methodArcEligible(set)) {
        let phase = null;
        if (!reveal || reveal.index > 3) {
          phase = ARC_DEFAULT_PHASE;
        } else if (reveal.index === 2) {
          phase = { datumT: reveal.t, arcT: 0, labelA: 0 };
        } else if (reveal.index === 3) {
          phase = { datumT: 1, arcT: reveal.t, labelA: THREE.MathUtils.clamp((reveal.t - 0.7) / 0.3, 0, 1) };
        }
        // reveal.index 0 or 1 (still mid axis-pass): phase stays null — arc hasn't started yet.
        if (phase) {
          const aEnd = set.ann.axis;
          const p0 = viewA.flatten(aEnd[0], aEnd[1], aEnd[2]);
          const p1 = viewA.flatten(aEnd[aEnd.length - 3], aEnd[aEnd.length - 2], aEnd[aEnd.length - 1]);
          const vertexPx = p0.y >= p1.y ? p0 : p1; // lower on screen — deterministic, no world guess
          const farPx = p0.y >= p1.y ? p1 : p0;
          const pxPerUnit = WORLD_TO_MM * scale * methodZoom; // intrinsic-only radius (ADR-053/054): tracks pan/zoom
          strokeAngleArc(ctx, vertexPx, farPx, E * 0.14 * pxPerUnit, refCol, inkCol, labelFont, paper, phase);
        }
      }
    }

    // ---- Beat 13: corner labels + the restricted dimension layer (ADR-102 folds the two
    // restricted dims into this EXISTING beat rather than adding a 15th one — no
    // METHOD_BEAT_COUNT change, no extra click per Set, keeping ADR-089/090/098's click-budget
    // reasoning intact). Its OWN beat (ADR-087 fixes ADR-084's labels-welded-to-axis divergence;
    // Method of Drawing.md's own 5 steps don't mention labels at all — a Module-2 pedagogical
    // addition, placed after the axis rather than inside it). ----
    if (showLabels) {
      drawMethodLabels(ctx, set.ann.labels, flattenHP, inkCol, labelFont, paper);
      drawMethodLabels(ctx, set.ann.labels, flattenVP, inkCol, labelFont, paper);

      // ADR-102 (supersedes ADR-089 Decision 1) — base edge + overall height ONLY;
      // projectSet's own restrictedDims gate already limited what got harvested into
      // set.data.hpDim*/vpDim*, so drawing everything harvested here is correct by
      // construction, nothing to filter a second time. Reveal granularity mirrors beat 12's
      // axis: one unit per DIMENSION (ADR-100's "one unit per whole mark", not per line
      // segment) — each unit grows its dimension LINE (reveal index 2 of that dim's own
      // [ext, ext, dimline] 3-segment array; the two extension lines snap in immediately,
      // same as every other beat's reveal treats its "connector" pieces), with the filled
      // arrowheads + numeral appearing once that unit settles — nothing here pops in
      // ahead of its own line, matching how every other mid-reveal mark on this sheet resolves.
      const activeDims = [];
      if (set.data.hpDimLines.length) {
        activeDims.push({
          lines: set.data.hpDimLines, tris: set.data.hpDimTris,
          labels: set.data.hpDimLabels, flatten: flattenHP,
        });
      }
      if (set.data.vpDimLines.length) {
        activeDims.push({
          lines: set.data.vpDimLines, tris: set.data.vpDimTris,
          labels: set.data.vpDimLabels, flatten: flattenVP,
        });
      }
      const dimReveal = revealFor(13);
      for (let di = 0; di < activeDims.length; di++) {
        const dim = activeDims[di];
        let lineReveal;
        let settled = true;
        if (dimReveal) {
          if (di < dimReveal.index) { lineReveal = undefined; settled = true; }
          else if (di === dimReveal.index) { lineReveal = { index: 2, t: dimReveal.t }; settled = dimReveal.t >= 0.999; }
          else break; // this dimension (and anything after it) hasn't been reached yet
        }
        strokeMethodLines(ctx, dim.lines, dim.flatten, inkCol, undefined, 1, undefined, lineReveal);
        if (settled) {
          fillMethodTris(ctx, dim.tris, dim.flatten, inkCol);
          drawMethodLabels(ctx, dim.labels, dim.flatten, inkCol, dimFont, paper);
        }
      }
    }

    // ---- Set caption: "Set N — <label>" replaces the per-view Top/Front/Side captions while
    // the method runs (ADR-084 — 9 view captions at ~1/3 scale collide with the dimension
    // numerals). Placed intrinsically below the block, same E/GAP-only inputs as everything
    // else here — never a measured bbox of what this Set has actually drawn. ----
    const captionY = -(blockH / 2 + GAP * 0.4);
    const capPos = project({ x: blockLocalCenterX, y: captionY });
    ctx.font = captionFont;
    ctx.fillStyle = refCol;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Set ${i + 1} — ${set.label}`, capPos.x, capPos.y);
  }
}

const compare = {
  show() {
    if (foldTween) return; // the fold owns the camera + card
    compareOpen = true;
    resetCompareView(); // ADR-054/055: every fresh open starts centred and unzoomed, not wherever a past drag/zoom left it
    if (compareCard) compareCard.hidden = false;
    // Compare has exactly one shape now (ADR-080) — always the docked split, at every
    // viewport width.
    enterWorkbench();
    remeasureAfterReflow(); // the grid reflow isn't laid out on frame 1 — measure after 2 frames
    updateCompareChip();
    announce('Compare view opened — 2D drawing.');
  },
  hide() {
    if (!compareOpen) return;
    // ADR-085: Show Method is its own independent takeover now and no longer opens Compare, so
    // closing Compare has no reason to end it — abortShowMethod() call removed here.
    compareOpen = false;
    const wasSplit = workbenchOpen;
    if (wasSplit) exitWorkbench(); // tear the split down before the card vanishes
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Compare view closed.');
    if (wasSplit) remeasureAfterReflow(); // hand the width back to the wizard, resize the renderer
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

/**
 * Repaint the Compare card's 2D orthographic drawing (top/front/side views only — no
 * projector lines, see below) from the live projection data — a live rebuild on every
 * commit, never a snapshot. Reads the ALREADY-CLASSIFIED (visible solid / occluded
 * dashed, per view) LineSegments2 geometry the 3D scene itself draws with
 * (activeProjection's hp/vp/pp groups — projectionDrawer.js's classifyEdge/visibleInHP/
 * VP/PP, untouched here), then applies the SAME analytic fold this sim's own Step-6 uses
 * (vpFoldGroup's +90° about Z: (x,y,z)→(−y,x,z); ppHingeGroup's +90° about local Y at its
 * z0 hinge, NESTED inside vpFoldGroup so its fold composes with the VP fold — ADR-106:
 * (x,y,z)→(0,y,z0−x) in vpFoldGroup's frame →(−y,0,z0−x) in world) so the folded points
 * land exactly where the 3D pane's own fold puts them.
 *
 * ADR-052 (answer-sheet projection, replaces the old same-axis toCanvas): those folded
 * WORLD points are then run through the answer-sheet camera's OWN top-down projection —
 * not a naive (worldX, worldZ) passthrough. swoopToAnswerSheet uses
 * QUICK_VIEWS.top.dir = (0,1,0) (looking down −Y) with FLAT_VIEW_UP = (−1,0,0); the
 * camera's screen-right basis vector is cross(forward, up) = cross((0,−1,0),(−1,0,0)) =
 * (0,0,−1), i.e. screenX ∝ −worldZ, and screen-up ∝ −worldX (matching "up = −X" — see
 * QUICK_VIEWS/FLAT_VIEW_UP comments). So sheet-space is (sheetX, sheetY) = (−worldZ,
 * −worldX) — front view above top view, side view to the RIGHT of the FRONT view
 * (ADR-106) — verified pixel-for-pixel against the 3D pane's own rendered flatten
 * (Step 6, first-angle layout). The prior mapping used (worldX, worldZ) directly (no
 * camera projection at all), which produced a 90°-rotated, mirrored sheet (front left
 * of top, side below).
 *
 * Also replicates the BIS Type-B dimension layer (ADR-041 — dimension/extension lines,
 * filled 3:1 arrowhead triangles, numeric CSS2D labels living in activeProjection's
 * hp/vpDimensionGroup) and the flattened sheet's Top/Front/Side View captions, so the
 * 2D sheet is a full replica of the annotated 3D drawing, not just its outline. The
 * dimension layer mirrors showDimensionsFlag, the same gate applyDimensionVisibility
 * uses on the 3D pane. No corner vertex labels (A/B/C′…): those annotate the upright
 * 3D solid and fade out on fold (labeler.setOpacity in applyFoldVisual), so the fully
 * flattened sheet never carries them either. The point-to-point projectors
 * (flatConnectorGroup) are intentionally NOT drawn here — they read as clutter once the
 * sheet is a clean flattened drawing; the 3D pane's own upright/fold view is where those
 * connectors earn their keep (showConnectorsFlag).
 *
 * ADR-052 (auto-fit scale, supersedes ADR-038's fixed mm span): a fixed 140mm span left
 * small solids reading as a speck. The sheet now measures every point it is about to
 * draw (views + visible dimension/caption geometry) and scales+centres to fill the card
 * with a constant pixel margin — true size is still readable off the dimension numerals.
 *
 * Also draws the XY (HP∩VP ground line) and X1-Y1 (HP∩PP hinge) reference marks as a thin
 * dashed `--color-ink-secondary` underlay, ending the "intentionally not created" de-clutter
 * gap noted on the 3D pane's own positionRefLabels/setRefLabelOpacity (those still skip them;
 * this sheet is where they now live). See the per-view bbox comment ahead of the draw calls
 * below for the placement math.
 */
/** ADR-085 — Show Method's own repaint, targeting its independent takeover canvas
 *  (#method-canvas). Mirrors drawCompare's canvas-sizing preamble exactly (DPR backing store,
 *  paper fill) then hands off to drawMethodSheet, which is otherwise unchanged from ADR-084.
 *  Compare's own drawCompare() no longer has a methodActive branch — the two surfaces are
 *  fully independent post-ADR-085. */
function drawMethodView() {
  if (!methodCanvas) return;
  const stage = methodCanvas.parentElement;
  const w = stage?.clientWidth || 0;
  const h = stage?.clientHeight || 0;
  if (!w || !h) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  methodCanvas.width = Math.round(w * dpr);
  methodCanvas.height = Math.round(h * dpr);
  const ctx = methodCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const paper = cssVar('--color-paper');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  drawMethodSheet(ctx, w, h);
  if (methodTiltActive) drawMethodGhost(ctx, w, h);
}

/** Per-frame draw for the Set-to-Set ghost (startMethodTilt) — lifts a faded copy of the previous
 *  Set's own true-shape view off the sheet and rigidly rotates+translates it into this Set's start
 *  position: `ghostPx(P, t) = Rot(θ·t)·(Ppx − pivot2px) + pivot2px + t·(pivot3px − pivot2px)`, a
 *  pure rotate+translate of the source Set's own already-flattened points — nothing reshaped,
 *  which is the literal proof this IS that Set's drawing, moved (see DECISIONS.md). θ is MEASURED
 *  between the two Sets' own drawn axis directions in canvas px, never declared from a stored
 *  angle's sign — `projectSheet` below applies a y-flip, so a world rotation reads as the opposite
 *  sense on canvas (main.js CLAUDE.md: re-derive every ported sign visually). Painted AFTER
 *  drawMethodSheet so it overlays settled content — but ON the sheet, in sheet space, so a
 *  pan/zoom mid-tilt keeps it locked to the drawing. Calls methodSheetLayout itself rather than
 *  threading state out of drawMethodSheet — setMethodFocus already establishes that
 *  call-it-again precedent for this single-source layout.
 *
 *  `methodGhost.kind` (set by startMethodTilt) picks the view: **'turn'** lands pixel-exact
 *  because Set 3's pose IS Set 2's yawed about world-Y (ADR-093, top view drops Y) — reads `.hp`/
 *  `.hpOutline`, guarded by `methodArcEligible` at ghost start so viewA really is the top view.
 *  **'tilt'** (ADR-110) lands pixel-exact because that step's pose delta IS a pure world-X
 *  rotation (front view drops X) — reads `.vp`/`.vpOutline`. No angle arc is drawn for a tilt:
 *  `strokeAngleArc`'s datum is horizontal, but a tilt's axis starts near-VERTICAL in the front
 *  view, so the datum would flip sides mid-flight (ADR-110) — the destination Set's own beat-12
 *  arc marks the settled angle a moment later instead. */
function drawMethodGhost(ctx, w, h) {
  if (!methodGhost || !methodActive) return;
  const set3 = methodSets[methodSet];
  const set2 = methodSets[methodGhost.fromIndex];
  const axis2 = set2?.ann?.axis, axis3 = set3?.ann?.axis;
  if (!set2 || !set3 || !axis2 || !axis3 || axis2.length < 6 || axis3.length < 6) return;
  const isTilt = methodGhost.kind === 'tilt';

  const L = methodSheetLayout(w, h);
  const projectSheet = (p) => ({
    x: L.cx + (p.x - L.anchorSX) * WORLD_TO_MM * L.scale * methodZoom + methodPanX,
    y: L.cy - (p.y - L.anchorSY) * WORLD_TO_MM * L.scale * methodZoom + methodPanY,
  });
  const flattenHPAt = (dx) => (x, y, z) => projectSheet({ x: -z + dx, y: -x });
  const flattenVPAt = (dx) => (x, y, z) => projectSheet({ x: -z + dx, y });
  const flattenAt = isTilt ? flattenVPAt : flattenHPAt;
  const flatten2 = flattenAt(methodGhost.fromIndex * (L.blockW + L.STAGE_GAP));
  const flatten3 = flattenAt(methodSet * (L.blockW + L.STAGE_GAP));

  const vIdx = methodGhost.vertexIsFirst ? 0 : axis2.length - 3;
  const fIdx = methodGhost.vertexIsFirst ? axis2.length - 3 : 0;
  const pivot2px = flatten2(axis2[vIdx], axis2[vIdx + 1], axis2[vIdx + 2]);
  const far2px = flatten2(axis2[fIdx], axis2[fIdx + 1], axis2[fIdx + 2]);
  const pivot3px = flatten3(axis3[vIdx], axis3[vIdx + 1], axis3[vIdx + 2]);
  const far3px = flatten3(axis3[fIdx], axis3[fIdx + 1], axis3[fIdx + 2]);
  let theta = Math.atan2(far3px.y - pivot3px.y, far3px.x - pivot3px.x)
            - Math.atan2(far2px.y - pivot2px.y, far2px.x - pivot2px.x);
  // ADR-105: atan2's own range is (-pi, pi], so this DIFFERENCE spans (-2pi, 2pi) unwrapped —
  // near the +/-180 deg seam the raw value can read as e.g. +330 deg for a true -30 deg turn.
  // Wrapping to (-pi, pi] is provably the shortest path AND the correct one here: turnDeg is a
  // rng-anglehp/rng-anglevp slider value in [-90, 90] (index.html), so |true turn| <= 90 deg is
  // always well inside the wrap's own +/-180 deg range — same idiom strokeAngleArc already uses
  // for its own `diff` (this file, above).
  while (theta > Math.PI) theta -= 2 * Math.PI;
  while (theta <= -Math.PI) theta += 2 * Math.PI;

  const t = methodTiltMotionT;
  const cosT = Math.cos(theta * t), sinT = Math.sin(theta * t);
  const curPivotX = pivot2px.x + t * (pivot3px.x - pivot2px.x);
  const curPivotY = pivot2px.y + t * (pivot3px.y - pivot2px.y);
  const flattenGhost = (x, y, z) => {
    const p = flatten2(x, y, z);
    const rx = p.x - pivot2px.x, ry = p.y - pivot2px.y;
    return { x: curPivotX + rx * cosT - ry * sinT, y: curPivotY + rx * sinT + ry * cosT };
  };

  const paper = cssVar('--color-paper');
  const hpCol = cssVar('--color-hp-line');
  const vpCol = cssVar('--color-vp-line');
  const inkCol = cssVar('--color-ink');
  const refCol = cssVar('--color-ink-secondary');
  const labelFont = `11px ${cssVar('--font-sans') || 'sans-serif'}`;
  const lineCol = isTilt ? vpCol : hpCol;
  const outlineData = isTilt ? set2.data.vpOutline : set2.data.hpOutline;
  const bodyData = isTilt ? set2.data.vp : set2.data.hp;

  ctx.save();
  ctx.globalAlpha = GHOST_ALPHA * methodTiltAlpha;
  strokeMethodLines(ctx, outlineData, flattenGhost, lineCol);
  strokeMethodLines(ctx, bodyData, flattenGhost, lineCol);
  ctx.restore();

  if (isTilt) return; // ADR-110: no angle arc for a tilt — see this function's own header

  const pxPerUnit = WORLD_TO_MM * L.scale * methodZoom; // matches beat 12's own arc radius formula
  ctx.save();
  ctx.globalAlpha = methodTiltAlpha;
  strokeAngleArc(
    ctx,
    flattenGhost(axis2[vIdx], axis2[vIdx + 1], axis2[vIdx + 2]),
    flattenGhost(axis2[fIdx], axis2[fIdx + 1], axis2[fIdx + 2]),
    L.E * 0.14 * pxPerUnit, refCol, inkCol, labelFont, paper,
  );
  ctx.restore();
}

function drawCompare() {
  if (!compareCanvas) return;
  const stage = compareCanvas.parentElement;
  const w = stage?.clientWidth || 0;
  const h = stage?.clientHeight || 0;
  if (!w || !h) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  compareCanvas.width = Math.round(w * dpr);
  compareCanvas.height = Math.round(h * dpr);
  const ctx = compareCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const paper = cssVar('--color-paper');
  const hpCol = cssVar('--color-hp-line');
  const vpCol = cssVar('--color-vp-line');
  const ppCol = cssVar('--color-pp-line');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  if (!showProjectionsFlag || !activeProjection) return; // nothing projected yet

  const z0 = ppHingeGroup ? ppHingeGroup.position.z : DEFAULT_PP_STANDOFF;

  // Sheet-space (world units, no scale/offset yet) flatten: the fold each group's OWN
  // pivot applies (see header) composed with the answer-sheet camera's projection
  // (sheetX, sheetY) = (−worldZ, −worldX) — ADR-052. Kept separate from `project()`
  // below so the SAME functions can measure the drawing (pass 1) before any scale
  // exists, then draw it (pass 2) once `project` is known.
  const sheetHP = (x, _y, z) => ({ x: -z, y: -x });          // top view: HP never folds
  const sheetVP = (_x, y, z) => ({ x: -z, y });               // front view: (x,y,z)→(−y,x,z)
  // Side view (ADR-106): the PP fold now composes with the VP fold — local (x,y,0) →
  // R_y(+90°) → (0,y,−x) → +hinge(0,0,z0) → (0,y,z0−x) [vpFoldGroup frame] → R_z(+90°) →
  // (−y,0,z0−x) [world] → camera (sheetX=−worldZ, sheetY=−worldX) = (x−z0, y). sheetY=y
  // matches sheetVP's own y exactly, so Side shares Front's row (was sheetY=−x, Top's row).
  const sheetPP = (x, y, _z) => ({ x: x - z0, y });
  // Captions store their ALREADY-POST-FOLD world position (positionRefLabels), so they
  // only need the camera projection, not a fold.
  const sheetCaption = (px, _py, pz) => ({ x: -pz, y: -px });

  /** Walk every drawable child of `group` (LineSegments2 endpoints + arrowhead Mesh
   *  triangle verts — the isLineSegments2 check must come first: LineSegments2 also
   *  reports isMesh=true, r160 gotcha), feeding each raw point through `sheetFn` into
   *  `measure`. Shared by the auto-fit measure pass and could equally walk any group
   *  this function draws, so the measured extent always matches what actually paints. */
  const walkGroupPoints = (group, sheetFn, visit) => {
    if (!group) return;
    for (const child of group.children) {
      if (child.isLineSegments2) {
        const start = child.geometry.attributes.instanceStart;
        const end = child.geometry.attributes.instanceEnd;
        if (!start || !end) continue;
        for (let i = 0; i < start.count; i++) {
          visit(sheetFn(start.getX(i), start.getY(i), start.getZ(i)));
          visit(sheetFn(end.getX(i), end.getY(i), end.getZ(i)));
        }
      } else if (child.isMesh) {
        const pos = child.geometry?.attributes?.position;
        if (!pos) continue;
        for (let i = 0; i < pos.count; i++) {
          visit(sheetFn(pos.getX(i), pos.getY(i), pos.getZ(i)));
        }
      }
    }
  };

  // ---- Pass 1 (ADR-052, supersedes ADR-038's fixed mm span): measure every point the
  // sheet is about to draw — the three views, the dimension layer when shown, and the
  // view captions — so the sheet can auto-fit the card instead of framing a constant mm
  // span that left small solids reading as a speck. ----
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const measure = (p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  };
  // Per-view sheet-space bounding boxes, tracked ALONGSIDE the overall auto-fit bbox above —
  // used below to place the XY / X1-Y1 ground-line reference marks in the actual visual gap
  // between adjacent folded views (self-adjusting to the solid's layout) rather than only the
  // analytic fold-hinge position, which the auto-fit crop can push off-centre.
  const emptyBox = () => ({ minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const hpBox = emptyBox();
  const vpBox = emptyBox();
  const ppBox = emptyBox();
  const measureBox = (box, p) => {
    measure(p);
    if (p.x < box.minX) box.minX = p.x;
    if (p.x > box.maxX) box.maxX = p.x;
    if (p.y < box.minY) box.minY = p.y;
    if (p.y > box.maxY) box.maxY = p.y;
  };
  walkGroupPoints(activeProjection.hpGroup, sheetHP, (p) => measureBox(hpBox, p));
  walkGroupPoints(activeProjection.vpGroup, sheetVP, (p) => measureBox(vpBox, p));
  if (showSideViewFlag) walkGroupPoints(activeProjection.ppGroup, sheetPP, (p) => measureBox(ppBox, p));
  if (showDimensionsFlag) {
    walkGroupPoints(activeProjection.hpDimensionGroup, sheetHP, measure);
    walkGroupPoints(activeProjection.vpDimensionGroup, sheetVP, measure);
  }
  for (const lbl of [topViewLabel, frontViewLabel, showSideViewFlag ? sideViewLabel : null]) {
    if (lbl?.element?.textContent) measure(sheetCaption(lbl.position.x, lbl.position.y, lbl.position.z));
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return; // nothing drawable yet

  // ---- Fixed intrinsic-size frame (ADR-053, supersedes ADR-052's live auto-fit): scale and
  // anchor are derived ONLY from the solid's own 3D size (solidSpanUnits) and the world origin
  // — NEVER from the minX/maxX/minY/maxY measured above, and never from the live distHP/distVP.
  // seatOnPlanes seats the solid so distHP=0 rests exactly on the HP (world y=0) and distVP=0
  // rests exactly on the VP (world x=0); world z is always 0 (mesh.position.z, seatOnPlanes).
  // So the world origin IS the slider-independent reference already built into the seating —
  // sheetHP/sheetVP/sheetPP (above) read straight off world x/y/z, so pinning sheet-space (0,0)
  // here means a distance slider moves ONLY the view whose formula depends on that axis; it can
  // no longer rescale or re-pan views that don't (see the per-view derivation in the header
  // comments above sheetHP/sheetVP/sheetPP). ----
  const marginPx = 40;
  const E = Math.max(solidSpanUnits, 1e-3);      // characteristic size = bounding-sphere diameter
  const GAP = E * 0.35;                          // fixed inter-view gutter, world units
  const nomWmm = (E + (showSideViewFlag ? GAP + E : 0)) * WORLD_TO_MM;
  const nomHmm = (E + GAP + E) * WORLD_TO_MM;     // Front view stacked above Top view
  const scale = Math.min((w - 2 * marginPx) / nomWmm, (h - 2 * marginPx) / nomHmm); // px per mm

  // ADR-054 (refines ADR-053's anchor clause; scale above is unchanged): pinning sheet-space
  // (0,0) to the canvas centre left the drawing lopsided — Front/Top (sheetHP.x=sheetVP.x=-z)
  // sit centred near sheetX=0, but the Side block (sheetPP.x=x-z0, ADR-106) sits a further
  // E+GAP to the RIGHT of that, so the nominal layout's own centre is NOT world-origin — it's offset exactly
  // (E+GAP)/2 to the right (0 with no side view). Anchoring there instead of at (0,0) balances
  // the left/right margins. Derived ONLY from E/GAP/showSideViewFlag — same distance/angle
  // -independent inputs as `scale` itself, so this is still an intrinsic-size constant, never
  // the live bbox: a distance slider still moves only the view whose formula depends on that
  // axis, it just does so around this balanced centre instead of around (0,0).
  const anchorSX = showSideViewFlag ? (E + GAP) / 2 : 0;
  const anchorSY = 0; // Front-above/Top-below is already nominally symmetric about sheetY=0

  const cx = w / 2;
  const cy = h / 2;

  // World units → sheet mm (WORLD_TO_MM, ADR-018) → canvas px, anchored at the fixed
  // intrinsic-nominal layout centre (ADR-054) — never a live bbox centre. `compareZoom`
  // (ADR-055) post-multiplies the content term only — a pure screen-space lens over the
  // intrinsic `scale`, which itself never changes. `comparePanX/Y` (CSS px, ADR-054) layers
  // the user's drag-to-pan on top so extreme distance/angle values (or a zoomed-in view)
  // that push content past the card edge stay reachable without touching scale or anchor.
  // Canvas y grows DOWN; the sheet's "up" is screen-up, so y flips sign.
  const project = (p) => ({
    x: cx + (p.x - anchorSX) * WORLD_TO_MM * scale * compareZoom + comparePanX,
    y: cy - (p.y - anchorSY) * WORLD_TO_MM * scale * compareZoom + comparePanY,
  });
  // ---- Pass 2: the actual draw-space flatten functions, composing sheet-space + project. ----
  const flattenHP = (x, y, z) => project(sheetHP(x, y, z));
  const flattenVP = (x, y, z) => project(sheetVP(x, y, z));
  const flattenPP = (x, y, z) => project(sheetPP(x, y, z));
  const flattenCaption = (px, py, pz) => project(sheetCaption(px, py, pz));

  // ---- Orthographic ground-line reference marks (XY / X1-Y1) — a thin dashed underlay
  // drawn BEFORE the view linework below so the actual outlines paint on top of it, matching
  // standard BIS sheet convention (a light construction line, not part of the drawing itself).
  // XY is the HP∩VP ground line (Front folds down to meet Top); X1-Y1 is the VP∩PP hinge
  // (ADR-106 — Front+Side meet the Side view, not Top+Side). ADR-056 (supersedes the
  // 2026-07-16 visual-gap-midpoint placement): each line is PINNED to its analytic hinge
  // coordinate — sheetY=0 for XY, sheetX=−z0 for X1-Y1 (see the sheetHP/sheetVP/sheetPP
  // header derivation) — never a live bbox midpoint, because the Front view's sheetY
  // (=worldY) and the Side view's sheetX (=worldX−z0) both move under the distVP/distHP
  // sliders (seatOnPlanes), which dragged the old midpoint along with the geometry instead
  // of leaving it as a fixed hinge. hpBox/vpBox/ppBox are read ONLY to size each line's
  // LENGTH along its own perpendicular axis (sheetX for XY, sheetY for X1-Y1) — both of
  // those axes are distance-slider-invariant (sheetHP.x=sheetVP.x=−worldZ; sheetVP.y=
  // sheetPP.y=worldY), so the length can safely track the drawing without the position
  // drifting. Skipped entirely once nothing is drawable (guarded by the early return above).
  const hpValid = Number.isFinite(hpBox.minX);
  const vpValid = Number.isFinite(vpBox.minX);
  const ppValid = showSideViewFlag && Number.isFinite(ppBox.minX);
  const REF_OVERSHOOT = 0.3; // world units past the drawn extent, so lines clear the linework

  ctx.strokeStyle = cssVar('--color-ink-secondary');
  ctx.lineWidth = 0.75;
  ctx.setLineDash([1]);

  if (hpValid || vpValid) {
    const xyY = 0; // analytic HP∩VP ground line (sheetY=0) — ADR-056, never the live view midpoint
    // Length spans only the Top+Front block, on sheetX (=−worldZ) which is invariant under
    // distHP/distVP — deliberately excludes the Side view (its sheetX tracks distVP via z0,
    // ADR-106).
    let xMin = Infinity, xMax = -Infinity;
    if (hpValid) { xMin = Math.min(xMin, hpBox.minX); xMax = Math.max(xMax, hpBox.maxX); }
    if (vpValid) { xMin = Math.min(xMin, vpBox.minX); xMax = Math.max(xMax, vpBox.maxX); }
    const a = project({ x: xMin - REF_OVERSHOOT, y: xyY });
    const b = project({ x: xMax + REF_OVERSHOOT, y: xyY });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  if (ppValid) {
    const x1X = -z0; // analytic VP∩PP hinge (sheetX=−z0) — ADR-056, never the live view midpoint
    // Length spans the Front+Side block (ADR-106), on sheetY (=worldY for both) which is
    // invariant under distVP — deliberately excludes the Top view (its sheetY=−worldX
    // tracks distVP directly).
    const yMin = Math.min(vpValid ? vpBox.minY : ppBox.minY, ppBox.minY) - REF_OVERSHOOT;
    const yMax = Math.max(vpValid ? vpBox.maxY : ppBox.maxY, ppBox.maxY) + REF_OVERSHOOT;
    const a = project({ x: x1X, y: yMin });
    const b = project({ x: x1X, y: yMax });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  /** Stroke every LineSegments2 child of `group` (reading its instanced instanceStart /
   *  instanceEnd endpoint buffers directly — the same technique used to verify these fat
   *  lines in prior sessions), flattened by `flattenFn` and coloured `color`. Solid vs
   *  dashed follows the segments.userData.hidden tag set in projectionDrawer.js. `width`
   *  overrides the visible/hidden default (used by the dimension layer's 1px Type-B lines). */
  const strokeGroup = (group, flattenFn, color, width) => {
    if (!group) return;
    for (const child of group.children) {
      if (!child.isLineSegments2) continue;
      const start = child.geometry.attributes.instanceStart;
      const end = child.geometry.attributes.instanceEnd;
      if (!start || !end) continue;
      ctx.strokeStyle = color;
      ctx.lineWidth = width ?? (child.userData.hidden ? 1 : 1.6);
      ctx.setLineDash(child.userData.hidden ? [5, 4] : []);
      for (let i = 0; i < start.count; i++) {
        const a = flattenFn(start.getX(i), start.getY(i), start.getZ(i));
        const b = flattenFn(end.getX(i), end.getY(i), end.getZ(i));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  };

  /** Fill every triangle-soup Mesh child of `group` — the ADR-041 filled-arrowhead buffer.
   *  LineSegments2 also reports isMesh=true (r160 gotcha), so it must be explicitly excluded
   *  even though this walks the same dimension groups as strokeGroup. Reads raw local-space
   *  triangle vertices straight off the position attribute, 3 verts (9 floats) per triangle. */
  const fillArrowMesh = (group, flattenFn, color) => {
    if (!group) return;
    ctx.fillStyle = color;
    for (const child of group.children) {
      if (!child.isMesh || child.isLineSegments2) continue;
      const pos = child.geometry?.attributes?.position;
      if (!pos) continue;
      for (let i = 0; i + 2 < pos.count; i += 3) {
        const p0 = flattenFn(pos.getX(i), pos.getY(i), pos.getZ(i));
        const p1 = flattenFn(pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1));
        const p2 = flattenFn(pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2));
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  };

  /** Paint every CSS2DObject child of `group` (the dimension layer's numeric labels) as
   *  flat Canvas2D text — the CSS2DRenderer only exists in the 3D viewport, so the 2D sheet
   *  reads each label's live text + world position off the DOM node and re-renders it here.
   *  A `--color-paper` break behind the digits mirrors the 3D label's own background break
   *  (projectionDrawer.js makeDimLabel) so the numeral stays legible over a crossing line. */
  const drawGroupText = (group, flattenFn, color, font) => {
    if (!group) return;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const child of group.children) {
      if (!child.isCSS2DObject) continue;
      const text = child.element?.textContent;
      if (!text) continue;
      const p = flattenFn(child.position.x, child.position.y, child.position.z);
      const half = ctx.measureText(text).width / 2 + 2;
      ctx.fillStyle = paper;
      ctx.fillRect(p.x - half, p.y - 6, half * 2, 12);
      ctx.fillStyle = color;
      ctx.fillText(text, p.x, p.y);
    }
  };

  // No point-to-point projectors here (ADR-052): flatConnectorGroup reads as clutter on
  // a clean flattened sheet — see the header note. Just the three views themselves.
  strokeGroup(activeProjection.hpGroup, flattenHP, hpCol);
  strokeGroup(activeProjection.vpGroup, flattenVP, vpCol);
  if (showSideViewFlag) strokeGroup(activeProjection.ppGroup, flattenPP, ppCol);
  ctx.setLineDash([]);

  // Dimension layer (BIS SP 46:2003 Type B, ADR-041) — mirrors the 3D pane's own
  // showDimensionsFlag gate (setDimensionsVisible → applyDimensionVisibility), so the 2D
  // sheet only carries dimensions once the learner has revealed them in the 3D view.
  if (showDimensionsFlag) {
    const inkCol = cssVar('--color-ink');
    const monoFont = `11px ${cssVar('--font-mono') || 'monospace'}`;
    strokeGroup(activeProjection.hpDimensionGroup, flattenHP, inkCol, 1);
    strokeGroup(activeProjection.vpDimensionGroup, flattenVP, inkCol, 1);
    fillArrowMesh(activeProjection.hpDimensionGroup, flattenHP, inkCol);
    fillArrowMesh(activeProjection.vpDimensionGroup, flattenVP, inkCol);
    drawGroupText(activeProjection.hpDimensionGroup, flattenHP, inkCol, monoFont);
    drawGroupText(activeProjection.vpDimensionGroup, flattenVP, inkCol, monoFont);
    ctx.setLineDash([]);
  }

  // View-name captions (Top/Front/Side View) — the same world-space CSS2D labels the 3D
  // pane fades in on the flattened sheet (setRefLabelOpacity/positionRefLabels); the 2D
  // sheet is always the fully-flattened drawing regardless of 3D fold progress (matching
  // how hpGroup/vpGroup above are always drawn flat too), so captions always draw once a
  // projection exists. Side caption gated on showSideViewFlag, like the side view's own line.
  //
  // positionRefLabels' world-space margin (M=2.0 units) past each view reads generously in
  // the 3D viewport's own roomier framing, but is tight against this sheet's auto-fit crop
  // (ADR-052) — a CENTRED text anchor there lets the far half of the caption bite back into
  // the nearest dimension number. So the anchor is aligned to read AWAY from the sheet centre
  // (its near edge sits at the point, the text extends outward) along whichever axis the
  // label is actually offset on, using the existing margin fully instead of centring on it.
  const captionCol = cssVar('--color-ink-secondary');
  const captionFont = `12px ${cssVar('--font-sans') || 'sans-serif'}`;
  const drawCaption = (lbl) => {
    const text = lbl?.element?.textContent;
    if (!text) return;
    const p = flattenCaption(lbl.position.x, lbl.position.y, lbl.position.z);
    const dx = p.x - cx;
    const dy = p.y - cy;
    ctx.font = captionFont;
    ctx.fillStyle = captionCol;
    ctx.textAlign = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'right' : 'left') : 'center';
    ctx.textBaseline = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'bottom' : 'top') : 'middle';
    ctx.fillText(text, p.x, p.y);
  };
  drawCaption(topViewLabel);
  drawCaption(frontViewLabel);
  if (showSideViewFlag) drawCaption(sideViewLabel);
}

/**
 * Rail hide/reveal — collapse the docked #workbench-rail for a full-screen read of the
 * 50/50 split. Independent of the wizard chevron: collapsing the rail never exits the
 * split, and enterWorkbench() always resets this back to shown on entry.
 */

/** One-source-of-truth sync for the #rail-toggle button's 4 state facets (aria-expanded,
 *  aria-label, title, the visible .rail-toggle__text span). Called from the click handler
 *  below AND from enterWorkbench()/exitWorkbench(), which force-reset this on every split
 *  transition — without those second call sites the button could read stale "Show"/"Hide"
 *  text (see the Points reference's 2026-07-15 rail-toggle desync fix). */
function syncRailToggleState(collapsed) {
  const btn = document.getElementById('rail-toggle');
  if (!btn) return;
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Show controls' : 'Hide controls');
  btn.title = collapsed ? 'Show controls' : 'Hide controls';
  const txt = btn.querySelector('.rail-toggle__text');
  if (txt) txt.textContent = collapsed ? 'Show' : 'Hide';
}

function setupRailToggle() {
  const btn = document.getElementById('rail-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('rail-collapsed');
    syncRailToggleState(collapsed);
    announce(collapsed ? 'Controls rail hidden.' : 'Controls rail shown.');
    // The rail's grid row (and its gap) drops out on collapse, so the viewport and 2D
    // drawing card grow into the reclaimed height — reuse the double-rAF reflow wait.
    remeasureAfterReflow();
  });
}

/** Bind + wire the Compare chrome once at boot: the chip is Compare's only open/close
 *  control (ADR-080) — there is no separate expand/close head chrome and no breakpoint
 *  fallback to a floating card. */
function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
  compareCanvas = document.getElementById('compare-canvas');

  compareChip?.addEventListener('click', () => compare.toggle());

  setupRailToggle();
  setupComparePan();
}

/** Drag-to-pan (ADR-054) + scroll-wheel zoom (ADR-055) on the 2D sheet — standard
 *  pointer-capture drag, coalesced to one redraw per animation frame so a fast drag/scroll
 *  doesn't queue up a backlog of drawCompare() calls. Pans `comparePanX/Y` and scales
 *  `compareZoom` (both consumed by drawCompare's project()); neither touches the intrinsic
 *  `scale`/anchor, so both compose with ADR-053's scale-lock instead of fighting it.
 *  Double-click recenters AND un-zooms (resetCompareView) for when a drag/zoom wanders
 *  off-frame. */
function setupComparePan() {
  if (!compareCanvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  // queueRedraw is module-scope — see its declaration beside the other Compare-sheet state
  // above. (Show Method has its own queueMethodRedraw post-ADR-085 — fully independent.)

  compareCanvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    compareCanvas.setPointerCapture(e.pointerId);
    compareCanvas.style.cursor = 'grabbing';
  });
  compareCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    comparePanX += e.clientX - lastX;
    comparePanY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    queueRedraw();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (compareCanvas.hasPointerCapture?.(e.pointerId)) {
      compareCanvas.releasePointerCapture(e.pointerId);
    }
    compareCanvas.style.cursor = 'grab';
  };
  compareCanvas.addEventListener('pointerup', endDrag);
  compareCanvas.addEventListener('pointerleave', endDrag);
  compareCanvas.addEventListener('pointercancel', endDrag);
  compareCanvas.addEventListener('dblclick', () => {
    resetCompareView();
    if (compareOpen) drawCompare();
  });

  // Scroll-wheel zoom (ADR-055), zeroed-in on the pointer: solve for the pan shift that keeps
  // the world point under the cursor fixed on screen as compareZoom changes, using the exact
  // same (cx,cy) centre drawCompare's project() anchors to (w/2, h/2 of the canvas's OWN
  // rect — matches compareCanvas.parentElement's box, which is what drawCompare sizes the
  // canvas to). preventDefault + non-passive stops the page from scrolling under the card.
  compareCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = compareCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, compareZoom * factor));
    if (nextZoom === compareZoom) return; // clamped — nothing to do
    const k = nextZoom / compareZoom;
    comparePanX = (mx - midX) * (1 - k) + comparePanX * k;
    comparePanY = (my - midY) * (1 - k) + comparePanY * k;
    compareZoom = nextZoom;
    queueRedraw();
  }, { passive: false });
}

/** Bind Show Method's own takeover surface once at boot (ADR-085) — grabs #method-view/
 *  #method-canvas and wires drag-to-pan + scroll-wheel zoom on the forked methodPanX/Y/
 *  methodZoom state, entirely independent of setupComparePan/compareCanvas above. */
function setupMethodView() {
  methodViewEl = document.getElementById('method-view');
  methodCanvas = document.getElementById('method-canvas');
  setupMethodPan();
}

/** Drag-to-pan + scroll-wheel zoom on Show Method's own canvas — same shape as
 *  setupComparePan(), forked onto methodPanX/Y/methodZoom + queueMethodRedraw so a drag on
 *  either surface can never re-frame the other (ADR-085 Decision 3). Double-click recenters AND
 *  un-zooms via resetMethodView (Show Method's own reset contract, not resetCompareView's). */
function setupMethodPan() {
  if (!methodCanvas) return;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  methodCanvas.addEventListener('pointerdown', (e) => {
    stopMethodFocusAnim(false); // user input wins — freeze wherever a focus tween currently is
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    methodCanvas.setPointerCapture(e.pointerId);
    methodCanvas.style.cursor = 'grabbing';
  });
  methodCanvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    methodPanX += e.clientX - lastX;
    methodPanY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    queueMethodRedraw();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (methodCanvas.hasPointerCapture?.(e.pointerId)) {
      methodCanvas.releasePointerCapture(e.pointerId);
    }
    methodCanvas.style.cursor = 'grab';
  };
  methodCanvas.addEventListener('pointerup', endDrag);
  methodCanvas.addEventListener('pointerleave', endDrag);
  methodCanvas.addEventListener('pointercancel', endDrag);
  methodCanvas.addEventListener('dblclick', () => {
    resetMethodView();
    if (methodViewOpen) drawMethodView();
  });

  methodCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    stopMethodFocusAnim(false); // user input wins — freeze wherever a focus tween currently is
    const rect = methodCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const midX = rect.width / 2;
    const midY = rect.height / 2;
    const factor = Math.exp(-e.deltaY * 0.0015);
    const nextZoom = Math.min(COMPARE_ZOOM_MAX, Math.max(COMPARE_ZOOM_MIN, methodZoom * factor));
    if (nextZoom === methodZoom) return; // clamped — nothing to do
    const k = nextZoom / methodZoom;
    methodPanX = (mx - midX) * (1 - k) + methodPanX * k;
    methodPanY = (my - midY) * (1 - k) + methodPanY * k;
    methodZoom = nextZoom;
    queueMethodRedraw();
  }, { passive: false });
}

// ============================================================================
// Platform API (CLAUDE.md "Platform contract")
// ============================================================================

function resetCamera() {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

/**
 * The platform calls pause() when overlays/whiteboard open and resume() on close.
 * reset() restores defaults and routes through rebuild() — the one reset path
 * the in-sim Reset button must also use (CLAUDE.md: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    // Single reset path (CLAUDE.md): return to the EMPTY START + Step 1. Clear the
    // rotation modes, all revealed layers (labels, projections), and any fold, then
    // empty the scene and re-drive both the controls and the wizard.
    // Show Method (ADR-085) torn down FIRST, via the SAME synchronous teardownShowMethod() every
    // other exit path uses (no-op if it wasn't running) — this is what pairs window.simAPI's
    // pause()/resume() correctly (a reset while the takeover is open must resume the loop, or
    // the sim comes back from reset permanently frozen). Safe unconditionally now that teardown
    // is synchronous (ADR-085 retired the collapse tween, so there is no pending onComplete that
    // could fire after rebuild(null) and read/write stale state).
    teardownShowMethod();
    compare.hide(); // no-op when closed; also tears the workbench split down first
    resetCompareView(); // ADR-054/055: hide() doesn't touch pan/zoom — a Reset must return the sheet to 1×/centred for the next open
    modes.faceInclinationHP = false;
    modes.faceInclinationVP = false;
    modes.orientToCorner = false;

    cancelTweens();
    foldTween = null;
    cameraTween = null;
    autoZoomTween = null;
    showLabelsFlag = false;
    showProjectionsFlag = false;
    showSideViewFlag = false;
    showDimensionsFlag = false;
    showConnectorsFlag = true; // restore the de-clutter default; sync its checkbox below
    if (connectorToggleEl) connectorToggleEl.checked = true;
    foldProgress = 0;
    if (vpFoldGroup) vpFoldGroup.rotation.z = 0;
    if (ppHingeGroup) ppHingeGroup.rotation.y = 0;
    applyProfilePlaneVisibility(false);
    setRefLabelOpacity(0);     // 2D-drawing annotations belong to the folded state only
    setFirstAngleSymbol(false);

    restorePerspective(); // leave any quick-view / answer-sheet ortho pose
    resetCamera();
    rebuild(null); // empty: disposes solid + projection, clears labels (grids remain)
    ui?.sync();
    stepper?.reset();
    methodController?.sync(); // reconcile its DOM against the hard teardown above
    announce('Simulation reset. Add a solid to begin.');
  },
};

/**
 * Step-6 "Complete & next problem": close out the finished drawing and send the learner
 * on to the next challenge. Celebrates calmly (live region + success toast — no gamified
 * fanfare, DESIGN.md), clears any active-problem framing, resets the bench through the
 * SINGLE reset path, then opens the Problem Library to choose what's next.
 *
 * Order matters: reset() narrates "Simulation reset…", so the celebratory line is
 * announced LAST to win the live region. Resetting BEFORE opening also empties the bench,
 * so picking the next problem skips the "clears your work" confirm (hasSolid() is false).
 */
function completeAndNext() {
  const hadProblem = problemLibrary?.isActive?.() ?? false;
  problemLibrary?.exit?.();   // clear the active-problem header (keeps the drawing)
  window.simAPI.reset();      // single reset path: empty scene + Step 1 + default camera
  showToast('Drawing complete');
  problemLibrary?.open?.();   // open the library to pick the next problem (pauses the loop)
  announce(hadProblem
    ? 'Drawing complete — well done. Choose your next problem to continue.'
    : 'Drawing complete — well done. Pick a problem to keep practising.');
}

// ============================================================================
// UI controller — the narrow surface uiManager.js depends on. Keeps state
// (currentShapeData, modes) and the rebuild/applyMode pipeline owned here; the
// dock only reads through getters and writes through commit/setMode/reset, so
// the layering rule holds (uiManager imports no other layer).
// ============================================================================

const simController = {
  ShapeType,
  state: () => currentShapeData,
  modes: () => ({ ...modes }),
  isPyramidType,

  /** The manual turn (rotationY°) that reproduces the orient-to-corner preset for a
   *  shape, and the base's rotational-symmetry period (°). The Problem Library self-check
   *  uses these to accept a hand-dialled turn that lands on the same pose as the preset —
   *  reusing orientationAngle/orientationPeriod as the single source of truth (the leaf
   *  layer cannot reach the orchestrator directly). */
  orientAngle: (shape) => orientationAngle(shape),
  orientPeriod: (shape) => orientationPeriod(shape),

  /** Minimum distVP (world units) that keeps the nearest face in front of the VP. Only
   *  axis-referenced placement risks clipping; nearest-point seating already rests the
   *  face on the plane, so its floor is 0. uiManager.refreshVpBound caps the slider on it. */
  vpMinUnits: () => (currentShapeData?.distVPRef === 'axis' ? vpAxisInset : 0),

  /** Whether a solid currently exists (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

  /** The live solid's effective (post-rotation-hierarchy) angles — computeEffectiveAngles'
   *  result against the CURRENT shapeData + modes, `null` before a solid exists. Was previously
   *  internal-only (main.js's own rebuild() call). Show Method (methodController.js) needs this
   *  to label Set-2/Set-3 with the ACTUAL axis angle a face-inclination problem resolves to —
   *  the raw angleHP slider is not that angle (see computeEffectiveAngles' header). */
  effectiveAngles: () => (currentShapeData ? computeEffectiveAngles(currentShapeData) : null),

  /** The Problem Library's currently-loaded problem object (or null in free-explore) — see
   *  activeProblemRef's declaration for why this is a separate channel from problemLibrary.js's
   *  own ADR-083 return contract. problemLibrary.js calls setActiveProblem; nothing else should. */
  activeProblem: () => activeProblemRef,
  setActiveProblem(p) { activeProblemRef = p; },

  /** Canonical defaults — lets the dock show placeholder values on the empty
   *  start without importing the data layer (keeps uiManager a leaf). */
  defaults: () => defaultShapeData(),

  /**
   * Step 1: create the first solid from the empty start. Seeds canonical defaults,
   * optionally overriding the shape, and locks a cube's height to its base length.
   * @param {string} [shape] ShapeType to start with (defaults to the canonical Cube).
   */
  addSolid(shape) {
    const data = defaultShapeData();
    if (shape) data.shape = shape;
    if (data.shape === ShapeType.Cube) data.height = data.baseLength;
    rebuild(data);
    ui?.sync();
  },

  /** Merge params into state and rebuild. Bases on defaults if no solid yet. */
  commit(partial) { rebuild({ ...(currentShapeData ?? defaultShapeData()), ...partial }); },
  setMode(mode, enabled) { applyMode(mode, enabled); },

  /** Step 4–6 layer toggles (idempotent). */
  setLabels(on) { setLabelsVisible(on); },
  // setProjections/setSideView (ADR-162): the wizard itself now only calls drawViews below —
  // these two kept as their own idempotent facade members (matching setLabels/setDimensions'
  // shape) so re-asserting one flag alone stays possible for a future direct caller without
  // replaying the whole reveal animation. window.simAPI.reset() bypasses all three, writing
  // the raw module flags itself (it also resets state a full rebuild would otherwise animate).
  setProjections(on) { setProjectionsVisible(on); },
  setSideView(on) { setSideViewVisible(on); },
  /** Step 5 (ADR-162): the wizard's single "Draw the three views" action — see revealViewsSequence. */
  drawViews(hooks) { revealViewsSequence(hooks); },
  setDimensions(on) { setDimensionsVisible(on); },

  /** De-clutter toggle for the dashed connector lines (persists across rebuild). */
  setConnectors(on) { setConnectorsVisible(on); },
  flatten() {
    animateFold(1);
    swoopToAnswerSheet();
    setFirstAngleSymbol(true);
    // First-seen hint as the dashed projectors sweep across the ground line — only when
    // the connectors are actually shown (don't point at hidden lines). Once-ever, so a
    // reflow unflatten→re-flatten never replays it.
    if (showConnectorsFlag) onboarding?.spotlight('connectors');
  },
  unflatten() {
    // Land the unfold on a fresh fit of the solid (~FRAME_PADDING margin) rather than the loose
    // retained pose: preserve the current orbit ANGLE, recenter the pivot on the solid, and set
    // the distance via the projected-box fit. restorePerspective reads camera.position /
    // controls.target as its glide destination, so write them before the glide starts.
    const dir = camera.position.clone().sub(controls.target);
    if (dir.lengthSq() > 1e-6) frameToSolid(dir.normalize());
    animateFold(0);
    // Glide the camera back to the 3D view on the fold's own timing + curve, so the camera
    // and the planes spring up together (mirror of flatten's swoop, not an instant snap).
    restorePerspective(true, FLATTEN_MOVE_MS, easeFold);
    setFirstAngleSymbol(false);
  },

  /** Quick-view camera snap (Top/Front/Side), or toggle back to perspective. */
  setView(kind) { setView(kind); },

  reset() { window.simAPI.reset(); },

  /** Step-6 progression: celebrate, clear the problem, reset, open the library. */
  completeAndNext,
  /** Whether a textbook problem is currently loaded (drives the Step-6 button label). */
  isProblemActive: () => problemLibrary?.isActive?.() ?? false,

  /** Show Method (ADR-084, container moved to its own takeover by ADR-085) — the narrow
   *  surface methodController.js drives, mirroring problemLibrary.js's own leaf pattern (it owns
   *  its own DOM/beat state and reaches the engine only through here). Implementations are free
   *  functions elsewhere in this file (see the "SHOW METHOD" section, beside drawMethodView). */
  method: {
    /** Whether Show Method may be started right now: a solid exists, the sheet is flattened,
     *  and the loaded problem's (or free-explore's) tier isn't 'base'/'corner-edge'. */
    canRun: () => methodCanRun(),
    /** Build every Set headlessly (once) and open the takeover at Set 1 / beat 1. */
    begin: () => beginShowMethod(),
    /** Normal completion — closes the takeover, resumes the sim loop, and resets its own
     *  pan/zoom/focus state (ADR-085; no longer touches Compare's resetCompareView). */
    end: () => endShowMethod(),
    /** Learner edited Step 1/2 mid-method (stepper.js reflowFrom, or unfold) — engine-only
     *  teardown (no-op if nothing is running). methodController's own DOM (.method-bar/chips,
     *  the Step-6 button's hidden state) is NOT touched here — it reconciles itself reactively
     *  the next time sync() runs (its onStateChange subscription, or the explicit refresh()
     *  call stepper.js makes right after), by noticing `running` is stuck true while
     *  isActive() has already gone false. This one-way flow (engine tears down → controller
     *  reconciles) is what keeps this from being a second, competing teardown path. */
    abort: () => abortShowMethod(),
    /** Whether the engine considers a walkthrough currently active — methodController's sync()
     *  uses this to detect an EXTERNAL teardown (stepper.js's abort, or a full sim reset) that
     *  happened without going through its own Exit button / Next-when-done path. */
    isActive: () => methodActive,
    /** Advance/jump the walkthrough to a given (set, beat) — Next-button driven only; never
     *  called by the focus chips (Decision 7, ADR-084 audit round 2). */
    setProgress: (set, beat) => setMethodProgress(set, beat),
    /** Set-N focus chip target, or `null` to frame the whole row. Purely visual — never moves
     *  setProgress. */
    setFocus: (i) => setMethodFocus(i),
    /** Re-check whether the Step-6 trigger should be enabled — stepper.js calls this right
     *  after flatten()/unflatten() (methodCanRun() depends on foldProgress, but flatten/
     *  unflatten don't run through rebuild(), so they aren't covered by the onStateChange
     *  subscription methodController already uses for angle-driven changes). */
    refresh: () => methodController?.sync(),
    /** Read-only summary for the chip UI: [{ label, reached }], reached = has this Set been
     *  drawn at least once (mirrors stepper.js's one-way-back `current || complete` gate). */
    sets: () => methodSetsSummary(),
    /** ADR-090 — does (set, beat) actually add a mark to the sheet? methodController.js's
     *  goNext/goBack loop past any beat this reports false for, so every click a learner makes
     *  produces a visible change. `true` for an out-of-range Set (defensive; never expected). */
    hasContent: (set, beat) => methodSets[set]?.contentBeats?.[beat] ?? true,
    /** ADR-094 — the single source of truth `METHOD_BEAT_COUNT` this file keeps, exposed so
     *  methodController.js can assert its own hand-duplicated `BEAT_COUNT` twin matches at init
     *  instead of trusting the "these must move together" comment alone. */
    beatCount: METHOD_BEAT_COUNT,
    /** ADR-094 — plain-language caption for (set, beat), read from the same `trueShape`/label
     *  data `methodContentBeats` already derives its A/B view split from. Never guesses at a
     *  numeric position; out-of-range Set returns ''. */
    beatLabel: (set, beat) => methodBeatLabel(set, beat),
    /** Whether the CURRENT Set is a Set-to-Set tilt's destination — true only for the
     *  both-planes tier's Set 3 (ADR-093's `turnDeg`, non-null only there) AND
     *  `methodArcEligible` (the rigid-2D-motion claim only holds when Set 3's true-shape view is
     *  genuinely the top view — the same guard `startMethodTilt` itself already required, ADR-105
     *  folds it in here too so this one predicate backs the auto-play gate (methodController.js
     *  goNext), the replay control's visibility, AND the engine's own guard — previously
     *  `turnDeg != null` alone could show/enable a control `startMethodTilt` would then no-op). */
    // ADR-110: widened from "turn only" to also accept a Set1→Set2-shaped TILT
    // (methodStepIsXTilt) — see startMethodTilt's own header for which of the two applies.
    canTilt: () => {
      const set = methodSets[methodSet];
      const prevSet = methodSets[methodSet - 1];
      if (!set || !prevSet) return false;
      if (set.turnDeg != null) return methodArcEligible(set);
      return methodStepIsXTilt(prevSet, set);
    },
    /** Play the tilt from the previous Set's pose into the current one (startMethodTilt's own
     *  header has the full contract). Same boolean-return, no-op-on-false shape as begin(). */
    playTilt: () => startMethodTilt(),
  },

  announce,
  flowNote,
  markComplete,

  /** Flash an ad-hoc contextual chip (the floating-cue system) over the viewport — replays
   *  each call, unlike the first-seen spotlights. The Problem Library uses it for per-load
   *  nudges. No-op if onboarding failed to init. */
  cueHint(text) { onboarding?.cue?.(text, 'hp'); },

  /** Register a callback fired at the end of every rebuild() (any parameter/mode
   *  change, including the empty reset). Returns an unsubscribe fn. The Problem
   *  Library's self-check uses this. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
};

// ============================================================================
// Self-start (CLAUDE.md: sim runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container; // module-wide handle for live LineMaterial resolution

  // The one operation here that can hard-fail is WebGL context creation (hardware
  // acceleration off, GPU blocklisted, ancient browser). Everything downstream
  // needs the renderer, so catch it, surface the on-brand WebGL fallback instead
  // of a blank iframe, and bail cleanly. (CLAUDE.md: sandboxed-iframe robustness.)
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  // Chrome + control wiring. Wrapped too so an unexpected wiring failure shows the
  // generic fallback rather than half-booting into a confusing partial UI.
  try {
    faSymbolEl = document.getElementById('fa-symbol');
    setupMobileNotice();
    setupWizardToggle();
    setupQuickViews();
    setupConnectorToggle();
    setupCompareCard(); // Compare chip/card/expand-close + the workbench rail toggle
    setupMethodView(); // Show Method's own takeover surface (ADR-085) — independent of Compare
    syncCompareChipVisibility(); // starts hidden — no views projected yet at boot
    ui = initUIManager(simController);
    stepper = initStepper(simController);
    problemLibrary = initProblemLibrary(simController); // textbook problem library + self-check
    methodController = initMethodController(simController); // Show Method walkthrough (ADR-084)
    initTerms(); // wire the inline term-definition popovers (static markup)
    onboarding = initOnboarding(controls); // empty-state overlay + one-time orbit hint

    new ResizeObserver(() => handleResize(container)).observe(container);

    // EMPTY START (PRODUCT.md guided stepper): the scene boots with grids only — no
    // default solid. Step 1 of the wizard adds the first solid via simController.
    // No rebuild() here by design; the loop renders the empty reference planes.
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Tell the watchdog the sim is live (clears its timer, hides any slow-load
  // fallback). Done last so it only fires on a fully successful boot.
  markBooted();
}

init();
