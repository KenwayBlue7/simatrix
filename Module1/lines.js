// lines.js — orchestrator for Projection of Straight Lines, built on the shared engine
// (src/engine.js) in dual-window mode: two independent renderer stacks (S3 = always
// 3D, S2 = always 2D), the 2D Picture-in-Picture + 3D/2D toggle bar, and the reversible
// orthographic-projection fold. The generic machinery — renderer stacks, JS-owned
// canvas sizing, the guided stepper, term popovers, the fold timeline driver, simAPI,
// and the boot watchdog — all lives in the engine. This file supplies the lesson's pure
// data layer (src/lineData.js + src/lineSteps.js), the two draw functions, the fold
// scene, the bespoke Traces / True-Length constructions, and the control wiring.
//
// World axes (identical to the Points module — both planes share the X-axis fold line):
//   x = lateral (along XY) · y = height above HP · z = depth in front of VP
//   HP = XZ plane (y=0, teal) · VP = XY plane (z=0, amber) · fold line = X-axis
import * as THREE from 'three';
import { initSim, apl, alp, asg, asp, acr, alb, albBox, fatLine, mix, LW, COL,
         toW, foldStateAt, setRange, setNote, announce, flowNote, addSweep } from './src/engine.js';
import { defaultLineData, resolveLine, LineCase } from './src/lineData.js';
import { STEPS, TERMS } from './src/lineSteps.js';
import { PROBLEMS, TIERS, FIELD_LABELS } from './src/lineProblems.js';

const $ = id => document.getElementById(id);
const W = toW;
// Foot-marker option: the Lines sim drops the paper halo behind every endpoint/foot dot so
// the enlarged sheet reads cleaner (asp endpoints + acr feet). Passed to acr()/asp().
const NOHALO = { halo:false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const DEF = defaultLineData();   // baseline for resetConfirmWhen (is there work to lose?)

// Bounded reference-sheet size in world units (1 unit = 10 mm). Enlarged to 60 (600 mm) so the
// geometry never bleeds off the glass: a 150 mm True Length plus an end positioned up to 150 mm
// above HP / in front of VP can reach ~350 mm from the origin, well inside the 600 mm sheet.
// draw3D + buildAnimScene both read this; the camera auto-zoom (autoFrame, in the engine) keeps
// the working area framed regardless of the sheet's full size.
const SHEET = 60;

// Calm-grid opts for the HP/VP reference planes: faint lines pushed toward paper so the
// grid recedes and the subject line pops, at SHEET divisions for 10 mm cells on the bounded
// SHEET×SHEET sheet. Passed to the engine's apl() (which forwards them to planeGrid()).
const CALM_GRID = { opacity:.30, divs:SHEET, fade:.80 };

// Viewport toggles (Labels / Dimensions / Projectors) + the Readout HUD. Labels/Dims/Projectors
// default ON (they shape the drawing); the Readout HUD defaults OFF (opt-in telemetry). Read by
// the draw functions / the afterRebuild HUD gate; flipped by the cluster chips (and the HUD's own
// × for tReadout). viewsReady caches whether both views exist so setReadout() can re-gate the HUD
// without a rebuild.
let tLabels = true, tDims = true, tProj = true, tReadout = false;
let viewsReady = false;
// HT/VT traces in the LIVE 3D scene — armed only while the "Show Traces" walkthrough is open, so
// the 3D markers come and go with that animation (set in enterTrace, cleared in teardownConUI).
// draw3D reads it; any rebuild that tears the construction down (edit / exit) also clears it.
let tShow3DTraces = false;

// Construction overlays (Traces / True-Length). conMode ∈ null | 'trace' | 'tl'.
// Each is a self-contained animated construction drawn into the 2D scene (via the
// engine's beginOverlay), frozen when finished; any rebuild() tears it down (engine's
// beforeRebuild hook → teardownConUI).
let conMode = null, conRAF = null, conApply = null;
let tlPhase = 0, tlPlaying = false, tlPhaseT = 0, tlPrevTime = 0;

// The engine api (stashed in wireControls) gives the construction overlays access to
// the 2D scene group (beginOverlay), the view swap, the live data, and rebuild/announce.
let api = null;

// ═══════════════════════════════════════════════════════════════
// 3D SCENE
// Axes: x = lateral (along XY) · y = height above HP · z = depth in front of VP
// The line is centred on its own mid-lateral so it always sits in frame.
// ═══════════════════════════════════════════════════════════════
function draw3D(g, ctx){
  const M = ctx.model, v = ctx.view, S = SHEET, lo = S*0.4;
  // Borderless reference planes (apl = faint fill + calm hued grid, NO perimeter border) to match
  // Module 2's plane treatment + the five intro lessons. HP floor (XZ, y=0) + VP wall (XY, z=0).
  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0),CALM_GRID);
  apl(g,S,COL.vp,.07,new THREE.Euler(),CALM_GRID);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                        // XY fold line
  if(tLabels){
    alb(g,'HP',-lo,-.3,lo,COL.hp,2.0,.78);
    alb(g,'VP',-lo,lo,.05,COL.vp,2.0,.78);
    alb(g,'x',-S/2-.35,.35,0,COL.ink,1.0,.5);   // x/y at the two ENDS of the XY line (plane edges)
    alb(g,'y', S/2+.35,.35,0,COL.ink,1.0,.5);
  }
  if(!v.showLine) return;

  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const A=[ax,W(M.A.y),W(M.A.z)], B=[bx,W(M.B.y),W(M.B.z)];

  // Front view feet on VP (z=0) and Top view feet on HP (y=0)
  const aF=[ax,W(M.A.y),0], bF=[bx,W(M.B.y),0];   // a', b'  (elevation — PRIMED)
  const aT=[ax,0,W(M.A.z)], bT=[bx,0,W(M.B.z)];   // a , b   (plan — UNPRIMED)
  const fvTrue=Math.abs(M.fvLen-M.tl)<0.5, tvTrue=Math.abs(M.tvLen-M.tl)<0.5;

  // Projectors (perpendicular construction) — drawn first, beneath the views
  if(tProj){
    asg(g,A,aF,COL.vp,1); asg(g,B,bF,COL.vp,1);   // P→VP (dashed amber)
    asg(g,A,aT,COL.hp,1); asg(g,B,bT,COL.hp,1);   // P→HP (dashed teal)
  }

  // Front view a'b' on VP — darkened/bold when it equals the true length
  if(v.showFV){
    fvTrue ? asgBold(g,aF,bF,COL.vp) : asg(g,aF,bF,COL.vp,0);
    acr(g,aF[0],aF[1],0,.13,COL.vp,false,NOHALO); acr(g,bF[0],bF[1],0,.13,COL.vp,false,NOHALO);
    if(tLabels){ albBox(g,"a'",aF[0]-.32,aF[1]+.34,.05,COL.vp,.34); albBox(g,"b'",bF[0]+.32,bF[1]+.34,.05,COL.vp,.34); }
  }
  // Top view ab on HP — darkened/bold when it equals the true length
  if(v.showTV){
    tvTrue ? asgBold(g,aT,bT,COL.hp) : asg(g,aT,bT,COL.hp,0);
    acr(g,aT[0],0,aT[2],.13,COL.hp,true,NOHALO); acr(g,bT[0],0,bT[2],.13,COL.hp,true,NOHALO);
    if(tLabels){ albBox(g,'a',aT[0]-.32,.2,aT[2],COL.hp,.32); albBox(g,'b',bT[0]+.32,.2,bT[2],COL.hp,.32); }
  }

  // The true line AB in space — always the True Length, so always drawn dark + bold
  asgBold(g,A,B,COL.ink);
  asp(g,A[0],A[1],A[2],.18,COL.ink,NOHALO); asp(g,B[0],B[1],B[2],.18,COL.ink,NOHALO);
  if(tLabels){
    albBox(g,'A',A[0]-.32,A[1]+.36,A[2]+.15,COL.ink,.34);
    albBox(g,'B',B[0]+.32,B[1]+.36,B[2]+.15,COL.ink,.34);
  }
  if(tDims) drawTLDim3D(g,A,B,M);                 // blueprint-style offset dimension line (was a floating label)
  if(tShow3DTraces) drawTraces3D(g,M);            // HT/VT pierce-points in 3D (only while Traces is open)

  // True inclinations marked in 3D: θ with HP (dark teal) measured at A from the
  // horizontal; φ with VP (dark amber) measured at B from the VP-parallel direction.
  const dL=[B[0]-A[0],B[1]-A[1],B[2]-A[2]];
  if(M.theta>1 && M.theta<89.5)
    angle3(g,A,[dL[0],0,dL[2]],dL,1.4,mix(COL.hp,COL.ink,.42),`θ=${M.theta.toFixed(0)}°`);
  if(M.phi>1 && M.phi<89.5){
    const dB=[-dL[0],-dL[1],-dL[2]];
    angle3(g,B,[dB[0],dB[1],0],dB,1.4,mix(COL.vp,COL.ink,.42),`φ=${M.phi.toFixed(0)}°`);
  }
}

// Shared 2D layout — the single source of truth for where the front view (FV, above
// XY) and top view (TV, below XY) land on the sheet. draw2D and the Traces / True-Length
// overlays all consume this so their geometry is pixel-aligned.
function sheet2D(M){
  const HW=6.2, HH=4.6;
  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const aUp=W(M.A.y), bUp=W(M.B.y), aDn=W(M.A.z), bDn=W(M.B.z);
  // FIXED scale locked to the static sheet bounds — NO data-dependent auto-fit, so 10 mm
  // reads as 10 mm on screen regardless of TL / inclination. The sheet frames a static
  // SHEET2D_SPAN mm working range on each side of the XY line at a constant scale; a rare
  // over-range line extends past the sheet rather than shrinking it. (Was: fit = min(1,
  // frame/lineExtent) — that auto-zoomed the sheet to chase the line, so 10 mm shrank as TL grew.)
  // Locked to the STATIC SHEET bounds, never auto-zooming: the sheet's vertical half maps to
  // SHEET/2 expressed in mm (SHEET=60 u=600 mm → 300 mm each side of the XY line), so the absolute
  // worst-case line — a 150 mm end height plus a 150 mm True Length — always lands inside the sheet
  // instead of overflowing it. (Was a bare 100 mm span, which the 150 mm True-Length slider overran.)
  const SHEET2D_SPAN=(SHEET/2)*10;     // mm per vertical half — derived from SHEET, not a magic 100
  const fit=(HH-0.9)/W(SHEET2D_SPAN);  // constant
  const F=n=>n*fit;
  return { HW, HH, F,
    A1:[F(ax),F(aUp),0], B1:[F(bx),F(bUp),0],     // a' b'  elevation (primed)
    A2:[F(ax),-F(aDn),0], B2:[F(bx),-F(bDn),0],   // a  b   plan (unprimed)
    fvTrue:Math.abs(M.fvLen-M.tl)<0.5, tvTrue:Math.abs(M.tvLen-M.tl)<0.5,
    fvPoint:M.fvLen<0.6, tvPoint:M.tvLen<0.6 };
}

