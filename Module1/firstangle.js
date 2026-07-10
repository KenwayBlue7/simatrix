// firstangle.js — orchestrator for Lesson 5 (First-angle projection & the fold),
// built on the shared engine (src/engine.js) in single-window mode: one orbitable 3D
// scene, no 2D PiP, no toggle bar. Its climax is the reversible rabatment: HP swings
// 90° about the xy fold line to lie flat on VP, so the top view ends up below the
// line. This file supplies the lesson's pure data (firstangleSteps), a static draw3D,
// and a buildAnimScene that the engine's fold timeline driver runs; the timeline /
// reversal / camera-stays-put guarantees all live in the engine.
//
// The demonstration point is FIXED in the first quadrant (no sliders) — movable
// points are taught in the Points sim, so here every cue stays on the fold itself and
// on the first-angle symbol fading in as the depth cues dissolve.
//
// World axes (engineering-correct — both planes share the X-axis fold line), copied
// from the Points sim so the static scene and the fold's first frame coincide:
//   HP = XZ plane (y=0)   VP = XY plane (z=0)   fold line = X-axis
//   lateral distRP → X · height distHP → Y · depth distVP → Z (in front of VP = +Z)
import * as THREE from 'three';
import { initSim, apl, alp, asg, asp, acr, acircle, albBox, alb, toW, foldStateAt, planeGrid, mix, LW } from './src/engine.js';
import { resolvePosition } from './src/pointData.js';
import { STEPS, TERMS } from './src/firstangleSteps.js';

// Where the standard first-angle symbol sits on the sheet (z=0 plane, lower-right,
// clear of the point column at x≈0) and how tall it is in world units.
const SYM = { x:3.1, y:-2.8, h:1.1 };

// ── First-angle (truncated-cone) symbol → native fat-line group ───────
// The BIS / ISO mark: a frustum drawn in two views — the side view (a trapezoid,
// large end left) beside the end view (two concentric circles). Drawn natively with
// crisp fat lines (Line2) instead of a canvas Sprite, so it stays razor-sharp at any
// zoom / orbit angle. Authored in the original canvas space (W×H, y-down) and mapped to
// world units, preserving the proven proportions. Returned as a THREE.Group whose child
// line opacities the caller drives (it fades in during the fold; full opacity on the
// result step). col is a token (ink) — no hard-coded hex.
function firstAngleSymbol(g, cx, cy, col, h, op){
  const sym=new THREE.Group(); g.add(sym);
  const W=420, H=210, f=h/H, midY=H/2;                          // uniform scale (W/H matches the box ratio)
  const X=px=>cx+(px-W/2)*f, Y=py=>cy+(H/2-py)*f, R=pr=>pr*f;   // canvas px → world (y flips)
  // Frustum side view (left): trapezoid, large end on the left, small end on the right.
  const lx=46, rx=206, bigH=124, smH=66;
  alp(sym,[[X(lx),Y(midY-bigH/2),0],[X(lx),Y(midY+bigH/2),0],
           [X(rx),Y(midY+smH/2),0], [X(rx),Y(midY-smH/2),0]], col, LW.edge);
  // End view (right): two concentric circles (the cone seen end-on).
  const ccx=326;
  acircle(sym, X(ccx), Y(midY), R(bigH/2), col, LW.edge);
  acircle(sym, X(ccx), Y(midY), R(smH/2),  col, LW.edge);
  // Drive opacity + draw on top of the faint planes (depthTest off, high renderOrder).
  sym.traverse(o=>{ if(o.material){ o.material.transparent=true; o.material.depthTest=false; o.material.opacity=op; o.renderOrder=4; } });
  return sym;
}

// ── Shared scaffolding for the static scene and the fold's frame 0 ─
// Draws the two planes, the fold line, and the HP / VP / XY labels into g.
function drawStage(g, COL){
  const S=9;
  apl(g,S,COL.hp,.10,new THREE.Euler(-Math.PI/2,0,0));          // HP floor (XZ, y=0)
  alp(g,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));                   // VP wall  (XY, z=0)
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                        // fold line (X-axis)
  alb(g,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78); alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  alb(g,'XY',S/2-.5,-.35,0,COL.ink,1.0,.5);
}

