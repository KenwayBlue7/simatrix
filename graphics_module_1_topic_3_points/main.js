// Orchestrator (Module 1 Topic 3 — Projection of Points).
//
// See CLAUDE.md. Boots an orbitable Three.js scene, the full platform contract
// (rebuild() pipeline, disposal contract, window.simAPI), the guided-step wizard
// (stepper.js driving the 5-step pointSteps.js sequence — the legacy Points
// lesson's copy verbatim), and the 3D lesson content on Module 2's orchestrator
// pattern (ADR-007, ADR-033): the HP/VP plane pair (hvPlanes.js), the point P +
// its two views p / p′ with their projectors (point.js — showHP / showVP reveal
// one shadow at a time), the CSS2D label layer (labelLayer.js — plane/point
// callouts, the I–IV quadrant numerals, the P(x, y, z) read-out, the BIS badge),
// the step-5 rabatment (anim.js easeFold tween hinging every riding leaf at
// once, with the ADR-036 orthographic fold swoop: the camera swoops square-on to
// the flattened answer sheet while the projection morphs perspective → ortho, so
// the fold ends as a TRUE flat 2D drawing — see driveFold), the on-demand Compare card hosting
// the finished 2D drawing (ADR-012 — Points is a `mode:'dual'` sim; see the
// `compare` state machine), the parameter dock (uiManager.js — HP/VP/PP mm
// sliders + the quadrant select), the glossary popovers (terms.js), and the
// first-run onboarding chips (onboarding.js — the legacy Points spotlights).
//
// World axes (engineering-correct, the Module-1 family convention — see
// Module1/CLAUDE.md §"3D scene conventions"):
//   HP = XZ plane (y = 0) · VP = XY plane (z = 0) · fold line = X axis
// pointData.resolvePosition() returns DATA-SPACE signed values (x = ±distVP,
// y = ±distHP, z = ±distRP); worldPosition() below remaps them onto these world
// axes — the same data-space → draw-space split the legacy Points lesson used.
//
// The textbook Problem Library is wired here (problemLibrary.js + the Points data
// in pointProblems.js): a quiet "Practice problems" entry opens a focus-trapped
// overlay of K.C. John / N.D. Bhatt problems; loading one resets to defaults,
// routes to Step 1, and runs a ±0.5 mm OR-array self-check (ADR-015) off the
// notifyStateChange() seam every rebuild() fires. The ortho quick-view camera
// cluster (Top/Front/Side chips) is wired here too — setupQuickViews() +
// simController.setView() engage a second OrthographicCamera and morph the
// projection matrix (projectionMorphK) from the perspective view to a TRUE
// square-on orthographic view of each reference plane (RULES.md §5.18 —
// the dual-camera matrix morph, ported from the legacy engine's `orthoViews`
// path); re-clicking the lit chip morphs the ortho camera back onto the
// free-orbit perspective pose. The fold reuses that SAME ortho camera + morph to swoop
// square-on to the answer sheet (ADR-036, overturns the old held-angle dolly) — the two live
// cameras never fight because every seam that moves one hands off to the other. STILL
// DEFERRED: the connector-declutter toggle — its
// chrome stays `hidden` in index.html.
//
// Layering rule (ADR-007 / RULES.md §3.6): main.js is the orchestrator and the
// ONLY place leaf modules meet.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { QuadrantType, defaultPointData, resolvePosition } from './src/pointData.js';
import { DEFAULT_VIEW } from './src/pointSteps.js';
import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initUIManager } from './src/uiManager.js';
import { initOnboarding } from './src/onboarding.js';
import { createHvPlanes, SHEET } from './src/hvPlanes.js';
import { createPointRig } from './src/point.js';
import { createLabelLayer } from './src/labelLayer.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeStandard, easeCamera, easeFold } from './src/anim.js';
import { PROBLEMS as POINT_PROBLEMS, TIERS as POINT_TIERS, FIELD_LABELS as POINT_FIELD_LABELS } from './src/pointProblems.js';
import { initProblemLibrary } from './src/problemLibrary.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded
// (RULES.md §4.1; the root DESIGN.md token table is the single runtime source).
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Named camera poses, one per teaching vantage — ported verbatim from the Topic 2
 *  sibling (its `showcase` pose framed the two-frustum illustration that topic owns;
 *  this topic has no frustums, so it is not carried over). Every pose keeps
 *  camera.x < 0 — the vantage lives off the X end of the fold line and looks back
 *  across the corner toward +X. `default` frames the whole 9×9 pair from the Q1
 *  side (restored by simAPI.reset()).
 *
 *  Q1–Q4 place the camera PHYSICALLY INSIDE the named room: each position's (y, z)
 *  sign pair IS the quadrant's own sign pair — Q1 (+y, +z) · Q2 (+y, −z, behind the
 *  VP) · Q3 (−y, −z) · Q4 (−y, +z, under the HP) — so a room-to-room flight genuinely
 *  crosses the dividing sheet(s): ±Z flips (east↔west) cross the VP, ±Y flips
 *  (north↔south) cross the HP, a diagonal (Q1↔Q3, Q2↔Q4) crosses both. Do NOT pull a
 *  pose back to the +Z side "for a better view" — the crossing is the lesson. The
 *  four rooms mirror one another so flyCamera's orbit sweeps at a near-constant
 *  radius. */
const CAMERA_POSE = {
  default: { position: new THREE.Vector3(-8.4, 5.6, 8.4), target: new THREE.Vector3(0, 0.6, 0.8) },
  Q1:      { position: new THREE.Vector3(-8, 4.9, 8),     target: new THREE.Vector3(0, 1.2, 1.5) },
  Q2:      { position: new THREE.Vector3(-8, 4.9, -8),    target: new THREE.Vector3(0, 1.2, -1.5) },
  Q3:      { position: new THREE.Vector3(-8, -4.9, -8),   target: new THREE.Vector3(0, -1.5, -1.8) },
  Q4:      { position: new THREE.Vector3(-8, -4.9, 8),    target: new THREE.Vector3(0, -1.4, 1.6) },
};

/** The default pose IS the table's `default` entry — resetCamera() and the
 *  flyCamera pose-equality guard share one truth. */
const DEFAULT_CAMERA_POSITION = CAMERA_POSE.default.position;
const DEFAULT_CAMERA_TARGET = CAMERA_POSE.default.target;

/** Camera flight duration (Module 2's CAMERA_MOVE_MS), on the easeCamera curve. */
const CAMERA_MOVE_MS = 900;

/** Quick-view directions + screen-ups (world axes: HP = XZ y=0, VP = XY z=0, fold line = X),
 *  ported verbatim from the legacy engine's `QV_DIR` table (Module1/src/engine.js). Each
 *  quick-view stands the ORTHOGRAPHIC camera off along `dir` from the framed geometry's centre
 *  and rolls it with `up`; the ortho `zoom` (fitOrthoZoomForView) does the actual framing, so
 *  the standoff length is cosmetic. This is the dual-camera §5.18 path — the TRUE square-on
 *  orthographic read, replacing the old approximate perspective vantage.
 *    • top   — look straight DOWN the −Y axis at HP. `up` = −Z keeps the roll defined where a
 *              straight-down view would otherwise hit the gimbal (legacy's convention).
 *    • front — look along −Z, head-on at the VP (the plane the Front chip squares onto).
 *    • side  — look along −X at the profile plane (PP), down the fold line's end. */
const QV_DIR = {
  top:   { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) },
  front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  side:  { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
};

/** Ortho frustum + fit constants (RULES.md §5.18; legacy engine values). ORTHO_FRUSTUM is the
 *  reference half-height of the ortho frustum in world units — per-view `camera.zoom` adapts the
 *  actual framing on top of it. FIT_PADDING keeps the ortho views a touch looser than a tight
 *  fit so flat-plane labels never clip at the frustum edge. */
const ORTHO_FRUSTUM = 12;
const FIT_PADDING = 1.12;

/** Data-space distance units → world units (the legacy toW: ÷ 10 — ADR-018's
 *  declared scale, 1 world unit = 10 mm: the default 20 mm distHP/distVP put P
 *  2.0 world units off each 9-unit plane sheet). */
const UNIT_TO_WORLD = 0.1;

/** The step-5 rabatment swing: 90° about the X fold line, 1600 ms on the heavy
 *  "physical hinge" curve (anim.js easeFold). Under prefers-reduced-motion the
 *  tween lands on its end value immediately (anim.js), so the fold still SNAPS —
 *  RULES.md §4.13 — with no second code path here.
 *
 *  ADR-036 (orthographic fold swoop — OVERTURNS ADR-013's held-angle hold): the fold IS a
 *  camera event, and it MUST end square-on. Forward, the camera swoops to a TRUE orthographic
 *  view of the flattened answer sheet (front-on along −Z at the VP) while the projection morphs
 *  perspective → orthographic on this same easeFold curve (swoopToAnswerSheet), so the folded
 *  corner reads as a flat 2D drawing with no residual foreshortening — mirroring the
 *  Spatial-Framework / Module-2 master. Reverse glides back onto the learner's retained
 *  perspective orbit pose (restorePerspective). Held-angle perspective folds are FORBIDDEN
 *  (RULES.md). */
const FOLD_ANGLE = Math.PI / 2;
const FOLD_MS = 1600;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;
let viewport;

/** The dual-camera orthographic stack (RULES.md §5.18). A second, ORTHOGRAPHIC
 *  camera + its own OrbitControls live alongside the perspective pair; a quick-view
 *  makes it live so the Top/Front/Side reads are TRUE orthographic projections
 *  (no foreshortening), while the perspective camera silently keeps the learner's
 *  orbit pose so returning is seamless. `activeCamera`/`activeControls` point at
 *  whichever pair the render loop draws + updates (perspective by default). */
