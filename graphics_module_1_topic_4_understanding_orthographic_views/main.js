// Orchestrator — Understanding Orthographic Views (ADR-044..049).
//
// Teaches the glass-box mental model of orthographic projection on the Foundations Bearing Block:
// the object sits inside an exploded first-angle reference box (three labelled, physically
// separated grid planes), a flat CSS2D Observer icon casts each principal view onto its pane, and
// the box then unfolds into the flat 2D multiview — the PP folding down onto the HP so the Side
// view lands beside the Top view (ADR-049, Module 2 parity). A 5-step guided sequence (renderStep,
// below) reveals the scene layer by layer:
//   1 The Object — 2 Planes — 3 Lines of Sight — 4 The Glass Box — 5 2D Compare View.
//
// Domain build lives here: `rebuild()` is the single geometry pipeline (CLAUDE.md, ADR-042's deep
// disposal), and `renderStep()` is the single per-layer-visibility pipeline layered on top of it.
// Chrome (the guided-stepper, inline term popovers, first-run onboarding, window.simAPI, the mobile
// notice, the wizard hide/show toggle, the boot watchdog + WebGL context-loss recovery) is inherited
// from the starter template unchanged.
//
// Layering (CLAUDE.md): main.js is the orchestrator. Leaf modules (stepper/terms/onboarding/anim/
// glassBox/bearingBlock) never import each other; they hang off this file.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { initStepper } from './src/stepper.js';
import { initTerms } from './src/terms.js';
import { initOnboarding } from './src/onboarding.js';
import { tick as tickTweens, cancelAll as cancelTweens, tween, easeCamera, easeFold } from './src/anim.js';

import { createGlassBox, castProjectors, makeFatSegments } from './src/glassBox.js';
import { createBearingBlock, BEARING_BLOCK_DIMS } from './src/bearingBlock.js';

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
// ============================================================================

const DEFAULT_CAMERA_POSITION = new THREE.Vector3(-9, 6, 9); // Top-Left-Front (RULES.md §5.20)
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ============================================================================
// Glass Box domain constants
// ============================================================================

/** The Bearing Block generator (bearingBlock.js) is authored at ~9-unit scale; shrink it so it
 *  floats inside the glass box with clear air around it — the "exploded" gap the fold reads
 *  against (ADR-045: the Foundations Bearing Block is the Glass Box's domain object). */
const BLOCK_SCALE = 0.42;

/** Clear-air margin between the block's bounding box and the reference planes (world units). It
 *  sets how far the exploded panes stand off the object. */
const PANE_MARGIN = 0.9;

/** Extra normal-axis standoff added on top of paneHalf so the three panes are physically EXPLODED
 *  apart (ADR-049): each pane spans [−paneHalf, paneHalf] in-plane but sits at planeOffset =
 *  paneHalf + this gap on its normal axis, so no two panes share vertices and a visible air gap
 *  separates their edges. */
const PLANE_EXPLODE_GAP = 0.6;

/** How far out along a principal axis the orbiting Observer sits, as a multiple of the exploded
 *  plane offset — > 1 keeps the icon outside the panes so its sight lines pass through the glass. */
const OBSERVER_DIST_K = 1.4;

/** The three principal viewing axes the Observer glides between (unit directions). Side is viewed
 *  from −X (the object's left side, ADR-044) so its image lands on the PP at +X. */
const VIEW_DIR = {
  top:   new THREE.Vector3(0, 1, 0),  // +Y → Top view,   casts onto the HP floor      (y = −D)
  front: new THREE.Vector3(0, 0, 1),  // +Z → Front view, casts onto the VP back wall  (z = −D)
  side:  new THREE.Vector3(-1, 0, 0), // −X → Side view,  casts onto the PP right wall (x = +D)
};

/** view → the pane it projects onto. */
const VIEW_PLANE = { top: 'hp', front: 'vp', side: 'pp' };

// The 5-step guided sequence (renderStep) drives the scene start-to-finish; do NOT boot straight
// into the Compare split — Step 5 opens it. (Overturns the Phase-4 scaffold's boot-into-split.)
const BOOT_INTO_COMPARE_SPLIT = false;

// ── Fold (the cinematic unfold into a flat first-angle layout) ──────────────────────────────────
// VP (back wall, z = −D where D = planeOffset) stays fixed. ADR-108 restores ADR-044's original
// design (superseding ADR-049's "Module 2 parity" fold, which was wrong — Module 2 itself carried
// the bug at the time, fixed later by ADR-106). PP and HP hinge INDEPENDENTLY, as siblings, both
// swinging directly onto the fixed VP's plane — unlike Module 2, where the VP itself folds and the
// PP hinge must nest inside it to track a moving target; that nesting has no reason to exist here:
//   • PP (right wall) rotates +90° about the VP∩PP line (x = +D, z = −D, along Y) → side wall
//     swings sideways into the VP plane, landing the Side view BESIDE THE FRONT VIEW at the SAME
//     HEIGHT (world Y is untouched by a Y-axis rotation) — shared horizontal projectors.
//   • HP (floor)      rotates +90° about the ground line (0, −D, −D, along X) → floor + Top view
//     swing DOWN below the Front view, sharing its width (vertical projectors).
// Both driven by the same progress so they complete together. All three end coplanar with VP
// (Front centre, Top below, Side beside Front — first-angle's actual layout, not Module 2's old
// bottom-right "4th-quadrant" mistake). The 3D block, the observer and the sight lines DISSOLVE
// across the fold.
const FOLD_DURATION = 1600;            // ms — the weighted "physical hinge" swing (easeFold)
const HP_FOLD_ANGLE = Math.PI / 2;     // HP floor hinges down about the ground line
const PP_FOLD_ANGLE = Math.PI / 2;     // PP hinges sideways into the VP plane about the VP∩PP edge
                                       // (ADR-044/ADR-108; ADR-049's −π/2-about-HP∩PP "Module 2
                                       // parity" value is superseded — it parked Side beside Top)

// ── 2D Compare sheet (ADR-038) ──────────────────────────────────────────────────────────────────
// The scale is LOCKED to these static sheet bounds — the block's bounding-box half-extents plus a
// fixed gutter — and is NEVER re-derived from the live/drawn geometry. So a real model unit always
// reads the same on-screen length and the drawing never auto-zooms to chase the object (ADR-038).
// The half-extents (hx/hy/hz) are set per build from the block's Box3 in buildBearingBlockSolid().
const sheet = { hx: 1, hy: 1, hz: 1, gap: 0.9, padPx: 48 };

// ============================================================================
// Module state
// ============================================================================

let renderer;
let scene;
let camera;
let controls;

/** CSS2D overlay renderer for the plane pills + the Observer icon (ADR-049). Rendered each frame
 *  on top of the WebGL canvas; sized in lockstep by handleResize. */
let labelRenderer;

/** Pane in-plane half-span, computed per build from the block's bounding box + PANE_MARGIN. */
let paneHalf = 2.6;

/** Normal-axis offset of the three EXPLODED reference planes (paneHalf + PLANE_EXPLODE_GAP,
 *  ADR-049): HP y=−planeOffset, VP z=−planeOffset, PP x=+planeOffset. */
let planeOffset = 3.2;

/** The block's bounding-box half-extents — feeds both the bounding-box projectors and the 2D sheet. */
let boundHalf = new THREE.Vector3(1, 1, 1);

/** The three planes' grid + border objects (the "planes" layer, revealed from Step 2). */
let planeLayer = [];

/** The three CSS2D plane name pills ("HP"/"VP"/"PP"), kept separate from planeLayer because they
 *  fade via element opacity + their OWN .visible flag — the r160 CSS2DRenderer ignores ancestor
 *  visibility (Module 2 gotcha), so applyPlaneOpacity must drive them directly. */
let planeLabels = [];

/** The exact 2D view outlines, split per plane so Step 3 can show ONLY the active view's outline.
 *  (The dashed projector rays are gone — Phase-2 QA purge.) */
let viewByPlane = { hp: null, vp: null, pp: null };

/** The guided step currently rendered (renderStep). Governs per-layer visibility + the fold/split. */
let currentStep = 1;

/** Holds all per-frame domain geometry. rebuild()'s disposal contract DEEP-traverses this
 *  group, so children may be nested Groups (the glass box, the solid, the projectors, the
 *  Observer are each a sub-group) — every descendant geometry/material is still freed. */
let shapeGroup;

/** Per-rebuild domain handles, held so the Observer animation + the resolution walker can reach
 *  them. All are DIRECT children of shapeGroup; the deep disposal loop tears them down. Nulled
 *  at the top of every rebuild(). */
let glassBoxGroup = null;
let solidData = null;        // { group, verts } — verts are the block's 8 Box3 corners (the sight
                             // lines cast from them). Both the 3D pane outlines (glassBox.js
                             // castProjectors) and the 2D Compare sheet (drawCompare) are
                             // dimension-constructed from BEARING_BLOCK_DIMS, not extracted here.
let projectorsGroup = null;
let observerGroup = null;
let observerIcon = null;     // the Observer's CSS2DObject eye icon (ADR-049) — held so the fold can
                             // drive its element opacity + own .visible (CSS2DRenderer ignores
                             // ancestor visibility in r160)
let sightObj = null;         // LineSegments2 of the current view's sight lines (rebuilt per view)

/** Fold structure, rebuilt each rebuild(): the two hinge pivots the panes/views/grid ride, plus
 *  the materials that dissolve across the fold. driveFold animates the pivots; rebuild() snaps them
 *  to the current fold state so a rebuild-while-unfolded lands flat instantly (no animation). */