// ═══════════════════════════════════════════════════════════════
// 2D SCENE — the orthographic sheet: FV above XY, TV below XY,
// joined by vertical projectors. FIXED scale (sheet2D) — 10 mm reads as 10 mm; a big
// line extends past the static sheet rather than auto-zooming it.
// ═══════════════════════════════════════════════════════════════
function draw2D(g, ctx){
  const M = ctx.model, v = ctx.view;
  const HW=6.2, HH=4.6;
  alp(g,[[-HW-.3,-HH-.3,0],[HW+.3,-HH-.3,0],[HW+.3,HH+.3,0],[-HW-.3,HH+.3,0]],COL.border);
  asg(g,[-HW-.3,0,0],[HW+.3,0,0],COL.ink,0);                    // XY line
  if(tLabels){
    alb(g,'x',-HW-.05,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',HW+.05,.38,0,COL.ink,.85,.72,false,128);
    alb(g,'VP',-HW+.5,2.4,0,COL.vp,1.5,.9,false,128); alb(g,'HP',-HW+.5,-2.4,0,COL.hp,1.5,.9,false,128);
  }
  if(!(v.showFV && v.showTV)){
    alb(g,'Front & top views appear here',0,0,0,COL.bench,4.6,.42);
    return;
  }

  const L=sheet2D(M);
  const {F,A1,B1,A2,B2,fvTrue,tvTrue,fvPoint,tvPoint}=L;

  // Vertical projectors linking the two views through XY
  if(tProj){
    asg(g,[A1[0],A1[1],0],[A2[0],A2[1],0],COL.bench,1);
    asg(g,[B1[0],B1[1],0],[B2[0],B2[1],0],COL.bench,1);
  }

  // FRONT VIEW (elevation) — amber, darkened + bold when it equals true length
  if(fvPoint){ acr(g,A1[0],A1[1],0,.2,COL.vp,false,NOHALO); }
  else {
    fvTrue ? asgBold(g,A1,B1,COL.vp) : asg(g,A1,B1,COL.vp,0);
    acr(g,A1[0],A1[1],0,.16,COL.vp,false,NOHALO); acr(g,B1[0],B1[1],0,.16,COL.vp,false,NOHALO);
  }
  // TOP VIEW (plan) — teal, darkened + bold when it equals true length
  if(tvPoint){ acr(g,A2[0],A2[1],0,.2,COL.hp,false,NOHALO); }
  else {
    tvTrue ? asgBold(g,A2,B2,COL.hp) : asg(g,A2,B2,COL.hp,0);
    acr(g,A2[0],A2[1],0,.16,COL.hp,false,NOHALO); acr(g,B2[0],B2[1],0,.16,COL.hp,false,NOHALO);
  }

  // Names: elevation is PRIMED (a'b'), plan is UNPRIMED (ab); plus a clear caption
  if(tLabels){
    if(fvPoint){ albBox(g,"a'b'",A1[0]+.58,A1[1]+.48,0,COL.vp,.40); }
    else { albBox(g,"a'",A1[0]-.45,A1[1]+.45,0,COL.vp,.38); albBox(g,"b'",B1[0]+.45,B1[1]+.45,0,COL.vp,.38); }
    if(tvPoint){ albBox(g,'ab',A2[0]+.58,A2[1]-.48,0,COL.hp,.40); }
    else { albBox(g,'a',A2[0]-.45,A2[1]-.45,0,COL.hp,.38); albBox(g,'b',B2[0]+.45,B2[1]-.45,0,COL.hp,.38); }
    alb(g,'ELEVATION (a′b′)',-HW+2.0,HH-.35,0,COL.vp,3.0,.5,false,256);
    alb(g,'PLAN (ab)',-HW+1.4,-HH+.35,0,COL.hp,2.1,.5,false,256);
  }

  // Angle marks — each view's inclination to XY. A TRUE angle (θ when the FV is
  // true length, φ when the TV is) is drawn darkened/bold; apparent α/β are normal.
  if(!fvPoint && M.alpha>1.0){
    const V=A1[1]<=B1[1]?A1:B1, P=A1[1]<=B1[1]?B1:A1;
    markAngle(g,V,P,COL.vp, fvTrue?`θ=${M.theta.toFixed(0)}°`:`α=${M.alpha.toFixed(0)}°`, fvTrue);
  }
  if(!tvPoint && M.beta>1.0){
    const V=Math.abs(A2[1])<=Math.abs(B2[1])?A2:B2, P=Math.abs(A2[1])<=Math.abs(B2[1])?B2:A2;
    markAngle(g,V,P,COL.hp, tvTrue?`φ=${M.phi.toFixed(0)}°`:`β=${M.beta.toFixed(0)}°`, tvTrue);
  }

  // Dimensions — view lengths. The view that equals the True Length is tagged
  // "= TL" and darkened, so it is clear at a glance whether the elevation or the
  // plan carries the true length.
  if(tDims){
    if(!fvPoint){ const m=[(A1[0]+B1[0])/2,(A1[1]+B1[1])/2,0];
      alb(g,`${M.fvLen.toFixed(0)} mm${fvTrue?' = TL':''}`,m[0],m[1]+.6,0,fvTrue?mix(COL.vp,COL.ink,.55):COL.vp,fvTrue?2.5:1.7,.5,true,256); }
    if(!tvPoint){ const m=[(A2[0]+B2[0])/2,(A2[1]+B2[1])/2,0];
      alb(g,`${M.tvLen.toFixed(0)} mm${tvTrue?' = TL':''}`,m[0],m[1]-.6,0,tvTrue?mix(COL.hp,COL.ink,.55):COL.hp,tvTrue?2.5:1.7,.5,true,256); }
  }
}

// ═══════════════════════════════════════════════════════════════
// FOLD ANIMATION — REVERSIBLE. The engine hands us the freshly-cleared S3 group + ctx
// and runs our returned apply(p) on its timeline. Only hpGroup rotates about the X-axis;
// the camera never moves. Forward (flatten) swings HP +90° and dissolves the 3D depth
// cues to leave a clean orthographic sheet; reverse plays the same timeline backwards.
// ═══════════════════════════════════════════════════════════════
function buildAnimScene(g, ctx){
  const M = ctx.model, S = SHEET, lo = S*0.4;
  const cx=(M.A.x+M.B.x)/2;
  const ax=W(M.A.x-cx), bx=W(M.B.x-cx);
  const A=[ax,W(M.A.y),W(M.A.z)], B=[bx,W(M.B.y),W(M.B.z)];
  const aF=[ax,W(M.A.y),0], bF=[bx,W(M.B.y),0];
  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP (static) — borderless plane (faint fill + hued grid; matches draw3D → no jump)
  apl(g,S,COL.vp,.07,new THREE.Euler(),CALM_GRID);
  alb(g,'VP',-lo,lo,.05,COL.vp,2.0,.78);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);

  // Front view a'b' + connectors to XY (stay in z=0 plane) — KEEP
  asg(g,aF,bF,COL.vp,0);
  asg(g,aF,[ax,0,0],COL.vp,1); asg(g,bF,[bx,0,0],COL.vp,1);
  acr(g,aF[0],aF[1],0,.16,COL.vp,false,NOHALO); acr(g,bF[0],bF[1],0,.16,COL.vp,false,NOHALO);
  albBox(g,"a'",aF[0]-.34,aF[1]+.36,.05,COL.vp,.32); albBox(g,"b'",bF[0]+.34,bF[1]+.36,.05,COL.vp,.32);

  // Depth cues (FADE): the true line AB, endpoints, and the VP perpendicular projectors
  asgBold(g,A,B,COL.ink); fade.push(last());
  asp(g,A[0],A[1],A[2],.18,COL.ink,NOHALO); fade.push(last());
  asp(g,B[0],B[1],B[2],.18,COL.ink,NOHALO); fade.push(last());
  albBox(g,'A',A[0]-.32,A[1]+.36,A[2]+.15,COL.ink,.3); fade.push(last());
  albBox(g,'B',B[0]+.32,B[1]+.36,B[2]+.15,COL.ink,.3); fade.push(last());
  asg(g,A,aF,COL.vp,1); fade.push(last());
  asg(g,B,bF,COL.vp,1); fade.push(last());

  // True inclinations θ/φ in 3D — built identically to draw3D so the fold's first frame
  // equals the static scene (no pop), then FADED out with the line. grabFade() captures
  // every child angle3() adds (ref ray + arc + label) into the fade set.
  const dL=[B[0]-A[0],B[1]-A[1],B[2]-A[2]];
  const grabFade=fn=>{ const i0=g.children.length; fn(); for(let i=i0;i<g.children.length;i++) fade.push(g.children[i]); };
  if(M.theta>1 && M.theta<89.5)
    grabFade(()=>angle3(g,A,[dL[0],0,dL[2]],dL,1.4,mix(COL.hp,COL.ink,.42),`θ=${M.theta.toFixed(0)}°`));
  if(M.phi>1 && M.phi<89.5){
    const dB=[-dL[0],-dL[1],-dL[2]];
    grabFade(()=>angle3(g,B,[dB[0],dB[1],0],dB,1.4,mix(COL.vp,COL.ink,.42),`φ=${M.phi.toFixed(0)}°`));
  }

  // hpGroup (rotates about X): HP plane + top view ab + connectors to XY
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  apl(hpGroup,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0),CALM_GRID);        // borderless HP plane (fill + grid) folds together
  alb(hpGroup,'HP',-lo,-.3,lo,COL.hp,2.0,.78);
  const aT=[ax,0,W(M.A.z)], bT=[bx,0,W(M.B.z)];
  asg(hpGroup,aT,bT,COL.hp,0);
  asg(hpGroup,aT,[ax,0,0],COL.hp,0); asg(hpGroup,bT,[bx,0,0],COL.hp,0);
  acr(hpGroup,aT[0],0,aT[2],.16,COL.hp,true,NOHALO); acr(hpGroup,bT[0],0,bT[2],.16,COL.hp,true,NOHALO);
  albBox(hpGroup,'a',aT[0]-.34,.2,aT[2],COL.hp,.3); albBox(hpGroup,'b',bT[0]+.34,.2,bT[2],COL.hp,.3);

  // Dynamic HP perpendicular projectors (P→moving foot) — FADE
  const trackers=[{from:A,foot:aT},{from:B,foot:bT}].map(({from,foot})=>{
    const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from),new THREE.Vector3(...foot)]);
    const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
    line.computeLineDistances(); g.add(line); fade.push(line);
    const t=new THREE.Object3D(); t.position.set(...foot); hpGroup.add(t);
    return {geo,from,t};
  });

  // ── Folded-state annotations (orthographic sync): the SAME angle marks + length labels
  // the 2D Compare drawing (draw2D) shows, so the flattened 3D sheet matches it. Built in
  // world z=0 at the FINAL folded positions — the top view lands at y=−W(z) after the +90°
  // hinge (rotation about +X sends (x,0,z)→(x,−z,0)). Hidden until the views arrive, then
  // swept + faded in over the same window the 3D depth cues dissolve (re = 1 − op).
  const fvTrue=Math.abs(M.fvLen-M.tl)<0.5, tvTrue=Math.abs(M.tvLen-M.tl)<0.5;
  const fvPoint=M.fvLen<0.6, tvPoint=M.tvLen<0.6;
  const F1=[ax,W(M.A.y),0], F2=[bx,W(M.B.y),0];     // front view a'b' (above XY)
  const T1=[ax,-W(M.A.z),0], T2=[bx,-W(M.B.z),0];   // top view ab, post-fold (below XY)
  const reveal=[], revealOps=[];
  const foldAngle=(V,P,colHex,label,bold)=>{
    const col=bold?mix(colHex,COL.ink,0.55):colHex, r=0.9, tick=1.3, segs=24;
    const dx=P[0]-V[0], dy=P[1]-V[1], dir=Math.atan2(dy,dx), horiz=dx>=0?0:Math.PI;
    revealOps.push(asg(g,[V[0],V[1],0],[V[0]+Math.cos(horiz)*tick,V[1],0],col,1));   // dashed horizontal reference
    const aPts=s=>{ const n=Math.max(2,Math.ceil(segs*s)), flat=[];
      for(let i=0;i<=n;i++){ const a=horiz+(dir-horiz)*s*(i/n); flat.push(V[0]+Math.cos(a)*r,V[1]+Math.sin(a)*r,0); } return flat; };
    const arcLine=fatLine(g,aPts(1),col,bold?LW.arcBold:LW.arc,false); revealOps.push(arcLine);
    const mid=(horiz+dir)/2;
    revealOps.push(alb(g,label,V[0]+Math.cos(mid)*(r+0.7),V[1]+Math.sin(mid)*(r+0.55),0,col,1.7,0.46,true,256));
    reveal.push(s=>{ arcLine.geometry.setPositions(aPts(Math.max(s,1e-3))); arcLine.computeLineDistances(); });
  };
  if(!fvPoint && M.alpha>1.0){
    const V=F1[1]<=F2[1]?F1:F2, P=F1[1]<=F2[1]?F2:F1;
    foldAngle(V,P,COL.vp, fvTrue?`θ=${M.theta.toFixed(0)}°`:`α=${M.alpha.toFixed(0)}°`, fvTrue);
  }
  if(!tvPoint && M.beta>1.0){
    const V=Math.abs(T1[1])<=Math.abs(T2[1])?T1:T2, P=Math.abs(T1[1])<=Math.abs(T2[1])?T2:T1;
    foldAngle(V,P,COL.hp, tvTrue?`φ=${M.phi.toFixed(0)}°`:`β=${M.beta.toFixed(0)}°`, tvTrue);
  }
  if(tDims){
    if(!fvPoint){ const m=[(F1[0]+F2[0])/2,(F1[1]+F2[1])/2,0];
      revealOps.push(alb(g,`${M.fvLen.toFixed(0)} mm${fvTrue?' = TL':''}`,m[0],m[1]+.6,0,fvTrue?mix(COL.vp,COL.ink,.55):COL.vp,fvTrue?2.5:1.7,.5,true,256)); }
    if(!tvPoint){ const m=[(T1[0]+T2[0])/2,(T1[1]+T2[1])/2,0];
      revealOps.push(alb(g,`${M.tvLen.toFixed(0)} mm${tvTrue?' = TL':''}`,m[0],m[1]-.6,0,tvTrue?mix(COL.hp,COL.ink,.55):COL.hp,tvTrue?2.5:1.7,.5,true,256)); }
  }
  for(const o of revealOps){ if(o.material){ o.material.transparent=true; o.material.opacity=0; } else if(o.element){ o.element.style.opacity=0; } }

  for(const o of fade){ if(o.material) o.material.transparent=true; }

  const tmp=new THREE.Vector3();
  const apply=p=>{
    const { rot, op }=foldStateAt(p);
    hpGroup.rotation.x=rot;
    for(const o of fade){ if(o.material) o.material.opacity=op; else if(o.element) o.element.style.opacity=op; }
    for(const tr of trackers){ tr.t.getWorldPosition(tmp); tr.geo.setFromPoints([new THREE.Vector3(...tr.from),tmp.clone()]); }
    // Folded-state annotations rise as the depth cues dissolve (op:1→0 over the back of the
    // timeline), so re:0→1. Sweep the arcs and fade in the marks + length labels in lock-step.
    const re=easeOut(1-op);
    for(const o of revealOps){ if(o.material) o.material.opacity=re; else if(o.element) o.element.style.opacity=re; }
    for(const fn of reveal) fn(re);
    g.children.forEach(o=>{ if(o.isLine && o.material?.isLineDashedMaterial) o.computeLineDistances(); });
  };
  return { apply };
}