let orthoCamera;
let orthoControls;
let activeCamera;
let activeControls;

/** The perspective↔ortho projection-matrix morph coefficient (RULES.md §5.18).
 *  null = no morph in flight (the loop renders each camera's own matrix). A number
 *  in [0,1] arms the blend: the loop lerps the ortho projection matrix toward the
 *  perspective one every frame (0 = pure ortho, 1 = pure perspective), so the
 *  hand-off between the two camera objects is a visual no-op instead of a
 *  depth-popping hard swap. */
let projMorphK = null;

/** CSS2D overlay renderer for the label layer — walks the same scene graph as the
 *  WebGL renderer, painting each CSS2DObject's DOM node at its projected point. */
let labelRenderer;

/** Holds all topic content. The disposal contract clears this group every rebuild
 *  (ADR-004): the HP/VP plane pair, the point rig, and the label layer live here. */
let contentGroup;

let rafId = null;
let running = false;

// --- Topic state: the single bag of numbers + flags rebuild() consumes ---

/** The point being positioned (pointData.js). Mutated ONLY via commit(). */
let currentData = defaultPointData();

/** The active step's viewport flags, merged over DEFAULT_VIEW by applyView().
 *  The stepper is the only writer; the geometry leaves are the readers. */
let currentView = { ...DEFAULT_VIEW };

/** Whether HP is folded down flat (the step-5 rabatment). Flips synchronously in
 *  fold()/unfold() — the stepper's done-gate reads it right after the call — while
 *  foldAngle below animates toward the matching pose. */
let folded = false;

/** The live hinge angle in radians (0 = open 3D corner, +π/2 = folded flat).
 *  Driven by the fold tween; rebuild() hands it to the fresh leaves so a rebuild
 *  mid-swing (or in the folded state) lands in pose. */
let foldAngle = 0;

/** Where the fold tween is HEADED (differs from foldAngle mid-swing). applyView's
 *  fold targeting compares against this so a step change mid-swing never restarts
 *  a tween toward where the hinge is already going. */
let foldTarget = 0;

/** In-flight fold tween handle (anim.js), or null. */
let foldTween = null;

/** The geometry leaves' controller handles, rebuilt by rebuild(), or null before
 *  the first build / while their view flags are off. */
let hvPlanes = null;
let pointRig = null;

/** The CSS2D label leaf's handle (same controller shape + generate/clear). Always
 *  rebuilt — even with every flag off — so the plane callouts and the BIS badge's
 *  visibility track the view on every path. */
let labelLayer = null;

/** In-flight camera-flight tween handle (anim.js), or null. A user drag cancels
 *  it (see the controls 'start' listener) so orbiting always wins mid-flight.
 *  The ADR-013 fold camera hold rides this same handle, so a fold move and a
 *  quadrant flight can never fight — starting either cancels the other. */
let cameraTween = null;

/** The lit quick-view chip's kind ('top' | 'front' | 'side'), or null when the camera
 *  is in free orbit / any other pose. setView() writes it; clearQuickView() resets it
 *  whenever ANOTHER motion takes the camera (a user drag, a quadrant flight, the fold,
 *  or reset) so the chip never stays lit for a view the camera has already left. */
let activeQuickView = null;

// --- Compare card state (ADR-012: the on-demand floating 2D-drawing card) ---

/** Whether the Compare card is showing. Only the `compare` state machine writes it. */
let compareOpen = false;

/** 'compact' | 'expanded' — the card's footprint. 'compact' is the floating
 *  drawing card (ADR-012); 'expanded' is the true 50/50 workbench split (ADR-037),
 *  where the wizard collapses, the 3D viewport takes the left pane, the 2D drawing
 *  docks as the right pane, and the point drivers re-parent into a rail under both. */
let compareSize = 'compact';

/** compareDefaultSize (ADR-037): the footprint Compare OPENS in on desktop. Points
 *  opens straight into the 50/50 workbench (parity with Lines' ADR-021 mode), unlike
 *  Lines which defaults compact and expands into it. Mobile ignores this (bottom-sheet). */
const COMPARE_DEFAULT_SIZE = 'expanded';

/** Whether the compare-split workbench is currently mounted (ADR-037). */
let workbenchOpen = false;

/** The docked driver rail (#workbench-rail), created lazily on first split. */
let workbenchRail = null;

/** The point drivers the rail surfaces at once — the workbenchControls set (ADR-037).
 *  The fold action (data-ctrl="anim") is NOT a driver, so it stays in the wizard. */
const WORKBENCH_CONTROLS = ['quad', 'hp', 'vp', 'pp'];

/** Compare chrome refs, bound once in setupCompareCard(). */
let compareCard = null;
let compareChip = null;
let compareCanvas = null;

/** The Top/Front/Side chip elements, bound once in setupQuickViews(). Empty until
 *  then, so syncQuickViewChips() is safe to call on any earlier path. */
let quickViewButtons = [];

/** Delta-time clock for the render loop (drives anim.js tickTweens). */
let lastFrameTime = 0;

/** The behaviour leaves' handles, set in init(). Re-synced after every commit /
 *  view change so the dock, the wizard chrome, and the scene always agree. */
let stepper = null;
let ui = null;
let onboarding = null;

/** The textbook Problem Library handle (problemLibrary.js) — { open, exit, isActive,
 *  dispose }. Null until init() wires it. The "Complete & next problem" flow and the
 *  stepper's button label read isActive() through it. */
let problemLibrary = null;

/** State-change subscribers, fired by notifyStateChange() at the end of every rebuild().
 *  The Problem Library's self-check registers here through simController.onStateChange —
 *  the single seam every parameter / step / reset change passes through. */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Small helpers
// ============================================================================

function viewportSize() {
  return {
    width: viewport?.clientWidth || 1,
    height: viewport?.clientHeight || 1,
  };
}

/** Narrate a state change to assistive tech (PRODUCT.md a11y commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/** Fire every state-change subscriber (see stateChangeSubs). Each callback is guarded so one
 *  throwing subscriber can never break the rebuild() pipeline. The Problem Library's self-check
 *  is the sole subscriber today (via simController.onStateChange). */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/** Whether the learner has dialled the point away from its defaults — the Problem Library's
 *  "loading clears your work" confirm guards on this (the legacy Points resetConfirmWhen). */
function hasDialedWork() {
  const d0 = defaultPointData();
  return currentData.distHP !== d0.distHP ||
         currentData.distVP !== d0.distVP ||
         currentData.distRP !== d0.distRP ||
         currentData.quadrant !== d0.quadrant;
}

/** ms the success toast stays up before fading. */
const TOAST_HOLD = 3500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Show a brief, calm success toast over the viewport — the "lesson complete" win
 * (Module 2 pattern, ported from the Topic 2 sibling). Token-driven success
 * styling + a check glyph (Two-Cue Rule), never gamified fanfare. setTimeout-driven
 * (not the rAF loop) so it fades independently of pause/resume. aria-hidden:
 * #sim-status already narrates the win, so this is not a second live region.
 * Auto-dismisses; a fresh call resets the timer.
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

/** Signal a successful boot to the index.html watchdog (clears its timer, hides any
 *  slow-load fallback). A late-but-successful boot therefore self-heals. */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) {
    clearTimeout(window.__simBootTimer);
    window.__simBootTimer = null;
  }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;

  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  // setSize(…, false) leaves the canvas CSS size to the stylesheet (width/height:100%),
  // which resolves to the container's FRACTIONAL box while the backing store uses the
  // integer w/h below — a sub-pixel upscale that softens the viewport. Pin the display
  // size to the same integer logical px so device pixels map 1:1 and the render stays crisp.
  pinCanvasSize(w, h);
  renderer.shadowMap.enabled = false; // no cast shadows (RULES.md §3.24)
  container.appendChild(renderer.domElement);

  // Flat CAD light: ambient fill + one low directional, no shadows (RULES.md §3.24).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();

  // The dual-camera ortho stack (RULES.md §5.18). A second OrthographicCamera shares
  // the canvas via its own OrbitControls; the frustum is seeded at the viewport aspect
  // (kept in sync by handleResize) and per-view zoom does the framing. Its controls stay
  // disabled until a quick-view engages it, so only one camera consumes pointer events at
  // a time. It starts on the perspective camera's pose so frame 0 of the first morph
  // doesn't jump.
  const aspect0 = (w || 1) / (h || 1);
  orthoCamera = new THREE.OrthographicCamera(
    -ORTHO_FRUSTUM * aspect0, ORTHO_FRUSTUM * aspect0, ORTHO_FRUSTUM, -ORTHO_FRUSTUM, 0.1, 200);
  orthoCamera.position.copy(camera.position);
  orthoCamera.up.copy(camera.up);
  orthoControls = new OrbitControls(orthoCamera, renderer.domElement);
  orthoControls.target.copy(controls.target);
  orthoControls.enableDamping = !prefersReducedMotion;
  orthoControls.dampingFactor = 0.08;
  orthoControls.enabled = false;
  // ORBIT is locked on the ortho pair: a quick-view (or the flattened sheet pan) is a square-on
  // 2D read — rotating it would shear the flat layout with no depth cue to anchor it. Pan + zoom
  // stay live for inspecting the drawing; an attempted left-drag nudges the lit chip instead
  // (see the pointerdown cue below).
  orthoControls.enableRotate = false;

  // The perspective pair is live at boot; activeCamera/activeControls are what the render
  // loop draws + updates and what every camera-move seam hands off between.
  activeCamera = camera;
  activeControls = controls;

  // A user drag mid-flight cancels the camera tween — the learner's hand wins instead of
  // being eaten by the lerp. The FOLD tween is deliberately left alone: orbiting during the
  // rabatment is encouraged. Only clear the lit quick view when the PERSPECTIVE camera is
  // live (during an ortho quick-view these controls are disabled anyway; the ortho listener
  // below owns that case).
  controls.addEventListener('start', () => {
    cameraTween?.cancel();
    cameraTween = null;
    if (activeCamera === camera) clearQuickView();
  });

  // A pan/zoom gesture on the LIVE ortho camera (mid quick-view) takes over its flight: cancel
  // the in-flight tween and settle any half-done projection morph to pure ortho, so the view
  // never freezes part-blended. (Rotate is locked on this pair, so 'start' only fires for
  // pan/zoom.) The lit chip stays on until another seam moves the camera or it is re-clicked.
  orthoControls.addEventListener('start', () => {
    cameraTween?.cancel();
    cameraTween = null;
    clearProjectionMorph();
  });

  // An attempted ORBIT on the rotate-locked ortho pair fires no OrbitControls event at all —
  // catch the pointerdown itself and nudge the lit quick-view chip (cueOrthoLock), so the
  // learner reads "disengage this view to orbit" instead of a dead drag.
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activeCamera !== orthoCamera) return;
    cueOrthoLock();
  });

  contentGroup = new THREE.Group();
  scene.add(contentGroup);

  // CSS2D overlay for the label layer (plane/point callouts, quadrant numerals) —
  // a transparent DOM layer sized to the canvas (RULES.md §3.27); pointer-events
  // off so drag-to-orbit passes straight through to the canvas beneath.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (RULES.md §3.1, non-negotiable).
