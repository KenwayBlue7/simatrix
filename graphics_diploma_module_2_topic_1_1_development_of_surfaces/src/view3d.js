// 3D View's Three.js layer (ADR-097/ADR-112 addenda, 2026-08-05). This track's FIRST
// Three.js dependency. Owns its own scene/camera/renderer/controls/rAF loop, entirely
// separate from the 2D canvas main.js already owns for the development plate — the two
// never share a render loop or a disposal path.
//
// Boots LAZILY on first Compare open (main.js's compare.show(), ADR-012/037/080 — see
// ../DECISIONS.md addendum superseding this file's original "Step 2" framing, same day as
// it was built) — a student who never opens Compare never pays for WebGL context creation
// (Module2/CLAUDE.md flags context exhaustion as the likeliest late-stage bug, so creating
// it only when needed is worth the extra lazy-boot branch).
//
// Disposal contract (Module2/CLAUDE.md, VERBATIM): every rebuild disposes the previous
// mesh(es)' geometry + material before building new ones. `clear3D()`/`rebuild3D(null, …)`
// empty the scene the same way Module2's own `rebuild(null)` does. The renderer/scene/
// camera themselves are NOT torn down on hide/reset — cheap to keep alive, matches
// Module2's reset() (clears the SOLID, not the renderer).
//
// Layering (CLAUDE.md): leaf module. Imports the three generators (cube/cylinder/
// elbowHalf) — nothing else; main.js injects the mount element and shape/params per call.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { createCube } from './cube.js';
import { createCylinder } from './cylinder.js';
import { createElbow } from './elbowHalf.js';
import { initLabels3d } from './labels3d.js';

let scene, camera, renderer, controls, shapeGroup, container;
let labelRenderer, labeler;
let rafId = null;
let booted = false;

function cssColor(name, fallback = '#ffffff') {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

function buildScene() {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 1000);
  camera.position.set(120, 90, 120);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w || 1, h || 1, false);
  renderer.shadowMap.enabled = false; // no cast shadows on the solid (Module2/CLAUDE.md)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (Module2/CLAUDE.md gotcha — a GPU reset or long
  // backgrounding can drop the context; without preventDefault() it will NOT restore).
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild3D(lastShapeId, lastParams);
    startLoop();
  }, false);

  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // CSS2D overlay for the prism's corner numerals — a transparent DOM layer sized to the
  // canvas; pointer-events disabled so drag-to-orbit passes through. Own stacking context
  // (position:absolute + explicit z-index) so the per-label zIndex values CSS2DRenderer
  // assigns for depth-sorting stay TRAPPED inside this overlay instead of competing with the
  // Compare pane's own chrome (.vp-hint etc.) — Module2/CHANGELOG.md's own bug for this
  // exact omission.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w || 1, h || 1);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  overlay.style.zIndex = '1';
  container.appendChild(overlay);
  labeler = initLabels3d(scene);

  new ResizeObserver(() => handleResize()).observe(container);
}

function handleResize() {
  if (!renderer || !camera || !container) return;
  const { clientWidth: w, clientHeight: h } = container;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);
}

function disposeShapeGroup() {
  // Verbatim disposal contract (Module2/CLAUDE.md): prevents WebGL context exhaustion
  // across repeated rebuilds.
  for (const obj of shapeGroup.children) {
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  }
  shapeGroup.clear();
}

let lastShapeId = null;
let lastParams = null;

/** Frame the camera/controls target on the just-built solid's bounding sphere — no fixed
 *  camera distance would suit all three constructions' very different size ranges. */
function frameSolid() {
  const box = new THREE.Box3().setFromObject(shapeGroup);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dist = Math.max(sphere.radius * 2.6, 10);
  controls.target.copy(sphere.center);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6) dir.set(1, 0.75, 1);
  dir.normalize().multiplyScalar(dist);
  camera.position.copy(controls.target).add(dir);
  camera.near = Math.max(dist / 100, 0.1);
  camera.far = dist * 20;
  camera.updateProjectionMatrix();
  controls.update();
}

/** Dispose the current solid and build the new one (or leave empty if `shapeId` is null —
 *  Reset / no construction chosen, mirrors Module2's `rebuild(null)`). Safe to call before
 *  the scene is booted — it just records the request for the next `show3D()`. */
export function rebuild3D(shapeId, params) {
  lastShapeId = shapeId;
  lastParams = params;
  if (!booted) return;
  disposeShapeGroup();
  if (!shapeId) return;

  let meshes;
  if (shapeId === 'prism') meshes = [createCube(params)];
  else if (shapeId === 'cylinder') meshes = [createCylinder(params)];
  else if (shapeId === 'elbow') meshes = createElbow(params);
  else return;

  shapeGroup.add(...meshes);
  frameSolid();

  // Corner/generator numerals — Prism, Cylinder, and (Phase 3, ADR-116) Elbow. The elbow's
  // `createElbow()` returns TWO meshes (`elbow-vertical`, `elbow-horizontal`, unlike the
  // single-mesh prism/cylinder generators) — only the vertical leg (`meshes[0]`) gets
  // labelled, matching the 2D plate's own single-development-pattern scope this phase
  // (labels3d.js's `planElbowStations()` dispatches on `mesh.name`, not `shapeId`, so the
  // horizontal leg mesh is simply never passed in).
  if (shapeId === 'prism' || shapeId === 'cylinder' || shapeId === 'elbow') {
    meshes[0].updateWorldMatrix(true, false);
    labeler?.generate(meshes[0]);
  } else {
    labeler?.clear();
  }
}

function frame() {
  rafId = requestAnimationFrame(frame);
  controls?.update();
  renderer?.render(scene, camera);
  labelRenderer?.render(scene, camera); // corner-numeral overlay on top of the canvas
}

function startLoop() {
  if (rafId !== null) return; // already running
  frame();
}

function stopLoop() {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}

/** Compare open. `mountEl` must already be visible (un-hidden) — reading its size before
 *  that would boot the camera at a 0×0 aspect. Lazily builds the scene on the FIRST call
 *  only; every call rebuilds the solid from the current shape/params and (re)starts the
 *  render loop. Returns false if WebGL init failed (main.js shows the platform fallback). */
export function show3D(mountEl, shapeId, params) {
  if (!booted) {
    container = mountEl;
    try {
      buildScene();
      booted = true;
    } catch (err) {
      console.error('Simatrix sim: 3D View WebGL initialisation failed.', err);
      return false;
    }
  }
  handleResize();
  rebuild3D(shapeId, params);
  startLoop();
  return true;
}

/** Compare close — stop rendering only. Scene/renderer/mesh stay alive (cheap to resume);
 *  matches Module2's own reset() semantics (clears the SOLID, never the renderer). */
export function hide3D() {
  stopLoop();
}

/** window.simAPI.resume() while Compare is still open (e.g. a whiteboard overlay closing)
 *  — restarts the render loop ONLY, no rebuild/reframe, so the student's orbit position
 *  survives. Distinct from `show3D()`, which always rebuilds (correct on a genuine Compare
 *  OPEN, wrong on a mere pause/resume within the same visit). No-op if the scene never
 *  booted (nothing to resume). */
export function resumeLoop3D() {
  if (booted) startLoop();
}

/** Reset / solid-switch outside Compare — dispose the current mesh(es), same verbatim
 *  contract `rebuild3D` itself uses. Safe to call whether or not the scene has booted yet. */
export function clear3D() {
  lastShapeId = null;
  lastParams = null;
  labeler?.clear();
  if (booted) disposeShapeGroup();
}
