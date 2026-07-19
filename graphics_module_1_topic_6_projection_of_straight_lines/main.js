// main.js — Orchestrator (Module 1 Topic — Projection of Straight Lines).
//
// Standalone orchestrator on Module 2's orchestrator + leaf-module pattern (ADR-007,
// ADR-033 — overturns ADR-011 for this topic). It owns — and is the ONLY owner of —
// the scene, the single WebGLRenderer, the camera + OrbitControls, the CSS2D overlay,
// the single rebuild() pipeline, the full WebGL disposal contract (ADR-004), the render
// loop, and the window.simAPI platform contract (RULES.md §2.8). No engine.js import.
//
// Phase 4B (this file) adds the ADR-017 PEDAGOGICAL workflow on top of the 4A boot
// checkpoint: the 5-step guided stepper (stepper.js) driving one general line through
// True Length → Distance from HP/VP → Inclinations (θ & φ) → Generate Orthographic
// Projections → Draw Traces, with dedicated per-step controls (uiManager.js), glossary
// popovers (terms.js), first-run spotlights (onboarding.js), and the reversible fold.
//
// STILL DEFERRED to later phases (NOT in 4B): the ADR-036 orthographic camera SWOOP on
// the fold — the fold here hinges the sheet with the camera left in free orbit (NOT the
// forbidden held-angle dolly of §5.8, and NOT a claimed swoop; §5.7 is deferred to the
// camera/2D-sheet phase). Also deferred: the Compare card + workbench, the 2D
// orthographic sheet (compareSheet.js), the Traces + True-Length CONSTRUCTIONS,
// BIS dimensioning, CSS2D labels, and the Problem Library (lineProblems.js is present as
// the data layer, its modal entry hidden).
//
// World axes (Module-1 family): HP = XZ plane (y=0) · VP = XY plane (z=0) · fold = X axis.
// Scale: 1 world unit = 10 mm (ADR-018). Colours come from CSS tokens (ADR-003 / §4.1).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { defaultLineData, resolveLine } from './src/lineData.js';
import { STEPS } from './src/lineSteps.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeFold, easeStandard, easeCamera } from './src/anim.js';
import { createLineRig } from './src/lineRig.js';
import { initStepper } from './src/stepper.js';
import { initUIManager } from './src/uiManager.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { createCompareSheet } from './src/compareSheet.js';
import { createTraces } from './src/traces.js';
import { createTrueLength } from './src/trueLength.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { PROBLEMS as LINE_PROBLEMS, TIERS as LINE_TIERS, FIELD_LABELS as LINE_FIELD_LABELS } from './src/lineProblems.js';

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const cssColor = (name) =>
  new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());

/** Default 3D framing (from the legacy Lines cam3): a 3/4 view pulled back to suit the
 *  enlarged 60×60 (600 mm) sheet, target lifted so the subject line centres. */
const CAMERA_POSITION = new THREE.Vector3(-21, 16, 21);
const CAMERA_TARGET = new THREE.Vector3(0, 2, 0);

/** The base viewport flags each step's `view` merges over. */
const DEFAULT_VIEW = { showLine: false, showFV: false, showTV: false };

/** The step-4 rabatment: 90° about the X fold line, 1600 ms on the heavy hinge curve
 *  (anim.js easeFold; snaps under prefers-reduced-motion — anim.js lands the tween on
 *  its end value immediately). ADR-036's ortho camera swoop is DEFERRED to the camera
 *  phase — this fold hinges the sheet with the camera left in free orbit. */
const FOLD_ANGLE = Math.PI / 2;
const FOLD_MS = 1600;

/** Dual-camera orthographic swoop constants (ADR-036 / RULES.md §5.7, §5.18). The fold
 *  hands the view to a second ORTHOGRAPHIC camera and sweeps it square-on to the flattened
 *  answer sheet while the projection matrix morphs perspective → orthographic, so the fold
 *  lands on a TRUE flat 2D drawing (no residual foreshortening). Held-angle folds are
 *  FORBIDDEN (§5.8). The fold uses the `front` vantage; the Top/Front/Side quick-views
 *  (Phase 5B) reuse this SAME dual-camera stack + morph — no new camera system. */
const CAMERA_MOVE_MS = 900;
const ORTHO_FRUSTUM = 12;
const FIT_PADDING = 1.12;
/** Quick-view directions + screen-ups (world axes: HP = XZ y=0, VP = XY z=0, fold line = X).
 *  Each view stands the ORTHOGRAPHIC camera off along `dir` and rolls it with `up`; the ortho
 *  zoom does the framing (RULES.md §5.18). The fold swoop reuses `front`. */
const QV_DIR = {
  top:   { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) }, // look down −Y at HP
  front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },  // look along −Z at VP
  side:  { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },  // look along −X down the fold line
};
const SHEET_HALF = 12; // reference sheet is 24 world units (240 mm); half-extent for framing (matches lineRig SHEET)

// ============================================================================
// Orchestrator-owned state (the ONLY owner — no engine.js)
// ============================================================================

let renderer, scene, camera, controls, viewport, labelRenderer, contentGroup;
let sheetLabelRenderer; // 2nd CSS2D overlay: the ortho-sheet labels (its own scene + ortho camera)
let rafId = null;
let running = false;
let lastFrameTime = 0;

/** The dual-camera orthographic stack (ADR-036 / §5.18). A second ORTHOGRAPHIC camera +
 *  its own OrbitControls live alongside the perspective pair; the fold swoop makes it live.
 *  activeCamera/activeControls point at whichever pair the render loop draws + updates
 *  (perspective by default). projMorphK is the perspective↔ortho projection-matrix blend
 *  (null = no morph; the loop lerps the ortho matrix toward the perspective one each frame).
 *  cameraTween is the in-flight camera flight (the fold swoop rides this handle). */
let orthoCamera, orthoControls, activeCamera, activeControls;
let projMorphK = null;
let cameraTween = null;

/** The lit quick-view chip's kind ('top'|'front'|'side'), or null in free orbit / any other pose. */
let activeQuickView = null;
let quickViewButtons = [];

/** The single bag of numbers rebuild() consumes. Mutated ONLY via commit(). */
let currentData = defaultLineData();