// ═══════════════════════════════════════════════════════════════
// CONSTRUCTION OVERLAYS — Traces (HT/VT) and the True-Length rotating-line method.
// Both are pure-2D constructions animated on the orthographic sheet (the engine's 2D
// scene, obtained via api.beginOverlay()), frozen when complete. Any rebuild() (slider,
// step nav, reset) tears them down via the engine's beforeRebuild hook.
// ═══════════════════════════════════════════════════════════════
const clamp01=x=>Math.min(1,Math.max(0,x));
const lc=(x,a,b)=>clamp01((x-a)/(b-a));
const lerp2=(P,Q,t)=>[P[0]+(Q[0]-P[0])*t, P[1]+(Q[1]-P[1])*t];
const easeOut=t=>1-Math.pow(1-t,3);

// Thin construction line (kept thin on purpose — these are drafting aids). Returns
// the THREE.Line; update its ends with setSeg / its arc with setArc.
function conLine(g,colHex,dashed){
  const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
  const mat=dashed?new THREE.LineDashedMaterial({color:new THREE.Color(colHex),dashSize:.16,gapSize:.12,transparent:true})
                  :new THREE.LineBasicMaterial({color:new THREE.Color(colHex),transparent:true});
  const l=new THREE.Line(geo,mat); g.add(l); return l;
}
function setSeg(l,a,b){ l.geometry.setFromPoints([new THREE.Vector3(a[0],a[1],a[2]||0),new THREE.Vector3(b[0],b[1],b[2]||0)]); if(l.material.isLineDashedMaterial) l.computeLineDistances(); }
function setArc(l,cx,cy,r,a0,a1){
  const n=Math.max(2,Math.ceil(Math.abs(a1-a0)/0.12)), pts=[];
  for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*i/n; pts.push(new THREE.Vector3(cx+Math.cos(a)*r,cy+Math.sin(a)*r,0)); }
  l.geometry.setFromPoints(pts); if(l.material.isLineDashedMaterial) l.computeLineDistances();
}
function setFat(line,a,b){ line.geometry.setPositions([a[0],a[1],a[2]||0,b[0],b[1],b[2]||0]); line.computeLineDistances(); }
function setOp(o,val){ o.traverse(c=>{ if(c.material){ c.material.transparent=true; c.material.opacity=val; } else if(c.element) c.element.style.opacity=val; }); }

// Marker = optional soft glow disc + a crisp cross + a boxed label, grouped at (x,y).
function conMarker(parent,x,y,colHex,txt,glow,h=0.3,dx=0.0,dy=0.42){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  if(glow){ const m=new THREE.Mesh(new THREE.CircleGeometry(0.3,28),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,opacity:.32,depthTest:false})); m.renderOrder=2; grp.add(m); }
  acr(grp,0,0,0,.16,colHex,false);
  if(txt) albBox(grp,txt,dx,dy,0,colHex,h);
  return grp;
}
function conLabel(parent,x,y,colHex,txt,h=0.34){ const grp=new THREE.Group(); parent.add(grp); albBox(grp,txt,x,y,0,colHex,h); return grp; }

