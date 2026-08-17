// Orchestrator (Module 1 Topic 2 — Spatial Framework: Quadrants + First-angle).
//
// See ../CLAUDE.md. Boots an orbitable Three.js scene, the full platform contract
// (rebuild() pipeline, disposal contract, window.simAPI), the guided-step wizard
// (stepper.js driving the 5-step spatialSteps.js sequence), and the 3D lesson
// content on Module 2's orchestrator pattern (ADR-007, ADR-033): the HP/VP plane
// pair (hvPlanes.js), the point + its projections (point.js), the step-5
// two-frustum illustration (frustums.js), the CSS2D label layer (labelLayer.js —
// HP/VP + X/Y fold-line callouts, P/p/p′ chips, the I–IV quadrant numerals, the
// BIS first-angle symbol behind currentView.showSymbol), the cinematic step-4
// rabatment (anim.js easeFold tween hinging every riding leaf at once), the
// camera pose flights (easeCamera, per quadrant/step), the glossary popovers
// (terms.js — the #term-pop singleton), and the Point P controls (uiManager.js —
// HP/VP distance sliders, two-way sync).
//
// World axes (engineering-correct, the Module-1 family convention — see
// Module1/CLAUDE.md §"3D scene conventions"):
//   HP = XZ plane (y = 0) · VP = XY plane (z = 0) · fold line = X axis
// spatialData.resolvePosition() returns DATA-SPACE signed mm (x = ±distVP,
// y = ±distHP); worldPosition() below remaps them onto these world axes — the same
// data-space → draw-space split the legacy Points/quadrants/firstangle draw3D used.
//
// Layering rule (ADR-007 / RULES.md §3.6): main.js is the orchestrator and the ONLY
// place leaf modules meet.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { QuadrantType, defaultSpatialData, resolvePosition } from './spatialData.js';
import { DEFAULT_VIEW } from './spatialSteps.js';
import { initStepper } from './stepper.js';
import { initTerms } from './terms.js';
import { initUIManager } from './uiManager.js';
import { createHvPlanes } from './hvPlanes.js';
import { createPointRig } from './point.js';
import { createFrustums } from './frustums.js';
import { createLabelLayer } from './labelLayer.js';
import { tween, tick as tickTweens, cancelAll as cancelTweens, easeFold, easeCamera, easeStandard, easeDraw } from './anim.js';

// ============================================================================
// Token access — colours come from CSS custom properties, never hard-coded
// (RULES.md §4.1; the root DESIGN.md token table is the single runtime source).
// ============================================================================

const rootStyle = getComputedStyle(document.documentElement);
const cssColor = (name) => new THREE.Color(rootStyle.getPropertyValue(name).trim());

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Named camera poses, one per teaching vantage. Every pose keeps camera.x < 0 — the
 *  vantage lives off the 'X' end of the fold line (the 'X' end mark is at x = −4.85 in
 *  labelLayer.js) — and looks back across the corner toward +X. `default` frames the
 *  whole 9×9 pair from the Q1 side (restored by simAPI.reset()); `showcase` (step 5)
 *  pulls back to hold both frustums and all four extended sheets.
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
  default:  { position: new THREE.Vector3(-8.4, 5.6, 8.4),  target: new THREE.Vector3(0, 0.6, 0.8) },
  Q1:       { position: new THREE.Vector3(-8, 4.9, 8),      target: new THREE.Vector3(0, 1.2, 1.5) },
  Q2:       { position: new THREE.Vector3(-8, 4.9, -8),     target: new THREE.Vector3(0, 1.2, -1.5) },
  Q3:       { position: new THREE.Vector3(-8, -4.9, -8),    target: new THREE.Vector3(0, -1.5, -1.8) },
  Q4:       { position: new THREE.Vector3(-8, -4.9, 8),     target: new THREE.Vector3(0, -1.4, 1.6) },
  showcase: { position: new THREE.Vector3(-13.5, 6.5, 13.5), target: new THREE.Vector3(0, 0, 0) },
};

/** The default pose IS the table's `default` entry — resetCamera() and the
 *  flyCamera pose-equality guard share one truth. */
const DEFAULT_CAMERA_POSITION = CAMERA_POSE.default.position;
const DEFAULT_CAMERA_TARGET = CAMERA_POSE.default.target;

/** Camera flight duration (Module 2's CAMERA_MOVE_MS), on the easeCamera curve. */
const CAMERA_MOVE_MS = 900;

/** Data-space mm → world units (the legacy toW: ÷ 10 — a 20 mm distance is 2.0
 *  world units against the 9-unit plane sheets). */
const MM_TO_WORLD = 0.1;

/** The step-4 rabatment swing: 90° about the X fold line, 1600 ms on the heavy
 *  "physical hinge" curve (anim.js easeFold). Under prefers-reduced-motion the
 *  tween lands on its end value immediately (anim.js), so the fold still SNAPS —
 *  RULES.md §4.13 — with no second code path here. */
const FOLD_ANGLE = Math.PI / 2;
const FOLD_MS = 1600;

// ── Dual-camera "flatten to 2D" (ported from Module2/src/main.js) ──────────────
// The step-4 fold is BOTH a physical hinge (the HP swings flat) AND a camera event:
// the view swoops to a square-on framing of the folded layout and its projection
// morphs perspective → orthographic, so the corner reads as a true flat engineering
// drawing (front view above the XY line, top view below). Reversing glides back to
// the 3D perspective orbit. See swoopToAnswerSheet / restorePerspective / engageOrtho.
/** Ortho frustum half-height at zoom 1 (Module2's ORTHO_FRUSTUM). Per-view fitting
 *  drives camera.zoom thereafter. */