/** The active step's viewport flags (the stepper is the only writer, via applyView). */
let currentView = { ...DEFAULT_VIEW };

/** Whether the sheet is folded flat (step 4). Flips synchronously in fold()/unfold();
 *  foldAngle animates toward the matching pose. */
let folded = false;

/** Live hinge angle (0 = open 3D corner, +π/2 = folded flat). Handed to the fresh
 *  leaf every rebuild so a rebuild mid-swing lands in pose. */
let foldAngle = 0;

/** In-flight fold tween (anim.js), or null. */
let foldTween = null;

/** The 3D content leaf's handle, rebuilt by rebuild(), or null before first build. */
let lineRig = null;

/** The behaviour leaves' handles, set in init(). */
let stepper = null;
let ui = null;
let onboarding = null;

// --- Compare View (ADR-012) + workbench split (ADR-021) + the 2nd-pass ortho sheet ---
let compareOpen = false;
let compareSize = 'compact';                 // 'compact' | 'expanded'
let workbenchOpen = false;
let workbenchRail = null;
let compareCard = null;
let compareChip = null;
let compareSheet = null;                     // the dedicated ortho-sheet leaf (2nd render pass)
const COMPARE_DEFAULT_SIZE = 'expanded';     // desktop opens straight into the 50/50 split (ADR-021)
const WORKBENCH_CONTROLS = ['tl', 'disthp', 'distvp', 'theta', 'phi'];

// --- Constructions (Phase 4E): the Traces (HT/VT) + True-Length overlays on the ortho sheet ---
let conMode = null;   // null | 'trace' | 'tl'
let conLeaf = null;   // the active construction leaf { group, animate, duration }, or null
let conRAF = null;    // the construction animation rAF handle

// --- Problem Library (ADR-015) — the textbook exercise selector; never auto-fills ---
let problemLibrary = null;
/** State-change subscribers fired at the end of every rebuild() (the ONE seam every parameter /
 *  step / reset change passes through). The self-check subscribes here via onStateChange. */
const stateChangeSubs = new Set();

/** Scissor regions in DEVICE px (GL origin bottom-left), recomputed on layout change.
 *  `main` = the 3D pass region (full canvas, or the left pane in the split); `sheet` =
 *  the 2D ortho pass region (the Compare card stage rect), or null when Compare is closed. */
let regions = { main: { x: 0, y: 0, w: 1, h: 1 }, sheet: null };
const _v2 = new THREE.Vector2();

const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Small helpers
// ============================================================================

function viewportSize() {
  return { width: viewport?.clientWidth || 1, height: viewport?.clientHeight || 1 };
}

function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/** Fire every state-change subscriber (the Problem Library self-check). Each callback is guarded so
 *  one throwing subscriber can never break the rebuild() pipeline. */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/** Whether the learner has dialled the line away from its defaults — gates the Problem Library's
 *  "loading clears your work" confirm (skipped at defaults). */
function hasDialedWork() {
  const d0 = defaultLineData();
  return currentData.TL !== d0.TL || currentData.theta !== d0.theta || currentData.phi !== d0.phi
    || currentData.aHP !== d0.aHP || currentData.aVP !== d0.aVP;
}

let toastEl = null, toastTimer = null, toastHideTimer = null;
/** Brief calm success toast over the viewport (DESIGN.md — no gamified fanfare).
 *  setTimeout-driven so it fades independently of pause/resume; aria-hidden (the
 *  live region already narrates the win). */
function showToast(message) {
  toastEl ??= document.getElementById('sim-toast');
  if (!toastEl) return;
  const text = toastEl.querySelector('.sim-toast__text');
  if (text) text.textContent = message;
  clearTimeout(toastTimer);
  clearTimeout(toastHideTimer);
  toastEl.hidden = false;
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, 240);
  }, 3500);
}

/** Pin the canvas display size to the integer logical px so device pixels map 1:1. */
function pinCanvasSize(w, h) {
  const c = renderer.domElement;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
}

/** Signal a successful boot to the index.html watchdog (self-heals a slow load). */
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
// Scene bootstrap — ONE WebGLRenderer, one WebGL context.
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;

  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 200);
  camera.position.copy(CAMERA_POSITION);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  pinCanvasSize(w, h);
  renderer.shadowMap.enabled = false; // no cast shadows (RULES.md §3.24)
  // We drive clears per scissored pass (3D region + 2D-sheet region on the ONE canvas),
  // so autoClear is off and the clear colour is the paper background.
  renderer.autoClear = false;
  renderer.setClearColor(cssColor('--color-paper'), 1);
  container.appendChild(renderer.domElement);

  // Flat CAD light: ambient fill + one low directional, no shadows (RULES.md §3.24).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  scene.add(key);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();

  // The dual-camera ortho stack (ADR-036 / §5.18). A second OrthographicCamera shares the
  // canvas via its own OrbitControls; the frustum is seeded at the viewport aspect (kept in
  // sync by computeRegions) and per-move zoom does the framing. Its controls stay disabled
  // until the fold swoop engages it (only one camera consumes pointer events at a time), and
  // orbit is locked on it (the folded sheet is a square-on 2D read — rotating it would shear
  // the flat layout). It starts on the perspective pose so frame 0 of the first morph doesn't jump.
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
  orthoControls.enableRotate = false;

  // The perspective pair is live at boot; activeCamera/activeControls are what the loop draws.
  activeCamera = camera;
  activeControls = controls;

  // A user drag mid-flight cancels the camera tween so the learner's hand wins the swoop's
  // tail. The FOLD tween is left alone (orbiting during the rabatment is fine).
  controls.addEventListener('start', () => { cameraTween?.cancel(); cameraTween = null; });

  // An attempted ORBIT on the rotate-locked ortho camera (a lit quick-view) fires no
  // OrbitControls event — catch the pointerdown and nudge the lit chip so the learner reads
  // "disengage this view to orbit" (parity with the Points reference's cueOrthoLock).
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activeCamera !== orthoCamera) return;
    cueOrthoLock();
  });

  contentGroup = new THREE.Group();
  scene.add(contentGroup);

  // CSS2D overlay (RULES.md §3.27) — empty in Phase 4B (the label layer is a later
  // phase), but wired so the pipeline + disposal contract are the final shape.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);

  // A SECOND CSS2D overlay for the 2D ortho sheet's labels — projected with compareSheet's ortho
  // camera and sized/positioned to the sheet's pass rect (the legacy per-stack CSS2D pattern). DOM
  // only, so it holds no WebGL context. Hidden until Compare opens.
  sheetLabelRenderer = new CSS2DRenderer();
  sheetLabelRenderer.setSize(w, h);
  const soverlay = sheetLabelRenderer.domElement;
  soverlay.style.position = 'absolute';
  soverlay.style.top = '0';
  soverlay.style.left = '0';
  soverlay.style.pointerEvents = 'none';
  soverlay.style.display = 'none';
  container.appendChild(soverlay);
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (RULES.md §3.1, non-negotiable).
// Consumes currentData + currentView + foldAngle: dispose the content leaf, then
// let it rebuild itself from the state.
// ============================================================================