let foldPivotHP = null;      // Group hinged about the ground line (0,−D,−D): floor + top view + grid
let foldPivotPP = null;      // Group hinged about the VP∩PP line (D,0,−D), a SIBLING of the HP hinge
                             // (not nested — the VP is fixed here, unlike Module 2): side wall +
                             // side view fold sideways into the VP plane (ADR-044/ADR-108)
let foldFadeMats = [];       // [{ mat, base }] — materials faded out as the box flattens
/** Whether the box is currently unfolded flat (true) or a 3D box (false). */
let isUnfolded = false;
/** Live fold progress 0 (3D box) → 1 (flat), so an interrupted fold resumes from where it was. */
let currentFoldF = 0;
/** Handle for the in-flight fold tween (cancelled on rebuild / re-trigger). */
let foldTween = null;
/** The rail's Unfold/Fold toggle button, held so its pressed state can be re-synced. */
let unfoldBtn = null;

/** Observer state: which principal view it faces, and its current unit direction. */
let observerView = 'front';
const observerDir = VIEW_DIR.front.clone();
/** Handle for the in-flight Observer glide tween (cancelled on rebuild / re-trigger). */
let observerTween = null;
/** Step 3's Front/Top/Side view-switcher buttons, held so reset + view-switches can re-latch. */
let step3ViewBtns = [];
/** The .view-choices wrapper — carries .has-selection so CSS mutes the two unpicked view buttons. */
let step3ViewGroup = null;

/** Step-gating flags — computed by applyStepGating() from currentStep + observerView, then
 *  pushed by applyFoldPose() (ANDed with its own fold-dissolve visibility) so the two visibility
 *  sources never fight: applyStepGating decides WHICH layers may show, applyFoldPose decides
 *  whether the dissolving dressing is visible AT ALL right now. */
let sightAllowed = false;                              // sight lines — Step 3 (Lines of Sight) only
let viewAllowed = { hp: false, vp: false, pp: false };  // per-plane 2D view outlines

/** The planes' materials + base opacity, gathered once per rebuild (like foldFadeMats) so the
 *  Step-2 "fade in the exploded grids" reveal can tween opacity without a shader recompile. */
let planeFadeMats = [];
/** Live plane-reveal progress 0 (hidden) → 1 (fully shown), so re-entering Step 2 resumes cleanly. */
let planeRevealF = 0;
/** Handle for the in-flight plane-reveal tween (cancelled on re-trigger). */
let planeRevealTween = null;

/** The sim viewport element. Held module-wide so handleResize can read the live drawing-buffer
 *  size (e.g. for LineMaterial resolution once you add fat-line linework). */
let viewport;

/**
 * The state currently on screen, or `null` for the empty start. Mutated only via rebuild().
 * The starter template keeps it as an opaque bag — give it a real shape when you build your
 * own data layer.
 * @type {object | null}
 */
let currentShapeData = null;

let rafId = null;
let running = false;

/** Subscribers fired at the end of every rebuild() — the single seam every state change passes
 *  through (a future problem-library self-check can ride this). */
const stateChangeSubs = new Set();

const statusRegion = document.getElementById('sim-status');

/** First-run onboarding handle from initOnboarding — { setSolidPresent, spotlight, cue }. */
let onboarding;

/** Guided-stepper handle from initStepper — { sync, reset, dispose }. */
let stepper;

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
 * explained. Screen readers get the message through #sim-status via announce(), so this note is
 * aria-hidden and is NOT itself a live region. Auto-dismisses after FLOW_NOTE_HOLD.
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

/** ms the success toast (#sim-toast) stays up before fading. */
const TOAST_HOLD = 2500;
let toastEl = null;
let toastTimer = null;
let toastHideTimer = null;

/**
 * Flash a calm success confirmation (e.g. "Lesson complete") in the fixed top-centre toast.
 * Markup carries aria-hidden (not a live region — call announce() alongside for a11y, same
 * convention as flowNote()). Auto-dismisses after TOAST_HOLD (instant under reduced motion).
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

  const hold = prefersReducedMotion ? 0 : TOAST_HOLD;
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    toastHideTimer = setTimeout(() => { toastEl.hidden = true; }, prefersReducedMotion ? 0 : 240);
  }, hold);
}

/** Fire every state-change subscriber (see stateChangeSubs). Each callback is guarded so one
 *  throwing subscriber can never break the rebuild pipeline. */
function notifyStateChange() {
  for (const cb of stateChangeSubs) {
    try { cb(); } catch (err) { console.error('Simatrix sim: onStateChange subscriber failed.', err); }
  }
}

/**
 * Show or hide the transient WebGL context-loss recovery chip, and narrate the state change so a
 * screen-reader user knows the paused view is recovering, not broken.
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
 * Signal a successful boot to the index.html watchdog: clear its timeout and hide any fallback a
 * slow load may have surfaced. A late-but-successful boot therefore self-heals.
 */
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
 * "Finish lesson" button in the workbench rail. Latchless — every click reposts, no per-page-load
 * ceiling, since the host is confirmed to support repeated triggers.
 */
function markComplete() {
  window.parent.postMessage({ type: 'sim:complete' }, '*');
}

// ============================================================================
// rebuild() — THE ONLY path for geometry changes (CLAUDE.md, non-negotiable).
// ============================================================================

/**
 * THE ONLY path for geometry changes (CLAUDE.md, non-negotiable). It runs the full disposal
 * contract, then — in your domain build — regenerates the scene. In the starter template the
 * build seam is empty, so the scene stays an empty paper viewport. Passing `null` clears to the
 * empty start.
 *
 * @param {object | null} shapeData
 */
function rebuild(shapeData) {
  currentShapeData = shapeData;

  // Stop any in-flight Observer glide / fold before its onUpdate can write to geometry we are about
  // to dispose (a tween outliving its target is the classic post-rebuild dangling write).
  observerTween?.cancel();
  observerTween = null;
  foldTween?.cancel();
  foldTween = null;
  frameTween?.cancel();
  frameTween = null;

  // --- Disposal contract (CLAUDE.md / ADR-042), made DEEP. Every child of shapeGroup is a GROUP
  //     (the fold root's hinge pivots, the block, the rays, the Observer) whose real geometry +
  //     materials are NESTED, so the starter's shallow loop — which disposed only a direct child's
  //     own geometry/material — would free NOTHING here and leak the context across rebuilds.
  //     Traverse each child so every descendant's geometry + material(s) + maps are released.
  //     Verify with renderer.info.memory: geometries + textures must stay flat across 50 rebuilds. ---
  //     CSS2D objects (the plane pills + the Observer icon) carry no GPU resources, but their DOM
  //     nodes live in the label overlay — disposeObj pulls each one out (RULES.md §3.5), because a
  //     CSS2DObject only auto-removes its element when IT is the directly-removed child, and here
  //     they are nested descendants of the cleared top-level groups.
  for (const child of shapeGroup.children) child.traverse(disposeObj);
  shapeGroup.clear();
  glassBoxGroup = solidData = projectorsGroup = observerGroup = sightObj = null;
  observerIcon = null;
  foldPivotHP = foldPivotPP = null;
  foldFadeMats = [];
  planeLayer = [];
  planeLabels = [];
  viewByPlane = { hp: null, vp: null, pp: null };

  // ── DOMAIN BUILD SEAM — the Glass Box scene ────────────────────────────────────────────────
  // A truthy shapeData builds the block + grid planes + cast views + Observer; null clears to the
  // empty view (the reset/context-loss no-op path). Everything ends up under shapeGroup (the fold
  // pivots, the block, the Observer) so the deep disposal above reaches it.
  if (shapeData) {
    const resolution = bufferResolution();

    // 1) Build the Bearing Block FIRST — it sizes the exploded box (paneHalf/planeOffset) from its
    //    bounding box, which the pane views + the 2D Compare sheet both need before they can draw.
    solidData = buildBearingBlockSolid();               // block mesh + Box3 corners
    glassBoxGroup = createGlassBox({                    // 3 exploded grid planes + CSS2D pills
      half: paneHalf, offset: planeOffset, resolution,
    });
    // Exact 2D views (Phase-3 QA polish): castProjectors constructs each pane's drawing
    // segment-by-segment from the block's dimension table — no EdgesGeometry, no seam filters.
    // The dims are BEARING_BLOCK_DIMS scaled to world by BLOCK_SCALE (the mesh carries only that
    // uniform scale, so ×BLOCK_SCALE IS the world transform); glassBox.js is a leaf and never
    // imports the generator (ADR-007 star rule), so the numbers are computed here and passed in.
    projectorsGroup = castProjectors({
      offset: planeOffset, resolution,
      dims: {
        halfLength: BEARING_BLOCK_DIMS.halfLength * BLOCK_SCALE,
        halfDepth: BEARING_BLOCK_DIMS.halfDepth * BLOCK_SCALE,
        // Body width equals the boss diameter (sides tangent to the dome), so the boss radius IS
        // the body half-width.
        halfBody: BEARING_BLOCK_DIMS.bossRadius * BLOCK_SCALE,
        baseBottomY: BEARING_BLOCK_DIMS.baseBottomY * BLOCK_SCALE,
        baseTopY: BEARING_BLOCK_DIMS.baseTopY * BLOCK_SCALE,
        axisY: BEARING_BLOCK_DIMS.axisY * BLOCK_SCALE,
        topY: BEARING_BLOCK_DIMS.topY * BLOCK_SCALE,
        // Bore (horizontal, axis Z) + the two vertical mounting holes — feed the hidden/visible
        // hole linework in castProjectors (Bearing Block silhouette fix).
        boreRadius: BEARING_BLOCK_DIMS.boreRadius * BLOCK_SCALE,
        mountRadius: BEARING_BLOCK_DIMS.mountRadius * BLOCK_SCALE,
        mountX: BEARING_BLOCK_DIMS.mountX.map((x) => x * BLOCK_SCALE),
      },
    });
    observerGroup = buildObserver();                    // flat CSS2D Observer eye icon (ADR-049)

    // 2) Assemble the fold: re-parent each pane (grid + border) + its 2D view outline onto the hinge
    //    pivots; the block and Observer stay un-hinged (they dissolve on fold).
    assembleScene();

    // 3) Seat the Observer at the current view (no glide on a fresh build) + its sight lines.
    applyObserverView(observerView, { animate: false });

    // Every fat line needs the live drawing-buffer resolution or it renders the wrong width.
    updateLineResolution();

    // 4) Snap the fold to the current state (a rebuild while unfolded lands flat instantly), then
    //    re-apply the current guided step so per-layer visibility survives the rebuild.
    gatherFadeMaterials();
    gatherPlaneFadeMats();
    currentFoldF = isUnfolded ? 1 : 0;
    applyFoldPose(currentFoldF);
    renderStep(currentStep, { animate: false });
  }
  // ───────────────────────────────────────────────────────────────────────────────────────────

  // The 2D Compare sheet mirrors the current solid; repaint it if the split pane is live.
  if (document.body.classList.contains('compare-split')) paintCompare();

  notifyStateChange(); // state change committed — re-run any subscriber (e.g. a self-check)
}

