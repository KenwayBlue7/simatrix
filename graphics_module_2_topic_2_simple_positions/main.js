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
import { initVertexLabeler } from './src/vertexLabeler.js';
import { buildEdgeMap } from './src/meshAnalyzer.js';
import { drawProjections } from './src/projectionDrawer.js';
import {
  tween, tick as tickTweens, cancelAll as cancelTweens,
  easeFold, easeCamera, easeDraw, easeDissolve, easeStandard,
} from './src/anim.js';

const DEG2RAD = Math.PI / 180;

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

/** Baseline camera-move duration — the 2D answer-sheet pan and the default for
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

/** CSS2DRenderer overlay for vertex labels (Step 3). Rendered each frame on top
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

/**
 * The solid's X half-extent toward the VP, in world units — recorded by
 * seatOnPlanes() every rebuild (= −minX of the rotated mesh, axis at local x=0).
 * It is the minimum non-clipping `distVP` when measuring to the AXIS: axis-ref
 * seats the axis at position.x = distVP, so the nearest face reaches the VP wall
 * (x = 0) only while distVP ≥ this inset. The dock reads it via simController.vpMinUnits()
 * to cap the VP-distance slider. Rotation-only, so independent of distVP/distHP.
 */
let vpAxisInset = 0;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

/** Textbook Problem Library handle from initProblemLibrary — { dispose }. */
let problemLibrary;

/** First-run onboarding handle from initOnboarding — { setSolidPresent }. */
let onboarding;

/** Holds the active solid (+ its edge overlay, + future projections). The
 *  disposal contract iterates this group's direct children, so everything
 *  per-shape is added here as a sibling — never nested. */
let shapeGroup;

/** Reference grids for the three reference planes, hoisted to module scope so the
 *  flatten step can fold the VP and PP. HP stays fixed; VP lives inside vpFoldGroup;
 *  PP lives inside ppHingeGroup (itself nested in vpFoldGroup). */
let hpGrid;
let vpGrid;
let ppGrid;

/**
 * Hinge for the profile plane's flatten fold (Step 6). Parented to the SCENE (world
 * space — a sibling of vpFoldGroup, NOT nested in it) and translated onto the HP∩PP
 * line at the PP standoff (position (0, 0, z0), z0 set per rebuild from the solid's
 * depth). Rotating it about its LOCAL X by PP_FOLD_TARGET (−90°) folds the profile
 * plane down onto the HP, landing the side view beside the TOP view at (x, 0, z0 − y).
 * Holds the PP grid, the PP label, and — once drawn — the PP projection subgroup.
 */
let ppHingeGroup;

/**
 * Pivot at the world origin for the "flatten to 2D" fold (Step 5). Holds the VP
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

// --- Stepper-driven view state. The wizard flips these; rebuild() honours them so
//     editing the solid keeps labels/projections/fold consistent. ---
let showLabelsFlag = false;      // Step 3 on
let showProjectionsFlag = false; // Step 4 on — top (HP) + front (VP) views
let showSideViewFlag = false;    // Step 5 on — profile plane (PP) revealed + side view drawn
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

/** VP fold angle at foldProgress = 1: +90° about Z swings the VP's top edge
 *  BACKWARD (away from the +X observer) down into the horizontal plane, landing
 *  the front view on the opposite side of the ground line from the top view —
 *  the standard unfolded layout. Sign re-derived visually (CLAUDE.md). */
const FOLD_TARGET = Math.PI / 2;

/** PP fold angle at foldProgress = 1, applied to ppHingeGroup's LOCAL X in WORLD space
 *  (the hinge group is parented to the scene, NOT inside vpFoldGroup). −90° about X folds
 *  the profile plane DOWN onto the HP about the HP∩PP line (the world X-axis at z = z0),
 *  carrying its local point (x, y, 0) to (x, 0, z0 − y) — beside the TOP view, sharing the
 *  top view's X band (the 4th-quadrant layout). Independent of the VP fold. Sign pairs with
 *  visibleInPP's `worldNormal.z > 0`; re-derive visually (square pyramid apex must point
 *  consistently with the top view — flip to +Math.PI/2 if mirrored) (CLAUDE.md). */
const PP_FOLD_TARGET = -Math.PI / 2;

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
 * Rotation-mode flags. SIMPLE-POSITIONS build: face inclination is removed, so the
 * only mode is the orient-to-corner base-orientation preset. The parameter dock
 * (next layer) flips it via applyMode().
 */