// Consumes currentData + currentView + foldAngle: dispose everything, then let
// each leaf — the two geometry leaves and the CSS2D label leaf — rebuild itself
// from the state (labelLayer.generate also drives the BIS badge).
// ============================================================================

/** Remap pointData's resolved DATA-SPACE signed values onto world axes + scale:
 *  height (±distHP) → Y, depth in front of VP (±distVP) → Z, lateral along the
 *  fold line (±distRP) → X. */
function worldPosition(data) {
  const pos = resolvePosition(data);
  return {
    x: pos.z * UNIT_TO_WORLD,
    y: pos.y * UNIT_TO_WORLD,
    z: pos.x * UNIT_TO_WORLD,
  };
}

/** Full disposal contract (RULES.md §3.3, ADR-004): every leaf frees its own
 *  geometries + materials (each traverses its whole group, nested children
 *  included), the label leaf physically removes its CSS2D DOM nodes from the
 *  document (RULES.md §3.5 — they accumulate fast otherwise), then the content
 *  group drops the references. */
function disposeContent() {
  hvPlanes?.dispose();
  hvPlanes = null;
  pointRig?.dispose();
  pointRig = null;
  labelLayer?.dispose();
  labelLayer = null;
  contentGroup.clear();
}

function rebuild() {
  disposeContent();
  const { width, height } = viewportSize();
  const position = worldPosition(currentData);

  // The reference-plane pair — on stage from boot in this topic (the corner is
  // the classroom, never step-gated). showQuad grows the beyond-fold extensions
  // (the "four rooms"); every step of this lesson keeps them on.
  hvPlanes = createHvPlanes({
    showHP: true,
    showVP: true,
    extended: currentView.showQuad,
    foldAngle,
    width, height,
  });
  contentGroup.add(hvPlanes.group);

  // The point P; its top view (showHP) and front view (showVP) layers reveal one
  // shadow at a time as the guided sequence teaches them.
  if (currentView.showPoint) {
    pointRig = createPointRig({
      position,
      showHP: currentView.showHP,
      showVP: currentView.showVP,
      foldAngle,
      width, height,
    });
    contentGroup.add(pointRig.group);
  }

  // The CSS2D name layer — built unconditionally (plane callouts are always on
  // stage) so every label and the BIS badge track the view on every path. The
  // badge shows while the sheet is folded flat (fold()/unfold() also drive it
  // live, since the fold itself never rebuilds).
  labelLayer = createLabelLayer({ width, height });
  labelLayer.generate({
    view: { ...currentView, showSymbol: folded },
    position,
    coords: resolvePosition(currentData), // signed mm for the P(x, y, z) read-out
    quadrant: currentData.quadrant,
    foldAngle,
  });
  contentGroup.add(labelLayer.group);

  // The Compare card shows a LIVE drawing, never a snapshot (ADR-012): every
  // rebuild — slider drags included — repaints it from the fresh data.
  if (compareOpen) drawCompare();

  // Every geometry change passes through here, so this is the ONE seam the Problem
  // Library's self-check subscribes to (simController.onStateChange). Empty/reset
  // states fire too — the check re-evaluates and re-paints its prompt. Fires with an
  // empty subscriber set on the boot rebuild (before the library wires up): a no-op.
  notifyStateChange();
}

/** Merge a partial change into the point data and re-derive the scene — the one
 *  write path for currentData (controls never touch the scene, RULES.md §3.2).
 *  Both control surfaces re-sync AFTERWARD from the settled state, so the dock's
 *  sliders/select and the wizard chrome can never disagree no matter which of
 *  them drove the commit. Each sync only redraws its own chrome — no writes, so
 *  no loop. */
function commit(patch) {
  currentData = { ...currentData, ...patch };
  rebuild();
  ui?.sync();
  stepper?.sync();
}

// ============================================================================
// simController — the injected contract every leaf module receives (ADR-007).
// stepper.js (the wizard), uiManager.js (the parameter dock), and
// problemLibrary.js (the textbook self-check) all consume this same object.
// Keep it the ONE surface between leaves and the orchestrator.
// ============================================================================