// ============================================================================
// Fold assembly + the cinematic unfold
// ============================================================================

/**
 * Wire the freshly-built factory groups into the fold structure. Each pane (grid + border + CSS2D
 * pill) and its 2D view outline are re-parented — by their `userData.plane` tag — onto a hinge
 * pivot. The pivots use a nested inner group whose position is the exact negative of the pivot's,
 * so the world-baked fat-line geometry keeps its position at rest (rotation 0) and simply rotates
 * about the hinge LINE when the pivot turns — no geometry recompute.
 *
 * HINGE TOPOLOGY (ADR-108, restoring ADR-044 — supersedes ADR-049's "Module 2 parity" nesting):
 * the PP hinge is a scene-level SIBLING of the HP hinge, not nested inside it. Module 2 nests its
 * PP hinge inside the VP's own fold group because Module 2's VP itself folds, so a free-standing
 * pivot could not track a moving Front view; that constraint does not apply here — Glass Box's VP
 * (`vpRoot`) is fixed at identity, so PP can hinge straight onto it. PP folds sideways into the VP
 * plane about the VP∩PP line, independently of the HP fold — landing the Side view beside the
 * Front view. The solid and the Observer are NOT hinged; they dissolve across the fold.
 */
function assembleScene() {
  const D = planeOffset;

  // HP hinges about the ground line (0,−D,−D) along X. (The panes are exploded, so the hinge axis
  // sits in VP's plane a gap beyond the HP pane's edge — the flattened floor lands coplanar with
  // the VP, preserving the explode gap as sheet separation.)
  foldPivotHP = new THREE.Group();
  foldPivotHP.name = 'HP hinge';
  foldPivotHP.position.set(0, -D, -D);
  const hpInner = new THREE.Group();
  hpInner.position.set(0, D, D); // = −pivot, so children sit at their world coords when unrotated
  foldPivotHP.add(hpInner);

  // PP hinges about the VP∩PP line (x=+D, z=−D, along Y), directly onto the FIXED VP — a scene
  // sibling of the HP hinge, not nested inside it (ADR-108 restores ADR-044; see the HINGE
  // TOPOLOGY doc above for why Module 2's nesting doesn't apply here).
  foldPivotPP = new THREE.Group();
  foldPivotPP.name = 'PP hinge';
  foldPivotPP.position.set(D, 0, -D);
  const ppInner = new THREE.Group();
  ppInner.position.set(-D, 0, D); // = −pivot
  foldPivotPP.add(ppInner);

  // VP is fixed — a plain group at identity keeps its pieces where they are.
  const vpRoot = new THREE.Group();
  vpRoot.name = 'VP fixed';

  const foldRoot = new THREE.Group();
  foldRoot.name = 'Fold Root';
  foldRoot.add(foldPivotHP, foldPivotPP, vpRoot);
  shapeGroup.add(foldRoot);

  // Route every tagged pane piece (grid + border + CSS2D pill) and 2D view outline onto its
  // plane's hinge (or VP's fixed root), collecting the per-layer handles renderStep toggles.
  // The pills go to planeLabels (element-opacity fade), everything else to planeLayer.
  const bin = { hp: hpInner, vp: vpRoot, pp: ppInner };
  const route = (obj) => { bin[obj.userData.plane]?.add(obj); };
  for (const obj of [...glassBoxGroup.children]) {
    route(obj);
    if (obj.userData.role === 'label') planeLabels.push(obj);
    else planeLayer.push(obj); // grid + border → the "planes" layer (Step 2)
  }
  for (const obj of [...projectorsGroup.children]) {
    if (obj.userData.role === 'view') { viewByPlane[obj.userData.plane] = obj; route(obj); }
  }

  // The block + Observer are 3D-only dressing (dissolve on fold); add them un-hinged.
  shapeGroup.add(solidData.group);
  shapeGroup.add(observerGroup);
}

/** Collect the materials that fade out as the box flattens, remembering each one's base opacity so
 *  the fold multiplies from a stable value (never accumulates). The sight lines are handled by
 *  applyFoldPose via the live sightObj, since they are rebuilt on every view change. */
function gatherFadeMaterials() {
  foldFadeMats = [];
  const add = (root) => root?.traverse((o) => {
    const m = o.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((mm) => {
      // Flip on transparency ONCE here (with a recompile) so the per-frame fold only touches
      // opacity — toggling `transparent` every frame would force a shader recompile each time.
      if (!mm.transparent) { mm.transparent = true; mm.needsUpdate = true; }
      foldFadeMats.push({ mat: mm, base: mm.opacity });
    });
  });
  add(solidData?.group);
  add(observerGroup);
}

/**
 * Place the fold at progress `f` (0 = 3D box, 1 = flat first-angle layout): rotate the two hinge
 * pivots and fade the dissolving dressing. Used both by the live tween (each frame) and by rebuild()
 * to snap to a state instantly.
 * @param {number} f
 */
function applyFoldPose(f) {
  if (foldPivotHP) foldPivotHP.rotation.x = f * HP_FOLD_ANGLE;
  // PP swings about the VP∩PP line (local Y) — an independent sibling hinge, driven by the same f
  // so both folds complete together (ADR-108 restores ADR-044).
  if (foldPivotPP) foldPivotPP.rotation.y = f * PP_FOLD_ANGLE;

  // Fade the 3D-only dressing out as the box flattens; hide it entirely once flat so no faint ghost
  // lines linger over the clean 2D layout (and to avoid z-fighting the flattened outlines). Only
  // opacity varies per frame — `transparent` was set once in gatherFadeMaterials (no recompile here).
  const visible = f < 0.999;
  for (const { mat, base } of foldFadeMats) mat.opacity = base * (1 - f);
  if (solidData) solidData.group.visible = visible;
  if (observerGroup) observerGroup.visible = visible;
  // The Observer's CSS2D icon dissolves like the wireframe it replaced, but on its DOM element —
  // and its OWN .visible must be set because the r160 CSS2DRenderer ignores ancestor visibility.
  if (observerIcon) {
    observerIcon.element.style.opacity = String(1 - f);
    observerIcon.visible = visible;
  }
  // Sight lines have a SECOND gate on top of the fold's dissolve — which layers the current
  // guided step allows (applyStepGating). Both must agree for a sight line to actually show.
  if (sightObj) sightObj.visible = visible && sightAllowed;
}

/**
 * Drive the cinematic fold. `forward` = true unfolds the box into the flat first-angle layout;
 * false folds it back to a 3D box. A weighted easeFold hinge over FOLD_DURATION; reduced motion
 * snaps to the end state (the STATE still reaches its end value — DESIGN.md).
 * @param {boolean} forward
 */
function driveFold(forward) {
  if (!foldPivotHP) return; // no scene built yet (empty view)
  isUnfolded = forward;
  syncUnfoldBtn();

  foldTween?.cancel();
  foldTween = null;

  const from = currentFoldF;
  const to = forward ? 1 : 0;

  if (prefersReducedMotion) {
    currentFoldF = to;
    applyFoldPose(to);
  } else {
    foldTween = tween({
      from, to, duration: FOLD_DURATION, ease: easeFold,
      onUpdate: (v) => { currentFoldF = v; applyFoldPose(v); },
      onComplete: () => { currentFoldF = to; applyFoldPose(to); foldTween = null; },
    });
  }

  announce(forward
    ? 'Glass box unfolded into the flat first-angle multiview.'
    : 'Glass box folded back into the 3D box.');
  flowNote(forward
    ? 'The box unfolds: each face swings flat to lay its view out in first angle.'
    : 'The box folds back up around the object.');
}