const modes = {
  orientToCorner: false, // base orientation: per-shape preset turn about the axis
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

/** Pyramid/cone classification — still used by the dock to label the orient preset
 *  ("Orient to edge" for the hexagonal pyramid). (Visualizer.IsPyramidType) */
function isPyramidType(shape) {
  return PYRAMID_TYPES.has(shape);
}

// ============================================================================
// Pose resolution — SIMPLE-POSITIONS build.
//
// The axis is never inclined: it is PERPENDICULAR to the resting plane and
// parallel to the other. Two things determine the pose:
//   1. restingPlane — HP ⇒ axis vertical (no lay-down); VP ⇒ lay the base onto
//      the VP (a fixed −90° Z-roll, reusing the master build's VP swing).
//   2. Base orientation about the solid's own axis — orient-to-corner preset
//      (higher priority) else the manual rotationY slider.
// (No face inclination, no angleHP/angleVP tilt — those master-build features are
// removed in this clone; see shapeData.js.)
// ============================================================================

/**
 * Per-shape preset Y angle for "Orient to Corner / Edge".
 * Pentagonal pyramid magnitude is 54° (= 90° − 360°/10), NOT 18° — CLAUDE.md
 * calls this out explicitly as a corrected value. The SIGN is NEGATIVE
 * (−54°): the base geometry sits at alignmentOffset(5, FLAT_EDGE_FRONT) = −π/2
 * (flat edge at +Z, lone vertex at −Z), and applyShapeTransform maps a positive
 * rotationY to a DECREASE in vertex angle, so +54° drives the lone base corner
 * to +X (away from the VP, toward the camera) while −54° carries it to −X
 * (toward the VP), leaving the opposite edge running along Z (parallel to the
 * VP) at the front. Re-derived visually per CLAUDE.md ("every ported sign is
 * suspect"); +54° was a handedness/camera inversion. (Visualizer preset table.)
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
 * Resolve the data + the orient mode into the effective (angleHP, angleVP,
 * rotationY) that drive applyShapeTransform. The axis is never inclined, so
 * angleHP is always 0; resting on the VP is a fixed −90° Z-roll expressed as
 * angleVP = 90 (applyShapeTransform negates it). This is the same VP swing the
 * master build used for face-inclination-VP, here applied to the whole solid so
 * its BASE — not a slant face — lies in the VP.
 *
 * SIGN NOTE (CLAUDE.md "re-derive every ported sign visually"): angleVP = 90 ⇒ a
 * Z-roll of −90°, which carries the build axis +Y onto +X (axis horizontal) and
 * lays the base into the VP (YZ plane). rotationY is applied BEFORE the roll
 * (Euler 'ZXY'), so it spins the base about the solid's own axis in both planes.
 * Re-verify visually for a prism + the square pyramid.
 *
 * @param {import('./src/shapeData.js').ShapeData} data
 * @returns {import('./src/shapeData.js').ShapeData} effective shape data (copy)
 */
function computeEffectiveAngles(data) {
  // Base orientation about the solid's own axis: orient-to-corner preset wins,
  // else the manual turn.
  const spin = modes.orientToCorner ? orientationAngle(data.shape) : data.rotationY;
  return {
    ...data,
    angleHP: 0,                                     // axis never inclined
    angleVP: data.restingPlane === 'VP' ? 90 : 0,   // 90 ⇒ lay the base onto the VP
    rotationY: spin,
  };
}

/**
 * Flip a rotation mode on/off, then rebuild. In this build the only mode is the
 * orient-to-corner preset (face inclination is removed); the parameter dock is
 * the caller.
 *
 * @param {'orientToCorner'} mode
 * @param {boolean} enabled
 */
function applyMode(mode, enabled) {
  if (!currentShapeData) return; // no solid yet (empty start) — nothing to mode

  modes[mode] = enabled; // dock announces the per-shape label (corner vs edge)
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
 * self-heals (the fallback disappears the moment the sim is live).
 */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) {
    clearTimeout(window.__simBootTimer);
    window.__simBootTimer = null;
  }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
  // Platform iframe contract (ADR-078): announce a displayable sim to the host loader.
  // Gated on document.fonts.ready so the host never reveals us mid-FOUT.
  document.fonts.ready.then(() => {
    window.parent.postMessage({ type: 'sim:ready' }, '*');
  });
}