/** Full disposal contract (ADR-004 §3.3): the leaf frees its own geometries +
 *  materials, then the content group drops the reference. */
function disposeContent() {
  lineRig?.dispose();
  lineRig = null;
  contentGroup.clear();
}

function rebuild() {
  disposeContent();
  const resolved = resolveLine(currentData);

  // Fat-line resolution is the 3D pass's DEVICE-px region (full canvas, or the left pane
  // in the split), so line weights read correctly in whichever viewport the 3D renders in.
  lineRig = createLineRig({ resolved, view: currentView, foldAngle, width: regions.main.w, height: regions.main.h });
  contentGroup.add(lineRig.group);

  // The Compare sheet is a LIVE drawing rebuilt on every commit, never a snapshot (ADR-012
  // §5.14). Only repaint when open — a closed card costs nothing.
  if (compareOpen && compareSheet) compareSheet.setData(resolved, currentView);

  // The ONE seam the Problem Library self-check subscribes to (every parameter / step / reset
  // change passes through here). Empty subscriber set before the library wires up → a no-op.
  notifyStateChange();
}

/** Merge a partial change into the line data and re-derive the scene — the one write
 *  path for currentData (controls never touch the scene, RULES.md §3.2). The control
 *  surfaces re-sync afterward from the settled state. */
function commit(patch) {
  if (conMode) teardownCon(); // a value edit invalidates an animated construction (can't update live)
  currentData = { ...currentData, ...patch };
  rebuild();
  ui?.sync();
  stepper?.sync();
}

// ============================================================================
// Dual-camera orthographic swoop (ADR-036 / RULES.md §5.7, §5.18) — ported from the
// Points topic (itself verbatim Module 2's `orthoViews` path). engageOrtho makes the
// ortho camera live + arms the perspective→ortho morph; tweenCamFull glides + fits it
// square-on; restorePerspective glides back + morphs ortho→perspective; applyProjectionMorph
// is stamped by the render loop. Framing is zoom-driven, seeded to match the perspective
// frustum height at the same distance, so the two-camera hand-off never pops in scale.
// ============================================================================

/** Ortho zoom whose frustum HEIGHT matches the perspective frustum height at `dist`, so a
 *  perspective→ortho hand-off at that distance has no scale pop (the §5.18 seam). */
function orthoZoomForDist(dist) {
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return ORTHO_FRUSTUM / Math.max(halfH, 1e-3);
}

/** Ortho zoom to fit a world box (screenW × screenH in the view's screen axes) with
 *  FIT_PADDING margin — the larger dimension just fits. */
function fitOrthoZoom(screenW, screenH) {
  const aspect = orthoCamera.right / orthoCamera.top; // == viewport aspect (kept so by computeRegions)
  const halfW = Math.max((screenW / 2) * FIT_PADDING, 1e-3);
  const halfH = Math.max((screenH / 2) * FIT_PADDING, 1e-3);
  return Math.min((ORTHO_FRUSTUM * aspect) / halfW, ORTHO_FRUSTUM / halfH);
}

/** Map a world box's extents to each quick-view's screen axes, then fit. */
function fitOrthoZoomForView(kind, size) {
  if (kind === 'top') return fitOrthoZoom(size.x, size.z);  // down −Y: x→screenX, z→screenY
  if (kind === 'side') return fitOrthoZoom(size.z, size.y); // along −X: z→screenX, y→screenY
  return fitOrthoZoom(size.x, size.y);                      // front, along −Z: x→screenX, y→screenY
}

/** World box of the meaningful geometry a quick-view frames: the line AB + its four view feet +
 *  the fold-line origin, expanded a touch. Not the full grid (a grid box would over-frame). */
function contentBoxWorld() {
  const M = resolveLine(currentData);
  const cx = (M.A.x + M.B.x) / 2;
  const w = (v) => v * 0.1;
  const ax = w(M.A.x - cx), bx = w(M.B.x - cx);
  const pts = [
    new THREE.Vector3(ax, w(M.A.y), w(M.A.z)), new THREE.Vector3(bx, w(M.B.y), w(M.B.z)),  // A, B
    new THREE.Vector3(ax, w(M.A.y), 0), new THREE.Vector3(bx, w(M.B.y), 0),                 // a′, b′
    new THREE.Vector3(ax, 0, w(M.A.z)), new THREE.Vector3(bx, 0, w(M.B.z)),                 // a, b
    new THREE.Vector3(0, 0, 0),                                                             // fold origin
  ];
  return new THREE.Box3().setFromPoints(pts).expandByScalar(0.8);
}

/** Blend the ortho projection matrix toward the perspective one by projMorphK (0 = pure
 *  ortho, 1 = pure perspective), element-wise — a smooth gain/loss of depth over the
 *  sub-second move (§5.18). Stamped by the loop AFTER the tween + controls rebuilt the
 *  pure-ortho matrix, so the blend is the last word before render. */
function applyProjectionMorph() {
  const k = projMorphK;
  const o = orthoCamera.projectionMatrix.elements; // pure ortho this frame
  const p = camera.projectionMatrix.elements;      // perspective (pose-independent)
  for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * k;
  orthoCamera.projectionMatrixInverse.copy(orthoCamera.projectionMatrix).invert();
}

/** End any in-flight morph + restore a clean ortho matrix, so a leftover blend never bleeds
 *  into the next camera move. */