/** Sync the rail Unfold/Fold toggle's pressed state + label to the current fold. */
function syncUnfoldBtn() {
  if (!unfoldBtn) return;
  unfoldBtn.setAttribute('aria-pressed', String(isUnfolded));
  const label = unfoldBtn.querySelector('.unfold-toggle__text');
  if (label) label.textContent = isUnfolded ? 'Fold Glass Box' : 'Unfold Glass Box';
}

/** Wire the docked Unfold/Fold toggle in the workbench rail (ADR-037), the Step-5-only
 *  "Back to Step 4" escape hatch (ADR-047), and the "Finish lesson" button — the wizard (and its
 *  own Back/Next) is hidden while the Compare split is open, so the rail is the only surface
 *  reachable from there. */
function setupWorkbenchRail() {
  unfoldBtn = document.getElementById('unfold-toggle');
  if (unfoldBtn) {
    unfoldBtn.addEventListener('click', () => driveFold(!isUnfolded));
    syncUnfoldBtn();
  }
  document.getElementById('rail-back')?.addEventListener('click', () => stepper?.back());
  // Finish lesson: posts sim:complete to the host (no latch — every click reposts, ADR-078
  // addendum revised). Lives beside the fold toggle rather than a footer nav slot, since the
  // wizard/footer is hidden for the whole of Step 5 (see class comment above).
  document.getElementById('btn-finish')?.addEventListener('click', () => {
    markComplete();
    announce('Lesson marked complete.');
  });
}

// ============================================================================
// Glass Box domain — geometry builders, the disposal primitive, the fat-line
// resolution walker, and the orbiting Observer. Every builder only CREATES;
// teardown is the deep disposal traversal in rebuild(). All output is a DIRECT
// child of shapeGroup so that traversal reaches it.
// ============================================================================

/** The default on-screen state: the full Glass Box scene. Passing this (vs null) into rebuild()
 *  builds the Bearing Block + reference planes + projectors + Observer; null clears to empty. */
function defaultShapeData() {
  return { solid: 'bearing-block' };
}

/** Dispose one object's GPU resources — geometry + every material (+ any texture map). The single
 *  teardown primitive the deep disposal traversal applies to every descendant of shapeGroup
 *  (ADR-042). Nothing here is persistent across rebuilds — the reference planes are rebuilt fresh
 *  each time (they size themselves from the block's live bounding box), unlike the old fixed-size
 *  box's HP grid, which is gone. */
function disposeObj(obj) {
  // CSS2D nodes (plane pills, Observer icon) are DOM, not GPU — pull the element out of the label
  // overlay here (RULES.md §3.5). The CSS2DObject 'removed' auto-cleanup only fires when IT is the
  // directly-removed child; as a nested descendant of a cleared group it would leak its node.
  if (obj.isCSS2DObject) obj.element?.remove();
  obj.geometry?.dispose();
  const mat = obj.material;
  if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => { m?.map?.dispose(); m?.dispose(); });
}

/** The live drawing-buffer size in device pixels, which every LineMaterial needs to size its
 *  fattened lines. Read fresh at each build + resize. */
function bufferResolution() {
  const v = new THREE.Vector2();
  renderer.getDrawingBufferSize(v);
  return v;
}

/** Push the current drawing-buffer resolution into every LineMaterial under shapeGroup. Called at
 *  the end of rebuild() and on every resize; without it the fat lines render the wrong width. */
function updateLineResolution() {
  if (!shapeGroup) return;
  const res = bufferResolution();
  shapeGroup.traverse((obj) => {
    const mat = obj.material;
    if (!mat) return;
    (Array.isArray(mat) ? mat : [mat]).forEach((m) => { if (m?.isLineMaterial) m.resolution.copy(res); });
  });
}

/**
 * The domain object: the Foundations Bearing Block (ADR-045), scaled to float inside the glass box.
 * Returns the group AND the block's axis-aligned BOUNDING-BOX corner points — the 8 extreme
 * corners the sight lines cast from. Building it also sizes the exploded reference planes
 * (paneHalf/planeOffset) and the 2D Compare sheet bounds (sheet) from the bounding box. (The pane
 * view outlines AND the 2D Compare sheet are both dimension-constructed — from glassBox.js
 * castProjectors and drawCompare respectively — so no EdgesGeometry silhouette extraction is
 * needed here any more; ADR-050 final polish.)
 * @returns {{ group: THREE.Group, verts: THREE.Vector3[] }}
 */
function buildBearingBlockSolid() {
  const group = new THREE.Group();
  group.name = 'Bearing Block';

  // The Foundations Bearing Block mesh (flat CAD MeshPhongMaterial, polygonOffset — copied leaf),
  // shrunk to sit inside the box with clear air around it.
  const mesh = createBearingBlock();
  mesh.scale.setScalar(BLOCK_SCALE);
  group.add(mesh);

  // Axis-aligned bounding box → paneHalf/planeOffset (exploded plane placement) + the 2D sheet
  // bounds. The 8 corners are what the sight lines cast from.
  const box = new THREE.Box3().setFromObject(mesh);
  boundHalf = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const c = box.getCenter(new THREE.Vector3());
  paneHalf = Math.max(boundHalf.x, boundHalf.y, boundHalf.z) + PANE_MARGIN;
  planeOffset = paneHalf + PLANE_EXPLODE_GAP;
  sheet.hx = boundHalf.x; sheet.hy = boundHalf.y; sheet.hz = boundHalf.z;

  // 8 bounding-box corners (about the box centre, ≈ origin) — the sight lines cast from these.
  const verts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    verts.push(new THREE.Vector3(c.x + sx * boundHalf.x, c.y + sy * boundHalf.y, c.z + sz * boundHalf.z));
  }

  return { group, verts };
}

/**
 * The Observer — a flat CSS2D eye icon (ADR-049 replaces the wireframe camera assembly: a viewport
 * AID should be the lightest thing that reads, and a DOM glyph costs zero geometry, zero disposal
 * bookkeeping beyond its DOM node, and always faces the camera). Built at the origin;
 * applyObserverView() positions the group on a principal axis (lookAt is a no-op for a
 * screen-facing icon, kept for the shared seat() path). The icon's element is pulled from the
 * overlay by disposeObj (§3.5); its fold dissolve is driven in applyFoldPose via element opacity +
 * its OWN .visible (the r160 CSS2DRenderer ignores ancestor visibility).
 * @returns {THREE.Group}
 */
function buildObserver() {
  const group = new THREE.Group();
  group.name = 'Observer';

  const el = document.createElement('div');
  el.className = 'observer-icon';
  // Strictly inherit the platform's Atkinson Hyperlegible UI face (--font-sans) rather than a
  // system default; the caption span (class rule uses --font-mono) is overridden inline below.
  el.style.fontFamily = 'var(--font-sans)';
  // Inline SVG eye glyph — stroke follows the element's CSS `color` (ink-secondary token).
  el.innerHTML =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/>' +
    '<circle cx="12" cy="12" r="2.6"/></svg>' +
    '<span class="observer-icon__text" style="font-family: var(--font-sans)">Observer</span>';

  observerIcon = new CSS2DObject(el);
  observerIcon.name = 'Observer icon';
  // Center the DOM element on its exact 3D coordinate (CSS2DObject default, made explicit) so the
  // icon sits ON observerGroup.position — the same point drawSightLines() casts the sight rays from,
  // not an offset corner.
  observerIcon.center.set(0.5, 0.5);
  group.add(observerIcon);
  return group;
}

/** Project a bounding-box corner straight onto one view's glass pane (the ortho drop / cast / side).
 *  Targets the EXPLODED pane offsets (ADR-049), so sight lines land on the panes themselves. */
function projectToPlane(v, view) {
  if (view === 'top')   return new THREE.Vector3(v.x, -planeOffset, v.z); // onto the HP floor (y = −D)
  if (view === 'front') return new THREE.Vector3(v.x, v.y, -planeOffset); // onto the VP back  (z = −D)
  return new THREE.Vector3(planeOffset, v.y, v.z);                        // onto the PP right (x = +D)
}

/** Tear down the current sight-line object (its own disposal + detach from the scene graph). */
function clearSightLines() {
  if (!sightObj) return;
  disposeObj(sightObj);
  sightObj.parent?.remove(sightObj);
  sightObj = null;
}

/** Draw the faint lines of sight from the Observer eye to each corner's image on the active view's
 *  glass pane — the cone of rays the viewer "sees" through the solid onto the glass. Rebuilt (old
 *  one disposed) on every view change, so it never accumulates. */
function drawSightLines(view) {
  clearSightLines();
  if (!observerGroup || !solidData) return;
  const p = observerGroup.position;
  const pos = [];
  for (const v of solidData.verts) {
    const q = projectToPlane(v, view);
    pos.push(p.x, p.y, p.z, q.x, q.y, q.z);
  }
  sightObj = makeFatSegments(
    pos, cssColor('--color-bench-grey'), 1.0, { dashed: false, opacity: 0.38 }, bufferResolution(),
  );
  sightObj.name = 'Sight Lines';
  shapeGroup.add(sightObj); // a direct sibling of the Observer, so the deep disposal reaches it
}

/**
 * Move the Observer to a principal view. On a fresh build it snaps; from a user click it glides
 * along an arc between the two axes (sight lines hidden mid-glide, redrawn on arrival). Reduced
 * motion snaps regardless (DESIGN.md — state still reaches its end value).
 * @param {'top'|'front'|'side'} view
 * @param {{ animate?: boolean }} [opts]
 */