const ORTHO_FRUSTUM = 5;
/** How far back the ortho camera parks for the top-down/square-on framing. Distance is
 *  irrelevant to an orthographic image (zoom sets the scale); a large standoff only keeps
 *  the whole scene inside the near/far planes. */
const ORTHO_STANDOFF = 40;
/** The flattened first-angle sheet lies in the VP plane (z ≈ 0): the wall above the XY
 *  line, the folded-down floor below it. So the "answer sheet" is read FRONT-ON — look
 *  along −Z with +Y up — not top-down (unlike Module2, whose planes fold onto the floor). */
const FLAT_VIEW_DIR = new THREE.Vector3(0, 0, 1);
const FLAT_VIEW_UP = new THREE.Vector3(0, 1, 0);
/** Half-extent (world units) of the flat drawing the ortho camera frames — a touch beyond
 *  the 9-unit sheets (HALF = 4.5) so borders + chips clear the viewport edge. */
const ANSWER_SHEET_HALF = 5.4;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;
let viewport;

/** The hybrid second camera (Module2 pattern): the PerspectiveCamera above is the
 *  default free-orbit 3D view; this OrthographicCamera drives the step-4 "flatten to
 *  2D" answer sheet, where parallel projection is the engineering-correct way to read
 *  the folded layout square-on. Each camera keeps its own OrbitControls; only the
 *  active one is enabled so they never both consume pointer events. */
let orthoCamera;
let controlsOrtho;

/** The camera/controls currently driving the render loop — the perspective pair by
 *  default, the ortho pair while the 2D drawing is on screen. Swapped by the swoop /
 *  restore; forced back to perspective on reset. */
let activeCamera;
let activeControls;

/** CSS2D overlay renderer for the label layer — walks the same scene graph as the
 *  WebGL renderer, painting each CSS2DObject's DOM node at its projected point. */
let labelRenderer;

/** Holds all topic content. The disposal contract clears this group every rebuild
 *  (ADR-004) — currently empty; future leaf modules (e.g. a quadrant-planes module,
 *  a point module) populate it from here. */
let contentGroup;

let rafId = null;
let running = false;

// --- Topic state: the single bag of numbers + flags rebuild() consumes ---

/** The point being positioned (spatialData.js). Mutated ONLY via commit(). */
let currentData = defaultSpatialData();

/** The active step's viewport flags, merged over DEFAULT_VIEW by applyView().
 *  The stepper is the only writer; the geometry leaves are the readers. */
let currentView = { ...DEFAULT_VIEW };

/** Whether HP is folded down flat (the step-4 rabatment). Flips synchronously in
 *  fold()/unfold() — the stepper's done-gate reads it right after the call — while
 *  foldAngle below animates toward the matching pose.
 *  DELIBERATE DIVERGENCE on step 5: its foldPose 'open' drives the hinge back to
 *  0 while `folded` stays true, so the illustration shows the open 3D corner
 *  without un-doing step 4 (its rail ✓ survives the 4→5→4 round trip, and only
 *  step 4's done-gate reads this flag — it WANTS the stale true). */
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

/** In-flight camera-flight tween handle (anim.js), or null. A user drag cancels
 *  it (see the controls 'start' listener) so orbiting always wins mid-flight.
 *  Shared by flyCamera / swoopToAnswerSheet / restorePerspective — mutually exclusive
 *  camera moves, so a new one always cancels the last. */
let cameraTween = null;

/** Ortho↔perspective projection-morph factor 0..1 (eased by the swoop / restore
 *  tweens), or null when no morph is live. Stamped onto the ortho camera each frame by
 *  applyProjectionMorph so the projection TYPE cross-fades instead of cutting. */
let projectionMorphK = null;

/** The geometry leaves' controller handles ({ group, setFoldAngle, setResolution,
 *  dispose }), rebuilt by rebuild(), or null while their view flags are off. */
let hvPlanes = null;
let pointRig = null;
let frustums = null;

/** The CSS2D label leaf's handle (same controller shape + generate/clear). Always
 *  rebuilt — even with every flag off — so the BIS badge's visibility tracks the
 *  view on every path. */
let labelLayer = null;

// ── Transition fades (the intro / cross-fade polish) ───────────────────────────
// The single rebuild() pipeline swaps whole leaves atomically, so a step change would
// otherwise POP the new geometry in and the old geometry out. These smooth it:
//   • fadeState  drives newly-shown leaves UP from opacity 0 (intro / cross-fade IN),
//   • the fade-out graveyard dissolves an OUTGOING leaf and disposes it after.
// Both run ONLY on step transitions (applyView) — never on slider commit()s — and are
// re-applied after every rebuild so a rebuild mid-fade never snaps a fading leaf.

/** The last view actually applied by applyView(), for detecting what changed between
 *  steps (planes newly shown / grown, the point ↔ frustum swap). Seeded to the all-off
 *  DEFAULT_VIEW so the very first applyView fades the planes in on boot. */
let prevAppliedView = { ...DEFAULT_VIEW };

/** Per-leaf opacity multipliers (0 = invisible, 1 = the leaf's own target opacities),
 *  driven by the fade tweens and re-stamped after every rebuild() (see applyFadeLevels).
 *  `leaf` reads the LIVE module handle so a rebuilt leaf keeps fading seamlessly — the
 *  same indirection driveFold uses with hvPlanes?.setFoldAngle. */
const fadeState = {
  planes:   { k: 1, tween: null, leaf: () => hvPlanes },
  frustums: { k: 1, tween: null, leaf: () => frustums },
  point:    { k: 1, tween: null, leaf: () => pointRig },
};

