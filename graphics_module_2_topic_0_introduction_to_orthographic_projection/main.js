// Orchestrator — Simatrix · Module 2, Topic 0: Introduction to Orthographic Projection.
//
// The first thing a student meets in Module 2, and it answers exactly two questions.
//
//   Step 1 — WHAT IS A VIEW? Four textbook machine parts, free orbit, and the four principal
//            directions as buttons. A view is what the object looks like from ONE direction; the
//            right-hand panel says what each direction shows and, for the two side views, which
//            side of the sheet the drawing of it goes on.
//   Step 2 — HOW IS THE DRAWING MADE? The same object drawn in first angle, one press at a time:
//            elevation, then plan, then side view, each built as construction lines → outline →
//            hidden detail → centre lines, then dimensioned in the aligned system.
//
// This file is the conductor. It owns the scene, the perspective camera + OrbitControls, the single
// disposal-safe `rebuild()` (RULES.md §3.1/§3.2/§3.3), the step controller `enterStep(n)`, the
// Step-2 stage controller `goStage(i)`, and `window.simAPI`. It owns no geometry maths, no object
// definitions, no drawing vocabulary and no step copy — those live in the leaves, which never
// import each other (RULES.md §3.6). `objectData` and `tokens` are the stateless §3.6a carve-out.
//
// THE TWO PANES ARE ONE STATE (RULES.md §3.42). In Step 2 the camera is driven BY the stage list:
// the stage being drawn names a view, and the solid turns to that view as the sheet draws it. There
// is no second control that could put the solid on the plan while the sheet inks the elevation.
//
// Every camera move is an eased flight, never a teleport (cameraRig.js), and everything collapses
// to instant under `prefers-reduced-motion` while the state still lands (RULES.md §4.13).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { OBJECTS, getObject, DEFAULT_OBJECT } from './src/objectData.js';
import { buildObject } from './src/objectRig.js';
import { buildDimensions3D } from './src/dimensions3d.js';
import { initProjectionSheet } from './src/projectionSheet.js';
import { initCameraRig } from './src/cameraRig.js';
import { initUIManager } from './src/uiManager.js';
import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tick as tickTweens, cancelAll as cancelTweens } from './src/anim.js';
import { cssColor } from './src/tokens.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let labelRenderer;
let scene;
let camera;
let controls;
let viewport;

/** The one disposal target. Every piece of per-object geometry hangs off it (RULES.md §3.3). */
let shapeGroup;

let rig = null;        // the built object: meshes + fat ink edges + the Front arrow
let dims3d = null;     // the dimension layer on the solid, for the view the camera is at
let sheet;             // the SVG first-angle drawing
let cameraRig;
let ui;
let stepper;
let onboarding;

const state = {
  objectId: DEFAULT_OBJECT,
  /** Which named direction the camera is at, or null for free orbit. */
  view: null,
  /** Index into the sheet's stage list. -1 is a blank sheet, before the first press. */
  stage: -1,
  /** The Dimensions switch: the sizes, on the solid and on the sheet alike. */
  annotations: true,
  /**
   * The Front switch: the arrow only.
   *
   * Separate from `annotations` because the two answer different questions. The dimensions say how
   * big the object is; the arrow says which face the elevation is taken from. A learner reading
   * sizes off a clean model and a learner checking which way the front is are not the same learner,
   * and neither should have to turn the other's marks on to get their own.
   */
  frontArrow: true,
  /**
   * Which side view Step 2 draws — the learner's choice, seeded from the object's textbook side.
   * Held here rather than in the sheet so a rebuild cannot silently revert it, and so the 3-D
   * pane can turn to the side the sheet is actually drawing.
   */
  sideView: getObject(DEFAULT_OBJECT).sideView,
};

/** Stage descriptors for the live object, derived by the sheet from the linework it laid out. */
let stages = [];
/** True while a stage is still drawing. The forward control is disabled for the duration, so
 *  nothing can be pressed past half-drawn (RULES.md §3.49); Back is never disabled. */
let stageBusy = false;
let stageTimer = null;

let rafId = null;
let running = false;
let lastFrameTime = 0;

const statusRegion = document.getElementById('sim-status');
function announce(message) { if (statusRegion) statusRegion.textContent = message; }

const currentObject = () => getObject(state.objectId);