const simController = {
  announce,
  showToast,

  /** Read-only snapshots — leaves never hold live references to the state. */
  getData: () => ({ ...currentData }),
  getView: () => ({ ...currentView }),
  isFolded: () => folded,

  commit,

  /** The quadrant walk (step 1's dropdown). Ignores unknown quadrant keys. The
   *  camera flies to the room's pose here — NOT in commit(), which the distance
   *  sliders drive continuously and must never trigger a flight. */
  setQuadrant(q) {
    if (!QuadrantType[q]) return;
    commit({ quadrant: q });
    // The room flight drives the PERSPECTIVE camera, so hand back from any live ortho
    // quick-view first (instant — the flight itself is the visible motion). That also
    // clears the lit chip + any leftover morph (restorePerspective); clearQuickView
    // then covers the plain-perspective case.
    if (activeCamera === orthoCamera) restorePerspective(false);
    clearQuickView();
    flyCamera(CAMERA_POSE[q]);
  },

  /** Quick-view camera chips (Top/Front/Side): the dual-camera §5.18 morph. Clicking a
   *  chip engages the OrthographicCamera and glides it square-on to the named reference
   *  plane while its projection matrix morphs perspective → ortho (so the view smoothly
   *  loses foreshortening rather than hard-cutting into depth); re-clicking the lit chip
   *  morphs the ortho camera back onto the retained free-orbit perspective pose
   *  (restorePerspective). The ortho camera is fitted to the meaningful geometry
   *  (contentBoxWorld) so the plane pair + point fill the frame. A no-op mid-fold — the
   *  rabatment owns the camera (ADR-013), the same guard the Compare card uses. Unknown
   *  kinds are ignored. */
  setView(kind) {
    if (!QV_DIR[kind]) return;
    if (foldTween) return; // the fold owns the camera (ADR-013)
    if (activeQuickView === kind) {
      // Re-clicking the lit chip exits the view. If the sheet is folded flat (the Front
      // chip the ortho fold swoop lit — Task 2), exiting must physically REVERSE the fold
      // back to 3D, not just glide the ortho camera off a still-flat sheet. unfold() drives
      // the hinge open + clears this chip (via driveFold → clearQuickView); stepper.sync()
      // re-reads the now-unfolded state so its fold button flips back to "Animate Unfolding".
      if (folded) {
        simController.unfold();
        stepper?.sync();
        announce('Folded back into the 3D view.');
      } else {
        restorePerspective(true); // re-click the lit chip → morph back to free orbit
        announce('Returned to orbit view.');
      }
      return;
    }
    const box = contentBoxWorld();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const qd = QV_DIR[kind];
    const toZoom = fitOrthoZoomForView(kind, size);
    // Stand off at the LIVE orbit distance, not a fixed depth: tweenCamFull's morph-in
    // reproject re-radiuses the camera to that same distance every frame, so matched
    // magnitudes give a clean arc (a far standoff only bulges the interpolated offset).
    // Ortho framing is zoom-driven, so the standoff length is otherwise cosmetic.
    const dist = camera.position.distanceTo(controls.target);
    const toPos = center.clone().addScaledVector(qd.dir, dist);
    engageOrtho();
    activeQuickView = kind;
    syncQuickViewChips();
    tweenCamFull(toPos, center, toZoom, CAMERA_MOVE_MS, easeCamera, qd.up.clone());
    announce(`${kind[0].toUpperCase()}${kind.slice(1)} view.`);
  },

  /** The stepper pushes each step's viewport flags through here — the ONE channel
   *  the wizard drives the scene through. A pre-fold step (foldPose 'unfolded',
   *  steps 1–4) reached while still folded (the learner navigated back from the
   *  Unfold step) clears `folded`, so the fold targeting below drives the hinge
   *  BACK OPEN — a smooth reverse fold, never a snap and never a corner stuck
   *  flat while the learner edits an earlier step. The dock re-syncs last. */
  applyView(stepView) {
    currentView = { ...DEFAULT_VIEW, ...stepView };
    if (currentView.foldPose === 'unfolded' && folded) {
      folded = false; // rebuild() below re-generates labels with the badge off
    }
    rebuild();

    // Fold targeting: compare against where the hinge is HEADED (foldTarget
    // mid-swing) so a step change never restarts a tween toward its own
    // destination.
    const targetAngle = folded ? FOLD_ANGLE : 0;
    const effective = foldTween ? foldTarget : foldAngle;
    if (targetAngle !== effective) driveFold(targetAngle);

    // The Compare chip follows the lesson's 2D gate (ADR-012 / the legacy
    // Points compareGate): the drawing is meaningless before both views exist.
    syncCompareChipVisibility();

    ui?.sync();
  },

  /** The step-5 rabatment: the heavy 90° hinge swing about the X fold line
   *  (1600 ms, anim.js easeFold — snaps under prefers-reduced-motion because the
   *  tween lands on its end value immediately). `folded` flips synchronously so
   *  the stepper's done-gate and announcement read the new state right away; the
   *  tween then drives ALL the leaves' hinges each frame via the module-level
   *  handles, so it survives a mid-swing rebuild (the fresh leaves pick up at
   *  foldAngle). The camera rides the swing on the ADR-036 ortho swoop (square-on to the
   *  answer sheet) — driveFold owns both motions so they share one timeline. */
  fold() {
    if (folded) return;
    folded = true;
    driveFold(FOLD_ANGLE);
    labelLayer?.setSymbol(true); // the BIS first-angle badge rides the fold
  },
  unfold() {
    if (!folded) return;
    folded = false;
    driveFold(0);
    labelLayer?.setSymbol(false);
  },

  /** First-seen onboarding chips (onboarding.js) — the stepper fires these per
   *  step. Optional-chained: the wizard renders once before onboarding exists
   *  only if init order ever changes; a lost hint must never crash a step. */
  spotlight(id) { onboarding?.spotlight(id); },
  orbitHint() { onboarding?.orbitHint(); },

  reset() { window.simAPI.reset(); },

  // --- Problem Library seam (ADR-015) — the small read/route facade the textbook
  //     self-check consumes. It NEVER auto-fills: loading a problem only resets to
  //     defaults + routes to the dial-able step; the student dials by hand. ---

  /** The RAW dialled data the ±0.5 mm OR-array self-check compares against `target`
   *  (keys quadrant / distHP / distVP / distRP — the same units the targets store). */
  state: () => ({ ...currentData }),

  /** Whether there is dialled work to lose — gates the library's "clears your work"
   *  confirm (skipped at defaults). */
  hasWork: hasDialedWork,

  /** True while the rabatment is animating: loading a problem holds off until the
   *  fold settles rather than stranding the reset + step jump mid-swing. */
  isBusy: () => foldTween !== null,

  /** Route a freshly-loaded problem to its dial-able entry step (1-indexed, matching
   *  the stepper). For Points the config pins this to Step 1 (Quadrants). */
  goStep: (n) => stepper?.goStep(n),

  /** Flash an ad-hoc onboarding chip (the library surfaces a per-problem cue with it;
   *  the Points set ships none, so this is dormant but wired for parity). */
  cueHint: (text) => onboarding?.cue?.(text),

  /** The first revealed control of the current step — focused after a problem loads so
   *  a keyboard learner lands on the dial, not the closed overlay. Step 1's control is
   *  the 2×2 quadrant grid (buttons, no input/select), so match a .quad-btn too. */
  firstControl: () => document.querySelector(
    '#controls [data-ctrl]:not([hidden]) input, #controls [data-ctrl]:not([hidden]) select, #controls [data-ctrl]:not([hidden]) .quad-btn',
  ),

  /** Register a callback fired at the end of every rebuild() (any parameter / step /
   *  reset change). Returns an unsubscribe fn. The self-check subscribes here. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },

  /** Whether a textbook problem is currently loaded (drives the stepper's terminal-step
   *  "Complete & next problem" / "Pick a problem" label). */
  isProblemActive: () => problemLibrary?.isActive?.() ?? false,

  /** The terminal-step payoff: clear the problem, reset, and open the library (below). */
  completeAndNext,
};

/**
 * "Complete & next problem" — the guided stepper's terminal-step payoff (Module 2 pattern).
 * Close out the finished drawing and send the learner on to the next challenge: clear any
 * active-problem framing, reset the bench through the SINGLE reset path, celebrate calmly (a
 * success toast — no gamified fanfare, DESIGN.md), then open the Problem Library to choose
 * what's next.
 *
 * Order matters: reset() narrates "Simulation reset.", so the celebratory line is announced
 * LAST to win the live region. Resetting BEFORE opening also returns the point to defaults,
 * so picking the next problem skips the "clears your work" confirm (hasDialedWork() is false).
 */
function completeAndNext() {
  const hadProblem = problemLibrary?.isActive?.() ?? false;
  problemLibrary?.exit?.();   // clear the active-problem header (keeps nothing to lose)
  window.simAPI.reset();      // single reset path: defaults + Step 1 + default camera
  showToast('Problem complete');
  problemLibrary?.open?.();   // open the library to pick the next problem (pauses the loop)
  announce(hadProblem
    ? 'Problem complete — well done. Choose your next problem to continue.'
    : 'Pick a problem to start practising.');
}

/** Tween the hinge from wherever it stands to `toAngle`. Duration scales with the
 *  remaining arc, so reversing a half-finished fold swings back at the same pace
 *  instead of dragging a short arc over the full 1600 ms. Pure transforms every
 *  frame — no rebuild while swinging.
 *
 *  ADR-036 (orthographic fold swoop — OVERTURNS ADR-013's held-angle hold): the fold OWNS the
 *  camera. Any in-flight quadrant flight is cancelled and the open Compare card closes (it
 *  re-opens against the new fold state on demand — ADR-012). Forward, the ORTHOGRAPHIC camera
 *  swoops square-on to the flattened answer sheet (front-on along −Z at the VP) while the
 *  projection morphs perspective → orthographic, so the folded corner reads as a TRUE flat 2D
 *  drawing with no residual foreshortening (swoopToAnswerSheet — mirroring the Spatial-Framework
 *  / Module-2 master). Reverse glides the ortho camera back onto the learner's retained
 *  perspective orbit pose (restorePerspective); the perspective camera never moved during the
 *  swoop, so it lands home with no stored pose. Both motions share the hinge's duration + easeFold
 *  curve, so they read as one movement. Held-angle perspective folds are FORBIDDEN (RULES.md).
 *  Reduced motion snaps both (anim.js lands tweens on their end value immediately;
 *  restorePerspective's guard hands off instantly). */
function driveFold(toAngle) {
  foldTween?.cancel();
  foldTarget = toAngle;
  const arc = Math.abs(toAngle - foldAngle) / FOLD_ANGLE;
  const duration = FOLD_MS * arc;

  // The fold owns the camera + the card (ADR-036 / ADR-012): drop any lit quick-view, cancel any
  // in-flight camera flight so two camera moves never fight, and — on a FORWARD fold only — close
  // the floating Compare card so it can't fight the swoop. An UNfold must NOT close it: the
  // workbench split unfolds the sheet to set itself up (enterWorkbench sets compareOpen +
  // workbenchOpen, THEN calls unfold), so an unconditional hide() here tore down the very split
  // being built — compareOpen flipped false, the trailing drawCompare() guard skipped, and the S2
  // sheet stayed blank until a second click found the sheet already flat. It re-reads against the
  // new fold state on demand (ADR-012).
  clearQuickView();
  if (toAngle === FOLD_ANGLE && compareOpen) compare.hide();
  cameraTween?.cancel();
  cameraTween = null;

  // The camera event (ADR-036): forward SWOOPS the ortho camera square-on to the answer sheet +
  // morphs perspective → ortho; reverse GLIDES it back onto the retained perspective orbit pose.
  // Both run on the hinge's duration + easeFold curve, so the camera and the planes move as one.
  if (toAngle === FOLD_ANGLE) swoopToAnswerSheet(duration);
  else restorePerspective(true, duration, easeFold);

  foldTween = tween({
    from: foldAngle,
    to: toAngle,
    duration,
    ease: easeFold,
    onUpdate: (a) => {
      foldAngle = a;
      hvPlanes?.setFoldAngle(a);   // the floor sheet swings on its hinge
      pointRig?.setFoldAngle(a);   // the top view + its projector ride along
      labelLayer?.setFoldAngle(a); // the HP callout + p chip ride; P's chip fades
    },
    onComplete: () => {
      foldTween = null;
      // The forward swoop lands square-on the flattened answer sheet — a true Front-view
      // ortho read — so light the "Front" chip when it settles (Task 2). Every exit path
      // (Unfold button, step-back, quadrant flight, reset) routes through driveFold →
      // clearQuickView, so the chip clears itself when the sheet leaves the flat pose.
      if (toAngle === FOLD_ANGLE) { activeQuickView = 'front'; syncQuickViewChips(); }
    },
  });
}

/** World-space box of the FLATTENED sheet + the two views riding it — the frame
 *  target for the ortho fold swoop (ADR-036; the legacy engine's flatBoxFor('all'),
 *  computed analytically here: this orchestrator knows exactly where its views
 *  land after the fold). After the +90° rabatment everything lies in the z = 0
 *  plane: the VP sheet keeps x/y ∈ ±SHEET/2, the HP's front half maps z → −y,
 *  and the views land at p′ = (x, +wy) and p = (x, −wz) — included explicitly so
 *  an over-range point is still framed. */