/** The four-rooms EXTENSION fade — the beyond-fold sheet regions grow IN (Step 1→2)
 *  and shrink OUT (Step 2→1) INDEPENDENTLY of the always-present room-corner, so a
 *  grow/shrink never re-fades or double-draws the shared Quadrant-I corner. Because the
 *  extension geometry is ALWAYS built (hvPlanes.js), there is no steal-to-graveyard for
 *  planes and no outgoing leaf to Z-fight the incoming half-sheets. Re-stamped onto a
 *  rebuilt leaf by applyFadeLevels, and hvPlanes is read LIVE each tween frame so a
 *  rebuild mid-fade keeps animating the new instance. `k`: 1 = four rooms, 0 = corner. */
const planesExt = { k: 0, tween: null };

/** Outgoing leaves mid-dissolve: stolen out of contentGroup into this holder BEFORE a
 *  rebuild (so disposeContent() skips them), faded to 0, then physically disposed. The
 *  holder is ALWAYS eventually emptied — on fade completion, at the start of the next
 *  transition, and on reset — so GL resources never accumulate (ADR-004 flat at rest). */
let fadeOutGroup = null;
let fadeOutMembers = [];
let fadeOutTween = null;

/** Delta-time clock for the render loop (drives anim.js tickTweens). */
let lastFrameTime = 0;

/** The stepper controller handle ({ sync, reset, dispose }), set in init(). */
let stepper = null;

/** The parameter dock handle ({ sync, dispose }, uiManager.js), set in init().
 *  Re-synced after every commit / view change so the dock, the wizard's own
 *  controls, and the scene always show the same state. */
let ui = null;

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
 * Show a brief, calm success toast over the viewport — the "lesson complete" win
 * (Module 2 pattern, ported from the Topic 1 sibling). Token-driven success
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
  // Platform iframe contract (ADR-078): announce a displayable sim to the host loader.
  // Gated on document.fonts.ready so the host never reveals us mid-FOUT.
  document.fonts.ready.then(() => {
    window.parent.postMessage({ type: 'sim:ready' }, '*');
  });
}

/**
 * Signal lesson completion to the host (ADR-078 addendum, revised): the learner
 * clicked "Finish lesson" at the terminal step. Fires on every call, no latch —
 * the host confirmed it supports repeated sim:complete triggers, so replaying the
 * signal is expected, not a bug.
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

  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 100);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
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

  // A user drag mid-flight cancels the camera tween — the learner's hand wins
  // instead of being eaten by the lerp. The FOLD tween is deliberately left
  // alone: orbiting during the rabatment is encouraged.
  controls.addEventListener('start', () => {
    cameraTween?.cancel();
    cameraTween = null;
  });

  // The ortho camera for the flatten-to-2D answer sheet (Module2 hybrid pattern).
  // Frustum sized from the aspect now; per-view fitting drives camera.zoom thereafter.
  // It shares the canvas with a second OrbitControls, disabled until the 2D drawing is
  // on screen so only one control set consumes pointer events at a time.
  const aspect = (w || 1) / (h || 1);
  orthoCamera = new THREE.OrthographicCamera(
    -ORTHO_FRUSTUM * aspect, ORTHO_FRUSTUM * aspect, ORTHO_FRUSTUM, -ORTHO_FRUSTUM, 0.1, 100);
  orthoCamera.position.copy(DEFAULT_CAMERA_POSITION);

  controlsOrtho = new OrbitControls(orthoCamera, renderer.domElement);
  controlsOrtho.target.copy(DEFAULT_CAMERA_TARGET);
  controlsOrtho.enableDamping = !prefersReducedMotion;
  controlsOrtho.dampingFactor = 0.08;
  controlsOrtho.enabled = false;       // perspective is the default active pair
  controlsOrtho.enableRotate = false;  // the 2D drawing is read square-on; orbiting it would
                                       // shear the flat layout with no depth cue to anchor it.
                                       // Pan + zoom stay on so the learner can inspect it.
  controlsOrtho.update();

  // An attempted ORBIT on the rotate-locked ortho pair fires no OrbitControls event at all —
  // catch the pointerdown itself and nudge the "Unfold back to 3D" button (the one control
  // that leaves the flat answer sheet here), so the learner reads "unfold to orbit" instead
  // of a dead drag.
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || activeCamera !== orthoCamera) return;
    cueOrthoLock();
  });

  // Start in free-orbit perspective.
  activeCamera = camera;
  activeControls = controls;

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
// from the state (labelLayer.generate also drives the BIS badge, showSymbol).
// ============================================================================

/** Remap spatialData's resolved DATA-SPACE signed mm onto world axes + scale:
 *  height (±distHP) → Y, depth in front of VP (±distVP) → Z, lateral → X (always 0
 *  in this topic — the point sits on the profile mid-plane). */
function worldPosition(data) {
  const pos = resolvePosition(data);
  return { x: 0, y: pos.y * MM_TO_WORLD, z: pos.x * MM_TO_WORLD };
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
  frustums?.dispose();
  frustums = null;
  labelLayer?.dispose();
  labelLayer = null;
  contentGroup.clear();
}

function rebuild() {
  disposeContent();
  const { width, height } = viewportSize();

  if (currentView.showHP || currentView.showVP) {
    hvPlanes = createHvPlanes({
      showHP: currentView.showHP,
      showVP: currentView.showVP,
      extended: currentView.showQuad, // step 2: sheets continue past the fold line
      foldAngle,
      width, height,
    });
    contentGroup.add(hvPlanes.group);
  }

  if (currentView.showPoint) {
    pointRig = createPointRig({
      position: worldPosition(currentData),
      showProjections: currentView.showProjections,
      foldAngle,
      width, height,
    });
    contentGroup.add(pointRig.group);
  }

  if (currentView.showFrustums) {
    frustums = createFrustums({ foldAngle, width, height });
    contentGroup.add(frustums.group);
  }

  // The CSS2D name layer — built unconditionally (an all-flags-off view yields an
  // empty group) so the BIS badge's visibility always tracks currentView.showSymbol,
  // whichever path triggered the rebuild.
  labelLayer = createLabelLayer({ width, height });
  labelLayer.generate({
    view: currentView,
    position: worldPosition(currentData),
    quadrant: currentData.quadrant,
    foldAngle,
  });
  contentGroup.add(labelLayer.group);

  // Re-stamp any in-progress fade onto the fresh leaves, so a rebuild mid-fade (a
  // slider commit, the fonts-ready repaint) inherits the fade instead of popping to
  // full. At rest every k is 1, so this applies each leaf's designed opacity.
  applyFadeLevels();
}

