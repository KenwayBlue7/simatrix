// Orchestrator (Module 1 Topic 1 — Engineering Graphics Foundations).
//
// Mirrors Module 2's main.js orchestrator pattern (ADR-007), adapted to a single,
// static, orbitable subject — the Bearing Block — instead of a parametric solid:
//
//   • Bootstraps the Three.js environment (perspective scene, flat CAD lighting,
//     renderer, OrbitControls, CSS2D overlay).
//   • Owns the SINGLE rebuild() pipeline — the only path geometry ever changes
//     through — with the full WebGL + CSS2D disposal contract (RULES.md §3.1–§3.5).
//   • Re-runs the camera-dependent visible/hidden line classification on orbit,
//     throttled to requestAnimationFrame and gated on real camera movement, never to
//     mousemove (RULES.md §3.19) — the headline behaviour this topic keeps.
//   • Exposes window.simAPI { pause, resume, reset } for the platform (RULES.md §2.8).
//
// Layering rule (ADR-007 / RULES.md §3.6): main.js is the orchestrator and the ONLY
// place the leaf modules meet. The leaves (bearingBlock, meshAnalyzer, lineDrawer,
// annotations, labelLayer, stepper) never import one another — everything hangs off
// this star.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

import { createBearingBlock, BEARING_BLOCK_DIMS } from './bearingBlock.js';
import { buildEdgeMap } from './meshAnalyzer.js';
import { createLineDrawer } from './lineDrawer.js';
import { createAnnotations } from './annotations.js';
import { createLabelLayer } from './labelLayer.js';
import { initStepper } from './stepper.js';
import { initTerms } from './terms.js';
import { TERMS } from './foundationSteps.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeCamera, easeStandard } from './anim.js';

const DEG2RAD = Math.PI / 180;

// ============================================================================
// BVH raycast acceleration (three-mesh-bvh) — global, one-time prototype patch.
//
// The hidden-line test in lineDrawer.js fires hundreds of short line-of-sight rays
// at the bearing block on every moved frame of an orbit. The native THREE.Raycaster
// brute-forces EVERY triangle per ray (O(rays × triangles)); on the cleaned ~800-
// triangle block that hit a ~1.2 s wall per pass. three-mesh-bvh swaps in an
// accelerated raycast that walks a precomputed Bounding Volume Hierarchy instead,
// turning per-ray cost from linear to ~logarithmic in the triangle count — fast
// enough (~19 ms/pass) to run the classification LIVE every frame during the drag.
//
// We install it the canonical way: add the BVH build/dispose helpers to
// BufferGeometry's prototype and replace Mesh's raycast with the accelerated one.
// acceleratedRaycast safely FALLS BACK to the stock raycast for any mesh whose
// geometry has no boundsTree, so this global patch never breaks other meshes — only
// the block (which we equip with a tree in rebuild()) actually uses the fast path.
// LineSegments2 keeps its own raycast override, so the linework is unaffected.
// ============================================================================
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded
// (RULES.md §4.1; the root DESIGN.md token table is the single runtime source).
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

/** The block's centred world dimension table (single source for every layer). */
const dims = BEARING_BLOCK_DIMS;

/** Small safety margin on top of the fitted drawing envelope (see frontViewPose). */
const FRAME_PADDING = 1.08;

/** How far the authored annotations reach beyond the block (world units): a Type B
 *  dimension line + its arrowheads + the value pill. Used so the Front View frames the
 *  whole DRAWING (block + dimensions), not just the solid — otherwise the L dimension
 *  below and the H dimension to the right get clipped at Step 4. */
const ANNOTATION_REACH = 1.4;

/** "Front View" quick-view glide + projection-morph duration (ms). Snaps instantly
 *  under reduced motion (anim.js jumps the tween straight to its end value). */
const QUICK_VIEW_MS = 700;

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;          // PerspectiveCamera — the default free-orbit pictorial view
let controls;        // OrbitControls bound to `camera`
let orthoCamera;     // OrthographicCamera — the square-on "Front View" elevation
let orthoControls;   // OrbitControls bound to `orthoCamera` (pan + zoom only, no rotate)
let activeCamera;    // whichever of camera / orthoCamera is currently live
let activeControls;  // the OrbitControls paired with activeCamera
let labelRenderer;
let viewport;

/** Holds the block mesh + its linework + its annotations. The disposal contract
 *  clears this group every rebuild; the labelLayer owns its own CSS2D group. */
let contentGroup;

let blockMesh = null;
let lineDrawer = null;   // createLineDrawer(...) — Type A/E-F, re-classified on orbit
let annotations = null;  // createAnnotations(...) — Type G centre lines + Type B dims
let labelLayer = null;   // createLabelLayer(...) — CSS2D callouts + dimension values
let stepper = null;

/** Cumulative layer reveal state. Type A (visible) is always on from Step 1; the centre
 *  lines (Step 3) and dimensions (Step 4) switch on and stay on. */
const layers = { centre: false, dimensions: false };

/** Dimensioning system for the Type B value pills (Step 4 toggle): 'aligned' (BIS default —
 *  the height value reads up the right edge) or 'uni' (every value horizontal). Owned here
 *  so it survives a rebuild; the stepper toggle calls simController.setDimMode. */
let dimMode = 'aligned';

let rafId = null;
let running = false;

/** Delta-time clock for the render loop (drives anim.js tickTweens). */
let lastFrameTime = 0;

/** Force a one-off reclassify next frame even if the camera did not move — set after
 *  a rebuild / reset / front-view snap so the linework reflects the fresh state. */
let forceReclassify = false;