// Small engineering circle (drafting point — a thin ring + a tiny centre dot), at
// roughly endpoint-marker scale. Used for HT / VT instead of a large filled blob.
function engCircle(parent,x,y,colHex,r=0.15){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  const n=36, flat=[]; for(let i=0;i<=n;i++){ const a=i/n*Math.PI*2; flat.push(Math.cos(a)*r,Math.sin(a)*r,0); }
  fatLine(grp,flat,colHex,2.0,false);
  const dot=new THREE.Mesh(new THREE.CircleGeometry(r*0.3,16),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,depthTest:false})); dot.renderOrder=3; grp.add(dot);
  return grp;
}
// Tiny filled point (for h / v on XY).
function smallDot(parent,x,y,colHex,r=0.07){
  const grp=new THREE.Group(); grp.position.set(x,y,0); parent.add(grp);
  const d=new THREE.Mesh(new THREE.CircleGeometry(r,18),new THREE.MeshBasicMaterial({color:new THREE.Color(colHex),transparent:true,depthTest:false})); d.renderOrder=3; grp.add(d);
  return grp;
}
// Right-angle (⊥) symbol where a projector crosses XY at (x,0). down=true opens into
// HP (−y, for HT); down=false opens into VP (+y, for VT).
function raSymbol(parent,x,down,colHex,s=0.2){
  const grp=new THREE.Group(); parent.add(grp);
  const dy=down?-s:s;
  fatLine(grp,[x+s,0,0, x+s,dy,0, x,dy,0],colHex,1.7,false);
  return grp;
}

// Reusable sheet pieces (frame + the two views) so overlays match draw2D exactly.
function drawSheetFrame(g,L){
  const {HW,HH}=L;
  alp(g,[[-HW-.3,-HH-.3,0],[HW+.3,-HH-.3,0],[HW+.3,HH+.3,0],[-HW-.3,HH+.3,0]],COL.border);
  asg(g,[-HW-.3,0,0],[HW+.3,0,0],COL.ink,0);
  if(tLabels){
    alb(g,'x',-HW-.05,.38,0,COL.ink,.85,.72,false,128); alb(g,'y',HW+.05,.38,0,COL.ink,.85,.72,false,128);
    alb(g,'VP',-HW+.5,2.4,0,COL.vp,1.5,.9,false,128); alb(g,'HP',-HW+.5,-2.4,0,COL.hp,1.5,.9,false,128);
  }
}
function drawSheetViews(g,M,L){
  const {A1,B1,A2,B2,fvTrue,tvTrue,fvPoint,tvPoint}=L;
  if(tProj){ asg(g,[A1[0],A1[1],0],[A2[0],A2[1],0],COL.bench,1); asg(g,[B1[0],B1[1],0],[B2[0],B2[1],0],COL.bench,1); }
  if(fvPoint){ acr(g,A1[0],A1[1],0,.2,COL.vp,false,NOHALO); }
  else { fvTrue?asgBold(g,A1,B1,COL.vp):asg(g,A1,B1,COL.vp,0); acr(g,A1[0],A1[1],0,.16,COL.vp,false,NOHALO); acr(g,B1[0],B1[1],0,.16,COL.vp,false,NOHALO); }
  if(tvPoint){ acr(g,A2[0],A2[1],0,.2,COL.hp,false,NOHALO); }
  else { tvTrue?asgBold(g,A2,B2,COL.hp):asg(g,A2,B2,COL.hp,0); acr(g,A2[0],A2[1],0,.16,COL.hp,false,NOHALO); acr(g,B2[0],B2[1],0,.16,COL.hp,false,NOHALO); }
  if(tLabels){
    if(fvPoint) albBox(g,"a'b'",A1[0]+.58,A1[1]+.48,0,COL.vp,.34);
    else { albBox(g,"a'",A1[0]-.45,A1[1]+.45,0,COL.vp,.32); albBox(g,"b'",B1[0]+.45,B1[1]+.45,0,COL.vp,.32); }
    if(tvPoint) albBox(g,'ab',A2[0]+.58,A2[1]-.48,0,COL.hp,.34);
    else { albBox(g,'a',A2[0]-.45,A2[1]-.45,0,COL.hp,.32); albBox(g,'b',B2[0]+.45,B2[1]-.45,0,COL.hp,.32); }
  }
}

// Clear the 2D scene and prepare it for an overlay build. The engine's beginOverlay()
// disposes S2's children, primes the fat-line registry + resolution to S2, and returns
// its group, so the construction draws with the exported helpers exactly like draw2D.
function beginConScene(){ return api.beginOverlay(); }

// ── Mode lifecycle ────────────────────────────────────────────
// The launchers are disclosure toggles: expose both pressed (on/off) and expanded
// (panel shown) so screen readers announce state on activation.
function setConBtn(id,on){ const b=$(id); if(!b) return; b.classList.toggle('on',on); b.setAttribute('aria-pressed',String(on)); b.setAttribute('aria-expanded',String(on)); }
// Single source of truth for the play/pause control's label, icon, and state.
function setPlayBtn(playing){ const b=$('tl-play'); if(!b) return; b.textContent=playing?'⏸':'▶'; b.setAttribute('aria-label',playing?'Pause construction':'Play construction'); b.setAttribute('aria-pressed',String(playing)); }
function teardownConUI(){
  cancelAnimationFrame(conRAF); conRAF=null; conApply=null;
  tlPlaying=false; conMode=null; tShow3DTraces=false;
  setConBtn('btn-traces',false); setConBtn('btn-tl',false);
  const tp=$('traces-panel'); if(tp) tp.hidden=true;
  const lp=$('tl-panel'); if(lp) lp.hidden=true;
  setPlayBtn(false);
}
function exitCon(){ teardownConUI(); api.rebuild(api.getData()); }
// Used by value-editing controls (sliders / number fields / toggles). Routes through the engine's
// editRebuild so an edit keeps the downstream geometry live and surfaces the "Unfolded to 3D…" note
// if the sheet was folded flat. If a construction overlay (Traces / True-Length) is open, editing
// tears it down — these are animated derivations that can't update live, so say so with a VISIBLE
// note (not screen-reader-only), rather than letting the drawing vanish without explanation.
function rebuildFromEdit(d){
  const wasCon=conMode;
  api.editRebuild(d);
  if(wasCon){
    const m='Construction closed — now showing live values. Reopen Traces or True Length to rebuild it.';
    flowNote(m); announce(m);
  }
}
function runConAnim(dur){
  cancelAnimationFrame(conRAF);
  const start=performance.now();
  const step=now=>{ const t=Math.min((now-start)/dur,1); conApply && conApply(t); if(t<1) conRAF=requestAnimationFrame(step); };
  conRAF=requestAnimationFrame(step);
}