/** Merge a partial change into the point data and re-derive the scene — the one
 *  write path for currentData (controls never touch the scene, RULES.md §3.2).
 *  Both control surfaces re-sync AFTERWARD from the settled state, so the dock's
 *  sliders/select and the wizard's quadrant buttons can never disagree no matter
 *  which of them (or which step pin) drove the commit. Each sync only redraws
 *  its own chrome — no writes, so no loop. */
function commit(patch) {
  currentData = { ...currentData, ...patch };
  rebuild();
  ui?.sync();
  stepper?.sync();
}

// ============================================================================
// simController — the injected contract every leaf module receives (ADR-007).
// stepper.js (the wizard) and uiManager.js (the parameter dock) both consume
// this same object. Keep it the ONE surface between leaves and the orchestrator.
// ============================================================================

const simController = {
  announce,
  showToast,
  markComplete,

  /** Read-only snapshots — leaves never hold live references to the state. */
  getData: () => ({ ...currentData }),
  getView: () => ({ ...currentView }),
  isFolded: () => folded,

  commit,

  /** Step 2's room-to-room walk. Ignores unknown quadrant keys. The camera flies
   *  to the room's pose here — NOT in commit(), which the sliders drive
   *  continuously and must never trigger a flight. */
  setQuadrant(q) {
    if (!QuadrantType[q]) return;
    commit({ quadrant: q });
    flyCamera(CAMERA_POSE[q]);
  },

  /** The stepper pushes each step's viewport flags through here. A step that pins
   *  a quadrant (steps 3–5 pin Q1) also re-homes the point data so the scene and
   *  the read-out agree; then the hinge is driven toward the step's pose and the
   *  camera flies to its vantage. The dock re-syncs last: its enabled/hidden
   *  states follow the view flags (showPoint). */
  applyView(stepView) {
    const prevView = prevAppliedView;
    currentView = { ...DEFAULT_VIEW, ...stepView };

    // Task 3 — auto-unfold on back navigation. A pre-fold step (foldPose 'unfolded':
    // steps 1–3) reached while still folded (the learner navigated back from step 4)
    // clears `folded`, so the shared fold-targeting below drives the hinge BACK OPEN
    // and the camera glides off the 2D answer sheet — a smooth reverse fold, never a
    // snap and never leaving the corner stuck flat.
    if (currentView.foldPose === 'unfolded' && folded) folded = false;

    if (currentView.quadrant && currentData.quadrant !== currentView.quadrant) {
      currentData = { ...currentData, quadrant: currentView.quadrant };
    }

    // Cross-fade OUT (Task 2): the primary illustration swaps between the point rig and
    // the frustums across the 4↔5 boundary. Steal whichever is LEAVING into the fade-out
    // holder BEFORE rebuild() (so disposeContent skips it) and dissolve it below. Bound
    // the holder to one transition — flush any still-dissolving leftovers first.
    if (fadeOutMembers.length) flushFadeOut();
    if (prevView.showPoint && !currentView.showPoint && pointRig) {
      stealToFadeOut(pointRig); pointRig = null; resetFadeState('point');
    }
    if (prevView.showFrustums && !currentView.showFrustums && frustums) {
      stealToFadeOut(frustums); frustums = null; resetFadeState('frustums');
    }
    // NB: planes are NOT stolen into the graveyard on a shrink. The extension geometry
    // is always built, so Step 1↔2 grow/shrink is driven purely by fading the extension
    // opacity (fadeExtension, below) — no outgoing leaf coexists with the incoming
    // half-sheets, so the shared corner never Z-fights or double-draws (Tasks 1 + 2).
    rebuild();

    // Fold targeting: foldPose 'open' (step 5) swings the hinge back to the 3D corner
    // WITHOUT touching `folded`; every other step matches the (possibly just-cleared)
    // flag. Compare against where the hinge is HEADED (foldTarget mid-swing) so a step
    // change never restarts a tween toward its own destination.
    const targetAngle = currentView.foldPose === 'open' ? 0 : (folded ? FOLD_ANGLE : 0);
    const effective = foldTween ? foldTarget : foldAngle;
    const willFold = targetAngle !== effective;
    if (willFold) driveFold(targetAngle);

    // Cross-fade IN (Tasks 1 + 2): newly-shown or newly-grown content rises from 0.
    // When a fold is swinging, the fades ride the hinge's heavier easeFold over FOLD_MS
    // so plane, frustum and hinge move as ONE; otherwise a lighter easeDraw reveal.
    const folding = willFold || !!foldTween;
    const fadeMs = folding ? FOLD_MS : 560;
    const fadeEase = folding ? easeFold : easeDraw;

    // Planes: two distinct fades, never both.
    //  • FIRST APPEARANCE (boot / step 1): the whole sheet pair glides in from 0 (the
    //    extension rides this same fade if the first-shown step is already four-rooms).
    //  • ALREADY ON SCREEN: only the four-rooms EXTENSION grows in (showQuad turning on:
    //    1→2, 4→5) or shrinks out (showQuad off: 2→1/3, 5→4). The shared corner holds
    //    rock-steady, so there is no flash-in (Task 1) and no dissolve overlap (Task 2).
    const planesShown = currentView.showHP || currentView.showVP;
    const planesWereShown = prevView.showHP || prevView.showVP;
    if (planesShown && !planesWereShown && hvPlanes) {
      planesExt.tween?.cancel();
      planesExt.tween = null;
      planesExt.k = currentView.showQuad ? 1 : 0; // extension state the whole-sheet fade reveals
      hvPlanes.setExtendedOpacity(planesExt.k);
      fadeInLeaf('planes', fadeMs, fadeEase);
    } else if (planesShown && hvPlanes) {
      if (currentView.showQuad && !prevView.showQuad) fadeExtension(1, fadeMs, fadeEase);
      else if (!currentView.showQuad && prevView.showQuad) fadeExtension(0, fadeMs, fadeEase);
    }
    if (currentView.showFrustums && !prevView.showFrustums && frustums) fadeInLeaf('frustums', fadeMs, fadeEase);
    if (currentView.showPoint && !prevView.showPoint && pointRig) fadeInLeaf('point', fadeMs, fadeEase);
    startFadeOut(fadeMs, fadeEase); // dissolve the stolen outgoing leaf on the same timing

    // Camera. Is this step the flattened 2D drawing? — folded, and NOT a foldPose:'open'
    // step (step 5) that re-opens the 3D corner. If so, show the ortho answer sheet;
    // otherwise fly the perspective camera to the step's vantage (showcase > pinned room >
    // default framing), gliding UP out of the 2D drawing first if we are still in it.
    const showingFlat = folded && currentView.foldPose !== 'open';
    const targetPose = currentView.camPose === 'showcase'
      ? CAMERA_POSE.showcase
      : (currentView.quadrant ? CAMERA_POSE[currentView.quadrant] : CAMERA_POSE.default);

    if (showingFlat) {
      if (activeCamera !== orthoCamera) swoopToAnswerSheet(); // else already on the sheet
    } else if (activeCamera === orthoCamera) {
      // Leaving the 2D drawing for a 3D vantage: seed the perspective camera AT the
      // destination pose, then glide the ortho camera up onto it while the projection
      // morphs back to perspective — one seamless move (mirror of Module2's unflatten).
      camera.position.copy(targetPose.position);
      controls.target.copy(targetPose.target);
      restorePerspective(true, FOLD_MS, easeFold);
    } else {
      flyCamera(targetPose);
    }

    prevAppliedView = currentView; // record for the next transition's diff
    ui?.sync();
  },

  /** The step-4 rabatment: the heavy 90° hinge swing about the X fold line
   *  (1600 ms, anim.js easeFold — snaps under prefers-reduced-motion because the
   *  tween lands on its end value immediately). `folded` flips synchronously so
   *  the stepper's done-gate and announcement read the new state right away; the
   *  tween then drives BOTH leaves' hinges each frame via the module-level handles,
   *  so it survives a mid-swing rebuild (the fresh leaves pick up at foldAngle). */
  fold() {
    if (folded) return;
    folded = true;
    driveFold(FOLD_ANGLE);
    // …and the camera event: swoop square-on + morph perspective → orthographic, so the
    // folded corner reads as a true flat 2D engineering drawing (Task 5 / Module2 port).
    swoopToAnswerSheet();
  },
  unfold() {
    if (!folded) return;
    folded = false;
    driveFold(0);
    // Reverse: glide the ortho camera back up onto the 3D perspective orbit, morphing the
    // projection back to perspective on the fold's own timing so camera + planes rise as one.
    restorePerspective(true, FOLD_MS, easeFold);
  },
};

