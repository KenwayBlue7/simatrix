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
//         Fig. 6.2 pictorials (ADR-140).
//   2D  — the Compare sheet, where `conicEngine.js` draws the locus definition, the
//         nomenclature, and the twelve constructions (ADR-139).
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
  curveForEccentricity, methodById, defaultMethodFor, eccentricityForSection,
  ConicSection, SECTION_TOUR, sectionPresetFor, BUILD_STAGES, PROOF_STAGES,
  focalSphereFor, PARABOLA_PROPS, tangentPatchFor, buildStagesFor, setupStageFor,
} from './src/conicData.js';
import { layoutFor, drawSheet, describeAt, sheetTerms } from './src/conicEngine.js';
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

/** How many nappes the last cut actually reached (0, 1 or 2). */
let sectionNappesCut = 0;

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

  flowNoteTimer = setTimeout(hideFlowNote, FLOW_NOTE_HOLD);
}

/**
 * Retire the flow note now, rather than letting its hold run out.
 *
 * The note names the thing to do NEXT on the step it was raised for. Step 2's note says "Aim it,
 * then tick Cut the cone" — on Step 3 that control is not on screen and the cone is already cut,
 * so a learner who presses Next inside the four-and-a-half-second hold reads an instruction for a
 * step they have left. A step change clears the slot; a step that has its own note fills it again
 * on the same tick.
 */
function hideFlowNote() {
  if (!flowNoteEl) return;
  clearTimeout(flowNoteTimer);
  flowNoteEl.classList.remove('is-visible');
  clearTimeout(flowNoteHideTimer);
  flowNoteHideTimer = setTimeout(() => { flowNoteEl.hidden = true; }, 240);
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
  hideLabelTip();          // the pill it belonged to is about to be destroyed
  annotations = [];
  leaderLines = null;
  for (const child of shapeGroup.children) child.traverse(disposeObj);
  shapeGroup.clear();
  lineMaterials.clear();
  sectionCutHit = false;
  sectionNappesCut = 0;

  // ── DOMAIN BUILD SEAM ─────────────────────────────────────────────────────────────
  if (shapeData) {
    const cone = buildDoubleCone(shapeData);
    shapeGroup.add(cone.group);
    applySection(cone, shapeData);          // the plane, and — when asked for — the cut
    addEdgeOverlays(cone);                  // outlines from the geometry that ends up on screen
    // The axis LAST: its extent is measured from the solid that survived the cut.
    const box = new THREE.Box3().setFromObject(cone.group);
    shapeGroup.add(buildAxisCentreLine(shapeData,
      box.isEmpty() ? null : { bottom: box.min.y, top: box.max.y }));
    if (stage === 1) addAnatomyLabels(cone, shapeData); // §6.1 vocabulary, Step 1 only
    // §6.2's focal sphere, on Step 4 only and only as far as the reveal has walked it. The
    // call always runs (even at stage 0) because it is what solves `lastFocal`, which the
    // dock reads to know whether this cut HAS a focal sphere at all.
    if (stage === 4) addFocalSphereVisuals(cone, shapeData);
    else lastFocal = null;
  } else {
    lastFocal = null;
  }
  onboarding?.setSolidPresent(shapeData !== null);
  // The sheet's subject is a READING of the scene that was just built — including whether the
  // plane hit anything, which only the clipper knows (ADR-090). Derived here, once, so no
  // caller can forget it and leave the two panes disagreeing.
  syncSheetToCut();
  // Step 6 draws the cut WITHOUT committing it (ADR-117), so nothing above repaints the sheet for
  // it. The plane moves under the learner there — a dealt question, a nudged slider — and a
  // thumbnail that did not follow would be showing a cut that is no longer on the bench.
  if (stage === 6 && compareOpen) drawCompare();
  // A kind change rewound the proof, so the apparatus just built belongs to the old one.
  // Exactly one re-entry: the flag is cleared before the call, so this cannot recurse.
  if (proofResync) {
    proofResync = false;
    rebuild(shapeData);
    return;
  }
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

  // The meshes only. Edge overlays are added AFTER applySection(), because a truncated
  // nappe has a different silhouette from a whole one and the outline must follow the
  // geometry that ends up on screen — the reference topic's ordering.
  group.add(lower, upper);

  return { group, lower, upper, apex: new THREE.Vector3(0, data.height, 0) };
}

