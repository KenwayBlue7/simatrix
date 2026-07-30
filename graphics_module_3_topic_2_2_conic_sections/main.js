// Orchestrator — Simatrix Engineering Graphics · Conic Sections (Module 3, Topic 2.2).
//
// Owns the scene, the state, and the single rebuild() pipeline every change passes
// through (ADR-004). The topic teaches Chapter 6 in two halves, and the orchestrator
// carries one surface for each:
//
//   3D  — a right circular DOUBLE cone (two `cone.js` meshes sharing an apex) cut by a
//         section plane. The plane is dialled in Step 2; `sectionCut.js` (topic-1's
//         analytic clipper, ADR-058, ported verbatim) is used here as a CURVE EXTRACTOR
//         rather than as a truncator: the solid is left whole and its section loop is
//         drawn on it as a fat crimson curve with the cut face capped — the chapter's own
//         Fig. 6.2 pictorials (ADR-085).
//   2D  — the Compare sheet, where `conicEngine.js` draws the locus definition, the
//         nomenclature, and the twelve constructions (ADR-084).
//
// Layering (CLAUDE.md): leaf modules never import each other; they hang off this file.
// Both topic-local state bags — the cutting plane and the conic sheet — live HERE beside
// ShapeData, never inside it, so `src/shapeData.js` stays byte-identical to Module2
// (ADR-059 / ADR-067, applied again here).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import {
  tick as tickTweens, cancelAll as cancelTweens, tween, easeCamera, easeStandard,
} from './src/anim.js';

import { defaultShapeData, ShapeType } from './src/shapeData.js';
import {
  defaultSectionState, defaultConicState, classifySection, generatorAngleDeg,
  curveForEccentricity, methodById, defaultMethodFor,
  ConicSection, SECTION_TOUR, sectionPresetFor, BUILD_STAGES,
} from './src/conicData.js';
import { layoutFor, drawSheet } from './src/conicEngine.js';
import { cutGeometryWithPlane } from './src/sectionCut.js';
import { initUIManager } from './src/uiManager.js';
import { initProblemLibrary } from './src/problemLibrary.js';
import { createCone } from './src/cone.js';

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
// Fixed, like both sibling Module-3 topics: the cone's slider ranges are bounded so
// the largest double cone still frames, so there is no auto-zoom to fight (ADR-014's
// push-back dolly belongs to topics whose solid can outgrow the view).
// ============================================================================

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(9, 7.5, 12);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 3, 0);

/** ADR-018 declared scale for the 3D scene: 1 world unit = 10 mm. */
const WORLD_TO_MM = 10;

/**
 * Topic default state: a right circular cone, 30 mm base diameter and 30 mm axis — the
 * cone §6.1 cuts. Only the shape and the proportions are overridden, so
 * `src/shapeData.js` stays byte-identical to Module2 (RULES.md §1.3–§1.4). `distHP`
 * and `distVP` are zeroed because this topic seats the double cone about its own apex
 * (see buildDoubleCone) rather than clear of the reference planes.
 * @returns {import('./src/shapeData.js').ShapeData}
 */
function defaultConeData() {
  return {
    ...defaultShapeData(),
    shape: ShapeType.Cone,
    baseLength: 3.0,
    height: 3.0,
    distHP: 0,
    distVP: 0,
  };
}

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Module state
// ============================================================================

let renderer;
let labelRenderer;
let scene;
let camera;
let controls;

/** A fixed CAD ground-reference grid, kept OUT of shapeGroup so rebuild() never disposes it. */
let hpGrid;

/** Holds all per-frame domain geometry. rebuild()'s disposal contract DEEP-traverses this
 *  group, so children MAY be nested Groups — every descendant geometry/material/label is
 *  still freed. */
let shapeGroup;

/** The sim viewport element, held module-wide so handleResize can read its live size. */
let viewport;

/** The cone currently on screen. Mutated only via rebuild(). @type {object|null} */
let currentShapeData = null;

let rafId = null;
let running = false;

// ============================================================================
// Cutting-plane state — TOPIC-LOCAL, deliberately outside ShapeData (ADR-059 /
// ADR-067). Mutated only via simController.commitSection(), which routes through
// rebuild(). The plane is ALWAYS ⊥ VP, inclined angleDeg to the HP, and sits `offset`
// away from the APEX along its own normal — so offset 0 IS section plane FF, the cut
// "passing through the apex of the cone" (§6.1 item 6).
// ============================================================================

let sectionState = defaultSectionState();

/** The live conic sheet state (§6.3–§6.9) — likewise beside ShapeData, never in it. */
let conicState = defaultConicState();

/** Which guided step is showing: drives the 3D reveal and the sheet's mode. */
let stage = 1;

/** Whether the upper nappe is drawn (Step 1's "show both nappes"). */
let showUpperNappe = true;

/** True when the current build produced a real section on at least one nappe — the
 *  Problem Library's cuts-the-solid guard (topic-1 precedent). */
let sectionCutHit = false;

/** Last cut status, so learner feedback fires on a TRANSITION, not every slider tick. */
let lastSectionStatus = null;

/** Live LineMaterials (section loops) — handleResize keeps their px resolution honest. */
const lineMaterials = new Set();

/** Subscribers fired at the end of every rebuild() — the single seam every state change
 *  passes through (the problem library's self-check rides it). */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

/** First-run onboarding handle from initOnboarding — { setSolidPresent, spotlight, cue }. */
let onboarding;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

/** Problem-library handle from initProblemLibrary — { open, exit, isActive, dispose }. */
let problemLibrary;

// ============================================================================
// Live-region + viewport-note helpers
// ============================================================================

/** Narrate a state change to assistive tech (PRODUCT.md a11y commitment). */
function announce(message) {
  if (statusRegion) statusRegion.textContent = message;
}

/** ms a reflow note stays up before fading. */
const FLOW_NOTE_HOLD = 4500;
let flowNoteEl = null;
let flowNoteTimer = null;
let flowNoteHideTimer = null;