/** Tween the hinge from wherever it stands to `toAngle`. Duration scales with the
 *  remaining arc, so reversing a half-finished fold swings back at the same pace
 *  instead of dragging a short arc over the full 1600 ms. */
function driveFold(toAngle) {
  foldTween?.cancel();
  foldTarget = toAngle;
  const arc = Math.abs(toAngle - foldAngle) / FOLD_ANGLE;
  foldTween = tween({
    from: foldAngle,
    to: toAngle,
    duration: FOLD_MS * arc,
    ease: easeFold,
    onUpdate: (a) => {
      foldAngle = a;
      hvPlanes?.setFoldAngle(a);   // pure transforms — no rebuild while swinging
      pointRig?.setFoldAngle(a);
      frustums?.setFoldAngle(a);   // the top-view circles ride the trapdoor
      labelLayer?.setFoldAngle(a); // the HP + p labels ride the trapdoor too
    },
    onComplete: () => { foldTween = null; },
  });
}

// ============================================================================
// Transition fades — the intro / cross-fade polish (see the fadeState block).
// ============================================================================

/** Re-stamp each leaf's current fade level onto its materials. Called at the tail of
 *  rebuild() so freshly-built leaves inherit an in-progress fade rather than popping
 *  to full opacity. At rest (every k = 1) it applies each leaf's designed opacity. */
function applyFadeLevels() {
  const planes = fadeState.planes.leaf();
  planes?.setOpacity(fadeState.planes.k);
  planes?.setExtendedOpacity(planesExt.k); // the four-rooms extension rides its own fade
  fadeState.frustums.leaf()?.setOpacity(fadeState.frustums.k);
  fadeState.point.leaf()?.setOpacity(fadeState.point.k);
}

/** Fade a just-(re)built leaf UP from invisible to its own target opacities. The leaf
 *  is read live each frame, so a rebuild mid-fade keeps animating the new instance.
 *  Reduced motion snaps (the tween lands immediately — anim.js). */
function fadeInLeaf(name, duration = 560, ease = easeDraw) {
  const s = fadeState[name];
  s.tween?.cancel();
  s.k = 0;
  s.leaf()?.setOpacity(0);
  s.tween = tween({
    from: 0, to: 1, duration, ease,
    onUpdate: (k) => { s.k = k; s.leaf()?.setOpacity(k); },
    onComplete: () => { s.k = 1; s.tween = null; },
  });
}