/** Outline each nappe once its final geometry is settled. */
function addEdgeOverlays(cone) {
  for (const mesh of [cone.lower, cone.upper]) cone.group.add(edgeOverlayFor(mesh));
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
 * Place the cutting plane and — once the learner has asked for it — slice the cone with it.
 *
 * Two states, exactly as in the reference topic (`graphics_module_3_topic_1_sections_of_solids`),
 * and the difference between them is the whole point of the "Cut the cone" checkbox:
 *
 *   plane shown, not cutting   The double cone is whole. The translucent plane passes
 *                              through it so the learner can AIM the knife — tilting and
 *                              sliding it are still live, and the readout already names the
 *                              curve this cut would make.
 *   cutting                    Each nappe's geometry is swapped for the clipper's result and
 *                              its cap becomes material group 1 in the section token, so the
 *                              cut face is a real face of a real solid: correctly depth-sorted,
 *                              lit like the rest, and visible from every angle without a
 *                              transparency trick (ADR-088, superseding ADR-140).
 *
 * The clipper's own welded `loops` output is still drawn over the cap as a fat crimson curve —
 * that is the conic this chapter is about, and it deserves engineering answer weight.
 *
 * @param {{group:THREE.Group, lower:THREE.Mesh, upper:THREE.Mesh, apex:THREE.Vector3}} cone
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function applySection(cone, data) {
  if (!sectionState.enabled) { lastSectionStatus = null; return; }

  const planeWorld = buildSectionPlaneWorld(cone.apex);
  addSectionPlaneVisual(planeWorld, data);
  if (!sectionState.cut) { lastSectionStatus = null; return; } // aimed, not yet cutting

  const nappes = showUpperNappe ? [cone.lower, cone.upper] : [cone.lower];
  let status = 'no-cut';

  for (const mesh of nappes) {
    const planeLocal = planeWorld.clone().applyMatrix4(mesh.matrix.clone().invert());
    const result = cutGeometryWithPlane(mesh.geometry, planeLocal);

    if (result.status === 'cut') {
      status = 'cut';
      sectionNappesCut += 1;
      // What the cut TOOK AWAY, kept as a faint ghost. The reference topic does not need this
      // — there the solid left behind IS the lesson — but here the curve is, and §6.1's own
      // pictorials (Fig. 6.2) show every section on a whole cone. Without it a steep cut can
      // leave a stump the learner cannot recognise as a cone at all, and a hyperbola's second
      // branch disappears with the nappe that carried it (ADR-088).
      cone.group.add(removedGhost(mesh));

      // The swap happens BEFORE the mesh reaches the scene, so the rebuild disposal contract
      // never sees the old geometry — free it by hand (RULES.md §3.35).
      mesh.geometry.dispose();
      mesh.geometry = result.geometry;

      // Group 0 keeps the cone's own fill; group 1 is the cap, in the section token.
      const capMaterial = mesh.material.clone();
      capMaterial.color = cssColor('--color-section-face');
      mesh.material = [mesh.material, capMaterial];

      // The section curve itself, over the cap, at engineering answer weight.
      for (const loop of result.loops) {
        const pts = loop.points3D.map((p) => p.clone().applyMatrix4(mesh.matrix));
        cone.group.add(sectionCurveLine(pts));
      }
    } else if (result.status === 'all-cut') {
      // The plane clears this nappe entirely. 'no-cut' and 'all-cut' carry no geometry
      // (sectionCut.js returns the status alone), so there is nothing to dispose here — but
      // the nappe still has to READ as having been there, or the cone stops looking like one.
      cone.group.add(removedGhost(mesh));
      mesh.visible = false;
      if (status === 'no-cut') status = 'all-cut';
    }
  }

  sectionCutHit = status === 'cut';

  // Learner feedback on TRANSITIONS only (never per slider tick).
  if (status !== lastSectionStatus) {
    if (status === 'all-cut') {
      flowNote('The plane now clears the whole cone — nothing is left. Slide it back.');
      announce('The cutting plane removes the entire cone.');
    } else if (status === 'no-cut' && lastSectionStatus !== null) {
      flowNote('The plane has moved clear of the cone — slide it back until it cuts.');
      announce('The section plane no longer intersects the cone.');
    } else if (status === 'cut') {
      onboarding?.spotlight('section-curve'); // first-seen only; the chip self-dismisses
    }
    lastSectionStatus = status;
  }
}

/**
 * A ghost of one nappe as it was BEFORE the cut — the material the plane removed, held at
 * the faintest weight that still reads as a cone. `depthWrite: false` keeps it from
 * occluding the solid or the section face in front of it; it is geometry only, with no edge
 * overlay, so it can never be mistaken for the drawing.
 *
 * @param {THREE.Mesh} mesh  The nappe, still carrying its UNCUT geometry.
 * @returns {THREE.Mesh}
 */
function removedGhost(mesh) {
  const ghost = new THREE.Mesh(mesh.geometry.clone(), new THREE.MeshBasicMaterial({
    color: cssColor('--color-bench-grey'),
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  ghost.position.copy(mesh.position);
  ghost.quaternion.copy(mesh.quaternion);
  ghost.scale.copy(mesh.scale);
  ghost.name = 'removed-ghost';
  return ghost;
}

/**
 * A fat polyline in world space — the only linework in this topic heavy enough to read as an
 * answer rather than as chrome (RULES.md §3.12: Line2, never a 1px LineBasicMaterial, for
 * anything the learner is meant to take as the result).
 *
 * @param {THREE.Vector3[]} pts
 * @param {number|THREE.Color} colour
 * @param {number} linewidth  px
 * @param {boolean} [close]   repeat the first point to close the loop
 */
function fatLine(pts, colour, linewidth, close = false) {
  const flat = pts.flatMap((p) => [p.x, p.y, p.z]);
  if (close) flat.push(pts[0].x, pts[0].y, pts[0].z);
  const geometry = new LineGeometry();
  geometry.setPositions(flat);

  const material = new LineMaterial({ color: colour, linewidth });
  material.resolution.copy(renderer.getDrawingBufferSize(new THREE.Vector2()));
  lineMaterials.add(material);

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  return line;
}

/** The section loop as a closed fat Line2 in the section colour. */
function sectionCurveLine(pts) {
  const line = fatLine(pts, cssColor('--color-section-face'), 3, true);
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
// The focal sphere (§6.2 items 1–4) — Step 4's FIRST act, played on the cone.
//
// The chapter defines the focus and the directrix on the SOLID, before §6.3 uses
// either of them: inscribe a sphere in the cone until it touches the section
// plane, and the touching point IS the focus; take the plane holding its circle
// of contact with the cone — the tangent plane — and where that meets the
// section plane IS the directrix. Everything here is that paragraph, drawn.
//
// The maths is `focalSphereFor()` in the pure data layer, solved in the V.P.
// (ADR-089); this function only places it. The apparatus is drawn in the
// projection teal used nowhere else in this topic, so it reads as an instrument
// the way the crimson cutting plane does — and the two things it PRODUCES are
// drawn in the sheet's own mark colour, because they are the same focus and the
// same directrix the drawing sheet is about to use.
// ============================================================================

/** The current focal-sphere solution, or null where there is none. Read by the dock. */
let lastFocal = null;

/**
 * The live parts of Step 4's proof, kept by name so a stage's animation can fade or grow ONE
 * of them per frame without rebuilding the scene (ADR-095). Cleared by rebuild(), which is
 * also what makes a stale tween harmless: it writes into an object nothing renders any more.
 */
let focalParts = {};

/**
 * How far through its own animation the current stage is, 0 → 1. Read while BUILDING (so a
 * rebuild mid-stage lands in the same visual state) and while ANIMATING (so the frame loop can
 * move opacities without a rebuild). `pulse` runs free: it is a highlight, not a transition,
 * and it is what makes "one point of contact" read as a claim rather than as a dot.
 */
const proofAnim = { fade: 1, pulse: 0, draw: 1, bridge: 0 };

/** Opacity constants for the proof's apparatus — one place, so a stage cannot invent its own. */
const PROOF_OPACITY = Object.freeze({
  ballFill: 0.16, ballWire: 0.30, plane: 0.34, planeEdge: 0.7, coneDim: 0.16,
  // How far the cone steps back while a TANGENCY stage is being read — present, but no longer
  // competing with the one relationship the stage is about.
  coneQuiet: 0.22, patch: 0.14, patchEdge: 1,
});

/**
 * Build Step 4's proof at the current stage, and ONLY that stage's objects (ADR-095). The
 * scene never carries an object the stage on screen is not talking about.
 *
 *   0  the cutting plane alone      3  against the CUT: one point, and it is the focus
 *   1  the ball, wedged in         4  the plane through the ring (the tangent plane)
 *   2  against the CONE: a ring    5  the directrix   ·   6  the bridge, onto the paper
 *
 * The two tangencies are two stages, deliberately (ADR-097): sphere-to-cone is a CIRCLE and
 * sphere-to-cut is a POINT, and each is drawn while nothing else is claiming attention.
 *
 * @param {{group:THREE.Group, apex:THREE.Vector3, lower:THREE.Mesh, upper:THREE.Mesh}} cone
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function addFocalSphereVisuals(cone, data) {
  lastFocal = focalSphereFor({
    angleDeg: sectionState.angleDeg,
    offset: sectionState.offset,
    generatorDeg: generatorAngleDeg(data),
    height: data.height,
  });
  focalParts = { cone: [cone.lower, cone.upper] };
  const shown = proofStageNow();
  if (!lastFocal || shown <= 0) { applyProofPhase(); return; }

  const focal = lastFocal;
  const apexY = data.height;
  const instrument = cssColor('--color-hp-line');
  const mark = cssColor('--color-conic-mark');
  const group = new THREE.Group();
  group.name = 'focal-sphere';
  const reach = data.baseLength / 2 + 1.15;

  // --- Stage 1 · the ball, inscribed in the cone and touching the cut ---------------
  const centre = new THREE.Vector3(0, apexY + focal.centreY, 0);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(focal.radius, 32, 20),
    new THREE.MeshBasicMaterial({
      color: instrument, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  ball.position.copy(centre);
  ball.name = 'focal-ball';
  group.add(ball);

  // A coarse wireframe over the fill: a smooth translucent ball reads as a smear, and the
  // meridians are what make it read as a SPHERE sitting inside the cone.
  const wireSource = new THREE.SphereGeometry(focal.radius, 16, 10);
  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(wireSource),
    new THREE.LineBasicMaterial({
      color: instrument, transparent: true, opacity: 0, depthWrite: false,
    }),
  );
  wireSource.dispose(); // the wireframe copied it; nothing else refers to it
  wire.position.copy(centre);
  group.add(wire);
  focalParts.ball = ball;
  focalParts.wire = wire;

  // --- Stage 3 · the ONE point where it meets the flat cut -------------------------
  // The claim of that stage is that there is exactly one such point, so the point is marked and
  // a ring pulses out of it — the drafting equivalent of pointing at it. It is BUILT here (the
  // parts are cheap and the phase pass decides what is visible), but it says nothing until the
  // stage that claims it.
  const focus = new THREE.Vector3(0, apexY + focal.focus.y, focal.focus.z);
  const dotR = Math.max(0.075, data.baseLength * 0.02);
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(dotR, 14, 10),
    new THREE.MeshBasicMaterial({ color: mark, depthTest: false, transparent: true }),
  );
  dot.position.copy(focus);
  dot.renderOrder = 5; // the point is the answer: never hidden by the ball around it
  dot.name = 'focal-point';
  group.add(dot);
  focalParts.dot = dot;

  // A soft glow behind the marker — a second, larger sphere at low opacity, which is how a
  // point reads as LIT on a flat-shaded scene with no post-processing to bloom it (ADR-096).
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(dotR * 2.4, 16, 12),
    new THREE.MeshBasicMaterial({
      color: mark, transparent: true, opacity: 0, depthTest: false, depthWrite: false,
    }),
  );
  glow.position.copy(focus);
  glow.renderOrder = 4;
  glow.name = 'focal-glow';
  group.add(glow);
  focalParts.glow = glow;

  // The pulse lies IN the cutting plane, so it reads as a mark made on the cut rather than as
  // a second sphere.
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(dotR * 1.5, dotR * 2.0, 32),
    new THREE.MeshBasicMaterial({
      color: mark, transparent: true, opacity: 0, side: THREE.DoubleSide, depthTest: false,
    }),
  );
  halo.position.copy(focus);
  halo.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
    buildSectionPlaneWorld(cone.apex).normal);
  halo.renderOrder = 4;
  halo.name = 'focal-halo';
  group.add(halo);
  focalParts.halo = halo;

  // A small square of the CUTTING plane, centred on that point (ADR-096). This is the topic's
  // one true point-tangency — the sphere rests on this plane at a single point, the way a ball
  // rests on a table — and a patch you can take in at a glance says so far better than the
  // full-size translucent plane behind it, which reads as scenery.
  const patch = tangentPatchFor(focal);
  const restGeo = new THREE.PlaneGeometry(patch.patch, patch.patch);
  const rest = new THREE.Mesh(restGeo, new THREE.MeshBasicMaterial({
    color: cssColor('--color-section-face'), transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  rest.quaternion.copy(halo.quaternion);   // the cutting plane's own orientation
  rest.position.copy(focus);
  rest.name = 'tangency-patch';
  rest.renderOrder = 2;
  const restEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(restGeo),
    new THREE.LineBasicMaterial({
      color: cssColor('--color-section-face'), transparent: true, opacity: 0,
    }),
  );
  rest.add(restEdge);
  group.add(rest);
  focalParts.patch = rest;
  focalParts.patchEdge = restEdge;

  // The caption for the one relationship that stage exists to establish. It is an annotation
  // like every other name in this topic — a pill on a leader ending at the point itself — so
  // there is no doubt about WHICH point it is talking about (RULES.md §3.36).
  if (shown === 3) {
    group.add(annotate('Touches here — one point only',
      'The cut is a flat plane, and a ball can rest on a flat plane at exactly one point. That is the focus.',
      focus, -1, -0.55, reach));
  }

  // --- Stage 3 onward · the point carries its name ---------------------------------
  if (shown >= 3) {
    // Both pills go LEFT: the drawing sheet's own card floats over the right of the viewport
    // from Step 4 onward, and a label that lands behind it names nothing.
    group.add(annotate('Focus',
      'The fixed point of the curve. It is the ONE point where the ball inside the cone touches the flat cut.',
      focus, -1, -0.55, reach));
  }

  // --- Stage 2 · the ring where the sphere touches the CONE ------------------------
  // NOT a point. §6.2: the sphere touches the CONE in a circle, and the tangent plane is the
  // plane containing that circle — so it necessarily passes THROUGH the ball, meeting it in
  // the very ring it is named for. That is the definition, not a rendering fault (ADR-095):
  // the distance from the ball's centre to this plane is t·sin²α while its radius is t·sinα,
  // and those are equal only for a degenerate cone. The ball is dimmed as the plane arrives,
  // and the ring is drawn heavy and depth-free, so what reads is the ring the two SHARE.
  if (shown >= 2) {
    const ringY = apexY + focal.contact.y;
    const ringPts = [];
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(
        focal.contact.r * Math.cos(a), ringY, focal.contact.r * Math.sin(a)));
    }
    const ringLine = fatLine(ringPts, instrument, 3.5);
    ringLine.name = 'focal-contact-ring';
    ringLine.renderOrder = 3;
    ringLine.material.depthTest = false; // it lies on the ball and on the cone at the same time
    group.add(ringLine);
    focalParts.ring = ringLine;
    // Named on the stage that explains it, and only there: from stage 4 on, the subject is the
    // PLANE through this ring, and two pills on one circle is the conflation this split exists
    // to end (ADR-097).
    if (shown === 2) {
      // LEFT, like every other pill in this step: the drawing-sheet card owns the right of the
      // viewport from Step 4 on, and a label behind it names nothing.
      group.add(annotate('Ring of contact — cone and ball',
        'The whole circle where the ball touches the cone. A cone is the same all the way round its axis, so the ball cannot touch it at just one place.',
        new THREE.Vector3(0, ringY, -focal.contact.r), -1, 0.45, reach));
    }
  }

  // --- Stage 4 · the flat plane laid through that ring -----------------------------
  if (shown >= 4) {
    const ringY = apexY + focal.contact.y;
    // The tangent plane, perpendicular to the axis (§6.2 item 1), drawn as an ANNULUS whose
    // inner edge IS the ring (ADR-096). A quad across this plane necessarily passes through the
    // ball — the plane meets the sphere in that very circle — and reads as a slice however it is
    // blended, depth-sorted or offset. An annulus starting at the circle puts NOTHING inside the
    // ball's silhouette: the ball sits in the hole, resting on the rim all the way round, which
    // is exactly the relationship §6.2 is describing.
    const patchT = tangentPatchFor(focal);
    const ringGeo = new THREE.RingGeometry(patchT.inner, patchT.outer, 96, 1);
    const quad = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: instrument, transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false,
    }));
    quad.rotation.x = -Math.PI / 2; // RingGeometry faces +Z; the tangent plane faces +Y
    quad.position.set(0, ringY, 0);
    quad.name = 'tangent-plane';
    quad.renderOrder = 2;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.RingGeometry(patchT.outer * 0.999, patchT.outer, 96, 1)),
      new THREE.LineBasicMaterial({ color: instrument, transparent: true, opacity: 0 }),
    );
    edge.rotation.x = 0; // already in the ring's own frame
    quad.add(edge);
    group.add(quad);
    focalParts.plane = quad;
    focalParts.planeEdge = edge;
  }

  // --- Stage 4 · where the two planes cross: the directrix -------------------------
  // The cutting plane is perpendicular to the V.P. and the tangent plane to the axis, so their
  // line of intersection always runs along X — see focalSphereFor(). It is drawn OUT from the
  // crossing point by scaling along its own length, so the learner watches it being produced.
  if (shown >= 5 && focal.directrix) {
    const half = Math.max(data.baseLength, data.height) * 0.95;
    const y = apexY + focal.directrix.y;
    const z = focal.directrix.z;
    const line = fatLine(
      [new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0)], mark, 3.5,
    );
    line.name = 'directrix-line';
    line.position.set(0, y, z);   // scaled about the crossing point, not about the origin
    line.scale.x = 0.001;
    group.add(line);
    focalParts.directrix = line;
    {
      group.add(annotate('Directrix',
        'The fixed line of the curve. It is where the plane through that ring crosses the cut.',
        new THREE.Vector3(0, y, z), -1, 0.75, reach, true));
    }
  }

  attachLeaders(group, Math.max(0.045, (data.baseLength / 2) * 0.035));
  shapeGroup.add(group);

  // Everything ELSE that is on screen (ADR-096). The tangency stages have one relationship to
  // show and a whole cut cone in front of it — the edge overlays, the section curve, the ghost
  // of the removed material and the axis are all full-strength ink competing with a translucent
  // ball. They are collected here, AFTER the rest of the build, and stood down by the phase pass
  // rather than being rebuilt per stage.
  //
  // The full-size cutting plane is collected separately because it does not merely dim: during
  // stage 1 it is REPLACED by the finite patch centred on the point of contact, which is the
  // whole reason that patch exists.
  focalParts.scenery = [];
  focalParts.sectionPlane = [];
  shapeGroup.traverse((obj) => {
    if (obj === group || group === obj.parent || isDescendantOf(obj, group)) return;
    const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
    for (const m of mats) {
      const entry = { m, base: m.opacity ?? 1, wasTransparent: m.transparent };
      if (obj.name === 'section-plane' || obj.parent?.name === 'section-plane') {
        focalParts.sectionPlane.push(entry);
      } else {
        focalParts.scenery.push(entry);
      }
    }
  });

  labelsDirty = true;
  applyProofPhase();
}

/** Whether `obj` sits anywhere under `root` — the proof's own parts must not be dimmed as
 *  scenery, and `traverse` gives no parentage information on its own. */
function isDescendantOf(obj, root) {
  for (let n = obj.parent; n; n = n.parent) if (n === root) return true;
  return false;
}

/**
 * Push `proofAnim` into the live materials. Called once at the end of every build and once per
 * frame while a stage is animating, so the two paths cannot drift: a rebuild in the middle of a
 * fade lands exactly where the fade had got to.
 */
function applyProofPhase() {
  const stage = proofStageNow();
  const { fade, pulse, draw, bridge } = proofAnim;
  const p = focalParts;

  // The cone steps back TWICE: while the two tangency stages are being read, so the ball and
  // the plane are all there is to look at (ADR-096), and again at the bridge, for good.
  // Stages 1-4 are the construction on the ball; the scene stands down for all of them.
  const tangency = stage >= 1 && stage <= 4;
  const quiet = tangency ? PROOF_OPACITY.coneQuiet : 1;
  for (const mesh of p.cone ?? []) {
    if (!mesh?.material) continue;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      m.transparent = true;
      m.opacity = Math.min(quiet, 1 - bridge * (1 - PROOF_OPACITY.coneDim));
    }
  }
  // The rest of the scene steps back with it — outlines, the section curve, the ghost, the axis.
  for (const s of p.scenery ?? []) {
    s.m.transparent = true;
    s.m.opacity = s.base * Math.min(quiet, 1 - bridge * (1 - PROOF_OPACITY.coneDim));
  }
  // The full-size cutting plane is GONE at stage 1: the finite patch centred on the point of
  // contact is standing in for it, and two versions of the same plane at once is the clutter
  // the patch was introduced to remove.
  // The full-size cutting plane is GONE while the ball's own contacts are the subject: at
  // stage 3 the finite patch centred on the point of contact stands in for it, and at stage 2
  // the ring must not compete with a whole plane.
  for (const s of p.sectionPlane ?? []) {
    s.m.transparent = true;
    s.m.opacity = stage === 2 || stage === 3 ? 0
      : s.base * (tangency ? PROOF_OPACITY.coneQuiet : 1);
  }
  if (!p.ball) return;

  // The ball fades in at stage 1, steps back once the plane through the ring arrives, and
  // leaves at the bridge.
  const alive = (1 - bridge) * (stage === 1 ? fade : 1) * (stage >= 4 ? 0.5 : 1);
  p.ball.material.opacity = PROOF_OPACITY.ballFill * alive;
  p.wire.material.opacity = PROOF_OPACITY.ballWire * alive;
  p.ball.visible = alive > 0.01;
  p.wire.visible = alive > 0.01;

  // The point of contact, and the ring pulsing out of it while the stage that CLAIMS it is up.
  // The point of contact belongs to stage 3. It is ABSENT at stage 2 — that stage is about the
  // ring, and a second highlight on screen is exactly the conflation being untangled (ADR-097).
  const claiming = stage === 3;
  p.dot.material.opacity = stage < 3 ? 0 : stage === 3 ? fade : 1;
  p.dot.visible = stage >= 3;
  p.dot.scale.setScalar(stage === 3 ? 1.45 : 1);
  if (p.halo) {
    const cycle = pulse % 1;
    p.halo.visible = claiming && fade > 0.98;
    p.halo.material.opacity = p.halo.visible ? 0.6 * (1 - cycle) : 0;
    p.halo.scale.setScalar(1 + 2.4 * cycle);
  }
  if (p.glow) {
    // Breathes with the pulse while the stage is claiming it, then settles to a steady halo.
    const lit = claiming ? fade * (0.55 + 0.45 * Math.sin(pulse * Math.PI * 2)) : 0;
    p.glow.material.opacity = 0.42 * lit;
    p.glow.visible = lit > 0.01;
  }

  // The ring of contact, and the plane fading in behind it.
  if (p.ring) {
    // Fades WITH the bridge rather than blinking off at the end of it: at half way through the
    // hand-over a fully opaque ring is the one thing on screen that has not moved.
    p.ring.material.transparent = true;
    p.ring.material.opacity = 1 - bridge;
    p.ring.visible = bridge < 0.995;
    // Heaviest, and breathing, on the stage that is ABOUT it.
    p.ring.material.linewidth = stage === 2
      ? 4.2 * (0.72 + 0.28 * Math.sin(pulse * Math.PI * 2))
      : 3;
  }
  // The finite patch of the CUTTING plane: the one-point tangency, shown while that is the
  // claim and taken away once it has been made.
  if (p.patch) {
    const on = stage === 3 ? fade : 0;
    p.patch.material.opacity = PROOF_OPACITY.patch * on;
    p.patchEdge.material.opacity = PROOF_OPACITY.patchEdge * on;
    p.patch.visible = on > 0.01;
  }
  if (p.plane) {
    const shownNow = (stage === 4 ? fade : 1) * (1 - bridge);
    p.plane.material.opacity = PROOF_OPACITY.plane * shownNow;
    p.planeEdge.material.opacity = PROOF_OPACITY.planeEdge * shownNow;
    p.plane.visible = shownNow > 0.01;
  }

  // The directrix is drawn OUT from the crossing point.
  if (p.directrix) p.directrix.scale.x = Math.max(0.001, stage === 5 ? draw : 1);
}

// ============================================================================
// The axis, drawn to Engineering Graphics convention.
//
// A solid's axis is a CENTRE LINE, and a centre line is never simply omitted
// because the material hides it: the portion the outline conceals is drawn as a
// hidden (short-dash) line so the reader can see the feature is there. So the
// axis ships in two parts, and is present whenever the cone is — it is part of
// how a cone is REPRESENTED, not a Step-1 annotation:
//
//   outside the outline   thin chain line (long dash · dot), depth-tested like
//                         any other visible edge — the stub every centre line
//                         projects past the solid it belongs to.
//   inside the outline    short-dash hidden linework in the hidden-edge token,
//                         drawn WITHOUT depth test so it reads through the cone.
//
// Both are geometry, not material trickery: an explicit segment list means the
// dash length is a drawing decision, and there is no computeLineDistances() to
// forget (the trap that renders LineDashedMaterial solid).
// ============================================================================

// The platform's own line constants, in WORLD units, taken from Module 1's Foundations
// (`src/annotations.js` CHAIN / OVERSHOOT) and Module 2's dashed-line standard. Both modules
// declare 1 unit = 10 mm, so the same numbers mean the same millimetres on every topic's
// drawing — which is the whole point of a convention. Do NOT rescale them per solid.
/** Centre line, Type G: long dash · gap · dot · gap. Even entries are ink. */
const CENTRE_LINE_PATTERN = [0.34, 0.12, 0.07, 0.12];
/** Hidden line, Type E: even short dashes — 0.12 / 0.08, Module 2's standard. */
const HIDDEN_LINE_PATTERN = [0.12, 0.08];
/** How far a centre line projects past the outline it belongs to (Foundations' OVERSHOOT). */
const CENTRE_LINE_OVERSHOOT = 0.35;

/**
 * Chop the axis segment y0 → y1 into a repeating ink/gap pattern, returning the point
 * PAIRS a THREE.LineSegments draws. Even entries are ink, odd entries are gap.
 *
 * @param {number} y0
 * @param {number} y1
 * @param {number[]} pattern  Ink/gap lengths in world units.
 * @returns {THREE.Vector3[]}
 */
function patternedAxis(y0, y1, pattern) {
  const points = [];
  const dir = Math.sign(y1 - y0) || 1;
  const span = Math.abs(y1 - y0);
  let at = 0;
  for (let i = 0; at < span; i += 1) {
    const next = Math.min(at + pattern[i % pattern.length], span);
    if (i % 2 === 0) {
      points.push(new THREE.Vector3(0, y0 + dir * at, 0), new THREE.Vector3(0, y0 + dir * next, 0));
    }
    at = next;
  }
  return points;
}

/**
 * The cone's axis as a centre line, visible stubs and concealed portion both.
 *
 * @param {import('./src/shapeData.js').ShapeData} data
 * @returns {THREE.Group}
 */
function buildAxisCentreLine(data, extent) {
  // The centre line belongs to the material that is actually there. Once the plane cuts, the
  // solid is shorter than the double cone that generated it, and an axis drawn to the old
  // full height would hang in empty space above the truncation.
  const whole = showUpperNappe ? 2 * data.height : data.height;
  const bottom = Math.min(extent?.bottom ?? 0, 0);
  const top = Math.min(extent?.top ?? whole, whole);
  const over = CENTRE_LINE_OVERSHOOT;
  const group = new THREE.Group();
  group.name = 'axis-centre-line';

  // 1 px is the right weight here, not a §3.13 slip: a centre line is a THIN line by
  // convention, and the fat-line stack is reserved for the linework that answers the
  // question (the section curve). Same call the edge overlay makes.
  const stubs = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints([
      ...patternedAxis(bottom - over, bottom, CENTRE_LINE_PATTERN),
      ...patternedAxis(top + over, top, CENTRE_LINE_PATTERN),
    ]),
    new THREE.LineBasicMaterial({ color: cssColor('--color-ink-secondary') }),
  );
  stubs.name = 'axis-visible';
  group.add(stubs);

  // The concealed run. depthTest off + a high renderOrder is what makes "the axis exists
  // inside the cone" legible, and the short dashes are what keep it reading as hidden
  // linework rather than as an edge. NOT the hidden-edge token: that grey is chosen to sit
  // against PAPER, and the cone's own fill is a warm grey of almost the same value — the
  // line vanished into the solid it is supposed to be seen through. The secondary ink is
  // the darkest tone still subordinate to the outline's --color-ink.
  const concealed = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(patternedAxis(bottom, top, HIDDEN_LINE_PATTERN)),
    new THREE.LineBasicMaterial({
      color: cssColor('--color-ink-secondary'),
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      depthWrite: false,
    }),
  );
  concealed.name = 'axis-hidden';
  concealed.renderOrder = 3;
  group.add(concealed);

  return group;
}

// ============================================================================
// Anatomy labels (§6.1 vocabulary) — live CSS2DObject DOM nodes, not baked
// sprites (RULES.md §3.27), so they stay vector-sharp and screen-reader
// readable. Shown on Step 1 only; the disposal contract removes their DOM.
//
// Each label is an ANNOTATION, not a floating word: it names one feature, it is
// tied to that feature by a leader line ending in a dot on it, and it is held at
// a fixed offset in SCREEN space (recomputed every frame from the camera basis)
// so it stays clear of the silhouette at every orbit angle. Hovering one for a
// beat explains the term in a sentence — the vocabulary of §6.1 and nothing
// beyond it, because Step 1 is the only step that shows these.
// ============================================================================

/** Live annotations for the frame loop. Each: the pill, the feature it points at, and the
 *  screen-space side/lift that keeps it off the solid. Cleared by rebuild(). */
let annotations = [];
/** The leader lines: [occluded, drawn-through], each one LineSegments whose positions are
 *  rewritten each frame. @type {THREE.LineSegments[]|null} */
let leaderLines = null;
/** Set when the camera or the model moved, so the declutter pass runs at most once a frame
 *  and not at all while the scene is still. */
let labelsDirty = true;

/**
 * One annotation: a pill naming `text`, a leader line back to `target`, and a dot on the
 * feature itself.
 *
 * @param {string} text    The name, as it appears on screen.
 * @param {string} tip     One plain-English sentence, shown on hover (see setupLabelTips).
 * @param {THREE.Vector3} target  The point on the cone being named.
 * @param {number} side    -1 to sit the pill left of the feature, +1 to sit it right.
 * @param {number} lift    Vertical screen-space offset, in world units.
 * @param {number} reach   Horizontal screen-space offset, in world units.
 * @param {boolean} [through]  Draw the leader and its dot THROUGH the solid. Reserved for
 *   the axis: the centre line itself is drawn through the cone, so a leader that stopped at
 *   the silhouette would appear to name the surface it stopped on. Every other feature is a
 *   surface feature, and its leader is occluded like any other line.
 */
function annotate(text, tip, target, side, lift, reach, through = false) {
  const el = document.createElement('span');
  el.className = 'vlabel';
  el.textContent = text;
  el.dataset.tip = tip;
  el.tabIndex = 0; // reachable by keyboard, so the explanation is not mouse-only
  const object = new CSS2DObject(el);
  object.position.copy(target); // real anchor is written by updateAnnotations() each frame
  annotations.push({ object, el, target: target.clone(), side, lift, reach, through });
  return object;
}

/**
 * Name the parts of the cone §6.1's opening paragraph defines — apex, base, axis,
 * generator, nappe — and nothing else. Any term belonging to a later step is introduced
 * by that step (ADR-141 · RULES.md §6.31).
 *
 * Label visibility follows GEOMETRY visibility: "nappe" only means something when the
 * double cone is on screen, so both nappe labels leave with the second half.
 *
 * @param {{group:THREE.Group, apex:THREE.Vector3}} cone
 * @param {import('./src/shapeData.js').ShapeData} data
 */
function addAnatomyLabels(cone, data) {
  const r = data.baseLength / 2;
  const h = data.height;
  const group = new THREE.Group();
  group.name = 'anatomy-labels';

  // Held clear of the widest rim the sliders can dial, so the pill never lands on the solid.
  const reach = r + 1.15;

  group.add(annotate('Apex', 'The sharp tip where all the sloping lines meet.',
    new THREE.Vector3(0, h, 0), 1, 0.55, reach * 0.7));
  group.add(annotate('Generator', 'The straight sloping line that sweeps out the cone’s surface.',
    new THREE.Vector3(r * 0.5, h * 0.5, 0), 1, 0.1, reach));
  group.add(annotate('Axis', 'The imaginary centre line the cone is built around.',
    new THREE.Vector3(0, h * 0.3, 0), 1, -0.85, reach * 0.95, true));
  group.add(annotate('Base', 'The flat circular face at the bottom.',
    new THREE.Vector3(0, 0, r), -1, -0.7, reach * 0.75));
  if (showUpperNappe) {
    group.add(annotate('Lower nappe', 'One half of the double cone.',
      new THREE.Vector3(-r * 0.5, h * 0.5, 0), -1, 0.1, reach));
    group.add(annotate('Upper nappe', 'The other half — the surface carries on past the tip.',
      new THREE.Vector3(-r * 0.5, h * 1.5, 0), -1, 0.1, reach));
  }

  attachLeaders(group, Math.max(0.045, r * 0.035));
  shapeGroup.add(group);
  labelsDirty = true;
}

/**
 * Give every annotation added since the last rebuild its leader line and its terminating dot.
 * Called ONCE per build, after all the `annotate()` calls that belong to the current step —
 * the buffers are sized from `annotations`, so a second call would orphan the first set.
 * Step 1's anatomy labels and Step 4's focal-sphere labels never coexist, which is what makes
 * one shared pair of buffers correct.
 *
 * @param {THREE.Group} group      The group the leaders and dots are added to.
 * @param {number} dotRadius       World-unit radius of the terminating dot.
 */
function attachLeaders(group, dotRadius) {
  // Two buffers, one occluded by the solid and one drawn through it, each sized once and
  // rewritten in place every frame (the pills move with the camera, so their leaders have to
  // as well). A dot terminates each leader on the feature — the drafting convention for a
  // leader landing on a face rather than on an edge.
  const dotGeo = new THREE.SphereGeometry(dotRadius, 8, 6);
  leaderLines = [false, true].map((through) => {
    const members = annotations.filter((ann) => ann.through === through);
    members.forEach((ann, slot) => { ann.slot = slot; ann.buffer = through ? 1 : 0; });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(members.length * 6), 3));
    const material = new THREE.LineBasicMaterial({
      color: cssColor('--color-ink-secondary'),
      transparent: true,
      opacity: through ? 0.9 : 0.7,
      depthTest: !through,
      depthWrite: !through,
    });
    const lines = new THREE.LineSegments(geometry, material);
    lines.name = through ? 'label-leaders-through' : 'label-leaders';
    lines.frustumCulled = false; // the buffer is rewritten per frame, so its bounds lie
    if (through) lines.renderOrder = 4;
    group.add(lines);

    const dotMat = new THREE.MeshBasicMaterial({
      color: cssColor('--color-ink-secondary'),
      transparent: through,
      depthTest: !through,
      depthWrite: !through,
    });
    for (const ann of members) {
      const dot = new THREE.Mesh(dotGeo, dotMat); // shared geometry: disposed by the
      dot.position.copy(ann.target);              // traversal, which tolerates repeats
      if (through) dot.renderOrder = 4;
      group.add(dot);
    }
    return lines;
  });
}