/**
 * Flash a brief, visible note over the viewport for a state change a sighted learner needs
 * explained. Screen readers get the message through #sim-status via announce(), so this
 * note is aria-hidden and is NOT itself a live region. Auto-dismisses.
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
    flowNoteHideTimer = setTimeout(() => { flowNoteEl.hidden = true; }, 240);
  }, FLOW_NOTE_HOLD);
}

/** ms the success toast stays up before fading. */
const TOAST_HOLD = 3500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Show a brief, calm success toast over the viewport (the terminal-step "Complete &
 * next problem" win). Token-driven success styling + a check glyph — NOT a gamified
 * celebration (DESIGN.md rejects confetti/badges/points). Driven by setTimeout, NOT the
 * rAF tween engine, because the Problem Library overlay pauses the loop immediately
 * after this is called (the toast still needs to fade).
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
  requestAnimationFrame(() => toastEl.classList.add('is-visible'));

  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, 240);
  }, TOAST_HOLD);
}

/** Fire every state-change subscriber. Each callback is guarded so one throwing
 *  subscriber can never break the rebuild pipeline. */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/**
 * Show or hide the transient WebGL context-loss recovery chip, and narrate the state
 * change so a screen-reader user knows the paused view is recovering, not broken.
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
 * Signal a successful boot to the index.html watchdog: clear its timeout and hide any
 * fallback a slow load may have surfaced, so a late-but-successful boot self-heals.
 */
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
// rebuild() — THE ONLY path for geometry changes (CLAUDE.md, non-negotiable).
// ============================================================================

/**
 * Fixed order: dispose → build the double cone → extract the section (curve + face) →
 * place the anatomy labels → notify. Passing `null` clears to the empty start.
 *
 * @param {object | null} shapeData
 */
function rebuild(shapeData) {
  currentShapeData = shapeData;

  // --- Disposal contract (CLAUDE.md / ADR-004). DEEP traversal: the double cone is a
  //     nested Group, so a shallow loop over shapeGroup.children would free NOTHING for
  //     it and exhaust the WebGL context (ADR-042). disposeObj also pulls CSS2D label
  //     DOM nodes out of the overlay (RULES.md §3.5) — they accumulate fast otherwise. ---
  for (const child of shapeGroup.children) child.traverse(disposeObj);
  shapeGroup.clear();
  lineMaterials.clear();
  sectionCutHit = false;

  // ── DOMAIN BUILD SEAM ─────────────────────────────────────────────────────────────
  if (shapeData) {
    const cone = buildDoubleCone(shapeData);
    shapeGroup.add(cone.group);
    applySection(cone, shapeData);          // section curve + cut face + the plane sheet
    if (stage === 1) addAnatomyLabels(cone, shapeData); // §6.1 vocabulary, Step 1 only
  }
  onboarding?.setSolidPresent(shapeData !== null);
  // ───────────────────────────────────────────────────────────────────────────────────

  notifyStateChange(); // state change committed — re-run every subscriber
}

/** Dispose one object's GPU resources — geometry + every material (+ any texture map) —
 *  and remove a CSS2D label's live DOM node. The single teardown primitive the deep
 *  disposal traversal applies to every descendant of shapeGroup. */
function disposeObj(obj) {
  obj.geometry?.dispose();
  const mat = obj.material;
  if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => { m?.map?.dispose(); m?.dispose(); });
  if (obj.isCSS2DObject) obj.element?.remove();
}

// ============================================================================
// The double cone (§6.1) — "conic surface is supposed to extend to infinity in
// both directions from the apex, giving rise to a double cone. Each half of the
// double cone is called nappe."
//
// Assembled HERE, in the orchestrator, from two `cone.js` meshes: a leaf module
// may not import a sibling leaf (RULES.md §3.6), and re-authoring the cone
// geometry in a new leaf would fork the master's generator. The lower nappe
// stands on the HP; the upper one is the same mesh turned through 180° about X
// (never a negative scale, which would invert the winding), so the two share an
// apex at y = height.
// ============================================================================

function buildDoubleCone(data) {
  const group = new THREE.Group();
  group.name = 'double-cone';

  const lower = createCone(data);
  lower.name = 'nappe-lower';
  lower.position.set(0, data.height / 2, 0); // generator geometry is centred on ±h/2
  lower.updateMatrix();

  const upper = createCone(data);
  upper.name = 'nappe-upper';
  upper.rotation.x = Math.PI;
  upper.position.set(0, data.height * 1.5, 0);
  upper.visible = showUpperNappe;
  upper.updateMatrix();

  // Translucent while a section is on, so the curve and the cut face read THROUGH the
  // solid — the chapter's Fig. 6.2 pictorials show the section on an intact cone.
  for (const mesh of [lower, upper]) {
    if (sectionState.enabled) {
      mesh.material.transparent = true;
      mesh.material.opacity = 0.5;
      mesh.material.depthWrite = false;
    }
    group.add(mesh, edgeOverlayFor(mesh));
  }

  return { group, lower, upper, apex: new THREE.Vector3(0, data.height, 0) };
}

/**
 * Visible-edge overlay for one nappe: solid dark ink lines (CLAUDE.md visual style),
 * a transform-copying sibling in the Module2 pattern. 1px is acceptable for the solid's
 * own silhouette; the section curve — the engineering answer — is a fat Line2.
 *
 * @param {THREE.Mesh} mesh
 * @returns {THREE.LineSegments}
 */
function edgeOverlayFor(mesh) {
  const edges = new THREE.EdgesGeometry(mesh.geometry);
  const overlay = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: cssColor('--color-ink') }),
  );
  overlay.position.copy(mesh.position);
  overlay.quaternion.copy(mesh.quaternion);
  overlay.scale.copy(mesh.scale);
  overlay.visible = mesh.visible;
  return overlay;
}

// ============================================================================
// Section stage — the six section planes of §6.1. Runs INSIDE rebuild()'s build
// seam, never as a live mutation reacting directly to a slider (ADR-004).
// ============================================================================

/**
 * The learner's cutting plane in WORLD space. Normal (0, cos θ, sin θ) — perpendicular
 * to the V.P., inclined θ to the H.P. — and positioned so the APEX sits `offset` away
 * from it along that normal. Anchoring on the apex rather than on the base is what makes
 * offset 0 exactly section plane FF ("passing through the apex"), and what makes the
 * offset at θ = 90° read as the plane's own distance from the axis — the one quantity
 * that separates the isosceles triangle from the rectangular hyperbola (§6.1 items 5–6).
 *
 * @param {THREE.Vector3} apex
 * @returns {THREE.Plane}
 */