/** Tween the plane EXTENSION opacity toward `to` (1 = four rooms, 0 = room corner) —
 *  the Step 1↔2 grow/shrink. Reads hvPlanes LIVE each frame so a rebuild mid-fade drives
 *  the fresh leaf (the extension geometry is always built, so there is nothing to snap);
 *  reduced motion lands immediately (anim.js). Starts from wherever the extension stands
 *  (already stamped onto the rebuilt leaf by applyFadeLevels), so an interrupted grow
 *  reverses smoothly instead of jumping. */
function fadeExtension(to, duration = 560, ease = easeDraw) {
  planesExt.tween?.cancel();
  planesExt.tween = tween({
    from: planesExt.k, to, duration, ease,
    onUpdate: (k) => { planesExt.k = k; hvPlanes?.setExtendedOpacity(k); },
    onComplete: () => { planesExt.k = to; planesExt.tween = null; },
  });
}

/** Drop a leaf's fade back to fully-shown (used when it is stolen into the graveyard,
 *  so a later re-appearance is not dimmed by a stale k). */
function resetFadeState(name) {
  const s = fadeState[name];
  s.tween?.cancel();
  s.tween = null;
  s.k = 1;
}

/** Move an outgoing leaf handle out of contentGroup into the fade-out holder, so the
 *  next rebuild's disposeContent() leaves it alone; it dissolves in startFadeOut() and
 *  is disposed there. The caller nulls the module handle immediately after. */
function stealToFadeOut(handle) {
  if (!handle) return;
  if (!fadeOutGroup) { fadeOutGroup = new THREE.Group(); scene.add(fadeOutGroup); }
  fadeOutGroup.add(handle.group); // reparents — removes it from contentGroup
  fadeOutMembers.push(handle);
}

/** Dispose every leaf in the fade-out holder immediately (no fade). The belt-and-braces
 *  path keeping GL flat when a dissolve is interrupted — a reset, or a new transition
 *  starting before the last one's fade finished. */
function flushFadeOut() {
  fadeOutTween?.cancel();
  fadeOutTween = null;
  for (const h of fadeOutMembers) h.dispose();
  fadeOutMembers = [];
  if (fadeOutGroup) { scene.remove(fadeOutGroup); fadeOutGroup = null; }
}

/** Dissolve whatever was stolen into the holder from full to invisible, then dispose it
 *  (onComplete). No-op when nothing was stolen. Matched to the incoming fade's timing so
 *  the swap reads as one cross-fade. */
function startFadeOut(duration = 560, ease = easeDraw) {
  if (!fadeOutMembers.length) return;
  const members = fadeOutMembers.slice();
  fadeOutTween?.cancel();
  fadeOutTween = tween({
    from: 1, to: 0, duration, ease,
    onUpdate: (k) => { for (const h of members) h.setOpacity?.(k); },
    onComplete: () => { flushFadeOut(); },
  });
}

/** Glide the perspective camera to a named pose (position + target) through the
 *  anim.js tween engine. OrbitControls stays ENABLED throughout (its damping deltas are
 *  zero while untouched, and the 'start' listener above cancels the flight the moment the
 *  learner grabs the scene). Reduced motion snaps (anim.js). The pose-equality guard makes
 *  an already-arrived flight a no-op, so boot and reset never fire pointless self-tweens.
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

// ============================================================================
// Dual-camera "flatten to 2D" (ported from Module2/src/main.js) — the ortho
// answer-sheet swoop, the perspective↔ortho projection morph, and the exit glide.
// ============================================================================

/** Ortho zoom that fits a box's on-screen extent inside the current frustum, with a
 *  10% margin (Module2's fitOrthoZoom). */
function fitOrthoZoom(screenW, screenH) {
  const aspect = orthoCamera.right / orthoCamera.top; // = viewport aspect
  const halfW = Math.max((screenW / 2) * 1.1, 1e-3);
  const halfH = Math.max((screenH / 2) * 1.1, 1e-3);
  return Math.min((ORTHO_FRUSTUM * aspect) / halfW, ORTHO_FRUSTUM / halfH);
}

/** Stamp the blended ortho↔perspective projection onto the ortho camera for THIS frame.
 *  Read live each frame (after controls.update + the tween's own updateProjectionMatrix)
 *  so it is the last word on the matrix before render. At k=0 it is the pure ortho matrix
 *  the tween just rebuilt; at k=1 it equals the perspective camera's matrix exactly, so the
 *  hand-off to the real perspective camera shows no change (Module2's applyProjectionMorph). */
function applyProjectionMorph() {
  const k = projectionMorphK;
  const o = orthoCamera.projectionMatrix.elements;
  const p = camera.projectionMatrix.elements;
  for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * k;
  orthoCamera.projectionMatrixInverse.copy(orthoCamera.projectionMatrix).invert();
}

/** End any in-flight morph and restore a clean ortho matrix, so a leftover blend never
 *  bleeds into the next camera move. */
function clearProjectionMorph() {
  if (projectionMorphK === null) return;
  projectionMorphK = null;
  orthoCamera.updateProjectionMatrix();
}

/** Orbit attempted while the rotate-locked ortho camera is live (the flat answer sheet):
 *  nudge the "Unfold back to 3D" button — the one control that leaves the 2D drawing here —
 *  so the learner reads "unfold to orbit" instead of a dead drag. The reflow between
 *  remove/add restarts the animation on a repeat drag. */
function cueOrthoLock() {
  const el = document.getElementById('btn-unfold');
  if (!el || el.hidden) return;
  el.classList.remove('qv-lock-cue');
  void el.offsetWidth;
  el.classList.add('qv-lock-cue');
  setTimeout(() => el.classList.remove('qv-lock-cue'), 450);
}

