// Orchestrator for the "Introduction to Solids" anatomy gallery. A deliberately
// slimmed sibling of Topic 2's projection orchestrator: it shares the geometry
// generators and the vertexLabeler annotation layer, but strips EVERYTHING in the
// projection lesson — HP/VP/PP planes + grids, the rotation-priority hierarchy, the
// fold-to-2D animation, the ortho quick-views/connectors, and the Guided Stepper.
//
// What remains is a calm 3D showcase: pick a solid from the sidebar, see it centred
// and gently turntabling with its engineering annotations (axis OP, vertex labels,
// surface generators), and read its anatomy in the side panel. Toggle each annotation
// layer on/off independently.
//
// Layering (CLAUDE.md): main.js is the orchestrator. It imports the data, geometry,
// content, and annotation layers; gallery.js (the DOM controller) talks back ONLY
// through the injected `simController` below, never reaching into the scene directly.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { ShapeType } from './src/shapeData.js';
import { createGenericPyramid } from './src/genericPyramid.js';
import { createGenericPrism } from './src/genericPrism.js';
import { createCylinder } from './src/cylinder.js';
import { createCone } from './src/cone.js';
import { createCube } from './src/cube.js';
import { initVertexLabeler } from './src/vertexLabeler.js';
import { initTerms } from './src/terms.js';
import { initGallery } from './src/gallery.js';
import { DEFAULT_SHAPE, SHAPE_FACTS, factsFor } from './src/anatomy.js';

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
// Camera framing + motion. Restored by simAPI.reset() (CLAUDE.md platform contract).
// The solid is centred on the world origin, so the camera simply looks at (0,0,0).
// ============================================================================

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(5, 3.4, 7);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

/** Gentle turntable rate (OrbitControls.autoRotateSpeed; three's default is 2.0). The
 *  built-in auto-rotate spins the CAMERA about the target and pauses itself while the
 *  user is dragging (state !== NONE), resuming on release — exactly the showcase feel,
 *  with no custom animation needed. Disabled under prefers-reduced-motion. */
const TURNTABLE_SPEED = 0.8;

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;

/** CSS2DRenderer overlay for the anatomy labels, rendered each frame on top of the
 *  WebGL canvas and sized in lockstep with the renderer on resize. */
let labelRenderer;

/** Annotation controller from initVertexLabeler — { generate, clear, setLayerVisible, setResolution, dispose }. */
let labeler;

/** The sim viewport element; held module-wide so resize can read its live size. */
let viewport;

/** Holds the active solid + its edge overlay. The disposal contract iterates this
 *  group's direct children, so both are added here as siblings — never nested. */
let shapeGroup;
let currentMesh = null;
let currentEdgeOverlay = null;

/** The shape parameters currently on screen. Mutated only via rebuild(). */
let currentShapeData = null;

/** Which annotation layers are shown. Persisted here (not just in the labeler) so the
 *  gallery can reflect them and reset can restore them. */
const layerFlags = { axis: true, labels: true, generators: true };

/** Turntable on/off. Defaults on, but off when the OS asks for reduced motion. */
let spinEnabled = !prefersReducedMotion;

/** Gallery (sidebar + anatomy panel) handle from initGallery — { sync, dispose }. */
let gallery;

let rafId = null;
let running = false;

const statusRegion = document.getElementById('sim-status');

// ============================================================================
// Small chrome helpers (ported intact from the projection orchestrator)
// ============================================================================

/** Narrate a change to assistive tech (accessibility commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/**
 * Show/hide the transient WebGL context-loss recovery chip and narrate the state, so
 * a screen-reader user knows the paused view is recovering, not broken.
 * @param {boolean} on
 */
function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
  announce(on
    ? 'The 3D view paused while your device reset its graphics. Restoring.'
    : '3D view restored.');
}

/** Signal a successful boot to the index.html watchdog: clear its timeout and hide any
 *  fallback a slow load surfaced, so a late-but-successful boot self-heals. */
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
// Geometry build (port of the projection orchestrator's createSolidMesh routing)
// ============================================================================