function flatSheetBox() {
  const half = SHEET / 2;
  const w = worldPosition(currentData);
  const viewYs = [w.y, -w.z]; // p′ height, p folded below/above the line
  return new THREE.Box3(
    new THREE.Vector3(Math.min(-half, w.x), Math.min(-half, ...viewYs), -0.1),
    new THREE.Vector3(Math.max(half, w.x), Math.max(half, ...viewYs), 0.1),
  );
}

/** The fold's camera event (ADR-036, overturns ADR-013's held-angle hold): SWOOP the ortho
 *  camera square-on to the flattened answer sheet — front-on along −Z at the VP, front view
 *  above the XY line, folded top view below — while the projection morphs perspective →
 *  orthographic on the SAME easeFold curve the hinge swings on, so camera + planes read as one
 *  move and the folded corner lands as a TRUE flat 2D drawing (no residual foreshortening),
 *  mirroring the Spatial-Framework / Module-2 master's swoopToAnswerSheet. engageOrtho() seeds
 *  the ortho camera on the live perspective pose (frame 0 is a visual no-op) and arms the morph;
 *  tweenCamFull() then glides position/target/zoom/up to the square-on pose and drives the morph
 *  to pure ortho. The perspective camera is left UNTOUCHED, so the reverse fold
 *  (restorePerspective) glides straight back onto the learner's retained orbit pose. Reduced
 *  motion: engageOrtho skips the morph and the tween lands square-on immediately (anim.js). */
function swoopToAnswerSheet(duration) {
  const box = flatSheetBox();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const qd = QV_DIR.front;                       // look along −Z, head-on at the VP answer sheet
  const toZoom = fitOrthoZoomForView('front', size);
  // Stand off at the LIVE orbit distance (tweenCamFull's morph-in re-radiuses to it each frame,
  // so matched magnitudes give a clean arc); ortho framing is zoom-driven, so the depth is cosmetic.
  const dist = camera.position.distanceTo(controls.target);
  const toPos = center.clone().addScaledVector(qd.dir, dist);
  engageOrtho();                                 // seed ortho on the perspective pose + arm the morph
  activeQuickView = null;                        // the fold is not a Top/Front/Side chip
  syncQuickViewChips();
  tweenCamFull(toPos, center, toZoom, duration, easeFold, qd.up.clone());
}

// ============================================================================
// COMPARE VIEW (ADR-012 — Points is a `mode:'dual'` sim; the floating Compare
// card is mandatory). The main pane is ALWAYS the live 3D scene; the finished
// 2D orthographic drawing appears on demand in this floating card. State
// machine ported from the legacy Module1/src/engine.js `compare`. One deliberate
// adaptation for this single-WebGL-canvas orchestrator: the card's stage owns a
// plain 2D <canvas> that drawCompare() repaints from the live point data on
// every rebuild — a live rebuilt drawing, never a snapshot (ADR-012's rule) —
// instead of re-housing a second WebGL stack (no extra GL context to exhaust in
// the sandboxed iframe). Because the card always shows the 2D drawing (the
// clean square-on read ADR-013 assigns to it), the chip label stays constant
// rather than toggling to "Compare 3D view" while folded.
// ============================================================================

/** State-aware Compare chip: aria-pressed mirrors open/closed (the CSS fills
 *  the pill solid accent while pressed — Module 1's .vp-chip.on). */
function updateCompareChip() {
  compareChip?.setAttribute('aria-pressed', String(compareOpen));
}

/** Hide the chip until the lesson's 2D gate passes (the legacy Points
 *  compareGate: showHP && showVP), preserving the pedagogy that the 2D drawing
 *  is meaningless before both views exist. A closed gate also force-closes an
 *  open card. */
function syncCompareChipVisibility() {
  if (!compareChip) return;
  const ok = !!(currentView.showHP && currentView.showVP);
  compareChip.hidden = !ok;
  if (!ok && compareOpen) compare.hide();
}