/** In-flight camera tween (anim.js handle) — Front-View glide OR micro-zoom dolly, or null. */
let cameraTween = null;

/** True while exitFrontViewSmooth's ortho→perspective morph is in flight, so an interaction
 *  handler (drag / scroll / pan) never stacks a second exit on top of the running one. */
let exitingFrontView = false;

/** Micro-zoom home pose (the frame to pull back to), or null when not zoomed on an arrowhead. */
let savedView = null;

/** Keyboard orbit-pose azimuth in degrees about the vertical axis (0 = Front View). Advanced in
 *  90° steps by the "Turn 90°" chrome button so keyboard users can watch visible edges become
 *  hidden without a mouse drag; reset to 0 on simAPI.reset(). */
let poseAzimuthDeg = 0;

/**
 * Ortho↔perspective projection morph factor in [0,1], or null when no morph is live.
 * Ported from Module 2: at k=1 the ortho camera's projection matrix is blended fully to
 * the PERSPECTIVE matrix (looks perspective); at k=0 it is pure ortho. Driving k across
 * the Front-View glide removes the projection-type "pop" the old hard-swap produced.
 */
let projectionMorphK = null;

/** "X-ray" (Step 2) — when true the block's MATERIAL is hidden so the full solid
 *  wireframe behind it shows through. The mesh stays in the scene; only its faces stop
 *  drawing, so the GPU depth buffer no longer occludes the rear edges. */
let xray = false;

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

/** ms the success toast stays up before fading. */
const TOAST_HOLD = 3500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Show a brief, calm success toast over the viewport — the "Complete lesson" win (Module 2
 * pattern). Token-driven success styling + a check glyph (Two-Cue Rule), never gamified
 * fanfare. setTimeout-driven (not the rAF loop) so it fades independently of pause/resume.
 * aria-hidden: #sim-status already narrates the win, so this is not a second live region.
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

/** Show/hide the transient WebGL context-loss recovery chip + narrate it. */
function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
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
  // Platform iframe contract (ADR-078): announce a displayable sim to the host loader.
  // Gated on document.fonts.ready so the host never reveals us mid-FOUT.
  document.fonts.ready.then(() => {
    window.parent.postMessage({ type: 'sim:ready' }, '*');
  });
}

/**
 * Signal lesson completion to the host (ADR-078 addendum, revised 2026-07-31): fired by the
 * "Finish lesson" button. Latchless — every click reposts, no per-page-load ceiling, since the
 * host is confirmed to support repeated triggers.
 */