function buildSectionPlaneWorld(apex) {
  const rad = THREE.MathUtils.degToRad(sectionState.angleDeg);
  const normal = new THREE.Vector3(0, Math.cos(rad), Math.sin(rad));
  const anchor = apex.clone().addScaledVector(normal, sectionState.offset);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, anchor);
}

/**
 * Extract the section from each nappe and draw it: the ordered boundary loop as a fat
 * crimson curve (this IS the conic), the capped cut face behind it, and the translucent
 * plane sheet showing where the cut lies.
 *
 * `sectionCut.js` is used here as a CURVE EXTRACTOR, not as a truncator (ADR-085): the
 * chapter's subject is the curve, and removing half the double cone would hide the very
 * nappe a hyperbola needs. The clipper's own `loops` output — already welded and ordered
 * on meshAnalyzer's 1e-3 lattice — is exactly the polyline to draw, and its cap triangles
 * (geometry group 1) are lifted out as the section face.
 *
 * @param {{lower:THREE.Mesh, upper:THREE.Mesh, apex:THREE.Vector3}} cone
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function applySection(cone, data) {
  if (!sectionState.enabled) { lastSectionStatus = null; return; }

  const planeWorld = buildSectionPlaneWorld(cone.apex);
  const nappes = showUpperNappe ? [cone.lower, cone.upper] : [cone.lower];
  let status = 'no-cut';

  for (const mesh of nappes) {
    const planeLocal = planeWorld.clone().applyMatrix4(mesh.matrix.clone().invert());
    const result = cutGeometryWithPlane(mesh.geometry, planeLocal);
    if (result.status !== 'cut') continue;
    status = 'cut';

    // The cut face — the clipper's cap group, lifted out and given the section token.
    const cap = new THREE.BufferGeometry();
    const src = result.geometry.getAttribute('position').array;
    cap.setAttribute('position', new THREE.BufferAttribute(src.slice(result.capStart * 3), 3));
    cap.computeVertexNormals();
    result.geometry.dispose(); // only the cap is kept; the sliced solid is never shown
    const face = new THREE.Mesh(cap, new THREE.MeshPhongMaterial({
      color: cssColor('--color-section-face'),
      shininess: 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }));
    face.applyMatrix4(mesh.matrix);
    face.name = 'section-face';
    shapeGroup.add(face);

    // The section curve itself, at engineering answer weight.
    for (const loop of result.loops) {
      const pts = loop.points3D.map((p) => p.clone().applyMatrix4(mesh.matrix));
      shapeGroup.add(sectionCurveLine(pts));
    }
  }

  sectionCutHit = status === 'cut';

  // Learner feedback on TRANSITIONS only (never per slider tick).
  if (status !== lastSectionStatus) {
    if (status === 'no-cut' && lastSectionStatus !== null) {
      flowNote('The plane has moved clear of the cone — slide it back until it cuts.');
      announce('The section plane no longer intersects the cone.');
    } else if (status === 'cut') {
      onboarding?.spotlight('section-curve'); // first-seen only; the chip self-dismisses
    }
    lastSectionStatus = status;
  }

  addSectionPlaneVisual(planeWorld, data);
}

/** The section loop as a closed fat Line2 in the section colour. */
function sectionCurveLine(pts) {
  const flat = pts.flatMap((p) => [p.x, p.y, p.z]);
  flat.push(pts[0].x, pts[0].y, pts[0].z); // close the loop
  const geometry = new LineGeometry();
  geometry.setPositions(flat);

  const material = new LineMaterial({
    color: cssColor('--color-section-face'),
    linewidth: 3, // px — the answer curve (LineMaterial, not LineBasicMaterial: §3.12)
  });
  material.resolution.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
  lineMaterials.add(material);

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.name = 'section-curve';
  return line;
}

/**
 * Translucent quad + outline showing WHERE the section plane lies (topic-1 port). Sized
 * from the double cone's own extent so it always reads as a drafting instrument passing
 * through the solid, never as fog.
 *
 * @param {THREE.Plane} plane
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function addSectionPlaneVisual(plane, data) {
  const size = Math.max(data.baseLength, data.height) * 2.6;
  const centre = plane.projectPoint(new THREE.Vector3(0, data.height, 0), new THREE.Vector3());

  const quadGeo = new THREE.PlaneGeometry(size, size);
  const quad = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
    color: cssColor('--color-section-face'),
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    depthWrite: false, // never occludes the cone behind it
  }));
  quad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal); // PlaneGeometry faces +Z
  quad.position.copy(centre);
  quad.name = 'section-plane';

  // Crisp border so the plane reads as an instrument. 1px is fine — instrument chrome,
  // not engineering linework.
  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(quadGeo),
    new THREE.LineBasicMaterial({
      color: cssColor('--color-section-face'), transparent: true, opacity: 0.5,
    }),
  );
  quad.add(border); // inherits the pose; deep disposal frees both

  shapeGroup.add(quad);
}

// ============================================================================
// Anatomy labels (§6.1 vocabulary) — live CSS2DObject DOM nodes, not baked
// sprites (RULES.md §3.27), so they stay vector-sharp and screen-reader
// readable. Shown on Step 1 only; the disposal contract removes their DOM.
// ============================================================================

/** One CSS2D pill at a world point. */
function anatomyLabel(text, position) {
  const el = document.createElement('span');
  el.className = 'vlabel';
  el.textContent = text;
  const object = new CSS2DObject(el);
  object.position.copy(position);
  return object;
}