const compare = {
  show(size) {
    if (foldTween) return; // the fold owns the camera + card (ADR-013)
    compareOpen = true;
    if (compareCard) compareCard.hidden = false;
    // Desktop opens straight into the 50/50 workbench (COMPARE_DEFAULT_SIZE);
    // mobile has no workbench, so it opens the compact bottom-sheet. applyCompareSize
    // owns the data-size + workbench mount and repaints.
    applyCompareSize(size || (isWorkbenchViewport() ? COMPARE_DEFAULT_SIZE : 'compact'));
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
    // Leaving the split hands the width back to the (returned) wizard → resize the
    // renderer to the reflowed viewport. Two frames: the grid→flex reflow, like the
    // reverse, isn't committed on frame 1, so a single-frame measure would leave the
    // canvas pinned at the half-pane size in the now-full viewport (see remeasureAfterReflow).
    if (wasSplit) remeasureAfterReflow();
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

// ============================================================================
// Compare-split workbench (ADR-037) — the true 50/50.
//
// Points' Compare was a floating 2D card only (ADR-012). This brings it to parity
// with the Lines workbench (ADR-021): expanding collapses the wizard, gives the 3D
// viewport the left pane and the 2D drawing the right, and re-parents the point
// drivers (quad / HP / VP / PP — WORKBENCH_CONTROLS) into a docked rail spanning both.
//
// Re-parenting, not mirrored inputs (ADR-021's rule): the [data-ctrl] wrappers keep
// their global ids, so every uiManager listener / setPair / self-check keeps working
// wherever the node lives — one source of truth. Because handleResize() measures
// #sim-viewport, once that box IS the left pane the renderer resizes correctly with
// no sizing change; drawCompare() measures its own stage, so it fills the right pane.
// Desktop-only — mobile keeps the bottom-sheet Compare.
// ============================================================================

/** The workbench is a desktop affordance (ADR-021 parity); < 768px keeps the
 *  bottom-sheet Compare. Matches the sim's mobile breakpoint. */
function isWorkbenchViewport() {
  return window.matchMedia('(min-width: 768px)').matches;
}

/** Set the compare footprint and mount/unmount the workbench to match. 'expanded'
 *  enters the split (desktop only); anything else is the compact floating card. */
function applyCompareSize(size) {
  const wantSplit = size === 'expanded' && isWorkbenchViewport();
  compareSize = wantSplit ? 'expanded' : 'compact';
  if (compareCard) compareCard.dataset.size = compareSize;
  if (wantSplit) enterWorkbench();
  else exitWorkbench();
  remeasureAfterReflow();        // TWO frames — the grid reflow isn't laid out on frame 1 (see helper)
}

/** The docked rail, created once and kept for the session. */
function ensureWorkbenchRail() {
  if (workbenchRail) return workbenchRail;
  workbenchRail = document.createElement('div');
  workbenchRail.id = 'workbench-rail';
  workbenchRail.setAttribute('role', 'group');
  workbenchRail.setAttribute('aria-label', 'Point coordinates');
  document.body.appendChild(workbenchRail);
  return workbenchRail;
}

/** Collapse the wizard, split the viewport 50/50, and dock the drivers under both
 *  panes. Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;

  // The split is a live 3D↔2D read, so the left pane must show the 3D pictorial —
  // return the scene to unfolded 3D (ADR-013 gives the flattened read to the 2D pane).
  if (simController.isFolded()) simController.unfold();

  const rail = ensureWorkbenchRail();
  const controls = document.getElementById('controls');
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = controls?.querySelector(`[data-ctrl="${key}"]`);
    if (wrap) { wrap.hidden = false; rail.appendChild(wrap); } // all four live at once
  }

  // Re-parent the drawing card out to <body> so the grid can place it as the right
  // pane (compact anchors absolutely inside #sim-viewport, which is now the left pane).
  if (compareCard && compareCard.parentElement !== document.body) {
    document.body.appendChild(compareCard);
  }
  document.body.classList.add('compare-split');
}

/** Restore the floating layout: hand the drivers back to #controls, re-nest the card
 *  in #sim-viewport, and let the stepper re-own per-step disclosure. Idempotent. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');

  // Card back inside the viewport (the positioned ancestor compact anchors to).
  if (compareCard && viewport && compareCard.parentElement !== viewport) {
    viewport.appendChild(compareCard);
  }

  // Drivers back into #controls, in canonical order before the fold-actions anchor.
  const controls = document.getElementById('controls');
  const anchor = controls?.querySelector('[data-ctrl="anim"]');
  if (workbenchRail && controls) {
    for (const key of WORKBENCH_CONTROLS) {
      const wrap = workbenchRail.querySelector(`[data-ctrl="${key}"]`);
      if (wrap) controls.insertBefore(wrap, anchor);
    }
  }
  // Per-step progressive disclosure owns the drivers again (re-hides all but this
  // step's), and the chrome re-reads the now-unfolded state.
  stepper?.refresh?.();
}

/**
 * Repaint the Compare card's 2D orthographic drawing from the live point data —
 * a live rebuild on every commit, never a snapshot (ADR-012). First-angle sheet,
 * straight from resolvePosition()'s signed mm:
 *   • the XY fold line across the middle (the HP/VP reference line);
 *   • the front view p′ at +height (above the line when P is above HP);
 *   • the top view p at −depth (below the line when P is in front of VP — the
 *     fold maps in-front depth downward);
 *   • one SOLID Type-B continuous thin vertical projector through both
 *     (ADR-016 — 2D ortho projectors are solid; only the 3D pictorial projectors
 *     stay dashed. Do NOT "fix" this back to dashed — it is the textbook rule);
 *   • each view as a thick dot: a paper HALO under a colour disc (ADR-016), p′
 *     amber (on VP) / p teal (on HP), each carrying colour AND its letter (Two-Cue).
 * Signs fall out of the data for all four quadrants.
 *
 * The lateral (profile-plane) coordinate is DRAWN, so the sheet mirrors the full
 * 3D state instead of re-centring it away: distRP slides the shared projector +
 * both marks left/right of a centre datum along the XY line (positive = right of
 * PP, negative = left — the negative-PP walk the distRP slider now allows). A
 * datum tick + a lateral dimension appear only when the point is off the profile
 * plane. One scale governs both axes and is fitted so a far point or a large
 * lateral offset still frames without clipping. Colours
 * + fonts read the design tokens at draw time — never hard-coded (RULES.md §4.1).
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

  const token = (name) => rootStyle.getPropertyValue(name).trim();
  const paper = token('--color-paper');
  const ink = token('--color-ink');
  const inkSoft = token('--color-ink-secondary');
  const benchGrey = token('--color-bench-grey');
  const hpCol = token('--color-hp-line');
  const vpCol = token('--color-vp-line');
  const sans = token('--font-sans');
  const mono = token('--font-mono');

  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);

  // Signed mm offsets about the XY line (canvas y grows DOWN, sheet y grows UP)
  // and along it (canvas x grows RIGHT, matching worldPosition's +X → right).
  const pos = resolvePosition(currentData);
  const dPrime = pos.y;  // p′: + = above the line
  const dTop = -pos.x;   // p:  in front of VP folds BELOW the line
  const lat = pos.z;     // signed lateral (distance from PP): + = right of datum

  const marginY = 56;    // label + dimension breathing room (top / bottom)
  const marginX = 44;    // keep the shifted projector + labels clear of the edges
  // FIXED scale locked to the static sheet bounds — the sheet frames REF_SPAN mm on each
  // side of the XY line at a CONSTANT scale, so 10 mm always reads as 10 mm on screen no
  // matter the slider values. (Was: scale = frameHalf / point's-own-value, which pinned the
  // mark to the frame edge and auto-zoomed the sheet — 10 mm shrank as the value grew.)
  const REF_SPAN = 40;   // mm — the distance-slider max; a 40 mm point reaches the sheet edge.
                         // A rare typed over-range point extends past the sheet, not shrinks it.
  const scaleV = (h / 2 - marginY) / REF_SPAN;
  const scaleH = (w / 2 - marginX) / REF_SPAN;
  const scale = Math.min(scaleV, scaleH);

  const cx = w / 2;
  const cy = h / 2;
  const px = cx + lat * scale;   // the shared vertical projector's x (lateral position)
  const yPrime = cy - dPrime * scale;
  const yTop = cy - dTop * scale;

  // XY fold line with its X / Y end letters (the vocabulary the steps teach).
  const inset = 28;
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(inset, cy);
  ctx.lineTo(w - inset, cy);
  ctx.stroke();
  ctx.fillStyle = inkSoft;
  ctx.font = `700 13px ${sans}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', inset - 12, cy);
  ctx.fillText('Y', w - inset + 12, cy);

  // Off the profile plane → mark the centre datum (where PP cuts the XY line, the
  // reference the lateral distance is read from) and dimension the offset, so the
  // negative-PP walk reads against a fixed origin instead of drifting silently.
  const latMM = Math.round(lat);
  if (latMM !== 0) {
    ctx.strokeStyle = benchGrey;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
    ctx.font = `400 11px ${mono}`;
    ctx.fillStyle = inkSoft;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.abs(latMM)}`, (cx + px) / 2, cy - 5);
  }

  // The shared projector — SOLID Type-B continuous thin, bench-grey, through both
  // views and the line. ADR-016: in the 2D drawing the HP/VP distinction is already
  // carried by POSITION (p′ above the XY line, p below), so the standards-correct
  // projector is a solid Type-B continuous thin line — only the 3D PICTORIAL
  // projectors (point.js P→p / P→p′) stay dashed. Do NOT "fix" this back to dashed:
  // it looks like a regression but is the deliberate textbook convention.
  ctx.strokeStyle = benchGrey;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px, Math.min(yPrime, yTop, cy) - 10);
  ctx.lineTo(px, Math.max(yPrime, yTop, cy) + 10);
  ctx.stroke();

  // Quiet mono dimensions beside each half of the projector (signed mm, the
  // same numbers the P(x, y, z) read-out teaches). Skipped at 0 — no clutter
  // for an on-plane view.
  ctx.font = `400 11px ${mono}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = inkSoft;
  if (Math.round(dPrime) !== 0) ctx.fillText(`${Math.abs(Math.round(dPrime))}`, px + 10, (cy + yPrime) / 2);
  if (Math.round(dTop) !== 0) ctx.fillText(`${Math.abs(Math.round(dTop))}`, px + 10, (cy + yTop) / 2);

  // The two views. ADR-016: a thick dot = paper halo + colour disc (the halo lifts
  // the disc clear of the projector + XY line). Two-Cue Rule: each carries its
  // colour AND its letter — p′ (front view, on VP) amber; p (top view, on HP) teal.
  const mark = (y, colour, label) => {
    ctx.beginPath();
    ctx.arc(px, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = paper;   // halo
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = colour;  // colour disc
    ctx.fill();
    ctx.font = `700 13px ${sans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + 10, y - 10);
  };
  mark(yPrime, vpCol, 'p′');
  mark(yTop, hpCol, 'p');
}

/** Bind + wire the Compare chrome once at boot: the chip toggles the card, the
 *  head buttons close / resize it. The expand button flips compact ↔ expanded
 *  and repaints on the next frame, after the new card size has settled. */
function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
  compareCanvas = document.getElementById('compare-canvas');

  compareChip?.addEventListener('click', () => compare.toggle());
  document.getElementById('compare-close')?.addEventListener('click', () => compare.hide());

  const expandBtn = document.getElementById('compare-expand');
  const syncExpandBtn = () => {
    const expanded = compareSize === 'expanded';
    expandBtn?.setAttribute('aria-label', expanded ? 'Shrink to floating card' : 'Expand to split view');
    if (expandBtn) expandBtn.title = expanded ? 'Shrink' : 'Expand';
  };
  syncExpandBtn();
  expandBtn?.addEventListener('click', () => {
    // Toggle the 50/50 workbench split (expanded) ↔ the floating card (compact).
    applyCompareSize(compareSize === 'expanded' ? 'compact' : 'expanded');
    syncExpandBtn();
    announce(compareSize === 'expanded' ? 'Compare view expanded to split.' : 'Compare view shrunk to card.');
  });

  // The workbench is desktop-only (ADR-021 parity). If the viewport narrows below
  // the mobile breakpoint while the split is up, drop back to the bottom-sheet card
  // so the layout never wedges between the grid and the mobile stack.
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
    if (!e.matches && workbenchOpen) { applyCompareSize('compact'); syncExpandBtn(); }
  });
}

/** Glide the camera to a named pose (position + target) through the anim.js tween
 *  engine. OrbitControls stays ENABLED throughout (its damping deltas are zero while
 *  untouched, and the 'start' listener above cancels the flight the moment the
 *  learner grabs the scene). Reduced motion snaps (anim.js). The pose-equality guard
 *  makes an already-arrived flight a no-op, so boot and reset never fire pointless
 *  self-tweens.
 *
 *  ORBITAL PATH: the camera position is decomposed into the look-at pivot
 *  (controls.target) plus a direction × radius offset, and the tween SLERPs the
 *  direction on the unit sphere — a quaternion rotating the start offset's direction
 *  onto the destination's, blended from identity by the eased t — while the radius and
 *  the pivot itself lerp on the same curve. The camera therefore rides a true circular
 *  orbit AROUND the point it is looking at, never a chord through it: an east↔west
 *  room walk (±Z flip) sweeps around the fold line's X end and crosses the VP sheet
 *  plane out beyond its edge, a north↔south walk (±Y flip) does the same across the
 *  HP, and a diagonal (Q1↔Q3) crosses both in one great-circle swing. Because every
 *  CAMERA_POSE keeps camera.x < 0, the start/end directions always share the −X
 *  hemisphere — the slerp can't hit the antipodal degenerate case and the arc always
 *  routes around the open X-end side of the corner, clear of the sheets. */
function flyCamera(pose) {
  if (camera.position.distanceToSquared(pose.position) < 1e-6 &&
      controls.target.distanceToSquared(pose.target) < 1e-6) return;
  const fromTarget = controls.target.clone();
  const toTarget = pose.target.clone();
  const fromOffset = camera.position.clone().sub(fromTarget);
  const toOffset = pose.position.clone().sub(toTarget);
  const fromRadius = fromOffset.length();
  const toRadius = toOffset.length();

  // Degenerate offset (camera sitting ON its pivot — can't happen from the pose table,
  // but a user zoom-to-target could): no orbit direction exists, glide straight instead.
  if (fromRadius < 1e-4 || toRadius < 1e-4) {
    const fromPos = camera.position.clone();
    cameraTween?.cancel();
    cameraTween = tween({
      from: 0, to: 1, duration: CAMERA_MOVE_MS, ease: easeCamera,
      onUpdate: (t) => {
        camera.position.lerpVectors(fromPos, pose.position, t);
        controls.target.lerpVectors(fromTarget, toTarget, t);
      },
      onComplete: () => { cameraTween = null; },
    });
    return;
  }

  const fromDir = fromOffset.divideScalar(fromRadius); // unit
  const toDir = toOffset.divideScalar(toRadius);       // unit
  const spin = new THREE.Quaternion().setFromUnitVectors(fromDir, toDir);
  const idle = new THREE.Quaternion(); // identity — the orbit's t=0 end
  const q = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  const pivot = new THREE.Vector3();

  cameraTween?.cancel();
  cameraTween = tween({
    from: 0,
    to: 1,
    duration: CAMERA_MOVE_MS,
    ease: easeCamera,
    onUpdate: (t) => {
      q.slerpQuaternions(idle, spin, t);              // eased sweep of the offset direction
      dir.copy(fromDir).applyQuaternion(q);
      pivot.lerpVectors(fromTarget, toTarget, t);
      camera.position.copy(pivot).addScaledVector(dir, fromRadius + (toRadius - fromRadius) * t);
      controls.target.copy(pivot);
    },
    onComplete: () => { cameraTween = null; },
  });
}