/** Which camera direction a stage wants the solid turned to. */
function viewForStage(stage) {
  if (!stage) return null;
  if (stage.view === 'front') return 'front';
  if (stage.view === 'top') return 'top';
  if (stage.view === 'side') return state.sideView;
  return null;   // the dimensioning stage belongs to the sheet, not to a direction
}

// ============================================================================
// Rebuild — the single geometry pipeline
// ============================================================================

function resolution() {
  return new THREE.Vector2(
    renderer?.domElement.width || 1,
    renderer?.domElement.height || 1,
  );
}

/**
 * Free everything the last object left behind.
 *
 * DEEP traverse, not a one-level loop: the object is assembled as nested groups, and a `Group` node
 * carries no geometry, so a shallow pass frees nothing for it and exhausts the WebGL context
 * (RULES.md §3.3, ADR-042).
 */
function disposeScene() {
  dims3d?.dispose();
  dims3d = null;
  rig?.dispose();
  rig = null;
  for (const child of [...shapeGroup.children]) {
    child.traverse((o) => {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => { x.map?.dispose?.(); x.dispose?.(); });
      else if (m) { m.map?.dispose?.(); m.dispose?.(); }
    });
    shapeGroup.remove(child);
  }
}

/** Everything that changes when the object changes passes through here, in this order. */
function rebuild() {
  disposeScene();

  const data = currentObject();
  rig = buildObject(data, resolution());
  shapeGroup.add(rig.group);

  // Frame from the object's real BOX — the box rather than its bounding sphere, because each
  // principal view sees two of its three half-extents and fitting the half-diagonal would frame
  // every view for a corner none of them can see. `refreshAnnotations()` widens this to take in
  // the dimension layer a moment later; this call is what a dimension-less scene frames against.
  cameraRig.focusOn(rig.bounds);

  refreshAnnotations();

  // The sheet is a view OF this object, so it is re-laid out in the same pipeline and can never be
  // left describing the object before it (RULES.md §3.42) — including which side view it carries
  // and whether it is dimensioned, both of which are the learner's live choices.
  stages = sheet.layout(data, { sideView: state.sideView });
  sheet.setDimensions(state.annotations);
  setStage(-1, { animate: false });
}

/**
 * Re-assert everything the "Dimensions & Labels" switch and the live camera direction govern.
 *
 * ONE place, called from the rebuild and from every control that can change either input, so the
 * arrow and the dimension layer can never be left describing a view the camera has left.
 *
 *   • The FRONT ARROW shows only at the FRONT. It marks the direction the elevation is taken from;
 *     left on screen while the learner reads the solid from the top or the side, it is an
 *     instruction about a view they are not in (RULES.md §3.37 — hide a label with the thing it
 *     names).
 *   • The DIMENSION LAYER draws the set belonging to the direction the camera is at, on that face.
 *     All forty-three at once would bury the solid; the set whose plane faces the learner is the
 *     one that reads square instead of foreshortened. Free orbit keeps the front set, which is the
 *     one the topic opens on.
 */
function refreshAnnotations() {
  if (!rig) return;
  // The arrow is ATTACHED TO THE MODEL, not to the camera: it is parented inside the object's own
  // group, so it stays on the front face and turns with the part through free orbit. Its switch is
  // therefore a plain on/off, with no view to gate it against.
  rig.setFrontArrow(state.frontArrow);

  dims3d?.dispose();
  dims3d = null;
  if (!state.annotations) return;

  const view = state.view === 'top' ? 'top'
    : (state.view === 'left' || state.view === 'right') ? 'side'
      : 'front';
  const side = state.view === 'left' ? 'left' : state.view === 'right' ? 'right' : state.sideView;
  dims3d = buildDimensions3D(currentObject(), view, side, rig.localBounds, resolution());
  rig.group.add(dims3d.group);

  // Re-frame to include them. A dimension hangs a lane and a half outboard of the face it measures,
  // so framing the SOLID alone crops the overall sizes off both edges of the pane — and an overall
  // size the learner cannot see is the one thing this layer exists to show them.
  cameraRig.focusOn(new THREE.Box3().setFromObject(rig.group));
}

// ============================================================================
// Steps
// ============================================================================

function showSheet(on) {
  document.body.classList.toggle('sheet-open', on);
  // The 3D pane changes width when the sheet appears, so the renderer and the fat-line resolution
  // have to follow it (RULES.md §3.16).
  requestAnimationFrame(() => handleResize(viewport));
}