// ── Traces (HT / VT) ──────────────────────────────────────────
function xAtY(P,Q,y){ const dy=Q[1]-P[1]; if(Math.abs(dy)<1e-4) return null; return P[0]+(Q[0]-P[0])*(y-P[1])/dy; }
function yAtX(P,Q,x){ const dx=Q[0]-P[0]; if(Math.abs(dx)<1e-4) return null; return P[1]+(Q[1]-P[1])*(x-P[0])/dx; }
function computeTraces(L){
  const {A1,B1,A2,B2}=L;
  let h=null,HT=null,v=null,VT=null;
  const xh=xAtY(A1,B1,0);                                  // FV produced → XY
  if(xh!==null){ h=[xh,0]; let y=yAtX(A2,B2,xh); if(y===null) y=A2[1]; HT=[xh,y]; }
  const xv=xAtY(A2,B2,0);                                  // TV produced → XY
  if(xv!==null){ v=[xv,0]; let y=yAtX(A1,B1,xv); if(y===null) y=A1[1]; VT=[xv,y]; }
  return { h,HT,v,VT, noHT:!HT, noVT:!VT };
}
function enterTrace(){
  if(conMode==='trace') return;
  teardownConUI();
  // Arm the live-3D HT/VT markers BEFORE the rebuild — conMode is still null here, so the
  // beforeRebuild teardown is a no-op and this rebuild draws S3 *with* the 3D traces. (conMode
  // is set to 'trace' only AFTER, so a stray rebuild before then can't tear the new UI down.)
  tShow3DTraces=true;
  api.rebuild(api.getData());          // restore clean scenes first (also clears the fold)
  conMode='trace';
  api.compare.show('expanded');         // open the Compare card (expanded → docked side-by-side split)
  setConBtn('btn-traces',true);
  $('traces-panel').hidden=false;
  buildTraceScene();
  // Reduced motion: skip the construction tween, show the finished traces at once
  // (the lesson still updates — only the animation is suppressed).
  reduceMotion.matches ? conApply(1) : runConAnim(5400);
}
// Standard EG trace construction (per view): SOLID original projection (drawn by
// drawSheetViews) → DASHED extension to XY at h/v → DASHED perpendicular projector
// (slightly darker) with a ⊥ symbol → DASHED extension of the OTHER view → the
// small engineering-circle trace (HT teal / VT amber) at the intersection.
function buildTraceScene(){
  const M=resolveLine(api.getData()), L=sheet2D(M), g=beginConScene();
  drawSheetFrame(g,L); drawSheetViews(g,M,L);
  const {A1,B1,A2,B2}=L, T=computeTraces(L), cap=$('trace-cap');
  const PCOL=mix(COL.construct,COL.ink,0.5);     // projector: darker than extensions
  const both=!T.noHT && !T.noVT;

  const feNear=Math.abs(A1[1])<=Math.abs(B1[1])?A1:B1;   // FV end nearest XY → starts the extension
  const teNear=Math.abs(A2[1])<=Math.abs(B2[1])?A2:B2;

  let extFV,projHT,tvExt,hG,htG,raH, extTV,projVT,fvExt,vG,vtG,raV, tvNear,fvNear;
  if(!T.noHT){
    tvNear=Math.abs(A2[0]-T.HT[0])<=Math.abs(B2[0]-T.HT[0])?A2:B2;   // TV end nearest HT
    extFV=conLine(g,COL.construct,true);
    projHT=conLine(g,PCOL,true);
    tvExt=conLine(g,COL.construct,true);
    raH=raSymbol(g,T.h[0],true,PCOL);
    hG=smallDot(g,T.h[0],T.h[1],COL.ink); albBox(hG,'h',0,-0.34,0,COL.ink,.26);
    htG=engCircle(g,T.HT[0],T.HT[1],COL.hp,.15); albBox(htG,'HT',0.46,-0.04,0,COL.hp,.3);
  }
  if(!T.noVT){
    fvNear=Math.abs(A1[0]-T.VT[0])<=Math.abs(B1[0]-T.VT[0])?A1:B1;
    extTV=conLine(g,COL.construct,true);
    projVT=conLine(g,PCOL,true);
    fvExt=conLine(g,COL.construct,true);
    raV=raSymbol(g,T.v[0],false,PCOL);
    vG=smallDot(g,T.v[0],T.v[1],COL.ink); albBox(vG,'v',0,0.34,0,COL.ink,.26);
    vtG=engCircle(g,T.VT[0],T.VT[1],COL.vp,.15); albBox(vtG,'VT',0.5,0.04,0,COL.vp,.3);
  }

  // Six-step windows (extend · find h/v · perpendicular projector · extend other
  // view · reveal trace). `both` runs HT then VT; a lone trace gets the full span.
  const HT_E=both?[0,.12]:[0,.16], HT_P=both?[.14,.26]:[.18,.42],
        HT_X=both?[.27,.39]:[.44,.66], HT_R=both?.42:.74;
  const VT_E=both?[.50,.62]:[0,.16], VT_P=both?[.64,.76]:[.18,.42],
        VT_X=both?[.77,.89]:[.44,.66], VT_R=both?.92:.74;

  conApply = prog=>{
    if(!T.noHT){
      setSeg(extFV, feNear, lerp2(feNear,T.h, easeOut(lc(prog,HT_E[0],HT_E[1])))); setOp(extFV, prog>HT_E[0]?1:0);
      setOp(hG, lc(prog,HT_E[1]-.03,HT_E[1]+.03));
      setSeg(projHT, T.h, [T.h[0], T.h[1]+(T.HT[1]-T.h[1])*easeOut(lc(prog,HT_P[0],HT_P[1]))]); setOp(projHT, prog>=HT_P[0]?1:0);
      setOp(raH, lc(prog,HT_P[0]+.02,HT_P[0]+.08));
      setSeg(tvExt, tvNear, lerp2(tvNear,T.HT, easeOut(lc(prog,HT_X[0],HT_X[1])))); setOp(tvExt, prog>=HT_X[0]?1:0);
      setOp(htG, lc(prog,HT_R-.02,HT_R+.05));
    }
    if(!T.noVT){
      setSeg(extTV, teNear, lerp2(teNear,T.v, easeOut(lc(prog,VT_E[0],VT_E[1])))); setOp(extTV, prog>VT_E[0]?1:0);
      setOp(vG, lc(prog,VT_E[1]-.03,VT_E[1]+.03));
      setSeg(projVT, T.v, [T.v[0], T.v[1]+(T.VT[1]-T.v[1])*easeOut(lc(prog,VT_P[0],VT_P[1]))]); setOp(projVT, prog>=VT_P[0]?1:0);
      setOp(raV, lc(prog,VT_P[0]+.02,VT_P[0]+.08));
      setSeg(fvExt, fvNear, lerp2(fvNear,T.VT, easeOut(lc(prog,VT_X[0],VT_X[1])))); setOp(fvExt, prog>=VT_X[0]?1:0);
      setOp(vtG, lc(prog,VT_R-.02,VT_R+.05));
    }
    let msg;
    if(T.noHT&&T.noVT) msg='Line ∥ to both planes — it has no traces.';
    else if(both){
      if(prog<HT_P[0]) msg='Extend the front view to XY → h';
      else if(prog<HT_X[0]) msg='From h, drop a projector ⊥ to XY';
      else if(prog<HT_R) msg='Extend the top view to meet the projector';
      else if(prog<VT_E[0]) msg='HT — front view extension meets the top view';
      else if(prog<VT_P[0]) msg='Extend the top view to XY → v';
      else if(prog<VT_X[0]) msg='From v, raise a projector ⊥ to XY';
      else if(prog<VT_R) msg='Extend the front view to meet the projector';
      else msg='VT — top view extension meets the front view';
    } else if(!T.noHT){
      msg = prog<HT_P[0] ? 'Extend the front view to XY → h'
          : prog<HT_X[0] ? 'From h, drop a projector ⊥ to XY'
          : prog<HT_R    ? 'Extend the top view to meet the projector'
          : 'HT found · line ∥ VP, so there is no VT';
    } else {
      msg = prog<VT_P[0] ? 'Extend the top view to XY → v'
          : prog<VT_X[0] ? 'From v, raise a projector ⊥ to XY'
          : prog<VT_R    ? 'Extend the front view to meet the projector'
          : 'VT found · line ∥ HP, so there is no HT';
    }
    if(cap && cap.textContent!==msg) cap.textContent=msg;
  };
  conApply(0);
}

