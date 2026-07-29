// main.js — Orchestrator (Module 1 Topic — Projection of Straight Lines).
//
// Standalone orchestrator on Module 2's orchestrator + leaf-module pattern (ADR-007,
// ADR-033 — overturns ADR-011 for this topic). It owns — and is the ONLY owner of —
// the scene, the 3D WebGLRenderer (the 2D Compare sheet owns a second, own-canvas
// renderer — see DECISIONS.md), the camera + OrbitControls, the CSS2D overlay,
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

/** Default 3D framing (from the legacy Lines cam3): a 3/4 view pulled in closer than the old
 *  cam3 pull-back (tuned for the since-shrunk 60×60 legacy sheet, ADR-079) to frame the subject
 *  line tighter at boot; same direction/angle as before (uniform scale toward CAMERA_TARGET), just
 *  a shorter distance. Target lifted so the subject line centres. */
const CAMERA_POSITION = new THREE.Vector3(-18, 14, 18);
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
/** Clip-aware auto-zoom (ADR-014, ported from Module 2 / Module 1's engine.js). Margin the
 *  perspective fit leaves around the content box, and the one-shot dolly's duration — snappier
 *  than CAMERA_MOVE_MS so it keeps up with a continuous slider drag. */
const FRAME_PADDING = 1.1;
const AUTO_ZOOM_MS = 500;
/** Quick-view directions + screen-ups (world axes: HP = XZ y=0, VP = XY z=0, fold line = X).
 *  Each view stands the ORTHOGRAPHIC camera off along `dir` and rolls it with `up`; the ortho
 *  zoom does the framing (RULES.md §5.18). The fold swoop reuses `front`. */
const QV_DIR = {
  top:   { dir: new THREE.Vector3(0, 1, 0), up: new THREE.Vector3(0, 0, -1) }, // look down −Y at HP
  front: { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },  // look along −Z at VP
  side:  { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },  // look along −X down the fold line
};
const SHEET_HALF = 22; // reference plane is now a 44×50 RECTANGLE (SHEET × SHEET_LIFT, offset +PLANE_LIFT, span [-12,+38] on the lift axis — ADR-079 rectangle addendum); this half-extent tracks only the fold-line axis (SHEET/2, unchanged by the addendum). Verified unreferenced elsewhere in this file — kept only as a documented constant.

// ============================================================================
// Orchestrator-owned state (the ONLY owner — no engine.js)
// ============================================================================

let renderer, scene, camera, controls, viewport, labelRenderer, contentGroup;
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

/** In-flight clip-aware auto-zoom dolly (ADR-014), or null. Separate handle from cameraTween
 *  (the quick-view / fold swoop mover) so the two moves never fight over one tween slot. */
let autoZoomTween = null;

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

// --- Compare View (ADR-012) + workbench split (ADR-037) + the 2D sheet's OWN renderer
//     (own-canvas architecture, ADR-076 — supersedes the topics' original single-canvas
//     scissor design; see DECISIONS.md) ---
let compareOpen = false;
let workbenchOpen = false;
let workbenchRail = null;
let conDock = null;                          // floating construction-launcher dock (2D panel's bottom-right corner)
let compareCard = null;
let compareChip = null;
let compareSheet = null;                     // the dedicated ortho-sheet leaf (its own scene + camera)
let sheetRenderer = null;                    // the sheet's OWN WebGLRenderer, lazily created on first Compare open
let sheetLabelRenderer = null;               // the sheet's OWN CSS2D overlay — a DOM sibling of its canvas
let compareStage = null;                     // .compare-card__stage — the sheet canvas's parent element
let sheetResizeObserver = null;              // keeps the sheet canvas sized to its stage across every layout change
let comparePanWired = false;                 // setupComparePan() guard — wire the stage listeners once
const WORKBENCH_CONTROLS = ['tl', 'disthp', 'distvp', 'theta', 'phi', 'truelength', 'traces'];
// Rail clustering (topic-local visual grouping, not a platform convention): breaks the flat
// 5-wide instrument row into two titled .dock__group clusters so the rail scans instead of
// reading as one undifferentiated wall. Mirrors the lesson's own step structure (ADR-017) —
// dimensions (Steps 1-2) / inclination (Step 3).
const WORKBENCH_GROUPS = [
  { id: 'dimensions',  title: 'Dimensions',  keys: ['tl', 'disthp', 'distvp'] },
  { id: 'inclination', title: 'Inclination', keys: ['theta', 'phi'] },
];
// The construction launchers dock separately, at the 2D drawing panel's bottom-right corner
// (#con-dock), not inside a rail cluster — see ensureConDock()/enterWorkbench() below.
const CON_DOCK_CONTROLS = ['truelength', 'traces'];