function resetCamera() {
  // Reset is a snap back to truth: if the ortho quick-view camera is live, hand back to
  // the perspective camera instantly (clears the morph + lit chip) before snapping home.
  if (activeCamera === orthoCamera) restorePerspective(false);
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

// ============================================================================
// Dual-camera orthographic orchestrator (RULES.md §5.18) — ported from the legacy
// engine's `orthoViews` path (Module1/src/engine.js, itself verbatim Module 2).
// engageOrtho makes the ortho camera live and arms the perspective→ortho morph;
// tweenCamFull glides + fits it square-on; restorePerspective glides back and
// morphs ortho→perspective; applyProjectionMorph is stamped by the render loop.
// All framing stays zoom-driven, seeded to match the perspective frustum height
// at the same distance, so the two-camera hand-off never pops in scale.
// ============================================================================

/** Ortho zoom whose frustum HEIGHT matches the perspective frustum height at `dist`,
 *  so a perspective→ortho hand-off at that distance has no scale pop (the §5.18 seam). */
function orthoZoomForDist(dist) {
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return ORTHO_FRUSTUM / Math.max(halfH, 1e-3);
}

/** Ortho zoom to fit a world box (screenW × screenH, in the view's screen axes) into
 *  the frustum with FIT_PADDING margin — the larger dimension just fits. */
function fitOrthoZoom(screenW, screenH) {
  const aspect = orthoCamera.right / orthoCamera.top; // == viewport aspect (handleResize keeps it so)
  const halfW = Math.max((screenW / 2) * FIT_PADDING, 1e-3);
  const halfH = Math.max((screenH / 2) * FIT_PADDING, 1e-3);
  return Math.min((ORTHO_FRUSTUM * aspect) / halfW, ORTHO_FRUSTUM / halfH);
}

/** Map a box's world extents to each quick-view's screen axes, then fit. */
function fitOrthoZoomForView(kind, size) {
  if (kind === 'top') return fitOrthoZoom(size.x, size.z);  // down +Y: x→screenX, z→screenY
  if (kind === 'side') return fitOrthoZoom(size.z, size.y); // along +X: z→screenX, y→screenY
  return fitOrthoZoom(size.x, size.y);                      // front, along +Z: x→screenX, y→screenY
}

/** World box of the MEANINGFUL geometry the quick-view frames: the HP/VP plane pair
 *  (±SHEET/2 on each axis) expanded to include the current point, so an
 *  over-range point is still framed. Never the whole scene graph (a grid box
 *  would over-frame). */
function contentBoxWorld() {
  const half = SHEET / 2;
  const box = new THREE.Box3(
    new THREE.Vector3(-half, -half, -half),
    new THREE.Vector3(half, half, half),
  );
  const w = worldPosition(currentData);
  box.expandByPoint(new THREE.Vector3(w.x, w.y, w.z));
  return box;
}

/** Blend the ortho projection matrix toward the perspective one by projMorphK
 *  (0 = pure ortho, 1 = pure perspective), element-wise. Not physically exact, but over
 *  a sub-second move between matched-framing endpoints it reads as a smooth gain/loss of
 *  depth (the Module 2 technique §5.18 cites). Stamped by the render loop AFTER the tween
 *  + controls have rebuilt the pure-ortho matrix, so the blend is the last word before
 *  render. */
function applyProjectionMorph() {
  const k = projMorphK;
  const o = orthoCamera.projectionMatrix.elements; // pure ortho this frame
  const p = camera.projectionMatrix.elements;      // perspective, pose-independent
  for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * k;
  orthoCamera.projectionMatrixInverse.copy(orthoCamera.projectionMatrix).invert();
}

/** End any in-flight morph and restore a clean ortho matrix — so a leftover blend never
 *  bleeds into the next camera move (called on every seam that grabs or hands off the
 *  ortho camera). */
function clearProjectionMorph() {
  if (projMorphK === null) return;
  projMorphK = null;
  orthoCamera.updateProjectionMatrix();
}

/** Make the ortho camera live, seeding a smooth transition INTO it. First entry FROM
 *  perspective copies the live orbit pose + a zoom matching the perspective frustum (so
 *  frame 0 doesn't pop) and arms the perspective→ortho morph; an ortho→ortho reframe just
 *  clears any leftover blend. Callers then set the lit chip + tweenCamFull to the
 *  destination. Reduced motion skips the morph (projMorphK stays null). */
function engageOrtho() {
  if (activeCamera !== orthoCamera) {
    orthoCamera.position.copy(camera.position);
    orthoControls.target.copy(controls.target);
    orthoCamera.up.copy(camera.up);              // start the roll from the 3D view's up
    orthoCamera.zoom = orthoZoomForDist(camera.position.distanceTo(controls.target));
    orthoCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();             // morph endpoint must be current (aspect)
    projMorphK = prefersReducedMotion ? null : 1; // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph();
  }
  activeCamera = orthoCamera;
  activeControls = orthoControls;
  controls.enabled = false;
  orthoControls.enabled = true;
}

/** Return to the perspective free-orbit camera (which kept the learner's last orbit pose
 *  the whole time the ortho view was up). Instant by default; when `animate`, the ortho
 *  camera GLIDES onto the perspective pose while its projection morphs ortho→perspective
 *  on the same tween, so the swap lands with no cut. */
function restorePerspective(animate = false, duration = CAMERA_MOVE_MS, ease = easeStandard) {
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();
  activeQuickView = null;
  syncQuickViewChips();
  const handOff = () => {
    activeCamera = camera;
    activeControls = controls;
    orthoControls.enabled = false;
    controls.enabled = true;
  };
  if (!animate || prefersReducedMotion || activeCamera !== orthoCamera) { handOff(); return; }
  const fromPos = orthoCamera.position.clone();
  const fromTgt = orthoControls.target.clone();
  const fromUp = orthoCamera.up.clone();
  const fromZoom = orthoCamera.zoom;
  const toPos = camera.position.clone();
  const toTgt = controls.target.clone();
  const toUp = camera.up.clone();
  const toZoom = orthoZoomForDist(toPos.distanceTo(toTgt));
  camera.updateProjectionMatrix();
  projMorphK = 0; // armed; the loop stamps it each frame, 0 = ortho → 1 = perspective
  cameraTween = tween({
    from: 0, to: 1, duration, ease,
    onUpdate: (t) => {
      orthoCamera.position.lerpVectors(fromPos, toPos, t);
      orthoControls.target.lerpVectors(fromTgt, toTgt, t);
      orthoCamera.up.copy(fromUp).lerp(toUp, t).normalize();
      orthoCamera.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
      orthoCamera.updateProjectionMatrix();
      projMorphK = t;
    },
    onComplete: () => { cameraTween = null; projMorphK = null; handOff(); },
  });
}

/** Morph-aware mover for the ortho quick-views: lerps position, target, zoom and the
 *  screen-up roll. While morphing FROM perspective it holds the camera-to-target distance
 *  constant (no dolly wobble) and drives projMorphK 1→0 so the loop's blend finishes
 *  exactly as the camera lands. Runs on the shared `cameraTween` handle, so a quadrant
 *  flight / fold / reset cancels it just like a perspective flight. */
function tweenCamFull(toPos, toTgt, toZoom, duration, ease, toUp) {
  const cam = orthoCamera;
  const ctrls = orthoControls;
  const fromPos = cam.position.clone();
  const fromTgt = ctrls.target.clone();
  const fromZoom = cam.zoom ?? 1;
  const fromUp = toUp ? cam.up.clone() : null;
  const morphing = projMorphK !== null;
  const fromDist = morphing ? fromPos.distanceTo(fromTgt) : 0;
  cameraTween?.cancel();
  cameraTween = tween({
    from: 0, to: 1, duration, ease,
    onUpdate: (t) => {
      cam.position.lerpVectors(fromPos, toPos, t);
      ctrls.target.lerpVectors(fromTgt, toTgt, t);
      if (morphing) cam.position.sub(ctrls.target).setLength(fromDist).add(ctrls.target);
      if (fromUp) cam.up.copy(fromUp).lerp(toUp, t).normalize();
      if (toZoom != null) { cam.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t); cam.updateProjectionMatrix(); }
      if (morphing) projMorphK = 1 - t;
    },
    onComplete: () => { cameraTween = null; if (morphing) projMorphK = null; },
  });
}

// ============================================================================
// Quick-view camera chips (Top/Front/Side) — the .quick-views cluster in the
// top-left viewport chrome. simController.setView() engages the ortho camera +
// morph; these three helpers own the chip chrome + the "still lit?" bookkeeping.
// ============================================================================

/** Reflect activeQuickView onto the chip group: the lit chip gets .is-active +
 *  aria-pressed=true, the rest clear. Safe before the chips are bound (empty list). */