/**
 * Hold every pill at its screen-space offset from the feature it names and redraw its
 * leader. Called each frame before the CSS2D pass: the offsets are applied along the
 * CAMERA's right/up axes, so a label that starts clear of the silhouette stays clear of it
 * however the learner orbits — the alternative (fixed world anchors) swings labels across
 * the solid the moment the view turns.
 */
function updateAnnotations() {
  if (annotations.length === 0 || !leaderLines) return;

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());

  for (const ann of annotations) {
    const anchor = ann.target.clone()
      .addScaledVector(right, ann.side * ann.reach)
      .addScaledVector(up, ann.lift);
    ann.object.position.copy(anchor);
    leaderLines[ann.buffer].geometry.getAttribute('position').array
      .set([ann.target.x, ann.target.y, ann.target.z, anchor.x, anchor.y, anchor.z], ann.slot * 6);
  }
  for (const lines of leaderLines) lines.geometry.getAttribute('position').needsUpdate = true;
}

/**
 * Keep the pills from covering each other and from leaving the viewport. Runs only after
 * something moved (labelsDirty) and only while Step 1's labels exist, so the six
 * getBoundingClientRect reads never become a per-frame layout cost.
 *
 * The nudge is written to the CSS `translate` property, which composes with — rather than
 * fights — the `transform` CSS2DRenderer owns.
 */