/** Make the ortho camera live, seeding it ON the current perspective pose (position,
 *  target, screen-up, and a zoom whose frustum height matches the perspective frustum at
 *  this distance) and arming the perspective → ortho morph, so the following tween is a
 *  continuous move rather than a cut. Reduced motion skips the morph. (Module2's engageOrtho,
 *  minus the quick-view bookkeeping this topic has no need for.) */
function engageOrtho() {
  if (activeCamera !== orthoCamera) {
    orthoCamera.position.copy(camera.position);
    controlsOrtho.target.copy(controls.target);
    orthoCamera.up.copy(camera.up);
    const dist = camera.position.distanceTo(controls.target);
    const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    orthoCamera.zoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3);
    orthoCamera.updateProjectionMatrix();
    camera.updateProjectionMatrix();                    // morph endpoint must be current (aspect)
    projectionMorphK = prefersReducedMotion ? null : 1; // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph();
  }
  activeCamera = orthoCamera;
  activeControls = controlsOrtho;
  controls.enabled = false;
  controlsOrtho.enabled = true;
}

/** Tween a camera + its controls to a pose (position, target, and — for ortho — zoom / up).
 *  The render loop's activeControls.update() finalises damping each frame. If a morph is
 *  armed (projectionMorphK !== null on entry), drive it to 0 on the same eased curve. */
function tweenCamera(cam, ctrls, toPos, toTarget, toZoom, duration = CAMERA_MOVE_MS, ease = easeCamera, toUp) {
  const fromPos = cam.position.clone();
  const fromTarget = ctrls.target.clone();
  const fromZoom = cam.zoom ?? 1;
  const fromUp = toUp ? cam.up.clone() : null;
  const morphing = projectionMorphK !== null;
  const fromDist = morphing ? fromPos.distanceTo(fromTarget) : 0; // hold distance during the morph
  cameraTween?.cancel();
  cameraTween = tween({
    from: 0,
    to: 1,
    duration,
    ease,
    onUpdate: (t) => {
      cam.position.lerpVectors(fromPos, toPos, t);
      ctrls.target.lerpVectors(fromTarget, toTarget, t);
      if (morphing) cam.position.sub(ctrls.target).setLength(fromDist).add(ctrls.target);
      if (fromUp) cam.up.copy(fromUp).lerp(toUp, t).normalize();
      if (toZoom != null && cam.isOrthographicCamera) {
        cam.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
        cam.updateProjectionMatrix();
      }
      if (morphing) projectionMorphK = 1 - t;
    },
    onComplete: () => { cameraTween = null; if (morphing) projectionMorphK = null; },
  });
}

/** Swoop the ortho camera to a square-on framing of the flattened first-angle drawing —
 *  looking along −Z at the VP plane (front view above the XY line, folded top view below) —
 *  while the projection morphs perspective → orthographic on the same easeFold curve the
 *  hinge swings on. Seeds ortho ON the live 3D pose so frame 0 is a visual no-op, then lerps
 *  position, target and zoom together (the animated entry mirror of restorePerspective;
 *  Module2's swoopToAnswerSheet, adapted front-on for this topic's fold direction). */
function swoopToAnswerSheet() {
  const center = new THREE.Vector3(0, 0, 0);
  const toZoom = fitOrthoZoom(ANSWER_SHEET_HALF * 2, ANSWER_SHEET_HALF * 2);

  // Reduced motion, or already square-on in ortho: the plain instant engage + position tween.
  if (prefersReducedMotion || activeCamera === orthoCamera) {
    engageOrtho();
    const toPos = center.clone().addScaledVector(FLAT_VIEW_DIR, ORTHO_STANDOFF);
    tweenCamera(orthoCamera, controlsOrtho, toPos, center, toZoom, FOLD_MS, easeFold, FLAT_VIEW_UP);
    return;
  }

  // Animated entry from the perspective free-orbit view.
  cameraTween?.cancel();
  clearProjectionMorph();

  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const fromUp = camera.up.clone();
  const toUp = FLAT_VIEW_UP;
  const dist = fromPos.distanceTo(fromTarget);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fromZoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3);
  // Rotate down at the SAME distance the camera had — a pure pivot, so the lingering
  // perspective never dollies (the monotonic zoom alone settles the framing).
  const toPosAnim = center.clone().addScaledVector(FLAT_VIEW_DIR, dist);

  orthoCamera.position.copy(fromPos);
  controlsOrtho.target.copy(fromTarget);
  orthoCamera.up.copy(fromUp);
  orthoCamera.zoom = fromZoom;
  orthoCamera.updateProjectionMatrix();

  // Hand the live camera to ortho up front (seeded on the perspective pose so it is a
  // visual no-op, not a cut).
  activeCamera = orthoCamera;
  activeControls = controlsOrtho;
  controls.enabled = false;
  controlsOrtho.enabled = true;

  camera.updateProjectionMatrix(); // morph endpoint must be current (aspect may have changed)
  projectionMorphK = 1;            // start fully perspective-looking, morph to pure ortho (0)

  cameraTween = tween({
    from: 0,
    to: 1,
    duration: FOLD_MS,
    ease: easeFold, // matched to the hinge so camera and planes move as one
    onUpdate: (t) => {
      controlsOrtho.target.lerpVectors(fromTarget, center, t);
      orthoCamera.position
        .lerpVectors(fromPos, toPosAnim, t)
        .sub(controlsOrtho.target)
        .setLength(dist)
        .add(controlsOrtho.target);
      orthoCamera.up.copy(fromUp).lerp(toUp, t).normalize();
      orthoCamera.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
      orthoCamera.updateProjectionMatrix(); // pure ortho; applyProjectionMorph blends on top
      projectionMorphK = 1 - t;             // perspective(1) → ortho(0) on the same curve
    },
    onComplete: () => {
      cameraTween = null;
      projectionMorphK = null; // settled on pure ortho
    },
  });
}