// --- Constructions (Phase 4E): the Traces (HT/VT) + True-Length overlays on the ortho sheet ---
let conMode = null;   // null | 'trace' | 'tl'
let conLeaf = null;   // the active construction leaf { group, animate, duration }, or null
let conRAF = null;    // the construction animation rAF handle

// --- Problem Library (ADR-015) — the textbook exercise selector; never auto-fills ---
let problemLibrary = null;
/** State-change subscribers fired at the end of every rebuild() (the ONE seam every parameter /
 *  step / reset change passes through). The self-check subscribes here via onStateChange. */
const stateChangeSubs = new Set();

const _v2 = new THREE.Vector2();  // scratch for device-px size queries — the 3D renderer
const _sv2 = new THREE.Vector2(); // scratch for device-px size queries — the sheet renderer

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
// Scene bootstrap — the 3D WebGLRenderer + its WebGL context. (The 2D Compare sheet's
// OWN renderer/context is created lazily on first Compare open — see ensureSheetRenderer.)
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
  renderer.setClearColor(cssColor('--color-paper'), 1); // autoClear stays default (true) — one scene per renderer now
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
  // sync by syncMainSizing) and per-move zoom does the framing. Its controls stay disabled
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
  // tail. The FOLD tween is left alone (orbiting during the rabatment is fine). Also cancels
  // any in-flight auto-zoom dolly (ADR-014) — a manual grab is the last word.
  controls.addEventListener('start', () => {
    cameraTween?.cancel(); cameraTween = null;
    autoZoomTween?.cancel(); autoZoomTween = null;
  });

  // An attempted ORBIT on the rotate-locked ortho camera (a lit quick-view) fires no
  // OrbitControls event — catch the pointerdown and nudge the lit chip so the learner reads
  // "disengage this view to orbit" (parity with the Points reference's cueOrthoLock).
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activeCamera !== orthoCamera) return;
    cueOrthoLock();
  });

  contentGroup = new THREE.Group();
  scene.add(contentGroup);

  // CSS2D overlay (RULES.md §3.27) for the 3D scene's labels. The 2D ortho sheet gets its
  // OWN CSS2D overlay (sheetLabelRenderer), created lazily inside the Compare card's stage —
  // see ensureSheetRenderer().
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

  // Fat-line resolution is the 3D renderer's own DEVICE-px canvas size — its own full
  // canvas now (own-canvas architecture: no more shared scissored sub-region).
  const size3d = renderer.getDrawingBufferSize(_v2);
  lineRig = createLineRig({ resolved, view: currentView, foldAngle, width: size3d.x, height: size3d.y });
  contentGroup.add(lineRig.group);

  // The Compare sheet is a LIVE drawing rebuilt on every commit, never a snapshot (ADR-012
  // §5.14). Only repaint when open — a closed card costs nothing.
  if (compareOpen && compareSheet) compareSheet.setData(resolved, currentView);

  // The ONE seam the Problem Library self-check subscribes to (every parameter / step / reset
  // change passes through here). Empty subscriber set before the library wires up → a no-op.
  notifyStateChange();

  reframeIfClipped(); // clip-aware auto-zoom (ADR-014): dolly back if the line outgrew the frame
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
  const aspect = orthoCamera.right / orthoCamera.top; // == viewport aspect (kept so by syncMainSizing)
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

/** Required PERSPECTIVE camera-to-pivot distance to frame `box` with `padding` margin, looking
 *  along `dir` (unit, pivot→camera) with screen-up `up`. Accurate PROJECTED-BOX fit: each of the
 *  8 corners is resolved onto the camera's right/up axes (perpendicular screen extents) and its
 *  depth toward the camera, and the binding corner sets the distance — unlike a bounding-sphere
 *  fit (its radius is the box half-diagonal, far larger than the on-screen silhouette), this does
 *  not over-frame. Verbatim Module 2 / Module 1 engine.js port (ADR-014) — only `camera` is
 *  renamed from `S3.cam`/the Module 2 module-level `camera`. */