function showStageStrip(on) {
  const strip = document.getElementById('stage-strip');
  if (strip) strip.hidden = !on;
}

/**
 * Move the SCENE into a step's state. Called by the stepper, which owns the wizard chrome; this
 * function owns the camera and the geometry and nothing else.
 */
function enterStep(n) {
  clearStageTimer();
  if (n === 1) {
    showSheet(false);
    showStageStrip(false);
    flyToView(state.view, { announce: false });
    ui?.setActiveView(state.view, currentObject());
    onboarding?.spotlight('directions');
    return;
  }
  // Step 2 opens on a BLANK sheet with the elevation's construction still to come — never on the
  // finished drawing (RULES.md §3.57: a procedure opens on its given data).
  showSheet(true);
  showStageStrip(true);
  setStage(-1, { animate: false });
  flyToView('front', { announce: false });
  onboarding?.spotlight('stages');
}

// ============================================================================
// Step 2 — the staged construction
// ============================================================================

function clearStageTimer() {
  if (stageTimer) clearTimeout(stageTimer);
  stageTimer = null;
  stageBusy = false;
}

function renderStageChrome() {
  const readout = document.getElementById('stage-readout');
  const title = document.getElementById('stage-note-title');
  const body = document.getElementById('stage-note-body');
  const btnPrev = document.getElementById('stage-prev');
  const btnNext = document.getElementById('stage-next');
  const btnRestart = document.getElementById('stage-restart');

  const total = stages.length;
  const stage = state.stage >= 0 ? stages[state.stage] : null;

  if (readout) {
    readout.textContent = stage
      ? `${state.stage + 1} of ${total} · ${stage.title}`
      : `0 of ${total} · Blank sheet`;
  }
  if (title) title.textContent = stage ? stage.title : 'A blank sheet';
  if (body) {
    body.textContent = stage
      ? stage.note
      : 'Nothing has been drawn yet. Press Draw next and watch what a draughtsman actually puts on '
        + 'the paper first — it is not the object.';
  }
  if (btnPrev) btnPrev.disabled = state.stage < 0;
  if (btnNext) {
    const done = state.stage >= total - 1;
    btnNext.disabled = done || stageBusy;
    btnNext.textContent = done ? 'Drawing complete' : 'Draw next';
  }
  if (btnRestart) btnRestart.disabled = state.stage < 0;
}

/**
 * Reveal the sheet up to `index`.
 *
 * Forward animates and turns the solid to the view being drawn; backward lands instantly and moves
 * no camera — a Back that replays the drawing is a Back the learner cannot use to re-read the thing
 * they just missed (RULES.md §3.49).
 */
function setStage(index, { animate = true } = {}) {
  clearStageTimer();
  const total = stages.length;
  const next = Math.max(-1, Math.min(index, total - 1));
  const forward = next > state.stage;
  state.stage = next;

  const duration = sheet.revealTo(next, animate && forward);

  // BOTH DIRECTIONS turn the solid. The sheet is a view OF the object, so a stage names one
  // viewing direction and both panes have to be showing it — otherwise pressing Previous walks
  // the drawing back to the elevation while the solid stays square-on to the side view, and the
  // two halves of the screen are describing different stages (RULES.md §3.42).
  //
  // Only the DRAWING refuses to replay on the way back (§3.49): the camera still flies, because a
  // teleport is the one thing this topic's camera must never do, and because the flight is what
  // tells the learner the solid has turned.
  //
  // Step 2 ONLY. `rebuild()` calls this to blank the sheet, and a rebuild happens at boot and on
  // reset while Step 1 is on screen — where the learner is meant to arrive in free orbit with no
  // direction latched. Without the guard, loading the page silently parked the camera on Front.
  const stage = next >= 0 ? stages[next] : null;
  if (stepper?.step() === 2) {
    const want = viewForStage(stage) ?? (next < 0 ? 'front' : null);
    if (want && want !== state.view) flyToView(want, { announce: false });
  }

  if (duration > 0) {
    stageBusy = true;
    stageTimer = setTimeout(() => { stageBusy = false; stageTimer = null; renderStageChrome(); }, duration);
  }
  renderStageChrome();
  if (stage) announce(`${stage.title}. ${stage.note}`);
}