// ── 3D scene (static, unfolded) ───────────────────────────────
// The point P (first quadrant) with both perpendicular projectors and p / p′. Its
// geometry matches buildAnimScene's frame 0 so clicking Animate causes no jump. The
// first-angle symbol shows at full opacity only on the result step (view.showSymbol).
function draw3D(g, ctx){
  const { raw, view, COL } = ctx;
  const pos=resolvePosition(raw);
  const q={x:toW(pos.z), y:toW(pos.y), z:toW(pos.x)};           // remap (lateral, height, depth)

  drawStage(g, COL);
  if(view.showSymbol) firstAngleSymbol(g, SYM.x, SYM.y, COL.ink, SYM.h, 1);

  if(!view.showPoint) return;
  asp(g,q.x,q.y,q.z,.16,COL.ink); albBox(g,'P',q.x+.32,q.y+.37,q.z+.2,COL.ink,.3);

  if(view.showHP){
    asg(g,[q.x,q.y,q.z],[q.x,0,q.z],COL.hp,1);                  // HP projector P→foot (dashed)
    asg(g,[q.x,0,q.z],[q.x,0,0],COL.hp,0);                      // foot→fold line (in HP plane)
    acr(g,q.x,0,q.z,.14,COL.hp,true); albBox(g,'p',q.x+.3,.24,q.z,COL.hp,.3);
  }
  if(view.showVP){
    asg(g,[q.x,q.y,q.z],[q.x,q.y,0],COL.vp,1);                  // VP projector P→foot (dashed)
    asg(g,[q.x,q.y,0],[q.x,0,0],COL.vp,1);                      // foot→fold line (in VP plane)
    acr(g,q.x,q.y,0,.14,COL.vp,true); albBox(g,"p'",q.x+.26,q.y+.3,.06,COL.vp,.3);
  }
}