function declutterLabels() {
  if (!labelsDirty || annotations.length === 0) return;
  labelsDirty = false;

  const bounds = viewport.getBoundingClientRect();
  const MARGIN = 6;

  for (const ann of annotations) ann.el.style.translate = '';
  const placed = annotations
    .filter((ann) => ann.el.style.display !== 'none')
    .map((ann) => ({ ann, rect: ann.el.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top);

  const taken = [];
  for (const item of placed) {
    let dx = 0;
    let dy = 0;
    // Push down past anything already placed that this pill would sit on top of.
    for (const other of taken) {
      const top = item.rect.top + dy;
      const bottom = item.rect.bottom + dy;
      const overlaps = top < other.bottom && bottom > other.top
        && item.rect.left + dx < other.right && item.rect.right + dx > other.left;
      if (overlaps) dy += other.bottom - top + 2;
    }
    // Then keep the whole pill inside the viewport.
    if (item.rect.left + dx < bounds.left + MARGIN) dx = bounds.left + MARGIN - item.rect.left;
    if (item.rect.right + dx > bounds.right - MARGIN) dx = bounds.right - MARGIN - item.rect.right;
    if (item.rect.top + dy < bounds.top + MARGIN) dy = bounds.top + MARGIN - item.rect.top;
    if (item.rect.bottom + dy > bounds.bottom - MARGIN) dy = bounds.bottom - MARGIN - item.rect.bottom;

    if (dx || dy) item.ann.el.style.translate = `${dx}px ${dy}px`;
    taken.push({
      top: item.rect.top + dy,
      bottom: item.rect.bottom + dy,
      left: item.rect.left + dx,
      right: item.rect.right + dx,
    });
  }
}

// ============================================================================
// Label tooltips — one plain-English sentence per named part, on a deliberate
// hover. The delay is what keeps them out of the way: a learner sweeping the
// mouse across the viewport never triggers one, and a learner who stops on a
// word they do not know gets it explained without leaving the step.
//
// The sentence lives on the pill (`data-tip`, written by annotate()) and is
// shown in ONE shared node, so there is never a second tooltip on screen and
// nothing to leak when rebuild() destroys the pills.
// ============================================================================

/** ms of hover before the tooltip opens (the brief's 1–2 s). Focus opens it at once —
 *  a keyboard user has already committed to the label by tabbing to it. */
const LABEL_TIP_DELAY = 1200;

let labelTipEl = null;
let labelTipTimer = null;
let labelTipOwner = null;

/** Close an OPEN tooltip, leaving any pending hover alone. Used when the view moves: an
 *  open explanation has stopped pointing at what the cursor is over, but a hover the learner
 *  is still holding must survive — the camera drifts to a stop under damping long after they
 *  stopped dragging, and cancelling on every one of those frames made the tooltip unopenable. */
function dismissLabelTip() {
  labelTipOwner?.removeAttribute('aria-describedby');
  labelTipOwner = null;
  if (labelTipEl) labelTipEl.hidden = true;
}

/** Close the tooltip AND cancel any hover waiting to open one. */
function hideLabelTip() {
  clearTimeout(labelTipTimer);
  dismissLabelTip();
}

/**
 * Open the tooltip under `pill`, flipped above when there is no room below and clamped
 * inside the viewport so it can never be cut off by the pane edge.
 * @param {HTMLElement} pill
 */
function showLabelTip(pill) {
  const tip = pill.dataset.tip;
  // A rebuild between the hover and the delay expiring destroys the pill it belonged to.
  if (!labelTipEl || !tip || !pill.isConnected) return;

  labelTipEl.textContent = tip;
  labelTipEl.hidden = false;

  const bounds = viewport.getBoundingClientRect();
  const anchor = pill.getBoundingClientRect();
  const box = labelTipEl.getBoundingClientRect();
  const MARGIN = 8;

  let top = anchor.bottom - bounds.top + 8;
  if (top + box.height > bounds.height - MARGIN) top = anchor.top - bounds.top - box.height - 8;
  let left = anchor.left + anchor.width / 2 - box.width / 2 - bounds.left;
  left = Math.min(Math.max(left, MARGIN), bounds.width - box.width - MARGIN);

  labelTipEl.style.top = `${Math.max(MARGIN, top)}px`;
  labelTipEl.style.left = `${left}px`;

  pill.setAttribute('aria-describedby', 'vlabel-tip');
  labelTipOwner = pill;
}

/**
 * Wire the tooltip once, by delegation on the CSS2D overlay — the pills themselves are
 * created and destroyed by every rebuild(), so per-pill listeners would have to be rebound
 * on each one. pointerover/pointerout are used rather than mouseenter/mouseleave because
 * only the bubbling pair reaches the container.
 */
function setupLabelTips() {
  labelTipEl = document.getElementById('vlabel-tip');
  if (!labelTipEl) return;
  const overlay = labelRenderer.domElement;

  overlay.addEventListener('pointerover', (e) => {
    const pill = e.target.closest?.('.vlabel');
    if (!pill || pill === labelTipOwner) return;
    hideLabelTip();
    labelTipTimer = setTimeout(() => showLabelTip(pill), LABEL_TIP_DELAY);
  });
  overlay.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('.vlabel')) hideLabelTip();
  });
  overlay.addEventListener('focusin', (e) => {
    const pill = e.target.closest?.('.vlabel');
    if (pill) showLabelTip(pill);
  });
  overlay.addEventListener('focusout', hideLabelTip);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLabelTip(); });
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
  // The canvas lives in a BOX inside the pane rather than in the pane itself (ADR-105). Step 5
  // shrinks that box to the thumbnail rect and lets the drawing fill the pane behind it; the
  // pane keeps its place in the flex row either way, which is what stops the step panel from
  // being uncovered and then covered by the full-bleed drawing.
  viewBox = document.createElement('div');
  viewBox.id = 'view-box';
  container.appendChild(viewBox);
  viewBox.appendChild(renderer.domElement);

  // CSS2D overlay for the anatomy labels — live DOM, never intercepting the orbit drag.
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none'; // the pills opt back in (.vlabel)
  labelRenderer.domElement.style.overflow = 'hidden';    // a pill can never spill the pane
  viewBox.appendChild(labelRenderer.domElement);
  // The thumbnail's own title bar belongs to the box it titles.
  const declaredHead = document.getElementById('view-head');
  if (declaredHead) viewBox.appendChild(declaredHead);

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
  // The pills are placed in screen space, so a camera move is what makes their collision
  // check stale. Orbiting also moves the pill out from under the cursor, so any open
  // tooltip has stopped describing what is being pointed at.
  controls.addEventListener('change', () => { labelsDirty = true; dismissLabelTip(); });
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

  tickTweens(delta);   // advance any domain animations (pauses with the loop)
  tickProofPulse(delta / 1000); // Step 4's free-running highlight (no end state to tween to)
  controls.update();   // applies damping inertia
  updateAnnotations(); // hold each pill at its screen-space offset, redraw its leader
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  declutterLabels();   // no-op unless the view moved AND Step 1's labels are up
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
  // Always measure the BOX the canvas is in, never the pane around it: in Step 5 the pane is
  // full width and the box is the thumbnail (ADR-105).
  const target = viewBox ?? container;
  const w = target.clientWidth;
  const h = target.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  // LineMaterial renders in screen px — its resolution must track the drawing buffer
  // or the fat section curve stretches (CLAUDE.md LineMaterial gotcha, RULES.md §3.16).
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  for (const material of lineMaterials) material.resolution.copy(size);
  labelsDirty = true; // the pane moved: re-check the pills against its new edges
  dismissLabelTip();  // an open tooltip is placed against the old pane
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

  // The banner is fixed to the top of the iframe, so it SITS ON the sim rather than beside it
  // — and at 390px it covered 66px of a 287px viewport, which is where the drawing sheet's own
  // Minimize button lives. An advisory that hides the control it is advising about is worse
  // than no advisory (ADR-123). The body reserves its measured height for as long as it is up,
  // and hands it straight back on Dismiss. Measured rather than assumed: the copy wraps to two
  // lines on a 320px screen and to one at 767px.
  const reserve = () => {
    const up = !notice.hidden;
    document.body.classList.toggle('notice-up', up);
    document.body.style.setProperty('--notice-h',
      up ? `${Math.ceil(notice.getBoundingClientRect().height)}px` : '0px');
  };
  const sync = () => { notice.hidden = !mq.matches || dismissed; reserve(); };
  dismiss.addEventListener('click', () => { dismissed = true; sync(); });
  mq.addEventListener('change', sync);
  new ResizeObserver(reserve).observe(notice);
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
// delegates every curve and construction line to src/conicEngine.js (ADR-139).
// Pan (ADR-054) and wheel zoom (ADR-055) are pure post-multipliers over the
// fixed intrinsic frame (ADR-053 pattern).
// ============================================================================

const COMPARE_DEFAULT_SIZE = 'expanded';

let compareCard = null;
let compareCanvas = null;
let compareChip = null;
/** The sized box holding the WebGL canvas and its label overlay (ADR-105). */
let viewBox = null;
let compareOpen = false;      // the card is shown at all (compact OR expanded)
let compareSize = 'compact';  // 'compact' | 'expanded'
let workbenchOpen = false;
/** Step 5 WANTS the sheet-primary workspace; `sheetPrimaryOn` is whether it is mounted. The two
 *  differ whenever the learner expands to the workbench or the viewport is too narrow for it. */
let sheetPrimary = false;
let sheetPrimaryOn = false;
/** Which pane leads Step 5's workspace: 'drawing' (the default) or 'cone' (ADR-102). */
let paneFocus = 'drawing';
/** Is the THUMBNAIL (whichever pane is currently small) collapsed to its chip? (ADR-103) */
let thumbMin = false;
/** What that state was when Compare Mode was entered, so leaving restores it (ADR-109). */
let thumbMinBeforeCompare = false;
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
/** Below this the plane is ON the apex and every tilt gives a triangle (classifySection's own
 *  APEX_EPS is 0.05; this is comfortably clear of it). */
const APEX_CLEARANCE = 0.2;
/** Where to lift it to — the offset the tour's own conic presets use. */
const APEX_ESCAPE = -1.2;
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

  // Compare Mode's control strip (ADR-109): the cone and the cut, docked beneath both panes so
  // the learner can change the solid and watch BOTH pictures answer. The wrappers are MOVED,
  // not copied — same elements, same listeners, same state; `driverHomes` remembers where each
  // came from so exiting puts it back exactly.
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

/**
 * Step 5's drawing workspace (ADR-100): the sheet becomes the LEFT and primary pane at roughly
 * two thirds of the bench, and the cone shrinks to a live reference on the right. By Step 5 the
 * learner has finished with the solid — the question is no longer what the curve is but how it
 * is drawn — so the pane that answers it should be the one they can see.
 *
 * It re-parents the card exactly the way {@link enterWorkbench} does, because the compact card
 * anchors absolutely inside `#sim-viewport` and that is now only part of the bench. It does NOT
 * move the controls to the rail: Step 5's dock IS its controls, and the wizard keeps its column.
 *
 * @param {boolean} on
 */