function applyObserverView(view, { animate = true } = {}) {
  if (!observerGroup || !(view in VIEW_DIR)) return;

  const fromDir = observerDir.clone();
  const toDir = VIEW_DIR[view].clone();

  observerTween?.cancel();
  observerTween = null;
  clearSightLines(); // hidden while the eye is between axes

  const seat = (dir) => {
    observerGroup.position.copy(dir).multiplyScalar(planeOffset * OBSERVER_DIST_K);
    observerGroup.lookAt(0, 0, 0);
  };

  if (!animate || prefersReducedMotion) {
    observerDir.copy(toDir);
    observerView = view;
    seat(toDir);
    drawSightLines(view);
    applyStepGating(); // the new sightObj + this view's ray/outline need the current step's gate
    return;
  }

  const tmp = new THREE.Vector3();
  observerTween = tween({
    from: 0, to: 1, duration: 900, ease: easeCamera,
    onUpdate: (t) => { seat(tmp.copy(fromDir).lerp(toDir, t).normalize()); },
    onComplete: () => {
      observerDir.copy(toDir);
      observerView = view;
      drawSightLines(view);
      applyStepGating();
      observerTween = null;
    },
  });
}

/** Wire Step 3's Front/Top/Side buttons (three stacked "textbook" view choices in the wizard panel —
 *  the final-QA redesign replaced the single segmented pill) to glide the Observer between the three
 *  principal viewing axes. One button latches at a time; the other two mute (mutual exclusion). */
function setupStepViewButtons() {
  step3ViewBtns = [...document.querySelectorAll('[data-quick-view]')];
  step3ViewGroup = document.querySelector('.view-choices');
  for (const btn of step3ViewBtns) {
    btn.addEventListener('click', () => {
      const view = btn.dataset.quickView;
      if (!(view in VIEW_DIR)) return;
      if (isUnfolded) return; // the Observer + sight lines belong to the 3D box, not the flat sheet
      setActiveStepViewBtn(btn);
      applyObserverView(view, { animate: true });
      announce(`Observer moved to the ${view} view.`);
    });
  }
  clearStepViewButtons(); // enter Step 3 neutral — invite the learner to pick any view
}

/** Latch one Step-3 view button as active (Two-Cue: accent fill + aria-pressed) and mute the other
 *  two by marking the group as having a selection. */
function setActiveStepViewBtn(active) {
  for (const btn of step3ViewBtns) {
    const on = btn === active;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  }
  step3ViewGroup?.classList.add('has-selection');
}

/** Clear every Step-3 latch back to the neutral invite state (no view chosen). Runs on setup, on
 *  entering any step (renderStep), and on reset — so the learner always meets Step 3 un-latched. */
function clearStepViewButtons() {
  for (const btn of step3ViewBtns) {
    btn.classList.remove('is-active');
    btn.setAttribute('aria-pressed', 'false');
  }
  step3ViewGroup?.classList.remove('has-selection');
}

// ============================================================================
// Dynamic camera framing (Phase-1 QA polish) — the perspective camera is coupled to the active
// step: Step 1 hugs the Bearing Block alone (planes hidden); Step 2+ dollies BACK to hold the whole
// exploded reference box. It is a pure DOLLY along the current sight-line (the orbit target is held
// at the origin) so the learner's orbit direction survives the move, and it eases both ways — out
// on 1→2, back in on 2→1 — via the shared easeCamera tween. Only the 1↔2 boundary re-frames;
// stepping 2→3→4→5 keeps the wide frame, so a manual zoom inside those steps is never yanked back.
// ============================================================================

const FRAME_DURATION = 900;   // ms — the dolly ease (matches the Observer glide cadence)
const FRAME_MARGIN = 1.08;       // small-breather multiplier around the exploded box (Step 2+) — the
                                 // three grids fill the frame with just a little air (Phase-1 QA polish)
const FRAME_MARGIN_TIGHT = 1.03; // Step 1 hugs the lone block tight so it fills the viewport before
                                 // the planes are revealed (Part-3 QA polish)

/** In-flight dolly tween (cancelled on re-trigger / rebuild). */
let frameTween = null;
/** Which framing bucket is applied: 0 none yet, 1 tight-on-block, 2 wide-on-box. Reset to 0 by
 *  simAPI.reset() so a reset always re-hugs the block even if we were already conceptually on Step 1. */
let currentFrameStep = 0;

/** The bounding-sphere radius (about the origin target) the camera must hold for a step. Step 1
 *  hugs the block's bounding sphere (planes hidden); Step 2+ opens to the exploded box, whose
 *  corners sit at ±planeOffset on all three axes → radius planeOffset·√3. */
function frameRadiusForStep(step) {
  if (step <= 1) return boundHalf.length();
  return planeOffset * Math.sqrt(3);
}

/** Perspective dolly distance that fits a sphere of `radius` in BOTH frustum axes (vertical +
 *  aspect-corrected horizontal), times the comfortable-margin factor — so a wide/tall viewport
 *  both frame the target with air to spare. */
function fitDistance(radius, margin = FRAME_MARGIN) {
  const vFOV = THREE.MathUtils.degToRad(camera.fov);
  const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * camera.aspect);
  return Math.max(radius / Math.sin(vFOV / 2), radius / Math.sin(hFOV / 2)) * margin;
}

/**
 * Ease the camera to the framing for `step`. A pure dolly: the target is held (origin), the current
 * sight-line direction is preserved, only the distance changes. No-op when the framing bucket is
 * unchanged (so 2→3→4 don't re-frame and a manual zoom survives). Reduced motion / animate:false
 * snap straight to the fitted distance (state still reaches its end value — DESIGN.md).
 * @param {number} step
 * @param {{ animate?: boolean }} [opts]
 */
function frameToStep(step, { animate = true } = {}) {
  if (!camera || !controls) return;
  const bucket = step <= 1 ? 1 : 2;
  if (bucket === currentFrameStep) return; // same framing — leave the camera (and any manual zoom) be
  currentFrameStep = bucket;

  const target = controls.target;
  const dir = camera.position.clone().sub(target);
  if (dir.lengthSq() < 1e-6) dir.copy(DEFAULT_CAMERA_POSITION).sub(DEFAULT_CAMERA_TARGET); // degenerate guard
  dir.normalize();

  const fromDist = camera.position.distanceTo(target);
  const toDist = fitDistance(frameRadiusForStep(step), step <= 1 ? FRAME_MARGIN_TIGHT : FRAME_MARGIN);
  const seat = (dist) => { camera.position.copy(target).addScaledVector(dir, dist); controls.update(); };

  frameTween?.cancel();
  frameTween = null;
  if (!animate || prefersReducedMotion) { seat(toDist); return; }
  frameTween = tween({
    from: fromDist, to: toDist, duration: FRAME_DURATION, ease: easeCamera,
    onUpdate: seat,
    onComplete: () => { seat(toDist); frameTween = null; },
  });
}

// ============================================================================
// Guided steps — renderStep(step) is the ONLY place that decides which domain layers are on
// screen for a given step of the 5-step sequence (CLAUDE.md single-pipeline spirit, extended to
// per-layer visibility). Steps 1–4 gate visibility only; Step 5 additionally drives the cinematic
// fold + opens the Compare split. Idempotent — safe to call on every rebuild() and every rail jump.
// ============================================================================

/** Collect the planes' (grid + border) materials + base opacity, mirroring gatherFadeMaterials —
 *  lets the Step-2 reveal tween opacity without a per-frame shader recompile. */
function gatherPlaneFadeMats() {
  planeFadeMats = [];
  for (const obj of planeLayer) {
    const m = obj.material;
    if (!m) continue;
    if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
    planeFadeMats.push({ mat: m, base: m.opacity });
  }
}

/** Push plane-reveal progress `f` (0 = hidden, 1 = fully shown) onto every plane material's opacity,
 *  and onto the CSS2D plane pills — element opacity for the fade, plus each pill's OWN `.visible`
 *  (the r160 CSS2DRenderer ignores ancestor visibility, so a faded-out pill must be flagged off
 *  itself or it lingers over Step 1). */
function applyPlaneOpacity(f) {
  for (const { mat, base } of planeFadeMats) mat.opacity = base * f;
  for (const label of planeLabels) {
    label.element.style.opacity = String(f);
    label.visible = f > 0.01;
  }
}

/** Tween the exploded reference planes in or out (Step 2's "fade in the HP/VP/PP grids"). Reduced
 *  motion snaps straight to the end value (state still reaches its end value — DESIGN.md). */
function setPlanesRevealed(on) {
  const to = on ? 1 : 0;
  if (Math.abs(planeRevealF - to) < 0.001 && !planeRevealTween) return;
  planeRevealTween?.cancel();
  planeRevealTween = null;
  const from = planeRevealF;

  if (prefersReducedMotion) {
    planeRevealF = to;
    applyPlaneOpacity(to);
    return;
  }
  planeRevealTween = tween({
    from, to, duration: 700, ease: easeCamera,
    onUpdate: (v) => { planeRevealF = v; applyPlaneOpacity(v); },
    onComplete: () => { planeRevealF = to; applyPlaneOpacity(to); planeRevealTween = null; },
  });
}

/**
 * Recompute + push static per-layer visibility for the CURRENT step + observer view (no fold or
 * Compare-split side effects — called after a view switch so the just-rebuilt sight lines and the
 * per-plane view outlines reflect the still-current step, and by renderStep() as part of a full
 * step change).
 *
 * Layer rules:
 *   • sight lines (Observer eye → each corner, on the ACTIVE view's plane) — Step 3 only.
 *   • the exact 2D view outline on each pane — the active view's plane in Step 3, all three in
 *     Step 4+, none in Steps 1/2.
 */