function syncQuickViewChips() {
  for (const btn of quickViewButtons) {
    const on = btn.dataset.quickView === activeQuickView;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

/** Drop any lit quick view when ANOTHER motion takes the camera (a user orbit drag,
 *  a quadrant flight, the fold, or reset), so no chip stays pressed for a pose the
 *  camera has already left. No-op when nothing is lit. */
function clearQuickView() {
  if (!activeQuickView) return;
  activeQuickView = null;
  syncQuickViewChips();
}

/** Orbit attempted while the rotate-locked ortho camera is live: nudge the lit chip (or the
 *  chip group when the flattened pan latched nothing) so the learner reads "disengage this
 *  view to orbit". The reflow between remove/add restarts the animation on a repeat drag. */
function cueOrthoLock() {
  const el = document.querySelector('[data-quick-view].is-active')
    || document.querySelector('.quick-views');
  if (!el) return;
  el.classList.remove('qv-lock-cue');
  void el.offsetWidth;
  el.classList.add('qv-lock-cue');
  setTimeout(() => el.classList.remove('qv-lock-cue'), 450);
}

/** Bind the Top/Front/Side chips once at boot: each drives simController.setView with
 *  its data-quick-view kind. The cluster is otherwise static chrome, so no handle is
 *  kept beyond the button list syncQuickViewChips() iterates. */
function setupQuickViews() {
  quickViewButtons = Array.from(document.querySelectorAll('[data-quick-view]'));
  for (const btn of quickViewButtons) {
    btn.addEventListener('click', () => simController.setView(btn.dataset.quickView));
  }
  syncQuickViewChips(); // start with every chip un-pressed (activeQuickView === null)
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);

  // Delta in ms (capped so a long pause/tab-switch doesn't jump the tweens).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  // Step the anim.js tweens (the fold swing + camera flights) from the render
  // loop, so simAPI.pause() halts in-flight animation along with the rendering.
  tickTweens(delta);

  activeControls.update(); // damping on whichever camera (perspective/ortho) is live
  // Perspective↔ortho projection morph (§5.18): stamped AFTER the tween + controls have
  // rebuilt the pure-ortho matrix, so the blended matrix is the last word before render.
  // No-op (null) whenever no morph is in flight — single-perspective render as before.
  if (projMorphK !== null) applyProjectionMorph();
  renderer.render(scene, activeCamera);
  // Quadrant numerals are CSS2D DOM the depth buffer can't clip: hide any numeral the HP/VP
  // sheets occlude from the live camera. AFTER renderer.render (fresh world matrices — the
  // fold hinge moves the sheets every frame), BEFORE the label re-projection paints them.
  labelLayer?.updateOcclusion(activeCamera, hvPlanes?.group);
  labelRenderer.render(scene, activeCamera); // re-project the CSS2D labels to the same frame
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0; // reset the delta clock so resume() doesn't see a stale gap
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize — track the container (the host can resize the iframe with no window event).
// ============================================================================

/** Pin the WebGL canvas's CSS display size to the integer logical px used for its
 *  backing store (renderer.setSize uses updateStyle=false). Inline style beats the
 *  stylesheet's width/height:100%, so device pixels map 1:1 with no fractional upscale. */
function pinCanvasSize(w, h) {
  const el = renderer?.domElement;
  if (!el) return;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
}

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Keep the ortho frustum at the viewport aspect (right/top ratio == aspect, which
  // fitOrthoZoom relies on); per-view zoom does the framing. Don't rebuild its matrix
  // mid-morph — applyProjectionMorph owns it until the blend clears (§5.18).
  if (orthoCamera) {
    const a = w / h;
    orthoCamera.left = -ORTHO_FRUSTUM * a;
    orthoCamera.right = ORTHO_FRUSTUM * a;
    orthoCamera.top = ORTHO_FRUSTUM;
    orthoCamera.bottom = -ORTHO_FRUSTUM;
    if (projMorphK === null) orthoCamera.updateProjectionMatrix();
  }
  // Re-assert the device-pixel ratio on every resize so the backing store always tracks the
  // CURRENT devicePixelRatio: a browser zoom, a monitor move, or entering the compare split can
  // shift the effective mapping, and setPixelRatio is otherwise only called once at boot. Paired
  // with pinCanvasSize below, this keeps device pixels 1:1 in the split pane too (Task 1).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  pinCanvasSize(w, h);         // display px == integer logical px (no sub-pixel blur, see buildScene)
  labelRenderer.setSize(w, h); // keep the CSS2D overlay tracking the canvas

  // Fat lines render the wrong thickness if LineMaterial.resolution drifts from
  // the viewport — keep every leaf's materials in sync on resize (RULES.md §3.16).
  hvPlanes?.setResolution(w, h);
  pointRig?.setResolution(w, h);
  labelLayer?.setResolution(w, h);

  // The Compare card's stage tracks the viewport (vw/vh sizing) — repaint its
  // drawing at the new backing-store size so the linework stays crisp.
  if (compareOpen) drawCompare();
}

/** Re-measure the viewport AFTER a layout-changing reflow has actually been laid out.
 *  Entering/leaving the compare-split flips the body between a flex row and a CSS grid —
 *  a heavy reflow that is NOT committed by the first requestAnimationFrame. Measuring on
 *  that first frame reads the PRE-reflow (full-width) pane and pins a stale, oversized
 *  canvas into the half-width split pane, so the 3D view renders soft / mis-scaled until an
 *  unrelated resize nudges the ResizeObserver. Waiting a SECOND frame lets layout settle so
 *  handleResize reads the true pane size and the device-pixel mapping stays razor-sharp (Task 1). */
function remeasureAfterReflow() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    handleResize(viewport);
    if (compareOpen) drawCompare();
  }));
}

// ============================================================================
// Mobile advisory — banner only, never blocks the sim (RULES.md §2.13).
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
// ResizeObserver in init() keeps the renderer + LineMaterial resolution in sync.
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // In the workbench split the wizard is collapsed BY the split; the chevron's
    // job there is to bring the steps back — i.e. shrink out of the split (ADR-037,
    // mirroring ADR-021). handleResize + the aria-expanded reset happen inside
    // applyCompareSize → its rAF, so fall through after.
    if (workbenchOpen) {
      applyCompareSize('compact');
      btn.setAttribute('aria-expanded', 'true');
      btn.title = 'Hide steps panel';
      announce('Left the split — steps panel shown.');
      return;
    }
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');
    // rAF lets the flex reflow settle so handleResize reads the final dimensions.
    requestAnimationFrame(() => handleResize(viewport));
  });
}

// ============================================================================
// Platform contract — window.simAPI (RULES.md §2.8–§2.9).
// ============================================================================

/**
 * The platform calls pause() when overlays/whiteboard open and resume() on close.
 * reset() restores defaultPointData() and the default camera and routes through
 * rebuild() — the ONE reset path the in-sim Reset button must also use
 * (RULES.md §2.9: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    compare.hide(); // no-op when closed; the reset announcement lands last
    currentData = defaultPointData();
    currentView = { ...DEFAULT_VIEW };
    folded = false;
    cancelTweens(); // drop in-flight fold + camera tweens before zeroing state
    foldTween = null;
    cameraTween = null;
    foldAngle = 0;
    foldTarget = 0;
    resetCamera(); // instant — reset is a snap back to truth, never a flight
    clearQuickView(); // camera is home → no Top/Front/Side chip stays lit
    rebuild();
    onboarding?.clear(); // no stale hint chip narrates the previous run
    // Wizard back to Step 1 AFTER the state is clean — stepper.reset() only
    // redraws its own chrome and re-applies Step 1's view flags through
    // applyView(); it never touches the scene directly (no second reset path).
    stepper?.reset();
    ui?.sync();
    announce('Simulation reset.');
  },
};

// ============================================================================
// Self-start (RULES.md §2.14: runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container;

  // The one hard-fail here is WebGL context creation (acceleration off / blocklisted
  // GPU). Catch it and surface the on-brand fallback instead of a blank iframe.
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  try {
    setupMobileNotice();
    setupWizardToggle();
    setupQuickViews(); // bind the Top/Front/Side chips (setView flies the camera)
    setupCompareCard(); // bind the ADR-012 chrome BEFORE the stepper's first
                        // applyView drives syncCompareChipVisibility
    rebuild();

    // Onboarding first, so the wizard's step-1 spotlight/orbit-hint calls land.
    onboarding = initOnboarding(controls);

    // The wizard. initStepper renders Step 1 and pushes its view flags back
    // through simController.applyView() → rebuild(), so the scene and card
    // start in sync.
    stepper = initStepper(simController);

    // The glossary popovers: one delegated wiring on #wizard survives every step
    // re-render, so this runs exactly once (no handle needed — static chrome).
    initTerms();

    // The parameter dock — AFTER the stepper, so its first sync() reads the
    // already-applied Step 1 state.
    ui = initUIManager(simController);

    // The textbook Problem Library — AFTER the stepper (goStep), onboarding (cueHint),
    // and the dock exist, so its facade calls all resolve. Data-driven from
    // pointProblems.js; entryStep pins a loaded problem to Step 1 (Quadrants) so the
    // learner dials from the top of the rail — never auto-filled (ADR-015).
    problemLibrary = initProblemLibrary(simController, {
      list: POINT_PROBLEMS,
      tiers: POINT_TIERS,
      fieldLabels: POINT_FIELD_LABELS,
      entryStep: () => 1, // 1-indexed Step 1 = Quadrants (stepper.goStep is 1-indexed)
    });

    // One extra rebuild once the bundled fonts land, so the CSS2D labels never
    // linger in a fallback face (RULES.md §3.26). The pipeline is state-driven,
    // so this is a pure repaint of the same view.
    document.fonts.ready.then(() => rebuild());

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  markBooted(); // last — only on a fully successful boot
}

init();