function applySheetPrimary(on) {
  if (on === sheetPrimaryOn) return;
  sheetPrimaryOn = on;
  if (!on) {
    thumbMin = false;                       // a minimized thumbnail belongs to this mode only
    document.body.classList.remove('thumb-min');
  }
  syncPaneFocus();
  updateCompareChip();
}

/** One line of truth for which view is full-bleed. Step 4 IS the no-class state. */
function syncPaneFocus() {
  document.body.classList.toggle('drawing-main', sheetPrimaryOn && paneFocus === 'drawing');
  syncSheetDock();
}

/**
 * The thumbnail has ONE box on every step, and no step gets a sizing mode of its own (ADR-125,
 * superseding ADR-120).
 *
 * There is a single card element, `#compare-card`, and its rect comes from a single rule,
 * `.compare-card[data-size="compact"]`. Step 5 does not size it differently — `body.drawing-main`
 * SWAPS which of the two panes is the big one and which is the card, and the card's rules are
 * untouched by that. So "make Step 4 use Step 5's thumbnail layout" is not a refactor toward a
 * shared component: the component was always shared, and the fix was to delete the one mode that
 * had been overriding it.
 *
 * That mode was ADR-120's `body.sheet-docked`, a full-height column on Steps 4 and 6. It is gone.
 * Deleting the override is the fix; adding a third selector to defeat it would have been the bug.
 *
 * What survives here is `sheet-solo`, which is NOT a second size — below 768px there is no room
 * for a card and a solid at once, so the sheet becomes the other VIEW and the pane behind it stops
 * painting (ADR-123). `thumb-min` is what takes it away again, which is how the corner cluster's
 * Restore chip becomes the switch.
 */
function syncSheetDock() {
  const roomForTwo = isWorkbenchViewport();
  document.body.classList.toggle('sheet-solo', !roomForTwo && compareOpen && !thumbMin);
}

/**
 * Which view is the main one. The Compare menu is a view SELECTOR and nothing else (ADR-105):
 * it swaps which pane is full-bleed and which floats over it, and never replaces the interface.
 * Step 4 and Step 5 are the same layout — Step 5 simply starts on the other one.
 *
 * @param {'drawing'|'cone'} which
 */
function setPaneFocus(which) {
  if (paneFocus === which) return;
  paneFocus = which;
  syncPaneFocus();
  updateCompareChip();
  remeasureAfterReflow();
  notifyStateChange();
  announce(which === 'cone'
    ? 'The cone is the main view; the drawing sheet is the thumbnail.'
    : 'The drawing sheet is the main view; the cone is the thumbnail.');
}

/** Set the compare footprint and mount/unmount the workbench to match. */
function applyCompareSize(size) {
  const wantSplit = size === 'expanded' && isWorkbenchViewport();
  compareSize = wantSplit ? 'expanded' : 'compact';
  if (compareCard) compareCard.dataset.size = compareSize;
  if (wantSplit) enterWorkbench();
  else exitWorkbench();
  // The workbench split and the Step 5 workspace are two different grids over the same body;
  // only one may be mounted, and expanding out of Step 5 hands the bench to the workbench.
  applySheetPrimary(sheetPrimary && !wantSplit && isWorkbenchViewport());
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
  // Every transition that changes which views are on screen comes through here, so this is
  // where the sheet's docked/floating state is settled too (ADR-120).
  syncSheetDock();
  // Compare names the ACTION (ADR-108): it enters the side-by-side comparison, and once there
  // it is the way back to the lesson.
  const inCompare = compareSize === 'expanded';
  compareChip?.setAttribute('aria-pressed', String(inCompare));
  const chipLabel = document.getElementById('compare-chip-label');
  if (chipLabel) chipLabel.textContent = inCompare ? 'Back to 3D' : 'Compare';

  // Switch view has no job before Step 5: until then the lesson decides which view leads, and
  // Compare is the one control a learner needs. It is Step 5's own control (ADR-108).
  const switchBtn = document.getElementById('switch-view');
  if (switchBtn) switchBtn.hidden = !sheetPrimaryOn || inCompare;

  // A thumbnail head belongs to whichever view is FLOATING, and only outside Compare Mode —
  // side by side there are no thumbnails, so there is nothing to minimize.
  const viewHead = document.getElementById('view-head');
  if (viewHead) viewHead.hidden = !sheetPrimaryOn || inCompare || paneFocus !== 'drawing' || thumbMin;
  const cardMin = document.getElementById('compare-min');
  if (cardMin) cardMin.hidden = inCompare || (sheetPrimaryOn && paneFocus === 'drawing');

  const restore = document.getElementById('thumb-restore');
  const label = document.getElementById('thumb-restore-label');
  if (restore) restore.hidden = !thumbMin || inCompare;
  if (label) {
    label.textContent = `Restore ${sheetPrimaryOn && paneFocus === 'drawing' ? '3D' : 'drawing'}`;
  }
}

/** Collapse the current thumbnail to its chip, or bring it back (ADR-103). */
function setThumbMinimized(on) {
  if (thumbMin === on) return;
  thumbMin = on;
  document.body.classList.toggle('thumb-min', on);
  updateCompareChip();
  remeasureAfterReflow();
  const which = sheetPrimaryOn && paneFocus === 'drawing' ? 'The 3D view' : 'The drawing sheet';
  announce(on ? `${which} is minimized. Its button on the left brings it back, as it was.`
    : `${which} is back.`);
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
    // Step 5 has its own two-pane workspace, so reopening the sheet there must return to IT,
    // not to the 50/50 workbench — which collapses the wizard and moves Step 5's own controls
    // into the rail, leaving the learner with no way to play the construction (ADR-102).
    const fallback = sheetPrimary || !isWorkbenchViewport() ? 'compact' : COMPARE_DEFAULT_SIZE;
    applyCompareSize(size || fallback);
    // Redraw EXPLICITLY on every open. Nothing repaints the sheet while it is closed, so its
    // canvas holds whatever was last painted; the resize path happens to redraw today, which
    // makes the freshness incidental rather than guaranteed. This makes it the contract.
    drawCompare();
    updateCompareChip();
    if (!wasOpen) {
      announce('Drawing sheet opened.');
      onboarding?.spotlight('drawing-sheet'); // first-seen only
    }
  },
  hide() {
    if (!compareOpen) return;
    compareOpen = false;
    const wasDocked = workbenchOpen || sheetPrimaryOn;
    if (workbenchOpen) exitWorkbench(); // tear the split down before the card vanishes
    applySheetPrimary(false);           // …and likewise the Step 5 workspace grid
    if (compareCard) compareCard.hidden = true;
    updateCompareChip();
    announce('Drawing sheet closed.');
    if (wasDocked) remeasureAfterReflow(); // hand the width back, resize the renderer
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
  // The Step 5 workspace animates its column widths, and `remeasureAfterReflow` runs two frames
  // in — while the transition is still moving. Without this the canvas keeps whatever width it
  // had mid-flight and the drawing is left scaled to a pane that no longer exists (ADR-102).
  document.body.addEventListener('transitionend', (ev) => {
    if (ev.target === document.body && ev.propertyName === 'grid-template-columns') {
      handleResize(viewport);
      if (compareOpen) drawCompare();
    }
  });

  // COMPARE MODE (ADR-108). Compare is a MODE toggle: it puts the 3-D on the left and the
  // sheet on the right, side by side and nothing else, so a learner can watch the plane drive
  // the drawing. Pressing it again comes straight back to the lesson — same step, same curve,
  // same sliders, same camera. Only the layout changes.
  compareChip?.addEventListener('click', () => {
    if (compareSize === 'expanded') {
      applyCompareSize('compact');
      // Put the lesson back the way it was found, including a thumbnail that was minimized.
      if (thumbMinBeforeCompare) setThumbMinimized(true);
      announce('Back to the lesson.');
    } else {
      // Compare Mode ALWAYS builds both panes (ADR-109). Whether the lesson's thumbnail was
      // minimized, hidden or closed is a fact about the lesson, not about this mode — it is
      // remembered, cleared, and handed back on the way out.
      thumbMinBeforeCompare = thumbMin;
      setThumbMinimized(false);
      // The tilt is the ONLY plane control in this mode (ADR-110), and a plane sitting on the
      // apex makes an isosceles triangle at EVERY tilt — no conic is reachable and there is no
      // longer a control to escape with. Lift it just clear of the tip, which is the one state
      // change entering Compare Mode may make, and only from a state its own control cannot
      // undo. Verified: from the apex, tilts of 0/30/62/80° all read "no curve at all".
      // Cancel any plane move still in flight, or its onComplete lands after this and puts
      // the plane back where it was going.
      tourTween?.cancel();
      tourTween = null;
      if (Math.abs(sectionState.offset) <= APEX_CLEARANCE) {
        // Through the same single path every other section edit takes (ADR-059) — and then the
        // state-change bus, which `commitSection` does not fire itself: without it the geometry
        // moves while the slider and the readout beside it keep describing the old plane.
        simController.commitSection({ offset: APEX_ESCAPE });
        notifyStateChange();
      }
      if (!compareOpen) compare.show('compact');
      applyCompareSize('expanded');
      announce('Compare mode: the cone and the drawing side by side.');
    }
    updateCompareChip();
  });

  // Minimize is the thumbnail's ONLY control (ADR-115), from either head; one chip brings it
  // back, exactly where it was. Close is gone from both heads — it collapsed the same thumbnail
  // to the same chip, so it was a second button for one outcome, and having it there is what
  // made a reference view read as a window to be managed.
  document.getElementById('compare-min')?.addEventListener('click', () => setThumbMinimized(true));
  document.getElementById('view-min')?.addEventListener('click', () => setThumbMinimized(true));
  document.getElementById('thumb-restore')?.addEventListener('click', () => setThumbMinimized(false));

  // Switch view: swap main and thumbnail, with no menu in the way. Compare's only job is to
  // open the menu; this is the one-press version of the same swap.
  document.getElementById('switch-view')?.addEventListener('click', () => {
    if (!compareOpen) compare.show('compact');
    setThumbMinimized(false);
    setPaneFocus(paneFocus === 'drawing' ? 'cone' : 'drawing');
  });


  // ISSUE 5 (ADR-106) — the Fullscreen control is gone from the thumbnail: Compare and Switch
  // view both promote a view to the full main panel, so expanding a card said nothing new. The
  // compare-split workbench remains in the code but no longer has a UI entry point.

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
 * learner works in 3D (ADR-141).
 */
function sheetMode(state = conicState) {
  // §6.6's properties take the sheet over while they are being shown, and only for the curve
  // they belong to (ADR-093).
  if (state.propsOpen && state.curve === 'Parabola') return 'props';
  // Step 5 is the construction — and Step 5 ALONE. Step 6 asks the learner to name a cut, so its
  // sheet is that cut, not the drawing left over from the step before it (ADR-117).
  if (stage === 5) return state.method === ECCENTRICITY_METHOD ? 'eccentricity' : 'methods';
  // While the sheet draws the cut it draws what the cut IS, and three of §6.1's six
  // sections are not plane conics (ADR-090). The terminology sheet is a conic's own figure, so
  // it too waits for a cut that has one.
  if (sheetDrawsCut()) {
    const kind = state.cutKind ?? 'conic';
    if (kind !== 'conic') return kind === 'none' ? 'nothing' : kind;
  }
  if (stage === 4) return state.showNames ? 'terms' : 'locus';
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

  // Every step draws from ITS OWN sheet state (ADR-117), never from whatever the step before it
  // left behind. For Steps 1–5 that is the stored state; for Step 6 it is the live cut, derived
  // fresh on every paint so the thumbnail tracks the plane as the question is dealt.
  const source = sheetSourceState();
  const layout = layoutFor(sheetMode(source), source);
  sheetResults = layout.results ?? [];

  // Fixed intrinsic frame (ADR-053 pattern): px per mm from the analytic bbox. The margin
  // scales with the stage because the bbox covers the LINEWORK only — labels are chrome
  // and hang outside it (letting them drive the scale would shrink the drawing), so the
  // clear band around the drawing has to grow with the card or the outermost captions
  // clip against its edge.
  // The terminology figure carries the longest captions in the topic — "Auxiliary circle ·
  // minor diameter" is 32 characters hung off the left of the drawing — so it gets a wider
  // band than the constructions, whose captions are short (ADR-092).
  const marginScale = layout.mode === 'terms' ? 0.16 : 0.11;
  const marginPx = Math.min(110, Math.max(40, Math.round(Math.min(w, h) * marginScale)));
  // …and captions hang SIDEWAYS further than they hang up and down: "Axis", "Directrix, DD",
  // "Double ordinate (base) 120" all run off the ends of the linework, while nothing much runs
  // off the top. A square-ish pane hides that, because height binds the scale first and leaves
  // width to spare. A tall narrow one does not — docking the sheet into its own column (ADR-120)
  // made width the binding constraint and clipped "Axis" at the edge on the very first frame.
  // So the horizontal band carries a few characters' worth of extra room.
  const marginX = Math.min(140, marginPx + Math.round(parseFloat(sheetFont()) * 2.4));
  const nomW = Math.max(layout.bbox.maxX - layout.bbox.minX, 1e-6);
  const nomH = Math.max(layout.bbox.maxY - layout.bbox.minY, 1e-6);
  const scale = Math.min((w - 2 * marginX) / nomW, (h - 2 * marginPx) / nomH); // px per mm

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

  // Kept so the pointer handlers can hit-test exactly what was painted, at exactly the
  // scale and pan it was painted at — no second projection to drift out of step.
  sheetView = view;
  sheetLayout = layout;
  if (sheetHover && !layout.items.includes(sheetHover)) sheetHover = null;
  // A term hovered in the panel is re-resolved against THIS layout, so it survives the repaint
  // that the highlight itself triggers.
  if (hoverTerm) {
    sheetHover = layout.items.find((i) => i.k === 'label' && i.text === hoverTerm) ?? sheetHover;
  }

  drawSheet(ctx, view, layout, {
    ink: cssVar('--color-ink'),
    construction: cssVar('--color-ink-secondary'),
    curve: cssVar('--color-section-face'),
    mark: cssVar('--color-conic-mark'),
    // The sheet's own background, so a caption can clear the paper behind itself and stay
    // legible where it has to cross linework (ADR-116). Not a new colour — the same token the
    // canvas was filled with two calls up.
    paper: cssVar('--color-paper'),
    font: sheetFont(),
  }, {
    showConstruction: source.showConstruction !== false,
    // Step 6's question IS "which section is this", so until the learner commits, the sheet may
    // draw the cut but must not name it — three of the six sheets say what they are in words
    // (ADR-117). Once an answer is in, the dock has already said the name, so the caption may.
    anonymous: stage === 6 && !quiz.chosen,
    highlight: sheetHover,
    // Only while the learner is actually walking a construction: a finished drawing is never
    // dimmed (ADR-099).
    stepping: buildPlayed && buildStagesFor(conicState.method) !== null,
    reveal: curveReveal,
  });
}

// ============================================================================
// Sheet hover (ADR-088) — pointing at a line on the drawing says what it is FOR.
// The engine owns the vocabulary (it drew the captions); this end owns the DOM.
// ============================================================================

/** The view + layout of the last paint, so a hit-test matches what is on screen. */
let sheetView = null;
let sheetLayout = null;
/**
 * What the last paint MEASURED — the quantities this construction yields, which the dock lists
 * beside it (ADR-091). Every exercise in the chapter that ends in "measure", "determine",
 * "find" or "locate" is asking for one of these; a drawing that contains the answer without
 * stating it leaves the learner guessing at what they were meant to read off.
 * @type {Array<{label:string, value:number, unit:string, from:string}>}
 */
let sheetResults = [];
/** The display-list item currently under the cursor, re-drawn with a highlight. */
let sheetHover = null;
/** The caption the Engineering Terms panel is pointing at, resolved afresh on every paint. */
let hoverTerm = null;
let sheetTipEl = null;

/** Move the sheet's explanation chip to the cursor, or take it away. `x`/`y` are relative to
 *  the stage — the tip's positioned ancestor — so they are the canvas-relative coordinates
 *  the hit-test already works in. */
function showSheetTip(text, x, y, stage) {
  sheetTipEl ??= document.getElementById('sheet-tip');
  if (!sheetTipEl) return;
  if (!text) { sheetTipEl.hidden = true; return; }

  sheetTipEl.textContent = text;
  sheetTipEl.hidden = false;
  const box = sheetTipEl.getBoundingClientRect();
  const MARGIN = 8;
  let left = x - box.width / 2;
  left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, stage.width - box.width - MARGIN));
  let top = y + 18;
  if (top + box.height > stage.height - MARGIN) top = y - box.height - 14;
  sheetTipEl.style.left = `${left}px`;
  sheetTipEl.style.top = `${Math.max(MARGIN, top)}px`;
}