/**
 * Name the parts of the cone the chapter's first paragraph defines: the apex (vertex),
 * the axis, a generator, the base of each nappe, the two nappes, and the apex angle.
 *
 * @param {{group:THREE.Group, apex:THREE.Vector3}} cone
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function addAnatomyLabels(cone, data) {
  const r = data.baseLength / 2;
  const h = data.height;
  const group = new THREE.Group();
  group.name = 'anatomy-labels';

  // The axis — a chain line running the full height of whichever nappes are shown.
  const axisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, showUpperNappe ? 2 * h : h, 0),
  ]);
  const axis = new THREE.Line(axisGeo, new THREE.LineDashedMaterial({
    color: cssColor('--color-ink-secondary'), dashSize: 0.22, gapSize: 0.12,
  }));
  axis.computeLineDistances(); // without this the dashes render solid (CLAUDE.md gotcha)
  group.add(axis);

  // Anchored OUTSIDE the silhouette and spread up the axis, so no two pills collide and
  // none sits over the solid it is naming — a CSS2D pill is centred on its 3D point, so
  // an anchor on the surface reads as a label lying across the cone.
  const out = r + 1.1; // clear of the widest rim at any dialled base diameter
  group.add(anatomyLabel('Apex (vertex)', new THREE.Vector3(out * 0.55, h, 0)));
  group.add(anatomyLabel(
    `Apex angle ${(2 * Math.atan2(r, h) * 180 / Math.PI).toFixed(0)}°`,
    new THREE.Vector3(-out * 0.6, h * 0.86, 0),
  ));
  group.add(anatomyLabel('Axis', new THREE.Vector3(0, h * 0.22, 0)));
  group.add(anatomyLabel('Generator', new THREE.Vector3(out, h * 0.55, 0)));
  group.add(anatomyLabel('Lower nappe', new THREE.Vector3(-out, h * 0.45, 0)));
  group.add(anatomyLabel('Base', new THREE.Vector3(0, -0.45, r * 0.2)));
  if (showUpperNappe) {
    group.add(anatomyLabel('Upper nappe', new THREE.Vector3(-out, h * 1.55, 0)));
  }

  shapeGroup.add(group);
}

// ============================================================================
// Scene bootstrap
// ============================================================================

function buildScene(container) {
  scene = new THREE.Scene();
  scene.background = cssColor('--color-paper');

  const { clientWidth: w, clientHeight: h } = container;
  camera = new THREE.PerspectiveCamera(45, (w || 1) / (h || 1), 0.1, 200);
  camera.position.copy(DEFAULT_CAMERA_POSITION);

  // Renderer. Antialias for crisp technical edges; cap DPR so retina iframes don't overdraw.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows (CLAUDE.md visual style)
  container.appendChild(renderer.domElement);

  // CSS2D overlay for the anatomy labels — live DOM, never intercepting the orbit drag.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // WebGL context loss/restore (CLAUDE.md flags context exhaustion as the most likely
  // late-stage bug). Without preventDefault() the browser will NOT restore the context.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // REQUIRED — opts in to a restorable context
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild(currentShapeData); // re-upload GPU state
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Lighting: flat ambient fill + ONE low directional, no shadows (CLAUDE.md visual style).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  // Subtle ground-reference grid (the HP) — the lower nappe stands on it.
  hpGrid = new THREE.GridHelper(40, 40, cssVar('--color-bench-grey'), cssVar('--color-border'));
  hpGrid.material.opacity = 0.35;
  hpGrid.material.transparent = true;
  scene.add(hpGrid);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // Orbit controls (free-orbit perspective view).
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(DEFAULT_CAMERA_TARGET);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = 0.08;
  controls.update();
}

// ============================================================================
// Render loop
// ============================================================================

let lastFrameTime = 0;

function animate(now) {
  rafId = requestAnimationFrame(animate);
  // Delta in ms (capped so a pause/tab-switch doesn't resume with a huge jump).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);  // advance any domain animations (pauses with the loop)
  controls.update();  // applies damping inertia
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
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
// Resize — track the container, not just window (the host can resize the iframe
// without a window resize event).
// ============================================================================

function handleResize(container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  // LineMaterial renders in screen px — its resolution must track the drawing buffer
  // or the fat section curve stretches (CLAUDE.md LineMaterial gotcha, RULES.md §3.16).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  for (const material of lineMaterials) material.resolution.copy(size);
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
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');

    // The viewport just changed size (flex reflow). Sync on the next frame.
    requestAnimationFrame(() => handleResize(viewport));
  });
}

// ============================================================================
// Compare view + 50/50 workbench (ADR-012 / ADR-037, the sibling topics' port).
// The right pane is the 2D drawing sheet: drawCompare() sizes the canvas and
// delegates every curve and construction line to src/conicEngine.js (ADR-084).
// Pan (ADR-054) and wheel zoom (ADR-055) are pure post-multipliers over the
// fixed intrinsic frame (ADR-053 pattern).
// ============================================================================

const COMPARE_DEFAULT_SIZE = 'expanded';

let compareCard = null;
let compareCanvas = null;
let compareChip = null;
let compareOpen = false;      // the card is shown at all (compact OR expanded)
let compareSize = 'compact';  // 'compact' | 'expanded'
let workbenchOpen = false;
/** Drag-to-pan offset (CSS px, ADR-054) applied on top of the fixed intrinsic frame. */
let comparePanX = 0;
let comparePanY = 0;
/** Scroll-wheel zoom multiplier (ADR-055) — post-multiplies the intrinsic scale. */
let compareZoom = 1;
const COMPARE_ZOOM_MIN = 0.4;
const COMPARE_ZOOM_MAX = 5;

/** Driver wrappers docked into #workbench-rail during the split (ADR-021 / ADR-037, and
 *  exactly the sibling topic's `['shape', 'section']`): ONLY the value drivers of the solid
 *  in the left pane ride into the rail. The rail is a single wrapping row sized `auto` in a
 *  `minmax(0,1fr) auto` grid, so it is the pane's budget, not a second panel: docking all
 *  six step groups made it 1340 px tall and starved the viewport row to 2 px. The sheet's
 *  own parameters stay in the wizard, reached by leaving the split — the same trade the
 *  sibling makes. */
const WORKBENCH_CONTROLS = ['cone', 'section'];
/** @type {Map<string, {parent: Element, next: Node|null}>} each docked wrapper's home. */
const driverHomes = new Map();

function isWorkbenchViewport() {
  return window.matchMedia('(min-width: 768px)').matches;
}

/** Collapse the wizard, split the viewport 50/50, and dock the driver wrappers under
 *  both panes. Idempotent. */
function enterWorkbench() {
  if (workbenchOpen) return;
  workbenchOpen = true;

  const rail = document.getElementById('workbench-rail');
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = document.querySelector(`[data-ctrl="${key}"]`);
    if (!wrap || !rail) continue;
    if (!driverHomes.has(key)) {
      driverHomes.set(key, { parent: wrap.parentElement, next: wrap.nextSibling });
    }
    rail.appendChild(wrap);
  }

  // Re-parent the drawing card out to <body> so the grid can place it as the right pane
  // (compact anchors absolutely inside #sim-viewport, which is now the left pane).
  if (compareCard && compareCard.parentElement !== document.body) {
    document.body.appendChild(compareCard);
  }
  document.body.classList.add('compare-split');
  // The rail toggle always defaults to shown on entry.
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);
}