// ── True Length & Angles (Rotating-Line method) ───────────────
const TL_N = 12, TL_PHASE_MS = 1150;
const TL_STEP_TEXT = [
  'Step 1 · Rotate the top view about a until it is parallel to XY.',
  'Step 2 · Draw the locus arc swept by the rotated end.',
  'Step 3 · Project the rotated end upward.',
  'Step 4 · Meet the horizontal locus of the front-view end → b₁′.',
  'Step 5 · Join a′–b₁′ — this is the True Length.',
  'Step 6 · Measure θ — the true inclination with HP.',
  'Step 1 · Rotate the front view about a until it is parallel to XY.',
  'Step 2 · Draw the locus arc swept by the rotated end.',
  'Step 3 · Project the rotated end downward.',
  'Step 4 · Meet the horizontal locus of the top-view end → b₁.',
  'Step 5 · Join a–b₁ — the True Length (same value).',
  'Step 6 · Measure φ — the true inclination with VP.',
];
function setTLCaption(){
  // Only write when the text actually changes — these are aria-live regions and
  // applyTLState runs every frame during play; re-setting identical text re-announces.
  const c=$('tl-cap'), s=$('tl-step');
  const cap = tlPhase<6 ? 'Part A — Top-View Rotation → TL & θ' : 'Part B — Front-View Rotation → TL & φ';
  if(c && c.textContent!==cap) c.textContent=cap;
  const st = TL_STEP_TEXT[tlPhase];
  if(s && s.textContent!==st) s.textContent=st;
}
function enterTL(){
  if(conMode==='tl') return;
  teardownConUI();
  api.rebuild(api.getData());
  conMode='tl';
  api.compare.show('expanded');         // open the Compare card (expanded) for the construction
  setConBtn('btn-tl',true);
  $('tl-panel').hidden=false;
  buildTLScene();
  tlPhase=0; tlPhaseT=0; tlPlaying=false; setPlayBtn(false);
  applyTLState();
}
function buildTLScene(){
  const M=resolveLine(api.getData()), L=sheet2D(M), g=beginConScene();
  drawSheetFrame(g,L);

  const {A1,B1,A2,B2}=L;
  const pivotIsA = A1[0]<=B1[0];
  const fvPiv=pivotIsA?A1:B1, fvOth=pivotIsA?B1:A1;
  const tvPiv=pivotIsA?A2:B2, tvOth=pivotIsA?B2:A2;
  const pivX=fvPiv[0];
  const Lplan=Math.hypot(tvOth[0]-tvPiv[0],tvOth[1]-tvPiv[1]);
  const Lelev=Math.hypot(fvOth[0]-fvPiv[0],fvOth[1]-fvPiv[1]);
  const tvRot=[pivX+Lplan,tvPiv[1]], fvRot=[pivX+Lelev,fvPiv[1]];
  const bTLA=[pivX+Lplan,fvOth[1]],  bTLB=[pivX+Lelev,tvOth[1]];
  const startA=Math.atan2(tvOth[1]-tvPiv[1],tvOth[0]-tvPiv[0]);
  const startB=Math.atan2(fvOth[1]-fvPiv[1],fvOth[0]-fvPiv[0]);

  // Fit everything (incl. the rightward rotation extents) into the sheet. Scale is
  // uniform about the origin so XY (y=0) stays put; only x is recentred.
  const xs=[pivX,fvOth[0],tvRot[0],fvRot[0],-L.HW*0.5], ys=[fvPiv[1],fvOth[1],tvPiv[1],tvOth[1]];
  const maxX=Math.max(...xs), minX=Math.min(...xs), maxAbsY=Math.max(...ys.map(Math.abs),0.5);
  const s=Math.min(1,(2*L.HW*0.9)/Math.max(maxX-minX,0.5),(L.HH*0.92)/maxAbsY);
  const root=new THREE.Group(); g.add(root);
  root.scale.set(s,s,1); root.position.set(-s*(minX+maxX)/2,0,0);
  drawSheetViews(root,M,L);

  // Part A elements
  const rotTV=conLine(root,COL.hp,false);
  const arcA =conLine(root,COL.locus,false);
  const projA=conLine(root,COL.construct,true);
  const fvLoc=conLine(root,COL.locus,true);
  const markA=conMarker(root,bTLA[0],bTLA[1],COL.tlg,'b₁′',false,.3,.34,.0);
  const tlA  =fatLine(root,[fvPiv[0],fvPiv[1],0,bTLA[0],bTLA[1],0],COL.tlg,LW.bold,false);
  const thetaA=conLine(root,COL.tlg,false);
  const dirA=Math.atan2(bTLA[1]-fvPiv[1],bTLA[0]-fvPiv[0]);
  const thLbl=conLabel(root,fvPiv[0]+Math.cos(dirA/2)*1.15,fvPiv[1]+Math.sin(dirA/2)*1.0,COL.tlg,`θ=${M.theta.toFixed(0)}°`,.34);
  const tlLblA=conLabel(root,(fvPiv[0]+bTLA[0])/2,(fvPiv[1]+bTLA[1])/2+.55,COL.tlg,`TL ${M.tl.toFixed(0)}`,.34);

  // Part B elements
  const rotFV=conLine(root,COL.vp,false);
  const arcB =conLine(root,COL.locus,false);
  const projB=conLine(root,COL.construct,true);
  const tvLoc=conLine(root,COL.locus,true);
  const markB=conMarker(root,bTLB[0],bTLB[1],COL.tlg,'b₁',false,.3,.34,.0);
  const tlB  =fatLine(root,[tvPiv[0],tvPiv[1],0,bTLB[0],bTLB[1],0],COL.tlg,LW.bold,false);
  const phiB =conLine(root,COL.tlg,false);
  const dirB=Math.atan2(bTLB[1]-tvPiv[1],bTLB[0]-tvPiv[0]);
  const phLbl=conLabel(root,tvPiv[0]+Math.cos(dirB/2)*1.15,tvPiv[1]+Math.sin(dirB/2)*1.0,COL.tlg,`φ=${M.phi.toFixed(0)}°`,.34);
  const tlLblB=conLabel(root,(tvPiv[0]+bTLB[0])/2,(tvPiv[1]+bTLB[1])/2-.55,COL.tlg,`TL ${M.tl.toFixed(0)}`,.34);

  const aidsA=[rotTV,arcA,projA,fvLoc], aidsB=[rotFV,arcB,projB,tvLoc];

  conApply = p=>{
    const G=p*TL_N;
    // ---- Part A ----
    { const t=easeOut(lc(G,0,1)), ang=startA+(0-startA)*t;
      setSeg(rotTV,tvPiv,[tvPiv[0]+Math.cos(ang)*Lplan,tvPiv[1]+Math.sin(ang)*Lplan]); setOp(rotTV,G>0?1:0); }
    { const t=easeOut(lc(G,1,2)); setArc(arcA,tvPiv[0],tvPiv[1],Lplan,startA,startA+(0-startA)*t); setOp(arcA,G>=1?1:0); }
    { const t=easeOut(lc(G,2,3)); setSeg(projA,tvRot,[tvRot[0],tvRot[1]+(bTLA[1]-tvRot[1])*t]); setOp(projA,G>=2?1:0);
      setSeg(fvLoc,[fvOth[0],fvOth[1]],[bTLA[0],fvOth[1]]); setOp(fvLoc,lc(G,2.5,3.2)); }
    setOp(markA,lc(G,3,3.5));
    { const t=easeOut(lc(G,4,5)); setFat(tlA,fvPiv,lerp2(fvPiv,bTLA,t)); setOp(tlA,G>=4?1:0); }
    setArc(thetaA,fvPiv[0],fvPiv[1],0.8,0,dirA); setOp(thetaA,lc(G,5,5.4));
    setOp(thLbl,lc(G,5,5.6)); setOp(tlLblA,lc(G,4.3,4.9));
    // ---- Part B ----
    { const t=easeOut(lc(G,6,7)), ang=startB+(0-startB)*t;
      setSeg(rotFV,fvPiv,[fvPiv[0]+Math.cos(ang)*Lelev,fvPiv[1]+Math.sin(ang)*Lelev]); setOp(rotFV,G>=6?1:0); }
    { const t=easeOut(lc(G,7,8)); setArc(arcB,fvPiv[0],fvPiv[1],Lelev,startB,startB+(0-startB)*t); setOp(arcB,G>=7?1:0); }
    { const t=easeOut(lc(G,8,9)); setSeg(projB,fvRot,[fvRot[0],fvRot[1]+(bTLB[1]-fvRot[1])*t]); setOp(projB,G>=8?1:0);
      setSeg(tvLoc,[tvOth[0],tvOth[1]],[bTLB[0],tvOth[1]]); setOp(tvLoc,lc(G,8.5,9.2)); }
    setOp(markB,lc(G,9,9.5));
    { const t=easeOut(lc(G,10,11)); setFat(tlB,tvPiv,lerp2(tvPiv,bTLB,t)); setOp(tlB,G>=10?1:0); }
    setArc(phiB,tvPiv[0],tvPiv[1],0.8,0,dirB); setOp(phiB,lc(G,11,11.4));
    setOp(phLbl,lc(G,11,11.6)); setOp(tlLblB,lc(G,10.3,10.9));
    // Part B started → dim the Part A aids so the sheet stays readable
    if(G>=6){ aidsA.forEach(o=>setOp(o,.18)); }
    if(G< 6){ aidsB.forEach(o=>setOp(o,0)); markB.children&&setOp(markB,0); setOp(tlB,0); setOp(phiB,0); setOp(phLbl,0); setOp(tlLblB,0); }
  };
  conApply(0);
}
function applyTLState(){ const p=(tlPhase+tlPhaseT)/TL_N; conApply && conApply(p); setTLCaption(); }
function tlLoop(now){
  if(conMode!=='tl'||!tlPlaying) return;
  const dt=Math.min(now-tlPrevTime,50); tlPrevTime=now;
  tlPhaseT += dt/TL_PHASE_MS;
  if(tlPhaseT>=1){
    if(tlPhase>=TL_N-1){ tlPhaseT=1; tlPlaying=false; setPlayBtn(false); applyTLState(); return; }
    tlPhase++; tlPhaseT=0;
  }
  applyTLState();
  conRAF=requestAnimationFrame(tlLoop);
}
function playTL(){
  if(conMode!=='tl') return;
  // Reduced motion: no continuous play — jump to the completed construction. The
  // learner reviews it step-by-step with the (instant) Previous / Next controls.
  if(reduceMotion.matches){ tlPhase=TL_N-1; tlPhaseT=1; applyTLState(); return; }
  if(tlPhase>=TL_N-1&&tlPhaseT>=1){ tlPhase=0; tlPhaseT=0; }
  tlPlaying=true; setPlayBtn(true); tlPrevTime=performance.now(); cancelAnimationFrame(conRAF); conRAF=requestAnimationFrame(tlLoop);
}
function pauseTL(){ tlPlaying=false; setPlayBtn(false); cancelAnimationFrame(conRAF); }
function stepTL(dir){
  pauseTL();
  if(dir>0){ if(tlPhaseT<1) tlPhaseT=1; else if(tlPhase<TL_N-1){ tlPhase++; tlPhaseT=1; } }
  else { if(tlPhase>0){ tlPhase--; tlPhaseT=1; } else tlPhaseT=0; }
  applyTLState();
}