/** Return to the perspective free-orbit camera. By default the swap is instant (reset). When
 *  `animate` is true (unfold, or a step navigating back to 3D) the ortho camera first GLIDES
 *  from its square-on pose onto the perspective camera's current pose while its projection
 *  matrix morphs orthographic → perspective over the SAME tween, so the hand-off lands with no
 *  projection-type cut. Reduced motion skips straight to the swap. (Module2's restorePerspective.) */
function restorePerspective(animate = false, duration = CAMERA_MOVE_MS, ease = easeStandard) {
  cameraTween?.cancel();
  cameraTween = null;
  clearProjectionMorph();

  const handOff = () => {
    activeCamera = camera;
    activeControls = controls;
    controlsOrtho.enabled = false;
    controls.enabled = true;
  };

  // Instant swap for reset / reduced motion / when already in perspective.
  if (!animate || prefersReducedMotion || activeCamera !== orthoCamera) {
    handOff();
    return;
  }

  const fromPos = orthoCamera.position.clone();
  const fromTarget = controlsOrtho.target.clone();
  const fromUp = orthoCamera.up.clone();
  const fromZoom = orthoCamera.zoom;

  const toPos = camera.position.clone();       // the perspective camera's retained (or seeded) pose
  const toTarget = controls.target.clone();
  const toUp = camera.up.clone();
  const dist = toPos.distanceTo(toTarget);
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const toZoom = ORTHO_FRUSTUM / Math.max(halfH, 1e-3);

  camera.updateProjectionMatrix(); // perspective endpoint must be current before the loop blends
  projectionMorphK = 0;            // arm the morph; the render loop stamps it each frame

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
      projectionMorphK = t;                 // orthographic → perspective on the same curve
    },
    onComplete: () => {
      cameraTween = null;
      projectionMorphK = null; // reached perspective; hand off to the real camera
      handOff();
    },
  });
}

function resetCamera() {
  camera.position.copy(DEFAULT_CAMERA_POSITION);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.update();
}

// ============================================================================
// Render loop
// ============================================================================

function animate(now) {
  rafId = requestAnimationFrame(animate);

  // Delta in ms (capped so a long pause/tab-switch doesn't jump the fold tween).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  // Step the anim.js tweens (the fold swing + camera moves) from the render loop, so
  // simAPI.pause() halts in-flight animation along with the rendering.
  tickTweens(delta);

  activeControls.update(); // damping on whichever camera pair is live (perspective or ortho)
  // Ortho↔perspective projection morph (the flatten swoop / restore glide). Stamped HERE,
  // after controls.update() and the tween's own updateProjectionMatrix(), so neither can
  // clobber the blended matrix before it renders.
  if (projectionMorphK !== null) applyProjectionMorph();
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

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;

  const aspect = w / h;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  // Keep the ortho frustum aspect-correct without disturbing the per-view fit: only
  // L/R/T/B change here, orthoCamera.zoom (set by the swoop) is preserved.
  if (orthoCamera) {
    orthoCamera.left = -ORTHO_FRUSTUM * aspect;
    orthoCamera.right = ORTHO_FRUSTUM * aspect;
    orthoCamera.top = ORTHO_FRUSTUM;
    orthoCamera.bottom = -ORTHO_FRUSTUM;
    orthoCamera.updateProjectionMatrix();
  }

  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h); // keep the CSS2D overlay tracking the canvas

  // Fat lines render the wrong thickness if LineMaterial.resolution drifts from
  // the viewport — keep every leaf's materials in sync on resize (RULES.md §3.16).
  hvPlanes?.setResolution(w, h);
  pointRig?.setResolution(w, h);
  frustums?.setResolution(w, h);
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
 * reset() restores the default camera and rebuilds — the ONE reset path the in-sim
 * Reset button must also use (RULES.md §2.9: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    currentData = defaultSpatialData();
    currentView = { ...DEFAULT_VIEW };
    prevAppliedView = { ...DEFAULT_VIEW }; // so the fresh Step 1 fades its planes in again
    folded = false;
    cancelTweens(); // drop in-flight fold + camera + fade tweens before zeroing state
    foldTween = null;
    cameraTween = null;
    // Fade state back to fully-shown; dispose any in-flight dissolve immediately so no
    // stolen leaf survives the reset (GL stays flat). The extension resets to the corner
    // (k = 0) so the fresh Step 1 grows its four rooms in again from scratch.
    for (const s of Object.values(fadeState)) { s.tween = null; s.k = 1; }
    planesExt.tween = null;
    planesExt.k = 0;
    flushFadeOut();
    foldAngle = 0;
    foldTarget = 0;
    restorePerspective(false); // instant swap back to the perspective camera + clear any morph
    resetCamera();             // instant — reset is a snap back to truth, never a flight
    rebuild();
    // Wizard back to Step 1 AFTER the state is clean — stepper.reset() only redraws
    // its own chrome and re-applies Step 1's view flags; it never touches the scene
    // directly (no second reset path, RULES.md §2.9).
    stepper?.reset();
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
    rebuild();

    // The wizard. initStepper renders Step 1 and pushes its view flags back through
    // simController.applyView() → rebuild(), so the scene and card start in sync.
    stepper = initStepper(simController);

    // The glossary popovers: one delegated wiring on #wizard survives every step
    // re-render, so this runs exactly once (no handle needed — static chrome).
    initTerms();

    // The parameter dock — AFTER the stepper, so its first sync() reads Step 1's
    // already-applied view flags and boots with the right controls disabled.
    ui = initUIManager(simController);

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