// ============================================================================
// Camera
// ============================================================================

/** Fly to a named principal direction, or to the pictorial home when `key` is null. */
function flyToView(key, { announce: say = true } = {}) {
  state.view = key ?? null;
  const data = currentObject();
  ui?.setActiveView(state.view, data);
  // BEFORE the flight: this swaps the dimension set to the new view and re-frames for it, and the
  // flight has to be aimed at the framing it will land in, not the one it is leaving.
  refreshAnnotations();
  cameraRig.flyToNamed(key ?? 'pictorial');
  if (say) {
    announce(state.view
      ? `${data.viewNotes[state.view]}`
      : 'Free orbit. Drag to turn the object.');
  }
}

/** A hand on the orbit control leaves every named direction behind, and the panel has to say so. */
function noteFreeOrbit() {
  if (cameraRig.isFlying()) return;
  // A drag on a square-on view gives the depth back over the first third of a second, rather than
  // snapping the projection (RULES.md 5.18).
  cameraRig.releaseOnDrag();
  if (state.view === null) return;
  state.view = null;
  ui?.setActiveView(null, currentObject());
  refreshAnnotations();
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(42, (w || 1) / (h || 1), 0.1, 400);
  camera.position.set(-8, 6, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false;
  container.appendChild(renderer.domElement);

  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild();
    enterStep(stepper?.step() ?? 1);
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Flat CAD lighting — ambient fill + one low directional, no shadows, no PBR (RULES.md §3.24).
  scene.add(new THREE.AmbientLight(0xffffff, 0.86));
  const key = new THREE.DirectionalLight(0xffffff, 0.52);
  key.position.set(-6, 9, 7);
  scene.add(key);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // CSS2D overlay for the Front arrow's label — a live DOM node, vector-sharp and readable by a
  // screen reader (RULES.md §3.27). Transparent and pointer-events off, so a drag-to-orbit passes
  // straight through it.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 90;
  // A DRAG leaves the named direction. A ZOOM DOES NOT.
  //
  // OrbitControls fires its own `start` for the wheel as well as for a drag, and listening to that
  // meant every scroll in a principal view was treated as the learner turning the object: the
  // projection was handed back to perspective mid-gesture, the dimension set swapped to the free-
  // orbit one and the frame was recomputed around it — three changes at once, under a pointer the
  // learner had only rolled. That is the jump. Scrolling is a request to look CLOSER at the view
  // they are in, so it must leave the direction, the projection and the dimension set alone and
  // change nothing but the zoom, which OrbitControls already does about `controls.target`.
  //
  // A drag is detected as movement while exactly ONE pointer is down: a click that never moves is
  // not a turn, and a two-finger pinch is a zoom, not a turn.
  let pointersDown = 0;
  let dragFrom = null;
  const dropPointer = () => { pointersDown = Math.max(0, pointersDown - 1); dragFrom = null; };
  renderer.domElement.addEventListener('pointerdown', (e) => {
    pointersDown += 1;
    dragFrom = pointersDown === 1 ? { x: e.clientX, y: e.clientY } : null;
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!dragFrom || pointersDown !== 1) return;
    if (Math.hypot(e.clientX - dragFrom.x, e.clientY - dragFrom.y) < 3) return;
    dragFrom = null;
    noteFreeOrbit();
  });
  renderer.domElement.addEventListener('pointerup', dropPointer);
  renderer.domElement.addEventListener('pointercancel', dropPointer);
  controls.update();
}

function showContextLostNotice(on) {
  const el = document.getElementById('sim-context-lost');
  if (el) el.hidden = !on;
}

/** Clear index.html's boot watchdog: the sim is up, so the fallback must never appear. */
function markBooted() {
  window.__simBooted = true;
  if (window.__simBootTimer) { clearTimeout(window.__simBootTimer); window.__simBootTimer = null; }
  const fallback = document.getElementById('sim-fallback');
  if (fallback) fallback.hidden = true;
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);
  if (!cameraRig.isFlying()) controls.update();
  // Last word on the projection before the draw: stamps the ortho<->perspective blend when one is
  // live, so a principal view lands genuinely orthographic (RULES.md 5.18).
  cameraRig.update();

  const cam = cameraRig.activeCamera();
  renderer.render(scene, cam);
  labelRenderer.render(scene, cam);
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0;
  rafId = requestAnimationFrame(animate);
}