// ── Lines-only geometry helpers ───────────────────────────────
// True Length is drawn as ONE dark line (a single stroke darkened toward ink) — never
// multi-stroke — so it reads as a single clean bold line in 3D and in 2D.
function asgBold(g,a,b,colHex){
  return fatLine(g,[a[0],a[1],a[2]||0, b[0],b[1],b[2]||0], mix(colHex,COL.ink,0.55), LW.bold, false);
}
// True Length as a 3D dimension: a thin offset line parallel to AB with a witness line at each
// end and a 45° architect's tick where each meets the dim line — the blueprint "←120→" read —
// plus the value at mid. Drawn quiet (ink-secondary, thin LW.ref) so it annotates without
// competing with the bold rod. Replaces the old floating "TL nn" label; still gated by tDims.
function drawTLDim3D(g,A,B,M){
  const a=new THREE.Vector3(...A), b=new THREE.Vector3(...B);
  const d=b.clone().sub(a); if(d.lengthSq()<1e-6) return; d.normalize();
  let up=new THREE.Vector3(0,1,0);
  if(Math.abs(d.dot(up))>0.95) up.set(1,0,0);                    // rod near-vertical → offset sideways instead
  const side=new THREE.Vector3().crossVectors(d,up).normalize();
  const OFF=0.95, TICK=0.22, col=COL.ink2;
  const off=side.clone().multiplyScalar(OFF);
  const a2=a.clone().add(off), b2=b.clone().add(off);
  const seg=(p,q)=>asg(g,[p.x,p.y,p.z],[q.x,q.y,q.z],col,0,LW.ref);
  seg(a,a2); seg(b,b2);                                          // witness lines (rod end → dim line)
  seg(a2,b2);                                                    // the dimension line itself
  const slash=d.clone().add(side).normalize().multiplyScalar(TICK);
  seg(a2.clone().sub(slash),a2.clone().add(slash));             // 45° ticks at each end
  seg(b2.clone().sub(slash),b2.clone().add(slash));
  const mid=a2.clone().add(b2).multiplyScalar(0.5).add(side.clone().multiplyScalar(0.45));
  alb(g,`TL = ${M.tl.toFixed(0)}`,mid.x,mid.y,mid.z,COL.ink,1.7,.4,true);
}
// On-sheet HT/VT pierce points in centred world coords. A trace is where the rod AB *extended*
// pierces a reference plane: HT through HP (y=0), VT through VP (z=0). A near-parallel rod pierces
// far off the sheet, so a trace landing outside the SHEET bounds is returned null (it would
// otherwise fling the marker off-glass). Shared by drawTraces3D (the markers) and the cfg.contentBox
// (so the auto-zoom widens to frame the traces while they are shown). Coords mirror draw3D.
function traces3DPoints(M){
  const cx=(M.A.x+M.B.x)/2, lim=SHEET/2;
  const A=[W(M.A.x-cx),W(M.A.y),W(M.A.z)], B=[W(M.B.x-cx),W(M.B.y),W(M.B.z)];
  const onSheet=P=>Math.abs(P[0])<=lim && Math.abs(P[1])<=lim && Math.abs(P[2])<=lim;
  // Pierce point of AB with the plane where world-axis k hits 0 (1=y→HP, 2=z→VP). null if ∥.
  const pierce=k=>{
    const a=A[k], b=B[k];
    if(Math.abs(a-b)<1e-4) return null;
    const t=a/(a-b);
    return [A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t];
  };
  let HT=pierce(1); if(HT){ HT[1]=0; if(!onSheet(HT)) HT=null; }   // clamp exactly onto HP
  let VT=pierce(2); if(VT){ VT[2]=0; if(!onSheet(VT)) VT=null; }   // clamp exactly onto VP
  return { A, B, HT, VT };
}
// HT/VT markers in the live 3D scene (armed only while the Traces walkthrough is open). Each is a
// filled disc in its plane + a dashed rod-extension from the nearer end to the pierce point + a
// labelled chip, in the matching plane colour (teal HT on HP, amber VT on VP). No new primitives.
function drawTraces3D(g,M){
  const { A, B, HT, VT }=traces3DPoints(M);
  const near=P=>{
    const dA=(P[0]-A[0])**2+(P[1]-A[1])**2+(P[2]-A[2])**2;
    const dB=(P[0]-B[0])**2+(P[1]-B[1])**2+(P[2]-B[2])**2;
    return dA<=dB?A:B;
  };
  if(HT){
    asg(g,near(HT),HT,COL.construct,1);                          // dashed rod-extension to the pierce point
    acr(g,HT[0],0,HT[2],.17,COL.hp,true,NOHALO);                // teal disc in HP's XZ plane
    if(tLabels) albBox(g,'HT',HT[0]+.36,.2,HT[2],COL.hp,.32);
  }
  if(VT){
    asg(g,near(VT),VT,COL.construct,1);
    acr(g,VT[0],VT[1],0,.17,COL.vp,false,NOHALO);               // amber disc in VP's z=0 plane
    if(tLabels) albBox(g,'VT',VT[0]+.36,VT[1]+.36,0,COL.vp,.32);
  }
}
// A 3D angle mark: a dashed reference ray from C along refDir, an arc swung to lineDir,
// and a label at the mid-angle — used to show θ (with HP) and φ (with VP). The arc is
// registered as a sweeper (addSweep) so it grows from the reference ray to the line on a
// step reveal; on a plain rebuild (slider drag) it renders at full.
function angle3(g,C,refDir,lineDir,len,colHex,label){
  const c=new THREE.Vector3(...C);
  const ref=new THREE.Vector3(...refDir); if(ref.lengthSq()<1e-6) return; ref.normalize();
  const ld=new THREE.Vector3(...lineDir); if(ld.lengthSq()<1e-6) return; ld.normalize();
  const axis=new THREE.Vector3().crossVectors(ref,ld); if(axis.lengthSq()<1e-6) return; axis.normalize();
  const refEnd=c.clone().add(ref.clone().multiplyScalar(len));
  asg(g,[c.x,c.y,c.z],[refEnd.x,refEnd.y,refEnd.z],colHex,1,LW.ref);     // dashed reference ray
  const r=len*0.62, ang=ref.angleTo(ld), segs=24;
  // Partial arc from the reference ray up to fraction t of the full sweep.
  const pts=t=>{ const n=Math.max(2,Math.ceil(segs*t)), flat=[];
    for(let i=0;i<=n;i++){ const q=new THREE.Quaternion().setFromAxisAngle(axis,ang*t*i/n); const p=c.clone().add(ref.clone().multiplyScalar(r).applyQuaternion(q)); flat.push(p.x,p.y,p.z); }
    return flat; };
  const arcLine=fatLine(g,pts(1),colHex,LW.arc,false);
  addSweep(t=>{ arcLine.geometry.setPositions(pts(t)); arcLine.computeLineDistances(); });
  const qm=new THREE.Quaternion().setFromAxisAngle(axis,ang*0.5);
  const lp=c.clone().add(ref.clone().multiplyScalar(r+0.6).applyQuaternion(qm));
  alb(g,label,lp.x,lp.y,lp.z,colHex,1.6,.44,true,256);
}
// Arc in the z=0 plane (for angle marks). bold → thicker + darkened. Registered as a sweeper
// (addSweep) so the 2D angle arc grows from a0 to a1 when the Compare card opens; a plain
// in-card rebuild renders it at full. Returns the Line2 so callers can drive it themselves.
function arc(g,cx,cy,r,a0,a1,colHex,bold){
  const segs=28;
  const pts=t=>{ const n=Math.max(2,Math.ceil(segs*t)), flat=[];
    for(let i=0;i<=n;i++){ const a=a0+(a1-a0)*t*(i/n); flat.push(cx+Math.cos(a)*r,cy+Math.sin(a)*r,0); }
    return flat; };
  const line=fatLine(g,pts(1),colHex,bold?LW.arcBold:LW.arc,false);
  addSweep(t=>{ line.geometry.setPositions(pts(t)); line.computeLineDistances(); });
  return line;
}
// Mark the angle a 2D view makes with XY: dashed horizontal reference at the vertex,
// an arc up/down to the view line, and a "θ=..°"/"α=..°" label. bold=true (a TRUE
// angle) draws it darkened so it stands out.
function markAngle(g,V,P,colHex,label,bold){
  const dx=P[0]-V[0], dy=P[1]-V[1];
  const dir=Math.atan2(dy,dx), horiz=dx>=0?0:Math.PI;
  const col=bold?mix(colHex,COL.ink,0.55):colHex, r=0.9, tick=1.3;
  asg(g,[V[0],V[1],0],[V[0]+Math.cos(horiz)*tick,V[1],0],col,1);   // dashed horizontal reference
  arc(g,V[0],V[1],r,horiz,dir,col,bold);
  const mid=(horiz+dir)/2;
  alb(g,label,V[0]+Math.cos(mid)*(r+0.7),V[1]+Math.sin(mid)*(r+0.55),0,col,1.7,0.46,true,256);
}

// ── Sliders / readout / SR mirror (afterRebuild) ──────────────
function syncUI(d,M){
  setRange('r-tl','n-tl',d.TL, v=>`${v} millimetres true length`,'mm');
  setRange('r-th','n-th',d.theta, v=>`${v} degrees, inclination with HP`);
  setRange('r-ph','n-ph',d.phi, v=>`${v} degrees, inclination with VP`);
  setRange('r-ahp','n-ahp',d.aHP, v=>`${v} millimetres, end A above HP`,'mm');
  setRange('r-avp','n-avp',d.aVP, v=>`${v} millimetres, end A in front of VP`,'mm');
  setNote('note-valid', d.case===LineCase.INCL_BOTH && !M.valid
    ? 'θ + φ must stay ≤ 90° for a real line. Reduce one angle.' : '');
}
function updateReadout(d,M){
  const set=(id,txt)=>{ const e=$(id); if(e) e.textContent=txt; };
  const near=(a,b)=>Math.abs(a-b)<0.5;
  set('val-tl',`${M.tl.toFixed(0)} mm`);
  set('val-fv',`${M.fvLen.toFixed(0)} mm`);
  set('val-tv',`${M.tvLen.toFixed(0)} mm`);
  set('val-th',`${M.theta.toFixed(0)}°`);
  set('val-ph',`${M.phi.toFixed(0)}°`);
  set('val-al',`${M.alpha.toFixed(0)}°`);
  set('val-be',`${M.beta.toFixed(0)}°`);
  $('val-fv')?.parentElement.classList.toggle('hot',near(M.fvLen,M.tl));
  $('val-tv')?.parentElement.classList.toggle('hot',near(M.tvLen,M.tl));
  const both=d.case===LineCase.INCL_BOTH;
  $('row-al')?.classList.toggle('hot',both); $('row-be')?.classList.toggle('hot',both);
}
// Show / hide the Readout HUD WITHOUT a rebuild. A rebuild would tear down a folded sheet (the
// engine restores the live 3D scene on every rebuild), so the chip + the HUD's own × must only
// flip tReadout and the panel's visibility. Gated on viewsReady so the chip can't reveal an empty
// panel before both views exist; the panel's content is kept current by afterRebuild.
function setReadout(on){
  tReadout=on;
  const chip=$('tg-readout');
  if(chip){ chip.classList.toggle('on',on); chip.setAttribute('aria-pressed',String(on)); }
  const hud=$('vp-readout'); if(hud) hud.hidden=!(on && viewsReady);
}
function describe(d,v){
  if(!v.showLine) return '';
  const M=resolveLine(d);
  return `True length ${M.tl.toFixed(0)} millimetres. End A is ${d.aHP.toFixed(0)} above HP and ${d.aVP.toFixed(0)} in front of VP. Front view ${M.fvLen.toFixed(0)}, top view ${M.tvLen.toFixed(0)}. True inclinations theta ${M.theta.toFixed(0)} degrees with HP, phi ${M.phi.toFixed(0)} with VP.`;
}