function clearProjectionMorph() {
  if (projMorphK === null) return;
  projMorphK = null;
  orthoCamera.updateProjectionMatrix();
}

/** Make the ortho camera live, seeding a smooth transition INTO it: copy the live orbit pose
 *  + a zoom matching the perspective frustum (so frame 0 doesn't pop) and arm the
 *  perspective→ortho morph. Reduced motion skips the morph (projMorphK stays null). */
function engageOrtho() {
  if (activeCamera !== orthoCamera) {
    orthoCamera.position.copy(camera.position);
    orthoControls.target.copy(controls.target);
    orthoCamera.up.copy(camera.up);
    orthoCamera.zoom = orthoZoomForDist(camera.position.distanceTo(controls.target));
    orthoCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();               // morph endpoint must be current (aspect)
    projMorphK = prefersReducedMotion ? null : 1;  // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph();
  }
  activeCamera = orthoCamera;
  activeControls = orthoControls;
  controls.enabled = false;
  orthoControls.enabled = true;
}

/** Return to the perspective free-orbit camera (which kept the learner's last orbit pose the
 *  whole time the ortho view was up — §5.9). Instant by default; when `animate`, the ortho
 *  camera GLIDES onto the perspective pose while its projection morphs ortho→perspective on
 *  the same tween, so the swap lands with no cut. */