/**
 * Signal lesson completion to the host (ADR-078 addendum): the learner has reached this
 * lesson's finished state, so the host can surface its "next topic / stay" overlay.
 * Fires at most once per page load — the latch is deliberately NOT cleared by
 * simAPI.reset(), so replaying a lesson never re-opens the host overlay.
 */
function markComplete() {
  if (window.__simComplete) return;
  window.__simComplete = true;
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
  const positions = mesh.geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  let minX = Infinity;
  let minY = Infinity;

  // Rotate every vertex into the mesh's current orientation and track the
  // extremes. Setting obj.rotation keeps obj.quaternion in sync, so this matches
  // what the GPU will render. Vertex counts are tiny (a few dozen), once per rebuild.
  for (let i = 0; i < positions.count; i++) {
    vertex.fromBufferAttribute(positions, i).applyQuaternion(mesh.quaternion);
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
  mesh.position.set(xPlace, data.distHP - minY, 0);

  // Record the axis→nearest-face inset (the rotated X half-extent toward the VP) so
  // the dock can cap distVP in axis-ref mode and never let the solid clip the wall.
  vpAxisInset = -minX;
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
  // axis is the VP∩PP line at this z0; projectPP draws the side view at the hinge's
  // local z=0, so this Z position is the plane's whole standoff (mirrors HP/VP gaps).
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
 * side view only BECOMES VISIBLE once the side-view step is reached: the PP subgroup
 * lives under ppHingeGroup, whose `.visible` mirrors showSideViewFlag (false through
 * Step 4, true from Step 5). So Step 4 shows the top + front views; Step 5 reveals the
 * profile plane and its side view by un-hiding the hinge group — no separate redraw.
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
  // Pass the seated PP standoff (set in rebuild before this runs) so the flat
  // connectors can land the side-view projectors at z0 − x in the folded layout.
  activeProjection = drawProjections(edgeMap, { width, height, z0: ppHingeGroup.position.z });

  // HP top view + connectors render in world space; the VP front view hinges on
  // the ground line, so move it under the fold pivot. The PP side view hinges on the
  // VP∩PP line, one level deeper, so move it under the PP hinge group.
  shapeGroup.add(activeProjection.group);
  vpFoldGroup.add(activeProjection.vpGroup);
  ppHingeGroup.add(activeProjection.ppGroup);

  // Re-assert the profile plane's reveal state after a rebuild re-parents the PP
  // subgroup: it stays hidden through Step 4 (top + front only) and shows from Step 5.
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
  // Independent second fold (world space, NOT nested in vpFoldGroup): swing the profile
  // plane DOWN onto the HP about the HP∩PP line (local X at z0), landing the side view
  // beside the TOP view at (x, 0, z0 − y). Same progress p drives both folds so they
  // complete together.
  if (ppHingeGroup) ppHingeGroup.rotation.x = PP_FOLD_TARGET * p;

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
    // only revealed at Step 5. Gate them additionally on showSideViewFlag so they never
    // appear at Step 4 alongside the HP/VP connectors, then fade with the solid like those.
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
// Step actions — labels (Step 3), top + front views (Step 4), side view (Step 5),
// flatten (Step 6). Exposed to the wizard through simController; each is idempotent
// and routes any geometry side-effects through the refresh helpers above.
// ============================================================================

function setLabelsVisible(on) {
  showLabelsFlag = on;
  refreshLabels();
}

function setProjectionsVisible(on) {
  showProjectionsFlag = on;
  refreshProjections();
  // The Compare chip's 2D gate (Step 4's top+front) and any open sheet both track this flag.
  syncCompareChipVisibility();
  if (compareOpen) drawCompare();
  // Sync the freshly built projection to the current fold state — at Step 4 the
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
 */
function setSideViewVisible(on) {
  showSideViewFlag = on;
  applyProfilePlaneVisibility(on);
  // Sync the 3D side-view connectors to the new flag through the same path rebuild uses
  // (they live in world space, gated on showSideViewFlag inside applyFoldVisual). This is
  // what hides them again when the step is turned off.
  applyFoldVisual(foldProgress);
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
 * Step 6 (optional): reveal the BIS Type-B dimension layer on the top + front views —
 * overall width / height + the distances from HP / VP, with FILLED 3:1 arrowheads
 * (projectionDrawer hpDimensionGroup + vpDimensionGroup, ADR-041). The layer was built in
 * refreshProjections but held hidden; this un-hides it and draws it on. Idempotent; the flag
 * persists across rebuilds (refreshProjections re-asserts it via applyDimensionVisibility).
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
  solidAppearing = target < foldProgress; // arm the appear curve when unfolding (flat → 3D)
  foldTween = tween({
    from: foldProgress,
    to: target,
    duration: FOLD_DURATION_MS,
    ease: easeFold, // heavy ease-in-out — the graceful physical hinge
    onUpdate: applyFoldVisual,
    onComplete: () => { foldTween = null; },
  });
}

// ============================================================================
// Camera framing — quick-views (Top/Front/Side) + the Step-6 answer-sheet swoop.
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

  const sphere = new THREE.Box3()
    .setFromObject(currentMesh)
    .getBoundingSphere(new THREE.Sphere());
  if (sphere.radius <= 0) return;

  // Enclose the solid in a TARGET-centred sphere (the target stays put), so the required
  // distance is a safe over-estimate that guarantees no clip while keeping a pure dolly.
  const target = controls.target;
  const R = target.distanceTo(sphere.center) + sphere.radius;

  // Limiting half-FOV across both screen axes (the narrower one governs the fit).
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const dReq = (R / Math.sin(Math.min(vHalf, hHalf))) * FRAME_PADDING;

  const dCur = camera.position.distanceTo(target);
  if (dCur >= dReq) return; // already framed (or zoomed in within range) — never pull in

  // Dolly OUT along the current view direction to dReq. Capture dir once; the render loop's
  // activeControls.update() finalises damping each frame (mirrors tweenCamera). Guard the
  // degenerate camera-at-target case so normalize() can't yield a zero direction.
  const dir = camera.position.clone().sub(target);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();

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
 * Return to the perspective free-orbit camera (cancelling any in-flight ortho move).
 *
 * The perspective camera kept the learner's last orbit pose, so the HAND-OFF itself is just
 * a swap. By default that swap is instant (used by reset / unflatten, where the camera is
 * being repositioned anyway). When `animate` is true — re-clicking the active quick-view to
 * leave it — the ortho camera first GLIDES from its square-on pose back to the perspective
 * camera's retained pose (position, target, screen-up + a zoom matching the perspective
 * frustum at that distance), AND its projection matrix morphs from orthographic to
 * perspective over the same tween, so the swap lands seamlessly with no projection-type
 * cut and the learner keeps their spatial bearing. Reduced motion skips straight to the
 * swap.
 * @param {boolean} [animate=false] Tween the ortho camera back before handing off.
 * @param {number} [duration=CAMERA_MOVE_MS]  glide length (QUICK_VIEW_MS / FLATTEN_MOVE_MS callers)
 * @param {(x:number)=>number} [ease=easeStandard]  easing curve for the glide + morph
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
 * applyFoldVisual): top view (x,0,z); folded front view (−y,0,z); folded side view
 * (x,0,z0−y). The union spans those X/Z ranges; Y is flat.
 * @returns {THREE.Box3}
 */
function answerSheetBox() {
  const solid = contentBox();
  const { min, max } = solid;
  const z0 = ppHingeGroup.position.z;
  const M = 2.0; // match positionRefLabels overshoot so captions stay framed
  // X: top view (x) + front view (−y); the side view's X is the solid's x, already covered.
  // +M / −M push the boundaries out to the top + front caption edges.
  const xs = [min.x, max.x + M, -max.y - M, -min.y];
  // Z: top/front view (z) + side view (z0 − y, beside the top view on the −Z side).
  // −M extends the −Z boundary out to the side-view caption (see positionRefLabels).
  const zs = [min.z, max.z, z0 - max.y - M, z0 - min.y];
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
  //   • Side view  beside the TOP view at Z = z0 − y (shares the top view's X band, −Z side).
  // Caption each just clear of its view: top view below it (+X), front above (−X), side
  // beside the top view further along −Z.
  if (!topViewLabel) return;
  const groundCz = (box.min.z + box.max.z) / 2; // shared top/front horizontal centre
  topViewLabel.position.set(box.max.x + M, 0, groundCz);
  frontViewLabel.position.set(-box.max.y - M, 0, groundCz);
  const sideCx = (box.min.x + box.max.x) / 2;     // share the top view's X band
  const sideEdgeZ = z0 - box.max.y;                // side view's −Z (screen-left) edge
  sideViewLabel.position.set(sideCx, 0, sideEdgeZ - M); // M past the edge, not the centre
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
  // projection, added later) down onto the HP, hinged on the ground line (Step 5).
  vpFoldGroup = new THREE.Group();
  vpFoldGroup.add(vpGrid);
  scene.add(vpFoldGroup);

  // Profile plane (PP, side view). Normal +Z, so it lies in the XY plane: a GridHelper
  // defaults to XZ (normal Y), so tip it 90° about X to stand it in XY. It is parented
  // under ppHingeGroup, itself nested INSIDE vpFoldGroup, so the two-stage first-angle
  // motion composes: ppHingeGroup swings the side view coplanar with the VP about the
  // VP∩PP line (local Y), then vpFoldGroup carries VP+PP flat onto the HP. The hinge's
  // Z position (the PP standoff z0) is set per-rebuild from the solid's depth; default
  // here keeps the empty-scene grid clear of the origin.
  ppGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  ppGrid.material.opacity = 0.35;
  ppGrid.material.transparent = true;
  ppGrid.rotation.x = Math.PI / 2;

  ppHingeGroup = new THREE.Group();
  ppHingeGroup.position.z = DEFAULT_PP_STANDOFF;
  // The profile plane is the LAST plane introduced (Step 5), so it stays hidden
  // through the empty start and Steps 1–4 to keep the viewport uncluttered while the
  // learner works the HP/VP top + front views. setSideViewVisible reveals it.
  ppHingeGroup.visible = false;
  ppHingeGroup.add(ppGrid);
  scene.add(ppHingeGroup); // WORLD space — a sibling of vpFoldGroup, not nested in it

  // PP pill. Parented under the hinge so it rides the fold and stays labelled on the
  // flattened sheet, beside the folded side view (same rationale as the VP label
  // riding vpFoldGroup).
  ppPlaneLabel = makePlaneLabel('PP', 'pp');
  ppPlaneLabel.position.set(0, 4, 0);
  ppPlaneLabel.visible = false; // hidden with the profile plane until Step 5 (see ppPlaneLabel decl)
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
  // HP sits on the fixed floor grid; VP is parented to the fold pivot so it swings
  // down with the front view and stays labelled in the flattened 2D drawing.
  // Positions chosen so both pills stay on-screen in the default framing AND after
  // the fold (verified against the live camera). HP sits on the floor in the +X/−Z
  // corner, clear of the top view; VP rides the fold pivot at local (0, 4, −3) so
  // that when the plane swings down +90° about the ground line it lands at world
  // (−4, 0, −3) — mirror-symmetric to HP, beside the folded front view.
  const hpLabel = makePlaneLabel('HP', 'hp');
  hpLabel.position.set(4, 0, -3);
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

  // CSS2D overlay for vertex labels (Step 3). A transparent DOM layer sized to the
  // canvas; pointer-events disabled so drag-to-orbit passes through. Appended to
  // the same container as the canvas so it tracks the viewport's box exactly.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
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
// Compare view + 50/50 workbench (ADR-037 pattern, ported from the Module 2 Master:
// Module2/main.js). The on-demand 2D drawing (top/front/side views on one plain 2D
// <canvas>, ADR-034 — never a second WebGL context) plus the expanded workbench split
// that docks the FULL geometry driver set under both panes for a "solve & verify"
// read, deliberately overriding the wizard's one-idea-per-step disclosure while the
// split is open.
// ============================================================================

/** The [data-ctrl] wrapper keys re-parented into #workbench-rail, ORDERED so related
 *  drivers sit adjacent (#rail-toggle floats over the viewport pane now, not the rail, so
 *  this array's first entry lands in column 1 with no clearance to dodge): size (Base
 *  length + Height, already one bundled wrapper, spans both grid rows in column 1) →
 *  disthp + distvp (the two distances) → resting + roty (rests on / turn about the axis).
 *  This build has no tilt (angleHP/angleVP are removed, see CLAUDE.md "Pose model"), so
 *  unlike the Master's 7-wrapper set there is no anglehp/anglevp pair here. Shape, Add,
 *  and the mode toggles (orient-to-corner) stay in the wizard — they are not continuous
 *  geometry drivers, and the wizard itself is unreachable while the split is open
 *  (aria-label on #workbench-rail notes this). */
const WORKBENCH_CONTROLS = ['size', 'disthp', 'distvp', 'resting', 'roty'];
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
let workbenchRail = null;
/** @type {Map<string, {parent: Element, next: Node|null}>} Each driver wrapper's original
 *  {parent, nextSibling}, captured the first time it is re-parented so exitWorkbench can
 *  restore it to its EXACT home slot — these wrappers come home to TWO different Step
 *  panels (Step 1 and Step 2). */
const driverHomes = new Map();

/** The docked rail, created once and kept for the session. */
function ensureWorkbenchRail() {
  if (workbenchRail) return workbenchRail;
  workbenchRail = document.createElement('div');
  workbenchRail.id = 'workbench-rail';
  workbenchRail.setAttribute('role', 'group');
  workbenchRail.setAttribute('aria-label',
    'Geometry drivers. Shape, and the orientation mode toggle, stay in the steps panel.');
  document.body.appendChild(workbenchRail);
  return workbenchRail;
}

/** Collapse the wizard, split the viewport 50/50, and dock the driver wrappers under
 *  both panes. Idempotent. */
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

/** Restore the floating layout: hand the driver wrappers back to their captured home
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

/** Hide the chip until the lesson's 2D gate passes (Step 4's top + front views), preserving
 *  the pedagogy that the 2D drawing is meaningless before any view is projected. A closed
 *  gate also force-closes an open card (e.g. a reset mid-Compare). */
function syncCompareChipVisibility() {
  if (!compareChip) return;
  const ok = showProjectionsFlag;
  compareChip.hidden = !ok;
  if (!ok && compareOpen) compare.hide();
}

/** Single reset point for the Compare sheet's user-driven view state (ADR-054 pan + ADR-055
 *  zoom) — called on fresh open, dblclick recenter, and sim reset, so the three sites can't
 *  drift out of sync with each other. */
function resetCompareView() {
  comparePanX = 0;
  comparePanY = 0;
  compareZoom = 1;
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
 * (vpFoldGroup's +90° about Z: (x,y,z)→(−y,x,z); ppHingeGroup's −90° about local X at its
 * z0 hinge: (x,y,z)→(x,z,−y)) so the folded points land exactly where the 3D pane's own
 * fold puts them.
 *
 * ADR-052 (answer-sheet projection, replaces the old same-axis toCanvas): those folded
 * WORLD points are then run through the answer-sheet camera's OWN top-down projection —
 * not a naive (worldX, worldZ) passthrough. swoopToAnswerSheet uses
 * QUICK_VIEWS.top.dir = (0,1,0) (looking down −Y) with FLAT_VIEW_UP = (−1,0,0); the
 * camera's screen-right basis vector is cross(forward, up) = cross((0,−1,0),(−1,0,0)) =
 * (0,0,−1), i.e. screenX ∝ −worldZ, and screen-up ∝ −worldX (matching "up = −X" — see
 * QUICK_VIEWS/FLAT_VIEW_UP comments). So sheet-space is (sheetX, sheetY) = (−worldZ,
 * −worldX) — front view above top view, side view to the RIGHT of top view — verified
 * pixel-for-pixel against the 3D pane's own rendered flatten (Step 6, first-angle
 * layout). The prior mapping used (worldX, worldZ) directly (no camera projection at
 * all), which produced a 90°-rotated, mirrored sheet (front left of top, side below).
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
  const sheetPP = (x, y, _z) => ({ x: y - z0, y: -x });        // side view: (x,y,z)→(x,z,z0−y)
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
  // sit centred near sheetX=0, but the Side block (sheetPP.x=y-z0) sits a further E+GAP to the
  // RIGHT of that, so the nominal layout's own centre is NOT world-origin — it's offset exactly
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
  // XY is the HP∩VP ground line (Front folds down to meet Top); X1-Y1 is the HP∩PP hinge
  // (Top+Front meet the Side view). ADR-056 (supersedes the 2026-07-16 visual-gap-midpoint
  // placement): each line is PINNED to its analytic hinge coordinate — sheetY=0 for XY,
  // sheetX=−z0 for X1-Y1 (see the sheetHP/sheetVP/sheetPP header derivation) — never a live
  // bbox midpoint, because the Front view's sheetY (=worldY) and the Side view's sheetX
  // (=worldY−z0) both move under the distHP slider (seatOnPlanes), which dragged the old
  // midpoint along with the geometry instead of leaving it as a fixed hinge. hpBox/vpBox/ppBox
  // are read ONLY to size each line's LENGTH along its own perpendicular axis (sheetX for XY,
  // sheetY for X1-Y1) — both of those axes are distance-slider-invariant (sheetHP.x=sheetVP.x=
  // −worldZ; sheetHP.y=−worldX), so the length can safely track the drawing without the
  // position drifting. Skipped entirely once nothing is drawable (guarded by the early return
  // above).
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
    // distHP/distVP — deliberately excludes the Side view (its sheetX tracks distHP via z0).
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
    const x1X = -z0; // analytic HP∩PP hinge (sheetX=−z0) — ADR-056, never the live view midpoint
    // Length spans the Top+Side block, on sheetY (=−worldX for Top, =−worldX for Side) which is
    // invariant under distHP/distVP — deliberately excludes the Front view (its sheetY=worldY
    // tracks distHP directly).
    const yMin = Math.min(hpValid ? hpBox.minY : ppBox.minY, ppBox.minY) - REF_OVERSHOOT;
    const yMax = Math.max(hpValid ? hpBox.maxY : ppBox.maxY, ppBox.maxY) + REF_OVERSHOOT;
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
  let redrawQueued = false;

  const queueRedraw = () => {
    if (redrawQueued) return;
    redrawQueued = true;
    requestAnimationFrame(() => {
      redrawQueued = false;
      if (compareOpen) drawCompare();
    });
  };

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
    // orientation mode, all revealed layers (labels, projections), and any fold, then
    // empty the scene and re-drive both the controls and the wizard. (restingPlane /
    // distVPRef live on shapeData and reset to their defaults via defaultShapeData().)
    compare.hide(); // no-op when closed; also tears the workbench split down first
    resetCompareView(); // ADR-054/055: hide() doesn't touch pan/zoom — a Reset must return the sheet to 1×/centred for the next open
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
    if (ppHingeGroup) ppHingeGroup.rotation.x = 0;
    applyProfilePlaneVisibility(false);
    setRefLabelOpacity(0);     // 2D-drawing annotations belong to the folded state only
    setFirstAngleSymbol(false);

    restorePerspective(); // leave any quick-view / answer-sheet ortho pose
    resetCamera();
    rebuild(null); // empty: disposes solid + projection, clears labels (grids remain)
    ui?.sync();
    stepper?.reset();
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
  markComplete,
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

  /** Whether a solid currently exists (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

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

  /**
   * Minimum non-clipping `distVP` for the CURRENT state, in world units. Nearest-ref
   * never clips (the nearest face is what gets seated at distVP) → 0. Axis-ref seats
   * the axis at distVP, so the solid pokes through the VP unless distVP ≥ the axis
   * inset (seatOnPlanes records it each rebuild). The dock caps its slider with this.
   * NOTE: distVP = 0 axis falls back to nearest in seatOnPlanes, so seating exactly in
   * the VP stays possible via the Nearest reference; the cap only blocks 0<distVP<inset.
   */
  vpMinUnits: () => (currentShapeData?.distVPRef === 'axis' ? vpAxisInset : 0),
  setMode(mode, enabled) { applyMode(mode, enabled); },

  /** Step 3–6 layer toggles (idempotent). */
  setLabels(on) { setLabelsVisible(on); },
  setProjections(on) { setProjectionsVisible(on); },
  setSideView(on) { setSideViewVisible(on); },
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

  announce,
  flowNote,

  /** Flash an ad-hoc onboarding chip in the viewport's bottom-centre slot — the same
   *  treatment as the "Drag to rotate" / view spotlights. The Problem Library uses it to
   *  surface a per-problem placement reminder. No-op before onboarding boots. */
  cueHint(text) { onboarding?.cue(text, 'hp'); },

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
    syncCompareChipVisibility(); // starts hidden — no views projected yet at boot
    ui = initUIManager(simController);
    stepper = initStepper(simController);
    problemLibrary = initProblemLibrary(simController); // textbook problem library + self-check
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