function fitPerspectiveDistance(box, pivot, dir, up, padding = FRAME_PADDING) {
  const forward = dir.clone().negate();
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
    const a = v.dot(dir);
    const px = Math.abs(v.dot(right));
    const py = Math.abs(v.dot(camUp));
    D = Math.max(D, a + (px * padding) / tanH, a + (py * padding) / tanV);
  }
  return D;
}

/** Clip-aware auto-zoom (ADR-014, ported from Module 2's `reframeIfClipped` / Module 1's
 *  engine.js). Called at the end of rebuild() — the one seam every parameter/step change passes
 *  through — so it NEVER runs per-frame and never fights a manual orbit: between edits
 *  OrbitControls owns the camera completely. Push-back ONLY: if the current line already fits
 *  the free-orbit perspective view, this returns and touches NOTHING (not even the orbit
 *  target) — so today's fixed default framing is preserved exactly and a learner's manual
 *  zoom-in survives an edit. If the line has grown past the frame, it eases the camera BACK
 *  along its current view direction (and re-centres the orbit target onto the content box's
 *  centre, so growth stays framed instead of lurching as the box translates off a fixed pivot —
 *  see the DETECT-vs-MOVE pivot split below) over one 500 ms tween, restarted from the camera's
 *  live pose on every call so a continuous slider drag chases smoothly with no end-of-drag jump. */