function markComplete() {
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;

  // Perspective only — this is a single pictorial view, not folded ortho planes.
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.set(0, dims.axisY, 12); // provisional; frameToBlock() fits it at boot

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows (RULES.md §3.24)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (RULES.md flags context exhaustion as the likeliest
  // late bug). preventDefault opts in to a restorable context; on restore we re-upload
  // by rebuilding (recreates the GL resources) and resume the loop.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild();          // re-create geometry, lines, labels (camera pose preserved)
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Flat CAD light: ambient fill + one low directional, no shadows (RULES.md §3.24).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  // Orbit controls. The camera orbits; the part stays static (so the once-built edge
  // map stays valid). Re-classify runs on the 'change'-equivalent in the rAF loop.
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, dims.axisY, 0); // pivot on the bore axis (the lesson's focus)
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();

  // Orthographic camera for the square-on "Front View" elevation (Module 2 dual-camera
  // pattern). Parallel projection makes the bore read as a TRUE circle with no perspective
  // convergence. It shares the canvas with a second OrbitControls, disabled until the ortho
  // view is active so only one set of controls consumes pointer events at a time. ROTATE is
  // locked on the ortho pair — a dragged parallel view shears into a confusing flat read; a
  // left-drag instead hands back to the perspective free-orbit pair (see onViewportPointerDown).
  const aspect0 = (w || 1) / (h || 1);
  const f0 = orthoFrustum(aspect0);
  orthoCamera = new THREE.OrthographicCamera(-f0.halfW, f0.halfW, f0.halfH, -f0.halfH, 0.1, 100);
  orthoCamera.position.set(0, dims.axisY, 12);

  orthoControls = new OrbitControls(orthoCamera, renderer.domElement);
  orthoControls.target.set(0, dims.axisY, 0);
  orthoControls.enableDamping = !prefersReducedMotion;
  orthoControls.dampingFactor = 0.08;
  orthoControls.enableRotate = false; // pan + zoom only; left-drag exits to perspective
  orthoControls.enabled = false;      // perspective is the default active pair
  orthoControls.update();

  // Scroll-to-zoom or a pan gesture on the live ortho elevation is an intent to explore in 3D,
  // so it hands SMOOTHLY back to free-orbit perspective (see exitFrontViewSmooth) instead of
  // zooming/panning the flat parallel view. OrbitControls fires 'start' when a zoom or pan
  // begins — but NOT for a left-drag, since ROTATE is locked on this pair, so the primary
  // orbit gesture is caught separately by the capture-phase onViewportPointerDown below.
  orthoControls.addEventListener('start', onOrthoInteractionStart);

  // Start in free-orbit perspective.
  activeCamera = camera;
  activeControls = controls;

  // Hand back to the perspective free-orbit camera the instant the learner left-drags while
  // the ortho elevation is live. CAPTURE phase on the container (an ANCESTOR of the canvas)
  // so this runs BEFORE OrbitControls' own pointerdown handler on the canvas — we enable the
  // perspective pair first, then let the SAME pointerdown reach OrbitControls and start the
  // orbit in one seamless gesture. We never preventDefault.
  container.addEventListener('pointerdown', onViewportPointerDown, true);

  contentGroup = new THREE.Group();
  scene.add(contentGroup);

  // CSS2D overlay for the line-type callouts + dimension values. Transparent DOM
  // layer sized to the canvas; pointer-events off so drag-to-orbit passes through.
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
// dispose → build block → analyse edges once → init line drawer → annotations +
// labels → apply revealed layers → initial reclassify.
// ============================================================================

/** Full disposal contract: free every per-build WebGL resource + CSS2D DOM node,
 *  then empty the content group (RULES.md §3.3, §3.5). */
function disposeContent() {
  if (lineDrawer) { lineDrawer.dispose(); lineDrawer = null; }
  if (annotations) { annotations.dispose(); annotations = null; }
  if (labelLayer) { labelLayer.dispose(); labelLayer = null; }
  if (blockMesh) {
    // Free the BVH BEFORE the geometry (ADR-004): computeBoundsTree() allocated large
    // CPU-side typed arrays and parked them on geometry.boundsTree. Dropping the geometry
    // alone would orphan that tree until GC; disposeBoundsTree() releases it deterministically
    // so renderer.info + heap stay flat across the 50-rebuild leak check.
    blockMesh.geometry?.disposeBoundsTree?.();
    blockMesh.geometry?.dispose();
    const mats = Array.isArray(blockMesh.material) ? blockMesh.material : [blockMesh.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
    blockMesh = null;
  }
  contentGroup.clear();
}

function rebuild() {
  disposeContent();
  const { width, height } = viewportSize();

  // --- Build the static block. The CAMERA orbits, not the part, so its identity
  //     transform keeps the once-built edge map valid for the life of the rebuild. ---
  blockMesh = createBearingBlock();
  contentGroup.add(blockMesh);
  blockMesh.updateWorldMatrix(true, false); // edge map + raycasts read world space

  // --- Edge topology once (camera-invariant weld, RULES.md §3.15). ---
  const edgeMap = buildEdgeMap(blockMesh.geometry, blockMesh.matrixWorld);

  // --- BVH over the static solid, built ONCE here (like the edge map, it is
  //     camera-invariant — the block never moves, only the camera orbits). The
  //     occlusion raycaster in lineDrawer traverses this instead of every triangle.
  //     Built AFTER buildEdgeMap so the weld reads the original non-indexed geometry;
  //     computeBoundsTree then adds a sequential index, which renders identically.
  //     Freed in disposeContent() before the geometry (ADR-004 disposal contract). ---
  blockMesh.geometry.computeBoundsTree();

  // --- Live Type A / Type E-F classifier (raycast occlusion, re-run on orbit). ---
  lineDrawer = createLineDrawer(edgeMap, blockMesh, { width, height });
  contentGroup.add(lineDrawer.group);

  // --- Authored Type G centre lines + Type B dimensions (ride along in 3D). ---
  annotations = createAnnotations(dims, { width, height });
  contentGroup.add(annotations.group);

  // --- CSS2D callouts + dimension values (the value anchors come from annotations). ---
  labelLayer = createLabelLayer(scene, dims, { width, height, dimMode });
  labelLayer.addDimensionValues(annotations.getDimensionValueLabels());
  labelLayer.setDimMode(dimMode); // re-apply the current Aligned/Unidirectional choice

  // --- Reveal whatever layers the current step has unlocked, then classify once. ---
  applyLayers();
  setXray(xray); // re-apply the Hide-Solid toggle (the mesh was just recreated)
  lineDrawer.reclassify(activeCamera);
  forceReclassify = true;
}

/**
 * "X-ray" (Step 2): toggle the block's MATERIAL visibility AND, together with it, the
 * dashed Type E/F hidden-line layer. With the faces gone the body no longer hides the
 * rear edges from view, so revealing the dashed layer gives a true engineering wireframe —
 * SOLID Type A front edges, DASHED Type E/F rear edges. The mesh itself stays in the scene
 * (only its material hides), so the occlusion raycaster keeps classifying against the
 * geometry and the rear edges stay correctly dashed. We also surface the "Type E/F —
 * hidden" callout while x-raying.
 */
function setXray(on) {
  xray = on;
  if (blockMesh) blockMesh.material.visible = !on;
  lineDrawer?.setHiddenVisible(on); // dashed rear edges revealed only with the solid hidden
  labelLayer?.setCallout('hidden', on);
}

/** Push the cumulative layer-reveal state into every layer (idempotent). Type A is
 *  always on; the dashed hidden layer + its callout follow the live X-ray; centre /
 *  dimension follow the stepper. */
function applyLayers() {
  if (lineDrawer) {
    lineDrawer.setVisible(true);
    lineDrawer.setHiddenVisible(xray);
  }
  if (annotations) {
    annotations.showCentreLines(layers.centre);
    annotations.showDimensions(layers.dimensions);
  }
  if (labelLayer) {
    labelLayer.setCallout('visible', true);
    labelLayer.setCallout('hidden', xray);
    labelLayer.setCallout('centre', layers.centre);
    labelLayer.setCallout('dimension', layers.dimensions);
    labelLayer.showDimensionValues(layers.dimensions);
  }
}

// ============================================================================
// Camera framing + "Front View" quick-view
// ============================================================================

/** The canonical Front View pose: look straight along the bore axis (down −Z) so
 *  the bore reads as a clean circle, framed to the block's front-face extents. */
function frontViewPose() {
  const target = new THREE.Vector3(0, dims.axisY, 0);
  // Fit the whole DRAWING — the block AND the authored annotations outside it — as a
  // reach (world units) from the bore-axis target on each side. Framing the block box
  // alone clips the Type B dimensions (L below, H to the right) at Step 4.
  //
  // KEY: the front face + every annotation sit at z ≈ +halfDepth, i.e. CLOSER to the
  // camera than the target plane (z=0), so they project larger. The reach must be fit
  // at THAT plane's distance (fit distance + zFront), or the L/H dimensions spread past
  // the frame edges (a tight block-plane fit leaves them clipped).
  const zFront = dims.halfDepth;
  const reachX = dims.halfLength + ANNOTATION_REACH;            // H dimension, right side
  const reachUp = (dims.topY - dims.axisY) + 0.4;              // dome + centre overshoot
  const reachDown = (dims.axisY - dims.baseBottomY) + ANNOTATION_REACH; // foot + L dimension
  const t = Math.tan((camera.fov * DEG2RAD) / 2);
  const fit = Math.max(Math.max(reachUp, reachDown) / t, reachX / (t * camera.aspect), 0.1);
  const dist = FRAME_PADDING * fit + zFront;
  return { target, position: new THREE.Vector3(target.x, target.y, target.z + dist) };
}

/** Symmetric orthographic frustum (half-width / half-height, world units) that frames the
 *  SAME drawing envelope frontViewPose() fits — block + the Type B dimensions reaching past
 *  it. Centred on the bore axis; the larger vertical reach is used so nothing clips, and the
 *  width is aspect-locked to the height so the bore stays a true circle. */
function orthoFrustum(aspect) {
  const reachX = dims.halfLength + ANNOTATION_REACH;                    // H dimension, right side
  const reachUp = (dims.topY - dims.axisY) + 0.4;                       // dome + centre overshoot
  const reachDown = (dims.axisY - dims.baseBottomY) + ANNOTATION_REACH; // foot + L dimension
  const halfH = FRAME_PADDING * Math.max(reachUp, reachDown, reachX / aspect);
  return { halfW: halfH * aspect, halfH };
}

/** Make the perspective free-orbit pair the active camera (boot / reset / hand-back). This is the
 *  single chokepoint every "now in free-orbit perspective" path funnels through, so it also clears
 *  the exit-in-flight guard: an exit morph that is ABANDONED (its tween cancelled by reset / Turn
 *  90° / micro-zoom before onComplete) still lands here and releases the guard, so a later
 *  drag / scroll / pan can arm a fresh exit instead of being silently locked out. */
function usePerspective() {
  activeCamera = camera;
  activeControls = controls;
  orthoControls.enabled = false;
  controls.enabled = true;
  exitingFrontView = false;  // any route to perspective ends an in-flight exit morph
  setFrontViewActive(false); // free orbit is live → default viewport hint
}

/** Ensure the perspective free-orbit pair is the live camera, seeding it from the current ortho
 *  pose if the Front View elevation is active (so the viewpoint does not jump). Shared by the
 *  Step-4 micro-zoom and the keyboard "Turn 90°" orbit-pose button. */
function ensurePerspectiveActive() {
  if (activeCamera !== orthoCamera) return;
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();
  camera.position.copy(orthoCamera.position);
  camera.up.copy(orthoCamera.up);
  controls.target.copy(orthoControls.target);
  controls.update();
  usePerspective();
}

// --- Ortho↔perspective projection morph (ported from Module 2) ----------------
// Orthographic has no foreshortening, perspective has full foreshortening, so a straight
// camera swap at the end of the Front-View glide makes off-plane geometry "pop" into depth
// in one frame — the jarring snap the earlier build had. Instead we blend the active ortho
// camera's projection matrix toward the perspective projection across the SAME glide, so the
// view continuously loses depth and lands on a true parallel elevation with no cut.

/**
 * Stamp the blended ortho↔perspective projection onto the ortho camera for this frame.
 * Read live each frame (after the tween's updateProjectionMatrix + controls.update) so it is
 * the last word on the matrix before render. At k=1 it equals the perspective matrix exactly
 * (looks perspective); at k=0 it is the pure ortho matrix the tween just rebuilt.
 */
function applyProjectionMorph() {
  const k = projectionMorphK;
  const o = orthoCamera.projectionMatrix.elements; // pure ortho this frame (tween rebuilt it)
  const p = camera.projectionMatrix.elements;      // perspective, pose-independent
  for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * k;
  orthoCamera.projectionMatrixInverse.copy(orthoCamera.projectionMatrix).invert();
}

/** End any in-flight projection morph and restore a clean ortho matrix. Called before every
 *  fresh camera move so a leftover blend never bleeds into the next view. */
function clearProjectionMorph() {
  if (projectionMorphK === null) return;
  projectionMorphK = null;
  orthoCamera.updateProjectionMatrix(); // discard the blend; recompute pure ortho
}

/**
 * Glide the ORTHO camera (the only camera this sim tweens) to a pose — position, target and
 * zoom — inside the anim.js tween engine; the render loop's activeControls.update() each
 * frame finalises damping. If engageOrtho armed a perspective→ortho morph (projectionMorphK
 * !== null on entry), drive it to 0 across the SAME eased curve so the depth change animates
 * too. Reduced motion makes the tween jump to the end instantly (anim.js).
 *
 * @param {THREE.Vector3} toPos
 * @param {THREE.Vector3} toTarget
 * @param {number} toZoom
 * @param {number} [duration=QUICK_VIEW_MS]
 * @param {(t:number)=>number} [ease=easeCamera]
 */
function tweenCamera(toPos, toTarget, toZoom, duration = QUICK_VIEW_MS, ease = easeCamera) {
  const fromPos = orthoCamera.position.clone();
  const fromTarget = orthoControls.target.clone();
  const fromZoom = orthoCamera.zoom;
  const morphing = projectionMorphK !== null;
  // While morphing FROM perspective, hold the seeded camera-to-target distance constant
  // instead of dollying to the destination standoff: a far standoff would shrink the
  // perspective-phase view while the zoom grew it back (a wobble). In pure ortho the final
  // distance is irrelevant to framing, so the monotonic zoom alone settles it.
  const fromDist = morphing ? fromPos.distanceTo(fromTarget) : 0;
  cameraTween?.cancel();
  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease,
    onUpdate: (t) => {
      orthoCamera.position.lerpVectors(fromPos, toPos, t);
      orthoControls.target.lerpVectors(fromTarget, toTarget, t);
      if (morphing) {
        orthoCamera.position.sub(orthoControls.target).setLength(fromDist).add(orthoControls.target); // no dolly
      }
      orthoCamera.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
      orthoCamera.updateProjectionMatrix(); // pure ortho; applyProjectionMorph blends on top
      if (morphing) projectionMorphK = 1 - t; // perspective→ortho on the same curve
    },
    onComplete: () => {
      cameraTween = null;
      if (morphing) projectionMorphK = null; // settled on pure ortho; stop blending
      forceReclassify = true;
    },
  });
}