/**
 * Wire the sheet's pointer explanations. Hover is instant here, unlike the 3-D labels'
 * deliberate delay: the sheet is a drawing the learner is actively reading, and a
 * construction line has no meaning until something says what it is for.
 */
function setupSheetHover() {
  if (!compareCanvas) return;

  compareCanvas.addEventListener('pointermove', (e) => {
    if (!sheetView || !sheetLayout) return;
    const rect = compareCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const found = describeAt(sheetView, sheetLayout, x, y);

    if (found?.item !== sheetHover) {
      sheetHover = found?.item ?? null;
      drawCompare(); // repaint with (or without) the highlight ring
    }
    showSheetTip(found?.text ?? null, x, y, rect);
    compareCanvas.style.cursor = found ? 'help' : '';
  });

  compareCanvas.addEventListener('pointerleave', () => {
    showSheetTip(null);
    if (sheetHover) { sheetHover = null; drawCompare(); }
    compareCanvas.style.cursor = '';
  });
}

// ============================================================================
// Stage — the guided step drives the 3D reveal and which sheet is drawn.
// ============================================================================

// ============================================================================
// The two panes are ONE model (ADR-088). The curve on the drawing sheet is the
// curve of the cut in the viewport, so any change to the cone or to the plane
// carries straight through to the sheet — the learner never has to relate two
// independent pictures for themselves.
//
// Steps 1–4 are the taught half, and there the sheet FOLLOWS the cut. From Step
// 5 the lesson is construction from given data ("draw the conic of eccentricity
// 3/4 …"), so the eccentricity becomes the learner's own dial and the link is
// released — otherwise the chapter's exercises could not be worked at all.
// ============================================================================

/** Steps up to and including this one keep the sheet locked to the 3-D cut. */
const SHEET_FOLLOWS_CUT_UNTIL = 4;

/** True while the sheet is showing the curve of the live cut rather than a dialled one. */
function sheetFollowsCut() {
  return stage <= SHEET_FOLLOWS_CUT_UNTIL;
}

/**
 * Re-derive what the SHEET is drawing from the live cut, so the two panes can never disagree
 * about what has been cut (ADR-090). Three of §6.1's six sections are not plane conics, and a
 * focal-polar model asked to draw one of them draws something that is not on the cone at all:
 *
 *   circle          e = 0 — the model's radius collapses. The sheet draws the TRUE circle, at
 *                   the radius the cone actually has where the plane crosses it.
 *   apex cut        Not a locus. The sheet draws §6.1's isosceles triangle: two generators and
 *                   the chord of the base between their feet — or, where the plane through the
 *                   apex is flatter than the generators, the single point it really is.
 *   plane clear     Nothing has been cut, and the sheet says so instead of holding the last
 *                   curve it had.
 *
 * Everything else is a conic, and its eccentricity is `sin θ ÷ sin g` as before (ADR-088),
 * clamped to the range the sheet's model can draw.
 *
 * Called at the END of rebuild(), because two of the three cases can only be settled once the
 * clipper has reported whether the plane hit anything at all.
 */
/** Set when the cut has become a DIFFERENT KIND of section, so the proof has to start again:
 *  a learner who slides an ellipse into an apex cut should be told the first thing about the
 *  new cut, not left on stage 5 of a proof that no longer applies (ADR-095). */
let proofResync = false;

function syncSheetToCut() {
  if (!sheetFollowsCut() || !currentShapeData) return;
  const next = cutDerivedSheet(conicState);
  if (!next) return;
  commitDerivedSheet(next);
}

/**
 * What the sheet WOULD be drawing if it were showing the live cut — the same derivation
 * {@link syncSheetToCut} commits, lifted out so a step can DRAW the cut without writing it into
 * the sheet state (ADR-117).
 *
 * Step 6 needs exactly that. Its thumbnail must show the cut it has just dealt, but Step 5 owns
 * `e`, `curve` and the given dimensions, and a learner stepping 5 → 6 → 5 must find their
 * construction as they left it. Deriving without committing is what keeps both true.
 *
 * @param {object} base  The state to derive from.
 * @returns {object|null} A new state, or null when there is no cone to read.
 */
function cutDerivedSheet(base) {
  if (!currentShapeData) return null;
  const data = currentShapeData;
  const generatorDeg = generatorAngleDeg(data);
  const info = classifySection(sectionState, generatorDeg);
  const R = data.baseLength / 2;
  const next = { ...base };

  if (info.key === 'IsoscelesTriangle') {
    // Where the plane through the apex meets the base circle: sin φ = tan g · cot θ, so it
    // reaches the base only once the plane is at least as steep as the generators.
    const th = THREE.MathUtils.degToRad(sectionState.angleDeg);
    const sinPhi = Math.tan(THREE.MathUtils.degToRad(generatorDeg)) / Math.max(Math.tan(th), 1e-9);
    next.cutKind = 'triangle';
    next.cutA = Math.abs(sinPhi) <= 1 ? 2 * R * Math.sqrt(1 - sinPhi * sinPhi) * WORLD_TO_MM : 0;
    next.cutB = Math.hypot(R, data.height) * WORLD_TO_MM;   // every generator is this long
  } else if (sectionState.enabled && sectionState.cut && !sectionCutHit) {
    next.cutKind = 'none';
  } else if (info.key === 'Circle') {
    next.cutKind = 'circle';
    // The cone's radius at the plane's own distance from the apex — similar triangles.
    const d = Math.min(Math.abs(sectionState.offset), data.height);
    next.cutA = d * (R / data.height) * WORLD_TO_MM;
  } else {
    next.cutKind = 'conic';
    const e = eccentricityForSection(sectionState.angleDeg, generatorDeg);
    next.e = THREE.MathUtils.clamp(e, ECC_SLIDER_MIN, ECC_SLIDER_MAX);
    next.curve = curveForEccentricity(next.e);
  }

  return next;
}

/** Write a derived sheet state back, rewinding the proof if the KIND of section changed. */
function commitDerivedSheet(next) {
  if (next.cutKind !== conicState.cutKind && (conicState.proofStage ?? 0) > 0) {
    next.proofStage = 0;      // a new kind of section: back to the start of its own proof
    proofResync = true;       // …and the scene has to be rebuilt for that stage
  }
  const same = next.cutKind === conicState.cutKind
    && Math.abs((next.cutA ?? 0) - (conicState.cutA ?? 0)) < 1e-4
    && Math.abs((next.cutB ?? 0) - (conicState.cutB ?? 0)) < 1e-4
    && Math.abs(next.e - conicState.e) < 1e-4;
  if (same) return;
  conicState = next;
  if (compareOpen) drawCompare();
}

/**
 * The state the SHEET is drawn from, which is not always the sheet's stored state (ADR-117).
 *
 * Every step owns its own sheet content. Steps 1–4 and Step 6 show the live cut; Step 5 shows the
 * construction the learner is building. The difference between the two halves is where the
 * derivation LANDS: Steps 1–4 commit it, because there the cut IS the sheet's subject and the
 * proof and the dock read it back. Step 6 only borrows it for the paint, so that stepping
 * 5 → 6 → 5 leaves the construction exactly as it was.
 */
function sheetSourceState() {
  if (stage !== 6) return conicState;
  // §6.6's properties are Step 5's aside and have no business following the learner into the
  // question — the sheet here is the cut and nothing else.
  return { ...(cutDerivedSheet(conicState) ?? conicState), propsOpen: false };
}

/** True while the sheet DRAWS the live cut. Wider than {@link sheetFollowsCut}, which is the
 *  narrower question of whether the cut is written INTO the sheet's own state. */
function sheetDrawsCut() {
  return sheetFollowsCut() || stage === 6;
}

/** The sheet's dial range, mirrored from #rng-ecc so the derived value can never leave it. */
const ECC_SLIDER_MIN = 0.2;
const ECC_SLIDER_MAX = 2.5;