function reframeIfClipped() {
  // Only the free-orbit perspective view auto-frames: a fold swoop, an in-flight quick-view
  // camera move, or the folded flat sheet owns the camera instead (RULES.md §5.10).
  if (activeCamera !== camera || folded || foldTween || cameraTween) return;

  const box = contentBoxWorld();
  const target = controls.target;
  const dir = camera.position.clone().sub(target);
  if (dir.lengthSq() < 1e-6) return;
  dir.normalize();

  // DETECT pivoting on the LIVE (unmoved) target: "is anything clipped from where the camera
  // actually is right now?" This keeps the default pose's steady state exact — at any value that
  // already fits, dCur >= dClip and the function returns having touched nothing.
  const dClip = fitPerspectiveDistance(box, target, dir, camera.up);
  const dCur = camera.position.distanceTo(target);
  if (dCur >= dClip) return;

  // MOVE pivoting on the box CENTRE (engine.js): once something genuinely clips, centring the
  // subject on the optical axis makes the required distance grow linearly with the subject
  // instead of lurching as it translates away from the fixed target. Push-back only on distance
  // — never dolly closer than the learner's current zoom.
  const center = box.getCenter(new THREE.Vector3());
  const dFit = fitPerspectiveDistance(box, center, dir, camera.up);
  const toDist = Math.max(dCur, dFit);
  const fromPos = camera.position.clone();
  const fromTgt = target.clone();
  const toPos = center.clone().addScaledVector(dir, toDist);

  autoZoomTween?.cancel(); // retarget from the LIVE pose — smooth chase on a continuous drag
  autoZoomTween = tween({
    from: 0, to: 1, duration: AUTO_ZOOM_MS, ease: easeStandard,
    onUpdate: (t) => {
      controls.target.lerpVectors(fromTgt, center, t);
      camera.position.lerpVectors(fromPos, toPos, t);
    },
    onComplete: () => { autoZoomTween = null; },
  });
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
  autoZoomTween?.cancel(); autoZoomTween = null; // a quick-view takes the camera — auto-zoom yields
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
  autoZoomTween?.cancel();
  autoZoomTween = null;
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
  // A forward fold closes Compare so the split can't fight the fold — Compare's fold control
  // lives in the collapsed wizard, unreachable while the split is open (ADR-080: Compare is
  // always the split now, so this used to also guard against a since-removed floating state).
  if (toAngle === FOLD_ANGLE && compareOpen) compare.hide();
  clearQuickView(); // the fold takes the camera → no quick-view chip stays lit
  cameraTween?.cancel();
  cameraTween = null;
  autoZoomTween?.cancel(); // the fold takes the camera → auto-zoom yields (RULES.md §5.10)
  autoZoomTween = null;
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
  markComplete,
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
// COMPARE VIEW (ADR-012) + WORKBENCH SPLIT (ADR-037, the Module 2 floating-card pattern) +
// the 2D sheet's OWN renderer.
//
// The main pane is ALWAYS the live 3D scene; the finished 2D orthographic drawing appears
// on demand. The 2D drawing (compareSheet.js) now renders on its OWN WebGLRenderer/canvas
// — a genuinely separate surface, matching the Points/Module 2 card exactly (own-canvas
// architecture, ADR-076 — supersedes the topics' original single-canvas scissor design;
// see DECISIONS.md). In the expanded split the wizard collapses and the driver +
// construction-launcher [data-ctrl] wrappers RE-PARENT into a docked rail (re-parent,
// never mirror), which can be hidden/shown independently via the #rail-toggle pill
// (ADR-037 amendment).
// ============================================================================

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
  show() {
    if (foldTween) return; // the fold owns the camera + card
    compareOpen = true;
    if (compareCard) compareCard.hidden = false;
    ensureSheetRenderer(); // lazy: only pay for the 2nd WebGL context once Compare is actually used
    compareSheet?.resetView(); // every fresh open starts centred and unzoomed (ADR-055 reset contract)
    enterWorkbench(); // Compare has exactly one shape (ADR-080) — always the docked split
    remeasureAfterReflow(); // the grid reflow isn't laid out on frame 1 — measure after 2 frames
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
    if (wasSplit) remeasureAfterReflow();
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

function ensureWorkbenchRail() {
  if (workbenchRail) return workbenchRail;
  workbenchRail = document.createElement('div');
  workbenchRail.id = 'workbench-rail';
  workbenchRail.setAttribute('role', 'group');
  workbenchRail.setAttribute('aria-label', 'Line parameters');
  // Build the two titled clusters once (WORKBENCH_GROUPS); enterWorkbench() re-parents the
  // existing [data-ctrl] wrappers into each cluster's body on every split entry. The platform's
  // own .dock__group / .dock__group-title convention (DESIGN.md — see topics 2/4/5, Module 2,
  // Sections of Solids), reused here rather than invented fresh.
  for (const grp of WORKBENCH_GROUPS) {
    const wrap = document.createElement('div');
    wrap.className = 'dock__group rail__group';
    wrap.dataset.group = grp.id;
    wrap.setAttribute('role', 'group');
    const titleId = `rail-group-${grp.id}-title`;
    wrap.setAttribute('aria-labelledby', titleId);
    const title = document.createElement('h3');
    title.className = 'dock__group-title';
    title.id = titleId;
    title.textContent = grp.title;
    const body = document.createElement('div');
    body.className = 'rail__group-body';
    wrap.append(title, body);
    workbenchRail.appendChild(wrap);
  }
  document.body.appendChild(workbenchRail);
  return workbenchRail;
}

/** The construction-launcher dock: a direct <body> child, built once, that floats at the 2D
 *  drawing panel's bottom-right corner during the split (mirrors #rail-toggle's floating-corner
 *  convention on the opposite pane — see index.html .con-dock). enterWorkbench()/exitWorkbench()
 *  re-parent the existing truelength/traces [data-ctrl] wrappers into and out of it. */
function ensureConDock() {
  if (conDock) return conDock;
  conDock = document.createElement('div');
  conDock.id = 'con-dock';
  conDock.className = 'con-dock';
  conDock.setAttribute('role', 'group');
  conDock.setAttribute('aria-label', 'Constructions');
  document.body.appendChild(conDock);
  return conDock;
}

/** Collapse the wizard, span the canvas across both panes, and dock the drivers under
 *  both. Re-parents the existing [data-ctrl] wrappers (ADR-021 — not mirrored inputs).
 *  Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;
  if (simController.isFolded()) simController.unfold(); // the split shows unfolded 3D (ADR-013)
  const rail = ensureWorkbenchRail();
  const dock = ensureConDock();
  const controls = document.getElementById('controls');
  for (const grp of WORKBENCH_GROUPS) {
    const body = rail.querySelector(`[data-group="${grp.id}"] .rail__group-body`);
    for (const key of grp.keys) {
      const wrap = controls?.querySelector(`[data-ctrl="${key}"]`);
      if (wrap && body) { wrap.hidden = false; body.appendChild(wrap); } // all five drivers live at once, clustered
    }
  }
  // The construction launchers dock separately, floating at the 2D panel's bottom-right
  // corner (#con-dock) rather than joining a rail cluster.
  for (const key of CON_DOCK_CONTROLS) {
    const wrap = controls?.querySelector(`[data-ctrl="${key}"]`);
    if (wrap) { wrap.hidden = false; dock.appendChild(wrap); }
  }
  if (compareCard && compareCard.parentElement !== document.body) document.body.appendChild(compareCard);
  document.body.classList.add('compare-split');
  // The rail toggle always defaults to shown on entry — a prior collapse from an earlier
  // split visit must not carry over, and the button's own facets need the same reset.
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
}

/** Restore the floating layout: hand the drivers + construction launchers back to #controls
 *  (before the fold anchor), re-nest the card in #sim-viewport, and let the stepper re-own
 *  per-step disclosure. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
  if (compareCard && viewport && compareCard.parentElement !== viewport) viewport.appendChild(compareCard);
  const controls = document.getElementById('controls');
  const anchor = controls?.querySelector('[data-ctrl="fold"]');
  if (controls) {
    for (const key of WORKBENCH_CONTROLS) {
      const wrap = workbenchRail?.querySelector(`[data-ctrl="${key}"]`) || conDock?.querySelector(`[data-ctrl="${key}"]`);
      if (wrap) controls.insertBefore(wrap, anchor);
    }
  }
  stepper?.refresh?.(); // per-step disclosure re-owns the drivers
}

/** One-source-of-truth sync for the #rail-toggle button's 4 state facets (aria-expanded,
 *  aria-label, title, the visible .rail-toggle__text span). Called from the click handler
 *  below AND from enterWorkbench()/exitWorkbench(), which force-reset this on every split
 *  transition — without those second call sites the button could read stale "Show"/"Hide"
 *  text. Ported verbatim from Module 2. */
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

function setupCompareCard() {
  compareCard = document.getElementById('compare-card');
  compareChip = document.getElementById('compare-chip');
  // The chip is Compare's only open/close control (ADR-080) — there is no separate
  // expand/close head chrome and no breakpoint fallback to a floating card.
  compareChip?.addEventListener('click', () => compare.toggle());
}

/** Sync the 3D renderer's dependent state (camera aspect, ortho frustum, fat-line
 *  resolution) to its OWN full canvas size — own-canvas architecture: the 3D renderer
 *  no longer shares a canvas with the 2D sheet, so there is no region math here. */
function syncMainSizing() {
  const size = renderer.getDrawingBufferSize(_v2);
  const aspect = size.x / Math.max(1, size.y);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  // Don't rebuild the ortho matrix mid-morph — applyProjectionMorph owns it until the
  // blend clears (§5.18).
  if (orthoCamera) {
    orthoCamera.left = -ORTHO_FRUSTUM * aspect;
    orthoCamera.right = ORTHO_FRUSTUM * aspect;
    orthoCamera.top = ORTHO_FRUSTUM;
    orthoCamera.bottom = -ORTHO_FRUSTUM;
    if (projMorphK === null) orthoCamera.updateProjectionMatrix();
  }
  lineRig?.setResolution(size.x, size.y);
}

/** Create the 2D sheet's OWN <canvas> + WebGLRenderer + CSS2D label overlay inside the
 *  Compare card's stage, lazily on first Compare open (own-canvas architecture, ADR-076
 *  — supersedes the topics' original shared-canvas scissor design; see DECISIONS.md). A
 *  ResizeObserver
 *  on the stage keeps the sheet's renderer + fat-line resolution + ortho-camera aspect in
 *  sync across every layout change (split enter/exit, rail toggle, compact↔expanded,
 *  window resize) — no manual resize call sites needed elsewhere. Idempotent. */
function ensureSheetRenderer() {
  if (sheetRenderer) return sheetRenderer;
  const stage = compareCard?.querySelector('.compare-card__stage');
  if (!stage) return null;
  compareStage = stage;

  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  sheetRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  sheetRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  sheetLabelRenderer = new CSS2DRenderer();
  sheetLabelRenderer.domElement.classList.add('sheet-label-overlay');
  stage.appendChild(sheetLabelRenderer.domElement);

  sheetResizeObserver = new ResizeObserver(() => resizeSheetRenderer());
  sheetResizeObserver.observe(stage);
  resizeSheetRenderer();
  setupComparePan();
  return sheetRenderer;
}

/** Drag-to-pan + scroll-wheel zoom on the 2D Compare sheet (ADR-077 — re-expresses Module
 *  2/Points' ADR-054/055 interaction against this sheet's live ortho camera instead of a
 *  Canvas2D project() lens; see compareSheet.js resetView/panByPixels/zoomAtPixel). Bound to
 *  `compareStage` — the canvas's PARENT — rather than the canvas itself, because the sheet's
 *  CSS2D label overlay (`sheetLabelRenderer.domElement`) is a DOM sibling layered on top of the
 *  canvas (see ensureSheetRenderer): listening on the canvas alone would miss drags/wheel that
 *  land on a label. The rAF render loop repaints the sheet every frame while Compare is open, so
 *  no manual redraw/coalescing is needed here (unlike Points' Canvas2D queueRedraw()) — mutating
 *  the camera is enough. */
function setupComparePan() {
  if (comparePanWired || !compareStage) return;
  comparePanWired = true;
  const stage = compareStage;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  stage.style.touchAction = 'none'; // let pointer events own drag/pinch instead of the browser
  stage.style.cursor = 'grab';
  stage.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.setPointerCapture(e.pointerId);
    stage.style.cursor = 'grabbing';
  });
  stage.addEventListener('pointermove', (e) => {
    if (!dragging || !compareSheet) return;
    const rect = stage.getBoundingClientRect();
    compareSheet.panByPixels(e.clientX - lastX, e.clientY - lastY, rect.width, rect.height);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    stage.style.cursor = 'grab';
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointerleave', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('dblclick', () => compareSheet?.resetView());

  // Non-passive + preventDefault so the page never scrolls while the cursor is over the sheet.
  stage.addEventListener('wheel', (e) => {
    if (!compareSheet) return;
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    compareSheet.zoomAtPixel(e.clientX - rect.left, e.clientY - rect.top, e.deltaY, rect.width, rect.height);
  }, { passive: false });
}

/** Resize the sheet's canvas + CSS2D overlay to its stage, and keep compareSheet's
 *  fat-line resolution + ortho-camera aspect in sync (device px, matching the 3D
 *  renderer's own convention). */
function resizeSheetRenderer() {
  if (!sheetRenderer || !compareStage) return;
  const w = compareStage.clientWidth || 1;
  const h = compareStage.clientHeight || 1;
  sheetRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  sheetRenderer.setSize(w, h, false);
  sheetLabelRenderer?.setSize(w, h);
  const size = sheetRenderer.getDrawingBufferSize(_sv2);
  compareSheet?.setResolution(size.x, size.y);
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

/** Each launcher's own label swaps to its "Replay …" text once triggered, and back to its
 *  base text on teardown — there is no separate Replay button (ported from the old
 *  tl-replay/trace-replay pair). Labels live in the .btn__label span so the icon span is
 *  untouched. */
const CON_LABELS = {
  'btn-tl': { base: 'True Length & Angles', replay: 'Replay True Length & Angles' },
  'btn-traces': { base: 'Show Traces (HT & VT)', replay: 'Replay Show Traces' },
};
function setConLabel(id, on) {
  const b = document.getElementById(id);
  const label = b?.querySelector('.btn__label');
  const text = CON_LABELS[id];
  if (label && text) label.textContent = on ? text.replay : text.base;
}

/** A construction needs the sheet visible. The launcher lives inside a
 *  [data-ctrl="truelength"/"traces"] wrapper, which is now part of WORKBENCH_CONTROLS —
 *  it re-parents into #con-dock (the 2D panel's bottom-right corner) on split entry, so the
 *  expanded 50/50 split stays fully usable during a construction (no more forced demotion to
 *  the compact card). */
function ensureCompareForCon() {
  if (!compareOpen) compare.show();
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
  setConLabel('btn-traces', false); setConLabel('btn-tl', false);
  conMode = null;
}

function enterCon(mode, build, btnId) {
  teardownCon();
  ensureCompareForCon();
  conMode = mode;
  rebuild();                       // repaint the clean base sheet (Compare is now open)
  conLeaf = build(resolveLine(currentData));
  compareSheet.mountConstruction(conLeaf.group);
  setConBtn(btnId, true); setConLabel(btnId, true);
  runCon(conLeaf.duration);
}
const enterTrace = () => enterCon('trace', (r) => createTraces({ resolved: r }), 'btn-traces');
const enterTL = () => enterCon('tl', (r) => createTrueLength({ resolved: r }), 'btn-tl');

/** Each launcher does double duty: first click builds + plays the construction; a click
 *  while it's already active replays the same animation from t=0 (the old separate
 *  Replay button's behaviour, now folded into the launcher itself — a repeat click no
 *  longer closes the construction). It still tears down via the other existing
 *  teardownCon() paths (switching to the other construction, a parameter edit, a step
 *  change, the fold) — there is no longer a click-to-close affordance on the button. */
function setupConstructions() {
  document.getElementById('btn-traces')?.addEventListener('click', () => (conMode === 'trace' ? runCon(conLeaf?.duration ?? 0) : enterTrace()));
  document.getElementById('btn-tl')?.addEventListener('click', () => (conMode === 'tl' ? runCon(conLeaf?.duration ?? 0) : enterTL()));
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
    // In the workbench split the wizard is collapsed BY the split; the chevron's job there is
    // to bring the steps back — i.e. close Compare entirely, since the split is Compare's only
    // shape now (ADR-080, mirroring ADR-037/ADR-021's original "shrink out of the split").
    if (workbenchOpen) {
      compare.hide();
      btn.setAttribute('aria-expanded', 'true');
      btn.title = 'Hide steps panel';
      announce('Compare closed — steps panel shown.');
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

  // Camera-aware BIS dimensions (ADR-081): re-roll every 3D dimension to face WHICHEVER camera is
  // live this frame — free-orbit perspective, or an engaged ortho quick-view/fold — right before
  // it is drawn, mirroring the morph stamp above (last transform before render wins).
  lineRig?.orientDimensions(activeCamera);

  // Own-canvas architecture (ADR-076): the 3D renderer draws its own full
  // canvas, no scissoring, no region math — autoClear (default true) handles the paper
  // clear on every render() call.
  renderer.render(scene, activeCamera); // perspective, or the ortho camera during the fold swoop

  // Compare is always the docked split now (ADR-080) — its pane never overlaps the 3D
  // viewport, so the 3D scene's CSS2D labels no longer need hiding while Compare is open.
  labelRenderer.render(scene, activeCamera); // 3D scene labels

  // The 2D sheet renders on its OWN renderer into its OWN canvas — only while Compare is
  // open (a closed card costs nothing beyond the idle GL context).
  if (compareOpen && compareSheet && sheetRenderer) {
    compareSheet.render(sheetRenderer);
    sheetLabelRenderer?.render(compareSheet.scene, compareSheet.camera); // 2D sheet labels
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
  // syncMainSizing owns the derived state: camera aspect + fat-line resolution, both from
  // the 3D renderer's own full canvas (own-canvas architecture, ADR-006 §3.16, RULES.md
  // §5.19). The 2D sheet's own canvas is resized independently by its own ResizeObserver
  // on the Compare card's stage (resizeSheetRenderer) — no call needed here.
  syncMainSizing();
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
    autoZoomTween = null;
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
    // The 2D ortho-sheet leaf (its own scene + ortho camera). Its OWN renderer/canvas is
    // created lazily on first Compare open (ensureSheetRenderer) — no 2nd GL context is
    // paid for unless Compare is actually used.
    compareSheet = createCompareSheet();

    syncMainSizing(); // the 3D renderer's own full canvas → feeds lineRig resolution
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
    setupRailToggle();
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
