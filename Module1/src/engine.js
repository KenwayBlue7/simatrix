// engine.js — Module 1 SHARED 3D + STEPPER ENGINE (single source of truth).
//
// The generic machinery lifted from main.js (the Points orchestrator, which is
// near-identical to lines.js). A lesson page becomes thin: it imports this engine,
// supplies its pure data layer + draw functions, and calls initSim(config). Every
// lesson then borrows one copy of the renderer stacks, JS-owned canvas sizing, the
// guided stepper, term popovers, the geometry/label toolkit, the reversible fold,
// and the window.simAPI platform contract — so the shells can no longer drift.
//
// ── initSim(config) contract ───────────────────────────────────────────────
//   mode        : 'single' | 'dual'     single = one 3D stack, full-bleed (intro
//                                       lessons); dual = 3D + 2D PiP + toggle bar
//                                       (Points / Lines — unchanged behaviour).
//   steps, terms: pure data (src/<lesson>Steps.js)
//   defaultData : () => freshDataObject (e.g. defaultPointData)
//   resolve     : (data) => model       lesson-shaped resolved geometry; the engine
//                                        passes it straight to the draw functions
//   defaultView : {flag:false,…}        per-lesson view-flag defaults (DEFV)
//   draw3D(g,ctx)                        required. ctx = {model, raw, view, COL}
//   draw2D(g,ctx)                        dual mode only
//   buildAnimScene() => { apply(p) }     fold lessons; apply maps progress p∈[0,1]
//                                        onto the scene (uses exported foldStateAt)
//   afterRebuild(data,ctx)               optional (e.g. Points' quadrant highlight +
//                                        slider sync)
//   describe(data,view) => string        optional SR mirror of the viewport result
//   wireControls(api)                    optional; lesson wires its own sliders /
//                                        number fields / selects. api = { rebuild,
//                                        getData, setRange, setNote, announce }
//   chap                                 marks the active .chapnav tab (CSS/HTML only)
//   cam3, cam2                           optional default-camera overrides
//   foldBtn                              id of the fold button (e.g. 'btn-anim')
//   foldLabels  : {idle,refold,forward,reverse}
//   foldGuard(view) => bool              optional; abort a fold when false
//   foldAnnounce: {forward,reverse,forwardReduced,reverseReduced}
//
// Exports initSim + the reusable helper toolkit + a live COL token map, so a thin
// lesson file can: import { initSim, asg, alb, COL, LW } from './src/engine.js'.
//
// Platform constraints (unchanged): no build step, CDN ES modules pinned to
// three@0.160.0, .js extensions, all-relative paths, tokens read from CSS (never
// hard-coded hex). See CLAUDE.md.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { tick, cancelAll, tween, easeDraw, easeCamera, easeFold, easeStandard } from './anim.js';
import { injectChrome, injectCardChrome, injectLibraryChrome } from './chrome.js';
import { initOnboarding } from './onboarding.js';
import { initProblemLibrary } from './problemLibrary.js';

const CM = 10;
export const toW = cm => cm / CM;                 // cm → world units (50 cm = 5 wu)
const CAM3 = { p:new THREE.Vector3(9,7,9),  t:new THREE.Vector3(0,0,0) };
const CAM2 = { p:new THREE.Vector3(0,0,18), t:new THREE.Vector3(0,0,0) };

// Canonical quick-view camera poses (3D world axes: HP=XZ y=0, VP=XY z=0). The `front`
// pose is reused as the cinematic fold's square-on target, so the fold and the "Front" chip
// land the learner in the same place. Distances frame the ~9-unit reference planes; a lesson
// with a larger sheet overrides these per-key via cfg.qv (see QVL below).
const QV = {
  top:   { p:new THREE.Vector3(0,15,0.001), t:new THREE.Vector3(0,0,0) },
  front: { p:new THREE.Vector3(0,0,15),     t:new THREE.Vector3(0,0,0) },
  side:  { p:new THREE.Vector3(15,0,0),     t:new THREE.Vector3(0,0,0) },
};
// Live quick-view poses. Defaults to QV; a lesson with a larger reference sheet (e.g. Lines)
// overrides per-key via cfg.qv so the chips + the cinematic fold frame the bigger sheet.
// The fold's square-on target is always QVL.front, so the fold and the "Front" chip agree.
// Assigned in initSim from cfg.qv.
let QVL = QV;

// ── Module-2 camera orchestrator (ported) ─────────────────────
// A second, ORTHOGRAPHIC camera lives on the main stack S3 alongside its perspective camera.
// actCam/actCtrl point at whichever pair is live; the quick-views + the folded sheet switch to
// the ortho pair (so the 2D drawing is a true orthographic projection, not a perspective one),
// and projMorphK blends the two projection matrices each frame so the swap animates rather than
// cutting. All of this is GATED on cfg.orthoViews — the five intro lessons never opt in, so they
// keep a single perspective camera with zero added cost. See DESIGN.md / CLAUDE.md.
const ORTHO_FRUSTUM = 12;    // reference ortho frustum half-height (world units); per-view zoom adapts
const ORTHO_STANDOFF = 90;   // ortho camera distance along the view dir (depth-only — just clears near/far)
const FRAME_PADDING = 1.06;  // perspective auto-zoom + default-pose fit margin (snug — the subject nearly fills the frame)
const FIT_PADDING = 1.12;    // ortho quick-view / fold fit margin (kept looser so flat-sheet labels never clip)
const AUTO_ZOOM_MS = 500;    // clip-aware auto-dolly duration (ms): a one-shot eased tween (easeStandard
                             // ease-out, the tween() default) per rebuild, restarted from the camera's
                             // CURRENT distance so a continuous slider drag tracks smoothly without an
                             // end-of-drag jump. Push-back only. (Verbatim Module 2.)
// Quick-view directions + screen-ups in M1 world axes (HP=XZ y=0, VP=XY z=0): top looks down +Y,
// front looks along +Z (head-on at the VP), side looks along +X. Used to place + roll the ortho cam.
const QV_DIR = {
  top:   { dir:new THREE.Vector3(0,1,0), up:new THREE.Vector3(0,0,-1) },
  front: { dir:new THREE.Vector3(0,0,1), up:new THREE.Vector3(0,1,0) },
  side:  { dir:new THREE.Vector3(1,0,0), up:new THREE.Vector3(0,1,0) },
};
// M1's folded sheet is VERTICAL (the z=0 plane) and read FRONT-ON, so the flattened 2D pans keep a
// front-on framing (dir +Z, up +Y) — unlike Module 2's top-down answer sheet on the floor.
const FLAT_VIEW_UP = new THREE.Vector3(0,1,0);

const CARD_R = 10;   // Compare-card corner radius (mirrors --radius-md) for the clipped S2 label overlay
const CARD_Z = 91;   // #c2d floats just above the Compare-card frame (--z-compare: 90)

// Colours are read from the live CSS tokens (never hard-coded) — see readTokens().
// Exported as a live binding so lesson draw functions may import { COL } directly;
// the engine also passes it on ctx.
export let COL = {};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const MOBILE_Q = matchMedia('(max-width: 768px)');   // mirrors the CSS stacking breakpoint

// ── Per-page configuration + live state ───────────────────────
let cfg = null, cam3 = CAM3, cam2 = CAM2;
let data = null;
let S3 = {}, S2 = {}, rafId = null;
let onboarding = null;   // first-run viewport aids (orbit hint + spotlights) — initOnboarding()
let step = 0, maxReached = 0, animating = false;
// reflowEdit === true only for the brief window of a value-edit rebuild (editRebuild()).
// While set, the viewport renders the UNION of every reached step's view flags instead of the
// strict per-step view, so editing an early step never wipes the downstream geometry it built.
let reflowEdit = false;
// folded === true once the sheet is laid flat (frozen 2D). The fold button then
// reverses the fold back into 3D — see runAnimation()/animateFold().
let folded = false;
// ── Compare View (dual mode) ──────────────────────────────────
// The main pane is ALWAYS S3 (#c3d); the second stack S2 (#c2d) is shown ON DEMAND in a
// floating Compare card instead of a persistent PiP. compareOpen gates whether S2 is sized
// / rendered; s2Is3D picks its content (false = the 2D drawing; true = a live-rebuilt 3D
// view, used when the main sheet is folded flat). compareSize is the card's compact/expanded
// state. compareCard / compareStage are looked up after injectChrome (boot → wire).
let compareOpen = false, compareSize = 'compact', s2Is3D = false;
let compareCard = null, compareStage = null;
// Viewport connector toggle (Points): draw fns hide their dashed projectors / foot
// connectors when false. Default true → no visual change until the chip is pressed.
let showConnectors = true;
// Cinematic fold camera: the learner's pre-fold pose, stored on forward so reverse can
// tween back to it. camTween holds an in-flight quick-view tween (cancelled on a new view
// or when a fold starts) so two camera moves never fight. autoZoomTween holds the in-flight
// clip-aware auto-dolly (push-back only; cancelled on any deliberate camera takeover).
let preFoldPose = null, camTween = null, autoZoomTween = null;
// Auto-frame mode for the next rebuild (cfg.autoFrame lessons). true at boot + after a reset →
// the rebuild does a fresh tight fit (frameDefault) instead of the push-back reframe, so the
// snug default pose is the authoritative last word and no reframe tween can clobber it (Module 2's
// onSolidAppear() wasEmpty/else split). Cleared after the first fit; every later edit reframes.
let freshFrame = true;
// Dual-camera + projection morph (cfg.orthoViews lessons only). actCam/actCtrl are the live
// camera+controls pair (perspective by default; the ortho pair while a quick-view / the folded
// sheet is showing). projMorphK ∈ [0,1] or null: when set, loop() blends the ortho projection
// matrix toward the perspective one each frame (0 = pure ortho, 1 = pure perspective). activeView
// latches the lit quick-view ('top'|'front'|'side'|null).
let actCam = null, actCtrl = null, projMorphK = null, activeView = null;
// Motion plumbing: lastFrame feeds the per-frame deltaMs into tick(); drawOn holds the
// in-flight projection draw-on tween (so a new rebuild can cancel it before its materials
// are disposed); drawOnNext arms a draw-on for the NEXT rebuild (set only by step nav).
let lastFrame = null, drawOn = null, drawOnNext = false;
// One-shot tween that sweeps the Compare card's angle arcs when it OPENS (the 2D "reveal").
// Cancelled on any S2 re-fill (refillCompare / beginOverlay) so it never touches disposed
// geometry, and so in-card rebuilds render the arcs at full (no re-sweep).
let compareSweep = null;
// Inc5 feedback/resilience: the success-toast DOM handle + timers, and the armed-state of
// the inline two-state Reset confirm. The toast is setTimeout-driven (not the rAF tween) so
// it still fades while the loop is paused (e.g. the Problem Library, Inc6).
let toastEl = null, toastTimer = null, toastHideTimer = null;
let resetArmed = false;
// Inc6 Problem Library: a state-change bus fired at the end of every rebuild() (the one seam
// every parameter / step change passes through), so the library's self-check sees each change.
// problemLib holds the controller handle for lessons that ship cfg.problems; intro lessons skip
// the whole feature (the bus stays empty, zero cost).
const stateChangeSubs = new Set();
let problemLib = null;

// Fat-line (Line2) plumbing: every Line2 needs its LineMaterial.resolution kept in
// sync with the pixel size of the canvas it is drawn on. fill()/the fold builder set
// curMats to the active scene's material list so helpers register; layout() refreshes
// every material's resolution on resize / view swap.
let curMats = null;
const curRes = new THREE.Vector2(1, 1);
// Arc-sweep plumbing (a sibling of curMats): a draw fn may register sweeper callbacks
// fn(t∈[0,1]) via addSweep() — each redraws a partial arc (the angle marks θ/φ/α/β). They
// are collected per-fill into the active stack's .sweeps, then driven 0→1 by the step-reveal
// draw-on (startDrawOn) and the Compare-open sweep. When no reveal runs (e.g. a slider drag),
// the sweepers are never called, so the arc renders at the full geometry it was built with.
let curSweeps = null;

const $ = id => document.getElementById(id);
const area=$('canvas-area'), c3=$('c3d'), c2=$('c2d');
const live=$('live'), termPop=$('term-pop');

// ── View flags per step (what the viewport renders) ───────────
const viewFor = i => ({ ...(cfg.defaultView || {}), ...(cfg.steps[i]?.view || {}) });

// Non-destructive reflow view: the UNION of every reached step's view flags (steps 0..maxReached).
// Step views are cumulative supersets, so merging them = "everything revealed so far" — used only
// while reflowEdit is set (an active value edit), so editing an early step refills its downstream
// projections instead of reverting to that step's lean view. Plain navigation keeps viewFor(step).
function reflowView(){
  const v = { ...(cfg.defaultView || {}) };
  for (let i = 0; i <= maxReached; i++) Object.assign(v, cfg.steps[i]?.view || {});
  return v;
}

// Build the draw context for the current data + step. `connectors` rides on the view so
// the draw functions can honour the viewport connector toggle (default true → unchanged).
function buildCtx(){
  const view = reflowEdit ? reflowView() : viewFor(step);
  view.connectors = showConnectors;
  view.folded = folded;                 // so a step's done() predicate can read the fold state
  const model = cfg.resolve ? cfg.resolve(data) : data;
  return { model, raw:data, view, COL };
}

// ── Read design tokens from CSS custom properties ─────────────
// Base token set every lesson needs; config.tokens adds any lesson extras (the
// Lines sim, for instance, also reads construct / locus / tl-green).
function readTokens(){
  const cs = getComputedStyle(document.documentElement);
  const t = n => cs.getPropertyValue(n).trim();
  COL = {
    paper:t('--color-paper'), ink:t('--color-ink'), ink2:t('--color-ink-secondary'), bench:t('--color-bench-grey'),
    border:t('--color-border'), hp:t('--color-hp-line'), vp:t('--color-vp-line'), accent:t('--color-accent'),
  };
  if(cfg && cfg.tokens){
    for(const [k,v] of Object.entries(cfg.tokens)) COL[k] = t(v);
  }
}