/**
 * Build the solid for the given shape data, positioned + rotated per the IShape
 * contract — the caller re-centres it. Every ShapeType maps to its dedicated
 * generator; an unknown shape is a programming error, not a renderable box.
 * @param {import('./src/shapeData.js').ShapeData} data
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
 * Visible-edge overlay for the solid: solid dark ink lines (CLAUDE.md visual style).
 * A 1px LineBasicMaterial is acceptable here — this is the solid's own silhouette, not
 * an engineering projection line.
 *
 * The 30° angle threshold drops the facet seams of the 24-sided curved approximations
 * (their dihedral is ~15°) so a cylinder/cone reads as a clean outline + rim circle,
 * while every TRUE polyhedron edge survives (the smallest real dihedral among the
 * prisms/pyramids here is ~60°). The dashed generators then carry the curved surface.
 * @param {THREE.BufferGeometry} sourceGeometry
 * @returns {THREE.LineSegments}
 */
function createEdgeOverlay(sourceGeometry) {
  const edges = new THREE.EdgesGeometry(sourceGeometry, 30);
  const material = new THREE.LineBasicMaterial({ color: cssColor('--color-ink') });
  return new THREE.LineSegments(edges, material);
}

/**
 * Showcase shape data for a ShapeType: per-shape display dimensions (anatomy.js) with
 * NO plane offsets and NO inclination — the gallery shows every solid upright and
 * centred. distHP/distVP stay 0 here; rebuild() then drops the solid onto the origin.
 * @param {string} shape  a ShapeType value
 * @returns {import('./src/shapeData.js').ShapeData}
 */
function showcaseData(shape) {
  const { size } = factsFor(shape);
  return {
    shape,
    baseLength: size.baseLength,
    height: size.height,
    distHP: 0,
    distVP: 0,
    angleHP: 0,
    angleVP: 0,
    rotationY: 0,
  };
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (CLAUDE.md, non-negotiable).
// cleanup → build → centre → annotate.
// ============================================================================

/**
 * @param {import('./src/shapeData.js').ShapeData | null} shapeData  null clears the scene.
 */
function rebuild(shapeData) {
  currentShapeData = shapeData;

  // --- Disposal contract (verbatim from CLAUDE.md). Prevents WebGL context exhaustion
  //     across rapid shape switches; verify with renderer.info.memory staying flat. ---
  for (const obj of shapeGroup.children) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
  currentMesh = null;
  currentEdgeOverlay = null;

  if (!shapeData) {
    labeler?.clear();
    return;
  }

  // --- Build the solid (positioned upright with the generator's half-extent offsets),
  //     then OVERRIDE its position to the origin. Every generator builds origin-centred
  //     geometry, and the gallery applies no rotation, so (0,0,0) seats the solid
  //     symmetrically about the orbit target with the axis OP vertical through it. ---
  const mesh = createSolidMesh(shapeData);
  mesh.position.set(0, 0, 0);

  // Edge overlay shares the solid's transform. Kept as a SIBLING (not a child) so the
  // disposal loop above reaches it.
  const edgeOverlay = createEdgeOverlay(mesh.geometry);
  edgeOverlay.position.copy(mesh.position);
  edgeOverlay.quaternion.copy(mesh.quaternion);
  edgeOverlay.scale.copy(mesh.scale);

  shapeGroup.add(mesh, edgeOverlay);

  // The labeler welds + places labels in WORLD space, so matrixWorld must be current
  // before generate() (the render loop has not run yet this frame).
  mesh.updateWorldMatrix(true, false);
  currentMesh = mesh;
  currentEdgeOverlay = edgeOverlay;

  refreshLabels();
}

/** Regenerate the anatomy annotations for the current mesh and re-apply the layer
 *  flags (the labeler also re-applies them itself, but this keeps the two in sync). */
function refreshLabels() {
  if (!labeler) return;
  if (!currentMesh) { labeler.clear(); return; }
  labeler.generate(currentMesh);
  for (const layer of Object.keys(layerFlags)) {
    labeler.setLayerVisible(layer, layerFlags[layer]);
  }
}

/** Show/hide one annotation layer ('axis' | 'labels' | 'generators') and remember it. */
function setLayer(layer, on) {
  if (!(layer in layerFlags)) return;
  layerFlags[layer] = on;
  labeler?.setLayerVisible(layer, on);
  announce(`${layer === 'axis' ? 'Central axis' : layer === 'labels' ? 'Vertex labels' : 'Generators'} ${on ? 'shown' : 'hidden'}.`);
}

/** Turn the turntable on/off. An explicit toggle overrides the reduced-motion DEFAULT
 *  (which only governs the initial/reset state) — the learner asked for motion. */
function setSpin(on) {
  spinEnabled = on;
  if (controls) controls.autoRotate = on;
  announce(on ? 'Auto-rotation on.' : 'Auto-rotation off.');
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;

  // Perspective free-orbit camera (the only camera — no ortho quick-views here).
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  // Renderer. Antialias for crisp technical edges; cap DPR so retina iframes don't overdraw.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows on the solid (CLAUDE.md)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (CLAUDE.md flags context exhaustion as the most likely
  // late-stage bug). preventDefault() opts in to a restorable context; rebuild on restore.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild(currentShapeData);
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Lighting: flat ambient fill + ONE low directional, no shadows — faint face
  // differentiation without architectural-viz lighting (CLAUDE.md visual style).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  // Orbit controls + the built-in turntable.
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.autoRotate = spinEnabled && !prefersReducedMotion;
  controls.autoRotateSpeed = TURNTABLE_SPEED;
  controls.update();

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // CSS2D overlay for the anatomy labels. A transparent DOM layer sized to the canvas;
  // pointer-events disabled so drag-to-orbit passes through. Appended to the same
  // container as the canvas so it tracks the viewport's box exactly.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);

  // Pass the live drawing-buffer size so the axis chain line + curved-solid generators
  // (fattened LineSegments2) render at the right pixel width from frame one.
  labeler = initVertexLabeler(scene, new THREE.Vector2(w, h));
}

// ============================================================================
// Render loop
// ============================================================================

function animate() {
  rafId = requestAnimationFrame(animate);
  controls.update(); // applies damping inertia + advances the turntable when idle
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera); // anatomy-label overlay on top of the canvas
}