function stopLoop() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(rafId);
  rafId = null;
}

// ============================================================================
// Resize
// ============================================================================

/**
 * Size everything from the CANVAS's own laid-out box, not from `#sim-viewport`.
 *
 * On Step 2 the viewport becomes a two-column grid and the canvas is only the FIRST column, so
 * measuring the container hands the camera an aspect ratio that includes the drawing sheet. The
 * scene then renders stretched — and a stretched orthographic view draws a round hole as an
 * ellipse, which is the one thing this topic must never do.
 */
function handleResize(container) {
  if (!container || !renderer) return;
  const canvas = renderer.domElement;
  const w = canvas.clientWidth || container.clientWidth;
  const h = canvas.clientHeight || container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  cameraRig?.resize();
  renderer.setSize(w, h, false);
  labelRenderer?.setSize(w, h);
  // Fat lines are screen-space: their resolution must track the drawing buffer (RULES.md §3.16).
  rig?.setResolution(canvas.width, canvas.height);
  dims3d?.setResolution(canvas.width, canvas.height);
  // The sheet's line weights are pixel widths divided by its fit scale, and the fit scale moves
  // with the pane (RULES.md §3.16's reasoning, applied to SVG rather than to a fat-line material).
  sheet?.syncInkScale();
}

// ============================================================================
// Chrome: mobile advisory, wizard toggle, reset confirm
// ============================================================================

function setupMobileNotice() {
  const notice = document.getElementById('mobile-notice');
  const dismiss = document.getElementById('mobile-notice-dismiss');
  if (!notice || !dismiss) return;
  const mq = window.matchMedia('(max-width: 767px)');
  let dismissed = false;
  const sync = () => {
    notice.hidden = !mq.matches || dismissed;
    // The banner is fixed-position, so it must RESERVE its height or it paints over the sheet's
    // own controls (RULES.md §3.64).
    document.body.classList.toggle('notice-up', !notice.hidden);
  };
  dismiss.addEventListener('click', () => { dismissed = true; sync(); });
  mq.addEventListener('change', sync);
  sync();
}

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');
    requestAnimationFrame(() => handleResize(viewport));
  });
}

/** The ghost Reset is guarded by an inline two-state confirm (RULES.md §4.19); only "Yes" wipes,
 *  and it wipes through `simAPI.reset()` — the single reset path (§2.9). */
function setupResetControl() {
  const control = document.getElementById('reset-control');
  const btnReset = document.getElementById('btn-reset');
  const confirm = document.getElementById('reset-confirm');
  const btnYes = document.getElementById('btn-reset-yes');
  const btnCancel = document.getElementById('btn-reset-cancel');
  const nav = document.querySelector('.card__nav');
  if (!btnReset || !confirm) return;

  const arm = (on) => {
    btnReset.hidden = on;
    confirm.hidden = !on;
    nav?.classList.toggle('is-reset-armed', on);
    control?.classList.toggle('is-armed', on);
  };
  btnReset.addEventListener('click', () => arm(true));
  btnCancel?.addEventListener('click', () => arm(false));
  btnYes?.addEventListener('click', () => { arm(false); window.simAPI.reset(); });
}

function setupStageControls() {
  document.getElementById('stage-next')?.addEventListener('click', () => {
    if (stageBusy) return;
    setStage(state.stage + 1);
  });
  document.getElementById('stage-prev')?.addEventListener('click', () => {
    setStage(state.stage - 1, { animate: false });
  });
  document.getElementById('stage-restart')?.addEventListener('click', () => {
    setStage(-1, { animate: false });
  });
}

/**
 * Re-lay the sheet out and rewind it, without rebuilding the 3-D object.
 *
 * Used by the ONE control that changes what the drawing IS — the side-view choice. It changes the
 * stage list, so the reveal has to go back to blank paper: a half-drawn sheet whose stage list has
 * just changed under it is indexing into a list that no longer describes what is on screen.
 *
 * The dimension switch deliberately does NOT come through here. It changes only what is VISIBLE,
 * so it must not cost the learner their place in the construction.
 */
function relayoutSheet() {
  stages = sheet.layout(currentObject(), { sideView: state.sideView });
  sheet.setDimensions(state.annotations);
  setStage(-1, { animate: false });
}

// ============================================================================
// Platform API — exactly pause / resume / reset (RULES.md §2.8).
// ============================================================================