/** Snap to the Front View (boot / reset). Always returns to the perspective free-orbit pair. */
function frameToBlock() {
  if (!blockMesh) return;
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();
  usePerspective();
  const { target, position } = frontViewPose();
  camera.position.copy(position);
  controls.target.copy(target);
  controls.update();
  forceReclassify = true;
}

/**
 * Glide the PERSPECTIVE free-orbit camera to a pose (position + target) through the anim.js
 * tween engine; the render loop's activeControls.update() finalises damping each frame, and the
 * in-flight cameraTween keeps the occlusion pass re-classifying (same wiring as tweenCamera,
 * which instead drives the separate ORTHO Front-View camera). Reduced motion snaps (anim.js).
 * @param {THREE.Vector3} toPos
 * @param {THREE.Vector3} toTarget
 * @param {number} [duration=QUICK_VIEW_MS]
 * @param {(t:number)=>number} [ease=easeStandard]
 */
function tweenPerspectiveTo(toPos, toTarget, duration = QUICK_VIEW_MS, ease = easeStandard) {
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  cameraTween?.cancel();
  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease,
    onUpdate: (t) => {
      camera.position.lerpVectors(fromPos, toPos, t);
      controls.target.lerpVectors(fromTarget, toTarget, t);
    },
    onComplete: () => {
      cameraTween = null;
      forceReclassify = true;
    },
  });
}