/** Restore the floating layout: hand any docked wrappers back to their captured home
 *  slots and re-nest the card in #sim-viewport. Idempotent. */
function exitWorkbench() {
  if (!workbenchOpen) return;
  workbenchOpen = false;
  document.body.classList.remove('compare-split');
  document.body.classList.remove('rail-collapsed');
  syncRailToggleState(false);

  if (compareCard && viewport && compareCard.parentElement !== viewport) {
    viewport.appendChild(compareCard);
  }

  const rail = document.getElementById('workbench-rail');
  for (const key of WORKBENCH_CONTROLS) {
    const wrap = rail?.querySelector(`[data-ctrl="${key}"]`);
    const home = driverHomes.get(key);
    if (wrap && home?.parent) home.parent.insertBefore(wrap, home.next);
  }
}

/** Set the compare footprint and mount/unmount the workbench to match. */
function applyCompareSize(size) {
  const wantSplit = size === 'expanded' && isWorkbenchViewport();
  compareSize = wantSplit ? 'expanded' : 'compact';
  if (compareCard) compareCard.dataset.size = compareSize;
  if (wantSplit) enterWorkbench();
  else exitWorkbench();
  remeasureAfterReflow(); // TWO frames — the grid reflow isn't laid out on frame 1
}

/** Re-measure the viewport AFTER a layout-changing reflow has actually been laid out. */
function remeasureAfterReflow() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    handleResize(viewport);
    if (compareOpen) drawCompare();
  }));
}

/** State-aware Compare chip: aria-pressed mirrors open/closed. Always visible — the sim
 *  always has a cone on screen, so the sheet is meaningful from boot. */
function updateCompareChip() {
  compareChip?.setAttribute('aria-pressed', String(compareOpen));
}

/** Single reset point for the sheet's user-driven view state (ADR-054 pan + ADR-055 zoom). */
function resetCompareView() {
  comparePanX = 0;
  comparePanY = 0;
  compareZoom = 1;
}

const compare = {
  show(size) {
    const wasOpen = compareOpen;
    compareOpen = true;
    if (!wasOpen) resetCompareView(); // every fresh open starts centred and unzoomed
    if (compareCard) compareCard.hidden = false;
    applyCompareSize(size || (isWorkbenchViewport() ? COMPARE_DEFAULT_SIZE : 'compact'));
    updateCompareChip();
    if (!wasOpen) {
      announce('Drawing sheet opened.');
      onboarding?.spotlight('drawing-sheet'); // first-seen only
    }
  },
  hide() {
    if (!compareOpen) return;
    compareOpen = false;
    const wasSplit = workbenchOpen;
    if (wasSplit) exitWorkbench(); // tear the split down before the card vanishes
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Drawing sheet closed.');
    if (wasSplit) remeasureAfterReflow(); // hand the width back, resize the renderer
  },
  toggle() { compareOpen ? compare.hide() : compare.show(); },
  isOpen() { return compareOpen; },
};

/** One-source-of-truth sync for the #rail-toggle button's 4 state facets. */
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
    remeasureAfterReflow();
  });
}

/** Bind + wire the Compare chrome once at boot. */
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
    applyCompareSize(compareSize === 'expanded' ? 'compact' : 'expanded');
    syncExpandBtn();
    announce(compareSize === 'expanded' ? 'Drawing sheet expanded to split.' : 'Drawing sheet shrunk to card.');
  });

  // The workbench is desktop-only: below the mobile breakpoint the split drops back to
  // the bottom-sheet card so the layout never wedges between the grid and the stack.
  window.matchMedia('(min-width: 768px)').addEventListener('change', (e) => {
    if (!e.matches && workbenchOpen) { applyCompareSize('compact'); syncExpandBtn(); }
  });

  setupRailToggle();
  setupComparePan();
}

/** Drag-to-pan (ADR-054) + scroll-wheel zoom (ADR-055) on the 2D sheet — standard
 *  pointer-capture drag, coalesced to one redraw per animation frame. Neither touches the
 *  intrinsic scale/anchor. Double-click recenters AND un-zooms. */
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

  // Scroll-wheel zoom, zeroed-in on the pointer: solve for the pan shift that keeps the
  // point under the cursor fixed as compareZoom changes, using the same (w/2, h/2) centre
  // drawCompare's project() anchors to.
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

/**
 * Which sheet the current step draws. The lesson only reaches the sheet at Step 4, and each
 * later step swaps ONE thing about it: Step 4 explains the curve (and, on request, names its
 * parts), Step 5 constructs it, Step 6 keeps whatever construction Step 5 left up while the
 * learner works in 3D (ADR-086).
 */
function sheetMode() {
  if (stage >= 5) return conicState.method === ECCENTRICITY_METHOD ? 'eccentricity' : 'methods';
  if (stage === 4) return conicState.showNames ? 'terms' : 'locus';
  return 'locus';
}

/** The label font for the sheet, composed from tokens (never a hard-coded family):
 *  --text-xs of the root font size, in --font-mono. */
function sheetFont() {
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return `${Math.round(rootPx * 0.75)}px ${cssVar('--font-mono')}`;
}

/**
 * Repaint the 2D drawing sheet — a live rebuild on every commit, never a snapshot
 * (ADR-012 §5.14). Thin orchestrator: sizes the DPR-scaled backing store, paints the
 * paper, derives the fixed intrinsic frame (ADR-053 pattern: px-per-mm from the ANALYTIC
 * construction footprint the engine computes out of ConicState — never the live drawn
 * extents, so pan/zoom can never rescale the drawing and a real millimetre reads the
 * same length at a given construction size), then delegates every decision to
 * src/conicEngine.js.
 */