function applyStepGating() {
  const showAllViews = currentStep >= 4;
  const inStep3 = currentStep === 3;
  sightAllowed = inStep3;
  for (const plane of ['hp', 'vp', 'pp']) {
    viewAllowed[plane] = showAllViews || (inStep3 && VIEW_PLANE[observerView] === plane);
    if (viewByPlane[plane]) viewByPlane[plane].visible = viewAllowed[plane];
  }
  applyFoldPose(currentFoldF); // re-assert sight .visible, ANDed with the fold's dissolve gate
}

/**
 * Render one guided step (1–5) of the Glass Box sequence.
 *   1 The Object      — block + Observer only (planes/views/rays/sight all gated off).
 *   2 Planes          — the exploded HP/VP/PP grids fade in.
 *   3 Lines of Sight   — the Front/Top/Side buttons glide the Observer; only ITS view's
 *                        projectors + sight lines show.
 *   4 The Glass Box    — all 3 views + all bounding projectors, simultaneously.
 *   5 2D Compare View  — the cinematic fold + the 50/50 Compare split.
 * @param {number} step
 * @param {{ animate?: boolean }} [opts]
 */
function renderStep(step, { animate = true } = {}) {
  currentStep = Math.min(Math.max(step, 1), 5);
  clearStepViewButtons(); // each step change re-arms Step 3's neutral invite (latch only on click)
  if (!glassBoxGroup) return; // nothing built yet (empty view, or called before the first rebuild)

  applyStepGating();

  // Couple the camera to the step: Step 1 tight on the block, Step 2+ dollied back to the whole box.
  frameToStep(currentStep, { animate });

  const showPlanes = currentStep >= 2;
  if (animate) setPlanesRevealed(showPlanes);
  else {
    planeRevealTween?.cancel();
    planeRevealTween = null;
    planeRevealF = showPlanes ? 1 : 0;
    applyPlaneOpacity(planeRevealF);
  }

  const wantUnfold = currentStep >= 5;
  if (wantUnfold !== isUnfolded) driveFold(wantUnfold);

  if (currentStep >= 5) {
    if (!document.body.classList.contains('compare-split')) enterCompareSplit();
  } else {
    if (document.body.classList.contains('compare-split')) exitCompareSplit();
  }
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

  // Renderer. Antialias for crisp technical edges; cap DPR so retina iframes don't overdraw.
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = false; // no cast shadows (CLAUDE.md visual style)
  container.appendChild(renderer.domElement);

  // WebGL context loss/restore (CLAUDE.md flags context exhaustion as the most likely late-stage
  // bug). Without preventDefault() the browser will NOT restore the context and the canvas freezes
  // blank. So stop the loop + show a quiet chip on loss, then rebuild the current state on restore.
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // REQUIRED — opts in to a restorable context
    stopLoop();
    showContextLostNotice(true);
  }, false);
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    rebuild(currentShapeData); // re-upload GPU state (rebuild(null) is a no-op clear when empty)
    showContextLostNotice(false);
    startLoop();
  }, false);

  // Lighting: flat ambient fill + ONE low directional, no shadows (CLAUDE.md visual style).
  scene.add(new THREE.AmbientLight(0xffffff, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.55);
  key.position.set(5, 8, 6);
  key.castShadow = false;
  scene.add(key);

  shapeGroup = new THREE.Group();
  scene.add(shapeGroup);

  // CSS2D overlay for the plane pills + Observer icon (ADR-049). A transparent DOM layer sized to
  // the canvas; pointer-events disabled so drag-to-orbit passes through. Appended to the same
  // container as the canvas so it tracks the viewport's box exactly (Module 2 convention).
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(w, h);
  const overlay = labelRenderer.domElement;
  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.pointerEvents = 'none';
  container.appendChild(overlay);

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
  // Delta in ms (cap to avoid a huge jump after a pause/tab-switch resumes).
  const delta = lastFrameTime ? Math.min(now - lastFrameTime, 64) : 16;
  lastFrameTime = now;

  tickTweens(delta);  // advance any domain animations (pauses with the loop)
  controls.update();  // applies damping inertia
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera); // CSS2D overlay (plane pills + Observer icon) on top
}

function startLoop() {
  if (running) return;
  running = true;
  lastFrameTime = 0; // reset delta clock so resume() doesn't see a stale gap
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
  labelRenderer?.setSize(w, h); // keep the CSS2D overlay aligned to the canvas
  updateLineResolution(); // the drawing buffer changed — re-sync every fat line's width
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
// Reset control — the ghost "Reset" button in the wizard's #card__nav, guarded by an
// inline two-state confirm (RULES.md §4.19) so a stray click can't wipe the drawing.
// Only "Yes" ever calls simAPI.reset() — the single reset path (§2.9).
// ============================================================================

function setupResetControl() {
  const btnReset = document.getElementById('btn-reset');
  const resetConfirm = document.getElementById('reset-confirm');
  const btnResetYes = document.getElementById('btn-reset-yes');
  const btnResetCancel = document.getElementById('btn-reset-cancel');
  if (!btnReset || !resetConfirm || !btnResetYes || !btnResetCancel) return;

  const cardNav = btnReset.closest('.card__nav');
  let armed = false;

  /** Swap the ghost Reset for the inline confirm on the same control; Back / Next step
   *  aside (CSS .is-reset-armed) so the choice stands alone. Focus the safe option
   *  (Cancel) so a reflexive Enter or stray second click never lands on "Yes". */
  function arm() {
    if (armed) return;
    armed = true;
    btnReset.hidden = true;
    resetConfirm.hidden = false;
    cardNav?.classList.add('is-reset-armed');
    btnResetCancel.focus();
    announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
  }

  /** Return to the idle ghost Reset. A deliberate dismiss (Cancel / Escape) returns
   *  focus to Reset; tabbing or clicking away just leaves focus where it went. */
  function disarm({ returnFocus = false } = {}) {
    if (!armed) return;
    armed = false;
    resetConfirm.hidden = true;
    btnReset.hidden = false;
    cardNav?.classList.remove('is-reset-armed');
    if (returnFocus) btnReset.focus();
  }

  btnReset.addEventListener('click', arm);
  btnResetYes.addEventListener('click', () => {
    disarm({ returnFocus: true }); // tidy the control to idle before resetting
    window.simAPI.reset();         // the one reset path (§2.9); re-syncs + announces
  });
  btnResetCancel.addEventListener('click', () => {
    disarm({ returnFocus: true });
    announce('Reset cancelled.');
  });

  // Escape backs out (matches the term-popover convention in terms.js).
  resetConfirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      disarm({ returnFocus: true });
      announce('Reset cancelled.');
    }
  });

  // Tabbing or clicking outside the armed confirm abandons it (nothing is lost), so the
  // learner is never stranded with Back / Next hidden behind a forgotten prompt.
  resetConfirm.addEventListener('focusout', (e) => {
    if (armed && !resetConfirm.contains(e.relatedTarget)) disarm();
  });
  document.addEventListener('pointerdown', (e) => {
    if (armed && !resetConfirm.contains(e.target)) disarm();
  });
}

// ============================================================================
// Wizard hide/show — collapse the guided-steps panel for a larger 3D view.
// Toggles a body class; the viewport reflows to full width via flex, and the
// ResizeObserver below keeps the renderer in sync.
// ============================================================================

function setupWizardToggle() {
  const btn = document.getElementById('wizard-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const collapsed = document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
    announce(collapsed ? 'Steps panel hidden.' : 'Steps panel shown.');

    // The viewport just changed size (flex reflow). Sync the renderer to the new box on the next
    // frame, once the layout has settled.
    requestAnimationFrame(() => handleResize(viewport));
  });
}

// ============================================================================
// Compare workbench (ADR-012 / ADR-037) — the on-demand 2D drawing that expands
// into a true 50/50 split (3D left, 2D sheet right, the Unfold toggle docked in the rail).
//
// The split is active on boot (Phase 4 brief). The right pane paints the first-angle 2D
// multiview via drawCompare() (below), repainted on resize and on every rebuild; the rail
// hosts the Unfold/Fold toggle wired in setupWorkbenchRail().
//
// No-transform invariant (ADR-012): the card floats over its stage, so no ANCESTOR of
// #compare-card may carry a CSS `transform` — keep `body` and `#sim-viewport` transform-free.
// ============================================================================

let compareCard;
let compareCanvas;

/** Size the 2D canvas backing store to the stage (× devicePixelRatio), clear to paper, and hand a
 *  CSS-pixel-space context to drawCompare(). The single entry point every repaint routes through. */
function paintCompare() {
  if (!compareCanvas) return;
  const stage = compareCanvas.parentElement;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  if (!w || !h) return; // stage collapsed (card hidden) — nothing to paint yet
  const dpr = Math.min(window.devicePixelRatio, 2);
  compareCanvas.width = Math.round(w * dpr);
  compareCanvas.height = Math.round(h * dpr);
  const ctx = compareCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px; the backing store is DPR-scaled
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssVar('--color-paper'); // tokens only — never a hard-coded hex (DESIGN.md)
  ctx.fillRect(0, 0, w, h);
  drawCompare(ctx, w, h);
}