window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    clearStageTimer();
    cameraRig.cancel();

    state.objectId = OBJECTS[0].id;
    state.stage = -1;
    state.annotations = true;
    state.frontArrow = true;
    state.sideView = getObject(OBJECTS[0].id).sideView;

    rebuild();
    // After the rebuild, not before: rebuild() blanks the sheet, and on Step 2 that moves the
    // camera. Reset ends in free orbit, so the direction is cleared once nothing else will set it.
    state.view = null;
    ui.setObject(currentObject());
    ui.setAnnotations(state.annotations);
    ui.setFrontArrow(state.frontArrow);
    ui.setSideView(state.sideView);
    ui.setActiveView(null, currentObject());
    cameraRig.snapTo(cameraRig.pose('pictorial'));
    stepper?.reset();          // wizard + scene back to Step 1, which re-enters the scene state
    announce('Simulation reset.');
  },
};

// ============================================================================
// The controller injected into the leaf modules.
// ============================================================================

const simController = {
  enterStep,
  announce,

  /** Choosing an object replaces the whole geometry set AND the whole drawing, so it rebuilds. */
  selectObject(id) {
    if (id === state.objectId) return;
    state.objectId = getObject(id).id;
    // Each object comes with the side view its textbook figure carries; that is the choice the
    // learner is offered as the default, not one inherited from the object before it.
    state.sideView = currentObject().sideView;
    rebuild();
    const data = currentObject();
    ui.setObject(data);
    ui.setSideView(state.sideView);
    ui.setActiveView(state.view, data);
    enterStep(stepper?.step() ?? 1);
    announce(`${data.name} selected. ${data.blurb}`);
  },

  /**
   * The Dimensions switch: the 3-D Front arrow and the sheet's sizes, together.
   *
   * Visibility only — no relayout, no rewind. It can be thrown at any moment, including in the
   * middle of a construction, and the drawing stays exactly where the learner left it.
   */
  /** The Dimensions switch: the sizes, on the solid and on the sheet together. */
  setAnnotations(on) {
    if (state.annotations === on) return;
    state.annotations = on;
    refreshAnnotations();
    sheet.setDimensions(on);
    ui?.setAnnotations(on);
    announce(on ? 'Dimensions shown.' : 'Dimensions hidden.');
  },

  /** The Front switch: the arrow alone. */
  setFrontArrow(on) {
    if (state.frontArrow === on) return;
    state.frontArrow = on;
    refreshAnnotations();
    ui?.setFrontArrow(on);
    announce(on ? 'Front arrow shown.' : 'Front arrow hidden.');
  },

  /** Step 2's side-view choice. Only the drawing changes; the object does not. */
  setSideView(key) {
    if (state.sideView === key) return;
    state.sideView = key;
    relayoutSheet();
    flyToView('front', { announce: false });
    announce(`The drawing will carry the ${key} side view, drawn on the `
      + `${key === 'right' ? 'left' : 'right'}.`);
  },

  flyToView,
};

// ============================================================================
// Self-start
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container;

  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  try {
    cameraRig = initCameraRig({
      camera,
      controls,
      prefersReducedMotion,
      // Same box the renderer is sized to — the canvas's own, not the grid's (see handleResize).
      aspect: () => {
        const c = renderer.domElement;
        const w = c.clientWidth || container.clientWidth;
        const h = c.clientHeight || container.clientHeight;
        return h ? w / h : 1;
      },
    });
    sheet = initProjectionSheet(document.getElementById('proj-sheet-stage'), { prefersReducedMotion });
    ui = initUIManager(simController);

    rebuild();
    ui.setObject(currentObject());
    ui.setAnnotations(state.annotations);
    ui.setFrontArrow(state.frontArrow);
    ui.setSideView(state.sideView);
    ui.setActiveView(null, currentObject());
    cameraRig.snapTo(cameraRig.pose('pictorial'));

    setupMobileNotice();
    setupWizardToggle();
    setupResetControl();
    setupStageControls();
    initTerms();
    onboarding = initOnboarding(controls);
    onboarding.setSolidPresent?.(true);   // an object exists from the very first step

    stepper = initStepper(simController); // drives enterStep(1) on init

    new ResizeObserver(() => handleResize(container)).observe(container);
    startLoop();
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  markBooted();
}

init();