// ── Build a renderer stack ────────────────────────────────────
function build(canvas, is3D){
  const scene=new THREE.Scene(); scene.background=new THREE.Color(COL.paper);
  const cam=new THREE.PerspectiveCamera(45,1,0.1,200);
  const pr=is3D?cam3:cam2; cam.position.copy(pr.p);
  const rend=new THREE.WebGLRenderer({canvas,antialias:true});
  rend.setPixelRatio(Math.min(devicePixelRatio,2));
  scene.add(new THREE.AmbientLight(0xffffff,.9));
  const dl=new THREE.DirectionalLight(0xffffff,.5); dl.position.set(6,10,8); scene.add(dl);
  // No AxesHelper: its red/green/blue is off-palette and puts blue inside the
  // viewport (violates the Chrome-Only Blue rule). The labelled planes + fold
  // line + quadrant labels carry orientation instead.
  const ctrl=new OrbitControls(cam,canvas);
  ctrl.target.copy(pr.t); ctrl.enableDamping=true; ctrl.dampingFactor=0.08;
  ctrl.enableRotate=is3D; ctrl.update();
  // Per-scene CSS2DRenderer overlay: text labels (alb/albBox) are live DOM nodes
  // (CSS2DObject) re-projected every frame — vector-sharp at any zoom, constant on-
  // screen size, screen-reader readable. The overlay sits over this scene's canvas in
  // #canvas-area; pointer-events:none lets orbit-drag / PiP-click pass through to the
  // canvas beneath. layout() sizes + positions it to match the canvas (full-bleed or PiP).
  const lr=new CSS2DRenderer();
  lr.domElement.style.cssText='position:absolute;top:0;left:0;pointer-events:none;';
  area.appendChild(lr.domElement);
  const grp=new THREE.Group(); scene.add(grp);
  return {scene,cam,rend,ctrl,grp,lineMats:[],sweeps:[],lr};
}

// Attach an ORTHOGRAPHIC camera + its own OrbitControls to a stack (only S3, only for
// cfg.orthoViews lessons). The frustum is seeded square (aspect fixed in layout()); per-view
// camera.zoom drives the actual framing. Its controls share the canvas with the perspective
// controls and stay disabled until an ortho view is live, so only one set consumes pointer
// events at a time (Module 2's hybrid-camera pattern). The perspective cam keeps the orbit pose.
function attachOrtho(s, canvas){
  const oCam=new THREE.OrthographicCamera(-ORTHO_FRUSTUM,ORTHO_FRUSTUM,ORTHO_FRUSTUM,-ORTHO_FRUSTUM,0.1,200);
  oCam.position.copy(s.cam.position); oCam.up.copy(s.cam.up);
  const oCtrl=new OrbitControls(oCam,canvas);
  oCtrl.target.copy(s.ctrl.target); oCtrl.enableDamping=true; oCtrl.dampingFactor=0.08; oCtrl.enabled=false;
  // ORBIT is locked on the ortho pair: a 2D orthographic read (Top/Front/Side or the flattened
  // sheet pan) is square-on by definition — rotating it would shear the flat layout with no depth
  // cue to anchor it. Pan + zoom stay live for inspecting the drawing. A left-drag attempt instead
  // nudges the latched quick-view chip (cueOrthoLock) to cue "leave this view to orbit".
  oCtrl.enableRotate=false;
  s.oCam=oCam; s.oCtrl=oCtrl;
}

// Pixel size (CSS px) of each stack's canvas. Re-keyed by STACK identity (not a 3D/2D
// flag) now that the main pane is always S3 and S2 lives in the Compare card: S3 is always
// full-bleed over #canvas-area; S2 matches the Compare-card stage when open. LineMaterial.
// resolution must match this for correct on-screen line thickness.
// Both Points and Lines opt into a docked 50/50 split for the EXPANDED Compare card
// (cfg.compareSplit): the 3D pane shrinks to the left half and the card docks to the right
// half, instead of the default centered overlay. Gated off on mobile (the card is a bottom
// sheet there) and only while the card is open + expanded. On Lines (cfg.workbenchControls)
// the split additionally enters WORKBENCH mode — the wizard collapses for a true 50/50 and the
// geometry-driver controls re-parent into the docked #workbench-rail under both panes.
function isSplit(){
  return !!cfg.compareSplit && cfg.mode==='dual' && compareOpen
         && compareSize==='expanded' && !MOBILE_Q.matches;
}
function s3Px(){
  const w = isSplit() ? Math.round((area.clientWidth||1)/2) : (area.clientWidth||1);
  return [w, area.clientHeight||1];
}
function s2Px(){
  if(compareStage && compareOpen){
    const r=compareStage.getBoundingClientRect();
    return [Math.max(1,Math.round(r.width)), Math.max(1,Math.round(r.height))];
  }
  return [area.clientWidth||1, area.clientHeight||1];   // closed: value unused (S2 not rendered)
}
function updateLineRes(){
  const a=s3Px();
  S3.lineMats?.forEach(m=>m.resolution.set(a[0],a[1]));
  if(cfg.mode==='dual' && compareOpen){ const b=s2Px(); S2.lineMats?.forEach(m=>m.resolution.set(b[0],b[1])); }
}

// Size + position a stack's CSS2D label overlay to match its canvas rect. Mirrors the
// canvas placement exactly (full-bleed main pane, or the Compare-card stage). The overlay
// stays click-through; clip:true gives the card its rounded mask so labels can't spill.
// fixed:true positions it relative to the viewport (the Compare overlay escapes
// #canvas-area's overflow clip — DESIGN.md forbids transforms on the ancestors, so fixed
// placement is reliable).
function placeLr(lr,left,top,w,h,z,clip,fixed){
  lr.setSize(w,h);                                  // sets domElement width/height (px)
  const s=lr.domElement.style;
  s.position=fixed?'fixed':'absolute'; s.left=`${left}px`; s.top=`${top}px`; s.zIndex=String(z);
  s.pointerEvents='none'; s.display='';
  s.overflow=clip?'hidden':'visible';
  s.borderRadius=clip?`${CARD_R}px`:'0';
}

// ── Layout (JS owns canvas pixel sizes) ───────────────────────
function layout(){
  const W=area.clientWidth, H=area.clientHeight;
  if(!W||!H) return;
  updateLineRes();

  // S3 main pane — full-bleed normally; the LEFT HALF when the Compare card is split right
  // (Points only, via cfg.compareSplit). The label overlay clips to the same box when split.
  const split=isSplit(), s3w=split?Math.round(W/2):W;
  // Width/height in the CSS box are set HERE, not by setSize(): setSize(...,false) below leaves
  // the canvas STYLE untouched (JS owns canvas sizing). Without an explicit CSS size the canvas
  // would lay out at its DPR-scaled backing-store size and the over-large slice gets upscaled by
  // #canvas-area's overflow:hidden → a blurry, low-res-looking viewport on any DPR>1 display.
  c3.style.cssText=`left:0;top:0;width:${s3w}px;height:${H}px;z-index:1;cursor:default;position:absolute;display:block;`;
  S3.rend.setSize(s3w,H,false); S3.cam.aspect=s3w/H; S3.cam.updateProjectionMatrix();
  // Keep the ortho camera's frustum at the viewport aspect (its right/top ratio == aspect, which
  // fitOrthoZoom relies on); per-view zoom does the framing. Only present on orthoViews lessons.
  if(S3.oCam){ const a=s3w/H; S3.oCam.left=-ORTHO_FRUSTUM*a; S3.oCam.right=ORTHO_FRUSTUM*a; S3.oCam.top=ORTHO_FRUSTUM; S3.oCam.bottom=-ORTHO_FRUSTUM; if(projMorphK===null) S3.oCam.updateProjectionMatrix(); }
  placeLr(S3.lr,0,0,s3w,H,2,split,false);

  if(cfg.mode==='single') return;

  // Dock the expanded card to the right half when split (CSS .is-split); cleared otherwise.
  if(compareCard) compareCard.classList.toggle('is-split', split);

  // S2 — only sized / painted when the Compare card is open; the canvas floats position:
  // fixed over the card stage (escaping #canvas-area's overflow:hidden). Closed → hidden.
  if(!compareOpen || !compareStage){
    c2.style.display='none';
    if(S2.lr) S2.lr.domElement.style.display='none';
    return;
  }
  const r=compareStage.getBoundingClientRect();
  const cw=Math.max(1,Math.round(r.width)), ch=Math.max(1,Math.round(r.height));
  c2.style.cssText=`left:${r.left}px;top:${r.top}px;width:${cw}px;height:${ch}px;z-index:${CARD_Z};cursor:default;position:fixed;display:block;`;
  S2.rend.setSize(cw,ch,false); S2.cam.aspect=cw/ch; S2.cam.updateProjectionMatrix();
  placeLr(S2.lr,r.left,r.top,cw,ch,CARD_Z+1,true,true);   // card labels above the card canvas, clipped + fixed
}

function loop(now){
  rafId=requestAnimationFrame(loop);
  // Advance active tweens by the elapsed frame time. Clamped to 100ms so a throttled
  // background tab can't snap a tween straight to its end; delta=0 on the first frame
  // (and the first frame after resume) so a paused tween continues instead of jumping.
  const delta=(now!=null && lastFrame!=null) ? Math.min(now-lastFrame,100) : 0;
  lastFrame = now ?? null;
  tick(delta);
  if(!animating){ actCtrl.update(); }                    // damping on whichever camera is live
  // Perspective↔ortho projection morph (cfg.orthoViews): stamped AFTER tick()/controls.update()
  // and any tween's own updateProjectionMatrix(), so the blended matrix is the last word before
  // render (see restorePerspective / engageOrtho). No-op (null) for single-perspective lessons.
  if(projMorphK!==null) applyProjectionMorph();
  S3.rend.render(S3.scene,actCam);
  S3.lr.render(S3.scene,actCam);                         // DOM label overlay on top of S3
  // Render the Compare stack only while the card is open (saves the second draw otherwise).
  if(cfg.mode==='dual' && compareOpen){ S2.ctrl.update(); S2.rend.render(S2.scene,S2.cam); S2.lr.render(S2.scene,S2.cam); }
}

// ── Rebuild the scene(s) for the current data + step view ─────
function rebuild(d){
  data=d;
  if(animating) return;
  // A lesson may keep its own overlay drawn into the secondary scene (e.g. the Lines
  // Traces / True-Length constructions). Let it tear that down BEFORE we repaint, so a
  // slider / step / reset never strands stale overlay geometry over the live drawing.
  cfg.beforeRebuild && cfg.beforeRebuild(d);
  // A normal rebuild always redraws the live, interactive 3D scene, so we are no
  // longer showing a flattened sheet — clear the fold state, reset the button + fa-symbol.
  // If we are leaving a folded sheet by some path OTHER than the reverse fold (e.g. Next /
  // a slider edit while folded), restore the learner's pre-fold orbit pose so the camera
  // doesn't strand at the square-on front angle. (The reverse fold clears preFoldPose first,
  // so this is a no-op for it.)
  if(folded){
    folded=false; resetFold();
    // orthoViews: the folded sheet was shown by the ORTHO camera — hand back to perspective first,
    // then restore the learner's pre-fold orbit. Legacy lessons just restore the perspective pose.
    if(cfg.orthoViews) restorePerspective(false);
    if(preFoldPose) snapCameraHome();
  }
  setFaSymbol(false);
  // Live 3D main ⇒ the Compare card shows the 2D drawing (the 3D content mode is only
  // entered when the sheet is folded flat — see compare.show / animateFold).
  s2Is3D=false;
  // Cancel any in-flight draw-on before fill() disposes the LineMaterials it animates.
  drawOn?.cancel(); drawOn=null;
  const ctx=buildCtx();
  fill(S3,true,ctx);
  declutterChipLabels(ctx.model);                            // nudge vertex/point chips clear of the linework (opt-in)
  if(cfg.mode==='dual' && compareOpen) refillCompare(ctx);   // keep the open card in sync (2D)
  // Draw-on only when armed by step navigation (Next/Back/rail). Slider drags reach
  // rebuild() without arming drawOnNext, so they repaint instantly.
  if(drawOnNext) startDrawOn();
  drawOnNext=false;
  cfg.afterRebuild && cfg.afterRebuild(d,ctx);
  syncCompareChipVisibility(ctx.view);
  updateCompareChip();
  updateDoneBadge();          // folded is cleared above, so a normal rebuild also clears the badge
  // Auto-frame: a rebuild does EITHER a fresh tight fit (boot/reset) OR the push-back reframe —
  // never both, so the snug default pose is never clobbered by a competing reframe tween (the bug
  // that left boot at the far cam3.p distance). Mirrors Module 2's onSolidAppear() wasEmpty/else.
  if(cfg.autoFrame){
    if(freshFrame){ frameDefault(); freshFrame=false; }
    else reframeIfClipped();             // clip-aware auto-zoom: dolly back if the geometry grew
  }
  announceState(d,ctx.view);
  notifyStateChange(d,ctx);   // Inc6: drive the Problem Library self-check off this single seam
}

// ── Value-edit seam (the sims route slider / field / select edits through this) ───
// Two non-destructive safeguards in one place, ported from Module 2:
//  1) Reflow — render the UNION view (reflowEdit) so editing an early step refills its downstream
//     geometry live instead of wiping it (the plain rebuild keeps the strict per-step view, so
//     Back / Next navigation still discloses one idea per step).
//  2) Flatten-edit — rebuild() already snaps a folded sheet back to 3D; if we WERE folded, surface
//     a visible note (+ SR announce) so the auto-unfold isn't a silent jump. Kept as the instant
//     snap, NOT the 2.8s reverse fold, because a slider drag fires many edits per second.
function editRebuild(d){
  const wasFolded = folded;
  reflowEdit = true;
  rebuild(d);                 // no-ops while a fold tween is animating (folded not yet cleared)
  reflowEdit = false;
  if(wasFolded && !folded){   // only when the rebuild actually unfolded the sheet
    const m = cfg.foldEditNote || 'Unfolded to 3D so you can see your change. Re-flatten when ready.';
    flowNote(m); announce(m);
  }
}

// ── Vertex/point label declutter (opt-in via cfg.declutterLabels) ─────────────────
// A small WORLD-space outward nudge (Module 2's vertexLabeler technique): push each chip label
// (.lbl--chip — P/p/p′, A/B/a/b…) away from the meaningful-geometry centre so a name centred on a
// vertex no longer sits on the thick edges meeting there. Applied once per rebuild on S3 only (the
// main 3D pane), so it never touches the fold build (a different path) — no first-frame "jump".
function declutterChipLabels(model){
  if(!cfg.declutterLabels || !cfg.contentBox || !model) return;
  const box = cfg.contentBox(model);
  const c = box.getCenter(new THREE.Vector3());
  const r = box.getBoundingSphere(new THREE.Sphere()).radius || 1;
  const off = Math.min(0.4, Math.max(0.12, r * 0.12));   // gentle; tuned by eye in the browser
  S3.grp.traverse(o=>{
    if(o.element?.classList?.contains('lbl--chip')){
      const dir = o.position.clone().sub(c);
      if(dir.lengthSq() > 1e-6) o.position.add(dir.normalize().multiplyScalar(off));
    }
  });
}