/**
 * Render the first-angle 2D multiview on the right-pane canvas in the layout the 3D fold actually
 * produces (ADR-108 restores ADR-044, superseding ADR-049's "Module 2 parity" layout — Module 2
 * carried the same bug at the time, fixed later by ADR-106): Front view (VP) top-left, Top view
 * (HP) below it (shares Front's X — vertical projectors), Side view (PP) BESIDE THE FRONT VIEW at
 * the SAME HEIGHT (the PP folds sideways into the VP plane, so Front and Side share the height
 * axis: features at the same Y line up horizontally between them — shared horizontal projectors).
 * Each view is constructed directly from the Bearing Block's dimension table (ADR-050 final
 * polish — matches src/glassBox.js castProjectors()'s draughtsman-authored pane outlines, not an
 * EdgesGeometry extraction) in the plane's design-token hue (teal HP / amber VP / violet PP) over a
 * faint same-hue wash, with the fold reference lines and view captions.
 *
 * FIXED SCALE (ADR-038): the drawing scale comes ONLY from the static SHEET bounds fitted to the
 * canvas — never from the drawn geometry — so a model unit always reads the same on-screen length
 * and the sheet never auto-zooms to chase the solid. A larger solid would extend past the sheet
 * edge rather than shrink the whole drawing.
 *
 * @param {CanvasRenderingContext2D} ctx  Context already in CSS-pixel space, cleared to paper.
 * @param {number} w  Canvas width in CSS px.
 * @param {number} h  Canvas height in CSS px.
 */
function drawCompare(ctx, w, h) {
  if (!solidData) return; // empty view — leave the clean paper sheet
  const { hx, hy, hz, gap, padPx } = sheet;

  // --- Sheet layout in model units (paper space: +x right, +y DOWN). Front top-left is the origin.
  // First-angle: Top sits below Front (shares X, vertical projectors); Side sits beside Front at
  // the SAME height (shares Y, horizontal projectors) — ADR-108 restores ADR-044, superseding
  // ADR-049's "beside Top" layout.
  const contentW = 2 * hx + gap + 2 * hz;          // Front+Top column | gap | Side, across
  const contentH = 2 * hy + gap + 2 * hz;          // Front / gap / Top band, down (Side sits in
                                                    // the top portion, matching Front's height)
  const frontC = { x: hx, y: hy };                           // Front centre (top-left)
  const topC = { x: hx, y: 2 * hy + gap + hz };             // Top centre (below Front, shares X)
  const sideC = { x: 2 * hx + gap + hz, y: hy };            // Side centre (beside FRONT, shares Y)

  // --- FIXED scale: fit the STATIC sheet bounds (not the geometry) into the canvas, centred.
  const s = Math.min((w - 2 * padPx) / contentW, (h - 2 * padPx) / contentH);
  const ox = (w - contentW * s) / 2;
  const oy = (h - contentH * s) / 2;
  const toX = (px) => ox + px * s;
  const toY = (py) => oy + py * s;

  // Faint same-hue wash behind each view (echoes the 3D glass tint; Two-Cue support, not sole cue).
  const wash = (c, halfU, halfV, token) => {
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = cssVar(token);
    ctx.fillRect(toX(c.x - halfU), toY(c.y - halfV), 2 * halfU * s, 2 * halfV * s);
    ctx.restore();
  };
  wash(frontC, hx, hy, '--color-vp-line');
  wash(topC, hx, hz, '--color-hp-line');
  wash(sideC, hz, hy, '--color-pp-line');

  // Fold reference lines (thin, dashed, ink-secondary): the ground line between Front & Top, and
  // the VP∩PP reference line between Front & Side — the seams the panes hinge about (ADR-108
  // restores ADR-044; the second line moved from Top↔Side to Front↔Side).
  ctx.save();
  ctx.strokeStyle = cssVar('--color-ink-secondary');
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const groundY = toY(2 * hy + gap / 2);
  ctx.beginPath(); ctx.moveTo(toX(0), groundY); ctx.lineTo(toX(2 * hx), groundY); ctx.stroke();
  const refX = toX(2 * hx + gap / 2);
  ctx.beginPath();
  ctx.moveTo(refX, toY(0));
  ctx.lineTo(refX, toY(2 * hy));
  ctx.stroke();
  ctx.restore();

  // Each view: constructed directly from the Bearing Block's dimension table (ADR-050 final
  // polish — matches src/glassBox.js castProjectors()'s draughtsman-authored pane outlines exactly,
  // rather than re-deriving from an EdgesGeometry silhouette). World dims are BEARING_BLOCK_DIMS ×
  // BLOCK_SCALE, the same numbers rebuild() feeds castProjectors (main.js:428-437).
  const S = BLOCK_SCALE;
  const hL = BEARING_BLOCK_DIMS.halfLength * S;   // base half-length (X)
  const hD = BEARING_BLOCK_DIMS.halfDepth * S;    // block half-depth (Z — base and body share it)
  const hB = BEARING_BLOCK_DIMS.bossRadius * S;   // body half-width (X) — equals boss radius (tangent dome)
  const bBot = BEARING_BLOCK_DIMS.baseBottomY * S; // foot underside
  const bTop = BEARING_BLOCK_DIMS.baseTopY * S;    // top of the foot slab (base/body junction)
  const axis = BEARING_BLOCK_DIMS.axisY * S;       // bore/boss axis height — the dome spring line
  const domeTop = BEARING_BLOCK_DIMS.topY * S;     // top of the dome
  // Bore (horizontal, axis Z) + the two vertical mounting holes (axis Y) — same numbers fed to
  // castProjectors (main.js rebuild()); each view draws them VISIBLE where its axis is normal to
  // that view's plane (a true circle) and HIDDEN (dashed) where the axis runs in-plane.
  const boreR = BEARING_BLOCK_DIMS.boreRadius * S;
  const mR = BEARING_BLOCK_DIMS.mountRadius * S;
  const mX = BEARING_BLOCK_DIMS.mountX.map((x) => x * S);

  const strokeView = (c, token, draw) => {
    ctx.save();
    ctx.strokeStyle = cssVar(token);
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    // Paper-local pixel mapping for this view: u right, v DOWN.
    draw((u) => toX(c.x + u), (v) => toY(c.y + v));
    ctx.stroke();
    ctx.restore();
  };

  /** Same paper-local mapping as strokeView, but dashed + thinner — for hidden (occluded) edges:
   *  a hole whose axis runs IN-PLANE for this view (so it reads as two edges, not a circle). */
  const strokeHidden = (c, token, draw) => {
    ctx.save();
    ctx.strokeStyle = cssVar(token);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    draw((u) => toX(c.x + u), (v) => toY(c.y + v));
    ctx.stroke();
    ctx.restore();
  };

  // Front view (VP): base bottom + sides, split into two SHELF segments at the top (the base and
  // body share the full block depth, so their front faces are flush — no edge crosses the central
  // span |x| < hB, matching castProjectors' vpView split). Body sides up to the dome spring line +
  // the dome as a true 180° semicircle (tangent, so no spring-line edge). The bore (axis Z, normal
  // to this plane) is a VISIBLE circle. v = −world Y (paper down = world down), matching the old
  // projFront convention.
  strokeView(frontC, '--color-vp-line', (px, py) => {
    ctx.moveTo(px(-hL), py(-bBot)); ctx.lineTo(px(hL), py(-bBot));   // base bottom
    ctx.moveTo(px(hL), py(-bBot)); ctx.lineTo(px(hL), py(-bTop));    // base right side
    ctx.moveTo(px(-hL), py(-bTop)); ctx.lineTo(px(-hL), py(-bBot));  // base left side
    ctx.moveTo(px(-hL), py(-bTop)); ctx.lineTo(px(-hB), py(-bTop));  // left shelf (base top, outside body)
    ctx.moveTo(px(hB), py(-bTop)); ctx.lineTo(px(hL), py(-bTop));    // right shelf
    ctx.moveTo(px(-hB), py(-bTop)); ctx.lineTo(px(-hB), py(-axis));  // left body side
    ctx.moveTo(px(hB), py(-bTop)); ctx.lineTo(px(hB), py(-axis));    // right body side
    ctx.moveTo(px(hB), py(-axis));
    // counterclockwise=true sweeps 0 → −π/2 (screen-up) → π, i.e. the arc bulging UP toward the
    // dome apex (smaller v) rather than the default clockwise sweep, which would bulge it down
    // into the body.
    ctx.arc(px(0), py(-axis), hB * s, 0, Math.PI, true);
    ctx.moveTo(px(boreR), py(-axis)); ctx.arc(px(0), py(-axis), boreR * s, 0, Math.PI * 2); // bore rim
  });
  // Hidden: the two mounting holes (axis Y is in-plane here) as their rim verticals.
  strokeHidden(frontC, '--color-vp-line', (px, py) => {
    for (const mx of mX) {
      ctx.moveTo(px(mx - mR), py(-bBot)); ctx.lineTo(px(mx - mR), py(-bTop));
      ctx.moveTo(px(mx + mR), py(-bBot)); ctx.lineTo(px(mx + mR), py(-bTop));
    }
  });

  // Top view (HP): base outer rectangle + the body's two longitudinal edges. The body shares the
  // base's full depth, so its front/back edges coincide with the base rectangle (not redrawn). The
  // mounting holes (axis Y, normal to this plane) are VISIBLE circles. v = world Z direct (no
  // flip), matching the old projTop convention.
  strokeView(topC, '--color-hp-line', (px, py) => {
    ctx.rect(px(-hL), py(-hD), 2 * hL * s, 2 * hD * s); // base outer rectangle
    ctx.moveTo(px(-hB), py(-hD)); ctx.lineTo(px(-hB), py(hD)); // left body longitudinal
    ctx.moveTo(px(hB), py(-hD)); ctx.lineTo(px(hB), py(hD));   // right body longitudinal
    for (const mx of mX) { ctx.moveTo(px(mx + mR), py(0)); ctx.arc(px(mx), py(0), mR * s, 0, Math.PI * 2); }
  });
  // Hidden: the bore (axis Z is in-plane here) as its rim walls.
  strokeHidden(topC, '--color-hp-line', (px, py) => {
    ctx.moveTo(px(-boreR), py(-hD)); ctx.lineTo(px(-boreR), py(hD));
    ctx.moveTo(px(boreR), py(-hD)); ctx.lineTo(px(boreR), py(hD));
  });

  // Side view (PP): ONE seamless outer rectangle from foot bottom to dome top. Base, body and dome
  // all share the full block depth, so their union is a single profile with no interior edge —
  // matches castProjectors' ppView. PLUS the base-shelf's top edge: the base sticks out laterally
  // past the narrower body, so its top face forms a real physical corner across the full depth.
  // u = world Z direct (no flip), v = −world Y (matching Front's own v convention, so Side's
  // height band lines up exactly with Front's — ADR-108 restores ADR-044; Side is beside Front
  // now, not beside Top, so it reads depth-horizontal/height-vertical, the old view rotated).
  strokeView(sideC, '--color-pp-line', (px, py) => {
    ctx.rect(px(-hD), py(-domeTop), 2 * hD * s, (domeTop - bBot) * s);
    ctx.moveTo(px(-hD), py(-bTop)); ctx.lineTo(px(hD), py(-bTop)); // base-shelf top edge
  });
  // Hidden: both holes' axes run in-plane here — the bore's rim walls + the mounting holes' rims.
  strokeHidden(sideC, '--color-pp-line', (px, py) => {
    ctx.moveTo(px(-hD), py(-(axis - boreR))); ctx.lineTo(px(hD), py(-(axis - boreR)));
    ctx.moveTo(px(-hD), py(-(axis + boreR))); ctx.lineTo(px(hD), py(-(axis + boreR)));
    ctx.moveTo(px(-mR), py(-bBot)); ctx.lineTo(px(-mR), py(-bTop));
    ctx.moveTo(px(mR), py(-bBot)); ctx.lineTo(px(mR), py(-bTop));
  });

  // View captions (quiet mono, ink-secondary) below each view — names the three orthographic views.
  ctx.save();
  ctx.fillStyle = cssVar('--color-ink-secondary');
  ctx.font = '11px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('FRONT', toX(frontC.x), toY(frontC.y + hy) + 6);
  ctx.fillText('TOP', toX(topC.x), toY(topC.y + hz) + 6);
  ctx.fillText('SIDE', toX(sideC.x), toY(sideC.y + hy) + 6);
  ctx.restore();
}