function drawCompare() {
  if (!compareCanvas) return;
  const stageEl = compareCanvas.parentElement;
  const w = stageEl?.clientWidth || 0;
  const h = stageEl?.clientHeight || 0;
  if (!w || !h) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  compareCanvas.width = Math.round(w * dpr);
  compareCanvas.height = Math.round(h * dpr);
  const ctx = compareCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.fillStyle = cssVar('--color-paper');
  ctx.fillRect(0, 0, w, h);

  const layout = layoutFor(sheetMode(), conicState);

  // Fixed intrinsic frame (ADR-053 pattern): px per mm from the analytic bbox. The margin
  // scales with the stage because the bbox covers the LINEWORK only — labels are chrome
  // and hang outside it (letting them drive the scale would shrink the drawing), so the
  // clear band around the drawing has to grow with the card or the outermost captions
  // clip against its edge.
  const marginPx = Math.min(72, Math.max(40, Math.round(Math.min(w, h) * 0.11)));
  const nomW = Math.max(layout.bbox.maxX - layout.bbox.minX, 1e-6);
  const nomH = Math.max(layout.bbox.maxY - layout.bbox.minY, 1e-6);
  const scale = Math.min((w - 2 * marginPx) / nomW, (h - 2 * marginPx) / nomH); // px per mm

  const cx = w / 2;
  const cy = h / 2;
  const anchorX = (layout.bbox.minX + layout.bbox.maxX) / 2;
  const anchorY = (layout.bbox.minY + layout.bbox.maxY) / 2;
  const pxPerMm = scale * compareZoom;

  // Sheet space is millimetres with y DOWN (the engine's convention, matching canvas),
  // so no y flip here — just scale, centre, and layer the user's pan.
  const view = {
    project: (p) => ({
      x: cx + (p.x - anchorX) * pxPerMm + comparePanX,
      y: cy + (p.y - anchorY) * pxPerMm + comparePanY,
    }),
    pxPerMm,
  };

  drawSheet(ctx, view, layout, {
    ink: cssVar('--color-ink'),
    construction: cssVar('--color-ink-secondary'),
    curve: cssVar('--color-section-face'),
    mark: cssVar('--color-conic-mark'),
    font: sheetFont(),
  });
}

// ============================================================================
// Stage — the guided step drives the 3D reveal and which sheet is drawn.
// ============================================================================

/**
 * Called by stepper.js on every step change (the sibling topics' setStage seam). The scene
 * follows the story rather than waiting to be configured (ADR-086):
 *
 *   Step 1  whole cone, parts named, no plane in sight.
 *   Step 2  the plane arrives and cuts — the step IS the cut, so there is no on/off toggle
 *           to find; going back to Step 1 takes the plane away again.
 *   Step 3  the plane stays; the six named cuts are demonstrated on it.
 *   Step 4  the sheet opens, and the camera first swings round to look at the cut
 *           square-on — the bridge from "a slice of a solid" to "a curve on paper".
 *   Steps 5–6 the sheet stays; only its mode changes.
 *
 * @param {number} step
 */
function setStage(step) {
  const previous = stage;
  stage = step;
  if (previous === stage) return;

  // The plane belongs to Step 2 onward. Turning it on IS what Step 2 means, so the toggle
  // that used to ask for it is gone; the state change still routes through commitSection.
  const wantCut = stage >= 2;
  if (sectionState.enabled !== wantCut) {
    sectionState.enabled = wantCut;
    rebuild(currentShapeData);
    if (wantCut) flowNote('The cutting plane is in place. Tilt it and watch the cut change shape.');
  } else if (previous === 1 || stage === 1) {
    // The anatomy labels belong to Step 1 only — rebuild so they come and go with it.
    rebuild(currentShapeData);
  }

  // From Step 4 the lesson lives on the sheet, so it is opened for the learner — as the
  // COMPACT floating card, never the 50/50 split: the split collapses the wizard, and a
  // guided step that hides its own step card would strand the learner.
  if (stage >= 4 && !compareOpen) {
    faceTheSection();               // look at the cut square-on first…
    compare.show('compact');        // …then the same shape appears on paper
    flowNote('Same curve, seen face-on — and now drawn on paper beside it.');
  }
  if (compareOpen) drawCompare();

  // The step itself is a state change: the dock decides what a control may say from the
  // stage (plain words in Step 2, names from Step 3, nothing given away in Step 6), and a
  // step that changes nothing else would otherwise leave those readouts stale.
  notifyStateChange();
}

/**
 * Swing the camera round to look at the section plane square-on, so the cut face reads as
 * the true shape of the curve. This is the bridge Step 4 needs: the learner sees the 3D
 * slice flatten into the same outline the sheet is about to construct. (Topic-1 ships the
 * same "face the section" move for its true-shape step.)
 */
function faceTheSection() {
  if (!currentShapeData) return;
  const apex = new THREE.Vector3(0, currentShapeData.height, 0);
  const plane = buildSectionPlaneWorld(apex);
  const centre = plane.projectPoint(apex, new THREE.Vector3());
  // Far enough back for the WHOLE double cone (two nappes tall), not just the cut — the
  // learner has to keep seeing what the curve was sliced from.
  const reach = Math.max(currentShapeData.baseLength, currentShapeData.height * 2) * 2.2;
  // A hair off the normal so a horizontal cut does not park the camera exactly overhead,
  // where OrbitControls' up vector has nothing to hold on to.
  const dir = plane.normal.clone().normalize().add(new THREE.Vector3(0.12, 0, 0.06)).normalize();
  const to = centre.clone().addScaledVector(dir, reach);
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();

  tween({
    from: 0,
    to: 1,
    duration: 900,
    ease: easeCamera,
    onUpdate: (t) => {
      camera.position.lerpVectors(fromPos, to, t);
      controls.target.lerpVectors(fromTarget, centre, t);
      controls.update();
    },
  });
  announce('The view turns to look at the cut face square-on.');
}

// ============================================================================
// The teaching motions. Each one exists so the learner WATCHES a cause produce
// its effect instead of reading that it would (ADR-086): the plane travels to a
// named cut, and the construction draws itself one stage at a time.
// ============================================================================

/** The sentinel `method` value that means "the eccentricity construction", which is a sheet
 *  MODE rather than one of conicData's METHODS entries. */
const ECCENTRICITY_METHOD = 'eccentricity';

/**
 * Step 3's "show me" — travel the plane to the pose that produces one named cut on THIS
 * cone, then say what it is and why. Animated rather than snapped, because the point of the
 * step is that the shape changes CONTINUOUSLY as the plane passes the generator angle.
 *
 * @param {string} key  A {@link ConicSection} key.
 */