/** Turn the part to a fixed azimuth about the vertical axis (0° = Front View) at the Front-View
 *  standoff, on the perspective free-orbit camera; the in-flight tween keeps the occlusion pass
 *  re-classifying, so a keyboard-only learner watches the visible→hidden swap as it turns.
 *  Reduced motion snaps (anim.js). */
function orbitToAzimuth(deg) {
  if (!blockMesh) return;
  ensurePerspectiveActive();
  const { target, position } = frontViewPose();
  const dist = position.distanceTo(target);
  const az = deg * DEG2RAD;
  const pos = new THREE.Vector3(
    target.x + Math.sin(az) * dist,
    target.y,
    target.z + Math.cos(az) * dist,
  );
  tweenPerspectiveTo(pos, target);
}

/** Set the Step-4 micro-zoom button's label to match state. */
function setZoomLabel(zoomed) {
  const b = document.getElementById('btn-zoom-arrow');
  if (b) b.textContent = zoomed ? 'Reset view' : 'Inspect arrowhead';
}

/** Default viewport hint text (restored whenever free-orbit perspective is the live camera). */
const DEFAULT_VP_HINT = 'Drag to orbit · scroll to zoom';

/** Reflect the current projection mode on the viewport hint, so the learner can see whether
 *  the orthographic elevation (on=true) or free-orbit perspective (on=false) is live — and,
 *  while ortho, how to get back (a left-drag). */
function setFrontViewActive(on) {
  const hint = document.querySelector('.vp-hint');
  if (hint) hint.textContent = on ? 'Drag to return to free orbit' : DEFAULT_VP_HINT;
}

/**
 * Step-4 micro-zoom: dolly the perspective camera in close to the L dimension arrowhead so the
 * strict 3:1 filled shape and the 2–3 mm extension-line overshoot are legible. Captures the
 * current frame first (savedView) so restoreView() can pull back to exactly where the learner
 * was. Ensures dimensions are on (else there is nothing to inspect) and hands back from the
 * ortho Front View to perspective if needed.
 */