// ── Lesson-specific control wiring ────────────────────────────
function wireControls(a){
  api = a;
  const { getData } = a;

  // A parameter edit makes any active orthographic quick-view stale, so ease the camera
  // back to the 3D orbit first (no-op when no quick-view is lit), then rebuild.
  const editParam = d => { api.exitQuickView?.(); rebuildFromEdit(d); };

  $('r-tl').addEventListener('input',()=>editParam({...getData(),TL:+$('r-tl').value||0}));
  $('r-th').addEventListener('input',()=>editParam({...getData(),theta:+$('r-th').value||0}));
  $('r-ph').addEventListener('input',()=>editParam({...getData(),phi:+$('r-ph').value||0}));
  $('r-ahp').addEventListener('input',()=>editParam({...getData(),aHP:+$('r-ahp').value||0}));
  $('r-avp').addEventListener('input',()=>editParam({...getData(),aVP:+$('r-avp').value||0}));
  [['n-tl','TL',200,'mm'],['n-th','theta',90,'degrees'],['n-ph','phi',90,'degrees'],
   ['n-ahp','aHP',150,'mm'],['n-avp','aVP',150,'mm']].forEach(([n,k,max,unit])=>{
    $(n).addEventListener('change',()=>{
      const val=parseFloat($(n).value);
      if(!isFinite(val)||val<0){                          // invalid: revert to the last value + say so
        const kept=getData()[k]; syncUI(getData(),resolveLine(getData()));
        flowNote(`Kept ${kept} ${unit}`); announce(`Kept your last value, ${kept} ${unit}.`);
      }
      else editParam({...getData(),[k]:Math.min(max,val)});
    });
  });

  const toggle=(id,get,set)=>{
    const el=$(id);
    el.addEventListener('click',()=>{ set(!get()); el.classList.toggle('on',get()); el.setAttribute('aria-pressed',String(get())); rebuildFromEdit(getData()); });
  };
  toggle('tg-lbl',()=>tLabels,v=>tLabels=v);
  toggle('tg-dim',()=>tDims,v=>tDims=v);
  toggle('tg-proj',()=>tProj,v=>tProj=v);
  // The Readout chip + the HUD's own × ONLY toggle the panel's visibility — NOT through the
  // generic toggle() above (which rebuilds). Hiding the panel while the sheet is folded must not
  // tear the fold down, so both route through setReadout (no rebuild, no camera change).
  $('tg-readout').addEventListener('click',()=>setReadout(!tReadout));
  $('vp-readout-hide')?.addEventListener('click',()=>setReadout(false));

  // Relocate the display toggles into the injected viewport cluster (top-left) ABOVE everything,
  // and lift the "Compare 2D drawing" chip above the quick-view chips, so the cluster reads
  // Labels/Dimensions/Projectors → Compare → Top/Front/Side → Readout (Compare is the primary
  // action, so it sits directly above the camera views). The buttons keep their ids, so the wiring
  // above stays attached across the move. Safe here: wireControls runs after chrome injection and
  // before the first renderStep.
  const cluster=document.querySelector('.vp-cluster'), vtoggles=$('view-toggles');
  if(cluster && vtoggles){ cluster.prepend(vtoggles); vtoggles.hidden=false; }
  const compareChip=$('compare-chip'), quickViews=$('quick-views');
  if(cluster && compareChip && quickViews) cluster.insertBefore(compareChip, quickViews);
  // Pull the Readout chip OUT of that display row and drop it at the BOTTOM of the cluster, so it
  // sits below the camera-view chips (the cluster's last child). It keeps its id (so the wiring
  // above stays attached); .vp-cluster is flex-column, so appendChild = bottom of the cluster.
  const tgReadout=$('tg-readout');
  if(cluster && tgReadout) cluster.appendChild(tgReadout);

  // Traces (HT/VT)
  $('btn-traces').addEventListener('click',()=> conMode==='trace' ? exitCon() : enterTrace());
  $('trace-replay').addEventListener('click',()=>{ if(conMode==='trace'){ reduceMotion.matches ? conApply(1) : runConAnim(5400); } });
  // True Length & Angles (Rotating-Line method) + playback transport
  $('btn-tl').addEventListener('click',()=> conMode==='tl' ? exitCon() : enterTL());
  $('tl-play').addEventListener('click',()=>{ if(conMode!=='tl') return; tlPlaying ? pauseTL() : playTL(); });
  $('tl-next').addEventListener('click',()=>{ if(conMode==='tl') stepTL(1); });
  $('tl-prev').addEventListener('click',()=>{ if(conMode==='tl') stepTL(-1); });
  $('tl-replay').addEventListener('click',()=>{ if(conMode!=='tl') return; tlPhase=0; tlPhaseT=0; applyTLState(); playTL(); });
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode:'dual', chap:'lines', steps:STEPS, terms:TERMS,
  tokens:{ construct:'--construct', locus:'--locus', tlg:'--tl-green' },
  defaultData: defaultLineData,
  resolve: resolveLine,
  defaultView:{ showLine:false, showFV:false, showTV:false },
  // Default 3D framing: a 3/4 view from the TOP-LEFT-front (−X = left in the front view), pulled
  // back to ~dist 33 to suit the enlarged 60×60 (600 mm) sheet, target lifted so the subject line
  // centres. The auto-zoom (autoFrame) dollies further out on demand for big lines.
  cam3:{ p:new THREE.Vector3(-21, 16, 21), t:new THREE.Vector3(0, 2, 0) },
  draw3D, draw2D, buildAnimScene, describe,
  // Module-2 camera orchestrator: clip-aware auto-zoom + orthographic quick-views with a
  // perspective↔ortho morph + flattened 2D pans. The quick-views + fold now fit-to-box (no more
  // hard-coded qv poses needed), and contentBox/flatViewBox supply the geometry extents: contentBox
  // spans the line + its four feet (ignoring the big grid); flatViewBox locates the elevation /
  // plan regions on the folded z=0 sheet so Top/Front pan to them.
  autoFrame:true, orthoViews:true,
  // Nudge the A/B/a/b/a′/b′ name chips outward off the line (Module-2 vertexLabeler technique).
  declutterLabels:true,
  contentBox: M => {
    const cx=(M.A.x+M.B.x)/2, ax=W(M.A.x-cx), bx=W(M.B.x-cx);
    const pts=[
      new THREE.Vector3(ax,W(M.A.y),W(M.A.z)), new THREE.Vector3(bx,W(M.B.y),W(M.B.z)),  // A, B
      new THREE.Vector3(ax,W(M.A.y),0),        new THREE.Vector3(bx,W(M.B.y),0),         // a′, b′ (VP feet)
      new THREE.Vector3(ax,0,W(M.A.z)),        new THREE.Vector3(bx,0,W(M.B.z)),         // a, b (HP feet)
      new THREE.Vector3(0,0,0),                                                          // fold-line origin
    ];
    // While the Traces walkthrough is open, fold the on-sheet HT/VT pierce points into the box so
    // the auto-zoom widens to frame them (they often sit beyond the tight line-hugging default).
    if(tShow3DTraces){ const {HT,VT}=traces3DPoints(M);
      if(HT) pts.push(new THREE.Vector3(...HT)); if(VT) pts.push(new THREE.Vector3(...VT)); }
    const b=new THREE.Box3().setFromPoints(pts);
    return b.expandByScalar(0.6);                        // hug the line + feet TIGHT (small margin: still covers the A/B end labels + de-degenerates ⟂ cases, but no further — opens close to the line); auto-zoom centres + pushes back from here
  },
  flatViewBox: (kind,M) => {
    const cx=(M.A.x+M.B.x)/2, ax=W(M.A.x-cx), bx=W(M.B.x-cx);
    const F1=new THREE.Vector3(ax,W(M.A.y),0),  F2=new THREE.Vector3(bx,W(M.B.y),0);     // a′b′ above XY
    const T1=new THREE.Vector3(ax,-W(M.A.z),0), T2=new THREE.Vector3(bx,-W(M.B.z),0);    // ab below XY (post-fold)
    const O1=new THREE.Vector3(ax,0,0), O2=new THREE.Vector3(bx,0,0);
    const pts = kind==='front' ? [F1,F2,O1,O2] : kind==='top' ? [T1,T2,O1,O2] : [F1,F2,T1,T2];
    const b=new THREE.Box3().setFromPoints(pts).expandByScalar(2.2); b.min.z=0; b.max.z=0; return b;
  },
  // Premium viewport chrome: quick-view chips + the first-angle badge during the fold. The
  // Compare chip appears once both views exist; the connector toggle is NOT added here —
  // Lines keeps its own panel "Projectors" (tg-proj) control.
  ui:{ faSymbol:true, quickViews:true },
  // Side-by-side Compare: the chip opens a docked 50/50 split (3D left, 2D drawing right) with the
  // wizard still operable, instead of a floating PiP. compareSplit shrinks #c3d to the left half +
  // docks the card to the right (engine isSplit/layout); compareDefaultSize opens the chip straight
  // into that split and retires the compact-PiP toggle (engine setupCompareCard). The Traces /
  // True-Length constructions (api.compare.show('expanded')) now render in the right pane beside 3D.
  compareSplit:true, compareDefaultSize:'expanded',
  // Compare workbench: while the split is open the wizard is wasted width, so collapse it for a
  // true 50/50 and re-parent these geometry-driver controls into the docked #workbench-rail under
  // both panes — the learner keeps dialling True Length / distances / angles and watches BOTH the
  // 3D and the 2D drawing update live (engine syncWorkbench/enterWorkbench). Points omits this key,
  // so its split is unaffected.
  workbenchControls:['tl','disthp','distvp','theta','phi'],
  compareGate: v => v.showFV && v.showTV,
  // Reset arms a confirm only when there is work to lose (a construction open, or any value off
  // its default); otherwise it resets instantly.
  resetConfirmWhen: d => conMode!==null || d.TL!==DEF.TL || d.theta!==DEF.theta || d.phi!==DEF.phi
                      || d.aHP!==DEF.aHP || d.aVP!==DEF.aVP,
  afterRebuild:(d,ctx)=>{
    syncUI(d,ctx.model); updateReadout(d,ctx.model);
    // HUD shows once both views exist AND the learner turned it on (× / Readout chip). viewsReady
    // is cached so setReadout() can re-gate the panel without a rebuild.
    viewsReady=ctx.view.showFV && ctx.view.showTV;
    const hud=$('vp-readout'); if(hud) hud.hidden=!(tReadout && viewsReady);
  },
  wireControls,
  // Problem Library: controls are dedicated per step (TL on step 1, distance HP/VP on step 2, θ/φ
  // on step 3), so a problem routes to the FIRST step and the learner walks the steps dialling each
  // setup value on its own step. The self-check fires on every rebuild (any step), so it lights green
  // as soon as TL/aHP/aVP/θ/φ all match the target at ±0.5 — no single "solve everything" step needed.
  problems:{ list:PROBLEMS, tiers:TIERS, fieldLabels:FIELD_LABELS,
             entryStep:()=>STEPS.findIndex(s=>s.id==='true-length') },
  // First-seen contextual spotlights (one chip at a time). Tone dots: hp=teal, vp=amber,
  // ink=neutral — colour PLUS label (Two-Cue Rule). Step → id mapping lives in lineSteps.js.
  spotlights:{
    'two-views':   { tone:'ink', text:'Two views per line — a front view on the VP and a top view on the HP.' },
    'foreshorten': { tone:'hp',  text:'Tilt the line and one view shrinks below true length (foreshortened).' },
    'true-length': { tone:'ink', text:'True Length — the real length; in the general case both views are shorter.' },
  },
  beforeRebuild: ()=>{ if(conMode) teardownConUI(); },
  beforeFold:   ()=>{ if(conMode) exitCon(); },
  foldBtn:'btn-fold',
  foldGuard: v => v.showFV && v.showTV,
  foldLabels:{ idle:'▶ Generate Orthographic Projection', refold:'↩ Fold back to 3D', forward:'Generating…', reverse:'Folding…' },
  foldAnnounce:{
    forward:'Top view unfolded onto the vertical plane — the orthographic projection is complete.',
    reverse:'Folded back into the 3D view — the line is restored in space.',
    forwardReduced:'Views unfolded. Showing the 2D drawing.',
    reverseReduced:'Folded back into the 3D view.',
  },
});