function startLoop() {
  if (running) return;
  running = true;
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize — track the container (the iframe can be resized without a window event).
// ============================================================================

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);     // keep the label overlay aligned to the canvas
  labeler?.setResolution(w, h);     // keep fattened-line thickness correct (CLAUDE.md)
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
// Camera reset + Platform API (CLAUDE.md "Platform contract")
// ============================================================================

function resetCamera() {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

/**
 * The platform calls pause() when overlays/whiteboard open and resume() on close.
 * reset() restores the default shape, all annotation layers, the turntable default, and
 * the camera — routed through rebuild() (the one reset path; CLAUDE.md no second path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    layerFlags.axis = true;
    layerFlags.labels = true;
    layerFlags.generators = true;
    spinEnabled = !prefersReducedMotion;
    if (controls) controls.autoRotate = spinEnabled;
    resetCamera();
    rebuild(showcaseData(DEFAULT_SHAPE));
    gallery?.sync();
    announce('Gallery reset.');
  },
};

// ============================================================================
// Controller — the narrow surface gallery.js depends on. State + the rebuild/layer/
// spin pipeline stay owned here; the gallery only reads through getters and writes
// through selectShape/setLayer/setSpin/reset, so the layering rule holds.
// ============================================================================

const simController = {
  ShapeType,
  prefersReducedMotion,

  /** Current shape data, or null before the first build. */
  state: () => currentShapeData,
  /** Copy of the annotation-layer flags. */
  layers: () => ({ ...layerFlags }),
  /** Whether the turntable is on. */
  spinning: () => spinEnabled,

  /** Select a solid: rebuild centred + annotated, and announce it. */
  selectShape(shape) {
    rebuild(showcaseData(shape));
    announce(`${(SHAPE_FACTS[shape] ?? {}).name ?? shape} selected.`);
  },

  setLayer(layer, on) { setLayer(layer, on); },
  setSpin(on) { setSpin(on); },
  reset() { window.simAPI.reset(); },
  announce,
};

// ============================================================================
// Self-start (CLAUDE.md: sim runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container;

  // The one operation that can hard-fail is WebGL context creation. Catch it, surface
  // the on-brand WebGL fallback instead of a blank iframe, and bail cleanly.
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
    setupMobileNotice();

    // Boot directly with the default solid (no empty start), then wire the gallery,
    // which syncs its sidebar + panel to the now-present state.
    rebuild(showcaseData(DEFAULT_SHAPE));
    gallery = initGallery(simController);
    initTerms(); // wire any inline term popovers in the freshly-built sidebar copy

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Tell the watchdog the sim is live (clears its timer, hides any slow-load fallback).
  markBooted();
}

init();