function zoomToArrowhead() {
  if (!annotations || !blockMesh) return;

  // Micro-zoom rides the perspective free-orbit camera. If the ortho Front View is live, hand
  // back to perspective first, seeded on the current ortho pose so the viewpoint doesn't jump.
  ensurePerspectiveActive();

  // The arrowheads only exist on-screen once the dimensions are revealed. If the learner
  // jumps straight to "Inspect arrowhead" without pressing "Reveal dimensions", force the
  // layer on here AND tell the stepper so its state, done-badge, rail check and Next gating
  // all reflect that dimensions are now shown (otherwise Step 4 never reads complete).
  if (!layers.dimensions) {
    layers.dimensions = true;
    applyLayers();
    stepper?.dimensionsRevealed();
  }

  savedView = { pos: camera.position.clone(), target: controls.target.clone() };

  // World-space arrowhead tip + the annotation-plane front normal.
  const focus = annotations.getArrowFocus();
  annotations.group.updateWorldMatrix(true, false);
  const world = annotations.group.localToWorld(focus.position.clone());
  const q = new THREE.Quaternion();
  annotations.group.getWorldQuaternion(q);
  const n = focus.normal.clone().applyQuaternion(q).normalize();

  // Sit close and mostly head-on (so the flat filled triangle reads), with a small lateral/
  // vertical offset for a touch of 3-D.
  const camPos = world.clone()
    .add(n.multiplyScalar(1.3))
    .add(new THREE.Vector3(0.18, 0.12, 0));

  tweenPerspectiveTo(camPos, world, QUICK_VIEW_MS, easeStandard);
  setZoomLabel(true);
  announce('Zoomed in on a dimension arrowhead — a solid 3-to-1 arrowhead with the extension line overshooting its tip.');
}

/** Pull the camera back out of the micro-zoom to the captured frame. No-op unless a zoom is
 *  active, so it is safe to call on every step navigation / Back. */
function restoreView() {
  if (!savedView) return;
  const { pos, target } = savedView;
  savedView = null;
  tweenPerspectiveTo(pos, target, QUICK_VIEW_MS, easeStandard);
  setZoomLabel(false);
}

/** "Front View" quick-view → a TRUE orthographic elevation (bore = perfect circle).
 *  engageOrtho makes the ortho camera live up front — seeded ON the current 3D view and with
 *  the perspective→ortho morph armed — then tweenCamera glides it square-on while the
 *  projection morphs from perspective to parallel on the SAME curve, so there is no
 *  projection-type pop at the end. Reduced motion snaps. The camera is never locked: a
 *  left-drag hands back to free orbit. */
function frontViewOrtho() {
  if (!blockMesh) return;
  const { target, position } = frontViewPose();

  // Reduced motion: engage ortho (no morph) and snap straight to the square-on elevation.
  if (prefersReducedMotion) {
    cameraTween?.cancel();
    cameraTween = null;
    engageOrtho();
    orthoCamera.position.copy(position);
    orthoCamera.up.set(0, 1, 0);
    orthoControls.target.copy(target);
    orthoCamera.zoom = 1;
    orthoCamera.updateProjectionMatrix();
    orthoControls.update();
    forceReclassify = true;
    announce('Front view — orthographic elevation.');
    return;
  }

  engageOrtho();                                  // ortho live + morph armed (k=1)
  tweenCamera(position, target, 1, QUICK_VIEW_MS); // glide square-on, morph k 1→0
  announce('Moving to the orthographic Front View.');
}

/** Make the ortho camera the live camera, seeding a smooth transition INTO it. On first entry
 *  FROM perspective it seeds the ortho pose ON the live 3D view (position, target, screen-up)
 *  and a zoom whose frustum height matches the perspective frustum at this distance — so frame
 *  0 looks identical to the 3D view — then arms the perspective→ortho morph. Ortho→ortho
 *  re-frames keep the current ortho pose and clear any leftover morph. */
function engageOrtho() {
  const { width, height } = viewportSize();
  const aspect = (width || 1) / (height || 1);
  const f = orthoFrustum(aspect);
  orthoCamera.left = -f.halfW;
  orthoCamera.right = f.halfW;
  orthoCamera.top = f.halfH;
  orthoCamera.bottom = -f.halfH;

  if (activeCamera !== orthoCamera) {
    orthoCamera.position.copy(camera.position);
    orthoCamera.up.copy(camera.up); // start from the 3D view's screen-up (front view stays Y-up)
    orthoControls.target.copy(controls.target);
    const dist = camera.position.distanceTo(controls.target);
    const perspHalfH = dist * Math.tan((camera.fov * DEG2RAD) / 2);
    orthoCamera.zoom = f.halfH / Math.max(perspHalfH, 1e-3); // match framing at frame 0 (no pop)
    orthoCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();                    // morph endpoint must be current (aspect)
    projectionMorphK = prefersReducedMotion ? null : 1; // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph(); // ortho→ortho: pure ortho throughout; drop any leftover blend
  }

  activeCamera = orthoCamera;
  activeControls = orthoControls;
  controls.enabled = false;
  orthoControls.enabled = true;
  forceReclassify = true;
  setFrontViewActive(true); // ortho elevation is live → "drag back" hint
}

/** A left-drag on the live ortho elevation is an intent to orbit in 3D — so it eases SMOOTHLY
 *  back to the perspective free-orbit view (exitFrontViewSmooth) rather than snapping. Registered
 *  CAPTURE-phase on the viewport container so it runs BEFORE OrbitControls' own canvas pointerdown;
 *  stopPropagation keeps that pointerdown from ALSO starting an orbit on the (rotate-locked) ortho
 *  pair mid-morph. Once the transition settles, free orbit is live and the learner drags to orbit. */
function onViewportPointerDown(event) {
  if (activeCamera !== orthoCamera || exitingFrontView) return; // already perspective / mid-exit
  if (event.button !== 0) return;                    // pan/zoom start is handled by the 'start' hook
  // Only a drag on the 3D canvas itself exits — never a click on the viewport chrome (the Front
  // View button), which also bubbles through this container.
  if (event.target !== renderer.domElement) return;
  // Swallow the gesture so OrbitControls never starts a drag on the flat elevation; the smooth
  // morph replaces the old instant "harsh snap" hand-back.
  event.stopPropagation();
  exitFrontViewSmooth();
}