// Fire the state-change bus. A throwing subscriber must never break a rebuild, so each is
// guarded. Empty (and free) on intro lessons, which never wire a subscriber.
function notifyStateChange(d,ctx){ stateChangeSubs.forEach(cb=>{ try{ cb(d,ctx); }catch(e){ console.error(e); } }); }

// Draw-on: ramp the freshly-built S3 strokes 0→1 opacity (~0.8s, easeDraw) so newly
// revealed linework (e.g. the projectors) glides in on a step change instead of snapping.
// tick() drives it from loop(), so simAPI.pause() halts it; tween() self-snaps under
// reduced motion. S3.lineMats holds only fatLine LineMaterials (all transparent already),
// so the ramp is safe — CSS2D labels + plane fills aren't in the set and appear normally.
function startDrawOn(){
  if(animating) return;
  const mats=[...S3.lineMats], sweeps=[...S3.sweeps];
  if(!mats.length && !sweeps.length) return;
  drawOn=tween({ from:0, to:1, duration:800, ease:easeDraw,
    onUpdate:v=>{ for(const m of mats) m.opacity=v; for(const s of sweeps) s(v); },
    onComplete:()=>{ for(const s of sweeps) s(1); drawOn=null; } });   // settle arcs to full
}

// fill — repaint a stack. `use3D` ONLY chooses draw3D vs draw2D; the LineMaterial
// resolution comes from the stack's own canvas size (S3 full-bleed, S2 the Compare stage),
// so S2 can host live 3D content (folded state) at the card's pixel size without confusion.
function fill(s,use3D,ctx){
  const g=s.grp;
  g.traverse(o=>{if(o!==g){if(o.element?.parentNode)o.element.remove();o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=s.lineMats; curMats.length=0;
  curSweeps=s.sweeps; curSweeps.length=0;
  const [rw,rh]=(s===S3)?s3Px():s2Px(); curRes.set(rw,rh);
  use3D ? cfg.draw3D(g,ctx) : cfg.draw2D(g,ctx);
}

// ═══════════════════════════════════════════════════════════════
// FOLD ANIMATION — REVERSIBLE (the textbook rabatment, book about its spine).
//
// The generic timeline driver only. The scene itself (which group rotates, which
// cues fade, how the dynamic projectors track the moving foot) is lesson-specific
// and supplied by cfg.buildAnimScene(), which returns an apply(p) closure built on
// the exported foldStateAt(). Forward (unfold): hpGroup eases 0→+90° about the X
// hinge, then the 3D depth cues dissolve, leaving the flat sheet. Reverse evaluates
// the SAME timeline at (1 − t) — an exact mirror.
//
// CINEMATIC CAMERA (Inc4 — overturns the old "camera never moves" rule, see DESIGN.md):
// the timeline ALSO eases S3.cam from the learner's pose to square-on in front of the
// flat sheet (FRONT, easeCamera); the pre-fold pose is stored and restored on reverse;
// reduced motion snaps. The loop() skips S3.ctrl.update() while animating, so the fold
// owns the camera with no OrbitControls damping fight.
// ═══════════════════════════════════════════════════════════════
const FOLD_DURATION = 2800, FOLD_SPLIT = 0.72, FOLD_ANGLE = Math.PI/2;

// Forward state at normalised progress p ∈ [0,1]: HP rotation + the shared opacity
// of the fading depth cues. Reverse evaluates this at (1 − t), so the two directions
// are exact mirror images (same duration, easing, hinge).
export function foldStateAt(p){
  const foldT=Math.min(p/FOLD_SPLIT,1), ease=1-Math.pow(1-foldT,3);
  const op = p<=FOLD_SPLIT ? 1 : Math.max(0,1-(p-FOLD_SPLIT)/(1-FOLD_SPLIT));
  return { rot: FOLD_ANGLE*ease, op };
}

const foldLabels = () => cfg.foldLabels || {};
function resetFold(){ const b=$(cfg.foldBtn); if(b){ b.disabled=false; b.textContent=foldLabels().idle||''; } }

// First-angle symbol badge (#fa-symbol, injected chrome): fades in while the sheet is
// folded flat, on the lessons that opt in via cfg.ui.faSymbol (Points / Lines). No-op
// elsewhere. Forward fold reveals it; rebuild()/reverse hide it.
function setFaSymbol(on){
  const el=$('fa-symbol'); if(!el) return;
  if(on && cfg.ui?.faSymbol){ el.hidden=false; requestAnimationFrame(()=>el.classList.add('is-visible')); }
  else { el.classList.remove('is-visible'); }
}

// Cinematic fold camera (overturns the old "camera never moves" rule). On forward the
// learner's pose is stored and the camera eases square-on to the flat sheet (FRONT); on
// reverse it eases back. Reduced motion snaps instead of tweening (these two helpers).
function snapCameraToFront(){
  preFoldPose={ pos:S3.cam.position.clone(), tgt:S3.ctrl.target.clone() };
  S3.cam.position.copy(QVL.front.p); S3.ctrl.target.copy(QVL.front.t); S3.ctrl.update();
}
function snapCameraHome(){
  const h=preFoldPose||{ pos:cam3.p, tgt:cam3.t };
  S3.cam.position.copy(h.pos); S3.ctrl.target.copy(h.tgt); preFoldPose=null; S3.ctrl.update();
}
// Reduced-motion forward fold (orthoViews, ADR-036 ortho swoop): park the ORTHO camera square-on to
// the flattened answer sheet INSTANTLY (front-on along −Z at the VP, no projection morph — reduced
// motion suppresses the blend). The perspective camera is left untouched, so a later unfold hands
// straight back to its retained orbit pose (restorePerspective). The animated counterpart is the
// swoop in animateFoldSwoop; both mirror the Spatial-Framework / Module-2 master's swoopToAnswerSheet.
function snapFoldSwoop(){
  const box=flatBoxFor('all'), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
  const toZoom=fitOrthoZoom(size.x,size.y);              // front-on: world x horizontal, y vertical
  const dist=S3.cam.position.distanceTo(S3.ctrl.target);
  const toPos=center.clone().addScaledVector(QV_DIR.front.dir,dist);
  engageOrtho();                                          // reduced motion → projMorphK stays null (no morph)
  activeView=null; syncQuickViewChips();                  // the fold is not a Top/Front/Side chip
  S3.oCam.position.copy(toPos); S3.oCtrl.target.copy(center);
  S3.oCam.up.copy(FLAT_VIEW_UP); S3.oCam.zoom=toZoom; S3.oCam.updateProjectionMatrix(); S3.oCtrl.update();
}

function runAnimation(){
  if(animating) return;
  // Let the lesson exit any construction overlay before folding (matches the Lines
  // sim's runFold, which clears an open Traces / True-Length build first).
  cfg.beforeFold && cfg.beforeFold();
  if(cfg.foldGuard && !cfg.foldGuard(viewFor(step))) return;
  // The fold owns the camera — cancel any quick-view tween + auto-zoom, and close the Compare
  // card (it re-opens against the new fold state on demand).
  camTween?.cancel(); camTween=null;
  autoZoomTween?.cancel(); autoZoomTween=null;
  if(compareOpen) compare.hide();
  folded ? foldBack() : foldForward();
}
function foldForward(){
  // orthoViews lessons SWOOP square-on to the flattened answer sheet (ADR-036, OVERTURNS the old
  // held-angle hold): the camera ends on a TRUE orthographic view of the finished 2D drawing, the
  // projection morphing perspective→ortho as it lands. Held-angle perspective folds are forbidden.
  if(cfg.orthoViews){
    if(reduceMotion.matches){
      const { apply }=prepFoldScene(); apply(1);
      snapFoldSwoop();
      folded=true; const b=$(cfg.foldBtn); if(b) b.textContent=foldLabels().refold||'';
      setFaSymbol(true); updateCompareChip(); updateDoneBadge();
      announce(cfg.foldAnnounce?.forwardReduced || '');
      return;
    }
    animateFold(false); return;
  }
  // Legacy single-perspective fold (intro lessons): build the fold scene, freeze it flat (p=1),
  // snap the camera square-on, reveal the badge. STATE still updates — only motion is suppressed.
  if(reduceMotion.matches){
    const { apply }=prepFoldScene(); apply(1);
    snapCameraToFront();
    folded=true; const b=$(cfg.foldBtn); if(b) b.textContent=foldLabels().refold||'';
    setFaSymbol(true); updateCompareChip(); updateDoneBadge();
    announce(cfg.foldAnnounce?.forwardReduced || '');
    return;
  }
  animateFold(false);
}
function foldBack(){
  if(cfg.orthoViews){
    if(reduceMotion.matches){
      restorePerspective(false);   // instant hand-off to the perspective camera (at its retained pose)
      rebuild(data);               // clears `folded`, resets the button + fa-symbol, restores preFoldPose
      announce(cfg.foldAnnounce?.reverseReduced || '');
      return;
    }
    animateFold(true); return;
  }
  if(reduceMotion.matches){
    snapCameraHome();
    rebuild(data);            // rebuild clears `folded`, resets the button + fa-symbol
    announce(cfg.foldAnnounce?.reverseReduced || '');
    return;
  }
  animateFold(true);
}

// Prep S3.grp for a lesson-built fold scene, then hand it off. Disposes the live
// 3D scene, resets the fat-line material registry + resolution to S3's, and calls
// the lesson's buildAnimScene(g, ctx) — which builds the rotating sheet into g
// (using the exported helpers, which register into curMats) and returns { apply(p) }.
// ctx mirrors draw3D's. Single source for animateFold and the reduced-motion freeze.
function prepFoldScene(){
  const g=S3.grp;
  g.traverse(o=>{if(o!==g){if(o.element?.parentNode)o.element.remove();o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=S3.lineMats; curMats.length=0;
  curSweeps=S3.sweeps; curSweeps.length=0;   // fold drives its own apply(p); any sweepers it registers stay unused
  const [rw,rh]=s3Px(); curRes.set(rw,rh);
  return cfg.buildAnimScene(g,buildCtx());
}

function animateFold(reverse){
  animating=true;
  const btn=$(cfg.foldBtn);
  if(btn){ btn.disabled=true; btn.textContent = reverse ? (foldLabels().reverse||'…') : (foldLabels().forward||'…'); }

  const { apply } = prepFoldScene();        // lesson builds the scene + its apply(p)
  apply(reverse ? 1 : 0);                   // freeze the correct first frame (no flash / no jump)

  // orthoViews lessons SWOOP square-on to the flattened answer sheet on the ORTHO camera (ADR-036),
  // the projection morphing perspective→ortho as it lands — a TRUE 2D orthographic read, not a
  // held-angle dolly. Legacy intro lessons keep the perspective sweep to FRONT below.
  if(cfg.orthoViews){ animateFoldSwoop(reverse, apply, btn); return; }

  // Camera tween targets: forward stores the learner's pose and sweeps to FRONT; reverse
  // sweeps back to the stored pose. Driven inside this frame loop (the engine's loop()
  // skips S3.ctrl.update() while animating, so the fold owns the camera with no damping fight).
  const fromPos=S3.cam.position.clone(), fromTgt=S3.ctrl.target.clone();
  let toPos, toTgt;
  if(reverse){
    const h=preFoldPose||{ pos:cam3.p, tgt:cam3.t };
    toPos=h.pos.clone(); toTgt=h.tgt.clone();
  } else {
    preFoldPose={ pos:fromPos.clone(), tgt:fromTgt.clone() };
    toPos=QVL.front.p.clone(); toTgt=QVL.front.t.clone();
  }
  const startTime=performance.now();

  function frame(now){
    const t=Math.min((now-startTime)/FOLD_DURATION,1);
    apply(reverse ? 1-t : t);
    const ce=easeCamera(t);
    S3.cam.position.lerpVectors(fromPos,toPos,ce);
    S3.ctrl.target.lerpVectors(fromTgt,toTgt,ce);
    S3.ctrl.update();
    if(t<1){ requestAnimationFrame(frame); return; }

    if(reverse){
      animating=false; folded=false; preFoldPose=null;
      rebuild(data);               // restore the live, interactive 3D scene (clears fa-symbol)
      resetFold();
      announce(cfg.foldAnnounce?.reverse || '');
    } else {
      animating=false; folded=true;
      setFaSymbol(true); updateCompareChip(); updateDoneBadge();
      if(btn){ btn.disabled=false; btn.textContent=foldLabels().refold||''; }
      announce(cfg.foldAnnounce?.forward || '');
    }
  }
  requestAnimationFrame(frame);
}

// Orthographic fold-swoop camera for orthoViews lessons (Points / Lines) — ADR-036, OVERTURNS the
// old held-angle hold. Forward: hand the live view to the ORTHO camera and SWOOP it square-on to the
// flattened answer sheet (front-on along −Z at the VP) while the projection morphs perspective→ortho,
// so the fold ends on a TRUE flat 2D drawing with no residual foreshortening — mirroring the
// Spatial-Framework / Module-2 master's swoopToAnswerSheet. Reverse: GLIDE the ortho camera back onto
// the learner's retained perspective orbit pose (the perspective camera never moved during the swoop,
// so no stored pose is needed). The camera runs on the anim.js camTween — ticked by loop() even while
// `animating`, which also stamps the projection morph — while the sheet's apply(p) runs on the manual
// FOLD_DURATION rAF loop below; both on easeFold, so camera and planes read as one movement.
function animateFoldSwoop(reverse, apply, btn){
  if(reverse){
    restorePerspective(true, FOLD_DURATION, easeFold);   // ortho → the retained perspective orbit pose
  } else {
    const box=flatBoxFor('all'), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
    const toZoom=fitOrthoZoom(size.x,size.y);            // front-on: world x horizontal, y vertical
    const dist=S3.cam.position.distanceTo(S3.ctrl.target);
    const toPos=center.clone().addScaledVector(QV_DIR.front.dir,dist);
    engageOrtho();                                        // seed ortho on the live perspective pose + arm the morph
    activeView=null; syncQuickViewChips();                // the fold is not a Top/Front/Side chip
    tweenCamFull(S3.oCam,S3.oCtrl,toPos,center,toZoom,FOLD_DURATION,easeFold,FLAT_VIEW_UP.clone());
  }
  const startTime=performance.now();
  function frame(now){
    const t=Math.min((now-startTime)/FOLD_DURATION,1);
    apply(reverse ? 1-t : t);
    if(t<1){ requestAnimationFrame(frame); return; }
    if(reverse){
      animating=false; folded=false;
      rebuild(data);               // restore the live, interactive 3D scene (clears fa-symbol)
      resetFold();
      announce(cfg.foldAnnounce?.reverse || '');
    } else {
      animating=false; folded=true;
      setFaSymbol(true); updateCompareChip(); updateDoneBadge();
      if(btn){ btn.disabled=false; btn.textContent=foldLabels().refold||''; }
      announce(cfg.foldAnnounce?.forward || '');
    }
  }
  requestAnimationFrame(frame);
}

// ── Geometry helpers ──────────────────────────────────────────
// Line weights in CSS pixels — Line2 keeps a constant on-screen thickness at any
// zoom, the crisp engineering-drawing look. (No accent/off-palette colour added.)
// edge/border/proj/cross/dim are the base set; bold/ref/arc/arcBold are used by the
// Lines sim (true-length stroke, angle reference rays, and angle arcs).
export const LW = { edge:2.6, bold:3.6, border:1.6, proj:1.7, cross:2.4, dim:1.8, ref:1.6, arc:2.0, arcBold:2.8 };

// Blend a token colour toward another. Returns "#rrggbb" (used for the boxed-label
// border tint). No new palette colours — only blends of existing tokens.
export const mix=(a,b,t)=>'#'+new THREE.Color(a).lerp(new THREE.Color(b),t).getHexString();

// planeGrid — a faint, plane-hued engineering grid sized to the reference plane.
// Thin 1px GridHelper lines, deliberately subtle so they never compete with the fat
// linework (this matches Module 2's plane treatment). Plane-hued via mix() toward
// paper so it stays token-driven and preserves the HP=teal / VP=amber Two-Cue read.
// Returned in GridHelper's native XZ orientation; callers rotate it into place.
// renderOrder -1 keeps it above the fill but under every stroke.
export function planeGrid(s,c,opts={}){
  // opts defaults reproduce the historic look exactly, so legacy callers (the five
  // intro pages) are untouched. A caller can pass { opacity, divs, fade } to calm the
  // grid: fewer/larger cells, lower line opacity, and grid lines pushed closer to paper.
  const { opacity=.55, divs=Math.round(s), fade=.70 } = opts;
  const div=Math.max(1,divs);
  const grid=new THREE.GridHelper(s,div, mix(c,COL.paper,.40), mix(c,COL.paper,fade));
  grid.material.transparent=true; grid.material.opacity=opacity; grid.material.depthWrite=false;
  grid.renderOrder=-1;
  return grid;
}

// gridM2 — a faithful replica of Module 2's reference grid: a neutral GridHelper (bench-grey
// centre line + paler border grid lines) at low opacity, sized 40 with 40 divisions so each
// cell is one world unit (10 mm) — the CAD graph-paper look. Unlike planeGrid() this is NOT
// plane-hued: it is deliberately grey so it recedes as pure scale reference, exactly as
// Module 2 draws it (HP, VP and PP all share the same grey grid; the coloured projection
// linework + labels carry the HP/VP Two-Cue distinction). Returned in GridHelper's native XZ
// orientation; callers rotate it into place. renderOrder -1 keeps it under every stroke.
export function gridM2(s=40,divs=40,opacity=0.35){
  const grid=new THREE.GridHelper(s,divs,COL.bench,COL.border);   // (centreLine, gridLines) = M2's (--color-bench-grey, --color-border)
  grid.material.transparent=true; grid.material.opacity=opacity; grid.material.depthWrite=false;
  grid.renderOrder=-1;
  return grid;
}

// apl — a reference plane: an extremely faint, clean fill (a soft pale tint of the
// plane hue mixed toward paper, so two overlapping planes never multiply into a muddy
// smudge) with a crisp plane-hued grid layered on top for engineering scale. Built
// into a group — fill in local XY, grid rotated XZ→XY to match — so the caller's euler
// orients the whole assembly. depthWrite:false + low renderOrder keep it behind all
// linework. The razor-sharp border stays the caller's alp() polygon.
export function apl(g,s,c,o,e,gridOpts){
  const grp=new THREE.Group();
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(s,s),
    new THREE.MeshBasicMaterial({color:new THREE.Color(mix(c,COL.paper,.72)),transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));
  fill.renderOrder=-2; grp.add(fill);
  const grid=planeGrid(s,c,gridOpts); grid.rotation.x=Math.PI/2;  // XZ → local XY (coplanar with the fill); gridOpts default undefined → historic look
  grp.add(grid);
  grp.rotation.copy(e); g.add(grp);
}

// planeSheet — a BOUNDED reference plane that reads as a physical "sheet of paper":
// a faint translucent fill (depthWrite:false so two overlapping sheets never z-fight)
// PLUS a thick perimeter border, sized s×s and oriented by `euler`. It owns ONLY the
// fill + border; the GRID and the labels stay the caller's choice (Points keeps the grey
// gridM2 graph-paper grid; Lines keeps the hued planeGrid), so each sim's grid aesthetic
// is preserved. Additive — apl()/planeGrid()/gridM2() are untouched, so the three intro
// lessons that call apl() keep their exact look. fillOpacity is per-plane (0.10 HP /
// 0.07 VP). borderCol defaults to the plane hue; borderW defaults to the thick edge weight.
// The border routes through alp()→fatLine (registers in curMats, stays crisp on resize).
export function planeSheet(g,s,planeCol,fillOpacity,euler,borderCol,borderW){
  const grp=new THREE.Group();
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(s,s),
    new THREE.MeshBasicMaterial({color:new THREE.Color(mix(planeCol,COL.paper,.72)),transparent:true,opacity:fillOpacity,side:THREE.DoubleSide,depthWrite:false}));
  fill.renderOrder=-2; grp.add(fill);
  const h=s/2;
  alp(grp,[[-h,-h,0],[h,-h,0],[h,h,0],[-h,h,0]], borderCol||planeCol, borderW||LW.edge);  // thick plane-hued border in local XY
  grp.rotation.copy(euler||new THREE.Euler()); g.add(grp);
  return grp;
}

// fatLine — the single primitive every stroke routes through. flat is a flat
// [x,y,z,x,y,z,…] array; width is in pixels; dashed uses world-space dash sizing.
// The material is registered in curMats so layout() can refresh its resolution.
export function fatLine(g,flat,colHex,width,dashed){
  const geo=new LineGeometry(); geo.setPositions(flat);
  const mat=new LineMaterial({
    color:new THREE.Color(colHex).getHex(), linewidth:width, worldUnits:false,
    transparent:true, dashed:!!dashed, dashSize:0.20, gapSize:0.13, dashScale:1,
  });
  mat.resolution.set(curRes.x||1, curRes.y||1);
  const ln=new Line2(geo,mat); ln.computeLineDistances();
  if(curMats) curMats.push(mat);
  g.add(ln); return ln;
}

// Register an arc-sweep callback for the current fill. fn(t∈[0,1]) should redraw a partial
// arc (t=1 → the full arc the caller already built). Driven 0→1 by the step-reveal draw-on
// and by the Compare-open sweep; never called on a plain slider rebuild, so the arc then
// shows at full. No-op outside a fill (curSweeps null). See angle3()/markAngle() in lines.js.
export function addSweep(fn){ if(curSweeps) curSweeps.push(fn); }

export function asg(g,a,b,c,dash,w){
  return fatLine(g,[a[0],a[1],a[2]||0, b[0],b[1],b[2]||0], c, w!=null?w:(dash?LW.proj:LW.edge), !!dash);
}
export function alp(g,pts,c,w){
  const flat=[]; [...pts,pts[0]].forEach(p=>flat.push(p[0],p[1],p[2]||0));
  return fatLine(g,flat,c,w!=null?w:LW.border,false);
}
// acircle — a closed fat-line circle in the z=0 plane (XY), centre (cx,cy), radius r.
// Routes through alp so it's crisp at any zoom and registers in curMats. segs default 48.
export function acircle(g,cx,cy,r,c,w,segs){
  const n=segs||48, pts=[];
  for(let i=0;i<n;i++){ const t=i/n*Math.PI*2; pts.push([cx+Math.cos(t)*r, cy+Math.sin(t)*r, 0]); }
  return alp(g,pts,c,w!=null?w:LW.edge);
}
// asgCentre — Type-G chain (centre / axis) line: long-dash · gap · dot · gap, tiled
// along a→b and emitted as solid fatLine pieces. LineMaterial has only a single
// dash/gap, so a true dash-dot must be assembled by hand. The pattern is centred
// (begins and ends on a long dash) and gently scaled so the run lands exactly on
// both ends. Each lit piece registers in curMats via fatLine, so layout() keeps its
// on-screen weight correct on resize / swap. Additive: no existing caller touched.
export function asgCentre(g,a,b,c,w){
  const A=new THREE.Vector3(a[0],a[1],a[2]||0), B=new THREE.Vector3(b[0],b[1],b[2]||0);
  const dir=new THREE.Vector3().subVectors(B,A), len=dir.length();
  if(len<1e-6) return;
  dir.divideScalar(len);
  const LONG=0.5, GAP=0.14, DOT=0.06, cell=LONG+GAP+DOT+GAP;   // long · gap · dot · gap
  const width=w!=null?w:LW.proj;
  const reps=Math.max(1,Math.round((len-LONG)/cell));          // whole cells + a closing long dash
  const scale=len/(reps*cell+LONG);
  const lit=(s,e)=>{
    const p0=A.clone().addScaledVector(dir,s*scale), p1=A.clone().addScaledVector(dir,e*scale);
    fatLine(g,[p0.x,p0.y,p0.z,p1.x,p1.y,p1.z],c,width,false);
  };
  let s=0;
  for(let i=0;i<reps;i++){
    lit(s,s+LONG); s+=LONG+GAP;      // long dash, then gap
    lit(s,s+DOT);  s+=DOT+GAP;       // dot, then gap
  }
  lit(s,s+LONG);                      // closing long dash → exact end
}
// Point P: flat unlit marker drawn on top of the translucent planes, so it reads
// as a crisp solid dot (MeshPhong + lighting made it catch a bluish specular tint
// and the teal HP plane in front muddied it). A faint paper halo can sit just behind
// the dot (renderOrder 2 < dot's 3) so the marker separates cleanly from linework.
// Pass { halo:false } for a plain solid dot (default true preserves the historic look).
//
// IMPORTANT — the dot material is transparent:true with opacity:1 (i.e. visually
// opaque, but routed through the renderer's TRANSPARENT pass). Every plane, grid, and
// stroke here is transparent, and three.js draws ALL transparent objects AFTER all
// opaque ones — renderOrder only sorts WITHIN a pass. If the dot were truly opaque it
// would draw in the opaque pass first, and the transparent grid/strokes would then
// paint right over it (you'd "see through" the dot). Keeping it in the transparent pass
// lets its higher renderOrder (3 > strokes 0 > grid -1) put it on top of everything.
// depthTest:false (plus depthWrite:false, since a depthTest-off object can't write
// depth anyway) keeps a translucent plane in front from muddying it.
export function asp(g,x,y,z,r,c,opts={}){
  const { halo=true } = opts;
  if(halo){
    const h=new THREE.Mesh(new THREE.SphereGeometry(r*1.55,20,14),
      new THREE.MeshBasicMaterial({color:new THREE.Color(COL.paper),transparent:true,opacity:.9,depthTest:false,depthWrite:false}));
    h.renderOrder=2; h.position.set(x,y,z); g.add(h);
  }
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,18),
    new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:1,depthTest:false,depthWrite:false}));
  m.renderOrder=3; m.position.set(x,y,z); g.add(m);
}
// Point/foot marker — a thick filled dot (the textbook "thick dot" for a point object).
// A paper halo lifts it off the grid, then a solid disc in the element colour. Oriented to
// lie IN its plane: is3D → flat in the HP's XZ plane (normal +Y); else in the z=0 XY plane
// (the VP foot p′ and every 2D-drawing foot). Replaces the old cross/plus strokes globally.
// Pass { halo:false } for a plain dot (Lines drops the halo for a cleaner, less busy sheet);
// default true preserves the Points/intro look.
export function acr(g,cx,cy,cz,r,c,is3D,opts={}){
  const { halo:wantHalo=true } = opts;
  const dr=r*0.8, rotX=is3D?-Math.PI/2:0;
  if(wantHalo){
    const halo=new THREE.Mesh(new THREE.CircleGeometry(dr*1.5,24),
      new THREE.MeshBasicMaterial({color:new THREE.Color(COL.paper),transparent:true,opacity:.9,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
    halo.renderOrder=2; halo.rotation.x=rotX; halo.position.set(cx,cy,cz); g.add(halo);
  }
  const dot=new THREE.Mesh(new THREE.CircleGeometry(dr,24),
    new THREE.MeshBasicMaterial({color:new THREE.Color(c),transparent:true,opacity:1,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
  dot.renderOrder=3; dot.rotation.x=rotX; dot.position.set(cx,cy,cz); g.add(dot);
}
export function adm(g,x1,y1,x2,y2,c,txt){
  const ox=x1-0.6, col=new THREE.Color(c);
  asg(g,[ox,y1,0],[ox,y2,0],c,0,LW.dim);
  asg(g,[x1-0.25,y1,0],[ox-0.02,y1,0],c,0,LW.dim);
  asg(g,[x2-0.25,y2,0],[ox-0.02,y2,0],c,0,LW.dim);
  function arrow(tipX,tipY,up){
    const h=0.30,w=0.09,d=up?1:-1,shape=new THREE.Shape();   // slightly sharper, more pointed head
    shape.moveTo(tipX,tipY); shape.lineTo(tipX-w,tipY-d*h); shape.lineTo(tipX+w,tipY-d*h); shape.closePath();
    const m=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshBasicMaterial({color:col,side:THREE.DoubleSide,depthTest:false}));
    m.renderOrder=1; g.add(m);
  }
  arrow(ox,y1,y2<y1); arrow(ox,y2,y2>y1);
  alb(g,txt,ox-0.9,(y1+y2)/2,0,c,2.0,0.68,true,256);
}

// roundRect path (Path2D.roundRect / ctx.roundRect aren't universal yet).
export function roundRect(ctx,x,y,w,h,r){
  r=Math.min(r,w/2,h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
// Boxed point label — the "engineering software" look for point names (P, p, p′):
// coloured text on a paper-tinted chip with a thin same-hue border. Now a live DOM node
// (CSS2DObject) instead of a baked sprite, so it stays vector-sharp at any zoom. The
// chip styling lives in CSS (.lbl--chip, border:1px solid currentColor); h maps to the
// on-screen font size. Returns the CSS2DObject so fold scenes can fade it via opacity.
export function albBox(g,txt,x,y,z,c,h=0.3){
  const el=document.createElement('div');
  el.className='lbl lbl--chip'; el.textContent=txt;
  el.style.color=c; el.style.fontWeight='700';
  el.style.fontFamily='"Atkinson Hyperlegible",system-ui,sans-serif';
  el.style.fontSize=`${Math.max(12,Math.min(18,Math.round(h*40)))}px`;
  const obj=new CSS2DObject(el); obj.position.set(x,y,z); obj.center.set(0.5,0.5);
  g.add(obj); return obj;
}
// Text label — a live DOM node (CSS2DObject) re-projected every frame, so it stays
// razor-sharp at any zoom (was a baked canvas sprite). The signature is preserved so
// every call site is untouched: sy drives the on-screen font size, mono picks the
// family (IBM Plex Mono vs Atkinson). sx / cw / supersampling are no longer needed —
// the browser lays out the text. Returns the CSS2DObject so fold scenes can fade it.
export function alb(g,txt,x,y,z,c,sx=.7,sy=.35,mono=false,cw=512){
  const el=document.createElement('div');
  el.className='lbl'; el.textContent=txt;
  el.style.color=c; el.style.fontWeight=mono?'600':'700';
  el.style.fontFamily=mono?'"IBM Plex Mono",ui-monospace,monospace':'"Atkinson Hyperlegible",system-ui,sans-serif';
  el.style.fontSize=`${Math.max(11,Math.min(22,Math.round(sy*18)))}px`;
  const obj=new CSS2DObject(el); obj.position.set(x,y,z); obj.center.set(0.5,0.5);
  g.add(obj); return obj;
}

// Flat in-plane text label — unlike alb()/albBox() (CSS2DObject billboards that always
// face the camera), this bakes the text onto a CanvasTexture'd PlaneGeometry, so it LIES
// FLAT in 3D and orients with the surface it labels (a name printed ON the grid, not a pill
// floating in front of it). Used for the HP/VP plane names + the X/Y fold-line ends, which
// read as part of the engineering drawing. `euler` tilts the quad into its plane (HP floor:
// (-π/2,0,0); VP wall: identity). `size` is the text's world-unit height. Raster, not vector
// — the small trade-off for lying flat; supersampled to dpr + anisotropy so it stays crisp.
// Mesh (not Line2) → not in curMats; fill()'s disposal frees its geometry + map + material.
export function planeLabel(g,text,x,y,z,color,euler,size=0.9){
  const dpr=Math.min(devicePixelRatio||1,2), fontPx=64, pad=12;
  const font=`700 ${fontPx}px "Atkinson Hyperlegible",system-ui,sans-serif`;
  const cv=document.createElement('canvas'), ctx=cv.getContext('2d');
  ctx.font=font; const tw=Math.ceil(ctx.measureText(text).width);
  const cw=tw+pad*2, ch=fontPx+pad*2;
  cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr);
  ctx.scale(dpr,dpr); ctx.font=font;                    // resizing the canvas reset the state
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle=color;
  ctx.fillText(text,cw/2,ch/2);
  const tex=new THREE.CanvasTexture(cv);
  // Plain linear (no mipmaps) — robust for the non-power-of-two canvas, crisp enough for a
  // small label; dpr supersampling + anisotropy carry the sharpness.
  tex.anisotropy=8; tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter; tex.generateMipmaps=false;
  const geo=new THREE.PlaneGeometry(size*(cw/ch),size);
  const mat=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z); if(euler) m.rotation.copy(euler); m.renderOrder=1;
  g.add(m); return m;
}

// ═══════════════════════════════════════════════════════════════
// COMPARE VIEW (dual mode) — the on-demand floating card that re-houses S2.
// Replaces the retired PiP + swap(). The main pane is always S3; the card shows S2's
// content: the 2D drawing while the main view is live 3D, or a live-rebuilt 3D view while
// the main sheet is folded flat (s2Is3D). Canvases never move in the DOM; only S2's group
// content + camera pose change — consistent with the rebuild() disposal contract.
// ═══════════════════════════════════════════════════════════════

// Repaint the Compare stack (S2) for the current data + content mode, then set its camera
// pose. OrbitControls on S2 are enabled only when showing 3D in the expanded card.
function refillCompare(ctx){
  if(!compareOpen) return;
  compareSweep?.cancel(); compareSweep=null;   // drop any in-flight open-sweep before S2 is re-drawn
  fill(S2, s2Is3D, ctx || buildCtx());
  if(s2Is3D){ S2.cam.position.copy(cam3.p); S2.ctrl.target.copy(cam3.t); }
  else      { S2.cam.position.copy(cam2.p); S2.ctrl.target.copy(cam2.t); }
  S2.ctrl.enableRotate = s2Is3D && compareSize==='expanded';
  S2.ctrl.update();
  if(compareCard){
    const tab=compareCard.querySelector('.compare-card__tab');
    if(tab) tab.textContent = s2Is3D ? '3D view' : '2D drawing';
  }
}

// Sweep the just-drawn Compare-card angle arcs in once, when the card opens. Mirrors the
// step-reveal draw-on but only drives the S2 sweepers (the static linework is already full).
// Reduced motion: tween() snaps to 1, so the arcs appear complete.
function startCompareSweep(){
  const sweeps=[...S2.sweeps];
  if(!sweeps.length) return;
  compareSweep?.cancel();
  compareSweep=tween({ from:0, to:1, duration:700, ease:easeDraw,
    onUpdate:v=>{ for(const s of sweeps) s(v); },
    onComplete:()=>{ for(const s of sweeps) s(1); compareSweep=null; } });
}

// State-aware Compare chip: aria-pressed mirrors open/closed; the label says what the chip
// WILL show next (3D view while folded, else the 2D drawing).
function updateCompareChip(){
  const chip=$('compare-chip'); if(!chip) return;
  chip.setAttribute('aria-pressed', String(compareOpen));
  const lbl=chip.querySelector('.chip__label');
  if(lbl) lbl.textContent = folded ? 'Compare 3D view' : 'Compare 2D drawing';
}

// Hide the chip until the lesson's 2D gate passes (Points: showHP && showVP), preserving
// the pedagogy that the 2D drawing is meaningless before both views exist. A closed gate
// also force-closes an open card.
function syncCompareChipVisibility(view){
  const chip=$('compare-chip'); if(!chip) return;
  const ok = cfg.compareGate ? cfg.compareGate(view) : (cfg.mode==='dual');
  chip.hidden=!ok;
  if(!ok && compareOpen) compare.hide();
}

const compare = {
  show(size){
    if(animating || cfg.mode!=='dual') return;
    compareOpen=true; compareSize=size||compareSize||'compact';
    s2Is3D=folded;                          // live-3D card iff the main sheet is folded flat
    if(compareCard){ compareCard.hidden=false; compareCard.dataset.size=compareSize; }
    refillCompare();
    startCompareSweep();                     // sweep the card's angle arcs in on open (the 2D reveal)
    syncWorkbench();                          // Lines: collapse the wizard + dock the live-parameter rail
    updateCompareChip(); layout();
    announce(s2Is3D ? 'Compare view opened — 3D view.' : 'Compare view opened — 2D drawing.');
  },
  hide(){
    if(!compareOpen) return;
    compareOpen=false;
    if(compareCard) compareCard.hidden=true;
    syncWorkbench();                          // Lines: restore the wizard + return the controls
    updateCompareChip(); layout();
    announce('Compare view closed.');
  },
  toggle(){ compareOpen ? compare.hide() : compare.show(); },
  isOpen(){ return compareOpen; },
};

// ── Compare workbench (cfg.workbenchControls — Lines) ─────────
// When the side-by-side split is open (isSplit()), the fat wizard wastes width we want for the
// two drawings. Workbench mode reclaims it: collapse the wizard (true 50/50) and re-parent the
// geometry-driver .ctrl fields into the docked #workbench-rail under both panes, so the learner
// can still dial True Length / distances / angles and watch BOTH views update live. Re-parenting
// (not mirroring) keeps one source of truth — control ids are global, so every input listener /
// setRange / self-check keeps working wherever the node lives (same pattern Lines uses to
// relocate #view-toggles into .vp-cluster).
let workbenchOn=false, wbMoved=null;
function syncWizardToggleCollapsed(collapsed){
  const wt=$('wizard-toggle'); if(!wt) return;
  wt.setAttribute('aria-expanded', String(!collapsed));
  wt.title = collapsed ? 'Show steps panel' : 'Hide steps panel';
}
function enterWorkbench(){
  const rail=$('workbench-rail'), controls=$('controls'); if(!rail||!controls) return;
  document.body.classList.add('compare-workbench','wizard-collapsed');
  syncWizardToggleCollapsed(true);
  wbMoved=[];
  cfg.workbenchControls.forEach(key=>{
    const el=controls.querySelector(`.ctrl[data-ctrl="${key}"]`);
    if(el){ wbMoved.push({el, anchor:el.nextSibling}); el.hidden=false; rail.appendChild(el); }
  });
  rail.hidden=false;
  announce('Compare workbench opened. Adjust true length, distances, and angles below the drawings; both views update together.');
  requestAnimationFrame(()=>{ layout(); rail.querySelector('input,select,button')?.focus(); });
}
function exitWorkbench(){
  const rail=$('workbench-rail'), controls=$('controls');
  document.body.classList.remove('compare-workbench','wizard-collapsed');
  syncWizardToggleCollapsed(false);
  if(wbMoved && controls){
    // Restore each field to its exact original slot. Reverse order so a recorded anchor that was
    // itself a moved field is already back in place before we insert before it.
    for(let i=wbMoved.length-1;i>=0;i--){
      const {el,anchor}=wbMoved[i];
      controls.insertBefore(el, anchor && anchor.parentNode===controls ? anchor : null);
    }
  }
  wbMoved=null;
  if(rail) rail.hidden=true;
  renderStep(step);                 // restore normal per-step progressive disclosure
  requestAnimationFrame(layout);
}
// Match workbench state to whether the split is currently showing. Idempotent; safe to call from
// any transition (compare open/close, the compact↔expanded toggle, the mobile-breakpoint change).
function syncWorkbench(){
  if(!cfg.workbenchControls) return;
  const want=isSplit();
  if(want===workbenchOn) return;
  workbenchOn=want;
  want ? enterWorkbench() : exitWorkbench();
}

// Legacy quick-view camera move (single-perspective lessons) — eases S3's perspective camera to a
// canonical pose (Top/Front/Side) over `dur` via the anim.js tween (so simAPI.pause() freezes it).
// Cancels any in-flight quick-view + is a no-op during a fold. Setting position+target then
// ctrl.update() round-trips through OrbitControls cleanly (damping deltas are zero), so it holds.
function tweenPerspective(pose,dur){
  if(animating) return;
  camTween?.cancel();
  const fromP=S3.cam.position.clone(), fromT=S3.ctrl.target.clone();
  camTween=tween({ from:0, to:1, duration:dur, ease:easeCamera,
    onUpdate:v=>{ S3.cam.position.lerpVectors(fromP,pose.p,v); S3.ctrl.target.lerpVectors(fromT,pose.t,v); S3.ctrl.update(); },
    onComplete:()=>{ camTween=null; } });
}

// ═══════════════════════════════════════════════════════════════
// MODULE-2 CAMERA ORCHESTRATOR (ported) — dual perspective/ortho camera with a projection morph,
// clip-aware auto-zoom, orthographic quick-views, and a flattened 2D pan. All of this runs only
// for cfg.orthoViews lessons (Points / Lines); everything below is hoisted but inert otherwise.
// ═══════════════════════════════════════════════════════════════

// Ortho zoom whose frustum HEIGHT matches the perspective frustum height at `dist` — so a
// perspective→ortho swap at that distance has no scale pop (Module 2's seam).
function orthoZoomForDist(dist){
  const halfH=dist*Math.tan(THREE.MathUtils.degToRad(S3.cam.fov/2));
  return ORTHO_FRUSTUM/Math.max(halfH,1e-3);
}
// Ortho zoom to fit a world-space box (screenW × screenH, in the view's screen axes) into the
// frustum with FRAME_PADDING margin — the larger dimension just fits. (Verbatim Module 2.)
function fitOrthoZoom(screenW,screenH){
  const aspect=S3.oCam.right/S3.oCam.top;                 // == viewport aspect
  const halfW=Math.max((screenW/2)*FIT_PADDING,1e-3);
  const halfH=Math.max((screenH/2)*FIT_PADDING,1e-3);
  return Math.min((ORTHO_FRUSTUM*aspect)/halfW, ORTHO_FRUSTUM/halfH);
}
// Map a box's world extents to the screen axes for each quick-view direction, then fit.
function fitOrthoZoomForView(kind,size){
  if(kind==='top')  return fitOrthoZoom(size.x,size.z);   // looking down +Y: x→screenX, z→screenY
  if(kind==='side') return fitOrthoZoom(size.z,size.y);   // looking along +X: z→screenX, y→screenY
  return fitOrthoZoom(size.x,size.y);                      // front, looking along +Z: x→screenX, y→screenY
}

// Blend the ortho projection matrix toward the perspective one by projMorphK (0=ortho, 1=persp),
// element-wise. Not physically exact, but over a sub-second move between matched-framing endpoints
// it reads as a smooth gain/loss of depth. (Verbatim Module 2, retargeted to S3's two cameras.)
function applyProjectionMorph(){
  const k=projMorphK;
  const o=S3.oCam.projectionMatrix.elements;              // pure ortho this frame (the tween rebuilt it)
  const p=S3.cam.projectionMatrix.elements;              // perspective, pose-independent
  for(let i=0;i<16;i++) o[i]+=(p[i]-o[i])*k;
  S3.oCam.projectionMatrixInverse.copy(S3.oCam.projectionMatrix).invert();
}
// End any in-flight morph and restore a clean ortho matrix — called before each fresh camera move
// so a leftover blend never bleeds into the next view.
function clearProjectionMorph(){
  if(projMorphK===null) return;
  projMorphK=null;
  S3.oCam?.updateProjectionMatrix();
}

// Make the ortho camera live, seeding a smooth transition INTO it. On first entry FROM perspective
// it copies the live 3D pose + a zoom matching the perspective frustum (so frame 0 doesn't pop) and
// arms the perspective→ortho morph; ortho→ortho re-frames just clear any leftover blend. Callers set
// activeView + syncQuickViewChips, then tweenCamFull to the destination. (Verbatim Module 2.)
function engageOrtho(){
  if(actCam!==S3.oCam){
    S3.oCam.position.copy(S3.cam.position);
    S3.oCtrl.target.copy(S3.ctrl.target);
    S3.oCam.up.copy(S3.cam.up);                           // start the roll from the 3D view's up
    S3.oCam.zoom=orthoZoomForDist(S3.cam.position.distanceTo(S3.ctrl.target));
    S3.oCam.updateProjectionMatrix();
    S3.cam.updateProjectionMatrix();                      // morph endpoint must be current (aspect)
    projMorphK=reduceMotion.matches?null:1;               // perspective(1) → ortho(0) over the tween
  } else {
    clearProjectionMorph();
  }
  actCam=S3.oCam; actCtrl=S3.oCtrl;
  S3.ctrl.enabled=false; S3.oCtrl.enabled=true;
}
// Return to the perspective free-orbit camera (which kept the learner's last orbit pose). Instant by
// default; when `animate`, the ortho camera GLIDES onto the perspective pose while its projection
// morphs ortho→perspective on the same tween, so the swap lands with no cut. (Verbatim Module 2.)
function restorePerspective(animate=false,duration=1500,ease=easeStandard){
  camTween?.cancel(); camTween=null;
  autoZoomTween?.cancel(); autoZoomTween=null;            // a deliberate camera move home cancels any pending auto-dolly
  clearProjectionMorph();
  activeView=null; syncQuickViewChips();
  const handOff=()=>{ actCam=S3.cam; actCtrl=S3.ctrl; if(S3.oCtrl) S3.oCtrl.enabled=false; S3.ctrl.enabled=true; };
  if(!animate || reduceMotion.matches || actCam!==S3.oCam){ handOff(); return; }
  const fromPos=S3.oCam.position.clone(), fromTgt=S3.oCtrl.target.clone(), fromUp=S3.oCam.up.clone(), fromZoom=S3.oCam.zoom;
  const toPos=S3.cam.position.clone(), toTgt=S3.ctrl.target.clone(), toUp=S3.cam.up.clone();
  const toZoom=orthoZoomForDist(toPos.distanceTo(toTgt));
  S3.cam.updateProjectionMatrix();
  projMorphK=0;                                           // arm; the loop stamps it each frame
  camTween=tween({ from:0, to:1, duration, ease,
    onUpdate:t=>{
      S3.oCam.position.lerpVectors(fromPos,toPos,t);
      S3.oCtrl.target.lerpVectors(fromTgt,toTgt,t);
      S3.oCam.up.copy(fromUp).lerp(toUp,t).normalize();
      S3.oCam.zoom=THREE.MathUtils.lerp(fromZoom,toZoom,t); S3.oCam.updateProjectionMatrix();
      projMorphK=t;                                       // ortho(0) → perspective(1)
    },
    onComplete:()=>{ camTween=null; projMorphK=null; handOff(); } });
}
// General morph-aware mover (used for ortho quick-views + the flat 2D pans). Lerps position, target,
// zoom and — when given — the screen-up roll; while morphing FROM perspective it holds the
// camera-to-target distance constant (no dolly wobble) and drives projMorphK 1→0. (Verbatim Module 2.)
function tweenCamFull(cam,ctrls,toPos,toTgt,toZoom,duration=1500,ease=easeCamera,toUp){
  const fromPos=cam.position.clone(), fromTgt=ctrls.target.clone(), fromZoom=cam.zoom??1;
  const fromUp=toUp?cam.up.clone():null;
  const morphing=projMorphK!==null;
  const fromDist=morphing?fromPos.distanceTo(fromTgt):0;
  camTween?.cancel();
  camTween=tween({ from:0, to:1, duration, ease,
    onUpdate:t=>{
      cam.position.lerpVectors(fromPos,toPos,t);
      ctrls.target.lerpVectors(fromTgt,toTgt,t);
      if(morphing) cam.position.sub(ctrls.target).setLength(fromDist).add(ctrls.target);
      if(fromUp) cam.up.copy(fromUp).lerp(toUp,t).normalize();
      if(toZoom!=null && cam.isOrthographicCamera){ cam.zoom=THREE.MathUtils.lerp(fromZoom,toZoom,t); cam.updateProjectionMatrix(); }
      if(morphing) projMorphK=1-t;
    },
    onComplete:()=>{ camTween=null; if(morphing) projMorphK=null; } });
}

// World-space box of the MEANINGFUL geometry (the point/line + its feet) — lesson-supplied so the
// fit ignores the large reference grid (a whole-grp box would always frame the grid). Falls back to
// the grp box. Used by the perspective auto-zoom.
function contentBoxWorld(){
  if(cfg.contentBox){ const b=cfg.contentBox(cfg.resolve?cfg.resolve(data):data); if(b && !b.isEmpty()) return b; }
  const box=new THREE.Box3().setFromObject(S3.grp);
  if(box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(2,2,2));
  return box;
}
// World-space box of one region of the FLATTENED sheet ('front'|'top'|'side'|'all') — lesson-supplied
// (it knows where its views land after the fold). Falls back to the grp box.
function flatBoxFor(kind){
  if(cfg.flatViewBox){ const b=cfg.flatViewBox(kind,cfg.resolve?cfg.resolve(data):data); if(b && !b.isEmpty()) return b; }
  const box=new THREE.Box3().setFromObject(S3.grp);
  if(box.isEmpty()) box.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(4,4,4));
  return box;
}
// Required perspective camera-to-pivot distance to frame `box` with `padding` margin, via an
// accurate projected-box fit over the 8 corners (a bounding sphere over-frames). (Verbatim Module 2.)
function fitPerspectiveDistance(box,pivot,dir,up,padding=FRAME_PADDING){
  const forward=dir.clone().negate();
  const right=new THREE.Vector3().crossVectors(forward,up).normalize();
  const camUp=new THREE.Vector3().crossVectors(right,forward).normalize();
  const vHalf=THREE.MathUtils.degToRad(S3.cam.fov/2);
  const hHalf=Math.atan(Math.tan(vHalf)*S3.cam.aspect);
  const tanV=Math.tan(vHalf), tanH=Math.tan(hHalf);
  const v=new THREE.Vector3(); let D=0;
  for(let i=0;i<8;i++){
    v.set((i&1)?box.max.x:box.min.x,(i&2)?box.max.y:box.min.y,(i&4)?box.max.z:box.min.z).sub(pivot);
    const a=v.dot(dir), px=Math.abs(v.dot(right)), py=Math.abs(v.dot(camUp));
    D=Math.max(D, a+(px*padding)/tanH, a+(py*padding)/tanV);
  }
  return D;
}
// Clip-aware auto-zoom (Feature 2). Called at the END of rebuild() (the single seam every size /
// orient change passes through), so it never runs per-frame and never fights a manual orbit: between
// edits OrbitControls owns the camera. If the new geometry would clip the free-orbit perspective view,
// dolly the camera BACKWARD along its current view dir to a FRAME_PADDING fill; otherwise do nothing —
// push-back ONLY, so a deliberate zoom-in survives an edit. The move is a one-shot fixed-duration eased
// tween from the camera's CURRENT distance, restarted (from wherever it currently is) on each rebuild,
// so a continuous slider drag tracks smoothly without an end-of-drag jump. Reduced motion snaps (the
// tween jumps to its end value). (Verbatim Module 2 — the fit math + the one-shot tween follow.)
function reframeIfClipped(){
  if(actCam!==S3.cam || animating || folded || camTween) return;
  const box=contentBoxWorld();
  const center=box.getCenter(new THREE.Vector3());
  const fromTgt=S3.ctrl.target.clone();
  const dir=S3.cam.position.clone().sub(fromTgt);
  if(dir.lengthSq()<1e-6) return;
  dir.normalize();
  // Fit pivots on the box CENTRE, not the (fixed) orbit target. Centering the subject on the
  // optical axis kills the off-axis penalty in fitPerspectiveDistance — so the required distance
  // grows LINEARLY with the subject instead of lurching as it translates away from a fixed pivot
  // (Module 2's frameToSolid semantics). The orbit target recenters onto the box centre so the
  // subject stays framed as the learner dials it. Push-back ONLY on distance — never dolly closer
  // than the learner's current zoom. Because the look DIRECTION (dir) is held constant, lerping
  // BOTH target→centre and position→(centre+dir·toDist) keeps position−target == dir·distance
  // exactly: a clean dolly+pan along one axis, no arc, no bulge.
  const dReq=fitPerspectiveDistance(box,center,dir,S3.cam.up);
  const dCur=S3.cam.position.distanceTo(fromTgt);
  const toDist=Math.max(dCur,dReq);
  const fromPos=S3.cam.position.clone();
  const toPos=center.clone().addScaledVector(dir,toDist);
  // Steady state (target already centred, distance already fits): don't disturb the camera on a
  // no-geometry rebuild (a toggle, step nav, or Compare open/close).
  if(fromTgt.distanceTo(center)<0.05 && Math.abs(toDist-dCur)<0.05){ autoZoomTween?.cancel(); autoZoomTween=null; return; }
  autoZoomTween?.cancel();                                 // retarget from the LIVE pose (smooth chase on a continuous drag)
  autoZoomTween=tween({ from:0, to:1, duration:AUTO_ZOOM_MS,
    onUpdate:t=>{
      S3.ctrl.target.lerpVectors(fromTgt,center,t);
      S3.cam.position.lerpVectors(fromPos,toPos,t);
    },
    onComplete:()=>{ autoZoomTween=null; } });
}
// Default-pose fit (Module 2's frameToSolid semantics, verbatim). At boot / reset, dolly the
// perspective camera to a snug FRAME_PADDING fill of the DEFAULT geometry, looking along the
// lesson's chosen angle. cam3.p/cam3.t now supply ONLY the look DIRECTION; the orbit target
// recenters onto the content box centre and the distance is fit-driven, so the view starts
// intimate and equals where reframeIfClipped settles for the defaults (same box-centre pivot →
// no jump between the start pose and the first auto-zoom). Gated on cfg.autoFrame — the five
// intro lessons keep their fixed cam3 pose and pay nothing.
function frameDefault(){
  if(!cfg.autoFrame) return;
  autoZoomTween?.cancel(); autoZoomTween=null;             // the fresh fit is the last word — no in-flight push-back dolly survives it
  const dir=cam3.p.clone().sub(cam3.t);                    // look DIRECTION only (cam3's distance is no longer used)
  if(dir.lengthSq()<1e-6) return;
  dir.normalize();
  const box=contentBoxWorld();
  const center=box.getCenter(new THREE.Vector3());
  const D=fitPerspectiveDistance(box,center,dir,S3.cam.up);
  S3.ctrl.target.copy(center);
  S3.cam.position.copy(center).addScaledVector(dir,D);
  S3.ctrl.update();
}

// Light the lit quick-view chip (radio group), driven by activeView.
function syncQuickViewChips(){
  ['top','front','side'].forEach(k=>{
    const el=$('qv-'+k); if(!el) return;
    const on=activeView===k; el.classList.toggle('is-active',on); el.setAttribute('aria-pressed',String(on));
  });
}
// Orbit attempted while the ORTHO camera is live (rotate-locked in attachOrtho): nudge the
// latched chip (or the chip group) so the learner reads "disengage this view to orbit" instead
// of a dead drag. The reflow between remove/add restarts the animation on a repeat drag.
function cueOrthoLock(){
  const el=document.querySelector('#quick-views .quick-view.is-active')||$('quick-views');
  if(!el) return;
  el.classList.remove('qv-lock-cue');
  void el.offsetWidth;
  el.classList.add('qv-lock-cue');
  setTimeout(()=>el.classList.remove('qv-lock-cue'),450);
}
// A quick-view click. Single-perspective lessons keep the legacy snap. orthoViews lessons: while the
// sheet is flat → a 2D pan (setFlatView); re-clicking the active view → back to free orbit; otherwise
// engage ortho square-on, fit to the geometry, and morph perspective→ortho.
function setView(kind){
  if(animating) return;
  if(!cfg.orthoViews){ tweenPerspective(QVL[kind],1500); activeView=kind; syncQuickViewChips(); return; }
  if(folded){ setFlatView(kind); return; }
  if(activeView===kind){ restorePerspective(true); return; }
  const box=contentBoxWorld(), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
  const qd=QV_DIR[kind];
  const toZoom=fitOrthoZoomForView(kind,size);
  // Stand the ortho camera off at the LIVE orbit distance, not the fixed ORTHO_STANDOFF: the
  // morph-in reproject in tweenCamFull re-radiuses the camera to that same distance every frame,
  // so a far (90-unit) standoff only made the interpolated offset vector bulge — the down-right
  // "swoop" — before the renormalization snapped it back. Matched magnitudes → a clean arc; the
  // final pose is identical (ortho framing is zoom-driven, so the standoff length is cosmetic).
  const dist=S3.cam.position.distanceTo(S3.ctrl.target);
  const toPos=center.clone().addScaledVector(qd.dir,dist);
  engageOrtho();
  activeView=kind; syncQuickViewChips();
  tweenCamFull(S3.oCam,S3.oCtrl,toPos,center,toZoom,1500,easeFold,qd.up.clone());
  announce(`${kind[0].toUpperCase()+kind.slice(1)} view.`);
}
// In the flattened drawing the views sit on the z=0 sheet, so Top/Front/Side become a FRONT-ON pan
// that frames the requested region (front = elevation above XY, top = plan below XY, side = whole
// sheet) rather than a camera rotation. (Module 2's setFlatView, re-derived for M1's vertical sheet.)
function setFlatView(kind){
  const box=flatBoxFor(kind), center=box.getCenter(new THREE.Vector3()), size=box.getSize(new THREE.Vector3());
  const toZoom=fitOrthoZoom(size.x,size.y);               // front-on: world x horizontal, y vertical
  const toPos=center.clone().addScaledVector(QV_DIR.front.dir,ORTHO_STANDOFF);
  engageOrtho();                                          // already ortho when folded → just clears any leftover morph
  activeView=kind; syncQuickViewChips();
  tweenCamFull(S3.oCam,S3.oCtrl,toPos,center,toZoom,1500,easeCamera,FLAT_VIEW_UP.clone());
  announce(`${kind==='side'?'Whole drawing':kind[0].toUpperCase()+kind.slice(1)+' view'}.`);
}

// ── Secondary-scene overlay (dual mode) ───────────────────────
// Clears the 2D scene (S2) and primes the fat-line material registry + resolution to
// it, then returns S2.grp so a lesson can draw a bespoke construction straight into
// the 2D viewport using the exported helpers (fatLine/asg/acr/albBox …) — they share
// this module's curMats/curRes, so the overlay's line weights stay correct on resize.
// The engine's loop() keeps rendering S2, so the overlay animates / freezes as drawn.
// The lesson owns the overlay's own rAF; any rebuild() (which calls cfg.beforeRebuild)
// tears it down and repaints the live draw2D. Used by the Lines Traces / True-Length.
function beginOverlay(){
  compareSweep?.cancel(); compareSweep=null;   // a construction overlay replaces S2 — kill any open-sweep first
  const g=S2.grp;
  g.traverse(o=>{if(o!==g){if(o.element?.parentNode)o.element.remove();o.geometry?.dispose();[o.material].flat().forEach(m=>{m?.map?.dispose();m?.dispose();});}});
  g.clear();
  curMats=S2.lineMats; curMats.length=0;
  curSweeps=S2.sweeps; curSweeps.length=0;
  const [rw,rh]=s2Px(); curRes.set(rw,rh);
  return g;
}

// ── Control primitives (exported for lesson wiring) ───────────
// unit defaults to 'cm' so 4-arg legacy callers (Quadrants / First-angle, which display
// centimetres) are unchanged; the mm sims (Points / Lines) pass 'mm' so the over-range
// note reads in the lesson's own unit.
export function setRange(r,n,v,vt,unit='cm'){
  const rEl=$(r), nEl=$(n), max=+rEl.max||100, clamped=Math.min(max,Math.max(0,v));
  rEl.value=String(clamped);
  rEl.style.setProperty('--p',(clamped/max*100)+'%');
  rEl.setAttribute('aria-valuetext',vt(v));
  nEl.value=String(v);
  nEl.setAttribute('aria-invalid','false');
  // The typed field accepts up to 200; the slider only reaches its max. When the
  // value sits beyond the slider, say so plainly rather than letting the thumb lie.
  setNote('note-'+r.slice(2), v>max ? `The slider only reaches ${max} ${unit}. Your typed value of ${v} ${unit} is still used.` : '');
}

// Inline control feedback (validation + over-range). Icon matches the hint callout.
const NOTE_ICO='<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none"/></svg>';
export function setNote(id,msg){
  const el=$(id); if(!el) return;
  if(msg){ el.innerHTML=NOTE_ICO+`<span>${msg}</span>`; el.hidden=false; }
  else { el.textContent=''; el.hidden=true; }
}

// ── Live-region announcements ─────────────────────────────────
export function announce(msg){ if(!live) return; live.textContent=''; live.textContent=msg; }

// ── Reflow / info banner (top-centre, transient) ──────────────
// A brief, VISIBLE note over the viewport for a state change a sighted learner needs
// explained (e.g. an edit springing a flattened sheet back to 3D). Screen readers already
// get the message through #live/#vp-status via announce(), so this banner is aria-hidden and
// is NOT itself a live region (narrating it twice would over-announce). Auto-dismisses after
// FLOW_NOTE_HOLD; a fresh call resets the timer and re-shows. Exported for lesson callers
// (Inc5 recovery notes); nothing fires it yet this increment.
const FLOW_NOTE_HOLD=4500;
let flowNoteEl=null, flowNoteTimer=null, flowNoteHideTimer=null;
export function flowNote(msg){
  flowNoteEl ??= $('vp-flow-note');
  if(!flowNoteEl) return;
  const t=flowNoteEl.querySelector('.vp-note__text'); if(t) t.textContent=msg;
  clearTimeout(flowNoteTimer); clearTimeout(flowNoteHideTimer);
  flowNoteEl.hidden=false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(()=>flowNoteEl.classList.add('is-visible'));
  flowNoteTimer=setTimeout(()=>{
    flowNoteEl.classList.remove('is-visible');
    flowNoteHideTimer=setTimeout(()=>{ flowNoteEl.hidden=true; }, 240);
  }, FLOW_NOTE_HOLD);
}

// ── Success toast (top-centre, transient) ─────────────────────
// A calm win confirmation (success green + a check glyph — Two-Cue Rule, never gamified
// fanfare). setTimeout-driven, NOT the rAF tween, so it still fades while the loop is paused
// (the Problem Library overlay pauses the loop the moment this fires — Inc6). aria-hidden:
// #live already narrates the win, so this is not a second live region (would double-announce).
const TOAST_HOLD=2600;
export function showToast(msg){
  toastEl ??= $('sim-toast');
  if(!toastEl) return;
  const t=toastEl.querySelector('.sim-toast__text'); if(t) t.textContent=msg;
  clearTimeout(toastTimer); clearTimeout(toastHideTimer);
  toastEl.hidden=false;
  // Next frame so the fade-in runs from the hidden state (instant under reduced motion).
  requestAnimationFrame(()=>toastEl.classList.add('is-visible'));
  toastTimer=setTimeout(()=>{
    toastEl.classList.remove('is-visible');
    toastHideTimer=setTimeout(()=>{ toastEl.hidden=true; }, 240);
  }, TOAST_HOLD);
}

// ── Per-step done-badge (quiet progress, not a reward) ────────
// A step may declare done:(data,view)=>bool; when true the engine reveals #done-badge with
// the step's doneText. view carries the engine flags a predicate needs (folded / connectors).
// Called from rebuild() (clears it — folded is reset there) and on a forward fold completing.
function updateDoneBadge(){
  const badge=$('done-badge'); if(!badge) return;
  const s=cfg.steps[step];
  let on=false;
  if(s && typeof s.done==='function'){
    const view=viewFor(step); view.connectors=showConnectors; view.folded=folded;
    on=!!s.done(data,view);
  }
  badge.classList.toggle('is-on',on);
  if(on){ const t=badge.querySelector('.done-badge__text'); if(t) t.textContent=s.doneText||'Step complete'; }
}

// ── Inline two-state Reset confirm (guards the Reset button) ──
// armReset swaps the ghost Reset for "Reset everything? · Yes / Cancel" on the same spot, so a
// stray click can't wipe work; Back / Next step aside (CSS .is-reset-armed). It arms ONLY when
// the lesson's cfg.resetConfirmWhen(data) says there is work to lose — intro lessons (no guard)
// and an at-defaults sim reset instantly. simAPI.reset() stays the single reset path, fired only
// by a deliberate Yes. Escape / tab-away / outside click disarm (nothing is lost).
function armReset(){
  if(!(cfg.resetConfirmWhen && cfg.resetConfirmWhen(data))){ window.simAPI.reset(); return; }
  if(resetArmed) return;
  resetArmed=true;
  const rb=$('btn-reset'), rc=$('reset-confirm');
  if(rb) rb.hidden=true; if(rc) rc.hidden=false;
  document.querySelector('.card__nav')?.classList.add('is-reset-armed');
  $('btn-reset-cancel')?.focus();
  announce('Reset everything? Choose Yes to clear your work, or Cancel to keep it.');
}
function disarmReset({returnFocus=false}={}){
  if(!resetArmed) return;
  resetArmed=false;
  const rb=$('btn-reset'), rc=$('reset-confirm');
  if(rc) rc.hidden=true; if(rb) rb.hidden=false;
  document.querySelector('.card__nav')?.classList.remove('is-reset-armed');
  if(returnFocus) rb?.focus();
}

// ── WebGL context-loss recovery ───────────────────────────────
// A GPU reset / long backgrounding can drop a canvas's WebGL context. Without preventDefault()
// the browser will NOT restore it and the canvas freezes blank while the loop spins uselessly.
// So: opt in (preventDefault), pause the loop, and show a quiet "Restoring…" chip on loss; on
// restore, re-upload by rebuilding + re-laying-out and resume. Attached to BOTH canvases.
function showRestoring(on){
  const el=$('sim-context-lost'); if(el) el.hidden=!on;
  announce(on ? 'The 3D view paused while your device reset its graphics. Restoring.'
              : '3D view restored.');
}
function wireContextLoss(rend){
  const el=rend?.domElement; if(!el) return;
  el.addEventListener('webglcontextlost', e=>{
    e.preventDefault();                       // REQUIRED — opts in to a restorable context
    window.simAPI.pause(); showRestoring(true);
  }, false);
  el.addEventListener('webglcontextrestored', ()=>{
    // Clear any in-flight fold/flatten state so the guarded rebuild() can't no-op into a blank
    // canvas if the context dropped mid-animation, then re-upload + resume. Also drop any ortho /
    // morph state so a loss mid-quick-view recovers to the perspective free-orbit view.
    animating=false; folded=false; camTween?.cancel(); camTween=null; autoZoomTween?.cancel(); autoZoomTween=null;
    clearProjectionMorph(); activeView=null;
    actCam=S3.cam; actCtrl=S3.ctrl; if(S3.oCtrl) S3.oCtrl.enabled=false; S3.ctrl.enabled=true;
    rebuild(data); layout(); window.simAPI.resume(); showRestoring(false);
  }, false);
}

// ── Screen-reader mirror of the viewport result ───────────────
// The WebGL scenes carry the payoff but are unreadable by assistive tech.
// cfg.describe() restates that result as text; announceState() debounces it so a
// slider drag yields one announcement, not dozens, and never clobbers the
// step-change announcement on #live.
let stateTimer=null;
function announceState(d,v){
  if(!cfg.describe) return;
  clearTimeout(stateTimer);
  stateTimer=setTimeout(()=>{ const el=$('vp-status'); if(el) el.textContent=cfg.describe(d,v); },250);
}

// ═══════════════════════════════════════════════════════════════
// STEPPER CONTROLLER
// ═══════════════════════════════════════════════════════════════
function buildRail(){
  const rail=$('step-rail'); if(!rail) return;
  rail.innerHTML='';
  cfg.steps.forEach((s,i)=>{
    const li=document.createElement('li'); li.className='rail__item';
    const b=document.createElement('button');
    b.className='rail__btn'; b.type='button'; b.dataset.idx=String(i);
    b.innerHTML=`<span class="rail__marker">${i+1}</span><span class="rail__label">${s.railLabel||s.title}</span>`;
    li.appendChild(b); rail.appendChild(li);
  });
}

function renderStep(i, animate=false){
  const STEP_COUNT=cfg.steps.length;
  step=Math.max(0,Math.min(STEP_COUNT-1,i));
  maxReached=Math.max(maxReached,step);
  const s=cfg.steps[step];

  // A step may carry data overrides (the Lines sim's case steps set the line
  // orientation). Apply them before the rebuild at the end of this function. Steps
  // without `.set` (every other lesson) are unaffected.
  if(s.set) data={...data,...s.set};

  // Rail state
  document.querySelectorAll('#step-rail .rail__item').forEach((li,idx)=>{
    li.classList.toggle('is-complete', idx<step);
    li.classList.toggle('is-current',  idx===step);
    li.classList.toggle('is-upcoming', idx>step);
    li.querySelector('.rail__marker').textContent = idx<step ? '✓' : String(idx+1);
    const b=li.querySelector('.rail__btn');
    b.disabled = idx>maxReached;
    if(idx===step) b.setAttribute('aria-current','step'); else b.removeAttribute('aria-current');
  });

  // Card content
  const set=(id,fn)=>{ const el=$(id); if(el) fn(el); };
  set('eyebrow',el=>el.textContent=`Step ${step+1} of ${STEP_COUNT}`);
  set('step-title',el=>el.textContent=s.title);
  set('step-lead',el=>el.textContent=s.lead);
  set('step-body',el=>el.innerHTML=s.body.map(p=>`<p>${p}</p>`).join(''));
  const hintEl=$('hint');
  if(hintEl){
    if(s.hint){ const ht=$('hint-text'); if(ht) ht.innerHTML=s.hint; hintEl.hidden=false; }
    else hintEl.hidden=true;
  }

  // Progressive disclosure of controls
  document.querySelectorAll('#controls .ctrl').forEach(el=>{
    el.hidden = !s.controls.includes(el.dataset.ctrl);
  });

  // Navigation. On the final step: lessons with a Problem Library turn the Next button into a
  // live "Select problem" CTA (the click handler routes it to problemLib.open via dataset.role);
  // lessons without one keep the inert "Done".
  set('btn-back',el=>el.disabled = step===0);
  set('btn-next',el=>{
    const last = step===STEP_COUNT-1;
    if(last && cfg.problems && problemLib){
      el.disabled=false; el.textContent='Select problem'; el.dataset.role='select-problem';
    } else {
      el.disabled=last; el.textContent=last?'Done':'Next'; el.dataset.role='';
    }
  });

  // Onboarding: the one-time orbit hint (engine-driven on orbitHint steps; persists once
  // dismissed) + the first-seen contextual spotlight this step declares (queued one at a
  // time from the lesson's cfg.spotlights).
  if(s.orbitHint) onboarding?.showOrbitHint(); else onboarding?.hideOrbitHint();
  if(s.spotlight) onboarding?.spotlight(s.spotlight);

  // Short fade + translate on content swap (collapses to instant under reduced-motion).
  // Reset the card's internal scroll so a new step always starts from the top, not
  // wherever the previous (taller) step was scrolled to.
  const card=document.querySelector('.step-card');
  if(card){ card.scrollTop=0; card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap'); }

  closeTerm();
  announce(`Step ${step+1} of ${STEP_COUNT}. ${s.title}.`);
  // Arm the projection draw-on for this rebuild only when the caller asked (step nav);
  // boot's renderStep(0) leaves it off, so the first paint doesn't fade in.
  drawOnNext = animate;
  rebuild(data);
}

const goNext=()=>{ if(step<cfg.steps.length-1) renderStep(step+1,true); };
const goBack=()=>{ if(step>0) renderStep(step-1,true); };

// ── Inline term popover ───────────────────────────────────────
let activeTerm=null;
function openTerm(btn){
  const key=btn.dataset.t, def=cfg.terms?.[key]; if(!def) return;
  activeTerm=btn;
  termPop.innerHTML=`<span class="pt">${def.label}</span>${def.def}`;
  termPop.classList.add('show');
  btn.setAttribute('aria-describedby','term-pop');
  const r=btn.getBoundingClientRect(), pw=termPop.offsetWidth, ph=termPop.offsetHeight, m=8;
  let top=r.bottom+6; if(top+ph>innerHeight-m) top=Math.max(m,r.top-ph-6);
  let left=Math.min(Math.max(m,r.left),innerWidth-pw-m);
  termPop.style.top=`${top}px`; termPop.style.left=`${left}px`;
}
function closeTerm(){
  if(!activeTerm) return;
  termPop.classList.remove('show');
  activeTerm.removeAttribute('aria-describedby');
  activeTerm=null;
}

// ── Wizard collapse/expand (shared chrome chevron) ────────────
// Toggles body.wizard-collapsed: the CSS drops #wizard out of the flex row and the
// viewport (flex:1 1 0) reclaims the freed space. The viewport width changed, so we
// re-run layout() to resize the canvas(es) + refresh each LineMaterial.resolution
// (line weights stay correct). One rAF lets the CSS reflow settle before measuring.
function setupWizardToggle(){
  const btn=$('wizard-toggle'); if(!btn) return;
  btn.addEventListener('click',()=>{
    // In workbench mode the wizard is collapsed BY the open split; the chevron then means
    // "show the steps again" → close the split, which restores the wizard and returns the
    // re-parented controls (compare.hide → syncWorkbench → exitWorkbench).
    if(document.body.classList.contains('compare-workbench')){ compare.hide(); return; }
    const collapsed=document.body.classList.toggle('wizard-collapsed');
    btn.setAttribute('aria-expanded',String(!collapsed));
    btn.title=collapsed?'Show steps panel':'Hide steps panel';
    announce(collapsed?'Steps panel hidden.':'Steps panel shown.');
    requestAnimationFrame(layout);
  });
}

// ── Viewport cluster (injected chrome) ────────────────────────
// Compare card (dual mode): the chip toggles it; expand grows the card (and enables S2
// orbit when it holds 3D content); close / Escape dismiss. The card frame + its stage are
// looked up here (after injectChrome).
function setupCompareCard(){
  compareCard=$('compare-card'); compareStage=compareCard?.querySelector('.compare-card__stage');
  // A lesson that wants the side-by-side split as THE compare (Lines, via cfg.compareDefaultSize:
  // 'expanded' + cfg.compareSplit) opens the chip straight into that size and drops the compact-PiP
  // toggle, so the Compare chip never yields a floating card — just the docked 50/50 split or closed.
  // Points sets neither flag, so its chip still opens the compact PiP and expand → split (unchanged).
  if(cfg.compareDefaultSize){
    compareSize = cfg.compareDefaultSize;
    const ex=$('compare-expand'); if(ex) ex.hidden=true;
  }
  $('compare-chip')?.addEventListener('click',()=>compare.toggle());
  $('compare-expand')?.addEventListener('click',()=>{
    if(!compareOpen) return;
    compareSize = compareSize==='expanded' ? 'compact' : 'expanded';
    if(compareCard) compareCard.dataset.size=compareSize;
    S2.ctrl.enableRotate = s2Is3D && compareSize==='expanded';
    syncWorkbench();                          // compact↔expanded can cross the split boundary
    requestAnimationFrame(layout);
  });
  $('compare-close')?.addEventListener('click',()=>compare.hide());
  document.addEventListener('keydown',e=>{ if(e.key==='Escape' && compareOpen) compare.hide(); });
}
// Quick-view camera chips (Points / Lines via cfg.ui.quickViews). The three behave as a radio
// group: the clicked chip lights blue (.is-active + aria-pressed) and the others clear. A manual
// orbit makes the canonical pose stale, so a user-initiated OrbitControls 'start' clears the
// highlight (programmatic tweenCamera / fold updates don't fire 'start').
function setupQuickViews(){
  const grp=$('quick-views'); if(grp) grp.hidden=false;
  ['top','front','side'].forEach(k=>$('qv-'+k)?.addEventListener('click',()=>setView(k)));
  // A manual free-orbit drag (perspective) makes the latched view stale → clear the highlight.
  // (Programmatic tweens + ortho-control drags don't fire the perspective ctrl's 'start'.)
  S3.ctrl.addEventListener('start',()=>{ autoZoomTween?.cancel(); autoZoomTween=null; if(activeView && actCam===S3.cam){ activeView=null; syncQuickViewChips(); } });
  // A left-drag while the rotate-locked ortho pair is live can't orbit (attachOrtho) and won't
  // fire any OrbitControls event — catch the pointerdown itself and cue the latched chip.
  S3.rend.domElement.addEventListener('pointerdown',e=>{
    if(e.button!==0 || actCam!==S3.oCam) return;
    cueOrthoLock();
  });
}
// Leave any lit quick-view: a lesson calls this when a parameter edit makes the orthographic view
// stale. orthoViews lessons GLIDE the ortho camera back to free orbit (morphing ortho→perspective);
// legacy lessons ease the perspective camera home. No-op when no view is active, so repeated slider
// 'input' events return home only once.
function exitQuickView(){
  if(animating) return;                                    // the fold owns the camera while it runs
  if(!activeView && actCam===S3.cam) return;
  if(cfg.orthoViews) restorePerspective(true);
  else { activeView=null; syncQuickViewChips(); tweenPerspective({ p:cam3.p, t:cam3.t },1500); }
}
// Connector / projector declutter chip (Points via cfg.ui.connectors). Flips a view flag
// the draw functions respect; persists across rebuilds.
function setupConnectorToggle(){
  const btn=$('connector-toggle'); if(!btn) return;
  btn.hidden=false;
  btn.addEventListener('click',()=>{
    showConnectors=!showConnectors;
    btn.classList.toggle('on',showConnectors);
    btn.setAttribute('aria-pressed',String(showConnectors));
    announce(showConnectors?'Projectors shown.':'Projectors hidden.');
    rebuild(data);
  });
}

// ── Wire up everything ────────────────────────────────────────
function wire(){
  setupWizardToggle();
  // Card-footer navigation + rail jump. On the final step of a Problem-Library lesson the Next
  // button is relabelled "Select problem" (renderStep sets dataset.role) and opens the library.
  $('btn-next')?.addEventListener('click',e=>{
    if(e.currentTarget.dataset.role==='select-problem'){ problemLib?.open(); return; }
    goNext();
  });
  $('btn-back')?.addEventListener('click',goBack);
  // Reset — guarded by the inline two-state confirm (armReset decides arm vs instant).
  $('btn-reset')?.addEventListener('click',armReset);
  $('btn-reset-yes')?.addEventListener('click',()=>{ disarmReset({returnFocus:true}); window.simAPI.reset(); });
  $('btn-reset-cancel')?.addEventListener('click',()=>{ disarmReset({returnFocus:true}); announce('Reset cancelled.'); });
  $('reset-confirm')?.addEventListener('keydown',e=>{
    if(e.key==='Escape'){ e.stopPropagation(); disarmReset({returnFocus:true}); announce('Reset cancelled.'); }
  });
  // Tab-away or click outside the armed confirm abandons it (nothing is lost); disarm is idempotent.
  $('reset-confirm')?.addEventListener('focusout',e=>{ if(resetArmed && !$('reset-confirm').contains(e.relatedTarget)) disarmReset(); });
  document.addEventListener('pointerdown',e=>{ if(resetArmed && !$('reset-confirm').contains(e.target)) disarmReset(); });
  $('step-rail')?.addEventListener('click',e=>{
    const b=e.target.closest('.rail__btn'); if(!b||b.disabled) return;
    renderStep(+b.dataset.idx,true);
  });

  // Fold button (only when this lesson folds)
  if(cfg.foldBtn) $(cfg.foldBtn)?.addEventListener('click',runAnimation);

  // Viewport cluster (injected chrome): Compare card (dual mode), quick-view chips +
  // connector toggle (per cfg.ui). Each is hidden until its owning lesson opts in.
  if(cfg.mode==='dual') setupCompareCard();
  if(cfg.ui?.quickViews) setupQuickViews();
  if(cfg.ui?.connectors) setupConnectorToggle();
  // (Orbit-hint dismissal on first interaction is owned by onboarding.js via the
  // OrbitControls 'start' event — no separate pointerdown handler needed here.)

  // Term popover (delegated within the wizard panel)
  const sp=$('wizard');
  if(sp){
    sp.addEventListener('click',e=>{const t=e.target.closest('.term'); if(t){e.preventDefault(); activeTerm===t?closeTerm():openTerm(t);}});
    sp.addEventListener('mouseover',e=>{const t=e.target.closest('.term'); if(t)openTerm(t);});
    sp.addEventListener('mouseout',e=>{const t=e.target.closest('.term'); if(t&&t===activeTerm&&document.activeElement!==t)closeTerm();});
    sp.addEventListener('focusin',e=>{const t=e.target.closest('.term'); if(t)openTerm(t);});
    sp.addEventListener('focusout',e=>{const t=e.target.closest('.term'); if(t&&t===activeTerm)closeTerm();});
  }
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTerm();});
  window.addEventListener('scroll',closeTerm,true);

  $('mobile-dismiss')?.addEventListener('click',()=>{const n=$('mobile-note'); if(n) n.style.display='none';});
  new ResizeObserver(layout).observe(area);
  MOBILE_Q.addEventListener('change',()=>{ syncWorkbench(); layout(); });   // re-fit + re-evaluate workbench when crossing the breakpoint

  // Lesson-specific control wiring (sliders / number fields / selects). `compare` +
  // `beginOverlay` are used by dual-mode lessons that draw their own construction into the
  // 2D scene (the Lines sim opens the Compare card expanded for it). `swap` / `isMain3D`
  // are deprecated no-op shims kept so older call sites don't throw.
  cfg.wireControls && cfg.wireControls({
    rebuild, editRebuild, getData:()=>data, setRange, setNote, announce,
    compare, beginOverlay, exitQuickView,
    swap:()=>{}, isMain3D:()=>true,
  });
}

// ── Problem Library controller seam (Inc6) ────────────────────
// A small read/route facade handed to the library. It NEVER auto-fills: loading a problem only
// resets to defaults + routes to the dial-able step (the student dials the setup by hand). The
// self-check subscribes via onStateChange and sees every change through rebuild()'s single seam.
function simFacade(){
  return {
    state:    ()=>data,
    hasWork:  ()=>!!(cfg.resetConfirmWhen && cfg.resetConfirmWhen(data)),
    isBusy:   ()=>animating,
    reset:    ()=>window.simAPI.reset(),
    goStep:   i=>{ if(typeof i==='number' && i>=0) renderStep(i,true); },
    announce, toast:showToast, flowNote,
    cueHint:  t=>onboarding?.cue?.(t),
    // The first revealed dial of the current step — focused after a problem loads.
    firstControl: ()=>document.querySelector('#controls .ctrl:not([hidden]) input, #controls .ctrl:not([hidden]) select'),
    onStateChange: cb=>{ stateChangeSubs.add(cb); return ()=>stateChangeSubs.delete(cb); },
  };
}

// ── Boot ──────────────────────────────────────────────────────
function boot(){
  readTokens();
  injectChrome($('sim-viewport'));   // shared viewport chrome before wire() queries its ids
  injectCardChrome();                // step-card chrome (Reset confirm + done-badge) — same reason
  if(cfg.problems) injectLibraryChrome();   // Inc6: only for lessons that ship a problem set
  S3=build(c3,true);
  // The live camera pair starts as S3's perspective camera. cfg.orthoViews lessons also get an
  // ortho camera on S3 for the quick-views + the folded orthographic sheet (Module-2 port).
  actCam=S3.cam; actCtrl=S3.ctrl;
  if(cfg.orthoViews) attachOrtho(S3,c3);
  if(cfg.mode==='dual') S2=build(c2,false);
  // Graceful degradation: recover from a dropped WebGL context on either canvas.
  wireContextLoss(S3.rend);
  if(cfg.mode==='dual') wireContextLoss(S2.rend);
  // First-run viewport aids. DOM is already injected (injectChrome above) and S3.ctrl
  // exists, so onboarding can attach before renderStep(0) fires the first orbit hint.
  onboarding=initOnboarding(S3.ctrl, cfg.spotlights);
  // Problem Library (Inc6): wired after onboarding (its cueHint routes through it) and after the
  // markup is injected. Gated on cfg.problems so intro lessons pay nothing.
  if(cfg.problems) problemLib=initProblemLibrary(simFacade(), cfg.problems);
  // renderStep(0) → rebuild() does the fresh tight fit itself while freshFrame is true (no separate
  // frameDefault() call — that earlier ran AFTER the rebuild's reframe tween and got clobbered).
  wire(); buildRail(); layout(); renderStep(0); loop();
  // The late layout can change the aspect after the first fit; re-fit so the boot framing is exact.
  setTimeout(()=>{ layout(); if(cfg.autoFrame) frameDefault(); },100);
  // Mark success and clear the boot diagnostic (if it showed for a slow CDN load).
  window.__simStarted=true;
  document.getElementById('boot-error')?.remove();
  // Re-render sprite labels once the web fonts are ready (avoids fallback FOUT).
  document.fonts?.ready.then(()=>rebuild(data));
}

// ── Public entry point ────────────────────────────────────────
export function initSim(config){
  cfg = config;
  cfg.mode = cfg.mode || 'single';
  cam3 = config.cam3 || CAM3;
  cam2 = config.cam2 || CAM2;
  QVL = config.qv ? { ...QV, ...config.qv } : QV;   // per-key quick-view/fold pose overrides
  data = config.defaultData();

  // Platform contract — window.simAPI (pause / resume / reset)
  window.simAPI = {
    // Stop the loop → tick() stops → in-flight tweens FREEZE (not cancel). Nulling
    // lastFrame makes the first frame after resume() delta=0, so a tween continues
    // smoothly instead of jumping its full elapsed-while-paused span.
    pause(){ cancelAnimationFrame(rafId); rafId=null; lastFrame=null; },
    resume(){ if(!rafId){ lastFrame=null; loop(); } },
    reset(){
      if(animating) return;
      cancelAll(); drawOn=null; camTween=null; autoZoomTween=null;   // no draw-on / camera tweens survive a reset (cancelAll cleared them)
      // Drop any perspective↔ortho state: clear the morph and hand the live camera back to perspective.
      clearProjectionMorph(); activeView=null;
      actCam=S3.cam; actCtrl=S3.ctrl; if(S3.oCtrl) S3.oCtrl.enabled=false; S3.ctrl.enabled=true;
      syncQuickViewChips();
      // Close the Compare card, drop any stored fold pose + the connector override.
      compareOpen=false; s2Is3D=false; preFoldPose=null;
      if(compareCard) compareCard.hidden=true;
      syncWorkbench();                 // exit workbench (reset closes Compare directly, not via the facade)
      setFaSymbol(false);
      showConnectors=true;
      const cb=$('connector-toggle'); if(cb){ cb.classList.add('on'); cb.setAttribute('aria-pressed','true'); }
      S3.cam.position.copy(cam3.p); S3.ctrl.target.copy(cam3.t); S3.ctrl.update();
      if(cfg.mode==='dual'){ S2.cam.position.copy(cam2.p); S2.ctrl.target.copy(cam2.t); S2.ctrl.update(); }
      updateCompareChip();
      // Restore defaults, but stay on the current step's case (the Lines sim binds a
      // line orientation to each step via `.set`); lessons without `.set` get the
      // plain defaults, exactly as before. freshFrame routes the rebuild through the fresh tight
      // fit (frameDefault) instead of the push-back reframe, so reset lands on the snug pose.
      freshFrame=true;
      rebuild({ ...config.defaultData(), ...(cfg.steps[step]?.set || {}) });
    },
  };

  // Self-starting on window load (modules are deferred, so the DOM is parsed; load
  // also guarantees layout sizes are final). Guard in case load already fired.
  if(document.readyState==='complete') boot();
  else window.addEventListener('load', boot);
}