// ── Fold scene (reversible rabatment) ─────────────────────────
// Ported from the Points sim's buildAnimScene + its apply closure, adapted to the
// engine's contract: the engine hands us the freshly-cleared S3 group + ctx, and we
// return { apply(p) } built on the exported foldStateAt(p). Only hpGroup rotates about
// the X hinge; the 3D depth cues (P, its label, the two perpendicular projectors)
// fade out over the last stretch while the first-angle symbol fades in. The camera is
// never touched — the engine's timeline driver guarantees that.
function buildAnimScene(g, ctx){
  const { raw, COL } = ctx;
  const pos=resolvePosition(raw);
  const S=9;
  const ax=toW(pos.z), ay=toW(pos.y), az=toW(pos.x);           // remap lateral, height, depth
  const last=()=>g.children[g.children.length-1];
  const fade=[];

  // VP — XY plane (z=0), stationary
  apl(g,S,COL.vp,.07,new THREE.Euler(0,0,0));
  alp(g,[[-S/2,-S/2,0],[S/2,-S/2,0],[S/2,S/2,0],[-S/2,S/2,0]],COL.vp);
  alb(g,'VP',-3.6,3.7,.05,COL.vp,2.0,.78);
  asg(g,[-S/2,0,0],[S/2,0,0],COL.ink,0);                       // fold line (hinge)

  // p′ on VP (stays in z=0): connector, dot, label — KEEP
  asg(g,[ax,ay,0],[ax,0,0],COL.vp,1);
  acr(g,ax,ay,0,.14,COL.vp,true);
  albBox(g,"p'",ax+.26,ay+.3,.06,COL.vp,.3);

  // Depth cues — FADE: P, its label, VP projector P→p′
  asp(g,ax,ay,az,.16,COL.ink);                  fade.push(last());
  albBox(g,'P',ax+.32,ay+.37,az+.2,COL.ink,.3);  fade.push(last());
  asg(g,[ax,ay,az],[ax,ay,0],COL.vp,1);         fade.push(last());

  // hpGroup — the ONLY thing that rotates (about the X hinge)
  const hpGroup=new THREE.Group(); g.add(hpGroup); hpGroup.rotation.set(0,0,0);
  const hpMesh=new THREE.Mesh(new THREE.PlaneGeometry(S,S),
    new THREE.MeshBasicMaterial({color:new THREE.Color(mix(COL.hp,COL.paper,.72)),transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
  hpMesh.rotation.x=-Math.PI/2; hpMesh.renderOrder=-2; hpGroup.add(hpMesh);   // match apl()'s faint fill (no jump on Animate)
  hpGroup.add(planeGrid(S,COL.hp));                                           // gridded HP folds with the sheet
  alp(hpGroup,[[-S/2,0,-S/2],[S/2,0,-S/2],[S/2,0,S/2],[-S/2,0,S/2]],COL.hp);
  alb(hpGroup,'HP',-3.6,-.3,3.6,COL.hp,2.0,.78);
  acr(hpGroup,ax,0,az,.14,COL.hp,true);
  albBox(hpGroup,'p',ax+.3,.24,az,COL.hp,.3);
  asg(hpGroup,[ax,0,az],[ax,0,0],COL.hp,0);                   // foot → fold line (in HP)

  // HP projector P→foot (dynamic, follows the moving foot) — FADE
  const projGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax,ay,az),new THREE.Vector3(ax,0,az)]);
  const dynProj=new THREE.Line(projGeo,new THREE.LineDashedMaterial({color:new THREE.Color(COL.hp),dashSize:.18,gapSize:.10}));
  dynProj.computeLineDistances(); g.add(dynProj); fade.push(dynProj);
  const footTracker=new THREE.Object3D(); footTracker.position.set(ax,0,az); hpGroup.add(footTracker);

  for(const o of fade){ if(o.material) o.material.transparent=true; }

  // First-angle symbol — fades IN as the depth cues fade out (starts invisible).
  const symbol=firstAngleSymbol(g, SYM.x, SYM.y, COL.ink, SYM.h, 0);

  const tmpV=new THREE.Vector3(), P=[ax,ay,az];
  const apply=p=>{
    const { rot, op }=foldStateAt(p);
    hpGroup.rotation.x=rot;
    for(const o of fade){ if(o.material) o.material.opacity=op; else if(o.element) o.element.style.opacity=op; }
    symbol.traverse(o=>{ if(o.material) o.material.opacity=1-op; });  // inverse ramp — native fat-line group
    footTracker.getWorldPosition(tmpV);
    projGeo.setFromPoints([new THREE.Vector3(...P), tmpV.clone()]);
    dynProj.computeLineDistances();
  };
  return { apply };
}

// ── Screen-reader mirror of the viewport result ───────────────
function describe(d,view){
  if(!view.showPoint) return '';
  if(view.showSymbol)
    return `First-angle projection. The front view p-prime sits ${d.distHP} centimetres above the XY line and the top view p sits ${d.distVP} centimetres below it.`;
  return `Point P is ${d.distHP} centimetres above the horizontal plane and ${d.distVP} centimetres in front of the vertical plane, in the first quadrant.`;
}

// ── Start the lesson ──────────────────────────────────────────
initSim({
  mode: 'single',
  chap: 'firstangle',
  steps: STEPS,
  terms: TERMS,
  defaultData: () => ({ distHP:30, distVP:35, distRP:0, quadrant:'Q1' }),
  defaultView: { showPoint:false, showHP:false, showVP:false, showSymbol:false },
  draw3D,
  buildAnimScene,
  describe,
  foldBtn: 'btn-anim',
  foldLabels: { idle:'▶ Animate the fold', refold:'↩ Fold back to 3D', forward:'Folding…', reverse:'Folding back…' },
  foldAnnounce: {
    forward: 'Horizontal plane folded onto the vertical plane — the first-angle drawing is complete, with the top view below the line.',
    reverse: 'Folded back into the 3D view — the point is restored in space.',
    forwardReduced: 'Planes folded flat. The first-angle drawing is shown, with the top view below the line and the front view above it.',
    reverseReduced: 'Folded back into the 3D view.',
  },
});