/** OrbitControls 'start' on the live ortho pair (scroll-to-zoom or a pan gesture) → ease smoothly
 *  back to free-orbit perspective instead of zooming/panning the flat elevation. Guarded so a
 *  gesture during the morph never stacks a second exit. */
function onOrthoInteractionStart() {
  if (activeCamera !== orthoCamera || exitingFrontView) return;
  exitFrontViewSmooth();
}

/**
 * Leave the orthographic Front View and hand SMOOTHLY back to the perspective free-orbit
 * camera — the reverse of frontViewOrtho. This is the SINGLE exit path shared by every way out
 * of the elevation: the Front View button's toggle-off AND every user interaction (a left-drag,
 * a scroll-zoom, or a pan). It eases the projection from parallel back to perspective IN PLACE
 * (the ortho camera's matrix is morphed ortho→perspective across easeCamera), then swaps to the
 * real perspective camera at a size-matched pose, so there is no projection-type "pop" and no
 * jarring cut. No-op unless the ortho elevation is live.
 */
function exitFrontViewSmooth(duration = QUICK_VIEW_MS) {
  if (activeCamera !== orthoCamera || exitingFrontView) return;
  cameraTween?.cancel();
  cameraTween = null;
  exitingFrontView = true;
  // Silence the ortho pair for the length of the morph so a continued drag / extra scroll notch
  // can't pan or zoom the flat view while it is easing away (perspective is re-enabled at the end
  // by usePerspective). update() still runs from the render loop regardless of `enabled`.
  orthoControls.enabled = false;

  const { width, height } = viewportSize();
  const aspect = (width || 1) / (height || 1);
  const f = orthoFrustum(aspect);
  const target = orthoControls.target.clone();
  const dir = orthoCamera.position.clone().sub(target).normalize();
  const orthoHalfH = f.halfH / Math.max(orthoCamera.zoom, 1e-3);
  const dist = orthoHalfH / Math.tan((camera.fov * DEG2RAD) / 2);
  // Move the ortho camera to the size-matched distance. Ortho framing is fixed by its frustum +
  // zoom (NOT distance), so this leaves the current parallel view unchanged — but it makes the
  // perspective endpoint (k=1, which ignores zoom and reads distance) frame identically, so the
  // whole morph is size-stable end to end.
  const matchedPos = target.clone().add(dir.multiplyScalar(dist));
  orthoCamera.position.copy(matchedPos);
  orthoControls.update();

  const handToPerspective = () => {
    camera.position.copy(matchedPos);
    camera.up.copy(orthoCamera.up);
    controls.target.copy(target);
    controls.update();
    clearProjectionMorph();
    usePerspective(); // flips the button un-pressed, restores the hint, clears exitingFrontView
    forceReclassify = true;
    announce('Returning to the free-orbit 3D view.');
  };

  // Reduced motion: no morph, just hand back at the size-matched pose.
  if (prefersReducedMotion) { handToPerspective(); return; }

  // Ease the projection ortho(0) → perspective(1) in place. applyProjectionMorph (run in the
  // render loop while projectionMorphK !== null) blends the pure-ortho matrix toward the
  // perspective one each frame; onUpdate rebuilds pure ortho first so the blend never compounds.
  camera.updateProjectionMatrix(); // morph endpoint must be current (aspect)
  projectionMorphK = 0;
  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease: easeCamera,
    onUpdate: (t) => {
      orthoCamera.position.copy(matchedPos);
      orthoControls.target.copy(target);
      orthoCamera.updateProjectionMatrix(); // pure ortho; applyProjectionMorph blends on top
      projectionMorphK = t;
    },
    onComplete: () => {
      cameraTween = null;
      handToPerspective(); // clears the morph + swaps to the real perspective camera
    },
  });
}

// ============================================================================
// Render loop — re-classify LIVE, but only when the camera actually moved (or a
// Front-View tween is running), and at most once per frame (RULES.md §3.19).
//
// reclassify() runs the camera-dependent visible/hidden occlusion pass (the BVH-
// accelerated line-of-sight raycast — the dashed Type E/F vs solid Type A decision)
// plus the silhouette pass. three-mesh-bvh brought the occlusion pass down to ~19 ms,
// so it runs every moved frame. The rAF loop IS the throttle: animate() runs at most
// once per frame, gated on activeControls.update() (the "camera truly moved" signal)
// plus the in-flight camera tween — never wired to a raw mousemove. anim.js tweens (the
// Front-View glide + projection morph) are stepped here too, so simAPI.pause() halts
// them along with the render loop.
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);

  // Delta in ms (capped so a long pause/tab-switch doesn't jump the tween).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  // Capture BEFORE ticking — the tween's final frame sets cameraTween null in onComplete,
  // so reading it here keeps that last frame reclassifying.
  const tweening = cameraTween !== null;
  tickTweens(delta); // advance the Front-View glide + projection morph (pauses with the loop)

  // activeControls.update() returns true when the camera transform changed this frame (user
  // drag or damping inertia) — the canonical "camera actually moved" signal. forceReclassify
  // covers discrete events (rebuild / reset / front-view snap) where the linework must refresh
  // even though the camera held still.
  const camChanged = activeControls.update();

  // Stamp the blended ortho↔perspective projection LAST, after the tween's own
  // updateProjectionMatrix() and controls.update(), so neither clobbers it before render.
  if (projectionMorphK !== null) applyProjectionMorph();

  if (lineDrawer && (forceReclassify || camChanged || tweening)) {
    // One rAF-throttled occlusion + silhouette pass. reclassify() diffs each edge and
    // rebuilds the solid/dashed batches ONLY when something actually flipped, so a still
    // frame costs just the raycasts. Runs against whichever camera is live (ortho too).
    lineDrawer.reclassify(activeCamera);
    forceReclassify = false;
  }

  renderer.render(scene, activeCamera);
  labelRenderer.render(scene, activeCamera);
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

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // Keep the ortho elevation correctly framed AND the bore round when the iframe resizes.
  if (orthoCamera) {
    const f = orthoFrustum(w / h);
    orthoCamera.left = -f.halfW;
    orthoCamera.right = f.halfW;
    orthoCamera.top = f.halfH;
    orthoCamera.bottom = -f.halfH;
    orthoCamera.updateProjectionMatrix();
  }

  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);

  // Fat lines render the wrong thickness if LineMaterial.resolution drifts from the
  // drawing buffer — keep every layer in sync on resize (RULES.md §3.16).
  lineDrawer?.setResolution(w, h);
  annotations?.setResolution(w, h);
  labelLayer?.setResolution(w, h);
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
// Platform contract — window.simAPI (RULES.md §2.8–§2.9).
// ============================================================================