/**
 * Called by stepper.js on every step change (the sibling topics' setStage seam). The scene
 * follows the story rather than waiting to be configured (ADR-141):
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

  // Messages are anchored to the step that raised them. Both the flow note and the onboarding
  // chip hold for 4.5s, which outlives a learner who presses Next twice in three seconds — and
  // the instruction they carry ("tick Cut the cone", "orbit until you face it square-on") is
  // wrong on the step it lands in. Clear the slots first; anything this step wants to say fills
  // them again below, on the same tick.
  hideFlowNote();
  onboarding?.retire();

  // The PLANE belongs to Step 2 onward — its arrival is what Step 2 means. Whether it
  // actually CUTS is the learner's own decision in Step 2 ("Cut the cone", the reference
  // topic's interaction); from Step 3 the lesson needs a cut on screen to talk about, so
  // the steps that demonstrate turn it on themselves (RULES.md §6.32).
  const wantPlane = stage >= 2;
  const wantCut = stage >= 3;
  let dirty = false;
  if (sectionState.enabled !== wantPlane) {
    sectionState.enabled = wantPlane;
    dirty = true;
    if (wantPlane) {
      flowNote('The cutting plane is in place. Aim it, then tick “Cut the cone”.');
    } else {
      sectionState.cut = false; // stepping back to Step 1 puts the cone back together
    }
  }
  if (wantCut && !sectionState.cut) { sectionState.cut = true; dirty = true; }
  // Step 4 opens on the CURVE ALONE and reveals the apparatus from there (ADR-088/089), so
  // rewind BOTH acts of the reveal before the rebuild that will draw them.
  if (stage === 4 && previous !== 4) conicState = { ...conicState, locusStage: 0, proofStage: 0 };
  // The anatomy labels belong to Step 1 only and the focal sphere to Step 4 only — rebuild so
  // each comes and goes with its own step.
  if (dirty || previous === 1 || stage === 1 || previous === 4 || stage === 4) {
    rebuild(currentShapeData);
  }

  // Leaving the taught half hands the eccentricity over to the learner; entering it takes
  // it back, so the sheet is showing the cut again the moment they step back.
  syncSheetToCut();

  // From Step 4 the lesson lives on the sheet, so it is opened for the learner — as the
  // COMPACT floating card, never the 50/50 split: the split collapses the wizard, and a
  // guided step that hides its own step card would strand the learner.
  if (stage >= 4 && !compareOpen) {
    faceTheSection();               // look at the cut square-on first…
    compare.show('compact');        // …then the same shape appears on paper
    flowNote('The same cut, seen face-on — and now the same outline drawn on paper.');
    // …but on a phone the sheet IS the viewport (ADR-123), and opening it on arrival would
    // replace the cone the step just swung the camera round to, before the learner has read a
    // word of the step. So it opens minimized: the chip in the corner says what it brings
    // back, and the switch is theirs to make. Wider than that, both panes are on screen and
    // there is nothing to choose between.
    if (!isWorkbenchViewport()) setThumbMinimized(true);
  }
  // Step 5 is the drawing workspace: the sheet takes the bench and the cone becomes a live
  // reference beside it (ADR-100). Step 6 hands the bench back — its question is about the
  // solid again. Re-applying the current size is what mounts or unmounts the grid.
  // ARRIVING at Step 5 clears the paper back to the construction's given data (ADR-118). A
  // learner who steps out and back must not find the answer waiting for them, and "Draw it step
  // by step" must never look like it is starting from the middle of a finished drawing.
  if (stage === 5 && previous !== 5) {
    stopBuildPlayback();
    cancelCurveReveal();
    conicState = { ...conicState, buildStage: setupStageFor(conicState.method) };
  }
  const wantSheetPrimary = stage === 5;
  if (wantSheetPrimary !== sheetPrimary) {
    sheetPrimary = wantSheetPrimary;
    if (compareOpen) applyCompareSize(compareSize);
  }
  if (compareOpen) drawCompare();

  // Which viewport controls belong to this step is part of the step (ADR-108): Switch view is
  // Step 5's alone, and nothing else syncs it when the step changes without opening the sheet.
  updateCompareChip();

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

/**
 * Swing round to the pose §6.2's construction is drawn in: mostly side-on, so the ball reads
 * as a ball INSIDE the cone, the two planes read as planes rather than as edges, and the line
 * where they cross has visible length. Step 4 arrives facing the cut square-on, which is right
 * for reading the curve's true shape and wrong for watching a sphere descend into a cone.
 */