/** Enter the 50/50 workbench split. Left pane = live 3D #sim-viewport, right = the 2D sheet. */
function enterCompareSplit() {
  if (!compareCard || document.body.classList.contains('compare-split')) return;
  // Re-parent the card to <body> so it becomes a direct grid child and lands in the "compare"
  // grid-area (right pane). In the markup it lives inside #sim-viewport for the compact floating
  // card; grid-area only binds when it is a child of the body grid container (ADR-037).
  document.body.appendChild(compareCard);
  compareCard.hidden = false;
  compareCard.dataset.size = 'expanded';
  document.body.classList.add('compare-split');
  // #sim-viewport IS the left grid pane now, so resizing to it halves the renderer with zero JS
  // sizing change (ADR-037). Next frame, once the grid has laid out.
  requestAnimationFrame(() => {
    handleResize(viewport);
    paintCompare();
  });
  announce('Compare workbench open — 3D view left, 2D drawing right.');
}

/** Exit the split back to the single 3D viewport (the guided-stepper wizard returns). */
function exitCompareSplit() {
  if (!compareCard) return;
  document.body.classList.remove('compare-split');
  compareCard.hidden = true;
  compareCard.dataset.size = 'compact';
  // Restore the card into #sim-viewport so the compact floating card positions against it again.
  viewport.appendChild(compareCard);
  requestAnimationFrame(() => handleResize(viewport));
  announce('Compare workbench closed.');
}

/** Wire the card's own controls + keep the placeholder crisp as the split pane resizes. */
function setupCompareWorkbench() {
  compareCard = document.getElementById('compare-card');
  compareCanvas = document.getElementById('compare-canvas');
  document.getElementById('compare-close')?.addEventListener('click', exitCompareSplit);
  document.getElementById('compare-expand')?.addEventListener('click', enterCompareSplit);
  const stage = compareCard?.querySelector('.compare-card__stage');
  if (stage) {
    new ResizeObserver(() => {
      if (document.body.classList.contains('compare-split')) paintCompare();
    }).observe(stage);
  }
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
 * The platform calls pause() when overlays/whiteboard open and resume() on close. reset() restores
 * defaults and routes through rebuild() — the one reset path the in-sim Reset must also use
 * (CLAUDE.md: no second reset path).
 */
window.simAPI = {
  pause() { stopLoop(); },
  resume() { startLoop(); },
  reset() {
    cancelTweens();
    observerTween = null;
    foldTween = null;
    planeRevealTween = null;
    observerView = 'front';
    observerDir.copy(VIEW_DIR.front);
    isUnfolded = false;          // reset restores the 3D box (folded up)
    currentFoldF = 0;
    planeRevealF = 0;
    currentStep = 1;             // reset restores Step 1 (the object alone)
    currentFrameStep = 0;        // force the Step-1 tight re-frame even if we were already on Step 1
    resetCamera();
    rebuild(defaultShapeData()); // restore the default Glass Box scene — runs the disposal contract
    clearStepViewButtons();      // Step 3 back to the neutral invite state (no view latched)
    syncUnfoldBtn();             // rail toggle back to "Unfold"
    stepper?.reset();            // wizard back to Step 1
    announce('Simulation reset.');
  },
};

// ============================================================================
// UI controller — the narrow surface the leaf modules depend on. State + the
// rebuild pipeline stay owned here; controls read through getters and write
// through commit/reset, so the layering rule holds (leaves import no other layer).
// Extend this with your own domain methods as you build controls.
// ============================================================================

const simController = {
  /** Current on-screen state (null on the empty start). */
  state: () => currentShapeData,

  /** Whether anything is currently on screen (false on the empty start). */
  hasSolid: () => currentShapeData !== null,

  /** Merge params into state and rebuild — the single write path for your controls. */
  commit(partial) { rebuild({ ...(currentShapeData ?? {}), ...partial }); },

  /** Route through the single reset path (re-syncs the wizard + announces). */
  reset() { window.simAPI.reset(); },

  announce,
  flowNote,
  showToast,

  /** Flash an ad-hoc contextual chip over the viewport (the onboarding cue system). */
  cueHint(text) { onboarding?.cue?.(text, 'ink'); },

  /** Register a callback fired at the end of every rebuild(). Returns an unsubscribe fn. */
  onStateChange(cb) { stateChangeSubs.add(cb); return () => stateChangeSubs.delete(cb); },

  /** stepper.js's single hook back into the domain layer: fired on every step transition (Next /
   *  Back / rail jump) with the new step number. renderStep() owns all per-layer visibility. */
  onStepChange(n) { renderStep(n); },
};

// ============================================================================
// Self-start (CLAUDE.md: sim runs on page load; no external init() call).
// ============================================================================

function init() {
  const container = document.getElementById('sim-viewport');
  viewport = container; // module-wide handle for live resize

  // The one operation that can hard-fail is WebGL context creation (hardware acceleration off,
  // GPU blocklisted, ancient browser). Catch it, surface the on-brand WebGL fallback instead of a
  // blank iframe, and bail cleanly.
  try {
    buildScene(container);
  } catch (err) {
    console.error('Simatrix sim: WebGL initialisation failed.', err);
    window.__showSimFallback?.('webgl');
    return;
  }

  // Chrome + control wiring. Wrapped too so an unexpected wiring failure shows the generic
  // fallback rather than half-booting into a confusing partial UI.
  try {
    setupMobileNotice();
    setupResetControl();
    setupWizardToggle();
    setupCompareWorkbench();
    setupWorkbenchRail();
    stepper = initStepper(simController);
    initTerms();                           // wire inline term-definition popovers (static markup)
    onboarding = initOnboarding(controls); // first-run hints (empty-state overlay was removed)

    setupStepViewButtons(); // Step 3's Front/Top/Side buttons (wizard panel, not the viewport)

    new ResizeObserver(() => handleResize(container)).observe(container);

    // Start the loop, then build the Glass Box domain scene (transparent box + central solid +
    // projectors + the orbiting Observer). rebuild() is the single geometry path (CLAUDE.md).
    startLoop();
    rebuild(defaultShapeData());

    // Open the 50/50 Compare workbench on boot (desktop only; mobile keeps the on-demand bottom
    // sheet): live 3D glass box left, the first-angle 2D multiview (drawCompare) right.
    if (BOOT_INTO_COMPARE_SPLIT && window.matchMedia('(min-width: 768px)').matches) {
      enterCompareSplit();
    }
  } catch (err) {
    console.error('Simatrix sim: initialisation failed.', err);
    window.__showSimFallback?.();
    return;
  }

  // Tell the watchdog the sim is live (clears its timer, hides any slow-load fallback). Last, so it
  // only fires on a fully successful boot.
  markBooted();
}

init();