/**
 * The platform calls pause() when overlays/whiteboard open and resume() on close.
 * reset() returns to Step 1 + the Front View and rebuilds — the ONE reset path the
 * in-sim Reset button must also use (RULES.md §2.9: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    layers.centre = false;
    layers.dimensions = false;
    dimMode = 'aligned'; // dimensioning system back to the BIS default
    xray = false;       // solid faces back on (the Step-2 X-ray is cleared)
    poseAzimuthDeg = 0; // keyboard orbit pose back to Front View
    cancelTweens();     // drop any in-flight Front-View glide / micro-zoom dolly
    cameraTween = null;
    exitingFrontView = false; // a reset mid-exit-morph must not leave the guard stuck (frameToBlock
                              // → usePerspective also clears it; explicit here as defence-in-depth)
    savedView = null;   // clear any micro-zoom home pose…
    setZoomLabel(false); // …and reset the Inspect-arrowhead button label
    projectionMorphK = null;
    rebuild();        // single path: fresh block + linework, layers back to visible-only
    frameToBlock();   // Front View
    stepper?.reset(); // wizard chrome back to Step 1 (no engine side-effects)
    announce('Simulation reset. Showing the visible edges from the Front View.');
  },
};

// ============================================================================
// Controller injected into the stepper (the narrow surface it depends on). State +
// the rebuild/layer pipeline stay owned here; the stepper only calls through this,
// so the leaf-layering rule holds (RULES.md §3.6).
// ============================================================================

const simController = {
  /** Step 2 — X-ray: drop the solid's faces so the full wireframe behind shows through
   *  (on=true), or restore them (on=false). The wireframe itself is already drawn. */
  setXray(on) { setXray(on); },
  /** Step 3 — reveal the Type G chain centre lines. */
  showCentreLines(on) { layers.centre = on; applyLayers(); },
  /** Step 4 — reveal the Type B dimensions (lines + numeric values). */
  showDimensions(on) { layers.dimensions = on; applyLayers(); },

  /** Step 4 — switch the dimensioning system (Aligned ↔ Unidirectional) and re-rotate the
   *  value pills. Owned here so the choice survives a rebuild (rebuild re-applies dimMode). */
  setDimMode(mode) {
    dimMode = mode === 'uni' ? 'uni' : 'aligned';
    labelLayer?.setDimMode(dimMode);
  },

  /** Quick-view: swap to the orthographic Front View (camera never locked). */
  frontView() { frontViewOrtho(); },

  /** Pull the camera out of a Step-4 micro-zoom on any step navigation / Back. The bare
   *  `restoreView` here is the hoisted module function (no recursion); no-op unless zoomed. */
  restoreView() { restoreView(); },

  /** Step 4 terminal: calm success toast + narration for the content milestone (all four BIS
   *  line types now shown). Leaves the finished drawing on screen (no reset) so the learner can
   *  keep exploring it. Decoupled from the host signal — "Finish lesson" (stepper.js) fires
   *  markComplete() on its own click, not as a side effect of this milestone. */
  completeLesson() {
    showToast('Lesson complete — all four BIS line types shown.');
    announce('Lesson complete. All four BIS line types — A, E/F, G and B — are now shown on the part.');
  },

  /** Single reset path (RULES.md §2.9). */
  reset() { window.simAPI.reset(); },

  markComplete,
  announce,
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
    // Keyboard orbit pose: turn the part 90° per press so keyboard users can trigger the
    // visible→hidden swap the mouse gets from a drag.
    document.getElementById('btn-turn')?.addEventListener('click', () => {
      poseAzimuthDeg = (poseAzimuthDeg + 90) % 360;
      orbitToAzimuth(poseAzimuthDeg);
      announce(poseAzimuthDeg % 180 === 0
        ? 'Turned to a front-on view. The bore reads as a circle of visible edges.'
        : 'Turned 90 degrees to a side view. The bore is now hidden, shown as dashed lines.');
    });
    // Step-4 micro-zoom toggle: dolly in to inspect an arrowhead, or pull back out.
    document.getElementById('btn-zoom-arrow')?.addEventListener('click', () => {
      if (savedView) restoreView(); else zoomToArrowhead();
    });

    rebuild();        // build the block + Step-1 visible edges
    frameToBlock();   // frame at the Front View
    stepper = initStepper(simController);
    // Glossary popover for the inline term-buttons stepper.js injects (event-delegated off
    // #wizard, so freshly-painted terms always work). The step DOM is live by now.
    initTerms({ terms: TERMS, root: '#wizard' });

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