function restorePerspective(animate = false, duration = CAMERA_MOVE_MS, ease = easeStandard) {
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();
  clearQuickView(); // the camera is heading home → no Top/Front/Side chip stays lit
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

/** Morph-aware mover for the ortho camera: lerps position, target, zoom and the screen-up
 *  roll. While morphing FROM perspective it holds the camera-to-target distance constant (no
 *  dolly wobble) and drives projMorphK 1→0 so the loop's blend finishes as the camera lands. */
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

/** World box of the FLATTENED answer sheet + the two views riding it — the frame target for
 *  the ortho fold swoop (ADR-036). After the +90° rabatment everything lies in z = 0: the VP
 *  sheet keeps x/y ∈ ±SHEET/2, the front view lands at y = +height, the folded top view at
 *  y = −depth (both centred on the line's mid-lateral, matching lineRig). */
function flatSheetBox() {
  const M = resolveLine(currentData);
  const cx = (M.A.x + M.B.x) / 2;
  const w = (v) => v * 0.1;
  const ax = w(M.A.x - cx), bx = w(M.B.x - cx);
  // Frame the DRAWING — the front view (a′b′ above XY), the folded top view (ab below XY), and the
  // views' feet on XY — with a margin, NOT the whole ±SHEET/2 sheet. The Lines sheet is 60 units
  // (for big lines), so clamping to ±30 zoomed the fold OUT and left the drawing tiny in a huge grid
  // (Issue 2). Framing the drawing lets the swoop fill the pane with the finished orthographic sheet
  // (matching the Points reference, whose compact 9-unit sheet framed the drawing naturally).
  const pts = [
    new THREE.Vector3(ax, w(M.A.y), 0), new THREE.Vector3(bx, w(M.B.y), 0),     // a′ b′ (elevation, above XY)
    new THREE.Vector3(ax, -w(M.A.z), 0), new THREE.Vector3(bx, -w(M.B.z), 0),   // a  b  (plan, folded below XY)
    new THREE.Vector3(ax, 0, 0), new THREE.Vector3(bx, 0, 0),                   // feet on the XY line
  ];
  const b = new THREE.Box3().setFromPoints(pts).expandByScalar(2.4); // breathing-room margin
  b.min.z = 0; b.max.z = 0;
  return b;
}

/** The fold's camera event (ADR-036): SWOOP the ortho camera square-on to the flattened
 *  answer sheet (front-on along −Z at the VP) while the projection morphs perspective →
 *  orthographic on the SAME easeFold curve the hinge swings on, so camera + planes read as
 *  one move and the fold lands as a TRUE flat 2D drawing. The perspective camera is left
 *  UNTOUCHED, so the reverse fold (restorePerspective) glides straight back onto the
 *  learner's retained orbit pose (§5.9). */
function swoopToAnswerSheet(duration) {
  const box = flatSheetBox();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const qd = QV_DIR.front;
  const toZoom = fitOrthoZoom(size.x, size.y);      // front view: x→screenX, y→screenY
  const dist = camera.position.distanceTo(controls.target);
  const toPos = center.clone().addScaledVector(qd.dir, dist);
  engageOrtho();                                    // seed ortho on the perspective pose + arm the morph
  tweenCamFull(toPos, center, toZoom, duration, easeFold, qd.up.clone());
}

// ============================================================================
// QUICK-VIEW CAMERAS (Phase 5B) — Top / Front / Side + Return to Perspective.
// Reuses the SAME dual-camera stack the fold swoop uses (engageOrtho / tweenCamFull /
// restorePerspective / the projectionMorphK morph) — NO new camera system. A chip engages
// the ortho camera and glides it square-on to the named plane; re-clicking the lit chip (or
// any other camera move) returns to the perspective free-orbit pose.
// ============================================================================

/** Reflect activeQuickView onto the chip group: the lit chip gets .is-active + aria-pressed. */
function syncQuickViewChips() {
  for (const btn of quickViewButtons) {
    const on = btn.dataset.quickView === activeQuickView;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
}

/** Orbit attempted while the rotate-locked ortho camera is live: nudge the lit chip (or the chip
 *  group) so the learner reads "disengage this view to orbit". The reflow restarts the animation
 *  on a repeat drag. Ported from the Points reference for parity. */
function cueOrthoLock() {
  const el = document.querySelector('[data-quick-view].is-active') || document.querySelector('.quick-views');
  if (!el) return;
  el.classList.remove('qv-lock-cue');
  void el.offsetWidth;
  el.classList.add('qv-lock-cue');
  setTimeout(() => el.classList.remove('qv-lock-cue'), 450);
}

/** Drop any lit quick view when another motion takes the camera (return, fold, reset, drag). */
function clearQuickView() {
  if (!activeQuickView) return;
  activeQuickView = null;
  syncQuickViewChips();
}

/** Quick-view chip (Top/Front/Side): engage the ortho camera + morph square-on to the named
 *  plane, framing the meaningful geometry. Re-clicking the lit chip RETURNS to perspective. A
 *  no-op while a fold owns the camera or the sheet is folded flat. */
function setView(kind) {
  if (!QV_DIR[kind]) return;
  if (foldTween || folded) return; // the fold owns the camera; quick-views are for the open 3D corner
  if (activeQuickView === kind) { restorePerspective(true); announce('Returned to orbit view.'); return; }
  const box = contentBoxWorld();
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const qd = QV_DIR[kind];
  const toZoom = fitOrthoZoomForView(kind, size);
  const dist = camera.position.distanceTo(controls.target);
  const toPos = center.clone().addScaledVector(qd.dir, dist);
  engageOrtho();
  activeQuickView = kind;
  syncQuickViewChips();
  tweenCamFull(toPos, center, toZoom, CAMERA_MOVE_MS, easeCamera, qd.up.clone());
  announce(`${kind[0].toUpperCase()}${kind.slice(1)} view.`);
}

/** Bind the Top/Front/Side chips + reveal the cluster. */
function setupQuickViews() {
  const cluster = document.querySelector('.quick-views');
  if (!cluster) return;
  cluster.hidden = false;
  quickViewButtons = [...cluster.querySelectorAll('[data-quick-view]')];
  for (const btn of quickViewButtons) {
    btn.setAttribute('aria-pressed', 'false');
    btn.title = `${btn.textContent} view — click again to return to perspective`;
    btn.addEventListener('click', () => setView(btn.dataset.quickView));
  }
}

/** Tween the hinge from wherever it stands to `toAngle` (duration scales with the remaining
 *  arc so a reversed half-fold swings back at the same pace). Pure transform every frame — no
 *  rebuild while swinging. The fold OWNS the camera (ADR-036): forward SWOOPS the ortho camera
 *  square-on to the answer sheet + morphs perspective → ortho; reverse GLIDES back onto the
 *  retained perspective orbit pose. Both run on the hinge's duration + easeFold curve, so
 *  camera and planes move as one. Held-angle folds are FORBIDDEN (§5.8). */
function driveFold(toAngle) {
  foldTween?.cancel();
  // A forward fold closes a floating (compact) Compare card so it can't fight the fold; the
  // split can't fold (its fold control lives in the collapsed wizard), so leave it alone.
  if (toAngle === FOLD_ANGLE && compareOpen && !workbenchOpen) compare.hide();
  clearQuickView(); // the fold takes the camera → no quick-view chip stays lit
  cameraTween?.cancel();
  cameraTween = null;
  const arc = Math.abs(toAngle - foldAngle) / FOLD_ANGLE;
  const duration = Math.max(1, FOLD_MS * arc);

  // The camera event (ADR-036) shares the hinge's duration + easeFold curve.
  if (toAngle === FOLD_ANGLE) swoopToAnswerSheet(duration);
  else restorePerspective(true, duration, easeFold);

  foldTween = tween({
    from: foldAngle,
    to: toAngle,
    duration,
    ease: easeFold,
    onUpdate: (a) => { foldAngle = a; lineRig?.setFoldAngle(a); },
    onComplete: () => { foldTween = null; },
  });
}

// ============================================================================
// simController — the injected contract every leaf receives (ADR-007). stepper.js,
// uiManager.js, and onboarding (via spotlight/orbitHint) consume this one surface.
// ============================================================================

const simController = {
  announce,
  showToast,
  getData: () => ({ ...currentData }),
  getView: () => ({ ...currentView, folded }),
  isFolded: () => folded,
  commit,

  /** The stepper pushes each step's viewport flags through here — the ONE channel the
   *  wizard drives the scene through (routes into rebuild()). */
  applyView(stepView) {
    if (conMode) teardownCon(); // a step change closes any open construction
    currentView = { ...DEFAULT_VIEW, ...stepView };
    rebuild();
    syncCompareChipVisibility(); // the 2D drawing is meaningless before both views exist
    ui?.sync();
  },

  /** Step 4 — the reversible fold. `folded` flips synchronously so the stepper's
   *  done-gate reads the new state right away; driveFold animates the hinge. */
  fold() {
    if (folded) return;
    folded = true;
    driveFold(FOLD_ANGLE);
  },
  unfold() {
    if (!folded) return;
    folded = false;
    driveFold(0);
  },

  spotlight(id) { onboarding?.spotlight(id); },
  orbitHint() { onboarding?.orbitHint(); },
  reset() { window.simAPI.reset(); },

  // --- Problem Library seam (ADR-015) — the small read/route facade the textbook self-check
  //     consumes. It NEVER auto-fills: loading a problem only resets to defaults + routes to
  //     Step 1 (ADR-017); the student dials by hand. ---

  /** The RAW dialled data the ±0.5 self-check compares against a problem's target (keys
   *  TL / theta / phi / aHP / aVP — the same units the targets store). */
  state: () => ({ ...currentData }),
  /** Whether there is dialled work to lose — gates the library's "clears your work" confirm. */
  hasWork: hasDialedWork,
  /** True while the rabatment is animating: loading a problem holds off until the fold settles. */
  isBusy: () => foldTween !== null,
  /** Route a freshly-loaded problem to its dial-able entry step (1-indexed). Pinned to Step 1
   *  (True Length) for Lines — the learner then walks the dedicated per-step controls. */
  goStep: (n) => stepper?.goStep(n),
  /** Flash an ad-hoc onboarding chip (a per-problem cue). */
  cueHint: (text) => onboarding?.cue?.(text),
  /** The first revealed control of the current step — focused after a problem loads so a keyboard
   *  learner lands on the dial (Step 1 reveals the True Length slider), not the closed overlay. */
  firstControl: () => document.querySelector(
    '#controls [data-ctrl]:not([hidden]) input, #controls [data-ctrl]:not([hidden]) select',
  ),
  /** Register a callback fired at the end of every rebuild(). Returns an unsubscribe fn. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
  /** Whether a textbook problem is currently loaded. */
  isProblemActive: () => problemLibrary?.isActive?.() ?? false,
  /** Terminal payoff: clear the problem, reset through the single path, then reopen the library. */
  completeAndNext,
};

/** "Complete & next problem" — clear the finished exercise and open the library to choose the next
 *  (routes through the SINGLE reset path). Dormant unless a future affordance calls it. */
function completeAndNext() {
  const hadProblem = problemLibrary?.isActive?.() ?? false;
  problemLibrary?.exit?.();
  window.simAPI.reset();
  showToast('Problem complete');
  problemLibrary?.open?.();
  announce(hadProblem
    ? 'Problem complete — well done. Choose your next problem to continue.'
    : 'Pick a problem to start practising.');
}

// ============================================================================
// COMPARE VIEW (ADR-012) + WORKBENCH SPLIT (ADR-021) + the 2nd-pass ortho sheet.
//
// The main pane is ALWAYS the live 3D scene; the finished 2D orthographic drawing appears
// on demand. Unlike the sibling Points topic (Canvas2D, ADR-034), the Lines 2D drawing is
// rendered by compareSheet.js in a SECOND scissored render pass on the SAME WebGLRenderer
// — one GL context. The single canvas spans the whole viewport; the 3D pass renders to
// `regions.main` and the 2D pass to `regions.sheet` (the Compare-card stage rect). In the
// expanded split the wizard collapses and the driver [data-ctrl] wrappers RE-PARENT into a
// docked rail (ADR-021 — re-parent, never mirror).
// ============================================================================

/** The workbench is a desktop affordance (ADR-021 parity); < 768px keeps the compact card. */
function isWorkbenchViewport() { return window.matchMedia('(min-width: 768px)').matches; }

function updateCompareChip() { compareChip?.setAttribute('aria-pressed', String(compareOpen)); }

/** Hide the chip until both views exist (the legacy Lines compareGate: showFV && showTV),
 *  preserving the pedagogy that the 2D drawing is meaningless before then. */
function syncCompareChipVisibility() {
  if (!compareChip) return;
  const ok = !!(currentView.showFV && currentView.showTV);
  compareChip.hidden = !ok;
  if (!ok && compareOpen) compare.hide();
}

const compare = {
  show(size) {
    if (foldTween) return; // the fold owns the camera + card
    compareOpen = true;
    if (compareCard) compareCard.hidden = false;
    applyCompareSize(size || (isWorkbenchViewport() ? COMPARE_DEFAULT_SIZE : 'compact'));
    if (compareSheet) compareSheet.setData(resolveLine(currentData), currentView);
    updateCompareChip();
    announce('Compare view opened — 2D drawing.');
  },
  hide() {
    if (!compareOpen) return;
    compareOpen = false;
    const wasSplit = workbenchOpen;
    if (wasSplit) exitWorkbench();
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Compare view closed.');
    if (wasSplit) remeasureAfterReflow(); else computeRegions();
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

/** Set the Compare footprint and mount/unmount the workbench. 'expanded' enters the split
 *  (desktop only); anything else is the compact floating card. */
function applyCompareSize(size) {
  const wantSplit = size === 'expanded' && isWorkbenchViewport();
  compareSize = wantSplit ? 'expanded' : 'compact';
  if (compareCard) compareCard.dataset.size = compareSize;
  if (wantSplit) enterWorkbench(); else exitWorkbench();
  remeasureAfterReflow(); // the grid reflow isn't laid out on frame 1 — measure after 2 frames
}

function ensureWorkbenchRail() {
  if (workbenchRail) return workbenchRail;
  workbenchRail = document.createElement('div');
  workbenchRail.id = 'workbench-rail';
  workbenchRail.setAttribute('role', 'group');
  workbenchRail.setAttribute('aria-label', 'Line parameters');
  document.body.appendChild(workbenchRail);
  return workbenchRail;
}

/** Collapse the wizard, span the canvas across both panes, and dock the drivers under
 *  both. Re-parents the existing [data-ctrl] wrappers (ADR-021 — not mirrored inputs).
 *  Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;
  if (simController.isFolded()) simController.unfold(); // the split shows unfolded 3D (ADR-013)
  const rail = ensureWorkbenchRail();
  const controls = document.getElementById('controls');
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = controls?.querySelector(`[data-ctrl="${key}"]`);
    if (wrap) { wrap.hidden = false; rail.appendChild(wrap); } // all five live at once
  }
  if (compareCard && compareCard.parentElement !== document.body) document.body.appendChild(compareCard);
  document.body.classList.add('compare-split');
}

/** Restore the floating layout: hand the drivers back to #controls (before the fold anchor),
 *  re-nest the card in #sim-viewport, and let the stepper re-own per-step disclosure. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  if (compareCard && viewport && compareCard.parentElement !== viewport) viewport.appendChild(compareCard);
  const controls = document.getElementById('controls');
  const anchor = controls?.querySelector('[data-ctrl="fold"]');
  if (workbenchRail && controls) {
    for (const key of WORKBENCH_CONTROLS) {
      const wrap = workbenchRail.querySelector(`[data-ctrl="${key}"]`);
      if (wrap) controls.insertBefore(wrap, anchor);
    }
  }
  stepper?.refresh?.(); // per-step disclosure re-owns the drivers
}

function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
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
    applyCompareSize(compareSize === 'expanded' ? 'compact' : 'expanded');
    syncExpandBtn();
  });
  // Desktop-only workbench: if the viewport narrows below the breakpoint while split, drop
  // back to the compact card so the layout never wedges.
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
    if (!e.matches && workbenchOpen) { applyCompareSize('compact'); syncExpandBtn(); }
  });
}

/** Recompute the scissor regions (device px, GL origin bottom-left) from the live layout,
 *  and sync the dependent state: the 3D camera aspect + the two passes' LineMaterial
 *  resolution (the 3D pass to `main`, the 2D sheet to its rect). */
function computeRegions() {
  const size = renderer.getDrawingBufferSize(_v2);
  const CW = size.x, CH = size.y;
  const ratio = renderer.getPixelRatio();
  let main = { x: 0, y: 0, w: CW, h: CH };
  let sheet = null;
  let cssSheet = null;
  if (compareOpen && compareCard && !compareCard.hidden) {
    const stage = compareCard.querySelector('.compare-card__stage');
    if (stage) {
      const cRect = renderer.domElement.getBoundingClientRect();
      const vpRect = viewport.getBoundingClientRect();
      const sRect = stage.getBoundingClientRect();
      const sx = Math.round((sRect.left - cRect.left) * ratio);
      const sw = Math.round(sRect.width * ratio);
      const sh = Math.round(sRect.height * ratio);
      const sTop = Math.round((sRect.top - cRect.top) * ratio);
      const sy = CH - (sTop + sh); // flip to GL origin (bottom-left)
      if (sw > 1 && sh > 1) {
        sheet = { x: sx, y: sy, w: sw, h: sh };
        // CSS-px rect (relative to #sim-viewport) for the sheet's CSS2D overlay.
        cssSheet = { left: sRect.left - vpRect.left, top: sRect.top - vpRect.top, width: sRect.width, height: sRect.height };
        if (workbenchOpen) main = { x: 0, y: 0, w: Math.max(1, sx), h: CH }; // 3D fills left of the sheet
      }
    }
  }
  // CSS-px rect for the 3D CSS2D overlay (the 3D pass region: full canvas, or the split's left pane).
  const cssMain = { left: 0, top: 0, width: main.w / ratio, height: main.h / ratio };
  regions = { main, sheet, cssMain, cssSheet };
  const aspect = main.w / Math.max(1, main.h);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  // Keep the ortho frustum at the 3D pass region's aspect (right/top ratio == aspect, which
  // fitOrthoZoom relies on); per-move zoom does the framing. Don't rebuild its matrix mid-morph
  // — applyProjectionMorph owns it until the blend clears (§5.18).
  if (orthoCamera) {
    orthoCamera.left = -ORTHO_FRUSTUM * aspect;
    orthoCamera.right = ORTHO_FRUSTUM * aspect;
    orthoCamera.top = ORTHO_FRUSTUM;
    orthoCamera.bottom = -ORTHO_FRUSTUM;
    if (projMorphK === null) orthoCamera.updateProjectionMatrix();
  }
  lineRig?.setResolution(main.w, main.h);
  if (sheet && compareSheet) compareSheet.setResolution(sheet.w, sheet.h);
}

/** Entering/leaving the split flips the body between a flex row and a CSS grid; that reflow
 *  isn't laid out on frame 1, so measure after two frames (else the canvas pins at a stale
 *  size). Mirrors the Points topic's remeasure. */
function remeasureAfterReflow() {
  requestAnimationFrame(() => requestAnimationFrame(() => handleResize(viewport)));
}

// ============================================================================
// CONSTRUCTIONS (Phase 4E) — Traces (HT/VT) + True-Length, animated on the ortho sheet.
// Each is a leaf that builds its geometry group + an animate(progress) closure; main.js mounts
// the group into compareSheet's overlay (rendered in the 2nd pass), drives the animation, and
// disposes it through compareSheet.clearConstruction() (the disposal contract). A construction is
// torn down on any parameter edit or step change — an animated derivation can't update live.
// ============================================================================

function setConBtn(id, on) {
  const b = document.getElementById(id);
  if (!b) return;
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}
function showReplay(id, on) { const b = document.getElementById(id); if (b) b.hidden = !on; }

/** A construction needs the sheet visible; force the compact floating card so the wizard (and its
 *  launcher button) stay on screen — the split collapses the wizard. */
function ensureCompareForCon() {
  if (!compareOpen) compare.show('compact');
  else if (workbenchOpen) applyCompareSize('compact');
}

/** Play the construction animation once (reduced motion snaps to the finished construction). */
function runCon(duration) {
  if (conRAF) cancelAnimationFrame(conRAF);
  conRAF = null;
  if (!conLeaf) return;
  if (prefersReducedMotion) { conLeaf.animate(1); return; }
  const start = performance.now();
  const step = (now) => {
    if (!conLeaf) return;
    const t = Math.min((now - start) / duration, 1);
    conLeaf.animate(t);
    if (t < 1) conRAF = requestAnimationFrame(step);
  };
  conRAF = requestAnimationFrame(step);
}

/** Tear the active construction down: stop the animation, dispose the overlay (disposal contract),
 *  and reset the launcher chrome. Idempotent. */
function teardownCon() {
  if (conRAF) { cancelAnimationFrame(conRAF); conRAF = null; }
  compareSheet?.clearConstruction();
  conLeaf = null;
  setConBtn('btn-traces', false); setConBtn('btn-tl', false);
  showReplay('trace-replay', false); showReplay('tl-replay', false);
  conMode = null;
}

function enterCon(mode, build, btnId, replayId) {
  teardownCon();
  ensureCompareForCon();
  conMode = mode;
  rebuild();                       // repaint the clean base sheet (Compare is now open)
  conLeaf = build(resolveLine(currentData));
  compareSheet.mountConstruction(conLeaf.group);
  setConBtn(btnId, true); showReplay(replayId, true);
  runCon(conLeaf.duration);
}
const enterTrace = () => enterCon('trace', (r) => createTraces({ resolved: r }), 'btn-traces', 'trace-replay');
const enterTL = () => enterCon('tl', (r) => createTrueLength({ resolved: r }), 'btn-tl', 'tl-replay');

/** Close the construction and return the sheet to its plain state. */
function exitCon() { teardownCon(); rebuild(); }

function setupConstructions() {
  document.getElementById('btn-traces')?.addEventListener('click', () => (conMode === 'trace' ? exitCon() : enterTrace()));
  document.getElementById('btn-tl')?.addEventListener('click', () => (conMode === 'tl' ? exitCon() : enterTL()));
  document.getElementById('trace-replay')?.addEventListener('click', () => { if (conMode === 'trace') runCon(conLeaf?.duration ?? 0); });
  document.getElementById('tl-replay')?.addEventListener('click', () => { if (conMode === 'tl') runCon(conLeaf?.duration ?? 0); });
}

// ============================================================================
// Shared platform chrome — the responsive mobile notice + the wizard-collapse chevron
// (ported verbatim from the graphics_module_1_topic_3_points reference for visual/UX parity).
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

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    // In the workbench split the wizard is collapsed BY the split; the chevron's job there is to
    // bring the steps back — i.e. shrink out of the split (ADR-037, mirroring ADR-021).
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
// Render loop + resize
// ============================================================================

function loop(now) {
  rafId = requestAnimationFrame(loop);
  const dt = lastFrameTime ? now - lastFrameTime : 16;
  lastFrameTime = now;
  tickTweens(dt);
  activeControls.update(); // damping on whichever pair (perspective / ortho) is live

  // Perspective↔ortho projection morph (§5.18): stamped AFTER the tween + controls rebuilt the
  // pure-ortho matrix, so the blended matrix is the last word before render. Null = no morph.
  if (projMorphK !== null) applyProjectionMorph();

  const size = renderer.getDrawingBufferSize(_v2);

  // One full clear to paper (covers any sub-pixel gap between the tiled regions), then the
  // two scissored passes on the ONE canvas: the 3D scene into `regions.main`, the 2D ortho
  // sheet into `regions.sheet` (autoClear is off — see buildScene).
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, size.x, size.y);
  renderer.setScissor(0, 0, size.x, size.y);
  renderer.clear();

  renderer.setScissorTest(true);
  const { main, sheet } = regions;
  renderer.setViewport(main.x, main.y, main.w, main.h);
  renderer.setScissor(main.x, main.y, main.w, main.h);
  renderer.render(scene, activeCamera); // perspective, or the ortho camera during the fold swoop

  if (sheet && compareOpen && compareSheet) {
    renderer.setViewport(sheet.x, sheet.y, sheet.w, sheet.h);
    renderer.setScissor(sheet.x, sheet.y, sheet.w, sheet.h);
    renderer.clear(true, true, true); // wipe the 3D under the sheet rect (compact overlaps it)
    compareSheet.render(renderer);
  }
  renderer.setScissorTest(false);

  // CSS2D overlays — each sized/positioned to its pass rect so labels track the scissored viewport.
  // The compact Compare card FLOATS over the full-viewport 3D pass (unlike the split, whose cssMain is
  // clipped to the left half), so the 3D-scene labels would otherwise bleed through the card over the
  // 2D sheet — a tangle of doubled A/B/θ/φ during a construction. While the compact card is up the
  // sheet is the focus and carries its own labels, so the 3D overlay is hidden (Issue 3 clutter).
  const cm = regions.cssMain;
  if (cm) {
    labelRenderer.domElement.style.left = `${cm.left}px`;
    labelRenderer.domElement.style.top = `${cm.top}px`;
    labelRenderer.setSize(cm.width, cm.height);
  }
  const hideMainLabels = compareOpen && compareSize === 'compact';
  labelRenderer.domElement.style.display = hideMainLabels ? 'none' : '';
  if (!hideMainLabels) labelRenderer.render(scene, activeCamera); // 3D scene labels

  if (compareOpen && regions.cssSheet && compareSheet) {
    const cs = regions.cssSheet;
    sheetLabelRenderer.domElement.style.display = '';
    sheetLabelRenderer.domElement.style.left = `${cs.left}px`;
    sheetLabelRenderer.domElement.style.top = `${cs.top}px`;
    sheetLabelRenderer.setSize(cs.width, cs.height);
    sheetLabelRenderer.render(compareSheet.scene, compareSheet.camera); // 2D sheet labels
  } else {
    sheetLabelRenderer.domElement.style.display = 'none';
  }
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(loop);
}

function stopLoop() {
  running = false;
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

function handleResize(container) {
  const w = container.clientWidth || 1;
  const h = container.clientHeight || 1;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  pinCanvasSize(w, h);
  labelRenderer.setSize(w, h);
  // computeRegions owns the derived state: camera aspect + BOTH passes' LineMaterial
  // resolution (the 3D pass region + the 2D sheet rect), so both stay correct on every
  // resize / split transition (ADR-006 §3.16, RULES.md §5.19).
  computeRegions();
}

// ============================================================================
// Platform contract — window.simAPI (RULES.md §2.8–§2.9). The in-sim Reset must
// route through simAPI.reset() — there is exactly one reset path (§2.9).
// ============================================================================

window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    teardownCon();                // drop any open construction first
    compare.hide();               // close Compare/split; the reset announcement lands last
    currentData = defaultLineData();
    currentView = { ...DEFAULT_VIEW };
    cancelTweens();               // drop in-flight fold + camera tweens
    foldTween = null;
    cameraTween = null;
    if (activeCamera === orthoCamera) restorePerspective(false); // instant hand-off back to perspective
    clearQuickView();
    folded = false;
    foldAngle = 0;
    camera.position.copy(CAMERA_POSITION);
    controls.target.copy(CAMERA_TARGET);
    controls.update();
    rebuild();
    onboarding?.clear();          // no stale hint chip narrates the previous run
    stepper?.reset();             // wizard back to Step 1 (re-applies Step 1's view)
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

  // The one hard-fail here is WebGL context creation. Surface the on-brand fallback.
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  try {
    // The 2D ortho-sheet leaf (its own scene + ortho camera; drawn in the 2nd render pass).
    compareSheet = createCompareSheet();

    computeRegions(); // regions.main = full canvas (no Compare yet) → feeds lineRig resolution
    rebuild();

    // Onboarding first, so the wizard's step-1 spotlight/orbit-hint calls land.
    onboarding = initOnboarding(controls);

    // The wizard. initStepper renders Step 1 and pushes its view flags back through
    // simController.applyView() → rebuild(), so the scene starts in sync.
    stepper = initStepper(simController);

    // Glossary popovers: one delegated wiring on #wizard survives every re-render.
    initTerms();

    // The parameter dock — AFTER the stepper, so its first sync() reads Step 1 state.
    ui = initUIManager(simController);
    ui.sync();

    // The Compare card chrome (chip / expand / close) — AFTER the stepper so its first
    // applyView already set the view flags the chip gate reads.
    setupMobileNotice();
    setupWizardToggle();
    setupCompareCard();
    setupConstructions();
    setupQuickViews();
    syncCompareChipVisibility();

    // The textbook Problem Library (ADR-015) — AFTER the stepper (goStep), onboarding (cueHint),
    // and the dock exist, so its facade calls all resolve. Data-driven from lineProblems.js;
    // entryStep pins a loaded problem to Step 1 (True Length) — never auto-filled (ADR-017).
    problemLibrary = initProblemLibrary(simController, {
      list: LINE_PROBLEMS,
      tiers: LINE_TIERS,
      fieldLabels: LINE_FIELD_LABELS,
      entryStep: () => 1,
    });

    // One extra rebuild once the bundled fonts land (RULES.md §3.26) — a pure repaint.
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