function tourCut(key) {
  const spec = ConicSection[key];
  if (!spec || !currentShapeData) return;
  const target = sectionPresetFor(key, generatorAngleDeg(currentShapeData));
  const from = { angleDeg: sectionState.angleDeg, offset: sectionState.offset };

  tween({
    from: 0,
    to: 1,
    duration: 700,
    ease: easeStandard,
    onUpdate: (t) => {
      sectionState.angleDeg = from.angleDeg + (target.angleDeg - from.angleDeg) * t;
      sectionState.offset = from.offset + (target.offset - from.offset) * t;
      rebuild(currentShapeData);
    },
    onComplete: () => {
      sectionState.angleDeg = target.angleDeg;
      sectionState.offset = target.offset;
      rebuild(currentShapeData);
    },
  });
  flowNote(`${spec.name}. ${spec.seen}`);
  announce(`${spec.name}. ${spec.seen} ${spec.rule}`);
}

/** ms each construction stage holds before the next one is drawn. */
const BUILD_DWELL = 1300;
let buildTimer = null;

/**
 * Step 5's "draw it step by step" — rewind the construction to the bare frame and add one
 * stage at a time, narrating each. The learner sees WHERE every line came from, which a
 * finished figure can never show.
 */
function playConstruction() {
  clearTimeout(buildTimer);
  conicState = { ...conicState, buildStage: 0 };
  if (compareOpen) drawCompare();
  notifyStateChange();
  announce(BUILD_STAGES[0].say);
  flowNote(BUILD_STAGES[0].say);

  const advance = () => {
    if (conicState.buildStage >= BUILD_STAGES.length - 1) return;
    conicState = { ...conicState, buildStage: conicState.buildStage + 1 };
    if (compareOpen) drawCompare();
    notifyStateChange();
    const stageCopy = BUILD_STAGES[conicState.buildStage];
    announce(stageCopy.say);
    flowNote(stageCopy.say);
    buildTimer = setTimeout(advance, BUILD_DWELL);
  };
  buildTimer = setTimeout(advance, BUILD_DWELL);
}

// ============================================================================
// Step 6 — predict and verify. The sim moves the plane somewhere the learner has
// not chosen and asks what the cut will be; the answer is only revealed after the
// learner commits to one. Nothing here computes a new kind of truth: the verdict
// is classifySection() on the live plane, the same function Steps 2–3 report with.
// ============================================================================

/** @type {{answer:string|null, chosen:string|null, right:number, asked:number}} */
let quiz = { answer: null, chosen: null, right: 0, asked: 0 };

/** Deal a fresh cut: pick one of the six, travel the plane there, and keep the name back. */
function newPrediction() {
  const key = SECTION_TOUR[Math.floor(Math.random() * SECTION_TOUR.length)];
  quiz = { ...quiz, answer: key, chosen: null, asked: quiz.asked + 1 };
  const target = sectionPresetFor(key, generatorAngleDeg(currentShapeData ?? defaultConeData()));
  const from = { angleDeg: sectionState.angleDeg, offset: sectionState.offset };
  tween({
    from: 0,
    to: 1,
    duration: 700,
    ease: easeStandard,
    onUpdate: (t) => {
      sectionState.angleDeg = from.angleDeg + (target.angleDeg - from.angleDeg) * t;
      sectionState.offset = from.offset + (target.offset - from.offset) * t;
      rebuild(currentShapeData);
    },
    onComplete: () => {
      sectionState.angleDeg = target.angleDeg;
      sectionState.offset = target.offset;
      rebuild(currentShapeData);
    },
  });
  announce('A new cut is set up. Turn the view, then say which curve it makes.');
}

/**
 * Commit to an answer. Marked against the LIVE classification rather than against the dealt
 * key, so a learner who nudges the plane afterwards is still judged on what is on screen.
 * @param {string} key
 */
function answerPrediction(key) {
  if (!quiz.answer) return;
  const actual = simController.sectionInfo().key;
  const right = key === actual;
  quiz = { ...quiz, chosen: key, right: quiz.right + (right ? 1 : 0) };
  const spec = ConicSection[actual];
  announce(right
    ? `Correct — ${spec.name}. ${spec.rule}`
    : `Not quite. It is ${spec.name}: ${spec.rule}`);
  notifyStateChange();
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
 * reset() restores defaults and routes through rebuild() — the one reset path the in-sim
 * Reset must also use (CLAUDE.md: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    compare.hide();     // no-op when closed; also tears the workbench split down first
    resetCompareView(); // hide() doesn't touch pan/zoom — reset returns the sheet to 1×
    cancelTweens();
    resetCamera();
    clearTimeout(buildTimer);             // stop any construction playback mid-stage
    sectionState = defaultSectionState(); // section plane off + defaults (topic-local)
    conicState = defaultConicState();     // Example 6.1's own data
    conicState.method = ECCENTRICITY_METHOD; // Step 5 opens on the general construction
    quiz = { answer: null, chosen: null, right: 0, asked: 0 };
    showUpperNappe = true;
    stage = 1;
    rebuild(defaultConeData());  // canonical default cone — runs the disposal contract
    stepper?.reset();            // wizard back to Step 1
    announce('Simulation reset.');
  },
};

// ============================================================================
// UI controller — the narrow surface the leaf modules depend on. State + the
// rebuild pipeline stay owned here; controls read through getters and write
// through commit/reset, so the layering rule holds.
// ============================================================================