function faceTheFocalSphere() {
  if (!currentShapeData) return;
  const h = currentShapeData.height;
  // Frame the BALL and the space just around it. Framing the whole solid left the sphere a
  // bead in the middle of the viewport, and a proof about one sphere has to show that sphere.
  const ballY = h + (lastFocal?.centreY ?? -h * 0.5);
  const centre = new THREE.Vector3(0, (ballY + h * 0.35) / 2, 0);
  const span = Math.max((lastFocal?.radius ?? h * 0.2) * 9, h * 1.35);
  const reach = span * 1.55;
  // The drawing-sheet card floats over the TOP RIGHT of the viewport from Step 4 on, so a
  // subject centred in the pane is a subject half under a card. Bias the aim so the ball lands
  // in the free lower-left — shifting the TARGET right moves the subject left on screen.
  const bias = span * 0.34;
  // Off the V.P. normal, and only a little above the horizon: the classic elevation, turned
  // just far enough that the section plane and the tangent plane read as surfaces.
  const dir = new THREE.Vector3(0.86, 0.30, 0.42).normalize();
  // The camera's own right axis at this pose. The camera sits at aim + dir·reach and looks back
  // along −dir, so its right is (−dir) × up — the opposite of dir × up, which is the sign that
  // matters here: moving the TARGET along +cameraRight moves the subject LEFT on screen.
  const right = new THREE.Vector3()
    .crossVectors(dir.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
  const aim = centre.clone().addScaledVector(right, bias);
  const to = aim.clone().addScaledVector(dir, reach);
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();

  tween({
    from: 0,
    to: 1,
    duration: 800,
    ease: easeCamera,
    onUpdate: (t) => {
      camera.position.lerpVectors(fromPos, to, t);
      controls.target.lerpVectors(fromTarget, aim, t);
      controls.update();
    },
  });
}

// ============================================================================
// The teaching motions. Each one exists so the learner WATCHES a cause produce
// its effect instead of reading that it would (ADR-141): the plane travels to a
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
/** The in-flight plane move, so a later action can supersede it (ADR-110). Each frame of it
 *  calls rebuild(), so under a slow renderer it runs well past its 700 ms of tween time — long
 *  enough for a press to land mid-flight and be undone by its onComplete. */
let tourTween = null;

function tourCut(key) {
  const spec = ConicSection[key];
  if (!spec || !currentShapeData) return;
  const target = sectionPresetFor(key, generatorAngleDeg(currentShapeData));
  const from = { angleDeg: sectionState.angleDeg, offset: sectionState.offset };
  sectionState.cut = true; // a tour that only aimed the plane would demonstrate nothing

  tourTween?.cancel();      // one plane, one move: a second chip supersedes the first
  tourTween = tween({
    from: 0,
    to: 1,
    duration: 700,
    ease: easeStandard,
    onUpdate: (t) => {
      sectionState.angleDeg = from.angleDeg + (target.angleDeg - from.angleDeg) * t;
      sectionState.offset = from.offset + (target.offset - from.offset) * t;
      rebuild(currentShapeData); // its own tail re-reads the cut onto the sheet
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

// ============================================================================
// STEP 4 — the proof, walked by hand (ADR-095).
//
// It does not play. Each press of Next reveals exactly one idea and then waits;
// Back restores the previous stage exactly, with no animation to sit through
// twice. This is the manual stepper Step 5 already uses for its construction —
// the same two buttons, the same disabled-at-the-ends rule — because a proof the
// learner cannot pause is a film, not a proof.
// ============================================================================

/** The stages that apply to THIS cut. A section with no inscribed sphere has no proof to
 *  walk, and the circle's ends where the two planes turn out to be parallel. */
function proofStages() {
  const kind = conicState.cutKind ?? 'conic';
  if (kind === 'none') {
    return [{
      index: 0, label: 'No cut', hold: 0, sheet: 0,
      say: 'The plane is clear of the cone just now, so there is no section to explain. Slide it back until it bites.',
    }];
  }
  if (kind === 'triangle') {
    return [
      {
        index: 0, label: 'Straight lines', hold: 0, sheet: 0,
        say: 'This cut passes through the tip, so it runs straight down two of the cone’s own sides. Two straight lines — no curve, and nothing to fit a ball into.',
      },
      {
        index: 1, label: 'Nothing to measure', hold: 0, sheet: 0,
        say: 'With no ball there is no focus, and no second plane to cross. Move the cut off the tip and the proof comes back.',
      },
    ];
  }
  // A circle has a focus (the ball touches the cut at its centre) but no directrix: its
  // tangent plane is PARALLEL to its cutting plane. The proof therefore ends at that stage,
  // where the reason is worth saying out loud.
  const flat = !lastFocal?.directrix;
  // A circle's proof stops AT the crossing stage, where the reason it has no directrix — two
  // parallel planes — is the thing worth saying. Found by the stage that carries `sayFlat`
  // rather than by a literal index, because the list has been renumbered once already.
  const flatEnd = PROOF_STAGES.findIndex((s) => s.sayFlat) + 1;
  return PROOF_STAGES
    .slice(0, flat ? flatEnd : PROOF_STAGES.length)
    .map((s, index) => ({
      index,
      label: s.label,
      hold: s.hold,
      sheet: s.sheet,
      say: flat && s.sayFlat ? s.sayFlat : s.say,
    }));
}

/** Which stage is showing, clamped to what this cut can offer. */
function proofStageNow() {
  return Math.min(conicState.proofStage ?? 0, proofStages().length - 1);
}

/** True while a stage's own animation is running — Next stays disabled until it finishes. */
let proofBusy = false;
let proofTween = null;

/**
 * Go to one stage of the proof.
 *
 * @param {number} index
 * @param {{animate?: boolean}} [opts]  `animate: false` (Back, and any rebuild) lands on the
 *   finished state at once: a learner stepping back to check something should not have to sit
 *   through the reveal a second time.
 */
function setProofStage(index, { animate = true } = {}) {
  const stages = proofStages();
  const at = Math.min(Math.max(index, 0), stages.length - 1);
  const stage = stages[at];
  const back = at < (conicState.proofStage ?? 0);
  proofTween?.cancel?.();

  // The bridge is the LAST stage, whichever index that is: the degenerate cuts run shorter
  // proofs, and a hard-coded index would fade the cone out on the wrong one (ADR-097).
  const last = stages.length - 1;
  conicState = { ...conicState, proofStage: at, locusStage: stage.sheet };
  // The apparatus lives in the scene graph, so the stage change is a geometry change.
  Object.assign(proofAnim, { fade: 1, draw: 1, bridge: at >= last ? 1 : 0 });
  if (animate && !back && stage.hold > 0 && !prefersReducedMotion) {
    Object.assign(proofAnim, { fade: 0, draw: 0.001, bridge: 0 });
  }
  rebuild(currentShapeData);

  // The camera goes where the stage is: side-on for the construction, square to the cut for
  // the bridge onto the paper.
  if (at === 1) faceTheFocalSphere();
  if (at === last) faceTheSection();
  if (compareOpen) drawCompare();

  if (!(animate && !back && stage.hold > 0 && !prefersReducedMotion)) {
    proofBusy = false;
    proofAnim.bridge = at >= last ? 1 : 0;
    applyProofPhase();
    notifyStateChange();
    announce(`${stage.label}. ${stage.say}`);
    flowNote(stage.say);
    return;
  }

  proofBusy = true;
  notifyStateChange();          // the dock disables Next while this runs
  announce(`${stage.label}. ${stage.say}`);
  flowNote(stage.say);
  proofTween = tween({
    from: 0,
    to: 1,
    duration: stage.hold,
    ease: easeStandard,
    onUpdate: (t) => {
      proofAnim.fade = t;
      proofAnim.draw = t;
      proofAnim.bridge = at >= last ? t : 0;
      applyProofPhase();
    },
    onComplete: () => {
      Object.assign(proofAnim, { fade: 1, draw: 1, bridge: at >= last ? 1 : 0 });
      applyProofPhase();
      proofBusy = false;
      notifyStateChange();      // …and re-enables it
    },
  });
}

/** The free-running highlight: the pulse that points at the one touching point, and the
 *  breathing weight of the ring of contact. Driven from the frame loop, never from a tween,
 *  because it has no end state to reach. */
function tickProofPulse(dtSeconds) {
  const stage = proofStageNow();
  if (stage !== 2 && stage !== 3) return;
  proofAnim.pulse = (proofAnim.pulse + dtSeconds * 0.75) % 1000;
  applyProofPhase();
}

/** ms each of §6.6's properties holds before the next is drawn. Longer than the construction's
 *  dwell: each of these is a separate claim to take in, not the next line of one drawing. */
const PROP_DWELL = 2600;
let propTimer = null;

/**
 * Step 5's "Show its three properties" — §6.6's list, drawn one at a time on a parabola of the
 * learner's own focal distance (ADR-093). The chapter states them in a sentence each and uses
 * them in the constructions that follow; a sentence is not a reason to believe a claim about a
 * curve, and each of these three is exact, so the figure IS the proof.
 */
function playParabolaProps() {
  // A TOGGLE, not a one-way door (ADR-116). It used to only ever turn the properties ON: the sole
  // way back to the construction was to nudge some other control, which is why pressing it a
  // second time appeared to leave the drawing broken — nothing had put the sheet back.
  if (conicState.propsOpen) { closeParabolaProps(); return; }
  clearTimeout(propTimer);
  conicState = { ...conicState, propsOpen: true, propStage: 0 };
  if (compareOpen) drawCompare();
  notifyStateChange();
  announce(PARABOLA_PROPS[0].say);
  flowNote(PARABOLA_PROPS[0].say);

  const advance = () => {
    if (conicState.propStage >= PARABOLA_PROPS.length - 1) return;
    conicState = { ...conicState, propStage: conicState.propStage + 1 };
    if (compareOpen) drawCompare();
    notifyStateChange();
    const copy = PARABOLA_PROPS[conicState.propStage];
    announce(copy.say);
    flowNote(copy.say);
    propTimer = setTimeout(advance, PROP_DWELL);
  };
  propTimer = setTimeout(advance, PROP_DWELL);
}

/**
 * Put the sheet back on the construction — pressing the control again, or any control that
 * changes what is being drawn.
 *
 * This is a VIEW toggle and nothing more (ADR-116): `propsOpen` is the only field it touches, so
 * `sheetMode()` falls back to the construction and the layout is rebuilt from state that was
 * never disturbed. The construction stage, the given dimensions, the tangent toggle and the
 * chosen method all come back exactly as they were, because none of them ever left.
 *
 * It fires the state-change bus. Without that the dock kept the properties readout on screen and
 * the button kept its pressed state while the sheet had already moved on — the drawing looked
 * restored and the panel did not. `commitConic` calls this mid-commit and notifies once itself,
 * so it passes `notify: false` rather than announcing a state that is still being assembled.
 *
 * @param {{notify?: boolean}} [opts]
 */
function closeParabolaProps({ notify = true } = {}) {
  clearTimeout(propTimer);
  if (!conicState.propsOpen) return;
  conicState = { ...conicState, propsOpen: false };
  if (compareOpen) drawCompare();
  if (!notify) return;
  notifyStateChange();
  announce('Back to the construction, exactly as it was.');
}

/**
 * ms each construction stage holds before the next is drawn. Deliberately unhurried: a learner
 * copying the construction onto paper has to see every line go down, and the syllabus's own
 * assessment is a drawing paper (ADR-098). Pause exists for when even this is too fast.
 */
const BUILD_DWELL = 2200;
let buildTimer = null;
/** Set while the playback is paused. The timer is cleared, so pausing costs nothing. */
let buildPaused = false;
/** Whether the learner has played the construction. The sheet boots on the FINISHED figure,
 *  so without this the dock would narrate the last stage as though it had just been drawn. */
let buildPlayed = false;

/**
 * Step 5's "draw it step by step" — rewind the construction to the bare frame and add one
 * stage at a time, narrating each. The learner sees WHERE every line came from, which a
 * finished figure can never show.
 */
/** Advance the running construction one stage, or stop at the end. Shared by the playback and
 *  by resuming from a pause, so both walk the stages the same way. */
function advanceBuild(stages) {
  if (conicState.buildStage >= stages.length - 1) return;
  conicState = { ...conicState, buildStage: conicState.buildStage + 1 };
  if (stageDrawsCurve(conicState, conicState.buildStage)) startCurveReveal();
  if (compareOpen) drawCompare();
  notifyStateChange();
  const stageCopy = stages[conicState.buildStage];
  announce(stageCopy.say);
  flowNote(stageCopy.say);
  buildTimer = setTimeout(() => advanceBuild(stages), BUILD_DWELL);
}

/** Pause the running playback where it stands, or resume from there. */
function toggleBuildPause() {
  const stages = buildStagesFor(conicState.method, conicState);
  if (!stages || !buildPlayed) return;
  if (buildPaused) {
    buildPaused = false;
    buildTimer = setTimeout(() => advanceBuild(stages), BUILD_DWELL);
  } else {
    buildPaused = true;
    clearTimeout(buildTimer);
  }
  notifyStateChange();
}

/**
 * Abandon any running or paused construction playback. Changing the construction MUST do this:
 * a timer left pending from the previous method fires later and walks the new drawing back to
 * an early stage, so the learner lands mid-construction of a drawing they never asked to play
 * (ADR-100).
 */
function stopBuildPlayback() {
  cancelCurveReveal();
  clearTimeout(buildTimer);
  buildPaused = false;
  buildPlayed = false;
}

/** How much of the finished curve has been traced, 0..1 (ADR-114). 1 whenever nothing is
 *  being drawn, so a figure that is simply shown is shown whole. */
let curveReveal = 1;
let revealTween = null;

/**
 * Does `stage` put the finished curve on the paper for the first time?
 *
 * This used to be "is it the LAST stage", which is the same thing for every construction that
 * ends by joining the curve — but not for the tangent method, whose envelope is drawn at stage 6
 * and whose focus and directrix are marked at stage 7. There the trace fired one stage too late
 * and the curve simply appeared, which is exactly the inconsistency the review reported
 * (ADR-115). Asking the LAYOUT instead needs no per-method table and cannot fall out of step
 * with one: whichever stage first carries an `outline` item is the stage that draws the curve.
 *
 * Both layouts are pure, so this costs two display lists on a stage change and nothing else.
 *
 * @param {object} conic  The conic state the stage will be drawn from.
 * @param {number} stage
 */
function stageDrawsCurve(conic, stage) {
  if (!Number.isFinite(stage) || stage <= 0) return false;
  if (!buildStagesFor(conic.method, conic)) return false;
  const hasCurve = (s) => layoutFor(sheetMode(conic), { ...conic, buildStage: s })
    .items.some((it) => it.role === 'outline');
  return hasCurve(stage) && !hasCurve(stage - 1);
}

/**
 * Trace the finished curve on, at a constant speed, the way a pencil would (ADR-114). Called
 * when a construction ARRIVES at its last stage — never when a drawing is merely displayed, so
 * switching method or opening the sheet still shows the curve whole and at once.
 */
function startCurveReveal() {
  revealTween?.cancel();
  curveReveal = 0;
  revealTween = tween({
    from: 0,
    to: 1,
    duration: 1100,
    ease: (t) => t,            // constant speed: easing here would distort the drawing rate
    onUpdate: (v) => { curveReveal = v; if (compareOpen) drawCompare(); },
    onComplete: () => {
      curveReveal = 1;         // and it STAYS drawn, with every construction line beside it
      revealTween = null;
      if (compareOpen) drawCompare();
    },
  });
}

/** Abandon a trace in progress and show the curve whole — any change that is not "one more
 *  stage of this construction" should leave a finished drawing finished. */
function cancelCurveReveal() {
  revealTween?.cancel();
  revealTween = null;
  curveReveal = 1;
}

function playConstruction() {
  const stages = buildStagesFor(conicState.method, conicState);
  if (!stages) return;                 // this construction has no staged form
  clearTimeout(buildTimer);
  buildPaused = false;
  buildPlayed = true;
  conicState = { ...conicState, buildStage: 0 };
  if (compareOpen) drawCompare();
  notifyStateChange();
  announce(stages[0].say);
  flowNote(stages[0].say);

  buildTimer = setTimeout(() => advanceBuild(stages), BUILD_DWELL);
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
  sectionState.cut = true; // there is nothing to name unless the cone is actually cut
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
  if (compareOpen) drawCompare();   // the sheet may name the section now the answer is in
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
    buildPaused = false;
    clearTimeout(propTimer);              // and any parabola-property playback
    proofTween?.cancel?.();               // and Step 4's stage animation, mid-fade
    proofBusy = false;
    Object.assign(proofAnim, { fade: 1, pulse: 0, draw: 1, bridge: 0 });
    buildPlayed = false;                  // Step 5 invites the playback again
    sectionState = defaultSectionState(); // section plane off + defaults (topic-local)
    conicState = defaultConicState();     // Example 6.1's own data
    conicState.method = ECCENTRICITY_METHOD; // Step 5 opens on the general construction
    // …and on its GIVEN DATA, not its answer (ADR-118), so Reset leaves the same clean sheet
    // that arriving at Step 5 does.
    conicState.buildStage = setupStageFor(ECCENTRICITY_METHOD);
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

  /** Merge params into the cone and rebuild — the single write path for its sliders.
   *  Reshaping the cone moves its generator angle, which moves the eccentricity of the
   *  cut, which moves the curve on the sheet: the two panes are one model. */
  commit(partial) {
    const next = { ...(currentShapeData ?? {}), ...partial };
    rebuild(next);
  },

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
    // ASKING for a construction clears the paper back to its given data (ADR-118) — its frame,
    // never its answer. Keyed on the REQUEST, not on whether the id changed: pressing "Ellipse"
    // when the ellipse is already up, or re-picking the construction already selected, is a
    // learner saying "start this one", and leaving the finished figure on the paper is what made
    // "Draw it step by step" look like it began from the middle.
    if (partial.method !== undefined || partial.curve !== undefined) {
      next.buildStage = setupStageFor(next.method);
      stopBuildPlayback();
    }
    // Changing the eccentricity re-derives which curve the eccentricity sheets are drawing.
    if (partial.e !== undefined && next.method === ECCENTRICITY_METHOD) {
      next.curve = curveForEccentricity(next.e);
    }
    // Any edit that changes WHAT IS DRAWN takes the sheet back from §6.6's properties — they
    // are an aside about the parabola, not a mode to get stuck in (ADR-093).
    if (partial.propsOpen === undefined
      && Object.keys(partial).some((k) => k !== 'propStage')) {
      closeParabolaProps({ notify: false });   // this commit notifies once, at its end
      next.propsOpen = false;
    }
    // The tangent method sizes its stage list to its division count (ADR-116), so lowering the
    // slider can leave the current stage past the end of the new list — a stage number the dock
    // cannot narrate and the layout reads as "finished". Clamp it back onto the shortened list.
    const nowStaged = buildStagesFor(next.method, next);
    if (nowStaged && next.buildStage !== undefined && next.buildStage > nowStaged.length - 1) {
      next.buildStage = nowStaged.length - 1;
    }
    // Stepping the construction by hand counts as having played it, so the dock narrates the
    // stage the learner is on rather than repeating its invitation.
    if (partial.buildStage !== undefined) {
      buildPlayed = true;
      clearTimeout(buildTimer); // a manual step takes over from any running playback
      buildPaused = false;
      // Stepping ONTO the stage that draws the curve traces it on; stepping anywhere else shows
      // a finished drawing finished (ADR-114).
      if (partial.buildStage !== conicState.buildStage
        && stageDrawsCurve(next, partial.buildStage)) startCurveReveal();
      else cancelCurveReveal();
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

  /**
   * The named elements the sheet is currently drawing, for the Engineering Terms panel
   * (ADR-098). Hovering one drives the SAME `sheetHover` the cursor drives, so there is one
   * highlight path and `drawHighlight()` is not duplicated.
   */
  sheetTerms: () => (compareOpen && sheetLayout ? sheetTerms(sheetLayout) : []),
  /**
   * Highlight one named element by its CAPTION, not by the item object. `drawCompare()` rebuilds
   * the display list on every paint, so an item reference goes stale the moment the sheet
   * repaints — and the guard that keeps the cursor's hover honest would then silently drop it.
   * The caption is resolved against the fresh layout instead.
   */
  highlightTerm(term) {
    if (hoverTerm === term) return;
    hoverTerm = term ?? null;
    if (compareOpen) drawCompare();
  },

  /**
   * What the drawing on the sheet MEASURES (ADR-091) — the quantities the chapter's exercises
   * ask the learner to determine, read off the construction that is actually on screen. Empty
   * while the sheet is closed: these are the drawing's answers, and there is no drawing.
   */
  sheetResults: () => (compareOpen ? sheetResults : []),

  /** §6.6's three properties of the parabola, and the playback that draws them (Step 5). */
  propStages: () => PARABOLA_PROPS.map((s, i) => ({ index: i, ...s })),
  playParabolaProps,

  /**
   * The stages of the construction CURRENTLY selected, and the playback that draws them one at
   * a time (Step 5). One playback system, four constructions: the focus-directrix method and
   * the three the syllabus names (ADR-098). Empty for the nine that draw whole.
   */
  buildStages: () => (buildStagesFor(conicState.method, conicState) ?? []).map((s, i) => ({ index: i, ...s })),
  buildPaused: () => buildPaused,
  toggleBuildPause,
  paneFocus: () => paneFocus,
  setPaneFocus,
  buildPlayed: () => buildPlayed,
  playConstruction,

  /**
   * Step 4's proof: its stages, which one is showing, whether its animation is still running,
   * and the one way to move it. It never advances by itself (ADR-095).
   */
  proofStages,
  proofStage: proofStageNow,
  proofBusy: () => proofBusy,
  setProofStage,
  /** Whether THIS cut can show §6.2's focal sphere at all — false only for the apex cut. */
  hasFocalSphere: () => lastFocal !== null && (conicState.cutKind ?? 'conic') !== 'none',
  /** Whether the sheet is currently locked to the 3-D cut (Steps 1–4). */
  sheetFollowsCut,
  /** The eccentricity the LIVE cut produces, before any clamping — what the readout quotes. */
  cutEccentricity: () => (currentShapeData
    ? eccentricityForSection(sectionState.angleDeg, generatorAngleDeg(currentShapeData))
    : 0),

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
      // How many nappes the plane actually bit. The classification is the chapter's ANGLE
      // rule, which describes the infinite cone; a modelled nappe is finite, so a steep cut
      // can be a hyperbola by the rule while its second branch falls beyond the tip. The
      // dock says so rather than promising a branch that is not on screen.
      nappesCut: sectionNappesCut,
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
   *  the name back until the learner has committed to an answer (ADR-141). */
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
    setupSheetHover();                     // hover explanations on the drawing sheet
    stepper = initStepper(simController);
    const dock = initUIManager(simController); // parameter dock
    simController.onStateChange(() => dock.sync()); // reset/commit re-syncs the controls
    initTerms();                           // inline term-definition popovers (static markup)
    setupLabelTips();                      // hover explanations on the 3D anatomy labels
    onboarding = initOnboarding(controls); // first-run hints
    problemLibrary = initProblemLibrary(simController); // textbook problems + self-check

    // Every commit repaints the open sheet — it is a live view of the current state,
    // never a snapshot (ADR-012 §5.14).
    simController.onStateChange(() => { if (compareOpen) drawCompare(); });

    new ResizeObserver(() => {
      handleResize(container);
      if (compareOpen) drawCompare(); // the split resizes the stage with the viewport
    }).observe(container);

    // Crossing the two-pane threshold is a change of LAYOUT MODE, not of size (ADR-123): above
    // it the sheet docks beside the solid, below it the two share one viewport and the learner
    // switches. The observer above only sees the viewport's own box, which does not move when a
    // rotated phone flips which of those applies, so the mode is re-derived from the query
    // itself. applyCompareSize re-tests isWorkbenchViewport() and unmounts anything the new
    // width cannot hold; updateCompareChip settles the classes and the corner controls.
    window.matchMedia('(min-width: 768px)').addEventListener('change', () => {
      if (compareOpen) applyCompareSize(compareSize);
      updateCompareChip();
      remeasureAfterReflow();
    });

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