const simController = {
  /** Current cone (null on the empty start). */
  state: () => currentShapeData,

  /** Whether anything is currently on screen. */
  hasSolid: () => currentShapeData !== null,

  /** Merge params into the cone and rebuild — the single write path for its sliders. */
  commit(partial) { rebuild({ ...(currentShapeData ?? {}), ...partial }); },

  /** Copy of the topic-local cutting-plane state (never the live reference). */
  sectionState: () => ({ ...sectionState }),

  /** Merge params into the cutting-plane state and rebuild — the single write path for
   *  the section controls. State lives OUTSIDE ShapeData (ADR-067 pattern). */
  commitSection(partial) {
    Object.assign(sectionState, partial);
    rebuild(currentShapeData);
  },

  /** Copy of the conic sheet state. */
  conicState: () => ({ ...conicState }),

  /**
   * Merge params into the conic sheet state. The sheet is a 2D drawing with no scene
   * geometry, so this repaints it directly instead of routing through rebuild() — but it
   * still fires the state-change bus, so the self-check sees every edit exactly once.
   * Changing the curve carries the method with it (a parabola cannot be drawn by an
   * ellipse's construction), and changing the method carries its own given dimensions in.
   */
  commitConic(partial) {
    const next = { ...conicState, ...partial };
    if (partial.curve && partial.curve !== conicState.curve && !partial.method) {
      next.method = defaultMethodFor(partial.curve);
    }
    if (next.method !== conicState.method) {
      const m = methodById(next.method);
      if (m) {
        next.curve = m.curve;
        if (partial.dim1 === undefined) next.dim1 = m.dim1.value;
        if (partial.dim2 === undefined) next.dim2 = m.dim2.value;
        if (partial.dim3 === undefined) next.dim3 = m.dim3?.value ?? next.dim3;
      } else {
        // The eccentricity construction: no given dimensions, and the curve follows e.
        next.curve = curveForEccentricity(next.e);
      }
    }
    // Changing the eccentricity re-derives which curve the eccentricity sheets are drawing.
    if (partial.e !== undefined && next.method === ECCENTRICITY_METHOD) {
      next.curve = curveForEccentricity(next.e);
    }
    conicState = next;
    if (compareOpen) drawCompare();
    notifyStateChange();
  },

  /** The sentinel that means "the eccentricity construction" in `conicState.method`. */
  ECCENTRICITY_METHOD,

  /** §6.1's six cuts, in the order Step 3 tours them, with their plain-English and formal
   *  descriptions — the dock renders one chip per entry. */
  sectionTour: () => SECTION_TOUR.map((key) => ({ key, ...ConicSection[key] })),

  /** Travel the plane to one named cut and say what it is (Step 3). */
  tourCut,

  /** The construction's stages, and the playback that draws them one at a time (Step 5). */
  buildStages: () => BUILD_STAGES.map((s, i) => ({ index: i, ...s })),
  playConstruction,

  /** Step 6's predict-and-verify drill. `deal` sets up an unnamed cut; `answer` marks a
   *  guess against the LIVE classification; `state` drives the panel. */
  dealPrediction: newPrediction,
  answerPrediction,
  predictionState: () => ({ ...quiz }),

  /** Whether the upper nappe is drawn (Step 1's toggle). */
  showUpperNappe: () => showUpperNappe,
  commitNappes(on) {
    showUpperNappe = on;
    rebuild(currentShapeData);
  },

  /**
   * §6.1 as the sim sees it right now: the cone's own generator angle, and the conic the
   * dialled plane produces. The Step-2 readout and the self-check both read this, so what
   * the learner is told and what is accepted can never disagree.
   */
  sectionInfo() {
    const cone = currentShapeData ?? defaultConeData();
    const generatorDeg = generatorAngleDeg(cone);
    return {
      generatorDeg,
      cuts: sectionCutHit,
      ...classifySection(sectionState, generatorDeg),
    };
  },

  /** Which curve the current eccentricity produces (§6.3) — the Step-3 readout. */
  curveForEccentricity,

  /** Whether the section plane actually cut the cone — the library's cuts-the-solid guard. */
  hasCut: () => sectionCutHit,

  /** Millimetre scale of the 3D scene (1 unit = 10 mm), for the dock's readouts. */
  worldToMm: WORLD_TO_MM,

  /** Progressive reveal: the stepper calls this on every step change. */
  setStage,

  /** Which step is showing. The dock reads it to decide what a control is allowed to say
   *  yet — Step 2 reports the cut in plain words, Step 3 adds its name, and Step 6 keeps
   *  the name back until the learner has committed to an answer (ADR-086). */
  stage: () => stage,

  /** Route through the single reset path (re-syncs the wizard + announces). */
  reset() { window.simAPI.reset(); },

  /** Whether a textbook problem is loaded — drives the terminal-step CTA (stepper.js). */
  isProblemActive() { return problemLibrary?.isActive() ?? false; },

  /**
   * Terminal-step "Complete & next problem": close out the finished construction and
   * send the learner back to the library for the next one. Celebrate (calm toast), clear
   * the active-problem framing, reset through the single path, then open the library — so
   * picking the next problem starts from the clean Step-1 default.
   */
  completeAndNext() {
    const hadProblem = problemLibrary?.isActive() ?? false;
    const message = hadProblem
      ? 'Construction complete — well done. Choose your next problem to continue.'
      : 'Choose a problem to try your skills on.';
    showToast(message);
    problemLibrary?.exit();     // clear the pinned statement + self-check framing
    window.simAPI.reset();      // the one reset path (default cone, Step 1)
    problemLibrary?.open();     // pick the next problem (pauses the loop while open)
    announce(message);          // last write wins in the live region — the win narrates
  },

  announce,
  flowNote,

  /** Flash an ad-hoc contextual chip over the viewport (the onboarding cue system). */
  cueHint(text) { onboarding?.cue?.(text, 'ink'); },

  /** Register a callback fired at the end of every state commit. Returns an unsubscribe fn. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },
};

// ============================================================================
// Self-start (CLAUDE.md: sim runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container; // module-wide handle for live resize

  // The one operation that can hard-fail is WebGL context creation (hardware acceleration
  // off, GPU blocklisted, ancient browser). Catch it, surface the on-brand WebGL fallback
  // instead of a blank iframe, and bail cleanly.
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  // Chrome + control wiring. Wrapped too, so an unexpected wiring failure shows the
  // generic fallback rather than half-booting into a confusing partial UI.
  try {
    setupMobileNotice();
    setupWizardToggle();
    setupCompareCard();                    // Compare chrome + workbench split
    stepper = initStepper(simController);
    const dock = initUIManager(simController); // parameter dock
    simController.onStateChange(() => dock.sync()); // reset/commit re-syncs the controls
    initTerms();                           // inline term-definition popovers (static markup)
    onboarding = initOnboarding(controls); // first-run hints
    problemLibrary = initProblemLibrary(simController); // textbook problems + self-check

    // Every commit repaints the open sheet — it is a live view of the current state,
    // never a snapshot (ADR-012 §5.14).
    simController.onStateChange(() => { if (compareOpen) drawCompare(); });

    new ResizeObserver(() => {
      handleResize(container);
      if (compareOpen) drawCompare(); // the split resizes the stage with the viewport
    }).observe(container);

    // Boot with the topic default cone (route through rebuild(), the single geometry path).
    rebuild(defaultConeData());
    startLoop();

    // Re-render once the bundled fonts land so the sheet's labels never paint in a
    // fallback face (RULES.md §3.26).
    document.fonts?.ready?.then(() => { if (compareOpen) drawCompare(); });
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Tell the watchdog the sim is live. Last, so it only fires on a fully successful boot.
  markBooted();
}

init();
